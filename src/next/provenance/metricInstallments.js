'use strict';
const { parseDate } = require('./civilCalendar');
const { validateLiteral } = require('./literalTypes');
const { readNodeIdentity: identity, createUniqueNodeReader, readReference, readReferenceId, readReferenceIds } = require('./metricReferences');
const fail = code => { throw new Error(`installment_metric_${code}`); };
const id = value => { validateLiteral({ type: 'id', value }); return value; };
const integer = value => {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail('integer');
    return value;
};
function readPlan(node) {
    const plan = identity(node, 'installment_plan');
    const total = integer(node.get('installment_total')); if (total < 1) fail('total');
    const members = readReferenceIds(node, 'members');
    if (members.size > total) fail('total');
    return { ...plan, total, members, examined: new Set(), numbers: new Set(), ordered: [], dimensions: null };
}

// Functional metric behavior over observed handles. No schedule synthesis,
// graph predicates, oracle, expected selection or trace output.
function evaluateInstallments(operands, metric) {
    const realized = ['installments_realized', 'installments_realized_amount'].includes(metric);
    const familyMode = metric === 'projected_installments';
    const projected = familyMode || ['installments_projected', 'installments_projected_amount'].includes(metric);
    if (!realized && !projected) fail('metric');
    const context = operands.context;
    if (context.get('time_basis') !== 'installment_competence') fail('basis');
    const subject = context.get('subject'); const plans = new Map(); let familyMembers;
    if (familyMode) {
        const family = identity(operands.family, 'family');
        if (subject.get('kind') !== 'family' || id(subject.get('ref_id')) !== family.ref) fail('scope');
        familyMembers = readReferenceIds(operands.family, 'members');
        for (const node of operands.plans) {
            const plan = readPlan(node); if (plans.has(plan.ref)) fail('duplicate_plan'); plans.set(plan.ref, plan);
        }
    } else {
        const plan = readPlan(operands.plan); plans.set(plan.ref, plan);
        if (subject.get('kind') !== 'installment_plan' || id(subject.get('ref_id')) !== plan.ref) fail('scope');
    }
    const period = context.get('period'); let contains;
    if (realized) {
        if (period.get('kind') !== 'through') fail('period');
        const end = period.get('value'); parseDate(end); contains = date => date <= end;
    } else {
        if (period.get('kind') !== 'range' || period.get('start_inclusive') !== true || period.get('end_inclusive') !== true) fail('period');
        const start = period.get('start'); const end = period.get('end'); parseDate(start); parseDate(end);
        if (start > end) fail('period'); contains = date => date >= start && date <= end;
    }
    const candidates = createUniqueNodeReader('event');
    const selected = operands.events.select(event => {
        const eventIdentity = candidates.read(event);
        if (!event.has('installment_plan')) return false;
        const linked = readReference(event, 'installment_plan', 'installment_plan');
        const plan = plans.get(linked.ref);
        if (!plan) { if (familyMode) fail('unknown_plan'); return false; }
        const { total, members, examined, numbers, ordered } = plan;
        if (linked.version !== plan.version || !members.includes(eventIdentity.ref) || examined.has(eventIdentity.ref)) fail('members');
        examined.add(eventIdentity.ref);
        const number = integer(event.get('installment_number'));
        if (number < 1 || number > total || numbers.has(number) || integer(event.get('installment_total')) !== total) fail('number');
        numbers.add(number);
        const date = event.get('date'); parseDate(date); ordered.push({ number, date });
        const state = event.get('state'); if (!['confirmed', 'projected'].includes(state)) fail('state');
        const current = [readReferenceId(event, 'person_id'), readReferenceId(event, 'category_id'),
            event.has('card_id') ? id(event.get('card_id')) : null,
            event.has('account_id') ? id(event.get('account_id')) : null];
        if (plan.dimensions && plan.dimensions.some((value, i) => value !== current[i])) fail('dimensions');
        plan.dimensions = current;
        const inScope = !familyMode || familyMembers.includes(current[0]);
        return state === (realized ? 'confirmed' : 'projected') && contains(date) && inScope;
    });
    for (const { examined, members, ordered } of plans.values()) {
        if (examined.size !== members.size) fail('members');
        ordered.sort((a, b) => a.number - b.number);
        for (let i = 1; i < ordered.length; i++) if (ordered[i - 1].date >= ordered[i].date) fail('date_order');
    }
    if (!familyMode && !metric.endsWith('_amount')) return selected.length();
    let result = 0;
    for (const event of selected) result = integer(result - integer(event.get('amount_minor')));
    return result;
}
module.exports = { evaluateInstallments };
