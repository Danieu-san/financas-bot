'use strict';
// Saved local execution plus current corpus checks; not an external verdict.
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
const { createHash } = require('node:crypto'); const { execFileSync } = require('node:child_process');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const root = path.resolve(__dirname, '../../..'); const base = 'f7eeb4d89eac5671048b8b5d0ae2f17dac0325fb';
const graphPath = 'docs/contracts/next/provenance-v2/graphs-v2.json';
const tested = [graphPath, 'tests/next/provenance/authoringIndex.cases.js', 'tests/next/provenance/metricDirectReads.cases.js'];
const output = path.join(__dirname, 'owned-cards-validation.json');
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replaceAll('\r\n', '\n');
const sha = b => `sha256:${createHash('sha256').update(b).digest('hex')}`;
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const mode = process.argv[2]; assert.ok(['--write-new', '--check'].includes(mode) && process.argv.length === 3);
const saved = mode === '--check' ? JSON.parse(fs.readFileSync(output, 'utf8')) : null;
if (!saved) assert.ok(!fs.existsSync(output));
const local = phase => JSON.parse(read(`.codex-temp/n02g-owned-cards-${phase}.json`));
const initial = saved?.initial_harness_red || local('red'); const red = saved?.red || local('red-v2');
const initialGreen = saved?.initial_green || local('green'); const initialAffected = saved?.initial_affected || local('affected');
const green = saved?.green || local('green-v2'); const affected = saved?.affected || local('affected-v2');
const wide = saved?.wide || JSON.parse(read('.codex-temp/wide-n02g-owned-cards-20260923.json'));
assert.equal(initial.exit_status, 1); assert.equal(initial.tap.fail, 3); assert.equal(initial.tap.pass, 1);
assert.ok(initial.failures.some(f => f.includes('OWNED-CARDS-004')));
assert.equal(red.exit_status, 1); assert.equal(red.tap.fail, 2); assert.equal(red.tap.pass, 2);
assert.ok(red.failures[0].includes('OWNED-CARDS-001')); assert.ok(red.failures[1].includes('OWNED-CARDS-003'));
assert.equal(initialGreen.tap.pass, 4); assert.equal(initialGreen.tap.fail, 0); assert.equal(initialGreen.exit_status, 0);
assert.equal(initialAffected.tap.pass, 218); assert.equal(initialAffected.tap.fail, 1); assert.equal(initialAffected.exit_status, 1);
assert.equal(initialAffected.failures.length, 1); assert.ok(initialAffected.failures[0].includes('TRACE-COMPAT-001'));
assert.equal(green.tap.pass, 5);
for (const r of [green, affected, wide]) {
    assert.equal(r.exit_status, 0); assert.equal(r.tap.fail, 0); assert.equal(r.tap.cancelled, 0);
    assert.equal(r.tap.todo, 0); assert.ok(r.tap.pass > 0);
}
assert.equal(green.tap.skipped, 0); assert.equal(affected.tap.skipped, 0);
assert.equal(wide.valid, true); assert.equal(wide.candidate_unchanged, true); assert.equal(wide.source_head, base);
assert.deepEqual(wide.candidate_files.map(f => f.path).sort(), tested);
for (const f of wide.candidate_files) assert.equal(sha(read(f.path)), f.lf_sha256);
assert.deepEqual(git(['diff', '--name-only', base]).trim().split(/\r?\n/).filter(f => /^(src|scripts|tests|docs\/contracts)\//.test(f)).sort(), tested);
const proposalText = read('docs/audit-evidence/n02g-causal-authoring-profile/owned-cards-proposal.json');
assert.equal(sha(proposalText), 'sha256:4041c60f5dce971cc5d60989644f88d54c3aabaab0daa3f9b307b53aeca8d08a');
const proposal = JSON.parse(proposalText); const beforeText = git(['show', `${base}:${graphPath}`]);
const before = JSON.parse(beforeText); const expected = structuredClone(before); const current = JSON.parse(read(graphPath));
assert.equal(sha(canonicalValue(before)), proposal.source_corpus_sha256); let addedNodes = 0; let addedReads = 0;
for (const r of proposal.records) {
    const graph = expected.graphs.find(g => g.fact_key === r.fact_key);
    assert.equal(sha(canonicalValue(graph)), r.source_graph_sha256); assert.equal(r.proposed_delta.removed.length, 0);
    for (const node of r.proposed_delta.added_nodes) {
        assert.ok(!graph.trace_contract.derivation.required_nodes.includes(node));
        graph.trace_contract.derivation.required_nodes.push(node); addedNodes++;
    }
    for (const item of r.proposed_delta.added_reads) {
        assert.ok(!graph.trace_contract.derivation.required_reads.some(v => canonicalValue(v) === canonicalValue(item)));
        graph.trace_contract.derivation.required_reads.push(structuredClone(item)); addedReads++;
    }
}
assert.equal(addedNodes, 1); assert.equal(addedReads, 1); assert.equal(proposal.records.length, 1);
assert.equal(current.graphs.length, 76); assert.deepEqual(current, expected);
const unchanged = proposal.documents.filter(d => d.path !== graphPath).map(d => {
    assert.equal(sha(read(d.path)), d.lf_sha256); assert.equal(sha(git(['show', `${base}:${d.path}`])), d.lf_sha256); return d;
});
const keys = ['recorded_at', 'started_at', 'node', 'source_head', 'candidate_files', 'candidate_unchanged', 'duration_ms',
    'local_only', 'network_guard_scope', 'test_files', 'discovered_test_files', 'exit_status', 'signal', 'valid',
    'validation_reasons', 'tap', 'coverage', 'failures', 'skipped_tests'];
const record = { schema: 'n02g-owned-cards-validation-v1', base, status: 'candidate_awaiting_independent_code_audit',
    evidence_kind: 'locally_executed_not_external_verdict', graph_accepted: false, releaseEligible: false,
    scope: { changed_graphs: 1, unchanged_graphs: 75, added_nodes: addedNodes, added_reads: addedReads,
        all_other_graph_fields_preserved: true, before_lf_sha256: sha(beforeText), after_lf_sha256: sha(read(graphPath)) },
    unchanged, initial_harness_red: initial, red, initial_green: initialGreen, initial_affected: initialAffected, green, affected,
    wide: Object.fromEntries(keys.filter(k => wide[k] !== undefined).map(k => [k, wide[k]])),
    properties: { synthetic_authoring_models: 36, positive_variants: 132, negative_checks: 348,
        admitted_integrations: 1, kernel_variants: 6, expected_frozen_before_execution: true,
        historical_inventory_rejected: true, missing_foreign_owner_id_rejected: true,
        family_id_not_consumed: true, same_id_other_version_excluded: true,
        proof_and_selection_and_R_preserved: true, runtime_unchanged: true,
        historical_edge_only_case_removed_exactly: 'S-07#1#1/derivation/e0002' },
    limits: 'Initial kernel harness used a mismatched binding role and was corrected without product changes. Synthetic/kernel cases are not admitted graph mutations. Check validates saved records and current files, not rerunning suites. Auxiliary source-view branch is not incorporated. No graph/host/global/production approval.' };
if (mode === '--write-new') fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
else assert.deepEqual(saved, record);
console.log(JSON.stringify({ valid: true, mode, base, scope: record.scope, wide: record.wide.tap }));
