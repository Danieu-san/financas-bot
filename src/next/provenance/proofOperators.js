'use strict';
const { copyData, field } = require('./observationContract');
const { validateLiteral } = require('./literalTypes');
const { digest } = require('../kernel/canonicalValue');
const { evaluateScalarProof, compareTypedScalars } = require('./scalarProofOperators');
const { unifyOperatorTypes } = require('./operatorTypes');
const { civilDateInPinnedTimezone } = require('./pinnedCivilTimezone');
const { SPECIAL_PROOF_OPERATORS, matchesSpecialProofOperator } = require('./proofOperatorContracts');
const { materialFieldType } = require('./materialFieldTypes');
const { createCollectionProofPrimitives } = require('./collectionProofCore');
const collection = createCollectionProofPrimitives(compareTypedScalars);

// Internal TCB primitive, not an acceptance API. The caller supplies an
// admitted registry projection and live handles, never raw evidence. This
// module has no expected fingerprint input and does not write causal trace.
const { readObservedIdentity, observedKeys, sequence, scalar, record, period, typedResult, materialValue } = require('./proofObservedValues');

const { createMaterialFingerprint } = require('./materialFingerprintCore');
const measureMaterialFingerprint = createMaterialFingerprint(copyData, digest);

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
function evaluateObservedOperatorWithPeriod(rawOperator, rawOperands, scope, readPeriod) {
    const operator = copyData(rawOperator); const operands = copyData(rawOperands);
    if (!Array.isArray(operands)) throw new Error('proof_expression_operands');
    for (const operand of operands) expressionShape(operand, ['type', 'expression']);
    const special = SPECIAL_PROOF_OPERATORS;
    function members(operand) {
        expressionShape(operand.expression, ['kind', 'name']);
        if (operand.expression.kind !== 'set_ref' || !['set', 'sequence'].includes(operand.type.form) || operand.type.item?.form !== 'node') throw new Error('proof_expression_set');
        return collection.members(scope.set(operand.expression.name), operand.type);
    }
    function fieldType(kind, segments) {
        return materialFieldType(kind, segments, scope.fieldDescriptor(kind, segments));
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
        if (['period', 'range'].includes(type.form)) return readPeriod(value);
        if (['set', 'sequence'].includes(type.form)) return sequence(value, item => item);
        return value;
    }
    if (operator.id === 'fingerprint_is') {
        if (!matchesSpecialProofOperator(operator)) throw new Error('proof_operator_contract');
        unifyOperatorTypes(operator, operands.map(o => o.type));
        if (operands[0].expression.kind !== 'node_ref' || operands[1].expression.kind !== 'literal'
            || operands[1].expression.value_type !== 'digest') throw new Error('proof_expression_fingerprint');
        const node = resolve(operands[0].expression, operands[0].type);
        if (node.kind !== operands[0].type.kind) throw new Error('proof_expression_node_kind');
        const expected = resolve(operands[1].expression, operands[1].type);
        validateLiteral({ type: 'digest', value: expected });
        const alias = operands[0].expression.alias;
        return measureMaterialFingerprint(scope.node(alias), scope.material(alias), 'enumerated_presence') === expected;
    }
    unifyOperatorTypes(operator, operands.map(o => o.type));
    if (operator.id === 'civil_date_matches') {
        if (!matchesSpecialProofOperator(operator)) throw new Error('proof_operator_contract');
        const source = operands[0].expression;
        if (['field_ref', 'claim_ref'].includes(source.kind)) {
            expressionShape(source, source.kind === 'field_ref' ? ['kind', 'alias', 'segments'] : ['kind', 'segments']);
            if (!Array.isArray(source.segments) || !source.segments.length || source.segments.some(name => !field(name)))
                throw new Error('proof_expression_path');
            const [date, timezone, calendar] = operands.slice(1).map(o => resolve(o.expression, o.type));
            validateLiteral({ type: 'date', value: date });
            let handle = source.kind === 'field_ref' ? scope.node(source.alias) : scope.claim();
            for (const segment of source.segments.slice(0, -1)) handle = handle.get(segment);
            return handle.civilDate(source.segments.at(-1), timezone, calendar) === date;
        }
        const [instant, date, timezone, calendar] = operands.map(o => resolve(o.expression, o.type));
        validateLiteral({ type: 'date', value: date });
        return civilDateInPinnedTimezone(instant, timezone, calendar) === date;
    }
    if (Object.hasOwn(special, operator.id)) {
        if (!matchesSpecialProofOperator(operator)) throw new Error('proof_operator_contract');
        const nodes = members(operands[0]);
        if (operator.id === 'same_field') {
            const selected = selector(operands[1], operands[0].type.item.kind);
            const read = values(nodes, selected);
            return collection.sameField(read, selected.type);
        }
        if (operator.id === 'join_eq') {
            const rightNodes = members(operands[1]);
            const leftSelector = selector(operands[2], operands[0].type.item.kind);
            const rightSelector = selector(operands[3], operands[1].type.item.kind);
            unifyOperatorTypes({ args: ['scalar:T', 'scalar:T'] }, [leftSelector.type, rightSelector.type]);
            const left = values(nodes, leftSelector); const right = values(rightNodes, rightSelector);
            return collection.join(left, right, leftSelector.type);
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
            return collection.ordered(rows, keys);
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
        const { all, any } = collection.quantify(nodes, member => {
            let conjunction = true;
            for (const { op, left, right, leftType, rightType } of prepared) {
                const result = evaluateScalarProof(op, [{ type: leftType, value: readPath(member, left.segments) },
                    { type: rightType, value: resolve(right, rightType) }]);
                if (!result) conjunction = false;
            }
            return conjunction;
        });
        return operator.id === 'all_match' ? all : !any;
    }
    return evaluateScalarProof(operator, operands.map(operand => ({ type: operand.type,
        value: resolve(operand.expression, operand.type) })));
}

function evaluateObservedOperator(operator, operands, scope) {
    return evaluateObservedOperatorWithPeriod(operator, operands, scope, period);
}
// TCB-only selection over an already schema-admitted claim context. Its
// functional temporal dependency is the finite period's observed fields;
// whole-record key enumeration belongs to proof/fingerprint validation.
// No acceptance API is added, and the proof entry retains strict enumeration.
function evaluateObservedSelectionOperator(operator, operands, scope) {
    operator = copyData(operator); operands = copyData(operands);
    if (operator.id === 'edge_target_in_set') {
        if (Object.keys(operator).sort().join(',') !== 'args,id,semantics'
            || operator.semantics !== 'resolved_target_member'
            || JSON.stringify(operator.args) !== JSON.stringify(['edge_ref:K', 'set:node:K']))
            throw new Error('proof_operator_contract');
        unifyOperatorTypes(operator, operands.map(operand => operand.type));
        expressionShape(operands[0].expression, ['kind', 'id']);
        expressionShape(operands[1].expression, ['kind', 'name']);
        if (operands[0].expression.kind !== 'edge_ref' || operands[1].expression.kind !== 'set_ref')
            throw new Error('proof_expression_membership');
        // Unlike proof identity measurement, this uses a nominal relation/set
        // already admitted by the compiler. The traversal is still performed
        // on a live handle. No caller-provided target ID or boolean is trusted.
        return scope.edgeTargetInSet(operands[0].expression.id, operands[1].expression.name);
    }
    return evaluateObservedOperatorWithPeriod(operator, operands, scope, handle => period(handle, false));
}
module.exports = { readObservedIdentity, measureMaterialFingerprint, evaluateObservedOperator, evaluateObservedSelectionOperator };
