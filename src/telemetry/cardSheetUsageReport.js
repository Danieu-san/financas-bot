const { loadDashboardTelemetryEntries } = require('./dashboardAdoptionReport');

function emptyRouteSummary() {
    return { events: 0, reads: 0, writes: 0 };
}

const RUNTIME_CONSUMERS = new Set([
    'sheets_runtime', 'read_model_service', 'scheduler', 'message_handler',
    'dashboard_v1', 'dashboard_v2', 'phase6_handler', 'maintenance_service',
    'whatsapp_budget', 'whatsapp_export', 'whatsapp_import_dedup',
    'whatsapp_deletion'
]);

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
    const consumers = {};
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
        if (!RUNTIME_CONSUMERS.has(entry.consumer) || entry.route !== 'card_sheet_access') continue;
        const route = entry.reason_code === 'card_sheet_unified_route'
            ? routes.unified
            : entry.reason_code === 'card_sheet_legacy_route'
                ? routes.legacy
                : null;
        if (!route) continue;
        route.events += 1;
        if (entry.operation === 'read') route.reads += 1;
        if (entry.operation === 'write') route.writes += 1;
        if (!consumers[entry.consumer]) consumers[entry.consumer] = emptyRouteSummary();
        consumers[entry.consumer].events += 1;
        if (entry.operation === 'read') consumers[entry.consumer].reads += 1;
        if (entry.operation === 'write') consumers[entry.consumer].writes += 1;
    }

    const active = heartbeats > 0;
    return {
        schema_version: 2,
        generated_at: now.toISOString(),
        since: sinceMs ? new Date(sinceMs).toISOString() : '',
        verdict: active ? 'OBSERVING' : 'NO_GO_INSTRUMENTATION',
        instrumentation: {
            active,
            heartbeats,
            considered_events: consideredEvents
        },
        routes,
        consumers,
        removal_candidate: false
    };
}

module.exports = {
    loadCardSheetTelemetryEntries: loadDashboardTelemetryEntries,
    summarizeCardSheetUsageEntries
};
