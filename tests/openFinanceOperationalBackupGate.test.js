const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { OpenFinanceLiveStagingVault } = require('../src/openFinance/openFinanceLiveStagingVault');
const { OpenFinanceBaselineStore } = require('../src/openFinance/openFinanceBaselineStore');
const { OpenFinanceAlertOutbox } = require('../src/openFinance/openFinanceAlertOutbox');
const { OpenFinanceShadowPreviewStore } = require('../src/openFinance/openFinanceShadowPreviewStore');
const { runOperationalBackupGate } = require('../scripts/runOpenFinanceOperationalBackupGate');

const secret = 'open-finance-operational-backup-secret-32-bytes';

test('9F operational gate creates a retained backup and destroys only the isolated restore', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-operational-backup-'));
    const files = Object.fromEntries(['staging', 'baseline', 'outbox', 'preview', 'journal', 'secret', 'mappings', 'backups']
        .map(name => [name, path.join(root, name.includes('backup') ? name : `${name}.${['staging','baseline','outbox','preview','journal'].includes(name) ? 'sqlite' : name === 'secret' ? 'txt' : 'json'}`)]));
    fs.writeFileSync(files.secret, secret);
    fs.writeFileSync(files.mappings, JSON.stringify([{ alias: 'daniel_nubank', itemId: 'item-operational-1',
        ownerScope: 'daniel', generation: 1 }]));
    const snapshot = { provider: 'pluggy', mode: 'live_readonly_staging', event_id: 'operational-event',
        observed_at: '2026-07-16T12:00:00.000Z', collection_health: { complete: true, warning_count: 0 },
        items: [{ id: 'item-operational-1', alias_code: 'daniel_nubank', owner_scope: 'daniel', status: 'UPDATED',
            availability: { accounts: 'available', transactions: 'available', bills: 'available', investments: 'available' },
            accounts: [{ id: 'account-1', type: 'BANK', name: 'bank', balance_cents: 0 }],
            transactions: [], bills: [], investments: [] }] };
    const vault = new OpenFinanceLiveStagingVault({ databasePath: files.staging, secret });
    const baseline = new OpenFinanceBaselineStore({ databasePath: files.baseline, secret });
    const outbox = new OpenFinanceAlertOutbox({ databasePath: files.outbox, secret });
    const preview = new OpenFinanceShadowPreviewStore({ databasePath: files.preview, secret });
    vault.ingestSnapshot(snapshot); baseline.ingestSnapshot(snapshot);
    vault.close(); baseline.close(); outbox.close(); preview.close();
    const result = await runOperationalBackupGate({ argv: ['--confirm-encrypted-state-read', '--confirm-isolated-restore'],
        env: { OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: files.secret, OPEN_FINANCE_LIVE_STAGING_DB: files.staging,
            OPEN_FINANCE_BASELINE_DB: files.baseline, OPEN_FINANCE_OUTBOX_DB: files.outbox,
            OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary', OPEN_FINANCE_SHADOW_PREVIEW_DB: files.preview,
            OPEN_FINANCE_REVOCATION_JOURNAL_DB: files.journal, PLUGGY_ITEM_MAP_FILE: files.mappings,
            OPEN_FINANCE_BACKUP_ROOT: files.backups } });
    assert.equal(result.outcome, 'GO'); assert.equal(result.parity, true);
    assert.equal(result.files, 4); assert.equal(result.state.preview.total, 0);
    assert.equal(result.secret_in_backup, false); assert.equal(result.financial_writes, 0);
    const entries = fs.readdirSync(files.backups);
    assert.equal(entries.filter(name => name.startsWith('backup-')).length, 1);
    assert.equal(entries.some(name => name.startsWith('.restore-check-')), false);
});
