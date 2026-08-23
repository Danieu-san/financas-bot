const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const DEFAULT_TELEMETRY_PATH = path.resolve(
    process.cwd(),
    'data',
    'financial-iterative-canary.jsonl'
);
const VALID_OUTCOMES = new Set(['selected', 'promoted', 'fallback']);
const VALID_SOURCES = new Set(['central_read_model', 'personal_sheet']);
const VALID_ADEQUACY_REASONS = new Set([
    'none',
    'unknown',
    'unavailable',
    'contained_error',
    'numerical_verification_failed',
    'empty_answer',
    'empty_question',
    'internal_data_leak',
    'invalid_percentage_relation',
    'invalid_plan_action',
    'invalid_tool_order',
    'invented_amount',
    'invented_count',
    'invented_percentage',
    'missing_executed_query_plan',
    'missing_plan_action',
    'missing_planned_tool',
    'missing_query_plan',
    'missing_recent_item',
    'missing_result_reference',
    'missing_tool_result',
    'period_label_mismatch',
    'tool_mismatch',
    'unexpected_tool_result',
    'wrong_latest_item',
    'wrong_percentage_components',
    'wrong_recent_order',
    'wrong_result_order',
    'person_unproven',
    'person_mismatch',
    'person_scope_unproven',
    'person_scope_mismatch',
    'answer_person_mismatch',
    'period_unproven',
    'period_mismatch',
    'time_basis_unproven',
    'time_basis_mismatch',
    'dimensions_unproven',
    'dimension_mismatch',
    'source_unproven',
    'missing_evidence',
    'source_unavailable',
    'empty_unproven',
    'absence_claim_unsupported',
    'coverage_unproven'
]);

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

function sanitizeReasonCode(value, fallback = 'unknown') {
    const normalized = String(value || '').trim().toLowerCase();
    return VALID_ADEQUACY_REASONS.has(normalized) ? normalized : fallback;
}

function boundedReadCount(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(3, parsed));
}

function sanitizeAttemptId(value, { createIfMissing = false } = {}) {
    const normalized = String(value || '').trim().toLowerCase();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
        return normalized;
    }
    return createIfMissing ? randomUUID() : '';
}

function sanitizeFinancialIterativeCanaryAttempt(input = {}, { now = () => new Date() } = {}) {
    return {
        ts: now().toISOString(),
        schemaVersion: 'financial-iterative-canary-v1',
        attemptId: sanitizeAttemptId(input.attemptId, { createIfMissing: true }),
        domain: sanitizeLabel(input.domain),
        source: sanitizeEnum(input.source, VALID_SOURCES, 'unknown'),
        outcome: sanitizeEnum(input.outcome, VALID_OUTCOMES, 'fallback'),
        reason: sanitizeLabel(input.reason),
        readCount: boundedReadCount(input.readCount),
        candidateAction: sanitizeLabel(input.candidateAction || 'none', 'none'),
        adequacyStatus: sanitizeLabel(input.adequacyStatus),
        adequacyReason: sanitizeReasonCode(input.adequacyReason || 'none'),
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
        byReason: {},
        attempts: {
            total: 0,
            promoted: 0,
            fallback: 0,
            pending: 0,
            conflicting: 0
        }
    };
    const sinceMs = since ? Date.parse(since) : null;
    if (since && !Number.isFinite(sinceMs)) {
        throw new Error('financial_iterative_canary_invalid_since');
    }
    if (!fs.existsSync(telemetryPath)) return summary;
    const attemptStates = new Map();
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
        const tsMs = Date.parse(ts);
        const attemptId = sanitizeAttemptId(entry.attemptId);
        const outcome = sanitizeLabel(entry.outcome);
        if (entry.schemaVersion !== 'financial-iterative-canary-v1' ||
            !attemptId || !Number.isFinite(tsMs) || !VALID_OUTCOMES.has(outcome)) {
            summary.invalid += 1;
            continue;
        }
        if (sinceMs && tsMs < sinceMs) {
            continue;
        }
        summary.total += 1;
        if (ts && (!summary.first || ts < summary.first)) summary.first = ts;
        if (ts && (!summary.last || ts > summary.last)) summary.last = ts;
        increment(summary.byDomain, sanitizeLabel(entry.domain));
        increment(summary.bySource, sanitizeEnum(entry.source, VALID_SOURCES, 'unknown'));
        increment(summary.byOutcome, outcome);
        increment(summary.byReason, sanitizeLabel(entry.reason));
        const state = attemptStates.get(attemptId) || { selected: false, terminals: new Set() };
        if (outcome === 'selected') state.selected = true;
        else state.terminals.add(outcome);
        attemptStates.set(attemptId, state);
    }
    summary.attempts.total = attemptStates.size;
    for (const state of attemptStates.values()) {
        if (state.terminals.size > 1) summary.attempts.conflicting += 1;
        else if (state.terminals.has('promoted')) summary.attempts.promoted += 1;
        else if (state.terminals.has('fallback')) summary.attempts.fallback += 1;
        else if (state.selected) summary.attempts.pending += 1;
    }
    return summary;
}

module.exports = {
    DEFAULT_TELEMETRY_PATH,
    recordFinancialIterativeCanaryAttempt,
    sanitizeReasonCode,
    sanitizeFinancialIterativeCanaryAttempt,
    summarizeFinancialIterativeCanaryTelemetry,
    __test__: { boundedReadCount, sanitizeAttemptId, sanitizeLabel, sanitizeReasonCode }
};
