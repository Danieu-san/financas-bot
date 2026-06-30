const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    MAX_LIVE_CALLS_HARD_LIMIT,
    parseArgs,
    validateOptions,
    runFinancialCommandPlannerBattery
} = require('../scripts/runFinancialCommandPlannerBattery');
const fixture = require('./fixtures/planner/unified-financial-command-cases.json');

test('financial command planner runner refuses unbounded live mode', () => {
    assert.deepStrictEqual(
        validateOptions({ live: false }),
        { ok: true, mode: 'offline' }
    );
    assert.strictEqual(
        validateOptions({ live: true, maxCalls: 0 }).reason,
        'live_requires_positive_max_calls'
    );
    assert.strictEqual(
        validateOptions({
            live: true,
            maxCalls: MAX_LIVE_CALLS_HARD_LIMIT + 1
        }).reason,
        'max_calls_exceeds_hard_limit'
    );
    assert.deepStrictEqual(
        parseArgs(['--live', '--max-calls', '2', '--limit=2']),
        {
            live: true,
            maxCalls: 2,
            limit: 2,
            reportDir: null,
            caseId: null
        }
    );
});

test('financial command planner offline runner accepts all fixtures with zero Gemini calls', async () => {
    const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'financasbot-command-planner-')
    );
    const { report, reportPath } = await runFinancialCommandPlannerBattery({
        reportDir: tempDir,
        runId: 'FINANCIAL_COMMAND_PLANNER_OFFLINE_TEST'
    });

    assert.strictEqual(report.mode, 'offline');
    assert.strictEqual(report.summary.total, fixture.cases.length);
    assert.strictEqual(report.summary.accepted, fixture.cases.length);
    assert.strictEqual(report.summary.gaps, 0);
    assert.strictEqual(report.summary.geminiCalls, 0);
    assert.ok(report.duration_ms >= 0);
    assert.ok(Date.parse(report.finished_at) >= Date.parse(report.started_at));
    assert.ok(report.results.every(item => !Object.hasOwn(item, 'message')));
    assert.ok(fs.existsSync(reportPath));
});

test('financial command planner live runner obeys the explicit call cap', async () => {
    let calls = 0;
    const fakePlanWithGemini = async ({ message }) => {
        calls += 1;
        return {
            ok: true,
            plan: {
                schemaVersion: 'financial-command-plan-v1',
                operation: message.includes('telefone') ? 'bill.pay' : 'debt.pay',
                entities: {},
                contextRequests: [],
                missingFields: [],
                requiresConfirmation: true
            }
        };
    };
    const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'financasbot-command-planner-live-')
    );
    const { report } = await runFinancialCommandPlannerBattery({
        live: true,
        maxCalls: 2,
        limit: 5,
        reportDir: tempDir,
        runId: 'FINANCIAL_COMMAND_PLANNER_LIVE_TEST',
        planWithGemini: fakePlanWithGemini
    });

    assert.strictEqual(calls, 2);
    assert.strictEqual(report.summary.geminiCalls, 2);
    assert.strictEqual(report.summary.total, 2);
});
