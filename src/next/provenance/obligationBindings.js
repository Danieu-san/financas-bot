'use strict';

const fail = code => { throw new Error(`obligation_binding_${code}`); };
const tuple = node => JSON.stringify([node.kind, node.ref_id, node.version]);
const pathKey = ref => JSON.stringify([ref.node, ref.segments]);
const fieldAt = (arg, alias, name) => arg?.field?.node === alias
    && arg.field.segments.length === 1 && arg.field.segments[0] === name;

/** Necessary compile-time bindings, after schema, type and reference passes.
 * This is not proof execution or sufficiency of the eleven obligations. In
 * particular, declaring a material read here does not prove it was observed.
 */
function validateObligationBindings({ graphs, snapshots, materialRegistry }) {
    const snapshotMap = new Map(snapshots.map(snapshot => [tuple(snapshot), snapshot]));
    if (snapshotMap.size !== snapshots.length) fail('duplicate_snapshot');
    let snapshotBindings = 0;
    let materialEdgeBindings = 0;
    let parentBindings = 0;
    for (const graph of graphs) {
        const predicates = new Map(graph.predicates.map(predicate => [predicate.id, predicate]));
        const edges = new Map(graph.edges.map(edge => [edge.id, edge]));
        if (predicates.size !== graph.predicates.length || edges.size !== graph.edges.length) fail('duplicate');
        const kinds = new Map();
        const fingerprints = new Map();
        const targets = new Map();
        const add = (map, key, predicate) => {
            if (map.has(key)) fail('duplicate');
            map.set(key, predicate);
        };
        function identityArgument(arg) {
            if (arg.literal) return true; // Its type is unified by the typed pass.
            if (!arg.field || arg.field.segments.length !== 1) return false;
            const node = graph.nodes[arg.field.node];
            return materialRegistry.kinds[node?.kind]?.fields[arg.field.segments[0]]?.class === 'identity';
        }
        for (const predicate of graph.predicates) {
            const [left, right] = predicate.args;
            if (predicate.obligation === 'node_identity') {
                if (predicate.op === 'kind_is') {
                    const node = graph.nodes[left?.node];
                    if (!node || right?.literal?.type !== 'kind' || right.literal.value !== node.kind) fail('kind');
                    add(kinds, left.node, predicate);
                } else if (['eq', 'not_eq', 'field_eq'].includes(predicate.op)) {
                    if (!predicate.args.some(arg => arg.field) || !predicate.args.every(identityArgument)) fail('semantics');
                } else if (predicate.op !== 'same_identity' || !left?.node || !right?.node) fail('semantics');
            }
            if (predicate.obligation === 'semantic_integrity') {
                if (predicate.op !== 'fingerprint_is') fail('semantics');
                const node = graph.nodes[left?.node];
                if (node?.binding !== 'snapshot' || right?.literal?.type !== 'digest'
                    || right.literal.value !== node.semantic_fingerprint) fail('fingerprint');
                add(fingerprints, left.node, predicate);
            }
            // These operators cannot be relabelled to discharge other atoms.
            if (predicate.op === 'kind_is' && predicate.obligation !== 'node_identity') fail('semantics');
            if (predicate.op === 'fingerprint_is' && predicate.obligation !== 'semantic_integrity') fail('semantics');
            if (predicate.op === 'ref_targets_node') {
                const edge = edges.get(left?.edge);
                if (predicate.obligation !== 'economic_links' || edge?.relation !== 'material_ref'
                    || right?.node !== edge.target || !edge.proof_predicates.includes(predicate.id)) fail('edge');
                add(targets, edge.id, predicate);
            }
        }
        const proof = graph.trace_contract.proof;
        const reads = new Set(proof.required_reads.map(pathKey));
        const keys = new Set(proof.required_structural.filter(item => item.operation === 'keys'
            && item.segments.length === 0).map(item => item.node));
        for (const [alias, node] of Object.entries(graph.nodes)) {
            if (node.binding !== 'snapshot') continue;
            if (!kinds.has(alias) || !fingerprints.has(alias)) fail('missing');
            const snapshot = snapshotMap.get(tuple(node));
            if (!snapshot) fail('snapshot');
            if (!keys.has(alias)) fail('material_keys');
            for (const name of Object.keys(snapshot.payload)) {
                const field = materialRegistry.kinds[node.kind]?.fields[name];
                if (!field) fail('field');
                if (field.class !== 'non_material' && !reads.has(pathKey({ node: alias, segments: [name] }))) fail('material_read');
            }
            snapshotBindings++;
        }
        for (const edge of graph.edges) {
            if (edge.relation === 'material_ref') {
                if (!targets.has(edge.id)) fail('missing');
                materialEdgeBindings++;
            } else if (edge.relation === 'derived_from') {
                const parent = graph.nodes[edge.target];
                if (parent?.binding !== 'validated_parent') fail('parent');
                if (!edge.proof_predicates.length) fail('missing');
                const matches = edge.proof_predicates.map(id => predicates.get(id)).filter(predicate => {
                    if (predicate?.op !== 'eq' || predicate.obligation !== 'node_identity') return false;
                    return predicate.args.some((arg, i) => fieldAt(arg, edge.target, 'fact_key')
                        && predicate.args[1 - i]?.literal?.type === 'id'
                        && predicate.args[1 - i].literal.value === parent.fact_key);
                });
                if (matches.length !== 1) fail('parent');
                parentBindings++;
            } else fail('edge');
        }
    }
    return Object.freeze({ stage: 'necessary_bindings_checked_only', graphs: graphs.length,
        snapshotBindings, materialEdgeBindings, parentBindings });
}

module.exports = { validateObligationBindings };
