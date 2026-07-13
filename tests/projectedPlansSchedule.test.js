const test = require('node:test');
const assert = require('node:assert/strict');

const {
    PROJECTED_PLAN_SCHEDULE_SCHEMA_VERSION,
    buildProjectedPlanSchedule,
    compareProjectedPlanScenario
} = require('../src/plans/projectedPlansSchedule');

function goalPlan(overrides = {}) {
    return {
        schema_version: 'projected-plan-v1',
        plan_id: 'plan_goal_reserva',
        version: 1,
        type: 'goal',
        status: 'active',
        name: 'Reserva',
        currency: 'BRL',
        amounts: {
            target_cents: 100_000,
            current_cents: 20_000,
            scheduled_contribution_cents: null,
            principal_cents: null,
            outstanding_cents: null,
            installment_cents: null
        },
        terms: {
            target_on: '2026-10-31',
            start_on: null,
            next_due_on: null,
            due_day: null,
            term_months: null,
            interest_rate_basis_points: null,
            interest_period: null,
            amortization_method: null
        },
        source: { data_status: 'available', identity_status: 'stable' },
        ...overrides
    };
}

function debtPlan(overrides = {}) {
    return {
        schema_version: 'projected-plan-v1',
        plan_id: 'plan_debt_banco',
        version: 1,
        type: 'debt',
        status: 'active',
        name: 'Banco',
        currency: 'BRL',
        amounts: {
            target_cents: null,
            current_cents: null,
            scheduled_contribution_cents: null,
            principal_cents: 100_000,
            outstanding_cents: 100_000,
            installment_cents: 30_000
        },
        terms: {
            target_on: null,
            start_on: '2026-01-20',
            next_due_on: '2026-07-20',
            due_day: 20,
            term_months: null,
            interest_rate_basis_points: 200,
            interest_period: 'monthly',
            amortization_method: null
        },
        source: { data_status: 'available', identity_status: 'stable' },
        ...overrides
    };
}

test('5B goal schedule is deterministic, derives the monthly amount and keeps simulated dates separate from facts', () => {
    const plan = goalPlan();
    const original = structuredClone(plan);
    const first = buildProjectedPlanSchedule({ plan, asOf: '2026-07-13' });
    const replay = buildProjectedPlanSchedule({ plan, asOf: '2026-07-13' });

    assert.deepStrictEqual(first, replay);
    assert.deepStrictEqual(plan, original);
    assert.strictEqual(first.schema_version, PROJECTED_PLAN_SCHEDULE_SCHEMA_VERSION);
    assert.strictEqual(first.mode, 'projected');
    assert.strictEqual(first.source_status, 'available');
    assert.strictEqual(first.months_to_completion, 4);
    assert.strictEqual(first.completion_on, '2026-10-31');
    assert.deepStrictEqual(first.schedule.map(item => item.due_on), [
        '2026-07-31', '2026-08-31', '2026-09-30', '2026-10-31'
    ]);
    assert.ok(first.schedule.every(item => item.state === 'projected'));
    assert.ok(first.schedule.every(item => item.occurred_on === null));
    assert.ok(first.schedule.every(item => item.effective_on === item.due_on));
    assert.ok(first.schedule.every(item => item.competence_month === item.due_on.slice(0, 7)));
    assert.strictEqual(first.schedule[0].scheduled_amount_cents, 20_000);
    assert.strictEqual(first.writes_performed, 0);
    assert.ok(!Object.hasOwn(first, 'plan_movements'));
});

test('5B goal scenario supports a changed contribution and a withdrawal without mutating history', () => {
    const plan = goalPlan({
        amounts: {
            ...goalPlan().amounts,
            target_cents: 50_000,
            current_cents: 0,
            scheduled_contribution_cents: 10_000
        },
        terms: { ...goalPlan().terms, target_on: '2026-12-31' }
    });
    const comparison = compareProjectedPlanScenario({
        plan,
        asOf: '2026-07-13',
        scenario: {
            additional_monthly_cents: 5_000,
            one_time_movements: [
                { type: 'withdrawal', amount_cents: 5_000, effective_on: '2026-08-31' }
            ]
        }
    });

    assert.strictEqual(comparison.baseline.mode, 'projected');
    assert.strictEqual(comparison.simulated.mode, 'simulated');
    assert.strictEqual(comparison.simulated.schedule[1].scenario_amount_cents, -5_000);
    assert.ok(comparison.simulated.schedule.every(item => item.state === 'simulated'));
    assert.deepStrictEqual(comparison.separation, {
        history_state: 'realized',
        baseline_state: 'projected',
        scenario_state: 'simulated',
        persisted: false,
        writes_performed: 0
    });
});

test('5B debt schedule applies interest, costs and principal in explicit cent-rounded order', () => {
    const result = buildProjectedPlanSchedule({ plan: debtPlan(), asOf: '2026-07-13' });

    assert.strictEqual(result.source_status, 'available');
    assert.strictEqual(result.months_to_completion, 4);
    assert.strictEqual(result.completion_on, '2026-10-20');
    assert.strictEqual(result.total_interest_cents, 4_595);
    assert.deepStrictEqual(result.schedule[0], {
        sequence: 1,
        state: 'projected',
        occurred_on: null,
        effective_on: '2026-07-20',
        competence_month: '2026-07',
        due_on: '2026-07-20',
        opening_balance_cents: 100_000,
        interest_cents: 2_000,
        cost_cents: 0,
        scheduled_amount_cents: 30_000,
        scenario_amount_cents: 0,
        scenario_effects: [],
        total_payment_cents: 30_000,
        principal_change_cents: -28_000,
        closing_balance_cents: 72_000
    });
    assert.match(result.criteria.join(' '), /juros.*custos.*principal.*centavos/i);
});

test('5B extra debt payment produces a reproducible payoff impact and never writes a movement', () => {
    const result = compareProjectedPlanScenario({
        plan: debtPlan(),
        asOf: '2026-07-13',
        scenario: {
            one_time_movements: [
                { type: 'extra_payment', amount_cents: 20_000, effective_on: '2026-07-20' }
            ]
        }
    });

    assert.strictEqual(result.baseline.months_to_completion, 4);
    assert.strictEqual(result.simulated.months_to_completion, 3);
    assert.strictEqual(result.simulated.completion_on, '2026-09-20');
    assert.strictEqual(result.impact.months_saved, 1);
    assert.strictEqual(result.impact.interest_saved_cents, 1_094);
    assert.strictEqual(result.simulated.schedule[0].scenario_amount_cents, 20_000);
    assert.strictEqual(result.simulated.writes_performed, 0);
    assert.ok(!Object.hasOwn(result.simulated, 'plan_movements'));
});

test('5B PRICE financing calculates a fixed installment and closes within the informed term', () => {
    const plan = debtPlan({
        type: 'financing',
        amounts: { ...debtPlan().amounts, principal_cents: 120_000, outstanding_cents: 120_000, installment_cents: null },
        terms: { ...debtPlan().terms, term_months: 12, interest_rate_basis_points: 100, amortization_method: 'PRICE' }
    });
    const result = buildProjectedPlanSchedule({ plan, asOf: '2026-07-13' });

    assert.strictEqual(result.source_status, 'available');
    assert.strictEqual(result.schedule.length, 12);
    assert.ok(result.schedule.every((item, index, rows) => index === rows.length - 1 || item.scheduled_amount_cents === rows[0].scheduled_amount_cents));
    assert.strictEqual(result.schedule.at(-1).closing_balance_cents, 0);
    assert.match(result.criteria.join(' '), /PRICE/);
});

test('5B SAC financing keeps principal amortization constant and lets payments decline', () => {
    const plan = debtPlan({
        type: 'financing',
        amounts: { ...debtPlan().amounts, principal_cents: 120_000, outstanding_cents: 120_000, installment_cents: null },
        terms: { ...debtPlan().terms, term_months: 12, interest_rate_basis_points: 100, amortization_method: 'SAC' }
    });
    const result = buildProjectedPlanSchedule({ plan, asOf: '2026-07-13' });

    assert.strictEqual(result.schedule.length, 12);
    assert.strictEqual(result.schedule[0].principal_change_cents, -10_000);
    assert.strictEqual(result.schedule[1].principal_change_cents, -10_000);
    assert.ok(result.schedule[0].total_payment_cents > result.schedule[1].total_payment_cents);
    assert.strictEqual(result.schedule.at(-1).closing_balance_cents, 0);
});

test('5B consortium with an explicit zero rate is projected without inventing interest', () => {
    const plan = debtPlan({
        type: 'consortium',
        amounts: { ...debtPlan().amounts, outstanding_cents: 90_000, installment_cents: 30_000 },
        terms: { ...debtPlan().terms, interest_rate_basis_points: 0, interest_period: 'monthly' }
    });
    const result = buildProjectedPlanSchedule({ plan, asOf: '2026-07-13' });

    assert.strictEqual(result.source_status, 'available');
    assert.strictEqual(result.months_to_completion, 3);
    assert.strictEqual(result.total_interest_cents, 0);
});

test('5B converts annual rates explicitly and records the assumption used', () => {
    const plan = debtPlan({
        terms: { ...debtPlan().terms, interest_rate_basis_points: 1_200, interest_period: 'annual' }
    });
    const result = buildProjectedPlanSchedule({ plan, asOf: '2026-07-13' });

    assert.ok(result.assumptions.some(item => item.code === 'annual_rate_converted_to_effective_monthly'));
    assert.ok(Number.isSafeInteger(result.assumptions.find(item => item.code === 'annual_rate_converted_to_effective_monthly').monthly_rate_basis_points));
});

test('5B refuses to turn missing debt sources into zero and explains partial/unavailable states', () => {
    const missingRate = debtPlan({
        terms: { ...debtPlan().terms, interest_rate_basis_points: null, interest_period: null }
    });
    const partial = buildProjectedPlanSchedule({ plan: missingRate, asOf: '2026-07-13' });
    assert.strictEqual(partial.source_status, 'partial');
    assert.strictEqual(partial.schedule.length, 0);
    assert.ok(partial.missing_assumptions.includes('interest_rate_basis_points'));
    assert.strictEqual(partial.total_interest_cents, null);

    const missingBalance = debtPlan({
        amounts: { ...debtPlan().amounts, outstanding_cents: null }
    });
    const unavailable = buildProjectedPlanSchedule({ plan: missingBalance, asOf: '2026-07-13' });
    assert.strictEqual(unavailable.source_status, 'unavailable');
    assert.strictEqual(unavailable.remaining_cents, null);
    assert.strictEqual(unavailable.schedule.length, 0);
    assert.ok(unavailable.missing_assumptions.includes('outstanding_cents'));
});

test('5B detects non-amortizing payments and bounds the monthly simulation', () => {
    const plan = debtPlan({
        amounts: { ...debtPlan().amounts, installment_cents: 1_000 },
        terms: { ...debtPlan().terms, interest_rate_basis_points: 200 }
    });
    const result = buildProjectedPlanSchedule({ plan, asOf: '2026-07-13', maxMonths: 24 });

    assert.strictEqual(result.source_status, 'partial');
    assert.strictEqual(result.completion_on, null);
    assert.strictEqual(result.schedule.length, 1);
    assert.ok(result.issues.includes('non_amortizing_payment'));
});

test('5B rejects invalid dates and invalid scenario movements before calculating', () => {
    assert.throws(
        () => buildProjectedPlanSchedule({ plan: goalPlan(), asOf: '13/07/2026' }),
        /invalid_as_of/
    );
    assert.throws(
        () => buildProjectedPlanSchedule({
            plan: goalPlan(),
            asOf: '2026-07-13',
            scenario: { one_time_movements: [{ type: 'withdrawal', amount_cents: -1, effective_on: '2026-08-31' }] }
        }),
        /invalid_scenario_amount/
    );
});
