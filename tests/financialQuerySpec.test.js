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
    assert.strictEqual(catalog.budget.includes('budget_category_remaining'), true);
    assert.strictEqual(catalog.budget.includes('budget_categories_over_limit'), true);
    assert.strictEqual(catalog.budget.includes('budget_category_daily_pace'), true);
    assert.strictEqual(catalog.dashboard.includes('cross_surface_parity'), true);
    assert.strictEqual(catalog.quality.includes('data_quality_coverage'), true);
    assert.strictEqual(catalog.quality.includes('data_quality_pending'), true);
    assert.strictEqual(catalog.transfers.includes('transfer_classification'), true);
});

test('phase 4D catalogs quality coverage as a read-only period/source query', () => {
    const result = validateFinancialQuerySpec({
        version: SPEC_VERSION,
        objective: 'quais pendências de dados tenho em julho por origem?',
        domain: 'quality',
        metric: 'data_quality_pending',
        operation: 'list',
        dimensions: ['source', 'status'],
        filters: [{ status: 'unreconciled' }],
        entity: 'financial_events',
        period: { type: 'month', month: 6, year: 2026 },
        timeBasis: 'transaction_date',
        scope: { type: 'family' },
        sourceHealth: [{ source: 'canonical_ledger', status: 'partial' }],
        evidence: [{ kind: 'phase_4d', id: 'quality-contract' }]
    });

    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
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
