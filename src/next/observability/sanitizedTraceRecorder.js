const ALLOWED_FIELDS = new Set([
    'event', 'code', 'coverage', 'phase', 'status', 'tool', 'duration_ms',
    'policy_version', 'failure_class'
]);
const SAFE_TOKEN = /^[A-Za-z0-9_.:-]{1,96}$/;

function normalizeEntry(entry) {
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
        if (typeof value !== 'string' || !SAFE_TOKEN.test(value)) throw new Error('unsafe_trace_payload');
        normalized[key] = value;
    }
    return Object.freeze(normalized);
}

function createSanitizedTraceRecorder() {
    const entries = [];
    return Object.freeze({
        record(entry) {
            entries.push(normalizeEntry(entry));
        },
        snapshot() {
            return entries.map(entry => ({ ...entry }));
        }
    });
}

module.exports = {
    createSanitizedTraceRecorder
};
