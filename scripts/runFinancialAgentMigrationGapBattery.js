require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

const { invokeFinancialAgent } = require('../src/agent/financialAgent');
const { ensureSqliteReady } = require('../src/services/sqliteReadModelService');
const { __test__: messageHandlerTest } = require('../src/handlers/messageHandler');

const INTERNAL_PATTERN = /\b(user_id|agent-[a-z0-9_-]+|sheet|spreadsheet|token|secret|oauth|prompt|raw|telefone|whatsapp)\b/i;
const SYNTHETIC_USER_ID = 'migration-gap-synthetic';
const SYNTHETIC_PERSON = 'Usuario de teste';

function buildRunId(date = new Date()) {
    return `FAGENT_MIGRATION_GAP_${date.toISOString().replace(/\D/g, '').slice(0, 14)}`;
}

function monthPeriod() {
    return { type: 'month', month: 6, year: 2026 };
}

function buildMigrationGapBatteryCases() {
    return [
        {
            id: 'MGAP-001',
            question: 'quanto economizei com promocoes este mes?',
            expectMigrationGap: true,
            expectedTag: 'engine_gap',
            expectedReason: 'planner_gap'
        },
        {
            id: 'MGAP-002',
            question: 'qual compra teve melhor custo beneficio este mes?',
            expectMigrationGap: true,
            expectedTag: 'engine_gap',
            expectedReason: 'planner_gap'
        },
        {
            id: 'MGAP-003',
            question: 'quanto gastei usando um filtro interno proibido?',
            expectMigrationGap: true,
            expectedTag: 'unsupported_filter',
            expectedTool: 'query_financial_plan',
            planFactory: () => ({
                domain: 'expenses',
                operation: 'sum',
                timeBasis: 'transaction_date',
                filters: { period: monthPeriod(), user_id: SYNTHETIC_USER_ID }
            })
        },
        {
            id: 'MGAP-004',
            question: 'quanto gastei em uma fonte privada inexistente?',
            expectMigrationGap: true,
            expectedTag: 'unsupported_filter',
            expectedTool: 'query_financial_plan',
            planFactory: () => ({
                domain: 'private_source',
                operation: 'sum',
                timeBasis: 'transaction_date',
                filters: { period: monthPeriod() }
            })
        },
        {
            id: 'MGAP-005',
            question: 'quanto gastei sem escopo autorizado?',
            expectMigrationGap: true,
            expectedTag: 'ambiguous_scope',
            expectedTool: 'query_financial_plan',
            userIds: [],
            personByUserId: {},
            planFactory: () => ({
                domain: 'expenses',
                operation: 'sum',
                timeBasis: 'transaction_date',
                filters: { period: monthPeriod() }
            })
        },
        {
            id: 'MGAP-006',
            question: 'quanto gastei agrupado por uma dimensao inexistente?',
            expectMigrationGap: true,
            expectedTag: 'unsupported_filter',
            expectedTool: 'query_financial_plan',
            planFactory: () => ({
                domain: 'expenses',
                operation: 'group',
                timeBasis: 'transaction_date',
                filters: { period: monthPeriod() },
                groupBy: ['weekday']
            })
        }
    ];
}

function caseInput(testCase = {}) {
    const userIds = Array.isArray(testCase.userIds) ? testCase.userIds : [SYNTHETIC_USER_ID];
    return {
        message: testCase.question,
        userIds,
        personByUserId: testCase.personByUserId || Object.fromEntries(userIds.map(id => [id, SYNTHETIC_PERSON])),
        financialQueryPlan: typeof testCase.planFactory === 'function' ? testCase.planFactory() : null,
        currentDate: '02/07/2026',
        mode: 'answer'
    };
}

function telemetryIsSafe(telemetry) {
    return !INTERNAL_PATTERN.test(JSON.stringify(telemetry || {}));
}

async function evaluateMigrationGapCase(testCase = {}) {
    const result = await invokeFinancialAgent(caseInput(testCase));
    const telemetry = messageHandlerTest.buildFinancialAgentMigrationGapTelemetry(result);
    const hasMigrationGap = Boolean(result.migrationGap);
    const telemetrySafe = telemetryIsSafe(telemetry);
    const expectedTagMatches = !testCase.expectedTag || telemetry?.tag === testCase.expectedTag;
    const expectedToolMatches = !testCase.expectedTool || telemetry?.tool === testCase.expectedTool;
    const didNotAnswerAsReady = result.action !== 'answer' || !result.verified?.ok;
    const accepted = Boolean(
        testCase.expectMigrationGap &&
        hasMigrationGap &&
        telemetry &&
        telemetrySafe &&
        expectedTagMatches &&
        expectedToolMatches &&
        didNotAnswerAsReady
    );

    return {
        id: testCase.id,
        question: testCase.question,
        accepted,
        action: result.action || 'unknown',
        hasMigrationGap,
        telemetrySafe,
        expectedTag: testCase.expectedTag || null,
        expectedTool: testCase.expectedTool || null,
        telemetry,
        reason: telemetry?.reason || null
    };
}

function summarizeMigrationGapResults(results = []) {
    const failed = results.filter(item => !item.accepted);
    return {
        total: results.length,
        accepted: results.length - failed.length,
        gaps: failed.length,
        expectedMigrationGaps: results.filter(item => item.hasMigrationGap).length,
        missingMigrationGap: results.filter(item => !item.hasMigrationGap).length,
        unsafeTelemetry: results.filter(item => !item.telemetrySafe).length,
        byTag: results.reduce((acc, item) => {
            const key = item.telemetry?.tag || 'none';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {}),
        byTool: results.reduce((acc, item) => {
            const key = item.telemetry?.tool || 'none';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {}),
        gapIds: failed.map(item => item.id)
    };
}

async function runFinancialAgentMigrationGapBattery(options = {}) {
    if (!ensureSqliteReady()) throw new Error('SQLite read-model indisponivel para bateria de migration gaps');
    const startedAt = new Date();
    const runId = options.runId || buildRunId(startedAt);
    const reportDir = path.resolve(options.reportDir || path.join('data', 'qa-runs', runId));
    const originalPlannerFlag = process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED;
    process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED = 'false';
    try {
        const allCases = buildMigrationGapBatteryCases();
        const cases = Number.isInteger(options.limit) ? allCases.slice(0, options.limit) : allCases;
        const results = [];
        for (const testCase of cases) {
            results.push(await evaluateMigrationGapCase(testCase));
        }
        const report = {
            run_id: runId,
            started_at: startedAt.toISOString(),
            finished_at: new Date().toISOString(),
            gemini_calls: 0,
            synthetic_user_only: true,
            llm_planner_enabled: false,
            summary: summarizeMigrationGapResults(results),
            results
        };
        fs.mkdirSync(reportDir, { recursive: true });
        fs.writeFileSync(path.join(reportDir, 'financial-agent-migration-gap-report.json'), JSON.stringify(report, null, 2));
        return { report, reportDir };
    } finally {
        if (originalPlannerFlag === undefined) delete process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED;
        else process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED = originalPlannerFlag;
    }
}

async function main() {
    const strict = !process.argv.includes('--no-strict');
    const limitArgIndex = process.argv.indexOf('--limit');
    const limit = limitArgIndex >= 0 ? Number.parseInt(process.argv[limitArgIndex + 1], 10) : undefined;
    const { report, reportDir } = await runFinancialAgentMigrationGapBattery({
        limit: Number.isInteger(limit) ? limit : undefined
    });
    console.log(`[financial-agent-migration-gap] report=${reportDir}`);
    console.log(`[financial-agent-migration-gap] total=${report.summary.total} accepted=${report.summary.accepted} gaps=${report.summary.gaps} missing=${report.summary.missingMigrationGap} unsafe=${report.summary.unsafeTelemetry}`);
    console.log(`[financial-agent-migration-gap] by_tag=${JSON.stringify(report.summary.byTag)} by_tool=${JSON.stringify(report.summary.byTool)} gemini_calls=${report.gemini_calls}`);
    if (strict && report.summary.gaps > 0) process.exitCode = 1;
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = {
    buildMigrationGapBatteryCases,
    evaluateMigrationGapCase,
    summarizeMigrationGapResults,
    runFinancialAgentMigrationGapBattery
};