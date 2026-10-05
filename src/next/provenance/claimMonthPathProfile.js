'use strict';

const { types } = require('node:util');
const { copyData } = require('./observationContract');
const { canonicalValue, digest, freezeDeep } = require('../kernel/canonicalValue');
const transports = new WeakMap();
const PROFILE = 'claim-month-path-completion/v1';
const LOCATOR = Object.freeze(['qualification', 'alternative_period']);
const fail = code => { throw new Error(`month_path_transport_${code}`); };
const same = (a, b) => canonicalValue(a) === canonicalValue(b);
const clone = value => structuredClone(copyData(value));

function passiveList(value) {
    if (!Array.isArray(value) || types.isProxy(value)) fail('passive');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== value.length + 1) fail('passive');
    const result = [];
    for (let index = 0; index < value.length; index++) {
        const d = descriptors[index];
        if (!d || !Object.hasOwn(d, 'value') || !d.enumerable) fail('passive');
        result.push(clone(d.value));
    }
    return result;
}

function alternateMonth(value) {
    if (typeof value !== 'string' || !/^(?!0000)[0-9]{4}-(0[1-9]|1[0-2])$/.test(value)) fail('month');
    if (value === '9999-12') return '9999-11';
    const year = Number(value.slice(0, 4)), month = Number(value.slice(5));
    return `${String(year + (month === 12 ? 1 : 0)).padStart(4, '0')}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}`;
}

function contains(value, id) {
    if (value === id) return true;
    return value !== null && typeof value === 'object' && Object.values(value).some(child => contains(child, id));
}

// A static, narrowly named transport certificate, NOT compiler admission,
// runtime authority, a validated parent or semantic mutation credit. The
// qualification compiler must still run every pass over the complete M.
function prepareClaimMonthPathTransport(options) {
    if (!options || types.isProxy(options)) fail('passive');
    const descriptors = Object.getOwnPropertyDescriptors(options);
    if (Reflect.ownKeys(descriptors).sort().join(',') !== 'claims,fact_key,graphs,predicate_id'
        || Object.values(descriptors).some(d => !Object.hasOwn(d, 'value') || !d.enumerable)) fail('passive');
    const graphs = passiveList(descriptors.graphs.value), claims = passiveList(descriptors.claims.value);
    const fact_key = descriptors.fact_key.value, predicate_id = descriptors.predicate_id.value;
    if (typeof fact_key !== 'string' || typeof predicate_id !== 'string') fail('target');
    const matches = graphs.filter(g => g.fact_key === fact_key), claimMatches = claims.filter(c => c.fact_key === fact_key);
    if (matches.length !== 1 || claimMatches.length !== 1) fail('target');
    const graph = matches[0], claim = claimMatches[0];
    if (claims.some(c => Object.hasOwn(c, 'qualification')) || graphs.some(g => Object.hasOwn(g, 'qualification'))) fail('reserved');
    const predicates = graph.predicates.filter(p => p.id === predicate_id);
    if (predicates.length !== 1) fail('target');
    const predicate = predicates[0];
    if (claim.period?.kind !== 'month' || Object.keys(claim.period).sort().join(',') !== 'kind,value'
        || predicate.op !== 'period_eq' || predicate.atom !== 'period' || predicate.obligation !== 'period'
        || predicate.args.length !== 2 || !same(predicate.args[0], { claim: { segments: ['period'] } })
        || !same(predicate.args[1], { period_literal: claim.period })) fail('class');
    const alternative = { kind: 'month', value: alternateMonth(claim.period.value) };
    // Independent authored consumer search, not the documentary witness's map.
    // Obligation references are the intended target obligation, not execution
    // consumers. Every other reference to the target remains forbidden.
    for (const [key, value] of Object.entries(graph)) {
        if (!['predicates', 'obligations'].includes(key) && contains(value, predicate_id)) fail('consumer');
    }
    if (graph.predicates.some(p => p.id !== predicate_id && contains(p, predicate_id))) fail('consumer');
    // This validates C, including its anchor and all other descriptor bindings.
    // It never catches or reclassifies a checker failure.
    require('./claimRequirementCore').validateClaimRequirements({ graphs, claims });
    const mutant = structuredClone(graphs);
    mutant.find(g => g.fact_key === fact_key).predicates.find(p => p.id === predicate_id)
        .args[0].claim.segments = [...LOCATOR];
    const sidecar = { qualification: { alternative_period: alternative } };
    const subobligation = { name: 'claim.period.binding_locator', fact_key, predicate_id, operand_index: 0 };
    const receipt = freezeDeep({ profile: PROFILE, stage: 'static_locator_transport_prepared_only',
        normative_commit: '04eb9545516d100aa45e1ac6d8ebfda444fafbd7', subobligation,
        baseline_authorship_hash: digest(graphs), mutant_authorship_hash: digest(mutant), core_claim_hash: digest(claims),
        sidecar_hash: digest(sidecar), sidecar, mutant_graphs: mutant,
        semantic_reference: { original_period: structuredClone(claim.period), alternative_period: alternative, target_result: false },
        original_corpus_witness_qualified: false, profile_witness_qualified: false,
        dp_execution: false, financial_release_eligible: false });
    transports.set(receipt, { baseline_hash: receipt.baseline_authorship_hash,
        mutant_hash: receipt.mutant_authorship_hash, claims_hash: receipt.core_claim_hash,
        subobligation: receipt.subobligation, locator: LOCATOR });
    return receipt;
}

function assertClaimMonthPathTransport({ transport, graphs, claims, variant = 'M' }) {
    const context = transports.get(transport);
    if (!context) fail('authority');
    if (!['C', 'M', 'S'].includes(variant)) fail('variant');
    const checkedGraphs = passiveList(graphs), checkedClaims = passiveList(claims);
    if (digest(checkedGraphs) !== (variant === 'M' ? context.mutant_hash : context.baseline_hash)
        || digest(checkedClaims) !== context.claims_hash) fail('world');
    return freezeDeep({ subobligation: context.subobligation, locator: context.locator,
        type: { form: 'period', periodKind: 'month' }, variant });
}

module.exports = { prepareClaimMonthPathTransport, assertClaimMonthPathTransport, PROFILE };
