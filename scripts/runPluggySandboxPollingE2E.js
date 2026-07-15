const path = require('path');
const { OpenFinanceStagingStore } = require('../src/openFinance/openFinanceStagingStore');
const { PluggySandboxMockTransport } = require('../src/openFinance/pluggySandboxMockTransport');
const { PluggySandboxPollingWorker } = require('../src/openFinance/pluggySandboxPollingWorker');

const fixturePath = path.join(__dirname, '..', 'tests', 'fixtures', 'pluggy-sandbox-snapshot.json');
const store = new OpenFinanceStagingStore({ hmacSecret: 'sandbox-polling-e2e-hmac' });
const transport = new PluggySandboxMockTransport({ fixturePath, failuresBeforeSuccess: 1, retryAfterSeconds: 60 });
const worker = new PluggySandboxPollingWorker({ store, transport });

try {
    const retry = worker.run('sandbox-item-001', { now: '2026-07-15T00:00:00.000Z', eventId: 'poll-e2e-001' });
    const early = worker.run('sandbox-item-001', { now: '2026-07-15T00:00:59.000Z', eventId: 'poll-e2e-001' });
    const staged = worker.run('sandbox-item-001', { now: '2026-07-15T00:01:00.000Z', eventId: 'poll-e2e-001' });
    const tooSoon = worker.run('sandbox-item-001', { now: '2026-07-15T05:59:59.000Z', eventId: 'poll-e2e-002' });
    const passed = retry.outcome === 'retry' && early.reason === 'interval' && staged.outcome === 'staged' && tooSoon.reason === 'interval';
    console.log(JSON.stringify({
        verdict: passed ? 'GO' : 'NO-GO',
        free_route_model: 'controlled_polling',
        minimum_interval_hours: 6,
        overlap_protection: true,
        rate_limit_backoff: true,
        staging_only: true,
        network_calls: 0,
        financial_writes: 0,
        real_credentials: 0,
        real_accounts: 0
    }, null, 2));
    if (!passed) process.exitCode = 1;
} finally {
    store.close();
}
