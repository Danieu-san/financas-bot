'use strict';
const { copyData } = require('./observationContract');
const { freezeDeep } = require('../kernel/canonicalValue');
const { compareSelectedEventDayCoverage } = require('./selectedEventDayCoverage');
const { compareSelectedEventDayOracle } = require('./selectedEventDayOracle');
const { comparePhaseCoverage } = require('./proofAcceptance');
const recipe = freezeDeep(require('./selectedDayCapturedAdjudicationRecipe'));
// A closed negative-component comparison, not reviewed-source admission or a
// financial launcher. Expectations exist only in the captured BUILD recipe.
// The private outer binding must supply genuine results from this execution.
function run(raw) {
    let data; try { data = structuredClone(copyData(raw)); } catch { throw new Error('selected_day_adjudicator_input'); }
    if (!data || Object.keys(data).join(',') !== 'results' || recipe.negative_qualification !== true
        || recipe.profile_witness_qualified !== false || recipe.financial_release_eligible !== false)
        throw new Error('selected_day_adjudicator_input');
    const coverage = compareSelectedEventDayCoverage({ results: data.results, plans: recipe.plans,
        coverage: recipe.coverage, measurements: recipe.measurements });
    const oracle = compareSelectedEventDayOracle({ results: data.results, expectation: recipe.oracle });
    // Preserve BOTH authorities using the same complete captured observations.
    // This is ordinary checker diagnosis, not a second normal-program run or
    // a normal-v2 witness. Original trace expectations were sealed pre-M.
    const normal = {};
    for (const variant of ['C', 'M', 'S']) {
        const result = data.results[variant], phases = {}, rejected = [];
        for (const phase of ['derivation', 'proof']) {
            const compared = comparePhaseCoverage({ trace: result.trace, executionId: result.trace.execution_id,
                invocationId: result.trace.derivation_trace[0].invocation_id, phase,
                ...recipe.normalCoverage[variant][phase], measurements: recipe.measurements[phase] });
            phases[phase] = compared.matched;
            if (!compared.matched) rejected.push({ phase, components: Object.entries(compared.components)
                .filter(([, c]) => c.matched === false || c.mismatches?.length > 0).map(([name]) => name) });
        }
        const falsePredicates = recipe.normalPredicates.filter(p => result.site_results.some((site, index) =>
            recipe.plans[variant].plan.queue[index].predicate_id === p.id && site.satisfied === false));
        const phasesCovered = Object.values(phases).every(Boolean);
        normal[variant] = { proof_satisfied: result.proof_satisfied, false_predicates: falsePredicates,
            phases_covered: phasesCovered, phases, rejected_coverage_components: rejected,
            observed_violations: [...new Set(falsePredicates.map(p => p.atom).concat(phasesCovered ? [] : ['trace']))].sort(),
            normal_graph_accepted: false, ordinary_v2_witness_qualified: false };
    }
    return freezeDeep({ stage: 'selected_day_captured_negative_adjudication_only',
        exact_core_matched: true, profile_coverage_complete: coverage.profile_coverage_complete,
        oracle_verified: oracle.oracle_verified, core_claim_verified: oracle.core_claim_verified,
        oracle_sha256: oracle.oracle_sha256, core_claim_hash: oracle.core_claim_hash,
        original_result_sha256: oracle.original_result_sha256, adjudicator_captured: true,
        normal_diagnosis: normal,
        negative_qualification: true, executable_ticket_complete: false, validation_tcb_complete: false,
        measured_tcb_admission: false, profile_witness_qualified: false, semantic_mutation_credit: 0,
        financial_release_eligible: false, receipt_created: false });
}
module.exports = { run };
