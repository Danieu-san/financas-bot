const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { OpenFinanceLiveStagingVault } = require('./openFinanceLiveStagingVault');
const { OpenFinanceBaselineStore } = require('./openFinanceBaselineStore');
const { OpenFinanceAlertOutbox } = require('./openFinanceAlertOutbox');
const { OpenFinanceShadowPreviewStore } = require('./openFinanceShadowPreviewStore');

const FILES_V2 = Object.freeze({
    staging: 'live-staging.sqlite',
    baseline: 'baseline.sqlite',
    outbox: 'outbox.sqlite'
});
const FILES_V3 = Object.freeze({ ...FILES_V2, preview: 'shadow-preview.sqlite' });

function filesForSchema(schema) {
    if (schema === 'open-finance-state-backup-v2') return FILES_V2;
    if (schema === 'open-finance-state-backup-v3') return FILES_V3;
    throw new Error('invalid_open_finance_backup_manifest');
}

function checksum(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function ensureEmptyDirectory(directory) {
    if (fs.existsSync(directory) && fs.readdirSync(directory).length) throw new Error('open_finance_backup_destination_not_empty');
    fs.mkdirSync(directory, { recursive: true });
}

function verifySqlite(file) {
    const db = new Database(file, { readonly: true, fileMustExist: true });
    try {
        const result = db.pragma('integrity_check', { simple: true });
        if (result !== 'ok') throw new Error('open_finance_backup_integrity_failed');
    } finally {
        db.close();
    }
}

function finalizeSqlitePackage(file) {
    const db = new Database(file, { fileMustExist: true });
    try {
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.pragma('journal_mode = DELETE');
    } finally {
        db.close();
    }
    for (const sidecar of [`${file}-wal`, `${file}-shm`]) {
        if (fs.existsSync(sidecar)) fs.rmSync(sidecar);
    }
}

async function createOpenFinanceStateBackup({ databasePaths, destinationDirectory,
    revocationJournal, createdAt = new Date().toISOString(), retentionDays = 30 } = {}) {
    if (!databasePaths || !destinationDirectory) throw new Error('open_finance_backup_paths_required');
    if (!revocationJournal?.checkpoint) throw new Error('open_finance_revocation_journal_required');
    if (!Number.isInteger(retentionDays) || retentionDays < 7 || retentionDays > 90) {
        throw new Error('open_finance_backup_retention_out_of_range');
    }
    const created = new Date(createdAt);
    if (Number.isNaN(created.getTime())) throw new Error('valid_open_finance_backup_time_required');
    const schema = databasePaths.preview
        ? 'open-finance-state-backup-v3'
        : 'open-finance-state-backup-v2';
    const expectedFiles = filesForSchema(schema);
    for (const key of Object.keys(expectedFiles)) {
        if (!databasePaths[key] || !fs.existsSync(databasePaths[key])) throw new Error(`open_finance_${key}_database_unavailable`);
    }
    ensureEmptyDirectory(destinationDirectory);
    const files = [];
    for (const [key, filename] of Object.entries(expectedFiles)) {
        const target = path.join(destinationDirectory, filename);
        const source = new Database(databasePaths[key], { readonly: true, fileMustExist: true });
        try {
            await source.backup(target);
        } finally {
            source.close();
        }
        finalizeSqlitePackage(target);
        fs.chmodSync(target, 0o600);
        verifySqlite(target);
        files.push({ key, filename, bytes: fs.statSync(target).size, sha256: checksum(target) });
    }
    const retentionUntil = new Date(created.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const manifest = {
        schema,
        created_at: created.toISOString(),
        retention_days: retentionDays,
        retention_until: retentionUntil,
        revocation_protection_required: true,
        revocation_checkpoint: revocationJournal.checkpoint(),
        files
    };
    const manifestPath = path.join(destinationDirectory, 'manifest.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    fs.chmodSync(manifestPath, 0o600);
    return { manifest_path: manifestPath, manifest, financial_writes: 0 };
}

function verifyOpenFinanceStateBackup(manifestPath) {
    const directory = path.dirname(path.resolve(manifestPath));
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const expectedFiles = filesForSchema(manifest.schema);
    const createdAt = Date.parse(manifest.created_at);
    const retentionUntil = Date.parse(manifest.retention_until);
    const expectedRetentionUntil = createdAt + Number(manifest.retention_days) * 86400000;
    if (manifest.revocation_protection_required !== true ||
        manifest.revocation_checkpoint?.schema !== 'open-finance-revocation-journal-v1' ||
        !Array.isArray(manifest.files) || manifest.files.length !== Object.keys(expectedFiles).length ||
        !Number.isInteger(manifest.retention_days) || manifest.retention_days < 7 || manifest.retention_days > 90 ||
        !Number.isFinite(createdAt) || !Number.isFinite(retentionUntil) ||
        retentionUntil !== expectedRetentionUntil) {
        throw new Error('invalid_open_finance_backup_manifest');
    }
    const expected = new Set(Object.values(expectedFiles));
    for (const entry of manifest.files) {
        if (expectedFiles[entry.key] !== entry.filename || !expected.delete(entry.filename) ||
            path.basename(entry.filename) !== entry.filename) {
            throw new Error('invalid_open_finance_backup_file');
        }
        const file = path.join(directory, entry.filename);
        if (!fs.existsSync(file) || checksum(file) !== entry.sha256 || fs.statSync(file).size !== entry.bytes) {
            throw new Error('open_finance_backup_checksum_mismatch');
        }
        verifySqlite(file);
    }
    if (expected.size) throw new Error('incomplete_open_finance_backup');
    const allowedFiles = new Set(['manifest.json', ...Object.values(expectedFiles)]);
    if (fs.readdirSync(directory).some(filename => !allowedFiles.has(filename))) {
        throw new Error('unexpected_open_finance_backup_file');
    }
    return { valid: true, retention_until: manifest.retention_until, files: manifest.files.length, financial_writes: 0 };
}

function restoreOpenFinanceStateBackup({ manifestPath, destinationDirectory, revocationJournal,
    mappings = [], secret } = {}) {
    if (!manifestPath || !destinationDirectory) throw new Error('open_finance_restore_paths_required');
    if (!revocationJournal?.reapplyRevocations || String(secret || '').length < 32) {
        throw new Error('open_finance_restore_revocation_protection_required');
    }
    verifyOpenFinanceStateBackup(manifestPath);
    ensureEmptyDirectory(destinationDirectory);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const sourceDirectory = path.dirname(path.resolve(manifestPath));
    const restored = {};
    for (const entry of manifest.files) {
        const target = path.join(destinationDirectory, entry.filename);
        fs.copyFileSync(path.join(sourceDirectory, entry.filename), target, fs.constants.COPYFILE_EXCL);
        fs.chmodSync(target, 0o600);
        verifySqlite(target);
        restored[entry.key] = target;
    }
    let vault; let baseline; let outbox; let preview;
    try {
        vault = new OpenFinanceLiveStagingVault({ databasePath: restored.staging, secret });
        baseline = new OpenFinanceBaselineStore({ databasePath: restored.baseline, secret });
        outbox = new OpenFinanceAlertOutbox({ databasePath: restored.outbox, secret });
        const reapplication = revocationJournal.reapplyRevocations({ mappings, vault, baseline, outbox });
        let previewState = 'absent_legacy';
        let previewRevocations = { removed_previews: 0 };
        let previewRetention = { removed: 0 };
        if (restored.preview) {
            if (!revocationJournal.listRevocations) throw new Error('open_finance_preview_revocation_protection_required');
            preview = new OpenFinanceShadowPreviewStore({ databasePath: restored.preview, secret });
            previewRevocations = preview.reapplyRevocations({ revocations: revocationJournal.listRevocations() });
            previewRetention = preview.purgeExpired();
            previewState = 'restored';
        }
        return { restored, files: manifest.files.length, revocations_reapplied: reapplication.reapplied,
            preview_state: previewState,
            preview_revocations_reapplied: previewRevocations.removed_previews,
            expired_previews_removed: previewRetention.removed,
            financial_writes: 0 };
    } catch (error) {
        try { preview?.close(); } catch {}
        try { outbox?.close(); } catch {}
        try { baseline?.close(); } catch {}
        try { vault?.close(); } catch {}
        fs.rmSync(destinationDirectory, { recursive: true, force: true });
        throw error;
    } finally {
        try { preview?.close(); } catch {}
        try { outbox?.close(); } catch {}
        try { baseline?.close(); } catch {}
        try { vault?.close(); } catch {}
    }
}

function deleteExpiredOpenFinanceBackup({ manifestPath, backupRoot, now = new Date().toISOString(), confirm = false } = {}) {
    if (confirm !== true) throw new Error('open_finance_backup_deletion_confirmation_required');
    if (!backupRoot) throw new Error('open_finance_backup_retention_root_required');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const current = Date.parse(now);
    const expires = Date.parse(manifest.retention_until);
    if (!Number.isFinite(current) || !Number.isFinite(expires) || current < expires) {
        throw new Error('open_finance_backup_not_expired');
    }
    const root = path.resolve(backupRoot || '');
    const directory = path.dirname(path.resolve(manifestPath));
    const relative = path.relative(root, directory);
    if (!root || !relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('open_finance_backup_outside_retention_root');
    }
    verifyOpenFinanceStateBackup(manifestPath);
    fs.rmSync(directory, { recursive: true, force: false });
    return { deleted: true, expired_at: manifest.retention_until, financial_writes: 0 };
}

module.exports = {
    createOpenFinanceStateBackup,
    verifyOpenFinanceStateBackup,
    restoreOpenFinanceStateBackup,
    deleteExpiredOpenFinanceBackup
};
