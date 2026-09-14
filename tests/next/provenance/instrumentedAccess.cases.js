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

function selectionFixture(emit = () => {}) {
    return { role: 'events', emit, bindings: [8, 3, 5].map((amount, i) => ({
        alias: `event_${i}`, role: 'events', value: { amount },
        shape: { type: 'record', fields: { amount: { type: 'scalar' } } }
    })) };
}

function traversalFixture(emit = () => {}) {
    return { emit, bindings: [
        { alias: 'a', role: 'source', value: { id: 'a-id', owner: 'b-id', members: ['b-id'] }, shape: { type: 'record', fields: {
            id: { type: 'scalar' }, owner: { type: 'scalar' }, members: { type: 'sequence', item: { type: 'scalar' } }
        } } },
        { alias: 'b', role: 'source', value: { id: 'b-id', amount: 14 }, shape: { type: 'record', fields: {
            id: { type: 'scalar' }, amount: { type: 'scalar' }
        } } }
    ], links: [
        { id: 'owner_link', source: 'a', field: 'owner', target: 'b', type: 'ref' },
        { id: 'members_link', source: 'a', field: 'members', target: 'b', type: 'ref_list' }
    ] };
}

test('N02G:ACCESS-023 traversal observes source reference and target identity before returning a handle', () => {
    const events = []; const access = createInstrumentedAccess(traversalFixture(e => events.push(e)));
    const source = access.handle('a');
    const target = source.traverse('owner_link');
    assert.equal(target.amount, undefined); assert.equal(Object.getPrototypeOf(target), null);
    assert.equal(target.get('amount'), 14);
    assert.deepEqual(events.slice(0, 3).map(e => [e[1], e[2], e[4], e[6]]), [
        ['get', 'a', ['owner'], ['scalar', 'b-id']], ['get', 'b', ['id'], ['scalar', 'b-id']],
        ['traverse', 'a', ['owner'], ['edge', 'owner_link', 'b']]
    ]);
    assert.equal(source.traverse('members_link').get('amount'), 14);
    assert.ok(events.some(e => e[1] === 'next' && e[2] === 'a' && e[4][0] === 'members'));
    const { decodeObservation } = require('../../../src/next/provenance/observationContract');
    for (const event of events) assert.deepEqual(decodeObservation(event), event);
    access.revoke();
    assert.throws(() => target.get('amount'), /access_revoked/);
    assert.throws(() => access.assertHealthy(), /access_failed/);
});

test('N02G:ACCESS-024 missing actual relation, foreign edge and invalid reference type poison traversal', () => {
    for (const change of [f => { f.bindings[0].value.owner = 'wrong'; },
        f => { f.bindings[1].value.id = 'wrong'; }, f => { delete f.bindings[0].value.owner; }]) {
        const events = []; const f = traversalFixture(e => events.push(e)); change(f);
        const access = createInstrumentedAccess(f);
        assert.throws(() => access.handle('a').traverse('owner_link'), /access_traversal/);
        assert.equal(events.filter(e => e[1] === 'traverse').length, 0);
        assert.throws(() => access.handle('b'), /access_failed/);
    }
    for (const [alias, edge] of [['b', 'owner_link'], ['a', 'missing'], ['a', {}]]) {
        const access = createInstrumentedAccess(traversalFixture());
        assert.throws(() => access.handle(alias).traverse(edge), /access_traversal/);
        assert.throws(() => access.assertHealthy(), /access_failed/);
    }
    for (const change of [f => { f.links[0].field = 'missing'; }, f => { f.links[0].target = 'missing'; },
        f => { f.links[0].type = 'unknown'; }, f => { f.links.push(f.links[0]); },
        f => { f.bindings[1].role = 'foreign'; }]) {
        const f = traversalFixture(); change(f); assert.throws(() => createInstrumentedAccess(f), /access_shape_invalid/);
    }
});

test('N02G:ACCESS-025 traversal cannot run from nested handles or survive observation rejection', () => {
    const access = createInstrumentedAccess(traversalFixture());
    const nested = access.handle('a').get('members');
    assert.throws(() => nested.traverse('members_link'), /access_traversal/);
    assert.throws(() => access.assertHealthy(), /access_failed/);
    const failed = createInstrumentedAccess(traversalFixture(e => { if (e[1] === 'traverse') throw new Error('quota'); }));
    assert.throws(() => failed.handle('a').traverse('owner_link'), /access_sink_failed/);
    assert.throws(() => failed.assertHealthy(), /access_failed/);
    const { decodeObservation } = require('../../../src/next/provenance/observationContract');
    for (const e of [
        ['I', 'traverse', 'a', 'source', ['owner'], 'keys', ['edge', 'owner_link', 'b']],
        ['I', 'traverse', 'a', 'source', [], 'data', ['edge', 'owner_link', 'b']],
        ['I', 'traverse', 'a', 'source', ['owner'], 'data', ['edge', 'owner_link', {}]]
    ]) assert.throws(() => decodeObservation(e));
});

test('N02G:ACCESS-026 structured parent references are observed without treating the link as evidence', () => {
    const events = []; const f = traversalFixture(e => events.push(e));
    f.bindings[0].value.parents = [{ role_id: 'left', parent_ref: 'b-id' }];
    f.bindings[0].shape.fields.parents = { type: 'sequence', item: { type: 'record', fields: {
        role_id: { type: 'scalar' }, parent_ref: { type: 'scalar' }
    } } };
    f.links.push({ id: 'parent_link', source: 'a', field: 'parents', target: 'b', type: 'role_ref_list' });
    const access = createInstrumentedAccess(f);
    assert.equal(access.handle('a').traverse('parent_link').get('amount'), 14);
    assert.ok(events.some(e => e[1] === 'get' && e[2] === 'a' && JSON.stringify(e[4]) === JSON.stringify(['parents', 0, 'parent_ref'])));
    f.bindings[0].value.parents[0].parent_ref = 'missing';
    const invalid = createInstrumentedAccess(f);
    assert.throws(() => invalid.handle('a').traverse('parent_link'), /access_traversal_mismatch/);
    assert.throws(() => invalid.assertHealthy(), /access_failed/);
});

test('N02G:ACCESS-017 selection computes every decision and keeps immutable ordered views', () => {
    const events = []; const access = createNodeSetAccess(selectionFixture(e => events.push(e)));
    const seen = [];
    const selected = access.handle.select((node, index) => { seen.push(index); return node.get('amount') >= 5; });
    assert.deepEqual(seen, [0, 1, 2]);
    assert.equal(Object.getPrototypeOf(selected), null);
    assert.equal(selected.select.constructor, undefined);
    assert.equal(selected.length(), 2);
    assert.deepEqual([...selected].map(node => node.get('amount')), [8, 5]);
    assert.equal(access.handle.length(), 3);
    const narrower = selected.select(node => node.get('amount') < 8);
    assert.deepEqual([...narrower].map(node => node.get('amount')), [5]);
    assert.deepEqual([...access.handle.select(() => false)], []);
    const noMembers = createNodeSetAccess({ role: 'events', bindings: [], emit: e => events.push(e) });
    let emptyCalls = 0;
    assert.equal(noMembers.handle.select(() => { emptyCalls++; return true; }).length(), 0);
    assert.equal(emptyCalls, 0);
    const decisions = events.filter(e => e[1] === 'select_member').map(e => e[6]);
    assert.deepEqual(decisions.slice(0, 3), [['decision', 'event_0', true], ['decision', 'event_1', false], ['decision', 'event_2', true]]);
    const completed = events.filter(e => e[1] === 'select_return');
    assert.deepEqual(completed[0][6].slice(2), ['event_0', 'event_2']);
    assert.match(completed[0][6][1], /^view_[a-f0-9]{64}$/);
    assert.equal(completed[1][5], 'operand_selection');
    assert.deepEqual(completed[1][4], [completed[0][6][1]]);
    const { decodeObservation } = require('../../../src/next/provenance/observationContract');
    for (const event of events) assert.deepEqual(decodeObservation(event), event);
});

test('N02G:ACCESS-018 invalid selection outputs never coerce and poison all retained capabilities', () => {
    let getters = 0;
    const coercible = { get then() { getters++; return () => {}; }, valueOf() { getters++; return true; } };
    for (const value of [undefined, null, 1, 'true', [], coercible, Promise.resolve(true)]) {
        const events = []; const access = createNodeSetAccess(selectionFixture(e => events.push(e)));
        const retained = access.handle.at(0);
        assert.throws(() => access.handle.select(() => value), /access_set_predicate_result/);
        assert.equal(events.filter(e => e[1] === 'select_return').length, 0);
        assert.throws(() => retained.get('amount'), /access_/);
        assert.throws(() => access.assertHealthy(), /access_/);
    }
    assert.equal(getters, 0);
    for (const predicate of [null, {}, [], 'predicate']) {
        const access = createNodeSetAccess(selectionFixture());
        assert.throws(() => access.handle.select(predicate), /access_set_predicate/);
        assert.throws(() => access.assertHealthy(), /access_/);
    }
});

test('N02G:ACCESS-019 caught callback failures, reentry and revocation cannot return a selection', () => {
    for (const behavior of ['throw', 'reentry', 'revoked', 'caught_read']) {
        const events = []; const access = createNodeSetAccess(selectionFixture(e => events.push(e)));
        assert.throws(() => access.handle.select(node => {
            if (behavior === 'throw') throw new Error('guest failed');
            if (behavior === 'reentry') { try { access.handle.select(() => true); } catch {} }
            if (behavior === 'revoked') access.revoke();
            if (behavior === 'caught_read') { try { node.get('label'); } catch {} }
            return true;
        }), /access_/);
        assert.equal(events.filter(e => e[1] === 'select_return').length, 0);
        assert.throws(() => access.assertHealthy(), /access_/);
    }
});

test('N02G:ACCESS-020 repeated equal selections share content identity but retain every execution', () => {
    const events = []; const access = createNodeSetAccess(selectionFixture(e => events.push(e)));
    access.handle.select(n => n.get('amount') > 4);
    access.handle.select(n => n.get('amount') >= 5);
    const completed = events.filter(e => e[1] === 'select_return');
    assert.equal(completed.length, 2);
    assert.deepEqual(completed[0][6], completed[1][6]);
    assert.equal(events.filter(e => e[1] === 'select_member').length, 6);
    const capped = createNodeSetAccess({ role: 'events', bindings: [], emit: () => {} });
    for (let i = 0; i < 512; i++) capped.handle.select(() => false);
    assert.throws(() => capped.handle.select(() => false), /access_set_selection_limit/);
    assert.throws(() => capped.assertHealthy(), /access_/);
});

test('N02G:ACCESS-021 sink failure cancels selection and invalidates already returned views', () => {
    let reject = false; const events = [];
    const access = createNodeSetAccess(selectionFixture(e => {
        if (reject && e[1] === 'select_member') throw new Error('observation quota');
        events.push(e);
    }));
    const first = access.handle.select(() => true); const member = first.at(0);
    reject = true;
    assert.throws(() => access.handle.select(node => node.get('amount') > 4), /access_set_sink/);
    assert.equal(events.filter(e => e[1] === 'select_return').length, 1);
    assert.throws(() => first.length(), /access_/);
    assert.throws(() => member.get('amount'), /access_/);
    assert.throws(() => access.assertHealthy(), /access_/);
});

test('N02G:ACCESS-022 selection tuples reject forged view identities and namespace confusion', () => {
    const { digest } = require('../../../src/next/kernel/canonicalValue');
    const { decodeObservation } = require('../../../src/next/provenance/observationContract');
    const id = `view_${digest({ role: 'events', aliases: ['event_a'] })}`;
    const good = ['I', 'select_return', 'operand/events', 'events', [], 'operand_set', ['selected', id, 'event_a']];
    assert.deepEqual(decodeObservation(good), good);
    for (const change of [e => { e[5] = 'data'; }, e => { e[6][1] = `view_${'0'.repeat(64)}`; },
        e => { e[6].push('event_a'); }, e => { e[3] = 'other'; e[2] = 'operand/other'; },
        e => { e[5] = 'operand_selection'; }, e => { e[4] = [1]; }]) {
        const mutated = structuredClone(good); change(mutated); assert.throws(() => decodeObservation(mutated));
    }
    for (const outcome of [['decision', 'event_a', 'true'], ['decision', {}, true], ['decision', 'event_a', true, false]]) {
        assert.throws(() => decodeObservation(['I', 'select_member', 'operand/events', 'events', [0], 'operand_set', outcome]));
    }
});

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
