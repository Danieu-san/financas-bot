// Trusted-bootstrap byte admission for a negative qualification instance.
// This constructor is NOT a model/guest API and does not authenticate its
// caller or manufacture evidence of a human audit. The independently reviewed
// snapshot digest is supplied outside the candidate being admitted, as in the
// existing execution-freeze contract. Operational use requires code+snapshot
// audit and confrontation; construction tests do not grant operational credit.
import { types } from 'node:util';
import { createHash } from 'node:crypto';
import { copyData } from '../../src/next/provenance/observationContract.js';
import { canonicalValue, freezeDeep } from '../../src/next/kernel/canonicalValue.js';
import { prepareSelectedEventDayCandidate, admitSelectedEventDayReviewedCandidate,
    executeSelectedEventDayReviewedCandidate, captureSelectedEventDayReviewBytes } from './executeSelectedEventDayCandidate.mjs';
const fail = code => { throw new Error('selected_day_qualification_' + code); };
const hash = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
function own(raw, names) {
    if (!raw || types.isProxy(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const descriptors = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(descriptors).length !== names.length || names.some(name =>
        !descriptors[name]?.enumerable || !Object.hasOwn(descriptors[name], 'value'))) fail('input');
    return Object.fromEntries(names.map(name => [name, descriptors[name].value]));
}
export function createSelectedEventDayQualification(rawBootstrap) {
    const { reviewBytes, expectedReviewHash } = own(rawBootstrap, ['reviewBytes', 'expectedReviewHash']);
    if (typeof expectedReviewHash !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(expectedReviewHash)) fail('input');
    const bytes = captureSelectedEventDayReviewBytes(reviewBytes);
    if (hash(bytes) !== expectedReviewHash) fail('review_hash');
    const source = bytes.toString('utf8'); if (!Buffer.from(source).equals(bytes)) fail('input');
    let snapshot;
    try { snapshot = structuredClone(copyData(JSON.parse(source))); } catch { fail('input'); }
    if (canonicalValue(snapshot) !== source || snapshot.stage !== 'selected_day_candidate_review_snapshot_only'
        || snapshot.profile !== 'selected-event-day-path/v1'
        || snapshot.normative_commit !== 'f1a8cd4629b245009b9dd8fbb8dce83da77ba3d4'
        || snapshot.profile_witness_qualified !== false || snapshot.semantic_mutation_credit !== 0
        || snapshot.financial_release_eligible !== false) fail('input');
    let consumed = false;
    return Object.freeze({ stage: 'selected_day_trusted_bootstrap_review_bytes_only', financial_release_eligible: false,
        async execute(rawGuest) {
            if (consumed) fail('reused');
            // One attempt per instance, including malformed input or failure.
            consumed = true;
            const { mutation_id } = own(rawGuest, ['mutation_id']);
            if (typeof mutation_id !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(mutation_id)
                || mutation_id !== snapshot.mutation_id) fail('input');
            const prepared = await prepareSelectedEventDayCandidate({ mutation_id });
            const reviewed = admitSelectedEventDayReviewedCandidate({
                prepared, reviewBytes: Buffer.from(bytes), expectedReviewHash
            });
            const output = await executeSelectedEventDayReviewedCandidate({ reviewed });
            const a = output.adjudication, normal = a.normal_diagnosis, worlds = output.worlds;
            const required = [
                output.reviewed_boundary_admitted_before_handles === true,
                output.review_snapshot_sha256 === expectedReviewHash,
                output.mutation_id === snapshot.mutation_id && output.candidate_id === snapshot.candidate_id,
                output.negative_component_root === snapshot.negative_component_root,
                output.execution_ticket_sha256 === snapshot.execution_ticket_sha256,
                output.compiler_artifact_root === snapshot.compiler_artifact_root,
                output.build_sources_sha256 === snapshot.build_sources_sha256,
                output.normal_compile_worlds === 3 && output.native_graph_worlds === 3,
                worlds.map(w => w.variant).join(',') === 'C,M,S',
                new Set(worlds.map(w => w.invocation_id)).size === 3,
                worlds.every(w => w.invocation_id.startsWith(output.execution_id + '/' + w.variant + '/')
                    && w.derivation_satisfied === true && w.fringe_count === 4 && w.receipt_created === false
                    && w.observed_ticket_sha256 === snapshot.execution_ticket_sha256),
                worlds.map(w => w.proof_satisfied).join(',') === 'true,false,true',
                a.exact_core_matched === true && a.profile_coverage_complete === true,
                a.oracle_verified === true && a.core_claim_verified === true && a.adjudicator_captured === true,
                a.observed_negative_component_root === snapshot.negative_component_root,
                a.observed_adjudicator_artifact_root === snapshot.adjudicator_artifact_root,
                normal.M.observed_violations.join(',') === 'period,trace' && normal.M.phases_covered === false,
                normal.M.false_predicates.length === 1 && normal.M.false_predicates[0].atom === 'period',
                ['C','S'].every(v => normal[v].proof_satisfied === true && normal[v].phases_covered === true
                    && normal[v].observed_violations.length === 0),
                ['C','M','S'].every(v => normal[v].normal_graph_accepted === false
                    && normal[v].ordinary_v2_witness_qualified === false),
                output.measured_sources_unchanged === true && output.executable_ticket_candidate_complete === true,
                output.financial_release_eligible === false && output.receipt_created === false
                    && output.validated_parent_created === false && output.ordinary_v2_witness_qualified === false,
                output.profile_witness_qualified === false && output.semantic_mutation_credit === 0
            ];
            if (!required.every(Boolean)) fail('adjudication');
            return freezeDeep({ stage: 'selected_day_private_profile_witness_qualified',
                profile: snapshot.profile, normative_commit: snapshot.normative_commit,
                mutation_id, candidate_id: output.candidate_id, execution_id: output.execution_id,
                invocation_ids: worlds.map(w => w.invocation_id), review_snapshot_sha256: expectedReviewHash,
                negative_component_root: output.negative_component_root,
                execution_ticket_sha256: output.execution_ticket_sha256,
                build_sources_sha256: output.build_sources_sha256,
                normal_diagnosis: structuredClone(normal), worlds: structuredClone(worlds),
                adjudication_sha256: hash(canonicalValue(structuredClone(a))),
                exact_core_matched: true, profile_coverage_complete: true, oracle_verified: true,
                profile_reviewed_boundary_admitted_before_handles: true,
                profile_witness_qualified: true, semantic_mutation_credit: 1,
                credit_scope: 'one_fresh_profile_invocation_not_a_consolidated_ledger',
                ordinary_v2_witness_qualified: false, validation_tcb_complete: false,
                financial_release_eligible: false, receipt_created: false, validated_parent_created: false });
        } });
}
