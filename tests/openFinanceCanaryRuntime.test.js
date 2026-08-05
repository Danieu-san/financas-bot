const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { OpenFinanceLiveStagingVault } = require('../src/openFinance/openFinanceLiveStagingVault');
const { OpenFinanceBaselineStore } = require('../src/openFinance/openFinanceBaselineStore');
const { OpenFinanceAlertOutbox } = require('../src/openFinance/openFinanceAlertOutbox');
const { OpenFinanceRevocationJournal } = require('../src/openFinance/openFinanceRevocationJournal');
const { observationRef } = require('../src/openFinance/openFinanceRuntimeReconciliation');
const { runOpenFinanceCanaryCycle, initializeOpenFinanceCanaryRuntime, resolveWhatsAppRecipient,
    resolveInternalUserIds, shadowPreviewMode,
    bindOpenFinanceProposalConversation } = require('../src/openFinance/openFinanceCanaryRuntime');

const secret = 'open-finance-runtime-test-secret-32-bytes';

test('family preview mode defaults off and rejects unknown activation values', () => {
    assert.equal(shadowPreviewMode({}), 'off');
    assert.equal(shadowPreviewMode({ OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary' }), 'canary');
    assert.throws(() => shadowPreviewMode({ OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'on' }), /invalid_open_finance/);
});
function snapshot(transactions, observedAt = '2026-07-16T10:00:00.000Z') {
    return { provider: 'pluggy', mode: 'live_readonly_staging', event_id: `event-${observedAt}`,
        observed_at: observedAt, collection_health: { complete: true, warning_count: 0 }, items: [{
            id: 'item-daniel-0001', alias_code: 'daniel_nubank', owner_scope: 'daniel', availability: { accounts: 'available', transactions: 'available', bills: 'available', investments: 'available' },
            accounts: [{ id: 'account-credit-1', type: 'CREDIT', name: 'credit', balance_cents: 0 },
                { id: 'account-bank-1', type: 'BANK', name: 'bank', balance_cents: 0 }],
            transactions, bills: [], investments: []
        }] };
}
function transaction(id, amount, description, status = 'POSTED', accountId = 'account-credit-1') {
    return { id, provider_id: `provider-${id}`, account_id: accountId, amount_cents: amount, description,
        date: '2026-07-16T09:00:00.000Z', status, currency: 'BRL' };
}

test('Open Finance runtime alerts reconciled purchase, refund and bank income', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-open-runtime-'));
    const files = Object.fromEntries(['credentials', 'mapping', 'visibility', 'evidence', 'secret', 'vault', 'baseline', 'outbox', 'journal'].map(name => [name, path.join(dir, `${name}.${['vault','baseline','outbox','journal'].includes(name) ? 'sqlite' : name === 'secret' ? 'txt' : 'json'}`)]));
    fs.writeFileSync(files.credentials, JSON.stringify({ clientId: 'client', clientSecret: 'secret' }));
    fs.writeFileSync(files.mapping, JSON.stringify([{ itemId: 'item-daniel-0001', alias: 'daniel_nubank', ownerScope: 'daniel', generation: 1 }]));
    fs.writeFileSync(files.visibility, JSON.stringify([{ alias: 'daniel_nubank', source_owner: 'daniel', authorized_viewers: ['daniel'], whatsapp_recipient: 'daniel', family_aggregation_allowed: false, write_confirmation_principal: 'daniel' }]));
    fs.writeFileSync(files.evidence, JSON.stringify({ route: 'meu_pluggy_connector_200', connector_id: 200, observed_cost_cents: 0, payment_method_registered: false, pro_features_required: false, update_item_enabled: false, category_source: 'financasbot_local' }));
    fs.writeFileSync(files.secret, secret);
    const first = snapshot([transaction('old', 500, 'old')]);
    const vault = new OpenFinanceLiveStagingVault({ databasePath: files.vault, secret });
    const baseline = new OpenFinanceBaselineStore({ databasePath: files.baseline, secret });
    const outbox = new OpenFinanceAlertOutbox({ databasePath: files.outbox, secret });
    const journal = new OpenFinanceRevocationJournal({ databasePath: files.journal, secret });
    vault.ingestSnapshot(first); baseline.ingestSnapshot(first); vault.close(); baseline.close(); outbox.close(); journal.close();
    const changed = snapshot([transaction('old', 500, 'old'), transaction('purchase', 1193, 'Uber', 'PENDING'),
        transaction('refund', -1193, 'Estorno Uber', 'PENDING'),
        transaction('income', 400, 'Credito diverso', 'POSTED', 'account-bank-1')], '2026-07-16T12:00:00.000Z');
    let currentSnapshot = changed;
    class FakeApi { async readSnapshot() { return currentSnapshot; } }
    const messages = [];
    const env = { OPEN_FINANCE_ALERT_MODE: 'canary', OPEN_FINANCE_ALERT_CANARY_ALIAS: 'daniel_nubank',
        OPEN_FINANCE_RECONCILIATION_MODE: 'canary', OPEN_FINANCE_WRITE_MODE: 'off',
        OPEN_FINANCE_COMMERCIAL_EVIDENCE_FILE: files.evidence, PLUGGY_ITEM_MAP_FILE: files.mapping,
        OPEN_FINANCE_VISIBILITY_POLICY_FILE: files.visibility, PLUGGY_CREDENTIALS_FILE: files.credentials,
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: files.secret, OPEN_FINANCE_LIVE_STAGING_DB: files.vault,
        OPEN_FINANCE_BASELINE_DB: files.baseline, OPEN_FINANCE_OUTBOX_DB: files.outbox,
        OPEN_FINANCE_REVOCATION_JOURNAL_DB: files.journal, OPEN_FINANCE_ALERT_MAX_PER_RUN: '3' };
    const result = await runOpenFinanceCanaryCycle({ client: { sendMessage: async (to, text) => { messages.push({ to, text }); return { id: `message-${messages.length}` }; } }, env,
        dependencies: { PluggyReadOnlyClient: FakeApi,
            readOpenFinanceInternalSource: async () => ({
                available: true, source_health: 'available', transactions: [], financial_writes: 0
            }),
            getActiveUsers: async () => [{ user_id: 'user-daniel', display_name: 'Daniel da Silva',
                whatsapp_id: 'daniel@c.us', status: 'ACTIVE' }] } });
    assert.equal(result.outcome, 'GO'); assert.equal(result.new_observations, 3);
    assert.deepEqual(result.deliveries, ['delivered_confirmed', 'delivered_confirmed', 'delivered_confirmed']); assert.equal(messages.length, 3);
    assert.ok(messages.every(message => message.to === 'daniel@c.us' && message.text.includes('nada foi salvo')));
    assert.equal(result.queued.blocked, 0); assert.equal(result.outbox.blocked, 0); assert.equal(result.financial_writes, 0);
    assert.deepEqual(result.reconciliation.summary, {
        matched: 0, new: 3, possible_duplicate: 0, uncertain: 0,
        lifecycle_replayed: 0, possible_replacement: 0, resolved_replay: 0, source_missing: 0
    });

    currentSnapshot = snapshot([...changed.items[0].transactions,
        transaction('blocked-new', 999, 'Compra com fonte interna indisponivel')], '2026-07-16T13:00:00.000Z');
    const blocked = await runOpenFinanceCanaryCycle({ client: {
        sendMessage: async (to, text) => { messages.push({ to, text }); return { id: 'must-not-send' }; }
    }, env, dependencies: { PluggyReadOnlyClient: FakeApi,
        readOpenFinanceInternalSource: async () => ({
            available: false, source_health: 'internal_source_stale', transactions: [], financial_writes: 0
        }),
        getActiveUsers: async () => [{ user_id: 'user-daniel', display_name: 'Daniel da Silva',
            whatsapp_id: 'daniel@c.us', status: 'ACTIVE' }] } });
    assert.equal(blocked.outcome, 'blocked');
    assert.deepEqual(blocked.blockers, ['internal_source_stale']);
    assert.equal(blocked.transport_calls, 0);
    assert.equal(messages.length, 3);
});

test('OF-FAMILY-01 reconciles shared alerts against both spouses internal sources', () => {
    assert.deepEqual(resolveInternalUserIds([{
        alias: 'daniel_nubank',
        source_owner: 'daniel',
        authorized_viewers: ['daniel', 'thais'],
        whatsapp_recipient: 'daniel',
        family_aggregation_allowed: true,
        write_confirmation_principal: 'daniel'
    }], [
        { user_id: 'user-daniel', display_name: 'Daniel da Silva' },
        { user_id: 'user-thais', display_name: 'Thaís Leopoldo' }
    ]).sort(), ['user-daniel', 'user-thais']);
});

test('OF-FAMILY-01 runtime fans one reconciled transaction out to both spouses', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-open-runtime-family-'));
    const files = Object.fromEntries(
        ['credentials', 'mapping', 'visibility', 'evidence', 'secret', 'vault', 'baseline', 'outbox', 'journal']
            .map(name => [name, path.join(
                dir,
                `${name}.${['vault', 'baseline', 'outbox', 'journal'].includes(name)
                    ? 'sqlite'
                    : name === 'secret' ? 'txt' : 'json'}`
            )])
    );
    fs.writeFileSync(files.credentials, JSON.stringify({
        clientId: 'client',
        clientSecret: 'secret'
    }));
    fs.writeFileSync(files.mapping, JSON.stringify([{
        itemId: 'item-daniel-0001',
        alias: 'daniel_nubank',
        ownerScope: 'daniel',
        generation: 1
    }]));
    fs.writeFileSync(files.visibility, JSON.stringify([{
        alias: 'daniel_nubank',
        source_owner: 'daniel',
        authorized_viewers: ['daniel', 'thais'],
        whatsapp_recipient: 'daniel',
        family_aggregation_allowed: true,
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

    const initial = snapshot([transaction('family-old', 500, 'old')]);
    const vault = new OpenFinanceLiveStagingVault({
        databasePath: files.vault,
        secret
    });
    const baseline = new OpenFinanceBaselineStore({
        databasePath: files.baseline,
        secret
    });
    const outbox = new OpenFinanceAlertOutbox({
        databasePath: files.outbox,
        secret
    });
    const journal = new OpenFinanceRevocationJournal({
        databasePath: files.journal,
        secret
    });
    vault.ingestSnapshot(initial);
    baseline.ingestSnapshot(initial);
    vault.close();
    baseline.close();
    outbox.close();
    journal.close();

    const changed = snapshot([
        transaction('family-old', 500, 'old'),
        transaction('family-new', 1983, 'Compra compartilhada')
    ], '2026-07-16T12:00:00.000Z');
    class FakeApi {
        async readSnapshot() {
            return changed;
        }
    }
    const messages = [];
    const env = {
        OPEN_FINANCE_ALERT_MODE: 'canary',
        OPEN_FINANCE_ALERT_CANARY_ALIAS: 'daniel_nubank',
        OPEN_FINANCE_RECONCILIATION_MODE: 'canary',
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
        OPEN_FINANCE_ALERT_MAX_PER_RUN: '1'
    };
    const result = await runOpenFinanceCanaryCycle({
        client: {
            sendMessage: async (to, text) => {
                messages.push({ to, text });
                return { id: `family-runtime-${messages.length}` };
            }
        },
        env,
        dependencies: {
            PluggyReadOnlyClient: FakeApi,
            readOpenFinanceInternalSource: async () => ({
                available: true,
                source_health: 'available',
                transactions: [],
                financial_writes: 0
            }),
            getActiveUsers: async () => [
                {
                    user_id: 'user-daniel',
                    display_name: 'Daniel da Silva',
                    whatsapp_id: 'daniel@c.us',
                    status: 'ACTIVE'
                },
                {
                    user_id: 'user-thais',
                    display_name: 'Thais Leopoldo',
                    whatsapp_id: 'thais@c.us',
                    status: 'ACTIVE'
                }
            ]
        }
    });

    assert.equal(result.outcome, 'GO');
    assert.equal(result.queued.inserted, 2);
    assert.deepEqual(result.deliveries, [
        'delivered_confirmed',
        'delivered_confirmed'
    ]);
    assert.deepEqual(messages.map(message => message.to).sort(), [
        'daniel@c.us',
        'thais@c.us'
    ]);
    assert.equal(result.financial_writes, 0);
});

test('post-9F runtime expands to Thais Nubank without disabling Daniel or writing financial data', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-open-runtime-multi-'));
    const files = Object.fromEntries(['credentials', 'mapping', 'visibility', 'evidence', 'secret', 'vault', 'baseline', 'outbox', 'journal']
        .map(name => [name, path.join(dir, `${name}.${['vault','baseline','outbox','journal'].includes(name) ? 'sqlite' : name === 'secret' ? 'txt' : 'json'}`)]));
    const mappings = [
        { itemId: 'item-daniel-0001', alias: 'daniel_nubank', ownerScope: 'daniel', generation: 1 },
        { itemId: 'item-thais-0001', alias: 'thais_nubank', ownerScope: 'thais', generation: 1 }
    ];
    const policies = [
        { alias: 'daniel_nubank', source_owner: 'daniel', authorized_viewers: ['daniel'], whatsapp_recipient: 'daniel', family_aggregation_allowed: false, write_confirmation_principal: 'daniel' },
        { alias: 'thais_nubank', source_owner: 'thais', authorized_viewers: ['thais'], whatsapp_recipient: 'thais', family_aggregation_allowed: false, write_confirmation_principal: 'thais' }
    ];
    fs.writeFileSync(files.credentials, JSON.stringify({ clientId: 'client', clientSecret: 'secret' }));
    fs.writeFileSync(files.mapping, JSON.stringify(mappings));
    fs.writeFileSync(files.visibility, JSON.stringify(policies));
    fs.writeFileSync(files.evidence, JSON.stringify({ route: 'meu_pluggy_connector_200', connector_id: 200,
        observed_cost_cents: 0, payment_method_registered: false, pro_features_required: false,
        update_item_enabled: false, category_source: 'financasbot_local' }));
    fs.writeFileSync(files.secret, secret);
    const daniel = snapshot([transaction('daniel-old', 500, 'old')]).items[0];
    const thais = { ...snapshot([transaction('thais-old', 600, 'old')]).items[0],
        id: 'item-thais-0001', alias_code: 'thais_nubank', owner_scope: 'thais' };
    const first = { ...snapshot([]), items: [daniel, thais] };
    const vault = new OpenFinanceLiveStagingVault({ databasePath: files.vault, secret });
    const baseline = new OpenFinanceBaselineStore({ databasePath: files.baseline, secret });
    const outbox = new OpenFinanceAlertOutbox({ databasePath: files.outbox, secret });
    const journal = new OpenFinanceRevocationJournal({ databasePath: files.journal, secret });
    vault.ingestSnapshot(first); baseline.ingestSnapshot(first);
    vault.close(); baseline.close(); outbox.close(); journal.close();
    const changedThais = { ...thais, transactions: [
        transaction('thais-old', 600, 'old'), transaction('thais-new', 2550, 'Mercado', 'POSTED')
    ] };
    const changed = { ...first, event_id: 'event-multi-changed', observed_at: '2026-07-16T13:00:00.000Z',
        items: [daniel, changedThais] };
    class FakeApi { async readSnapshot() { return changed; } }
    const messages = [];
    const activations = { daniel_nubank: '2020-01-01T00:00:00.000Z', thais_nubank: '2020-01-01T00:00:00.000Z' };
    const env = { OPEN_FINANCE_ALERT_MODE: 'canary',
        OPEN_FINANCE_ALERT_CANARY_ALIASES: 'daniel_nubank,thais_nubank',
        OPEN_FINANCE_ALERT_CANARY_ACTIVATIONS_JSON: JSON.stringify(activations), OPEN_FINANCE_WRITE_MODE: 'off',
        OPEN_FINANCE_COMMERCIAL_EVIDENCE_FILE: files.evidence, PLUGGY_ITEM_MAP_FILE: files.mapping,
        OPEN_FINANCE_VISIBILITY_POLICY_FILE: files.visibility, PLUGGY_CREDENTIALS_FILE: files.credentials,
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: files.secret, OPEN_FINANCE_LIVE_STAGING_DB: files.vault,
        OPEN_FINANCE_BASELINE_DB: files.baseline, OPEN_FINANCE_OUTBOX_DB: files.outbox,
        OPEN_FINANCE_REVOCATION_JOURNAL_DB: files.journal, OPEN_FINANCE_ALERT_MAX_PER_RUN: '2' };
    const result = await runOpenFinanceCanaryCycle({ client: {
        sendMessage: async (to, text) => { messages.push({ to, text }); return { id: 'multi-message-id' }; }
    }, env, dependencies: { PluggyReadOnlyClient: FakeApi, getActiveUsers: async () => [
        { display_name: 'Daniel da Silva', whatsapp_id: 'daniel@c.us', status: 'ACTIVE' },
        { display_name: 'Thais Leopoldo', whatsapp_id: 'thais@c.us', status: 'ACTIVE' }
    ] } });
    assert.equal(result.outcome, 'GO');
    assert.deepEqual(result.deliveries, ['delivered_confirmed', 'idle']);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].to, 'thais@c.us');
    assert.match(messages[0].text, /Nubank Thais/);
    assert.equal(result.financial_writes, 0);
});

test('9E.1 recipient resolver fails closed for absent or ambiguous owner', () => {
    assert.equal(resolveWhatsAppRecipient('daniel', [{ display_name: 'Daniel da Silva', whatsapp_id: 'id' }]), 'id');
    assert.throws(() => resolveWhatsAppRecipient('daniel', []), /scope_unavailable/);
    assert.throws(() => resolveWhatsAppRecipient('daniel', [
        { display_name: 'Daniel da Silva', whatsapp_id: 'one' }, { display_name: 'Dániel Souza', whatsapp_id: 'two' }
    ]), /scope_unavailable/);
});

test('9F runtime reapplies monotonic revocation before network and fails closed', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-open-runtime-revoked-'));
    const files = Object.fromEntries(['credentials', 'mapping', 'visibility', 'evidence', 'secret', 'vault', 'baseline', 'outbox', 'journal']
        .map(name => [name, path.join(dir, `${name}.${['vault','baseline','outbox','journal'].includes(name) ? 'sqlite' : name === 'secret' ? 'txt' : 'json'}`)]));
    fs.writeFileSync(files.credentials, JSON.stringify({ clientId: 'client', clientSecret: 'secret' }));
    fs.writeFileSync(files.mapping, JSON.stringify([{ itemId: 'item-daniel-0001', alias: 'daniel_nubank', ownerScope: 'daniel', generation: 1 }]));
    fs.writeFileSync(files.visibility, JSON.stringify([{ alias: 'daniel_nubank', source_owner: 'daniel',
        authorized_viewers: ['daniel'], whatsapp_recipient: 'daniel', family_aggregation_allowed: false,
        write_confirmation_principal: 'daniel' }]));
    fs.writeFileSync(files.evidence, JSON.stringify({ route: 'meu_pluggy_connector_200', connector_id: 200,
        observed_cost_cents: 0, payment_method_registered: false, pro_features_required: false,
        update_item_enabled: false, category_source: 'financasbot_local' }));
    fs.writeFileSync(files.secret, secret);
    const first = snapshot([transaction('old', 500, 'old')]);
    const vault = new OpenFinanceLiveStagingVault({ databasePath: files.vault, secret });
    const baseline = new OpenFinanceBaselineStore({ databasePath: files.baseline, secret });
    const outbox = new OpenFinanceAlertOutbox({ databasePath: files.outbox, secret });
    const journal = new OpenFinanceRevocationJournal({ databasePath: files.journal, secret });
    vault.ingestSnapshot(first); baseline.ingestSnapshot(first);
    journal.recordRevocation({ alias: 'daniel_nubank', generation: 1 });
    vault.close(); baseline.close(); outbox.close(); journal.close();
    const env = { OPEN_FINANCE_ALERT_MODE: 'canary', OPEN_FINANCE_ALERT_CANARY_ALIAS: 'daniel_nubank',
        OPEN_FINANCE_WRITE_MODE: 'off', OPEN_FINANCE_COMMERCIAL_EVIDENCE_FILE: files.evidence,
        PLUGGY_ITEM_MAP_FILE: files.mapping, OPEN_FINANCE_VISIBILITY_POLICY_FILE: files.visibility,
        PLUGGY_CREDENTIALS_FILE: files.credentials, OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: files.secret,
        OPEN_FINANCE_LIVE_STAGING_DB: files.vault, OPEN_FINANCE_BASELINE_DB: files.baseline,
        OPEN_FINANCE_OUTBOX_DB: files.outbox, OPEN_FINANCE_REVOCATION_JOURNAL_DB: files.journal };
    let apiCalls = 0; let messages = 0;
    class FakeApi { async readSnapshot() { apiCalls += 1; return first; } }
    await assert.rejects(() => runOpenFinanceCanaryCycle({
        client: { sendMessage: async () => { messages += 1; } }, env,
        dependencies: { PluggyReadOnlyClient: FakeApi, getActiveUsers: async () => [] }
    }), /revoked_mapping_configured/);
    assert.equal(apiCalls, 0); assert.equal(messages, 0);
    const checkedVault = new OpenFinanceLiveStagingVault({ databasePath: files.vault, secret });
    const checkedBaseline = new OpenFinanceBaselineStore({ databasePath: files.baseline, secret });
    try {
        assert.equal(checkedVault.stats().items, 0);
        assert.equal(checkedBaseline.stats().observations, 0);
    } finally { checkedBaseline.close(); checkedVault.close(); }
});

test('9E.1 runtime log separates cycle deliveries from cumulative outbox state', async () => {
    const messages = [];
    const runtime = initializeOpenFinanceCanaryRuntime({
        client: {},
        env: { OPEN_FINANCE_ALERT_MODE: 'canary', OPEN_FINANCE_STARTUP_DELAY_MS: '600000' },
        logger: { info: message => messages.push(message), warn: message => messages.push(message) },
        runCycle: async () => ({
            outcome: 'GO',
            new_observations: 0,
            deliveries: ['idle'],
            outbox: { sent: 2, accepted_unconfirmed: 0, delivered_confirmed: 0, legacy_sent: 2 },
            financial_writes: 0
        })
    });
    try {
        await runtime.execute();
        assert.equal(messages.length, 1);
        assert.match(messages[0], /delivered=0/);
        assert.match(messages[0], /accepted_unconfirmed=0/);
        assert.match(messages[0], /retries=0/);
        assert.match(messages[0], /cumulative_confirmed=0/);
        assert.match(messages[0], /cumulative_unconfirmed=0/);
        assert.match(messages[0], /cumulative_legacy_sent=2/);
        assert.doesNotMatch(messages[0], /\ssent=2/);
    } finally {
        runtime.stop();
    }
});

test('resolved no-id proposal binds one conversation and ambiguous delivery still reserves its recipient', () => {
    const states = new Map();
    const stateManager = {
        setStateDurably(key, value, ttl) { states.set(key, { value, ttl }); }
    };
    const excludedRecipients = new Set();
    const bound = bindOpenFinanceProposalConversation({
        delivery: {
            outcome: 'accepted_unconfirmed',
            conversation_bindable: true,
            proposal_ref: 'a'.repeat(32),
            confirmation_expires_at: new Date(Date.now() + 60_000).toISOString(),
            recipient: 'daniel@c.us',
            recipient_principal: 'daniel'
        },
        stateManager,
        excludedRecipients
    });
    assert.equal(bound, true);
    assert.equal(states.get('daniel@c.us').value.action,
        'awaiting_open_finance_save_confirmation');
    assert.equal(states.get('daniel@c.us').value.data.proposalRef, 'a'.repeat(32));
    assert.equal(states.get('daniel@c.us').value.data.recipientPrincipal, 'daniel');
    assert.equal(excludedRecipients.has('daniel'), true);

    assert.equal(bindOpenFinanceProposalConversation({
        delivery: {
            outcome: 'accepted_unconfirmed',
            conversation_bindable: false,
            proposal_ref: 'b'.repeat(32),
            recipient_principal: 'thais'
        },
        stateManager,
        excludedRecipients
    }), false);
    assert.equal(states.size, 1);
    assert.equal(excludedRecipients.has('thais'), true);
});

test('ambiguous first proposal prevents the outbox from claiming a second prompt for that recipient', () => {
    const outbox = new OpenFinanceAlertOutbox({ secret });
    const item = snapshot([
        transaction('first-proposal', 1000, 'Primeira compra'),
        transaction('second-proposal', 2000, 'Segunda compra')
    ]).items[0];
    const refs = item.transactions.map(tx =>
        observationRef(secret, item.id, tx.account_id, tx.id));
    const lifecycleDecisions = refs.map(observation_ref => ({
        observation_ref,
        classification: 'purchase',
        provider_state: 'POSTED',
        lifecycle_milestone: 'first_posted'
    }));
    try {
        outbox.enqueue({
            candidates: refs.map((observation_ref, index) => ({
                observation_ref,
                external_event_ref: `event-proposal-${index}`,
                correlation_state: 'new_event',
                reconciliation_status: 'new'
            })),
            lifecycleDecisions,
            items: [item],
            policies: [{
                alias: 'daniel_nubank',
                source_owner: 'daniel',
                authorized_viewers: ['daniel'],
                whatsapp_recipient: 'daniel',
                family_aggregation_allowed: false,
                write_confirmation_principal: 'daniel'
            }],
            baselineComplete: true,
            reconciliationRequired: true,
            saveProposalLinks: refs.map((observation_ref, index) => ({
                observation_ref,
                proposal_ref: (index ? 'b' : 'a').repeat(32),
                principal: 'daniel'
            }))
        });
        const first = outbox.claimNext({ canaryAliases: ['daniel_nubank'] });
        assert.equal(first.recipient, 'daniel');
        outbox.acknowledgeAccepted({
            alertRef: first.alert_ref,
            leaseToken: first.lease_token,
            reasonCode: 'ambiguous_transport_failure'
        });

        const excludedRecipients = new Set();
        assert.equal(bindOpenFinanceProposalConversation({
            delivery: {
                ...first,
                outcome: 'accepted_unconfirmed',
                conversation_bindable: false,
                recipient_principal: first.recipient
            },
            stateManager: null,
            excludedRecipients
        }), false);
        assert.equal(excludedRecipients.has('daniel'), true);
        assert.equal(outbox.listPending().length, 1);
        assert.equal(outbox.claimNext({
            canaryAliases: ['daniel_nubank'],
            excludedRecipients: [...excludedRecipients]
        }), null);
        assert.equal(outbox.stats().accepted_unconfirmed, 1);
    } finally {
        outbox.close();
    }
});
