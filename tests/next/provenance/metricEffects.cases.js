'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createInstrumentedAccess, createNodeSetAccess } = require('../../../src/next/provenance/instrumentedAccess');
const { evaluateEffects } = require('../../../src/next/provenance/metricEffects');
const scalar = { type: 'scalar' }; const version = `sha256:${'c'.repeat(64)}`;
function fixture({ metric = 'net_consumption', mutate = () => {}, subject = { kind: 'event', ref_id: 'purchase' }, roster = ['purchase', 'refund'] } = {}) {
    const rows = [{ id: 'purchase', date: '2042-06-07', state: 'confirmed', person_id: 'p', category_id: 'food', amount_minor: -123 },
        { id: 'refund', date: '2042-06-09', state: 'confirmed', person_id: 'p', category_id: 'refund-category', amount_minor: 23, compensates: 'purchase' },
        { id: 'other', date: '2042-06-07', state: 'confirmed', person_id: 'p', category_id: 'food', amount_minor: -123 }];
    mutate(rows);
    const cats = [{ id: 'food', kind: 'expense' }, { id: 'refund-category', kind: 'compensation' }];
    const observations = []; const emit = e => observations.push(e);
    const binding = (kind, value, role) => ({ alias: value.id, role, value, identity: { kind, ref_id: value.id, version },
        shape: { type: 'record', fields: Object.fromEntries((kind === 'event'
            ? ['id', 'date', 'state', 'person_id', 'category_id', 'amount_minor', 'compensates', 'transfer_pair', 'settles_card_id', 'account_id']
            : ['id', 'kind']).map(k => [k, scalar])) } });
    const links = rows.flatMap(row => [{ id: `cat-${row.id}`, source: row.id, field: 'category_id', target: row.category_id, type: 'ref' },
        ...(row.compensates ? [{ id: `comp-${row.id}`, source: row.id, field: 'compensates', target: row.compensates, type: 'ref' }] : [])]);
    const events = createNodeSetAccess({ role: 'events', emit, roster, links,
        bindings: [...rows.map(r => binding('event', r, 'events')), ...cats.map(r => binding('category', r, 'events'))] });
    const categories = createNodeSetAccess({ role: 'categories', emit, bindings: cats.map(r => binding('category', r, 'categories')) });
    const context = createInstrumentedAccess({ emit, bindings: [{ alias: 'ctx', role: 'context',
        value: { subject, period: { kind: 'month', value: '2042-06' }, time_basis: 'event_date' },
        shape: { type: 'record', fields: { subject: { type: 'record', fields: { kind: scalar, ref_id: scalar, person_id: scalar, category_id: scalar } },
            period: { type: 'record', fields: { kind: scalar, value: scalar } }, time_basis: scalar } } }] });
    return { run: () => evaluateEffects({ events: events.handle, categories: categories.handle, context: context.handle('ctx') }, metric), observations };
}

test('N02G:EFFECT-METRIC-001 gross, refund and net preserve distinct functional meanings', () => {
    assert.equal(fixture().run(), 100);
    assert.equal(fixture({ metric: 'gross_consumption', roster: ['purchase'] }).run(), 123);
    assert.equal(fixture({ metric: 'refund_amount', subject: { kind: 'event', ref_id: 'refund' }, roster: ['refund'] }).run(), 23);
    assert.equal(fixture({ subject: { kind: 'person_category', person_id: 'p', category_id: 'food' } }).run(), 100);
    assert.equal(fixture({ mutate: rows => rows[1].amount_minor = 7 }).run(), 116);
});

test('N02G:EFFECT-METRIC-002 equal amounts cannot replace the economic compensation link', () => {
    assert.throws(() => fixture({ mutate: rows => rows[1].compensates = 'other' }).run(), /effect_metric_|access_set_predicate_threw/);
    assert.throws(() => fixture({ mutate: rows => delete rows[1].compensates }).run(), /effect_metric_|access_set_predicate_threw/);
    assert.throws(() => fixture({ mutate: rows => rows[1].person_id = 'foreign' }).run(), /effect_metric_|access_set_predicate_threw/);
    assert.throws(() => fixture({ roster: ['refund'] }).run(), /effect_metric_/);
});
