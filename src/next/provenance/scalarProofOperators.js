'use strict';
const { copyData } = require('./observationContract');
const { canonicalValue } = require('../kernel/canonicalValue');
const { unifyOperatorTypes } = require('./operatorTypes');
const { validateLiteral } = require('./literalTypes');
const { parseDate, parseMonth, dayOrdinal, offsetDate, monthBounds, inclusiveDayCount } = require('./civilCalendar');

// Internal execution primitive, NOT a provenance acceptance API. The closed
// program must resolve operands through observed handles before calling this.
// It produces boolean relationships only, never a metric R or causal metadata.
const definitions = Object.freeze({
    eq: ['typed_equal', ['scalar:T', 'scalar:T']],
    not_eq: ['typed_unequal', ['scalar:T', 'scalar:T']],
    field_eq: ['typed_field_equal', ['field_path:T', 'field_path:T']],
    state_is: ['exact_state', ['state_path', 'state_literal']],
    date_in_period: ['contains_civil_date', ['date', 'period']],
    period_eq: ['equal_period_kind_and_fields', ['period', 'period']],
    same_month: ['equal_year_and_month', ['date', 'date']],
    range_contains: ['contains_range_with_boundaries', ['range', 'range']],
    opposite_sign: ['strict_nonzero_opposite_signs', ['number:U', 'number:U']],
    abs_eq: ['absolute_values_equal', ['number:U', 'number:U']],
    sum_eq: ['checked_same_unit_sum_equal', ['sequence:number:U', 'number:U']],
    count_eq: ['sequence_length_equal', ['sequence:T', 'nonnegative_integer']],
    set_eq: ['exact_typed_members', ['set:T', 'set:T']],
    cardinality_eq: ['exact_set_cardinality', ['set:T', 'nonnegative_integer']],
    all_dates_in_period: ['every_date_contained', ['sequence:date', 'period']],
    civil_offset_matches: ['exact_civil_offset_without_clamp', ['date', 'integer', 'civil_unit', 'date', 'calendar']],
    month_bounds_match: ['exact_first_and_last_civil_date_of_month', ['month', 'date', 'date', 'calendar']],
    day_of_month_matches: ['exact_civil_day_of_month', ['date', 'positive_integer', 'calendar']],
    inclusive_day_count_matches: ['inclusive_civil_date_cardinality', ['range', 'positive_integer', 'calendar']]
});
const fail = code => { throw new Error(`scalar_proof_${code}`); };
function keys(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).sort().join(',') !== [...expected].sort().join(',')) fail('shape');
}
function scalarValue(type, value) {
    if (type.form !== 'scalar') fail('value_type');
    const name = type.type;
    if (['integer', 'positive_integer', 'nonnegative_integer', 'money_minor'].includes(name)) {
        if (!Number.isSafeInteger(value) || Object.is(value, -0)
            || name === 'positive_integer' && value < 1 || name === 'nonnegative_integer' && value < 0) fail('number');
        if (name === 'money_minor' && type.unit !== 'BRL_minor') fail('unit');
    } else if (name === 'calendar') { if (value !== 'proleptic_gregorian') fail('calendar'); }
    else if (name === 'civil_unit') { if (!['day', 'month'].includes(value)) fail('civil_unit'); }
    else {
        try { validateLiteral({ type: name, value }); } catch { fail('scalar_value'); }
        if (name === 'enum') {
            let values; try { values = JSON.parse(type.domain); } catch { fail('enum_domain'); }
            if (!Array.isArray(values) || !values.includes(value)) fail('enum_domain');
        }
    }
}
function periodValue(value) {
    if (!value || typeof value.kind !== 'string') fail('period');
    if (['date', 'as_of', 'through', 'statement_due', 'month', 'statement_competence', 'budget_cycle'].includes(value.kind)) {
        keys(value, ['kind', 'value']);
        if (['month', 'statement_competence', 'budget_cycle'].includes(value.kind)) parseMonth(value.value);
        else parseDate(value.value);
    } else if (value.kind === 'range') {
        keys(value, ['kind', 'start', 'end', 'start_inclusive', 'end_inclusive']);
        if (typeof value.start_inclusive !== 'boolean' || typeof value.end_inclusive !== 'boolean'
            || dayOrdinal(value.start) > dayOrdinal(value.end)) fail('range');
    } else if (value.kind === 'registry_snapshot') {
        keys(value, ['kind', 'snapshot_version']); validateLiteral({ type: 'id', value: value.snapshot_version });
    } else if (value.kind === 'request_execution') {
        keys(value, ['kind', 'turn_id']);
        if (typeof value.turn_id !== 'string' || !/^[SMFN]-[0-9]{2}#[1-9][0-9]*$/.test(value.turn_id)) fail('period');
    } else fail('period');
}
function operandValue(operand) {
    keys(operand, ['type', 'value']); const { type, value } = operand;
    if (type.form === 'scalar') scalarValue(type, value);
    else if (type.form === 'field') scalarValue(type.value, value);
    else if (type.form === 'state_literal') { if (typeof value !== 'string' || !value.length) fail('state'); }
    else if (['range', 'period'].includes(type.form)) {
        periodValue(value);
        if (type.form === 'range' && value.kind !== 'range' || type.periodKind !== undefined && type.periodKind !== value.kind) fail('period_type');
    } else if (['sequence', 'set'].includes(type.form)) {
        if (!Array.isArray(value) || type.item?.form !== 'scalar') fail('collection');
        value.forEach(item => scalarValue(type.item, item));
        if (type.form === 'set' && new Set(value.map(item => scalarKey(type.item, item))).size !== value.length) fail('duplicate');
    } else fail('value_type');
}
function scalarKey(type, value) { return type.type === 'datetime' ? instant(value) : value; }
function instant(value) {
    // Exact second and fractional identity, independent of Date precision and
    // machine timezone. Literal validation has already checked the civil date.
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
    if (!m) fail('datetime');
    const offset = m[6] === 'Z' ? 0 : (m[7] === '+' ? 1 : -1) * (Number(m[8]) * 60 + Number(m[9]));
    return `${dayOrdinal(m[1]) * 86400 + Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4]) - offset * 60}:${(m[5] || '').replace(/0+$/, '')}`;
}
function contains(date, period) {
    const ordinal = dayOrdinal(date);
    if (period.kind === 'date' || period.kind === 'statement_due') return date === period.value;
    if (['month', 'statement_competence', 'budget_cycle'].includes(period.kind)) return date.slice(0, 7) === period.value;
    if (period.kind === 'range') {
        const start = dayOrdinal(period.start); const end = dayOrdinal(period.end);
        return (ordinal > start || ordinal === start && period.start_inclusive)
            && (ordinal < end || ordinal === end && period.end_inclusive);
    }
    // Do not silently turn financial lenses as_of/through into date equality
    // or an unbounded range. Their explicit lowering remains an integration task.
    fail('period_containment_pending');
}
function evaluateScalarProof(rawOperator, rawOperands) {
    let operator; let operands;
    try { operator = copyData(rawOperator); operands = copyData(rawOperands); } catch { fail('input'); }
    keys(operator, ['id', 'args', 'semantics']);
    const spec = Object.hasOwn(definitions, operator.id) && definitions[operator.id];
    if (!spec) fail('unsupported');
    if (operator.semantics !== spec[0] || canonicalValue(operator.args) !== canonicalValue(spec[1])) fail('operator_contract');
    if (!Array.isArray(operands)) fail('operands');
    unifyOperatorTypes(operator, operands.map(o => o.type));
    operands.forEach(operandValue);
    const v = operands.map(o => o.value); const [a, b] = v;
    const type = operands[0].type.form === 'field' ? operands[0].type.value : operands[0].type;
    if (['date_in_period', 'all_dates_in_period'].includes(operator.id)
        && !['date', 'statement_due', 'month', 'statement_competence', 'budget_cycle', 'range'].includes(b.kind)) fail('period_containment_pending');
    if (operator.id === 'state_is' && !JSON.parse(type.domain).includes(b)) fail('state_domain');
    switch (operator.id) {
    case 'eq': case 'not_eq': case 'field_eq': case 'state_is': {
        const equal = type.type === 'datetime' ? instant(a) === instant(b) : a === b;
        return operator.id === 'not_eq' ? !equal : equal;
    }
    case 'date_in_period': return contains(a, b);
    case 'period_eq': return Object.keys(a).length === Object.keys(b).length
        && Object.keys(a).every(key => Object.hasOwn(b, key) && a[key] === b[key]);
    case 'same_month': return a.slice(0, 7) === b.slice(0, 7);
    case 'range_contains': return (a.start < b.start || a.start === b.start && (a.start_inclusive || !b.start_inclusive))
        && (a.end > b.end || a.end === b.end && (a.end_inclusive || !b.end_inclusive));
    case 'opposite_sign': return a < 0 && b > 0 || a > 0 && b < 0;
    case 'abs_eq': return Math.abs(a) === Math.abs(b);
    case 'sum_eq': {
        let total = 0;
        for (const item of a) { total += item; if (!Number.isSafeInteger(total) || Object.is(total, -0)) fail('overflow'); }
        return total === b;
    }
    case 'count_eq': case 'cardinality_eq': return a.length === b;
    case 'set_eq': {
        const right = new Set(b.map(value => scalarKey(operands[1].type.item, value)));
        return a.length === b.length && a.every(value => right.has(scalarKey(type.item, value)));
    }
    case 'all_dates_in_period': {
        // Do not short-circuit validation of later dates: every value was
        // validated above, and the instrumented resolver must observe all reads.
        let result = true; for (const value of a) if (!contains(value, b)) result = false; return result;
    }
    case 'civil_offset_matches': return offsetDate(a, b, v[2]) === v[3];
    case 'month_bounds_match': { const bounds = monthBounds(a); return bounds.start === b && bounds.end === v[2]; }
    case 'day_of_month_matches': return parseDate(a).day === b;
    case 'inclusive_day_count_matches': return inclusiveDayCount(a) === b;
    default: fail('unsupported');
    }
}

module.exports = { evaluateScalarProof };
