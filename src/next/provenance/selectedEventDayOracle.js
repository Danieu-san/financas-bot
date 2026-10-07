'use strict';
const { copyData } = require('./observationContract');
const { copyTypedFunctionalResult } = require('./claimBinding');
const { canonicalValue, digest, freezeDeep } = require('../kernel/canonicalValue');
const fail = code => { throw new Error('selected_day_oracle_' + code); };
const same = (a, b) => canonicalValue(a) === canonicalValue(b);
const hash = v => 'sha256:' + digest(v);
// Pure comparison only. The private wrapper binds these expectations to the
// genuine pre-M admission/results, and requires complete profile coverage.
// No actual/baseline supplies an expectation. No financial receipt is emitted.
function compareSelectedEventDayOracle(raw) {
    let data; try { data = structuredClone(copyData(raw)); } catch { fail('shape'); }
    if (!data || Object.keys(data).sort().join(',') !== 'expectation,results'
        || !data.results || Object.keys(data.results).sort().join(',') !== 'C,M,S') fail('shape');
    const expected = data.expectation;
    if (!expected || expected.stage !== 'selected_day_original_oracle_sealed_only'
        || expected.profile_witness_qualified !== false || expected.semantic_mutation_credit !== 0
        || hash(expected.core_claim) !== expected.core_claim_hash
        || hash(expected.expected_result) !== expected.expected_result_sha256) fail('expectation');
    const wanted = copyTypedFunctionalResult(expected.expected_result);
    if (wanted.kind !== expected.result_signature.kind || wanted.unit !== expected.result_signature.unit) fail('signature');
    function at(segments) {
        let value = expected.core_claim;
        for (const key of segments) {
            if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return { missing: true };
            value = value[key];
        }
        return { value };
    }
    const variants = {};
    for (const variant of ['C', 'M', 'S']) {
        const r = data.results[variant];
        if (!r || r.negative_qualification !== true || r.derivation_satisfied !== true
            || r.proof_satisfied !== (variant !== 'M') || r.profile_witness_qualified !== false
            || r.financial_release_eligible !== false || r.receipt_created !== false
            || !Array.isArray(r.raw_rows) || !same(copyTypedFunctionalResult(r.result), wanted)) fail('functional_result');
        let count = 0;
        for (const row of r.raw_rows) {
            const event = row.event;
            if (event[0] !== 'I' || event[1] !== 'get' || event[2] !== 'claim/context' || event[5] !== 'data') continue;
            const projected = at(event[4]);
            const outcome = projected.missing ? ['absent'] : projected.value && typeof projected.value === 'object'
                ? ['container', Array.isArray(projected.value) ? 'sequence' : 'record'] : ['scalar', projected.value];
            if (!same(event[6], outcome)) fail('core_claim_read');
            count++;
        }
        if (!count) fail('core_claim_missing');
        variants[variant] = { original_oracle_matched: true, core_claim_reads_checked: count };
    }
    return freezeDeep({ stage: 'selected_day_oracle_comparison_only', variants,
        oracle_sha256: expected.source_sha256, original_result_sha256: expected.expected_result_sha256,
        core_claim_hash: expected.core_claim_hash, oracle_verified: true, core_claim_verified: true,
        profile_witness_qualified: false, semantic_mutation_credit: 0, financial_release_eligible: false });
}
module.exports = { compareSelectedEventDayOracle };
