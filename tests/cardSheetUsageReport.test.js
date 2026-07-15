const test = require('node:test');
const assert = require('node:assert');

const { summarizeCardSheetUsageEntries } = require('../src/telemetry/cardSheetUsageReport');

test('card sheet report aggregates only logical routes and never exposes references', () => {
    const entries = [
        { logged_at: '2026-07-15T10:00:00.000Z', event: 'heartbeat', surface: 'telemetry' },
        { logged_at: '2026-07-15T10:01:00.000Z', consumer: 'sheets_runtime', route: 'card_sheet_access', reason_code: 'card_sheet_unified_route', operation: 'read', actor_ref: 'private-actor' },
        { logged_at: '2026-07-15T10:02:00.000Z', consumer: 'sheets_runtime', route: 'card_sheet_access', reason_code: 'card_sheet_unified_route', operation: 'write', session_ref: 'private-session' },
        { logged_at: '2026-07-15T10:03:00.000Z', consumer: 'sheets_runtime', route: 'card_sheet_access', reason_code: 'card_sheet_legacy_route', operation: 'read', actor_ref: 'other-actor' },
        { logged_at: '2026-07-15T10:03:30.000Z', consumer: 'read_model_service', route: 'card_sheet_access', reason_code: 'card_sheet_legacy_route', operation: 'read' },
        { logged_at: '2026-07-15T10:03:31.000Z', consumer: 'whatsapp_budget', route: 'card_sheet_access', reason_code: 'card_sheet_unified_route', operation: 'read' },
        { logged_at: '2026-07-15T10:03:32.000Z', consumer: 'whatsapp_import_dedup', route: 'card_sheet_access', reason_code: 'card_sheet_legacy_route', operation: 'read' },
        { logged_at: '2026-07-15T10:03:33.000Z', consumer: 'whatsapp_deletion', route: 'card_sheet_access', reason_code: 'card_sheet_unified_route', operation: 'write' },
        { logged_at: '2026-07-15T10:03:40.000Z', consumer: 'card_parity_audit', route: 'card_sheet_access', reason_code: 'card_sheet_legacy_route', operation: 'read' },
        { logged_at: '2026-07-15T10:04:00.000Z', consumer: 'dashboard_v1', route: 'dashboard_api_v1', reason_code: 'dashboard_api_request', operation: 'open' }
    ];
    const report = summarizeCardSheetUsageEntries(entries, {
        since: '2026-07-15T00:00:00.000Z',
        now: new Date('2026-07-15T12:00:00.000Z')
    });

    assert.strictEqual(report.verdict, 'OBSERVING');
    assert.deepStrictEqual(report.routes.unified, { events: 4, reads: 2, writes: 2 });
    assert.deepStrictEqual(report.routes.legacy, { events: 3, reads: 3, writes: 0 });
    assert.deepStrictEqual(report.consumers.read_model_service, { events: 1, reads: 1, writes: 0 });
    assert.deepStrictEqual(report.consumers.whatsapp_budget, { events: 1, reads: 1, writes: 0 });
    assert.deepStrictEqual(report.consumers.whatsapp_import_dedup, { events: 1, reads: 1, writes: 0 });
    assert.deepStrictEqual(report.consumers.whatsapp_deletion, { events: 1, reads: 0, writes: 1 });
    assert.strictEqual(report.consumers.card_parity_audit, undefined);
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
