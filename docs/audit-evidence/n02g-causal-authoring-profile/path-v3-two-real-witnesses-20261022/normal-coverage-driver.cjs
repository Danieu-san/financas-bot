'use strict';
// Mechanical use of EXISTING normal comparison/projection APIs on saved data.
// No guest reexecution, altered trace, new semantic checker or authority.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),prefix=path.join(__dirname,'b4-02-two-internal-coverage-normal-20261022');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(path.join(root,p)),plain=v=>JSON.parse(JSON.stringify(v));
const fixed=(p,h)=>{const b=read(p);assert.equal(sha(b),h,p);return b;};
const {canonicalValue}=require('../src/next/kernel/canonicalValue');
const specs=[{id:'0140',row:140,observations:'baf04b67a6da43bfa512b36ae0f91b126e5e6fc4926902a91ae47b1839ad4767',
    build:'e7e71360cdc56197dba34cbaf11226ffd404b2753752dd5ccca4d5e222ea9b4d',
    payload:'fcba5de1ad051713d2fd66d18fca282d819455d89edd596dc25731d9c846a74f',
    freeze:'97657f66b47299567d209b027dbed9c055544c00334db6b650b49236edcdcf90',
    alias:'evt_bill_projected',value:-80000,sequence:3601},
    {id:'1952',row:1952,observations:'337588616b0b6a28f7a354b555964f287d192eea93df27ca08d95bf90bb0573e',
    build:'c1ca3f5150d739378295f72a4bd1e366d0ac2a58f09c255c9c5142f8e70d1e8d',
    payload:'e06cd915fd2ae53681599ea5e2e39e04fb21de91272c144f2be72f70cf8c9ac5',
    freeze:'b38abc7fdebb12857a22732fd20fc5aea72ee2aef485c5b133afe046629c28ed',
    alias:'evt_refund_b',value:4500,sequence:3599}];
for(const s of specs)assert.equal(fs.existsSync(prefix+'-'+s.id+'.json'),false,'comparison_already_saved');
assert.equal(fs.existsSync(prefix+'.json'),false);
const summary={stage:'comparing_two_saved_normal_INTERNAL_observations',started_at:new Date().toISOString(),
    candidate:'b312af728603972acf60daa72406342c2e43240e',targets:[],guest_reexecuted:false,
    qualified:false,semantic_mutation_credit:0,financial_acceptance:false,globalGO:false,NEXT03:false};
let measured,current=null;
function sources(){const mismatches=measured.files.filter(r=>sha(read(r.path))!==r.sha256).map(r=>r.path);
    assert.deepEqual(mismatches,[]);return{count:895,sha256:measured.sha256,mismatches};}
function save(){current.completed_at=new Date().toISOString();const b=JSON.stringify(current,null,2)+'\n';
    fs.writeFileSync(prefix+'-'+current.original_row_id+'.json',b,{flag:'wx'});
    return{row:current.original_row_index,file:path.basename(prefix+'-'+current.original_row_id+'.json'),
        bytes:Buffer.byteLength(b),sha256:sha(b),stage:current.stage,worlds:current.worlds,
        phases:current.phases.map(r=>({variant:r.variant,phase:r.phase,events:r.original_trace_events,matched:r.coverage?.matched,error:r.error}))};}
(async()=>{
    assert.equal(process.version,'v22.17.0');
    measured=JSON.parse(fixed('.codex-temp/b4-02-path-v3-final-wide-20261019.json',
        '42e6126d4c3f321534d72b7584951d9d4aa6a6c794e889618d9934589f35a866')).measured_sources_after;
    assert.equal(measured.files.length,895);assert.equal(sha(JSON.stringify(measured.files)),
        '183ba87724616c2226e7b1893fb8c3b5fa978631b116d99d23307ec9e782a6d7');
    summary.sources_before=sources();
    const {loadLocalAuthoringPackage}=await import(pathToFileURL(path.join(root,'scripts/agent/executeNextDomainInvariantMatrix.mjs')).href);
    const {buildAdmittedSchemaValidators}=await import(pathToFileURL(path.join(root,'scripts/agent/buildNextProvenanceArtifacts.mjs')).href);
    const {admittedDocuments}=require('../src/next/provenance/packageContract');
    const {compileSnapshotAccess}=require('../src/next/provenance/graphCompiler');
    const {comparePhaseCoverage}=require('../src/next/provenance/proofAcceptance');
    const receipt=loadLocalAuthoringPackage(),documents=admittedDocuments(receipt);
    const authority=documents.map(({path,sha256})=>({path,sha256}));
    const plan=compileSnapshotAccess(receipt,buildAdmittedSchemaValidators(receipt).validators);
    const corpus=documents.find(r=>r.path.endsWith('/graphs-v2.json')).value;
    const graph=corpus.graphs.find(r=>r.fact_key==='S-01#1#1');
    const claim=documents.find(r=>r.path===corpus.claim_contract.path).value.claims.find(r=>r.fact_key===graph.fact_key);
    const selector={fact_key:graph.fact_key},metric=plan.projectMetricTransport(selector),proof=plan.projectProofTransport(selector).config;
    const derivation={bindings:[],derivationBindings:plan.projectDerivationBindings(selector),
        directGroups:metric.directGroups,nodeSets:metric.nodeSets,parentGroups:metric.parentGroups};
    const oracleSource=read('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json');
    const oracle=JSON.parse(oracleSource).turns['S-01#1'].facts[0];
    for(const s of specs){
        const observations=JSON.parse(fixed('.codex-temp/b4-02-two-internal-once-20261022-'+s.id+'.observations.json',s.observations));
        const data='.codex-temp/b4-02-two-witness-provisioning-20261022/'+s.id+'/';
        const build=JSON.parse(fixed(data+'normal-build-result.json',s.build));
        const payload=JSON.parse(fixed(data+'execution-payload.json',s.payload));
        const freeze=JSON.parse(fixed(data+'proposed-execution-freeze.json',s.freeze));
        assert.equal(canonicalValue(authority),canonicalValue(freeze.package_authority));
        assert.equal(observations.runtime_guest_run,true);assert.equal(observations.observations.invocation_id,build.result.invocation_id);
        current={format:'financasbot.path-v3.existing-normal-coverage-local',version:1,
            candidate:summary.candidate,original_row_id:s.id,original_row_index:s.row,started_at:new Date().toISOString(),
            source_observations_sha256:s.observations,oracle_source_sha256:sha(oracleSource),
            expected:{origin:'unchanged_preexecution_authored_package_and_reviewed_freeze_payload',graph:graph.fact_key,
                reference:build.result.reference,phase_contract_sha256:sha(canonicalValue(graph.trace_contract)),
                package_authority_sha256:sha(canonicalValue(authority))},
            guest_reexecuted:false,qualified:false,semantic_mutation_credit:0,financial_acceptance:false,globalGO:false,NEXT03:false,
            worlds:[],phases:[]};
        for(const world of payload.worlds){
            assert.equal(canonicalValue(world.derivation),canonicalValue(plain(derivation)));
            assert.equal(canonicalValue(world.proof),canonicalValue(plain(proof)));
            const actual=observations.observations.observations.find(r=>r.variant===world.variant);assert.ok(actual);
            const result=actual.result,proofRoot=freeze.proof_programs.find(r=>r.program_id===world.proof_program_id).proof_engine_artifact_root;
            const metricRoot='sha256:'+sha(world.metric_artifact.manifest),contractHash='sha256:'+sha(world.contract_source);
            assert.equal(result.observed_validation_tcb_root,freeze.validation_tcb_root);
            assert.equal(result.observed_child_capsule_root,freeze.child_capsule_root);
            assert.equal(result.observed_evaluator_artifact_root,metricRoot);assert.equal(result.observed_evaluator_contract_hash,contractHash);
            assert.equal(result.observed_proof_engine_artifact_root,proofRoot);
            const referenceMatch=result.proof_satisfied===(world.variant==='M'?build.result.reference.mutant_satisfied:build.result.reference.baseline_satisfied);
            const oracleMatch=oracle.metric===claim.metric&&oracle.unit===result.functional_result.unit
                &&canonicalValue(oracle.value)===canonicalValue(result.functional_result.value);
            assert.equal(referenceMatch,true);assert.equal(oracleMatch,true);
            current.worlds.push({variant:world.variant,execution_id:actual.execution_id,proof_satisfied:result.proof_satisfied,
                independent_reference_boolean_matched:referenceMatch,oracle_matched:oracleMatch,
                functional_result:result.functional_result,roots_matched:true,graph_accepted:result.graph_accepted,
                graph_accepted_scope:'normal_observation_only_host_does_not_issue_financial_acceptance'});
            for(const phase of ['derivation','proof']){
                const {evidence_set_mode,...expected}=graph.trace_contract[phase],isProof=phase==='proof';
                const bindings=isProof?proof.proofSelections.map(r=>({role:`proof/set/${r.candidate_set}`,...r})):
                    expected.required_selections.map(selection=>{const roles=Object.entries(claim.operand_bindings)
                        .filter(([,r])=>r.kind==='node_set'&&canonicalValue(r.aliases)===canonicalValue(graph.sets[selection.candidate_set]));
                        assert.equal(roles.length,1);return{role:roles[0][0],...selection};});
                const operandSets=isProof?proof.proofSets.map(r=>({role:`proof/set/${r.name}`,aliases:r.roster})):
                    Object.entries(claim.operand_bindings).filter(([,r])=>r.kind==='node_set').map(([role,r])=>({role,aliases:r.aliases}));
                const measurements=[{measurement:'validation_tcb_root',observed:freeze.validation_tcb_root},
                    {measurement:'proof_engine_artifact_root',observed:proofRoot},...(!isProof?[
                        {measurement:'evaluator_artifact_root',observed:metricRoot},{measurement:'evaluator_contract_hash',observed:contractHash}]:[])];
                const row={variant:world.variant,phase,original_trace_events:result.trace[phase+'_trace'].length};
                try{row.coverage=comparePhaseCoverage({trace:result.trace,executionId:actual.execution_id,
                    invocationId:build.result.invocation_id,phase,expected,sets:graph.sets,bindings,operandSets,
                    accessBindings:plan.observationMetadata({fact_key:graph.fact_key,phase}),measurements});}
                catch(error){row.error={name:error.name,message:error.message};}
                current.phases.push(row);
            }
        }
        const worlds=observations.observations.observations;
        current.trace_difference=[];
        for(const phase of ['derivation_trace','proof_trace']){
            const a=worlds[0].result.trace[phase],m=worlds[1].result.trace[phase],z=worlds[2].result.trace[phase];
            assert.equal(JSON.stringify(a),JSON.stringify(z));assert.equal(a.length,m.length);
            const diffs=[];for(let i=0;i<a.length;i++)if(JSON.stringify(a[i])!==JSON.stringify(m[i]))diffs.push({index:i,C:a[i],M:m[i]});
            const reads=diffs.filter(d=>d.M.operation==='get');
            if(phase==='proof_trace'){
                assert.equal(reads.length,1);assert.equal(reads[0].M.sequence,s.sequence);
                assert.equal(reads[0].C.alias,'evt_transfer_out');assert.deepEqual(reads[0].C.outcome,['scalar',-15000]);
                assert.equal(reads[0].M.alias,s.alias);assert.deepEqual(reads[0].M.outcome,['scalar',s.value]);
                assert.deepEqual(m[reads[0].index+1].outcome,['scalar',15000]);
            }else assert.equal(reads.length,0);
            assert.ok(diffs.filter(d=>d.M.operation!=='get').every(d=>d.M.measurement==='proof_engine_artifact_root'));
            current.trace_difference.push({phase,C_equals_S:true,differences:diffs});
        }
        current.causal_attribution={scope:'explicit_inference_not_emitted_false_predicates_array',expected_violation:['edge'],
            single_authored_target_and_single_changed_operand_read:true,unchanged_other_operand:15000,
            reference_and_normal_operator_agree:true,new_semantic_credit:0};
        current.sources_after=sources();
        current.stage=current.phases.every(r=>r.coverage?.matched===true)?'existing_phase_comparison_complete_not_qualification':'existing_phase_comparison_not_closed';
        const recorded=save();summary.targets.push(recorded);current=null;
        assert.equal(recorded.stage,'existing_phase_comparison_complete_not_qualification','coverage_contradiction_stop');
    }
    summary.sources_after=sources();summary.stage='both_existing_normal_phase_comparisons_complete_not_qualification';
})().catch(error=>{summary.stage='comparison_failed_without_guest_retry';summary.error={name:error.name,message:error.message};
    if(current){current.stage='comparison_failed_without_guest_retry';current.error=summary.error;summary.stopped_target=save();current=null;}
    process.exitCode=1;}).finally(()=>{summary.completed_at=new Date().toISOString();
    fs.writeFileSync(prefix+'.json',JSON.stringify(summary,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(summary));});
