'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createInstrumentedAccess, createNodeSetAccess } = require('../../../src/next/provenance/instrumentedAccess');
const { evaluateEffects } = require('../../../src/next/provenance/metricEffects');
const scalar = { type: 'scalar' }; const version = `sha256:${'c'.repeat(64)}`;
function fixture({ metric = 'net_consumption', mutate = () => {}, subject = { kind: 'event', ref_id: 'purchase' }, roster = ['purchase', 'refund'], namespace, omitOwnerLink, period = { kind: 'month', value: '2042-06' } } = {}) {
    const rows = [{ id: 'purchase', date: '2042-06-07', state: 'confirmed', person_id: 'p', category_id: 'food', amount_minor: -123 },
        { id: 'refund', date: '2042-06-09', state: 'confirmed', person_id: 'p', category_id: 'refund-category', amount_minor: 23, compensates: 'purchase' },
        { id: 'other', date: '2042-06-07', state: 'confirmed', person_id: 'p', category_id: 'food', amount_minor: -123 }];
    mutate(rows);
    const cats = [{ id: 'food', kind: 'expense' }, { id: 'refund-category', kind: 'compensation' }];
    // Generated fixtures use payload IDs different from both the aliases and
    // the original symbolic labels. Rewriting is test setup, never runtime.
    const ref = value => namespace === undefined ? value : `${namespace}-id-${value}`;
    const alias = value => namespace === undefined ? value : `node-${value}`;
    if (namespace !== undefined) {
        for (const row of [...rows, ...cats]) for (const field of ['id', 'person_id', 'category_id', 'compensates']) {
            if (Object.hasOwn(row, field)) row[field] = ref(row[field]);
        }
        subject = Object.fromEntries(Object.entries(subject).map(([field, value]) =>
            [field, ['ref_id', 'person_id', 'category_id'].includes(field) ? ref(value) : value]));
        roster = roster.map(ref);
    }
    const observations = []; const emit = e => observations.push(e);
    const people = [...new Set(rows.map(row => row.person_id))].map(id => ({ id }));
    const binding = (kind, value, role) => ({ alias: alias(value.id), role, value, identity: { kind, ref_id: value.id, version },
        shape: { type: 'record', fields: Object.fromEntries((kind === 'event'
            ? ['id', 'date', 'state', 'person_id', 'category_id', 'amount_minor', 'compensates', 'transfer_pair', 'settles_card_id', 'account_id']
            : ['id', 'kind']).map(k => [k, scalar])) } });
    const links = rows.flatMap(row => [...(row.id === ref(omitOwnerLink) ? [] : [{ id: `owner-${row.id}`, source: alias(row.id), field: 'person_id', target: alias(row.person_id), type: 'ref' }]),
        { id: `cat-${row.id}`, source: alias(row.id), field: 'category_id', target: alias(row.category_id), type: 'ref' },
        ...(row.compensates ? [{ id: `comp-${row.id}`, source: alias(row.id), field: 'compensates', target: alias(row.compensates), type: 'ref' }] : [])]);
    const events = createNodeSetAccess({ role: 'events', emit, roster: roster.map(alias), links,
        bindings: [...rows.map(r => binding('event', r, 'events')), ...cats.map(r => binding('category', r, 'events')),
            ...people.map(r => binding('person', r, 'events'))] });
    const categories = createNodeSetAccess({ role: 'categories', emit, bindings: cats.map(r => binding('category', r, 'categories')) });
    const context = createInstrumentedAccess({ emit, bindings: [{ alias: 'ctx', role: 'context',
        value: { subject, period, time_basis: 'event_date' },
        shape: { type: 'record', fields: { subject: { type: 'record', fields: { kind: scalar, ref_id: scalar, person_id: scalar, category_id: scalar } },
            period: { type: 'record', fields: { kind: scalar, value: scalar } }, time_basis: scalar } } }] });
    const operands = { events: events.handle, categories: categories.handle, context: context.handle('ctx') };
    return { run: () => evaluateEffects(operands, metric), observations, operands, controls: [events, categories, context] };
}

test('N02G:SCALAR-REFERENCE-003 economic effects resolve owner links without reading their payload', () => {
    for (let seed = 0; seed < 6; seed++) {
        const options = { namespace: `owner-${seed}`, roster: seed % 2 ? ['refund', 'purchase', 'other'] : ['purchase', 'refund', 'other'] };
        const f = fixture(options); const bad = fixture({ ...options, omitOwnerLink: 'other' });
        try {
            assert.equal(f.run(), 100);
            const owners = f.observations.filter(e => e[1] === 'traverse' && e[4][0] === 'person_id');
            assert.equal(owners.length, 3);
            assert.equal(f.observations.some(e => e[2] === `node-owner-${seed}-id-p`), false);
            assert.throws(bad.run, /access_set_predicate_threw/);
        } finally { for (const c of [...f.controls, ...bad.controls]) c.revoke(); }
    }
});

test('N02G:COMPENSATION-REFERENCE-002 net effects bind the compensation scalar to the resolved event', () => {
    const positive = fixture();
    try {
        assert.equal(positive.run(), 100);
        assert.equal(positive.observations.filter(e => e[1] === 'get' && e[4][0] === 'compensates').length, 1);
    } finally { for (const c of positive.controls) c.revoke(); }
    for (const value of [undefined, 7, '', 'other']) {
        const f = fixture();
        const events = Object.freeze({ select: predicate => f.operands.events.select(node => predicate(Object.freeze({
            ...node, get: field => field === 'compensates' ? value : node.get(field)
        }))) });
        try { assert.throws(() => evaluateEffects({ ...f.operands, events }, 'net_consumption'), /^Error: access_set_predicate_threw$/); }
        finally { for (const c of f.controls) c.revoke(); }
    }
});

test('N02G:EFFECT-METRIC-003 categories of both refund and original have observed scalar reads', () => {
    for (const metric of ['net_consumption', 'refund_amount']) {
        const f = fixture(metric === 'refund_amount' ? { metric, subject: { kind: 'event', ref_id: 'refund' }, roster: ['refund'] } : { metric });
        try {
            assert.equal(f.run(), metric === 'refund_amount' ? 23 : 100);
            for (const alias of ['purchase', 'refund']) {
                const traversals = f.observations.filter(e => e[1] === 'traverse' && e[2] === alias && e[4][0] === 'category_id');
                const reads = f.observations.filter(e => e[1] === 'get' && e[2] === alias && e[4][0] === 'category_id');
                assert.ok(traversals.length > 0);
                assert.equal(reads.length, traversals.length, `${metric}/${alias}`);
            }
        } finally { for (const c of f.controls) { c.revoke(); c.assertHealthy(); } }
    }
});

test('N02G:EFFECT-METRIC-004 refund category scalars are causal even without a category population role', () => {
    for (const alias of ['purchase', 'refund']) for (const mutant of [undefined, '', 7, 'unrelated-category']) {
        const f = fixture({ metric: 'refund_amount', subject: { kind: 'event', ref_id: 'refund' }, roster: ['refund'] });
        // Test only the evaluator boundary; the compiler cannot admit these
        // inconsistent handles. Recursion also reaches the compensated event.
        const wrap = node => Object.freeze({ ...node,
            get: field => field === 'category_id' && node.identity('ref_id') === alias ? mutant : node.get(field),
            follow: field => wrap(node.follow(field)) });
        const events = Object.freeze({ select: predicate => f.operands.events.select(node => predicate(wrap(node))) });
        try {
            assert.throws(() => evaluateEffects({ ...f.operands, events }, 'refund_amount'), /^Error: access_set_predicate_threw$/);
            assert.throws(() => f.controls[0].assertHealthy(), /access_set_failed/);
        } finally { for (const c of f.controls) c.revoke(); }
    }
});

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

test('N02G:EFFECT-METRIC-005 generated refund links preserve guards independently of IDs and amounts', () => {
    const mutations = [
        rows => { delete rows[1].compensates; },
        rows => { rows[1].compensates = rows[1].id; },
        rows => { rows[0].state = 'projected'; },
        rows => { rows[0].person_id = 'another-person'; },
        rows => { rows[0].category_id = 'refund-category'; },
        rows => { rows[1].category_id = 'food'; }
    ];
    let positive = 0; let rejected = 0;
    for (const period of [{ kind: 'month', value: '2042-06' }, { kind: 'date', value: '2042-06-09' }]) for (let seed = 0; seed < 12; seed++) {
        const amount = 1 + seed * 17;
        const options = { metric: 'refund_amount', subject: { kind: 'event', ref_id: 'refund' },
            roster: seed % 2 ? ['other', 'refund'] : ['refund', 'other'], namespace: `case-${period.kind}-${seed}`, period };
        const prepare = rows => {
            rows[0].amount_minor = -(amount + 123);
            rows[0].date = seed % 2 ? '2041-01-02' : '2043-10-11';
            rows[1].amount_minor = amount;
            // A valid, non-selected compensation tests enumeration order and
            // that the linked purchase need not itself be a financial operand.
            rows[2].category_id = 'refund-category'; rows[2].amount_minor = amount + 999;
            rows[2].compensates = 'purchase';
        };
        const good = fixture({ ...options, mutate: prepare });
        try {
            assert.equal(good.run(), amount); positive++;
            assert.ok(good.observations.some(e => e[1] === 'traverse' && e[4][0] === 'compensates'));
            for (const control of good.controls) control.assertHealthy();
        } finally { for (const control of good.controls) control.revoke(); }
        for (const mutate of mutations) {
            const bad = fixture({ ...options, mutate: rows => { prepare(rows); mutate(rows); } });
            try {
                assert.throws(() => bad.run(), /^Error: access_set_predicate_threw$/); rejected++;
                assert.throws(() => bad.controls[0].assertHealthy(), /access_set_failed/);
            } finally { for (const control of bad.controls) control.revoke(); }
        }
    }
    assert.equal(positive, 24); assert.equal(rejected, 144);
    // Characterization of existing guards, not a RED for proposed normative
    // coverage and not proof of graph acceptance or same-execution binding.
});

test('N02G:EFFECT-METRIC-006 refund references observe the scalar, traversal and resolved ID', () => {
    const f = fixture({ metric: 'refund_amount', subject: { kind: 'event', ref_id: 'refund' }, roster: ['refund'] });
    try {
        assert.equal(f.run(), 23);
        for (const [field, target] of [['person_id', 'p'], ['compensates', 'purchase']]) {
            const get = f.observations.findIndex(e => e[1] === 'get' && e[2] === 'refund' && e[4][0] === field);
            const traversal = f.observations.findIndex(e => e[1] === 'traverse' && e[2] === 'refund' && e[4][0] === field);
            assert.ok(get >= 0 && traversal > get, field);
            assert.ok(f.observations.slice(traversal + 1).some(e => e[1] === 'get' && e[2] === target && e[4][0] === 'id'), target);
        }
        for (const c of f.controls) c.assertHealthy();
    } finally { for (const c of f.controls) c.revoke(); }
});

test('N02G:EFFECT-METRIC-007 refund reference scalars cannot disagree with resolved handles', () => {
    for (const field of ['person_id', 'compensates']) {
        const f = fixture({ metric: 'refund_amount', subject: { kind: 'event', ref_id: 'refund' }, roster: ['refund'] });
        // Evaluator-boundary doubles only. For person_id both compared scalars
        // are spoofed alike: equality alone must not replace reference identity.
        const wrap = node => Object.freeze({ ...node,
            get: key => key === field ? 'different-id' : node.get(key),
            follow: key => wrap(node.follow(key)) });
        const events = Object.freeze({ select: predicate => f.operands.events.select(node => predicate(wrap(node))) });
        try {
            assert.throws(() => evaluateEffects({ ...f.operands, events }, 'refund_amount'), /^Error: access_set_predicate_threw$/);
        } finally { for (const c of f.controls) c.revoke(); }
    }
});
