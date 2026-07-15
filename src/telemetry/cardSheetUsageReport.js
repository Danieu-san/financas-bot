const { loadDashboardTelemetryEntries } = require('./dashboardAdoptionReport');

function emptyRouteSummary() {
    return { events: 0, reads: 0, writes: 0 };
}

function validSince(value) {
    if (!value) return 0;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function summarizeCardSheetUsageEntries(entries = [], options = {}) {
    const sinceMs = validSince(options.since);
    const now = options.now instanceof Date ? options.now : new Date();
    const routes = {
        unified: emptyRouteSummary(),
        legacy: emptyRouteSummary()
    };
    let heartbeats = 0;
    let consideredEvents = 0;

    for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;
        const loggedAtMs = Date.parse(entry.logged_at || '');
        if (sinceMs && (!Number.isFinite(loggedAtMs) || loggedAtMs < sinceMs)) continue;
        consideredEvents += 1;
        if (entry.event === 'heartbeat' && entry.surface === 'telemetry') {
            heartbeats += 1;
            continue;
        }
        if (entry.consumer !== 'sheets_runtime' || entry.route !== 'card_sheet_access') continue;
        const route = entry.reason_code === 'card_sheet_unified_route'
            ? routes.unified
            : entry.reason_code === 'card_sheet_legacy_route'
                ? routes.legacy
                : null;
        if (!route) continue;
        route.events += 1;
        if (entry.operation === 'read') route.reads += 1;
        if (entry.operation === 'write') route.writes += 1;
    }

    const active = heartbeats > 0;
    return {
        schema_version: 1,
        generated_at: now.toISOString(),
        since: sinceMs ? new Date(sinceMs).toISOString() : '',
        verdict: active ? 'OBSERVING' : 'NO_GO_INSTRUMENTATION',
        instrumentation: {
            active,
            heartbeats,
            considered_events: consideredEvents
        },
        routes,
        removal_candidate: false
    };
}

module.exports = {
    loadCardSheetTelemetryEntries: loadDashboardTelemetryEntries,
    summarizeCardSheetUsageEntries
};
