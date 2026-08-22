const fs = require('node:fs');
const path = require('node:path');

const { runFinancialAgentAcceptanceBattery } = require('./runFinancialAgentAcceptanceBattery');

const CRITICAL_CASE_IDS = Object.freeze([
    'GAST-001', 'GAST-012', 'CARD-001', 'CARD-019', 'INCOME-001',
    'TRANS-001', 'BUDG-001', 'GOAL-001', 'DEBT-001', 'BILL-001',
    'BILL-015', 'FAM-001', 'DASH-001', 'ADV-001', 'FUP-001'
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
        missingTrajectory: 0
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
        if (trajectory.verification?.ok) summary.verified += 1;
        if (trajectory.readOnly === true) summary.readOnly += 1;
    }
    return summary;
}

function buildSanitizedBaseline(report = {}) {
    const results = Array.isArray(report.results) ? report.results : [];
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
        financialWrites: 0,
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

async function runTrajectoryBaseline(options = {}) {
    const runId = options.runId || `ARQ01_${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
    const { report, reportDir } = await runFinancialAgentAcceptanceBattery({ runId });
    const baseline = buildSanitizedBaseline(report);
    const outputPath = path.join(reportDir, 'financial-agent-trajectory-baseline-sanitized.json');
    fs.writeFileSync(outputPath, JSON.stringify(baseline, null, 2), 'utf8');
    return { baseline, outputPath, reportDir };
}

async function main() {
    const { baseline, outputPath } = await runTrajectoryBaseline();
    console.log(`[financial-agent-trajectory-baseline] report=${outputPath}`);
    console.log(`[financial-agent-trajectory-baseline] total=${baseline.summary.total} accepted=${baseline.summary.accepted} gaps=${baseline.summary.gaps} critical=${baseline.critical.accepted}/${baseline.critical.required}`);
    if (baseline.summary.gaps > 0 || baseline.critical.accepted !== baseline.critical.required || baseline.summary.missingTrajectory > 0) {
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
    buildSanitizedBaseline,
    runTrajectoryBaseline
};
