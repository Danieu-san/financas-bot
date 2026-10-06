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
// Independent 400-year civil table, not the guest civilCalendar algorithm.
// Values below are reference relations only and mint no execution authority.
const yearLengths = Array.from({ length: 400 }, (_, index) => {
    const year = index + 1;
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365;
});
const yearPrefix = [0];
yearLengths.forEach(length => yearPrefix.push(yearPrefix.at(-1) + length));
const monthDays = ({ year, month }) => month === 2
    ? year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28
    : [4, 6, 9, 11].includes(month) ? 30 : 31;
function civilOrdinal(parts) {
    const previousYears = parts.year - 1;
    let value = Math.floor(previousYears / 400) * yearPrefix[400]
        + yearPrefix[previousYears % 400] + parts.day;
    for (let month = 1; month < parts.month; month++) value += monthDays({ year: parts.year, month });
    return value;
}
const maximumOrdinal = civilOrdinal({ year: 9999, month: 12, day: 31 });
const safeInteger = value => Number.isSafeInteger(value) && !Object.is(value, -0);
function ownRecord(value, names) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return null;
    const d = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(d).length !== names.length || names.some(name => !d[name]?.enumerable
        || !Object.hasOwn(d[name], 'value'))) return null;
    return Object.fromEntries(names.map(name => [name, d[name].value]));
}
const civilRelations = Object.freeze({
    day_of_month_matches: { arity: 3, evaluate: ([date, day]) => {
        const parts = civilParts(date);
        return parts && safeInteger(day) && day >= 1 && day <= 31 ? parts.day === day : null;
    } },
    month_bounds_match: { arity: 4, evaluate: ([month, start, end]) => {
        const parts = civilParts(month, true), first = civilParts(start), last = civilParts(end);
        return parts && first && last ? start === `${month}-01`
            && end === `${month}-${String(monthDays(parts)).padStart(2, '0')}` : null;
    } },
    civil_offset_matches: { arity: 5, evaluate: ([origin, amount, unit, target]) => {
        const from = civilParts(origin), to = civilParts(target);
        if (!from || !to || !safeInteger(amount)) return null;
        if (unit === 'day') {
            const expected = civilOrdinal(from) + amount;
            return safeInteger(expected) && expected >= 1 && expected <= maximumOrdinal
                ? expected === civilOrdinal(to) : null;
        }
        if (unit !== 'month') return null;
        const index = (from.year - 1) * 12 + from.month - 1 + amount;
        if (!safeInteger(index) || index < 0 || index >= 9999 * 12) return null;
        const year = Math.floor(index / 12) + 1, month = index % 12 + 1;
        if (from.day > monthDays({ year, month })) return null;
        return to.year === year && to.month === month && to.day === from.day;
    } },
    inclusive_day_count_matches: { arity: 3, evaluate: ([value, count]) => {
        const range = ownRecord(value, ['kind', 'start', 'end', 'start_inclusive', 'end_inclusive']);
        if (!range || range.kind !== 'range' || range.start_inclusive !== true || range.end_inclusive !== true
            || !safeInteger(count) || count < 1) return null;
        const start = civilParts(range.start), end = civilParts(range.end);
        return start && end && range.start <= range.end
            ? civilOrdinal(end) - civilOrdinal(start) + 1 === count : null;
    } }
});
function referenceCivilRelation(operator, args) {
    if (typeof operator !== 'string' || !Object.hasOwn(civilRelations, operator)
        || !Array.isArray(args) || types.isProxy(args) || Object.getPrototypeOf(args) !== Array.prototype) return null;
    const spec = civilRelations[operator], d = Object.getOwnPropertyDescriptors(args);
    if (d.length?.value !== spec.arity || Reflect.ownKeys(d).length !== spec.arity + 1
        || Array.from({ length: spec.arity }, (_, index) => index).some(index => !d[index]?.enumerable
            || !Object.hasOwn(d[index], 'value'))) return null;
    const values = Array.from({ length: spec.arity }, (_, index) => d[index].value);
    if (values.at(-1) !== 'proleptic_gregorian') return null;
    return spec.evaluate(values);
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
    eq: { arity: 2, evaluate: equal }, not_eq: { arity: 2, evaluate: (left, right) => !equal(left, right) },
    field_eq: { arity: 2, evaluate: equal }, period_eq: { arity: 2, evaluate: equal },
    state_is: { arity: 2, evaluate: equal },
    date_in_period: { arity: 2, evaluate: (date, period) => referenceCivilDateContained(date, period) ?? unavailable },
    abs_eq: { arity: 2, evaluate: (left, right) => integerPair(left, right) ? Math.abs(left) === Math.abs(right) : unavailable },
    opposite_sign: { arity: 2, evaluate: (left, right) => integerPair(left, right) ? left !== 0 && right !== 0
        && (left < 0) !== (right < 0) : unavailable },
    ...Object.fromEntries(Object.entries(civilRelations).map(([operator, spec]) => [operator,
        { arity: spec.arity, evaluate: (...args) => referenceCivilRelation(operator, args) ?? unavailable }]))
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
    const operation = Object.hasOwn(operators, baseline.op) ? operators[baseline.op] : null;
    const before = baseline.args.map(arg => operand(original, arg));
    const after = mutant.args.map(arg => operand(candidate.graph, arg));
    const supported = operation && before.length === operation.arity && after.length === operation.arity
        && [...before, ...after].every(value => value !== unavailable);
    const baselineSatisfied = supported ? operation.evaluate(...before) : unavailable;
    const mutantSatisfied = supported ? operation.evaluate(...after) : unavailable;
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
module.exports = { sealPathSemanticReference, readPathSemanticReference, referenceCivilDateContained, referenceCivilRelation };
