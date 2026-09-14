'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createInstrumentedAccess, createNodeSetAccess } = require('../../../src/next/provenance/instrumentedAccess');
const { evaluateConsumption } = require('../../../src/next/provenance/metricSelection');

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
    const categoryRows = [{ id: 'food', kind: 'expense' }, { id: 'refund-kind', kind: 'compensation' }, { id: 'salary', kind: 'income' }];
    function binding(kind, value, role) {
        const names = kind === 'event' ? ['id', 'date', 'state', 'person_id', 'category_id', 'amount_minor', 'compensates'] : ['id', 'kind'];
        return { alias: value.id, role, identity: { kind, ref_id: value.id, version }, value,
            shape: { type: 'record', fields: Object.fromEntries(names.map(name => [name, scalar])) } };
    }
    const links = rows.flatMap(row => [{ id: `cat-${row.id}`, source: row.id, field: 'category_id', target: row.category_id, type: 'ref' },
        ...(row.compensates ? [{ id: `comp-${row.id}`, source: row.id, field: 'compensates', target: row.compensates, type: 'ref' }] : [])]);
    const events = createNodeSetAccess({ role: 'events', emit, roster: rows.map(r => r.id), links,
        bindings: [...rows.map(r => binding('event', r, 'events')), ...categoryRows.map(r => binding('category', r, 'events'))] });
    const categories = createNodeSetAccess({ role: 'categories', emit,
        bindings: categoryRows.map(r => binding('category', r, 'categories')) });
    const subject = options.subject || { kind: 'person', ref_id: 'p1' };
    const context = createInstrumentedAccess({ emit, bindings: [{ alias: 'context', role: 'context', value: {
        subject, period: options.period || { kind: 'month', value: '2042-06' }, evidence_state: options.evidence_state || 'confirmed', time_basis: options.time_basis || 'event_date'
    }, shape: { type: 'record', fields: { evidence_state: scalar, time_basis: scalar,
        period: { type: 'record', fields: { kind: scalar, value: scalar } }, subject: { type: 'record',
            fields: { kind: scalar, ref_id: scalar, family_id: scalar, category_id: scalar, person_id: scalar } } } } }] });
    const family = createInstrumentedAccess({ emit, bindings: [{ alias: 'family', role: 'family', value: { id: 'f1', members: ['p1', 'p2'] },
        shape: { type: 'record', fields: { id: scalar, members: { type: 'sequence', item: scalar } } } }] });
    controls.push(events, categories, context, family);
    return { observations, controls, operands: { events: events.handle, categories: categories.handle,
        context: context.handle('context'), family: family.handle('family') } };
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
