const assert = require('node:assert/strict');
const test = require('node:test');
const { buildOpenFinanceRolloutPolicy } = require('../src/openFinance/openFinanceRolloutPolicy');

const evidence = { route: 'meu_pluggy_connector_200', connector_id: 200, observed_cost_cents: 0, payment_method_registered: false, pro_features_required: false, update_item_enabled: false, category_source: 'financasbot_local' };
const mappings = [{ alias: 'daniel_nubank' }, { alias: 'thais_nubank' }];

test('9E.0 defaults off with zero capabilities', () => {
    const policy = buildOpenFinanceRolloutPolicy({ env: {}, evidence, mappings, vaultAvailable: true });
    assert.equal(policy.mode, 'off');
    assert.equal(policy.enabled, false);
    assert.equal(policy.can_poll_readonly, false);
    assert.equal(policy.can_send_whatsapp, false);
    assert.equal(policy.can_write_financial, false);
});

test('9E.0 shadow permits local read/outbox but never recipient or write', () => {
    const policy = buildOpenFinanceRolloutPolicy({ env: { OPEN_FINANCE_ALERT_MODE: 'shadow' }, evidence, mappings, vaultAvailable: true });
    assert.equal(policy.enabled, true);
    assert.equal(policy.can_poll_readonly, true);
    assert.equal(policy.can_build_outbox, true);
    assert.equal(policy.can_send_whatsapp, false);
    assert.equal(policy.canary_alias, null);
});

test('9E.0 canary requires one known alias and remains write-off', () => {
    const policy = buildOpenFinanceRolloutPolicy({ env: { OPEN_FINANCE_ALERT_MODE: 'canary', OPEN_FINANCE_ALERT_CANARY_ALIAS: 'daniel_nubank', OPEN_FINANCE_WRITE_MODE: 'off' }, evidence, mappings, vaultAvailable: true });
    assert.equal(policy.enabled, true);
    assert.equal(policy.can_send_whatsapp, true);
    assert.equal(policy.canary_alias, 'daniel_nubank');
    assert.equal(policy.can_write_financial, false);
});

test('9E.0 fails closed for missing vault, paid/trial ambiguity, Pro or Update Item', () => {
    const env = { OPEN_FINANCE_ALERT_MODE: 'canary', OPEN_FINANCE_ALERT_CANARY_ALIAS: 'daniel_nubank' };
    for (const unsafe of [
        { vaultAvailable: false, evidence },
        { vaultAvailable: true, evidence: { ...evidence, route: 'dashboard_trial' } },
        { vaultAvailable: true, evidence: { ...evidence, observed_cost_cents: 1 } },
        { vaultAvailable: true, evidence: { ...evidence, pro_features_required: true } },
        { vaultAvailable: true, evidence: { ...evidence, update_item_enabled: true } }
    ]) assert.equal(buildOpenFinanceRolloutPolicy({ env, mappings, ...unsafe }).enabled, false);
});

test('9E.0 forbids every write mode and unknown on mode', () => {
    const write = buildOpenFinanceRolloutPolicy({ env: { OPEN_FINANCE_ALERT_MODE: 'canary', OPEN_FINANCE_ALERT_CANARY_ALIAS: 'daniel_nubank', OPEN_FINANCE_WRITE_MODE: 'confirm' }, evidence, mappings, vaultAvailable: true });
    const on = buildOpenFinanceRolloutPolicy({ env: { OPEN_FINANCE_ALERT_MODE: 'on' }, evidence, mappings, vaultAvailable: true });
    assert.equal(write.enabled, false);
    assert.equal(on.enabled, false);
});
