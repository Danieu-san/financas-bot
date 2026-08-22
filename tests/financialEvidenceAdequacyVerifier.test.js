const test = require('node:test');
const assert = require('node:assert');

const {
    verifyFinancialEvidenceAdequacy
} = require('../src/agent/financialEvidenceAdequacyVerifier');

function plan(overrides = {}) {
    return {
        kind: 'financial_query',
        domain: 'expenses',
        operation: 'sum',
        filters: {
            period: { type: 'month', month: 7, year: 2026 },
            scope: 'member',
            member: 'Thais',
            category: 'Lanche'
        },
        groupBy: [],
        timeBasis: 'transaction_date',
        answerStyle: 'short',
        ...overrides
    };
}

function execution({ actualPlan = plan(), coverage = 'available', source = 'sqlite_read_model', value = 25 } = {}) {
    const ok = coverage !== 'unavailable';
    const result = {
        ok,
        tool: 'query_financial_plan',
        source,
        plan: actualPlan,
        result: { value },
        ...(ok ? {} : { reason: 'read_model_unavailable' })
    };
    return {
        request: { tool: 'query_financial_plan', args: { plan: actualPlan } },
        result: {
            ...result,
            evidence: {
                schemaVersion: 1,
                capability: 'financial_query',
                mode: 'read_only',
                provenance: {
                    authority: 'server',
                    source,
                    scope: 'family',
                    fallback: { used: false, reason: null }
                },
                coverage: { status: coverage, itemCount: coverage === 'empty' ? 0 : null },
                criteria: {},
                payload: { plan: actualPlan, result: { value } },
                ...(ok ? {} : { failure: { reason: 'read_model_unavailable', errors: [] } })
            }
        }
    };
}

test('adequacy verifier accepts matching person, period, time basis, dimensions, source and amount', () => {
    const result = verifyFinancialEvidenceAdequacy({
        expectedPlan: plan(),
        executions: [execution()],
        answer: 'Thaís gastou R$ 25,00 em lanche em agosto de 2026.'
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.status, 'adequate');
    assert.deepStrictEqual(
        Object.values(result.checks).map(check => check.ok),
        [true, true, true, true, true, true, true]
    );
});

test('adequacy verifier preserves the existing numerical verifier', () => {
    const result = verifyFinancialEvidenceAdequacy({
        expectedPlan: plan(),
        executions: [execution()],
        answer: 'Thaís gastou R$ 99,00 em lanche em agosto de 2026.'
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.checks.numerical.reason, 'invented_amount');
});

test('adequacy verifier rejects a value supplied only by an earlier incompatible read', () => {
    const incompatiblePlan = plan({
        filters: { ...plan().filters, member: 'Daniel', category: 'Mercado' }
    });
    const result = verifyFinancialEvidenceAdequacy({
        expectedPlan: plan(),
        executions: [
            execution({ actualPlan: incompatiblePlan, value: 99 }),
            execution({ actualPlan: plan(), value: 25 })
        ],
        answer: 'O total foi R$ 99,00.'
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.checks.numerical.reason, 'invented_amount');
});

test('adequacy verifier accepts a value from the same final read whose structure is adequate', () => {
    const incompatiblePlan = plan({
        filters: { ...plan().filters, member: 'Daniel', category: 'Mercado' }
    });
    const result = verifyFinancialEvidenceAdequacy({
        expectedPlan: plan(),
        executions: [
            execution({ actualPlan: incompatiblePlan, value: 99 }),
            execution({ actualPlan: plan(), value: 25 })
        ],
        answer: 'O total foi R$ 25,00.'
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.status, 'adequate');
});

test('adequacy verifier rejects a different person even when the amount is valid', () => {
    const actualPlan = plan({ filters: { ...plan().filters, member: 'Daniel' } });
    const result = verifyFinancialEvidenceAdequacy({
        expectedPlan: plan(),
        executions: [execution({ actualPlan })],
        answer: 'O total foi R$ 25,00.'
    });

    assert.strictEqual(result.checks.person.ok, false);
    assert.strictEqual(result.checks.person.reason, 'person_mismatch');
});

test('adequacy verifier rejects a different period', () => {
    const actualPlan = plan({
        filters: { ...plan().filters, period: { type: 'month', month: 6, year: 2026 } }
    });
    const result = verifyFinancialEvidenceAdequacy({
        expectedPlan: plan(), executions: [execution({ actualPlan })], answer: 'O total foi R$ 25,00.'
    });

    assert.strictEqual(result.checks.period.reason, 'period_mismatch');
});

test('adequacy verifier rejects a different time basis', () => {
    const actualPlan = plan({ timeBasis: 'billing_month' });
    const result = verifyFinancialEvidenceAdequacy({
        expectedPlan: plan(), executions: [execution({ actualPlan })], answer: 'O total foi R$ 25,00.'
    });

    assert.strictEqual(result.checks.timeBasis.reason, 'time_basis_mismatch');
});

test('adequacy verifier rejects a different dimension', () => {
    const actualPlan = plan({ filters: { ...plan().filters, category: 'Mercado' } });
    const result = verifyFinancialEvidenceAdequacy({
        expectedPlan: plan(), executions: [execution({ actualPlan })], answer: 'O total foi R$ 25,00.'
    });

    assert.strictEqual(result.checks.dimensions.reason, 'dimension_mismatch');
});

test('adequacy verifier treats equivalent text casing and accents as the same dimension', () => {
    const expectedPlan = plan({ filters: { ...plan().filters, category: 'Alimentação' } });
    const actualPlan = plan({ filters: { ...plan().filters, category: 'alimentacao' } });
    const result = verifyFinancialEvidenceAdequacy({
        expectedPlan, executions: [execution({ actualPlan })], answer: 'O total foi R$ 25,00.'
    });

    assert.strictEqual(result.checks.dimensions.ok, true);
});

test('adequacy verifier distinguishes an unavailable source from explicit empty evidence', () => {
    const unavailable = verifyFinancialEvidenceAdequacy({
        expectedPlan: plan(), executions: [execution({ coverage: 'unavailable' })], answer: 'Não houve gastos.'
    });
    const empty = verifyFinancialEvidenceAdequacy({
        expectedPlan: plan(), executions: [execution({ coverage: 'empty', value: [] })], answer: 'Não houve gastos.'
    });

    assert.strictEqual(unavailable.checks.absence.reason, 'source_unavailable');
    assert.strictEqual(unavailable.ok, false);
    assert.strictEqual(empty.checks.absence.ok, true);
    assert.strictEqual(empty.checks.absence.status, 'explicit_empty');
});

test('adequacy verifier rejects an absence claim over available nonzero evidence', () => {
    const result = verifyFinancialEvidenceAdequacy({
        expectedPlan: plan(), executions: [execution({ value: 25 })], answer: 'Não houve gastos.'
    });

    assert.strictEqual(result.checks.absence.reason, 'absence_claim_unsupported');
    assert.strictEqual(result.ok, false);
});

test('adequacy verifier accepts an explicit zero aggregate from an available source', () => {
    const result = verifyFinancialEvidenceAdequacy({
        expectedPlan: plan(), executions: [execution({ value: 0 })], answer: 'Não houve gastos.'
    });

    assert.strictEqual(result.checks.absence.ok, true);
    assert.strictEqual(result.checks.absence.status, 'available_zero');
});

test('adequacy verifier rejects missing source provenance', () => {
    const candidate = execution({ source: '' });
    const result = verifyFinancialEvidenceAdequacy({
        expectedPlan: plan(), executions: [candidate], answer: 'O total foi R$ 25,00.'
    });

    assert.strictEqual(result.checks.source.reason, 'source_unproven');
});

test('adequacy verifier rejects an empty envelope that contradicts a failed tool result', () => {
    const candidate = execution({ coverage: 'empty', value: [] });
    candidate.result.ok = false;
    candidate.result.reason = 'read_model_unavailable';
    const result = verifyFinancialEvidenceAdequacy({
        expectedPlan: plan(), executions: [candidate], answer: 'Não houve gastos.'
    });

    assert.strictEqual(result.checks.absence.reason, 'source_unavailable');
});

test('adequacy verifier rejects an explicit attribution to another known person', () => {
    const result = verifyFinancialEvidenceAdequacy({
        expectedPlan: plan(),
        knownPeople: ['Daniel', 'Thais'],
        executions: [execution()],
        answer: 'Daniel gastou R$ 25,00 em lanche.'
    });

    assert.strictEqual(result.checks.person.reason, 'answer_person_mismatch');
});

test('adequacy verifier fails closed without evidence', () => {
    const result = verifyFinancialEvidenceAdequacy({ expectedPlan: plan(), executions: [], answer: 'R$ 25,00.' });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 'inadequate');
    assert.strictEqual(result.checks.absence.reason, 'missing_evidence');
});
