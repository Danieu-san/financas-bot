'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createInstrumentedAccess } = require('../../../src/next/provenance/instrumentedAccess');
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
