'use strict';
// Verify the exact reviewed graph delta and identity of locally tested bytes.
// Saved run summaries are reported evidence, never an independent execution.
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
const { createHash } = require('node:crypto'); const { execFileSync } = require('node:child_process');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const root = path.resolve(__dirname, '../../..'); const base = '44342793c30573f38952e58a2c2ab0721065996e';
const graphPath = 'docs/contracts/next/provenance-v2/graphs-v2.json';
const proposalPath = 'docs/audit-evidence/n02g-causal-authoring-profile/direct-event-proposal-v2.json';
const tested = [graphPath, 'src/next/provenance/metricDirectReads.js', 'tests/next/provenance/authoringIndex.cases.js',
    'tests/next/provenance/directEvent.cases.js', 'tests/next/provenance/metricDirectReads.cases.js', 'tests/nextProvenance.test.js'];
const output = path.join(__dirname, 'direct-event-validation.json');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const mode = process.argv[2]; assert.ok(['--write-new', '--check'].includes(mode) && process.argv.length === 3);
const saved = mode === '--check' ? JSON.parse(fs.readFileSync(output, 'utf8')) : null;
if (!saved) assert.ok(!fs.existsSync(output), 'refuse_overwrite');
const local = phase => JSON.parse(read(`.codex-temp/n02g-direct-event-${phase}.json`));
const red = saved?.red || local('red');
const interim = saved?.interim || ['green', 'green-v2', 'green-v3', 'affected'].map(local);
const green = saved?.green || local('green-v4'); const affected = saved?.affected || local('affected-v2');
const wide = saved?.wide || JSON.parse(read('.codex-temp/wide-n02g-direct-event-20260925.json'));
assert.equal(red.exit_status, 1); assert.equal(red.tap.fail, 3);
assert.equal(green.tap.pass, 6); assert.equal(affected.tap.pass, 281);
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
const proposalText = read(proposalPath);
assert.equal(sha(proposalText), 'sha256:6d315f09056d13e0f0f68873c158c9e48567b7c28dac6a90036e31085083d490');
assert.equal(proposalText, git(['show', `${base}:${proposalPath}`]));
const proposal = JSON.parse(proposalText); const beforeText = git(['show', `${base}:${graphPath}`]);
const before = JSON.parse(beforeText); const expected = structuredClone(before); const current = JSON.parse(read(graphPath));
assert.equal(sha(canonicalValue(before)), proposal.source_corpus_sha256);
assert.equal(proposal.records.length, 5); assert.equal(current.graphs.length, 76);
assert.equal(new Set(current.graphs.map(g => g.fact_key)).size, 76);
const records = proposal.records.map(r => {
    const graph = expected.graphs.find(g => g.fact_key === r.fact_key); assert.ok(graph);
    assert.equal(sha(canonicalValue(graph)), r.source_graph_sha256);
    assert.deepEqual(graph.trace_contract.derivation, r.current_derivation);
    assert.equal(sha(canonicalValue(graph.trace_contract.proof)), r.proof_preserved_sha256);
    graph.trace_contract.derivation = structuredClone(r.proposed_derivation);
    const actual = current.graphs.find(g => g.fact_key === r.fact_key); assert.deepEqual(actual, graph);
    return { fact_key: r.fact_key, evaluator_ref: r.evaluator_ref, operand_bindings: r.operand_bindings,
        source_graph_sha256: r.source_graph_sha256, candidate_graph_sha256: sha(canonicalValue(actual)),
        proof_preserved_sha256: r.proof_preserved_sha256, before_derivation: r.current_derivation,
        after_derivation: r.proposed_derivation, delta: r.delta };
});
assert.deepEqual(current, expected); // All 71 other graphs and every non-derivation field are preserved.
const unchanged = proposal.documents.filter(d => d.path !== graphPath).map(d => {
    assert.equal(sha(read(d.path)), d.lf_sha256);
    assert.equal(sha(git(['show', `${base}:${d.path}`])), d.lf_sha256); return d;
});
const wideKeys = ['recorded_at', 'started_at', 'node', 'source_head', 'candidate_files', 'candidate_unchanged', 'duration_ms',
    'local_only', 'network_guard_scope', 'test_files', 'discovered_test_files', 'exit_status', 'signal', 'valid',
    'validation_reasons', 'tap', 'coverage', 'failures', 'skipped_tests'];
const record = { schema: 'n02g-direct-event-validation-v1', base, status: 'candidate_awaiting_independent_code_audit',
    evidence_kind: 'locally_executed_not_external_verdict', graph_accepted: false, releaseEligible: false,
    scope: { changed_graphs: 5, unchanged_graphs: 71, only_derivation_changed: true,
        source_corpus_sha256: proposal.source_corpus_sha256, before_lf_sha256: sha(beforeText), after_lf_sha256: sha(read(graphPath)) },
    records, unchanged, red, interim, green, affected,
    wide: Object.fromEntries(wideKeys.filter(k => wide[k] !== undefined).map(k => [k, wide[k]])),
    properties: { generated_kernel_cases: 48, admitted_integrations: 5, no_selection: true,
        expected_frozen_before_execution: true, missing_and_extra_observations_rejected: true,
        nominal_payment_category: true, full_event_schema_keys_projection: true, role_card_identity_and_version: true,
        reference_admission_failures: true, historical_proposals_unchanged: true },
    limits: 'Current-file checks verify identities and the exact frozen proposal, not the authenticity of saved execution reports. Initial GREEN harness errors and first affected failures are retained in interim. Proof is preserved, not executed or approved by this slice. Synthetic kernel variations are not mutated admitted financial snapshots. No global N02-G/NEXT-02 GO, NEXT-03, deploy, production or real data.' };
if (mode === '--write-new') fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
else assert.deepEqual(saved, record);
console.log(JSON.stringify({ valid: true, mode, base, scope: record.scope, focal: green.tap, affected: affected.tap, wide: wide.tap }));
