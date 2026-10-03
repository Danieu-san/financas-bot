'use strict';
// Extraction only. No runtime, normative approval or financial acceptance.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const BASE = '98e3d6a929541e3238362400504c884c34031f22';
const REPORT_SHA = '351a19987b359aa0e5878567603647729882ca075a2424816767796544668d44';
const ROOT = path.resolve(__dirname, '../../..');
const OUTPUT = path.join(__dirname, 'predicate-strategy-boundary-witness.json');
const NORM = 'docs/plans/workstreams/financasbot-next-00-provenance-graph-design-v1.md';
const CORPUS = 'docs/contracts/next/provenance-v2/graphs-v2.json';
const CLAIMS = 'src/next/provenance/claimRequirements.js';
const COLLECTIONS = 'src/next/provenance/collectionRequirements.js';
const sha = value => createHash('sha256').update(value).digest('hex');
const lf = value => value.replaceAll('\r\n', '\n');
function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort()
        .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
}
const git = rel => lf(execFileSync('git', ['show', `${BASE}:${rel}`],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
function section(source, start, end) {
    assert.equal(source.split(start).length, 2, 'unique start');
    const at = source.indexOf(start); const until = source.indexOf(end, at + start.length);
    assert.ok(until > at, 'end'); return source.slice(at, until).trimEnd();
}
function immutableProjection() {
    const norm = git(NORM); const claim = git(CLAIMS); const collection = git(COLLECTIONS);
    const source = git(CORPUS); const corpus = JSON.parse(source);
    assert.equal(corpus.graphs.length, 76);
    assert.equal(new Set(corpus.graphs.map(row => row.fact_key)).size, 76);
    const requested = [['S-01#1#1', 'binding_6'], ['S-01#1#1', 'binding_9'],
        ['S-01#1#1', 'r0012_include_kind'], ['S-04#1#1', 'r0002_absent_account_id'],
        ['M-01#1#3', 'p0034_parent_fact']];
    const samples = requested.map(([fact_key, predicate_id]) => {
        const graph = corpus.graphs.find(row => row.fact_key === fact_key);
        const predicates = graph.predicates.filter(row => row.id === predicate_id);
        assert.equal(predicates.length, 1); assert.equal(predicates[0].op, 'eq');
        return { fact_key, predicate: predicates[0],
            parent_bindings: Object.entries(graph.nodes).filter(([, node]) => node.binding !== 'snapshot')
                .map(([alias, node]) => ({ alias, node })),
            selection_uses: graph.selections.flatMap(selection => [
                ...(selection.selected_predicates.includes(predicate_id)
                    ? [{ candidate_set: selection.candidate_set, selected_set: selection.selected_set, mode: 'selected' }] : []),
                ...selection.excluded.filter(row => row.predicates.includes(predicate_id))
                    .map(row => ({ candidate_set: selection.candidate_set, selected_set: selection.selected_set,
                        mode: 'excluded', node: row.node, reason: row.reason }))]) };
    });
    return { base_sha: BASE, graph_count: 76,
        source_sha256_lf: { [NORM]: sha(norm), [CORPUS]: sha(source), [CLAIMS]: sha(claim), [COLLECTIONS]: sha(collection) },
        section_10: section(norm, '## 10. Propriedades e mutações geradas', '## 11. Compilador e evaluator'),
        claim_anchor: section(claim, '        function literalBinding(', '        for (const name of'),
        collection_anchor: section(collection, '        function anchors(', '        for (const [alias, node]'),
        eq_coordinates: corpus.graphs.reduce((sum, graph) => sum + graph.predicates.filter(p => p.op === 'eq').length, 0),
        samples };
}
function validate(witness) {
    assert.deepEqual(Object.keys(witness).sort(), ['format', 'immutable', 'limits', 'reported_local'].sort());
    assert.equal(witness.format, 'financasbot.predicate-strategy-boundary-witness.v1');
    assert.deepEqual(witness.immutable, immutableProjection());
    assert.deepEqual(witness.limits, { extraction_only: true, normative_approval: false,
        runtime_tests_executed_by_this_verifier: false, original_report_published: false,
        reported_wip_is_not_immutable_code_candidate: true, global_g11: false });
    const r = witness.reported_local;
    assert.equal(r.report_sha256, REPORT_SHA); assert.equal(r.git_head, BASE);
    assert.equal(r.exit_code, 1); assert.equal(r.matrix_valid, false);
    assert.equal(r.accounting_complete, true); assert.equal(r.measured_sources_unchanged, true);
    assert.equal(r.mutations.expected, witness.immutable.eq_coordinates);
    assert.deepEqual(r.mutations, { expected: 974, generated: 946, executed: 262, matched: 66 });
    assert.equal(r.baselines, 73); assert.equal(r.unsatisfied, 908);
    assert.deepEqual(r.causes, { claim_requirements_missing: 464, collateral_or_missing_rejection: 196,
        collection_requirements_fixture_anchor: 146, host_child_evaluation: 74, parent_execution_required: 28 });
    assert.equal(Object.values(r.causes).reduce((a, b) => a + b), r.unsatisfied);
    assert.equal(r.unsatisfied + r.mutations.matched, r.mutations.expected);
    assert.equal(r.samples.length, 5);
    assert.equal(new Set(r.samples.map(row => row.cause)).size, 5);
    for (const row of r.samples) {
        const { target } = row; assert.equal(target.operator, 'eq');
        assert.equal(target.strategy, 'compatible_wrong_operator');
        const id = `sha256:${sha(canonical({ domain: 'financasbot.mutation-requirement.v1',
            family: 'predicate_strategy', target }))}`;
        assert.equal(row.mutation_id, id);
        assert.ok(witness.immutable.samples.some(sample => sample.fact_key === target.fact_key
            && sample.predicate.id === target.predicate_id));
    }
    assert.deepEqual(r.host_static_crosscheck, { host_errors: 74, target_is_selection_predicate: 74,
        formula_plus_selection_guards: 74, does_not_prove_each_throw_cause: true });
    const example = r.executed_example;
    assert.equal(example.mutation_id, r.samples.find(row => row.cause === 'collateral_or_missing_rejection').mutation_id);
    assert.equal(example.proof_satisfied, false); assert.equal(example.positive_oracle_matched, true);
    assert.equal(example.outside_target_preserved, true); assert.equal(example.phases_covered, false);
    assert.equal(example.matched, false); assert.equal(example.graph_accepted, false);
    assert.equal(example.financial_receipt, false);
    assert.deepEqual(example.rejected_coverage_components, [{ phase: 'proof', component: 'selection' }]);
    assert.deepEqual(example.false_predicates, [{ id: 'r0012_include_kind', obligation: 'subject_scope',
        atom: 'subject', satisfied: false }]);
    assert.equal(typeof r.measured_sources_sha256, 'string');
    assert.match(r.measured_sources_sha256, /^[a-f0-9]{64}$/);
    assert.equal(typeof r.derivation_projection.source_sha256_lf, 'string');
    assert.match(r.derivation_projection.source_sha256_lf, /^[a-f0-9]{64}$/);
    assert.ok(r.derivation_projection.excerpt.includes("mode === 'formula_plus_selection_guards'"));
}
function generate(worktree) {
    const root = fs.realpathSync(worktree);
    const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
    const bytes = fs.readFileSync(path.join(root, '.codex-temp/predicate-strategy-full-20261003.json'));
    assert.equal(sha(bytes), REPORT_SHA, 'historical report identity');
    const report = JSON.parse(bytes); const job = JSON.parse(read('.codex-temp/predicate-strategy-job-20261003.json'));
    assert.equal(job.stage, 'predicate_strategy_completed_with_pending');
    assert.equal(job.report_sha256, REPORT_SHA); assert.deepEqual(job.mutations, report.mutations);
    assert.equal(report.accounting_complete, true); assert.equal(report.valid, false);
    assert.equal(new Set([...report.rows, ...report.unsatisfied].map(row => row.mutation_id)).size, 974);
    assert.equal(new Set(report.rows.map(row => row.execution_id)).size, 262);
    const corpus = JSON.parse(read(CORPUS)); const claims = JSON.parse(read(corpus.claim_contract.path));
    const profile = JSON.parse(read('docs/contracts/next/provenance-v2/phase-composition-profile-v1.json'));
    const host = report.unsatisfied.filter(row => row.cause === 'host_child_evaluation');
    let selections = 0; let guards = 0;
    for (const row of host) {
        const graph = corpus.graphs.find(g => g.fact_key === row.target.fact_key);
        const claim = claims.claims.find(c => c.fact_key === graph.fact_key);
        if (graph.selections.some(s => [...s.selected_predicates, ...s.excluded.flatMap(e => e.predicates)]
            .includes(row.target.predicate_id))) selections++;
        if (profile.entries.find(e => e.evaluator_id === claim.evaluator_ref.evaluator_id
            && e.evaluator_version === claim.evaluator_ref.evaluator_version).derivation_mode
            === 'formula_plus_selection_guards') guards++;
    }
    const compiler = lf(read('src/next/provenance/graphCompiler.js'));
    const example = report.rows.find(row => row.target.fact_key === 'S-01#1#1'
        && row.target.predicate_id === 'r0012_include_kind');
    assert.ok(example);
    const witness = { format: 'financasbot.predicate-strategy-boundary-witness.v1', immutable: immutableProjection(),
        limits: { extraction_only: true, normative_approval: false, runtime_tests_executed_by_this_verifier: false,
            original_report_published: false, reported_wip_is_not_immutable_code_candidate: true, global_g11: false },
        reported_local: { git_head: BASE, report_sha256: REPORT_SHA, exit_code: job.exit_code,
            matrix_valid: job.matrix_valid, accounting_complete: job.accounting_complete,
            measured_sources_unchanged: job.measured_sources_unchanged,
            measured_sources_sha256: job.measured_sources_sha256, mutations: job.mutations,
            baselines: job.baselines, unsatisfied: job.unsatisfied, causes: job.causes,
            samples: Object.keys(job.causes).map(cause => report.unsatisfied.find(row => row.cause === cause)),
            executed_example: Object.fromEntries(['mutation_id', 'execution_id', 'false_predicates',
                'rejected_coverage_components', 'outside_target_preserved', 'positive_oracle_matched',
                'proof_satisfied', 'phases_covered', 'matched', 'graph_accepted', 'financial_receipt']
                .map(key => [key, example[key]])),
            host_static_crosscheck: { host_errors: host.length, target_is_selection_predicate: selections,
                formula_plus_selection_guards: guards, does_not_prove_each_throw_cause: true },
            derivation_projection: { source_sha256_lf: sha(compiler),
                excerpt: section(compiler, '        projectDerivationProgram(', '        projectDerivationBindings(') } } };
    validate(witness); return witness;
}
const args = process.argv.slice(2);
if (args.length === 2 && args[0] === '--write-new') {
    fs.writeFileSync(OUTPUT, JSON.stringify(generate(args[1]), null, 2) + '\n', { flag: 'wx' });
} else if (args.length === 2 && args[0] === '--check-local') {
    assert.deepEqual(JSON.parse(fs.readFileSync(OUTPUT, 'utf8')), generate(args[1]));
}
else if (args.length === 1 && ['--check', '--self-test'].includes(args[0])) {
    const witness = JSON.parse(fs.readFileSync(OUTPUT, 'utf8')); validate(witness);
    if (args[0] === '--self-test') {
        const changes = [w => w.immutable.samples[0].predicate.op = 'not_eq',
            w => w.immutable.graph_count--, w => w.reported_local.matrix_valid = true,
            w => w.reported_local.samples[0].target.predicate_id = 'invented',
            w => w.limits.normative_approval = true];
        for (const change of changes) { const bad = structuredClone(witness); change(bad); assert.throws(() => validate(bad)); }
    }
} else throw new Error('Use --check, --self-test, --check-local <explicit-WIP-worktree>, or --write-new <explicit-WIP-worktree>');
process.stdout.write(JSON.stringify({ extraction_valid: true, normative_approval: false,
    runtime_tests_executed: false, global_g11: false }) + '\n');
