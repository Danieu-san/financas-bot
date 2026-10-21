'use strict';
// Mechanical driver of EXISTING BUILD APIs after the real737 independent review.
// No analyzer, grammar, rule discharge, TCB launcher, guest, oracle or approval.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const prefix = path.join(__dirname, 'b4-02-reviewed-normal-build-20261021');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const checkedPath = relative => {
    const resolved = path.resolve(root, relative);
    if (!resolved.startsWith(root + path.sep)) throw Error('input_outside_worktree');
    return resolved;
};
const read = relative => fs.readFileSync(checkedPath(relative));
const localImport = relative => import(pathToFileURL(checkedPath(relative)).href);
const expectedSnapshot = 'ada954eb15be38339401ec99ee552b46532ae21d7290b25bde31765c3072e4a6';
const expectedCompiler = 'sha256:2281d7efd3b6627fe4679427b908b06ad29ea6e75cfea66aca3c387019bed151';
const snapshotPath = '.codex-temp/path-v3-complete-capture-ac08-20261015-bytes/normal-rule-review-snapshot.json';
const reviewPath = '.codex-temp/b4-02-737-final-audit-receipt-confronted-20261021.md';
const reviewMessageHash = 'b42cf707dc582bd699cff392df646e54c68627fe7f1ba88623f9e9444898dd84';
for (const suffix of ['.json', '.ticket.json', '.payload.json']) {
    if (fs.existsSync(prefix + suffix)) throw Error('single_reviewed_build_output_already_exists');
}
const started = new Date().toISOString();
const report = {
    format: 'financasbot.path-v3.reviewed-normal-build-local', version: 1,
    candidate: '737ed6c0a49b357097acc263938c239744bc6412', started_at: started,
    node: process.version, review_receipt: reviewPath, review_message_sha256: reviewMessageHash,
    // This is the operator's already confronted scope, NOT self-authentication.
    review_receipt_sha256: sha(read(reviewPath)), reviewed_snapshot_sha256: expectedSnapshot,
    runtime_guest_run: false, tcb_launcher_evaluated: false, external_ticket_pin_reviewed: false,
    qualified: false, semantic_mutation_credit: 0, financial_acceptance: false
};
const event = stage => console.log(JSON.stringify({ stage, at: new Date().toISOString() }));
let measured;
const verifySources = () => {
    const mismatches = [];
    for (const row of measured.files) {
        const bytes = read(row.path);
        if (sha(bytes) !== row.sha256) mismatches.push(row.path);
    }
    if (mismatches.length) throw Error('current_measured_source_mismatch:' + mismatches.join(','));
    return { count: measured.files.length, sha256: measured.sha256, mismatches };
};
(async () => {
    if (process.version !== 'v22.17.0') throw Error('pinned_node_version');
    measured = JSON.parse(read('.codex-temp/b4-02-path-v3-final-wide-20261019.json')).measured_sources_after;
    if (measured.files.length !== 895 || sha(JSON.stringify(measured.files)) !== measured.sha256
        || measured.sha256 !== '183ba87724616c2226e7b1893fb8c3b5fa978631b116d99d23307ec9e782a6d7')
        throw Error('original_wide_inventory_binding');
    report.sources_before = verifySources();
    const snapshotSource = read(snapshotPath).toString('utf8');
    if (sha(Buffer.from(snapshotSource)) !== expectedSnapshot) throw Error('fixed_reviewed_snapshot_bytes');
    const snapshot = JSON.parse(snapshotSource);
    const { canonicalValue } = require('../src/next/kernel/canonicalValue');
    if (canonicalValue(snapshot) !== snapshotSource) throw Error('snapshot_canonical');
    event('reviewed_inputs_bound_before_normal_build');
    const { loadLocalAuthoringPackage } = await localImport('scripts/agent/executeNextDomainInvariantMatrix.mjs');
    const { buildAdmittedSchemaValidators } = await localImport('scripts/agent/buildNextProvenanceArtifacts.mjs');
    const { compileAuthoringIR } = require('../src/next/provenance/graphCompiler');
    const { admittedDocuments } = require('../src/next/provenance/packageContract');
    const { admitPhaseCompositionProfile, PROFILE_PATH } = require('../src/next/provenance/phaseCompositionProfile');
    const api = require('../src/next/provenance/pathQualificationV3');
    const compiler = await localImport('scripts/agent/capturePathQualificationCompiler.mjs');
    const packageReceipt = loadLocalAuthoringPackage();
    const ir = compileAuthoringIR(packageReceipt, buildAdmittedSchemaValidators(packageReceipt).validators);
    const preparation = api.preparePathQualificationInventory({ packageReceipt, ir });
    const indices = preparation.rows.map((row, index) => ({ row, index })).filter(({ row }) =>
        row.target.fact_key === 'S-01#1#1' && row.target.predicate_id === 'link_2_refund_sign'
        && row.target.strategy === 'same_type_wrong_path');
    if (indices.length !== 1) throw Error('unique_original_target');
    const plan = api.preparePathQualificationWitnessPreselection({ preparation, rowIndex: indices[0].index });
    if (canonicalValue(plan.baseline_package) !== canonicalValue(snapshot.core.baseline_package))
        throw Error('reviewed_baseline_package');
    const registry = admittedDocuments(packageReceipt).find(row => row.value?.registry_id === 'metric_evaluator_registry').value;
    const phaseProfile = admitPhaseCompositionProfile({ source: read(PROFILE_PATH).toString('utf8'), registry });
    report.preselected = plan.selected;
    report.preselection_before_compile = { target_id: plan.target_id, entries_sha256: plan.entries_sha256,
        domain_sha256: plan.domain_sha256, conditional_partition_sha256: plan.conditional_domain_partition_sha256 };
    event('first_candidate_sealed_before_capture_or_controls');
    const capture = compiler.capturePathQualificationCompiler();
    if (capture.artifact_root !== expectedCompiler
        || capture.normal_compiler_source_bindings_sha256 !== snapshot.core.compiler.host_sources_sha256
        || capture.normal_child_source_bindings_sha256 !== snapshot.core.compiler.child_sources_sha256)
        throw Error('reviewed_capture_binding');
    report.compiler_artifact_root = capture.artifact_root;
    event('captured_normal_controls_and_selected_compile_start');
    const result = compiler.compilePathQualificationWitnessPreselection({ capture, plan, phaseProfile,
        normalRuleReview: { snapshotSource, expectedReviewHash: 'sha256:' + expectedSnapshot } });
    if (result.handle_attempts !== 0 || result.qualified !== false || result.semantic_mutation_credit !== 0
        || result.witness_preselection.selected.entry_index !== plan.selected.entry_index)
        throw Error('zero_handles_and_fixed_selection');
    report.result = result;
    // Genuine single-use BUILD issue. Its computed commitment is NOT a reviewed pin.
    const transport = compiler.preparePathQualificationExecutionTransport({ result });
    if (transport.stage !== 'path_v3_build_execution_transport_not_reviewed_pin'
        || transport.qualified !== false || transport.semantic_mutation_credit !== 0)
        throw Error('transport_scope');
    const ticket = JSON.parse(transport.ticketSource);
    if (ticket.candidate_id !== result.candidate_id || ticket.invocation_id !== result.invocation_id)
        throw Error('genuine_ticket_identity');
    fs.writeFileSync(prefix + '.ticket.json', transport.ticketSource, { flag: 'wx' });
    fs.writeFileSync(prefix + '.payload.json', transport.payloadSource, { flag: 'wx' });
    report.transport = { stage: transport.stage, measured_ticket_commitment: transport.measured_ticket_commitment,
        ticket_sha256: sha(transport.ticketSource), payload_sha256: sha(transport.payloadSource),
        ticket_bytes: Buffer.byteLength(transport.ticketSource), payload_bytes: Buffer.byteLength(transport.payloadSource),
        prerequisites: ticket.prerequisites, ticket_file: path.basename(prefix + '.ticket.json'),
        payload_file: path.basename(prefix + '.payload.json'), external_pin_or_authority_issued: false };
    report.sources_after = verifySources();
    report.current_snapshot_unchanged = sha(read(snapshotPath)) === expectedSnapshot;
    if (!report.current_snapshot_unchanged) throw Error('snapshot_mutated');
    report.completed_at = new Date().toISOString(); report.duration_ms = Date.now() - Date.parse(started);
    report.stage = 'normal_reviewed_build_and_transport_only_not_guest_or_qualification';
    fs.writeFileSync(prefix + '.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    event('normal_build_report_written_no_guest_execution');
})().catch(error => {
    report.completed_at = new Date().toISOString(); report.stage = 'normal_build_failed_no_retry';
    report.error = { name: error.name, message: error.message };
    try { if (measured) report.sources_after = verifySources(); }
    catch (sourceError) { report.source_error = sourceError.message; }
    fs.writeFileSync(prefix + '.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.error(error.stack); process.exitCode = 1;
});
