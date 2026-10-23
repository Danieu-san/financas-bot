// One final wide after causal B4-02 changes; same original runner/limits.
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),prefix=path.join(__dirname,'b4-02-path-v3-final-wide-20261019');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const casePath='tests/next/provenance/pathQualificationV3.cases.js';
const runnerPath=require.resolve('../scripts/runExhaustiveLocalTestCoverage');
const runnerPin='83c6c0729170dbb298cd4460eb471353625495c90fb6564e524eea443a7eb2bc';
const git='C:/Users/Administrador/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/cmd/git.exe';
const indexPin='9b8d706b67c0f5d804312ceb78060bbf53a0d71dc32860027eaa3e7bcbfc2ba0';
const changePaths=['tests/exhaustiveLocalTestCoverageRunner.test.js','tests/helpers/exhaustiveNetworkTripwire.js'].sort();
const newTitle='coverage tripwire checks effective HTTP hosts and fetch Request inputs without network';
const newTitles=[newTitle,'coverage tripwire forwards the same HTTP hostname snapshot it checked without network'].sort();
const proofFiles=['b4-02-http-snapshot-correction-20261019.md',
 'b4-chat-final-integrated-receipt-confronted-20261019.md',
 's01-finite-residual-body-argument-20261019.md',
 's01-existing-composition-residuals-20261019.json',
 's01-existing-residual-source-sites-20261019.json','s01-existing-sequence-callers-20261019.json',
 's01-normal-built-sources-20261019.json','s01-normal-derivation-program-20261019.txt',
 's01-normal-proof-program-20261019.txt'];
const read=p=>fs.readFileSync(path.join(root,p));
const local=n=>read('.codex-temp/'+n);
const titles=b=>[...b.toString('utf8').matchAll(/^test\('([^']+)'/gm)].map(m=>m[1]).sort();
function indexHash(){return sha(cp.execFileSync(git,['-c','safe.directory='+root,'ls-files','--stage','-z'],{cwd:root}));}
function freshRunner(){delete require.cache[runnerPath];return require(runnerPath);}
function manifest(){
 const redBytes=local('b4-01-path-v3-final-wide-20261018.json');
 assert.equal(sha(redBytes),'2322685cb086833fd21f88236acc8a8d0fcd42a441622f73a4c8d1cc55ee50cd');
 const red=JSON.parse(redBytes);assert.equal(red.matrix_green,false);assert.equal(red.exit_status,1);
 assert.deepEqual(red.tap,{tests:2787,suites:0,pass:2776,fail:1,cancelled:0,skipped:10,todo:0});
 assert.deepEqual(red.failures,['not ok 1600 - N02G:EVALUATOR-WITNESS-007 movement population does not become an expense-only filter']);
 assert.equal(red.measured_sources_unchanged,true);
 const diagBytes=local('b4-timeout-diagnostic-20261019.json');
 assert.equal(sha(diagBytes),'c9225afa44f78071599becee48de49047c1e546365a7e79267589eedbb023006');
 const diag=JSON.parse(diagBytes);assert.equal(diag.native_exit,0);assert.equal(diag.tap.tests,1);assert.equal(diag.tap.pass,1);
 assert.equal(diag.tap.fail,0);assert.equal(diag.sources_unchanged,true);assert.equal(diag.timeout_changed,false);

 const b=local('ac08-path-v3-final-wide-resumed-20261015.json');
 assert.equal(sha(b),'43efed73572e2bf45f50cd3bc8f8ac78e3c6a0b4ae913ba07b100a81c26bf8ab');
 const prior=JSON.parse(b);
 assert.equal(prior.valid,true);assert.equal(prior.matrix_green,true);assert.equal(prior.exit_status,0);
 assert.deepEqual(prior.tap,{tests:2786,suites:0,pass:2776,fail:0,cancelled:0,skipped:10,todo:0});
 assert.equal(prior.measured_sources_unchanged,true);assert.equal(prior.exact_path_v3_titles,true);
 assert.equal(prior.exact_new_schema_titles,true);assert.equal(indexHash(),indexPin);
 const old=prior.measured_sources_after.files;
 assert.equal(old.length,895);assert.equal(new Set(old.map(r=>r.path)).size,895);
 assert.equal(sha(JSON.stringify(old)),'17c90ea53e0af853a75216d78000495b412b8813e5dce3191ae2bffb121641fa');
 const files=old.map(r=>({path:r.path,sha256:sha(read(r.path))}));
 const changed=old.filter((r,i)=>r.sha256!==files[i].sha256).map(r=>r.path).sort();
 assert.deepEqual(changed,changePaths,'only_two_causal_source_deltas');
 const previousBytes=local('b4-01-path-v3-final-wide-confirmation-20261019.json');
 assert.equal(sha(previousBytes),'d1587842fecd86191fb91e5de6cd6e001705f48d8845e018fcd45af3ee8a7cc4');
 const previous=JSON.parse(previousBytes);assert.equal(previous.matrix_green,true);
 assert.equal(previous.tap.tests,2787);assert.equal(previous.tap.fail,0);
 assert.deepEqual(previous.measured_sources_after.files.filter((row,i)=>row.sha256!==files[i].sha256).map(row=>row.path).sort(),changePaths);
 const affected=JSON.parse(local('b4-http-snapshot-prototype-affected-20261019.json'));
 assert.equal(affected.native_exit,0);assert.equal(affected.sources_unchanged,true);
 assert.deepEqual(affected.tap,{tests:30,suites:0,pass:30,fail:0,cancelled:0,skipped:0,todo:0});
 for(const source of affected.sources_after)assert.equal(sha(read(source.path)),source.sha256);
 const before=local('ac08-b4-01-before-20261018/exhaustiveLocalTestCoverageRunner.test.js');
 assert.equal(sha(before),'5b1d104ad84690f0f527c20f0e032d7cbb976c4928ceab250ed7d4a7515e27c9');
 const oldTitles=titles(before),nowTitles=titles(read(changePaths[0]));
 assert.equal(new Set(nowTitles).size,nowTitles.length);
 assert.deepEqual(nowTitles.filter(t=>!oldTitles.includes(t)),newTitles);
 assert.deepEqual(oldTitles.filter(t=>!nowTitles.includes(t)),[]);
 assert.equal(sha(read('scripts/runExhaustiveLocalTestCoverage.js')),runnerPin);
 const runner=require(runnerPath),originalFiles=runner.listLocalTestFiles();
 assert.equal(originalFiles.length,168);assert.equal(originalFiles.includes(path.join(root,casePath)),false);
 for(const file of originalFiles)assert.equal(fs.readFileSync(file,'utf8').includes('pathQualificationV3.cases'),false);
 assert.deepEqual([...runner.EXPECTED_SKIPPED_TESTS].sort(),[...prior.skipped_tests].sort());
 const expected=titles(read(casePath));assert.equal(expected.length,88);assert.equal(new Set(expected).size,88);
 assert.deepEqual(expected,[...prior.expected_path_v3_titles].sort());
 const schema=titles(read('tests/next/provenance/schemaBuild.cases.js')).filter(t=>/^N02G:SCHEMA-00[56] /.test(t));
 assert.deepEqual(schema,[...prior.expected_new_schema_titles].sort());
 const dev=require('../scripts/agent/financasBotNext02ValidationPolicy').inspectDevelopmentSources(path.join(root,'src/next'),'N02-E');
 assert.deepEqual(dev.errors,[]);assert.equal(dev.releaseEligible,false);
 const proofBindings=proofFiles.map(file=>{const bytes=local(file);return {path:'.codex-temp/'+file,bytes:bytes.length,sha256:sha(bytes)};});
 return {files,sha256:sha(JSON.stringify(files)),changed,expected,originalFiles,newSchemaTitles:schema,proofBindings,
  expected_total_tests:prior.tap.tests+nowTitles.length-oldTitles.length,newTitle,newTitles,runner_sha256:runnerPin,
  snapshot_sha256:prior.review_snapshot_sha256,index_sha256:indexPin,
  development_inventory:{errors:dev.errors,reviewed_matches:dev.reviewedSourceMatches,pending_paths:dev.pendingReviewPaths,release_eligible:false}};
}
function installCapture({stdout,stderr,retained,native}){
 let invocations=0;
 cp.spawnSync=function(command,args,options){
  assert.equal(command,process.execPath);assert.equal(++invocations,1);
  assert.equal(args.includes('--test'),true);assert.equal(args.includes('--experimental-test-coverage'),true);
  assert.equal(args.includes(casePath)||args.includes(path.join(root,casePath)),false);
  const temp=fs.realpathSync(options.env.EXHAUSTIVE_AUDIT_TEMP_ROOT),rel=path.relative(root,temp);
  assert.equal(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel),true);
  assert.equal(fs.lstatSync(temp).isSymbolicLink(),false);assert.ok(options.env.EXHAUSTIVE_LOCAL_GIT_PATH);
  const env={...options.env,TEMP:temp,TMP:temp,TMPDIR:temp,GIT_BIN:options.env.EXHAUSTIVE_LOCAL_GIT_PATH,NODE_V8_COVERAGE:retained};
  const out=fs.openSync(stdout,'wx'),err=fs.openSync(stderr,'wx');let result;
  try{result=Reflect.apply(native,cp,[command,[...args,path.join(root,casePath)],{...options,env,stdio:['ignore',out,err]}]);}
  finally{fs.closeSync(out);fs.closeSync(err);}
  assert.ok(fs.statSync(stdout).size+fs.statSync(stderr).size<=options.maxBuffer);
  result.stdout=fs.readFileSync(stdout,'utf8');result.stderr=fs.readFileSync(stderr,'utf8');return result;
 };
 return {get invocations(){return invocations;},restore(){cp.spawnSync=native;}};
}
function bootstrap(m){
 const native=cp.spawnSync,dir=fs.mkdtempSync(path.join(__dirname,'b4-bootstrap-'));
 const stdout=path.join(dir,'stdout.tap'),stderr=path.join(dir,'stderr.log'),retained=path.join(dir,'coverage');fs.mkdirSync(retained);
 let calls=0;
 const fake=(command,args,options)=>{
  calls++;assert.equal(command,process.execPath);assert.deepEqual(args,[...require(runnerPath).buildNodeTestArgs(m.originalFiles),path.join(root,casePath)]);
  assert.equal(options.maxBuffer,128*1024*1024);assert.equal(options.env.EXHAUSTIVE_NETWORK_TRIPWIRE_ACTIVE,'true');
  assert.equal(options.env.WHATSAPP_E2E_ENABLED,'false');assert.equal(options.env.RUN_FUNCTIONAL_TESTS,'false');
  assert.equal(options.env.TEMP,options.env.EXHAUSTIVE_AUDIT_TEMP_ROOT);assert.equal(options.env.TMP,options.env.TEMP);
  assert.equal(options.env.TMPDIR,options.env.TEMP);assert.equal(options.env.GIT_BIN,options.env.EXHAUSTIVE_LOCAL_GIT_PATH);
  assert.equal(options.env.NODE_V8_COVERAGE,retained);
  fs.writeSync(options.stdio[1],'BOOTSTRAP_ONLY_NO_TESTS\n');return {status:0,signal:null};
 };
 const hook=installCapture({stdout,stderr,retained,native:fake});
 try{const result=freshRunner().runLocalCoverage();assert.equal(result.valid,false);assert.equal(hook.invocations,1);assert.equal(calls,1);}
 finally{cp.spawnSync=native;delete require.cache[runnerPath];}
 const report={stage:'mechanical_bootstrap_only',passed:true,no_real_tests_executed:true,invocations:calls,
  wrapper_sha256:sha(fs.readFileSync(__filename)),runner_sha256:runnerPin,qualified:false,credit:0,global_go:false};
 fs.writeFileSync(prefix+'.bootstrap-pass.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
}
function main(){
 assert.equal(process.version,'v22.17.0');assert.equal(/[/\\]Packages[/\\]sandbox\./i.test(os.tmpdir()),false);
 const mode=process.argv[2],m=manifest(),temp=fs.realpathSync(os.tmpdir()),rel=path.relative(root,temp);
 assert.equal(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel),true);
 const resolvedGit=require(runnerPath).resolveExecutableOnPath('git');assert.ok(resolvedGit);
 if(mode==='--bootstrap-check')return bootstrap(m);
 if(mode==='--preflight'){
  const out={stage:'preflight_only',created_at:new Date().toISOString(),node:process.version,measured_file_count:m.files.length,
   measured_sources_sha256:m.sha256,changed_paths:m.changed,original_test_file_count:m.originalFiles.length,
   additional_test_files:[casePath],expected_total_tests:m.expected_total_tests,expected_path_v3_count:m.expected.length,
   new_harness_titles:m.newTitles,proof_bindings:m.proofBindings,temporary_root:temp,resolved_git:resolvedGit,index_sha256:m.index_sha256,
   runner_sha256:runnerPin,wrapper_sha256:sha(fs.readFileSync(__filename)),development_inventory:m.development_inventory,
   wide_started:false,qualified:false,credit:0,global_go:false};
  fs.writeFileSync(prefix+'.preflight.json',JSON.stringify(out,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({...out,development_inventory:{errors:out.development_inventory.errors,reviewed:out.development_inventory.reviewed_matches?.length,
   pending:out.development_inventory.pending_paths?.length},preflight_sha256:sha(fs.readFileSync(prefix+'.preflight.json'))}));return;
 }
 assert.match(mode||'',/^[a-f0-9]{64}$/);assert.equal(sha(fs.readFileSync(prefix+'.preflight.json')),mode);
 assert.equal(fs.existsSync(prefix+'.job.json')||fs.existsSync(prefix+'.json'),false,'single_run_only');
 const pre=JSON.parse(fs.readFileSync(prefix+'.preflight.json')),boot=JSON.parse(fs.readFileSync(prefix+'.bootstrap-pass.json'));
 assert.equal(pre.measured_sources_sha256,m.sha256);assert.equal(pre.wrapper_sha256,sha(fs.readFileSync(__filename)));
 assert.deepEqual(pre.proof_bindings,m.proofBindings);assert.equal(m.expected_total_tests,2788);
 assert.equal(pre.temporary_root,temp);assert.equal(pre.resolved_git,resolvedGit);assert.equal(boot.passed,true);
 assert.equal(boot.no_real_tests_executed,true);assert.equal(boot.wrapper_sha256,pre.wrapper_sha256);assert.equal(boot.runner_sha256,runnerPin);
 const live=fs.mkdtempSync(path.join(__dirname,'b4-wide-live-')),retained=fs.mkdtempSync(path.join(__dirname,'b4-wide-coverage-'));
 const stdout=path.join(live,'stdout.tap'),stderr=path.join(live,'stderr.log');
 const job={state:'running',pid:process.pid,started_at:new Date().toISOString(),node:process.version,preflight_sha256:mode,
  measured_sources_before:m.sha256,measured_file_count:m.files.length,runner_sha256:runnerPin,live_output:{stdout,stderr},
  retained_coverage_directory:retained,expected_total_tests:m.expected_total_tests,qualified:false,credit:0,global_go:false};
 fs.writeFileSync(prefix+'.job.json',JSON.stringify(job,null,2)+'\n',{flag:'wx'});
 const native=cp.spawnSync,hook=installCapture({stdout,stderr,retained,native});
 try{
  const result=freshRunner().runLocalCoverage();assert.equal(hook.invocations,1);
  const after=m.files.map(r=>({path:r.path,sha256:sha(read(r.path))}));
  const output=fs.readFileSync(stdout,'utf8'),actual=[...output.matchAll(/^# Subtest: (N02G:PATH-V3-[^\r\n]+)$/gm)].map(x=>x[1]).sort();
  const actualSchema=[...output.matchAll(/^# Subtest: (N02G:SCHEMA-00[56] [^\r\n]+)$/gm)].map(x=>x[1]).sort();
  const harnessOccurrences=Object.fromEntries(newTitles.map(title=>[title,output.split('\n').filter(line=>line.trim()==='# Subtest: '+title).length]));
  const raw=fs.readdirSync(retained).filter(n=>n.endsWith('.json')).map(name=>{const b=fs.readFileSync(path.join(retained,name));let error=null;
   try{JSON.parse(b);}catch(e){error=e.message;}return {name,bytes:b.length,sha256:sha(b),json_valid:!error,parse_error:error};});
  const unchanged=sha(JSON.stringify(after))===m.sha256,exact=JSON.stringify(actual)===JSON.stringify(m.expected),
   exactSchema=JSON.stringify(actualSchema)===JSON.stringify(m.newSchemaTitles),invalid=raw.filter(r=>!r.json_valid),indexAfter=indexHash();
  const proofAfter=m.proofBindings.map(row=>{const bytes=read(row.path);return {path:row.path,bytes:bytes.length,sha256:sha(bytes)};});
  const proofUnchanged=JSON.stringify(proofAfter)===JSON.stringify(m.proofBindings);
  const green=result.valid&&result.exit_status===0&&result.tap.tests===m.expected_total_tests&&result.tap.fail===0&&result.tap.cancelled===0
   &&result.tap.todo===0&&exact&&exactSchema&&Object.values(harnessOccurrences).every(n=>n===1)&&unchanged&&indexAfter===indexPin&&raw.length>0&&!invalid.length&&proofUnchanged;
  const report={...result,additional_test_files:[casePath],expected_total_tests:m.expected_total_tests,expected_path_v3_titles:m.expected,
   actual_path_v3_titles:actual,exact_path_v3_titles:exact,expected_new_schema_titles:m.newSchemaTitles,actual_new_schema_titles:actualSchema,
   exact_new_schema_titles:exactSchema,new_harness_case_counts:harnessOccurrences,proof_bindings_before:m.proofBindings,proof_bindings_after:proofAfter,
   proof_bindings_unchanged:proofUnchanged,measured_sources_before:{files:m.files,sha256:m.sha256},
   measured_sources_after:{files:after,sha256:sha(JSON.stringify(after))},measured_sources_unchanged:unchanged,index_sha256_before:indexPin,index_sha256_after:indexAfter,
   retained_coverage_files:raw,retained_coverage_invalid_files:invalid,runner_sha256:runnerPin,review_snapshot_sha256:m.snapshot_sha256,
   matrix_green:green,independent_code_reference_audit:false,qualified:false,credit:0,global_go:false};
  fs.writeFileSync(prefix+'.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  Object.assign(job,{state:green?'completed_green':'completed_red',completed_at:new Date().toISOString(),exit_code:green?0:1,
   subprocess_exit:result.exit_status,tap:result.tap,valid:result.valid,validation_reasons:result.validation_reasons,matrix_green:green,
   measured_sources_unchanged:unchanged,proof_bindings_unchanged:proofUnchanged,measured_sources_after:sha(JSON.stringify(after)),index_unchanged:indexAfter===indexPin,
   report_sha256:sha(fs.readFileSync(prefix+'.json')),output_evidence:result.output_evidence,coverage_jsons:raw.length,invalid_raw_jsons:invalid.length});
 }catch(e){Object.assign(job,{state:'failed',completed_at:new Date().toISOString(),exit_code:1,error:{name:e.name,message:e.message}});}
 finally{hook.restore();}
 fs.writeFileSync(prefix+'.job.json',JSON.stringify(job,null,2)+'\n');console.log(JSON.stringify({state:job.state,exit_code:job.exit_code,tap:job.tap}));process.exitCode=job.exit_code;
}
try{main();}catch(e){console.error(e);process.exitCode=1;}
