'use strict';

// Captured DEVELOPMENT tools, not the product API or financial authority.
// All require edges are fulfilled by the closed byte table, never ambient
// project/node_modules resolution. The launcher exposes only the private
// initializer; diagnostic methods below are not the guest/product API.
const { admitPackage } = require('./packageContract');
const { compileSnapshotAccess, compileAuthoringIR, prepareClaimMonthQualification, compileClaimMonthQualificationIR,
    compileClaimMonthQualificationAccess, prepareClaimMonthIsolatedPlan, assertClaimMonthIsolatedProgram,
    sealClaimMonthIsolatedLowering, admitClaimMonthIsolatedProof, admitClaimMonthFrozenBaseline } = require('./graphCompiler');
const { admitArtifact } = require('./artifactLoader');
const { admitPhaseCompositionProfile, phaseCompositionCommitment } = require('./phaseCompositionProfile');
const { runAdmittedGraph, runClaimMonthQualifiedGraph } = require('./executionHost');
const { comparePhaseCoverage } = require('./proofAcceptance');
const { sealClaimMonthTargetTrace, compareClaimMonthTargetTrace, sealClaimMonthCoreTrace, compareClaimMonthCoreTrace } = require('./claimMonthTraceContract');
const { admitExecutionRegistry, admitExecutionContract } = require('./executionRegistry');
const { admitExecutionFreeze, admitFrozenArtifact } = require('./freezeContract');
const { verifyNativeRuntime } = require('./nativeRuntime');
const { createPrivateFinancialHost } = require('./financialHost');
const { EXECUTION_PROFILE } = require('./executionProfile');
const validators = require('../vendor/schemaValidators');
const { readPredicateTypeDiagnostic } = require('./predicateTypes');
const { readTemplateReferenceDiagnostic } = require('./templateReferences');
const { readGraphStructureDiagnostic } = require('./graphStructure');
const { readSelectionBindingDiagnostic } = require('./selectionBindings');
const { types } = require('node:util');
const { createHash } = require('node:crypto');
const { canonicalValue, digest, freezeDeep } = require('../kernel/canonicalValue');
const { copyData, identifier } = require('./observationContract');
const { artifactContents } = require('./artifactLoader');
const { freezeContents } = require('./freezeContract');
const { resolveExecutionEvaluator } = require('./executionRegistry');

// Trusted INTERNAL provisioning only. An independently reviewed external pin
// binds the exact serialized BUILD request; serialization does NOT transfer a
// WeakMap brand between the compiler and captured host. This factory cannot
// authenticate a human, authenticate its own caller/pin or qualify a row.
function initializePathQualification(raw, bootstrap) {
    const fail = code => { throw new Error(`captured_path_${code}`); };
    const own = (value, names) => {
        if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value)
            || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('input');
        const d = Object.getOwnPropertyDescriptors(value);
        if (Reflect.ownKeys(d).length !== names.length || names.some(name => !d[name]?.enumerable
            || !Object.hasOwn(d[name], 'value'))) fail('input');
        return Object.fromEntries(names.map(name => [name, d[name].value]));
    };
    const commitment = source => `sha256:${digest({ source })}`;
    const data = own(raw, ['ticketSource', 'payloadSource', 'expectedTicketCommitment']);
    if (typeof data.ticketSource !== 'string' || !data.ticketSource.length || data.ticketSource.length > 1048576
        || typeof data.payloadSource !== 'string' || !data.payloadSource.length || data.payloadSource.length > 16 * 1024 * 1024
        || typeof data.expectedTicketCommitment !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(data.expectedTicketCommitment)
        || commitment(data.ticketSource) !== data.expectedTicketCommitment) fail('ticket_pin');
    let ticket, payload;
    try {
        ticket = JSON.parse(data.ticketSource); payload = JSON.parse(data.payloadSource);
        if (canonicalValue(ticket) !== data.ticketSource || canonicalValue(payload) !== data.payloadSource) fail('canonical');
        ticket = JSON.parse(JSON.stringify(copyData(ticket)));
    } catch { fail('transport'); }
    own(ticket, ['stage', 'method_commit', 'candidate_id', 'invocation_id', 'target_fact_key', 'reference',
        'reference_commitment', 'preselection_commitments', 'normal_admission_basis_commitment',
        'prerequisites', 'payload_commitment', 'worlds']);
    if (ticket.stage !== 'path_v3_execution_ticket_not_financial_authority'
        || ticket.method_commit !== '72fc5a5b707909687da9b5cec892be2dcc892a62'
        || !identifier(ticket.candidate_id) || !identifier(ticket.invocation_id) || !identifier(ticket.target_fact_key)
        || commitment(data.payloadSource) !== ticket.payload_commitment
        || `sha256:${digest(ticket.reference)}` !== ticket.reference_commitment
        || ticket.reference.candidate_id !== ticket.candidate_id || ticket.reference.invocation_id !== ticket.invocation_id
        || ticket.reference.discriminating !== true) fail('binding');
    own(ticket.preselection_commitments, ['entries_sha256', 'domain_sha256']);
    if (Object.values(ticket.preselection_commitments).some(value => typeof value !== 'string'
        || !/^sha256:[a-f0-9]{64}$/.test(value))) fail('preselection');
    const prerequisites = own(ticket.prerequisites, ['admitted_domain_complete', 'witness_domain_complete',
        'first_witness_proved', 'normal_admission_verified', 'reference_preselected', 'normal_compilation_complete']);
    if (Object.values(prerequisites).some(value => typeof value !== 'boolean')) fail('prerequisites_shape');
    if (!Array.isArray(ticket.worlds) || ticket.worlds.length !== 3
        || ticket.worlds.map(world => world.variant).join(',') !== 'C,M,S') fail('worlds');
    const ids = new Set();
    for (const world of ticket.worlds) {
        own(world, ['variant', 'execution_id', 'package_root']);
        if (!identifier(world.execution_id) || ids.has(world.execution_id)
            || !/^sha256:[a-f0-9]{64}$/.test(world.package_root)) fail('world_identity');
        ids.add(world.execution_id);
    }
    own(payload, ['worlds', 'normal_admission_basis']);
    const normalBasis = own(payload.normal_admission_basis, ['stage', 'conditional_partition', 'normal_rule_reference',
        'premise_evidence', 'native_controls', 'normal_worlds', 'independent_reviewed_rule_basis_verified',
        'qualified', 'semantic_mutation_credit']);
    if (normalBasis.stage !== 'path_v3_captured_normal_admission_basis_not_independent_review'
        || normalBasis.independent_reviewed_rule_basis_verified !== false || normalBasis.qualified !== false
        || normalBasis.semantic_mutation_credit !== 0
        || commitment(canonicalValue(payload.normal_admission_basis)) !== ticket.normal_admission_basis_commitment)
        fail('normal_admission_basis_binding');
    // Hashes bind transport bytes, not the relations between those bytes.
    // Recheck the finite pre-M basis against its separately retained premises,
    // controls and ticket identities. This is not caller authentication or
    // independent review of the normal rules.
    const emptyBasis = ['conditional_partition', 'normal_rule_reference', 'premise_evidence', 'native_controls']
        .every(name => normalBasis[name] === null) && Array.isArray(normalBasis.normal_worlds)
        && normalBasis.normal_worlds.length === 0;
    if (!emptyBasis) {
        try {
            const partition = normalBasis.conditional_partition, reference = normalBasis.normal_rule_reference;
            const premise = normalBasis.premise_evidence, controls = normalBasis.native_controls;
            const composition = reference.normal_rule_composition;
            const allControls = [...controls.unknown_path_controls, ...controls.selection_controls];
            const ruleReview = controls.normal_rule_review, domainSeal = controls.review_bound_domain_seal;
            if (ruleReview === null && domainSeal === null) {
                if (premise.external_rule_review_scope_byte_binding_verified !== false
                    || ['admitted_domain_complete', 'witness_domain_complete', 'first_witness_proved',
                        'normal_admission_verified'].some(name => prerequisites[name] !== false))
                    fail('normal_admission_basis_relation');
            } else {
                // Imported trusted-bootstrap scope, not authentication of a
                // human/receipt or an audit performed by this initializer.
                const packet = own(ruleReview, ['snapshotSource', 'expectedReviewHash']);
                if (typeof packet.snapshotSource !== 'string' || !packet.snapshotSource.length
                    || packet.snapshotSource.length > 1048576 || typeof packet.expectedReviewHash !== 'string'
                    || packet.expectedReviewHash !== 'sha256:' + createHash('sha256').update(packet.snapshotSource).digest('hex'))
                    fail('normal_admission_basis_relation');
                const snapshot = JSON.parse(packet.snapshotSource);
                own(snapshot, ['format', 'version', 'stage', 'core']);
                const stableEntries = domainSeal.entries.map(entry => {
                    const { invocation_id, ...stable } = entry;
                    if (stable.reference !== null) {
                        const { invocation_id: ignored, ...semantic } = stable.reference;
                        stable.reference = semantic;
                    }
                    return stable;
                });
                const stablePartition = { ...partition, entries: partition.entries.map(member => ({ ...member,
                    reference_sha256: stableEntries[member.entry_index].reference === null ? null
                        : `sha256:${digest(stableEntries[member.entry_index].reference)}` })) };
                const core = snapshot.core, selected = domainSeal.selected;
                const decodedReference = { ...core.normal_rule_reference };
                for (const key of ['sources', 'schema_reference_sources']) decodedReference[key] = core.normal_rule_reference[key].map(row => {
                    own(row, ['path', 'sha256', 'source_chunks']);
                    if (!Array.isArray(row.source_chunks) || !row.source_chunks.length
                        || row.source_chunks.some((source, index) => typeof source !== 'string' || !source.length
                            || source.length > 65536 || index < row.source_chunks.length - 1 && source.length !== 65536))
                        fail('normal_admission_basis_relation');
                    const source = row.source_chunks.join('');
                    if (row.sha256 !== 'sha256:' + createHash('sha256').update(source).digest('hex'))
                        fail('normal_admission_basis_relation');
                    return { path: row.path, sha256: row.sha256, source };
                });
                const first = partition.entries.find(member => member.classification === 'conditional_witness');
                const siteDomains = composition.sites.map(site => {
                    const members = stablePartition.entries.filter(member => member.site_index === site.site_index);
                    return { site_index: site.site_index, L: members.map(member => member.locator_index),
                        A: members.filter(member => ['conditional_witness', 'conditional_non_witness'].includes(member.classification))
                            .map(member => member.locator_index),
                        W: members.filter(member => member.classification === 'conditional_witness').map(member => member.locator_index),
                        excluded: members.filter(member => member.classification === 'necessary_exclusion_pending_native_barrier')
                            .map(member => member.locator_index) };
                });
                if (canonicalValue(snapshot) !== packet.snapshotSource
                    || snapshot.format !== 'financasbot.path-normal-rule-review-snapshot' || snapshot.version !== 1
                    || snapshot.stage !== 'path_v3_normal_rule_review_snapshot_only'
                    || canonicalValue(domainSeal.snapshot_core) !== canonicalValue(core)
                    || canonicalValue(core.entries) !== canonicalValue(stableEntries)
                    || canonicalValue(core.per_site_domains) !== canonicalValue(siteDomains)
                    || canonicalValue(domainSeal.per_site_domains) !== canonicalValue(siteDomains)
                    || canonicalValue(core.conditional_partition) !== canonicalValue(stablePartition)
                    || canonicalValue(decodedReference) !== canonicalValue(reference)
                    || canonicalValue(core.method_authority) !== canonicalValue(reference.method_authority)
                    || canonicalValue(core.native_control_plans.unknown) !== canonicalValue(controls.unknown_path_control_plan)
                    || canonicalValue(core.native_control_plans.selection) !== canonicalValue(controls.selection_control_plan)
                    || core.compiler.artifact_root !== premise.compiler_artifact_root
                    || core.target_id !== partition.target_id || core.target.fact_key !== ticket.target_fact_key
                    || core.scope !== 'finite_target_normal_admission_and_independent_witness_not_equivalence'
                    || core.qualified !== false || core.semantic_mutation_credit !== 0 || core.dp_execution !== false
                    || core.financial_acceptance !== false
                    || domainSeal.stage !== 'path_v3_external_review_bound_domain_seal_before_compile'
                    || domainSeal.snapshot_sha256 !== packet.expectedReviewHash
                    || domainSeal.candidate_id !== ticket.candidate_id || domainSeal.invocation_id !== ticket.invocation_id
                    || domainSeal.target_id !== partition.target_id || domainSeal.domain_sha256 !== partition.domain_sha256
                    || domainSeal.entries_sha256 !== ticket.preselection_commitments.entries_sha256
                    || domainSeal.entries_sha256 !== `sha256:${digest(domainSeal.entries)}`
                    || domainSeal.conditional_partition_sha256 !== `sha256:${digest(partition)}`
                    || ['admitted_domain_complete', 'witness_domain_complete', 'first_witness_proved',
                        'sealed_before_any_captured_compile'].some(name => domainSeal[name] !== true)
                    || domainSeal.constructor_authenticates_review !== false || domainSeal.qualified !== false
                    || domainSeal.semantic_mutation_credit !== 0 || domainSeal.dp_execution !== false
                    || premise.external_rule_review_scope_byte_binding_verified !== true
                    || ['admitted_domain_complete', 'witness_domain_complete', 'first_witness_proved',
                        'normal_admission_verified'].some(name => prerequisites[name] !== true)
                    || !partition.conditional_admission_partition_complete || !partition.conditional_witness_partition_complete
                    || partition.entries.some(member => !['necessary_exclusion_pending_native_barrier',
                        'conditional_witness', 'conditional_non_witness'].includes(member.classification))
                    || !first || first.entry_index !== selected.entry_index
                    || selected.candidate_id !== ticket.candidate_id || selected.invocation_id !== ticket.invocation_id
                    || domainSeal.entries[selected.entry_index].candidate_id !== ticket.candidate_id
                    || domainSeal.entries[selected.entry_index].invocation_id !== ticket.invocation_id
                    || canonicalValue(domainSeal.entries[selected.entry_index].reference) !== canonicalValue(ticket.reference))
                    fail('normal_admission_basis_relation');
            }
            const controlCandidates = new Set([ticket.candidate_id]), controlInvocations = new Set([ticket.invocation_id]);
            const groups = [
                { mode: 'unknown_path', plan: controls.unknown_path_control_plan,
                    sha256: controls.unknown_path_control_plan_sha256, observations: controls.unknown_path_controls },
                { mode: 'necessary_selection_exclusion', plan: controls.selection_control_plan,
                    sha256: controls.selection_control_plan_sha256, observations: controls.selection_controls }
            ];
            // One finite relational check for both normal control families.
            // Transport hashes and duplicated true flags are not discharge.
            // The declarations were sealed before C/M/S; no observed rejection
            // may supply a new roster, coordinate, mode or execution identity.
            for (const group of groups) {
                if (`sha256:${digest(group.plan)}` !== group.sha256
                    || group.plan.domain_sha256 !== partition.domain_sha256
                    || group.plan.target_id !== partition.target_id
                    || canonicalValue(group.plan.method_authority) !== canonicalValue(reference.method_authority)
                    || !Array.isArray(group.plan.controls) || !Array.isArray(group.observations)
                    || group.plan.controls.length !== group.observations.length
                    || (group.mode === 'unknown_path' && group.plan.controls.length !== composition.sites.length))
                    fail('normal_admission_basis_relation');
                group.observations.forEach((control, index) => {
                    const declared = group.plan.controls[index];
                    const siteIndex = group.mode === 'unknown_path' ? index : declared.site_index;
                    if (control.mode !== group.mode || control.control_index !== index || control.site_index !== siteIndex
                        || !Number.isSafeInteger(siteIndex) || siteIndex < 0
                        || composition.sites[siteIndex]?.site_index !== siteIndex
                        || declared.expected_diagnostic.fact_key !== ticket.target_fact_key
                        || control.native_control_matched !== true || control.handle_attempts !== 0
                        || !identifier(control.candidate_id) || !identifier(control.invocation_id)
                        || controlCandidates.has(control.candidate_id) || controlInvocations.has(control.invocation_id)
                        || control.qualified !== false || control.semantic_mutation_credit !== 0 || control.dp_execution !== false
                        || control.worlds[1].variant !== 'M' || control.worlds[1].admitted !== false
                        || control.worlds[1].diagnostic.forged_same_text_has_authority !== false
                        || canonicalValue(control.worlds[1].diagnostic.native_coordinate)
                            !== canonicalValue(declared.expected_diagnostic)) fail('normal_admission_basis_relation');
                    controlCandidates.add(control.candidate_id); controlInvocations.add(control.invocation_id);
                });
            }
            if (partition.domain_sha256 !== ticket.preselection_commitments.domain_sha256
                || composition.domain_sha256 !== partition.domain_sha256
                || canonicalValue(partition.method_authority) !== canonicalValue(reference.method_authority)
                || canonicalValue(composition.method_authority) !== canonicalValue(reference.method_authority)
                || partition.normal_rule_composition_sha256 !== `sha256:${digest(composition)}`
                || reference.normal_rule_composition_sha256 !== partition.normal_rule_composition_sha256
                || premise.normal_rule_composition_sha256 !== partition.normal_rule_composition_sha256
                || premise.conditional_partition_sha256 !== `sha256:${digest(partition)}`
                || premise.normal_admission_checker_reference_sha256 !== `sha256:${digest(reference)}`
                || canonicalValue(controls.normal_admission_premise_evidence) !== canonicalValue(premise)
                || controls.native_barriers_verified !== true || controls.normal_checker_source_conformance_verified !== true
                || controls.selected_normal_compile_started_after_controls !== true
                || controls.compiler_result_used_to_define_domain !== false
                || premise.native_controls_sha256 !== `sha256:${digest({ unknownControls: controls.unknown_path_controls,
                    selectionControls: controls.selection_controls })}`
                || ['normal_baseline_admission_verified', 'normal_checker_binding_verified',
                    'site_admission_controls_verified', 'normal_positive_restoration_verified',
                    'sealed_before_selected_normal_compile'].some(name => premise[name] !== true)
                || controls.unknown_path_controls.length === 0 || allControls.some(control =>
                    control.compiler_artifact_root !== premise.compiler_artifact_root
                    || control.worlds.length !== 3 || control.worlds.map(world => world.variant).join(',') !== 'C,M,S'
                    || [0, 2].some(index => control.worlds[index].admitted !== true
                        || control.worlds[index].whole_ir_conformance !== true
                        || control.worlds[index].package_root !== premise.positive_package_roots[control.worlds[index].variant])
                    || control.worlds[0].ir_sha256 !== control.worlds[2].ir_sha256)
                || !Array.isArray(normalBasis.normal_worlds) || normalBasis.normal_worlds.length !== 3
                || normalBasis.normal_worlds.some((world, index) => world.variant !== ticket.worlds[index].variant
                    || world.package_root !== ticket.worlds[index].package_root)
                || premise.positive_package_roots.C !== ticket.worlds[0].package_root
                || premise.positive_package_roots.S !== ticket.worlds[2].package_root)
                fail('normal_admission_basis_relation');
        } catch { fail('normal_admission_basis_relation'); }
    }
    const boot = own(bootstrap, ['freezeBytes', 'expectedFreezeHash', 'tcbArtifact']);
    // Pure byte admission before runtime/child handles. Runtime is remeasured
    // only inside run, after all prerequisite and artifact bindings pass.
    const freezeReceipt = admitExecutionFreeze({ bytes: boot.freezeBytes, expectedHash: boot.expectedFreezeHash });
    const tcbArtifactReceipt = admitFrozenArtifact({ freezeReceipt, kind: 'tcb', programId: null,
        ...own(boot.tcbArtifact, ['manifestBytes', 'entries']) });
    const tcb = artifactContents(tcbArtifactReceipt), freeze = freezeContents(freezeReceipt);
    if (tcb.entry !== 'launcher-bootstrap.js' || tcb.files.map(row => row.path).join(',')
        !== 'child-bootstrap.js,host-bootstrap.js,launcher-bootstrap.js,recipe.json') fail('tcb_inventory');
    const frozenTicket = freezeDeep(ticket);
    let used = false;
    const host = Object.freeze({ stage: 'captured_path_qualification_prepared_only',
        candidate_id: ticket.candidate_id, invocation_id: ticket.invocation_id,
        ticket_commitment: data.expectedTicketCommitment, reference_commitment: ticket.reference_commitment,
        execution_permitted: false, qualified: false, semantic_mutation_credit: 0, financial_acceptance: false,
        async run() {
            if (this !== host || arguments.length) fail('origin');
            if (used) fail('replay'); used = true;
            if (Object.values(prerequisites).some(value => value !== true)) fail('prerequisites');
            if (!Array.isArray(payload.worlds) || payload.worlds.length !== 3) fail('payload_worlds');
            // Validate the entire closed transport before converting any caller
            // JSON value to bytes. Buffer.from also accepts array-like objects;
            // those are not UTF8 sources in this provisioning contract.
            const rows = payload.worlds.map((value, index) => {
                const row = own(value, ['variant', 'package_root', 'proof_program_id', 'evaluator_ref', 'registry_source',
                    'contract_source', 'metric_artifact', 'proof_artifact', 'derivation', 'proof', 'timeout_ms']);
                const expected = frozenTicket.worlds[index];
                if (row.variant !== expected.variant || row.package_root !== expected.package_root
                    || typeof row.proof_program_id !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(row.proof_program_id)
                    || !Number.isSafeInteger(row.timeout_ms) || row.timeout_ms < 100 || row.timeout_ms > 5000) fail('payload_binding');
                // Preserve the NORMAL registry ABI: an exact id/version ref,
                // not a string or an evaluator selected by this initializer.
                let evaluatorRef;
                try { evaluatorRef = own(row.evaluator_ref, ['evaluator_id', 'evaluator_version']); }
                catch { fail('evaluator_ref'); }
                if (!identifier(evaluatorRef.evaluator_id) || !Number.isSafeInteger(evaluatorRef.evaluator_version)
                    || evaluatorRef.evaluator_version < 1) fail('evaluator_ref');
                if (typeof row.registry_source !== 'string' || typeof row.contract_source !== 'string') fail('source_type');
                for (const input of [row.metric_artifact, row.proof_artifact]) {
                    const packet = own(input, ['manifest', 'entries']);
                    if (typeof packet.manifest !== 'string') fail('source_type');
                    if (!Array.isArray(packet.entries) || packet.entries.length > 128) fail('artifact_entries');
                    for (const item of packet.entries) {
                        const file = own(item, ['path', 'source']);
                        if (typeof file.path !== 'string' || typeof file.source !== 'string') fail('artifact_source');
                    }
                }
                return row;
            });
            // A null synthetic basis permits blocked constructor tests only.
            // Even forged positive prerequisite flags cannot execute it.
            if (emptyBasis) fail('normal_admission_basis_relation');
            const childSource = tcb.files[0].source;
            const childManifest = canonicalValue({ format: 'financasbot.provenance.artifact', version: 1, kind: 'tcb',
                entry: 'bootstrap.js', files: [{ path: 'bootstrap.js', media_type: 'text/javascript',
                    sha256: tcb.files[0].observed_sha256 }] });
            const childCapsuleReceipt = admitFrozenArtifact({ freezeReceipt, kind: 'child', programId: null,
                manifestBytes: Buffer.from(childManifest), entries: [{ path: 'bootstrap.js', bytes: Buffer.from(childSource) }] });
            const configs = rows.map((row, index) => {
                const expected = frozenTicket.worlds[index];
                const registryReceipt = admitExecutionRegistry({ bytes: Buffer.from(row.registry_source),
                    expectedHash: freeze.metric_registry_hash });
                const entry = resolveExecutionEvaluator(registryReceipt, row.evaluator_ref);
                const evaluatorContractReceipt = admitExecutionContract({ registryReceipt, evaluatorRef: row.evaluator_ref,
                    bytes: Buffer.from(row.contract_source) });
                const artifact = (input, kind, programId, root) => {
                    const packet = own(input, ['manifest', 'entries']);
                    if (!Array.isArray(packet.entries) || packet.entries.length > 128) fail('artifact_entries');
                    const bytes = { manifestBytes: Buffer.from(packet.manifest), entries: packet.entries.map(item => {
                            const file = own(item, ['path', 'source']);
                            if (typeof file.path !== 'string' || typeof file.source !== 'string') fail('artifact_source');
                            return { path: file.path, bytes: Buffer.from(file.source, 'utf8') };
                        }) };
                    const admitted = kind === 'metric' ? admitArtifact({ ...bytes, expectedRoot: root })
                        : admitFrozenArtifact({ freezeReceipt, kind, programId, ...bytes });
                    if (artifactContents(admitted).kind !== kind) fail('artifact_kind');
                    if (root && admitted.observed_root !== root) fail('artifact_root'); return admitted;
                };
                const metricReceipt = artifact(row.metric_artifact, 'metric', null, entry.evaluator_artifact_root);
                const proofReceipt = artifact(row.proof_artifact, 'proof', row.proof_program_id, null);
                const derivation = JSON.parse(JSON.stringify(copyData(row.derivation)));
                const proof = JSON.parse(JSON.stringify(copyData(row.proof)));
                if (Object.hasOwn(derivation, 'artifactReceipt') || Object.hasOwn(proof, 'artifactReceipt')) fail('caller_receipt');
                return { executionId: expected.execution_id, invocationId: frozenTicket.invocation_id, timeoutMs: row.timeout_ms,
                    childCapsuleReceipt, tcbArtifactReceipt, evaluatorContractReceipt,
                    derivation: { ...derivation, artifactReceipt: metricReceipt }, proof: { ...proof, artifactReceipt: proofReceipt } };
            });
            const nativeRuntimeReceipt = verifyNativeRuntime(freezeReceipt);
            const observations = [];
            for (let i = 0; i < configs.length; i++) observations.push({ variant: frozenTicket.worlds[i].variant,
                execution_id: configs[i].executionId, result: await runAdmittedGraph({ ...configs[i], nativeRuntimeReceipt }) });
            // Observations are NOT oracle/coverage comparison or acceptance.
            return freezeDeep({ stage: 'captured_path_normal_observations_not_qualification', candidate_id: frozenTicket.candidate_id,
                invocation_id: frozenTicket.invocation_id, reference_commitment: frozenTicket.reference_commitment,
                observations, qualified: false, semantic_mutation_credit: 0, financial_acceptance: false });
        } });
    return host;
}

function capturedValidationTools() {
    return Object.freeze({ stage: 'captured_validation_tools_only', graph_accepted: false,
        financial_acceptance: false, admitPackage, admitArtifact, admitPhaseCompositionProfile, phaseCompositionCommitment,
        admitExecutionRegistry, admitExecutionContract, admitExecutionFreeze, admitFrozenArtifact, verifyNativeRuntime,
        runAdmittedGraph, runClaimMonthQualifiedGraph, comparePhaseCoverage, sealClaimMonthTargetTrace, compareClaimMonthTargetTrace,
        sealClaimMonthCoreTrace, compareClaimMonthCoreTrace,
        prepareClaimMonthQualification: (receipt, target) => prepareClaimMonthQualification(receipt, validators, target),
        compileClaimMonthQualificationIR: (receipt, preparation, variant) => compileClaimMonthQualificationIR(receipt, validators, preparation, variant),
        compileClaimMonthQualificationAccess, prepareClaimMonthIsolatedPlan, assertClaimMonthIsolatedProgram,
        sealClaimMonthIsolatedLowering, admitClaimMonthIsolatedProof, admitClaimMonthFrozenBaseline,
        initializeFinancialHost: (data, bootstrap) => createPrivateFinancialHost(data, bootstrap, validators),
        initializePathQualification,
        compileSnapshotAccess: receipt => compileSnapshotAccess(receipt, validators),
        compileAuthoringIR: receipt => compileAuthoringIR(receipt, validators),
        // Trusted DEVELOPMENT diagnostic bridge. Foreign/forged errors cannot
        // acquire the private checker origin; this is not guest authority.
        readNativePathDiagnostic: error => readGraphStructureDiagnostic(error)
            ?? readTemplateReferenceDiagnostic(error) ?? readPredicateTypeDiagnostic(error)
            ?? readSelectionBindingDiagnostic(error),
        nativeProfile: EXECUTION_PROFILE });
}
module.exports = { capturedValidationTools };
