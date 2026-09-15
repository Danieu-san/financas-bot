'use strict';
const { parseDate } = require('./civilCalendar');
const { validateLiteral } = require('./literalTypes');
const fail = code => { throw new Error(`installment_metric_${code}`); };
const id = value => { validateLiteral({ type: 'id', value }); return value; };
const integer = value => {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail('integer');
    return value;
};
function identity(node, kind) {
    if (node.identity('kind') !== kind) fail('identity');
    const ref = id(node.get('id')); const version = node.identity('version');
    validateLiteral({ type: 'digest', value: version }); return { ref, version };
}

// Functional metric behavior over observed handles. No schedule synthesis,
// graph predicates, oracle, expected selection or trace output.
function evaluateInstallments(operands, metric) {
    const realized = ['installments_realized', 'installments_realized_amount'].includes(metric);
    const projected = ['installments_projected', 'installments_projected_amount'].includes(metric);
    if (!realized && !projected) fail('metric');
    const context = operands.context;
    if (context.get('time_basis') !== 'installment_competence') fail('basis');
    const subject = context.get('subject'); const plan = identity(operands.plan, 'installment_plan');
    if (subject.get('kind') !== 'installment_plan' || id(subject.get('ref_id')) !== plan.ref) fail('scope');
    const period = context.get('period'); let contains;
    if (realized) {
        if (period.get('kind') !== 'through') fail('period');
        const end = period.get('value'); parseDate(end); contains = date => date <= end;
    } else {
        if (period.get('kind') !== 'range' || period.get('start_inclusive') !== true || period.get('end_inclusive') !== true) fail('period');
        const start = period.get('start'); const end = period.get('end'); parseDate(start); parseDate(end);
        if (start > end) fail('period'); contains = date => date >= start && date <= end;
    }
    const total = integer(operands.plan.get('installment_total')); if (total < 1) fail('total');
    const members = new Set();
    for (const member of operands.plan.get('members')) {
        const ref = id(member); if (members.has(ref)) fail('members'); members.add(ref);
    }
    if (members.size > total) fail('total');
    const examined = new Set(); const numbers = new Set(); const ordered = [];
    let dimensions;
    const selected = operands.events.select(event => {
        const eventIdentity = identity(event, 'event');
        if (!event.has('installment_plan')) return false;
        const linked = identity(event.follow('installment_plan'), 'installment_plan');
        if (linked.ref !== plan.ref) return false;
        if (linked.version !== plan.version || !members.has(eventIdentity.ref) || examined.has(eventIdentity.ref)) fail('members');
        examined.add(eventIdentity.ref);
        const number = integer(event.get('installment_number'));
        if (number < 1 || number > total || numbers.has(number) || integer(event.get('installment_total')) !== total) fail('number');
        numbers.add(number);
        const date = event.get('date'); parseDate(date); ordered.push({ number, date });
        const state = event.get('state'); if (!['confirmed', 'projected'].includes(state)) fail('state');
        const current = [id(event.get('person_id')), id(event.get('category_id')),
            event.has('card_id') ? id(event.get('card_id')) : null,
            event.has('account_id') ? id(event.get('account_id')) : null];
        if (dimensions && dimensions.some((value, i) => value !== current[i])) fail('dimensions');
        dimensions = current;
        return state === (realized ? 'confirmed' : 'projected') && contains(date);
    });
    if (examined.size !== members.size) fail('members');
    ordered.sort((a, b) => a.number - b.number);
    for (let i = 1; i < ordered.length; i++) if (ordered[i - 1].date >= ordered[i].date) fail('date_order');
    if (!metric.endsWith('_amount')) return selected.length();
    let result = 0;
    for (const event of selected) result = integer(result - integer(event.get('amount_minor')));
    return result;
}
module.exports = { evaluateInstallments };
