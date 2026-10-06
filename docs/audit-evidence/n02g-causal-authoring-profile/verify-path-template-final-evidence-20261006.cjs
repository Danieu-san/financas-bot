'use strict';
// Read-only reconciliation of retained local evidence, not independent approval.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const load = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const reportPath = '.codex-temp/path-template-final-wide-20261006.json';
const bytes = fs.readFileSync(path.join(root, reportPath)), report = JSON.parse(bytes);
const job = load('.codex-temp/path-template-final-wide-20261006-job.json');
assert.equal(sha(bytes), '6dab8cd13ec4b6bb57596f6edac0c1d1945c83922faeee91b24fd232c7d837cd');
assert.equal(job.report_sha256, sha(bytes));
assert.equal(job.status, 'completed'); assert.equal(job.exit_code, 0);
assert.equal(report.exit_status, 0); assert.equal(report.valid, true);
assert.equal(report.matrix_green, true); assert.deepEqual(report.validation_reasons, []);
assert.equal(report.output_evidence.capture_complete, true);
const output = {};
for (const key of ['stdout', 'stderr']) {
    const entry = report.output_evidence[key], captured = fs.readFileSync(entry.path);
    assert.equal(captured.length, entry.bytes); assert.equal(sha(captured), entry.sha256);
    output[key] = { bytes: captured.length, sha256: sha(captured) };
}
const runner = require(path.join(root, 'scripts/runExhaustiveLocalTestCoverage.js'));
const text = fs.readFileSync(report.output_evidence.stdout.path, 'utf8');
const tap = runner.parseTapSummary(text), coverage = runner.parseCoverageSummary(text);
const skipped = runner.parseSkippedTests(text);
assert.deepEqual(tap, report.tap); assert.deepEqual(coverage, report.coverage);
assert.deepEqual(runner.validateRunnerResult({ exitStatus: report.exit_status, tap, coverage,
    skippedTests: skipped, expectedSkippedTests: runner.EXPECTED_SKIPPED_TESTS,
    subprocessError: report.output_evidence.subprocess_error }), { valid: true, reasons: [] });
assert.equal(tap.fail, 0); assert.equal(tap.cancelled, 0); assert.equal(tap.pass, 2623);
const measured = report.measured_sources_before.files;
assert.equal(new Set(measured.map(row => row.path)).size, measured.length);
const current = measured.map(row => ({ path: row.path, sha256: sha(fs.readFileSync(path.join(root, row.path))) }));
assert.deepEqual(current, measured); assert.deepEqual(current, report.measured_sources_after.files);
assert.equal(sha(JSON.stringify(current)), report.measured_sources_before.sha256);
assert.equal(report.measured_sources_before.sha256, report.measured_sources_after.sha256);
assert.equal(report.measured_sources_unchanged, true);
const delta = ['src/next/provenance/operatorTypes.js', 'src/next/provenance/templateReferences.js',
    'tests/next/provenance/operatorTypes.cases.js', 'tests/next/provenance/templateReferences.cases.js',
    'tests/next/provenance/pathSemanticV2.cases.js'].sort();
const prior = load('.codex-temp/environment-stable-final-wide-20261006.json');
assert.deepEqual(current.map(row => row.path), prior.measured_sources_after.files.map(row => row.path));
assert.deepEqual(current.filter((row, index) => row.sha256 !== prior.measured_sources_after.files[index].sha256)
    .map(row => row.path).sort(), delta);
const retained = report.retained_coverage_files;
assert.equal(new Set(retained.map(row => row.name)).size, retained.length);
assert.deepEqual(fs.readdirSync(report.retained_coverage_directory).filter(name => name.endsWith('.json')).sort(),
    retained.map(row => row.name).sort());
for (const row of retained) {
    const native = fs.readFileSync(path.join(report.retained_coverage_directory, row.name));
    assert.equal(native.length, row.bytes); assert.equal(sha(native), row.sha256);
    JSON.parse(native.toString('utf8')); assert.equal(row.json_valid, true);
}
assert.deepEqual(report.retained_coverage_invalid_files, []);
const affectedBytes = fs.readFileSync(path.join(root, '.codex-temp/path-template-affected-20261006.json'));
assert.equal(sha(affectedBytes), '0c1ef551ad07d8503bc8322b10efec366d7ec8b6af4e123ab008984faa2687bd');
const affected = JSON.parse(affectedBytes);
assert.equal(affected.valid, true); assert.equal(affected.exit_code, 0);
assert.equal(affected.tap.tests, 32); assert.equal(affected.tap.pass, 32);
assert.equal(affected.measured_sources_unchanged, true);
const sourceDelta = delta.map(file => {
    const value = fs.readFileSync(path.join(root, file));
    return { path: file, bytes: value.length, sha256: sha(value),
        git_blob_sha1: crypto.createHash('sha1').update(`blob ${value.length}\0`).update(value).digest('hex') };
});
const summary = { schema_version: 'path-template-diagnostic-evidence/v1',
    evidence_kind: 'local_execution_reconciliation_not_independent_audit',
    audit_parent: '180547085ab3a24504c7d584374264ef242e1689', source_delta: sourceDelta,
    report_sha256: sha(bytes), started_at: job.started_at, completed_at: job.completed_at,
    node: job.node, exit_code: job.exit_code, capture_valid: report.valid, matrix_green: report.matrix_green,
    tap, coverage, skipped_titles: skipped, exact_skipped_titles: true, output_evidence: output,
    sources: { files: current.length, sha256: sha(JSON.stringify(current)), unchanged: true },
    native_coverage: { files: retained.length, invalid: 0, manifest_sha256: sha(JSON.stringify(retained)) },
    affected: { report_sha256: sha(affectedBytes), tap: affected.tap, syntax_checks: affected.syntax.length },
    runtime_tests_executed_by_verifier: false, semantic_mutation_credit: 0,
    independent_code_audit: false, global_go: false, historical_semantic_rows_rewritten: false };
if (process.argv.includes('--write')) fs.writeFileSync(path.join(__dirname,
    'path-template-diagnostic-final-evidence-20261006.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(summary, null, 2));
