const fs = require('node:fs');
const path = require('node:path');

const {
    parseAcceptanceBattery,
    evaluateAcceptanceCase
} = require('./runFinancialQueryAcceptanceBattery');
const { invokeFinancialAgent } = require('../src/agent/financialAgent');
const { ensureSqliteReady } = require('../src/services/sqliteReadModelService');

const INTERNAL_PATTERN = /\b(user_id|sheet_id|spreadsheet|token|secret|oauth|prompt|owner_hash|agentic-battery-user)\b/i;

function buildRunId(date = new Date()) {
    return `FAGENT_${date.toISOString().replace(/\D/g, '').slice(0, 14)}`;
}

function expectedAgentTool(plan = {}) {
    if (plan.domain === 'dashboard') {
        return plan.operation === 'explain' ? 'explain_metric' : 'get_dashboard_snapshot';
    }
    return 'query_financial_plan';
}

async function evaluateAgenticCase(testCase) {
    if (!ensureSqliteReady()) throw new Error('SQLite read-model indisponivel para caso agentic');
    const routed = evaluateAcceptanceCase(testCase);
    if (routed.blockedBeforePlan) {
        return {
            id: testCase.id,
            question: testCase.question,
            accepted: true,
            stage: 'security_gate',
            action: 'block',
            tool: '',
            verified: true,
            reason: routed.securityCategory || 'blocked_before_agent'
        };
    }

    const result = await invokeFinancialAgent({
        message: testCase.question,
        userIds: ['agentic-battery-user'],
        personByUserId: { 'agentic-battery-user': 'Usuario de teste' },
        financialQueryPlan: routed.safePlanShape,
        mode: 'shadow'
    });
    const answerLeaksInternalData = INTERNAL_PATTERN.test(String(result.answer || ''));
    const toolLeaksInternalData = INTERNAL_PATTERN.test(JSON.stringify(result.toolResult || {}));
    const expectedTool = routed.hasFinancialQueryPlan ? expectedAgentTool(routed.safePlanShape) : '';
    const toolMatches = !expectedTool || result.plan?.tool === expectedTool ||
        ['list_recent_transactions', 'run_safe_readonly_sql'].includes(result.plan?.tool);
    const expectedClarification = !routed.hasFinancialQueryPlan;
    const accepted = expectedClarification
        ? result.action === 'clarify' && !answerLeaksInternalData && !toolLeaksInternalData
        : result.action === 'answer' && Boolean(result.verified?.ok) && toolMatches && !answerLeaksInternalData && !toolLeaksInternalData;

    return {
        id: testCase.id,
        question: testCase.question,
        accepted,
        stage: result.plan?.source === 'llm_planner' ? 'llm_planner' : 'langgraph',
        action: result.action,
        tool: result.plan?.tool || '',
        verified: Boolean(result.verified?.ok),
        toolResultSafe: !toolLeaksInternalData,
        reason: result.plan?.reason || result.verified?.reason || '',
        expectedTool,
        routedDomain: routed.actual.domain,
        routedOperation: routed.actual.operation
    };
}

function summarize(results = []) {
    const gaps = results.filter(item => !item.accepted);
    return {
        total: results.length,
        accepted: results.length - gaps.length,
        gaps: gaps.length,
        securityBlocked: results.filter(item => item.stage === 'security_gate').length,
        verifiedAnswers: results.filter(item => item.action === 'answer' && item.verified).length,
        clarifications: results.filter(item => item.action === 'clarify').length,
        byTool: results.reduce((acc, item) => {
            const key = item.tool || item.stage || 'none';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {}),
        gapIds: gaps.map(item => item.id)
    };
}

async function runFinancialAgentAcceptanceBattery(options = {}) {
    if (!ensureSqliteReady()) throw new Error('SQLite read-model indisponivel para bateria agentic');
    const startedAt = new Date();
    const runId = options.runId || buildRunId(startedAt);
    const reportDir = path.resolve(options.reportDir || path.join('data', 'qa-runs', runId));
    const allCases = parseAcceptanceBattery(options.batteryPath);
    const cases = Number.isInteger(options.limit) ? allCases.slice(0, options.limit) : allCases;
    const results = [];
    for (const testCase of cases) {
        results.push(await evaluateAgenticCase(testCase));
    }
    const report = {
        run_id: runId,
        started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(),
        gemini_calls: 0,
        synthetic_user_only: true,
        summary: summarize(results),
        results
    };
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(path.join(reportDir, 'financial-agent-acceptance-report.json'), JSON.stringify(report, null, 2));
    return { report, reportDir };
}

async function main() {
    const strict = process.argv.includes('--strict');
    const { report, reportDir } = await runFinancialAgentAcceptanceBattery();
    console.log(`[financial-agent-battery] report=${reportDir}`);
    console.log(`[financial-agent-battery] total=${report.summary.total} accepted=${report.summary.accepted} gaps=${report.summary.gaps}`);
    console.log(`[financial-agent-battery] security_blocked=${report.summary.securityBlocked} verified_answers=${report.summary.verifiedAnswers} gemini_calls=${report.gemini_calls}`);
    if (strict && report.summary.gaps > 0) process.exitCode = 1;
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = {
    expectedAgentTool,
    evaluateAgenticCase,
    summarize,
    runFinancialAgentAcceptanceBattery
};
