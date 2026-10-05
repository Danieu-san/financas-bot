'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const { admitArtifact, artifactContents } = require('../../../src/next/provenance/artifactLoader');
const { admitPackage } = require('../../../src/next/provenance/packageContract');
const { compileAuthoringIR, compileSnapshotAccess } = require('../../../src/next/provenance/graphCompiler');
const { admitPhaseCompositionProfile, PROFILE_PATH, phaseCompositionCommitment } = require('../../../src/next/provenance/phaseCompositionProfile');
const { proofProgramIdentity } = require('../../../src/next/provenance/financialHost');
const root = path.resolve(__dirname, '../../..');
const prefix = 'docs/contracts/next/provenance-v2/';
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const clone = value => Buffer.isBuffer(value) ? Buffer.from(value) : Array.isArray(value) ? value.map(clone)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) : value;
const artifact = built => ({ manifestBytes: Buffer.from(built.manifest), entries: built.entries
    ? built.entries.map(row => ({ path: row.path, bytes: Buffer.from(row.source) }))
    : [{ path: 'bundle.js', bytes: Buffer.from(built.source) }, ...(built.profileInput
        ? [{ path: built.profileInput.path, bytes: Buffer.from(built.profileInput.source) }] : [])] });
let fixturePromise;
async function fixture() {
    if (fixturePromise) return fixturePromise;
    fixturePromise = (async () => {
        const { buildCapturedValidationTools } = await import('../../../scripts/agent/buildNextValidationTcb.mjs');
        const { buildAvailableMetricArtifacts, buildExecutionRegistryCandidate } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
        const { buildSchemaValidators } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
        const { buildPhaseProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
        const files = new Map();
        const add = file => {
            if (!files.has(file)) files.set(file, { path: file, bytes: Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n')) });
            return JSON.parse(files.get(file).bytes);
        };
        const corpus = add(prefix + 'graphs-v2.json');
        for (const file of ['predicate-templates-v1.json', 'claim-contract.schema.json', 'evidence-snapshot.schema.json']) add(prefix + file);
        for (const key of ['claim_contract', 'snapshot_manifest', 'material_registry', 'operator_registry', 'metric_evaluator_registry']) add(corpus[key].path);
        for (const source of add(corpus.snapshot_manifest.path).sources) add(source.path);
        const authorRegistry = add(corpus.metric_evaluator_registry.path);
        for (const row of authorRegistry.entries) add(row.contract_path);
        for (const graph of corpus.graphs) for (const source of graph.authoring_sources) add(source.path);
        const packageEntries = [...files.values()];
        const authority = packageEntries.map(row => ({ path: row.path, sha256: hash(row.bytes) })).sort((a, b) => a.path < b.path ? -1 : 1);
        const receipt = admitPackage({ entries: packageEntries, authority });
        const validators = buildSchemaValidators().validators;
        const plan = compileSnapshotAccess(receipt, validators); const ir = compileAuthoringIR(receipt, validators);
        const profileSource = fs.readFileSync(path.join(root, PROFILE_PATH), 'utf8');
        const profile = admitPhaseCompositionProfile({ source: profileSource, registry: authorRegistry });
        const proofs = new Map(); const programIds = new Map();
        for (const factKey of ir.order) {
            const input = { proof: plan.projectProofProgram({ fact_key: factKey }).input,
                derivation: plan.projectDerivationProgram({ fact_key: factKey }, profile).input };
            const programId = proofProgramIdentity(input.proof, input.derivation, phaseCompositionCommitment(profile).sha256);
            const built = buildPhaseProofProgram(input, profile);
            if (proofs.has(programId)) assert.equal(proofs.get(programId).built.artifact_root, built.artifact_root);
            proofs.set(programId, { built, row: { program_id: programId, ...artifact(built) } }); programIds.set(factKey, programId);
        }
        const tcb = buildCapturedValidationTools(); const registry = buildExecutionRegistryCandidate();
        // Synthetic TEST authority only. This is not a published/reviewed freeze
        // and must never be promoted to financial/product approval.
        const freeze = { schema_version: 1, freeze_id: 'provenance_execution', freeze_version: 1, stage: 'execution',
            metric_registry_hash: registry.registry_hash, validation_tcb_root: tcb.artifact_root, child_capsule_root: tcb.child.artifact_root,
            native_runtime: { platform: process.platform, arch: process.arch, node_version: process.version,
                node_binary_sha256: hash(fs.readFileSync(process.execPath)) }, package_authority: authority,
            proof_programs: [...proofs].map(([program_id, row]) => ({ program_id, proof_engine_artifact_root: row.built.artifact_root }))
                .sort((a, b) => a.program_id < b.program_id ? -1 : 1) };
        return { tcb, freeze, order: ir.order, programIds, data: { packageEntries, registryBytes: Buffer.from(registry.bytes),
            metricArtifacts: buildAvailableMetricArtifacts().built.map(row => ({ evaluator_id: row.evaluator_id, ...artifact(row) })),
            proofArtifacts: [...proofs.values()].map(row => row.row), profileSource, timeoutMs: 5000 } };
    })();
    return fixturePromise;
}
function bootstrap(fixture, freeze = fixture.freeze, tcbArtifact = artifact(fixture.tcb)) {
    const freezeBytes = Buffer.from(canonicalValue(freeze));
    return { freezeBytes, expectedFreezeHash: hash(freezeBytes), tcbArtifact };
}
function externalLauncher(fixture, input) {
    // Models the DECLARED native external trust boundary: identify the captured
    // leaf BEFORE executing project bootstrap bytes. No ambient project require.
    const receipt = admitArtifact({ ...input.tcbArtifact, expectedRoot: fixture.freeze.validation_tcb_root });
    const contents = artifactContents(receipt);
    const launcher = contents.files.find(row => row.path === 'launcher-bootstrap.js');
    const launch = vm.runInThisContext(`(function(require){return ${launcher.source}\n})`)(specifier => {
        assert.ok(fixture.tcb.launcherNativeExternals.includes(specifier)); return require(specifier);
    });
    assert.equal(typeof launch, 'function'); return launch(input);
}

test('N02G:FINANCIAL-HOST-001 captured private host accepts the complete DAG only after exact D/P and clean exit', async t => {
    const f = await fixture(); const input = bootstrap(f); const data = clone(f.data);
    const launcher = externalLauncher(f, input);
    assert.deepEqual(Object.keys(launcher).sort(), ['financial_acceptance', 'initialize', 'stage']);
    assert.equal(launcher.financial_acceptance, false);
    const host = launcher.initialize(data);
    assert.deepEqual(Object.keys(host).sort(), ['read', 'run']);
    assert.throws(() => host.read('not-issued'), /financial_host_reference/);
    assert.throws(() => launcher.initialize(data), /already_initialized/);
    // Captured data remains stable after every caller-owned byte buffer changes.
    data.registryBytes.fill(0); for (const row of data.packageEntries) row.bytes.fill(0);
    for (const row of [...data.metricArtifacts, ...data.proofArtifacts]) { row.manifestBytes.fill(0); for (const leaf of row.entries) leaf.bytes.fill(0); }
    input.freezeBytes.fill(0); input.tcbArtifact.manifestBytes.fill(0); for (const row of input.tcbArtifact.entries) row.bytes.fill(0);
    const running = host.run(); await assert.rejects(host.run(), /financial_host_lifecycle/);
    const result = await running;
    assert.equal(result.stage, 'validated_dag_results'); assert.equal(result.graph_count, 76);
    assert.equal(result.evidence_refs.length, 76); assert.equal(new Set(result.evidence_refs).size, 76);
    const oracle = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8'));
    for (let i = 0; i < f.order.length; i++) {
        const key = f.order[i]; const split = key.lastIndexOf('#'); const actual = host.read(result.evidence_refs[i]);
        assert.deepEqual(actual.value, oracle.turns[key.slice(0, split)].facts[Number(key.slice(split + 1)) - 1].value, key);
        assert.ok(Object.isFrozen(actual));
    }
    await assert.rejects(host.run(), /financial_host_lifecycle/);
    assert.throws(() => host.read({ reference: result.evidence_refs[0] }), /financial_host_reference/);
    const anotherHost = externalLauncher(f, bootstrap(f)).initialize(clone(f.data));
    assert.throws(() => anotherHost.read(result.evidence_refs[0]), /financial_host_reference/);
    const second = await anotherHost.run(); assert.equal(second.graph_count, 76);
    assert.throws(() => anotherHost.read(result.evidence_refs[0]), /financial_host_reference/);
    assert.throws(() => host.read(second.evidence_refs[0]), /financial_host_reference/);
    assert.equal(second.evidence_refs.some(reference => result.evidence_refs.includes(reference)), false);
    t.diagnostic('captured_private_dag_per_execution=76; independent_executions=2; phases=304; cross_request_refs=rejected; oracle=harness_only; public_parent_receipt_api=absent; synthetic_freeze_only=true');
});

test('N02G:FINANCIAL-HOST-002 external leaf admission and host inputs fail before untrusted code or callbacks', async () => {
    const f = await fixture(); let effects = 0;
    const changed = bootstrap(f); changed.tcbArtifact.entries.find(row => row.path === 'host-bootstrap.js').bytes = Buffer.from('globalThis.__n02gExecuted=true');
    assert.throws(() => externalLauncher(f, changed), /artifact_/); assert.equal(globalThis.__n02gExecuted, undefined);
    const badFreeze = bootstrap(f); badFreeze.freezeBytes[0] ^= 1;
    assert.throws(() => externalLauncher(f, badFreeze), /execution_freeze_hash/);
    const wrongNative = clone(f.freeze); wrongNative.native_runtime.node_binary_sha256 = hash('not-this-runtime');
    assert.throws(() => externalLauncher(f, bootstrap(f, wrongNative)), /native_runtime_binary_mismatch/);
    const loader = externalLauncher(f, bootstrap(f));
    const getter = { ...f.data }; Object.defineProperty(getter, 'registryBytes', { enumerable: true, get() { effects++; return f.data.registryBytes; } });
    assert.throws(() => loader.initialize(getter), /financial_host_input/); assert.equal(effects, 0);
    const fresh = () => externalLauncher(f, bootstrap(f));
    assert.throws(() => fresh().initialize({ ...f.data, verdict: true }), /financial_host_input/);
    const proxy = new Proxy(f.data, { ownKeys() { effects++; return Reflect.ownKeys(f.data); } });
    assert.throws(() => fresh().initialize(proxy), /financial_host_input/); assert.equal(effects, 0);
    const forged = clone(f.data); forged.registryBytes[0] ^= 1;
    assert.throws(() => fresh().initialize(forged), /execution_registry_hash/);
    const missing = clone(f.data); missing.proofArtifacts.pop();
    assert.throws(() => fresh().initialize(missing), /financial_host_artifact_inventory/);
    const duplicate = clone(f.data); duplicate.proofArtifacts[1] = duplicate.proofArtifacts[0];
    assert.throws(() => fresh().initialize(duplicate), /financial_host_artifact_inventory/);
    const wrongCatalog = clone(f.freeze); wrongCatalog.proof_programs[0].program_id = hash('unknown-program');
    wrongCatalog.proof_programs.sort((a, b) => a.program_id < b.program_id ? -1 : 1);
    assert.throws(() => externalLauncher(f, bootstrap(f, wrongCatalog)).initialize(clone(f.data)), /financial_host_proof_inventory/);
    const { nativeRuntimeFileCapability } = require('../../../src/next/provenance/nativeRuntime');
    const capability = nativeRuntimeFileCapability(); assert.deepEqual(Object.keys(capability), ['readFileSync']);
    assert.throws(() => capability.readFileSync('some-other-file'), /native_runtime_path/);
    assert.throws(() => capability.readFileSync(process.execPath, 'utf8'), /native_runtime_path/);
});

test('N02G:FINANCIAL-HOST-003 proof failure never exposes partial results or transferable parent authority', async () => {
    const f = await fixture(); const data = clone(f.data); const freeze = clone(f.freeze);
    const target = f.order.find((key, i) => i > 0 && f.programIds.get(key) !== f.programIds.get(f.order[0]));
    assert.ok(target); // At least one complete primary precedes this failure.
    const programId = f.programIds.get(target); const row = data.proofArtifacts.find(row => row.program_id === programId);
    row.entries[0].bytes = Buffer.from('(function(){return false;})');
    const manifest = JSON.parse(row.manifestBytes); manifest.files[0].sha256 = hash(row.entries[0].bytes);
    row.manifestBytes = Buffer.from(canonicalValue(manifest));
    freeze.proof_programs.find(row => row.program_id === programId).proof_engine_artifact_root = hash(row.manifestBytes);
    const host = externalLauncher(f, bootstrap(f, freeze)).initialize(data);
    await assert.rejects(host.run(), { message: 'financial_host_execution_rejected' });
    assert.throws(() => host.read('any-reference'), /financial_host_reference/);
    await assert.rejects(host.run(), /financial_host_lifecycle/);
});
