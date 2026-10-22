'use strict';
// Mechanical trusted-native sequence accepted in b312 after confrontation.
// EXISTING measured launcher/initializer/original host.run; no new analyzer,
// engine, runtime, approval API or financial authority. No retry on failure.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),prefix=path.join(__dirname,'b4-02-two-internal-once-20261022');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>{const q=path.resolve(root,p);assert.ok(q.startsWith(root+path.sep));return fs.readFileSync(q);};
const fixed=(p,h)=>{const b=read(p);assert.equal(sha(b),h,p);return b;};
const common=Object.freeze({candidate:'b312af728603972acf60daa72406342c2e43240e',
    review:'ed3c4511c61afae59e7c06742f9bf951beec4dc8fe1535d548cab69a347074bd',
    receipt:'bc0bcc7e61a84c7103682f6dc27771aede1771f4ee7dd10f06679013e0bc95bc',
    node:'39d45b5933f339d3ebdebd76474893dab5d7da1038920f65cf5bbcf0f20f3636',
    tcb:'34f059dfdaafc4b7d479109978c444e7bd9335d93dc95349ec4e5bb3e5f7ffff',
    wide:'42e6126d4c3f321534d72b7584951d9d4aa6a6c794e889618d9934589f35a866',
    sources:'183ba87724616c2226e7b1893fb8c3b5fa978631b116d99d23307ec9e782a6d7'});
// FIXED externally adopted values, not derived from the admission inputs.
const specs=Object.freeze([{id:'0140',row:140,
    freeze:'97657f66b47299567d209b027dbed9c055544c00334db6b650b49236edcdcf90',
    ticketRaw:'5ff428af9b5b7c92bc45b329118b259b10d9583e83340a81ca4d1ccbe4eb7ecd',
    ticketCommitment:'sha256:2d8dbcf186c1d85508cbff1744463c53e05636a654dd24c7a9017c038e7dc1af',
    payload:'fcba5de1ad051713d2fd66d18fca282d819455d89edd596dc25731d9c846a74f',
    snapshot:'e9f0c631ca3e5d81d2e7684fb78f5841cb52128cd9b69fae8e3d5498ba35a230',
    invocation:'d9265afc-32d8-4bda-8d86-025de326d09c',
    selected:'sha256:da807ac2dd3aee6e659d1cd2c2738ebb4c6435c9fe619e307e5d851e34769140',
    reference:'sha256:7b7901b739093df72cd009e2681bd957177a1dac2d537e8f62fc3da9a8030862'},
    {id:'1952',row:1952,
    freeze:'b38abc7fdebb12857a22732fd20fc5aea72ee2aef485c5b133afe046629c28ed',
    ticketRaw:'ecc5004ac01f1c5245191671bd2f5cbbeeec2900837d75ff5faa0006cb5a77f2',
    ticketCommitment:'sha256:964c6ffa0949ad1b934f6388177c2595561b5d5596cc29d220350eee5db8efe9',
    payload:'e06cd915fd2ae53681599ea5e2e39e04fb21de91272c144f2be72f70cf8c9ac5',
    snapshot:'159761e1b317bf95da0440a0c38681937763e1805db908eaaa46fb556eeeeedc',
    invocation:'16913c85-bc39-4579-88af-0c7065dc5425',
    selected:'sha256:bd4c55473e0c5edb39c722625fb4a0e3d4849621d254891788fb3a820ba348b0',
    reference:'sha256:0a1e6ea345a0b27e8f3ff9c175d51e62c6c12e30909f792df64b36e18bcaf775'}]);
const leafHashes=Object.freeze({
    'child-bootstrap.js':'97413ddff2e9fd8a1c5368a96aed2a3000401476da2ce9b795631958dc8c0a92',
    'host-bootstrap.js':'3763ef424087217f14dfd7903d7f8b3bd6919448d4d51f682320fcdea1cddd35',
    'launcher-bootstrap.js':'2f8a10d658d5748cdbcdbbad79abb4dd29c3364816d6f4504e219682429e4119',
    'recipe.json':'59b8281975ffa4fd9981d4e270aad0e4a9d4b2ca2ffce5b1f9660103d26bd401'});
assert.equal(fs.existsSync(prefix+'.json'),false,'do_not_repeat_batch');
for(const s of specs){
    assert.equal(fs.existsSync(prefix+'-'+s.id+'.started.json'),false,'do_not_repeat_started_invocation');
    assert.equal(fs.existsSync(prefix+'-'+s.id+'.observations.json'),false,'do_not_repeat_completed_invocation');
}
const batch={stage:'two_fixed_reviewed_INTERNAL_invocations_preparing',started_at:new Date().toISOString(),
    candidate:common.candidate,independent_review_sha256:common.review,confronted_receipt_sha256:common.receipt,
    fixed_target_roster:specs.map(s=>({row:s.row,invocation_id:s.invocation,candidate_id:s.selected})),
    completed:[],qualified:false,semantic_mutation_credit:0,financial_acceptance:false,globalGO:false,NEXT03:false};
let current=null,measured;
const event=(stage,row)=>console.log(JSON.stringify({stage,row,at:new Date().toISOString()}));
function sources(){const mismatches=measured.files.filter(r=>sha(read(r.path))!==r.sha256).map(r=>r.path);
    assert.deepEqual(mismatches,[]);return{count:895,sha256:common.sources,mismatches};}
function saveCurrent(){current.completed_at=new Date().toISOString();current.duration_ms=Date.now()-Date.parse(current.started_at);
    const bytes=JSON.stringify(current,null,2)+'\n';
    fs.writeFileSync(prefix+'-'+current.original_row_id+'.observations.json',bytes,{flag:'wx'});
    return{file:path.basename(prefix+'-'+current.original_row_id+'.observations.json'),bytes:Buffer.byteLength(bytes),sha256:sha(bytes),
        row:current.original_row_index,invocation_id:current.fixed_input_measurements_before_evaluation?.invocation_id,
        candidate_id:current.fixed_input_measurements_before_evaluation?.selected_candidate_id,
        duration_ms:current.duration_ms,runtime_guest_run:current.runtime_guest_run};}
(async()=>{
    assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');assert.equal(process.version,'v22.17.0');
    fixed('.codex-temp/b4-02-b312-final-provisioning-review-confronted-20261022.md',common.receipt);
    const wide=JSON.parse(fixed('.codex-temp/b4-02-path-v3-final-wide-20261019.json',common.wide));
    measured=wide.measured_sources_after;assert.equal(measured.files.length,895);
    assert.equal(measured.sha256,common.sources);assert.equal(sha(JSON.stringify(measured.files)),common.sources);
    batch.sources_before=sources();
    for(const s of specs){
        current={format:'financasbot.path-v3.normal-internal-observations-local',version:1,
            original_row_id:s.id,original_row_index:s.row,candidate:common.candidate,
            independent_review_sha256:common.review,confronted_review_receipt_sha256:common.receipt,
            started_at:new Date().toISOString(),stage:'measuring_fixed_inputs_before_first_TCB_evaluation',
            external_platform_trust_assumed_not_certified:true,expected_freeze_hash:'sha256:'+s.freeze,
            expected_ticket_commitment:s.ticketCommitment,tcb_evaluation_started:false,launcher_called:false,
            initializer_called:false,guest_execution_attempted:false,runtime_guest_run:false,
            qualified:false,semantic_mutation_credit:0,financial_acceptance:false,globalGO:false,NEXT03:false};
        assert.equal(sha(fs.readFileSync(process.execPath)),common.node,'official_native_binary_before_use');
        current.native_runtime_before={platform:process.platform,arch:process.arch,version:process.version,
            sha256:common.node,publisher_source:'https://nodejs.org/dist/v22.17.0/SHASUMS256.txt'};
        current.sources_before=sources();
        const cap='.codex-temp/path-v3-complete-capture-ac08-20261015-bytes/';
        fixed('.codex-temp/b4-02-S01-remaining47-reference-20261021/'+s.id+'.snapshot.json',s.snapshot);
        const data='.codex-temp/b4-02-two-witness-provisioning-20261022/'+s.id+'/';
        const freezeBytes=fixed(data+'proposed-execution-freeze.json',s.freeze);
        const ticketBytes=fixed(data+'execution-ticket.json',s.ticketRaw),payloadBytes=fixed(data+'execution-payload.json',s.payload);
        const ticket=JSON.parse(ticketBytes.toString('utf8'));
        assert.equal(ticket.invocation_id,s.invocation);assert.equal(ticket.candidate_id,s.selected);
        assert.equal(ticket.reference_commitment,s.reference);assert.equal(ticket.worlds.map(w=>w.variant).join(','),'C,M,S');
        assert.ok(Object.values(ticket.prerequisites).every(v=>v===true));
        const manifestBytes=fixed(cap+'validation-tcb-manifest.json',common.tcb),manifest=JSON.parse(manifestBytes.toString('utf8'));
        assert.equal(manifest.entry,'launcher-bootstrap.js');assert.deepEqual(manifest.files.map(r=>r.path),Object.keys(leafHashes));
        const entries=Object.keys(leafHashes).map(name=>{const bytes=fixed(cap+name,leafHashes[name]);
            assert.equal(manifest.files.find(r=>r.path===name).sha256,'sha256:'+leafHashes[name]);return{path:name,bytes};});
        const nativeNames=['node:child_process','node:crypto','node:fs','node:path','node:process','node:util','node:vm'];
        const recipe=JSON.parse(entries.find(r=>r.path==='recipe.json').bytes.toString('utf8'));
        assert.deepEqual(recipe.launcher_native_externals,nativeNames);
        current.fixed_input_measurements_before_evaluation={freeze_sha256:s.freeze,ticket_sha256:s.ticketRaw,payload_sha256:s.payload,
            tcb_manifest_sha256:common.tcb,all_four_leaf_sha256:leafHashes,first_leaf_measured_before_evaluation:true,
            snapshot_sha256:s.snapshot,selected_candidate_id:s.selected,invocation_id:s.invocation,normal_prerequisites:ticket.prerequisites};
        fs.writeFileSync(prefix+'-'+s.id+'.started.json',JSON.stringify({candidate:common.candidate,
            original_row_index:s.row,invocation_id:s.invocation,started_at:current.started_at,
            review_sha256:common.review,no_automatic_retry:true,local_oneuse_not_global_ledger:true})+'\n',{flag:'wx'});
        event('all_fixed_pins_and_first_leaf_measured_before_TCB_evaluation',s.row);
        const allowed=new Set(nativeNames),requireNative=name=>{assert.ok(allowed.has(name),'undeclared_native_import');return require(name);};
        const launcherSource=entries.find(r=>r.path==='launcher-bootstrap.js').bytes.toString('utf8');
        current.tcb_evaluation_started=true;
        const launch=vm.runInThisContext(`(function(require){return ${launcherSource}\n})`,
            {filename:'reviewed-measured-launcher-bootstrap.js'})(requireNative);
        assert.equal(typeof launch,'function');current.launcher_called=true;
        const loaded=launch({freezeBytes:Buffer.from(freezeBytes),expectedFreezeHash:'sha256:'+s.freeze,
            tcbArtifact:{manifestBytes:Buffer.from(manifestBytes),entries:entries.map(r=>({path:r.path,bytes:Buffer.from(r.bytes)}))},
            qualification:{ticketSource:ticketBytes.toString('utf8'),payloadSource:payloadBytes.toString('utf8'),
                expectedTicketCommitment:s.ticketCommitment}});
        assert.equal(loaded.stage,'captured_tcb_path_qualification_loaded_only');
        current.initializer_called=true;const host=loaded.initializePathQualification();
        assert.equal(host.stage,'captured_path_qualification_prepared_only');assert.equal(host.candidate_id,s.selected);
        assert.equal(host.invocation_id,s.invocation);assert.equal(host.ticket_commitment,s.ticketCommitment);
        assert.equal(host.reference_commitment,s.reference);
        current.initialization_receipt={stage:host.stage,candidate_id:host.candidate_id,invocation_id:host.invocation_id,
            ticket_commitment:host.ticket_commitment,reference_commitment:host.reference_commitment,
            execution_permitted:host.execution_permitted,qualified:host.qualified,semantic_mutation_credit:host.semantic_mutation_credit};
        event('original_initializer_admitted_fixed_reviewed_transport_before_run',s.row);
        current.guest_execution_attempted=true;
        const observed=await host.run();
        // Store full actual observations before any later check; no new M/retry.
        current.observations=observed;current.runtime_guest_run=true;
        assert.equal(observed.stage,'captured_path_normal_observations_not_qualification');
        assert.equal(observed.candidate_id,s.selected);assert.equal(observed.invocation_id,s.invocation);
        assert.equal(observed.reference_commitment,s.reference);assert.equal(observed.observations.map(r=>r.variant).join(','),'C,M,S');
        assert.equal(observed.qualified,false);assert.equal(observed.semantic_mutation_credit,0);
        current.sources_after=sources();
        assert.equal(sha(read('.codex-temp/b4-02-S01-remaining47-reference-20261021/'+s.id+'.snapshot.json')),s.snapshot);
        assert.equal(sha(fs.readFileSync(process.execPath)),common.node);
        current.stage='actual_normal_INTERNAL_observations_pending_qualification_not_financial_authority';
        batch.completed.push(saveCurrent());current=null;
        event('one_original_run_completed_observations_written_no_qualification',s.row);
    }
    batch.stage='two_actual_normal_INTERNAL_invocations_completed_pending_qualification';
    batch.completed_at=new Date().toISOString();batch.duration_ms=Date.now()-Date.parse(batch.started_at);
    batch.sources_after=sources();fs.writeFileSync(prefix+'.json',JSON.stringify(batch,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify(batch));
})().catch(error=>{
    batch.stage='normal_INTERNAL_attempt_stopped_no_retry';batch.completed_at=new Date().toISOString();
    batch.error={name:error.name,message:error.message};
    if(current){current.stage='normal_INTERNAL_attempt_stopped_no_retry';current.error=batch.error;
        if(current.guest_execution_attempted&&!current.observations)current.runtime_guest_run=null;
        try{if(measured)current.sources_after=sources();}catch(e){current.source_verification_error=e.message;}
        batch.stopped_target=saveCurrent();}
    fs.writeFileSync(prefix+'.json',JSON.stringify(batch,null,2)+'\n',{flag:'wx'});
    console.error(error.stack);process.exitCode=1;
});
