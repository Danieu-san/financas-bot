const assert = require('node:assert/strict');
const path = require('path');
const test = require('node:test');
const { OpenFinanceStagingStore } = require('../src/openFinance/openFinanceStagingStore');
const { PluggySandboxMockTransport } = require('../src/openFinance/pluggySandboxMockTransport');
const { PluggySandboxPollingWorker } = require('../src/openFinance/pluggySandboxPollingWorker');

const fixturePath = path.join(__dirname, 'fixtures', 'pluggy-sandbox-snapshot.json');

function harness(transportOptions = {}) {
    const store = new OpenFinanceStagingStore({ hmacSecret: 'sandbox-polling-test-hmac' });
    const transport = new PluggySandboxMockTransport({ fixturePath, ...transportOptions });
    const worker = new PluggySandboxPollingWorker({ store, transport });
    return { store, transport, worker };
}

test('polling faz staging e limita frequencia a quatro vezes ao dia', () => {
    const { store, worker } = harness();
    try {
        const first = worker.run('sandbox-item-001', { now: '2026-07-15T00:00:00.000Z', eventId: 'poll-event-001' });
        assert.equal(first.outcome, 'staged');
        assert.equal(first.next_allowed_at, '2026-07-15T06:00:00.000Z');
        assert.equal(worker.run('sandbox-item-001', { now: '2026-07-15T05:59:59.000Z', eventId: 'poll-event-002' }).reason, 'interval');
        assert.equal(worker.run('sandbox-item-001', { now: '2026-07-15T06:00:00.000Z', eventId: 'poll-event-002' }).outcome, 'staged');
    } finally {
        store.close();
    }
});

test('lease impede polling sobreposto e exige token correto para liberar', () => {
    const { store } = harness();
    try {
        const lease = store.acquirePollingLease('sandbox-item-001', { now: '2026-07-15T01:00:00.000Z' });
        assert.equal(lease.acquired, true);
        assert.equal(store.acquirePollingLease('sandbox-item-001', { now: '2026-07-15T01:01:00.000Z' }).reason, 'overlap');
        assert.equal(store.completePollingLease('sandbox-item-001', 'wrong-token', { now: '2026-07-15T01:02:00.000Z' }).completed, false);
        assert.equal(store.pollingStats().leased, 1);
    } finally {
        store.close();
    }
});

test('rate limit aplica backoff sem staging e libera no horario calculado', () => {
    const { store, worker } = harness({ failuresBeforeSuccess: 1, retryAfterSeconds: 60 });
    try {
        const failed = worker.run('sandbox-item-001', { now: '2026-07-15T02:00:00.000Z', eventId: 'poll-event-003' });
        assert.equal(failed.outcome, 'retry');
        assert.equal(failed.next_allowed_at, '2026-07-15T02:01:00.000Z');
        assert.equal(worker.run('sandbox-item-001', { now: '2026-07-15T02:00:59.000Z', eventId: 'poll-event-003' }).reason, 'interval');
        assert.equal(worker.run('sandbox-item-001', { now: '2026-07-15T02:01:00.000Z', eventId: 'poll-event-003' }).outcome, 'staged');
        assert.equal(store.pollingStats().failing, 0);
    } finally {
        store.close();
    }
});

test('item revogado permanece bloqueado pelo polling', () => {
    const { store, worker } = harness();
    try {
        store.revokeItem('sandbox-item-001');
        assert.equal(worker.run('sandbox-item-001', { now: '2026-07-15T03:00:00.000Z', eventId: 'poll-event-004' }).outcome, 'blocked');
        assert.equal(store.stats().items, 0);
    } finally {
        store.close();
    }
});
