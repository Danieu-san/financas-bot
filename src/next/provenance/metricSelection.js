'use strict';

const { parseDate, parseMonth } = require('./civilCalendar');
const { validateLiteral } = require('./literalTypes');
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
        index.set(key, node.identity('version'));
    }
    return {
        has: key => index.has(key),
        read(event) {
            const node = event.follow('category_id'); const key = id(node.get('id'));
            if (node.identity('kind') !== 'category' || !index.has(key)
                || index.get(key) !== node.identity('version')) fail('category');
            const economicKind = node.get('kind');
            if (!['expense', 'compensation', 'income', 'neutral'].includes(economicKind)) fail('category');
            return { key, economicKind, node };
        }
    };
}

// Internal metric behavior, not a proof validator or a public execution host.
// Only handles supplied through admitted registry roles are used. No graph,
// selected roster, fact key, oracle or expected result is an input.
function selectEconomicEvents(operands, mode) {
    if (!['total', 'category', 'spent', 'income', 'instrument', 'budget_class', 'budget_remaining'].includes(mode)) fail('mode');
    const context = operands.context;
    const basis = context.get('time_basis');
    if (!(mode === 'budget_remaining' ? basis === 'budget_cycle' : mode === 'spent' ? ['event_date', 'budget_cycle'].includes(basis) : basis === 'event_date')
        || context.get('evidence_state') !== 'confirmed') fail('context');
    const period = context.get('period');
    if (period.get('kind') !== 'month') fail('period');
    const month = period.get('value'); parseMonth(month);
    const subject = context.get('subject'); const kind = subject.get('kind');
    const familyId = mode === 'instrument' ? undefined : id(operands.family.get('id'));
    const familyMembers = mode === 'instrument' ? undefined : operands.family.get('members');
    let person; let category; let expectedFamily; let instrument; let instrumentVersion; let budgetClass;
    if (mode === 'budget_remaining') {
        if (operands.budget.identity('kind') !== 'budget') fail('budget');
        const budgetId = id(operands.budget.get('id'));
        if (kind === 'budget') { if (id(subject.get('ref_id')) !== budgetId) fail('scope'); }
        else if (kind === 'budget_person') {
            if (id(subject.get('budget_id')) !== budgetId) fail('scope');
            person = id(subject.get('person_id')); if (!familyMembers.includes(person)) fail('scope');
        } else fail('scope');
        expectedFamily = id(operands.budget.get('family_id')); category = id(operands.budget.get('category_id'));
        if (operands.budget.get('period') !== month || operands.budget.get('evidence_state') !== 'confirmed') fail('budget');
    } else if (mode === 'instrument') {
        if (!['account', 'card'].includes(kind) || operands.instrument.identity('kind') !== kind) fail('scope');
        instrument = id(operands.instrument.get('id')); instrumentVersion = operands.instrument.identity('version');
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
    return operands.events.select(event => {
        if (event.identity('kind') !== 'event') fail('event');
        const state = event.get('state');
        if (!['confirmed', 'projected'].includes(state)) fail('state');
        const date = event.get('date'); parseDate(date);
        const owner = id(event.get('person_id'));
        const ownCategory = categoryOf(event);
        let effectiveCategory = ownCategory;
        if (['category', 'spent', 'budget_class', 'budget_remaining'].includes(mode) && ownCategory.economicKind === 'compensation') {
            const compensated = event.follow('compensates');
            if (compensated.identity('kind') !== 'event') fail('compensation');
            const originalCategory = categoryOf(compensated);
            if (originalCategory.economicKind !== 'expense') fail('compensation');
            effectiveCategory = originalCategory;
        }
        let inScope;
        if (mode === 'instrument') {
            const field = `${kind}_id`;
            inScope = false;
            if (event.has(field)) {
                const target = event.follow(field);
                if (target.identity('kind') !== kind) fail('scope');
                inScope = id(target.get('id')) === instrument && target.identity('version') === instrumentVersion;
            }
        } else inScope = person === undefined ? familyMembers.includes(owner) : owner === person;
        const economicMatch = mode === 'income' ? ownCategory.economicKind === 'income'
            : ['expense', 'compensation'].includes(ownCategory.economicKind);
        let filterMatch = category === undefined || effectiveCategory.key === category;
        if (mode === 'budget_class' && economicMatch) {
            const actual = effectiveCategory.node.get('budget_class');
            if (!['essential', 'flexible'].includes(actual)) fail('filter');
            filterMatch = actual === budgetClass;
        }
        return state === 'confirmed' && date.slice(0, 7) === month && inScope
            && economicMatch && filterMatch;
    });
}

function selectConsumption(operands, mode) {
    if (!['total', 'category', 'spent'].includes(mode)) fail('mode');
    return selectEconomicEvents(operands, mode);
}
function evaluateEconomicMetric(operands, mode) {
    const selected = selectEconomicEvents(operands, mode);
    let result = 0;
    for (const event of selected) {
        const amount = money(event.get('amount_minor'));
        result = money(mode === 'income' ? result + amount : result - amount);
    }
    return mode === 'budget_remaining' ? money(money(operands.budget.get('limit_minor')) - result) : result;
}
function evaluateConsumption(operands, mode) {
    if (!['total', 'category', 'spent'].includes(mode)) fail('mode');
    return evaluateEconomicMetric(operands, mode);
}

// selectConsumption is internal composition for other metric functions, not a
// functional output or a channel for the evaluator to return causal metadata.
module.exports = { evaluateConsumption, selectConsumption, evaluateEconomicMetric, createCategoryReader };
