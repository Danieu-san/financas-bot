'use strict';

const { parseDate, parseMonth } = require('./civilCalendar');
const { validateLiteral } = require('./literalTypes');
const fail = code => { throw new Error(`metric_selection_${code}`); };
const id = value => { validateLiteral({ type: 'id', value }); return value; };
const money = value => {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail('money');
    return value;
};

// Internal metric behavior, not a proof validator or a public execution host.
// Only handles supplied through admitted registry roles are used. No graph,
// selected roster, fact key, oracle or expected result is an input.
function evaluateConsumption(operands, mode) {
    if (!['total', 'category', 'spent'].includes(mode)) fail('mode');
    const context = operands.context;
    const basis = context.get('time_basis');
    if (!(mode === 'spent' ? ['event_date', 'budget_cycle'].includes(basis) : basis === 'event_date')
        || context.get('evidence_state') !== 'confirmed') fail('context');
    const period = context.get('period');
    if (period.get('kind') !== 'month') fail('period');
    const month = period.get('value'); parseMonth(month);
    const subject = context.get('subject'); const kind = subject.get('kind');
    const familyId = id(operands.family.get('id'));
    const familyMembers = operands.family.get('members');
    let person; let category; let expectedFamily;
    if (mode === 'total') {
        if (kind === 'person') person = id(subject.get('ref_id'));
        else if (kind === 'family') expectedFamily = id(subject.get('ref_id'));
        else fail('scope');
    } else {
        if (kind === 'person_category') { person = id(subject.get('person_id')); category = id(subject.get('category_id')); }
        else if (kind === 'family_category') { expectedFamily = id(subject.get('family_id')); category = id(subject.get('category_id')); }
        else if (kind === 'category') { expectedFamily = familyId; category = id(subject.get('ref_id')); }
        else fail('scope');
    }
    if (expectedFamily !== undefined && familyId !== expectedFamily) fail('scope');

    // Category population is an explicit role, not an incidental global map.
    // A followed category must also belong to this admitted operand population.
    const categoryIndex = new Map();
    for (const node of operands.categories) {
        const key = id(node.get('id'));
        if (node.identity('kind') !== 'category' || categoryIndex.has(key)) fail('category');
        categoryIndex.set(key, node.identity('version'));
    }
    if (category !== undefined && !categoryIndex.has(category)) fail('category');
    function categoryOf(event) {
        const node = event.follow('category_id'); const key = id(node.get('id'));
        if (node.identity('kind') !== 'category' || !categoryIndex.has(key)
            || categoryIndex.get(key) !== node.identity('version')) fail('category');
        const economicKind = node.get('kind');
        if (!['expense', 'compensation', 'income', 'neutral'].includes(economicKind)) fail('category');
        return { key, economicKind };
    }
    const selected = operands.events.select(event => {
        if (event.identity('kind') !== 'event') fail('event');
        const state = event.get('state');
        if (!['confirmed', 'projected'].includes(state)) fail('state');
        const date = event.get('date'); parseDate(date);
        const owner = id(event.get('person_id'));
        const ownCategory = categoryOf(event);
        let effectiveCategory = ownCategory.key;
        if (mode !== 'total' && ownCategory.economicKind === 'compensation') {
            const compensated = event.follow('compensates');
            if (compensated.identity('kind') !== 'event') fail('compensation');
            const originalCategory = categoryOf(compensated);
            if (originalCategory.economicKind !== 'expense') fail('compensation');
            effectiveCategory = originalCategory.key;
        }
        const inScope = person === undefined ? familyMembers.includes(owner) : owner === person;
        return state === 'confirmed' && date.slice(0, 7) === month && inScope
            && ['expense', 'compensation'].includes(ownCategory.economicKind)
            && (mode === 'total' || effectiveCategory === category);
    });
    let result = 0;
    for (const event of selected) result = money(result - money(event.get('amount_minor')));
    return result;
}

module.exports = { evaluateConsumption };
