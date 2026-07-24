const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { OpenFinanceLiveStagingVault } = require('../src/openFinance/openFinanceLiveStagingVault');
const { OpenFinanceBaselineStore } = require('../src/openFinance/openFinanceBaselineStore');
const { OpenFinanceAlertOutbox } = require('../src/openFinance/openFinanceAlertOutbox');
const { OpenFinanceShadowPreviewStore } = require('../src/openFinance/openFinanceShadowPreviewStore');
const { OpenFinanceRevocationJournal } = require('../src/openFinance/openFinanceRevocationJournal');
const { openFinanceConsentRuntime } = require('../src/openFinance/openFinanceConsentRuntime');
const { observationRef } = require('../src/openFinance/openFinanceRuntimeReconciliation');
const { runOperationalBackupGate } = require('../scripts/runOpenFinanceOperationalBackupGate');

const secret = 'open-finance-operational-backup-secret-32-bytes';
const actorWhatsappId = 'operational-family-actor@c.us';

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
            transactions: [
                { id: 'transaction-1', provider_id: 'provider-1', account_id: 'account-1',
                    amount_cents: 100, description: 'PRIVATE PENDING PROPOSAL',
                    date: '2026-07-16T10:00:00.000Z', status: 'POSTED' },
                { id: 'transaction-2', provider_id: 'provider-2', account_id: 'account-1',
                    amount_cents: 200, description: 'PRIVATE CANCELLED PROPOSAL',
                    date: '2026-07-16T11:00:00.000Z', status: 'POSTED' }
            ], bills: [], investments: [] }] };
    const vault = new OpenFinanceLiveStagingVault({ databasePath: files.staging, secret });
    const baseline = new OpenFinanceBaselineStore({ databasePath: files.baseline, secret });
    const outbox = new OpenFinanceAlertOutbox({ databasePath: files.outbox, secret });
    const preview = new OpenFinanceShadowPreviewStore({
        databasePath: files.preview,
        secret,
        authorizedWhatsAppIds: [actorWhatsappId],
        clock: () => '2026-07-16T12:00:00.000Z'
    });
    vault.ingestSnapshot(snapshot); baseline.ingestSnapshot(snapshot);
    const refs = snapshot.items[0].transactions.map(row =>
        observationRef(secret, snapshot.items[0].id, row.account_id, row.id));
    preview.ingestSaveProposals({
        reconciliationDecisions: refs.map((ref, index) => ({
            observation_ref: ref,
            transaction_ref: `operational-transaction-ref-${index + 1}`,
            status: 'new',
            rule: 'no_candidate'
        })),
        lifecycleDecisions: refs.map(ref => ({
            observation_ref: ref,
            classification: 'purchase',
            provider_state: 'POSTED'
        })),
        openFinanceItems: [{ ...snapshot.items[0], generation: 1 }],
        policies: [{ alias: 'daniel_nubank', write_confirmation_principal: 'daniel' }],
        observedAt: '2026-07-16T12:00:00.000Z'
    });
    const proposals = preview.listPendingSaveProposals({ actorWhatsappId });
    preview.cancelSaveProposal(proposals[1].proposal_ref, { actorWhatsappId });
    vault.close(); baseline.close(); outbox.close(); preview.close();
    const result = await runOperationalBackupGate({ argv: ['--confirm-encrypted-state-read', '--confirm-isolated-restore'],
        env: { OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: files.secret, OPEN_FINANCE_LIVE_STAGING_DB: files.staging,
            OPEN_FINANCE_BASELINE_DB: files.baseline, OPEN_FINANCE_OUTBOX_DB: files.outbox,
            OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary', OPEN_FINANCE_SHADOW_PREVIEW_DB: files.preview,
            OPEN_FINANCE_REVOCATION_JOURNAL_DB: files.journal, PLUGGY_ITEM_MAP_FILE: files.mappings,
            OPEN_FINANCE_BACKUP_ROOT: files.backups } });
    assert.equal(result.outcome, 'GO'); assert.equal(result.parity, true);
    assert.equal(result.files, 4); assert.equal(result.state.preview.total, 0);
    assert.equal(result.state.preview.save_proposals_total, 2);
    assert.equal(result.state.preview.save_proposals_pending, 1);
    assert.equal(result.state.preview.save_proposals_cancelled, 1);
    assert.equal(result.secret_in_backup, false); assert.equal(result.financial_writes, 0);
    assert.deepEqual(result.revocation_integration, { tested: true, mode_forwarded: true,
        preview_supplied: true, journal_recorded: true, financial_writes: 0 });
    const entries = fs.readdirSync(files.backups);
    assert.equal(entries.filter(name => name.startsWith('backup-')).length, 1);
    assert.equal(entries.some(name => name.startsWith('.restore-check-')), false);
    const journal = new OpenFinanceRevocationJournal({ databasePath: files.journal, secret });
    try { assert.equal(journal.listRevocations().length, 0); } finally { journal.close(); }
});

test('consent runtime closes every store once in reverse order even when one close fails', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-consent-runtime-'));
    const names = ['staging', 'baseline', 'outbox', 'journal', 'preview'];
    const paths = Object.fromEntries(names.map(name => [name, path.join(root, `${name}.sqlite`)]));
    for (const file of Object.values(paths)) fs.writeFileSync(file, '');
    const secretFile = path.join(root, 'secret.txt');
    fs.writeFileSync(secretFile, secret);
    const closed = [];
    const Store = name => class {
        close() {
            closed.push(name);
            if (name === 'preview') throw new Error('preview_close_failed');
        }
    };
    const runtime = openFinanceConsentRuntime({
        env: {
            OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: secretFile,
            OPEN_FINANCE_LIVE_STAGING_DB: paths.staging,
            OPEN_FINANCE_BASELINE_DB: paths.baseline,
            OPEN_FINANCE_OUTBOX_DB: paths.outbox,
            OPEN_FINANCE_REVOCATION_JOURNAL_DB: paths.journal,
            OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary',
            OPEN_FINANCE_SHADOW_PREVIEW_DB: paths.preview
        },
        dependencies: {
            OpenFinanceLiveStagingVault: Store('staging'),
            OpenFinanceBaselineStore: Store('baseline'),
            OpenFinanceAlertOutbox: Store('outbox'),
            OpenFinanceRevocationJournal: Store('journal'),
            OpenFinanceShadowPreviewStore: Store('preview')
        }
    });
    assert.throws(() => runtime.close(), /preview_close_failed/);
    assert.deepEqual(closed, ['preview', 'journal', 'outbox', 'baseline', 'staging']);
    assert.doesNotThrow(() => runtime.close());
    assert.equal(closed.length, 5);
});
