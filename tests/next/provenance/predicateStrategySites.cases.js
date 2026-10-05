'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const operator = { id: 'eq', args: ['scalar:T', 'scalar:T'], semantics: 'typed_equal' };
function input(id) {
    const type = { form: 'scalar', type: 'integer' };
    return { predicates: [{ id, operator, operands: [
        { type, expression: { kind: 'field_ref', alias: 'sample', segments: ['amount'] } },
        { type, expression: { kind: 'literal', value_type: 'integer', value: 7 } }
    ] }], windows: {}, selections: [{ candidate_set: 'candidates', selected_set: 'chosen', cases: [{
        node: 'sample', identity: { kind: 'expense', ref_id: 'sample-id', version: 'sha256:' + 'a'.repeat(64) },
        mode: 'include_if_all', predicates: [id]
    }] }] };
}

test('N02G:STRATEGY-SITES-001 assertion fault preserves selector copies and exact outside AST for generated IDs', async () => {
    const { buildScalarProofProgram, buildScalarAssertionFaultProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { verifyProofAssertionFault } = await import('../../../scripts/agent/verifyNextProofStrategySites.mjs');
    for (const id of ['p1', 'binding_7', 'identity.target:42', 'generated-name_937']) {
        const ir = input(id);
        const baseline = buildScalarProofProgram(ir);
        const negative = buildScalarAssertionFaultProgram(ir, id);
        const checked = verifyProofAssertionFault({ input: ir, baselineSource: baseline.source,
            negativeSource: negative.source, predicateId: id });
        assert.equal(checked.matched, true);
        assert.equal(checked.changed_sites, 1);
        assert.equal(checked.selection_sites_preserved, true);
        const execute = source => {
            const selections = []; const reads = [];
            const handle = { identity(field) { return { kind: 'expense', ref_id: 'sample-id', version: 'sha256:' + 'a'.repeat(64) }[field]; },
                get(field) { reads.push(field); return 7; } };
            const scope = { node: () => handle, select(a, b, predicate) { selections.push(predicate(handle, 0)); } };
            return { result: vm.runInNewContext(source)(scope), selections, reads };
        };
        assert.deepEqual(execute(baseline.source), { result: true, selections: [true], reads: ['amount', 'amount'] });
        assert.deepEqual(execute(negative.source), { result: false, selections: [true], reads: ['amount', 'amount'] });
    }
});

test('N02G:STRATEGY-SITES-002 independent conformance refuses absent, wrong, extra and selector faults', async () => {
    const { buildScalarProofProgram, buildScalarAssertionFaultProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { verifyProofAssertionFault } = await import('../../../scripts/agent/verifyNextProofStrategySites.mjs');
    const ir = input('p1'); const baseline = buildScalarProofProgram(ir);
    const negative = buildScalarAssertionFaultProgram(ir, 'p1');
    const request = { input: ir, baselineSource: baseline.source, negativeSource: negative.source, predicateId: 'p1' };
    assert.throws(() => verifyProofAssertionFault({ ...request, negativeSource: baseline.source }), /strategy_sites_/);
    assert.throws(() => verifyProofAssertionFault({ ...request, predicateId: 'p2' }), /strategy_sites_/);
    const global = structuredClone(ir); global.predicates[0].operator = { id: 'not_eq', args: operator.args, semantics: 'typed_unequal' };
    assert.throws(() => verifyProofAssertionFault({ ...request, negativeSource: buildScalarProofProgram(global).source }), /strategy_sites_/);
    assert.throws(() => verifyProofAssertionFault({ ...request, negativeSource: negative.source.replace('all = false;', 'all = true;') }), /strategy_sites_/);
    assert.throws(() => buildScalarAssertionFaultProgram(ir, 'absent'), /proof_program_/);
    assert.throws(() => buildScalarAssertionFaultProgram(ir, () => 'p1'), /proof_program_/);
});

test('N02G:STRATEGY-SITES-003 admitted authorship must preserve not_eq at every causal site even when B passes', async () => {
    const { buildScalarProofProgram, buildScalarAssertionFaultProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { sealAuthoredStrategyExpectation, verifyAuthoredStrategyCompile, verifyProofAssertionFault } =
        await import('../../../scripts/agent/verifyNextProofStrategySites.mjs');
    const ir = input('identity.target'); const baseline = buildScalarProofProgram(ir);
    const authored = { id: 'identity.target', op: 'eq', args: [
        { field: { node: 'sample', segments: ['amount'] } }, { literal: { type: 'integer', value: 7 } }
    ] };
    const expectation = sealAuthoredStrategyExpectation({ input: ir, baselineSource: baseline.source,
        predicateId: authored.id, authoredPredicate: authored });
    const mutant = structuredClone(ir);
    mutant.predicates[0].operator = { id: 'not_eq', args: operator.args, semantics: 'typed_unequal' };
    const compiled = buildScalarProofProgram(mutant);
    assert.equal(verifyAuthoredStrategyCompile({ expectation, compiledInput: mutant, compiledSource: compiled.source }).matched, true);
    assert.throws(() => verifyAuthoredStrategyCompile({ expectation, compiledInput: mutant, compiledSource: baseline.source }), /strategy_sites_/);
    assert.throws(() => verifyAuthoredStrategyCompile({ expectation, compiledInput: ir, compiledSource: baseline.source }), /strategy_sites_/);
    const b = buildScalarAssertionFaultProgram(ir, authored.id);
    assert.equal(verifyProofAssertionFault({ input: ir, baselineSource: baseline.source,
        negativeSource: b.source, predicateId: authored.id }).matched, true);
    assert.throws(() => verifyAuthoredStrategyCompile({ expectation: {}, compiledInput: mutant, compiledSource: compiled.source }), /strategy_sites_/);
    const swapped = structuredClone(mutant); swapped.predicates[0].operands[1].expression.value = 8;
    assert.throws(() => verifyAuthoredStrategyCompile({ expectation, compiledInput: swapped,
        compiledSource: buildScalarProofProgram(swapped).source }), /strategy_sites_/);
});

test('N02G:STRATEGY-SITES-005 presence references distinguish absent cells and preserve has lowering independently', async () => {
    const { buildScalarProofProgram, buildScalarAssertionFaultProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { sealEqualityStrategyReference, sealAuthoredStrategyExpectation, verifyAuthoredStrategyCompile,
        verifyProofAssertionFault } = await import('../../../scripts/agent/verifyNextProofStrategySites.mjs');
    const id = 'absence.target'; const ir = input(id);
    ir.predicates[0].operands = [
        { type: { form: 'scalar', type: 'boolean' }, expression: { kind: 'field_presence',
            field: { kind: 'field_ref', alias: 'sample', segments: ['nested', 'account_id'] } } },
        { type: { form: 'scalar', type: 'boolean' }, expression: { kind: 'literal', value_type: 'boolean', value: false } }
    ];
    const authored = { id, op: 'eq', args: [{ presence: { node: 'sample', segments: ['nested', 'account_id'] } },
        { literal: { type: 'boolean', value: false } }] };
    const snapshot = { kind: 'expense', ref_id: 'sample-id', version: 'v1', payload: { nested: {} } };
    const graph = { predicates: [authored], nodes: { sample: { binding: 'snapshot',
        kind: snapshot.kind, ref_id: snapshot.ref_id, version: snapshot.version } } };
    const reference = sealEqualityStrategyReference({ graph, claim: {}, snapshots: [snapshot], predicateId: id });
    assert.equal(reference.baseline_satisfied, true);
    assert.equal(reference.mutant_satisfied, false);
    const present = structuredClone(snapshot); present.payload.nested.account_id = null;
    assert.throws(() => sealEqualityStrategyReference({ graph, claim: {}, snapshots: [present], predicateId: id }), /reference_not_discriminant/);
    const missingParent = structuredClone(snapshot); delete missingParent.payload.nested;
    assert.throws(() => sealEqualityStrategyReference({ graph, claim: {}, snapshots: [missingParent], predicateId: id }), /reference_path/);
    const baseline = buildScalarProofProgram(ir); const negative = buildScalarAssertionFaultProgram(ir, id);
    assert.equal(verifyProofAssertionFault({ input: ir, baselineSource: baseline.source,
        negativeSource: negative.source, predicateId: id }).matched, true);
    const expectation = sealAuthoredStrategyExpectation({ input: ir, baselineSource: baseline.source,
        predicateId: id, authoredPredicate: authored });
    const mutant = structuredClone(ir);
    mutant.predicates[0].operator = { id: 'not_eq', args: operator.args, semantics: 'typed_unequal' };
    assert.equal(verifyAuthoredStrategyCompile({ expectation, compiledInput: mutant,
        compiledSource: buildScalarProofProgram(mutant).source }).matched, true);
    assert.throws(() => verifyProofAssertionFault({ input: ir, baselineSource: baseline.source,
        negativeSource: negative.source.replaceAll('.has("account_id")', '.get("account_id")'), predicateId: id }), /strategy_sites_/);
});

test('N02G:STRATEGY-SITES-004 negative root cannot be admitted under the positive financial freeze', async () => {
    const { buildScalarProofProgram, buildScalarAssertionFaultProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { admitExecutionFreeze, admitFrozenArtifact } = require('../../../src/next/provenance/freezeContract');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
    const baseline = buildScalarProofProgram(input('identity.target'));
    const negative = buildScalarAssertionFaultProgram(input('identity.target'), 'identity.target');
    const artefact = built => {
        const bytes = Buffer.from(built.source);
        const manifestBytes = Buffer.from(canonicalValue({ format: 'financasbot.provenance.artifact', version: 1,
            kind: 'proof', entry: 'bundle.js', files: [{ path: 'bundle.js', media_type: 'text/javascript', sha256: hash(bytes) }] }));
        return { manifestBytes, entries: [{ path: 'bundle.js', bytes }] };
    };
    const positive = artefact(baseline); const mutant = artefact(negative);
    const h = n => 'sha256:' + String(n).padStart(64, '0');
    const value = { schema_version: 1, freeze_id: 'provenance_execution', freeze_version: 1, stage: 'execution',
        metric_registry_hash: h(1), validation_tcb_root: h(2), child_capsule_root: h(3),
        native_runtime: { platform: 'win32', arch: 'x64', node_version: 'v22.17.0', node_binary_sha256: h(4) },
        package_authority: [{ path: 'docs/graph.json', sha256: h(5) }],
        proof_programs: [{ program_id: h(6), proof_engine_artifact_root: hash(positive.manifestBytes) }] };
    const bytes = Buffer.from(canonicalValue(value));
    const freezeReceipt = admitExecutionFreeze({ bytes, expectedHash: hash(bytes) });
    const selector = { freezeReceipt, kind: 'proof', programId: h(6) };
    assert.equal(admitFrozenArtifact({ ...selector, ...positive }).observed_root, hash(positive.manifestBytes));
    assert.notEqual(hash(mutant.manifestBytes), hash(positive.manifestBytes));
    assert.throws(() => admitFrozenArtifact({ ...selector, ...mutant }), /artifact_root_mismatch/);
    assert.equal(negative.negative_witness_only, true);
    assert.equal(negative.executable, false);
});
