const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { OpenFinanceStagingStore } = require('../src/openFinance/openFinanceStagingStore');
const { PluggySandboxMockTransport } = require('../src/openFinance/pluggySandboxMockTransport');
const { PluggySandboxWebhookProcessor } = require('../src/openFinance/pluggySandboxWebhook');
const { PluggySandboxWebhookWorker } = require('../src/openFinance/pluggySandboxWebhookWorker');

const fixturePath = path.join(__dirname, 'fixtures', 'pluggy-sandbox-snapshot.json');
const hmacSecret = 'sandbox-durable-inbox-hmac';
const webhookSecret = 'sandbox-durable-inbox-token';
const headers = { 'x-finbot-webhook-token': webhookSecret };

function runtime(databasePath, transportOptions = {}, workerOptions = {}) {
    const store = new OpenFinanceStagingStore({ databasePath, hmacSecret });
    const transport = new PluggySandboxMockTransport({ fixturePath, ...transportOptions });
    const processor = new PluggySandboxWebhookProcessor({ store, transport, webhookSecret });
    const worker = new PluggySandboxWebhookWorker({ store, processor, ...workerOptions });
    return { store, transport, processor, worker };
}

test('inbox criptografada sobrevive a restart sem persistir ids em claro', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-webhook-inbox-'));
    const databasePath = path.join(tempDir, 'inbox.sqlite');
    let first = runtime(databasePath);
    try {
        const result = first.worker.acceptAndEnqueue(headers, {
            event: 'item/updated', eventId: 'durable-event-001', itemId: 'sandbox-item-001'
        }, { now: '2026-07-15T16:00:00.000Z' });
        assert.equal(result.queued, true);
        const stored = first.store.db.prepare('SELECT encrypted_job, item_ref FROM staging_webhook_inbox').get();
        assert.equal(JSON.stringify(stored).includes('sandbox-item-001'), false);
        assert.equal(JSON.stringify(stored).includes('durable-event-001'), false);
        first.store.close();
        first = null;

        const second = runtime(databasePath);
        try {
            assert.equal(second.worker.runOnce({ now: '2026-07-15T16:00:01.000Z' }).outcome, 'staged');
            assert.deepEqual(second.store.webhookInboxStats(), { pending: 0, processing: 0, completed: 1, failed: 0 });
            assert.equal(second.store.db.prepare('SELECT encrypted_job FROM staging_webhook_inbox').get().encrypted_job, null);
        } finally {
            second.store.close();
        }
    } finally {
        if (first) first.store.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('inbox deduplica entrega repetida antes do processamento', () => {
    const { store, worker } = runtime(':memory:');
    try {
        const payload = { event: 'item/updated', eventId: 'durable-event-002', itemId: 'sandbox-item-001' };
        assert.equal(worker.acceptAndEnqueue(headers, payload).queued, true);
        assert.equal(worker.acceptAndEnqueue(headers, payload).replay, true);
        assert.equal(store.webhookInboxStats().pending, 1);
    } finally {
        store.close();
    }
});

test('worker agenda rate limit e nao processa antes da disponibilidade', () => {
    const { store, worker } = runtime(':memory:', { failuresBeforeSuccess: 1, retryAfterSeconds: 30 });
    try {
        worker.acceptAndEnqueue(headers, {
            event: 'item/updated', eventId: 'durable-event-003', itemId: 'sandbox-item-001'
        }, { now: '2026-07-15T17:00:00.000Z' });
        assert.equal(worker.runOnce({ now: '2026-07-15T17:00:00.000Z' }).outcome, 'retry');
        assert.equal(worker.runOnce({ now: '2026-07-15T17:00:29.000Z' }).outcome, 'idle');
        assert.equal(worker.runOnce({ now: '2026-07-15T17:00:30.000Z' }).outcome, 'staged');
        assert.equal(store.webhookInboxStats().completed, 1);
    } finally {
        store.close();
    }
});

test('job reclamado e interrompido volta a pending no restart', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-webhook-recover-'));
    const databasePath = path.join(tempDir, 'inbox.sqlite');
    let first = runtime(databasePath);
    try {
        first.worker.acceptAndEnqueue(headers, {
            event: 'item/updated', eventId: 'durable-event-004', itemId: 'sandbox-item-001'
        });
        assert.ok(first.store.claimNextWebhookJob());
        assert.equal(first.store.webhookInboxStats().processing, 1);
        first.store.close();
        first = null;
        const second = runtime(databasePath);
        try {
            assert.equal(second.store.webhookInboxStats().pending, 1);
            assert.equal(second.worker.runOnce().outcome, 'staged');
        } finally {
            second.store.close();
        }
    } finally {
        if (first) first.store.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
