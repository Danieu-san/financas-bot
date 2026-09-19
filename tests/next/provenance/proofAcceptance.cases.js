'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCausalRecorder } = require('../../../src/next/provenance/causalRecorder');
const { createInstrumentedAccess, createNodeSetAccess } = require('../../../src/next/provenance/instrumentedAccess');
const { compareReadEdgeCoverage, compareSelectionCoverage } = require('../../../src/next/provenance/proofAcceptance');
const { digest } = require('../../../src/next/kernel/canonicalValue');
const scalar = { type: 'scalar' };
const expectation = () => ({ required_nodes: ['a'], required_reads: [{ node: 'a', segments: ['amount'] }],
    required_claim_reads: [], required_edges: [], required_structural: [] });
function recorded(run, phase = 'derivation') {
    const recorder = createCausalRecorder({ executionId: 'execution-1', maxEvents: 100 });
    const scope = recorder.open({ invocationId: 'invocation-1', phase });
    const access = createInstrumentedAccess({ bindings: [
        { alias: 'a', role: 'source', value: { id: 'a-id', amount: 7, unused: 8, owner: 'b-id', members: ['one', 'two'] },
            shape: { type: 'record', fields: { id: scalar, amount: scalar, unused: scalar, owner: scalar,
                members: { type: 'sequence', item: scalar } } } },
        { alias: 'b', role: 'source', value: { id: 'b-id', amount: 9 },
            shape: { type: 'record', fields: { id: scalar, amount: scalar } } },
        { alias: 'claim/context', role: 'context', value: { time_basis: 'event_date' },
            shape: { type: 'record', fields: { time_basis: scalar } } }
    ], links: [{ id: 'owner', source: 'a', field: 'owner', target: 'b', type: 'ref' }], emit: scope.observe });
    run(access, scope); access.revoke(); access.assertHealthy(); scope.seal();
    return recorder.finish();
}
function check(trace, expected = expectation(), phase = 'derivation') {
    return compareReadEdgeCoverage({ trace, expected, executionId: 'execution-1', invocationId: 'invocation-1', phase });
}

test('N02G:TRACE-COVERAGE-001 real repeated reads compare as a set without rewriting the recorder log', () => {
    const trace = recorded(a => { a.handle('a').get('amount'); a.handle('a').get('amount'); });
    const before = JSON.stringify(trace); const result = check(trace);
    assert.equal(result.matched, true); assert.equal(result.stage, 'read_edge_coverage_only');
    assert.equal(result.graph_accepted, false); assert.deepEqual(result.mismatches, []);
    assert.equal(trace.derivation_trace.length, 2); assert.equal(JSON.stringify(trace), before);
});

test('N02G:TRACE-COVERAGE-002 omitted and extra reads are reported independently of node membership', () => {
    const trace = recorded(a => a.handle('a').get('unused'));
    const result = check(trace);
    assert.equal(result.matched, false);
    assert.deepEqual(result.mismatches.map(x => [x.dimension, x.missing, x.extra]), [
        ['reads', [['a', ['amount']]], [['a', ['unused']]]]
    ]);
    const empty = check(recorded(() => {}));
    assert.deepEqual(empty.mismatches.map(x => x.dimension), ['nodes', 'reads']);
    const extra = check(recorded(a => { a.handle('a').get('amount'); a.handle('b').get('amount'); }));
    assert.deepEqual(extra.mismatches.map(x => x.dimension), ['nodes', 'reads']);
});

test('N02G:TRACE-COVERAGE-003 edge-only traversal does not discharge reads or invent target-node consumption', () => {
    const expected = { required_nodes: [], required_reads: [], required_claim_reads: [], required_edges: ['owner'], required_structural: [] };
    const trace = recorded(a => a.handle('a').traverse('owner'));
    assert.equal(check(trace, expected).matched, true);
    assert.equal(check(recorded(() => {}), expected).matched, false);
    assert.deepEqual(check(trace).mismatches.map(x => x.dimension), ['nodes', 'reads', 'edges']);
    const read = recorded(a => a.handle('a').traverse('owner').get('amount'));
    assert.deepEqual(check(read, expected).mismatches.map(x => x.dimension), ['nodes', 'reads']);
});

test('N02G:TRACE-COVERAGE-004 context reads are compared separately from snapshot reads', () => {
    const trace = recorded(a => a.handle('claim/context').get('time_basis'));
    const expected = { required_nodes: [], required_reads: [], required_claim_reads: [{ segments: ['time_basis'] }], required_edges: [], required_structural: [] };
    assert.equal(check(trace, expected).matched, true);
    expected.required_claim_reads = [{ segments: ['coverage'] }];
    assert.deepEqual(check(trace, expected).mismatches.map(x => x.dimension), ['claim_reads']);
});

test('N02G:TRACE-COVERAGE-005 phase, invocation, sequence and execution cannot be silently reassigned', () => {
    const trace = recorded(a => a.handle('a').get('amount'));
    for (const modify of [t => { t.execution_id = 'other'; },
        t => { t.derivation_trace[0].invocation_id = 'other'; },
        t => { t.derivation_trace[0].phase = 'proof'; },
        t => { t.derivation_trace[0].sequence = 1; },
        t => { t.proof_trace.push(t.derivation_trace[0]); }]) {
        const wrong = structuredClone(trace); modify(wrong);
        assert.throws(() => check(wrong), /trace_coverage_/);
    }
    const proof = recorded(a => a.handle('a').get('amount'), 'proof');
    assert.equal(check(proof, expectation(), 'proof').matched, true);
    assert.equal(check(proof).matched, false);
});

test('N02G:TRACE-COVERAGE-006 unclassified observations cannot yield a component PASS', () => {
    const trace = recorded(a => { a.handle('a').get('amount'); a.handle('claim/context').keys(); });
    const result = check(trace); assert.equal(result.matched, false);
    assert.equal(result.unclassified.length, 1); assert.equal(result.unclassified[0].operation, 'keys');
    const measured = recorded((a, s) => { a.handle('a').get('amount');
        s.measure(['M', 'evaluator_artifact_root', 'sha256:' + 'a'.repeat(64)]); });
    assert.equal(check(measured).matched, false);
});

function membersExpected(operations) {
    return { required_nodes: ['a'], required_reads: [{ node: 'a', segments: ['members'] }],
        required_edges: [], required_claim_reads: [], required_structural: operations.map(operation => ({
            node: 'a', segments: ['members'], operation })) };
}
test('N02G:TRACE-COVERAGE-008 full iteration independently discharges iterator, order and cardinality', () => {
    const trace = recorded(a => { for (const member of a.handle('a').get('members')) assert.equal(typeof member, 'string'); });
    const result = check(trace, membersExpected(['iterator', 'order', 'cardinality']));
    assert.equal(result.matched, true);
    const lengthOnly = recorded(a => a.handle('a').get('members').length());
    const incomplete = check(lengthOnly, membersExpected(['iterator', 'order', 'cardinality']));
    assert.equal(incomplete.matched, false);
    assert.deepEqual(incomplete.mismatches.find(x => x.dimension === 'structural').missing.map(x => x[1]).sort(), ['iterator', 'order']);
});
test('N02G:TRACE-COVERAGE-009 early termination cannot prove full order or cardinality', () => {
    const trace = recorded(a => { for (const member of a.handle('a').get('members')) { assert.equal(member, 'one'); break; } });
    const result = check(trace, membersExpected(['iterator', 'order', 'cardinality']));
    assert.equal(result.matched, false);
    const structural = result.mismatches.find(x => x.dimension === 'structural');
    assert.deepEqual(structural.missing.map(x => x[1]).sort(), ['cardinality', 'order']);
    assert.deepEqual(structural.extra.map(x => x[1]), ['early_termination']);
    assert.equal(check(trace, membersExpected(['iterator', 'early_termination'])).matched, true);
});
test('N02G:TRACE-COVERAGE-010 explicit index and membership are distinct structural evidence', () => {
    const trace = recorded(a => { const list = a.handle('a').get('members'); assert.equal(list.at(1), 'two'); assert.equal(list.includes('absent'), false); });
    assert.equal(check(trace, membersExpected(['index', 'membership'])).matched, true);
    assert.equal(check(trace, membersExpected(['iterator', 'order', 'cardinality'])).matched, false);
});
test('N02G:TRACE-COVERAGE-011 presence and key-view operations remain tied to the source fields', () => {
    const trace = recorded(a => { a.handle('a').has('amount'); for (const key of a.handle('a').keys()) assert.equal(typeof key, 'string'); });
    const expected = { required_nodes: ['a'], required_reads: [], required_claim_reads: [], required_edges: [],
        required_structural: [{ node: 'a', operation: 'has', segments: ['amount'] }, { node: 'a', operation: 'keys', segments: [] }] };
    assert.equal(check(trace, expected).matched, true);
    assert.equal(check(trace).matched, false);
});
test('N02G:TRACE-COVERAGE-012 iterator completion cannot be fabricated by missing, duplicate or out-of-order member observations', () => {
    const trace = recorded(a => { Array.from(a.handle('a').get('members')); });
    const members = trace.derivation_trace.filter(x => x.operation === 'next');
    assert.equal(members.length, 3);
    for (const index of [0, 1]) {
        const wrong = structuredClone(trace); const next = wrong.derivation_trace.filter(x => x.operation === 'next');
        next[index].path[next[index].path.length - 1] = index === 0 ? 1 : 0;
        assert.equal(check(wrong, membersExpected(['iterator', 'order', 'cardinality'])).matched, false);
    }
});

test('N02G:TRACE-COVERAGE-013 next after explicit return cannot turn a truncated iterator into complete consumption', () => {
    for (const consumed of [0, 1, 2]) {
        const trace = recorded(a => {
            const iterator = a.handle('a').get('members')[Symbol.iterator]();
            for (let i = 0; i < consumed; i++) iterator.next();
            iterator.return();
            assert.equal(iterator.next().done, true);
            assert.equal(iterator.next().done, true);
        });
        assert.equal(check(trace, membersExpected(['iterator', 'early_termination'])).matched, true);
        const incomplete = check(trace, membersExpected(['iterator', 'early_termination', 'order', 'cardinality']));
        assert.equal(incomplete.matched, false);
        assert.deepEqual(incomplete.mismatches[0].missing.map(x => x[1]).sort(), ['cardinality', 'order']);
    }
    const exhausted = recorded(a => {
        const iterator = a.handle('a').get('members')[Symbol.iterator]();
        while (!iterator.next().done) {}
        iterator.return(); iterator.next();
    });
    assert.equal(check(exhausted, membersExpected(['iterator', 'order', 'cardinality'])).matched, true);
});

function selectionTrace(run, phase = 'derivation', aliases = ['a', 'b']) {
    const recorder = createCausalRecorder({ executionId: 'execution-1', maxEvents: 100 });
    const scope = recorder.open({ invocationId: 'invocation-1', phase });
    const access = createNodeSetAccess({ role: 'events', emit: scope.observe,
        bindings: aliases.map((alias, i) => ({ alias, role: 'events', value: { amount: i },
            shape: { type: 'record', fields: { amount: scalar } } })) });
    run(access.handle); access.revoke(); access.assertHealthy(); scope.seal(); return recorder.finish();
}
function selectionCheck(trace, overrides = {}) {
    return compareSelectionCoverage({ trace, executionId: 'execution-1', invocationId: 'invocation-1', phase: 'derivation',
        sets: { candidates: ['a', 'b'], selected: ['b'] },
        bindings: [{ role: 'events', candidate_set: 'candidates', selected_set: 'selected' }],
        expected: { required_selections: [{ candidate_set: 'candidates', selected_set: 'selected' }], selected_nodes: ['b'] },
        ...overrides });
}

test('N02G:TRACE-SELECTION-008 no selection means zero events, not an empty selected view', () => {
    const absent = { bindings: [], expected: { required_selections: [], selected_nodes: [] } };
    assert.equal(selectionCheck(selectionTrace(set => set.at(0).get('amount')), absent).matched, true);
    for (const predicate of [() => false, () => true]) {
        const trace = selectionTrace(set => set.select(predicate));
        const result = selectionCheck(trace, absent);
        assert.equal(result.matched, false);
        assert.ok(result.errors.some(e => e.code === 'unbound_selection'));
    }
    const proof = selectionTrace(set => set.select(n => n.get('amount') === 1), 'proof');
    assert.equal(selectionCheck(proof, absent).matched, true);
    assert.equal(selectionCheck(proof).matched, false);
    assert.equal(selectionCheck(proof, { phase: 'proof' }).matched, true);
});

test('N02G:TRACE-SELECTION-001 observed decisions, not reads or authored members, define the selected set', () => {
    const trace = selectionTrace(set => { for (const node of set.select(node => node.get('amount') === 1)) node.get('amount'); });
    const before = JSON.stringify(trace); const result = selectionCheck(trace);
    assert.equal(result.matched, true); assert.equal(result.graph_accepted, false);
    assert.deepEqual(result.selected_nodes, ['b']); assert.equal(JSON.stringify(trace), before);
    const readOnly = selectionTrace(set => { for (const node of set) node.get('amount'); });
    assert.equal(selectionCheck(readOnly).matched, false);
    const wrongDecision = selectionTrace(set => set.select(node => node.get('amount') === 0));
    assert.equal(selectionCheck(wrongDecision).matched, false);
});

test('N02G:TRACE-SELECTION-002 missing, repeated or retargeted decisions cannot hide behind the correct returned view', () => {
    const trace = selectionTrace(set => set.select(node => node.get('amount') === 1));
    const cases = [
        rows => rows.filter(e => e.operation !== 'select_start'),
        rows => rows.filter(e => e.operation !== 'select_member'),
        rows => rows.filter(e => e.operation !== 'at'),
        rows => rows.filter(e => e.operation !== 'select_return'),
        rows => { rows.find(e => e.operation === 'select_member').outcome[1] = 'b'; return rows; },
        rows => { rows.find(e => e.operation === 'select_member').path[0] = 1; return rows; },
        rows => { rows.find(e => e.operation === 'select_member').outcome[2] = true; return rows; },
        rows => { rows.push(structuredClone(rows.find(e => e.operation === 'select_return'))); return rows; },
        rows => rows.filter(e => e.operation === 'select_return')
    ];
    for (const mutate of cases) {
        const wrong = structuredClone(trace); wrong.derivation_trace = mutate(wrong.derivation_trace);
        wrong.derivation_trace.forEach((e, i) => { e.sequence = i; });
        assert.equal(selectionCheck(wrong).matched, false);
    }
});

test('N02G:TRACE-SELECTION-003 empty selection requires examining all candidates; empty roster still requires selection execution', () => {
    const expected = { required_selections: [{ candidate_set: 'candidates', selected_set: 'selected' }], selected_nodes: [] };
    const none = selectionTrace(set => set.select(node => node.get('amount') > 10));
    assert.equal(selectionCheck(none, { sets: { candidates: ['a', 'b'], selected: [] }, expected }).matched, true);
    const empty = selectionTrace(set => set.select(() => { throw new Error('unreachable'); }), 'derivation', []);
    assert.equal(selectionCheck(empty, { sets: { candidates: [], selected: [] }, expected }).matched, true);
    assert.equal(selectionCheck(selectionTrace(() => {}, 'derivation', []), { sets: { candidates: [], selected: [] }, expected }).matched, false);
});

test('N02G:TRACE-SELECTION-004 unknown role, ambiguous binding, duplicate selection and wrong phase fail closed', () => {
    const trace = selectionTrace(set => set.select(node => node.get('amount') === 1));
    assert.equal(selectionCheck(trace, { bindings: [{ role: 'other', candidate_set: 'candidates', selected_set: 'selected' }] }).matched, false);
    assert.throws(() => selectionCheck(trace, { bindings: [
        { role: 'events', candidate_set: 'candidates', selected_set: 'selected' },
        { role: 'events', candidate_set: 'candidates', selected_set: 'selected' }] }), /trace_coverage_/);
    assert.equal(selectionCheck(selectionTrace(set => {
        set.select(n => n.get('amount') === 1); set.select(n => n.get('amount') === 1);
    })).matched, false);
    const proof = selectionTrace(set => set.select(n => n.get('amount') === 1), 'proof');
    assert.equal(selectionCheck(proof).matched, false);
    assert.equal(selectionCheck(proof, { phase: 'proof' }).matched, true);
});

test('N02G:TRACE-SELECTION-005 view digest or recomputed digest cannot legitimize membership not obtained from decisions', () => {
    const trace = selectionTrace(set => set.select(n => n.get('amount') === 1));
    const wrong = structuredClone(trace); const returned = wrong.derivation_trace.find(e => e.operation === 'select_return');
    returned.outcome = ['selected', `view_${digest({ role: 'events', aliases: ['a'] })}`, 'a'];
    assert.equal(selectionCheck(wrong).matched, false);
    returned.outcome[1] = 'view_' + 'a'.repeat(64);
    assert.throws(() => selectionCheck(wrong), /trace_coverage_entry/);
});

test('N02G:TRACE-SELECTION-006 candidate order and each declared selection remain independently accountable', () => {
    const recorder = createCausalRecorder({ executionId: 'execution-1', maxEvents: 100 });
    const scope = recorder.open({ invocationId: 'invocation-1', phase: 'derivation' });
    for (const role of ['events', 'bills']) {
        const access = createNodeSetAccess({ role, emit: scope.observe, bindings: ['a', 'b'].map((alias, amount) => ({
            alias, role, value: { amount }, shape: { type: 'record', fields: { amount: scalar } } })) });
        access.handle.select(n => n.get('amount') === 1); access.revoke(); access.assertHealthy();
    }
    scope.seal(); const trace = recorder.finish();
    const bindings = [
        { role: 'events', candidate_set: 'candidates', selected_set: 'selected' },
        { role: 'bills', candidate_set: 'bill_candidates', selected_set: 'bill_selected' }
    ];
    const expected = { required_selections: bindings.map(({ candidate_set, selected_set }) => ({ candidate_set, selected_set })), selected_nodes: ['b'] };
    const options = { bindings, expected, sets: { candidates: ['a', 'b'], selected: ['b'], bill_candidates: ['a', 'b'], bill_selected: ['b'] } };
    assert.equal(selectionCheck(trace, options).matched, true);
    const missing = structuredClone(trace); missing.derivation_trace = missing.derivation_trace.filter(e => e.role !== 'bills');
    assert.equal(selectionCheck(missing, options).matched, false);
    assert.equal(selectionCheck(trace, { ...options, sets: { ...options.sets, candidates: ['b', 'a'] } }).matched, false);
    assert.throws(() => selectionCheck(trace, { ...options, bindings: bindings.slice(0, 1) }), /selection_binding_missing/);
    assert.throws(() => selectionCheck(trace, { ...options, expected: { ...expected, selected_nodes: [] } }), /selection_union/);
});

test('N02G:TRACE-SELECTION-007 selected views cannot be consumed before their observed construction', () => {
    const trace = selectionTrace(set => { const selected = set.select(n => n.get('amount') === 1); selected.length(); });
    const wrong = structuredClone(trace); const rows = wrong.derivation_trace;
    rows.unshift(rows.pop()); rows.forEach((e, i) => { e.sequence = i; });
    assert.equal(selectionCheck(wrong).matched, false);
    const changed = structuredClone(trace); changed.derivation_trace.at(-1).path[0] = 'view_' + 'a'.repeat(64);
    assert.equal(selectionCheck(changed).matched, false);
    assert.equal(selectionCheck(trace).matched, true);
});

test('N02G:TRACE-COVERAGE-007 malformed observations and duplicate expectations fail instead of being normalized away', () => {
    const trace = recorded(a => a.handle('a').get('amount'));
    for (const modify of [t => { t.derivation_trace[0].extra = true; },
        t => { t.derivation_trace[0].outcome = ['result', 7]; },
        t => { t.derivation_trace[0].operation = 'invented'; }]) {
        const wrong = structuredClone(trace); modify(wrong);
        assert.throws(() => check(wrong), /trace_coverage_/);
    }
    const duplicate = expectation(); duplicate.required_reads.push(duplicate.required_reads[0]);
    assert.throws(() => check(trace, duplicate), /trace_coverage_expected/);
    const extra = expectation(); extra.result = 7;
    assert.throws(() => check(trace, extra), /trace_coverage_expected/);
    let calls = 0; const hostile = { ...trace };
    Object.defineProperty(hostile, 'execution_id', { enumerable: true, get() { calls++; return 'execution-1'; } });
    assert.throws(() => check(hostile), /trace_coverage_/); assert.equal(calls, 0);
});
