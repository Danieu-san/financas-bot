// Complete candidate-only composition. No approval, expected, validator, IR,
// candidate override or scope comes from the caller. No financial authority.
import { types } from 'node:util';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { loadLocalAuthoringPackage } from './executeNextDomainInvariantMatrix.mjs';
import { buildAdmittedSchemaValidators } from './buildNextProvenanceArtifacts.mjs';
import { buildSelectedEventDayCommonProofProgram } from './lowerNextProofProgram.mjs';
import { sealSelectedEventDayCommonProgramExpectation, verifySelectedEventDayProgram } from './selectedEventDayProgramContract.mjs';
import { buildSelectedEventDayDispatchCapsule } from './buildSelectedEventDayDispatchCapsule.mjs';
import { prepareSelectedEventDayAdmission, claimSelectedEventDayInvocation } from './prepareSelectedEventDayAdmission.mjs';
import { buildSelectedEventDayProofExecution, executeSelectedEventDayGraph, adjudicateSelectedEventDayGraph } from './buildSelectedEventDayProofExecution.mjs';
import { captureSelectedEventDayBuildRecipe, assertCurrentSelectedEventDayBuildRecipe } from './captureSelectedEventDayBuildRecipe.mjs';
import { admittedDocuments, admittedPackageEntries, admitPackage } from '../../src/next/provenance/packageContract.js';
import { compileAuthoringIR } from '../../src/next/provenance/graphCompiler.js';
import { enumeratePathInventoryCandidate, enumeratePathSemanticCandidates } from '../../src/next/provenance/pathMutationInventory.js';
import { prepareSelectedEventDayPrecommit, sealSelectedEventDayIrExpectation, sealSelectedEventDayLeaseExpectation,
    selectedEventDayProgramFamily, PROFILE, NORMATIVE_COMMIT } from '../../src/next/provenance/selectedEventDayProfile.js';
import { admitPhaseCompositionProfile, PROFILE_PATH } from '../../src/next/provenance/phaseCompositionProfile.js';
import { admitArtifact } from '../../src/next/provenance/artifactLoader.js';
import { canonicalValue, freezeDeep } from '../../src/next/kernel/canonicalValue.js';
import { copyData } from '../../src/next/provenance/observationContract.js';
import { admitExecutionFreeze, admitFrozenArtifact } from '../../src/next/provenance/freezeContract.js';
import { verifyNativeRuntime } from '../../src/next/provenance/nativeRuntime.js';
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const prefix = 'docs/contracts/next/provenance-v2/';
const fail = code => { throw new Error('selected_day_candidate_' + code); };
const preparations = new WeakMap(), reviewedCandidates = new WeakMap();
function own(raw, names) {
    if (!raw || types.isProxy(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const descriptors = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(descriptors).length !== names.length || names.some(name =>
        !descriptors[name]?.enumerable || !Object.hasOwn(descriptors[name], 'value'))) fail('input');
    return Object.fromEntries(names.map(name => [name, descriptors[name].value]));
}
function preparation(receipt) {
    const row = preparations.get(receipt); if (!row) fail('authority'); return row;
}
// Same native-slot transport boundary as execution freeze admission. Buffer
// own properties are never consulted, including length/constructor/coercions.
export function captureSelectedEventDayReviewBytes(value) {
    if (!value || types.isProxy(value) || !Buffer.isBuffer(value)
        || Object.getPrototypeOf(value) !== Buffer.prototype) fail('review_input');
    const size = Reflect.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength').get.call(value);
    if (!size || size > 256 * 1024) fail('review_size');
    const bytes = Buffer.alloc(size); Uint8Array.prototype.set.call(bytes, value); return bytes;
}
function target(raw) {
    if (!raw || types.isProxy(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const descriptors = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(descriptors).length !== 1 || !descriptors.mutation_id?.enumerable
        || !Object.hasOwn(descriptors.mutation_id, 'value') || typeof descriptors.mutation_id.value !== 'string'
        || !/^sha256:[a-f0-9]{64}$/.test(descriptors.mutation_id.value)) fail('input');
    return descriptors.mutation_id.value;
}
async function prepareCandidate(raw) {
    const mutation_id = target(raw);
    const recipe = captureSelectedEventDayBuildRecipe();
    const packageReceipt = loadLocalAuthoringPackage();
    const bytes = admittedPackageEntries(packageReceipt), docs = admittedDocuments(packageReceipt);
    const validators = buildAdmittedSchemaValidators(packageReceipt).validators;
    // Baseline IR is for inventory admission only, NEVER an expectation for M.
    const inventoryCandidate = enumeratePathInventoryCandidate({ packageReceipt, ir: compileAuthoringIR(packageReceipt, validators) });
    const precommit = prepareSelectedEventDayPrecommit({ packageReceipt, inventoryCandidate, mutation_id });
    const alternatives = enumeratePathSemanticCandidates({ inventoryCandidate, mutation_id });
    const candidate = alternatives.candidates[precommit.selected_candidate_index];
    if (alternatives.candidates_sha256 !== precommit.candidate_order_hash || candidate?.candidate_id !== precommit.candidate_id) fail('candidate_identity');
    const corpus = structuredClone(docs.find(d => d.path === prefix + 'graphs-v2.json').value);
    const index = corpus.graphs.findIndex(g => g.fact_key === candidate.target.fact_key);
    if (index === -1) fail('target');
    corpus.graphs[index] = structuredClone(candidate.graph);
    const mutantBytes = bytes.map(row => ({ path: row.path, bytes: row.path === prefix + 'graphs-v2.json'
        ? Buffer.from(JSON.stringify(corpus)) : Buffer.from(row.bytes) }));
    const restoreBytes = bytes.map(row => ({ path: row.path, bytes: Buffer.from(row.bytes) }));
    const admit = entries => admitPackage({ entries, authority: entries.map(row => ({ path: row.path, sha256: sha(row.bytes) })) });
    const packages = { C: packageReceipt, M: admit(mutantBytes), S: admit(restoreBytes) };
    // All three entire expectations, leases and program are sealed before ANY
    // native M compile. Only the first independent discriminator is admitted.
    const expectations = Object.fromEntries(['C', 'M', 'S'].map(variant => [variant,
        sealSelectedEventDayIrExpectation({ precommit, variant, packageReceipt: packages[variant] })]));
    const programExpectation = sealSelectedEventDayCommonProgramExpectation({ expectations });
    const leaseExpectations = Object.fromEntries(['C', 'M', 'S'].map(variant => [variant,
        sealSelectedEventDayLeaseExpectation({ expectation: expectations[variant] })]));
    const originalCorpus = docs.find(d => d.path === prefix + 'graphs-v2.json').value;
    const phase = admitPhaseCompositionProfile({ source: bytes.find(row => row.path === PROFILE_PATH).bytes.toString('utf8'),
        registry: docs.find(d => d.path === originalCorpus.metric_evaluator_registry.path).value });
    const family = selectedEventDayProgramFamily(expectations);
    const built = buildSelectedEventDayCommonProofProgram(Object.fromEntries(['C', 'M', 'S'].map(variant => [variant,
        { proof: family[variant].proof, derivation: family[variant].derivation }])), phase, expectations);
    const programConformance = verifySelectedEventDayProgram({ programExpectation, source: built.source });
    const options = { expectations, leaseExpectations, programConformance };
    const capsule = buildSelectedEventDayDispatchCapsule(options);
    const proofArtifactReceipt = admitArtifact({ manifestBytes: Buffer.from(built.manifest), expectedRoot: built.artifact_root,
        entries: [{ path: 'bundle.js', bytes: Buffer.from(built.source) },
            { path: built.profileInput.path, bytes: Buffer.from(built.profileInput.source) }] });
    const dispatchArtifactReceipt = admitArtifact({ manifestBytes: Buffer.from(capsule.manifest), expectedRoot: capsule.artifact_root,
        entries: [{ path: capsule.entry, bytes: Buffer.from(capsule.source) }] });
    const admission = prepareSelectedEventDayAdmission({ ...options, proofArtifactReceipt, dispatchArtifactReceipt });
    const execution = buildSelectedEventDayProofExecution({ admission });
    return { mutation_id, recipe, precommit, admission, execution };
}
// Inventory construction only: use the ratified witness solely for its authored
// coordinate. All actual recipes still come from the same genuine preparation,
// full normal compile and opaque expectations; no child or launcher is opened.
export async function captureSelectedEventDayCandidateImports() {
    const witness = JSON.parse(readFileSync(new URL('../../docs/audit-evidence/n02g-causal-authoring-profile/selected-event-day-path-profile-witness.json', import.meta.url), 'utf8'));
    const { recipe, execution } = await prepareCandidate({ mutation_id: witness.mutation_id });
    assertCurrentSelectedEventDayBuildRecipe(recipe);
    return execution.captured_import_bundles;
}
// BUILD capability only. It carries no guest handle, approval or witness credit.
export async function prepareSelectedEventDayCandidate(raw) {
    const row = await prepareCandidate(raw);
    const receipt = Object.freeze({ stage: 'selected_day_prepared_candidate_only', financial_release_eligible: false });
    preparations.set(receipt, { ...row, used: false, review: undefined }); return receipt;
}
export function selectedEventDayCandidateBoundary(receipt) {
    const row = preparation(receipt);
    assertCurrentSelectedEventDayBuildRecipe(row.recipe);
    return reviewSnapshot(row);
}
function reviewSnapshot({ mutation_id, recipe, precommit, execution }) {
    return freezeDeep({ stage: 'selected_day_candidate_review_snapshot_only', profile: PROFILE,
        normative_commit: NORMATIVE_COMMIT, mutation_id, candidate_id: precommit.candidate_id,
        precommit_hash: sha(canonicalValue(structuredClone(precommit))),
        freeze_source: execution.negative_bootstrap_candidate.freeze_source,
        manifest: execution.manifest, negative_component_root: execution.artifact_root,
        execution_ticket_sha256: execution.execution_ticket_sha256,
        compiler_artifact_root: execution.compiler_artifact_root, adjudicator_artifact_root: execution.adjudicator_artifact_root,
        build_sources_sha256: sha(canonicalValue(recipe.sources)), build_sources: structuredClone(recipe.sources),
        profile_witness_qualified: false, semantic_mutation_credit: 0, financial_release_eligible: false });
}
// Passive BUILD export for immutable review. These are the exact captured
// bytes underlying the snapshot manifest, not new execution capabilities.
export function selectedEventDayCandidateArtifacts(receipt) {
    const { recipe, execution } = preparation(receipt);
    assertCurrentSelectedEventDayBuildRecipe(recipe);
    return freezeDeep({ stage: 'selected_day_review_artifact_bytes_only', financial_release_eligible: false,
        entries: execution.negative_bootstrap_candidate.entries.map(file => ({ path: file.path, source: file.source })) });
}
// The trusted bootstrap supplies expectedReviewHash from the independently
// reviewed immutable snapshot, NEVER from this candidate or model input.
// This API admits bytes only; it does not authenticate its caller or prove a
// human audit. The public guest-facing wrapper must not forward these inputs.
export function admitSelectedEventDayReviewedCandidate(raw) {
    const { prepared, reviewBytes, expectedReviewHash } = own(raw, ['prepared', 'reviewBytes', 'expectedReviewHash']);
    const row = preparation(prepared);
    if (row.used || row.review) fail('reused');
    if (typeof expectedReviewHash !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(expectedReviewHash)) fail('review_input');
    const bytes = captureSelectedEventDayReviewBytes(reviewBytes);
    if (sha(bytes) !== expectedReviewHash) fail('review_hash');
    const source = bytes.toString('utf8'); if (!Buffer.from(source).equals(bytes)) fail('review_input');
    let snapshot;
    try { snapshot = structuredClone(copyData(JSON.parse(source))); } catch { fail('review_input'); }
    if (canonicalValue(snapshot) !== source) fail('review_input');
    const actual = reviewSnapshot(row);
    if (source !== canonicalValue(structuredClone(actual))) fail('review_binding');
    // Invalid external snapshots need no repeated AST/source scan. A genuine
    // matching snapshot still remeasures the complete BUILD before admission.
    assertCurrentSelectedEventDayBuildRecipe(row.recipe);
    // Root expectation comes from the admitted external snapshot. The exact
    // current captured artifact must match it before any runtime factory runs.
    const freezeReceipt = admitExecutionFreeze({ bytes: Buffer.from(snapshot.freeze_source),
        expectedHash: sha(snapshot.freeze_source) });
    const bootstrap = row.execution.negative_bootstrap_candidate;
    admitFrozenArtifact({ freezeReceipt, kind: 'tcb', programId: null, manifestBytes: Buffer.from(bootstrap.manifest),
        entries: bootstrap.entries.map(file => ({ path: file.path, bytes: Buffer.from(file.source) })) });
    verifyNativeRuntime(freezeReceipt);
    const receipt = Object.freeze({ stage: 'selected_day_reviewed_boundary_bytes_only',
        observed_review_sha256: expectedReviewHash, financial_release_eligible: false });
    row.review = receipt; reviewedCandidates.set(receipt, { prepared, freezeReceipt, expectedReviewHash }); return receipt;
}
export async function executeSelectedEventDayReviewedCandidate(raw) {
    const { reviewed } = own(raw, ['reviewed']), admitted = reviewedCandidates.get(reviewed);
    if (!admitted) fail('authority');
    const row = preparation(admitted.prepared);
    if (row.used) fail('reused');
    assertCurrentSelectedEventDayBuildRecipe(row.recipe);
    verifyNativeRuntime(admitted.freezeReceipt);
    return executePrepared(admitted.prepared, admitted.expectedReviewHash);
}
export async function executeSelectedEventDayCandidate(raw) {
    return executePrepared(await prepareSelectedEventDayCandidate(raw), null);
}
async function executePrepared(prepared, reviewHash) {
    const row = preparation(prepared);
    if (row.used) fail('reused'); row.used = true;
    const { mutation_id, recipe, precommit, admission, execution } = row;
    assertCurrentSelectedEventDayBuildRecipe(recipe);
    const executionId = 'selected-day/' + randomUUID(), results = {}, worlds = [];
    for (const variant of ['C', 'M', 'S']) {
        const invocationId = executionId + '/' + variant + '/' + randomUUID();
        const invocation = claimSelectedEventDayInvocation({ admission, variant, scope: { executionId, invocationId } });
        const result = await executeSelectedEventDayGraph({ execution: execution.executionReceipt, invocation });
        results[variant] = result;
        worlds.push({ variant, invocation_id: invocationId, derivation_satisfied: result.derivation_satisfied,
            proof_satisfied: result.proof_satisfied, fringe_count: result.fringe_count,
            raw_event_count: result.raw_event_count, trace_sha256: sha(canonicalValue(structuredClone(result.trace))),
            raw_rows_sha256: sha(canonicalValue(structuredClone(result.raw_rows))),
            receipt_created: result.receipt_created, observed_ticket_sha256: result.observed_execution_ticket_sha256 });
    }
    const adjudication = adjudicateSelectedEventDayGraph({ execution: execution.executionReceipt, results });
    assertCurrentSelectedEventDayBuildRecipe(recipe);
    return freezeDeep({ stage: 'selected_day_complete_candidate_executed_only', mutation_id,
        candidate_id: precommit.candidate_id, profile: PROFILE, normative_commit: NORMATIVE_COMMIT,
        selected_candidate_index: precommit.selected_candidate_index, candidate_order_hash: precommit.candidate_order_hash,
        references_hash: precommit.references_hash, precommit_hash: sha(canonicalValue(structuredClone(precommit))),
        execution_id: executionId, worlds, normal_compile_worlds: admission.normal_compile_worlds, native_graph_worlds: worlds.length,
        executable_ticket_candidate_complete: execution.execution_ticket_candidate_complete,
        execution_ticket_sha256: execution.execution_ticket_sha256, negative_component_root: execution.artifact_root,
        compiler_artifact_root: execution.compiler_artifact_root, program_artifact_root: admission.program_artifact_root,
        build_sources_sha256: sha(canonicalValue(recipe.sources)), measured_sources_unchanged: true,
        measured_scope: 'transitive_BUILD_source_inventory_not_the_global_suite_inventory',
        adjudication, reviewed_boundary_admitted_before_handles: reviewHash !== null,
        review_snapshot_sha256: reviewHash, code_audit_required: true, validation_tcb_complete: false,
        ordinary_v2_witness_qualified: false, profile_witness_qualified: false, semantic_mutation_credit: 0,
        financial_release_eligible: false, receipt_created: false, validated_parent_created: false });
}
