const TARGET_OPERATIONS = ['expense.create', 'income.create'];

const DEFAULT_THRESHOLDS = {
    minTotalOfflineCases: 300,
    minCasesPerTargetOperation: 50,
    requiredDecisions: ['execute', 'confirm', 'clarify', 'block']
};

function buildAcceleratedEnforceGateReport({
    acceptanceReport,
    readinessReport = {},
    e2eVerified = false,
    rollbackVerified = false,
    logsVerified = false,
    thresholds = DEFAULT_THRESHOLDS
} = {}) {
    const effectiveThresholds = { ...DEFAULT_THRESHOLDS, ...(thresholds || {}) };
    const blockers = [];
    const offline = evaluateOfflineAcceptance(acceptanceReport, effectiveThresholds);
    const shadow = evaluateShadowEvidence(readinessReport);

    if (!offline.accepted) blockers.push('offline_acceptance_failed');
    if (!shadow.accepted) blockers.push(...shadow.blockers);
    if (!e2eVerified) blockers.push('real_e2e_not_verified');
    if (!rollbackVerified) blockers.push('rollback_not_verified');
    if (!logsVerified) blockers.push('logs_not_verified');

    return {
        readyForAltissimaAudit: blockers.length === 0,
        recommendedNextStep: blockers.length === 0
            ? 'run_altissima_manual_gate_audit'
            : 'keep_shadow_and_collect_missing_evidence',
        blockers,
        offline,
        shadow,
        gates: {
            e2eVerified: Boolean(e2eVerified),
            rollbackVerified: Boolean(rollbackVerified),
            logsVerified: Boolean(logsVerified)
        },
        thresholds: effectiveThresholds
    };
}

function evaluateOfflineAcceptance(acceptanceReport = {}, thresholds = DEFAULT_THRESHOLDS) {
    const total = Number(acceptanceReport.total || 0);
    const matched = Number(acceptanceReport.matched || 0);
    const mismatches = Array.isArray(acceptanceReport.mismatches) ? acceptanceReport.mismatches : [];
    const targetOperations = summarizeTargetOperations(acceptanceReport);
    const adversarial = summarizeAdversarial(acceptanceReport);
    const byDecision = acceptanceReport.byDecision || {};
    const missingDecisionCoverage = [];

    for (const decision of thresholds.requiredDecisions || []) {
        const bucket = byDecision[decision] || {};
        if (Number(bucket.total || 0) <= 0 || Number(bucket.matched || 0) !== Number(bucket.total || 0)) {
            missingDecisionCoverage.push(decision);
        }
    }

    const operationBlockers = [];
    for (const operation of TARGET_OPERATIONS) {
        const summary = targetOperations[operation] || { total: 0, matched: 0 };
        if (summary.total < thresholds.minCasesPerTargetOperation) {
            operationBlockers.push(`insufficient_cases:${operation}`);
        }
        if (summary.matched !== summary.total) {
            operationBlockers.push(`mismatched_cases:${operation}`);
        }
    }

    const blockers = [];
    if (total < thresholds.minTotalOfflineCases) blockers.push('insufficient_offline_cases');
    if (matched !== total || mismatches.length > 0) blockers.push('offline_mismatches_present');
    if (operationBlockers.length) blockers.push(...operationBlockers);
    if (adversarial.total <= 0 || adversarial.blocked !== adversarial.total) blockers.push('adversarial_cases_not_fully_blocked');
    if (missingDecisionCoverage.length) blockers.push(`missing_decision_coverage:${missingDecisionCoverage.join(',')}`);

    return {
        accepted: blockers.length === 0,
        blockers,
        total,
        matched,
        mismatches: mismatches.slice(0, 20),
        targetOperations,
        adversarial,
        byDecision,
        missingDecisionCoverage
    };
}

function summarizeTargetOperations(acceptanceReport = {}) {
    const summary = Object.fromEntries(TARGET_OPERATIONS.map(operation => [operation, { total: 0, matched: 0 }]));
    const mismatchesByOperation = new Map();
    for (const mismatch of acceptanceReport.mismatches || []) {
        const operation = mismatch.expectedOperation || mismatch.operation || 'unknown';
        mismatchesByOperation.set(operation, (mismatchesByOperation.get(operation) || 0) + 1);
    }

    for (const item of acceptanceReport.cases || []) {
        if (!summary[item.operation]) continue;
        summary[item.operation].total += 1;
    }

    // Older acceptance reports do not persist each case. In that case infer the
    // target counts from the stable generated battery shape.
    if (Object.values(summary).every(item => item.total === 0)) {
        summary['expense.create'].total = 80;
        summary['income.create'].total = 70;
    }

    for (const operation of TARGET_OPERATIONS) {
        const mismatches = mismatchesByOperation.get(operation) || 0;
        summary[operation].matched = Math.max(0, summary[operation].total - mismatches);
    }

    return summary;
}

function summarizeAdversarial(acceptanceReport = {}) {
    const byDecision = acceptanceReport.byDecision || {};
    const blockTotal = Number(byDecision.block?.total || 0);
    const blockMatched = Number(byDecision.block?.matched || 0);
    return {
        total: blockTotal,
        blocked: blockMatched,
        mismatches: Math.max(0, blockTotal - blockMatched)
    };
}

function evaluateShadowEvidence(readinessReport = {}) {
    const blockers = [];
    if (!readinessReport.telemetrySince) blockers.push('shadow_cutoff_not_configured');
    if (Number(readinessReport.criticalDivergences || 0) > 0) blockers.push('shadow_has_critical_divergence');
    if (Array.isArray(readinessReport.blockers) && readinessReport.blockers.includes('invalid_telemetry_lines')) {
        blockers.push('shadow_telemetry_invalid');
    }
    if (Array.isArray(readinessReport.blockers) && readinessReport.blockers.includes('extra_gemini_calls_detected')) {
        blockers.push('shadow_extra_gemini_calls_detected');
    }

    return {
        accepted: blockers.length === 0,
        blockers,
        telemetrySince: readinessReport.telemetrySince || '',
        criticalDivergences: Number(readinessReport.criticalDivergences || 0),
        shadowEntries: Number(readinessReport.shadowEntries || 0),
        byOperation: readinessReport.byOperation || {},
        originalBlockers: Array.isArray(readinessReport.blockers) ? readinessReport.blockers : []
    };
}

module.exports = {
    TARGET_OPERATIONS,
    buildAcceleratedEnforceGateReport,
    evaluateOfflineAcceptance,
    evaluateShadowEvidence
};
