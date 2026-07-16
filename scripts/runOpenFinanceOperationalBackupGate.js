const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();
const { OpenFinanceLiveStagingVault } = require('../src/openFinance/openFinanceLiveStagingVault');
const { OpenFinanceBaselineStore } = require('../src/openFinance/openFinanceBaselineStore');
const { OpenFinanceAlertOutbox } = require('../src/openFinance/openFinanceAlertOutbox');
const { OpenFinanceRevocationJournal } = require('../src/openFinance/openFinanceRevocationJournal');
const {
    createOpenFinanceStateBackup,
    verifyOpenFinanceStateBackup,
    restoreOpenFinanceStateBackup
} = require('../src/openFinance/openFinanceStateBackup');

function requiredFile(value, reason) {
    const file = String(value || '');
    if (!file || !fs.existsSync(file)) throw new Error(reason);
    return file;
}

function publicStats({ staging, baseline, outbox }) {
    const vault = new OpenFinanceLiveStagingVault({ databasePath: staging.path, secret: staging.secret });
    const baselineStore = new OpenFinanceBaselineStore({ databasePath: baseline.path, secret: baseline.secret });
    const outboxStore = new OpenFinanceAlertOutbox({ databasePath: outbox.path, secret: outbox.secret });
    try {
        const vaultStats = vault.stats();
        const baselineStats = baselineStore.stats();
        const outboxStats = outboxStore.stats();
        return {
            staging: { items: vaultStats.items, transactions: vaultStats.transactions, revocations: vaultStats.revocations },
            baseline: { connections: baselineStats.connections, observations: baselineStats.observations,
                candidates: baselineStats.candidates },
            outbox: { total: outboxStats.total, pending: outboxStats.pending,
                accepted_unconfirmed: outboxStats.accepted_unconfirmed,
                delivered_confirmed: outboxStats.delivered_confirmed, legacy_sent: outboxStats.legacy_sent,
                blocked: outboxStats.blocked }
        };
    } finally { outboxStore.close(); baselineStore.close(); vault.close(); }
}

async function runOperationalBackupGate({ env = process.env, argv = process.argv.slice(2) } = {}) {
    if (!argv.includes('--confirm-encrypted-state-read') || !argv.includes('--confirm-isolated-restore')) {
        throw new Error('operational_backup_confirmation_required');
    }
    const secretFile = requiredFile(env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE, 'open_finance_secret_unavailable');
    const secret = fs.readFileSync(secretFile, 'utf8').trim();
    if (secret.length < 32) throw new Error('open_finance_secret_invalid');
    const databasePaths = {
        staging: requiredFile(env.OPEN_FINANCE_LIVE_STAGING_DB, 'open_finance_staging_unavailable'),
        baseline: requiredFile(env.OPEN_FINANCE_BASELINE_DB, 'open_finance_baseline_unavailable'),
        outbox: requiredFile(env.OPEN_FINANCE_OUTBOX_DB, 'open_finance_outbox_unavailable')
    };
    const journalPath = String(env.OPEN_FINANCE_REVOCATION_JOURNAL_DB || '');
    if (!journalPath) throw new Error('open_finance_revocation_journal_unavailable');
    const mappings = JSON.parse(fs.readFileSync(requiredFile(env.PLUGGY_ITEM_MAP_FILE, 'item_mapping_unavailable'), 'utf8'));
    const backupRoot = String(env.OPEN_FINANCE_BACKUP_ROOT || '');
    if (!backupRoot) throw new Error('open_finance_backup_root_required');
    fs.mkdirSync(backupRoot, { recursive: true });
    fs.chmodSync(backupRoot, 0o700);
    const journal = new OpenFinanceRevocationJournal({ databasePath: journalPath, secret });
    const runRef = crypto.randomBytes(8).toString('hex');
    const backupDirectory = path.join(backupRoot, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${runRef}`);
    const restoreDirectory = path.join(backupRoot, `.restore-check-${runRef}`);
    try {
        const before = publicStats({ staging: { path: databasePaths.staging, secret },
            baseline: { path: databasePaths.baseline, secret }, outbox: { path: databasePaths.outbox, secret } });
        const backup = await createOpenFinanceStateBackup({ databasePaths, destinationDirectory: backupDirectory,
            revocationJournal: journal, retentionDays: 30 });
        const verified = verifyOpenFinanceStateBackup(backup.manifest_path);
        const restored = restoreOpenFinanceStateBackup({ manifestPath: backup.manifest_path,
            destinationDirectory: restoreDirectory, revocationJournal: journal, mappings, secret });
        const after = publicStats({ staging: { path: restored.restored.staging, secret },
            baseline: { path: restored.restored.baseline, secret }, outbox: { path: restored.restored.outbox, secret } });
        if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('open_finance_operational_restore_parity_failed');
        const secretBytes = Buffer.from(secret);
        const secretFound = backup.manifest.files.some(entry =>
            fs.readFileSync(path.join(backupDirectory, entry.filename)).includes(secretBytes));
        if (secretFound) throw new Error('open_finance_secret_found_in_backup');
        return {
            outcome: 'GO', backup_ref: runRef, files: verified.files,
            retention_until: verified.retention_until,
            revocations_reapplied: restored.revocations_reapplied,
            parity: true, secret_in_backup: false, restore_cleanup: true,
            state: before, financial_writes: 0
        };
    } finally {
        if (fs.existsSync(restoreDirectory)) fs.rmSync(restoreDirectory, { recursive: true, force: true });
        journal.close();
    }
}

if (require.main === module) {
    runOperationalBackupGate().then(result => {
        console.log(`[open-finance-operational-backup] ${JSON.stringify(result)}`);
    }).catch(error => {
        console.error(`[open-finance-operational-backup] NO_GO reason=${String(error.message || 'unknown').replace(/[^a-z0-9_-]/gi, '_').slice(0, 96)}`);
        process.exitCode = 1;
    });
}

module.exports = { runOperationalBackupGate };
