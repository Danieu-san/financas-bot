const assert = require('node:assert/strict');
const path = require('path');
const test = require('node:test');
const { OpenFinanceStagingStore } = require('../src/openFinance/openFinanceStagingStore');
const { PluggySandboxMockTransport } = require('../src/openFinance/pluggySandboxMockTransport');
const { PluggySandboxWebhookProcessor, normalizePluggyDataWebhook } = require('../src/openFinance/pluggySandboxWebhook');

const fixturePath = path.join(__dirname, 'fixtures', 'pluggy-sandbox-snapshot.json');
const hmacSecret = 'sandbox-webhook-hmac-secret';
const webhookSecret = 'sandbox-webhook-shared-token';
const headers = { 'x-finbot-webhook-token': webhookSecret };

function harness(transportOptions = {}) {
    const store = new OpenFinanceStagingStore({ hmacSecret });
    const transport = new PluggySandboxMockTransport({ fixturePath, ...transportOptions });
    const processor = new PluggySandboxWebhookProcessor({ store, transport, webhookSecret });
    return { store, transport, processor };
}

test('webhook aceita somente evento de dados autenticado', () => {
    const { store, processor } = harness();
    try {
        assert.throws(() => processor.accept({}, { event: 'item/updated' }), /webhook_unauthorized/);
        assert.throws(() => normalizePluggyDataWebhook({ event: 'payment_intent/completed', eventId: 'evt', itemId: 'item' }), /unsupported_or_non_data_webhook/);
        const accepted = processor.accept(headers, { event: 'item/updated', eventId: 'webhook-event-001', itemId: 'sandbox-item-001' });
        assert.equal(accepted.status, 202);
        assert.deepEqual(store.stats(), { events: 0, items: 0, accounts: 0, transactions: 0, bills: 0, revocations: 0 });
    } finally {
        store.close();
    }
});

test('processamento mockado atualiza staging e replay permanece idempotente', () => {
    const { store, processor, transport } = harness();
    try {
        const accepted = processor.accept(headers, { event: 'item/updated', eventId: 'webhook-event-002', itemId: 'sandbox-item-001' });
        assert.equal(processor.process(accepted.job).outcome, 'staged');
        assert.equal(processor.process(accepted.job).outcome, 'replay');
        assert.equal(transport.calls, 2);
        assert.equal(store.stats().transactions, 2);
    } finally {
        store.close();
    }
});

test('webhook de transacao apagada remove somente o id indicado', () => {
    const { store, processor } = harness();
    try {
        const initial = processor.accept(headers, { event: 'item/updated', eventId: 'webhook-event-003', itemId: 'sandbox-item-001' });
        processor.process(initial.job);
        const deleted = processor.accept(headers, {
            event: 'transactions/deleted',
            eventId: 'webhook-event-004',
            itemId: 'sandbox-item-001',
            transactionIds: ['sandbox-transaction-001']
        });
        assert.equal(processor.process(deleted.job).outcome, 'staged');
        assert.equal(store.stats().transactions, 1);
    } finally {
        store.close();
    }
});

test('rate limit produz retry controlado sem espera nem escrita', () => {
    const { store, processor } = harness({ failuresBeforeSuccess: 1, retryAfterSeconds: 45 });
    try {
        const accepted = processor.accept(headers, { event: 'item/updated', eventId: 'webhook-event-005', itemId: 'sandbox-item-001' });
        assert.deepEqual(processor.process(accepted.job), {
            outcome: 'retry', reason: 'rate_limited', retry_after_seconds: 45, network_calls: 0, financial_writes: 0
        });
        assert.equal(store.stats().items, 0);
        assert.equal(processor.process(accepted.job).outcome, 'staged');
    } finally {
        store.close();
    }
});

test('item deleted revoga staging e bloqueia evento posterior', () => {
    const { store, processor } = harness();
    try {
        const initial = processor.accept(headers, { event: 'item/created', eventId: 'webhook-event-006', itemId: 'sandbox-item-001' });
        processor.process(initial.job);
        const deleted = processor.accept(headers, { event: 'item/deleted', eventId: 'webhook-event-007', itemId: 'sandbox-item-001' });
        assert.equal(processor.process(deleted.job).outcome, 'revoked');
        const late = processor.accept(headers, { event: 'item/updated', eventId: 'webhook-event-008', itemId: 'sandbox-item-001' });
        assert.equal(processor.process(late.job).outcome, 'blocked');
        assert.equal(store.stats().items, 0);
    } finally {
        store.close();
    }
});
