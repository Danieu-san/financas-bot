const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { OpenFinanceLiveStagingVault } = require('../src/openFinance/openFinanceLiveStagingVault');
const { OpenFinanceBaselineStore } = require('../src/openFinance/openFinanceBaselineStore');
const { OpenFinanceAlertOutbox } = require('../src/openFinance/openFinanceAlertOutbox');
const {
    createOpenFinanceStateBackup,
    verifyOpenFinanceStateBackup,
    restoreOpenFinanceStateBackup,
    deleteExpiredOpenFinanceBackup
} = require('../src/openFinance/openFinanceStateBackup');

const secret = 'open-finance-backup-test-secret-32-bytes';

function buildSnapshot() {
    return {
        provider: 'pluggy', mode: 'live_readonly_staging', event_id: 'backup-event',
        observed_at: '2026-07-16T12:00:00.000Z', collection_health: { complete: true, warning_count: 0 },
        items: [{ id: 'private-item', alias_code: 'daniel_nubank', owner_scope: 'daniel',
            availability: { accounts: 'available', transactions: 'available', bills: 'available', investments: 'available' },
            accounts: [{ id: 'private-account', type: 'BANK', name: 'private', balance_cents: 100 }],
            transactions: [{ id: 'private-transaction', provider_id: 'private-provider', account_id: 'private-account',
                amount_cents: 100, description: 'PRIVATE BACKUP DESCRIPTION', date: '2026-07-16T10:00:00.000Z',
                status: 'POSTED', currency: 'BRL' }], bills: [], investments: [] }]
    };
}

test('9F backup is consistent, verifiable, restorable and encrypted at rest', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-open-backup-'));
    const databasePaths = Object.fromEntries(['staging', 'baseline', 'outbox'].map(key => [key, path.join(root, `${key}.sqlite`)]));
    const snapshot = buildSnapshot();
    const vault = new OpenFinanceLiveStagingVault({ databasePath: databasePaths.staging, secret });
    const baseline = new OpenFinanceBaselineStore({ databasePath: databasePaths.baseline, secret });
    const outbox = new OpenFinanceAlertOutbox({ databasePath: databasePaths.outbox, secret });
    vault.ingestSnapshot(snapshot);
    baseline.ingestSnapshot(snapshot);
    vault.close(); baseline.close(); outbox.close();

    const backupDirectory = path.join(root, 'backups', 'backup-1');
    const backup = await createOpenFinanceStateBackup({ databasePaths, destinationDirectory: backupDirectory,
        createdAt: '2026-07-01T00:00:00.000Z', retentionDays: 30 });
    assert.deepEqual(verifyOpenFinanceStateBackup(backup.manifest_path), {
        valid: true, retention_until: '2026-07-31T00:00:00.000Z', files: 3, financial_writes: 0
    });
    for (const entry of backup.manifest.files) {
        assert.equal(fs.readFileSync(path.join(backupDirectory, entry.filename)).toString('latin1')
            .includes('PRIVATE BACKUP DESCRIPTION'), false);
    }

    const restoreDirectory = path.join(root, 'restore');
    const restored = restoreOpenFinanceStateBackup({ manifestPath: backup.manifest_path, destinationDirectory: restoreDirectory });
    const restoredVault = new OpenFinanceLiveStagingVault({ databasePath: restored.restored.staging, secret });
    const restoredBaseline = new OpenFinanceBaselineStore({ databasePath: restored.restored.baseline, secret });
    const restoredOutbox = new OpenFinanceAlertOutbox({ databasePath: restored.restored.outbox, secret });
    try {
        assert.equal(restoredVault.stats().items, 1);
        assert.equal(restoredBaseline.stats().observations, 1);
        assert.equal(restoredOutbox.stats().total, 0);
    } finally {
        restoredOutbox.close(); restoredBaseline.close(); restoredVault.close();
    }

    assert.throws(() => deleteExpiredOpenFinanceBackup({ manifestPath: backup.manifest_path,
        backupRoot: path.join(root, 'backups'), now: '2026-07-30T00:00:00.000Z', confirm: true }), /not_expired/);
    assert.equal(deleteExpiredOpenFinanceBackup({ manifestPath: backup.manifest_path,
        backupRoot: path.join(root, 'backups'), now: '2026-08-01T00:00:00.000Z', confirm: true }).deleted, true);
    assert.equal(fs.existsSync(backupDirectory), false);
});

test('9F backup verification fails closed after tampering', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-open-backup-tamper-'));
    const databasePaths = Object.fromEntries(['staging', 'baseline', 'outbox'].map(key => [key, path.join(root, `${key}.sqlite`)]));
    new OpenFinanceLiveStagingVault({ databasePath: databasePaths.staging, secret }).close();
    new OpenFinanceBaselineStore({ databasePath: databasePaths.baseline, secret }).close();
    new OpenFinanceAlertOutbox({ databasePath: databasePaths.outbox, secret }).close();
    const backup = await createOpenFinanceStateBackup({ databasePaths,
        destinationDirectory: path.join(root, 'backups', 'backup-1') });
    fs.appendFileSync(path.join(path.dirname(backup.manifest_path), 'baseline.sqlite'), 'tamper');
    assert.throws(() => verifyOpenFinanceStateBackup(backup.manifest_path), /checksum_mismatch/);
});
