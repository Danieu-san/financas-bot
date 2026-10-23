'use strict';
// Mechanical reuse of existing PATH-V3-088 snapshot construction for a FIXED
// roster of original S01 rows. Not a new rule/reference/JS engine or approval.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const dir=path.join(__dirname,'b4-02-S01-remaining47-reference-20261021');
const job=dir+'.job.json',reportPath=dir+'.json';
for(const p of [dir,job,reportPath])assert.equal(fs.existsSync(p),false,'already_started');
assert.equal(process.version,'v22.17.0');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const tagged=b=>'sha256:'+sha(b);
const read=p=>fs.readFileSync(path.join(root,p));
const imp=p=>import(pathToFileURL(path.join(root,p)).href);
const fixed=(p,h)=>{const b=read(p);assert.equal(sha(b),h,p);return b;};
const ledger=JSON.parse(fixed('.codex-temp/b4-02-pathv3-static11-qualified-ledger-20261021.json',
 '2b9f20c906cad0a9a098de34e194d0369304d74dfe5f2d1fe74692eb36e10ba8'));
assert.equal(ledger.verified_predicates,12);assert.equal(ledger.blocked,2407);
const roster=ledger.rows.map((row,row_index)=>({row,row_index}))
 .filter(x=>x.row.target.fact_key==='S-01#1#1'&&x.row.status==='blocked')
 .map(x=>({row_index:x.row_index,target_id:x.row.target_id,qualification_id:x.row.qualification_id,
 target:x.row.target,sites:x.row.sites.map((s,site_index)=>({site_index,authored_site:s.authored_site,
 domain:s.domain,domain_complete:s.domain_complete}))}));
assert.equal(roster.length,47);
const wide=JSON.parse(fixed('.codex-temp/b4-02-path-v3-final-wide-20261019.json',
 '42e6126d4c3f321534d72b7584951d9d4aa6a6c794e889618d9934589f35a866'));
const sources=wide.measured_sources_after;
assert.equal(sources.files.length,895);
assert.equal(sha(JSON.stringify(sources.files)),'183ba87724616c2226e7b1893fb8c3b5fa978631b116d99d23307ec9e782a6d7');
function measure(){const mismatches=sources.files.filter(f=>sha(read(f.path))!==f.sha256).map(f=>f.path);
 assert.deepEqual(mismatches,[]);return {count:895,sha256:sources.sha256,mismatches};}
const before=measure(),started=new Date().toISOString();
fs.mkdirSync(dir);
const rosterBytes=JSON.stringify({stage:'fixed47_original_S01_rows_before_first_new_materialization',
 predecessor_sha256:'2b9f20c906cad0a9a098de34e194d0369304d74dfe5f2d1fe74692eb36e10ba8',
 rows:roster,qualified:false,new_semantic_credit:0},null,2)+'\n';
fs.writeFileSync(path.join(dir,'roster.json'),rosterBytes,{flag:'wx'});
fs.writeFileSync(job,JSON.stringify({stage:'precompile_reference_preparation_running',started_at:started,
 rows:47,roster_sha256:sha(rosterBytes),no_guest_or_selected_normal_compile:true})+'\n',{flag:'wx'});
(async()=>{
 const {loadLocalAuthoringPackage}=await imp('scripts/agent/executeNextDomainInvariantMatrix.mjs');
 const {buildAdmittedSchemaValidators}=await imp('scripts/agent/buildNextProvenanceArtifacts.mjs');
 const {compileAuthoringIR}=require('../src/next/provenance/graphCompiler');
 const {canonicalValue}=require('../src/next/kernel/canonicalValue');
 const {admittedDocuments}=require('../src/next/provenance/packageContract');
 const {admitPhaseCompositionProfile,PROFILE_PATH}=require('../src/next/provenance/phaseCompositionProfile');
 const api=require('../src/next/provenance/pathQualificationV3');
 const compiler=await imp('scripts/agent/capturePathQualificationCompiler.mjs');
 const contract=await imp('scripts/agent/pathProofProgramContract.mjs');
 const packageReceipt=loadLocalAuthoringPackage();
 const ir=compileAuthoringIR(packageReceipt,buildAdmittedSchemaValidators(packageReceipt).validators);
 const preparation=api.preparePathQualificationInventory({packageReceipt,ir});
 const registry=admittedDocuments(packageReceipt).find(r=>r.value?.registry_id==='metric_evaluator_registry').value;
 const phaseProfile=admitPhaseCompositionProfile({source:read(PROFILE_PATH).toString('utf8'),registry});
 const capture=compiler.capturePathQualificationCompiler();
 assert.equal(capture.artifact_root,'sha256:2281d7efd3b6627fe4679427b908b06ad29ea6e75cfea66aca3c387019bed151');
 const producers=['src/next/provenance/pathQualificationV3.js','src/next/provenance/pathLocatorDomainV3.js',
 'src/next/provenance/pathMutationInventory.js','src/next/provenance/pathSemanticReference.js',
 'scripts/agent/capturePathQualificationCompiler.mjs','scripts/agent/pathProofProgramContract.mjs',
 'scripts/agent/pathExecutableClosureContract.mjs','scripts/agent/pathCapabilityEffectContract.mjs',
 'scripts/agent/pathReceiverOriginContract.mjs'];
 const rows=[];
 for(const original of roster){
  const row=preparation.rows[original.row_index];
  assert.equal(row.target_id,original.target_id);assert.equal(row.qualification_id,original.qualification_id);
  const plan=api.preparePathQualificationWitnessPreselection({preparation,rowIndex:original.row_index});
  assert.equal(plan.qualified,false);assert.equal(plan.semantic_mutation_credit,0);
  const name=String(original.row_index).padStart(4,'0');
  const planBytes=JSON.stringify(plan,null,2)+'\n';
  fs.writeFileSync(path.join(dir,name+'.plan.json'),planBytes,{flag:'wx'});
  const summary={row_index:original.row_index,target_id:original.target_id,qualification_id:original.qualification_id,
   predicate_id:original.target.predicate_id,status:plan.status,selected:plan.selected,
   conditional_partition_complete:plan.conditional_domain_partition.conditional_witness_partition_complete,
   entries:plan.entries.length,classes:{},plan_path:name+'.plan.json',plan_bytes:Buffer.byteLength(planBytes),
   plan_sha256:sha(planBytes),snapshot:null,qualified:false,semantic_mutation_credit:0,dp_execution:false};
  for(const entry of plan.conditional_domain_partition.entries)
   summary.classes[entry.classification]=(summary.classes[entry.classification]||0)+1;
  if(plan.selected){
   // Exact existing088 producer: shadow supplies authorial program inputs only.
   // No compilePathQualificationWitnessPreselection or execution transport here.
   const shadow=api.materializePathQualificationLocator({preparation,rowIndex:original.row_index,
    siteIndex:plan.selected.site_index,locatorIndex:plan.selected.locator_index});
   const expectation=contract.sealPathCandidateProgramExpectation({
    authorship:api.preparePathCandidateProgramAuthorship({candidate:shadow,phaseProfile})});
   const stableEntries=plan.entries.map(entry=>{
    const {invocation_id,...stable}=entry;
    if(stable.reference!==null){const {invocation_id:ignored,...reference}=stable.reference;stable.reference=reference;}
    return stable;
   });
   const stablePartition={...plan.conditional_domain_partition,
    entries:plan.conditional_domain_partition.entries.map(member=>({...member,
     reference_sha256:stableEntries[member.entry_index].reference===null?null:
      tagged(canonicalValue(stableEntries[member.entry_index].reference))}))};
   const perSite=plan.admission_foundation.sites.map(site=>{
    const members=stablePartition.entries.filter(member=>member.site_index===site.site_index);
    return {site_index:site.site_index,L:members.map(member=>member.locator_index),
     A:members.filter(member=>['conditional_witness','conditional_non_witness'].includes(member.classification)).map(member=>member.locator_index),
     W:members.filter(member=>member.classification==='conditional_witness').map(member=>member.locator_index),
     excluded:members.filter(member=>member.classification==='necessary_exclusion_pending_native_barrier').map(member=>member.locator_index)};
   });
   const snapshotReference={...expectation.normal_admission_checker_reference};
   for(const key of ['sources','schema_reference_sources'])snapshotReference[key]=snapshotReference[key].map(r=>{
    const {source,...metadata}=r;
    const source_chunks=Array.from({length:Math.ceil(source.length/65536)},(_,i)=>source.slice(i*65536,(i+1)*65536));
    assert.equal(source_chunks.join(''),source);assert.equal(tagged(source_chunks.join('')),r.sha256);
    return {...metadata,source_chunks};
   });
   const core={method_authority:plan.method_authority,target_id:plan.target_id,target:shadow.target,
    baseline_package:plan.baseline_package,phase_profile_sha256:expectation.profile_sha256,
    compiler:{artifact_root:capture.artifact_root,host_sources_sha256:capture.normal_compiler_source_bindings_sha256,
     child_sources_sha256:capture.normal_child_source_bindings_sha256},
    authority_builder_sources:producers.map(p=>({path:p,sha256:tagged(read(p))})),
    normal_rule_reference:snapshotReference,entries:stableEntries,conditional_partition:stablePartition,
    per_site_domains:perSite,native_control_plans:{unknown:plan.site_admission_control_plan,selection:plan.selection_admission_control_plan},
    scope:'finite_target_normal_admission_and_independent_witness_not_equivalence',
    qualified:false,semantic_mutation_credit:0,dp_execution:false,financial_acceptance:false};
   const snapshot={format:'financasbot.path-normal-rule-review-snapshot',version:1,
    stage:'path_v3_normal_rule_review_snapshot_only',core};
   const snapshotSource=canonicalValue(snapshot);
   assert.ok(snapshotSource.length<=1048576,'existing_snapshot_quota');
   fs.writeFileSync(path.join(dir,name+'.snapshot.json'),snapshotSource,{flag:'wx'});
   summary.snapshot={path:name+'.snapshot.json',bytes:Buffer.byteLength(snapshotSource),sha256:sha(snapshotSource),
    conditional_site_sizes:perSite.map(s=>({site:s.site_index,L:s.L.length,A:s.A.length,W:s.W.length,excluded:s.excluded.length})),
    pending_independent_review:true};
  }
  rows.push(summary);
  console.log(JSON.stringify({prepared:rows.length,of:47,row_index:original.row_index,status:summary.status,
   snapshot:summary.snapshot!==null,elapsed_ms:Date.now()-Date.parse(started)}));
 }
 const result={stage:'all47_precompile_references_prepared_not_reviewed_or_qualified',
  started_at:started,completed_at:new Date().toISOString(),duration_ms:Date.now()-Date.parse(started),
  source_before:before,source_after:measure(),roster_sha256:sha(rosterBytes),rows,
  snapshots:rows.filter(r=>r.snapshot).length,blocked_without_selected:rows.filter(r=>!r.selected).length,
  no_selected_normal_compile:true,no_guest_execution:true,no_execution_ticket_issued:true,
  existing_compiler_root:capture.artifact_root,old_snapshot_646_unchanged:
   sha(read('.codex-temp/path-v3-complete-capture-ac08-20261015-bytes/normal-rule-review-snapshot.json'))===
    'ada954eb15be38339401ec99ee552b46532ae21d7290b25bde31765c3072e4a6',
  qualified:false,semantic_mutation_credit:0,globalGO:false,NEXT03:false};
 assert.equal(result.old_snapshot_646_unchanged,true);
 const bytes=JSON.stringify(result,null,2)+'\n';
 fs.writeFileSync(reportPath,bytes,{flag:'wx'});
 fs.writeFileSync(job,JSON.stringify({stage:result.stage,started_at:started,completed_at:result.completed_at,
  rows:47,snapshots:result.snapshots,blocked_without_selected:result.blocked_without_selected,
  report_bytes:Buffer.byteLength(bytes),report_sha256:sha(bytes),new_semantic_credit:0},null,2)+'\n');
 console.log(JSON.stringify({stage:result.stage,rows:47,snapshots:result.snapshots,
  blocked_without_selected:result.blocked_without_selected,report_sha256:sha(bytes),
  duration_ms:result.duration_ms,source_mismatches:result.source_after.mismatches}));
})().catch(error=>{fs.writeFileSync(job,JSON.stringify({stage:'stopped_at_real_boundary_no_retry',
 started_at:started,failed_at:new Date().toISOString(),error:String(error.message),
 no_guest_execution:true,qualified:false,semantic_mutation_credit:0},null,2)+'\n');
 console.error(String(error.stack));process.exitCode=1;});

