const crypto = require('crypto');

const PROJECTED_PLAN_SCHEDULE_SCHEMA_VERSION = 'projected-plan-schedule-v1';
const PROJECTED_PLAN_SCHEDULE_ENGINE_VERSION = 'projected-plans-monthly-engine-v1';
const TIMEZONE = 'America/Sao_Paulo';
const MAX_MONTHS_LIMIT = 600;

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value).sort().reduce((result, key) => {
        result[key] = stableValue(value[key]);
        return result;
    }, {});
}

function fingerprint(value) {
    return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

function isSafeCents(value) {
    return Number.isSafeInteger(value);
}

function parseIsoDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
    return { year, month, day, iso: `${match[1]}-${match[2]}-${match[3]}` };
}

function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isoFromParts(year, month, day) {
    const safeDay = Math.min(Math.max(1, day), daysInMonth(year, month));
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

function addCalendarMonths({ year, month }, offset, preferredDay) {
    const zeroBased = (year * 12) + (month - 1) + offset;
    const nextYear = Math.floor(zeroBased / 12);
    const nextMonth = (zeroBased % 12) + 1;
    return isoFromParts(nextYear, nextMonth, preferredDay);
}

function dateDifferenceDays(later, earlier) {
    const left = parseIsoDate(later);
    const right = parseIsoDate(earlier);
    if (!left || !right) return null;
    const leftMs = Date.UTC(left.year, left.month - 1, left.day);
    const rightMs = Date.UTC(right.year, right.month - 1, right.day);
    return Math.round((leftMs - rightMs) / 86_400_000);
}

function nextMonthlyDate({ asOf, nextDueOn, dueDay, fallbackDay }) {
    const reference = parseIsoDate(asOf);
    const explicit = parseIsoDate(nextDueOn);
    if (explicit && explicit.iso >= reference.iso) {
        return { firstDueOn: explicit.iso, preferredDay: explicit.day };
    }
    const preferredDay = Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 31
        ? dueDay
        : fallbackDay;
    let candidate = isoFromParts(reference.year, reference.month, preferredDay);
    if (candidate < reference.iso) {
        candidate = addCalendarMonths(reference, 1, preferredDay);
    }
    return { firstDueOn: candidate, preferredDay };
}

function monthCountInclusive(firstDate, lastDate) {
    const first = parseIsoDate(firstDate);
    const last = parseIsoDate(lastDate);
    if (!first || !last || first.iso > last.iso) return 0;
    return ((last.year - first.year) * 12) + last.month - first.month + 1;
}

function normalizeMaxMonths(value) {
    const parsed = Number.parseInt(value || MAX_MONTHS_LIMIT, 10);
    if (!Number.isInteger(parsed) || parsed < 1) return MAX_MONTHS_LIMIT;
    return Math.min(parsed, MAX_MONTHS_LIMIT);
}

function validateScenario(rawScenario, asOf) {
    const scenario = rawScenario && typeof rawScenario === 'object' && !Array.isArray(rawScenario)
        ? rawScenario
        : {};
    const allowedKeys = new Set([
        'monthly_amount_cents',
        'additional_monthly_cents',
        'assumed_monthly_rate_basis_points',
        'monthly_cost_cents',
        'one_time_movements'
    ]);
    const unknown = Object.keys(scenario).filter(key => !allowedKeys.has(key));
    if (unknown.length > 0) throw new Error(`invalid_scenario_field:${unknown.join(',')}`);

    for (const key of ['monthly_amount_cents', 'assumed_monthly_rate_basis_points', 'monthly_cost_cents']) {
        if (scenario[key] !== undefined && (!isSafeCents(scenario[key]) || scenario[key] < 0)) {
            throw new Error(`invalid_scenario_amount:${key}`);
        }
    }
    if (scenario.additional_monthly_cents !== undefined && !isSafeCents(scenario.additional_monthly_cents)) {
        throw new Error('invalid_scenario_amount:additional_monthly_cents');
    }

    const movements = Array.isArray(scenario.one_time_movements) ? scenario.one_time_movements : [];
    const normalizedMovements = movements.map((movement, index) => {
        const type = String(movement?.type || '').trim();
        if (!['contribution', 'withdrawal', 'extra_payment'].includes(type)) {
            throw new Error(`invalid_scenario_movement_type:${index}`);
        }
        if (!isSafeCents(movement?.amount_cents) || movement.amount_cents <= 0) {
            throw new Error(`invalid_scenario_amount:${index}`);
        }
        const effective = parseIsoDate(movement?.effective_on);
        if (!effective || effective.iso < asOf) throw new Error(`invalid_scenario_effective_on:${index}`);
        return { type, amount_cents: movement.amount_cents, effective_on: effective.iso };
    }).sort((left, right) => left.effective_on.localeCompare(right.effective_on) || left.type.localeCompare(right.type));

    return {
        ...(scenario.monthly_amount_cents !== undefined ? { monthly_amount_cents: scenario.monthly_amount_cents } : {}),
        ...(scenario.additional_monthly_cents !== undefined ? { additional_monthly_cents: scenario.additional_monthly_cents } : {}),
        ...(scenario.assumed_monthly_rate_basis_points !== undefined
            ? { assumed_monthly_rate_basis_points: scenario.assumed_monthly_rate_basis_points }
            : {}),
        ...(scenario.monthly_cost_cents !== undefined ? { monthly_cost_cents: scenario.monthly_cost_cents } : {}),
        one_time_movements: normalizedMovements
    };
}

function hasMaterialScenario(scenario) {
    return scenario.monthly_amount_cents !== undefined ||
        Number(scenario.additional_monthly_cents || 0) !== 0 ||
        scenario.assumed_monthly_rate_basis_points !== undefined ||
        scenario.monthly_cost_cents !== undefined ||
        scenario.one_time_movements.length > 0;
}

function baseResult({ plan, asOf, mode, scenario }) {
    const declaredSourceStatus = ['available', 'partial', 'unavailable'].includes(plan?.source?.data_status)
        ? plan.source.data_status
        : 'available';
    return {
        schema_version: PROJECTED_PLAN_SCHEDULE_SCHEMA_VERSION,
        engine_version: PROJECTED_PLAN_SCHEDULE_ENGINE_VERSION,
        plan_id: String(plan?.plan_id || ''),
        plan_type: String(plan?.type || ''),
        plan_version: Number(plan?.version || 1),
        currency: String(plan?.currency || 'BRL'),
        timezone: TIMEZONE,
        as_of: asOf,
        mode,
        source_status: declaredSourceStatus,
        completion_on: null,
        months_to_completion: null,
        remaining_cents: null,
        total_interest_cents: null,
        total_cost_cents: null,
        total_payment_cents: null,
        schedule: [],
        assumptions: [],
        missing_assumptions: [],
        issues: [],
        criteria: [],
        input_fingerprint: fingerprint({
            engine: PROJECTED_PLAN_SCHEDULE_ENGINE_VERSION,
            plan,
            asOf,
            scenario
        }),
        writes_performed: 0
    };
}

function setSourceStatus(result, nextStatus) {
    const priority = { available: 0, partial: 1, unavailable: 2 };
    if ((priority[nextStatus] ?? 0) > (priority[result.source_status] ?? 0)) {
        result.source_status = nextStatus;
    }
}

function scenarioMovementsForPeriod(movements, previousDueOn, dueOn) {
    return movements.filter(item => item.effective_on <= dueOn && (!previousDueOn || item.effective_on > previousDueOn));
}

function goalSchedule({ plan, asOf, scenario, mode, maxMonths }) {
    const result = baseResult({ plan, asOf, mode, scenario });
    const target = plan?.amounts?.target_cents;
    const current = plan?.amounts?.current_cents;
    if (!isSafeCents(target) || target < 0 || !isSafeCents(current) || current < 0) {
        setSourceStatus(result, 'unavailable');
        if (!isSafeCents(target)) result.missing_assumptions.push('target_cents');
        if (!isSafeCents(current)) result.missing_assumptions.push('current_cents');
        result.criteria.push('Fonte sem alvo ou valor atual confiável permanece indisponível; ausência não vira zero.');
        return result;
    }

    result.remaining_cents = Math.max(0, target - current);
    result.total_interest_cents = 0;
    result.total_cost_cents = 0;
    result.total_payment_cents = 0;
    if (current >= target) {
        result.completion_on = asOf;
        result.months_to_completion = 0;
        result.criteria.push('A meta já atingiu o alvo no estado atual observado.');
        return result;
    }

    const targetDate = parseIsoDate(plan?.terms?.target_on);
    const reference = parseIsoDate(asOf);
    const fallbackDay = targetDate?.day || reference.day;
    const due = nextMonthlyDate({
        asOf,
        nextDueOn: plan?.terms?.next_due_on,
        dueDay: plan?.terms?.due_day,
        fallbackDay
    });

    let monthlyAmount = scenario.monthly_amount_cents;
    if (monthlyAmount === undefined) monthlyAmount = plan?.amounts?.scheduled_contribution_cents;
    if (!isSafeCents(monthlyAmount) || monthlyAmount <= 0) {
        const occurrences = targetDate ? monthCountInclusive(due.firstDueOn, targetDate.iso) : 0;
        if (occurrences > 0) {
            monthlyAmount = Math.ceil((target - current) / occurrences);
            result.assumptions.push({
                code: 'monthly_contribution_derived_from_target_date',
                occurrences,
                monthly_amount_cents: monthlyAmount
            });
        } else {
            setSourceStatus(result, 'partial');
            result.missing_assumptions.push('scheduled_contribution_cents_or_future_target_on');
            result.criteria.push('Sem aporte mensal ou prazo futuro, não estimei uma data de conclusão.');
            return result;
        }
    }

    monthlyAmount += Number(scenario.additional_monthly_cents || 0);
    if (!isSafeCents(monthlyAmount) || monthlyAmount <= 0) {
        setSourceStatus(result, 'partial');
        result.issues.push('non_progressing_contribution');
        result.criteria.push('O aporte mensal do cenário precisa ser positivo para produzir cronograma.');
        return result;
    }

    let balance = current;
    let previousDueOn = null;
    for (let index = 0; index < maxMonths && balance < target; index += 1) {
        const first = parseIsoDate(due.firstDueOn);
        const dueOn = addCalendarMonths(first, index, due.preferredDay);
        const movements = scenarioMovementsForPeriod(scenario.one_time_movements, previousDueOn, dueOn);
        let scenarioAmount = 0;
        for (const movement of movements) {
            if (movement.type === 'withdrawal') scenarioAmount -= movement.amount_cents;
            if (movement.type === 'contribution') scenarioAmount += movement.amount_cents;
            if (movement.type === 'extra_payment') throw new Error('invalid_scenario_movement_for_goal:extra_payment');
        }
        const opening = balance;
        if (opening + monthlyAmount + scenarioAmount < 0) {
            setSourceStatus(result, 'partial');
            result.issues.push('scenario_withdrawal_exceeds_balance');
            break;
        }
        const actualIncrease = Math.min(target - opening, monthlyAmount + scenarioAmount);
        balance = opening + actualIncrease;
        result.total_payment_cents += actualIncrease;
        result.schedule.push({
            sequence: index + 1,
            state: mode,
            occurred_on: null,
            effective_on: dueOn,
            competence_month: dueOn.slice(0, 7),
            due_on: dueOn,
            opening_balance_cents: opening,
            interest_cents: 0,
            cost_cents: 0,
            scheduled_amount_cents: monthlyAmount,
            scenario_amount_cents: scenarioAmount,
            total_payment_cents: actualIncrease,
            principal_change_cents: actualIncrease,
            closing_balance_cents: balance,
            scenario_effects: movements.map(item => ({ ...item }))
        });
        previousDueOn = dueOn;
    }

    result.remaining_cents = Math.max(0, target - balance);
    result.months_to_completion = balance >= target ? result.schedule.length : null;
    result.completion_on = balance >= target ? result.schedule.at(-1)?.due_on || asOf : null;
    if (balance < target && !result.issues.length) {
        setSourceStatus(result, 'partial');
        result.issues.push('max_months_reached');
    }
    result.criteria.push('Cada linha é projeção mensal; não possui data de fato realizado. Efeito, competência e vencimento permanecem campos separados.');
    if (scenario.one_time_movements.length > 0) {
        result.criteria.push('Eventos antecipados preservam sua data de efeito e são agrupados na primeira competência mensal alcançada, sem mudar o vencimento.');
    }
    result.criteria.push('Aportes e retiradas do cenário alteram somente a simulação em memória e não criam plan_movements.');
    return result;
}

function monthlyRate(plan, scenario, result) {
    let basisPoints = plan?.terms?.interest_rate_basis_points;
    const period = String(plan?.terms?.interest_period || '');
    if (!isSafeCents(basisPoints) || basisPoints < 0) {
        if (scenario.assumed_monthly_rate_basis_points === undefined) return null;
        basisPoints = scenario.assumed_monthly_rate_basis_points;
        setSourceStatus(result, 'partial');
        result.assumptions.push({
            code: 'scenario_monthly_rate_used_for_missing_source',
            monthly_rate_basis_points: basisPoints
        });
        return basisPoints;
    }
    if (period === 'monthly') return basisPoints;
    if (period === 'annual') {
        const effectiveMonthly = Math.round((Math.pow(1 + (basisPoints / 10_000), 1 / 12) - 1) * 10_000);
        result.assumptions.push({
            code: 'annual_rate_converted_to_effective_monthly',
            source_rate_basis_points: basisPoints,
            monthly_rate_basis_points: effectiveMonthly
        });
        return effectiveMonthly;
    }
    if (period === 'daily') {
        const effectiveMonthly = Math.round((Math.pow(1 + (basisPoints / 10_000), 30) - 1) * 10_000);
        result.assumptions.push({
            code: 'daily_rate_compounded_for_30_day_month',
            source_rate_basis_points: basisPoints,
            monthly_rate_basis_points: effectiveMonthly
        });
        return effectiveMonthly;
    }
    if (basisPoints === 0) {
        result.assumptions.push({ code: 'explicit_zero_rate_treated_as_monthly' });
        return 0;
    }
    return null;
}

function pricePayment(principalCents, monthlyRateBasisPoints, months) {
    if (monthlyRateBasisPoints === 0) return Math.ceil(principalCents / months);
    const rate = monthlyRateBasisPoints / 10_000;
    return Math.round((principalCents * rate) / (1 - Math.pow(1 + rate, -months)));
}

function debtSchedule({ plan, asOf, scenario, mode, maxMonths }) {
    const result = baseResult({ plan, asOf, mode, scenario });
    const outstanding = plan?.amounts?.outstanding_cents;
    if (!isSafeCents(outstanding) || outstanding < 0) {
        setSourceStatus(result, 'unavailable');
        result.missing_assumptions.push('outstanding_cents');
        result.criteria.push('Fonte sem saldo devedor confiável permanece indisponível; ausência não vira zero.');
        return result;
    }
    result.remaining_cents = outstanding;
    if (outstanding === 0) {
        result.completion_on = asOf;
        result.months_to_completion = 0;
        result.total_interest_cents = 0;
        result.total_cost_cents = 0;
        result.total_payment_cents = 0;
        return result;
    }

    const rateBasisPoints = monthlyRate(plan, scenario, result);
    if (rateBasisPoints === null) {
        setSourceStatus(result, 'partial');
        result.missing_assumptions.push('interest_rate_basis_points');
        result.criteria.push('Sem taxa e periodicidade confiáveis, não tratei juros ausentes como zero.');
        return result;
    }

    const method = String(plan?.terms?.amortization_method || '').toUpperCase();
    const termMonths = Number(plan?.terms?.term_months);
    const observedInstallment = plan?.amounts?.installment_cents;
    let fixedPricePayment = null;
    let fixedSacPrincipal = null;
    if (method === 'PRICE' && isSafeCents(observedInstallment) && observedInstallment > 0) {
        fixedPricePayment = observedInstallment;
        result.assumptions.push({ code: 'observed_price_installment_used' });
        result.criteria.push('PRICE: usei a parcela fixa observada na fonte; a última parcela absorve apenas o saldo residual.');
    } else if (method === 'PRICE' && Number.isInteger(termMonths) && termMonths > 0) {
        fixedPricePayment = pricePayment(outstanding, rateBasisPoints, termMonths);
        result.criteria.push(`PRICE: parcela calculada com taxa mensal e prazo de ${termMonths} meses; a última parcela absorve resíduos de arredondamento.`);
    } else if (method === 'SAC' && Number.isInteger(termMonths) && termMonths > 0) {
        fixedSacPrincipal = Math.ceil(outstanding / termMonths);
        result.criteria.push(`SAC: principal constante em até ${termMonths} meses; juros incidem sobre o saldo inicial de cada competência.`);
    } else if (!isSafeCents(observedInstallment) || observedInstallment <= 0) {
        setSourceStatus(result, 'partial');
        result.missing_assumptions.push('installment_cents_or_supported_amortization_terms');
        result.criteria.push('Sem parcela observada ou termos completos de Price/SAC, não estimei quitação.');
        return result;
    }

    const reference = parseIsoDate(asOf);
    const due = nextMonthlyDate({
        asOf,
        nextDueOn: plan?.terms?.next_due_on,
        dueDay: plan?.terms?.due_day,
        fallbackDay: reference.day
    });
    const monthlyCost = scenario.monthly_cost_cents ?? plan?.terms?.monthly_cost_cents ?? 0;
    if (!isSafeCents(monthlyCost) || monthlyCost < 0) throw new Error('invalid_monthly_cost_cents');
    if (plan?.terms?.monthly_cost_cents === undefined && scenario.monthly_cost_cents === undefined) {
        result.assumptions.push({
            code: 'no_separate_monthly_cost_observed',
            explanation: 'A parcela foi tratada como pagamento total; nenhum custo separado foi somado.'
        });
    }

    let balance = outstanding;
    let previousDueOn = null;
    let totalInterest = 0;
    let totalCost = 0;
    let totalPayment = 0;
    for (let index = 0; index < maxMonths && balance > 0; index += 1) {
        const first = parseIsoDate(due.firstDueOn);
        const dueOn = addCalendarMonths(first, index, due.preferredDay);
        const interest = Math.round((balance * rateBasisPoints) / 10_000);
        const cost = monthlyCost;
        let scheduledPayment;
        if (fixedSacPrincipal !== null) {
            scheduledPayment = Math.min(fixedSacPrincipal, balance) + interest + cost;
        } else if (fixedPricePayment !== null) {
            scheduledPayment = fixedPricePayment + cost;
            if (index + 1 >= termMonths) scheduledPayment = balance + interest + cost;
        } else {
            scheduledPayment = observedInstallment;
        }

        const movements = scenarioMovementsForPeriod(scenario.one_time_movements, previousDueOn, dueOn);
        let scenarioAmount = Number(scenario.additional_monthly_cents || 0);
        for (const movement of movements) {
            if (movement.type !== 'extra_payment') throw new Error(`invalid_scenario_movement_for_debt:${movement.type}`);
            scenarioAmount += movement.amount_cents;
        }
        if (!isSafeCents(scenarioAmount) || scheduledPayment + scenarioAmount < 0) {
            throw new Error('invalid_scenario_debt_payment');
        }

        const available = balance + interest + cost;
        const requested = scheduledPayment + scenarioAmount;
        const actualPayment = Math.min(requested, available);
        const principalPaid = Math.max(0, actualPayment - interest - cost);
        const closing = available - actualPayment;
        totalInterest += interest;
        totalCost += cost;
        totalPayment += actualPayment;
        result.schedule.push({
            sequence: index + 1,
            state: mode,
            occurred_on: null,
            effective_on: dueOn,
            competence_month: dueOn.slice(0, 7),
            due_on: dueOn,
            opening_balance_cents: balance,
            interest_cents: interest,
            cost_cents: cost,
            scheduled_amount_cents: scheduledPayment,
            scenario_amount_cents: scenarioAmount,
            total_payment_cents: actualPayment,
            principal_change_cents: -principalPaid,
            closing_balance_cents: closing,
            scenario_effects: movements.map(item => ({ ...item }))
        });
        balance = closing;
        previousDueOn = dueOn;

        if (principalPaid <= 0 && balance > 0) {
            setSourceStatus(result, 'partial');
            result.issues.push('non_amortizing_payment');
            break;
        }
    }

    result.remaining_cents = balance;
    result.total_interest_cents = totalInterest;
    result.total_cost_cents = totalCost;
    result.total_payment_cents = totalPayment;
    result.months_to_completion = balance === 0 ? result.schedule.length : null;
    result.completion_on = balance === 0 ? result.schedule.at(-1)?.due_on || asOf : null;
    if (balance > 0 && !result.issues.length) {
        setSourceStatus(result, 'partial');
        result.issues.push('max_months_reached');
    }
    result.criteria.push('Ordem mensal: juros sobre o saldo inicial, depois custos separados, depois pagamento e redução do principal; cada etapa é arredondada em centavos.');
    result.criteria.push('Cada linha é projeção mensal; data de fato permanece nula e efeito, competência e vencimento permanecem separados.');
    if (scenario.one_time_movements.length > 0) {
        result.criteria.push('Eventos antecipados preservam sua data de efeito e são agrupados na primeira competência mensal alcançada, sem mudar o vencimento.');
    }
    result.criteria.push('Pagamentos extras existem somente no cenário em memória e não criam plan_movements.');
    return result;
}

function buildProjectedPlanSchedule({ plan, asOf, scenario: rawScenario = {}, maxMonths = MAX_MONTHS_LIMIT } = {}) {
    if (!plan || typeof plan !== 'object' || Array.isArray(plan) || !String(plan.plan_id || '').trim()) {
        throw new Error('invalid_plan');
    }
    const parsedAsOf = parseIsoDate(asOf);
    if (!parsedAsOf) throw new Error('invalid_as_of');
    if (!['goal', 'debt', 'financing', 'consortium'].includes(plan.type)) {
        throw new Error(`unsupported_plan_type:${plan.type}`);
    }
    const scenario = validateScenario(rawScenario, parsedAsOf.iso);
    const mode = hasMaterialScenario(scenario) ? 'simulated' : 'projected';
    const effectiveMaxMonths = normalizeMaxMonths(maxMonths);
    if (plan.type === 'goal') {
        return goalSchedule({ plan, asOf: parsedAsOf.iso, scenario, mode, maxMonths: effectiveMaxMonths });
    }
    return debtSchedule({ plan, asOf: parsedAsOf.iso, scenario, mode, maxMonths: effectiveMaxMonths });
}

function nullableDifference(left, right) {
    return Number.isSafeInteger(left) && Number.isSafeInteger(right) ? left - right : null;
}

function compareProjectedPlanScenario({ plan, asOf, scenario, maxMonths = MAX_MONTHS_LIMIT } = {}) {
    const baseline = buildProjectedPlanSchedule({ plan, asOf, maxMonths });
    const simulated = buildProjectedPlanSchedule({ plan, asOf, scenario, maxMonths });
    const monthsSaved = nullableDifference(baseline.months_to_completion, simulated.months_to_completion);
    const interestSaved = nullableDifference(baseline.total_interest_cents, simulated.total_interest_cents);
    const costSaved = nullableDifference(baseline.total_cost_cents, simulated.total_cost_cents);
    return {
        schema_version: 'projected-plan-scenario-comparison-v1',
        baseline,
        simulated,
        impact: {
            months_saved: monthsSaved,
            interest_saved_cents: interestSaved,
            cost_saved_cents: costSaved,
            completion_advance_days: baseline.completion_on && simulated.completion_on
                ? dateDifferenceDays(baseline.completion_on, simulated.completion_on)
                : null
        },
        separation: {
            history_state: 'realized',
            baseline_state: 'projected',
            scenario_state: 'simulated',
            persisted: false,
            writes_performed: 0
        }
    };
}

module.exports = {
    PROJECTED_PLAN_SCHEDULE_SCHEMA_VERSION,
    PROJECTED_PLAN_SCHEDULE_ENGINE_VERSION,
    buildProjectedPlanSchedule,
    compareProjectedPlanScenario,
    __test__: {
        parseIsoDate,
        addCalendarMonths,
        monthCountInclusive,
        pricePayment
    }
};
