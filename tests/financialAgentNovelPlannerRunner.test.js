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
    dryRunCase,
    liveRunCase,
    runFinancialAgentNovelPlannerBattery
} = require('../scripts/runFinancialAgentNovelPlannerBattery');

test('novel planner battery has safe free-form cases across allowed tools', () => {
    assert.ok(NOVEL_CASES.length >= 15);
    const tools = new Set(NOVEL_CASES.flatMap(testCase => testCase.expectedTools));
    assert.ok(tools.has('run_safe_readonly_sql'));
    assert.ok(tools.has('list_recent_transactions'));
    assert.ok(tools.has('get_dashboard_snapshot'));
    assert.ok(tools.has('explain_metric'));
    assert.ok(NOVEL_CASES.some(testCase => testCase.expectedAction === 'block'));
});

test('novel planner battery refuses live mode without an explicit bounded call cap', () => {
    assert.deepStrictEqual(validateOptions({ live: false }), { ok: true, mode: 'dry-run' });
    assert.strictEqual(validateOptions({ live: true, maxCalls: 0 }).ok, false);
    assert.strictEqual(validateOptions({ live: true, maxCalls: MAX_LIVE_CALLS_HARD_LIMIT + 1 }).reason, 'max_calls_exceeds_hard_limit');
    assert.deepStrictEqual(parseArgs(['--live', '--max-calls', '3', '--limit=2']), {
        live: true,
        maxCalls: 3,
        limit: 2,
        reportDir: null
    });
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
            toolResult: { ok: true, rows: [], rowCount: 0 }
        };
    };

    const result = await liveRunCase(NOVEL_CASES[0], {
        remainingCalls: 1,
        invokeAgent: fakeInvokeAgent
    });
    assert.strictEqual(result.accepted, true);
    assert.strictEqual(result.geminiCalls, 1);

    const skipped = await liveRunCase(NOVEL_CASES[0], {
        remainingCalls: 0,
        invokeAgent: fakeInvokeAgent
    });
    assert.strictEqual(skipped.reason, 'call_cap_reached');
    assert.strictEqual(skipped.geminiCalls, 0);
    assert.strictEqual(invocations, 1);
});
