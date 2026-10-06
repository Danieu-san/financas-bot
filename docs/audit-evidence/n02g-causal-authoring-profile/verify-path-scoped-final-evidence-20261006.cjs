'use strict';
// Read-only reconciliation; no compiler, reference operator or D/P execution.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const bytesAt = relative => fs.readFileSync(path.join(root, relative));
const load = relative => JSON.parse(bytesAt(relative));
const bytes = bytesAt('.codex-temp/path-scoped-final-wide-20261006.json'), report = JSON.parse(bytes);
const job = load('.codex-temp/path-scoped-final-wide-20261006-job.json');
assert.equal(sha(bytes), '3ff08bc54e9afc510209ecd1dc16d646d1390ac18e018712fe341032ca9c3c7d');
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
assert.equal(tap.fail, 0); assert.equal(tap.cancelled, 0); assert.equal(tap.tests, 2637); assert.equal(tap.pass, 2627);
const measured = report.measured_sources_before.files;
assert.equal(new Set(measured.map(row => row.path)).size, measured.length);
const current = measured.map(row => ({ path: row.path, sha256: sha(bytesAt(row.path)) }));
assert.deepEqual(current, measured); assert.deepEqual(current, report.measured_sources_after.files);
assert.equal(sha(JSON.stringify(current)), job.measured_sources_before);
assert.equal(job.measured_sources_before, '34faac2624f559f9cad483ffb8853db0b749ead629bdbedf8cc58be80375013b');
assert.equal(report.measured_sources_unchanged, true);
const delta = ['scripts/agent/executeNextPredicateStrategyMatrix.mjs', 'tests/next/provenance/pathSemanticV2.cases.js'].sort();
const priorBytes = bytesAt('.codex-temp/path-civil-final-wide-20261006.json');
assert.equal(sha(priorBytes), 'ef05eb7f58fe2fb97136cc8203423dcf0d64de63a804b40a475688abf807f999');
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
const affectedBytes = bytesAt('.codex-temp/path-scoped-affected-20261006.json');
assert.equal(sha(affectedBytes), 'e9c1750e298b82a5f5c9ea620dc74fb1868ae363d57d90acad9fafb8da59c0ac');
const affected = JSON.parse(affectedBytes);
assert.equal(affected.valid, true); assert.equal(affected.exit_code, 0);
assert.equal(affected.tap.tests, 36); assert.equal(affected.tap.pass, 36);
assert.equal(affected.measured_sources_unchanged, true);
assert.deepEqual(affected.measured_sources_before, affected.measured_sources_after);
for (const row of affected.measured_sources_after) assert.equal(sha(bytesAt(row.file)), row.sha256);
for (const [key, extension] of [['stdout', 'tap'], ['stderr', 'err']]) {
    const captured = bytesAt(`.codex-temp/path-scoped-affected-20261006.${extension}`);
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

const preflightBytes = bytesAt('.codex-temp/path-civil-admission-preflight-20261006.json');
assert.equal(sha(preflightBytes), 'cea3daab982d43d689edfaddadcc02a386ba12a259b2315925283c0dbdeb4565');
const preflight = JSON.parse(preflightBytes);
assert.equal(preflight.accounting_complete, true); assert.equal(preflight.measured_sources_unchanged, true);
assert.equal(preflight.unique_candidates, 17); assert.equal(preflight.admitted_candidates, 17);
assert.equal(preflight.dp_executions, 0); assert.equal(preflight.matched, 0);
const selectedIds = census.rows.filter(row => row.independently_discriminating > 0).map(row => row.mutation_id).sort();
assert.deepEqual(preflight.rows.map(row => row.mutation_id).sort(), selectedIds);
const dpBytes = bytesAt('.codex-temp/path-civil-scoped-dp-20261006.json');
assert.equal(sha(dpBytes), '95d18ae0d70d829a5dcbbb64683a2fba61370bbdb873b8ed4bc57b660740624b');
const dp = JSON.parse(dpBytes), dpJob = load('.codex-temp/path-civil-scoped-dp-20261006-job.json');
assert.equal(dpJob.exit_code, 0); assert.equal(dpJob.report_sha256, sha(dpBytes));
for (const key of ['accounting_complete', 'scope_valid', 'measured_sources_unchanged', 'batch_complete']) assert.equal(dp[key], true);
for (const key of ['global_valid', 'activated', 'financial_receipt', 'global_go', 'global_g11']) assert.equal(dp[key], false);
assert.equal(dp.semantic_mutation_credit, 0); assert.equal(dp.global_expected, 2419);
assert.equal(dp.outside_scope_pending_in_this_report, 2419 - selectedIds.length);
assert.deepEqual(dp.rows.map(row => row.mutation_id).sort(), selectedIds);
assert.deepEqual(dp.explicit_scope.mutation_ids, selectedIds);
assert.equal(dp.expected_ids_sha256, sha(JSON.stringify(selectedIds)));
for (const key of ['expected','generated','executed','matched']) assert.equal(dp.mutations[key], selectedIds.length);
assert.equal(new Set(dp.rows.map(row => row.invocation_id)).size, selectedIds.length);
assert.equal(dp.unique_ids, selectedIds.length); assert.equal(dp.unique_invocations, selectedIds.length);
assert.equal(dp.baselines.length, 5); assert.deepEqual(dp.unsatisfied, []);
assert.deepEqual(dp.measured_sources_before, dp.measured_sources_after);
assert.equal(sha(JSON.stringify(dp.measured_sources_before.files)), dp.measured_sources_before.sha256);
assert.equal(dp.measured_sources_before.sha256, '53a6f1fb6a062626bd4736e958d969c50b811894a4ca4b0818171da4c58aa144');
assert.deepEqual(current.map(row => row.path), dp.measured_sources_after.files.map(row => row.path));
assert.deepEqual(current.filter((row, i) => row.sha256 !== dp.measured_sources_after.files[i].sha256).map(row => row.path),
    ['tests/next/provenance/pathSemanticV2.cases.js']);
const driver = bytesAt('.codex-temp/path-civil-scoped-dp-20261006.mjs');
assert.equal(sha(driver), dp.diagnostic_source_sha256);
assert.deepEqual(driver, bytesAt('docs/audit-evidence/n02g-causal-authoring-profile/path-civil-scoped-dp-driver-20261006.mjs.txt'));
const authoredBytes = bytesAt('docs/audit-evidence/n02g-causal-authoring-profile/path-authorship-v1-frozen.json');
assert.equal(sha(authoredBytes), 'e9c852034d8cc887e1d8645a61d9597176409f72a28eaf0de4c95f17c0c8358d');
const authored = JSON.parse(authoredBytes);
for (const row of dp.rows) {
    const before = preflight.rows.find(item => item.mutation_id === row.mutation_id);
    const alternative = before.alternatives.find(item => item.candidate_id === row.candidate_id);
    assert.equal(alternative.whole_compiler_admitted, true); assert.deepEqual(alternative.reference, row.reference);
    for (const key of ['generated','dp_execution','matched','whole_compiler_admitted','outside_target_preserved','phases_covered','positive_oracle_matched'])
        assert.equal(row[key], true);
    for (const key of ['proof_satisfied','financial_receipt','graph_accepted']) assert.equal(row[key], false);
    assert.equal(row.reference.available, true); assert.equal(row.reference.baseline_satisfied, true);
    assert.equal(row.reference.mutant_satisfied, false);
    const graph = authored.graphs.find(item => item.fact_key === row.target.fact_key);
    const predicate = graph.predicates.find(item => item.id === row.target.predicate_id);
    assert.deepEqual(row.expected_violations, [predicate.atom]);
    assert.deepEqual(row.observed_violations, row.expected_violations);
}

const sourceDelta = delta.map(file => {
    const value = bytesAt(file);
    return { path: file, bytes: value.length, sha256: sha(value),
        git_blob_sha1: crypto.createHash('sha1').update(`blob ${value.length}\0`).update(value).digest('hex') };
});
const summary = { schema_version: 'path-scoped-execution-evidence/v1',
    evidence_kind: 'local_execution_reconciliation_not_independent_audit',
    audit_parent: 'cc0bf9de28d5c646cc70f37fd11f06cb02734e94', source_delta: sourceDelta,
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
    preflight: { report_sha256: sha(preflightBytes), ids: selectedIds.length, candidates: 17, admitted: 17, dp_executions: 0 },
    scoped_dp: { report_sha256: sha(dpBytes), driver_sha256: sha(driver), mutations: dp.mutations,
        expected_ids_sha256: dp.expected_ids_sha256, unique_ids: dp.unique_ids, unique_invocations: dp.unique_invocations,
        baselines: dp.baselines.length, sources_sha256: dp.measured_sources_before.sha256,
        subsequent_source_change: 'tests_only', global_expected: dp.global_expected,
        outside_this_report: dp.outside_scope_pending_in_this_report,
        rows: dp.rows.map(({ mutation_id, target, candidate_id, reference, expected_violations, observed_violations,
            whole_compiler_admitted, dp_execution, matched, outside_target_preserved, phases_covered, positive_oracle_matched, proof_satisfied }) =>
            ({ mutation_id, target, candidate_id, reference, expected_violations, observed_violations,
                whole_compiler_admitted, dp_execution, matched, outside_target_preserved, phases_covered, positive_oracle_matched, proof_satisfied })) },
    local_reported_dp_executions: dp.rows.length, dp_executed_by_verifier: false,
    runtime_tests_executed_by_verifier: false, dp_execution: false, semantic_mutation_credit: 0,
    independent_code_audit: false, global_go: false, historical_semantic_rows_rewritten: false };
if (process.argv.includes('--write')) fs.writeFileSync(path.join(__dirname,
    'path-scoped-final-evidence-20261006.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(summary, null, 2));
