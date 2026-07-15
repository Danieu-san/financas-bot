const test = require('node:test');
const assert = require('node:assert');

const { summarizeDashboardAdoptionEntries } = require('../src/telemetry/dashboardAdoptionReport');

test('dashboard adoption report separates human sessions from technical requests without exposing refs', () => {
    const entries = [
        { logged_at: '2026-07-15T10:00:00.000Z', event: 'heartbeat', surface: 'telemetry' },
        { logged_at: '2026-07-15T10:01:00.000Z', consumer: 'dashboard_v1', reason_code: 'dashboard_link_issued', actor_ref: 'actor-a' },
        { logged_at: '2026-07-15T10:02:00.000Z', consumer: 'dashboard_v1', reason_code: 'dashboard_session_started', actor_ref: 'actor-a', session_ref: 'session-a' },
        { logged_at: '2026-07-15T10:03:00.000Z', consumer: 'dashboard_v1', reason_code: 'dashboard_refresh', actor_ref: 'actor-a', session_ref: 'session-a' },
        { logged_at: '2026-07-15T10:04:00.000Z', consumer: 'dashboard_v2', reason_code: 'dashboard_session_started', actor_ref: 'actor-b', session_ref: 'session-b' },
        { logged_at: '2026-07-15T10:05:00.000Z', consumer: 'dashboard_v2', reason_code: 'dashboard_api_request', actor_ref: 'actor-b', session_ref: '' },
        { logged_at: '2026-07-15T10:06:00.000Z', consumer: 'dashboard_v2', reason_code: 'dashboard_auth_failed', actor_ref: '', session_ref: '' },
        { logged_at: '2026-07-15T10:07:00.000Z', consumer: 'dashboard_v2', reason_code: 'dashboard_api_request', actor_ref: 'technical-actor', session_ref: 'technical-session' }
    ];

    const report = summarizeDashboardAdoptionEntries(entries, {
        since: '2026-07-15T00:00:00.000Z',
        now: new Date('2026-07-15T12:00:00.000Z')
    });

    assert.strictEqual(report.verdict, 'OBSERVING');
    assert.strictEqual(report.instrumentation.active, true);
    assert.strictEqual(report.instrumentation.heartbeats, 1);
    assert.deepStrictEqual(report.versions.v1, {
        events: 3,
        links_issued: 1,
        sessions_started: 1,
        rotating_actor_refs_observed: 1,
        rotating_session_refs_observed: 1,
        refreshes: 1,
        filter_changes: 0,
        api_requests_without_session: 0,
        auth_failed: 0,
        v2_disabled: 0
    });
    assert.strictEqual(report.versions.v2.sessions_started, 1);
    assert.strictEqual(report.versions.v2.api_requests_without_session, 1);
    assert.strictEqual(report.versions.v2.auth_failed, 1);
    assert.strictEqual(report.versions.v2.rotating_actor_refs_observed, 1);
    assert.strictEqual(report.versions.v2.rotating_session_refs_observed, 1);
    assert.strictEqual(report.removal_candidate, false);
    const serialized = JSON.stringify(report);
    assert.doesNotMatch(serialized, /actor-a|actor-b|session-a|session-b|technical/);
});

test('dashboard adoption report fails the instrumentation gate without heartbeat', () => {
    const report = summarizeDashboardAdoptionEntries([], {
        since: '2026-07-15T00:00:00.000Z',
        now: new Date('2026-07-15T12:00:00.000Z')
    });
    assert.strictEqual(report.verdict, 'NO_GO_INSTRUMENTATION');
    assert.strictEqual(report.instrumentation.active, false);
    assert.strictEqual(report.removal_candidate, false);
});
