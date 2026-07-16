const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { OpenFinanceAlertOutbox } = require('../src/openFinance/openFinanceAlertOutbox');
const { main } = require('../scripts/reportOpenFinanceOutboxStats');

test('outbox report exposes only counters and performs no transport or financial write', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'of-outbox-report-'));
    const databasePath = path.join(directory, 'outbox.sqlite');
    const secretPath = path.join(directory, 'secret');
    fs.writeFileSync(secretPath, 's'.repeat(48), { mode: 0o600 });
    const outbox = new OpenFinanceAlertOutbox({ databasePath, secret: 's'.repeat(48) });
    outbox.close();

    const result = main({
        OPEN_FINANCE_OUTBOX_DB: databasePath,
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: secretPath
    });
    assert.deepEqual(result.outbox, {
        total: 0,
        pending: 0,
        in_flight: 0,
        blocked: 0,
        accepted_unconfirmed: 0,
        delivered_confirmed: 0,
        legacy_sent: 0,
        sent: 0,
        transport_calls: 0,
        financial_writes: 0
    });
    assert.equal(result.payloads_exposed, 0);
    assert.equal(result.financial_writes, 0);
    assert.equal(result.transport_calls, 0);
});
