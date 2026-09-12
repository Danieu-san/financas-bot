'use strict';

const { canonicalValue } = require('../kernel/canonicalValue');
const { claimReferenceKind } = require('./predicateTypes');
const fail = code => { throw new Error(`claim_requirements_${code}`); };
const pathKey = segments => JSON.stringify(segments);
const claimAt = (arg, segments) => pathKey(arg?.claim?.segments) === pathKey(segments);
const same = (a, b) => canonicalValue(a) === canonicalValue(b);
const ROOT_OBLIGATION = Object.freeze({ subject: 'subject_scope', filters: 'subject_scope',
    period: 'period', time_basis: 'time_basis', coverage: 'coverage', evidence_state: 'evidence_state' });

// Compile-time descriptor binding. Literal agreement is not provenance by
// itself: subject nodes and required reads are independently derived here;
// temporal derivation, source completeness and actual reads remain proof work.
function validateClaimRequirements({ graphs, claims }) {
    const claimMap = new Map(claims.map(claim => [claim.fact_key, claim]));
    if (claimMap.size !== claims.length) fail('duplicate');
    for (const graph of graphs) {
        const claim = claimMap.get(graph.fact_key);
        if (!claim || claim.claim_id !== graph.claim_id) fail('claim');
        const reads = new Set(graph.trace_contract.proof.required_claim_reads.map(read => pathKey(read.segments)));
        function requireRead(value, segments) {
            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                for (const [name, child] of Object.entries(value)) requireRead(child, [...segments, name]);
            } else if (!reads.has(pathKey(segments))) fail('read');
        }
        for (const root of ['claim_id', 'fact_key', 'metric', 'unit', 'subject', 'period', 'time_basis',
            'coverage', 'evidence_state', 'evaluator_ref', 'filters']) {
            if (Object.hasOwn(claim, root)) requireRead(claim[root], [root]);
        }
        // Direct descriptor comparisons cannot borrow the label of another
        // obligation. Type validation has already checked their operand domains.
        for (const predicate of graph.predicates) {
            for (const arg of predicate.args) {
                const root = arg.claim?.segments?.[0];
                if (ROOT_OBLIGATION[root] && predicate.obligation !== ROOT_OBLIGATION[root]) fail('semantics');
            }
        }
        function literalBinding(segments, value, type) {
            const candidates = graph.predicates.filter(predicate => predicate.op === 'eq'
                && predicate.obligation === ROOT_OBLIGATION[segments[0]]
                && predicate.args.some(arg => claimAt(arg, segments))
                && predicate.args.some(arg => arg.literal));
            if (!candidates.length) fail('missing');
            for (const predicate of candidates) {
                const literal = predicate.args.find(arg => arg.literal).literal;
                if (literal.type !== type || !same(literal.value, value)) fail('value');
            }
        }
        for (const name of ['time_basis', 'coverage', 'evidence_state']) literalBinding([name], claim[name], 'enum');
        literalBinding(['subject', 'kind'], claim.subject.kind, 'enum');
        const materialReads = new Set(graph.trace_contract.proof.required_reads.map(read =>
            JSON.stringify([read.node, read.segments])));
        for (const [name, value] of Object.entries(claim.subject)) {
            if (name === 'kind') continue;
            const segments = ['subject', name];
            const kind = claimReferenceKind(claim, segments);
            const values = Array.isArray(value) ? value : [value];
            if (!Array.isArray(value)) literalBinding(segments, value, 'id');
            for (const id of values) {
                const nodes = Object.entries(graph.nodes).filter(([, node]) =>
                    node.binding === 'snapshot' && node.kind === kind && node.ref_id === id);
                if (nodes.length !== 1) fail('subject');
                const [alias] = nodes[0];
                if (!graph.trace_contract.proof.required_nodes.includes(alias)
                    || !materialReads.has(JSON.stringify([alias, ['id']]))) fail('subject');
                if (Array.isArray(value)) continue; // typed_subject_binding checks each nominal member.
                const links = graph.predicates.filter(predicate => predicate.op === 'eq'
                    && predicate.obligation === 'subject_scope' && predicate.args.some(arg => claimAt(arg, segments))
                    && predicate.args.some(arg => arg.field));
                if (!links.length) fail('missing');
                for (const predicate of links) {
                    const field = predicate.args.find(arg => arg.field).field;
                    if (field.node !== alias || !same(field.segments, ['id'])) fail('subject');
                }
            }
        }
        const periods = graph.predicates.filter(predicate => predicate.op === 'period_eq'
            && predicate.obligation === 'period' && predicate.args.some(arg => claimAt(arg, ['period'])));
        if (!periods.length) fail('missing');
        for (const predicate of periods) {
            const anchors = predicate.args.filter(arg => !claimAt(arg, ['period']));
            if (anchors.length !== 1) fail('period');
            const anchor = anchors[0];
            if (anchor.period_literal) {
                if (!same(anchor.period_literal, claim.period)) fail('period');
            } else if (anchor.period_ref) {
                const window = graph.windows?.[anchor.period_ref];
                if (!window || window.kind !== claim.period.kind) fail('period');
                // Values are derived/observed by the temporal proof, never
                // inferred from the result oracle or copied from the claim.
            } else fail('period');
        }
    }
    return Object.freeze({ stage: 'claim_requirements_checked_only', graphs: graphs.length });
}

module.exports = { validateClaimRequirements };
