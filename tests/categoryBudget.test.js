const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    buildBudgetAllocation,
    calculateCategoryBudget
} = require('../src/budget/categoryBudgetService');
const {
    CanonicalLedgerShadowStore
} = require('../src/ledger/canonicalLedgerShadowStore');
const financialQueryEngine = require('../src/query/financialQueryEngine');

const categories = [
    { category: 'Alimentação', subcategories: ['Mercado', 'Restaurante'] },
    { category: 'Moradia', subcategories: ['Aluguel'] },
    { category: 'Lazer', subcategories: [] }
];
let eventSequence = 0;

function allocation(overrides = {}) {
    return buildBudgetAllocation({
        householdId: 'family-1',
        scopeType: 'family',
        scopeId: 'family-1',
        cycleStart: '2026-06-28',
        cycleEnd: '2026-07-27',
        category: 'Alimentação',
        plannedAmountCents: 40000,
        status: 'active',
        ...overrides
    }, { categories });
}

function event(overrides = {}) {
    return {
        event_id: `event-${++eventSequence}`,
        household_id: 'family-1',
        owner_person_id: 'daniel',
        kind: 'expense',
        category: 'Alimentação',
        subcategory: 'Mercado',
        amount_cents: 10000,
        net_income_expense_impact: 10000,
        free_budget_eligible: true,
        budget_impact_on: '2026-07-05',
        ...overrides
    };
}

function calculate(overrides = {}) {
    return calculateCategoryBudget({
        globalBudget: { amountCents: 100000, active: true, sourceHealth: 'available' },
        referenceDate: '2026-07-05',
        cycleStartDay: 28,
        scope: { type: 'family', householdId: 'family-1', memberIds: ['daniel', 'thais'] },
        categories,
        allocations: [allocation()],
        events: [event()],
        ...overrides
    });
}

test('category budget distinguishes partial, total and excess allocation', () => {
    const partial = calculate();
    assert.deepStrictEqual({
        global: partial.globalBudgetCents,
        allocated: partial.allocatedBudgetCents,
        unallocated: partial.unallocatedBudgetCents,
        excess: partial.overallocatedBudgetCents
    }, { global: 100000, allocated: 40000, unallocated: 60000, excess: 0 });

    const total = calculate({
        allocations: [allocation({ plannedAmountCents: 100000 })]
    });
    assert.deepStrictEqual({
        allocated: total.allocatedBudgetCents,
        unallocated: total.unallocatedBudgetCents,
        excess: total.overallocatedBudgetCents
    }, { allocated: 100000, unallocated: 0, excess: 0 });

    const excess = calculate({
        allocations: [
            allocation({ plannedAmountCents: 80000 }),
            allocation({ category: 'Moradia', subcategory: 'Aluguel', plannedAmountCents: 50000 })
        ]
    });
    assert.deepStrictEqual({
        allocated: excess.allocatedBudgetCents,
        unallocated: excess.unallocatedBudgetCents,
        excess: excess.overallocatedBudgetCents
    }, { allocated: 130000, unallocated: 0, excess: 30000 });

    assert.deepStrictEqual(partial.reconciliation, {
        categoryActualBudgetCents: 10000,
        categoryAllocatedBudgetCents: 40000,
        actualMatchesCategoryTotal: true,
        allocationMatchesCategoryTotal: true,
        allocationMatchesGlobalBalance: true
    });
});

test('category budget exposes deterministic remaining daily pace for the current cycle', () => {
    const result = calculate();
    const food = result.categories.find(item => item.category === 'Alimentação');

    assert.strictEqual(result.daysRemaining, 23);
    assert.strictEqual(result.dailyPaceCents, 3913);
    assert.strictEqual(food.remainingAmountCents, 30000);
    assert.strictEqual(food.dailyPaceCents, 1304);
});

test('category without allocation is not treated as zero budget', () => {
    const result = calculate({
        events: [event({ category: 'Lazer', subcategory: '', amount_cents: 12000, net_income_expense_impact: 12000 })]
    });
    const lazer = result.categories.find(item => item.category === 'Lazer');
    assert.deepStrictEqual({
        allocationStatus: lazer.allocationStatus,
        planned: lazer.plannedAmountCents,
        actual: lazer.actualAmountCents,
        remaining: lazer.remainingAmountCents
    }, { allocationStatus: 'unallocated', planned: null, actual: 12000, remaining: null });
});

test('inactive allocation remains explicit and does not allocate the current cycle', () => {
    const inactive = allocation({ status: 'inactive' });
    const result = calculate({ allocations: [inactive] });
    assert.strictEqual(inactive.status, 'inactive');
    assert.strictEqual(result.allocatedBudgetCents, 0);
    assert.strictEqual(result.categories[0].allocationStatus, 'unallocated');
    assert.strictEqual(result.categories[0].plannedAmountCents, null);
});

test('allocation rejects unknown category or subcategory', () => {
    assert.throws(() => allocation({ category: 'Categoria inventada' }), /category_not_found/);
    assert.throws(() => allocation({ subcategory: 'Subcategoria inventada' }), /subcategory_not_found/);
});

test('budget cycle crosses months and clamps start days 28, 30 and 31', () => {
    const expected = new Map([
        [28, ['2026-02-28', '2026-03-27']],
        [30, ['2026-02-28', '2026-03-29']],
        [31, ['2026-02-28', '2026-03-30']]
    ]);
    for (const [cycleStartDay, [start, end]] of expected) {
        const result = calculate({
            referenceDate: '2026-03-05',
            cycleStartDay,
            allocations: [],
            events: []
        });
        assert.deepStrictEqual([result.cycle.start, result.cycle.end], [start, end]);
    }
});

test('scope is resolved outside the calculator and keeps family and personal totals isolated', () => {
    const events = [
        event({ owner_person_id: 'daniel', amount_cents: 10000, net_income_expense_impact: 10000 }),
        event({ owner_person_id: 'thais', amount_cents: 20000, net_income_expense_impact: 20000 }),
        event({ household_id: 'other-family', owner_person_id: 'other', amount_cents: 90000, net_income_expense_impact: 90000 })
    ];
    assert.strictEqual(calculate({ events }).actualBudgetCents, 30000);
    assert.strictEqual(calculate({
        scope: { type: 'personal', householdId: 'family-1', personId: 'daniel', memberIds: ['daniel'] },
        allocations: [allocation({ scopeType: 'personal', scopeId: 'daniel' })],
        events
    }).actualBudgetCents, 10000);
});

test('canonical accounting invariants count card once, net refunds and ignore neutral or duplicate rows', () => {
    const result = calculate({
        events: [
            event({ kind: 'card_purchase', amount_cents: 30000, net_income_expense_impact: 30000, budget_impact_on: '2026-07-10' }),
            event({ kind: 'invoice_payment', amount_cents: 30000, net_income_expense_impact: 0, free_budget_eligible: false }),
            event({ kind: 'expense', amount_cents: 7000, net_income_expense_impact: 7000, free_budget_eligible: false, recurrence_status: 'settled' }),
            event({ kind: 'reimbursement', amount_cents: 5000, net_income_expense_impact: -5000 }),
            event({ kind: 'transfer', amount_cents: 9000, net_income_expense_impact: 0, free_budget_eligible: false }),
            event({ kind: 'expense', amount_cents: 30000, net_income_expense_impact: 30000, source_type: 'import', reconciliation_status: 'matched' })
        ]
    });
    assert.strictEqual(result.actualBudgetCents, 25000);
    assert.strictEqual(result.categories.find(item => item.category === 'Alimentação').actualAmountCents, 25000);
});

test('unavailable global budget source is not converted to zero', () => {
    const result = calculate({
        globalBudget: { amountCents: null, active: true, sourceHealth: 'unavailable' }
    });
    assert.strictEqual(result.status, 'unavailable');
    assert.strictEqual(result.globalBudgetCents, null);
    assert.strictEqual(result.unallocatedBudgetCents, null);
    assert.strictEqual(result.overallocatedBudgetCents, null);
});

test('Query Engine exposes the internal category budget contract without a parallel public route', async () => {
    const result = await financialQueryEngine.executeFinancialQuery({
        kind: 'financial_query',
        domain: 'budget',
        operation: 'detail',
        filters: { period: { type: 'cycle' }, scope: 'family' },
        timeBasis: 'budget_cycle',
        answerStyle: 'detailed'
    }, {
        userSettings: [
            ['user_id', 'monthly_budget_enabled', 'monthly_budget_amount', 'monthly_budget_scope', 'monthly_budget_cycle_start_day'],
            ['daniel', 'SIM', 1000, 'family', 28]
        ],
        currentDate: '05/07/2026',
        scopeUserIds: ['daniel', 'thais'],
        resolvedBudgetScope: { type: 'family', householdId: 'family-1', memberIds: ['daniel', 'thais'] },
        budgetCategories: categories,
        budgetAllocations: [allocation()],
        canonicalBudgetEvents: [event()]
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.value.categoryBudget.globalBudgetCents, 100000);
    assert.strictEqual(result.result.value.categoryBudget.actualBudgetCents, 10000);
    assert.strictEqual(result.result.value.categoryBudget.categories[0].remainingAmountCents, 30000);
});

test('Query Engine keeps a missing global budget source unavailable in the category contract', async () => {
    const result = await financialQueryEngine.executeFinancialQuery({
        kind: 'financial_query',
        domain: 'budget',
        operation: 'detail',
        filters: { period: { type: 'cycle' }, scope: 'family' },
        timeBasis: 'budget_cycle',
        answerStyle: 'detailed'
    }, {
        currentDate: '05/07/2026',
        resolvedBudgetScope: { type: 'family', householdId: 'family-1', memberIds: ['daniel', 'thais'] },
        budgetCategories: categories,
        budgetAllocations: [allocation()],
        canonicalBudgetEvents: [event()]
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.value.categoryBudget.status, 'unavailable');
    assert.strictEqual(result.result.value.categoryBudget.globalBudgetCents, null);
});

test('budget allocation persistence survives restart, replay and projection rebuild without duplicates', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-budget-allocation-'));
    const dbPath = path.join(dir, 'canonical-ledger-shadow.sqlite');
    const storedAllocation = allocation();

    const first = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    assert.strictEqual(first.persistBudgetAllocations([storedAllocation], { referenceDate: '2026-07-05' }), 1);
    assert.strictEqual(first.persistBudgetAllocations([storedAllocation], { referenceDate: '2026-07-05' }), 1);
    first.persistProjection({
        runId: 'budget-rebuild-test',
        projected: {},
        publicProjection: [],
        report: { report_type: 'test', schema_version: 'canonical-ledger-v1' }
    });
    first.close();

    const restarted = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    restarted.applyMigrations();
    const rows = restarted.listBudgetAllocations({ householdId: 'family-1', cycleStart: '2026-06-28' });
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].allocationId, storedAllocation.allocationId);
    restarted.close();
});

test('closed budget cycle cannot be changed silently', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-budget-closed-'));
    const dbPath = path.join(dir, 'canonical-ledger-shadow.sqlite');
    const store = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    const storedAllocation = allocation({ cycleStart: '2026-05-28', cycleEnd: '2026-06-27' });
    store.persistBudgetAllocations([storedAllocation], { referenceDate: '2026-06-01' });
    assert.throws(() => store.persistBudgetAllocations([
        { ...storedAllocation, plannedAmountCents: 50000 }
    ], { referenceDate: '2026-07-05' }), /closed_budget_cycle_immutable/);
    assert.throws(() => store.persistBudgetAllocations([
        allocation({
            cycleStart: '2026-05-28',
            cycleEnd: '2026-06-27',
            category: 'Moradia',
            subcategory: 'Aluguel'
        })
    ], { referenceDate: '2026-07-05' }), /closed_budget_cycle_immutable/);
    store.close();
});
