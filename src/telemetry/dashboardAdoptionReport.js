const fs = require('node:fs');

function emptyVersionSummary() {
    return {
        events: 0,
        links_issued: 0,
        sessions_started: 0,
        rotating_actor_refs_observed: 0,
        rotating_session_refs_observed: 0,
        refreshes: 0,
        filter_changes: 0,
        api_requests_without_session: 0,
        auth_failed: 0,
        v2_disabled: 0
    };
}

function validSince(value) {
    if (!value) return 0;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function summarizeDashboardAdoptionEntries(entries = [], options = {}) {
    const sinceMs = validSince(options.since);
    const now = options.now instanceof Date ? options.now : new Date();
    const versions = {
        v1: { summary: emptyVersionSummary(), actors: new Set(), sessions: new Set() },
        v2: { summary: emptyVersionSummary(), actors: new Set(), sessions: new Set() }
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
        const version = entry.consumer === 'dashboard_v1'
            ? versions.v1
            : entry.consumer === 'dashboard_v2'
                ? versions.v2
                : null;
        if (!version) continue;

        version.summary.events += 1;
        switch (entry.reason_code) {
        case 'dashboard_link_issued':
            version.summary.links_issued += 1;
            break;
        case 'dashboard_session_started':
            version.summary.sessions_started += 1;
            if (entry.actor_ref) version.actors.add(String(entry.actor_ref));
            if (entry.session_ref) version.sessions.add(String(entry.session_ref));
            break;
        case 'dashboard_refresh':
            version.summary.refreshes += 1;
            break;
        case 'dashboard_filter_change':
            version.summary.filter_changes += 1;
            break;
        case 'dashboard_api_request':
            if (!entry.session_ref) version.summary.api_requests_without_session += 1;
            break;
        case 'dashboard_auth_failed':
            version.summary.auth_failed += 1;
            break;
        case 'dashboard_v2_disabled':
            version.summary.v2_disabled += 1;
            break;
        default:
            break;
        }
    }

    for (const version of Object.values(versions)) {
        version.summary.rotating_actor_refs_observed = version.actors.size;
        version.summary.rotating_session_refs_observed = version.sessions.size;
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
        versions: {
            v1: versions.v1.summary,
            v2: versions.v2.summary
        },
        removal_candidate: false
    };
}

function loadDashboardTelemetryEntries(filePath, options = {}) {
    const maxBackups = Number.isInteger(options.maxBackups) ? options.maxBackups : 4;
    const files = [];
    for (let index = maxBackups; index >= 1; index -= 1) files.push(`${filePath}.${index}`);
    files.push(filePath);
    const entries = [];
    let invalidLines = 0;
    for (const candidate of files) {
        if (!fs.existsSync(candidate)) continue;
        for (const line of fs.readFileSync(candidate, 'utf8').split(/\r?\n/)) {
            if (!line.trim()) continue;
            try {
                entries.push(JSON.parse(line));
            } catch (_) {
                invalidLines += 1;
            }
        }
    }
    return { entries, invalidLines, filesRead: files.filter(candidate => fs.existsSync(candidate)).length };
}

module.exports = {
    summarizeDashboardAdoptionEntries,
    loadDashboardTelemetryEntries
};
