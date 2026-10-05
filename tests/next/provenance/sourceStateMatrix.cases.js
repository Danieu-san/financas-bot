'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const moduleUrl = pathToFileURL(path.resolve(__dirname,
    '../../../scripts/agent/executeNextSourceStateMutationMatrix.mjs')).href;

test('N02G:SOURCE-STATE-MATRIX-001 active requests and caller evidence are rejected without effects', async () => {
    const { executeSourceStateMutationBatch } = await import(moduleUrl);
    let effects = 0;
    const getter = { fact_keys: ['M-01#1#1'] };
    Object.defineProperty(getter, 'packageReceipt', { enumerable: true, get() { effects++; throw new Error('effect'); } });
    const keyGetter = [];
    Object.defineProperty(keyGetter, 0, { enumerable: true, get() { effects++; throw new Error('effect'); } });
    const proxied = new Proxy({}, { get() { effects++; throw new Error('effect'); },
        ownKeys() { effects++; throw new Error('effect'); } });
    const invalid = [null, [], false, getter, proxied,
        { packageReceipt: {}, fact_keys: keyGetter },
        { packageReceipt: {}, fact_keys: [] },
        { packageReceipt: {}, fact_keys: ['M-01#1#1', 'M-01#1#1'] },
        { packageReceipt: {}, fact_keys: ['bad'] },
        { packageReceipt: {}, fact_keys: ['M-01#1#1'], trace: {} },
        { packageReceipt: {}, fact_keys: ['M-01#1#1'], expected_violations: ['coverage'] },
        { packageReceipt: {}, fact_keys: ['M-01#1#1'], matched: 2 }];
    for (const request of invalid) await assert.rejects(executeSourceStateMutationBatch(request), /source_state_matrix_input$/);
    await assert.rejects(executeSourceStateMutationBatch({ packageReceipt: {}, fact_keys: ['M-01#1#1'] }), /not_admitted$/);
    assert.equal(effects, 0);
});

test('N02G:SOURCE-STATE-MATRIX-002 period and coverage coordinates execute captured D/P without collateral', async () => {
    const { executeSourceStateMutationBatch } = await import(moduleUrl);
    const { loadLocalAuthoringPackage } = await import(pathToFileURL(path.resolve(__dirname,
        '../../../scripts/agent/executeNextDomainInvariantMatrix.mjs')).href);
    const result = await executeSourceStateMutationBatch({ packageReceipt: loadLocalAuthoringPackage(), fact_keys: ['M-01#1#1'] });
    assert.equal(result.batch_complete, true, JSON.stringify(result.unsatisfied));
    assert.equal(result.mutations.expected, 2);
    assert.deepEqual(result.mutations, { expected: 2, generated: 2, executed: 2, matched: 2 });
    assert.equal(new Set(result.rows.map(row => row.mutation_id)).size, 2);
    assert.deepEqual(result.rows.map(row => row.target.atom).sort(), ['coverage', 'period']);
    for (const row of result.rows) {
        assert.equal(row.matched, true);
        assert.equal(row.other_predicates_match, true);
        assert.equal(row.phases_covered, true);
        assert.equal(row.functional_result_preserved, true);
        assert.deepEqual(row.false_predicate_atoms, [row.target.atom]);
        assert.equal(row.candidate_functional_result_sha256, result.baselines[0].functional_result_sha256);
        assert.deepEqual(row.false_predicates, [{ id: row.target.predicate_id, obligation: row.target.obligation,
            atom: row.target.atom, satisfied: false }]);
    }
    assert.equal(result.baselines.length, 1);
    assert.equal(result.baselines[0].oracle_matched, true);
    assert.equal(result.predicate_family_pending, result.predicate_family_expected - 2);
    assert.equal(result.global_g11, false);
    assert.equal(result.graph_accepted, false);
    assert.equal(result.financial_receipt, false);
});

test('N02G:SOURCE-STATE-MATRIX-003 ratified phase boundary qualifies content witnesses without accepting original facts', async () => {
    const { executeSourceStateMutationBatch } = await import(moduleUrl);
    const { loadLocalAuthoringPackage } = await import(pathToFileURL(path.resolve(__dirname,
        '../../../scripts/agent/executeNextDomainInvariantMatrix.mjs')).href);
    const result = await executeSourceStateMutationBatch({ packageReceipt: loadLocalAuthoringPackage(),
        fact_keys: ['S-13#1#1', 'S-16#1#1'] });
    assert.equal(result.mutations.expected, 7);
    assert.equal(result.mutations.generated, 7);
    assert.deepEqual(result.mutations, { expected: 7, generated: 7, executed: 7, matched: 7 }, JSON.stringify(result.unsatisfied));
    assert.equal(result.batch_complete, true);
    assert.equal(result.unsatisfied.length, 0);
    assert.equal(new Set(result.rows.map(row => row.execution_id)).size, 7);
    for (const row of result.rows) {
        assert.equal(row.counterfactual_reference_matched, true);
        assert.equal(row.proof_satisfied, false);
        assert.equal(row.negative_witness_qualified, true);
        assert.equal(row.phases_covered, true);
        assert.deepEqual(row.observed_violations, [row.target.atom]);
        assert.equal(row.graph_accepted, false);
        assert.equal(row.financial_receipt, false);
    }
    const changedOutputs = result.rows.filter(row => !row.functional_result_preserved);
    assert.equal(changedOutputs.length, 2);
    assert.deepEqual(changedOutputs.map(row => row.content_mutation.after).sort(), ['partial', 'unavailable']);
    for (const row of changedOutputs) {
        assert.equal(row.false_predicates.length, 2);
        assert.deepEqual(row.false_predicate_atoms, ['coverage'], 'two predicates are not two distinct atoms');
        assert.deepEqual(row.false_predicates.map(predicate => predicate.id).sort(),
            ['binding_11', 'r0004_include_coverage']);
        assert.equal(row.positive_oracle_matched, false);
        assert.notEqual(row.candidate_functional_result_sha256,
            result.baselines.find(baseline => baseline.fact_key === row.target.fact_key).functional_result_sha256);
    }
    assert.equal(result.global_g11, false);
    assert.equal(result.graph_accepted, false);
    assert.equal(result.financial_receipt, false);
});
