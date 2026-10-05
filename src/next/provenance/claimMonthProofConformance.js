'use strict';
// Independent syntax conformance: no compiler, lowerer, evaluator or guest
// imports/execution. The expected target comes from the profile's authored
// period contract, never from the emitted mutant expression/site map.
const { parse } = require("acorn");
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
