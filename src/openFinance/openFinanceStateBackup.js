const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const FILES = Object.freeze({
    staging: 'live-staging.sqlite',
    baseline: 'baseline.sqlite',
    outbox: 'outbox.sqlite'
});

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

async function createOpenFinanceStateBackup({ databasePaths, destinationDirectory,
    createdAt = new Date().toISOString(), retentionDays = 30 } = {}) {
    if (!databasePaths || !destinationDirectory) throw new Error('open_finance_backup_paths_required');
    if (!Number.isInteger(retentionDays) || retentionDays < 7 || retentionDays > 90) {
        throw new Error('open_finance_backup_retention_out_of_range');
    }
    const created = new Date(createdAt);
    if (Number.isNaN(created.getTime())) throw new Error('valid_open_finance_backup_time_required');
    for (const key of Object.keys(FILES)) {
        if (!databasePaths[key] || !fs.existsSync(databasePaths[key])) throw new Error(`open_finance_${key}_database_unavailable`);
    }
    ensureEmptyDirectory(destinationDirectory);
    const files = [];
    for (const [key, filename] of Object.entries(FILES)) {
        const target = path.join(destinationDirectory, filename);
        const source = new Database(databasePaths[key], { readonly: true, fileMustExist: true });
        try {
            await source.backup(target);
        } finally {
            source.close();
        }
        fs.chmodSync(target, 0o600);
        verifySqlite(target);
        files.push({ key, filename, bytes: fs.statSync(target).size, sha256: checksum(target) });
    }
    const retentionUntil = new Date(created.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const manifest = {
        schema: 'open-finance-state-backup-v1',
        created_at: created.toISOString(),
        retention_days: retentionDays,
        retention_until: retentionUntil,
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
    if (manifest.schema !== 'open-finance-state-backup-v1' || !Array.isArray(manifest.files) || manifest.files.length !== 3) {
        throw new Error('invalid_open_finance_backup_manifest');
    }
    const expected = new Set(Object.values(FILES));
    for (const entry of manifest.files) {
        if (FILES[entry.key] !== entry.filename || !expected.delete(entry.filename) ||
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
    return { valid: true, retention_until: manifest.retention_until, files: manifest.files.length, financial_writes: 0 };
}

function restoreOpenFinanceStateBackup({ manifestPath, destinationDirectory } = {}) {
    if (!manifestPath || !destinationDirectory) throw new Error('open_finance_restore_paths_required');
    verifyOpenFinanceStateBackup(manifestPath);
    ensureEmptyDirectory(destinationDirectory);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const sourceDirectory = path.dirname(path.resolve(manifestPath));
    const restored = {};
    for (const entry of manifest.files) {
        const target = path.join(destinationDirectory, entry.filename);
        fs.copyFileSync(path.join(sourceDirectory, entry.filename), target, fs.constants.COPYFILE_EXCL);
        verifySqlite(target);
        restored[entry.key] = target;
    }
    return { restored, files: manifest.files.length, financial_writes: 0 };
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
