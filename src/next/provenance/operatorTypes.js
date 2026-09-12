'use strict';

// Internal compiler descriptors, never caller-provided evidence. This pass
// checks signature compatibility only; it does not resolve a path or evaluate
// a predicate, and must not be used as an acceptance decision on its own.
const SCALARS = new Set(['id', 'text', 'date', 'month', 'datetime', 'integer',
    'positive_integer', 'nonnegative_integer', 'money_minor', 'boolean', 'enum',
    'digest', 'timezone', 'calendar', 'civil_unit']);
const NUMBERS = new Set(['integer', 'positive_integer', 'nonnegative_integer', 'money_minor']);
const fail = code => { throw new Error(`operator_types_${code}`); };
function form(value, expected) {
    if (!value || value.form !== expected) fail('shape');
    return value;
}
function nominal(value) {
    if (typeof value !== 'string' || !value.length) fail('nominal_missing');
    return value;
}
function scalar(value) {
    form(value, 'scalar');
    if (!SCALARS.has(value.type)) fail('type');
    return value;
}
function identity(value) {
    if (value?.form === 'node') return JSON.stringify(['node', nominal(value.kind)]);
    scalar(value);
    if (value.type === 'id') return JSON.stringify(['id', nominal(value.kind)]);
    if (value.type === 'enum') return JSON.stringify(['enum', nominal(value.domain)]);
    if (value.type === 'money_minor') return JSON.stringify(['money_minor', nominal(value.unit)]);
    // Positive/nonnegative are validated range refinements of the same
    // dimensionless integer domain, not different units or identity kinds.
    if (NUMBERS.has(value.type)) return JSON.stringify(['scalar', 'integer']);
    return JSON.stringify(['scalar', value.type]);
}

function unifyOperatorTypes(operator, args) {
    if (!Array.isArray(operator?.args) || !Array.isArray(args) || operator.args.length !== args.length) fail('arity');
    const bindings = new Map();
    function bind(variable, value) {
        nominal(value);
        if (bindings.has(variable) && bindings.get(variable) !== value) fail('nominal_mismatch');
        bindings.set(variable, value);
    }
    function kind(variable, value) {
        if (!['K', 'A', 'B', 'J'].includes(variable)) fail('signature_unknown');
        bind(`kind:${variable}`, nominal(value));
    }
    function match(signature, value) {
        if (typeof signature !== 'string') fail('signature_unknown');
        if (signature.startsWith('set:') || signature.startsWith('sequence:')) {
            const colon = signature.indexOf(':');
            form(value, signature.slice(0, colon));
            match(signature.slice(colon + 1), value.item);
            return;
        }
        if (signature === 'T') { bind('type:T', identity(value)); return; }
        if (signature === 'scalar:T') {
            scalar(value);
            bind('type:T', identity(value));
            return;
        }
        if (signature === 'number:U') {
            scalar(value);
            if (!NUMBERS.has(value.type)) fail('type');
            const unit = value.type === 'money_minor' ? nominal(value.unit) : 'dimensionless_integer';
            bind('unit:U', unit);
            return;
        }
        if (/^node:[KABJ]$/.test(signature)) {
            kind(signature.slice(5), form(value, 'node').kind);
            return;
        }
        if (signature === 'field_path:T') {
            bind('type:T', identity(scalar(form(value, 'field').value)));
            return;
        }
        if (/^field_selector:[KABJ]:(T|date|enum)$/.test(signature)) {
            form(value, 'field_selector');
            const [, source, type] = signature.split(':');
            kind(source, value.kind);
            if (type === 'T') bind('type:T', identity(scalar(value.value)));
            else match(type, value.value);
            return;
        }
        if (/^edge_selector:[KABJ]:[KABJ]$/.test(signature)) {
            form(value, 'edge_selector');
            const [, source, target] = signature.split(':');
            kind(source, value.kind);
            kind(target, value.target);
            return;
        }
        if (signature === 'edge_ref:K') { kind('K', form(value, 'edge').target); return; }
        if (signature === 'sort_key_descriptor:K') { kind('K', form(value, 'sort').kind); return; }
        if (signature === 'predicate_template_ref') {
            kind('K', form(value, signature).kind);
            return;
        }
        if (['partial_coverage_policy_ref', 'kind_literal', 'digest_literal', 'state_literal'].includes(signature)) {
            form(value, signature);
            return;
        }
        if (signature === 'state_path') {
            if (scalar(form(value, 'field').value).type !== 'enum') fail('type');
            return;
        }
        if (signature === 'period') {
            if (!['period', 'range'].includes(value?.form)) fail('shape');
            return;
        }
        if (signature === 'range') { form(value, 'range'); return; }
        if (SCALARS.has(signature)) {
            if (scalar(value).type !== signature) fail('type');
            return;
        }
        fail('signature_unknown');
    }
    operator.args.forEach((signature, index) => match(signature, args[index]));
    if (['contains_civil_date', 'every_date_contained'].includes(operator.semantics)) {
        const kind = args[1]?.periodKind;
        if (kind !== undefined && !['date', 'as_of', 'through', 'statement_due',
            'month', 'statement_competence', 'budget_cycle', 'range'].includes(kind)) fail('non_civil_period');
    }
    return Object.freeze({ stage: 'signature_checked_only', bindings: Object.freeze(Object.fromEntries(bindings)) });
}

module.exports = { unifyOperatorTypes };
