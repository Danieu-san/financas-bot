'use strict';
// Mechanical comparison of fixed saved JSON, not a JS analyzer or qualification engine.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'), out=path.join(__dirname,'review-basis-continuity-20261023.json');
const bindings=[
  {
    "local": ".codex-temp/b4-02-reviewed-normal-build-20261021.payload.json",
    "bytes": 3108456,
    "sha256": "b9132fb2bd1099194a1e3b8827c9c804075d92e2b280af7fceca5ba11f7022b3",
    "git_blob_sha1": "d695bdecadf21c868e7095d5c1ff98d4e32c80e8",
    "published": [
      "docs/audit-evidence/n02g-causal-authoring-profile/path-v3-operational-provisioning-20261021/execution-payload.json"
    ]
  },
  {
    "local": ".codex-temp/b4-02-internal-observations-20261021.json",
    "bytes": 6024184,
    "sha256": "762d1859a4702a584ae068ca59a7cf07f8f9173dc80d830b04054b9d10b18119",
    "git_blob_sha1": "d052e2184404dce2ee8d8c871162b5013ce3cbed",
    "published": [
      "docs/audit-evidence/n02g-causal-authoring-profile/path-v3-real-internal-observations-20261021/actual-normal-internal-observations.json"
    ]
  },
  {
    "local": ".codex-temp/b4-02-two-reviewed-normal-builds-20261022-0140.payload.json",
    "bytes": 3108534,
    "sha256": "fcba5de1ad051713d2fd66d18fca282d819455d89edd596dc25731d9c846a74f",
    "git_blob_sha1": "42dae270cf0917064b73311f857ed6bc18f81e15",
    "published": [
      "docs/audit-evidence/n02g-causal-authoring-profile/path-v3-two-witness-provisioning-20261022/0140/execution-payload.json"
    ]
  },
  {
    "local": ".codex-temp/b4-02-two-reviewed-normal-builds-20261022-1952.payload.json",
    "bytes": 3107855,
    "sha256": "e06cd915fd2ae53681599ea5e2e39e04fb21de91272c144f2be72f70cf8c9ac5",
    "git_blob_sha1": "0d1a5b0c4ebc08eaa339e4b72471276ae2b0ddc3",
    "published": [
      "docs/audit-evidence/n02g-causal-authoring-profile/path-v3-two-witness-provisioning-20261022/1952/execution-payload.json"
    ]
  },
  {
    "local": ".codex-temp/b4-02-two-internal-once-20261022-0140.observations.json",
    "bytes": 6024206,
    "sha256": "baf04b67a6da43bfa512b36ae0f91b126e5e6fc4926902a91ae47b1839ad4767",
    "git_blob_sha1": "9cf74a4f40dc21646576a4bc3b66179374055c48",
    "published": [
      "docs/audit-evidence/n02g-causal-authoring-profile/path-v3-two-real-witnesses-20261022/0140-observations.json"
    ]
  },
  {
    "local": ".codex-temp/b4-02-two-internal-once-20261022-1952.observations.json",
    "bytes": 6024199,
    "sha256": "337588616b0b6a28f7a354b555964f287d192eea93df27ca08d95bf90bb0573e",
    "git_blob_sha1": "90a3a22316f9dc5c10526ae40aaec54a66d8a49c",
    "published": [
      "docs/audit-evidence/n02g-causal-authoring-profile/path-v3-two-real-witnesses-20261022/1952-observations.json"
    ]
  },
  {
    "local": ".codex-temp/b4-02-b312-final-provisioning-review-confronted-20261022.md",
    "bytes": 8166,
    "sha256": "bc0bcc7e61a84c7103682f6dc27771aede1771f4ee7dd10f06679013e0bc95bc",
    "git_blob_sha1": "4a4cac96a75b2317c79a273c233fa07925cf672e",
    "published": [
      "docs/audit-evidence/n02g-causal-authoring-profile/path-v3-two-real-witnesses-20261022/prior-b312-provisioning-review-confronted.md"
    ]
  },
  {
    "local": ".codex-temp/b4-02-e050-final-audit-receipt-confronted-20261021.md",
    "bytes": 5855,
    "sha256": "e4332083195072217d098dd7164dee01c39b702fa423c2c11b64b3523f9c0a13",
    "git_blob_sha1": "777a5dd0d144c5868e3bdd7a69cb59f66e6c3a40",
    "published": [
      "docs/audit-evidence/n02g-causal-authoring-profile/path-v3-empty-L-controls-20261021/prior-integrated-review-confronted.md"
    ]
  },
  {
    "local": ".codex-temp/b4-02-e4-final-audit-receipt-confronted-20261021.md",
    "bytes": 8037,
    "sha256": "a447095591b8abf4bd5d663fef413b19fe3fe2358dddf0f5c5eb47befe21a06f",
    "git_blob_sha1": "db916fda96e512657043c02537eb67815a0c70e8",
    "published": [
      "docs/audit-evidence/n02g-causal-authoring-profile/path-v3-real-internal-observations-20261021/provisioning-review-confronted.md"
    ]
  }
];
const primaryTreeComparison=[
  {
    "group": "canonical",
    "total": 214,
    "unchanged": 209,
    "deltas": [
      {
        "published": "docs/agent-memory/workstreams/financasbot-domestic-roadmap-review-20261007.md",
        "sha": "dda8e0880720493fe0089a96ecf859dc5d91daf0",
        "index": 0,
        "prior": "232c83766252b61ae0f405dcf28c16cd52519a38"
      },
      {
        "published": "docs/agent-workflow/active-scope.json",
        "sha": "1223159e5070123c442162adabff931ba66d7a8c",
        "index": 1,
        "prior": "8515ee902c2a43c16386cdf7412c898090e46ad7"
      },
      {
        "published": "docs/plans/workstreams/financasbot-pathv3-implementation-20261008.md",
        "sha": "b9b05206e52a1085d4d1576bd1c0e91665d835fb",
        "index": 79,
        "prior": "cad6ae0144bc19729ca58b8d902fd33ad08e285e"
      },
      {
        "published": "src/next/provenance/pathQualificationV3.js",
        "sha": "e70e9c4aa601e0a6ae94979357144cd8d14ce616",
        "index": 157,
        "prior": "3e41187cc1516e79e92e9d04668caa5f4f1592a2"
      },
      {
        "published": "tests/next/provenance/pathQualificationV3.cases.js",
        "sha": "de2215afb0572caebd209e813449a344381a7598",
        "index": 206,
        "prior": "c548adcafc652023498bbc958570fba5bfffb606"
      }
    ]
  },
  {
    "group": "dependencies_and_licenses",
    "total": 85,
    "unchanged": 85,
    "deltas": []
  },
  {
    "group": "artifacts",
    "total": 9,
    "unchanged": 8,
    "deltas": [
      {
        "published": "docs/audit-evidence/n02g-causal-authoring-profile/path-v3-complete-code-review-20261012/artifacts/normal-rule-review-snapshot.json",
        "sha": "b5d17202d91ad89a5740acd94e9c6e68b9dc770d",
        "prior": "0bca48bb3f1770f912110ee5b96b1392bd6cd6ea"
      }
    ]
  }
];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const blob=b=>crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex');
const stable=x=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(stable).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}';
const eq=(a,b)=>stable(a)===stable(b), digest=x=>sha(Buffer.from(stable(x)));
const loaded=new Map();
for(const r of bindings){const b=fs.readFileSync(path.join(root,r.local));assert.equal(b.length,r.bytes,r.local);assert.equal(sha(b),r.sha256,r.local);assert.equal(blob(b),r.git_blob_sha1,r.local);if(r.local.endsWith('.json'))loaded.set(r.local,JSON.parse(b.toString('utf8')));}
const get=p=>loaded.get('.codex-temp/'+p);
const basePayload=get('b4-02-reviewed-normal-build-20261021.payload.json');
const baseObs=get('b4-02-internal-observations-20261021.json');
const priorId='1c665af2-7982-4b14-b49f-1afeb85ac1f2';
assert.equal(baseObs.observations.invocation_id,priorId);
const variants=['C','M','S'];
function worlds(p){assert.deepEqual(p.worlds.map(x=>x.variant),variants);return Object.fromEntries(p.worlds.map(x=>[x.variant,x]));}
const baseWorlds=worlds(basePayload);
function fields(a,b){assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());return Object.keys(a).sort().map(field=>({field,equal:eq(a[field],b[field]),prior_sha256:digest(a[field]),current_sha256:digest(b[field])}));}
function eventComparison(a,b,oldId,newId){assert.equal(a.length,b.length);const differences={},nonIdentity=[];for(let i=0;i<a.length;i++){assert.equal(a[i].invocation_id,oldId);assert.equal(b[i].invocation_id,newId);assert.equal(a[i].sequence,a[0].sequence+i);assert.equal(b[i].sequence,b[0].sequence+i);for(const k of new Set([...Object.keys(a[i]),...Object.keys(b[i])]))if(!eq(a[i][k],b[i][k])){differences[k]=(differences[k]||0)+1;if(k!=='invocation_id')nonIdentity.push({index:i,key:k,prior:a[i][k],current:b[i][k]});}}assert.equal(nonIdentity.length,0,JSON.stringify(nonIdentity.slice(0,3)));assert.deepEqual(differences,{invocation_id:a.length});return{events:a.length,raw_equal:false,different_fields:differences,all_prior_ids_exact:true,all_current_ids_exact:true,non_identity_differences:nonIdentity};}
function rawDifferences(a,b){assert.equal(a.length,b.length);return a.flatMap((prior,i)=>eq(prior,b[i])?[]:[{index:i,prior,current:b[i]}]);}
const specs=[{row:140,id:'0140',invocation:'d9265afc-32d8-4bda-8d86-025de326d09c',from:'operands.node("evt_transfer_out").get("amount_minor")',to:'operands.node("evt_bill_projected").get("amount_minor")',readSequence:3601,operator:'abs_eq',original_operands:[-15000,15000],mutant_operands:[-80000,15000]},
{row:1952,id:'1952',invocation:'16913c85-bc39-4579-88af-0c7065dc5425',from:'operands.node("evt_transfer_out").get("amount_minor")',to:'operands.node("evt_refund_b").get("amount_minor")',readSequence:3599,operator:'opposite_sign',original_operands:[-15000,15000],mutant_operands:[4500,15000]}];
const targets=[];
for(const s of specs){
 const payload=get('b4-02-two-reviewed-normal-builds-20261022-'+s.id+'.payload.json'),obs=get('b4-02-two-internal-once-20261022-'+s.id+'.observations.json'),w=worlds(payload);
 assert.equal(obs.observations.invocation_id,s.invocation);assert.equal(obs.runtime_guest_run,true);assert.equal(obs.qualified,false);assert.equal(obs.semantic_mutation_credit,0);
 assert.equal(obs.fixed_input_measurements_before_evaluation.first_leaf_measured_before_evaluation,true);
 assert.deepEqual(obs.fixed_input_measurements_before_evaluation.all_four_leaf_sha256,baseObs.fixed_input_measurements_before_evaluation.all_four_leaf_sha256);
 const positives=[];
 for(const v of ['C','S']){
  const f=fields(baseWorlds[v],w[v]);assert.ok(f.every(x=>x.equal));
  const a=baseObs.observations.observations.find(x=>x.variant===v).result,b=obs.observations.observations.find(x=>x.variant===v).result;
  const rf=fields(a,b).filter(x=>x.field!=='trace');assert.ok(rf.every(x=>x.equal));
  positives.push({variant:v,payload_fields:f,result_fields_except_trace:rf,traces:['derivation_trace','proof_trace'].map(k=>({phase:k,...eventComparison(a.trace[k],b.trace[k],priorId,s.invocation)}))});
 }
 const changed=fields(w.C,w.M).filter(x=>!x.equal).map(x=>x.field);assert.deepEqual(changed,['package_root','proof_artifact','proof_program_id','variant']);
 assert.deepEqual(w.C.proof_artifact.entries.map(x=>x.path),w.M.proof_artifact.entries.map(x=>x.path));
 const codeC=w.C.proof_artifact.entries.find(x=>x.path==='bundle.js').source,codeM=w.M.proof_artifact.entries.find(x=>x.path==='bundle.js').source;
 const first=codeC.indexOf(s.from), last=codeC.lastIndexOf(s.from);
 // The locator can occur in more than one predicate; derive the actual one differing region,
 // then require its complete literal replacement rather than replacing all occurrences.
 let start=0;while(start<Math.min(codeC.length,codeM.length)&&codeC[start]===codeM[start])start++;
 let suffix=0;while(suffix<Math.min(codeC.length-start,codeM.length-start)&&codeC[codeC.length-1-suffix]===codeM[codeM.length-1-suffix])suffix++;
 const candidatePositions=[];for(let p=first;p>=0;p=codeC.indexOf(s.from,p+1))if(codeC.slice(0,p)+s.to+codeC.slice(p+s.from.length)===codeM)candidatePositions.push(p);
 assert.equal(candidatePositions.length,1,'exact single literal substitution');
 for(const e of w.C.proof_artifact.entries.filter(x=>x.path!=='bundle.js'))assert.equal(e.source,w.M.proof_artifact.entries.find(x=>x.path===e.path).source);
 const observed=Object.fromEntries(obs.observations.observations.map(x=>[x.variant,x.result]));
 const D=rawDifferences(observed.C.trace.derivation_trace,observed.M.trace.derivation_trace),P=rawDifferences(observed.C.trace.proof_trace,observed.M.trace.proof_trace);
 assert.equal(D.length,1);assert.equal(P.length,2);assert.ok(D[0].prior.measurement&&D[0].current.measurement);
 assert.equal(P.filter(x=>x.prior.sequence===s.readSequence).length,1);assert.ok(P.some(x=>x.prior.measurement&&x.current.measurement));
 assert.equal(observed.C.proof_satisfied,true);assert.equal(observed.M.proof_satisfied,false);assert.equal(observed.S.proof_satisfied,true);
 for(const v of variants)assert.equal(observed[v].functional_result.value,169400);
 targets.push({row:s.row,invocation:s.invocation,prior_invocation:priorId,positives,negative:{changed_payload_fields:changed,bundle_C_chars:codeC.length,bundle_M_chars:codeM.length,exact_single_literal_substitution:{from:s.from,to:s.to,offset:candidatePositions[0]},unchanged_other_proof_entries:true,D_differences:D,P_differences:P,operator:s.operator,original_operands:s.original_operands,mutant_operands:s.mutant_operands,edge_violation_attribution:'causal_inference_from_fixed_reference_single_source_change_actual_read_other_operand_and_CMS_not_emitted_false_predicate_array'},four_leaf_commitments_exact_to_base:true,expected_freeze_hash:obs.expected_freeze_hash,expected_ticket_commitment:obs.expected_ticket_commitment,observed_measurements_before_evaluation:obs.fixed_input_measurements_before_evaluation});
}
assert.equal(fs.existsSync(out),false,'do_not_overwrite_evidence');
const report={format:'financasbot.review-basis-continuity.fixed-saved-body-comparison',version:1,stage:'mechanical_causal_relations_pending_independent_integrated_review',candidate:'2e978d5d443adabb4d0d524901d13282afb2f679',prior_operational_review:'e050ad07ef1b877d38e81acea98d827d1eb59ffb',prior_provisioning_review:'b312af728603972acf60daa72406342c2e43240e',current_tree:'2c5076d212e52ddea6ae2d1bb49f0a1f499733f5',primary_tree_comparison:primaryTreeComparison,inputs:bindings,targets,product_executed:false,guest_reexecuted:false,suite_reexecuted:false,independent_semantic_review_completed:false,qualified:false,semantic_mutation_credit:0,globalGO:false,limits:['identity confirms applicability candidates, not semantic sufficiency','prior verdict e050 only its S01 invocation; b312 only its two provisionings','raw positive trace arrays are NOT equal: all own invocation IDs differ and are separately bound','no transfer of semantic credit from646','all new conclusions require independent integrated judgment']};
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({stage:report.stage,targets:targets.length,bytes:fs.statSync(out).size,sha256:sha(fs.readFileSync(out)),guest_reexecuted:false}));

