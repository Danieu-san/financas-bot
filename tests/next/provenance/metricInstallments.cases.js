'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createInstrumentedAccess, createNodeSetAccess } = require('../../../src/next/provenance/instrumentedAccess');
const { evaluateInstallments } = require('../../../src/next/provenance/metricInstallments');
const scalar = { type: 'scalar' }; const version = `sha256:${'b'.repeat(64)}`;
function fixture(change = () => {}, omitLink, roster = ['third', 'plain', 'first', 'second'], linkedVersion) {
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
    const referenceKinds = { installment_plan: 'installment_plan', person_id: 'person', category_id: 'category', card_id: 'card', account_id: 'account' };
    const links = [...rows.filter(row => row[1] === 'event').flatMap(([source, , value]) =>
        Object.entries(referenceKinds).filter(([field]) => Object.hasOwn(value, field)).map(([field, kind]) => ({
            id: field === 'installment_plan' ? source : `${field === 'person_id' ? 'person' : field === 'category_id' ? 'category' : field}-${source}`,
            source, field, target: rows.find(row => row[1] === kind && row[2].id === value[field])?.[0] || 'missing-reference', type: 'ref' }))),
    ...['plan', 'family'].flatMap(source => [...new Set(rows.find(row => row[0] === source)[2].members)].map(target => ({
        id: `member-${source}-${target}`, source, target, field: 'members', type: 'ref_list' })))].filter(link => link.id !== omitLink);
    const setBindings = linkedVersion ? bindings.map(binding => binding.alias === 'plan'
        ? { ...binding, identity: { ...binding.identity, version: linkedVersion } } : binding) : bindings;
    const set = createNodeSetAccess({ bindings: setBindings, links, role: 'events', roster, emit: e => observations.push(e) });
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

// Kernel handles only: these variants are not admitted graph mutations.
test('N02G:INSTALLMENT-ROSTER-001 an unlisted event cannot become a member through its scalar plan reference', () => {
    const f = fixture(rows => Object.assign(rows[4][2], {
        installment_plan: 'plan', installment_number: 99, installment_total: 3
    }));
    try {
        assert.equal(evaluateInstallments(f.operands(range), 'installments_projected'), 2);
        assert.equal(f.observations.some(e => e[2] === 'plain' &&
            (e[1] === 'get' || e[1] === 'traverse') && e[4][0] === 'installment_plan'), false);
    } finally { f.revoke(); }
});

test('N02G:INSTALLMENT-ROSTER-002 unrelated dimension variation does not change R or add observations', () => {
    for (const metric of ['installments_projected', 'installments_projected_amount', 'projected_installments']) {
        for (const field of ['category_id', 'card_id', 'account_id']) {
            const f = fixture(rows => {
                const kind = field === 'category_id' ? 'category' : field === 'card_id' ? 'card' : 'account';
                rows.push(['different', kind, { id: 'different' }]); rows[2][2][field] = 'different';
            });
            try {
                assert.equal(evaluateInstallments(f.operands(range, metric === 'projected_installments'), metric),
                    metric === 'installments_projected' ? 2 : 205);
                assert.equal(f.observations.some(e => ['category_id', 'card_id', 'account_id'].includes(e[4]?.[0])), false);
                if (metric !== 'projected_installments')
                    assert.equal(f.observations.some(e => e[4]?.[0] === 'person_id'), false);
            } finally { f.revoke(); }
        }
    }
});

test('N02G:INSTALLMENT-ROSTER-003 missing members and wrong linked revisions fail closed', () => {
    for (const f of [fixture(() => {}, undefined, ['third', 'plain', 'second']),
        fixture(() => {}, undefined, undefined, `sha256:${'c'.repeat(64)}`),
        fixture(rows => { rows[4][2].id = 'first'; })]) {
        try { assert.throws(() => evaluateInstallments(f.operands(range), 'installments_projected'),
            /installment_metric_members|metric_reference_duplicate|access_set_predicate_threw/); }
        finally { f.revoke(); }
    }
});

test('N02G:INSTALLMENT-ROSTER-004 counts are invariant to member amounts; monetary metrics observe only selected amounts', () => {
    for (const [a, b] of [[-1, -2], [-700, -3], [-11, -991]]) {
        for (const metric of ['installments_projected', 'installments_projected_amount']) {
            const f = fixture(rows => { rows[2][2].amount_minor = a; rows[3][2].amount_minor = b; });
            try {
                assert.equal(evaluateInstallments(f.operands(range), metric),
                    metric === 'installments_projected' ? 2 : -a - b);
                const reads = f.observations.filter(e => e[1] === 'get' && e[4][0] === 'amount_minor');
                assert.deepEqual(reads.map(e => e[2]).sort(), metric === 'installments_projected' ? [] : ['second', 'third']);
            } finally { f.revoke(); }
        }
    }
});

test('N02G:INSTALLMENT-ROSTER-005 listed membership cannot be redirected to another plan', () => {
    const f = fixture(rows => {
        rows.push(['other-plan', 'installment_plan', { id: 'other-plan' }]);
        rows[2][2].installment_plan = 'other-plan';
    });
    try { assert.throws(() => evaluateInstallments(f.operands(range), 'installments_projected'), /access_set_predicate_threw/); }
    finally { f.revoke(); }
});

test('N02G:INSTALLMENT-REFERENCE-001 optional account or card dimensions are outside the functional formula', () => {
    for (const field of ['card_id', 'account_id']) {
        const mutate = rows => { for (const row of rows.slice(1, 4)) { delete row[2].card_id; row[2][field] = field === 'card_id' ? 'c' : 'a'; } };
        for (const [metric, period, family, expected] of [
            ['installments_realized', through, false, 1], ['installments_projected', range, false, 2],
            ['installments_projected_amount', range, false, 205], ['projected_installments', range, true, 205]]) {
            const f = fixture(mutate);
            try {
                assert.equal(evaluateInstallments(f.operands(period, family), metric), expected);
                assert.equal(f.observations.some(e => e[1] === 'get' && e[4][0] === field), false);
                assert.equal(f.observations.some(e => e[1] === 'traverse' && e[4][0] === field), false);
                assert.equal(f.observations.some(e => e[2] === 'c' || e[2] === 'a'), false);
            } finally { f.revoke(); }
            // Test handle boundary only, not whole-package admission: the
            // formula does not consume this scalar or resolve its target.
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
                const count = field === 'installment_plan' || field === 'person_id' && family ? 3 : 0;
                assert.equal(f.observations.filter(e => e[1] === 'get' && e[4][0] === field).length, count);
                assert.equal(f.observations.filter(e => e[1] === 'traverse' && e[4][0] === field).length, count);
            }
            assert.equal(f.observations.some(e => ['p', 'no-events', 'cat'].includes(e[2])), false);
        } finally { f.revoke(); }
    }
});

test('N02G:INSTALLMENT-REFERENCES-002 an unresolved member or source relation cannot hide behind a financial exclusion', () => {
    for (const omitLink of ['member-plan-first', 'member-family-no-events', 'person-first']) {
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

test('N02G:INSTALLMENT-METRIC-002 inconsistent plan membership, index and dates fail before a result', () => {
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
