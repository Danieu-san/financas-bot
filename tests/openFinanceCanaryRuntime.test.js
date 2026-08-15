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
const { runOpenFinanceCanaryCycle, initializeOpenFinanceCanaryRuntime,
    resolveOpenFinancePollSchedule, resolveWhatsAppRecipient,
    resolveInternalUserIds, shadowPreviewMode,
    bindOpenFinanceProposalConversation,
    reconcileOpenFinanceRecipientAvailability } = require('../src/openFinance/openFinanceCanaryRuntime');

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

test('gate 39.1 proposes current open-invoice purchases once and survives pending to posted', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-open-runtime-posted-batch-'));
    const files = Object.fromEntries([
        'credentials', 'mapping', 'visibility', 'evidence', 'secret',
        'vault', 'baseline', 'outbox', 'journal', 'preview'
    ].map(name => [name, path.join(dir, `${name}.${[
        'vault', 'baseline', 'outbox', 'journal', 'preview'
    ].includes(name) ? 'sqlite' : name === 'secret' ? 'txt' : 'json'}`)]));
    fs.writeFileSync(files.credentials, JSON.stringify({
        clientId: 'client', clientSecret: 'secret'
    }));
    fs.writeFileSync(files.mapping, JSON.stringify([{
        itemId: 'item-daniel-0001', alias: 'daniel_nubank',
        ownerScope: 'daniel', generation: 1
    }]));
    fs.writeFileSync(files.visibility, JSON.stringify([{
        alias: 'daniel_nubank', source_owner: 'daniel',
        authorized_viewers: ['daniel'], whatsapp_recipient: 'daniel',
        family_aggregation_allowed: false, write_confirmation_principal: 'daniel'
    }]));
    fs.writeFileSync(files.evidence, JSON.stringify({
        route: 'meu_pluggy_connector_200', connector_id: 200,
        observed_cost_cents: 0, payment_method_registered: false,
        pro_features_required: false, update_item_enabled: false,
        category_source: 'financasbot_local'
    }));
    fs.writeFileSync(files.secret, secret);

    const initial = snapshot([transaction('old-posted-batch', 500, 'old')]);
    const vault = new OpenFinanceLiveStagingVault({ databasePath: files.vault, secret });
    const baseline = new OpenFinanceBaselineStore({ databasePath: files.baseline, secret });
    const outbox = new OpenFinanceAlertOutbox({ databasePath: files.outbox, secret });
    const journal = new OpenFinanceRevocationJournal({ databasePath: files.journal, secret });
    const preview = new OpenFinanceShadowPreviewStore({
        databasePath: files.preview, secret, revocationJournal: journal
    });
    vault.ingestSnapshot(initial);
    baseline.ingestSnapshot(initial);
    preview.close();
    journal.close();
    outbox.close();
    baseline.close();
    vault.close();

    const pending = snapshot([
        transaction('old-posted-batch', 500, 'old'),
        { ...transaction('pending-to-posted-1', 1200, 'Compra um', 'PENDING'),
            bill_forecast_month: '2026-07' },
        { ...transaction('pending-to-posted-2', 2300, 'Compra dois', 'PENDING'),
            bill_forecast_month: '2026-07' }
    ], '2026-07-16T12:00:00.000Z');
    let currentSnapshot = pending;
    class FakeApi { async readSnapshot() { return currentSnapshot; } }
    const messages = [];
    const stateDirectory = path.join(dir, 'conversation-state');
    const stateManagerPath = path.resolve(__dirname, '../src/state/userStateManager.js');
    const originalCwd = process.cwd();
    const originalStateEnv = Object.fromEntries([
        'STATE_STORE_DRIVER',
        'STATE_STORE_ENCRYPTION_KEY',
        'STATE_STORE_MAX_RETENTION_SECONDS'
    ].map(key => [key, process.env[key]]));
    const originalSignalListeners = Object.fromEntries(['SIGINT', 'SIGTERM'].map(signal => [
        signal,
        new Set(process.listeners(signal))
    ]));
    fs.mkdirSync(stateDirectory);
    let userStateManager;
    let reopenedStateManager;
    const env = {
        OPEN_FINANCE_ALERT_MODE: 'canary',
        OPEN_FINANCE_ALERT_CANARY_ALIAS: 'daniel_nubank',
        OPEN_FINANCE_RECONCILIATION_MODE: 'canary',
        OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary',
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_SAVE_PROPOSAL_BATCH_SIZE: '4',
        OPEN_FINANCE_WRITE_MODE: 'off',
        OPEN_FINANCE_WRITE_APPROVED: 'false',
        OPEN_FINANCE_COMMERCIAL_EVIDENCE_FILE: files.evidence,
        PLUGGY_ITEM_MAP_FILE: files.mapping,
        OPEN_FINANCE_VISIBILITY_POLICY_FILE: files.visibility,
        PLUGGY_CREDENTIALS_FILE: files.credentials,
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: files.secret,
        OPEN_FINANCE_LIVE_STAGING_DB: files.vault,
        OPEN_FINANCE_BASELINE_DB: files.baseline,
        OPEN_FINANCE_OUTBOX_DB: files.outbox,
        OPEN_FINANCE_REVOCATION_JOURNAL_DB: files.journal,
        OPEN_FINANCE_SHADOW_PREVIEW_DB: files.preview,
        OPEN_FINANCE_ALERT_MAX_PER_RUN: '4'
    };
    const client = {
        sendMessage: async (to, text) => {
            messages.push({ to, text });
            return { id: `message-${messages.length}` };
        }
    };

    try {
        process.env.STATE_STORE_DRIVER = 'file';
        process.env.STATE_STORE_ENCRYPTION_KEY = Buffer.alloc(32, 0x47).toString('base64');
        process.env.STATE_STORE_MAX_RETENTION_SECONDS = '3600';
        process.chdir(stateDirectory);
        delete require.cache[stateManagerPath];
        userStateManager = require(stateManagerPath);
        process.chdir(originalCwd);
        const dependencies = {
            PluggyReadOnlyClient: FakeApi,
            userStateManager,
            readOpenFinanceInternalSource: async () => ({
                available: true, source_health: 'available', transactions: [], financial_writes: 0
            }),
            getActiveUsers: async () => [{
                user_id: 'user-daniel', display_name: 'Daniel da Silva',
                whatsapp_id: 'daniel@c.us', status: 'ACTIVE'
            }]
        };

        const first = await runOpenFinanceCanaryCycle({ client, env, dependencies });
        assert.equal(first.outcome, 'GO');
        assert.equal(first.new_observations, 2);
        assert.equal(first.save_proposals.inserted, 2);
        assert.equal(messages.length, 1);
        assert.match(messages[0].text, /1\./);
        assert.match(messages[0].text, /2\./);
        assert.match(messages[0].text, /salvar todas/i);
        assert.equal(
            userStateManager.getState('daniel@c.us').action,
            'awaiting_open_finance_save_selection'
        );

        currentSnapshot = snapshot([
            transaction('old-posted-batch', 500, 'old'),
            { ...transaction('pending-to-posted-1', 1200, 'Compra um', 'POSTED'),
                bill_id: 'closed-bill-1', bill_forecast_month: null },
            { ...transaction('pending-to-posted-2', 2300, 'Compra dois', 'POSTED'),
                bill_id: 'closed-bill-1', bill_forecast_month: null }
        ], '2026-07-16T13:00:00.000Z');
        const second = await runOpenFinanceCanaryCycle({ client, env, dependencies });
        assert.equal(second.outcome, 'GO');
        assert.equal(second.new_observations, 0);
        assert.equal(second.save_proposals.inserted, 0);
        assert.equal(second.save_proposals.replayed, 2);
        assert.equal(messages.length, 1);
        assert.equal(
            userStateManager.getState('daniel@c.us').action,
            'awaiting_open_finance_save_selection'
        );
        assert.equal(second.financial_writes, 0);

        const { stateFile } = userStateManager.__test__.getStateFilePaths();
        assert.equal(fs.existsSync(stateFile), true);
        assert.doesNotMatch(
            fs.readFileSync(stateFile, 'utf8'),
            /awaiting_open_finance_save_selection|pending-to-posted/i
        );
        await userStateManager.closeStateStore();
        delete require.cache[stateManagerPath];
        process.chdir(stateDirectory);
        reopenedStateManager = require(stateManagerPath);
        process.chdir(originalCwd);
        const restored = reopenedStateManager.getState('daniel@c.us');
        assert.equal(restored.action, 'awaiting_open_finance_save_selection');
        assert.equal(restored.data.proposals.length, 2);
        assert.deepEqual(restored.data.proposals.map(item => item.number), [1, 2]);
    } finally {
        process.chdir(originalCwd);
        await Promise.all([userStateManager, reopenedStateManager]
            .filter(Boolean)
            .map(manager => manager.closeStateStore()));
        delete require.cache[stateManagerPath];
        for (const signal of ['SIGINT', 'SIGTERM']) {
            for (const listener of process.listeners(signal)) {
                if (!originalSignalListeners[signal].has(listener)) {
                    process.off(signal, listener);
                }
            }
        }
        for (const [key, value] of Object.entries(originalStateEnv)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
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

test('Gate 42 runtime log exposes only allowlisted fail-closed reason codes', async () => {
    const warnings = [];
    let error = new Error('save_proposal_replay_conflict');
    const runtime = initializeOpenFinanceCanaryRuntime({
        client: {},
        env: { OPEN_FINANCE_ALERT_MODE: 'canary', OPEN_FINANCE_STARTUP_DELAY_MS: '600000' },
        logger: { info() {}, warn: message => warnings.push(message) },
        runCycle: async () => { throw error; }
    });
    try {
        assert.deepEqual(await runtime.execute(), {
            outcome: 'NO_GO',
            financial_writes: 0
        });
        assert.match(warnings[0], /reason=save_proposal_replay_conflict/);
        assert.match(warnings[0], /code=unknown/);

        error = new Error('unsafe detail user@example.com');
        await runtime.execute();
        assert.match(warnings[1], /reason=unknown/);
        assert.doesNotMatch(warnings[1], /user@example\.com/);

        error = new Error('private_token_12345');
        await runtime.execute();
        assert.match(warnings[2], /reason=unknown/);
        assert.doesNotMatch(warnings[2], /private_token_12345/);

        error = new Error('open_finance_proactive_review_replay_conflict');
        await runtime.execute();
        assert.match(warnings[3], /reason=open_finance_proactive_review_replay_conflict/);
    } finally {
        runtime.stop();
    }
});

test('9E.1 fast polling requires a short expiry and every safe Open Finance flag', () => {
    const now = Date.parse('2026-08-09T00:00:00.000Z');
    const safe = {
        OPEN_FINANCE_ALERT_MODE: 'canary',
        OPEN_FINANCE_RECONCILIATION_MODE: 'canary',
        OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary',
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_WRITE_MODE: 'off',
        OPEN_FINANCE_WRITE_APPROVED: 'false',
        OPEN_FINANCE_POLL_INTERVAL_MS: String(15 * 60 * 1000),
        OPEN_FINANCE_FAST_POLL_UNTIL: new Date(now + 2 * 60 * 60 * 1000).toISOString()
    };
    const active = resolveOpenFinancePollSchedule(safe, now);
    assert.equal(active.fastPolling, true);
    assert.equal(active.intervalMs, 15 * 60 * 1000);
    assert.equal(active.naturalIntervalMs, 6 * 60 * 60 * 1000);

    for (const override of [
        { OPEN_FINANCE_WRITE_MODE: 'confirm' },
        { OPEN_FINANCE_WRITE_APPROVED: 'true' },
        { OPEN_FINANCE_FAST_POLL_UNTIL: '' },
        { OPEN_FINANCE_FAST_POLL_UNTIL: new Date(now).toISOString() },
        { OPEN_FINANCE_FAST_POLL_UNTIL: new Date(now + 2 * 60 * 60 * 1000 + 1).toISOString() },
        { OPEN_FINANCE_POLL_INTERVAL_MS: String(5 * 60 * 1000 - 1) }
    ]) {
        const rejected = resolveOpenFinancePollSchedule({ ...safe, ...override }, now);
        assert.equal(rejected.fastPolling, false);
        assert.equal(rejected.intervalMs, 6 * 60 * 60 * 1000);
        assert.ok(rejected.ignoredReason);
    }
});

test('9E.1 expired fast polling suppresses cycles until the natural interval is due', async () => {
    const base = Date.parse('2026-08-09T00:00:00.000Z');
    let current = base;
    let scheduledInterval;
    let intervalMs;
    let cycles = 0;
    const runtime = initializeOpenFinanceCanaryRuntime({
        client: {},
        env: {
            OPEN_FINANCE_ALERT_MODE: 'canary',
            OPEN_FINANCE_RECONCILIATION_MODE: 'canary',
            OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary',
            OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
            OPEN_FINANCE_WRITE_MODE: 'off',
            OPEN_FINANCE_WRITE_APPROVED: 'false',
            OPEN_FINANCE_POLL_INTERVAL_MS: String(15 * 60 * 1000),
            OPEN_FINANCE_FAST_POLL_UNTIL: new Date(base + 60 * 60 * 1000).toISOString(),
            OPEN_FINANCE_STARTUP_DELAY_MS: '600000'
        },
        logger: { info() {}, warn() {} },
        now: () => current,
        runCycle: async () => {
            cycles += 1;
            return { outcome: 'GO', deliveries: [], outbox: {}, financial_writes: 0 };
        },
        setTimeoutFn: () => ({ unref() {} }),
        setIntervalFn: (callback, delay) => {
            scheduledInterval = callback;
            intervalMs = delay;
            return { unref() {} };
        },
        clearTimeoutFn() {},
        clearIntervalFn() {}
    });
    try {
        assert.equal(runtime.fastPolling, true);
        assert.equal(intervalMs, 15 * 60 * 1000);
        await scheduledInterval();
        assert.equal(cycles, 1);

        current = base + 60 * 60 * 1000;
        const expired = await scheduledInterval();
        assert.equal(expired.outcome, 'SKIPPED_FAST_POLL_EXPIRED');
        assert.equal(expired.financial_writes, 0);
        assert.equal(cycles, 1);

        current = base + 6 * 60 * 60 * 1000;
        await scheduledInterval();
        assert.equal(cycles, 2);
    } finally {
        runtime.stop();
    }
});

test('9E.1 fast polling never overlaps an Open Finance cycle already running', async () => {
    const base = Date.parse('2026-08-09T00:00:00.000Z');
    let scheduledInterval;
    let releaseCycle;
    let cycles = 0;
    const runtime = initializeOpenFinanceCanaryRuntime({
        client: {},
        env: {
            OPEN_FINANCE_ALERT_MODE: 'canary',
            OPEN_FINANCE_RECONCILIATION_MODE: 'canary',
            OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary',
            OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
            OPEN_FINANCE_WRITE_MODE: 'off',
            OPEN_FINANCE_WRITE_APPROVED: 'false',
            OPEN_FINANCE_POLL_INTERVAL_MS: String(15 * 60 * 1000),
            OPEN_FINANCE_FAST_POLL_UNTIL: new Date(base + 60 * 60 * 1000).toISOString()
        },
        logger: { info() {}, warn() {} },
        now: () => base,
        runCycle: async () => {
            cycles += 1;
            await new Promise(resolve => { releaseCycle = resolve; });
            return { outcome: 'GO', deliveries: [], outbox: {}, financial_writes: 0 };
        },
        setTimeoutFn: () => ({ unref() {} }),
        setIntervalFn: callback => {
            scheduledInterval = callback;
            return { unref() {} };
        },
        clearTimeoutFn() {},
        clearIntervalFn() {}
    });
    try {
        const first = scheduledInterval();
        await new Promise(resolve => setImmediate(resolve));
        const concurrent = await scheduledInterval();
        assert.equal(concurrent.outcome, 'SKIPPED_ALREADY_RUNNING');
        assert.equal(concurrent.financial_writes, 0);
        assert.equal(cycles, 1);
        releaseCycle();
        await first;
        assert.equal(cycles, 1);
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

test('orphaned Open Finance conversation state is durably removed before recipient delivery', () => {
    const deleted = [];
    const result = reconcileOpenFinanceRecipientAvailability({
        actor: { principal: 'daniel', whatsappId: 'daniel@c.us' },
        stateManager: {
            getState: () => ({
                action: 'awaiting_open_finance_save_selection',
                data: { proposals: [{ proposalRef: 'a'.repeat(32) }] }
            }),
            deleteStateDurably: whatsappId => deleted.push(whatsappId)
        },
        proposalReviewStore: {
            listActiveReviews: () => [],
            listReadyReviews: () => [{
                proposal_ref: 'f'.repeat(32),
                expires_at: '2026-01-01T00:00:00.000Z'
            }]
        },
        proposalStore: { listReadySaveProposalConfirmations: () => [] },
        outbox: { getProposalDeliveryState: () => null }
    });
    assert.deepEqual(result, {
        blocked: false,
        recovered: true,
        reason: 'orphaned_open_finance_conversation_state',
        financial_writes: 0
    });
    assert.deepEqual(deleted, ['daniel@c.us']);
});

test('recipient recovery preserves unrelated state and every live Open Finance backing', () => {
    const deleted = [];
    const base = {
        actor: { principal: 'daniel', whatsappId: 'daniel@c.us' },
        stateManager: {
            getState: () => ({ action: 'confirming_delete' }),
            deleteStateDurably: whatsappId => deleted.push(whatsappId)
        },
        proposalReviewStore: {
            listActiveReviews: () => [],
            listReadyReviews: () => []
        },
        proposalStore: { listReadySaveProposalConfirmations: () => [] },
        outbox: { getProposalDeliveryState: () => null }
    };
    assert.equal(reconcileOpenFinanceRecipientAvailability(base).blocked, true);
    assert.equal(deleted.length, 0);

    const activeReview = reconcileOpenFinanceRecipientAvailability({
        ...base,
        stateManager: {
            ...base.stateManager,
            getState: () => ({ action: 'awaiting_open_finance_save_review' })
        },
        proposalReviewStore: {
            listActiveReviews: () => [{ proposal_ref: 'b'.repeat(32) }],
            listReadyReviews: () => []
        }
    });
    assert.equal(activeReview.blocked, true);
    assert.equal(activeReview.reason, 'active_open_finance_review');

    const readyReview = reconcileOpenFinanceRecipientAvailability({
        ...base,
        stateManager: {
            ...base.stateManager,
            getState: () => ({ action: 'awaiting_open_finance_final_confirmation' })
        },
        proposalReviewStore: {
            listActiveReviews: () => [],
            listReadyReviews: () => [{
                proposal_ref: 'c'.repeat(32),
                expires_at: '2027-01-01T00:00:00.000Z'
            }]
        }
    });
    assert.equal(readyReview.blocked, true);
    assert.equal(readyReview.reason, 'ready_open_finance_review');

    const transportedConfirmation = reconcileOpenFinanceRecipientAvailability({
        ...base,
        stateManager: { ...base.stateManager, getState: () => undefined },
        proposalStore: {
            listReadySaveProposalConfirmations: () => [{ proposal_ref: 'd'.repeat(32) }]
        },
        outbox: { getProposalDeliveryState: () => 'accepted_unconfirmed' }
    });
    assert.equal(transportedConfirmation.blocked, true);
    assert.equal(transportedConfirmation.reason, 'transported_open_finance_confirmation');
    assert.equal(deleted.length, 0);
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
