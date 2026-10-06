'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let cached;
test('N02G:PATH-SEMANTIC-V2-008 independent civil relations respect arity, Gregorian boundaries and inert inputs', () => {
    const { referenceCivilRelation } = require('../../../src/next/provenance/pathSemanticReference');
    const calendar = 'proleptic_gregorian';
    const years = [...Array.from({ length: 400 }, (_, index) => index + 1), 1900, 2000, 2024, 2100, 9999];
    for (const year of years) for (let month = 1; month <= 12; month++) {
        const y = String(year).padStart(4, '0'), m = String(month).padStart(2, '0');
        const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const last = month === 2 ? leap ? 29 : 28 : [4, 6, 9, 11].includes(month) ? 30 : 31;
        const start = `${y}-${m}-01`, end = `${y}-${m}-${last}`;
        assert.equal(referenceCivilRelation('month_bounds_match', [`${y}-${m}`, start, end, calendar]), true);
        assert.equal(referenceCivilRelation('month_bounds_match', [`${y}-${m}`, start, start, calendar]), false);
        for (let day = 1; day <= last; day++) {
            const date = `${y}-${m}-${String(day).padStart(2, '0')}`;
            assert.equal(referenceCivilRelation('day_of_month_matches', [date, day, calendar]), true);
            assert.equal(referenceCivilRelation('day_of_month_matches', [date, day === 1 ? 2 : 1, calendar]), false);
            assert.equal(referenceCivilRelation('civil_offset_matches', [start, day - 1, 'day', date, calendar]), true);
            assert.equal(referenceCivilRelation('civil_offset_matches', [date, 1 - day, 'day', start, calendar]), true);
        }
        const range = { kind: 'range', start, end, start_inclusive: true, end_inclusive: true };
        assert.equal(referenceCivilRelation('inclusive_day_count_matches', [range, last, calendar]), true);
        assert.equal(referenceCivilRelation('inclusive_day_count_matches', [range, last + 1, calendar]), false);
        if (year < 9999 || month < 12) {
            const next = month === 12 ? `${String(year + 1).padStart(4, '0')}-01-01`
                : `${y}-${String(month + 1).padStart(2, '0')}-01`;
            assert.equal(referenceCivilRelation('civil_offset_matches', [end, 1, 'day', next, calendar]), true);
            assert.equal(referenceCivilRelation('civil_offset_matches', [next, -1, 'day', end, calendar]), true);
            assert.equal(referenceCivilRelation('civil_offset_matches', [start, 1, 'month', next, calendar]), true);
            assert.equal(referenceCivilRelation('civil_offset_matches', [next, -1, 'month', start, calendar]), true);
        }
    }
    for (const [origin, amount, target] of [['2024-01-31', 1, '2024-02-29'], ['2024-03-31', -1, '2024-02-29']])
        assert.equal(referenceCivilRelation('civil_offset_matches', [origin, amount, 'month', target, calendar]), null);
    assert.equal(referenceCivilRelation('civil_offset_matches', ['2024-01-29', 1, 'month', '2024-02-29', calendar]), true);
    assert.equal(referenceCivilRelation('civil_offset_matches', ['2000-01-01', -1, 'day', '1999-12-31', calendar]), true);
    for (const unit of ['day', 'month']) {
        assert.equal(referenceCivilRelation('civil_offset_matches', ['0001-01-01', -1, unit, '0001-01-01', calendar]), null);
        assert.equal(referenceCivilRelation('civil_offset_matches', ['9999-12-31', 1, unit, '9999-12-31', calendar]), null);
    }
    for (const date of ['0000-01-01', '1900-02-29', '2100-02-29', '2024-04-31', '2024-1-01', '10000-01-01'])
        assert.equal(referenceCivilRelation('day_of_month_matches', [date, 1, calendar]), null);
    for (const value of [0, -0, 32, 1.5, '1', Number.MAX_SAFE_INTEGER + 1])
        assert.equal(referenceCivilRelation('day_of_month_matches', ['2024-01-01', value, calendar]), null);
    assert.equal(referenceCivilRelation('civil_offset_matches', ['2024-01-01', -0, 'day', '2024-01-01', calendar]), null);
    assert.equal(referenceCivilRelation('civil_offset_matches', ['2024-01-01', 1, 'hour', '2024-01-02', calendar]), null);
    assert.equal(referenceCivilRelation('day_of_month_matches', ['2024-01-01', 1, 'gregorian']), null);
    assert.equal(referenceCivilRelation('day_of_month_matches', ['2024-01-01', 1, calendar, 'actual']), null);
    assert.equal(referenceCivilRelation('civil_date_matches', ['2024-01-01T00:00:00Z', '2024-01-01', 'UTC', calendar]), null);
    let effects = 0;
    const getter = ['2024-01-01', 1, calendar];
    Object.defineProperty(getter, 0, { enumerable: true, get() { effects++; return '2024-01-01'; } });
    assert.equal(referenceCivilRelation('day_of_month_matches', getter), null);
    assert.equal(referenceCivilRelation('day_of_month_matches', new Proxy([], { ownKeys() { effects++; return []; } })), null);
    const range = { kind: 'range', start: '2024-01-01', end: '2024-01-02', start_inclusive: true, end_inclusive: true };
    for (const invalid of [{ ...range, actual: 2 }, { ...range, start_inclusive: false }, { ...range, end: '2023-12-31' }])
        assert.equal(referenceCivilRelation('inclusive_day_count_matches', [invalid, 2, calendar]), null);
    Object.defineProperty(range, 'start', { enumerable: true, get() { effects++; return '2024-01-01'; } });
    assert.equal(referenceCivilRelation('inclusive_day_count_matches', [range, 2, calendar]), null);
    assert.equal(referenceCivilRelation('inclusive_day_count_matches', [new Proxy({}, { ownKeys() { effects++; return []; } }), 1, calendar]), null);
    assert.equal(referenceCivilRelation('__proto__', getter), null);
    assert.equal(effects, 0);
});

test('N02G:PATH-SEMANTIC-V2-009 authored three-argument civil predicates seal independent references without D/P credit', async () => {
    const { packageReceipt, inventoryCandidate } = await fixture();
    const { enumeratePathSemanticCandidates } = require('../../../src/next/provenance/pathMutationInventory');
    const { sealPathSemanticReference } = require('../../../src/next/provenance/pathSemanticReference');
    const requirement = inventoryCandidate.requirements.find(row => row.family === 'predicate_path_semantic'
        && row.target.fact_key === 'F-03#2#1' && row.target.predicate_id === 'calendar_due_day');
    assert.ok(requirement);
    const enumeration = enumeratePathSemanticCandidates({ inventoryCandidate, mutation_id: requirement.mutation_id });
    assert.ok(enumeration.candidates.length > 0);
    const refs = enumeration.candidates.map(candidate => sealPathSemanticReference({ packageReceipt, candidate }));
    assert.ok(refs.some(reference => reference.available && reference.baseline_satisfied));
    assert.ok(refs.every(reference => reference.financial_receipt === false
        && reference.source === 'admitted_frozen_claim_and_primary_snapshot_only'));
    assert.equal(enumeration.executed, 0);
    assert.equal(enumeration.matched, 0);
});

async function fixture() {
    if (cached) return cached;
    const { loadLocalAuthoringPackage } = await import('../../../scripts/agent/executeNextDomainInvariantMatrix.mjs');
    const { buildAdmittedSchemaValidators } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const { compileAuthoringIR } = require('../../../src/next/provenance/graphCompiler');
    const { enumeratePathInventoryCandidate } = require('../../../src/next/provenance/pathMutationInventory');
    const packageReceipt = loadLocalAuthoringPackage();
    const validators = buildAdmittedSchemaValidators(packageReceipt).validators;
    const ir = compileAuthoringIR(packageReceipt, validators);
    cached = { packageReceipt, validators, ir, inventoryCandidate: enumeratePathInventoryCandidate({ packageReceipt, ir }) };
    return cached;
}
test('N02G:PATH-SEMANTIC-V2-007 invalid template alternatives do not abort the closed-world search or grant credit', async () => {
    const { enumeratePathSemanticCandidates } = require('../../../src/next/provenance/pathMutationInventory');
    const { inventoryCandidate } = await fixture();
    const graphs = JSON.parse(fs.readFileSync(path.resolve(__dirname,
        '../../../docs/contracts/next/provenance-v2/graphs-v2.json'), 'utf8')).graphs;
    const requirements = inventoryCandidate.requirements.filter(row => row.family === 'predicate_path_semantic'
        && graphs.find(graph => graph.fact_key === row.target.fact_key).predicates
            .find(predicate => predicate.id === row.target.predicate_id).args.some(arg => arg.template));
    assert.ok(requirements.length > 0);
    for (const requirement of requirements) {
        const result = enumeratePathSemanticCandidates({ inventoryCandidate, mutation_id: requirement.mutation_id });
        assert.equal(result.mutation_id, requirement.mutation_id);
        assert.equal(result.required, true);
        assert.equal(result.executed, 0);
        assert.equal(result.matched, 0);
        assert.equal(result.no_candidate_disposition, 'UNSATISFIED_MUTATION_WITNESS');
        assert.ok(result.candidates.every(candidate => candidate.nominal_type_preserved
            && candidate.operator_preserved && candidate.executed === 0 && candidate.matched === 0));
    }
});

test('N02G:PATH-SEMANTIC-V2-001 alternatives are sealed by coordinate, preserve one locator and never grant execution credit', async () => {
    const { enumeratePathSemanticCandidates, readPathSemanticCandidate } = require('../../../src/next/provenance/pathMutationInventory');
    const { inventoryCandidate } = await fixture();
    const requirement = inventoryCandidate.requirements.find(row => row.family === 'predicate_path_semantic'
        && row.target.fact_key === 'M-01#1#1' && row.target.predicate_id === 'binding_7');
    const result = enumeratePathSemanticCandidates({ inventoryCandidate, mutation_id: requirement.mutation_id });
    assert.equal(result.mutation_id, requirement.mutation_id);
    assert.equal(result.executed, 0);
    assert.equal(result.matched, 0);
    assert.equal(result.activated, false);
    assert.ok(result.candidates.length > 0);
    assert.equal(new Set(result.candidates.map(row => row.candidate_id)).size, result.candidates.length);
    for (const candidate of result.candidates) {
        assert.equal(candidate.mutation_id, requirement.mutation_id);
        assert.equal(candidate.expected_violations.length, 1);
        assert.equal(candidate.operator_preserved, true);
        assert.equal(candidate.nominal_type_preserved, true);
        assert.equal(candidate.claim_oracle_preserved, true);
        assert.equal(candidate.material_payload_preserved, true);
        assert.notDeepEqual(candidate.patch.before, candidate.patch.after);
        const restored = structuredClone(candidate.graph);
        let node = restored.predicates.find(row => row.id === requirement.target.predicate_id);
        for (const token of candidate.patch.location.slice(0, -1)) node = node[token];
        node[candidate.patch.location.at(-1)] = structuredClone(candidate.patch.before);
        const { createHash } = require('node:crypto');
        assert.equal('sha256:' + createHash('sha256').update(JSON.stringify(restored)).digest('hex'), candidate.baseline_graph_sha256);
        assert.ok(readPathSemanticCandidate(candidate));
        assert.equal(readPathSemanticCandidate(structuredClone(candidate)), null);
    }
    assert.throws(() => enumeratePathSemanticCandidates({ inventoryCandidate: structuredClone(inventoryCandidate), mutation_id: requirement.mutation_id }));
    const admission = inventoryCandidate.requirements.find(row => row.family === 'predicate_path_admission');
    assert.throws(() => enumeratePathSemanticCandidates({ inventoryCandidate, mutation_id: admission.mutation_id }));
    let effects = 0;
    assert.throws(() => enumeratePathSemanticCandidates(new Proxy({}, { ownKeys() { effects++; return []; } })));
    assert.equal(effects, 0);
    const period = inventoryCandidate.requirements.find(row => row.family === 'predicate_path_semantic'
        && row.target.fact_key === 'M-01#1#1' && row.target.predicate_id === 'binding_1');
    const empty = enumeratePathSemanticCandidates({ inventoryCandidate, mutation_id: period.mutation_id });
    assert.equal(empty.required, true);
    assert.equal(empty.candidates.length, 0);
    assert.equal(empty.no_candidate_disposition, 'UNSATISFIED_MUTATION_WITNESS');
});
test('N02G:PATH-SEMANTIC-V2-002 real authored locator negatives do not receive credit for early or collateral rejection', async () => {
    const { executePathSemanticV2Batch } = await import('../../../scripts/agent/executeNextPredicateStrategyMatrix.mjs');
    const { packageReceipt, inventoryCandidate } = await fixture();
    const result = await executePathSemanticV2Batch({ packageReceipt, fact_keys: ['M-01#1#1'] });
    const report = path.resolve(__dirname, '../../../.codex-temp/path-semantic-v2-discriminating-focal-20261004.json');
    // Evidence export is opt-in for a local run, not a side effect of the
    // hermetic suite. A prior report is never overwritten.
    if (process.env.FINANCASBOT_PATH_SEMANTIC_EVIDENCE === '20261004-focal-r1')
        fs.writeFileSync(report, JSON.stringify(result) + '\n', { flag: 'wx' });
    const expected = inventoryCandidate.requirements.filter(row => row.family === 'predicate_path_semantic'
        && row.target.fact_key === 'M-01#1#1');
    assert.equal(result.mutations.expected, expected.length);
    assert.deepEqual(result.rows.map(row => row.mutation_id).sort(), expected.map(row => row.mutation_id).sort());
    assert.equal(new Set(result.rows.map(row => row.mutation_id)).size, expected.length);
    assert.ok(result.unsatisfied.some(row => row.cause === 'no_typed_closed_world_alternative'));
    assert.ok(result.unsatisfied.some(row => row.cause.includes('claim_requirements')));
    for (const row of result.rows) {
        assert.equal(row.financial_receipt, false);
        if (!row.dp_execution) assert.equal(row.matched, false);
        if (row.matched) {
            assert.equal(row.reference.available, true);
            assert.equal(row.reference.baseline_satisfied, true);
            assert.equal(row.reference.mutant_satisfied, false);
            assert.equal(row.outside_target_preserved, true);
            assert.equal(row.phases_covered, true);
            assert.equal(row.positive_oracle_matched, true);
            assert.equal(row.proof_satisfied, false);
            assert.deepEqual(row.observed_violations, row.expected_violations);
        }
    }
    assert.equal(result.batch_complete, false);
    assert.equal(result.global_g11, false);
    assert.equal(result.predicate_atom_credit, 0);
    assert.equal(result.financial_receipt, false);
});
test('N02G:PATH-SEMANTIC-V2-003 independent references reject wrong coordinates, actual inputs and cloned capabilities', async () => {
    const { enumeratePathSemanticCandidates } = require('../../../src/next/provenance/pathMutationInventory');
    const { sealPathSemanticReference, readPathSemanticReference } = require('../../../src/next/provenance/pathSemanticReference');
    const { packageReceipt, inventoryCandidate } = await fixture();
    const requirement = inventoryCandidate.requirements.find(row => row.family === 'predicate_path_semantic'
        && row.target.fact_key === 'M-01#1#1' && row.target.predicate_id === 'binding_7');
    const candidate = enumeratePathSemanticCandidates({ inventoryCandidate, mutation_id: requirement.mutation_id }).candidates[0];
    const reference = sealPathSemanticReference({ packageReceipt, candidate });
    assert.equal(reference.available, true);
    assert.equal(reference.baseline_satisfied, true);
    assert.equal(reference.mutant_satisfied, false);
    assert.deepEqual(reference.expected_violations, candidate.expected_violations);
    assert.ok(readPathSemanticReference(reference));
    assert.equal(readPathSemanticReference(structuredClone(reference)), null);
    assert.throws(() => sealPathSemanticReference({ packageReceipt, candidate: structuredClone(candidate) }));
    const wrong = structuredClone(candidate); wrong.target.predicate_id = 'binding_1';
    assert.throws(() => sealPathSemanticReference({ packageReceipt, candidate: wrong }));
    assert.throws(() => sealPathSemanticReference({ packageReceipt, candidate, actual: false }));
    let effects = 0;
    const getter = { candidate };
    Object.defineProperty(getter, 'packageReceipt', { enumerable: true, get() { effects++; return packageReceipt; } });
    assert.throws(() => sealPathSemanticReference(getter));
    assert.equal(effects, 0);
});
test('N02G:PATH-SEMANTIC-V2-004 unexpected checker failure is not relabelled as absence of a witness', async () => {
    const { enumeratePathSemanticCandidates } = require('../../../src/next/provenance/pathMutationInventory');
    const native = require('../../../src/next/provenance/predicateTypes');
    const { inventoryCandidate } = await fixture();
    const requirement = inventoryCandidate.requirements.find(row => row.family === 'predicate_path_semantic'
        && row.target.fact_key === 'M-01#1#1' && row.target.predicate_id === 'binding_7');
    const saved = native.compilePredicateTypes;
    native.compilePredicateTypes = () => { throw new Error('unexpected_checker_failure'); };
    try {
        assert.throws(() => enumeratePathSemanticCandidates({ inventoryCandidate, mutation_id: requirement.mutation_id }),
            /unexpected_checker_failure/);
    } finally { native.compilePredicateTypes = saved; }
    const templates = require('../../../src/next/provenance/templateReferences');
    const original = templates.validateTemplateReferences;
    const forged = new Error('operator_types_shape');
    templates.validateTemplateReferences = () => { throw forged; };
    try {
        assert.throws(() => enumeratePathSemanticCandidates({ inventoryCandidate, mutation_id: requirement.mutation_id }),
            error => error === forged);
    } finally { templates.validateTemplateReferences = original; }
});

test('N02G:PATH-SEMANTIC-V2-005 independent civil containment covers boundaries without runtime or actual', async () => {
    const { referenceCivilDateContained, sealPathSemanticReference } = require('../../../src/next/provenance/pathSemanticReference');
    for (const year of [1900, 2000, 2024, 2025, 2100]) {
        const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const month = `${year}-02`; const end = `${month}-${leap ? '29' : '28'}`;
        for (let day = 1; day <= (leap ? 29 : 28); day++) {
            const date = `${month}-${String(day).padStart(2, '0')}`;
            for (const kind of ['month', 'statement_competence', 'budget_cycle'])
                assert.equal(referenceCivilDateContained(date, { kind, value: month }), true);
            for (const start_inclusive of [false, true]) for (const end_inclusive of [false, true]) {
                const range = { kind: 'range', start: `${month}-01`, end, start_inclusive, end_inclusive };
                assert.equal(referenceCivilDateContained(date, range),
                    (day > 1 || start_inclusive) && (date !== end || end_inclusive));
            }
            assert.equal(referenceCivilDateContained(date, { kind: 'through', value: end }), true);
            assert.equal(referenceCivilDateContained(date, { kind: 'date', value: end }), date === end);
            assert.equal(referenceCivilDateContained(date, { kind: 'statement_due', value: end }), date === end);
        }
        assert.equal(referenceCivilDateContained(`${year}-03-01`, { kind: 'month', value: month }), false);
        assert.equal(referenceCivilDateContained(`${year}-03-01`, { kind: 'through', value: end }), false);
    }
    for (const date of ['1900-02-29', '2100-02-29', '2024-04-31', '2024-13-01', '2024-00-01', '2024-1-01', '2024-01-00'])
        assert.equal(referenceCivilDateContained(date, { kind: 'month', value: '2024-01' }), null);
    assert.equal(referenceCivilDateContained('2024-02-29', { kind: 'as_of', value: '2024-02-29' }), null);
    assert.equal(referenceCivilDateContained('2024-02-29', { kind: 'range', start: '2024-03-01', end: '2024-02-01', start_inclusive: true, end_inclusive: true }), null);
    assert.equal(referenceCivilDateContained('2024-02-29', { kind: 'month', value: '2024-02', actual: true }), null);
    let effects = 0;
    const getter = { kind: 'month' };
    Object.defineProperty(getter, 'value', { enumerable: true, get() { effects++; return '2024-02'; } });
    assert.equal(referenceCivilDateContained('2024-02-29', getter), null);
    assert.equal(referenceCivilDateContained('2024-02-29', new Proxy({}, { ownKeys() { effects++; return []; } })), null);
    assert.equal(effects, 0);
    const { packageReceipt, inventoryCandidate } = await fixture();
    const requirement = inventoryCandidate.requirements.find(row => row.family === 'predicate_path_semantic'
        && row.target.fact_key === 'F-01#1#1' && row.target.predicate_id === 'p0315_selected_period');
    const { enumeratePathSemanticCandidates } = require('../../../src/next/provenance/pathMutationInventory');
    const references = enumeratePathSemanticCandidates({ inventoryCandidate, mutation_id: requirement.mutation_id }).candidates
        .map(candidate => sealPathSemanticReference({ packageReceipt, candidate }));
    assert.ok(references.some(row => row.available && row.baseline_satisfied && row.mutant_satisfied === false));
    assert.ok(references.every(row => row.financial_receipt === false));
});

test('N02G:PATH-SEMANTIC-V2-006 temporal reference reaches authored admission without crediting its refusal', async () => {
    const { packageReceipt, inventoryCandidate } = await fixture();
    const { executePathSemanticV2Batch } = await import('../../../scripts/agent/executeNextPredicateStrategyMatrix.mjs');
    const result = await executePathSemanticV2Batch({ packageReceipt, fact_keys: ['F-01#1#1'] });
    const expected = inventoryCandidate.requirements.filter(row => row.family === 'predicate_path_semantic'
        && row.target.fact_key === 'F-01#1#1');
    assert.deepEqual(result.rows.map(row => row.mutation_id).sort(), expected.map(row => row.mutation_id).sort());
    const row = result.rows.find(item => item.target.predicate_id === 'p0315_selected_period');
    assert.equal(row.generated, true);
    assert.equal(row.reference.available, true);
    assert.equal(row.reference.baseline_satisfied, true);
    assert.equal(row.reference.mutant_satisfied, false);
    assert.notEqual(row.cause, 'independent_reference_domain_pending');
    for (const item of result.rows) {
        assert.equal(item.financial_receipt, false);
        if (!item.dp_execution) assert.equal(item.matched, false);
        if (item.matched) {
            assert.equal(item.whole_compiler_admitted, true);
            assert.equal(item.outside_target_preserved, true);
            assert.equal(item.phases_covered, true);
            assert.equal(item.positive_oracle_matched, true);
            assert.deepEqual(item.observed_violations, item.expected_violations);
        }
    }
    assert.equal(result.global_g11, false);
    assert.equal(result.predicate_atom_credit, 0);
    if (process.env.FINANCASBOT_PATH_SEMANTIC_EVIDENCE === '20261004-temporal-r1')
        fs.writeFileSync(path.resolve(__dirname, '../../../.codex-temp/path-semantic-temporal-dp-focal-20261004.json'),
            JSON.stringify(result) + '\n', { flag: 'wx' });
});
