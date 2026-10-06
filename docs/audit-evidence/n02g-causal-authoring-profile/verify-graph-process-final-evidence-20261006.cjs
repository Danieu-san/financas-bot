'use strict';

// Reads retained local evidence; never invokes tests, compiler, D/P or production.
// --write materializes a sanitized summary, not independent audit approval.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const load = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const reportPath = '.codex-temp/environment-stable-final-wide-20261006.json';
const reportBytes = fs.readFileSync(path.join(root, reportPath));
const report = JSON.parse(reportBytes);
const job = load('.codex-temp/environment-stable-final-wide-20261006-job.json');
assert.equal(sha(reportBytes), '1c1507b9ff54ff0f3976ff013a979d66973b0375fde45cd1a83d8e5528cf1399');
assert.equal(job.report_sha256, sha(reportBytes));
assert.equal(job.status, 'completed');
assert.equal(job.exit_code, 0);
assert.equal(report.exit_status, 0);
assert.equal(report.valid, true);
assert.equal(report.matrix_green, true);
assert.deepEqual(report.validation_reasons, []);
assert.equal(report.output_evidence.capture_complete, true);
const output = {};
for (const key of ['stdout', 'stderr']) {
  const entry = report.output_evidence[key];
  const bytes = fs.readFileSync(entry.path);
  assert.equal(bytes.length, entry.bytes);
  assert.equal(sha(bytes), entry.sha256);
  output[key] = { bytes: bytes.length, sha256: sha(bytes) };
}
const runner = require(path.join(root, 'scripts/runExhaustiveLocalTestCoverage.js'));
const stdout = fs.readFileSync(report.output_evidence.stdout.path, 'utf8');
assert.deepEqual(runner.parseTapSummary(stdout), report.tap);
assert.deepEqual(runner.parseCoverageSummary(stdout), report.coverage);
assert.equal(report.tap.fail, 0);
assert.equal(report.tap.cancelled, 0);
const files = report.measured_sources_before.files;
assert.equal(new Set(files.map(row => row.path)).size, files.length);
const current = files.map(row => ({ path: row.path, sha256: sha(fs.readFileSync(path.join(root, row.path))) }));
assert.deepEqual(current, files);
assert.deepEqual(current, report.measured_sources_after.files);
const sourceHash = sha(Buffer.from(JSON.stringify(current)));
assert.equal(sourceHash, report.measured_sources_before.sha256);
assert.equal(sourceHash, report.measured_sources_after.sha256);
assert.equal(report.measured_sources_unchanged, true);
const retained = report.retained_coverage_files;
assert.equal(new Set(retained.map(row => row.name)).size, retained.length);
const actualNames = fs.readdirSync(report.retained_coverage_directory).filter(name => name.endsWith('.json')).sort();
assert.deepEqual(actualNames, retained.map(row => row.name).sort());
for (const row of retained) {
  const bytes = fs.readFileSync(path.join(report.retained_coverage_directory, row.name));
  assert.equal(bytes.length, row.bytes);
  assert.equal(sha(bytes), row.sha256);
  assert.equal(row.json_valid, true);
  JSON.parse(bytes.toString('utf8'));
}
assert.deepEqual(report.retained_coverage_invalid_files, []);
const fixturePath = 'tests/next/provenance/executionHost.cases.js';
const fixture = fs.readFileSync(path.join(root, fixturePath));
const summary = {
  schema_version: 'graph-process-fixture-final-evidence/v1',
  evidence_kind: 'local_execution_reconciliation_not_independent_audit',
  audit_parent: 'c27cf81dee9dd8a273a407aae3f17c591544d90f',
  measured_code_delta: [fixturePath],
  fixture_sha256: sha(fixture),
  fixture_git_blob_sha1: crypto.createHash('sha1').update(Buffer.from('blob ' + fixture.length + '\0')).update(fixture).digest('hex'),
  report_sha256: sha(reportBytes), started_at: job.started_at, completed_at: job.completed_at,
  node: job.node, exit_status: report.exit_status, capture_valid: report.valid,
  matrix_green: report.matrix_green, validation_reasons: report.validation_reasons,
  tap: report.tap, coverage: report.coverage, output_evidence: output,
  measured_sources: { files: current.length, sha256: sourceHash, unchanged: true },
  retained_coverage: { files: retained.length, invalid: 0, manifest_sha256: sha(Buffer.from(JSON.stringify(retained))) },
  causal_execution_change: report.causal_execution_change,
  exact_116_recovery_partition: report.exact_116_recovery_partition,
  historical_red_retained: true, original_eleven_cancellations_cause_established: false,
  independent_code_audit: false, published_new_candidate: false, global_go: false,
  semantic_ids_outside_month_focal: 2418,
  no_runtime_tests_executed_by_verifier: true
};
if (process.argv.includes('--write')) {
  const target = path.join(__dirname, 'graph-process-fixture-final-evidence-20261006.json');
  fs.writeFileSync(target, JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
}
process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
