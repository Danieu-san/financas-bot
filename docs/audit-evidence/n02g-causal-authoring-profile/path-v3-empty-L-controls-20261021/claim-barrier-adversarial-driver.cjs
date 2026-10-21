'use strict';
// Fixed adversarial BUILD-only extension of existing PATH-V3-018 to the claim
// namespace required by method72fc section5. No physical source edits, guest,
// new compiler/analysis model, normal-candidate retry or qualification.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'b4-02-claim-barrier-adversarial-20261021.json');
assert.equal(fs.existsSync(out), false, 'focal_already_started');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const plain = value => JSON.parse(JSON.stringify(value));
const read = relative => fs.readFileSync(path.join(root, relative));
const guard = "if (!own(value, key) || Array.isArray(value)) fail('claim_path');";
// All four source alterations and expected properties fixed before any
// adversarial capture or M. Each capture is intentionally different test code.
const cases = [
    { id: 'claim_guard_removed', file: 'graphStructure.js', mode: 'missing_native_barrier',
        change: source => source.replace(guard, "if (!own(value, key) || Array.isArray(value)) return;") },
    { id: 'claim_guard_inverted', file: 'graphStructure.js', mode: 'valid_baseline_rejected',
        change: source => source.replace(guard, "if (own(value, key) && !Array.isArray(value)) fail('claim_path');") },
    { id: 'claim_coordinate_redirected', file: 'graphStructure.js', mode: 'missing_native_barrier',
        change: source => source.replace('site_path: [...coordinate.site_path, ...path]', "site_path: ['args', 0, 'forged']") },
    { id: 'claim_M_admitted_from_cached_C', file: 'validationTcbEntry.js', mode: 'whole_ir_conformance_detects_cached_C',
        change: source => source.replace('function capturedValidationTools() {', 'function capturedValidationTools() { let cachedIR, cachedAccess;')
            .replace('compileAuthoringIR: receipt => compileAuthoringIR(receipt, validators)',
                'compileAuthoringIR: receipt => (cachedIR ||= compileAuthoringIR(receipt, validators))')
            .replace('compileSnapshotAccess: receipt => compileSnapshotAccess(receipt, validators)',
                'compileSnapshotAccess: receipt => (cachedAccess ||= compileSnapshotAccess(receipt, validators))') }
];
const report = { stage: 'claim_barrier_adversarial_prepared_before_first_capture',
    started_at: new Date().toISOString(), node: process.version,
    method_commit: '72fc5a5b707909687da9b5cec892be2dcc892a62',
    test_scope: 'causal_claim_namespace_BUILD_mutations_not_normal_runtime_or_guest',
    fixed_cases: cases.map(item => ({ id: item.id, file: item.file, expected_mode: item.mode })),
    observations: [], runtime_guest_run: false, qualified: false, semantic_mutation_credit: 0,
    source_files_written: false, new_schema_or_compiler_model: false };
const save = () => fs.writeFileSync(out, JSON.stringify(report) + '\n');
fs.writeFileSync(out, JSON.stringify(report) + '\n', { flag: 'wx' });
let sources;
const sourceState = () => {
    const mismatches = sources.files.filter(row => sha(read(row.path)) !== row.sha256).map(row => row.path);
    assert.deepEqual(mismatches, [], 'measured_source_drift');
    return { count: sources.files.length, sha256: sources.sha256, mismatches };
};
(async () => {
    assert.equal(process.version, 'v22.17.0');
    const terminal = JSON.parse(read('.codex-temp/b4-02-empty-L-native-controls-20261021.job.json'));
    assert.equal(terminal.stage, 'all819_native_BUILD_controls_completed_not_static_qualification');
    assert.equal(terminal.completed_controls, 819, 'do_not_overlap_the_normal_batch');
    const wide = JSON.parse(read('.codex-temp/b4-02-path-v3-final-wide-20261019.json'));
    sources = wide.measured_sources_after;
    assert.equal(sources.files.length, 895);
    assert.equal(sha(JSON.stringify(sources.files)),
        '183ba87724616c2226e7b1893fb8c3b5fa978631b116d99d23307ec9e782a6d7');
    report.sources_before = sourceState();
    const { loadLocalAuthoringPackage } = await import(pathToFileURL(path.join(root,
        'scripts/agent/executeNextDomainInvariantMatrix.mjs')).href);
    const { buildAdmittedSchemaValidators } = await import(pathToFileURL(path.join(root,
        'scripts/agent/buildNextProvenanceArtifacts.mjs')).href);
    const { compileAuthoringIR } = require('../src/next/provenance/graphCompiler');
    const api = require('../src/next/provenance/pathQualificationV3');
    const compiler = await import(pathToFileURL(path.join(root, 'scripts/agent/capturePathQualificationCompiler.mjs')).href);
    const packageReceipt = loadLocalAuthoringPackage();
    const preparation = api.preparePathQualificationInventory({ packageReceipt,
        ir: compileAuthoringIR(packageReceipt, buildAdmittedSchemaValidators(packageReceipt).validators) });
    const rowIndex = 79;
    assert.equal(preparation.rows[rowIndex].target.fact_key, 'S-01#1#1');
    assert.equal(preparation.rows[rowIndex].target.predicate_id, 'binding_3');
    assert.equal(preparation.rows[rowIndex].sites.length, 1);
    assert.equal(preparation.rows[rowIndex].sites[0].authored_site.definition, 'claimPath');
    assert.deepEqual(preparation.rows[rowIndex].sites[0].domain.locators, []);
    const plan = api.preparePathStaticDomainControls({ preparation, rowIndex });
    const rosterBytes = read('.codex-temp/b4-02-empty-L-native-controls-20261021.roster.json');
    assert.equal(sha(rosterBytes), 'ee040698d6517b5ba4200d1df0c4cfbcb4aaf05beb6074e9b601a48a363e4f36');
    const originalControl = JSON.parse(rosterBytes).controls.find(item => item.row_index === rowIndex && item.site_index === 0);
    assert.ok(originalControl);
    assert.equal(plan.target_id, originalControl.target_id);
    assert.equal(plan.qualification_id, originalControl.qualification_id);
    assert.equal(plan.domain_sha256, originalControl.domain_sha256);
    assert.deepEqual(plain(plan.controls[0]), originalControl.control);
    report.original_row_index = rowIndex;
    report.precommitted_plan = plain(plan);
    report.fixed_source_mutations = cases.map(item => {
        const relative = 'src/next/provenance/' + item.file;
        const original = read(relative).toString('utf8'), altered = item.change(original);
        assert.notEqual(altered, original, item.id);
        return { id: item.id, path: relative, original_sha256: sha(original), altered_sha256: sha(altered) };
    });
    save();
    for (const item of cases) {
        const originalRead = fs.readFileSync;
        let modifiedReads = 0, capture;
        fs.readFileSync = function(file, ...args) {
            const value = originalRead.call(this, file, ...args);
            if (typeof file !== 'string' || !file.replaceAll('\\', '/').endsWith('/src/next/provenance/' + item.file)) return value;
            const source = typeof value === 'string' ? value : value.toString('utf8');
            const altered = item.change(source);
            assert.notEqual(altered, source); modifiedReads++;
            return typeof value === 'string' ? altered : Buffer.from(altered);
        };
        try { capture = compiler.capturePathQualificationCompiler(); }
        finally { fs.readFileSync = originalRead; }
        assert.ok(modifiedReads > 0, item.id);
        assert.notEqual(capture.artifact_root,
            'sha256:2281d7efd3b6627fe4679427b908b06ad29ea6e75cfea66aca3c387019bed151');
        const candidate = api.materializePathStaticDomainControl({ plan, siteIndex: 0 });
        const entry = { id: item.id, expected_mode: item.mode, modified_reads: modifiedReads,
            intentionally_altered_compiler_root: capture.artifact_root, candidate_id: candidate.candidate_id,
            invocation_id: candidate.invocation_id, expected_diagnostic: plain(candidate.expected_diagnostic) };
        let result, caught;
        try { result = compiler.compilePathQualificationCandidate({ capture, candidate }); }
        catch (error) {
            caught = error;
            const retained = compiler.readPathQualificationCompilerEvidence(error);
            entry.error = { name: error.name, message: error.message };
            entry.retained = retained ? plain(retained) : null;
        }
        if (result) entry.result = plain(result);
        // Unknown errors are retained but never promoted to a successful RED.
        const nativeMismatch = result?.native_control_matched === false && result.handle_attempts === 0
            && result.dp_execution === false && result.qualified === false;
        const redirectedCoordinate = nativeMismatch && item.id === 'claim_coordinate_redirected'
            && result.worlds[1].diagnostic?.message === 'graph_structure_claim_path'
            && JSON.stringify(result.worlds[1].diagnostic.native_coordinate?.site_path)
                === JSON.stringify(['args', 0, 'forged']);
        const invertedBaseline = item.mode === 'valid_baseline_rejected'
            && caught?.message === 'graph_structure_claim_path';
        const cachedConformance = item.mode === 'whole_ir_conformance_detects_cached_C'
            && entry.retained?.conformance_failed === true && entry.retained.variant === 'M'
            && entry.retained.handle_attempts === 0;
        entry.expected_adversarial_property_observed = Boolean(
            (item.id === 'claim_guard_removed' && nativeMismatch)
            || redirectedCoordinate || invertedBaseline || cachedConformance);
        entry.no_normal_candidate_qualification_or_credit = true;
        report.observations.push(entry); save();
        assert.equal(entry.expected_adversarial_property_observed, true, 'unclassified_adversarial_outcome_stop_no_retry:' + item.id);
    }
    assert.equal(report.observations.length, 4);
    report.sources_after = sourceState();
    report.stage = 'four_fixed_claim_barrier_adversarial_cases_completed_not_static_qualification';
    report.completed_at = new Date().toISOString();
    report.duration_ms = Date.now() - Date.parse(report.started_at); save();
    console.log(JSON.stringify({ stage: report.stage, cases: report.observations.length,
        expected_properties: report.observations.map(item => item.expected_adversarial_property_observed),
        report_bytes: fs.statSync(out).size, report_sha256: sha(fs.readFileSync(out)),
        sources_895_unchanged: true, runtime_guest_run: false, qualified: false, semantic_mutation_credit: 0 }));
})().catch(error => {
    report.stage = 'claim_barrier_adversarial_stopped_no_retry_or_qualification';
    report.error = { name: error.name, message: error.message };
    report.completed_at = new Date().toISOString();
    if (sources) { try { report.sources_after = sourceState(); } catch (sourceError) { report.source_error = sourceError.message; } }
    save(); console.error(error.stack); process.exitCode = 1;
});
