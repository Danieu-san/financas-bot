'use strict';

const { admittedDocuments } = require('./packageContract');
const { digest } = require('../kernel/canonicalValue');
const { validateGraphStructure } = require('./graphStructure');
const { validateTemplateReferences } = require('./templateReferences');
const { compilePredicateTypes } = require('./predicateTypes');
const { validateSchemaRegistryProjection } = require('./schemaRegistryProjection');
const { validateObligationBindings } = require('./obligationBindings');

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

/** Connect byte admission to the first schema/identity pass, not proof approval. */
function compileAuthoringIndex(admitted, validators) {
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
    for (const entry of registry.entries) validate('evaluator', document(entry.contract_path, entry.evaluator_contract_hash));
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
    validateGraphStructure({ graphs: graphs.graphs, claims: claims.claims,
        materialRegistry: resolved.material_registry, operatorRegistry: resolved.operator_registry });
    validateTemplateReferences({ graphs: graphs.graphs, operators: resolved.operator_registry.operators,
        templates: document('docs/contracts/next/provenance-v2/predicate-templates-v1.json'),
        materialRegistry: resolved.material_registry, claims: claims.claims });
    compilePredicateTypes({ graphs: graphs.graphs, claims: claims.claims, snapshots: snapshots.snapshots,
        materialRegistry: resolved.material_registry, operatorRegistry: resolved.operator_registry,
        claimSchema });
    validateObligationBindings({ graphs: graphs.graphs, snapshots: snapshots.snapshots,
        materialRegistry: resolved.material_registry });
    return index;
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

module.exports = { indexGraphDependencies, compileAuthoringIndex, validateStaticEvidence };
