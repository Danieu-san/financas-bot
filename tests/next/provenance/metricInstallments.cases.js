'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createInstrumentedAccess, createNodeSetAccess } = require('../../../src/next/provenance/instrumentedAccess');
const { evaluateInstallments } = require('../../../src/next/provenance/metricInstallments');
const scalar = { type: 'scalar' }; const version = `sha256:${'b'.repeat(64)}`;
function fixture(change = () => {}, omitLink) {
    const rows = [
        ['plan', 'installment_plan', { id: 'plan', members: ['first', 'second', 'third'], installment_total: 3 }],
        ['first', 'event', { id: 'first', date: '2042-06-14', state: 'confirmed', installment_plan: 'plan', installment_number: 1, installment_total: 3, person_id: 'p', card_id: 'c', category_id: 'cat', amount_minor: -101 }],
        ['second', 'event', { id: 'second', date: '2042-07-14', state: 'projected', installment_plan: 'plan', installment_number: 2, installment_total: 3, person_id: 'p', card_id: 'c', category_id: 'cat', amount_minor: -102 }],
        ['third', 'event', { id: 'third', date: '2042-08-14', state: 'projected', installment_plan: 'plan', installment_number: 3, installment_total: 3, person_id: 'p', card_id: 'c', category_id: 'cat', amount_minor: -103 }],
        ['plain', 'event', { id: 'plain', date: '2042-07-14', state: 'projected', amount_minor: -999 }],
        ['p', 'person', { id: 'p' }], ['family', 'family', { id: 'family', members: ['p'] }],
        ['cat', 'category', { id: 'cat' }], ['no-events', 'person', { id: 'no-events' }],
        ['c', 'card', { id: 'c' }], ['a', 'account', { id: 'a' }]];
    change(rows);
    const observations = [];
    const bindings = rows.map(([alias, kind, value]) => ({ alias, role: 'events', value,
        identity: { kind, ref_id: value.id, version }, shape: { type: 'record', fields: {
            ...Object.fromEntries(Object.keys(value).map(k => [k, k === 'members' ? { type: 'sequence', item: scalar } : scalar])),
            ...(kind === 'event' ? { installment_plan: scalar, account_id: scalar, card_id: scalar } : {}) } } }));
    const links = [...['first', 'second', 'third'].flatMap(source => [{ id: source, source, target: 'plan', field: 'installment_plan', type: 'ref' },
        { id: `person-${source}`, source, target: 'p', field: 'person_id', type: 'ref' },
        { id: `category-${source}`, source, target: 'cat', field: 'category_id', type: 'ref' },
        ...['card_id', 'account_id'].filter(field => Object.hasOwn(rows.find(row => row[0] === source)[2], field)).map(field => ({
            id: `${field}-${source}`, source, field, target: field === 'card_id' ? 'c' : 'a', type: 'ref' }))]),
    ...['plan', 'family'].flatMap(source => [...new Set(rows.find(row => row[0] === source)[2].members)].map(target => ({
        id: `member-${source}-${target}`, source, target, field: 'members', type: 'ref_list' })))].filter(link => link.id !== omitLink);
    const set = createNodeSetAccess({ bindings, links, role: 'events', roster: ['third', 'plain', 'first', 'second'], emit: e => observations.push(e) });
    const nodes = createInstrumentedAccess({ bindings, links, emit: e => observations.push(e) });
    const contexts = [];
    const ctx = (period, family) => { const control = createInstrumentedAccess({ bindings: [{ alias: 'ctx', role: 'context',
        value: { subject: family ? { kind: 'family', ref_id: 'family' } : { kind: 'installment_plan', ref_id: 'plan' }, period, time_basis: 'installment_competence' },
        shape: { type: 'record', fields: { subject: { type: 'record', fields: { kind: scalar, ref_id: scalar } },
            period: { type: 'record', fields: Object.fromEntries(Object.keys(period).map(k => [k, scalar])) }, time_basis: scalar } } }], emit: e => observations.push(e) });
        contexts.push(control); return control.handle('ctx'); };
    const plans = createNodeSetAccess({ bindings, links, role: 'events', roster: ['plan'], emit: e => observations.push(e) });
    return { operands: (period, family = false) => ({ context: ctx(period, family), plan: nodes.handle('plan'),
        plans: plans.handle, family: nodes.handle('family'), events: set.handle }), observations,
        revoke: () => { for (const control of [set, nodes, plans, ...contexts]) control.revoke(); } };
}
const through = { kind: 'through', value: '2042-06-14' };
const range = { kind: 'range', start: '2042-07-14', end: '2042-08-14', start_inclusive: true, end_inclusive: true };

test('N02G:INSTALLMENT-REFERENCE-001 comparing optional dimension IDs does not consume unrelated account or card targets', () => {
    for (const field of ['card_id', 'account_id']) {
        const mutate = rows => { for (const row of rows.slice(1, 4)) { delete row[2].card_id; row[2][field] = field === 'card_id' ? 'c' : 'a'; } };
        for (const [metric, period, family, expected] of [
            ['installments_realized', through, false, 1], ['installments_projected', range, false, 2],
            ['installments_projected_amount', range, false, 205], ['projected_installments', range, true, 205]]) {
            const f = fixture(mutate);
            try {
                assert.equal(evaluateInstallments(f.operands(period, family), metric), expected);
                for (const source of ['first', 'second', 'third']) assert.ok(f.observations.some(e => e[1] === 'get' && e[2] === source && e[4][0] === field));
                assert.equal(f.observations.some(e => e[1] === 'traverse' && e[4][0] === field), false);
                assert.equal(f.observations.some(e => e[2] === 'c' || e[2] === 'a'), false);
            } finally { f.revoke(); }
            // Test handle boundary only, not whole-package admission: the
            // formula compares the scalar and never asks to resolve its target.
            const scalarOnly = fixture(mutate, `${field}-second`);
            try { assert.equal(evaluateInstallments(scalarOnly.operands(period, family), metric), expected); }
            finally { scalarOnly.revoke(); }
        }
    }
});

test('N02G:INSTALLMENT-REFERENCES-001 plans and family resolve their complete populations without consuming member payloads', () => {
    for (const family of [false, true]) {
        const f = fixture(rows => rows[6][2].members.push('no-events'));
        try {
            assert.equal(evaluateInstallments(f.operands(range, family), family ? 'projected_installments' : 'installments_projected_amount'), 205);
            for (const [source, count] of family ? [['plan', 3], ['family', 2]] : [['plan', 3]]) {
                assert.equal(f.observations.filter(e => e[1] === 'traverse' && e[2] === source && e[4][0] === 'members').length, count);
                assert.ok(f.observations.some(e => e[1] === 'length' && e[2] === source && e[4][0] === 'members'));
            }
            for (const field of ['person_id', 'category_id', 'installment_plan']) {
                assert.equal(f.observations.filter(e => e[1] === 'get' && e[4][0] === field).length, 3);
                assert.equal(f.observations.filter(e => e[1] === 'traverse' && e[4][0] === field).length, 3);
            }
            assert.equal(f.observations.some(e => ['p', 'no-events', 'cat'].includes(e[2])), false);
        } finally { f.revoke(); }
    }
});

test('N02G:INSTALLMENT-REFERENCES-002 an unresolved member or source relation cannot hide behind a financial exclusion', () => {
    for (const omitLink of ['member-plan-first', 'member-family-no-events', 'person-first', 'category-first']) {
        const f = fixture(rows => rows[6][2].members.push('no-events'), omitLink);
        try { assert.throws(() => evaluateInstallments(f.operands(range, true), 'projected_installments'), /access_/); }
        finally { f.revoke(); }
    }
});

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
    for (const mutate of mutations) assert.throws(() => evaluateInstallments(fixture(mutate).operands(range), 'installments_projected'), /installment_metric_|metric_reference_duplicate|access_set_predicate_threw|access_shape_invalid/);
    assert.throws(() => evaluateInstallments(fixture().operands({ ...range, start_inclusive: false }), 'installments_projected'), /installment_metric_period/);
});

test('N02G:INSTALLMENT-METRIC-003 family projection sums only projected linked members without fabricating missing parts', () => {
    assert.equal(evaluateInstallments(fixture().operands(range, true), 'projected_installments'), 205);
    const outside = fixture(rows => rows[6][2].members = []);
    assert.equal(evaluateInstallments(outside.operands(range, true), 'projected_installments'), 0);
    const missing = fixture(rows => rows[0][2].members.pop());
    assert.throws(() => evaluateInstallments(missing.operands(range, true), 'projected_installments'), /installment_metric_|access_set_predicate_threw/);
});
