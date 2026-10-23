'use strict';
// Mechanical audit packaging only. Reuses the existing tested pre-M capture;
// no runtime helper, new semantic model, guest execution or credit.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),prefix=path.join(__dirname,'path-v3-complete-capture-ac08-20261015');
const directory=prefix+'-bytes';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const blob=b=>crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');
const testFile=path.join(root,'tests/next/provenance/pathQualificationV3.cases.js');
const affectedRunner=path.join(__dirname,'ac08-schema-integration-affected-20261015.cjs');
function inputs(){
 const declarations=fs.readFileSync(affectedRunner,'utf8').split('if (process.version')[0];
 const {measured}=Function('require','__dirname',declarations+';return {measured};')(require,__dirname);
 const files=new Set();
 function visit(p){const full=path.join(root,p),s=fs.lstatSync(full);if(s.isSymbolicLink())throw Error('input_symlink');
  if(s.isDirectory())fs.readdirSync(full).sort().forEach(n=>visit(path.join(p,n)));
  else if(s.isFile())files.add(p.replaceAll('\\','/'));else throw Error('input_non_file');}
 measured.forEach(visit);return [...files].sort();
}
function measure(files){return files.map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(root,p)))}));}
async function main(){
 if(process.version!=='v22.17.0')throw Error('pinned_node');
 for(const p of [prefix+'.job.json',prefix+'.json',directory])if(fs.existsSync(p))throw Error('duplicate_no_retry');
 const before=measure(inputs()),started_at=new Date().toISOString();
 fs.writeFileSync(prefix+'.job.json',JSON.stringify({state:'audit_reference_capture_construction_running',pid:process.pid,started_at,node:process.version,
  sources_count:before.length,sources_sha256:sha(JSON.stringify(before)),guest_execution:false,credit:0})+'\n',{flag:'wx'});
 fs.mkdirSync(directory);
 try{
  const testSource=fs.readFileSync(testFile,'utf8');
  const marker="test('N02G:PATH-V3-088 ";
  const offset=testSource.indexOf(marker),start=testSource.indexOf('    const api =',offset),
   end=testSource.indexOf('    const secondPreparation =',start);
  if(offset<0||start<0||end<0)throw Error('existing_capture_body_missing');
  const body=testSource.slice(start,end).replaceAll("../../../scripts/","../scripts/");
  const harness=[
   "async function fixture(){",
   "const {loadLocalAuthoringPackage}=await import('../scripts/agent/executeNextDomainInvariantMatrix.mjs');",
   "const {buildAdmittedSchemaValidators}=await import('../scripts/agent/buildNextProvenanceArtifacts.mjs');",
   "const packageReceipt=loadLocalAuthoringPackage();",
   "return {packageReceipt,ir:require('../../../src/next/provenance/graphCompiler').compileAuthoringIR(packageReceipt,buildAdmittedSchemaValidators(packageReceipt).validators)};}",
   "async function phaseFixture(){const input=await fixture();",
   "const {admittedDocuments}=require('../../../src/next/provenance/packageContract');",
   "const {admitPhaseCompositionProfile,PROFILE_PATH}=require('../../../src/next/provenance/phaseCompositionProfile');",
   "const registry=admittedDocuments(input.packageReceipt).find(row=>row.value?.registry_id==='metric_evaluator_registry').value;",
   "return admitPhaseCompositionProfile({source:require('node:fs').readFileSync(require('node:path').resolve(__dirname,'../../..',PROFILE_PATH),'utf8'),registry});}"
  ].join('\n');
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const captured=await new AsyncFunction('require','__dirname','assert',harness+body+
    ';return {snapshotSource,capture,phaseProfile,core};')(createRequire(testFile),path.dirname(testFile),require('node:assert/strict'));
  const {canonicalValue}=require('../src/next/kernel/canonicalValue');
  const {buildCapturedValidationTools}=await import('../scripts/agent/buildNextValidationTcb.mjs');
  const built=buildCapturedValidationTools();
  const source='(function(require){const tools='+built.source+
   ';return Object.freeze({admitPackage:tools.admitPackage,compileAuthoringIR:tools.compileAuthoringIR,'+
   'compileSnapshotAccess:tools.compileSnapshotAccess,readNativePathDiagnostic:tools.readNativePathDiagnostic,'+
   'admitPhaseCompositionProfile:tools.admitPhaseCompositionProfile});})';
  const recipe=built.entries.find(e=>e.path==='recipe.json').source;
  const entries=[{path:'path-qualification-compiler.js',source},{path:'path-qualification-compiler-recipe.json',source:recipe}].sort((a,b)=>a.path.localeCompare(b.path));
  const manifest=canonicalValue({format:'financasbot.provenance.artifact',version:1,kind:'tcb',entry:'path-qualification-compiler.js',
   files:entries.map(e=>({path:e.path,media_type:e.path.endsWith('.json')?'application/json':'text/javascript',sha256:'sha256:'+sha(e.source)}))});
  if('sha256:'+sha(manifest)!==captured.capture.artifact_root)throw Error('compiler_capture_root_mismatch');
  const emit=(name,source)=>{const bytes=Buffer.from(source,'utf8');fs.writeFileSync(path.join(directory,name),bytes,{flag:'wx'});
   return {path:name,bytes:bytes.length,sha256:sha(bytes),git_blob_sha1:blob(bytes),byte_policy:'exact_UTF8_no_EOL_conversion'};};
  const artifacts=[emit('normal-rule-review-snapshot.json',captured.snapshotSource),emit('compiler-manifest.json',manifest),
   ...entries.map(e=>emit(e.path,e.source)),emit('validation-tcb-manifest.json',built.manifest),
   ...built.entries.map(e=>emit(e.path,e.source))];
  const {captureSelectedEventDayBuildRecipe}=await import('../scripts/agent/captureSelectedEventDayBuildRecipe.mjs');
  const shared=captureSelectedEventDayBuildRecipe();
  // Reused source inventory only; no selected-day profile authority is imported.
  const paths=[...new Set([...before.map(e=>e.path),...shared.sources.map(e=>e.path)])].sort();
  const parent=JSON.parse(fs.readFileSync(path.join(__dirname,'path-v3-parent-tree-72fc5a5-20261012.json'),'utf8'));
  if(parent.sha!=='a04659822308d62a86f4be919b08d2676ec7e218'||parent.truncated)throw Error('parent_tree');
  const parentBlobs=new Map(parent.tree.filter(e=>e.type==='blob').map(e=>[e.path,e.sha]));
  const sources=paths.map(p=>{
   const bytes=fs.readFileSync(path.join(root,p)),text=bytes.toString('utf8');
   if(!Buffer.from(text,'utf8').equals(bytes)||text.includes('\0'))throw Error('non_utf8_or_binary_input');
   if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}/.test(text))throw Error('sensitive_source_input');
   const raw=blob(bytes),lf=blob(Buffer.from(text.replace(/\r\n/g,'\n')));
   return {path:p,bytes:bytes.length,sha256:sha(bytes),raw_git_blob_sha1:raw,lf_git_blob_sha1:lf,
    parent_blob:parentBlobs.get(p)||null,parent_raw_identical:raw===parentBlobs.get(p),
    parent_lf_identical:lf===parentBlobs.get(p),external_vendor:p.startsWith('node_modules/')};
  });
  const after=measure(inputs());if(JSON.stringify(before)!==JSON.stringify(after))throw Error('capture_source_drift');
  for(const s of shared.sources)if(s.sha256!=='sha256:'+sources.find(row=>row.path===s.path).sha256)throw Error('shared_inventory_drift');
  const metadata={stage:'path_v3_complete_audit_capture_construction_only',started_at,completed_at:new Date().toISOString(),node:process.version,
   parent:'72fc5a5b707909687da9b5cec892be2dcc892a62',parent_tree:parent.sha,
   target:captured.core.target,method_authority:captured.core.method_authority,
   snapshot_sha256:sha(captured.snapshotSource),compiler_artifact_root:captured.capture.artifact_root,validation_tcb_artifact_root:built.artifact_root,
   artifacts,source_inventory:sources,source_inventory_sha256:sha(JSON.stringify(sources)),
   captured_inputs_before:before,captured_inputs_after:after,sources_unchanged:true,
   shared_builder_inventory:{entrypoints:shared.entrypoints,imports:shared.imports,source_count:shared.sources.length,
    scope:'reused_builder_dependency_inventory_not_profile_authority_or_general_JS_closure'},
   limits:{independent_BUILD_execution:false,independent_code_reference_review:false,
    generic_dependency_absence_proof:false,tcbreviewed:false,guest_execution:false,qualified:false,credit:0,finance:false,receipt:false,parent:false,global_go:false}};
  fs.writeFileSync(prefix+'.json',JSON.stringify(metadata,null,2)+'\n',{flag:'wx'});
  const project=sources.filter(s=>!s.external_vendor),changed=project.filter(s=>!s.parent_lf_identical),eol=project.filter(s=>s.parent_lf_identical&&!s.parent_raw_identical);
  const summary={state:'audit_reference_capture_construction_completed',pid:process.pid,started_at,completed_at:metadata.completed_at,
   report_sha256:sha(fs.readFileSync(prefix+'.json')),artifacts:artifacts.length,snapshot_sha256:metadata.snapshot_sha256,
   project_sources:project.length,external_vendors:sources.length-project.length,material_source_delta:changed.map(s=>s.path),
   eol_only_delta:eol.map(s=>s.path),sources_unchanged:true,guest_execution:false,qualified:false,credit:0};
  fs.writeFileSync(prefix+'.job.json',JSON.stringify(summary)+'\n');console.log(JSON.stringify(summary));
 }catch(error){
  fs.writeFileSync(prefix+'.job.json',JSON.stringify({state:'audit_reference_capture_failed',pid:process.pid,started_at,
   completed_at:new Date().toISOString(),error:error.message,guest_execution:false,qualified:false,credit:0})+'\n');
  throw error;
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});


