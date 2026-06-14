const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_TELEMETRY_PATH = path.resolve(process.cwd(), 'data', 'interpretation-reliability-shadow.jsonl');

const DEFAULT_THRESHOLDS = {
    minDecisions: 50,
    minObservationDays: 14,
    minDecisionsPerRequiredOperation: 10,
    minAutoSaveCandidatePrecision: 0.995,
    maxAmbiguousAutoSaveViolations: 0,
    maxAdditionalGeminiCalls: 0,
    maxEvaluationLatencyP95Ms: 50,
    requiredOperations: ['expense.create', 'income.create']
};

const WRITE_OUTCOMES = new Set(['write_attempt', 'auto_write_attempt']);

function parseShadowTelemetryJsonl(raw = '') {
    const entries = [];
    let invalidLines = 0;

    for (const line of String(raw || '').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === 'object') {
                entries.push(parsed);
            } else {
                invalidLines += 1;
            }
        } catch (_) {
            invalidLines += 1;
        }
    }

    return { entries, invalidLines };
}

function loadShadowTelemetry(filePath = DEFAULT_TELEMETRY_PATH) {
    if (!fs.existsSync(filePath)) {
        return { entries: [], invalidLines: 0, missingFile: true };
    }
    return {
        ...parseShadowTelemetryJsonl(fs.readFileSync(filePath, 'utf8')),
        missingFile: false
    };
}

function evaluateEnforceReadiness(entries = [], options = {}) {
    const thresholds = {
        ...DEFAULT_THRESHOLDS,
        ...(options.thresholds || {})
    };
    const now = options.now ? new Date(options.now) : new Date();
    const shadowEntries = entries.filter(entry => entry?.mode === 'shadow');
    const invalidLines = Number(options.invalidLines || 0);
    const blockers = [];
    const warnings = [];

    const byOperation = {};
    const byAction = {};
    let criticalDivergences = 0;
    let autoSaveCandidates = 0;
    let alignedAutoSaveCandidates = 0;
    let ambiguousDecisions = 0;
    let ambiguousAutoSaveViolations = 0;
    let additionalGeminiCalls = 0;
    let missingGeminiCallEvidence = 0;

    const timestamps = [];
    const evaluationLatencies = [];
    for (const entry of shadowEntries) {
        byOperation[entry.operation || 'unknown'] = (byOperation[entry.operation || 'unknown'] || 0) + 1;
        byAction[entry.action || 'unknown'] = (byAction[entry.action || 'unknown'] || 0) + 1;
        if (isCriticalDivergence(entry)) criticalDivergences += 1;
        if (entry.action === 'execute') {
            autoSaveCandidates += 1;
            if (String(entry.divergenceSeverity || 'none').toLowerCase() === 'none') {
                alignedAutoSaveCandidates += 1;
            }
        } else if (['confirm', 'clarify', 'block'].includes(entry.action)) {
            ambiguousDecisions += 1;
            if (WRITE_OUTCOMES.has(String(entry.currentFlowOutcome || '').toLowerCase())) {
                ambiguousAutoSaveViolations += 1;
            }
        }
        if (Number.isInteger(entry.additionalGeminiCalls) && entry.additionalGeminiCalls >= 0) {
            additionalGeminiCalls += entry.additionalGeminiCalls;
        } else {
            missingGeminiCallEvidence += 1;
        }
        if (Number.isFinite(entry.evaluationLatencyMs) && entry.evaluationLatencyMs >= 0) {
            evaluationLatencies.push(entry.evaluationLatencyMs);
        }
        const ts = Date.parse(entry.ts);
        if (Number.isFinite(ts)) timestamps.push(ts);
    }

    const firstSeenAt = timestamps.length ? new Date(Math.min(...timestamps)) : null;
    const lastSeenAt = timestamps.length ? new Date(Math.max(...timestamps)) : null;
    const observationWindowDays = firstSeenAt
        ? Math.max(0, (now.getTime() - firstSeenAt.getTime()) / (24 * 60 * 60 * 1000))
        : 0;
    const autoSaveCandidatePrecision = autoSaveCandidates > 0
        ? alignedAutoSaveCandidates / autoSaveCandidates
        : 0;
    const evaluationLatencyP95Ms = percentile(evaluationLatencies, 0.95);

    if (invalidLines > 0) blockers.push('invalid_telemetry_lines');
    if (shadowEntries.length < thresholds.minDecisions) blockers.push('not_enough_decisions');
    if (observationWindowDays < thresholds.minObservationDays) blockers.push('observation_window_too_short');
    if (criticalDivergences > 0) blockers.push('critical_divergence_found');
    if (autoSaveCandidates === 0) blockers.push('no_auto_save_candidate_evidence');
    if (autoSaveCandidatePrecision < thresholds.minAutoSaveCandidatePrecision) blockers.push('auto_save_precision_below_threshold');
    if (ambiguousAutoSaveViolations > thresholds.maxAmbiguousAutoSaveViolations) blockers.push('ambiguous_auto_save_violation');
    if (additionalGeminiCalls > thresholds.maxAdditionalGeminiCalls) blockers.push('extra_gemini_calls_detected');
    if (missingGeminiCallEvidence > 0) blockers.push('missing_gemini_call_evidence');
    if (evaluationLatencies.length < shadowEntries.length) blockers.push('missing_latency_evidence');
    if (evaluationLatencyP95Ms > thresholds.maxEvaluationLatencyP95Ms) blockers.push('evaluation_latency_too_high');

    for (const operation of thresholds.requiredOperations || []) {
        if ((byOperation[operation] || 0) < thresholds.minDecisionsPerRequiredOperation) {
            blockers.push(`missing_required_operation:${operation}`);
        }
    }

    const enforceEntries = entries.filter(entry => entry?.mode === 'enforce').length;
    if (enforceEntries > 0) {
        warnings.push('enforce_entries_present_in_shadow_readiness_report');
    }

    return {
        readyForManualReview: blockers.length === 0,
        recommendedMode: blockers.length === 0 ? 'manual_review_for_enforce' : 'keep_shadow',
        blockers,
        warnings,
        totalEntries: entries.length,
        shadowEntries: shadowEntries.length,
        invalidLines,
        criticalDivergences,
        autoSaveCandidates,
        alignedAutoSaveCandidates,
        autoSaveCandidatePrecision: Number(autoSaveCandidatePrecision.toFixed(4)),
        ambiguousDecisions,
        ambiguousAutoSaveViolations,
        additionalGeminiCalls,
        missingGeminiCallEvidence,
        evaluationLatencyP95Ms,
        firstSeenAt: firstSeenAt ? firstSeenAt.toISOString() : '',
        lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : '',
        observationWindowDays: Number(observationWindowDays.toFixed(2)),
        byOperation,
        byAction,
        thresholds
    };
}

function percentile(values = [], percentileValue = 0.95) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.max(0, Math.ceil(sorted.length * percentileValue) - 1);
    return Number(sorted[index].toFixed(2));
}

function isCriticalDivergence(entry = {}) {
    const severity = String(entry.divergenceSeverity || entry.divergence?.severity || '').toLowerCase();
    return severity === 'critical';
}

function buildEnforceReadinessReport({ telemetryPath = DEFAULT_TELEMETRY_PATH, now, thresholds } = {}) {
    const loaded = loadShadowTelemetry(telemetryPath);
    const report = evaluateEnforceReadiness(loaded.entries, {
        now,
        thresholds,
        invalidLines: loaded.invalidLines
    });
    return {
        ...report,
        telemetryPath,
        missingFile: loaded.missingFile
    };
}

module.exports = {
    DEFAULT_TELEMETRY_PATH,
    buildEnforceReadinessReport,
    evaluateEnforceReadiness,
    loadShadowTelemetry,
    parseShadowTelemetryJsonl,
    __test__: {
        percentile
    }
};
