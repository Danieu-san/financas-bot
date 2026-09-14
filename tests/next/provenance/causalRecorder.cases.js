'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCausalRecorder } = require('../../../src/next/provenance/causalRecorder');
const { createInstrumentedAccess } = require('../../../src/next/provenance/instrumentedAccess');
const observation = () => ['I', 'get', 'node_a', 'source', ['amount'], 'data', ['scalar', 7]];

test('N02G:RECORDER-001 recorder owns order and phase over one log without R', () => {
    const recorder = createCausalRecorder({ executionId: 'exec-1', maxEvents: 12 });
    const d = recorder.open({ invocationId: 'graph-1', phase: 'derivation' });
    d.observe(observation()); d.observe(observation());
    d.measure(['M', 'evaluator_artifact_root', 'sha256:' + 'a'.repeat(64)]); d.seal();
    const p = recorder.open({ invocationId: 'graph-1', phase: 'proof' }); p.observe(observation()); p.seal();
    const trace = recorder.finish();
    assert.equal(trace.stage, 'observations_only');
    assert.equal(trace.derivation_trace.length, 3); assert.equal(trace.proof_trace.length, 1);
    assert.deepEqual(trace.derivation_trace.map(e => e.sequence), [0, 1, 2]);
    assert.equal(trace.proof_trace[0].sequence, 3);
    assert.equal(trace.proof_trace[0].invocation_id, 'graph-1');
    assert.equal(trace.proof_trace[0].phase, 'proof');
    assert.equal(Object.hasOwn(trace, 'result'), false);
    assert.ok(Object.isFrozen(trace.proof_trace[0].path));
});
test('N02G:RECORDER-002 malformed trace-shaped events and measurement expectations poison the log', () => {
    for (const event of [ { reads: [], phase: 'proof' }, ['I', ...observation().slice(1), 'extra'],
        ['I', 'selected_nodes', 'node_a', 'source', [], 'data', []],
        ['M', 'expected_root', 'sha256:' + 'a'.repeat(64)] ]) {
        const r = createCausalRecorder({ executionId: 'exec-1', maxEvents: 10 });
        const phase = r.open({ invocationId: 'graph-1', phase: 'derivation' });
        assert.throws(() => event[0] === 'M' ? phase.measure(event) : phase.observe(event), /recorder_/);
        assert.throws(() => r.finish(), /recorder_failed/);
    }
});
test('N02G:RECORDER-003 scopes cannot overlap, repeat or write after seal', () => {
    for (const action of [
        (r, s) => r.open({ invocationId: 'graph-2', phase: 'proof' }),
        (r, s) => { s.seal(); s.observe(observation()); },
        (r, s) => { s.seal(); r.open({ invocationId: 'graph-1', phase: 'derivation' }); }
    ]) {
        const r = createCausalRecorder({ executionId: 'exec-1', maxEvents: 10 });
        const s = r.open({ invocationId: 'graph-1', phase: 'derivation' });
        assert.throws(() => action(r, s), /recorder_/);
        assert.throws(() => r.finish(), /recorder_failed/);
    }
});
test('N02G:RECORDER-004 real access events, not declared expectations, determine the log', () => {
    const r = createCausalRecorder({ executionId: 'exec-2', maxEvents: 10 });
    const s = r.open({ invocationId: 'graph-1', phase: 'derivation' });
    const access = createInstrumentedAccess({ emit: s.observe,
        bindings: [{ alias: 'node_a', role: 'source', value: { amount: 7, unused: 8 },
            shape: { type: 'record', fields: { amount: { type: 'scalar' }, unused: { type: 'scalar' } } } }] });
    assert.equal(access.handle('node_a').get('amount'), 7);
    access.revoke(); access.assertHealthy(); s.seal();
    const trace = r.finish();
    assert.equal(trace.derivation_trace.length, 1);
    assert.deepEqual(trace.derivation_trace[0].path, ['amount']);
    assert.equal(Object.hasOwn(access.handle, 'observe'), false);
});
test('N02G:RECORDER-005 quota and active/incomplete scopes fail closed', () => {
    const r = createCausalRecorder({ executionId: 'exec-1', maxEvents: 1 });
    const s = r.open({ invocationId: 'graph-1', phase: 'derivation' }); s.observe(observation());
    assert.throws(() => s.observe(observation()), /recorder_limit/);
    assert.throws(() => r.finish(), /recorder_failed/);
    const other = createCausalRecorder({ executionId: 'exec-2', maxEvents: 1 });
    other.open({ invocationId: 'graph-1', phase: 'derivation' });
    assert.throws(() => other.finish(), /recorder_active/);
});
test('N02G:RECORDER-006 input mutations and fake accessors cannot rewrite observations', () => {
    const r = createCausalRecorder({ executionId: 'exec-1', maxEvents: 10 });
    const s = r.open({ invocationId: 'graph-1', phase: 'derivation' });
    const e = observation(); s.observe(e); e[4][0] = 'different'; s.seal();
    assert.deepEqual(r.finish().derivation_trace[0].path, ['amount']);
    let calls = 0; const bad = observation(); Object.defineProperty(bad, '1', { get() { calls++; return 'get'; } });
    const other = createCausalRecorder({ executionId: 'exec-2', maxEvents: 10 });
    const scope = other.open({ invocationId: 'graph-1', phase: 'derivation' });
    assert.throws(() => scope.observe(bad), /recorder_event_invalid/); assert.equal(calls, 0);
});
test('N02G:RECORDER-007 total serialized observations have an independent byte quota', () => {
    const r = createCausalRecorder({ executionId: 'exec-1', maxEvents: 100, maxBytes: 256 });
    const s = r.open({ invocationId: 'graph-1', phase: 'derivation' });
    const e = observation(); e[6][1] = 'x'.repeat(1000);
    assert.throws(() => s.observe(e), /recorder_byte_limit/);
    assert.throws(() => r.finish(), /recorder_failed/);
});
test('N02G:RECORDER-008 iterator reacquisition is decoded, not inferred from expected reads', () => {
    const r = createCausalRecorder({ executionId: 'exec-1', maxEvents: 10 });
    const s = r.open({ invocationId: 'graph-1', phase: 'proof' });
    s.observe(['I', 'reuse_iterator', 'node_a', 'source', ['members'], 'data', ['cursor', 2, false]]);
    s.seal(); const trace = r.finish();
    assert.equal(trace.proof_trace[0].operation, 'reuse_iterator');
    assert.deepEqual(trace.proof_trace[0].outcome, ['cursor', 2, false]);
});
