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

function setup(alias = 'daniel_nubank', createdAt = '2026-07-16T10:00:00.000Z') {
    const item = { id: `item-${alias}`, alias_code: alias, accounts: [{ id: 'account-1', type: 'CREDIT' }], transactions: [{ id: 'tx-1', account_id: 'account-1', amount_cents: 1234, description: 'Compra privada', date: '2026-07-16T10:00:00.000Z', status: 'POSTED', currency: 'BRL' }] };
    const lifecycle = classifyOpenFinanceLifecycle({ items: [item], secret });
    const candidate = { observation_ref: lifecycle.decisions[0].observation_ref, external_event_ref: 'external-event-ref', correlation_state: 'new_event' };
    const outbox = new OpenFinanceAlertOutbox({ secret });
    outbox.enqueue({ candidates: [candidate], lifecycleDecisions: lifecycle.decisions, items: [item], policies, baselineComplete: true, createdAt });
    return outbox;
}

function multiCanaryPolicy() {
    const activations = {
        daniel_nubank: '2026-07-16T11:00:00.000Z',
        thais_nubank: '2026-07-16T11:00:00.000Z'
    };
    return buildOpenFinanceRolloutPolicy({ env: {
        OPEN_FINANCE_ALERT_MODE: 'canary',
        OPEN_FINANCE_ALERT_CANARY_ALIASES: 'daniel_nubank,thais_nubank',
        OPEN_FINANCE_ALERT_CANARY_ACTIVATIONS_JSON: JSON.stringify(activations),
        OPEN_FINANCE_WRITE_MODE: 'off'
    }, evidence, mappings, vaultAvailable: true });
}

function canaryPolicy(mode = 'canary') {
    return buildOpenFinanceRolloutPolicy({ env: { OPEN_FINANCE_ALERT_MODE: mode, OPEN_FINANCE_ALERT_CANARY_ALIAS: mode === 'canary' ? 'daniel_nubank' : '', OPEN_FINANCE_WRITE_MODE: 'off' }, evidence, mappings, vaultAvailable: true });
}

test('9F canary with provider id becomes delivered_confirmed', async () => {
    const outbox = setup(); let calls = 0; let sentText = '';
    try {
        const result = await deliverOneOpenFinanceCanary({ policy: canaryPolicy(), outbox,
            recipientResolver: async owner => owner === 'daniel' ? 'recipient-private' : null,
            sourceLabels: { daniel_nubank: 'Nubank Daniel' },
            transport: { sendMessage: async (to, text) => { calls += 1; sentText = text; assert.equal(to, 'recipient-private'); return { id: { _serialized: 'message-private-id' } }; } },
            now: '2026-07-16T12:00:00.000Z' });
        assert.equal(result.outcome, 'delivered_confirmed'); assert.equal(calls, 1);
        assert.match(sentText, /Somente leitura: nada foi salvo automaticamente/);
        assert.deepEqual(outbox.stats(), { total: 1, pending: 0, in_flight: 0, blocked: 0,
            accepted_unconfirmed: 0, delivered_confirmed: 1, legacy_sent: 0, sent: 1,
            transport_calls: 0, financial_writes: 0 });
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

test('9F definitive no-send failure releases the lease for an explicit retry', async () => {
    const outbox = setup(); let calls = 0;
    const common = { policy: canaryPolicy(), outbox, recipientResolver: async () => 'recipient', sourceLabels: { daniel_nubank: 'Nubank Daniel' } };
    try {
        const failed = await deliverOneOpenFinanceCanary({ ...common, transport: { sendMessage: async () => { calls += 1; throw Object.assign(new Error('offline'), { code: 'transport_offline', definitiveNoSend: true }); } } });
        assert.equal(failed.outcome, 'retry'); assert.equal(outbox.stats().pending, 1);
        const sent = await deliverOneOpenFinanceCanary({ ...common, transport: { sendMessage: async () => { calls += 1; return { id: 'message-id' }; } } });
        assert.equal(sent.outcome, 'delivered_confirmed'); assert.equal(calls, 2); assert.equal(outbox.stats().sent, 1);
    } finally { outbox.close(); }
});

test('9F resolved transport without provider id becomes accepted_unconfirmed and is never retried automatically', async () => {
    const outbox = setup(); let calls = 0;
    try {
        const result = await deliverOneOpenFinanceCanary({ policy: canaryPolicy(), outbox,
            recipientResolver: async () => 'recipient', sourceLabels: { daniel_nubank: 'Nubank Daniel' },
            transport: { sendMessage: async () => { calls += 1; return undefined; } } });
        assert.equal(result.outcome, 'accepted_unconfirmed'); assert.equal(calls, 1);
        assert.equal(outbox.stats().accepted_unconfirmed, 1); assert.equal(outbox.stats().sent, 0);
        const replay = await deliverOneOpenFinanceCanary({ policy: canaryPolicy(), outbox,
            recipientResolver: async () => 'recipient', sourceLabels: { daniel_nubank: 'Nubank Daniel' },
            transport: { sendMessage: async () => { calls += 1; } } });
        assert.equal(replay.outcome, 'idle'); assert.equal(calls, 1);
    } finally { outbox.close(); }
});

test('9E.0 canary never claims an event from another source alias', () => {
    const outbox = setup('thais_nubank');
    try { assert.equal(outbox.stats().pending, 1); assert.equal(outbox.claimNext({ canaryAlias: 'daniel_nubank' }), null); }
    finally { outbox.close(); }
});

test('post-9F multi-source canary delivers Thais source to Thais and keeps writes off', async () => {
    const outbox = setup('thais_nubank', '2026-07-16T12:00:00.000Z');
    let recipient;
    try {
        const result = await deliverOneOpenFinanceCanary({ policy: multiCanaryPolicy(), outbox,
            recipientResolver: async owner => owner === 'thais' ? 'thais-private' : null,
            sourceLabels: { thais_nubank: 'Nubank Thais' },
            transport: { sendMessage: async to => { recipient = to; return { id: 'thais-message-id' }; } },
            now: '2026-07-16T12:01:00.000Z' });
        assert.equal(result.outcome, 'delivered_confirmed');
        assert.equal(result.financial_writes, 0);
        assert.equal(recipient, 'thais-private');
    } finally { outbox.close(); }
});

test('post-9F activation cutoff blocks historical pending alert before expanding alias', async () => {
    const outbox = setup('thais_nubank', '2026-07-16T10:00:00.000Z');
    let calls = 0;
    try {
        const policy = multiCanaryPolicy();
        const quarantined = outbox.quarantineBeforeActivation({
            canaryAliases: policy.canary_aliases,
            activatedAfterByAlias: policy.canary_activations
        });
        assert.equal(quarantined.blocked, 1);
        const result = await deliverOneOpenFinanceCanary({ policy, outbox,
            recipientResolver: async () => 'recipient', sourceLabels: { thais_nubank: 'Nubank Thais' },
            transport: { sendMessage: async () => { calls += 1; } } });
        assert.equal(result.outcome, 'idle');
        assert.equal(calls, 0);
        assert.equal(outbox.stats().blocked, 1);
    } finally { outbox.close(); }
});

test('9F expired in-flight lease becomes accepted_unconfirmed and is not reclaimed', () => {
    const outbox = setup();
    try {
        const first = outbox.claimNext({ canaryAlias: 'daniel_nubank', now: '2026-07-16T12:00:00.000Z', leaseSeconds: 30 });
        assert.ok(first?.lease_token); assert.equal(outbox.stats().in_flight, 1);
        assert.equal(outbox.claimNext({ canaryAlias: 'daniel_nubank', now: '2026-07-16T12:00:29.000Z', leaseSeconds: 30 }), null);
        const recovered = outbox.claimNext({ canaryAlias: 'daniel_nubank', now: '2026-07-16T12:00:31.000Z', leaseSeconds: 30 });
        assert.equal(recovered, null); assert.equal(outbox.stats().accepted_unconfirmed, 1);
    } finally { outbox.close(); }
});

test('9F ambiguous transport rejection is at-most-once and can be confirmed by reference', async () => {
    const outbox = setup(); let calls = 0;
    try {
        const result = await deliverOneOpenFinanceCanary({ policy: canaryPolicy(), outbox,
            recipientResolver: async () => 'recipient', sourceLabels: { daniel_nubank: 'Nubank Daniel' },
            transport: { sendMessage: async () => { calls += 1; throw new Error('unknown delivery state'); } } });
        assert.equal(result.outcome, 'accepted_unconfirmed'); assert.equal(calls, 1);
        const row = outbox.db.prepare('SELECT encrypted_payload,alert_ref FROM finance_alert_outbox').get();
        assert.equal(outbox.stats().accepted_unconfirmed, 1);
        assert.equal((await deliverOneOpenFinanceCanary({ policy: canaryPolicy(), outbox,
            recipientResolver: async () => 'recipient', sourceLabels: { daniel_nubank: 'Nubank Daniel' },
            transport: { sendMessage: async () => { calls += 1; } } })).outcome, 'idle');
        const internalReference = row.alert_ref.slice(0, 10);
        assert.equal(outbox.acknowledgeUserConfirmed({ internalReference }).delivered_confirmed, true);
        assert.equal(outbox.stats().delivered_confirmed, 1); assert.equal(calls, 1);
    } finally { outbox.close(); }
});

test('9F accepted_unconfirmed can be retried only by explicit confirmed action', async () => {
    const outbox = setup(); let calls = 0;
    const common = { policy: canaryPolicy(), outbox, recipientResolver: async () => 'recipient',
        sourceLabels: { daniel_nubank: 'Nubank Daniel' } };
    try {
        const accepted = await deliverOneOpenFinanceCanary({ ...common,
            transport: { sendMessage: async () => { calls += 1; return undefined; } } });
        assert.equal(accepted.outcome, 'accepted_unconfirmed');
        const internalReference = outbox.db.prepare('SELECT alert_ref FROM finance_alert_outbox').get().alert_ref.slice(0, 10);
        assert.throws(() => outbox.requestManualRetry({ internalReference }), /confirmation_required/);
        assert.equal(outbox.requestManualRetry({ internalReference, confirm: true }).pending, true);
        const confirmed = await deliverOneOpenFinanceCanary({ ...common,
            transport: { sendMessage: async () => { calls += 1; return { id: 'manual-retry-id' }; } } });
        assert.equal(confirmed.outcome, 'delivered_confirmed');
        assert.equal(calls, 2); assert.equal(outbox.stats().delivered_confirmed, 1);
    } finally { outbox.close(); }
});
