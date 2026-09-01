const ALLOWED_FIELDS = new Set(['event', 'code', 'coverage', 'phase', 'tool', 'duration_ms']);
const ALLOWED_EVENTS = new Set(['turn_started', 'turn_failed', 'turn_completed', 'tool_result']);
const ALLOWED_CODES = new Set([
    'OK', 'tool_not_allowed', 'missing_authorized_scope', 'tool_adapter_unavailable',
    'budget_missing', 'BUDGET_EXHAUSTED', 'BUDGET_TIME_EXCEEDED',
    'tool_args_boundary_violation', 'tool_args_schema_violation',
    'invalid_tool_result', 'tool_result_schema_violation', 'tool_execution_failed',
    'claim_schema_invalid', 'claim_metric_mismatch', 'claim_entity_mismatch',
    'claim_period_type_mismatch', 'claim_period_mismatch', 'claim_time_basis_mismatch',
    'evidence_missing', 'coverage_insufficient', 'evidence_state_unproven',
    'evidence_refs_missing', 'UNCLASSIFIED_FAILURE'
]);
const ALLOWED_COVERAGE = new Set(['complete', 'partial', 'unavailable']);
const ALLOWED_PHASES = new Set(['read', 'verify']);

function normalizeEntry(entry, allowedTools) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('unsafe_trace_payload');
    const keys = Object.keys(entry);
    if (keys.length === 0 || keys.some(key => !ALLOWED_FIELDS.has(key))) throw new Error('unsafe_trace_payload');
    const normalized = {};
    for (const [key, value] of Object.entries(entry)) {
        if (key === 'duration_ms') {
            if (!Number.isFinite(value) || value < 0) throw new Error('unsafe_trace_payload');
            normalized[key] = value;
            continue;
        }
        if (typeof value !== 'string') throw new Error('unsafe_trace_payload');
        if (key === 'event' && !ALLOWED_EVENTS.has(value)) throw new Error('unsafe_trace_payload');
        if (key === 'phase' && !ALLOWED_PHASES.has(value)) throw new Error('unsafe_trace_payload');
        if (key === 'coverage' && !ALLOWED_COVERAGE.has(value)) throw new Error('unsafe_trace_payload');
        if (key === 'tool' && !allowedTools.has(value)) throw new Error('unsafe_trace_payload');
        normalized[key] = key === 'code' && !ALLOWED_CODES.has(value)
            ? 'UNCLASSIFIED_FAILURE'
            : value;
    }
    return Object.freeze(normalized);
}

function createSanitizedTraceRecorder({ allowedTools = [] } = {}) {
    const toolSet = new Set(allowedTools.map(value => String(value || '').trim()).filter(Boolean));
    const entries = [];
    return Object.freeze({
        record(entry) {
            entries.push(normalizeEntry(entry, toolSet));
        },
        snapshot() {
            return entries.map(entry => ({ ...entry }));
        }
    });
}

module.exports = {
    createSanitizedTraceRecorder
};
