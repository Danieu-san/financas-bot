'use strict';
// Serial mechanical invocation of EXISTING reviewed BUILD/transport APIs.
// No guest, TCB launcher evaluation, analytical helper, authority or credit.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {canonicalValue}=require('../src/next/kernel/canonicalValue');
const root=path.resolve(__dirname,'..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(path.join(root,p));
const localImport=p=>import(pathToFileURL(path.join(root,p)).href);
const prefix=path.join(__dirname,'b4-02-two-reviewed-normal-builds-20261022');
const receiptPath='.codex-temp/b4-02-cd51-final-audit-receipt-confronted-20261022.md';
const receiptHash='9e1849666d63533827e200bec48efe7bbbc2a2fa8617e46f1cb64d2d7ae9f2f3';
const reviewHash='166d3e10cd2dca7a69fc59f07bab551694b5b5287b26b9f11b87b08eca1952b1';
const specs=[{row:140,predicate:'link_7_equal_magnitude',entry:0,site:0,locator:0,
    snapshot:'0140',sha:'e9f0c631ca3e5d81d2e7684fb78f5841cb52128cd9b69fae8e3d5498ba35a230',
    target:'sha256:0d382e53bf0beec08dec3c5caaf18b4f39117c8f2f4b066e64c53f241726aff0'},
    {row:1952,predicate:'link_6_opposite',entry:9,site:0,locator:9,
    snapshot:'1952',sha:'159761e1b317bf95da0440a0c38681937763e1805db908eaaa46fb556eeeeedc',
    target:'sha256:ce8ad03ca4cd47e80abf6f062882f0946f2eefe7d001ce33eeffa35c4153c64a'}];
assert.equal(process.version,'v22.17.0');
assert.equal(sha(read(receiptPath)),receiptHash);
for(const suffix of ['.json','.job.json'])assert.equal(fs.existsSync(prefix+suffix),false,'already_started');
for(const s of specs)for(const ext of ['.json','.ticket.json','.payload.json'])
    assert.equal(fs.existsSync(prefix+'-'+s.snapshot+ext),false,'existing_target_output');
const started=new Date().toISOString();
const job={stage:'starting_only_two_reviewed_normal_builds_no_guest',started_at:started,node:process.version,
    candidate:'cd51f1bc05130306722c918f236c2d8a4a16ad7f',review_sha256:reviewHash,review_receipt_sha256:receiptHash,
    target_roster_fixed_before_first_native_M:specs,completed:[],runtime_guest_run:false,
    qualified:false,semantic_mutation_credit:0,external_pin_or_authority_issued:false};
fs.writeFileSync(prefix+'.job.json',JSON.stringify(job,null,2)+'\n',{flag:'wx'});
const event=(stage,extra={})=>console.log(JSON.stringify({stage,at:new Date().toISOString(),...extra}));
let measured;
function currentSources(){const mismatches=measured.files.filter(r=>sha(read(r.path))!==r.sha256).map(r=>r.path);
    assert.deepEqual(mismatches,[]);return{count:895,sha256:measured.sha256,mismatches};}
(async()=>{
    measured=JSON.parse(read('.codex-temp/b4-02-path-v3-final-wide-20261019.json')).measured_sources_after;
    assert.equal(measured.files.length,895);assert.equal(sha(JSON.stringify(measured.files)),measured.sha256);
    assert.equal(measured.sha256,'183ba87724616c2226e7b1893fb8c3b5fa978631b116d99d23307ec9e782a6d7');
    job.sources_before=currentSources();
    const {loadLocalAuthoringPackage}=await localImport('scripts/agent/executeNextDomainInvariantMatrix.mjs');
    const {buildAdmittedSchemaValidators}=await localImport('scripts/agent/buildNextProvenanceArtifacts.mjs');
    const {compileAuthoringIR}=require('../src/next/provenance/graphCompiler');
    const {admittedDocuments}=require('../src/next/provenance/packageContract');
    const {admitPhaseCompositionProfile,PROFILE_PATH}=require('../src/next/provenance/phaseCompositionProfile');
    const api=require('../src/next/provenance/pathQualificationV3');
    const compiler=await localImport('scripts/agent/capturePathQualificationCompiler.mjs');
    const packageReceipt=loadLocalAuthoringPackage();
    const ir=compileAuthoringIR(packageReceipt,buildAdmittedSchemaValidators(packageReceipt).validators);
    const preparation=api.preparePathQualificationInventory({packageReceipt,ir});
    const registry=admittedDocuments(packageReceipt).find(r=>r.value?.registry_id==='metric_evaluator_registry').value;
    const phaseProfile=admitPhaseCompositionProfile({source:read(PROFILE_PATH).toString('utf8'),registry});
    for(const spec of specs){
        const output=prefix+'-'+spec.snapshot;
        const targetStarted=new Date().toISOString();
        job.current_target=spec.row;job.stage='reviewed_target_preparation_before_M';
        fs.writeFileSync(prefix+'.job.json',JSON.stringify(job,null,2)+'\n');
        const snapshotPath='.codex-temp/b4-02-S01-remaining47-reference-20261021/'+spec.snapshot+'.snapshot.json';
        const snapshotSource=read(snapshotPath).toString('utf8');
        assert.equal(sha(snapshotSource),spec.sha);
        const snapshot=JSON.parse(snapshotSource);assert.equal(canonicalValue(snapshot),snapshotSource);
        const row=preparation.rows[spec.row];assert.equal(row.target.fact_key,'S-01#1#1');
        assert.equal(row.target.predicate_id,spec.predicate);assert.equal(row.target_id,spec.target);
        const plan=api.preparePathQualificationWitnessPreselection({preparation,rowIndex:spec.row});
        assert.equal(plan.target_id,spec.target);assert.equal(plan.selected.entry_index,spec.entry);
        assert.equal(plan.selected.site_index,spec.site);assert.equal(plan.selected.locator_index,spec.locator);
        assert.equal(canonicalValue(plan.baseline_package),canonicalValue(snapshot.core.baseline_package));
        const report={format:'financasbot.path-v3.reviewed-normal-build-local',version:1,
            candidate:job.candidate,started_at:targetStarted,node:process.version,original_row_index:spec.row,
            review_receipt:receiptPath,review_receipt_sha256:receiptHash,review_message_sha256:reviewHash,
            reviewed_snapshot_sha256:spec.sha,preselected:plan.selected,sources_before:currentSources(),
            preselection_before_compile:{target_id:plan.target_id,entries_sha256:plan.entries_sha256,
                domain_sha256:plan.domain_sha256,conditional_partition_sha256:plan.conditional_domain_partition_sha256},
            runtime_guest_run:false,tcb_launcher_evaluated:false,external_ticket_pin_reviewed:false,
            qualified:false,semantic_mutation_credit:0,financial_acceptance:false};
        const capture=compiler.capturePathQualificationCompiler();
        assert.equal(capture.artifact_root,'sha256:2281d7efd3b6627fe4679427b908b06ad29ea6e75cfea66aca3c387019bed151');
        assert.equal(capture.normal_compiler_source_bindings_sha256,snapshot.core.compiler.host_sources_sha256);
        assert.equal(capture.normal_child_source_bindings_sha256,snapshot.core.compiler.child_sources_sha256);
        report.compiler_artifact_root=capture.artifact_root;
        job.stage='normal_controls_then_selected_compile';
        fs.writeFileSync(prefix+'.job.json',JSON.stringify(job,null,2)+'\n');
        event('normal_controls_then_selected_compile_start',{row:spec.row,first_entry:spec.entry});
        const result=compiler.compilePathQualificationWitnessPreselection({capture,plan,phaseProfile,
            normalRuleReview:{snapshotSource,expectedReviewHash:'sha256:'+spec.sha}});
        // Preserve actual complete result before subsequent assertions/transport.
        report.result=result;
        fs.writeFileSync(output+'.build-observed.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
        assert.equal(result.handle_attempts,0);assert.equal(result.qualified,false);assert.equal(result.semantic_mutation_credit,0);
        assert.equal(result.witness_preselection.selected.entry_index,spec.entry);
        assert.equal(result.witness_preselection.admitted_domain_complete,true);
        assert.equal(result.witness_preselection.first_witness_proved,true);
        assert.equal(result.witness_preselection.normal_admission_verified,true);
        assert.equal(result.witness_execution_prerequisites.selected_candidate_normal_compilation_complete,true);
        assert.deepEqual(result.witness_execution_prerequisites.blockers,['reviewed_tcb_and_execution_ticket_missing']);
        assert.deepEqual(result.worlds.map(w=>w.variant),['C','M','S']);
        assert.ok(result.worlds.every(w=>w.admitted&&w.whole_ir_conformance&&w.whole_phase_program_conformance));
        const transport=compiler.preparePathQualificationExecutionTransport({result});
        const ticket=JSON.parse(transport.ticketSource);
        assert.equal(transport.stage,'path_v3_build_execution_transport_not_reviewed_pin');
        assert.equal(ticket.candidate_id,result.candidate_id);assert.equal(ticket.invocation_id,result.invocation_id);
        assert.ok(Object.values(ticket.prerequisites).every(x=>x===true));
        fs.writeFileSync(output+'.ticket.json',transport.ticketSource,{flag:'wx'});
        fs.writeFileSync(output+'.payload.json',transport.payloadSource,{flag:'wx'});
        report.transport={stage:transport.stage,measured_ticket_commitment:transport.measured_ticket_commitment,
            ticket_sha256:sha(transport.ticketSource),payload_sha256:sha(transport.payloadSource),
            ticket_bytes:Buffer.byteLength(transport.ticketSource),payload_bytes:Buffer.byteLength(transport.payloadSource),
            prerequisites:ticket.prerequisites,ticket_file:path.basename(output+'.ticket.json'),
            payload_file:path.basename(output+'.payload.json'),external_pin_or_authority_issued:false};
        report.sources_after=currentSources();assert.equal(sha(read(snapshotPath)),spec.sha);
        report.completed_at=new Date().toISOString();report.duration_ms=Date.now()-Date.parse(targetStarted);
        report.stage='normal_reviewed_build_and_transport_only_not_guest_or_qualification';
        const bytes=JSON.stringify(report,null,2)+'\n';fs.writeFileSync(output+'.json',bytes,{flag:'wx'});
        job.completed.push({row:spec.row,report_file:path.basename(output+'.json'),report_bytes:Buffer.byteLength(bytes),
            report_sha256:sha(bytes),invocation_id:result.invocation_id,candidate_id:result.candidate_id,
            first_entry:spec.entry,duration_ms:report.duration_ms,transport:report.transport});
        event('target_build_and_genuine_transport_complete_no_guest',{row:spec.row,duration_ms:report.duration_ms});
    }
    job.stage='two_reviewed_normal_builds_terminal_no_guest_no_external_pins';
    job.sources_after=currentSources();job.completed_at=new Date().toISOString();job.duration_ms=Date.now()-Date.parse(started);
    fs.writeFileSync(prefix+'.json',JSON.stringify(job,null,2)+'\n',{flag:'wx'});
    fs.writeFileSync(prefix+'.job.json',JSON.stringify(job,null,2)+'\n');
    event('two_builds_complete_no_guest_execution',{duration_ms:job.duration_ms});
})().catch(error=>{
    job.stage='normal_build_failed_preserved_no_retry';job.completed_at=new Date().toISOString();
    job.error={name:error.name,message:error.message};
    try{if(measured)job.sources_after=currentSources();}catch(e){job.source_error=e.message;}
    fs.writeFileSync(prefix+'.json',JSON.stringify(job,null,2)+'\n',{flag:'wx'});
    fs.writeFileSync(prefix+'.job.json',JSON.stringify(job,null,2)+'\n');
    console.error(error.stack);process.exitCode=1;
});
