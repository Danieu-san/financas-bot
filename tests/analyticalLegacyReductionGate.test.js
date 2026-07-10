const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    buildAnalyticalLegacyReductionDecision,
    runAnalyticalLegacyReductionGate,
    sanitizeAcceptanceSummaryForGate
} = require('../scripts/runAnalyticalLegacyReductionGate');
const { __test__: contextualFinancialAnalystTest } = require('../src/agent/contextualFinancialAnalyst');

test('analytical legacy reduction gate blocks when acceptance or migration telemetry has gaps', () => {
    const decision = buildAnalyticalLegacyReductionDecision({
        acceptanceSummary: { gaps: 1 },
        migrationGapSummary: { gaps: 0, missingMigrationGap: 1, unsafeTelemetry: 1 }
    });

    assert.strictEqual(decision.status, 'NO_GO');
    assert.deepStrictEqual(decision.blockers, [
        'financial_agent_acceptance_gaps',
        'missing_migration_gap_telemetry',
        'unsafe_migration_gap_telemetry'
    ]);
});

test('analytical legacy reduction gate keeps cost units in its sanitized report', () => {
    assert.deepStrictEqual(sanitizeAcceptanceSummaryForGate({
        total: 1,
        telemetry: {
            modelCalls: 1,
            inputTokens: 10,
            outputTokens: 4,
            estimatedCostUsd: 0.000039
        }
    }), {
        total: 1,
        telemetry: {
            modelCalls: 1,
            inputUnitsApprox: 10,
            outputUnitsApprox: 4,
            estimatedCostUsd: 0.000039
        }
    });
});

test('analytical legacy reduction gate writes a sanitized zero-Gemini GO report for sampled batteries', async () => {
    const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-analytical-gate-'));
    const originalPlannerFlag = process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED;
    const originalContextualFlag = process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE;
    let contextualCalls = 0;

    process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED = 'true';
    process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE = 'answer';
    contextualFinancialAnalystTest.setAskLLMOverride(async () => {
        contextualCalls += 1;
        throw new Error('contextual analyst should stay disabled during offline gate');
    });

    try {
        const { report } = await runAnalyticalLegacyReductionGate({
            reportDir,
            runId: 'ANALYTICAL_GATE_TEST',
            acceptanceLimit: 5,
            migrationGapLimit: 3
        });

        assert.strictEqual(process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED, 'true');
        assert.strictEqual(process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE, 'answer');
        assert.strictEqual(contextualCalls, 0);
        assert.strictEqual(report.decision.status, 'GO');
        assert.strictEqual(report.llm_planner_enabled, false);
        assert.strictEqual(report.contextual_analyst_enabled, false);
        assert.deepStrictEqual(report.decision.blockers, []);
        assert.strictEqual(report.gemini_calls, 0);
        assert.strictEqual(report.synthetic_user_only, true);
        assert.strictEqual(report.acceptance.summary.total, 5);
        assert.strictEqual(report.acceptance.summary.telemetry.inputUnitsApprox, 0);
        assert.strictEqual(report.migration_gaps.summary.total, 3);
        assert.strictEqual(fs.existsSync(path.join(reportDir, 'analytical-legacy-reduction-gate-report.json')), true);
        assert.doesNotMatch(JSON.stringify(report), /user_id|agent-daniel|sheet|spreadsheet|token|secret|raw/i);
    } finally {
        if (originalPlannerFlag === undefined) delete process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED;
        else process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED = originalPlannerFlag;
        if (originalContextualFlag === undefined) delete process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE;
        else process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE = originalContextualFlag;
        contextualFinancialAnalystTest.setAskLLMOverride(null);
    }
});
