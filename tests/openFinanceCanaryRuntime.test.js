const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { OpenFinanceLiveStagingVault } = require('../src/openFinance/openFinanceLiveStagingVault');
const { OpenFinanceBaselineStore } = require('../src/openFinance/openFinanceBaselineStore');
const { OpenFinanceAlertOutbox } = require('../src/openFinance/openFinanceAlertOutbox');
const { runOpenFinanceCanaryCycle, resolveWhatsAppRecipient } = require('../src/openFinance/openFinanceCanaryRuntime');

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
    const files = Object.fromEntries(['credentials', 'mapping', 'visibility', 'evidence', 'secret', 'vault', 'baseline', 'outbox'].map(name => [name, path.join(dir, `${name}.${['vault','baseline','outbox'].includes(name) ? 'sqlite' : name === 'secret' ? 'txt' : 'json'}`)]));
    fs.writeFileSync(files.credentials, JSON.stringify({ clientId: 'client', clientSecret: 'secret' }));
    fs.writeFileSync(files.mapping, JSON.stringify([{ itemId: 'item-daniel-0001', alias: 'daniel_nubank', ownerScope: 'daniel' }]));
    fs.writeFileSync(files.visibility, JSON.stringify([{ alias: 'daniel_nubank', source_owner: 'daniel', authorized_viewers: ['daniel'], whatsapp_recipient: 'daniel', family_aggregation_allowed: false, write_confirmation_principal: 'daniel' }]));
    fs.writeFileSync(files.evidence, JSON.stringify({ route: 'meu_pluggy_connector_200', connector_id: 200, observed_cost_cents: 0, payment_method_registered: false, pro_features_required: false, update_item_enabled: false, category_source: 'financasbot_local' }));
    fs.writeFileSync(files.secret, secret);
    const first = snapshot([transaction('old', 500, 'old')]);
    const vault = new OpenFinanceLiveStagingVault({ databasePath: files.vault, secret });
    const baseline = new OpenFinanceBaselineStore({ databasePath: files.baseline, secret });
    const outbox = new OpenFinanceAlertOutbox({ databasePath: files.outbox, secret });
    vault.ingestSnapshot(first); baseline.ingestSnapshot(first); vault.close(); baseline.close(); outbox.close();
    const changed = snapshot([transaction('old', 500, 'old'), transaction('purchase', 1193, 'Uber', 'PENDING'),
        transaction('refund', -1193, 'Estorno Uber', 'PENDING'),
        transaction('income', 400, 'Credito diverso', 'POSTED', 'account-bank-1')], '2026-07-16T12:00:00.000Z');
    class FakeApi { async readSnapshot() { return changed; } }
    const messages = [];
    const env = { OPEN_FINANCE_ALERT_MODE: 'canary', OPEN_FINANCE_ALERT_CANARY_ALIAS: 'daniel_nubank', OPEN_FINANCE_WRITE_MODE: 'off',
        OPEN_FINANCE_COMMERCIAL_EVIDENCE_FILE: files.evidence, PLUGGY_ITEM_MAP_FILE: files.mapping,
        OPEN_FINANCE_VISIBILITY_POLICY_FILE: files.visibility, PLUGGY_CREDENTIALS_FILE: files.credentials,
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: files.secret, OPEN_FINANCE_LIVE_STAGING_DB: files.vault,
        OPEN_FINANCE_BASELINE_DB: files.baseline, OPEN_FINANCE_OUTBOX_DB: files.outbox, OPEN_FINANCE_ALERT_MAX_PER_RUN: '3' };
    const result = await runOpenFinanceCanaryCycle({ client: { sendMessage: async (to, text) => { messages.push({ to, text }); return { id: `message-${messages.length}` }; } }, env,
        dependencies: { PluggyReadOnlyClient: FakeApi,
            getActiveUsers: async () => [{ display_name: 'Daniel da Silva', whatsapp_id: 'daniel@c.us', status: 'ACTIVE' }] } });
    assert.equal(result.outcome, 'GO'); assert.equal(result.new_observations, 3);
    assert.deepEqual(result.deliveries, ['sent', 'sent', 'idle']); assert.equal(messages.length, 2);
    assert.ok(messages.every(message => message.to === 'daniel@c.us' && message.text.includes('nada foi salvo')));
    assert.equal(result.queued.blocked, 1); assert.equal(result.outbox.blocked, 0); assert.equal(result.financial_writes, 0);
});

test('9E.1 recipient resolver fails closed for absent or ambiguous owner', () => {
    assert.equal(resolveWhatsAppRecipient('daniel', [{ display_name: 'Daniel da Silva', whatsapp_id: 'id' }]), 'id');
    assert.throws(() => resolveWhatsAppRecipient('daniel', []), /scope_unavailable/);
    assert.throws(() => resolveWhatsAppRecipient('daniel', [
        { display_name: 'Daniel da Silva', whatsapp_id: 'one' }, { display_name: 'Dániel Souza', whatsapp_id: 'two' }
    ]), /scope_unavailable/);
});
