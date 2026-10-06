'use strict';
// Read-only reconciliation; no compiler, reference operator or D/P execution.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const bytesAt = relative => fs.readFileSync(path.join(root, relative));
const load = relative => JSON.parse(bytesAt(relative));
const bytes = bytesAt('.codex-temp/path-civil-final-wide-20261006.json'), report = JSON.parse(bytes);
const job = load('.codex-temp/path-civil-final-wide-20261006-job.json');
assert.equal(sha(bytes), 'ef05eb7f58fe2fb97136cc8203423dcf0d64de63a804b40a475688abf807f999');
assert.equal(job.report_sha256, sha(bytes)); assert.equal(job.status, 'completed');
assert.equal(job.exit_code, 0); assert.equal(report.exit_status, 0);
assert.equal(report.valid, true); assert.equal(report.matrix_green, true);
assert.deepEqual(report.validation_reasons, []); assert.equal(report.output_evidence.capture_complete, true);
const output = {};
for (const key of ['stdout', 'stderr']) {
    const entry = report.output_evidence[key], captured = fs.readFileSync(entry.path);
    assert.equal(captured.length, entry.bytes); assert.equal(sha(captured), entry.sha256);
    output[key] = { bytes: captured.length, sha256: sha(captured) };
}
const runner = require(path.join(root, 'scripts/runExhaustiveLocalTestCoverage.js'));
const text = fs.readFileSync(report.output_evidence.stdout.path, 'utf8');
const tap = runner.parseTapSummary(text), coverage = runner.parseCoverageSummary(text), skipped = runner.parseSkippedTests(text);
assert.deepEqual(tap, report.tap); assert.deepEqual(coverage, report.coverage);
assert.deepEqual(runner.validateRunnerResult({ exitStatus: report.exit_status, tap, coverage,
    skippedTests: skipped, expectedSkippedTests: runner.EXPECTED_SKIPPED_TESTS,
    subprocessError: report.output_evidence.subprocess_error }), { valid: true, reasons: [] });
assert.equal(tap.fail, 0); assert.equal(tap.cancelled, 0); assert.equal(tap.tests, 2635); assert.equal(tap.pass, 2625);
const measured = report.measured_sources_before.files;
assert.equal(new Set(measured.map(row => row.path)).size, measured.length);
const current = measured.map(row => ({ path: row.path, sha256: sha(bytesAt(row.path)) }));
assert.deepEqual(current, measured); assert.deepEqual(current, report.measured_sources_after.files);
assert.equal(sha(JSON.stringify(current)), job.measured_sources_before);
assert.equal(job.measured_sources_before, 'f5363b227e1d2f80dfd5350e970470a3d255b1285ee013a138e95e12712c5868');
assert.equal(report.measured_sources_unchanged, true);
const delta = ['src/next/provenance/pathSemanticReference.js', 'tests/next/provenance/pathSemanticV2.cases.js'].sort();
const priorBytes = bytesAt('.codex-temp/path-template-final-wide-20261006.json');
assert.equal(sha(priorBytes), '6dab8cd13ec4b6bb57596f6edac0c1d1945c83922faeee91b24fd232c7d837cd');
const prior = JSON.parse(priorBytes);
assert.deepEqual(current.map(row => row.path), prior.measured_sources_after.files.map(row => row.path));
assert.deepEqual(current.filter((row, index) => row.sha256 !== prior.measured_sources_after.files[index].sha256)
    .map(row => row.path).sort(), delta);
const retained = report.retained_coverage_files;
assert.ok(retained.length > 0); assert.equal(new Set(retained.map(row => row.name)).size, retained.length);
assert.deepEqual(fs.readdirSync(report.retained_coverage_directory).filter(name => name.endsWith('.json')).sort(),
    retained.map(row => row.name).sort());
for (const row of retained) {
    const native = fs.readFileSync(path.join(report.retained_coverage_directory, row.name));
    assert.equal(native.length, row.bytes); assert.equal(sha(native), row.sha256);
    JSON.parse(native.toString('utf8')); assert.equal(row.json_valid, true);
}
assert.deepEqual(report.retained_coverage_invalid_files, []);
const affectedBytes = bytesAt('.codex-temp/path-civil-affected-r2-20261006.json');
assert.equal(sha(affectedBytes), '703f9c311fd73da298b7258e2b5646f51dc8af7ab81b74098fbebc2bc360d0cc');
const affected = JSON.parse(affectedBytes);
assert.equal(affected.valid, true); assert.equal(affected.exit_code, 0);
assert.equal(affected.tap.tests, 34); assert.equal(affected.tap.pass, 34);
assert.equal(affected.measured_sources_unchanged, true);
assert.deepEqual(affected.measured_sources_before, affected.measured_sources_after);
for (const row of affected.measured_sources_after) assert.equal(sha(bytesAt(row.file)), row.sha256);
for (const [key, extension] of [['stdout', 'tap'], ['stderr', 'err']]) {
    const captured = bytesAt(`.codex-temp/path-civil-affected-r2-20261006.${extension}`);
    assert.equal(sha(captured), affected.output_evidence[key].sha256);
    assert.equal(captured.length, affected.output_evidence[key].bytes);
}
const censusBytes = bytesAt('.codex-temp/path-civil-reference-census-20261006.json');
assert.equal(sha(censusBytes), '72a25240a657d8b5085d3b09c9c7eee61af01f0fd78a700c78518802cdf349e5');
const census = JSON.parse(censusBytes);
assert.equal(census.stage, 'reference_only_census_not_semantic_qualification');
assert.equal(new Set(census.rows.map(row => row.mutation_id)).size, census.expected);
assert.equal(census.rows.length, census.expected);
assert.equal(sha(JSON.stringify(census.rows.map(row => row.mutation_id).sort())), census.expected_ids_sha256);
assert.equal(census.dp_executions, 0); assert.equal(census.matched, 0); assert.equal(census.semantic_mutation_credit, 0);
assert.equal(census.measured_sources_unchanged, true);
assert.deepEqual(census.measured_sources_before, census.measured_sources_after);
for (const row of census.measured_sources_after) assert.equal(sha(bytesAt(row.file)), row.sha256);
for (const row of census.rows) {
    assert.equal(row.dp_execution, false); assert.equal(row.executed, 0); assert.equal(row.matched, 0);
    assert.equal(new Set(row.references.map(item => item.candidate_id)).size, row.alternatives);
    assert.equal(row.reference_available, row.references.filter(item => item.reference.available).length);
    assert.equal(row.independently_discriminating, row.references.filter(item => item.reference.available
        && item.reference.baseline_satisfied && item.reference.mutant_satisfied === false).length);
    assert.ok(row.references.every(item => item.reference.financial_receipt === false
        && item.reference.mutation_id === row.mutation_id && item.reference.candidate_id === item.candidate_id
        && item.reference.source === 'admitted_frozen_claim_and_primary_snapshot_only'));
}
const sourceDelta = delta.map(file => {
    const value = bytesAt(file);
    return { path: file, bytes: value.length, sha256: sha(value),
        git_blob_sha1: crypto.createHash('sha1').update(`blob ${value.length}\0`).update(value).digest('hex') };
});
const summary = { schema_version: 'path-civil-reference-evidence/v1',
    evidence_kind: 'local_execution_reconciliation_not_independent_audit',
    audit_parent: 'c3365152ee307c1ff1adb68616bb9ad0dbf95eaa', source_delta: sourceDelta,
    report_sha256: sha(bytes), started_at: job.started_at, completed_at: job.completed_at,
    node: job.node, exit_code: job.exit_code, capture_valid: report.valid, matrix_green: report.matrix_green,
    tap, coverage, skipped_titles: skipped, exact_skipped_titles: true, output_evidence: output,
    sources: { files: current.length, sha256: sha(JSON.stringify(current)), unchanged: true },
    native_coverage: { files: retained.length, invalid: 0, manifest_sha256: sha(JSON.stringify(retained)) },
    affected: { report_sha256: sha(affectedBytes), tap: affected.tap, syntax_checks: affected.syntax.length },
    reference_census: { report_sha256: sha(censusBytes), expected_ids_sha256: census.expected_ids_sha256,
        expected_rows: census.expected, available_rows: census.rows.filter(row => row.reference_available).length,
        discriminating_rows: census.rows.filter(row => row.independently_discriminating).length,
        rows: census.rows.map(({ mutation_id, target, operator, alternatives, reference_available, independently_discriminating }) =>
            ({ mutation_id, target, operator, alternatives, reference_available, independently_discriminating, executed: 0, matched: 0 })) },
    runtime_tests_executed_by_verifier: false, dp_execution: false, semantic_mutation_credit: 0,
    independent_code_audit: false, global_go: false, historical_semantic_rows_rewritten: false };
if (process.argv.includes('--write')) fs.writeFileSync(path.join(__dirname,
    'path-civil-reference-final-evidence-20261006.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(summary, null, 2));
