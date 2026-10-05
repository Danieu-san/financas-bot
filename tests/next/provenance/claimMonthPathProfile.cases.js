'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateClaimRequirements, validateQualificationClaimRequirements } = require('../../../src/next/provenance/claimRequirements');
const profile = () => require('../../../src/next/provenance/claimMonthPathProfile');
const read = file => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8'));
const { createHash } = require('node:crypto');
let compiledFixture;
let capturedFixture;
async function capturedMonthFixture() {
    if (capturedFixture) return capturedFixture;
    const { buildCapturedValidationTools } = await import('../../../scripts/agent/buildNextValidationTcb.mjs');
    const tcb = buildCapturedValidationTools(); const vm = require('node:vm');
    const source = tcb.entries.find(row => row.path === 'host-bootstrap.js').source;
    const tools = vm.runInThisContext(`(function(require){return ${source}\n})`)(specifier => {
        assert.ok(tcb.nativeExternals.includes(specifier)); return require(specifier);
    });
    const f = await compilerFixture();
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const documents = admittedDocuments(f.packageReceipt);
    const entries = documents.map(row => ({ path: row.path, bytes: Buffer.from(fs.readFileSync(path.resolve(__dirname, '../../..', row.path), 'utf8').replaceAll('\r\n', '\n')) }));
    const authority = documents.map(row => ({ path: row.path, sha256: row.sha256 })).sort((a, b) => a.path < b.path ? -1 : 1);
    const packageReceipt = tools.admitPackage({ entries, authority });
    const registry = documents.find(row => row.value.registry_id === 'metric_evaluator_registry').value;
    const { PROFILE_PATH } = require('../../../src/next/provenance/phaseCompositionProfile');
    const profileSource = fs.readFileSync(path.resolve(__dirname, '../../..', PROFILE_PATH), 'utf8').replaceAll('\r\n', '\n');
    const phase = tools.admitPhaseCompositionProfile({ registry, source: profileSource });
    const ambientPhase = require('../../../src/next/provenance/phaseCompositionProfile').admitPhaseCompositionProfile({ registry, source: profileSource });
    capturedFixture = { tcb, tools, f, documents, entries, authority, packageReceipt, registry, phase, ambientPhase };
    return capturedFixture;
}
async function compilerFixture() {
    if (compiledFixture) return compiledFixture;
    const { loadLocalAuthoringPackage } = await import('../../../scripts/agent/executeNextDomainInvariantMatrix.mjs');
    const { buildAdmittedSchemaValidators } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const packageReceipt = loadLocalAuthoringPackage();
    compiledFixture = { packageReceipt, validators: buildAdmittedSchemaValidators(packageReceipt).validators };
    return compiledFixture;
}
function mutantPackage(packageReceipt, preparation, alter = () => {}, admit = null) {
    const { admitPackage, admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const entries = admittedDocuments(packageReceipt).map(row => {
        let bytes;
        if (row.path.endsWith('/graphs-v2.json')) {
            const value = structuredClone(row.value); value.graphs = structuredClone(preparation.transport.mutant_graphs);
            alter(value); bytes = Buffer.from(JSON.stringify(value));
        } else bytes = Buffer.from(fs.readFileSync(path.resolve(__dirname, '../../..', row.path), 'utf8').replaceAll('\r\n', '\n'));
        return { path: row.path, bytes };
    });
    return (admit ?? admitPackage)({ entries, authority: entries.map(row => ({ path: row.path,
        sha256: 'sha256:' + createHash('sha256').update(row.bytes).digest('hex') })) });
}
function fixture() {
    const corpus = read('docs/contracts/next/provenance-v2/graphs-v2.json');
    const claims = read(corpus.claim_contract.path).claims;
    return { graphs: [corpus.graphs.find(g => g.fact_key === 'M-01#1#1')],
        claims: [claims.find(c => c.fact_key === 'M-01#1#1')],
        fact_key: 'M-01#1#1', predicate_id: 'binding_1' };
}

test('N02G:MONTH-PROFILE-001 named locator transport cannot grant a period-checker or execution PASS', () => {
    const f = fixture();
    const ticket = profile().prepareClaimMonthPathTransport(f);
    assert.equal(ticket.profile, 'claim-month-path-completion/v1');
    assert.deepEqual(ticket.subobligation, { name: 'claim.period.binding_locator',
        fact_key: f.fact_key, predicate_id: f.predicate_id, operand_index: 0 });
    assert.equal(ticket.profile_witness_qualified, false);
    assert.equal(ticket.financial_release_eligible, false);
    assert.equal(ticket.dp_execution, false);
    assert.equal(ticket.sidecar.qualification.alternative_period.value, '2042-07');
    assert.throws(() => validateClaimRequirements({ graphs: ticket.mutant_graphs, claims: f.claims }), /claim_requirements_missing/);
    const result = validateQualificationClaimRequirements({ graphs: ticket.mutant_graphs, claims: f.claims, transport: ticket });
    assert.deepEqual(result.transported_subobligations, [ticket.subobligation]);
    assert.equal(result.stage, 'claim_requirements_qualification_checked_only');
    assert.deepEqual(f.claims[0].period, { kind: 'month', value: '2042-06' });
});

test('N02G:MONTH-PROFILE-014 local scope entry refuses active inputs before any qualification work', async () => {
    const { executeClaimMonthProfileScope } = await import('../../../scripts/agent/executeClaimMonthProfileScope.mjs');
    let effects = 0;
    const active = Object.defineProperty({ predicate_id: 'binding_1' }, 'fact_key', {
        enumerable: true, get() { effects++; throw new Error('getter_executed'); } });
    await assert.rejects(executeClaimMonthProfileScope(active));
    await assert.rejects(executeClaimMonthProfileScope(new Proxy({}, { ownKeys() { effects++; return []; } })));
    await assert.rejects(executeClaimMonthProfileScope({ fact_key: 'M-01#1#1', predicate_id: 'binding_1', expected: true }), /claim_month_scope_target/);
    assert.equal(effects, 0);
});

test('N02G:MONTH-PROFILE-015 differential core is exact, never a set/count comparison', async () => {
    const { compareClaimMonthControlCore } = await import('../../../scripts/agent/executeClaimMonthProfileScope.mjs');
    const make = variant => ({ variant, trace: {
        derivation_trace: [{ sequence: 0, invocation_id: variant, phase: 'derivation', operation: 'get', path: ['amount'], outcome: ['scalar', 7] }],
        proof_trace: [{ sequence: 1, invocation_id: variant, phase: 'proof', measurement: 'proof_engine_artifact_root', observed: variant }]
    }, proof_site_reads: [
        { phase: 'proof', origin: 'original', site: 'other', event: ['first'] },
        { phase: 'proof', origin: 'original', site: 'other', event: ['second'] },
        { phase: 'proof', origin: variant === 'M' ? 'qualification' : 'original', site: 'binding_1', event: [variant] }
    ] });
    const controls = ['C', 'M', 'S'].map(make);
    assert.equal(compareClaimMonthControlCore(controls, 'binding_1').matched, true);
    for (const alter of [
        rows => rows[1].proof_site_reads.splice(1, 0, structuredClone(rows[1].proof_site_reads[0])),
        rows => rows[1].proof_site_reads.reverse(),
        rows => { rows[1].proof_site_reads[0].site = 'another'; },
        rows => { rows[1].trace.derivation_trace[0].outcome[1] = 8; },
        rows => rows[1].trace.proof_trace.push({ sequence: 2, invocation_id: 'M', phase: 'proof', measurement: 'validation_tcb_root', observed: 'changed' })
    ]) {
        const changed = structuredClone(controls); alter(changed);
        assert.equal(compareClaimMonthControlCore(changed, 'binding_1').matched, false);
    }
    assert.throws(() => compareClaimMonthControlCore(controls.slice(1), 'binding_1'), /claim_month_scope_core_controls/);
    const large = structuredClone(controls);
    for (const row of large) row.proof_site_reads = Array.from({ length: 4000 }, () => structuredClone(row.proof_site_reads[0]));
    assert.equal(compareClaimMonthControlCore(large, 'binding_1').matched, true,
        'three individually bounded traces must not be merged into one transport admission');
    let effects = 0;
    const active = [...controls]; Object.defineProperty(active, '1', { enumerable: true, get() { effects++; throw new Error('getter_executed'); } });
    assert.throws(() => compareClaimMonthControlCore(active, 'binding_1'));
    assert.throws(() => compareClaimMonthControlCore(new Proxy(controls, { ownKeys() { effects++; return []; } }), 'binding_1'));
    assert.equal(effects, 0);
});

test('N02G:MONTH-PROFILE-013 frozen qualification refuses unbound roots and measures the original authority', async () => {
    const f = await capturedMonthFixture(); const { tools } = f;
    assert.equal(typeof tools.admitClaimMonthFrozenBaseline, 'function');
    const { buildPhaseProofProgram, buildClaimMonthPhaseProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { buildAvailableMetricArtifacts, buildExecutionRegistryCandidate } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const { proofProgramIdentity } = require('../../../src/next/provenance/phaseProgramIdentity');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
    const selector = { fact_key: 'M-01#1#1' }; const claim = fixture().claims[0];
    const positiveOracle = read('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json').turns['M-01#1'].facts[0].value;
    const accessC = tools.compileSnapshotAccess(f.packageReceipt);
    const positiveInput = { derivation: accessC.projectDerivationProgram(selector, f.phase).input,
        proof: accessC.projectProofProgram(selector).input };
    const positive = buildPhaseProofProgram(positiveInput, f.ambientPhase);
    const registry = buildExecutionRegistryCandidate();
    const registryReceipt = tools.admitExecutionRegistry({ bytes: Buffer.from(registry.bytes), expectedHash: registry.registry_hash });
    // Synthetic TEST authority, sealed before M. Never a published/reviewed
    // product freeze, acceptance receipt or permission to activate this WIP.
    const freeze = { schema_version: 1, freeze_id: 'provenance_execution', freeze_version: 1, stage: 'execution',
        metric_registry_hash: registry.registry_hash, validation_tcb_root: f.tcb.artifact_root,
        child_capsule_root: f.tcb.child.artifact_root, package_authority: f.authority,
        native_runtime: { platform: process.platform, arch: process.arch, node_version: process.version,
            node_binary_sha256: hash(fs.readFileSync(process.execPath)) },
        proof_programs: [{ program_id: proofProgramIdentity(positiveInput.proof, positiveInput.derivation,
            tools.phaseCompositionCommitment(f.phase).sha256), proof_engine_artifact_root: positive.artifact_root }] };
    const freezeBytes = Buffer.from(canonicalValue(freeze));
    const freezeReceipt = tools.admitExecutionFreeze({ bytes: freezeBytes, expectedHash: hash(freezeBytes) });
    const positiveReceipt = tools.admitFrozenArtifact({ freezeReceipt, kind: 'proof', programId: freeze.proof_programs[0].program_id,
        manifestBytes: Buffer.from(positive.manifest), entries: [{ path: 'bundle.js', bytes: Buffer.from(positive.source) },
            { path: positive.profileInput.path, bytes: Buffer.from(positive.profileInput.source) }] });
    const tcbArtifactReceipt = tools.admitFrozenArtifact({ freezeReceipt, kind: 'tcb', programId: null,
        manifestBytes: Buffer.from(f.tcb.manifest), entries: f.tcb.entries.map(row => ({ path: row.path, bytes: Buffer.from(row.source) })) });
    const child = f.tcb.child;
    const childCapsuleReceipt = tools.admitFrozenArtifact({ freezeReceipt, kind: 'child', programId: null,
        manifestBytes: Buffer.from(child.manifest), entries: [{ path: 'bootstrap.js', bytes: Buffer.from(child.source) }] });
    const nativeRuntimeReceipt = tools.verifyNativeRuntime(freezeReceipt);
    const authorEntry = f.registry.entries.find(row => row.evaluator_id === claim.evaluator_ref.evaluator_id);
    const evaluatorContractReceipt = tools.admitExecutionContract({ registryReceipt, evaluatorRef: claim.evaluator_ref,
        bytes: f.entries.find(row => row.path === authorEntry.contract_path).bytes });
    const metric = buildAvailableMetricArtifacts().built.find(row => row.evaluator_id === claim.evaluator_ref.evaluator_id);
    const metricReceipt = tools.admitArtifact({ manifestBytes: Buffer.from(metric.manifest), expectedRoot: metric.artifact_root,
        entries: [{ path: 'bundle.js', bytes: Buffer.from(metric.source) }] });
    const positiveTransport = accessC.projectMetricTransport(selector);
    const normal = await tools.runAdmittedGraph({ executionId: 'frozen-month-positive', invocationId: 'frozen-month-M01-positive',
        timeoutMs: 5000, childCapsuleReceipt, tcbArtifactReceipt, nativeRuntimeReceipt, evaluatorContractReceipt,
        derivation: { artifactReceipt: metricReceipt, bindings: [], directGroups: positiveTransport.directGroups,
            nodeSets: positiveTransport.nodeSets, parentGroups: positiveTransport.parentGroups,
            derivationBindings: accessC.projectDerivationBindings(selector) },
        proof: { artifactReceipt: positiveReceipt, ...accessC.projectProofTransport(selector).config } });
    assert.equal(normal.functional_result.value, positiveOracle); assert.equal(normal.functional_result.unit, claim.unit);
    assert.equal(normal.functional_result.kind, 'money_minor'); assert.equal(normal.proof_satisfied, true);
    assert.equal(normal.observed_validation_tcb_root, freeze.validation_tcb_root);
    assert.equal(normal.observed_evaluator_contract_hash, authorEntry.evaluator_contract_hash);
    const prep = tools.prepareClaimMonthQualification(f.packageReceipt, { ...selector, predicate_id: 'binding_1' });
    const mutant = mutantPackage(f.f.packageReceipt, prep, () => {}, tools.admitPackage);
    const compilation = tools.compileClaimMonthQualificationIR(mutant, prep, 'M');
    const plan = tools.prepareClaimMonthIsolatedPlan(compilation);
    const bindingArgs = { phaseProfileReceipt: f.phase, freezeReceipt, registryReceipt, artifactReceipt: positiveReceipt };
    assert.throws(() => tools.admitClaimMonthFrozenBaseline(plan, { ...bindingArgs, freezeReceipt: structuredClone(freezeReceipt) }), /execution_freeze_not_admitted/);
    let registryGetter = false;
    const falseRegistry = Object.defineProperty({}, 'observed_hash', { get() { registryGetter = true; throw new Error('getter_executed'); } });
    assert.throws(() => tools.admitClaimMonthFrozenBaseline(plan, { ...bindingArgs, registryReceipt: falseRegistry }), /execution_registry_/);
    assert.equal(registryGetter, false);
    const baselineReceipt = tools.admitClaimMonthFrozenBaseline(plan, bindingArgs);
    const access = tools.compileClaimMonthQualificationAccess(compilation);
    const input = { derivation: access.projectDerivationProgram(selector, f.phase).input,
        proof: access.projectProofProgram(selector).input };
    assert.throws(() => buildClaimMonthPhaseProofProgram(input, f.phase, plan, tools, structuredClone(baselineReceipt)), /month_frozen_authority/);
    const build = () => buildClaimMonthPhaseProofProgram(input, f.phase, plan, tools, baselineReceipt);
    const transport = access.projectMetricTransport(selector);
    const raw = built => ({ executionId: 'frozen-month-M', invocationId: 'frozen-month-M01', timeoutMs: 5000,
        childCapsuleReceipt, tcbArtifactReceipt, nativeRuntimeReceipt, evaluatorContractReceipt,
        derivation: { artifactReceipt: metricReceipt, bindings: [], directGroups: transport.directGroups,
            nodeSets: transport.nodeSets, parentGroups: transport.parentGroups, derivationBindings: access.projectDerivationBindings(selector) },
        proof: { artifactReceipt: built.artifactReceipt, ...access.projectProofTransport(selector).config } });
    const unbound = build(); const missingAuthority = raw(unbound); delete missingAuthority.tcbArtifactReceipt;
    await assert.rejects(tools.runClaimMonthQualifiedGraph(missingAuthority, unbound.isolatedProofReceipt), /host_qualification_frozen_authority/);
    const forged = build(); let nativeGetter = false;
    const falseNative = Object.defineProperty({}, 'observed_sha256', { get() { nativeGetter = true; throw new Error('getter_executed'); } });
    await assert.rejects(tools.runClaimMonthQualifiedGraph({ ...raw(forged), nativeRuntimeReceipt: falseNative }, forged.isolatedProofReceipt), /native_runtime_not_admitted/);
    assert.equal(nativeGetter, false);
    const outputs = [];
    for (const variant of ['C', 'M', 'S']) {
        const variantCompilation = tools.compileClaimMonthQualificationIR(variant === 'M' ? mutant : f.packageReceipt, prep, variant);
        const variantPlan = tools.prepareClaimMonthIsolatedPlan(variantCompilation);
        const variantBaseline = tools.admitClaimMonthFrozenBaseline(variantPlan, bindingArgs);
        const variantAccess = tools.compileClaimMonthQualificationAccess(variantCompilation);
        const built = buildClaimMonthPhaseProofProgram({ derivation: variantAccess.projectDerivationProgram(selector, f.phase).input,
            proof: variantAccess.projectProofProgram(selector).input }, f.phase, variantPlan, tools, variantBaseline);
        assert.equal(built.isolatedProofReceipt.positive_baseline_frozen, true);
        assert.notEqual(built.artifact_root, positive.artifact_root);
        const expected = tools.sealClaimMonthTargetTrace(built.qualificationInput.source);
        const variantTransport = variantAccess.projectMetricTransport(selector);
        const invocation = { ...raw(built), executionId: `frozen-month-${variant}`, invocationId: `frozen-month-M01-${variant}`,
            derivation: { artifactReceipt: metricReceipt, bindings: [], directGroups: variantTransport.directGroups,
                nodeSets: variantTransport.nodeSets, parentGroups: variantTransport.parentGroups,
                derivationBindings: variantAccess.projectDerivationBindings(selector) },
            proof: { artifactReceipt: built.artifactReceipt, ...variantAccess.projectProofTransport(selector).config } };
        const graph = fixture().graphs[0]; const coverage = {};
        for (const phase of ['derivation', 'proof']) {
            const { evidence_set_mode, ...phaseExpected } = graph.trace_contract[phase];
            const isProof = phase === 'proof'; const config = invocation.proof;
            coverage[phase] = { expected: phaseExpected, sets: graph.sets,
                bindings: isProof ? config.proofSelections.map(row => ({ role: `proof/set/${row.candidate_set}`,
                    candidate_set: row.candidate_set, selected_set: row.selected_set }))
                    : phaseExpected.required_selections.map(selection => {
                        const roles = Object.entries(claim.operand_bindings).filter(([, binding]) => binding.kind === 'node_set'
                            && JSON.stringify(binding.aliases) === JSON.stringify(graph.sets[selection.candidate_set]));
                        assert.equal(roles.length, 1); return { role: roles[0][0], ...selection };
                    }),
                operandSets: isProof ? config.proofSets.map(row => ({ role: `proof/set/${row.name}`, aliases: row.roster }))
                    : Object.entries(claim.operand_bindings).filter(([, binding]) => binding.kind === 'node_set')
                        .map(([role, binding]) => ({ role, aliases: binding.aliases })),
                accessBindings: variantAccess.observationMetadata({ fact_key: selector.fact_key, phase }),
                measurements: [{ measurement: 'validation_tcb_root', observed: freeze.validation_tcb_root },
                    { measurement: 'proof_engine_artifact_root', observed: built.artifact_root },
                    ...(!isProof ? [{ measurement: 'evaluator_artifact_root', observed: metric.artifact_root },
                        { measurement: 'evaluator_contract_hash', observed: authorEntry.evaluator_contract_hash }] : [])] };
        }
        // Both manifests are sealed from authored contracts and frozen roots,
        // before any C/M/S runtime observation exists.
        const coreExpected = tools.sealClaimMonthCoreTrace(expected, coverage);
        const observed = await tools.runClaimMonthQualifiedGraph(invocation, built.isolatedProofReceipt);
        assert.equal(observed.functional_result.value, positiveOracle); assert.equal(observed.functional_result.unit, claim.unit);
        assert.equal(observed.functional_result.kind, 'money_minor'); assert.equal(observed.proof_satisfied, variant !== 'M');
        assert.deepEqual(observed.proof_site_results.filter(row => !row.satisfied).map(row => row.site), variant === 'M' ? ['binding_1'] : []);
        assert.equal(observed.positive_baseline_frozen, true); assert.equal(observed.positive_freeze_hash, hash(freezeBytes));
        assert.equal(observed.observed_validation_tcb_root, freeze.validation_tcb_root);
        assert.equal(observed.observed_evaluator_contract_hash, authorEntry.evaluator_contract_hash);
        const targetTrace = { profile_hash: observed.qualification_profile_hash, proof_satisfied: observed.proof_satisfied,
            proof_site_results: observed.proof_site_results, proof_site_reads: observed.proof_site_reads,
            qualification_observations: observed.qualification_observations };
        assert.equal(tools.compareClaimMonthTargetTrace(expected, targetTrace).fringe_trace_matched, true);
        const coreChecked = tools.compareClaimMonthCoreTrace(coreExpected, { executionId: invocation.executionId,
            invocationId: invocation.invocationId, trace: observed.trace, targetTrace });
        assert.equal(coreChecked.core_trace_matched, true, JSON.stringify({ d: coreChecked.derivation, p: coreChecked.proof }));
        assert.equal(coreChecked.profile_witness_qualified, false);
        assert.equal(observed.profile_witness_qualified, false); assert.equal(observed.financial_release_eligible, false);
        assert.equal(observed.receipt_created, false);
        outputs.push({ variant, observed });
    }
    const operations = trace => trace.filter(row => row.operation).map(row => [row.operation, row.alias, row.role, row.path, row.projection, row.outcome]);
    assert.deepEqual(operations(outputs[0].observed.trace.derivation_trace), operations(normal.trace.derivation_trace));
    for (const output of outputs.slice(1)) {
        assert.deepEqual(operations(output.observed.trace.derivation_trace), operations(outputs[0].observed.trace.derivation_trace));
        assert.deepEqual(output.observed.proof_site_reads.filter(row => row.site !== 'binding_1'),
            outputs[0].observed.proof_site_reads.filter(row => row.site !== 'binding_1'));
    }
});

test('N02G:MONTH-PROFILE-012 captured profile capabilities never route to ambient receipt tables', async () => {
    const { buildCapturedValidationTools } = await import('../../../scripts/agent/buildNextValidationTcb.mjs');
    const builtTcb = buildCapturedValidationTools();
    const vm = require('node:vm');
    const source = builtTcb.entries.find(row => row.path === 'host-bootstrap.js').source;
    const tools = vm.runInThisContext(`(function(require){return ${source}\n})`)(specifier => {
        assert.ok(builtTcb.nativeExternals.includes(specifier)); return require(specifier);
    });
    assert.equal(typeof tools.prepareClaimMonthQualification, 'function');
    assert.notEqual(tools.runClaimMonthQualifiedGraph, require('../../../src/next/provenance/executionHost').runClaimMonthQualifiedGraph);
    const f = await compilerFixture();
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const documents = admittedDocuments(f.packageReceipt);
    const entries = documents.map(row => ({ path: row.path, bytes: Buffer.from(fs.readFileSync(path.resolve(__dirname, '../../..', row.path), 'utf8').replaceAll('\r\n', '\n')) }));
    const packageReceipt = tools.admitPackage({ entries, authority: documents.map(row => ({ path: row.path, sha256: row.sha256 })) });
    const registry = documents.find(row => row.value.registry_id === 'metric_evaluator_registry').value;
    const { PROFILE_PATH } = require('../../../src/next/provenance/phaseCompositionProfile');
    const phase = tools.admitPhaseCompositionProfile({ registry,
        source: fs.readFileSync(path.resolve(__dirname, '../../..', PROFILE_PATH), 'utf8').replaceAll('\r\n', '\n') });
    const prep = tools.prepareClaimMonthQualification(packageReceipt, { fact_key: 'M-01#1#1', predicate_id: 'binding_1' });
    const mutated = mutantPackage(f.packageReceipt, prep, () => {}, tools.admitPackage);
    const compilation = tools.compileClaimMonthQualificationIR(mutated, prep, 'M');
    const plan = tools.prepareClaimMonthIsolatedPlan(compilation);
    const access = tools.compileClaimMonthQualificationAccess(compilation); const selector = { fact_key: 'M-01#1#1' };
    const { buildClaimMonthPhaseProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const built = buildClaimMonthPhaseProofProgram({ derivation: access.projectDerivationProgram(selector, phase).input,
        proof: access.projectProofProgram(selector).input }, phase, plan, tools);
    const { buildAvailableMetricArtifacts } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const claim = fixture().claims[0];
    const positiveOracle = read('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json').turns['M-01#1'].facts[0].value;
    const metric = buildAvailableMetricArtifacts().built.find(row => row.evaluator_id === claim.evaluator_ref.evaluator_id);
    const metricReceipt = tools.admitArtifact({ manifestBytes: Buffer.from(metric.manifest), expectedRoot: metric.artifact_root,
        entries: [{ path: 'bundle.js', bytes: Buffer.from(metric.source) }] });
    const child = builtTcb.child;
    const childReceipt = tools.admitArtifact({ manifestBytes: Buffer.from(child.manifest), expectedRoot: child.artifact_root,
        entries: [{ path: 'bootstrap.js', bytes: Buffer.from(child.source) }] });
    const transport = access.projectMetricTransport(selector);
    const raw = { executionId: 'captured-month-M', invocationId: 'captured-month-M01', timeoutMs: 5000,
        childCapsuleReceipt: childReceipt,
        derivation: { artifactReceipt: metricReceipt, bindings: [], directGroups: transport.directGroups,
            nodeSets: transport.nodeSets, parentGroups: transport.parentGroups, derivationBindings: access.projectDerivationBindings(selector) },
        proof: { artifactReceipt: built.artifactReceipt, ...access.projectProofTransport(selector).config } };
    const expected = tools.sealClaimMonthTargetTrace(built.qualificationInput.source);
    await assert.rejects(require('../../../src/next/provenance/executionHost').runClaimMonthQualifiedGraph(raw, built.isolatedProofReceipt), /month_qualification_authority/);
    const observed = await tools.runClaimMonthQualifiedGraph(raw, built.isolatedProofReceipt);
    assert.equal(observed.functional_result.value, positiveOracle);
    assert.equal(observed.functional_result.unit, claim.unit);
    assert.equal(observed.functional_result.kind, 'money_minor');
    assert.equal(observed.proof_satisfied, false);
    assert.deepEqual(observed.proof_site_results.filter(row => !row.satisfied).map(row => row.site), ['binding_1']);
    assert.equal(tools.compareClaimMonthTargetTrace(expected, { profile_hash: observed.qualification_profile_hash,
        proof_satisfied: observed.proof_satisfied, proof_site_results: observed.proof_site_results,
        proof_site_reads: observed.proof_site_reads, qualification_observations: observed.qualification_observations }).fringe_trace_matched, true);
    assert.equal(observed.profile_witness_qualified, false); assert.equal(observed.receipt_created, false);
});

test('N02G:MONTH-PROFILE-002 forged, cloned and cross-world tickets cannot tolerate a missing binding', () => {
    const f = fixture(); const ticket = profile().prepareClaimMonthPathTransport(f);
    for (const transport of [{ profile: ticket.profile, admitted: true }, structuredClone(ticket), null]) {
        assert.throws(() => validateQualificationClaimRequirements({ graphs: ticket.mutant_graphs, claims: f.claims, transport }), /month_path_transport_authority/);
    }
    for (const change of [
        g => { g.predicates.find(p => p.id === 'binding_1').args[1].period_literal.value = '2042-07'; },
        g => { g.predicates.find(p => p.id === 'binding_1').op = 'not_eq'; },
        g => { g.predicates.find(p => p.id === 'binding_2').args[1].literal.value = 'wrong'; },
        g => { g.predicates = g.predicates.filter(p => p.id !== 'binding_2'); },
        g => { g.trace_contract.proof.required_claim_reads.pop(); }
    ]) {
        const graphs = structuredClone(ticket.mutant_graphs); change(graphs[0]);
        assert.throws(() => validateQualificationClaimRequirements({ graphs, claims: f.claims, transport: ticket }), /month_path_transport_world/);
    }
    const claims = structuredClone(f.claims); claims[0].period.value = '2042-07';
    assert.throws(() => validateQualificationClaimRequirements({ graphs: ticket.mutant_graphs, claims, transport: ticket }), /month_path_transport_world/);
    assert.throws(() => validateClaimRequirements({ graphs: ticket.mutant_graphs, claims: f.claims, transport: ticket }), /claim_requirements_missing/);
});

test('N02G:MONTH-PROFILE-003 original static requirements and target consumers remain fail-closed', () => {
    for (const change of [
        f => { f.graphs[0].predicates.find(p => p.id === 'binding_1').args[1].period_literal.value = '2042-07'; },
        f => { f.graphs[0].predicates.find(p => p.id === 'binding_1').op = 'eq'; },
        f => { f.graphs[0].predicates.find(p => p.id === 'binding_1').atom = 'coverage'; },
        f => { f.graphs[0].selections.push({ predicates: ['binding_1'] }); },
        f => { f.graphs[0].predicates.find(p => p.id === 'binding_2').args.push({ template: { bindings: { consumer: 'binding_1' } } }); }
    ]) {
        const f = fixture(); change(f);
        assert.throws(() => profile().prepareClaimMonthPathTransport(f));
    }
    const f = fixture();
    Object.defineProperty(f.graphs[0], 'qualification', { get() { throw new Error('getter_executed'); }, enumerable: true });
    assert.throws(() => profile().prepareClaimMonthPathTransport(f), error => error.message !== 'getter_executed');
    const reserved = fixture(); reserved.claims[0].qualification = {};
    assert.throws(() => profile().prepareClaimMonthPathTransport(reserved), /month_path_transport_reserved/);
});

test('N02G:MONTH-PROFILE-004 month completion is pure, discriminant and bounded including the last month', () => {
    for (const [before, after] of [['0001-01', '0001-02'], ['2042-12', '2043-01'], ['9999-12', '9999-11']]) {
        const f = fixture(); f.claims[0].period.value = before;
        f.graphs[0].predicates.find(p => p.id === 'binding_1').args[1].period_literal.value = before;
        const ticket = profile().prepareClaimMonthPathTransport(f);
        assert.equal(ticket.sidecar.qualification.alternative_period.value, after);
        assert.deepEqual(ticket.semantic_reference, { original_period: { kind: 'month', value: before },
            alternative_period: { kind: 'month', value: after }, target_result: false });
        assert.notEqual(ticket.baseline_authorship_hash, ticket.mutant_authorship_hash);
        assert.equal(ticket.original_corpus_witness_qualified, false);
    }
    for (const value of ['0000-01', '2042-00', '2042-13', '10000-01', '2042-6']) {
        const f = fixture(); f.claims[0].period.value = value;
        f.graphs[0].predicates.find(p => p.id === 'binding_1').args[1].period_literal.value = value;
        assert.throws(() => profile().prepareClaimMonthPathTransport(f), /month_path_transport_month/);
    }
});

test('N02G:MONTH-PROFILE-005 full mutated authorship compiles only in quarantine, preserving exact independent IR target', async () => {
    const f = await compilerFixture();
    const compiler = require('../../../src/next/provenance/graphCompiler');
    const preparation = compiler.prepareClaimMonthQualification(f.packageReceipt, f.validators,
        { fact_key: 'M-01#1#1', predicate_id: 'binding_1' });
    const mutated = mutantPackage(f.packageReceipt, preparation);
    assert.throws(() => compiler.compileAuthoringIR(mutated, f.validators), /graph_structure_claim_path/);
    const result = compiler.compileClaimMonthQualificationIR(mutated, f.validators, preparation, 'M');
    assert.equal(result.stage, 'claim_month_qualification_compiled_only');
    assert.equal(result.full_mutated_authorship_compiled, true);
    assert.equal(result.static_target_binding_transported, true);
    assert.equal(result.authorship_ir_conformance, true);
    assert.equal(result.profile_witness_qualified, false);
    assert.equal(result.financial_release_eligible, false);
    const target = result.ir.graphs.find(g => g.fact_key === 'M-01#1#1').predicates.find(p => p.id === 'binding_1');
    assert.deepEqual(target.operands[0], { type: { form: 'period', periodKind: 'month' },
        expression: { kind: 'claim_ref', segments: ['qualification', 'alternative_period'] } });
    for (const variant of ['C', 'S']) {
        const control = compiler.compileClaimMonthQualificationIR(f.packageReceipt, f.validators, preparation, variant);
        assert.equal(control.static_target_binding_transported, false);
        assert.equal(control.authorship_ir_conformance, true);
        assert.equal(control.financial_release_eligible, false);
    }
});

test('N02G:MONTH-PROFILE-006 normalized, missing, extra or collateral IR sites and forged preparation never conform', async () => {
    const f = await compilerFixture(); const compiler = require('../../../src/next/provenance/graphCompiler');
    const prep = compiler.prepareClaimMonthQualification(f.packageReceipt, f.validators,
        { fact_key: 'M-01#1#1', predicate_id: 'binding_1' });
    const mutated = mutantPackage(f.packageReceipt, prep);
    const result = compiler.compileClaimMonthQualificationIR(mutated, f.validators, prep, 'M');
    for (const alter of [
        g => { g.predicates.find(p => p.id === 'binding_1').operands[0].expression.segments = ['period']; },
        g => { g.predicates = g.predicates.filter(p => p.id !== 'binding_1'); },
        g => { g.predicates.push(structuredClone(g.predicates.find(p => p.id === 'binding_1'))); },
        g => { g.predicates.find(p => p.id === 'binding_1').operands[0].type = { form: 'scalar', type: 'month' }; },
        g => { g.predicates.find(p => p.id === 'binding_2').op = 'not_eq'; }
    ]) {
        const ir = structuredClone(result.ir); alter(ir.graphs.find(g => g.fact_key === 'M-01#1#1'));
        assert.throws(() => compiler.verifyClaimMonthQualificationConformance(prep, ir, 'M'), /month_qualification_conformance/);
    }
    assert.throws(() => compiler.compileClaimMonthQualificationIR(mutated, f.validators, structuredClone(prep), 'M'), /month_qualification_authority/);
    assert.throws(() => compiler.compileClaimMonthQualificationIR(mutantPackage(f.packageReceipt, prep,
        corpus => { corpus.graphs[0].trace_contract.proof.required_claim_reads.pop(); }), f.validators, prep, 'M'), /month_path_transport_world/);
});

test('N02G:MONTH-PROFILE-007 P-only view rejects the exact target through live reads; C/S and D keep the core', async () => {
    const f = await compilerFixture(); const compiler = require('../../../src/next/provenance/graphCompiler');
    const prep = compiler.prepareClaimMonthQualification(f.packageReceipt, f.validators,
        { fact_key: 'M-01#1#1', predicate_id: 'binding_1' });
    const selector = { fact_key: 'M-01#1#1' };
    const originalMetricTransport = compiler.compileSnapshotAccess(f.packageReceipt, f.validators).projectMetricTransport(selector);
    for (const variant of ['C', 'M', 'S']) {
        const compilation = compiler.compileClaimMonthQualificationIR(variant === 'M' ? mutantPackage(f.packageReceipt, prep) : f.packageReceipt,
            f.validators, prep, variant);
        const access = compiler.compileClaimMonthQualificationAccess(compilation);
        const events = [];
        const observed = access.inspectProofPredicates(selector, tuple => events.push(tuple));
        assert.deepEqual(observed.results.filter(row => !row.satisfied).map(row => row.id), variant === 'M' ? ['binding_1'] : []);
        assert.equal(observed.stage, 'proof_predicate_diagnostics_only');
        assert.equal(access.financial_release_eligible, false);
        assert.deepEqual(access.projectMetricTransport(selector), originalMetricTransport);
        const fringe = observed.qualification_observations;
        assert.equal(fringe.length > 0, variant === 'M');
        assert.ok(fringe.every(row => row.origin === 'qualification' && row.phase === 'proof' && row.site === 'binding_1'));
        if (variant === 'M') {
            for (const name of ['kind', 'value']) assert.ok(fringe.some(row => row.operation[4].join('.') === `qualification.alternative_period.${name}`));
        }
        assert.equal(events.some(tuple => tuple[2] === 'claim/context' && tuple[4][0] === 'qualification'), false);
        const core = access.projectProofTransport(selector).config.bindings.find(row => row.alias === 'claim/context');
        assert.equal(Object.hasOwn(core.value, 'qualification'), false);
        assert.deepEqual(JSON.parse(JSON.stringify(core.value.period)), { kind: 'month', value: '2042-06' });
        assert.throws(() => compiler.compileClaimMonthQualificationAccess(structuredClone(compilation)), /month_qualification_authority/);
    }
});

test('N02G:MONTH-PROFILE-008 conformance never invokes getters or proxies on untrusted IR', async () => {
    const f = await compilerFixture(); const compiler = require('../../../src/next/provenance/graphCompiler');
    const prep = compiler.prepareClaimMonthQualification(f.packageReceipt, f.validators,
        { fact_key: 'M-01#1#1', predicate_id: 'binding_1' });
    let calls = 0;
    const root = {};
    Object.defineProperty(root, 'graphs', { enumerable: true, get() { calls++; return []; } });
    assert.throws(() => compiler.verifyClaimMonthQualificationConformance(prep, root, 'M'));
    assert.equal(calls, 0);
    const graphs = [];
    Object.defineProperty(graphs, '0', { enumerable: true, get() { calls++; return {}; } });
    assert.throws(() => compiler.verifyClaimMonthQualificationConformance(prep, { graphs }, 'M'));
    assert.equal(calls, 0);
    const proxy = new Proxy({}, { get() { calls++; return []; }, ownKeys() { calls++; return ['graphs']; } });
    assert.throws(() => compiler.verifyClaimMonthQualificationConformance(prep, proxy, 'M'));
    assert.equal(calls, 0);
});

test('N02G:MONTH-PROFILE-009 isolated roots bind the profile and sidecar; normal artifact admission refuses them', async () => {
    const f = await compilerFixture(); const compiler = require('../../../src/next/provenance/graphCompiler');
    const { buildClaimMonthPhaseProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { admitPhaseCompositionProfile, validatePhaseArtifactInputs, PROFILE_PATH } = require('../../../src/next/provenance/phaseCompositionProfile');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const { admitArtifact, artifactContents } = require('../../../src/next/provenance/artifactLoader');
    const registry = admittedDocuments(f.packageReceipt).find(row => row.value.registry_id === 'metric_evaluator_registry').value;
    const phase = admitPhaseCompositionProfile({ registry,
        source: fs.readFileSync(path.resolve(__dirname, '../../..', PROFILE_PATH), 'utf8').replaceAll('\r\n', '\n') });
    const prep = compiler.prepareClaimMonthQualification(f.packageReceipt, f.validators,
        { fact_key: 'M-01#1#1', predicate_id: 'binding_1' });
    const roots = new Set();
    for (const variant of ['C', 'M', 'S']) {
        const compilation = compiler.compileClaimMonthQualificationIR(variant === 'M' ? mutantPackage(f.packageReceipt, prep) : f.packageReceipt,
            f.validators, prep, variant);
        const isolated = compiler.prepareClaimMonthIsolatedPlan(compilation);
        assert.throws(() => { compiler.resolveClaimMonthIsolatedPlan(isolated).source = '{}'; }, TypeError);
        const access = compiler.compileClaimMonthQualificationAccess(compilation);
        const selector = { fact_key: 'M-01#1#1' };
        const input = { derivation: access.projectDerivationProgram(selector, phase).input,
            proof: access.projectProofProgram(selector).input };
        const built = buildClaimMonthPhaseProofProgram(input, phase, isolated);
        assert.throws(() => { compiler.resolveClaimMonthIsolatedProof(built.isolatedProofReceipt).artifactReceipt = null; }, TypeError);
        roots.add(built.artifact_root);
        assert.equal(built.profile_witness_qualified, false);
        assert.equal(built.authorship_program_conformance, true);
        assert.equal(built.financial_release_eligible, false);
        assert.equal(built.qualificationInput.data.quarantine_origin, 'negative_qualification');
        assert.equal(built.qualificationInput.data.variant, variant);
        assert.deepEqual(built.qualificationInput.data.sidecar, prep.transport.sidecar);
        const receipt = admitArtifact({ manifestBytes: Buffer.from(built.manifest), expectedRoot: built.artifact_root,
            entries: [{ path: 'bundle.js', bytes: Buffer.from(built.source) },
                { path: built.profileInput.path, bytes: Buffer.from(built.profileInput.source) },
                { path: built.qualificationInput.path, bytes: Buffer.from(built.qualificationInput.source) }] });
        assert.throws(() => validatePhaseArtifactInputs(artifactContents(receipt)), /phase_profile_artifact_inputs/);
        const { validateClaimMonthArtifact, decodeClaimMonthProfile } = require('../../../src/next/provenance/claimMonthIsolatedProfile');
        const { canonicalValue, digest } = require('../../../src/next/kernel/canonicalValue');
        const contents = artifactContents(receipt);
        for (const mutate of [
            row => { delete row.quarantine_origin; },
            row => { row.quarantine_origin = 'positive'; },
            row => { row.sidecar.qualification.alternative_period.value = row.original_period.value; row.sidecar_hash = 'sha256:' + digest(row.sidecar); },
            row => { row.predicate_ids.push(row.predicate_id); },
            row => { row.sidecar.qualification.extra = { kind: 'month', value: '2042-07' }; row.sidecar_hash = 'sha256:' + digest(row.sidecar); }
        ]) {
            const changed = structuredClone(built.qualificationInput.data); mutate(changed);
            assert.throws(() => decodeClaimMonthProfile(canonicalValue(changed)), /month_isolated_/);
        }
        const relabeled = structuredClone(contents); relabeled.files[2].path = 'docs/profile.json';
        assert.throws(() => validateClaimMonthArtifact(relabeled, built.qualificationInput.source), /month_isolated_artifact/);
        const stripped = structuredClone(contents); stripped.files.pop();
        assert.throws(() => validateClaimMonthArtifact(stripped, built.qualificationInput.source), /month_isolated_artifact/);
        assert.throws(() => buildClaimMonthPhaseProofProgram(input, phase, structuredClone(isolated)), /month_qualification_authority/);
        const { verifyClaimMonthProofSource } = require('../../../src/next/provenance/claimMonthProofConformance');
        for (const changed of [built.source.replace('operands.assertion("binding_1"', 'operands.assertion("binding_2"'),
            built.source.replace('const rootOperands=operands;', 'const rootOperands=operands;operands.qualification();')]) {
            assert.throws(() => verifyClaimMonthProofSource(built.loweringExpectation, changed), /month_proof_sites_/);
        }
        if (variant === 'M') assert.throws(() => verifyClaimMonthProofSource(built.loweringExpectation,
            built.source.replace('operands.qualification()', 'operands.claim()')), /month_proof_sites_/);
        assert.throws(() => verifyClaimMonthProofSource(structuredClone(built.loweringExpectation), built.source), /month_proof_sites_authority/);
    }
    assert.equal(roots.size, 3, 'even restored C/S roots retain distinct quarantine execution identity');
});

test('N02G:MONTH-PROFILE-010 isolated lowering never grants auxiliary reads to D or a collateral P site', async () => {
    const f = await compilerFixture(); const compiler = require('../../../src/next/provenance/graphCompiler');
    const { buildClaimMonthPhaseProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { admitPhaseCompositionProfile, PROFILE_PATH } = require('../../../src/next/provenance/phaseCompositionProfile');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const registry = admittedDocuments(f.packageReceipt).find(row => row.value.registry_id === 'metric_evaluator_registry').value;
    const phase = admitPhaseCompositionProfile({ registry,
        source: fs.readFileSync(path.resolve(__dirname, '../../..', PROFILE_PATH), 'utf8').replaceAll('\r\n', '\n') });
    const prep = compiler.prepareClaimMonthQualification(f.packageReceipt, f.validators,
        { fact_key: 'M-01#1#1', predicate_id: 'binding_1' });
    const compilation = compiler.compileClaimMonthQualificationIR(mutantPackage(f.packageReceipt, prep), f.validators, prep, 'M');
    const isolated = compiler.prepareClaimMonthIsolatedPlan(compilation);
    const access = compiler.compileClaimMonthQualificationAccess(compilation); const selector = { fact_key: 'M-01#1#1' };
    const input = { derivation: access.projectDerivationProgram(selector, phase).input,
        proof: access.projectProofProgram(selector).input };
    for (const change of [
        value => { value.derivation.predicates.push(structuredClone(value.proof.predicates.find(p => p.id === 'binding_1'))); },
        value => { value.proof.predicates.find(p => p.id === 'binding_2').operands[0] = structuredClone(value.proof.predicates.find(p => p.id === 'binding_1').operands[0]); },
        value => { value.proof.predicates.find(p => p.id === 'binding_1').operands[0].expression.segments = ['period']; },
        value => { value.proof.predicates.push(structuredClone(value.proof.predicates[0])); }
    ]) {
        const changed = structuredClone(input); change(changed);
        assert.throws(() => buildClaimMonthPhaseProofProgram(changed, phase, isolated), /month_isolation_program/);
    }
});

test('N02G:MONTH-PROFILE-011 isolated C/M/S preserve D and core reads; only M has live target fringe and rejection', async () => {
    const host = require('../../../src/next/provenance/executionHost');
    assert.equal(typeof host.runClaimMonthQualifiedGraph, 'function');
    const f = await compilerFixture(); const compiler = require('../../../src/next/provenance/graphCompiler');
    const { buildClaimMonthPhaseProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { buildAvailableMetricArtifacts, buildMetricChildCapsule } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const { admitPhaseCompositionProfile, PROFILE_PATH } = require('../../../src/next/provenance/phaseCompositionProfile');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const { admitArtifact } = require('../../../src/next/provenance/artifactLoader');
    const claim = fixture().claims[0];
    const positiveOracle = read('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json').turns['M-01#1'].facts[0].value;
    const registry = admittedDocuments(f.packageReceipt).find(row => row.value.registry_id === 'metric_evaluator_registry').value;
    const phase = admitPhaseCompositionProfile({ registry,
        source: fs.readFileSync(path.resolve(__dirname, '../../..', PROFILE_PATH), 'utf8').replaceAll('\r\n', '\n') });
    const metric = buildAvailableMetricArtifacts().built.find(row => row.evaluator_id === claim.evaluator_ref.evaluator_id);
    const metricReceipt = admitArtifact({ manifestBytes: Buffer.from(metric.manifest), expectedRoot: metric.artifact_root,
        entries: [{ path: 'bundle.js', bytes: Buffer.from(metric.source) }] });
    const child = buildMetricChildCapsule();
    const childReceipt = admitArtifact({ manifestBytes: Buffer.from(child.manifest), expectedRoot: child.artifact_root,
        entries: [{ path: 'bootstrap.js', bytes: Buffer.from(child.source) }] });
    const prep = compiler.prepareClaimMonthQualification(f.packageReceipt, f.validators,
        { fact_key: 'M-01#1#1', predicate_id: 'binding_1' });
    const outputs = [];
    for (const variant of ['C', 'M', 'S']) {
        const compilation = compiler.compileClaimMonthQualificationIR(variant === 'M' ? mutantPackage(f.packageReceipt, prep) : f.packageReceipt,
            f.validators, prep, variant);
        const plan = compiler.prepareClaimMonthIsolatedPlan(compilation);
        const access = compiler.compileClaimMonthQualificationAccess(compilation); const selector = { fact_key: 'M-01#1#1' };
        const built = buildClaimMonthPhaseProofProgram({ derivation: access.projectDerivationProgram(selector, phase).input,
            proof: access.projectProofProgram(selector).input }, phase, plan);
        const { sealClaimMonthTargetTrace, compareClaimMonthTargetTrace, sealClaimMonthCoreTrace,
            compareClaimMonthCoreTrace } = require('../../../src/next/provenance/claimMonthTraceContract');
        const traceExpectation = sealClaimMonthTargetTrace(built.qualificationInput.source);
        const transport = access.projectMetricTransport(selector);
        const raw = { executionId: `month-${variant}`, invocationId: `month-M01-${variant}`, timeoutMs: 5000,
            childCapsuleReceipt: childReceipt,
            derivation: { artifactReceipt: metricReceipt, bindings: [], directGroups: transport.directGroups,
                nodeSets: transport.nodeSets, parentGroups: transport.parentGroups,
                derivationBindings: access.projectDerivationBindings(selector) },
            proof: { artifactReceipt: built.artifactReceipt, ...access.projectProofTransport(selector).config } };
        const graph = fixture().graphs[0]; const coverage = {};
        for (const phase of ['derivation', 'proof']) {
            const { evidence_set_mode, ...expected } = graph.trace_contract[phase];
            const isProof = phase === 'proof'; const config = raw.proof;
            coverage[phase] = { expected, sets: graph.sets,
                bindings: isProof ? config.proofSelections.map(row => ({ role: `proof/set/${row.candidate_set}`,
                    candidate_set: row.candidate_set, selected_set: row.selected_set }))
                    : expected.required_selections.map(selection => {
                        const roles = Object.entries(claim.operand_bindings).filter(([, binding]) => binding.kind === 'node_set'
                            && JSON.stringify(binding.aliases) === JSON.stringify(graph.sets[selection.candidate_set]));
                        assert.equal(roles.length, 1); return { role: roles[0][0], ...selection };
                    }),
                operandSets: isProof ? config.proofSets.map(row => ({ role: `proof/set/${row.name}`, aliases: row.roster }))
                    : Object.entries(claim.operand_bindings).filter(([, binding]) => binding.kind === 'node_set')
                        .map(([role, binding]) => ({ role, aliases: binding.aliases })),
                accessBindings: access.observationMetadata({ fact_key: selector.fact_key, phase }),
                measurements: isProof ? [{ measurement: 'proof_engine_artifact_root', observed: built.artifact_root }]
                    : [{ measurement: 'evaluator_artifact_root', observed: metric.artifact_root },
                        { measurement: 'proof_engine_artifact_root', observed: built.artifact_root }] };
        }
        const coreExpectation = sealClaimMonthCoreTrace(traceExpectation, coverage);
        await assert.rejects(host.runAdmittedGraph(raw), /host_artifact_unsupported/);
        await assert.rejects(host.runClaimMonthQualifiedGraph(raw, structuredClone(built.isolatedProofReceipt)), /month_qualification_authority/);
        const observed = await host.runClaimMonthQualifiedGraph(raw, built.isolatedProofReceipt);
        const traceInput = { profile_hash: observed.qualification_profile_hash, proof_satisfied: observed.proof_satisfied,
            proof_site_results: observed.proof_site_results, proof_site_reads: observed.proof_site_reads,
            qualification_observations: observed.qualification_observations };
        assert.equal(compareClaimMonthTargetTrace(traceExpectation, traceInput).fringe_trace_matched, true);
        const coreInput = { executionId: raw.executionId, invocationId: raw.invocationId,
            trace: observed.trace, targetTrace: traceInput };
        const checked = compareClaimMonthCoreTrace(coreExpectation, coreInput);
        assert.equal(checked.core_trace_matched, true, JSON.stringify({ d: checked.derivation, p: checked.proof }));
        assert.equal(checked.profile_witness_qualified, false);
        const missingCore = structuredClone(coreInput);
        missingCore.targetTrace.proof_site_reads.splice(missingCore.targetTrace.proof_site_reads.findIndex(row => row.site !== 'binding_1'), 1);
        assert.throws(() => compareClaimMonthCoreTrace(coreExpectation, missingCore), /month_trace_recorder_link/);
        const wrongRoot = structuredClone(coreInput); wrongRoot.trace.derivation_trace.find(row => row.measurement === 'evaluator_artifact_root').observed = 'sha256:' + '0'.repeat(64);
        assert.equal(compareClaimMonthCoreTrace(coreExpectation, wrongRoot).core_trace_matched, false);
        assert.throws(() => compareClaimMonthTargetTrace(structuredClone(traceExpectation), traceInput), /month_trace_authority/);
        for (const change of [
            value => { value.proof_site_reads = value.proof_site_reads.filter(row => row.site !== 'binding_1'); },
            value => { value.proof_site_reads.push(structuredClone(value.proof_site_reads.find(row => row.site === 'binding_1'))); },
            value => { value.proof_site_reads.find(row => row.site === 'binding_1').site = 'binding_2'; },
            value => { value.proof_site_results.find(row => row.site === 'binding_2').satisfied = false; },
            value => { value.proof_site_reads.find(row => row.site === 'binding_1').origin = variant === 'M' ? 'original' : 'qualification'; }
        ]) {
            const changed = structuredClone(traceInput); change(changed);
            assert.throws(() => compareClaimMonthTargetTrace(traceExpectation, changed), /month_trace_/);
        }
        assert.equal(observed.functional_result.value, positiveOracle);
        assert.equal(observed.functional_result.unit, claim.unit);
        assert.equal(observed.functional_result.kind, 'money_minor');
        assert.equal(observed.proof_satisfied, variant !== 'M');
        assert.deepEqual(observed.proof_site_results.filter(row => !row.satisfied).map(row => row.site), variant === 'M' ? ['binding_1'] : []);
        assert.equal(observed.qualification_observations.length > 0, variant === 'M');
        assert.ok(observed.qualification_observations.every(row => row.phase === 'proof' && row.site === 'binding_1' && row.origin === 'qualification'));
        assert.equal(observed.profile_witness_qualified, false, 'observations alone cannot qualify the ledger or financial fact');
        assert.equal(observed.financial_release_eligible, false); assert.equal(observed.receipt_created, false);
        await assert.rejects(host.runClaimMonthQualifiedGraph(raw, built.isolatedProofReceipt), /host_qualification_reused/);
        outputs.push(observed);
    }
    const dCore = result => result.trace.derivation_trace.filter(row => row.operation)
        .map(({ sequence, invocation_id, ...row }) => row);
    const pCore = result => result.proof_site_reads.filter(row => row.origin === 'original' && row.site !== 'binding_1').map(row => row.event);
    for (const other of outputs.slice(1)) { assert.deepEqual(dCore(other), dCore(outputs[0])); assert.deepEqual(pCore(other), pCore(outputs[0])); }
});
