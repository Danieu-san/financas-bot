const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { main } = require('../scripts/reportLegacyTripwireObservation');

test('tripwire report filters by cutoff and emits only allowlisted counters', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tripwire-report-'));
    const file = path.join(directory, 'legacy.jsonl');
    fs.writeFileSync(file, [
        JSON.stringify({ schema_version: 1, logged_at: '2026-07-16T17:00:00.000Z', event: 'heartbeat' }),
        JSON.stringify({ schema_version: 2, logged_at: '2026-07-16T18:00:00.000Z', event: 'heartbeat' }),
        JSON.stringify({ schema_version: 2, logged_at: '2026-07-16T18:01:00.000Z', event: 'tripwire', candidate: 'legacy_auth_utility', evidence_type: 'runtime', secret: 'drop-me' }),
        '{invalid',
        ''
    ].join('\n'));
    const result = main({
        env: { LEGACY_USAGE_TELEMETRY_PATH: file },
        since: '2026-07-16T17:30:00.000Z'
    });
    assert.equal(result.considered_events, 2);
    assert.equal(result.invalid_lines, 1);
    assert.deepEqual(result.telemetry_schema_versions, { 2: 2 });
    assert.equal(result.heartbeats, 1);
    assert.equal(result.tripwires.legacy_auth_utility, 1);
    assert.equal(result.evidence_types.runtime, 1);
    assert.equal(JSON.stringify(result).includes('drop-me'), false);
    assert.equal(result.financial_values_exposed, 0);
    assert.equal(result.financial_writes, 0);
});
