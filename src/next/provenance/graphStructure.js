'use strict';

const { validateLiteral } = require('./literalTypes');

// Closed structural pass after JSON Schema validation. These associations are
// compiler invariants, not claims that the declared predicates have executed.
const OBLIGATIONS = Object.freeze({
    claim_semantics: ['claim', 'claim_registry_binding'],
    node_identity: ['identity', 'snapshot_identity'],
    semantic_integrity: ['fingerprint', 'all_material_fingerprints'],
    subject_scope: ['subject', 'typed_subject_binding'],
    period: ['period', 'typed_period_binding'],
    time_basis: ['time_basis', 'time_field_reads'],
    coverage: ['coverage', 'source_collection_completeness'],
    evidence_state: ['evidence_state', 'typed_evidence_state'],
    evidence_set: ['evidence_set', 'exact_evidence_set'],
    economic_links: ['edge', 'all_material_edges'],
    derivation_trace: ['trace', 'exact_observed_trace'],
});
const fail = code => { throw new Error(`graph_structure_${code}`); };
const own = (object, key) => object !== null && typeof object === 'object' && Object.hasOwn(object, key);
function unique(values, key = value => value) {
    if (!Array.isArray(values)) fail('array');
    const result = new Map();
    for (const value of values) {
        const id = key(value);
        if (result.has(id)) fail('duplicate');
        result.set(id, value);
    }
    return result;
}
function same(actual, expected, code) {
    if (actual.size !== expected.size || [...actual.keys()].some(key => !expected.has(key))) fail(code);
}

function validateGraphStructure({ graphs, claims, materialRegistry, operatorRegistry }) {
    const claimMap = unique(claims, claim => claim.fact_key);
    const operators = unique(operatorRegistry.operators, operator => operator.id);
    let phases = 0;
    for (const graph of graphs) {
        const claim = claimMap.get(graph.fact_key);
        if (!claim || claim.claim_id !== graph.claim_id) fail('claim_missing');
        const predicates = unique(graph.predicates, predicate => predicate.id);
        const edges = unique(graph.edges, edge => edge.id);
        const obligations = unique(graph.obligations, obligation => obligation.obligation);
        same(obligations, new Map(Object.keys(OBLIGATIONS).map(key => [key, true])), 'obligation_inventory');
        const node = alias => {
            if (!own(graph.nodes, alias)) fail('node_missing');
            return graph.nodes[alias];
        };
        const set = alias => {
            if (!own(graph.sets, alias)) fail('set_missing');
            const members = unique(graph.sets[alias]);
            for (const member of members.keys()) node(member);
            return members;
        };
        const predicateRefs = refs => {
            const ids = unique(refs);
            for (const id of ids.keys()) if (!predicates.has(id)) fail('predicate_missing');
            return ids;
        };
        const field = (kind, segments, allowRoot = false) => {
            if (!own(materialRegistry.kinds, kind)) fail('kind_missing');
            if (!Array.isArray(segments) || (!allowRoot && !segments.length)) fail('path_invalid');
            if (!segments.length) return { type: 'record' };
            const fields = materialRegistry.kinds[kind].fields;
            if (!own(fields, segments[0])) fail('path_missing');
            const descriptor = fields[segments[0]];
            if (descriptor.class === 'non_material') fail('path_non_material');
            if (segments.length !== 1) {
                // Structured field traversal needs an explicit typed lowering;
                // never let arbitrary JSON-property traversal reach execution.
                if (['typed_period', 'typed_result', 'role_ref_list'].includes(descriptor.type)) fail('path_structured_unresolved');
                fail('path_scalar_traversal');
            }
            return descriptor;
        };
        const nodeField = (ref, allowRoot = false) => field(node(ref.node).kind, ref.segments, allowRoot);
        const claimPath = ref => {
            if (!Array.isArray(ref.segments) || !ref.segments.length) fail('claim_path');
            let value = claim;
            for (const key of ref.segments) {
                if (!own(value, key) || Array.isArray(value)) fail('claim_path');
                value = value[key];
            }
        };
        const windows = graph.windows || {};
        const activeWindows = new Set();
        const checkedWindows = new Set();
        function window(id) {
            if (!own(windows, id)) fail('window_missing');
            if (activeWindows.has(id)) fail('window_cycle');
            if (checkedWindows.has(id)) return;
            activeWindows.add(id);
            if (windows[id].kind === 'range') {
                argument(windows[id].start);
                argument(windows[id].end);
            } else if (windows[id].kind === 'month') argument(windows[id].value);
            else fail('window_kind');
            activeWindows.delete(id);
            checkedWindows.add(id);
        }
        function argument(arg) {
            if (own(arg, 'node')) { node(arg.node); return; }
            if (own(arg, 'set')) { set(arg.set); return; }
            if (own(arg, 'field')) { nodeField(arg.field); return; }
            if (own(arg, 'presence')) { nodeField(arg.presence); return; }
            if (own(arg, 'claim')) { claimPath(arg.claim); return; }
            if (own(arg, 'selector')) { field(arg.selector.kind, arg.selector.segments); return; }
            if (own(arg, 'edge')) { if (!edges.has(arg.edge)) fail('edge_missing'); return; }
            if (own(arg, 'ref_set')) {
                if (nodeField(arg.ref_set.field).type !== 'ref_list') fail('ref_set_type');
                return;
            }
            if (own(arg, 'projection')) {
                const members = set(arg.projection.set);
                const selector = arg.projection.selector;
                field(selector.kind, selector.segments);
                for (const alias of members.keys()) if (node(alias).kind !== selector.kind) fail('selector_kind');
                return;
            }
            if (own(arg, 'sort')) {
                for (const key of arg.sort.keys) field(key.selector.kind, key.selector.segments);
                return;
            }
            if (own(arg, 'template')) {
                for (const binding of Object.values(arg.bindings)) argument(binding);
                return; // Template identity/body is resolved by the typed pass.
            }
            if (own(arg, 'period_ref')) { window(arg.period_ref); return; }
            if (own(arg, 'period_bound')) {
                window(arg.period_bound.period);
                if (windows[arg.period_bound.period].kind !== 'range') fail('window_bound');
                return;
            }
            if (own(arg, 'literal')) { validateLiteral(arg.literal); return; }
            if (own(arg, 'period_literal') || own(arg, 'partial_policy')) return;
            fail('argument_unresolved');
        }

        for (const alias of Object.keys(graph.sets)) set(alias);
        for (const id of Object.keys(windows)) window(id);
        const hasParents = Object.values(graph.nodes).some(value => value.binding === 'validated_parent');
        for (const [name, obligation] of obligations) {
            const checks = [OBLIGATIONS[name][1]];
            if (name === 'node_identity' && hasParents) checks.push('validated_parent_binding');
            same(unique(obligation.checks), unique(checks), 'obligation_checks');
            const declared = predicateRefs(obligation.predicates);
            const expected = unique(graph.predicates.filter(predicate => predicate.obligation === name), predicate => predicate.id);
            same(declared, expected, 'predicate_membership');
        }
        for (const predicate of predicates.values()) {
            if (!own(OBLIGATIONS, predicate.obligation) || predicate.atom !== OBLIGATIONS[predicate.obligation][0]) fail('predicate_atom');
            const operator = operators.get(predicate.op);
            if (!operator) fail('operator_missing');
            if (predicate.args.length !== operator.args.length) fail('operator_arity');
            for (const arg of predicate.args) argument(arg);
        }
        for (const edge of edges.values()) {
            if (edge.source !== 'claim') node(edge.source);
            node(edge.target);
            predicateRefs(edge.proof_predicates);
        }
        const selectionKey = selection => JSON.stringify([selection.candidate_set, selection.selected_set]);
        const selections = unique(graph.selections, selectionKey);
        const selectedNodes = new Set();
        for (const selection of selections.values()) {
            const candidates = set(selection.candidate_set);
            const selected = set(selection.selected_set);
            for (const alias of selected.keys()) {
                if (!candidates.has(alias)) fail('selection_subset');
                selectedNodes.add(alias);
            }
            predicateRefs(selection.selected_predicates);
            const excluded = unique(selection.excluded, item => item.node);
            same(excluded, new Map([...candidates].filter(([alias]) => !selected.has(alias))), 'selection_partition');
            for (const item of excluded.values()) predicateRefs(item.predicates);
        }
        for (const phase of ['derivation', 'proof']) {
            phases++;
            const trace = graph.trace_contract[phase];
            const requiredNodes = unique(trace.required_nodes);
            for (const alias of requiredNodes.keys()) node(alias);
            const reads = unique(trace.required_reads, read => JSON.stringify([read.node, read.segments]));
            const readNodes = new Set();
            for (const read of reads.values()) {
                nodeField(read);
                if (!requiredNodes.has(read.node)) fail('read_not_required');
                readNodes.add(read.node);
            }
            unique(trace.required_claim_reads, read => JSON.stringify(read.segments));
            for (const read of trace.required_claim_reads) claimPath(read);
            for (const id of unique(trace.required_edges).keys()) if (!edges.has(id)) fail('edge_missing');
            unique(trace.required_structural, entry => JSON.stringify([entry.node, entry.operation, entry.segments]));
            for (const entry of trace.required_structural) {
                const descriptor = nodeField(entry, true);
                if (!requiredNodes.has(entry.node)) fail('structural_not_required');
                if (['iterator', 'cardinality', 'order'].includes(entry.operation)
                    && !['ref_list', 'role_ref_list'].includes(descriptor.type)) fail('structural_type');
                if (entry.operation === 'keys' && descriptor.type !== 'record') fail('structural_type');
                if (entry.operation === 'has' && !entry.segments.length) fail('structural_type');
            }
            same(unique(trace.selected_nodes), selectedNodes, 'trace_selected_nodes');
            same(unique(trace.required_selections, selectionKey), selections, 'trace_selections');
            for (const alias of selectedNodes) if (!requiredNodes.has(alias)) fail('selected_not_required');
            // Proof examines every candidate. Derivation may consume a single
            // prebound operand and need not reperform the proof's search.
            if (phase === 'proof') for (const selection of selections.values()) for (const alias of set(selection.candidate_set).keys()) {
                if (!requiredNodes.has(alias) || !readNodes.has(alias)) fail('candidate_unobserved');
            }
            for (const [alias, value] of Object.entries(graph.nodes)) {
                if (value.binding === 'validated_parent' && (!requiredNodes.has(alias) || !readNodes.has(alias))) fail('parent_unobserved');
            }
        }
    }
    return Object.freeze({ stage: 'structure_checked_only', graphs: graphs.length, phases });
}

module.exports = { validateGraphStructure };
