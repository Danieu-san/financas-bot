'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {canonicalValue}=require('../src/next/kernel/canonicalValue');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const p=__dirname+'/';
const oldBytes=fs.readFileSync(p+'b4-02-pathv3-static11-qualified-ledger-20261021.json');
const newBytes=fs.readFileSync(p+'b4-02-pathv3-static-A11-qualified-ledger-20261022.json');
assert.equal(sha(oldBytes),'2b9f20c906cad0a9a098de34e194d0369304d74dfe5f2d1fe74692eb36e10ba8');
assert.equal(sha(newBytes),'810385e906ca7386002e7f9c5691c170ed59826a710d7250c68a1ce219460ead');
const a=JSON.parse(oldBytes),b=JSON.parse(newBytes),changed=[],historyChanged=[];
assert.equal(a.rows.length,2419);assert.equal(b.rows.length,2419);
for(let i=0;i<2419;i++){
    assert.equal(a.rows[i].target_id,b.rows[i].target_id);
    assert.equal(a.rows[i].qualification_id,b.rows[i].qualification_id);
    if(canonicalValue(a.rows[i])!==canonicalValue(b.rows[i]))changed.push(i);
    if(canonicalValue(a.historical_migration.rows[i].historical_record)!==
        canonicalValue(b.historical_migration.rows[i].historical_record))historyChanged.push(i);
    if(!changed.includes(i))assert.equal(canonicalValue(a.historical_migration.rows[i]),canonicalValue(b.historical_migration.rows[i]));
}
assert.deepEqual(changed,[64,533,668,836,883,1617,1950,2116,2211,2304,2357]);
assert.deepEqual(historyChanged,[]);
for(const i of changed){const r=b.rows[i];assert.equal(r.status,'verified');assert.equal(r.disposition,'static_domain_proof');
    assert.equal(r.semantic_mutation_credit,0);assert.equal(r.dp_execution,false);
    assert.ok(r.sites.every(s=>s.reviewed_L_A_W.L.length>0&&s.reviewed_L_A_W.A.length===0&&s.reviewed_L_A_W.W.length===0));}
assert.equal(b.rows.filter(r=>r.status==='verified').length,23);
assert.equal(b.rows.filter(r=>r.status==='blocked').length,2396);
assert.equal(b.rows.filter(r=>r.disposition==='static_domain_proof').length,22);
assert.equal(b.rows.filter(r=>r.disposition==='semantic_witness').length,1);
assert.equal(b.rows.filter(r=>r.dp_execution===true).length,1);
assert.equal(b.rows.reduce((n,r)=>n+r.semantic_mutation_credit,0),1);
for(const i of [140,1952])assert.equal(b.rows[i].status,'blocked');
for(const k of ['qualified','activated','financial_acceptance','validated_parent','globalGO','NEXT03'])assert.equal(b[k],false,k);
const out={stage:'independent_mechanical_readback_of_formal_static_A11_recording',sha256:sha(newBytes),bytes:newBytes.length,
    rows:2419,changed_original_indices:changed,historical_records_unchanged:2419,other_rows_unchanged:2408,
    verified:23,static_domain_proof:22,semantic_witness:1,blocked:2396,dp_execution_rows:1,semantic_mutation_credit:1,
    two_precompile_scopes_still_blocked:[140,1952],no_compiler_or_guest_execution:true,globalGO:false,NEXT03:false};
fs.writeFileSync(p+'b4-02-static-A11-ledger-independent-readback-20261022.json',JSON.stringify(out,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(out));
