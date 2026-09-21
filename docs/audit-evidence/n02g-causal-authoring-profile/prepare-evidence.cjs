'use strict';
// Mechanical evidence only. Never runs an evaluator or changes a graph.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const { buildCandidateReport } = require('../../../scripts/agent/reportNextCausalAuthoring.cjs');
const root = path.resolve(__dirname, '../../..');
const base = '8b9c4fca93186c9f747ba1a868bf1616ba15d92a';
const graphPath = 'docs/contracts/next/provenance-v2/graphs-v2.json';
const claimPath = 'docs/contracts/next/provenance-v2/claims-v2.json';
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
const atBase = file => execFileSync('git', ['show', `${base}:${file}`], { cwd: root, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' });
const jsonHash = value => hash(canonicalValue(value));
const outputNames = ['candidate-report.json', 'source-extract.json', 'local-validation.json'];

function build(refMode) {
    const report = buildCandidateReport(read);
    const corpus = JSON.parse(read(graphPath)); const claims = JSON.parse(read(claimPath)).claims;
    const before = JSON.parse(atBase(graphPath));
    assert.equal(hash(read(claimPath)), hash(atBase(claimPath)), 'claims_changed_since_base');
    assert.equal(corpus.graphs.length, 76); assert.equal(report.candidate_graphs, 6);
    const covered = new Set(report.records.map(r => r.fact_key)); const deltaKeys = [];
    for (const graph of corpus.graphs) {
        const prior = before.graphs.find(g => g.fact_key === graph.fact_key); assert.ok(prior);
        assert.equal(jsonHash(prior.trace_contract.proof), jsonHash(graph.trace_contract.proof), 'proof_changed');
        for (const field of ['sets', 'selections', 'predicates', 'nodes', 'edges']) assert.equal(jsonHash(prior[field]), jsonHash(graph[field]), `${field}_changed`);
        assert.equal(jsonHash(prior.trace_contract.derivation.selected_nodes), jsonHash(graph.trace_contract.derivation.selected_nodes));
        assert.equal(jsonHash(prior.trace_contract.derivation.required_selections), jsonHash(graph.trace_contract.derivation.required_selections));
        if (jsonHash(prior) !== jsonHash(graph)) {
            const metric = claims.find(c => c.fact_key === graph.fact_key).metric;
            assert.ok(['refund_amount', 'safe_daily_pace', 'eligible_event_count'].includes(metric), 'unreviewed_existing_graph_delta');
            assert.equal(covered.has(graph.fact_key), false, 'profile_delta_was_applied');
            deltaKeys.push({ fact_key: graph.fact_key, metric });
        }
    }
    const extract = { schema: 'n02g-authoring-source-extract-v1', base, extraction: 'complete_six_graphs_and_claims_not_kernel_inputs',
        source_graphs_sha256: hash(read(graphPath)), source_claims_sha256: hash(read(claimPath)), graph_count: 76,
        candidate_profile_graphs_unchanged_since_base: 6, proof_preserved_since_base: 76,
        selections_preserved_since_base: 76, prior_reviewed_local_derivation_deltas: deltaKeys,
        records: report.records.map(r => ({ fact_key: r.fact_key, graph: corpus.graphs.find(g => g.fact_key === r.fact_key), claim: claims.find(c => c.fact_key === r.fact_key) })) };
    const saved = refMode === 'write' ? JSON.parse(read('.codex-temp/wide-n02g-causal-authoring-20260921.json'))
        : JSON.parse(fs.readFileSync(path.join(__dirname, 'local-validation.json'), 'utf8')).wide;
    assert.equal(saved.source_head, base); assert.equal(saved.candidate_unchanged, true);
    assert.equal(saved.valid, true); assert.equal(saved.exit_status, 0); assert.equal(saved.tap.fail, 0);
    for (const file of saved.candidate_files) assert.equal(hash(read(file.path)), file.lf_sha256, `tested_bytes_changed:${file.path}`);
    const keys = ['recorded_at', 'started_at', 'node', 'source_head', 'candidate_files', 'candidate_unchanged', 'duration_ms',
        'local_only', 'network_guard_scope', 'test_files', 'discovered_test_files', 'exit_status', 'signal', 'valid',
        'validation_reasons', 'tap', 'coverage', 'failures', 'skipped_tests'];
    const wide = Object.fromEntries(keys.map(key => [key, saved[key]]));
    const validation = { schema: 'n02g-authoring-local-validation-v1', status: 'candidate_awaiting_independent_audit',
        evidence_kind: 'locally_executed_not_external_verdict', graph_accepted: false, releaseEligible: false,
        note: 'Wide suite covers the local composition including pending runtime changes. It does not approve the proposed six-graph delta. No new code/tests changed after this run; this mechanical extraction helper was added afterwards.',
        wide, affected: { tests: 93, pass: 93, fail: 0, skipped: 0, scope: 'generator_and_historical_slices_hermetic' },
        report_sha256: jsonHash(report), source_extract_sha256: jsonHash(extract) };
    return [report, extract, validation];
}

if (require.main === module) {
    const mode = process.argv[2]; assert.ok(['--write-new', '--check'].includes(mode) && process.argv.length === 3);
    const values = build(mode === '--write-new' ? 'write' : 'check');
    if (mode === '--write-new') {
        for (const name of outputNames) assert.equal(fs.existsSync(path.join(__dirname, name)), false, 'refuse_overwrite');
        for (let i = 0; i < outputNames.length; i++) fs.writeFileSync(path.join(__dirname, outputNames[i]), JSON.stringify(values[i], null, 2) + '\n', { flag: 'wx' });
    } else {
        for (let i = 0; i < outputNames.length; i++) assert.deepEqual(JSON.parse(fs.readFileSync(path.join(__dirname, outputNames[i]), 'utf8')), values[i], `evidence_mismatch:${outputNames[i]}`);
    }
    console.log(JSON.stringify({ valid: true, mode, profiles: values[0].candidate_graphs, proof_preserved: values[1].proof_preserved_since_base,
        earlier_derivation_deltas: values[1].prior_reviewed_local_derivation_deltas, wide: values[2].wide.tap,
        output: outputNames.map(name => ({ name, bytes: fs.statSync(path.join(__dirname, name)).size })) }));
}
