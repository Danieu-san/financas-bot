'use strict';
const { copyData } = require('./observationContract');
const { freezeDeep } = require('../kernel/canonicalValue');
const { comparePhaseCoverage } = require('./proofAcceptance');
const { compareSelectedEventDayCore } = require('./selectedEventDayCoreComparison');
const fail = code => { throw new Error('selected_day_coverage_' + code); };
const keys = (v, names) => {
    if (!v || Array.isArray(v) || Object.keys(v).sort().join(',') !== names) fail('shape');
};
// Evidence-only, separate profile coverage. Every raw position participates in
// unchanged native phase coverage AND the exact core/four-fringe comparison.
// A caller's matching copy cannot become runtime authority or a witness.
function compareSelectedEventDayCoverage(raw) {
    let data; try { data = structuredClone(copyData(raw)); } catch { fail('shape'); }
    keys(data, 'coverage,measurements,plans,results');
    for (const name of ['coverage', 'plans', 'results']) keys(data[name], 'C,M,S');
    keys(data.measurements, 'derivation,proof');
    compareSelectedEventDayCore({ results: data.results, plans: data.plans });
    const variants = {};
    for (const variant of ['C', 'M', 'S']) {
        const r = data.results[variant]; keys(data.coverage[variant], 'derivation,proof');
        const executionId = r.trace.execution_id, invocationId = r.trace.derivation_trace[0].invocation_id;
        const phases = {}, positions = [];
        for (const phase of ['derivation', 'proof']) {
            const config = data.coverage[variant][phase];
            keys(config, 'accessBindings,bindings,expected,operandSets,sets');
            const compared = comparePhaseCoverage({ trace: r.trace, executionId, invocationId, phase,
                ...config, measurements: data.measurements[phase] });
            if (!compared.matched) {
                // Dimension names only, never snapshot values in diagnostics.
                const dimensions = compared.components.read_edges.mismatches.map(m => m.dimension);
                const components = Object.entries(compared.components).filter(([, c]) => c.matched === false).map(([name]) => name);
                fail(variant + '_' + phase + '_' + [...dimensions, ...components].join('_'));
            }
            phases[phase] = { matched: true, event_count: compared.event_coverage.length };
            for (const p of compared.event_coverage) {
                const row = r.raw_rows[p.sequence];
                if (!row || row.phase !== phase || p.status !== 'covered') fail('position');
                positions.push({ sequence: p.sequence, phase, status: 'covered',
                    owner: row.owner.kind, component: p.component });
            }
        }
        if (positions.length !== r.raw_rows.length || positions.some((p, i) => p.sequence !== i)
            || positions.filter(p => p.owner === 'fringe').length !== 4) fail('position');
        variants[variant] = { phases, positions };
    }
    return freezeDeep({ stage: 'selected_day_profile_coverage_only', variants,
        profile_coverage_complete: true, normal_checker_modified: false, oracle_verified: false,
        measured_tcb_admission: false, profile_witness_qualified: false, semantic_mutation_credit: 0,
        financial_release_eligible: false });
}
module.exports = { compareSelectedEventDayCoverage };
