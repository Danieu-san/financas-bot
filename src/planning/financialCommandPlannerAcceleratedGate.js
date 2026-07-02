const REQUIRED_OPERATIONS = Object.freeze([
    'bill.pay',
    'debt.pay',
    'invoice.pay',
    'expense.create'
]);

const REQUIRED_EVIDENCE = Object.freeze([
    'focusedTests',
    'plannerBattery',
    'ledgerParity',
    'degradedFallbacks',
    'idempotency',
    'dateBoundaries',
    'restartRecovery',
    'securityAndPrivacy',
    'productionE2E',
    'rollback',
    'cleanup'
]);

const FORBIDDEN_KEYS = new Set([
    'message',
    'messagebody',
    'senderid',
    'userid',
    'phone',
    'phonenumber',
    'spreadsheet',
    'spreadsheetid',
    'sheetid',
    'rawrows',
    'rawdata',
    'token',
    'secret',
    'prompt',
    'systemprompt'
]);

function buildFinancialCommandPlannerAcceleratedGateReport({
    telemetryEntries = [],
    evidence = {},
    plannerP95LimitMs = 15000,
    handlerP95LimitMs = 30000
} = {}) {
    const blockers = [];
    const coverage = Object.fromEntries(REQUIRED_OPERATIONS.map(operation => [
        operation,
        { routed: 0, saved: 0, cancelled: 0, replayed: 0 }
    ]));
    const plannerLatencies = [];
    const handlerLatencies = [];
    let invalid = 0;
    let critical = 0;
    let errors = 0;
    let sensitiveRecords = 0;

    for (const entry of telemetryEntries) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            invalid += 1;
            continue;
        }
        if (containsSensitiveData(entry)) sensitiveRecords += 1;
        if (entry.severity === 'critical') critical += 1;
        if (entry.outcome === 'error' || entry.outcome === 'planner_failed') errors += 1;
        collectLatency(plannerLatencies, entry.plannerLatencyMs);
        collectLatency(handlerLatencies, entry.handlerLatencyMs);

        const operationCoverage = coverage[entry.operation];
        if (!operationCoverage) continue;
        if (entry.stage === 'route' && entry.outcome === 'handled') operationCoverage.routed += 1;
        if (entry.outcome === 'saved') operationCoverage.saved += 1;
        if (entry.outcome === 'cancelled') operationCoverage.cancelled += 1;
        if (entry.outcome === 'replayed') operationCoverage.replayed += 1;
    }

    for (const operation of REQUIRED_OPERATIONS) {
        const operationCoverage = coverage[operation];
        if (!operationCoverage.routed) blockers.push(`${operation}:missing_route`);
        if (!operationCoverage.saved) blockers.push(`${operation}:missing_saved`);
        if (!operationCoverage.cancelled) blockers.push(`${operation}:missing_cancelled`);
    }
    if (!REQUIRED_OPERATIONS.some(operation => coverage[operation].replayed > 0)) {
        blockers.push('telemetry:missing_replay');
    }
    if (invalid) blockers.push('telemetry:invalid');
    if (critical) blockers.push('telemetry:critical');
    if (errors) blockers.push('telemetry:error');
    if (sensitiveRecords) blockers.push('telemetry:sensitive_data');

    const plannerP95Ms = percentile95(plannerLatencies);
    const handlerP95Ms = percentile95(handlerLatencies);
    if (plannerP95Ms !== null && plannerP95Ms > plannerP95LimitMs) {
        blockers.push('telemetry:planner_p95');
    }
    if (handlerP95Ms !== null && handlerP95Ms > handlerP95LimitMs) {
        blockers.push('telemetry:handler_p95');
    }

    for (const check of REQUIRED_EVIDENCE) {
        if (evidence[check] !== true) blockers.push(`evidence:${check}`);
    }

    return {
        decision: blockers.length ? 'NO-GO' : 'GO',
        ready: blockers.length === 0,
        blockers,
        evidence: Object.fromEntries(REQUIRED_EVIDENCE.map(check => [check, evidence[check] === true])),
        telemetry: {
            total: telemetryEntries.length,
            invalid,
            critical,
            errors,
            sensitiveRecords,
            plannerP95Ms,
            handlerP95Ms,
            plannerP95LimitMs,
            handlerP95LimitMs,
            coverage
        }
    };
}

function collectLatency(target, value) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) target.push(number);
}

function percentile95(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.ceil(sorted.length * 0.95) - 1];
}

function containsSensitiveData(value) {
    if (!value || typeof value !== 'object') return false;
    for (const [key, nested] of Object.entries(value)) {
        if (FORBIDDEN_KEYS.has(String(key).toLowerCase())) return true;
        if (nested && typeof nested === 'object' && containsSensitiveData(nested)) return true;
    }
    return false;
}

module.exports = {
    REQUIRED_OPERATIONS,
    REQUIRED_EVIDENCE,
    buildFinancialCommandPlannerAcceleratedGateReport,
    __test__: {
        containsSensitiveData,
        percentile95
    }
};
