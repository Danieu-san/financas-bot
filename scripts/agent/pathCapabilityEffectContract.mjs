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
