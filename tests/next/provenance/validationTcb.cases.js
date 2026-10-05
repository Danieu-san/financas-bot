'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const { admitArtifact, artifactContents } = require('../../../src/next/provenance/artifactLoader');
const { admitPackage, admittedDocuments } = require('../../../src/next/provenance/packageContract');
const hash = source => `sha256:${createHash('sha256').update(source).digest('hex')}`;

test('N02G:VALIDATION-TCB-001 captured host/compiler/schema closure executes without ambient project requires', async () => {
    const { buildCapturedValidationTools } = await import('../../../scripts/agent/buildNextValidationTcb.mjs');
    const built = buildCapturedValidationTools();
    assert.equal(built.validation_tcb_complete, false); assert.equal(built.financial_acceptance, false);
    assert.equal(built.hostSourceHashes.length, 56);
    assert.equal(new Set(built.hostSourceHashes.map(row => row.path)).size, 56);
    assert.equal(built.hostSourceHashes.some(row => row.path === 'kernel/canonicalJson.js'), false);
    for (const required of ['provenance/executionHost.js', 'provenance/graphCompiler.js', 'provenance/proofAcceptance.js',
        'provenance/causalRecorder.js', 'provenance/claimMonthPathProfile.js', 'provenance/claimRequirementCore.js',
        'provenance/claimNominalTypes.js', 'provenance/claimMonthIsolatedProfile.js', 'provenance/claimMonthProofConformance.js',
        'provenance/claimMonthTraceContract.js', 'provenance/phaseProgramIdentity.js',
        'vendor/acorn.js', 'vendor/schemaValidators.js', 'vendor/formats.js', 'vendor/ajvEqual.js',
        'vendor/ucs2length.js', 'vendor/fastDeepEqual.js', 'provenance/freezeContract.js', 'provenance/nativeRuntime.js', 'provenance/financialHost.js']) assert.ok(built.hostSourceHashes.some(row => row.path === required));
    const entries = built.entries.map(row => ({ path: row.path, bytes: Buffer.from(row.source) }));
    const tcbReceipt = admitArtifact({ manifestBytes: Buffer.from(built.manifest), expectedRoot: built.artifact_root, entries });
    for (const row of entries) row.bytes.fill(0);
    const host = artifactContents(tcbReceipt).files.find(row => row.path === 'host-bootstrap.js');
    const nativeCalls = [];
    const tools = vm.runInThisContext(`(function(require){ return ${host.source}\n})`)(specifier => {
        assert.ok(built.nativeExternals.includes(specifier)); nativeCalls.push(specifier); return require(specifier);
    });
    assert.equal(tools.stage, 'captured_validation_tools_only'); assert.equal(tools.financial_acceptance, false);
    assert.notEqual(tools.runAdmittedGraph, require('../../../src/next/provenance/executionHost').runAdmittedGraph);
    assert.notEqual(tools.comparePhaseCoverage, require('../../../src/next/provenance/proofAcceptance').comparePhaseCoverage);
    const packageBytes = Buffer.from('{}');
    const packageInput = { entries: [{ path: 'docs/sample.json', bytes: packageBytes }],
        authority: [{ path: 'docs/sample.json', sha256: hash(packageBytes) }] };
    const capturedPackage = tools.admitPackage(packageInput);
    assert.throws(() => admittedDocuments(capturedPackage), /package_/);
    assert.throws(() => tools.compileAuthoringIR(admitPackage(packageInput)), /package_/);
    // Separate opaque receipt tables ensure these calls did not route back to
    // ambient require-cache code while measuring different filesystem bytes.
    const artifact = (source, kind) => {
        const bytes = Buffer.from(source); const manifestBytes = Buffer.from(canonicalValue({
            format: 'financasbot.provenance.artifact', version: 1, kind, entry: 'bundle.js',
            files: [{ path: 'bundle.js', media_type: 'text/javascript', sha256: hash(bytes) }] }));
        return tools.admitArtifact({ manifestBytes, expectedRoot: hash(manifestBytes), entries: [{ path: 'bundle.js', bytes }] });
    };
    const metric = artifact('(function(operands){return {unit:"count",kind:"nonnegative_integer",value:operands.source.get("count")};})', 'metric');
    const proof = artifact('(function(operands){return operands.node("input").get("count")===7;})', 'proof');
    const childCapsuleReceipt = tools.admitArtifact({ manifestBytes: Buffer.from(built.child.manifest), expectedRoot: built.child.artifact_root,
        entries: [{ path: 'bootstrap.js', bytes: Buffer.from(built.child.source) }] });
    const freezeBytes = Buffer.from(canonicalValue({ schema_version: 1, freeze_id: 'provenance_execution', freeze_version: 1,
        stage: 'execution', metric_registry_hash: hash('synthetic-registry'), validation_tcb_root: built.artifact_root,
        child_capsule_root: built.child.artifact_root, native_runtime: { platform: process.platform, arch: process.arch,
            node_version: process.version, node_binary_sha256: hash(require('node:fs').readFileSync(process.execPath)) },
        package_authority: [{ path: 'docs/sample.json', sha256: hash(packageBytes) }],
        proof_programs: [{ program_id: hash('synthetic-program'), proof_engine_artifact_root: proof.observed_root }] }));
    const freezeReceipt = tools.admitExecutionFreeze({ bytes: freezeBytes, expectedHash: hash(freezeBytes) });
    const nativeRuntimeReceipt = tools.verifyNativeRuntime(freezeReceipt);
    const binding = { alias: 'input', role: 'source', value: { count: 7 },
        shape: { type: 'record', fields: { count: { type: 'scalar' } } } };
    const result = await tools.runAdmittedGraph({ executionId: 'captured-tcb', invocationId: 'synthetic-graph', timeoutMs: 2000,
        childCapsuleReceipt, nativeRuntimeReceipt, derivation: { artifactReceipt: metric, bindings: [binding] },
        proof: { artifactReceipt: proof, bindings: [{ ...binding, role: 'proof/snapshot' }] } });
    assert.equal(result.functional_result.value, 7); assert.equal(result.proof_satisfied, true);
    assert.equal(result.graph_accepted, false); assert.equal(result.observed_child_capsule_root, built.child.artifact_root);
    assert.equal(result.trace.derivation_trace.filter(row => row.operation === 'get').length, 1);
    assert.equal(result.trace.proof_trace.filter(row => row.operation === 'get').length, 1);
    await assert.rejects(tools.runAdmittedGraph({ executionId: 'captured-tcb', invocationId: 'forged-native', timeoutMs: 2000,
        childCapsuleReceipt, nativeRuntimeReceipt: { ...nativeRuntimeReceipt }, derivation: { artifactReceipt: metric, bindings: [binding] },
        proof: { artifactReceipt: proof, bindings: [{ ...binding, role: 'proof/snapshot' }] } }), /native_runtime_not_admitted/);
    assert.deepEqual([...new Set(nativeCalls)].sort(), built.nativeExternals);
    assert.throws(() => tools.comparePhaseCoverage({}), /trace_coverage_/);
});

test('N02G:VALIDATION-TCB-002 privileged native edges require exact declarations and never enter guest bundles', async () => {
    const { buildTrustedCommonJsBundle, buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const sources = [{ path: 'host.js', source: "const child = require('node:child_process'); module.exports={run:()=>true};" }];
    const input = { sources, entry: 'host.js', exportName: 'run' };
    assert.throws(() => buildTrustedCommonJsBundle(input), /guest_bundle_external_import/);
    const nativeImports = [{ source: 'host.js', specifier: 'node:child_process' }];
    const built = buildTrustedCommonJsBundle({ ...input, nativeImports });
    assert.deepEqual(built.nativeExternals, ['node:child_process']);
    assert.throws(() => buildCommonJsGuestBundle({ ...input, nativeImports }), /guest_bundle_native_imports/);
    for (const declarations of [[...nativeImports, ...nativeImports], [{ source: 'unknown.js', specifier: 'node:child_process' }],
        [{ source: 'host.js', specifier: 'node:fs' }]]) {
        assert.throws(() => buildTrustedCommonJsBundle({ ...input, nativeImports: declarations }), /guest_bundle_native_imports/);
    }
    assert.throws(() => buildTrustedCommonJsBundle({ ...input, nativeImports: [...nativeImports, { source: 'host.js', specifier: 'node:path' }] }), /guest_bundle_unused_native_import/);
});
