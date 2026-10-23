'use strict';
// Mechanical readback only: bytes, bindings, declared partitions and flags.
// Does not execute bundles, compile M, add an analytical model or approve rows.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), output = path.join(__dirname, 'b4-02-ref-id-capture-confronted-20261022.json');
assert.equal(fs.existsSync(output), false, 'single_readback_no_overwrite');
assert.equal(process.version, 'v22.17.0');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const blob = bytes => crypto.createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');
const read = relative => fs.readFileSync(path.join(root, relative));
const local = relative => read('.codex-temp/' + relative);
const fixed = (relative, hash) => { const bytes = local(relative); assert.equal(sha(bytes), hash); return JSON.parse(bytes); };
const started_at = new Date().toISOString();
const capturePrefix = 'path-v3-complete-capture-refid-20261022';
const scopePrefix = 'b4-02-ref-id-three-precompile-20261022';
const capture = fixed(capturePrefix + '.json', '11b40b35a8dbeca5f32c3d0b4c8bd9c404450eee29a04b3f2cf261415ea79ebf');
const scopes = fixed(scopePrefix + '.json', '6a99fd68c02b91bd18857cccc7fe7eee774c8b47c62984e4c2a8c050c01d5ca6');
assert.equal(capture.artifacts.length, 9); assert.equal(capture.source_inventory.length, 281);
assert.equal(capture.captured_inputs_before.length, 202);
assert.deepEqual(capture.captured_inputs_before, capture.captured_inputs_after);
assert.equal(capture.sources_unchanged, true);
const old = JSON.parse(local('path-v3-complete-capture-ac08-20261015.json'));
const artifacts = capture.artifacts.map(row => {
    const data = local(capturePrefix + '-bytes/' + row.path);
    assert.equal(data.length, row.bytes); assert.equal(sha(data), row.sha256); assert.equal(blob(data), row.git_blob_sha1);
    assert.ok(Buffer.from(data.toString('utf8'), 'utf8').equals(data));
    const prior = old.artifacts.find(member => member.path === row.path); assert.ok(prior);
    return { ...row, unchanged_from_old_capture: row.sha256 === prior.sha256 };
});
assert.deepEqual(artifacts.filter(row => !row.unchanged_from_old_capture).map(row => row.path), ['normal-rule-review-snapshot.json']);
for (const row of [...capture.captured_inputs_before, ...capture.source_inventory]) assert.equal(sha(read(row.path)), row.sha256);
assert.equal(capture.compiler_artifact_root, 'sha256:2281d7efd3b6627fe4679427b908b06ad29ea6e75cfea66aca3c387019bed151');
assert.equal(capture.validation_tcb_artifact_root, 'sha256:34f059dfdaafc4b7d479109978c444e7bd9335d93dc95349ec4e5bb3e5f7ffff');
const base = JSON.parse(local('b4-02-path-v3-final-wide-20261019.json')).measured_sources_after.files;
const current = base.map(row => ({ path: row.path, sha256: sha(read(row.path)) }));
assert.equal(current.length, 895);
assert.equal(sha(JSON.stringify(current)), scopes.source_before.sha256);
assert.equal(scopes.source_before.sha256, scopes.source_after.sha256); assert.deepEqual(scopes.source_after.mismatches, []);
assert.deepEqual(base.filter((row, i) => row.sha256 !== current[i].sha256).map(row => row.path).sort(),
    ['src/next/provenance/pathQualificationV3.js', 'tests/next/provenance/pathQualificationV3.cases.js']);
assert.deepEqual(scopes.rows.map(row => row.row_index), [204, 1695, 1830]); assert.equal(scopes.snapshots, 3);
assert.equal(scopes.no_selected_normal_compile, true); assert.equal(scopes.no_guest_execution, true);
assert.equal(scopes.no_execution_ticket_issued, true); assert.equal(scopes.semantic_mutation_credit, 0);
const expected = {
    204: { count: 16, W: [0, 1, 3, 8, 10, 15] },
    1695: { count: 30, W: [2, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 17, 19, 20, 21, 22, 23, 25, 26, 27, 28, 29] },
    1830: { count: 30, W: [0, 1, 3, 9, 11, 15, 16, 18, 24, 26] }
};
const roster = JSON.parse(local(scopePrefix + '/roster.json'));
assert.equal(sha(local(scopePrefix + '/roster.json')), scopes.roster_sha256);
assert.deepEqual(roster.rows.map(row => row.row_index), [204, 1695, 1830]);
const results = scopes.rows.map(row => {
    const planBytes = local(scopePrefix + '/' + row.plan_path), snapshotBytes = local(scopePrefix + '/' + row.snapshot.path);
    assert.equal(sha(planBytes), row.plan_sha256); assert.equal(planBytes.length, row.plan_bytes);
    assert.equal(sha(snapshotBytes), row.snapshot.sha256); assert.equal(snapshotBytes.length, row.snapshot.bytes);
    const plan = JSON.parse(planBytes), snapshot = JSON.parse(snapshotBytes), core = snapshot.core;
    const partition = core.conditional_partition, known = expected[row.row_index];
    assert.equal(core.target_id, row.target_id); assert.equal(plan.target_id, row.target_id);
    assert.equal(core.entries.length, known.count); assert.equal(plan.entries.length, known.count);
    assert.ok(core.entries.every(entry => entry.reference?.available === true));
    assert.equal(partition.conditional_admission_partition_complete, true);
    assert.equal(partition.conditional_witness_partition_complete, true);
    assert.deepEqual(partition.entries.filter(entry => entry.classification === 'conditional_witness').map(entry => entry.entry_index), known.W);
    assert.equal(partition.first_conditional_witness_entry_index, known.W[0]); assert.equal(row.selected.entry_index, known.W[0]);
    assert.ok(Object.values(partition.required_premises).length === 6 && Object.values(partition.required_premises).every(value => value === false));
    const reference = core.normal_rule_reference;
    assert.equal(reference.passes.length, 12); assert.ok(reference.passes.every(pass => pass.discharged === false));
    assert.ok(reference.normal_rule_composition.sites.every(site => site.locators.every(member => member.pass_coverage.length === 12
        && member.pass_coverage.every(pass => pass.conditional_preservation_verified === true && pass.discharged === false))));
    for (const source of [...reference.sources, ...reference.schema_reference_sources]) {
        const bytes = Buffer.from(source.source_chunks.join(''), 'utf8');
        assert.equal('sha256:' + sha(bytes), source.sha256); assert.ok(bytes.equals(read(source.path)));
    }
    for (const source of core.authority_builder_sources) assert.equal('sha256:' + sha(read(source.path)), source.sha256);
    for (const value of [plan, core]) { assert.equal(value.qualified, false); assert.equal(value.dp_execution, false); assert.equal(value.semantic_mutation_credit, 0); }
    return { row_index: row.row_index, entries: known.count, first_conditional: known.W[0], witnesses: known.W.length,
        site_domains: row.snapshot.conditional_site_sizes, snapshot: row.snapshot,
        plan_sha256: row.plan_sha256, source_bindings_exact: true, qualified: false, credit: 0 };
});
const git = 'C:/Users/Administrador/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/cmd/git.exe';
const index = sha(execFileSync(git, ['--no-optional-locks', '-c', 'safe.directory=' + root, 'ls-files', '--stage', '-z'], { cwd: root }));
assert.equal(index, '9b8d706b67c0f5d804312ceb78060bbf53a0d71dc32860027eaa3e7bcbfc2ba0');
assert.equal(sha(local('b4-02-pathv3-static-A11-qualified-ledger-20261022.json')), '810385e906ca7386002e7f9c5691c170ed59826a710d7250c68a1ce219460ead');
const result = { stage: 'mechanical_ref_id_capture_readback_only_not_semantic_approval', started_at, completed_at: new Date().toISOString(),
    node: process.version, artifacts, input202_and_source281_current_exact: true, source895_sha256: sha(JSON.stringify(current)),
    snapshots: results, index_sha256: index, ledger_unchanged: true, native_execution_in_this_reader: false,
    independent_review: false, qualified: false, semantic_mutation_credit: 0, globalGO: false };
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ artifacts: artifacts.length, changed_artifacts: artifacts.filter(row => !row.unchanged_from_old_capture).map(row => row.path),
    source895: result.source895_sha256, snapshots: results.map(row => ({ row: row.row_index, count: row.entries, first: row.first_conditional })),
    report_sha256: sha(fs.readFileSync(output)), qualified: false, credit: 0 }));
