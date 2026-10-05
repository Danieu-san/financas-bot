'use strict';
// Independent, pre-execution locator/observation contract. No compiler,
// evaluator, recorder, lowerer or observed result participates in expected.
// This checks the target fringe ONLY: full core coverage, freeze authority,
// oracle and financial quarantine remain separate mandatory gates.
const { decodeClaimMonthProfile } = require('./claimMonthIsolatedProfile');
const { copyData, decodeObservation } = require('./observationContract');
const { canonicalValue, digest, freezeDeep } = require('../kernel/canonicalValue');
const { comparePhaseCoverage } = require('./proofAcceptance');
const expectations = new WeakMap();
const coreExpectations = new WeakMap();
const fail = code => { throw new Error(`month_trace_${code}`); };
const same = (a, b) => canonicalValue(structuredClone(a)) === canonicalValue(structuredClone(b));
function sealClaimMonthTargetTrace(source) {
    const profile = decodeClaimMonthProfile(source);
    const mutant = profile.variant === 'M';
    const origin = mutant ? 'qualification' : 'original';
    const alias = mutant ? 'qualification/context' : 'claim/context';
    const role = mutant ? `proof/qualification/${profile.predicate_id}` : 'proof/context';
    const path = mutant ? ['qualification', 'alternative_period'] : ['period'];
    const month = mutant ? profile.sidecar.qualification.alternative_period : profile.original_period;
    const events = [];
    const event = (op, suffix, projection, outcome) => events.push(['I', op, alias, role, [...path, ...suffix], projection, outcome]);
    if (mutant) events.push(['I', 'get', alias, role, ['qualification'], 'data', ['container', 'record']]);
    event('get', [], 'data', ['container', 'record']);
    event('get', ['kind'], 'data', ['scalar', 'month']);
    event('keys', [], 'data', ['keys', 'kind', 'value']);
    event('iterate', [], 'keys', ['opened']);
    event('next', [0], 'keys', ['scalar', 'kind']);
    event('next', [1], 'keys', ['scalar', 'value']);
    event('next', [2], 'keys', ['done']);
    event('get', ['kind'], 'data', ['scalar', 'month']);
    event('get', ['value'], 'data', ['scalar', month.value]);
    const rows = events.map(event => ({ origin, phase: 'proof', site: profile.predicate_id, event }));
    rows.forEach(row => decodeObservation(row.event));
    const receipt = freezeDeep({ stage: 'claim_month_target_trace_sealed_only',
        profile_hash: 'sha256:' + digest(profile), expected_hash: 'sha256:' + digest(rows),
        profile_witness_qualified: false });
    expectations.set(receipt, { profile, rows }); return receipt;
}
function compareClaimMonthTargetTrace(receipt, raw) {
    const expected = expectations.get(receipt); if (!expected) fail('authority');
    let input; try { input = copyData(raw); } catch { fail('input'); }
    if (Object.keys(input).sort().join(',') !== 'profile_hash,proof_satisfied,proof_site_reads,proof_site_results,qualification_observations'
        || input.profile_hash !== receipt.profile_hash || typeof input.proof_satisfied !== 'boolean'
        || !Array.isArray(input.proof_site_reads) || !Array.isArray(input.proof_site_results)
        || !Array.isArray(input.qualification_observations)) fail('input');
    const { profile, rows } = expected;
    const results = profile.predicate_ids.map(site => ({ site, satisfied: !(profile.variant === 'M' && site === profile.predicate_id) }));
    if (!same(input.proof_site_results, results) || input.proof_satisfied !== (profile.variant !== 'M')) fail('assertions');
    for (const row of input.proof_site_reads) {
        if (Object.keys(row).sort().join(',') !== 'event,origin,phase,site' || row.phase !== 'proof'
            || !['original', 'qualification'].includes(row.origin)
            || row.site !== null && !profile.predicate_ids.includes(row.site)) fail('scope');
        try { decodeObservation(row.event); } catch { fail('scope'); }
        if (row.origin === 'qualification' && row.site !== profile.predicate_id) fail('scope');
    }
    const target = input.proof_site_reads.filter(row => row.site === profile.predicate_id);
    if (!same(target, rows)) fail('target');
    const fringe = input.proof_site_reads.filter(row => row.origin === 'qualification');
    if (!same(fringe, profile.variant === 'M' ? rows : []) || !same(input.qualification_observations, fringe)) fail('fringe');
    return Object.freeze({ stage: 'claim_month_target_trace_checked_only', target_operands_observed: true,
        fringe_trace_matched: true, core_trace_matched: false, profile_witness_qualified: false,
        financial_release_eligible: false, receipt_created: false });
}
function sealClaimMonthCoreTrace(targetReceipt, raw) {
    if (!expectations.has(targetReceipt)) fail('authority');
    let input; try { input = copyData(raw); } catch { fail('input'); }
    if (Object.keys(input).sort().join(',') !== 'derivation,proof') fail('input');
    for (const phase of ['derivation', 'proof']) {
        if (Object.keys(input[phase]).sort().join(',') !== 'accessBindings,bindings,expected,measurements,operandSets,sets') fail('input');
    }
    const receipt = freezeDeep({ stage: 'claim_month_core_trace_sealed_only',
        expected_hash: 'sha256:' + digest(structuredClone(input)), profile_witness_qualified: false });
    coreExpectations.set(receipt, { targetReceipt, input }); return receipt;
}
function compareClaimMonthCoreTrace(receipt, raw) {
    const expected = coreExpectations.get(receipt); if (!expected) fail('authority');
    let input; try { input = copyData(raw); } catch { fail('input'); }
    if (Object.keys(input).sort().join(',') !== 'executionId,invocationId,targetTrace,trace') fail('input');
    compareClaimMonthTargetTrace(expected.targetReceipt, input.targetTrace);
    const observed = input.trace.proof_trace.filter(row => row.operation).map(row => ['I', row.operation,
        row.alias, row.role, row.path, row.projection, row.outcome]);
    if (!same(observed, input.targetTrace.proof_site_reads.map(row => row.event))) fail('recorder_link');
    const derivation = comparePhaseCoverage({ ...expected.input.derivation, trace: input.trace,
        executionId: input.executionId, invocationId: input.invocationId, phase: 'derivation' });
    // The target fringe must already match its independent manifest exactly.
    // Remove only those owned events, never an unsupported/collateral event.
    // Core expected stays the original authored contract; if that contract
    // loses coverage through this projection, this profile cannot qualify.
    const target = expectations.get(expected.targetReceipt).profile.predicate_id;
    let cursor = 0;
    const proofTrace = input.trace.proof_trace.filter(row => !row.operation
        || input.targetTrace.proof_site_reads[cursor++].site !== target);
    let sequence = 0;
    const projected = { stage: input.trace.stage, execution_id: input.trace.execution_id,
        derivation_trace: input.trace.derivation_trace.map(row => ({ ...row, sequence: sequence++ })),
        proof_trace: proofTrace.map(row => ({ ...row, sequence: sequence++ })) };
    const proof = comparePhaseCoverage({ ...expected.input.proof, trace: projected,
        executionId: input.executionId, invocationId: input.invocationId, phase: 'proof' });
    return freezeDeep({ stage: 'claim_month_core_trace_checked_only', core_trace_matched: derivation.matched && proof.matched,
        derivation, proof, fringe_trace_matched: true, profile_witness_qualified: false,
        financial_release_eligible: false, receipt_created: false });
}
module.exports = { sealClaimMonthTargetTrace, compareClaimMonthTargetTrace, sealClaimMonthCoreTrace, compareClaimMonthCoreTrace };
