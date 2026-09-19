'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateGraphStructure } = require('../../../src/next/provenance/graphStructure');
const root = path.resolve(__dirname, '../../..');
const prefix = 'docs/contracts/next/provenance-v2/';
const read = name => JSON.parse(fs.readFileSync(path.join(root, prefix + name), 'utf8'));
function fixture() {
    const graphDocument = read('graphs-v2.json');
    return { graphs: graphDocument.graphs,
        claims: JSON.parse(fs.readFileSync(path.join(root, graphDocument.claim_contract.path))).claims,
        materialRegistry: JSON.parse(fs.readFileSync(path.join(root, graphDocument.material_registry.path))),
        operatorRegistry: JSON.parse(fs.readFileSync(path.join(root, graphDocument.operator_registry.path))) };
}
function reject(mutate, pattern) {
    const input = fixture();
    mutate(input.graphs[0], input);
    assert.throws(() => validateGraphStructure(input), pattern);
}

test('N02G:STRUCTURE-001 all 76 graphs resolve without executing evaluators', () => {
    const result = validateGraphStructure(fixture());
    assert.equal(result.graphs, 76);
    assert.equal(result.phases, 152);
    assert.equal(result.stage, 'structure_checked_only');
});

test('N02G:STRUCTURE-002 predicates and obligations cannot disappear or change authority', () => {
    reject(g => g.obligations.pop(), /obligation_inventory/);
    reject(g => g.obligations.push(structuredClone(g.obligations[0])), /duplicate/);
    reject(g => g.obligations[1].predicates.pop(), /predicate_membership/);
    reject(g => { g.predicates[0].atom = 'fingerprint'; }, /predicate_atom/);
    reject(g => { g.predicates[0].op = 'unregistered'; }, /operator_missing/);
    reject(g => g.predicates[0].args.pop(), /operator_arity/);
    reject(g => { g.edges[0].proof_predicates[0] = 'missing'; }, /predicate_missing/);
    reject(g => { g.obligations[0].checks = ['exact_observed_trace']; }, /obligation_checks/);
});

test('N02G:STRUCTURE-003 invalid aliases and scalar traversal cannot hide in trace or arguments', () => {
    reject(g => { g.trace_contract.proof.required_reads[0].segments.push('invented'); }, /path_scalar_traversal/);
    reject(g => { g.trace_contract.proof.required_reads[0].node = 'missing'; }, /node_missing/);
    reject(g => g.trace_contract.proof.required_claim_reads.push({ segments: ['period', 'unknown'] }), /claim_path/);
    reject(g => { g.predicates[0].args[0].node = 'missing'; }, /node_missing/);
    reject(g => { g.predicates[0].args[0] = { field: { node: 'person_a', segments: ['label'] } }; }, /path_non_material/);
    reject(g => g.sets.candidates.push('missing'), /node_missing/);
    reject(g => g.sets.candidates.push(g.sets.candidates[0]), /duplicate/);
    reject(g => { g.predicates[0].args[1] = { literal: { type: 'date', value: 1 } }; }, /literal_type_value/);
});

test('N02G:STRUCTURE-004 candidates partition exactly and remain observed by proof', () => {
    reject(g => g.selections[0].excluded.pop(), /selection_partition/);
    reject(g => { g.sets.selected.push('person_a'); }, /selection_subset/);
    reject(g => { g.selections[0].excluded[0].predicates = ['missing']; }, /predicate_missing/);
    reject(g => g.trace_contract.proof.required_selections.pop(), /trace_selections/);
    reject(g => g.trace_contract.derivation.selected_nodes.pop(), /trace_selected_nodes/);
    reject(g => {
        const node = g.sets.candidates[0];
        g.trace_contract.proof.required_reads = g.trace_contract.proof.required_reads.filter(r => r.node !== node);
    }, /candidate_unobserved/);
    reject(g => g.trace_contract.proof.required_reads.push(structuredClone(g.trace_contract.proof.required_reads[0])), /duplicate/);
});

test('N02G:STRUCTURE-005 structural operations and window references are closed', () => {
    reject(g => { g.trace_contract.proof.required_structural[0].operation = 'iterator'; }, /structural_type/);
    reject(g => { g.predicates[0].args[0] = { period_ref: 'missing' }; }, /window_missing/);
    reject(g => {
        g.windows.month = { kind: 'month', value: { literal: { type: 'month', value: '2042-06' } } };
        g.predicates[0].args[0] = { period_bound: { period: 'month', bound: 'start' } };
    }, /window_bound/);
    reject(g => {
        g.predicates[0].args[0] = { projection: { set: 'family_people',
            selector: { kind: 'card', segments: ['id'] }, as: 'set' } };
    }, /selector_kind/);
    reject(g => { g.predicates[0].args[0] = { ref_set: { field: { node: 'person_a', segments: ['id'] } } }; }, /ref_set_type/);
});

test('N02G:STRUCTURE-006 prebound derivation differs from proof, while validated parents are required in both', () => {
    const input = fixture();
    const sourceGraph = input.graphs.find(g => g.fact_key === 'S-16#1#1');
    assert.equal(sourceGraph.trace_contract.derivation.required_nodes.length, 1);
    assert.equal(sourceGraph.sets.candidates.length, 4);
    assert.equal(validateGraphStructure(input).graphs, 76);
    for (const phase of ['derivation', 'proof']) {
        const f = fixture();
        const derived = f.graphs.find(g => Object.values(g.nodes).some(n => n.binding === 'validated_parent'));
        const alias = Object.keys(derived.nodes).find(key => derived.nodes[key].binding === 'validated_parent');
        derived.trace_contract[phase].required_reads = derived.trace_contract[phase].required_reads.filter(r => r.node !== alias);
        assert.throws(() => validateGraphStructure(f), /parent_unobserved/);
    }
});

test('N02G:STRUCTURE-007 phase selection follows operand bindings, never fact keys or observed output', () => {
    const input = fixture();
    const prebound = [];
    for (const graph of input.graphs) {
        const claim = input.claims.find(c => c.fact_key === graph.fact_key);
        const bindings = Object.values(claim.operand_bindings);
        const derivation = graph.selections.filter(s => bindings.some(b => b.kind === 'node_set'
            && JSON.stringify(b.aliases) === JSON.stringify(graph.sets[s.candidate_set])));
        if (derivation.length !== graph.selections.length) {
            prebound.push(graph.fact_key);
            assert.deepEqual(graph.trace_contract.derivation.required_selections, derivation.map(({ candidate_set, selected_set }) => ({ candidate_set, selected_set })));
            assert.deepEqual(graph.trace_contract.derivation.selected_nodes, [...new Set(derivation.flatMap(s => graph.sets[s.selected_set]))]);
        }
    }
    assert.deepEqual(prebound, ['S-16#1#1', 'M-04#1#1', 'M-04#1#2', 'M-05#1#2', 'M-05#1#3', 'M-05#1#4']);
    assert.equal(validateGraphStructure(input).graphs, 76);
    for (const key of prebound) {
        const f = structuredClone(input), graph = f.graphs.find(g => g.fact_key === key);
        graph.trace_contract.derivation.required_selections = structuredClone(graph.trace_contract.proof.required_selections);
        graph.trace_contract.derivation.selected_nodes = structuredClone(graph.trace_contract.proof.selected_nodes);
        assert.throws(() => validateGraphStructure(f), /trace_selections/);
    }
    const missing = structuredClone(input), graph = missing.graphs[0];
    graph.trace_contract.derivation.required_selections = [];
    graph.trace_contract.derivation.selected_nodes = [];
    assert.throws(() => validateGraphStructure(missing), /trace_selections/);
    const unbound = structuredClone(input);
    delete unbound.claims.find(c => c.fact_key === prebound[0]).operand_bindings.source;
    assert.throws(() => validateGraphStructure(unbound), /selection_binding/);
    const ambiguous = structuredClone(input);
    const firstClaim = ambiguous.claims.find(c => c.fact_key === ambiguous.graphs[0].fact_key);
    firstClaim.operand_bindings.duplicate = structuredClone(Object.values(firstClaim.operand_bindings).find(b => b.kind === 'node_set'));
    assert.throws(() => validateGraphStructure(ambiguous), /selection_binding/);
    const consumed = structuredClone(input), direct = consumed.graphs.find(g => g.fact_key === prebound[0]);
    direct.trace_contract.derivation.required_reads = [];
    assert.throws(() => validateGraphStructure(consumed), /prebound_unobserved/);
});

test('N02G:STRUCTURE-008 every active phase selection must cover excluded candidates too', () => {
    for (const phase of ['derivation', 'proof']) {
        reject(g => {
            const alias = g.selections[0].excluded[0].node;
            g.trace_contract[phase].required_reads = g.trace_contract[phase].required_reads.filter(r => r.node !== alias);
        }, /candidate_unobserved/);
    }
});
