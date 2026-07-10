const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    MAX_LIVE_CALLS_HARD_LIMIT,
    NOVEL_CASES,
    parseArgs,
    validateOptions,
    selectCases,
    dryRunCase,
    liveRunCase,
    runFinancialAgentNovelPlannerBattery
} = require('../scripts/runFinancialAgentNovelPlannerBattery');

test('novel planner battery has safe free-form cases across allowed tools', () => {
    assert.ok(NOVEL_CASES.length >= 200);
    assert.strictEqual(new Set(NOVEL_CASES.map(testCase => testCase.id)).size, NOVEL_CASES.length);
    assert.strictEqual(new Set(NOVEL_CASES.map(testCase => testCase.question)).size, NOVEL_CASES.length);
    const tools = new Set(NOVEL_CASES.flatMap(testCase => testCase.expectedTools));
    const tags = new Set(NOVEL_CASES.flatMap(testCase => testCase.tags || []));
    assert.ok(tools.has('run_safe_readonly_sql'));
    assert.ok(tools.has('list_recent_transactions'));
    assert.ok(tools.has('get_dashboard_snapshot'));
    assert.ok(tools.has('explain_metric'));
    for (const tag of ['recent', 'sql', 'dashboard', 'relative', 'goals', 'clarify', 'security']) {
        assert.ok(tags.has(tag), `missing tag ${tag}`);
    }
    assert.ok(NOVEL_CASES.some(testCase => testCase.expectedAction === 'block'));
});

test('relative expense cases accept the structured query route or safe SQL', async () => {
    const relativeExpenseCase = NOVEL_CASES.find(testCase => testCase.id === 'REL-001');

    assert.deepStrictEqual(relativeExpenseCase.expectedTools, [
        'query_financial_plan',
        'run_safe_readonly_sql'
    ]);

    const result = await liveRunCase(relativeExpenseCase, {
        remainingCalls: 1,
        invokeAgent: async () => ({
            action: 'answer',
            plan: { tool: 'query_financial_plan', source: 'llm_planner' },
            verified: { ok: true },
            answer: 'Resposta sintética verificada.',
            toolResult: { ok: true },
            telemetry: { modelCalls: 0 }
        })
    });

    assert.strictEqual(result.accepted, true);
    assert.strictEqual(result.geminiCalls, 0);
});

test('novel planner battery refuses live mode without an explicit bounded call cap', () => {
    assert.deepStrictEqual(validateOptions({ live: false }), { ok: true, mode: 'dry-run' });
    assert.strictEqual(validateOptions({ live: true, maxCalls: 0 }).ok, false);
    assert.strictEqual(validateOptions({ live: true, maxCalls: MAX_LIVE_CALLS_HARD_LIMIT + 1 }).reason, 'max_calls_exceeds_hard_limit');
    assert.deepStrictEqual(parseArgs(['--live', '--max-calls', '3', '--limit=2', '--case', 'NOVEL-003', '--tag', 'sql', '--stratified']), {
        live: true,
        maxCalls: 3,
        limit: 2,
        reportDir: null,
        caseId: 'NOVEL-003',
        tag: 'sql',
        stratified: true
    });
});

test('novel planner stratified selection covers distinct capabilities before repeating', () => {
    const selected = selectCases(NOVEL_CASES, { stratified: true, limit: 6 });
    const selectedTags = new Set(selected.flatMap(testCase => testCase.tags || []));

    assert.strictEqual(selected.length, 6);
    for (const tag of ['recent', 'sql', 'dashboard', 'relative', 'clarify', 'security']) {
        assert.ok(selectedTags.has(tag), `stratified sample missing ${tag}`);
    }
});

test('novel planner dry-run validates sample plans without Gemini calls', async () => {
    const result = dryRunCase(NOVEL_CASES[0]);

    assert.strictEqual(result.accepted, true);
    assert.strictEqual(result.geminiCalls, 0);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-novel-agent-'));
    const { report, reportDir } = await runFinancialAgentNovelPlannerBattery({
        reportDir: tempDir,
        runId: 'FAGENT_NOVEL_TEST',
        limit: 4
    });
    assert.strictEqual(report.mode, 'dry-run');
    assert.strictEqual(report.summary.total, 4);
    assert.strictEqual(report.summary.accepted, 4);
    assert.strictEqual(report.summary.geminiCalls, 0);
    assert.ok(fs.existsSync(path.join(reportDir, 'financial-agent-novel-planner-report.json')));

    const targeted = await runFinancialAgentNovelPlannerBattery({
        reportDir: tempDir,
        runId: 'FAGENT_NOVEL_TARGETED_TEST',
        caseId: 'NOVEL-003'
    });
    assert.strictEqual(targeted.report.summary.total, 1);
    assert.strictEqual(targeted.report.results[0].id, 'NOVEL-003');

    const tagged = await runFinancialAgentNovelPlannerBattery({
        reportDir: tempDir,
        runId: 'FAGENT_NOVEL_TAGGED_TEST',
        tag: 'security',
        limit: 3
    });
    assert.strictEqual(tagged.report.summary.total, 3);
    assert.ok(tagged.report.results.every(result => result.id.startsWith('SEC-')));
});

test('novel planner live path stops at the call cap and records each planned call', async () => {
    let invocations = 0;
    const fakeInvokeAgent = async () => {
        invocations += 1;
        return {
            action: 'answer',
            plan: { tool: 'run_safe_readonly_sql', source: 'llm_planner' },
            verified: { ok: true },
            answer: 'Resposta sintética verificada.',
            toolResult: { ok: true, rows: [], rowCount: 0 },
            telemetry: {
                modelCalls: 1,
                inputTokens: 12,
                outputTokens: 3,
                estimatedCostUsd: 0.00004,
                latencyMs: 123
            }
        };
    };

    const result = await liveRunCase(NOVEL_CASES[0], {
        remainingCalls: 1,
        invokeAgent: fakeInvokeAgent
    });
    assert.strictEqual(result.accepted, true);
    assert.strictEqual(result.geminiCalls, 1);
    assert.deepStrictEqual(result.telemetry, {
        modelCalls: 1,
        inputTokens: 12,
        outputTokens: 3,
        estimatedCostUsd: 0.00004,
        latencyMs: 123
    });

    const deterministic = await liveRunCase(NOVEL_CASES[0], {
        remainingCalls: 1,
        invokeAgent: async () => ({
            ...await fakeInvokeAgent(),
            telemetry: { modelCalls: 0 }
        })
    });
    assert.strictEqual(deterministic.geminiCalls, 0);

    const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-novel-telemetry-'));
    const sampled = await runFinancialAgentNovelPlannerBattery({
        live: true,
        maxCalls: 1,
        caseId: 'NOVEL-001',
        reportDir,
        invokeAgent: fakeInvokeAgent
    });
    assert.deepStrictEqual(sampled.report.summary.telemetry, {
        modelCalls: 1,
        inputTokens: 12,
        outputTokens: 3,
        estimatedCostUsd: 0.00004
    });
    assert.strictEqual(sampled.report.summary.latencyP50Ms, 123);
    assert.strictEqual(sampled.report.summary.latencyP95Ms, 123);

    const skipped = await liveRunCase(NOVEL_CASES[0], {
        remainingCalls: 0,
        invokeAgent: fakeInvokeAgent
    });
    assert.strictEqual(skipped.reason, 'call_cap_reached');
    assert.strictEqual(skipped.geminiCalls, 0);
    assert.strictEqual(invocations, 3);
});
