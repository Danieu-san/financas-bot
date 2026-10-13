'use strict';

const { validateLiteral } = require('./literalTypes');
const { freezeDeep } = require('../kernel/canonicalValue');

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
const diagnostics = new WeakMap();
const fail = code => {
    const error = new Error(`graph_structure_${code}`);
    diagnostics.set(error, freezeDeep({ checker: 'graph_structure', code }));
    throw error;
};
const readGraphStructureDiagnostic = error => diagnostics.get(error) ?? null;
function atPath(coordinate, path, resolve) {
    try { return resolve(); } catch (error) {
        const diagnostic = diagnostics.get(error);
        if (coordinate && diagnostic && !Object.hasOwn(diagnostic, 'site_path')) {
            diagnostics.set(error, freezeDeep({ ...diagnostic, fact_key: coordinate.fact_key,
                predicate_id: coordinate.predicate_id, operand_index: coordinate.operand_index,
                site_path: [...coordinate.site_path, ...path] }));
        }
        throw error;
    }
}
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

function validateGraphStructureInternal({ graphs, claims, materialRegistry, operatorRegistry }, qualification) {
    const graphMap = unique(graphs, graph => graph.fact_key);
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
        const field = (kind, segments, allowRoot = false, parentalRead = false) => {
            if (!own(materialRegistry.kinds, kind)) fail('kind_missing');
            if (!Array.isArray(segments) || (!allowRoot && !segments.length)) fail('path_invalid');
            if (!segments.length) return { type: 'record' };
            const fields = materialRegistry.kinds[kind].fields;
            if (!own(fields, segments[0])) fail('path_missing');
            const descriptor = fields[segments[0]];
            if (descriptor.class === 'non_material') fail('path_non_material');
            if (segments.length !== 1) {
                // This finite profile admits only scalar money results of
                // primary parents, not arbitrary traversal through typed JSON.
                if (parentalRead && kind === 'derived_claim' && descriptor.type === 'typed_result'
                    && segments.length === 2 && ['unit', 'kind', 'value'].includes(segments[1]))
                    return { type: segments[1] === 'value' ? 'money_minor' : 'text' };
                // Structured field traversal needs an explicit typed lowering;
                // never let arbitrary JSON-property traversal reach execution.
                if (['typed_period', 'typed_result', 'role_ref_list'].includes(descriptor.type)) fail('path_structured_unresolved');
                fail('path_scalar_traversal');
            }
            if (parentalRead && allowRoot && descriptor.type === 'typed_result') return { type: 'record' };
            return descriptor;
        };
        const nodeField = (ref, allowRoot = false, phase = null) => {
            const binding = node(ref.node);
            const parentalRead = phase !== null && binding.binding === 'validated_parent';
            if (parentalRead) {
                const parent = graphMap.get(binding.fact_key); const parentClaim = claimMap.get(binding.fact_key);
                if (!parent || !parentClaim || parentClaim.unit !== 'BRL_minor'
                    || Object.values(parent.nodes).some(n => n.binding !== 'snapshot')
                    || parent.edges.some(e => e.relation === 'derived_from')
                    || Object.values(parentClaim.operand_bindings).some(b => b.kind === 'parent_claim')) fail('parent_profile');
            }
            return field(binding.kind, ref.segments, allowRoot, parentalRead);
        };
        const claimPath = ref => {
            if (qualification?.variant === 'M' && graph.fact_key === qualification.subobligation.fact_key
                && JSON.stringify(ref.segments) === JSON.stringify(qualification.locator)) return;
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
        function argument(arg, coordinate = null) {
            if (own(arg, 'node')) { node(arg.node); return; }
            if (own(arg, 'set')) { set(arg.set); return; }
            if (own(arg, 'field')) { atPath(coordinate, ['field', 'segments'], () => nodeField(arg.field)); return; }
            if (own(arg, 'presence')) { atPath(coordinate, ['presence', 'segments'], () => nodeField(arg.presence)); return; }
            if (own(arg, 'claim')) { atPath(coordinate, ['claim', 'segments'], () => claimPath(arg.claim)); return; }
            if (own(arg, 'selector')) { atPath(coordinate, ['selector', 'segments'], () => field(arg.selector.kind, arg.selector.segments)); return; }
            if (own(arg, 'edge')) { if (!edges.has(arg.edge)) fail('edge_missing'); return; }
            if (own(arg, 'ref_set')) {
                if (atPath(coordinate, ['ref_set', 'field', 'segments'], () => nodeField(arg.ref_set.field)).type !== 'ref_list') fail('ref_set_type');
                return;
            }
            if (own(arg, 'projection')) {
                const members = set(arg.projection.set);
                const selector = arg.projection.selector;
                atPath(coordinate, ['projection', 'selector', 'segments'], () => field(selector.kind, selector.segments));
                for (const alias of members.keys()) if (node(alias).kind !== selector.kind) fail('selector_kind');
                return;
            }
            if (own(arg, 'sort')) {
                for (let index = 0; index < arg.sort.keys.length; index++) {
                    const key = arg.sort.keys[index];
                    atPath(coordinate, ['sort', 'keys', index, 'selector', 'segments'], () => field(key.selector.kind, key.selector.segments));
                }
                return;
            }
            if (own(arg, 'template')) {
                for (const [name, binding] of Object.entries(arg.bindings)) argument(binding, coordinate
                    ? { ...coordinate, site_path: [...coordinate.site_path, 'bindings', name] } : null);
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
            for (let operand_index = 0; operand_index < predicate.args.length; operand_index++)
                argument(predicate.args[operand_index], { fact_key: graph.fact_key,
                    predicate_id: predicate.id, operand_index, site_path: ['args', operand_index] });
        }
        for (const edge of edges.values()) {
            if (edge.source !== 'claim') node(edge.source);
            node(edge.target);
            predicateRefs(edge.proof_predicates);
        }
        const selectionKey = selection => JSON.stringify([selection.candidate_set, selection.selected_set]);
        const selections = unique(graph.selections, selectionKey);
        const derivationSelections = new Map();
        const preboundNodes = new Set();
        const bindings = Object.values(claim.operand_bindings);
        for (const selection of selections.values()) {
            const candidates = set(selection.candidate_set);
            const selected = set(selection.selected_set);
            for (const alias of selected.keys()) {
                if (!candidates.has(alias)) fail('selection_subset');
            }
            // Determine the required phase from declared inputs, never actual
            // trace, expected result, metric name or fact_key. A prebound node
            // does not execute the proof's candidate search a second time.
            const candidateBindings = bindings.filter(binding => binding.kind === 'node_set'
                && JSON.stringify(binding.aliases) === JSON.stringify([...candidates.keys()]));
            if (candidateBindings.length > 1) fail('selection_binding_ambiguous');
            if (candidateBindings.length === 1) derivationSelections.set(selectionKey(selection), selection);
            else {
                const direct = new Set(bindings.filter(binding => binding.kind === 'node').map(binding => binding.alias));
                if (!selected.size || [...selected.keys()].some(alias => !direct.has(alias))) fail('selection_binding_unresolved');
                for (const alias of selected.keys()) preboundNodes.add(alias);
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
                nodeField(read, false, phase);
                if (!requiredNodes.has(read.node)) fail('read_not_required');
                readNodes.add(read.node);
            }
            unique(trace.required_claim_reads, read => JSON.stringify(read.segments));
            for (const read of trace.required_claim_reads) claimPath(read);
            for (const id of unique(trace.required_edges).keys()) if (!edges.has(id)) fail('edge_missing');
            unique(trace.required_structural, entry => JSON.stringify([entry.node, entry.operation, entry.segments]));
            for (const entry of trace.required_structural) {
                const descriptor = nodeField(entry, true, phase);
                if (!requiredNodes.has(entry.node)) fail('structural_not_required');
                if (['iterator', 'cardinality', 'order'].includes(entry.operation)
                    && !['ref_list', 'role_ref_list'].includes(descriptor.type)) fail('structural_type');
                if (entry.operation === 'keys' && descriptor.type !== 'record') fail('structural_type');
                if (entry.operation === 'has' && !entry.segments.length) fail('structural_type');
            }
            const phaseSelections = phase === 'proof' ? selections : derivationSelections;
            same(unique(trace.required_selections, selectionKey), phaseSelections, 'trace_selections');
            const selectedNodes = new Set([...phaseSelections.values()].flatMap(selection => [...set(selection.selected_set).keys()]));
            same(unique(trace.selected_nodes), selectedNodes, 'trace_selected_nodes');
            for (const alias of selectedNodes) if (!requiredNodes.has(alias)) fail('selected_not_required');
            for (const selection of phaseSelections.values()) for (const alias of set(selection.candidate_set).keys()) {
                if (!requiredNodes.has(alias) || !readNodes.has(alias)) fail('candidate_unobserved');
            }
            for (const alias of preboundNodes) {
                if (!requiredNodes.has(alias) || !readNodes.has(alias)) fail('prebound_unobserved');
            }
            for (const [alias, value] of Object.entries(graph.nodes)) {
                if (value.binding === 'validated_parent' && (!requiredNodes.has(alias) || !readNodes.has(alias))) fail('parent_unobserved');
            }
        }
    }
    return Object.freeze({ stage: 'structure_checked_only', graphs: graphs.length, phases });
}

function validateGraphStructure(input) {
    return validateGraphStructureInternal(input, null);
}
function validateQualificationGraphStructure(input, transport, variant) {
    const qualification = require('./claimMonthPathProfile').assertClaimMonthPathTransport({
        graphs: input.graphs, claims: input.claims, transport, variant });
    return validateGraphStructureInternal(input, qualification);
}
module.exports = { validateGraphStructure, validateQualificationGraphStructure, readGraphStructureDiagnostic };
