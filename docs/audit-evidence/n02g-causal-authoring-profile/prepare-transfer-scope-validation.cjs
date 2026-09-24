'use strict';
// Current corpus verification + saved local runs. Not a test rerun or external verdict.
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
const { createHash } = require('node:crypto'); const { execFileSync } = require('node:child_process');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const root = path.resolve(__dirname, '../../..'); const base = 'e7b78e3e94f540ed685d4d35d82aac9b6de8246a';
const graphPath = 'docs/contracts/next/provenance-v2/graphs-v2.json';
const tested = [graphPath, 'tests/next/provenance/authoringIndex.cases.js', 'tests/next/provenance/metricEffects.cases.js'];
const output = path.join(__dirname, 'transfer-scope-validation.json');
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replaceAll('\r\n', '\n');
const sha = b => `sha256:${createHash('sha256').update(b).digest('hex')}`;
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const mode = process.argv[2]; assert.ok(['--write-new', '--check'].includes(mode) && process.argv.length === 3);
const saved = mode === '--check' ? JSON.parse(fs.readFileSync(output, 'utf8')) : null;
if (!saved) assert.ok(!fs.existsSync(output));
const local = phase => JSON.parse(read(`.codex-temp/n02g-transfer-scope-${phase}.json`));
const initial = saved?.initial_harness_red || local('red'); const red = saved?.red || local('red-v2');
const green = saved?.green || local('green'); const affected = saved?.affected || local('affected');
const wide = saved?.wide || JSON.parse(read('.codex-temp/wide-n02g-transfer-scope-20260924.json'));
assert.equal(initial.exit_status, 1); assert.equal(initial.tap.fail, 3); assert.equal(initial.tap.pass, 1);
assert.ok(initial.failures.some(f => f.includes('TRANSFER-SCOPE-004')));
assert.equal(red.exit_status, 1); assert.equal(red.tap.fail, 2); assert.equal(red.tap.pass, 2);
assert.ok(red.failures[0].includes('TRANSFER-SCOPE-001')); assert.ok(red.failures[1].includes('TRANSFER-SCOPE-003'));
assert.equal(green.tap.pass, 4);
for (const r of [green, affected, wide]) {
    assert.equal(r.exit_status, 0); assert.equal(r.tap.fail, 0); assert.equal(r.tap.cancelled, 0);
    assert.equal(r.tap.todo, 0); assert.ok(r.tap.pass > 0);
}
assert.equal(green.tap.skipped, 0); assert.equal(affected.tap.skipped, 0);
assert.equal(wide.valid, true); assert.equal(wide.candidate_unchanged, true); assert.equal(wide.source_head, base);
assert.deepEqual(wide.candidate_files.map(f => f.path).sort(), tested);
for (const f of wide.candidate_files) assert.equal(sha(read(f.path)), f.lf_sha256);
assert.deepEqual(git(['diff', '--name-only', base]).trim().split(/\r?\n/).filter(f => /^(src|scripts|tests|docs\/contracts)\//.test(f)).sort(), tested);
const proposalText = read('docs/audit-evidence/n02g-causal-authoring-profile/transfer-scope-proposal.json');
assert.equal(sha(proposalText), 'sha256:bac176de329bbb6fc009165f92830efcdc12716f61211bf8e02d1c4c669993d3');
const proposal = JSON.parse(proposalText); const beforeText = git(['show', `${base}:${graphPath}`]);
const before = JSON.parse(beforeText); const expected = structuredClone(before); const current = JSON.parse(read(graphPath));
assert.equal(sha(canonicalValue(before)), proposal.source_corpus_sha256);
const counts = { added_reads: 0, added_structural: 0 };
for (const r of proposal.records) {
    const graph = expected.graphs.find(g => g.fact_key === r.fact_key);
    assert.equal(sha(canonicalValue(graph)), r.source_graph_sha256); assert.equal(r.proposed_delta.removed.length, 0);
    for (const [field, delta] of [['required_reads', 'added_reads'], ['required_structural', 'added_structural']]) {
        for (const item of r.proposed_delta[delta]) {
            assert.ok(!graph.trace_contract.derivation[field].some(v => canonicalValue(v) === canonicalValue(item)));
            graph.trace_contract.derivation[field].push(structuredClone(item)); counts[delta]++;
        }
    }
}
assert.deepEqual(counts, { added_reads: 6, added_structural: 6 }); assert.equal(proposal.records.length, 3);
assert.equal(current.graphs.length, 76); assert.deepEqual(current, expected);
const unchanged = proposal.documents.filter(d => d.path !== graphPath).map(d => {
    assert.equal(sha(read(d.path)), d.lf_sha256); assert.equal(sha(git(['show', `${base}:${d.path}`])), d.lf_sha256); return d;
});
const keys = ['recorded_at', 'started_at', 'node', 'source_head', 'candidate_files', 'candidate_unchanged', 'duration_ms',
    'local_only', 'network_guard_scope', 'test_files', 'discovered_test_files', 'exit_status', 'signal', 'valid',
    'validation_reasons', 'tap', 'coverage', 'failures', 'skipped_tests'];
const record = { schema: 'n02g-transfer-scope-validation-v1', base, status: 'candidate_awaiting_independent_code_audit',
    evidence_kind: 'locally_executed_not_external_verdict', graph_accepted: false, releaseEligible: false,
    scope: { changed_graphs: 3, unchanged_graphs: 73, ...counts, all_other_graph_fields_preserved: true,
        before_lf_sha256: sha(beforeText), after_lf_sha256: sha(read(graphPath)) },
    unchanged, initial_harness_red: initial, red, green, affected,
    wide: Object.fromEntries(keys.filter(k => wide[k] !== undefined).map(k => [k, wide[k]])),
    properties: { synthetic_authoring_models: 72, admitted_integrations: 3, missing_observation_negatives: 12,
        kernel_variants: 48, expected_frozen_before_execution: true, historical_inventory_rejected: true,
        presence_for_excluded_candidates: true, absent_field_not_read: true, present_foreign_pair_read: true,
        proof_and_selection_and_R_preserved: true, runtime_unchanged: true, historical_inverse_delta_composed: true },
    limits: 'Initial RED incorrectly expected present undefined to reach evaluator; handle setup rejects it. Test fixed without product change. Models/kernel are not admitted graph mutations. Check validates saved runs and current files without rerunning suites. Auxiliary formatting branch not incorporated. No graph/host/global/production approval.' };
if (mode === '--write-new') fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
else assert.deepEqual(saved, record);
console.log(JSON.stringify({ valid: true, mode, base, scope: record.scope, wide: record.wide.tap }));
