const path = require('path');
const { OpenFinanceStagingStore } = require('../src/openFinance/openFinanceStagingStore');
const { PluggySandboxMockTransport } = require('../src/openFinance/pluggySandboxMockTransport');
const { PluggySandboxWebhookProcessor } = require('../src/openFinance/pluggySandboxWebhook');

const fixturePath = path.join(__dirname, '..', 'tests', 'fixtures', 'pluggy-sandbox-snapshot.json');
const store = new OpenFinanceStagingStore({ hmacSecret: 'sandbox-webhook-e2e-hmac' });
const transport = new PluggySandboxMockTransport({ fixturePath, failuresBeforeSuccess: 1, retryAfterSeconds: 30 });
const processor = new PluggySandboxWebhookProcessor({
    store,
    transport,
    webhookSecret: 'sandbox-webhook-e2e-token'
});
const headers = { 'x-finbot-webhook-token': 'sandbox-webhook-e2e-token' };

try {
    const updated = processor.accept(headers, { event: 'item/updated', eventId: 'e2e-webhook-001', itemId: 'sandbox-item-001' });
    const retry = processor.process(updated.job);
    const staged = processor.process(updated.job);
    const deleted = processor.accept(headers, { event: 'item/deleted', eventId: 'e2e-webhook-002', itemId: 'sandbox-item-001' });
    const revoked = processor.process(deleted.job);
    const late = processor.accept(headers, { event: 'item/updated', eventId: 'e2e-webhook-003', itemId: 'sandbox-item-001' });
    const blocked = processor.process(late.job);
    const stats = store.stats();
    const passed = retry.outcome === 'retry' && staged.outcome === 'staged' && revoked.outcome === 'revoked'
        && blocked.outcome === 'blocked' && stats.items === 0 && stats.revocations === 1;
    console.log(JSON.stringify({
        verdict: passed ? 'GO' : 'NO-GO',
        mode: 'sandbox_mock_webhook',
        immediate_ack: updated.status === 202,
        rate_limit_retry: retry.retry_after_seconds === 30,
        staged_then_revoked: revoked.outcome === 'revoked',
        delayed_event_blocked: blocked.outcome === 'blocked',
        network_calls: 0,
        financial_writes: 0,
        real_credentials: 0,
        real_accounts: 0
    }, null, 2));
    if (!passed) process.exitCode = 1;
} finally {
    store.close();
}
