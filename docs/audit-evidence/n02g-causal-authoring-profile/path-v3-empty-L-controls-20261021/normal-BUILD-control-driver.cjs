'use strict';
// Mechanical finite batch of EXISTING BUILD APIs for the fixed all-empty-L
// rows. No new analyzer, rule, guest execution, financial API or qualification.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const prefix = path.join(__dirname, 'b4-02-empty-L-native-controls-20261021');
const jobPath = prefix + '.job.json', rowsPath = prefix + '.rows.jsonl', rosterPath = prefix + '.roster.json';
for (const f of [jobPath, rowsPath, rosterPath]) assert.equal(fs.existsSync(f), false, 'batch_already_started');
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
const read = relative => fs.readFileSync(path.join(root, relative));
const plain = v => JSON.parse(JSON.stringify(v));
const started = new Date().toISOString();
const job = { stage: 'preparing_fixed_empty_L_roster', started_at: started, node: process.version,
    completed_controls: 0, expected_controls: 819, expected_rows: 736,
    pid: process.pid, runtime_guest_run: false, handle_attempts: 0, qualified: false,
    semantic_mutation_credit: 0, financial_acceptance: false, globalGO: false, NEXT03: false };
fs.writeFileSync(jobPath, JSON.stringify(job) + '\n', { flag: 'wx' });
const writeJob = () => fs.writeFileSync(jobPath, JSON.stringify(job) + '\n');
let sources;
function sourceState() {
    const mismatches = sources.files.filter(r => sha(read(r.path)) !== r.sha256).map(r => r.path);
    assert.deepEqual(mismatches, [], 'source_drift');
    return { count: sources.files.length, sha256: sources.sha256, mismatches };
}
(async () => {
    assert.equal(process.version, 'v22.17.0');
    const ledgerBytes = read('.codex-temp/b4-02-pathv3-partial-qualified-ledger-20261021.json');
    assert.equal(sha(ledgerBytes), '2921db7c0faa557a7d9c1a5e2b73adc6f596c4db395583cb3bdce4bba12147d4');
    const ledger = JSON.parse(ledgerBytes);
    const wide = JSON.parse(read('.codex-temp/b4-02-path-v3-final-wide-20261019.json'));
    sources = wide.measured_sources_after;
    assert.equal(sources.files.length, 895);
    assert.equal(sha(JSON.stringify(sources.files)), '183ba87724616c2226e7b1893fb8c3b5fa978631b116d99d23307ec9e782a6d7');
    job.sources_before = sourceState();
    const { loadLocalAuthoringPackage } = await import(pathToFileURL(path.join(root,
        'scripts/agent/executeNextDomainInvariantMatrix.mjs')).href);
    const { buildAdmittedSchemaValidators } = await import(pathToFileURL(path.join(root,
        'scripts/agent/buildNextProvenanceArtifacts.mjs')).href);
    const { compileAuthoringIR } = require('../src/next/provenance/graphCompiler');
    const { canonicalValue } = require('../src/next/kernel/canonicalValue');
    const api = require('../src/next/provenance/pathQualificationV3');
    const compiler = await import(pathToFileURL(path.join(root, 'scripts/agent/capturePathQualificationCompiler.mjs')).href);
    const packageReceipt = loadLocalAuthoringPackage();
    const preparation = api.preparePathQualificationInventory({ packageReceipt,
        ir: compileAuthoringIR(packageReceipt, buildAdmittedSchemaValidators(packageReceipt).validators) });
    api.verifyPathQualificationInventory({ preparation, candidate: preparation });
    assert.deepEqual(preparation.rows.map(r => r.target_id), ledger.rows.map(r => r.target_id));
    const planned = [];
    for (let i = 0; i < preparation.rows.length; i++) {
        const row = preparation.rows[i];
        if (!row.sites.every(s => s.domain_complete && s.domain.locators.length === 0)) continue;
        assert.equal(ledger.rows[i].status, 'blocked');
        const plan = api.preparePathStaticDomainControls({ preparation, rowIndex: i });
        planned.push({ row_index: i, plan });
    }
    const roster = planned.flatMap(({ row_index, plan }) => plan.controls.map((control, site_index) => ({
        row_index, site_index, target_id: plan.target_id, qualification_id: plan.qualification_id,
        domain_sha256: plan.domain_sha256, control: plain(control) })));
    assert.equal(planned.length, 736); assert.equal(roster.length, 819);
    assert.equal(new Set(roster.map(r => r.control.admission_id)).size, 819);
    fs.writeFileSync(rosterPath, JSON.stringify({ stage: 'all_empty_L_controls_fixed_before_first_negative',
        method_authority: plain(api.METHOD), reviewed_code_scope: ledger.reviewed_whole_candidate,
        baseline_authority: plain(preparation.authority_refs), target_ids_sha256: ledger.target_ids_sha256,
        rows: 736, sites: 819, controls: roster, no_guest_or_qualification_authority: true }) + '\n', { flag: 'wx' });
    job.roster_sha256 = sha(fs.readFileSync(rosterPath));
    const capture = compiler.capturePathQualificationCompiler();
    assert.equal(capture.artifact_root, 'sha256:2281d7efd3b6627fe4679427b908b06ad29ea6e75cfea66aca3c387019bed151');
    job.compiler_artifact_root = capture.artifact_root;
    job.stage = 'captured_normal_BUILD_controls_running_no_guest'; writeJob();
    fs.writeFileSync(rowsPath, '', { flag: 'wx' });
    console.log(JSON.stringify({ stage: job.stage, rows: 736, controls: 819,
        roster_sha256: job.roster_sha256, handle_attempts: 0, guest: false }));
    const invocations = new Set();
    for (const { row_index, plan } of planned) {
        for (let siteIndex = 0; siteIndex < plan.controls.length; siteIndex++) {
            const control = plan.controls[siteIndex];
            const candidate = api.materializePathStaticDomainControl({ plan, siteIndex });
            assert.ok(!invocations.has(candidate.invocation_id)); invocations.add(candidate.invocation_id);
            const start = Date.now();
            let result;
            try { result = compiler.compilePathQualificationCandidate({ capture, candidate }); }
            catch (error) {
                const retained = compiler.readPathQualificationCompilerEvidence(error);
                fs.appendFileSync(rowsPath, JSON.stringify({ row_index, site_index: siteIndex,
                    target_id: plan.target_id, candidate: plain(candidate),
                    error: { name: error.name, message: error.message }, retained: retained ? plain(retained) : null }) + '\n');
                throw error;
            }
            fs.appendFileSync(rowsPath, JSON.stringify({ row_index, site_index: siteIndex,
                target_id: plan.target_id, qualification_id: plan.qualification_id,
                expected_diagnostic: plain(control.expected_diagnostic), duration_ms: Date.now() - start,
                result: plain(result) }) + '\n');
            assert.equal(result.native_control_matched, true, 'native_control_contradiction_stop_no_retry');
            assert.equal(result.handle_attempts, 0);
            assert.equal(result.dp_execution, false); assert.equal(result.qualified, false);
            assert.equal(result.semantic_mutation_credit, 0);
            assert.deepEqual(result.worlds.map(w => w.admitted), [true, false, true]);
            assert.equal(canonicalValue(result.worlds[1].diagnostic.native_coordinate), canonicalValue(plain(control.expected_diagnostic)));
            assert.equal(result.worlds[0].ir_sha256, result.worlds[2].ir_sha256);
            job.completed_controls++;
            job.last_completed_at = new Date().toISOString();
            job.last_control_duration_ms = Date.now() - start;
            writeJob();
            if (job.completed_controls === 1 || job.completed_controls % 100 === 0)
                console.log(JSON.stringify({ completed_controls: job.completed_controls, total:819,
                    elapsed_ms: Date.now() - Date.parse(started), last_ms: job.last_control_duration_ms,
                    no_guest: true, qualified: false, credit:0 }));
        }
    }
    assert.equal(job.completed_controls, 819); assert.equal(invocations.size,819);
    job.stage = 'all819_native_BUILD_controls_completed_not_static_qualification';
    job.sources_after = sourceState();
    job.rows_sha256 = sha(fs.readFileSync(rowsPath)); job.rows_bytes = fs.statSync(rowsPath).size;
    job.completed_at = new Date().toISOString(); job.duration_ms = Date.now() - Date.parse(started);
    writeJob(); console.log(JSON.stringify(job));
})().catch(error => {
    job.stage = 'native_BUILD_control_batch_stopped_no_retry_or_qualification';
    job.error = { name: error.name, message: error.message };
    job.completed_at = new Date().toISOString();
    if (sources) { try { job.sources_after = sourceState(); } catch (e) { job.source_error=e.message; } }
    if (fs.existsSync(rowsPath)) { job.rows_sha256=sha(fs.readFileSync(rowsPath)); job.rows_bytes=fs.statSync(rowsPath).size; }
    writeJob(); console.error(error.stack); process.exitCode=1;
});
