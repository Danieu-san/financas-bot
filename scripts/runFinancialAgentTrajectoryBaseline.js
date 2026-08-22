const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { runFinancialAgentAcceptanceBattery } = require('./runFinancialAgentAcceptanceBattery');

const CRITICAL_CASE_IDS = Object.freeze([
    'GAST-001', 'GAST-012', 'CARD-001', 'CARD-019', 'INCOME-001',
    'TRANS-001', 'BUDG-001', 'GOAL-001', 'DEBT-001', 'BILL-001',
    'BILL-015', 'FAM-001', 'DASH-001', 'ADV-001', 'FUP-001'
]);
const READ_ONLY_AGENT_TOOLS = new Set([
    'query_financial_plan', 'list_recent_transactions',
    'get_dashboard_snapshot', 'explain_metric', 'none'
]);

function increment(counter, key) {
    const normalized = String(key || 'none');
    counter[normalized] = (counter[normalized] || 0) + 1;
}

function summarizeTrajectories(results = []) {
    const summary = {
        total: results.length,
        accepted: results.filter(item => item.accepted).length,
        gaps: results.filter(item => !item.accepted).length,
        byDomain: {},
        byOperation: {},
        byTool: {},
        bySource: {},
        byCoverage: {},
        byFallback: {},
        byPlanner: {},
        verified: 0,
        readOnly: 0,
        missingTrajectory: 0,
        writeCapableToolExecutions: 0
    };
    for (const item of results) {
        const trajectory = item.trajectory;
        if (!trajectory) {
            summary.missingTrajectory += 1;
            increment(summary.byDomain, item.stage || 'none');
            continue;
        }
        increment(summary.byDomain, trajectory.executedPlan?.domain || item.stage || 'none');
        increment(summary.byOperation, trajectory.executedPlan?.operation || trajectory.decision?.action || 'none');
        increment(summary.byTool, trajectory.tool?.name || 'none');
        increment(summary.bySource, trajectory.tool?.source || 'none');
        increment(summary.byCoverage, trajectory.coverage?.status || 'none');
        increment(summary.byFallback, trajectory.tool?.fallbackReason || 'none');
        increment(summary.byPlanner, trajectory.decision?.plannerSource || 'none');
        if (!READ_ONLY_AGENT_TOOLS.has(String(trajectory.tool?.name || 'none'))) {
            summary.writeCapableToolExecutions += 1;
        }
        if (trajectory.verification?.ok) summary.verified += 1;
        if (trajectory.readOnly === true) summary.readOnly += 1;
    }
    return summary;
}

function buildSourceProjection(results = []) {
    return results.map(item => ({
        id: String(item.id || ''),
        accepted: Boolean(item.accepted),
        trajectoryPresent: Boolean(item.trajectory),
        action: item.trajectory?.decision?.action || item.action || 'none',
        domain: item.trajectory?.executedPlan?.domain || item.stage || 'none',
        operation: item.trajectory?.executedPlan?.operation || 'none',
        tool: item.trajectory?.tool?.name || 'none',
        source: item.trajectory?.tool?.source || 'none',
        coverage: item.trajectory?.coverage?.status || 'none',
        readOnly: item.trajectory?.readOnly === true,
        verified: item.trajectory?.verification?.ok === true
    }));
}

function sourceEvidenceFingerprint(projection = []) {
    return crypto.createHash('sha256').update(JSON.stringify(projection)).digest('hex');
}

function buildSanitizedBaseline(report = {}) {
    const results = Array.isArray(report.results) ? report.results : [];
    const sourceProjection = buildSourceProjection(results);
    const byId = new Map(results.map(item => [item.id, item]));
    const critical = CRITICAL_CASE_IDS.map(id => ({
        id,
        present: byId.has(id),
        accepted: Boolean(byId.get(id)?.accepted),
        action: byId.get(id)?.trajectory?.decision?.action || byId.get(id)?.action || 'none',
        domain: byId.get(id)?.trajectory?.executedPlan?.domain || byId.get(id)?.stage || 'none',
        coverage: byId.get(id)?.trajectory?.coverage?.status || byId.get(id)?.stage || 'none'
    }));
    return {
        schemaVersion: 1,
        gate: 'ARQ-01',
        sourceRunId: String(report.run_id || ''),
        startedAt: String(report.started_at || ''),
        finishedAt: String(report.finished_at || ''),
        syntheticOnly: report.synthetic_user_only === true,
        sourceEvidenceFingerprint: sourceEvidenceFingerprint(sourceProjection),
        sourceProjection,
        rawQuestionsIncluded: false,
        rawAnswersIncluded: false,
        summary: summarizeTrajectories(results),
        critical: {
            required: CRITICAL_CASE_IDS.length,
            accepted: critical.filter(item => item.present && item.accepted).length,
            cases: critical
        }
    };
}

function validateSanitizedBaseline(baseline = {}, expectedTotal = 265) {
    const errors = [];
    const summary = baseline.summary || {};
    const projection = Array.isArray(baseline.sourceProjection) ? baseline.sourceProjection : null;
    if (summary.total !== expectedTotal) errors.push('unexpected_total');
    if (summary.accepted !== summary.total || summary.gaps !== 0) errors.push('acceptance_gap');
    if (summary.missingTrajectory !== 0) errors.push('missing_trajectory');
    if (summary.readOnly !== summary.total) errors.push('non_readonly_trajectory');
    if (summary.writeCapableToolExecutions !== 0) errors.push('write_capable_tool_executed');
    if (baseline.critical?.accepted !== baseline.critical?.required) errors.push('critical_gap');
    if (!projection || projection.length !== expectedTotal) {
        errors.push('invalid_source_projection');
    } else {
        const derived = {
            total: projection.length,
            accepted: projection.filter(item => item.accepted === true).length,
            gaps: projection.filter(item => item.accepted !== true).length,
            missingTrajectory: projection.filter(item => item.trajectoryPresent !== true).length,
            readOnly: projection.filter(item => item.readOnly === true).length,
            writeCapableToolExecutions: projection.filter(item => !READ_ONLY_AGENT_TOOLS.has(String(item.tool || 'none'))).length
        };
        for (const key of Object.keys(derived)) {
            if (summary[key] !== derived[key]) errors.push(`summary_projection_mismatch:${key}`);
        }
        const criticalAccepted = CRITICAL_CASE_IDS.filter(id => {
            const item = projection.find(candidate => candidate.id === id);
            return item?.accepted === true;
        }).length;
        if (baseline.critical?.required !== CRITICAL_CASE_IDS.length
            || baseline.critical?.accepted !== criticalAccepted) {
            errors.push('critical_projection_mismatch');
        }
    }
    if (!/^[a-f0-9]{64}$/.test(String(baseline.sourceEvidenceFingerprint || ''))) {
        errors.push('invalid_source_fingerprint');
    } else if (projection
        && sourceEvidenceFingerprint(projection) !== baseline.sourceEvidenceFingerprint) {
        errors.push('source_fingerprint_mismatch');
    }
    return { ok: errors.length === 0, errors };
}

async function runTrajectoryBaseline(options = {}) {
    const runId = options.runId || `ARQ01_${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
    const { report, reportDir } = await runFinancialAgentAcceptanceBattery({ runId });
    const baseline = buildSanitizedBaseline(report);
    const validation = validateSanitizedBaseline(baseline);
    baseline.validation = validation;
    const outputPath = path.join(reportDir, 'financial-agent-trajectory-baseline-sanitized.json');
    fs.writeFileSync(outputPath, JSON.stringify(baseline, null, 2), 'utf8');
    return { baseline, outputPath, reportDir };
}

async function main() {
    const { baseline, outputPath } = await runTrajectoryBaseline();
    console.log(`[financial-agent-trajectory-baseline] report=${outputPath}`);
    console.log(`[financial-agent-trajectory-baseline] total=${baseline.summary.total} accepted=${baseline.summary.accepted} gaps=${baseline.summary.gaps} critical=${baseline.critical.accepted}/${baseline.critical.required}`);
    if (!baseline.validation.ok) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = {
    CRITICAL_CASE_IDS,
    summarizeTrajectories,
    buildSourceProjection,
    sourceEvidenceFingerprint,
    buildSanitizedBaseline,
    validateSanitizedBaseline,
    runTrajectoryBaseline
};
