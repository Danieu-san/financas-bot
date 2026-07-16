const fs = require('node:fs');
const path = require('node:path');

const CANDIDATES = [
    'debt_update_handler',
    'debt_avalanche_service',
    'financial_health_service',
    'legacy_auth_utility',
    'date_time_normalizer',
    'financial_query_spec',
    'financial_undo_service'
];

function parseSince(argv) {
    const index = argv.indexOf('--since');
    const value = index >= 0 ? argv[index + 1] : null;
    if (value && !Number.isFinite(Date.parse(value))) throw new Error('valid_tripwire_since_required');
    return value ? new Date(value).toISOString() : null;
}

function main({ env = process.env, since = null } = {}) {
    const file = env.LEGACY_USAGE_TELEMETRY_PATH || path.resolve(process.cwd(), 'data', 'legacy-usage-telemetry.jsonl');
    if (!fs.existsSync(file)) throw new Error('legacy_telemetry_unavailable');
    const counts = Object.fromEntries(CANDIDATES.map(candidate => [candidate, 0]));
    const evidence = { runtime: 0, synthetic: 0, production_replay: 0, real_user: 0 };
    const schemaVersions = {};
    let invalidLines = 0;
    let considered = 0;
    let heartbeats = 0;
    let firstTripwireAt = null;
    let lastTripwireAt = null;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)) {
        let entry;
        try { entry = JSON.parse(line); } catch (_) { invalidLines += 1; continue; }
        if (since && Date.parse(entry.logged_at) < Date.parse(since)) continue;
        considered += 1;
        schemaVersions[entry.schema_version] = (schemaVersions[entry.schema_version] || 0) + 1;
        if (entry.event === 'heartbeat') heartbeats += 1;
        if (entry.event !== 'tripwire' || !CANDIDATES.includes(entry.candidate)) continue;
        counts[entry.candidate] += 1;
        if (Object.hasOwn(evidence, entry.evidence_type)) evidence[entry.evidence_type] += 1;
        firstTripwireAt = !firstTripwireAt || entry.logged_at < firstTripwireAt ? entry.logged_at : firstTripwireAt;
        lastTripwireAt = !lastTripwireAt || entry.logged_at > lastTripwireAt ? entry.logged_at : lastTripwireAt;
    }
    return {
        schema_version: 1,
        generated_at: new Date().toISOString(),
        observation_since: since,
        considered_events: considered,
        invalid_lines: invalidLines,
        telemetry_schema_versions: schemaVersions,
        heartbeats,
        tripwires: counts,
        evidence_types: evidence,
        first_tripwire_at: firstTripwireAt,
        last_tripwire_at: lastTripwireAt,
        financial_values_exposed: 0,
        financial_writes: 0
    };
}

if (require.main === module) {
    process.stdout.write(`${JSON.stringify(main({ since: parseSince(process.argv.slice(2)) }), null, 2)}\n`);
}

module.exports = { CANDIDATES, parseSince, main };
