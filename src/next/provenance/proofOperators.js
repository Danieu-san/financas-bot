'use strict';
const { copyData, field } = require('./observationContract');
const { validateLiteral } = require('./literalTypes');
const { digest } = require('../kernel/canonicalValue');
const { evaluateScalarProof, compareTypedScalars } = require('./scalarProofOperators');
const { unifyOperatorTypes } = require('./operatorTypes');
const { civilDateInPinnedTimezone } = require('./pinnedCivilTimezone');
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
    const special = {
        all_match: ['all_members_satisfy_expanded_conjunction', ['set:node:K', 'predicate_template_ref']],
        none_match: ['no_member_satisfies_expanded_conjunction', ['set:node:K', 'predicate_template_ref']],
        same_field: ['one_distinct_field_value', ['set:node:K', 'field_selector:K:T']],
        join_eq: ['equal_unique_key_domains_and_pairwise_join', ['set:node:A', 'set:node:B', 'field_selector:A:T', 'field_selector:B:T']],
        ordered_by: ['lexicographic_order_with_explicit_ties', ['sequence:node:K', 'sort_key_descriptor:K']],
        edge_pair_complete: ['two_distinct_nodes_share_exact_identity', ['set:node:K', 'edge_selector:K:J', 'node:J']]
    };
    function members(operand) {
        expressionShape(operand.expression, ['kind', 'name']);
        if (operand.expression.kind !== 'set_ref' || !['set', 'sequence'].includes(operand.type.form) || operand.type.item?.form !== 'node') throw new Error('proof_expression_set');
        const seen = new Set();
        return sequence(scope.set(operand.expression.name), member => {
            const id = readObservedIdentity(member); const key = JSON.stringify([id.kind, id.ref_id, id.version]);
            if (id.kind !== operand.type.item.kind || operand.type.form === 'set' && seen.has(key)) throw new Error('proof_expression_member');
            seen.add(key); return member;
        });
    }
    function fieldType(kind, segments) {
        const descriptor = scope.fieldDescriptor(kind, segments);
        if (['ref', 'id'].includes(descriptor.type)) {
            const nominal = descriptor.type === 'id' ? (segments[0] === 'id' ? kind : `${kind}.${segments[0]}`)
                : descriptor.targets?.length === 1 ? descriptor.targets[0] : null;
            if (!nominal) throw new Error('proof_expression_nominal');
            return { form: 'scalar', type: 'id', kind: nominal };
        }
        if (descriptor.type === 'enum') return { form: 'scalar', type: 'enum', domain: JSON.stringify([...descriptor.values].sort()) };
        if (descriptor.type === 'money_minor') return { form: 'scalar', type: 'money_minor', unit: 'BRL_minor' };
        if (['ref_list', 'role_ref_list', 'typed_period', 'typed_result'].includes(descriptor.type)) throw new Error('proof_expression_scalar');
        return { form: 'scalar', type: descriptor.type };
    }
    function selector(operand, kind) {
        const expression = operand.expression;
        expressionShape(expression, ['kind', 'node_kind', 'segments']);
        if (expression.kind !== 'field_selector' || expression.node_kind !== kind) throw new Error('proof_expression_selector');
        const type = fieldType(kind, expression.segments);
        if (operand.type.value) unifyOperatorTypes({ args: ['scalar:T', 'scalar:T'] }, [type, operand.type.value]);
        return { type, segments: expression.segments };
    }
    function values(nodes, selected) {
        return nodes.map(member => {
            const value = readPath(member, selected.segments);
            compareTypedScalars(selected.type, value, value); return value;
        });
    }
    function resolve(expression, type) {
        let value;
        switch (expression.kind) {
        case 'node_ref':
            expressionShape(expression, ['kind', 'alias']);
            return readObservedIdentity(scope.node(expression.alias));
        case 'edge_ref':
            expressionShape(expression, ['kind', 'id']);
            return readObservedIdentity(scope.edge(expression.id));
        case 'set_ref':
            expressionShape(expression, ['kind', 'name']);
            return sequence(scope.set(expression.name), member => readObservedIdentity(member));
        case 'reference_set': {
            expressionShape(expression, ['kind', 'field']);
            expressionShape(expression.field, ['kind', 'alias', 'segments']);
            const source = expression.field;
            if (source.kind !== 'field_ref' || source.segments.length !== 1) throw new Error('proof_expression_reference');
            const refs = sequence(readPath(scope.node(source.alias), source.segments), ref => {
                validateLiteral({ type: 'id', value: ref }); return ref;
            });
            return refs.map(ref => {
                const identity = readObservedIdentity(scope.resolveReference(source.alias, source.segments[0], ref));
                if (identity.ref_id !== ref) throw new Error('proof_expression_reference');
                return identity;
            });
        }
        case 'projection': {
            expressionShape(expression, ['kind', 'set', 'selector', 'as']);
            expressionShape(expression.set, ['kind', 'name']);
            expressionShape(expression.selector, ['kind', 'node_kind', 'segments']);
            if (expression.set.kind !== 'set_ref' || expression.selector.kind !== 'field_selector'
                || !['set', 'sequence'].includes(expression.as) || type.form !== expression.as) throw new Error('proof_expression_projection');
            return sequence(scope.set(expression.set.name), member => {
                if (readObservedIdentity(member).kind !== expression.selector.node_kind) throw new Error('proof_expression_projection_kind');
                return readPath(member, expression.selector.segments);
            });
        }
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
    if (operator.id === 'civil_date_matches') {
        if (Object.keys(operator).sort().join(',') !== 'args,id,semantics'
            || operator.semantics !== 'instant_local_civil_date_equal'
            || JSON.stringify(operator.args) !== JSON.stringify(['datetime', 'date', 'timezone', 'calendar'])) throw new Error('proof_operator_contract');
        const [instant, date, timezone, calendar] = operands.map(o => resolve(o.expression, o.type));
        validateLiteral({ type: 'date', value: date });
        return civilDateInPinnedTimezone(instant, timezone, calendar) === date;
    }
    if (Object.hasOwn(special, operator.id)) {
        const spec = special[operator.id];
        if (Object.keys(operator).sort().join(',') !== 'args,id,semantics'
            || operator.semantics !== spec[0] || JSON.stringify(operator.args) !== JSON.stringify(spec[1])) throw new Error('proof_operator_contract');
        const nodes = members(operands[0]);
        if (operator.id === 'same_field') {
            const selected = selector(operands[1], operands[0].type.item.kind);
            const read = values(nodes, selected);
            return read.length > 0 && read.every(value => compareTypedScalars(selected.type, value, read[0]) === 0);
        }
        if (operator.id === 'join_eq') {
            const rightNodes = members(operands[1]);
            const leftSelector = selector(operands[2], operands[0].type.item.kind);
            const rightSelector = selector(operands[3], operands[1].type.item.kind);
            unifyOperatorTypes({ args: ['scalar:T', 'scalar:T'] }, [leftSelector.type, rightSelector.type]);
            const left = values(nodes, leftSelector); const right = values(rightNodes, rightSelector);
            for (const side of [left, right]) for (let i = 0; i < side.length; i++) for (let j = 0; j < i; j++) {
                if (compareTypedScalars(leftSelector.type, side[i], side[j]) === 0) throw new Error('proof_expression_join_duplicate');
            }
            return left.length === right.length && left.every(value => right.some(other => compareTypedScalars(leftSelector.type, value, other) === 0));
        }
        if (operator.id === 'ordered_by') {
            const order = operands[1].expression;
            expressionShape(order, ['kind', 'keys', 'tie_break']);
            if (order.kind !== 'sort' || order.tie_break !== 'kind_ref_version' || !Array.isArray(order.keys) || !order.keys.length) throw new Error('proof_expression_sort');
            const keys = order.keys.map(key => {
                expressionShape(key, ['selector', 'direction']);
                if (!['asc', 'desc'].includes(key.direction)) throw new Error('proof_expression_sort');
                return { ...selector({ expression: key.selector, type: {} }, operands[0].type.item.kind), direction: key.direction };
            });
            const rows = nodes.map(member => ({ identity: readObservedIdentity(member),
                values: keys.map(key => values([member], key)[0]) }));
            let ordered = true;
            for (let i = 1; i < rows.length; i++) {
                let comparison = 0;
                for (let k = 0; k < keys.length && comparison === 0; k++) comparison = compareTypedScalars(keys[k].type,
                    rows[i - 1].values[k], rows[i].values[k]) * (keys[k].direction === 'asc' ? 1 : -1);
                for (const key of ['kind', 'ref_id', 'version']) {
                    if (comparison) break;
                    const a = rows[i - 1].identity[key]; const b = rows[i].identity[key];
                    comparison = a === b ? 0 : a < b ? -1 : 1;
                }
                if (comparison === 0) throw new Error('proof_expression_sort_unresolved_tie');
                if (comparison > 0) ordered = false;
            }
            return ordered;
        }
        if (operator.id === 'edge_pair_complete') {
            const selector = operands[1].expression;
            expressionShape(selector, ['kind', 'node_kind', 'segments']);
            if (selector.kind !== 'field_selector' || selector.segments.length !== 1
                || selector.node_kind !== operands[0].type.item.kind) throw new Error('proof_expression_edge_selector');
            const expected = resolve(operands[2].expression, operands[2].type);
            evaluateScalarProof({ id: 'same_identity', args: ['node:K', 'node:K'], semantics: 'same_kind_ref_version' },
                [{ type: operands[2].type, value: expected }, { type: operands[2].type, value: expected }]);
            let equal = true;
            for (const member of nodes) {
                const target = readObservedIdentity(scope.memberEdge(member, selector.segments[0]));
                const result = evaluateScalarProof({ id: 'same_identity', args: ['node:K', 'node:K'], semantics: 'same_kind_ref_version' },
                    [{ type: operands[2].type, value: target }, { type: operands[2].type, value: expected }]);
                if (!result) equal = false;
            }
            return nodes.length === 2 && equal;
        }
        const template = operands[1].expression;
        expressionShape(template, ['kind', 'template_ref', 'combinator', 'member_slot', 'bindings', 'body']);
        if (template.kind !== 'predicate_template' || template.combinator !== 'all'
            || template.member_slot !== 'current_member' || !Array.isArray(template.body) || !template.body.length) throw new Error('proof_expression_template');
        const prepared = template.body.map(predicate => {
                expressionShape(predicate, ['op', 'operands']);
                const op = scope.operator(predicate.op);
                // The admitted template grammar is a conjunction of binary
                // field comparisons. No callback, branch or nested quantifier.
                if (!['eq', 'state_is', 'date_in_period'].includes(op.id) || predicate.operands.length !== 2) throw new Error('proof_expression_template_operator');
                const [left, right] = predicate.operands;
                expressionShape(left, ['kind', 'slot', 'node_kind', 'segments']);
                if (left.kind !== 'member_field' || left.slot !== 'current_member' || left.node_kind !== operands[0].type.item.kind) throw new Error('proof_expression_template_member');
                const type = fieldType(left.node_kind, left.segments);
                const leftType = op.id === 'state_is' ? { form: 'field', value: type } : type;
                const rightType = op.id === 'date_in_period' ? { form: 'period' } : op.id === 'state_is' ? { form: 'state_literal' } : type;
                unifyOperatorTypes(op, [leftType, rightType]);
                return { op, left, right, leftType, rightType };
        });
        let all = true; let any = false;
        for (const member of nodes) {
            let conjunction = true;
            for (const { op, left, right, leftType, rightType } of prepared) {
                const result = evaluateScalarProof(op, [{ type: leftType, value: readPath(member, left.segments) },
                    { type: rightType, value: resolve(right, rightType) }]);
                if (!result) conjunction = false;
            }
            if (!conjunction) all = false;
            if (conjunction) any = true;
        }
        return operator.id === 'all_match' ? all : !any;
    }
    return evaluateScalarProof(operator, operands.map(operand => ({ type: operand.type,
        value: resolve(operand.expression, operand.type) })));
}

module.exports = { readObservedIdentity, measureMaterialFingerprint, evaluateObservedOperator };
