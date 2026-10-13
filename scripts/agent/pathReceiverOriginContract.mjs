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
