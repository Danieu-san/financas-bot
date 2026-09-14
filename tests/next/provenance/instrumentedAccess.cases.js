'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createInstrumentedAccess, createNodeSetAccess } = require('../../../src/next/provenance/instrumentedAccess');

function fixture(emit = () => {}) {
    return { emit, bindings: [{ alias: 'event_a', role: 'events',
        value: { amount: 700, tags: ['food', 'home'], period: { month: '2042-06' }, label: 'display only' },
        shape: { type: 'record', fields: { amount: { type: 'scalar' }, tags: { type: 'sequence', item: { type: 'scalar' } },
            period: { type: 'record', fields: { month: { type: 'scalar' } } },
            optional: { type: 'scalar' }, label: { type: 'non_material' } } }
    }] };
}

test('N02G:ACCESS-013 heterogeneous and empty operand sets expose only observed handles', () => {
    const events = []; const options = fixture(e => events.push(e));
    options.role = 'events';
    options.bindings.unshift({ alias: 'event_b', role: 'events', value: { enabled: true },
        shape: { type: 'record', fields: { enabled: { type: 'scalar' } } } });
    const access = createNodeSetAccess(options);
    options.bindings.reverse(); options.bindings[0].value.amount = 99;
    assert.equal(Array.isArray(access.handle), false);
    assert.equal(Object.getPrototypeOf(access.handle), null);
    assert.equal(access.handle.at.constructor, undefined);
    assert.equal(access.handle.length(), 2);
    assert.equal(access.handle.at(0).get('enabled'), true);
    assert.equal(access.handle.at(1).get('amount'), 700);
    assert.equal(access.handle.at(2), undefined);
    assert.equal(access.handle.includes('event_a'), true);
    assert.equal(access.handle.includes('missing'), false);
    assert.ok(events.some(e => e[5] === 'operand_set' && e[6][0] === 'node' && e[6][1] === 'event_b'));
    assert.ok(events.some(e => e[5] === 'data' && e[2] === 'event_a'));
    const empty = createNodeSetAccess({ role: 'events', bindings: [], emit: e => events.push(e) });
    assert.equal(empty.handle.length(), 0);
    assert.equal(empty.handle.at(0), undefined);
    assert.deepEqual([...empty.handle], []);
    assert.equal(empty.handle.includes('event_a'), false);
    const { decodeObservation } = require('../../../src/next/provenance/observationContract');
    for (const event of events) assert.deepEqual(decodeObservation(event), event);
});

test('N02G:ACCESS-014 collection lifetime covers retained member handles and caught failures', () => {
    for (const action of [a => a.revoke(), a => assert.throws(() => a.handle.at(-1), /access_set_/),
        a => assert.throws(() => a.handle.at(-0), /access_set_/),
        a => assert.throws(() => a.handle.includes({}), /access_set_/)]) {
        const access = createNodeSetAccess({ ...fixture(), role: 'events' });
        const retained = access.handle.at(0); const iterator = access.handle[Symbol.iterator]();
        action(access);
        assert.throws(() => retained.get('amount'), /access_/);
        assert.throws(() => iterator.next(), /access_/);
        assert.throws(() => access.assertHealthy(), /access_/);
    }
    const access = createNodeSetAccess({ ...fixture(), role: 'events' });
    assert.throws(() => access.handle.at(0).get('label'), /access_field_forbidden/);
    assert.throws(() => access.handle.length(), /access_/);
    assert.throws(() => access.assertHealthy(), /access_/);
});

test('N02G:ACCESS-015 set iterator termination and sink rejection are externally observed', () => {
    const { createCausalRecorder } = require('../../../src/next/provenance/causalRecorder');
    const recorder = createCausalRecorder({ executionId: 'sets', maxEvents: 20 });
    const scope = recorder.open({ invocationId: 'one', phase: 'derivation' });
    const access = createNodeSetAccess({ ...fixture(scope.observe), role: 'events' });
    for (const node of access.handle) { assert.equal(node.get('amount'), 700); break; }
    const iterator = access.handle[Symbol.iterator]();
    assert.equal(iterator[Symbol.iterator](), iterator);
    iterator.return(); assert.equal(iterator.next().done, true);
    access.revoke(); access.assertHealthy(); scope.seal();
    const trace = recorder.finish().derivation_trace;
    assert.equal(trace.filter(e => e.operation === 'return').length, 2);
    assert.equal(trace.filter(e => e.operation === 'reuse_iterator').length, 1);
    assert.ok(trace.some(e => e.projection === 'operand_set' && e.outcome[0] === 'node'));
    const failed = createNodeSetAccess({ ...fixture(() => { throw new Error('closed sink'); }), role: 'events' });
    assert.throws(() => failed.handle.length(), /access_set_sink/);
    assert.throws(() => failed.assertHealthy(), /access_set_/);
});

test('N02G:ACCESS-016 set role, binding and observation namespaces fail closed', () => {
    const mixed = { ...fixture(), role: 'other' };
    assert.throws(() => createNodeSetAccess(mixed), /access_shape_invalid/);
    const duplicate = { ...fixture(), role: 'events' }; duplicate.bindings.push(duplicate.bindings[0]);
    assert.throws(() => createNodeSetAccess(duplicate), /access_shape_invalid/);
    let invoked = 0;
    assert.throws(() => createNodeSetAccess({ ...fixture(), get role() { invoked++; return 'events'; } }), /access_shape_invalid/);
    assert.equal(invoked, 0);
    const { decodeObservation } = require('../../../src/next/provenance/observationContract');
    for (const event of [
        ['I', 'at', 'event_a', 'events', [0], 'data', ['node', 'event_a']],
        ['I', 'get', 'operand/events', 'events', ['id'], 'operand_set', ['scalar', 'a']],
        ['I', 'at', 'operand/events', 'events', [0], 'operand_set', ['scalar', 'a']],
        ['I', 'next', 'operand/events', 'events', [0], 'operand_set', ['node', {}]],
        ['I', 'length', 'event_a', 'events', [], 'operand_set', ['count', 1]]
    ]) assert.throws(() => decodeObservation(event));
});
test('N02G:ACCESS-001 nested evidence crosses only as handles and scalar observations', () => {
    const events = []; const access = createInstrumentedAccess(fixture(e => events.push(e)));
    const root = access.handle('event_a');
    assert.equal(Object.getPrototypeOf(root), null);
    assert.ok(Object.isFrozen(root));
    assert.equal(Object.getPrototypeOf(root.get), null);
    assert.equal(root.get.constructor, undefined);
    assert.equal(root.amount, undefined);
    assert.equal(root.get('amount'), 700);
    const period = root.get('period');
    assert.equal(Object.getPrototypeOf(period), null);
    assert.equal(period.month, undefined);
    assert.equal(period.get('month'), '2042-06');
    assert.deepEqual(events.map(e => e[1]), ['get', 'get', 'get']);
    assert.deepEqual(events[2].slice(2, 6), ['event_a', 'events', ['period', 'month'], 'data']);
    assert.ok(events.every(e => Object.isFrozen(e) && e[0] === 'I'));
    access.assertHealthy();
});
test('N02G:ACCESS-002 structural reads and early iterator termination are observed', () => {
    const events = []; const access = createInstrumentedAccess(fixture(e => events.push(e)));
    const root = access.handle('event_a');
    assert.equal(root.has('optional'), false);
    assert.equal(root.get('optional'), undefined);
    const keys = root.keys();
    assert.equal(Array.isArray(keys), false);
    assert.equal(keys.length(), 3);
    assert.equal(keys.at(0), 'amount');
    const tags = root.get('tags');
    assert.equal(tags.length(), 2);
    assert.equal(tags.includes('food'), true);
    assert.equal(tags.includes('other'), false);
    for (const tag of tags) { assert.equal(tag, 'food'); break; }
    assert.ok(events.some(e => e[1] === 'keys' && JSON.stringify(e[6]) === '["keys","amount","tags","period"]'));
    assert.ok(events.some(e => e[1] === 'return'));
    assert.equal(events.filter(e => e[1] === 'next').length, 1);
    assert.ok(!JSON.stringify(events).includes('display only'));
});
test('N02G:ACCESS-003 non_material and undeclared fields poison the invocation even when caught', () => {
    for (const action of [h => h.get('label'), h => h.has('label'), h => h.get('missing'), h => h.has('constructor')]) {
        const events = []; const access = createInstrumentedAccess(fixture(e => events.push(e)));
        assert.throws(() => action(access.handle('event_a')), /access_field_forbidden/);
        assert.throws(() => access.assertHealthy(), /access_failed/);
        assert.throws(() => access.handle('event_a').get('amount'), /access_failed/);
        assert.equal(events.length, 0);
    }
});
test('N02G:ACCESS-004 revocation reaches previously issued handles and iterators', () => {
    const access = createInstrumentedAccess(fixture()); const root = access.handle('event_a');
    const tags = root.get('tags'); const iterator = tags[Symbol.iterator]();
    access.revoke(); access.revoke(); access.assertHealthy();
    assert.throws(() => iterator.next(), /access_revoked/);
    assert.throws(() => tags.at(0), /access_failed/);
    assert.throws(() => root.get('amount'), /access_failed/);
    assert.throws(() => access.assertHealthy(), /access_failed/);
});
test('N02G:ACCESS-005 empty collections, exhaustion and absent indexes remain causal', () => {
    const events = []; const f = fixture(e => events.push(e)); f.bindings[0].value.tags = [];
    const a = createInstrumentedAccess(f); const tags = a.handle('event_a').get('tags');
    assert.equal(tags.length(), 0); assert.equal(tags.at(0), undefined);
    assert.deepEqual([...tags], []);
    assert.ok(events.some(e => e[1] === 'next' && e[6][0] === 'done'));
    assert.ok(events.some(e => e[1] === 'at' && e[6][0] === 'absent'));
});
test('N02G:ACCESS-006 source mutation and independently created access scopes cannot interfere', () => {
    const f = fixture(); const a = createInstrumentedAccess(f); const b = createInstrumentedAccess(fixture());
    f.bindings[0].value.amount = 1; f.bindings[0].shape.fields.label.type = 'scalar';
    assert.equal(a.handle('event_a').get('amount'), 700);
    a.revoke(); assert.equal(b.handle('event_a').get('amount'), 700);
});
test('N02G:ACCESS-007 malformed data is rejected without running getters or proxy traps', () => {
    let calls = 0;
    for (const change of [
        f => Object.defineProperty(f.bindings[0].value, 'amount', { enumerable: true, get() { calls++; return 1; } }),
        f => { f.bindings[0].value = new Proxy({}, { ownKeys() { calls++; throw Error('trap'); } }); },
        f => { f.bindings[0].value.tags = new Array(2); },
        f => { f.bindings[0].value.extra = 1; },
        f => { f.bindings[0].value.period = new Date(); },
        f => { f.bindings[0].shape.fields.tags.item.type = 'unknown'; }
    ]) { const f = fixture(); change(f); assert.throws(() => createInstrumentedAccess(f), /access_|observation_/); }
    assert.equal(calls, 0);
});
test('N02G:ACCESS-008 failed sink and invalid operations cannot return evidence', () => {
    const a = createInstrumentedAccess(fixture(() => { throw Error('sink failed'); }));
    assert.throws(() => a.handle('event_a').get('amount'), /access_sink_failed/);
    assert.throws(() => a.assertHealthy(), /access_failed/);
    for (const action of [h => h.at(-1), h => h.length(), h => h.get({}), h => h.get('tags').includes({})]) {
        const b = createInstrumentedAccess(fixture()); assert.throws(() => action(b.handle('event_a')), /access_/);
        assert.throws(() => b.assertHealthy(), /access_failed/);
    }
});
test('N02G:ACCESS-009 revocation during the sink callback prevents delivery of the value', () => {
    let access;
    access = createInstrumentedAccess(fixture(() => access.revoke()));
    assert.throws(() => access.handle('event_a').get('amount'), /access_revoked/);
    assert.throws(() => access.assertHealthy(), /access_failed/);
});
test('N02G:ACCESS-010 key views cannot create ambiguous repeated projections', () => {
    const access = createInstrumentedAccess(fixture());
    const keys = access.handle('event_a').keys();
    assert.throws(() => keys.keys(), /access_projection_invalid/);
    assert.throws(() => access.assertHealthy(), /access_failed/);
});
test('N02G:ACCESS-011 reacquiring an existing iterator observes its actual cursor', () => {
    const events = []; const access = createInstrumentedAccess(fixture(e => events.push(e)));
    const iterator = access.handle('event_a').get('tags')[Symbol.iterator](); iterator.next();
    assert.equal(iterator[Symbol.iterator](), iterator);
    assert.deepEqual(events.at(-1).slice(1, 2), ['reuse_iterator']);
    assert.deepEqual(events.at(-1)[6], ['cursor', 1, false]);
    iterator.return(); iterator[Symbol.iterator]();
    assert.deepEqual(events.at(-1)[6], ['cursor', 1, true]);
});
test('N02G:ACCESS-012 noncanonical numeric indexes fail persistently before emission', () => {
    const events = []; const access = createInstrumentedAccess(fixture(e => events.push(e)));
    const tags = access.handle('event_a').get('tags');
    assert.throws(() => tags.at(-0), /access_index_invalid/);
    assert.throws(() => access.assertHealthy(), /access_failed/);
    assert.equal(events.length, 1);
});
