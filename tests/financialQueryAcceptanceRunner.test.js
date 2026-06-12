const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    parseAcceptanceBattery,
    evaluateAcceptanceCase,
    createSyntheticPreviousContext,
    runAcceptanceBattery
} = require('../scripts/runFinancialQueryAcceptanceBattery');

test('financial query acceptance runner parses all documented cases', () => {
    const cases = parseAcceptanceBattery();

    assert.strictEqual(cases.length, 265);
    assert.deepStrictEqual(
        cases.slice(0, 2).map(testCase => testCase.id),
        ['GAST-001', 'GAST-002']
    );
    assert.strictEqual(cases.at(-1).id, 'FUP-020');
});

test('financial query acceptance runner evaluates a normal local plan', () => {
    const [testCase] = parseAcceptanceBattery().filter(item => item.id === 'GAST-001');
    const result = evaluateAcceptanceCase(testCase);

    assert.strictEqual(result.actual.domain, 'expenses');
    assert.strictEqual(result.actual.operation, 'sum');
    assert.strictEqual(result.actual.timeBasis, 'billing_month');
    assert.strictEqual(result.blockedBeforePlan, false);
});

test('financial query acceptance runner blocks adversarial cases before planner output', () => {
    const [testCase] = parseAcceptanceBattery().filter(item => item.id === 'ADV-012');
    const result = evaluateAcceptanceCase(testCase);

    assert.strictEqual(result.actual.domain, 'security');
    assert.strictEqual(result.actual.operation, 'block');
    assert.strictEqual(result.actual.timeBasis, 'none');
    assert.strictEqual(result.blockedBeforePlan, true);
    assert.strictEqual(result.hasFinancialQueryPlan, false);
});

test('financial query acceptance runner can seed safe context for follow-ups', () => {
    const [testCase] = parseAcceptanceBattery().filter(item => item.id === 'FUP-002');
    const result = evaluateAcceptanceCase(testCase, {
        previousContext: createSyntheticPreviousContext()
    });

    assert.strictEqual(result.actual.domain, 'expenses');
    assert.ok(['rank', 'group'].includes(result.actual.operation));
    assert.strictEqual(result.actual.timeBasis, 'context');
});

test('financial query acceptance runner treats current-state goals as semantic acceptance basis', () => {
    const [testCase] = parseAcceptanceBattery().filter(item => item.id === 'GOAL-001');
    const result = evaluateAcceptanceCase(testCase);

    assert.strictEqual(result.actual.domain, 'goals');
    assert.strictEqual(result.actual.operation, 'list');
    assert.strictEqual(result.actual.timeBasis, 'current_state');
    assert.strictEqual(result.matches.all, true);
});

test('financial query acceptance runner treats card purchase date as transaction date in executable plan', () => {
    const [testCase] = parseAcceptanceBattery().filter(item => item.id === 'CARD-018');
    const result = evaluateAcceptanceCase(testCase);

    assert.strictEqual(result.actual.domain, 'cards');
    assert.strictEqual(result.actual.operation, 'sum');
    assert.strictEqual(result.actual.timeBasis, 'purchase_date');
    assert.strictEqual(result.matches.all, true);
});

test('financial query acceptance runner treats non-planned clarify cases as pre-query routing', () => {
    const [testCase] = parseAcceptanceBattery().filter(item => item.id === 'DEBT-015');
    const result = evaluateAcceptanceCase(testCase);

    assert.strictEqual(result.actual.domain, 'debts');
    assert.strictEqual(result.actual.operation, 'clarify');
    assert.strictEqual(result.actual.timeBasis, 'current_state');
    assert.strictEqual(result.hasFinancialQueryPlan, false);
    assert.strictEqual(result.matches.all, true);
});

test('financial query acceptance runner accepts safe operation equivalences', () => {
    const cases = Object.fromEntries(parseAcceptanceBattery().map(item => [item.id, item]));
    const invoiceItems = evaluateAcceptanceCase(cases['CARD-005']);
    const budgetPace = evaluateAcceptanceCase(cases['BUDG-006']);
    const goalsProgress = evaluateAcceptanceCase(cases['GOAL-002']);

    assert.strictEqual(invoiceItems.actual.operation, 'detail');
    assert.strictEqual(invoiceItems.matches.operation, true);
    assert.strictEqual(budgetPace.actual.operation, 'forecast');
    assert.strictEqual(budgetPace.matches.operation, true);
    assert.strictEqual(goalsProgress.actual.operation, 'explain');
    assert.strictEqual(goalsProgress.matches.operation, true);
});

test('financial query acceptance runner refreshes the latest report pointer', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-fqbatt-'));
    const reportDir = path.join(tempDir, 'run');
    const latestDir = path.join(tempDir, 'latest');

    const { report } = runAcceptanceBattery({
        reportDir,
        latestDir,
        runId: 'FQBATT_TEST'
    });

    const latestReport = JSON.parse(fs.readFileSync(path.join(latestDir, 'financial-query-acceptance-report.json'), 'utf8'));
    const latestManifest = JSON.parse(fs.readFileSync(path.join(latestDir, 'manifest.json'), 'utf8'));
    assert.strictEqual(latestReport.run_id, report.run_id);
    assert.strictEqual(latestManifest.run_id, report.run_id);
});
