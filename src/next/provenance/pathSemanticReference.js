'use strict';
// HARNESS reference only. No compiler, evaluator, proof runtime or actual input.
const { createHash } = require('node:crypto');
const { types } = require('node:util');
const { admittedDocuments } = require('./packageContract');
const { canonicalValue, freezeDeep } = require('../kernel/canonicalValue');
const prefix = 'docs/contracts/next/provenance-v2/';
const references = new WeakMap();
const unavailable = Symbol('unavailable');
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const equal = (a, b) => canonicalValue(a) === canonicalValue(b);
const fail = code => { throw new Error('path_semantic_reference_' + code); };
const integerPair = (left, right) => Number.isSafeInteger(left) && Number.isSafeInteger(right);
// Independent Gregorian civil reference: string ordering is chronological only
// after validating the exact YYYY-MM-DD domain. No Date/timezone or guest helper.
function civilParts(value, monthOnly = false) {
    if (typeof value !== 'string') return null;
    const match = (monthOnly ? /^(\d{4})-(\d{2})$/ : /^(\d{4})-(\d{2})-(\d{2})$/).exec(value);
    if (!match) return null;
    const year = Number(match[1]), month = Number(match[2]);
    if (year < 1 || month < 1 || month > 12) return null;
    if (monthOnly) return { year, month };
    const day = Number(match[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day >= 1 && day <= days[month - 1] ? { year, month, day } : null;
}
function referenceCivilDateContained(date, period) {
    if (!civilParts(date) || !period || typeof period !== 'object' || Array.isArray(period)
        || types.isProxy(period) || ![Object.prototype, null].includes(Object.getPrototypeOf(period))) return null;
    const descriptors = Object.getOwnPropertyDescriptors(period);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some(key => typeof key !== 'string' || !descriptors[key].enumerable
        || !Object.hasOwn(descriptors[key], 'value'))) return null;
    const p = Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
    const exact = names => keys.length === names.length && names.every(name => Object.hasOwn(p, name));
    if (p.kind === 'range') {
        if (!exact(['kind', 'start', 'end', 'start_inclusive', 'end_inclusive'])
            || !civilParts(p.start) || !civilParts(p.end) || p.start > p.end
            || typeof p.start_inclusive !== 'boolean' || typeof p.end_inclusive !== 'boolean') return null;
        return (date > p.start || date === p.start && p.start_inclusive)
            && (date < p.end || date === p.end && p.end_inclusive);
    }
    if (!exact(['kind', 'value'])) return null;
    if (['month', 'statement_competence', 'budget_cycle'].includes(p.kind))
        return civilParts(p.value, true) ? date.slice(0, 7) === p.value : null;
    if (!['date', 'statement_due', 'through'].includes(p.kind) || !civilParts(p.value)) return null;
    return p.kind === 'through' ? date <= p.value : date === p.value;
}
// A declared semantic reference domain, not a list of target IDs. Unsupported
// operator classes stay pending; no guest/proof implementation is a fallback.
const operators = Object.freeze({
    eq: equal, not_eq: (left, right) => !equal(left, right), field_eq: equal,
    period_eq: equal, state_is: equal,
    date_in_period: (date, period) => referenceCivilDateContained(date, period) ?? unavailable,
    abs_eq: (left, right) => integerPair(left, right) ? Math.abs(left) === Math.abs(right) : unavailable,
    opposite_sign: (left, right) => integerPair(left, right) ? left !== 0 && right !== 0
        && (left < 0) !== (right < 0) : unavailable
});
function sealPathSemanticReference(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw); const names = ['packageReceipt', 'candidate'];
    if (Reflect.ownKeys(d).length !== names.length || names.some(name => !d[name]?.enumerable
        || !Object.hasOwn(d[name], 'value'))) fail('input');
    const candidate = d.candidate.value;
    const { readPathSemanticCandidate } = require('./pathMutationInventory');
    const capability = readPathSemanticCandidate(candidate);
    if (!capability) fail('candidate_authority');
    const docs = admittedDocuments(d.packageReceipt.value);
    if (!equal(docs.map(({ path, sha256 }) => ({ path, sha256 })), capability.authority_refs)) fail('package_authority');
    const byPath = new Map(docs.map(row => [row.path, row.value]));
    const corpus = byPath.get(prefix + 'graphs-v2.json');
    const original = corpus.graphs.find(row => row.fact_key === candidate.target.fact_key);
    if (sha(JSON.stringify(original)) !== capability.baseline_graph_sha256
        || sha(JSON.stringify(candidate.graph)) !== capability.graph_sha256) fail('graph_authority');
    const restored = JSON.parse(JSON.stringify(candidate.graph));
    let container = restored.predicates.find(row => row.id === candidate.target.predicate_id);
    for (const token of candidate.patch.location.slice(0, -1)) container = container[token];
    container[candidate.patch.location.at(-1)] = candidate.patch.before;
    if (!equal(restored, original)) fail('secondary_mutation');
    const claim = byPath.get(corpus.claim_contract.path).claims.find(row => row.fact_key === original.fact_key);
    const snapshots = byPath.get(corpus.snapshot_manifest.path).snapshots;
    const snapshotMap = new Map(snapshots.map(row => [canonicalValue([row.kind, row.ref_id, row.version]), row.payload]));
    function at(value, segments) {
        for (const segment of segments) {
            if (!value || typeof value !== 'object' || !Object.hasOwn(value, segment)) return unavailable;
            value = value[segment];
        }
        return value;
    }
    function field(graph, locator) {
        const node = graph.nodes[locator.node];
        if (node?.binding !== 'snapshot') return unavailable;
        return at(snapshotMap.get(canonicalValue([node.kind, node.ref_id, node.version])), locator.segments);
    }
    function operand(graph, arg) {
        if (arg.field) return field(graph, arg.field);
        if (arg.claim) return at(claim, arg.claim.segments);
        if (arg.literal) return arg.literal.value;
        if (arg.period_literal) return arg.period_literal;
        if (arg.presence) {
            const node = graph.nodes[arg.presence.node];
            if (node?.binding !== 'snapshot') return unavailable;
            const payload = snapshotMap.get(canonicalValue([node.kind, node.ref_id, node.version]));
            if (!payload) return unavailable;
            return at(payload, arg.presence.segments) !== unavailable;
        }
        return unavailable;
    }
    const baseline = original.predicates.find(row => row.id === candidate.target.predicate_id);
    const mutant = candidate.graph.predicates.find(row => row.id === baseline.id);
    const operation = operators[baseline.op];
    const before = baseline.args.map(arg => operand(original, arg));
    const after = mutant.args.map(arg => operand(candidate.graph, arg));
    const supported = operation && before.length === 2 && after.length === 2
        && [...before, ...after].every(value => value !== unavailable);
    const baselineSatisfied = supported ? operation(...before) : unavailable;
    const mutantSatisfied = supported ? operation(...after) : unavailable;
    const available = typeof baselineSatisfied === 'boolean' && typeof mutantSatisfied === 'boolean';
    const result = freezeDeep({ stage: 'path_semantic_reference_sealed_before_dp',
        mutation_id: capability.mutation_id, candidate_id: capability.candidate_id,
        predicate_id: baseline.id, operator: baseline.op, available,
        baseline_satisfied: available ? baselineSatisfied : null,
        mutant_satisfied: available ? mutantSatisfied : null,
        expected_violations: [baseline.atom], financial_receipt: false,
        source: 'admitted_frozen_claim_and_primary_snapshot_only',
        world_sha256: sha(canonicalValue(docs.map(({ path, sha256 }) => ({ path, sha256 })))),
        operands_sha256: available ? sha(canonicalValue({ before, after })) : null });
    references.set(result, result);
    return result;
}
const readPathSemanticReference = raw => references.get(raw) ?? null;
// The pure reference export carries no candidate capability or execution credit.
module.exports = { sealPathSemanticReference, readPathSemanticReference, referenceCivilDateContained };
