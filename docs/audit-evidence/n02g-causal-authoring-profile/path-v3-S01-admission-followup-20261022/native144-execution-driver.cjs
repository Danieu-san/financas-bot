'use strict';
// Mechanical existing-API batch. No rule engine, guest, qualification or source mutation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),prefix=path.join(__dirname,'b4-02-S01-empty-A-native-controls-20261022');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(path.join(root,p));
const imp=p=>import(pathToFileURL(path.join(root,p)).href);
const fixed=(p,h)=>{const b=read(p);assert.equal(sha(b),h,p);return b;};
const indices=Object.freeze([64,533,668,836,883,1617,1950,2116,2211,2304,2357]);
for(const s of ['.job.json','.roster.json','.rows.jsonl','.json'])assert.equal(fs.existsSync(prefix+s),false,'already_started');
assert.equal(process.version,'v22.17.0');
const ledger=JSON.parse(fixed('.codex-temp/b4-02-pathv3-static11-qualified-ledger-20261021.json',
 '2b9f20c906cad0a9a098de34e194d0369304d74dfe5f2d1fe74692eb36e10ba8'));
const reference=JSON.parse(fixed('.codex-temp/b4-02-S01-remaining47-reference-20261021.json',
 'c6a905bbb09b3d7c3eaff976bebf5ede2f8470914fdf06d39873c904e4440c0a'));
assert.equal(reference.rows.length,47);
const wide=JSON.parse(fixed('.codex-temp/b4-02-path-v3-final-wide-20261019.json',
 '42e6126d4c3f321534d72b7584951d9d4aa6a6c794e889618d9934589f35a866'));
const sources=wide.measured_sources_after;
assert.equal(sources.files.length,895);
assert.equal(sha(JSON.stringify(sources.files)),'183ba87724616c2226e7b1893fb8c3b5fa978631b116d99d23307ec9e782a6d7');
function measure(){const mismatches=sources.files.filter(r=>sha(read(r.path))!==r.sha256).map(r=>r.path);
 assert.deepEqual(mismatches,[]);return {count:895,sha256:sources.sha256,mismatches};}
const before=measure(),started=new Date().toISOString();
fs.writeFileSync(prefix+'.job.json',JSON.stringify({stage:'preparing_fixed144_control_roster',
 started_at:started,rows:11,qualified:false,semantic_mutation_credit:0})+'\n',{flag:'wx'});
let completed=0,rosterHash=null,lastObservation=null;
(async()=>{
 const {loadLocalAuthoringPackage}=await imp('scripts/agent/executeNextDomainInvariantMatrix.mjs');
 const {buildAdmittedSchemaValidators}=await imp('scripts/agent/buildNextProvenanceArtifacts.mjs');
 const {compileAuthoringIR}=require('../src/next/provenance/graphCompiler');
 const api=require('../src/next/provenance/pathQualificationV3');
 const packageReceipt=loadLocalAuthoringPackage();
 const ir=compileAuthoringIR(packageReceipt,buildAdmittedSchemaValidators(packageReceipt).validators);
 const preparation=api.preparePathQualificationInventory({packageReceipt,ir});
 const plans=indices.map(rowIndex=>{
  const row=ledger.rows[rowIndex],old=reference.rows.find(r=>r.row_index===rowIndex);
  assert.equal(row.status,'blocked');assert.equal(row.target.fact_key,'S-01#1#1');
  assert.equal(old.target_id,row.target_id);assert.equal(old.selected,null);
  assert.equal(old.classes.necessary_exclusion_pending_native_barrier,old.entries);
  const plan=api.preparePathQualificationWitnessPreselection({preparation,rowIndex});
  assert.equal(plan.selected,null);assert.equal(plan.target_id,row.target_id);
  for(const site of plan.admission_foundation.sites){
   assert.equal(site.excluded.length,row.sites[site.site_index].domain.locators.length);
   assert.deepEqual(site.unclassified_locator_indices,[]);
   assert.deepEqual(site.admitted_locator_indices,[]);
  }
  assert.equal(plan.selection_admission_control_plan.admitted_domain_complete,true);
  return {rowIndex,row,plan};
 });
 const declarations=[];
 for(const item of plans){
  item.plan.site_admission_control_plan.controls.forEach((control,index)=>declarations.push({
   kind:'unknown_namespace',row_index:item.rowIndex,control_index:index,target_id:item.row.target_id,
   qualification_id:item.row.qualification_id,control}));
  item.plan.selection_admission_control_plan.controls.forEach((control,index)=>declarations.push({
   kind:'typed_selection_exclusion',row_index:item.rowIndex,control_index:index,target_id:item.row.target_id,
   qualification_id:item.row.qualification_id,control}));
 }
 assert.equal(declarations.length,144);
 assert.equal(declarations.filter(d=>d.kind==='typed_selection_exclusion').length,133);
 const roster={stage:'all144_native_controls_fixed_before_first_M',rows:11,sites:11,typed_exclusions:133,
  unknown_namespace_controls:11,controls:declarations,method_authority:plans[0].plan.method_authority,
  predecessor_ledger_sha256:'2b9f20c906cad0a9a098de34e194d0369304d74dfe5f2d1fe74692eb36e10ba8',
  reference47_sha256:'c6a905bbb09b3d7c3eaff976bebf5ede2f8470914fdf06d39873c904e4440c0a',
  source_before:before,qualified:false,semantic_mutation_credit:0,dp_execution:false};
 const rb=JSON.stringify(roster,null,2)+'\n';rosterHash=sha(rb);
 fs.writeFileSync(prefix+'.roster.json',rb,{flag:'wx'});
 fs.writeFileSync(prefix+'.rows.jsonl','',{flag:'wx'});
 fs.writeFileSync(prefix+'.job.json',JSON.stringify({stage:'fixed144_controls_running',
  started_at:started,rows:11,controls:144,roster_sha256:rosterHash,no_guest:true,new_credit:0})+'\n');
 const compiler=await imp('scripts/agent/capturePathQualificationCompiler.mjs');
 const capture=compiler.capturePathQualificationCompiler();
 assert.equal(capture.artifact_root,'sha256:2281d7efd3b6627fe4679427b908b06ad29ea6e75cfea66aca3c387019bed151');
 for(const declaration of declarations){
  const item=plans.find(p=>p.rowIndex===declaration.row_index);
  const candidate=declaration.kind==='unknown_namespace'
   ?api.materializePathStaticDomainControl({plan:item.plan.site_admission_control_plan,siteIndex:declaration.control_index})
   :api.materializePathSelectionAdmissionControl({plan:item.plan.selection_admission_control_plan,controlIndex:declaration.control_index});
  const tick=Date.now();
  const result=compiler.compilePathQualificationCandidate({capture,candidate});
  lastObservation={...declaration,invocation_id:candidate.invocation_id,candidate_id:candidate.candidate_id,
   duration_ms:Date.now()-tick,result};
  // Preserve the raw observation BEFORE checking a contradiction.
  fs.appendFileSync(prefix+'.rows.jsonl',JSON.stringify(lastObservation)+'\n');
  assert.equal(result.target_id,declaration.target_id);
  assert.equal(result.native_control_matched,true,'precommitted_native_rule_or_coordinate_contradiction');
  assert.equal(result.handle_attempts,0);assert.equal(result.dp_execution,false);
  assert.equal(result.qualified,false);assert.equal(result.semantic_mutation_credit,0);
  assert.deepEqual(result.worlds.map(w=>w.admitted),[true,false,true]);
  assert.equal(result.worlds[1].ir_sha256,null);
  assert.equal(result.worlds[0].ir_sha256,result.worlds[2].ir_sha256);
  completed++;
  if(completed===1||completed%10===0)console.log(JSON.stringify({completed,of:144,
   row_index:declaration.row_index,kind:declaration.kind,elapsed_ms:Date.now()-Date.parse(started)}));
 }
 const raw=fs.readFileSync(prefix+'.rows.jsonl');
 const result={stage:'all144_native_controls_completed_not_static_qualification',started_at:started,
  completed_at:new Date().toISOString(),duration_ms:Date.now()-Date.parse(started),controls:completed,
  rows:11,typed_exclusions:133,unknown_namespace_controls:11,roster_sha256:rosterHash,
  raw_bytes:raw.length,raw_sha256:sha(raw),source_before:before,source_after:measure(),
  runtime_guest_run:false,qualified:false,semantic_mutation_credit:0,globalGO:false,NEXT03:false};
 fs.writeFileSync(prefix+'.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 fs.writeFileSync(prefix+'.job.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
})().catch(error=>{
 let source_after;try{source_after=measure();}catch(e){source_after={error:String(e.message)};}
 const failure={stage:'stopped_at_first_contradiction_or_real_boundary_no_retry',started_at:started,
  failed_at:new Date().toISOString(),completed_controls:completed,roster_sha256:rosterHash,
  error:String(error.message),last_observation_retained:!!lastObservation,source_after,
  runtime_guest_run:false,qualified:false,semantic_mutation_credit:0,globalGO:false,NEXT03:false};
 fs.writeFileSync(prefix+'.job.json',JSON.stringify(failure,null,2)+'\n');
 console.error(JSON.stringify(failure));process.exitCode=1;
});

