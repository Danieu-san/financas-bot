'use strict';
// Documentary fingerprint/consistency check only. Never runs candidate code or raw tests.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
assert.deepEqual(process.argv.slice(2), ['--check']);
const root = path.resolve(__dirname, '../../..');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'selected-event-day-code-candidate-evidence-20261007.json')));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const blob = text => crypto.createHash('sha1').update('blob ' + Buffer.byteLength(text) + '\0').update(text).digest('hex');
assert.equal(data.publication_parent, 'f1a8cd4629b245009b9dd8fbb8dce83da77ba3d4');
assert.equal(data.publication_parent_tree, '581e8db08d21b214733c199164dcf471a8568393');
assert.equal(data.profile, 'selected-event-day-path/v1');
assert.equal(data.code_sources.length, 36); assert.equal(data.unchanged_project_dependencies.length, 53);
assert.equal(data.external_vendor_measurement.length, 73);
const all = [...data.code_sources, ...data.unchanged_project_dependencies];
assert.equal(new Set(all.map(row => row.path)).size, all.length);
for (const row of all) {
    assert(!path.isAbsolute(row.path)); assert(!row.path.split('/').includes('..'));
    const bytes = fs.readFileSync(path.join(root, row.path)), text = bytes.toString('utf8').replace(/\r\n/g, '\n');
    assert.equal(blob(text), row.git_blob_sha1, row.path);
    if (row.lf_sha256) assert.equal(sha(text), row.lf_sha256, row.path);
    // Raw SHA is evidence of local tested bytes, not asserted equal to LF Git bytes.
    assert.match(row.raw_sha256, /^[a-f0-9]{64}$/);
}
for (const row of data.external_vendor_measurement) {
    assert(row.path.startsWith('node_modules/')); assert.match(row.raw_sha256, /^[a-f0-9]{64}$/);
    assert.match(row.git_blob_sha1, /^[a-f0-9]{40}$/);
}
const wide = data.local_wide;
assert.deepEqual(wide.tap, { tests: 2677, suites: 0, pass: 2667, fail: 0, cancelled: 0, skipped: 10, todo: 0 });
assert.equal(wide.exit_code, 0); assert.equal(wide.subprocess_exit_code, 0);
assert.equal(wide.matrix_green, true); assert.equal(wide.capture_complete, true);
assert.deepEqual(wide.validation_reasons, []); assert.equal(wide.exact_skip_titles.length, 10);
assert.equal(wide.measured_source_count, 866); assert.equal(wide.measured_sources_unchanged, true);
assert.equal(wide.raw_json_count, 742); assert.equal(wide.raw_json_invalid, 0); assert.equal(wide.raw_json_drift, 0);
assert.equal(wide.original_exact_affected_tests, false); assert.equal(wide.broader_authored_affected_tests, 44);
assert.equal(wide.intended_affected_tests, 20);
assert.equal(wide.report_sha256, '12d6eea10077010297cb60430fd6ec66d3b87eab97e954afff115e1310cf39c7');
for (const item of [data, wide]) {
    assert.equal(item.profile_witness_qualified, false); assert.equal(item.semantic_mutation_credit, 0);
    assert.equal(item.financial_release_eligible, false); assert.equal(item.global_go, false);
}
console.log(JSON.stringify({ stage: 'documentary_fingerprint_consistency_only', check: 'PASS',
    code_sources: 36, inherited_project_dependencies: 53, external_vendor_fingerprints: 73,
    independent_execution: false, candidate_executed: false, profile_witness_qualified: false, semantic_mutation_credit: 0 }));
