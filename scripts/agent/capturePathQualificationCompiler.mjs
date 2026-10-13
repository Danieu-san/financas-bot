// Trusted BUILD controls only. Capturing/compiling the normal pipeline is not
// a static exclusion certificate, proof execution, independent replay or GO.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import { types } from 'node:util';
import { readFileSync } from 'node:fs';
import { buildCapturedValidationTools } from './buildNextValidationTcb.mjs';
import { canonicalValue, freezeDeep } from '../../src/next/kernel/canonicalValue.js';
import { admitArtifact, artifactContents } from '../../src/next/provenance/artifactLoader.js';
import { admittedDocuments, admittedPackageEntries } from '../../src/next/provenance/packageContract.js';
import { takePathQualificationCandidatePackage, verifyPathCandidateWholeIRReference,
    readPathWholeIRFailure, takePathQualificationWitnessPreselection,
    preparePathCandidateProgramAuthorship, materializePathStaticDomainControl,
    materializePathSelectionAdmissionControl } from '../../src/next/provenance/pathQualificationV3.js';
import { resolvePathCandidateProgramExpectation, verifyPathCandidatePrograms,
    readPathCandidateProgramFailure, verifyPathCandidateMetrics,
    verifyPathCandidateMetricBindings, verifyPathCandidateClosure,
    recheckPathCandidateCapabilities, verifyPathCandidateCapabilityBuildBinding,
    sealPathCandidateProgramExpectation } from './pathProofProgramContract.mjs';
import { buildPhaseProofProgram } from './lowerNextProofProgram.mjs';
import { buildAvailableMetricArtifacts, buildExecutionRegistryCandidate } from './buildNextMetricArtifacts.mjs';
import { copyData } from '../../src/next/provenance/observationContract.js';

const require = createRequire(import.meta.url);
const captures = new WeakMap(), evidence = new WeakMap();
const programArtifacts = new WeakMap();
const metricArtifacts = new WeakMap();
const executionPayloads = new WeakMap(), issuedExecutionTransports = new WeakSet();
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw new Error('path_qualification_compiler_' + code); };
function fields(raw, names) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== names.length || names.some(name => !d[name]?.enumerable
        || !Object.hasOwn(d[name], 'value'))) fail('input');
    return Object.fromEntries(names.map(name => [name, d[name].value]));
}
export function capturePathQualificationCompiler(...args) {
    if (args.length) fail('capture_input');
    const built = buildCapturedValidationTools();
    const recipe = built.entries.find(entry => entry.path === 'recipe.json')?.source;
    if (!recipe) fail('recipe');
    const recipeData = JSON.parse(recipe), schemas = recipeData.schema_sources;
    const allowed = ['node:crypto', 'node:util', 'node:process', 'node:path', 'node:fs', 'node:child_process'];
    if (built.nativeExternals.some(name => !allowed.includes(name))) fail('native_import');
    const source = '(function(require){const tools=' + built.source
        + ';return Object.freeze({admitPackage:tools.admitPackage,compileAuthoringIR:tools.compileAuthoringIR,'
        + 'compileSnapshotAccess:tools.compileSnapshotAccess,readNativePathDiagnostic:tools.readNativePathDiagnostic,'
        + 'admitPhaseCompositionProfile:tools.admitPhaseCompositionProfile});})';
    const entry = 'path-qualification-compiler.js';
    const entries = [{ path: entry, source }, { path: 'path-qualification-compiler-recipe.json', source: recipe }]
        .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    const manifest = canonicalValue({ format: 'financasbot.provenance.artifact', version: 1, kind: 'tcb', entry,
        files: entries.map(row => ({ path: row.path, media_type: row.path.endsWith('.json')
            ? 'application/json' : 'text/javascript', sha256: hash(row.source) })) });
    const artifact = admitArtifact({ manifestBytes: Buffer.from(manifest), expectedRoot: hash(manifest),
        entries: entries.map(row => ({ path: row.path, bytes: Buffer.from(row.source) })) });
    const contents = artifactContents(artifact);
    const state = { failed: false, handleAttempts: 0, schemas,
        schemaBuildSource: recipeData.recipes.find(row => row.path === 'scripts/agent/buildNextProvenanceArtifacts.mjs')?.source,
        entries, manifest, sourceHashes: built.hostSourceHashes,
        childSourceHashes: built.child.sourceHashes,
        imports: built.hostImportBindings, nativeExternals: built.nativeExternals };
    const deny = () => { state.handleAttempts++; state.failed = true; fail('handle_forbidden'); };
    state.tools = runInThisContext(contents.files.find(file => file.path === contents.entry).source)(name => {
        if (!built.nativeExternals.includes(name)) fail('native_import');
        if (name === 'node:fs') return Object.freeze({ readFileSync: deny });
        if (name === 'node:child_process') return Object.freeze({ fork: deny, spawn: deny });
        return require(name);
    });
    const receipt = freezeDeep({ stage: 'path_v3_captured_normal_compiler_build_only',
        artifact_root: artifact.observed_root,
        normal_compiler_source_bindings_sha256: hash(canonicalValue(built.hostSourceHashes)),
        normal_child_source_bindings_sha256: hash(canonicalValue(built.child.sourceHashes)),
        selection_binding_source_sha256: built.hostSourceHashes.find(row => row.path === 'provenance/selectionBindings.js')?.sha256,
        validation_tcb_complete: false, financial_acceptance: false });
    captures.set(receipt, state);
    return receipt;
}
export function compilePathQualificationCandidate(raw) {
    const { capture, candidate } = fields(raw, ['capture', 'candidate']);
    return compileCapturedCandidate(capture, candidate, null, null);
}
export function compilePathQualificationProgramCandidate(raw) {
    const { capture, candidate, expectation } = fields(raw, ['capture', 'candidate', 'expectation']);
    const plan = resolvePathCandidateProgramExpectation({ expectation, candidate });
    return compileCapturedCandidate(capture, candidate, expectation, plan);
}
// Trusted BUILD integration only: selection/reference precede the independent
// authorial program seal and the captured NORMAL lowering. No guest D/P is run,
// and unknown admission/effect premises remain blocked, not W qualification.
export function compilePathQualificationWitnessPreselection(raw) {
    if (!raw || typeof raw !== 'object' || types.isProxy(raw)) fail('input');
    const hasReview = Object.hasOwn(Object.getOwnPropertyDescriptors(raw), 'normalRuleReview');
    const { capture, plan, phaseProfile, normalRuleReview } = fields(raw, hasReview
        ? ['capture', 'plan', 'phaseProfile', 'normalRuleReview'] : ['capture', 'plan', 'phaseProfile']);
    const state = captures.get(capture);
    if (!state || state.failed) fail('capture_authority_or_poisoned');
    const candidate = takePathQualificationWitnessPreselection({ plan });
    let preselection = freezeDeep({ stage: plan.stage, qualification_id: plan.qualification_id,
        target_id: plan.target_id, method_authority: plan.method_authority,
        domain_sha256: plan.domain_sha256, entries_sha256: plan.entries_sha256,
        conditional_domain_partition: plan.conditional_domain_partition,
        conditional_domain_partition_sha256: plan.conditional_domain_partition_sha256,
        selected: plan.selected, expected_violations: plan.expected_violations,
        site_admission_control_plan_sha256: plan.site_admission_control_plan_sha256,
        selection_admission_control_plan_sha256: plan.selection_admission_control_plan_sha256,
        selection_rule: plan.selection_rule, locator_domain_complete: plan.locator_domain_complete,
        admitted_domain_complete: plan.admitted_domain_complete,
        witness_domain_complete: false, first_witness_proved: false, normal_admission_verified: false,
        disposition: 'blocked', qualified: false, semantic_mutation_credit: 0 });
    let normalCompilePathEntered = false;
    try {
        // Trusted BUILD provisioning, never guest approval or authentication
        // of this caller/receipt. Operational use requires the external pin
        // already confronted with independent code+reference review.
        let reviewPacket = null, reviewSnapshot = null;
        if (hasReview) {
            try { reviewPacket = fields(normalRuleReview, ['snapshotSource', 'expectedReviewHash']); }
            catch { fail('rule_review_packet'); }
            if (typeof reviewPacket.snapshotSource !== 'string' || !reviewPacket.snapshotSource.length
                || reviewPacket.snapshotSource.length > 1048576
                || typeof reviewPacket.expectedReviewHash !== 'string'
                || !/^sha256:[a-f0-9]{64}$/.test(reviewPacket.expectedReviewHash)
                || hash(reviewPacket.snapshotSource) !== reviewPacket.expectedReviewHash) fail('rule_review_pin');
            try {
                reviewSnapshot = JSON.parse(JSON.stringify(copyData(JSON.parse(reviewPacket.snapshotSource))));
                fields(reviewSnapshot, ['format', 'version', 'stage', 'core']);
                if (canonicalValue(reviewSnapshot) !== reviewPacket.snapshotSource
                    || reviewSnapshot.format !== 'financasbot.path-normal-rule-review-snapshot'
                    || reviewSnapshot.version !== 1 || reviewSnapshot.stage !== 'path_v3_normal_rule_review_snapshot_only'
                    || reviewSnapshot.core.target_id !== plan.target_id
                    || canonicalValue(reviewSnapshot.core.method_authority) !== canonicalValue(plan.method_authority)
                    || reviewSnapshot.core.conditional_partition.domain_sha256 !== plan.domain_sha256)
                    fail('rule_review_snapshot');
            } catch { fail('rule_review_snapshot'); }
        }
        const authorship = preparePathCandidateProgramAuthorship({ candidate, phaseProfile });
        const expectation = sealPathCandidateProgramExpectation({ authorship });
        const programPlan = resolvePathCandidateProgramExpectation({ expectation, candidate });
        // Bind the real compiler/checker/recipe bytes BEFORE the first native
        // control C. A control observation can contradict its precommitment,
        // never choose the domain, coordinate or semantic candidate afterwards.
        recheckPathCandidateCapabilities({ expectation });
        const precompileBuildBinding = verifyPathCandidateCapabilityBuildBinding({ expectation, sourceHashes: state.sourceHashes,
            childSourceHashes: state.childSourceHashes, schemaSources: state.schemas, schemaBuildSource: state.schemaBuildSource });
        let reviewDomainSeal = null;
        if (reviewPacket) {
            // Only the invocation identifier is ephemeral. Keep locators,
            // candidate identities, reference values and every other field.
            // This is a content-scoped expectation, not reuse of execution.
            const stableEntries = plan.entries.map(entry => {
                const { invocation_id, ...stable } = entry;
                if (stable.reference !== null) {
                    const { invocation_id: ignored, ...reference } = stable.reference;
                    stable.reference = reference;
                }
                return stable;
            });
            const stablePartition = { ...plan.conditional_domain_partition,
                entries: plan.conditional_domain_partition.entries.map(member => ({ ...member,
                    reference_sha256: stableEntries[member.entry_index].reference === null ? null
                        : hash(canonicalValue(stableEntries[member.entry_index].reference)) })) };
            const siteDomains = plan.admission_foundation.sites.map(site => {
                const members = stablePartition.entries.filter(member => member.site_index === site.site_index);
                return { site_index: site.site_index, L: members.map(member => member.locator_index),
                    A: members.filter(member => ['conditional_witness', 'conditional_non_witness'].includes(member.classification))
                        .map(member => member.locator_index),
                    W: members.filter(member => member.classification === 'conditional_witness').map(member => member.locator_index),
                    excluded: members.filter(member => member.classification === 'necessary_exclusion_pending_native_barrier')
                        .map(member => member.locator_index) };
            });
            // Pertinent rule/reference producer bindings, not a claim that
            // this list alone closes BUILD/TCB. Execution keeps normal freeze
            // admission and an independently reviewed external TCB pin.
            const producerPaths = ['src/next/provenance/pathQualificationV3.js',
                'src/next/provenance/pathLocatorDomainV3.js', 'src/next/provenance/pathMutationInventory.js',
                'src/next/provenance/pathSemanticReference.js', 'scripts/agent/capturePathQualificationCompiler.mjs',
                'scripts/agent/pathProofProgramContract.mjs', 'scripts/agent/pathExecutableClosureContract.mjs',
                'scripts/agent/pathCapabilityEffectContract.mjs', 'scripts/agent/pathReceiverOriginContract.mjs'];
            // Code bytes are not observation scalars. Preserve the entire raw
            // source in bounded scalar chunks so the existing 65536-character
            // scalar and 1MiB aggregate copy quotas remain unchanged.
            const referenceData = expectation.normal_admission_checker_reference;
            const snapshotReference = { ...referenceData };
            for (const key of ['sources', 'schema_reference_sources']) snapshotReference[key] = referenceData[key].map(row => {
                const { source, ...metadata } = row;
                return { ...metadata, source_chunks: Array.from({ length: Math.ceil(source.length / 65536) },
                    (_, index) => source.slice(index * 65536, (index + 1) * 65536)) };
            });
            const core = { method_authority: plan.method_authority, target_id: plan.target_id, target: candidate.target,
                baseline_package: plan.baseline_package, phase_profile_sha256: expectation.profile_sha256,
                compiler: { artifact_root: capture.artifact_root,
                    host_sources_sha256: capture.normal_compiler_source_bindings_sha256,
                    child_sources_sha256: capture.normal_child_source_bindings_sha256 },
                authority_builder_sources: producerPaths.map(path => ({ path,
                    sha256: hash(readFileSync(new URL('../../' + path, import.meta.url))) })),
                normal_rule_reference: snapshotReference,
                entries: stableEntries, conditional_partition: stablePartition, per_site_domains: siteDomains,
                native_control_plans: { unknown: plan.site_admission_control_plan,
                    selection: plan.selection_admission_control_plan },
                scope: 'finite_target_normal_admission_and_independent_witness_not_equivalence',
                qualified: false, semantic_mutation_credit: 0, dp_execution: false, financial_acceptance: false };
            if (canonicalValue(reviewSnapshot.core) !== canonicalValue(core)) fail('rule_review_reference_binding');
            const partition = plan.conditional_domain_partition;
            const first = partition.entries.find(member => member.classification === 'conditional_witness');
            if (!partition.conditional_admission_partition_complete || !partition.conditional_witness_partition_complete
                || partition.entries.some(member => !['necessary_exclusion_pending_native_barrier',
                    'conditional_witness', 'conditional_non_witness'].includes(member.classification))
                || !first || first.entry_index !== plan.selected.entry_index
                || plan.selected.candidate_id !== candidate.candidate_id
                || plan.selected.invocation_id !== candidate.invocation_id) fail('rule_review_domain_incomplete');
            reviewDomainSeal = freezeDeep({ stage: 'path_v3_external_review_bound_domain_seal_before_compile',
                method_authority: plan.method_authority, target_id: plan.target_id,
                candidate_id: candidate.candidate_id, invocation_id: candidate.invocation_id,
                domain_sha256: plan.domain_sha256, entries_sha256: plan.entries_sha256,
                conditional_partition_sha256: plan.conditional_domain_partition_sha256,
                entries: plan.entries, selected: plan.selected, snapshot_core: core,
                per_site_domains: siteDomains,
                snapshot_sha256: reviewPacket.expectedReviewHash,
                admitted_domain_complete: true, witness_domain_complete: true, first_witness_proved: true,
                sealed_before_any_captured_compile: true, constructor_authenticates_review: false,
                qualified: false, semantic_mutation_credit: 0, dp_execution: false });
            // Classifications and first candidate are fixed before ANY native
            // compile. Later C/M/S can only contradict this expectation.
            preselection = freezeDeep({ ...preselection, admitted_domain_complete: true,
                witness_domain_complete: true, first_witness_proved: true,
                review_bound_domain_seal: reviewDomainSeal });
        }
        const unknownControls = [], selectionControls = [];
        const declarations = [
            ...plan.site_admission_control_plan.controls.map((control, index) => ({ mode: 'unknown_path', index, control })),
            ...plan.selection_admission_control_plan.controls.map((control, index) => ({ mode: 'necessary_selection_exclusion', index, control }))
        ];
        for (const declaration of declarations) {
            const nativeCandidate = declaration.mode === 'unknown_path'
                ? materializePathStaticDomainControl({ plan: plan.site_admission_control_plan, siteIndex: declaration.index })
                : materializePathSelectionAdmissionControl({ plan: plan.selection_admission_control_plan, controlIndex: declaration.index });
            normalCompilePathEntered = true;
            const observed = compileCapturedCandidate(capture, nativeCandidate);
            const valid = observed.native_control_matched === true && observed.handle_attempts === 0
                && canonicalValue(observed.worlds.map(world => ({ variant: world.variant, admitted: world.admitted })))
                    === canonicalValue([{ variant: 'C', admitted: true }, { variant: 'M', admitted: false }, { variant: 'S', admitted: true }])
                && canonicalValue(observed.worlds[1].diagnostic.native_coordinate)
                    === canonicalValue(declaration.control.expected_diagnostic)
                && observed.worlds[0].ir_sha256 === observed.worlds[2].ir_sha256;
            const entry = freezeDeep({ control_index: declaration.index, mode: declaration.mode,
                site_index: declaration.mode === 'unknown_path' ? declaration.index : declaration.control.site_index,
                candidate_id: observed.candidate_id, invocation_id: observed.invocation_id,
                compiler_artifact_root: observed.compiler_artifact_root, worlds: observed.worlds,
                native_control_matched: observed.native_control_matched, handle_attempts: observed.handle_attempts,
                qualified: false, semantic_mutation_credit: 0, dp_execution: false });
            if (!valid) {
                state.failed = true;
                const error = new Error('path_qualification_compiler_witness_native_control_contradiction');
                evidence.set(error, freezeDeep({ stage: 'path_v3_witness_native_control_contradiction_before_selected_compile',
                    invocation_id: candidate.invocation_id, candidate_id: candidate.candidate_id,
                    compiler_artifact_root: capture.artifact_root, preselection,
                    expected_control: declaration.control, observed_control: entry,
                    handle_attempts: state.handleAttempts, qualified: false, semantic_mutation_credit: 0 }));
                throw error;
            }
            (declaration.mode === 'unknown_path' ? unknownControls : selectionControls).push(entry);
        }
        // Discharge only facts observed through these genuine native controls.
        // The partition/rule basis already existed before every control M;
        // neither a successful selected M nor a checksum supplies its review.
        const normalReference = expectation.normal_admission_checker_reference;
        const partition = preselection.conditional_domain_partition;
        if (hash(canonicalValue(normalReference.normal_rule_composition)) !== partition.normal_rule_composition_sha256
            || hash(canonicalValue(partition)) !== preselection.conditional_domain_partition_sha256
            || hash(canonicalValue(normalReference)) !== precompileBuildBinding.normal_admission_checker_reference_sha256
            || precompileBuildBinding.normal_admission_checker_source_conformance !== true
            || precompileBuildBinding.normal_package_schema_source_conformance !== true)
            fail('witness_normal_rule_partition_binding');
        const positiveRoots = Object.fromEntries(expectation.whole_ir_reference.worlds
            .filter(world => world.variant !== 'M').map(world => [world.variant, world.package_root]));
        const normalBaselineVerified = unknownControls.length === plan.site_admission_control_plan.controls.length
            && unknownControls.length > 0 && [...unknownControls, ...selectionControls].every(control =>
                control.worlds[0].variant === 'C' && control.worlds[0].admitted === true
                && control.worlds[0].whole_ir_conformance === true
                && control.worlds[0].package_root === positiveRoots.C);
        const restorationVerified = [...unknownControls, ...selectionControls].every(control =>
            control.worlds[2].variant === 'S' && control.worlds[2].admitted === true
            && control.worlds[2].whole_ir_conformance === true
            && control.worlds[2].package_root === positiveRoots.S
            && control.worlds[0].ir_sha256 === control.worlds[2].ir_sha256);
        if (!normalBaselineVerified || !restorationVerified
            || selectionControls.length !== plan.selection_admission_control_plan.controls.length)
            fail('witness_normal_baseline_premise_binding');
        const premiseEvidence = freezeDeep({
            stage: 'path_v3_genuine_normal_admission_premises_before_selected_compile',
            conditional_partition_sha256: preselection.conditional_domain_partition_sha256,
            normal_rule_composition_sha256: partition.normal_rule_composition_sha256,
            normal_admission_checker_reference_sha256: precompileBuildBinding.normal_admission_checker_reference_sha256,
            compiler_artifact_root: capture.artifact_root,
            native_controls_sha256: hash(canonicalValue({ unknownControls, selectionControls })),
            positive_package_roots: positiveRoots,
            normal_baseline_admission_verified: normalBaselineVerified,
            normal_checker_binding_verified: true, site_admission_controls_verified: true,
            normal_positive_restoration_verified: restorationVerified,
            sealed_before_selected_normal_compile: true,
            independent_reviewed_rule_basis_verified: false,
            external_rule_review_scope_byte_binding_verified: reviewDomainSeal !== null,
            whole_selected_actual_program_conformance_verified: false,
            admitted_domain_complete: false, witness_domain_complete: false, first_witness_proved: false,
            execution_permitted: false, qualified: false, semantic_mutation_credit: 0 });
        const nativeControls = freezeDeep({ stage: 'path_v3_genuine_native_site_controls_before_selected_compile',
            unknown_path_control_plan_sha256: plan.site_admission_control_plan_sha256,
            selection_control_plan_sha256: plan.selection_admission_control_plan_sha256,
            // Retain the complete genuine pre-M declarations, not only their
            // hashes. The captured initializer must check every observation
            // against this fixed roster; observed M cannot choose its sites.
            unknown_path_control_plan: plan.site_admission_control_plan,
            selection_control_plan: plan.selection_admission_control_plan,
            normal_rule_review: reviewPacket === null ? null : freezeDeep(reviewPacket),
            review_bound_domain_seal: reviewDomainSeal,
            unknown_path_controls: unknownControls, selection_controls: selectionControls,
            normal_admission_premise_evidence: premiseEvidence,
            native_barriers_verified: true, normal_checker_source_conformance_verified: true,
            selected_normal_compile_started_after_controls: true, compiler_result_used_to_define_domain: false,
            qualified: false, semantic_mutation_credit: 0, dp_execution: false });
        if (reviewDomainSeal) preselection = freezeDeep({ ...preselection, normal_admission_verified: true });
        normalCompilePathEntered = true;
        return compileCapturedCandidate(capture, candidate, expectation, programPlan, preselection, nativeControls);
    } catch (error) {
        state.failed = true;
        // Preserve a deeper compiler/byte contradiction rather than overwriting
        // it with this bridge's bookkeeping. Never release another candidate.
        if (!evidence.has(error)) evidence.set(error, freezeDeep({
            stage: normalCompilePathEntered ? 'path_v3_witness_captured_normal_compile_path_failed'
                : 'path_v3_witness_program_preparation_failed_before_compile',
            normal_compile_path_entered: normalCompilePathEntered,
            invocation_id: candidate.invocation_id, candidate_id: candidate.candidate_id,
            witness_preselection: preselection, compiler_artifact_root: capture.artifact_root,
            handle_attempts: state.handleAttempts, qualified: false, semantic_mutation_credit: 0,
            dp_execution: false, validation_tcb_complete: false }));
        throw error;
    }
}
function compileCapturedCandidate(capture, candidate, expectation, programPlan, witnessPreselection = null, nativeControls = null) {
    const state = captures.get(capture);
    if (!state || state.failed) fail('capture_authority_or_poisoned');
    const input = takePathQualificationCandidatePackage({ candidate });
    const worlds = [], retainedPrograms = new Map(), retainedRuntimeWorlds = [];
    let functionalMetrics = null, metricConformance = null, capabilityConformance = null;
    try {
        if (programPlan && programPlan.wholeIRReference !== input.wholeIRReference) fail('program_whole_ir_binding');
        if (programPlan) {
            try {
                recheckPathCandidateCapabilities({ expectation });
                capabilityConformance = verifyPathCandidateCapabilityBuildBinding({ expectation, sourceHashes: state.sourceHashes,
                    childSourceHashes: state.childSourceHashes, schemaSources: state.schemas, schemaBuildSource: state.schemaBuildSource });
            } catch (error) {
                state.failed = true;
                evidence.set(error, freezeDeep({ capability_conformance_failed: true, stage: 'before_first_normal_compile',
                    invocation_id: candidate.invocation_id, candidate_id: candidate.candidate_id,
                    compiler_artifact_root: capture.artifact_root,
                    normal_compiler_source_bindings_sha256: capture.normal_compiler_source_bindings_sha256,
                    normal_child_source_bindings_sha256: capture.normal_child_source_bindings_sha256,
                    program_expectation: expectation, handle_attempts: state.handleAttempts,
                    qualified: false, semantic_mutation_credit: 0 }));
                throw error;
            }
            try {
                functionalMetrics = buildAvailableMetricArtifacts().built;
                metricConformance = verifyPathCandidateMetrics({ expectation, metrics: functionalMetrics });
            } catch (error) {
                state.failed = true;
                evidence.set(error, freezeDeep({ metric_conformance_failed: true, stage: 'before_first_normal_compile',
                    invocation_id: candidate.invocation_id, candidate_id: candidate.candidate_id,
                    program_expectation: expectation, contradiction: readPathCandidateProgramFailure(error),
                    handle_attempts: state.handleAttempts, qualified: false, semantic_mutation_credit: 0 }));
                throw error;
            }
        }
        const phaseProfile = programPlan ? state.tools.admitPhaseCompositionProfile({ source: programPlan.profile.source,
            registry: admittedDocuments(input.restorationReceipt).find(row => row.value?.registry_id === 'metric_evaluator_registry').value }) : null;
        const inputs = ['C', 'M', 'S'].map(variant => {
            const receipt = variant === 'M' ? input.packageReceipt : input.restorationReceipt;
            const documents = admittedDocuments(receipt);
            if (state.schemas.some(schema => documents.find(row => row.path === schema.path)?.sha256 !== schema.sha256))
                fail('schema_identity');
            const authority = documents.map(({ path, sha256 }) => ({ path, sha256 }));
            const entries = admittedPackageEntries(receipt);
            if (entries.length !== authority.length || entries.some(row => hash(row.bytes)
                !== authority.find(expected => expected.path === row.path)?.sha256)) fail('package_identity');
            const expected = input.wholeIRReference.worlds.find(world => world.variant === variant);
            if (canonicalValue(authority) !== canonicalValue(expected.authority_refs)
                || hash(canonicalValue(authority)) !== expected.package_root) fail('whole_ir_package_binding');
            return { variant, authority, entries };
        });
        // All three exact byte tables are admitted before the first compile.
        for (const world of inputs) world.receipt = state.tools.admitPackage({ entries: world.entries, authority: world.authority });
        for (const world of inputs) {
            const base = { variant: world.variant, package_root: hash(canonicalValue(world.authority)) };
            let ir;
            try {
                ir = state.tools.compileAuthoringIR(world.receipt);
            } catch (error) {
                if (state.failed || world.variant !== 'M') throw error;
                const message = typeof error?.message === 'string' && error.message.length <= 512 ? error.message : null;
                const coordinate = state.tools.readNativePathDiagnostic(error);
                worlds.push({ ...base, admitted: false, graph_count: null, ir_sha256: null,
                    whole_ir_conformance: false, access_descriptor_sha256: null,
                    diagnostic: { message, attributed_rule: null,
                        native_coordinate: coordinate, coordinate_authority: coordinate !== null,
                        forged_same_text_has_authority: state.tools.readNativePathDiagnostic(new Error(message || '')) !== null,
                        static_exclusion_verified: false } });
                continue;
            }
            // Conformance exceptions MUST NOT be recast as a native M rejection.
            // Keep immutable causal bindings and the contradiction, then poison.
            let conformance;
            try {
                conformance = verifyPathCandidateWholeIRReference({ reference: input.wholeIRReference,
                    variant: world.variant, ir });
            } catch (error) {
                state.failed = true;
                evidence.set(error, freezeDeep({ ...base, conformance_failed: true,
                    invocation_id: candidate.invocation_id, candidate_id: candidate.candidate_id,
                    compiler_artifact_root: capture.artifact_root, whole_ir_reference: input.wholeIRReference,
                    normal_compiler_source_bindings_sha256: capture.normal_compiler_source_bindings_sha256,
                    contradiction: readPathWholeIRFailure(error),
                    handle_attempts: state.handleAttempts, qualified: false, semantic_mutation_credit: 0 }));
                throw error;
            }
            let access;
            try {
                access = state.tools.compileSnapshotAccess(world.receipt);
            } catch (error) {
                if (state.failed || world.variant !== 'M') throw error;
                // Captured native rejection is retained, but text has neither
                // ratified rule/coordinate authority nor static proof credit.
                const message = typeof error?.message === 'string' && error.message.length <= 512 ? error.message : null;
                const coordinate = state.tools.readNativePathDiagnostic(error);
                worlds.push({ ...base, admitted: false, graph_count: null, ir_sha256: null,
                    whole_ir_conformance: true, access_descriptor_sha256: null, diagnostic: { message, attributed_rule: null,
                        native_coordinate: coordinate, coordinate_authority: coordinate !== null,
                        forged_same_text_has_authority: state.tools.readNativePathDiagnostic(new Error(message || '')) !== null,
                        static_exclusion_verified: false } });
                continue;
            }
            let programs = null, metricBindings = null, closure = null;
            if (programPlan) {
                const actual = [];
                try {
                    metricBindings = verifyPathCandidateMetricBindings({ expectation, variant: world.variant,
                        bindings: ir.order.map(factKey => {
                            const graph = ir.graphs.find(graph => graph.fact_key === factKey);
                            return { fact_key: factKey, evaluator_ref: graph.evaluator_ref,
                                claim: graph.claim, operands: graph.operands,
                                derivation_bindings: access.projectDerivationBindings({ fact_key: factKey }) };
                        }) });
                    for (const factKey of ir.order) actual.push({ fact_key: factKey, candidate: buildPhaseProofProgram({
                        derivation: access.projectDerivationProgram({ fact_key: factKey }, phaseProfile).input,
                        proof: access.projectProofProgram({ fact_key: factKey }).input }, programPlan.phaseProfile) });
                    programs = verifyPathCandidatePrograms({ expectation, variant: world.variant, programs: actual });
                    closure = verifyPathCandidateClosure({ expectation, variant: world.variant,
                        programs: actual, metrics: functionalMetrics });
                    // Retain actual NORMAL builder bytes after passive conformance,
                    // never substitute the expected program as the observed artifact.
                    retainedPrograms.set(world.variant, freezeDeep(actual.map(row => {
                        const { source, manifest, ...metadata } = fields(row.candidate, Object.keys(row.candidate));
                        return { fact_key: row.fact_key, candidate: { source, manifest,
                            ...JSON.parse(JSON.stringify(copyData(metadata))) } };
                    })));
                    if (witnessPreselection) {
                        const factKey = candidate.target.fact_key, selector = { fact_key: factKey };
                        const graph = ir.graphs.find(row => row.fact_key === factKey);
                        const program = actual.find(row => row.fact_key === factKey).candidate;
                        const metric = functionalMetrics.find(row => row.evaluator_id === graph.evaluator_ref.evaluator_id);
                        const documents = admittedDocuments(world.variant === 'M' ? input.packageReceipt : input.restorationReceipt);
                        const registry = documents.find(row => row.value?.registry_id === 'metric_evaluator_registry').value;
                        const entry = registry.entries.find(row => row.evaluator_id === graph.evaluator_ref.evaluator_id);
                        const contract = documents.find(row => row.path === entry.contract_path);
                        const dProgram = access.projectDerivationProgram(selector, phaseProfile).input;
                        const pProgram = access.projectProofProgram(selector).input;
                        const { proofProgramIdentity } = require('../../src/next/provenance/phaseProgramIdentity');
                        const { phaseCompositionCommitment } = require('../../src/next/provenance/phaseCompositionProfile');
                        const metricTransport = access.projectMetricTransport(selector);
                        const proofTransport = access.projectProofTransport(selector);
                        retainedRuntimeWorlds.push({ variant: world.variant, package_root: base.package_root,
                            proof_program_id: proofProgramIdentity(pProgram, dProgram, phaseCompositionCommitment(programPlan.phaseProfile).sha256),
                            evaluator_ref: JSON.parse(JSON.stringify(copyData(graph.evaluator_ref))),
                            registry_source: buildExecutionRegistryCandidate().bytes,
                            contract_source: admittedPackageEntries(world.variant === 'M' ? input.packageReceipt : input.restorationReceipt)
                                .find(row => row.path === contract.path).bytes.toString('utf8'),
                            metric_artifact: { manifest: metric.manifest, entries: [{ path: 'bundle.js', source: metric.source }] },
                            proof_artifact: { manifest: program.manifest, entries: [{ path: 'bundle.js', source: program.source },
                                ...(program.profileInput ? [{ path: program.profileInput.path, source: program.profileInput.source }] : [])] },
                            derivation: JSON.parse(JSON.stringify(copyData({ bindings: [], directGroups: metricTransport.directGroups,
                                nodeSets: metricTransport.nodeSets, parentGroups: metricTransport.parentGroups,
                                derivationBindings: access.projectDerivationBindings(selector) }))),
                            proof: JSON.parse(JSON.stringify(copyData(proofTransport.config))), timeout_ms: 5000 });
                    }
                } catch (error) {
                    state.failed = true;
                    evidence.set(error, freezeDeep({ ...base, program_conformance_failed: true,
                        invocation_id: candidate.invocation_id, candidate_id: candidate.candidate_id,
                        compiler_artifact_root: capture.artifact_root, program_expectation: expectation,
                        contradiction: readPathCandidateProgramFailure(error),
                        actual_programs: actual.map(row => {
                            const source = types.isProxy(row.candidate) ? null : Object.getOwnPropertyDescriptor(row.candidate, 'source');
                            return { fact_key: row.fact_key, source_sha256: typeof source?.value === 'string' ? hash(source.value) : null };
                        }), handle_attempts: state.handleAttempts, qualified: false, semantic_mutation_credit: 0 }));
                    throw error;
                }
            }
            worlds.push({ ...base, admitted: true, graph_count: ir.graphs.length,
                ir_sha256: conformance.ir_sha256, whole_ir_conformance: true,
                ...(programs ? { program_count: programs.program_count, programs_sha256: programs.programs_sha256,
                    whole_phase_program_conformance: programs.whole_phase_program_conformance,
                    module_closure_conformance: closure.module_closure_conformance,
                    static_call_binding_conformance: closure.static_call_binding_conformance,
                    function_boundary_conformance: closure.function_boundary_conformance,
                    conditional_receiver_reference_conformance: closure.conditional_receiver_reference_conformance,
                    conditional_receiver_reference_sha256: closure.conditional_receiver_reference_sha256,
                    effect_obligation_conformance: closure.effect_obligation_conformance,
                    effect_composition_reference_sha256: closure.effect_composition_reference_sha256,
                    effect_composition_status: closure.effect_composition_status,
                    effect_closure_complete: false,
                    operational_receiver_authority: false,
                    module_closure_sha256: closure.module_closure_sha256,
                    metric_count: metricConformance.metric_count, functional_metric_conformance: true,
                    metric_artifacts_sha256: metricConformance.metric_artifacts_sha256,
                    metric_bindings_count: metricBindings.metric_bindings_count,
                    metric_bindings_sha256: metricBindings.metric_bindings_sha256 } : {}),
                access_descriptor_sha256: hash(canonicalValue({ stage: access.stage,
                    executable: access.executable, snapshot_count: access.snapshot_count })), diagnostic: null });
        }
        if (worlds[0].ir_sha256 !== worlds[2].ir_sha256
            || worlds[0].access_descriptor_sha256 !== worlds[2].access_descriptor_sha256) fail('restoration');
        // Readonly diagnosis on this genuine captured result, not a new
        // admission rule, semantic proof or execution authority. Observed
        // compilation cannot retroactively complete the pre-M A/W domains.
        let witnessPrerequisites = null;
        if (witnessPreselection) {
            const referencePreselected = witnessPreselection.selected?.candidate_id === candidate.candidate_id
                && witnessPreselection.selected?.invocation_id === candidate.invocation_id
                && witnessPreselection.selected?.reference_sha256 === hash(canonicalValue(input.reference))
                && input.reference.discriminating === true;
            const selectedCompilationComplete = worlds.length === 3
                && worlds.every((world, index) => world.variant === ['C', 'M', 'S'][index]
                    && world.admitted === true && world.whole_ir_conformance === true
                    && world.whole_phase_program_conformance === true);
            const blockers = [];
            if (!referencePreselected) blockers.push('preselected_reference_binding_incomplete');
            if (!witnessPreselection.admitted_domain_complete) blockers.push('admitted_domain_incomplete');
            if (!witnessPreselection.first_witness_proved) blockers.push('first_witness_not_proved');
            if (!witnessPreselection.normal_admission_verified) blockers.push('normal_site_admission_controls_incomplete');
            if (worlds.some(world => world.admitted === false)) blockers.push('selected_candidate_normal_compile_rejected');
            else if (!selectedCompilationComplete) blockers.push('selected_candidate_program_conformance_incomplete');
            // This BUILD capture has no reviewed execution TCB or ticket.
            // In particular, consumer-absence/equivalence is not imposed as
            // an extra semantic-witness requirement by this diagnostic.
            blockers.push('reviewed_tcb_and_execution_ticket_missing');
            witnessPrerequisites = {
                stage: 'path_v3_witness_execution_prerequisites_not_authority',
                candidate_id: candidate.candidate_id, invocation_id: candidate.invocation_id,
                reference_preselected: referencePreselected,
                selected_candidate_normal_compilation_complete: selectedCompilationComplete,
                blockers, execution_permitted: false, qualified: false, semantic_mutation_credit: 0
            };
        }
        const result = freezeDeep({ stage: 'path_v3_captured_normal_compile_controls_only',
            invocation_id: candidate.invocation_id, target_id: candidate.target_id, candidate_id: candidate.candidate_id,
            compiler_artifact_root: capture.artifact_root, reference: input.reference, worlds,
            whole_ir_reference: input.wholeIRReference,
            ...(witnessPreselection ? { witness_preselection: witnessPreselection,
                witness_execution_prerequisites: witnessPrerequisites,
                witness_site_admission_controls: nativeControls } : {}),
            executable_consumer_absence_proved: false,
            ...(programPlan ? { program_expectation: expectation,
                normal_admission_checker_source_conformance: capabilityConformance.normal_admission_checker_source_conformance,
                normal_package_schema_source_conformance: capabilityConformance.normal_package_schema_source_conformance,
                normal_admission_checker_reference_sha256: capabilityConformance.normal_admission_checker_reference_sha256,
                normal_admission_rule_discharge_complete: capabilityConformance.normal_admission_rule_discharge_complete,
                normal_capability_source_conformance: capabilityConformance.normal_capability_source_conformance,
                normal_capability_reference_sha256: capabilityConformance.normal_capability_reference_sha256,
                normal_child_abi_source_conformance: capabilityConformance.normal_child_abi_source_conformance,
                normal_child_abi_reference_sha256: capabilityConformance.normal_child_abi_reference_sha256,
                guest_call_provenance_complete: false,
                lowerer_capture_scope: 'normal_host_BUILD_output_conformance_only_not_hermetic_TCB' } : {}),
            normal_compiler_source_bindings_sha256: capture.normal_compiler_source_bindings_sha256,
            selection_binding_source_sha256: capture.selection_binding_source_sha256,
            handle_attempts: state.handleAttempts, access_descriptor_scope: 'stage_executable_snapshot_count_only',
            native_control_matched: ['unknown_path_control_for_empty_L', 'unknown_path_control_for_witness_site', 'typed_locator_exclusion_control'].includes(candidate.candidate_kind)
                && worlds[1].admitted === false && worlds[1].diagnostic.native_coordinate !== null
                && worlds[1].diagnostic.forged_same_text_has_authority === false
                && canonicalValue(worlds[1].diagnostic.native_coordinate) === canonicalValue(candidate.expected_diagnostic),
            qualified: false, semantic_mutation_credit: 0, dp_execution: false, validation_tcb_complete: false,
            independent_compiler_execution: false, financial_acceptance: false });
        // Keep the contradictory evidence, but do not permit another M under
        // this capture to search for a matching rejection after the sealed
        // control failed. A new candidate/capture cannot rewrite this result.
        if (['unknown_path_control_for_empty_L', 'unknown_path_control_for_witness_site', 'typed_locator_exclusion_control'].includes(candidate.candidate_kind)
            && !result.native_control_matched) state.failed = true;
        evidence.set(result, result);
        if (programPlan) programArtifacts.set(result, retainedPrograms);
        if (programPlan) metricArtifacts.set(result, freezeDeep(functionalMetrics.map(row =>
            JSON.parse(JSON.stringify(copyData(row))))));
        if (witnessPreselection) executionPayloads.set(result, freezeDeep({ target_fact_key: candidate.target.fact_key,
            payload: { worlds: retainedRuntimeWorlds, normal_admission_basis: {
                stage: 'path_v3_captured_normal_admission_basis_not_independent_review',
                conditional_partition: witnessPreselection.conditional_domain_partition,
                normal_rule_reference: expectation.normal_admission_checker_reference,
                premise_evidence: nativeControls.normal_admission_premise_evidence,
                native_controls: nativeControls, normal_worlds: worlds,
                independent_reviewed_rule_basis_verified: false, qualified: false, semantic_mutation_credit: 0
            } } }));
        return result;
    } catch (error) { state.failed = true; throw error; }
}
export function readPathQualificationCompilerEvidence(raw) { return evidence.get(raw) ?? null; }
// BUILD transport only. The caller cannot supply roots, IDs, references or
// readiness flags. One issue per genuine result; a clone/error has no brand.
// An external independently reviewed provisioning pin is still mandatory at
// the captured bootstrap. This computed commitment is NOT that review.
export function preparePathQualificationExecutionTransport(raw) {
    const { result } = fields(raw, ['result']);
    const payload = executionPayloads.get(result);
    if (!payload || evidence.get(result) !== result || !result.witness_preselection
        || issuedExecutionTransports.has(result)) fail('execution_transport_origin_or_replay');
    issuedExecutionTransports.add(result);
    const preselection = result.witness_preselection, readiness = result.witness_execution_prerequisites;
    const payloadSource = canonicalValue(payload.payload);
    const commitment = source => hash(canonicalValue({ source }));
    const ticket = { stage: 'path_v3_execution_ticket_not_financial_authority',
        method_commit: preselection.method_authority.commit, candidate_id: result.candidate_id,
        invocation_id: result.invocation_id, target_fact_key: payload.target_fact_key,
        reference: result.reference, reference_commitment: hash(canonicalValue(result.reference)),
        preselection_commitments: { entries_sha256: preselection.entries_sha256, domain_sha256: preselection.domain_sha256 },
        normal_admission_basis_commitment: commitment(canonicalValue(payload.payload.normal_admission_basis)),
        prerequisites: { admitted_domain_complete: preselection.admitted_domain_complete,
            witness_domain_complete: preselection.witness_domain_complete, first_witness_proved: preselection.first_witness_proved,
            normal_admission_verified: preselection.normal_admission_verified,
            reference_preselected: readiness.reference_preselected,
            normal_compilation_complete: readiness.selected_candidate_normal_compilation_complete && payload.payload.worlds.length === 3 },
        payload_commitment: commitment(payloadSource), worlds: result.worlds.map(world => ({ variant: world.variant,
            execution_id: `path-v3/${result.invocation_id}/${world.variant}`, package_root: world.package_root })) };
    const ticketSource = canonicalValue(ticket);
    return freezeDeep({ stage: 'path_v3_build_execution_transport_not_reviewed_pin', ticketSource, payloadSource,
        measured_ticket_commitment: commitment(ticketSource), qualified: false, semantic_mutation_credit: 0 });
}
export function readPathQualificationProgramsEvidence(raw) {
    const { result, variant } = fields(raw, ['result', 'variant']);
    const programs = programArtifacts.get(result);
    if (!programs || typeof variant !== 'string' || !['C', 'M', 'S'].includes(variant)
        || !programs.has(variant)) fail('program_evidence_origin_or_no_program');
    return programs.get(variant);
}
export function readPathQualificationMetricEvidence(raw) {
    const { result } = fields(raw, ['result']);
    const metrics = metricArtifacts.get(result);
    if (!metrics) fail('metric_evidence_origin');
    return metrics;
}
