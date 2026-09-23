'use strict';
// Reproducible local evidence, not an independent audit verdict.
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
const { createHash } = require('node:crypto'); const { execFileSync } = require('node:child_process');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const root = path.resolve(__dirname, '../../..'); const base = '95b7086ff56f2d95fed7fa5cd9516e36b5920737';
const graphPath = 'docs/contracts/next/provenance-v2/graphs-v2.json';
const tested = [graphPath, 'tests/next/provenance/authoringIndex.cases.js', 'tests/next/provenance/metricSelection.cases.js'];
const output = path.join(__dirname, 'source-presence-validation.json');
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replaceAll('\r\n', '\n');
const sha = b => `sha256:${createHash('sha256').update(b).digest('hex')}`;
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const mode = process.argv[2]; assert.ok(['--write-new', '--check'].includes(mode) && process.argv.length === 3);
const saved = mode === '--check' ? JSON.parse(fs.readFileSync(output, 'utf8')) : null;
if (!saved) assert.ok(!fs.existsSync(output));
const local = phase => JSON.parse(read(`.codex-temp/n02g-source-presence-${phase}.json`));
const red = saved?.red || local('red'); const green = saved?.green || local('green'); const affected = saved?.affected || local('affected');
const wide = saved?.wide || JSON.parse(read('.codex-temp/wide-n02g-source-presence-20260923.json'));
assert.equal(red.exit_status, 1); assert.equal(red.tap.fail, 2); assert.equal(red.tap.pass, 2);
assert.ok(red.failures[0].includes('SOURCE-PRESENCE-001')); assert.ok(red.failures[1].includes('SOURCE-PRESENCE-003'));
assert.equal(green.tap.pass, 4);
for (const r of [green, affected, wide]) {
    assert.equal(r.exit_status, 0); assert.equal(r.tap.fail, 0); assert.equal(r.tap.cancelled, 0); assert.equal(r.tap.todo, 0); assert.ok(r.tap.pass > 0);
}
assert.equal(green.tap.skipped, 0); assert.equal(affected.tap.skipped, 0);
assert.equal(wide.valid, true); assert.equal(wide.candidate_unchanged, true); assert.equal(wide.source_head, base);
assert.deepEqual(wide.candidate_files.map(f => f.path).sort(), tested);
for (const f of wide.candidate_files) assert.equal(sha(read(f.path)), f.lf_sha256);
assert.deepEqual(git(['diff', '--name-only', base]).trim().split(/\r?\n/).filter(f => /^(src|scripts|tests|docs\/contracts)\//.test(f)).sort(), tested);
const proposalText = read('docs/audit-evidence/n02g-causal-authoring-profile/source-entity-presence-proposal.json');
assert.equal(sha(proposalText), 'sha256:7571b472d390ae5c723579f0b941f4cdd1a5f8f98aa25ae1390a96e0447ee5a6');
const proposal = JSON.parse(proposalText); const beforeText = git(['show', `${base}:${graphPath}`]);
const before = JSON.parse(beforeText); const expected = structuredClone(before); const current = JSON.parse(read(graphPath));
assert.equal(sha(canonicalValue(before)), proposal.source_corpus_sha256); let added = 0;
for (const r of proposal.records) {
    const graph = expected.graphs.find(g => g.fact_key === r.fact_key);
    assert.equal(sha(canonicalValue(graph)), r.source_graph_sha256); assert.equal(r.proposed_delta.removed.length, 0);
    for (const item of r.proposed_delta.added) {
        const list = graph.trace_contract.derivation.required_structural;
        assert.ok(!list.some(v => canonicalValue(v) === canonicalValue(item))); list.push(item); added++;
    }
}
assert.equal(added, 3); assert.equal(proposal.records.length, 3); assert.equal(current.graphs.length, 76);
assert.deepEqual(current, expected);
const unchanged = proposal.documents.filter(d => d.path !== graphPath).map(d => {
    assert.equal(sha(read(d.path)), d.lf_sha256); assert.equal(sha(git(['show', `${base}:${d.path}`])), d.lf_sha256); return d;
});
const keys = ['recorded_at', 'started_at', 'node', 'source_head', 'candidate_files', 'candidate_unchanged', 'duration_ms',
    'local_only', 'network_guard_scope', 'test_files', 'discovered_test_files', 'exit_status', 'signal', 'valid',
    'validation_reasons', 'tap', 'coverage', 'failures', 'skipped_tests'];
const record = { schema: 'n02g-source-presence-validation-v1', base, status: 'candidate_awaiting_independent_code_audit',
    evidence_kind: 'locally_executed_not_external_verdict', graph_accepted: false, releaseEligible: false,
    scope: { changed_graphs: 3, unchanged_graphs: 73, added_structural: added, all_other_graph_fields_preserved: true,
        before_lf_sha256: sha(beforeText), after_lf_sha256: sha(read(graphPath)) }, unchanged, red, green, affected,
    wide: Object.fromEntries(keys.filter(k => wide[k] !== undefined).map(k => [k, wide[k]])),
    properties: { synthetic_authoring_models: 36, positive_order_variants: 72, negative_version_or_uniqueness_checks: 72,
        admitted_absent_source_integrations: 3, missing_presence_trace_mutants: 3, kernel_present_matching_scope_passes: true,
        kernel_present_wrong_scope_rejected: true, runtime_unchanged: true, selection_and_R_preserved: true,
        expected_frozen_before_execution: true },
    limits: 'Present-field kernel cases are not admitted mutated graphs. Historical corpus pins compose the three reviewed additions explicitly. No host, graph, global gate or production approval.' };
if (mode === '--write-new') fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
else assert.deepEqual(saved, record);
console.log(JSON.stringify({ valid: true, mode, base, wide: record.wide.tap, tested_files: tested.length, scope: record.scope }));
