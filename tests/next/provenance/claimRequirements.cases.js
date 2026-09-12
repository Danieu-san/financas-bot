'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateClaimRequirements } = require('../../../src/next/provenance/claimRequirements');
const read = file => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8'));
function fixture() {
    const d = read('docs/contracts/next/provenance-v2/graphs-v2.json');
    return { graphs: d.graphs, claims: read(d.claim_contract.path).claims };
}
function reject(mutate, pattern) {
    const f = fixture(); mutate(f.graphs[0], f);
    assert.throws(() => validateClaimRequirements(f), pattern);
}
function remove(g, id) {
    g.predicates = g.predicates.filter(p => p.id !== id);
    for (const obligation of g.obligations) obligation.predicates = obligation.predicates.filter(p => p !== id);
}
const claimArg = (p, segments) => p.args.some(a => JSON.stringify(a.claim?.segments) === JSON.stringify(segments));

test('N02G:CLAIM-REQUIREMENTS-001 descriptor requirements cover all 76 claims', () => {
    const result = validateClaimRequirements(fixture());
    assert.equal(result.graphs, 76);
    assert.equal(result.stage, 'claim_requirements_checked_only');
});

test('N02G:CLAIM-REQUIREMENTS-002 deleting a binding and its references cannot discharge the obligation', () => {
    for (const segments of [['subject', 'kind'], ['subject', 'ref_id'], ['time_basis'], ['coverage'], ['evidence_state'], ['period']]) {
        reject(g => {
            const matches = g.predicates.filter(p => claimArg(p, segments));
            for (const p of matches) remove(g, p.id);
        }, /claim_requirements_missing/);
    }
});

test('N02G:CLAIM-REQUIREMENTS-003 compatible enum or id literals still must bind the actual descriptor', () => {
    for (const [segments, value] of [[['coverage'], 'partial'], [['evidence_state'], 'projected'],
        [['time_basis'], 'statement_due'], [['subject', 'kind'], 'person'], [['subject', 'ref_id'], 'another-family']]) {
        reject(g => {
            const p = g.predicates.find(p => claimArg(p, segments) && p.args.some(a => a.literal));
            p.args.find(a => a.literal).literal.value = value;
        }, /claim_requirements_value/);
    }
});

test('N02G:CLAIM-REQUIREMENTS-004 a period self-comparison or unrelated window is not a claim anchor', () => {
    reject(g => { const p = g.predicates.find(p => p.op === 'period_eq' && claimArg(p, ['period'])); p.args[1] = structuredClone(p.args[0]); }, /claim_requirements_period/);
    reject(g => { g.predicates.find(p => p.op === 'period_eq' && claimArg(p, ['period'])).args[1].period_literal.value = '2042-07'; }, /claim_requirements_period/);
    reject((_g, f) => {
        const g = f.graphs.find(g => g.windows.remaining_window);
        for (const p of g.predicates.filter(p => claimArg(p, ['period']))) p.args[1] = { period_ref: 'missing' };
    }, /claim_requirements_period/);
});

test('N02G:CLAIM-REQUIREMENTS-005 subject links require nominal kind and actual snapshot identity', () => {
    reject(g => {
        const p = g.predicates.find(p => claimArg(p, ['subject', 'ref_id']) && p.args.some(a => a.field));
        p.args.find(a => a.field).field.node = 'person_a';
    }, /claim_requirements_subject/);
    reject(g => { g.nodes.family_example.ref_id = 'other-family'; }, /claim_requirements_subject/);
    reject((_g, f) => {
        const c = f.claims.find(c => c.subject.kind === 'person_comparison');
        c.subject.person_ids[0] = 'missing-person';
    }, /claim_requirements_subject/);
});

test('N02G:CLAIM-REQUIREMENTS-006 every descriptor leaf must be required by the proof trace contract', () => {
    const paths = [['subject', 'ref_id'], ['period', 'kind'], ['period', 'value'], ['coverage'],
        ['evaluator_ref', 'evaluator_version'], ['time_basis']];
    for (const segments of paths) reject(g => {
        g.trace_contract.proof.required_claim_reads = g.trace_contract.proof.required_claim_reads.filter(r =>
            JSON.stringify(r.segments) !== JSON.stringify(segments));
    }, /claim_requirements_read/);
    reject((_g, f) => {
        const c = f.claims.find(c => c.subject.kind === 'person_comparison');
        const g = f.graphs.find(g => g.fact_key === c.fact_key);
        g.trace_contract.proof.required_claim_reads = g.trace_contract.proof.required_claim_reads.filter(r => r.segments[1] !== 'person_ids');
    }, /claim_requirements_read/);
});

test('N02G:CLAIM-REQUIREMENTS-007 an equality cannot be reassigned to an unrelated claim obligation', () => {
    reject(g => {
        const p = g.predicates.find(p => claimArg(p, ['time_basis']));
        p.obligation = 'coverage'; p.atom = 'coverage';
        for (const o of g.obligations) o.predicates = o.predicates.filter(id => id !== p.id);
        g.obligations.find(o => o.obligation === 'coverage').predicates.push(p.id);
    }, /claim_requirements_semantics/);
});
