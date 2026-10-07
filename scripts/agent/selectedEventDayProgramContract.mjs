// Independent BUILD-only conformance contract. No lowerNextProofProgram,
// graphCompiler, baseline source, observed IR, trace or guest is imported.
// Closed packaging and reviewed primitive bytes are shared infrastructure;
// executable statements and their complete ordering derive from sealed authorship.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { parse } from 'acorn';
import { buildCommonJsGuestBundle } from './buildNextProvenanceArtifacts.mjs';
import { selectedEventDayProgramInputs, selectedEventDayProgramFamily } from '../../src/next/provenance/selectedEventDayProfile.js';
import { canonicalValue } from '../../src/next/kernel/canonicalValue.js';
import { analyzeSelectedEventDayExecutableClosure } from './analyzeSelectedEventDayExecutableClosure.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sealed = new WeakMap();
const conformances = new WeakMap();
const fail = code => { throw new Error('selected_day_program_' + code); };
const q = JSON.stringify;
const sha = source => 'sha256:' + createHash('sha256').update(source, 'utf8').digest('hex');
const recipe = Object.freeze(['scalarProofCore', 'proofProgramData', 'proofObservedValues', 'observationScalars',
    'operatorTypes', 'literalTypes', 'civilCalendar', 'materialFingerprintCore', 'proofSha256', 'collectionProofCore']);
const prologue = `'use strict';
const { createScalarProofPrimitives } = require('./scalarProofCore');
const { copyProgramData } = require('./proofProgramData');
const { canonicalValue } = require('../kernel/canonicalJson');
const { sha256Utf8 } = require('./proofSha256');
const { createMaterialFingerprint } = require('./materialFingerprintCore');
const { createCollectionProofPrimitives } = require('./collectionProofCore');
const { validateLiteral } = require('./literalTypes');
const { readObservedIdentity: identity, sequence, period } = require('./proofObservedValues');
const primitives = createScalarProofPrimitives(copyProgramData, canonicalValue);
const scalar=primitives.evaluateScalarProof; const collection=createCollectionProofPrimitives(primitives.compareTypedScalars);
function validated(value,type) { primitives.compareTypedScalars(type,value,value);return value; }
const fingerprint = createMaterialFingerprint(copyProgramData,value=>sha256Utf8(canonicalValue(value)));
function checkedNode(handle,kind) { if (identity(handle).kind!==kind) throw new Error('proof_program_node_kind'); return handle; }
function checkedPeriod(value) { scalar({id:"period_eq",args:["period","period"],semantics:"equal_period_kind_and_fields"},[{type:{form:"period"},value},{type:{form:"period"},value}]); return value; }
`;
function passive(raw, keys) {
    // Opaque authority only. Do not invoke getters while extracting it.
    if (!raw || typeof raw !== 'object' || types.isProxy(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== keys.length || keys.some(k => !d[k]?.enumerable || !Object.hasOwn(d[k], 'value'))) fail('input');
    return Object.fromEntries(keys.map(k => [k, d[k].value]));
}
function ast(source) {
    if (typeof source !== 'string' || Buffer.byteLength(source) > 8 * 1024 * 1024) fail('source');
    try { return parse(source, { ecmaVersion: 2022 }); } catch { fail('syntax'); }
}
function clean(value) {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clean);
    return Object.fromEntries(Object.entries(value).filter(([key]) => !['start', 'end', 'raw'].includes(key))
        .map(([key, child]) => [key, clean(child)]));
}
function pathRead(e) {
    if (!['field_ref', 'claim_ref'].includes(e.kind) || !Array.isArray(e.segments) || !e.segments.length) fail('expression_pending');
    let receiver = e.kind === 'field_ref' ? `operands.node(${q(e.alias)})` : 'operands.claim()';
    for (const part of e.segments) receiver += `.get(${q(part)})`;
    return receiver;
}
function operand(row, phase) {
    const e = row.expression;
    switch (e.kind) {
    case 'literal': return q(e.value);
    case 'period_literal': return q(e.period);
    case 'field_ref': case 'claim_ref': {
        const value = pathRead(e);
        if (['period', 'range'].includes(row.type.form)) return `period(${value},${phase === 'proof'})`;
        if (['sequence', 'set'].includes(row.type.form)) return `sequence(${value},value=>value)`;
        return value;
    }
    case 'node_ref': return `identity(operands.node(${q(e.alias)}))`;
    case 'edge_ref': return `identity(operands.edge(${q(e.id)}))`;
    default: fail('expression_pending');
    }
}
function line(predicate, input, phase, dispatchTarget) {
    const { operator: op, operands } = predicate;
    if (op.id === 'fingerprint_is') {
        const [node, expected] = operands;
        if (node.expression.kind !== 'node_ref' || expected.expression.kind !== 'literal') fail('fingerprint');
        const descriptor = input.materials[node.expression.alias];
        if (!descriptor || descriptor.kind !== node.type.kind) fail('fingerprint');
        return `if (fingerprint(checkedNode(operands.node(${q(node.expression.alias)}),${q(node.type.kind)}),`
            + `${q(descriptor)},"enumerated_presence") !== ${operand(expected, phase)}) all = false;`;
    }
    // Declarative supported scalar grammar, not IDs/corpus-specific cases.
    // Unsupported operators block the contract instead of trusting native output.
    if (!['kind_is', 'ref_targets_node', 'date_in_period', 'state_is', 'opposite_sign', 'field_eq', 'period_eq', 'eq', 'not_eq'].includes(op.id)) fail('operator_pending');
    const values = operands.map(row => `{type:${q(row.type)},value:${predicate.id === dispatchTarget
        ? `rootOperands.operand(()=>${operand(row, phase)})` : operand(row, phase)}}`);
    return `if (!scalar(${q(op)},[${values.join(',')}])) all = false;`;
}
const label = (role, id, suffix = '') => role + '_' + Buffer.from(id, 'utf8').toString('hex') + suffix;
function entry(input, phase, dispatchTarget = null) {
    if (Object.keys(input.windows).length || phase === 'derivation' && input.selections.length) fail('class');
    const statements = new Map(input.predicates.map(p => [p.id, line(p, input, phase, dispatchTarget)]));
    if (statements.size !== input.predicates.length) fail('duplicate');
    const mark = (role, id, suffix = '') => `${label(role, id, suffix)}:{${dispatchTarget
        ? `if(!rootOperands.dispatch(()=>{let all=true;${statements.get(id)}return all;}))all=false;`
        : statements.get(id)}}`;
    const selectionCode = input.selections.map((s, si) => {
        if (s.cases.length !== 1 || s.cases[0].mode !== 'include_if_all') fail('class');
        const cases = s.cases.map((c, ci) => {
            if (c.predicates.some(id => !statements.has(id))) fail('guard');
            return `case ${ci}:{const observed=identity(member);`
                + `if(observed.kind!==${q(c.identity.kind)}||observed.ref_id!==${q(c.identity.ref_id)}||observed.version!==${q(c.identity.version)})throw new Error('proof_program_selection_identity');`
                + `const operands=Object.freeze({node:alias=>alias===${q(c.node)}?member:rootOperands.node(alias),`
                + `claim:()=>rootOperands.claim(),set:name=>rootOperands.set(name),edge:id=>rootOperands.edge(id),`
                + `resolveReference:(alias,field,ref)=>rootOperands.resolveReference(alias,field,ref),memberEdge:(node,field)=>rootOperands.memberEdge(node,field)});`
                + `let all=true;${c.predicates.map(id => mark('proof_selection', id, `_${si}_${ci}`)).join('\n')}return all;}`;
        });
        return `{let seen=0;operands.select(${q(s.candidate_set)},${q(s.selected_set)},(member,index)=>{seen++;switch(index){`
            + `${cases.join('\n')}default:throw new Error('proof_program_selection_candidate');}});`
            + `if(seen!==${s.cases.length})throw new Error('proof_program_selection_roster');}`;
    });
    const origin = dispatchTarget ? `if(rootOperands.selectedDayOrigin()!==true)throw new Error('proof_program_selected_day_origin');` : '';
    return prologue + `function run(operands) { const rootOperands=operands;${origin}\n${selectionCode.join('\n')}\nlet all = true;\n`
        + input.predicates.map(p => mark(phase === 'proof' ? 'proof_assertion' : 'derivation_guard', p.id)).join('\n')
        + '\nreturn all; }\nmodule.exports = {run};\n';
}
export function sealSelectedEventDayProgramExpectation(raw) { return sealProgram(raw, false); }
export function sealSelectedEventDayDispatchProgramExpectation(raw) { return sealProgram(raw, true); }
function helpers() {
    const rows = recipe.map(name => ({ path: 'provenance/' + name + '.js', source: fs.readFileSync(path.join(root,
        'src/next/provenance/' + name + '.js'), 'utf8') }));
    rows.push({ path: 'kernel/canonicalJson.js', source: fs.readFileSync(path.join(root, 'src/next/kernel/canonicalJson.js'), 'utf8') });
    return rows;
}
function sealProgram(raw, dispatched) {
    const { expectation } = passive(raw, ['expectation']);
    const input = selectedEventDayProgramInputs(expectation);
    const captured = helpers();
    const bundles = Object.fromEntries(['derivation', 'proof'].map(phase => [phase, buildCommonJsGuestBundle({
        sources: [...captured, { path: 'provenance/program.js', source: entry(input[phase], phase,
            dispatched && phase === 'proof' ? input.target_predicate_id : null) }],
        entry: 'provenance/program.js', exportName: 'run' })]));
    const source = (dispatched ? `/* selected-event-day-path/v1 ${input.variant} ${input.precommit_hash} */\n` : '')
        + `/* phase-profile ${input.phase.sha256}; registry ${input.phase.registry_sha256} */\n`
        + `(function(operands){'use strict';if(operands.phase==="derivation")return (${bundles.derivation.source})(operands);`
        + `if(operands.phase==="proof")return (${bundles.proof.source})(operands);throw new Error('proof_program_phase');})`;
    const receipt = Object.freeze({ stage: 'selected_day_program_expectation_sealed_only', variant: input.variant,
        precommit_hash: input.precommit_hash, expected_ir_hash: input.expected_ir_hash,
        expected_source_sha256: sha(source), helper_sources: Object.freeze(captured.map(h => Object.freeze({ path: h.path, sha256: sha(h.source) }))),
        shared_packaging_contract: true, dispatch_interface: dispatched,
        compiler_admitted: false, profile_witness_qualified: false });
    sealed.set(receipt, { ast: canonicalValue(clean(ast(source))) });
    return receipt;
}
export function sealSelectedEventDayCommonProgramExpectation(raw) {
    const { expectations } = passive(raw, ['expectations']);
    const family = selectedEventDayProgramFamily(expectations);
    const captured = helpers();
    const bundle = (input, phase, target = null) => buildCommonJsGuestBundle({ sources: [...captured,
        { path: 'provenance/program.js', source: entry(input, phase, target) }], entry: 'provenance/program.js', exportName: 'run' }).source;
    const derivation = bundle(family.C.derivation, 'derivation');
    const proofs = Object.fromEntries(['C', 'M', 'S'].map(v => [v, bundle(family[v].proof, 'proof', family[v].target_predicate_id)]));
    const source = `/* selected-event-day-path/v1 common ${family.C.precommit_hash} */\n`
        + `/* phase-profile ${family.C.phase.sha256}; registry ${family.C.phase.registry_sha256} */\n`
        + `(function(operands){'use strict';if(operands.phase==="derivation")return (${derivation})(operands);`
        + `if(operands.phase==="proof"){const variant=operands.selectedDayVariant();`
        + ['C', 'M', 'S'].map(v => `if(variant===${q(v)})return (${proofs[v]})(operands);`).join('')
        + `throw new Error('proof_program_selected_day_variant');}throw new Error('proof_program_phase');})`;
    const receipt = Object.freeze({ stage: 'selected_day_common_program_expectation_sealed_only',
        precommit_hash: family.C.precommit_hash, expected_source_sha256: sha(source),
        helper_sources: Object.freeze(captured.map(h => Object.freeze({ path: h.path, sha256: sha(h.source) }))),
        expected_ir_hashes: Object.freeze(Object.fromEntries(['C', 'M', 'S'].map(v => [v, family[v].expected_ir_hash]))),
        common_program_identity: true, shared_packaging_contract: true, dispatch_interface: true,
        compiler_admitted: false, profile_witness_qualified: false });
    const selectedSet = family.C.proof.selections[0].selected_set;
    if (['M', 'S'].some(v => family[v].proof.selections[0].selected_set !== selectedSet)) fail('selection_family');
    sealed.set(receipt, { ast: canonicalValue(clean(ast(source))), selectedSet }); return receipt;
}
export function verifySelectedEventDayProgram(raw) {
    const { programExpectation, source } = passive(raw, ['programExpectation', 'source']);
    const expected = sealed.get(programExpectation); if (!expected) fail('authority');
    // Pin the complete bytes too: comment/whitespace changes in a helper or
    // the phase commitment cannot be laundered through syntax normalization.
    if (typeof source !== 'string' || sha(source) !== programExpectation.expected_source_sha256) fail('source_identity');
    if (canonicalValue(clean(ast(source))) !== expected.ast) fail('conformance');
    const executableAbsence = expected.selectedSet === undefined ? null
        : analyzeSelectedEventDayExecutableClosure({ source, selectedSet: expected.selectedSet });
    const receipt = Object.freeze({ stage: 'selected_day_whole_program_checked_only', whole_program_conformance: true,
        program_sha256: sha(source), static_program_closure_checked: true,
        executable_closure_absence_proved: executableAbsence !== null, external_leases_implemented: false,
        measured_tcb_admission: false, profile_witness_qualified: false, financial_release_eligible: false });
    conformances.set(receipt, { programExpectation, executableAbsence }); return receipt;
}
export function resolveSelectedEventDayProgramConformance(receipt) {
    const row = conformances.get(receipt); if (!row) fail('conformance_authority');
    return row.programExpectation;
}
export function resolveSelectedEventDayExecutableAbsence(receipt) {
    const row = conformances.get(receipt); if (!row?.executableAbsence) fail('absence_authority');
    return row.executableAbsence;
}
