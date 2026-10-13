# Fronteira D — corpos gerados únicos integrais

CODE cf6e43cbaa7c378f2b64590c50d0818700a3bdd0. Factories exatas que não têm corpo original byte-idêntico no universo307; nenhuma avaliação ou replay.

## SHA256 f52bfc4ab544b75569a0d17b3bb737d64ed1950329bfd52bcabe83af84ab72ba | 5133 bytes | usos [{"bundle":"docs/audit-evidence/n02g-causal-authoring-profile/path-v3-complete-code-review-20261012/artifacts/path-qualification-compiler.js","module":"provenance/claimMonthProofConformance.js","index":9},{"bundle":"docs/audit-evidence/n02g-causal-authoring-profile/path-v3-complete-code-review-20261012/artifacts/host-bootstrap.js","module":"provenance/claimMonthProofConformance.js","index":9}]

```text
'use strict';
// Independent syntax conformance: no compiler, lowerer, evaluator or guest
// imports/execution. The expected target comes from the profile's authored
// period contract, never from the emitted mutant expression/site map.
const { parse } = require("../vendor/acorn");
const { copyData } = require('./observationContract');
const { types } = require('node:util');
const sealed = new WeakMap();
const fail = code => { throw new Error(`month_proof_sites_${code}`); };
const q = JSON.stringify;
function tree(source) {
    if (typeof source !== 'string' || Buffer.byteLength(source) > 8 * 1024 * 1024) fail('source');
    try { return parse(source, { ecmaVersion: 2020 }); } catch { fail('syntax'); }
}
function clean(row) {
    if (Array.isArray(row)) return row.map(clean);
    if (!row || typeof row !== 'object') return row;
    return Object.fromEntries(Object.entries(row).filter(([key]) => !['start', 'end', 'raw'].includes(key))
        .map(([key, value]) => [key, clean(value)]));
}
function walk(node, visit) {
    if (!node || typeof node !== 'object') return;
    if (typeof node.type === 'string') visit(node);
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
}
const label = id => 'proof_assertion_' + Buffer.from(id, 'utf8').toString('hex');
function sites(ast) {
    const rows = new Map();
    walk(ast, node => {
        if (node.type !== 'LabeledStatement' || !node.label.name.startsWith('proof_assertion_')) return;
        if (rows.has(node.label.name) || node.body.type !== 'BlockStatement' || node.body.body.length !== 1) fail('sites');
        rows.set(node.label.name, node);
    });
    return rows;
}
function targetLine(period, mutant) {
    const receiver = mutant ? 'operands.qualification().get("qualification").get("alternative_period")' : 'operands.claim().get("period")';
    const type = q({ form: 'period', periodKind: 'month' });
    const operator = q({ id: 'period_eq', args: ['period', 'period'], semantics: 'equal_period_kind_and_fields' });
    return `if(!scalar(${operator},`
        + `[{type:${type},value:period(${receiver},true)},{type:${type},value:${q(period)}}]))all=false;`;
}
function statement(source) { return tree(source).body[0]; }
function sealClaimMonthProofExpectation(raw) {
    if (!raw || typeof raw !== 'object' || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const keys = ['baselineSource', 'predicateId', 'predicateIds', 'originalPeriod', 'variant'];
    const fields = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(fields).length !== keys.length || keys.some(key => !fields[key]?.enumerable
        || !Object.hasOwn(fields[key], 'value'))) fail('input');
    const source = fields.baselineSource.value; const ast = tree(source);
    const data = structuredClone(copyData(Object.fromEntries(keys.filter(key => key !== 'baselineSource').map(key => [key, fields[key].value]))));
    if (!['C', 'M', 'S'].includes(data.variant) || !Array.isArray(data.predicateIds)
        || new Set(data.predicateIds).size !== data.predicateIds.length
        || data.predicateIds.filter(id => id === data.predicateId).length !== 1
        || data.originalPeriod.kind !== 'month' || !/^(?!0000)[0-9]{4}-(0[1-9]|1[0-2])$/.test(data.originalPeriod.value)) fail('input');
    const baseline = sites(ast);
    if (baseline.size !== data.predicateIds.length || data.predicateIds.some(id => !baseline.has(label(id)))) fail('sites');
    if (q(clean(baseline.get(label(data.predicateId)).body.body[0])) !== q(clean(statement(targetLine(data.originalPeriod, false))))) fail('baseline_target');
    const expected = new Map();
    for (const id of data.predicateIds) {
        const body = baseline.get(label(id)).body.body[0];
        const line = id === data.predicateId ? targetLine(data.originalPeriod, data.variant === 'M') : source.slice(body.start, body.end);
        expected.set(label(id), clean(statement(`if(!operands.assertion(${q(id)},()=>{let all=true;${line}return all;}))all=false;`)));
    }
    const receipt = Object.freeze({ stage: 'month_proof_expectation_sealed_only', profile_witness_qualified: false });
    sealed.set(receipt, { ast, baseline, expected }); return receipt;
}
function verifyClaimMonthProofSource(receipt, source) {
    const authority = sealed.get(receipt); if (!authority) fail('authority');
    const ast = tree(source); const observed = sites(ast);
    if (observed.size !== authority.expected.size) fail('sites');
    for (const [name, expected] of authority.expected) {
        const row = observed.get(name);
        if (!row || q(clean(row.body.body[0])) !== q(expected)) fail('target_or_site');
        row.body = authority.baseline.get(name).body;
    }
    if (q(clean(ast)) !== q(clean(authority.ast))) fail('collateral');
    return Object.freeze({ authorship_program_conformance: true, profile_witness_qualified: false });
}
module.exports = { sealClaimMonthProofExpectation, verifyClaimMonthProofSource };
```

## SHA256 376a26189a148bba63d1cea7d2712235f94875ecff956910cc55a5e0900c3c2e | 286 bytes | usos [{"bundle":"docs/audit-evidence/n02g-causal-authoring-profile/path-v3-complete-code-review-20261012/artifacts/path-qualification-compiler.js","module":"vendor/ajvEqual.js","index":51},{"bundle":"docs/audit-evidence/n02g-causal-authoring-profile/path-v3-complete-code-review-20261012/artifacts/host-bootstrap.js","module":"vendor/ajvEqual.js","index":51}]

```text
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// https://github.com/ajv-validator/ajv/issues/889
const equal = require("./fastDeepEqual");
equal.code = 'require("ajv/dist/runtime/equal").default';
exports.default = equal;
//# sourceMappingURL=equal.js.map
```

## SHA256 24896a0cab35d63754000c3fcbed21323942a1b0bbee735a4d693e897d42de51 | 690344 bytes | usos [{"bundle":"docs/audit-evidence/n02g-causal-authoring-profile/path-v3-complete-code-review-20261012/artifacts/path-qualification-compiler.js","module":"vendor/schemaValidators.js","index":54},{"bundle":"docs/audit-evidence/n02g-causal-authoring-profile/path-v3-complete-code-review-20261012/artifacts/host-bootstrap.js","module":"vendor/schemaValidators.js","index":54}]

```text
"use strict";
exports.claims = validate10;
const schema11 = {"$schema":"http://json-schema.org/draft-07/schema#","$id":"urn:financasbot:next:claim-contract:2","title":"N02-F internal authored claim contract (not runtime output or public envelope)","type":"object","additionalProperties":false,"required":["schema_version","contract_id","claims"],"properties":{"schema_version":{"const":2},"contract_id":{"$ref":"#/definitions/id"},"claims":{"type":"array","minItems":1,"items":{"$ref":"#/definitions/claim"}}},"definitions":{"id":{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},"alias":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"},"factKey":{"type":"string","pattern":"^[SMFN]-[0-9]{2}#[1-9][0-9]*#[1-9][0-9]*$"},"date":{"type":"string","pattern":"^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$","format":"date"},"month":{"type":"string","pattern":"^[0-9]{4}-(0[1-9]|1[0-2])$"},"evaluatorRef":{"type":"object","additionalProperties":false,"required":["evaluator_id","evaluator_version"],"properties":{"evaluator_id":{"$ref":"#/definitions/alias"},"evaluator_version":{"type":"integer","minimum":1}}},"binding":{"oneOf":[{"type":"object","additionalProperties":false,"required":["kind"],"properties":{"kind":{"const":"claim_context"}}},{"type":"object","additionalProperties":false,"required":["kind","alias"],"properties":{"kind":{"const":"node"},"alias":{"$ref":"#/definitions/alias"}}},{"type":"object","additionalProperties":false,"required":["kind","aliases"],"properties":{"kind":{"const":"node_set"},"aliases":{"type":"array","uniqueItems":true,"items":{"$ref":"#/definitions/alias"}}}},{"type":"object","additionalProperties":false,"required":["kind","fact_key"],"properties":{"kind":{"const":"parent_claim"},"fact_key":{"$ref":"#/definitions/factKey"}}}]},"subject":{"oneOf":[{"type":"object","additionalProperties":false,"required":["kind","person_ids"],"properties":{"kind":{"const":"person_comparison"},"person_ids":{"type":"array","minItems":2,"maxItems":2,"uniqueItems":true,"items":{"$ref":"#/definitions/id"}}}},{"type":"object","additionalProperties":false,"required":["kind","ref_id"],"properties":{"kind":{"enum":["family","person","account","card","category","event","transfer_pair","installment_plan","budget","bill","source","merchant","turn"]},"ref_id":{"$ref":"#/definitions/id"}}},{"type":"object","additionalProperties":false,"required":["kind","family_id","category_id"],"properties":{"kind":{"const":"family_category"},"family_id":{"$ref":"#/definitions/id"},"category_id":{"$ref":"#/definitions/id"}}},{"type":"object","additionalProperties":false,"required":["kind","person_id","category_id"],"properties":{"kind":{"const":"person_category"},"person_id":{"$ref":"#/definitions/id"},"category_id":{"$ref":"#/definitions/id"}}},{"type":"object","additionalProperties":false,"required":["kind","budget_id","person_id"],"properties":{"kind":{"const":"budget_person"},"budget_id":{"$ref":"#/definitions/id"},"person_id":{"$ref":"#/definitions/id"}}}]},"period":{"oneOf":[{"type":"object","additionalProperties":false,"required":["kind","value"],"properties":{"kind":{"enum":["date","as_of","through","statement_due"]},"value":{"$ref":"#/definitions/date"}}},{"type":"object","additionalProperties":false,"required":["kind","value"],"properties":{"kind":{"enum":["month","statement_competence","budget_cycle"]},"value":{"$ref":"#/definitions/month"}}},{"type":"object","additionalProperties":false,"required":["kind","start","end","start_inclusive","end_inclusive"],"properties":{"kind":{"const":"range"},"start":{"$ref":"#/definitions/date"},"end":{"$ref":"#/definitions/date"},"start_inclusive":{"type":"boolean"},"end_inclusive":{"type":"boolean"}}},{"type":"object","additionalProperties":false,"required":["kind","snapshot_version"],"properties":{"kind":{"const":"registry_snapshot"},"snapshot_version":{"$ref":"#/definitions/id"}}},{"type":"object","additionalProperties":false,"required":["kind","turn_id"],"properties":{"kind":{"const":"request_execution"},"turn_id":{"type":"string","pattern":"^[SMFN]-[0-9]{2}#[1-9][0-9]*$"}}}]},"claim":{"type":"object","additionalProperties":false,"required":["claim_id","fact_key","metric","unit","subject","period","time_basis","coverage","evidence_state","evaluator_ref","operand_bindings"],"properties":{"claim_id":{"$ref":"#/definitions/id"},"fact_key":{"$ref":"#/definitions/factKey"},"metric":{"$ref":"#/definitions/alias"},"unit":{"enum":["BRL_minor","count","entity_ids","state"]},"subject":{"$ref":"#/definitions/subject"},"period":{"$ref":"#/definitions/period"},"time_basis":{"enum":["event_date","transaction_date","billing_period","budget_cycle","due_date","settlement_date","installment_competence","mixed_declared","registry_current","request_execution","scheduled_at","source_period","statement_competence","statement_due_date","15_full_days_after_as_of"]},"coverage":{"enum":["complete","partial","unavailable"]},"evidence_state":{"enum":["confirmed","projected","estimated"]},"evaluator_ref":{"$ref":"#/definitions/evaluatorRef"},"operand_bindings":{"type":"object","minProperties":1,"propertyNames":{"$ref":"#/definitions/alias"},"additionalProperties":{"$ref":"#/definitions/binding"}},"filters":{"type":"object","additionalProperties":false,"required":["budget_class"],"properties":{"budget_class":{"enum":["essential","flexible"]}}}}}}};
const schema12 = {"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"};
const func0 = Object.prototype.hasOwnProperty;
const pattern0 = new RegExp("^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$", "u");
const schema13 = {"type":"object","additionalProperties":false,"required":["claim_id","fact_key","metric","unit","subject","period","time_basis","coverage","evidence_state","evaluator_ref","operand_bindings"],"properties":{"claim_id":{"$ref":"#/definitions/id"},"fact_key":{"$ref":"#/definitions/factKey"},"metric":{"$ref":"#/definitions/alias"},"unit":{"enum":["BRL_minor","count","entity_ids","state"]},"subject":{"$ref":"#/definitions/subject"},"period":{"$ref":"#/definitions/period"},"time_basis":{"enum":["event_date","transaction_date","billing_period","budget_cycle","due_date","settlement_date","installment_competence","mixed_declared","registry_current","request_execution","scheduled_at","source_period","statement_competence","statement_due_date","15_full_days_after_as_of"]},"coverage":{"enum":["complete","partial","unavailable"]},"evidence_state":{"enum":["confirmed","projected","estimated"]},"evaluator_ref":{"$ref":"#/definitions/evaluatorRef"},"operand_bindings":{"type":"object","minProperties":1,"propertyNames":{"$ref":"#/definitions/alias"},"additionalProperties":{"$ref":"#/definitions/binding"}},"filters":{"type":"object","additionalProperties":false,"required":["budget_class"],"properties":{"budget_class":{"enum":["essential","flexible"]}}}}};
const schema15 = {"type":"string","pattern":"^[SMFN]-[0-9]{2}#[1-9][0-9]*#[1-9][0-9]*$"};
const schema16 = {"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"};
const pattern2 = new RegExp("^[SMFN]-[0-9]{2}#[1-9][0-9]*#[1-9][0-9]*$", "u");
const pattern3 = new RegExp("^[a-z][a-z0-9_]{0,63}$", "u");
const schema17 = {"oneOf":[{"type":"object","additionalProperties":false,"required":["kind","person_ids"],"properties":{"kind":{"const":"person_comparison"},"person_ids":{"type":"array","minItems":2,"maxItems":2,"uniqueItems":true,"items":{"$ref":"#/definitions/id"}}}},{"type":"object","additionalProperties":false,"required":["kind","ref_id"],"properties":{"kind":{"enum":["family","person","account","card","category","event","transfer_pair","installment_plan","budget","bill","source","merchant","turn"]},"ref_id":{"$ref":"#/definitions/id"}}},{"type":"object","additionalProperties":false,"required":["kind","family_id","category_id"],"properties":{"kind":{"const":"family_category"},"family_id":{"$ref":"#/definitions/id"},"category_id":{"$ref":"#/definitions/id"}}},{"type":"object","additionalProperties":false,"required":["kind","person_id","category_id"],"properties":{"kind":{"const":"person_category"},"person_id":{"$ref":"#/definitions/id"},"category_id":{"$ref":"#/definitions/id"}}},{"type":"object","additionalProperties":false,"required":["kind","budget_id","person_id"],"properties":{"kind":{"const":"budget_person"},"budget_id":{"$ref":"#/definitions/id"},"person_id":{"$ref":"#/definitions/id"}}}]};
const func32 = require("./ajvEqual").default;

function validate12(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.person_ids === undefined) || (!(func0.call(data, "person_ids")))){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "person_ids"},message:"must have required property '"+"person_ids"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!((key0 === "kind") || (key0 === "person_ids"))){
const err2 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("person_comparison" !== data.kind){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "person_comparison"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.person_ids !== undefined && func0.call(data, "person_ids")){
let data1 = data.person_ids;
if(Array.isArray(data1)){
if(data1.length > 2){
const err4 = {instancePath:instancePath+"/person_ids",schemaPath:"#/oneOf/0/properties/person_ids/maxItems",keyword:"maxItems",params:{limit: 2},message:"must NOT have more than 2 items"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data1.length < 2){
const err5 = {instancePath:instancePath+"/person_ids",schemaPath:"#/oneOf/0/properties/person_ids/minItems",keyword:"minItems",params:{limit: 2},message:"must NOT have fewer than 2 items"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
const len0 = data1.length;
for(let i0=0; i0<len0; i0++){
let data2 = data1[i0];
if(typeof data2 === "string"){
if(!pattern0.test(data2)){
const err6 = {instancePath:instancePath+"/person_ids/" + i0,schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/person_ids/" + i0,schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
let i1 = data1.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func32(data1[i1], data1[j0])){
const err8 = {instancePath:instancePath+"/person_ids",schemaPath:"#/oneOf/0/properties/person_ids/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err9 = {instancePath:instancePath+"/person_ids",schemaPath:"#/oneOf/0/properties/person_ids/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
}
else {
const err10 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs10 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err11 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if((data.ref_id === undefined) || (!(func0.call(data, "ref_id")))){
const err12 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "ref_id"},message:"must have required property '"+"ref_id"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
for(const key1 of Object.keys(data)){
if(!((key1 === "kind") || (key1 === "ref_id"))){
const err13 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
let data3 = data.kind;
if(!(((((((((((((data3 === "family") || (data3 === "person")) || (data3 === "account")) || (data3 === "card")) || (data3 === "category")) || (data3 === "event")) || (data3 === "transfer_pair")) || (data3 === "installment_plan")) || (data3 === "budget")) || (data3 === "bill")) || (data3 === "source")) || (data3 === "merchant")) || (data3 === "turn"))){
const err14 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema17.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.ref_id !== undefined && func0.call(data, "ref_id")){
let data4 = data.ref_id;
if(typeof data4 === "string"){
if(!pattern0.test(data4)){
const err15 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
else {
const err16 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
}
else {
const err17 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
var _valid0 = _errs10 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
}
const _errs17 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err18 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if((data.family_id === undefined) || (!(func0.call(data, "family_id")))){
const err19 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "family_id"},message:"must have required property '"+"family_id"+"'"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if((data.category_id === undefined) || (!(func0.call(data, "category_id")))){
const err20 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "category_id"},message:"must have required property '"+"category_id"+"'"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
for(const key2 of Object.keys(data)){
if(!(((key2 === "kind") || (key2 === "family_id")) || (key2 === "category_id"))){
const err21 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("family_category" !== data.kind){
const err22 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "family_category"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.family_id !== undefined && func0.call(data, "family_id")){
let data6 = data.family_id;
if(typeof data6 === "string"){
if(!pattern0.test(data6)){
const err23 = {instancePath:instancePath+"/family_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
else {
const err24 = {instancePath:instancePath+"/family_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data.category_id !== undefined && func0.call(data, "category_id")){
let data7 = data.category_id;
if(typeof data7 === "string"){
if(!pattern0.test(data7)){
const err25 = {instancePath:instancePath+"/category_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
else {
const err26 = {instancePath:instancePath+"/category_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
}
else {
const err27 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
var _valid0 = _errs17 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
}
const _errs27 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err28 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if((data.person_id === undefined) || (!(func0.call(data, "person_id")))){
const err29 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "person_id"},message:"must have required property '"+"person_id"+"'"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if((data.category_id === undefined) || (!(func0.call(data, "category_id")))){
const err30 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "category_id"},message:"must have required property '"+"category_id"+"'"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
for(const key3 of Object.keys(data)){
if(!(((key3 === "kind") || (key3 === "person_id")) || (key3 === "category_id"))){
const err31 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("person_category" !== data.kind){
const err32 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "person_category"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data.person_id !== undefined && func0.call(data, "person_id")){
let data9 = data.person_id;
if(typeof data9 === "string"){
if(!pattern0.test(data9)){
const err33 = {instancePath:instancePath+"/person_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
else {
const err34 = {instancePath:instancePath+"/person_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data.category_id !== undefined && func0.call(data, "category_id")){
let data10 = data.category_id;
if(typeof data10 === "string"){
if(!pattern0.test(data10)){
const err35 = {instancePath:instancePath+"/category_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
else {
const err36 = {instancePath:instancePath+"/category_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
}
else {
const err37 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
var _valid0 = _errs27 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
}
const _errs37 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err38 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
if((data.budget_id === undefined) || (!(func0.call(data, "budget_id")))){
const err39 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "budget_id"},message:"must have required property '"+"budget_id"+"'"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
if((data.person_id === undefined) || (!(func0.call(data, "person_id")))){
const err40 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "person_id"},message:"must have required property '"+"person_id"+"'"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
for(const key4 of Object.keys(data)){
if(!(((key4 === "kind") || (key4 === "budget_id")) || (key4 === "person_id"))){
const err41 = {instancePath,schemaPath:"#/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("budget_person" !== data.kind){
const err42 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/4/properties/kind/const",keyword:"const",params:{allowedValue: "budget_person"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
if(data.budget_id !== undefined && func0.call(data, "budget_id")){
let data12 = data.budget_id;
if(typeof data12 === "string"){
if(!pattern0.test(data12)){
const err43 = {instancePath:instancePath+"/budget_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
else {
const err44 = {instancePath:instancePath+"/budget_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
}
if(data.person_id !== undefined && func0.call(data, "person_id")){
let data13 = data.person_id;
if(typeof data13 === "string"){
if(!pattern0.test(data13)){
const err45 = {instancePath:instancePath+"/person_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
else {
const err46 = {instancePath:instancePath+"/person_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
}
else {
const err47 = {instancePath,schemaPath:"#/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
var _valid0 = _errs37 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid0 = true;
passing0 = 4;
}
}
}
}
}
if(!valid0){
const err48 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate12.errors = vErrors;
return errors === 0;
}

const schema26 = {"oneOf":[{"type":"object","additionalProperties":false,"required":["kind","value"],"properties":{"kind":{"enum":["date","as_of","through","statement_due"]},"value":{"$ref":"#/definitions/date"}}},{"type":"object","additionalProperties":false,"required":["kind","value"],"properties":{"kind":{"enum":["month","statement_competence","budget_cycle"]},"value":{"$ref":"#/definitions/month"}}},{"type":"object","additionalProperties":false,"required":["kind","start","end","start_inclusive","end_inclusive"],"properties":{"kind":{"const":"range"},"start":{"$ref":"#/definitions/date"},"end":{"$ref":"#/definitions/date"},"start_inclusive":{"type":"boolean"},"end_inclusive":{"type":"boolean"}}},{"type":"object","additionalProperties":false,"required":["kind","snapshot_version"],"properties":{"kind":{"const":"registry_snapshot"},"snapshot_version":{"$ref":"#/definitions/id"}}},{"type":"object","additionalProperties":false,"required":["kind","turn_id"],"properties":{"kind":{"const":"request_execution"},"turn_id":{"type":"string","pattern":"^[SMFN]-[0-9]{2}#[1-9][0-9]*$"}}}]};
const schema27 = {"type":"string","pattern":"^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$","format":"date"};
const schema28 = {"type":"string","pattern":"^[0-9]{4}-(0[1-9]|1[0-2])$"};
const formats0 = require("./formats").fullFormats.date;
const pattern12 = new RegExp("^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$", "u");
const pattern13 = new RegExp("^[0-9]{4}-(0[1-9]|1[0-2])$", "u");
const pattern17 = new RegExp("^[SMFN]-[0-9]{2}#[1-9][0-9]*$", "u");

function validate14(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.value === undefined) || (!(func0.call(data, "value")))){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!((key0 === "kind") || (key0 === "value"))){
const err2 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
let data0 = data.kind;
if(!((((data0 === "date") || (data0 === "as_of")) || (data0 === "through")) || (data0 === "statement_due"))){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema26.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.value !== undefined && func0.call(data, "value")){
let data1 = data.value;
if(typeof data1 === "string"){
if(!pattern12.test(data1)){
const err4 = {instancePath:instancePath+"/value",schemaPath:"#/definitions/date/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"},message:"must match pattern \""+"^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"+"\""};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(!(formats0.validate(data1))){
const err5 = {instancePath:instancePath+"/value",schemaPath:"#/definitions/date/format",keyword:"format",params:{format: "date"},message:"must match format \""+"date"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/value",schemaPath:"#/definitions/date/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
else {
const err7 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs8 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err8 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if((data.value === undefined) || (!(func0.call(data, "value")))){
const err9 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
for(const key1 of Object.keys(data)){
if(!((key1 === "kind") || (key1 === "value"))){
const err10 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
let data2 = data.kind;
if(!(((data2 === "month") || (data2 === "statement_competence")) || (data2 === "budget_cycle"))){
const err11 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema26.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.value !== undefined && func0.call(data, "value")){
let data3 = data.value;
if(typeof data3 === "string"){
if(!pattern13.test(data3)){
const err12 = {instancePath:instancePath+"/value",schemaPath:"#/definitions/month/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$"},message:"must match pattern \""+"^[0-9]{4}-(0[1-9]|1[0-2])$"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/value",schemaPath:"#/definitions/month/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
else {
const err14 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
var _valid0 = _errs8 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
}
const _errs15 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err15 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if((data.start === undefined) || (!(func0.call(data, "start")))){
const err16 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "start"},message:"must have required property '"+"start"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if((data.end === undefined) || (!(func0.call(data, "end")))){
const err17 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "end"},message:"must have required property '"+"end"+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if((data.start_inclusive === undefined) || (!(func0.call(data, "start_inclusive")))){
const err18 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "start_inclusive"},message:"must have required property '"+"start_inclusive"+"'"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if((data.end_inclusive === undefined) || (!(func0.call(data, "end_inclusive")))){
const err19 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "end_inclusive"},message:"must have required property '"+"end_inclusive"+"'"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
for(const key2 of Object.keys(data)){
if(!(((((key2 === "kind") || (key2 === "start")) || (key2 === "end")) || (key2 === "start_inclusive")) || (key2 === "end_inclusive"))){
const err20 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("range" !== data.kind){
const err21 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "range"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.start !== undefined && func0.call(data, "start")){
let data5 = data.start;
if(typeof data5 === "string"){
if(!pattern12.test(data5)){
const err22 = {instancePath:instancePath+"/start",schemaPath:"#/definitions/date/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"},message:"must match pattern \""+"^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"+"\""};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(!(formats0.validate(data5))){
const err23 = {instancePath:instancePath+"/start",schemaPath:"#/definitions/date/format",keyword:"format",params:{format: "date"},message:"must match format \""+"date"+"\""};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
else {
const err24 = {instancePath:instancePath+"/start",schemaPath:"#/definitions/date/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data.end !== undefined && func0.call(data, "end")){
let data6 = data.end;
if(typeof data6 === "string"){
if(!pattern12.test(data6)){
const err25 = {instancePath:instancePath+"/end",schemaPath:"#/definitions/date/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"},message:"must match pattern \""+"^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"+"\""};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(!(formats0.validate(data6))){
const err26 = {instancePath:instancePath+"/end",schemaPath:"#/definitions/date/format",keyword:"format",params:{format: "date"},message:"must match format \""+"date"+"\""};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
else {
const err27 = {instancePath:instancePath+"/end",schemaPath:"#/definitions/date/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.start_inclusive !== undefined && func0.call(data, "start_inclusive")){
if(typeof data.start_inclusive !== "boolean"){
const err28 = {instancePath:instancePath+"/start_inclusive",schemaPath:"#/oneOf/2/properties/start_inclusive/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data.end_inclusive !== undefined && func0.call(data, "end_inclusive")){
if(typeof data.end_inclusive !== "boolean"){
const err29 = {instancePath:instancePath+"/end_inclusive",schemaPath:"#/oneOf/2/properties/end_inclusive/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
}
else {
const err30 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
var _valid0 = _errs15 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
}
const _errs29 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err31 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
if((data.snapshot_version === undefined) || (!(func0.call(data, "snapshot_version")))){
const err32 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "snapshot_version"},message:"must have required property '"+"snapshot_version"+"'"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
for(const key3 of Object.keys(data)){
if(!((key3 === "kind") || (key3 === "snapshot_version"))){
const err33 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("registry_snapshot" !== data.kind){
const err34 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "registry_snapshot"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data.snapshot_version !== undefined && func0.call(data, "snapshot_version")){
let data10 = data.snapshot_version;
if(typeof data10 === "string"){
if(!pattern0.test(data10)){
const err35 = {instancePath:instancePath+"/snapshot_version",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
else {
const err36 = {instancePath:instancePath+"/snapshot_version",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
}
else {
const err37 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
var _valid0 = _errs29 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
}
const _errs36 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err38 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
if((data.turn_id === undefined) || (!(func0.call(data, "turn_id")))){
const err39 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "turn_id"},message:"must have required property '"+"turn_id"+"'"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
for(const key4 of Object.keys(data)){
if(!((key4 === "kind") || (key4 === "turn_id"))){
const err40 = {instancePath,schemaPath:"#/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("request_execution" !== data.kind){
const err41 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/4/properties/kind/const",keyword:"const",params:{allowedValue: "request_execution"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
if(data.turn_id !== undefined && func0.call(data, "turn_id")){
let data12 = data.turn_id;
if(typeof data12 === "string"){
if(!pattern17.test(data12)){
const err42 = {instancePath:instancePath+"/turn_id",schemaPath:"#/oneOf/4/properties/turn_id/pattern",keyword:"pattern",params:{pattern: "^[SMFN]-[0-9]{2}#[1-9][0-9]*$"},message:"must match pattern \""+"^[SMFN]-[0-9]{2}#[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
else {
const err43 = {instancePath:instancePath+"/turn_id",schemaPath:"#/oneOf/4/properties/turn_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
}
else {
const err44 = {instancePath,schemaPath:"#/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
var _valid0 = _errs36 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid0 = true;
passing0 = 4;
}
}
}
}
}
if(!valid0){
const err45 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate14.errors = vErrors;
return errors === 0;
}

const schema32 = {"type":"object","additionalProperties":false,"required":["evaluator_id","evaluator_version"],"properties":{"evaluator_id":{"$ref":"#/definitions/alias"},"evaluator_version":{"type":"integer","minimum":1}}};

function validate16(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.evaluator_id === undefined) || (!(func0.call(data, "evaluator_id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "evaluator_id"},message:"must have required property '"+"evaluator_id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.evaluator_version === undefined) || (!(func0.call(data, "evaluator_version")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "evaluator_version"},message:"must have required property '"+"evaluator_version"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!((key0 === "evaluator_id") || (key0 === "evaluator_version"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.evaluator_id !== undefined && func0.call(data, "evaluator_id")){
let data0 = data.evaluator_id;
if(typeof data0 === "string"){
if(!pattern3.test(data0)){
const err3 = {instancePath:instancePath+"/evaluator_id",schemaPath:"#/definitions/alias/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
else {
const err4 = {instancePath:instancePath+"/evaluator_id",schemaPath:"#/definitions/alias/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.evaluator_version !== undefined && func0.call(data, "evaluator_version")){
let data1 = data.evaluator_version;
if(!(((typeof data1 == "number") && (!(data1 % 1) && !isNaN(data1))) && (isFinite(data1)))){
const err5 = {instancePath:instancePath+"/evaluator_version",schemaPath:"#/properties/evaluator_version/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if((typeof data1 == "number") && (isFinite(data1))){
if(data1 < 1 || isNaN(data1)){
const err6 = {instancePath:instancePath+"/evaluator_version",schemaPath:"#/properties/evaluator_version/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
}
else {
const err7 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
validate16.errors = vErrors;
return errors === 0;
}

const schema35 = {"oneOf":[{"type":"object","additionalProperties":false,"required":["kind"],"properties":{"kind":{"const":"claim_context"}}},{"type":"object","additionalProperties":false,"required":["kind","alias"],"properties":{"kind":{"const":"node"},"alias":{"$ref":"#/definitions/alias"}}},{"type":"object","additionalProperties":false,"required":["kind","aliases"],"properties":{"kind":{"const":"node_set"},"aliases":{"type":"array","uniqueItems":true,"items":{"$ref":"#/definitions/alias"}}}},{"type":"object","additionalProperties":false,"required":["kind","fact_key"],"properties":{"kind":{"const":"parent_claim"},"fact_key":{"$ref":"#/definitions/factKey"}}}]};

function validate18(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(key0 === "kind")){
const err1 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("claim_context" !== data.kind){
const err2 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "claim_context"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
}
else {
const err3 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs5 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err4 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if((data.alias === undefined) || (!(func0.call(data, "alias")))){
const err5 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "alias"},message:"must have required property '"+"alias"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key1 of Object.keys(data)){
if(!((key1 === "kind") || (key1 === "alias"))){
const err6 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("node" !== data.kind){
const err7 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "node"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.alias !== undefined && func0.call(data, "alias")){
let data2 = data.alias;
if(typeof data2 === "string"){
if(!pattern3.test(data2)){
const err8 = {instancePath:instancePath+"/alias",schemaPath:"#/definitions/alias/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/alias",schemaPath:"#/definitions/alias/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
}
else {
const err10 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
var _valid0 = _errs5 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
}
const _errs12 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err11 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if((data.aliases === undefined) || (!(func0.call(data, "aliases")))){
const err12 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "aliases"},message:"must have required property '"+"aliases"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
for(const key2 of Object.keys(data)){
if(!((key2 === "kind") || (key2 === "aliases"))){
const err13 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("node_set" !== data.kind){
const err14 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "node_set"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.aliases !== undefined && func0.call(data, "aliases")){
let data4 = data.aliases;
if(Array.isArray(data4)){
const len0 = data4.length;
for(let i0=0; i0<len0; i0++){
let data5 = data4[i0];
if(typeof data5 === "string"){
if(!pattern3.test(data5)){
const err15 = {instancePath:instancePath+"/aliases/" + i0,schemaPath:"#/definitions/alias/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
else {
const err16 = {instancePath:instancePath+"/aliases/" + i0,schemaPath:"#/definitions/alias/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
let i1 = data4.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func32(data4[i1], data4[j0])){
const err17 = {instancePath:instancePath+"/aliases",schemaPath:"#/oneOf/2/properties/aliases/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err18 = {instancePath:instancePath+"/aliases",schemaPath:"#/oneOf/2/properties/aliases/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
}
else {
const err19 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
var _valid0 = _errs12 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
}
const _errs21 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err20 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if((data.fact_key === undefined) || (!(func0.call(data, "fact_key")))){
const err21 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "fact_key"},message:"must have required property '"+"fact_key"+"'"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
for(const key3 of Object.keys(data)){
if(!((key3 === "kind") || (key3 === "fact_key"))){
const err22 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("parent_claim" !== data.kind){
const err23 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "parent_claim"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.fact_key !== undefined && func0.call(data, "fact_key")){
let data7 = data.fact_key;
if(typeof data7 === "string"){
if(!pattern2.test(data7)){
const err24 = {instancePath:instancePath+"/fact_key",schemaPath:"#/definitions/factKey/pattern",keyword:"pattern",params:{pattern: "^[SMFN]-[0-9]{2}#[1-9][0-9]*#[1-9][0-9]*$"},message:"must match pattern \""+"^[SMFN]-[0-9]{2}#[1-9][0-9]*#[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
else {
const err25 = {instancePath:instancePath+"/fact_key",schemaPath:"#/definitions/factKey/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
}
else {
const err26 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
var _valid0 = _errs21 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
}
}
}
}
if(!valid0){
const err27 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate18.errors = vErrors;
return errors === 0;
}


function validate11(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.claim_id === undefined) || (!(func0.call(data, "claim_id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "claim_id"},message:"must have required property '"+"claim_id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.fact_key === undefined) || (!(func0.call(data, "fact_key")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "fact_key"},message:"must have required property '"+"fact_key"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.metric === undefined) || (!(func0.call(data, "metric")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "metric"},message:"must have required property '"+"metric"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if((data.unit === undefined) || (!(func0.call(data, "unit")))){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "unit"},message:"must have required property '"+"unit"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if((data.subject === undefined) || (!(func0.call(data, "subject")))){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "subject"},message:"must have required property '"+"subject"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if((data.period === undefined) || (!(func0.call(data, "period")))){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "period"},message:"must have required property '"+"period"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if((data.time_basis === undefined) || (!(func0.call(data, "time_basis")))){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "time_basis"},message:"must have required property '"+"time_basis"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if((data.coverage === undefined) || (!(func0.call(data, "coverage")))){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "coverage"},message:"must have required property '"+"coverage"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if((data.evidence_state === undefined) || (!(func0.call(data, "evidence_state")))){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "evidence_state"},message:"must have required property '"+"evidence_state"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if((data.evaluator_ref === undefined) || (!(func0.call(data, "evaluator_ref")))){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "evaluator_ref"},message:"must have required property '"+"evaluator_ref"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if((data.operand_bindings === undefined) || (!(func0.call(data, "operand_bindings")))){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "operand_bindings"},message:"must have required property '"+"operand_bindings"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(func0.call(schema13.properties, key0))){
const err11 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.claim_id !== undefined && func0.call(data, "claim_id")){
let data0 = data.claim_id;
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err12 = {instancePath:instancePath+"/claim_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/claim_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.fact_key !== undefined && func0.call(data, "fact_key")){
let data1 = data.fact_key;
if(typeof data1 === "string"){
if(!pattern2.test(data1)){
const err14 = {instancePath:instancePath+"/fact_key",schemaPath:"#/definitions/factKey/pattern",keyword:"pattern",params:{pattern: "^[SMFN]-[0-9]{2}#[1-9][0-9]*#[1-9][0-9]*$"},message:"must match pattern \""+"^[SMFN]-[0-9]{2}#[1-9][0-9]*#[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/fact_key",schemaPath:"#/definitions/factKey/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.metric !== undefined && func0.call(data, "metric")){
let data2 = data.metric;
if(typeof data2 === "string"){
if(!pattern3.test(data2)){
const err16 = {instancePath:instancePath+"/metric",schemaPath:"#/definitions/alias/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
else {
const err17 = {instancePath:instancePath+"/metric",schemaPath:"#/definitions/alias/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.unit !== undefined && func0.call(data, "unit")){
let data3 = data.unit;
if(!((((data3 === "BRL_minor") || (data3 === "count")) || (data3 === "entity_ids")) || (data3 === "state"))){
const err18 = {instancePath:instancePath+"/unit",schemaPath:"#/properties/unit/enum",keyword:"enum",params:{allowedValues: schema13.properties.unit.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.subject !== undefined && func0.call(data, "subject")){
if(!(validate12(data.subject, {instancePath:instancePath+"/subject",parentData:data,parentDataProperty:"subject",rootData}))){
vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
errors = vErrors.length;
}
}
if(data.period !== undefined && func0.call(data, "period")){
if(!(validate14(data.period, {instancePath:instancePath+"/period",parentData:data,parentDataProperty:"period",rootData}))){
vErrors = vErrors === null ? validate14.errors : vErrors.concat(validate14.errors);
errors = vErrors.length;
}
}
if(data.time_basis !== undefined && func0.call(data, "time_basis")){
let data6 = data.time_basis;
if(!(((((((((((((((data6 === "event_date") || (data6 === "transaction_date")) || (data6 === "billing_period")) || (data6 === "budget_cycle")) || (data6 === "due_date")) || (data6 === "settlement_date")) || (data6 === "installment_competence")) || (data6 === "mixed_declared")) || (data6 === "registry_current")) || (data6 === "request_execution")) || (data6 === "scheduled_at")) || (data6 === "source_period")) || (data6 === "statement_competence")) || (data6 === "statement_due_date")) || (data6 === "15_full_days_after_as_of"))){
const err19 = {instancePath:instancePath+"/time_basis",schemaPath:"#/properties/time_basis/enum",keyword:"enum",params:{allowedValues: schema13.properties.time_basis.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.coverage !== undefined && func0.call(data, "coverage")){
let data7 = data.coverage;
if(!(((data7 === "complete") || (data7 === "partial")) || (data7 === "unavailable"))){
const err20 = {instancePath:instancePath+"/coverage",schemaPath:"#/properties/coverage/enum",keyword:"enum",params:{allowedValues: schema13.properties.coverage.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.evidence_state !== undefined && func0.call(data, "evidence_state")){
let data8 = data.evidence_state;
if(!(((data8 === "confirmed") || (data8 === "projected")) || (data8 === "estimated"))){
const err21 = {instancePath:instancePath+"/evidence_state",schemaPath:"#/properties/evidence_state/enum",keyword:"enum",params:{allowedValues: schema13.properties.evidence_state.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.evaluator_ref !== undefined && func0.call(data, "evaluator_ref")){
if(!(validate16(data.evaluator_ref, {instancePath:instancePath+"/evaluator_ref",parentData:data,parentDataProperty:"evaluator_ref",rootData}))){
vErrors = vErrors === null ? validate16.errors : vErrors.concat(validate16.errors);
errors = vErrors.length;
}
}
if(data.operand_bindings !== undefined && func0.call(data, "operand_bindings")){
let data10 = data.operand_bindings;
if(data10 && typeof data10 == "object" && !Array.isArray(data10)){
if(Object.keys(data10).length < 1){
const err22 = {instancePath:instancePath+"/operand_bindings",schemaPath:"#/properties/operand_bindings/minProperties",keyword:"minProperties",params:{limit: 1},message:"must NOT have fewer than 1 properties"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
for(const key1 of Object.keys(data10)){
const _errs20 = errors;
if(typeof key1 === "string"){
if(!pattern3.test(key1)){
const err23 = {instancePath:instancePath+"/operand_bindings",schemaPath:"#/definitions/alias/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\"",propertyName:key1};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
else {
const err24 = {instancePath:instancePath+"/operand_bindings",schemaPath:"#/definitions/alias/type",keyword:"type",params:{type: "string"},message:"must be string",propertyName:key1};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
var valid4 = _errs20 === errors;
if(!valid4){
const err25 = {instancePath:instancePath+"/operand_bindings",schemaPath:"#/properties/operand_bindings/propertyNames",keyword:"propertyNames",params:{propertyName: key1},message:"property name must be valid"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
for(const key2 of Object.keys(data10)){
if(!(validate18(data10[key2], {instancePath:instancePath+"/operand_bindings/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),parentData:data10,parentDataProperty:key2,rootData}))){
vErrors = vErrors === null ? validate18.errors : vErrors.concat(validate18.errors);
errors = vErrors.length;
}
}
}
else {
const err26 = {instancePath:instancePath+"/operand_bindings",schemaPath:"#/properties/operand_bindings/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data.filters !== undefined && func0.call(data, "filters")){
let data12 = data.filters;
if(data12 && typeof data12 == "object" && !Array.isArray(data12)){
if((data12.budget_class === undefined) || (!(func0.call(data12, "budget_class")))){
const err27 = {instancePath:instancePath+"/filters",schemaPath:"#/properties/filters/required",keyword:"required",params:{missingProperty: "budget_class"},message:"must have required property '"+"budget_class"+"'"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
for(const key3 of Object.keys(data12)){
if(!(key3 === "budget_class")){
const err28 = {instancePath:instancePath+"/filters",schemaPath:"#/properties/filters/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data12.budget_class !== undefined && func0.call(data12, "budget_class")){
let data13 = data12.budget_class;
if(!((data13 === "essential") || (data13 === "flexible"))){
const err29 = {instancePath:instancePath+"/filters/budget_class",schemaPath:"#/properties/filters/properties/budget_class/enum",keyword:"enum",params:{allowedValues: schema13.properties.filters.properties.budget_class.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
}
else {
const err30 = {instancePath:instancePath+"/filters",schemaPath:"#/properties/filters/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
}
else {
const err31 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
validate11.errors = vErrors;
return errors === 0;
}


function validate10(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
/*# sourceURL="urn:financasbot:next:claim-contract:2" */;
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.schema_version === undefined) || (!(func0.call(data, "schema_version")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "schema_version"},message:"must have required property '"+"schema_version"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.contract_id === undefined) || (!(func0.call(data, "contract_id")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "contract_id"},message:"must have required property '"+"contract_id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.claims === undefined) || (!(func0.call(data, "claims")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "claims"},message:"must have required property '"+"claims"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(((key0 === "schema_version") || (key0 === "contract_id")) || (key0 === "claims"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.schema_version !== undefined && func0.call(data, "schema_version")){
if(2 !== data.schema_version){
const err4 = {instancePath:instancePath+"/schema_version",schemaPath:"#/properties/schema_version/const",keyword:"const",params:{allowedValue: 2},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.contract_id !== undefined && func0.call(data, "contract_id")){
let data1 = data.contract_id;
if(typeof data1 === "string"){
if(!pattern0.test(data1)){
const err5 = {instancePath:instancePath+"/contract_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/contract_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.claims !== undefined && func0.call(data, "claims")){
let data2 = data.claims;
if(Array.isArray(data2)){
if(data2.length < 1){
const err7 = {instancePath:instancePath+"/claims",schemaPath:"#/properties/claims/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
const len0 = data2.length;
for(let i0=0; i0<len0; i0++){
if(!(validate11(data2[i0], {instancePath:instancePath+"/claims/" + i0,parentData:data2,parentDataProperty:i0,rootData}))){
vErrors = vErrors === null ? validate11.errors : vErrors.concat(validate11.errors);
errors = vErrors.length;
}
}
}
else {
const err8 = {instancePath:instancePath+"/claims",schemaPath:"#/properties/claims/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
validate10.errors = vErrors;
return errors === 0;
}

exports.evaluator = validate21;
const schema39 = {"type":"object","additionalProperties":false,"required":["schema_version","contract_id","metric","unit","stage","signature","semantics","algebraic_properties","reuse","limitations"],"properties":{"schema_version":{"const":1},"contract_id":{"type":"string","pattern":"^[a-z][a-z0-9_]*$"},"metric":{"type":"string","pattern":"^[a-z][a-z0-9_]*$"},"unit":{"enum":["BRL_minor","count","entity_ids","state"]},"stage":{"const":"authoring"},"signature":{"type":"object","additionalProperties":false,"required":["context","operands","output"],"properties":{"context":{"const":"explicit_versioned_instrumented_claim"},"operands":{"const":"resolve_roles_from_metric_evaluator_registry"},"output":{"type":"object","additionalProperties":false,"required":["kind"],"properties":{"kind":{"enum":["money_minor","nonnegative_integer","id","id_set","enum"]},"enum_values":{"type":"array","uniqueItems":true,"items":{"type":"string"}}}}}},"semantics":{"type":"array","minItems":1,"items":{"type":"string","minLength":1}},"algebraic_properties":{"type":"array","minItems":1,"items":{"type":"string","minLength":1}},"reuse":{"type":"object","additionalProperties":false,"required":["path","locator","status"],"properties":{"path":{"type":"string","minLength":1},"locator":{"type":"string","minLength":1},"status":{"const":"behavior_reference_requires_instrumented_adaptation"}}},"limitations":{"type":"array","minItems":1,"items":{"type":"string","minLength":1}}},"$schema":"http://json-schema.org/draft-07/schema#","$id":"urn:financasbot:next:evaluator-contract:1"};
const func176 = require("./ucs2length").default;
const pattern23 = new RegExp("^[a-z][a-z0-9_]*$", "u");

function validate21(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
/*# sourceURL="urn:financasbot:next:evaluator-contract:1" */;
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.schema_version === undefined) || (!(func0.call(data, "schema_version")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "schema_version"},message:"must have required property '"+"schema_version"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.contract_id === undefined) || (!(func0.call(data, "contract_id")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "contract_id"},message:"must have required property '"+"contract_id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.metric === undefined) || (!(func0.call(data, "metric")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "metric"},message:"must have required property '"+"metric"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if((data.unit === undefined) || (!(func0.call(data, "unit")))){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "unit"},message:"must have required property '"+"unit"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if((data.stage === undefined) || (!(func0.call(data, "stage")))){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "stage"},message:"must have required property '"+"stage"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if((data.signature === undefined) || (!(func0.call(data, "signature")))){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "signature"},message:"must have required property '"+"signature"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if((data.semantics === undefined) || (!(func0.call(data, "semantics")))){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "semantics"},message:"must have required property '"+"semantics"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if((data.algebraic_properties === undefined) || (!(func0.call(data, "algebraic_properties")))){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "algebraic_properties"},message:"must have required property '"+"algebraic_properties"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if((data.reuse === undefined) || (!(func0.call(data, "reuse")))){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "reuse"},message:"must have required property '"+"reuse"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if((data.limitations === undefined) || (!(func0.call(data, "limitations")))){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "limitations"},message:"must have required property '"+"limitations"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(func0.call(schema39.properties, key0))){
const err10 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.schema_version !== undefined && func0.call(data, "schema_version")){
if(1 !== data.schema_version){
const err11 = {instancePath:instancePath+"/schema_version",schemaPath:"#/properties/schema_version/const",keyword:"const",params:{allowedValue: 1},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.contract_id !== undefined && func0.call(data, "contract_id")){
let data1 = data.contract_id;
if(typeof data1 === "string"){
if(!pattern23.test(data1)){
const err12 = {instancePath:instancePath+"/contract_id",schemaPath:"#/properties/contract_id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]*$"},message:"must match pattern \""+"^[a-z][a-z0-9_]*$"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/contract_id",schemaPath:"#/properties/contract_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.metric !== undefined && func0.call(data, "metric")){
let data2 = data.metric;
if(typeof data2 === "string"){
if(!pattern23.test(data2)){
const err14 = {instancePath:instancePath+"/metric",schemaPath:"#/properties/metric/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]*$"},message:"must match pattern \""+"^[a-z][a-z0-9_]*$"+"\""};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/metric",schemaPath:"#/properties/metric/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.unit !== undefined && func0.call(data, "unit")){
let data3 = data.unit;
if(!((((data3 === "BRL_minor") || (data3 === "count")) || (data3 === "entity_ids")) || (data3 === "state"))){
const err16 = {instancePath:instancePath+"/unit",schemaPath:"#/properties/unit/enum",keyword:"enum",params:{allowedValues: schema39.properties.unit.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.stage !== undefined && func0.call(data, "stage")){
if("authoring" !== data.stage){
const err17 = {instancePath:instancePath+"/stage",schemaPath:"#/properties/stage/const",keyword:"const",params:{allowedValue: "authoring"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.signature !== undefined && func0.call(data, "signature")){
let data5 = data.signature;
if(data5 && typeof data5 == "object" && !Array.isArray(data5)){
if((data5.context === undefined) || (!(func0.call(data5, "context")))){
const err18 = {instancePath:instancePath+"/signature",schemaPath:"#/properties/signature/required",keyword:"required",params:{missingProperty: "context"},message:"must have required property '"+"context"+"'"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if((data5.operands === undefined) || (!(func0.call(data5, "operands")))){
const err19 = {instancePath:instancePath+"/signature",schemaPath:"#/properties/signature/required",keyword:"required",params:{missingProperty: "operands"},message:"must have required property '"+"operands"+"'"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if((data5.output === undefined) || (!(func0.call(data5, "output")))){
const err20 = {instancePath:instancePath+"/signature",schemaPath:"#/properties/signature/required",keyword:"required",params:{missingProperty: "output"},message:"must have required property '"+"output"+"'"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
for(const key1 of Object.keys(data5)){
if(!(((key1 === "context") || (key1 === "operands")) || (key1 === "output"))){
const err21 = {instancePath:instancePath+"/signature",schemaPath:"#/properties/signature/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data5.context !== undefined && func0.call(data5, "context")){
if("explicit_versioned_instrumented_claim" !== data5.context){
const err22 = {instancePath:instancePath+"/signature/context",schemaPath:"#/properties/signature/properties/context/const",keyword:"const",params:{allowedValue: "explicit_versioned_instrumented_claim"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data5.operands !== undefined && func0.call(data5, "operands")){
if("resolve_roles_from_metric_evaluator_registry" !== data5.operands){
const err23 = {instancePath:instancePath+"/signature/operands",schemaPath:"#/properties/signature/properties/operands/const",keyword:"const",params:{allowedValue: "resolve_roles_from_metric_evaluator_registry"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data5.output !== undefined && func0.call(data5, "output")){
let data8 = data5.output;
if(data8 && typeof data8 == "object" && !Array.isArray(data8)){
if((data8.kind === undefined) || (!(func0.call(data8, "kind")))){
const err24 = {instancePath:instancePath+"/signature/output",schemaPath:"#/properties/signature/properties/output/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
for(const key2 of Object.keys(data8)){
if(!((key2 === "kind") || (key2 === "enum_values"))){
const err25 = {instancePath:instancePath+"/signature/output",schemaPath:"#/properties/signature/properties/output/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data8.kind !== undefined && func0.call(data8, "kind")){
let data9 = data8.kind;
if(!(((((data9 === "money_minor") || (data9 === "nonnegative_integer")) || (data9 === "id")) || (data9 === "id_set")) || (data9 === "enum"))){
const err26 = {instancePath:instancePath+"/signature/output/kind",schemaPath:"#/properties/signature/properties/output/properties/kind/enum",keyword:"enum",params:{allowedValues: schema39.properties.signature.properties.output.properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data8.enum_values !== undefined && func0.call(data8, "enum_values")){
let data10 = data8.enum_values;
if(Array.isArray(data10)){
const len0 = data10.length;
for(let i0=0; i0<len0; i0++){
if(typeof data10[i0] !== "string"){
const err27 = {instancePath:instancePath+"/signature/output/enum_values/" + i0,schemaPath:"#/properties/signature/properties/output/properties/enum_values/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
let i1 = data10.length;
let j0;
if(i1 > 1){
const indices0 = {};
for(;i1--;){
let item0 = data10[i1];
if(typeof item0 !== "string"){
continue;
}
if(typeof indices0[item0] == "number"){
j0 = indices0[item0];
const err28 = {instancePath:instancePath+"/signature/output/enum_values",schemaPath:"#/properties/signature/properties/output/properties/enum_values/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
break;
}
indices0[item0] = i1;
}
}
}
else {
const err29 = {instancePath:instancePath+"/signature/output/enum_values",schemaPath:"#/properties/signature/properties/output/properties/enum_values/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
}
else {
const err30 = {instancePath:instancePath+"/signature/output",schemaPath:"#/properties/signature/properties/output/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
}
else {
const err31 = {instancePath:instancePath+"/signature",schemaPath:"#/properties/signature/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data.semantics !== undefined && func0.call(data, "semantics")){
let data12 = data.semantics;
if(Array.isArray(data12)){
if(data12.length < 1){
const err32 = {instancePath:instancePath+"/semantics",schemaPath:"#/properties/semantics/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
const len1 = data12.length;
for(let i2=0; i2<len1; i2++){
let data13 = data12[i2];
if(typeof data13 === "string"){
if(func176(data13) < 1){
const err33 = {instancePath:instancePath+"/semantics/" + i2,schemaPath:"#/properties/semantics/items/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
else {
const err34 = {instancePath:instancePath+"/semantics/" + i2,schemaPath:"#/properties/semantics/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
}
else {
const err35 = {instancePath:instancePath+"/semantics",schemaPath:"#/properties/semantics/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
if(data.algebraic_properties !== undefined && func0.call(data, "algebraic_properties")){
let data14 = data.algebraic_properties;
if(Array.isArray(data14)){
if(data14.length < 1){
const err36 = {instancePath:instancePath+"/algebraic_properties",schemaPath:"#/properties/algebraic_properties/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
const len2 = data14.length;
for(let i3=0; i3<len2; i3++){
let data15 = data14[i3];
if(typeof data15 === "string"){
if(func176(data15) < 1){
const err37 = {instancePath:instancePath+"/algebraic_properties/" + i3,schemaPath:"#/properties/algebraic_properties/items/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
else {
const err38 = {instancePath:instancePath+"/algebraic_properties/" + i3,schemaPath:"#/properties/algebraic_properties/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
}
else {
const err39 = {instancePath:instancePath+"/algebraic_properties",schemaPath:"#/properties/algebraic_properties/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data.reuse !== undefined && func0.call(data, "reuse")){
let data16 = data.reuse;
if(data16 && typeof data16 == "object" && !Array.isArray(data16)){
if((data16.path === undefined) || (!(func0.call(data16, "path")))){
const err40 = {instancePath:instancePath+"/reuse",schemaPath:"#/properties/reuse/required",keyword:"required",params:{missingProperty: "path"},message:"must have required property '"+"path"+"'"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
if((data16.locator === undefined) || (!(func0.call(data16, "locator")))){
const err41 = {instancePath:instancePath+"/reuse",schemaPath:"#/properties/reuse/required",keyword:"required",params:{missingProperty: "locator"},message:"must have required property '"+"locator"+"'"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
if((data16.status === undefined) || (!(func0.call(data16, "status")))){
const err42 = {instancePath:instancePath+"/reuse",schemaPath:"#/properties/reuse/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
for(const key3 of Object.keys(data16)){
if(!(((key3 === "path") || (key3 === "locator")) || (key3 === "status"))){
const err43 = {instancePath:instancePath+"/reuse",schemaPath:"#/properties/reuse/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
if(data16.path !== undefined && func0.call(data16, "path")){
let data17 = data16.path;
if(typeof data17 === "string"){
if(func176(data17) < 1){
const err44 = {instancePath:instancePath+"/reuse/path",schemaPath:"#/properties/reuse/properties/path/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
}
else {
const err45 = {instancePath:instancePath+"/reuse/path",schemaPath:"#/properties/reuse/properties/path/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
if(data16.locator !== undefined && func0.call(data16, "locator")){
let data18 = data16.locator;
if(typeof data18 === "string"){
if(func176(data18) < 1){
const err46 = {instancePath:instancePath+"/reuse/locator",schemaPath:"#/properties/reuse/properties/locator/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
else {
const err47 = {instancePath:instancePath+"/reuse/locator",schemaPath:"#/properties/reuse/properties/locator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
if(data16.status !== undefined && func0.call(data16, "status")){
if("behavior_reference_requires_instrumented_adaptation" !== data16.status){
const err48 = {instancePath:instancePath+"/reuse/status",schemaPath:"#/properties/reuse/properties/status/const",keyword:"const",params:{allowedValue: "behavior_reference_requires_instrumented_adaptation"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
}
else {
const err49 = {instancePath:instancePath+"/reuse",schemaPath:"#/properties/reuse/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
if(data.limitations !== undefined && func0.call(data, "limitations")){
let data20 = data.limitations;
if(Array.isArray(data20)){
if(data20.length < 1){
const err50 = {instancePath:instancePath+"/limitations",schemaPath:"#/properties/limitations/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
const len3 = data20.length;
for(let i4=0; i4<len3; i4++){
let data21 = data20[i4];
if(typeof data21 === "string"){
if(func176(data21) < 1){
const err51 = {instancePath:instancePath+"/limitations/" + i4,schemaPath:"#/properties/limitations/items/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
else {
const err52 = {instancePath:instancePath+"/limitations/" + i4,schemaPath:"#/properties/limitations/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
}
else {
const err53 = {instancePath:instancePath+"/limitations",schemaPath:"#/properties/limitations/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
}
}
else {
const err54 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
validate21.errors = vErrors;
return errors === 0;
}

exports.witnesses = validate22;
const schema40 = {"$schema":"http://json-schema.org/draft-07/schema#","$id":"urn:financasbot:next:evaluator-witness-contracts:1","title":"N02-F functional discriminant witness contracts","$comment":"Authoring-only quantities. Validation does not execute witnesses or make them proof-atom mutants.","type":"object","additionalProperties":false,"required":["schema_version","stage","scope","witnesses"],"properties":{"schema_version":{"const":1},"stage":{"const":"authoring"},"scope":{"const":"formula_discriminants_only_not_complete_proof_atom_mutation_suite"},"witnesses":{"type":"array","minItems":1,"items":{"$ref":"#/definitions/witness"}}},"definitions":{"id":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,95}$"},"value":{"oneOf":[{"type":"string","minLength":1},{"type":"integer"},{"type":"boolean"},{"type":"array","items":{"oneOf":[{"type":"string","minLength":1},{"type":"integer"},{"type":"boolean"}]}}]},"witness":{"type":"object","additionalProperties":false,"required":["id","evaluator_id","stage","witness_domain","inputs","mutation","execution_status","materialization_requirement"],"oneOf":[{"required":["expected","mutated_result"]},{"required":["expected_violation"]}],"properties":{"id":{"$ref":"#/definitions/id"},"evaluator_id":{"$ref":"#/definitions/id"},"stage":{"const":"authoring"},"witness_domain":{"const":"independent_synthetic_minimal_case"},"inputs":{"type":"object","minProperties":1,"propertyNames":{"$ref":"#/definitions/id"},"additionalProperties":{"$ref":"#/definitions/value"}},"expected":{"$ref":"#/definitions/value"},"mutation":{"$ref":"#/definitions/id"},"mutated_result":{"$ref":"#/definitions/value"},"expected_violation":{"$ref":"#/definitions/id"},"execution_status":{"const":"not_executed"},"materialization_requirement":{"type":"string","minLength":1}}}}};
const schema41 = {"type":"object","additionalProperties":false,"required":["id","evaluator_id","stage","witness_domain","inputs","mutation","execution_status","materialization_requirement"],"oneOf":[{"required":["expected","mutated_result"]},{"required":["expected_violation"]}],"properties":{"id":{"$ref":"#/definitions/id"},"evaluator_id":{"$ref":"#/definitions/id"},"stage":{"const":"authoring"},"witness_domain":{"const":"independent_synthetic_minimal_case"},"inputs":{"type":"object","minProperties":1,"propertyNames":{"$ref":"#/definitions/id"},"additionalProperties":{"$ref":"#/definitions/value"}},"expected":{"$ref":"#/definitions/value"},"mutation":{"$ref":"#/definitions/id"},"mutated_result":{"$ref":"#/definitions/value"},"expected_violation":{"$ref":"#/definitions/id"},"execution_status":{"const":"not_executed"},"materialization_requirement":{"type":"string","minLength":1}}};
const schema42 = {"type":"string","pattern":"^[a-z][a-z0-9_]{0,95}$"};
const schema45 = {"oneOf":[{"type":"string","minLength":1},{"type":"integer"},{"type":"boolean"},{"type":"array","items":{"oneOf":[{"type":"string","minLength":1},{"type":"integer"},{"type":"boolean"}]}}]};
const pattern25 = new RegExp("^[a-z][a-z0-9_]{0,95}$", "u");

function validate23(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs1 = errors;
let valid0 = false;
let passing0 = null;
const _errs2 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.expected === undefined) || (!(func0.call(data, "expected")))){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "expected"},message:"must have required property '"+"expected"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.mutated_result === undefined) || (!(func0.call(data, "mutated_result")))){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "mutated_result"},message:"must have required property '"+"mutated_result"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
var _valid0 = _errs2 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs3 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.expected_violation === undefined) || (!(func0.call(data, "expected_violation")))){
const err2 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "expected_violation"},message:"must have required property '"+"expected_violation"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
var _valid0 = _errs3 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
}
}
if(!valid0){
const err3 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
else {
errors = _errs1;
if(vErrors !== null){
if(_errs1){
vErrors.length = _errs1;
}
else {
vErrors = null;
}
}
}
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if((data.evaluator_id === undefined) || (!(func0.call(data, "evaluator_id")))){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "evaluator_id"},message:"must have required property '"+"evaluator_id"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if((data.stage === undefined) || (!(func0.call(data, "stage")))){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "stage"},message:"must have required property '"+"stage"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if((data.witness_domain === undefined) || (!(func0.call(data, "witness_domain")))){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "witness_domain"},message:"must have required property '"+"witness_domain"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if((data.inputs === undefined) || (!(func0.call(data, "inputs")))){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "inputs"},message:"must have required property '"+"inputs"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if((data.mutation === undefined) || (!(func0.call(data, "mutation")))){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "mutation"},message:"must have required property '"+"mutation"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if((data.execution_status === undefined) || (!(func0.call(data, "execution_status")))){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "execution_status"},message:"must have required property '"+"execution_status"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if((data.materialization_requirement === undefined) || (!(func0.call(data, "materialization_requirement")))){
const err11 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "materialization_requirement"},message:"must have required property '"+"materialization_requirement"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(func0.call(schema41.properties, key0))){
const err12 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern25.test(data0)){
const err13 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,95}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,95}$"+"\""};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
else {
const err14 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.evaluator_id !== undefined && func0.call(data, "evaluator_id")){
let data1 = data.evaluator_id;
if(typeof data1 === "string"){
if(!pattern25.test(data1)){
const err15 = {instancePath:instancePath+"/evaluator_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,95}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,95}$"+"\""};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
else {
const err16 = {instancePath:instancePath+"/evaluator_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.stage !== undefined && func0.call(data, "stage")){
if("authoring" !== data.stage){
const err17 = {instancePath:instancePath+"/stage",schemaPath:"#/properties/stage/const",keyword:"const",params:{allowedValue: "authoring"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.witness_domain !== undefined && func0.call(data, "witness_domain")){
if("independent_synthetic_minimal_case" !== data.witness_domain){
const err18 = {instancePath:instancePath+"/witness_domain",schemaPath:"#/properties/witness_domain/const",keyword:"const",params:{allowedValue: "independent_synthetic_minimal_case"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.inputs !== undefined && func0.call(data, "inputs")){
let data4 = data.inputs;
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
if(Object.keys(data4).length < 1){
const err19 = {instancePath:instancePath+"/inputs",schemaPath:"#/properties/inputs/minProperties",keyword:"minProperties",params:{limit: 1},message:"must NOT have fewer than 1 properties"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
for(const key1 of Object.keys(data4)){
const _errs15 = errors;
if(typeof key1 === "string"){
if(!pattern25.test(key1)){
const err20 = {instancePath:instancePath+"/inputs",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,95}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,95}$"+"\"",propertyName:key1};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
else {
const err21 = {instancePath:instancePath+"/inputs",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string",propertyName:key1};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
var valid4 = _errs15 === errors;
if(!valid4){
const err22 = {instancePath:instancePath+"/inputs",schemaPath:"#/properties/inputs/propertyNames",keyword:"propertyNames",params:{propertyName: key1},message:"property name must be valid"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
for(const key2 of Object.keys(data4)){
let data5 = data4[key2];
const _errs21 = errors;
let valid8 = false;
let passing1 = null;
const _errs22 = errors;
if(typeof data5 === "string"){
if(func176(data5) < 1){
const err23 = {instancePath:instancePath+"/inputs/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/definitions/value/oneOf/0/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
else {
const err24 = {instancePath:instancePath+"/inputs/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/definitions/value/oneOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
var _valid1 = _errs22 === errors;
if(_valid1){
valid8 = true;
passing1 = 0;
}
const _errs24 = errors;
if(!(((typeof data5 == "number") && (!(data5 % 1) && !isNaN(data5))) && (isFinite(data5)))){
const err25 = {instancePath:instancePath+"/inputs/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/definitions/value/oneOf/1/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
var _valid1 = _errs24 === errors;
if(_valid1 && valid8){
valid8 = false;
passing1 = [passing1, 1];
}
else {
if(_valid1){
valid8 = true;
passing1 = 1;
}
const _errs26 = errors;
if(typeof data5 !== "boolean"){
const err26 = {instancePath:instancePath+"/inputs/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/definitions/value/oneOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
var _valid1 = _errs26 === errors;
if(_valid1 && valid8){
valid8 = false;
passing1 = [passing1, 2];
}
else {
if(_valid1){
valid8 = true;
passing1 = 2;
}
const _errs28 = errors;
if(Array.isArray(data5)){
const len0 = data5.length;
for(let i0=0; i0<len0; i0++){
let data6 = data5[i0];
const _errs31 = errors;
let valid11 = false;
let passing2 = null;
const _errs32 = errors;
if(typeof data6 === "string"){
if(func176(data6) < 1){
const err27 = {instancePath:instancePath+"/inputs/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/" + i0,schemaPath:"#/definitions/value/oneOf/3/items/oneOf/0/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
else {
const err28 = {instancePath:instancePath+"/inputs/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/" + i0,schemaPath:"#/definitions/value/oneOf/3/items/oneOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
var _valid2 = _errs32 === errors;
if(_valid2){
valid11 = true;
passing2 = 0;
}
const _errs34 = errors;
if(!(((typeof data6 == "number") && (!(data6 % 1) && !isNaN(data6))) && (isFinite(data6)))){
const err29 = {instancePath:instancePath+"/inputs/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/" + i0,schemaPath:"#/definitions/value/oneOf/3/items/oneOf/1/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
var _valid2 = _errs34 === errors;
if(_valid2 && valid11){
valid11 = false;
passing2 = [passing2, 1];
}
else {
if(_valid2){
valid11 = true;
passing2 = 1;
}
const _errs36 = errors;
if(typeof data6 !== "boolean"){
const err30 = {instancePath:instancePath+"/inputs/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/" + i0,schemaPath:"#/definitions/value/oneOf/3/items/oneOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
var _valid2 = _errs36 === errors;
if(_valid2 && valid11){
valid11 = false;
passing2 = [passing2, 2];
}
else {
if(_valid2){
valid11 = true;
passing2 = 2;
}
}
}
if(!valid11){
const err31 = {instancePath:instancePath+"/inputs/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/" + i0,schemaPath:"#/definitions/value/oneOf/3/items/oneOf",keyword:"oneOf",params:{passingSchemas: passing2},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
else {
errors = _errs31;
if(vErrors !== null){
if(_errs31){
vErrors.length = _errs31;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err32 = {instancePath:instancePath+"/inputs/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/definitions/value/oneOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
var _valid1 = _errs28 === errors;
if(_valid1 && valid8){
valid8 = false;
passing1 = [passing1, 3];
}
else {
if(_valid1){
valid8 = true;
passing1 = 3;
}
}
}
}
if(!valid8){
const err33 = {instancePath:instancePath+"/inputs/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/definitions/value/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
else {
errors = _errs21;
if(vErrors !== null){
if(_errs21){
vErrors.length = _errs21;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err34 = {instancePath:instancePath+"/inputs",schemaPath:"#/properties/inputs/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data.expected !== undefined && func0.call(data, "expected")){
let data7 = data.expected;
const _errs40 = errors;
let valid13 = false;
let passing3 = null;
const _errs41 = errors;
if(typeof data7 === "string"){
if(func176(data7) < 1){
const err35 = {instancePath:instancePath+"/expected",schemaPath:"#/definitions/value/oneOf/0/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
else {
const err36 = {instancePath:instancePath+"/expected",schemaPath:"#/definitions/value/oneOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
var _valid3 = _errs41 === errors;
if(_valid3){
valid13 = true;
passing3 = 0;
}
const _errs43 = errors;
if(!(((typeof data7 == "number") && (!(data7 % 1) && !isNaN(data7))) && (isFinite(data7)))){
const err37 = {instancePath:instancePath+"/expected",schemaPath:"#/definitions/value/oneOf/1/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
var _valid3 = _errs43 === errors;
if(_valid3 && valid13){
valid13 = false;
passing3 = [passing3, 1];
}
else {
if(_valid3){
valid13 = true;
passing3 = 1;
}
const _errs45 = errors;
if(typeof data7 !== "boolean"){
const err38 = {instancePath:instancePath+"/expected",schemaPath:"#/definitions/value/oneOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
var _valid3 = _errs45 === errors;
if(_valid3 && valid13){
valid13 = false;
passing3 = [passing3, 2];
}
else {
if(_valid3){
valid13 = true;
passing3 = 2;
}
const _errs47 = errors;
if(Array.isArray(data7)){
const len1 = data7.length;
for(let i1=0; i1<len1; i1++){
let data8 = data7[i1];
const _errs50 = errors;
let valid16 = false;
let passing4 = null;
const _errs51 = errors;
if(typeof data8 === "string"){
if(func176(data8) < 1){
const err39 = {instancePath:instancePath+"/expected/" + i1,schemaPath:"#/definitions/value/oneOf/3/items/oneOf/0/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
else {
const err40 = {instancePath:instancePath+"/expected/" + i1,schemaPath:"#/definitions/value/oneOf/3/items/oneOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
var _valid4 = _errs51 === errors;
if(_valid4){
valid16 = true;
passing4 = 0;
}
const _errs53 = errors;
if(!(((typeof data8 == "number") && (!(data8 % 1) && !isNaN(data8))) && (isFinite(data8)))){
const err41 = {instancePath:instancePath+"/expected/" + i1,schemaPath:"#/definitions/value/oneOf/3/items/oneOf/1/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
var _valid4 = _errs53 === errors;
if(_valid4 && valid16){
valid16 = false;
passing4 = [passing4, 1];
}
else {
if(_valid4){
valid16 = true;
passing4 = 1;
}
const _errs55 = errors;
if(typeof data8 !== "boolean"){
const err42 = {instancePath:instancePath+"/expected/" + i1,schemaPath:"#/definitions/value/oneOf/3/items/oneOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
var _valid4 = _errs55 === errors;
if(_valid4 && valid16){
valid16 = false;
passing4 = [passing4, 2];
}
else {
if(_valid4){
valid16 = true;
passing4 = 2;
}
}
}
if(!valid16){
const err43 = {instancePath:instancePath+"/expected/" + i1,schemaPath:"#/definitions/value/oneOf/3/items/oneOf",keyword:"oneOf",params:{passingSchemas: passing4},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
else {
errors = _errs50;
if(vErrors !== null){
if(_errs50){
vErrors.length = _errs50;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err44 = {instancePath:instancePath+"/expected",schemaPath:"#/definitions/value/oneOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
var _valid3 = _errs47 === errors;
if(_valid3 && valid13){
valid13 = false;
passing3 = [passing3, 3];
}
else {
if(_valid3){
valid13 = true;
passing3 = 3;
}
}
}
}
if(!valid13){
const err45 = {instancePath:instancePath+"/expected",schemaPath:"#/definitions/value/oneOf",keyword:"oneOf",params:{passingSchemas: passing3},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
else {
errors = _errs40;
if(vErrors !== null){
if(_errs40){
vErrors.length = _errs40;
}
else {
vErrors = null;
}
}
}
}
if(data.mutation !== undefined && func0.call(data, "mutation")){
let data9 = data.mutation;
if(typeof data9 === "string"){
if(!pattern25.test(data9)){
const err46 = {instancePath:instancePath+"/mutation",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,95}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,95}$"+"\""};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
else {
const err47 = {instancePath:instancePath+"/mutation",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
if(data.mutated_result !== undefined && func0.call(data, "mutated_result")){
let data10 = data.mutated_result;
const _errs62 = errors;
let valid19 = false;
let passing5 = null;
const _errs63 = errors;
if(typeof data10 === "string"){
if(func176(data10) < 1){
const err48 = {instancePath:instancePath+"/mutated_result",schemaPath:"#/definitions/value/oneOf/0/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
else {
const err49 = {instancePath:instancePath+"/mutated_result",schemaPath:"#/definitions/value/oneOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
var _valid5 = _errs63 === errors;
if(_valid5){
valid19 = true;
passing5 = 0;
}
const _errs65 = errors;
if(!(((typeof data10 == "number") && (!(data10 % 1) && !isNaN(data10))) && (isFinite(data10)))){
const err50 = {instancePath:instancePath+"/mutated_result",schemaPath:"#/definitions/value/oneOf/1/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
var _valid5 = _errs65 === errors;
if(_valid5 && valid19){
valid19 = false;
passing5 = [passing5, 1];
}
else {
if(_valid5){
valid19 = true;
passing5 = 1;
}
const _errs67 = errors;
if(typeof data10 !== "boolean"){
const err51 = {instancePath:instancePath+"/mutated_result",schemaPath:"#/definitions/value/oneOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
var _valid5 = _errs67 === errors;
if(_valid5 && valid19){
valid19 = false;
passing5 = [passing5, 2];
}
else {
if(_valid5){
valid19 = true;
passing5 = 2;
}
const _errs69 = errors;
if(Array.isArray(data10)){
const len2 = data10.length;
for(let i2=0; i2<len2; i2++){
let data11 = data10[i2];
const _errs72 = errors;
let valid22 = false;
let passing6 = null;
const _errs73 = errors;
if(typeof data11 === "string"){
if(func176(data11) < 1){
const err52 = {instancePath:instancePath+"/mutated_result/" + i2,schemaPath:"#/definitions/value/oneOf/3/items/oneOf/0/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
else {
const err53 = {instancePath:instancePath+"/mutated_result/" + i2,schemaPath:"#/definitions/value/oneOf/3/items/oneOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
var _valid6 = _errs73 === errors;
if(_valid6){
valid22 = true;
passing6 = 0;
}
const _errs75 = errors;
if(!(((typeof data11 == "number") && (!(data11 % 1) && !isNaN(data11))) && (isFinite(data11)))){
const err54 = {instancePath:instancePath+"/mutated_result/" + i2,schemaPath:"#/definitions/value/oneOf/3/items/oneOf/1/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
var _valid6 = _errs75 === errors;
if(_valid6 && valid22){
valid22 = false;
passing6 = [passing6, 1];
}
else {
if(_valid6){
valid22 = true;
passing6 = 1;
}
const _errs77 = errors;
if(typeof data11 !== "boolean"){
const err55 = {instancePath:instancePath+"/mutated_result/" + i2,schemaPath:"#/definitions/value/oneOf/3/items/oneOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
var _valid6 = _errs77 === errors;
if(_valid6 && valid22){
valid22 = false;
passing6 = [passing6, 2];
}
else {
if(_valid6){
valid22 = true;
passing6 = 2;
}
}
}
if(!valid22){
const err56 = {instancePath:instancePath+"/mutated_result/" + i2,schemaPath:"#/definitions/value/oneOf/3/items/oneOf",keyword:"oneOf",params:{passingSchemas: passing6},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
else {
errors = _errs72;
if(vErrors !== null){
if(_errs72){
vErrors.length = _errs72;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err57 = {instancePath:instancePath+"/mutated_result",schemaPath:"#/definitions/value/oneOf/3/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
var _valid5 = _errs69 === errors;
if(_valid5 && valid19){
valid19 = false;
passing5 = [passing5, 3];
}
else {
if(_valid5){
valid19 = true;
passing5 = 3;
}
}
}
}
if(!valid19){
const err58 = {instancePath:instancePath+"/mutated_result",schemaPath:"#/definitions/value/oneOf",keyword:"oneOf",params:{passingSchemas: passing5},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
else {
errors = _errs62;
if(vErrors !== null){
if(_errs62){
vErrors.length = _errs62;
}
else {
vErrors = null;
}
}
}
}
if(data.expected_violation !== undefined && func0.call(data, "expected_violation")){
let data12 = data.expected_violation;
if(typeof data12 === "string"){
if(!pattern25.test(data12)){
const err59 = {instancePath:instancePath+"/expected_violation",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,95}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,95}$"+"\""};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
else {
const err60 = {instancePath:instancePath+"/expected_violation",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
if(data.execution_status !== undefined && func0.call(data, "execution_status")){
if("not_executed" !== data.execution_status){
const err61 = {instancePath:instancePath+"/execution_status",schemaPath:"#/properties/execution_status/const",keyword:"const",params:{allowedValue: "not_executed"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
if(data.materialization_requirement !== undefined && func0.call(data, "materialization_requirement")){
let data14 = data.materialization_requirement;
if(typeof data14 === "string"){
if(func176(data14) < 1){
const err62 = {instancePath:instancePath+"/materialization_requirement",schemaPath:"#/properties/materialization_requirement/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
else {
const err63 = {instancePath:instancePath+"/materialization_requirement",schemaPath:"#/properties/materialization_requirement/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
}
}
else {
const err64 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
validate23.errors = vErrors;
return errors === 0;
}


function validate22(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
/*# sourceURL="urn:financasbot:next:evaluator-witness-contracts:1" */;
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.schema_version === undefined) || (!(func0.call(data, "schema_version")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "schema_version"},message:"must have required property '"+"schema_version"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.stage === undefined) || (!(func0.call(data, "stage")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "stage"},message:"must have required property '"+"stage"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.scope === undefined) || (!(func0.call(data, "scope")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "scope"},message:"must have required property '"+"scope"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if((data.witnesses === undefined) || (!(func0.call(data, "witnesses")))){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "witnesses"},message:"must have required property '"+"witnesses"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!((((key0 === "schema_version") || (key0 === "stage")) || (key0 === "scope")) || (key0 === "witnesses"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.schema_version !== undefined && func0.call(data, "schema_version")){
if(1 !== data.schema_version){
const err5 = {instancePath:instancePath+"/schema_version",schemaPath:"#/properties/schema_version/const",keyword:"const",params:{allowedValue: 1},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.stage !== undefined && func0.call(data, "stage")){
if("authoring" !== data.stage){
const err6 = {instancePath:instancePath+"/stage",schemaPath:"#/properties/stage/const",keyword:"const",params:{allowedValue: "authoring"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.scope !== undefined && func0.call(data, "scope")){
if("formula_discriminants_only_not_complete_proof_atom_mutation_suite" !== data.scope){
const err7 = {instancePath:instancePath+"/scope",schemaPath:"#/properties/scope/const",keyword:"const",params:{allowedValue: "formula_discriminants_only_not_complete_proof_atom_mutation_suite"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.witnesses !== undefined && func0.call(data, "witnesses")){
let data3 = data.witnesses;
if(Array.isArray(data3)){
if(data3.length < 1){
const err8 = {instancePath:instancePath+"/witnesses",schemaPath:"#/properties/witnesses/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
const len0 = data3.length;
for(let i0=0; i0<len0; i0++){
if(!(validate23(data3[i0], {instancePath:instancePath+"/witnesses/" + i0,parentData:data3,parentDataProperty:i0,rootData}))){
vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
errors = vErrors.length;
}
}
}
else {
const err9 = {instancePath:instancePath+"/witnesses",schemaPath:"#/properties/witnesses/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
}
else {
const err10 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
validate22.errors = vErrors;
return errors === 0;
}

exports.snapshot = validate25;
const schema50 = {"$schema":"http://json-schema.org/draft-07/schema#","$id":"urn:financasbot:next:evidence-snapshot:2","title":"N02-F evidence snapshot: structural projection of material field registry","$comment":"Authoring draft. Field classes and edge target authorities remain material-field-registry-v1.json. Schema projection must agree exactly; cross-node identity, dates, safe -0 exclusion, role uniqueness and unit domains require semantic checks.","oneOf":[{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"family"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_family"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"person"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_person"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"account"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_account"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"card"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_card"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"category"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_category"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"event"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_event"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"budget"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_budget"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"bill"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_bill"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"source_state"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_source_state"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"proposal"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_proposal"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"reminder"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_reminder"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"calendar_event"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_calendar_event"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"side_effect"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_side_effect"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"merchant_rule"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_merchant_rule"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"fixture"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_fixture"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"collection"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_collection"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"source_origin"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_source_origin"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"merchant_identity"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_merchant_identity"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"transfer_identity"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_transfer_identity"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"installment_plan"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_installment_plan"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"turn"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_turn"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"derived_claim"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_derived_claim"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"evaluation_policy"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_evaluation_policy"}}}],"definitions":{"id":{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},"digest":{"type":"string","pattern":"^sha256:[a-f0-9]{64}$"},"text":{"type":"string"},"date":{"type":"string","pattern":"^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$","format":"date"},"month":{"type":"string","pattern":"^[0-9]{4}-(0[1-9]|1[0-2])$"},"datetime":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$"},"integer":{"type":"integer","minimum":-9007199254740991,"maximum":9007199254740991},"positive_integer":{"type":"integer","minimum":1,"maximum":9007199254740991},"nonnegative_integer":{"type":"integer","minimum":0,"maximum":9007199254740991},"money_minor":{"type":"integer","minimum":-9007199254740991,"maximum":9007199254740991},"boolean":{"type":"boolean"},"ref":{"$ref":"#/definitions/id"},"ref_list":{"type":"array","uniqueItems":true,"items":{"$ref":"#/definitions/ref"}},"typed_period":{"$ref":"urn:financasbot:next:claim-contract:2#/definitions/period"},"typed_result":{"oneOf":[{"type":"object","additionalProperties":false,"required":["unit","kind","value"],"properties":{"unit":{"const":"BRL_minor"},"kind":{"const":"money_minor"},"value":{"$ref":"#/definitions/money_minor"}}},{"type":"object","additionalProperties":false,"required":["unit","kind","value"],"properties":{"unit":{"const":"count"},"kind":{"const":"nonnegative_integer"},"value":{"$ref":"#/definitions/nonnegative_integer"}}},{"type":"object","additionalProperties":false,"required":["unit","kind","value"],"properties":{"unit":{"const":"entity_ids"},"kind":{"const":"id"},"value":{"$ref":"#/definitions/ref"}}},{"type":"object","additionalProperties":false,"required":["unit","kind","value"],"properties":{"unit":{"const":"entity_ids"},"kind":{"const":"id_set"},"value":{"$ref":"#/definitions/ref_list"}}},{"type":"object","additionalProperties":false,"required":["unit","kind","value"],"properties":{"unit":{"const":"state"},"kind":{"const":"enum"},"value":{"type":"string","minLength":1}}}]},"role_ref_list":{"type":"array","uniqueItems":true,"items":{"type":"object","additionalProperties":false,"required":["role_id","parent_ref"],"properties":{"role_id":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"},"parent_ref":{"$ref":"#/definitions/ref"}}}},"payload_family":{"type":"object","additionalProperties":false,"required":["id","label","members"],"properties":{"id":{"$ref":"#/definitions/id"},"label":{"$ref":"#/definitions/text"},"members":{"$ref":"#/definitions/ref_list"}}},"payload_person":{"type":"object","additionalProperties":false,"required":["id","label","family_id"],"properties":{"id":{"$ref":"#/definitions/id"},"label":{"$ref":"#/definitions/text"},"family_id":{"$ref":"#/definitions/ref"}}},"payload_account":{"type":"object","additionalProperties":false,"required":["id","label","owner_id","type","opening_balance_minor","opening_balance_as_of"],"properties":{"id":{"$ref":"#/definitions/id"},"label":{"$ref":"#/definitions/text"},"owner_id":{"$ref":"#/definitions/ref"},"type":{"enum":["checking","reserve"]},"opening_balance_minor":{"$ref":"#/definitions/money_minor"},"opening_balance_as_of":{"$ref":"#/definitions/date"}}},"payload_card":{"type":"object","additionalProperties":false,"required":["id","label","owner_id","closing_day","due_day"],"properties":{"id":{"$ref":"#/definitions/id"},"label":{"$ref":"#/definitions/text"},"owner_id":{"$ref":"#/definitions/ref"},"closing_day":{"allOf":[{"$ref":"#/definitions/positive_integer"},{"maximum":31}]},"due_day":{"allOf":[{"$ref":"#/definitions/positive_integer"},{"maximum":31}]}}},"payload_category":{"type":"object","additionalProperties":false,"required":["id","label","kind"],"properties":{"id":{"$ref":"#/definitions/id"},"label":{"$ref":"#/definitions/text"},"kind":{"enum":["expense","income","neutral","compensation"]},"budget_class":{"enum":["essential","flexible"]}}},"payload_event":{"type":"object","additionalProperties":false,"required":["id","date","person_id","category_id","amount_minor","state"],"properties":{"id":{"$ref":"#/definitions/id"},"date":{"$ref":"#/definitions/date"},"person_id":{"$ref":"#/definitions/ref"},"account_id":{"$ref":"#/definitions/ref"},"card_id":{"$ref":"#/definitions/ref"},"category_id":{"$ref":"#/definitions/ref"},"amount_minor":{"$ref":"#/definitions/money_minor"},"state":{"enum":["confirmed","projected"]},"merchant_key":{"$ref":"#/definitions/ref"},"compensates":{"$ref":"#/definitions/ref"},"transfer_pair":{"$ref":"#/definitions/ref"},"settles_card_id":{"$ref":"#/definitions/ref"},"installment_plan":{"$ref":"#/definitions/ref"},"installment_number":{"$ref":"#/definitions/positive_integer"},"installment_total":{"$ref":"#/definitions/positive_integer"}}},"payload_budget":{"type":"object","additionalProperties":false,"required":["id","family_id","category_id","period","limit_minor","evidence_state","source"],"properties":{"id":{"$ref":"#/definitions/id"},"family_id":{"$ref":"#/definitions/ref"},"category_id":{"$ref":"#/definitions/ref"},"period":{"$ref":"#/definitions/month"},"limit_minor":{"$ref":"#/definitions/money_minor"},"evidence_state":{"enum":["confirmed"]},"source":{"$ref":"#/definitions/ref"}}},"payload_bill":{"type":"object","additionalProperties":false,"required":["id","person_id","due_date","amount_minor","status","evidence_state","source"],"properties":{"id":{"$ref":"#/definitions/id"},"person_id":{"$ref":"#/definitions/ref"},"due_date":{"$ref":"#/definitions/date"},"amount_minor":{"$ref":"#/definitions/money_minor"},"status":{"enum":["open","paid","cancelled"]},"evidence_state":{"enum":["confirmed","projected"]},"source":{"$ref":"#/definitions/ref"}}},"payload_source_state":{"type":"object","additionalProperties":false,"required":["id","source","coverage"],"properties":{"id":{"$ref":"#/definitions/id"},"source":{"$ref":"#/definitions/ref"},"period":{"$ref":"#/definitions/month"},"entity_id":{"$ref":"#/definitions/ref"},"category_id":{"$ref":"#/definitions/ref"},"coverage":{"enum":["complete","partial","unavailable"]},"event_count":{"$ref":"#/definitions/nonnegative_integer"}}},"payload_proposal":{"type":"object","additionalProperties":false,"required":["id","state","expires_at","source_version"],"properties":{"id":{"$ref":"#/definitions/id"},"state":{"enum":["presented","expired","superseded"]},"expires_at":{"$ref":"#/definitions/datetime"},"source_version":{"$ref":"#/definitions/id"}}},"payload_reminder":{"type":"object","additionalProperties":false,"required":["id","person_id","scheduled_at"],"properties":{"id":{"$ref":"#/definitions/id"},"person_id":{"$ref":"#/definitions/ref"},"scheduled_at":{"$ref":"#/definitions/date"}}},"payload_calendar_event":{"type":"object","additionalProperties":false,"required":["id","person_id","scheduled_at"],"properties":{"id":{"$ref":"#/definitions/id"},"person_id":{"$ref":"#/definitions/ref"},"scheduled_at":{"$ref":"#/definitions/date"}}},"payload_side_effect":{"type":"object","additionalProperties":false,"required":["id","turn_id"],"properties":{"id":{"$ref":"#/definitions/id"},"turn_id":{"$ref":"#/definitions/ref"}}},"payload_merchant_rule":{"type":"object","additionalProperties":false,"required":["id","merchant_key","category_id","application","reversible","evidence_state","source"],"properties":{"id":{"$ref":"#/definitions/id"},"merchant_key":{"$ref":"#/definitions/ref"},"category_id":{"$ref":"#/definitions/ref"},"application":{"enum":["suggestion","automatic"]},"reversible":{"$ref":"#/definitions/boolean"},"evidence_state":{"enum":["confirmed"]},"source":{"$ref":"#/definitions/ref"}}},"payload_fixture":{"type":"object","additionalProperties":false,"required":["id","synthetic","closed_world","currency","fixed_clock"],"properties":{"id":{"$ref":"#/definitions/id"},"synthetic":{"$ref":"#/definitions/boolean"},"closed_world":{"$ref":"#/definitions/boolean"},"currency":{"enum":["BRL"]},"fixed_clock":{"$ref":"#/definitions/datetime"}}},"payload_collection":{"type":"object","additionalProperties":false,"required":["id","fixture_id","collection_name","members"],"properties":{"id":{"$ref":"#/definitions/id"},"fixture_id":{"$ref":"#/definitions/ref"},"collection_name":{"enum":["families","people","accounts","cards","categories","events","budgets","bills","source_states","proposals","reminders","calendar_events","side_effects","merchant_rules"]},"members":{"$ref":"#/definitions/ref_list"}}},"payload_source_origin":{"type":"object","additionalProperties":false,"required":["id","fixture_id"],"properties":{"id":{"$ref":"#/definitions/id"},"fixture_id":{"$ref":"#/definitions/ref"}}},"payload_merchant_identity":{"type":"object","additionalProperties":false,"required":["id","fixture_id"],"properties":{"id":{"$ref":"#/definitions/id"},"fixture_id":{"$ref":"#/definitions/ref"}}},"payload_transfer_identity":{"type":"object","additionalProperties":false,"required":["id","members"],"properties":{"id":{"$ref":"#/definitions/id"},"members":{"$ref":"#/definitions/ref_list"}}},"payload_installment_plan":{"type":"object","additionalProperties":false,"required":["id","members","installment_total"],"properties":{"id":{"$ref":"#/definitions/id"},"members":{"$ref":"#/definitions/ref_list"},"installment_total":{"$ref":"#/definitions/positive_integer"}}},"payload_turn":{"type":"object","additionalProperties":false,"required":["id","fixture_id"],"properties":{"id":{"$ref":"#/definitions/id"},"fixture_id":{"$ref":"#/definitions/ref"}}},"payload_derived_claim":{"type":"object","additionalProperties":false,"required":["id","fact_key","evaluator_version","result_hash","result","parents"],"properties":{"id":{"$ref":"#/definitions/id"},"fact_key":{"$ref":"#/definitions/id"},"evaluator_version":{"$ref":"#/definitions/positive_integer"},"result_hash":{"$ref":"#/definitions/digest"},"result":{"$ref":"#/definitions/typed_result"},"parents":{"$ref":"#/definitions/role_ref_list"}}},"payload_evaluation_policy":{"type":"object","additionalProperties":false,"required":["id","calendar","timezone","ranking_key","ranking_direction","ranking_tie_break","daily_pace_divisor","daily_pace_rounding","daily_pace_start","daily_pace_end","daily_pace_as_of"],"properties":{"id":{"$ref":"#/definitions/id"},"calendar":{"enum":["proleptic_gregorian"]},"timezone":{"enum":["America/Sao_Paulo"]},"ranking_key":{"enum":["validated_consumption_minor"]},"ranking_direction":{"enum":["asc","desc"]},"ranking_tie_break":{"enum":["lexical_internal_id"]},"daily_pace_divisor":{"$ref":"#/definitions/positive_integer"},"daily_pace_rounding":{"enum":["floor","ceil","round"]},"daily_pace_start":{"$ref":"#/definitions/date"},"daily_pace_end":{"$ref":"#/definitions/date"},"daily_pace_as_of":{"$ref":"#/definitions/date"}}}}};
const schema51 = {"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"};
const schema52 = {"type":"string","pattern":"^sha256:[a-f0-9]{64}$"};
const pattern31 = new RegExp("^sha256:[a-f0-9]{64}$", "u");
const schema53 = {"type":"object","additionalProperties":false,"required":["id","label","members"],"properties":{"id":{"$ref":"#/definitions/id"},"label":{"$ref":"#/definitions/text"},"members":{"$ref":"#/definitions/ref_list"}}};
const schema55 = {"type":"string"};
const schema56 = {"type":"array","uniqueItems":true,"items":{"$ref":"#/definitions/ref"}};

function validate27(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(Array.isArray(data)){
const len0 = data.length;
for(let i0=0; i0<len0; i0++){
let data0 = data[i0];
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err0 = {instancePath:instancePath+"/" + i0,schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
}
else {
const err1 = {instancePath:instancePath+"/" + i0,schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
let i1 = data.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func32(data[i1], data[j0])){
const err2 = {instancePath,schemaPath:"#/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err3 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
validate27.errors = vErrors;
return errors === 0;
}


function validate26(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.label === undefined) || (!(func0.call(data, "label")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.members === undefined) || (!(func0.call(data, "members")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "members"},message:"must have required property '"+"members"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(((key0 === "id") || (key0 === "label")) || (key0 === "members"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err4 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.label !== undefined && func0.call(data, "label")){
if(typeof data.label !== "string"){
const err6 = {instancePath:instancePath+"/label",schemaPath:"#/definitions/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.members !== undefined && func0.call(data, "members")){
if(!(validate27(data.members, {instancePath:instancePath+"/members",parentData:data,parentDataProperty:"members",rootData}))){
vErrors = vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);
errors = vErrors.length;
}
}
}
else {
const err7 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
validate26.errors = vErrors;
return errors === 0;
}

const schema60 = {"type":"object","additionalProperties":false,"required":["id","label","family_id"],"properties":{"id":{"$ref":"#/definitions/id"},"label":{"$ref":"#/definitions/text"},"family_id":{"$ref":"#/definitions/ref"}}};

function validate30(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.label === undefined) || (!(func0.call(data, "label")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.family_id === undefined) || (!(func0.call(data, "family_id")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "family_id"},message:"must have required property '"+"family_id"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(((key0 === "id") || (key0 === "label")) || (key0 === "family_id"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err4 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.label !== undefined && func0.call(data, "label")){
if(typeof data.label !== "string"){
const err6 = {instancePath:instancePath+"/label",schemaPath:"#/definitions/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.family_id !== undefined && func0.call(data, "family_id")){
let data2 = data.family_id;
if(typeof data2 === "string"){
if(!pattern0.test(data2)){
const err7 = {instancePath:instancePath+"/family_id",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/family_id",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
validate30.errors = vErrors;
return errors === 0;
}

const schema66 = {"type":"object","additionalProperties":false,"required":["id","label","owner_id","type","opening_balance_minor","opening_balance_as_of"],"properties":{"id":{"$ref":"#/definitions/id"},"label":{"$ref":"#/definitions/text"},"owner_id":{"$ref":"#/definitions/ref"},"type":{"enum":["checking","reserve"]},"opening_balance_minor":{"$ref":"#/definitions/money_minor"},"opening_balance_as_of":{"$ref":"#/definitions/date"}}};
const schema70 = {"type":"integer","minimum":-9007199254740991,"maximum":9007199254740991};
const schema71 = {"type":"string","pattern":"^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$","format":"date"};

function validate32(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.label === undefined) || (!(func0.call(data, "label")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.owner_id === undefined) || (!(func0.call(data, "owner_id")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "owner_id"},message:"must have required property '"+"owner_id"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if((data.type === undefined) || (!(func0.call(data, "type")))){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if((data.opening_balance_minor === undefined) || (!(func0.call(data, "opening_balance_minor")))){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "opening_balance_minor"},message:"must have required property '"+"opening_balance_minor"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if((data.opening_balance_as_of === undefined) || (!(func0.call(data, "opening_balance_as_of")))){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "opening_balance_as_of"},message:"must have required property '"+"opening_balance_as_of"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!((((((key0 === "id") || (key0 === "label")) || (key0 === "owner_id")) || (key0 === "type")) || (key0 === "opening_balance_minor")) || (key0 === "opening_balance_as_of"))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.label !== undefined && func0.call(data, "label")){
if(typeof data.label !== "string"){
const err9 = {instancePath:instancePath+"/label",schemaPath:"#/definitions/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.owner_id !== undefined && func0.call(data, "owner_id")){
let data2 = data.owner_id;
if(typeof data2 === "string"){
if(!pattern0.test(data2)){
const err10 = {instancePath:instancePath+"/owner_id",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/owner_id",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.type !== undefined && func0.call(data, "type")){
let data3 = data.type;
if(!((data3 === "checking") || (data3 === "reserve"))){
const err12 = {instancePath:instancePath+"/type",schemaPath:"#/properties/type/enum",keyword:"enum",params:{allowedValues: schema66.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.opening_balance_minor !== undefined && func0.call(data, "opening_balance_minor")){
let data4 = data.opening_balance_minor;
if(!(((typeof data4 == "number") && (!(data4 % 1) && !isNaN(data4))) && (isFinite(data4)))){
const err13 = {instancePath:instancePath+"/opening_balance_minor",schemaPath:"#/definitions/money_minor/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if((typeof data4 == "number") && (isFinite(data4))){
if(data4 > 9007199254740991 || isNaN(data4)){
const err14 = {instancePath:instancePath+"/opening_balance_minor",schemaPath:"#/definitions/money_minor/maximum",keyword:"maximum",params:{comparison: "<=", limit: 9007199254740991},message:"must be <= 9007199254740991"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data4 < -9007199254740991 || isNaN(data4)){
const err15 = {instancePath:instancePath+"/opening_balance_minor",schemaPath:"#/definitions/money_minor/minimum",keyword:"minimum",params:{comparison: ">=", limit: -9007199254740991},message:"must be >= -9007199254740991"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
if(data.opening_balance_as_of !== undefined && func0.call(data, "opening_balance_as_of")){
let data5 = data.opening_balance_as_of;
if(typeof data5 === "string"){
if(!pattern12.test(data5)){
const err16 = {instancePath:instancePath+"/opening_balance_as_of",schemaPath:"#/definitions/date/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"},message:"must match pattern \""+"^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"+"\""};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(!(formats0.validate(data5))){
const err17 = {instancePath:instancePath+"/opening_balance_as_of",schemaPath:"#/definitions/date/format",keyword:"format",params:{format: "date"},message:"must match format \""+"date"+"\""};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/opening_balance_as_of",schemaPath:"#/definitions/date/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
}
else {
const err19 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
validate32.errors = vErrors;
return errors === 0;
}

const schema74 = {"type":"object","additionalProperties":false,"required":["id","label","owner_id","closing_day","due_day"],"properties":{"id":{"$ref":"#/definitions/id"},"label":{"$ref":"#/definitions/text"},"owner_id":{"$ref":"#/definitions/ref"},"closing_day":{"allOf":[{"$ref":"#/definitions/positive_integer"},{"maximum":31}]},"due_day":{"allOf":[{"$ref":"#/definitions/positive_integer"},{"maximum":31}]}}};
const schema78 = {"type":"integer","minimum":1,"maximum":9007199254740991};

function validate34(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.label === undefined) || (!(func0.call(data, "label")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.owner_id === undefined) || (!(func0.call(data, "owner_id")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "owner_id"},message:"must have required property '"+"owner_id"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if((data.closing_day === undefined) || (!(func0.call(data, "closing_day")))){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "closing_day"},message:"must have required property '"+"closing_day"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if((data.due_day === undefined) || (!(func0.call(data, "due_day")))){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "due_day"},message:"must have required property '"+"due_day"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(((((key0 === "id") || (key0 === "label")) || (key0 === "owner_id")) || (key0 === "closing_day")) || (key0 === "due_day"))){
const err5 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.label !== undefined && func0.call(data, "label")){
if(typeof data.label !== "string"){
const err8 = {instancePath:instancePath+"/label",schemaPath:"#/definitions/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.owner_id !== undefined && func0.call(data, "owner_id")){
let data2 = data.owner_id;
if(typeof data2 === "string"){
if(!pattern0.test(data2)){
const err9 = {instancePath:instancePath+"/owner_id",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/owner_id",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.closing_day !== undefined && func0.call(data, "closing_day")){
let data3 = data.closing_day;
if(!(((typeof data3 == "number") && (!(data3 % 1) && !isNaN(data3))) && (isFinite(data3)))){
const err11 = {instancePath:instancePath+"/closing_day",schemaPath:"#/definitions/positive_integer/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if((typeof data3 == "number") && (isFinite(data3))){
if(data3 > 9007199254740991 || isNaN(data3)){
const err12 = {instancePath:instancePath+"/closing_day",schemaPath:"#/definitions/positive_integer/maximum",keyword:"maximum",params:{comparison: "<=", limit: 9007199254740991},message:"must be <= 9007199254740991"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data3 < 1 || isNaN(data3)){
const err13 = {instancePath:instancePath+"/closing_day",schemaPath:"#/definitions/positive_integer/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if((typeof data3 == "number") && (isFinite(data3))){
if(data3 > 31 || isNaN(data3)){
const err14 = {instancePath:instancePath+"/closing_day",schemaPath:"#/properties/closing_day/allOf/1/maximum",keyword:"maximum",params:{comparison: "<=", limit: 31},message:"must be <= 31"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
}
if(data.due_day !== undefined && func0.call(data, "due_day")){
let data4 = data.due_day;
if(!(((typeof data4 == "number") && (!(data4 % 1) && !isNaN(data4))) && (isFinite(data4)))){
const err15 = {instancePath:instancePath+"/due_day",schemaPath:"#/definitions/positive_integer/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if((typeof data4 == "number") && (isFinite(data4))){
if(data4 > 9007199254740991 || isNaN(data4)){
const err16 = {instancePath:instancePath+"/due_day",schemaPath:"#/definitions/positive_integer/maximum",keyword:"maximum",params:{comparison: "<=", limit: 9007199254740991},message:"must be <= 9007199254740991"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(data4 < 1 || isNaN(data4)){
const err17 = {instancePath:instancePath+"/due_day",schemaPath:"#/definitions/positive_integer/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if((typeof data4 == "number") && (isFinite(data4))){
if(data4 > 31 || isNaN(data4)){
const err18 = {instancePath:instancePath+"/due_day",schemaPath:"#/properties/due_day/allOf/1/maximum",keyword:"maximum",params:{comparison: "<=", limit: 31},message:"must be <= 31"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
}
}
else {
const err19 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
validate34.errors = vErrors;
return errors === 0;
}

const schema82 = {"type":"object","additionalProperties":false,"required":["id","label","kind"],"properties":{"id":{"$ref":"#/definitions/id"},"label":{"$ref":"#/definitions/text"},"kind":{"enum":["expense","income","neutral","compensation"]},"budget_class":{"enum":["essential","flexible"]}}};

function validate36(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.label === undefined) || (!(func0.call(data, "label")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!((((key0 === "id") || (key0 === "label")) || (key0 === "kind")) || (key0 === "budget_class"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err4 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.label !== undefined && func0.call(data, "label")){
if(typeof data.label !== "string"){
const err6 = {instancePath:instancePath+"/label",schemaPath:"#/definitions/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
let data2 = data.kind;
if(!((((data2 === "expense") || (data2 === "income")) || (data2 === "neutral")) || (data2 === "compensation"))){
const err7 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/enum",keyword:"enum",params:{allowedValues: schema82.properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.budget_class !== undefined && func0.call(data, "budget_class")){
let data3 = data.budget_class;
if(!((data3 === "essential") || (data3 === "flexible"))){
const err8 = {instancePath:instancePath+"/budget_class",schemaPath:"#/properties/budget_class/enum",keyword:"enum",params:{allowedValues: schema82.properties.budget_class.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
validate36.errors = vErrors;
return errors === 0;
}

const schema87 = {"type":"object","additionalProperties":false,"required":["id","date","person_id","category_id","amount_minor","state"],"properties":{"id":{"$ref":"#/definitions/id"},"date":{"$ref":"#/definitions/date"},"person_id":{"$ref":"#/definitions/ref"},"account_id":{"$ref":"#/definitions/ref"},"card_id":{"$ref":"#/definitions/ref"},"category_id":{"$ref":"#/definitions/ref"},"amount_minor":{"$ref":"#/definitions/money_minor"},"state":{"enum":["confirmed","projected"]},"merchant_key":{"$ref":"#/definitions/ref"},"compensates":{"$ref":"#/definitions/ref"},"transfer_pair":{"$ref":"#/definitions/ref"},"settles_card_id":{"$ref":"#/definitions/ref"},"installment_plan":{"$ref":"#/definitions/ref"},"installment_number":{"$ref":"#/definitions/positive_integer"},"installment_total":{"$ref":"#/definitions/positive_integer"}}};

function validate38(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.date === undefined) || (!(func0.call(data, "date")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "date"},message:"must have required property '"+"date"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.person_id === undefined) || (!(func0.call(data, "person_id")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "person_id"},message:"must have required property '"+"person_id"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if((data.category_id === undefined) || (!(func0.call(data, "category_id")))){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "category_id"},message:"must have required property '"+"category_id"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if((data.amount_minor === undefined) || (!(func0.call(data, "amount_minor")))){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "amount_minor"},message:"must have required property '"+"amount_minor"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if((data.state === undefined) || (!(func0.call(data, "state")))){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "state"},message:"must have required property '"+"state"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(func0.call(schema87.properties, key0))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.date !== undefined && func0.call(data, "date")){
let data1 = data.date;
if(typeof data1 === "string"){
if(!pattern12.test(data1)){
const err9 = {instancePath:instancePath+"/date",schemaPath:"#/definitions/date/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"},message:"must match pattern \""+"^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(!(formats0.validate(data1))){
const err10 = {instancePath:instancePath+"/date",schemaPath:"#/definitions/date/format",keyword:"format",params:{format: "date"},message:"must match format \""+"date"+"\""};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/date",schemaPath:"#/definitions/date/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.person_id !== undefined && func0.call(data, "person_id")){
let data2 = data.person_id;
if(typeof data2 === "string"){
if(!pattern0.test(data2)){
const err12 = {instancePath:instancePath+"/person_id",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/person_id",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.account_id !== undefined && func0.call(data, "account_id")){
let data3 = data.account_id;
if(typeof data3 === "string"){
if(!pattern0.test(data3)){
const err14 = {instancePath:instancePath+"/account_id",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/account_id",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.card_id !== undefined && func0.call(data, "card_id")){
let data4 = data.card_id;
if(typeof data4 === "string"){
if(!pattern0.test(data4)){
const err16 = {instancePath:instancePath+"/card_id",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
else {
const err17 = {instancePath:instancePath+"/card_id",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.category_id !== undefined && func0.call(data, "category_id")){
let data5 = data.category_id;
if(typeof data5 === "string"){
if(!pattern0.test(data5)){
const err18 = {instancePath:instancePath+"/category_id",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
else {
const err19 = {instancePath:instancePath+"/category_id",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.amount_minor !== undefined && func0.call(data, "amount_minor")){
let data6 = data.amount_minor;
if(!(((typeof data6 == "number") && (!(data6 % 1) && !isNaN(data6))) && (isFinite(data6)))){
const err20 = {instancePath:instancePath+"/amount_minor",schemaPath:"#/definitions/money_minor/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if((typeof data6 == "number") && (isFinite(data6))){
if(data6 > 9007199254740991 || isNaN(data6)){
const err21 = {instancePath:instancePath+"/amount_minor",schemaPath:"#/definitions/money_minor/maximum",keyword:"maximum",params:{comparison: "<=", limit: 9007199254740991},message:"must be <= 9007199254740991"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(data6 < -9007199254740991 || isNaN(data6)){
const err22 = {instancePath:instancePath+"/amount_minor",schemaPath:"#/definitions/money_minor/minimum",keyword:"minimum",params:{comparison: ">=", limit: -9007199254740991},message:"must be >= -9007199254740991"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
}
if(data.state !== undefined && func0.call(data, "state")){
let data7 = data.state;
if(!((data7 === "confirmed") || (data7 === "projected"))){
const err23 = {instancePath:instancePath+"/state",schemaPath:"#/properties/state/enum",keyword:"enum",params:{allowedValues: schema87.properties.state.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.merchant_key !== undefined && func0.call(data, "merchant_key")){
let data8 = data.merchant_key;
if(typeof data8 === "string"){
if(!pattern0.test(data8)){
const err24 = {instancePath:instancePath+"/merchant_key",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
else {
const err25 = {instancePath:instancePath+"/merchant_key",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.compensates !== undefined && func0.call(data, "compensates")){
let data9 = data.compensates;
if(typeof data9 === "string"){
if(!pattern0.test(data9)){
const err26 = {instancePath:instancePath+"/compensates",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
else {
const err27 = {instancePath:instancePath+"/compensates",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.transfer_pair !== undefined && func0.call(data, "transfer_pair")){
let data10 = data.transfer_pair;
if(typeof data10 === "string"){
if(!pattern0.test(data10)){
const err28 = {instancePath:instancePath+"/transfer_pair",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
else {
const err29 = {instancePath:instancePath+"/transfer_pair",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.settles_card_id !== undefined && func0.call(data, "settles_card_id")){
let data11 = data.settles_card_id;
if(typeof data11 === "string"){
if(!pattern0.test(data11)){
const err30 = {instancePath:instancePath+"/settles_card_id",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
else {
const err31 = {instancePath:instancePath+"/settles_card_id",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data.installment_plan !== undefined && func0.call(data, "installment_plan")){
let data12 = data.installment_plan;
if(typeof data12 === "string"){
if(!pattern0.test(data12)){
const err32 = {instancePath:instancePath+"/installment_plan",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
else {
const err33 = {instancePath:instancePath+"/installment_plan",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data.installment_number !== undefined && func0.call(data, "installment_number")){
let data13 = data.installment_number;
if(!(((typeof data13 == "number") && (!(data13 % 1) && !isNaN(data13))) && (isFinite(data13)))){
const err34 = {instancePath:instancePath+"/installment_number",schemaPath:"#/definitions/positive_integer/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
if((typeof data13 == "number") && (isFinite(data13))){
if(data13 > 9007199254740991 || isNaN(data13)){
const err35 = {instancePath:instancePath+"/installment_number",schemaPath:"#/definitions/positive_integer/maximum",keyword:"maximum",params:{comparison: "<=", limit: 9007199254740991},message:"must be <= 9007199254740991"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
if(data13 < 1 || isNaN(data13)){
const err36 = {instancePath:instancePath+"/installment_number",schemaPath:"#/definitions/positive_integer/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
}
if(data.installment_total !== undefined && func0.call(data, "installment_total")){
let data14 = data.installment_total;
if(!(((typeof data14 == "number") && (!(data14 % 1) && !isNaN(data14))) && (isFinite(data14)))){
const err37 = {instancePath:instancePath+"/installment_total",schemaPath:"#/definitions/positive_integer/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
if((typeof data14 == "number") && (isFinite(data14))){
if(data14 > 9007199254740991 || isNaN(data14)){
const err38 = {instancePath:instancePath+"/installment_total",schemaPath:"#/definitions/positive_integer/maximum",keyword:"maximum",params:{comparison: "<=", limit: 9007199254740991},message:"must be <= 9007199254740991"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
if(data14 < 1 || isNaN(data14)){
const err39 = {instancePath:instancePath+"/installment_total",schemaPath:"#/definitions/positive_integer/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
}
}
else {
const err40 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
validate38.errors = vErrors;
return errors === 0;
}

const schema104 = {"type":"object","additionalProperties":false,"required":["id","family_id","category_id","period","limit_minor","evidence_state","source"],"properties":{"id":{"$ref":"#/definitions/id"},"family_id":{"$ref":"#/definitions/ref"},"category_id":{"$ref":"#/definitions/ref"},"period":{"$ref":"#/definitions/month"},"limit_minor":{"$ref":"#/definitions/money_minor"},"evidence_state":{"enum":["confirmed"]},"source":{"$ref":"#/definitions/ref"}}};
const schema108 = {"type":"string","pattern":"^[0-9]{4}-(0[1-9]|1[0-2])$"};

function validate40(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.family_id === undefined) || (!(func0.call(data, "family_id")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "family_id"},message:"must have required property '"+"family_id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.category_id === undefined) || (!(func0.call(data, "category_id")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "category_id"},message:"must have required property '"+"category_id"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if((data.period === undefined) || (!(func0.call(data, "period")))){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "period"},message:"must have required property '"+"period"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if((data.limit_minor === undefined) || (!(func0.call(data, "limit_minor")))){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "limit_minor"},message:"must have required property '"+"limit_minor"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if((data.evidence_state === undefined) || (!(func0.call(data, "evidence_state")))){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "evidence_state"},message:"must have required property '"+"evidence_state"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if((data.source === undefined) || (!(func0.call(data, "source")))){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "source"},message:"must have required property '"+"source"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(((((((key0 === "id") || (key0 === "family_id")) || (key0 === "category_id")) || (key0 === "period")) || (key0 === "limit_minor")) || (key0 === "evidence_state")) || (key0 === "source"))){
const err7 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.family_id !== undefined && func0.call(data, "family_id")){
let data1 = data.family_id;
if(typeof data1 === "string"){
if(!pattern0.test(data1)){
const err10 = {instancePath:instancePath+"/family_id",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/family_id",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.category_id !== undefined && func0.call(data, "category_id")){
let data2 = data.category_id;
if(typeof data2 === "string"){
if(!pattern0.test(data2)){
const err12 = {instancePath:instancePath+"/category_id",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/category_id",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.period !== undefined && func0.call(data, "period")){
let data3 = data.period;
if(typeof data3 === "string"){
if(!pattern13.test(data3)){
const err14 = {instancePath:instancePath+"/period",schemaPath:"#/definitions/month/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$"},message:"must match pattern \""+"^[0-9]{4}-(0[1-9]|1[0-2])$"+"\""};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/period",schemaPath:"#/definitions/month/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.limit_minor !== undefined && func0.call(data, "limit_minor")){
let data4 = data.limit_minor;
if(!(((typeof data4 == "number") && (!(data4 % 1) && !isNaN(data4))) && (isFinite(data4)))){
const err16 = {instancePath:instancePath+"/limit_minor",schemaPath:"#/definitions/money_minor/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if((typeof data4 == "number") && (isFinite(data4))){
if(data4 > 9007199254740991 || isNaN(data4)){
const err17 = {instancePath:instancePath+"/limit_minor",schemaPath:"#/definitions/money_minor/maximum",keyword:"maximum",params:{comparison: "<=", limit: 9007199254740991},message:"must be <= 9007199254740991"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(data4 < -9007199254740991 || isNaN(data4)){
const err18 = {instancePath:instancePath+"/limit_minor",schemaPath:"#/definitions/money_minor/minimum",keyword:"minimum",params:{comparison: ">=", limit: -9007199254740991},message:"must be >= -9007199254740991"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
}
if(data.evidence_state !== undefined && func0.call(data, "evidence_state")){
if(!(data.evidence_state === "confirmed")){
const err19 = {instancePath:instancePath+"/evidence_state",schemaPath:"#/properties/evidence_state/enum",keyword:"enum",params:{allowedValues: schema104.properties.evidence_state.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.source !== undefined && func0.call(data, "source")){
let data6 = data.source;
if(typeof data6 === "string"){
if(!pattern0.test(data6)){
const err20 = {instancePath:instancePath+"/source",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
else {
const err21 = {instancePath:instancePath+"/source",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
}
else {
const err22 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
validate40.errors = vErrors;
return errors === 0;
}

const schema113 = {"type":"object","additionalProperties":false,"required":["id","person_id","due_date","amount_minor","status","evidence_state","source"],"properties":{"id":{"$ref":"#/definitions/id"},"person_id":{"$ref":"#/definitions/ref"},"due_date":{"$ref":"#/definitions/date"},"amount_minor":{"$ref":"#/definitions/money_minor"},"status":{"enum":["open","paid","cancelled"]},"evidence_state":{"enum":["confirmed","projected"]},"source":{"$ref":"#/definitions/ref"}}};

function validate42(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.person_id === undefined) || (!(func0.call(data, "person_id")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "person_id"},message:"must have required property '"+"person_id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.due_date === undefined) || (!(func0.call(data, "due_date")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "due_date"},message:"must have required property '"+"due_date"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if((data.amount_minor === undefined) || (!(func0.call(data, "amount_minor")))){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "amount_minor"},message:"must have required property '"+"amount_minor"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if((data.status === undefined) || (!(func0.call(data, "status")))){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if((data.evidence_state === undefined) || (!(func0.call(data, "evidence_state")))){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "evidence_state"},message:"must have required property '"+"evidence_state"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if((data.source === undefined) || (!(func0.call(data, "source")))){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "source"},message:"must have required property '"+"source"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(((((((key0 === "id") || (key0 === "person_id")) || (key0 === "due_date")) || (key0 === "amount_minor")) || (key0 === "status")) || (key0 === "evidence_state")) || (key0 === "source"))){
const err7 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.person_id !== undefined && func0.call(data, "person_id")){
let data1 = data.person_id;
if(typeof data1 === "string"){
if(!pattern0.test(data1)){
const err10 = {instancePath:instancePath+"/person_id",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/person_id",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.due_date !== undefined && func0.call(data, "due_date")){
let data2 = data.due_date;
if(typeof data2 === "string"){
if(!pattern12.test(data2)){
const err12 = {instancePath:instancePath+"/due_date",schemaPath:"#/definitions/date/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"},message:"must match pattern \""+"^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(!(formats0.validate(data2))){
const err13 = {instancePath:instancePath+"/due_date",schemaPath:"#/definitions/date/format",keyword:"format",params:{format: "date"},message:"must match format \""+"date"+"\""};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
else {
const err14 = {instancePath:instancePath+"/due_date",schemaPath:"#/definitions/date/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.amount_minor !== undefined && func0.call(data, "amount_minor")){
let data3 = data.amount_minor;
if(!(((typeof data3 == "number") && (!(data3 % 1) && !isNaN(data3))) && (isFinite(data3)))){
const err15 = {instancePath:instancePath+"/amount_minor",schemaPath:"#/definitions/money_minor/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if((typeof data3 == "number") && (isFinite(data3))){
if(data3 > 9007199254740991 || isNaN(data3)){
const err16 = {instancePath:instancePath+"/amount_minor",schemaPath:"#/definitions/money_minor/maximum",keyword:"maximum",params:{comparison: "<=", limit: 9007199254740991},message:"must be <= 9007199254740991"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(data3 < -9007199254740991 || isNaN(data3)){
const err17 = {instancePath:instancePath+"/amount_minor",schemaPath:"#/definitions/money_minor/minimum",keyword:"minimum",params:{comparison: ">=", limit: -9007199254740991},message:"must be >= -9007199254740991"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
}
if(data.status !== undefined && func0.call(data, "status")){
let data4 = data.status;
if(!(((data4 === "open") || (data4 === "paid")) || (data4 === "cancelled"))){
const err18 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema113.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.evidence_state !== undefined && func0.call(data, "evidence_state")){
let data5 = data.evidence_state;
if(!((data5 === "confirmed") || (data5 === "projected"))){
const err19 = {instancePath:instancePath+"/evidence_state",schemaPath:"#/properties/evidence_state/enum",keyword:"enum",params:{allowedValues: schema113.properties.evidence_state.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.source !== undefined && func0.call(data, "source")){
let data6 = data.source;
if(typeof data6 === "string"){
if(!pattern0.test(data6)){
const err20 = {instancePath:instancePath+"/source",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
else {
const err21 = {instancePath:instancePath+"/source",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
}
else {
const err22 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
validate42.errors = vErrors;
return errors === 0;
}

const schema121 = {"type":"object","additionalProperties":false,"required":["id","source","coverage"],"properties":{"id":{"$ref":"#/definitions/id"},"source":{"$ref":"#/definitions/ref"},"period":{"$ref":"#/definitions/month"},"entity_id":{"$ref":"#/definitions/ref"},"category_id":{"$ref":"#/definitions/ref"},"coverage":{"enum":["complete","partial","unavailable"]},"event_count":{"$ref":"#/definitions/nonnegative_integer"}}};
const schema127 = {"type":"integer","minimum":0,"maximum":9007199254740991};

function validate44(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.source === undefined) || (!(func0.call(data, "source")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "source"},message:"must have required property '"+"source"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.coverage === undefined) || (!(func0.call(data, "coverage")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "coverage"},message:"must have required property '"+"coverage"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(((((((key0 === "id") || (key0 === "source")) || (key0 === "period")) || (key0 === "entity_id")) || (key0 === "category_id")) || (key0 === "coverage")) || (key0 === "event_count"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err4 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.source !== undefined && func0.call(data, "source")){
let data1 = data.source;
if(typeof data1 === "string"){
if(!pattern0.test(data1)){
const err6 = {instancePath:instancePath+"/source",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/source",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.period !== undefined && func0.call(data, "period")){
let data2 = data.period;
if(typeof data2 === "string"){
if(!pattern13.test(data2)){
const err8 = {instancePath:instancePath+"/period",schemaPath:"#/definitions/month/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$"},message:"must match pattern \""+"^[0-9]{4}-(0[1-9]|1[0-2])$"+"\""};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/period",schemaPath:"#/definitions/month/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.entity_id !== undefined && func0.call(data, "entity_id")){
let data3 = data.entity_id;
if(typeof data3 === "string"){
if(!pattern0.test(data3)){
const err10 = {instancePath:instancePath+"/entity_id",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/entity_id",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.category_id !== undefined && func0.call(data, "category_id")){
let data4 = data.category_id;
if(typeof data4 === "string"){
if(!pattern0.test(data4)){
const err12 = {instancePath:instancePath+"/category_id",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/category_id",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.coverage !== undefined && func0.call(data, "coverage")){
let data5 = data.coverage;
if(!(((data5 === "complete") || (data5 === "partial")) || (data5 === "unavailable"))){
const err14 = {instancePath:instancePath+"/coverage",schemaPath:"#/properties/coverage/enum",keyword:"enum",params:{allowedValues: schema121.properties.coverage.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.event_count !== undefined && func0.call(data, "event_count")){
let data6 = data.event_count;
if(!(((typeof data6 == "number") && (!(data6 % 1) && !isNaN(data6))) && (isFinite(data6)))){
const err15 = {instancePath:instancePath+"/event_count",schemaPath:"#/definitions/nonnegative_integer/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if((typeof data6 == "number") && (isFinite(data6))){
if(data6 > 9007199254740991 || isNaN(data6)){
const err16 = {instancePath:instancePath+"/event_count",schemaPath:"#/definitions/nonnegative_integer/maximum",keyword:"maximum",params:{comparison: "<=", limit: 9007199254740991},message:"must be <= 9007199254740991"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(data6 < 0 || isNaN(data6)){
const err17 = {instancePath:instancePath+"/event_count",schemaPath:"#/definitions/nonnegative_integer/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
}
}
else {
const err18 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
validate44.errors = vErrors;
return errors === 0;
}

const schema130 = {"type":"object","additionalProperties":false,"required":["id","state","expires_at","source_version"],"properties":{"id":{"$ref":"#/definitions/id"},"state":{"enum":["presented","expired","superseded"]},"expires_at":{"$ref":"#/definitions/datetime"},"source_version":{"$ref":"#/definitions/id"}}};
const schema132 = {"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$"};
const pattern86 = new RegExp("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$", "u");
const formats12 = require("./formats").fullFormats["date-time"];

function validate46(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.state === undefined) || (!(func0.call(data, "state")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "state"},message:"must have required property '"+"state"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.expires_at === undefined) || (!(func0.call(data, "expires_at")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "expires_at"},message:"must have required property '"+"expires_at"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if((data.source_version === undefined) || (!(func0.call(data, "source_version")))){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "source_version"},message:"must have required property '"+"source_version"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!((((key0 === "id") || (key0 === "state")) || (key0 === "expires_at")) || (key0 === "source_version"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.state !== undefined && func0.call(data, "state")){
let data1 = data.state;
if(!(((data1 === "presented") || (data1 === "expired")) || (data1 === "superseded"))){
const err7 = {instancePath:instancePath+"/state",schemaPath:"#/properties/state/enum",keyword:"enum",params:{allowedValues: schema130.properties.state.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.expires_at !== undefined && func0.call(data, "expires_at")){
let data2 = data.expires_at;
if(typeof data2 === "string"){
if(!pattern86.test(data2)){
const err8 = {instancePath:instancePath+"/expires_at",schemaPath:"#/definitions/datetime/pattern",keyword:"pattern",params:{pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$"},message:"must match pattern \""+"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$"+"\""};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(!(formats12.validate(data2))){
const err9 = {instancePath:instancePath+"/expires_at",schemaPath:"#/definitions/datetime/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/expires_at",schemaPath:"#/definitions/datetime/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.source_version !== undefined && func0.call(data, "source_version")){
let data3 = data.source_version;
if(typeof data3 === "string"){
if(!pattern0.test(data3)){
const err11 = {instancePath:instancePath+"/source_version",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/source_version",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
else {
const err13 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
validate46.errors = vErrors;
return errors === 0;
}

const schema136 = {"type":"object","additionalProperties":false,"required":["id","person_id","scheduled_at"],"properties":{"id":{"$ref":"#/definitions/id"},"person_id":{"$ref":"#/definitions/ref"},"scheduled_at":{"$ref":"#/definitions/date"}}};

function validate48(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.person_id === undefined) || (!(func0.call(data, "person_id")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "person_id"},message:"must have required property '"+"person_id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.scheduled_at === undefined) || (!(func0.call(data, "scheduled_at")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "scheduled_at"},message:"must have required property '"+"scheduled_at"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(((key0 === "id") || (key0 === "person_id")) || (key0 === "scheduled_at"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err4 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.person_id !== undefined && func0.call(data, "person_id")){
let data1 = data.person_id;
if(typeof data1 === "string"){
if(!pattern0.test(data1)){
const err6 = {instancePath:instancePath+"/person_id",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/person_id",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.scheduled_at !== undefined && func0.call(data, "scheduled_at")){
let data2 = data.scheduled_at;
if(typeof data2 === "string"){
if(!pattern12.test(data2)){
const err8 = {instancePath:instancePath+"/scheduled_at",schemaPath:"#/definitions/date/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"},message:"must match pattern \""+"^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"+"\""};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(!(formats0.validate(data2))){
const err9 = {instancePath:instancePath+"/scheduled_at",schemaPath:"#/definitions/date/format",keyword:"format",params:{format: "date"},message:"must match format \""+"date"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/scheduled_at",schemaPath:"#/definitions/date/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
else {
const err11 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
validate48.errors = vErrors;
return errors === 0;
}

const schema142 = {"type":"object","additionalProperties":false,"required":["id","person_id","scheduled_at"],"properties":{"id":{"$ref":"#/definitions/id"},"person_id":{"$ref":"#/definitions/ref"},"scheduled_at":{"$ref":"#/definitions/date"}}};

function validate50(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.person_id === undefined) || (!(func0.call(data, "person_id")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "person_id"},message:"must have required property '"+"person_id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.scheduled_at === undefined) || (!(func0.call(data, "scheduled_at")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "scheduled_at"},message:"must have required property '"+"scheduled_at"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(((key0 === "id") || (key0 === "person_id")) || (key0 === "scheduled_at"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err4 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.person_id !== undefined && func0.call(data, "person_id")){
let data1 = data.person_id;
if(typeof data1 === "string"){
if(!pattern0.test(data1)){
const err6 = {instancePath:instancePath+"/person_id",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/person_id",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.scheduled_at !== undefined && func0.call(data, "scheduled_at")){
let data2 = data.scheduled_at;
if(typeof data2 === "string"){
if(!pattern12.test(data2)){
const err8 = {instancePath:instancePath+"/scheduled_at",schemaPath:"#/definitions/date/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"},message:"must match pattern \""+"^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"+"\""};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(!(formats0.validate(data2))){
const err9 = {instancePath:instancePath+"/scheduled_at",schemaPath:"#/definitions/date/format",keyword:"format",params:{format: "date"},message:"must match format \""+"date"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/scheduled_at",schemaPath:"#/definitions/date/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
else {
const err11 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
validate50.errors = vErrors;
return errors === 0;
}

const schema148 = {"type":"object","additionalProperties":false,"required":["id","turn_id"],"properties":{"id":{"$ref":"#/definitions/id"},"turn_id":{"$ref":"#/definitions/ref"}}};

function validate52(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.turn_id === undefined) || (!(func0.call(data, "turn_id")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "turn_id"},message:"must have required property '"+"turn_id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!((key0 === "id") || (key0 === "turn_id"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err3 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
else {
const err4 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.turn_id !== undefined && func0.call(data, "turn_id")){
let data1 = data.turn_id;
if(typeof data1 === "string"){
if(!pattern0.test(data1)){
const err5 = {instancePath:instancePath+"/turn_id",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/turn_id",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
else {
const err7 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
validate52.errors = vErrors;
return errors === 0;
}

const schema153 = {"type":"object","additionalProperties":false,"required":["id","merchant_key","category_id","application","reversible","evidence_state","source"],"properties":{"id":{"$ref":"#/definitions/id"},"merchant_key":{"$ref":"#/definitions/ref"},"category_id":{"$ref":"#/definitions/ref"},"application":{"enum":["suggestion","automatic"]},"reversible":{"$ref":"#/definitions/boolean"},"evidence_state":{"enum":["confirmed"]},"source":{"$ref":"#/definitions/ref"}}};
const schema157 = {"type":"boolean"};

function validate54(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.merchant_key === undefined) || (!(func0.call(data, "merchant_key")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "merchant_key"},message:"must have required property '"+"merchant_key"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.category_id === undefined) || (!(func0.call(data, "category_id")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "category_id"},message:"must have required property '"+"category_id"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if((data.application === undefined) || (!(func0.call(data, "application")))){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "application"},message:"must have required property '"+"application"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if((data.reversible === undefined) || (!(func0.call(data, "reversible")))){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "reversible"},message:"must have required property '"+"reversible"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if((data.evidence_state === undefined) || (!(func0.call(data, "evidence_state")))){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "evidence_state"},message:"must have required property '"+"evidence_state"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if((data.source === undefined) || (!(func0.call(data, "source")))){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "source"},message:"must have required property '"+"source"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(((((((key0 === "id") || (key0 === "merchant_key")) || (key0 === "category_id")) || (key0 === "application")) || (key0 === "reversible")) || (key0 === "evidence_state")) || (key0 === "source"))){
const err7 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.merchant_key !== undefined && func0.call(data, "merchant_key")){
let data1 = data.merchant_key;
if(typeof data1 === "string"){
if(!pattern0.test(data1)){
const err10 = {instancePath:instancePath+"/merchant_key",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/merchant_key",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.category_id !== undefined && func0.call(data, "category_id")){
let data2 = data.category_id;
if(typeof data2 === "string"){
if(!pattern0.test(data2)){
const err12 = {instancePath:instancePath+"/category_id",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/category_id",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.application !== undefined && func0.call(data, "application")){
let data3 = data.application;
if(!((data3 === "suggestion") || (data3 === "automatic"))){
const err14 = {instancePath:instancePath+"/application",schemaPath:"#/properties/application/enum",keyword:"enum",params:{allowedValues: schema153.properties.application.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.reversible !== undefined && func0.call(data, "reversible")){
if(typeof data.reversible !== "boolean"){
const err15 = {instancePath:instancePath+"/reversible",schemaPath:"#/definitions/boolean/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.evidence_state !== undefined && func0.call(data, "evidence_state")){
if(!(data.evidence_state === "confirmed")){
const err16 = {instancePath:instancePath+"/evidence_state",schemaPath:"#/properties/evidence_state/enum",keyword:"enum",params:{allowedValues: schema153.properties.evidence_state.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.source !== undefined && func0.call(data, "source")){
let data6 = data.source;
if(typeof data6 === "string"){
if(!pattern0.test(data6)){
const err17 = {instancePath:instancePath+"/source",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/source",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
}
else {
const err19 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
validate54.errors = vErrors;
return errors === 0;
}

const schema161 = {"type":"object","additionalProperties":false,"required":["id","synthetic","closed_world","currency","fixed_clock"],"properties":{"id":{"$ref":"#/definitions/id"},"synthetic":{"$ref":"#/definitions/boolean"},"closed_world":{"$ref":"#/definitions/boolean"},"currency":{"enum":["BRL"]},"fixed_clock":{"$ref":"#/definitions/datetime"}}};

function validate56(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.synthetic === undefined) || (!(func0.call(data, "synthetic")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "synthetic"},message:"must have required property '"+"synthetic"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.closed_world === undefined) || (!(func0.call(data, "closed_world")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "closed_world"},message:"must have required property '"+"closed_world"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if((data.currency === undefined) || (!(func0.call(data, "currency")))){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "currency"},message:"must have required property '"+"currency"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if((data.fixed_clock === undefined) || (!(func0.call(data, "fixed_clock")))){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "fixed_clock"},message:"must have required property '"+"fixed_clock"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(((((key0 === "id") || (key0 === "synthetic")) || (key0 === "closed_world")) || (key0 === "currency")) || (key0 === "fixed_clock"))){
const err5 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.synthetic !== undefined && func0.call(data, "synthetic")){
if(typeof data.synthetic !== "boolean"){
const err8 = {instancePath:instancePath+"/synthetic",schemaPath:"#/definitions/boolean/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.closed_world !== undefined && func0.call(data, "closed_world")){
if(typeof data.closed_world !== "boolean"){
const err9 = {instancePath:instancePath+"/closed_world",schemaPath:"#/definitions/boolean/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.currency !== undefined && func0.call(data, "currency")){
if(!(data.currency === "BRL")){
const err10 = {instancePath:instancePath+"/currency",schemaPath:"#/properties/currency/enum",keyword:"enum",params:{allowedValues: schema161.properties.currency.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.fixed_clock !== undefined && func0.call(data, "fixed_clock")){
let data4 = data.fixed_clock;
if(typeof data4 === "string"){
if(!pattern86.test(data4)){
const err11 = {instancePath:instancePath+"/fixed_clock",schemaPath:"#/definitions/datetime/pattern",keyword:"pattern",params:{pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$"},message:"must match pattern \""+"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$"+"\""};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(!(formats12.validate(data4))){
const err12 = {instancePath:instancePath+"/fixed_clock",schemaPath:"#/definitions/datetime/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/fixed_clock",schemaPath:"#/definitions/datetime/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
else {
const err14 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
validate56.errors = vErrors;
return errors === 0;
}

const schema168 = {"type":"object","additionalProperties":false,"required":["id","fixture_id","collection_name","members"],"properties":{"id":{"$ref":"#/definitions/id"},"fixture_id":{"$ref":"#/definitions/ref"},"collection_name":{"enum":["families","people","accounts","cards","categories","events","budgets","bills","source_states","proposals","reminders","calendar_events","side_effects","merchant_rules"]},"members":{"$ref":"#/definitions/ref_list"}}};

function validate58(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.fixture_id === undefined) || (!(func0.call(data, "fixture_id")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "fixture_id"},message:"must have required property '"+"fixture_id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.collection_name === undefined) || (!(func0.call(data, "collection_name")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "collection_name"},message:"must have required property '"+"collection_name"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if((data.members === undefined) || (!(func0.call(data, "members")))){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "members"},message:"must have required property '"+"members"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!((((key0 === "id") || (key0 === "fixture_id")) || (key0 === "collection_name")) || (key0 === "members"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.fixture_id !== undefined && func0.call(data, "fixture_id")){
let data1 = data.fixture_id;
if(typeof data1 === "string"){
if(!pattern0.test(data1)){
const err7 = {instancePath:instancePath+"/fixture_id",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/fixture_id",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.collection_name !== undefined && func0.call(data, "collection_name")){
let data2 = data.collection_name;
if(!((((((((((((((data2 === "families") || (data2 === "people")) || (data2 === "accounts")) || (data2 === "cards")) || (data2 === "categories")) || (data2 === "events")) || (data2 === "budgets")) || (data2 === "bills")) || (data2 === "source_states")) || (data2 === "proposals")) || (data2 === "reminders")) || (data2 === "calendar_events")) || (data2 === "side_effects")) || (data2 === "merchant_rules"))){
const err9 = {instancePath:instancePath+"/collection_name",schemaPath:"#/properties/collection_name/enum",keyword:"enum",params:{allowedValues: schema168.properties.collection_name.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.members !== undefined && func0.call(data, "members")){
if(!(validate27(data.members, {instancePath:instancePath+"/members",parentData:data,parentDataProperty:"members",rootData}))){
vErrors = vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);
errors = vErrors.length;
}
}
}
else {
const err10 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
validate58.errors = vErrors;
return errors === 0;
}

const schema173 = {"type":"object","additionalProperties":false,"required":["id","fixture_id"],"properties":{"id":{"$ref":"#/definitions/id"},"fixture_id":{"$ref":"#/definitions/ref"}}};

function validate61(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.fixture_id === undefined) || (!(func0.call(data, "fixture_id")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "fixture_id"},message:"must have required property '"+"fixture_id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!((key0 === "id") || (key0 === "fixture_id"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err3 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
else {
const err4 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.fixture_id !== undefined && func0.call(data, "fixture_id")){
let data1 = data.fixture_id;
if(typeof data1 === "string"){
if(!pattern0.test(data1)){
const err5 = {instancePath:instancePath+"/fixture_id",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/fixture_id",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
else {
const err7 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
validate61.errors = vErrors;
return errors === 0;
}

const schema178 = {"type":"object","additionalProperties":false,"required":["id","fixture_id"],"properties":{"id":{"$ref":"#/definitions/id"},"fixture_id":{"$ref":"#/definitions/ref"}}};

function validate63(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.fixture_id === undefined) || (!(func0.call(data, "fixture_id")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "fixture_id"},message:"must have required property '"+"fixture_id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!((key0 === "id") || (key0 === "fixture_id"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err3 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
else {
const err4 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.fixture_id !== undefined && func0.call(data, "fixture_id")){
let data1 = data.fixture_id;
if(typeof data1 === "string"){
if(!pattern0.test(data1)){
const err5 = {instancePath:instancePath+"/fixture_id",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/fixture_id",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
else {
const err7 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
validate63.errors = vErrors;
return errors === 0;
}

const schema183 = {"type":"object","additionalProperties":false,"required":["id","members"],"properties":{"id":{"$ref":"#/definitions/id"},"members":{"$ref":"#/definitions/ref_list"}}};

function validate65(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.members === undefined) || (!(func0.call(data, "members")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "members"},message:"must have required property '"+"members"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!((key0 === "id") || (key0 === "members"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err3 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
else {
const err4 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.members !== undefined && func0.call(data, "members")){
if(!(validate27(data.members, {instancePath:instancePath+"/members",parentData:data,parentDataProperty:"members",rootData}))){
vErrors = vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);
errors = vErrors.length;
}
}
}
else {
const err5 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
validate65.errors = vErrors;
return errors === 0;
}

const schema187 = {"type":"object","additionalProperties":false,"required":["id","members","installment_total"],"properties":{"id":{"$ref":"#/definitions/id"},"members":{"$ref":"#/definitions/ref_list"},"installment_total":{"$ref":"#/definitions/positive_integer"}}};

function validate68(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.members === undefined) || (!(func0.call(data, "members")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "members"},message:"must have required property '"+"members"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.installment_total === undefined) || (!(func0.call(data, "installment_total")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "installment_total"},message:"must have required property '"+"installment_total"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(((key0 === "id") || (key0 === "members")) || (key0 === "installment_total"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err4 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.members !== undefined && func0.call(data, "members")){
if(!(validate27(data.members, {instancePath:instancePath+"/members",parentData:data,parentDataProperty:"members",rootData}))){
vErrors = vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);
errors = vErrors.length;
}
}
if(data.installment_total !== undefined && func0.call(data, "installment_total")){
let data2 = data.installment_total;
if(!(((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2))) && (isFinite(data2)))){
const err6 = {instancePath:instancePath+"/installment_total",schemaPath:"#/definitions/positive_integer/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 > 9007199254740991 || isNaN(data2)){
const err7 = {instancePath:instancePath+"/installment_total",schemaPath:"#/definitions/positive_integer/maximum",keyword:"maximum",params:{comparison: "<=", limit: 9007199254740991},message:"must be <= 9007199254740991"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data2 < 1 || isNaN(data2)){
const err8 = {instancePath:instancePath+"/installment_total",schemaPath:"#/definitions/positive_integer/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
validate68.errors = vErrors;
return errors === 0;
}

const schema192 = {"type":"object","additionalProperties":false,"required":["id","fixture_id"],"properties":{"id":{"$ref":"#/definitions/id"},"fixture_id":{"$ref":"#/definitions/ref"}}};

function validate71(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.fixture_id === undefined) || (!(func0.call(data, "fixture_id")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "fixture_id"},message:"must have required property '"+"fixture_id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!((key0 === "id") || (key0 === "fixture_id"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err3 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
else {
const err4 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.fixture_id !== undefined && func0.call(data, "fixture_id")){
let data1 = data.fixture_id;
if(typeof data1 === "string"){
if(!pattern0.test(data1)){
const err5 = {instancePath:instancePath+"/fixture_id",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/fixture_id",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
else {
const err7 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
validate71.errors = vErrors;
return errors === 0;
}

const schema197 = {"type":"object","additionalProperties":false,"required":["id","fact_key","evaluator_version","result_hash","result","parents"],"properties":{"id":{"$ref":"#/definitions/id"},"fact_key":{"$ref":"#/definitions/id"},"evaluator_version":{"$ref":"#/definitions/positive_integer"},"result_hash":{"$ref":"#/definitions/digest"},"result":{"$ref":"#/definitions/typed_result"},"parents":{"$ref":"#/definitions/role_ref_list"}}};
const schema202 = {"oneOf":[{"type":"object","additionalProperties":false,"required":["unit","kind","value"],"properties":{"unit":{"const":"BRL_minor"},"kind":{"const":"money_minor"},"value":{"$ref":"#/definitions/money_minor"}}},{"type":"object","additionalProperties":false,"required":["unit","kind","value"],"properties":{"unit":{"const":"count"},"kind":{"const":"nonnegative_integer"},"value":{"$ref":"#/definitions/nonnegative_integer"}}},{"type":"object","additionalProperties":false,"required":["unit","kind","value"],"properties":{"unit":{"const":"entity_ids"},"kind":{"const":"id"},"value":{"$ref":"#/definitions/ref"}}},{"type":"object","additionalProperties":false,"required":["unit","kind","value"],"properties":{"unit":{"const":"entity_ids"},"kind":{"const":"id_set"},"value":{"$ref":"#/definitions/ref_list"}}},{"type":"object","additionalProperties":false,"required":["unit","kind","value"],"properties":{"unit":{"const":"state"},"kind":{"const":"enum"},"value":{"type":"string","minLength":1}}}]};

function validate74(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.unit === undefined) || (!(func0.call(data, "unit")))){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "unit"},message:"must have required property '"+"unit"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.value === undefined) || (!(func0.call(data, "value")))){
const err2 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(((key0 === "unit") || (key0 === "kind")) || (key0 === "value"))){
const err3 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.unit !== undefined && func0.call(data, "unit")){
if("BRL_minor" !== data.unit){
const err4 = {instancePath:instancePath+"/unit",schemaPath:"#/oneOf/0/properties/unit/const",keyword:"const",params:{allowedValue: "BRL_minor"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("money_minor" !== data.kind){
const err5 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "money_minor"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.value !== undefined && func0.call(data, "value")){
let data2 = data.value;
if(!(((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2))) && (isFinite(data2)))){
const err6 = {instancePath:instancePath+"/value",schemaPath:"#/definitions/money_minor/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 > 9007199254740991 || isNaN(data2)){
const err7 = {instancePath:instancePath+"/value",schemaPath:"#/definitions/money_minor/maximum",keyword:"maximum",params:{comparison: "<=", limit: 9007199254740991},message:"must be <= 9007199254740991"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data2 < -9007199254740991 || isNaN(data2)){
const err8 = {instancePath:instancePath+"/value",schemaPath:"#/definitions/money_minor/minimum",keyword:"minimum",params:{comparison: ">=", limit: -9007199254740991},message:"must be >= -9007199254740991"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs9 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.unit === undefined) || (!(func0.call(data, "unit")))){
const err10 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "unit"},message:"must have required property '"+"unit"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err11 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if((data.value === undefined) || (!(func0.call(data, "value")))){
const err12 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
for(const key1 of Object.keys(data)){
if(!(((key1 === "unit") || (key1 === "kind")) || (key1 === "value"))){
const err13 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.unit !== undefined && func0.call(data, "unit")){
if("count" !== data.unit){
const err14 = {instancePath:instancePath+"/unit",schemaPath:"#/oneOf/1/properties/unit/const",keyword:"const",params:{allowedValue: "count"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("nonnegative_integer" !== data.kind){
const err15 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "nonnegative_integer"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.value !== undefined && func0.call(data, "value")){
let data5 = data.value;
if(!(((typeof data5 == "number") && (!(data5 % 1) && !isNaN(data5))) && (isFinite(data5)))){
const err16 = {instancePath:instancePath+"/value",schemaPath:"#/definitions/nonnegative_integer/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if((typeof data5 == "number") && (isFinite(data5))){
if(data5 > 9007199254740991 || isNaN(data5)){
const err17 = {instancePath:instancePath+"/value",schemaPath:"#/definitions/nonnegative_integer/maximum",keyword:"maximum",params:{comparison: "<=", limit: 9007199254740991},message:"must be <= 9007199254740991"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(data5 < 0 || isNaN(data5)){
const err18 = {instancePath:instancePath+"/value",schemaPath:"#/definitions/nonnegative_integer/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
}
}
else {
const err19 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
var _valid0 = _errs9 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
}
const _errs17 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.unit === undefined) || (!(func0.call(data, "unit")))){
const err20 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "unit"},message:"must have required property '"+"unit"+"'"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err21 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if((data.value === undefined) || (!(func0.call(data, "value")))){
const err22 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
for(const key2 of Object.keys(data)){
if(!(((key2 === "unit") || (key2 === "kind")) || (key2 === "value"))){
const err23 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.unit !== undefined && func0.call(data, "unit")){
if("entity_ids" !== data.unit){
const err24 = {instancePath:instancePath+"/unit",schemaPath:"#/oneOf/2/properties/unit/const",keyword:"const",params:{allowedValue: "entity_ids"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("id" !== data.kind){
const err25 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "id"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.value !== undefined && func0.call(data, "value")){
let data8 = data.value;
if(typeof data8 === "string"){
if(!pattern0.test(data8)){
const err26 = {instancePath:instancePath+"/value",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
else {
const err27 = {instancePath:instancePath+"/value",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
}
else {
const err28 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
var _valid0 = _errs17 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
}
const _errs25 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.unit === undefined) || (!(func0.call(data, "unit")))){
const err29 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "unit"},message:"must have required property '"+"unit"+"'"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err30 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if((data.value === undefined) || (!(func0.call(data, "value")))){
const err31 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
for(const key3 of Object.keys(data)){
if(!(((key3 === "unit") || (key3 === "kind")) || (key3 === "value"))){
const err32 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data.unit !== undefined && func0.call(data, "unit")){
if("entity_ids" !== data.unit){
const err33 = {instancePath:instancePath+"/unit",schemaPath:"#/oneOf/3/properties/unit/const",keyword:"const",params:{allowedValue: "entity_ids"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("id_set" !== data.kind){
const err34 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "id_set"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data.value !== undefined && func0.call(data, "value")){
if(!(validate27(data.value, {instancePath:instancePath+"/value",parentData:data,parentDataProperty:"value",rootData}))){
vErrors = vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);
errors = vErrors.length;
}
}
}
else {
const err35 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
var _valid0 = _errs25 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
}
const _errs31 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.unit === undefined) || (!(func0.call(data, "unit")))){
const err36 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "unit"},message:"must have required property '"+"unit"+"'"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err37 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
if((data.value === undefined) || (!(func0.call(data, "value")))){
const err38 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
for(const key4 of Object.keys(data)){
if(!(((key4 === "unit") || (key4 === "kind")) || (key4 === "value"))){
const err39 = {instancePath,schemaPath:"#/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data.unit !== undefined && func0.call(data, "unit")){
if("state" !== data.unit){
const err40 = {instancePath:instancePath+"/unit",schemaPath:"#/oneOf/4/properties/unit/const",keyword:"const",params:{allowedValue: "state"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("enum" !== data.kind){
const err41 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/4/properties/kind/const",keyword:"const",params:{allowedValue: "enum"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
if(data.value !== undefined && func0.call(data, "value")){
let data14 = data.value;
if(typeof data14 === "string"){
if(func176(data14) < 1){
const err42 = {instancePath:instancePath+"/value",schemaPath:"#/oneOf/4/properties/value/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
else {
const err43 = {instancePath:instancePath+"/value",schemaPath:"#/oneOf/4/properties/value/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
}
else {
const err44 = {instancePath,schemaPath:"#/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
var _valid0 = _errs31 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid0 = true;
passing0 = 4;
}
}
}
}
}
if(!valid0){
const err45 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate74.errors = vErrors;
return errors === 0;
}

const schema206 = {"type":"array","uniqueItems":true,"items":{"type":"object","additionalProperties":false,"required":["role_id","parent_ref"],"properties":{"role_id":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"},"parent_ref":{"$ref":"#/definitions/ref"}}}};

function validate77(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(Array.isArray(data)){
const len0 = data.length;
for(let i0=0; i0<len0; i0++){
let data0 = data[i0];
if(data0 && typeof data0 == "object" && !Array.isArray(data0)){
if((data0.role_id === undefined) || (!(func0.call(data0, "role_id")))){
const err0 = {instancePath:instancePath+"/" + i0,schemaPath:"#/items/required",keyword:"required",params:{missingProperty: "role_id"},message:"must have required property '"+"role_id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data0.parent_ref === undefined) || (!(func0.call(data0, "parent_ref")))){
const err1 = {instancePath:instancePath+"/" + i0,schemaPath:"#/items/required",keyword:"required",params:{missingProperty: "parent_ref"},message:"must have required property '"+"parent_ref"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 of Object.keys(data0)){
if(!((key0 === "role_id") || (key0 === "parent_ref"))){
const err2 = {instancePath:instancePath+"/" + i0,schemaPath:"#/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data0.role_id !== undefined && func0.call(data0, "role_id")){
let data1 = data0.role_id;
if(typeof data1 === "string"){
if(!pattern3.test(data1)){
const err3 = {instancePath:instancePath+"/" + i0+"/role_id",schemaPath:"#/items/properties/role_id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
else {
const err4 = {instancePath:instancePath+"/" + i0+"/role_id",schemaPath:"#/items/properties/role_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data0.parent_ref !== undefined && func0.call(data0, "parent_ref")){
let data2 = data0.parent_ref;
if(typeof data2 === "string"){
if(!pattern0.test(data2)){
const err5 = {instancePath:instancePath+"/" + i0+"/parent_ref",schemaPath:"#/definitions/ref/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/" + i0+"/parent_ref",schemaPath:"#/definitions/ref/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
else {
const err7 = {instancePath:instancePath+"/" + i0,schemaPath:"#/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
let i1 = data.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func32(data[i1], data[j0])){
const err8 = {instancePath,schemaPath:"#/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
validate77.errors = vErrors;
return errors === 0;
}


function validate73(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.fact_key === undefined) || (!(func0.call(data, "fact_key")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "fact_key"},message:"must have required property '"+"fact_key"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.evaluator_version === undefined) || (!(func0.call(data, "evaluator_version")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "evaluator_version"},message:"must have required property '"+"evaluator_version"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if((data.result_hash === undefined) || (!(func0.call(data, "result_hash")))){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "result_hash"},message:"must have required property '"+"result_hash"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if((data.result === undefined) || (!(func0.call(data, "result")))){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "result"},message:"must have required property '"+"result"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if((data.parents === undefined) || (!(func0.call(data, "parents")))){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "parents"},message:"must have required property '"+"parents"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!((((((key0 === "id") || (key0 === "fact_key")) || (key0 === "evaluator_version")) || (key0 === "result_hash")) || (key0 === "result")) || (key0 === "parents"))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.fact_key !== undefined && func0.call(data, "fact_key")){
let data1 = data.fact_key;
if(typeof data1 === "string"){
if(!pattern0.test(data1)){
const err9 = {instancePath:instancePath+"/fact_key",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/fact_key",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.evaluator_version !== undefined && func0.call(data, "evaluator_version")){
let data2 = data.evaluator_version;
if(!(((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2))) && (isFinite(data2)))){
const err11 = {instancePath:instancePath+"/evaluator_version",schemaPath:"#/definitions/positive_integer/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 > 9007199254740991 || isNaN(data2)){
const err12 = {instancePath:instancePath+"/evaluator_version",schemaPath:"#/definitions/positive_integer/maximum",keyword:"maximum",params:{comparison: "<=", limit: 9007199254740991},message:"must be <= 9007199254740991"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data2 < 1 || isNaN(data2)){
const err13 = {instancePath:instancePath+"/evaluator_version",schemaPath:"#/definitions/positive_integer/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
if(data.result_hash !== undefined && func0.call(data, "result_hash")){
let data3 = data.result_hash;
if(typeof data3 === "string"){
if(!pattern31.test(data3)){
const err14 = {instancePath:instancePath+"/result_hash",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/result_hash",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.result !== undefined && func0.call(data, "result")){
if(!(validate74(data.result, {instancePath:instancePath+"/result",parentData:data,parentDataProperty:"result",rootData}))){
vErrors = vErrors === null ? validate74.errors : vErrors.concat(validate74.errors);
errors = vErrors.length;
}
}
if(data.parents !== undefined && func0.call(data, "parents")){
if(!(validate77(data.parents, {instancePath:instancePath+"/parents",parentData:data,parentDataProperty:"parents",rootData}))){
vErrors = vErrors === null ? validate77.errors : vErrors.concat(validate77.errors);
errors = vErrors.length;
}
}
}
else {
const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
validate73.errors = vErrors;
return errors === 0;
}

const schema210 = {"type":"object","additionalProperties":false,"required":["id","calendar","timezone","ranking_key","ranking_direction","ranking_tie_break","daily_pace_divisor","daily_pace_rounding","daily_pace_start","daily_pace_end","daily_pace_as_of"],"properties":{"id":{"$ref":"#/definitions/id"},"calendar":{"enum":["proleptic_gregorian"]},"timezone":{"enum":["America/Sao_Paulo"]},"ranking_key":{"enum":["validated_consumption_minor"]},"ranking_direction":{"enum":["asc","desc"]},"ranking_tie_break":{"enum":["lexical_internal_id"]},"daily_pace_divisor":{"$ref":"#/definitions/positive_integer"},"daily_pace_rounding":{"enum":["floor","ceil","round"]},"daily_pace_start":{"$ref":"#/definitions/date"},"daily_pace_end":{"$ref":"#/definitions/date"},"daily_pace_as_of":{"$ref":"#/definitions/date"}}};

function validate80(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.calendar === undefined) || (!(func0.call(data, "calendar")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "calendar"},message:"must have required property '"+"calendar"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.timezone === undefined) || (!(func0.call(data, "timezone")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "timezone"},message:"must have required property '"+"timezone"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if((data.ranking_key === undefined) || (!(func0.call(data, "ranking_key")))){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "ranking_key"},message:"must have required property '"+"ranking_key"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if((data.ranking_direction === undefined) || (!(func0.call(data, "ranking_direction")))){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "ranking_direction"},message:"must have required property '"+"ranking_direction"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if((data.ranking_tie_break === undefined) || (!(func0.call(data, "ranking_tie_break")))){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "ranking_tie_break"},message:"must have required property '"+"ranking_tie_break"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if((data.daily_pace_divisor === undefined) || (!(func0.call(data, "daily_pace_divisor")))){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "daily_pace_divisor"},message:"must have required property '"+"daily_pace_divisor"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if((data.daily_pace_rounding === undefined) || (!(func0.call(data, "daily_pace_rounding")))){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "daily_pace_rounding"},message:"must have required property '"+"daily_pace_rounding"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if((data.daily_pace_start === undefined) || (!(func0.call(data, "daily_pace_start")))){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "daily_pace_start"},message:"must have required property '"+"daily_pace_start"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if((data.daily_pace_end === undefined) || (!(func0.call(data, "daily_pace_end")))){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "daily_pace_end"},message:"must have required property '"+"daily_pace_end"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if((data.daily_pace_as_of === undefined) || (!(func0.call(data, "daily_pace_as_of")))){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "daily_pace_as_of"},message:"must have required property '"+"daily_pace_as_of"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(func0.call(schema210.properties, key0))){
const err11 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err12 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.calendar !== undefined && func0.call(data, "calendar")){
if(!(data.calendar === "proleptic_gregorian")){
const err14 = {instancePath:instancePath+"/calendar",schemaPath:"#/properties/calendar/enum",keyword:"enum",params:{allowedValues: schema210.properties.calendar.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.timezone !== undefined && func0.call(data, "timezone")){
if(!(data.timezone === "America/Sao_Paulo")){
const err15 = {instancePath:instancePath+"/timezone",schemaPath:"#/properties/timezone/enum",keyword:"enum",params:{allowedValues: schema210.properties.timezone.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.ranking_key !== undefined && func0.call(data, "ranking_key")){
if(!(data.ranking_key === "validated_consumption_minor")){
const err16 = {instancePath:instancePath+"/ranking_key",schemaPath:"#/properties/ranking_key/enum",keyword:"enum",params:{allowedValues: schema210.properties.ranking_key.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.ranking_direction !== undefined && func0.call(data, "ranking_direction")){
let data4 = data.ranking_direction;
if(!((data4 === "asc") || (data4 === "desc"))){
const err17 = {instancePath:instancePath+"/ranking_direction",schemaPath:"#/properties/ranking_direction/enum",keyword:"enum",params:{allowedValues: schema210.properties.ranking_direction.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.ranking_tie_break !== undefined && func0.call(data, "ranking_tie_break")){
if(!(data.ranking_tie_break === "lexical_internal_id")){
const err18 = {instancePath:instancePath+"/ranking_tie_break",schemaPath:"#/properties/ranking_tie_break/enum",keyword:"enum",params:{allowedValues: schema210.properties.ranking_tie_break.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.daily_pace_divisor !== undefined && func0.call(data, "daily_pace_divisor")){
let data6 = data.daily_pace_divisor;
if(!(((typeof data6 == "number") && (!(data6 % 1) && !isNaN(data6))) && (isFinite(data6)))){
const err19 = {instancePath:instancePath+"/daily_pace_divisor",schemaPath:"#/definitions/positive_integer/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if((typeof data6 == "number") && (isFinite(data6))){
if(data6 > 9007199254740991 || isNaN(data6)){
const err20 = {instancePath:instancePath+"/daily_pace_divisor",schemaPath:"#/definitions/positive_integer/maximum",keyword:"maximum",params:{comparison: "<=", limit: 9007199254740991},message:"must be <= 9007199254740991"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(data6 < 1 || isNaN(data6)){
const err21 = {instancePath:instancePath+"/daily_pace_divisor",schemaPath:"#/definitions/positive_integer/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
}
if(data.daily_pace_rounding !== undefined && func0.call(data, "daily_pace_rounding")){
let data7 = data.daily_pace_rounding;
if(!(((data7 === "floor") || (data7 === "ceil")) || (data7 === "round"))){
const err22 = {instancePath:instancePath+"/daily_pace_rounding",schemaPath:"#/properties/daily_pace_rounding/enum",keyword:"enum",params:{allowedValues: schema210.properties.daily_pace_rounding.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.daily_pace_start !== undefined && func0.call(data, "daily_pace_start")){
let data8 = data.daily_pace_start;
if(typeof data8 === "string"){
if(!pattern12.test(data8)){
const err23 = {instancePath:instancePath+"/daily_pace_start",schemaPath:"#/definitions/date/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"},message:"must match pattern \""+"^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"+"\""};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(!(formats0.validate(data8))){
const err24 = {instancePath:instancePath+"/daily_pace_start",schemaPath:"#/definitions/date/format",keyword:"format",params:{format: "date"},message:"must match format \""+"date"+"\""};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
else {
const err25 = {instancePath:instancePath+"/daily_pace_start",schemaPath:"#/definitions/date/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.daily_pace_end !== undefined && func0.call(data, "daily_pace_end")){
let data9 = data.daily_pace_end;
if(typeof data9 === "string"){
if(!pattern12.test(data9)){
const err26 = {instancePath:instancePath+"/daily_pace_end",schemaPath:"#/definitions/date/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"},message:"must match pattern \""+"^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"+"\""};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(!(formats0.validate(data9))){
const err27 = {instancePath:instancePath+"/daily_pace_end",schemaPath:"#/definitions/date/format",keyword:"format",params:{format: "date"},message:"must match format \""+"date"+"\""};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
else {
const err28 = {instancePath:instancePath+"/daily_pace_end",schemaPath:"#/definitions/date/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data.daily_pace_as_of !== undefined && func0.call(data, "daily_pace_as_of")){
let data10 = data.daily_pace_as_of;
if(typeof data10 === "string"){
if(!pattern12.test(data10)){
const err29 = {instancePath:instancePath+"/daily_pace_as_of",schemaPath:"#/definitions/date/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"},message:"must match pattern \""+"^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"+"\""};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if(!(formats0.validate(data10))){
const err30 = {instancePath:instancePath+"/daily_pace_as_of",schemaPath:"#/definitions/date/format",keyword:"format",params:{format: "date"},message:"must match format \""+"date"+"\""};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
else {
const err31 = {instancePath:instancePath+"/daily_pace_as_of",schemaPath:"#/definitions/date/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
}
else {
const err32 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
validate80.errors = vErrors;
return errors === 0;
}


function validate25(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
/*# sourceURL="urn:financasbot:next:evidence-snapshot:2" */;
let vErrors = null;
let errors = 0;
const _errs1 = errors;
let valid0 = false;
let passing0 = null;
const _errs2 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.ref_id === undefined) || (!(func0.call(data, "ref_id")))){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "ref_id"},message:"must have required property '"+"ref_id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.version === undefined) || (!(func0.call(data, "version")))){
const err2 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if((data.payload === undefined) || (!(func0.call(data, "payload")))){
const err3 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "payload"},message:"must have required property '"+"payload"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!((((key0 === "ref_id") || (key0 === "kind")) || (key0 === "version")) || (key0 === "payload"))){
const err4 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.ref_id !== undefined && func0.call(data, "ref_id")){
let data0 = data.ref_id;
if(typeof data0 === "string"){
if(!pattern0.test(data0)){
const err5 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("family" !== data.kind){
const err7 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "family"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.version !== undefined && func0.call(data, "version")){
let data2 = data.version;
if(typeof data2 === "string"){
if(!pattern31.test(data2)){
const err8 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.payload !== undefined && func0.call(data, "payload")){
if(!(validate26(data.payload, {instancePath:instancePath+"/payload",parentData:data,parentDataProperty:"payload",rootData}))){
vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
errors = vErrors.length;
}
}
}
else {
const err10 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
var _valid0 = _errs2 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs13 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.ref_id === undefined) || (!(func0.call(data, "ref_id")))){
const err11 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "ref_id"},message:"must have required property '"+"ref_id"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err12 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if((data.version === undefined) || (!(func0.call(data, "version")))){
const err13 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if((data.payload === undefined) || (!(func0.call(data, "payload")))){
const err14 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "payload"},message:"must have required property '"+"payload"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
for(const key1 of Object.keys(data)){
if(!((((key1 === "ref_id") || (key1 === "kind")) || (key1 === "version")) || (key1 === "payload"))){
const err15 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.ref_id !== undefined && func0.call(data, "ref_id")){
let data4 = data.ref_id;
if(typeof data4 === "string"){
if(!pattern0.test(data4)){
const err16 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
else {
const err17 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("person" !== data.kind){
const err18 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "person"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.version !== undefined && func0.call(data, "version")){
let data6 = data.version;
if(typeof data6 === "string"){
if(!pattern31.test(data6)){
const err19 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.payload !== undefined && func0.call(data, "payload")){
if(!(validate30(data.payload, {instancePath:instancePath+"/payload",parentData:data,parentDataProperty:"payload",rootData}))){
vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
errors = vErrors.length;
}
}
}
else {
const err21 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
var _valid0 = _errs13 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
}
const _errs24 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.ref_id === undefined) || (!(func0.call(data, "ref_id")))){
const err22 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "ref_id"},message:"must have required property '"+"ref_id"+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err23 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if((data.version === undefined) || (!(func0.call(data, "version")))){
const err24 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if((data.payload === undefined) || (!(func0.call(data, "payload")))){
const err25 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "payload"},message:"must have required property '"+"payload"+"'"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
for(const key2 of Object.keys(data)){
if(!((((key2 === "ref_id") || (key2 === "kind")) || (key2 === "version")) || (key2 === "payload"))){
const err26 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data.ref_id !== undefined && func0.call(data, "ref_id")){
let data8 = data.ref_id;
if(typeof data8 === "string"){
if(!pattern0.test(data8)){
const err27 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
else {
const err28 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("account" !== data.kind){
const err29 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "account"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.version !== undefined && func0.call(data, "version")){
let data10 = data.version;
if(typeof data10 === "string"){
if(!pattern31.test(data10)){
const err30 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
else {
const err31 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data.payload !== undefined && func0.call(data, "payload")){
if(!(validate32(data.payload, {instancePath:instancePath+"/payload",parentData:data,parentDataProperty:"payload",rootData}))){
vErrors = vErrors === null ? validate32.errors : vErrors.concat(validate32.errors);
errors = vErrors.length;
}
}
}
else {
const err32 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
var _valid0 = _errs24 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
}
const _errs35 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.ref_id === undefined) || (!(func0.call(data, "ref_id")))){
const err33 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "ref_id"},message:"must have required property '"+"ref_id"+"'"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err34 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
if((data.version === undefined) || (!(func0.call(data, "version")))){
const err35 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
if((data.payload === undefined) || (!(func0.call(data, "payload")))){
const err36 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "payload"},message:"must have required property '"+"payload"+"'"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
for(const key3 of Object.keys(data)){
if(!((((key3 === "ref_id") || (key3 === "kind")) || (key3 === "version")) || (key3 === "payload"))){
const err37 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
if(data.ref_id !== undefined && func0.call(data, "ref_id")){
let data12 = data.ref_id;
if(typeof data12 === "string"){
if(!pattern0.test(data12)){
const err38 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
else {
const err39 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("card" !== data.kind){
const err40 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "card"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
if(data.version !== undefined && func0.call(data, "version")){
let data14 = data.version;
if(typeof data14 === "string"){
if(!pattern31.test(data14)){
const err41 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
else {
const err42 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
if(data.payload !== undefined && func0.call(data, "payload")){
if(!(validate34(data.payload, {instancePath:instancePath+"/payload",parentData:data,parentDataProperty:"payload",rootData}))){
vErrors = vErrors === null ? validate34.errors : vErrors.concat(validate34.errors);
errors = vErrors.length;
}
}
}
else {
const err43 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
var _valid0 = _errs35 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
}
const _errs46 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.ref_id === undefined) || (!(func0.call(data, "ref_id")))){
const err44 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "ref_id"},message:"must have required property '"+"ref_id"+"'"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err45 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
if((data.version === undefined) || (!(func0.call(data, "version")))){
const err46 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
if((data.payload === undefined) || (!(func0.call(data, "payload")))){
const err47 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "payload"},message:"must have required property '"+"payload"+"'"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
for(const key4 of Object.keys(data)){
if(!((((key4 === "ref_id") || (key4 === "kind")) || (key4 === "version")) || (key4 === "payload"))){
const err48 = {instancePath,schemaPath:"#/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
if(data.ref_id !== undefined && func0.call(data, "ref_id")){
let data16 = data.ref_id;
if(typeof data16 === "string"){
if(!pattern0.test(data16)){
const err49 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
else {
const err50 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("category" !== data.kind){
const err51 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/4/properties/kind/const",keyword:"const",params:{allowedValue: "category"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
if(data.version !== undefined && func0.call(data, "version")){
let data18 = data.version;
if(typeof data18 === "string"){
if(!pattern31.test(data18)){
const err52 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
else {
const err53 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
}
if(data.payload !== undefined && func0.call(data, "payload")){
if(!(validate36(data.payload, {instancePath:instancePath+"/payload",parentData:data,parentDataProperty:"payload",rootData}))){
vErrors = vErrors === null ? validate36.errors : vErrors.concat(validate36.errors);
errors = vErrors.length;
}
}
}
else {
const err54 = {instancePath,schemaPath:"#/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
var _valid0 = _errs46 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid0 = true;
passing0 = 4;
}
const _errs57 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.ref_id === undefined) || (!(func0.call(data, "ref_id")))){
const err55 = {instancePath,schemaPath:"#/oneOf/5/required",keyword:"required",params:{missingProperty: "ref_id"},message:"must have required property '"+"ref_id"+"'"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err56 = {instancePath,schemaPath:"#/oneOf/5/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
if((data.version === undefined) || (!(func0.call(data, "version")))){
const err57 = {instancePath,schemaPath:"#/oneOf/5/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
if((data.payload === undefined) || (!(func0.call(data, "payload")))){
const err58 = {instancePath,schemaPath:"#/oneOf/5/required",keyword:"required",params:{missingProperty: "payload"},message:"must have required property '"+"payload"+"'"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
for(const key5 of Object.keys(data)){
if(!((((key5 === "ref_id") || (key5 === "kind")) || (key5 === "version")) || (key5 === "payload"))){
const err59 = {instancePath,schemaPath:"#/oneOf/5/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
if(data.ref_id !== undefined && func0.call(data, "ref_id")){
let data20 = data.ref_id;
if(typeof data20 === "string"){
if(!pattern0.test(data20)){
const err60 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
else {
const err61 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("event" !== data.kind){
const err62 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/5/properties/kind/const",keyword:"const",params:{allowedValue: "event"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
if(data.version !== undefined && func0.call(data, "version")){
let data22 = data.version;
if(typeof data22 === "string"){
if(!pattern31.test(data22)){
const err63 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
}
else {
const err64 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
if(data.payload !== undefined && func0.call(data, "payload")){
if(!(validate38(data.payload, {instancePath:instancePath+"/payload",parentData:data,parentDataProperty:"payload",rootData}))){
vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
errors = vErrors.length;
}
}
}
else {
const err65 = {instancePath,schemaPath:"#/oneOf/5/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
var _valid0 = _errs57 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 5];
}
else {
if(_valid0){
valid0 = true;
passing0 = 5;
}
const _errs68 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.ref_id === undefined) || (!(func0.call(data, "ref_id")))){
const err66 = {instancePath,schemaPath:"#/oneOf/6/required",keyword:"required",params:{missingProperty: "ref_id"},message:"must have required property '"+"ref_id"+"'"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err67 = {instancePath,schemaPath:"#/oneOf/6/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
if((data.version === undefined) || (!(func0.call(data, "version")))){
const err68 = {instancePath,schemaPath:"#/oneOf/6/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
if((data.payload === undefined) || (!(func0.call(data, "payload")))){
const err69 = {instancePath,schemaPath:"#/oneOf/6/required",keyword:"required",params:{missingProperty: "payload"},message:"must have required property '"+"payload"+"'"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
for(const key6 of Object.keys(data)){
if(!((((key6 === "ref_id") || (key6 === "kind")) || (key6 === "version")) || (key6 === "payload"))){
const err70 = {instancePath,schemaPath:"#/oneOf/6/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
}
if(data.ref_id !== undefined && func0.call(data, "ref_id")){
let data24 = data.ref_id;
if(typeof data24 === "string"){
if(!pattern0.test(data24)){
const err71 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
}
else {
const err72 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("budget" !== data.kind){
const err73 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/6/properties/kind/const",keyword:"const",params:{allowedValue: "budget"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
}
if(data.version !== undefined && func0.call(data, "version")){
let data26 = data.version;
if(typeof data26 === "string"){
if(!pattern31.test(data26)){
const err74 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
}
else {
const err75 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
}
if(data.payload !== undefined && func0.call(data, "payload")){
if(!(validate40(data.payload, {instancePath:instancePath+"/payload",parentData:data,parentDataProperty:"payload",rootData}))){
vErrors = vErrors === null ? validate40.errors : vErrors.concat(validate40.errors);
errors = vErrors.length;
}
}
}
else {
const err76 = {instancePath,schemaPath:"#/oneOf/6/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
var _valid0 = _errs68 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 6];
}
else {
if(_valid0){
valid0 = true;
passing0 = 6;
}
const _errs79 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.ref_id === undefined) || (!(func0.call(data, "ref_id")))){
const err77 = {instancePath,schemaPath:"#/oneOf/7/required",keyword:"required",params:{missingProperty: "ref_id"},message:"must have required property '"+"ref_id"+"'"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err78 = {instancePath,schemaPath:"#/oneOf/7/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
if((data.version === undefined) || (!(func0.call(data, "version")))){
const err79 = {instancePath,schemaPath:"#/oneOf/7/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
if((data.payload === undefined) || (!(func0.call(data, "payload")))){
const err80 = {instancePath,schemaPath:"#/oneOf/7/required",keyword:"required",params:{missingProperty: "payload"},message:"must have required property '"+"payload"+"'"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
for(const key7 of Object.keys(data)){
if(!((((key7 === "ref_id") || (key7 === "kind")) || (key7 === "version")) || (key7 === "payload"))){
const err81 = {instancePath,schemaPath:"#/oneOf/7/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
}
if(data.ref_id !== undefined && func0.call(data, "ref_id")){
let data28 = data.ref_id;
if(typeof data28 === "string"){
if(!pattern0.test(data28)){
const err82 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
}
else {
const err83 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("bill" !== data.kind){
const err84 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/7/properties/kind/const",keyword:"const",params:{allowedValue: "bill"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
}
if(data.version !== undefined && func0.call(data, "version")){
let data30 = data.version;
if(typeof data30 === "string"){
if(!pattern31.test(data30)){
const err85 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
}
else {
const err86 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
}
if(data.payload !== undefined && func0.call(data, "payload")){
if(!(validate42(data.payload, {instancePath:instancePath+"/payload",parentData:data,parentDataProperty:"payload",rootData}))){
vErrors = vErrors === null ? validate42.errors : vErrors.concat(validate42.errors);
errors = vErrors.length;
}
}
}
else {
const err87 = {instancePath,schemaPath:"#/oneOf/7/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
var _valid0 = _errs79 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 7];
}
else {
if(_valid0){
valid0 = true;
passing0 = 7;
}
const _errs90 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.ref_id === undefined) || (!(func0.call(data, "ref_id")))){
const err88 = {instancePath,schemaPath:"#/oneOf/8/required",keyword:"required",params:{missingProperty: "ref_id"},message:"must have required property '"+"ref_id"+"'"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err89 = {instancePath,schemaPath:"#/oneOf/8/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
if((data.version === undefined) || (!(func0.call(data, "version")))){
const err90 = {instancePath,schemaPath:"#/oneOf/8/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
if((data.payload === undefined) || (!(func0.call(data, "payload")))){
const err91 = {instancePath,schemaPath:"#/oneOf/8/required",keyword:"required",params:{missingProperty: "payload"},message:"must have required property '"+"payload"+"'"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
for(const key8 of Object.keys(data)){
if(!((((key8 === "ref_id") || (key8 === "kind")) || (key8 === "version")) || (key8 === "payload"))){
const err92 = {instancePath,schemaPath:"#/oneOf/8/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
}
if(data.ref_id !== undefined && func0.call(data, "ref_id")){
let data32 = data.ref_id;
if(typeof data32 === "string"){
if(!pattern0.test(data32)){
const err93 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
}
else {
const err94 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("source_state" !== data.kind){
const err95 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/8/properties/kind/const",keyword:"const",params:{allowedValue: "source_state"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
}
if(data.version !== undefined && func0.call(data, "version")){
let data34 = data.version;
if(typeof data34 === "string"){
if(!pattern31.test(data34)){
const err96 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
}
else {
const err97 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
}
if(data.payload !== undefined && func0.call(data, "payload")){
if(!(validate44(data.payload, {instancePath:instancePath+"/payload",parentData:data,parentDataProperty:"payload",rootData}))){
vErrors = vErrors === null ? validate44.errors : vErrors.concat(validate44.errors);
errors = vErrors.length;
}
}
}
else {
const err98 = {instancePath,schemaPath:"#/oneOf/8/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
var _valid0 = _errs90 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 8];
}
else {
if(_valid0){
valid0 = true;
passing0 = 8;
}
const _errs101 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.ref_id === undefined) || (!(func0.call(data, "ref_id")))){
const err99 = {instancePath,schemaPath:"#/oneOf/9/required",keyword:"required",params:{missingProperty: "ref_id"},message:"must have required property '"+"ref_id"+"'"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err100 = {instancePath,schemaPath:"#/oneOf/9/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
if((data.version === undefined) || (!(func0.call(data, "version")))){
const err101 = {instancePath,schemaPath:"#/oneOf/9/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
if((data.payload === undefined) || (!(func0.call(data, "payload")))){
const err102 = {instancePath,schemaPath:"#/oneOf/9/required",keyword:"required",params:{missingProperty: "payload"},message:"must have required property '"+"payload"+"'"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
for(const key9 of Object.keys(data)){
if(!((((key9 === "ref_id") || (key9 === "kind")) || (key9 === "version")) || (key9 === "payload"))){
const err103 = {instancePath,schemaPath:"#/oneOf/9/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key9},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
}
if(data.ref_id !== undefined && func0.call(data, "ref_id")){
let data36 = data.ref_id;
if(typeof data36 === "string"){
if(!pattern0.test(data36)){
const err104 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
}
}
else {
const err105 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err105];
}
else {
vErrors.push(err105);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("proposal" !== data.kind){
const err106 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/9/properties/kind/const",keyword:"const",params:{allowedValue: "proposal"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
}
if(data.version !== undefined && func0.call(data, "version")){
let data38 = data.version;
if(typeof data38 === "string"){
if(!pattern31.test(data38)){
const err107 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err107];
}
else {
vErrors.push(err107);
}
errors++;
}
}
else {
const err108 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err108];
}
else {
vErrors.push(err108);
}
errors++;
}
}
if(data.payload !== undefined && func0.call(data, "payload")){
if(!(validate46(data.payload, {instancePath:instancePath+"/payload",parentData:data,parentDataProperty:"payload",rootData}))){
vErrors = vErrors === null ? validate46.errors : vErrors.concat(validate46.errors);
errors = vErrors.length;
}
}
}
else {
const err109 = {instancePath,schemaPath:"#/oneOf/9/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err109];
}
else {
vErrors.push(err109);
}
errors++;
}
var _valid0 = _errs101 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 9];
}
else {
if(_valid0){
valid0 = true;
passing0 = 9;
}
const _errs112 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.ref_id === undefined) || (!(func0.call(data, "ref_id")))){
const err110 = {instancePath,schemaPath:"#/oneOf/10/required",keyword:"required",params:{missingProperty: "ref_id"},message:"must have required property '"+"ref_id"+"'"};
if(vErrors === null){
vErrors = [err110];
}
else {
vErrors.push(err110);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err111 = {instancePath,schemaPath:"#/oneOf/10/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err111];
}
else {
vErrors.push(err111);
}
errors++;
}
if((data.version === undefined) || (!(func0.call(data, "version")))){
const err112 = {instancePath,schemaPath:"#/oneOf/10/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err112];
}
else {
vErrors.push(err112);
}
errors++;
}
if((data.payload === undefined) || (!(func0.call(data, "payload")))){
const err113 = {instancePath,schemaPath:"#/oneOf/10/required",keyword:"required",params:{missingProperty: "payload"},message:"must have required property '"+"payload"+"'"};
if(vErrors === null){
vErrors = [err113];
}
else {
vErrors.push(err113);
}
errors++;
}
for(const key10 of Object.keys(data)){
if(!((((key10 === "ref_id") || (key10 === "kind")) || (key10 === "version")) || (key10 === "payload"))){
const err114 = {instancePath,schemaPath:"#/oneOf/10/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key10},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err114];
}
else {
vErrors.push(err114);
}
errors++;
}
}
if(data.ref_id !== undefined && func0.call(data, "ref_id")){
let data40 = data.ref_id;
if(typeof data40 === "string"){
if(!pattern0.test(data40)){
const err115 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err115];
}
else {
vErrors.push(err115);
}
errors++;
}
}
else {
const err116 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err116];
}
else {
vErrors.push(err116);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("reminder" !== data.kind){
const err117 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/10/properties/kind/const",keyword:"const",params:{allowedValue: "reminder"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err117];
}
else {
vErrors.push(err117);
}
errors++;
}
}
if(data.version !== undefined && func0.call(data, "version")){
let data42 = data.version;
if(typeof data42 === "string"){
if(!pattern31.test(data42)){
const err118 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err118];
}
else {
vErrors.push(err118);
}
errors++;
}
}
else {
const err119 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err119];
}
else {
vErrors.push(err119);
}
errors++;
}
}
if(data.payload !== undefined && func0.call(data, "payload")){
if(!(validate48(data.payload, {instancePath:instancePath+"/payload",parentData:data,parentDataProperty:"payload",rootData}))){
vErrors = vErrors === null ? validate48.errors : vErrors.concat(validate48.errors);
errors = vErrors.length;
}
}
}
else {
const err120 = {instancePath,schemaPath:"#/oneOf/10/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err120];
}
else {
vErrors.push(err120);
}
errors++;
}
var _valid0 = _errs112 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 10];
}
else {
if(_valid0){
valid0 = true;
passing0 = 10;
}
const _errs123 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.ref_id === undefined) || (!(func0.call(data, "ref_id")))){
const err121 = {instancePath,schemaPath:"#/oneOf/11/required",keyword:"required",params:{missingProperty: "ref_id"},message:"must have required property '"+"ref_id"+"'"};
if(vErrors === null){
vErrors = [err121];
}
else {
vErrors.push(err121);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err122 = {instancePath,schemaPath:"#/oneOf/11/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err122];
}
else {
vErrors.push(err122);
}
errors++;
}
if((data.version === undefined) || (!(func0.call(data, "version")))){
const err123 = {instancePath,schemaPath:"#/oneOf/11/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err123];
}
else {
vErrors.push(err123);
}
errors++;
}
if((data.payload === undefined) || (!(func0.call(data, "payload")))){
const err124 = {instancePath,schemaPath:"#/oneOf/11/required",keyword:"required",params:{missingProperty: "payload"},message:"must have required property '"+"payload"+"'"};
if(vErrors === null){
vErrors = [err124];
}
else {
vErrors.push(err124);
}
errors++;
}
for(const key11 of Object.keys(data)){
if(!((((key11 === "ref_id") || (key11 === "kind")) || (key11 === "version")) || (key11 === "payload"))){
const err125 = {instancePath,schemaPath:"#/oneOf/11/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key11},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err125];
}
else {
vErrors.push(err125);
}
errors++;
}
}
if(data.ref_id !== undefined && func0.call(data, "ref_id")){
let data44 = data.ref_id;
if(typeof data44 === "string"){
if(!pattern0.test(data44)){
const err126 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err126];
}
else {
vErrors.push(err126);
}
errors++;
}
}
else {
const err127 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err127];
}
else {
vErrors.push(err127);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("calendar_event" !== data.kind){
const err128 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/11/properties/kind/const",keyword:"const",params:{allowedValue: "calendar_event"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err128];
}
else {
vErrors.push(err128);
}
errors++;
}
}
if(data.version !== undefined && func0.call(data, "version")){
let data46 = data.version;
if(typeof data46 === "string"){
if(!pattern31.test(data46)){
const err129 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err129];
}
else {
vErrors.push(err129);
}
errors++;
}
}
else {
const err130 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err130];
}
else {
vErrors.push(err130);
}
errors++;
}
}
if(data.payload !== undefined && func0.call(data, "payload")){
if(!(validate50(data.payload, {instancePath:instancePath+"/payload",parentData:data,parentDataProperty:"payload",rootData}))){
vErrors = vErrors === null ? validate50.errors : vErrors.concat(validate50.errors);
errors = vErrors.length;
}
}
}
else {
const err131 = {instancePath,schemaPath:"#/oneOf/11/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err131];
}
else {
vErrors.push(err131);
}
errors++;
}
var _valid0 = _errs123 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 11];
}
else {
if(_valid0){
valid0 = true;
passing0 = 11;
}
const _errs134 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.ref_id === undefined) || (!(func0.call(data, "ref_id")))){
const err132 = {instancePath,schemaPath:"#/oneOf/12/required",keyword:"required",params:{missingProperty: "ref_id"},message:"must have required property '"+"ref_id"+"'"};
if(vErrors === null){
vErrors = [err132];
}
else {
vErrors.push(err132);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err133 = {instancePath,schemaPath:"#/oneOf/12/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err133];
}
else {
vErrors.push(err133);
}
errors++;
}
if((data.version === undefined) || (!(func0.call(data, "version")))){
const err134 = {instancePath,schemaPath:"#/oneOf/12/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err134];
}
else {
vErrors.push(err134);
}
errors++;
}
if((data.payload === undefined) || (!(func0.call(data, "payload")))){
const err135 = {instancePath,schemaPath:"#/oneOf/12/required",keyword:"required",params:{missingProperty: "payload"},message:"must have required property '"+"payload"+"'"};
if(vErrors === null){
vErrors = [err135];
}
else {
vErrors.push(err135);
}
errors++;
}
for(const key12 of Object.keys(data)){
if(!((((key12 === "ref_id") || (key12 === "kind")) || (key12 === "version")) || (key12 === "payload"))){
const err136 = {instancePath,schemaPath:"#/oneOf/12/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key12},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err136];
}
else {
vErrors.push(err136);
}
errors++;
}
}
if(data.ref_id !== undefined && func0.call(data, "ref_id")){
let data48 = data.ref_id;
if(typeof data48 === "string"){
if(!pattern0.test(data48)){
const err137 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err137];
}
else {
vErrors.push(err137);
}
errors++;
}
}
else {
const err138 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err138];
}
else {
vErrors.push(err138);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("side_effect" !== data.kind){
const err139 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/12/properties/kind/const",keyword:"const",params:{allowedValue: "side_effect"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err139];
}
else {
vErrors.push(err139);
}
errors++;
}
}
if(data.version !== undefined && func0.call(data, "version")){
let data50 = data.version;
if(typeof data50 === "string"){
if(!pattern31.test(data50)){
const err140 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err140];
}
else {
vErrors.push(err140);
}
errors++;
}
}
else {
const err141 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err141];
}
else {
vErrors.push(err141);
}
errors++;
}
}
if(data.payload !== undefined && func0.call(data, "payload")){
if(!(validate52(data.payload, {instancePath:instancePath+"/payload",parentData:data,parentDataProperty:"payload",rootData}))){
vErrors = vErrors === null ? validate52.errors : vErrors.concat(validate52.errors);
errors = vErrors.length;
}
}
}
else {
const err142 = {instancePath,schemaPath:"#/oneOf/12/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err142];
}
else {
vErrors.push(err142);
}
errors++;
}
var _valid0 = _errs134 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 12];
}
else {
if(_valid0){
valid0 = true;
passing0 = 12;
}
const _errs145 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.ref_id === undefined) || (!(func0.call(data, "ref_id")))){
const err143 = {instancePath,schemaPath:"#/oneOf/13/required",keyword:"required",params:{missingProperty: "ref_id"},message:"must have required property '"+"ref_id"+"'"};
if(vErrors === null){
vErrors = [err143];
}
else {
vErrors.push(err143);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err144 = {instancePath,schemaPath:"#/oneOf/13/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err144];
}
else {
vErrors.push(err144);
}
errors++;
}
if((data.version === undefined) || (!(func0.call(data, "version")))){
const err145 = {instancePath,schemaPath:"#/oneOf/13/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err145];
}
else {
vErrors.push(err145);
}
errors++;
}
if((data.payload === undefined) || (!(func0.call(data, "payload")))){
const err146 = {instancePath,schemaPath:"#/oneOf/13/required",keyword:"required",params:{missingProperty: "payload"},message:"must have required property '"+"payload"+"'"};
if(vErrors === null){
vErrors = [err146];
}
else {
vErrors.push(err146);
}
errors++;
}
for(const key13 of Object.keys(data)){
if(!((((key13 === "ref_id") || (key13 === "kind")) || (key13 === "version")) || (key13 === "payload"))){
const err147 = {instancePath,schemaPath:"#/oneOf/13/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key13},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err147];
}
else {
vErrors.push(err147);
}
errors++;
}
}
if(data.ref_id !== undefined && func0.call(data, "ref_id")){
let data52 = data.ref_id;
if(typeof data52 === "string"){
if(!pattern0.test(data52)){
const err148 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err148];
}
else {
vErrors.push(err148);
}
errors++;
}
}
else {
const err149 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err149];
}
else {
vErrors.push(err149);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("merchant_rule" !== data.kind){
const err150 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/13/properties/kind/const",keyword:"const",params:{allowedValue: "merchant_rule"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err150];
}
else {
vErrors.push(err150);
}
errors++;
}
}
if(data.version !== undefined && func0.call(data, "version")){
let data54 = data.version;
if(typeof data54 === "string"){
if(!pattern31.test(data54)){
const err151 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err151];
}
else {
vErrors.push(err151);
}
errors++;
}
}
else {
const err152 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err152];
}
else {
vErrors.push(err152);
}
errors++;
}
}
if(data.payload !== undefined && func0.call(data, "payload")){
if(!(validate54(data.payload, {instancePath:instancePath+"/payload",parentData:data,parentDataProperty:"payload",rootData}))){
vErrors = vErrors === null ? validate54.errors : vErrors.concat(validate54.errors);
errors = vErrors.length;
}
}
}
else {
const err153 = {instancePath,schemaPath:"#/oneOf/13/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err153];
}
else {
vErrors.push(err153);
}
errors++;
}
var _valid0 = _errs145 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 13];
}
else {
if(_valid0){
valid0 = true;
passing0 = 13;
}
const _errs156 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.ref_id === undefined) || (!(func0.call(data, "ref_id")))){
const err154 = {instancePath,schemaPath:"#/oneOf/14/required",keyword:"required",params:{missingProperty: "ref_id"},message:"must have required property '"+"ref_id"+"'"};
if(vErrors === null){
vErrors = [err154];
}
else {
vErrors.push(err154);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err155 = {instancePath,schemaPath:"#/oneOf/14/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err155];
}
else {
vErrors.push(err155);
}
errors++;
}
if((data.version === undefined) || (!(func0.call(data, "version")))){
const err156 = {instancePath,schemaPath:"#/oneOf/14/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err156];
}
else {
vErrors.push(err156);
}
errors++;
}
if((data.payload === undefined) || (!(func0.call(data, "payload")))){
const err157 = {instancePath,schemaPath:"#/oneOf/14/required",keyword:"required",params:{missingProperty: "payload"},message:"must have required property '"+"payload"+"'"};
if(vErrors === null){
vErrors = [err157];
}
else {
vErrors.push(err157);
}
errors++;
}
for(const key14 of Object.keys(data)){
if(!((((key14 === "ref_id") || (key14 === "kind")) || (key14 === "version")) || (key14 === "payload"))){
const err158 = {instancePath,schemaPath:"#/oneOf/14/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key14},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err158];
}
else {
vErrors.push(err158);
}
errors++;
}
}
if(data.ref_id !== undefined && func0.call(data, "ref_id")){
let data56 = data.ref_id;
if(typeof data56 === "string"){
if(!pattern0.test(data56)){
const err159 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err159];
}
else {
vErrors.push(err159);
}
errors++;
}
}
else {
const err160 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err160];
}
else {
vErrors.push(err160);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("fixture" !== data.kind){
const err161 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/14/properties/kind/const",keyword:"const",params:{allowedValue: "fixture"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err161];
}
else {
vErrors.push(err161);
}
errors++;
}
}
if(data.version !== undefined && func0.call(data, "version")){
let data58 = data.version;
if(typeof data58 === "string"){
if(!pattern31.test(data58)){
const err162 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err162];
}
else {
vErrors.push(err162);
}
errors++;
}
}
else {
const err163 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err163];
}
else {
vErrors.push(err163);
}
errors++;
}
}
if(data.payload !== undefined && func0.call(data, "payload")){
if(!(validate56(data.payload, {instancePath:instancePath+"/payload",parentData:data,parentDataProperty:"payload",rootData}))){
vErrors = vErrors === null ? validate56.errors : vErrors.concat(validate56.errors);
errors = vErrors.length;
}
}
}
else {
const err164 = {instancePath,schemaPath:"#/oneOf/14/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err164];
}
else {
vErrors.push(err164);
}
errors++;
}
var _valid0 = _errs156 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 14];
}
else {
if(_valid0){
valid0 = true;
passing0 = 14;
}
const _errs167 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.ref_id === undefined) || (!(func0.call(data, "ref_id")))){
const err165 = {instancePath,schemaPath:"#/oneOf/15/required",keyword:"required",params:{missingProperty: "ref_id"},message:"must have required property '"+"ref_id"+"'"};
if(vErrors === null){
vErrors = [err165];
}
else {
vErrors.push(err165);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err166 = {instancePath,schemaPath:"#/oneOf/15/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err166];
}
else {
vErrors.push(err166);
}
errors++;
}
if((data.version === undefined) || (!(func0.call(data, "version")))){
const err167 = {instancePath,schemaPath:"#/oneOf/15/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err167];
}
else {
vErrors.push(err167);
}
errors++;
}
if((data.payload === undefined) || (!(func0.call(data, "payload")))){
const err168 = {instancePath,schemaPath:"#/oneOf/15/required",keyword:"required",params:{missingProperty: "payload"},message:"must have required property '"+"payload"+"'"};
if(vErrors === null){
vErrors = [err168];
}
else {
vErrors.push(err168);
}
errors++;
}
for(const key15 of Object.keys(data)){
if(!((((key15 === "ref_id") || (key15 === "kind")) || (key15 === "version")) || (key15 === "payload"))){
const err169 = {instancePath,schemaPath:"#/oneOf/15/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key15},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err169];
}
else {
vErrors.push(err169);
}
errors++;
}
}
if(data.ref_id !== undefined && func0.call(data, "ref_id")){
let data60 = data.ref_id;
if(typeof data60 === "string"){
if(!pattern0.test(data60)){
const err170 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err170];
}
else {
vErrors.push(err170);
}
errors++;
}
}
else {
const err171 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err171];
}
else {
vErrors.push(err171);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("collection" !== data.kind){
const err172 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/15/properties/kind/const",keyword:"const",params:{allowedValue: "collection"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err172];
}
else {
vErrors.push(err172);
}
errors++;
}
}
if(data.version !== undefined && func0.call(data, "version")){
let data62 = data.version;
if(typeof data62 === "string"){
if(!pattern31.test(data62)){
const err173 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err173];
}
else {
vErrors.push(err173);
}
errors++;
}
}
else {
const err174 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err174];
}
else {
vErrors.push(err174);
}
errors++;
}
}
if(data.payload !== undefined && func0.call(data, "payload")){
if(!(validate58(data.payload, {instancePath:instancePath+"/payload",parentData:data,parentDataProperty:"payload",rootData}))){
vErrors = vErrors === null ? validate58.errors : vErrors.concat(validate58.errors);
errors = vErrors.length;
}
}
}
else {
const err175 = {instancePath,schemaPath:"#/oneOf/15/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err175];
}
else {
vErrors.push(err175);
}
errors++;
}
var _valid0 = _errs167 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 15];
}
else {
if(_valid0){
valid0 = true;
passing0 = 15;
}
const _errs178 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.ref_id === undefined) || (!(func0.call(data, "ref_id")))){
const err176 = {instancePath,schemaPath:"#/oneOf/16/required",keyword:"required",params:{missingProperty: "ref_id"},message:"must have required property '"+"ref_id"+"'"};
if(vErrors === null){
vErrors = [err176];
}
else {
vErrors.push(err176);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err177 = {instancePath,schemaPath:"#/oneOf/16/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err177];
}
else {
vErrors.push(err177);
}
errors++;
}
if((data.version === undefined) || (!(func0.call(data, "version")))){
const err178 = {instancePath,schemaPath:"#/oneOf/16/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err178];
}
else {
vErrors.push(err178);
}
errors++;
}
if((data.payload === undefined) || (!(func0.call(data, "payload")))){
const err179 = {instancePath,schemaPath:"#/oneOf/16/required",keyword:"required",params:{missingProperty: "payload"},message:"must have required property '"+"payload"+"'"};
if(vErrors === null){
vErrors = [err179];
}
else {
vErrors.push(err179);
}
errors++;
}
for(const key16 of Object.keys(data)){
if(!((((key16 === "ref_id") || (key16 === "kind")) || (key16 === "version")) || (key16 === "payload"))){
const err180 = {instancePath,schemaPath:"#/oneOf/16/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key16},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err180];
}
else {
vErrors.push(err180);
}
errors++;
}
}
if(data.ref_id !== undefined && func0.call(data, "ref_id")){
let data64 = data.ref_id;
if(typeof data64 === "string"){
if(!pattern0.test(data64)){
const err181 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err181];
}
else {
vErrors.push(err181);
}
errors++;
}
}
else {
const err182 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err182];
}
else {
vErrors.push(err182);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("source_origin" !== data.kind){
const err183 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/16/properties/kind/const",keyword:"const",params:{allowedValue: "source_origin"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err183];
}
else {
vErrors.push(err183);
}
errors++;
}
}
if(data.version !== undefined && func0.call(data, "version")){
let data66 = data.version;
if(typeof data66 === "string"){
if(!pattern31.test(data66)){
const err184 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err184];
}
else {
vErrors.push(err184);
}
errors++;
}
}
else {
const err185 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err185];
}
else {
vErrors.push(err185);
}
errors++;
}
}
if(data.payload !== undefined && func0.call(data, "payload")){
if(!(validate61(data.payload, {instancePath:instancePath+"/payload",parentData:data,parentDataProperty:"payload",rootData}))){
vErrors = vErrors === null ? validate61.errors : vErrors.concat(validate61.errors);
errors = vErrors.length;
}
}
}
else {
const err186 = {instancePath,schemaPath:"#/oneOf/16/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err186];
}
else {
vErrors.push(err186);
}
errors++;
}
var _valid0 = _errs178 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 16];
}
else {
if(_valid0){
valid0 = true;
passing0 = 16;
}
const _errs189 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.ref_id === undefined) || (!(func0.call(data, "ref_id")))){
const err187 = {instancePath,schemaPath:"#/oneOf/17/required",keyword:"required",params:{missingProperty: "ref_id"},message:"must have required property '"+"ref_id"+"'"};
if(vErrors === null){
vErrors = [err187];
}
else {
vErrors.push(err187);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err188 = {instancePath,schemaPath:"#/oneOf/17/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err188];
}
else {
vErrors.push(err188);
}
errors++;
}
if((data.version === undefined) || (!(func0.call(data, "version")))){
const err189 = {instancePath,schemaPath:"#/oneOf/17/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err189];
}
else {
vErrors.push(err189);
}
errors++;
}
if((data.payload === undefined) || (!(func0.call(data, "payload")))){
const err190 = {instancePath,schemaPath:"#/oneOf/17/required",keyword:"required",params:{missingProperty: "payload"},message:"must have required property '"+"payload"+"'"};
if(vErrors === null){
vErrors = [err190];
}
else {
vErrors.push(err190);
}
errors++;
}
for(const key17 of Object.keys(data)){
if(!((((key17 === "ref_id") || (key17 === "kind")) || (key17 === "version")) || (key17 === "payload"))){
const err191 = {instancePath,schemaPath:"#/oneOf/17/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key17},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err191];
}
else {
vErrors.push(err191);
}
errors++;
}
}
if(data.ref_id !== undefined && func0.call(data, "ref_id")){
let data68 = data.ref_id;
if(typeof data68 === "string"){
if(!pattern0.test(data68)){
const err192 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err192];
}
else {
vErrors.push(err192);
}
errors++;
}
}
else {
const err193 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err193];
}
else {
vErrors.push(err193);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("merchant_identity" !== data.kind){
const err194 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/17/properties/kind/const",keyword:"const",params:{allowedValue: "merchant_identity"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err194];
}
else {
vErrors.push(err194);
}
errors++;
}
}
if(data.version !== undefined && func0.call(data, "version")){
let data70 = data.version;
if(typeof data70 === "string"){
if(!pattern31.test(data70)){
const err195 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err195];
}
else {
vErrors.push(err195);
}
errors++;
}
}
else {
const err196 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err196];
}
else {
vErrors.push(err196);
}
errors++;
}
}
if(data.payload !== undefined && func0.call(data, "payload")){
if(!(validate63(data.payload, {instancePath:instancePath+"/payload",parentData:data,parentDataProperty:"payload",rootData}))){
vErrors = vErrors === null ? validate63.errors : vErrors.concat(validate63.errors);
errors = vErrors.length;
}
}
}
else {
const err197 = {instancePath,schemaPath:"#/oneOf/17/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err197];
}
else {
vErrors.push(err197);
}
errors++;
}
var _valid0 = _errs189 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 17];
}
else {
if(_valid0){
valid0 = true;
passing0 = 17;
}
const _errs200 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.ref_id === undefined) || (!(func0.call(data, "ref_id")))){
const err198 = {instancePath,schemaPath:"#/oneOf/18/required",keyword:"required",params:{missingProperty: "ref_id"},message:"must have required property '"+"ref_id"+"'"};
if(vErrors === null){
vErrors = [err198];
}
else {
vErrors.push(err198);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err199 = {instancePath,schemaPath:"#/oneOf/18/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err199];
}
else {
vErrors.push(err199);
}
errors++;
}
if((data.version === undefined) || (!(func0.call(data, "version")))){
const err200 = {instancePath,schemaPath:"#/oneOf/18/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err200];
}
else {
vErrors.push(err200);
}
errors++;
}
if((data.payload === undefined) || (!(func0.call(data, "payload")))){
const err201 = {instancePath,schemaPath:"#/oneOf/18/required",keyword:"required",params:{missingProperty: "payload"},message:"must have required property '"+"payload"+"'"};
if(vErrors === null){
vErrors = [err201];
}
else {
vErrors.push(err201);
}
errors++;
}
for(const key18 of Object.keys(data)){
if(!((((key18 === "ref_id") || (key18 === "kind")) || (key18 === "version")) || (key18 === "payload"))){
const err202 = {instancePath,schemaPath:"#/oneOf/18/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key18},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err202];
}
else {
vErrors.push(err202);
}
errors++;
}
}
if(data.ref_id !== undefined && func0.call(data, "ref_id")){
let data72 = data.ref_id;
if(typeof data72 === "string"){
if(!pattern0.test(data72)){
const err203 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err203];
}
else {
vErrors.push(err203);
}
errors++;
}
}
else {
const err204 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err204];
}
else {
vErrors.push(err204);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("transfer_identity" !== data.kind){
const err205 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/18/properties/kind/const",keyword:"const",params:{allowedValue: "transfer_identity"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err205];
}
else {
vErrors.push(err205);
}
errors++;
}
}
if(data.version !== undefined && func0.call(data, "version")){
let data74 = data.version;
if(typeof data74 === "string"){
if(!pattern31.test(data74)){
const err206 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err206];
}
else {
vErrors.push(err206);
}
errors++;
}
}
else {
const err207 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err207];
}
else {
vErrors.push(err207);
}
errors++;
}
}
if(data.payload !== undefined && func0.call(data, "payload")){
if(!(validate65(data.payload, {instancePath:instancePath+"/payload",parentData:data,parentDataProperty:"payload",rootData}))){
vErrors = vErrors === null ? validate65.errors : vErrors.concat(validate65.errors);
errors = vErrors.length;
}
}
}
else {
const err208 = {instancePath,schemaPath:"#/oneOf/18/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err208];
}
else {
vErrors.push(err208);
}
errors++;
}
var _valid0 = _errs200 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 18];
}
else {
if(_valid0){
valid0 = true;
passing0 = 18;
}
const _errs211 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.ref_id === undefined) || (!(func0.call(data, "ref_id")))){
const err209 = {instancePath,schemaPath:"#/oneOf/19/required",keyword:"required",params:{missingProperty: "ref_id"},message:"must have required property '"+"ref_id"+"'"};
if(vErrors === null){
vErrors = [err209];
}
else {
vErrors.push(err209);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err210 = {instancePath,schemaPath:"#/oneOf/19/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err210];
}
else {
vErrors.push(err210);
}
errors++;
}
if((data.version === undefined) || (!(func0.call(data, "version")))){
const err211 = {instancePath,schemaPath:"#/oneOf/19/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err211];
}
else {
vErrors.push(err211);
}
errors++;
}
if((data.payload === undefined) || (!(func0.call(data, "payload")))){
const err212 = {instancePath,schemaPath:"#/oneOf/19/required",keyword:"required",params:{missingProperty: "payload"},message:"must have required property '"+"payload"+"'"};
if(vErrors === null){
vErrors = [err212];
}
else {
vErrors.push(err212);
}
errors++;
}
for(const key19 of Object.keys(data)){
if(!((((key19 === "ref_id") || (key19 === "kind")) || (key19 === "version")) || (key19 === "payload"))){
const err213 = {instancePath,schemaPath:"#/oneOf/19/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key19},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err213];
}
else {
vErrors.push(err213);
}
errors++;
}
}
if(data.ref_id !== undefined && func0.call(data, "ref_id")){
let data76 = data.ref_id;
if(typeof data76 === "string"){
if(!pattern0.test(data76)){
const err214 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err214];
}
else {
vErrors.push(err214);
}
errors++;
}
}
else {
const err215 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err215];
}
else {
vErrors.push(err215);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("installment_plan" !== data.kind){
const err216 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/19/properties/kind/const",keyword:"const",params:{allowedValue: "installment_plan"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err216];
}
else {
vErrors.push(err216);
}
errors++;
}
}
if(data.version !== undefined && func0.call(data, "version")){
let data78 = data.version;
if(typeof data78 === "string"){
if(!pattern31.test(data78)){
const err217 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err217];
}
else {
vErrors.push(err217);
}
errors++;
}
}
else {
const err218 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err218];
}
else {
vErrors.push(err218);
}
errors++;
}
}
if(data.payload !== undefined && func0.call(data, "payload")){
if(!(validate68(data.payload, {instancePath:instancePath+"/payload",parentData:data,parentDataProperty:"payload",rootData}))){
vErrors = vErrors === null ? validate68.errors : vErrors.concat(validate68.errors);
errors = vErrors.length;
}
}
}
else {
const err219 = {instancePath,schemaPath:"#/oneOf/19/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err219];
}
else {
vErrors.push(err219);
}
errors++;
}
var _valid0 = _errs211 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 19];
}
else {
if(_valid0){
valid0 = true;
passing0 = 19;
}
const _errs222 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.ref_id === undefined) || (!(func0.call(data, "ref_id")))){
const err220 = {instancePath,schemaPath:"#/oneOf/20/required",keyword:"required",params:{missingProperty: "ref_id"},message:"must have required property '"+"ref_id"+"'"};
if(vErrors === null){
vErrors = [err220];
}
else {
vErrors.push(err220);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err221 = {instancePath,schemaPath:"#/oneOf/20/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err221];
}
else {
vErrors.push(err221);
}
errors++;
}
if((data.version === undefined) || (!(func0.call(data, "version")))){
const err222 = {instancePath,schemaPath:"#/oneOf/20/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err222];
}
else {
vErrors.push(err222);
}
errors++;
}
if((data.payload === undefined) || (!(func0.call(data, "payload")))){
const err223 = {instancePath,schemaPath:"#/oneOf/20/required",keyword:"required",params:{missingProperty: "payload"},message:"must have required property '"+"payload"+"'"};
if(vErrors === null){
vErrors = [err223];
}
else {
vErrors.push(err223);
}
errors++;
}
for(const key20 of Object.keys(data)){
if(!((((key20 === "ref_id") || (key20 === "kind")) || (key20 === "version")) || (key20 === "payload"))){
const err224 = {instancePath,schemaPath:"#/oneOf/20/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key20},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err224];
}
else {
vErrors.push(err224);
}
errors++;
}
}
if(data.ref_id !== undefined && func0.call(data, "ref_id")){
let data80 = data.ref_id;
if(typeof data80 === "string"){
if(!pattern0.test(data80)){
const err225 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err225];
}
else {
vErrors.push(err225);
}
errors++;
}
}
else {
const err226 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err226];
}
else {
vErrors.push(err226);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("turn" !== data.kind){
const err227 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/20/properties/kind/const",keyword:"const",params:{allowedValue: "turn"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err227];
}
else {
vErrors.push(err227);
}
errors++;
}
}
if(data.version !== undefined && func0.call(data, "version")){
let data82 = data.version;
if(typeof data82 === "string"){
if(!pattern31.test(data82)){
const err228 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err228];
}
else {
vErrors.push(err228);
}
errors++;
}
}
else {
const err229 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err229];
}
else {
vErrors.push(err229);
}
errors++;
}
}
if(data.payload !== undefined && func0.call(data, "payload")){
if(!(validate71(data.payload, {instancePath:instancePath+"/payload",parentData:data,parentDataProperty:"payload",rootData}))){
vErrors = vErrors === null ? validate71.errors : vErrors.concat(validate71.errors);
errors = vErrors.length;
}
}
}
else {
const err230 = {instancePath,schemaPath:"#/oneOf/20/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err230];
}
else {
vErrors.push(err230);
}
errors++;
}
var _valid0 = _errs222 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 20];
}
else {
if(_valid0){
valid0 = true;
passing0 = 20;
}
const _errs233 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.ref_id === undefined) || (!(func0.call(data, "ref_id")))){
const err231 = {instancePath,schemaPath:"#/oneOf/21/required",keyword:"required",params:{missingProperty: "ref_id"},message:"must have required property '"+"ref_id"+"'"};
if(vErrors === null){
vErrors = [err231];
}
else {
vErrors.push(err231);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err232 = {instancePath,schemaPath:"#/oneOf/21/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err232];
}
else {
vErrors.push(err232);
}
errors++;
}
if((data.version === undefined) || (!(func0.call(data, "version")))){
const err233 = {instancePath,schemaPath:"#/oneOf/21/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err233];
}
else {
vErrors.push(err233);
}
errors++;
}
if((data.payload === undefined) || (!(func0.call(data, "payload")))){
const err234 = {instancePath,schemaPath:"#/oneOf/21/required",keyword:"required",params:{missingProperty: "payload"},message:"must have required property '"+"payload"+"'"};
if(vErrors === null){
vErrors = [err234];
}
else {
vErrors.push(err234);
}
errors++;
}
for(const key21 of Object.keys(data)){
if(!((((key21 === "ref_id") || (key21 === "kind")) || (key21 === "version")) || (key21 === "payload"))){
const err235 = {instancePath,schemaPath:"#/oneOf/21/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key21},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err235];
}
else {
vErrors.push(err235);
}
errors++;
}
}
if(data.ref_id !== undefined && func0.call(data, "ref_id")){
let data84 = data.ref_id;
if(typeof data84 === "string"){
if(!pattern0.test(data84)){
const err236 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err236];
}
else {
vErrors.push(err236);
}
errors++;
}
}
else {
const err237 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err237];
}
else {
vErrors.push(err237);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("derived_claim" !== data.kind){
const err238 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/21/properties/kind/const",keyword:"const",params:{allowedValue: "derived_claim"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err238];
}
else {
vErrors.push(err238);
}
errors++;
}
}
if(data.version !== undefined && func0.call(data, "version")){
let data86 = data.version;
if(typeof data86 === "string"){
if(!pattern31.test(data86)){
const err239 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err239];
}
else {
vErrors.push(err239);
}
errors++;
}
}
else {
const err240 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err240];
}
else {
vErrors.push(err240);
}
errors++;
}
}
if(data.payload !== undefined && func0.call(data, "payload")){
if(!(validate73(data.payload, {instancePath:instancePath+"/payload",parentData:data,parentDataProperty:"payload",rootData}))){
vErrors = vErrors === null ? validate73.errors : vErrors.concat(validate73.errors);
errors = vErrors.length;
}
}
}
else {
const err241 = {instancePath,schemaPath:"#/oneOf/21/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err241];
}
else {
vErrors.push(err241);
}
errors++;
}
var _valid0 = _errs233 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 21];
}
else {
if(_valid0){
valid0 = true;
passing0 = 21;
}
const _errs244 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.ref_id === undefined) || (!(func0.call(data, "ref_id")))){
const err242 = {instancePath,schemaPath:"#/oneOf/22/required",keyword:"required",params:{missingProperty: "ref_id"},message:"must have required property '"+"ref_id"+"'"};
if(vErrors === null){
vErrors = [err242];
}
else {
vErrors.push(err242);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err243 = {instancePath,schemaPath:"#/oneOf/22/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err243];
}
else {
vErrors.push(err243);
}
errors++;
}
if((data.version === undefined) || (!(func0.call(data, "version")))){
const err244 = {instancePath,schemaPath:"#/oneOf/22/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err244];
}
else {
vErrors.push(err244);
}
errors++;
}
if((data.payload === undefined) || (!(func0.call(data, "payload")))){
const err245 = {instancePath,schemaPath:"#/oneOf/22/required",keyword:"required",params:{missingProperty: "payload"},message:"must have required property '"+"payload"+"'"};
if(vErrors === null){
vErrors = [err245];
}
else {
vErrors.push(err245);
}
errors++;
}
for(const key22 of Object.keys(data)){
if(!((((key22 === "ref_id") || (key22 === "kind")) || (key22 === "version")) || (key22 === "payload"))){
const err246 = {instancePath,schemaPath:"#/oneOf/22/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key22},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err246];
}
else {
vErrors.push(err246);
}
errors++;
}
}
if(data.ref_id !== undefined && func0.call(data, "ref_id")){
let data88 = data.ref_id;
if(typeof data88 === "string"){
if(!pattern0.test(data88)){
const err247 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err247];
}
else {
vErrors.push(err247);
}
errors++;
}
}
else {
const err248 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err248];
}
else {
vErrors.push(err248);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("evaluation_policy" !== data.kind){
const err249 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/22/properties/kind/const",keyword:"const",params:{allowedValue: "evaluation_policy"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err249];
}
else {
vErrors.push(err249);
}
errors++;
}
}
if(data.version !== undefined && func0.call(data, "version")){
let data90 = data.version;
if(typeof data90 === "string"){
if(!pattern31.test(data90)){
const err250 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err250];
}
else {
vErrors.push(err250);
}
errors++;
}
}
else {
const err251 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err251];
}
else {
vErrors.push(err251);
}
errors++;
}
}
if(data.payload !== undefined && func0.call(data, "payload")){
if(!(validate80(data.payload, {instancePath:instancePath+"/payload",parentData:data,parentDataProperty:"payload",rootData}))){
vErrors = vErrors === null ? validate80.errors : vErrors.concat(validate80.errors);
errors = vErrors.length;
}
}
}
else {
const err252 = {instancePath,schemaPath:"#/oneOf/22/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err252];
}
else {
vErrors.push(err252);
}
errors++;
}
var _valid0 = _errs244 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 22];
}
else {
if(_valid0){
valid0 = true;
passing0 = 22;
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
if(!valid0){
const err253 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err253];
}
else {
vErrors.push(err253);
}
errors++;
}
else {
errors = _errs1;
if(vErrors !== null){
if(_errs1){
vErrors.length = _errs1;
}
else {
vErrors = null;
}
}
}
validate25.errors = vErrors;
return errors === 0;
}

exports.registry = validate82;
const schema216 = {"$schema":"http://json-schema.org/draft-07/schema#","$id":"urn:financasbot:next:metric-evaluator-registry:1","title":"N02-F metric evaluator registry document: authoring is never executable","type":"object","additionalProperties":false,"required":["schema_version","registry_id","registry_version","stage","entries"],"properties":{"schema_version":{"const":1},"registry_id":{"const":"metric_evaluator_registry"},"registry_version":{"type":"integer","minimum":1},"stage":{"enum":["authoring","execution"]},"entries":{"type":"array","minItems":1,"items":{"$ref":"#/definitions/entry"}}},"allOf":[{"if":{"properties":{"stage":{"const":"authoring"}}},"then":{"properties":{"entries":{"items":{"properties":{"artifact_status":{"const":"not_built"}},"not":{"required":["evaluator_artifact_root"]}}}}}},{"if":{"properties":{"stage":{"const":"execution"}}},"then":{"properties":{"entries":{"items":{"required":["evaluator_artifact_root"],"properties":{"artifact_status":{"const":"bound"}}}}}}}],"definitions":{"name":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"},"digest":{"type":"string","pattern":"^sha256:[a-f0-9]{64}$"},"role":{"type":"object","additionalProperties":false,"required":["role_id","semantic_role","input_kind","cardinality","ordered"],"properties":{"role_id":{"$ref":"#/definitions/name"},"semantic_role":{"enum":["population","scope","period","policy","coverage","source","target","left","right","numerator","denominator","sort_key","sort_direction","opening_balance","limit","clock","evidence"]},"input_kind":{"enum":["node","node_set","parent_claim","claim_context"]},"cardinality":{"enum":["one","many"]},"ordered":{"type":"boolean"}},"allOf":[{"if":{"properties":{"input_kind":{"enum":["node","parent_claim","claim_context"]}}},"then":{"properties":{"cardinality":{"const":"one"},"ordered":{"const":false}}}},{"if":{"properties":{"input_kind":{"const":"node_set"}}},"then":{"properties":{"cardinality":{"const":"many"}}}}]},"entry":{"type":"object","additionalProperties":false,"required":["evaluator_id","evaluator_version","metric","unit","contract_path","evaluator_contract_hash","artifact_status","roles","witness_contract_ids"],"properties":{"evaluator_id":{"$ref":"#/definitions/name"},"evaluator_version":{"type":"integer","minimum":1},"metric":{"$ref":"#/definitions/name"},"unit":{"enum":["BRL_minor","count","entity_ids","state"]},"contract_path":{"type":"string","pattern":"^docs/contracts/next/provenance-v2/evaluator-contracts/[a-z][a-z0-9_-]*\\.json$"},"evaluator_contract_hash":{"$ref":"#/definitions/digest"},"artifact_status":{"enum":["not_built","bound"]},"evaluator_artifact_root":{"$ref":"#/definitions/digest"},"roles":{"type":"array","minItems":1,"items":{"$ref":"#/definitions/role"}},"witness_contract_ids":{"type":"array","minItems":1,"uniqueItems":true,"items":{"$ref":"#/definitions/name"}}}}}};
const schema217 = {"type":"object","additionalProperties":false,"required":["evaluator_id","evaluator_version","metric","unit","contract_path","evaluator_contract_hash","artifact_status","roles","witness_contract_ids"],"properties":{"evaluator_id":{"$ref":"#/definitions/name"},"evaluator_version":{"type":"integer","minimum":1},"metric":{"$ref":"#/definitions/name"},"unit":{"enum":["BRL_minor","count","entity_ids","state"]},"contract_path":{"type":"string","pattern":"^docs/contracts/next/provenance-v2/evaluator-contracts/[a-z][a-z0-9_-]*\\.json$"},"evaluator_contract_hash":{"$ref":"#/definitions/digest"},"artifact_status":{"enum":["not_built","bound"]},"evaluator_artifact_root":{"$ref":"#/definitions/digest"},"roles":{"type":"array","minItems":1,"items":{"$ref":"#/definitions/role"}},"witness_contract_ids":{"type":"array","minItems":1,"uniqueItems":true,"items":{"$ref":"#/definitions/name"}}}};
const schema218 = {"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"};
const schema220 = {"type":"string","pattern":"^sha256:[a-f0-9]{64}$"};
const pattern150 = new RegExp("^docs/contracts/next/provenance-v2/evaluator-contracts/[a-z][a-z0-9_-]*\\.json$", "u");
const schema222 = {"type":"object","additionalProperties":false,"required":["role_id","semantic_role","input_kind","cardinality","ordered"],"properties":{"role_id":{"$ref":"#/definitions/name"},"semantic_role":{"enum":["population","scope","period","policy","coverage","source","target","left","right","numerator","denominator","sort_key","sort_direction","opening_balance","limit","clock","evidence"]},"input_kind":{"enum":["node","node_set","parent_claim","claim_context"]},"cardinality":{"enum":["one","many"]},"ordered":{"type":"boolean"}},"allOf":[{"if":{"properties":{"input_kind":{"enum":["node","parent_claim","claim_context"]}}},"then":{"properties":{"cardinality":{"const":"one"},"ordered":{"const":false}}}},{"if":{"properties":{"input_kind":{"const":"node_set"}}},"then":{"properties":{"cardinality":{"const":"many"}}}}]};

function validate84(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs2 = errors;
let valid1 = true;
const _errs3 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.input_kind !== undefined && func0.call(data, "input_kind")){
let data0 = data.input_kind;
if(!(((data0 === "node") || (data0 === "parent_claim")) || (data0 === "claim_context"))){
const err0 = {};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
}
}
var _valid0 = _errs3 === errors;
errors = _errs2;
if(vErrors !== null){
if(_errs2){
vErrors.length = _errs2;
}
else {
vErrors = null;
}
}
if(_valid0){
const _errs5 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.cardinality !== undefined && func0.call(data, "cardinality")){
if("one" !== data.cardinality){
const err1 = {instancePath:instancePath+"/cardinality",schemaPath:"#/allOf/0/then/properties/cardinality/const",keyword:"const",params:{allowedValue: "one"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.ordered !== undefined && func0.call(data, "ordered")){
if(false !== data.ordered){
const err2 = {instancePath:instancePath+"/ordered",schemaPath:"#/allOf/0/then/properties/ordered/const",keyword:"const",params:{allowedValue: false},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
}
var _valid0 = _errs5 === errors;
valid1 = _valid0;
}
if(!valid1){
const err3 = {instancePath,schemaPath:"#/allOf/0/if",keyword:"if",params:{failingKeyword: "then"},message:"must match \"then\" schema"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
const _errs9 = errors;
let valid4 = true;
const _errs10 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.input_kind !== undefined && func0.call(data, "input_kind")){
if("node_set" !== data.input_kind){
const err4 = {};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
}
var _valid1 = _errs10 === errors;
errors = _errs9;
if(vErrors !== null){
if(_errs9){
vErrors.length = _errs9;
}
else {
vErrors = null;
}
}
if(_valid1){
const _errs12 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.cardinality !== undefined && func0.call(data, "cardinality")){
if("many" !== data.cardinality){
const err5 = {instancePath:instancePath+"/cardinality",schemaPath:"#/allOf/1/then/properties/cardinality/const",keyword:"const",params:{allowedValue: "many"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
}
var _valid1 = _errs12 === errors;
valid4 = _valid1;
}
if(!valid4){
const err6 = {instancePath,schemaPath:"#/allOf/1/if",keyword:"if",params:{failingKeyword: "then"},message:"must match \"then\" schema"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.role_id === undefined) || (!(func0.call(data, "role_id")))){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "role_id"},message:"must have required property '"+"role_id"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if((data.semantic_role === undefined) || (!(func0.call(data, "semantic_role")))){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "semantic_role"},message:"must have required property '"+"semantic_role"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if((data.input_kind === undefined) || (!(func0.call(data, "input_kind")))){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "input_kind"},message:"must have required property '"+"input_kind"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if((data.cardinality === undefined) || (!(func0.call(data, "cardinality")))){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "cardinality"},message:"must have required property '"+"cardinality"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if((data.ordered === undefined) || (!(func0.call(data, "ordered")))){
const err11 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "ordered"},message:"must have required property '"+"ordered"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(((((key0 === "role_id") || (key0 === "semantic_role")) || (key0 === "input_kind")) || (key0 === "cardinality")) || (key0 === "ordered"))){
const err12 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.role_id !== undefined && func0.call(data, "role_id")){
let data5 = data.role_id;
if(typeof data5 === "string"){
if(!pattern3.test(data5)){
const err13 = {instancePath:instancePath+"/role_id",schemaPath:"#/definitions/name/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
else {
const err14 = {instancePath:instancePath+"/role_id",schemaPath:"#/definitions/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.semantic_role !== undefined && func0.call(data, "semantic_role")){
let data6 = data.semantic_role;
if(!(((((((((((((((((data6 === "population") || (data6 === "scope")) || (data6 === "period")) || (data6 === "policy")) || (data6 === "coverage")) || (data6 === "source")) || (data6 === "target")) || (data6 === "left")) || (data6 === "right")) || (data6 === "numerator")) || (data6 === "denominator")) || (data6 === "sort_key")) || (data6 === "sort_direction")) || (data6 === "opening_balance")) || (data6 === "limit")) || (data6 === "clock")) || (data6 === "evidence"))){
const err15 = {instancePath:instancePath+"/semantic_role",schemaPath:"#/properties/semantic_role/enum",keyword:"enum",params:{allowedValues: schema222.properties.semantic_role.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.input_kind !== undefined && func0.call(data, "input_kind")){
let data7 = data.input_kind;
if(!((((data7 === "node") || (data7 === "node_set")) || (data7 === "parent_claim")) || (data7 === "claim_context"))){
const err16 = {instancePath:instancePath+"/input_kind",schemaPath:"#/properties/input_kind/enum",keyword:"enum",params:{allowedValues: schema222.properties.input_kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.cardinality !== undefined && func0.call(data, "cardinality")){
let data8 = data.cardinality;
if(!((data8 === "one") || (data8 === "many"))){
const err17 = {instancePath:instancePath+"/cardinality",schemaPath:"#/properties/cardinality/enum",keyword:"enum",params:{allowedValues: schema222.properties.cardinality.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.ordered !== undefined && func0.call(data, "ordered")){
if(typeof data.ordered !== "boolean"){
const err18 = {instancePath:instancePath+"/ordered",schemaPath:"#/properties/ordered/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
}
else {
const err19 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
validate84.errors = vErrors;
return errors === 0;
}


function validate83(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.evaluator_id === undefined) || (!(func0.call(data, "evaluator_id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "evaluator_id"},message:"must have required property '"+"evaluator_id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.evaluator_version === undefined) || (!(func0.call(data, "evaluator_version")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "evaluator_version"},message:"must have required property '"+"evaluator_version"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.metric === undefined) || (!(func0.call(data, "metric")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "metric"},message:"must have required property '"+"metric"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if((data.unit === undefined) || (!(func0.call(data, "unit")))){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "unit"},message:"must have required property '"+"unit"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if((data.contract_path === undefined) || (!(func0.call(data, "contract_path")))){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "contract_path"},message:"must have required property '"+"contract_path"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if((data.evaluator_contract_hash === undefined) || (!(func0.call(data, "evaluator_contract_hash")))){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "evaluator_contract_hash"},message:"must have required property '"+"evaluator_contract_hash"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if((data.artifact_status === undefined) || (!(func0.call(data, "artifact_status")))){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "artifact_status"},message:"must have required property '"+"artifact_status"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if((data.roles === undefined) || (!(func0.call(data, "roles")))){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "roles"},message:"must have required property '"+"roles"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if((data.witness_contract_ids === undefined) || (!(func0.call(data, "witness_contract_ids")))){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "witness_contract_ids"},message:"must have required property '"+"witness_contract_ids"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(func0.call(schema217.properties, key0))){
const err9 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.evaluator_id !== undefined && func0.call(data, "evaluator_id")){
let data0 = data.evaluator_id;
if(typeof data0 === "string"){
if(!pattern3.test(data0)){
const err10 = {instancePath:instancePath+"/evaluator_id",schemaPath:"#/definitions/name/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/evaluator_id",schemaPath:"#/definitions/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.evaluator_version !== undefined && func0.call(data, "evaluator_version")){
let data1 = data.evaluator_version;
if(!(((typeof data1 == "number") && (!(data1 % 1) && !isNaN(data1))) && (isFinite(data1)))){
const err12 = {instancePath:instancePath+"/evaluator_version",schemaPath:"#/properties/evaluator_version/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if((typeof data1 == "number") && (isFinite(data1))){
if(data1 < 1 || isNaN(data1)){
const err13 = {instancePath:instancePath+"/evaluator_version",schemaPath:"#/properties/evaluator_version/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
if(data.metric !== undefined && func0.call(data, "metric")){
let data2 = data.metric;
if(typeof data2 === "string"){
if(!pattern3.test(data2)){
const err14 = {instancePath:instancePath+"/metric",schemaPath:"#/definitions/name/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/metric",schemaPath:"#/definitions/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.unit !== undefined && func0.call(data, "unit")){
let data3 = data.unit;
if(!((((data3 === "BRL_minor") || (data3 === "count")) || (data3 === "entity_ids")) || (data3 === "state"))){
const err16 = {instancePath:instancePath+"/unit",schemaPath:"#/properties/unit/enum",keyword:"enum",params:{allowedValues: schema217.properties.unit.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.contract_path !== undefined && func0.call(data, "contract_path")){
let data4 = data.contract_path;
if(typeof data4 === "string"){
if(!pattern150.test(data4)){
const err17 = {instancePath:instancePath+"/contract_path",schemaPath:"#/properties/contract_path/pattern",keyword:"pattern",params:{pattern: "^docs/contracts/next/provenance-v2/evaluator-contracts/[a-z][a-z0-9_-]*\\.json$"},message:"must match pattern \""+"^docs/contracts/next/provenance-v2/evaluator-contracts/[a-z][a-z0-9_-]*\\.json$"+"\""};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/contract_path",schemaPath:"#/properties/contract_path/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.evaluator_contract_hash !== undefined && func0.call(data, "evaluator_contract_hash")){
let data5 = data.evaluator_contract_hash;
if(typeof data5 === "string"){
if(!pattern31.test(data5)){
const err19 = {instancePath:instancePath+"/evaluator_contract_hash",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/evaluator_contract_hash",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.artifact_status !== undefined && func0.call(data, "artifact_status")){
let data6 = data.artifact_status;
if(!((data6 === "not_built") || (data6 === "bound"))){
const err21 = {instancePath:instancePath+"/artifact_status",schemaPath:"#/properties/artifact_status/enum",keyword:"enum",params:{allowedValues: schema217.properties.artifact_status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.evaluator_artifact_root !== undefined && func0.call(data, "evaluator_artifact_root")){
let data7 = data.evaluator_artifact_root;
if(typeof data7 === "string"){
if(!pattern31.test(data7)){
const err22 = {instancePath:instancePath+"/evaluator_artifact_root",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
else {
const err23 = {instancePath:instancePath+"/evaluator_artifact_root",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.roles !== undefined && func0.call(data, "roles")){
let data8 = data.roles;
if(Array.isArray(data8)){
if(data8.length < 1){
const err24 = {instancePath:instancePath+"/roles",schemaPath:"#/properties/roles/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
const len0 = data8.length;
for(let i0=0; i0<len0; i0++){
if(!(validate84(data8[i0], {instancePath:instancePath+"/roles/" + i0,parentData:data8,parentDataProperty:i0,rootData}))){
vErrors = vErrors === null ? validate84.errors : vErrors.concat(validate84.errors);
errors = vErrors.length;
}
}
}
else {
const err25 = {instancePath:instancePath+"/roles",schemaPath:"#/properties/roles/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.witness_contract_ids !== undefined && func0.call(data, "witness_contract_ids")){
let data10 = data.witness_contract_ids;
if(Array.isArray(data10)){
if(data10.length < 1){
const err26 = {instancePath:instancePath+"/witness_contract_ids",schemaPath:"#/properties/witness_contract_ids/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
const len1 = data10.length;
for(let i1=0; i1<len1; i1++){
let data11 = data10[i1];
if(typeof data11 === "string"){
if(!pattern3.test(data11)){
const err27 = {instancePath:instancePath+"/witness_contract_ids/" + i1,schemaPath:"#/definitions/name/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
else {
const err28 = {instancePath:instancePath+"/witness_contract_ids/" + i1,schemaPath:"#/definitions/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
let i2 = data10.length;
let j0;
if(i2 > 1){
outer0:
for(;i2--;){
for(j0 = i2; j0--;){
if(func32(data10[i2], data10[j0])){
const err29 = {instancePath:instancePath+"/witness_contract_ids",schemaPath:"#/properties/witness_contract_ids/uniqueItems",keyword:"uniqueItems",params:{i: i2, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i2+" are identical)"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err30 = {instancePath:instancePath+"/witness_contract_ids",schemaPath:"#/properties/witness_contract_ids/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
}
else {
const err31 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
validate83.errors = vErrors;
return errors === 0;
}


function validate82(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
/*# sourceURL="urn:financasbot:next:metric-evaluator-registry:1" */;
let vErrors = null;
let errors = 0;
const _errs2 = errors;
let valid1 = true;
const _errs3 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.stage !== undefined && func0.call(data, "stage")){
if("authoring" !== data.stage){
const err0 = {};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
}
}
var _valid0 = _errs3 === errors;
errors = _errs2;
if(vErrors !== null){
if(_errs2){
vErrors.length = _errs2;
}
else {
vErrors = null;
}
}
if(_valid0){
const _errs5 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.entries !== undefined && func0.call(data, "entries")){
let data1 = data.entries;
if(Array.isArray(data1)){
const len0 = data1.length;
for(let i0=0; i0<len0; i0++){
let data2 = data1[i0];
const _errs8 = errors;
const _errs9 = errors;
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
let missing0;
if(((data2.evaluator_artifact_root === undefined) || (!(func0.call(data2, "evaluator_artifact_root")))) && (missing0 = "evaluator_artifact_root")){
const err1 = {};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
var valid6 = _errs9 === errors;
if(valid6){
const err2 = {instancePath:instancePath+"/entries/" + i0,schemaPath:"#/allOf/0/then/properties/entries/items/not",keyword:"not",params:{},message:"must NOT be valid"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
else {
errors = _errs8;
if(vErrors !== null){
if(_errs8){
vErrors.length = _errs8;
}
else {
vErrors = null;
}
}
}
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
if(data2.artifact_status !== undefined && func0.call(data2, "artifact_status")){
if("not_built" !== data2.artifact_status){
const err3 = {instancePath:instancePath+"/entries/" + i0+"/artifact_status",schemaPath:"#/allOf/0/then/properties/entries/items/properties/artifact_status/const",keyword:"const",params:{allowedValue: "not_built"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
}
}
}
}
}
var _valid0 = _errs5 === errors;
valid1 = _valid0;
}
if(!valid1){
const err4 = {instancePath,schemaPath:"#/allOf/0/if",keyword:"if",params:{failingKeyword: "then"},message:"must match \"then\" schema"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
const _errs12 = errors;
let valid8 = true;
const _errs13 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.stage !== undefined && func0.call(data, "stage")){
if("execution" !== data.stage){
const err5 = {};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
}
var _valid1 = _errs13 === errors;
errors = _errs12;
if(vErrors !== null){
if(_errs12){
vErrors.length = _errs12;
}
else {
vErrors = null;
}
}
if(_valid1){
const _errs15 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.entries !== undefined && func0.call(data, "entries")){
let data5 = data.entries;
if(Array.isArray(data5)){
const len1 = data5.length;
for(let i1=0; i1<len1; i1++){
let data6 = data5[i1];
if(data6 && typeof data6 == "object" && !Array.isArray(data6)){
if((data6.evaluator_artifact_root === undefined) || (!(func0.call(data6, "evaluator_artifact_root")))){
const err6 = {instancePath:instancePath+"/entries/" + i1,schemaPath:"#/allOf/1/then/properties/entries/items/required",keyword:"required",params:{missingProperty: "evaluator_artifact_root"},message:"must have required property '"+"evaluator_artifact_root"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data6.artifact_status !== undefined && func0.call(data6, "artifact_status")){
if("bound" !== data6.artifact_status){
const err7 = {instancePath:instancePath+"/entries/" + i1+"/artifact_status",schemaPath:"#/allOf/1/then/properties/entries/items/properties/artifact_status/const",keyword:"const",params:{allowedValue: "bound"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
}
}
}
}
}
var _valid1 = _errs15 === errors;
valid8 = _valid1;
}
if(!valid8){
const err8 = {instancePath,schemaPath:"#/allOf/1/if",keyword:"if",params:{failingKeyword: "then"},message:"must match \"then\" schema"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.schema_version === undefined) || (!(func0.call(data, "schema_version")))){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "schema_version"},message:"must have required property '"+"schema_version"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if((data.registry_id === undefined) || (!(func0.call(data, "registry_id")))){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "registry_id"},message:"must have required property '"+"registry_id"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if((data.registry_version === undefined) || (!(func0.call(data, "registry_version")))){
const err11 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "registry_version"},message:"must have required property '"+"registry_version"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if((data.stage === undefined) || (!(func0.call(data, "stage")))){
const err12 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "stage"},message:"must have required property '"+"stage"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if((data.entries === undefined) || (!(func0.call(data, "entries")))){
const err13 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "entries"},message:"must have required property '"+"entries"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(((((key0 === "schema_version") || (key0 === "registry_id")) || (key0 === "registry_version")) || (key0 === "stage")) || (key0 === "entries"))){
const err14 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.schema_version !== undefined && func0.call(data, "schema_version")){
if(1 !== data.schema_version){
const err15 = {instancePath:instancePath+"/schema_version",schemaPath:"#/properties/schema_version/const",keyword:"const",params:{allowedValue: 1},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.registry_id !== undefined && func0.call(data, "registry_id")){
if("metric_evaluator_registry" !== data.registry_id){
const err16 = {instancePath:instancePath+"/registry_id",schemaPath:"#/properties/registry_id/const",keyword:"const",params:{allowedValue: "metric_evaluator_registry"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.registry_version !== undefined && func0.call(data, "registry_version")){
let data10 = data.registry_version;
if(!(((typeof data10 == "number") && (!(data10 % 1) && !isNaN(data10))) && (isFinite(data10)))){
const err17 = {instancePath:instancePath+"/registry_version",schemaPath:"#/properties/registry_version/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if((typeof data10 == "number") && (isFinite(data10))){
if(data10 < 1 || isNaN(data10)){
const err18 = {instancePath:instancePath+"/registry_version",schemaPath:"#/properties/registry_version/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
}
if(data.stage !== undefined && func0.call(data, "stage")){
let data11 = data.stage;
if(!((data11 === "authoring") || (data11 === "execution"))){
const err19 = {instancePath:instancePath+"/stage",schemaPath:"#/properties/stage/enum",keyword:"enum",params:{allowedValues: schema216.properties.stage.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.entries !== undefined && func0.call(data, "entries")){
let data12 = data.entries;
if(Array.isArray(data12)){
if(data12.length < 1){
const err20 = {instancePath:instancePath+"/entries",schemaPath:"#/properties/entries/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
const len2 = data12.length;
for(let i2=0; i2<len2; i2++){
if(!(validate83(data12[i2], {instancePath:instancePath+"/entries/" + i2,parentData:data12,parentDataProperty:i2,rootData}))){
vErrors = vErrors === null ? validate83.errors : vErrors.concat(validate83.errors);
errors = vErrors.length;
}
}
}
else {
const err21 = {instancePath:instancePath+"/entries",schemaPath:"#/properties/entries/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
}
else {
const err22 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
validate82.errors = vErrors;
return errors === 0;
}

exports.graphs = validate87;
const schema225 = {"type":"object","additionalProperties":false,"required":["schema_version","stage","contract_id","claim_contract","snapshot_manifest","material_registry","operator_registry","metric_evaluator_registry","graphs"],"properties":{"schema_version":{"const":2},"stage":{"const":"authoring"},"contract_id":{"$ref":"#/definitions/sourceRef"},"claim_contract":{"$ref":"#/definitions/authority"},"snapshot_manifest":{"$ref":"#/definitions/authority"},"material_registry":{"$ref":"#/definitions/authority"},"operator_registry":{"$ref":"#/definitions/authority"},"metric_evaluator_registry":{"$ref":"#/definitions/authority"},"graphs":{"type":"array","minItems":1,"uniqueItems":true,"items":{"$ref":"#/definitions/graph"}}},"$schema":"http://json-schema.org/draft-07/schema#","$id":"urn:financasbot:next:provenance-graph:2","title":"N02-F authored provenance graphs; never observed trace","$comment":"Cross-reference typing, exact 76 fact keys, obligation completeness, predicate arity, DAG, phase coverage and parent receipts require semantic validation. JSON Schema alone never proves them.","definitions":{"id":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"},"digest":{"type":"string","pattern":"^sha256:[a-f0-9]{64}$"},"factKey":{"type":"string","pattern":"^[SMFN]-[0-9]{2}#[1-9][0-9]*#[1-9][0-9]*$"},"sourceRef":{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},"roles":{"type":"array","minItems":1,"uniqueItems":true,"items":{"enum":["value_input","scope_proof","coverage_proof","state_proof","link_proof"]}},"fieldPath":{"type":"object","additionalProperties":false,"required":["node","segments"],"properties":{"node":{"$ref":"#/definitions/id"},"segments":{"type":"array","minItems":1,"items":{"type":"string","pattern":"^[a-z][a-z0-9_]*$"}}}},"claimPath":{"type":"object","additionalProperties":false,"required":["segments"],"properties":{"segments":{"type":"array","minItems":1,"items":{"type":"string","pattern":"^[a-z][a-z0-9_]*$"}}}},"literal":{"type":"object","additionalProperties":false,"required":["type","value"],"properties":{"type":{"enum":["id","text","date","month","datetime","integer","money_minor","boolean","enum","digest","kind"]},"value":{"type":["string","integer","boolean"]}}},"reference":{"type":"object","additionalProperties":false,"required":["id","version","hash"],"properties":{"id":{"$ref":"#/definitions/id"},"version":{"type":"integer","minimum":1},"hash":{"$ref":"#/definitions/digest"}}},"node":{"oneOf":[{"type":"object","additionalProperties":false,"required":["binding","ref_id","kind","version","semantic_fingerprint","roles"],"properties":{"binding":{"const":"snapshot"},"ref_id":{"$ref":"#/definitions/sourceRef"},"kind":{"enum":["family","person","account","card","category","event","budget","bill","source_state","proposal","reminder","calendar_event","side_effect","merchant_rule","fixture","collection","source_origin","merchant_identity","transfer_identity","installment_plan","turn","evaluation_policy"]},"version":{"$ref":"#/definitions/digest"},"semantic_fingerprint":{"$ref":"#/definitions/digest"},"roles":{"$ref":"#/definitions/roles"}}},{"type":"object","additionalProperties":false,"required":["binding","kind","fact_key","roles","identity_resolution"],"properties":{"binding":{"const":"validated_parent"},"kind":{"const":"derived_claim"},"fact_key":{"$ref":"#/definitions/factKey"},"roles":{"$ref":"#/definitions/roles"},"identity_resolution":{"const":"same_execution_validated_parent_receipt"}}}]},"selector":{"type":"object","additionalProperties":false,"required":["kind","segments"],"properties":{"kind":{"enum":["family","person","account","card","category","event","budget","bill","source_state","proposal","reminder","calendar_event","side_effect","merchant_rule","fixture","collection","source_origin","merchant_identity","transfer_identity","installment_plan","turn","derived_claim","evaluation_policy"]},"segments":{"type":"array","minItems":1,"items":{"type":"string","pattern":"^[a-z][a-z0-9_]*$"}}}},"sort":{"type":"object","additionalProperties":false,"required":["keys","tie_break"],"properties":{"keys":{"type":"array","minItems":1,"uniqueItems":true,"items":{"type":"object","additionalProperties":false,"required":["selector","direction"],"properties":{"selector":{"$ref":"#/definitions/selector"},"direction":{"enum":["asc","desc"]}}}},"tie_break":{"const":"kind_ref_version"}}},"arg":{"oneOf":[{"type":"object","additionalProperties":false,"required":["node"],"properties":{"node":{"$ref":"#/definitions/id"}}},{"type":"object","additionalProperties":false,"required":["set"],"properties":{"set":{"$ref":"#/definitions/id"}}},{"type":"object","additionalProperties":false,"required":["field"],"properties":{"field":{"$ref":"#/definitions/fieldPath"}}},{"type":"object","additionalProperties":false,"required":["claim"],"properties":{"claim":{"$ref":"#/definitions/claimPath"}}},{"type":"object","additionalProperties":false,"required":["literal"],"properties":{"literal":{"$ref":"#/definitions/literal"}}},{"type":"object","additionalProperties":false,"required":["selector"],"properties":{"selector":{"$ref":"#/definitions/selector"}}},{"type":"object","additionalProperties":false,"required":["template","bindings"],"properties":{"template":{"$ref":"#/definitions/reference"},"bindings":{"type":"object","minProperties":1,"propertyNames":{"$ref":"#/definitions/id"},"additionalProperties":{"$ref":"#/definitions/arg"}}}},{"type":"object","additionalProperties":false,"required":["partial_policy"],"properties":{"partial_policy":{"$ref":"#/definitions/reference"}}},{"type":"object","additionalProperties":false,"required":["sort"],"properties":{"sort":{"$ref":"#/definitions/sort"}}},{"type":"object","additionalProperties":false,"required":["projection"],"properties":{"projection":{"type":"object","additionalProperties":false,"required":["set","selector","as"],"properties":{"set":{"$ref":"#/definitions/id"},"selector":{"$ref":"#/definitions/selector"},"as":{"enum":["sequence","set"]}}}}},{"type":"object","additionalProperties":false,"required":["edge"],"properties":{"edge":{"$ref":"#/definitions/id"}}},{"type":"object","additionalProperties":false,"required":["period_literal"],"properties":{"period_literal":{"$ref":"urn:financasbot:next:claim-contract:2#/definitions/period"}}},{"type":"object","additionalProperties":false,"required":["ref_set"],"properties":{"ref_set":{"type":"object","additionalProperties":false,"required":["field"],"properties":{"field":{"$ref":"#/definitions/fieldPath"}}}}},{"type":"object","additionalProperties":false,"required":["presence"],"properties":{"presence":{"$ref":"#/definitions/fieldPath"}}},{"type":"object","additionalProperties":false,"required":["period_ref"],"properties":{"period_ref":{"$ref":"#/definitions/id"}}},{"type":"object","additionalProperties":false,"required":["period_bound"],"properties":{"period_bound":{"type":"object","additionalProperties":false,"required":["period","bound"],"properties":{"period":{"$ref":"#/definitions/id"},"bound":{"enum":["start","end"]}}}}}]},"predicate":{"type":"object","additionalProperties":false,"required":["id","obligation","atom","op","args"],"properties":{"id":{"$ref":"#/definitions/id"},"obligation":{"enum":["claim_semantics","node_identity","semantic_integrity","subject_scope","period","time_basis","coverage","evidence_state","evidence_set","economic_links","derivation_trace"]},"atom":{"enum":["claim","identity","fingerprint","subject","period","time_basis","coverage","evidence_state","evidence_set","edge","trace","evaluator"]},"op":{"enum":["eq","not_eq","same_identity","kind_is","state_is","fingerprint_is","date_in_period","period_eq","same_month","range_contains","all_dates_in_period","set_eq","set_subset","cardinality_eq","all_match","none_match","field_eq","join_eq","ref_targets_node","same_field","edge_pair_complete","edge_target_in_set","sum_eq","count_eq","opposite_sign","abs_eq","ordered_by","civil_date_matches","civil_offset_matches","month_bounds_match","day_of_month_matches","inclusive_day_count_matches"]},"args":{"type":"array","minItems":1,"maxItems":5,"items":{"$ref":"#/definitions/arg"}}}},"edge":{"type":"object","additionalProperties":false,"required":["id","source","field","target","relation","proof_predicates"],"properties":{"id":{"$ref":"#/definitions/id"},"source":{"$ref":"#/definitions/id"},"field":{"type":"string","pattern":"^[a-z][a-z0-9_]*$"},"target":{"$ref":"#/definitions/id"},"relation":{"enum":["material_ref","derived_from"]},"proof_predicates":{"type":"array","minItems":1,"uniqueItems":true,"items":{"$ref":"#/definitions/id"}}}},"structural":{"type":"object","additionalProperties":false,"required":["node","operation","segments"],"properties":{"node":{"$ref":"#/definitions/id"},"operation":{"enum":["has","keys","iterator","index","order","membership","cardinality","length","selection","traversal","early_termination"]},"segments":{"type":"array","items":{"type":"string","pattern":"^[a-z][a-z0-9_]*$"}}}},"phase":{"type":"object","additionalProperties":false,"required":["required_nodes","required_reads","required_edges","required_structural","selected_nodes","evidence_set_mode","required_claim_reads","required_selections"],"properties":{"required_nodes":{"type":"array","minItems":0,"uniqueItems":true,"items":{"$ref":"#/definitions/id"}},"required_reads":{"type":"array","minItems":0,"uniqueItems":true,"items":{"$ref":"#/definitions/fieldPath"}},"required_edges":{"type":"array","minItems":0,"uniqueItems":true,"items":{"$ref":"#/definitions/id"}},"required_structural":{"type":"array","minItems":0,"uniqueItems":true,"items":{"$ref":"#/definitions/structural"}},"selected_nodes":{"type":"array","minItems":0,"uniqueItems":true,"items":{"$ref":"#/definitions/id"}},"evidence_set_mode":{"const":"exact"},"required_claim_reads":{"type":"array","uniqueItems":true,"items":{"$ref":"#/definitions/claimPath"}},"required_selections":{"type":"array","uniqueItems":true,"items":{"type":"object","additionalProperties":false,"required":["candidate_set","selected_set"],"properties":{"candidate_set":{"$ref":"#/definitions/id"},"selected_set":{"$ref":"#/definitions/id"}}}}}},"trace":{"type":"object","additionalProperties":false,"required":["derivation","proof","producer","result_channel"],"properties":{"derivation":{"$ref":"#/definitions/phase"},"proof":{"$ref":"#/definitions/phase"},"producer":{"const":"external_recorder"},"result_channel":{"const":"separate_R"}}},"authority":{"type":"object","additionalProperties":false,"required":["path","hash"],"properties":{"path":{"type":"string","pattern":"^docs/contracts/next/provenance-v2/[a-z0-9_./-]+\\.(json|md)$"},"hash":{"$ref":"#/definitions/digest"}}},"gateBinding":{"type":"object","additionalProperties":false,"required":["obligation","predicates","checks"],"properties":{"obligation":{"enum":["claim_semantics","node_identity","semantic_integrity","subject_scope","period","time_basis","coverage","evidence_state","evidence_set","economic_links","derivation_trace"]},"predicates":{"type":"array","minItems":0,"uniqueItems":true,"items":{"$ref":"#/definitions/id"}},"checks":{"type":"array","minItems":0,"uniqueItems":true,"items":{"enum":["claim_registry_binding","snapshot_identity","all_material_fingerprints","typed_subject_binding","typed_period_binding","time_field_reads","source_collection_completeness","typed_evidence_state","exact_evidence_set","all_material_edges","exact_observed_trace","validated_parent_binding"]}}}},"graph":{"type":"object","additionalProperties":false,"required":["fact_key","claim_id","nodes","sets","predicates","edges","obligations","trace_contract","authoring_sources","selections","windows"],"properties":{"fact_key":{"$ref":"#/definitions/factKey"},"claim_id":{"$ref":"#/definitions/sourceRef"},"nodes":{"type":"object","minProperties":1,"propertyNames":{"$ref":"#/definitions/id"},"additionalProperties":{"$ref":"#/definitions/node"}},"sets":{"type":"object","propertyNames":{"$ref":"#/definitions/id"},"additionalProperties":{"type":"array","minItems":0,"uniqueItems":true,"items":{"$ref":"#/definitions/id"}}},"predicates":{"type":"array","minItems":1,"uniqueItems":true,"items":{"$ref":"#/definitions/predicate"}},"edges":{"type":"array","minItems":0,"uniqueItems":true,"items":{"$ref":"#/definitions/edge"}},"obligations":{"type":"array","minItems":11,"uniqueItems":true,"items":{"$ref":"#/definitions/gateBinding"}},"trace_contract":{"$ref":"#/definitions/trace"},"authoring_sources":{"type":"array","minItems":1,"uniqueItems":true,"items":{"type":"object","additionalProperties":false,"required":["path","locator"],"properties":{"path":{"type":"string","minLength":1},"locator":{"type":"string","minLength":1}}}},"selections":{"type":"array","items":{"$ref":"#/definitions/selection"}},"windows":{"type":"object","propertyNames":{"$ref":"#/definitions/id"},"additionalProperties":{"$ref":"#/definitions/window"}}}},"selection":{"type":"object","additionalProperties":false,"required":["candidate_set","selected_set","selected_predicates","excluded"],"properties":{"candidate_set":{"$ref":"#/definitions/id"},"selected_set":{"$ref":"#/definitions/id"},"selected_predicates":{"type":"array","uniqueItems":true,"items":{"$ref":"#/definitions/id"}},"excluded":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["node","reason","predicates"],"properties":{"node":{"$ref":"#/definitions/id"},"reason":{"enum":["period","state","identity","ownership","scope","instrument","plan","merchant","category","budget_class","economic_kind"]},"predicates":{"type":"array","minItems":1,"uniqueItems":true,"items":{"$ref":"#/definitions/id"}}}}},"input_evidence_state":{"enum":["confirmed","projected"]}}},"scalarBinding":{"oneOf":[{"type":"object","additionalProperties":false,"required":["field"],"properties":{"field":{"$ref":"#/definitions/fieldPath"}}},{"type":"object","additionalProperties":false,"required":["claim"],"properties":{"claim":{"$ref":"#/definitions/claimPath"}}},{"type":"object","additionalProperties":false,"required":["literal"],"properties":{"literal":{"$ref":"#/definitions/literal"}}}]},"window":{"oneOf":[{"type":"object","additionalProperties":false,"required":["kind","start","end","start_inclusive","end_inclusive"],"properties":{"kind":{"const":"range"},"start":{"$ref":"#/definitions/scalarBinding"},"end":{"$ref":"#/definitions/scalarBinding"},"start_inclusive":{"type":"boolean"},"end_inclusive":{"type":"boolean"}}},{"type":"object","additionalProperties":false,"required":["kind","value"],"properties":{"kind":{"const":"month"},"value":{"$ref":"#/definitions/scalarBinding"}}}]}}};
const schema226 = {"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"};
const schema227 = {"type":"object","additionalProperties":false,"required":["path","hash"],"properties":{"path":{"type":"string","pattern":"^docs/contracts/next/provenance-v2/[a-z0-9_./-]+\\.(json|md)$"},"hash":{"$ref":"#/definitions/digest"}}};
const schema228 = {"type":"string","pattern":"^sha256:[a-f0-9]{64}$"};
const pattern156 = new RegExp("^docs/contracts/next/provenance-v2/[a-z0-9_./-]+\\.(json|md)$", "u");

function validate88(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.path === undefined) || (!(func0.call(data, "path")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "path"},message:"must have required property '"+"path"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.hash === undefined) || (!(func0.call(data, "hash")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "hash"},message:"must have required property '"+"hash"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!((key0 === "path") || (key0 === "hash"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.path !== undefined && func0.call(data, "path")){
let data0 = data.path;
if(typeof data0 === "string"){
if(!pattern156.test(data0)){
const err3 = {instancePath:instancePath+"/path",schemaPath:"#/properties/path/pattern",keyword:"pattern",params:{pattern: "^docs/contracts/next/provenance-v2/[a-z0-9_./-]+\\.(json|md)$"},message:"must match pattern \""+"^docs/contracts/next/provenance-v2/[a-z0-9_./-]+\\.(json|md)$"+"\""};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
else {
const err4 = {instancePath:instancePath+"/path",schemaPath:"#/properties/path/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.hash !== undefined && func0.call(data, "hash")){
let data1 = data.hash;
if(typeof data1 === "string"){
if(!pattern31.test(data1)){
const err5 = {instancePath:instancePath+"/hash",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/hash",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
else {
const err7 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
validate88.errors = vErrors;
return errors === 0;
}

const schema229 = {"type":"object","additionalProperties":false,"required":["fact_key","claim_id","nodes","sets","predicates","edges","obligations","trace_contract","authoring_sources","selections","windows"],"properties":{"fact_key":{"$ref":"#/definitions/factKey"},"claim_id":{"$ref":"#/definitions/sourceRef"},"nodes":{"type":"object","minProperties":1,"propertyNames":{"$ref":"#/definitions/id"},"additionalProperties":{"$ref":"#/definitions/node"}},"sets":{"type":"object","propertyNames":{"$ref":"#/definitions/id"},"additionalProperties":{"type":"array","minItems":0,"uniqueItems":true,"items":{"$ref":"#/definitions/id"}}},"predicates":{"type":"array","minItems":1,"uniqueItems":true,"items":{"$ref":"#/definitions/predicate"}},"edges":{"type":"array","minItems":0,"uniqueItems":true,"items":{"$ref":"#/definitions/edge"}},"obligations":{"type":"array","minItems":11,"uniqueItems":true,"items":{"$ref":"#/definitions/gateBinding"}},"trace_contract":{"$ref":"#/definitions/trace"},"authoring_sources":{"type":"array","minItems":1,"uniqueItems":true,"items":{"type":"object","additionalProperties":false,"required":["path","locator"],"properties":{"path":{"type":"string","minLength":1},"locator":{"type":"string","minLength":1}}}},"selections":{"type":"array","items":{"$ref":"#/definitions/selection"}},"windows":{"type":"object","propertyNames":{"$ref":"#/definitions/id"},"additionalProperties":{"$ref":"#/definitions/window"}}}};
const schema230 = {"type":"string","pattern":"^[SMFN]-[0-9]{2}#[1-9][0-9]*#[1-9][0-9]*$"};
const schema232 = {"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"};
const schema233 = {"oneOf":[{"type":"object","additionalProperties":false,"required":["binding","ref_id","kind","version","semantic_fingerprint","roles"],"properties":{"binding":{"const":"snapshot"},"ref_id":{"$ref":"#/definitions/sourceRef"},"kind":{"enum":["family","person","account","card","category","event","budget","bill","source_state","proposal","reminder","calendar_event","side_effect","merchant_rule","fixture","collection","source_origin","merchant_identity","transfer_identity","installment_plan","turn","evaluation_policy"]},"version":{"$ref":"#/definitions/digest"},"semantic_fingerprint":{"$ref":"#/definitions/digest"},"roles":{"$ref":"#/definitions/roles"}}},{"type":"object","additionalProperties":false,"required":["binding","kind","fact_key","roles","identity_resolution"],"properties":{"binding":{"const":"validated_parent"},"kind":{"const":"derived_claim"},"fact_key":{"$ref":"#/definitions/factKey"},"roles":{"$ref":"#/definitions/roles"},"identity_resolution":{"const":"same_execution_validated_parent_receipt"}}}]};
const schema237 = {"type":"array","minItems":1,"uniqueItems":true,"items":{"enum":["value_input","scope_proof","coverage_proof","state_proof","link_proof"]}};

function validate95(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.binding === undefined) || (!(func0.call(data, "binding")))){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "binding"},message:"must have required property '"+"binding"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.ref_id === undefined) || (!(func0.call(data, "ref_id")))){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "ref_id"},message:"must have required property '"+"ref_id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err2 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if((data.version === undefined) || (!(func0.call(data, "version")))){
const err3 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if((data.semantic_fingerprint === undefined) || (!(func0.call(data, "semantic_fingerprint")))){
const err4 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "semantic_fingerprint"},message:"must have required property '"+"semantic_fingerprint"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if((data.roles === undefined) || (!(func0.call(data, "roles")))){
const err5 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "roles"},message:"must have required property '"+"roles"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!((((((key0 === "binding") || (key0 === "ref_id")) || (key0 === "kind")) || (key0 === "version")) || (key0 === "semantic_fingerprint")) || (key0 === "roles"))){
const err6 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.binding !== undefined && func0.call(data, "binding")){
if("snapshot" !== data.binding){
const err7 = {instancePath:instancePath+"/binding",schemaPath:"#/oneOf/0/properties/binding/const",keyword:"const",params:{allowedValue: "snapshot"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.ref_id !== undefined && func0.call(data, "ref_id")){
let data1 = data.ref_id;
if(typeof data1 === "string"){
if(!pattern0.test(data1)){
const err8 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/sourceRef/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/ref_id",schemaPath:"#/definitions/sourceRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
let data2 = data.kind;
if(!((((((((((((((((((((((data2 === "family") || (data2 === "person")) || (data2 === "account")) || (data2 === "card")) || (data2 === "category")) || (data2 === "event")) || (data2 === "budget")) || (data2 === "bill")) || (data2 === "source_state")) || (data2 === "proposal")) || (data2 === "reminder")) || (data2 === "calendar_event")) || (data2 === "side_effect")) || (data2 === "merchant_rule")) || (data2 === "fixture")) || (data2 === "collection")) || (data2 === "source_origin")) || (data2 === "merchant_identity")) || (data2 === "transfer_identity")) || (data2 === "installment_plan")) || (data2 === "turn")) || (data2 === "evaluation_policy"))){
const err10 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema233.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.version !== undefined && func0.call(data, "version")){
let data3 = data.version;
if(typeof data3 === "string"){
if(!pattern31.test(data3)){
const err11 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/version",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.semantic_fingerprint !== undefined && func0.call(data, "semantic_fingerprint")){
let data4 = data.semantic_fingerprint;
if(typeof data4 === "string"){
if(!pattern31.test(data4)){
const err13 = {instancePath:instancePath+"/semantic_fingerprint",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
else {
const err14 = {instancePath:instancePath+"/semantic_fingerprint",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.roles !== undefined && func0.call(data, "roles")){
let data5 = data.roles;
if(Array.isArray(data5)){
if(data5.length < 1){
const err15 = {instancePath:instancePath+"/roles",schemaPath:"#/definitions/roles/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
const len0 = data5.length;
for(let i0=0; i0<len0; i0++){
let data6 = data5[i0];
if(!(((((data6 === "value_input") || (data6 === "scope_proof")) || (data6 === "coverage_proof")) || (data6 === "state_proof")) || (data6 === "link_proof"))){
const err16 = {instancePath:instancePath+"/roles/" + i0,schemaPath:"#/definitions/roles/items/enum",keyword:"enum",params:{allowedValues: schema237.items.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
let i1 = data5.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func32(data5[i1], data5[j0])){
const err17 = {instancePath:instancePath+"/roles",schemaPath:"#/definitions/roles/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err18 = {instancePath:instancePath+"/roles",schemaPath:"#/definitions/roles/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
}
else {
const err19 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs19 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.binding === undefined) || (!(func0.call(data, "binding")))){
const err20 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "binding"},message:"must have required property '"+"binding"+"'"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err21 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if((data.fact_key === undefined) || (!(func0.call(data, "fact_key")))){
const err22 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "fact_key"},message:"must have required property '"+"fact_key"+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if((data.roles === undefined) || (!(func0.call(data, "roles")))){
const err23 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "roles"},message:"must have required property '"+"roles"+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if((data.identity_resolution === undefined) || (!(func0.call(data, "identity_resolution")))){
const err24 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "identity_resolution"},message:"must have required property '"+"identity_resolution"+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
for(const key1 of Object.keys(data)){
if(!(((((key1 === "binding") || (key1 === "kind")) || (key1 === "fact_key")) || (key1 === "roles")) || (key1 === "identity_resolution"))){
const err25 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.binding !== undefined && func0.call(data, "binding")){
if("validated_parent" !== data.binding){
const err26 = {instancePath:instancePath+"/binding",schemaPath:"#/oneOf/1/properties/binding/const",keyword:"const",params:{allowedValue: "validated_parent"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("derived_claim" !== data.kind){
const err27 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "derived_claim"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.fact_key !== undefined && func0.call(data, "fact_key")){
let data9 = data.fact_key;
if(typeof data9 === "string"){
if(!pattern2.test(data9)){
const err28 = {instancePath:instancePath+"/fact_key",schemaPath:"#/definitions/factKey/pattern",keyword:"pattern",params:{pattern: "^[SMFN]-[0-9]{2}#[1-9][0-9]*#[1-9][0-9]*$"},message:"must match pattern \""+"^[SMFN]-[0-9]{2}#[1-9][0-9]*#[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
else {
const err29 = {instancePath:instancePath+"/fact_key",schemaPath:"#/definitions/factKey/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.roles !== undefined && func0.call(data, "roles")){
let data10 = data.roles;
if(Array.isArray(data10)){
if(data10.length < 1){
const err30 = {instancePath:instancePath+"/roles",schemaPath:"#/definitions/roles/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
const len1 = data10.length;
for(let i2=0; i2<len1; i2++){
let data11 = data10[i2];
if(!(((((data11 === "value_input") || (data11 === "scope_proof")) || (data11 === "coverage_proof")) || (data11 === "state_proof")) || (data11 === "link_proof"))){
const err31 = {instancePath:instancePath+"/roles/" + i2,schemaPath:"#/definitions/roles/items/enum",keyword:"enum",params:{allowedValues: schema237.items.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
let i3 = data10.length;
let j1;
if(i3 > 1){
outer1:
for(;i3--;){
for(j1 = i3; j1--;){
if(func32(data10[i3], data10[j1])){
const err32 = {instancePath:instancePath+"/roles",schemaPath:"#/definitions/roles/uniqueItems",keyword:"uniqueItems",params:{i: i3, j: j1},message:"must NOT have duplicate items (items ## "+j1+" and "+i3+" are identical)"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
break outer1;
}
}
}
}
}
else {
const err33 = {instancePath:instancePath+"/roles",schemaPath:"#/definitions/roles/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data.identity_resolution !== undefined && func0.call(data, "identity_resolution")){
if("same_execution_validated_parent_receipt" !== data.identity_resolution){
const err34 = {instancePath:instancePath+"/identity_resolution",schemaPath:"#/oneOf/1/properties/identity_resolution/const",keyword:"const",params:{allowedValue: "same_execution_validated_parent_receipt"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
}
else {
const err35 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
var _valid0 = _errs19 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
}
}
if(!valid0){
const err36 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate95.errors = vErrors;
return errors === 0;
}

const schema242 = {"type":"object","additionalProperties":false,"required":["id","obligation","atom","op","args"],"properties":{"id":{"$ref":"#/definitions/id"},"obligation":{"enum":["claim_semantics","node_identity","semantic_integrity","subject_scope","period","time_basis","coverage","evidence_state","evidence_set","economic_links","derivation_trace"]},"atom":{"enum":["claim","identity","fingerprint","subject","period","time_basis","coverage","evidence_state","evidence_set","edge","trace","evaluator"]},"op":{"enum":["eq","not_eq","same_identity","kind_is","state_is","fingerprint_is","date_in_period","period_eq","same_month","range_contains","all_dates_in_period","set_eq","set_subset","cardinality_eq","all_match","none_match","field_eq","join_eq","ref_targets_node","same_field","edge_pair_complete","edge_target_in_set","sum_eq","count_eq","opposite_sign","abs_eq","ordered_by","civil_date_matches","civil_offset_matches","month_bounds_match","day_of_month_matches","inclusive_day_count_matches"]},"args":{"type":"array","minItems":1,"maxItems":5,"items":{"$ref":"#/definitions/arg"}}}};
const schema244 = {"oneOf":[{"type":"object","additionalProperties":false,"required":["node"],"properties":{"node":{"$ref":"#/definitions/id"}}},{"type":"object","additionalProperties":false,"required":["set"],"properties":{"set":{"$ref":"#/definitions/id"}}},{"type":"object","additionalProperties":false,"required":["field"],"properties":{"field":{"$ref":"#/definitions/fieldPath"}}},{"type":"object","additionalProperties":false,"required":["claim"],"properties":{"claim":{"$ref":"#/definitions/claimPath"}}},{"type":"object","additionalProperties":false,"required":["literal"],"properties":{"literal":{"$ref":"#/definitions/literal"}}},{"type":"object","additionalProperties":false,"required":["selector"],"properties":{"selector":{"$ref":"#/definitions/selector"}}},{"type":"object","additionalProperties":false,"required":["template","bindings"],"properties":{"template":{"$ref":"#/definitions/reference"},"bindings":{"type":"object","minProperties":1,"propertyNames":{"$ref":"#/definitions/id"},"additionalProperties":{"$ref":"#/definitions/arg"}}}},{"type":"object","additionalProperties":false,"required":["partial_policy"],"properties":{"partial_policy":{"$ref":"#/definitions/reference"}}},{"type":"object","additionalProperties":false,"required":["sort"],"properties":{"sort":{"$ref":"#/definitions/sort"}}},{"type":"object","additionalProperties":false,"required":["projection"],"properties":{"projection":{"type":"object","additionalProperties":false,"required":["set","selector","as"],"properties":{"set":{"$ref":"#/definitions/id"},"selector":{"$ref":"#/definitions/selector"},"as":{"enum":["sequence","set"]}}}}},{"type":"object","additionalProperties":false,"required":["edge"],"properties":{"edge":{"$ref":"#/definitions/id"}}},{"type":"object","additionalProperties":false,"required":["period_literal"],"properties":{"period_literal":{"$ref":"urn:financasbot:next:claim-contract:2#/definitions/period"}}},{"type":"object","additionalProperties":false,"required":["ref_set"],"properties":{"ref_set":{"type":"object","additionalProperties":false,"required":["field"],"properties":{"field":{"$ref":"#/definitions/fieldPath"}}}}},{"type":"object","additionalProperties":false,"required":["presence"],"properties":{"presence":{"$ref":"#/definitions/fieldPath"}}},{"type":"object","additionalProperties":false,"required":["period_ref"],"properties":{"period_ref":{"$ref":"#/definitions/id"}}},{"type":"object","additionalProperties":false,"required":["period_bound"],"properties":{"period_bound":{"type":"object","additionalProperties":false,"required":["period","bound"],"properties":{"period":{"$ref":"#/definitions/id"},"bound":{"enum":["start","end"]}}}}}]};
const schema249 = {"type":"object","additionalProperties":false,"required":["segments"],"properties":{"segments":{"type":"array","minItems":1,"items":{"type":"string","pattern":"^[a-z][a-z0-9_]*$"}}}};
const schema250 = {"type":"object","additionalProperties":false,"required":["type","value"],"properties":{"type":{"enum":["id","text","date","month","datetime","integer","money_minor","boolean","enum","digest","kind"]},"value":{"type":["string","integer","boolean"]}}};
const schema251 = {"type":"object","additionalProperties":false,"required":["kind","segments"],"properties":{"kind":{"enum":["family","person","account","card","category","event","budget","bill","source_state","proposal","reminder","calendar_event","side_effect","merchant_rule","fixture","collection","source_origin","merchant_identity","transfer_identity","installment_plan","turn","derived_claim","evaluation_policy"]},"segments":{"type":"array","minItems":1,"items":{"type":"string","pattern":"^[a-z][a-z0-9_]*$"}}}};
const schema247 = {"type":"object","additionalProperties":false,"required":["node","segments"],"properties":{"node":{"$ref":"#/definitions/id"},"segments":{"type":"array","minItems":1,"items":{"type":"string","pattern":"^[a-z][a-z0-9_]*$"}}}};

function validate99(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.node === undefined) || (!(func0.call(data, "node")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "node"},message:"must have required property '"+"node"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.segments === undefined) || (!(func0.call(data, "segments")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "segments"},message:"must have required property '"+"segments"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!((key0 === "node") || (key0 === "segments"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.node !== undefined && func0.call(data, "node")){
let data0 = data.node;
if(typeof data0 === "string"){
if(!pattern3.test(data0)){
const err3 = {instancePath:instancePath+"/node",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
else {
const err4 = {instancePath:instancePath+"/node",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.segments !== undefined && func0.call(data, "segments")){
let data1 = data.segments;
if(Array.isArray(data1)){
if(data1.length < 1){
const err5 = {instancePath:instancePath+"/segments",schemaPath:"#/properties/segments/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
const len0 = data1.length;
for(let i0=0; i0<len0; i0++){
let data2 = data1[i0];
if(typeof data2 === "string"){
if(!pattern23.test(data2)){
const err6 = {instancePath:instancePath+"/segments/" + i0,schemaPath:"#/properties/segments/items/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]*$"},message:"must match pattern \""+"^[a-z][a-z0-9_]*$"+"\""};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/segments/" + i0,schemaPath:"#/properties/segments/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
}
else {
const err8 = {instancePath:instancePath+"/segments",schemaPath:"#/properties/segments/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
validate99.errors = vErrors;
return errors === 0;
}

const schema252 = {"type":"object","additionalProperties":false,"required":["id","version","hash"],"properties":{"id":{"$ref":"#/definitions/id"},"version":{"type":"integer","minimum":1},"hash":{"$ref":"#/definitions/digest"}}};

function validate101(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.version === undefined) || (!(func0.call(data, "version")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.hash === undefined) || (!(func0.call(data, "hash")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "hash"},message:"must have required property '"+"hash"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(((key0 === "id") || (key0 === "version")) || (key0 === "hash"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern3.test(data0)){
const err4 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.version !== undefined && func0.call(data, "version")){
let data1 = data.version;
if(!(((typeof data1 == "number") && (!(data1 % 1) && !isNaN(data1))) && (isFinite(data1)))){
const err6 = {instancePath:instancePath+"/version",schemaPath:"#/properties/version/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if((typeof data1 == "number") && (isFinite(data1))){
if(data1 < 1 || isNaN(data1)){
const err7 = {instancePath:instancePath+"/version",schemaPath:"#/properties/version/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
}
if(data.hash !== undefined && func0.call(data, "hash")){
let data2 = data.hash;
if(typeof data2 === "string"){
if(!pattern31.test(data2)){
const err8 = {instancePath:instancePath+"/hash",schemaPath:"#/definitions/digest/pattern",keyword:"pattern",params:{pattern: "^sha256:[a-f0-9]{64}$"},message:"must match pattern \""+"^sha256:[a-f0-9]{64}$"+"\""};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/hash",schemaPath:"#/definitions/digest/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
}
else {
const err10 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
validate101.errors = vErrors;
return errors === 0;
}

const schema256 = {"type":"object","additionalProperties":false,"required":["keys","tie_break"],"properties":{"keys":{"type":"array","minItems":1,"uniqueItems":true,"items":{"type":"object","additionalProperties":false,"required":["selector","direction"],"properties":{"selector":{"$ref":"#/definitions/selector"},"direction":{"enum":["asc","desc"]}}}},"tie_break":{"const":"kind_ref_version"}}};

function validate104(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.keys === undefined) || (!(func0.call(data, "keys")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "keys"},message:"must have required property '"+"keys"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.tie_break === undefined) || (!(func0.call(data, "tie_break")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "tie_break"},message:"must have required property '"+"tie_break"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!((key0 === "keys") || (key0 === "tie_break"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.keys !== undefined && func0.call(data, "keys")){
let data0 = data.keys;
if(Array.isArray(data0)){
if(data0.length < 1){
const err3 = {instancePath:instancePath+"/keys",schemaPath:"#/properties/keys/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
const len0 = data0.length;
for(let i0=0; i0<len0; i0++){
let data1 = data0[i0];
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if((data1.selector === undefined) || (!(func0.call(data1, "selector")))){
const err4 = {instancePath:instancePath+"/keys/" + i0,schemaPath:"#/properties/keys/items/required",keyword:"required",params:{missingProperty: "selector"},message:"must have required property '"+"selector"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if((data1.direction === undefined) || (!(func0.call(data1, "direction")))){
const err5 = {instancePath:instancePath+"/keys/" + i0,schemaPath:"#/properties/keys/items/required",keyword:"required",params:{missingProperty: "direction"},message:"must have required property '"+"direction"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key1 of Object.keys(data1)){
if(!((key1 === "selector") || (key1 === "direction"))){
const err6 = {instancePath:instancePath+"/keys/" + i0,schemaPath:"#/properties/keys/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data1.selector !== undefined && func0.call(data1, "selector")){
let data2 = data1.selector;
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
if((data2.kind === undefined) || (!(func0.call(data2, "kind")))){
const err7 = {instancePath:instancePath+"/keys/" + i0+"/selector",schemaPath:"#/definitions/selector/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if((data2.segments === undefined) || (!(func0.call(data2, "segments")))){
const err8 = {instancePath:instancePath+"/keys/" + i0+"/selector",schemaPath:"#/definitions/selector/required",keyword:"required",params:{missingProperty: "segments"},message:"must have required property '"+"segments"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
for(const key2 of Object.keys(data2)){
if(!((key2 === "kind") || (key2 === "segments"))){
const err9 = {instancePath:instancePath+"/keys/" + i0+"/selector",schemaPath:"#/definitions/selector/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data2.kind !== undefined && func0.call(data2, "kind")){
let data3 = data2.kind;
if(!(((((((((((((((((((((((data3 === "family") || (data3 === "person")) || (data3 === "account")) || (data3 === "card")) || (data3 === "category")) || (data3 === "event")) || (data3 === "budget")) || (data3 === "bill")) || (data3 === "source_state")) || (data3 === "proposal")) || (data3 === "reminder")) || (data3 === "calendar_event")) || (data3 === "side_effect")) || (data3 === "merchant_rule")) || (data3 === "fixture")) || (data3 === "collection")) || (data3 === "source_origin")) || (data3 === "merchant_identity")) || (data3 === "transfer_identity")) || (data3 === "installment_plan")) || (data3 === "turn")) || (data3 === "derived_claim")) || (data3 === "evaluation_policy"))){
const err10 = {instancePath:instancePath+"/keys/" + i0+"/selector/kind",schemaPath:"#/definitions/selector/properties/kind/enum",keyword:"enum",params:{allowedValues: schema251.properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data2.segments !== undefined && func0.call(data2, "segments")){
let data4 = data2.segments;
if(Array.isArray(data4)){
if(data4.length < 1){
const err11 = {instancePath:instancePath+"/keys/" + i0+"/selector/segments",schemaPath:"#/definitions/selector/properties/segments/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
const len1 = data4.length;
for(let i1=0; i1<len1; i1++){
let data5 = data4[i1];
if(typeof data5 === "string"){
if(!pattern23.test(data5)){
const err12 = {instancePath:instancePath+"/keys/" + i0+"/selector/segments/" + i1,schemaPath:"#/definitions/selector/properties/segments/items/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]*$"},message:"must match pattern \""+"^[a-z][a-z0-9_]*$"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/keys/" + i0+"/selector/segments/" + i1,schemaPath:"#/definitions/selector/properties/segments/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
else {
const err14 = {instancePath:instancePath+"/keys/" + i0+"/selector/segments",schemaPath:"#/definitions/selector/properties/segments/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
}
else {
const err15 = {instancePath:instancePath+"/keys/" + i0+"/selector",schemaPath:"#/definitions/selector/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data1.direction !== undefined && func0.call(data1, "direction")){
let data6 = data1.direction;
if(!((data6 === "asc") || (data6 === "desc"))){
const err16 = {instancePath:instancePath+"/keys/" + i0+"/direction",schemaPath:"#/properties/keys/items/properties/direction/enum",keyword:"enum",params:{allowedValues: schema256.properties.keys.items.properties.direction.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
}
else {
const err17 = {instancePath:instancePath+"/keys/" + i0,schemaPath:"#/properties/keys/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
let i2 = data0.length;
let j0;
if(i2 > 1){
outer0:
for(;i2--;){
for(j0 = i2; j0--;){
if(func32(data0[i2], data0[j0])){
const err18 = {instancePath:instancePath+"/keys",schemaPath:"#/properties/keys/uniqueItems",keyword:"uniqueItems",params:{i: i2, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i2+" are identical)"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err19 = {instancePath:instancePath+"/keys",schemaPath:"#/properties/keys/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.tie_break !== undefined && func0.call(data, "tie_break")){
if("kind_ref_version" !== data.tie_break){
const err20 = {instancePath:instancePath+"/tie_break",schemaPath:"#/properties/tie_break/const",keyword:"const",params:{allowedValue: "kind_ref_version"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
else {
const err21 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
validate104.errors = vErrors;
return errors === 0;
}


function validate106(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.value === undefined) || (!(func0.call(data, "value")))){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!((key0 === "kind") || (key0 === "value"))){
const err2 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
let data0 = data.kind;
if(!((((data0 === "date") || (data0 === "as_of")) || (data0 === "through")) || (data0 === "statement_due"))){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema26.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.value !== undefined && func0.call(data, "value")){
let data1 = data.value;
if(typeof data1 === "string"){
if(!pattern12.test(data1)){
const err4 = {instancePath:instancePath+"/value",schemaPath:"#/definitions/date/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"},message:"must match pattern \""+"^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"+"\""};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(!(formats0.validate(data1))){
const err5 = {instancePath:instancePath+"/value",schemaPath:"#/definitions/date/format",keyword:"format",params:{format: "date"},message:"must match format \""+"date"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/value",schemaPath:"#/definitions/date/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
else {
const err7 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs8 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err8 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if((data.value === undefined) || (!(func0.call(data, "value")))){
const err9 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
for(const key1 of Object.keys(data)){
if(!((key1 === "kind") || (key1 === "value"))){
const err10 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
let data2 = data.kind;
if(!(((data2 === "month") || (data2 === "statement_competence")) || (data2 === "budget_cycle"))){
const err11 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema26.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.value !== undefined && func0.call(data, "value")){
let data3 = data.value;
if(typeof data3 === "string"){
if(!pattern13.test(data3)){
const err12 = {instancePath:instancePath+"/value",schemaPath:"#/definitions/month/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$"},message:"must match pattern \""+"^[0-9]{4}-(0[1-9]|1[0-2])$"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/value",schemaPath:"#/definitions/month/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
else {
const err14 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
var _valid0 = _errs8 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
}
const _errs15 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err15 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if((data.start === undefined) || (!(func0.call(data, "start")))){
const err16 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "start"},message:"must have required property '"+"start"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if((data.end === undefined) || (!(func0.call(data, "end")))){
const err17 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "end"},message:"must have required property '"+"end"+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if((data.start_inclusive === undefined) || (!(func0.call(data, "start_inclusive")))){
const err18 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "start_inclusive"},message:"must have required property '"+"start_inclusive"+"'"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if((data.end_inclusive === undefined) || (!(func0.call(data, "end_inclusive")))){
const err19 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "end_inclusive"},message:"must have required property '"+"end_inclusive"+"'"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
for(const key2 of Object.keys(data)){
if(!(((((key2 === "kind") || (key2 === "start")) || (key2 === "end")) || (key2 === "start_inclusive")) || (key2 === "end_inclusive"))){
const err20 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("range" !== data.kind){
const err21 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "range"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.start !== undefined && func0.call(data, "start")){
let data5 = data.start;
if(typeof data5 === "string"){
if(!pattern12.test(data5)){
const err22 = {instancePath:instancePath+"/start",schemaPath:"#/definitions/date/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"},message:"must match pattern \""+"^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"+"\""};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(!(formats0.validate(data5))){
const err23 = {instancePath:instancePath+"/start",schemaPath:"#/definitions/date/format",keyword:"format",params:{format: "date"},message:"must match format \""+"date"+"\""};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
else {
const err24 = {instancePath:instancePath+"/start",schemaPath:"#/definitions/date/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data.end !== undefined && func0.call(data, "end")){
let data6 = data.end;
if(typeof data6 === "string"){
if(!pattern12.test(data6)){
const err25 = {instancePath:instancePath+"/end",schemaPath:"#/definitions/date/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"},message:"must match pattern \""+"^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"+"\""};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(!(formats0.validate(data6))){
const err26 = {instancePath:instancePath+"/end",schemaPath:"#/definitions/date/format",keyword:"format",params:{format: "date"},message:"must match format \""+"date"+"\""};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
else {
const err27 = {instancePath:instancePath+"/end",schemaPath:"#/definitions/date/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.start_inclusive !== undefined && func0.call(data, "start_inclusive")){
if(typeof data.start_inclusive !== "boolean"){
const err28 = {instancePath:instancePath+"/start_inclusive",schemaPath:"#/oneOf/2/properties/start_inclusive/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data.end_inclusive !== undefined && func0.call(data, "end_inclusive")){
if(typeof data.end_inclusive !== "boolean"){
const err29 = {instancePath:instancePath+"/end_inclusive",schemaPath:"#/oneOf/2/properties/end_inclusive/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
}
else {
const err30 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
var _valid0 = _errs15 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
}
const _errs29 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err31 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
if((data.snapshot_version === undefined) || (!(func0.call(data, "snapshot_version")))){
const err32 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "snapshot_version"},message:"must have required property '"+"snapshot_version"+"'"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
for(const key3 of Object.keys(data)){
if(!((key3 === "kind") || (key3 === "snapshot_version"))){
const err33 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("registry_snapshot" !== data.kind){
const err34 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/const",keyword:"const",params:{allowedValue: "registry_snapshot"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data.snapshot_version !== undefined && func0.call(data, "snapshot_version")){
let data10 = data.snapshot_version;
if(typeof data10 === "string"){
if(!pattern0.test(data10)){
const err35 = {instancePath:instancePath+"/snapshot_version",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
else {
const err36 = {instancePath:instancePath+"/snapshot_version",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
}
else {
const err37 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
var _valid0 = _errs29 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
}
const _errs36 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err38 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
if((data.turn_id === undefined) || (!(func0.call(data, "turn_id")))){
const err39 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "turn_id"},message:"must have required property '"+"turn_id"+"'"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
for(const key4 of Object.keys(data)){
if(!((key4 === "kind") || (key4 === "turn_id"))){
const err40 = {instancePath,schemaPath:"#/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("request_execution" !== data.kind){
const err41 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/4/properties/kind/const",keyword:"const",params:{allowedValue: "request_execution"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
if(data.turn_id !== undefined && func0.call(data, "turn_id")){
let data12 = data.turn_id;
if(typeof data12 === "string"){
if(!pattern17.test(data12)){
const err42 = {instancePath:instancePath+"/turn_id",schemaPath:"#/oneOf/4/properties/turn_id/pattern",keyword:"pattern",params:{pattern: "^[SMFN]-[0-9]{2}#[1-9][0-9]*$"},message:"must match pattern \""+"^[SMFN]-[0-9]{2}#[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
else {
const err43 = {instancePath:instancePath+"/turn_id",schemaPath:"#/oneOf/4/properties/turn_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
}
else {
const err44 = {instancePath,schemaPath:"#/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
var _valid0 = _errs36 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid0 = true;
passing0 = 4;
}
}
}
}
}
if(!valid0){
const err45 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate106.errors = vErrors;
return errors === 0;
}

const wrapper0 = {validate: validate98};

function validate98(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.node === undefined) || (!(func0.call(data, "node")))){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "node"},message:"must have required property '"+"node"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(key0 === "node")){
const err1 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.node !== undefined && func0.call(data, "node")){
let data0 = data.node;
if(typeof data0 === "string"){
if(!pattern3.test(data0)){
const err2 = {instancePath:instancePath+"/node",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
else {
const err3 = {instancePath:instancePath+"/node",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
}
else {
const err4 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs7 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.set === undefined) || (!(func0.call(data, "set")))){
const err5 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "set"},message:"must have required property '"+"set"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key1 of Object.keys(data)){
if(!(key1 === "set")){
const err6 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.set !== undefined && func0.call(data, "set")){
let data1 = data.set;
if(typeof data1 === "string"){
if(!pattern3.test(data1)){
const err7 = {instancePath:instancePath+"/set",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/set",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
var _valid0 = _errs7 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
}
const _errs13 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.field === undefined) || (!(func0.call(data, "field")))){
const err10 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "field"},message:"must have required property '"+"field"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
for(const key2 of Object.keys(data)){
if(!(key2 === "field")){
const err11 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.field !== undefined && func0.call(data, "field")){
if(!(validate99(data.field, {instancePath:instancePath+"/field",parentData:data,parentDataProperty:"field",rootData}))){
vErrors = vErrors === null ? validate99.errors : vErrors.concat(validate99.errors);
errors = vErrors.length;
}
}
}
else {
const err12 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
var _valid0 = _errs13 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
}
const _errs17 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.claim === undefined) || (!(func0.call(data, "claim")))){
const err13 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "claim"},message:"must have required property '"+"claim"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
for(const key3 of Object.keys(data)){
if(!(key3 === "claim")){
const err14 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.claim !== undefined && func0.call(data, "claim")){
let data3 = data.claim;
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
if((data3.segments === undefined) || (!(func0.call(data3, "segments")))){
const err15 = {instancePath:instancePath+"/claim",schemaPath:"#/definitions/claimPath/required",keyword:"required",params:{missingProperty: "segments"},message:"must have required property '"+"segments"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
for(const key4 of Object.keys(data3)){
if(!(key4 === "segments")){
const err16 = {instancePath:instancePath+"/claim",schemaPath:"#/definitions/claimPath/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data3.segments !== undefined && func0.call(data3, "segments")){
let data4 = data3.segments;
if(Array.isArray(data4)){
if(data4.length < 1){
const err17 = {instancePath:instancePath+"/claim/segments",schemaPath:"#/definitions/claimPath/properties/segments/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
const len0 = data4.length;
for(let i0=0; i0<len0; i0++){
let data5 = data4[i0];
if(typeof data5 === "string"){
if(!pattern23.test(data5)){
const err18 = {instancePath:instancePath+"/claim/segments/" + i0,schemaPath:"#/definitions/claimPath/properties/segments/items/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]*$"},message:"must match pattern \""+"^[a-z][a-z0-9_]*$"+"\""};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
else {
const err19 = {instancePath:instancePath+"/claim/segments/" + i0,schemaPath:"#/definitions/claimPath/properties/segments/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
}
else {
const err20 = {instancePath:instancePath+"/claim/segments",schemaPath:"#/definitions/claimPath/properties/segments/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
else {
const err21 = {instancePath:instancePath+"/claim",schemaPath:"#/definitions/claimPath/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
}
else {
const err22 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
var _valid0 = _errs17 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
}
const _errs28 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.literal === undefined) || (!(func0.call(data, "literal")))){
const err23 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "literal"},message:"must have required property '"+"literal"+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
for(const key5 of Object.keys(data)){
if(!(key5 === "literal")){
const err24 = {instancePath,schemaPath:"#/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data.literal !== undefined && func0.call(data, "literal")){
let data6 = data.literal;
if(data6 && typeof data6 == "object" && !Array.isArray(data6)){
if((data6.type === undefined) || (!(func0.call(data6, "type")))){
const err25 = {instancePath:instancePath+"/literal",schemaPath:"#/definitions/literal/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if((data6.value === undefined) || (!(func0.call(data6, "value")))){
const err26 = {instancePath:instancePath+"/literal",schemaPath:"#/definitions/literal/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
for(const key6 of Object.keys(data6)){
if(!((key6 === "type") || (key6 === "value"))){
const err27 = {instancePath:instancePath+"/literal",schemaPath:"#/definitions/literal/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data6.type !== undefined && func0.call(data6, "type")){
let data7 = data6.type;
if(!(((((((((((data7 === "id") || (data7 === "text")) || (data7 === "date")) || (data7 === "month")) || (data7 === "datetime")) || (data7 === "integer")) || (data7 === "money_minor")) || (data7 === "boolean")) || (data7 === "enum")) || (data7 === "digest")) || (data7 === "kind"))){
const err28 = {instancePath:instancePath+"/literal/type",schemaPath:"#/definitions/literal/properties/type/enum",keyword:"enum",params:{allowedValues: schema250.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data6.value !== undefined && func0.call(data6, "value")){
let data8 = data6.value;
if(((typeof data8 !== "string") && (!(((typeof data8 == "number") && (!(data8 % 1) && !isNaN(data8))) && (isFinite(data8))))) && (typeof data8 !== "boolean")){
const err29 = {instancePath:instancePath+"/literal/value",schemaPath:"#/definitions/literal/properties/value/type",keyword:"type",params:{type: schema250.properties.value.type},message:"must be string,integer,boolean"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
}
else {
const err30 = {instancePath:instancePath+"/literal",schemaPath:"#/definitions/literal/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
}
else {
const err31 = {instancePath,schemaPath:"#/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
var _valid0 = _errs28 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid0 = true;
passing0 = 4;
}
const _errs38 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.selector === undefined) || (!(func0.call(data, "selector")))){
const err32 = {instancePath,schemaPath:"#/oneOf/5/required",keyword:"required",params:{missingProperty: "selector"},message:"must have required property '"+"selector"+"'"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
for(const key7 of Object.keys(data)){
if(!(key7 === "selector")){
const err33 = {instancePath,schemaPath:"#/oneOf/5/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data.selector !== undefined && func0.call(data, "selector")){
let data9 = data.selector;
if(data9 && typeof data9 == "object" && !Array.isArray(data9)){
if((data9.kind === undefined) || (!(func0.call(data9, "kind")))){
const err34 = {instancePath:instancePath+"/selector",schemaPath:"#/definitions/selector/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
if((data9.segments === undefined) || (!(func0.call(data9, "segments")))){
const err35 = {instancePath:instancePath+"/selector",schemaPath:"#/definitions/selector/required",keyword:"required",params:{missingProperty: "segments"},message:"must have required property '"+"segments"+"'"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
for(const key8 of Object.keys(data9)){
if(!((key8 === "kind") || (key8 === "segments"))){
const err36 = {instancePath:instancePath+"/selector",schemaPath:"#/definitions/selector/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
if(data9.kind !== undefined && func0.call(data9, "kind")){
let data10 = data9.kind;
if(!(((((((((((((((((((((((data10 === "family") || (data10 === "person")) || (data10 === "account")) || (data10 === "card")) || (data10 === "category")) || (data10 === "event")) || (data10 === "budget")) || (data10 === "bill")) || (data10 === "source_state")) || (data10 === "proposal")) || (data10 === "reminder")) || (data10 === "calendar_event")) || (data10 === "side_effect")) || (data10 === "merchant_rule")) || (data10 === "fixture")) || (data10 === "collection")) || (data10 === "source_origin")) || (data10 === "merchant_identity")) || (data10 === "transfer_identity")) || (data10 === "installment_plan")) || (data10 === "turn")) || (data10 === "derived_claim")) || (data10 === "evaluation_policy"))){
const err37 = {instancePath:instancePath+"/selector/kind",schemaPath:"#/definitions/selector/properties/kind/enum",keyword:"enum",params:{allowedValues: schema251.properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
if(data9.segments !== undefined && func0.call(data9, "segments")){
let data11 = data9.segments;
if(Array.isArray(data11)){
if(data11.length < 1){
const err38 = {instancePath:instancePath+"/selector/segments",schemaPath:"#/definitions/selector/properties/segments/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
const len1 = data11.length;
for(let i1=0; i1<len1; i1++){
let data12 = data11[i1];
if(typeof data12 === "string"){
if(!pattern23.test(data12)){
const err39 = {instancePath:instancePath+"/selector/segments/" + i1,schemaPath:"#/definitions/selector/properties/segments/items/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]*$"},message:"must match pattern \""+"^[a-z][a-z0-9_]*$"+"\""};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
else {
const err40 = {instancePath:instancePath+"/selector/segments/" + i1,schemaPath:"#/definitions/selector/properties/segments/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
}
else {
const err41 = {instancePath:instancePath+"/selector/segments",schemaPath:"#/definitions/selector/properties/segments/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
}
else {
const err42 = {instancePath:instancePath+"/selector",schemaPath:"#/definitions/selector/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
}
else {
const err43 = {instancePath,schemaPath:"#/oneOf/5/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
var _valid0 = _errs38 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 5];
}
else {
if(_valid0){
valid0 = true;
passing0 = 5;
}
const _errs50 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.template === undefined) || (!(func0.call(data, "template")))){
const err44 = {instancePath,schemaPath:"#/oneOf/6/required",keyword:"required",params:{missingProperty: "template"},message:"must have required property '"+"template"+"'"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if((data.bindings === undefined) || (!(func0.call(data, "bindings")))){
const err45 = {instancePath,schemaPath:"#/oneOf/6/required",keyword:"required",params:{missingProperty: "bindings"},message:"must have required property '"+"bindings"+"'"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
for(const key9 of Object.keys(data)){
if(!((key9 === "template") || (key9 === "bindings"))){
const err46 = {instancePath,schemaPath:"#/oneOf/6/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key9},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
if(data.template !== undefined && func0.call(data, "template")){
if(!(validate101(data.template, {instancePath:instancePath+"/template",parentData:data,parentDataProperty:"template",rootData}))){
vErrors = vErrors === null ? validate101.errors : vErrors.concat(validate101.errors);
errors = vErrors.length;
}
}
if(data.bindings !== undefined && func0.call(data, "bindings")){
let data14 = data.bindings;
if(data14 && typeof data14 == "object" && !Array.isArray(data14)){
if(Object.keys(data14).length < 1){
const err47 = {instancePath:instancePath+"/bindings",schemaPath:"#/oneOf/6/properties/bindings/minProperties",keyword:"minProperties",params:{limit: 1},message:"must NOT have fewer than 1 properties"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
for(const key10 of Object.keys(data14)){
const _errs56 = errors;
if(typeof key10 === "string"){
if(!pattern3.test(key10)){
const err48 = {instancePath:instancePath+"/bindings",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\"",propertyName:key10};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
else {
const err49 = {instancePath:instancePath+"/bindings",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string",propertyName:key10};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
var valid20 = _errs56 === errors;
if(!valid20){
const err50 = {instancePath:instancePath+"/bindings",schemaPath:"#/oneOf/6/properties/bindings/propertyNames",keyword:"propertyNames",params:{propertyName: key10},message:"property name must be valid"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
for(const key11 of Object.keys(data14)){
if(!(wrapper0.validate(data14[key11], {instancePath:instancePath+"/bindings/" + key11.replace(/~/g, "~0").replace(/\//g, "~1"),parentData:data14,parentDataProperty:key11,rootData}))){
vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
errors = vErrors.length;
}
}
}
else {
const err51 = {instancePath:instancePath+"/bindings",schemaPath:"#/oneOf/6/properties/bindings/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
}
else {
const err52 = {instancePath,schemaPath:"#/oneOf/6/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
var _valid0 = _errs50 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 6];
}
else {
if(_valid0){
valid0 = true;
passing0 = 6;
}
const _errs61 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.partial_policy === undefined) || (!(func0.call(data, "partial_policy")))){
const err53 = {instancePath,schemaPath:"#/oneOf/7/required",keyword:"required",params:{missingProperty: "partial_policy"},message:"must have required property '"+"partial_policy"+"'"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
for(const key12 of Object.keys(data)){
if(!(key12 === "partial_policy")){
const err54 = {instancePath,schemaPath:"#/oneOf/7/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key12},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
if(data.partial_policy !== undefined && func0.call(data, "partial_policy")){
if(!(validate101(data.partial_policy, {instancePath:instancePath+"/partial_policy",parentData:data,parentDataProperty:"partial_policy",rootData}))){
vErrors = vErrors === null ? validate101.errors : vErrors.concat(validate101.errors);
errors = vErrors.length;
}
}
}
else {
const err55 = {instancePath,schemaPath:"#/oneOf/7/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
var _valid0 = _errs61 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 7];
}
else {
if(_valid0){
valid0 = true;
passing0 = 7;
}
const _errs65 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.sort === undefined) || (!(func0.call(data, "sort")))){
const err56 = {instancePath,schemaPath:"#/oneOf/8/required",keyword:"required",params:{missingProperty: "sort"},message:"must have required property '"+"sort"+"'"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
for(const key13 of Object.keys(data)){
if(!(key13 === "sort")){
const err57 = {instancePath,schemaPath:"#/oneOf/8/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key13},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
}
if(data.sort !== undefined && func0.call(data, "sort")){
if(!(validate104(data.sort, {instancePath:instancePath+"/sort",parentData:data,parentDataProperty:"sort",rootData}))){
vErrors = vErrors === null ? validate104.errors : vErrors.concat(validate104.errors);
errors = vErrors.length;
}
}
}
else {
const err58 = {instancePath,schemaPath:"#/oneOf/8/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
var _valid0 = _errs65 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 8];
}
else {
if(_valid0){
valid0 = true;
passing0 = 8;
}
const _errs69 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.projection === undefined) || (!(func0.call(data, "projection")))){
const err59 = {instancePath,schemaPath:"#/oneOf/9/required",keyword:"required",params:{missingProperty: "projection"},message:"must have required property '"+"projection"+"'"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
for(const key14 of Object.keys(data)){
if(!(key14 === "projection")){
const err60 = {instancePath,schemaPath:"#/oneOf/9/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key14},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
if(data.projection !== undefined && func0.call(data, "projection")){
let data18 = data.projection;
if(data18 && typeof data18 == "object" && !Array.isArray(data18)){
if((data18.set === undefined) || (!(func0.call(data18, "set")))){
const err61 = {instancePath:instancePath+"/projection",schemaPath:"#/oneOf/9/properties/projection/required",keyword:"required",params:{missingProperty: "set"},message:"must have required property '"+"set"+"'"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
if((data18.selector === undefined) || (!(func0.call(data18, "selector")))){
const err62 = {instancePath:instancePath+"/projection",schemaPath:"#/oneOf/9/properties/projection/required",keyword:"required",params:{missingProperty: "selector"},message:"must have required property '"+"selector"+"'"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
if((data18.as === undefined) || (!(func0.call(data18, "as")))){
const err63 = {instancePath:instancePath+"/projection",schemaPath:"#/oneOf/9/properties/projection/required",keyword:"required",params:{missingProperty: "as"},message:"must have required property '"+"as"+"'"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
for(const key15 of Object.keys(data18)){
if(!(((key15 === "set") || (key15 === "selector")) || (key15 === "as"))){
const err64 = {instancePath:instancePath+"/projection",schemaPath:"#/oneOf/9/properties/projection/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key15},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
if(data18.set !== undefined && func0.call(data18, "set")){
let data19 = data18.set;
if(typeof data19 === "string"){
if(!pattern3.test(data19)){
const err65 = {instancePath:instancePath+"/projection/set",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
}
else {
const err66 = {instancePath:instancePath+"/projection/set",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
}
if(data18.selector !== undefined && func0.call(data18, "selector")){
let data20 = data18.selector;
if(data20 && typeof data20 == "object" && !Array.isArray(data20)){
if((data20.kind === undefined) || (!(func0.call(data20, "kind")))){
const err67 = {instancePath:instancePath+"/projection/selector",schemaPath:"#/definitions/selector/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
if((data20.segments === undefined) || (!(func0.call(data20, "segments")))){
const err68 = {instancePath:instancePath+"/projection/selector",schemaPath:"#/definitions/selector/required",keyword:"required",params:{missingProperty: "segments"},message:"must have required property '"+"segments"+"'"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
for(const key16 of Object.keys(data20)){
if(!((key16 === "kind") || (key16 === "segments"))){
const err69 = {instancePath:instancePath+"/projection/selector",schemaPath:"#/definitions/selector/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key16},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
}
if(data20.kind !== undefined && func0.call(data20, "kind")){
let data21 = data20.kind;
if(!(((((((((((((((((((((((data21 === "family") || (data21 === "person")) || (data21 === "account")) || (data21 === "card")) || (data21 === "category")) || (data21 === "event")) || (data21 === "budget")) || (data21 === "bill")) || (data21 === "source_state")) || (data21 === "proposal")) || (data21 === "reminder")) || (data21 === "calendar_event")) || (data21 === "side_effect")) || (data21 === "merchant_rule")) || (data21 === "fixture")) || (data21 === "collection")) || (data21 === "source_origin")) || (data21 === "merchant_identity")) || (data21 === "transfer_identity")) || (data21 === "installment_plan")) || (data21 === "turn")) || (data21 === "derived_claim")) || (data21 === "evaluation_policy"))){
const err70 = {instancePath:instancePath+"/projection/selector/kind",schemaPath:"#/definitions/selector/properties/kind/enum",keyword:"enum",params:{allowedValues: schema251.properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
}
if(data20.segments !== undefined && func0.call(data20, "segments")){
let data22 = data20.segments;
if(Array.isArray(data22)){
if(data22.length < 1){
const err71 = {instancePath:instancePath+"/projection/selector/segments",schemaPath:"#/definitions/selector/properties/segments/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
const len2 = data22.length;
for(let i2=0; i2<len2; i2++){
let data23 = data22[i2];
if(typeof data23 === "string"){
if(!pattern23.test(data23)){
const err72 = {instancePath:instancePath+"/projection/selector/segments/" + i2,schemaPath:"#/definitions/selector/properties/segments/items/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]*$"},message:"must match pattern \""+"^[a-z][a-z0-9_]*$"+"\""};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
}
else {
const err73 = {instancePath:instancePath+"/projection/selector/segments/" + i2,schemaPath:"#/definitions/selector/properties/segments/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
}
}
else {
const err74 = {instancePath:instancePath+"/projection/selector/segments",schemaPath:"#/definitions/selector/properties/segments/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
}
}
else {
const err75 = {instancePath:instancePath+"/projection/selector",schemaPath:"#/definitions/selector/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
}
if(data18.as !== undefined && func0.call(data18, "as")){
let data24 = data18.as;
if(!((data24 === "sequence") || (data24 === "set"))){
const err76 = {instancePath:instancePath+"/projection/as",schemaPath:"#/oneOf/9/properties/projection/properties/as/enum",keyword:"enum",params:{allowedValues: schema244.oneOf[9].properties.projection.properties.as.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
}
}
else {
const err77 = {instancePath:instancePath+"/projection",schemaPath:"#/oneOf/9/properties/projection/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
}
}
else {
const err78 = {instancePath,schemaPath:"#/oneOf/9/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
var _valid0 = _errs69 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 9];
}
else {
if(_valid0){
valid0 = true;
passing0 = 9;
}
const _errs88 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.edge === undefined) || (!(func0.call(data, "edge")))){
const err79 = {instancePath,schemaPath:"#/oneOf/10/required",keyword:"required",params:{missingProperty: "edge"},message:"must have required property '"+"edge"+"'"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
for(const key17 of Object.keys(data)){
if(!(key17 === "edge")){
const err80 = {instancePath,schemaPath:"#/oneOf/10/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key17},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
}
if(data.edge !== undefined && func0.call(data, "edge")){
let data25 = data.edge;
if(typeof data25 === "string"){
if(!pattern3.test(data25)){
const err81 = {instancePath:instancePath+"/edge",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
}
else {
const err82 = {instancePath:instancePath+"/edge",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
}
}
else {
const err83 = {instancePath,schemaPath:"#/oneOf/10/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
var _valid0 = _errs88 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 10];
}
else {
if(_valid0){
valid0 = true;
passing0 = 10;
}
const _errs94 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.period_literal === undefined) || (!(func0.call(data, "period_literal")))){
const err84 = {instancePath,schemaPath:"#/oneOf/11/required",keyword:"required",params:{missingProperty: "period_literal"},message:"must have required property '"+"period_literal"+"'"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
for(const key18 of Object.keys(data)){
if(!(key18 === "period_literal")){
const err85 = {instancePath,schemaPath:"#/oneOf/11/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key18},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
}
if(data.period_literal !== undefined && func0.call(data, "period_literal")){
if(!(validate106(data.period_literal, {instancePath:instancePath+"/period_literal",parentData:data,parentDataProperty:"period_literal",rootData}))){
vErrors = vErrors === null ? validate106.errors : vErrors.concat(validate106.errors);
errors = vErrors.length;
}
}
}
else {
const err86 = {instancePath,schemaPath:"#/oneOf/11/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
var _valid0 = _errs94 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 11];
}
else {
if(_valid0){
valid0 = true;
passing0 = 11;
}
const _errs98 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.ref_set === undefined) || (!(func0.call(data, "ref_set")))){
const err87 = {instancePath,schemaPath:"#/oneOf/12/required",keyword:"required",params:{missingProperty: "ref_set"},message:"must have required property '"+"ref_set"+"'"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
for(const key19 of Object.keys(data)){
if(!(key19 === "ref_set")){
const err88 = {instancePath,schemaPath:"#/oneOf/12/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key19},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
}
if(data.ref_set !== undefined && func0.call(data, "ref_set")){
let data27 = data.ref_set;
if(data27 && typeof data27 == "object" && !Array.isArray(data27)){
if((data27.field === undefined) || (!(func0.call(data27, "field")))){
const err89 = {instancePath:instancePath+"/ref_set",schemaPath:"#/oneOf/12/properties/ref_set/required",keyword:"required",params:{missingProperty: "field"},message:"must have required property '"+"field"+"'"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
for(const key20 of Object.keys(data27)){
if(!(key20 === "field")){
const err90 = {instancePath:instancePath+"/ref_set",schemaPath:"#/oneOf/12/properties/ref_set/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key20},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
}
if(data27.field !== undefined && func0.call(data27, "field")){
if(!(validate99(data27.field, {instancePath:instancePath+"/ref_set/field",parentData:data27,parentDataProperty:"field",rootData}))){
vErrors = vErrors === null ? validate99.errors : vErrors.concat(validate99.errors);
errors = vErrors.length;
}
}
}
else {
const err91 = {instancePath:instancePath+"/ref_set",schemaPath:"#/oneOf/12/properties/ref_set/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
}
}
else {
const err92 = {instancePath,schemaPath:"#/oneOf/12/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
var _valid0 = _errs98 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 12];
}
else {
if(_valid0){
valid0 = true;
passing0 = 12;
}
const _errs105 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.presence === undefined) || (!(func0.call(data, "presence")))){
const err93 = {instancePath,schemaPath:"#/oneOf/13/required",keyword:"required",params:{missingProperty: "presence"},message:"must have required property '"+"presence"+"'"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
for(const key21 of Object.keys(data)){
if(!(key21 === "presence")){
const err94 = {instancePath,schemaPath:"#/oneOf/13/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key21},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
}
if(data.presence !== undefined && func0.call(data, "presence")){
if(!(validate99(data.presence, {instancePath:instancePath+"/presence",parentData:data,parentDataProperty:"presence",rootData}))){
vErrors = vErrors === null ? validate99.errors : vErrors.concat(validate99.errors);
errors = vErrors.length;
}
}
}
else {
const err95 = {instancePath,schemaPath:"#/oneOf/13/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
var _valid0 = _errs105 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 13];
}
else {
if(_valid0){
valid0 = true;
passing0 = 13;
}
const _errs109 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.period_ref === undefined) || (!(func0.call(data, "period_ref")))){
const err96 = {instancePath,schemaPath:"#/oneOf/14/required",keyword:"required",params:{missingProperty: "period_ref"},message:"must have required property '"+"period_ref"+"'"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
for(const key22 of Object.keys(data)){
if(!(key22 === "period_ref")){
const err97 = {instancePath,schemaPath:"#/oneOf/14/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key22},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
}
if(data.period_ref !== undefined && func0.call(data, "period_ref")){
let data30 = data.period_ref;
if(typeof data30 === "string"){
if(!pattern3.test(data30)){
const err98 = {instancePath:instancePath+"/period_ref",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
}
else {
const err99 = {instancePath:instancePath+"/period_ref",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
}
}
else {
const err100 = {instancePath,schemaPath:"#/oneOf/14/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
var _valid0 = _errs109 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 14];
}
else {
if(_valid0){
valid0 = true;
passing0 = 14;
}
const _errs115 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.period_bound === undefined) || (!(func0.call(data, "period_bound")))){
const err101 = {instancePath,schemaPath:"#/oneOf/15/required",keyword:"required",params:{missingProperty: "period_bound"},message:"must have required property '"+"period_bound"+"'"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
for(const key23 of Object.keys(data)){
if(!(key23 === "period_bound")){
const err102 = {instancePath,schemaPath:"#/oneOf/15/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key23},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
}
if(data.period_bound !== undefined && func0.call(data, "period_bound")){
let data31 = data.period_bound;
if(data31 && typeof data31 == "object" && !Array.isArray(data31)){
if((data31.period === undefined) || (!(func0.call(data31, "period")))){
const err103 = {instancePath:instancePath+"/period_bound",schemaPath:"#/oneOf/15/properties/period_bound/required",keyword:"required",params:{missingProperty: "period"},message:"must have required property '"+"period"+"'"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
if((data31.bound === undefined) || (!(func0.call(data31, "bound")))){
const err104 = {instancePath:instancePath+"/period_bound",schemaPath:"#/oneOf/15/properties/period_bound/required",keyword:"required",params:{missingProperty: "bound"},message:"must have required property '"+"bound"+"'"};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
}
for(const key24 of Object.keys(data31)){
if(!((key24 === "period") || (key24 === "bound"))){
const err105 = {instancePath:instancePath+"/period_bound",schemaPath:"#/oneOf/15/properties/period_bound/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key24},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err105];
}
else {
vErrors.push(err105);
}
errors++;
}
}
if(data31.period !== undefined && func0.call(data31, "period")){
let data32 = data31.period;
if(typeof data32 === "string"){
if(!pattern3.test(data32)){
const err106 = {instancePath:instancePath+"/period_bound/period",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
}
else {
const err107 = {instancePath:instancePath+"/period_bound/period",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err107];
}
else {
vErrors.push(err107);
}
errors++;
}
}
if(data31.bound !== undefined && func0.call(data31, "bound")){
let data33 = data31.bound;
if(!((data33 === "start") || (data33 === "end"))){
const err108 = {instancePath:instancePath+"/period_bound/bound",schemaPath:"#/oneOf/15/properties/period_bound/properties/bound/enum",keyword:"enum",params:{allowedValues: schema244.oneOf[15].properties.period_bound.properties.bound.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err108];
}
else {
vErrors.push(err108);
}
errors++;
}
}
}
else {
const err109 = {instancePath:instancePath+"/period_bound",schemaPath:"#/oneOf/15/properties/period_bound/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err109];
}
else {
vErrors.push(err109);
}
errors++;
}
}
}
else {
const err110 = {instancePath,schemaPath:"#/oneOf/15/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err110];
}
else {
vErrors.push(err110);
}
errors++;
}
var _valid0 = _errs115 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 15];
}
else {
if(_valid0){
valid0 = true;
passing0 = 15;
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
}
if(!valid0){
const err111 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err111];
}
else {
vErrors.push(err111);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate98.errors = vErrors;
return errors === 0;
}


function validate97(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.obligation === undefined) || (!(func0.call(data, "obligation")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "obligation"},message:"must have required property '"+"obligation"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.atom === undefined) || (!(func0.call(data, "atom")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "atom"},message:"must have required property '"+"atom"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if((data.op === undefined) || (!(func0.call(data, "op")))){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "op"},message:"must have required property '"+"op"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if((data.args === undefined) || (!(func0.call(data, "args")))){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "args"},message:"must have required property '"+"args"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(((((key0 === "id") || (key0 === "obligation")) || (key0 === "atom")) || (key0 === "op")) || (key0 === "args"))){
const err5 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern3.test(data0)){
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.obligation !== undefined && func0.call(data, "obligation")){
let data1 = data.obligation;
if(!(((((((((((data1 === "claim_semantics") || (data1 === "node_identity")) || (data1 === "semantic_integrity")) || (data1 === "subject_scope")) || (data1 === "period")) || (data1 === "time_basis")) || (data1 === "coverage")) || (data1 === "evidence_state")) || (data1 === "evidence_set")) || (data1 === "economic_links")) || (data1 === "derivation_trace"))){
const err8 = {instancePath:instancePath+"/obligation",schemaPath:"#/properties/obligation/enum",keyword:"enum",params:{allowedValues: schema242.properties.obligation.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.atom !== undefined && func0.call(data, "atom")){
let data2 = data.atom;
if(!((((((((((((data2 === "claim") || (data2 === "identity")) || (data2 === "fingerprint")) || (data2 === "subject")) || (data2 === "period")) || (data2 === "time_basis")) || (data2 === "coverage")) || (data2 === "evidence_state")) || (data2 === "evidence_set")) || (data2 === "edge")) || (data2 === "trace")) || (data2 === "evaluator"))){
const err9 = {instancePath:instancePath+"/atom",schemaPath:"#/properties/atom/enum",keyword:"enum",params:{allowedValues: schema242.properties.atom.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.op !== undefined && func0.call(data, "op")){
let data3 = data.op;
if(!((((((((((((((((((((((((((((((((data3 === "eq") || (data3 === "not_eq")) || (data3 === "same_identity")) || (data3 === "kind_is")) || (data3 === "state_is")) || (data3 === "fingerprint_is")) || (data3 === "date_in_period")) || (data3 === "period_eq")) || (data3 === "same_month")) || (data3 === "range_contains")) || (data3 === "all_dates_in_period")) || (data3 === "set_eq")) || (data3 === "set_subset")) || (data3 === "cardinality_eq")) || (data3 === "all_match")) || (data3 === "none_match")) || (data3 === "field_eq")) || (data3 === "join_eq")) || (data3 === "ref_targets_node")) || (data3 === "same_field")) || (data3 === "edge_pair_complete")) || (data3 === "edge_target_in_set")) || (data3 === "sum_eq")) || (data3 === "count_eq")) || (data3 === "opposite_sign")) || (data3 === "abs_eq")) || (data3 === "ordered_by")) || (data3 === "civil_date_matches")) || (data3 === "civil_offset_matches")) || (data3 === "month_bounds_match")) || (data3 === "day_of_month_matches")) || (data3 === "inclusive_day_count_matches"))){
const err10 = {instancePath:instancePath+"/op",schemaPath:"#/properties/op/enum",keyword:"enum",params:{allowedValues: schema242.properties.op.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.args !== undefined && func0.call(data, "args")){
let data4 = data.args;
if(Array.isArray(data4)){
if(data4.length > 5){
const err11 = {instancePath:instancePath+"/args",schemaPath:"#/properties/args/maxItems",keyword:"maxItems",params:{limit: 5},message:"must NOT have more than 5 items"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(data4.length < 1){
const err12 = {instancePath:instancePath+"/args",schemaPath:"#/properties/args/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
const len0 = data4.length;
for(let i0=0; i0<len0; i0++){
if(!(validate98(data4[i0], {instancePath:instancePath+"/args/" + i0,parentData:data4,parentDataProperty:i0,rootData}))){
vErrors = vErrors === null ? validate98.errors : vErrors.concat(validate98.errors);
errors = vErrors.length;
}
}
}
else {
const err13 = {instancePath:instancePath+"/args",schemaPath:"#/properties/args/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
else {
const err14 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
validate97.errors = vErrors;
return errors === 0;
}

const schema269 = {"type":"object","additionalProperties":false,"required":["id","source","field","target","relation","proof_predicates"],"properties":{"id":{"$ref":"#/definitions/id"},"source":{"$ref":"#/definitions/id"},"field":{"type":"string","pattern":"^[a-z][a-z0-9_]*$"},"target":{"$ref":"#/definitions/id"},"relation":{"enum":["material_ref","derived_from"]},"proof_predicates":{"type":"array","minItems":1,"uniqueItems":true,"items":{"$ref":"#/definitions/id"}}}};

function validate112(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.id === undefined) || (!(func0.call(data, "id")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.source === undefined) || (!(func0.call(data, "source")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "source"},message:"must have required property '"+"source"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.field === undefined) || (!(func0.call(data, "field")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "field"},message:"must have required property '"+"field"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if((data.target === undefined) || (!(func0.call(data, "target")))){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "target"},message:"must have required property '"+"target"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if((data.relation === undefined) || (!(func0.call(data, "relation")))){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "relation"},message:"must have required property '"+"relation"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if((data.proof_predicates === undefined) || (!(func0.call(data, "proof_predicates")))){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "proof_predicates"},message:"must have required property '"+"proof_predicates"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!((((((key0 === "id") || (key0 === "source")) || (key0 === "field")) || (key0 === "target")) || (key0 === "relation")) || (key0 === "proof_predicates"))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.id !== undefined && func0.call(data, "id")){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern3.test(data0)){
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.source !== undefined && func0.call(data, "source")){
let data1 = data.source;
if(typeof data1 === "string"){
if(!pattern3.test(data1)){
const err9 = {instancePath:instancePath+"/source",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/source",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.field !== undefined && func0.call(data, "field")){
let data2 = data.field;
if(typeof data2 === "string"){
if(!pattern23.test(data2)){
const err11 = {instancePath:instancePath+"/field",schemaPath:"#/properties/field/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]*$"},message:"must match pattern \""+"^[a-z][a-z0-9_]*$"+"\""};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/field",schemaPath:"#/properties/field/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.target !== undefined && func0.call(data, "target")){
let data3 = data.target;
if(typeof data3 === "string"){
if(!pattern3.test(data3)){
const err13 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
else {
const err14 = {instancePath:instancePath+"/target",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.relation !== undefined && func0.call(data, "relation")){
let data4 = data.relation;
if(!((data4 === "material_ref") || (data4 === "derived_from"))){
const err15 = {instancePath:instancePath+"/relation",schemaPath:"#/properties/relation/enum",keyword:"enum",params:{allowedValues: schema269.properties.relation.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.proof_predicates !== undefined && func0.call(data, "proof_predicates")){
let data5 = data.proof_predicates;
if(Array.isArray(data5)){
if(data5.length < 1){
const err16 = {instancePath:instancePath+"/proof_predicates",schemaPath:"#/properties/proof_predicates/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
const len0 = data5.length;
for(let i0=0; i0<len0; i0++){
let data6 = data5[i0];
if(typeof data6 === "string"){
if(!pattern3.test(data6)){
const err17 = {instancePath:instancePath+"/proof_predicates/" + i0,schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/proof_predicates/" + i0,schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
let i1 = data5.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func32(data5[i1], data5[j0])){
const err19 = {instancePath:instancePath+"/proof_predicates",schemaPath:"#/properties/proof_predicates/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err20 = {instancePath:instancePath+"/proof_predicates",schemaPath:"#/properties/proof_predicates/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
else {
const err21 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
validate112.errors = vErrors;
return errors === 0;
}

const schema274 = {"type":"object","additionalProperties":false,"required":["obligation","predicates","checks"],"properties":{"obligation":{"enum":["claim_semantics","node_identity","semantic_integrity","subject_scope","period","time_basis","coverage","evidence_state","evidence_set","economic_links","derivation_trace"]},"predicates":{"type":"array","minItems":0,"uniqueItems":true,"items":{"$ref":"#/definitions/id"}},"checks":{"type":"array","minItems":0,"uniqueItems":true,"items":{"enum":["claim_registry_binding","snapshot_identity","all_material_fingerprints","typed_subject_binding","typed_period_binding","time_field_reads","source_collection_completeness","typed_evidence_state","exact_evidence_set","all_material_edges","exact_observed_trace","validated_parent_binding"]}}}};

function validate114(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.obligation === undefined) || (!(func0.call(data, "obligation")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "obligation"},message:"must have required property '"+"obligation"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.predicates === undefined) || (!(func0.call(data, "predicates")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "predicates"},message:"must have required property '"+"predicates"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.checks === undefined) || (!(func0.call(data, "checks")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "checks"},message:"must have required property '"+"checks"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(((key0 === "obligation") || (key0 === "predicates")) || (key0 === "checks"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.obligation !== undefined && func0.call(data, "obligation")){
let data0 = data.obligation;
if(!(((((((((((data0 === "claim_semantics") || (data0 === "node_identity")) || (data0 === "semantic_integrity")) || (data0 === "subject_scope")) || (data0 === "period")) || (data0 === "time_basis")) || (data0 === "coverage")) || (data0 === "evidence_state")) || (data0 === "evidence_set")) || (data0 === "economic_links")) || (data0 === "derivation_trace"))){
const err4 = {instancePath:instancePath+"/obligation",schemaPath:"#/properties/obligation/enum",keyword:"enum",params:{allowedValues: schema274.properties.obligation.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.predicates !== undefined && func0.call(data, "predicates")){
let data1 = data.predicates;
if(Array.isArray(data1)){
if(data1.length < 0){
const err5 = {instancePath:instancePath+"/predicates",schemaPath:"#/properties/predicates/minItems",keyword:"minItems",params:{limit: 0},message:"must NOT have fewer than 0 items"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
const len0 = data1.length;
for(let i0=0; i0<len0; i0++){
let data2 = data1[i0];
if(typeof data2 === "string"){
if(!pattern3.test(data2)){
const err6 = {instancePath:instancePath+"/predicates/" + i0,schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/predicates/" + i0,schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
let i1 = data1.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func32(data1[i1], data1[j0])){
const err8 = {instancePath:instancePath+"/predicates",schemaPath:"#/properties/predicates/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err9 = {instancePath:instancePath+"/predicates",schemaPath:"#/properties/predicates/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.checks !== undefined && func0.call(data, "checks")){
let data3 = data.checks;
if(Array.isArray(data3)){
if(data3.length < 0){
const err10 = {instancePath:instancePath+"/checks",schemaPath:"#/properties/checks/minItems",keyword:"minItems",params:{limit: 0},message:"must NOT have fewer than 0 items"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
const len1 = data3.length;
for(let i2=0; i2<len1; i2++){
let data4 = data3[i2];
if(!((((((((((((data4 === "claim_registry_binding") || (data4 === "snapshot_identity")) || (data4 === "all_material_fingerprints")) || (data4 === "typed_subject_binding")) || (data4 === "typed_period_binding")) || (data4 === "time_field_reads")) || (data4 === "source_collection_completeness")) || (data4 === "typed_evidence_state")) || (data4 === "exact_evidence_set")) || (data4 === "all_material_edges")) || (data4 === "exact_observed_trace")) || (data4 === "validated_parent_binding"))){
const err11 = {instancePath:instancePath+"/checks/" + i2,schemaPath:"#/properties/checks/items/enum",keyword:"enum",params:{allowedValues: schema274.properties.checks.items.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
let i3 = data3.length;
let j1;
if(i3 > 1){
outer1:
for(;i3--;){
for(j1 = i3; j1--;){
if(func32(data3[i3], data3[j1])){
const err12 = {instancePath:instancePath+"/checks",schemaPath:"#/properties/checks/uniqueItems",keyword:"uniqueItems",params:{i: i3, j: j1},message:"must NOT have duplicate items (items ## "+j1+" and "+i3+" are identical)"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
break outer1;
}
}
}
}
}
else {
const err13 = {instancePath:instancePath+"/checks",schemaPath:"#/properties/checks/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
else {
const err14 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
validate114.errors = vErrors;
return errors === 0;
}

const schema276 = {"type":"object","additionalProperties":false,"required":["derivation","proof","producer","result_channel"],"properties":{"derivation":{"$ref":"#/definitions/phase"},"proof":{"$ref":"#/definitions/phase"},"producer":{"const":"external_recorder"},"result_channel":{"const":"separate_R"}}};
const schema277 = {"type":"object","additionalProperties":false,"required":["required_nodes","required_reads","required_edges","required_structural","selected_nodes","evidence_set_mode","required_claim_reads","required_selections"],"properties":{"required_nodes":{"type":"array","minItems":0,"uniqueItems":true,"items":{"$ref":"#/definitions/id"}},"required_reads":{"type":"array","minItems":0,"uniqueItems":true,"items":{"$ref":"#/definitions/fieldPath"}},"required_edges":{"type":"array","minItems":0,"uniqueItems":true,"items":{"$ref":"#/definitions/id"}},"required_structural":{"type":"array","minItems":0,"uniqueItems":true,"items":{"$ref":"#/definitions/structural"}},"selected_nodes":{"type":"array","minItems":0,"uniqueItems":true,"items":{"$ref":"#/definitions/id"}},"evidence_set_mode":{"const":"exact"},"required_claim_reads":{"type":"array","uniqueItems":true,"items":{"$ref":"#/definitions/claimPath"}},"required_selections":{"type":"array","uniqueItems":true,"items":{"type":"object","additionalProperties":false,"required":["candidate_set","selected_set"],"properties":{"candidate_set":{"$ref":"#/definitions/id"},"selected_set":{"$ref":"#/definitions/id"}}}}}};
const schema280 = {"type":"object","additionalProperties":false,"required":["node","operation","segments"],"properties":{"node":{"$ref":"#/definitions/id"},"operation":{"enum":["has","keys","iterator","index","order","membership","cardinality","length","selection","traversal","early_termination"]},"segments":{"type":"array","items":{"type":"string","pattern":"^[a-z][a-z0-9_]*$"}}}};

function validate119(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.node === undefined) || (!(func0.call(data, "node")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "node"},message:"must have required property '"+"node"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.operation === undefined) || (!(func0.call(data, "operation")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "operation"},message:"must have required property '"+"operation"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.segments === undefined) || (!(func0.call(data, "segments")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "segments"},message:"must have required property '"+"segments"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(((key0 === "node") || (key0 === "operation")) || (key0 === "segments"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.node !== undefined && func0.call(data, "node")){
let data0 = data.node;
if(typeof data0 === "string"){
if(!pattern3.test(data0)){
const err4 = {instancePath:instancePath+"/node",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/node",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.operation !== undefined && func0.call(data, "operation")){
let data1 = data.operation;
if(!(((((((((((data1 === "has") || (data1 === "keys")) || (data1 === "iterator")) || (data1 === "index")) || (data1 === "order")) || (data1 === "membership")) || (data1 === "cardinality")) || (data1 === "length")) || (data1 === "selection")) || (data1 === "traversal")) || (data1 === "early_termination"))){
const err6 = {instancePath:instancePath+"/operation",schemaPath:"#/properties/operation/enum",keyword:"enum",params:{allowedValues: schema280.properties.operation.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.segments !== undefined && func0.call(data, "segments")){
let data2 = data.segments;
if(Array.isArray(data2)){
const len0 = data2.length;
for(let i0=0; i0<len0; i0++){
let data3 = data2[i0];
if(typeof data3 === "string"){
if(!pattern23.test(data3)){
const err7 = {instancePath:instancePath+"/segments/" + i0,schemaPath:"#/properties/segments/items/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]*$"},message:"must match pattern \""+"^[a-z][a-z0-9_]*$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/segments/" + i0,schemaPath:"#/properties/segments/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
else {
const err9 = {instancePath:instancePath+"/segments",schemaPath:"#/properties/segments/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
}
else {
const err10 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
validate119.errors = vErrors;
return errors === 0;
}


function validate117(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.required_nodes === undefined) || (!(func0.call(data, "required_nodes")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "required_nodes"},message:"must have required property '"+"required_nodes"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.required_reads === undefined) || (!(func0.call(data, "required_reads")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "required_reads"},message:"must have required property '"+"required_reads"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.required_edges === undefined) || (!(func0.call(data, "required_edges")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "required_edges"},message:"must have required property '"+"required_edges"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if((data.required_structural === undefined) || (!(func0.call(data, "required_structural")))){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "required_structural"},message:"must have required property '"+"required_structural"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if((data.selected_nodes === undefined) || (!(func0.call(data, "selected_nodes")))){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "selected_nodes"},message:"must have required property '"+"selected_nodes"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if((data.evidence_set_mode === undefined) || (!(func0.call(data, "evidence_set_mode")))){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "evidence_set_mode"},message:"must have required property '"+"evidence_set_mode"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if((data.required_claim_reads === undefined) || (!(func0.call(data, "required_claim_reads")))){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "required_claim_reads"},message:"must have required property '"+"required_claim_reads"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if((data.required_selections === undefined) || (!(func0.call(data, "required_selections")))){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "required_selections"},message:"must have required property '"+"required_selections"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!((((((((key0 === "required_nodes") || (key0 === "required_reads")) || (key0 === "required_edges")) || (key0 === "required_structural")) || (key0 === "selected_nodes")) || (key0 === "evidence_set_mode")) || (key0 === "required_claim_reads")) || (key0 === "required_selections"))){
const err8 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.required_nodes !== undefined && func0.call(data, "required_nodes")){
let data0 = data.required_nodes;
if(Array.isArray(data0)){
if(data0.length < 0){
const err9 = {instancePath:instancePath+"/required_nodes",schemaPath:"#/properties/required_nodes/minItems",keyword:"minItems",params:{limit: 0},message:"must NOT have fewer than 0 items"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
const len0 = data0.length;
for(let i0=0; i0<len0; i0++){
let data1 = data0[i0];
if(typeof data1 === "string"){
if(!pattern3.test(data1)){
const err10 = {instancePath:instancePath+"/required_nodes/" + i0,schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/required_nodes/" + i0,schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
let i1 = data0.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func32(data0[i1], data0[j0])){
const err12 = {instancePath:instancePath+"/required_nodes",schemaPath:"#/properties/required_nodes/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err13 = {instancePath:instancePath+"/required_nodes",schemaPath:"#/properties/required_nodes/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.required_reads !== undefined && func0.call(data, "required_reads")){
let data2 = data.required_reads;
if(Array.isArray(data2)){
if(data2.length < 0){
const err14 = {instancePath:instancePath+"/required_reads",schemaPath:"#/properties/required_reads/minItems",keyword:"minItems",params:{limit: 0},message:"must NOT have fewer than 0 items"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
const len1 = data2.length;
for(let i2=0; i2<len1; i2++){
if(!(validate99(data2[i2], {instancePath:instancePath+"/required_reads/" + i2,parentData:data2,parentDataProperty:i2,rootData}))){
vErrors = vErrors === null ? validate99.errors : vErrors.concat(validate99.errors);
errors = vErrors.length;
}
}
let i3 = data2.length;
let j1;
if(i3 > 1){
outer1:
for(;i3--;){
for(j1 = i3; j1--;){
if(func32(data2[i3], data2[j1])){
const err15 = {instancePath:instancePath+"/required_reads",schemaPath:"#/properties/required_reads/uniqueItems",keyword:"uniqueItems",params:{i: i3, j: j1},message:"must NOT have duplicate items (items ## "+j1+" and "+i3+" are identical)"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
break outer1;
}
}
}
}
}
else {
const err16 = {instancePath:instancePath+"/required_reads",schemaPath:"#/properties/required_reads/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.required_edges !== undefined && func0.call(data, "required_edges")){
let data4 = data.required_edges;
if(Array.isArray(data4)){
if(data4.length < 0){
const err17 = {instancePath:instancePath+"/required_edges",schemaPath:"#/properties/required_edges/minItems",keyword:"minItems",params:{limit: 0},message:"must NOT have fewer than 0 items"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
const len2 = data4.length;
for(let i4=0; i4<len2; i4++){
let data5 = data4[i4];
if(typeof data5 === "string"){
if(!pattern3.test(data5)){
const err18 = {instancePath:instancePath+"/required_edges/" + i4,schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
else {
const err19 = {instancePath:instancePath+"/required_edges/" + i4,schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
let i5 = data4.length;
let j2;
if(i5 > 1){
outer2:
for(;i5--;){
for(j2 = i5; j2--;){
if(func32(data4[i5], data4[j2])){
const err20 = {instancePath:instancePath+"/required_edges",schemaPath:"#/properties/required_edges/uniqueItems",keyword:"uniqueItems",params:{i: i5, j: j2},message:"must NOT have duplicate items (items ## "+j2+" and "+i5+" are identical)"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
break outer2;
}
}
}
}
}
else {
const err21 = {instancePath:instancePath+"/required_edges",schemaPath:"#/properties/required_edges/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.required_structural !== undefined && func0.call(data, "required_structural")){
let data6 = data.required_structural;
if(Array.isArray(data6)){
if(data6.length < 0){
const err22 = {instancePath:instancePath+"/required_structural",schemaPath:"#/properties/required_structural/minItems",keyword:"minItems",params:{limit: 0},message:"must NOT have fewer than 0 items"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
const len3 = data6.length;
for(let i6=0; i6<len3; i6++){
if(!(validate119(data6[i6], {instancePath:instancePath+"/required_structural/" + i6,parentData:data6,parentDataProperty:i6,rootData}))){
vErrors = vErrors === null ? validate119.errors : vErrors.concat(validate119.errors);
errors = vErrors.length;
}
}
let i7 = data6.length;
let j3;
if(i7 > 1){
outer3:
for(;i7--;){
for(j3 = i7; j3--;){
if(func32(data6[i7], data6[j3])){
const err23 = {instancePath:instancePath+"/required_structural",schemaPath:"#/properties/required_structural/uniqueItems",keyword:"uniqueItems",params:{i: i7, j: j3},message:"must NOT have duplicate items (items ## "+j3+" and "+i7+" are identical)"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
break outer3;
}
}
}
}
}
else {
const err24 = {instancePath:instancePath+"/required_structural",schemaPath:"#/properties/required_structural/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data.selected_nodes !== undefined && func0.call(data, "selected_nodes")){
let data8 = data.selected_nodes;
if(Array.isArray(data8)){
if(data8.length < 0){
const err25 = {instancePath:instancePath+"/selected_nodes",schemaPath:"#/properties/selected_nodes/minItems",keyword:"minItems",params:{limit: 0},message:"must NOT have fewer than 0 items"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
const len4 = data8.length;
for(let i8=0; i8<len4; i8++){
let data9 = data8[i8];
if(typeof data9 === "string"){
if(!pattern3.test(data9)){
const err26 = {instancePath:instancePath+"/selected_nodes/" + i8,schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
else {
const err27 = {instancePath:instancePath+"/selected_nodes/" + i8,schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
let i9 = data8.length;
let j4;
if(i9 > 1){
outer4:
for(;i9--;){
for(j4 = i9; j4--;){
if(func32(data8[i9], data8[j4])){
const err28 = {instancePath:instancePath+"/selected_nodes",schemaPath:"#/properties/selected_nodes/uniqueItems",keyword:"uniqueItems",params:{i: i9, j: j4},message:"must NOT have duplicate items (items ## "+j4+" and "+i9+" are identical)"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
break outer4;
}
}
}
}
}
else {
const err29 = {instancePath:instancePath+"/selected_nodes",schemaPath:"#/properties/selected_nodes/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.evidence_set_mode !== undefined && func0.call(data, "evidence_set_mode")){
if("exact" !== data.evidence_set_mode){
const err30 = {instancePath:instancePath+"/evidence_set_mode",schemaPath:"#/properties/evidence_set_mode/const",keyword:"const",params:{allowedValue: "exact"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data.required_claim_reads !== undefined && func0.call(data, "required_claim_reads")){
let data11 = data.required_claim_reads;
if(Array.isArray(data11)){
const len5 = data11.length;
for(let i10=0; i10<len5; i10++){
let data12 = data11[i10];
if(data12 && typeof data12 == "object" && !Array.isArray(data12)){
if((data12.segments === undefined) || (!(func0.call(data12, "segments")))){
const err31 = {instancePath:instancePath+"/required_claim_reads/" + i10,schemaPath:"#/definitions/claimPath/required",keyword:"required",params:{missingProperty: "segments"},message:"must have required property '"+"segments"+"'"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
for(const key1 of Object.keys(data12)){
if(!(key1 === "segments")){
const err32 = {instancePath:instancePath+"/required_claim_reads/" + i10,schemaPath:"#/definitions/claimPath/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data12.segments !== undefined && func0.call(data12, "segments")){
let data13 = data12.segments;
if(Array.isArray(data13)){
if(data13.length < 1){
const err33 = {instancePath:instancePath+"/required_claim_reads/" + i10+"/segments",schemaPath:"#/definitions/claimPath/properties/segments/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
const len6 = data13.length;
for(let i11=0; i11<len6; i11++){
let data14 = data13[i11];
if(typeof data14 === "string"){
if(!pattern23.test(data14)){
const err34 = {instancePath:instancePath+"/required_claim_reads/" + i10+"/segments/" + i11,schemaPath:"#/definitions/claimPath/properties/segments/items/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]*$"},message:"must match pattern \""+"^[a-z][a-z0-9_]*$"+"\""};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
else {
const err35 = {instancePath:instancePath+"/required_claim_reads/" + i10+"/segments/" + i11,schemaPath:"#/definitions/claimPath/properties/segments/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
}
else {
const err36 = {instancePath:instancePath+"/required_claim_reads/" + i10+"/segments",schemaPath:"#/definitions/claimPath/properties/segments/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
}
else {
const err37 = {instancePath:instancePath+"/required_claim_reads/" + i10,schemaPath:"#/definitions/claimPath/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
let i12 = data11.length;
let j5;
if(i12 > 1){
outer5:
for(;i12--;){
for(j5 = i12; j5--;){
if(func32(data11[i12], data11[j5])){
const err38 = {instancePath:instancePath+"/required_claim_reads",schemaPath:"#/properties/required_claim_reads/uniqueItems",keyword:"uniqueItems",params:{i: i12, j: j5},message:"must NOT have duplicate items (items ## "+j5+" and "+i12+" are identical)"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
break outer5;
}
}
}
}
}
else {
const err39 = {instancePath:instancePath+"/required_claim_reads",schemaPath:"#/properties/required_claim_reads/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data.required_selections !== undefined && func0.call(data, "required_selections")){
let data15 = data.required_selections;
if(Array.isArray(data15)){
const len7 = data15.length;
for(let i13=0; i13<len7; i13++){
let data16 = data15[i13];
if(data16 && typeof data16 == "object" && !Array.isArray(data16)){
if((data16.candidate_set === undefined) || (!(func0.call(data16, "candidate_set")))){
const err40 = {instancePath:instancePath+"/required_selections/" + i13,schemaPath:"#/properties/required_selections/items/required",keyword:"required",params:{missingProperty: "candidate_set"},message:"must have required property '"+"candidate_set"+"'"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
if((data16.selected_set === undefined) || (!(func0.call(data16, "selected_set")))){
const err41 = {instancePath:instancePath+"/required_selections/" + i13,schemaPath:"#/properties/required_selections/items/required",keyword:"required",params:{missingProperty: "selected_set"},message:"must have required property '"+"selected_set"+"'"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
for(const key2 of Object.keys(data16)){
if(!((key2 === "candidate_set") || (key2 === "selected_set"))){
const err42 = {instancePath:instancePath+"/required_selections/" + i13,schemaPath:"#/properties/required_selections/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
if(data16.candidate_set !== undefined && func0.call(data16, "candidate_set")){
let data17 = data16.candidate_set;
if(typeof data17 === "string"){
if(!pattern3.test(data17)){
const err43 = {instancePath:instancePath+"/required_selections/" + i13+"/candidate_set",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
else {
const err44 = {instancePath:instancePath+"/required_selections/" + i13+"/candidate_set",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
}
if(data16.selected_set !== undefined && func0.call(data16, "selected_set")){
let data18 = data16.selected_set;
if(typeof data18 === "string"){
if(!pattern3.test(data18)){
const err45 = {instancePath:instancePath+"/required_selections/" + i13+"/selected_set",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
else {
const err46 = {instancePath:instancePath+"/required_selections/" + i13+"/selected_set",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
}
else {
const err47 = {instancePath:instancePath+"/required_selections/" + i13,schemaPath:"#/properties/required_selections/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
let i14 = data15.length;
let j6;
if(i14 > 1){
outer6:
for(;i14--;){
for(j6 = i14; j6--;){
if(func32(data15[i14], data15[j6])){
const err48 = {instancePath:instancePath+"/required_selections",schemaPath:"#/properties/required_selections/uniqueItems",keyword:"uniqueItems",params:{i: i14, j: j6},message:"must NOT have duplicate items (items ## "+j6+" and "+i14+" are identical)"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
break outer6;
}
}
}
}
}
else {
const err49 = {instancePath:instancePath+"/required_selections",schemaPath:"#/properties/required_selections/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
}
else {
const err50 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
validate117.errors = vErrors;
return errors === 0;
}


function validate116(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.derivation === undefined) || (!(func0.call(data, "derivation")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "derivation"},message:"must have required property '"+"derivation"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.proof === undefined) || (!(func0.call(data, "proof")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "proof"},message:"must have required property '"+"proof"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.producer === undefined) || (!(func0.call(data, "producer")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "producer"},message:"must have required property '"+"producer"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if((data.result_channel === undefined) || (!(func0.call(data, "result_channel")))){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "result_channel"},message:"must have required property '"+"result_channel"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!((((key0 === "derivation") || (key0 === "proof")) || (key0 === "producer")) || (key0 === "result_channel"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.derivation !== undefined && func0.call(data, "derivation")){
if(!(validate117(data.derivation, {instancePath:instancePath+"/derivation",parentData:data,parentDataProperty:"derivation",rootData}))){
vErrors = vErrors === null ? validate117.errors : vErrors.concat(validate117.errors);
errors = vErrors.length;
}
}
if(data.proof !== undefined && func0.call(data, "proof")){
if(!(validate117(data.proof, {instancePath:instancePath+"/proof",parentData:data,parentDataProperty:"proof",rootData}))){
vErrors = vErrors === null ? validate117.errors : vErrors.concat(validate117.errors);
errors = vErrors.length;
}
}
if(data.producer !== undefined && func0.call(data, "producer")){
if("external_recorder" !== data.producer){
const err5 = {instancePath:instancePath+"/producer",schemaPath:"#/properties/producer/const",keyword:"const",params:{allowedValue: "external_recorder"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.result_channel !== undefined && func0.call(data, "result_channel")){
if("separate_R" !== data.result_channel){
const err6 = {instancePath:instancePath+"/result_channel",schemaPath:"#/properties/result_channel/const",keyword:"const",params:{allowedValue: "separate_R"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
else {
const err7 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
validate116.errors = vErrors;
return errors === 0;
}

const schema286 = {"type":"object","additionalProperties":false,"required":["candidate_set","selected_set","selected_predicates","excluded"],"properties":{"candidate_set":{"$ref":"#/definitions/id"},"selected_set":{"$ref":"#/definitions/id"},"selected_predicates":{"type":"array","uniqueItems":true,"items":{"$ref":"#/definitions/id"}},"excluded":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["node","reason","predicates"],"properties":{"node":{"$ref":"#/definitions/id"},"reason":{"enum":["period","state","identity","ownership","scope","instrument","plan","merchant","category","budget_class","economic_kind"]},"predicates":{"type":"array","minItems":1,"uniqueItems":true,"items":{"$ref":"#/definitions/id"}}}}},"input_evidence_state":{"enum":["confirmed","projected"]}}};

function validate124(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.candidate_set === undefined) || (!(func0.call(data, "candidate_set")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "candidate_set"},message:"must have required property '"+"candidate_set"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.selected_set === undefined) || (!(func0.call(data, "selected_set")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "selected_set"},message:"must have required property '"+"selected_set"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.selected_predicates === undefined) || (!(func0.call(data, "selected_predicates")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "selected_predicates"},message:"must have required property '"+"selected_predicates"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if((data.excluded === undefined) || (!(func0.call(data, "excluded")))){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "excluded"},message:"must have required property '"+"excluded"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(((((key0 === "candidate_set") || (key0 === "selected_set")) || (key0 === "selected_predicates")) || (key0 === "excluded")) || (key0 === "input_evidence_state"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.candidate_set !== undefined && func0.call(data, "candidate_set")){
let data0 = data.candidate_set;
if(typeof data0 === "string"){
if(!pattern3.test(data0)){
const err5 = {instancePath:instancePath+"/candidate_set",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/candidate_set",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.selected_set !== undefined && func0.call(data, "selected_set")){
let data1 = data.selected_set;
if(typeof data1 === "string"){
if(!pattern3.test(data1)){
const err7 = {instancePath:instancePath+"/selected_set",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/selected_set",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.selected_predicates !== undefined && func0.call(data, "selected_predicates")){
let data2 = data.selected_predicates;
if(Array.isArray(data2)){
const len0 = data2.length;
for(let i0=0; i0<len0; i0++){
let data3 = data2[i0];
if(typeof data3 === "string"){
if(!pattern3.test(data3)){
const err9 = {instancePath:instancePath+"/selected_predicates/" + i0,schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/selected_predicates/" + i0,schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
let i1 = data2.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func32(data2[i1], data2[j0])){
const err11 = {instancePath:instancePath+"/selected_predicates",schemaPath:"#/properties/selected_predicates/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err12 = {instancePath:instancePath+"/selected_predicates",schemaPath:"#/properties/selected_predicates/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.excluded !== undefined && func0.call(data, "excluded")){
let data4 = data.excluded;
if(Array.isArray(data4)){
const len1 = data4.length;
for(let i2=0; i2<len1; i2++){
let data5 = data4[i2];
if(data5 && typeof data5 == "object" && !Array.isArray(data5)){
if((data5.node === undefined) || (!(func0.call(data5, "node")))){
const err13 = {instancePath:instancePath+"/excluded/" + i2,schemaPath:"#/properties/excluded/items/required",keyword:"required",params:{missingProperty: "node"},message:"must have required property '"+"node"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if((data5.reason === undefined) || (!(func0.call(data5, "reason")))){
const err14 = {instancePath:instancePath+"/excluded/" + i2,schemaPath:"#/properties/excluded/items/required",keyword:"required",params:{missingProperty: "reason"},message:"must have required property '"+"reason"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if((data5.predicates === undefined) || (!(func0.call(data5, "predicates")))){
const err15 = {instancePath:instancePath+"/excluded/" + i2,schemaPath:"#/properties/excluded/items/required",keyword:"required",params:{missingProperty: "predicates"},message:"must have required property '"+"predicates"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
for(const key1 of Object.keys(data5)){
if(!(((key1 === "node") || (key1 === "reason")) || (key1 === "predicates"))){
const err16 = {instancePath:instancePath+"/excluded/" + i2,schemaPath:"#/properties/excluded/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data5.node !== undefined && func0.call(data5, "node")){
let data6 = data5.node;
if(typeof data6 === "string"){
if(!pattern3.test(data6)){
const err17 = {instancePath:instancePath+"/excluded/" + i2+"/node",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/excluded/" + i2+"/node",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data5.reason !== undefined && func0.call(data5, "reason")){
let data7 = data5.reason;
if(!(((((((((((data7 === "period") || (data7 === "state")) || (data7 === "identity")) || (data7 === "ownership")) || (data7 === "scope")) || (data7 === "instrument")) || (data7 === "plan")) || (data7 === "merchant")) || (data7 === "category")) || (data7 === "budget_class")) || (data7 === "economic_kind"))){
const err19 = {instancePath:instancePath+"/excluded/" + i2+"/reason",schemaPath:"#/properties/excluded/items/properties/reason/enum",keyword:"enum",params:{allowedValues: schema286.properties.excluded.items.properties.reason.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data5.predicates !== undefined && func0.call(data5, "predicates")){
let data8 = data5.predicates;
if(Array.isArray(data8)){
if(data8.length < 1){
const err20 = {instancePath:instancePath+"/excluded/" + i2+"/predicates",schemaPath:"#/properties/excluded/items/properties/predicates/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
const len2 = data8.length;
for(let i3=0; i3<len2; i3++){
let data9 = data8[i3];
if(typeof data9 === "string"){
if(!pattern3.test(data9)){
const err21 = {instancePath:instancePath+"/excluded/" + i2+"/predicates/" + i3,schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
else {
const err22 = {instancePath:instancePath+"/excluded/" + i2+"/predicates/" + i3,schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
let i4 = data8.length;
let j1;
if(i4 > 1){
outer1:
for(;i4--;){
for(j1 = i4; j1--;){
if(func32(data8[i4], data8[j1])){
const err23 = {instancePath:instancePath+"/excluded/" + i2+"/predicates",schemaPath:"#/properties/excluded/items/properties/predicates/uniqueItems",keyword:"uniqueItems",params:{i: i4, j: j1},message:"must NOT have duplicate items (items ## "+j1+" and "+i4+" are identical)"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
break outer1;
}
}
}
}
}
else {
const err24 = {instancePath:instancePath+"/excluded/" + i2+"/predicates",schemaPath:"#/properties/excluded/items/properties/predicates/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
}
else {
const err25 = {instancePath:instancePath+"/excluded/" + i2,schemaPath:"#/properties/excluded/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
}
else {
const err26 = {instancePath:instancePath+"/excluded",schemaPath:"#/properties/excluded/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data.input_evidence_state !== undefined && func0.call(data, "input_evidence_state")){
let data10 = data.input_evidence_state;
if(!((data10 === "confirmed") || (data10 === "projected"))){
const err27 = {instancePath:instancePath+"/input_evidence_state",schemaPath:"#/properties/input_evidence_state/enum",keyword:"enum",params:{allowedValues: schema286.properties.input_evidence_state.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
}
else {
const err28 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
validate124.errors = vErrors;
return errors === 0;
}

const schema293 = {"oneOf":[{"type":"object","additionalProperties":false,"required":["kind","start","end","start_inclusive","end_inclusive"],"properties":{"kind":{"const":"range"},"start":{"$ref":"#/definitions/scalarBinding"},"end":{"$ref":"#/definitions/scalarBinding"},"start_inclusive":{"type":"boolean"},"end_inclusive":{"type":"boolean"}}},{"type":"object","additionalProperties":false,"required":["kind","value"],"properties":{"kind":{"const":"month"},"value":{"$ref":"#/definitions/scalarBinding"}}}]};
const schema294 = {"oneOf":[{"type":"object","additionalProperties":false,"required":["field"],"properties":{"field":{"$ref":"#/definitions/fieldPath"}}},{"type":"object","additionalProperties":false,"required":["claim"],"properties":{"claim":{"$ref":"#/definitions/claimPath"}}},{"type":"object","additionalProperties":false,"required":["literal"],"properties":{"literal":{"$ref":"#/definitions/literal"}}}]};

function validate127(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.field === undefined) || (!(func0.call(data, "field")))){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "field"},message:"must have required property '"+"field"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(key0 === "field")){
const err1 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.field !== undefined && func0.call(data, "field")){
if(!(validate99(data.field, {instancePath:instancePath+"/field",parentData:data,parentDataProperty:"field",rootData}))){
vErrors = vErrors === null ? validate99.errors : vErrors.concat(validate99.errors);
errors = vErrors.length;
}
}
}
else {
const err2 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs5 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.claim === undefined) || (!(func0.call(data, "claim")))){
const err3 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "claim"},message:"must have required property '"+"claim"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key1 of Object.keys(data)){
if(!(key1 === "claim")){
const err4 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.claim !== undefined && func0.call(data, "claim")){
let data1 = data.claim;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if((data1.segments === undefined) || (!(func0.call(data1, "segments")))){
const err5 = {instancePath:instancePath+"/claim",schemaPath:"#/definitions/claimPath/required",keyword:"required",params:{missingProperty: "segments"},message:"must have required property '"+"segments"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key2 of Object.keys(data1)){
if(!(key2 === "segments")){
const err6 = {instancePath:instancePath+"/claim",schemaPath:"#/definitions/claimPath/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data1.segments !== undefined && func0.call(data1, "segments")){
let data2 = data1.segments;
if(Array.isArray(data2)){
if(data2.length < 1){
const err7 = {instancePath:instancePath+"/claim/segments",schemaPath:"#/definitions/claimPath/properties/segments/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
const len0 = data2.length;
for(let i0=0; i0<len0; i0++){
let data3 = data2[i0];
if(typeof data3 === "string"){
if(!pattern23.test(data3)){
const err8 = {instancePath:instancePath+"/claim/segments/" + i0,schemaPath:"#/definitions/claimPath/properties/segments/items/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]*$"},message:"must match pattern \""+"^[a-z][a-z0-9_]*$"+"\""};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/claim/segments/" + i0,schemaPath:"#/definitions/claimPath/properties/segments/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
}
else {
const err10 = {instancePath:instancePath+"/claim/segments",schemaPath:"#/definitions/claimPath/properties/segments/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
else {
const err11 = {instancePath:instancePath+"/claim",schemaPath:"#/definitions/claimPath/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
}
else {
const err12 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
var _valid0 = _errs5 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
}
const _errs16 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.literal === undefined) || (!(func0.call(data, "literal")))){
const err13 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "literal"},message:"must have required property '"+"literal"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
for(const key3 of Object.keys(data)){
if(!(key3 === "literal")){
const err14 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.literal !== undefined && func0.call(data, "literal")){
let data4 = data.literal;
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
if((data4.type === undefined) || (!(func0.call(data4, "type")))){
const err15 = {instancePath:instancePath+"/literal",schemaPath:"#/definitions/literal/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if((data4.value === undefined) || (!(func0.call(data4, "value")))){
const err16 = {instancePath:instancePath+"/literal",schemaPath:"#/definitions/literal/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
for(const key4 of Object.keys(data4)){
if(!((key4 === "type") || (key4 === "value"))){
const err17 = {instancePath:instancePath+"/literal",schemaPath:"#/definitions/literal/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data4.type !== undefined && func0.call(data4, "type")){
let data5 = data4.type;
if(!(((((((((((data5 === "id") || (data5 === "text")) || (data5 === "date")) || (data5 === "month")) || (data5 === "datetime")) || (data5 === "integer")) || (data5 === "money_minor")) || (data5 === "boolean")) || (data5 === "enum")) || (data5 === "digest")) || (data5 === "kind"))){
const err18 = {instancePath:instancePath+"/literal/type",schemaPath:"#/definitions/literal/properties/type/enum",keyword:"enum",params:{allowedValues: schema250.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data4.value !== undefined && func0.call(data4, "value")){
let data6 = data4.value;
if(((typeof data6 !== "string") && (!(((typeof data6 == "number") && (!(data6 % 1) && !isNaN(data6))) && (isFinite(data6))))) && (typeof data6 !== "boolean")){
const err19 = {instancePath:instancePath+"/literal/value",schemaPath:"#/definitions/literal/properties/value/type",keyword:"type",params:{type: schema250.properties.value.type},message:"must be string,integer,boolean"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
}
else {
const err20 = {instancePath:instancePath+"/literal",schemaPath:"#/definitions/literal/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
else {
const err21 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
var _valid0 = _errs16 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
}
}
}
if(!valid0){
const err22 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate127.errors = vErrors;
return errors === 0;
}


function validate126(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.start === undefined) || (!(func0.call(data, "start")))){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "start"},message:"must have required property '"+"start"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.end === undefined) || (!(func0.call(data, "end")))){
const err2 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "end"},message:"must have required property '"+"end"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if((data.start_inclusive === undefined) || (!(func0.call(data, "start_inclusive")))){
const err3 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "start_inclusive"},message:"must have required property '"+"start_inclusive"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if((data.end_inclusive === undefined) || (!(func0.call(data, "end_inclusive")))){
const err4 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "end_inclusive"},message:"must have required property '"+"end_inclusive"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(((((key0 === "kind") || (key0 === "start")) || (key0 === "end")) || (key0 === "start_inclusive")) || (key0 === "end_inclusive"))){
const err5 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("range" !== data.kind){
const err6 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "range"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.start !== undefined && func0.call(data, "start")){
if(!(validate127(data.start, {instancePath:instancePath+"/start",parentData:data,parentDataProperty:"start",rootData}))){
vErrors = vErrors === null ? validate127.errors : vErrors.concat(validate127.errors);
errors = vErrors.length;
}
}
if(data.end !== undefined && func0.call(data, "end")){
if(!(validate127(data.end, {instancePath:instancePath+"/end",parentData:data,parentDataProperty:"end",rootData}))){
vErrors = vErrors === null ? validate127.errors : vErrors.concat(validate127.errors);
errors = vErrors.length;
}
}
if(data.start_inclusive !== undefined && func0.call(data, "start_inclusive")){
if(typeof data.start_inclusive !== "boolean"){
const err7 = {instancePath:instancePath+"/start_inclusive",schemaPath:"#/oneOf/0/properties/start_inclusive/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.end_inclusive !== undefined && func0.call(data, "end_inclusive")){
if(typeof data.end_inclusive !== "boolean"){
const err8 = {instancePath:instancePath+"/end_inclusive",schemaPath:"#/oneOf/0/properties/end_inclusive/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
}
const _errs11 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.kind === undefined) || (!(func0.call(data, "kind")))){
const err10 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if((data.value === undefined) || (!(func0.call(data, "value")))){
const err11 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
for(const key1 of Object.keys(data)){
if(!((key1 === "kind") || (key1 === "value"))){
const err12 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.kind !== undefined && func0.call(data, "kind")){
if("month" !== data.kind){
const err13 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "month"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.value !== undefined && func0.call(data, "value")){
if(!(validate127(data.value, {instancePath:instancePath+"/value",parentData:data,parentDataProperty:"value",rootData}))){
vErrors = vErrors === null ? validate127.errors : vErrors.concat(validate127.errors);
errors = vErrors.length;
}
}
}
else {
const err14 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
var _valid0 = _errs11 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
}
}
if(!valid0){
const err15 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate126.errors = vErrors;
return errors === 0;
}


function validate94(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.fact_key === undefined) || (!(func0.call(data, "fact_key")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "fact_key"},message:"must have required property '"+"fact_key"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.claim_id === undefined) || (!(func0.call(data, "claim_id")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "claim_id"},message:"must have required property '"+"claim_id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.nodes === undefined) || (!(func0.call(data, "nodes")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "nodes"},message:"must have required property '"+"nodes"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if((data.sets === undefined) || (!(func0.call(data, "sets")))){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "sets"},message:"must have required property '"+"sets"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if((data.predicates === undefined) || (!(func0.call(data, "predicates")))){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "predicates"},message:"must have required property '"+"predicates"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if((data.edges === undefined) || (!(func0.call(data, "edges")))){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "edges"},message:"must have required property '"+"edges"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if((data.obligations === undefined) || (!(func0.call(data, "obligations")))){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "obligations"},message:"must have required property '"+"obligations"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if((data.trace_contract === undefined) || (!(func0.call(data, "trace_contract")))){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "trace_contract"},message:"must have required property '"+"trace_contract"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if((data.authoring_sources === undefined) || (!(func0.call(data, "authoring_sources")))){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "authoring_sources"},message:"must have required property '"+"authoring_sources"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if((data.selections === undefined) || (!(func0.call(data, "selections")))){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "selections"},message:"must have required property '"+"selections"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if((data.windows === undefined) || (!(func0.call(data, "windows")))){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "windows"},message:"must have required property '"+"windows"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(func0.call(schema229.properties, key0))){
const err11 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.fact_key !== undefined && func0.call(data, "fact_key")){
let data0 = data.fact_key;
if(typeof data0 === "string"){
if(!pattern2.test(data0)){
const err12 = {instancePath:instancePath+"/fact_key",schemaPath:"#/definitions/factKey/pattern",keyword:"pattern",params:{pattern: "^[SMFN]-[0-9]{2}#[1-9][0-9]*#[1-9][0-9]*$"},message:"must match pattern \""+"^[SMFN]-[0-9]{2}#[1-9][0-9]*#[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/fact_key",schemaPath:"#/definitions/factKey/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.claim_id !== undefined && func0.call(data, "claim_id")){
let data1 = data.claim_id;
if(typeof data1 === "string"){
if(!pattern0.test(data1)){
const err14 = {instancePath:instancePath+"/claim_id",schemaPath:"#/definitions/sourceRef/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/claim_id",schemaPath:"#/definitions/sourceRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.nodes !== undefined && func0.call(data, "nodes")){
let data2 = data.nodes;
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
if(Object.keys(data2).length < 1){
const err16 = {instancePath:instancePath+"/nodes",schemaPath:"#/properties/nodes/minProperties",keyword:"minProperties",params:{limit: 1},message:"must NOT have fewer than 1 properties"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
for(const key1 of Object.keys(data2)){
const _errs10 = errors;
if(typeof key1 === "string"){
if(!pattern3.test(key1)){
const err17 = {instancePath:instancePath+"/nodes",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\"",propertyName:key1};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/nodes",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string",propertyName:key1};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
var valid3 = _errs10 === errors;
if(!valid3){
const err19 = {instancePath:instancePath+"/nodes",schemaPath:"#/properties/nodes/propertyNames",keyword:"propertyNames",params:{propertyName: key1},message:"property name must be valid"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
for(const key2 of Object.keys(data2)){
if(!(validate95(data2[key2], {instancePath:instancePath+"/nodes/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),parentData:data2,parentDataProperty:key2,rootData}))){
vErrors = vErrors === null ? validate95.errors : vErrors.concat(validate95.errors);
errors = vErrors.length;
}
}
}
else {
const err20 = {instancePath:instancePath+"/nodes",schemaPath:"#/properties/nodes/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.sets !== undefined && func0.call(data, "sets")){
let data4 = data.sets;
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
for(const key3 of Object.keys(data4)){
const _errs17 = errors;
if(typeof key3 === "string"){
if(!pattern3.test(key3)){
const err21 = {instancePath:instancePath+"/sets",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\"",propertyName:key3};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
else {
const err22 = {instancePath:instancePath+"/sets",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string",propertyName:key3};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
var valid6 = _errs17 === errors;
if(!valid6){
const err23 = {instancePath:instancePath+"/sets",schemaPath:"#/properties/sets/propertyNames",keyword:"propertyNames",params:{propertyName: key3},message:"property name must be valid"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
for(const key4 of Object.keys(data4)){
let data5 = data4[key4];
if(Array.isArray(data5)){
if(data5.length < 0){
const err24 = {instancePath:instancePath+"/sets/" + key4.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/sets/additionalProperties/minItems",keyword:"minItems",params:{limit: 0},message:"must NOT have fewer than 0 items"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
const len0 = data5.length;
for(let i0=0; i0<len0; i0++){
let data6 = data5[i0];
if(typeof data6 === "string"){
if(!pattern3.test(data6)){
const err25 = {instancePath:instancePath+"/sets/" + key4.replace(/~/g, "~0").replace(/\//g, "~1")+"/" + i0,schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
else {
const err26 = {instancePath:instancePath+"/sets/" + key4.replace(/~/g, "~0").replace(/\//g, "~1")+"/" + i0,schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
let i1 = data5.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func32(data5[i1], data5[j0])){
const err27 = {instancePath:instancePath+"/sets/" + key4.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/sets/additionalProperties/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err28 = {instancePath:instancePath+"/sets/" + key4.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/sets/additionalProperties/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
}
else {
const err29 = {instancePath:instancePath+"/sets",schemaPath:"#/properties/sets/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.predicates !== undefined && func0.call(data, "predicates")){
let data7 = data.predicates;
if(Array.isArray(data7)){
if(data7.length < 1){
const err30 = {instancePath:instancePath+"/predicates",schemaPath:"#/properties/predicates/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
const len1 = data7.length;
for(let i2=0; i2<len1; i2++){
if(!(validate97(data7[i2], {instancePath:instancePath+"/predicates/" + i2,parentData:data7,parentDataProperty:i2,rootData}))){
vErrors = vErrors === null ? validate97.errors : vErrors.concat(validate97.errors);
errors = vErrors.length;
}
}
let i3 = data7.length;
let j1;
if(i3 > 1){
outer1:
for(;i3--;){
for(j1 = i3; j1--;){
if(func32(data7[i3], data7[j1])){
const err31 = {instancePath:instancePath+"/predicates",schemaPath:"#/properties/predicates/uniqueItems",keyword:"uniqueItems",params:{i: i3, j: j1},message:"must NOT have duplicate items (items ## "+j1+" and "+i3+" are identical)"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
break outer1;
}
}
}
}
}
else {
const err32 = {instancePath:instancePath+"/predicates",schemaPath:"#/properties/predicates/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data.edges !== undefined && func0.call(data, "edges")){
let data9 = data.edges;
if(Array.isArray(data9)){
if(data9.length < 0){
const err33 = {instancePath:instancePath+"/edges",schemaPath:"#/properties/edges/minItems",keyword:"minItems",params:{limit: 0},message:"must NOT have fewer than 0 items"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
const len2 = data9.length;
for(let i4=0; i4<len2; i4++){
if(!(validate112(data9[i4], {instancePath:instancePath+"/edges/" + i4,parentData:data9,parentDataProperty:i4,rootData}))){
vErrors = vErrors === null ? validate112.errors : vErrors.concat(validate112.errors);
errors = vErrors.length;
}
}
let i5 = data9.length;
let j2;
if(i5 > 1){
outer2:
for(;i5--;){
for(j2 = i5; j2--;){
if(func32(data9[i5], data9[j2])){
const err34 = {instancePath:instancePath+"/edges",schemaPath:"#/properties/edges/uniqueItems",keyword:"uniqueItems",params:{i: i5, j: j2},message:"must NOT have duplicate items (items ## "+j2+" and "+i5+" are identical)"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
break outer2;
}
}
}
}
}
else {
const err35 = {instancePath:instancePath+"/edges",schemaPath:"#/properties/edges/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
if(data.obligations !== undefined && func0.call(data, "obligations")){
let data11 = data.obligations;
if(Array.isArray(data11)){
if(data11.length < 11){
const err36 = {instancePath:instancePath+"/obligations",schemaPath:"#/properties/obligations/minItems",keyword:"minItems",params:{limit: 11},message:"must NOT have fewer than 11 items"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
const len3 = data11.length;
for(let i6=0; i6<len3; i6++){
if(!(validate114(data11[i6], {instancePath:instancePath+"/obligations/" + i6,parentData:data11,parentDataProperty:i6,rootData}))){
vErrors = vErrors === null ? validate114.errors : vErrors.concat(validate114.errors);
errors = vErrors.length;
}
}
let i7 = data11.length;
let j3;
if(i7 > 1){
outer3:
for(;i7--;){
for(j3 = i7; j3--;){
if(func32(data11[i7], data11[j3])){
const err37 = {instancePath:instancePath+"/obligations",schemaPath:"#/properties/obligations/uniqueItems",keyword:"uniqueItems",params:{i: i7, j: j3},message:"must NOT have duplicate items (items ## "+j3+" and "+i7+" are identical)"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
break outer3;
}
}
}
}
}
else {
const err38 = {instancePath:instancePath+"/obligations",schemaPath:"#/properties/obligations/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
if(data.trace_contract !== undefined && func0.call(data, "trace_contract")){
if(!(validate116(data.trace_contract, {instancePath:instancePath+"/trace_contract",parentData:data,parentDataProperty:"trace_contract",rootData}))){
vErrors = vErrors === null ? validate116.errors : vErrors.concat(validate116.errors);
errors = vErrors.length;
}
}
if(data.authoring_sources !== undefined && func0.call(data, "authoring_sources")){
let data14 = data.authoring_sources;
if(Array.isArray(data14)){
if(data14.length < 1){
const err39 = {instancePath:instancePath+"/authoring_sources",schemaPath:"#/properties/authoring_sources/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
const len4 = data14.length;
for(let i8=0; i8<len4; i8++){
let data15 = data14[i8];
if(data15 && typeof data15 == "object" && !Array.isArray(data15)){
if((data15.path === undefined) || (!(func0.call(data15, "path")))){
const err40 = {instancePath:instancePath+"/authoring_sources/" + i8,schemaPath:"#/properties/authoring_sources/items/required",keyword:"required",params:{missingProperty: "path"},message:"must have required property '"+"path"+"'"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
if((data15.locator === undefined) || (!(func0.call(data15, "locator")))){
const err41 = {instancePath:instancePath+"/authoring_sources/" + i8,schemaPath:"#/properties/authoring_sources/items/required",keyword:"required",params:{missingProperty: "locator"},message:"must have required property '"+"locator"+"'"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
for(const key5 of Object.keys(data15)){
if(!((key5 === "path") || (key5 === "locator"))){
const err42 = {instancePath:instancePath+"/authoring_sources/" + i8,schemaPath:"#/properties/authoring_sources/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
if(data15.path !== undefined && func0.call(data15, "path")){
let data16 = data15.path;
if(typeof data16 === "string"){
if(func176(data16) < 1){
const err43 = {instancePath:instancePath+"/authoring_sources/" + i8+"/path",schemaPath:"#/properties/authoring_sources/items/properties/path/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
else {
const err44 = {instancePath:instancePath+"/authoring_sources/" + i8+"/path",schemaPath:"#/properties/authoring_sources/items/properties/path/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
}
if(data15.locator !== undefined && func0.call(data15, "locator")){
let data17 = data15.locator;
if(typeof data17 === "string"){
if(func176(data17) < 1){
const err45 = {instancePath:instancePath+"/authoring_sources/" + i8+"/locator",schemaPath:"#/properties/authoring_sources/items/properties/locator/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
else {
const err46 = {instancePath:instancePath+"/authoring_sources/" + i8+"/locator",schemaPath:"#/properties/authoring_sources/items/properties/locator/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
}
else {
const err47 = {instancePath:instancePath+"/authoring_sources/" + i8,schemaPath:"#/properties/authoring_sources/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
let i9 = data14.length;
let j4;
if(i9 > 1){
outer4:
for(;i9--;){
for(j4 = i9; j4--;){
if(func32(data14[i9], data14[j4])){
const err48 = {instancePath:instancePath+"/authoring_sources",schemaPath:"#/properties/authoring_sources/uniqueItems",keyword:"uniqueItems",params:{i: i9, j: j4},message:"must NOT have duplicate items (items ## "+j4+" and "+i9+" are identical)"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
break outer4;
}
}
}
}
}
else {
const err49 = {instancePath:instancePath+"/authoring_sources",schemaPath:"#/properties/authoring_sources/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
if(data.selections !== undefined && func0.call(data, "selections")){
let data18 = data.selections;
if(Array.isArray(data18)){
const len5 = data18.length;
for(let i10=0; i10<len5; i10++){
if(!(validate124(data18[i10], {instancePath:instancePath+"/selections/" + i10,parentData:data18,parentDataProperty:i10,rootData}))){
vErrors = vErrors === null ? validate124.errors : vErrors.concat(validate124.errors);
errors = vErrors.length;
}
}
}
else {
const err50 = {instancePath:instancePath+"/selections",schemaPath:"#/properties/selections/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
if(data.windows !== undefined && func0.call(data, "windows")){
let data20 = data.windows;
if(data20 && typeof data20 == "object" && !Array.isArray(data20)){
for(const key6 of Object.keys(data20)){
const _errs50 = errors;
if(typeof key6 === "string"){
if(!pattern3.test(key6)){
const err51 = {instancePath:instancePath+"/windows",schemaPath:"#/definitions/id/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\"",propertyName:key6};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
else {
const err52 = {instancePath:instancePath+"/windows",schemaPath:"#/definitions/id/type",keyword:"type",params:{type: "string"},message:"must be string",propertyName:key6};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
var valid28 = _errs50 === errors;
if(!valid28){
const err53 = {instancePath:instancePath+"/windows",schemaPath:"#/properties/windows/propertyNames",keyword:"propertyNames",params:{propertyName: key6},message:"property name must be valid"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
}
for(const key7 of Object.keys(data20)){
if(!(validate126(data20[key7], {instancePath:instancePath+"/windows/" + key7.replace(/~/g, "~0").replace(/\//g, "~1"),parentData:data20,parentDataProperty:key7,rootData}))){
vErrors = vErrors === null ? validate126.errors : vErrors.concat(validate126.errors);
errors = vErrors.length;
}
}
}
else {
const err54 = {instancePath:instancePath+"/windows",schemaPath:"#/properties/windows/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
}
else {
const err55 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
validate94.errors = vErrors;
return errors === 0;
}


function validate87(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){
/*# sourceURL="urn:financasbot:next:provenance-graph:2" */;
let vErrors = null;
let errors = 0;
if(data && typeof data == "object" && !Array.isArray(data)){
if((data.schema_version === undefined) || (!(func0.call(data, "schema_version")))){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "schema_version"},message:"must have required property '"+"schema_version"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if((data.stage === undefined) || (!(func0.call(data, "stage")))){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "stage"},message:"must have required property '"+"stage"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if((data.contract_id === undefined) || (!(func0.call(data, "contract_id")))){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "contract_id"},message:"must have required property '"+"contract_id"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if((data.claim_contract === undefined) || (!(func0.call(data, "claim_contract")))){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "claim_contract"},message:"must have required property '"+"claim_contract"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if((data.snapshot_manifest === undefined) || (!(func0.call(data, "snapshot_manifest")))){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "snapshot_manifest"},message:"must have required property '"+"snapshot_manifest"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if((data.material_registry === undefined) || (!(func0.call(data, "material_registry")))){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "material_registry"},message:"must have required property '"+"material_registry"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if((data.operator_registry === undefined) || (!(func0.call(data, "operator_registry")))){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "operator_registry"},message:"must have required property '"+"operator_registry"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if((data.metric_evaluator_registry === undefined) || (!(func0.call(data, "metric_evaluator_registry")))){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "metric_evaluator_registry"},message:"must have required property '"+"metric_evaluator_registry"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if((data.graphs === undefined) || (!(func0.call(data, "graphs")))){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "graphs"},message:"must have required property '"+"graphs"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
for(const key0 of Object.keys(data)){
if(!(func0.call(schema225.properties, key0))){
const err9 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.schema_version !== undefined && func0.call(data, "schema_version")){
if(2 !== data.schema_version){
const err10 = {instancePath:instancePath+"/schema_version",schemaPath:"#/properties/schema_version/const",keyword:"const",params:{allowedValue: 2},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.stage !== undefined && func0.call(data, "stage")){
if("authoring" !== data.stage){
const err11 = {instancePath:instancePath+"/stage",schemaPath:"#/properties/stage/const",keyword:"const",params:{allowedValue: "authoring"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.contract_id !== undefined && func0.call(data, "contract_id")){
let data2 = data.contract_id;
if(typeof data2 === "string"){
if(!pattern0.test(data2)){
const err12 = {instancePath:instancePath+"/contract_id",schemaPath:"#/definitions/sourceRef/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/contract_id",schemaPath:"#/definitions/sourceRef/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.claim_contract !== undefined && func0.call(data, "claim_contract")){
if(!(validate88(data.claim_contract, {instancePath:instancePath+"/claim_contract",parentData:data,parentDataProperty:"claim_contract",rootData}))){
vErrors = vErrors === null ? validate88.errors : vErrors.concat(validate88.errors);
errors = vErrors.length;
}
}
if(data.snapshot_manifest !== undefined && func0.call(data, "snapshot_manifest")){
if(!(validate88(data.snapshot_manifest, {instancePath:instancePath+"/snapshot_manifest",parentData:data,parentDataProperty:"snapshot_manifest",rootData}))){
vErrors = vErrors === null ? validate88.errors : vErrors.concat(validate88.errors);
errors = vErrors.length;
}
}
if(data.material_registry !== undefined && func0.call(data, "material_registry")){
if(!(validate88(data.material_registry, {instancePath:instancePath+"/material_registry",parentData:data,parentDataProperty:"material_registry",rootData}))){
vErrors = vErrors === null ? validate88.errors : vErrors.concat(validate88.errors);
errors = vErrors.length;
}
}
if(data.operator_registry !== undefined && func0.call(data, "operator_registry")){
if(!(validate88(data.operator_registry, {instancePath:instancePath+"/operator_registry",parentData:data,parentDataProperty:"operator_registry",rootData}))){
vErrors = vErrors === null ? validate88.errors : vErrors.concat(validate88.errors);
errors = vErrors.length;
}
}
if(data.metric_evaluator_registry !== undefined && func0.call(data, "metric_evaluator_registry")){
if(!(validate88(data.metric_evaluator_registry, {instancePath:instancePath+"/metric_evaluator_registry",parentData:data,parentDataProperty:"metric_evaluator_registry",rootData}))){
vErrors = vErrors === null ? validate88.errors : vErrors.concat(validate88.errors);
errors = vErrors.length;
}
}
if(data.graphs !== undefined && func0.call(data, "graphs")){
let data8 = data.graphs;
if(Array.isArray(data8)){
if(data8.length < 1){
const err14 = {instancePath:instancePath+"/graphs",schemaPath:"#/properties/graphs/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
const len0 = data8.length;
for(let i0=0; i0<len0; i0++){
if(!(validate94(data8[i0], {instancePath:instancePath+"/graphs/" + i0,parentData:data8,parentDataProperty:i0,rootData}))){
vErrors = vErrors === null ? validate94.errors : vErrors.concat(validate94.errors);
errors = vErrors.length;
}
}
let i1 = data8.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func32(data8[i1], data8[j0])){
const err15 = {instancePath:instancePath+"/graphs",schemaPath:"#/properties/graphs/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err16 = {instancePath:instancePath+"/graphs",schemaPath:"#/properties/graphs/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
}
else {
const err17 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
validate87.errors = vErrors;
return errors === 0;
}
```
