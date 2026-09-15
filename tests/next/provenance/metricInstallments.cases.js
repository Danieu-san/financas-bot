'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createInstrumentedAccess, createNodeSetAccess } = require('../../../src/next/provenance/instrumentedAccess');
const { evaluateInstallments } = require('../../../src/next/provenance/metricInstallments');
const scalar = { type: 'scalar' }; const version = `sha256:${'b'.repeat(64)}`;
function fixture(change = () => {}) {
    const rows = [
        ['plan', 'installment_plan', { id: 'plan', members: ['first', 'second', 'third'], installment_total: 3 }],
        ['first', 'event', { id: 'first', date: '2042-06-14', state: 'confirmed', installment_plan: 'plan', installment_number: 1, installment_total: 3, person_id: 'p', card_id: 'c', category_id: 'cat', amount_minor: -101 }],
        ['second', 'event', { id: 'second', date: '2042-07-14', state: 'projected', installment_plan: 'plan', installment_number: 2, installment_total: 3, person_id: 'p', card_id: 'c', category_id: 'cat', amount_minor: -102 }],
        ['third', 'event', { id: 'third', date: '2042-08-14', state: 'projected', installment_plan: 'plan', installment_number: 3, installment_total: 3, person_id: 'p', card_id: 'c', category_id: 'cat', amount_minor: -103 }],
        ['plain', 'event', { id: 'plain', date: '2042-07-14', state: 'projected', amount_minor: -999 }],
        ['p', 'person', { id: 'p' }], ['family', 'family', { id: 'family', members: ['p'] }]];
    change(rows);
    const observations = [];
    const bindings = rows.map(([alias, kind, value]) => ({ alias, role: 'events', value,
        identity: { kind, ref_id: value.id, version }, shape: { type: 'record', fields: {
            ...Object.fromEntries(Object.keys(value).map(k => [k, k === 'members' ? { type: 'sequence', item: scalar } : scalar])),
            ...(kind === 'event' ? { installment_plan: scalar, account_id: scalar, card_id: scalar } : {}) } } }));
    const links = ['first', 'second', 'third'].flatMap(source => [{ id: source, source, target: 'plan', field: 'installment_plan', type: 'ref' },
        { id: `person-${source}`, source, target: 'p', field: 'person_id', type: 'ref' }]);
    const set = createNodeSetAccess({ bindings, links, role: 'events', roster: ['third', 'plain', 'first', 'second'], emit: e => observations.push(e) });
    const nodes = createInstrumentedAccess({ bindings, links, emit: e => observations.push(e) });
    const ctx = (period, family) => createInstrumentedAccess({ bindings: [{ alias: 'ctx', role: 'context',
        value: { subject: family ? { kind: 'family', ref_id: 'family' } : { kind: 'installment_plan', ref_id: 'plan' }, period, time_basis: 'installment_competence' },
        shape: { type: 'record', fields: { subject: { type: 'record', fields: { kind: scalar, ref_id: scalar } },
            period: { type: 'record', fields: Object.fromEntries(Object.keys(period).map(k => [k, scalar])) }, time_basis: scalar } } }], emit: e => observations.push(e) }).handle('ctx');
    const plans = createNodeSetAccess({ bindings, links, role: 'events', roster: ['plan'], emit: e => observations.push(e) });
    return { operands: (period, family = false) => ({ context: ctx(period, family), plan: nodes.handle('plan'),
        plans: plans.handle, family: nodes.handle('family'), events: set.handle }), observations };
}
const through = { kind: 'through', value: '2042-06-14' };
const range = { kind: 'range', start: '2042-07-14', end: '2042-08-14', start_inclusive: true, end_inclusive: true };

test('N02G:INSTALLMENT-METRIC-001 realized and projected states have independent counts and signed amounts', () => {
    const f = fixture();
    assert.equal(evaluateInstallments(f.operands(through), 'installments_realized'), 1);
    assert.equal(evaluateInstallments(f.operands(through), 'installments_realized_amount'), 101);
    assert.equal(evaluateInstallments(f.operands(range), 'installments_projected'), 2);
    assert.equal(evaluateInstallments(f.operands(range), 'installments_projected_amount'), 205);
    assert.equal(evaluateInstallments(f.operands({ ...range, end: '2042-08-13' }), 'installments_projected_amount'), 102);
    assert.ok(f.observations.some(e => e[1] === 'traverse'));
});

test('N02G:INSTALLMENT-METRIC-002 inconsistent plan membership, index, dates and dimensions fail before a result', () => {
    const mutations = [rows => rows[0][2].members.pop(), rows => rows[0][2].members.push('second'),
        rows => rows[2][2].installment_number = 1, rows => rows[2][2].installment_total = 4,
        rows => rows[2][2].person_id = 'foreign', rows => rows[2][2].date = '2042-05-14'];
    for (const mutate of mutations) assert.throws(() => evaluateInstallments(fixture(mutate).operands(range), 'installments_projected'), /installment_metric_|access_set_predicate_threw/);
    assert.throws(() => evaluateInstallments(fixture().operands({ ...range, start_inclusive: false }), 'installments_projected'), /installment_metric_period/);
});

test('N02G:INSTALLMENT-METRIC-003 family projection sums only projected linked members without fabricating missing parts', () => {
    assert.equal(evaluateInstallments(fixture().operands(range, true), 'projected_installments'), 205);
    const outside = fixture(rows => rows[6][2].members = []);
    assert.equal(evaluateInstallments(outside.operands(range, true), 'projected_installments'), 0);
    const missing = fixture(rows => rows[0][2].members.pop());
    assert.throws(() => evaluateInstallments(missing.operands(range, true), 'projected_installments'), /installment_metric_|access_set_predicate_threw/);
});
