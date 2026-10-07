'use strict';
// Construction/byte consistency only. No compiler, evaluator, child, handles,
// qualification, financial acceptance or independent BUILD replay is executed.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const directory = path.join(__dirname, 'selected-day-reviewed-execution-20261007');
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const read = name => fs.readFileSync(path.join(directory, name));
const snapshotBytes = read('review-snapshot.json'), snapshot = JSON.parse(snapshotBytes);
const expectedReviewHash = 'sha256:c706906b8d3b0a594765a0faef024178cea85941031f094c4af30115d9b6f030';
assert.equal(hash(snapshotBytes), expectedReviewHash);
assert.equal(snapshot.stage, 'selected_day_candidate_review_snapshot_only');
assert.equal(snapshot.profile_witness_qualified, false); assert.equal(snapshot.semantic_mutation_credit, 0);
assert.equal(snapshot.financial_release_eligible, false);
assert.equal(read('execution-freeze.json').toString('utf8'), snapshot.freeze_source);
assert.equal(read('artifact-manifest.json').toString('utf8'), snapshot.manifest);
assert.equal(hash(read('artifact-manifest.json')), snapshot.negative_component_root);
const manifest = JSON.parse(snapshot.manifest), freeze = JSON.parse(snapshot.freeze_source);
assert.equal(freeze.validation_tcb_root, snapshot.negative_component_root);
assert.equal(manifest.kind, 'tcb'); assert.equal(manifest.entry, 'selected-day-launcher.js');
assert.equal(manifest.files.length, 10); assert.equal(new Set(manifest.files.map(row => row.path)).size, 10);
for (const row of manifest.files) {
    assert.match(row.path, /^[a-z][a-z0-9.-]+$/);
    assert.equal(hash(read(row.path)), row.sha256);
}
assert.equal(hash(JSON.stringify(snapshot.build_sources)), snapshot.build_sources_sha256);
assert.equal(JSON.parse(read('selected-day-ticket.json')).profile_witness_qualified, false);
console.log(JSON.stringify({ construction_valid: true, review_snapshot_sha256: expectedReviewHash,
    artifact_files: 10, native_worlds_executed: 0, profile_witness_qualified: false,
    semantic_mutation_credit: 0, financial_release_eligible: false, independent_BUILD_execution: false }));
