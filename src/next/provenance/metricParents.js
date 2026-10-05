'use strict';

const { parseMonth } = require('./civilCalendar');
const { validateLiteral } = require('./literalTypes');
const fail = code => { throw new Error(`parent_metric_${code}`); };
const id = value => { validateLiteral({ type: 'id', value }); return value; };
const money = value => {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail('money');
    return value;
};

// A parent handle is supplied only after the host has resolved its private
// same-execution receipt. These reads measure the material identity used by
// the formula; they do not themselves certify a parent or issue a receipt.
function parentValue(handle) {
    id(handle.get('fact_key'));
    const version = handle.get('evaluator_version');
    if (!Number.isSafeInteger(version) || version < 1) fail('parent_version');
    const hash = handle.get('result_hash');
    if (typeof hash !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(hash)) fail('parent_hash');
    return money(handle.get('result').get('value'));
}

function contextFor(operands, metric) {
    const context = operands.context;
    const basis = context.get('time_basis');
    if (basis !== (metric === 'income_minus_open_bills' ? 'mixed_declared' : 'event_date')) fail('basis');
    const period = context.get('period');
    if (period.get('kind') !== 'month') fail('period');
    parseMonth(period.get('value'));
    const subject = context.get('subject');
    const kind = subject.get('kind');
    if (metric === 'consumption_difference') {
        if (kind !== 'person_comparison') fail('subject');
        // The admitted graph/proof owns the exact list and parent↔person
        // association. Here we observe the declared container, never infer
        // that association from parent values or a model-provided label.
        subject.get('person_ids');
    } else {
        if (kind !== 'family') fail('subject');
        id(subject.get('ref_id'));
    }
}

// Functional kernel only. The host still has to prove each parent receipt,
// the ranking roster's correspondence to those parents, trace/proof and R.
function evaluateParentMetric(operands, metric) {
    if (!['consumption_difference', 'income_minus_open_bills', 'ranking_winner'].includes(metric)) fail('metric');
    contextFor(operands, metric);
    const left = parentValue(operands.left);
    const right = parentValue(operands.right);
    if (metric !== 'ranking_winner') return money(left - right);
    const key = operands.sort_key.get('ranking_key');
    const direction = operands.sort_direction.get('ranking_direction');
    const tie = operands.sort_key.get('ranking_tie_break');
    if (key !== 'validated_consumption_minor' || !['asc', 'desc'].includes(direction)
        || tie !== 'lexical_internal_id') fail('ranking_policy');
    const people = operands.people;
    if (people.length() !== 2) fail('ranking_population');
    const leftId = id(people.at(0).get('id'));
    const rightId = id(people.at(1).get('id'));
    if (leftId === rightId) fail('ranking_population');
    if (left === right) return leftId < rightId ? leftId : rightId;
    return (direction === 'desc' ? left > right : left < right) ? leftId : rightId;
}

module.exports = { evaluateParentMetric };
