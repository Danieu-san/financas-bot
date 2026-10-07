'use strict';
const { copyData, decodeObservation, decodeMeasurement, identifier } = require('./observationContract');
const { canonicalValue, freezeDeep } = require('../kernel/canonicalValue');
const fail = code => { throw new Error('selected_day_core_' + code); };
const same = (a, b) => canonicalValue(a) === canonicalValue(b);
const keys = (v, expected) => {
    if (!v || Array.isArray(v) || Object.keys(v).sort().join(',') !== expected) fail('shape');
};
// This compares captured evidence only. The BUILD wrapper requires genuine
// execution results. Neither a matching copy nor this function issues authority,
// profile coverage, oracle acceptance, a witness or a financial receipt.
function compareSelectedEventDayCore(raw) {
    // Only after bounded descriptor admission; canonical JSON expects plain
    // objects while copyData deliberately returns inert null-prototype records.
    // This changes representation, never tuple values/order or scope bindings.
    let data; try { data = structuredClone(copyData(raw)); } catch { fail('shape'); }
    keys(data, 'plans,results'); keys(data.results, 'C,M,S'); keys(data.plans, 'C,M,S');
    const cores = {}, identities = new Set(); let executionId;
    for (const variant of ['C', 'M', 'S']) {
        const r = data.results[variant], plan = data.plans[variant].plan;
        if (!r || !plan || plan.variant !== variant || r.derivation_satisfied !== true
            || r.proof_satisfied !== (variant !== 'M') || r.fringe_count !== 4
            || r.profile_witness_qualified !== false || r.financial_release_eligible !== false
            || r.receipt_created !== false || r.negative_qualification !== true
            || !Array.isArray(r.raw_rows) || !r.raw_rows.length || r.raw_rows.length > 20000
            || r.raw_event_count !== r.raw_rows.length || !r.trace) fail('result');
        keys(r.trace, 'derivation_trace,execution_id,proof_trace,stage');
        const trace = [...r.trace.derivation_trace, ...r.trace.proof_trace];
        if (!r.trace.derivation_trace.length || !r.trace.proof_trace.length || trace.length !== r.raw_rows.length) fail('trace');
        const invocationId = trace[0].invocation_id;
        if (!identifier(invocationId) || identities.has(invocationId) || !identifier(r.trace.execution_id)) fail('scope');
        identities.add(invocationId);
        if (executionId !== undefined && executionId !== r.trace.execution_id) fail('scope');
        executionId = r.trace.execution_id;
        let fringe = 0, proof = false; const core = [];
        r.raw_rows.forEach((row, index) => {
            keys(row, 'event,execution_id,invocation_id,owner,phase,sequence');
            keys(row.owner, 'kind,occurrence,operand,site');
            if (row.sequence !== index || row.execution_id !== executionId || row.invocation_id !== invocationId
                || !['derivation', 'proof'].includes(row.phase)) fail('scope');
            if (row.phase === 'proof') proof = true; else if (proof) fail('phase');
            let event;
            try { event = row.event[0] === 'I' ? decodeObservation(row.event) : decodeMeasurement(row.event); } catch { fail('event'); }
            const expectedTrace = event[0] === 'I'
                ? { operation: event[1], alias: event[2], role: event[3], path: event[4], projection: event[5], outcome: event[6] }
                : { measurement: event[1], observed: event[2] };
            if (!same(trace[index], { sequence: index, invocation_id: invocationId, phase: row.phase, ...expectedTrace })) fail('trace');
            if (row.owner.kind === 'fringe') {
                const expected = plan.fringe[fringe];
                if (row.phase !== 'proof' || !expected || row.owner.occurrence !== fringe
                    || row.owner.site !== expected.site || row.owner.operand !== expected.operand
                    || !same(event, expected.tuple)) fail('fringe');
                fringe++;
            } else if (row.owner.kind === 'core') core.push({ phase: row.phase, event, owner: row.owner });
            else fail('owner');
        });
        if (fringe !== 4 || !same(r.site_results, plan.queue.map(site => ({ site: site.site, satisfied: site.truth })))) fail('sites');
        cores[variant] = core;
    }
    if (!same(cores.C, cores.M) || !same(cores.C, cores.S)) fail('mismatch');
    if (!same(data.results.C.result, data.results.M.result) || !same(data.results.C.result, data.results.S.result)) fail('functional');
    return freezeDeep({ stage: 'selected_day_core_comparison_only', exact_core_matched: true,
        core_event_count_per_variant: cores.C.length, fringe_count_per_variant: 4,
        profile_coverage_complete: false, oracle_verified: false, measured_tcb_admission: false,
        profile_witness_qualified: false, semantic_mutation_credit: 0, financial_release_eligible: false });
}
module.exports = { compareSelectedEventDayCore };
