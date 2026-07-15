const test = require('node:test');
const assert = require('node:assert');

const { summarizeCardSheetUsageEntries } = require('../src/telemetry/cardSheetUsageReport');

test('card sheet report aggregates only logical routes and never exposes references', () => {
    const entries = [
        { logged_at: '2026-07-15T10:00:00.000Z', event: 'heartbeat', surface: 'telemetry' },
        { logged_at: '2026-07-15T10:01:00.000Z', consumer: 'sheets_runtime', route: 'card_sheet_access', reason_code: 'card_sheet_unified_route', operation: 'read', actor_ref: 'private-actor' },
        { logged_at: '2026-07-15T10:02:00.000Z', consumer: 'sheets_runtime', route: 'card_sheet_access', reason_code: 'card_sheet_unified_route', operation: 'write', session_ref: 'private-session' },
        { logged_at: '2026-07-15T10:03:00.000Z', consumer: 'sheets_runtime', route: 'card_sheet_access', reason_code: 'card_sheet_legacy_route', operation: 'read', actor_ref: 'other-actor' },
        { logged_at: '2026-07-15T10:04:00.000Z', consumer: 'dashboard_v1', route: 'dashboard_api_v1', reason_code: 'dashboard_api_request', operation: 'open' }
    ];
    const report = summarizeCardSheetUsageEntries(entries, {
        since: '2026-07-15T00:00:00.000Z',
        now: new Date('2026-07-15T12:00:00.000Z')
    });

    assert.strictEqual(report.verdict, 'OBSERVING');
    assert.deepStrictEqual(report.routes.unified, { events: 2, reads: 1, writes: 1 });
    assert.deepStrictEqual(report.routes.legacy, { events: 1, reads: 1, writes: 0 });
    assert.strictEqual(report.removal_candidate, false);
    assert.doesNotMatch(JSON.stringify(report), /private|other-actor/);
});

test('card sheet report fails the instrumentation gate without heartbeat', () => {
    const report = summarizeCardSheetUsageEntries([], {
        now: new Date('2026-07-15T12:00:00.000Z')
    });
    assert.strictEqual(report.verdict, 'NO_GO_INSTRUMENTATION');
    assert.strictEqual(report.removal_candidate, false);
});
