'use strict';
// Mechanical terminal readback of the fixed batch. No compiler/guest, new L/A/W
// classification, independent semantic review or static qualification.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = relative => fs.readFileSync(path.join(root, relative));
const plain = value => JSON.parse(JSON.stringify(value));
const checked = (relative, expected) => {
    const bytes = read(relative); assert.equal(sha(bytes), expected, relative); return JSON.parse(bytes);
};
const prefix = '.codex-temp/b4-02-empty-L-native-controls-20261021';
const out = path.join(root, prefix + '.confronted.json');
const S01out = path.join(root, prefix + '.S01-full.json');
assert.equal(fs.existsSync(out), false, 'terminal_readback_already_recorded');
assert.equal(fs.existsSync(S01out), false, 'S01_transport_projection_already_recorded');
assert.equal(process.version, 'v22.17.0');
const job = JSON.parse(read(prefix + '.job.json'));
assert.equal(job.stage, 'all819_native_BUILD_controls_completed_not_static_qualification', 'batch_not_terminal_success');
assert.equal(job.completed_controls, 819);
assert.equal(job.expected_rows, 736);
assert.ok(job.completed_at);
assert.equal(job.error, undefined);
assert.equal(job.runtime_guest_run, false);
assert.equal(job.handle_attempts, 0);
assert.equal(job.qualified, false);
assert.equal(job.semantic_mutation_credit, 0);
const rosterBytes = read(prefix + '.roster.json');
const rosterSha = 'ee040698d6517b5ba4200d1df0c4cfbcb4aaf05beb6074e9b601a48a363e4f36';
assert.equal(sha(rosterBytes), rosterSha);
assert.equal(job.roster_sha256, rosterSha);
const roster = JSON.parse(rosterBytes);
assert.equal(roster.rows, 736); assert.equal(roster.sites, 819);
assert.equal(roster.controls.length, 819);
const ledger = checked('.codex-temp/b4-02-pathv3-partial-qualified-ledger-20261021.json',
    '2921db7c0faa557a7d9c1a5e2b73adc6f596c4db395583cb3bdce4bba12147d4');
const build = checked('.codex-temp/b4-02-reviewed-normal-build-20261021.json',
    '4b118acd391cf9407ef8510d29cdd113a43ec64eaa964b36a2d2f7650559db8e');
const wide = checked('.codex-temp/b4-02-path-v3-final-wide-20261019.json',
    '42e6126d4c3f321534d72b7584951d9d4aa6a6c794e889618d9934589f35a866');
const { canonicalValue } = require('../src/next/kernel/canonicalValue');
const sources = wide.measured_sources_after;
assert.equal(sources.files.length, 895);
assert.equal(sha(JSON.stringify(sources.files)),
    '183ba87724616c2226e7b1893fb8c3b5fa978631b116d99d23307ec9e782a6d7');
assert.deepEqual(job.sources_before, job.sources_after);
assert.equal(job.sources_before.count, sources.files.length);
assert.equal(job.sources_before.sha256, sources.sha256);
assert.deepEqual(job.sources_before.mismatches, []);
const mismatches = sources.files.filter(row => sha(read(row.path)) !== row.sha256).map(row => row.path);
assert.deepEqual(mismatches, [], 'current_sources_changed');
const bytes = read(prefix + '.rows.jsonl');
assert.equal(bytes.length, job.rows_bytes);
assert.equal(sha(bytes), job.rows_sha256);
assert.equal(bytes.at(-1), 10, 'incomplete_jsonl_terminal_line');
const lines = bytes.toString('utf8').split('\n');
assert.equal(lines.pop(), '');
assert.equal(lines.length, 819);
const fixedKeys = roster.controls.map(control => `${control.row_index}/${control.site_index}`);
assert.equal(new Set(fixedKeys).size, 819);
assert.equal(new Set(roster.controls.map(control => control.row_index)).size, 736);
const allEmptyIndices = ledger.rows.flatMap((row, index) => row.sites.every(site =>
    site.domain_complete && site.domain.locators.length === 0) ? [index] : []);
assert.equal(allEmptyIndices.length, 736);
assert.deepEqual([...new Set(roster.controls.map(control => control.row_index))], allEmptyIndices);
const baseline = build.result.worlds[0];
const compilerRoot = 'sha256:2281d7efd3b6627fe4679427b908b06ad29ea6e75cfea66aca3c387019bed151';
const invocations = new Set(), candidateIds = new Set();
const summaries = [], S01full = [], normalNativeCodes = {}, definitions = {};
for (let index = 0; index < lines.length; index++) {
    const observed = JSON.parse(lines[index]);
    const expected = roster.controls[index];
    assert.equal(`${observed.row_index}/${observed.site_index}`, fixedKeys[index]);
    assert.equal(observed.target_id, expected.target_id);
    assert.equal(observed.qualification_id, expected.qualification_id);
    assert.deepEqual(observed.expected_diagnostic, expected.control.expected_diagnostic);
    assert.ok(Number.isFinite(observed.duration_ms) && observed.duration_ms > 0);
    const original = ledger.rows[observed.row_index];
    const site = original.sites[observed.site_index];
    assert.equal(original.status, 'blocked');
    assert.equal(original.target_id, observed.target_id);
    assert.equal(site.domain_complete, true);
    assert.deepEqual(site.domain.locators, []);
    assert.deepEqual(site.authored_site, expected.control.authored_site);
    assert.equal(expected.control.admission_id, site.authored_site.mutation_id);
    assert.equal(expected.control.namespace, site.domain.namespace);
    assert.equal(expected.domain_sha256, 'sha256:' + sha(canonicalValue(original.sites.map(item => item.domain))));
    const result = observed.result;
    assert.equal(result.target_id, observed.target_id);
    // Recompute only the existing deterministic identity commitment, not L/A/W
    // or compiler semantics. The v2 unknown-path mutation was fixed by the
    // original admission id before this batch started.
    const expectedPatch = { location: site.authored_site.site_path,
        before: site.domain.original.segments,
        after: [...site.domain.original.segments.slice(0, -1),
            'unknown_' + expected.control.admission_id.slice(7, 23)] };
    const expectedCandidateId = 'sha256:' + sha(canonicalValue({
        domain: 'financasbot.path-qualification.locator.v3', kind: 'unknown_path_control_for_empty_L',
        method: ledger.method_authority, target_id: observed.target_id, patch: expectedPatch,
        baseline_package: build.result.whole_ir_reference.worlds[0].authority_refs }));
    assert.equal(result.candidate_id, expectedCandidateId, 'fixed_single_site_identity');
    assert.equal(result.compiler_artifact_root, compilerRoot);
    assert.equal(result.normal_compiler_source_bindings_sha256, build.result.normal_compiler_source_bindings_sha256);
    assert.equal(result.selection_binding_source_sha256, build.result.selection_binding_source_sha256);
    assert.equal(result.native_control_matched, true);
    assert.equal(result.handle_attempts, 0);
    assert.equal(result.dp_execution, false);
    assert.equal(result.qualified, false);
    assert.equal(result.semantic_mutation_credit, 0);
    assert.equal(result.financial_acceptance, false);
    assert.equal(result.independent_compiler_execution, false);
    assert.equal(result.reference.stage, 'path_v3_empty_L_sealed_before_native_control');
    assert.equal(result.reference.invocation_id, result.invocation_id);
    assert.equal(result.reference.candidate_id, result.candidate_id);
    assert.equal(result.reference.mutation_id, result.target_id);
    assert.equal(result.reference.domain_sha256, expected.domain_sha256);
    assert.equal(result.reference.discriminating, false);
    assert.ok(!invocations.has(result.invocation_id)); invocations.add(result.invocation_id);
    assert.ok(!candidateIds.has(result.candidate_id)); candidateIds.add(result.candidate_id);
    const reference = result.whole_ir_reference;
    assert.equal(reference.sealed_before_captured_compile, true);
    assert.equal(reference.target_id, result.target_id);
    assert.equal(reference.candidate_id, result.candidate_id);
    assert.equal(reference.invocation_id, result.invocation_id);
    assert.equal(reference.independent_compiler, false);
    assert.deepEqual(reference.worlds.map(world => world.variant), ['C', 'M', 'S']);
    assert.deepEqual(reference.worlds.map(world => world.expectation),
        ['whole_authored_ir', 'native_rejection_only_no_typed_ir', 'whole_authored_ir']);
    assert.deepEqual(result.worlds.map(world => world.variant), ['C', 'M', 'S']);
    assert.deepEqual(result.worlds.map(world => world.admitted), [true, false, true]);
    result.worlds.forEach((world, worldIndex) => {
        assert.equal(world.package_root, reference.worlds[worldIndex].package_root);
        assert.equal(world.ir_sha256, reference.worlds[worldIndex].ir_sha256);
    });
    const [C, M, S] = result.worlds;
    for (const world of [C, S]) {
        assert.equal(world.graph_count, 76);
        assert.equal(world.whole_ir_conformance, true);
        assert.equal(world.package_root, baseline.package_root);
        assert.equal(world.ir_sha256, baseline.ir_sha256);
        assert.equal(world.access_descriptor_sha256, baseline.access_descriptor_sha256);
        assert.equal(world.diagnostic, null);
    }
    assert.notEqual(M.package_root, C.package_root);
    assert.equal(M.ir_sha256, null);
    assert.equal(M.diagnostic.coordinate_authority, true);
    assert.equal(M.diagnostic.forged_same_text_has_authority, false);
    assert.equal(M.diagnostic.static_exclusion_verified, false);
    assert.deepEqual(M.diagnostic.native_coordinate, expected.control.expected_diagnostic);
    const code = expected.control.expected_diagnostic.code;
    assert.equal(code, site.authored_site.definition === 'claimPath' ? 'claim_path' : 'path_missing');
    assert.equal(M.diagnostic.message, 'graph_structure_' + code);
    normalNativeCodes[code] = (normalNativeCodes[code] || 0) + 1;
    definitions[site.authored_site.definition] = (definitions[site.authored_site.definition] || 0) + 1;
    if (site.authored_site.fact_key === 'S-01#1#1') S01full.push(observed);
    summaries.push({ original_row_index: observed.row_index, site_index: observed.site_index,
        target_id: observed.target_id, qualification_id: observed.qualification_id,
        admission_id: expected.control.admission_id, namespace: expected.control.namespace,
        authored_site: plain(site.authored_site), domain_sha256: expected.domain_sha256,
        invocation_id: result.invocation_id, candidate_id: result.candidate_id,
        native_coordinate: plain(M.diagnostic.native_coordinate),
        native_coordinate_authority: true, forged_same_text_has_authority: false,
        C_and_S_normal_IR_and_access_match_reviewed_baseline: true,
        whole_ir_reference_sha256: 'sha256:' + sha(canonicalValue(reference)),
        raw_jsonl_one_based_line: index + 1, duration_ms: observed.duration_ms,
        handle_attempts: 0, dp_execution: false, semantic_mutation_credit: 0 });
}
const S01 = summaries.filter(control => control.authored_site.fact_key === 'S-01#1#1');
assert.equal(S01.length, 13);
assert.equal(new Set(S01.map(control => control.original_row_index)).size, 11);
assert.equal(S01full.length, 13);
fs.writeFileSync(S01out, JSON.stringify({ stage: 'transport_projection_of_13_original_control_records_not_qualification',
    fact_key: 'S-01#1#1', source_jsonl_sha256: job.rows_sha256,
    source_jsonl_one_based_lines: S01.map(control => control.raw_jsonl_one_based_line),
    complete_original_records: S01full, qualified: false, semantic_mutation_credit: 0 }) + '\n', { flag: 'wx' });
const report = {
    format: 'financasbot.path-v3.empty-L-native-controls-terminal-readback', version: 1,
    stage: 'all819_build_controls_confronted_not_static_qualification',
    reviewed_code_candidate: ledger.reviewed_whole_candidate,
    roster_sha256: rosterSha, raw_jsonl_sha256: job.rows_sha256, raw_jsonl_bytes: bytes.length,
    S01_full_transport_projection: { records: 13, bytes: fs.statSync(S01out).size,
        sha256: sha(fs.readFileSync(S01out)), no_data_omitted_from_selected_records: true },
    batch_started_at: job.started_at, batch_completed_at: job.completed_at, duration_ms: job.duration_ms,
    rows: 736, sites: 819, exact_precommitted_roster: true,
    native_codes: normalNativeCodes, definitions,
    compiler_artifact_root: compilerRoot, baseline_package_root: baseline.package_root,
    baseline_IR_sha256: baseline.ir_sha256, baseline_access_descriptor_sha256: baseline.access_descriptor_sha256,
    current_sources: { count: sources.files.length, sha256: sources.sha256, mismatches },
    controls: summaries,
    actual_positive_DP_scope: { fact_key: 'S-01#1#1', invocation_id: '1c665af2-7982-4b14-b49f-1afeb85ac1f2',
        rows_with_all_L_empty_in_that_graph: 11, sites_with_native_controls: 13,
        baseline_positive_DP_does_not_extend_to_other_graphs: true },
    remaining_requirements: [
        'source-bound normative per-site rule and authored-instance argument',
        'applicable independently reviewed adversarial controls',
        'actual positive C/S program-oracle-identity-coverage within compatible scope',
        'whole-program and closure binding with independent integrated semantic review'
    ],
    not_independent_semantic_approval: true, runtime_guest_run: false,
    qualified: false, newly_qualified_static_rows: 0, semantic_mutation_credit: 0,
    no_qualification_by_rejection_count: true, financial_acceptance: false, globalGO: false, NEXT03: false,
    confronted_at: new Date().toISOString()
};
fs.writeFileSync(out, JSON.stringify(report) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ stage: report.stage, rows: 736, sites: 819,
    raw_sha256: job.rows_sha256, report_sha256: sha(fs.readFileSync(out)), report_bytes: fs.statSync(out).size,
    source_count: 895, native_codes: normalNativeCodes, definitions,
    S01_static_rows_pending_review: 11, qualified: false, new_static_credits: 0,
    no_new_guest_or_compiler_execution: true }));
