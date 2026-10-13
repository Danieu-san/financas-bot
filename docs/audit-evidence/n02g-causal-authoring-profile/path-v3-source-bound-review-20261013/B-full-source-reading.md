# Fronteira B — programas/capabilities/effects, fontes integrais

CODE cf6e43cbaa7c378f2b64590c50d0818700a3bdd0. Nenhum veredito ou autoridade por esta entrega.

## scripts/agent/lowerNextProofProgram.mjs

SHA-256 d141273f2156bab19392c66c2cca660f0f196f7d5b5af4721ac595307aa5cab4; Git blob 3b7634b45f893dfc163dd6832357a87188849261; bytes 44572.

```javascript
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
```

## scripts/agent/nextProvenanceGuestProfile.js

SHA-256 ea14fe64e52c9ec5aa06336a31e281ec7b87bbeb239fde4d5385d2342f6fc8de; Git blob a40be3b427b2e8a10593e5df728238f6d959fc8c; bytes 1989.

```javascript
'use strict';

// BUILD-TIME grammar restriction. Acorn remains dev-only. This is deliberately
// not an authority/capability analyzer and does not execute the supplied text.
const { parse } = require('acorn');
const { EXECUTION_PROFILE } = require('../../src/next/provenance/executionProfile');
const fail = code => { throw new Error(`guest_profile_${code}_invalid`); };

function validateGuestBundle(source) {
    if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > 8 * 1024 * 1024) fail('source');
    let ast;
    try {
        ast = parse(source, { ecmaVersion: EXECUTION_PROFILE.guest.ecma_version,
            sourceType: EXECUTION_PROFILE.guest.source_type });
    } catch { fail('syntax'); }
    const expression = ast.body[0]?.expression;
    if (ast.body.length !== 1 || ast.body[0].type !== 'ExpressionStatement'
        || expression?.type !== 'FunctionExpression' || expression.params.length !== 1
        || expression.params[0].type !== 'Identifier'
        || expression.params[0].name !== EXECUTION_PROFILE.guest.parameter) fail('entry');
    const pending = [expression];
    while (pending.length) {
        const node = pending.pop();
        if (node.type === 'ImportExpression' || node.type === 'ImportDeclaration'
            || node.type === 'MetaProperty' && node.meta.name === 'import') fail('module');
        if (node.async === true || node.generator === true || node.await === true
            || node.type === 'AwaitExpression' || node.type === 'YieldExpression') fail('async');
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) {
                for (const child of value) if (child && typeof child.type === 'string') pending.push(child);
            } else if (value && typeof value === 'object' && typeof value.type === 'string') pending.push(value);
        }
    }
    return Object.freeze({ stage: 'guest_grammar_only', executable: false, source });
}

module.exports = { validateGuestBundle };
```

## scripts/agent/pathCapabilityEffectContract.mjs

SHA-256 0c05ebf16775639a28ee19b6629dd855865f5000ee23fb3006fbeaf5305907c5; Git blob b28e78de3f3bf2ef0a2c6d698c4d6c0b40d1d4b7; bytes 25714.

```javascript
// Finite reference for EXISTING normal host capabilities. The full factory
// bytes and every exposed method are retained before compilation. This is a
// declared shared normal foundation, not proof that a guest receiver has that
// provenance, a value-flow solver, reviewed TCB, or consumer-absence evidence.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { parse } from 'acorn';
import { canonicalValue, freezeDeep } from '../../src/next/kernel/canonicalValue.js';
import { copyData } from '../../src/next/provenance/observationContract.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const files = ['src/next/provenance/instrumentedAccess.js', 'src/next/provenance/graphCompiler.js',
    'src/next/provenance/claimContext.js'];
const seals = new WeakMap(), childSeals = new WeakMap();
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const fail = code => { throw new Error('path_capability_reference_' + code); };
function fields(raw, names) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== names.length || names.some(name =>
        !d[name]?.enumerable || !Object.hasOwn(d[name], 'value'))) fail('input');
    return Object.fromEntries(names.map(name => [name, d[name].value]));
}
function sourcesNow() {
    return files.map(file => {
        const bytes = fs.readFileSync(path.join(root, file));
        const source = bytes.toString('utf8');
        if (bytes.length > 8 * 1024 * 1024 || !Buffer.from(source, 'utf8').equals(bytes)) fail('source_utf8');
        return { path: file, source, sha256: sha(bytes) };
    });
}
const rule = (returns, operations = [], callback = null) => ({ returns,
    observation_operations: operations, callback,
    effect_scope: 'shared_normal_capability_contract_not_call_provenance' });
const iterator = { next: rule('iterator_packet_scalar_or_handle', ['next']),
    return: rule('closed_iterator_packet', ['return']), '@@iterator': rule('same_iterator', ['reuse_iterator']) };
const rules = {
    node: {
        civilDate: rule('pinned_civil_date_scalar', ['get', 'civil_date']),
        identity: rule('admitted_root_identity_scalar', ['node_identity']),
        follow: rule('root_node_by_admitted_edge', ['traverse']),
        followMember: rule('root_node_by_admitted_edge', ['traverse']),
        traverse: rule('root_node_by_admitted_edge', ['traverse']),
        get: rule('absent_or_scalar_or_child_handle_by_admitted_shape', ['get']),
        has: rule('presence_boolean', ['has']),
        keys: rule('keys_sequence_handle', ['keys']),
        length: rule('cardinality_scalar', ['length']),
        at: rule('absent_or_scalar_or_child_handle_by_admitted_shape', ['at']),
        includes: rule('scalar_membership_boolean', ['includes']),
        '@@iterator': rule('node_iterator', ['iterate'])
    },
    node_iterator: iterator,
    node_set: {
        length: rule('cardinality_scalar', ['length']), at: rule('member_node_or_absent', ['at']),
        includes: rule('alias_membership_boolean', ['includes']),
        select: rule('ordered_selected_node_set', ['select_start', 'at', 'select_member', 'select_return'],
            'each_member_node_and_index_boolean_decision_no_raw_payload'),
        '@@iterator': rule('set_iterator', ['iterate'])
    },
    set_iterator: { ...iterator, next: rule('iterator_packet_member_node_or_done', ['next']) },
    derived_parent: { traverse: rule('admitted_derived_parent_root', ['traverse']),
        revoke: rule('revocation_no_guest_payload'), assertHealthy: rule('sticky_health_or_throw') },
    proof_operands: {
        node: rule('admitted_named_root_node'), claim: rule('claim_context_root'),
        set: rule('admitted_named_node_set'),
        select: rule('ordered_selected_node_set', [], 'member_node_and_index_boolean_normal_set_select'),
        edge: rule('admitted_material_or_derived_root', ['traverse']),
        resolveReference: rule('admitted_material_root', ['traverse']),
        memberEdge: rule('admitted_material_root', ['node_identity', 'get', 'traverse']),
        fieldDescriptor: rule('admitted_non_material_excluding_descriptor'),
        operator: rule('admitted_operator_descriptor'), material: rule('admitted_material_descriptor'),
        window: rule('admitted_authored_window_descriptor'),
        revoke: rule('revocation_no_guest_payload'), assertHealthy: rule('sticky_health_or_throw')
    }
};
function propertyName(property) {
    if (property.type !== 'Property' || property.kind !== 'init') fail('surface_property');
    if (!property.computed) return property.key.type === 'Identifier' ? property.key.name : property.key.value;
    const key = property.key;
    if (key.type === 'MemberExpression' && !key.computed && key.object.type === 'Identifier'
        && key.object.name === 'Symbol' && key.property.name === 'iterator') return '@@iterator';
    fail('surface_computed_property');
}
function children(node) {
    return Object.entries(node).flatMap(([key, value]) => ['start', 'end'].includes(key) ? [] :
        Array.isArray(value) ? value.filter(item => item?.type) : value?.type ? [value] : []);
}
function extractSurfaces(row) {
    const ast = parse(row.source, { ecmaVersion: 2022 });
    const found = [], declarations = new Map();
    function walk(node, stack = [], parent = null) {
        if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) {
            let name = node.id?.name;
            if (!name && parent?.type === 'Property') name = propertyName(parent);
            if (!name && parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier') name = parent.id.name;
            stack = [...stack, name ?? '<anonymous>'];
            if (node.type === 'FunctionDeclaration') declarations.set(stack.join('/'), node);
        }
        const interfaceCall = node.type === 'CallExpression' && node.callee.type === 'Identifier'
            && node.callee.name === 'frozenInterface';
        const proofCall = node.type === 'CallExpression' && node.callee.type === 'MemberExpression'
            && !node.callee.computed && node.callee.object.name === 'Object' && node.callee.property.name === 'freeze'
            && stack.at(-1) === 'openProof' && node.arguments[0]?.type === 'ObjectExpression'
            && node.arguments[0].properties.some(p => !p.computed && p.key?.name === 'node');
        if (interfaceCall || proofCall) {
            if (node.arguments.length !== 1 || node.arguments[0].type !== 'ObjectExpression') fail('surface_form');
            const scope = stack.join('/');
            const kind = proofCall ? 'proof_operands' : ({
                'createInstrumentedAccess/handle': 'node',
                'createInstrumentedAccess/handle/iterator': 'node_iterator',
                'createNodeSetAccess/view': 'node_set',
                'createNodeSetAccess/view/iterator': 'set_iterator',
                createDerivedParentAccess: 'derived_parent'
            })[scope];
            if (!kind || found.some(item => item.kind === kind)) fail('unclassified_surface');
            found.push({ kind, scope, object: node.arguments[0], at: node.start });
        }
        for (const child of children(node)) walk(child, stack, node);
    }
    walk(ast);
    return found.map(({ kind, scope, object, at }) => {
        const names = object.properties.map(propertyName);
        if (new Set(names).size !== names.length || [...names].sort().join(',') !== Object.keys(rules[kind]).sort().join(','))
            fail('whole_surface_methods:' + kind);
        return { kind, factory_path: row.path, factory_sha256: row.sha256, lexical_scope: scope, at,
            methods: object.properties.map((property, index) => {
                const value = property.value;
                const definition = value.type === 'Identifier' ? declarations.get(scope + '/' + value.name) : value;
                if (!definition || !['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(definition.type))
                    fail('method_definition:' + kind + ':' + names[index]);
                const source = row.source.slice(definition.start, definition.end);
                return { name: names[index], source, source_sha256: sha(source),
                    exposed_property_sha256: sha(row.source.slice(property.start, property.end)), rule: rules[kind][names[index]] };
            }) };
    });
}
export function capturePathNormalCapabilityReference(...args) {
    // Construction is trusted BUILD, not a caller-controlled contract selector.
    if (args.length) fail('caller_reference');
    const sources = sourcesNow();
    const surfaces = sources.flatMap(extractSurfaces);
    if (surfaces.length !== Object.keys(rules).length || new Set(surfaces.map(s => s.kind)).size !== surfaces.length)
        fail('whole_surface_inventory');
    const data = freezeDeep({ sources, surfaces,
        reference_scope: 'normal_factory_definitions_and_declared_effects_not_guest_receiver_provenance',
        surface_scope: 'instrumented_transport_and_snapshot_proof_not_child_guest_ABI',
        transitive_BUILD_closure_complete: false, guest_call_provenance_complete: false,
        value_flow_proof_complete: false, executable_consumer_absence_proved: false });
    const reference = freezeDeep({ stage: 'path_v3_normal_capability_reference_precompile',
        reference_sha256: sha(canonicalValue(data)), source_count: sources.length,
        surface_count: surfaces.length, method_count: surfaces.reduce((n, s) => n + s.methods.length, 0),
        shared_normal_foundation: true, independent_semantics_proof: false,
        guest_call_provenance_complete: false, value_flow_proof_complete: false,
        executable_consumer_absence_proved: false, validation_tcb_complete: false,
        qualified: false, semantic_mutation_credit: 0 });
    seals.set(reference, data);
    return reference;
}
export function readPathNormalCapabilityReference(raw) {
    const { reference } = fields(raw, ['reference']);
    const data = seals.get(reference);
    if (!data) fail('origin');
    return data;
}
export function verifyPathNormalCapabilityReference(raw) {
    const { reference, sources } = fields(raw, ['reference', 'sources']);
    const data = readPathNormalCapabilityReference({ reference });
    if (!Array.isArray(sources) || types.isProxy(sources) || Object.getPrototypeOf(sources) !== Array.prototype) fail('sources');
    const d = Object.getOwnPropertyDescriptors(sources);
    if (!d.length || !Object.hasOwn(d.length, 'value') || d.length.value !== data.sources.length
        || Reflect.ownKeys(d).length !== data.sources.length + 1) fail('sources');
    for (let index = 0; index < data.sources.length; index++) {
        if (!d[index]?.enumerable || !Object.hasOwn(d[index], 'value')) fail('sources');
        const row = fields(d[index].value, ['path', 'source', 'sha256']);
        const expected = data.sources[index];
        if (row.path !== expected.path || typeof row.source !== 'string' || row.source !== expected.source
            || row.sha256 !== expected.sha256 || sha(row.source) !== expected.sha256) fail('source_conformance');
    }
    return freezeDeep({ source_conformance: true, reference_sha256: reference.reference_sha256,
        guest_call_provenance_complete: false, value_flow_proof_complete: false,
        executable_consumer_absence_proved: false, qualified: false, semantic_mutation_credit: 0 });
}
export function recheckPathNormalCapabilityReference(raw) {
    const { reference } = fields(raw, ['reference']);
    return verifyPathNormalCapabilityReference({ reference, sources: sourcesNow() });
}
export function verifyPathNormalCapabilityBuildBinding(raw) {
    const { reference, sourceHashes } = fields(raw, ['reference', 'sourceHashes']);
    const data = readPathNormalCapabilityReference({ reference });
    const hashes = copyData(sourceHashes);
    if (!Array.isArray(hashes) || hashes.length > 512) fail('BUILD_sources');
    const seen = new Set();
    for (const row of hashes) {
        if (!row || Object.keys(row).sort().join(',') !== 'path,sha256' || typeof row.path !== 'string'
            || typeof row.sha256 !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(row.sha256)
            || seen.has(row.path)) fail('BUILD_sources');
        seen.add(row.path);
    }
    for (const source of data.sources) {
        const logicalPath = source.path.slice('src/next/'.length);
        if (hashes.find(row => row.path === logicalPath)?.sha256 !== source.sha256) fail('BUILD_source_binding');
    }
    return freezeDeep({ normal_capability_source_conformance: true,
        normal_capability_reference_sha256: reference.reference_sha256,
        guest_call_provenance_complete: false, value_flow_proof_complete: false,
        executable_consumer_absence_proved: false, qualified: false, semantic_mutation_credit: 0 });
}

// This finite ABI projection reads the normal CHILD definition, not a mock,
// runtime observation or caller-provided authority. Its construction sites and
// full bytes are bound; neither conditional dominance nor guest flow is inferred.
const childFile = 'src/next/provenance/executionHostChild.cjs';
const childRules = {
    child_proof_operands: Object.fromEntries(['node', 'claim', 'set', 'select', 'resolveReference', 'memberEdge', 'edge']
        .map(name => [name, rules.proof_operands[name]])),
    child_derivation_guard: { node: rule('admitted_derivation_root'), claim: rule('claim_context_root'),
        set: rule('selected_observed_set_or_admitted_input_set_facade'),
        edge: rule('admitted_material_root', ['traverse']), edgeTargetInSet: rule('admitted_input_population_membership_boolean') },
    guard_input_set: { length: rule('admitted_input_roster_cardinality_without_observation'),
        at: rule('admitted_member_node_or_throw'), '@@iterator': rule('guard_set_iterator') },
    guard_set_iterator: { next: rule('iterator_packet_member_node_or_done'), return: rule('closed_iterator_packet'),
        '@@iterator': rule('same_iterator') },
    derivation_selected_set_override: { select: rule('normal_observed_selected_set', [],
        'normal_member_node_and_index_boolean_decision_records_selected_names') }
};
function childSourceNow() {
    const bytes = fs.readFileSync(path.join(root, childFile)), source = bytes.toString('utf8');
    if (bytes.length > 8 * 1024 * 1024 || !Buffer.from(source).equals(bytes)) fail('child_source_utf8');
    return { path: childFile, source, sha256: sha(bytes) };
}
function childProjection(row) {
    const definitions = new Map(), surfaces = [], roles = [], excluded = [];
    const isFunction = node => ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node?.type);
    const member = (node, object, property) => node?.type === 'MemberExpression' && !node.computed
        && node.object?.type === 'Identifier' && node.object.name === object && node.property?.name === property;
    function descriptorValue(property) {
        const names = property.value?.type === 'ObjectExpression' ? property.value.properties.map(propertyName) : [];
        if ([...names].sort().join(',') !== 'enumerable,value') fail('child_descriptor');
        const enumerable = property.value.properties.find(p => propertyName(p) === 'enumerable').value;
        if (enumerable.type !== 'Literal' || enumerable.value !== true) fail('child_descriptor');
        return property.value.properties.find(p => propertyName(p) === 'value').value;
    }
    function surface(kind, object, scope, descriptors = false) {
        if (surfaces.some(s => s.kind === kind) || object?.type !== 'ObjectExpression') fail('child_surface');
        const data = [], methods = [];
        for (const property of object.properties) {
            const name = propertyName(property), value = descriptors ? descriptorValue(property) : property.value;
            if (name === 'phase') {
                if (value.type !== 'Literal' || value.value !== (kind === 'child_proof_operands' ? 'proof' : 'derivation'))
                    fail('child_phase');
                data.push({ name, value: value.value }); continue;
            }
            methods.push({ name, property, value });
        }
        if (methods.map(m => m.name).sort().join(',') !== Object.keys(childRules[kind]).sort().join(','))
            fail('child_surface_methods:' + kind);
        surfaces.push({ kind, scope, data, methods });
    }
    function walk(node, stack = [], parent = null) {
        if (isFunction(node)) {
            const name = node.id?.name ?? (parent?.type === 'VariableDeclarator' ? parent.id.name :
                parent?.type === 'Property' ? propertyName(parent) : '<anonymous>');
            stack = [...stack, name];
            if (node.id || parent?.type === 'VariableDeclarator') definitions.set(stack.join('/'), node);
        }
        const scope = stack.join('/');
        if (node.type === 'CallExpression' && member(node.callee, 'Object', 'defineProperties')
            && node.arguments[0]?.name === 'operands') {
            if (node.arguments.length !== 2 || node.arguments[1].type !== 'ObjectExpression') fail('child_properties');
            const names = node.arguments[1].properties.map(propertyName);
            if (names.includes('phase')) surface('child_proof_operands', node.arguments[1], scope, true);
            else {
                if ([...names].sort().join(',') !== 'assertion,qualification' || excluded.length) fail('child_extension');
                for (const property of node.arguments[1].properties) {
                    descriptorValue(property);
                    excluded.push({ name: propertyName(property), source: row.source.slice(property.start, property.end),
                        authority: 'excluded_profile_extension_not_general_PATH_v3_authority' });
                }
            }
        }
        if (node.type === 'CallExpression' && member(node.callee, 'Object', 'defineProperty')
            && node.arguments[0]?.name === 'operands') {
            if (node.arguments.length !== 3 || node.arguments[2]?.type !== 'ObjectExpression') fail('child_role');
            const slot = node.arguments[1], names = node.arguments[2].properties.map(propertyName);
            if (!slot || slot.type !== 'MemberExpression' || slot.computed || slot.property.name !== 'role'
                || !['group', 'operand', 'set'].includes(slot.object.name) || [...names].sort().join(',') !== 'enumerable,value') fail('child_role');
            const enumerable = node.arguments[2].properties.find(p => propertyName(p) === 'enumerable').value;
            if (enumerable.type !== 'Literal' || enumerable.value !== true) fail('child_role_descriptor');
            const value = node.arguments[2].properties.find(p => propertyName(p) === 'value').value;
            let kind;
            if (member(value.callee, 'access', 'handle') && value.arguments.length === 1
                && member(value.arguments[0], slot.object.name, 'alias'))
                kind = slot.object.name === 'group' ? 'direct_group_root' : slot.object.name === 'operand' ? 'direct_operand_root' : null;
            else if (value.type === 'Identifier' && value.name === 'handle' && slot.object.name === 'set') kind = 'node_set_role';
            else if (member(value.callee, 'control', 'traverse') && value.arguments.length === 1
                && member(value.arguments[0], 'group', 'edgeId') && slot.object.name === 'group') kind = 'parent_role_root';
            if (!kind || roles.some(r => r.kind === kind)) fail('child_role_form');
            const source = row.source.slice(node.start, node.end);
            roles.push({ kind, slot: row.source.slice(slot.start, slot.end), source, source_sha256: sha(source) });
        }
        if (node.type === 'CallExpression' && node.callee.name === 'harden' && parent?.type === 'VariableDeclarator'
            && parent.id.name === 'guardOperands') surface('child_derivation_guard', node.arguments[0], scope);
        if (node.type === 'CallExpression' && member(node.callee, 'Object', 'freeze')) {
            if (scope === 'run/inputSet' && parent?.type === 'VariableDeclarator' && parent.id.name === 'view')
                surface('guard_input_set', node.arguments[0], scope);
            else if (scope === 'run/inputSet/@@iterator' && node.arguments[0]?.type === 'ObjectExpression')
                surface('guard_set_iterator', node.arguments[0], scope);
        }
        if (node.type === 'CallExpression' && member(node.callee, 'Object', 'create')
            && member(node.arguments[0], 'control', 'handle')) {
            if (node.arguments.length !== 2 || node.arguments[1].type !== 'ObjectExpression'
                || node.arguments[1].properties.map(propertyName).join(',') !== 'select') fail('child_selected_set');
            const property = node.arguments[1].properties[0], descriptor = property.value;
            if (descriptor?.type !== 'ObjectExpression' || descriptor.properties.map(propertyName).join(',') !== 'value')
                fail('child_selected_set');
            surface('derivation_selected_set_override', { ...node.arguments[1], properties: [{ ...property,
                value: descriptor.properties[0].value }] }, scope);
        }
        for (const child of children(node)) walk(child, stack, node);
    }
    walk(parse(row.source, { ecmaVersion: 2022 }));
    if (surfaces.length !== Object.keys(childRules).length || roles.length !== 4 || excluded.length !== 2) fail('child_whole_inventory');
    return { surfaces: surfaces.map(({ kind, scope, data, methods }) => ({ kind, scope, data,
        methods: methods.map(({ name, property, value }) => {
            const definition = value.type === 'Identifier' ? definitions.get(scope + '/' + value.name) : value;
            if (!isFunction(definition)) fail('child_method:' + kind + ':' + name);
            const source = row.source.slice(definition.start, definition.end);
            return { name, source, source_sha256: sha(source), exposed_property_sha256: sha(row.source.slice(property.start, property.end)),
                rule: childRules[kind][name] };
        }) })), role_constructions: roles, excluded_profile_extensions: excluded };
}
export function capturePathNormalChildABIReference(raw) {
    const { normalReference } = fields(raw, ['normalReference']);
    readPathNormalCapabilityReference({ reference: normalReference });
    const source = childSourceNow();
    const data = freezeDeep({ source, ...childProjection(source),
        normal_factory_reference_sha256: normalReference.reference_sha256,
        scope: 'ordinary_normal_child_construction_definitions_not_mutation_dominance_or_guest_flow_proof',
        guest_call_provenance_complete: false, executable_consumer_absence_proved: false });
    const reference = freezeDeep({ stage: 'path_v3_child_ABI_definition_precompile', reference_sha256: sha(canonicalValue(data)),
        source_sha256: source.sha256, shared_normal_foundation: true, profile_extension_authority: false,
        guest_call_provenance_complete: false, value_flow_proof_complete: false, executable_consumer_absence_proved: false,
        validation_tcb_complete: false, qualified: false, semantic_mutation_credit: 0 });
    childSeals.set(reference, { normalReference, data }); return reference;
}
export function readPathNormalChildABIReference(raw) {
    const { reference } = fields(raw, ['reference']);
    const stored = childSeals.get(reference); if (!stored) fail('child_origin'); return stored.data;
}
export function recheckPathNormalChildABIReference(raw) {
    const { reference } = fields(raw, ['reference']);
    const data = readPathNormalChildABIReference({ reference }), source = childSourceNow();
    if (source.source !== data.source.source || source.sha256 !== data.source.sha256) fail('child_source_conformance');
    return reference;
}
export function verifyPathNormalChildABIBuildBinding(raw) {
    const { reference, sourceHashes } = fields(raw, ['reference', 'sourceHashes']);
    const stored = childSeals.get(reference); if (!stored) fail('child_origin');
    const hashes = copyData(sourceHashes);
    if (!Array.isArray(hashes) || hashes.length > 512 || hashes.some(row => !row || Object.keys(row).sort().join(',') !== 'path,sha256'
        || typeof row.path !== 'string' || typeof row.sha256 !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(row.sha256))
        || new Set(hashes.map(row => row.path)).size !== hashes.length) fail('child_BUILD_sources');
    const normal = readPathNormalCapabilityReference({ reference: stored.normalReference });
    for (const source of [stored.data.source, ...normal.sources.filter(row => row.path.endsWith('/instrumentedAccess.js'))]) {
        const logical = source.path === childFile ? 'provenance/executionHostChild.js' : source.path.slice('src/next/'.length);
        if (hashes.find(row => row.path === logical)?.sha256 !== source.sha256) fail('child_BUILD_source_binding');
    }
    return freezeDeep({ normal_child_abi_source_conformance: true, normal_child_abi_reference_sha256: reference.reference_sha256,
        guest_call_provenance_complete: false, value_flow_proof_complete: false, executable_consumer_absence_proved: false,
        qualified: false, semantic_mutation_credit: 0 });
}
```

## scripts/agent/pathExecutableClosureContract.mjs

SHA-256 7facc69858c80a5fb07522a16c2b51e04935c4675f9924ebe37de478e2712b21; Git blob ccbadb5ca02def67c508fb234f744282e76f0b44; bytes 45988.

```javascript
// External, read-only census of real closed guest bytes. This finite BUILD
// grammar binds modules/imports/lexical references, NOT runtime value-flow,
// semantic equivalence, consumer absence, independent execution or reviewed TCB.
import { parse } from 'acorn';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import path from 'node:path';
import { copyData } from '../../src/next/provenance/observationContract.js';
import { canonicalValue } from '../../src/next/kernel/canonicalValue.js';

const cache = new Map(), moduleCache = new Map();
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const fail = code => { throw new Error('path_executable_closure_' + code); };
// Only internally constructed/parser/copied data enters this helper. Cached
// children are already recursively frozen; caller objects never enter here.
function freezeDeep(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) freezeDeep(child);
        Object.freeze(value);
    }
    return value;
}
const intrinsic = new Set(['Object', 'Array', 'Number', 'String', 'Boolean', 'Math', 'JSON',
    'Map', 'Set', 'WeakMap', 'WeakSet', 'Uint8Array', 'Uint32Array', 'Int32Array',
    'RegExp', 'Error', 'TypeError', 'RangeError', 'Symbol', 'Reflect', 'undefined', 'NaN', 'Infinity']);
function fields(raw, names) {
    if (!raw || typeof raw !== 'object' || types.isProxy(raw) || Array.isArray(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== names.length || names.some(name =>
        !d[name]?.enumerable || !Object.hasOwn(d[name], 'value'))) fail('input');
    return Object.fromEntries(names.map(name => [name, d[name].value]));
}
function children(node) {
    return Object.entries(node).flatMap(([key, value]) => key === 'start' || key === 'end' ? [] :
        Array.isArray(value) ? value.filter(item => item?.type).map(item => [key, item]) :
            value?.type ? [[key, value]] : []);
}
function clean(node) {
    if (Array.isArray(node)) return node.map(clean);
    if (!node || typeof node !== 'object') return node;
    return Object.fromEntries(Object.entries(node).filter(([key]) => !['start', 'end', 'raw'].includes(key))
        .map(([key, value]) => [key, clean(value)]));
}
const expression = source => {
    const program = parse(source, { ecmaVersion: 2022 });
    if (program.body.length !== 1 || program.body[0].type !== 'ExpressionStatement') fail('whole_expression');
    return program.body[0].expression;
};
function remember(store, key, value, limit) {
    if (store.size >= limit) store.delete(store.keys().next().value);
    store.set(key, value); return value;
}
function moduleInventory(source, logicalPath) {
    const key = logicalPath + ':' + sha(source);
    if (moduleCache.has(key)) return moduleCache.get(key);
    const fn = expression('(function(require,module,exports){\n' + source + '\n})');
    const scopes = new WeakMap(), declared = new WeakSet(), declarationBindings = new WeakMap(),
        imports = [], importedSymbols = [], calls = [], aliases = [], references = [], callSites = [],
        origins = new Map(), writes = new Set(), memberWrites = new Set(), exportTerms = [], functions = [], effectSites = [];
    let scopeId = 0;
    const makeScope = (parent, isFunction = false) => ({ parent, isFunction, id: scopeId++, names: new Map() });
    const outer = makeScope(null, true);
    const declare = (pattern, scope, kind) => {
        if (!pattern) return;
        if (pattern.type === 'Identifier') {
            declared.add(pattern);
            if (!scope.names.has(pattern.name)) scope.names.set(pattern.name, scope.id + '/' + pattern.name);
            if (kind === 'parameter' || kind === 'factory') origins.set(scope.names.get(pattern.name),
                [{ kind: kind === 'parameter' ? 'parameter' : 'factory_parameter', name: pattern.name }]);
            if (pattern.name === 'require' && kind !== 'factory') fail('require_shadow');
        } else if (pattern.type === 'RestElement') declare(pattern.argument, scope, kind);
        else if (pattern.type === 'AssignmentPattern') declare(pattern.left, scope, kind);
        else if (pattern.type === 'ArrayPattern') pattern.elements.forEach(item => declare(item, scope, kind));
        else if (pattern.type === 'ObjectPattern') pattern.properties.forEach(item =>
            declare(item.type === 'RestElement' ? item.argument : item.value, scope, kind));
        else fail('binding_pattern');
    };
    function prepare(node, scope, root = false) {
        if (node.type === 'FunctionDeclaration') {
            declare(node.id, scope, 'function');
            declarationBindings.set(node, scope.names.get(node.id.name));
        }
        if (['FunctionExpression', 'FunctionDeclaration', 'ArrowFunctionExpression'].includes(node.type)) {
            if (!root) functions.push(node);
            scope = root ? outer : makeScope(scope, true);
            if (node.type !== 'ArrowFunctionExpression') scope.names.set('arguments', scope.id + '/arguments');
            if (node.type === 'FunctionExpression' && node.id) declare(node.id, scope, 'function');
            node.params.forEach(item => declare(item, scope, root ? 'factory' : 'parameter'));
        } else if (['BlockStatement', 'CatchClause', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'SwitchStatement'].includes(node.type))
            scope = makeScope(scope);
        scopes.set(node, scope);
        if (node.type === 'CatchClause') declare(node.param, scope, 'catch');
        if (node.type === 'ClassDeclaration') declare(node.id, scope, 'class');
        if (node.type === 'VariableDeclaration') {
            let target = scope;
            if (node.kind === 'var') while (!target.isFunction) target = target.parent;
            node.declarations.forEach(item => declare(item.id, target, node.kind));
        }
        for (const [, child] of children(node)) prepare(child, scope);
    }
    prepare(fn, outer, true);
    const resolve = (scope, name) => {
        for (let current = scope; current; current = current.parent) if (current.names.has(name)) return current.names.get(name);
        if (intrinsic.has(name)) return 'intrinsic/' + name;
        fail('free_reference:' + logicalPath + ':' + name);
    };
    const origin = (binding, term) => {
        const rows = origins.get(binding) ?? []; rows.push(term); origins.set(binding, rows);
    };
    const propertyName = node => !node.computed && node.property?.type === 'Identifier' ? node.property.name :
        node.property?.type === 'Literal' && typeof node.property.value === 'string' ? node.property.value : null;
    const passiveArgument = node => node && (['Identifier', 'Literal', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)
        || node.type === 'ArrayExpression' && node.elements.every(passiveArgument)
        || node.type === 'ObjectExpression' && node.properties.every(property => property.type === 'Property'
            && property.kind === 'init' && !property.computed && passiveArgument(property.value)));
    // Syntax is only a prerequisite. The linker separately binds Object.freeze
    // to the unmodified intrinsic; no user function or identifier argument is run.
    const passiveFreeze = node => node?.type === 'CallExpression' && !node.optional
        && node.callee.type === 'MemberExpression' && !node.callee.computed && !node.callee.optional
        && node.callee.object.type === 'Identifier' && node.callee.object.name === 'Object'
        && node.callee.property.name === 'freeze' && node.arguments.length === 1
        && ['ObjectExpression', 'ArrayExpression'].includes(node.arguments[0].type)
        && passiveArgument(node.arguments[0]);
    function term(node) {
        if (!node) return { kind: 'uninitialized' };
        if (node.type === 'Identifier') return { kind: 'binding', binding: resolve(scopes.get(node), node.name) };
        if (['FunctionExpression', 'FunctionDeclaration', 'ArrowFunctionExpression'].includes(node.type))
            return { kind: 'local_function', module: logicalPath, function_id: 'function@' + node.start,
                body_sha256: sha(canonicalValue(clean(node))) };
        if (node.type === 'MemberExpression') return { kind: 'member', receiver: term(node.object),
            property: propertyName(node), computed: node.computed, optional: node.optional };
        if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require')
            return { kind: 'import_namespace', specifier: node.arguments[0]?.value };
        if (node.type === 'CallExpression' || node.type === 'NewExpression') return { kind: 'call_result', site: node.start + ':' + node.end };
        if (node.type === 'Literal') return { kind: 'literal',
            value: ['string', 'number', 'boolean'].includes(typeof node.value) || node.value === null ? node.value : null,
            passive_primitive: ['string', 'number', 'boolean'].includes(typeof node.value) || node.value === null,
            syntax_sha256: sha(canonicalValue(clean(node))) };
        if (node.type === 'ObjectExpression') return { kind: 'object', properties: node.properties.map(property =>
            property.type === 'Property' && property.kind === 'init' && !property.computed
                ? { name: property.key.type === 'Identifier' ? property.key.name
                    : ['string', 'number'].includes(typeof property.key.value) ? String(property.key.value) : null,
                    term: term(property.value) }
                : { name: null, term: { kind: 'unclassified_property' } }) };
        if (node.type === 'ArrayExpression') return { kind: 'array', elements: node.elements.map(term) };
        return { kind: 'unclassified_expression', type: node.type, site: node.start };
    }
    function bindPattern(pattern, value) {
        if (pattern.type === 'Identifier') origin(resolve(scopes.get(pattern), pattern.name), value);
        else if (pattern.type === 'ObjectPattern') for (const property of pattern.properties) {
            if (property.type === 'Property' && !property.computed) bindPattern(property.value,
                { kind: 'member', receiver: value,
                    property: property.key.type === 'Identifier' ? property.key.name : property.key.value,
                    computed: false, optional: false });
            else if (property.type === 'RestElement') bindPattern(property.argument, { kind: 'unclassified_rest' });
        } else if (pattern.type === 'AssignmentPattern') bindPattern(pattern.left, { kind: 'unclassified_default' });
        else if (pattern.type === 'ArrayPattern') for (const item of pattern.elements) if (item)
            bindPattern(item, { kind: 'unclassified_array_binding' });
        else if (pattern.type === 'RestElement') bindPattern(pattern.argument, { kind: 'unclassified_rest' });
    }
    function scan(node, parent = null, key = null, owner = null) {
        const scope = scopes.get(node);
        if (functions.includes(node)) owner = 'function@' + node.start;
        // Whole syntactic obligations, including implicit hooks/coercion. This
        // is deliberately not a purity classifier: retaining a site neither
        // executes it nor proves that a receiver, primitive or branch is safe.
        let effectKind = null;
        if (['CallExpression', 'NewExpression'].includes(node.type)) effectKind = 'call';
        else if (node.type === 'MemberExpression') effectKind = 'property_read';
        else if (['AssignmentExpression', 'UpdateExpression'].includes(node.type)
            || node.type === 'UnaryExpression' && node.operator === 'delete') effectKind = 'mutation';
        else if (['BinaryExpression', 'UnaryExpression', 'TemplateLiteral'].includes(node.type)) effectKind = 'coercion';
        else if (['ForOfStatement', 'ForInStatement', 'ArrayPattern'].includes(node.type)) effectKind = 'iteration';
        else if (node.type === 'SpreadElement' || node.type === 'RestElement') effectKind = 'spread';
        else if (node.type === 'ObjectPattern') effectKind = 'destructuring';
        else if (node.type === 'Property' && node.kind !== 'init') effectKind = 'accessor_definition';
        else if (node.type === 'Property' && node.computed) effectKind = 'computed_property';
        else if (['AwaitExpression', 'YieldExpression', 'TaggedTemplateExpression', 'ImportExpression',
            'ClassDeclaration', 'ClassExpression', 'WithStatement'].includes(node.type)) effectKind = 'unsupported_effect_form';
        else if (functions.includes(node) && (node.async || node.generator)) effectKind = 'suspending_function';
        if (effectKind) effectSites.push({ site: node.start + ':' + node.end, kind: effectKind,
            operation: node.type, operator: node.operator ?? null, enclosing_function: owner,
            syntax_sha256: sha(canonicalValue(clean(node))), runtime_effect_proved: false });
        if (node.type === 'Identifier' && !declared.has(node)
            && !(parent?.type === 'MemberExpression' && key === 'property' && !parent.computed)
            && !(parent?.type === 'Property' && key === 'key' && !parent.computed)
            && !(parent?.type === 'MethodDefinition' && key === 'key' && !parent.computed)
            && !(['LabeledStatement', 'BreakStatement', 'ContinueStatement'].includes(parent?.type) && key === 'label')) {
            const binding = resolve(scope, node.name);
            if (node.name === 'require' && !(parent?.type === 'CallExpression' && key === 'callee')) fail('require_alias');
            references.push([node.name, binding, node.start]);
        }
        if (node.type === 'CallExpression' || node.type === 'NewExpression') {
            calls.push([node.type, sha(canonicalValue(clean(node.callee))), node.start]);
            callSites.push({ site: node.start + ':' + node.end, operation: node.type, callee: term(node.callee),
                arguments: node.arguments.map(term), argument_syntax_effect_free: node.arguments.every(passiveArgument),
                passive_freeze_construction: passiveFreeze(node),
                optional: node.optional ?? false, enclosing_function: owner });
            if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
                if (node.optional || node.arguments.length !== 1 || node.arguments[0].type !== 'Literal'
                    || typeof node.arguments[0].value !== 'string') fail('dynamic_import');
                imports.push(node.arguments[0].value);
                if (parent?.type === 'VariableDeclarator' && key === 'init' && parent.id.type === 'ObjectPattern') {
                    for (const property of parent.id.properties) {
                        if (property.type !== 'Property' || property.computed || property.value.type !== 'Identifier')
                            fail('import_binding');
                        const name = property.key.type === 'Identifier' ? property.key.name : property.key.value;
                        if (typeof name !== 'string') fail('import_binding');
                        importedSymbols.push({ specifier: node.arguments[0].value, exported_name: name,
                            local_binding: resolve(scope, property.value.name) });
                    }
                }
            }
        }
        if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init?.type === 'Identifier')
            aliases.push([resolve(scope, node.id.name), resolve(scope, node.init.name)]);
        if (node.type === 'VariableDeclarator') bindPattern(node.id, term(node.init));
        if (node.type === 'FunctionDeclaration') origin(declarationBindings.get(node), term(node));
        if (node.type === 'FunctionExpression' && node.id) origin(resolve(scope, node.id.name), term(node));
        if (['AssignmentExpression', 'UpdateExpression'].includes(node.type)) {
            const assigned = node.type === 'AssignmentExpression' ? node.left : node.argument;
            const mark = pattern => {
                if (pattern.type === 'Identifier') writes.add(resolve(scopes.get(pattern), pattern.name));
                else if (pattern.type === 'MemberExpression') {
                    // The single top-level module.exports declaration is the
                    // export definition, not an unknown post-definition write.
                    if (pattern.object.type === 'Identifier' && pattern.object.name === 'module'
                        && !pattern.computed && pattern.property.name === 'exports') return;
                    let root = pattern.object;
                    while (root.type === 'MemberExpression') root = root.object;
                    if (root.type === 'Identifier') memberWrites.add(resolve(scopes.get(root), root.name));
                } else for (const [, child] of children(pattern)) mark(child);
            };
            mark(assigned);
        }
        if (['ForInStatement', 'ForOfStatement'].includes(node.type) && node.left.type === 'Identifier')
            writes.add(resolve(scopes.get(node.left), node.left.name));
        for (const [childKey, child] of children(node)) scan(child, node, childKey, owner);
    }
    scan(fn);
    // Full boundary census; only the tiny transparent forwarding grammar below
    // can contribute a returned definition. Branches/effects/defaults/loops are
    // retained but NOT solved. No arbitrary JS evaluation or capability seed.
    const transparentValue = node => node && (['Identifier', 'Literal', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)
        || passiveFreeze(node)
        || node.type === 'ArrayExpression' && node.elements.every(passiveArgument)
        || node.type === 'CallExpression' && !node.optional && node.arguments.every(transparentValue)
            && transparentValue(node.callee)
        || node.type === 'ObjectExpression' && node.properties.every(property => property.type === 'Property'
            && property.kind === 'init' && !property.computed && transparentValue(property.value)));
    const functionBoundaries = functions.map(node => {
        const returns = [];
        function walk(current) {
            if (current !== node && functions.includes(current)) return;
            if (current.type === 'ReturnStatement') returns.push({ site: current.start, value: term(current.argument) });
            for (const [, child] of children(current)) walk(child);
        }
        if (node.body.type === 'BlockStatement') walk(node.body);
        else returns.push({ site: node.body.start, value: term(node.body) });
        const statements = node.body.type === 'BlockStatement' ? node.body.body : null;
        const transparent = !node.async && !node.generator && node.params.every(parameter => parameter.type === 'Identifier')
            && (statements ? statements.length > 0 && statements.at(-1).type === 'ReturnStatement'
                && transparentValue(statements.at(-1).argument) && statements.slice(0, -1).every(statement =>
                    statement.type === 'FunctionDeclaration' || statement.type === 'VariableDeclaration'
                    && statement.kind === 'const' && statement.declarations.every(declaration =>
                        declaration.id.type === 'Identifier' && transparentValue(declaration.init)
                        && (declaration.init.type !== 'CallExpression' || passiveFreeze(declaration.init))))
                : transparentValue(node.body));
        return { function_id: 'function@' + node.start, body_sha256: sha(canonicalValue(clean(node))),
            passive_constructor_sites: (statements ? statements.flatMap(statement => statement.type === 'VariableDeclaration'
                ? statement.declarations.map(declaration => declaration.init) : statement.type === 'ReturnStatement'
                    ? [statement.argument] : []) : [node.body]).flatMap(expression => {
                const sites = [];
                function constructors(current) {
                    if (!current || ['FunctionExpression', 'ArrowFunctionExpression'].includes(current.type)) return;
                    if (passiveFreeze(current)) sites.push(current.start + ':' + current.end);
                    for (const [, child] of children(current)) constructors(child);
                }
                constructors(expression); return sites;
            }),
            parameters: node.params.map(parameter => ({ syntax: clean(parameter),
                binding: parameter.type === 'Identifier' ? resolve(scopes.get(node), parameter.name) : null })),
            returns, call_sites: callSites.filter(call => call.enclosing_function === 'function@' + node.start).map(call => call.site),
            transparent_return_grammar: transparent,
            boundary_scope: 'syntactic_returns_and_formals_not_branch_or_runtime_effect_proof' };
    });
    const exports = [];
    let exportAssignments = 0;
    function exported(node) {
        if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression'
            && node.left.object.type === 'Identifier' && node.left.object.name === 'module') {
            if (++exportAssignments !== 1 || !fn.body.body.some(statement =>
                statement.type === 'ExpressionStatement' && statement.expression === node)) fail('nonstatic_exports');
            if (node.left.computed || node.left.property.name !== 'exports' || node.operator !== '='
                || node.right.type !== 'ObjectExpression') fail('module_exports');
            for (const item of node.right.properties) {
                if (item.type !== 'Property' || item.computed || item.kind !== 'init') fail('module_export_key');
                const name = item.key.type === 'Identifier' ? item.key.name : item.key.value;
                if (typeof name !== 'string' || exports.includes(name)) fail('module_export_key');
                exports.push(name);
                exportTerms.push({ name, term: term(item.value) });
            }
        }
        for (const [, child] of children(node)) exported(child);
    }
    exported(fn);
    const result = freezeDeep({ path: logicalPath, source_sha256: sha(source), imports: [...new Set(imports)],
        exports, imported_symbols: importedSymbols, call_site_count: calls.length, references_sha256: sha(canonicalValue(references)),
        callable_origins: [...origins].map(([binding, definitions]) => ({ binding, definitions,
            mutable: writes.has(binding) })), callable_writes: [...writes], member_writes: [...memberWrites],
        export_terms: exportTerms, call_sites: callSites, function_boundaries: functionBoundaries,
        effect_sites: effectSites, effect_sites_sha256: sha(canonicalValue(effectSites)),
        effect_site_scope: 'whole_syntax_including_indirect_hooks_not_purity_or_reachability_proof',
        calls_sha256: sha(canonicalValue(calls)), aliases_sha256: sha(canonicalValue(aliases)),
        lexical_binding_count: scopeId, lexical_reference_count: references.length });
    return remember(moduleCache, key, result, 512);
}
function inspectBundle(fn, source, catalog) {
    if (fn.type !== 'FunctionExpression' || fn.async || fn.generator || fn.id || fn.params.length !== 1 || fn.params[0].name !== 'operands'
        || fn.body.body.length !== 6) fail('loader_shape');
    const body = fn.body.body;
    const factories = body[1]?.declarations?.[0]?.init?.elements;
    const edgeNode = body[2]?.declarations?.[0]?.init;
    const returned = body[5]?.argument;
    const entry = returned?.callee?.object?.arguments?.[0]?.value;
    const exportName = returned?.callee?.property?.value;
    if (!Array.isArray(factories) || factories.length !== catalog.length || !Number.isInteger(entry)
        || entry < 0 || entry >= factories.length || typeof exportName !== 'string'
        || returned.arguments?.[0]?.name !== 'operands' || returned.arguments.length > 17
        || returned.arguments.slice(1).some(node => node.type !== 'Literal'
            || !['string', 'number', 'boolean'].includes(typeof node.value) && node.value !== null)) fail('entry');
    const literal = node => {
        if (node?.type === 'Literal') return node.value;
        if (node?.type === 'ArrayExpression') return node.elements.map(literal);
        fail('edge_literal');
    };
    const links = literal(edgeNode);
    const skeleton = clean(fn);
    skeleton.body.body[1].declarations[0].init.elements = [];
    skeleton.body.body[2].declarations[0].init.elements = [];
    const constants = returned.arguments.slice(1).map(node => JSON.stringify(node.value));
    const expected = expression(`(function(operands){'use strict';const factories=[];const edges=[];const cache=new Map();
function load(index){if(cache.has(index))return cache.get(index);const module={exports:Object.create(null)};
const localRequire=name=>{const edge=edges[index].find(pair=>pair[0]===name);if(!edge)throw new Error('guest_bundle_unresolved');return load(edge[1]);};
factories[index](localRequire,module,module.exports);cache.set(index,module.exports);return module.exports;}
return load(${entry})[${JSON.stringify(exportName)}](operands${constants.length ? ',' + constants.join(',') : ''});})`);
    if (canonicalValue(skeleton) !== canonicalValue(clean(expected))) fail('loader_identity');
    if (!Array.isArray(links) || links.length !== catalog.length) fail('edge_count');
    const modules = factories.map((factory, index) => {
        if (factory.type !== 'FunctionExpression' || factory.async || factory.generator || factory.id
            || factory.params.map(node => node.name).join(',') !== 'require,module,exports') fail('factory');
        const text = source.slice(factory.body.start + 1, factory.body.end - 1);
        if (!text.startsWith('\n') || !text.endsWith('\n')) fail('factory_delimiter');
        const bytes = text.slice(1, -1);
        if (sha(bytes) !== catalog[index].sha256) fail('factory_source_binding');
        return moduleInventory(bytes, catalog[index].path);
    });
    const mapping = new Map(catalog.map((row, index) => [row.path, index]));
    let edgeCount = 0;
    for (let index = 0; index < modules.length; index++) {
        const actual = links[index];
        if (!Array.isArray(actual) || actual.length !== modules[index].imports.length) fail('import_count');
        for (let n = 0; n < actual.length; n++) {
            const pair = actual[n], specifier = modules[index].imports[n];
            if (!specifier.startsWith('./') && !specifier.startsWith('../')) fail('external_import');
            const normalized = path.posix.normalize(path.posix.join(path.posix.dirname(catalog[index].path), specifier));
            const target = mapping.get(normalized.endsWith('.js') ? normalized : normalized + '.js');
            if (!Array.isArray(pair) || pair.length !== 2 || pair[0] !== specifier || pair[1] !== target || target === undefined)
                fail('import_resolution');
            edgeCount++;
            for (const symbol of modules[index].imported_symbols.filter(row => row.specifier === specifier))
                if (!modules[target].exports.includes(symbol.exported_name)) fail('import_export_binding');
        }
    }
    const visiting = new Set(), seen = new Set();
    function visit(index) {
        if (visiting.has(index)) fail('cycle');
        if (seen.has(index)) return;
        visiting.add(index); for (const pair of links[index]) visit(pair[1]);
        visiting.delete(index); seen.add(index);
    }
    visit(entry);
    if (seen.size !== modules.length || !modules[entry].exports.includes(exportName)) fail('unreachable_or_entry_export');
    const linkedModules = linkCallBindings(modules, links);
    const entryLink = linkedModules[entry].export_bindings.find(row => row.name === exportName);
    const targetModule = linkedModules.find(module => module.path === entryLink?.target?.module);
    const boundary = targetModule?.function_boundaries.find(row => row.function_id === entryLink.target.function_id);
    const argumentBindings = boundary && boundary.parameters.length === returned.arguments.length
        && boundary.parameters.every(parameter => parameter.binding !== null)
        ? boundary.parameters.map((parameter, index) => ({ parameter_binding: parameter.binding,
            source: index === 0 ? { kind: 'ordinary_bundle_operands_forwarding' }
                : { kind: 'closed_loader_literal', value: returned.arguments[index].value } })) : null;
    return { entry: catalog[entry].path, export_name: exportName, entry_function: entryLink?.target ?? null,
        entry_argument_bindings: argumentBindings,
        entry_binding_scope: 'exact_closed_loader_formals_not_child_receiver_dominance_proof',
        modules: linkedModules, edge_count: edgeCount };
}
// Finite syntactic callable links, not an interpreter. No branch execution,
// dominance or handle provenance is assumed. Transparent return-only forwarding
// composes exact formal/actual terms; unknown/effectful boundaries stay blocked.
// A complete census includes every UNRESOLVED call; it is not a complete proof.
function linkCallBindings(modules, links) {
    const origins = modules.map(module => new Map(module.callable_origins.map(row => [row.binding, row])));
    const invalidMembers = modules.map(module => new Set(module.member_writes));
    const namespaces = new Set();
    const targetModule = (index, specifier) => links[index].find(pair => pair[0] === specifier)?.[1];
    // Member writes propagate across simple lexical aliases, never across a
    // reassignment merely because two values initially happened to be equal.
    for (let index = 0; index < modules.length; index++) {
        let changed = true;
        while (changed) {
            changed = false;
            for (const row of origins[index].values()) for (const value of row.definitions) {
                if (value.kind !== 'binding') continue;
                if (invalidMembers[index].has(row.binding) || invalidMembers[index].has(value.binding)) {
                    for (const binding of [row.binding, value.binding]) if (!invalidMembers[index].has(binding)) {
                        invalidMembers[index].add(binding); changed = true;
                    }
                }
            }
        }
        for (const binding of invalidMembers[index]) {
            const values = origins[index].get(binding)?.definitions ?? [];
            for (const value of values) if (value.kind === 'import_namespace') {
                const target = targetModule(index, value.specifier); if (target !== undefined) namespaces.add(target);
            }
            if (values.some(value => value.kind === 'factory_parameter' && ['module', 'exports'].includes(value.name)))
                namespaces.add(index);
        }
    }
    function resolve(index, value, seen = new Set(), environment = new Map()) {
        if (seen.size >= 256) return { target: null, reason: 'finite_linkage_bound' };
        if (!value) return { target: null, reason: 'missing_origin' };
        if (value.kind === 'local_function') return { target: value, reason: null };
        if (value.kind === 'binding') {
            const key = index + ':' + value.binding;
            if (seen.has(key)) return { target: null, reason: 'alias_cycle' };
            const next = new Set(seen); next.add(key);
            if (value.binding.startsWith('intrinsic/')) {
                if (modules.some(module => module.callable_writes.includes(value.binding)
                    || module.member_writes.includes(value.binding))
                    || invalidMembers.some(invalid => invalid.has(value.binding)))
                    return { target: null, reason: 'intrinsic_reassigned' };
                return { target: { kind: 'intrinsic', name: value.binding.slice(10) }, reason: null };
            }
            const row = origins[index].get(value.binding);
            if (!row || row.definitions.length !== 1) return { target: null, reason: 'ambiguous_definition' };
            if (row.mutable || invalidMembers[index].has(value.binding)) return { target: null, reason: 'mutable_binding' };
            const actual = environment.get(key);
            return actual ? resolve(actual.index, actual.term, next, actual.environment)
                : resolve(index, row.definitions[0], next, environment);
        }
        if (value.kind === 'import_namespace') {
            const target = targetModule(index, value.specifier);
            if (target === undefined) return { target: null, reason: 'unresolved_import' };
            if (namespaces.has(target)) return { target: null, reason: 'module_namespace_mutated' };
            return { target: { kind: 'module_namespace', module_index: target, module: modules[target].path }, reason: null };
        }
        if (value.kind === 'member') {
            if (value.property === null || value.optional) return { target: null, reason: 'dynamic_member_dispatch' };
            const receiver = resolve(index, value.receiver, seen, environment);
            if (receiver.target?.kind === 'module_namespace') {
                const target = receiver.target.module_index;
                const exported = modules[target].export_terms.find(row => row.name === value.property);
                return exported ? resolve(target, exported.term, seen, environment) : { target: null, reason: 'missing_export' };
            }
            if (receiver.target?.kind === 'object_syntax') {
                const property = receiver.target.properties.find(row => row.name === value.property);
                return property ? resolve(receiver.target.module_index, property.term, seen, receiver.target.environment)
                    : { target: null, reason: 'unknown_object_property' };
            }
            if (receiver.target?.kind === 'intrinsic') return { target: { kind: 'intrinsic_member',
                name: receiver.target.name, property: value.property }, reason: null };
            return { target: null, reason: receiver.reason ?? 'receiver_provenance_unresolved' };
        }
        if (value.kind === 'factory_parameter' && value.name === 'require')
            return { target: { kind: 'closed_loader', module: modules[index].path }, reason: null };
        if (value.kind === 'object') {
            const names = value.properties.map(property => property.name);
            if (names.some(name => name === null || name === '__proto__') || new Set(names).size !== names.length)
                return { target: null, reason: 'non_passive_object_definition' };
            return { target: { kind: 'object_syntax', properties: value.properties, module_index: index, environment }, reason: null };
        }
        if (value.kind === 'call_result') {
            const key = index + ':call@' + value.site;
            if (seen.has(key)) return { target: null, reason: 'recursive_return_dispatch' };
            const next = new Set(seen); next.add(key);
            const call = modules[index].call_sites.find(row => row.site === value.site);
            if (!call || call.operation !== 'CallExpression' || call.optional || !call.argument_syntax_effect_free)
                return { target: null, reason: 'unsupported_return_invocation' };
            const linked = resolve(index, call.callee, next, environment);
            if (call.passive_freeze_construction && linked.target?.kind === 'intrinsic_member'
                && linked.target.name === 'Object' && linked.target.property === 'freeze')
                return resolve(index, call.arguments[0], next, environment);
            if (call.passive_freeze_construction) return { target: null, reason: 'passive_constructor_not_bound_intrinsic' };
            if (linked.target?.kind !== 'local_function') return { target: null, reason: linked.reason ?? 'unknown_return_effects' };
            const targetIndex = modules.findIndex(module => module.path === linked.target.module);
            const boundary = modules[targetIndex].function_boundaries.find(row => row.function_id === linked.target.function_id);
            if (!boundary?.transparent_return_grammar || boundary.returns.length !== 1
                || boundary.parameters.length !== call.arguments.length)
                return { target: null, reason: 'non_transparent_return_boundary' };
            const parameterEnvironment = new Map(environment);
            boundary.parameters.forEach((parameter, n) => parameterEnvironment.set(targetIndex + ':' + parameter.binding,
                { index, term: call.arguments[n], environment }));
            for (const site of boundary.passive_constructor_sites) {
                const constructor = modules[targetIndex].call_sites.find(row => row.site === site);
                const bound = resolve(targetIndex, constructor.callee, next, parameterEnvironment).target;
                if (bound?.kind !== 'intrinsic_member' || bound.name !== 'Object' || bound.property !== 'freeze')
                    return { target: null, reason: 'passive_constructor_not_bound_intrinsic' };
            }
            return resolve(targetIndex, boundary.returns[0].value, next, parameterEnvironment);
        }
        const reasons = { parameter: 'parameter_dispatch', call_result: 'returned_value_dispatch',
            factory_parameter: 'factory_parameter_dispatch', literal: 'literal_not_callable' };
        return { target: null, reason: reasons[value.kind] ?? 'expression_provenance_unresolved' };
    }
    return modules.map((module, index) => { const { call_sites, ...metadata } = module;
        return { ...metadata, invalid_member_bindings: [...invalidMembers[index]], module_namespace_mutated: namespaces.has(index),
            export_bindings: module.export_terms.map(row => {
            const resolved = resolve(index, row.term);
            return { name: row.name, target: resolved.target?.kind === 'local_function' ? resolved.target : null,
                reason: resolved.target?.kind === 'local_function' ? null : resolved.reason ?? 'non_function_export' };
        }), call_bindings: call_sites.map(call => {
        let linked = resolve(index, call.callee);
        if (call.optional) linked = { target: null, reason: 'optional_dispatch' };
        if (linked.target && !['local_function', 'intrinsic', 'intrinsic_member', 'closed_loader'].includes(linked.target.kind))
            linked = { target: null, reason: 'value_not_statically_callable' };
        // Internal substitution environments are not transported as authority.
        const target = linked.target ? Object.fromEntries(Object.entries(linked.target).filter(([key]) => key !== 'environment')) : null;
        return { ...call, ...linked, target, linkage_scope: 'finite_syntactic_forwarding_not_runtime_or_dominance_proof' };
    }) }; });
}
export function inspectPathExecutableClosure(raw) {
    const { source, sourceHashes, kind } = fields(raw, ['source', 'sourceHashes', 'kind']);
    if (typeof source !== 'string' || Buffer.byteLength(source) > 8 * 1024 * 1024
        || !['phase', 'metric'].includes(kind)) fail('source_or_kind');
    const catalog = JSON.parse(JSON.stringify(copyData(sourceHashes)));
    if (!Array.isArray(catalog) || !catalog.length || catalog.length > 128) fail('catalog');
    const paths = new Set();
    for (const rawRow of catalog) {
        const row = fields(rawRow, ['path', 'sha256']);
        if (typeof row.path !== 'string' || row.path.length > 512 || !/^[a-zA-Z0-9_./-]+$/.test(row.path)
            || row.path.startsWith('/') || row.path.split('/').some(part => !part || part === '..' || part === '.')
            || paths.has(row.path) || !/^sha256:[a-f0-9]{64}$/.test(row.sha256)) fail('catalog_row');
        paths.add(row.path);
    }
    const key = kind + sha(source) + sha(canonicalValue(catalog));
    if (cache.has(key)) return cache.get(key);
    const ast = expression(source), bundles = [];
    function walk(node) {
        if (node.type === 'FunctionExpression' && node.body.body[1]?.declarations?.[0]?.id?.name === 'factories') {
            bundles.push(node); return;
        }
        for (const [, child] of children(node)) walk(child);
    }
    walk(ast);
    if (bundles.length !== (kind === 'phase' ? 2 : 1)) fail('bundle_count');
    // Validate the complete outer composition too. A closed module inventory
    // cannot hide an extra ambient consumer alongside an otherwise good bundle.
    if (ast !== bundles[0]) {
        const wrapper = clean(ast);
        function replace(node) {
            for (const [key, value] of Object.entries(node)) {
                if (Array.isArray(value)) for (let index = 0; index < value.length; index++) {
                    const item = value[index];
                    if (item?.type === 'FunctionExpression' && item.body.body[1]?.declarations?.[0]?.id?.name === 'factories')
                        value[index] = { type: 'Identifier', name: '__closedBundle' };
                    else if (item?.type) replace(item);
                } else if (value?.type) {
                    if (value.type === 'FunctionExpression' && value.body.body[1]?.declarations?.[0]?.id?.name === 'factories')
                        node[key] = { type: 'Identifier', name: '__closedBundle' };
                    else replace(value);
                }
            }
        }
        replace(wrapper);
        let expectedWrapper;
        if (kind === 'phase') {
            expectedWrapper = expression(`(function(operands){'use strict';
if(operands.phase === 'derivation')return (__closedBundle)(operands);
if(operands.phase === 'proof')return (__closedBundle)(operands);
throw new Error('proof_program_phase');})`);
            if (catalog.filter(row => !row.path.endsWith('.js')).length !== 1
                || !catalog.some(row => row.path === 'provenance/derivation-program.js')
                || !catalog.some(row => row.path === 'provenance/proof-program.js')) fail('phase_catalog');
        } else {
            const properties = wrapper.body?.body?.[2]?.argument?.properties;
            const unit = properties?.[0]?.value?.value, resultKind = properties?.[1]?.value?.value;
            const allowed = { BRL_minor: ['money_minor'], count: ['nonnegative_integer'], entity_ids: ['id', 'id_set'], state: ['enum'] };
            if (!Object.hasOwn(allowed, unit) || !allowed[unit].includes(resultKind)) fail('typed_wrapper');
            expectedWrapper = expression(`(function(operands){'use strict';const evaluate=__closedBundle;
return {unit:${JSON.stringify(unit)},kind:${JSON.stringify(resultKind)},value:evaluate(operands)};})`);
        }
        if (canonicalValue(wrapper) !== canonicalValue(clean(expectedWrapper))) fail('outer_wrapper');
    } else if (kind !== 'metric') fail('phase_wrapper');
    const inventories = bundles.map((bundle, index) => {
        let rows = catalog;
        if (kind === 'phase') {
            const current = index === 0 ? 'derivation' : 'proof', other = index === 0 ? 'proof' : 'derivation';
            rows = catalog.filter(row => row.path.endsWith('.js') && row.path !== `provenance/${other}-program.js`)
                .map(row => ({ ...row, path: row.path === `provenance/${current}-program.js` ? 'provenance/program.js' : row.path }))
                .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
        } else if (catalog.some(row => !row.path.endsWith('.js'))) fail('metric_catalog');
        return inspectBundle(bundle, source, rows);
    });
    const resultData = { stage: 'path_v3_real_closed_module_lexical_inventory_not_value_flow_proof',
        kind, program_sha256: sha(source), source_catalog_sha256: sha(canonicalValue(catalog)),
        import_resolution_complete: true, module_sources_complete: true, lexical_reference_resolution_complete: true,
        call_binding_inventory_complete: true,
        function_boundary_inventory_complete: true,
        effect_site_inventory_complete: true,
        effect_site_count: inventories.reduce((n, row) => n + row.modules.reduce((m, module) => m + module.effect_sites.length, 0), 0),
        effect_site_scope: 'whole_syntax_obligations_no_effect_discharge_or_consumer_absence',
        function_boundary_scope: 'all_formals_returns_and_callback_terms_transparent_forwarding_only',
        guest_call_provenance_complete: false,
        call_binding_scope: 'all_factory_call_sites_not_runtime_dominance_or_effect_proof',
        unresolved_call_count: inventories.reduce((n, row) => n + row.modules.reduce((m, module) =>
            m + module.call_bindings.filter(call => call.target === null).length, 0), 0),
        import_binding_scope: 'static_module_edges_and_named_destructuring_not_value_flow',
        wrapper_grammar_conformance: true,
        non_module_data_sources: catalog.filter(row => !row.path.endsWith('.js')).length,
        closed_guest_bundles: bundles.length,
        closed_factory_sources: inventories.reduce((n, row) => n + row.modules.length, 0),
        closed_import_edges: inventories.reduce((n, row) => n + row.edge_count, 0),
        call_site_count: inventories.reduce((n, row) => n + row.modules.reduce((m, module) => m + module.call_site_count, 0), 0),
        inventories, inventory_sha256: sha(canonicalValue(inventories)),
        value_flow_proof_complete: false, executable_consumer_absence_proved: false,
        necessary_equivalence_proved: false, qualified: false, semantic_mutation_credit: 0,
        validation_tcb_complete: false, dp_execution: false };
    const { inventories: retainedInventories, ...summary } = resultData;
    const result = freezeDeep({ ...summary, inventories: retainedInventories,
        analysis_sha256: sha(canonicalValue(summary)) });
    return remember(cache, key, result, 256);
}
```

## scripts/agent/pathProofProgramContract.mjs

SHA-256 e8fe3ed84368ee154383748879e4b70490b7114fd764efed8db9a586343c956d; Git blob d6e972b855898ca4ae1708725744acce9b1c3724; bytes 58942.

```javascript
// Trusted BUILD conformance of the finite NORMAL proof-program grammar.
// No graphCompiler/lowerNextProofProgram/observed IR/source/result/trace imports.
// Authored expressions and declared nominal types are projected before lowering.
// Shared closed packaging and primitive bytes are explicit foundations, not an
// independent compiler, execution replay, general JavaScript proof or reviewed TCB.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { buildCommonJsGuestBundle } from './buildNextProvenanceArtifacts.mjs';
import { buildAvailableMetricArtifacts } from './buildNextMetricArtifacts.mjs';
import { inspectPathExecutableClosure } from './pathExecutableClosureContract.mjs';
import { projectPathReceiverOrigins, composePathReceiverEffects } from './pathReceiverOriginContract.mjs';
import { capturePathNormalCapabilityReference, readPathNormalCapabilityReference,
    recheckPathNormalCapabilityReference, verifyPathNormalCapabilityBuildBinding,
    capturePathNormalChildABIReference, readPathNormalChildABIReference,
    recheckPathNormalChildABIReference, verifyPathNormalChildABIBuildBinding } from './pathCapabilityEffectContract.mjs';
import { readPathProofAuthorship, readPathPhaseAuthorship,
    readPathCandidateProgramAuthorship } from '../../src/next/provenance/pathQualificationV3.js';
import { materialFieldType } from '../../src/next/provenance/materialFieldTypes.js';
import { canonicalValue, freezeDeep } from '../../src/next/kernel/canonicalValue.js';
import { copyData } from '../../src/next/provenance/observationContract.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const seals = new WeakMap();
const phaseSeals = new WeakMap();
const familySeals = new WeakMap(), commonPhaseSeals = new WeakMap();
const receiverProjectionCache = new Map();
const familyFailures = new WeakMap();
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const q = JSON.stringify;
const fail = code => { throw new Error('path_proof_program_' + code); };
const recipe = ['scalarProofCore', 'proofProgramData', 'proofObservedValues', 'observationScalars',
    'operatorTypes', 'literalTypes', 'civilCalendar', 'materialFingerprintCore', 'proofSha256', 'collectionProofCore'];
function fields(raw, names) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== names.length || names.some(name => !d[name]?.enumerable || !Object.hasOwn(d[name], 'value')))
        fail('input');
    return Object.fromEntries(names.map(name => [name, d[name].value]));
}
function captured(file) {
    const bytes = fs.readFileSync(path.join(root, file)), source = bytes.toString('utf8');
    if (!Buffer.from(source, 'utf8').equals(bytes)) fail('helper_utf8');
    return source;
}
// Prescribed helper environment of the normal closed guest bundle. It is not
// copied from the actual program being checked; changes invalidate the seal.
const prologue = `'use strict';
const { createScalarProofPrimitives } = require('./scalarProofCore');
const { copyProgramData } = require('./proofProgramData');
const { canonicalValue } = require('../kernel/canonicalJson');
const { sha256Utf8 } = require('./proofSha256');
const { createMaterialFingerprint } = require('./materialFingerprintCore');
const { createCollectionProofPrimitives } = require('./collectionProofCore');
const { validateLiteral } = require('./literalTypes');
const { readObservedIdentity: identity, sequence, period } = require('./proofObservedValues');
const primitives = createScalarProofPrimitives(copyProgramData, canonicalValue);
const scalar=primitives.evaluateScalarProof; const collection=createCollectionProofPrimitives(primitives.compareTypedScalars);
function validated(value,type) { primitives.compareTypedScalars(type,value,value);return value; }
const fingerprint = createMaterialFingerprint(copyProgramData,value=>sha256Utf8(canonicalValue(value)));
function checkedNode(handle,kind) { if (identity(handle).kind!==kind) throw new Error('proof_program_node_kind'); return handle; }
function checkedPeriod(value) { scalar({id:"period_eq",args:["period","period"],semantics:"equal_period_kind_and_fields"},[{type:{form:"period"},value},{type:{form:"period"},value}]); return value; }
`;
function expectedEntry(input, phase = 'proof') {
    const operators = new Map(input.operators.map(row => [row.id, row]));
    const kinds = new Map(Object.values(input.materials).map(row => [row.kind, row]));
    function parts(e, receiver) {
        if (!['field_ref', 'claim_ref'].includes(e.kind) || !e.segments?.length) fail('path_form');
        let base = receiver ?? (e.kind === 'field_ref' ? `operands.node(${q(e.alias)})` : 'operands.claim()');
        for (const segment of e.segments.slice(0, -1)) base += `.get(${q(segment)})`;
        return { base, field: e.segments.at(-1) };
    }
    function pathRead(e, presence = false, receiver) {
        const p = parts(e, receiver);
        return `${p.base}.${presence ? 'has' : 'get'}(${q(p.field)})`;
    }
    function window(name) {
        const w = input.windows[name];
        if (!w) fail('window');
        if (w.kind === 'month') return `checkedPeriod({kind:"month",value:${read(w.value, { form: 'scalar', type: 'month' })}})`;
        if (w.kind === 'range') return `checkedPeriod({kind:"range",start:${read(w.start, { form: 'scalar', type: 'date' })},`
            + `end:${read(w.end, { form: 'scalar', type: 'date' })},start_inclusive:${w.start_inclusive},end_inclusive:${w.end_inclusive}})`;
        fail('window_form');
    }
    function read(e, t) {
        switch (e.kind) {
        case 'literal': return q(e.value);
        case 'period_literal': return q(e.period);
        case 'field_ref': case 'claim_ref': {
            const value = pathRead(e);
            // Normal derivation reads declared period fields without the
            // proof-only key enumeration. Phase affects every period reader,
            // not a fact-specific exception or a trace reconstructed post-run.
            if (['period', 'range'].includes(t.form)) return `period(${value},${phase === 'proof'})`;
            return ['sequence', 'set'].includes(t.form) ? `sequence(${value},value=>value)` : value;
        }
        case 'node_ref': return `identity(operands.node(${q(e.alias)}))`;
        case 'edge_ref': return `identity(operands.edge(${q(e.id)}))`;
        case 'field_presence': return pathRead(e.field, true);
        case 'set_ref': return `sequence(operands.set(${q(e.name)}),identity)`;
        case 'reference_set': {
            const field = e.field;
            return `(()=>{const refs=sequence(${pathRead(field)},ref=>{validateLiteral({type:"id",value:ref});return ref;});`
                + `return refs.map(ref=>{const target=identity(operands.resolveReference(${q(field.alias)},${q(field.segments[0])},ref));`
                + `if(target.ref_id!==ref)throw new Error('proof_program_reference');return target;});})()`;
        }
        case 'projection': {
            const field = pathRead({ kind: 'field_ref', segments: e.selector.segments }, false, 'member');
            return `sequence(operands.set(${q(e.set.name)}),member=>{if(identity(member).kind!==${q(e.selector.node_kind)})`
                + `throw new Error('proof_program_projection_kind');return ${field};})`;
        }
        case 'window_ref': return window(e.name);
        case 'window_bound': return `(${window(e.name)}).${e.bound}`;
        default: fail('unclassified_expression');
        }
    }
    const members = operand => `collection.members(operands.set(${q(operand.expression.name)}),${q(operand.type)})`;
    function selector(e, kind) {
        const type = materialFieldType(kind, e.segments, kinds.get(kind)?.fields[e.segments[0]]);
        return { type, path: pathRead({ kind: 'field_ref', segments: e.segments }, false, 'member') };
    }
    const values = (source, key) => `${source}.map(member=>validated(${key.path},${q(key.type)}))`;
    function collection(p) {
        const [a, b, c, d] = p.operands, kind = a.type.item.kind, nodes = members(a);
        switch (p.operator.id) {
        case 'same_field': {
            const key = selector(b.expression, kind);
            return `collection.sameField(${values(nodes, key)},${q(key.type)})`;
        }
        case 'join_eq': {
            const left = selector(c.expression, kind), right = selector(d.expression, b.type.item.kind);
            return `(()=>{const left=${nodes};const right=${members(b)};return collection.join(`
                + `${values('left', left)},${values('right', right)},${q(left.type)});})()`;
        }
        case 'ordered_by': {
            const keys = b.expression.keys.map(key => ({ ...selector(key.selector, kind), direction: key.direction }));
            const rows = `${nodes}.map(member=>({identity:identity(member),values:[${keys.map(key => `validated(${key.path},${q(key.type)})`).join(',')}]}))`;
            return `collection.ordered(${rows},${q(keys.map(({ type, direction }) => ({ type, direction })))})`;
        }
        case 'edge_pair_complete': {
            const equal = { id: 'same_identity', args: ['node:K', 'node:K'], semantics: 'same_kind_ref_version' };
            return `(()=>{const nodes=${nodes};const expected=${read(c.expression, c.type)};`
                + `scalar(${q(equal)},[{type:${q(c.type)},value:expected},{type:${q(c.type)},value:expected}]);`
                + `let equal=true;for(const member of nodes){const target=identity(operands.memberEdge(member,${q(b.expression.segments[0])}));`
                + `if(!scalar(${q(equal)},[{type:${q(c.type)},value:target},{type:${q(c.type)},value:expected}]))equal=false;}`
                + `return nodes.length===2&&equal;})()`;
        }
        case 'all_match': case 'none_match': {
            const guards = b.expression.body.map(guard => {
                const [field, value] = guard.operands, op = operators.get(guard.op), selected = selector(field, kind);
                if (!op || !['eq', 'state_is', 'date_in_period'].includes(op.id)) fail('template_operator');
                const left = op.id === 'state_is' ? { form: 'field', value: selected.type } : selected.type;
                const right = op.id === 'date_in_period' ? { form: 'period' } : op.id === 'state_is' ? { form: 'state_literal' } : selected.type;
                return `if(!scalar(${q(op)},[{type:${q(left)},value:${selected.path}},{type:${q(right)},value:${read(value, right)}}])) conjunction=false;`;
            });
            const result = `collection.quantify(${nodes},member=>{let conjunction=true;${guards.join('')}return conjunction;})`;
            return p.operator.id === 'all_match' ? `${result}.all` : `!${result}.any`;
        }
        default: fail('unclassified_collection');
        }
    }
    function statement(p) {
        const op = p.operator;
        if (phase === 'derivation' && op.id === 'edge_target_in_set') {
            const [edge, set] = p.operands;
            if (edge.expression.kind !== 'edge_ref' || set.expression.kind !== 'set_ref') fail('derivation_membership');
            return `if(!operands.edgeTargetInSet(${q(edge.expression.id)},${q(set.expression.name)}))all=false;`;
        }
        if (['same_field', 'join_eq', 'ordered_by', 'all_match', 'none_match', 'edge_pair_complete'].includes(op.id))
            return `if(!(${collection(p)})) all=false;`;
        if (op.id === 'fingerprint_is') {
            const [node, digest] = p.operands, alias = node.expression.alias;
            return `if (fingerprint(checkedNode(operands.node(${q(alias)}),${q(node.type.kind)}),`
                + `${q(input.materials[alias])},"enumerated_presence") !== ${read(digest.expression, digest.type)}) all = false;`;
        }
        if (op.id === 'civil_date_matches') {
            const [instant, date, timezone, calendar] = p.operands, source = parts(instant.expression);
            const equal = { id: 'eq', args: ['scalar:T', 'scalar:T'], semantics: 'typed_equal' };
            return `if(!(()=>{const date=${read(date.expression, date.type)};`
                + `const timezone=${read(timezone.expression, timezone.type)};const calendar=${read(calendar.expression, calendar.type)};`
                + `validateLiteral({type:"date",value:date});`
                + `const converted=${source.base}.civilDate(${q(source.field)},timezone,calendar);`
                + `return scalar(${q(equal)},[{type:${q(date.type)},value:converted},{type:${q(date.type)},value:date}]);})())all=false;`;
        }
        return `if (!scalar(${q(op)},[${p.operands.map(row => `{type:${q(row.type)},value:${read(row.expression, row.type)}}`).join(',')}])) all = false;`;
    }
    const statements = new Map(input.predicates.map(p => [p.id, statement(p)]));
    const mark = (role, id, suffix = '') => {
        if (!statements.has(id)) fail('predicate_identity');
        return `${role}_${Buffer.from(id, 'utf8').toString('hex')}${suffix}:{${statements.get(id)}}`;
    };
    const selections = input.selections.map((s, si) => {
        const cases = s.cases.map((c, ci) => `case ${ci}:{const observed=identity(member);`
            + `if(observed.kind!==${q(c.identity.kind)}||observed.ref_id!==${q(c.identity.ref_id)}||observed.version!==${q(c.identity.version)})throw new Error('proof_program_selection_identity');`
            + `const operands=Object.freeze({node:alias=>alias===${q(c.node)}?member:rootOperands.node(alias),`
            + `claim:()=>rootOperands.claim(),set:name=>rootOperands.set(name),edge:id=>rootOperands.edge(id),`
            + `resolveReference:(alias,field,ref)=>rootOperands.resolveReference(alias,field,ref),memberEdge:(node,field)=>rootOperands.memberEdge(node,field)});`
            + `let all=true;${c.predicates.map(id => mark('proof_selection', id, `_${si}_${ci}`)).join('\n')}return ${c.mode === 'include_if_all' ? 'all' : '!all'};}`);
        return `{let seen=0;operands.select(${q(s.candidate_set)},${q(s.selected_set)},(member,index)=>{seen++;switch(index){`
            + `${cases.join('\n')}default:throw new Error('proof_program_selection_candidate');}});`
            + `if(seen!==${s.cases.length})throw new Error('proof_program_selection_roster');}`;
    });
    return prologue + `function run(operands) { const rootOperands=operands;\n${selections.join('\n')}\nlet all = true;\n`
        + input.predicates.map(p => mark(phase === 'proof' ? 'proof_assertion' : 'derivation_guard', p.id)).join('\n') + '\nreturn all; }\nmodule.exports = {run};\n';
}
function captureHelpers() {
    const helpers = recipe.map(name => ({ path: `provenance/${name}.js`, source: captured(`src/next/provenance/${name}.js`) }));
    helpers.push({ path: 'kernel/canonicalJson.js', source: captured('src/next/kernel/canonicalJson.js') });
    return helpers;
}
function expectedBundle(input, helpers, phase = 'proof') {
    return buildCommonJsGuestBundle({ sources: [...helpers, { path: 'provenance/program.js', source: expectedEntry(input, phase) }],
        entry: 'provenance/program.js', exportName: 'run' });
}
function assertionSites(input, phase) {
    const predicates = new Map(input.predicates.map(row => [row.id, row]));
    const mark = (role, id, suffix = '') => {
        const predicate = predicates.get(id);
        if (!predicate) fail('assertion_predicate');
        return { site: `${role}_${Buffer.from(id, 'utf8').toString('hex')}${suffix}`,
            role, predicate_id: id, operator: predicate.operator.id, operands: predicate.operands };
    };
    // Normal metadata lists main assertions before the selection case sites,
    // even though selection statements occur before main assertions in source.
    return [...input.predicates.map(row => mark(phase === 'proof' ? 'proof_assertion' : 'derivation_guard', row.id)),
        ...input.selections.flatMap((selection, si) => selection.cases.flatMap((row, ci) =>
            row.predicates.map(id => mark('proof_selection', id, `_${si}_${ci}`))))];
}
export function sealPathProofProgramExpectation(raw) {
    const { authorship } = fields(raw, ['authorship']);
    const input = readPathProofAuthorship({ authorship });
    const helpers = captureHelpers();
    const entry = expectedEntry(input);
    const expected = buildCommonJsGuestBundle({ sources: [...helpers, { path: 'provenance/program.js', source: entry }],
        entry: 'provenance/program.js', exportName: 'run' });
    const receipt = freezeDeep({ stage: 'path_v3_proof_program_expectation_sealed_before_lowering',
        fact_key: authorship.fact_key, method_authority: authorship.method_authority,
        authored_graph_sha256: authorship.authored_graph_sha256, authored_input_sha256: authorship.input_sha256,
        expected_source_sha256: sha(expected.source), entry_sha256: sha(entry),
        helper_sources: helpers.map(row => ({ path: row.path, sha256: sha(row.source) })),
        imports: expected.imports, sources: expected.sourceHashes,
        shared_packaging_and_primitives: true, independent_compiler: false, independent_execution: false,
        scope: 'complete_normal_proof_phase_only_not_derivation_or_whole_qualification',
        qualified: false, semantic_mutation_credit: 0 });
    seals.set(receipt, receipt);
    return receipt;
}
export function sealPathPhaseProgramExpectation(raw) {
    const { authorship } = fields(raw, ['authorship']);
    return sealPhaseAuthorship(authorship, captureHelpers());
}
function sealPhaseAuthorship(authorship, helpers) {
    const input = readPathPhaseAuthorship({ authorship });
    if (input.derivation.selections.length) fail('derivation_selection');
    const derivation = expectedBundle(input.derivation, helpers, 'derivation'),
        proof = expectedBundle(input.proof, helpers), profile = input.profile;
    const source = `/* phase-profile ${profile.sha256}; registry ${profile.registry_sha256} */\n`
        + `(function(operands){'use strict';if(operands.phase==="derivation")return (${derivation.source})(operands);`
        + `if(operands.phase==="proof")return (${proof.source})(operands);throw new Error('proof_program_phase');})`;
    const sources = new Map();
    for (const [phase, program] of [['derivation', derivation], ['proof', proof]]) for (const row of program.sourceHashes) {
        const name = row.path === 'provenance/program.js' ? `provenance/${phase}-program.js` : row.path;
        if (sources.has(name) && sources.get(name).sha256 !== row.sha256) fail('phase_helper_mismatch');
        sources.set(name, { path: name, sha256: row.sha256 });
    }
    sources.set(profile.path, { path: profile.path, sha256: profile.sha256 });
    const sourceHashes = [...sources.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    const manifest = canonicalValue({ format: 'financasbot.provenance.artifact', version: 1, kind: 'proof', entry: 'bundle.js',
        files: [{ path: 'bundle.js', media_type: 'text/javascript', sha256: sha(source) },
            { path: profile.path, media_type: 'application/json', sha256: profile.sha256 }] });
    const metadata = freezeDeep({ stage: 'phase_proof_program_candidate_only', executable: false,
        artifact_root: sha(manifest), predicateCount: input.proof.predicates.length,
        derivationPredicateCount: input.derivation.predicates.length, profileInput: profile,
        assertionSites: [...assertionSites(input.derivation, 'derivation'), ...assertionSites(input.proof, 'proof')],
        negative_witness_only: false, sourceHashes });
    const receipt = freezeDeep({ stage: 'path_v3_phase_program_expectation_sealed_before_lowering', fact_key: authorship.fact_key,
        method_authority: authorship.method_authority, authored_input_sha256: authorship.input_sha256,
        derivation_mode: authorship.derivation_mode, profile_sha256: profile.sha256, registry_sha256: profile.registry_sha256,
        expected_source_sha256: sha(source), expected_manifest_sha256: sha(manifest),
        expected_metadata_sha256: sha(canonicalValue(metadata)), expected_artifact_root: metadata.artifact_root,
        helper_sources: helpers.map(row => ({ path: row.path, sha256: sha(row.source) })),
        shared_packaging_and_primitives: true, shared_reviewed_phase_profile: true,
        independent_compiler: false, independent_execution: false, qualified: false, semantic_mutation_credit: 0 });
    phaseSeals.set(receipt, { receipt, source, manifest, metadata });
    return receipt;
}
export function sealPathCandidateProgramExpectation(raw) {
    const { authorship } = fields(raw, ['authorship']);
    const family = readPathCandidateProgramAuthorship({ authorship });
    // Bind complete physical checker bodies to the genuine pre-M authorial
    // frontier. This is byte conformance only: neither read coverage nor rule
    // discharge is inferred from code, checksums or a compiler success on M.
    const normalAdmissionSources = [...new Set(family.admissionFoundation.passes.flatMap(pass => pass.checker_sources))]
        .sort().map(file => { const source = captured(file); return { path: file, source, sha256: sha(source) }; });
    const structuralContract = family.admissionFoundation.normal_structural_locator_contract;
    for (const binding of structuralContract.source_bindings)
        if (normalAdmissionSources.find(source => source.path === binding.path)?.sha256 !== binding.sha256)
            fail('admission_checker_structure_contract_pin');
    const normalStructuralLocatorContract = { ...structuralContract, source_bindings_verified: true,
        classification_complete: family.admissionFoundation.sites.every(site => site.domain_complete
            && site.frames.every(frame => frame.single_site_frame_verified
                && frame.structural_locator_constraint.contract_sha256 === sha(canonicalValue(structuralContract))
                && frame.structural_locator_constraint.baseline_locator_resolved
                && ['present_authored_locator', 'absent_authored_claim_path'].includes(frame.structural_locator_constraint.resolution))),
        normal_baseline_admission_verified: false, discharged: false };
    const normalReadContracts = family.admissionFoundation.normal_read_rule_contracts.map(contract => {
        for (const binding of contract.source_bindings)
            if (normalAdmissionSources.find(source => source.path === binding.path)?.sha256 !== binding.sha256)
                fail('admission_checker_read_contract_pin');
        const completeFrames = family.admissionFoundation.sites.every(site => site.domain_complete
            && site.frames.every(frame => frame.single_site_frame_verified
                && frame.rule_dependency_frames.some(rule => rule.pass_id === contract.pass_id
                    && rule.normal_read_rule_contract_sha256 === sha(canonicalValue(contract))
                    && rule.dependency_frame_verified && rule.conditional_preservation_verified)));
        return { ...contract, source_bindings_verified: true,
            normal_checker_read_coverage_verified: true,
            conditional_preservation_verified: completeFrames,
            // The lemma binds inputs/bodies. No compiler/guest result is used
            // here to invent a baseline or discharge a rule on the candidate.
            normal_baseline_admission_verified: false, discharged: false };
    });
    const primitiveTypeContract = family.admissionFoundation.normal_primitive_type_contract;
    for (const binding of primitiveTypeContract.source_bindings)
        if (normalAdmissionSources.find(source => source.path === binding.path)?.sha256 !== binding.sha256)
            fail('admission_checker_primitive_type_contract_pin');
    const normalPrimitiveTypeContract = { ...primitiveTypeContract, source_bindings_verified: true,
        conditional_preservation_complete: family.admissionFoundation.sites.every(site => site.domain_complete
            && site.frames.every(frame => frame.single_site_frame_verified
                && frame.structural_locator_constraint.primitive_type_constraint.contract_sha256 === sha(canonicalValue(primitiveTypeContract))
                && frame.structural_locator_constraint.primitive_type_constraint.conditional_preservation_verified)),
        normal_baseline_admission_verified: false, discharged: false };
    const schemaContract = family.admissionFoundation.normal_package_schema_contract;
    const schemaReferenceSources = [...schemaContract.source_bindings, ...schemaContract.schema_sources].map(binding => {
        const source = captured(binding.path);
        if (sha(source) !== binding.sha256
            || schemaContract.schema_sources.includes(binding)
                && family.admissionFoundation.documents.find(row => row.path === binding.path)?.sha256 !== binding.sha256)
            fail('admission_checker_schema_contract_pin');
        return { ...binding, source };
    });
    const normalPackageSchemaContract = { ...schemaContract, source_bindings_verified: true,
        conditional_preservation_complete: family.admissionFoundation.sites.every(site => site.domain_complete
            && site.frames.every(frame => frame.single_site_frame_verified
                && frame.structural_locator_constraint.schema_locator_constraint.contract_sha256 === sha(canonicalValue(schemaContract))
                && frame.structural_locator_constraint.schema_locator_constraint.shape_preservation_verified
                && frame.structural_locator_constraint.schema_locator_constraint.predicate_identity_uniqueness_preserved)),
        normal_baseline_admission_verified: false, discharged: false };
    const normalAdmissionReference = freezeDeep({ format: 'financasbot.path-normal-admission-checker-reference', version: 1,
        method_authority: family.admissionFoundation.method_authority,
        admission_foundation_sha256: sha(canonicalValue(family.admissionFoundation)),
        sources: normalAdmissionSources,
        normal_read_rule_contracts: normalReadContracts,
        normal_structural_locator_contract: normalStructuralLocatorContract,
        normal_primitive_type_contract: normalPrimitiveTypeContract,
        normal_package_schema_contract: normalPackageSchemaContract,
        // This binds the whole per-member composition, not merely its true
        // aggregate. All baseline/control/review premises remain unfulfilled.
        normal_rule_composition: family.admissionFoundation.normal_rule_composition,
        normal_rule_composition_sha256: sha(canonicalValue(family.admissionFoundation.normal_rule_composition)),
        schema_reference_sources: schemaReferenceSources,
        passes: family.admissionFoundation.passes.map(pass => ({ id: pass.id,
            source_bindings: pass.checker_sources.map(file => {
                const source = normalAdmissionSources.find(row => row.path === file);
                return { path: source.path, sha256: source.sha256 };
            }), normal_checker_read_coverage_verified: normalReadContracts.some(contract => contract.pass_id === pass.id),
            discharged: false })),
        byte_policy: 'complete_normal_checker_UTF8_raw_no_line_ending_normalization',
        sealed_before_captured_compile: true, rule_discharge_complete: false,
        independent_checker_semantics: false, qualified: false, semantic_mutation_credit: 0 });
    const capabilityReference = capturePathNormalCapabilityReference();
    const childABIReference = capturePathNormalChildABIReference({ normalReference: capabilityReference });
    // Functional kernels are a DECLARED shared normal BUILD foundation. Their
    // pre-M byte capture is not an independent implementation of the formula,
    // and supplies no oracle, equivalence, execution or acceptance result.
    for (const document of [family.baseline.metricAuthority.registry, ...family.baseline.metricAuthority.contracts])
        if (canonicalValue(JSON.parse(captured(document.path))) !== canonicalValue(document.value))
            fail('metric_authorial_document_binding');
    const metrics = freezeDeep(buildAvailableMetricArtifacts().built);
    const registryEntries = family.baseline.metricAuthority.registry.value.entries;
    if (metrics.length !== registryEntries.length || metrics.some((metric, index) =>
        metric.evaluator_id !== registryEntries[index].evaluator_id
        || metric.evaluator_version !== registryEntries[index].evaluator_version)) fail('metric_full_inventory');
    const metricBindings = family.baseline.metricBindings;
    const metricHash = sha(canonicalValue(metrics)), bindingHash = sha(canonicalValue(metricBindings));
    // Capture one finite helper table before ANY captured C/M/S compile. Common
    // proof reuse is keyed by the genuine full authorial basis AND helper bytes.
    const helpers = captureHelpers(), helperHash = sha(canonicalValue(helpers.map(row => ({
        path: row.path, sha256: sha(row.source) }))));
    let cache = commonPhaseSeals.get(family.baseline.basis);
    if (!cache) { cache = new Map(); commonPhaseSeals.set(family.baseline.basis, cache); }
    let baseline = cache.get(helperHash);
    if (!baseline) {
        baseline = freezeDeep(family.baseline.rows.map(row => ({ fact_key: row.fact_key,
            expectation: sealPhaseAuthorship(row.authorship, helpers) })));
        cache.set(helperHash, baseline);
    }
    const mutant = family.mutant ? { fact_key: family.mutant.fact_key,
        expectation: sealPhaseAuthorship(family.mutant.authorship, helpers) } : null;
    const worlds = { C: baseline, M: mutant ? freezeDeep(baseline.map(row =>
        row.fact_key === mutant.fact_key ? mutant : row)) : null, S: baseline };
    const rows = variant => worlds[variant]?.map(row => ({ fact_key: row.fact_key,
        program_sha256: row.expectation.expected_source_sha256,
        manifest_sha256: row.expectation.expected_manifest_sha256,
        metadata_sha256: row.expectation.expected_metadata_sha256 })) ?? null;
    const metricClosure = Object.freeze(metrics.map(metric => Object.freeze({ evaluator_id: metric.evaluator_id,
        analysis: inspectPathExecutableClosure({ source: metric.source, sourceHashes: metric.sourceHashes, kind: 'metric' }) })));
    const closures = Object.fromEntries(['C', 'M', 'S'].map(variant => [variant, worlds[variant] ? Object.freeze({
        programs: Object.freeze(worlds[variant].map(row => { const phase = phaseSeals.get(row.expectation); return Object.freeze({
            fact_key: row.fact_key, analysis: inspectPathExecutableClosure({ source: phase.source,
                sourceHashes: phase.metadata.sourceHashes, kind: 'phase' }) }); })), metrics: metricClosure }) : null]));
    // Only the genuine authored family and captured child constructor reference
    // can supply root seeds. The loader passes operands without manufacturing
    // capabilities; downstream receiver/return/callback effects remain unknown.
    const rootBindings = freezeDeep(Object.fromEntries(['C', 'M', 'S'].map(variant => [variant, closures[variant]
        ? closures[variant].programs.map(row => {
            const seed = family.baseline.capabilitySeeds.find(seed => seed.fact_key === row.fact_key);
            if (!seed) fail('root_seed_missing');
            return { fact_key: row.fact_key, authored_seed_sha256: sha(canonicalValue(seed)),
                child_abi_reference_sha256: childABIReference.reference_sha256,
                phase_entries: row.analysis.inventories.map((bundle, index) => ({ phase: index === 0 ? 'derivation' : 'proof',
                    entry: bundle.entry, function: bundle.entry_function, bindings: bundle.entry_argument_bindings })),
                functional_entries: metricClosure.filter(metric => metricBindings.some(binding => binding.fact_key === row.fact_key
                    && binding.evaluator_ref.evaluator_id === metric.evaluator_id)).map(metric => ({ evaluator_id: metric.evaluator_id,
                    entry: metric.analysis.inventories[0].entry, function: metric.analysis.inventories[0].entry_function,
                    bindings: metric.analysis.inventories[0].entry_argument_bindings })),
                seed_scope: 'authored_input_roles_and_normal_child_constructor_bindings_not_selected_output_or_live_parent',
                guest_call_provenance_complete: false, executable_consumer_absence_proved: false };
        }) : null])));
    const normalData = readPathNormalCapabilityReference({ reference: capabilityReference });
    const childData = readPathNormalChildABIReference({ reference: childABIReference });
    const projectReceivers = (analysis, rootKind, seed, bundleIndex = 0) => {
        const key = analysis.analysis_sha256 + ':' + bundleIndex + ':' + rootKind + ':' + sha(canonicalValue(seed))
            + ':' + capabilityReference.reference_sha256 + ':' + childABIReference.reference_sha256;
        if (!receiverProjectionCache.has(key)) {
            if (receiverProjectionCache.size >= 512) receiverProjectionCache.delete(receiverProjectionCache.keys().next().value);
            receiverProjectionCache.set(key, projectPathReceiverOrigins(analysis.inventories[bundleIndex], rootKind, seed, normalData, childData));
        }
        return receiverProjectionCache.get(key);
    };
    const receiverOrigins = freezeDeep(Object.fromEntries(['C', 'M', 'S'].map(variant => [variant, closures[variant]
        ? closures[variant].programs.map(row => {
            const seed = family.baseline.capabilitySeeds.find(seed => seed.fact_key === row.fact_key);
            const evaluator = metricBindings.find(binding => binding.fact_key === row.fact_key).evaluator_ref.evaluator_id;
            const functional = metricClosure.find(metric => metric.evaluator_id === evaluator);
            if (!functional) fail('receiver_functional_binding');
            return { fact_key: row.fact_key, phases: [projectReceivers(row.analysis, 'child_derivation_guard', seed, 0),
                projectReceivers(row.analysis, 'child_proof_operands', seed, 1)],
                functional: projectReceivers(functional.analysis, 'metric_operands', seed) };
        }) : null])));
    const effectCompositions = freezeDeep(Object.fromEntries(['C', 'M', 'S'].map(variant => [variant,
        receiverOrigins[variant]?.map(row => ({ fact_key: row.fact_key,
            phases: row.phases.map(composePathReceiverEffects), functional: composePathReceiverEffects(row.functional) })) ?? null])));
    const receipt = freezeDeep({ stage: 'path_v3_whole_program_family_sealed_before_compile',
        invocation_id: family.candidate.invocation_id, candidate_id: family.candidate.candidate_id,
        whole_ir_reference: authorship.whole_ir_reference,
        normal_admission_checker_reference: normalAdmissionReference,
        baseline_basis_sha256: authorship.baseline_basis_sha256, helper_sources_sha256: helperHash,
        profile_sha256: family.profile.sha256, sealed_before_captured_compile: true,
        programs_per_positive_world: baseline.length, shared_programs: baseline.length - (mutant ? 1 : 0),
        common_reuse_scope: authorship.shared_scope,
        metric_reference_scope: 'shared_normal_functional_BUILD_bytes_not_independent_formula_or_oracle',
        metric_byte_policy: 'existing_normal_metric_recipe_UTF8_LF',
        metric_count: metrics.length, metric_artifacts_sha256: metricHash,
        metric_bindings_count: metricBindings.length, metric_bindings_sha256: bindingHash,
        module_closure_reference_sha256: sha(canonicalValue(Object.fromEntries(['C', 'M', 'S']
            .map(variant => [variant, closures[variant] ? closureProjection(closures[variant]) : null])))),
        normal_capability_reference_sha256: capabilityReference.reference_sha256,
        normal_child_abi_reference_sha256: childABIReference.reference_sha256,
        authored_capability_seeds_sha256: sha(canonicalValue(family.baseline.capabilitySeeds)),
        authored_capability_seeds_scope: 'all_unchanged_population_role_and_nominal_bindings_not_selected_runtime_output',
        root_capability_bindings_sha256: sha(canonicalValue(rootBindings)),
        conditional_receiver_origins_sha256: sha(canonicalValue(receiverOrigins)),
        effect_composition_reference_sha256: effectCompositionDigest(effectCompositions),
        effect_composition_status: 'blocked_missing_effect_discharge', effect_closure_complete: false,
        executable_consumer_absence_proved: false, value_flow_proof_complete: false,
        metric_authority_refs: [family.baseline.metricAuthority.registry, ...family.baseline.metricAuthority.contracts]
            .map(({ path, sha256 }) => ({ path, sha256 })),
        worlds: ['C', 'M', 'S'].map(variant => ({ variant,
            package_root: authorship.whole_ir_reference.worlds.find(row => row.variant === variant).package_root,
            program_count: worlds[variant]?.length ?? 0,
            programs_sha256: rows(variant) ? sha(canonicalValue(rows(variant))) : null })),
        independent_compiler: false, independent_execution: false, validation_tcb_complete: false,
        qualified: false, semantic_mutation_credit: 0 });
    familySeals.set(receipt, { candidate: family.candidate, worlds, metrics, metricBindings, closures, capabilityReference,
        normalAdmissionReference,
        childABIReference, capabilitySeeds: family.baseline.capabilitySeeds, rootBindings, receiverOrigins, effectCompositions, phaseProfile: family.phaseProfile,
        profile: family.profile, receipt });
    return receipt;
}
export function readPathCandidateMetricReference(raw) {
    const { expectation } = fields(raw, ['expectation']);
    const seal = familySeals.get(expectation);
    if (!seal) fail('metric_reference_origin');
    return freezeDeep({ metrics: seal.metrics, bindings: seal.metricBindings });
}
export function readPathCandidateCapabilityReference(raw) {
    const { expectation } = fields(raw, ['expectation']);
    const seal = familySeals.get(expectation);
    if (!seal) fail('capability_reference_origin');
    return freezeDeep({ reference: seal.capabilityReference,
        data: readPathNormalCapabilityReference({ reference: seal.capabilityReference }) });
}
export function recheckPathCandidateCapabilities(raw) {
    const { expectation } = fields(raw, ['expectation']);
    const seal = familySeals.get(expectation);
    if (!seal) fail('capability_reference_origin');
    for (const source of seal.normalAdmissionReference.sources)
        if (captured(source.path) !== source.source) fail('admission_checker_physical_drift');
    for (const source of seal.normalAdmissionReference.schema_reference_sources)
        if (captured(source.path) !== source.source) fail('admission_checker_schema_physical_drift');
    recheckPathNormalCapabilityReference({ reference: seal.capabilityReference });
    return recheckPathNormalChildABIReference({ reference: seal.childABIReference });
}
export function verifyPathCandidateCapabilityBuildBinding(raw) {
    const { expectation, sourceHashes, childSourceHashes, schemaSources, schemaBuildSource } = fields(raw,
        ['expectation', 'sourceHashes', 'childSourceHashes', 'schemaSources', 'schemaBuildSource']);
    const seal = familySeals.get(expectation);
    if (!seal) fail('capability_reference_origin');
    const hashes = copyData(sourceHashes);
    if (!Array.isArray(hashes) || hashes.length > 512) fail('admission_BUILD_sources');
    const seen = new Set();
    for (const row of hashes) {
        if (!row || Object.keys(row).sort().join(',') !== 'path,sha256' || typeof row.path !== 'string'
            || typeof row.sha256 !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(row.sha256)
            || seen.has(row.path)) fail('admission_BUILD_sources');
        seen.add(row.path);
    }
    for (const source of seal.normalAdmissionReference.sources)
        if (hashes.find(row => row.path === source.path.slice('src/next/'.length))?.sha256 !== source.sha256)
            fail('admission_checker_BUILD_binding');
    const schemaContract = seal.normalAdmissionReference.normal_package_schema_contract;
    // copyData rejects active transports and returns null-prototype defensive
    // objects. Use the existing plain-JSON bridge; do not weaken the kernel.
    if (canonicalValue(JSON.parse(JSON.stringify(copyData(schemaSources)))) !== canonicalValue(schemaContract.schema_sources)
        || typeof schemaBuildSource !== 'string' || schemaBuildSource !== seal.normalAdmissionReference.schema_reference_sources
            .find(row => row.path === 'scripts/agent/buildNextProvenanceArtifacts.mjs').source)
        fail('admission_checker_schema_BUILD_binding');
    return freezeDeep({ ...verifyPathNormalCapabilityBuildBinding({ reference: seal.capabilityReference, sourceHashes }),
        ...verifyPathNormalChildABIBuildBinding({ reference: seal.childABIReference, sourceHashes: childSourceHashes }),
        normal_admission_checker_source_conformance: true,
        normal_package_schema_source_conformance: true,
        normal_admission_checker_reference_sha256: sha(canonicalValue(seal.normalAdmissionReference)),
        normal_admission_rule_discharge_complete: false });
}
export function readPathCandidateChildABIReference(raw) {
    const { expectation } = fields(raw, ['expectation']);
    const seal = familySeals.get(expectation);
    if (!seal) fail('child_reference_origin');
    return freezeDeep({ reference: seal.childABIReference, data: readPathNormalChildABIReference({ reference: seal.childABIReference }),
        seeds: seal.capabilitySeeds });
}
export function readPathCandidateRootCapabilityBindings(raw) {
    const { expectation, variant } = fields(raw, ['expectation', 'variant']);
    const seal = familySeals.get(expectation);
    if (!seal || typeof variant !== 'string' || !['C', 'M', 'S'].includes(variant) || !seal.rootBindings[variant])
        fail('root_capability_origin_or_no_typed_M');
    return seal.rootBindings[variant];
}
export function readPathCandidateReceiverOrigins(raw) {
    const { expectation, variant } = fields(raw, ['expectation', 'variant']);
    const seal = familySeals.get(expectation);
    if (!seal || typeof variant !== 'string' || !['C', 'M', 'S'].includes(variant) || !seal.receiverOrigins[variant])
        fail('receiver_reference_origin_or_no_typed_M');
    return seal.receiverOrigins[variant];
}
export function readPathCandidateClosureReference(raw) {
    const { expectation, variant } = fields(raw, ['expectation', 'variant']);
    const seal = familySeals.get(expectation);
    if (!seal || typeof variant !== 'string' || !['C', 'M', 'S'].includes(variant) || !seal.closures[variant])
        fail('closure_reference_origin_or_no_typed_M');
    return seal.closures[variant];
}
export function readPathCandidateEffectComposition(raw) {
    const { expectation, variant } = fields(raw, ['expectation', 'variant']);
    const seal = familySeals.get(expectation);
    if (!seal || typeof variant !== 'string' || !['C', 'M', 'S'].includes(variant) || !seal.effectCompositions[variant])
        fail('effect_composition_origin_or_no_typed_M');
    return seal.effectCompositions[variant];
}
function effectCompositionDigest(worlds) {
    return sha(canonicalValue(Object.fromEntries(Object.entries(worlds).map(([variant, rows]) => [variant,
        rows?.map(row => ({ fact_key: row.fact_key, phases: row.phases.map(item => item.composition_sha256),
            functional: row.functional.composition_sha256 })) ?? null]))));
}
export function verifyPathCandidateClosure(raw) {
    const { expectation, variant, programs, metrics } = fields(raw, ['expectation', 'variant', 'programs', 'metrics']);
    const expected = readPathCandidateClosureReference({ expectation, variant });
    verifyPathCandidatePrograms({ expectation, variant, programs });
    verifyPathCandidateMetrics({ expectation, metrics });
    // Whole source uses the existing 8MB program bound, not observation scalar
    // quotas. Metadata is copied independently under the unchanged data limits.
    const actualPrograms = Array.from({ length: expected.programs.length }, (_, index) => {
        const row = fields(Object.getOwnPropertyDescriptor(programs, String(index)).value, ['fact_key', 'candidate']);
        const phase = phaseSeals.get(familySeals.get(expectation).worlds[variant][index].expectation);
        const data = fields(row.candidate, [...Object.keys(phase.metadata), 'source', 'manifest']);
        return { fact_key: row.fact_key, candidate: { source: data.source,
            sourceHashes: JSON.parse(JSON.stringify(copyData(data.sourceHashes))) } };
    });
    const actualMetrics = passiveFamily(metrics, expected.metrics.length);
    const observed = { programs: actualPrograms.map(row => ({ fact_key: row.fact_key,
        analysis: inspectPathExecutableClosure({ source: row.candidate.source,
            sourceHashes: row.candidate.sourceHashes, kind: 'phase' }) })),
    metrics: actualMetrics.map(row => ({ evaluator_id: row.evaluator_id,
        analysis: inspectPathExecutableClosure({ source: row.source, sourceHashes: row.sourceHashes, kind: 'metric' }) })) };
    const digest = sha(canonicalValue(closureProjection(observed)));
    if (digest !== sha(canonicalValue(closureProjection(expected)))) fail('module_closure_conformance');
    // Conformance binds the entire obligation tables to ACTUAL byte inventories.
    // Pure projection reuse is permitted only after whole analyzed source/catalog
    // equality. This is not a rerun of semantic effects, nor a discharged premise.
    const compositions = readPathCandidateEffectComposition({ expectation, variant });
    const origins = readPathCandidateReceiverOrigins({ expectation, variant });
    for (let index = 0; index < observed.programs.length; index++) {
        const program = observed.programs[index], row = compositions[index];
        if (row.fact_key !== program.fact_key) fail('effect_composition_fact');
        const binding = familySeals.get(expectation).metricBindings.find(item => item.fact_key === program.fact_key);
        const metric = observed.metrics.find(item => item.evaluator_id === binding.evaluator_ref.evaluator_id);
        for (const [bundle, composition, origin] of [
            ...program.analysis.inventories.map((bundle, phase) => [bundle, row.phases[phase], origins[index].phases[phase]]),
            [metric.analysis.inventories[0], row.functional, origins[index].functional]
        ]) {
            const sources = bundle.modules.map(module => ({ path: module.path, source_sha256: module.source_sha256,
                effect_sites_sha256: module.effect_sites_sha256 }));
            if (canonicalValue(sources) !== canonicalValue(composition.sources)
                || composition.receiver_reference_sha256 !== 'sha256:' + createHash('sha256').update(canonicalValue(origin)).digest('hex'))
                fail('effect_composition_actual_binding');
        }
    }
    return freezeDeep({ module_closure_conformance: true, module_closure_sha256: digest,
        static_call_binding_conformance: true,
        function_boundary_conformance: true,
        conditional_receiver_reference_conformance: true,
        conditional_receiver_reference_sha256: sha(canonicalValue(readPathCandidateReceiverOrigins({ expectation, variant }))),
        effect_obligation_conformance: true,
        effect_composition_reference_sha256: effectCompositionDigest({ [variant]: compositions }),
        effect_composition_status: 'blocked_missing_effect_discharge', effect_closure_complete: false,
        effect_composition_reuse_scope: 'whole_actual_analyzed_bytes_and_genuine_pre_M_seeds_equal_not_semantic_rerun',
        operational_receiver_authority: false,
        executable_consumer_absence_proved: false, value_flow_proof_complete: false,
        necessary_equivalence_proved: false, qualified: false, semantic_mutation_credit: 0 });
}
function closureProjection(closure) {
    // Each genuine analyzer digest binds its entire inventory plus all summary
    // flags, real source/catalog bytes and scope. Full tables remain retained.
    return { programs: closure.programs.map(row => ({ fact_key: row.fact_key,
        analysis_sha256: row.analysis.analysis_sha256 })),
    metrics: closure.metrics.map(row => ({ evaluator_id: row.evaluator_id,
        analysis_sha256: row.analysis.analysis_sha256 })) };
}
export function verifyPathCandidateMetrics(raw) {
    const { expectation, metrics } = fields(raw, ['expectation', 'metrics']);
    const seal = familySeals.get(expectation);
    if (!seal) fail('metric_reference_origin');
    const admitted = passiveFamily(metrics, seal.metrics.length);
    for (let index = 0; index < admitted.length; index++) {
        const observed = fields(admitted[index], Object.keys(seal.metrics[index]));
        if (canonicalValue(observed) !== canonicalValue(seal.metrics[index])) {
            const error = new Error('path_proof_program_metric_asset_identity');
            familyFailures.set(error, freezeDeep({ metric_index: index,
                evaluator_id: seal.metrics[index].evaluator_id, expected_sha256: sha(canonicalValue(seal.metrics[index])),
                observed_sha256: sha(canonicalValue(observed)), observed }));
            throw error;
        }
    }
    return freezeDeep({ functional_metric_conformance: true, metric_count: admitted.length,
        metric_artifacts_sha256: expectation.metric_artifacts_sha256,
        independent_formula: false, dp_execution: false, qualified: false, semantic_mutation_credit: 0 });
}
export function verifyPathCandidateMetricBindings(raw) {
    const { expectation, variant, bindings } = fields(raw, ['expectation', 'variant', 'bindings']);
    const seal = familySeals.get(expectation);
    if (!seal || typeof variant !== 'string' || !['C', 'M', 'S'].includes(variant)
        || !seal.worlds[variant]) fail('metric_binding_origin_or_no_typed_M');
    const admitted = passiveFamily(bindings, seal.metricBindings.length);
    for (let index = 0; index < admitted.length; index++) {
        if (canonicalValue(admitted[index]) !== canonicalValue(seal.metricBindings[index])) {
            const error = new Error('path_proof_program_metric_binding_identity');
            familyFailures.set(error, freezeDeep({ variant, graph_index: index,
                fact_key: seal.metricBindings[index].fact_key, expected_sha256: sha(canonicalValue(seal.metricBindings[index])),
                observed_sha256: sha(canonicalValue(admitted[index])), observed: admitted[index] }));
            throw error;
        }
    }
    return freezeDeep({ metric_bindings_conformance: true, metric_bindings_count: admitted.length,
        metric_bindings_sha256: expectation.metric_bindings_sha256,
        dp_execution: false, qualified: false, semantic_mutation_credit: 0 });
}
function passiveFamily(raw, count) {
    if (!Array.isArray(raw) || types.isProxy(raw) || Object.getPrototypeOf(raw) !== Array.prototype) fail('metric_rows');
    const descriptors = Object.getOwnPropertyDescriptors(raw);
    if (descriptors.length.value !== count || Reflect.ownKeys(descriptors).length !== count + 1) fail('metric_rows');
    return Array.from({ length: count }, (_, index) => {
        const descriptor = descriptors[index];
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail('metric_row');
        return JSON.parse(JSON.stringify(copyData(descriptor.value)));
    });
}
// Private-origin BUILD bridge; no caller IR, scope, callback or approval flag.
export function resolvePathCandidateProgramExpectation(raw) {
    const { expectation, candidate } = fields(raw, ['expectation', 'candidate']);
    const seal = familySeals.get(expectation);
    if (!seal || seal.candidate !== candidate) fail('program_family_candidate_identity');
    return Object.freeze({ phaseProfile: seal.phaseProfile, profile: seal.profile,
        wholeIRReference: expectation.whole_ir_reference });
}
export function readPathCandidateProgramReference(raw) {
    const { expectation, variant } = fields(raw, ['expectation', 'variant']);
    const seal = familySeals.get(expectation);
    if (!seal || typeof variant !== 'string' || !['C', 'M', 'S'].includes(variant)
        || !seal.worlds[variant]) fail('program_family_origin_or_no_typed_M');
    return freezeDeep(seal.worlds[variant].map(row => ({ fact_key: row.fact_key,
        candidate: { ...readPathPhaseProgramReference({ expectation: row.expectation }).metadata,
            source: phaseSeals.get(row.expectation).source, manifest: phaseSeals.get(row.expectation).manifest } })));
}
export function verifyPathCandidatePrograms(raw) {
    const { expectation, variant, programs } = fields(raw, ['expectation', 'variant', 'programs']);
    const seal = familySeals.get(expectation);
    if (!seal || typeof variant !== 'string' || !['C', 'M', 'S'].includes(variant)
        || !seal.worlds[variant]) fail('program_family_origin_or_no_typed_M');
    const expected = seal.worlds[variant];
    if (!Array.isArray(programs) || types.isProxy(programs) || Object.getPrototypeOf(programs) !== Array.prototype)
        fail('program_family_rows');
    const descriptors = Object.getOwnPropertyDescriptors(programs);
    if (descriptors.length.value !== expected.length || Reflect.ownKeys(descriptors).length !== expected.length + 1)
        fail('program_family_rows');
    for (let index = 0; index < expected.length; index++) {
        const descriptor = descriptors[index];
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail('program_family_row');
        const row = fields(descriptor.value, ['fact_key', 'candidate']);
        if (row.fact_key !== expected[index].fact_key) fail('program_family_fact_identity');
        try { verifyPathPhaseProgram({ expectation: expected[index].expectation, candidate: row.candidate }); }
        catch (error) {
            // Preserve the first passive contradiction, not only an error string
            // or a candidate-supplied digest. The existing per-program bounds
            // still apply; active or malformed transports acquire no snapshot.
            const phase = phaseSeals.get(expected[index].expectation);
            let observed = null;
            try {
                const { source, manifest, ...metadata } = fields(row.candidate,
                    [...Object.keys(phase.metadata), 'source', 'manifest']);
                if (typeof source === 'string' && Buffer.byteLength(source, 'utf8') <= 8 * 1024 * 1024
                    && typeof manifest === 'string' && Buffer.byteLength(manifest, 'utf8') <= 8 * 1024 * 1024)
                    observed = { source, manifest, metadata_canonical_json:
                        canonicalValue(JSON.parse(JSON.stringify(copyData(metadata)))) };
            } catch { /* An active/malformed transport is not evidence bytes. */ }
            familyFailures.set(error, freezeDeep({ variant, graph_index: index,
                fact_key: row.fact_key, expected: expected[index].expectation, observed }));
            throw error;
        }
    }
    return freezeDeep({ stage: 'path_v3_whole_program_family_conformance_not_execution',
        variant, program_count: expected.length, whole_phase_program_conformance: true,
        programs_sha256: expectation.worlds.find(row => row.variant === variant).programs_sha256,
        helper_closure_complete: true, validation_tcb_complete: false,
        qualified: false, semantic_mutation_credit: 0, dp_execution: false });
}
export function readPathCandidateProgramFailure(error) { return familyFailures.get(error) ?? null; }
// Trusted BUILD review/capture of the independently generated pre-lowering
// bytes. A copied reference never acquires the seal's private authority.
export function readPathPhaseProgramReference(raw) {
    const { expectation } = fields(raw, ['expectation']);
    const seal = phaseSeals.get(expectation);
    if (!seal) fail('phase_expectation_origin');
    return freezeDeep({ source: seal.source, manifest: seal.manifest, metadata: seal.metadata });
}
export function verifyPathPhaseProgram(raw) {
    const { expectation, candidate } = fields(raw, ['expectation', 'candidate']);
    const seal = phaseSeals.get(expectation);
    if (!seal) fail('phase_expectation_origin');
    const data = fields(candidate, [...Object.keys(seal.metadata), 'source', 'manifest']);
    const { source, manifest, ...metadata } = data;
    if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > 8 * 1024 * 1024
        || sha(source) !== expectation.expected_source_sha256) fail('phase_whole_source_identity');
    if (typeof manifest !== 'string' || manifest !== seal.manifest) fail('phase_manifest_identity');
    // Bounded/passive transport BEFORE the ordinary canonical encoder. Never
    // serialize an active caller object or relax canonical JSON for null-proto.
    const admitted = JSON.parse(JSON.stringify(copyData(metadata)));
    if (canonicalValue(admitted) !== canonicalValue(seal.metadata)) fail('phase_metadata_identity');
    return freezeDeep({ stage: 'path_v3_whole_normal_phase_program_conformance_only', fact_key: expectation.fact_key,
        program_sha256: expectation.expected_source_sha256, artifact_root: seal.metadata.artifact_root,
        authored_input_sha256: expectation.authored_input_sha256,
        whole_phase_program_conformance: true, whole_proof_program_conformance: true, derivation_conformance: true,
        helper_closure_complete: true, independent_compiler: false, independent_execution: false,
        measured_tcb_admission: false, handles_opened: 0, qualified: false, semantic_mutation_credit: 0,
        dp_execution: false, financial_acceptance: false });
}
export function verifyPathProofProgram(raw) {
    const { expectation, source } = fields(raw, ['expectation', 'source']);
    const expected = seals.get(expectation);
    if (!expected) fail('expectation_origin');
    if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > 8 * 1024 * 1024
        || sha(source) !== expected.expected_source_sha256) fail('whole_source_identity');
    return freezeDeep({ stage: 'path_v3_whole_proof_program_conformance_only', fact_key: expected.fact_key,
        program_sha256: sha(source), authored_input_sha256: expected.authored_input_sha256,
        helper_closure_complete: true, whole_proof_program_conformance: true, derivation_conformance: false,
        independent_compiler: false, independent_execution: false, measured_tcb_admission: false,
        handles_opened: 0, qualified: false, semantic_mutation_credit: 0, dp_execution: false, financial_acceptance: false });
}
```

## scripts/agent/pathReceiverOriginContract.mjs

SHA-256 fbdd1e751445af8110574e0416930955884073a31392240935b10d235a9f1870; Git blob ef751d731e613250b77fd4988b7c55ea84c9fb32; bytes 36915.

```javascript
// BUILD-only conservative projection over already bound finite guest syntax.
// Inputs are supplied ONLY by the genuine authorial family constructor. This
// low-level projection grants no receipt/approval or runtime authority. It is
// not an interpreter: no expression, branch, loop or guest callback is executed.
import { canonicalValue, freezeDeep } from '../../src/next/kernel/canonicalValue.js';
import { createHash } from 'node:crypto';
import path from 'node:path';
const sha = value => 'sha256:' + createHash('sha256').update(canonicalValue(value)).digest('hex');
const unknown = reason => ({ kind: 'unknown', reason });
const compositionSeals = new WeakMap();

// A finite obligation composition, NOT a semantic effect prover. Branding only
// preserves this BUILD projection's origin; trusted construction is not audit,
// authentication or authority to discharge an obligation.
export function composePathReceiverEffects(projection) {
    const composition = compositionSeals.get(projection);
    if (!composition) throw new Error('path_effect_composition_origin');
    return composition;
}

export function projectPathReceiverOrigins(bundle, rootKind, seed, normalData, childData) {
    const modules = bundle.modules, byPath = new Map(modules.map((module, index) => [module.path, index]));
    const origins = modules.map(module => new Map(module.callable_origins.map(row => [row.binding, row])));
    const calls = modules.map(module => new Map(module.call_bindings.map(row => [row.site, row])));
    const surfaces = new Map([...normalData.surfaces, ...childData.surfaces].map(row => [row.kind, row]));
    const parameters = new Map(), active = new Set(), callbackBindings = new Map();
    const key = (index, binding) => index + ':' + binding;
    const cap = (surface, binding) => ({ kind: 'capability', surface, binding });
    const same = (a, b) => canonicalValue(a) === canonicalValue(b);
    function commonShape(shapes, depth = 0) {
        if (depth > 32 || shapes.some(shape => !shape)) return null;
        if (shapes.every(shape => same(shape, shapes[0]))) return shapes[0];
        if (shapes.every(shape => shape.type === 'record')) return { type: 'record', fields:
            Object.fromEntries(Object.keys(shapes[0].fields).sort().flatMap(name => {
                const child = commonShape(shapes.map(shape => shape.fields[name]), depth + 1);
                return child ? [[name, child]] : [];
            })) };
        if (shapes.every(shape => shape.type === 'sequence')) {
            const item = commonShape(shapes.map(shape => shape.item), depth + 1);
            return item ? { type: 'sequence', item } : null;
        }
        return null;
    }
    function joinNodeOrigins(left, right) {
        if ([left, right].some(origin => origin.kind !== 'capability' || origin.surface !== 'node'
            || !Array.isArray(origin.binding?.path)) || left.binding.projection !== right.binding.projection
            || !same(left.binding.path, right.binding.path)) return unknown('conflicting_incoming_origins');
        const all = [left, right].flatMap(origin => origin.binding.kind === 'conditional_incoming_node_origins'
            ? origin.binding.alternatives : [origin.binding]);
        const distinct = new Map(all.map(binding => [canonicalValue(binding), binding]));
        if (distinct.size > 256) return unknown('finite_incoming_origin_bound');
        const alternatives = [...distinct].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, binding]) => binding);
        return cap('node', { kind: 'conditional_incoming_node_origins', alternatives,
            shape: commonShape(alternatives.map(binding => binding.shape)), path: left.binding.path,
            projection: left.binding.projection,
            path_scope: 'same_root_relative_path_for_all_retained_alternatives',
            return_conditions: conditions(alternatives.some(binding => binding.return_conditions?.may_be_absent),
                ['every_retained_normal_origin_and_precondition', 'runtime_incoming_alternative_and_health_not_proved']) });
    }
    const derivedBinding = (binding, update, perAlternative) => ({ ...binding, ...update,
        ...(binding.kind === 'conditional_incoming_node_origins'
            ? { alternatives: binding.alternatives.map(perAlternative) } : {}) });
    let changed = false;
    const merge = (name, value) => {
        if (!value) return;
        const old = parameters.get(name);
        const next = !old || same(old, value) ? value : joinNodeOrigins(old, value);
        if (old?.reason === 'conflicting_incoming_origins' || old && same(old, next)) return;
        parameters.set(name, next); changed = true;
    };
    const entryIndex = byPath.get(bundle.entry_function?.module);
    const entryBinding = bundle.entry_argument_bindings?.[0];
    if (entryIndex === undefined || !entryBinding) return freezeDeep({
        stage: 'unbound_entry', calls: [], blockers: ['entry_capability_binding_missing'],
        guest_call_provenance_complete: false, effect_closure_complete: false });
    merge(key(entryIndex, entryBinding.parameter_binding), cap(rootKind, { kind: 'ordinary_child_operands', fact_key: seed.fact_key }));
    active.add(entryIndex + ':' + bundle.entry_function.function_id);
    bundle.entry_argument_bindings.slice(1).forEach(binding => merge(key(entryIndex, binding.parameter_binding),
        { kind: 'literal', value: binding.source.value }));
    const scalarTypes = new Set(['id', 'text', 'date', 'month', 'datetime', 'integer', 'positive_integer',
        'nonnegative_integer', 'money_minor', 'boolean', 'enum', 'digest', 'ref']);
    function fieldShape(descriptor) {
        if (descriptor.class === 'non_material') return { type: 'non_material' };
        if (scalarTypes.has(descriptor.type)) return { type: 'scalar' };
        if (descriptor.type === 'ref_list') return { type: 'sequence', item: { type: 'scalar' } };
        if (descriptor.type === 'role_ref_list') return { type: 'sequence', item: { type: 'record',
            fields: { role_id: { type: 'scalar' }, parent_ref: { type: 'scalar' } } } };
        return { type: 'unknown', reason: 'separately_admitted_shape_required:' + descriptor.type };
    }
    function nodeShape(aliases) {
        const shapes = aliases?.map(alias => seed.material_descriptors[alias]).map(material => material
            ? { type: 'record', fields: Object.fromEntries(Object.entries(material.fields).map(([name, descriptor]) => [name, fieldShape(descriptor)])) }
            : null);
        return shapes?.length && shapes.every(shape => shape && same(shape, shapes[0])) ? shapes[0] : null;
    }
    const conditions = (may_be_absent, obligations) => ({ may_be_absent, obligations, runtime_proved: false });
    function nodePopulation(binding, may_be_absent = false) {
        const aliases = binding.aliases ?? binding.population?.binding?.aliases ?? null;
        if (!Array.isArray(aliases) || !aliases.length || aliases.some(alias => !seed.nodes[alias]
            || seed.nodes[alias].binding === 'validated_parent')) return unknown('population_member_origin_not_admitted');
        return cap('node', { ...binding, aliases, shape: nodeShape(aliases), path: [], projection: 'data',
            return_conditions: conditions(may_be_absent, ['normal_member_identity_and_population_binding', 'normal_health_and_scope']) });
    }
    function rootNode(alias) {
        if (alias === 'claim/context') {
            const projectionSource = normalData.sources.find(row => row.path === 'src/next/provenance/claimContext.js');
            return cap('node', { kind: 'claim_context', fact_key: seed.fact_key,
                shape: projectionSource ? seed.claim_context?.shape ?? null : null,
                shape_authority: projectionSource && seed.claim_context ? {
                    schema_path: seed.claim_context.schema_path, schema_sha256: seed.claim_context.schema_sha256,
                    authored_claim_sha256: seed.claim_context.authored_claim_sha256,
                    projection_source_sha256: projectionSource.sha256,
                    shared_normal_foundation: true, independent_semantics_proof: false } : null,
                path: [], projection: 'data',
                return_conditions: conditions(false, ['admitted_claim_context_shape_binding', 'normal_health_and_scope']) });
        }
        const node = seed.nodes[alias];
        if (!node) return unknown('alias_not_in_authorial_seed');
        if (node.binding === 'validated_parent') return unknown('live_parent_receipt_not_admitted');
        return cap('node', { kind: 'authored_node', alias, identity: node, aliases: [alias],
            shape: nodeShape([alias]), path: [], projection: 'data',
            return_conditions: conditions(false, ['normal_root_identity_and_owner_binding', 'normal_health_and_scope']) });
    }
    function namedSet(name, guard) {
        const input = seed.input_sets.find(row => row.name === name);
        if (input) return cap(guard ? 'guard_input_set' : 'node_set', { kind: 'authored_input_set', name,
            aliases: input.aliases, membership: 'admitted_input_roster' });
        const selected = seed.selected_sets.find(row => row.selected_set === name);
        if (!selected) return unknown('set_not_in_authorial_seed');
        return cap('node_set', { kind: 'runtime_selected_set', name, candidate_set: selected.candidate_set,
            membership: 'runtime_not_authored_output', aliases: seed.input_sets.find(row => row.name === selected.candidate_set)?.aliases ?? null,
            return_conditions: conditions(false, ['normal_selection_already_completed_and_bound', 'runtime_membership_order_and_cardinality']) });
    }
    function materialReferenceResult(name, arguments_) {
        const member = name === 'memberEdge', field = arguments_[1]?.kind === 'literal' ? arguments_[1].value : null;
        if (typeof field !== 'string') return unknown('reference_field_not_static');
        const input = arguments_[0];
        let sources;
        if (member) {
            if (input?.kind !== 'capability' || input.surface !== 'node' || input.binding.path?.length
                || input.binding.projection !== 'data') return unknown('reference_member_not_bound_root');
            const bindings = input.binding.kind === 'conditional_incoming_node_origins'
                ? input.binding.alternatives : [input.binding];
            if (bindings.some(binding => binding.path?.length || binding.projection !== 'data'
                || !binding.alias && !Array.isArray(binding.aliases))) return unknown('reference_member_root_origin_unknown');
            sources = [...new Set(bindings.flatMap(binding => binding.alias ? [binding.alias] : binding.aliases))];
        } else {
            if (input?.kind !== 'literal' || typeof input.value !== 'string') return unknown('reference_source_alias_not_static');
            sources = [input.value];
            const ref = arguments_[2];
            if (!(ref?.kind === 'literal' && typeof ref.value === 'string') && ref?.kind !== 'scalar')
                return unknown('reference_value_not_conditional_scalar_or_string');
        }
        if (!sources.length || sources.some(alias => !seed.nodes[alias] || seed.nodes[alias].binding !== 'snapshot'))
            return unknown('reference_source_root_not_admitted');
        const candidates = [];
        for (const alias of sources) {
            const descriptor = seed.material_descriptors[alias]?.fields[field];
            if (!descriptor || descriptor.class === 'non_material'
                || !(member ? descriptor.type === 'ref' : ['ref', 'ref_list'].includes(descriptor.type)))
                return unknown('reference_field_not_admitted_material_ref');
            const edges = seed.edges.filter(edge => edge.relation === 'material_ref' && edge.source === alias && edge.field === field);
            if (!edges.length || edges.some(edge => seed.nodes[edge.target]?.binding !== 'snapshot'))
                return unknown('reference_edge_not_admitted_for_each_origin');
            const ref = member ? null : arguments_[2];
            const matches = ref?.kind === 'literal' ? edges.filter(edge => seed.nodes[edge.target].ref_id === ref.value) : edges;
            if (!matches.length || ref?.kind === 'literal' && matches.length !== 1)
                return unknown('reference_literal_has_no_unique_admitted_match');
            candidates.push(...matches);
        }
        if (candidates.length > 256) return unknown('finite_reference_target_bound');
        const roots = candidates.map(edge => {
            const target = rootNode(edge.target);
            return cap('node', { ...target.binding, reference_link: { operation: name, edge_id: edge.id,
                source_alias: edge.source, source_identity: seed.nodes[edge.source], field,
                source_argument_sha256: sha(input),
                reference_argument_sha256: member ? null : sha(arguments_[2]),
                reference_value_and_owner_not_evaluated: true },
                return_conditions: conditions(false, [...target.binding.return_conditions.obligations,
                    'normal_unique_reference_match_and_string_value',
                    member ? 'normal_unique_owned_root_member_and_identity' : 'normal_declared_source_root_and_reference_field',
                    'normal_reference_traversal_and_health']) });
        });
        // Enumerate possible roots only. No reference value, branch or owner is
        // chosen here; the native ownership/string/unique-match guards remain
        // obligations. Multiple sources/targets retain every bound alternative.
        return roots.slice(1).reduce((left, right) => joinNodeOrigins(left, right), roots[0]);
    }
    function methodResult(method, arguments_) {
        const { receiver, name, rule } = method, literal = index => arguments_[index]?.kind === 'literal' ? arguments_[index].value : null;
        if (['child_proof_operands', 'child_derivation_guard'].includes(receiver.surface)) {
            if (name === 'node') return typeof literal(0) === 'string' ? rootNode(literal(0)) : unknown('dynamic_node_alias');
            if (name === 'claim') return rootNode('claim/context');
            if (receiver.surface === 'child_proof_operands' && ['resolveReference', 'memberEdge'].includes(name))
                return materialReferenceResult(name, arguments_);
            if (name === 'set') return typeof literal(0) === 'string' ? namedSet(literal(0), receiver.surface === 'child_derivation_guard')
                : unknown('dynamic_set_name');
            if (name === 'edge') {
                const edge = seed.edges.find(edge => edge.id === literal(0) && edge.relation === 'material_ref');
                return edge ? rootNode(edge.target) : unknown('dynamic_or_unknown_edge');
            }
            if (name === 'select' && receiver.surface === 'child_proof_operands') {
                const selection = seed.selected_sets.find(row => row.candidate_set === literal(0) && row.selected_set === literal(1));
                const population = selection ? namedSet(selection.candidate_set, false) : null;
                return population?.kind === 'capability' ? cap('node_set', { ...population.binding,
                    membership: 'runtime_selected_not_fixture_output', selected_set: selection.selected_set,
                    return_conditions: conditions(false, ['normal_selection_target_binding_and_one_use', 'normal_callback_boolean_and_health',
                        'runtime_selected_membership_order_and_cardinality']) }) : unknown('selection_target_or_population_not_admitted');
            }
        }
        if (receiver.surface === 'node') {
            const binding = receiver.binding, shape = binding.shape;
            if (name === 'get') {
                const field = literal(0), child = typeof field === 'string' && shape?.type === 'record' ? shape.fields[field] : null;
                if (!child || child.type === 'non_material') return unknown('non_material_or_unknown_field');
                if (child.type === 'unknown') return unknown(child.reason);
                const return_conditions = conditions(true, ['normal_record_field_admission', 'runtime_field_presence', 'normal_health_and_scope']);
                if (child.type === 'scalar') return { kind: 'scalar', origin: binding, return_model: rule.returns, return_conditions };
                return cap('node', derivedBinding(binding, { shape: child, path: [...binding.path, field], return_conditions },
                    alternative => ({ ...alternative, shape: alternative.shape.fields[field],
                        path: [...alternative.path, field], return_conditions })));
            }
            if (name === 'at') {
                if (shape?.type !== 'sequence') return unknown('sequence_shape_not_admitted');
                const index = literal(0);
                if (!Number.isSafeInteger(index) || index < 0 || Object.is(index, -0)) return unknown('dynamic_or_invalid_sequence_index');
                const return_conditions = conditions(true, ['normal_index_admission', 'runtime_cardinality_and_presence', 'normal_health_and_scope']);
                return shape.item.type === 'scalar' ? { kind: 'scalar', origin: binding, return_model: rule.returns, return_conditions }
                    : cap('node', derivedBinding(binding, { shape: shape.item, path: [...binding.path, index], return_conditions },
                        alternative => ({ ...alternative, shape: alternative.shape.item,
                            path: [...alternative.path, index], return_conditions })));
            }
            if (name === 'keys') {
                if (binding.projection !== 'data') return unknown('keys_requires_data_projection');
                const update = { shape: { type: 'sequence', item: { type: 'scalar' } }, projection: 'keys',
                    return_conditions: conditions(false, ['normal_data_projection', 'runtime_key_presence_and_order', 'normal_health_and_scope']) };
                return cap('node', derivedBinding(binding, update, alternative => ({ ...alternative, ...update })));
            }
            if (name === 'traverse' || name === 'follow') {
                if (binding.path?.length || binding.projection !== 'data' || !binding.alias) return unknown('traversal_requires_single_root');
                const edges = seed.edges.filter(edge => edge.source === binding.alias
                    && edge.relation === 'material_ref' && (name === 'traverse' ? edge.id === literal(0)
                        : edge.field === literal(0) && seed.material_descriptors[binding.alias]?.fields[edge.field]?.type === 'ref'));
                if (edges.length !== 1) return unknown('dynamic_or_ambiguous_admitted_edge');
                const target = rootNode(edges[0].target);
                return target.kind === 'capability' ? cap('node', { ...target.binding,
                    return_conditions: conditions(false, ['normal_exact_admitted_edge_and_root_ownership', 'normal_health_and_scope']) }) : target;
            }
            if (['length', 'includes', '@@iterator'].includes(name) && shape?.type !== 'sequence') return unknown('sequence_shape_not_admitted');
            if (name === 'includes' && shape.item.type !== 'scalar') return unknown('membership_requires_scalar_items');
            if (name === 'identity' && (binding.path?.length || binding.projection !== 'data')) return unknown('identity_requires_root_data_projection');
            if (name === 'has' && (shape?.type !== 'record' || typeof literal(0) !== 'string'
                || !shape.fields[literal(0)] || shape.fields[literal(0)].type === 'non_material')) return unknown('non_material_or_unknown_field');
        }
        if (['node_set', 'guard_input_set'].includes(receiver.surface)) {
            if (name === 'select') return cap('node_set', { ...receiver.binding,
                membership: 'runtime_selected_not_fixture_output',
                return_conditions: conditions(false, ['normal_callback_boolean_and_health', 'runtime_selected_membership_order_and_cardinality']) });
            if (name === 'at') {
                const index = literal(0);
                if (!Number.isSafeInteger(index) || index < 0 || Object.is(index, -0)) return unknown('dynamic_or_invalid_member_index');
                if (receiver.surface === 'guard_input_set' && index >= receiver.binding.aliases.length) return unknown('guard_member_index_outside_authored_roster');
                return nodePopulation({ kind: 'conditional_normal_set_member', aliases: receiver.binding.aliases,
                    population: receiver.binding, membership: receiver.binding.membership }, receiver.surface === 'node_set');
            }
        }
        if (rule.returns === 'same_iterator') return receiver;
        if (['node_iterator', 'set_iterator', 'guard_set_iterator'].includes(rule.returns)) return cap(rule.returns, receiver.binding);
        // Exact models, never substring matching: get/at may return a child
        // handle and must not become scalar merely because their union says so.
        if (['pinned_civil_date_scalar', 'admitted_root_identity_scalar', 'presence_boolean', 'cardinality_scalar',
            'scalar_membership_boolean', 'alias_membership_boolean', 'admitted_input_population_membership_boolean',
            'admitted_input_roster_cardinality_without_observation'].includes(rule.returns)) return { kind: 'scalar',
            origin: receiver.binding, return_model: rule.returns,
            return_conditions: conditions(false, ['normal_method_preconditions_and_health']) };
        // Returned capabilities above are CONDITIONAL models only. Absence,
        // membership, health, shape and effects are not discharged statically.
        // A parent/claim shape or unresolved return remains blocked, not guessed.
        return unknown('return_model_requires_shape_membership_or_effect_proof:' + rule.returns);
    }
    function value(index, term, seen = new Set()) {
        if (!term) return unknown('missing_term');
        if (seen.size >= 256) return unknown('finite_origin_bound');
        if (term.kind === 'literal') return term.passive_primitive ? { kind: 'literal', value: term.value } : unknown('non_primitive_literal');
        if (term.kind === 'local_function') return { kind: 'callable', module: term.module,
            function_id: term.function_id, body_sha256: term.body_sha256 };
        if (term.kind === 'object') {
            const names = term.properties.map(row => row.name);
            if (names.some(name => name === null || name === '__proto__') || new Set(names).size !== names.length)
                return unknown('non_passive_record');
            return { kind: 'passive_record', module_index: index, properties: term.properties };
        }
        if (term.kind === 'array') return { kind: 'passive_array', module_index: index, elements: term.elements };
        if (term.kind === 'import_namespace') {
            const name = path.posix.normalize(path.posix.join(path.posix.dirname(modules[index].path), term.specifier));
            const targetIndex = byPath.get(name.endsWith('.js') ? name : name + '.js');
            if (targetIndex === undefined || modules[targetIndex].module_namespace_mutated) return unknown('unresolved_or_mutated_import_namespace');
            return { kind: 'module_namespace', module_index: targetIndex };
        }
        if (term.kind === 'binding') {
            const name = key(index, term.binding);
            if (seen.has(name)) return unknown('origin_alias_cycle');
            const next = new Set(seen); next.add(name);
            const row = origins[index].get(term.binding);
            if (row?.mutable || modules[index].invalid_member_bindings.includes(term.binding)) return unknown('mutated_origin');
            if (parameters.has(name)) return parameters.get(name);
            if (row?.definitions.length !== 1) return unknown('ambiguous_origin');
            if (row.definitions[0].kind === 'parameter') return null;
            return value(index, row.definitions[0], next);
        }
        if (term.kind === 'member') {
            if (term.optional || term.property === null) return unknown('dynamic_or_optional_member');
            const receiver = value(index, term.receiver, seen);
            if (!receiver) return null;
            if (receiver.kind === 'module_namespace') {
                const exported = modules[receiver.module_index].export_bindings.find(row => row.name === term.property);
                return exported?.target?.kind === 'local_function' ? { ...exported.target, kind: 'callable' }
                    : unknown('unresolved_imported_function_value');
            }
            if (receiver.kind === 'passive_record') {
                const property = receiver.properties.find(row => row.name === term.property);
                return property ? value(receiver.module_index, property.term, seen) : unknown('unknown_passive_property');
            }
            if (receiver.kind !== 'capability') return unknown('receiver_not_bound_capability');
            if (receiver.surface === 'metric_operands') {
                const role = seed.operands.find(row => row.role_ref.role_id === term.property);
                if (!role) return unknown('role_not_in_authorial_seed');
                if (role.kind === 'node') return rootNode(role.alias);
                if (role.kind === 'claim_context') return rootNode('claim/context');
                if (role.kind === 'node_set') return cap('node_set', { kind: 'authored_role_population', role: term.property,
                    aliases: role.aliases, membership: 'admitted_input_roster' });
                return unknown('live_parent_receipt_not_admitted');
            }
            const definition = surfaces.get(receiver.surface)?.methods.find(method => method.name === term.property);
            if (!definition) return unknown('method_not_in_bound_surface');
            return { kind: 'capability_method', name: definition.name, receiver, rule: definition.rule,
                definition_sha256: definition.source_sha256, exposed_property_sha256: definition.exposed_property_sha256 };
        }
        if (term.kind === 'call_result') {
            const name = index + ':call@' + term.site;
            if (seen.has(name)) return unknown('recursive_origin_return');
            const next = new Set(seen); next.add(name);
            const call = calls[index].get(term.site);
            if (!call || call.operation !== 'CallExpression' || call.optional) return unknown('unsupported_origin_invocation');
            const target = callable(index, call, next);
            if (!target) return null;
            if (target.kind === 'capability_method') return methodResult(target, call.arguments.map(argument => value(index, argument, next)));
            if (target.kind === 'shared_passive_constructor') return value(index, call.arguments[0], next);
            if (target.kind !== 'callable') return unknown('unresolved_origin_call');
            const targetIndex = byPath.get(target.module), boundary = modules[targetIndex]?.function_boundaries.find(row => row.function_id === target.function_id);
            if (!boundary?.transparent_return_grammar || boundary.returns.length !== 1 || !call.argument_syntax_effect_free)
                return unknown('return_body_or_effects_unresolved');
            if (boundary.passive_constructor_sites.some(site => {
                const constructor = calls[targetIndex].get(site)?.target;
                return constructor?.kind !== 'intrinsic_member' || constructor.name !== 'Object' || constructor.property !== 'freeze';
            })) return unknown('passive_constructor_not_bound_intrinsic');
            return value(targetIndex, boundary.returns[0].value, next);
        }
        return unknown('unsupported_origin_expression:' + term.kind);
    }
    function callable(index, call, seen = new Set()) {
        if (call.passive_freeze_construction) return call.target?.kind === 'intrinsic_member'
            && call.target.name === 'Object' && call.target.property === 'freeze'
            ? { kind: 'shared_passive_constructor', name: 'Object.freeze', runtime_effects_proved: false }
            : unknown('passive_constructor_not_bound_intrinsic');
        if (call.target?.kind === 'local_function') return { ...call.target, kind: 'callable' };
        return value(index, call.callee, seen);
    }
    // Monotone finite formals: bottom → known node alternatives → unknown for
    // incompatible/non-capability contexts. No branch reachability is inferred. All
    // syntactic calls in activated functions are potential consumers.
    do {
        changed = false;
        modules.forEach((module, index) => module.call_bindings.forEach(call => {
            if (call.enclosing_function && !active.has(index + ':' + call.enclosing_function)) return;
            const target = callable(index, call);
            if (target?.kind === 'capability_method' && target.rule.callback) {
                const proofSelect = target.receiver.surface === 'child_proof_operands' && target.name === 'select';
                const callbackIndex = proofSelect ? 2 : 0;
                const callback = value(index, call.arguments[callbackIndex]);
                const args = proofSelect ? call.arguments.slice(0, 2).map(argument => value(index, argument)) : null;
                const selection = proofSelect ? seed.selected_sets.find(row => row.candidate_set === args[0]?.value && row.selected_set === args[1]?.value) : null;
                const population = proofSelect ? selection ? namedSet(selection.candidate_set, false)
                    : unknown('selection_target_or_population_not_admitted') : target.receiver;
                if (callback?.kind === 'callable') {
                    const targetIndex = byPath.get(callback.module), boundary = modules[targetIndex]?.function_boundaries.find(row => row.function_id === callback.function_id);
                    if (boundary) {
                        const callbackKey = targetIndex + ':' + boundary.function_id;
                        if (!active.has(callbackKey)) { active.add(callbackKey); changed = true; }
                        const binding = { source_module: module.path, source_site: call.site, callback_argument_index: callbackIndex,
                            target: callback, definition_sha256: target.definition_sha256, declaration: target.rule.callback,
                            population: population ?? unknown('unbound_callback_population'),
                            member_scope: 'every_admitted_input_member_not_selected_fixture_roster', effects_proved: false };
                        callbackBindings.set(index + ':' + call.site, binding);
                        boundary.parameters.forEach((parameter, n) => {
                            if (parameter.binding !== null) merge(key(targetIndex, parameter.binding), n === 0
                                ? nodePopulation({ kind: 'normal_callback_member', population: binding.population,
                                    membership: 'runtime_admitted_population_not_fixture_output' })
                                : n === 1 ? { kind: 'scalar', return_model: 'normal_callback_index' }
                                    : unknown('callback_parameter_not_declared'));
                        });
                    }
                }
                return;
            }
            if (target?.kind !== 'callable') return;
            const targetIndex = byPath.get(target.module), boundary = modules[targetIndex]?.function_boundaries.find(row => row.function_id === target.function_id);
            if (!boundary) return;
            const name = targetIndex + ':' + boundary.function_id;
            if (!active.has(name)) { active.add(name); changed = true; }
            boundary.parameters.forEach((parameter, n) => {
                if (parameter.binding !== null) merge(key(targetIndex, parameter.binding),
                    call.arguments[n] ? value(index, call.arguments[n]) : unknown('missing_actual_argument'));
            });
        }));
    } while (changed);
    const rows = modules.flatMap((module, index) => module.call_bindings.map(call => {
        const target = callable(index, call), potential = call.enclosing_function === null || active.has(index + ':' + call.enclosing_function);
        return { module: module.path, site: call.site, enclosing_function: call.enclosing_function,
            potential_consumer: potential, target_origin: target ?? unknown('unbound_formal'),
            declared_observation_operations: target?.kind === 'capability_method' ? target.rule.observation_operations : null,
            return_origin: value(index, { kind: 'call_result', site: call.site }) ?? unknown('unbound_return'),
            runtime_dominance_and_effects_proved: false };
    }));
    const projection = freezeDeep({ stage: 'finite_conditional_receiver_origin_projection', fact_key: seed.fact_key, root_surface: rootKind,
        bound_module_inventory_sha256: sha({ entry: bundle.entry, export_name: bundle.export_name,
            sources: modules.map(module => ({ path: module.path, sha256: module.source_sha256 })) }), authored_seed_sha256: sha(seed),
        normal_factory_reference_sha256: childData.normal_factory_reference_sha256,
        child_source_sha256: childData.source.sha256, calls: rows,
        parameter_origins: [...parameters].map(([binding, origin]) => ({ binding, origin })),
        callback_bindings: [...callbackBindings.values()],
        active_function_definitions: [...active],
        projection_sha256: sha(rows), conditional_capability_calls: rows.filter(row => row.target_origin.kind === 'capability_method').length,
        unresolved_potential_calls: rows.filter(row => row.potential_consumer && !['callable', 'capability_method'].includes(row.target_origin.kind)).length,
        all_conditional_bindings_require_complete_effect_closure: true, operational_receiver_authority: false,
        effect_closure_complete: false, guest_call_provenance_complete: false, executable_consumer_absence_proved: false,
        necessary_equivalence_proved: false, qualified: false, semantic_mutation_credit: 0 });
    const callsBySite = new Map(rows.map(row => [row.module + ':' + row.site, row]));
    const obligations = modules.flatMap(module => {
        const boundaries = new Map(module.function_boundaries.map(row => [row.function_id, row]));
        return module.effect_sites.map(site => {
        const call = site.kind === 'call' ? callsBySite.get(module.path + ':' + site.site) : null;
        const boundary = boundaries.get(site.enclosing_function);
        const target = call?.target_origin;
        return { module: module.path, source_sha256: module.source_sha256, ...site,
            enclosing_definition_sha256: boundary?.body_sha256 ?? null,
            binding: target ?? null,
            relation: target?.kind === 'capability_method' ? 'conditional_normal_capability_contract'
                : target?.kind === 'callable' ? 'callee_and_callback_effects_required' : 'undischarged_syntax_effect',
            declared_observation_operations: call?.declared_observation_operations ?? null,
            premises: target?.kind === 'capability_method'
                ? ['genuine_runtime_receiver', 'normal_factory_and_body_binding', 'runtime_guard_preconditions',
                    'arguments_and_callbacks_effect_closure', 'complete_consumers_and_effects']
                : target?.kind === 'callable' ? ['callee_body_and_formals_binding', 'transitive_effects_and_callbacks']
                    : ['indirect_hooks_and_runtime_effects_not_discharged'],
            discharged: false };
        });
    });
    const basis = { fact_key: seed.fact_key, root_surface: rootKind,
        receiver_reference_sha256: sha(projection),
        sources: modules.map(module => ({ path: module.path, source_sha256: module.source_sha256,
            effect_sites_sha256: module.effect_sites_sha256 })),
        obligations, dependencies: rows, callback_dependencies: projection.callback_bindings,
        scope: 'every_module_and_function_syntax_no_reachability_or_escape_exclusion' };
    compositionSeals.set(projection, freezeDeep({ stage: 'finite_effect_obligation_composition', ...basis,
        composition_sha256: sha(basis), status: 'blocked_missing_effect_discharge',
        obligation_inventory_complete: true, conditional_links_are_proofs: false,
        effect_closure_complete: false, guest_call_provenance_complete: false,
        executable_consumer_absence_proved: false, necessary_equivalence_proved: false,
        qualified: false, semantic_mutation_credit: 0 }));
    return projection;
}
```

## src/next/kernel/canonicalJson.js

SHA-256 f350630d0e50d0ae5695cfd2b11f107ecfd0f1d23514f14233a2c1afbc58b592; Git blob 0062e7264f047889294f851dd5e48fc68a266983; bytes 1985.

```javascript
'use strict';

// Adapted from the v1 projector's stableStringify. Unlike its input path,
// this accepts only plain JSON and safe integers; it never coerces money.
function canonicalValue(value, ancestors = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0)) return String(value);
    if (!value || typeof value !== 'object' || ancestors.has(value)) throw new Error('canonical_json_invalid');
    const array = Array.isArray(value);
    if (!array && Object.getPrototypeOf(value) !== Object.prototype) throw new Error('canonical_json_invalid');
    if (Object.getOwnPropertySymbols(value).length) throw new Error('canonical_json_invalid');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const [key, descriptor] of Object.entries(descriptors)) {
        if (array && key === 'length') continue;
        if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value') ||
            ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('canonical_json_invalid');
    }
    ancestors.add(value);
    let output;
    if (array) {
        if (Object.keys(value).length !== value.length ||
            Object.keys(value).some((key, index) => key !== String(index))) throw new Error('canonical_json_invalid');
        output = '[' + value.map(item => canonicalValue(item, ancestors)).join(',') + ']';
    } else {
        output = '{' + Object.keys(value).sort().map(key =>
            JSON.stringify(key) + ':' + canonicalValue(value[key], ancestors)).join(',') + '}';
    }
    ancestors.delete(value);
    return output;
}

function freezeDeep(value) {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value)) freezeDeep(child);
        Object.freeze(value);
    }
    return value;
}

module.exports = { canonicalValue, freezeDeep };
```

## src/next/kernel/canonicalValue.js

SHA-256 f6d571ddc1c7917f6a0ec8e25b17368c3e23ba10111ea5aa591c692d6739205b; Git blob 75aa19edcf5ab77540d49c4973e10c48d9dcf9c1; bytes 2146.

```javascript
'use strict';

const { createHash } = require('node:crypto');

// Adapted from the v1 projector's stableStringify. Unlike its input path,
// this accepts only plain JSON and safe integers; it never coerces money.
function canonicalValue(value, ancestors = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0)) return String(value);
    if (!value || typeof value !== 'object' || ancestors.has(value)) throw new Error('canonical_json_invalid');
    const array = Array.isArray(value);
    if (!array && Object.getPrototypeOf(value) !== Object.prototype) throw new Error('canonical_json_invalid');
    if (Object.getOwnPropertySymbols(value).length) throw new Error('canonical_json_invalid');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const [key, descriptor] of Object.entries(descriptors)) {
        if (array && key === 'length') continue;
        if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value') ||
            ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('canonical_json_invalid');
    }
    ancestors.add(value);
    let output;
    if (array) {
        if (Object.keys(value).length !== value.length ||
            Object.keys(value).some((key, index) => key !== String(index))) throw new Error('canonical_json_invalid');
        output = '[' + value.map(item => canonicalValue(item, ancestors)).join(',') + ']';
    } else {
        output = '{' + Object.keys(value).sort().map(key =>
            JSON.stringify(key) + ':' + canonicalValue(value[key], ancestors)).join(',') + '}';
    }
    ancestors.delete(value);
    return output;
}

function digest(value) {
    return createHash('sha256').update(canonicalValue(value)).digest('hex');
}

function freezeDeep(value) {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value)) freezeDeep(child);
        Object.freeze(value);
    }
    return value;
}

module.exports = { canonicalValue, digest, freezeDeep };
```

## src/next/kernel/expenseReadModel.js

SHA-256 39bbdb7809cef065878bae8c67878fc90b91f0404dc5ecd6f37e5e9c1a4a773f; Git blob b112310e170e6aa744f376da18690ef9fd03f762; bytes 16729.

```javascript
'use strict';

const { canonicalValue, digest, freezeDeep } = require('./canonicalValue');
const { projectObservations } = require('./observationKernel');
const { createReadOnlyToolGateway } = require('../tools/readOnlyToolGateway');
const FILTER_FIELDS = ['category', 'subcategory', 'account', 'card'];

function reject(reason, coverage = 'unavailable') {
    return { ok: false, reason, coverage };
}

function monthBounds(period) {
    if (typeof period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return null;
    const year = Number(period.slice(0, 4)), month = Number(period.slice(5));
    if (year < 1000 || year > 9999) return null;
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return [period + '-01', period + '-' + String(days)];
}

function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function completeCoverageEndsByAsOf(coverage) {
    return coverage.completeness !== 'complete' ||
        coverage.as_of >= coverage.end + 'T23:59:59.999Z';
}

function publicSelectorMaps(publicLabels, catalog) {
    const hasSubcategories = Object.hasOwn(catalog, 'subcategories');
    if (!publicLabels || Array.isArray(publicLabels) || typeof publicLabels !== 'object' ||
        Object.keys(publicLabels).sort().join(',') !== (hasSubcategories
            ? 'accounts,cards,categories,family,people,subcategories' : 'accounts,cards,categories,family,people')) {
        throw new Error('public_labels_invalid');
    }
    const allInternalIds = [catalog.family_id, ...catalog.people.map(v => v.id),
        ...catalog.accounts.map(v => v.id), ...catalog.cards.map(v => v.id),
        ...catalog.categories.map(v => v.id), ...(catalog.subcategories || []).map(v => v.id)];
    const validLabel = value => typeof value === 'string' && value === value.trim() &&
        value.length >= 1 && value.length <= 80 && !/[\u0000-\u001f\u007f]/.test(value) &&
        !allInternalIds.some(id => value.toLowerCase().includes(id.toLowerCase()));
    if (!validLabel(publicLabels.family)) throw new Error('public_labels_invalid');
    const result = { family: publicLabels.family };
    for (const [name, entries] of [['people', catalog.people], ['accounts', catalog.accounts],
        ['cards', catalog.cards], ['categories', catalog.categories],
        ...(hasSubcategories ? [['subcategories', catalog.subcategories]] : [])]) {
        const labels = publicLabels[name];
        if (!labels || Array.isArray(labels) || typeof labels !== 'object' ||
            Object.keys(labels).sort().join(',') !== entries.map(entry => entry.id).sort().join(',')) {
            throw new Error('public_labels_invalid');
        }
        const byLabel = new Map(), byId = new Map();
        for (const entry of entries) {
            const label = labels[entry.id];
            if (!validLabel(label) || byLabel.has(label)) throw new Error('public_labels_invalid');
            byLabel.set(label, entry.id);
            byId.set(entry.id, label);
        }
        result[name] = { byLabel, byId };
    }
    return result;
}

function createExpenseReadModel(input) {
    const { observations, catalog, sourceInstanceRef, coverage: rawCoverage, policyVersion } = JSON.parse(canonicalValue(input));
    const subcategoriesEnabled = policyVersion === 'next02-import-v4';
    const billingEnabled = subcategoriesEnabled || policyVersion === 'next02-import-v3';
    if (Object.keys(input).sort().join(',') !== (billingEnabled
        ? 'catalog,coverage,observations,policyVersion,sourceInstanceRef'
        : 'catalog,coverage,observations,sourceInstanceRef')) {
        throw new Error('read_model_input_invalid');
    }
    const coverages = billingEnabled ? rawCoverage : [rawCoverage];
    if (!Array.isArray(coverages) || coverages.length > 4) throw new Error('read_coverage_invalid');
    const coverageKeys = new Set();
    for (const coverage of coverages) {
    const expectedKeys = billingEnabled ? 'as_of,completeness,end,evidence_state,start,time_basis'
        : 'as_of,completeness,end,start';
    if (!coverage || Object.keys(coverage).sort().join(',') !== expectedKeys ||
        (billingEnabled && (!['transaction_date', 'billing_period'].includes(coverage.time_basis) ||
            !['confirmed', 'projected'].includes(coverage.evidence_state))) ||
        !['complete', 'partial', 'unknown', 'unavailable'].includes(coverage.completeness) ||
        typeof coverage.as_of !== 'string' || !Number.isFinite(Date.parse(coverage.as_of)) ||
        new Date(coverage.as_of).toISOString() !== coverage.as_of ||
        !(validDate(coverage.start) && validDate(coverage.end) && coverage.start <= coverage.end)) {
        throw new Error('read_coverage_invalid');
    }
    if ((!billingEnabled || coverage.evidence_state === 'confirmed') &&
        !completeCoverageEndsByAsOf(coverage)) throw new Error('read_coverage_as_of_invalid');
    const key = billingEnabled ? coverage.time_basis + ':' + coverage.evidence_state : 'legacy';
    if (coverageKeys.has(key)) throw new Error('read_coverage_duplicate');
    coverageKeys.add(key);
    }
    const snapshot = projectObservations({ observations, catalog, sourceInstanceRef,
        ...(billingEnabled ? { policyVersion } : {}) });
    if (coverages.some(coverage => snapshot.observations.some(o => o.observed_at > coverage.as_of ||
        o.coverage.as_of > coverage.as_of))) throw new Error('snapshot_as_of_mismatch');
    const people = new Set(catalog.people.map(p => p.id));
    const categories = new Set(catalog.categories.filter(c => c.kind === 'expense').map(c => c.id));
    const subcategories = new Map((catalog.subcategories || []).filter(s => categories.has(s.category_id))
        .map(s => [s.id, s.category_id]));
    const accounts = new Set(catalog.accounts.map(a => a.id));
    const cards = new Set(catalog.cards.map(c => c.id));
    const byId = new Map(snapshot.events.map(e => [e.event_id, e]));

    function readConsumption(rawQuery, trustedContext) {
        let query, context;
        try {
            query = JSON.parse(canonicalValue(rawQuery));
            context = JSON.parse(canonicalValue(trustedContext));
        } catch (_) { return reject('query_schema_invalid'); }
        if (!query || Array.isArray(query) ||
            Object.keys(query).some(k => !['period', 'scope', 'timeBasis', 'category', 'account', 'card',
                ...(subcategoriesEnabled ? ['subcategory'] : []),
                ...(billingEnabled ? ['evidenceState'] : [])].includes(k)) ||
            !monthBounds(query.period) || !['family', 'personal'].includes(query.scope) ||
            !(billingEnabled ? ['transaction_date', 'billing_period'].includes(query.timeBasis) &&
                ['confirmed', 'projected'].includes(query.evidenceState) : query.timeBasis === 'transaction_date')) {
            return reject('query_schema_invalid');
        }
        if (!context || context.familyId !== catalog.family_id || !people.has(context.actorId)) {
            return reject('authorized_scope_mismatch');
        }
        for (const [field, allowed] of [['category', categories], ['account', accounts], ['card', cards]]) {
            if (Object.hasOwn(query, field) && !allowed.has(query[field])) return reject('query_filter_invalid');
        }
        if (Object.hasOwn(query, 'subcategory') && (!subcategories.has(query.subcategory) ||
            (query.category !== undefined && query.category !== subcategories.get(query.subcategory)))) {
            return reject('query_filter_invalid');
        }
        const category = query.category ?? subcategories.get(query.subcategory);
        if (query.account !== undefined && query.card !== undefined) return reject('query_filter_invalid');
        if (query.timeBasis === 'billing_period' && query.account !== undefined) return reject('query_filter_invalid');
        const [start, end] = monthBounds(query.period);
        const coverage = billingEnabled ? coverages.find(c => c.time_basis === query.timeBasis &&
            c.evidence_state === query.evidenceState) : coverages[0];
        if (!coverage) return reject('coverage_insufficient', 'incomplete');
        const coverageRef = 'cov_' + digest({ family: catalog.family_id, sourceInstanceRef, coverage });
        if (coverage.completeness === 'unavailable') return reject('source_unavailable');
        if (coverage.completeness !== 'complete' || coverage.start > start || coverage.end < end) {
            return reject('coverage_insufficient', 'incomplete');
        }
        const inScope = e => e.status === 'active' &&
            (query.scope === 'family' || e.person_id === context.actorId) &&
            (category === undefined || e.category_id === category) &&
            (query.subcategory === undefined || e.subcategory_id === null || e.subcategory_id === query.subcategory) &&
            (query.account === undefined || e.account_id === query.account) &&
            (query.card === undefined || e.card_id === query.card);
        const billing = query.timeBasis === 'billing_period';
        const proofEvents = new Map();
        const completeEvidence = event => event && event.coverage.completeness === 'complete' &&
            ['confirmed', 'projected'].includes(event.evidence_state);
        let relevant = snapshot.events.filter(inScope);
        if (billingEnabled) {
            if (billing) {
                for (const schedule of snapshot.installment_schedules) {
                    const purchase = byId.get(schedule.purchase_ref);
                    if (!inScope(purchase)) continue;
                    const evidence = [purchase, ...schedule.installments.map(part => byId.get(part.event_id))];
                    if (schedule.completeness !== 'complete' || !evidence.every(completeEvidence)) {
                        return reject('coverage_insufficient', 'incomplete');
                    }
                    // Absence/double-count protection depends on the whole explicit
                    // schedule, not only the parts selected in the queried month.
                    for (const event of evidence) proofEvents.set(event.event_id, event);
                }
            }
            relevant = relevant.filter(e => billing
                ? e.card_id !== null && (['installment', 'refund'].includes(e.event_kind) ||
                    (e.event_kind === 'purchase' && e.installment_total === null))
                : ['purchase', 'refund'].includes(e.event_kind));
            if (billing && relevant.some(e => e.billing_period === null &&
                (e.evidence_state === query.evidenceState || !['confirmed', 'projected'].includes(e.evidence_state)))) {
                return reject('coverage_insufficient', 'incomplete');
            }
        }
        const scoped = relevant.filter(e => billing ? e.billing_period === query.period :
            e.transaction_date >= start && e.transaction_date <= end);
        if (query.subcategory !== undefined && scoped.some(e => e.subcategory_id === null &&
            (e.evidence_state === query.evidenceState || !['confirmed', 'projected'].includes(e.evidence_state)))) {
            return reject('coverage_insufficient', 'incomplete');
        }
        if (scoped.some(e => ['incomplete', 'unavailable'].includes(e.evidence_state) ||
            (billingEnabled && e.evidence_state === 'estimated') ||
            e.coverage.completeness !== 'complete')) return reject('coverage_insufficient', 'incomplete');
        const selected = scoped.filter(e => e.evidence_state === (billingEnabled ? query.evidenceState : 'confirmed') &&
            (billing || ['purchase', 'refund'].includes(e.event_kind)));
        let total = 0n;
        const refs = new Set([coverageRef]);
        for (const event of selected) {
            total += BigInt(event.amount_minor) * (event.event_kind === 'refund' ? -1n : 1n);
            refs.add(event.event_id + ':v' + event.event_version);
            for (const edge of event.links) {
                const target = byId.get(edge.to_event_id);
                if (billingEnabled && !completeEvidence(target)) return reject('coverage_insufficient', 'incomplete');
                refs.add(target.event_id + ':v' + target.event_version);
            }
        }
        for (const event of proofEvents.values()) refs.add(event.event_id + ':v' + event.event_version);
        if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER)) {
            return reject('amount_overflow');
        }
        return freezeDeep({
            ok: true, coverage: 'complete',
            resultKind: selected.length === 0 ? 'empty' : total === 0n ? 'zero' : 'value',
            claim: {
                metric: 'consumption_total', value: Number(total), unit: 'BRL_minor',
                entity: { kind: query.scope === 'family' ? 'family' : 'person',
                    ref: query.scope === 'family' ? catalog.family_id : context.actorId },
                period: { type: 'calendar_period', value: query.period }, timeBasis: query.timeBasis,
                ...(billingEnabled ? { evidenceState: query.evidenceState } : {}),
                filters: Object.fromEntries(FILTER_FIELDS
                    .filter(k => Object.hasOwn(query, k)).map(k => [k, query[k]]))
            },
            evidence: { coverage: 'complete', state: billingEnabled ? query.evidenceState : 'confirmed',
                refs: [...refs].sort(), asOf: coverage.as_of }
        });
    }

    return Object.freeze({ readConsumption });
}

function createExpenseToolGateway(input) {
    const safe = JSON.parse(canonicalValue(input));
    const subcategoriesEnabled = safe?.policyVersion === 'next02-import-v4';
    const billingEnabled = subcategoriesEnabled || safe?.policyVersion === 'next02-import-v3';
    if (!safe || Object.keys(safe).sort().join(',') !== (billingEnabled
        ? 'catalog,coverage,observations,policyVersion,publicLabels,sourceInstanceRef'
        : 'catalog,coverage,observations,publicLabels,sourceInstanceRef')) {
        throw new Error('tool_model_input_invalid');
    }
    const { publicLabels, ...modelInput } = safe;
    const model = createExpenseReadModel(modelInput);
    const selectors = publicSelectorMaps(publicLabels, modelInput.catalog);
    let responseSequence = 0;
    const requestLocalEvidenceRefs = refs => {
        responseSequence += 1;
        return refs.map((_, index) => `eph_${responseSequence}_${index + 1}`);
    };
    return createReadOnlyToolGateway({
        catalog: [{
            name: 'expenses.sum', mode: 'read_only',
            args: { period: 'string', scope: 'string', timeBasis: 'string',
                category: 'string', account: 'string', card: 'string',
                ...(subcategoriesEnabled ? { subcategory: 'string' } : {}),
                ...(billingEnabled ? { evidenceState: 'string' } : {}) },
            allowedResultFields: ['ok', 'coverage', 'reason', 'resultKind', 'claim', 'evidence']
        }],
        adapters: { 'expenses.sum': ({ args, authorizedContext }) => {
            const internal = { ...args };
            for (const [field, selector] of [['category', selectors.categories],
                ['account', selectors.accounts], ['card', selectors.cards],
                ...(subcategoriesEnabled ? [['subcategory', selectors.subcategories]] : [])]) {
                if (!Object.hasOwn(args, field)) continue;
                const internalId = selector.byLabel.get(args[field]);
                if (!internalId) return reject('query_filter_invalid');
                internal[field] = internalId;
            }
            const result = model.readConsumption(internal, authorizedContext);
            if (!result.ok) return result;
            return {
                ...result,
                claim: {
                    ...result.claim,
                    entity: {
                        kind: result.claim.entity.kind,
                        label: result.claim.entity.kind === 'family'
                            ? selectors.family
                            : selectors.people.byId.get(authorizedContext.actorId)
                    },
                    filters: Object.fromEntries(FILTER_FIELDS
                        .filter(field => Object.hasOwn(args, field)).map(field => [field, args[field]]))
                },
                evidence: { ...result.evidence, refs: requestLocalEvidenceRefs(result.evidence.refs) }
            };
        } }
    });
}

module.exports = { createExpenseReadModel, createExpenseToolGateway };
```

## src/next/kernel/installmentSchedule.js

SHA-256 4af898bd4b96cb29c802f2b22c85da981e4c697db6b3b6bd20d32a18c65a7329; Git blob 1d06f7839f756c900d0a62fd7c92eea1d83f86e4; bytes 4405.

```javascript
'use strict';

const { canonicalValue, freezeDeep } = require('./canonicalValue');

const DIMENSIONS = ['family_id', 'person_id', 'card_id', 'category_id', 'currency'];
const PURCHASE_FIELDS = [...DIMENSIONS, 'event_id', 'amount_minor', 'installment_total'];
const PART_FIELDS = [...DIMENSIONS, 'event_id', 'purchase_ref', 'index', 'total',
    'billing_period', 'amount_minor', 'evidence_state'];

function requireThat(condition, code) {
    if (!condition) throw new Error(code);
}

function exactFields(value, fields) {
    requireThat(value && !Array.isArray(value) && typeof value === 'object' &&
        Object.keys(value).sort().join(',') === [...fields].sort().join(','), 'installment_schema');
}

function identifier(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 128 &&
        value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
}

function positiveAmount(value) {
    return Number.isSafeInteger(value) && value > 0;
}

// Internal, synthetic projection only. Inputs are explicit economic records,
// not model arguments or inferred legacy rows. No schedule is synthesized.
function projectInstallmentSchedule(raw) {
    const input = JSON.parse(canonicalValue(raw));
    exactFields(input, ['purchase', 'installments']);
    const { purchase, installments } = input;
    exactFields(purchase, PURCHASE_FIELDS);
    requireThat([...DIMENSIONS, 'event_id'].every(key => identifier(purchase[key])) &&
        purchase.currency === 'BRL', 'installment_purchase_identity');
    requireThat(positiveAmount(purchase.amount_minor), 'installment_amount');
    // Finite resource bound for this synthetic policy; not a financial maximum.
    requireThat(Number.isInteger(purchase.installment_total) &&
        purchase.installment_total >= 2 && purchase.installment_total <= 999, 'installment_count');
    requireThat(Array.isArray(installments) && installments.length <= purchase.installment_total,
        'installment_count');
    const ids = new Set([purchase.event_id]), indexes = new Set();
    let sum = 0n;
    for (const part of installments) {
        exactFields(part, PART_FIELDS);
        requireThat(identifier(part.event_id) && !ids.has(part.event_id), 'installment_identity');
        requireThat(part.purchase_ref === purchase.event_id &&
            DIMENSIONS.every(key => part[key] === purchase[key]), 'installment_link');
        requireThat(Number.isInteger(part.index) && part.index >= 1 &&
            part.index <= purchase.installment_total && !indexes.has(part.index) &&
            part.total === purchase.installment_total, 'installment_index');
        requireThat(typeof part.billing_period === 'string' &&
            /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(part.billing_period), 'installment_period');
        requireThat(['confirmed', 'projected'].includes(part.evidence_state), 'installment_state');
        requireThat(positiveAmount(part.amount_minor), 'installment_amount');
        ids.add(part.event_id);
        indexes.add(part.index);
        sum += BigInt(part.amount_minor);
    }
    requireThat(sum <= BigInt(purchase.amount_minor), 'installment_amount_exceeds_purchase');
    const missing = Array.from({ length: purchase.installment_total }, (_, i) => i + 1)
        .filter(index => !indexes.has(index));
    // Every missing part must still fit at least one minor unit. This checks
    // feasibility only; it does not synthesize amounts for missing records.
    requireThat(sum + BigInt(missing.length) <= BigInt(purchase.amount_minor),
        'installment_amount_infeasible');
    requireThat(missing.length > 0 || sum === BigInt(purchase.amount_minor), 'installment_amount_mismatch');
    const ordered = installments.sort((a, b) => a.index - b.index).map(part => ({
        ...part,
        field_provenance: Object.fromEntries(PART_FIELDS.map(field =>
            [field, { event_id: part.event_id, field }]))
    }));
    return freezeDeep({
        purchase_ref: purchase.event_id,
        purchase_amount_minor: purchase.amount_minor,
        purchase_field_provenance: { event_id: purchase.event_id, field: 'amount_minor' },
        currency: purchase.currency,
        completeness: missing.length ? 'incomplete' : 'complete',
        missing_indexes: missing,
        observed_total_minor: Number(sum),
        installments: ordered
    });
}

module.exports = { projectInstallmentSchedule };
```

## src/next/kernel/observationKernel.js

SHA-256 4dce0de726ed8f8606bd279f903c6b8bdf4fa4016b6f5033a5938842aff8b130; Git blob 11aadfdeca8d585e6bac889b029e6bd1374850ac; bytes 22778.

```javascript
'use strict';

const { canonicalValue, digest, freezeDeep } = require('./canonicalValue');
const { projectInstallmentSchedule } = require('./installmentSchedule');

const POLICY = 'next02-import-v1';
const INSTALLMENT_POLICY = 'next02-import-v2';
const BILLING_POLICY = 'next02-import-v3';
const SUBCATEGORY_POLICY = 'next02-import-v4';
const hasInstallments = policy => [INSTALLMENT_POLICY, BILLING_POLICY, SUBCATEGORY_POLICY].includes(policy);
const INSTALLMENT_FIELDS = ['installment_total', 'installment_index', 'installment_purchase_ref', 'billing_period'];
const PAYLOAD_FIELDS = [
    'record_type', 'person_id', 'account_id', 'card_id', 'category_id',
    'amount_minor', 'currency', 'transaction_date', 'status',
    'related_record_ref', 'transfer_ref', 'settles_card_id'
];
const OBSERVATION_FIELDS = [
    'schema_version', 'observation_id', 'observation_version', 'previous_observation_id',
    'source_type', 'source_instance_ref', 'source_record_ref', 'source_version',
    'deduplication_key', 'observed_at', 'effective_at', 'coverage', 'normalized_payload',
    'evidence_state', 'field_provenance', 'origin_runtime', 'origin_operation_id',
    'integrity_hash', 'ingestion_policy_version'
];
const KIND_RULES = Object.freeze({
    purchase: { category: 'expense', instrument: 'either' },
    income: { category: 'income', instrument: 'account' },
    transfer: { category: null, instrument: 'account', relation: 'transfer_ref' },
    invoice_payment: { category: null, instrument: 'account', relation: 'settles_card_id' },
    refund: { category: 'expense', instrument: 'either', relation: 'related_record_ref' },
    installment: { category: 'expense', instrument: 'card' }
});

function requireThat(condition, code) {
    if (!condition) throw new Error(code);
}

function exactKeys(value, keys, code) {
    requireThat(value && !Array.isArray(value) && typeof value === 'object' &&
        Object.keys(value).length === keys.length &&
        keys.every(key => Object.hasOwn(value, key)), code);
}

function ref(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(value);
}

function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function instant(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function recordIdentity(o) {
    return [o.source_type, o.source_instance_ref, o.source_record_ref];
}

function observationDeduplicationKey(o) {
    return digest([...recordIdentity(o), o.source_version]);
}

function observationDigest(o) {
    // Validate descriptors before reading values, including when called by
    // a test/import normalizer before integrity_hash has been filled.
    canonicalValue(o);
    const content = { ...o };
    delete content.integrity_hash;
    return digest(content);
}

function indexCatalog(items, fields) {
    requireThat(Array.isArray(items), 'catalog_schema_invalid');
    const map = new Map();
    for (const item of items) {
        exactKeys(item, fields, 'catalog_schema_invalid');
        requireThat(ref(item.id), 'catalog_schema_invalid');
        requireThat(!map.has(item.id), 'catalog_duplicate');
        map.set(item.id, item);
    }
    return map;
}

function validateCatalog(c, policy) {
    exactKeys(c, ['family_id', 'people', 'accounts', 'cards', 'categories',
        ...(policy === SUBCATEGORY_POLICY ? ['subcategories'] : [])], 'catalog_schema_invalid');
    requireThat(ref(c.family_id), 'catalog_schema_invalid');
    const people = indexCatalog(c.people, ['id']);
    const accounts = indexCatalog(c.accounts, ['id', 'owner_id']);
    const cards = indexCatalog(c.cards, ['id', 'owner_id']);
    const categories = indexCatalog(c.categories, ['id', 'kind']);
    for (const item of [...accounts.values(), ...cards.values()]) {
        requireThat(people.has(item.owner_id), 'catalog_owner_unknown');
    }
    for (const item of categories.values()) {
        requireThat(['expense', 'income'].includes(item.kind), 'catalog_category_invalid');
    }
    const subcategories = policy === SUBCATEGORY_POLICY
        ? indexCatalog(c.subcategories, ['id', 'category_id']) : new Map();
    for (const item of subcategories.values()) {
        requireThat(categories.has(item.category_id), 'catalog_subcategory_parent_unknown');
    }
    return { people, accounts, cards, categories, subcategories };
}

function validateObservation(o, sourceInstanceRef, indices, policy) {
    exactKeys(o, OBSERVATION_FIELDS, 'observation_schema_invalid');
    requireThat(o.integrity_hash === observationDigest(o), 'observation_integrity_invalid');
    requireThat(o.origin_runtime === null && o.origin_operation_id === null, 'observation_origin_forbidden');
    requireThat(o.schema_version === 0 && o.source_type === 'import' &&
        o.source_instance_ref === sourceInstanceRef && o.ingestion_policy_version === policy,
    'source_policy_violation');
    for (const key of ['observation_id', 'source_record_ref', 'source_version']) {
        requireThat(ref(o[key]), 'observation_identity_invalid');
    }
    requireThat(Number.isSafeInteger(o.observation_version) && o.observation_version >= 1 &&
        (o.previous_observation_id === null || ref(o.previous_observation_id)), 'observation_identity_invalid');
    requireThat(o.deduplication_key === observationDeduplicationKey(o), 'observation_deduplication_invalid');
    requireThat(instant(o.observed_at) && (o.effective_at === null || instant(o.effective_at)), 'observation_time_invalid');
    requireThat(['confirmed', 'projected', 'estimated', 'incomplete', 'unavailable'].includes(o.evidence_state),
        'evidence_state_invalid');
    exactKeys(o.coverage, ['start', 'end', 'as_of', 'completeness'], 'coverage_schema_invalid');
    requireThat(instant(o.coverage.as_of) &&
        ['complete', 'partial', 'unknown', 'unavailable'].includes(o.coverage.completeness),
    'coverage_schema_invalid');
    const bounded = date(o.coverage.start) && date(o.coverage.end) && o.coverage.start <= o.coverage.end;
    requireThat(bounded || (o.coverage.start === null && o.coverage.end === null &&
        o.coverage.completeness !== 'complete'), 'coverage_range_invalid');
    requireThat(o.coverage.completeness !== 'complete' ||
        o.coverage.as_of >= o.coverage.end + 'T23:59:59.999Z',
        'coverage_as_of_invalid');

    const p = o.normalized_payload;
    const fields = [...PAYLOAD_FIELDS, ...(hasInstallments(policy) ? INSTALLMENT_FIELDS : []),
        ...(policy === SUBCATEGORY_POLICY ? ['subcategory_id'] : [])];
    exactKeys(p, fields, 'payload_schema_invalid');
    exactKeys(o.field_provenance, fields, 'field_provenance_invalid');
    requireThat(fields.every(field => o.field_provenance[field] === o.observation_id), 'field_provenance_invalid');
    requireThat(Object.hasOwn(KIND_RULES, p.record_type) &&
        (p.record_type !== 'installment' || hasInstallments(policy)), 'event_kind_unsupported');
    if (hasInstallments(policy)) {
        const scheduled = p.record_type === 'installment' ||
            (p.record_type === 'purchase' && p.installment_total !== null);
        if (scheduled) {
            requireThat(Number.isInteger(p.installment_total) && p.installment_total >= 2 &&
                p.installment_total <= 999 && p.card_id !== null && p.account_id === null &&
                p.amount_minor > 0, 'installment_schema');
        }
        if (p.record_type === 'installment') {
            requireThat(Number.isInteger(p.installment_index) && p.installment_index >= 1 &&
                p.installment_index <= p.installment_total && ref(p.installment_purchase_ref) &&
                typeof p.billing_period === 'string' && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(p.billing_period) &&
                ['confirmed', 'projected'].includes(o.evidence_state), 'installment_schema');
        } else {
            const explicitBilling = [BILLING_POLICY, SUBCATEGORY_POLICY].includes(policy) && p.card_id !== null && !scheduled &&
                ['purchase', 'refund'].includes(p.record_type);
            requireThat(p.installment_index === null && p.installment_purchase_ref === null &&
                (p.billing_period === null || (explicitBilling && typeof p.billing_period === 'string' &&
                    /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(p.billing_period))) &&
                (scheduled || p.installment_total === null), 'installment_schema');
        }
    }
    requireThat(date(p.transaction_date), 'payload_date_invalid');
    requireThat(!bounded || (p.transaction_date >= o.coverage.start && p.transaction_date <= o.coverage.end),
        'observation_coverage_mismatch');
    requireThat(Number.isSafeInteger(p.amount_minor) && !Object.is(p.amount_minor, -0) &&
        (p.record_type === 'transfer' ? p.amount_minor !== 0 : p.amount_minor >= 0), 'amount_minor_invalid');
    requireThat(p.currency === 'BRL', 'currency_unsupported');
    requireThat(['active', 'tombstoned'].includes(p.status), 'event_status_invalid');
    requireThat(indices.people.has(p.person_id), 'person_unknown');
    const rule = KIND_RULES[p.record_type];
    const account = p.account_id !== null ? indices.accounts.get(p.account_id) : null;
    const card = p.card_id !== null ? indices.cards.get(p.card_id) : null;
    requireThat((Boolean(account) !== Boolean(card)) &&
        (rule.instrument !== 'account' || Boolean(account)) &&
        (rule.instrument !== 'card' || Boolean(card)) &&
        (p.account_id === null || Boolean(account)) && (p.card_id === null || Boolean(card)), 'instrument_invalid');
    // A family card can be used by another family member (v1 behavior).
    // Accounts remain person-owned in this first normalized import policy.
    requireThat(!account || account.owner_id === p.person_id, 'instrument_owner_mismatch');
    if (rule.category === null) {
        requireThat(p.category_id === null, 'category_invalid');
    } else {
        requireThat(indices.categories.has(p.category_id), 'category_unknown');
        requireThat(indices.categories.get(p.category_id).kind === rule.category, 'category_kind_invalid');
    }
    if (policy === SUBCATEGORY_POLICY) {
        requireThat(p.subcategory_id === null || (rule.category !== null &&
            indices.subcategories.has(p.subcategory_id) &&
            indices.subcategories.get(p.subcategory_id).category_id === p.category_id), 'subcategory_binding_invalid');
    }
    for (const field of ['related_record_ref', 'transfer_ref', 'settles_card_id']) {
        requireThat(rule.relation === field ? ref(p[field]) : p[field] === null, 'economic_link_invalid');
    }
    if (p.record_type === 'invoice_payment') {
        requireThat(indices.cards.has(p.settles_card_id), 'invoice_card_unknown');
    }
}

function eventFromObservation(o, familyId, catalogRef, transferTargets) {
    const p = o.normalized_payload;
    const identity = digest([familyId, ...recordIdentity(o)]);
    const canonicalCardId = p.record_type === 'invoice_payment' ? p.settles_card_id : p.card_id;
    const fieldSources = {
        event_kind: 'record_type', person_id: 'person_id', account_id: 'account_id',
        card_id: p.record_type === 'invoice_payment' ? 'settles_card_id' : 'card_id',
        category_id: 'category_id', amount_minor: 'amount_minor',
        currency: 'currency', transaction_date: 'transaction_date', status: 'status'
    };
    const event = {
        schema_version: 0, event_id: 'evt_' + identity,
        event_version: o.observation_version,
        previous_event_version: o.observation_version === 1 ? null : o.observation_version - 1,
        event_kind: p.record_type, family_id: familyId, person_id: p.person_id,
        account_id: p.account_id, card_id: canonicalCardId, category_id: p.category_id,
        amount_minor: p.amount_minor, currency: p.currency,
        transaction_date: p.transaction_date, billing_period: null, due_date: null,
        settlement_date: null, as_of: o.coverage.as_of, status: p.status,
        evidence_state: o.evidence_state, coverage: o.coverage,
        observation_refs: [o.observation_id],
        field_provenance: Object.fromEntries(Object.entries(fieldSources).map(([field, source]) =>
            [field, { observation_id: o.observation_id, field: source }])),
        links: [], economic_identity_key: identity, idempotency_key: o.deduplication_key,
        origin_operation_id: null, receipt_ref: null,
        source_policy_version: o.ingestion_policy_version, created_at: o.observed_at
    };
    if (hasInstallments(o.ingestion_policy_version)) {
        for (const field of INSTALLMENT_FIELDS) {
            event[field] = p[field];
            event.field_provenance[field] = { observation_id: o.observation_id, field };
        }
    }
    if (o.ingestion_policy_version === SUBCATEGORY_POLICY) {
        event.subcategory_id = p.subcategory_id;
        event.field_provenance.subcategory_id = { observation_id: o.observation_id, field: 'subcategory_id' };
    }
    event.field_provenance.family_id = { catalog_ref: catalogRef, field: 'family_id' };
    for (const field of ['coverage', 'evidence_state']) {
        event.field_provenance[field] = { observation_id: o.observation_id, field };
    }
    const related = p.record_type === 'refund' ? p.related_record_ref :
        p.record_type === 'transfer' ? (transferTargets.get(p.transfer_ref) || []).find(r => r !== o.source_record_ref) : null;
    if (related) {
        event.links.push({
            link_type: p.record_type === 'refund' ? 'compensates' : 'originates_from',
            from_event_id: event.event_id,
            to_event_id: 'evt_' + digest([familyId, o.source_type, o.source_instance_ref, related]),
            link_version: o.observation_version,
            provenance: { observation_id: o.observation_id,
                field: p.record_type === 'refund' ? 'related_record_ref' : 'transfer_ref' }
        });
    }
    return event;
}

function link(from, to, type, field) {
    return {
        link_type: type, from_event_id: from.event_id, to_event_id: to.event_id,
        link_version: from.event_version,
        provenance: { observation_id: from.observation_refs[0], field },
        target_event_version: to.event_version
    };
}

function validateRelations(current, observationById) {
    const byRecord = new Map(current.map(e =>
        [observationById.get(e.observation_refs[0]).source_record_ref, e]));
    const refunds = new Map();
    const transfers = new Map();
    for (const e of current) {
        if (e.status !== 'active') continue;
        const p = observationById.get(e.observation_refs[0]).normalized_payload;
        if (e.event_kind === 'refund') {
            const target = byRecord.get(p.related_record_ref);
            requireThat(target && target.status === 'active' && target.event_kind === 'purchase', 'refund_target_invalid');
            requireThat(['family_id', 'person_id', 'account_id', 'card_id', 'category_id', 'subcategory_id', 'currency'].every(k =>
                target[k] === e[k]) && target.transaction_date <= e.transaction_date &&
                (e.evidence_state !== 'confirmed' || target.evidence_state === 'confirmed'), 'refund_dimensions_mismatch');
            const total = (refunds.get(target.event_id) || 0n) + BigInt(e.amount_minor);
            requireThat(total <= BigInt(target.amount_minor), 'refund_exceeds_purchase');
            refunds.set(target.event_id, total);
            e.links = [link(e, target, 'compensates', 'related_record_ref')];
        }
        if (e.event_kind === 'transfer') {
            const pair = transfers.get(p.transfer_ref) || [];
            pair.push(e);
            transfers.set(p.transfer_ref, pair);
        }
    }
    for (const pair of transfers.values()) {
        requireThat(pair.length === 2, 'transfer_pair_invalid');
        const [a, b] = pair;
        requireThat(a.account_id !== b.account_id &&
            ['family_id', 'currency', 'transaction_date', 'evidence_state'].every(k => a[k] === b[k]) &&
            BigInt(a.amount_minor) + BigInt(b.amount_minor) === 0n, 'transfer_pair_invalid');
        // originates_from records the economic pair; it is not an income/expense.
        a.links = [link(a, b, 'originates_from', 'transfer_ref')];
        b.links = [link(b, a, 'originates_from', 'transfer_ref')];
    }
}

function projectObservations(input) {
    // Defensive copy once, with no getters/non-JSON coercion at the boundary.
    const { observations, catalog, sourceInstanceRef, policyVersion = POLICY } = JSON.parse(canonicalValue(input));
    exactKeys(input, ['observations', 'catalog', 'sourceInstanceRef',
        ...(Object.hasOwn(input, 'policyVersion') ? ['policyVersion'] : [])], 'kernel_input_invalid');
    requireThat([POLICY, INSTALLMENT_POLICY, BILLING_POLICY, SUBCATEGORY_POLICY].includes(policyVersion), 'source_policy_violation');
    requireThat(Array.isArray(observations) && ref(sourceInstanceRef), 'kernel_input_invalid');
    const indices = validateCatalog(catalog, policyVersion);
    const byId = new Map(), byDedup = new Map(), chains = new Map();
    for (const o of observations) {
        validateObservation(o, sourceInstanceRef, indices, policyVersion);
        const prior = byId.get(o.observation_id) || byDedup.get(o.deduplication_key);
        if (prior) {
            requireThat(canonicalValue(prior) === canonicalValue(o), 'observation_identity_conflict');
            continue;
        }
        byId.set(o.observation_id, o);
        byDedup.set(o.deduplication_key, o);
        const key = canonicalValue(recordIdentity(o));
        const chain = chains.get(key) || [];
        chain.push(o);
        chains.set(key, chain);
    }
    const transferTargets = new Map();
    for (const o of byId.values()) {
        if (o.normalized_payload.record_type !== 'transfer') continue;
        const key = o.normalized_payload.transfer_ref;
        const records = new Set(transferTargets.get(key) || []);
        records.add(o.source_record_ref);
        requireThat(records.size <= 2, 'transfer_identity_conflict');
        transferTargets.set(key, [...records].sort());
    }
    const catalogRef = 'catalog_' + digest(catalog);
    const history = [], events = [];
    for (const key of [...chains.keys()].sort()) {
        const chain = chains.get(key).sort((a, b) => a.observation_version - b.observation_version);
        for (let i = 0; i < chain.length; i++) {
            const o = chain[i], previous = chain[i - 1];
            requireThat(o.observation_version === i + 1 &&
                o.previous_observation_id === (previous ? previous.observation_id : null) &&
                (!previous || o.observed_at >= previous.observed_at), 'observation_chain_invalid');
            history.push(eventFromObservation(o, catalog.family_id, catalogRef, transferTargets));
        }
        events.push(eventFromObservation(chain[chain.length - 1], catalog.family_id, catalogRef, transferTargets));
    }
    validateRelations(events, byId);
    const schedules = [];
    if (hasInstallments(policyVersion)) {
        const active = events.filter(e => e.status === 'active');
        const byRecord = new Map(active.map(e => [byId.get(e.observation_refs[0]).source_record_ref, e]));
        for (const part of active.filter(e => e.event_kind === 'installment')) {
            const target = byRecord.get(part.installment_purchase_ref);
            requireThat(target && target.event_kind === 'purchase' && target.installment_total !== null &&
                part.transaction_date === target.transaction_date &&
                part.subcategory_id === target.subcategory_id &&
                (part.evidence_state !== 'confirmed' || target.evidence_state === 'confirmed'), 'installment_target_invalid');
            part.links = [link(part, target, 'installment_of', 'installment_purchase_ref')];
        }
        const dimensions = ['family_id', 'person_id', 'card_id', 'category_id', 'currency'];
        for (const purchase of active.filter(e => e.event_kind === 'purchase' && e.installment_total !== null)) {
            const parts = active.filter(e => e.event_kind === 'installment' &&
                e.links[0].to_event_id === purchase.event_id);
            const dims = e => Object.fromEntries(dimensions.map(k => [k, e[k]]));
            const schedule = projectInstallmentSchedule({
                purchase: { ...dims(purchase), event_id: purchase.event_id,
                    amount_minor: purchase.amount_minor, installment_total: purchase.installment_total },
                installments: parts.map(e => ({ ...dims(e), event_id: e.event_id,
                    purchase_ref: purchase.event_id, index: e.installment_index, total: e.installment_total,
                    billing_period: e.billing_period, amount_minor: e.amount_minor, evidence_state: e.evidence_state }))
            });
            const sourceFields = { index: 'installment_index', total: 'installment_total', purchase_ref: 'links' };
            const partById = new Map(parts.map(e => [e.event_id, e]));
            schedules.push({ ...schedule,
                purchase_field_provenance: { event_id: purchase.event_id,
                    event_version: purchase.event_version, field: 'amount_minor' },
                installments: schedule.installments.map(item => ({ ...item,
                    field_provenance: Object.fromEntries(Object.keys(item.field_provenance).map(field =>
                        [field, { event_id: item.event_id, event_version: partById.get(item.event_id).event_version,
                            field: sourceFields[field] || field,
                            ...(field === 'purchase_ref' ? { link_type: 'installment_of',
                                target_event_version: purchase.event_version } : {}) }]))
                }))
            });
        }
    }
    // Each historical event is a projection of its immutable observation.
    // Current relations are resolved only against the complete current snapshot.
    return freezeDeep({
        policy_version: policyVersion,
        family_id: catalog.family_id,
        observations: [...byId.values()].sort((a, b) => a.observation_id < b.observation_id ? -1 : 1),
        history, events,
        ...(hasInstallments(policyVersion) ? { installment_schedules: schedules } : {})
    });
}

module.exports = { observationDigest, observationDeduplicationKey, projectObservations };
```

## src/next/provenance/authoringIR.js

SHA-256 aa3e98a1ebf2d11118ba75dda5e0f89457e31d04eb5b457a5266bd41b099afb4; Git blob ee2d59cfa38a53ac2910ee0059156f5ca99d501c; bytes 7273.

```javascript
'use strict';

const { freezeDeep } = require('../kernel/canonicalValue');
const fail = code => { throw new Error(`authoring_ir_${code}`); };
const clone = value => structuredClone(value);

// Internal lowering after ALL compiler passes. This does not validate an
// arbitrary package, execute a predicate, or promote authoring to runtime.
function lowerAuthoringIR({ documents, graphs, claims, index, operandBindings, predicateTypes,
    selectionBindings, templates }) {
    const byFact = rows => new Map(rows.map(row => [row.fact_key, row]));
    const graphMap = byFact(graphs);
    const claimMap = byFact(claims);
    const bindings = byFact(operandBindings.graphs);
    const types = byFact(predicateTypes.typedGraphs);
    const templateMap = new Map(templates.templates.map(t => [JSON.stringify([t.id, t.version]), t]));
    const parents = byFact(index.graphs);
    for (const map of [graphMap, claimMap, bindings, types, parents]) {
        if (map.size !== index.order.length || index.order.some(key => !map.has(key))) fail('inventory');
    }
    if (operandBindings.stage !== 'operand_bindings_indexed_only'
        || predicateTypes.stage !== 'predicate_types_checked_only' || predicateTypes.unresolved !== 0
        || selectionBindings.stage !== 'selection_bindings_checked_only') fail('pass');

    function lower(arg, allowTemplate = true) {
        if (!arg || typeof arg !== 'object' || Array.isArray(arg)) fail('operand');
        const keys = Object.keys(arg);
        if (Object.hasOwn(arg, 'template')) {
            if (!allowTemplate || keys.length !== 2 || !Object.hasOwn(arg, 'bindings')) fail('template');
            const template = templateMap.get(JSON.stringify([arg.template.id, arg.template.version]));
            if (!template) fail('template');
            const bindings = Object.fromEntries(Object.entries(arg.bindings).map(([name, value]) => [name, lower(value, false)]));
            // Keep the quantifier's current member lexical. Expansion neither
            // substitutes a selected alias nor evaluates a field from payloads.
            const body = template.body.map(predicate => ({ op: predicate.op, operands: predicate.args.map(value => {
                if (Object.hasOwn(value, 'current_member_field_parameter')) {
                    const selector = bindings[value.current_member_field_parameter];
                    if (selector?.kind !== 'field_selector') fail('member');
                    return { kind: 'member_field', slot: 'current_member', node_kind: selector.node_kind,
                        segments: clone(selector.segments) };
                }
                if (!Object.hasOwn(value, 'parameter') || !Object.hasOwn(bindings, value.parameter)) fail('parameter');
                return clone(bindings[value.parameter]);
            }) }));
            return { kind: 'predicate_template', template_ref: clone(arg.template),
                combinator: 'all', member_slot: 'current_member', bindings, body };
        }
        if (keys.length !== 1) fail('operand');
        const key = keys[0];
        const value = arg[key];
        switch (key) {
        case 'node': return { kind: 'node_ref', alias: value };
        case 'field': return { kind: 'field_ref', alias: value.node, segments: clone(value.segments) };
        case 'claim': return { kind: 'claim_ref', segments: clone(value.segments) };
        case 'literal': return { kind: 'literal', value_type: value.type, value: clone(value.value) };
        case 'set': return { kind: 'set_ref', name: value };
        case 'edge': return { kind: 'edge_ref', id: value };
        case 'selector': return { kind: 'field_selector', node_kind: value.kind, segments: clone(value.segments) };
        case 'presence': return { kind: 'field_presence', field: lower({ field: value }) };
        case 'ref_set': return { kind: 'reference_set', field: lower({ field: value.field }) };
        case 'period_ref': return { kind: 'window_ref', name: value };
        case 'period_bound': return { kind: 'window_bound', name: value.period, bound: value.bound };
        case 'period_literal': return { kind: 'period_literal', period: clone(value) };
        case 'projection': return { kind: 'projection', set: lower({ set: value.set }),
            selector: lower({ selector: value.selector }), as: value.as };
        case 'sort': return { kind: 'sort', tie_break: value.tie_break, keys: value.keys.map(key => ({ ...clone(key),
            selector: lower({ selector: key.selector }) })) };
        default: fail('operand_unresolved');
        }
    }
    function lowerWindow(window) {
        if (window.kind === 'month') return { kind: 'month', value: lower(window.value) };
        if (window.kind === 'range') return { kind: 'range', start: lower(window.start), end: lower(window.end),
            start_inclusive: window.start_inclusive, end_inclusive: window.end_inclusive };
        fail('window');
    }
    const rows = index.order.map(fact_key => {
        const graph = graphMap.get(fact_key);
        const claim = claimMap.get(fact_key);
        const typed = types.get(fact_key);
        if (typed.claim_id !== graph.claim_id || typed.predicates.length !== graph.predicates.length
            || typed.predicates.some((p, i) => p.id !== graph.predicates[i].id)) fail('predicates');
        // Explicit projection: no payload, oracle, functional result or metric
        // contract body is reachable through the authoring IR.
        const descriptor = {};
        for (const key of ['claim_id', 'fact_key', 'metric', 'unit', 'subject', 'period', 'time_basis',
            'coverage', 'evidence_state', 'filters', 'evaluator_ref']) {
            if (Object.hasOwn(claim, key)) descriptor[key] = clone(claim[key]);
        }
        return { fact_key, claim_id: graph.claim_id, evaluator_ref: clone(parents.get(fact_key).evaluator_ref),
            claim: descriptor, parents: clone(parents.get(fact_key).parents),
            operands: clone(bindings.get(fact_key).operands), nodes: clone(graph.nodes), sets: clone(graph.sets),
            windows: Object.fromEntries(Object.entries(graph.windows || {}).map(([name, window]) => [name, lowerWindow(window)])),
            edges: clone(graph.edges), predicates: typed.predicates.map(p => ({ id: p.id, op: p.op,
                obligation: p.obligation, atom: p.atom,
                operands: p.operands.map(arg => ({ type: clone(arg.type), expression: lower(arg.source) })) })),
            obligations: clone(graph.obligations), selections: clone(graph.selections),
            // This is an expectation owned by validation, never recorder input
            // and never evidence that any operation was actually observed.
            expected_trace: clone(graph.trace_contract), required_state_checks: selectionBindings.stateChecks
                .filter(check => check.fact_key === fact_key).map(({ node, field, expected }) => ({ node, field, expected })) };
    });
    return freezeDeep({ format: 'financasbot.provenance.authoring-ir', version: 1,
        stage: 'typed_authoring_ir_only', executable: false,
        authority_refs: documents.map(({ path, sha256 }) => ({ path, sha256 })),
        order: [...index.order], graphs: rows });
}

module.exports = { lowerAuthoringIR };
```

## src/next/provenance/claimContext.js

SHA-256 908e44c14d3602fc06284a4e956e0e29fb68497b32f5321200672c6329efa4ae; Git blob 85456a2186424b4812239d8a84df2d1fad9c4413; bytes 3236.

```javascript
'use strict';
const { copyData } = require('./observationContract');
const fail = () => { throw new Error('claim_context_projection'); };
const FIELDS = Object.freeze(['claim_id', 'fact_key', 'metric', 'unit', 'subject', 'period',
    'time_basis', 'coverage', 'evidence_state', 'filters', 'evaluator_ref']);

// Internal projection AFTER claim/schema admission. This is not a schema
// validator. Branches follow explicit schema discriminants, never a guessed
// shape inferred from the JavaScript value. The schema is a trusted, admitted
// authority; it is not supplied by an evaluator. No R or binding table enters.
function projectClaimContext(rawClaim, admittedSchema) {
    const claim = copyData(rawClaim);
    if (!claim || typeof claim !== 'object' || Array.isArray(claim)) fail();
    function project(schema, value, depth = 0, refs = []) {
        if (depth > 32 || !schema || typeof schema !== 'object') fail();
        if (schema.$ref) {
            const match = /^#\/definitions\/([A-Za-z0-9_]+)$/.exec(schema.$ref);
            if (!match || refs.includes(match[1]) || !Object.hasOwn(admittedSchema.definitions, match[1])) fail();
            return project(admittedSchema.definitions[match[1]], value, depth + 1, [...refs, match[1]]);
        }
        if (schema.oneOf) {
            if (!value || typeof value !== 'object') fail();
            const branches = schema.oneOf.filter(branch => (branch.required || []).every(key => Object.hasOwn(value, key))
                && Object.entries(branch.properties || {}).every(([key, item]) =>
                    (!Object.hasOwn(item, 'const') || value[key] === item.const)
                    && (!item.enum || item.enum.includes(value[key]))));
            if (branches.length !== 1) fail();
            return project(branches[0], value, depth + 1, refs);
        }
        if (schema.type === 'object') {
            if (schema.additionalProperties !== false || !schema.properties) fail();
            return { type: 'record', fields: Object.fromEntries(Object.entries(schema.properties).map(([key, child]) =>
                [key, project(child, value?.[key], depth + 1, refs)])) };
        }
        if (schema.type === 'array') {
            if (!schema.items || Array.isArray(schema.items)) fail();
            return { type: 'sequence', item: project(schema.items, undefined, depth + 1, refs) };
        }
        if (['string', 'integer', 'boolean'].includes(schema.type)
            || Array.isArray(schema.enum) && schema.enum.every(v => ['string', 'boolean', 'number'].includes(typeof v))
            || Object.hasOwn(schema, 'const') && ['string', 'boolean', 'number'].includes(typeof schema.const)) return { type: 'scalar' };
        fail();
    }
    const properties = admittedSchema?.definitions?.claim?.properties;
    if (!properties) fail();
    const fields = Object.fromEntries(FIELDS.map(name => {
        if (!Object.hasOwn(properties, name)) fail();
        return [name, project(properties[name], claim[name])];
    }));
    return copyData({ shape: { type: 'record', fields },
        value: Object.fromEntries(FIELDS.filter(name => Object.hasOwn(claim, name)).map(name => [name, claim[name]])) });
}

module.exports = { projectClaimContext };
```

## src/next/provenance/claimNominalTypes.js

SHA-256 f37c4367c027d119caf81afcb1de898a05b5edfd6651c8c3a17d3177cff95096; Git blob a9bea06ab24aa32e571399b1de9404a4d2a6a0de; bytes 774.

```javascript
'use strict';
// Pure nominal rule shared by descriptor requirements and the typed pass.
// No compiler/profile imports: the captured TCB dependency graph stays closed
// and acyclic without duplicating this identity classification.
const subjectKinds = Object.freeze({ source: 'source_state', merchant: 'merchant_identity', transfer_pair: 'transfer_identity' });
function claimReferenceKind(claim, segments) {
    const path = segments.join('.');
    if (path === 'subject.ref_id') return subjectKinds[claim.subject.kind] || claim.subject.kind;
    if (/^subject\.(family|person|category|budget)_id$/.test(path)) return segments[1].slice(0, -3);
    if (path === 'subject.person_ids') return 'person';
    return `claim.${path}`;
}
module.exports = { claimReferenceKind };
```

## src/next/provenance/collectionProofCore.js

SHA-256 4cc88bf36458e46783dfbc1ae24c3f0fc2855e28f29663094ca48be0fe72a8ec; Git blob de36dcfade9dea4108697f9ac14e37a406ec0d93; bytes 2840.

```javascript
'use strict';
const { readObservedIdentity, sequence } = require('./proofObservedValues');

// Relations over values already obtained by observed reads. These do not read
// backing data, decide selection or accept a financial graph.
function createCollectionProofPrimitives(compareTypedScalars) {
    function members(handle, type) {
        if (!['set', 'sequence'].includes(type.form) || type.item?.form !== 'node') throw new Error('proof_expression_set');
        const seen = new Set();
        return sequence(handle, member => {
            const id = readObservedIdentity(member); const key = JSON.stringify([id.kind, id.ref_id, id.version]);
            if (id.kind !== type.item.kind || type.form === 'set' && seen.has(key)) throw new Error('proof_expression_member');
            seen.add(key); return member;
        });
    }
    function sameField(values, type) {
        return values.length > 0 && values.every(value => compareTypedScalars(type, value, values[0]) === 0);
    }
    function join(left, right, type) {
        for (const side of [left, right]) for (let index = 0; index < side.length; index++) for (let previous = 0; previous < index; previous++) {
            if (compareTypedScalars(type, side[index], side[previous]) === 0) throw new Error('proof_expression_join_duplicate');
        }
        return left.length === right.length && left.every(value => right.some(other => compareTypedScalars(type, value, other) === 0));
    }
    function ordered(rows, keys) {
        let ordered = true;
        for (let index = 1; index < rows.length; index++) {
            let comparison = 0;
            for (let key = 0; key < keys.length && comparison === 0; key++) comparison = compareTypedScalars(keys[key].type,
                rows[index - 1].values[key], rows[index].values[key]) * (keys[key].direction === 'asc' ? 1 : -1);
            for (const key of ['kind', 'ref_id', 'version']) {
                if (comparison) break;
                const a = rows[index - 1].identity[key]; const b = rows[index].identity[key];
                comparison = a === b ? 0 : a < b ? -1 : 1;
            }
            if (comparison === 0) throw new Error('proof_expression_sort_unresolved_tie');
            if (comparison > 0) ordered = false;
        }
        return ordered;
    }
    function quantify(nodes, predicate) {
        let all = true; let any = false;
        for (const member of nodes) {
            const conjunction = predicate(member);
            if (typeof conjunction !== 'boolean') throw new Error('proof_expression_template_result');
            if (!conjunction) all = false;
            if (conjunction) any = true;
        }
        return { all, any };
    }
    return Object.freeze({ members, sameField, join, ordered, quantify });
}
module.exports = { createCollectionProofPrimitives };
```

## src/next/provenance/instrumentedAccess.js

SHA-256 0a226802919420fc1e90d07847b96cc120121e230905c0f5cef484c034dedf92; Git blob 84e25bde306e67c65b45b03d6be0ab1523d21b54; bytes 23516.

```javascript
'use strict';
const { types } = require('node:util');
const { copyData, identifier, field, scalar } = require('./observationContract');
const { digest } = require('../kernel/canonicalValue');
const { civilDateInPinnedTimezone } = require('./pinnedCivilTimezone');
const failSetup = () => { throw new Error('access_shape_invalid'); };

// Shape is supplied by trusted schema/registry admission, not by guest. This
// finite transport projection is not a replacement for nominal financial types.
function checkShape(shape) {
    if (!shape || typeof shape !== 'object' || Array.isArray(shape)) failSetup();
    const keys = Object.keys(shape).sort().join(',');
    if (['scalar', 'non_material'].includes(shape.type)) { if (keys !== 'type') failSetup(); return; }
    if (shape.type === 'sequence') {
        if (keys !== 'item,type') failSetup(); checkShape(shape.item);
        if (shape.item.type === 'non_material') failSetup(); return;
    }
    if (shape.type !== 'record' || keys !== 'fields,type' || !shape.fields
        || typeof shape.fields !== 'object' || Array.isArray(shape.fields)) failSetup();
    for (const [key, child] of Object.entries(shape.fields)) { if (!field(key)) failSetup(); checkShape(child); }
}
function checkValue(value, shape) {
    if (shape.type === 'non_material') return;
    if (shape.type === 'scalar') { if (!scalar(value)) failSetup(); return; }
    if (shape.type === 'sequence') {
        if (!Array.isArray(value)) failSetup(); for (const child of value) checkValue(child, shape.item); return;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) failSetup();
    for (const [key, child] of Object.entries(value)) {
        if (!Object.hasOwn(shape.fields, key)) failSetup(); checkValue(child, shape.fields[key]);
    }
}
function frozenInterface(methods) {
    const object = Object.create(null);
    for (const key of Reflect.ownKeys(methods)) {
        const fn = methods[key]; Object.setPrototypeOf(fn, null); Object.freeze(fn);
        Object.defineProperty(object, key, { value: fn, enumerable: typeof key === 'string' });
    }
    return Object.freeze(object);
}

function createInstrumentedAccess(options) {
    // Accessors/Proxy on the control object must not run before data admission.
    if (!options || typeof options !== 'object' || types.isProxy(options)) failSetup();
    const d = Object.getOwnPropertyDescriptors(options);
    if (![2, 3].includes(Reflect.ownKeys(d).length) || Reflect.ownKeys(d).some(k => !['bindings', 'emit', 'links'].includes(k)) || !d.bindings || !d.emit
        || !Object.hasOwn(d.bindings, 'value') || !Object.hasOwn(d.emit, 'value')
        || d.links && !Object.hasOwn(d.links, 'value')
        || typeof d.emit.value !== 'function') failSetup();
    const bindings = copyData(d.bindings.value); const emit = d.emit.value;
    const links = copyData(d.links ? d.links.value : []);
    if (!Array.isArray(bindings) || !bindings.length || bindings.length > 512) failSetup();
    const roots = new Map();
    for (const b of bindings) {
        if (!b || typeof b !== 'object' || Array.isArray(b)
            || !['alias,role,shape,value', 'alias,identity,role,shape,value'].includes(Object.keys(b).sort().join(',')) || !identifier(b.alias) || !identifier(b.role)
            || roots.has(b.alias) || !['record', 'sequence'].includes(b.shape?.type)) failSetup();
        if (Object.hasOwn(b, 'identity')) {
            const id = b.identity;
            if (!id || Object.keys(id).sort().join(',') !== 'kind,ref_id,version'
                || typeof id.kind !== 'string' || !/^[a-z][a-z0-9_]*$/.test(id.kind)
                || typeof id.ref_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$/.test(id.ref_id)
                || typeof id.version !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(id.version)
                || b.shape.type !== 'record' || b.shape.fields.id?.type !== 'scalar' || b.value.id !== id.ref_id) failSetup();
        }
        checkShape(b.shape); checkValue(b.value, b.shape); roots.set(b.alias, b);
    }
    if (!Array.isArray(links) || links.length > 8192) failSetup();
    const relations = new Map();
    for (const link of links) {
        if (!link || typeof link !== 'object' || Array.isArray(link)
            || Object.keys(link).sort().join(',') !== 'field,id,source,target,type'
            || !identifier(link.id) || !identifier(link.source) || !identifier(link.target) || !field(link.field)
            || !['ref', 'ref_list', 'role_ref_list'].includes(link.type) || relations.has(link.id)) failSetup();
        const source = roots.get(link.source); const target = roots.get(link.target);
        const shape = source?.shape.fields?.[link.field];
        if (!source || !target || source.role !== target.role || target.shape.fields?.id?.type !== 'scalar'
            || (link.type === 'ref' ? shape?.type !== 'scalar'
                : shape?.type !== 'sequence' || (link.type === 'ref_list' ? shape.item.type !== 'scalar'
                    : shape.item.type !== 'record' || shape.item.fields.parent_ref?.type !== 'scalar'))) failSetup();
        // The TCB admits the structural relation once, before guest execution.
        // Runtime traversal observes only that admitted edge; it must not create
        // causal reads merely to rediscover the same binding.
        const targetId = target.value.id; const references = source.value[link.field];
        if (typeof targetId !== 'string' || references === undefined) failSetup();
        const matches = link.type === 'ref'
            ? Number(references === targetId)
            : references.filter(item => (link.type === 'ref_list' ? item : item?.parent_ref) === targetId).length;
        if (matches !== 1) failSetup();
        relations.set(link.id, link);
    }
    let revoked = false; let failed = false;
    const rootHandles = new WeakMap();
    function fail(code) { failed = true; throw new Error(`access_${code}`); }
    function check() { if (failed) fail('failed'); if (revoked) fail('revoked'); }
    function event(op, b, path, projection, outcome) {
        check();
        let tuple;
        try { tuple = copyData(['I', op, b.alias, b.role, path, projection, outcome]); }
        catch { fail('event_invalid'); }
        try { emit(tuple); } catch { fail('sink_failed'); }
        check(); // The trusted transport may revoke this scope while accepting I.
    }
    function outcome(value, shape) {
        return shape.type === 'scalar' ? ['scalar', value] : ['container', shape.type];
    }
    function exposed(value, shape, b, path, projection) {
        return shape.type === 'scalar' ? value : handle(value, shape, b, path, projection);
    }
    function handle(value, shape, b, path, projection) {
        function recordField(key) {
            check(); if (shape.type !== 'record' || !field(key) || !Object.hasOwn(shape.fields, key)
                || shape.fields[key].type === 'non_material') fail('field_forbidden');
            return shape.fields[key];
        }
        function sequence() { check(); if (shape.type !== 'sequence') fail('operation_invalid'); }
        function at(index, op = 'at') {
            sequence(); if (!Number.isSafeInteger(index) || index < 0 || Object.is(index, -0)) fail('index_invalid');
            const childPath = [...path, index];
            if (index >= value.length) { event(op, b, childPath, projection, [op === 'next' ? 'done' : 'absent']); return undefined; }
            event(op, b, childPath, projection, outcome(value[index], shape.item));
            return exposed(value[index], shape.item, b, childPath, projection);
        }
        function iterator() {
            sequence(); event('iterate', b, path, projection, ['opened']);
            let index = 0; let closed = false; let result;
            const packet = (done, item) => Object.freeze(Object.assign(Object.create(null), { done, value: item }));
            result = frozenInterface({
                next: () => {
                    check();
                    if (closed || index >= value.length) {
                        event('next', b, [...path, index], projection, ['done']); closed = true; return packet(true, undefined);
                    }
                    const item = at(index, 'next'); index++; return packet(false, item);
                },
                return: () => { check(); event('return', b, path, projection, ['closed', index]); closed = true; return packet(true, undefined); },
                [Symbol.iterator]: () => {
                    event('reuse_iterator', b, path, projection, ['cursor', index, closed]); return result;
                }
            });
            return result;
        }
        const surface = frozenInterface({
            civilDate: (...args) => {
                check();
                if (projection !== 'data' || args.length !== 3) fail('civil_arguments');
                const [key, zone, calendar] = args;
                if (recordField(key).type !== 'scalar') fail('civil_field');
                const instant = handle(value, shape, b, path, projection).get(key);
                let date;
                try { date = civilDateInPinnedTimezone(instant, zone, calendar); }
                catch { fail('civil_conversion'); }
                event('civil_date', b, [...path, key], projection, ['civil', instant, zone, calendar, date]);
                return date;
            },
            identity: key => {
                check();
                if (path.length || projection !== 'data' || !b.identity || !['kind', 'ref_id', 'version'].includes(key)) fail('identity_forbidden');
                const value = b.identity[key]; event('identity', b, [key], 'node_identity', ['scalar', value]); return value;
            },
            follow: (...args) => {
                check();
                if (path.length || projection !== 'data' || args.length !== 1 || !field(args[0])) fail('traversal_forbidden');
                const matches = [...relations.values()].filter(link => link.source === b.alias && link.field === args[0]);
                if (matches.length !== 1 || matches[0].type !== 'ref') fail('traversal_ambiguous');
                // Only resolve the admitted singular address here. Actual
                // source/target values and the traversal are observed by the
                // existing primitive before any target handle is returned.
                return handle(value, shape, b, [], 'data').traverse(matches[0].id);
            },
            followMember: (...args) => {
                check();
                if (path.length || projection !== 'data' || args.length !== 2 || !field(args[0])
                    || typeof args[1] !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$/.test(args[1])) fail('traversal_forbidden');
                const matches = [...relations.values()].filter(link => link.source === b.alias && link.field === args[0]
                    && link.type === 'ref_list' && roots.get(link.target).value.id === args[1]);
                if (matches.length !== 1) fail('traversal_ambiguous');
                // Resolve only an admitted list edge. The caller separately
                // observes the list and its order/cardinality; this address
                // lookup must not manufacture payload or identity reads.
                return handle(value, shape, b, [], 'data').traverse(matches[0].id);
            },
            traverse: edgeId => {
                check();
                const link = typeof edgeId === 'string' ? relations.get(edgeId) : undefined;
                if (path.length || projection !== 'data' || !link || link.source !== b.alias) fail('traversal_forbidden');
                const targetBinding = roots.get(link.target);
                const target = handle(targetBinding.value, targetBinding.shape, targetBinding, [], 'data');
                event('traverse', b, [link.field], 'data', ['edge', link.id, link.target]);
                return target;
            },
            get: key => {
                const child = recordField(key); const childPath = [...path, key];
                if (!Object.hasOwn(value, key)) { event('get', b, childPath, projection, ['absent']); return undefined; }
                event('get', b, childPath, projection, outcome(value[key], child));
                return exposed(value[key], child, b, childPath, projection);
            },
            has: key => { recordField(key); const present = Object.hasOwn(value, key);
                event('has', b, [...path, key], projection, ['boolean', present]); return present; },
            keys: () => {
                check(); if (projection !== 'data') fail('projection_invalid');
                const keys = Object.keys(value).filter(key => shape.type === 'sequence' || shape.fields[key].type !== 'non_material');
                event('keys', b, path, projection, ['keys', ...keys]);
                return handle(Object.freeze(keys), { type: 'sequence', item: { type: 'scalar' } }, b, path, 'keys');
            },
            length: () => { sequence(); event('length', b, path, projection, ['count', value.length]); return value.length; },
            at: index => at(index),
            includes: needle => {
                sequence(); if (shape.item.type !== 'scalar' || !scalar(needle)) fail('membership_invalid');
                const present = value.includes(needle); event('includes', b, path, projection, ['membership', needle, present]); return present;
            },
            [Symbol.iterator]: iterator
        });
        if (path.length === 0 && projection === 'data') rootHandles.set(surface, b.alias);
        return surface;
    }
    return Object.freeze({
        handle: alias => { check(); if (typeof alias !== 'string' || !roots.has(alias)) fail('binding_invalid');
            const b = roots.get(alias); return handle(b.value, b.shape, b, [], 'data'); },
        // TCB-only address/ownership lookup: no guest method or material field
        // is inspected. Foreign/nested/proxied handles never match this map.
        rootAliasIfOwned: handle => { check(); return rootHandles.get(handle); },
        revoke: () => { revoked = true; },
        assertHealthy: () => { if (failed) fail('failed'); }
    });
}

// TCB construction of an ordered operand roster. Members may have different
// admitted snapshot shapes; neither their raw objects nor the roster cross to
// guest code. Structural events describe this role, not a snapshot payload.
function createNodeSetAccess(options) {
    if (!options || typeof options !== 'object' || types.isProxy(options)) failSetup();
    const d = Object.getOwnPropertyDescriptors(options);
    const withLinks = Object.hasOwn(d, 'links') || Object.hasOwn(d, 'roster');
    const expected = withLinks ? ['role', 'bindings', 'emit', 'links', 'roster'] : ['role', 'bindings', 'emit'];
    if (Reflect.ownKeys(d).length !== expected.length || expected.some(k => !d[k] || !Object.hasOwn(d[k], 'value'))
        || typeof d.emit.value !== 'function') failSetup();
    const role = d.role.value; const bindings = copyData(d.bindings.value); const emit = d.emit.value;
    if (!identifier(role) || !identifier(`operand/${role}`) || !Array.isArray(bindings) || bindings.length > 512
        || bindings.some(b => b?.role !== role)) failSetup();
    const links = withLinks ? copyData(d.links.value) : [];
    const aliases = withLinks ? copyData(d.roster.value) : bindings.map(b => b.alias);
    if (!Array.isArray(links) || !Array.isArray(aliases) || new Set(aliases).size !== aliases.length
        || aliases.some(alias => !identifier(alias) || !bindings.some(b => b.alias === alias))
        || !bindings.length && links.length) failSetup();
    const members = bindings.length ? createInstrumentedAccess({ bindings, emit, links }) : null;
    const b = { alias: `operand/${role}`, role };
    let revoked = false; let failed = false; let selectionBusy = false; let selectionCount = 0;
    function fail(code) { failed = true; members?.revoke(); throw new Error(`access_set_${code}`); }
    function check() {
        if (failed) fail('failed'); if (revoked) fail('revoked');
        try { members?.assertHealthy(); } catch { fail('member_failed'); }
    }
    function event(op, path, outcome, projection) {
        check();
        try { emit(copyData(['I', op, b.alias, b.role, path, projection, outcome])); }
        catch { fail('sink'); }
        check();
    }
    function view(roster, viewId) {
        const prefix = viewId ? [viewId] : [];
        const projection = viewId ? 'operand_selection' : 'operand_set';
        const observe = (op, path, outcome) => event(op, [...prefix, ...path], outcome, projection);
        function at(index, op = 'at') {
            check(); if (!Number.isSafeInteger(index) || index < 0 || Object.is(index, -0)) fail('index');
            if (index >= roster.length) { observe(op, [index], [op === 'next' ? 'done' : 'absent']); return undefined; }
            const alias = roster[index]; observe(op, [index], ['node', alias]);
            return members.handle(alias);
        }
        function iterator() {
            observe('iterate', [], ['opened']); let index = 0; let closed = false; let result;
            const packet = (done, value) => Object.freeze(Object.assign(Object.create(null), { done, value }));
            result = frozenInterface({
                next: () => {
                    check();
                    if (closed || index >= roster.length) {
                        observe('next', [index], ['done']); closed = true; return packet(true, undefined);
                    }
                    const value = at(index, 'next'); index++; return packet(false, value);
                },
                return: () => { observe('return', [], ['closed', index]); closed = true; return packet(true, undefined); },
                [Symbol.iterator]: () => { observe('reuse_iterator', [], ['cursor', index, closed]); return result; }
            });
            return result;
        }
        return frozenInterface({
            length: () => { observe('length', [], ['count', roster.length]); return roster.length; },
            at: index => at(index),
            includes: alias => {
                check(); if (!identifier(alias)) fail('membership');
                const present = roster.includes(alias); observe('includes', [], ['membership', alias, present]); return present;
            },
            select: predicate => {
                check(); if (typeof predicate !== 'function') fail('predicate');
                if (selectionBusy) fail('selection_reentry');
                if (selectionCount >= 512) fail('selection_limit');
                selectionCount++; selectionBusy = true;
                try {
                    observe('select_start', [], ['selection_opened']);
                    const selected = [];
                    for (let index = 0; index < roster.length; index++) {
                        let decision;
                        try { decision = predicate(at(index), index); } catch { fail('predicate_threw'); }
                        check(); // Caught forbidden reads/revocation still invalidate this operation.
                        if (typeof decision !== 'boolean') fail('predicate_result');
                        observe('select_member', [index], ['decision', roster[index], decision]);
                        if (decision) selected.push(roster[index]);
                    }
                    // Content identity of the ordered roster only, not proof of
                    // snapshot/value identity. Repeated executions remain in I.
                    const id = `view_${digest({ role, aliases: selected })}`;
                    observe('select_return', [], ['selected', id, ...selected]);
                    return view(Object.freeze(selected), id);
                } finally { selectionBusy = false; }
            },
            [Symbol.iterator]: iterator
        });
    }
    return Object.freeze({ handle: view(aliases),
    rootAliasIfOwned: handle => { check(); return members?.rootAliasIfOwned(handle); },
    revoke: () => { revoked = true; members?.revoke(); },
    assertHealthy: () => { if (failed) fail('failed'); members?.assertHealthy(); }
    });
}

// TCB transport only. A graph compiler supplies the already admitted relation;
// this proxy has no ability to validate a parent or issue an acceptance receipt.
function createDerivedParentAccess(options) {
    if (!options || typeof options !== 'object' || types.isProxy(options)) failSetup();
    const d = Object.getOwnPropertyDescriptors(options); const names = ['phase', 'bindings', 'edges', 'emit'];
    if (Reflect.ownKeys(d).length !== names.length || names.some(name => !d[name]
        || !Object.hasOwn(d[name], 'value') || !d[name].enumerable) || typeof d.emit.value !== 'function') failSetup();
    const phase = d.phase.value; const emit = d.emit.value;
    const bindings = copyData(d.bindings.value); const edges = copyData(d.edges.value);
    if (!['derivation', 'proof'].includes(phase) || !Array.isArray(bindings) || !bindings.length
        || !Array.isArray(edges) || edges.length !== bindings.length) failSetup();
    const byAlias = new Map(bindings.map(b => [b.alias, b])); const byId = new Map();
    const targets = new Set(); const roles = new Set();
    if (byAlias.size !== bindings.length) failSetup();
    for (const edge of edges) {
        if (!edge || Object.keys(edge).sort().join(',') !== 'field,id,relation,source,target'
            || edge.source !== 'claim' || edge.relation !== 'derived_from' || !identifier(edge.id)
            || !field(edge.field) || !identifier(edge.target) || byId.has(edge.id)
            || targets.has(edge.target) || roles.has(edge.field)) failSetup();
        const binding = byAlias.get(edge.target);
        if (!binding || binding.role !== (phase === 'derivation' ? edge.field : 'proof/snapshot')
            || binding.identity?.kind !== 'derived_claim') failSetup();
        byId.set(edge.id, edge); targets.add(edge.target); roles.add(edge.field);
    }
    const access = createInstrumentedAccess({ bindings, emit });
    let failed = false; let revoked = false;
    const invalid = () => { failed = true; access.revoke(); throw new Error('derived_parent_access_invalid'); };
    const check = () => {
        if (failed) throw new Error('derived_parent_access_failed');
        if (revoked) { failed = true; throw new Error('derived_parent_access_revoked'); }
        try { access.assertHealthy(); } catch { invalid(); }
    };
    return frozenInterface({
        traverse(edgeId) {
            check(); const edge = typeof edgeId === 'string' ? byId.get(edgeId) : undefined;
            if (!edge) invalid();
            try { emit(copyData(['I', 'traverse', 'claim', phase === 'derivation' ? edge.field : 'proof/snapshot',
                [edge.field], 'data', ['edge', edge.id, edge.target]])); } catch { invalid(); }
            check(); return access.handle(edge.target);
        },
        revoke() { revoked = true; access.revoke(); },
        // A clean revocation closes use; it is not itself a causal fault.
        // Any attempted use after revocation remains sticky and fails health.
        assertHealthy() {
            if (failed) throw new Error('derived_parent_access_failed');
            access.assertHealthy();
        }
    });
}

module.exports = { createInstrumentedAccess, createNodeSetAccess, createDerivedParentAccess };
```

## src/next/provenance/literalTypes.js

SHA-256 c99b3a919c995638702325dcb7c2cb1f8e338388700429b3bc9f1cce7a00b4ec; Git blob 76243a36cac975f2a4b4d120fec0fcd7f371140d; bytes 1669.

```javascript
'use strict';
const { parseDate, parseMonth } = require('./civilCalendar');
const fail = () => { throw new Error('literal_type_value'); };
function validateLiteral(literal) {
    if (!literal || typeof literal !== 'object' || Array.isArray(literal)
        || Object.keys(literal).length !== 2 || !Object.hasOwn(literal, 'type') || !Object.hasOwn(literal, 'value')) fail();
    const { type, value } = literal;
    if (type === 'integer' || type === 'money_minor') {
        if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail();
    } else if (type === 'boolean') {
        if (typeof value !== 'boolean') fail();
    } else {
        if (typeof value !== 'string') fail();
        if (type === 'date') parseDate(value);
        else if (type === 'month') parseMonth(value);
        else if (type === 'datetime') {
            const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
            if (!match) fail();
            parseDate(match[1]);
            if (+match[2] > 23 || +match[3] > 59 || +match[4] > 59
                || (match[5] !== undefined && (+match[5] > 23 || +match[6] > 59))) fail();
        } else if (type === 'digest') {
            if (!/^sha256:[a-f0-9]{64}$/.test(value)) fail();
        } else if (type === 'id') {
            if (!/^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$/.test(value)) fail();
        } else if (type === 'kind') {
            if (!/^[a-z][a-z0-9_]*$/.test(value)) fail();
        } else if (type === 'enum') {
            if (!value.length) fail();
        } else if (type !== 'text') fail();
    }
    return type;
}
module.exports = { validateLiteral };
```

## src/next/provenance/materialFieldTypes.js

SHA-256 f7f4ecaba152ddebf4503469ba61851add59c0a0c697ea6f73503a5ca03a1c0c; Git blob 41bbf1f15ff41c1560791c74fdd7694fbada4c47; bytes 1246.

```javascript
'use strict';
// Existing scalar projection for material selectors, shared at build time and
// by the trusted development dispatcher. Registry admission remains separate.
function materialFieldType(kind, segments, descriptor) {
    if (!Array.isArray(segments) || segments.length !== 1 || !descriptor
        || descriptor.class === 'non_material') throw new Error('proof_expression_scalar');
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
module.exports = { materialFieldType };
```

## src/next/provenance/metricDirectReads.js

SHA-256 7a78501221230a8991354d47a63f8e131807b995f6a7e5e10e8dab0664f01d4b; Git blob d5681f178245a5f28d187adab84e465fa83b1b26; bytes 12815.

```javascript
'use strict';
const { parseDate, parseMonth } = require('./civilCalendar');
const { validateLiteral } = require('./literalTypes');
const { selectConsumption } = require('./metricSelection');
const { readNodeIdentity: identity, readReference, readReferenceId, readReferenceIds } = require('./metricReferences');
const fail = code => { throw new Error(`direct_metric_${code}`); };
const id = value => { validateLiteral({ type: 'id', value }); return value; };
// Reviewed projection of evidence-snapshot.schema.json/payload_event. Kept in
// the executable closure; a test requires equality with the normative schema.
const EVENT_V1_FIELDS = Object.freeze(['id', 'date', 'person_id', 'account_id', 'card_id', 'category_id', 'amount_minor', 'state',
    'merchant_key', 'compensates', 'transfer_pair', 'settles_card_id', 'installment_plan', 'installment_number', 'installment_total']);
function same(a, b) { return a.ref === b.ref && a.version === b.version; }
function period(context, kind, basis) {
    if (context.get('time_basis') !== basis) fail('basis');
    const p = context.get('period');
    if (p.get('kind') !== kind) fail('period');
    const value = p.get('value');
    if (kind === 'month') parseMonth(value); else parseDate(value);
    return value;
}
function subject(context, kind) {
    const s = context.get('subject');
    if (s.get('kind') !== kind) fail('scope');
    return id(s.get('ref_id'));
}
function checkedMoney(value) {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail('amount');
    return value;
}
function inclusiveRange(context, basis) {
    if (context.get('time_basis') !== basis) fail('basis');
    const p = context.get('period');
    if (p.get('kind') !== 'range' || p.get('start_inclusive') !== true || p.get('end_inclusive') !== true) fail('period');
    const start = p.get('start'); const end = p.get('end'); parseDate(start); parseDate(end);
    if (start > end) fail('period');
    return date => { parseDate(date); return date >= start && date <= end; };
}
function collectionMatches(collection, entries, name, kind) {
    identity(collection, 'collection');
    if (collection.get('collection_name') !== name) fail('collection');
    const members = []; for (const member of collection.get('members')) members.push(id(member));
    const actual = []; for (const entry of entries) actual.push(identity(entry, kind).ref);
    if (new Set(members).size !== members.length || new Set(actual).size !== actual.length
        || members.length !== actual.length || members.some((ref, i) => ref !== actual[i])) fail('collection');
}
function selectedIds(selected) {
    const result = []; const seen = new Set();
    for (const node of selected) {
        const value = id(node.get('id')); if (seen.has(value)) fail('duplicate');
        seen.add(value); result.push(value);
    }
    return result;
}

// Metric-only fixed dispatch. No graph predicates, expected values or oracle.
// A functional answer from this helper is not acceptance of a claim.
function evaluateDirectMetric(operands, metric) {
    const context = operands.context;
    if (metric === 'account_balance' || metric === 'movement_ids') {
        const account = identity(operands.account, 'account');
        if (subject(context, 'account') !== account.ref) fail('scope');
        let contains; let result = 0;
        if (metric === 'account_balance') {
            const end = period(context, 'as_of', 'event_date');
            const start = operands.account.get('opening_balance_as_of'); parseDate(start);
            if (start > end) fail('period');
            result = checkedMoney(operands.account.get('opening_balance_minor'));
            contains = date => date >= start && date <= end;
        } else {
            const month = period(context, 'month', 'event_date');
            contains = date => date.slice(0, 7) === month;
        }
        const selected = operands.events.select(event => {
            identity(event, 'event');
            const date = event.get('date'); parseDate(date);
            const state = event.get('state');
            if (!['confirmed', 'projected'].includes(state)) fail('state');
            const ownerMatches = event.has('account_id')
                && same(readReference(event, 'account_id', 'account'), account);
            return state === 'confirmed' && contains(date) && ownerMatches;
        });
        if (metric === 'movement_ids') return selectedIds(selected);
        for (const event of selected) result = checkedMoney(result + checkedMoney(event.get('amount_minor')));
        return result;
    }
    if (['bills_open', 'due_bill_ids', 'due_bills_total'].includes(metric)) {
        let contains; let ownerMatches;
        if (metric === 'bills_open') {
            const month = period(context, 'month', 'due_date');
            contains = date => { parseDate(date); return date.slice(0, 7) === month; };
            const s = context.get('subject'); const kind = s.get('kind');
            const family = identity(operands.family, 'family');
            if (kind === 'family') {
                if (id(s.get('ref_id')) !== family.ref) fail('scope');
                const members = readReferenceIds(operands.family, 'members');
                ownerMatches = owner => members.includes(owner.ref);
            } else if (kind === 'person') {
                const person = id(s.get('ref_id')); ownerMatches = owner => owner.ref === person;
            } else fail('scope');
        } else {
            contains = inclusiveRange(context, 'due_date');
            const person = identity(operands.person, 'person');
            if (person.ref !== subject(context, 'person')) fail('scope');
            ownerMatches = owner => same(owner, person);
        }
        const selected = operands.bills.select(bill => {
            identity(bill, 'bill'); const status = bill.get('status');
            if (!['open', 'paid', 'cancelled'].includes(status)) fail('status');
            const timely = contains(bill.get('due_date'));
            const owner = metric === 'bills_open' ? { ref: readReferenceId(bill, 'person_id') }
                : readReference(bill, 'person_id', 'person');
            return status === 'open' && timely && ownerMatches(owner);
        });
        if (metric === 'due_bill_ids') return selectedIds(selected);
        let sum = 0; for (const bill of selected) sum = checkedMoney(sum + checkedMoney(bill.get('amount_minor')));
        return sum;
    }
    if (metric === 'reminder_count' || metric === 'calendar_event_count') {
        const reminder = metric === 'reminder_count'; const kind = reminder ? 'reminder' : 'calendar_event';
        const contains = inclusiveRange(context, 'scheduled_at');
        const person = identity(operands.person, 'person');
        if (person.ref !== subject(context, 'person')) fail('scope');
        collectionMatches(operands.collection, operands.entries, reminder ? 'reminders' : 'calendar_events', kind);
        const selected = operands.entries.select(entry => {
            identity(entry, kind); const timely = contains(entry.get('scheduled_at'));
            const owner = readReference(entry, 'person_id', 'person');
            return timely && same(owner, person);
        });
        return selected.length();
    }
    if (metric === 'similar_event_ids') {
        const month = period(context, 'month', 'event_date');
        const merchant = identity(operands.merchant, 'merchant_identity');
        if (merchant.ref !== subject(context, 'merchant')) fail('scope');
        const selected = operands.events.select(event => {
            identity(event, 'event'); const date = event.get('date'); parseDate(date);
            const state = event.get('state'); if (!['confirmed', 'projected'].includes(state)) fail('state');
            const matches = event.has('merchant_key') && same(readReference(event, 'merchant_key', 'merchant_identity'), merchant);
            return state === 'confirmed' && date.slice(0, 7) === month && matches;
        });
        return selectedIds(selected);
    }
    if (['balance_delta', 'invoice_payment_amount', 'invoice_payment_target_card', 'statement_payment_correspondence'].includes(metric)) {
        const event = operands.event; const eventId = identity(event, 'event');
        const day = period(context, 'date', 'event_date');
        const actualDay = event.get('date'); parseDate(actualDay);
        if (actualDay !== day) fail('period');
        if (event.get('state') !== 'confirmed') fail('state');
        if (metric === 'balance_delta') {
            const account = readReferenceId(event, 'account_id');
            if (account !== subject(context, 'account')) fail('scope');
            return checkedMoney(event.get('amount_minor'));
        }
        if (subject(context, 'event') !== eventId.ref) fail('scope');
        if (metric === 'invoice_payment_amount') {
            // Admission already binds scalar references to typed targets. This
            // formula needs the nominal category, not the target payload.
            if (readReferenceId(event, 'category_id') !== 'neutral.invoice_payment') fail('payment_category');
            readReferenceId(event, 'account_id');
            readReferenceId(event, 'settles_card_id');
            return Math.abs(checkedMoney(event.get('amount_minor')));
        }
        if (metric === 'invoice_payment_target_card') {
            const target = readReference(event, 'settles_card_id', 'card');
            if (!same(target, identity(operands.card, 'card'))) fail('target');
            return target.ref;
        }
        // The admitted v1 schema has no statement-link fields. Enumerate the
        // actual exposed structure; a card reference cannot stand in for one.
        for (const name of event.keys()) if (!EVENT_V1_FIELDS.includes(name)) fail('statement_schema');
        return 'unproven';
    }
    if (metric === 'eligible_event_count') {
        const source = operands.source; identity(source, 'source_state');
        // D computes a provisional count. Source period/completeness are P
        // obligations; selection below still uses the claim's functional month.
        const s = context.get('subject'); const kind = s.get('kind');
        const category = id(s.get(kind === 'category' ? 'ref_id' : 'category_id'));
        if (readReferenceId(source, 'category_id') !== category) fail('scope');
        if (source.has('entity_id')) {
            const owner = kind === 'person_category' ? id(s.get('person_id'))
                : kind === 'family_category' ? id(s.get('family_id')) : id(operands.family.get('id'));
            if (id(source.get('entity_id')) !== owner) fail('scope');
        }
        const expected = source.get('event_count');
        if (!Number.isSafeInteger(expected) || expected < 0 || Object.is(expected, -0)) fail('count');
        const selected = selectConsumption(operands, 'category');
        const actualCount = selected.length();
        if (expected !== actualCount) fail('count');
        return expected;
    }
    if (metric === 'side_effect_count') {
        const turn = identity(operands.turn, 'turn');
        if (turn.ref !== subject(context, 'turn')) fail('scope');
        period(context, 'as_of', 'request_execution');
        collectionMatches(operands.collection, operands.entries, 'side_effects', 'side_effect');
        const selected = operands.entries.select(entry => same(readReference(entry, 'turn_id', 'turn'), turn));
        return selected.length();
    }
    if (metric === 'source_coverage') {
        const source = operands.source;
        if (identity(source, 'source_state').ref !== subject(context, 'source')) fail('scope');
        // Nominal source resolution is functional; its period relation is P.
        const coverage = source.get('coverage');
        if (!['complete', 'partial', 'unavailable'].includes(coverage)) fail('coverage');
        return coverage;
    }
    if (metric === 'owned_cards' || metric === 'merchant_rule_ids') {
        const ownership = metric === 'owned_cards';
        const scopeKind = ownership ? 'person' : 'merchant_identity';
        const target = identity(ownership ? operands.person : operands.merchant, scopeKind);
        if (target.ref !== subject(context, ownership ? 'person' : 'merchant')) fail('scope');
        period(context, 'as_of', 'registry_current');
        const population = ownership ? operands.cards : operands.rules;
        const selected = population.select(node => {
            identity(node, ownership ? 'card' : 'merchant_rule');
            return same(readReference(node, ownership ? 'owner_id' : 'merchant_key', scopeKind), target);
        });
        return selectedIds(selected);
    }
    fail('metric');
}

module.exports = { evaluateDirectMetric, EVENT_V1_FIELDS };
```

## src/next/provenance/metricEffects.js

SHA-256 7cb9fe24b2d8aefd3560d8089544bfe5431f124256c35023ff6b8e126283f5fb; Git blob 7d461af02addac9509bb518e5c7a91b4fb98d210; bytes 5637.

```javascript
'use strict';
const { parseDate, parseMonth } = require('./civilCalendar');
const { validateLiteral } = require('./literalTypes');
const { createCategoryReader } = require('./metricSelection');
const { createUniqueNodeReader, readReference, readReferenceId } = require('./metricReferences');
const fail = code => { throw new Error(`effect_metric_${code}`); };
const id = value => { validateLiteral({ type: 'id', value }); return value; };
const money = value => { if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail('amount'); return value; };
function evaluateEffects(operands, metric) {
    if (!['consumption_effect', 'net_consumption', 'invoice_payment_consumption_effect', 'gross_consumption', 'refund_amount'].includes(metric)) fail('metric');
    const context = operands.context; if (context.get('time_basis') !== 'event_date') fail('basis');
    const period = context.get('period'); const periodKind = period.get('kind'); const periodValue = period.get('value');
    if (periodKind === 'month') parseMonth(periodValue);
    else if (periodKind === 'date') parseDate(periodValue); else fail('period');
    const subject = context.get('subject'); const kind = subject.get('kind');
    if (!['event', 'person_category', 'transfer_pair'].includes(kind)) fail('scope');
    if (kind === 'transfer_pair' && metric !== 'consumption_effect') fail('scope');
    if (kind === 'person_category' && !['net_consumption', 'gross_consumption'].includes(metric)) fail('scope');
    const reference = kind === 'person_category' ? null : id(subject.get('ref_id'));
    const person = kind === 'person_category' ? id(subject.get('person_id')) : null;
    const category = kind === 'person_category' ? id(subject.get('category_id')) : null;
    const reader = metric === 'refund_amount' ? null : createCategoryReader(operands.categories);
    // Refund consumes the resolved person under its reviewed signature. Other
    // effects use the admitted person ID only. Compensation consumes its target
    // in every mode, so its full reference coherence has one implementation.
    const readOwner = reader ? event => readReferenceId(event, 'person_id')
        : event => readReference(event, 'person_id', 'person').ref;
    const seen = createUniqueNodeReader('event'); const linkedPurchases = new Set(); const economicKinds = new Map();
    const selected = operands.events.select(event => {
        const { ref } = seen.read(event);
        const date = event.get('date'); parseDate(date);
        const state = event.get('state'); if (!['confirmed', 'projected'].includes(state)) fail('state');
        const owner = readOwner(event);
        let own;
        if (reader) own = reader.read(event);
        else {
            const { node: cat, ref } = readReference(event, 'category_id', 'category');
            own = { key: ref, economicKind: cat.get('kind') };
            if (own.economicKind !== 'compensation') fail('compensation');
        }
        economicKinds.set(ref, own.economicKind);
        let effective = own; let purchase;
        if (own.economicKind === 'compensation') {
            const { node: target, ref: targetId } = readReference(event, 'compensates', 'event'); purchase = targetId;
            if (purchase === ref || target.get('state') !== 'confirmed' || id(target.get('person_id')) !== owner) fail('compensation');
            if (reader) effective = reader.read(target);
            else {
                const { node: cat, ref } = readReference(target, 'category_id', 'category');
                effective = { key: ref, economicKind: cat.get('kind') };
            }
            if (effective.economicKind !== 'expense') fail('compensation');
            if (metric === 'net_consumption') linkedPurchases.add(purchase);
        }
        let scope;
        if (kind === 'person_category') scope = owner === person && effective.key === category;
        else if (kind === 'transfer_pair') scope = event.has('transfer_pair') && id(event.get('transfer_pair')) === reference;
        else scope = ref === reference || metric === 'net_consumption' && purchase === reference;
        if (metric === 'net_consumption' && purchase && !scope) fail('compensation');
        if (metric === 'invoice_payment_consumption_effect' || metric === 'consumption_effect' && kind === 'event') {
            if (own.key !== 'neutral.invoice_payment' || own.economicKind !== 'neutral') fail('payment');
            // The dedicated payment formula consumes the admitted card
            // reference, not the target payload. Generic consumption has no
            // account/card input here; economic links remain separate proof
            // obligations. Arithmetic success is never graph acceptance.
            if (metric === 'invoice_payment_consumption_effect') readReferenceId(event, 'settles_card_id');
        }
        return state === 'confirmed' && scope && (periodKind === 'month' ? date.slice(0, 7) === periodValue : date === periodValue);
    });
    if (kind === 'event' && !seen.has(reference)) fail('scope');
    for (const purchase of linkedPurchases) if (!seen.has(purchase)) fail('compensation');
    let result = 0;
    for (const event of selected) {
        const amount = money(event.get('amount_minor')); const ownKind = economicKinds.get(id(event.get('id')));
        const contribution = ['expense', 'compensation'].includes(ownKind) ? 0 - amount : 0;
        result = money(result + (metric === 'refund_amount' ? Math.max(0, amount)
            : metric === 'gross_consumption' ? Math.max(0, contribution) : contribution));
    }
    return result;
}
module.exports = { evaluateEffects };
```

## src/next/provenance/metricInstallments.js

SHA-256 559dae3a98d3dd90670e15d35ca93824bf89d478c974dcd07d9da17abcac7a09; Git blob f2b45c9684d792597662773a593d79eb91c970c9; bytes 4957.

```javascript
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
    if (members.size !== total) fail('total');
    return { ...plan, total, members, examined: new Set(), numbers: new Set(), ordered: [] };
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
        // The reviewed roster, not an optional reference on an arbitrary
        // population row, defines membership. Authored exclusion predicates
        // are a separate observed obligation of the derivation phase.
        const owners = [...plans.values()].filter(plan => plan.members.includes(eventIdentity.ref));
        if (owners.length > 1) fail('members');
        if (!owners.length) return false;
        const plan = owners[0];
        const linked = readReference(event, 'installment_plan', 'installment_plan');
        const { total, members, examined, numbers, ordered } = plan;
        if (linked.ref !== plan.ref || linked.version !== plan.version || examined.has(eventIdentity.ref)) fail('members');
        examined.add(eventIdentity.ref);
        const number = integer(event.get('installment_number'));
        if (number < 1 || number > total || numbers.has(number) || integer(event.get('installment_total')) !== total) fail('number');
        numbers.add(number);
        const date = event.get('date'); parseDate(date); ordered.push({ number, date });
        const state = event.get('state'); if (!['confirmed', 'projected'].includes(state)) fail('state');
        const inScope = !familyMode || familyMembers.includes(readReferenceId(event, 'person_id'));
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
```

## src/next/provenance/metricParents.js

SHA-256 32464e029ba27ccf5a45b4ee35b1568033ef159a802ed156c014a1aa217030bb; Git blob 420d5e2ca70e524a11ad7f63f55bcee470d59064; bytes 3219.

```javascript
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
```

## src/next/provenance/metricReferences.js

SHA-256 0a96471a46324599c92c8c2f604e5761749902c6b9393eb738b09aad868d5e7b; Git blob 81858370706a5f4eb59ffb093498c8cca502f1f3; bytes 2995.

```javascript
'use strict';

const { validateLiteral } = require('./literalTypes');
const fail = code => { throw new Error(`metric_reference_${code}`); };
const id = value => { validateLiteral({ type: 'id', value }); return value; };

function readNodeIdentity(node, kind) {
    if (node.identity('kind') !== kind) fail('kind');
    const ref = id(node.get('id'));
    const version = node.identity('version');
    validateLiteral({ type: 'digest', value: version });
    return Object.freeze({ ref, version });
}

// A financial candidate population is unique by material ID, not by handle
// alias or version. Fresh per invocation, including financially excluded rows.
function createUniqueNodeReader(kind) {
    const seen = new Set();
    return Object.freeze({
        read(node) {
            const identity = readNodeIdentity(node, kind);
            if (seen.has(identity.ref)) fail('duplicate');
            seen.add(identity.ref);
            return identity;
        },
        has: ref => seen.has(ref)
    });
}

// Internal evaluator composition. Admission resolves the allowed relation;
// these distinct observations bind its source scalar to the consumed target.
// Population membership and the expected version remain the caller's concern.
function resolveReference(source, field) {
    const reference = id(source.get(field));
    const node = source.follow(field);
    return { reference, node };
}

// The admitted relation already binds the scalar to a nominally typed target.
// Consumers of the reference alone must still resolve it, but do not consume
// the target's payload/identity. This is not admission for arbitrary handles.
function readReferenceId(source, field) {
    return resolveReference(source, field).reference;
}

function readReference(source, field, kind) {
    const { reference, node } = resolveReference(source, field);
    const { ref, version } = readNodeIdentity(node, kind);
    if (reference !== ref) fail('identity');
    return Object.freeze({ node, ref, version });
}

// A reference population has causal cardinality, order and link resolution,
// not just membership of the few IDs queried by financial candidates. Target
// kinds/reachability are admitted by the registry; don't add target payload
// reads when the population contract requires only the reference edges.
function readReferenceIds(source, field) {
    const values = source.get(field); const count = values.length();
    if (!Number.isSafeInteger(count) || count < 0 || Object.is(count, -0)) fail('cardinality');
    const members = new Set();
    for (const value of values) {
        const ref = id(value);
        if (members.has(ref)) fail('duplicate');
        source.followMember(field, ref);
        members.add(ref);
    }
    if (members.size !== count) fail('cardinality');
    return Object.freeze({ size: members.size, includes: ref => members.has(ref) });
}

module.exports = { readNodeIdentity, createUniqueNodeReader, readReference, readReferenceId, readReferenceIds };
```

## src/next/provenance/metricSelection.js

SHA-256 8e4f66e1e10f8fa70c4729b56c937688cbd33107bb93d94c6e7a86b7f5736b1f; Git blob 56bf033db7d3dbe2159707dc7c195d5af146bb19; bytes 11711.

```javascript
'use strict';

const { parseDate, parseMonth, offsetDate, monthBounds, inclusiveDayCount } = require('./civilCalendar');
const { validateLiteral } = require('./literalTypes');
const { readNodeIdentity, createUniqueNodeReader, readReference, readReferenceId, readReferenceIds } = require('./metricReferences');
const fail = code => { throw new Error(`metric_selection_${code}`); };
const id = value => { validateLiteral({ type: 'id', value }); return value; };
const money = value => {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail('money');
    return value;
};

// Internal composition shared by metric kernels. The population is observed;
// references are checked by full identity, not by a coincident category name.
function createCategoryReader(categories) {
    const index = new Map();
    for (const node of categories) {
        const key = id(node.get('id'));
        if (node.identity('kind') !== 'category' || index.has(key)) fail('category');
        const economicKind = node.get('kind');
        if (!['expense', 'compensation', 'income', 'neutral'].includes(economicKind)) fail('category');
        index.set(key, { version: node.identity('version'), economicKind });
    }
    return {
        has: key => index.has(key),
        read(event) {
            const { node, ref: key, version } = readReference(event, 'category_id', 'category');
            const bound = index.get(key);
            if (!bound || bound.version !== version) fail('category');
            const economicKind = node.get('kind');
            if (economicKind !== bound.economicKind) fail('category');
            return { key, economicKind: bound.economicKind, node };
        }
    };
}

// Internal metric behavior, not a proof validator or a public execution host.
// Only handles supplied through admitted registry roles are used. No graph,
// selected roster, fact key, oracle or expected result is an input.
function selectEconomicEvents(operands, mode) {
    if (!['total', 'category', 'spent', 'income', 'instrument', 'budget_class', 'budget_remaining', 'statement', 'safe_pace'].includes(mode)) fail('mode');
    const pace = mode === 'safe_pace';
    const instrumentMode = mode === 'instrument' || mode === 'statement';
    const context = operands.context;
    if (instrumentMode && context.get('coverage') !== 'complete') fail('coverage');
    const basis = context.get('time_basis');
    if (!(pace ? basis === '15_full_days_after_as_of' : mode === 'statement' ? ['statement_due_date', 'statement_competence'].includes(basis)
        : mode === 'budget_remaining' ? basis === 'budget_cycle' : mode === 'spent' ? ['event_date', 'budget_cycle'].includes(basis) : basis === 'event_date')
        || ((pace || instrumentMode) && context.get('evidence_state') !== (pace ? 'estimated' : 'confirmed'))) fail('context');
    const period = context.get('period');
    let month; let contains; let divisor;
    if (pace) {
        const policy = operands.policy;
        const cutoff = operands.clock.civilDate('fixed_clock', policy.get('timezone'), policy.get('calendar'));
        month = operands.budget.get('period'); const bounds = monthBounds(month);
        if (cutoff < bounds.start || cutoff >= bounds.end) fail('pace');
        const start = offsetDate(cutoff, 1, 'day'); const end = bounds.end;
        divisor = inclusiveDayCount({ start, end, start_inclusive: true, end_inclusive: true });
        if (divisor !== 15 || policy.get('daily_pace_divisor') !== divisor || policy.get('daily_pace_rounding') !== 'floor'
            || policy.get('daily_pace_as_of') !== cutoff || policy.get('daily_pace_start') !== start || policy.get('daily_pace_end') !== end
            || period.get('kind') !== 'range' || period.get('start') !== start || period.get('end') !== end
            || period.get('start_inclusive') !== true || period.get('end_inclusive') !== true) fail('pace');
        contains = value => value >= bounds.start && value <= cutoff;
    } else if (mode === 'statement') {
        readNodeIdentity(operands.policy, 'evaluation_policy');
        if (period.get('kind') !== 'statement_due' || operands.policy.get('calendar') !== 'proleptic_gregorian') fail('statement');
        const due = period.get('value'); const date = parseDate(due);
        const closingDay = operands.card.get('closing_day'); const dueDay = operands.card.get('due_day');
        if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31
            || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31 || date.day !== dueDay) fail('statement');
        const end = `${due.slice(0, 7)}-${String(closingDay).padStart(2, '0')}`; parseDate(end);
        const start = offsetDate(end, -1, 'month');
        contains = value => value > start && value <= end;
    } else {
        if (period.get('kind') !== 'month') fail('period');
        month = period.get('value'); parseMonth(month);
        contains = value => value.slice(0, 7) === month;
    }
    const subject = context.get('subject'); const kind = subject.get('kind');
    const family = pace ? readReference(operands.budget, 'family_id', 'family').node : operands.family;
    const familyId = instrumentMode ? undefined : id(family.get('id'));
    const familyMembers = instrumentMode ? undefined : readReferenceIds(family, 'members');
    let person; let category; let expectedFamily; let instrument; let instrumentVersion; let budgetClass;
    if (mode === 'budget_remaining' || pace) {
        if (operands.budget.identity('kind') !== 'budget') fail('budget');
        const budgetId = id(operands.budget.get('id'));
        if (kind === 'budget') { if (id(subject.get('ref_id')) !== budgetId) fail('scope'); }
        else if (!pace && kind === 'budget_person') {
            if (id(subject.get('budget_id')) !== budgetId) fail('scope');
            person = id(subject.get('person_id')); if (!familyMembers.includes(person)) fail('scope');
        } else fail('scope');
        expectedFamily = pace ? familyId : readReferenceId(operands.budget, 'family_id');
        category = readReferenceId(operands.budget, 'category_id');
        if (operands.budget.get('period') !== month) fail('budget');
    } else if (instrumentMode) {
        const target = mode === 'statement' ? operands.card : operands.instrument;
        if (!['account', 'card'].includes(kind) || mode === 'statement' && kind !== 'card' || target.identity('kind') !== kind) fail('scope');
        instrument = id(target.get('id')); instrumentVersion = target.identity('version');
        validateLiteral({ type: 'digest', value: instrumentVersion });
        if (id(subject.get('ref_id')) !== instrument) fail('scope');
    } else if (['total', 'income', 'budget_class'].includes(mode)) {
        if (kind === 'person') person = id(subject.get('ref_id'));
        else if (kind === 'family') expectedFamily = id(subject.get('ref_id'));
        else fail('scope');
        if (mode === 'budget_class') {
            if (kind !== 'family') fail('scope');
            budgetClass = context.get('filters').get('budget_class');
            if (!['essential', 'flexible'].includes(budgetClass)) fail('filter');
        }
    } else {
        if (kind === 'person_category') { person = id(subject.get('person_id')); category = id(subject.get('category_id')); }
        else if (kind === 'family_category') { expectedFamily = id(subject.get('family_id')); category = id(subject.get('category_id')); }
        else if (kind === 'category') { expectedFamily = familyId; category = id(subject.get('ref_id')); }
        else fail('scope');
    }
    if (expectedFamily !== undefined && familyId !== expectedFamily) fail('scope');

    // Category population is an explicit role, not an incidental global map.
    // A followed category must also belong to this admitted operand population.
    const categoryReader = createCategoryReader(operands.categories);
    if (category !== undefined && !categoryReader.has(category)) fail('category');
    const categoryOf = event => categoryReader.read(event);
    const candidates = createUniqueNodeReader('event');
    const selected = operands.events.select(event => {
        const candidateIdentity = candidates.read(event);
        const state = event.get('state');
        if (!['confirmed', 'projected'].includes(state)) fail('state');
        const date = event.get('date'); parseDate(date);
        const owner = instrumentMode ? undefined : readReferenceId(event, 'person_id');
        const ownCategory = categoryOf(event);
        const economicMatch = mode === 'income' ? ownCategory.economicKind === 'income'
            : ['expense', 'compensation'].includes(ownCategory.economicKind);
        let effectiveCategory = ownCategory;
        // Resolving a compensation is part of its consumption semantics, not
        // an optional consequence of filtering by the original category.
        const hasCompensation = instrumentMode ? event.has('compensates') : economicMatch && ownCategory.economicKind === 'compensation';
        if (instrumentMode && hasCompensation !== (ownCategory.economicKind === 'compensation')) fail('compensation');
        if (hasCompensation) {
            const { node: compensated, ref } = readReference(event, 'compensates', 'event');
            if (instrumentMode && (ref === candidateIdentity.ref || compensated.has('compensates'))) fail('compensation');
            const originalCategory = categoryOf(compensated);
            if (originalCategory.economicKind !== 'expense') fail('compensation');
            effectiveCategory = originalCategory;
        }
        let inScope;
        if (instrumentMode) {
            const field = `${kind}_id`;
            inScope = false;
            if (event.has(field)) {
                const target = readReference(event, field, kind);
                inScope = target.ref === instrument && target.version === instrumentVersion;
            }
        } else inScope = person === undefined ? familyMembers.includes(owner) : owner === person;
        let filterMatch = category === undefined || effectiveCategory.key === category;
        if (mode === 'budget_class' && economicMatch) {
            const actual = effectiveCategory.node.get('budget_class');
            if (!['essential', 'flexible'].includes(actual)) fail('filter');
            filterMatch = actual === budgetClass;
        }
        return state === 'confirmed' && contains(date) && inScope
            && economicMatch && filterMatch;
    });
    return { selected, divisor };
}

function selectConsumption(operands, mode) {
    if (!['total', 'category', 'spent'].includes(mode)) fail('mode');
    return selectEconomicEvents(operands, mode).selected;
}
function evaluateEconomicMetric(operands, mode) {
    const { selected, divisor } = selectEconomicEvents(operands, mode);
    let result = 0;
    for (const event of selected) {
        const amount = money(event.get('amount_minor'));
        result = money(mode === 'income' ? result + amount : result - amount);
    }
    if (mode === 'budget_remaining' || mode === 'safe_pace') {
        result = money(money(operands.budget.get('limit_minor')) - result);
        return mode === 'safe_pace' ? money(Math.floor(result / divisor)) : result;
    }
    return result;
}
function evaluateConsumption(operands, mode) {
    if (!['total', 'category', 'spent'].includes(mode)) fail('mode');
    return evaluateEconomicMetric(operands, mode);
}

// selectConsumption is internal composition for other metric functions, not a
// functional output or a channel for the evaluator to return causal metadata.
module.exports = { evaluateConsumption, selectConsumption, evaluateEconomicMetric, createCategoryReader };
```

## src/next/provenance/observationContract.js

SHA-256 60d73c6bfe13fe91325920bc289454d233cd6efea034c093a1d4c18cee469e1e; Git blob 1c2305eaf1973955252a4b9d0acf0adca1113b1d; bytes 6685.

```javascript
'use strict';
const { digest } = require('../kernel/canonicalValue');
const { types } = require('node:util');
const fail = () => { throw new Error('observation_shape_invalid'); };
const { identifier, field, scalar } = require('./observationScalars');

// Copy only bounded data descriptors, never getters, proxies or coercions.
// This is transport/shape admission, not a financial schema validator.
function copyData(input) {
    let nodes = 0; let characters = 0; const ancestors = new Set();
    function copy(value, depth) {
        if (++nodes > 65536 || depth > 32) fail();
        if (scalar(value)) {
            if (typeof value === 'string' && (characters += value.length) > 1048576) fail();
            return value;
        }
        if (!value || typeof value !== 'object' || types.isProxy(value) || ancestors.has(value)) fail();
        const array = Array.isArray(value);
        if (array ? Object.getPrototypeOf(value) !== Array.prototype
            : ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail();
        const descriptors = Object.getOwnPropertyDescriptors(value);
        const keys = Reflect.ownKeys(descriptors);
        if (keys.length > 65536 || keys.some(k => typeof k !== 'string')) fail();
        ancestors.add(value);
        let result;
        if (array) {
            const length = descriptors.length.value;
            if (keys.length !== length + 1) fail();
            result = [];
            for (let i = 0; i < length; i++) {
                const d = descriptors[String(i)];
                if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) fail();
                result.push(copy(d.value, depth + 1));
            }
        } else {
            result = Object.create(null);
            for (const key of keys) {
                const d = descriptors[key];
                if (!field(key) || !d.enumerable || !Object.hasOwn(d, 'value')) fail();
                result[key] = copy(d.value, depth + 1);
            }
        }
        ancestors.delete(value);
        return Object.freeze(result);
    }
    return copy(input, 0);
}

function decodeObservation(raw) {
    const e = copyData(raw);
    if (!Array.isArray(e) || e.length !== 7 || e[0] !== 'I' || !identifier(e[2]) || !identifier(e[3])
        || !Array.isArray(e[4]) || e[4].length > 32
        || e[4].some(p => !field(p) && !(Number.isSafeInteger(p) && p >= 0))
        || !['data', 'keys', 'operand_set', 'operand_selection', 'node_identity'].includes(e[5]) || !Array.isArray(e[6])) fail();
    const o = e[6]; const tag = o[0];
    if (e[5] === 'node_identity' && e[1] !== 'identity') fail();
    const selectedView = e[5] === 'operand_selection';
    const nodeSet = e[5] === 'operand_set' || selectedView;
    const viewId = value => typeof value === 'string' && /^view_[a-f0-9]{64}$/.test(value);
    if (selectedView && !viewId(e[4][0])) fail();
    const setPath = selectedView ? e[4].slice(1) : e[4];
    if (nodeSet && (e[2] !== `operand/${e[3]}`
        || !['length', 'includes', 'at', 'iterate', 'next', 'return', 'reuse_iterator',
            'select_start', 'select_member', 'select_return'].includes(e[1])
        || (['at', 'next', 'select_member'].includes(e[1])
            ? setPath.length !== 1 || !Number.isSafeInteger(setPath[0]) || setPath[0] < 0 || Object.is(setPath[0], -0)
            : setPath.length !== 0))) fail();
    const valueOutcome = tag === 'scalar' && o.length === 2 && scalar(o[1])
        || tag === 'container' && o.length === 2 && ['record', 'sequence'].includes(o[1]);
    const accessOutcome = nodeSet ? tag === 'node' && o.length === 2 && identifier(o[1]) : valueOutcome;
    let valid = false;
    switch (e[1]) {
    case 'civil_date': valid = e[5] === 'data' && e[4].length >= 1
        && tag === 'civil' && o.length === 5 && o.slice(1).every(v => typeof v === 'string')
        && o[2] === 'America/Sao_Paulo' && o[3] === 'proleptic_gregorian'
        && /^\d{4}-\d{2}-\d{2}$/.test(o[4]); break;
    case 'identity': {
        const key = e[4][0];
        valid = e[5] === 'node_identity' && e[4].length === 1 && tag === 'scalar' && o.length === 2 && typeof o[1] === 'string'
            && (key === 'kind' ? /^[a-z][a-z0-9_]*$/.test(o[1]) : key === 'version' ? /^sha256:[a-f0-9]{64}$/.test(o[1])
                : key === 'ref_id' && /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$/.test(o[1]));
        break;
    }
    case 'traverse': valid = e[5] === 'data' && e[4].length === 1 && field(e[4][0])
        && tag === 'edge' && o.length === 3 && identifier(o[1]) && identifier(o[2]); break;
    case 'get': case 'at': valid = accessOutcome || tag === 'absent' && o.length === 1; break;
    case 'next': valid = accessOutcome || tag === 'done' && o.length === 1; break;
    case 'has': valid = tag === 'boolean' && o.length === 2 && typeof o[1] === 'boolean'; break;
    case 'keys': valid = tag === 'keys' && o.slice(1).every(k => typeof k === 'string'); break;
    case 'length': valid = tag === 'count' && o.length === 2 && Number.isSafeInteger(o[1]) && o[1] >= 0; break;
    case 'includes': valid = tag === 'membership' && o.length === 3
        && (nodeSet ? identifier(o[1]) : scalar(o[1])) && typeof o[2] === 'boolean'; break;
    case 'iterate': valid = tag === 'opened' && o.length === 1; break;
    case 'return': valid = tag === 'closed' && o.length === 2 && Number.isSafeInteger(o[1]) && o[1] >= 0; break;
    case 'reuse_iterator': valid = tag === 'cursor' && o.length === 3 && Number.isSafeInteger(o[1])
        && o[1] >= 0 && typeof o[2] === 'boolean'; break;
    case 'select_start': valid = nodeSet && tag === 'selection_opened' && o.length === 1; break;
    case 'select_member': valid = nodeSet && tag === 'decision' && o.length === 3
        && identifier(o[1]) && typeof o[2] === 'boolean'; break;
    case 'select_return': valid = nodeSet && tag === 'selected' && o.length >= 2 && o.length <= 514 && viewId(o[1])
        && o.slice(2).every(identifier) && new Set(o.slice(2)).size === o.length - 2
        && o[1] === `view_${digest({ role: e[3], aliases: o.slice(2) })}`; break;
    default: fail();
    }
    if (!valid) fail();
    // Remain in channel I. Only the recorder chooses field names in L/T.
    return e;
}

function decodeMeasurement(raw) {
    const e = copyData(raw);
    if (!Array.isArray(e) || e.length !== 3 || e[0] !== 'M'
        || !['evaluator_artifact_root', 'evaluator_contract_hash', 'validation_tcb_root', 'proof_engine_artifact_root'].includes(e[1])
        || typeof e[2] !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(e[2])) fail();
    return e;
}

module.exports = { copyData, identifier, field, scalar, decodeObservation, decodeMeasurement };
```

## src/next/provenance/observationScalars.js

SHA-256 cf344f72a703e7be55fc165322860d84792fae82822f3daad1f557834faa4f09; Git blob 5ec8bcfd3f52a853167b9504ad557ee073f3b160; bytes 559.

```javascript
'use strict';
// Shared pure scalar grammar; no native APIs or transport authority.
const identifier = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:#/-]{0,127}$/.test(v);
const field = v => typeof v === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(v)
    && !['__proto__', 'constructor', 'prototype'].includes(v);
const scalar = v => v === null || typeof v === 'boolean' || typeof v === 'string' && v.length <= 65536
    || typeof v === 'number' && Number.isSafeInteger(v) && !Object.is(v, -0);
module.exports = { identifier, field, scalar };
```

## src/next/provenance/proofAcceptance.js

SHA-256 6ddc6138fc0485c1278f52fad545bbdd9cd908975e000efa98863fddd86f3cea; Git blob 5e47b32cc4a258f7190cd88305dbb79badf0fc6e; bytes 38138.

```javascript
'use strict';
const { copyData, identifier, field, decodeObservation, decodeMeasurement } = require('./observationContract');
const { civilDateInPinnedTimezone } = require('./pinnedCivilTimezone');
const { digest } = require('../kernel/canonicalValue');

const fail = code => { throw new Error(`trace_coverage_${code}`); };
function exactKeys(value, names) {
    return value && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value).sort().join(',') === [...names].sort().join(',');
}
function expectedSet(values, convert) {
    if (!Array.isArray(values)) fail('expected');
    const result = new Map();
    for (const value of values) {
        const converted = convert(value); const key = JSON.stringify(converted);
        if (result.has(key)) fail('expected_duplicate');
        result.set(key, converted);
    }
    return result;
}
function expectedId(value) { if (!identifier(value)) fail('expected'); return value; }
function expectedPath(value) {
    if (!Array.isArray(value) || !value.length || !value.every(field)) fail('expected');
    return value;
}

function scopedTrace(trace, executionId, invocationId) {
    if (!exactKeys(trace, ['stage', 'execution_id', 'derivation_trace', 'proof_trace'])
        || trace.stage !== 'observations_only' || trace.execution_id !== executionId) fail('identity');
    const all = [];
    for (const phase of ['derivation', 'proof']) {
        const entries = trace[`${phase}_trace`];
        if (!Array.isArray(entries)) fail('entries');
        let previous = -1;
        for (const entry of entries) {
            if (!entry || entry.phase !== phase || entry.invocation_id !== invocationId
                || !Number.isSafeInteger(entry.sequence) || entry.sequence <= previous) fail('scope');
            previous = entry.sequence;
            const observation = exactKeys(entry, ['sequence', 'invocation_id', 'phase', 'operation', 'alias', 'role', 'path', 'projection', 'outcome']);
            const measurement = exactKeys(entry, ['sequence', 'invocation_id', 'phase', 'measurement', 'observed']);
            try {
                if (observation) decodeObservation(['I', entry.operation, entry.alias, entry.role, entry.path, entry.projection, entry.outcome]);
                else if (measurement) decodeMeasurement(['M', entry.measurement, entry.observed]);
                else fail('entry');
            } catch { fail('entry'); }
            all.push(entry);
        }
    }
    all.sort((a, b) => a.sequence - b.sequence);
    if (all.some((entry, i) => entry.sequence !== i)) fail('sequence');
    return all;
}

// Host-side validator of a single invocation's recorder output. This component
// does not authenticate the host/TCB, issue parent receipts or accept graphs.
// Unclassified identity/operand-set/measurement events prevent even its local
// match; subsequent integration must classify them explicitly, never drop them.
function compareReadEdgeCoverage(input) {
    let args;
    try { args = copyData(input); } catch { fail('input'); }
    if (!exactKeys(args, ['trace', 'expected', 'executionId', 'invocationId', 'phase'])
        || !identifier(args.executionId) || !identifier(args.invocationId)
        || !['derivation', 'proof'].includes(args.phase)) fail('input');
    const { trace, expected } = args;
    if (!exactKeys(expected, ['required_nodes', 'required_reads', 'required_claim_reads', 'required_edges', 'required_structural'])) fail('expected');
    const expectations = {
        nodes: expectedSet(expected.required_nodes, expectedId),
        reads: expectedSet(expected.required_reads, r => {
            if (!exactKeys(r, ['node', 'segments'])) fail('expected');
            return [expectedId(r.node), expectedPath(r.segments)];
        }),
        claim_reads: expectedSet(expected.required_claim_reads, r => {
            if (!exactKeys(r, ['segments'])) fail('expected');
            return expectedPath(r.segments);
        }),
        edges: expectedSet(expected.required_edges, expectedId),
        structural: expectedSet(expected.required_structural, r => {
            if (!exactKeys(r, ['node', 'operation', 'segments'])
                || !['has', 'keys', 'iterator', 'index', 'order', 'membership', 'cardinality', 'length', 'selection', 'traversal', 'early_termination'].includes(r.operation)
                || !Array.isArray(r.segments) || !r.segments.every(field)) fail('expected');
            return [expectedId(r.node), r.operation, r.segments];
        })
    };
    const all = scopedTrace(trace, args.executionId, args.invocationId);
    const observed = Object.fromEntries(Object.keys(expectations).map(k => [k, new Map()]));
    const add = (dimension, value) => observed[dimension].set(JSON.stringify(value), value);
    const unclassified = []; const covered = [];
    const containers = new Set(); const iterators = new Map(); const keyViews = new Map();
    const containerKey = (e, path = e.path) => JSON.stringify([e.alias, e.role, e.projection, path]);
    function structural(e, operation, path = e.path) {
        add('nodes', e.alias); add('structural', [e.alias, operation, path]);
    }
    function consumeSequence(e) {
        const indexed = ['next', 'at'].includes(e.operation);
        const path = indexed ? e.path.slice(0, -1) : e.path;
        if (!path.every(field) || indexed && !Number.isSafeInteger(e.path.at(-1))) return false;
        const key = containerKey(e, path); const keys = e.projection === 'keys';
        if (!containers.has(key)) return false;
        if (keys) structural(e, 'keys', path);
        switch (e.operation) {
        case 'iterate':
            if (iterators.has(key) && !iterators.get(key).closed) return false;
            iterators.set(key, { cursor: 0, closed: false, exhausted: false });
            if (!keys) structural(e, 'iterator', path);
            return true;
        case 'next': {
            const iterator = iterators.get(key);
            if (!iterator || e.path.at(-1) !== iterator.cursor) return false;
            if (e.outcome[0] === 'done') {
                // After return(), next() reports done without consulting the
                // remaining members. Only natural exhaustion proves coverage.
                if (!iterator.closed) iterator.exhausted = true;
                if (keys && iterator.exhausted && iterator.cursor !== keyViews.get(key).length) return false;
                iterator.closed = true;
                if (!keys && iterator.exhausted) { structural(e, 'order', path); structural(e, 'cardinality', path); }
            } else {
                if (iterator.closed || e.outcome[0] !== 'scalar') return false;
                if (keys && e.outcome[1] !== keyViews.get(key)[iterator.cursor]) return false;
                iterator.cursor++;
            }
            return true;
        }
        case 'return': {
            const iterator = iterators.get(key);
            if (!iterator || e.outcome[1] !== iterator.cursor) return false;
            if (!iterator.closed && !keys) structural(e, 'early_termination', path);
            iterator.closed = true; return true;
        }
        case 'reuse_iterator': {
            const iterator = iterators.get(key);
            return !!iterator && e.outcome[1] === iterator.cursor && e.outcome[2] === iterator.closed;
        }
        case 'length':
            if (keys && e.outcome[1] !== keyViews.get(key).length) return false;
            if (!keys) structural(e, 'cardinality', path);
            return true;
        case 'includes':
            if (keys && e.outcome[2] !== keyViews.get(key).includes(e.outcome[1])) return false;
            if (!keys) structural(e, 'membership', path);
            return true;
        case 'at':
            if (keys) {
                const list = keyViews.get(key); const index = e.path.at(-1);
                if (index < list.length ? e.outcome[0] !== 'scalar' || e.outcome[1] !== list[index] : e.outcome[0] !== 'absent') return false;
            } else structural(e, 'index', path);
            return true;
        default: return false;
        }
    }
    for (const entry of all.filter(e => e.phase === args.phase)) {
        if (entry.operation === 'traverse') {
            add('edges', entry.outcome[1]);
        } else if (entry.operation === 'get' && entry.projection === 'data'
            && entry.path.length && entry.path.every(field)
            && (['scalar', 'absent'].includes(entry.outcome[0]) || entry.outcome[0] === 'container' && ['record', 'sequence'].includes(entry.outcome[1]))) {
            if (entry.alias === 'claim/context') add('claim_reads', entry.path);
            else { add('nodes', entry.alias); add('reads', [entry.alias, entry.path]); }
            // Count the real record read in the exact set, but do not own its
            // sequence here. Only access_metadata can validate its admitted
            // shape/binding and the observed ancestor navigation.
            if (entry.outcome[0] === 'container' && entry.outcome[1] === 'record') {
                unclassified.push({ sequence: entry.sequence, operation: entry.operation });
                continue;
            }
            if (entry.outcome[0] === 'container') containers.add(containerKey(entry));
        } else if (entry.alias !== 'claim/context' && entry.projection === 'data' && entry.path.every(field)
            && ['has', 'keys'].includes(entry.operation)) {
            structural(entry, entry.operation);
            if (entry.operation === 'keys') {
                const key = containerKey({ ...entry, projection: 'keys' });
                containers.add(key); keyViews.set(key, entry.outcome.slice(1));
            }
        } else if (entry.alias !== 'claim/context' && ['data', 'keys'].includes(entry.projection) && consumeSequence(entry)) {
            // Structural coverage is computed from actual iterator lifecycle.
        } else {
            unclassified.push({ sequence: entry.sequence, operation: entry.operation || entry.measurement });
            continue;
        }
        covered.push(entry.sequence);
    }
    const mismatches = [];
    for (const dimension of Object.keys(expectations)) {
        const wanted = expectations[dimension]; const actual = observed[dimension];
        const missing = [...wanted.keys()].filter(k => !actual.has(k)).sort().map(k => wanted.get(k));
        const extra = [...actual.keys()].filter(k => !wanted.has(k)).sort().map(k => actual.get(k));
        if (missing.length || extra.length) mismatches.push({ dimension, missing, extra });
    }
    return copyData({ stage: 'read_edge_coverage_only', graph_accepted: false,
        matched: mismatches.length === 0 && unclassified.length === 0, mismatches, unclassified, covered_sequences: covered });
}

// Selection-only projection. `bindings` is a host-side association resolved
// before execution from the admitted operand/graph identities, never guessed
// from the selected outcome. This does not validate reads, predicates or R.
function compareSelectionCoverage(input) {
    let args;
    try { args = copyData(input); } catch { fail('input'); }
    if (!exactKeys(args, ['trace', 'expected', 'executionId', 'invocationId', 'phase', 'bindings', 'sets'])
        || !identifier(args.executionId) || !identifier(args.invocationId)
        || !['derivation', 'proof'].includes(args.phase) || !Array.isArray(args.bindings)
        || !args.sets || typeof args.sets !== 'object' || Array.isArray(args.sets)
        || !exactKeys(args.expected, ['required_selections', 'selected_nodes'])) fail('selection_input');
    const all = scopedTrace(args.trace, args.executionId, args.invocationId);
    const pair = value => {
        if (!exactKeys(value, ['candidate_set', 'selected_set'])) fail('selection_expected');
        return [expectedId(value.candidate_set), expectedId(value.selected_set)];
    };
    const required = expectedSet(args.expected.required_selections, pair);
    const selectedExpected = expectedSet(args.expected.selected_nodes, expectedId);
    const sets = new Map(Object.entries(args.sets).map(([name, members]) =>
        [expectedId(name), [...expectedSet(members, expectedId).values()]]));
    const bound = new Map(); const boundPairs = new Set();
    for (const b of args.bindings) {
        if (!exactKeys(b, ['role', 'candidate_set', 'selected_set']) || !identifier(b.role)
            || !identifier(b.candidate_set) || !identifier(b.selected_set)
            || !sets.has(b.candidate_set) || !sets.has(b.selected_set)) fail('selection_binding');
        const key = JSON.stringify([b.candidate_set, b.selected_set]);
        if (bound.has(b.role) || boundPairs.has(key)) fail('selection_binding_duplicate');
        if (!required.has(key)) fail('selection_binding_unexpected');
        boundPairs.add(key);
        bound.set(b.role, { binding: b, key, candidates: sets.get(b.candidate_set),
            state: 'pending', cursor: 0, awaitingDecision: false, selected: [], completed: false });
    }
    if (boundPairs.size !== required.size) fail('selection_binding_missing');
    const authoredUnion = new Set();
    for (const [candidate, selected] of required.values()) {
        if (!sets.has(candidate) || !sets.has(selected)
            || sets.get(selected).some(alias => !sets.get(candidate).includes(alias))) fail('selection_expected');
        for (const alias of sets.get(selected)) authoredUnion.add(JSON.stringify(alias));
    }
    if (authoredUnion.size !== selectedExpected.size || [...authoredUnion].some(key => !selectedExpected.has(key))) fail('selection_union');
    const errors = []; const completed = new Map(); const observedUnion = new Set(); const covered = [];
    const error = (entry, code) => errors.push({ sequence: entry.sequence, code });
    for (const entry of all.filter(e => e.phase === args.phase)) {
        if (!['operand_set', 'operand_selection'].includes(entry.projection)) continue;
        const selectionOperation = entry.operation.startsWith('select_');
        const state = bound.get(entry.role);
        if (!state) { if (selectionOperation) error(entry, 'unbound_selection'); continue; }
        if (entry.projection === 'operand_selection') {
            if (selectionOperation || !state.completed || entry.path[0] !== state.viewId) error(entry, 'unknown_selected_view');
            continue;
        }
        switch (entry.operation) {
        case 'select_start':
            if (state.state !== 'pending') { error(entry, 'repeated_selection'); break; }
            state.state = 'running'; covered.push(entry.sequence); break;
        case 'at':
            if (state.state !== 'running') break;
            if (state.awaitingDecision || entry.path[0] !== state.cursor
                || state.cursor >= state.candidates.length || entry.outcome[0] !== 'node'
                || entry.outcome[1] !== state.candidates[state.cursor]) { error(entry, 'candidate_access'); break; }
            state.awaitingDecision = true; covered.push(entry.sequence); break;
        case 'select_member':
            if (state.state !== 'running' || !state.awaitingDecision || entry.path[0] !== state.cursor
                || entry.outcome[1] !== state.candidates[state.cursor]) { error(entry, 'candidate_decision'); break; }
            if (entry.outcome[2]) state.selected.push(entry.outcome[1]);
            state.cursor++; state.awaitingDecision = false; covered.push(entry.sequence); break;
        case 'select_return': {
            if (state.state !== 'running' || state.awaitingDecision || state.cursor !== state.candidates.length
                || JSON.stringify(entry.outcome.slice(2)) !== JSON.stringify(state.selected)) { error(entry, 'selection_return'); break; }
            state.state = 'complete'; state.completed = true; state.viewId = entry.outcome[1];
            completed.set(state.key, state.selected);
            for (const alias of state.selected) observedUnion.add(alias);
            covered.push(entry.sequence);
            break;
        }
        default:
            if (state.state === 'running') error(entry, 'unexpected_selection_operation');
        }
    }
    const mismatches = [];
    for (const [key, [candidate_set, selected_set]] of required) {
        const actual = completed.get(key);
        if (!actual) { mismatches.push({ candidate_set, selected_set, reason: 'selection_missing' }); continue; }
        const expected = new Set(sets.get(selected_set)); const members = new Set(actual);
        const missing = [...expected].filter(alias => !members.has(alias)).sort();
        const extra = [...members].filter(alias => !expected.has(alias)).sort();
        if (missing.length || extra.length) mismatches.push({ candidate_set, selected_set, reason: 'selection_members', missing, extra });
    }
    const actualIds = [...observedUnion].sort();
    const expectedIds = [...selectedExpected.values()].sort();
    if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) mismatches.push({ reason: 'selected_nodes', actual: actualIds, expected: expectedIds });
    return copyData({ stage: 'selection_coverage_only', graph_accepted: false,
        matched: errors.length === 0 && mismatches.length === 0, errors, mismatches, selected_nodes: actualIds,
        covered_sequences: covered });
}

// Internal component: receives only the selection verdict recomputed below,
// never a caller's certificate. Rosters are admitted role bindings supplied
// BEFORE execution, not inferred from observations or selected members.
function compareOperandConsumption(args, selection) {
    if (!Array.isArray(args.operandSets)) fail('operand_bindings');
    const rosters = new Map(); const views = new Map();
    const key = (role, view = null) => JSON.stringify([role, view]);
    for (const binding of args.operandSets) {
        if (!exactKeys(binding, ['role', 'aliases']) || !identifier(binding.role)
            || !identifier(`operand/${binding.role}`) || !Array.isArray(binding.aliases)
            || binding.aliases.length > 512 || rosters.has(binding.role)) fail('operand_bindings');
        const aliases = [...expectedSet(binding.aliases, expectedId).values()];
        rosters.set(binding.role, aliases);
        views.set(key(binding.role), { aliases, iterator: null });
    }
    for (const binding of args.bindings) {
        if (JSON.stringify(rosters.get(binding.role)) !== JSON.stringify(args.sets[binding.candidate_set])) fail('operand_binding');
    }
    const selectionEvents = new Set(selection.covered_sequences);
    const covered = []; const errors = [];
    const error = (entry, code) => errors.push({ sequence: entry.sequence, code });
    const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
    for (const entry of args.trace[`${args.phase}_trace`]) {
        if (!['operand_set', 'operand_selection'].includes(entry.projection)) continue;
        if (selectionEvents.has(entry.sequence)) {
            if (entry.operation === 'select_return' && selection.matched) {
                views.set(key(entry.role, entry.outcome[1]), { aliases: entry.outcome.slice(2), iterator: null });
            }
            continue; // Selection owns its lifecycle, including candidate at().
        }
        if (entry.operation.startsWith('select_')) continue; // Invalid lifecycle remains an error of selection.
        const selected = entry.projection === 'operand_selection';
        const view = views.get(key(entry.role, selected ? entry.path[0] : null));
        if (!view) { error(entry, selected ? 'unknown_selected_view' : 'unknown_operand_role'); continue; }
        const { aliases } = view; const path = selected ? entry.path.slice(1) : entry.path;
        let valid = false;
        switch (entry.operation) {
        case 'length': valid = same(entry.outcome, ['count', aliases.length]); break;
        case 'includes': valid = same(entry.outcome, ['membership', entry.outcome[1], aliases.includes(entry.outcome[1])]); break;
        case 'at': valid = same(entry.outcome, path[0] < aliases.length ? ['node', aliases[path[0]]] : ['absent']); break;
        case 'iterate':
            // The wire format has no iterator IDs. Never guess the origin of
            // events from concurrent iterators on the same role/view.
            if (view.iterator && !view.iterator.closed) { error(entry, 'ambiguous_iterator'); continue; }
            view.iterator = { cursor: 0, closed: false }; valid = true; break;
        case 'next': {
            const iterator = view.iterator;
            if (!iterator || path[0] !== iterator.cursor) break;
            const done = iterator.closed || iterator.cursor === aliases.length;
            valid = same(entry.outcome, done ? ['done'] : ['node', aliases[iterator.cursor]]);
            if (valid) { if (done) iterator.closed = true; else iterator.cursor++; }
            break;
        }
        case 'return':
            valid = !!view.iterator && same(entry.outcome, ['closed', view.iterator.cursor]);
            if (valid) view.iterator.closed = true;
            break;
        case 'reuse_iterator':
            valid = !!view.iterator && same(entry.outcome, ['cursor', view.iterator.cursor, view.iterator.closed]); break;
        default: break;
        }
        if (valid) covered.push(entry.sequence); else error(entry, 'operand_operation');
    }
    return copyData({ stage: 'operand_consumption_only', graph_accepted: false,
        matched: errors.length === 0, errors, covered_sequences: covered });
}

// Authority here is host-supplied admitted metadata, not the observed values.
// This checks consistency only; it does not authenticate that host/TCB.
function compareAccessMetadata(args) {
    if (!Array.isArray(args.accessBindings)) fail('access_bindings');
    const bindings = new Map();
    const key = (alias, role) => JSON.stringify([alias, role]);
    for (const binding of args.accessBindings) {
        const hasClaimStructure = Object.hasOwn(binding, 'claim_structure');
        if (!exactKeys(binding, ['alias', 'role', 'identity', 'records', ...(hasClaimStructure ? ['claim_structure'] : [])]) || !identifier(binding.alias)
            || !identifier(binding.role) || bindings.has(key(binding.alias, binding.role))) fail('access_bindings');
        if (binding.identity !== null) {
            if (!exactKeys(binding.identity, ['kind', 'ref_id', 'version'])) fail('access_identity');
            for (const name of ['kind', 'ref_id', 'version']) {
                try { decodeObservation(['I', 'identity', binding.alias, binding.role, [name], 'node_identity', ['scalar', binding.identity[name]]]); }
                catch { fail('access_identity'); }
            }
        }
        const records = expectedSet(binding.records, path => {
            if (!Array.isArray(path) || !path.every(field)) fail('access_records');
            return path;
        });
        if (!records.has('[]') || [...records.values()].some(path => path.length && !records.has(JSON.stringify(path.slice(0, -1))))) fail('access_records');
        let claim;
        if (hasClaimStructure) {
            if (binding.alias !== 'claim/context' || binding.identity !== null
                || !exactKeys(binding.claim_structure, ['records', 'sequences'])) fail('claim_structure');
            const recordRows = expectedSet(binding.claim_structure.records, row => {
                if (!exactKeys(row, ['path', 'keys']) || !Array.isArray(row.path) || !row.path.every(field)
                    || !Array.isArray(row.keys) || !row.keys.every(field) || new Set(row.keys).size !== row.keys.length) fail('claim_structure');
                return [row.path, row.keys];
            });
            const recordKeys = new Map();
            for (const [path, keys] of recordRows.values()) {
                const id = JSON.stringify(path);
                if (!records.has(id) || recordKeys.has(id)) fail('claim_structure');
                recordKeys.set(id, keys);
            }
            if (recordKeys.size !== records.size) fail('claim_structure');
            for (const path of records.values()) {
                if (path.length && !recordKeys.get(JSON.stringify(path.slice(0, -1))).includes(path.at(-1))) fail('claim_structure');
            }
            const sequenceRows = expectedSet(binding.claim_structure.sequences, row => {
                if (!exactKeys(row, ['path', 'item_hashes']) || !Array.isArray(row.path) || !row.path.length || !row.path.every(field)
                    || !Array.isArray(row.item_hashes) || row.item_hashes.length > 65536
                    || row.item_hashes.some(hash => typeof hash !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(hash))) fail('claim_structure');
                return [row.path, row.item_hashes];
            });
            const sequences = new Map();
            for (const [path, hashes] of sequenceRows.values()) {
                const id = JSON.stringify(path);
                const parent = JSON.stringify(path.slice(0, -1));
                if (records.has(id) || !records.has(parent) || !recordKeys.get(parent).includes(path.at(-1))
                    || sequences.has(id)) fail('claim_structure');
                sequences.set(id, hashes);
            }
            claim = { recordKeys, sequences, openedSequences: new Set(), keyViews: new Map(), iterators: new Map() };
        }
        bindings.set(key(binding.alias, binding.role), { ...binding, records, claim, opened: new Set(['[]']) });
    }
    const errors = []; const covered = [];
    const error = (entry, code) => errors.push({ sequence: entry.sequence, code });
    function claimStructure(binding, entry) {
        const state = binding.claim; const pathId = JSON.stringify(entry.path);
        if (entry.operation === 'keys' && entry.projection === 'data') {
            if (!binding.opened.has(pathId) || !state.recordKeys.has(pathId)) return false;
            const names = state.recordKeys.get(pathId);
            if (JSON.stringify(entry.outcome) !== JSON.stringify(['keys', ...names])) return false;
            state.keyViews.set(pathId, names.map(name => 'sha256:' + digest(name)));
            return true;
        }
        if (!['data', 'keys'].includes(entry.projection)) return false;
        const indexed = ['at', 'next'].includes(entry.operation);
        const path = indexed ? entry.path.slice(0, -1) : entry.path;
        const id = JSON.stringify(path); const viewId = JSON.stringify([entry.projection, path]);
        const hashes = entry.projection === 'keys' ? state.keyViews.get(id)
            : state.openedSequences.has(id) ? state.sequences.get(id) : undefined;
        if (!hashes) return false;
        const same = value => JSON.stringify(entry.outcome) === JSON.stringify(value);
        const scalarAt = index => index < hashes.length
            ? entry.outcome[0] === 'scalar' && 'sha256:' + digest(entry.outcome[1]) === hashes[index]
            : same(['absent']);
        switch (entry.operation) {
        case 'length': return same(['count', hashes.length]);
        case 'at': return Number.isSafeInteger(entry.path.at(-1)) && entry.path.at(-1) >= 0 && scalarAt(entry.path.at(-1));
        case 'includes': return same(['membership', entry.outcome[1], hashes.includes('sha256:' + digest(entry.outcome[1]))]);
        case 'iterate': {
            const old = state.iterators.get(viewId);
            if (old && !old.closed || !same(['opened'])) return false;
            state.iterators.set(viewId, { cursor: 0, closed: false }); return true;
        }
        case 'next': {
            const iterator = state.iterators.get(viewId);
            if (!iterator || entry.path.at(-1) !== iterator.cursor) return false;
            if (iterator.closed || iterator.cursor === hashes.length) {
                if (!same(['done'])) return false;
                iterator.closed = true; return true;
            }
            if (!scalarAt(iterator.cursor)) return false;
            iterator.cursor++; return true;
        }
        case 'return': {
            const iterator = state.iterators.get(viewId);
            if (!iterator || !same(['closed', iterator.cursor])) return false;
            iterator.closed = true; return true;
        }
        case 'reuse_iterator': {
            const iterator = state.iterators.get(viewId);
            return !!iterator && same(['cursor', iterator.cursor, iterator.closed]);
        }
        default: return false;
        }
    }
    for (const entry of args.trace[`${args.phase}_trace`]) {
        const isIdentity = entry.projection === 'node_identity';
        const isRecordAccess = entry.projection === 'data' && ['get', 'has', 'keys'].includes(entry.operation) && entry.path.every(field);
        const isClaimStructure = entry.alias === 'claim/context'
            && ['keys', 'length', 'at', 'includes', 'iterate', 'next', 'return', 'reuse_iterator'].includes(entry.operation);
        if (!isIdentity && !isRecordAccess && !isClaimStructure) continue;
        const binding = bindings.get(key(entry.alias, entry.role));
        if (!binding) { error(entry, 'unknown_access_binding'); continue; }
        if (isIdentity) {
            if (!binding.identity || binding.identity[entry.path[0]] !== entry.outcome[1]) error(entry, 'identity_mismatch');
            else if (!args.expected.required_nodes.includes(entry.alias)) error(entry, 'identity_node_not_required');
            else covered.push(entry.sequence);
            continue;
        }
        if (isClaimStructure) {
            if (!binding.claim || !claimStructure(binding, entry)) error(entry, 'claim_structure_mismatch');
            else covered.push(entry.sequence);
            continue;
        }
        const parent = entry.operation === 'keys' ? entry.path : entry.path.slice(0, -1);
        if (entry.operation !== 'keys' && !entry.path.length || !binding.opened.has(JSON.stringify(parent))) {
            error(entry, 'record_parent_missing'); continue;
        }
        if (entry.operation !== 'get') continue; // Structural coverage remains with reads/edges.
        const pathKey = JSON.stringify(entry.path);
        const isRecord = entry.outcome[0] === 'container' && entry.outcome[1] === 'record';
        if (isRecord !== binding.records.has(pathKey)) { error(entry, 'record_shape'); continue; }
        if (!isRecord) {
            if (binding.claim && entry.outcome[0] === 'container' && entry.outcome[1] === 'sequence') {
                if (!binding.claim.sequences.has(pathKey)) error(entry, 'claim_sequence_unknown');
                else binding.claim.openedSequences.add(pathKey);
            }
            continue; // The read/edge component owns the leaf/sequence event.
        }
        const required = entry.alias === 'claim/context' ? args.expected.required_claim_reads
            : args.expected.required_reads.filter(read => read.node === entry.alias);
        if (!required.some(read => JSON.stringify(read.segments) === pathKey)) {
            error(entry, 'record_not_required'); continue;
        }
        binding.opened.add(pathKey); covered.push(entry.sequence);
    }
    return copyData({ stage: 'access_metadata_only', graph_accepted: false,
        matched: errors.length === 0, errors, covered_sequences: covered });
}

function compareCivilDates(args) {
    const entries = args.trace[`${args.phase}_trace`]; const covered = []; const errors = [];
    const error = (entry, code) => errors.push({ sequence: entry.sequence, code });
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (entry.operation !== 'civil_date') continue;
        const source = entries[i - 1];
        // The instrumented primitive emits get immediately before civil_date.
        // Do not reuse an older read, normalize its instant string or borrow a
        // read from a different role, path, invocation, phase or global position.
        if (!source || source.sequence + 1 !== entry.sequence || source.operation !== 'get'
            || source.projection !== 'data' || source.alias !== entry.alias || source.role !== entry.role
            || JSON.stringify(source.path) !== JSON.stringify(entry.path)
            || source.outcome[0] !== 'scalar' || source.outcome[1] !== entry.outcome[1]) {
            error(entry, 'civil_source'); continue;
        }
        let date;
        try { date = civilDateInPinnedTimezone(source.outcome[1], entry.outcome[2], entry.outcome[3]); }
        catch { error(entry, 'civil_conversion'); continue; }
        if (date !== entry.outcome[4]) { error(entry, 'civil_result'); continue; }
        covered.push(entry.sequence);
    }
    return copyData({ stage: 'civil_conversion_only', graph_accepted: false,
        matched: errors.length === 0, errors, covered_sequences: covered });
}

// Roots are pre-bound by the host's admission, never copied from the actual
// measurement. This checks observations only; caller-provided root expectations
// cannot authenticate a freeze or mint financial/parent acceptance.
function compareMeasurements(args) {
    const expectations = expectedSet(args.measurements === undefined ? [] : args.measurements, value => {
        if (!exactKeys(value, ['measurement', 'observed'])) fail('measurement_expected');
        try { decodeMeasurement(['M', value.measurement, value.observed]); } catch { fail('measurement_expected'); }
        return [value.measurement, value.observed];
    });
    const names = new Map();
    for (const pair of expectations.values()) {
        if (names.has(pair[0])) fail('measurement_duplicate');
        names.set(pair[0], pair[1]);
    }
    const seen = new Set(); const errors = []; const covered = []; const unclassified = [];
    for (const entry of scopedTrace(args.trace, args.executionId, args.invocationId).filter(row => row.phase === args.phase && row.measurement)) {
        if (!names.has(entry.measurement)) { unclassified.push(entry.sequence); continue; }
        if (seen.has(entry.measurement)) { errors.push({ sequence: entry.sequence, code: 'measurement_repeated' }); continue; }
        seen.add(entry.measurement);
        if (names.get(entry.measurement) !== entry.observed) errors.push({ sequence: entry.sequence, code: 'measurement_root' });
        else covered.push(entry.sequence);
    }
    const missing = [...names.keys()].filter(name => !seen.has(name));
    return copyData({ matched: !errors.length && !missing.length && !unclassified.length,
        errors, missing, unclassified_sequences: unclassified, covered_sequences: covered });
}

// Compose only events actually checked by the components, never their ignored
// projections or caller-supplied verdicts. A local phase match is NOT graph
// acceptance: predicates, host identity, freeze authority and receipts remain out
// of scope. Civil conversion checks the pinned runtime, not its binary root.
// Roster consumption and metadata consistency are distinct from
// payload structural coverage: it cannot discharge a snapshot's required reads.
function comparePhaseCoverage(input) {
    let args;
    try { args = copyData(input); } catch { fail('input'); }
    const keys = ['trace', 'expected', 'executionId', 'invocationId', 'phase', 'sets', 'bindings', 'operandSets', 'accessBindings'];
    if (!exactKeys(args, [...keys, ...(Object.hasOwn(args, 'measurements') ? ['measurements'] : [])])) fail('input');
    const readKeys = ['required_nodes', 'required_reads', 'required_claim_reads', 'required_edges', 'required_structural'];
    const selectionKeys = ['required_selections', 'selected_nodes'];
    if (!exactKeys(args.expected, [...readKeys, ...selectionKeys])) fail('expected');
    const scope = { trace: args.trace, executionId: args.executionId, invocationId: args.invocationId, phase: args.phase };
    const project = keys => Object.fromEntries(keys.map(key => [key, args.expected[key]]));
    const readEdges = compareReadEdgeCoverage({ ...scope, expected: project(readKeys) });
    const selection = compareSelectionCoverage({ ...scope, expected: project(selectionKeys), sets: args.sets, bindings: args.bindings });
    const operandSets = compareOperandConsumption(args, selection);
    const accessMetadata = compareAccessMetadata(args);
    const civilDates = compareCivilDates(args);
    const measurements = compareMeasurements(args);
    const components = { read_edges: readEdges, selection, operand_sets: operandSets, access_metadata: accessMetadata, civil_dates: civilDates, measurements };
    const owners = Object.entries(components).map(([name, component]) => ({ name,
        covered: new Set(component.covered_sequences), invalid: new Set((component.errors || []).map(e => e.sequence)) }));
    // Both components have already admitted the complete, identical trace and
    // execution/invocation/phase scope. Preserve every event's original index.
    const eventCoverage = args.trace[`${args.phase}_trace`].map(entry => {
        const sequence = entry.sequence;
        const covering = owners.filter(owner => owner.covered.has(sequence));
        if (covering.length > 1) fail('projection_overlap');
        const invalid = owners.find(owner => owner.invalid.has(sequence));
        if (invalid) return { sequence, status: 'invalid', component: invalid.name };
        if (covering.length) return { sequence, status: 'covered', component: covering[0].name };
        return { sequence, status: 'unsupported', component: 'none' };
    });
    // readEdges.matched also requires standalone classification of every event;
    // composition discharges those events only via an explicit second owner.
    // Its missing/extra requirements and selection errors remain binding.
    return copyData({ stage: 'phase_coverage_only', graph_accepted: false,
        matched: readEdges.mismatches.length === 0 && selection.matched && operandSets.matched && accessMetadata.matched && civilDates.matched && measurements.matched
            && eventCoverage.every(e => e.status === 'covered'),
        components, event_coverage: eventCoverage });
}

module.exports = { compareReadEdgeCoverage, compareSelectionCoverage, comparePhaseCoverage };
```

## src/next/provenance/proofContextBinding.js

SHA-256 3e2e8d34b0fb7c3e7d697208c9a56b7879f72c53c2108d9a75dd783b93222593; Git blob e72a444ab3cd1f18088f88dc0579bdfc1a6e5917; bytes 979.

```javascript
'use strict';
const { copyData } = require('./observationContract');

// Internal TCB binding of an already schema-admitted claim projection.
// The guest receives neither this expected data nor a binding callback.
// Reads are performed on live handles; no trace or acceptance is fabricated.
function bindObservedContext(rawExpected, handle) {
    const expected = copyData(rawExpected);
    const invalid = () => { throw new Error('proof_context_binding'); };
    function bind(value, actual) {
        if (Array.isArray(value)) {
            if (actual.length() !== value.length) invalid();
            for (let index = 0; index < value.length; index++) bind(value[index], actual.at(index));
        } else if (value !== null && typeof value === 'object') {
            for (const [name, item] of Object.entries(value)) bind(item, actual.get(name));
        } else if (actual !== value) invalid();
    }
    bind(expected, handle);
}
module.exports = { bindObservedContext };
```

## src/next/provenance/proofObservedValues.js

SHA-256 e9615d26b5f783ca7ed6b04a6f478aaa88531becde9b95224b48d2692f051ced; Git blob 8105ebdec58c475e6e23d492c70057bebce454d8; bytes 5085.

```javascript
'use strict';
const { validateLiteral } = require('./literalTypes');
const { field } = require('./observationScalars');
const fail = () => { throw new Error('proof_material_invalid'); };
// Same readers used by the TCB and by compiled proof code. Evidence enters
// exclusively through live observed handles, never through a backing object.
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
    const values = [];
    // Natural exhaustion observes both exact cardinality and order. Indexing
    // instead would introduce a different structural dependency into proof.
    for (const value of handle) {
        if (values.length >= 65536) fail();
        values.push(item(value));
    }
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
function record(handle, fields, enumerate = true) {
    if (enumerate) {
        const names = observedKeys(handle);
        if (names.length !== Object.keys(fields).length || names.some(name => !Object.hasOwn(fields, name))) fail();
    }
    return Object.fromEntries(Object.entries(fields).map(([name, type]) => [name, scalar(handle.get(name), { type })]));
}
function period(handle, enumerate = true) {
    const kind = handle.get('kind');
    if (['date', 'as_of', 'through', 'statement_due'].includes(kind)) return record(handle, { kind: 'text', value: 'date' }, enumerate);
    if (['month', 'statement_competence', 'budget_cycle'].includes(kind)) return record(handle, { kind: 'text', value: 'month' }, enumerate);
    if (kind === 'range') {
        const value = record(handle, { kind: 'text', start: 'date', end: 'date', start_inclusive: 'boolean', end_inclusive: 'boolean' }, enumerate);
        if (value.start > value.end) fail(); return value;
    }
    if (kind === 'registry_snapshot') return record(handle, { kind: 'text', snapshot_version: 'id' }, enumerate);
    if (kind === 'request_execution') return record(handle, { kind: 'text', turn_id: 'id' }, enumerate);
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
        // The admitted primary-parent profile has parents=[] and explicitly
        // proves zero cardinality, without inventing an iterator obligation.
        if (value.length() === 0) return [];
        const result = sequence(value, item => record(item, { role_id: 'id', parent_ref: 'id' }));
        if (new Set(result.map(item => item.role_id)).size !== result.length) fail(); return result;
    }
    if (descriptor.type === 'typed_period') return period(value);
    if (descriptor.type === 'typed_result') return typedResult(value);
    return scalar(value, descriptor);
}
module.exports = { readObservedIdentity, observedKeys, sequence, scalar, record, period, typedResult, materialValue };
```

## src/next/provenance/proofOperatorContracts.js

SHA-256 2e68d093bd5cbbe8283478ebf32428925149c68e290952d9fcdfb2f470e9fde8; Git blob ebcbf02caf41ca94cae092048b123fe2ff3c7031; bytes 1636.

```javascript
'use strict';
// Existing non-scalar operator contracts shared by trusted development dispatch
// and build-time lowering. The registry still determines authored operators.
const SPECIAL_PROOF_OPERATORS = Object.freeze(Object.fromEntries(Object.entries({
    fingerprint_is: ['measured_material_fingerprint_equal', ['node:K', 'digest_literal']],
    civil_date_matches: ['instant_local_civil_date_equal', ['datetime', 'date', 'timezone', 'calendar']],
    all_match: ['all_members_satisfy_expanded_conjunction', ['set:node:K', 'predicate_template_ref']],
    none_match: ['no_member_satisfies_expanded_conjunction', ['set:node:K', 'predicate_template_ref']],
    same_field: ['one_distinct_field_value', ['set:node:K', 'field_selector:K:T']],
    join_eq: ['equal_unique_key_domains_and_pairwise_join', ['set:node:A', 'set:node:B', 'field_selector:A:T', 'field_selector:B:T']],
    ordered_by: ['lexicographic_order_with_explicit_ties', ['sequence:node:K', 'sort_key_descriptor:K']],
    edge_pair_complete: ['two_distinct_nodes_share_exact_identity', ['set:node:K', 'edge_selector:K:J', 'node:J']]
}).map(([id, [semantics, args]]) => [id, Object.freeze([semantics, Object.freeze(args)])])));
function matchesSpecialProofOperator(operator) {
    const spec = operator && Object.hasOwn(SPECIAL_PROOF_OPERATORS, operator.id) && SPECIAL_PROOF_OPERATORS[operator.id];
    return Boolean(spec && Object.keys(operator).sort().join(',') === 'args,id,semantics'
        && operator.semantics === spec[0] && JSON.stringify(operator.args) === JSON.stringify(spec[1]));
}
module.exports = { SPECIAL_PROOF_OPERATORS, matchesSpecialProofOperator };
```

## src/next/provenance/proofOperators.js

SHA-256 6d7ed8142652c1c3e3240e58c9333ee5890a9c5cdd62801258b02c4f91dde63b; Git blob 54aa34b802e7383a5fc1a6a15eb2a991c0982169; bytes 18512.

```javascript
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
```

## src/next/provenance/proofParentBinding.js

SHA-256 3b928733cc0adc169071a8991295b9cdfb6782adc54351e7e2879d975614a080; Git blob 1f3b08e0004bd60e5bd39522a182c1d146a6971b; bytes 1318.

```javascript
'use strict';
const { copyData } = require('./observationContract');
const { digest } = require('../kernel/canonicalValue');
const { createMaterialFingerprint } = require('./materialFingerprintCore');
const measure = createMaterialFingerprint(copyData, digest);

// TCB-only: expectations come from the private same-execution transport
// receipt and admitted registry, never from the guest or the observed trace.
// Traversal and every material read still run through instrumented handles.
function bindObservedParents(raw, edge) {
    const rows = copyData(raw); const seen = new Set();
    const invalid = () => { throw new Error('proof_parent_binding'); };
    if (!Array.isArray(rows) || rows.length > 16 || typeof edge !== 'function') invalid();
    for (const row of rows) {
        if (!row || Object.keys(row).sort().join(',') !== 'descriptor,edge_id,expected_fingerprint'
            || typeof row.edge_id !== 'string' || seen.has(row.edge_id)
            || typeof row.expected_fingerprint !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(row.expected_fingerprint)
            || row.descriptor?.kind !== 'derived_claim') invalid();
        seen.add(row.edge_id);
        if (measure(edge(row.edge_id), row.descriptor) !== row.expected_fingerprint) invalid();
    }
}
module.exports = { bindObservedParents };
```

## src/next/provenance/proofProgramData.js

SHA-256 368761e082fbe51d5ec150875af47ffb0f19cdca48f974223a6674f60ff7bea9; Git blob e2e103a43d49dd4f62058362cfcdaf4734d52dd5; bytes 2232.

```javascript
'use strict';
const { field, scalar } = require('./observationScalars');

// Guest-local program values only. NOT transport/output admission: the TCB
// wrappers retain node:util.types.isProxy before inspecting untrusted data.
// The measured program constructs these values from constants and observed
// scalars. No host predicate, native API or raw evidence is endowed here.
function copyProgramData(input) {
    let count = 0; let characters = 0; const ancestors = new Set();
    const fail = () => { throw new Error('proof_program_data_invalid'); };
    function copy(value, depth) {
        if (++count > 65536 || depth > 32) fail();
        if (scalar(value)) {
            if (typeof value === 'string' && (characters += value.length) > 1048576) fail();
            return value;
        }
        if (!value || typeof value !== 'object' || ancestors.has(value)) fail();
        const array = Array.isArray(value);
        if (array ? Object.getPrototypeOf(value) !== Array.prototype
            : ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail();
        const descriptors = Object.getOwnPropertyDescriptors(value);
        const keys = Reflect.ownKeys(descriptors);
        if (keys.some(key => typeof key !== 'string') || keys.length > 65536) fail();
        ancestors.add(value);
        let result;
        if (array) {
            const length = descriptors.length.value;
            if (keys.length !== length + 1) fail();
            result = [];
            for (let index = 0; index < length; index++) {
                const item = descriptors[index];
                if (!item || !item.enumerable || !Object.hasOwn(item, 'value')) fail();
                result.push(copy(item.value, depth + 1));
            }
        } else {
            result = Object.create(null);
            for (const key of keys) {
                const item = descriptors[key];
                if (!field(key)
                    || !item.enumerable || !Object.hasOwn(item, 'value')) fail();
                result[key] = copy(item.value, depth + 1);
            }
        }
        ancestors.delete(value); return Object.freeze(result);
    }
    return copy(input, 0);
}
module.exports = { copyProgramData };
```

## src/next/provenance/proofSha256.js

SHA-256 5e911bfa787507bdba6beafc5bc84160492dbcd0b10f838d80924827775dfe2f; Git blob 013fb23eccb6bcf032fa7ab6673e8100b16d8bd8; bytes 4105.

```javascript
'use strict';

// SHA-256 over bounded UTF-8 program data. No native API, ambient encoding
// service or host callback is endowed to the proof compartment. The native
// TCB digest remains unchanged and is the differential test oracle only.
const K = Object.freeze([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
const rotate = (value, amount) => value >>> amount | value << (32 - amount);
function sha256Utf8(text) {
    if (typeof text !== 'string' || text.length > 1048576) throw new Error('proof_sha256_input');
    const bytes = new Uint8Array(text.length * 3 + 72);
    let length = 0;
    for (let index = 0; index < text.length; index++) {
        let code = text.charCodeAt(index);
        if (code >= 0xd800 && code <= 0xdbff) {
            const low = text.charCodeAt(index + 1);
            if (low >= 0xdc00 && low <= 0xdfff) { code = 0x10000 + ((code - 0xd800) << 10) + low - 0xdc00; index++; }
            else code = 0xfffd;
        } else if (code >= 0xdc00 && code <= 0xdfff) code = 0xfffd;
        if (code < 0x80) bytes[length++] = code;
        else if (code < 0x800) { bytes[length++] = 0xc0 | code >>> 6; bytes[length++] = 0x80 | code & 63; }
        else if (code < 0x10000) {
            bytes[length++] = 0xe0 | code >>> 12; bytes[length++] = 0x80 | code >>> 6 & 63; bytes[length++] = 0x80 | code & 63;
        } else {
            bytes[length++] = 0xf0 | code >>> 18; bytes[length++] = 0x80 | code >>> 12 & 63;
            bytes[length++] = 0x80 | code >>> 6 & 63; bytes[length++] = 0x80 | code & 63;
        }
    }
    const total = Math.ceil((length + 9) / 64) * 64;
    bytes[length] = 0x80;
    // The bounded input is below 2^29 bytes, hence its bit length fits uint32;
    // the high half of the required uint64 length remains zero-initialized.
    const bits = length * 8;
    for (let index = 0; index < 4; index++) bytes[total - 1 - index] = bits >>> (index * 8) & 255;
    const state = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const words = new Uint32Array(64);
    for (let block = 0; block < total; block += 64) {
        for (let index = 0; index < 16; index++) {
            const at = block + index * 4;
            words[index] = bytes[at] << 24 | bytes[at + 1] << 16 | bytes[at + 2] << 8 | bytes[at + 3];
        }
        for (let index = 16; index < 64; index++) {
            const a = words[index - 15]; const b = words[index - 2];
            words[index] = words[index - 16] + (rotate(a, 7) ^ rotate(a, 18) ^ a >>> 3)
                + words[index - 7] + (rotate(b, 17) ^ rotate(b, 19) ^ b >>> 10);
        }
        let [a, b, c, d, e, f, g, h] = state;
        for (let index = 0; index < 64; index++) {
            const first = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25))
                + ((e & f) ^ (~e & g)) + K[index] + words[index]) >>> 0;
            const second = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22))
                + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
            h = g; g = f; f = e; e = d + first >>> 0; d = c; c = b; b = a; a = first + second >>> 0;
        }
        for (const [index, value] of [a, b, c, d, e, f, g, h].entries()) state[index] = state[index] + value >>> 0;
    }
    return state.map(value => value.toString(16).padStart(8, '0')).join('');
}
module.exports = { sha256Utf8 };
```

## src/next/provenance/scalarProofCore.js

SHA-256 82aec84284d74525fe6f0b18a27c58b373f4becb93acdcb4a241f5070b7a73bf; Git blob e064d4e6ba32424f3dca51ca1cc8e268fb7786c2; bytes 13694.

```javascript
'use strict';
const { unifyOperatorTypes } = require('./operatorTypes');
const { validateLiteral } = require('./literalTypes');
const { parseDate, parseMonth, dayOrdinal, offsetDate, monthBounds, inclusiveDayCount } = require('./civilCalendar');

// Pure implementation shared by the TCB wrapper and the closed guest bundle.
// Dependencies are bound internally by their respective measured closures.
function createScalarProofPrimitives(copyData, canonicalValue) {
    // Internal execution primitive, NOT a provenance acceptance API. The closed
    // program must resolve operands through observed handles before calling this.
    // It produces boolean relationships only, never a metric R or causal metadata.
    const definitions = Object.freeze({
        eq: ['typed_equal', ['scalar:T', 'scalar:T']],
        not_eq: ['typed_unequal', ['scalar:T', 'scalar:T']],
        same_identity: ['same_kind_ref_version', ['node:K', 'node:K']],
        kind_is: ['exact_kind', ['node:K', 'kind_literal']],
        ref_targets_node: ['edge_resolves_exact_target', ['edge_ref:K', 'node:K']],
        edge_target_in_set: ['resolved_target_member', ['edge_ref:K', 'set:node:K']],
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
    function nodeValue(kind, value) {
        keys(value, ['kind', 'ref_id', 'version']);
        if (typeof kind !== 'string' || !/^[a-z][a-z0-9_]*$/.test(kind) || value.kind !== kind
            || typeof value.ref_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$/.test(value.ref_id)
            || typeof value.version !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value.version)) fail('node');
    }
    function memberValue(type, value) {
        if (type?.form === 'node') nodeValue(type.kind, value);
        else scalarValue(type, value);
    }
    function operandValue(operand) {
        keys(operand, ['type', 'value']); const { type, value } = operand;
        if (type.form === 'scalar') scalarValue(type, value);
        else if (type.form === 'node') nodeValue(type.kind, value);
        else if (type.form === 'edge') nodeValue(type.target, value);
        else if (type.form === 'kind_literal') { if (typeof value !== 'string' || !/^[a-z][a-z0-9_]*$/.test(value)) fail('node_kind'); }
        else if (type.form === 'field') scalarValue(type.value, value);
        else if (type.form === 'state_literal') { if (typeof value !== 'string' || !value.length) fail('state'); }
        else if (['range', 'period'].includes(type.form)) {
            periodValue(value);
            if (type.form === 'range' && value.kind !== 'range' || type.periodKind !== undefined && type.periodKind !== value.kind) fail('period_type');
        } else if (['sequence', 'set'].includes(type.form)) {
            if (!Array.isArray(value) || !['scalar', 'node'].includes(type.item?.form)) fail('collection');
            value.forEach(item => memberValue(type.item, item));
            if (type.form === 'set' && new Set(value.map(item => scalarKey(type.item, item))).size !== value.length) fail('duplicate');
        } else fail('value_type');
    }
    function scalarKey(type, value) {
        if (type.form === 'node' || type.form === 'edge') return JSON.stringify([value.kind, value.ref_id, value.version]);
        return type.type === 'datetime' ? instant(value) : value;
    }
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
        // installments_realized_v1 explicitly defines through as an inclusive
        // cutoff. It is not period equality and does not impose a guessed start.
        if (period.kind === 'through') return ordinal <= dayOrdinal(period.value);
        if (['month', 'statement_competence', 'budget_cycle'].includes(period.kind)) return date.slice(0, 7) === period.value;
        if (period.kind === 'range') {
            const start = dayOrdinal(period.start); const end = dayOrdinal(period.end);
            return (ordinal > start || ordinal === start && period.start_inclusive)
                && (ordinal < end || ordinal === end && period.end_inclusive);
        }
        // as_of is a snapshot lens, not an implicit accumulation range. Balance
        // graphs explicitly lower it with the opening-balance date into a range.
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
            && !['date', 'through', 'statement_due', 'month', 'statement_competence', 'budget_cycle', 'range'].includes(b.kind)) fail('period_containment_pending');
        if (operator.id === 'state_is' && !JSON.parse(type.domain).includes(b)) fail('state_domain');
        switch (operator.id) {
        case 'same_identity': case 'ref_targets_node': return scalarKey(type, a) === scalarKey(operands[1].type, b);
        case 'kind_is': return a.kind === b;
        case 'edge_target_in_set': return b.some(value => scalarKey(operands[1].type.item, value) === scalarKey(type, a));
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

    function compareTypedScalars(rawType, a, b) {
        const type = copyData(rawType);
        scalarValue(type, a); scalarValue(type, b);
        if (type.type === 'datetime') {
            const [secondsA, fractionA] = instant(a).split(':');
            const [secondsB, fractionB] = instant(b).split(':');
            if (Number(secondsA) !== Number(secondsB)) return Number(secondsA) < Number(secondsB) ? -1 : 1;
            const length = Math.max(fractionA.length, fractionB.length);
            a = fractionA.padEnd(length, '0'); b = fractionB.padEnd(length, '0');
        }
        return a === b ? 0 : a < b ? -1 : 1;
    }

    function supportsOperator(raw) {
        const operator = copyData(raw);
        keys(operator, ['id', 'args', 'semantics']);
        const spec = Object.hasOwn(definitions, operator.id) && definitions[operator.id];
        return Boolean(spec && operator.semantics === spec[0]
            && canonicalValue(operator.args) === canonicalValue(spec[1]));
    }
    return Object.freeze({ evaluateScalarProof, compareTypedScalars, supportsOperator });
}
module.exports = { createScalarProofPrimitives };
```

## src/next/provenance/scalarProofOperators.js

SHA-256 924e5f5953bb02dc02b4b8affcba79a5aefc6a3cad3242738f1b44c364bfb461; Git blob e35e32715a9633c25f3495eb8cb2c4be4cebb2d4; bytes 447.

```javascript
'use strict';
const { copyData } = require('./observationContract');
const { canonicalValue } = require('../kernel/canonicalValue');
const { createScalarProofPrimitives } = require('./scalarProofCore');
// Native transport admission remains mandatory for the TCB entry point.
const { evaluateScalarProof, compareTypedScalars } = createScalarProofPrimitives(copyData, canonicalValue);
module.exports = { evaluateScalarProof, compareTypedScalars };
```
