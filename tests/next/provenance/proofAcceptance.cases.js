'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCausalRecorder } = require('../../../src/next/provenance/causalRecorder');
const { createInstrumentedAccess, createNodeSetAccess } = require('../../../src/next/provenance/instrumentedAccess');
const { compareReadEdgeCoverage, compareSelectionCoverage, comparePhaseCoverage } = require('../../../src/next/provenance/proofAcceptance');
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

test('N02G:TRAVERSAL-PROFILE-001 explicit structural traversal is not silently absorbed by material-edge coverage', () => {
    const trace = recorded(a => a.handle('a').follow('owner'));
    assert.equal(trace.derivation_trace.length, 1);
    assert.equal(trace.derivation_trace[0].operation, 'traverse');
    const expected = { required_nodes: [], required_reads: [], required_claim_reads: [],
        required_edges: ['owner'], required_structural: [] };
    assert.equal(check(trace, expected).matched, true);
    const structural = { node: 'a', operation: 'traversal', segments: ['owner'] };
    const result = check(trace, { ...expected, required_structural: [structural] });
    assert.equal(result.matched, false);
    assert.deepEqual(result.mismatches.map(x => ({ ...x })), [{ dimension: 'structural', missing: [['a', 'traversal', ['owner']]], extra: [] }]);
    assert.equal(check(trace, { ...expected, required_edges: [] }).matched, false);
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

function phaseInput(trace, selecting = false) {
    return { trace, executionId: 'execution-1', invocationId: 'invocation-1', phase: 'derivation',
        accessBindings: selecting ? ['a', 'b'].map(alias => ({ alias, role: 'events', identity: null, records: [[]] }))
            : [['a', 'source'], ['b', 'source'], ['claim/context', 'context']].map(([alias, role]) => ({ alias, role, identity: null, records: [[]] })),
        operandSets: selecting ? [{ role: 'events', aliases: ['a', 'b'] }] : [],
        sets: selecting ? { candidates: ['a', 'b'], selected: ['b'] } : {},
        bindings: selecting ? [{ role: 'events', candidate_set: 'candidates', selected_set: 'selected' }] : [],
        expected: { ...expectation(),
            ...(selecting ? { required_nodes: ['a', 'b'], required_reads: ['a', 'b'].map(node => ({ node, segments: ['amount'] })) } : {}),
            required_selections: selecting ? [{ candidate_set: 'candidates', selected_set: 'selected' }] : [],
            selected_nodes: selecting ? ['b'] : [] } };
}
const selectedTrace = () => selectionTrace(set => set.select(node => node.get('amount') === 1));

test('N02G:TRACE-COMPOSITION-001 composition accounts for every event without accepting a graph or rewriting its trace', () => {
    const input = phaseInput(selectedTrace(), true); const before = JSON.stringify(input);
    const result = comparePhaseCoverage(input);
    assert.equal(result.stage, 'phase_coverage_only'); assert.equal(result.graph_accepted, false);
    assert.equal(result.matched, true);
    assert.equal(result.components.read_edges.matched, false); // Its standalone unclassified selection events remain visible.
    assert.equal(result.components.selection.matched, true);
    assert.deepEqual(result.event_coverage.map(e => e.sequence), input.trace.derivation_trace.map(e => e.sequence));
    assert.ok(result.event_coverage.every(e => e.status === 'covered'));
    assert.deepEqual([...new Set(result.event_coverage.map(e => e.component))].sort(), ['read_edges', 'selection']);
    assert.equal(JSON.stringify(input), before);
});

test('N02G:TRACE-COMPOSITION-002 deleting any causal event, even after renumbering, cannot preserve a phase match', () => {
    const trace = selectedTrace();
    for (let removed = 0; removed < trace.derivation_trace.length; removed++) {
        const wrong = structuredClone(trace); wrong.derivation_trace.splice(removed, 1);
        wrong.derivation_trace.forEach((e, i) => { e.sequence = i; });
        assert.equal(comparePhaseCoverage(phaseInput(wrong, true)).matched, false, `removed ${removed}`);
    }
});

test('N02G:TRACE-COMPOSITION-003 correct selection never hides missing or extra scalar reads', () => {
    for (const segments of [['unused'], ['amount', 'nested']]) {
        const input = phaseInput(selectedTrace(), true); input.expected.required_reads[0].segments = segments;
        const result = comparePhaseCoverage(input);
        assert.equal(result.components.selection.matched, true); assert.equal(result.matched, false);
        assert.ok(result.components.read_edges.mismatches.some(e => e.dimension === 'reads' && e.missing.length && e.extra.length));
    }
});

test('N02G:TRACE-COMPOSITION-004 rostered set and view consumption is explicitly validated beyond selection', () => {
    for (const run of [set => { set.length(); set.select(n => n.get('amount') === 1); },
        set => { set.select(n => n.get('amount') === 1).length(); },
        set => { for (const n of set.select(n => n.get('amount') === 1)) n.get('amount'); },
        set => { set.select(n => n.get('amount') === 1); set.at(0); }]) {
        const result = comparePhaseCoverage(phaseInput(selectionTrace(run), true));
        assert.equal(result.components.selection.matched, true); assert.equal(result.matched, true);
        assert.ok(result.event_coverage.some(e => e.status === 'covered' && e.component === 'operand_sets'));
    }
});

test('N02G:TRACE-COMPOSITION-005 unadmitted metadata, unbound civil dates and unverified measurements remain blocking', () => {
    const observations = [
        ['I', 'identity', 'a', 'source', ['kind'], 'node_identity', ['scalar', 'event']],
        ['I', 'get', 'a', 'source', ['record'], 'data', ['container', 'record']],
        ['I', 'civil_date', 'a', 'source', ['created_at'], 'data', ['civil', '2026-09-01T12:00:00Z', 'America/Sao_Paulo', 'proleptic_gregorian', '2026-09-01']],
        ['M', 'validation_tcb_root', 'sha256:' + 'a'.repeat(64)]
    ];
    for (const raw of observations) {
        const trace = recorded((a, scope) => { a.handle('a').get('amount');
            if (raw[0] === 'M') scope.measure(raw); else scope.observe(raw); });
        const result = comparePhaseCoverage(phaseInput(trace));
        assert.equal(result.matched, false); assert.equal(result.graph_accepted, false);
        assert.deepEqual(result.components.read_edges.mismatches, []);
        assert.equal(result.event_coverage.at(-1).status, raw[0] === 'M' ? 'unsupported' : 'invalid');
    }
});

test('N02G:TRACE-COMPOSITION-006 record navigation, traversal and membership do not substitute for leaf reads or enumeration', () => {
    const record = recorded((a, scope) => scope.observe(['I', 'get', 'a', 'source', ['amount'], 'data', ['container', 'record']]));
    const traversal = recorded(a => a.handle('a').traverse('owner'));
    for (const trace of [record, traversal]) {
        const result = comparePhaseCoverage(phaseInput(trace));
        assert.equal(result.matched, false);
        assert.ok(result.components.read_edges.mismatches.some(e => e.dimension === 'reads' && e.missing.length));
    }
    const input = phaseInput(recorded(a => a.handle('a').get('members').includes('one')));
    Object.assign(input.expected, membersExpected(['iterator', 'order', 'cardinality']));
    const result = comparePhaseCoverage(input); assert.equal(result.matched, false);
    assert.ok(result.components.read_edges.mismatches.some(e => e.dimension === 'structural'));
});

test('N02G:TRACE-COMPOSITION-007 selection lifecycle errors are invalid, not borrowed from the read projection', () => {
    const trace = structuredClone(selectedTrace());
    trace.derivation_trace.find(e => e.operation === 'select_member').outcome[1] = 'unknown';
    const result = comparePhaseCoverage(phaseInput(trace, true));
    assert.equal(result.matched, false);
    assert.ok(result.event_coverage.some(e => e.status === 'invalid' && e.component === 'selection'));
    assert.ok(result.components.selection.errors.some(e => e.code === 'candidate_decision'));
});

test('N02G:TRACE-COMPOSITION-008 phase, execution, invocation and malformed event identities cannot cross the boundary', () => {
    const proof = selectionTrace(set => set.select(n => n.get('amount') === 1), 'proof');
    assert.equal(comparePhaseCoverage(phaseInput(proof, true)).matched, false);
    const input = phaseInput(proof, true); input.phase = 'proof';
    assert.equal(comparePhaseCoverage(input).matched, true);
    for (const change of [t => { t.execution_id = 'other'; }, t => { t.derivation_trace[0].invocation_id = 'other'; },
        t => { t.derivation_trace[0].phase = 'proof'; }, t => { t.derivation_trace[0].operation = 'invented'; },
        t => { t.derivation_trace[0].sequence = 99; }]) {
        const wrong = structuredClone(selectedTrace()); change(wrong);
        assert.throws(() => comparePhaseCoverage(phaseInput(wrong, true)), /trace_coverage_/);
    }
});

test('N02G:TRACE-COMPOSITION-009 caller-supplied verdicts and hostile accessors cannot discharge an event', () => {
    const input = phaseInput(selectedTrace(), true);
    for (const key of ['components', 'covered_sequences', 'event_coverage']) {
        assert.throws(() => comparePhaseCoverage({ ...input, [key]: [] }), /trace_coverage_/);
    }
    let calls = 0; const hostile = { ...input };
    Object.defineProperty(hostile, 'expected', { enumerable: true, get() { calls++; return input.expected; } });
    assert.throws(() => comparePhaseCoverage(hostile), /trace_coverage_/); assert.equal(calls, 0);
});

function consumeRoster(view) {
    view.length(); view.includes('a'); view.includes('b'); view.includes('absent');
    view.at(0); view.at(99);
    const iterator = view[Symbol.iterator](); iterator[Symbol.iterator](); iterator.next();
    iterator.return(); iterator.return(); iterator.next(); iterator[Symbol.iterator]();
    const full = view[Symbol.iterator](); while (!full.next().done) {}
    full.next(); full.return(); full[Symbol.iterator]();
}
function consumptionInput(aliases = ['a', 'b']) {
    const trace = selectionTrace(set => { consumeRoster(set); consumeRoster(set.select(n => n.get('amount') === 1)); }, 'derivation', aliases);
    const input = phaseInput(trace, true);
    input.operandSets[0].aliases = [...aliases]; input.sets.candidates = [...aliases]; input.sets.selected = aliases.slice(1, 2);
    input.accessBindings = aliases.map(alias => ({ alias, role: 'events', identity: null, records: [[]] }));
    input.expected.required_nodes = aliases;
    input.expected.required_reads = aliases.map(node => ({ node, segments: ['amount'] }));
    input.expected.selected_nodes = aliases.slice(1, 2);
    return input;
}
function rejectedPhase(input) {
    try { assert.equal(comparePhaseCoverage(input).matched, false); }
    catch (error) { assert.match(error.message, /^trace_coverage_/); }
}

test('N02G:OPERAND-CONSUMPTION-001 roster operations validate actual members, cursor and closure for empty and nonempty views', () => {
    for (const aliases of [[], ['a'], ['a', 'b'], ['a', 'b', 'c']]) {
        const input = consumptionInput(aliases); const before = JSON.stringify(input);
        const result = comparePhaseCoverage(input);
        assert.equal(result.matched, true); assert.equal(result.graph_accepted, false);
        assert.equal(result.components.operand_sets.matched, true);
        assert.ok(result.event_coverage.every(e => e.status === 'covered'));
        assert.equal(JSON.stringify(input), before);
    }
});

test('N02G:OPERAND-CONSUMPTION-002 each observed roster outcome must match independent admitted members and cursor state', () => {
    const original = consumptionInput(); const good = comparePhaseCoverage(original);
    const owned = new Set(good.components.operand_sets.covered_sequences); let checked = 0;
    for (const event of original.trace.derivation_trace.filter(e => owned.has(e.sequence) && e.operation !== 'iterate')) {
        const wrong = structuredClone(original); const target = wrong.trace.derivation_trace[event.sequence];
        const tag = target.outcome[0];
        if (tag === 'count' || tag === 'closed' || tag === 'cursor') target.outcome[1]++;
        else if (tag === 'membership') target.outcome[2] = !target.outcome[2];
        else if (tag === 'node') target.outcome[1] = 'unbound';
        else if (tag === 'done' || tag === 'absent') target.outcome = ['node', 'a'];
        else assert.fail(`unhandled outcome ${tag}`);
        rejectedPhase(wrong); checked++;
    }
    assert.ok(checked >= 30);
});

test('N02G:OPERAND-CONSUMPTION-003 missing, premature, reordered and repeated iterator observations fail closed', () => {
    const original = consumptionInput();
    const modifications = [
        rows => rows.filter(e => e.operation !== 'iterate'),
        rows => { rows.find(e => e.operation === 'next' && e.outcome[0] === 'node').outcome = ['done']; return rows; },
        rows => { const i = rows.findIndex(e => e.operation === 'next'); rows.splice(i, 1); return rows; },
        rows => { const i = rows.findIndex(e => e.operation === 'next'); rows.splice(i, 0, structuredClone(rows[i])); return rows; },
        rows => { rows.find(e => e.operation === 'next').path = [99]; return rows; },
        rows => { const e = rows.find(e => e.operation === 'reuse_iterator'); e.outcome[2] = true; return rows; }
    ];
    for (const modify of modifications) {
        const wrong = structuredClone(original); wrong.trace.derivation_trace = modify(wrong.trace.derivation_trace);
        wrong.trace.derivation_trace.forEach((e, i) => { e.sequence = i; }); rejectedPhase(wrong);
    }
});

test('N02G:OPERAND-CONSUMPTION-004 roster authority cannot be omitted, duplicated or derived from the observed selection', () => {
    for (const mutate of [input => { input.operandSets = []; },
        input => { input.operandSets[0].aliases.reverse(); },
        input => { input.operandSets[0].aliases.push('a'); },
        input => { input.operandSets.push(structuredClone(input.operandSets[0])); },
        input => { input.operandSets[0].aliases = ['b']; },
        input => { input.operandSets[0].role = 'other'; }]) {
        const input = structuredClone(consumptionInput()); mutate(input);
        assert.throws(() => comparePhaseCoverage(input), /trace_coverage_/);
    }
});

test('N02G:OPERAND-CONSUMPTION-005 a view must be constructed before use in the same phase and role', () => {
    const original = consumptionInput();
    for (const mutate of [rows => { const i = rows.findIndex(e => e.projection === 'operand_selection'); rows.unshift(rows.splice(i, 1)[0]); },
        rows => { rows.find(e => e.projection === 'operand_selection').path[0] = 'view_' + '0'.repeat(64); },
        rows => { const e = rows.find(e => e.projection === 'operand_selection'); e.role = 'other'; e.alias = 'operand/other'; }]) {
        const input = structuredClone(original); mutate(input.trace.derivation_trace);
        input.trace.derivation_trace.forEach((e, i) => { e.sequence = i; }); rejectedPhase(input);
    }
});

test('N02G:OPERAND-CONSUMPTION-006 consumption without selection still needs a declared roster and cannot invent a selection', () => {
    const trace = selectionTrace(set => { consumeRoster(set); for (const node of set) node.get('amount'); });
    const input = phaseInput(trace);
    input.operandSets = [{ role: 'events', aliases: ['a', 'b'] }];
    input.accessBindings = ['a', 'b'].map(alias => ({ alias, role: 'events', identity: null, records: [[]] }));
    input.expected.required_nodes = ['a', 'b'];
    input.expected.required_reads = ['a', 'b'].map(node => ({ node, segments: ['amount'] }));
    const result = comparePhaseCoverage(input); assert.equal(result.matched, true);
    assert.deepEqual(result.components.selection.selected_nodes, []);
    input.operandSets = []; assert.equal(comparePhaseCoverage(input).matched, false);
});

test('N02G:OPERAND-CONSUMPTION-007 ambiguous simultaneous iterators are rejected but distinct views have independent cursors', () => {
    const ambiguous = selectionTrace(set => {
        const first = set[Symbol.iterator](); const second = set[Symbol.iterator]();
        first.next(); second.next(); set.select(n => n.get('amount') === 1);
    });
    const rejected = comparePhaseCoverage(phaseInput(ambiguous, true));
    assert.equal(rejected.matched, false);
    assert.ok(rejected.components.operand_sets.errors.some(e => e.code === 'ambiguous_iterator'));
    const distinct = selectionTrace(set => {
        const view = set.select(n => n.get('amount') === 1);
        const first = set[Symbol.iterator](); const second = view[Symbol.iterator]();
        first.next(); second.next(); first.next(); second.next(); first.next();
    });
    assert.equal(comparePhaseCoverage(phaseInput(distinct, true)).matched, true);
});

function metadataInput(run = node => {
    for (const key of ['kind', 'ref_id', 'version']) node.identity(key);
    node.get('details').get('child').get('amount');
}) {
    const identity = { kind: 'event', ref_id: 'a-id', version: 'sha256:' + 'a'.repeat(64) };
    const recorder = createCausalRecorder({ executionId: 'execution-1', maxEvents: 100 });
    const scope = recorder.open({ invocationId: 'invocation-1', phase: 'derivation' });
    const access = createInstrumentedAccess({ emit: scope.observe, bindings: [{ alias: 'a', role: 'source', identity,
        value: { id: 'a-id', amount: 7, details: { child: { amount: 9 } }, unused: { amount: 8 } },
        shape: { type: 'record', fields: { id: scalar, amount: scalar,
            details: { type: 'record', fields: { child: { type: 'record', fields: { amount: scalar } } } },
            unused: { type: 'record', fields: { amount: scalar } } } } }] });
    run(access.handle('a')); access.revoke(); access.assertHealthy(); scope.seal();
    const input = phaseInput(recorder.finish());
    input.accessBindings = [{ alias: 'a', role: 'source', identity, records: [[], ['details'], ['details', 'child'], ['unused']] }];
    input.expected.required_reads = [{ node: 'a', segments: ['details', 'child', 'amount'] }];
    return input;
}

test('N02G:ACCESS-METADATA-001 admitted identity and ordered record navigation compose without inventing leaf reads', () => {
    const input = metadataInput(); const before = JSON.stringify(input);
    const result = comparePhaseCoverage(input);
    assert.equal(result.matched, true); assert.equal(result.graph_accepted, false);
    assert.equal(result.components.access_metadata.matched, true);
    assert.equal(result.event_coverage.filter(e => e.component === 'access_metadata').length, 5);
    assert.equal(result.event_coverage.filter(e => e.component === 'read_edges').length, 1);
    assert.equal(JSON.stringify(input), before);
});

test('N02G:ACCESS-METADATA-002 shape-valid identity substitutions cannot authenticate a different snapshot or role', () => {
    for (const [key, value] of [['kind', 'person'], ['ref_id', 'b-id'], ['version', 'sha256:' + 'b'.repeat(64)]]) {
        const input = structuredClone(metadataInput());
        input.trace.derivation_trace.find(e => e.operation === 'identity' && e.path[0] === key).outcome[1] = value;
        const result = comparePhaseCoverage(input); assert.equal(result.matched, false);
        assert.ok(result.components.access_metadata.errors.some(e => e.code === 'identity_mismatch'));
    }
    for (const key of ['alias', 'role']) {
        const input = structuredClone(metadataInput()); input.trace.derivation_trace[0][key] = 'other';
        rejectedPhase(input);
    }
});

test('N02G:ACCESS-METADATA-003 removing any ancestor navigation cannot be repaired by a matching leaf read', () => {
    for (const path of [['details'], ['details', 'child']]) {
        const input = structuredClone(metadataInput());
        input.trace.derivation_trace = input.trace.derivation_trace.filter(e => JSON.stringify(e.path) !== JSON.stringify(path));
        input.trace.derivation_trace.forEach((e, i) => { e.sequence = i; });
        const result = comparePhaseCoverage(input); assert.equal(result.matched, false);
        assert.deepEqual(result.components.read_edges.mismatches, []);
        assert.ok(result.components.access_metadata.errors.some(e => e.code === 'record_parent_missing'));
    }
    const reordered = structuredClone(metadataInput()); reordered.trace.derivation_trace.unshift(reordered.trace.derivation_trace.pop());
    reordered.trace.derivation_trace.forEach((e, i) => { e.sequence = i; }); rejectedPhase(reordered);
});

test('N02G:ACCESS-METADATA-004 admitted but undeclared navigation and scalar-to-record confusion fail closed', () => {
    for (const path of [['unused'], ['amount'], ['missing']]) {
        const input = structuredClone(metadataInput());
        input.trace.derivation_trace.find(e => e.outcome[0] === 'container').path = path;
        rejectedPhase(input);
    }
    const input = metadataInput(node => { node.get('unused'); node.get('details').get('child').get('amount'); });
    const result = comparePhaseCoverage(input); assert.equal(result.matched, false);
    assert.ok(result.components.access_metadata.errors.some(e => e.code === 'record_not_required'));
});

test('N02G:ACCESS-METADATA-005 identity and containers never satisfy payload reads or unneeded node admission', () => {
    const input = metadataInput(node => { node.identity('kind'); node.get('details').get('child'); });
    const result = comparePhaseCoverage(input); assert.equal(result.matched, false);
    assert.ok(result.components.read_edges.mismatches.some(e => e.dimension === 'reads' && e.missing.length));
    const extra = metadataInput(node => node.identity('kind'));
    extra.expected.required_nodes = []; extra.expected.required_reads = [];
    const invalid = comparePhaseCoverage(extra); assert.equal(invalid.matched, false);
    assert.ok(invalid.components.access_metadata.errors.some(e => e.code === 'identity_node_not_required'));
});

test('N02G:ACCESS-METADATA-006 authority rejects duplicate bindings, impossible record paths and malformed identities', () => {
    for (const mutate of [b => b.push(structuredClone(b[0])), b => { b[0].records.push(['details']); },
        b => { b[0].records = [[], ['details', 'child']]; }, b => { b[0].records = [['details']]; },
        b => { b[0].records.push([0]); }, b => { b[0].identity.version = 'invented'; },
        b => { b[0].identity.extra = true; }, b => { b[0].payload = {}; }]) {
        const input = structuredClone(metadataInput()); mutate(input.accessBindings);
        assert.throws(() => comparePhaseCoverage(input), /trace_coverage_/);
    }
    const missing = metadataInput(); missing.accessBindings = []; rejectedPhase(missing);
});

test('N02G:ACCESS-METADATA-007 reading a record as scalar or crossing its role is not hidden by another projection', () => {
    for (const outcome of [['scalar', 'forged'], ['absent'], ['container', 'sequence']]) {
        const input = structuredClone(metadataInput());
        input.trace.derivation_trace.find(e => e.outcome[0] === 'container').outcome = outcome;
        rejectedPhase(input);
    }
    const input = structuredClone(metadataInput()); input.trace.derivation_trace.at(-1).role = 'other';
    const result = comparePhaseCoverage(input); assert.equal(result.matched, false);
    assert.deepEqual(result.components.read_edges.mismatches, []);
});

test('N02G:ACCESS-METADATA-008 structural child access needs the same observed ancestors as scalar access', () => {
    for (const operation of ['has', 'keys']) {
        const input = metadataInput(node => {
            const child = node.get('details').get('child');
            if (operation === 'has') child.has('amount'); else child.keys();
        });
        input.expected.required_reads = [];
        input.expected.required_structural = [{ node: 'a', operation,
            segments: operation === 'has' ? ['details', 'child', 'amount'] : ['details', 'child'] }];
        assert.equal(comparePhaseCoverage(input).matched, true);
        for (const depth of [1, 2]) {
            const wrong = structuredClone(input);
            wrong.trace.derivation_trace = wrong.trace.derivation_trace.filter(e => !(e.operation === 'get' && e.path.length === depth));
            wrong.trace.derivation_trace.forEach((e, i) => { e.sequence = i; });
            const result = comparePhaseCoverage(wrong); assert.equal(result.matched, false);
            assert.deepEqual(result.components.read_edges.mismatches, []);
            assert.ok(result.components.access_metadata.errors.some(e => e.code === 'record_parent_missing'));
        }
    }
});

function civilInput(instant = '2042-06-15T02:59:59.999999999Z', phase = 'derivation', repeats = 1) {
    const recorder = createCausalRecorder({ executionId: 'execution-1', maxEvents: 100 });
    const scope = recorder.open({ invocationId: 'invocation-1', phase });
    const access = createInstrumentedAccess({ emit: scope.observe, bindings: [{ alias: 'a', role: 'source',
        value: { timestamp: instant }, shape: { type: 'record', fields: { timestamp: scalar } } }] });
    let date;
    for (let i = 0; i < repeats; i++) date = access.handle('a').civilDate('timestamp', 'America/Sao_Paulo', 'proleptic_gregorian');
    access.revoke(); access.assertHealthy(); scope.seal();
    const input = phaseInput(recorder.finish()); input.phase = phase;
    input.expected.required_reads = [{ node: 'a', segments: ['timestamp'] }];
    return { input, date };
}

test('N02G:CIVIL-COVERAGE-001 civil dates are recomputed at midnight, explicit offsets and historical DST boundaries', () => {
    for (const [instant, expected] of [
        ['2042-06-15T02:59:59.999999999Z', '2042-06-14'], ['2042-06-15T03:00:00Z', '2042-06-15'],
        ['2042-06-15T00:00:00-03:00', '2042-06-15'], ['2018-11-04T02:59:59Z', '2018-11-03'],
        ['2018-11-04T03:00:00Z', '2018-11-04'], ['2019-02-17T02:00:00Z', '2019-02-16'],
        ['2019-02-17T03:00:00Z', '2019-02-17']]) {
        const { input, date } = civilInput(instant); const before = JSON.stringify(input);
        assert.equal(date, expected);
        const result = comparePhaseCoverage(input); assert.equal(result.matched, true);
        assert.equal(result.graph_accepted, false); assert.equal(result.components.civil_dates.matched, true);
        assert.deepEqual(result.components.civil_dates.covered_sequences, [1]);
        assert.equal(result.event_coverage[0].component, 'read_edges');
        assert.equal(result.event_coverage[1].component, 'civil_dates');
        assert.equal(JSON.stringify(input), before);
    }
});

test('N02G:CIVIL-COVERAGE-002 conversion requires its fresh adjacent get, not a missing, stale, duplicated or substituted read', () => {
    for (const mutate of [
        rows => { rows.shift(); }, rows => { rows.reverse(); },
        rows => { rows.push(structuredClone(rows.at(-1))); },
        rows => { rows[0].outcome[1] = '2042-06-15T02:00:00Z'; },
        rows => { rows[0].outcome = ['absent']; },
        rows => { rows[0].alias = 'b'; }, rows => { rows[1].role = 'other'; },
        rows => { rows[1].path = ['other_timestamp']; },
        rows => { const extra = structuredClone(rows[0]); extra.path = ['other_timestamp']; rows.splice(1, 0, extra); }
    ]) {
        const input = structuredClone(civilInput().input); mutate(input.trace.derivation_trace);
        input.trace.derivation_trace.forEach((e, i) => { e.sequence = i; });
        const result = comparePhaseCoverage(input); assert.equal(result.matched, false);
        assert.ok(result.components.civil_dates.errors.some(e => e.code === 'civil_source'));
    }
});

test('N02G:CIVIL-COVERAGE-003 source and conversion cannot be borrowed from another phase or span a global sequence gap', () => {
    const { input } = civilInput();
    const mixed = structuredClone(input); const get = mixed.trace.derivation_trace.shift(); get.phase = 'proof'; mixed.trace.proof_trace.push(get);
    const result = comparePhaseCoverage(mixed); assert.equal(result.matched, false);
    assert.ok(result.components.civil_dates.errors.some(e => e.code === 'civil_source'));
    const gap = structuredClone(input); gap.trace.derivation_trace[1].sequence = 2;
    gap.trace.proof_trace.push({ ...structuredClone(gap.trace.derivation_trace[0]), sequence: 1, phase: 'proof' });
    assert.equal(comparePhaseCoverage(gap).components.civil_dates.matched, false);
    const proof = civilInput(undefined, 'proof').input;
    assert.equal(comparePhaseCoverage(proof).matched, true);
    proof.phase = 'derivation'; assert.equal(comparePhaseCoverage(proof).matched, false);
});

test('N02G:CIVIL-COVERAGE-004 date, instant, timezone and calendar adulteration cannot hide behind valid tuple shapes', () => {
    for (const date of ['2042-06-15', '2042-02-30']) {
        const input = structuredClone(civilInput().input); input.trace.derivation_trace[1].outcome[4] = date;
        const result = comparePhaseCoverage(input); assert.equal(result.matched, false);
        assert.ok(result.components.civil_dates.errors.some(e => e.code === 'civil_result'));
    }
    for (const instant of ['invalid', '2042-02-30T00:00:00Z', '2042-06-15T00:00:00']) {
        const input = structuredClone(civilInput().input);
        input.trace.derivation_trace[0].outcome[1] = instant; input.trace.derivation_trace[1].outcome[1] = instant;
        const result = comparePhaseCoverage(input); assert.equal(result.matched, false);
        assert.ok(result.components.civil_dates.errors.some(e => e.code === 'civil_conversion'));
    }
    for (const [index, value] of [[2, 'UTC'], [3, 'implicit']]) {
        const input = structuredClone(civilInput().input); input.trace.derivation_trace[1].outcome[index] = value;
        assert.throws(() => comparePhaseCoverage(input), /trace_coverage_entry/);
    }
});

test('N02G:CIVIL-COVERAGE-005 repeated legitimate conversions retain fresh reads and cannot discharge other requirements', () => {
    const { input } = civilInput(undefined, 'derivation', 2);
    const result = comparePhaseCoverage(input); assert.equal(result.matched, true);
    assert.deepEqual(result.components.civil_dates.covered_sequences, [1, 3]);
    assert.equal(input.trace.derivation_trace.length, 4);
    input.expected.required_reads.push({ node: 'a', segments: ['missing'] });
    const missing = comparePhaseCoverage(input); assert.equal(missing.matched, false);
    assert.equal(missing.components.civil_dates.matched, true);
});

test('N02G:CIVIL-COVERAGE-006 an untrusted timezone runtime prevents a civil component match', () => {
    const { input } = civilInput(); const previous = process.env.NODE_ICU_DATA;
    try {
        process.env.NODE_ICU_DATA = 'invalid-test-override';
        const result = comparePhaseCoverage(input); assert.equal(result.matched, false);
        assert.ok(result.components.civil_dates.errors.some(e => e.code === 'civil_conversion'));
    } finally {
        if (previous === undefined) delete process.env.NODE_ICU_DATA; else process.env.NODE_ICU_DATA = previous;
    }
});
