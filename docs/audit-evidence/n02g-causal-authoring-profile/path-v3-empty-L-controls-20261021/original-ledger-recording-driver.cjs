'use strict';
// Mechanical trusted-operator recording AFTER the independent whole-object
// review and local source/trace confrontation. No new semantic analyzer,
// candidate generator, execution API, compiler model or financial authority.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'b4-02-pathv3-partial-qualified-ledger-20261021.json');
const job = path.join(__dirname, 'b4-02-pathv3-partial-qualified-ledger-20261021.job.json');
assert.equal(fs.existsSync(out), false, 'already_recorded');
assert.equal(fs.existsSync(job), false, 'already_started');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const read = relative => fs.readFileSync(path.join(root, relative));
const fixed = (relative, expected) => {
    const b = read(relative); assert.equal(sha(b), expected, relative); return b;
};
const plain = v => JSON.parse(JSON.stringify(v));
const expected = Object.freeze({
    scope: 'e050ad07ef1b877d38e81acea98d827d1eb59ffb',
    review: '29ef2d1add922f7325239cd1c9d3c08ed36481152ffad4641585b35d2fbec604',
    receipt: 'e4332083195072217d098dd7164dee01c39b702fa423c2c11b64b3523f9c0a13',
    link: 'd3b8bea9f5abbca04b8d78abe920979c532e55732593349d7a7f783b9dc72c88',
    target: 'sha256:45b51ce7fb14418eb9727b08b0e37019a8a464db308fe738c8ff3b7f58a25f92',
    qualification: 'sha256:2f8b1c1ff6c63f5f4be224d94f074a3c1e21848834bdd53bf62722e6ae47d317',
    invocation: '1c665af2-7982-4b14-b49f-1afeb85ac1f2',
    sources: '183ba87724616c2226e7b1893fb8c3b5fa978631b116d99d23307ec9e782a6d7',
    historical: '3187e36259bc11fcd2c9063a6a4ba25987f1e1acca18a81a96aee87834b007d0'
});
const started = new Date().toISOString();
fs.writeFileSync(job, JSON.stringify({ stage: 'mechanical_full_inventory_recording', started_at: started,
    pid: process.pid, no_guest_or_compiler_capture: true, qualified: false, semantic_mutation_credit: 0 }) + '\n', { flag: 'wx' });
let sources;
function sourceState() {
    const mismatches = sources.files.filter(r => sha(read(r.path)) !== r.sha256).map(r => r.path);
    assert.deepEqual(mismatches, [], 'current_sources_changed');
    return { count: sources.files.length, sha256: sources.sha256, mismatches };
}
(async () => {
    assert.equal(process.version, 'v22.17.0');
    const wide = JSON.parse(fixed('.codex-temp/b4-02-path-v3-final-wide-20261019.json',
        '42e6126d4c3f321534d72b7584951d9d4aa6a6c794e889618d9934589f35a866'));
    sources = wide.measured_sources_after;
    assert.equal(sources.files.length, 895); assert.equal(sha(JSON.stringify(sources.files)), expected.sources);
    const before = sourceState();
    fixed('.codex-temp/b4-02-e050-final-audit-receipt-confronted-20261021.md', expected.receipt);
    const link = JSON.parse(fixed('.codex-temp/b4-02-pathv3-witness-evidence-link-20261021.json', expected.link));
    assert.equal(link.independent_review.report_sha256, expected.review);
    assert.equal(link.independent_review.verdict, 'APTO_NO_ALCANCE');
    assert.equal(link.reviewed_whole_candidate, expected.scope);
    assert.equal(link.target_id, expected.target); assert.equal(link.qualification_id, expected.qualification);
    assert.equal(link.preexecution_identity.invocation_id, expected.invocation);
    assert.equal(link.formal_inventory_row_transition_applied, false);
    const observed = JSON.parse(fixed('.codex-temp/b4-02-internal-observations-20261021.json',
        '762d1859a4702a584ae068ca59a7cf07f8f9173dc80d830b04054b9d10b18119'));
    const coverage = JSON.parse(fixed('.codex-temp/b4-02-internal-coverage-normal-20261021.json',
        'cf592594bf3ae789f17ba8a3e6f330931490fa1975305191d2eb9db1ce508592'));
    assert.equal(observed.observations.invocation_id, expected.invocation);
    assert.equal(observed.runtime_guest_run, true);
    assert.deepEqual(observed.observations.observations.map(w => w.variant), ['C', 'M', 'S']);
    assert.deepEqual(observed.observations.observations.map(w => w.result.proof_satisfied), [true, false, true]);
    assert.equal(coverage.phases.length, 6);
    for (const p of coverage.phases) {
        assert.equal(p.coverage.matched, true);
        const actual = observed.observations.observations.find(w => w.variant === p.variant).result.trace[`${p.phase}_trace`];
        assert.equal(p.coverage.event_coverage.length, actual.length);
        assert.deepEqual(p.coverage.event_coverage.map(e => e.sequence), actual.map(e => e.sequence));
        assert.equal(new Set(p.coverage.event_coverage.map(e => e.sequence)).size, actual.length);
        assert.ok(p.coverage.event_coverage.every(e => e.status === 'covered'));
    }
    // Authority is the actual external review plus explicit operator adoption
    // after causal confrontation, NOT the existence/hash of the link file.
    const { loadLocalAuthoringPackage } = await import(pathToFileURL(path.join(root,
        'scripts/agent/executeNextDomainInvariantMatrix.mjs')).href);
    const { buildAdmittedSchemaValidators } = await import(pathToFileURL(path.join(root,
        'scripts/agent/buildNextProvenanceArtifacts.mjs')).href);
    const { compileAuthoringIR } = require('../src/next/provenance/graphCompiler');
    const { admittedDocuments } = require('../src/next/provenance/packageContract');
    const { canonicalValue } = require('../src/next/kernel/canonicalValue');
    const api = require('../src/next/provenance/pathQualificationV3');
    const packageReceipt = loadLocalAuthoringPackage();
    const ir = compileAuthoringIR(packageReceipt, buildAdmittedSchemaValidators(packageReceipt).validators);
    const preparation = api.preparePathQualificationInventory({ packageReceipt, ir });
    const originalIntegrity = api.verifyPathQualificationInventory({ preparation, candidate: preparation });
    assert.equal(originalIntegrity.inventory_integrity, true);
    const historicalSource = fixed('docs/audit-evidence/n02g-causal-authoring-profile/path-v3-history-20261008/historical-v2-report.json',
        expected.historical).toString('utf8');
    const migration = api.preparePathQualificationHistoricalMigration({ preparation, historicalSource });
    const historyIntegrity = api.verifyPathQualificationHistoricalMigration({ migration, candidate: migration });
    assert.equal(historyIntegrity.migration_integrity, true); assert.equal(historyIntegrity.exact_old_membership, true);
    assert.equal(preparation.rows.length, 2419);
    const originalIndex = preparation.rows.findIndex(r => r.target_id === expected.target);
    assert.equal(originalIndex, link.original_row_index);
    assert.equal(preparation.rows[originalIndex].qualification_id, expected.qualification);
    assert.deepEqual(plain(preparation.rows[originalIndex].target), link.target);
    assert.equal(preparation.rows[originalIndex].sites.length, 2);
    assert.ok(preparation.rows[originalIndex].sites.every(s => s.domain_complete));
    const originalHistory = JSON.parse(historicalSource);
    const rows = plain(preparation.rows);
    const historicalRows = plain(migration.rows);
    const evidenceIds = ['sha256:' + link.actual_evidence.observations_sha256,
        'sha256:' + link.actual_evidence.coverage_sha256, 'sha256:' + expected.review, 'sha256:' + expected.receipt];
    // This is the explicit post-review recording act for ONE complete row,
    // not an API that grants authority to a caller-supplied PASS boolean.
    rows[originalIndex] = { ...rows[originalIndex], disposition: 'semantic_witness', status: 'verified', reasons: [],
        dp_execution: true, semantic_mutation_credit: 1, historical_state_changed: false,
        qualification_evidence: { ...link, stage: 'accepted_and_formally_recorded_after_integrated_review_and_confrontation',
            formal_inventory_row_transition_applied: true, qualified: true, semantic_mutation_credit: 1,
            applies_only_to_this_original_row: true, evidence_ids: evidenceIds } };
    historicalRows[originalIndex] = { ...historicalRows[originalIndex], new_disposition: 'semantic_witness',
        new_evidence_ids: evidenceIds, dp_execution: true, semantic_mutation_credit: 1,
        new_status: 'verified', evidence_reused_for_v3: false };
    const ids = rows.map(r => r.target_id);
    assert.equal(new Set(ids).size, 2419);
    assert.deepEqual(ids, preparation.rows.map(r => r.target_id));
    assert.deepEqual(historicalRows.map(r => r.target_id), ids);
    const oldById = new Map(originalHistory.rows.map(r => [r.mutation_id, r]));
    for (let i = 0; i < rows.length; i++) {
        assert.equal(canonicalValue(historicalRows[i].historical_record), canonicalValue(oldById.get(ids[i])));
        assert.equal(historicalRows[i].historical_state_changed, false);
        if (i !== originalIndex) {
            assert.equal(canonicalValue(rows[i]), canonicalValue(plain(preparation.rows[i])));
            assert.equal(canonicalValue(historicalRows[i]), canonicalValue(plain(migration.rows[i])));
        }
    }
    const documents = admittedDocuments(packageReceipt);
    const after = sourceState();
    const result = { format: 'financasbot.path-qualification.ledger', version: 3,
        stage: 'partial_formal_qualification_one_verified_row_global_gate_incomplete',
        method_authority: plain(api.METHOD), authority_refs: plain(preparation.authority_refs),
        reviewed_whole_candidate: expected.scope, original_inventory_header_sha256: null,
        expected_predicates: rows.length, enumerated_predicates: rows.length,
        classified_predicates: 1, verified_predicates: 1, blocked: rows.length - 1,
        dispositions: { semantic_witness: 1, static_domain_proof: 0, semantic_equivalence_proof: 0, blocked: rows.length - 1 },
        witnessed_invocations: [expected.invocation], semantic_mutation_credit: 1,
        no_historical_credit_summed_or_requalified: true, no_new_guest_execution: true,
        target_ids_sha256: 'sha256:' + sha(canonicalValue(ids)), rows_sha256: 'sha256:' + sha(canonicalValue(rows)), rows,
        historical_migration: { ...plain(migration), stage: 'total_history_preserved_one_new_v3_qualification_recorded',
            rows: historicalRows, rows_sha256: 'sha256:' + sha(canonicalValue(historicalRows)),
            verified_rows: 1, blocked: rows.length - 1, semantic_mutation_credit: 1,
            original_migration_rows_sha256: migration.rows_sha256,
            original_historical_report_flags: plain(migration.historical_report_flags) },
        source_state_before: before, source_state_after: after,
        whole_ir_conformance: plain(preparation.whole_ir_conformance),
        package_document_count: documents.length, original_inventory_integrity: plain(originalIntegrity),
        original_history_integrity: plain(historyIntegrity),
        external_operator_review_adoption_not_authenticated_by_constructor: true,
        qualified: false, activated: false, validation_tcb_complete: false,
        financial_acceptance: false, validated_parent: false, global_g11: false, globalGO: false, NEXT03: false,
        started_at: started, completed_at: new Date().toISOString() };
    // Do not assign undefined into the canonical codec or change its guard.
    const { rows: ignoredRows, ...originalHeader } = plain(preparation);
    result.original_inventory_header_sha256 = 'sha256:' + sha(canonicalValue(originalHeader));
    fs.writeFileSync(out, JSON.stringify(result) + '\n', { flag: 'wx' });
    const summary = { stage: result.stage, expected: rows.length, verified: 1, blocked: rows.length - 1,
        semantic_witnesses: 1, new_v3_credit: 1, old_ledger_unchanged: true,
        original_row_index: originalIndex, target_id: expected.target,
        target_ids_sha256: result.target_ids_sha256, report_sha256: sha(fs.readFileSync(out)),
        report_bytes: fs.statSync(out).size, sources_895_unchanged: true,
        no_new_guest_execution: true, qualified: false, globalGO: false,
        completed_at: result.completed_at, duration_ms: Date.now() - Date.parse(started) };
    fs.writeFileSync(job, JSON.stringify(summary) + '\n'); console.log(JSON.stringify(summary));
})().catch(error => {
    fs.writeFileSync(job, JSON.stringify({ stage: 'formal_recording_failed_no_credit_or_guest_retry',
        error: { name: error.name, message: error.message }, started_at: started, completed_at: new Date().toISOString(),
        qualified: false, semantic_mutation_credit: 0, no_new_guest_execution: true }) + '\n');
    console.error(error.stack); process.exitCode = 1;
});
