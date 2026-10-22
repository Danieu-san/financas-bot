'use strict';
// Mechanical full readback only. No compiler, semantic analyzer or qualification.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {canonicalValue}=require('../src/next/kernel/canonicalValue');
const root=path.resolve(__dirname,'..'),p=path.join(__dirname,'b4-02-S01-empty-A-native-controls-20261022');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=f=>fs.readFileSync(path.join(root,f));
const fixed=(f,h)=>{const b=read(f);assert.equal(sha(b),h,f);return b;};
assert.equal(process.version,'v22.17.0');assert.equal(fs.existsSync(p+'.confronted.json'),false,'already_confronted');
const job=JSON.parse(fs.readFileSync(p+'.job.json'));
assert.equal(job.stage,'all144_native_controls_completed_not_static_qualification');
const rb=fs.readFileSync(p+'.roster.json'),roster=JSON.parse(rb);
assert.equal(sha(rb),'ee1a882a9716b277f1aa53649a80af86e9ff2a50c052931b96c2c613580ca178');
assert.equal(job.roster_sha256,sha(rb));assert.equal(roster.controls.length,144);
const raw=fs.readFileSync(p+'.rows.jsonl');assert.equal(raw.length,job.raw_bytes);assert.equal(sha(raw),job.raw_sha256);
const lines=raw.toString('utf8').split('\n');assert.equal(lines.pop(),'');assert.equal(lines.length,144);
const ledger=JSON.parse(fixed('.codex-temp/b4-02-pathv3-static11-qualified-ledger-20261021.json',
 '2b9f20c906cad0a9a098de34e194d0369304d74dfe5f2d1fe74692eb36e10ba8'));
const baseline=JSON.parse(fixed('.codex-temp/b4-02-reviewed-normal-build-20261021.json',
 '4b118acd391cf9407ef8510d29cdd113a43ec64eaa964b36a2d2f7650559db8e')).result;
const invocations=new Set(),candidates=new Set(),kinds={},coordinates={},rows=new Set(),summaries=[];
for(let i=0;i<144;i++){
 const observed=JSON.parse(lines[i]),expected=roster.controls[i];
 const {result,duration_ms,invocation_id,candidate_id,...declared}=observed;
 assert.deepEqual(declared,expected);assert.equal(result.target_id,expected.target_id);
 const row=ledger.rows[expected.row_index];assert.equal(row.status,'blocked');
 assert.equal(row.target_id,expected.target_id);assert.equal(row.qualification_id,expected.qualification_id);
 const siteIndex=expected.kind==='unknown_namespace'?expected.control_index:expected.control.site_index;
 const site=row.sites[siteIndex];assert.ok(site.domain_complete);
 assert.deepEqual(site.authored_site,expected.control.authored_site);
 const isUnknown=expected.kind==='unknown_namespace';
 const patch=isUnknown?{location:site.authored_site.site_path,before:site.domain.original.segments,
  after:[...site.domain.original.segments.slice(0,-1),'unknown_'+expected.control.admission_id.slice(7,23)]}
  :{location:site.domain.location,before:site.domain.original,
   after:site.domain.locators[expected.control.locator_index]};
 const kind=isUnknown?'unknown_path_control_for_witness_site':'typed_locator_exclusion_control';
 const cid='sha256:'+sha(canonicalValue({domain:'financasbot.path-qualification.locator.v3',kind,
  method:ledger.method_authority,target_id:expected.target_id,patch,
  baseline_package:baseline.whole_ir_reference.worlds[0].authority_refs}));
 assert.equal(result.candidate_id,cid);assert.equal(candidate_id,cid);
 assert.equal(result.invocation_id,invocation_id);assert.ok(!invocations.has(invocation_id));invocations.add(invocation_id);
 assert.ok(!candidates.has(cid));candidates.add(cid);
 assert.equal(result.compiler_artifact_root,'sha256:2281d7efd3b6627fe4679427b908b06ad29ea6e75cfea66aca3c387019bed151');
 assert.equal(result.normal_compiler_source_bindings_sha256,baseline.normal_compiler_source_bindings_sha256);
 assert.equal(result.selection_binding_source_sha256,baseline.selection_binding_source_sha256);
 assert.equal(result.native_control_matched,true);assert.equal(result.handle_attempts,0);
 assert.equal(result.dp_execution,false);assert.equal(result.qualified,false);assert.equal(result.semantic_mutation_credit,0);
 assert.equal(result.financial_acceptance,false);
 assert.deepEqual(result.worlds.map(w=>w.variant),['C','M','S']);
 assert.deepEqual(result.worlds.map(w=>w.admitted),[true,false,true]);
 assert.equal(result.worlds[1].ir_sha256,null);
 assert.notEqual(result.worlds[1].package_root,result.worlds[0].package_root);
 assert.deepEqual(result.worlds[1].diagnostic.native_coordinate,expected.control.expected_diagnostic);
 assert.equal(result.worlds[1].diagnostic.coordinate_authority,true);
 assert.equal(result.worlds[1].diagnostic.forged_same_text_has_authority,false);
 for(const wi of [0,2]){
  assert.equal(result.worlds[wi].ir_sha256,baseline.worlds[0].ir_sha256);
  assert.equal(result.worlds[wi].package_root,baseline.worlds[0].package_root);
  assert.equal(result.worlds[wi].access_descriptor_sha256,baseline.worlds[0].access_descriptor_sha256);
  assert.equal(result.worlds[wi].graph_count,76);
  assert.equal(result.worlds[wi].whole_ir_conformance,true);
  assert.equal(result.worlds[wi].diagnostic,null);
 }
 const ref=result.whole_ir_reference;
 assert.equal(ref.sealed_before_captured_compile,true);
 assert.equal(ref.target_id,result.target_id);
 assert.equal(ref.independent_compiler,false);
 assert.deepEqual(ref.worlds.map(w=>w.expectation),['whole_authored_ir',
  isUnknown?'native_rejection_only_no_typed_ir':'whole_authored_ir','whole_authored_ir']);
 if(isUnknown)assert.equal(ref.worlds[1].ir_sha256,null);
 else assert.match(ref.worlds[1].ir_sha256,/^sha256:[a-f0-9]{64}$/);
 for(let wi=0;wi<3;wi++){
  assert.equal(result.worlds[wi].package_root,ref.worlds[wi].package_root);
  if(wi!==1||isUnknown)assert.equal(result.worlds[wi].ir_sha256,ref.worlds[wi].ir_sha256);
 }
 assert.equal(ref.candidate_id,result.candidate_id);
 assert.equal(ref.invocation_id,result.invocation_id);
 assert.equal(result.reference.invocation_id,invocation_id);
 assert.equal(result.reference.candidate_id,cid);
 assert.equal(result.reference.mutation_id,expected.target_id);
 kinds[expected.kind]=(kinds[expected.kind]||0)+1;
 const native=result.worlds[1].diagnostic.native_coordinate;
 const coord=native.checker+(native.mode?'/'+native.mode:'/'+native.code);
 coordinates[coord]=(coordinates[coord]||0)+1;
 rows.add(expected.row_index);
 summaries.push({index:i,line:i+1,row_index:expected.row_index,kind:expected.kind,
  control_index:expected.control_index,target_id:expected.target_id,qualification_id:expected.qualification_id,
  invocation_id,candidate_id:cid,native_coordinate:native,handle_attempts:0,qualified:false,semantic_mutation_credit:0});
}
assert.equal(rows.size,11);assert.deepEqual(kinds,{unknown_namespace:11,typed_selection_exclusion:133});
const sources=JSON.parse(read('.codex-temp/b4-02-path-v3-final-wide-20261019.json')).measured_sources_after;
assert.equal(sources.files.length,895);
assert.equal(sha(JSON.stringify(sources.files)),'183ba87724616c2226e7b1893fb8c3b5fa978631b116d99d23307ec9e782a6d7');
const mismatches=sources.files.filter(f=>sha(read(f.path))!==f.sha256).map(f=>f.path);assert.deepEqual(mismatches,[]);
const result={stage:'all144_native_controls_confronted_not_static_qualification',controls:144,rows:11,
 kinds,native_coordinates:coordinates,roster_bytes:rb.length,roster_sha256:sha(rb),raw_bytes:raw.length,raw_sha256:sha(raw),
 source_current:{count:895,sha256:sources.sha256,mismatches},original_row_indices:[...rows],
 unique_invocations:invocations.size,unique_candidates:candidates.size,control_summaries:summaries,
 runtime_guest_run:false,qualified:false,semantic_mutation_credit:0,newly_qualified_static_rows:0,
 no_qualification_by_rejection_count:true,financial_acceptance:false,globalGO:false,NEXT03:false,
 native_batch_completed_at:job.completed_at,confronted_at:new Date().toISOString()};
const bytes=JSON.stringify(result,null,2)+'\n';fs.writeFileSync(p+'.confronted.json',bytes,{flag:'wx'});
console.log(JSON.stringify({stage:result.stage,controls:144,rows:11,kinds,coordinates,
 bytes:Buffer.byteLength(bytes),sha256:sha(bytes),raw_sha256:sha(raw),source_mismatches:mismatches}));

