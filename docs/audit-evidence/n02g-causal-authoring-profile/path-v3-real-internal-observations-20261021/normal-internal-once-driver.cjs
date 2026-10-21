'use strict';
// Trusted native-operator sequence already reviewed in e4/provisioning-case.md.
// Mechanical invocation only: no new engine, analyzer, TCB or qualification API.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = path.join(__dirname, 'b4-02-internal-observations-20261021.json');
const marker = path.join(__dirname, 'b4-02-internal-once-20261021.started.json');
assert.equal(fs.existsSync(output), false, 'do_not_repeat_completed_attempt');
assert.equal(fs.existsSync(marker), false, 'do_not_repeat_started_attempt');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = relative => {
    const file = path.resolve(root, relative);
    assert.ok(file.startsWith(root + path.sep), 'input_outside_worktree');
    return fs.readFileSync(file);
};
const fixed = (relative, expected) => {
    const bytes = read(relative); assert.equal(sha(bytes), expected, relative); return bytes;
};
// Expected values adopted from the actual independent e4 review, not learned
// from the current input at admission time. Proposed JSON flags stay unchanged.
const expected = Object.freeze({
    candidate: 'e4af6912c83d04c1d827c03b24aa90ab80043f39',
    review: 'dcc154c7e26effdeabbdcd8cf84120402a6881125c6f6c09cbd36f9c1e56f31f',
    receipt: 'a447095591b8abf4bd5d663fef413b19fe3fe2358dddf0f5c5eb47befe21a06f',
    freeze: '5c6647ba3d13403790ff19aacf006549bf1dc742987bee87b2420d7710ccaec6',
    ticketRaw: '25fcc83bd2324f1b744df268164f619883a550bce0b43e3b92ec52d0ea590f8b',
    ticketCommitment: 'sha256:b538120d92a96fa21ada2bedd1d155f5a588dab3fef4a808e1ddec499bf18cdc',
    payload: 'b9132fb2bd1099194a1e3b8827c9c804075d92e2b280af7fceca5ba11f7022b3',
    tcb: '34f059dfdaafc4b7d479109978c444e7bd9335d93dc95349ec4e5bb3e5f7ffff',
    node: '39d45b5933f339d3ebdebd76474893dab5d7da1038920f65cf5bbcf0f20f3636',
    invocation: '1c665af2-7982-4b14-b49f-1afeb85ac1f2',
    selected: 'sha256:af435a0276d323543f62708e29d47bc923deaca8bdfb2b4f5912f55434b79f74',
    reference: 'sha256:20b0b6a394a2030e4214d28f13589438d374456c8a742ac62fafcef582831a48',
    wide: '42e6126d4c3f321534d72b7584951d9d4aa6a6c794e889618d9934589f35a866',
    inputs: '183ba87724616c2226e7b1893fb8c3b5fa978631b116d99d23307ec9e782a6d7',
    snapshot: 'ada954eb15be38339401ec99ee552b46532ae21d7290b25bde31765c3072e4a6'
});
const leafHashes = Object.freeze({
    'child-bootstrap.js': '97413ddff2e9fd8a1c5368a96aed2a3000401476da2ce9b795631958dc8c0a92',
    'host-bootstrap.js': '3763ef424087217f14dfd7903d7f8b3bd6919448d4d51f682320fcdea1cddd35',
    'launcher-bootstrap.js': '2f8a10d658d5748cdbcdbbad79abb4dd29c3364816d6f4504e219682429e4119',
    'recipe.json': '59b8281975ffa4fd9981d4e270aad0e4a9d4b2ca2ffce5b1f9660103d26bd401'
});
const report = {
    format: 'financasbot.path-v3.normal-internal-observations-local', version: 1,
    candidate: expected.candidate, independent_review_sha256: expected.review,
    confronted_review_receipt_sha256: expected.receipt,
    started_at: new Date().toISOString(), stage: 'preparing_fixed_reviewed_invocation',
    external_platform_trust_assumed_not_certified: true,
    expected_freeze_hash: 'sha256:' + expected.freeze,
    expected_ticket_commitment: expected.ticketCommitment,
    tcb_evaluation_started: false, launcher_called: false, initializer_called: false,
    guest_execution_attempted: false, runtime_guest_run: false,
    qualified: false, semantic_mutation_credit: 0, financial_acceptance: false,
    globalGO: false, NEXT03: false
};
let measured;
function verifySources() {
    const mismatches = measured.files.filter(row => sha(read(row.path)) !== row.sha256).map(row => row.path);
    assert.deepEqual(mismatches, [], 'reviewed_inputs_changed');
    return { count: measured.files.length, sha256: measured.sha256, mismatches };
}
const event = stage => console.log(JSON.stringify({ stage, at: new Date().toISOString() }));
function save() {
    report.completed_at = new Date().toISOString();
    report.duration_ms = Date.now() - Date.parse(report.started_at);
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
(async () => {
    assert.equal(process.platform, 'win32'); assert.equal(process.arch, 'x64'); assert.equal(process.version, 'v22.17.0');
    assert.equal(sha(fs.readFileSync(process.execPath)), expected.node, 'official_native_binary');
    report.native_runtime_before = { platform: process.platform, arch: process.arch, version: process.version,
        sha256: expected.node, publisher_source: 'https://nodejs.org/dist/v22.17.0/SHASUMS256.txt' };
    fixed('.codex-temp/b4-02-e4-final-audit-receipt-confronted-20261021.md', expected.receipt);
    const wide = JSON.parse(fixed('.codex-temp/b4-02-path-v3-final-wide-20261019.json', expected.wide));
    measured = wide.measured_sources_after;
    assert.equal(measured.files.length, 895); assert.equal(measured.sha256, expected.inputs);
    assert.equal(sha(JSON.stringify(measured.files)), expected.inputs);
    report.sources_before = verifySources();
    const cap = '.codex-temp/path-v3-complete-capture-ac08-20261015-bytes/';
    fixed(cap + 'normal-rule-review-snapshot.json', expected.snapshot);
    const data = '.codex-temp/b4-02-operational-provisioning-20261021/';
    const freezeBytes = fixed(data + 'proposed-execution-freeze.json', expected.freeze);
    const ticketBytes = fixed(data + 'execution-ticket.json', expected.ticketRaw);
    const payloadBytes = fixed(data + 'execution-payload.json', expected.payload);
    const ticket = JSON.parse(ticketBytes.toString('utf8'));
    assert.equal(ticket.invocation_id, expected.invocation); assert.equal(ticket.candidate_id, expected.selected);
    assert.equal(ticket.reference_commitment, expected.reference);
    assert.equal(ticket.worlds.map(row => row.variant).join(','), 'C,M,S');
    assert.ok(Object.values(ticket.prerequisites).every(value => value === true));
    const manifestBytes = fixed(cap + 'validation-tcb-manifest.json', expected.tcb);
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    assert.equal(manifest.entry, 'launcher-bootstrap.js');
    assert.deepEqual(manifest.files.map(row => row.path), Object.keys(leafHashes));
    const entries = Object.keys(leafHashes).map(name => {
        const bytes = fixed(cap + name, leafHashes[name]);
        assert.equal(manifest.files.find(row => row.path === name).sha256, 'sha256:' + leafHashes[name]);
        return { path: name, bytes };
    });
    const nativeNames = ['node:child_process', 'node:crypto', 'node:fs', 'node:path', 'node:process', 'node:util', 'node:vm'];
    const recipe = JSON.parse(entries.find(row => row.path === 'recipe.json').bytes.toString('utf8'));
    assert.deepEqual(recipe.launcher_native_externals, nativeNames);
    report.fixed_input_measurements_before_evaluation = {
        freeze_sha256: expected.freeze, ticket_sha256: expected.ticketRaw, payload_sha256: expected.payload,
        tcb_manifest_sha256: expected.tcb, all_four_leaf_sha256: leafHashes,
        first_leaf_measured_before_evaluation: true, snapshot_sha256: expected.snapshot,
        selected_candidate_id: expected.selected, invocation_id: expected.invocation,
        normal_prerequisites: ticket.prerequisites
    };
    // A local one-use marker only, not an OS isolation or global replay claim.
    fs.writeFileSync(marker, JSON.stringify({ candidate: expected.candidate, invocation_id: expected.invocation,
        started_at: report.started_at, review_sha256: expected.review, no_automatic_retry: true }) + '\n', { flag: 'wx' });
    event('all_fixed_pins_and_first_leaf_measured_before_TCB_evaluation');
    const allowed = new Set(nativeNames);
    const requireNative = name => {
        assert.ok(allowed.has(name), 'undeclared_native_import'); return require(name);
    };
    const launcherSource = entries.find(row => row.path === 'launcher-bootstrap.js').bytes.toString('utf8');
    report.tcb_evaluation_started = true;
    const launch = vm.runInThisContext(`(function(require){return ${launcherSource}\n})`,
        { filename: 'reviewed-measured-launcher-bootstrap.js' })(requireNative);
    assert.equal(typeof launch, 'function');
    report.launcher_called = true;
    const loaded = launch({ freezeBytes: Buffer.from(freezeBytes), expectedFreezeHash: 'sha256:' + expected.freeze,
        tcbArtifact: { manifestBytes: Buffer.from(manifestBytes),
            entries: entries.map(row => ({ path: row.path, bytes: Buffer.from(row.bytes) })) },
        qualification: { ticketSource: ticketBytes.toString('utf8'), payloadSource: payloadBytes.toString('utf8'),
            expectedTicketCommitment: expected.ticketCommitment } });
    assert.equal(loaded.stage, 'captured_tcb_path_qualification_loaded_only');
    report.initializer_called = true;
    const host = loaded.initializePathQualification();
    assert.equal(host.stage, 'captured_path_qualification_prepared_only');
    assert.equal(host.candidate_id, expected.selected); assert.equal(host.invocation_id, expected.invocation);
    assert.equal(host.ticket_commitment, expected.ticketCommitment); assert.equal(host.reference_commitment, expected.reference);
    report.initialization_receipt = { stage: host.stage, candidate_id: host.candidate_id,
        invocation_id: host.invocation_id, ticket_commitment: host.ticket_commitment,
        reference_commitment: host.reference_commitment, execution_permitted: host.execution_permitted,
        qualified: host.qualified, semantic_mutation_credit: host.semantic_mutation_credit };
    event('original_initializer_admitted_fixed_reviewed_transport_before_run');
    report.guest_execution_attempted = true;
    // Exactly one call on the original receiver. No caller callbacks/configs.
    const observed = await host.run();
    assert.equal(observed.stage, 'captured_path_normal_observations_not_qualification');
    assert.equal(observed.candidate_id, expected.selected); assert.equal(observed.invocation_id, expected.invocation);
    assert.equal(observed.reference_commitment, expected.reference);
    assert.equal(observed.observations.map(row => row.variant).join(','), 'C,M,S');
    assert.equal(observed.qualified, false); assert.equal(observed.semantic_mutation_credit, 0);
    report.observations = observed;
    report.runtime_guest_run = true;
    report.sources_after = verifySources();
    report.snapshot_unchanged = sha(read(cap + 'normal-rule-review-snapshot.json')) === expected.snapshot;
    assert.equal(report.snapshot_unchanged, true);
    assert.equal(sha(fs.readFileSync(process.execPath)), expected.node);
    report.stage = 'actual_normal_INTERNAL_observations_pending_qualification_not_financial_authority';
    save(); event('one_original_run_completed_observations_written_no_qualification');
})().catch(error => {
    report.stage = 'normal_INTERNAL_attempt_stopped_no_retry';
    report.error = { name: error.name, message: error.message,
        ...(error.diagnostic ? { diagnostic: error.diagnostic } : {}) };
    if (report.guest_execution_attempted && !report.observations) report.runtime_guest_run = null;
    try { if (measured) report.sources_after = verifySources(); }
    catch (sourceError) { report.source_verification_error = sourceError.message; }
    save(); event('normal_INTERNAL_attempt_stopped_no_retry'); process.exitCode = 1;
});
