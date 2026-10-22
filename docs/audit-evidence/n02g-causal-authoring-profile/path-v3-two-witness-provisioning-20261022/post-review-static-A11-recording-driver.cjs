'use strict';
// Mechanical trusted-operator recording after external integrated review and
// source-bound confrontation. No compiler, guest, analyzer or approval API.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { canonicalValue } = require('../src/next/kernel/canonicalValue');
const root = path.resolve(__dirname, '..');
const prefix = path.join(__dirname, 'b4-02-pathv3-static-A11-qualified-ledger-20261022');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const read = p => fs.readFileSync(path.join(root, p));
const plain = v => JSON.parse(JSON.stringify(v));
const fixed = (p, h) => { const b = read(p); assert.equal(sha(b), h, p); return b; };
const candidate = 'cd51f1bc05130306722c918f236c2d8a4a16ad7f';
const review = '166d3e10cd2dca7a69fc59f07bab551694b5b5287b26b9f11b87b08eca1952b1';
const receipt = '9e1849666d63533827e200bec48efe7bbbc2a2fa8617e46f1cb64d2d7ae9f2f3';
const predecessor = '2b9f20c906cad0a9a098de34e194d0369304d74dfe5f2d1fe74692eb36e10ba8';
const rowsHash = '183ba87724616c2226e7b1893fb8c3b5fa978631b116d99d23307ec9e782a6d7';
const priorPath = '.codex-temp/b4-02-pathv3-static11-qualified-ledger-20261021.json';
const controlPrefix = '.codex-temp/b4-02-S01-empty-A-native-controls-20261022';
const selected = [[64,'r0006_exclude_kind'],[533,'r0001_exclude_kind'],[668,'r0010_exclude_state'],
    [836,'r0005_exclude_kind'],[883,'r0011_exclude_state'],[1617,'r0002_exclude_kind'],
    [1950,'r0007_exclude_kind'],[2116,'r0009_exclude_state'],[2211,'r0008_exclude_kind'],
    [2304,'r0003_exclude_kind'],[2357,'r0004_exclude_kind']];
assert.equal(process.version, 'v22.17.0');
for (const suffix of ['.json','.job.json']) assert.equal(fs.existsSync(prefix + suffix), false, 'already_recorded');
const prior = JSON.parse(fixed(priorPath, predecessor));
fixed('.codex-temp/b4-02-cd51-final-audit-receipt-confronted-20261022.md', receipt);
const caseHash = '21a0115628a89c42f3d3c60be217d53816033446347e3c0a09ce8761ebc335b3';
fixed('.codex-temp/b4-02-S01-empty-A-static-case-20261022.md', caseHash);
const rosterHash = 'ee1a882a9716b277f1aa53649a80af86e9ff2a50c052931b96c2c613580ca178';
const rawHash = '12d8db86724a91ea0070b4fabf87c7721244a5633ce3d594d5c86c6ee5192017';
const readbackHash = '0c273a63e24e38792d92bcc6eb1e3bcabd6e43bf99f24c55d1aed7d97e44c77a';
const roster = JSON.parse(fixed(controlPrefix + '.roster.json', rosterHash));
const records = fixed(controlPrefix + '.rows.jsonl', rawHash).toString('utf8').trim().split('\n').map(JSON.parse);
const priorReadback = JSON.parse(fixed(controlPrefix + '.confronted.json', readbackHash));
assert.equal(prior.rows.length, 2419); assert.equal(prior.verified_predicates, 12);
assert.equal(prior.blocked, 2407); assert.equal(prior.semantic_mutation_credit, 1);
assert.equal(records.length, 144); assert.equal(roster.controls.length, 144);
assert.equal(priorReadback.controls, 144); assert.equal(priorReadback.unique_invocations, 144);
assert.equal(priorReadback.unique_candidates, 144);
const wide = JSON.parse(fixed('.codex-temp/b4-02-path-v3-final-wide-20261019.json',
    '42e6126d4c3f321534d72b7584951d9d4aa6a6c794e889618d9934589f35a866'));
const sources = wide.measured_sources_after;
assert.equal(sources.files.length, 895); assert.equal(sha(JSON.stringify(sources.files)), rowsHash);
const sourceState = () => {
    const mismatches = sources.files.filter(f => sha(read(f.path)) !== f.sha256).map(f => f.path);
    assert.deepEqual(mismatches, []); return { count: 895, sha256: rowsHash, mismatches };
};
const before = sourceState();
const started = new Date().toISOString();
fs.writeFileSync(prefix + '.job.json', JSON.stringify({ stage: 'mechanical_post_integrated_review_recording',
    started_at: started, no_compiler_or_guest_execution: true, new_semantic_credit: 0 }) + '\n', { flag: 'wx' });
const successor = plain(prior);
const changed = new Set(selected.map(([i]) => i));
const evidenceIds = [review,receipt,rosterHash,rawHash,readbackHash,caseHash].map(h => 'sha256:' + h);
let typedTotal = 0, unknownTotal = 0;
for (const [index, predicate] of selected) {
    const row = successor.rows[index];
    assert.equal(row.target.fact_key, 'S-01#1#1'); assert.equal(row.target.predicate_id, predicate);
    assert.equal(row.status, 'blocked'); assert.equal(row.disposition, 'blocked');
    assert.equal(row.sites.length, 1);
    const planPath = '.codex-temp/b4-02-S01-remaining47-reference-20261021/'
        + String(index).padStart(4,'0') + '.plan.json';
    const planBytes = read(planPath), plan = JSON.parse(planBytes);
    assert.equal(plan.target_id, row.target_id); assert.equal(plan.qualification_id, row.qualification_id);
    assert.ok(plan.entries.every(e => e.admission === 'necessary_exclusion_not_native_control'));
    assert.ok(plan.conditional_domain_partition.entries.every(e => e.classification === 'necessary_exclusion_pending_native_barrier'));
    const controls = roster.controls.filter(c => c.row_index === index);
    const actual = records.filter(c => c.row_index === index);
    assert.equal(actual.length, controls.length);
    const allSummaries = [];
    for (const planned of controls) {
        const item = actual.find(r => r.kind === planned.kind && r.control_index === planned.control_index);
        assert.ok(item); assert.equal(item.target_id, row.target_id);
        assert.equal(item.qualification_id, row.qualification_id); assert.deepEqual(item.control, planned.control);
        const result = item.result;
        assert.equal(result.target_id, row.target_id); assert.equal(result.native_control_matched, true);
        assert.equal(result.handle_attempts, 0); assert.equal(result.dp_execution, false);
        assert.equal(result.qualified, false); assert.equal(result.semantic_mutation_credit, 0);
        assert.deepEqual(result.worlds.map(w => w.variant), ['C','M','S']);
        assert.deepEqual(result.worlds.map(w => w.admitted), [true,false,true]);
        assert.equal(result.worlds[1].ir_sha256, null);
        assert.equal(result.worlds[0].graph_count, 76); assert.equal(result.worlds[2].graph_count, 76);
        for (const key of ['package_root','ir_sha256','access_descriptor_sha256'])
            assert.equal(result.worlds[0][key], result.worlds[2][key]);
        assert.deepEqual(result.worlds[1].diagnostic.native_coordinate, planned.control.expected_diagnostic);
        assert.equal(result.worlds[1].diagnostic.coordinate_authority, true);
        if (planned.kind === 'typed_selection_exclusion') {
            typedTotal++;
            const entry = plan.entries.find(e => e.site_index === planned.control.site_index
                && e.locator_index === planned.control.locator_index);
            assert.ok(entry); assert.equal(planned.control.rule.id, 'selection_requires_authored_candidate_concern');
            assert.equal(planned.control.expected_diagnostic.mode, 'excluded_reason_concerns_own_candidate');
            assert.equal(result.worlds[1].diagnostic.native_coordinate.checker, 'selection_bindings');
            assert.equal(result.whole_ir_reference.worlds[1].expectation, 'whole_authored_ir');
        } else {
            assert.equal(planned.kind, 'unknown_namespace'); unknownTotal++;
            assert.equal(result.worlds[1].diagnostic.native_coordinate.checker, 'graph_structure');
            assert.equal(result.worlds[1].diagnostic.native_coordinate.code, 'path_missing');
        }
        allSummaries.push({ kind: planned.kind, control_index: planned.control_index,
            precommitted_control: plain(planned.control), invocation_id: item.invocation_id,
            candidate_id: item.candidate_id, native_control_matched: true,
            actual_M_IR: null, handle_attempts: 0, dp_execution: false, semantic_mutation_credit: 0 });
    }
    const site = row.sites[0];
    assert.equal(site.domain_complete, true); assert.equal(site.domain.complete, true);
    assert.equal(site.domain.locators.length, plan.entries.length);
    assert.deepEqual(site.domain.locators, plan.entries.map(e => e.locator));
    assert.equal(controls.filter(c => c.kind === 'typed_selection_exclusion').length, site.domain.locators.length);
    row.initial_preparation_sites = plain(row.sites);
    row.sites = [{ ...site, stage: 'post_integrated_review_empty_A_static_site_record',
        domain_scope: 'complete_finite_L_preserved_A_empty_by_normal_selection_necessity',
        admitted_domain_complete: true, witness_domain_complete: true,
        reviewed_L_A_W: { L: plain(site.domain.locators), A: [], W: [],
            derivation: 'all_L_members_violate_precommitted_normal_own_candidate_concern',
            rule: 'selection_requires_authored_candidate_concern',
            rule_instances: plain(plan.selection_admission_control_plan.controls),
            plan_file_sha256: 'sha256:' + sha(planBytes), semantic_mutation_credit: 0 },
        admission_controls: { original_row_index: index, original_site_index: 0,
            raw_source_sha256: 'sha256:' + rawHash, precommitted_roster_sha256: 'sha256:' + rosterHash,
            records: allSummaries, positive_guest_reuse: 'prior_same_S01_C_S_not_new_guest_after_typed_M',
            post_M_S_is_compiler_only: true, independent_review_sha256: 'sha256:' + review },
        necessary_equivalence: null,
        necessary_equivalence_applicability: 'not_semantic_equivalence_or_witness' }];
    Object.assign(row, { disposition: 'static_domain_proof', status: 'verified', reasons: [],
        dp_execution: false, semantic_mutation_credit: 0, historical_state_changed: false,
        qualification_evidence: { stage: 'accepted_after_integrated_review_and_source_bound_confrontation',
            reviewed_whole_candidate: candidate, independent_review_sha256: 'sha256:' + review,
            confrontation_receipt_sha256: 'sha256:' + receipt, evidence_ids: evidenceIds,
            scope: 'only_this_original_S01_target_complete_L_necessary_A_empty',
            positive_guest_invocation_reused: '1c665af2-7982-4b14-b49f-1afeb85ac1f2',
            guest_C_S_precede_controls: true, post_M_S_is_compiler_only: true,
            new_guest_or_compiler_execution: false, formal_inventory_row_transition_applied: true,
            qualified: true, dp_execution: false, semantic_mutation_credit: 0 } });
    const migration = successor.historical_migration.rows[index];
    assert.equal(migration.target_id, row.target_id);
    Object.assign(migration, { new_disposition: 'static_domain_proof', new_status: 'verified',
        new_evidence_ids: evidenceIds, historical_state_changed: false, evidence_reused_for_v3: false,
        positive_v3_evidence_reused: true, dp_execution: false, semantic_mutation_credit: 0 });
}
assert.equal(typedTotal,133); assert.equal(unknownTotal,11);
for (let i=0;i<2419;i++) {
    assert.equal(successor.rows[i].target_id, prior.rows[i].target_id);
    assert.equal(successor.rows[i].qualification_id, prior.rows[i].qualification_id);
    assert.equal(canonicalValue(successor.historical_migration.rows[i].historical_record),
        canonicalValue(prior.historical_migration.rows[i].historical_record));
    if (!changed.has(i)) {
        assert.equal(canonicalValue(successor.rows[i]), canonicalValue(prior.rows[i]));
        assert.equal(canonicalValue(successor.historical_migration.rows[i]), canonicalValue(prior.historical_migration.rows[i]));
    }
}
assert.equal(new Set(successor.rows.map(r=>r.target_id)).size,2419);
assert.equal(successor.rows.filter(r=>r.status==='verified').length,23);
assert.equal(successor.rows.filter(r=>r.disposition==='static_domain_proof').length,22);
assert.equal(successor.rows.filter(r=>r.disposition==='semantic_witness').length,1);
assert.equal(successor.rows.filter(r=>r.status==='blocked').length,2396);
assert.equal(successor.rows.reduce((n,r)=>n+r.semantic_mutation_credit,0),1);
Object.assign(successor, { stage: 'partial_v3_one_witness_twenty_two_static_after_integrated_reviews',
    reviewed_whole_candidate: candidate, classified_predicates: 23, verified_predicates: 23, blocked: 2396,
    dispositions: { semantic_witness: 1, static_domain_proof: 22, semantic_equivalence_proof: 0, blocked: 2396 },
    rows_sha256: 'sha256:' + sha(canonicalValue(successor.rows)),
    source_state_before: before, source_state_after: sourceState(),
    static_A_post_review_recording: { predecessor_path: priorPath, predecessor_sha256: predecessor,
        original_row_indices: selected.map(([i])=>i), typed_controls:133,unknown_controls:11,
        review_sha256:review,receipt_sha256:receipt,new_guest_or_compiler_execution:false,
        new_semantic_mutation_credit:0,external_review_and_operator_adoption_not_constructor_hash_authority:true },
    completed_at: new Date().toISOString() });
Object.assign(successor.historical_migration, { verified_rows:23,blocked:2396,
    rows_sha256:'sha256:'+sha(canonicalValue(successor.historical_migration.rows)) });
for(const k of ['qualified','activated','validation_tcb_complete','financial_acceptance',
    'validated_parent','global_g11','globalGO','NEXT03']) assert.equal(successor[k],false,k);
fixed(priorPath,predecessor);
fs.writeFileSync(prefix+'.json',JSON.stringify(successor,null,2)+'\n',{flag:'wx'});
const bytes=fs.readFileSync(prefix+'.json'),readback=JSON.parse(bytes);
assert.equal(readback.verified_predicates,23);
const summary={stage:'eleven_A_empty_static_records_formally_incorporated_not_global_qualification',
    started_at:started,completed_at:new Date().toISOString(),duration_ms:Date.now()-Date.parse(started),
    bytes:bytes.length,sha256:sha(bytes),rows:2419,verified:23,static_domain_proof:22,semantic_witness:1,
    blocked:2396,semantic_mutation_credit:1,changed_indices:selected.map(([i])=>i),
    historical_records_unchanged:2419,other_rows_unchanged:2408,new_guest_or_compiler_execution:false,
    two_future_witness_rows_still_blocked:[140,1952],source_state:successor.source_state_after,
    globalGO:false,NEXT03:false};
fs.writeFileSync(prefix+'.job.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));
