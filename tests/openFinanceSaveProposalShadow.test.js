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
const { observationRef } = require('../src/openFinance/openFinanceRuntimeReconciliation');
const { runOpenFinanceCanaryCycle, saveProposalMode } = require('../src/openFinance/openFinanceCanaryRuntime');

const secret = 'open-finance-save-proposal-shadow-secret';
const actorWhatsappId = 'family-actor@c.us';

function transaction(id, {
    amountCents = 2590,
    description = 'PRIVATE PROPOSAL DESCRIPTION',
    status = 'POSTED'
} = {}) {
    return {
        id,
        provider_id: `provider-${id}`,
        account_id: 'credit-account',
        amount_cents: amountCents,
        description,
        date: '2026-07-23T10:00:00.000Z',
        status
    };
}

function fixture() {
    const item = {
        id: 'private-item-id',
        alias_code: 'daniel_nubank',
        owner_scope: 'daniel',
        generation: 2,
        accounts: [{ id: 'credit-account', type: 'CREDIT' }],
        transactions: [
            transaction('purchase-posted'),
            transaction('purchase-pending', { status: 'PENDING' }),
            transaction('refund-posted', { amountCents: -2590 }),
            transaction('matched-posted')
        ]
    };
    const refs = Object.fromEntries(item.transactions.map(row => [
        row.id,
        observationRef(secret, item.id, row.account_id, row.id)
    ]));
    const reconciliationDecisions = item.transactions.map(row => ({
        alias: item.alias_code,
        observation_ref: refs[row.id],
        transaction_ref: `transaction-ref-${row.id}`,
        status: row.id === 'matched-posted' ? 'matched' : 'new',
        rule: row.id === 'matched-posted' ? 'amount_date_description' : 'no_candidate'
    }));
    const lifecycleDecisions = [
        { observation_ref: refs['purchase-posted'], classification: 'purchase', provider_state: 'POSTED' },
        { observation_ref: refs['purchase-pending'], classification: 'purchase', provider_state: 'PENDING' },
        { observation_ref: refs['refund-posted'], classification: 'refund', provider_state: 'POSTED' },
        { observation_ref: refs['matched-posted'], classification: 'purchase', provider_state: 'POSTED' }
    ];
    return {
        item,
        refs,
        reconciliationDecisions,
        lifecycleDecisions,
        policies: [{
            alias: 'daniel_nubank',
            write_confirmation_principal: 'daniel'
        }]
    };
}

function openStore(databasePath, clock = () => new Date('2026-07-23T12:00:00.000Z')) {
    return new OpenFinanceShadowPreviewStore({
        databasePath,
        secret,
        authorizedWhatsAppIds: [actorWhatsappId],
        clock
    });
}

test('9P.0 proposal mode is dark by default and refuses premature canary activation', () => {
    assert.equal(saveProposalMode({}), 'off');
    assert.equal(saveProposalMode({ OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'shadow' }), 'shadow');
    assert.throws(() => saveProposalMode({ OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'canary' }),
        /invalid_open_finance_save_proposal_mode/);
    assert.throws(() => saveProposalMode({ OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'on' }),
        /invalid_open_finance_save_proposal_mode/);
});

test('9P.0 persists only reconciled posted purchases and never reopens a cancelled proposal', () => {
    const databasePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-save-proposal-')), 'preview.sqlite');
    const input = fixture();
    const store = openStore(databasePath);
    try {
        const first = store.ingestSaveProposals({
            reconciliationDecisions: input.reconciliationDecisions,
            lifecycleDecisions: input.lifecycleDecisions,
            openFinanceItems: [input.item],
            policies: input.policies,
            observedAt: '2026-07-23T11:00:00.000Z'
        });
        assert.deepEqual(first, {
            inserted: 1,
            replayed: 0,
            blocked: 3,
            pending: 1,
            financial_writes: 0
        });
        const [pending] = store.listPendingSaveProposals({ actorWhatsappId });
        assert.match(pending.proposal_ref, /^[a-f0-9]{32}$/);
        const privateProposal = store.readSaveProposalPrivate(pending.proposal_ref, { actorWhatsappId });
        assert.equal(privateProposal.alias, 'daniel_nubank');
        assert.equal(privateProposal.classification, 'purchase');
        assert.equal(privateProposal.provider_state, 'POSTED');
        assert.equal(privateProposal.source.description, 'PRIVATE PROPOSAL DESCRIPTION');
        assert.match(privateProposal.operation_key, /^[a-f0-9]{48}$/);

        assert.deepEqual(store.cancelSaveProposal(pending.proposal_ref, { actorWhatsappId }), {
            cancelled: true,
            replay: false,
            financial_writes: 0
        });
        const replay = store.ingestSaveProposals({
            reconciliationDecisions: input.reconciliationDecisions,
            lifecycleDecisions: input.lifecycleDecisions,
            openFinanceItems: [input.item],
            policies: input.policies,
            observedAt: '2026-07-23T11:00:00.000Z'
        });
        assert.equal(replay.inserted, 0);
        assert.equal(replay.replayed, 1);
        assert.equal(store.listPendingSaveProposals({ actorWhatsappId }).length, 0);
        assert.equal(store.stats().save_proposals_cancelled, 1);
    } finally {
        store.close();
    }
});

test('9P.0 proposal payload is encrypted, actor-scoped, revocable and expires without extension on replay', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-save-proposal-private-'));
    const databasePath = path.join(directory, 'preview.sqlite');
    const input = fixture();
    let now = new Date('2026-07-23T12:00:00.000Z');
    let store = openStore(databasePath, () => now);
    try {
        store.ingestSaveProposals({
            reconciliationDecisions: input.reconciliationDecisions,
            lifecycleDecisions: input.lifecycleDecisions,
            openFinanceItems: [input.item],
            policies: input.policies,
            observedAt: '2026-07-23T11:00:00.000Z'
        });
        const [pending] = store.listPendingSaveProposals({ actorWhatsappId });
        assert.throws(() => store.readSaveProposalPrivate(pending.proposal_ref, {
            actorWhatsappId: 'outsider@c.us'
        }), /shadow_preview_actor_unauthorized/);
        const originalExpiry = pending.expires_at;
        now = new Date('2026-07-24T12:00:00.000Z');
        store.ingestSaveProposals({
            reconciliationDecisions: input.reconciliationDecisions,
            lifecycleDecisions: input.lifecycleDecisions,
            openFinanceItems: [input.item],
            policies: input.policies,
            observedAt: '2026-07-24T11:00:00.000Z'
        });
        assert.equal(store.listPendingSaveProposals({ actorWhatsappId })[0].expires_at, originalExpiry);
        assert.equal(store.revokeSourceAlias('daniel_nubank', { generation: 2 }).removed_save_proposals, 1);
        assert.equal(store.stats().save_proposals_total, 0);
    } finally {
        store.close();
    }

    const bytes = ['preview.sqlite', 'preview.sqlite-wal', 'preview.sqlite-shm']
        .filter(name => fs.existsSync(path.join(directory, name)))
        .map(name => fs.readFileSync(path.join(directory, name)))
        .reduce((combined, value) => Buffer.concat([combined, value]), Buffer.alloc(0))
        .toString('utf8');
    assert.doesNotMatch(bytes, /PRIVATE PROPOSAL DESCRIPTION|private-item-id|daniel_nubank|provider-purchase-posted/);

    now = new Date('2026-08-23T12:00:00.000Z');
    store = openStore(databasePath, () => now);
    try {
        assert.equal(store.stats().save_proposals_total, 0);
    } finally {
        store.close();
    }
});

test('9P.0 runtime creates shadow proposals without changing WhatsApp or financial writes', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-save-proposal-runtime-'));
    const files = Object.fromEntries([
        'credentials', 'mapping', 'visibility', 'evidence', 'secret',
        'vault', 'baseline', 'outbox', 'journal', 'preview'
    ].map(name => [
        name,
        path.join(directory, `${name}.${['vault', 'baseline', 'outbox', 'journal', 'preview'].includes(name)
            ? 'sqlite'
            : name === 'secret' ? 'txt' : 'json'}`)
    ]));
    fs.writeFileSync(files.credentials, JSON.stringify({ clientId: 'client', clientSecret: 'secret' }));
    fs.writeFileSync(files.mapping, JSON.stringify([{
        itemId: 'private-item-id',
        alias: 'daniel_nubank',
        ownerScope: 'daniel',
        generation: 2
    }]));
    fs.writeFileSync(files.visibility, JSON.stringify([{
        alias: 'daniel_nubank',
        source_owner: 'daniel',
        authorized_viewers: ['daniel'],
        whatsapp_recipient: 'daniel',
        family_aggregation_allowed: false,
        write_confirmation_principal: 'daniel'
    }]));
    fs.writeFileSync(files.evidence, JSON.stringify({
        route: 'meu_pluggy_connector_200',
        connector_id: 200,
        observed_cost_cents: 0,
        payment_method_registered: false,
        pro_features_required: false,
        update_item_enabled: false,
        category_source: 'financasbot_local'
    }));
    fs.writeFileSync(files.secret, secret);

    const baseItem = {
        ...fixture().item,
        availability: {
            accounts: 'available',
            transactions: 'available',
            bills: 'available',
            investments: 'available'
        },
        bills: [],
        investments: [],
        transactions: [transaction('old')]
    };
    const initial = {
        provider: 'pluggy',
        mode: 'live_readonly_staging',
        event_id: 'initial',
        observed_at: '2026-07-23T10:00:00.000Z',
        collection_health: { complete: true, warning_count: 0 },
        items: [baseItem]
    };
    const changed = {
        ...initial,
        event_id: 'changed',
        observed_at: '2026-07-23T11:00:00.000Z',
        items: [{ ...baseItem, transactions: [transaction('old'), transaction('purchase-posted')] }]
    };
    const vault = new OpenFinanceLiveStagingVault({ databasePath: files.vault, secret });
    const baseline = new OpenFinanceBaselineStore({ databasePath: files.baseline, secret });
    const outbox = new OpenFinanceAlertOutbox({ databasePath: files.outbox, secret });
    const journal = new OpenFinanceRevocationJournal({ databasePath: files.journal, secret });
    const preview = new OpenFinanceShadowPreviewStore({ databasePath: files.preview, secret });
    vault.ingestSnapshot(initial);
    baseline.ingestSnapshot(initial);
    preview.close();
    journal.close();
    outbox.close();
    baseline.close();
    vault.close();

    let apiCalls = 0;
    let messages = 0;
    class FakeApi {
        async readSnapshot() {
            apiCalls += 1;
            return changed;
        }
    }
    const env = {
        OPEN_FINANCE_ALERT_MODE: 'shadow',
        OPEN_FINANCE_RECONCILIATION_MODE: 'canary',
        OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary',
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'shadow',
        OPEN_FINANCE_WRITE_MODE: 'off',
        OPEN_FINANCE_COMMERCIAL_EVIDENCE_FILE: files.evidence,
        PLUGGY_ITEM_MAP_FILE: files.mapping,
        OPEN_FINANCE_VISIBILITY_POLICY_FILE: files.visibility,
        PLUGGY_CREDENTIALS_FILE: files.credentials,
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: files.secret,
        OPEN_FINANCE_LIVE_STAGING_DB: files.vault,
        OPEN_FINANCE_BASELINE_DB: files.baseline,
        OPEN_FINANCE_OUTBOX_DB: files.outbox,
        OPEN_FINANCE_REVOCATION_JOURNAL_DB: files.journal,
        OPEN_FINANCE_SHADOW_PREVIEW_DB: files.preview
    };
    const dependencies = {
        PluggyReadOnlyClient: FakeApi,
        getActiveUsers: async () => [{
            user_id: 'user-daniel',
            display_name: 'Daniel',
            whatsapp_id: actorWhatsappId,
            status: 'ACTIVE'
        }],
        readOpenFinanceInternalSource: async () => ({
            available: true,
            source_health: 'available',
            transactions: [],
            scope_coverage: { daniel_nubank: { card: true, account: true } },
            financial_writes: 0
        })
    };

    const result = await runOpenFinanceCanaryCycle({
        client: { sendMessage: async () => { messages += 1; } },
        env,
        dependencies
    });
    assert.equal(result.outcome, 'GO');
    assert.equal(result.save_proposals.mode, 'shadow');
    assert.equal(result.save_proposals.inserted, 1);
    assert.equal(result.save_proposals.pending, 1);
    assert.equal(result.financial_writes, 0);
    assert.equal(messages, 0);
    assert.equal(apiCalls, 1);

    const reopened = openStore(files.preview);
    try {
        assert.equal(reopened.listPendingSaveProposals({ actorWhatsappId }).length, 1);
    } finally {
        reopened.close();
    }

    await assert.rejects(() => runOpenFinanceCanaryCycle({
        client: { sendMessage: async () => { messages += 1; } },
        env: { ...env, OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'off' },
        dependencies
    }), /open_finance_save_proposal_preview_required/);
    assert.equal(apiCalls, 1);
    assert.equal(messages, 0);
});
