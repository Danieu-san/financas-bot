'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// Report hashing must preserve passive native records without weakening the
// runtime canonicalizer or invoking caller-controlled getters/toJSON.
test('N02G:MUTATION-REPORT-001 evidence hashes normalize null-prototype records and reject active data', async () => {
    const { hashTraceMatrixEvidence } = await import('../../../scripts/agent/executeNextTraceOmissionMatrix.mjs');
    const expected = [{ mutation_id: 'example', nested: { missing: [{ node: 'source', segments: ['coverage'] }] } }];
    const { copyData } = require('../../../src/next/provenance/observationContract');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const native = expected.map(row => copyData(row));
    assert.equal(Object.getPrototypeOf(native[0]), null);
    assert.equal(hashTraceMatrixEvidence(native), hash(Buffer.from(canonicalValue(expected))));
    let effects = 0;
    const getter = {};
    Object.defineProperty(getter, 'value', { enumerable: true, get() { effects++; throw new Error('effect'); } });
    const proxy = new Proxy({}, { ownKeys() { effects++; throw new Error('effect'); } });
    const activeRows = [];
    Object.defineProperty(activeRows, 0, { enumerable: true, get() { effects++; throw new Error('effect'); } });
    for (const rows of [[getter], [proxy], [new Date()], [{ value: undefined }], [{ toJSON() { effects++; } }], activeRows]) {
        assert.throws(() => hashTraceMatrixEvidence(rows));
    }
    assert.equal(effects, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(native)), expected);
});
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { admitPackage } = require('../../../src/next/provenance/packageContract');
const { compileAuthoringIR, validateStaticEvidence } = require('../../../src/next/provenance/graphCompiler');
const { enumerateMutationRequirements, materializeSignedRelationMutation, materializeInputStateOmission,
    materializeUnknownPredicateOperator,
    materializeExpectedFingerprintDrift, materializeTraceReadOmission, materializeTraceEdgeOmission,
    materializeTraceClaimReadOmission, materializeTraceStructuralOmission,
    materializeExpectedVersionDrift, materializeMonthRelationMutation,
    materializeEnumEqualityMutation } = require('../../../src/next/provenance/mutationWitnesses');
const root = path.resolve(__dirname, '../../..');
const prefix = 'docs/contracts/next/provenance-v2/';
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
let cached;
let mutationPackage;
let mutationEntries;

test('N02G:UNKNOWN-OPERATOR-001 generated negatives change only the declared operator and hit its exact schema enum', async () => {
    const input = await fixture(); const inventory = enumerateMutationRequirements(input);
    const { buildAdmittedSchemaValidators } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const { validators } = buildAdmittedSchemaValidators(mutationPackage);
    const original = mutationPackage.documents.find(row => row.path === prefix + 'graphs-v2.json').value;
    const operators = new Map();
    for (const row of inventory.requirements.filter(row => row.family === 'predicate_strategy' && row.target.strategy === 'unknown_operator'))
        if (!operators.has(row.target.operator)) operators.set(row.target.operator, row);
    assert.ok(operators.size > 2);
    for (const requirement of [...operators.values()].slice(0, 3)) {
        const { fact_key, predicate_id } = requirement.target;
        const request = { packageReceipt: mutationPackage, fact_key, predicate_id };
        const generated = materializeUnknownPredicateOperator(request);
        assert.deepEqual(generated, materializeUnknownPredicateOperator(request));
        assert.equal(generated.mutation_id, requirement.mutation_id);
        assert.deepEqual(generated.target, requirement.target);
        assert.equal(generated.dp_execution, false);
        assert.equal(generated.semantic_mutation_credit, 0);
        assert.equal(Object.hasOwn(generated, 'expected_violations'), false);
        assert.equal(generated.changes.length, 1);
        const expected = structuredClone(original);
        const graphIndex = expected.graphs.findIndex(row => row.fact_key === fact_key);
        const predicateIndex = expected.graphs[graphIndex].predicates.findIndex(row => row.id === predicate_id);
        expected.graphs[graphIndex].predicates[predicateIndex].op = generated.patch.after;
        assert.deepEqual(JSON.parse(generated.changes[0].source), expected);
        assert.equal(generated.changes[0].sha256, hash(generated.changes[0].source));
        assert.equal(validators.graphs(original), true);
        assert.equal(validators.graphs(expected), false);
        const errors = validators.graphs.errors;
        assert.ok(errors.length > 0);
        assert.ok(errors.every(error => error.keyword === 'enum'
            && error.instancePath === `/graphs/${graphIndex}/predicates/${predicateIndex}/op`));
    }
    let effects = 0;
    const active = {};
    Object.defineProperty(active, 'packageReceipt', { enumerable: true, get() { effects++; throw new Error('effect'); } });
    for (const raw of [active, new Proxy({}, { ownKeys() { effects++; throw new Error('effect'); } }),
        { packageReceipt: mutationPackage, fact_key: 'M-01#1#1', predicate_id: 'missing' },
        { packageReceipt: {}, fact_key: 'M-01#1#1', predicate_id: 'binding_1' }])
        assert.throws(() => materializeUnknownPredicateOperator(raw));
    assert.equal(effects, 0);
});

async function fixture() {
    if (cached) return cached;
    const files = new Map();
    const add = file => {
        if (!files.has(file)) files.set(file, { path: file, bytes: Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n')) });
        return JSON.parse(files.get(file).bytes);
    };
    const corpus = add(prefix + 'graphs-v2.json');
    for (const file of ['predicate-templates-v1.json', 'claim-contract.schema.json', 'evidence-snapshot.schema.json',
        'provenance-graph.schema.json', 'evaluator-witness-contracts-v1.json',
        'phase-composition-profile-v1.json',
        'evaluator-contract.schema.json', 'evaluator-witness-contracts.schema.json',
        'metric-evaluator-registry.schema.json']) add(prefix + file);
    for (const key of ['claim_contract', 'snapshot_manifest', 'material_registry', 'operator_registry', 'metric_evaluator_registry']) add(corpus[key].path);
    for (const source of add(corpus.snapshot_manifest.path).sources) add(source.path);
    for (const row of add(corpus.metric_evaluator_registry.path).entries) add(row.contract_path);
    for (const graph of corpus.graphs) for (const source of graph.authoring_sources) add(source.path);
    const entries = [...files.values()];
    mutationEntries = entries;
    const receipt = admitPackage({ entries, authority: entries.map(row => ({ path: row.path, sha256: hash(row.bytes) })) });
    mutationPackage = receipt;
    const { buildSchemaValidators } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    cached = { packageReceipt: receipt, ir: compileAuthoringIR(receipt, buildSchemaValidators().validators),
        graphSchema: add(prefix + 'provenance-graph.schema.json'), materialRegistry: add(corpus.material_registry.path),
        operatorRegistry: add(corpus.operator_registry.path), evaluatorRegistry: add(corpus.metric_evaluator_registry.path),
        witnessContracts: add(prefix + 'evaluator-witness-contracts-v1.json') };
    return cached;
}

test('N02G:UNKNOWN-OPERATOR-002 admission matrix refuses forged receipts and active caller verdicts without effects', async () => {
    const { executeUnknownOperatorAdmissionMatrix } = await import('../../../scripts/agent/executeUnknownOperatorAdmissionMatrix.mjs');
    let effects = 0;
    const active = {};
    Object.defineProperty(active, 'documents', { enumerable: true, get() { effects++; throw new Error('effect'); } });
    const proxy = new Proxy({}, { get() { effects++; throw new Error('effect'); }, ownKeys() { effects++; throw new Error('effect'); } });
    for (const receipt of [{}, active, proxy, { valid: true, matched: true, rows: [], expected: 0 }])
        assert.throws(() => executeUnknownOperatorAdmissionMatrix(receipt));
    assert.equal(effects, 0);
});
test('N02G:MUTATION-INVENTORY-001 requirements derive from the full IR and normative registries without pretending realization', async t => {
    const input = await fixture(); const result = enumerateMutationRequirements(input);
    assert.equal(result.stage, 'unrealized_mutation_requirements_only'); assert.equal(result.mutation_acceptance, false);
    assert.equal(result.graph_count, input.ir.order.length); assert.equal(result.graph_count, 76);
    assert.equal(result.unrealized_count, result.requirements.length);
    assert.ok(result.requirements.every(row => row.realization === (row.family === 'singleton_domain_invariant'
        ? 'UNSATISFIED_DOMAIN_INVARIANT' : 'UNSATISFIED_MUTATION_WITNESS')
        && !Object.hasOwn(row, 'expected_violations') && !Object.hasOwn(row, 'actual_violations')));
    assert.equal(new Set(result.requirements.map(row => row.mutation_id)).size, result.requirements.length);
    assert.deepEqual(enumerateMutationRequirements(input), result);
    const family = name => result.requirements.filter(row => row.family === name);
    assert.equal(family('predicate_atom').length, input.ir.graphs.reduce((count, graph) => count + graph.predicates.length, 0));
    assert.equal(family('evaluator_discriminant').length, input.witnessContracts.witnesses.length);
    assert.equal(family('input_evidence_state_presence').length, input.ir.graphs.reduce((count, graph) =>
        count + graph.selections.filter(row => Object.hasOwn(row, 'input_evidence_state')).length, 0));
    for (const row of family('material_field')) assert.notEqual(row.target.descriptor.class, 'non_material');
    assert.ok(Object.isFrozen(result.requirements));
    t.diagnostic(`generated_requirements=${result.requirements.length}; realized=0; acceptance=false; inventory_is_not_execution=true`);
});
test('N02G:MUTATION-INVENTORY-002 malformed obligations, missing witnesses and active input fail closed', async () => {
    const input = await fixture(); let effects = 0;
    const getter = { ...input }; Object.defineProperty(getter, 'ir', { enumerable: true, get() { effects++; return input.ir; } });
    assert.throws(() => enumerateMutationRequirements(getter), /mutation_inventory_input/); assert.equal(effects, 0);
    const proxy = new Proxy(input, { ownKeys() { effects++; return Reflect.ownKeys(input); } });
    assert.throws(() => enumerateMutationRequirements(proxy), /mutation_inventory_input/); assert.equal(effects, 0);
    const activeSchema = { ...structuredClone(input), packageReceipt: input.packageReceipt }; Object.defineProperty(activeSchema.graphSchema, 'definitions', {
        enumerable: true, get() { effects++; return input.graphSchema.definitions; } });
    assert.throws(() => enumerateMutationRequirements(activeSchema), /mutation_inventory_schema_projection/); assert.equal(effects, 0);
    const missing = { ...structuredClone(input), packageReceipt: input.packageReceipt }; missing.ir.graphs[0].obligations.pop();
    assert.throws(() => enumerateMutationRequirements(missing), /mutation_inventory_obligation_missing/);
    const unknown = { ...structuredClone(input), packageReceipt: input.packageReceipt }; unknown.ir.graphs[0].predicates[0].atom = 'unknown_atom';
    assert.throws(() => enumerateMutationRequirements(unknown), /mutation_inventory_predicate/);
    const absentWitness = { ...structuredClone(input), packageReceipt: input.packageReceipt }; absentWitness.witnessContracts.witnesses.pop();
    assert.throws(() => enumerateMutationRequirements(absentWitness), /mutation_inventory_witness_missing/);
    const duplicate = { ...structuredClone(input), packageReceipt: input.packageReceipt }; duplicate.ir.order[1] = duplicate.ir.order[0];
    assert.throws(() => enumerateMutationRequirements(duplicate), /mutation_inventory_ir_inventory/);
});

test('N02G:MUTATION-INVENTORY-003 structural strategies cannot disappear behind a single coordinate', async t => {
    const input = await fixture();
    const inventory = enumerateMutationRequirements(input);
    const expected = [];
    for (const graph of input.ir.graphs) {
        for (const [alias, node] of Object.entries(graph.nodes)) {
            for (const strategy of ['version', 'remove', 'duplicate', 'add']) expected.push(['node_strategy', {
                fact_key: graph.fact_key, alias, binding: node.binding, kind: node.kind, strategy }]);
        }
        for (const predicate of graph.predicates) {
            for (const strategy of ['remove', 'invert_or_retarget', 'compatible_wrong_operator', 'unknown_operator']) {
                expected.push(['predicate_strategy', { fact_key: graph.fact_key, predicate_id: predicate.id,
                    obligation: predicate.obligation, atom: predicate.atom, operator: predicate.op, strategy }]);
            }
            for (let operand_index = 0; operand_index < predicate.operands.length; operand_index++) {
                for (const strategy of ['same_type_wrong_path', 'unknown_path']) expected.push(['predicate_path_strategy', {
                    fact_key: graph.fact_key, predicate_id: predicate.id, operand_index, strategy }]);
            }
        }
        for (const edge of graph.edges) for (const strategy of ['remove', 'break_one_end', 'same_value_new_identity']) {
            expected.push(['edge_strategy', { fact_key: graph.fact_key, edge, strategy }]);
        }
        for (const phase of ['derivation', 'proof']) {
            const trace = graph.expected_trace[phase];
            for (const name of ['required_reads', 'required_edges']) for (const value of trace[name]) {
                for (const strategy of ['extra_read', 'same_type_wrong_path', 'selected_set_same_total', 'evaluator_id', 'evaluator_version']) {
                    expected.push(['trace_strategy', { fact_key: graph.fact_key, phase, field: name, value, strategy }]);
                }
            }
        }
    }
    const actual = inventory.requirements.filter(row => row.family.endsWith('_strategy'));
    const canonical = row => JSON.stringify(row);
    assert.equal(actual.length, expected.length);
    assert.deepEqual(actual.map(row => canonical([row.family, row.target])).sort(), expected.map(canonical).sort());
    assert.ok(actual.every(row => row.realization === 'UNSATISFIED_MUTATION_WITNESS'
        && !Object.hasOwn(row, 'expected_violations') && !Object.hasOwn(row, 'actual_violations')));
    assert.equal(new Set(inventory.requirements.map(row => row.mutation_id)).size, inventory.requirements.length);
    t.diagnostic(`normative_strategy_targets=${actual.length}; total_requirements=${inventory.requirements.length}; realized=0`);
});

test('N02G:MUTATION-MATRIX-002 trace omission batch derives outcomes from captured execution, not caller verdicts', async t => {
    const input = await fixture();
    const { executeTraceOmissionBatch } = await import('../../../scripts/agent/executeNextTraceOmissionMatrix.mjs');
    const result = await executeTraceOmissionBatch({ packageReceipt: mutationPackage, fact_keys: ['S-04#1#1'] });
    assert.equal(result.stage, 'captured_trace_omission_batch_only');
    assert.equal(result.global_g11, false); assert.equal(result.graph_accepted, false);
    assert.equal(result.trace_fault_injection, 'recorder_output_only');
    assert.equal(result.baselines.length, 1); assert.equal(result.baselines[0].proof_satisfied, true);
    assert.ok(result.omissions.expected > result.omissions.executed, 'unrequested graphs must remain pending');
    assert.equal(result.omissions.generated, result.rows.length);
    assert.equal(result.omissions.executed, result.rows.length);
    assert.equal(result.omissions.generated, 523);
    assert.equal(result.batch_expected, 523); assert.equal(result.batch_complete, true); assert.equal(result.class_complete, false);
    assert.equal(result.phase_trace_family_expected, result.omissions.expected);
    assert.equal(result.phase_trace_family_pending, result.phase_trace_family_expected - result.omissions.matched);
    assert.equal(result.phase_trace_family_complete, false);
    assert.equal(result.omissions.matched, 523, 'all authored S-04 omission coordinates must be isolated');
    assert.equal(result.rows.filter(row => row.target.field === 'required_nodes').length, 59);
    assert.equal(result.rows.filter(row => row.target.field === 'required_selections').length, 2);
    assert.equal(result.rows.filter(row => row.target.field === 'selected_nodes').length, 10);
    assert.equal(result.omissions.matched, result.rows.filter(row => row.matched).length,
        'unclassified collateral failures must not be credited');
    assert.equal(result.pending_omissions, result.omissions.expected - result.omissions.matched);
    assert.equal(result.rows.filter(row => row.target.field === 'required_structural' && row.target.value.operation === 'has').length, 22);
    const inventory = enumerateMutationRequirements(input);
    const requirements = new Map(inventory.requirements.map(row => [row.mutation_id, row]));
    for (const row of result.rows) {
        assert.deepEqual(row.target, requirements.get(row.mutation_id).target);
        assert.equal(row.trace_component, ['required_selections', 'selected_nodes'].includes(row.target.field)
            ? 'selection' : 'read_edges');
        if (row.matched) {
            assert.deepEqual(row.actual_violations, ['trace']); assert.equal(row.other_components_match, true);
            assert.deepEqual(row.unmatched_components, []);
        } else {
            assert.equal(row.other_components_match, false); assert.equal(row.actual_violations, null);
            assert.ok(row.unmatched_components.length > 0);
        }
    }
    assert.equal(new Set(result.rows.map(row => row.mutation_id)).size, result.rows.length);
    t.diagnostic(`unmatched_trace_coordinates=${JSON.stringify(result.rows.filter(row => !row.matched)
        .map(row => ({ target: row.target, components: row.unmatched_components })))}`);
    await assert.rejects(executeTraceOmissionBatch({ packageReceipt: { ...mutationPackage }, fact_keys: ['S-04#1#1'] }), /not_admitted/);
    await assert.rejects(executeTraceOmissionBatch({ packageReceipt: mutationPackage, fact_keys: ['F-99#1#1'] }),
        /trace_matrix_graph_missing/);
    await assert.rejects(executeTraceOmissionBatch({ packageReceipt: mutationPackage, fact_keys: ['S-04#1#1'], matched: true }), /trace_matrix_input/);
    let effects = 0;
    const active = { fact_keys: ['S-04#1#1'] };
    Object.defineProperty(active, 'packageReceipt', { enumerable: true, get() { effects++; return mutationPackage; } });
    await assert.rejects(executeTraceOmissionBatch(active), /trace_matrix_input/); assert.equal(effects, 0);
    t.diagnostic(`trace_omissions_expected=${result.omissions.expected}; generated=${result.omissions.generated}; executed=${result.omissions.executed}; matched=${result.omissions.matched}; global_g11=false`);
});

test('N02G:MUTATION-GENERATOR-001 sign candidates bind to IR coordinates and repair source identity deterministically', async () => {
    const input = await fixture();
    const inventory = enumerateMutationRequirements(input);
    const graph = input.ir.graphs.find(row => row.fact_key === 'M-01#1#1');
    const original = new Map(mutationPackage.documents.map(row => [row.path, row.value]));
    const predicates = graph.predicates.filter(row => ['opposite_sign', 'abs_eq'].includes(row.op));
    assert.ok(predicates.length > 0);
    let generated = 0;
    for (const predicate of predicates) for (const operand_index of [0, 1]) {
        const request = { packageReceipt: mutationPackage, fact_key: graph.fact_key, predicate_id: predicate.id, operand_index };
        const actual = materializeSignedRelationMutation(request);
        assert.deepEqual(materializeSignedRelationMutation(request), actual);
        assert.equal(actual.stage, 'generated_semantic_mutation_only');
        assert.equal(actual.mutation_acceptance, false);
        assert.deepEqual(actual.expected_violations, [predicate.atom]);
        const requirement = inventory.requirements.find(row => row.mutation_id === actual.mutation_id);
        assert.equal(requirement.family, 'predicate_atom');
        assert.deepEqual(requirement.target, actual.target);
        assert.equal(requirement.realization, 'UNSATISFIED_MUTATION_WITNESS');
        if (predicate.op === 'opposite_sign') assert.equal(actual.patch.before, -actual.patch.after);
        else {
            assert.equal(Math.sign(actual.patch.before), Math.sign(actual.patch.after));
            assert.notEqual(Math.abs(actual.patch.before), Math.abs(actual.patch.after));
        }
        assert.equal(new Set(actual.changes.map(row => row.path)).size, 3);
        const changed = new Map(actual.changes.map(row => {
            assert.equal(hash(Buffer.from(row.source)), row.sha256);
            return [row.path, JSON.parse(row.source)];
        }));
        const graphPath = prefix + 'graphs-v2.json';
        const beforeCorpus = original.get(graphPath);
        const afterCorpus = changed.get(graphPath);
        assert.equal(afterCorpus.graphs.length, beforeCorpus.graphs.length);
        assert.deepEqual(afterCorpus.claim_contract, beforeCorpus.claim_contract);
        for (let i = 0; i < beforeCorpus.graphs.length; i++) {
            const before = beforeCorpus.graphs[i]; const after = afterCorpus.graphs[i];
            for (const key of ['fact_key', 'claim_id', 'edges', 'sets', 'obligations', 'selections', 'trace_contract']) {
                assert.deepEqual(after[key], before[key], `${before.fact_key}/${key}`);
            }
            assert.deepEqual(after.predicates.filter(row => row.op !== 'fingerprint_is'),
                before.predicates.filter(row => row.op !== 'fingerprint_is'));
        }
        generated++;
    }
    assert.equal(generated, predicates.length * 2);
    assert.ok(inventory.requirements.every(row => row.realization === (row.family === 'singleton_domain_invariant'
        ? 'UNSATISFIED_DOMAIN_INVARIANT' : 'UNSATISFIED_MUTATION_WITNESS')));
});

test('N02G:MUTATION-MATRIX-003 derived trace batches execute their actual parents before issuing local harness receipts', async t => {
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    await fixture();
    const { executeTraceOmissionBatch } = await import('../../../scripts/agent/executeNextTraceOmissionMatrix.mjs');
    const factKeys = ['M-01#1#3', 'M-01#1#4', 'M-14#1#3'];
    const result = await executeTraceOmissionBatch({ packageReceipt: mutationPackage, fact_keys: factKeys });
    assert.equal(result.global_g11, false); assert.equal(result.financial_receipt, false);
    assert.equal(result.parent_source, 'same_batch_executed_and_coverage_validated');
    assert.equal(result.supporting_fact_keys.length, 4);
    assert.equal(result.baselines.length, 7);
    assert.equal(result.baselines.filter(row => row.requested).length, 3);
    assert.equal(result.baselines.filter(row => !row.requested).length, 4);
    const oracle = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8'));
    const documents = new Map(mutationPackage.documents.map(row => [row.path, row.value]));
    const corpus = documents.get(prefix + 'graphs-v2.json');
    const claims = documents.get(corpus.claim_contract.path).claims;
    const registry = documents.get(corpus.metric_evaluator_registry.path);
    for (const baseline of result.baselines) {
        const split = baseline.fact_key.lastIndexOf('#');
        const value = oracle.turns[baseline.fact_key.slice(0, split)].facts[Number(baseline.fact_key.slice(split + 1)) - 1].value;
        const claim = claims.find(row => row.fact_key === baseline.fact_key);
        const entry = registry.entries.find(row => row.evaluator_id === claim.evaluator_ref.evaluator_id);
        const kind = documents.get(entry.contract_path).signature.output.kind;
        assert.equal(baseline.functional_result_sha256, hash(Buffer.from(canonicalValue({ unit: entry.unit, kind, value }))));
        assert.equal(baseline.proof_satisfied, true);
        if (baseline.requested) {
            assert.equal(baseline.parent_fact_keys.length, 2);
            for (const parent of baseline.parent_fact_keys) {
                assert.ok(result.supporting_fact_keys.includes(parent));
                assert.ok(result.baselines.findIndex(row => row.fact_key === parent)
                    < result.baselines.findIndex(row => row.fact_key === baseline.fact_key));
            }
        } else assert.deepEqual(baseline.parent_fact_keys, []);
    }
    assert.ok(result.batch_expected > 0);
    assert.equal(result.omissions.generated, result.batch_expected);
    assert.equal(result.omissions.executed, result.batch_expected);
    assert.equal(result.omissions.matched, result.batch_expected);
    assert.equal(result.batch_complete, true); assert.equal(result.class_complete, false);
    assert.equal(result.rows.some(row => !factKeys.includes(row.target.fact_key)), false,
        'supporting parents execute as baseline only; their mutations must not receive credit');
    await assert.rejects(executeTraceOmissionBatch({ packageReceipt: mutationPackage, fact_keys: factKeys,
        parentContext: { receipts: {} } }), /trace_matrix_input/);
    t.diagnostic(`derived_omissions=${result.batch_expected}; executed_parents=4; local_harness_only=true`);
});

test('N02G:MUTATION-INVENTORY-004 domain partition is exhaustive, admitted and has no semantic credit', async t => {
    const input = await fixture();
    const inventory = enumerateMutationRequirements(input);
    const singletons = inventory.requirements.filter(row => row.family === 'singleton_domain_invariant');
    const semantic = inventory.requirements.filter(row => row.family === 'material_field');
    const expected = input.ir.graphs.flatMap(graph => Object.entries(graph.nodes).flatMap(([alias, node]) =>
        Object.entries(input.materialRegistry.kinds[node.kind].fields).filter(([, d]) => d.class !== 'non_material')
            .map(([field, descriptor]) => ({ fact_key: graph.fact_key, alias, field, descriptor }))));
    assert.equal(singletons.length, 107);
    assert.deepEqual([...singletons, ...semantic].map(row => JSON.stringify(row.target)).sort(),
        expected.map(row => JSON.stringify(row)).sort());
    assert.ok(singletons.every(row => row.target.descriptor.type === 'enum'
        && row.target.descriptor.values.length === 1 && row.realization === 'UNSATISFIED_DOMAIN_INVARIANT'
        && !Object.hasOwn(row, 'expected_violations')));
    assert.ok(semantic.every(row => row.target.descriptor.type !== 'enum' || row.target.descriptor.values.length > 1));
    assert.deepEqual(inventory.domain_partition, { material_coordinates: expected.length,
        semantic_material_fields: semantic.length, singleton_domain_invariants: singletons.length });
    assert.throws(() => enumerateMutationRequirements({ ...input, packageReceipt: { ...input.packageReceipt } }), /not_admitted/);
    const mismatched = { ...input, materialRegistry: structuredClone(input.materialRegistry) };
    mismatched.materialRegistry.kinds.budget.fields.evidence_state.values.push('projected');
    assert.throws(() => enumerateMutationRequirements(mismatched), /mutation_inventory_registry_identity/);
    const wrongAuthority = { ...input, ir: structuredClone(input.ir) };
    wrongAuthority.ir.authority_refs[0].sha256 = hash('different');
    assert.throws(() => enumerateMutationRequirements(wrongAuthority), /mutation_inventory_authority_identity/);
    t.diagnostic(`material_fields=${expected.length}; semantic=${semantic.length}; singleton_invariants=${singletons.length}; all_unrealized=true`);
});

test('N02G:MUTATION-INVENTORY-005 contract expansion reclassifies coordinates without deleting or compensating targets', async () => {
    const input = await fixture();
    function replacement(transform) {
        const docs = new Map(mutationPackage.documents.map(row => [row.path, structuredClone(row.value)]));
        const corpus = docs.get(prefix + 'graphs-v2.json');
        const material = docs.get(corpus.material_registry.path);
        const snapshotSchema = docs.get(prefix + 'evidence-snapshot.schema.json');
        transform(material, snapshotSchema);
        const entries = [...docs].map(([path, value]) => ({ path, bytes: Buffer.from(JSON.stringify(value)) }));
        const packageReceipt = admitPackage({ entries, authority: entries.map(row => ({ path: row.path, sha256: hash(row.bytes) })) });
        const ir = structuredClone(input.ir);
        ir.authority_refs = packageReceipt.documents.map(({ path, sha256 }) => ({ path, sha256 }));
        // Synthetic inventory-only contracts, not a compiled financial package
        // and not an authorized widening of the runtime domain.
        return { ...input, packageReceipt, ir, materialRegistry: material };
    }
    const baseline = enumerateMutationRequirements(input);
    const expanded = enumerateMutationRequirements(replacement((r, s) => {
        r.kinds.budget.fields.evidence_state.values.push('projected');
        s.definitions.payload_budget.properties.evidence_state.enum.push('projected');
    }));
    const budgets = baseline.requirements.filter(row => row.family === 'singleton_domain_invariant'
        && input.ir.graphs.find(g => g.fact_key === row.target.fact_key).nodes[row.target.alias].kind === 'budget');
    assert.equal(expanded.domain_partition.singleton_domain_invariants, baseline.domain_partition.singleton_domain_invariants - budgets.length);
    assert.equal(expanded.domain_partition.semantic_material_fields, baseline.domain_partition.semantic_material_fields + budgets.length);
    assert.equal(expanded.requirements.length, baseline.requirements.length);
    for (const row of budgets) assert.ok(expanded.requirements.some(candidate => candidate.family === 'material_field'
        && candidate.target.fact_key === row.target.fact_key && candidate.target.alias === row.target.alias
        && candidate.target.field === row.target.field));
    for (const transform of [
        (r, s) => { s.definitions.payload_budget.properties.evidence_state.enum.push('projected'); },
        (r, s) => { r.kinds.budget.fields.evidence_state.values.push('confirmed'); s.definitions.payload_budget.properties.evidence_state.enum.push('confirmed'); },
        (r) => { delete r.kinds.budget.fields.evidence_state.values; },
        (r) => { r.kinds.budget.fields.evidence_state.type = 'unknown_domain'; }
    ]) assert.throws(() => enumerateMutationRequirements(replacement(transform)), /schema_registry/);
    const unknownPackage = { ...input, packageReceipt: { ...input.packageReceipt } };
    assert.throws(() => enumerateMutationRequirements(unknownPackage), /not_admitted/);
});

test('N02G:MUTATION-GENERATOR-014 singleton candidates are distinct typed admission negatives, not D/P witnesses', async t => {
    const input = await fixture();
    const { materializeSingletonDomainCandidate } = require('../../../src/next/provenance/mutationWitnesses');
    const { buildSchemaValidators } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const validate = buildSchemaValidators().validators.snapshot;
    const inventory = enumerateMutationRequirements(input);
    const targets = inventory.requirements.filter(row => row.family === 'singleton_domain_invariant');
    for (const row of targets) {
        const request = { packageReceipt: mutationPackage, fact_key: row.target.fact_key,
            alias: row.target.alias, field: row.target.field };
        const candidate = materializeSingletonDomainCandidate(request);
        assert.equal(candidate.mutation_id, row.mutation_id);
        assert.deepEqual(candidate.target, row.target);
        assert.deepEqual(materializeSingletonDomainCandidate(request), candidate);
        assert.equal(candidate.stage, 'generated_domain_admission_candidate_only');
        assert.equal(candidate.semantic_witness, false); assert.equal(candidate.mutation_acceptance, false);
        assert.equal(candidate.dp_execution, false); assert.ok(!Object.hasOwn(candidate, 'expected_violations'));
        assert.equal(validate(candidate.baseline), true);
        assert.equal(validate(candidate.candidate), false);
        assert.ok(validate.errors.some(error => error.keyword === 'enum'
            && error.instancePath === `/payload/${row.target.field}`
            && JSON.stringify(error.params.allowedValues) === JSON.stringify([candidate.baseline.payload[row.target.field]])));
        const before = structuredClone(candidate.baseline);
        before.payload[row.target.field] = candidate.candidate.payload[row.target.field];
        assert.deepEqual(before, candidate.candidate);
        assert.equal(typeof candidate.baseline.payload[row.target.field], typeof candidate.candidate.payload[row.target.field]);
    }
    assert.equal(targets.length, 107);
    const request = { packageReceipt: mutationPackage, fact_key: targets[0].target.fact_key,
        alias: targets[0].target.alias, field: targets[0].target.field };
    let effects = 0;
    const active = { ...request }; Object.defineProperty(active, 'packageReceipt', {
        enumerable: true, get() { effects++; return mutationPackage; } });
    assert.throws(() => materializeSingletonDomainCandidate(active));
    assert.throws(() => materializeSingletonDomainCandidate(new Proxy(request, { ownKeys() { effects++; return []; } })));
    const coerced = { toString() { effects++; return request.alias; } };
    assert.throws(() => materializeSingletonDomainCandidate({ ...request, alias: coerced }));
    assert.throws(() => materializeSingletonDomainCandidate({ ...request, field: coerced }));
    assert.throws(() => materializeSingletonDomainCandidate({ ...request, fact_key: coerced }));
    assert.equal(effects, 0);
    assert.throws(() => materializeSingletonDomainCandidate({ ...request, packageReceipt: { ...mutationPackage } }), /not_admitted/);
    assert.throws(() => materializeSingletonDomainCandidate({ ...request, field: 'id' }), /mutation_inventory_singleton_domain/);
    assert.throws(() => materializeSingletonDomainCandidate({ ...request, after: 'bypass' }), /mutation_inventory_input/);
    assert.ok(targets.every(row => row.realization === 'UNSATISFIED_DOMAIN_INVARIANT'));
    t.diagnostic(`domain_admission_baselines=${targets.length}; typed_schema_negatives=${targets.length}; semantic_credit=0; dp_execution=0`);
});

test('N02G:MUTATION-MATRIX-001 domain accounting comes from actual admitted-schema execution, with no semantic credit', async t => {
    const input = await fixture();
    const { executeSingletonDomainMatrix } = await import('../../../scripts/agent/executeNextDomainInvariantMatrix.mjs');
    const report = executeSingletonDomainMatrix(input.packageReceipt);
    const inventory = enumerateMutationRequirements(input);
    const ids = inventory.requirements.filter(row => row.family === 'singleton_domain_invariant').map(row => row.mutation_id);
    assert.equal(report.stage, 'domain_admission_matrix_executed_only');
    assert.equal(report.global_g11, false);
    assert.equal(report.dp_execution, false);
    assert.deepEqual(report.domain_invariants, { expected: 107, generated: 107, executed: 107, matched: 107 });
    assert.deepEqual(report.semantic_mutations, { expected: inventory.requirements.length - 107,
        generated: 0, executed: 0, matched: 0 });
    assert.deepEqual(report.rows.map(row => row.mutation_id), ids);
    assert.equal(new Set(report.rows.map(row => row.mutation_id)).size, ids.length);
    assert.ok(report.rows.every(row => row.baseline_accepted && row.negative_rejected && row.domain_error_observed && row.matched));
    assert.ok(report.rows.every(row => !Object.hasOwn(row, 'expected_violations') && !Object.hasOwn(row, 'receipt')));
    assert.deepEqual(report.authority_refs, input.ir.authority_refs);
    assert.ok(Object.isFrozen(report.rows));
    assert.throws(() => executeSingletonDomainMatrix({ ...input.packageReceipt }), /not_admitted/);
    const missing = mutationEntries.filter(row => row.path !== prefix + 'evidence-snapshot.schema.json');
    const incomplete = admitPackage({ entries: missing, authority: missing.map(row => ({ path: row.path, sha256: hash(row.bytes) })) });
    assert.throws(() => executeSingletonDomainMatrix(incomplete), /admitted_schema_missing/);
    t.diagnostic(`domain_matrix=${report.domain_invariants.matched}/${report.domain_invariants.expected}; semantic_execution=0; global_g11=false`);
});

test('N02G:MUTATION-GENERATOR-002 active inputs, forged receipt and unclassified targets cannot generate a witness', async () => {
    await fixture(); let effects = 0;
    const corpus = mutationPackage.documents.find(row => row.path === prefix + 'graphs-v2.json').value;
    const graph = corpus.graphs.find(row => row.fact_key === 'M-01#1#1');
    const predicate = graph.predicates.find(row => row.op === 'opposite_sign');
    const request = { packageReceipt: mutationPackage, fact_key: graph.fact_key, predicate_id: predicate.id, operand_index: 0 };
    const getter = { ...request };
    Object.defineProperty(getter, 'packageReceipt', { enumerable: true, get() { effects++; return mutationPackage; } });
    assert.throws(() => materializeSignedRelationMutation(getter), /mutation_inventory_input/);
    const proxy = new Proxy(request, { ownKeys() { effects++; return Reflect.ownKeys(request); } });
    assert.throws(() => materializeSignedRelationMutation(proxy), /mutation_inventory_input/);
    assert.equal(effects, 0);
    assert.throws(() => materializeSignedRelationMutation({ ...request, packageReceipt: { ...mutationPackage } }), /not_admitted/);
    for (const extra of [{ fact_key: 'missing' }, { predicate_id: 'missing' }, { operand_index: -1 },
        { predicate_id: graph.predicates.find(row => row.op !== 'opposite_sign').id }]) {
        assert.throws(() => materializeSignedRelationMutation({ ...request, ...extra }), /mutation_inventory_sign_target/);
    }
    assert.throws(() => materializeSignedRelationMutation({ ...request, expected_violations: ['edge'] }), /mutation_inventory_input/);
});

test('N02G:MUTATION-GENERATOR-003 every explicit estimated-input state omission fails after exact package repair', async t => {
    const input = await fixture();
    const inventory = enumerateMutationRequirements(input);
    const targets = inventory.requirements.filter(row => row.family === 'input_evidence_state_presence');
    assert.ok(targets.length > 0);
    const { buildSchemaValidators } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const validators = buildSchemaValidators().validators;
    const before = mutationPackage.documents.find(row => row.path === prefix + 'graphs-v2.json').value;
    let executed = 0;
    for (const requirement of targets) {
        const expectedViolations = ['evidence_state'];
        const request = { packageReceipt: mutationPackage, fact_key: requirement.target.fact_key,
            candidate_set: requirement.target.candidate_set };
        const generated = materializeInputStateOmission(request);
        assert.deepEqual(materializeInputStateOmission(request), generated);
        assert.equal(generated.mutation_id, requirement.mutation_id);
        assert.equal(generated.mutation_acceptance, false);
        assert.deepEqual(generated.expected_violations, expectedViolations);
        assert.equal(generated.changes.length, 1);
        const row = generated.changes[0];
        const after = JSON.parse(row.source);
        const expected = structuredClone(before);
        delete expected.graphs.find(graph => graph.fact_key === request.fact_key)
            .selections.find(selection => selection.candidate_set === request.candidate_set).input_evidence_state;
        assert.deepEqual(after, expected);
        assert.equal(validators.graphs(after), true, 'the omission must remain schema-valid');
        const entries = mutationEntries.map(entry => ({ path: entry.path,
            bytes: entry.path === row.path ? Buffer.from(row.source) : Buffer.from(entry.bytes) }));
        const receipt = admitPackage({ entries, authority: entries.map(entry => ({ path: entry.path, sha256: hash(entry.bytes) })) });
        assert.throws(() => compileAuthoringIR(receipt, validators), /selection_binding_input_state/);
        executed++;
    }
    assert.equal(executed, targets.length);
    assert.ok(targets.every(row => row.realization === 'UNSATISFIED_MUTATION_WITNESS'));
    t.diagnostic(`input_state_omissions_executed=${executed}; exact_failure=selection_binding_input_state; G11_complete=false`);
});

test('N02G:MUTATION-GENERATOR-004 expected fingerprint drift leaves payload and predicates intact and fails the fingerprint barrier', async t => {
    const input = await fixture();
    const inventory = enumerateMutationRequirements(input);
    const targets = inventory.requirements.filter(row => row.family === 'expected_fingerprint');
    assert.equal(targets.length, input.ir.graphs.reduce((count, graph) => count
        + Object.values(graph.nodes).filter(node => node.binding === 'snapshot').length, 0));
    assert.ok(targets.length > 0);
    const selected = new Map();
    for (const row of targets) {
        const node = input.ir.graphs.find(graph => graph.fact_key === row.target.fact_key).nodes[row.target.alias];
        if (!selected.has(node.kind)) selected.set(node.kind, row);
    }
    const { buildSchemaValidators } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const validators = buildSchemaValidators().validators;
    const before = mutationPackage.documents.find(row => row.path === prefix + 'graphs-v2.json').value;
    let executed = 0;
    for (const requirement of selected.values()) {
        const request = { packageReceipt: mutationPackage, fact_key: requirement.target.fact_key, alias: requirement.target.alias };
        const generated = materializeExpectedFingerprintDrift(request);
        assert.deepEqual(materializeExpectedFingerprintDrift(request), generated);
        assert.equal(generated.mutation_id, requirement.mutation_id);
        assert.equal(generated.mutation_acceptance, false);
        assert.deepEqual(generated.expected_violations, ['fingerprint']);
        assert.equal(generated.changes.length, 1);
        const row = generated.changes[0];
        const expected = structuredClone(before);
        const node = expected.graphs.find(graph => graph.fact_key === request.fact_key).nodes[request.alias];
        assert.equal(node.semantic_fingerprint, generated.patch.before);
        assert.notEqual(generated.patch.before, generated.patch.after);
        node.semantic_fingerprint = generated.patch.after;
        const after = JSON.parse(row.source);
        assert.deepEqual(after, expected, 'no content/predicate repair may mask a fingerprint-only defect');
        assert.equal(validators.graphs(after), true);
        const entries = mutationEntries.map(entry => ({ path: entry.path,
            bytes: entry.path === row.path ? Buffer.from(row.source) : Buffer.from(entry.bytes) }));
        const receipt = admitPackage({ entries, authority: entries.map(entry => ({ path: entry.path, sha256: hash(entry.bytes) })) });
        assert.throws(() => compileAuthoringIR(receipt, validators), /node_snapshot_mismatch_fingerprint$/);
        executed++;
    }
    assert.equal(executed, selected.size);
    assert.ok(targets.every(row => row.realization === 'UNSATISFIED_MUTATION_WITNESS'));
    t.diagnostic(`fingerprint_kinds_exercised=${executed}; enumerated_targets=${targets.length}; G11_complete=false`);
});

test('N02G:MUTATION-GENERATOR-005 structural strategies reject active input, public receipt copies and coincident defaults', async () => {
    await fixture(); let effects = 0;
    const corpus = mutationPackage.documents.find(row => row.path === prefix + 'graphs-v2.json').value;
    const stateGraph = corpus.graphs.find(graph => graph.selections.some(row => Object.hasOwn(row, 'input_evidence_state')));
    const fingerprintGraph = corpus.graphs.find(graph => Object.values(graph.nodes).some(node => node.binding === 'snapshot'));
    const alias = Object.keys(fingerprintGraph.nodes).find(alias => fingerprintGraph.nodes[alias].binding === 'snapshot');
    for (const [run, request] of [
        [materializeInputStateOmission, { packageReceipt: mutationPackage, fact_key: stateGraph.fact_key,
            candidate_set: stateGraph.selections.find(row => Object.hasOwn(row, 'input_evidence_state')).candidate_set }],
        [materializeExpectedFingerprintDrift, { packageReceipt: mutationPackage, fact_key: fingerprintGraph.fact_key, alias }]
    ]) {
        const getter = { ...request };
        Object.defineProperty(getter, 'packageReceipt', { enumerable: true, get() { effects++; return mutationPackage; } });
        assert.throws(() => run(getter), /mutation_inventory_input/);
        assert.throws(() => run(new Proxy(request, { ownKeys() { effects++; return Reflect.ownKeys(request); } })), /mutation_inventory_input/);
        assert.throws(() => run({ ...request, packageReceipt: { ...mutationPackage } }), /not_admitted/);
        assert.throws(() => run({ ...request, expected_violations: [] }), /mutation_inventory_input/);
        assert.throws(() => run({ ...request, fact_key: 'missing' }), /mutation_inventory_(input_state|fingerprint)_target/);
    }
    assert.equal(effects, 0);
    assert.throws(() => materializeExpectedFingerprintDrift({ packageReceipt: mutationPackage,
        fact_key: fingerprintGraph.fact_key, alias: '__proto__' }), /mutation_inventory_fingerprint_target/);
    const copy = structuredClone(corpus);
    const graph = copy.graphs.find(row => row.fact_key === 'M-01#1#1');
    graph.selections[0].input_evidence_state = 'confirmed';
    const entries = mutationEntries.map(row => ({ path: row.path,
        bytes: row.path === prefix + 'graphs-v2.json' ? Buffer.from(JSON.stringify(copy)) : Buffer.from(row.bytes) }));
    const receipt = admitPackage({ entries, authority: entries.map(row => ({ path: row.path, sha256: hash(row.bytes) })) });
    assert.throws(() => materializeInputStateOmission({ packageReceipt: receipt, fact_key: graph.fact_key,
        candidate_set: graph.selections[0].candidate_set }), /mutation_inventory_input_state_not_discriminant/);
});

test('N02G:MUTATION-GENERATOR-006 trace faults do not mutate their source or cache a merely frozen outer shell', () => {
    const { freezeDeep } = require('../../../src/next/kernel/canonicalValue');
    const fresh = () => ({ stage: 'observations_only', execution_id: 'trace-fault-test', derivation_trace: [],
        proof_trace: [0, 1].map(sequence => ({ sequence, invocation_id: 'fact-a', phase: 'proof',
            operation: 'get', alias: 'evt_a', role: 'proof/snapshot', path: ['amount_minor'],
            projection: 'data', outcome: ['scalar', 7] })) });
    const request = trace => ({ trace, fact_key: 'fact-a', phase: 'proof', node: 'evt_a', segments: ['amount_minor'] });
    const source = fresh(); const before = structuredClone(source);
    const fault = materializeTraceReadOmission(request(source));
    assert.deepEqual(source, before);
    assert.deepEqual(fault.removed_sequences, [0, 1]);
    assert.deepEqual(fault.trace.proof_trace, []);
    assert.equal(fault.mutation_acceptance, false);
    const shell = Object.freeze(fresh());
    materializeTraceReadOmission(request(shell));
    shell.proof_trace[0].operation = 'unknown';
    assert.throws(() => materializeTraceReadOmission(request(shell)));
    const immutable = freezeDeep(fresh());
    assert.deepEqual(materializeTraceReadOmission(request(immutable)), materializeTraceReadOmission(request(immutable)));
    assert.equal(immutable.proof_trace.length, 2);
    assert.throws(() => { materializeTraceReadOmission(request(immutable)).trace.proof_trace.push(before.proof_trace[0]); }, TypeError);
    assert.throws(() => materializeTraceReadOmission({ ...request(immutable), fact_key: 'other' }), /mutation_inventory_trace_scope/);
    assert.throws(() => materializeTraceReadOmission({ ...request(immutable), node: 'missing' }), /mutation_inventory_trace_no_witness/);
    assert.throws(() => materializeTraceReadOmission({ ...request(immutable), segments: [] }), /mutation_inventory_trace_target/);
    const duplicate = fresh(); duplicate.proof_trace[1].sequence = 0;
    assert.throws(() => materializeTraceReadOmission(request(duplicate)), /mutation_inventory_trace_scope/);
    let effects = 0;
    const getter = fresh();
    Object.defineProperty(getter, 'proof_trace', { enumerable: true, get() { effects++; return []; } });
    assert.throws(() => materializeTraceReadOmission(request(getter)));
    assert.throws(() => materializeTraceReadOmission(request(new Proxy(fresh(), {
        ownKeys() { effects++; return []; }
    }))));
    assert.equal(effects, 0);
});

test('N02G:MUTATION-GENERATOR-018 node omission removes one phase-local node view without deleting siblings', () => {
    const { materializeTraceNodeOmission } = require('../../../src/next/provenance/mutationWitnesses');
    const { compareReadEdgeCoverage } = require('../../../src/next/provenance/proofAcceptance');
    const event = (sequence, phase, alias) => ({ sequence, invocation_id: 'fact-a', phase,
        operation: 'get', alias, role: 'proof/snapshot', path: ['amount_minor'],
        projection: 'data', outcome: ['scalar', 7] });
    const trace = { stage: 'observations_only', execution_id: 'node-omission-test',
        derivation_trace: [event(0, 'derivation', 'evt_a')],
        proof_trace: [event(1, 'proof', 'evt_a'), event(2, 'proof', 'evt_b')] };
    const before = structuredClone(trace);
    const expected = { required_nodes: ['evt_a', 'evt_b'], required_reads: [
        { node: 'evt_a', segments: ['amount_minor'] }, { node: 'evt_b', segments: ['amount_minor'] }],
        required_claim_reads: [], required_edges: [], required_structural: [] };
    const compare = candidate => compareReadEdgeCoverage({ trace: candidate, expected,
        executionId: trace.execution_id, invocationId: 'fact-a', phase: 'proof' });
    assert.equal(compare(trace).matched, true);
    const request = { trace, fact_key: 'fact-a', phase: 'proof', node: 'evt_a' };
    const fault = materializeTraceNodeOmission(request);
    assert.deepEqual(trace, before);
    assert.deepEqual(fault.target, { fact_key: 'fact-a', phase: 'proof', field: 'required_nodes', value: 'evt_a' });
    assert.deepEqual(fault.expected_violations, ['trace']);
    assert.equal(fault.mutation_acceptance, false);
    assert.deepEqual(fault.removed_sequences, [1]);
    assert.deepEqual(fault.trace.derivation_trace, trace.derivation_trace);
    assert.equal(fault.trace.proof_trace[0].alias, 'evt_b');
    assert.equal(compare(fault.trace).matched, false);
    assert.ok(compare(fault.trace).mismatches.some(row => row.dimension === 'nodes'));
    assert.throws(() => materializeTraceNodeOmission({ ...request, node: 'missing' }), /trace_no_witness/);
    assert.throws(() => materializeTraceNodeOmission({ ...request, node: 'claim/context' }), /trace_target/);
    let effects = 0;
    const active = { ...request };
    Object.defineProperty(active, 'node', { enumerable: true, get() { effects++; return 'evt_a'; } });
    assert.throws(() => materializeTraceNodeOmission(active), /mutation_inventory_input/);
    assert.equal(effects, 0);
});

test('N02G:MUTATION-GENERATOR-019 selection omissions remove complete bound views, not payload reads', () => {
    const { digest } = require('../../../src/next/kernel/canonicalValue');
    const { materializeTraceSelectionOmission, materializeTraceSelectedNodeOmission } =
        require('../../../src/next/provenance/mutationWitnesses');
    const { compareSelectionCoverage } = require('../../../src/next/provenance/proofAcceptance');
    const role = 'events'; const view = `view_${digest({ role, aliases: ['evt_a'] })}`;
    const row = (sequence, operation, path, projection, outcome) => ({ sequence,
        invocation_id: 'fact-a', phase: 'proof', alias: 'operand/events', role,
        operation, path, projection, outcome });
    const data = { sequence: 5, invocation_id: 'fact-a', phase: 'proof', alias: 'evt_a',
        role: 'proof/snapshot', operation: 'get', path: ['amount_minor'], projection: 'data', outcome: ['scalar', 7] };
    const trace = { stage: 'observations_only', execution_id: 'selection-omission-test', derivation_trace: [],
        proof_trace: [row(0, 'select_start', [], 'operand_set', ['selection_opened']),
            row(1, 'at', [0], 'operand_set', ['node', 'evt_a']),
            row(2, 'select_member', [0], 'operand_set', ['decision', 'evt_a', true]),
            row(3, 'select_return', [], 'operand_set', ['selected', view, 'evt_a']),
            row(4, 'length', [view], 'operand_selection', ['count', 1]), data] };
    const before = structuredClone(trace);
    const pair = { candidate_set: 'candidates', selected_set: 'selected' };
    const args = { expected: { required_selections: [pair], selected_nodes: ['evt_a'] },
        executionId: trace.execution_id, invocationId: 'fact-a', phase: 'proof',
        bindings: [{ role, ...pair }], sets: { candidates: ['evt_a'], selected: ['evt_a'] } };
    assert.equal(compareSelectionCoverage({ ...args, trace }).matched, true);
    for (const [run, request, field, value] of [
        [materializeTraceSelectionOmission, { trace, fact_key: 'fact-a', phase: 'proof', role, ...pair }, 'required_selections', pair],
        [materializeTraceSelectedNodeOmission, { trace, fact_key: 'fact-a', phase: 'proof', node: 'evt_a' }, 'selected_nodes', 'evt_a']
    ]) {
        const fault = run(request);
        assert.deepEqual(fault.target, { fact_key: 'fact-a', phase: 'proof', field, value });
        assert.deepEqual(fault.removed_sequences, [0, 1, 2, 3, 4]);
        assert.deepEqual(fault.trace.proof_trace, [{ ...data, sequence: 0 }]);
        assert.deepEqual(fault.expected_violations, ['trace']);
        assert.equal(fault.mutation_acceptance, false);
        const coverage = compareSelectionCoverage({ ...args, trace: fault.trace });
        assert.equal(coverage.matched, false);
        assert.ok(coverage.mismatches.some(row => row.reason === 'selection_missing'));
        assert.deepEqual(trace, before);
        let effects = 0; const active = { ...request };
        Object.defineProperty(active, 'trace', { enumerable: true, get() { effects++; return trace; } });
        assert.throws(() => run(active), /mutation_inventory_input/); assert.equal(effects, 0);
    }
    assert.throws(() => materializeTraceSelectionOmission({ trace, fact_key: 'fact-a', phase: 'proof',
        role: 'missing', ...pair }), /trace_no_witness/);
    assert.throws(() => materializeTraceSelectedNodeOmission({ trace, fact_key: 'fact-a', phase: 'proof', node: 'missing' }), /trace_no_witness/);
});

test('N02G:MUTATION-GENERATOR-007 omitted edges preserve every read and other traversal', () => {
    const base = { invocation_id: 'fact-a', phase: 'proof', alias: 'evt_a',
        role: 'proof/snapshot', projection: 'data' };
    const trace = { stage: 'observations_only', execution_id: 'trace-edge-test', derivation_trace: [], proof_trace: [
        { ...base, sequence: 0, operation: 'get', path: ['amount_minor'], outcome: ['scalar', 7] },
        { ...base, sequence: 1, operation: 'traverse', path: ['person_id'], outcome: ['edge', 'edge_a', 'person_a'] },
        { ...base, sequence: 2, operation: 'traverse', path: ['person_id'], outcome: ['edge', 'edge_a', 'person_a'] },
        { ...base, sequence: 3, operation: 'traverse', path: ['category_id'], outcome: ['edge', 'edge_b', 'category_a'] }
    ] };
    const before = structuredClone(trace);
    const request = { trace, fact_key: 'fact-a', phase: 'proof', edge: 'edge_a' };
    const fault = materializeTraceEdgeOmission(request);
    assert.equal(fault.stage, 'generated_trace_fault_only');
    assert.equal(fault.mutation_acceptance, false);
    assert.deepEqual(fault.expected_violations, ['trace']);
    assert.deepEqual(fault.removed_sequences, [1, 2]);
    assert.deepEqual(fault.target, { fact_key: 'fact-a', phase: 'proof', field: 'required_edges', value: 'edge_a' });
    assert.deepEqual(fault.trace.proof_trace, [before.proof_trace[0], { ...before.proof_trace[3], sequence: 1 }]);
    assert.deepEqual(trace, before);
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    assert.equal(fault.mutation_id, hash(canonicalValue({ domain: 'financasbot.mutation-requirement.v1',
        family: 'phase_trace_requirement', target: fault.target })));
    assert.throws(() => materializeTraceEdgeOmission({ ...request, edge: 'missing' }), /mutation_inventory_trace_no_witness/);
    assert.throws(() => materializeTraceEdgeOmission({ ...request, edge: '' }), /mutation_inventory_trace_target/);
    assert.throws(() => materializeTraceEdgeOmission({ ...request, phase: 'derivation' }), /mutation_inventory_trace_no_witness/);
    let effects = 0;
    const active = { ...request };
    Object.defineProperty(active, 'edge', { enumerable: true, get() { effects++; return 'edge_a'; } });
    assert.throws(() => materializeTraceEdgeOmission(active));
    assert.throws(() => materializeTraceEdgeOmission(new Proxy(request, { ownKeys() { effects++; return []; } })));
    assert.equal(effects, 0);
});

test('N02G:MUTATION-GENERATOR-008 claim trace omissions cannot remove a snapshot read of the same path', () => {
    const trace = { stage: 'observations_only', execution_id: 'trace-claim-test', derivation_trace: [],
        proof_trace: ['claim/context', 'evt_a', 'claim/context'].map((alias, sequence) => ({
            sequence, invocation_id: 'fact-a', phase: 'proof', operation: 'get', alias,
            role: alias === 'evt_a' ? 'proof/snapshot' : 'claim', path: ['id'], projection: 'data', outcome: ['scalar', 'id-a'] })) };
    const before = structuredClone(trace);
    const request = { trace, fact_key: 'fact-a', phase: 'proof', segments: ['id'] };
    const fault = materializeTraceClaimReadOmission(request);
    assert.deepEqual(fault.removed_sequences, [0, 2]);
    assert.deepEqual(fault.trace.proof_trace, [{ ...before.proof_trace[1], sequence: 0 }]);
    assert.deepEqual(trace, before);
    assert.equal(fault.stage, 'generated_trace_fault_only');
    assert.equal(fault.mutation_acceptance, false);
    assert.deepEqual(fault.expected_violations, ['trace']);
    assert.deepEqual(fault.target, { fact_key: 'fact-a', phase: 'proof', field: 'required_claim_reads', value: { segments: ['id'] } });
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    assert.equal(fault.mutation_id, hash(canonicalValue({ domain: 'financasbot.mutation-requirement.v1',
        family: 'phase_trace_requirement', target: fault.target })));
    assert.throws(() => materializeTraceClaimReadOmission({ ...request, segments: ['missing'] }), /mutation_inventory_trace_no_witness/);
    assert.throws(() => materializeTraceClaimReadOmission({ ...request, node: 'evt_a' }), /mutation_inventory_input/);
    assert.throws(() => materializeTraceClaimReadOmission({ ...request, segments: [] }), /mutation_inventory_trace_target/);
    assert.throws(() => materializeTraceReadOmission({ ...request, node: 'claim/context' }), /mutation_inventory_trace_target/);
});

test('N02G:MUTATION-GENERATOR-009 structural omissions preserve scalar reads and reject unsupported generators', () => {
    const base = { invocation_id: 'fact-a', phase: 'proof', alias: 'evt_a', role: 'proof/snapshot', projection: 'data' };
    const trace = { stage: 'observations_only', execution_id: 'trace-structural-test', derivation_trace: [], proof_trace: [
        { ...base, sequence: 0, operation: 'keys', path: [], outcome: ['keys', 'amount_minor', 'optional'] },
        { ...base, sequence: 1, operation: 'has', path: ['optional'], outcome: ['boolean', true] },
        { ...base, sequence: 2, operation: 'get', path: ['optional'], outcome: ['scalar', 7] }
    ] };
    const before = structuredClone(trace);
    const request = { trace, fact_key: 'fact-a', phase: 'proof', node: 'evt_a', operation: 'keys', segments: [] };
    for (const [operation, segments, sequence] of [['keys', [], 0], ['has', ['optional'], 1]]) {
        const fault = materializeTraceStructuralOmission({ ...request, operation, segments });
        assert.deepEqual(fault.removed_sequences, [sequence]);
        assert.deepEqual(fault.trace.proof_trace, before.proof_trace.filter(row => row.sequence !== sequence)
            .map((row, index) => ({ ...row, sequence: index })));
        assert.equal(fault.stage, 'generated_trace_fault_only'); assert.equal(fault.mutation_acceptance, false);
        assert.deepEqual(fault.expected_violations, ['trace']);
        assert.deepEqual(fault.target, { fact_key: 'fact-a', phase: 'proof', field: 'required_structural',
            value: { node: 'evt_a', operation, segments } });
    }
    assert.deepEqual(trace, before);
    assert.throws(() => materializeTraceStructuralOmission({ ...request, operation: 'selection' }), /mutation_inventory_trace_structural_strategy/);
    assert.throws(() => materializeTraceStructuralOmission({ ...request, operation: 'has' }), /mutation_inventory_trace_target/);
    assert.throws(() => materializeTraceStructuralOmission({ ...request, node: 'missing' }), /mutation_inventory_trace_no_witness/);
    assert.throws(() => materializeTraceStructuralOmission({ ...request, node: 'claim/context' }), /mutation_inventory_trace_target/);
});

test('N02G:MUTATION-GENERATOR-015 iterator lifecycle faults are rejected by real coverage without deleting scalar reads', () => {
    const { createCausalRecorder } = require('../../../src/next/provenance/causalRecorder');
    const { createInstrumentedAccess } = require('../../../src/next/provenance/instrumentedAccess');
    const { compareReadEdgeCoverage } = require('../../../src/next/provenance/proofAcceptance');
    const recorder = createCausalRecorder({ executionId: 'structural-lifecycle', maxEvents: 100 });
    const scope = recorder.open({ invocationId: 'fact-structural', phase: 'proof' });
    const access = createInstrumentedAccess({ bindings: [{ alias: 'source', role: 'proof/snapshot',
        value: { members: ['a', 'b'], other: 7 }, shape: { type: 'record', fields: {
            members: { type: 'sequence', item: { type: 'scalar' } }, other: { type: 'scalar' } } } }], links: [], emit: scope.observe });
    const members = access.handle('source').get('members');
    assert.deepEqual([...members], ['a', 'b']);
    assert.deepEqual([...members], ['a', 'b']);
    assert.equal(members.length(), 2);
    assert.equal(access.handle('source').get('other'), 7);
    assert.equal(access.handle('source').has('other'), true);
    const keys = access.handle('source').keys();
    assert.deepEqual([...keys], ['members', 'other']);
    assert.deepEqual([...keys], ['members', 'other']);
    assert.equal(keys.length(), 2);
    assert.equal(keys.at(0), 'members');
    assert.equal(keys.includes('other'), true);
    access.assertHealthy(); access.revoke(); scope.seal();
    const trace = recorder.finish(); const before = structuredClone(trace);
    const expected = { required_nodes: ['source'], required_reads: [
        { node: 'source', segments: ['members'] }, { node: 'source', segments: ['other'] }],
        required_edges: [], required_claim_reads: [], required_structural: ['iterator', 'order', 'cardinality']
            .map(operation => ({ node: 'source', operation, segments: ['members'] })).concat([
                { node: 'source', operation: 'has', segments: ['other'] },
                { node: 'source', operation: 'keys', segments: [] }]) };
    const check = trace => compareReadEdgeCoverage({ trace, expected, executionId: 'structural-lifecycle',
        invocationId: 'fact-structural', phase: 'proof' });
    assert.equal(check(trace).matched, true);
    const terminalOnly = structuredClone(trace);
    terminalOnly.proof_trace = terminalOnly.proof_trace.filter(row => !(row.operation === 'next' && row.outcome[0] === 'done'))
        .map((row, sequence) => ({ ...row, sequence }));
    assert.ok(check(terminalOnly).unclassified.length > 0,
        'terminal-only deletion cannot preserve classification across repeated cursor cycles');
    for (const operation of ['iterator', 'order', 'cardinality']) {
        const request = { trace, fact_key: 'fact-structural', phase: 'proof', node: 'source', operation, segments: ['members'] };
        const fault = materializeTraceStructuralOmission(request);
        assert.equal(fault.stage, 'generated_trace_fault_only'); assert.equal(fault.mutation_acceptance, false);
        assert.deepEqual(fault.expected_violations, ['trace']);
        assert.equal(check(fault.trace).matched, false);
        const result = check(fault.trace);
        assert.equal(result.graph_accepted, false);
        assert.deepEqual(result.unclassified, []);
        assert.deepEqual(result.mismatches.map(row => row.dimension), ['structural']);
        assert.ok(result.mismatches[0].missing.some(row => row[1] === operation));
        assert.deepEqual(fault.trace.proof_trace.filter(row => row.operation === 'get').map(({ sequence, ...row }) => row),
            trace.proof_trace.filter(row => row.operation === 'get').map(({ sequence, ...row }) => row));
        assert.deepEqual(materializeTraceStructuralOmission(request), fault);
        assert.deepEqual(fault.trace.derivation_trace, trace.derivation_trace);
        assert.throws(() => materializeTraceStructuralOmission({ ...request, segments: ['other'] }), /mutation_inventory_trace_no_witness/);
    }
    const keyOpeningOnly = structuredClone(trace);
    keyOpeningOnly.proof_trace = keyOpeningOnly.proof_trace.filter(row => row.operation !== 'keys')
        .map((row, sequence) => ({ ...row, sequence }));
    assert.ok(check(keyOpeningOnly).unclassified.length > 0,
        'key views must not survive without their opening');
    assert.throws(() => materializeTraceStructuralOmission({ trace: keyOpeningOnly, fact_key: 'fact-structural',
        phase: 'proof', node: 'source', operation: 'keys', segments: [] }), /mutation_inventory_trace_no_witness/,
        'orphan views alone do not prove that the requested keys opening existed');
    const keyFault = materializeTraceStructuralOmission({ trace, fact_key: 'fact-structural',
        phase: 'proof', node: 'source', operation: 'keys', segments: [] });
    const keyResult = check(keyFault.trace);
    assert.equal(keyResult.matched, false); assert.deepEqual(keyResult.unclassified, []);
    assert.deepEqual(keyResult.mismatches.map(row => ({ dimension: row.dimension, missing: row.missing, extra: row.extra })),
        [{ dimension: 'structural', missing: [['source', 'keys', []]], extra: [] }]);
    assert.ok(!keyFault.trace.proof_trace.some(row => row.projection === 'keys'));
    const dataContent = rows => rows.filter(row => row.projection === 'data' && row.operation !== 'keys')
        .map(({ sequence, ...row }) => row);
    assert.deepEqual(dataContent(keyFault.trace.proof_trace), dataContent(trace.proof_trace));
    assert.deepEqual(trace, before);
});

test('N02G:MUTATION-GENERATOR-016 read omission removes only its immediately paired civil conversion', () => {
    const { createCausalRecorder } = require('../../../src/next/provenance/causalRecorder');
    const { createInstrumentedAccess } = require('../../../src/next/provenance/instrumentedAccess');
    const { comparePhaseCoverage } = require('../../../src/next/provenance/proofAcceptance');
    const recorder = createCausalRecorder({ executionId: 'civil-read-fault', maxEvents: 100 });
    const scope = recorder.open({ invocationId: 'fact-civil', phase: 'proof' });
    const access = createInstrumentedAccess({ bindings: [{ alias: 'clock', role: 'proof/snapshot',
        value: { instant: '2042-06-15T12:00:00Z', other_instant: '2042-06-16T12:00:00Z' },
        shape: { type: 'record', fields: { instant: { type: 'scalar' }, other_instant: { type: 'scalar' } } } }],
        links: [], emit: scope.observe });
    const clock = access.handle('clock');
    assert.equal(clock.civilDate('instant', 'America/Sao_Paulo', 'proleptic_gregorian'), '2042-06-15');
    assert.equal(clock.civilDate('other_instant', 'America/Sao_Paulo', 'proleptic_gregorian'), '2042-06-16');
    access.revoke(); access.assertHealthy(); scope.seal(); const trace = recorder.finish();
    const args = { executionId: 'civil-read-fault', invocationId: 'fact-civil', phase: 'proof', trace,
        expected: { required_nodes: ['clock'], required_reads: ['instant', 'other_instant'].map(name => ({ node: 'clock', segments: [name] })),
            required_edges: [], required_claim_reads: [], required_structural: [], required_selections: [], selected_nodes: [] },
        sets: {}, bindings: [], operandSets: [], accessBindings: [{ alias: 'clock', role: 'proof/snapshot', identity: null, records: [[]] }] };
    assert.equal(comparePhaseCoverage(args).matched, true);
    const anchorOnly = structuredClone(trace);
    anchorOnly.proof_trace = anchorOnly.proof_trace.filter(row => !(row.operation === 'get' && row.path[0] === 'instant'))
        .map((row, sequence) => ({ ...row, sequence }));
    assert.equal(comparePhaseCoverage({ ...args, trace: anchorOnly }).components.civil_dates.matched, false);
    const fault = materializeTraceReadOmission({ trace, fact_key: 'fact-civil', phase: 'proof', node: 'clock', segments: ['instant'] });
    const result = comparePhaseCoverage({ ...args, trace: fault.trace });
    assert.equal(result.matched, false); assert.equal(result.components.civil_dates.matched, true);
    assert.ok(result.event_coverage.every(row => row.status === 'covered'));
    for (const name of ['selection', 'operand_sets', 'access_metadata', 'measurements']) assert.equal(result.components[name].matched, true);
    assert.deepEqual(result.components.read_edges.mismatches.map(row => ({ dimension: row.dimension, missing: row.missing, extra: row.extra })),
        [{ dimension: 'reads', missing: [['clock', ['instant']]], extra: [] }]);
    assert.deepEqual(fault.removed_sequences, [0, 1]);
    assert.deepEqual(fault.trace.proof_trace.map(({ sequence, ...row }) => row), trace.proof_trace.slice(2).map(({ sequence, ...row }) => row));
    assert.deepEqual(fault.expected_violations, ['trace']);
});

test('N02G:MUTATION-GENERATOR-017 record read faults remove dependent views while preserving sibling reads', () => {
    const { createCausalRecorder } = require('../../../src/next/provenance/causalRecorder');
    const { createInstrumentedAccess } = require('../../../src/next/provenance/instrumentedAccess');
    const { comparePhaseCoverage } = require('../../../src/next/provenance/proofAcceptance');
    const recorder = createCausalRecorder({ executionId: 'record-read-fault', maxEvents: 100 });
    const scope = recorder.open({ invocationId: 'fact-record', phase: 'proof' });
    const access = createInstrumentedAccess({ bindings: [{ alias: 'source', role: 'proof/snapshot',
        value: { period: { value: '2042-06' }, sibling: 7 }, shape: { type: 'record', fields: {
            period: { type: 'record', fields: { value: { type: 'scalar' } } }, sibling: { type: 'scalar' } } } }],
        links: [], emit: scope.observe });
    const source = access.handle('source'); const period = source.get('period');
    assert.equal(period.get('value'), '2042-06'); assert.deepEqual([...period.keys()], ['value']);
    assert.equal(source.get('sibling'), 7);
    access.revoke(); access.assertHealthy(); scope.seal(); const trace = recorder.finish();
    const args = { executionId: 'record-read-fault', invocationId: 'fact-record', phase: 'proof', trace,
        expected: { required_nodes: ['source'], required_reads: [
            { node: 'source', segments: ['period'] }, { node: 'source', segments: ['period', 'value'] }, { node: 'source', segments: ['sibling'] }],
            required_edges: [], required_claim_reads: [], required_structural: [{ node: 'source', operation: 'keys', segments: ['period'] }],
            required_selections: [], selected_nodes: [] }, sets: {}, bindings: [], operandSets: [],
        accessBindings: [{ alias: 'source', role: 'proof/snapshot', identity: null, records: [[], ['period']] }] };
    assert.equal(comparePhaseCoverage(args).matched, true);
    const anchorOnly = structuredClone(trace);
    anchorOnly.proof_trace = anchorOnly.proof_trace.filter(row => !(row.operation === 'get' && row.path.length === 1 && row.path[0] === 'period'))
        .map((row, sequence) => ({ ...row, sequence }));
    assert.equal(comparePhaseCoverage({ ...args, trace: anchorOnly }).components.access_metadata.matched, false);
    const fault = materializeTraceReadOmission({ trace, fact_key: 'fact-record', phase: 'proof', node: 'source', segments: ['period'] });
    const result = comparePhaseCoverage({ ...args, trace: fault.trace });
    assert.equal(result.matched, false); assert.equal(result.components.access_metadata.matched, true);
    assert.ok(result.event_coverage.every(row => row.status === 'covered'));
    assert.ok(result.components.read_edges.mismatches.every(row => ['reads', 'structural'].includes(row.dimension)));
    assert.deepEqual(fault.trace.proof_trace.map(({ sequence, ...row }) => row),
        trace.proof_trace.filter(row => row.path[0] === 'sibling').map(({ sequence, ...row }) => row));
    assert.deepEqual(fault.expected_violations, ['trace']);
});

test('N02G:MUTATION-GENERATOR-010 expected version drift changes one identity pointer, not fingerprints or content', async t => {
    const input = await fixture();
    const graph = input.ir.graphs.find(row => Object.values(row.nodes).some(node => node.binding === 'snapshot'));
    const [alias] = Object.entries(graph.nodes).find(([, node]) => node.binding === 'snapshot');
    const request = { packageReceipt: mutationPackage, fact_key: graph.fact_key, alias };
    const generated = materializeExpectedVersionDrift(request);
    assert.deepEqual(materializeExpectedVersionDrift(request), generated);
    assert.equal(generated.stage, 'generated_expected_version_drift_only');
    assert.equal(generated.mutation_acceptance, false);
    assert.deepEqual(generated.expected_violations, ['identity']);
    const requirement = enumerateMutationRequirements(input).requirements.find(row => row.mutation_id === generated.mutation_id);
    assert.equal(requirement.family, 'node_strategy'); assert.equal(requirement.target.strategy, 'version');
    assert.deepEqual(requirement.target, generated.target);
    const before = mutationPackage.documents.find(row => row.path === prefix + 'graphs-v2.json').value;
    const expected = structuredClone(before);
    const node = expected.graphs.find(row => row.fact_key === graph.fact_key).nodes[alias];
    assert.equal(node.version, generated.patch.before);
    assert.match(generated.patch.after, /^sha256:[a-f0-9]{64}$/);
    assert.notEqual(generated.patch.after, generated.patch.before);
    node.version = generated.patch.after;
    assert.equal(generated.changes.length, 1);
    const change = generated.changes[0]; assert.equal(hash(change.source), change.sha256);
    const after = JSON.parse(change.source);
    assert.deepEqual(after, expected);
    const { buildSchemaValidators } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const validators = buildSchemaValidators().validators;
    assert.equal(validators.graphs(after), true);
    const entries = mutationEntries.map(row => ({ path: row.path,
        bytes: row.path === change.path ? Buffer.from(change.source) : Buffer.from(row.bytes) }));
    assert.throws(() => compileAuthoringIR(admitPackage({ entries,
        authority: entries.map(row => ({ path: row.path, sha256: hash(row.bytes) })) }), validators), /node_snapshot_mismatch_identity$/);
    assert.throws(() => materializeExpectedVersionDrift({ ...request, packageReceipt: { ...mutationPackage } }), /not_admitted/);
    assert.throws(() => materializeExpectedVersionDrift({ ...request, alias: '__proto__' }), /mutation_inventory_version_target/);
    const parent = input.ir.graphs.flatMap(row => Object.entries(row.nodes).filter(([, node]) => node.binding !== 'snapshot')
        .map(([alias]) => ({ fact_key: row.fact_key, alias })))[0];
    assert.ok(parent);
    assert.throws(() => materializeExpectedVersionDrift({ packageReceipt: mutationPackage, ...parent }), /mutation_inventory_version_target/);
    t.diagnostic('expected_version_drift_executed=1; schema_valid=true; other_source_content_unchanged=true; G11_complete=false');
});

test('N02G:MUTATION-BARRIER-CONTROL-001 native identity and fingerprint diagnostics do not credit an unexecuted atom', async t => {
    const input = await fixture();
    const corpus = mutationPackage.documents.find(row => row.path === prefix + 'graphs-v2.json').value;
    const manifest = mutationPackage.documents.find(row => row.path === corpus.snapshot_manifest.path).value;
    const baseline = structuredClone(corpus.graphs);
    const graph = baseline.find(row => Object.values(row.nodes).some(node => node.binding === 'snapshot'));
    const [alias] = Object.entries(graph.nodes).find(([, node]) => node.binding === 'snapshot');
    const node = graph.nodes[alias];
    const original = structuredClone(node);
    const inspect = () => validateStaticEvidence(baseline, manifest.snapshots, input.materialRegistry);
    assert.equal(inspect().graphs, 76);
    const fingerprintFault = materializeExpectedFingerprintDrift({ packageReceipt: mutationPackage,
        fact_key: graph.fact_key, alias });
    const identityFault = materializeExpectedVersionDrift({ packageReceipt: mutationPackage,
        fact_key: graph.fact_key, alias });
    node.semantic_fingerprint = fingerprintFault.patch.after;
    assert.throws(inspect, { message: 'graph_index_node_snapshot_mismatch_fingerprint' });
    node.version = identityFault.patch.after;
    assert.throws(inspect, { message: 'graph_index_node_snapshot_mismatch_identity' },
        'a missing identity must not fabricate fingerprint evidence');
    node.semantic_fingerprint = original.semantic_fingerprint;
    assert.throws(inspect, { message: 'graph_index_node_snapshot_mismatch_identity' });
    node.version = original.version;
    assert.equal(inspect().graphs, 76);
    assert.deepEqual(baseline, corpus.graphs, 'repairs restore the full baseline, not only the selected node');
    const malformedSnapshots = structuredClone(manifest.snapshots);
    malformedSnapshots[0].semantic_fingerprint = fingerprintFault.patch.after;
    assert.throws(() => validateStaticEvidence(baseline, malformedSnapshots, input.materialRegistry),
        { message: 'graph_index_snapshot_fingerprint' });
    assert.deepEqual(node, original);
    t.diagnostic('native_admission_diagnostics_only=true; unresolved_fingerprint_not_credited=true; dp_execution=false; G11_complete=false');
});

test('N02G:MUTATION-GENERATOR-011 month candidates bind to the exact predicate coordinate and reject active or forged input', async () => {
    const input = await fixture();
    const graph = input.ir.graphs.find(row => row.fact_key === 'M-01#1#1');
    const original = mutationPackage.documents.find(row => row.path === prefix + 'graphs-v2.json').value;
    const sourceGraph = original.graphs.find(row => row.fact_key === graph.fact_key);
    const predicate = sourceGraph.predicates.find(row => row.atom === 'period' && row.op === 'eq'
        && sourceGraph.nodes[row.args[0]?.field?.node]?.kind === 'source_state');
    const request = { packageReceipt: mutationPackage, fact_key: graph.fact_key, predicate_id: predicate.id };
    const actual = materializeMonthRelationMutation(request);
    assert.deepEqual(materializeMonthRelationMutation(request), actual);
    const requirement = enumerateMutationRequirements(input).requirements.find(row => row.mutation_id === actual.mutation_id);
    assert.equal(requirement.family, 'predicate_atom'); assert.deepEqual(requirement.target, actual.target);
    assert.equal(requirement.realization, 'UNSATISFIED_MUTATION_WITNESS');
    assert.equal(actual.mutation_acceptance, false); assert.deepEqual(actual.expected_violations, ['period']);
    assert.match(actual.patch.after, /^[0-9]{4}-(0[1-9]|1[0-2])$/);
    assert.notEqual(actual.patch.after, actual.patch.before);
    const after = JSON.parse(actual.changes.find(row => row.path === prefix + 'graphs-v2.json').source);
    for (let index = 0; index < original.graphs.length; index++) {
        const before = original.graphs[index]; const changed = after.graphs[index];
        for (const field of ['claim_id', 'fact_key', 'edges', 'sets', 'obligations', 'selections', 'trace_contract']) {
            assert.deepEqual(changed[field], before[field]);
        }
        assert.deepEqual(changed.predicates.filter(row => row.op !== 'fingerprint_is'),
            before.predicates.filter(row => row.op !== 'fingerprint_is'));
    }
    let effects = 0;
    const active = { ...request };
    Object.defineProperty(active, 'packageReceipt', { enumerable: true, get() { effects++; return mutationPackage; } });
    assert.throws(() => materializeMonthRelationMutation(active));
    assert.throws(() => materializeMonthRelationMutation(new Proxy(request, { ownKeys() { effects++; return []; } })));
    assert.equal(effects, 0);
    assert.throws(() => materializeMonthRelationMutation({ ...request, packageReceipt: { ...mutationPackage } }), /not_admitted/);
    assert.throws(() => materializeMonthRelationMutation({ ...request, predicate_id: 'missing' }), /mutation_inventory_month_target/);
    assert.throws(() => materializeMonthRelationMutation({ ...request, after: '2042-07' }), /mutation_inventory_input/);
});

test('N02G:MUTATION-GENERATOR-012 enum equality candidates use the normative domain and preserve the corpus contracts', async () => {
    const input = await fixture();
    const original = mutationPackage.documents.find(row => row.path === prefix + 'graphs-v2.json').value;
    const graph = original.graphs.find(row => row.fact_key === 'M-01#1#1');
    const predicate = graph.predicates.find(row => row.atom === 'coverage' && row.op === 'eq'
        && graph.nodes[row.args[0]?.field?.node]?.kind === 'source_state');
    assert.ok(predicate);
    const request = { packageReceipt: mutationPackage, fact_key: graph.fact_key, predicate_id: predicate.id };
    const generated = materializeEnumEqualityMutation(request);
    assert.deepEqual(materializeEnumEqualityMutation(request), generated);
    assert.equal(generated.mutation_acceptance, false);
    assert.deepEqual(generated.expected_violations, ['coverage']);
    assert.equal(generated.patch.before, predicate.args[1].literal.value);
    const descriptor = input.materialRegistry.kinds.source_state.fields[generated.patch.field];
    assert.ok(descriptor.values.includes(generated.patch.after));
    assert.notEqual(generated.patch.before, generated.patch.after);
    const requirement = enumerateMutationRequirements(input).requirements.find(row => row.mutation_id === generated.mutation_id);
    assert.equal(requirement.family, 'predicate_atom');
    assert.deepEqual(requirement.target, generated.target);
    assert.equal(requirement.realization, 'UNSATISFIED_MUTATION_WITNESS');
    assert.equal(generated.changes.length, 3);
    for (const change of generated.changes) assert.equal(hash(change.source), change.sha256);
    const after = JSON.parse(generated.changes.find(row => row.path === prefix + 'graphs-v2.json').source);
    for (let index = 0; index < original.graphs.length; index++) {
        for (const field of ['claim_id', 'fact_key', 'edges', 'sets', 'obligations', 'selections', 'trace_contract']) {
            assert.deepEqual(after.graphs[index][field], original.graphs[index][field]);
        }
        assert.deepEqual(after.graphs[index].predicates.filter(row => row.op !== 'fingerprint_is'),
            original.graphs[index].predicates.filter(row => row.op !== 'fingerprint_is'));
    }
    let effects = 0;
    const active = { ...request };
    Object.defineProperty(active, 'packageReceipt', { enumerable: true, get() { effects++; return mutationPackage; } });
    assert.throws(() => materializeEnumEqualityMutation(active));
    assert.throws(() => materializeEnumEqualityMutation(new Proxy(request, { ownKeys() { effects++; return []; } })));
    assert.equal(effects, 0);
    assert.throws(() => materializeEnumEqualityMutation({ ...request, packageReceipt: { ...mutationPackage } }), /not_admitted/);
    assert.throws(() => materializeEnumEqualityMutation({ ...request, predicate_id: 'missing' }), /mutation_inventory_enum_target/);
    const month = graph.predicates.find(row => row.atom === 'period' && row.op === 'eq'
        && graph.nodes[row.args[0]?.field?.node]?.kind === 'source_state');
    assert.throws(() => materializeEnumEqualityMutation({ ...request, predicate_id: month.id }), /mutation_inventory_enum_field/);
    assert.throws(() => materializeEnumEqualityMutation({ ...request, after: 'unavailable' }), /mutation_inventory_input/);
    const budgetGraph = original.graphs.find(row => row.fact_key === 'M-08#1#2');
    const budgetPredicate = budgetGraph.predicates.find(row => row.atom === 'evidence_state' && row.op === 'eq'
        && budgetGraph.nodes[row.args[0]?.field?.node]?.kind === 'budget');
    assert.deepEqual(input.materialRegistry.kinds.budget.fields.evidence_state.values, ['confirmed']);
    assert.throws(() => materializeEnumEqualityMutation({ packageReceipt: mutationPackage,
        fact_key: budgetGraph.fact_key, predicate_id: budgetPredicate.id }), /mutation_inventory_enum_alternative/);
});

test('N02G:MUTATION-GENERATOR-013 same-type trace substitutions preserve values and event counts without becoming evidence', async () => {
    const input = await fixture();
    const original = mutationPackage.documents.find(row => row.path === prefix + 'graphs-v2.json').value;
    const graph = original.graphs.find(row => row.fact_key === 'M-01#1#1');
    const read = graph.trace_contract.proof.required_reads.find(row => row.segments.join('.') === 'synthetic');
    assert.ok(read);
    const base = { invocation_id: graph.fact_key, phase: 'proof', alias: read.node,
        role: 'proof/snapshot', projection: 'data', operation: 'get', outcome: ['scalar', true] };
    const trace = { stage: 'observations_only', execution_id: 'trace-path-test', derivation_trace: [], proof_trace: [
        { ...base, sequence: 0, path: ['synthetic'] },
        { ...base, sequence: 1, path: ['closed_world'] },
        { ...base, sequence: 2, path: ['synthetic'] }
    ] };
    const request = { packageReceipt: mutationPackage, trace, fact_key: graph.fact_key,
        phase: 'proof', node: read.node, segments: read.segments };
    const before = structuredClone(trace);
    const { materializeTraceReadSubstitution } = require('../../../src/next/provenance/mutationWitnesses');
    const fault = materializeTraceReadSubstitution(request);
    assert.deepEqual(materializeTraceReadSubstitution(request), fault);
    assert.equal(fault.stage, 'generated_trace_fault_only');
    assert.equal(fault.mutation_acceptance, false);
    assert.deepEqual(fault.expected_violations, ['trace']);
    assert.deepEqual(fault.replaced_sequences, [0, 2]);
    assert.deepEqual(fault.patch, { node: read.node, before: ['synthetic'], after: ['closed_world'] });
    assert.deepEqual(fault.trace.proof_trace, before.proof_trace.map(row => ({ ...row, path: ['closed_world'] })));
    assert.deepEqual(trace, before);
    const requirement = enumerateMutationRequirements(input).requirements.find(row => row.mutation_id === fault.mutation_id);
    assert.equal(requirement.family, 'trace_strategy');
    assert.equal(requirement.target.strategy, 'same_type_wrong_path');
    assert.deepEqual(requirement.target, fault.target);
    assert.equal(requirement.realization, 'UNSATISFIED_MUTATION_WITNESS');
    assert.throws(() => materializeTraceReadSubstitution({ ...request, packageReceipt: { ...mutationPackage } }), /not_admitted/);
    assert.throws(() => materializeTraceReadSubstitution({ ...request, segments: ['missing'] }), /mutation_inventory_trace_path_target/);
    assert.throws(() => materializeTraceReadSubstitution({ ...request, node: 'claim/context' }), /mutation_inventory_trace_path_target/);
    assert.throws(() => materializeTraceReadSubstitution({ ...request, after: ['id'] }), /mutation_inventory_input/);
    const without = { ...trace, proof_trace: [before.proof_trace[1]].map(row => ({ ...row, sequence: 0 })) };
    assert.throws(() => materializeTraceReadSubstitution({ ...request, trace: without }), /mutation_inventory_trace_no_witness/);
    let effects = 0;
    const active = { ...request };
    Object.defineProperty(active, 'trace', { enumerable: true, get() { effects++; return trace; } });
    assert.throws(() => materializeTraceReadSubstitution(active));
    assert.throws(() => materializeTraceReadSubstitution(new Proxy(request, { ownKeys() { effects++; return []; } })));
    assert.equal(effects, 0);
});
