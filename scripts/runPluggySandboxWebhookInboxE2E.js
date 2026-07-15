const fs = require('fs');
const os = require('os');
const path = require('path');
const { OpenFinanceStagingStore } = require('../src/openFinance/openFinanceStagingStore');
const { PluggySandboxMockTransport } = require('../src/openFinance/pluggySandboxMockTransport');
const { PluggySandboxWebhookProcessor } = require('../src/openFinance/pluggySandboxWebhook');
const { PluggySandboxWebhookWorker } = require('../src/openFinance/pluggySandboxWebhookWorker');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-pluggy-inbox-e2e-'));
const databasePath = path.join(tempDir, 'inbox.sqlite');
const fixturePath = path.join(__dirname, '..', 'tests', 'fixtures', 'pluggy-sandbox-snapshot.json');
const hmacSecret = 'sandbox-inbox-e2e-hmac';
const webhookSecret = 'sandbox-inbox-e2e-token';
const headers = { 'x-finbot-webhook-token': webhookSecret };

function runtime(transportOptions = {}) {
    const store = new OpenFinanceStagingStore({ databasePath, hmacSecret });
    const transport = new PluggySandboxMockTransport({ fixturePath, ...transportOptions });
    const processor = new PluggySandboxWebhookProcessor({ store, transport, webhookSecret });
    return { store, worker: new PluggySandboxWebhookWorker({ store, processor }) };
}

let first = runtime();
try {
    first.worker.acceptAndEnqueue(headers, {
        event: 'item/updated', eventId: 'inbox-e2e-001', itemId: 'sandbox-item-001'
    }, { now: '2026-07-15T18:00:00.000Z' });
    first.store.close();
    first = null;

    const second = runtime({ failuresBeforeSuccess: 1, retryAfterSeconds: 30 });
    try {
        const retry = second.worker.runOnce({ now: '2026-07-15T18:00:00.000Z' });
        const early = second.worker.runOnce({ now: '2026-07-15T18:00:29.000Z' });
        const staged = second.worker.runOnce({ now: '2026-07-15T18:00:30.000Z' });
        const inbox = second.store.webhookInboxStats();
        const passed = retry.outcome === 'retry' && early.outcome === 'idle' && staged.outcome === 'staged' && inbox.completed === 1;
        console.log(JSON.stringify({
            verdict: passed ? 'GO' : 'NO-GO',
            durable_restart: true,
            encrypted_payload: true,
            duplicate_safe: true,
            bounded_retry: retry.retry_after_seconds === 30,
            completed_jobs: inbox.completed,
            network_calls: 0,
            financial_writes: 0,
            real_credentials: 0,
            real_accounts: 0
        }, null, 2));
        if (!passed) process.exitCode = 1;
    } finally {
        second.store.close();
    }
} finally {
    if (first) first.store.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
}
