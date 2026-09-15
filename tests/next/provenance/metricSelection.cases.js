'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createInstrumentedAccess, createNodeSetAccess } = require('../../../src/next/provenance/instrumentedAccess');
const { evaluateConsumption, evaluateEconomicMetric } = require('../../../src/next/provenance/metricSelection');

const version = `sha256:${'a'.repeat(64)}`;
const scalar = { type: 'scalar' };
function fixture(options = {}) {
    const observations = []; const emit = e => observations.push(e); const controls = [];
    const rows = options.rows || [
        { id: 'purchase', date: '2042-06-10', state: 'confirmed', person_id: 'p1', category_id: 'food', amount_minor: -100 },
        { id: 'refund', date: '2042-06-11', state: 'confirmed', person_id: 'p1', category_id: 'refund-kind', amount_minor: 25, compensates: 'purchase' },
        { id: 'income', date: '2042-06-10', state: 'confirmed', person_id: 'p1', category_id: 'salary', amount_minor: 400 },
        { id: 'future', date: '2042-06-10', state: 'projected', person_id: 'p1', category_id: 'food', amount_minor: -30 },
        { id: 'old', date: '2042-05-31', state: 'confirmed', person_id: 'p1', category_id: 'food', amount_minor: -50 },
        { id: 'other-person', date: '2042-06-10', state: 'confirmed', person_id: 'p2', category_id: 'food', amount_minor: -60 }
    ];
    const categoryRows = [{ id: 'food', kind: 'expense', budget_class: 'essential' }, { id: 'refund-kind', kind: 'compensation' }, { id: 'salary', kind: 'income' }];
    function binding(kind, value, role) {
        const names = kind === 'event' ? ['id', 'date', 'state', 'person_id', 'category_id', 'amount_minor', 'compensates', 'account_id', 'card_id'] : ['id', 'kind', 'budget_class', 'closing_day', 'due_day'];
        return { alias: value.id, role, identity: { kind, ref_id: value.id, version }, value,
            shape: { type: 'record', fields: Object.fromEntries(names.map(name => [name, scalar])) } };
    }
    const links = rows.flatMap(row => [{ id: `cat-${row.id}`, source: row.id, field: 'category_id', target: row.category_id, type: 'ref' },
        ...(row.compensates ? [{ id: `comp-${row.id}`, source: row.id, field: 'compensates', target: row.compensates, type: 'ref' }] : []),
        ...(options.instrument && row[`${options.instrument.kind}_id`] ? [{ id: `instrument-${row.id}`, source: row.id,
            field: `${options.instrument.kind}_id`, target: options.instrument.id, type: 'ref' }] : [])]);
    const events = createNodeSetAccess({ role: 'events', emit, roster: rows.map(r => r.id), links,
        bindings: [...rows.map(r => binding('event', r, 'events')), ...categoryRows.map(r => binding('category', r, 'events')),
            ...(options.instrument ? [binding(options.instrument.kind, { ...options.instrument }, 'events')] : [])] });
    const categories = createNodeSetAccess({ role: 'categories', emit,
        bindings: categoryRows.map(r => binding('category', r, 'categories')) });
    const subject = options.subject || { kind: 'person', ref_id: 'p1' };
    const context = createInstrumentedAccess({ emit, bindings: [{ alias: 'context', role: 'context', value: {
        subject, period: options.period || { kind: 'month', value: '2042-06' }, evidence_state: options.evidence_state || 'confirmed', time_basis: options.time_basis || 'event_date',
        ...(options.filters ? { filters: options.filters } : {})
    }, shape: { type: 'record', fields: { evidence_state: scalar, time_basis: scalar, filters: { type: 'record', fields: { budget_class: scalar } },
        period: { type: 'record', fields: { kind: scalar, value: scalar, start: scalar, end: scalar, start_inclusive: scalar, end_inclusive: scalar } }, subject: { type: 'record',
            fields: { kind: scalar, ref_id: scalar, family_id: scalar, category_id: scalar, person_id: scalar, budget_id: scalar } } } } }] });
    const family = createInstrumentedAccess({ emit, bindings: [{ alias: 'family', role: 'family', value: { id: 'f1', members: ['p1', 'p2'] },
        shape: { type: 'record', fields: { id: scalar, members: { type: 'sequence', item: scalar } } } }] });
    controls.push(events, categories, context, family);
    const instrument = options.instrument ? createInstrumentedAccess({ emit,
        bindings: [binding(options.instrument.kind, { ...options.instrument }, 'instrument')] }) : null;
    if (instrument) controls.push(instrument);
    return { observations, controls, operands: { events: events.handle, categories: categories.handle,
        context: context.handle('context'), family: family.handle('family'),
        ...(instrument ? { instrument: instrument.handle(options.instrument.id), card: instrument.handle(options.instrument.id) } : {}) } };
}

test('N02G:METRIC-SELECTION-001 consumption computes membership from handles and returns only the amount', () => {
    const f = fixture();
    assert.equal(evaluateConsumption(f.operands, 'total'), 75);
    assert.deepEqual(f.observations.filter(e => e[1] === 'select_member').map(e => e[6].slice(1)), [
        ['purchase', true], ['refund', true], ['income', false], ['future', false], ['old', false], ['other-person', false]
    ]);
    assert.equal(f.observations.filter(e => e[1] === 'get' && e[4][0] === 'amount_minor').length, 2);
    assert.ok(f.observations.some(e => e[1] === 'traverse'));
    for (const control of f.controls) { control.revoke(); control.assertHealthy(); }
});

test('N02G:METRIC-SELECTION-002 category selection follows compensation and respects family scope', () => {
    const f = fixture({ subject: { kind: 'family_category', family_id: 'f1', category_id: 'food' } });
    assert.equal(evaluateConsumption(f.operands, 'category'), 135);
    assert.ok(f.observations.some(e => e[1] === 'traverse' && e[4][0] === 'compensates'));
    const unknown = fixture({ subject: { kind: 'family_category', family_id: 'other-family', category_id: 'food' } });
    assert.throws(() => evaluateConsumption(unknown.operands, 'category'), /metric_selection_scope/);
});

test('N02G:METRIC-SELECTION-003 formerly excluded candidate changes result when its actual state changes', () => {
    const row = { id: 'candidate', date: '2042-06-10', state: 'projected', person_id: 'p1', category_id: 'food', amount_minor: -31 };
    assert.equal(evaluateConsumption(fixture({ rows: [row] }).operands, 'total'), 0);
    assert.equal(evaluateConsumption(fixture({ rows: [{ ...row, state: 'confirmed' }] }).operands, 'total'), 31);
    assert.equal(evaluateConsumption(fixture({ rows: [{ ...row, state: 'confirmed', date: '2042-07-01' }] }).operands, 'total'), 0);
});

test('N02G:METRIC-SELECTION-004 invalid mode, revoked handles and unsafe arithmetic cannot return a result', () => {
    assert.throws(() => evaluateConsumption(fixture().operands, 'guess'), /metric_selection_mode/);
    const f = fixture(); f.controls[0].revoke();
    assert.throws(() => evaluateConsumption(f.operands, 'total'), /access_set_/);
    const row = { id: 'a', date: '2042-06-10', state: 'confirmed', person_id: 'p1', category_id: 'food', amount_minor: -Number.MAX_SAFE_INTEGER };
    assert.throws(() => evaluateConsumption(fixture({ rows: [row, { ...row, id: 'b', amount_minor: -1 }] }).operands, 'total'), /metric_selection_money/);
});

test('N02G:METRIC-SELECTION-005 basis and scope are explicit even for empty populations', () => {
    const options = { rows: [], subject: { kind: 'category', ref_id: 'food' }, time_basis: 'budget_cycle' };
    assert.equal(evaluateConsumption(fixture(options).operands, 'spent'), 0);
    assert.throws(() => evaluateConsumption(fixture(options).operands, 'category'), /metric_selection_context/);
    assert.throws(() => evaluateConsumption(fixture({ rows: [], subject: { kind: 'category', ref_id: 'missing' } }).operands, 'category'), /metric_selection_category/);
    assert.throws(() => evaluateConsumption(fixture({ rows: [], evidence_state: 'estimated' }).operands, 'total'), /metric_selection_context/);
    assert.throws(() => evaluateConsumption(fixture({ rows: [], period: { kind: 'month', value: '2042-13' } }).operands, 'total'), /civil_month/);
});

test('N02G:METRIC-SELECTION-006 source count must equal eligible cardinality, not money or a declared zero', () => {
    const { evaluateDirectMetric } = require('../../../src/next/provenance/metricDirectReads');
    function run(count, coverage = 'complete') {
        const f = fixture({ subject: { kind: 'family_category', family_id: 'f1', category_id: 'food' } });
        const source = createInstrumentedAccess({ emit: e => f.observations.push(e), bindings: [{ alias: 'source', role: 'source',
            identity: { kind: 'source_state', ref_id: 'source', version },
            value: { id: 'source', period: '2042-06', category_id: 'food', coverage, ...(count === undefined ? {} : { event_count: count }) },
            shape: { type: 'record', fields: Object.fromEntries(['id', 'period', 'category_id', 'coverage', 'event_count', 'entity_id'].map(k => [k, scalar])) } }] });
        return evaluateDirectMetric({ ...f.operands, source: source.handle('source') }, 'eligible_event_count');
    }
    assert.equal(run(3), 3); // monetary total is 135, not 3
    for (const count of [0, 2, 4, undefined]) assert.throws(() => run(count), /direct_metric_count/);
    assert.throws(() => run(3, 'partial'), /direct_metric_coverage/);
});

test('N02G:METRIC-SELECTION-007 income preserves its sign and budget class follows the compensated expense', () => {
    assert.equal(evaluateEconomicMetric(fixture().operands, 'income'), 400);
    const options = { subject: { kind: 'family', ref_id: 'f1' }, filters: { budget_class: 'essential' } };
    assert.equal(evaluateEconomicMetric(fixture(options).operands, 'budget_class'), 135);
    assert.equal(evaluateEconomicMetric(fixture({ ...options, filters: { budget_class: 'flexible' } }).operands, 'budget_class'), 0);
    assert.throws(() => evaluateEconomicMetric(fixture({ ...options, filters: { budget_class: 'guessed' } }).operands, 'budget_class'), /metric_selection_filter/);
});

test('N02G:METRIC-SELECTION-008 instrument uses the declared kind and observed reference, never an owner or amount coincidence', () => {
    for (const kind of ['account', 'card']) {
        const row = { id: 'purchase', date: '2042-06-10', state: 'confirmed', person_id: 'p1', category_id: 'food', amount_minor: -42, [`${kind}_id`]: 'i' };
        const options = { instrument: { kind, id: 'i' }, subject: { kind, ref_id: 'i' }, rows: [row, { ...row, id: 'unlinked', [`${kind}_id`]: undefined }] };
        delete options.rows[1][`${kind}_id`];
        assert.equal(evaluateEconomicMetric(fixture(options).operands, 'instrument'), 42);
        assert.throws(() => evaluateEconomicMetric(fixture({ ...options, subject: { kind, ref_id: 'foreign' } }).operands, 'instrument'), /metric_selection_scope/);
    }
});

test('N02G:METRIC-SELECTION-009 a personal query uses the family limit but only that person consumption', () => {
    function run(subject, changes = {}) {
        const f = fixture({ subject, time_basis: 'budget_cycle' });
        const value = { id: 'budget', family_id: 'f1', category_id: 'food', period: '2042-06', evidence_state: 'confirmed', limit_minor: 200, ...changes };
        const budget = createInstrumentedAccess({ emit: e => f.observations.push(e), bindings: [{ alias: 'budget', role: 'budget',
            identity: { kind: 'budget', ref_id: 'budget', version }, value,
            shape: { type: 'record', fields: Object.fromEntries(Object.keys(value).map(k => [k, scalar])) } }] });
        return evaluateEconomicMetric({ ...f.operands, budget: budget.handle('budget') }, 'budget_remaining');
    }
    assert.equal(run({ kind: 'budget', ref_id: 'budget' }), 65);
    assert.equal(run({ kind: 'budget_person', budget_id: 'budget', person_id: 'p2' }), 140);
    assert.equal(run({ kind: 'budget', ref_id: 'budget' }, { limit_minor: 100 }), -35);
    assert.throws(() => run({ kind: 'budget_person', budget_id: 'budget', person_id: 'foreign' }), /metric_selection_scope/);
    assert.throws(() => run({ kind: 'budget', ref_id: 'budget' }, { period: '2042-05' }), /metric_selection_budget/);
    assert.throws(() => run({ kind: 'budget', ref_id: 'budget' }, { family_id: 'foreign' }), /metric_selection_scope/);
});

test('N02G:METRIC-SELECTION-010 statement uses the historical open-close civil window without clamping', () => {
    function run({ closing_day = 10, due_day = 17, value = '2042-06-17', basis = 'statement_due_date', calendar = 'proleptic_gregorian' } = {}) {
        const rows = ['2042-05-10', '2042-05-11', '2042-06-10', '2042-06-11'].map((date, i) => ({
            id: `e${i}`, date, state: 'confirmed', person_id: 'p1', category_id: 'food', amount_minor: -(i + 1), card_id: 'card' }));
        const f = fixture({ rows, subject: { kind: 'card', ref_id: 'card' }, period: { kind: 'statement_due', value },
            time_basis: basis, instrument: { kind: 'card', id: 'card', closing_day, due_day } });
        const policy = createInstrumentedAccess({ emit: e => f.observations.push(e), bindings: [{ alias: 'policy', role: 'policy',
            value: { calendar }, shape: { type: 'record', fields: { calendar: scalar } } }] });
        return evaluateEconomicMetric({ ...f.operands, policy: policy.handle('policy') }, 'statement');
    }
    assert.equal(run(), 5);
    assert.equal(run({ basis: 'statement_competence' }), 5);
    assert.throws(() => run({ value: '2042-06-18' }), /metric_selection_statement/);
    assert.throws(() => run({ closing_day: 31 }), /civil_date/);
    assert.throws(() => run({ closing_day: 30, value: '2042-03-17' }), /civil_nonexistent_target/);
    assert.throws(() => run({ calendar: 'guessed' }), /metric_selection_statement/);
});

test('N02G:METRIC-SELECTION-011 safe pace derives remaining civil days before checking literal policy and floors signed results', () => {
    function run({ clock = '2042-06-15T12:00:00Z', policy = {}, limit = 3400 } = {}) {
        const f = fixture({ subject: { kind: 'budget', ref_id: 'budget' }, evidence_state: 'estimated',
            time_basis: '15_full_days_after_as_of', period: { kind: 'range', start: '2042-06-16', end: '2042-06-30', start_inclusive: true, end_inclusive: true } });
        const emit = e => f.observations.push(e);
        const budget = { id: 'budget', family_id: 'family', category_id: 'food', period: '2042-06', limit_minor: limit, evidence_state: 'confirmed' };
        const family = { id: 'family', members: ['p1', 'p2'] };
        const access = createInstrumentedAccess({ emit, bindings: [['budget', 'budget', budget], ['family', 'family', family]].map(([alias, kind, value]) => ({
            alias, role: 'budget', value, identity: { kind, ref_id: alias, version }, shape: { type: 'record',
                fields: Object.fromEntries(Object.keys(value).map(k => [k, k === 'members' ? { type: 'sequence', item: scalar } : scalar])) }
        })), links: [{ id: 'family', source: 'budget', field: 'family_id', target: 'family', type: 'ref' }] });
        const policyValue = { timezone: 'America/Sao_Paulo', calendar: 'proleptic_gregorian', daily_pace_as_of: '2042-06-15',
            daily_pace_start: '2042-06-16', daily_pace_end: '2042-06-30', daily_pace_divisor: 15, daily_pace_rounding: 'floor', ...policy };
        const temporal = createInstrumentedAccess({ emit, bindings: [['clock', { fixed_clock: clock }], ['policy', policyValue]].map(([alias, value]) => ({
            alias, role: 'temporal', value, shape: { type: 'record', fields: Object.fromEntries(Object.keys(value).map(k => [k, scalar])) }
        })) });
        const operands = { events: f.operands.events, categories: f.operands.categories, context: f.operands.context,
            budget: access.handle('budget'), clock: temporal.handle('clock'), policy: temporal.handle('policy') };
        return evaluateEconomicMetric(operands, 'safe_pace');
    }
    assert.equal(run(), 217); // (3400 - 135) / 15 = 217.66...
    assert.equal(run({ limit: 130 }), -1); // floor(-5 / 15), not truncation
    for (const policy of [{ daily_pace_divisor: 14 }, { daily_pace_as_of: '2042-06-14' },
        { daily_pace_start: '2042-06-15' }, { daily_pace_end: '2042-06-29' }, { daily_pace_rounding: 'round' }]) {
        assert.throws(() => run({ policy }), /metric_selection_pace/);
    }
    assert.throws(() => run({ clock: '2042-06-15T02:59:59Z' }), /metric_selection_pace/);
});
