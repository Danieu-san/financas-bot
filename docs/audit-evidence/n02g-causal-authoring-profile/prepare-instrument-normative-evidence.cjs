'use strict';
// Evidence check/extraction only. Does not execute an evaluator or apply graphs.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const { buildCandidateReport } = require('../../../scripts/agent/reportNextCausalAuthoring.cjs');
const root = path.resolve(__dirname, '../../..');
const base = '6f66556a256577c1bcdbc9678090b91dc43536ec';
const evidence = 'docs/audit-evidence/n02g-causal-authoring-profile/';
const graphPath = 'docs/contracts/next/provenance-v2/graphs-v2.json';
const filename = path.join(__dirname, 'instrument-normative-validation.json');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const digest = value => hash(canonicalValue(value));
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'] });
const tested = ['docs/contracts/next/provenance-v2/causal-authoring-candidates/README.md',
    graphPath, 'tests/next/provenance/authoringIndex.cases.js'];
const dimensions = ['required_claim_reads', 'required_edges', 'required_nodes', 'required_reads', 'required_structural'];
function build(mode) {
    const previous = mode === '--check' ? JSON.parse(fs.readFileSync(filename, 'utf8')) : null;
    const saved = previous?.wide || JSON.parse(read('.codex-temp/wide-n02g-instrument-normative-20260922.json'));
    assert.equal(saved.source_head, base); assert.equal(saved.candidate_unchanged, true);
    assert.equal(saved.valid, true); assert.equal(saved.exit_status, 0);
    assert.equal(saved.tap.pass, 2366); assert.equal(saved.tap.fail, 0); assert.equal(saved.tap.skipped, 10);
    assert.deepEqual(saved.candidate_files.map(f => f.path).sort(), tested);
    for (const file of saved.candidate_files) assert.equal(hash(read(file.path)), file.lf_sha256, `tested_bytes_changed:${file.path}`);
    assert.deepEqual(git(['diff', '--name-only', base]).trim().split(/\r?\n/)
        .filter(file => /^(src|scripts|tests|docs\/contracts)\//.test(file)).sort(), tested, 'causal_diff_outside_tested_files');
    const reportText = read(evidence + 'candidate-report.json'); const extractText = read(evidence + 'source-extract.json');
    assert.equal(hash(reportText), 'sha256:0140b589491ea40a1f315b744f338b84d987656707e62cb798b420d991eec012');
    assert.equal(hash(extractText), 'sha256:ab07fc9265c7412943fb814be96b71b3e6eb237f6b6e12f4ccf7b5c6e119363f');
    const reviewed = JSON.parse(reportText); const extract = JSON.parse(extractText);
    const beforeText = git(['show', `${base}:${graphPath}`]); const before = JSON.parse(beforeText);
    const current = JSON.parse(read(graphPath)); const expected = structuredClone(before);
    assert.equal(before.graphs.length, 76); assert.equal(current.graphs.length, 76);
    assert.equal(reviewed.records.length, 6); assert.equal(extract.records.length, 6);
    assert.equal(digest(before), reviewed.source_corpus_sha256);
    const records = reviewed.records.map(record => {
        const original = before.graphs.find(g => g.fact_key === record.fact_key);
        const source = extract.records.find(r => r.fact_key === record.fact_key);
        assert.deepEqual(source.graph, original); assert.equal(digest(original), record.source_graph_sha256);
        assert.deepEqual(Object.keys(record.candidate.obligations).sort(), dimensions);
        const candidate = expected.graphs.find(g => g.fact_key === record.fact_key);
        for (const field of dimensions) candidate.trace_contract.derivation[field] = record.candidate.obligations[field];
        assert.notEqual(digest(candidate), digest(original));
        return { fact_key: record.fact_key, before_graph_sha256: digest(original), after_graph_sha256: digest(candidate) };
    });
    assert.equal(new Set(records.map(r => r.fact_key)).size, 6);
    assert.deepEqual(current, expected, 'only_reviewed_five_dimensions_in_six_graphs_may_change');
    const unchanged = reviewed.documents.filter(d => d.path !== graphPath).map(document => {
        assert.equal(hash(read(document.path)), document.sha256, `authority_changed:${document.path}`);
        assert.equal(hash(git(['show', `${base}:${document.path}`])), document.sha256);
        return document;
    });
    const generated = buildCandidateReport(read);
    assert.deepEqual(generated.records.map(r => r.candidate), reviewed.records.map(r => r.candidate));
    assert.ok(Object.values(generated.totals).every(delta => delta.added === 0 && delta.removed === 0));
    assert.equal(generated.graph_accepted, false); assert.equal(generated.normative_application_allowed, false);
    const affected = previous?.affected || JSON.parse(read('.codex-temp/n02g-instrument-normative-affected-v2.json'));
    assert.equal(affected.exit_status, 0); assert.equal(affected.tap.pass, 149); assert.equal(affected.tap.fail, 0);
    assert.equal(affected.tap.skipped, 0); assert.equal(affected.six_generated_candidates_unchanged, true);
    assert.equal(affected.normative_delta_to_current_zero, true);
    const initialAffected = previous?.initial_affected || JSON.parse(read('.codex-temp/n02g-instrument-normative-affected.json'));
    assert.equal(initialAffected.exit_status, 1); assert.equal(initialAffected.tap.pass, 148); assert.equal(initialAffected.tap.fail, 1);
    assert.deepEqual(initialAffected.failures, ['not ok 15 - N02G:TRACE-COMPAT-001 required edge remains independent from derivation node and read coverage']);
    const keys = ['recorded_at', 'started_at', 'node', 'source_head', 'candidate_files', 'candidate_unchanged', 'duration_ms',
        'local_only', 'network_guard_scope', 'test_files', 'discovered_test_files', 'exit_status', 'signal', 'valid',
        'validation_reasons', 'tap', 'coverage', 'failures', 'skipped_tests'];
    return { schema: 'n02g-instrument-normative-validation-v1', status: 'candidate_awaiting_independent_audit',
        evidence_kind: 'locally_executed_not_external_verdict', base, graph_accepted: false, releaseEligible: false,
        normative_delta_applied: true, normative_application_automatic: false,
        scope: { changed_graphs: 6, unchanged_graphs: 70, dimensions, records, all_other_graph_fields_preserved: true,
            before_lf_sha256: hash(beforeText), after_lf_sha256: hash(read(graphPath)), reviewed_delta: reviewed.totals },
        red_observed: { test: 'AUTHOR-NORMATIVE-001', fact_key: 'S-05#1#1', failure: 'old normative graph differs from reviewed independent authoring' },
        initial_affected: initialAffected, diagnostic_correction: { removed_edges: 148, retained_edges_newly_covered: 18,
            unaffected_diagnostics_identical: true, scalar_read_independent_of_traversal_control_preserved: true },
        affected, wide: Object.fromEntries(keys.map(key => [key, saved[key]])), unchanged,
        original_six_candidates_unchanged: true, current_candidate_delta_zero: true,
        note: 'Helper added after final wide run; checks saved records and current bytes, not past execution. Full corpus checked against Git base and frozen report. No runtime change, graph acceptance, host authenticity, global gate GO or deployment.' };
}
const mode = process.argv[2]; assert.ok(['--write-new', '--check'].includes(mode) && process.argv.length === 3);
if (mode === '--write-new') assert.equal(fs.existsSync(filename), false, 'refuse_overwrite');
const record = build(mode);
if (mode === '--write-new') fs.writeFileSync(filename, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
else assert.deepEqual(JSON.parse(fs.readFileSync(filename, 'utf8')), record, 'evidence_changed');
console.log(JSON.stringify({ valid: true, mode, base, wide: record.wide.tap, tested_files: tested.length,
    changed_graphs: 6, unchanged_graphs: 70, all_other_graph_fields_preserved: true }));
