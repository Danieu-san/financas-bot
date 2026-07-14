const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    parseAcceptanceBattery,
    evaluateAcceptanceCase
} = require('../scripts/runFinancialQueryAcceptanceBattery');
const {
    evaluateAgenticCase,
    runFinancialAgentAcceptanceBattery
} = require('../scripts/runFinancialAgentAcceptanceBattery');

test('financial agent acceptance runner blocks adversarial requests before the agent', async () => {
    const testCase = parseAcceptanceBattery().find(item => item.id === 'ADV-012');
    const result = await evaluateAgenticCase(testCase);

    assert.strictEqual(result.accepted, true);
    assert.strictEqual(result.stage, 'security_gate');
    assert.strictEqual(result.action, 'block');
});

test('financial agent acceptance runner executes a planned query through a verified tool', async () => {
    const testCase = parseAcceptanceBattery().find(item => item.id === 'GAST-001');
    const result = await evaluateAgenticCase(testCase);

    assert.strictEqual(result.accepted, true);
    assert.strictEqual(result.action, 'answer');
    assert.strictEqual(result.tool, 'query_financial_plan');
    assert.strictEqual(result.verified, true);
    assert.strictEqual(result.toolResultSafe, true);
});

test('BILL-015 keeps recurring bill missing-category detection out of transaction quality', async () => {
    const testCase = parseAcceptanceBattery().find(item => item.id === 'BILL-015');
    const result = await evaluateAgenticCase(testCase);

    assert.strictEqual(result.routedDomain, 'bills');
    assert.strictEqual(result.routedOperation, 'detect');
    assert.strictEqual(result.safePlan.timeBasis, 'current_state');
    assert.strictEqual(result.accepted, true, JSON.stringify(result));
    assert.strictEqual(result.action, 'answer');
    assert.strictEqual(result.verified, true);
    assert.doesNotMatch(result.answer, /indisponivel|ausencia de dados|valor zero/i);
});

test('transaction missing-category questions remain in the quality domain', () => {
    const result = evaluateAcceptanceCase({
        id: 'QUALITY-MISSING-CATEGORY',
        question: 'tem lancamento sem categoria?',
        expected: {
            domain: 'quality',
            operation: 'list',
            timeBasis: 'transaction_date'
        }
    });

    assert.strictEqual(result.actual.domain, 'quality');
    assert.strictEqual(result.actual.operation, 'list');
    assert.strictEqual(result.actual.timeBasis, 'transaction_date');
    assert.strictEqual(result.matches.all, true);
});

test('financial agent acceptance runner requires clarification for unsupported dashboard commands', async () => {
    const testCase = parseAcceptanceBattery().find(item => item.id === 'DASH-019');
    const result = await evaluateAgenticCase(testCase);

    assert.strictEqual(result.accepted, true);
    assert.strictEqual(result.action, 'clarify');
});

test('financial agent acceptance runner writes a synthetic zero-Gemini report', async () => {
    const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-agentic-'));
    const { report } = await runFinancialAgentAcceptanceBattery({
        reportDir,
        runId: 'FAGENT_TEST',
        limit: 5
    });

    assert.strictEqual(report.summary.total, 5);
    assert.strictEqual(report.gemini_calls, 0);
    assert.strictEqual(report.synthetic_user_only, true);
    assert.strictEqual(fs.existsSync(path.join(reportDir, 'financial-agent-acceptance-report.json')), true);
});
