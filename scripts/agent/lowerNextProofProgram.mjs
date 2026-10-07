import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildCommonJsGuestBundle } from './buildNextProvenanceArtifacts.mjs';
import { copyData } from '../../src/next/provenance/observationContract.js';
import { unifyOperatorTypes } from '../../src/next/provenance/operatorTypes.js';
import { validateLiteral } from '../../src/next/provenance/literalTypes.js';
import { createScalarProofPrimitives } from '../../src/next/provenance/scalarProofCore.js';
import { canonicalValue } from '../../src/next/kernel/canonicalValue.js';
import { validateMaterialFields } from '../../src/next/provenance/schemaRegistryProjection.js';
import { matchesSpecialProofOperator } from '../../src/next/provenance/proofOperatorContracts.js';
import { materialFieldType } from '../../src/next/provenance/materialFieldTypes.js';
import { validateGuestBundle } from './nextProvenanceGuestProfile.js';
import { phaseCompositionCommitment } from '../../src/next/provenance/phaseCompositionProfile.js';
import { assertClaimMonthIsolatedProgram, sealClaimMonthIsolatedLowering, admitClaimMonthIsolatedProof } from '../../src/next/provenance/graphCompiler.js';
import { admitArtifact } from '../../src/next/provenance/artifactLoader.js';
import { QUALIFICATION_PATH, decodeClaimMonthProfile } from '../../src/next/provenance/claimMonthIsolatedProfile.js';
import { selectedEventDayProgramInputs, selectedEventDayProgramFamily } from '../../src/next/provenance/selectedEventDayProfile.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fail = code => { throw new Error(`proof_program_${code}`); };
const q = value => JSON.stringify(value);
function fields(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).sort().join(',') !== [...expected].sort().join(',')) fail('shape');
}
const primitives = createScalarProofPrimitives(copyData, canonicalValue);
function typeDescriptor(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('type_shape');
    if (value.form === 'scalar') {
        const extra = value.type === 'id' ? ['kind'] : value.type === 'enum' ? ['domain'] : value.type === 'money_minor' ? ['unit'] : [];
        fields(value, ['form', 'type', ...extra]);
        if (!['id', 'text', 'date', 'month', 'datetime', 'integer', 'positive_integer',
            'nonnegative_integer', 'money_minor', 'boolean', 'enum', 'digest', 'timezone', 'calendar', 'civil_unit'].includes(value.type)) fail('type_shape');
        if (extra.some(name => typeof value[name] !== 'string' || !value[name].length)) fail('type_shape');
    } else if (value.form === 'field') {
        fields(value, ['form', 'value']); typeDescriptor(value.value);
        if (value.value.form !== 'scalar') fail('type_shape');
    } else if (['node', 'edge'].includes(value.form)) {
        const name = value.form === 'node' ? 'kind' : 'target';
        fields(value, ['form', name]);
        if (typeof value[name] !== 'string' || !/^[a-z][a-z0-9_]*$/.test(value[name])) fail('type_shape');
    } else if (value.form === 'field_selector') {
        fields(value, ['form', 'kind', 'value']); typeDescriptor(value.value);
        if (value.value.form !== 'scalar' || typeof value.kind !== 'string' || !/^[a-z][a-z0-9_]*$/.test(value.kind)) fail('type_shape');
    } else if (['predicate_template_ref', 'sort'].includes(value.form)) {
        fields(value, ['form', 'kind']);
        if (typeof value.kind !== 'string' || !/^[a-z][a-z0-9_]*$/.test(value.kind)) fail('type_shape');
    } else if (value.form === 'edge_selector') {
        fields(value, ['form', 'kind', 'target']);
        if (['kind', 'target'].some(name => typeof value[name] !== 'string' || !/^[a-z][a-z0-9_]*$/.test(value[name]))) fail('type_shape');
    } else if (['set', 'sequence'].includes(value.form)) {
        fields(value, ['form', 'item']); typeDescriptor(value.item);
        if (!['node', 'scalar'].includes(value.item.form)) fail('type_shape');
    } else if (['period', 'range'].includes(value.form)) {
        fields(value, ['form', ...(Object.hasOwn(value, 'periodKind') ? ['periodKind'] : [])]);
        if (value.periodKind !== undefined && typeof value.periodKind !== 'string') fail('type_shape');
    } else if (['kind_literal', 'state_literal', 'digest_literal'].includes(value.form)) fields(value, ['form']);
    else fail('type_pending');
}
function capturedSource(relative) {
    const bytes = fs.readFileSync(path.join(root, relative));
    const source = bytes.toString('utf8');
    if (!Buffer.from(source, 'utf8').equals(bytes)) fail('source_utf8');
    return source;
}

// Build-time lowering only. Each IR expression becomes concrete JS reads or
// reviewed literals. No expression object/IR interpreter is sent to the guest.
// This increment supports scalar primitives; unsupported operators fail closed
// rather than masquerading as a complete proof engine or freeze authority.
export function buildScalarProofProgram(raw, phase = 'proof') {
    return lowerScalarProofProgram(raw, phase, null);
}

// Build-only negative artefact. No caller code, expected, trace or financial
// acceptance is endowed. Selector and derivation copies are never changed.
export function buildScalarAssertionFaultProgram(raw, predicateId) {
    if (typeof predicateId !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(predicateId)) fail('fault_target');
    return lowerScalarProofProgram(raw, 'proof', predicateId);
}

function lowerScalarProofProgram(raw, phase, faultId, qualification = null, selectedDay = null) {
    if (!['proof', 'derivation'].includes(phase)) fail('phase');
    let input; try { input = copyData(raw); } catch { fail('input'); }
    fields(input, ['predicates', 'windows', ...['materials', 'operators', 'selections'].filter(name => Object.hasOwn(input, name))]);
    if (!Array.isArray(input.predicates) || phase === 'proof' && !input.predicates.length || input.predicates.length > 16384
        || !input.windows || typeof input.windows !== 'object' || Array.isArray(input.windows)) fail('input');
    const names = new Set();
    const materials = input.materials ?? {};
    const materialKinds = new Map();
    if (!materials || typeof materials !== 'object' || Array.isArray(materials)) fail('material');
    for (const descriptor of Object.values(materials)) {
        try {
            fields(descriptor, ['kind', 'registry_version', 'fields']);
            if (descriptor.registry_version !== 1 || typeof descriptor.kind !== 'string'
                || !/^[a-z][a-z0-9_]*$/.test(descriptor.kind)) fail('material');
            // This is grammar checking, not registry admission. Compiler input
            // must already come from the schema/closed-world admitted registry.
            validateMaterialFields(descriptor.fields, target => /^[a-z][a-z0-9_]*$/.test(target));
            const id = descriptor.fields.id;
            fields(id, ['class', 'type', 'required']);
            if (id.class !== 'identity' || id.type !== 'id' || id.required !== true) fail('material');
            const previous = materialKinds.get(descriptor.kind);
            if (previous && canonicalValue(JSON.parse(q(previous))) !== canonicalValue(JSON.parse(q(descriptor)))) fail('material');
            materialKinds.set(descriptor.kind, descriptor);
        } catch { fail('material'); }
    }
    const operators = new Map();
    if (input.operators !== undefined && (!Array.isArray(input.operators) || input.operators.length > 128)) fail('operators');
    for (const operator of input.operators ?? []) {
        fields(operator, ['id', 'args', 'semantics']);
        if (typeof operator.id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(operator.id) || operators.has(operator.id)
            || !Array.isArray(operator.args) || operator.args.some(value => typeof value !== 'string')
            || typeof operator.semantics !== 'string') fail('operators');
        operators.set(operator.id, operator);
    }
    function pathParts(expression, receiver) {
        fields(expression, expression.kind === 'field_ref' ? ['kind', 'alias', 'segments'] : ['kind', 'segments']);
        if (!['field_ref', 'claim_ref'].includes(expression.kind)
            || !Array.isArray(expression.segments) || !expression.segments.length || expression.segments.length > 32
            || expression.segments.some(name => typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
                || ['constructor', '__proto__', 'prototype'].includes(name))) fail('path');
        if (expression.kind === 'field_ref' && (typeof expression.alias !== 'string' || !expression.alias.length)) fail('alias');
        const auxiliary = expression.kind === 'claim_ref' && expression.segments[0] === 'qualification';
        if (auxiliary && (!qualification || qualification.variant !== 'M'
            || q(expression.segments) !== q(['qualification', 'alternative_period']) || receiver)) fail('qualification_locator');
        let result = receiver ?? (expression.kind === 'field_ref' ? `operands.node(${q(expression.alias)})`
            : auxiliary ? 'operands.qualification()' : 'operands.claim()');
        for (const segment of expression.segments.slice(0, -1)) result += `.get(${q(segment)})`;
        return { receiver: result, field: expression.segments.at(-1) };
    }
    function pathRead(expression, presence = false, receiver) {
        const parts = pathParts(expression, receiver);
        return `${parts.receiver}.${presence ? 'has' : 'get'}(${q(parts.field)})`;
    }
    function windowValue(name) {
        if (typeof name !== 'string' || !Object.hasOwn(input.windows, name)) fail('window');
        const window = input.windows[name];
        const bound = (expression, type) => {
            if (!['field_ref', 'claim_ref', 'literal'].includes(expression?.kind)) fail('window_bound');
            return read(expression, { form: 'scalar', type });
        };
        if (window.kind === 'month') {
            fields(window, ['kind', 'value']);
            return `checkedPeriod({kind:"month",value:${bound(window.value, 'month')}})`;
        }
        if (window.kind === 'range') {
            fields(window, ['kind', 'start', 'end', 'start_inclusive', 'end_inclusive']);
            if (typeof window.start_inclusive !== 'boolean' || typeof window.end_inclusive !== 'boolean') fail('window');
            return `checkedPeriod({kind:"range",start:${bound(window.start, 'date')},end:${bound(window.end, 'date')},`
                + `start_inclusive:${window.start_inclusive},end_inclusive:${window.end_inclusive}})`;
        }
        fail('window');
    }
    function read(expression, type) {
        if (!expression || typeof expression !== 'object' || Array.isArray(expression)) fail('expression');
        switch (expression.kind) {
        case 'field_ref': case 'claim_ref': {
            let result = pathRead(expression);
            if (['period', 'range'].includes(type.form)) result = `period(${result},${phase === 'proof'})`;
            if (['set', 'sequence'].includes(type.form)) result = `sequence(${result},value=>value)`;
            return result;
        }
        case 'literal':
            fields(expression, ['kind', 'value_type', 'value']);
            try { validateLiteral({ type: expression.value_type, value: expression.value }); } catch { fail('literal'); }
            return q(expression.value);
        case 'period_literal': {
            fields(expression, ['kind', 'period']);
            if (!['period', 'range'].includes(type.form)) fail('period_type');
            try { primitives.evaluateScalarProof({ id: 'period_eq', args: ['period', 'period'], semantics: 'equal_period_kind_and_fields' },
                [1, 2].map(() => ({ type, value: expression.period }))); } catch { fail('period_literal'); }
            return q(expression.period);
        }
        case 'node_ref': case 'edge_ref': {
            fields(expression, expression.kind === 'node_ref' ? ['kind', 'alias'] : ['kind', 'id']);
            const value = expression.kind === 'node_ref' ? expression.alias : expression.id;
            if (typeof value !== 'string' || !value.length) fail('identity');
            return `identity(operands.${expression.kind === 'node_ref' ? 'node' : 'edge'}(${q(value)}))`;
        }
        case 'field_presence':
            fields(expression, ['kind', 'field']);
            if (expression.field?.kind !== 'field_ref') fail('presence');
            return pathRead(expression.field, true);
        case 'set_ref':
            fields(expression, ['kind', 'name']);
            if (typeof expression.name !== 'string' || !['set', 'sequence'].includes(type.form) || type.item.form !== 'node') fail('set');
            return `sequence(operands.set(${q(expression.name)}),identity)`;
        case 'reference_set': {
            fields(expression, ['kind', 'field']);
            const value = expression.field;
            if (value?.kind !== 'field_ref' || value.segments?.length !== 1
                || type.form !== 'set' || type.item.form !== 'node') fail('reference');
            // Resolve the complete observed reference sequence first, matching
            // the trusted path; then traverse each admitted reference in order.
            return `(()=>{const refs=sequence(${pathRead(value)},ref=>{validateLiteral({type:"id",value:ref});return ref;});`
                + `return refs.map(ref=>{const target=identity(operands.resolveReference(${q(value.alias)},${q(value.segments[0])},ref));`
                + `if(target.ref_id!==ref)throw new Error('proof_program_reference');return target;});})()`;
        }
        case 'projection': {
            fields(expression, ['kind', 'set', 'selector', 'as']);
            fields(expression.set, ['kind', 'name']); fields(expression.selector, ['kind', 'node_kind', 'segments']);
            if (expression.set.kind !== 'set_ref' || expression.selector.kind !== 'field_selector'
                || typeof expression.set.name !== 'string' || typeof expression.selector.node_kind !== 'string'
                || !['set', 'sequence'].includes(expression.as) || type.form !== expression.as) fail('projection');
            const path = pathRead({ kind: 'field_ref', alias: 'projection-member', segments: expression.selector.segments }, false, 'member');
            return `sequence(operands.set(${q(expression.set.name)}),member=>{if(identity(member).kind!==${q(expression.selector.node_kind)})`
                + `throw new Error('proof_program_projection_kind');return ${path};})`;
        }
        case 'window_ref': case 'window_bound': {
            fields(expression, expression.kind === 'window_ref' ? ['kind', 'name'] : ['kind', 'name', 'bound']);
            const value = windowValue(expression.name);
            if (expression.kind === 'window_ref') return value;
            if (input.windows[expression.name].kind !== 'range' || !['start', 'end'].includes(expression.bound)) fail('window_bound');
            return `(${value}).${expression.bound}`;
        }
        default: fail('expression_pending');
        }
    }
    function members(operand) {
        fields(operand.expression, ['kind', 'name']);
        if (operand.expression.kind !== 'set_ref' || typeof operand.expression.name !== 'string'
            || !['set', 'sequence'].includes(operand.type.form) || operand.type.item.form !== 'node') fail('set');
        return `collection.members(operands.set(${q(operand.expression.name)}),${q(operand.type)})`;
    }
    function selector(operand, kind) {
        const expression = operand.expression;
        fields(expression, ['kind', 'node_kind', 'segments']);
        if (expression.kind !== 'field_selector' || expression.node_kind !== kind) fail('selector');
        const path = pathRead({ kind: 'field_ref', alias: 'selector-member', segments: expression.segments }, false, 'member');
        const descriptor = materialKinds.get(kind)?.fields[expression.segments[0]];
        let type;
        try {
            type = materialFieldType(kind, expression.segments, descriptor);
            typeDescriptor(type);
            if (operand.type.value) unifyOperatorTypes({ args: ['scalar:T', 'scalar:T'] }, [type, operand.type.value]);
        } catch { fail('selector'); }
        return { type, path };
    }
    const readValues = (source, selected) => `${source}.map(member=>validated(${selected.path},${q(selected.type)}))`;
    function collectionPredicate(predicate) {
        const [left, right, leftKey, rightKey] = predicate.operands;
        const nodes = members(left);
        const kind = left.type.item.kind;
        switch (predicate.operator.id) {
        case 'same_field': {
            const selected = selector(right, kind);
            return `collection.sameField(${readValues(nodes, selected)},${q(selected.type)})`;
        }
        case 'join_eq': {
            const other = members(right);
            const a = selector(leftKey, kind); const b = selector(rightKey, right.type.item.kind);
            try { unifyOperatorTypes({ args: ['scalar:T', 'scalar:T'] }, [a.type, b.type]); } catch { fail('selector'); }
            // All member identities on BOTH sides are resolved before any
            // selector read, exactly as in the existing trusted dispatcher.
            return `(()=>{const left=${nodes};const right=${other};return collection.join(`
                + `${readValues('left', a)},${readValues('right', b)},${q(a.type)});})()`;
        }
        case 'ordered_by': {
            const order = right.expression;
            fields(order, ['kind', 'keys', 'tie_break']);
            if (order.kind !== 'sort' || order.tie_break !== 'kind_ref_version' || !Array.isArray(order.keys)
                || !order.keys.length || order.keys.length > 64) fail('sort');
            const keys = order.keys.map(key => {
                fields(key, ['selector', 'direction']);
                if (!['asc', 'desc'].includes(key.direction)) fail('sort');
                return { ...selector({ expression: key.selector, type: {} }, kind), direction: key.direction };
            });
            const rows = `${nodes}.map(member=>({identity:identity(member),values:[${keys.map(key => `validated(${key.path},${q(key.type)})`).join(',')}]}))`;
            return `collection.ordered(${rows},${q(keys.map(({ type, direction }) => ({ type, direction })))})`;
        }
        case 'edge_pair_complete': {
            const selected = right.expression;
            fields(selected, ['kind', 'node_kind', 'segments']);
            if (selected.kind !== 'field_selector' || selected.node_kind !== kind
                || !Array.isArray(selected.segments) || selected.segments.length !== 1) fail('edge_selector');
            pathRead({ kind: 'field_ref', alias: 'edge-member', segments: selected.segments });
            const expected = read(leftKey.expression, leftKey.type);
            const equal = { id: 'same_identity', args: ['node:K', 'node:K'], semantics: 'same_kind_ref_version' };
            return `(()=>{const nodes=${nodes};const expected=${expected};`
                + `scalar(${q(equal)},[{type:${q(leftKey.type)},value:expected},{type:${q(leftKey.type)},value:expected}]);`
                + `let equal=true;for(const member of nodes){const target=identity(operands.memberEdge(member,${q(selected.segments[0])}));`
                + `if(!scalar(${q(equal)},[{type:${q(leftKey.type)},value:target},{type:${q(leftKey.type)},value:expected}]))equal=false;}`
                + `return nodes.length===2&&equal;})()`;
        }
        case 'all_match': case 'none_match': {
            const template = right.expression;
            fields(template, ['kind', 'template_ref', 'combinator', 'member_slot', 'bindings', 'body']);
            if (template.kind !== 'predicate_template' || template.combinator !== 'all' || template.member_slot !== 'current_member'
                || !template.bindings || typeof template.bindings !== 'object' || Array.isArray(template.bindings)
                || !Array.isArray(template.body) || !template.body.length) fail('template');
            fields(template.template_ref, ['id', 'version', 'hash']);
            if (typeof template.template_ref.id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(template.template_ref.id)
                || !Number.isSafeInteger(template.template_ref.version) || template.template_ref.version < 1) fail('template');
            try { validateLiteral({ type: 'digest', value: template.template_ref.hash }); } catch { fail('template'); }
            const guards = template.body.map(guard => {
                fields(guard, ['op', 'operands']);
                const op = operators.get(guard.op);
                if (!op || !['eq', 'state_is', 'date_in_period'].includes(op.id) || !primitives.supportsOperator(op)
                    || !Array.isArray(guard.operands) || guard.operands.length !== 2) fail('template');
                const [field, value] = guard.operands;
                fields(field, ['kind', 'slot', 'node_kind', 'segments']);
                if (field.kind !== 'member_field' || field.slot !== 'current_member' || field.node_kind !== kind) fail('template');
                const selected = selector({ type: {}, expression: { kind: 'field_selector', node_kind: kind, segments: field.segments } }, kind);
                const leftType = op.id === 'state_is' ? { form: 'field', value: selected.type } : selected.type;
                const rightType = op.id === 'date_in_period' ? { form: 'period' } : op.id === 'state_is' ? { form: 'state_literal' } : selected.type;
                try { unifyOperatorTypes(op, [leftType, rightType]); } catch { fail('template'); }
                return `if(!scalar(${q(op)},[{type:${q(leftType)},value:${selected.path}},{type:${q(rightType)},value:${read(value, rightType)}}])) conjunction=false;`;
            });
            const result = `collection.quantify(${nodes},member=>{let conjunction=true;${guards.join('')}return conjunction;})`;
            return predicate.operator.id === 'all_match' ? `${result}.all` : `!${result}.any`;
        }
        default: fail('operator_pending');
        }
    }
    // Validate every declared window at build time, including unused windows.
    // Only referenced windows generate guest code or perform observed reads.
    for (const name of Object.keys(input.windows)) windowValue(name);
    const lines = input.predicates.map(predicate => {
        fields(predicate, ['id', 'operator', 'operands']);
        if (typeof predicate.id !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(predicate.id)
            || names.has(predicate.id)) fail('id');
        names.add(predicate.id);
        fields(predicate.operator, ['id', 'args', 'semantics']);
        if (!Array.isArray(predicate.operands)) fail('operands');
        for (const operand of predicate.operands) {
            fields(operand, ['type', 'expression']); typeDescriptor(operand.type);
        }
        // The same fixed primitive implementation is the contract authority;
        // do not add a second operator-signature table in this generator.
        const fingerprint = predicate.operator.id === 'fingerprint_is';
        const civil = predicate.operator.id === 'civil_date_matches';
        const collectionOperator = ['same_field', 'join_eq', 'ordered_by', 'all_match', 'none_match', 'edge_pair_complete'].includes(predicate.operator.id);
        if (!(fingerprint || civil || collectionOperator ? matchesSpecialProofOperator(predicate.operator) : primitives.supportsOperator(predicate.operator))) fail('operator_pending');
        try { unifyOperatorTypes(predicate.operator, predicate.operands.map(item => item.type)); }
        catch { fail('types'); }
        if (phase === 'derivation' && predicate.operator.id === 'edge_target_in_set') {
            const [edge, set] = predicate.operands;
            fields(edge.expression, ['kind', 'id']); fields(set.expression, ['kind', 'name']);
            if (edge.expression.kind !== 'edge_ref' || set.expression.kind !== 'set_ref') fail('derivation_membership');
            return `if(!operands.edgeTargetInSet(${q(edge.expression.id)},${q(set.expression.name)}))all=false;`;
        }
        if (collectionOperator) return `if(!(${collectionPredicate(predicate)})) all=false;`;
        if (civil) {
            const [instant, date, timezone, calendar] = predicate.operands;
            // Conversion stays on the observed handle. A literal instant has
            // no such handle and is not supported by this guest profile.
            if (!['field_ref', 'claim_ref'].includes(instant.expression?.kind)) fail('civil_source_pending');
            const source = pathParts(instant.expression);
            const equal = { id: 'eq', args: ['scalar:T', 'scalar:T'], semantics: 'typed_equal' };
            return `if(!(()=>{const date=${read(date.expression, date.type)};`
                + `const timezone=${read(timezone.expression, timezone.type)};const calendar=${read(calendar.expression, calendar.type)};`
                + `validateLiteral({type:"date",value:date});`
                + `const converted=${source.receiver}.civilDate(${q(source.field)},timezone,calendar);`
                + `return scalar(${q(equal)},[{type:${q(date.type)},value:converted},{type:${q(date.type)},value:date}]);})())all=false;`;
        }
        if (fingerprint) {
            const [node, expected] = predicate.operands;
            fields(node.expression, ['kind', 'alias']);
            if (node.expression.kind !== 'node_ref' || typeof node.expression.alias !== 'string'
                || expected.expression.kind !== 'literal' || expected.expression.value_type !== 'digest') fail('fingerprint');
            const descriptor = materials[node.expression.alias];
            if (!descriptor || descriptor.kind !== node.type.kind) fail('material');
            const literal = read(expected.expression, expected.type);
            return `if (fingerprint(checkedNode(operands.node(${q(node.expression.alias)}),${q(node.type.kind)}),`
                + `${q(descriptor)},"enumerated_presence") !== ${literal}) all = false;`;
        }
        const values = predicate.operands.map(operand => `{type:${q(operand.type)},value:${selectedDay
            && predicate.id === selectedDay.target_predicate_id
            ? `rootOperands.operand(()=>${read(operand.expression, operand.type)})` : read(operand.expression, operand.type)}}`);
        return `if (!scalar(${q(predicate.operator)},[${values.join(',')}])) all = false;`;
    });
    const lowered = new Map(input.predicates.map((predicate, index) => [predicate.id, lines[index]]));
    const siteId = (role, id, suffix = '') => `${role}_${Buffer.from(id, 'utf8').toString('hex')}${suffix}`;
    const sites = [];
    const mark = (role, predicate, line, suffix = '') => {
        const site = siteId(role, predicate.id, suffix);
        sites.push({ site, role, predicate_id: predicate.id, operator: predicate.operator.id,
            operands: predicate.operands });
        return `${site}:{${selectedDay
            ? `if(!rootOperands.dispatch(()=>{let all=true;${line}return all;}))all=false;` : line}}`;
    };
    let faultFound = false;
    const assertions = input.predicates.map((predicate, index) => {
        let line = lines[index]; let effective = predicate;
        if (predicate.id === faultId) {
            if (phase !== 'proof' || predicate.operator.id !== 'eq'
                || predicate.operator.semantics !== 'typed_equal'
                || q(predicate.operator.args) !== q(['scalar:T', 'scalar:T'])) fail('fault_operator');
            effective = { ...predicate, operator: { id: 'not_eq', args: ['scalar:T', 'scalar:T'], semantics: 'typed_unequal' } };
            const values = predicate.operands.map(operand => `{type:${q(operand.type)},value:${read(operand.expression, operand.type)}}`);
            line = `if (!scalar(${q(effective.operator)},[${values.join(',')}])) all = false;`;
            faultFound = true;
        }
        if (qualification) line = `if(!operands.assertion(${q(predicate.id)},()=>{let all=true;${line}return all;}))all=false;`;
        return mark(phase === 'proof' ? 'proof_assertion' : 'derivation_guard', effective, line);
    });
    if (faultId !== null && !faultFound) fail('fault_target');
    if (phase === 'derivation' && input.selections?.length) fail('derivation_selection');
    if (input.selections !== undefined && (!Array.isArray(input.selections) || input.selections.length > 512)) fail('selection');
    const targets = new Set();
    const selections = (input.selections ?? []).map((selection, selectionIndex) => {
        fields(selection, ['candidate_set', 'selected_set', 'cases']);
        if ([selection.candidate_set, selection.selected_set].some(name => typeof name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(name))
            || selection.candidate_set === selection.selected_set || targets.has(selection.selected_set)
            || !Array.isArray(selection.cases) || selection.cases.length > 512) fail('selection');
        targets.add(selection.selected_set);
        const aliases = new Set();
        const cases = selection.cases.map((item, index) => {
            fields(item, ['node', 'identity', 'mode', 'predicates']); fields(item.identity, ['kind', 'ref_id', 'version']);
            if (typeof item.node !== 'string' || !item.node.length || aliases.has(item.node)
                || typeof item.identity.kind !== 'string' || !/^[a-z][a-z0-9_]*$/.test(item.identity.kind)
                || typeof item.identity.version !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(item.identity.version)
                || !['include_if_all', 'exclude_if_all'].includes(item.mode)
                || !Array.isArray(item.predicates) || !item.predicates.length || new Set(item.predicates).size !== item.predicates.length
                || item.predicates.some(id => !lowered.has(id))) fail('selection');
            try { validateLiteral({ type: 'id', value: item.identity.ref_id }); } catch { fail('selection'); }
            aliases.add(item.node);
            // This is compiled code, not a runtime IR/template interpreter.
            // The candidate alias uses the LIVE member handle; all other
            // accesses retain the normal capabilities of this invocation.
            return `case ${index}:{const observed=identity(member);`
                + `if(observed.kind!==${q(item.identity.kind)}||observed.ref_id!==${q(item.identity.ref_id)}||observed.version!==${q(item.identity.version)})throw new Error('proof_program_selection_identity');`
                + `const operands=Object.freeze({node:alias=>alias===${q(item.node)}?member:rootOperands.node(alias),`
                + `claim:()=>rootOperands.claim(),set:name=>rootOperands.set(name),edge:id=>rootOperands.edge(id),`
                + `resolveReference:(alias,field,ref)=>rootOperands.resolveReference(alias,field,ref),memberEdge:(node,field)=>rootOperands.memberEdge(node,field)});`
                + `let all=true;${item.predicates.map(id => mark('proof_selection', input.predicates.find(row => row.id === id),
                    lowered.get(id), `_${selectionIndex}_${index}`)).join('\n')}return ${item.mode === 'include_if_all' ? 'all' : '!all'};}`;
        });
        return `{let seen=0;operands.select(${q(selection.candidate_set)},${q(selection.selected_set)},(member,index)=>{seen++;switch(index){`
            + `${cases.join('\n')}default:throw new Error('proof_program_selection_candidate');}});`
            + `if(seen!==${selection.cases.length})throw new Error('proof_program_selection_roster');}`;
    });
    const entry = `'use strict';\nconst { createScalarProofPrimitives } = require('./scalarProofCore');\n`
        + `const { copyProgramData } = require('./proofProgramData');\n`
        + `const { canonicalValue } = require('../kernel/canonicalJson');\n`
        + `const { sha256Utf8 } = require('./proofSha256');\n`
        + `const { createMaterialFingerprint } = require('./materialFingerprintCore');\n`
        + `const { createCollectionProofPrimitives } = require('./collectionProofCore');\n`
        + `const { validateLiteral } = require('./literalTypes');\n`
        + `const { readObservedIdentity: identity, sequence, period } = require('./proofObservedValues');\n`
        + `const primitives = createScalarProofPrimitives(copyProgramData, canonicalValue);\n`
        + `const scalar=primitives.evaluateScalarProof; const collection=createCollectionProofPrimitives(primitives.compareTypedScalars);\n`
        + `function validated(value,type) { primitives.compareTypedScalars(type,value,value);return value; }\n`
        + `const fingerprint = createMaterialFingerprint(copyProgramData,value=>sha256Utf8(canonicalValue(value)));\n`
        + `function checkedNode(handle,kind) { if (identity(handle).kind!==kind) throw new Error('proof_program_node_kind'); return handle; }\n`
        + `function checkedPeriod(value) { scalar({id:"period_eq",args:["period","period"],semantics:"equal_period_kind_and_fields"},`
        + `[{type:{form:"period"},value},{type:{form:"period"},value}]); return value; }\n`
        + `function run(operands) { const rootOperands=operands;${selectedDay
            ? `if(rootOperands.selectedDayOrigin()!==true)throw new Error('proof_program_selected_day_origin');` : ''}\n${selections.join('\n')}\nlet all = true;\n${assertions.join('\n')}\nreturn all; }\nmodule.exports = {run};\n`;
    const recipe = ['scalarProofCore', 'proofProgramData', 'proofObservedValues', 'observationScalars', 'operatorTypes', 'literalTypes', 'civilCalendar',
        'materialFingerprintCore', 'proofSha256', 'collectionProofCore'];
    const sources = recipe.map(name => ({ path: `provenance/${name}.js`,
        source: capturedSource(`src/next/provenance/${name}.js`) }));
    sources.push({ path: 'kernel/canonicalJson.js', source: capturedSource('src/next/kernel/canonicalJson.js') },
        { path: 'provenance/program.js', source: entry });
    const built = buildCommonJsGuestBundle({ sources, entry: 'provenance/program.js', exportName: 'run' });
    return Object.freeze({ ...built, stage: 'scalar_proof_program_candidate_only', executable: false,
        predicateCount: lines.length, assertionSites: Object.freeze(sites.map(row => Object.freeze(row))),
        negative_witness_only: faultId !== null });
}

// One measured proof product contains both phase programs. Phase is a closed
// TCB control value, never a metric/fact-key dispatcher or expected trace.
export function buildPhaseProofProgram(raw, phaseProfileReceipt) {
    return lowerPhaseProofProgram(raw, phaseProfileReceipt, null);
}

// BUILD candidate only. Normal compiler admission and measured ticket/child
// are separate requirements; this adapter cannot qualify or release a root.
// No predicate/site/operand labels are supplied by the guest: callback order
// must be owned and checked by the future measured dispatcher.
export function buildSelectedEventDayPhaseProofProgram(raw, phaseProfileReceipt, expectation) {
    const planned = selectedEventDayProgramInputs(expectation);
    let input; try { input = JSON.parse(JSON.stringify(copyData(raw))); } catch { throw new Error('selected_day_program_input'); }
    if (canonicalValue(input) !== canonicalValue({ derivation: planned.derivation, proof: planned.proof }))
        throw new Error('selected_day_program_input');
    const phase = phaseCompositionCommitment(phaseProfileReceipt);
    if (phase.sha256 !== planned.phase.sha256 || phase.registry_sha256 !== planned.phase.registry_sha256)
        throw new Error('selected_day_program_phase');
    const built = lowerPhaseProofProgram(input, phaseProfileReceipt, null, null, null, planned);
    return Object.freeze({ ...built, stage: 'selected_day_dispatch_program_candidate_only', negative_witness_only: true,
        profile_witness_qualified: false, financial_release_eligible: false });
}

// One measured program root is intended for the entire C/M/S family. The
// external TCB selects the variant, not a fact/metric dispatcher or the guest.
// Separate per-variant roots would violate exact core measurement equality.
export function buildSelectedEventDayCommonProofProgram(raw, phaseProfileReceipt, expectations) {
    const family = selectedEventDayProgramFamily(expectations);
    let input; try { input = JSON.parse(JSON.stringify(copyData(raw))); } catch { throw new Error('selected_day_program_input'); }
    if (canonicalValue(input) !== canonicalValue(Object.fromEntries(['C', 'M', 'S'].map(v => [v,
        { derivation: family[v].derivation, proof: family[v].proof }])))) throw new Error('selected_day_program_input');
    const profile = phaseCompositionCommitment(phaseProfileReceipt);
    if (profile.sha256 !== family.C.phase.sha256 || profile.registry_sha256 !== family.C.phase.registry_sha256)
        throw new Error('selected_day_program_phase');
    const derivation = buildScalarProofProgram(input.C.derivation, 'derivation');
    const proofs = Object.fromEntries(['C', 'M', 'S'].map(v => [v,
        lowerScalarProofProgram(input[v].proof, 'proof', null, null, family[v])]));
    const source = `/* selected-event-day-path/v1 common ${family.C.precommit_hash} */\n`
        + `/* phase-profile ${profile.sha256}; registry ${profile.registry_sha256} */\n`
        + `(function(operands){'use strict';if(operands.phase==="derivation")return (${derivation.source})(operands);`
        + `if(operands.phase==="proof"){const variant=operands.selectedDayVariant();`
        + ['C', 'M', 'S'].map(v => `if(variant===${q(v)})return (${proofs[v].source})(operands);`).join('')
        + `throw new Error('proof_program_selected_day_variant');}throw new Error('proof_program_phase');})`;
    validateGuestBundle(source);
    const files = [{ path: 'bundle.js', media_type: 'text/javascript', sha256: `sha256:${createHash('sha256').update(source).digest('hex')}` },
        { path: profile.path, media_type: 'application/json', sha256: profile.sha256 }];
    const manifest = canonicalValue({ format: 'financasbot.provenance.artifact', version: 1, kind: 'proof', entry: 'bundle.js', files });
    return Object.freeze({ stage: 'selected_day_common_program_candidate_only', executable: false, source, manifest,
        artifact_root: `sha256:${createHash('sha256').update(manifest).digest('hex')}`, profileInput: profile,
        common_program_identity: true, negative_witness_only: true,
        profile_witness_qualified: false, financial_release_eligible: false });
}

// Full M input must come from the private compiler plan. The artifact retains
// quarantine identity even for positive C/S; no normal root is reused.
export function buildClaimMonthPhaseProofProgram(raw, phaseProfileReceipt, isolatedPlan, capturedTools = null, baselineReceipt = null) {
    // BUILD adapter only. Namespace-owned opaque capabilities are never
    // replaced by data/booleans, and cannot be used in an ambient or financial
    // host. This is not a product/runtime callback or accepting authority.
    const api = capturedTools ?? { assertClaimMonthIsolatedProgram, sealClaimMonthIsolatedLowering,
        admitClaimMonthIsolatedProof, admitArtifact, phaseCompositionCommitment };
    const row = api.assertClaimMonthIsolatedProgram(isolatedPlan, raw, phaseProfileReceipt);
    const data = decodeClaimMonthProfile(row.source);
    const selector = { fact_key: data.fact_key };
    const commitment = api.phaseCompositionCommitment(phaseProfileReceipt);
    const baseline = lowerPhaseProofProgram({ derivation: row.baselineAccess.projectDerivationProgram(selector, phaseProfileReceipt).input,
        proof: row.baselineAccess.projectProofProgram(selector).input }, phaseProfileReceipt, null, null, commitment);
    const expected = api.sealClaimMonthIsolatedLowering(isolatedPlan, baseline.source, baselineReceipt);
    const built = lowerPhaseProofProgram(raw, phaseProfileReceipt, null, { data, source: row.source }, commitment);
    const artifactReceipt = api.admitArtifact({ manifestBytes: Buffer.from(built.manifest), expectedRoot: built.artifact_root,
        entries: [{ path: 'bundle.js', bytes: Buffer.from(built.source) },
            { path: built.profileInput.path, bytes: Buffer.from(built.profileInput.source) },
            { path: built.qualificationInput.path, bytes: Buffer.from(built.qualificationInput.source) }] });
    const isolatedProofReceipt = api.admitClaimMonthIsolatedProof(isolatedPlan, expected, artifactReceipt);
    return Object.freeze({ ...built, artifactReceipt, isolatedProofReceipt, authorship_program_conformance: true,
        baselineSource: baseline.source, loweringExpectation: expected });
}

export function buildPhaseAssertionFaultProgram(raw, phaseProfileReceipt, predicateId) {
    if (typeof predicateId !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(predicateId)) fail('fault_target');
    return lowerPhaseProofProgram(raw, phaseProfileReceipt, predicateId);
}

function lowerPhaseProofProgram(raw, phaseProfileReceipt, predicateId, qualification = null, capturedCommitment = null, selectedDay = null) {
    let input; try { input = copyData(raw); } catch { fail('input'); }
    fields(input, ['derivation', 'proof']);
    const profile = capturedCommitment ?? phaseCompositionCommitment(phaseProfileReceipt);
    const derivation = buildScalarProofProgram(input.derivation, 'derivation');
    const proof = selectedDay ? lowerScalarProofProgram(input.proof, 'proof', null, null, selectedDay)
        : qualification ? lowerScalarProofProgram(input.proof, 'proof', null, qualification.data)
        : predicateId === null ? buildScalarProofProgram(input.proof)
        : buildScalarAssertionFaultProgram(input.proof, predicateId);
    const source = (selectedDay ? `/* selected-event-day-path/v1 ${selectedDay.variant} ${selectedDay.precommit_hash} */\n` : '')
        + `/* phase-profile ${profile.sha256}; registry ${profile.registry_sha256} */\n`
        + `(function(operands){'use strict';if(operands.phase==="derivation")return (${derivation.source})(operands);`
        + `if(operands.phase==="proof")return (${proof.source})(operands);throw new Error('proof_program_phase');})`;
    validateGuestBundle(source);
    const sources = new Map();
    for (const [phase, program] of [['derivation', derivation], ['proof', proof]]) for (const row of program.sourceHashes) {
        const name = row.path === 'provenance/program.js' ? `provenance/${phase}-program.js` : row.path;
        if (sources.has(name) && sources.get(name).sha256 !== row.sha256) fail('phase_source_mismatch');
        sources.set(name, { path: name, sha256: row.sha256 });
    }
    sources.set(profile.path, { path: profile.path, sha256: profile.sha256 });
    const qualificationInput = qualification ? { path: QUALIFICATION_PATH, source: qualification.source,
        sha256: `sha256:${createHash('sha256').update(qualification.source, 'utf8').digest('hex')}`, data: qualification.data } : null;
    if (qualificationInput) sources.set(qualificationInput.path, { path: qualificationInput.path, sha256: qualificationInput.sha256 });
    const sourceHash = `sha256:${createHash('sha256').update(source, 'utf8').digest('hex')}`;
    const manifest = canonicalValue({ format: 'financasbot.provenance.artifact', version: 1, kind: 'proof', entry: 'bundle.js',
        files: [{ path: 'bundle.js', media_type: 'text/javascript', sha256: sourceHash },
            { path: profile.path, media_type: 'application/json', sha256: profile.sha256 },
            ...(qualificationInput ? [{ path: qualificationInput.path, media_type: 'application/json', sha256: qualificationInput.sha256 }] : [])] });
    return Object.freeze({ stage: 'phase_proof_program_candidate_only', executable: false, source,
        manifest, artifact_root: `sha256:${createHash('sha256').update(manifest, 'utf8').digest('hex')}`,
        predicateCount: proof.predicateCount, derivationPredicateCount: derivation.predicateCount,
        profileInput: profile,
        ...(qualificationInput ? { qualificationInput, profile_witness_qualified: false, financial_release_eligible: false } : {}),
        assertionSites: Object.freeze([...derivation.assertionSites, ...proof.assertionSites]),
        negative_witness_only: qualification !== null || predicateId !== null,
        sourceHashes: Object.freeze([...sources.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) });
}
