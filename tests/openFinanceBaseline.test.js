const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { OpenFinanceBaselineStore } = require('../src/openFinance/openFinanceBaselineStore');

const secret = 'open-finance-baseline-test-secret-32-bytes';
function snapshot(transactions, overrides = {}) {
    return {
        provider: 'pluggy', mode: 'live_readonly_staging', event_id: overrides.eventId || 'event-1',
        observed_at: overrides.observedAt || '2026-07-16T10:00:00.000Z',
        collection_health: overrides.collectionHealth || { complete: true, warning_count: 0, transaction_pages: 5, investment_pages: 1 },
        items: [{
            id: overrides.itemId || 'item-daniel-1', alias_code: 'daniel_nubank', owner_scope: 'daniel',
            availability: overrides.availability || { accounts: 'available', transactions: 'available', bills: 'available', investments: 'available' },
            transactions
        }]
    };
}
function transaction(overrides = {}) {
    return { id: 'tx-1', account_id: 'account-1', date: '2026-07-16T09:00:00.000Z', description: 'DESCRICAO PRIVADA', amount_cents: -5000, currency: 'BRL', status: 'POSTED', type: 'DEBIT', ...overrides };
}

test('9D.1a baseline is silent, atomic and replay safe', () => {
    const store = new OpenFinanceBaselineStore({ secret });
    try {
        const first = store.ingestSnapshot(snapshot([transaction(), transaction({ id: 'tx-2', amount_cents: -7000 })]));
        assert.equal(first.baselined_observations, 2);
        assert.equal(first.alert_candidates, 0);
        assert.equal(store.ingestSnapshot(snapshot([transaction(), transaction({ id: 'tx-2', amount_cents: -7000 })])).new_observations, 0);
        assert.deepEqual(store.stats(), { connections: 1, events: 2, observations: 2, candidates: 0, completed_baselines: 1, financial_writes: 0 });
    } finally { store.close(); }
});

test('9D.1a incomplete collection and injected crash never advance baseline', () => {
    const store = new OpenFinanceBaselineStore({ secret });
    try {
        assert.throws(() => store.ingestSnapshot(snapshot([transaction()], { collectionHealth: { complete: false, warning_count: 0 } })), /incomplete/);
        assert.throws(() => store.ingestSnapshot(snapshot([transaction(), transaction({ id: 'tx-2' })]), { failAfterObservations: 1 }), /injected/);
        assert.deepEqual(store.stats(), { connections: 0, events: 0, observations: 0, candidates: 0, completed_baselines: 0, financial_writes: 0 });
    } finally { store.close(); }
});

test('9D.1a PENDING to POSTED with same observation does not duplicate', () => {
    const store = new OpenFinanceBaselineStore({ secret });
    try {
        store.ingestSnapshot(snapshot([transaction({ status: 'PENDING' })]));
        const result = store.ingestSnapshot(snapshot([transaction({ status: 'POSTED' })], { observedAt: '2026-07-16T12:00:00.000Z' }));
        assert.equal(result.new_observations, 0);
        assert.equal(result.alert_candidates, 0);
        assert.equal(store.stats().observations, 1);
    } finally { store.close(); }
});

test('9D.1a changed provider ID links strong alias and quarantines weak alias', () => {
    const strongStore = new OpenFinanceBaselineStore({ secret });
    try {
        strongStore.ingestSnapshot(snapshot([transaction({ provider_id: 'stable-provider-ref' })]));
        const strong = strongStore.ingestSnapshot(snapshot([transaction({ id: 'tx-new', provider_id: 'stable-provider-ref', status: 'POSTED' })], { observedAt: '2026-07-16T12:00:00.000Z' }));
        assert.equal(strong.possible_replacements, 0);
        assert.equal(strongStore.stats().events, 1);
        assert.equal(strongStore.stats().observations, 2);
    } finally { strongStore.close(); }

    const weakStore = new OpenFinanceBaselineStore({ secret });
    try {
        weakStore.ingestSnapshot(snapshot([transaction()]));
        const weak = weakStore.ingestSnapshot(snapshot([transaction({ id: 'tx-new' })], { observedAt: '2026-07-16T12:00:00.000Z' }));
        assert.equal(weak.possible_replacements, 1);
        assert.equal(weak.alert_candidates, 0);
    } finally { weakStore.close(); }
});

test('9D.1a queues only post-baseline observations and replay stays unique', () => {
    const store = new OpenFinanceBaselineStore({ secret });
    try {
        store.ingestSnapshot(snapshot([transaction()]));
        store.ingestSnapshot(snapshot([transaction(), transaction({ id: 'tx-new', amount_cents: -9000 })], { observedAt: '2026-07-16T12:00:00.000Z' }));
        assert.equal(store.listCandidates().length, 1);
        store.ingestSnapshot(snapshot([transaction(), transaction({ id: 'tx-new', amount_cents: -9000 })], { observedAt: '2026-07-16T13:00:00.000Z' }));
        assert.equal(store.listCandidates().length, 1);
        assert.equal(store.stats().candidates, 1);
    } finally { store.close(); }
});

test('9D.1a reconnection requires a generation and creates silent baseline', () => {
    const store = new OpenFinanceBaselineStore({ secret });
    try {
        store.ingestSnapshot(snapshot([transaction()]));
        assert.throws(() => store.ingestSnapshot(snapshot([transaction()], { itemId: 'item-daniel-2' })), /generation_required/);
        assert.deepEqual(store.startNewGeneration('daniel_nubank', 'item-daniel-2'), { generation: 2, baseline_required: true, alert_candidates: 0, financial_writes: 0 });
        const result = store.ingestSnapshot(snapshot([transaction({ id: 'tx-recovered' })], { itemId: 'item-daniel-2' }));
        assert.equal(result.baseline_items, 1);
        assert.equal(result.alert_candidates, 0);
    } finally { store.close(); }
});

test('9D.1a stores raw observations only as encrypted payload', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-baseline-'));
    const databasePath = path.join(dir, 'baseline.sqlite');
    const store = new OpenFinanceBaselineStore({ databasePath, secret });
    try { store.ingestSnapshot(snapshot([transaction()])); } finally { store.close(); }
    const bytes = fs.readFileSync(databasePath).toString('latin1');
    for (const forbidden of ['DESCRICAO PRIVADA', 'item-daniel-1', 'account-1', 'tx-1', 'daniel_nubank']) {
        assert.equal(bytes.includes(forbidden), false);
    }
});
