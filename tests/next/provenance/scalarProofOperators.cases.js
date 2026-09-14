'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateScalarProof } = require('../../../src/next/provenance/scalarProofOperators');
const registry = require('../../../docs/contracts/next/provenance-v2/operator-registry-v2.json');
const scalar = (type, value, extra = {}) => ({ type: { form: 'scalar', type, ...extra }, value });
const field = (type, value, extra = {}) => ({ type: { form: 'field', value: { form: 'scalar', type, ...extra } }, value });
const period = value => ({ type: { form: value.kind === 'range' ? 'range' : 'period', periodKind: value.kind }, value });
const run = (id, ...operands) => evaluateScalarProof(registry.operators.find(o => o.id === id), operands);
const calendar = () => scalar('calendar', 'proleptic_gregorian');
const range = (start, end, start_inclusive = true, end_inclusive = true) => period({ kind: 'range', start, end, start_inclusive, end_inclusive });

test('N02G:SCALAR-PROOF-001 comparisons preserve nominal identity and numeric refinements', () => {
    assert.equal(run('eq', scalar('integer', 0), scalar('nonnegative_integer', 0)), true);
    assert.equal(run('not_eq', scalar('integer', 1), scalar('integer', 2)), true);
    assert.equal(run('eq', scalar('text', '1'), scalar('text', '1')), true);
    assert.equal(run('field_eq', field('money_minor', 2, { unit: 'BRL_minor' }), field('money_minor', 3, { unit: 'BRL_minor' })), false);
    assert.throws(() => run('eq', scalar('id', 'same', { kind: 'person' }), scalar('id', 'same', { kind: 'card' })), /nominal_mismatch/);
    assert.throws(() => run('eq', scalar('money_minor', 1, { unit: 'BRL_minor' }), scalar('integer', 1)), /nominal_mismatch/);
    assert.throws(() => run('eq', scalar('integer', '1'), scalar('integer', 1)), /scalar_proof_/);
    assert.throws(() => run('eq', scalar('positive_integer', 0), scalar('integer', 0)), /scalar_proof_/);
    assert.throws(() => run('eq', scalar('integer', -0), scalar('integer', 0)), /scalar_proof_/);
    assert.equal(run('state_is', field('enum', 'confirmed', { domain: '["confirmed","projected"]' }),
        { type: { form: 'state_literal' }, value: 'confirmed' }), true);
});

test('N02G:SCALAR-PROOF-002 datetime equality compares instants with exact fractional seconds', () => {
    assert.equal(run('eq', scalar('datetime', '2042-06-01T00:00:00Z'), scalar('datetime', '2042-05-31T21:00:00-03:00')), true);
    assert.equal(run('eq', scalar('datetime', '2042-06-01T00:00:00.123400Z'), scalar('datetime', '2042-06-01T00:00:00.1234+00:00')), true);
    assert.equal(run('eq', scalar('datetime', '2042-06-01T00:00:00.1234000000001Z'), scalar('datetime', '2042-06-01T00:00:00.1234Z')), false);
    assert.throws(() => run('eq', scalar('datetime', '2042-02-30T00:00:00Z'), scalar('datetime', '2042-02-28T00:00:00Z')));
});

test('N02G:SCALAR-PROOF-003 civil periods distinguish all kinds and inclusivity', () => {
    assert.equal(run('date_in_period', scalar('date', '2040-02-29'), period({ kind: 'month', value: '2040-02' })), true);
    assert.equal(run('date_in_period', scalar('date', '2042-06-01'), range('2042-06-01', '2042-06-30', false)), false);
    assert.throws(() => run('date_in_period', scalar('date', '2042-05-31'), period({ kind: 'as_of', value: '2042-06-01' })), /scalar_proof_period_containment_pending/);
    assert.equal(run('date_in_period', scalar('date', '2042-05-31'), period({ kind: 'date', value: '2042-06-01' })), false);
    assert.equal(run('period_eq', period({ kind: 'month', value: '2042-06' }), period({ kind: 'budget_cycle', value: '2042-06' })), false);
    assert.equal(run('same_month', scalar('date', '2042-06-01'), scalar('date', '2042-06-30')), true);
    assert.equal(run('range_contains', range('2042-06-01', '2042-06-30'), range('2042-06-01', '2042-06-30', false, false)), true);
    assert.equal(run('range_contains', range('2042-06-01', '2042-06-30', false), range('2042-06-01', '2042-06-30')), false);
    assert.throws(() => run('date_in_period', scalar('date', '2042-06-01'), period({ kind: 'registry_snapshot', snapshot_version: 'v1' })));
    assert.throws(() => run('period_eq', period({ kind: 'month', value: '2042-13' }), period({ kind: 'month', value: '2042-13' })));
});

test('N02G:SCALAR-PROOF-004 civil operators reuse exact calendar without Date or clamping', () => {
    assert.equal(run('civil_offset_matches', scalar('date', '2040-02-28'), scalar('integer', 1), scalar('civil_unit', 'day'), scalar('date', '2040-02-29'), calendar()), true);
    assert.throws(() => run('civil_offset_matches', scalar('date', '2042-01-31'), scalar('integer', 1), scalar('civil_unit', 'month'), scalar('date', '2042-02-28'), calendar()), /nonexistent_target/);
    assert.equal(run('month_bounds_match', scalar('month', '2040-02'), scalar('date', '2040-02-01'), scalar('date', '2040-02-29'), calendar()), true);
    assert.equal(run('day_of_month_matches', scalar('date', '2042-06-17'), scalar('positive_integer', 17), calendar()), true);
    assert.equal(run('inclusive_day_count_matches', range('2042-06-16', '2042-06-30'), scalar('positive_integer', 15), calendar()), true);
    assert.throws(() => run('inclusive_day_count_matches', range('2042-06-16', '2042-06-30', false), scalar('positive_integer', 15), calendar()), /inclusive_range/);
    assert.throws(() => run('day_of_month_matches', scalar('date', '2042-06-17'), scalar('positive_integer', 17), scalar('calendar', 'other')), /scalar_proof_/);
});

test('N02G:SCALAR-PROOF-005 signs/magnitudes never infer financial neutrality or coerce', () => {
    assert.equal(run('opposite_sign', scalar('integer', -8), scalar('integer', 8)), true);
    assert.equal(run('opposite_sign', scalar('integer', 0), scalar('integer', -8)), false);
    assert.equal(run('abs_eq', scalar('integer', -8), scalar('integer', 8)), true);
    assert.equal(run('abs_eq', scalar('integer', -8), scalar('integer', 9)), false);
    assert.throws(() => run('abs_eq', scalar('integer', Infinity), scalar('integer', 1)));
    assert.throws(() => run('abs_eq', scalar('integer', Number.MAX_SAFE_INTEGER + 1), scalar('integer', 1)));
});

test('N02G:SCALAR-PROOF-006 malformed operator, unimplemented families and getters never produce PASS', () => {
    assert.throws(() => evaluateScalarProof({ id: 'eq', args: [], semantics: 'anything' }, []), /scalar_proof_/);
    assert.throws(() => run('fingerprint_is', { type: { form: 'node', kind: 'event' }, value: {} },
        { type: { form: 'digest_literal' }, value: `sha256:${'0'.repeat(64)}` }), /scalar_proof_unsupported/);
    let invoked = 0;
    const input = scalar('integer', 1); Object.defineProperty(input, 'value', { get() { invoked++; return 1; }, enumerable: true });
    assert.throws(() => run('eq', input, scalar('integer', 1)));
    assert.equal(invoked, 0);
});

const collection = (form, item, value) => ({ type: { form, item }, value });
test('N02G:SCALAR-PROOF-007 sequence arithmetic preserves duplicates and checks every addition', () => {
    const seq = values => collection('sequence', { form: 'scalar', type: 'integer' }, values);
    assert.equal(run('sum_eq', seq([3, 3, -2]), scalar('integer', 4)), true);
    assert.equal(run('count_eq', seq([3, 3, -2]), scalar('nonnegative_integer', 3)), true);
    assert.equal(run('sum_eq', seq([]), scalar('integer', 0)), true);
    assert.throws(() => run('sum_eq', seq([Number.MAX_SAFE_INTEGER, 1, -1]), scalar('integer', Number.MAX_SAFE_INTEGER)), /scalar_proof_overflow/);
    assert.throws(() => run('sum_eq', collection('sequence', { form: 'scalar', type: 'money_minor', unit: 'BRL_minor' }, [1]), scalar('integer', 1)), /nominal_mismatch/);
});

test('N02G:SCALAR-PROOF-008 scalar sets enforce uniqueness and exact typed membership', () => {
    const set = values => collection('set', { form: 'scalar', type: 'integer' }, values);
    assert.equal(run('set_eq', set([1, 2]), set([2, 1])), true);
    assert.equal(run('set_eq', set([1, 2]), set([1, 3])), false);
    assert.equal(run('cardinality_eq', set([]), scalar('nonnegative_integer', 0)), true);
    assert.throws(() => run('set_eq', set([1, 1]), set([1])), /scalar_proof_duplicate/);
    assert.throws(() => run('set_eq', collection('set', { form: 'scalar', type: 'id', kind: 'person' }, ['x']),
        collection('set', { form: 'scalar', type: 'id', kind: 'card' }, ['x'])), /nominal_mismatch/);
    const datetimes = values => collection('set', { form: 'scalar', type: 'datetime' }, values);
    assert.throws(() => run('cardinality_eq', datetimes(['2042-06-01T00:00:00Z', '2042-05-31T21:00:00-03:00']), scalar('nonnegative_integer', 2)), /scalar_proof_duplicate/);
});

test('N02G:SCALAR-PROOF-009 all dates respects empty sequence without claiming coverage', () => {
    const seq = values => collection('sequence', { form: 'scalar', type: 'date' }, values);
    assert.equal(run('all_dates_in_period', seq([]), period({ kind: 'month', value: '2042-06' })), true);
    assert.throws(() => run('all_dates_in_period', seq([]), period({ kind: 'as_of', value: '2042-06-01' })), /period_containment_pending/);
    assert.equal(run('all_dates_in_period', seq(['2042-06-01', '2042-06-30']), period({ kind: 'month', value: '2042-06' })), true);
    assert.equal(run('all_dates_in_period', seq(['2042-06-01', '2042-07-01']), period({ kind: 'month', value: '2042-06' })), false);
    assert.throws(() => run('all_dates_in_period', seq(['2042-02-30']), period({ kind: 'month', value: '2042-02' })));
});

const node = (kind, ref_id, version = `sha256:${'a'.repeat(64)}`) => ({ type: { form: 'node', kind }, value: { kind, ref_id, version } });
test('N02G:SCALAR-PROOF-012 through includes the cutoff and prior dates, never future dates', () => {
    const through = period({ kind: 'through', value: '2042-06-15' });
    for (const day of ['0001-01-01', '2042-06-14', '2042-06-15']) assert.equal(run('date_in_period', scalar('date', day), through), true);
    assert.equal(run('date_in_period', scalar('date', '2042-06-16'), through), false);
    assert.equal(run('period_eq', through, period({ kind: 'as_of', value: '2042-06-15' })), false);
});
test('N02G:SCALAR-PROOF-010 node equality and sets compare complete kind/ref/version identities', () => {
    assert.equal(run('same_identity', node('person', 'a'), node('person', 'a')), true);
    assert.equal(run('same_identity', node('person', 'a'), node('person', 'a', `sha256:${'b'.repeat(64)}`)), false);
    assert.equal(run('kind_is', node('category', 'a'), { type: { form: 'kind_literal' }, value: 'category' }), true);
    assert.equal(run('kind_is', node('category', 'a'), { type: { form: 'kind_literal' }, value: 'event' }), false);
    assert.throws(() => run('same_identity', node('person', 'a'), node('card', 'a')), /nominal_mismatch/);
    const nodes = values => collection('set', { form: 'node', kind: 'person' }, values);
    assert.equal(run('set_eq', nodes([node('person', 'a').value]), nodes([node('person', 'a', `sha256:${'b'.repeat(64)}`).value])), false);
    assert.throws(() => run('cardinality_eq', nodes([node('person', 'a').value, node('person', 'a').value]), scalar('nonnegative_integer', 2)), /duplicate/);
    const bad = node('person', 'a'); bad.value.kind = 'card';
    assert.throws(() => run('same_identity', bad, node('person', 'a')), /scalar_proof_node/);
});

test('N02G:SCALAR-PROOF-011 resolved edge targets compare full observed identities', () => {
    const edge = { type: { form: 'edge', target: 'person' }, value: node('person', 'a').value };
    assert.equal(run('ref_targets_node', edge, node('person', 'a')), true);
    assert.equal(run('ref_targets_node', edge, node('person', 'a', `sha256:${'b'.repeat(64)}`)), false);
    assert.equal(run('edge_target_in_set', edge, collection('set', { form: 'node', kind: 'person' }, [node('person', 'a').value])), true);
    assert.equal(run('edge_target_in_set', edge, collection('set', { form: 'node', kind: 'person' }, [])), false);
    assert.throws(() => run('ref_targets_node', edge, node('card', 'a')), /nominal_mismatch/);
});
