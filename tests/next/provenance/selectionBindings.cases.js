'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateSelectionBindings } = require('../../../src/next/provenance/selectionBindings');
const read = file => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8'));
function fixture() {
    const d = read('docs/contracts/next/provenance-v2/graphs-v2.json');
    return { graphs: d.graphs, claims: read(d.claim_contract.path).claims, materialRegistry: read(d.material_registry.path) };
}
function reject(mutate, pattern) {
    const f = fixture(); mutate(f.graphs[0], f);
    assert.throws(() => validateSelectionBindings(f), pattern);
}

test('N02G:SELECTION-BINDINGS-001 all 73 selections bind reasons and input guards', () => {
    const result = validateSelectionBindings(fixture());
    assert.equal(result.stage, 'selection_bindings_checked_only');
    assert.equal(result.graphs, 76);
    assert.equal(result.selections, 73);
    assert.ok(result.stateChecks.some(check => check.fact_key === 'M-14#1#2'
        && check.node === 'bill_rent_b' && check.field === 'evidence_state' && check.expected === 'confirmed'));
    assert.ok(Object.isFrozen(result.stateChecks));
});

test('N02G:SELECTION-BINDINGS-002 another candidate proof cannot justify an exclusion', () => {
    reject(g => {
        const excluded = g.selections[0].excluded;
        const a = excluded.find(x => x.reason === 'state');
        const b = excluded.find(x => x.reason === 'state' && x.node !== a.node);
        a.predicates = [...b.predicates];
    }, /selection_binding_candidate/);
});

test('N02G:SELECTION-BINDINGS-003 exclusion reason must agree with predicate obligation', () => {
    reject(g => { g.selections[0].excluded.find(x => x.reason === 'state').reason = 'period'; }, /selection_binding_reason/);
    reject(g => { g.selections[0].excluded[0].predicates = [g.predicates.find(p => p.op === 'fingerprint_is').id]; }, /selection_binding_reason/);
});

test('N02G:SELECTION-BINDINGS-004 no selected candidate can lose its evidence state guard', () => {
    reject(g => {
        const s = g.selections[0];
        const id = s.selected_predicates.find(id => g.predicates.find(p => p.id === id).op === 'state_is');
        s.selected_predicates = s.selected_predicates.filter(p => p !== id);
    }, /selection_binding_state_guard/);
});

test('N02G:SELECTION-BINDINGS-005 estimated output requires explicit input state even with correct guards', () => {
    reject((_g, f) => {
        const g = f.graphs.find(g => g.selections.some(s => s.input_evidence_state));
        delete g.selections[0].input_evidence_state;
    }, /selection_binding_input_state/);
    reject((_g, f) => {
        const g = f.graphs.find(g => g.selections.some(s => s.input_evidence_state));
        g.selections[0].input_evidence_state = 'projected';
    }, /selection_binding_state_guard/);
});

test('N02G:SELECTION-BINDINGS-006 a state exclusion must compare against the same expected input state', () => {
    reject(g => {
        const s = g.selections[0];
        const id = s.excluded.find(x => x.reason === 'state').predicates[0];
        g.predicates.find(p => p.id === id).args[1].literal.value = 'projected';
    }, /selection_binding_state_guard/);
});

test('N02G:SELECTION-BINDINGS-007 selected predicates cannot point exclusively at excluded nodes', () => {
    reject(g => {
        const s = g.selections[0];
        const id = s.excluded.find(x => x.reason === 'state').predicates[0];
        s.selected_predicates.push(id);
    }, /selection_binding_selected/);
});

test('N02G:SELECTION-BINDINGS-008 period exclusion must quantify the excluded candidate', () => {
    reject((_g, f) => {
        const g = f.graphs.find(g => g.selections.some(s => s.excluded.some(x => x.reason === 'period')));
        const e = g.selections[0].excluded.find(x => x.reason === 'period');
        const p = g.predicates.find(p => p.id === e.predicates[0]);
        p.args[0] = { set: g.selections[0].selected_set };
    }, /selection_binding_candidate/);
});

test('N02G:SELECTION-BINDINGS-009 inherited category requires the compensated-event edge', () => {
    reject((_g, f) => {
        const g = f.graphs.find(g => g.fact_key === 'S-03#1#1');
        g.edges = g.edges.filter(e => !(e.source === 'evt_refund_b' && e.field === 'compensates'));
    }, /selection_binding_candidate/);
});

test('N02G:SELECTION-BINDINGS-010 generic evidence quality checks require their own material read', () => {
    reject((_g, f) => {
        const g = f.graphs.find(g => g.fact_key === 'M-14#1#2');
        g.trace_contract.proof.required_reads = g.trace_contract.proof.required_reads.filter(r =>
            !(r.node === 'bill_rent_b' && r.segments[0] === 'evidence_state'));
    }, /selection_binding_state_read/);
});
