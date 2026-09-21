'use strict';
// Mechanical evidence extraction only; no evaluator execution or normative write.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { buildCandidateReport } = require('../../../scripts/agent/reportNextCausalAuthoring.cjs');
const root = path.resolve(__dirname, '../../..');
const base = 'ad43ba41f0558e9329b8e494c824672d21de4b5d';
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'] });
const filename = path.join(__dirname, 'reconciliation-validation.json');
const tested = ['src/next/provenance/metricSelection.js', 'tests/next/provenance/authoringIndex.cases.js',
    'tests/next/provenance/metricSelection.cases.js'];
function build(mode) {
    const previous = mode === '--check' ? JSON.parse(fs.readFileSync(filename, 'utf8')) : null;
    const saved = previous?.wide || JSON.parse(read('.codex-temp/wide-n02g-profile-reconciliation-20260921.json'));
    assert.equal(saved.source_head, base); assert.equal(saved.candidate_unchanged, true);
    assert.equal(saved.valid, true); assert.equal(saved.exit_status, 0);
    assert.equal(saved.tap.pass, 2363); assert.equal(saved.tap.fail, 0); assert.equal(saved.tap.skipped, 10);
    assert.deepEqual(saved.candidate_files.map(f => f.path).sort(), tested);
    for (const file of saved.candidate_files) assert.equal(hash(read(file.path)), file.lf_sha256, `tested_bytes_changed:${file.path}`);
    const changed = git(['diff', '--name-only', base]).trim().split(/\r?\n/)
        .filter(file => /^(src|scripts|tests|docs\/contracts)\//.test(file)).sort();
    assert.deepEqual(changed, tested, 'causal_diff_outside_tested_files');
    const protectedFiles = ['docs/contracts/next/provenance-v2/graphs-v2.json',
        'docs/contracts/next/provenance-v2/claims-v2.json',
        'scripts/agent/nextCausalAuthoring.cjs', 'scripts/agent/reportNextCausalAuthoring.cjs',
        'docs/audit-evidence/n02g-causal-authoring-profile/candidate-report.json',
        'docs/audit-evidence/n02g-causal-authoring-profile/source-extract.json',
        ...git(['ls-tree', '-r', '--name-only', base, 'docs/contracts/next/provenance-v2/causal-authoring-candidates']).trim().split(/\r?\n/)];
    const unchanged = protectedFiles.map(file => {
        const digest = hash(read(file)); assert.equal(digest, hash(git(['show', `${base}:${file}`])), `base_changed:${file}`);
        return { path: file, lf_sha256: digest };
    });
    assert.deepEqual(buildCandidateReport(read), JSON.parse(read('docs/audit-evidence/n02g-causal-authoring-profile/candidate-report.json')));
    const affected = previous?.affected || JSON.parse(read('.codex-temp/n02g-profile-reconciliation-affected.json'));
    assert.equal(affected.exit_status, 0); assert.equal(affected.tap.pass, 135); assert.equal(affected.tap.fail, 0);
    assert.equal(affected.tap.skipped, 0); assert.equal(affected.files.length, 6);
    const keys = ['recorded_at', 'started_at', 'node', 'source_head', 'candidate_files', 'candidate_unchanged', 'duration_ms',
        'local_only', 'network_guard_scope', 'test_files', 'discovered_test_files', 'exit_status', 'signal', 'valid',
        'validation_reasons', 'tap', 'coverage', 'failures', 'skipped_tests'];
    return { schema: 'n02g-profile-reconciliation-validation-v1', status: 'candidate_awaiting_independent_audit',
        evidence_kind: 'locally_executed_not_external_verdict', base, graph_accepted: false, releaseEligible: false,
        normative_delta_applied: false,
        scope: 'instrument and statement runtime against independently frozen candidate obligations; selection and R preserved',
        red_observed: { test: 'AUTHOR-RECONCILE-001', graphs: 6, selection_and_R_matched: true,
            discrepancies: ['extra owner dependency', 'missing complete coverage read', 'missing statement policy id read', 'missing compensation presence observations'] },
        focal: { tests: 33, pass: 33, fail: 0, skipped: 0 }, affected,
        wide: Object.fromEntries(keys.map(key => [key, saved[key]])), unchanged,
        original_six_candidate_reports_unchanged: true, source_graph_count: 76,
        note: 'Helper added after the final wide run; no causal source/test changed afterwards. Check revalidates saved evidence and current bytes, not past test execution. No normative delta applied or global acceptance claimed.' };
}
const mode = process.argv[2]; assert.ok(['--write-new', '--check'].includes(mode) && process.argv.length === 3);
if (mode === '--write-new') assert.equal(fs.existsSync(filename), false, 'refuse_overwrite');
const record = build(mode);
if (mode === '--write-new') fs.writeFileSync(filename, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
else assert.deepEqual(JSON.parse(fs.readFileSync(filename, 'utf8')), record, 'evidence_changed');
console.log(JSON.stringify({ valid: true, mode, base, wide: record.wide.tap, tested_files: tested.length,
    original_six_candidate_reports_unchanged: true, source_graph_count: 76 }));
