'use strict';
// Read-only reconciliation; no compiler, reference operator or D/P execution.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const bytesAt = relative => fs.readFileSync(path.join(root, relative));
const load = relative => JSON.parse(bytesAt(relative));
const bytes = bytesAt('.codex-temp/path-window-final-wide-20261006.json'), report = JSON.parse(bytes);
const job = load('.codex-temp/path-window-final-wide-20261006-job.json');
assert.equal(sha(bytes), 'f1707bb2c3c9b921335ce191957dc89535e0068620d599720a83dfd1d930823d');
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
assert.equal(tap.fail, 0); assert.equal(tap.cancelled, 0); assert.equal(tap.tests, 2638); assert.equal(tap.pass, 2628);
const measured = report.measured_sources_before.files;
assert.equal(new Set(measured.map(row => row.path)).size, measured.length);
const current = measured.map(row => ({ path: row.path, sha256: sha(bytesAt(row.path)) }));
assert.deepEqual(current, measured); assert.deepEqual(current, report.measured_sources_after.files);
assert.equal(sha(JSON.stringify(current)), job.measured_sources_before);
assert.equal(job.measured_sources_before, 'f1576690ab9b9e3e008d6049b2ebd1f8b50d854ba9c0334263d7d9480c73664d');
assert.equal(report.measured_sources_unchanged, true);
const delta = ['src/next/provenance/pathSemanticReference.js', 'tests/next/provenance/pathSemanticV2.cases.js'].sort();
const priorBytes = bytesAt('.codex-temp/path-scoped-final-wide-20261006.json');
assert.equal(sha(priorBytes), '3ff08bc54e9afc510209ecd1dc16d646d1390ac18e018712fe341032ca9c3c7d');
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
const checkedReport = (name, hash) => {
    const bytes=bytesAt('.codex-temp/'+name+'.json'); assert.equal(sha(bytes),hash);
    return {bytes,value:JSON.parse(bytes)};
};
const shards=checkedReport('path-window-affected-sharded-20261006','96967370bc3937bdec8d8b3976c3c9d9e0dde422e0cc1ec94f547109d4abdf15').value;
assert.equal(shards.valid,false);assert.equal(shards.accounting_complete,false);
assert.equal(shards.parts[0].valid,true);assert.equal(shards.parts[0].tap.pass,37);
assert.equal(shards.measured_sources_unchanged,true);
for(const [key,ext] of [['stdout','tap'],['stderr','err']]){
    const captured=bytesAt('.codex-temp/path-window-affected-sharded-20261006-part1.'+ext);
    assert.equal(sha(captured),shards.parts[0].output_evidence[key].sha256);
    assert.equal(captured.length,shards.parts[0].output_evidence[key].bytes);
}
const affected=checkedReport('path-window-native-affected-20261006','f9557231d243cdb7c8cfa08422b81815112d146a9aa13d6262fb01b811868efa').value;
assert.equal(affected.exit_status,0);assert.equal(affected.affected_scope_valid,true);
assert.equal(affected.exact_affected_tests,true);assert.equal(affected.tap.pass,2);
assert.equal(affected.valid,false);assert.deepEqual(affected.validation_reasons,['unexpected_skipped_tests']);
assert.deepEqual(affected.measured_sources_after.files,current);
for(const key of ['stdout','stderr']){
    const entry=affected.output_evidence[key],b=fs.readFileSync(entry.path);
    assert.equal(b.length,entry.bytes);assert.equal(sha(b),entry.sha256);
}
const oldCensus=checkedReport('path-civil-reference-census-20261006','72a25240a657d8b5085d3b09c9c7eee61af01f0fd78a700c78518802cdf349e5').value;
const census=checkedReport('path-window-reference-census-20261006','c6575ba00a21de8b09cb592a5b6451862c02a9309f638cff0a9986530c6c653a').value;
const preflight=checkedReport('path-window-admission-preflight-20261006','54f0236e5ebf16f90cdb24f5d8cebdf7cae6a1cde269f1c373bb12c09ebd8ab5').value;
const dp=checkedReport('path-window-scoped-dp-20261006','2e0359a2cdec3e2b2cd2fc5bfd998b1f35f32aabfbaf2f10b79ecc70855fb28d').value;
const ids=census.rows.map(row=>row.mutation_id).sort();
assert.deepEqual(ids,oldCensus.rows.filter(row=>row.alternatives>0&&row.reference_available===0).map(row=>row.mutation_id).sort());
assert.equal(ids.length,5);assert.equal(new Set(ids).size,ids.length);
assert.equal(sha(JSON.stringify(ids)),census.expected_ids_sha256);
assert.equal(census.dp_executions,0);assert.equal(census.matched,0);assert.equal(census.semantic_mutation_credit,0);
assert.equal(census.measured_sources_unchanged,true);
assert.equal(preflight.accounting_complete,true);assert.equal(preflight.measured_sources_unchanged,true);
assert.equal(preflight.unique_candidates,13);assert.equal(preflight.admitted_candidates,13);
assert.equal(preflight.dp_executions,0);assert.equal(preflight.matched,0);
assert.deepEqual(preflight.rows.map(row=>row.mutation_id).sort(),ids);
assert.deepEqual(dp.rows.map(row=>row.mutation_id).sort(),ids);
assert.deepEqual(dp.explicit_scope.mutation_ids,ids);
assert.equal(dp.accounting_complete,true);assert.equal(dp.scope_valid,true);
assert.deepEqual(dp.mutations,{expected:5,generated:5,executed:5,matched:5});
assert.equal(new Set(dp.rows.map(row=>row.invocation_id)).size,5);
assert.equal(dp.baselines.length,5);assert.deepEqual(dp.unsatisfied,[]);
assert.deepEqual(dp.measured_sources_after.files,current);assert.equal(dp.measured_sources_unchanged,true);
assert.equal(dp.global_expected,2419);assert.equal(dp.outside_scope_pending_in_this_report,2414);
assert.equal(dp.global_go,false);assert.equal(dp.global_valid,false);assert.equal(dp.activated,false);
assert.equal(dp.semantic_mutation_credit,0);
for(const row of dp.rows){
    const reference=census.rows.find(x=>x.mutation_id===row.mutation_id).references.find(x=>x.candidate_id===row.candidate_id).reference;
    assert.deepEqual(row.reference,reference);
    assert.equal(reference.available,true);assert.equal(reference.baseline_satisfied,true);
    assert.equal(reference.mutant_satisfied,false);
    assert.equal(row.whole_compiler_admitted,true);assert.equal(row.generated,true);
    assert.equal(row.dp_execution,true);assert.equal(row.matched,true);
    assert.equal(row.outside_target_preserved,true);assert.equal(row.phases_covered,true);
    assert.equal(row.positive_oracle_matched,true);assert.equal(row.proof_satisfied,false);
    assert.deepEqual(row.observed_violations,['period']);assert.deepEqual(row.observed_violations,reference.expected_violations);
    assert.equal(row.financial_receipt,false);assert.equal(row.graph_accepted,false);
    assert.equal(reference.financial_receipt,false);
    assert.ok(preflight.rows.find(x=>x.mutation_id===row.mutation_id).alternatives
        .some(x=>x.candidate_id===row.candidate_id&&x.whole_compiler_admitted));
}
const drivers=['path-window-reference-census-20261006','path-window-admission-preflight-20261006','path-window-scoped-dp-20261006'].map(name=>{
    const b=bytesAt('.codex-temp/'+name+'.mjs'),published=bytesAt('docs/audit-evidence/n02g-causal-authoring-profile/'+name+'.mjs.txt');
    assert.deepEqual(b,published);return{name,sha256:sha(b)};
});
const sourceDelta=delta.map(file=>{
    const b=bytesAt(file);return{path:file,bytes:b.length,sha256:sha(b),
        git_blob_sha1:crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex')};
});
const summary={schema_version:'path-window-reference-evidence/v1',
    evidence_kind:'local_execution_reconciliation_not_independent_audit',
    audit_parent:'3e56122a2f445cebb56d0b6113d7019a559eb1c1',source_delta:sourceDelta,
    report_sha256:sha(bytes),started_at:job.started_at,completed_at:job.completed_at,node:job.node,
    exit_code:job.exit_code,capture_valid:report.valid,matrix_green:report.matrix_green,tap,coverage,
    skipped_titles:skipped,exact_skipped_titles:true,output_evidence:output,
    sources:{files:current.length,sha256:sha(JSON.stringify(current)),unchanged:true},
    native_coverage:{files:retained.length,invalid:0,manifest_sha256:sha(JSON.stringify(retained))},
    affected:{reference_api_pass:37,dp_pass:2,exact_dp_titles:true,scope_valid:true,
        original_subset_valid:false,original_subset_reasons:affected.validation_reasons,
        report_sha256:'f9557231d243cdb7c8cfa08422b81815112d146a9aa13d6262fb01b811868efa',
        historical_failed_wrappers_rewritten:false},
    census:{report_sha256:'c6575ba00a21de8b09cb592a5b6451862c02a9309f638cff0a9986530c6c653a',expected_ids_sha256:census.expected_ids_sha256,expected:5,alternatives:13,dp:0,matched:0},
    preflight:{report_sha256:'54f0236e5ebf16f90cdb24f5d8cebdf7cae6a1cde269f1c373bb12c09ebd8ab5',expected:5,unique_candidates:13,admitted:13,dp:0,matched:0},
    scoped_dp:{report_sha256:'2e0359a2cdec3e2b2cd2fc5bfd998b1f35f32aabfbaf2f10b79ecc70855fb28d',mutations:dp.mutations,baselines:5,unique_invocations:5,unsatisfied:0,accounting_complete:true,scope_valid:true,
        rows:dp.rows.map(({mutation_id,target,candidate_id,invocation_id,reference,patch})=>({mutation_id,target,candidate_id,invocation_id,reference,patch})),
        global_expected:2419,outside_this_report:2414,not_consolidated_global_balance:true},
    driver_snapshots:drivers,runtime_tests_executed_by_verifier:false,dp_execution:false,
    semantic_mutation_credit:0,independent_code_audit:false,global_go:false,
    historical_semantic_rows_rewritten:false};
if(process.argv.includes('--write'))fs.writeFileSync(path.join(__dirname,'path-window-final-evidence-20261006.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({report_sha256:summary.report_sha256,tap,coverage,sources:summary.sources,native_coverage:summary.native_coverage,scope_valid:true}));

