const test = require('node:test');
const assert = require('node:assert');

const fixture = require('./fixtures/planner/unified-financial-command-cases.json');
const {
    buildFinancialCommandPlannerPrompt,
    buildDeterministicFinancialCommandPlan,
    extractDeterministicFinancialSignals,
    reconcileFinancialCommandPlan
} = require('../src/planning/financialCommandPlanner');

test('financial command planner prompt is compact, public and isolates user input', () => {
    const prompt = buildFinancialCommandPlannerPrompt(
        'Paguei 469,09 da conta de telefone',
        { referenceDate: new Date('2026-06-25T12:00:00-03:00') }
    );

    assert.ok(prompt.includes('financial-command-plan-v1'));
    assert.ok(prompt.includes('bill.pay'));
    assert.ok(prompt.includes('match_recurring_bill'));
    assert.ok(prompt.includes('2026-06-25'));
    assert.ok(prompt.includes('[MENSAGEM_NAO_CONFIAVEL]'));
    assert.ok(prompt.includes('Paguei 469,09 da conta de telefone'));
    assert.ok(prompt.length < 6500);
    assert.ok(!prompt.includes('SPREADSHEET_ID'));
    assert.ok(!prompt.includes('GEMINI_API_KEY'));
});

test('deterministic extraction identifies the fixture payment domains and amounts', () => {
    for (const testCase of fixture.cases) {
        const signals = extractDeterministicFinancialSignals(testCase.message);

        assert.strictEqual(
            signals.operation,
            testCase.expectedOperation,
            testCase.id
        );
        assert.strictEqual(
            signals.contextTool,
            testCase.expectedContextTool,
            testCase.id
        );
        if (testCase.expectedAmount !== undefined) {
            assert.strictEqual(signals.amount, testCase.expectedAmount, testCase.id);
        }
    }
});

test('deterministic planner preserves explicit payment evidence without inventing missing fields', () => {
    const plan = buildDeterministicFinancialCommandPlan(
        'Paguei 42 no almoço no pix'
    );

    assert.strictEqual(plan.operation, 'expense.create');
    assert.strictEqual(plan.entities.amount, 42);
    assert.strictEqual(plan.entities.paymentMethod, 'PIX');
    assert.strictEqual(plan.fieldEvidence.amount, 'deterministic');
    assert.strictEqual(plan.fieldEvidence.paymentMethod, 'explicit');
    assert.ok(!plan.missingFields.includes('paymentMethod'));
    assert.strictEqual(plan.requiresConfirmation, true);
});

test('deterministic extraction does not mistake dates or ambiguous numbers for money', () => {
    const dateOnly = extractDeterministicFinancialSignals(
        'Paguei a conta dia 25/06/2026'
    );
    const ambiguous = extractDeterministicFinancialSignals(
        'Paguei 2 parcelas de 300 da dívida'
    );
    const explicitMoney = extractDeterministicFinancialSignals(
        'Paguei R$ 300 em 2 parcelas da dívida'
    );

    assert.strictEqual(dateOnly.amount, null);
    assert.strictEqual(ambiguous.amount, null);
    assert.strictEqual(explicitMoney.amount, 300);
});
test('deterministic extraction captures written transaction dates without a year', () => {
    const signals = extractDeterministicFinancialSignals(
        'Gastei 90,97 no almoço no dia 28 de junho',
        { referenceDate: new Date('2026-07-01T12:00:00-03:00') }
    );

    assert.strictEqual(signals.date, '28/06/2026');
});

test('planner reconciliation fills a missing deterministic date before routing', () => {
    const result = reconcileFinancialCommandPlan({
        message: 'Gastei 90,97 no almoço no dia 28 de junho',
        referenceDate: new Date('2026-07-01T12:00:00-03:00'),
        rawPlan: {
            schemaVersion: 'financial-command-plan-v1',
            operation: 'expense.create',
            entities: {
                description: 'almoço',
                amount: 90.97,
                paymentMethod: null,
                date: null
            },
            fieldEvidence: {
                description: 'explicit',
                amount: 'explicit',
                paymentMethod: 'missing',
                date: 'missing'
            },
            contextRequests: [{ tool: 'resolve_category', query: 'almoço' }],
            missingFields: ['paymentMethod', 'date'],
            requiresConfirmation: true
        }
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.plan.entities.date, '28/06/2026');
    assert.strictEqual(result.plan.fieldEvidence.date, 'deterministic');
    assert.deepStrictEqual(result.plan.missingFields, ['paymentMethod']);
});

test('planner reconciliation rejects model conflicts with deterministic critical fields', () => {
    const result = reconcileFinancialCommandPlan({
        message: 'Paguei 469,09 da conta de telefone',
        rawPlan: {
            schemaVersion: 'financial-command-plan-v1',
            operation: 'debt.pay',
            entities: {
                description: 'conta de telefone',
                amount: 469.09
            },
            fieldEvidence: {
                description: 'explicit',
                amount: 'explicit'
            },
            contextRequests: [{
                tool: 'match_debt',
                query: 'conta de telefone'
            }],
            missingFields: ['paymentMethod'],
            requiresConfirmation: true
        }
    });

    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.includes('deterministic_operation_conflict'));
    assert.ok(result.errors.includes('deterministic_context_tool_conflict'));
});

test('planner reconciliation requires scoped context for a strong payment domain', () => {
    const result = reconcileFinancialCommandPlan({
        message: 'Paguei 469,09 da conta de telefone',
        rawPlan: {
            schemaVersion: 'financial-command-plan-v1',
            operation: 'bill.pay',
            entities: {
                description: 'conta de telefone',
                amount: 469.09
            },
            contextRequests: [],
            missingFields: ['paymentMethod'],
            requiresConfirmation: true
        }
    });

    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.includes('deterministic_context_tool_missing'));
});

test('planner reconciliation accepts a validated model plan aligned with deterministic evidence', () => {
    const result = reconcileFinancialCommandPlan({
        message: 'Paguei 469,09 da conta de telefone',
        rawPlan: {
            schemaVersion: 'financial-command-plan-v1',
            operation: 'bill.pay',
            entities: {
                description: 'conta de telefone',
                amount: 469.09
            },
            fieldEvidence: {
                description: 'explicit',
                amount: 'explicit'
            },
            contextRequests: [{
                tool: 'match_recurring_bill',
                query: 'conta de telefone'
            }],
            missingFields: ['paymentMethod'],
            requiresConfirmation: true
        }
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.plan.operation, 'bill.pay');
});
