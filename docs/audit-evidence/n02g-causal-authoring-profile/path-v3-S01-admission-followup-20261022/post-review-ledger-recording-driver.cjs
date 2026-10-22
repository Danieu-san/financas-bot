'use strict';
// Mechanical trusted-operator recording AFTER the integrated review and
// source-bound confrontation. Not an analyzer, runtime or approval API.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { canonicalValue } = require('../src/next/kernel/canonicalValue');
const root = path.resolve(__dirname, '..');
const output = path.join(__dirname, 'b4-02-pathv3-static11-qualified-ledger-20261021.json');
const jobPath = path.join(__dirname, 'b4-02-pathv3-static11-qualified-ledger-20261021.job.json');
assert.equal(fs.existsSync(output), false, 'already_recorded');
assert.equal(fs.existsSync(jobPath), false, 'already_started');
assert.equal(process.version, 'v22.17.0');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const read = relative => fs.readFileSync(path.join(root, relative));
const fixed = (relative, expected) => {
    const bytes = read(relative); assert.equal(sha(bytes), expected, relative); return bytes;
};
const plain = value => JSON.parse(JSON.stringify(value));
const bindings = Object.freeze({
    review: 'fa5cde0a379d524b27b3b0e02ec8760ac0e2dcec296c8b43e9ebc8c08ac9e31e',
    receipt: 'c66d043982e2fdff61f1132b04ef7f05feb9b20e456240b690922121fa94df62',
    prior: '3796929d291f64b01df528d9ba788ebf3cde3c469aae24ac4ac91d6ddc0890ed',
    roster: 'ee040698d6517b5ba4200d1df0c4cfbcb4aaf05beb6074e9b601a48a363e4f36',
    records: 'b5734f1230b9dba4f087ad085220cd8b5585555c88b7f8d934dc2de38a1a4c9d',
    readback: '64f8e6a8204c81bda4af8c3468eb2e1f5109540939bb83d828b8eb76c1462d03',
    focal: '3e03000c1f1d1b0c18b6014bbd309c7777c06a4ca31ff4e23e5c8248e4f3ec3e',
    sourceRows: '183ba87724616c2226e7b1893fb8c3b5fa978631b116d99d23307ec9e782a6d7',
    case: 'eb8da1903fdafe96a0cf53f8f33b597c44c8026f7bf2f93a712971907372564d',
    candidate: 'b430d0af0307c55407f52d9b80c101a30c1fa2f4'
});
const selected = Object.freeze([[79,'binding_3'],[689,'binding_7'],[1267,'binding_4'],
    [1480,'binding_5'],[1520,'link_5_pair'],[1565,'binding_11'],[1635,'binding_12'],
    [1798,'binding_6'],[1875,'binding_1'],[1992,'binding_10'],[2417,'binding_2']]);
const priorPath = '.codex-temp/b4-02-pathv3-partial-qualified-ledger-r2-20261021.json';
const prior = JSON.parse(fixed(priorPath, bindings.prior));
fixed('.codex-temp/b4-02-empty-L-final-audit-receipt-confronted-20261021.md', bindings.receipt);
fixed('.codex-temp/b4-02-S01-empty-L-static-case-20261021.md', bindings.case);
const roster = JSON.parse(fixed('.codex-temp/b4-02-empty-L-native-controls-20261021.roster.json', bindings.roster));
const records = JSON.parse(fixed('.codex-temp/b4-02-empty-L-native-controls-20261021.S01-full.json', bindings.records));
const readback = JSON.parse(fixed('.codex-temp/b4-02-empty-L-native-controls-20261021.confronted.json', bindings.readback));
const focal = JSON.parse(fixed('.codex-temp/b4-02-claim-barrier-adversarial-20261021.json', bindings.focal));
assert.equal(prior.rows.length, 2419); assert.equal(prior.verified_predicates, 1);
assert.equal(prior.blocked, 2418); assert.equal(prior.semantic_mutation_credit, 1);
assert.equal(readback.stage, 'all819_build_controls_confronted_not_static_qualification');
assert.equal(readback.sites, 819); assert.equal(readback.rows, 736);
assert.equal(records.complete_original_records.length, 13);
assert.equal(focal.observations.length, 4);
assert.ok(focal.observations.every(x => x.expected_adversarial_property_observed));
const wide = JSON.parse(fixed('.codex-temp/b4-02-path-v3-final-wide-20261019.json',
    '42e6126d4c3f321534d72b7584951d9d4aa6a6c794e889618d9934589f35a866'));
const sources = wide.measured_sources_after;
assert.equal(sources.files.length, 895); assert.equal(sha(JSON.stringify(sources.files)), bindings.sourceRows);
function sourceState() {
    const mismatches = sources.files.filter(f => sha(read(f.path)) !== f.sha256).map(f => f.path);
    assert.deepEqual(mismatches, [], 'current_sources_changed');
    return { count: 895, sha256: bindings.sourceRows, mismatches };
}
const before = sourceState();
const started = new Date().toISOString();
fs.writeFileSync(jobPath, JSON.stringify({ stage: 'mechanical_post_review_recording', started_at: started,
    no_compiler_or_guest_execution: true, new_semantic_credit: 0 }) + '\n', { flag: 'wx' });
const successor = plain(prior);
const changed = new Set(selected.map(([i]) => i));
const evidenceIds = [bindings.review, bindings.receipt, bindings.roster, bindings.records,
    bindings.readback, bindings.focal, bindings.case].map(h => 'sha256:' + h);
let appliedSites = 0;
for (const [index, predicate] of selected) {
    const row = successor.rows[index];
    assert.equal(row.target.fact_key, 'S-01#1#1'); assert.equal(row.target.predicate_id, predicate);
    assert.equal(row.disposition, 'blocked'); assert.equal(row.status, 'blocked');
    assert.ok(row.sites.every(s => s.domain_complete && s.domain.complete && s.domain.locators.length === 0));
    const instanceRecords = records.complete_original_records.filter(r => r.row_index === index);
    assert.equal(instanceRecords.length, row.sites.length);
    row.initial_preparation_sites = plain(row.sites);
    row.sites = row.sites.map((site, siteIndex) => {
        const item = instanceRecords.find(r => r.site_index === siteIndex);
        const plan = roster.controls.find(r => r.row_index === index && r.site_index === siteIndex);
        assert.ok(item && plan);
        assert.equal(item.target_id, row.target_id); assert.equal(item.qualification_id, row.qualification_id);
        assert.equal(plan.target_id, row.target_id); assert.equal(plan.qualification_id, row.qualification_id);
        assert.deepEqual(plan.control.authored_site, site.authored_site);
        assert.deepEqual(item.expected_diagnostic, plan.control.expected_diagnostic);
        const result = item.result;
        assert.equal(result.target_id, row.target_id); assert.equal(result.native_control_matched, true);
        assert.equal(result.handle_attempts, 0); assert.equal(result.dp_execution, false);
        assert.equal(result.qualified, false); assert.equal(result.semantic_mutation_credit, 0);
        assert.deepEqual(result.worlds.map(w => w.variant), ['C','M','S']);
        assert.deepEqual(result.worlds.map(w => w.admitted), [true,false,true]);
        assert.equal(result.worlds[1].ir_sha256, null);
        assert.equal(result.worlds[0].ir_sha256, result.worlds[2].ir_sha256);
        assert.deepEqual(result.worlds[1].diagnostic.native_coordinate, plan.control.expected_diagnostic);
        appliedSites++;
        return { ...site, stage: 'post_integrated_review_empty_L_static_site_record',
            domain_scope: 'initial_L_only_domain_preserved_not_runtime_authority',
            admitted_domain_complete: true, witness_domain_complete: true,
            reviewed_L_A_W: { L: [], A: [], W: [], derivation: 'complete_L_empty_implies_A_W_empty_before_M',
                semantic_mutation_credit: 0, no_typed_mutant_claim: true },
            admission_controls: { precommitted_plan: plain(plan.control),
                original_record_source_sha256: 'sha256:' + bindings.records,
                original_row_index: index, original_site_index: siteIndex,
                control_invocation_id: result.invocation_id, native_control_matched: true,
                handle_attempts: 0, dp_execution: false, semantic_mutation_credit: 0,
                positive_guest_reuse: 'prior_same_S01_program_C_S_not_new_guest_after_unknown_M',
                independent_review_sha256: 'sha256:' + bindings.review },
            necessary_equivalence: null,
            necessary_equivalence_applicability: 'not_the_semantic_equivalence_proof_disposition' };
    });
    row.disposition = 'static_domain_proof'; row.status = 'verified'; row.reasons = [];
    row.dp_execution = false; row.semantic_mutation_credit = 0; row.historical_state_changed = false;
    row.qualification_evidence = { stage: 'accepted_and_formally_recorded_after_integrated_review_and_confrontation',
        reviewed_whole_candidate: bindings.candidate, independent_review_sha256: 'sha256:' + bindings.review,
        confrontation_receipt_sha256: 'sha256:' + bindings.receipt, evidence_ids: evidenceIds,
        scope: 'only_this_original_S01_empty_L_target_and_all_its_sites',
        positive_guest_invocation_reused: '1c665af2-7982-4b14-b49f-1afeb85ac1f2',
        guest_C_S_precede_unknown_controls: true, post_unknown_S_is_compiler_only: true,
        new_guest_or_compiler_execution: false, formal_inventory_row_transition_applied: true,
        qualified: true, dp_execution: false, semantic_mutation_credit: 0 };
    const migration = successor.historical_migration.rows[index];
    assert.equal(migration.target_id, row.target_id);
    Object.assign(migration, { new_disposition: 'static_domain_proof', new_status: 'verified',
        new_evidence_ids: evidenceIds, historical_state_changed: false, evidence_reused_for_v3: false,
        positive_v3_evidence_reused: true, dp_execution: false, semantic_mutation_credit: 0 });
}
assert.equal(appliedSites, 13);
for (let i = 0; i < successor.rows.length; i++) {
    assert.equal(successor.rows[i].target_id, prior.rows[i].target_id);
    assert.equal(successor.rows[i].qualification_id, prior.rows[i].qualification_id);
    assert.equal(canonicalValue(successor.historical_migration.rows[i].historical_record),
        canonicalValue(prior.historical_migration.rows[i].historical_record));
    if (!changed.has(i)) {
        assert.equal(canonicalValue(successor.rows[i]), canonicalValue(prior.rows[i]));
        assert.equal(canonicalValue(successor.historical_migration.rows[i]), canonicalValue(prior.historical_migration.rows[i]));
    }
}
assert.equal(new Set(successor.rows.map(r => r.target_id)).size, 2419);
assert.equal(successor.rows.filter(r => r.disposition === 'semantic_witness').length, 1);
assert.equal(successor.rows.filter(r => r.disposition === 'static_domain_proof').length, 11);
assert.equal(successor.rows.filter(r => r.status === 'verified').length, 12);
assert.equal(successor.rows.filter(r => r.status === 'blocked').length, 2407);
assert.equal(successor.rows.reduce((n,r) => n + r.semantic_mutation_credit, 0), 1);
Object.assign(successor, { stage: 'partial_v3_one_witness_eleven_static_after_integrated_review',
    reviewed_whole_candidate: bindings.candidate, classified_predicates: 12, verified_predicates: 12,
    blocked: 2407, dispositions: { semantic_witness: 1, static_domain_proof: 11,
        semantic_equivalence_proof: 0, blocked: 2407 },
    rows_sha256: 'sha256:' + sha(canonicalValue(successor.rows)),
    source_state_before: before, source_state_after: sourceState(),
    static_post_review_recording: { predecessor_path: priorPath, predecessor_sha256: bindings.prior,
        original_row_indices: selected.map(([i]) => i), sites: 13, review_sha256: bindings.review,
        receipt_sha256: bindings.receipt, new_guest_or_compiler_execution: false,
        source_records_preserved: true, new_semantic_mutation_credit: 0,
        external_review_and_operator_confrontation_not_constructor_or_hash_authority: true },
    completed_at: new Date().toISOString() });
Object.assign(successor.historical_migration, { verified_rows: 12, blocked: 2407,
    rows_sha256: 'sha256:' + sha(canonicalValue(successor.historical_migration.rows)) });
for (const key of ['qualified','activated','validation_tcb_complete','financial_acceptance',
    'validated_parent','global_g11','globalGO','NEXT03']) assert.equal(successor[key], false, key);
fixed(priorPath, bindings.prior);
const bytes = JSON.stringify(successor, null, 2) + '\n';
fs.writeFileSync(output, bytes, { flag: 'wx' });
const readbackBytes = fs.readFileSync(output); const readbackLedger = JSON.parse(readbackBytes);
assert.equal(readbackLedger.rows.length, 2419); assert.equal(readbackLedger.verified_predicates, 12);
const result = { stage: 'eleven_static_records_formally_incorporated_not_global_qualification',
    started_at: started, completed_at: new Date().toISOString(),
    duration_ms: Date.now() - Date.parse(started), bytes: readbackBytes.length, sha256: sha(readbackBytes),
    rows: 2419, verified: 12, static_domain_proof: 11, semantic_witness: 1, blocked: 2407,
    semantic_mutation_credit: 1, newly_applied_static_sites: 13,
    historical_records_unchanged: 2419, other_rows_unchanged: 2408,
    no_new_guest_or_compiler_execution: true, source_state: successor.source_state_after,
    globalGO: false, NEXT03: false };
fs.writeFileSync(jobPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
