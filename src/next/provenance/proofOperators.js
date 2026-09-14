'use strict';
const { copyData, field } = require('./observationContract');
const { validateLiteral } = require('./literalTypes');
const { digest } = require('../kernel/canonicalValue');
const { evaluateScalarProof } = require('./scalarProofOperators');
const { unifyOperatorTypes } = require('./operatorTypes');
const fail = () => { throw new Error('proof_material_invalid'); };

// Internal TCB primitive, not an acceptance API. The caller supplies an
// admitted registry projection and live handles, never raw evidence. This
// module has no expected fingerprint input and does not write causal trace.
function readObservedIdentity(handle) {
    const kind = handle.identity('kind');
    const ref_id = handle.identity('ref_id');
    const version = handle.identity('version');
    validateLiteral({ type: 'kind', value: kind });
    validateLiteral({ type: 'id', value: ref_id });
    validateLiteral({ type: 'digest', value: version });
    return { kind, ref_id, version };
}
function observedKeys(handle) {
    const result = [];
    for (const key of handle.keys()) { if (!field(key) || result.includes(key)) fail(); result.push(key); }
    return result;
}
function sequence(handle, item) {
    const length = handle.length();
    if (!Number.isSafeInteger(length) || length < 0 || length > 65536) fail();
    const values = [];
    for (let i = 0; i < length; i++) values.push(item(handle.at(i)));
    return values;
}
function scalar(value, descriptor) {
    let type = descriptor.type;
    if (type === 'ref') type = 'id';
    if (['positive_integer', 'nonnegative_integer'].includes(type)) {
        if (!Number.isSafeInteger(value) || value < (type === 'positive_integer' ? 1 : 0)) fail();
        type = 'integer';
    }
    validateLiteral({ type, value });
    if (descriptor.maximum !== undefined && value > descriptor.maximum) fail();
    if (type === 'enum' && (!Array.isArray(descriptor.values) || !descriptor.values.includes(value))) fail();
    return value;
}
function record(handle, fields) {
    const names = observedKeys(handle);
    if (names.length !== Object.keys(fields).length || names.some(name => !Object.hasOwn(fields, name))) fail();
    return Object.fromEntries(Object.entries(fields).map(([name, type]) => [name, scalar(handle.get(name), { type })]));
}
function period(handle) {
    const kind = handle.get('kind');
    if (['date', 'as_of', 'through', 'statement_due'].includes(kind)) return record(handle, { kind: 'text', value: 'date' });
    if (['month', 'statement_competence', 'budget_cycle'].includes(kind)) return record(handle, { kind: 'text', value: 'month' });
    if (kind === 'range') {
        const value = record(handle, { kind: 'text', start: 'date', end: 'date', start_inclusive: 'boolean', end_inclusive: 'boolean' });
        if (value.start > value.end) fail(); return value;
    }
    if (kind === 'registry_snapshot') return record(handle, { kind: 'text', snapshot_version: 'id' });
    if (kind === 'request_execution') return record(handle, { kind: 'text', turn_id: 'id' });
    fail();
}
function typedResult(handle) {
    const names = observedKeys(handle);
    if (names.sort().join(',') !== 'kind,unit,value') fail();
    const unit = handle.get('unit'); const kind = handle.get('kind'); const raw = handle.get('value');
    let value;
    if (unit === 'BRL_minor' && kind === 'money_minor') value = scalar(raw, { type: 'money_minor' });
    else if (unit === 'count' && kind === 'nonnegative_integer') value = scalar(raw, { type: 'nonnegative_integer' });
    else if (unit === 'entity_ids' && kind === 'id') value = scalar(raw, { type: 'id' });
    else if (unit === 'entity_ids' && kind === 'id_set') {
        value = sequence(raw, item => scalar(item, { type: 'id' }));
        if (new Set(value).size !== value.length) fail();
    } else if (unit === 'state' && kind === 'enum') {
        // The parent receipt/contract establishes its enum domain before this
        // fingerprint primitive is invoked. Here preserve the observed literal.
        validateLiteral({ type: 'enum', value: raw }); value = raw;
    } else fail();
    return { unit, kind, value };
}
function materialValue(value, descriptor) {
    if (descriptor.type === 'ref_list') {
        const result = sequence(value, item => scalar(item, { type: 'id' }));
        if (new Set(result).size !== result.length) fail(); return result;
    }
    if (descriptor.type === 'role_ref_list') {
        const result = sequence(value, item => record(item, { role_id: 'id', parent_ref: 'id' }));
        if (new Set(result.map(item => item.role_id)).size !== result.length) fail(); return result;
    }
    if (descriptor.type === 'typed_period') return period(value);
    if (descriptor.type === 'typed_result') return typedResult(value);
    return scalar(value, descriptor);
}
function measureMaterialFingerprint(handle, rawDescriptor) {
    const descriptor = copyData(rawDescriptor);
    if (!descriptor || Object.keys(descriptor).sort().join(',') !== 'fields,kind,registry_version'
        || !Number.isSafeInteger(descriptor.registry_version) || descriptor.registry_version < 1
        || !descriptor.fields || Array.isArray(descriptor.fields) || typeof descriptor.fields !== 'object') fail();
    const identity = readObservedIdentity(handle);
    if (identity.kind !== descriptor.kind) fail();
    const present = observedKeys(handle);
    for (const name of present) {
        if (!Object.hasOwn(descriptor.fields, name) || descriptor.fields[name].class === 'non_material') fail();
    }
    const pairs = [];
    for (const [name, spec] of Object.entries(descriptor.fields)) {
        if (!field(name) || !spec || !['identity', 'dimension', 'edge', 'non_material'].includes(spec.class)
            || typeof spec.required !== 'boolean') fail();
        if (spec.class === 'non_material') continue;
        const exists = handle.has(name);
        if (exists !== present.includes(name) || spec.required && !exists) fail();
        if (exists) pairs.push([name, materialValue(handle.get(name), spec)]);
    }
    const payload = Object.fromEntries(pairs);
    if (payload.id !== identity.ref_id) fail();
    return `sha256:${digest({ registry_version: descriptor.registry_version, ...identity, payload })}`;
}

function expressionShape(expression, names) {
    if (!expression || Object.keys(expression).sort().join(',') !== [...names].sort().join(',')) throw new Error('proof_expression_shape');
}
function readPath(handle, segments, presence = false) {
    if (!Array.isArray(segments) || !segments.length || segments.some(name => !field(name))) throw new Error('proof_expression_path');
    for (let i = 0; i < segments.length - 1; i++) handle = handle.get(segments[i]);
    return presence ? handle.has(segments.at(-1)) : handle.get(segments.at(-1));
}

// Internal closed-program dispatch. scope is TCB-owned; it is never accepted
// from an evaluator. Expressions are compiler products, not an expression DSL
// supplied by the model. No expected_trace, graph payload or R is an input.
function evaluateObservedOperator(rawOperator, rawOperands, scope) {
    const operator = copyData(rawOperator); const operands = copyData(rawOperands);
    if (!Array.isArray(operands)) throw new Error('proof_expression_operands');
    for (const operand of operands) expressionShape(operand, ['type', 'expression']);
    function resolve(expression, type) {
        let value;
        switch (expression.kind) {
        case 'node_ref':
            expressionShape(expression, ['kind', 'alias']);
            return readObservedIdentity(scope.node(expression.alias));
        case 'edge_ref':
            expressionShape(expression, ['kind', 'id']);
            return readObservedIdentity(scope.edge(expression.id));
        case 'field_ref':
            expressionShape(expression, ['kind', 'alias', 'segments']);
            value = readPath(scope.node(expression.alias), expression.segments); break;
        case 'claim_ref':
            expressionShape(expression, ['kind', 'segments']);
            value = readPath(scope.claim(), expression.segments); break;
        case 'field_presence':
            expressionShape(expression, ['kind', 'field']);
            expressionShape(expression.field, ['kind', 'alias', 'segments']);
            if (expression.field.kind !== 'field_ref') throw new Error('proof_expression_presence');
            return readPath(scope.node(expression.field.alias), expression.field.segments, true);
        case 'literal':
            expressionShape(expression, ['kind', 'value_type', 'value']);
            validateLiteral({ type: expression.value_type, value: expression.value });
            return expression.value;
        case 'period_literal':
            expressionShape(expression, ['kind', 'period']); return expression.period;
        case 'window_ref': case 'window_bound': {
            expressionShape(expression, expression.kind === 'window_ref' ? ['kind', 'name'] : ['kind', 'name', 'bound']);
            const window = copyData(scope.window(expression.name));
            function bound(binding, valueType) {
                if (!['field_ref', 'claim_ref', 'literal'].includes(binding?.kind)) throw new Error('proof_expression_window');
                return resolve(binding, { form: 'scalar', type: valueType });
            }
            let result;
            if (window.kind === 'month') {
                expressionShape(window, ['kind', 'value']); result = { kind: 'month', value: bound(window.value, 'month') };
            } else if (window.kind === 'range') {
                expressionShape(window, ['kind', 'start', 'end', 'start_inclusive', 'end_inclusive']);
                result = { kind: 'range', start: bound(window.start, 'date'), end: bound(window.end, 'date'),
                    start_inclusive: window.start_inclusive, end_inclusive: window.end_inclusive };
            } else throw new Error('proof_expression_window');
            // Validate both bounds, not just the requested one.
            evaluateScalarProof({ id: 'period_eq', args: ['period', 'period'], semantics: 'equal_period_kind_and_fields' },
                [{ type: { form: 'period' }, value: result }, { type: { form: 'period' }, value: result }]);
            if (expression.kind === 'window_ref') return result;
            if (result.kind !== 'range' || !['start', 'end'].includes(expression.bound)) throw new Error('proof_expression_bound');
            return result[expression.bound];
        }
        default: throw new Error('proof_expression_pending');
        }
        if (['period', 'range'].includes(type.form)) return period(value);
        if (['set', 'sequence'].includes(type.form)) return sequence(value, item => item);
        return value;
    }
    if (operator.id === 'fingerprint_is') {
        if (Object.keys(operator).sort().join(',') !== 'args,id,semantics'
            || operator.semantics !== 'measured_material_fingerprint_equal'
            || JSON.stringify(operator.args) !== JSON.stringify(['node:K', 'digest_literal'])) throw new Error('proof_operator_contract');
        unifyOperatorTypes(operator, operands.map(o => o.type));
        if (operands[0].expression.kind !== 'node_ref' || operands[1].expression.kind !== 'literal'
            || operands[1].expression.value_type !== 'digest') throw new Error('proof_expression_fingerprint');
        const node = resolve(operands[0].expression, operands[0].type);
        if (node.kind !== operands[0].type.kind) throw new Error('proof_expression_node_kind');
        const expected = resolve(operands[1].expression, operands[1].type);
        validateLiteral({ type: 'digest', value: expected });
        const alias = operands[0].expression.alias;
        return measureMaterialFingerprint(scope.node(alias), scope.material(alias)) === expected;
    }
    unifyOperatorTypes(operator, operands.map(o => o.type));
    return evaluateScalarProof(operator, operands.map(operand => ({ type: operand.type,
        value: resolve(operand.expression, operand.type) })));
}

module.exports = { readObservedIdentity, measureMaterialFingerprint, evaluateObservedOperator };
