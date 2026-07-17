const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { OpenFinanceLiveStagingVault } = require('../src/openFinance/openFinanceLiveStagingVault');
const { OpenFinanceBaselineStore } = require('../src/openFinance/openFinanceBaselineStore');
const { OpenFinanceAlertOutbox } = require('../src/openFinance/openFinanceAlertOutbox');
const { OpenFinanceRevocationJournal } = require('../src/openFinance/openFinanceRevocationJournal');
const { OpenFinanceShadowPreviewStore } = require('../src/openFinance/openFinanceShadowPreviewStore');
const { revokeOpenFinanceConsent } = require('../src/openFinance/openFinanceConsentLifecycle');
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
    const journal = new OpenFinanceRevocationJournal({ secret });
    vault.ingestSnapshot(snapshot);
    baseline.ingestSnapshot(snapshot);
    vault.close(); baseline.close(); outbox.close();

    const backupDirectory = path.join(root, 'backups', 'backup-1');
    const backup = await createOpenFinanceStateBackup({ databasePaths, destinationDirectory: backupDirectory, revocationJournal: journal,
        createdAt: '2026-07-01T00:00:00.000Z', retentionDays: 30 });
    assert.deepEqual(verifyOpenFinanceStateBackup(backup.manifest_path), {
        valid: true, retention_until: '2026-07-31T00:00:00.000Z', files: 3, financial_writes: 0
    });
    for (const entry of backup.manifest.files) {
        assert.equal(fs.readFileSync(path.join(backupDirectory, entry.filename)).toString('latin1')
            .includes('PRIVATE BACKUP DESCRIPTION'), false);
    }

    const restoreDirectory = path.join(root, 'restore');
    const restored = restoreOpenFinanceStateBackup({ manifestPath: backup.manifest_path,
        destinationDirectory: restoreDirectory, revocationJournal: journal,
        mappings: [{ alias: 'daniel_nubank', itemId: 'private-item', generation: 1 }], secret });
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
    journal.close();
});

test('9F backup verification fails closed after tampering', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-open-backup-tamper-'));
    const databasePaths = Object.fromEntries(['staging', 'baseline', 'outbox'].map(key => [key, path.join(root, `${key}.sqlite`)]));
    new OpenFinanceLiveStagingVault({ databasePath: databasePaths.staging, secret }).close();
    new OpenFinanceBaselineStore({ databasePath: databasePaths.baseline, secret }).close();
    new OpenFinanceAlertOutbox({ databasePath: databasePaths.outbox, secret }).close();
    const journal = new OpenFinanceRevocationJournal({ secret });
    const backup = await createOpenFinanceStateBackup({ databasePaths,
        destinationDirectory: path.join(root, 'backups', 'backup-1'), revocationJournal: journal });
    fs.appendFileSync(path.join(path.dirname(backup.manifest_path), 'baseline.sqlite'), 'tamper');
    assert.throws(() => verifyOpenFinanceStateBackup(backup.manifest_path), /checksum_mismatch/);
    journal.close();
});

test('9F restore of a pre-revocation backup reapplies the monotonic journal before exposing state', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-open-backup-revoked-'));
    const databasePaths = Object.fromEntries(['staging', 'baseline', 'outbox'].map(key => [key, path.join(root, `${key}.sqlite`)]));
    const journal = new OpenFinanceRevocationJournal({ databasePath: path.join(root, 'revocations.sqlite'), secret });
    const sourceSnapshot = buildSnapshot();
    let vault = new OpenFinanceLiveStagingVault({ databasePath: databasePaths.staging, secret });
    let baseline = new OpenFinanceBaselineStore({ databasePath: databasePaths.baseline, secret });
    let outbox = new OpenFinanceAlertOutbox({ databasePath: databasePaths.outbox, secret });
    vault.ingestSnapshot(sourceSnapshot); baseline.ingestSnapshot(sourceSnapshot);
    vault.close(); baseline.close(); outbox.close();

    const backup = await createOpenFinanceStateBackup({ databasePaths,
        destinationDirectory: path.join(root, 'backup-before-revocation'), revocationJournal: journal });
    vault = new OpenFinanceLiveStagingVault({ databasePath: databasePaths.staging, secret });
    baseline = new OpenFinanceBaselineStore({ databasePath: databasePaths.baseline, secret });
    outbox = new OpenFinanceAlertOutbox({ databasePath: databasePaths.outbox, secret });
    revokeOpenFinanceConsent({ alias: 'daniel_nubank', itemId: 'private-item', generation: 1,
        vault, baseline, outbox, journal, revokedAt: '2026-07-16T13:00:00.000Z' });
    vault.close(); baseline.close(); outbox.close();

    const restored = restoreOpenFinanceStateBackup({ manifestPath: backup.manifest_path,
        destinationDirectory: path.join(root, 'restored-old-backup'), revocationJournal: journal,
        mappings: [{ alias: 'daniel_nubank', itemId: 'private-item', generation: 1 }], secret });
    assert.equal(restored.revocations_reapplied, 1);
    vault = new OpenFinanceLiveStagingVault({ databasePath: restored.restored.staging, secret });
    baseline = new OpenFinanceBaselineStore({ databasePath: restored.restored.baseline, secret });
    outbox = new OpenFinanceAlertOutbox({ databasePath: restored.restored.outbox, secret });
    try {
        assert.equal(vault.stats().items, 0);
        assert.equal(baseline.stats().observations, 0);
        assert.equal(outbox.stats().total, 0);
        assert.equal(baseline.isConnectionRevoked('daniel_nubank'), true);
        assert.equal(outbox.isSourceRevoked('daniel_nubank'), true);
        assert.equal(vault.ingestSnapshot({ ...sourceSnapshot, event_id: 'delayed-after-restore' }).blocked_items, 1);
    } finally {
        outbox.close(); baseline.close(); vault.close(); journal.close();
    }
});

test('9F v3 backup restores preview only after revocation and retention protection', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-open-backup-v3-'));
    const databasePaths = Object.fromEntries(['staging', 'baseline', 'outbox', 'preview']
        .map(key => [key, path.join(root, `${key}.sqlite`)]));
    new OpenFinanceLiveStagingVault({ databasePath: databasePaths.staging, secret }).close();
    new OpenFinanceBaselineStore({ databasePath: databasePaths.baseline, secret }).close();
    new OpenFinanceAlertOutbox({ databasePath: databasePaths.outbox, secret }).close();
    const journal = new OpenFinanceRevocationJournal({ databasePath: path.join(root, 'journal.sqlite'), secret });
    const preview = new OpenFinanceShadowPreviewStore({ databasePath: databasePaths.preview, secret });
    const source = buildSnapshot().items[0];
    const transactionRef = require('node:crypto').createHmac('sha256', secret)
        .update(`${source.id}:${source.transactions[0].id}`).digest('hex').slice(0, 32);
    preview.ingest({
        decisions: [{ transaction_ref: transactionRef, status: 'uncertain',
            rule: 'manual_review', confidence_band: 'low' }],
        openFinanceItems: [{ ...source, generation: 1 }],
        canonicalTransactions: []
    });
    preview.close();

    const backup = await createOpenFinanceStateBackup({
        databasePaths,
        destinationDirectory: path.join(root, 'backup-v3'),
        revocationJournal: journal
    });
    assert.equal(backup.manifest.schema, 'open-finance-state-backup-v3');
    assert.equal(verifyOpenFinanceStateBackup(backup.manifest_path).files, 4);
    journal.recordRevocation({ alias: 'daniel_nubank', generation: 1 });

    const restored = restoreOpenFinanceStateBackup({
        manifestPath: backup.manifest_path,
        destinationDirectory: path.join(root, 'restore-v3'),
        revocationJournal: journal,
        mappings: [{ alias: 'daniel_nubank', itemId: 'private-item', generation: 1 }],
        secret
    });
    assert.equal(restored.preview_state, 'restored');
    assert.equal(restored.preview_revocations_reapplied, 1);
    const restoredPreview = new OpenFinanceShadowPreviewStore({
        databasePath: restored.restored.preview,
        secret
    });
    try {
        assert.equal(restoredPreview.stats().total, 0);
    } finally { restoredPreview.close(); journal.close(); }
});
