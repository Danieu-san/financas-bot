'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createInstrumentedAccess, createNodeSetAccess } = require('../../../src/next/provenance/instrumentedAccess');
const { digest } = require('../../../src/next/kernel/canonicalValue');
const { readObservedIdentity, measureMaterialFingerprint, evaluateObservedOperator } = require('../../../src/next/provenance/proofOperators');
const operators = require('../../../docs/contracts/next/provenance-v2/operator-registry-v2.json').operators;

const identity = { kind: 'event', ref_id: 'event-a', version: `sha256:${'a'.repeat(64)}` };
const descriptor = { registry_version: 1, kind: 'event', fields: {
    id: { class: 'identity', type: 'id', required: true },
    amount: { class: 'dimension', type: 'money_minor', required: true },
    active: { class: 'dimension', type: 'boolean', required: true },
    refs: { class: 'edge', type: 'ref_list', required: true, targets: ['event'] },
    optional: { class: 'dimension', type: 'text', required: false },
    label: { class: 'non_material', type: 'text', required: false, reason: 'display_only' }
} };
function fixture(payload = { id: 'event-a', amount: 0, active: false, refs: [], label: 'display' }, emit = () => {}) {
    return createInstrumentedAccess({ emit, bindings: [{ alias: 'a', role: 'events', identity, value: payload,
        shape: { type: 'record', fields: Object.fromEntries(Object.entries(descriptor.fields).map(([k, d]) =>
            [k, d.class === 'non_material' ? { type: 'non_material' } : d.type === 'ref_list'
                ? { type: 'sequence', item: { type: 'scalar' } } : { type: 'scalar' }])) } }] });
}
test('N02G:PROOF-001 fingerprint measures material presence, falsy values and structure through handles', () => {
    const events = []; const access = fixture(undefined, e => events.push(e));
    const handle = access.handle('a');
    assert.deepEqual(readObservedIdentity(handle), identity);
    const measured = measureMaterialFingerprint(handle, descriptor);
    assert.equal(measured, `sha256:${digest({ registry_version: 1, ...identity,
        payload: { id: 'event-a', amount: 0, active: false, refs: [] } })}`);
    assert.ok(events.some(e => e[1] === 'has' && e[4][0] === 'optional' && e[6][1] === false));
    assert.ok(events.some(e => e[1] === 'length' && e[4][0] === 'refs'));
    assert.ok(events.some(e => e[1] === 'get' && e[4][0] === 'amount' && e[6][1] === 0));
    assert.ok(!events.some(e => e[4].includes('label')));
    assert.ok(!events.some(e => e[4].includes('semantic_fingerprint')));
});
test('N02G:PROOF-002 fingerprint cannot omit a present field or read a non-material field', () => {
    const missing = structuredClone(descriptor); delete missing.fields.amount;
    assert.throws(() => measureMaterialFingerprint(fixture().handle('a'), missing), /proof_material/);
    const relabelled = structuredClone(descriptor); relabelled.fields.amount.class = 'non_material';
    assert.throws(() => measureMaterialFingerprint(fixture().handle('a'), relabelled), /proof_material/);
    const exposed = structuredClone(descriptor); exposed.fields.label.class = 'dimension';
    assert.throws(() => measureMaterialFingerprint(fixture().handle('a'), exposed), /access_/);
    const wrong = structuredClone(descriptor); wrong.kind = 'card';
    assert.throws(() => measureMaterialFingerprint(fixture().handle('a'), wrong), /proof_material/);
});
test('N02G:PROOF-003 measurement distinguishes absence, empty and ref order but ignores display data', () => {
    const payload = { id: 'event-a', amount: 0, active: false, refs: ['a', 'b'], label: 'display' };
    const measure = value => measureMaterialFingerprint(fixture(value).handle('a'), descriptor);
    const original = measure(payload);
    assert.equal(original, measure({ ...payload, label: 'different' }));
    assert.notEqual(original, measure({ ...payload, optional: '' }));
    assert.notEqual(original, measure({ ...payload, refs: ['b', 'a'] }));
    assert.notEqual(original, measure({ ...payload, active: true }));
    assert.notEqual(original, measure({ ...payload, amount: 1 }));
    const noRequired = { ...payload }; delete noRequired.active;
    assert.throws(() => measure(noRequired), /proof_material/);
});
test('N02G:PROOF-004 revoked handle, sink failure and descriptor accessors never return a digest', () => {
    const access = fixture(); const handle = access.handle('a'); access.revoke();
    assert.throws(() => measureMaterialFingerprint(handle, descriptor), /access_revoked/);
    assert.throws(() => measureMaterialFingerprint(fixture(undefined, () => { throw new Error('sink'); }).handle('a'), descriptor), /access_sink_failed/);
    let invoked = 0; const bad = structuredClone(descriptor);
    Object.defineProperty(bad, 'kind', { get() { invoked++; return 'event'; }, enumerable: true });
    assert.throws(() => measureMaterialFingerprint(fixture().handle('a'), bad));
    assert.equal(invoked, 0);
});

test('N02G:PROOF-005 typed expressions read handles before scalar and fingerprint comparison', () => {
    const events = []; const access = fixture(undefined, e => events.push(e));
    const scope = { node: alias => access.handle(alias), material: () => descriptor };
    const run = (id, operands) => evaluateObservedOperator(operators.find(op => op.id === id), operands, scope);
    const amount = { type: { form: 'scalar', type: 'money_minor', unit: 'BRL_minor' },
        expression: { kind: 'field_ref', alias: 'a', segments: ['amount'] } };
    const zero = { type: amount.type, expression: { kind: 'literal', value_type: 'money_minor', value: 0 } };
    assert.equal(run('eq', [amount, zero]), true);
    assert.ok(events.some(e => e[1] === 'get' && e[4][0] === 'amount'));
    const node = { type: { form: 'node', kind: 'event' }, expression: { kind: 'node_ref', alias: 'a' } };
    const expected = `sha256:${digest({ registry_version: 1, ...identity, payload: { id: 'event-a', amount: 0, active: false, refs: [] } })}`;
    assert.equal(run('fingerprint_is', [node, { type: { form: 'digest_literal' },
        expression: { kind: 'literal', value_type: 'digest', value: expected } }]), true);
    assert.equal(run('fingerprint_is', [node, { type: { form: 'digest_literal' },
        expression: { kind: 'literal', value_type: 'digest', value: `sha256:${'0'.repeat(64)}` } }]), false);
    access.revoke(); assert.throws(() => run('eq', [amount, zero]), /access_revoked/);
});

test('N02G:PROOF-006 expressions cannot smuggle raw snapshots, override node kinds or operator contracts', () => {
    const access = fixture(); const scope = { node: alias => access.handle(alias), material: () => descriptor };
    const op = operators.find(op => op.id === 'kind_is');
    const literal = { type: { form: 'kind_literal' }, expression: { kind: 'literal', value_type: 'kind', value: 'event' } };
    assert.throws(() => evaluateObservedOperator(op, [{ type: { form: 'node', kind: 'event' },
        expression: { kind: 'node_ref', alias: 'a', value: identity } }, literal], scope), /proof_expression/);
    assert.throws(() => evaluateObservedOperator(op, [{ type: { form: 'node', kind: 'card' },
        expression: { kind: 'node_ref', alias: 'a' } }, literal], scope), /scalar_proof_node/);
    assert.throws(() => evaluateObservedOperator({ ...operators.find(op => op.id === 'fingerprint_is'), semantics: 'declared' }, [], scope), /proof_operator/);
});

function quantifiedFixture(values) {
    const events = [];
    const control = createNodeSetAccess({ role: 'proof/events', emit: e => events.push(e), bindings: values.map((amount, i) => ({
        alias: `event_${i}`, role: 'proof/events', identity: { ...identity, ref_id: `event-${i}` },
        value: { id: `event-${i}`, amount }, shape: { type: 'record', fields: { id: { type: 'scalar' }, amount: { type: 'scalar' } } }
    })) });
    const scope = { set: () => control.handle, operator: id => operators.find(o => o.id === id),
        fieldDescriptor: () => ({ class: 'dimension', type: 'money_minor', required: true }) };
    const operands = [{ type: { form: 'set', item: { form: 'node', kind: 'event' } }, expression: { kind: 'set_ref', name: 'events' } },
        { type: { form: 'predicate_template_ref', kind: 'event' }, expression: { kind: 'predicate_template',
            template_ref: { id: 'field_equals_scalar', version: 1, hash: `sha256:${'a'.repeat(64)}` }, combinator: 'all', member_slot: 'current_member', bindings: {},
            body: [{ op: 'eq', operands: [{ kind: 'member_field', slot: 'current_member', node_kind: 'event', segments: ['amount'] },
                { kind: 'literal', value_type: 'money_minor', value: 10 }] }] } }];
    return { events, control, scope, operands };
}
test('N02G:PROOF-007 quantifiers never short-circuit later observed members or infer coverage', () => {
    for (const [op, values, expected] of [['all_match', [0, 10, 10], false], ['none_match', [10, 0, 0], false],
        ['all_match', [10, 10], true], ['none_match', [0, 0], true], ['all_match', [], true], ['none_match', [], true]]) {
        const f = quantifiedFixture(values);
        assert.equal(evaluateObservedOperator(operators.find(o => o.id === op), f.operands, f.scope), expected);
        assert.equal(f.events.filter(e => e[1] === 'get' && e[4][0] === 'amount').length, values.length);
        assert.ok(f.events.some(e => e[1] === 'length'));
    }
});
test('N02G:PROOF-008 invalid template on empty set is rejected, never vacuously approved', () => {
    const f = quantifiedFixture([]);
    f.operands[1].expression.body[0].op = 'fingerprint_is';
    assert.throws(() => evaluateObservedOperator(operators.find(o => o.id === 'all_match'), f.operands, f.scope), /proof_expression_template_operator/);
    const other = quantifiedFixture([10, 10]); other.control.revoke();
    assert.throws(() => evaluateObservedOperator(operators.find(o => o.id === 'all_match'), other.operands, other.scope), /access_/);
});

const moneyType = { form: 'scalar', type: 'money_minor', unit: 'BRL_minor' };
const setOperand = (name, form = 'set') => ({ type: { form, item: { form: 'node', kind: 'event' } }, expression: { kind: 'set_ref', name } });
const selectorOperand = () => ({ type: { form: 'field_selector', kind: 'event', value: moneyType },
    expression: { kind: 'field_selector', node_kind: 'event', segments: ['amount'] } });
test('N02G:PROOF-009 same_field requires a nonempty set and reads every member', () => {
    for (const [values, expected] of [[[10, 10], true], [[0, 10, 10], false], [[], false]]) {
        const f = quantifiedFixture(values);
        assert.equal(evaluateObservedOperator(operators.find(o => o.id === 'same_field'), [setOperand('events'), selectorOperand()], f.scope), expected);
        assert.equal(f.events.filter(e => e[1] === 'get' && e[4][0] === 'amount').length, values.length);
    }
});
test('N02G:PROOF-010 join_eq requires two unique equal key domains without deduplication', () => {
    for (const [left, right, expected] of [[[1, 2], [2, 1], true], [[1, 2], [1, 3], false], [[], [], true]]) {
        const a = quantifiedFixture(left); const b = quantifiedFixture(right);
        const scope = { ...a.scope, set: name => name === 'a' ? a.control.handle : b.control.handle };
        assert.equal(evaluateObservedOperator(operators.find(o => o.id === 'join_eq'),
            [setOperand('a'), setOperand('b'), selectorOperand(), selectorOperand()], scope), expected);
    }
    const a = quantifiedFixture([1, 1]); const b = quantifiedFixture([1]);
    assert.throws(() => evaluateObservedOperator(operators.find(o => o.id === 'join_eq'),
        [setOperand('a'), setOperand('b'), selectorOperand(), selectorOperand()],
        { ...a.scope, set: name => name === 'a' ? a.control.handle : b.control.handle }), /proof_expression_join_duplicate/);
});
test('N02G:PROOF-011 ordered_by uses explicit direction and full identity tie-breaking', () => {
    const order = direction => ({ type: { form: 'sort', kind: 'event' }, expression: { kind: 'sort', tie_break: 'kind_ref_version',
        keys: [{ selector: selectorOperand().expression, direction }] } });
    for (const [values, direction, expected] of [[[1, 2, 3], 'asc', true], [[3, 2, 1], 'desc', true], [[1, 3, 2], 'asc', false], [[1, 1], 'asc', true]]) {
        const f = quantifiedFixture(values);
        assert.equal(evaluateObservedOperator(operators.find(o => o.id === 'ordered_by'), [setOperand('events', 'sequence'), order(direction)], f.scope), expected);
        assert.equal(f.events.filter(e => e[1] === 'get' && e[4][0] === 'amount').length, values.length);
    }
    const f = quantifiedFixture([]); const invalid = order('asc'); invalid.expression.tie_break = 'implicit';
    assert.throws(() => evaluateObservedOperator(operators.find(o => o.id === 'ordered_by'), [setOperand('events', 'sequence'), invalid], f.scope), /proof_expression_sort/);
});
