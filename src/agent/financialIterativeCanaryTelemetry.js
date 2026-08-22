const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_TELEMETRY_PATH = path.resolve(
    process.cwd(),
    'data',
    'financial-iterative-canary.jsonl'
);
const VALID_OUTCOMES = new Set(['promoted', 'fallback']);
const VALID_SOURCES = new Set(['central_read_model', 'personal_sheet']);

function sanitizeLabel(value, fallback = 'unknown') {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_.-]/g, '')
        .slice(0, 80);
    return normalized || fallback;
}

function sanitizeEnum(value, allowed, fallback) {
    const normalized = sanitizeLabel(value, fallback);
    return allowed.has(normalized) ? normalized : fallback;
}

function boundedReadCount(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(3, parsed));
}

function sanitizeFinancialIterativeCanaryAttempt(input = {}, { now = () => new Date() } = {}) {
    return {
        ts: now().toISOString(),
        schemaVersion: 'financial-iterative-canary-v1',
        domain: sanitizeLabel(input.domain),
        source: sanitizeEnum(input.source, VALID_SOURCES, 'unknown'),
        outcome: sanitizeEnum(input.outcome, VALID_OUTCOMES, 'fallback'),
        reason: sanitizeLabel(input.reason),
        readCount: boundedReadCount(input.readCount),
        candidateAction: sanitizeLabel(input.candidateAction || 'none', 'none'),
        adequacyStatus: sanitizeLabel(input.adequacyStatus),
        baselineAvailable: Boolean(input.baselineAvailable),
        sideEffectsZero: typeof input.sideEffectsZero === 'boolean'
            ? input.sideEffectsZero
            : null
    };
}

function recordFinancialIterativeCanaryAttempt(input = {}, options = {}) {
    const env = options.env || process.env;
    const telemetryPath = options.telemetryPath ||
        env.FINANCIAL_ITERATIVE_CANARY_TELEMETRY_PATH ||
        DEFAULT_TELEMETRY_PATH;
    const record = sanitizeFinancialIterativeCanaryAttempt(input, options);
    fs.mkdirSync(path.dirname(telemetryPath), { recursive: true });
    fs.appendFileSync(telemetryPath, `${JSON.stringify(record)}\n`, 'utf8');
    return { recorded: true, telemetryPath, record };
}

function increment(target, key) {
    target[key] = (target[key] || 0) + 1;
}

function summarizeFinancialIterativeCanaryTelemetry({
    telemetryPath = DEFAULT_TELEMETRY_PATH,
    since
} = {}) {
    const summary = {
        telemetryPath,
        total: 0,
        invalid: 0,
        first: null,
        last: null,
        byDomain: {},
        bySource: {},
        byOutcome: {},
        byReason: {}
    };
    const sinceMs = since ? Date.parse(since) : null;
    if (since && !Number.isFinite(sinceMs)) {
        throw new Error('financial_iterative_canary_invalid_since');
    }
    if (!fs.existsSync(telemetryPath)) return summary;
    for (const line of fs.readFileSync(telemetryPath, 'utf8').split(/\r?\n/)) {
        if (!line.trim()) continue;
        let entry;
        try {
            entry = JSON.parse(line);
        } catch (_) {
            summary.invalid += 1;
            continue;
        }
        const ts = String(entry.ts || '');
        if (sinceMs && (!ts || !Number.isFinite(Date.parse(ts)) || Date.parse(ts) < sinceMs)) {
            continue;
        }
        summary.total += 1;
        if (ts && (!summary.first || ts < summary.first)) summary.first = ts;
        if (ts && (!summary.last || ts > summary.last)) summary.last = ts;
        increment(summary.byDomain, sanitizeLabel(entry.domain));
        increment(summary.bySource, sanitizeEnum(entry.source, VALID_SOURCES, 'unknown'));
        increment(summary.byOutcome, sanitizeEnum(entry.outcome, VALID_OUTCOMES, 'fallback'));
        increment(summary.byReason, sanitizeLabel(entry.reason));
    }
    return summary;
}

module.exports = {
    DEFAULT_TELEMETRY_PATH,
    recordFinancialIterativeCanaryAttempt,
    sanitizeFinancialIterativeCanaryAttempt,
    summarizeFinancialIterativeCanaryTelemetry,
    __test__: { boundedReadCount, sanitizeLabel }
};
