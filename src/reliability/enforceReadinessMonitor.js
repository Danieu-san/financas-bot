const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_TELEMETRY_PATH = path.resolve(process.cwd(), 'data', 'interpretation-reliability-shadow.jsonl');

const DEFAULT_THRESHOLDS = {
    minDecisions: 50,
    minObservationDays: 14,
    minDecisionsPerRequiredOperation: 1,
    requiredOperations: ['expense.create', 'income.create']
};

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

    const timestamps = [];
    for (const entry of shadowEntries) {
        byOperation[entry.operation || 'unknown'] = (byOperation[entry.operation || 'unknown'] || 0) + 1;
        byAction[entry.action || 'unknown'] = (byAction[entry.action || 'unknown'] || 0) + 1;
        if (isCriticalDivergence(entry)) criticalDivergences += 1;
        const ts = Date.parse(entry.ts);
        if (Number.isFinite(ts)) timestamps.push(ts);
    }

    const firstSeenAt = timestamps.length ? new Date(Math.min(...timestamps)) : null;
    const lastSeenAt = timestamps.length ? new Date(Math.max(...timestamps)) : null;
    const observationWindowDays = firstSeenAt
        ? Math.max(0, (now.getTime() - firstSeenAt.getTime()) / (24 * 60 * 60 * 1000))
        : 0;

    if (invalidLines > 0) blockers.push('invalid_telemetry_lines');
    if (shadowEntries.length < thresholds.minDecisions) blockers.push('not_enough_decisions');
    if (observationWindowDays < thresholds.minObservationDays) blockers.push('observation_window_too_short');
    if (criticalDivergences > 0) blockers.push('critical_divergence_found');

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
        firstSeenAt: firstSeenAt ? firstSeenAt.toISOString() : '',
        lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : '',
        observationWindowDays: Number(observationWindowDays.toFixed(2)),
        byOperation,
        byAction,
        thresholds
    };
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
    parseShadowTelemetryJsonl
};
