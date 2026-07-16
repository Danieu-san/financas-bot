const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { OpenFinanceAlertOutbox, normalizePolicies } = require('../src/openFinance/openFinanceAlertOutbox');
const { classifyOpenFinanceLifecycle } = require('../src/openFinance/openFinanceLifecycleClassifier');

const secret = 'open-finance-outbox-test-secret-32-bytes';
const policies = [
    { alias: 'daniel_nubank', source_owner: 'daniel', authorized_viewers: ['daniel'], whatsapp_recipient: 'daniel', family_aggregation_allowed: false, write_confirmation_principal: 'daniel' },
    { alias: 'cristina_nubank', source_owner: 'thais', authorized_viewers: ['thais'], whatsapp_recipient: 'thais', family_aggregation_allowed: false, write_confirmation_principal: 'thais' }
];
function fixture(alias = 'daniel_nubank', status = 'POSTED') {
    const item = { id: `item-${alias}`, alias_code: alias, accounts: [{ id: 'account-1', type: 'CREDIT' }], transactions: [{ id: 'tx-1', account_id: 'account-1', amount_cents: 1000, description: 'Compra privada', date: '2026-07-16T10:00:00.000Z', status, currency: 'BRL' }] };
    const lifecycle = classifyOpenFinanceLifecycle({ items: [item], secret });
    const decision = lifecycle.decisions[0];
    return { item, lifecycle, candidate: { observation_ref: decision.observation_ref, external_event_ref: 'external-event-ref', correlation_state: 'new_event' } };
}

test('9D.1c baseline history creates zero outbox messages', () => {
    const store = new OpenFinanceAlertOutbox({ secret });
    try {
        assert.deepEqual(store.enqueue({ candidates: [], lifecycleDecisions: [], items: [], policies, baselineComplete: true }), { inserted: 0, replayed: 0, blocked: 0, transport_calls: 0, financial_writes: 0 });
        assert.equal(store.stats().total, 0);
    } finally { store.close(); }
});

test('9D.1c outbox is idempotent across restart and performs no send', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-outbox-'));
    const databasePath = path.join(dir, 'outbox.sqlite');
    const data = fixture();
    let store = new OpenFinanceAlertOutbox({ databasePath, secret });
    try {
        assert.equal(store.enqueue({ candidates: [data.candidate], lifecycleDecisions: data.lifecycle.decisions, items: [data.item], policies, baselineComplete: true }).inserted, 1);
    } finally { store.close(); }
    store = new OpenFinanceAlertOutbox({ databasePath, secret });
    try {
        const replay = store.enqueue({ candidates: [data.candidate], lifecycleDecisions: data.lifecycle.decisions, items: [data.item], policies, baselineComplete: true });
        assert.equal(replay.replayed, 1);
        assert.deepEqual(store.stats(), { total: 1, pending: 1, in_flight: 0, blocked: 0, sent: 0, transport_calls: 0, financial_writes: 0 });
    } finally { store.close(); }
});

test('9D.1c Cristina fails closed to Thais-only policy and rejects Daniel viewer', () => {
    assert.throws(() => normalizePolicies([{ ...policies[1], authorized_viewers: ['thais', 'daniel'] }]), /fail_closed/);
    assert.doesNotThrow(() => normalizePolicies([policies[1]]));
});

test('9D.1c blocks possible replacement and future installment', () => {
    const data = fixture();
    const store = new OpenFinanceAlertOutbox({ secret });
    try {
        assert.equal(store.enqueue({ candidates: [{ ...data.candidate, correlation_state: 'possible_replacement' }], lifecycleDecisions: data.lifecycle.decisions, items: [data.item], policies, baselineComplete: true }).blocked, 1);
        data.lifecycle.decisions[0].classification = 'future_installment';
        assert.equal(store.enqueue({ candidates: [data.candidate], lifecycleDecisions: data.lifecycle.decisions, items: [data.item], policies, baselineComplete: true }).blocked, 1);
    } finally { store.close(); }
});

test('9D.1c alerts only purchases and refunds during the first canary', () => {
    const data = fixture();
    const store = new OpenFinanceAlertOutbox({ secret });
    try {
        data.lifecycle.decisions[0].classification = 'income_candidate';
        assert.equal(store.enqueue({ candidates: [data.candidate], lifecycleDecisions: data.lifecycle.decisions,
            items: [data.item], policies, baselineComplete: true }).blocked, 1);
        assert.equal(store.stats().total, 0);
    } finally { store.close(); }
});

test('9D.1c raw payload stays encrypted at rest', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-outbox-private-'));
    const databasePath = path.join(dir, 'outbox.sqlite');
    const data = fixture();
    const store = new OpenFinanceAlertOutbox({ databasePath, secret });
    try { store.enqueue({ candidates: [data.candidate], lifecycleDecisions: data.lifecycle.decisions, items: [data.item], policies, baselineComplete: true }); } finally { store.close(); }
    const bytes = fs.readFileSync(databasePath).toString('latin1');
    for (const forbidden of ['Compra privada', 'daniel_nubank', 'account-1', 'tx-1']) assert.equal(bytes.includes(forbidden), false);
});

test('9E.1 user confirmation closes exactly one ambiguous transport acknowledgement', () => {
    const data = fixture();
    const store = new OpenFinanceAlertOutbox({ secret });
    try {
        store.enqueue({ candidates: [data.candidate], lifecycleDecisions: data.lifecycle.decisions,
            items: [data.item], policies, baselineComplete: true });
        const delivery = store.claimNext({ canaryAlias: 'daniel_nubank' });
        store.releaseFailed({ alertRef: delivery.alert_ref, leaseToken: delivery.lease_token,
            errorCode: 'transport_ack_unavailable' });
        assert.equal(store.acknowledgeUserConfirmed({ internalReference: delivery.internal_reference }).sent, true);
        assert.equal(store.stats().sent, 1);
        assert.throws(() => store.acknowledgeUserConfirmed({ internalReference: delivery.internal_reference }), /ambiguous/);
    } finally { store.close(); }
});
