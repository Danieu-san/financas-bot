'use strict';
// Saved LOCAL test evidence and exact reviewed delta, not external execution.
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
const { createHash } = require('node:crypto'); const { execFileSync } = require('node:child_process');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const root = path.resolve(__dirname, '../../..'); const base = 'c432bd639d7da076d3a51ec3d638335219933599';
const graphPath = 'docs/contracts/next/provenance-v2/graphs-v2.json';
const filename = path.join(__dirname, 'budget-class-validation.json');
const tested = [graphPath, 'tests/next/provenance/authoringIndex.cases.js'];
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replaceAll('\r\n', '\n');
const hash = b => `sha256:${createHash('sha256').update(b).digest('hex')}`;
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
function build(mode) {
    const previous = mode === '--check' ? JSON.parse(fs.readFileSync(filename, 'utf8')) : null;
    const local = phase => JSON.parse(read(`.codex-temp/n02g-budget-class-${phase}.json`));
    const red = previous?.red || local('red'); const green = previous?.green || local('green'); const affected = previous?.affected || local('affected');
    const wide = previous?.wide || JSON.parse(read('.codex-temp/wide-n02g-budget-class-20260922.json'));
    assert.equal(red.exit_status, 1); assert.equal(red.tap.fail, 2); assert.equal(red.tap.pass, 1);
    assert.ok(red.failures[0].includes('BUDGET-CLASS-001')); assert.ok(red.failures[1].includes('BUDGET-CLASS-003'));
    assert.equal(green.tap.pass, 3);
    for (const record of [green, affected, wide]) {
        assert.equal(record.exit_status, 0); assert.equal(record.tap.fail, 0); assert.equal(record.tap.cancelled, 0);
        assert.equal(record.tap.todo, 0); assert.ok(record.tap.pass > 0);
    }
    assert.equal(green.tap.skipped, 0); assert.equal(affected.tap.skipped, 0);
    assert.equal(wide.valid, true); assert.equal(wide.candidate_unchanged, true); assert.equal(wide.source_head, base);
    assert.deepEqual(wide.candidate_files.map(f => f.path).sort(), tested);
    for (const file of wide.candidate_files) assert.equal(hash(read(file.path)), file.lf_sha256, `tested_bytes_changed:${file.path}`);
    assert.deepEqual(git(['diff', '--name-only', base]).trim().split(/\r?\n/).filter(f => /^(src|scripts|tests|docs\/contracts)\//.test(f)).sort(), tested);
    const proposalText = read('docs/audit-evidence/n02g-causal-authoring-profile/budget-class-population-proposal.json');
    assert.equal(hash(proposalText), 'sha256:3a7fe567cb35866d230ffe6b7706c5e53a552fbaa4303ed1902ccbdd63bd1583');
    const proposal = JSON.parse(proposalText); const beforeText = git(['show', `${base}:${graphPath}`]);
    const before = JSON.parse(beforeText); const expected = structuredClone(before); const current = JSON.parse(read(graphPath));
    assert.equal(hash(canonicalValue(before)), proposal.source_corpus_sha256);
    let removed = 0;
    for (const record of proposal.records) {
        const graph = expected.graphs.find(g => g.fact_key === record.fact_key);
        assert.equal(hash(canonicalValue(graph)), record.source_graph_sha256); assert.equal(record.proposed_delta.added.length, 0);
        for (const read of record.proposed_delta.removed) {
            const list = graph.trace_contract.derivation.required_reads;
            const indices = list.flatMap((r, i) => canonicalValue(r) === canonicalValue(read) ? [i] : []);
            assert.equal(indices.length, 1); list.splice(indices[0], 1); removed++;
        }
    }
    assert.equal(removed, 2); assert.equal(proposal.records.length, 2); assert.equal(current.graphs.length, 76);
    assert.deepEqual(current, expected, 'only_two_reviewed_reads_may_be_removed');
    const unchanged = proposal.documents.filter(d => d.path !== graphPath).map(d => {
        assert.equal(hash(read(d.path)), d.lf_sha256); assert.equal(hash(git(['show', `${base}:${d.path}`])), d.lf_sha256); return d;
    });
    const keys = ['recorded_at', 'started_at', 'node', 'source_head', 'candidate_files', 'candidate_unchanged', 'duration_ms',
        'local_only', 'network_guard_scope', 'test_files', 'discovered_test_files', 'exit_status', 'signal', 'valid',
        'validation_reasons', 'tap', 'coverage', 'failures', 'skipped_tests'];
    return { schema: 'n02g-budget-class-validation-v1', base, status: 'candidate_awaiting_independent_code_audit',
        evidence_kind: 'locally_executed_not_external_verdict', graph_accepted: false, releaseEligible: false,
        scope: { changed_graphs: 2, unchanged_graphs: 74, removed_reads: removed, all_other_graph_fields_preserved: true,
            before_lf_sha256: hash(beforeText), after_lf_sha256: hash(read(graphPath)) }, unchanged, red, green, affected,
        wide: Object.fromEntries(keys.filter(k => wide[k] !== undefined).map(k => [k, wide[k]])),
        properties: { synthetic_authoring_models: 48, positive_order_variants: 96, negative_identity_or_source_class_checks: 96,
            admitted_integration_graphs: 2, missing_required_read_mutants: 14, runtime_unchanged: true,
            selection_and_R_preserved: true, expected_frozen_before_execution: true },
        note: 'Property models are authoring inputs, not admitted graph mutants. Full corpus restoration composes reviewed budget-class/state/instrument deltas without removing historical equality checks. No graph, proof, host, global gate or production approval.' };
}
const mode = process.argv[2]; assert.ok(['--write-new', '--check'].includes(mode) && process.argv.length === 3);
if (mode === '--write-new') assert.equal(fs.existsSync(filename), false, 'refuse_overwrite');
const record = build(mode);
if (mode === '--write-new') fs.writeFileSync(filename, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
else assert.deepEqual(JSON.parse(fs.readFileSync(filename, 'utf8')), record);
console.log(JSON.stringify({ valid: true, mode, base, wide: record.wide.tap, tested_files: tested.length, scope: record.scope }));
