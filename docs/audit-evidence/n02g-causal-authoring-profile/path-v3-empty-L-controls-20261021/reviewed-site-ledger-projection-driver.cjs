'use strict';
// Mechanical successor projection of ALREADY reviewed evidence. No compiler,
// guest, locator classifier, semantic analyzer or new qualification decision.
// The original ledger remains byte-exact, including as an active batch input.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const { canonicalValue } = require('../src/next/kernel/canonicalValue');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const plain = value => JSON.parse(JSON.stringify(value));
const read = relative => fs.readFileSync(path.join(root, relative));
const fixed = (relative, expected) => {
    const bytes = read(relative);
    assert.equal(sha(bytes), expected, relative);
    return JSON.parse(bytes);
};
const sourcePath = '.codex-temp/b4-02-pathv3-partial-qualified-ledger-20261021.json';
const sourceSha = '2921db7c0faa557a7d9c1a5e2b73adc6f596c4db395583cb3bdce4bba12147d4';
const buildPath = '.codex-temp/b4-02-reviewed-normal-build-20261021.json';
const buildSha = '4b118acd391cf9407ef8510d29cdd113a43ec64eaa964b36a2d2f7650559db8e';
const out = path.join(__dirname, 'b4-02-pathv3-partial-qualified-ledger-r2-20261021.json');
assert.equal(fs.existsSync(out), false, 'successor_already_exists');
assert.equal(process.version, 'v22.17.0');
const ledger = fixed(sourcePath, sourceSha);
const build = fixed(buildPath, buildSha);
const wide = fixed('.codex-temp/b4-02-path-v3-final-wide-20261019.json',
    '42e6126d4c3f321534d72b7584951d9d4aa6a6c794e889618d9934589f35a866');
const sources = wide.measured_sources_after;
assert.equal(sources.files.length, 895);
assert.equal(sha(JSON.stringify(sources.files)),
    '183ba87724616c2226e7b1893fb8c3b5fa978631b116d99d23307ec9e782a6d7');
const sourceState = () => {
    const mismatches = sources.files.filter(row => sha(read(row.path)) !== row.sha256).map(row => row.path);
    assert.deepEqual(mismatches, [], 'current_sources_changed');
    return { count: sources.files.length, sha256: sources.sha256, mismatches };
};
const before = sourceState();
const rowIndex = 646;
const row = ledger.rows[rowIndex];
assert.equal(row.target_id, 'sha256:45b51ce7fb14418eb9727b08b0e37019a8a464db308fe738c8ff3b7f58a25f92');
assert.equal(row.qualification_id, 'sha256:2f8b1c1ff6c63f5f4be224d94f074a3c1e21848834bdd53bf62722e6ae47d317');
assert.equal(row.status, 'verified');
assert.equal(row.disposition, 'semantic_witness');
assert.equal(row.semantic_mutation_credit, 1);
assert.equal(row.qualification_evidence.formal_inventory_row_transition_applied, true);
assert.equal(ledger.reviewed_whole_candidate, 'e050ad07ef1b877d38e81acea98d827d1eb59ffb');
assert.equal(ledger.verified_predicates, 1);
assert.equal(ledger.blocked, 2418);
assert.equal(ledger.qualified, false);
const seal = build.result.witness_preselection.review_bound_domain_seal;
const controls = build.result.witness_site_admission_controls;
assert.equal(seal.target_id, row.target_id);
assert.equal(seal.admitted_domain_complete, true);
assert.equal(seal.witness_domain_complete, true);
assert.equal(seal.first_witness_proved, true);
assert.equal(seal.sealed_before_any_captured_compile, true);
assert.equal(seal.invocation_id, '1c665af2-7982-4b14-b49f-1afeb85ac1f2');
assert.equal(controls.native_barriers_verified, true);
assert.equal(controls.normal_checker_source_conformance_verified, true);
assert.equal(controls.selected_normal_compile_started_after_controls, true);
assert.equal(controls.compiler_result_used_to_define_domain, false);
assert.equal(controls.selection_controls.length, 0);
assert.equal(controls.unknown_path_controls.length, 2);
assert.deepEqual(seal.per_site_domains.map(site => [site.L.length, site.A.length, site.W.length]),
    [[15, 15, 13], [15, 15, 3]]);
const successor = plain(ledger);
const current = successor.rows[rowIndex];
current.initial_preparation_sites = plain(row.sites);
current.sites = row.sites.map((site, siteIndex) => {
    const domain = seal.per_site_domains[siteIndex];
    const control = controls.unknown_path_controls.find(item => item.site_index === siteIndex);
    const plan = controls.unknown_path_control_plan.controls[siteIndex];
    assert.equal(domain.site_index, siteIndex);
    assert.equal(site.domain_complete, true);
    assert.equal(site.admitted_domain_complete, false);
    assert.equal(site.admission_controls, null);
    assert.equal(site.domain.scope, 'finite_authored_closed_world_L_only');
    assert.equal(site.domain.locators.length, domain.L.length);
    assert.deepEqual(plan.authored_site, site.authored_site);
    assert.equal(control.native_control_matched, true);
    assert.equal(control.handle_attempts, 0);
    assert.equal(control.dp_execution, false);
    assert.deepEqual(control.worlds.map(world => world.admitted), [true, false, true]);
    assert.equal(control.worlds[0].ir_sha256, control.worlds[2].ir_sha256);
    assert.deepEqual(control.worlds[1].diagnostic.native_coordinate, plan.expected_diagnostic);
    assert.equal(control.worlds[1].diagnostic.coordinate_authority, true);
    assert.equal(control.worlds[1].diagnostic.forged_same_text_has_authority, false);
    return {
        ...plain(site),
        stage: 'post_review_site_record_projected_from_existing_seal_and_native_evidence',
        domain_scope: 'domain_object_preserved_as_initial_L_only_enumeration',
        admitted_domain_complete: seal.admitted_domain_complete,
        witness_domain_complete: seal.witness_domain_complete,
        reviewed_L_A_W: plain(domain),
        admission_controls: {
            source: { path: buildPath, sha256: buildSha },
            precommitted_plan: plain(plan),
            unknown_path_control: plain(control),
            selection_controls: [],
            selection_exclusions: plain(domain.excluded),
            normal_admission_premise_evidence: plain(controls.normal_admission_premise_evidence),
            authority_scope: 'already_reviewed_site_evidence_not_constructor_or_boolean_authority'
        },
        necessary_equivalence: null,
        necessary_equivalence_applicability: 'not_the_semantic_equivalence_proof_disposition',
        selected_first_witness_for_this_site: seal.selected.site_index === siteIndex,
        no_claim_of_guest_execution_per_alternative: true
    };
});
successor.site_record_projection = {
    predecessor_path: sourcePath, predecessor_sha256: sourceSha,
    source_build_path: buildPath, source_build_sha256: buildSha,
    original_row_index: rowIndex,
    reason: 'separate_initial_preparation_sites_from_current_reviewed_site_evidence',
    changes_qualification_or_credit: false,
    new_guest_or_compiler_execution: false,
    original_file_preserved: true,
    runtime_authority_or_new_independent_review: false,
    recorded_at: new Date().toISOString()
};
successor.rows_sha256 = 'sha256:' + sha(canonicalValue(successor.rows));
for (let index = 0; index < ledger.rows.length; index++) {
    if (index !== rowIndex) assert.deepEqual(successor.rows[index], ledger.rows[index]);
}
assert.deepEqual(successor.historical_migration, ledger.historical_migration);
assert.deepEqual(successor.rows.map(item => item.target_id), ledger.rows.map(item => item.target_id));
for (const key of ['classified_predicates', 'verified_predicates', 'blocked', 'dispositions',
    'semantic_mutation_credit', 'qualified', 'activated', 'validation_tcb_complete',
    'financial_acceptance', 'validated_parent', 'globalGO', 'NEXT03']) {
    assert.deepEqual(successor[key], ledger[key], key);
}
const after = sourceState();
assert.equal(sha(read(sourcePath)), sourceSha, 'predecessor_changed');
successor.site_record_projection.sources_before = before;
successor.site_record_projection.sources_after = after;
fs.writeFileSync(out, JSON.stringify(successor) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ stage: 'reviewed_site_projection_complete_no_new_qualification',
    report_bytes: fs.statSync(out).size, report_sha256: sha(fs.readFileSync(out)),
    original_preserved_sha256: sha(read(sourcePath)),
    row_index: rowIndex, expected: successor.rows.length, verified: 1, blocked: 2418,
    new_v3_credit_unchanged: 1, global_qualified: false,
    source_count: 895, no_new_guest_or_compiler_execution: true }));
