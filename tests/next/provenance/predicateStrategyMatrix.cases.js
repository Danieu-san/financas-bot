'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

test('N02G:PREDICATE-STRATEGY-005 identity assertion witnesses require real positive parents and their own negative invocations', async () => {
    const { loadLocalAuthoringPackage } = await import('../../../scripts/agent/executeNextDomainInvariantMatrix.mjs');
    const { executePredicateStrategyBoundaryBatch } = await import('../../../scripts/agent/executeNextPredicateStrategyMatrix.mjs');
    const result = await executePredicateStrategyBoundaryBatch({ packageReceipt: loadLocalAuthoringPackage(), fact_keys: ['M-01#1#3'] });
    assert.equal(result.batch_complete, true, JSON.stringify(result.unsatisfied.map(row => ({ id: row.target.predicate_id, cause: row.cause }))));
    assert.equal(result.unsatisfied.length, 0);
    assert.equal(result.mutations.expected, 10);
    assert.ok(result.baselines.some(row => row.supporting_parent === true && row.oracle_matched && row.proof_satisfied));
    const identity = result.rows.filter(row => row.target.atom === 'identity');
    assert.equal(identity.length, 2);
    for (const row of identity) {
        assert.equal(row.matched, true);
        assert.equal(row.proof_satisfied, false);
        assert.equal(row.outside_target_preserved, true);
        assert.equal(row.phases_covered, true);
        assert.equal(row.financial_receipt, false);
        assert.equal(row.positive_release_root_matched, false);
    }
    assert.equal(new Set(result.rows.map(row => row.invocation_id)).size, result.rows.length);
    assert.equal(result.parent_source, 'same_batch_positive_oracle_and_coverage_verified');
});

test('N02G:PREDICATE-STRATEGY-006 presence assertions qualify without reading absent cells or changing selectors', async () => {
    const { loadLocalAuthoringPackage } = await import('../../../scripts/agent/executeNextDomainInvariantMatrix.mjs');
    const { executePredicateStrategyBoundaryBatch } = await import('../../../scripts/agent/executeNextPredicateStrategyMatrix.mjs');
    const result = await executePredicateStrategyBoundaryBatch({ packageReceipt: loadLocalAuthoringPackage(), fact_keys: ['F-03#1#1'] });
    assert.equal(result.batch_complete, true, JSON.stringify(result.unsatisfied.map(row => ({ id: row.target.predicate_id, cause: row.cause }))));
    const presence = result.rows.filter(row => row.target.predicate_id.endsWith('_absent_account_id'));
    assert.ok(presence.length > 0);
    for (const row of presence) {
        assert.equal(row.matched, true);
        assert.equal(row.outside_target_preserved, true);
        assert.equal(row.phases_covered, true);
        assert.equal(row.positive_oracle_matched, true);
        assert.equal(row.proof_satisfied, false);
        assert.equal(row.financial_receipt, false);
    }
    assert.equal(result.unsatisfied.length, 0);
});

test('N02G:PREDICATE-STRATEGY-004 A/B qualify independently without credit for a forged checker error or negative release', async () => {
    const { loadLocalAuthoringPackage } = await import('../../../scripts/agent/executeNextDomainInvariantMatrix.mjs');
    const { executePredicateStrategyBoundaryBatch } = await import('../../../scripts/agent/executeNextPredicateStrategyMatrix.mjs');
    const { claimRequirementFailure } = require('../../../src/next/provenance/claimRequirements');
    const { collectionRequirementFailure } = require('../../../src/next/provenance/collectionRequirements');
    const { obligationBindingFailure } = require('../../../src/next/provenance/obligationBindings');
    assert.equal(claimRequirementFailure(new Error('claim_requirements_missing')), null);
    assert.equal(collectionRequirementFailure(new Error('collection_requirements_fixture_anchor')), null);
    assert.equal(obligationBindingFailure(new Error('obligation_binding_parent')), null);
    const result = await executePredicateStrategyBoundaryBatch({ packageReceipt: loadLocalAuthoringPackage(), fact_keys: ['M-01#1#1'] });
    for (const ledger of [result.mutations, result.authoring_probe.mutations, result.semantic_assertion_fault.mutations])
        for (const count of Object.values(ledger)) assert.equal(count, ledger.expected);
    assert.equal(result.batch_complete, true);
    assert.equal(result.unsatisfied.length, 0);
    assert.equal(new Set(result.rows.map(row => row.execution_id)).size, result.rows.length);
    assert.equal(result.authoring_probe.rows.length, result.rows.length);
    assert.ok(result.authoring_probe.rows.some(row => row.admission_outcome === 'rejected'));
    assert.ok(result.authoring_probe.rows.some(row => row.admission_outcome === 'admitted'));
    for (const row of result.authoring_probe.rows) {
        if (row.admission_outcome === 'admitted') {
            assert.equal(row.quarantine_compile_completed, true);
            assert.equal(row.authoring_ir_conformance_matched, true);
        } else {
            assert.ok(row.checker_dependency.predicate_ids.includes(result.rows.find(item => item.mutation_id === row.mutation_id).target.predicate_id));
            assert.equal(row.quarantine_compile_completed, null);
        }
        assert.equal(row.financial_receipt, false);
    }
    for (const row of result.rows) {
        assert.equal(row.authoring_probe_matched, true);
        assert.equal(row.semantic_assertion_fault_matched, true);
        assert.equal(row.phases_covered, true);
        assert.equal(row.positive_oracle_matched, true);
        assert.equal(row.proof_satisfied, false);
        assert.equal(row.negative_artifact_root_matched, true);
        assert.equal(row.positive_release_root_matched, false);
        assert.equal(row.financial_receipt, false);
    }
    assert.equal(result.predicate_atom_credit, 0);
    assert.equal(result.global_g11, false);
});

test('N02G:PREDICATE-STRATEGY-002 request boundary refuses caller verdicts and active inputs without effects', async () => {
    const { executePredicateStrategyBatch } = await import('../../../scripts/agent/executeNextPredicateStrategyMatrix.mjs');
    let effects = 0;
    const getter = { fact_keys: ['M-01#1#1'] };
    Object.defineProperty(getter, 'packageReceipt', { enumerable: true, get() { effects++; throw new Error('effect'); } });
    const proxy = new Proxy({}, { ownKeys() { effects++; throw new Error('effect'); } });
    for (const request of [null, [], getter, proxy, { packageReceipt: {}, fact_keys: [] },
        { packageReceipt: {}, fact_keys: ['M-01#1#1'], matched: true },
        { packageReceipt: {}, fact_keys: ['M-01#1#1'], expected_violations: ['coverage'] }]) {
        await assert.rejects(executePredicateStrategyBatch(request), /predicate_strategy_matrix_input$/);
    }
    assert.equal(effects, 0);
});

test('N02G:PREDICATE-STRATEGY-003 captured equality strategies leave admission and collateral failures explicitly pending', async t => {
    const { loadLocalAuthoringPackage } = await import('../../../scripts/agent/executeNextDomainInvariantMatrix.mjs');
    const { executePredicateStrategyBatch } = await import('../../../scripts/agent/executeNextPredicateStrategyMatrix.mjs');
    const result = await executePredicateStrategyBatch({ packageReceipt: loadLocalAuthoringPackage(), fact_keys: ['M-01#1#1'] });
    assert.ok(result.mutations.expected > 0);
    assert.equal(result.mutations.generated, result.mutations.expected);
    assert.equal(result.mutations.executed, result.rows.length);
    assert.equal(result.mutations.matched, result.rows.filter(row => row.matched).length);
    assert.ok(result.mutations.matched > 0);
    assert.ok(result.mutations.matched < result.mutations.expected);
    assert.equal(result.unsatisfied.length, result.mutations.expected - result.mutations.matched);
    assert.equal(new Set(result.rows.map(row => row.execution_id)).size, result.mutations.executed);
    assert.ok(result.unsatisfied.some(row => row.cause === 'claim_requirements_missing'));
    assert.equal(result.batch_complete, false, 'rejection before P never becomes full strategy coverage');
    for (const row of result.rows.filter(row => row.matched)) {
        assert.equal(row.target.strategy, 'compatible_wrong_operator');
        assert.equal(row.outside_target_preserved, true);
        assert.equal(row.phases_covered, true);
        assert.equal(row.positive_oracle_matched, true);
        assert.equal(row.proof_satisfied, false);
        assert.equal(row.graph_accepted, false);
        assert.equal(row.financial_receipt, false);
    }
    assert.equal(result.predicate_atom_credit, 0);
    assert.equal(result.global_g11, false);
    t.diagnostic(JSON.stringify({ mutations: result.mutations,
        unsatisfied: result.unsatisfied.map(row => ({ predicate_id: row.target.predicate_id, cause: row.cause })),
        predicate_atom_credit: 0, global_g11: false }));
});

test('N02G:PREDICATE-STRATEGY-001 compatible operator mutant changes exactly one operator and has its own coordinate', async () => {
    const { loadLocalAuthoringPackage } = await import('../../../scripts/agent/executeNextDomainInvariantMatrix.mjs');
    const { buildAdmittedSchemaValidators } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const { admittedDocuments, admitPackage } = require('../../../src/next/provenance/packageContract');
    const { compileAuthoringIR } = require('../../../src/next/provenance/graphCompiler');
    const { enumerateMutationRequirements, materializeScalarEqualityStrategy } = require('../../../src/next/provenance/mutationWitnesses');
    const packageReceipt = loadLocalAuthoringPackage();
    const docs = admittedDocuments(packageReceipt); const map = new Map(docs.map(row => [row.path, row.value]));
    const path = 'docs/contracts/next/provenance-v2/graphs-v2.json';
    const corpus = map.get(path); const graph = corpus.graphs.find(row => row.fact_key === 'M-01#1#1');
    const predicate = graph.predicates.find(row => row.op === 'eq' && row.atom === 'coverage');
    const validators = buildAdmittedSchemaValidators(packageReceipt).validators;
    const inventory = enumerateMutationRequirements({ packageReceipt, ir: compileAuthoringIR(packageReceipt, validators),
        graphSchema: map.get('docs/contracts/next/provenance-v2/provenance-graph.schema.json'),
        materialRegistry: map.get(corpus.material_registry.path), operatorRegistry: map.get(corpus.operator_registry.path),
        evaluatorRegistry: map.get(corpus.metric_evaluator_registry.path),
        witnessContracts: map.get('docs/contracts/next/provenance-v2/evaluator-witness-contracts-v1.json') });
    const request = { packageReceipt, fact_key: graph.fact_key, predicate_id: predicate.id };
    const generated = materializeScalarEqualityStrategy(request);
    const coordinate = inventory.requirements.find(row => row.family === 'predicate_strategy'
        && row.target.fact_key === graph.fact_key && row.target.predicate_id === predicate.id
        && row.target.strategy === 'compatible_wrong_operator');
    assert.equal(generated.mutation_id, coordinate.mutation_id);
    assert.notEqual(generated.mutation_id, inventory.requirements.find(row => row.family === 'predicate_atom'
        && row.target.fact_key === graph.fact_key && row.target.predicate_id === predicate.id).mutation_id);
    assert.deepEqual(generated.target, coordinate.target);
    const expected = structuredClone(corpus);
    expected.graphs.find(row => row.fact_key === graph.fact_key).predicates.find(row => row.id === predicate.id).op = 'not_eq';
    assert.deepEqual(JSON.parse(generated.changes[0].source), expected);
    assert.equal(generated.changes.length, 1);
    const entries = docs.map(row => ({ path: row.path, bytes: row.path === path
        ? Buffer.from(generated.changes[0].source) : Buffer.from(JSON.stringify(row.value)) }));
    // Preserve admitted bytes via the fixed loader rather than changing unrelated hash-bound files.
    const fs = require('node:fs'); const nodePath = require('node:path');
    for (const row of entries) if (row.path !== path) row.bytes = Buffer.from(fs.readFileSync(nodePath.resolve(__dirname, '../../..', row.path), 'utf8').replaceAll('\r\n', '\n'));
    const mutant = admitPackage({ entries, authority: entries.map(row => ({ path: row.path, sha256: hash(row.bytes) })) });
    assert.throws(() => compileAuthoringIR(mutant, validators), /claim_requirements_missing$/,
        'mandatory coverage equality is guarded at admission; this is not a captured P witness');
    assert.equal(generated.mutation_acceptance, false);
    assert.throws(() => materializeScalarEqualityStrategy({ ...request, expected_violations: ['coverage'] }), /mutation_inventory_input/);
    assert.throws(() => materializeScalarEqualityStrategy({ ...request, predicate_id: '__proto__' }), /mutation_inventory_scalar_strategy_target/);
});
