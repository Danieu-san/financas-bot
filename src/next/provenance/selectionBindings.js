'use strict';

const { freezeDeep } = require('../kernel/canonicalValue');
const fail = code => { throw new Error(`selection_binding_${code}`); };
const REASONS = Object.freeze({ period: 'period', state: 'evidence_state', identity: 'node_identity',
    ownership: 'subject_scope', scope: 'subject_scope', instrument: 'subject_scope', plan: 'subject_scope',
    merchant: 'subject_scope', category: 'subject_scope', budget_class: 'subject_scope', economic_kind: 'subject_scope' });
const INCLUDED_OBLIGATIONS = new Set(['period', 'evidence_state', 'subject_scope', 'coverage', 'node_identity']);

// Checks which candidate a declared reason can concern, not the truth of the
// reason. The proof evaluator must independently execute every predicate and
// the recorder must observe the selection; no selected set is accepted here.
function validateSelectionBindings({ graphs, claims, materialRegistry }) {
    const claimMap = new Map(claims.map(claim => [claim.fact_key, claim]));
    if (claimMap.size !== claims.length) fail('duplicate');
    let selections = 0;
    const stateChecks = [];
    for (const graph of graphs) {
        const claim = claimMap.get(graph.fact_key);
        if (!claim) fail('claim');
        const predicates = new Map(graph.predicates.map(predicate => [predicate.id, predicate]));
        const edges = new Map(graph.edges.map(edge => [edge.id, edge]));
        function stateField(alias) {
            const fields = materialRegistry.kinds[graph.nodes[alias]?.kind]?.fields;
            if (!fields) fail('node');
            return ['evidence_state', 'state'].find(name => fields[name]?.type === 'enum'
                && fields[name].values.includes('confirmed'));
        }
        function touches(predicate) {
            const nodes = new Set();
            for (const arg of predicate.args) {
                if (arg.node) nodes.add(arg.node);
                if (arg.field) nodes.add(arg.field.node);
                if (arg.presence) nodes.add(arg.presence.node);
                if (arg.set) for (const alias of graph.sets[arg.set] || []) nodes.add(alias);
                if (arg.projection) for (const alias of graph.sets[arg.projection.set] || []) nodes.add(alias);
                if (arg.ref_set) nodes.add(arg.ref_set.field.node);
                if (arg.edge) {
                    const edge = edges.get(arg.edge);
                    if (!edge) fail('edge');
                    nodes.add(edge.source);
                }
            }
            return nodes;
        }
        function concerns(predicate, alias) {
            const nodes = touches(predicate);
            if (nodes.has(alias)) return true;
            // A category/owner/instrument is reached through a material edge
            // already checked against the actual payload by earlier passes.
            if (graph.edges.some(edge => edge.relation === 'material_ref'
                && edge.source === alias && nodes.has(edge.target))) return true;
            // Reviewed economic relation: compensation inherits the category
            // of its compensated event (graph-authoring-review-v1, section 2).
            // This is not general graph reachability through family/collections.
            return graph.edges.some(edge => edge.relation === 'material_ref'
                && edge.source === alias && edge.field === 'compensates'
                && graph.nodes[alias]?.kind === 'event' && graph.nodes[edge.target]?.kind === 'event'
                && graph.edges.some(category => category.relation === 'material_ref'
                    && category.source === edge.target && category.field === 'category_id'
                    && graph.nodes[category.target]?.kind === 'category' && nodes.has(category.target)));
        }
        function stateGuard(predicate, alias, field, expected, excluded) {
            if (predicate.obligation !== 'evidence_state'
                || !(excluded ? ['not_eq'] : ['state_is', 'eq']).includes(predicate.op)) return false;
            return predicate.args.some((arg, i) => arg.field?.node === alias
                && arg.field.segments.length === 1 && arg.field.segments[0] === field
                && predicate.args[1 - i]?.literal?.type === 'enum'
                && predicate.args[1 - i].literal.value === expected);
        }
        for (const selection of graph.selections) {
            selections++;
            const candidates = graph.sets[selection.candidate_set];
            const selected = graph.sets[selection.selected_set];
            if (!Array.isArray(candidates) || !Array.isArray(selected)) fail('set');
            const stateful = candidates.some(alias => stateField(alias));
            const expected = selection.input_evidence_state ?? claim.evidence_state;
            if (stateful && !['confirmed', 'projected'].includes(expected)) fail('input_state');
            const included = selection.selected_predicates.map(id => predicates.get(id));
            for (const predicate of included) {
                if (!predicate || !INCLUDED_OBLIGATIONS.has(predicate.obligation)
                    || !selected.some(alias => concerns(predicate, alias))) fail('selected');
            }
            for (const alias of selected) {
                if (!included.some(predicate => concerns(predicate, alias))) fail('selected');
                const field = stateField(alias);
                // `state` is a selection discriminator; `evidence_state` is
                // also enforced by the generic typed_evidence_state check.
                // Emit that requirement even when no selection predicate exists.
                if (field) {
                    if (!graph.trace_contract.proof.required_reads.some(read => read.node === alias
                        && read.segments.length === 1 && read.segments[0] === field)) fail('state_read');
                    stateChecks.push({ fact_key: graph.fact_key, node: alias, field, expected });
                }
                if (field && (field === 'state' || selection.input_evidence_state !== undefined)
                    && !included.some(predicate => stateGuard(predicate, alias, field, expected, false))) {
                    fail(`state_guard:${graph.fact_key}:${alias}`);
                }
            }
            for (const excluded of selection.excluded) {
                const obligation = REASONS[excluded.reason];
                const reasons = excluded.predicates.map(id => predicates.get(id));
                if (!obligation || !reasons.length || reasons.some(predicate => !predicate || predicate.obligation !== obligation)) fail('reason');
                for (const predicate of reasons) if (!concerns(predicate, excluded.node)) {
                    fail(`candidate:${graph.fact_key}:${excluded.node}:${predicate.id}`);
                }
                if (excluded.reason === 'state') {
                    const field = stateField(excluded.node);
                    if (!field || !reasons.every(predicate => stateGuard(predicate, excluded.node, field, expected, true))) fail('state_guard');
                }
            }
        }
    }
    return freezeDeep({ stage: 'selection_bindings_checked_only', graphs: graphs.length, selections, stateChecks });
}

module.exports = { validateSelectionBindings };
