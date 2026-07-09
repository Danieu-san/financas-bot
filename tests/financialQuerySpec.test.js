const test = require('node:test');
const assert = require('node:assert');

const { parseAcceptanceBattery } = require('../scripts/runFinancialQueryAcceptanceBattery');
const {
    readCorpus,
    materializeCases
} = require('../scripts/runFinancialAgentGoldenBaseline');
const {
    SPEC_VERSION,
    buildSpecFromGoldenCase,
    getMetricCatalog,
    validateFinancialQuerySpec
} = require('../src/query/financialQuerySpec');

test('phase 3F.1B validates every golden corpus case as a governed FinancialQuerySpec', () => {
    const cases = materializeCases(readCorpus(), parseAcceptanceBattery());
    const failures = [];

    for (const testCase of cases) {
        const result = buildSpecFromGoldenCase(testCase);
        if (!result.ok) failures.push({ id: testCase.id, errors: result.errors });
    }

    assert.deepStrictEqual(failures, []);
});

test('phase 3F.1B keeps benchmark metrics explicitly cataloged by domain', () => {
    const catalog = getMetricCatalog();

    assert.strictEqual(catalog.goals.includes('goals_overview'), true);
    assert.strictEqual(catalog.budget.includes('budget_daily_available'), true);
    assert.strictEqual(catalog.dashboard.includes('cross_surface_parity'), true);
    assert.strictEqual(catalog.transfers.includes('transfer_classification'), true);
});

test('phase 3F.1B rejects invented metrics, unsafe scope fields and bad source health', () => {
    const baseSpec = {
        version: SPEC_VERSION,
        objective: 'quanto gastei esse mes?',
        domain: 'expenses',
        metric: 'expenses_total',
        operation: 'sum',
        dimensions: ['category'],
        filters: [],
        entity: 'transactions',
        period: { type: 'billing_month' },
        timeBasis: 'billing_month',
        scope: { type: 'personal' },
        sourceHealth: [{ source: 'expenses', status: 'available' }],
        evidence: [{ kind: 'test', id: 'safe' }]
    };

    assert.strictEqual(validateFinancialQuerySpec(baseSpec).ok, true);

    assert.match(
        validateFinancialQuerySpec({ ...baseSpec, metric: 'random_profit' }).errors.join('\n'),
        /metric invalida/
    );
    assert.match(
        validateFinancialQuerySpec({ ...baseSpec, filters: [{ user_id: 'abc' }] }).errors.join('\n'),
        /campos sensiveis/
    );
    assert.match(
        validateFinancialQuerySpec({ ...baseSpec, sourceHealth: [{ source: 'expenses', status: 'zero' }] }).errors.join('\n'),
        /sourceHealth.status invalido/
    );
    assert.match(
        validateFinancialQuerySpec({ ...baseSpec, surpriseFilter: 'x' }).errors.join('\n'),
        /campos nao permitidos/
    );
    assert.match(
        validateFinancialQuerySpec({ ...baseSpec, scope: { type: 'none' } }).errors.join('\n'),
        /scope none/
    );
});
