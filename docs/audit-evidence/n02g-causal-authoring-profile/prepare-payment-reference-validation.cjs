'use strict';
// Saved local execution evidence plus current content checks. This does not
// rerun tests, authenticate their execution externally or accept any graph.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const base = '151816b6e02a500754aaf72796755ed693f39907';
const tested = ['src/next/provenance/metricEffects.js', 'tests/next/provenance/authoringIndex.cases.js', 'tests/next/provenance/metricEffects.cases.js'];
const output = path.join(__dirname, 'payment-reference-validation.json');
const mode = process.argv[2]; assert.ok(['--write-new', '--check'].includes(mode) && process.argv.length === 3);
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replaceAll('\r\n', '\n');
const sha = b => `sha256:${createHash('sha256').update(b).digest('hex')}`;
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
const saved = mode === '--check' ? JSON.parse(fs.readFileSync(output, 'utf8')) : null;
if (!saved) assert.ok(!fs.existsSync(output));
const summary = phase => {
    const runner = require('../../../scripts/runExhaustiveLocalTestCoverage');
    const text = read(`.codex-temp/payment-reference-${phase}-20260924.tap`);
    return { tap: runner.parseTapSummary(text), failures: runner.parseFailures(text), local_log_lf_sha256: sha(text) };
};
const red = saved?.red || summary('red'), green = saved?.green || summary('green');
const initialAffected = saved?.initial_affected || JSON.parse(read('.codex-temp/payment-reference-affected-20260924.json'));
assert.equal(initialAffected.tap.fail, 1); assert.equal(initialAffected.exit_status, 1);
assert.equal(initialAffected.failures.length, 1); assert.ok(initialAffected.failures[0].includes('TRANSFER-SCOPE-001'));
const affected = saved?.affected || JSON.parse(read('.codex-temp/payment-reference-affected-v2-20260924.json'));
const wide = saved?.wide || JSON.parse(read('.codex-temp/wide-n02g-payment-reference-20260924.json'));
assert.equal(red.tap.tests, 3); assert.equal(red.tap.fail, 3); assert.equal(red.tap.pass, 0);
assert.equal(green.tap.tests, 3); assert.equal(green.tap.pass, 3);
for (const r of [green, affected, wide]) {
    assert.equal(r.tap.fail, 0); assert.equal(r.tap.cancelled, 0); assert.equal(r.tap.todo, 0); assert.ok(r.tap.pass > 0);
}
assert.equal(green.tap.skipped, 0); assert.equal(affected.tap.skipped, 0); assert.equal(affected.exit_status, 0);
assert.equal(wide.exit_status, 0); assert.equal(wide.valid, true); assert.equal(wide.candidate_unchanged, true); assert.equal(wide.source_head, base);
assert.deepEqual(wide.candidate_files.map(f => f.path), tested);
for (const f of wide.candidate_files) assert.equal(sha(read(f.path)), f.lf_sha256);
const causalDiff = git(['diff', '--name-only', base]).split(/\r?\n/).filter(f => /^(src|scripts|tests|docs\/contracts)\//.test(f)).sort();
assert.deepEqual(causalDiff, tested);
const extraCausalFiles = git(['ls-files', '--others', '--exclude-standard']).split(/\r?\n/)
    .filter(f => /^(src|scripts|tests|docs\/contracts)\//.test(f));
assert.deepEqual(extraCausalFiles, [], 'untracked_causal_files');
// Entire normative corpus and every other provenance source stay byte-identical
// after LF normalization. Identity checks are not semantic correctness proofs.
const protectedPaths = git(['ls-tree', '-r', '--name-only', base, '--', 'docs/contracts/next/provenance-v2', 'src/next/provenance'])
    .split(/\r?\n/).filter(f => f && !tested.includes(f));
const protectedFiles = protectedPaths.map(file => {
    const before = execFileSync('git', ['show', `${base}:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    assert.equal(read(file), before.replaceAll('\r\n', '\n'), file);
    return { path: file, lf_sha256: sha(read(file)) };
});
const graphPath = 'docs/contracts/next/provenance-v2/graphs-v2.json';
const corpus = JSON.parse(read(graphPath));
assert.equal(corpus.graphs.length, 76); assert.equal(new Set(corpus.graphs.map(g => g.fact_key)).size, 76);
// Bounded source projection for review, not a replacement normative contract.
// Recomputed from the byte-checked, immutable-base-identical full corpus above.
const normativeContext = { source: graphPath, base_blob: git(['rev-parse', `${base}:${graphPath}`]),
    source_lf_sha256: sha(read(graphPath)), records: ['S-09#1#1', 'M-05#1#5', 'N-08#1#1'].map(key => {
        const graph = corpus.graphs.find(g => g.fact_key === key); assert.ok(graph);
        const links = graph.edges.filter(e => ['account_id', 'settles_card_id'].includes(e.field));
        assert.equal(links.length, 2);
        return { fact_key: key, claim_id: graph.claim_id, derivation: graph.trace_contract.derivation,
            payment_links: links.map(edge => ({ edge,
                derivation_required: graph.trace_contract.derivation.required_edges.includes(edge.id),
                proof_required: graph.trace_contract.proof.required_edges.includes(edge.id),
                proof_reads: graph.trace_contract.proof.required_reads.filter(r => r.node === edge.target || r.node === edge.source && r.segments[0] === edge.field),
                proof_predicates: graph.predicates.filter(p => edge.proof_predicates.includes(p.id)) })) };
    }) };
const keys = ['recorded_at', 'started_at', 'node', 'source_head', 'candidate_files', 'candidate_unchanged', 'duration_ms',
    'local_only', 'network_guard_scope', 'test_files', 'discovered_test_files', 'exit_status', 'signal', 'valid',
    'validation_reasons', 'tap', 'coverage', 'failures', 'skipped_tests'];
const record = { schema: 'n02g-payment-reference-validation-v1', base, status: 'candidate_awaiting_independent_code_audit',
    evidence_kind: 'locally_executed_not_external_verdict', execution_authentication: false, graph_accepted: false, releaseEligible: false,
    changed_sources: tested, protected_files: protectedFiles, normative_context: normativeContext,
    red, green, initial_affected: initialAffected, affected,
    wide: Object.fromEntries(keys.filter(k => wide[k] !== undefined).map(k => [k, wide[k]])),
    properties: { kernel_variants: 72, admitted_derivation_integrations: 3, missing_observation_negatives: 4,
        expected_frozen_before_execution: true, corpus_and_proof_unchanged: true,
        no_target_payload_or_account_access: true, payment_reference_scalar_and_edge_required: true },
    limits: 'Kernel result is not proof acceptance. Separate economic proof remains required, not executed by these focal tests. Local summaries are not external execution authentication. No global N02-G/NEXT-03/deploy/production approval.' };
if (mode === '--write-new') fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
else assert.deepEqual(saved, record);
console.log(JSON.stringify({ valid: true, mode, base, protected_files: protectedFiles.length, focal: green.tap, affected: affected.tap, wide: wide.tap }));
