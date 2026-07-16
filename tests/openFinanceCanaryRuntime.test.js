const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { OpenFinanceLiveStagingVault } = require('../src/openFinance/openFinanceLiveStagingVault');
const { OpenFinanceBaselineStore } = require('../src/openFinance/openFinanceBaselineStore');
const { OpenFinanceAlertOutbox } = require('../src/openFinance/openFinanceAlertOutbox');
const { OpenFinanceRevocationJournal } = require('../src/openFinance/openFinanceRevocationJournal');
const { runOpenFinanceCanaryCycle, initializeOpenFinanceCanaryRuntime, resolveWhatsAppRecipient } = require('../src/openFinance/openFinanceCanaryRuntime');

const secret = 'open-finance-runtime-test-secret-32-bytes';
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

test('9E.1 runtime sends only purchase and refund and quarantines unrelated income', async () => {
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
    class FakeApi { async readSnapshot() { return changed; } }
    const messages = [];
    const env = { OPEN_FINANCE_ALERT_MODE: 'canary', OPEN_FINANCE_ALERT_CANARY_ALIAS: 'daniel_nubank', OPEN_FINANCE_WRITE_MODE: 'off',
        OPEN_FINANCE_COMMERCIAL_EVIDENCE_FILE: files.evidence, PLUGGY_ITEM_MAP_FILE: files.mapping,
        OPEN_FINANCE_VISIBILITY_POLICY_FILE: files.visibility, PLUGGY_CREDENTIALS_FILE: files.credentials,
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: files.secret, OPEN_FINANCE_LIVE_STAGING_DB: files.vault,
        OPEN_FINANCE_BASELINE_DB: files.baseline, OPEN_FINANCE_OUTBOX_DB: files.outbox,
        OPEN_FINANCE_REVOCATION_JOURNAL_DB: files.journal, OPEN_FINANCE_ALERT_MAX_PER_RUN: '3' };
    const result = await runOpenFinanceCanaryCycle({ client: { sendMessage: async (to, text) => { messages.push({ to, text }); return { id: `message-${messages.length}` }; } }, env,
        dependencies: { PluggyReadOnlyClient: FakeApi,
            getActiveUsers: async () => [{ display_name: 'Daniel da Silva', whatsapp_id: 'daniel@c.us', status: 'ACTIVE' }] } });
    assert.equal(result.outcome, 'GO'); assert.equal(result.new_observations, 3);
    assert.deepEqual(result.deliveries, ['delivered_confirmed', 'delivered_confirmed', 'idle']); assert.equal(messages.length, 2);
    assert.ok(messages.every(message => message.to === 'daniel@c.us' && message.text.includes('nada foi salvo')));
    assert.equal(result.queued.blocked, 1); assert.equal(result.outbox.blocked, 0); assert.equal(result.financial_writes, 0);
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
