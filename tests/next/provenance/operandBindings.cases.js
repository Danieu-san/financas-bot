'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compileOperandBindings } = require('../../../src/next/provenance/operandBindings');
const read = file => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8'));
function fixture() {
    const d = read('docs/contracts/next/provenance-v2/graphs-v2.json');
    const evaluators = read(d.metric_evaluator_registry.path).entries;
    return { graphs: d.graphs, claims: read(d.claim_contract.path).claims, evaluators,
        contracts: evaluators.map(e => ({ path: e.contract_path, value: read(e.contract_path) })) };
}
function reject(mutate, pattern) {
    const f = fixture(); mutate(f);
    assert.throws(() => compileOperandBindings(f), pattern);
}

test('N02G:OPERANDS-001 all 277 bindings resolve to reviewed roles without executing them', () => {
    const f = fixture();
    const result = compileOperandBindings(f);
    assert.equal(result.stage, 'operand_bindings_indexed_only');
    assert.equal(result.graphs.length, 76);
    assert.equal(result.bindingCount, 277);
    assert.equal(Object.hasOwn(result, 'result'), false);
    const first = result.graphs[0];
    const claim = f.claims.find(c => c.fact_key === first.fact_key);
    const evaluator = f.evaluators.find(e => e.evaluator_id === claim.evaluator_ref.evaluator_id);
    assert.deepEqual(first.operands.map(o => o.role_ref.role_id), evaluator.roles.map(r => r.role_id));
    const population = first.operands.find(o => o.kind === 'node_set');
    const before = [...population.aliases];
    assert.deepEqual(before, claim.operand_bindings[population.role_ref.role_id].aliases);
    claim.operand_bindings[population.role_ref.role_id].aliases.reverse();
    assert.deepEqual(population.aliases, before);
    assert.throws(() => population.aliases.reverse(), TypeError);
    assert.equal(Object.hasOwn(population.role_ref, 'semantic_role'), false);
});

test('N02G:OPERANDS-002 a schema-valid binding of the wrong kind cannot replace the expected role', () => {
    reject(f => { f.claims[0].operand_bindings.context = { kind: 'node', alias: 'person_a' }; }, /operand_binding_kind/);
    reject(f => { f.claims[0].operand_bindings.extra = { kind: 'claim_context' }; }, /operand_binding_role_set/);
    reject(f => { delete f.claims[0].operand_bindings.context; }, /operand_binding_role_set/);
});

test('N02G:OPERANDS-003 missing, duplicated and non-value aliases fail closed', () => {
    reject(f => { f.claims[0].operand_bindings.events.aliases[0] = 'missing'; }, /operand_binding_node/);
    reject(f => { f.claims[0].operand_bindings.events.aliases.push(f.claims[0].operand_bindings.events.aliases[0]); }, /operand_binding_duplicate/);
    reject(f => { f.graphs[0].nodes[f.claims[0].operand_bindings.events.aliases[0]].roles = ['link_proof']; }, /operand_binding_node/);
    reject(f => { f.graphs[0].nodes.account_a.roles.push('value_input'); }, /operand_binding_value_inventory/);
});

test('N02G:OPERANDS-004 contract metric and unit must agree with the registry reference', () => {
    reject(f => { f.contracts[0].value.metric = 'different_metric'; }, /operand_binding_contract/);
    reject(f => { f.contracts[0].value.unit = 'count'; }, /operand_binding_contract/);
    reject(f => { f.contracts[0].value.signature.output.kind = 'id'; }, /operand_binding_output/);
    reject(f => { f.contracts.pop(); }, /operand_binding_contract/);
});

test('N02G:OPERANDS-005 parent binding requires the matching declared edge and validated-parent node', () => {
    reject(f => {
        const claim = f.claims.find(c => Object.values(c.operand_bindings).some(b => b.kind === 'parent_claim'));
        const g = f.graphs.find(g => g.fact_key === claim.fact_key);
        const role = Object.keys(claim.operand_bindings).find(r => claim.operand_bindings[r].kind === 'parent_claim');
        g.edges.find(e => e.relation === 'derived_from' && e.field === role).target = 'person_a';
    }, /operand_binding_parent/);
});

test('N02G:OPERANDS-006 invalid cardinality or duplicate contracts/roles cannot hide in indexes', () => {
    reject(f => { f.evaluators[0].roles[0].cardinality = 'many'; }, /operand_binding_cardinality/);
    reject(f => { f.evaluators[0].roles[0].ordered = true; }, /operand_binding_cardinality/);
    reject(f => { f.evaluators[0].roles.push(structuredClone(f.evaluators[0].roles[0])); }, /operand_binding_duplicate/);
    reject(f => { f.contracts.push(structuredClone(f.contracts[0])); }, /operand_binding_duplicate/);
});
