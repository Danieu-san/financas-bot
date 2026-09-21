'use strict';

const { admittedDocuments } = require('./packageContract');
const { digest } = require('../kernel/canonicalValue');
const { validateGraphStructure } = require('./graphStructure');
const { validateTemplateReferences } = require('./templateReferences');
const { compilePredicateTypes } = require('./predicateTypes');
const { validateSchemaRegistryProjection } = require('./schemaRegistryProjection');
const { validateObligationBindings } = require('./obligationBindings');
const { compileOperandBindings } = require('./operandBindings');
const { validateClaimRequirements } = require('./claimRequirements');
const { validateSelectionBindings } = require('./selectionBindings');
const { lowerAuthoringIR } = require('./authoringIR');
const { validateCollectionRequirements } = require('./collectionRequirements');
const { createInstrumentedAccess, createNodeSetAccess } = require('./instrumentedAccess');
const { copyData, identifier } = require('./observationContract');
const { projectClaimContext } = require('./claimContext');

function fail(code) { throw new Error(`graph_index_${code}`); }
function text(value) {
    if (typeof value !== 'string' || !value.length) fail('identity_invalid');
    return value;
}
function list(value) {
    if (!Array.isArray(value)) fail('shape_invalid');
    return value;
}
function object(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('shape_invalid');
    return value;
}
function unique(items, key) {
    const result = new Map();
    for (const item of list(items)) {
        const id = text(key(item));
        if (result.has(id)) fail('duplicate');
        result.set(id, item);
    }
    return result;
}
function equalSet(actual, expected) {
    if (actual.size !== expected.size || [...actual.keys()].some(key => !expected.has(key))) {
        fail('inventory_mismatch');
    }
}
function evaluatorKey(ref) {
    object(ref);
    if (!Number.isSafeInteger(ref.evaluator_version) || ref.evaluator_version < 1) fail('evaluator_invalid');
    return JSON.stringify([text(ref.evaluator_id), ref.evaluator_version]);
}
function freeze(value) {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value)) freeze(child);
        Object.freeze(value);
    }
    return value;
}

/**
 * First compiler pass only: identity index and static parent dependency graph.
 * Input document schemas, operators, snapshots and proof obligations must still
 * be validated by later passes. This result is deliberately not executable IR.
 */
function indexGraphDependencies({ graphs, claims, evaluators, expectedFactKeys }) {
    const expected = unique(expectedFactKeys, key => key);
    if (!expected.size) fail('inventory_mismatch');
    const graphMap = unique(graphs, graph => object(graph).fact_key);
    const claimMap = unique(claims, claim => object(claim).fact_key);
    unique(claims, claim => claim.claim_id);
    unique(graphs, graph => graph.claim_id);
    const evaluatorMap = unique(evaluators, evaluatorKey);
    equalSet(graphMap, expected);
    equalSet(claimMap, expected);

    const rows = [];
    for (const fact_key of [...expected.keys()].sort()) {
        const graph = graphMap.get(fact_key);
        const claim = claimMap.get(fact_key);
        if (graph.claim_id !== claim.claim_id) fail('claim_mismatch');
        const evaluator = evaluatorMap.get(evaluatorKey(claim.evaluator_ref));
        if (!evaluator) fail('evaluator_missing');
        if (claim.metric !== evaluator.metric || claim.unit !== evaluator.unit) fail('evaluator_mismatch');
        const roles = unique(evaluator.roles, role => object(role).role_id);
        const bindings = object(claim.operand_bindings);
        equalSet(new Map(Object.keys(bindings).map(key => [key, true])), roles);
        const nodes = object(graph.nodes);
        if (Object.hasOwn(nodes, 'claim')) fail('reserved_node_alias');
        unique(graph.edges, edge => object(edge).id);
        const parentNodes = Object.entries(nodes).filter(([, node]) => object(node).binding === 'validated_parent');
        for (const [, node] of parentNodes) {
            if (node.kind !== 'derived_claim'
                || node.identity_resolution !== 'same_execution_validated_parent_receipt'
                || !graphMap.has(node.fact_key)) fail('parent_invalid');
        }
        const derivedEdges = graph.edges.filter(edge => edge.relation === 'derived_from');
        const usedEdges = new Set();
        const usedNodes = new Set();
        const parents = [];
        for (const role of roles.keys()) {
            const binding = object(bindings[role]);
            if (binding.kind !== 'parent_claim') continue;
            if (!graphMap.has(binding.fact_key)) fail('parent_missing');
            const candidates = derivedEdges.filter(edge => edge.source === 'claim' && edge.field === role);
            if (candidates.length !== 1) fail('parent_edge_mismatch');
            const edge = candidates[0];
            const node = nodes[edge.target];
            if (!Object.hasOwn(nodes, edge.target) || node.binding !== 'validated_parent'
                || node.fact_key !== binding.fact_key) fail('parent_binding_mismatch');
            usedEdges.add(edge.id);
            usedNodes.add(edge.target);
            parents.push({ role, fact_key: binding.fact_key, alias: edge.target });
        }
        if (usedEdges.size !== derivedEdges.length || usedNodes.size !== parentNodes.length) fail('parent_extra');
        rows.push({ fact_key, claim_id: claim.claim_id,
            evaluator_ref: { evaluator_id: evaluator.evaluator_id, evaluator_version: evaluator.evaluator_version }, parents });
    }

    // DFS follows registry role order; independent of input document ordering.
    const byKey = new Map(rows.map(row => [row.fact_key, row]));
    const active = new Set();
    const visited = new Set();
    const order = [];
    function visit(key) {
        if (active.has(key)) fail('cycle');
        if (visited.has(key)) return;
        active.add(key);
        for (const parent of byKey.get(key).parents) visit(parent.fact_key);
        active.delete(key);
        visited.add(key);
        order.push(key);
    }
    for (const key of byKey.keys()) visit(key);
    return freeze({ stage: 'indexed_authoring_only', evaluatorCount: evaluatorMap.size, graphs: rows, order });
}

/** Shared admission/compile pipeline. Neither public view is proof approval. */
function compileAuthoring(admitted, validators) {
    const documents = new Map(admittedDocuments(admitted).map(document => [document.path, document]));
    function document(path, expectedHash) {
        const value = documents.get(path);
        if (!value) fail('authority_missing');
        if (expectedHash !== undefined && value.sha256 !== expectedHash) fail('authority_hash');
        return value.value;
    }
    function validate(name, value) {
        if (typeof validators?.[name] !== 'function' || validators[name](value) !== true) fail(`schema_${name}`);
    }
    const graphs = document('docs/contracts/next/provenance-v2/graphs-v2.json');
    validate('graphs', graphs);
    if (graphs.stage !== 'authoring') fail('stage_invalid');
    const resolved = {};
    for (const key of ['claim_contract', 'snapshot_manifest', 'material_registry', 'operator_registry', 'metric_evaluator_registry']) {
        resolved[key] = document(graphs[key].path, graphs[key].hash);
    }
    const claims = resolved.claim_contract;
    const registry = resolved.metric_evaluator_registry;
    const claimSchema = document('docs/contracts/next/provenance-v2/claim-contract.schema.json');
    validateSchemaRegistryProjection({ registry: resolved.material_registry, claimSchema,
        snapshotSchema: document('docs/contracts/next/provenance-v2/evidence-snapshot.schema.json') });
    validate('claims', claims);
    validate('registry', registry);
    if (registry.stage !== 'authoring') fail('stage_invalid');
    const contracts = registry.entries.map(entry => {
        const value = document(entry.contract_path, entry.evaluator_contract_hash);
        validate('evaluator', value);
        return { path: entry.contract_path, value };
    });
    const snapshots = resolved.snapshot_manifest;
    if (snapshots.stage !== 'authoring') fail('stage_invalid');
    for (const source of list(snapshots.sources)) document(source.path, source.sha256);
    unique(snapshots.snapshots, snapshot => JSON.stringify([text(snapshot.kind), text(snapshot.ref_id), text(snapshot.version)]));
    for (const snapshot of snapshots.snapshots) {
        const { ref_id, kind, version, payload } = snapshot;
        validate('snapshot', { ref_id, kind, version, payload });
        if (payload.id !== ref_id) fail('snapshot_identity');
    }
    validateStaticEvidence(graphs.graphs, snapshots.snapshots, resolved.material_registry);
    for (const graph of graphs.graphs) for (const source of graph.authoring_sources) document(source.path);
    const original = document('tests/fixtures/financasbot-next/golden-fact-contracts-v1.json');
    const expectedFactKeys = Object.values(object(original.turns)).flatMap(turn => list(turn).map(fact => fact.fact_key));
    const index = indexGraphDependencies({ graphs: graphs.graphs, claims: claims.claims,
        evaluators: registry.entries, expectedFactKeys });
    const operandBindings = compileOperandBindings({ graphs: graphs.graphs, claims: claims.claims, evaluators: registry.entries, contracts });
    validateGraphStructure({ graphs: graphs.graphs, claims: claims.claims,
        materialRegistry: resolved.material_registry, operatorRegistry: resolved.operator_registry });
    const templates = document('docs/contracts/next/provenance-v2/predicate-templates-v1.json');
    validateTemplateReferences({ graphs: graphs.graphs, operators: resolved.operator_registry.operators,
        templates,
        materialRegistry: resolved.material_registry, claims: claims.claims });
    const predicateTypes = compilePredicateTypes({ graphs: graphs.graphs, claims: claims.claims, snapshots: snapshots.snapshots,
        materialRegistry: resolved.material_registry, operatorRegistry: resolved.operator_registry,
        claimSchema });
    validateObligationBindings({ graphs: graphs.graphs, snapshots: snapshots.snapshots,
        materialRegistry: resolved.material_registry });
    validateClaimRequirements({ graphs: graphs.graphs, claims: claims.claims });
    const selectionBindings = validateSelectionBindings({ graphs: graphs.graphs, claims: claims.claims,
        materialRegistry: resolved.material_registry });
    validateCollectionRequirements({ graphs: graphs.graphs, snapshots: snapshots.snapshots,
        materialRegistry: resolved.material_registry });
    return { documents: [...documents.values()], graphs: graphs.graphs, claims: claims.claims,
        index, operandBindings, predicateTypes, selectionBindings, templates,
        snapshots: snapshots.snapshots, materialRegistry: resolved.material_registry, claimSchema };
}

function compileAuthoringIndex(admitted, validators) {
    return compileAuthoring(admitted, validators).index;
}

function compileAuthoringIR(admitted, validators) {
    return lowerAuthoringIR(compileAuthoring(admitted, validators));
}

// Host/TCB factory only; never endow this controller into a guest compartment.
// No caller-supplied payload, shape, role declaration or identity override.
// openSet admits the initial ordered roster; its handle.select computes new
// views, but neither is approval of graph selection obligations. These methods
// do not authorize validated-parent receipts or claim-context access.
function compileSnapshotAccess(admitted, validators) {
    const context = compileAuthoring(admitted, validators);
    const reject = code => { throw new Error(`snapshot_access_${code}`); };
    const identity = node => JSON.stringify([node.kind, node.ref_id, node.version]);
    const scalarTypes = new Set(['id', 'text', 'date', 'month', 'datetime', 'integer',
        'positive_integer', 'nonnegative_integer', 'money_minor', 'boolean', 'enum', 'digest', 'ref']);
    // Projection follows the already schema-checked finite registry grammar.
    // Nominal validation remains in the shared admission pass, not this layer.
    function project(descriptor) {
        if (descriptor.class === 'non_material') return { type: 'non_material' };
        if (scalarTypes.has(descriptor.type)) return { type: 'scalar' };
        if (descriptor.type === 'ref_list') return { type: 'sequence', item: { type: 'scalar' } };
        if (descriptor.type === 'role_ref_list') return { type: 'sequence', item: {
            type: 'record', fields: { role_id: { type: 'scalar' }, parent_ref: { type: 'scalar' } }
        } };
        // typed_result/typed_period require a separately admitted validated-
        // parent/claim projection. Do not guess shape from caller data.
        reject('unsupported_field_type');
    }
    const snapshots = new Map(context.snapshots.map(snapshot => {
        const descriptors = context.materialRegistry.kinds[snapshot.kind].fields;
        const shape = { type: 'record', fields: Object.fromEntries(Object.entries(descriptors)
            .map(([name, descriptor]) => [name, project(descriptor)])) };
        return [identity(snapshot), { value: snapshot.payload, shape: freeze(shape),
            identity: freeze({ kind: snapshot.kind, ref_id: snapshot.ref_id, version: snapshot.version }) }];
    }));
    const graphs = new Map(context.graphs.map(g => [g.fact_key, g]));
    const contexts = new Map(context.claims.map(claim => [claim.fact_key, projectClaimContext(claim, context.claimSchema)]));
    const bindings = new Map(context.operandBindings.graphs.map(g => [g.fact_key,
        new Map(g.operands.map(b => [b.role_ref.role_id, b]))]));
    function select(selector, emit, set) {
        let selected;
        try { selected = copyData(selector); } catch { reject('selector'); }
        if (!selected || typeof selected !== 'object' || Array.isArray(selected)
            || Object.keys(selected).sort().join(',') !== (set ? 'fact_key,role_id' : 'alias,fact_key,role_id')
            || !Object.values(selected).every(identifier) || typeof emit !== 'function') reject('selector');
        const binding = bindings.get(selected.fact_key)?.get(selected.role_id);
        if (!binding) reject('binding');
        return { ...selected, binding };
    }
    function sourceBinding(fact_key, role, alias) {
        const node = graphs.get(fact_key).nodes[alias];
        const snapshot = snapshots.get(identity(node));
        if (node.binding !== 'snapshot' || !snapshot) reject('snapshot');
        return { alias, role, value: snapshot.value, shape: snapshot.shape, identity: snapshot.identity };
    }
    function reachable(fact_key, role, aliases) {
        const graph = graphs.get(fact_key); const visited = new Set(aliases); const queue = [...aliases]; const links = [];
        for (let i = 0; i < queue.length; i++) {
            for (const edge of graph.edges) {
                if (edge.relation !== 'material_ref' || edge.source !== queue[i]) continue;
                const source = graph.nodes[edge.source]; const target = graph.nodes[edge.target];
                if (source.binding !== 'snapshot' || target.binding !== 'snapshot') reject('traversal_parent_pending');
                const descriptor = context.materialRegistry.kinds[source.kind].fields[edge.field];
                if (descriptor.class !== 'edge') reject('traversal_field');
                links.push({ id: edge.id, source: edge.source, field: edge.field, target: edge.target, type: descriptor.type });
                if (!visited.has(edge.target)) { visited.add(edge.target); queue.push(edge.target); }
            }
        }
        return { bindings: queue.map(node => sourceBinding(fact_key, role, node)), links };
    }
    return Object.freeze({ stage: 'snapshot_access_plan_only', executable: false,
        snapshot_count: snapshots.size,
        observationMetadata(selector) {
            let input;
            try { input = copyData(selector); } catch { reject('metadata_selector'); }
            if (!input || Object.keys(input).sort().join(',') !== 'fact_key,phase' || !identifier(input.fact_key)
                || !['derivation', 'proof'].includes(input.phase)) reject('metadata_selector');
            const graph = graphs.get(input.fact_key);
            if (!graph) reject('metadata_graph');
            if (Object.values(graph.nodes).some(node => node.binding !== 'snapshot')) reject('metadata_parent_pending');
            const sources = [];
            if (input.phase === 'derivation') {
                for (const [role, binding] of bindings.get(input.fact_key)) {
                    if (binding.kind === 'claim_context') sources.push({ alias: 'claim/context', role, ...contexts.get(input.fact_key) });
                    else if (['node', 'node_set'].includes(binding.kind)) sources.push(...reachable(input.fact_key, role,
                        binding.kind === 'node' ? [binding.alias] : binding.aliases).bindings);
                    else reject('metadata_parent_pending');
                }
            } else {
                const nodes = reachable(input.fact_key, 'proof/snapshot', Object.keys(graph.nodes)).bindings;
                sources.push(...nodes, { alias: 'claim/context', role: 'proof/context', ...contexts.get(input.fact_key) });
                const selected = new Set(graph.selections.map(selection => selection.selected_set));
                for (const name of Object.keys(graph.sets).filter(name => !selected.has(name))) {
                    sources.push(...nodes.map(binding => ({ ...binding, role: `proof/set/${name}` })));
                }
            }
            // Metadata follows the SAME admitted shapes, presence and reachability
            // used by the access factories. Never infer it from a trace or expose
            // payload values. Record elements inside sequences remain unsupported.
            return copyData(sources.map(binding => {
                const records = [];
                function visit(shape, value, path) {
                    if (shape.type !== 'record' || value === undefined) return;
                    records.push(path);
                    for (const [name, child] of Object.entries(shape.fields)) {
                        if (Object.hasOwn(value, name)) visit(child, value[name], [...path, name]);
                    }
                }
                visit(binding.shape, binding.value, []);
                return { alias: binding.alias, role: binding.role, identity: binding.identity || null, records };
            }));
        },
        openProof(selector, emit) {
            let input;
            try { input = copyData(selector); } catch { reject('proof_selector'); }
            if (!input || Object.keys(input).join(',') !== 'fact_key'
                || !identifier(input.fact_key) || typeof emit !== 'function') reject('proof_selector');
            const graph = graphs.get(input.fact_key);
            if (!graph) reject('proof_graph');
            if (Object.values(graph.nodes).some(node => node.binding !== 'snapshot')) reject('proof_parent_pending');
            // This tag names the proof transport scope, NOT a metric operand
            // role. The execution host must bind this factory to phase proof.
            // No required_reads/expected_trace is used to manufacture events.
            const reachableNodes = reachable(input.fact_key, 'proof/snapshot', Object.keys(graph.nodes));
            let failed = false; let revoked = false;
            let selectionBusy = false;
            const controllers = []; const sets = new Map(); const selected = new Map();
            const selectionNames = new Set(graph.selections.map(s => s.selected_set));
            const check = () => {
                if (failed) reject('proof_failed');
                for (const controller of controllers) controller.assertHealthy();
                if (revoked) { failed = true; reject('proof_revoked'); }
            };
            const invalid = code => { failed = true; reject(code); };
            const observe = event => { check(); emit(event); check(); };
            const access = createInstrumentedAccess({ bindings: [...reachableNodes.bindings,
                { alias: 'claim/context', role: 'proof/context', ...contexts.get(input.fact_key) }],
                links: reachableNodes.links, emit: observe });
            controllers.push(access);
            function set(name) {
                check();
                if (typeof name !== 'string' || !Object.hasOwn(graph.sets, name)) invalid('proof_set');
                if (selected.has(name)) return selected.get(name);
                if (selectionNames.has(name)) invalid('proof_selection_pending');
                if (!sets.has(name)) {
                    const role = `proof/set/${name}`;
                    const controller = createNodeSetAccess({ role,
                        bindings: reachableNodes.bindings.map(binding => ({ ...binding, role })),
                        links: reachableNodes.links, roster: graph.sets[name], emit: observe });
                    controllers.push(controller); sets.set(name, controller.handle);
                }
                return sets.get(name);
            }
            function resolveReference(alias, field, ref) {
                check();
                if (typeof alias !== 'string' || typeof field !== 'string' || typeof ref !== 'string') invalid('proof_reference');
                const matches = graph.edges.filter(e => e.relation === 'material_ref' && e.source === alias
                    && e.field === field && graph.nodes[e.target].ref_id === ref);
                if (matches.length !== 1) invalid('proof_reference');
                return access.handle(alias).traverse(matches[0].id);
            }
            return Object.freeze({
                node(alias) { check(); return access.handle(alias); },
                claim() { check(); return access.handle('claim/context'); },
                set,
                select(candidate, target, predicate) {
                    check();
                    if (selectionBusy || selected.has(target) || !graph.selections.some(s =>
                        s.candidate_set === candidate && s.selected_set === target)) invalid('proof_selection');
                    selectionBusy = true;
                    try {
                        const view = set(candidate).select(predicate);
                        check(); selected.set(target, view); return view;
                    } finally { selectionBusy = false; }
                },
                edge(id) {
                    check(); const edge = graph.edges.find(e => e.id === id && e.relation === 'material_ref');
                    if (!edge) invalid('proof_edge');
                    return access.handle(edge.source).traverse(id);
                },
                resolveReference,
                memberEdge(member, field) {
                    check();
                    const tuple = ['kind', 'ref_id', 'version'].map(key => member.identity(key));
                    const aliases = Object.entries(graph.nodes).filter(([, n]) => identity(n) === JSON.stringify(tuple));
                    if (aliases.length !== 1) invalid('proof_reference');
                    return resolveReference(aliases[0][0], field, member.get(field));
                },
                fieldDescriptor(kind, segments) {
                    check();
                    if (typeof kind !== 'string' || !Object.hasOwn(context.materialRegistry.kinds, kind)
                        || !Array.isArray(segments) || segments.length !== 1) invalid('proof_field');
                    const fields = context.materialRegistry.kinds[kind].fields;
                    if (typeof segments[0] !== 'string' || !Object.hasOwn(fields, segments[0])
                        || fields[segments[0]].class === 'non_material') invalid('proof_field');
                    return fields[segments[0]];
                },
                operator(id) {
                    check();
                    const registry = context.documents.find(d => d.value?.registry_id === 'operator_registry');
                    const result = registry?.value.operators.find(o => o.id === id);
                    if (!result) invalid('proof_operator'); return result;
                },
                material(alias) {
                    check();
                    if (typeof alias !== 'string' || !Object.hasOwn(graph.nodes, alias)) invalid('proof_alias');
                    const kind = graph.nodes[alias].kind;
                    return freeze({ registry_version: context.materialRegistry.registry_version, kind,
                        fields: context.materialRegistry.kinds[kind].fields });
                },
                revoke() { revoked = true; for (const controller of controllers) controller.revoke(); },
                assertHealthy() { if (failed) reject('proof_failed'); for (const controller of controllers) controller.assertHealthy(); }
            });
        },
        openContext(selector, emit) {
            const { fact_key, role_id, binding } = select(selector, emit, true);
            if (binding.kind !== 'claim_context') reject('binding_kind');
            const access = createInstrumentedAccess({ bindings: [{ alias: 'claim/context', role: role_id,
                ...contexts.get(fact_key) }], emit });
            return Object.freeze({ handle: access.handle('claim/context'),
                revoke: access.revoke, assertHealthy: access.assertHealthy });
        },
        open(selector, emit) {
            const { fact_key, role_id, alias, binding } = select(selector, emit, false);
            if (!['node', 'node_set'].includes(binding.kind)) reject('binding_kind');
            const aliases = binding.kind === 'node' ? [binding.alias] : binding.aliases;
            if (!aliases.includes(alias)) reject('alias');
            const access = createInstrumentedAccess({ ...reachable(fact_key, role_id, [alias]), emit });
            return Object.freeze({ handle: access.handle(alias),
                revoke: access.revoke, assertHealthy: access.assertHealthy });
        },
        openSet(selector, emit) {
            const { fact_key, role_id, binding } = select(selector, emit, true);
            if (binding.kind !== 'node_set') reject('binding_kind');
            return createNodeSetAccess({ role: role_id,
                ...reachable(fact_key, role_id, binding.aliases), roster: binding.aliases, emit });
        }
    });
}

// Compile-time consistency only. The proof phase must independently observe
// these reads and remeasure the fingerprints during execution.
function validateStaticEvidence(graphs, snapshots, registry) {
    const kinds = object(registry.kinds);
    const tuple = node => JSON.stringify([node.kind, node.ref_id, node.version]);
    const byIdentity = unique(snapshots, tuple);
    const refs = new Map();
    for (const snapshot of snapshots) {
        const key = JSON.stringify([snapshot.kind, snapshot.ref_id]);
        if (!refs.has(key)) refs.set(key, []);
        refs.get(key).push(snapshot);
        const fields = kinds[snapshot.kind]?.fields;
        if (!fields) fail('snapshot_kind');
        const payload = {};
        for (const key of Object.keys(snapshot.payload)) {
            if (!Object.hasOwn(fields, key)) fail('snapshot_field');
            const classification = fields[key].class;
            if (!['identity', 'dimension', 'edge', 'non_material'].includes(classification)) fail('field_class');
            if (classification !== 'non_material') payload[key] = snapshot.payload[key];
        }
        for (const [key, field] of Object.entries(fields)) {
            if (field.required && !Object.hasOwn(snapshot.payload, key)) fail('snapshot_required');
        }
        const measured = `sha256:${digest({ registry_version: registry.registry_version,
            kind: snapshot.kind, ref_id: snapshot.ref_id, version: snapshot.version, payload })}`;
        if (measured !== snapshot.semantic_fingerprint) fail('snapshot_fingerprint');
    }
    function target(ref, field) {
        const targets = list(field.targets).flatMap(kind => refs.get(JSON.stringify([kind, ref])) || []);
        if (targets.length !== 1) fail('snapshot_reference');
        return tuple(targets[0]);
    }
    for (const graph of graphs) {
        const aliases = new Map();
        for (const [alias, node] of Object.entries(graph.nodes)) {
            if (node.binding !== 'snapshot') continue;
            const identity = tuple(node);
            const snapshot = byIdentity.get(identity);
            if (!snapshot || node.semantic_fingerprint !== snapshot.semantic_fingerprint) fail('node_snapshot_mismatch');
            if (aliases.has(identity)) fail('node_snapshot_duplicate');
            aliases.set(identity, alias);
        }
        const actual = new Set();
        for (const [identity, alias] of aliases) {
            const snapshot = byIdentity.get(identity);
            for (const [name, field] of Object.entries(kinds[snapshot.kind].fields)) {
                if (field.class !== 'edge' || !Object.hasOwn(snapshot.payload, name)) continue;
                const value = snapshot.payload[name];
                let values;
                if (field.type === 'ref') values = [value];
                else if (field.type === 'ref_list') values = list(value);
                else if (field.type === 'role_ref_list') values = list(value).map(item => item.parent_ref);
                else fail('edge_type');
                if (new Set(values).size !== values.length) fail('edge_duplicate');
                for (const ref of values) {
                    const targetAlias = aliases.get(target(ref, field));
                    if (!targetAlias) fail('edge_target_missing');
                    actual.add(JSON.stringify([alias, name, targetAlias]));
                }
            }
        }
        const declared = unique(graph.edges.filter(edge => edge.relation === 'material_ref'),
            edge => JSON.stringify([edge.source, edge.field, edge.target]));
        equalSet(declared, actual);
        for (const phase of [graph.trace_contract.derivation, graph.trace_contract.proof]) {
            for (const read of phase.required_reads) {
                const node = graph.nodes[read.node];
                if (!node) fail('read_node_missing');
                if (node.binding === 'snapshot') {
                    const field = kinds[node.kind].fields[read.segments[0]];
                    if (!field || field.class === 'non_material') fail('read_non_material');
                }
            }
        }
    }
    return Object.freeze({ snapshots: byIdentity.size, graphs: graphs.length });
}

module.exports = { indexGraphDependencies, compileAuthoringIndex, compileAuthoringIR, compileSnapshotAccess, validateStaticEvidence };
