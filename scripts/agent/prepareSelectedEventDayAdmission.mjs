import { types } from 'node:util';
import { createHash } from 'node:crypto';
import { artifactContents } from '../../src/next/provenance/artifactLoader.js';
import { freezeDeep, canonicalValue } from '../../src/next/kernel/canonicalValue.js';
import { identifier, copyData } from '../../src/next/provenance/observationContract.js';
import { validatePhaseArtifactInputs, PROFILE_PATH } from '../../src/next/provenance/phaseCompositionProfile.js';
import { selectedEventDayProgramFamily, resolveSelectedEventDayCompilationInput,
    compareSelectedEventDayIr, selectedEventDayCoverageInputs, selectedEventDayNormalCoverageInputs, selectedEventDayTicketInputs } from '../../src/next/provenance/selectedEventDayProfile.js';
import { resolveSelectedEventDayProgramConformance, resolveSelectedEventDayExecutableAbsence } from './selectedEventDayProgramContract.mjs';
import { captureSelectedEventDayCompiler, compileSelectedEventDayCapturedWorld,
    selectedEventDayCompilerBinding } from './captureSelectedEventDayCompiler.mjs';
import { prepareSelectedEventDayPacket } from './prepareSelectedEventDayPacket.mjs';
import { buildSelectedEventDayDispatchCapsule } from './buildSelectedEventDayDispatchCapsule.mjs';
import { admittedDocuments } from '../../src/next/provenance/packageContract.js';
import { sealSelectedEventDayOracle } from './sealSelectedEventDayOracle.mjs';
import { captureSelectedEventDayBuildRecipe } from './captureSelectedEventDayBuildRecipe.mjs';
const admissions = new WeakMap(), invocations = new WeakMap();
const fail = code => { throw new Error('selected_day_admission_' + code); };
const sha = source => 'sha256:' + createHash('sha256').update(source, 'utf8').digest('hex');
function fields(raw, names) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== names.length || names.some(k => !d[k]?.enumerable || !Object.hasOwn(d[k], 'value'))) fail('input');
    return Object.fromEntries(names.map(k => [k, d[k].value]));
}
// BUILD admission staging. Expected leases/program are already opaque and
// sealed before any normal M compilation here. No caller validator, compiler
// result, expected root or serialized ticket is authority. Normal compiler
// and schema checks are reused without transport, exceptions or weakened IDs.
// This does NOT open handles or establish a measured child/host/recorder TCB.
export function prepareSelectedEventDayAdmission(raw) {
    const options = fields(raw, ['expectations', 'leaseExpectations', 'programConformance',
        'proofArtifactReceipt', 'dispatchArtifactReceipt']);
    const expectations = fields(options.expectations, ['C', 'M', 'S']);
    const family = selectedEventDayProgramFamily(expectations);
    const ticketInputs = selectedEventDayTicketInputs(expectations);
    const programExpectation = resolveSelectedEventDayProgramConformance(options.programConformance);
    const executableAbsence = resolveSelectedEventDayExecutableAbsence(options.programConformance);
    const buildRecipe = captureSelectedEventDayBuildRecipe();
    const oracle = sealSelectedEventDayOracle(expectations);
    const build = { expectations, leaseExpectations: options.leaseExpectations, programConformance: options.programConformance };
    const packet = prepareSelectedEventDayPacket(build);
    const capsule = buildSelectedEventDayDispatchCapsule(build);
    const proof = artifactContents(options.proofArtifactReceipt);
    const dispatch = artifactContents(options.dispatchArtifactReceipt);
    validatePhaseArtifactInputs(proof);
    if (proof.kind !== 'proof' || proof.files.length !== 2
        || proof.files[0].observed_sha256 !== options.programConformance.program_sha256
        || sha(proof.files[0].source) !== options.programConformance.program_sha256
        || proof.files[1].path !== PROFILE_PATH || proof.files[1].observed_sha256 !== family.C.phase.sha256) fail('program');
    if (dispatch.kind !== 'tcb' || dispatch.entry !== capsule.entry || dispatch.files.length !== 1
        || dispatch.files[0].path !== capsule.entry || dispatch.files[0].source !== capsule.source
        || options.dispatchArtifactReceipt.observed_root !== capsule.artifact_root) fail('dispatch');
    const coverageInputs = Object.fromEntries(['C', 'M', 'S'].map(v => [v, selectedEventDayCoverageInputs(expectations[v])]));
    const normalCoverageInputs = Object.fromEntries(['C', 'M', 'S'].map(v => [v, selectedEventDayNormalCoverageInputs(expectations[v])]));
    const original = resolveSelectedEventDayCompilationInput(expectations.C);
    const originalDocs = admittedDocuments(original.packageReceipt);
    const originalCorpus = originalDocs.find(d => d.value?.graphs).value;
    const normalPredicates = freezeDeep(originalCorpus.graphs.find(g => g.fact_key === original.fact_key)
        .predicates.map(p => ({ id: p.id, atom: p.atom })));
    const compiler = captureSelectedEventDayCompiler({ expectations });
    const worlds = {};
    let metricIdentity;
    for (const variant of ['C', 'M', 'S']) {
        const sealed = resolveSelectedEventDayCompilationInput(expectations[variant]);
        if (sealed.phase_sha256 !== family[variant].phase.sha256) fail('phase');
        const docs = admittedDocuments(sealed.packageReceipt);
        const corpus = docs.find(d => d.value?.graphs)?.value;
        const claim = docs.find(d => d.path === corpus?.claim_contract.path)?.value.claims
            .find(c => c.fact_key === sealed.fact_key);
        const registry = docs.find(d => d.path === corpus?.metric_evaluator_registry.path)?.value;
        const metric = registry?.entries.find(e => e.evaluator_id === claim?.evaluator_ref.evaluator_id
            && e.evaluator_version === claim.evaluator_ref.evaluator_version && e.metric === claim.metric);
        const contract = docs.find(d => d.path === metric?.contract_path);
        if (!metric || !contract || contract.sha256 !== metric.evaluator_contract_hash) fail('metric_contract');
        const identity = { metric: claim.metric, evaluator_id: metric.evaluator_id,
            evaluator_version: metric.evaluator_version, contract_sha256: contract.sha256 };
        if (metricIdentity && JSON.stringify(metricIdentity) !== JSON.stringify(identity)) fail('metric_family');
        metricIdentity = identity;
        // Full native pipeline, not comparison of an injected lookalike IR.
        const { ir, access } = compileSelectedEventDayCapturedWorld({ capture: compiler, expectation: expectations[variant] });
        compareSelectedEventDayIr({ expectation: expectations[variant], ir });
        const selector = { fact_key: sealed.fact_key };
        const proofTransport = access.projectProofTransport(selector), derivationTransport = access.projectMetricTransport(selector);
        const proofContext = proofTransport.config.bindings.filter(b => b.alias === 'claim/context');
        const metricContext = derivationTransport.directGroups.flatMap(g => g.bindings).filter(b => b.alias === 'claim/context');
        for (const rows of [proofContext, metricContext]) {
            if (rows.length !== 1 || canonicalValue(structuredClone(rows[0].value)) !== canonicalValue(oracle.core_claim)
                || canonicalValue(structuredClone(rows[0].shape)) !== canonicalValue(oracle.core_claim_shape)) fail('core_claim_transport');
        }
        worlds[variant] = freezeDeep({ access, proof: proofTransport,
            derivation: derivationTransport,
            derivationBindings: access.projectDerivationBindings(selector),
            normalPredicates, normalCoverage: Object.fromEntries(['derivation', 'proof'].map(phase => [phase, {
                ...normalCoverageInputs[variant][phase],
                accessBindings: access.observationMetadata({ fact_key: sealed.fact_key, phase }) }])),
            coverage: Object.fromEntries(['derivation', 'proof'].map(phase => [phase, {
                ...coverageInputs[variant][phase],
                // Native admitted metadata is reused explicitly; it is NOT an
                // independently implemented compiler or observed trace.
                accessBindings: access.observationMetadata({ fact_key: sealed.fact_key, phase }) }])) });
    }
    const compilerBinding = selectedEventDayCompilerBinding(compiler);
    const receipt = freezeDeep({ stage: 'selected_day_private_normal_admission_staging_only', normal_compile_worlds: 3,
        normal_compiler_captured: true, captured_normal_compile_worlds: 3, compiler_artifact_root: compiler.observed_root,
        program_artifact_root: options.proofArtifactReceipt.observed_root, dispatch_artifact_root: capsule.artifact_root,
        packet_sha256: packet.sha256, precommit_hash: family.C.precommit_hash,
        executable_ticket_complete: false, measured_tcb_admission: false,
        profile_witness_qualified: false, semantic_mutation_credit: 0, financial_release_eligible: false });
    admissions.set(receipt, { worlds, metricIdentity: freezeDeep(metricIdentity), packet, capsule, proof, oracle, options, compilerBinding,
        ticketInputs, programExpectation, executableAbsence, buildRecipe,
        used: new Set(), scopeIds: new Set() });
    return receipt;
}
// Privileged staging capability. The future measured host must consume this
// genuine binding, not guest variant flags. Claiming is one-use per C/M/S and
// invocation identity; resolving exposes only TCB data, never a financial API.
export function claimSelectedEventDayInvocation(raw) {
    const { admission, variant, scope: rawScope } = fields(raw, ['admission', 'variant', 'scope']);
    const row = admissions.get(admission); if (!row) fail('authority');
    if (!['C', 'M', 'S'].includes(variant)) fail('variant');
    const scope = copyData(fields(rawScope, ['executionId', 'invocationId']));
    if (!identifier(scope.executionId) || !identifier(scope.invocationId)) fail('scope');
    if (row.used.has(variant) || row.scopeIds.has(scope.invocationId)) fail('reused');
    if (row.executionId !== undefined && row.executionId !== scope.executionId) fail('scope_identity');
    const receipt = freezeDeep({ stage: 'selected_day_private_invocation_staging_only', variant,
        scope: structuredClone(scope), negative_qualification: true, executable_ticket_complete: false,
        measured_tcb_admission: false, profile_witness_qualified: false, financial_release_eligible: false });
    row.executionId = scope.executionId; row.used.add(variant); row.scopeIds.add(scope.invocationId);
    invocations.set(receipt, Object.freeze({ admissionReceipt: admission, variant, scope: receipt.scope, ...row.worlds[variant],
        programArtifactReceipt: row.options.proofArtifactReceipt, dispatchArtifactReceipt: row.options.dispatchArtifactReceipt,
        packet_source: row.packet.source, proof_source: row.proof.files[0].source,
        dispatch_source: row.capsule.source, program_artifact_root: admission.program_artifact_root,
        dispatch_artifact_root: admission.dispatch_artifact_root }));
    return receipt;
}
export function resolveSelectedEventDayInvocation(receipt) {
    const row = invocations.get(receipt); if (!row) fail('authority'); return row;
}
// BUILD recipe only. Not a runtime guest endowment or a caller expected setter.
export function resolveSelectedEventDayAdmission(receipt) {
    const row = admissions.get(receipt); if (!row) fail('authority');
    return Object.freeze({ worlds: row.worlds, metricIdentity: row.metricIdentity, packet: row.packet, capsule: row.capsule, oracle: row.oracle,
        proof: row.proof, proofArtifactReceipt: row.options.proofArtifactReceipt, compilerBinding: row.compilerBinding,
        ticketInputs: row.ticketInputs, programExpectation: row.programExpectation, executableAbsence: row.executableAbsence, buildRecipe: row.buildRecipe });
}
