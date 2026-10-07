import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { runInThisContext } from 'node:vm';
import { types } from 'node:util';
import { canonicalValue } from '../../src/next/kernel/canonicalValue.js';
import { admitArtifact, artifactContents } from '../../src/next/provenance/artifactLoader.js';
import { buildTrustedCommonJsBundle } from './buildNextProvenanceArtifacts.mjs';
import { resolveSelectedEventDayAdmission, resolveSelectedEventDayInvocation } from './prepareSelectedEventDayAdmission.mjs';
import { buildAvailableMetricArtifacts } from './buildNextMetricArtifacts.mjs';
import { decodeSelectedEventDayPacket } from '../../src/next/provenance/selectedEventDayPacket.js';
import { compareSelectedEventDayCore } from '../../src/next/provenance/selectedEventDayCoreComparison.js';
import { compareSelectedEventDayCoverage } from '../../src/next/provenance/selectedEventDayCoverage.js';
import { compareSelectedEventDayOracle } from '../../src/next/provenance/selectedEventDayOracle.js';
import { assertSelectedEventDayOracleSource } from './sealSelectedEventDayOracle.mjs';
import { nativeRuntimeFileCapability } from '../../src/next/provenance/nativeRuntime.js';
import { assertCurrentSelectedEventDayBuildRecipe } from './captureSelectedEventDayBuildRecipe.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url), executions = new WeakMap(), used = new WeakSet(), results = new WeakMap();
const sha = source => 'sha256:' + createHash('sha256').update(source, 'utf8').digest('hex');
const fail = code => { throw new Error('selected_day_native_execution_' + code); };
function fields(raw, names) {
    if (!raw || typeof raw !== 'object' || types.isProxy(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== names.length || names.some(k => !d[k]?.enumerable || !Object.hasOwn(d[k], 'value'))) fail('input');
    return Object.fromEntries(names.map(k => [k, d[k].value]));
}
function project(names) { return names.map(name => ({ path: 'provenance/' + name + '.js',
    source: fs.readFileSync(path.join(root, 'src/next/provenance/' + name + '.js'), 'utf8') })); }
const canonicalSource = () => ({ path: 'kernel/canonicalValue.js',
    source: fs.readFileSync(path.join(root, 'src/next/kernel/canonicalValue.js'), 'utf8') });
function importBundle(bundle, entry) {
    const manifest = canonicalValue({ format: 'financasbot.provenance.artifact', version: 1, kind: 'tcb', entry,
        files: [{ path: entry, media_type: 'text/javascript', sha256: sha(bundle.source) }] });
    return Object.freeze({ manifest, artifact_root: sha(manifest), source: bundle.source,
        sourceHashes: Object.freeze(bundle.sourceHashes.map(row => Object.freeze({ ...row }))),
        importBindings: Object.freeze(bundle.imports.map(row => Object.freeze({ ...row }))),
        financial_acceptance: false, reviewed_source_admission: false });
}
// Captured negative host/child/adjudicator component only. NOT the complete D/P
// qualification TCB or a reviewed normal financial launcher. Every snapshot,
// packet and program is captured from the private whole-compile admission,
// and no runtime argument may substitute them or remove negative identity.
export function buildSelectedEventDayProofExecution(raw) {
    const { admission } = fields(raw, ['admission']);
    const admitted = resolveSelectedEventDayAdmission(admission);
    const childSources = [
        { path: 'provenance/selectedEventDayProofChild.js', source: fs.readFileSync(path.join(root,
            'src/next/provenance/selectedEventDayProofChild.cjs'), 'utf8') },
        ...project(['selectedEventDayProofOperands', 'selectedEventDayDerivationOperands', 'selectedEventDayPacket', 'selectedEventDayDispatchCore',
            'executionProfile', 'artifactLoader', 'instrumentedAccess', 'observationContract', 'observationScalars',
            'proofContextBinding', 'pinnedCivilTimezone', 'civilCalendar', 'literalTypes', 'claimBinding', 'executionRegistry']), canonicalSource(),
        { path: 'vendor/ses.js', source: fs.readFileSync(path.join(root, 'node_modules/ses/dist/ses.cjs'), 'utf8') }
    ];
    const child = buildTrustedCommonJsBundle({ sources: childSources,
        entry: 'provenance/selectedEventDayProofChild.js', exportName: 'run' });
    const childSource = child.source + '(require);\n';
    const childManifest = canonicalValue({ format: 'financasbot.provenance.artifact', version: 1, kind: 'tcb',
        entry: 'selected-day-proof-child.js', files: [{ path: 'selected-day-proof-child.js',
            media_type: 'text/javascript', sha256: sha(childSource) }] });
    const proofManifest = canonicalValue({ format: 'financasbot.provenance.artifact', version: 1, kind: 'proof',
        entry: admitted.proof.entry, files: admitted.proof.files.map(f => ({ path: f.path,
            media_type: f.media_type, sha256: f.observed_sha256 })) });
    if (sha(proofManifest) !== admitted.proofArtifactReceipt.observed_root) fail('proof_identity');
    // Reuse the original native evaluator build, with no formula edits or P
    // dispatch. Selection is by the opaque admitted claim, not a caller metric.
    const metric = buildAvailableMetricArtifacts().built.find(r => r.evaluator_id === admitted.metricIdentity.evaluator_id
        && r.evaluator_version === admitted.metricIdentity.evaluator_version);
    if (!metric) fail('metric_identity');
    const metricReceipt = admitArtifact({ manifestBytes: Buffer.from(metric.manifest), expectedRoot: metric.artifact_root,
        entries: [{ path: 'bundle.js', bytes: Buffer.from(metric.source) }] });
    if (artifactContents(metricReceipt).kind !== 'metric') fail('metric_identity');
    const recipe = { negative_qualification: true, childSource, childRoot: sha(childManifest), childSourceSha256: sha(childSource),
        packetSource: admitted.packet.source,
        proof: { expectedRoot: admitted.proofArtifactReceipt.observed_root, manifest: proofManifest,
            source: admitted.proof.files[0].source, profileSource: admitted.proof.files[1].source },
        configs: Object.fromEntries(['C', 'M', 'S'].map(v => [v, admitted.worlds[v].proof.config])),
        derivation: { manifest: metric.manifest, expectedRoot: metric.artifact_root, source: metric.source,
            contractHash: admitted.metricIdentity.contract_sha256,
            configs: Object.fromEntries(['C', 'M', 'S'].map(v => [v, Object.fromEntries(
                ['directGroups', 'nodeSets', 'parentGroups'].map(k => [k, admitted.worlds[v].derivation[k]]))])) } };
    const hostSources = [...project(['selectedEventDayProofHost', 'selectedEventDayProofProtocol', 'selectedEventDayPacket', 'selectedEventDayDispatchCore',
        'causalRecorder', 'observationContract', 'observationScalars', 'claimBinding', 'executionRegistry']), canonicalSource(),
        { path: 'provenance/selectedDayCapturedProofRecipe.js', source: 'module.exports=' + JSON.stringify(recipe) + ';\n' }];
    const host = buildTrustedCommonJsBundle({ sources: hostSources, entry: 'provenance/selectedEventDayProofHost.js', exportName: 'run',
        nativeImports: [{ source: 'provenance/selectedEventDayProofHost.js', specifier: 'node:child_process' }] });
    // Capture the adjudication closure AND all pre-M expectations. No runtime
    // import of a live BUILD comparator, schema file, oracle file or caller
    // expected value can replace this bundle's finite source/constant table.
    const adjudicationRecipe = { negative_qualification: true, profile_witness_qualified: false,
        financial_release_eligible: false, plans: decodeSelectedEventDayPacket(admitted.packet.source).variants,
        oracle: admitted.oracle, coverage: Object.fromEntries(['C', 'M', 'S'].map(v => [v, admitted.worlds[v].coverage])),
        normalCoverage: Object.fromEntries(['C', 'M', 'S'].map(v => [v, admitted.worlds[v].normalCoverage])),
        normalPredicates: admitted.worlds.C.normalPredicates,
        measurements: { derivation: [
            { measurement: 'evaluator_artifact_root', observed: metric.artifact_root },
            { measurement: 'proof_engine_artifact_root', observed: admitted.proofArtifactReceipt.observed_root },
            { measurement: 'evaluator_contract_hash', observed: admitted.metricIdentity.contract_sha256 }],
            proof: [{ measurement: 'proof_engine_artifact_root', observed: admitted.proofArtifactReceipt.observed_root }] } };
    const adjudicator = buildTrustedCommonJsBundle({ sources: [...project([
        'selectedEventDayAdjudicator', 'selectedEventDayCoreComparison', 'selectedEventDayCoverage', 'selectedEventDayOracle',
        'proofAcceptance', 'pinnedCivilTimezone', 'civilCalendar', 'literalTypes', 'executionProfile',
        'observationContract', 'observationScalars', 'claimBinding', 'executionRegistry']), canonicalSource(),
        { path: 'provenance/selectedDayCapturedAdjudicationRecipe.js',
            source: 'module.exports=' + JSON.stringify(adjudicationRecipe) + ';\n' }],
        entry: 'provenance/selectedEventDayAdjudicator.js', exportName: 'run' });
    if (adjudicator.nativeExternals.some(name => !['node:crypto', 'node:util', 'node:process'].includes(name))) fail('adjudicator_import');
    const adjudicatorManifest = canonicalValue({ format: 'financasbot.provenance.artifact', version: 1, kind: 'tcb',
        entry: 'selected-day-adjudicator.js', files: [{ path: 'selected-day-adjudicator.js',
            media_type: 'text/javascript', sha256: sha(adjudicator.source) }] });
    const launcher = buildTrustedCommonJsBundle({ sources: [...project(['selectedEventDayLauncher', 'artifactLoader',
        'freezeContract', 'nativeRuntime', 'observationContract', 'observationScalars', 'selectedEventDayPacket',
        'selectedEventDayExecutionTicket']), canonicalSource()],
        entry: 'provenance/selectedEventDayLauncher.js', exportName: 'launch', nativeImports: [
            { source: 'provenance/nativeRuntime.js', specifier: 'node:fs' },
            ...['node:vm', 'node:child_process'].map(specifier => ({ source: 'provenance/selectedEventDayLauncher.js', specifier }))] });
    // Metadata references the compiler leaves; do not duplicate executable
    // strings inside bounded observation transport or weaken its size limits.
    const compilerBinding = { ...admitted.compilerBinding, entries: admitted.compilerBinding.entries.map(row => ({
        path: row.path, sha256: sha(row.source) })) };
    const compilerBindingSource = canonicalValue(compilerBinding);
    const executableFiles = [{ path: 'selected-day-proof-child.js', source: childSource },
        { path: 'selected-day-proof-host.js', source: host.source },
        { path: 'selected-day-adjudicator.js', source: adjudicator.source },
        { path: 'selected-day-launcher.js', source: launcher.source }]
        .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    // BUILD tooling is a declared trusted platform, not an independently
    // replayed executable closure. Preserve its exact current source recipe;
    // executable compiler/guest/host/child/adjudicator closures are separately
    // captured and hash-bound above. No caller file list or expected override.
    const buildRecipeSource = canonicalValue(assertCurrentSelectedEventDayBuildRecipe(admitted.buildRecipe));
    const nativeRuntime = Object.freeze({ platform: process.platform, arch: process.arch, node_version: process.version,
        node_binary_sha256: sha(fs.readFileSync(process.execPath)) });
    const expectedProgram = admitted.programExpectation;
    const ticketSource = canonicalValue({ schema_version: 1, profile_id: 'selected-event-day-path/v1',
        normative_commit: 'f1a8cd4629b245009b9dd8fbb8dce83da77ba3d4', quarantine_origin: 'negative_qualification',
        precommit_hash: admitted.compilerBinding.precommit_hash, packet_sha256: sha(admitted.packet.source),
        program_artifact_root: admitted.proofArtifactReceipt.observed_root, program_sha256: expectedProgram.expected_source_sha256,
        dispatch_artifact_root: admitted.capsule.artifact_root, metric_artifact_root: metric.artifact_root,
        metric_contract_sha256: admitted.metricIdentity.contract_sha256,
        compiler_artifact_root: admitted.compilerBinding.compiler_artifact_root, build_recipe_sha256: sha(buildRecipeSource),
        authorship: admitted.ticketInputs, worlds: admitted.compilerBinding.worlds,
        program_conformance: { expected_source_sha256: expectedProgram.expected_source_sha256,
            expected_ir_hashes: expectedProgram.expected_ir_hashes, helper_sources: expectedProgram.helper_sources,
            common_program_identity: expectedProgram.common_program_identity, dispatch_interface: expectedProgram.dispatch_interface,
            executable_absence: admitted.executableAbsence },
        executable_leaves: executableFiles.map(row => ({ path: row.path, sha256: sha(row.source) })), native_runtime: nativeRuntime,
        profile_witness_qualified: false, semantic_mutation_credit: 0, financial_release_eligible: false });
    const quarantineRecipe = canonicalValue({ schema_version: 1, quarantine_origin: 'negative_qualification',
        profile_id: 'selected-event-day-path/v1', normative_commit: 'f1a8cd4629b245009b9dd8fbb8dce83da77ba3d4',
        packet_source: admitted.packet.source, packet_sha256: sha(admitted.packet.source),
        compiler_artifact_root: admitted.compilerBinding.compiler_artifact_root,
        compiler_binding_sha256: sha(compilerBindingSource),
        ticket_sha256: sha(ticketSource), program_artifact_root: admitted.proofArtifactReceipt.observed_root,
        dispatch_artifact_root: admitted.capsule.artifact_root, metric_artifact_root: metric.artifact_root,
        metric_contract_sha256: admitted.metricIdentity.contract_sha256,
        host_native_externals: host.nativeExternals, adjudicator_native_externals: adjudicator.nativeExternals,
        profile_witness_qualified: false, financial_release_eligible: false });
    const capturedFiles = [
        ...executableFiles,
        { path: 'selected-day-build-recipe.json', source: buildRecipeSource },
        { path: 'selected-day-ticket.json', source: ticketSource },
        { path: 'selected-day-recipe.json', source: quarantineRecipe },
        ...admitted.compilerBinding.entries,
        { path: 'selected-day-compiler-binding.json', source: compilerBindingSource }]
        .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    const manifest = canonicalValue({ format: 'financasbot.provenance.artifact', version: 1, kind: 'tcb',
        entry: 'selected-day-launcher.js', files: capturedFiles.map(file => ({ path: file.path,
            media_type: file.path.endsWith('.json') ? 'application/json' : 'text/javascript', sha256: sha(file.source) })) });
    const artifactReceipt = admitArtifact({ manifestBytes: Buffer.from(manifest), expectedRoot: sha(manifest),
        entries: capturedFiles.map(file => ({ path: file.path, bytes: Buffer.from(file.source) })) });
    const executionReceipt = Object.freeze({ stage: 'captured_negative_proof_component_only', observed_root: artifactReceipt.observed_root,
        executable_ticket_complete: false, validation_tcb_complete: false, profile_witness_qualified: false,
        financial_release_eligible: false });
    // Candidate negative provisioning only, never a reviewed positive financial
    // freeze. Its package is the exact qualification sidecar, not a normal DAG.
    const freezeSource = canonicalValue({ schema_version: 1, freeze_id: 'provenance_execution', freeze_version: 1, stage: 'execution',
        metric_registry_hash: decodeSelectedEventDayPacket(admitted.packet.source).registry_sha256,
        validation_tcb_root: artifactReceipt.observed_root, child_capsule_root: sha(childManifest), native_runtime: nativeRuntime,
        package_authority: [{ path: 'qualification/selected-event-day-path-v1.json', sha256: sha(admitted.packet.source) }],
        proof_programs: [{ program_id: sha(admitted.packet.source), proof_engine_artifact_root: admitted.proofArtifactReceipt.observed_root }] });
    executions.set(executionReceipt, { admission, artifactReceipt, nativeExternals: launcher.nativeExternals,
        freezeSource, expectedFreezeHash: sha(freezeSource), launcher: undefined,
        adjudicatorNativeExternals: adjudicator.nativeExternals, adjudicatorRoot: sha(adjudicatorManifest),
        plans: decodeSelectedEventDayPacket(admitted.packet.source).variants, oracle: admitted.oracle,
        coverage: Object.fromEntries(['C', 'M', 'S'].map(v => [v, admitted.worlds[v].coverage])),
        measurements: { derivation: [
            { measurement: 'evaluator_artifact_root', observed: metric.artifact_root },
            { measurement: 'proof_engine_artifact_root', observed: admitted.proofArtifactReceipt.observed_root },
            { measurement: 'evaluator_contract_hash', observed: admitted.metricIdentity.contract_sha256 }],
            proof: [{ measurement: 'proof_engine_artifact_root', observed: admitted.proofArtifactReceipt.observed_root }] } });
    return Object.freeze({ manifest, artifact_root: artifactReceipt.observed_root, executionReceipt,
        captured_import_bundles: Object.freeze([importBundle(host, 'selected-day-proof-host.js'),
            importBundle(adjudicator, 'selected-day-adjudicator.js')]),
        sourceHashes: Object.freeze([...child.sourceHashes, ...host.sourceHashes, ...metric.sourceHashes, ...adjudicator.sourceHashes, ...launcher.sourceHashes]),
        negative_launcher_captured: true, native_runtime_candidate: nativeRuntime,
        execution_ticket_candidate_complete: true, execution_ticket_sha256: sha(ticketSource),
        compiler_artifact_root: admitted.compilerBinding.compiler_artifact_root,
        compiler_source_hashes: admitted.compilerBinding.source_hashes,
        negative_bootstrap_candidate: Object.freeze({ freeze_source: freezeSource, expected_freeze_hash: sha(freezeSource),
            manifest, entries: Object.freeze(capturedFiles.map(file => Object.freeze({ ...file }))) }),
        launcher_native_externals: Object.freeze(launcher.nativeExternals),
        launcher_source_hashes: Object.freeze(launcher.sourceHashes.map(row => Object.freeze({ ...row }))),
        adjudicator_artifact_root: sha(adjudicatorManifest),
        adjudicator_source_hashes: Object.freeze(adjudicator.sourceHashes.map(row => Object.freeze({ ...row }))),
        adjudicator_import_bindings: Object.freeze(adjudicator.imports.map(row => Object.freeze({ ...row }))),
        validation_tcb_complete: false, profile_witness_qualified: false, financial_release_eligible: false });
}
async function execute(raw, mode) {
    const { execution, invocation } = fields(raw, ['execution', 'invocation']);
    const sealed = executions.get(execution); if (!sealed) fail('authority');
    const input = resolveSelectedEventDayInvocation(invocation);
    if (input.admissionReceipt !== sealed.admission) fail('authority');
    if (used.has(invocation)) fail('reused'); used.add(invocation);
    if (!sealed.launcher) {
        const artifact = artifactContents(sealed.artifactReceipt);
        const source = artifact.files.find(f => f.path === artifact.entry).source;
        const factory = runInThisContext(source)(name => {
            if (!sealed.nativeExternals.includes(name)) fail('native_import');
            const natives = Object.freeze({ 'node:fs': nativeRuntimeFileCapability(), 'node:crypto': require('node:crypto'),
                'node:util': require('node:util'), 'node:process': require('node:process'),
                'node:vm': require('node:vm'), 'node:child_process': require('node:child_process') });
            if (!Object.hasOwn(natives, name)) fail('native_import');
            return natives[name];
        });
        const manifestBytes = Buffer.from(canonicalValue({ format: 'financasbot.provenance.artifact', version: 1,
            kind: artifact.kind, entry: artifact.entry, files: artifact.files.map(file => ({ path: file.path,
                media_type: file.media_type, sha256: file.observed_sha256 })) }));
        sealed.launcher = factory({ freezeBytes: Buffer.from(sealed.freezeSource), expectedFreezeHash: sealed.expectedFreezeHash,
            tcbArtifact: { manifestBytes, entries: artifact.files.map(file => ({ path: file.path, bytes: Buffer.from(file.source) })) } });
    }
    const result = await sealed.launcher.run({ variant: input.variant, scope: input.scope, mode });
    const output = Object.freeze({ ...result, observed_negative_proof_component_root: execution.observed_root });
    results.set(output, { execution, variant: input.variant, mode }); return output;
}
export const executeSelectedEventDayProof = raw => execute(raw, 'proof');
export const executeSelectedEventDayGraph = raw => execute(raw, 'graph');
function genuineGraphResults(raw) {
    const input = fields(raw, ['execution', 'results']), sealed = executions.get(input.execution);
    if (!sealed) fail('authority');
    const rows = fields(input.results, ['C', 'M', 'S']);
    for (const variant of ['C', 'M', 'S']) {
        const row = results.get(rows[variant]);
        if (!row || row.execution !== input.execution || row.variant !== variant || row.mode !== 'graph') fail('authority');
    }
    return { rows, sealed };
}
export function compareSelectedEventDayGraphCore(raw) {
    const { rows, sealed } = genuineGraphResults(raw);
    return compareSelectedEventDayCore({ results: rows, plans: sealed.plans });
}
export function compareSelectedEventDayGraphCoverage(raw) {
    const { rows, sealed } = genuineGraphResults(raw);
    return compareSelectedEventDayCoverage({ results: rows, plans: sealed.plans,
        coverage: sealed.coverage, measurements: sealed.measurements });
}
export function compareSelectedEventDayGraphOracle(raw) {
    const { rows, sealed } = genuineGraphResults(raw);
    assertSelectedEventDayOracleSource(sealed.oracle);
    const coverage = compareSelectedEventDayCoverage({ results: rows, plans: sealed.plans,
        coverage: sealed.coverage, measurements: sealed.measurements });
    return freezeOracleVerdict(compareSelectedEventDayOracle({ results: rows, expectation: sealed.oracle }), coverage);
}
function freezeOracleVerdict(oracle, coverage) {
    return Object.freeze({ ...oracle, profile_coverage_complete: coverage.profile_coverage_complete,
        measured_tcb_admission: false });
}
export function adjudicateSelectedEventDayGraph(raw) {
    const { rows, sealed } = genuineGraphResults(raw);
    assertSelectedEventDayOracleSource(sealed.oracle);
    if (!sealed.launcher) fail('adjudicator_identity');
    return Object.freeze({ ...sealed.launcher.adjudicate(), observed_negative_component_root: sealed.artifactReceipt.observed_root,
        observed_adjudicator_artifact_root: sealed.adjudicatorRoot });
}
