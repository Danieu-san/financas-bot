const assert = require('node:assert/strict');
const test = require('node:test');
const { OpenFinanceAlertOutbox } = require('../src/openFinance/openFinanceAlertOutbox');
const { classifyOpenFinanceLifecycle } = require('../src/openFinance/openFinanceLifecycleClassifier');
const { buildOpenFinanceRolloutPolicy } = require('../src/openFinance/openFinanceRolloutPolicy');
const { deliverOneOpenFinanceCanary } = require('../src/openFinance/openFinanceWhatsappCanaryDelivery');

const secret = 'open-finance-canary-delivery-secret-32-bytes';
const evidence = { route: 'meu_pluggy_connector_200', connector_id: 200, observed_cost_cents: 0, payment_method_registered: false, pro_features_required: false, update_item_enabled: false, category_source: 'financasbot_local' };
const mappings = [{ alias: 'daniel_nubank' }, { alias: 'thais_nubank' }];
const policies = [
    { alias: 'daniel_nubank', source_owner: 'daniel', authorized_viewers: ['daniel'], whatsapp_recipient: 'daniel', family_aggregation_allowed: false, write_confirmation_principal: 'daniel' },
    { alias: 'thais_nubank', source_owner: 'thais', authorized_viewers: ['thais'], whatsapp_recipient: 'thais', family_aggregation_allowed: false, write_confirmation_principal: 'thais' }
];

function setup(alias = 'daniel_nubank') {
    const item = { id: `item-${alias}`, alias_code: alias, accounts: [{ id: 'account-1', type: 'BANK' }], transactions: [{ id: 'tx-1', account_id: 'account-1', amount_cents: -1234, description: 'Compra privada', date: '2026-07-16T10:00:00.000Z', status: 'POSTED', currency: 'BRL' }] };
    const lifecycle = classifyOpenFinanceLifecycle({ items: [item], secret });
    const candidate = { observation_ref: lifecycle.decisions[0].observation_ref, external_event_ref: 'external-event-ref', correlation_state: 'new_event' };
    const outbox = new OpenFinanceAlertOutbox({ secret });
    outbox.enqueue({ candidates: [candidate], lifecycleDecisions: lifecycle.decisions, items: [item], policies, baselineComplete: true });
    return outbox;
}

function canaryPolicy(mode = 'canary') {
    return buildOpenFinanceRolloutPolicy({ env: { OPEN_FINANCE_ALERT_MODE: mode, OPEN_FINANCE_ALERT_CANARY_ALIAS: mode === 'canary' ? 'daniel_nubank' : '', OPEN_FINANCE_WRITE_MODE: 'off' }, evidence, mappings, vaultAvailable: true });
}

test('9E.0 canary sends one allowed source and marks durable acknowledgement', async () => {
    const outbox = setup(); let calls = 0; let sentText = '';
    try {
        const result = await deliverOneOpenFinanceCanary({ policy: canaryPolicy(), outbox,
            recipientResolver: async owner => owner === 'daniel' ? 'recipient-private' : null,
            sourceLabels: { daniel_nubank: 'Nubank Daniel' },
            transport: { sendMessage: async (to, text) => { calls += 1; sentText = text; assert.equal(to, 'recipient-private'); return { id: { _serialized: 'message-private-id' } }; } },
            now: '2026-07-16T12:00:00.000Z' });
        assert.equal(result.outcome, 'sent'); assert.equal(calls, 1);
        assert.match(sentText, /Somente leitura: nada foi salvo automaticamente/);
        assert.deepEqual(outbox.stats(), { total: 1, pending: 0, in_flight: 0, sent: 1, transport_calls: 0, financial_writes: 0 });
    } finally { outbox.close(); }
});

test('9E.0 shadow blocks transport before claiming the outbox', async () => {
    const outbox = setup(); let calls = 0;
    try {
        const result = await deliverOneOpenFinanceCanary({ policy: canaryPolicy('shadow'), outbox,
            recipientResolver: async () => 'recipient', sourceLabels: { daniel_nubank: 'Nubank Daniel' },
            transport: { sendMessage: async () => { calls += 1; } } });
        assert.equal(result.outcome, 'blocked'); assert.equal(calls, 0); assert.equal(outbox.stats().pending, 1);
    } finally { outbox.close(); }
});

test('9E.0 transport failure releases the lease and retry is at-least-once', async () => {
    const outbox = setup(); let calls = 0;
    const common = { policy: canaryPolicy(), outbox, recipientResolver: async () => 'recipient', sourceLabels: { daniel_nubank: 'Nubank Daniel' } };
    try {
        const failed = await deliverOneOpenFinanceCanary({ ...common, transport: { sendMessage: async () => { calls += 1; throw Object.assign(new Error('offline'), { code: 'transport_offline' }); } } });
        assert.equal(failed.outcome, 'retry'); assert.equal(outbox.stats().pending, 1);
        const sent = await deliverOneOpenFinanceCanary({ ...common, transport: { sendMessage: async () => { calls += 1; return { id: 'message-id' }; } } });
        assert.equal(sent.outcome, 'sent'); assert.equal(calls, 2); assert.equal(outbox.stats().sent, 1);
    } finally { outbox.close(); }
});

test('9E.0 canary never claims an event from another source alias', () => {
    const outbox = setup('thais_nubank');
    try { assert.equal(outbox.stats().pending, 1); assert.equal(outbox.claimNext({ canaryAlias: 'daniel_nubank' }), null); }
    finally { outbox.close(); }
});

test('9E.0 expired lease is reclaimed after an interrupted worker', () => {
    const outbox = setup();
    try {
        const first = outbox.claimNext({ canaryAlias: 'daniel_nubank', now: '2026-07-16T12:00:00.000Z', leaseSeconds: 30 });
        assert.ok(first?.lease_token); assert.equal(outbox.stats().in_flight, 1);
        assert.equal(outbox.claimNext({ canaryAlias: 'daniel_nubank', now: '2026-07-16T12:00:29.000Z', leaseSeconds: 30 }), null);
        const recovered = outbox.claimNext({ canaryAlias: 'daniel_nubank', now: '2026-07-16T12:00:31.000Z', leaseSeconds: 30 });
        assert.ok(recovered?.lease_token); assert.notEqual(recovered.lease_token, first.lease_token);
    } finally { outbox.close(); }
});
