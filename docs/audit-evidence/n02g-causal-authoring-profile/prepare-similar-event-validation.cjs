'use strict';
// Exact reviewed application and identity of locally tested bytes; no external verdict.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..'); const base = '133e919834ee53ddee3b51e47916331665716734';
const graphPath = 'docs/contracts/next/provenance-v2/graphs-v2.json';
const proposalPath = 'docs/audit-evidence/n02g-causal-authoring-profile/similar-event-proposal.json';
const tested = [graphPath, 'tests/next/provenance/authoringIndex.cases.js', 'tests/next/provenance/metricDirectReads.cases.js'];
const output = path.join(__dirname, 'similar-event-validation.json');
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replaceAll('\r\n', '\n');
const sha = b => `sha256:${createHash('sha256').update(b).digest('hex')}`;
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).replaceAll('\r\n', '\n');
// Verify canonicalization dependency before import.
assert.equal(read('src/next/kernel/canonicalValue.js'), git(['show', `${base}:src/next/kernel/canonicalValue.js`]));
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const mode = process.argv[2]; assert.ok(['--write-new', '--check'].includes(mode) && process.argv.length === 3);
const saved = mode === '--check' ? JSON.parse(fs.readFileSync(output, 'utf8')) : null;
if (!saved) assert.ok(!fs.existsSync(output), 'refuse_overwrite');
const local = label => {
    const r = JSON.parse(read(`.codex-temp/n02g-similar-event-${label}.json`));
    // Never publish host paths or local scratch inventory.
    return Object.fromEntries(['recorded_at', 'node', 'files', 'exit_status', 'tap', 'failures'].map(k => [k, r[k]]));
};
const red = saved?.red || local('red-v2'); const interim = saved?.interim || [local('red-v1'), local('green-v1'), local('affected-v1')];
const green = saved?.green || local('green-v2'); const affected = saved?.affected || local('affected-v2');
const wide = saved?.wide || JSON.parse(read('.codex-temp/wide-n02g-similar-event-20260926.json'));
assert.equal(red.exit_status, 1); assert.equal(red.tap.fail, 2); assert.equal(red.tap.pass, 1);
assert.equal(green.tap.pass, 4); assert.equal(affected.tap.pass, 261);
for (const r of [green, affected, wide]) {
    assert.equal(r.exit_status, 0); assert.equal(r.tap.fail, 0); assert.equal(r.tap.cancelled, 0); assert.equal(r.tap.todo, 0);
}
assert.equal(green.tap.skipped, 0); assert.equal(affected.tap.skipped, 0);
assert.equal(wide.valid, true); assert.equal(wide.candidate_unchanged, true); assert.equal(wide.source_head, base);
assert.deepEqual(wide.candidate_files.map(f => f.path), tested);
for (const f of wide.candidate_files) assert.equal(sha(read(f.path)), f.lf_sha256, `tested_bytes_changed:${f.path}`);
const material = f => /^(src|scripts|tests|docs\/contracts)\//.test(f);
const changed = [...new Set([...git(['diff', '--name-only', base]).trim().split(/\r?\n/),
    ...git(['ls-files', '--others', '--exclude-standard']).trim().split(/\r?\n/)])].filter(material).sort();
assert.deepEqual(changed, tested);
const text = read(proposalPath); assert.equal(sha(text), 'sha256:ee420d19e436280b7ab84a91429f81ae3c64c5cb4b058153ecbe64ae2ade3efa');
assert.equal(text, git(['show', `${base}:${proposalPath}`])); const p = JSON.parse(text);
const beforeText = git(['show', `${base}:${graphPath}`]); const expected = JSON.parse(beforeText); const current = JSON.parse(read(graphPath));
assert.equal(sha(canonicalValue(expected)), p.source_corpus_sha256); assert.equal(p.records.length, 1);
assert.equal(current.graphs.length, 76); assert.equal(new Set(current.graphs.map(g => g.fact_key)).size, 76);
for (const r of p.records) {
    const g = expected.graphs.find(g => g.fact_key === r.fact_key);
    assert.equal(sha(canonicalValue(g)), r.graph_sha256); assert.deepEqual(g.trace_contract.derivation, r.current_derivation);
    assert.equal(sha(canonicalValue(g.trace_contract.proof)), r.proof_preserved_sha256);
    for (const k of ['selected_nodes', 'required_selections', 'evidence_set_mode']) assert.deepEqual(r.current_derivation[k], r.proposed_derivation[k]);
    g.trace_contract.derivation = structuredClone(r.proposed_derivation);
}
assert.deepEqual(current, expected);
const unchanged = p.documents.filter(d => !tested.includes(d.path)).map(d => {
    assert.equal(sha(read(d.path)), d.lf_sha256, d.path);
    assert.equal(sha(git(['show', `${base}:${d.path}`])), d.lf_sha256, d.path); return d;
});
const wideKeys = ['recorded_at', 'started_at', 'node', 'source_head', 'candidate_files', 'candidate_unchanged', 'duration_ms',
    'local_only', 'network_guard_scope', 'test_files', 'discovered_test_files', 'exit_status', 'signal', 'valid',
    'validation_reasons', 'tap', 'coverage', 'failures', 'skipped_tests'];
const record = { schema: 'n02g-similar-event-validation-v1', base, evidence_kind: 'locally_executed_not_external_verdict',
    status: 'candidate_awaiting_independent_code_audit', graph_accepted: false, releaseEligible: false,
    scope: { changed_graphs: 1, unchanged_graphs: 75, only_reviewed_inventories_changed: true,
        source_corpus_sha256: p.source_corpus_sha256, before_lf_sha256: sha(beforeText), after_lf_sha256: sha(read(graphPath)) },
    proposal_sha256: sha(text), unchanged, red, interim, green, affected,
    wide: Object.fromEntries(wideKeys.filter(k => wide[k] !== undefined).map(k => [k, wide[k]])),
    properties: { generated_kernel_cases: 24, admitted_integrations: 1, expected_frozen_before_execution: true,
        old_profile_rejected: true, missing_observations_rejected: true, runtime_unchanged: true },
    limits: 'Current-file identities and exact corpus reconstruction verified. Saved runs are local reported evidence, not independent execution. Initial RED stopped before execution; RED v2 fails observed coverage. Proof preserved, not accepted. Kernel models are not admitted graph mutants. No global N02-G/NEXT-03/host/production GO.' };
if (mode === '--write-new') fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
else assert.deepEqual(saved, record);
console.log(JSON.stringify({ valid: true, mode, base, scope: record.scope, protected_sources: unchanged.length, focal: green.tap, affected: affected.tap, wide: wide.tap }));
