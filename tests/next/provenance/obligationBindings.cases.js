'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateObligationBindings } = require('../../../src/next/provenance/obligationBindings');
const read = file => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8'));
function fixture() {
    const d = read('docs/contracts/next/provenance-v2/graphs-v2.json');
    return { graphs: d.graphs, snapshots: read(d.snapshot_manifest.path).snapshots,
        materialRegistry: read(d.material_registry.path) };
}
function reject(mutate, pattern) {
    const f = fixture();
    mutate(f.graphs[0], f);
    assert.throws(() => validateObligationBindings(f), pattern);
}
function removePredicate(g, id) {
    g.predicates = g.predicates.filter(p => p.id !== id);
    for (const o of g.obligations) o.predicates = o.predicates.filter(p => p !== id);
    for (const e of g.edges) e.proof_predicates = e.proof_predicates.filter(p => p !== id);
}

test('N02G:OBLIGATION-001 necessary bindings are derived from every snapshot and material edge', () => {
    assert.deepEqual(validateObligationBindings(fixture()), { stage: 'necessary_bindings_checked_only',
        graphs: 76, snapshotBindings: 2284, materialEdgeBindings: 4422, parentBindings: 6 });
});

test('N02G:OBLIGATION-002 removing declarations and all their references does not remove the obligation', () => {
    for (const op of ['kind_is', 'fingerprint_is', 'ref_targets_node']) {
        reject(g => removePredicate(g, g.predicates.find(p => p.op === op).id), /obligation_binding_missing/);
    }
});

test('N02G:OBLIGATION-003 a typed money relation is not identity or fingerprint evidence', () => {
    for (const op of ['kind_is', 'fingerprint_is']) {
        reject(g => {
            const p = g.predicates.find(p => p.op === op);
            p.op = 'eq';
            p.args = [{ field: { node: 'account_a', segments: ['opening_balance_minor'] } },
                { field: { node: 'account_b', segments: ['opening_balance_minor'] } }];
        }, /obligation_binding_semantics/);
    }
});

test('N02G:OBLIGATION-004 kind and fingerprint predicates bind the exact declared node', () => {
    reject(g => { g.predicates.find(p => p.op === 'kind_is').args[1].literal.value = 'person'; }, /obligation_binding_kind/);
    reject(g => { g.predicates.find(p => p.op === 'fingerprint_is').args[1].literal.value = `sha256:${'0'.repeat(64)}`; }, /obligation_binding_fingerprint/);
    reject(g => {
        const p = g.predicates.find(p => p.op === 'fingerprint_is');
        p.args[0].node = 'account_a';
        p.args[1].literal.value = g.nodes.account_a.semantic_fingerprint;
    }, /obligation_binding_missing|obligation_binding_duplicate/);
});

test('N02G:OBLIGATION-005 an edge cannot cite another target or an unrelated valid proof', () => {
    reject(g => { g.edges[0].proof_predicates = [...g.edges[1].proof_predicates]; }, /obligation_binding_edge/);
    reject(g => { g.predicates.find(p => p.op === 'ref_targets_node').args[1].node = 'person_b'; }, /obligation_binding_edge/);
});

test('N02G:OBLIGATION-006 fingerprint coverage requires every material read and structural keys', () => {
    reject(g => {
        g.trace_contract.proof.required_reads = g.trace_contract.proof.required_reads.filter(r =>
            !(r.node === 'account_a' && r.segments[0] === 'opening_balance_minor'));
    }, /obligation_binding_material_read/);
    reject(g => {
        g.trace_contract.proof.required_structural = g.trace_contract.proof.required_structural.filter(r =>
            !(r.node === 'account_a' && r.operation === 'keys'));
    }, /obligation_binding_material_keys/);
});

test('N02G:OBLIGATION-007 a derived edge needs its own parent identity, not equal output or another parent', () => {
    reject((_g, f) => {
        const g = f.graphs.find(g => g.edges.some(e => e.relation === 'derived_from'));
        const edge = g.edges.find(e => e.relation === 'derived_from');
        removePredicate(g, edge.proof_predicates[0]);
    }, /obligation_binding_missing/);
    reject((_g, f) => {
        const g = f.graphs.find(g => g.edges.some(e => e.relation === 'derived_from'));
        const edges = g.edges.filter(e => e.relation === 'derived_from');
        edges[0].proof_predicates = [...edges[1].proof_predicates];
    }, /obligation_binding_parent/);
});
