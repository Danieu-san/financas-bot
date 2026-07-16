const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { main } = require('../scripts/runLegacyTripwireControlledProbe');

test('controlled tripwire probe is explicitly synthetic and performs no product route or write', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tripwire-probe-'));
    const file = path.join(directory, 'legacy.jsonl');
    const result = await main({
        argv: ['--confirm-controlled-probe'],
        env: {
            LEGACY_RETIREMENT_TRIPWIRE_ENABLED: 'true',
            LEGACY_RETIREMENT_SOFT_DISABLED_CANDIDATES: '',
            LEGACY_USAGE_TELEMETRY_ENABLED: 'true',
            LEGACY_USAGE_TELEMETRY_PATH: file,
            LEGACY_USAGE_TELEMETRY_HMAC_SECRET: 'synthetic-secret-long-enough'
        }
    });
    assert.equal(result.outcome, 'GO');
    assert.equal(result.evidence_type, 'synthetic');
    assert.equal(result.product_route_invoked, false);
    assert.equal(result.heartbeat_recorded, true);
    assert.equal(result.financial_writes, 0);
    const entries = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].event, 'tripwire');
    assert.equal(entries[0].candidate, 'legacy_auth_utility');
    assert.equal(entries[0].evidence_type, 'synthetic');
    assert.equal(entries[1].event, 'heartbeat');
});

test('controlled tripwire probe requires confirmation and an empty soft-disable list', async () => {
    await assert.rejects(() => main({ argv: [], env: {} }), /controlled_probe_confirmation_required/);
    await assert.rejects(() => main({
        argv: ['--confirm-controlled-probe'],
        env: {
            LEGACY_RETIREMENT_TRIPWIRE_ENABLED: 'true',
            LEGACY_RETIREMENT_SOFT_DISABLED_CANDIDATES: 'legacy_auth_utility'
        }
    }), /controlled_probe_requires_empty_soft_disable/);
});
