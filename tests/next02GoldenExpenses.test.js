'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { observationDigest, observationDeduplicationKey, projectObservations } = require('../src/next/kernel/observationKernel');
const { createExpenseReadModel } = require('../src/next/kernel/expenseReadModel');
const dir = path.join(__dirname, 'fixtures/financasbot-next');
const json = name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const data = json('next02-expense-observations-v1.json');
const oracle = json('next02-expense-expectations-v1.json');
const traceability = json('next02-golden-traceability-v1.json');
const columns = ['id','record_type','person_id','account_id','card_id','category_id','subcategory_id',
    'amount_minor','transaction_date','evidence_state','related_record_ref','transfer_ref','settles_card_id',
    'installment_total','installment_index','installment_purchase_ref','billing_period'];
const hash = value => createHash('sha256').update(value).digest('hex');
function records() {
    assert.deepEqual(data.columns, columns);
    assert.equal(data.synthetic, true); assert.equal(data.closed_world, true);
    return data.records.map(row => {
        assert.equal(row.length, columns.length);
        return Object.fromEntries(columns.map((key, i) => [key, row[i]]));
    });
}
function seal(o) {
    o.field_provenance = Object.fromEntries(Object.keys(o.normalized_payload).map(k => [k, o.observation_id]));
    o.deduplication_key = observationDeduplicationKey(o); o.integrity_hash = observationDigest(o); return o;
}
function input() {
    return { policyVersion:data.policy_version,sourceInstanceRef:data.source_instance,
        catalog:structuredClone(data.catalog),coverage:structuredClone(data.coverage),
        observations:records().map(({id,evidence_state,...payload}) => seal({
            schema_version:0,observation_id:'obs-'+id,observation_version:1,previous_observation_id:null,
            source_type:'import',source_instance_ref:data.source_instance,source_record_ref:id,source_version:'v1',
            observed_at:data.clock,effective_at:data.clock,coverage:structuredClone(data.observation_coverage),
            evidence_state,origin_runtime:null,origin_operation_id:null,ingestion_policy_version:data.policy_version,
            normalized_payload:{...payload,currency:'BRL',status:'active'}
        })) };
}
function invocation(c) {
    const [scope,actor,period,timeBasis,evidenceState,filters] = c.q;
    assert.equal(c.q.length,6);
    return { query:{scope,period,timeBasis,evidenceState,...filters},
        context:{familyId:data.catalog.family_id,actorId:actor} };
}
function snapshot(f) { const {coverage,...kernel}=f; return projectObservations(kernel); }
function verify(c, f=input()) {
    const {query,context}=invocation(c), result=createExpenseReadModel(f).readConsumption(query,context);
    assert.equal(result.ok,true,c.id);
    assert.equal(result.resultKind,c.kind,c.id);
    assert.deepEqual(result.claim,{
        metric:'consumption_total',value:c.value,unit:'BRL_minor',
        entity:{kind:query.scope==='family'?'family':'person',ref:query.scope==='family'?context.familyId:context.actorId},
        period:{type:'calendar_period',value:query.period},timeBasis:query.timeBasis,evidenceState:query.evidenceState,
        filters:c.q[5]
    },c.id);
    assert.equal(result.coverage,'complete');
    assert.equal(result.evidence.coverage,'complete');assert.equal(result.evidence.state,query.evidenceState);
    assert.equal(result.evidence.asOf,data.clock);
    const observed=new Map(snapshot(f).events.map(e=>[e.event_id+':v'+e.event_version,e.observation_refs[0].slice(4)]));
    const refs=result.evidence.refs;
    const cov=f.coverage.find(x=>x.time_basis===query.timeBasis && x.evidence_state===query.evidenceState);
    // Independent serialization of the coverage identity; no call to kernel digest/canonicalizer.
    const canonical = x => x && typeof x==='object'
        ? Array.isArray(x) ? x.map(canonical) : Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])) : x;
    const coverageRef='cov_'+hash(JSON.stringify(canonical({family:data.catalog.family_id,sourceInstanceRef:data.source_instance,coverage:cov})));
    assert.deepEqual(refs.filter(r=>r.startsWith('cov_')),[coverageRef],c.id);
    assert.equal(new Set(refs).size,refs.length,c.id);
    const eventRefs=refs.filter(r=>!r.startsWith('cov_'));
    assert.ok(eventRefs.every(r=>observed.has(r)),c.id);
    assert.deepEqual(eventRefs.map(r=>observed.get(r)).sort(),[...c.records].sort(),c.id);
    return result;
}
const find = id => {const c=oracle.cases.find(c=>c.id===id);assert.ok(c,id);return c;};

test('NEXT02E:BASELINE frozen v1 stays intact and supplemental fields are explicit',()=>{
    for(const [name,digest]of Object.entries(traceability.baseline_hashes))
        assert.equal(hash(fs.readFileSync(path.join(dir,name),'utf8').replace(/\r\n/g,'\n')),digest,name);
    const old=json('golden-financial-fixture-v1.json'), rows=records(), byId=new Map(rows.map(r=>[r.id,r]));
    assert.equal(byId.size,17);assert.equal(old.events.length,16);
    for(const e of old.events){
        const r=byId.get(e.id);assert.ok(r,e.id);
        assert.equal(r.amount_minor,e.transfer_pair?e.amount_minor:Math.abs(e.amount_minor));
        assert.equal(r.person_id,e.person_id);assert.equal(r.account_id,e.account_id??null);
        assert.equal(r.card_id,e.card_id??null);assert.equal(r.evidence_state,e.state);
        if(!e.installment_plan)assert.equal(r.transaction_date,e.date);
        if(e.compensates){assert.equal(r.related_record_ref,e.compensates);assert.equal(r.category_id,byId.get(e.compensates).category_id);}
        else if(!e.category_id.startsWith('neutral.')) assert.equal(r.category_id,e.category_id);
        if(e.installment_plan){assert.equal(r.installment_purchase_ref,'purchase-plan-01');assert.equal(r.installment_index,e.installment_number);assert.equal(r.installment_total,e.installment_total);}
    }
    assert.equal(byId.get('purchase-plan-01').amount_minor,30000);
    assert.equal(byId.get('purchase-plan-01').transaction_date,'2042-05-20');
    assert.equal(old.events.some(e=>e.id==='purchase-plan-01'),false);
});
test('NEXT02E:CASES explicit values dimensions and exact evidence sets',()=>{
    assert.equal(oracle.cases.length,23);assert.equal(new Set(oracle.cases.map(c=>c.id)).size,23);
    for(const c of oracle.cases)verify(c);
});
test('NEXT02E:REFUSALS incomplete unavailable external scope and legacy lens never become values',()=>{
    assert.equal(oracle.refusals.length,5);
    for(const r of oracle.refusals){
        const f=input(),{query,context}=invocation(find(r.case));
        if(r.coverage==='absent') f.coverage=f.coverage.filter(x=>x.time_basis!==query.timeBasis || x.evidence_state!==query.evidenceState);
        else if(r.coverage) f.coverage.find(x=>x.time_basis===query.timeBasis && x.evidence_state===query.evidenceState).completeness=r.coverage;
        if(r.actor)context.actorId=r.actor;
        if(r.timeBasis)query.timeBasis=r.timeBasis;
        assert.deepEqual(createExpenseReadModel(f).readConsumption(query,context),{ok:false,reason:r.reason,coverage:r.result_coverage},r.id);
    }
});
test('NEXT02E:REFERENCES amount coincidence never replaces evidence identity or current links',()=>{
    for(const c of oracle.cases.filter(c=>c.records.length)){
        assert.throws(()=>verify({...c,records:c.records.slice(1)}),undefined,c.id+' omitted ref');
        assert.throws(()=>verify({...c,value:c.value+1}),undefined,c.id+' value drift');
    }
    const f=input(),o=f.observations.find(o=>o.source_record_ref==='evt-refund-b');
    o.normalized_payload.related_record_ref='evt-cinema-b';seal(o);
    assert.throws(()=>snapshot(f),/refund/);
    const sameTotal=input(),fuel=sameTotal.observations.find(o=>o.source_record_ref==='evt-fuel-a');
    fuel.normalized_payload.category_id='food.market';seal(fuel);
    verify(find('family-june'),sameTotal); // Total and evidence IDs remain identical.
    assert.throws(()=>verify(find('market-family'),sameTotal)); // Category semantics do not.
});
test('NEXT02E:MUTATIONS missing purchase competence coverage and subcategory fail causally',()=>{
    const f=input();f.observations=f.observations.filter(o=>o.source_record_ref!=='purchase-plan-01');
    assert.throws(()=>snapshot(f),/installment/);
    for(const id of ['evt-installment-1','evt-installment-2','evt-installment-3']){
        const m=input();m.observations=m.observations.filter(o=>o.source_record_ref!==id);
        const {query,context}=invocation(find('installment-june'));
        const r=createExpenseReadModel(m).readConsumption(query,context);assert.equal(r.ok,false);assert.equal(r.coverage,'incomplete');
    }
    for(const mutate of [o=>o.normalized_payload.billing_period=null,o=>o.normalized_payload.subcategory_id='gifts.other']){
        const m=input(),o=m.observations.find(o=>o.source_record_ref==='evt-installment-1');mutate(o);seal(o);
        assert.throws(()=>snapshot(m),/installment/);
    }
    const m=input(),o=m.observations.find(o=>o.source_record_ref==='evt-market-a');
    o.normalized_payload.subcategory_id=null;seal(o);
    const {query,context}=invocation(find('subcategory-market'));
    assert.equal(createExpenseReadModel(m).readConsumption(query,context).coverage,'incomplete');
});
test('NEXT02E:TRACEABILITY every legacy turn has an explicit non-promotional disposition',()=>{
    const turns=json('golden-claim-oracles-v1.json').turns;
    const ids=traceability.groups.flatMap(g=>g.turns);
    assert.equal(ids.length,56);assert.equal(new Set(ids).size,56);
    assert.deepEqual([...ids].sort(),Object.keys(turns).sort());
    assert.equal(Object.values(turns).reduce((n,t)=>n+(t.facts||[]).length,0),76);
    const cases=new Set([...oracle.cases,...oracle.refusals].map(c=>c.id));
    assert.equal(cases.size,28);
    for(const g of traceability.groups){
        assert.ok(['pending','invariant_only','changed_scenario','selected_events_equivalent'].includes(g.relation));
        assert.ok(g.remaining.length>20);assert.ok(g.cases.every(id=>cases.has(id)));
        assert.equal(g.cases.length===0,g.relation==='pending');
    }
});
test('NEXT02E:GATE corpus properties are executed without skips and runtime inventory remains closed',()=>{
    const policy=require('../scripts/agent/financasBotNext02ValidationPolicy');
    const contract=policy.sliceContract('N02-E');assert.equal(contract.paths.length,15);assert.equal(contract.properties.length,64);
    const events=contract.properties.map(p=>({type:'test:pass',data:{name:p.key+' property',nesting:0,details:{type:'test'},file:'/repo/tests/'+p.file}}));
    assert.deepEqual(policy.validatePropertyEvents(events,'N02-E').errors,[]);
    for(const patch of [{skip:true},{todo:true},{nesting:1},{file:'/repo/tests/wrong.js'}]){
        const m=structuredClone(events);Object.assign(m.at(-1).data,patch);assert.ok(policy.validatePropertyEvents(m,'N02-E').errors.length);
    }
    assert.ok(policy.validatePropertyEvents(events.slice(0,-1),'N02-E').errors.length);
    assert.ok(policy.validatePropertyEvents([...events,events.at(-1)],'N02-E').errors.length);
    const failed=structuredClone(events);failed.at(-1).type='test:fail';
    assert.ok(policy.validatePropertyEvents(failed,'N02-E').errors.length);
    assert.ok(policy.validatePropertyEvents(events.slice(0,-1).concat({type:'test:stdout',data:{message:events.at(-1).data.name}}),'N02-E').errors.length);
    assert.deepEqual(policy.inspectSources(path.resolve(__dirname,'../src/next'),'N02-E').errors,[]);
});
