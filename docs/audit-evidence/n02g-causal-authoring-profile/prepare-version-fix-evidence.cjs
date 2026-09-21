'use strict';
// Mechanical evidence extraction; does not change contracts or run evaluators.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { buildCandidateReport } = require('../../../scripts/agent/reportNextCausalAuthoring.cjs');
const root = path.resolve(__dirname, '../../..');
const base = 'ace83e80a1a2cf12ba2f9a7a8f6ace9ebdc5adbd';
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'] });
const filename = path.join(__dirname, 'version-fix-validation.json');
function build(mode) {
    const previous = mode === '--check' ? JSON.parse(fs.readFileSync(filename, 'utf8')) : null;
    const saved = previous?.wide || JSON.parse(read('.codex-temp/wide-n02g-authoring-version-20260921.json'));
    assert.equal(saved.source_head, base); assert.equal(saved.candidate_unchanged, true);
    assert.equal(saved.valid, true); assert.equal(saved.exit_status, 0); assert.equal(saved.tap.fail, 0);
    assert.deepEqual(saved.candidate_files.map(f => f.path).sort(), [
        'docs/contracts/next/provenance-v2/causal-authoring-candidates/README.md',
        'scripts/agent/nextCausalAuthoring.cjs', 'tests/next/provenance/causalAuthoring.cases.js']);
    for (const file of saved.candidate_files) assert.equal(hash(read(file.path)), file.lf_sha256, `tested_bytes_changed:${file.path}`);
    const changed = git(['diff', '--name-only', base]).trim().split(/\r?\n/)
        .filter(file => /^(src|scripts|tests|docs\/contracts)\//.test(file)).sort();
    assert.deepEqual(changed, saved.candidate_files.map(f => f.path).sort(), 'causal_diff_outside_tested_files');
    const unchanged = [
        'docs/contracts/next/provenance-v2/graphs-v2.json',
        'docs/contracts/next/provenance-v2/claims-v2.json',
        'docs/audit-evidence/n02g-causal-authoring-profile/candidate-report.json',
        'docs/audit-evidence/n02g-causal-authoring-profile/source-extract.json'
    ].map(file => {
        const digest = hash(read(file)); assert.equal(digest, hash(git(['show', `${base}:${file}`])), `base_changed:${file}`);
        return { path: file, lf_sha256: digest };
    });
    const report = buildCandidateReport(read);
    assert.deepEqual(report, JSON.parse(read('docs/audit-evidence/n02g-causal-authoring-profile/candidate-report.json')));
    const affected = previous?.affected || JSON.parse(read('.codex-temp/n02g-author-version-affected.json'));
    assert.equal(affected.exit_status, 0); assert.equal(affected.tap.pass, 1); assert.equal(affected.tap.fail, 0);
    assert.equal(affected.original_six_candidate_reports_unchanged, true);
    const keys = ['recorded_at', 'started_at', 'node', 'source_head', 'candidate_files', 'candidate_unchanged', 'duration_ms',
        'local_only', 'network_guard_scope', 'test_files', 'discovered_test_files', 'exit_status', 'signal', 'valid',
        'validation_reasons', 'tap', 'coverage', 'failures', 'skipped_tests'];
    return { schema: 'n02g-authoring-version-fix-validation-v1', status: 'candidate_awaiting_independent_audit',
        evidence_kind: 'locally_executed_not_external_verdict', base, graph_accepted: false, releaseEligible: false,
        correction: 'instrument contribution requires equal id and version; foreign target observations remain required',
        red_observed: { test: 'AUTHOR-GENERATE-010', fact_key: 'M-02#1#1', expected: false, actual: true },
        focal: { tests: 26, pass: 26, fail: 0, skipped: 0 }, affected,
        wide: Object.fromEntries(keys.map(key => [key, saved[key]])), unchanged,
        original_six_candidate_reports_unchanged: true, source_graph_count: 76,
        note: 'Historical evidence stays bound to its original hash. This mechanical helper was added after the final wide run; no causal source/test changed afterwards. No normative delta applied.' };
}
const mode = process.argv[2]; assert.ok(['--write-new', '--check'].includes(mode) && process.argv.length === 3);
if (mode === '--write-new') assert.equal(fs.existsSync(filename), false, 'refuse_overwrite');
const record = build(mode);
if (mode === '--write-new') fs.writeFileSync(filename, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
else assert.deepEqual(JSON.parse(fs.readFileSync(filename, 'utf8')), record, 'evidence_changed');
console.log(JSON.stringify({ valid: true, mode, base, wide: record.wide.tap,
    tested_files: record.wide.candidate_files.length, original_six_candidate_reports_unchanged: true, source_graph_count: 76 }));
