'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { observationDigest, observationDeduplicationKey, projectObservations } = require('../src/next/kernel/observationKernel');
const { createExpenseReadModel, createExpenseToolGateway } = require('../src/next/kernel/expenseReadModel');
const clock = '2042-06-30T23:59:59.999Z';
const ctx = { familyId: 'fam-test', actorId: 'person-a' };
const query = { scope: 'family', period: '2042-06', timeBasis: 'billing_period', evidenceState: 'confirmed' };
function seal(o) {
    o.field_provenance = Object.fromEntries(Object.keys(o.normalized_payload).map(k => [k, o.observation_id]));
    o.deduplication_key = observationDeduplicationKey(o); o.integrity_hash = observationDigest(o); return o;
}
function fixture() {
    const catalog = { family_id: 'fam-test', people: [{id:'person-a'},{id:'person-b'}],
        accounts: [{id:'account-a',owner_id:'person-a'}], cards: [{id:'card-a',owner_id:'person-a'}],
        categories: [{id:'goods',kind:'expense'},{id:'services',kind:'expense'}],
        subcategories: [{id:'computer',category_id:'goods'},{id:'games',category_id:'goods'},
            {id:'repair',category_id:'services'}] };
    const coverage = ['transaction_date','billing_period'].flatMap(time_basis => ['confirmed','projected'].map(evidence_state =>
        ({time_basis,evidence_state,start:'2042-05-01',end:evidence_state==='confirmed'?'2042-06-30':'2042-08-31',as_of:clock,completeness:'complete'})));
    const observations = [['computer',6000],['games',4000]].map(([subcategory,amount],i) => seal({
        schema_version:0, observation_id:'obs-'+i, observation_version:1, previous_observation_id:null,
        source_type:'import',source_instance_ref:'synthetic',source_record_ref:'record-'+i,source_version:'v1',
        observed_at:clock,effective_at:clock,coverage:{start:'2042-05-01',end:'2042-06-30',as_of:clock,completeness:'complete'},
        evidence_state:'confirmed',origin_runtime:null,origin_operation_id:null,ingestion_policy_version:'next02-import-v4',
        normalized_payload:{record_type:'purchase',person_id:'person-a',account_id:null,card_id:'card-a',
            category_id:'goods',subcategory_id:subcategory,amount_minor:amount,currency:'BRL',transaction_date:'2042-05-20',
            status:'active',related_record_ref:null,transfer_ref:null,settles_card_id:null,installment_total:null,
            installment_index:null,installment_purchase_ref:null,billing_period:'2042-06'}
    }));
    return { observations,catalog,coverage,sourceInstanceRef:'synthetic',policyVersion:'next02-import-v4' };
}
const read = (f,patch={},context=ctx) => createExpenseReadModel(f).readConsumption({...query,...patch},context);
const snapshot = f => {const {coverage,...kernel}=f;return projectObservations(kernel);};

test('NEXT02D:TOTAL category includes each subcategory once',()=>{
    const f=fixture(); assert.equal(read(f,{category:'goods'}).claim.value,10000);
    assert.equal(read(f,{subcategory:'computer'}).claim.value,6000);
    assert.equal(read(f,{subcategory:'games'}).claim.value,4000);
    assert.equal(read(f,{category:'services'}).resultKind,'empty');
});
test('NEXT02D:CATALOG subcategory parent must exist and identities are unique',()=>{
    for(const mutate of [f=>f.catalog.subcategories[0].category_id='absent',
        f=>f.catalog.subcategories.push(f.catalog.subcategories[0]),
        f=>f.catalog.subcategories[0].extra=true]){
        const f=fixture();mutate(f);assert.throws(()=>snapshot(f),/catalog/);
    }
});
test('NEXT02D:BINDING event and query cannot cross category parents',()=>{
    const f=fixture(); assert.equal(read(f,{category:'services',subcategory:'computer'}).ok,false);
    assert.equal(read(f,{subcategory:'absent'}).ok,false);
    f.observations[0].normalized_payload.subcategory_id='repair';seal(f.observations[0]);
    assert.throws(()=>snapshot(f),/subcategory/);
});
test('NEXT02D:UNKNOWN null keeps category totals but cannot prove specific absence',()=>{
    const f=fixture();f.observations[0].normalized_payload.subcategory_id=null;seal(f.observations[0]);
    assert.equal(read(f,{category:'goods'}).claim.value,10000);
    assert.equal(read(f,{subcategory:'computer'}).coverage,'incomplete');
    assert.equal(read(f,{subcategory:'games'}).coverage,'incomplete');
    assert.equal(read(f,{subcategory:'repair'}).resultKind,'empty');
    assert.equal(read(f,{subcategory:'computer',period:'2042-05'}).resultKind,'empty');
    assert.equal(read(f,{subcategory:'computer',evidenceState:'projected'}).resultKind,'empty');
    assert.equal(read(f,{subcategory:'computer',scope:'personal'},{...ctx,actorId:'person-b'}).resultKind,'empty');
    f.observations[0].evidence_state='projected';seal(f.observations[0]);
    assert.equal(read(f,{subcategory:'computer'}).resultKind,'empty');
    assert.equal(read(f,{subcategory:'computer',evidenceState:'projected'}).coverage,'incomplete');
});
test('NEXT02D:REFUND compensating purchase must have the same subcategory',()=>{
    const f=fixture(),o=structuredClone(f.observations[0]);
    Object.assign(o,{observation_id:'obs-refund',source_record_ref:'refund'});
    Object.assign(o.normalized_payload,{record_type:'refund',amount_minor:2000,related_record_ref:'record-0',transaction_date:'2042-06-10'});
    f.observations.push(seal(o));assert.equal(read(f,{subcategory:'computer'}).claim.value,4000);
    o.normalized_payload.subcategory_id='games';seal(o);assert.throws(()=>snapshot(f),/refund_dimensions/);
});
test('NEXT02D:INSTALLMENT canonical installment link preserves subcategory',()=>{
    const f=fixture();f.observations=[f.observations[0]];
    Object.assign(f.observations[0].normalized_payload,{installment_total:2,billing_period:null});seal(f.observations[0]);
    for(let i=1;i<=2;i++){
        const o=structuredClone(f.observations[0]);Object.assign(o,{observation_id:'obs-part-'+i,source_record_ref:'part-'+i,evidence_state:i===1?'confirmed':'projected'});
        Object.assign(o.normalized_payload,{record_type:'installment',amount_minor:3000,installment_index:i,installment_purchase_ref:'record-0',billing_period:'2042-0'+(5+i)});
        f.observations.push(seal(o));
    }
    assert.equal(read(f,{subcategory:'computer'}).claim.value,3000);
    assert.equal(read(f,{subcategory:'computer',period:'2042-07',evidenceState:'projected'}).claim.value,3000);
    f.observations[1].normalized_payload.subcategory_id='games';seal(f.observations[1]);
    assert.throws(()=>snapshot(f),/installment_target/);
});
test('NEXT02D:PROVENANCE subcategory is signed and linked to exact observation',()=>{
    const f=fixture(),s=snapshot(f);const e=s.events.find(e=>e.subcategory_id==='computer');
    assert.deepEqual(e.field_provenance.subcategory_id,{observation_id:'obs-0',field:'subcategory_id'});
    f.observations[0].normalized_payload.subcategory_id='games';assert.throws(()=>snapshot(f),/integrity/);
});
test('NEXT02D:VERSIONS current subcategory supersedes prior version without identity merge',()=>{
    const f=fixture(),o=structuredClone(f.observations[0]);
    Object.assign(o,{observation_id:'obs-v2',observation_version:2,previous_observation_id:'obs-0',source_version:'v2'});
    o.normalized_payload.subcategory_id='games';f.observations.push(seal(o));
    assert.equal(read(f,{subcategory:'computer'}).resultKind,'empty');
    assert.equal(read(f,{subcategory:'games'}).claim.value,10000);
    assert.ok(read(f,{subcategory:'games'}).evidence.refs.some(r=>r.endsWith(':v2')));
    assert.equal(snapshot(f).history.filter(e=>e.subcategory_id==='computer').length,1);
    o.normalized_payload.status='tombstoned';seal(o);
    assert.equal(read(f,{subcategory:'games'}).claim.value,4000);
});
test('NEXT02D:SCOPE filters respect people lenses and evidence states',()=>{
    const f=fixture();assert.equal(read(f,{subcategory:'computer',scope:'personal'},{...ctx,actorId:'person-b'}).resultKind,'empty');
    assert.equal(read(f,{subcategory:'computer',timeBasis:'transaction_date',period:'2042-05'}).claim.value,6000);
    assert.equal(read(f,{subcategory:'computer',evidenceState:'projected'}).resultKind,'empty');
    assert.equal(read(f,{subcategory:'computer'}, {...ctx,familyId:'other'}).ok,false);
    f.catalog.cards.push({id:'card-b',owner_id:'person-b'});
    assert.equal(read(f,{subcategory:'computer',card:'card-b'}).resultKind,'empty');
    assert.equal(read(f,{subcategory:'computer',timeBasis:'transaction_date',period:'2042-05',account:'account-a'}).resultKind,'empty');
});
test('NEXT02D:OPTIN v4 does not silently replace earlier schemas',()=>{
    const f=fixture();for(const policyVersion of ['next02-import-v1','next02-import-v2','next02-import-v3']){
        assert.throws(()=>snapshot({...f,policyVersion}));
    }
    const before=structuredClone(f);assert.deepEqual(read(f),read({...f,observations:[...f.observations].reverse()}));
    assert.deepEqual(f,before);assert.equal(Object.isFrozen(snapshot(f).events),true);
});
test('NEXT02D:TOOL public subcategory selectors never expose internal ids',async()=>{
    const f=fixture();f.publicLabels={family:'Família Exemplo',people:{'person-a':'Pessoa A','person-b':'Pessoa B'},
        accounts:{'account-a':'Conta A'},cards:{'card-a':'Cartão A'},categories:{goods:'Bens',services:'Serviços'},
        subcategories:{computer:'Informática',games:'Jogos',repair:'Reparos'}};
    const gateway=createExpenseToolGateway(f);const execute=subcategory=>gateway.execute({request:{tool:'expenses.sum',args:{...query,subcategory}},trustedContext:ctx,budget:{reserve:()=>({ok:true})}});
    const result=await execute('Informática');assert.equal(result.claim.value,6000);
    assert.equal(result.claim.filters.subcategory,'Informática');assert.doesNotMatch(JSON.stringify(result),/computer|record-0|fam-test|person-a|evt_/);
    assert.equal((await execute('computer')).ok,false);
    const duplicate=structuredClone(f);duplicate.publicLabels.subcategories.games='Informática';
    assert.throws(()=>createExpenseToolGateway(duplicate),/public_labels_invalid/);
    const privateLabel=structuredClone(f);privateLabel.publicLabels.subcategories.computer='computer';
    assert.throws(()=>createExpenseToolGateway(privateLabel),/public_labels_invalid/);
});

test('NEXT02D:NEUTRAL neutral movements cannot acquire expense subcategories',()=>{
    const f=fixture(),o=structuredClone(f.observations[0]);
    Object.assign(o,{observation_id:'obs-payment',source_record_ref:'payment'});
    Object.assign(o.normalized_payload,{record_type:'invoice_payment',account_id:'account-a',card_id:null,
        category_id:null,subcategory_id:null,billing_period:null,settles_card_id:'card-a'});
    f.observations.push(seal(o));
    assert.equal(read(f,{subcategory:'computer'}).claim.value,6000);
    assert.equal(read(f,{subcategory:'computer',timeBasis:'transaction_date',period:'2042-05'}).claim.value,6000);
    o.normalized_payload.subcategory_id='computer';seal(o);assert.throws(()=>snapshot(f),/subcategory/);
});

test('NEXT02D:GATE subcategory IDs bind to executed properties without enlarging runtime tree',()=>{
    const path=require('node:path'),policy=require('../scripts/agent/financasBotNext02ValidationPolicy');
    const contract=policy.sliceContract('N02-D');
    const events=contract.properties.map(p=>({type:'test:pass',data:{name:p.key+' property',nesting:0,
        details:{type:'test'},file:'/repo/tests/'+p.file}}));
    assert.equal(contract.properties.length,57);assert.equal(contract.paths.length,15);
    assert.deepEqual(policy.validatePropertyEvents(events,'N02-D').errors,[]);
    for(const patch of [{skip:true},{todo:true},{nesting:1},{file:'/repo/tests/wrong.js'}]){
        const mutated=structuredClone(events);Object.assign(mutated.at(-1).data,patch);
        assert.ok(policy.validatePropertyEvents(mutated,'N02-D').errors.length);
    }
    assert.ok(policy.validatePropertyEvents(events.slice(0,-1),'N02-D').errors.length);
    assert.ok(policy.validatePropertyEvents([...events,events.at(-1)],'N02-D').errors.length);
    const failed=structuredClone(events);failed.at(-1).type='test:fail';
    assert.ok(policy.validatePropertyEvents(failed,'N02-D').errors.length);
    const spoof=events.slice(0,-1).concat({type:'test:stdout',data:{message:events.at(-1).data.name}});
    assert.ok(policy.validatePropertyEvents(spoof,'N02-D').errors.length);
    assert.deepEqual(policy.inspectSources(path.resolve(__dirname,'../src/next'),'N02-D').errors,[]);
});
