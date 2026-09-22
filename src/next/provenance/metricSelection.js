'use strict';

const { parseDate, parseMonth, offsetDate, monthBounds, inclusiveDayCount } = require('./civilCalendar');
const { validateLiteral } = require('./literalTypes');
const { readNodeIdentity, createUniqueNodeReader, readReference, readReferenceId, readReferenceIds } = require('./metricReferences');
const fail = code => { throw new Error(`metric_selection_${code}`); };
const id = value => { validateLiteral({ type: 'id', value }); return value; };
const money = value => {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail('money');
    return value;
};

// Internal composition shared by metric kernels. The population is observed;
// references are checked by full identity, not by a coincident category name.
function createCategoryReader(categories) {
    const index = new Map();
    for (const node of categories) {
        const key = id(node.get('id'));
        if (node.identity('kind') !== 'category' || index.has(key)) fail('category');
        const economicKind = node.get('kind');
        if (!['expense', 'compensation', 'income', 'neutral'].includes(economicKind)) fail('category');
        index.set(key, { version: node.identity('version'), economicKind });
    }
    return {
        has: key => index.has(key),
        read(event) {
            const { node, ref: key, version } = readReference(event, 'category_id', 'category');
            const bound = index.get(key);
            if (!bound || bound.version !== version) fail('category');
            const economicKind = node.get('kind');
            if (economicKind !== bound.economicKind) fail('category');
            return { key, economicKind: bound.economicKind, node };
        }
    };
}

// Internal metric behavior, not a proof validator or a public execution host.
// Only handles supplied through admitted registry roles are used. No graph,
// selected roster, fact key, oracle or expected result is an input.
function selectEconomicEvents(operands, mode) {
    if (!['total', 'category', 'spent', 'income', 'instrument', 'budget_class', 'budget_remaining', 'statement', 'safe_pace'].includes(mode)) fail('mode');
    const pace = mode === 'safe_pace';
    const instrumentMode = mode === 'instrument' || mode === 'statement';
    const context = operands.context;
    if (instrumentMode && context.get('coverage') !== 'complete') fail('coverage');
    const basis = context.get('time_basis');
    if (!(pace ? basis === '15_full_days_after_as_of' : mode === 'statement' ? ['statement_due_date', 'statement_competence'].includes(basis)
        : mode === 'budget_remaining' ? basis === 'budget_cycle' : mode === 'spent' ? ['event_date', 'budget_cycle'].includes(basis) : basis === 'event_date')
        || ((pace || instrumentMode) && context.get('evidence_state') !== (pace ? 'estimated' : 'confirmed'))) fail('context');
    const period = context.get('period');
    let month; let contains; let divisor;
    if (pace) {
        const policy = operands.policy;
        const cutoff = operands.clock.civilDate('fixed_clock', policy.get('timezone'), policy.get('calendar'));
        month = operands.budget.get('period'); const bounds = monthBounds(month);
        if (cutoff < bounds.start || cutoff >= bounds.end) fail('pace');
        const start = offsetDate(cutoff, 1, 'day'); const end = bounds.end;
        divisor = inclusiveDayCount({ start, end, start_inclusive: true, end_inclusive: true });
        if (divisor !== 15 || policy.get('daily_pace_divisor') !== divisor || policy.get('daily_pace_rounding') !== 'floor'
            || policy.get('daily_pace_as_of') !== cutoff || policy.get('daily_pace_start') !== start || policy.get('daily_pace_end') !== end
            || period.get('kind') !== 'range' || period.get('start') !== start || period.get('end') !== end
            || period.get('start_inclusive') !== true || period.get('end_inclusive') !== true) fail('pace');
        contains = value => value >= bounds.start && value <= cutoff;
    } else if (mode === 'statement') {
        readNodeIdentity(operands.policy, 'evaluation_policy');
        if (period.get('kind') !== 'statement_due' || operands.policy.get('calendar') !== 'proleptic_gregorian') fail('statement');
        const due = period.get('value'); const date = parseDate(due);
        const closingDay = operands.card.get('closing_day'); const dueDay = operands.card.get('due_day');
        if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31
            || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31 || date.day !== dueDay) fail('statement');
        const end = `${due.slice(0, 7)}-${String(closingDay).padStart(2, '0')}`; parseDate(end);
        const start = offsetDate(end, -1, 'month');
        contains = value => value > start && value <= end;
    } else {
        if (period.get('kind') !== 'month') fail('period');
        month = period.get('value'); parseMonth(month);
        contains = value => value.slice(0, 7) === month;
    }
    const subject = context.get('subject'); const kind = subject.get('kind');
    const family = pace ? readReference(operands.budget, 'family_id', 'family').node : operands.family;
    const familyId = instrumentMode ? undefined : id(family.get('id'));
    const familyMembers = instrumentMode ? undefined : readReferenceIds(family, 'members');
    let person; let category; let expectedFamily; let instrument; let instrumentVersion; let budgetClass;
    if (mode === 'budget_remaining' || pace) {
        if (operands.budget.identity('kind') !== 'budget') fail('budget');
        const budgetId = id(operands.budget.get('id'));
        if (kind === 'budget') { if (id(subject.get('ref_id')) !== budgetId) fail('scope'); }
        else if (!pace && kind === 'budget_person') {
            if (id(subject.get('budget_id')) !== budgetId) fail('scope');
            person = id(subject.get('person_id')); if (!familyMembers.includes(person)) fail('scope');
        } else fail('scope');
        expectedFamily = pace ? familyId : readReferenceId(operands.budget, 'family_id');
        category = readReferenceId(operands.budget, 'category_id');
        if (operands.budget.get('period') !== month) fail('budget');
    } else if (instrumentMode) {
        const target = mode === 'statement' ? operands.card : operands.instrument;
        if (!['account', 'card'].includes(kind) || mode === 'statement' && kind !== 'card' || target.identity('kind') !== kind) fail('scope');
        instrument = id(target.get('id')); instrumentVersion = target.identity('version');
        validateLiteral({ type: 'digest', value: instrumentVersion });
        if (id(subject.get('ref_id')) !== instrument) fail('scope');
    } else if (['total', 'income', 'budget_class'].includes(mode)) {
        if (kind === 'person') person = id(subject.get('ref_id'));
        else if (kind === 'family') expectedFamily = id(subject.get('ref_id'));
        else fail('scope');
        if (mode === 'budget_class') {
            if (kind !== 'family') fail('scope');
            budgetClass = context.get('filters').get('budget_class');
            if (!['essential', 'flexible'].includes(budgetClass)) fail('filter');
        }
    } else {
        if (kind === 'person_category') { person = id(subject.get('person_id')); category = id(subject.get('category_id')); }
        else if (kind === 'family_category') { expectedFamily = id(subject.get('family_id')); category = id(subject.get('category_id')); }
        else if (kind === 'category') { expectedFamily = familyId; category = id(subject.get('ref_id')); }
        else fail('scope');
    }
    if (expectedFamily !== undefined && familyId !== expectedFamily) fail('scope');

    // Category population is an explicit role, not an incidental global map.
    // A followed category must also belong to this admitted operand population.
    const categoryReader = createCategoryReader(operands.categories);
    if (category !== undefined && !categoryReader.has(category)) fail('category');
    const categoryOf = event => categoryReader.read(event);
    const candidates = createUniqueNodeReader('event');
    const selected = operands.events.select(event => {
        const candidateIdentity = candidates.read(event);
        const state = event.get('state');
        if (!['confirmed', 'projected'].includes(state)) fail('state');
        const date = event.get('date'); parseDate(date);
        const owner = instrumentMode ? undefined : readReferenceId(event, 'person_id');
        const ownCategory = categoryOf(event);
        const economicMatch = mode === 'income' ? ownCategory.economicKind === 'income'
            : ['expense', 'compensation'].includes(ownCategory.economicKind);
        let effectiveCategory = ownCategory;
        // Resolving a compensation is part of its consumption semantics, not
        // an optional consequence of filtering by the original category.
        const hasCompensation = instrumentMode ? event.has('compensates') : economicMatch && ownCategory.economicKind === 'compensation';
        if (instrumentMode && hasCompensation !== (ownCategory.economicKind === 'compensation')) fail('compensation');
        if (hasCompensation) {
            const { node: compensated, ref } = readReference(event, 'compensates', 'event');
            if (instrumentMode && (ref === candidateIdentity.ref || compensated.has('compensates'))) fail('compensation');
            const originalCategory = categoryOf(compensated);
            if (originalCategory.economicKind !== 'expense') fail('compensation');
            effectiveCategory = originalCategory;
        }
        let inScope;
        if (instrumentMode) {
            const field = `${kind}_id`;
            inScope = false;
            if (event.has(field)) {
                const target = readReference(event, field, kind);
                inScope = target.ref === instrument && target.version === instrumentVersion;
            }
        } else inScope = person === undefined ? familyMembers.includes(owner) : owner === person;
        let filterMatch = category === undefined || effectiveCategory.key === category;
        if (mode === 'budget_class' && economicMatch) {
            const actual = effectiveCategory.node.get('budget_class');
            if (!['essential', 'flexible'].includes(actual)) fail('filter');
            filterMatch = actual === budgetClass;
        }
        return state === 'confirmed' && contains(date) && inScope
            && economicMatch && filterMatch;
    });
    return { selected, divisor };
}

function selectConsumption(operands, mode) {
    if (!['total', 'category', 'spent'].includes(mode)) fail('mode');
    return selectEconomicEvents(operands, mode).selected;
}
function evaluateEconomicMetric(operands, mode) {
    const { selected, divisor } = selectEconomicEvents(operands, mode);
    let result = 0;
    for (const event of selected) {
        const amount = money(event.get('amount_minor'));
        result = money(mode === 'income' ? result + amount : result - amount);
    }
    if (mode === 'budget_remaining' || mode === 'safe_pace') {
        result = money(money(operands.budget.get('limit_minor')) - result);
        return mode === 'safe_pace' ? money(Math.floor(result / divisor)) : result;
    }
    return result;
}
function evaluateConsumption(operands, mode) {
    if (!['total', 'category', 'spent'].includes(mode)) fail('mode');
    return evaluateEconomicMetric(operands, mode);
}

// selectConsumption is internal composition for other metric functions, not a
// functional output or a channel for the evaluator to return causal metadata.
module.exports = { evaluateConsumption, selectConsumption, evaluateEconomicMetric, createCategoryReader };
