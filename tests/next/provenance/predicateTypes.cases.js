'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compilePredicateTypes } = require('../../../src/next/provenance/predicateTypes');
const root = path.resolve(__dirname, '../../..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name)));
function fixture() {
    const d = read('docs/contracts/next/provenance-v2/graphs-v2.json');
    return { graphs: d.graphs, claims: read(d.claim_contract.path).claims,
        snapshots: read(d.snapshot_manifest.path).snapshots,
        materialRegistry: read(d.material_registry.path), operatorRegistry: read(d.operator_registry.path),
        claimSchema: read('docs/contracts/next/provenance-v2/claim-contract.schema.json') };
}
function reject(mutate, pattern) {
    const input = fixture();
    mutate(input.graphs[0], input);
    assert.throws(() => compilePredicateTypes(input), pattern);
}

test('N02G:PREDICATE-TYPES-001 every authored predicate receives compatible operand types', () => {
    const f = fixture();
    const result = compilePredicateTypes(f);
    assert.equal(result.graphs, 76);
    assert.equal(result.predicates, f.graphs.reduce((sum, g) => sum + g.predicates.length, 0));
    assert.equal(result.stage, 'predicate_types_checked_only');
    assert.equal(result.unresolved, 0);
});

test('N02G:PREDICATE-TYPES-002 same primitive shape does not erase nominal identity or unit', () => {
    reject(g => {
        const p = g.predicates.find(p => p.op === 'field_eq');
        p.args[1] = { field: { node: 'card_blue', segments: ['id'] } };
    }, /nominal_mismatch/);
    reject(g => {
        const p = g.predicates.find(p => p.op === 'abs_eq');
        p.args[1] = { field: { node: 'card_blue', segments: ['closing_day'] } };
    }, /nominal_mismatch/);
    reject(g => {
        const p = g.predicates.find(p => p.op === 'eq' && p.args[0].field);
        p.args[1] = { literal: { type: 'text', value: 'expense' } };
    }, /nominal_mismatch/);
});

test('N02G:PREDICATE-TYPES-003 enum domains, node/scalar shapes and civil policy types remain distinct', () => {
    reject(g => {
        const p = g.predicates.find(p => p.op === 'state_is');
        p.args[1].literal.value = 'complete';
    }, /enum_value/);
    reject(g => {
        const p = g.predicates.find(p => p.op === 'date_in_period');
        p.args[0] = { field: { node: 'next_golden_financial_v1', segments: ['fixed_clock'] } };
    }, /operator_types_type/);
    reject(g => { g.predicates[0].args[0] = { literal: { type: 'kind', value: 'fixture' } }; }, /shape/);
    reject((_g, f) => {
        const p = f.graphs.flatMap(g => g.predicates).find(p => p.op === 'civil_offset_matches');
        p.args[2] = { literal: { type: 'enum', value: 'year' } };
    }, /civil_unit/);
    reject(g => {
        const p = g.predicates.find(p => p.op === 'date_in_period');
        p.args[1] = { period_literal: { kind: 'registry_snapshot', snapshot_version: 'synthetic-v1' } };
    }, /non_civil_period/);
});

test('N02G:PREDICATE-TYPES-004 sets derive nominal kinds from membership and collection origins, not values', () => {
    reject(g => { g.sets.family_people[0] = 'card_blue'; }, /set_kind/);
    reject(g => {
        const p = g.predicates.find(p => p.op === 'set_eq');
        p.args[1].set = 'family_people';
    }, /set_kind|nominal_mismatch/);
    reject(g => {
        const p = g.predicates.find(p => p.op === 'ref_targets_node');
        p.args[1].node = 'card_blue';
    }, /nominal_mismatch/);
});

test('N02G:PREDICATE-TYPES-005 claim paths retain schema branch and nominal subject type', () => {
    reject((g, f) => {
        const claim = f.claims.find(c => c.fact_key === g.fact_key);
        claim.subject.kind = 'card';
    }, /nominal_mismatch/);
    reject(g => {
        const p = g.predicates.find(p => p.op === 'period_eq');
        p.args[0] = { claim: { segments: ['period', 'missing'] } };
    }, /claim_path/);
    reject(g => {
        const p = g.predicates.find(p => p.op === 'eq' && p.args[0].claim);
        p.args[0] = { claim: { segments: ['evaluator_ref'] } };
    }, /shape/);
});

test('N02G:PREDICATE-TYPES-006 window endpoints are real dates of the required type and ordered', () => {
    for (const endpoint of [{ literal: { type: 'integer', value: 1 } },
        { literal: { type: 'date', value: '2042-02-30' } },
        { literal: { type: 'date', value: '2043-01-01' } }]) {
        const f = fixture();
        const g = f.graphs.find(g => g.windows?.selection_window);
        g.windows.selection_window.start = endpoint;
        assert.throws(() => compilePredicateTypes(f), /window_|civil_/);
    }
});

test('N02G:PREDICATE-TYPES-007 policy enums cannot be supplied by an unrelated enum domain', () => {
    reject((_g, f) => {
        const g = f.graphs.find(g => g.predicates.some(p => p.op === 'civil_date_matches'));
        const p = g.predicates.find(p => p.op === 'civil_date_matches');
        const category = Object.keys(g.nodes).find(alias => g.nodes[alias].kind === 'category');
        p.args[2] = { field: { node: category, segments: ['kind'] } };
    }, /policy_type/);
});

test('N02G:PREDICATE-TYPES-008 collection origin constrains the kind of every member', () => {
    reject((_g, f) => {
        const collection = f.snapshots.find(s => s.kind === 'collection' && s.payload.collection_name === 'events');
        const bill = f.snapshots.find(s => s.kind === 'bill');
        collection.payload.members.push(bill.ref_id);
    }, /collection_member_kind/);
});

test('N02G:PREDICATE-TYPES-009 partial typed IR is immutable and does not copy snapshot values', () => {
    const input = fixture();
    const result = compilePredicateTypes(input);
    const compiled = result.typedGraphs[0].predicates[0];
    assert.equal(compiled.operands[0].type.form, 'node');
    assert.equal(compiled.operands[0].source.node, input.graphs[0].predicates[0].args[0].node);
    input.graphs[0].predicates[0].args[0].node = 'changed_after_compile';
    assert.notEqual(compiled.operands[0].source.node, 'changed_after_compile');
    assert.throws(() => { compiled.operands[0].type.kind = 'changed'; }, TypeError);
    function inspect(value) {
        if (!value || typeof value !== 'object') return;
        assert.equal(Object.hasOwn(value, 'known'), false);
        assert.equal(Object.hasOwn(value, 'payload'), false);
        for (const child of Object.values(value)) inspect(child);
    }
    inspect(result);
    assert.equal(Object.hasOwn(result, 'result'), false);
    assert.equal(Object.hasOwn(result, 'proof'), false);
});
