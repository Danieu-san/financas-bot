'use strict';
const { copyData, identifier, field, decodeObservation, decodeMeasurement } = require('./observationContract');

const fail = code => { throw new Error(`trace_coverage_${code}`); };
function exactKeys(value, names) {
    return value && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value).sort().join(',') === [...names].sort().join(',');
}
function expectedSet(values, convert) {
    if (!Array.isArray(values)) fail('expected');
    const result = new Map();
    for (const value of values) {
        const converted = convert(value); const key = JSON.stringify(converted);
        if (result.has(key)) fail('expected_duplicate');
        result.set(key, converted);
    }
    return result;
}
function expectedId(value) { if (!identifier(value)) fail('expected'); return value; }
function expectedPath(value) {
    if (!Array.isArray(value) || !value.length || !value.every(field)) fail('expected');
    return value;
}

function scopedTrace(trace, executionId, invocationId) {
    if (!exactKeys(trace, ['stage', 'execution_id', 'derivation_trace', 'proof_trace'])
        || trace.stage !== 'observations_only' || trace.execution_id !== executionId) fail('identity');
    const all = [];
    for (const phase of ['derivation', 'proof']) {
        const entries = trace[`${phase}_trace`];
        if (!Array.isArray(entries)) fail('entries');
        let previous = -1;
        for (const entry of entries) {
            if (!entry || entry.phase !== phase || entry.invocation_id !== invocationId
                || !Number.isSafeInteger(entry.sequence) || entry.sequence <= previous) fail('scope');
            previous = entry.sequence;
            const observation = exactKeys(entry, ['sequence', 'invocation_id', 'phase', 'operation', 'alias', 'role', 'path', 'projection', 'outcome']);
            const measurement = exactKeys(entry, ['sequence', 'invocation_id', 'phase', 'measurement', 'observed']);
            try {
                if (observation) decodeObservation(['I', entry.operation, entry.alias, entry.role, entry.path, entry.projection, entry.outcome]);
                else if (measurement) decodeMeasurement(['M', entry.measurement, entry.observed]);
                else fail('entry');
            } catch { fail('entry'); }
            all.push(entry);
        }
    }
    all.sort((a, b) => a.sequence - b.sequence);
    if (all.some((entry, i) => entry.sequence !== i)) fail('sequence');
    return all;
}

// Host-side validator of a single invocation's recorder output. This component
// does not authenticate the host/TCB, issue parent receipts or accept graphs.
// Unclassified identity/operand-set/measurement events prevent even its local
// match; subsequent integration must classify them explicitly, never drop them.
function compareReadEdgeCoverage(input) {
    let args;
    try { args = copyData(input); } catch { fail('input'); }
    if (!exactKeys(args, ['trace', 'expected', 'executionId', 'invocationId', 'phase'])
        || !identifier(args.executionId) || !identifier(args.invocationId)
        || !['derivation', 'proof'].includes(args.phase)) fail('input');
    const { trace, expected } = args;
    if (!exactKeys(expected, ['required_nodes', 'required_reads', 'required_claim_reads', 'required_edges', 'required_structural'])) fail('expected');
    const expectations = {
        nodes: expectedSet(expected.required_nodes, expectedId),
        reads: expectedSet(expected.required_reads, r => {
            if (!exactKeys(r, ['node', 'segments'])) fail('expected');
            return [expectedId(r.node), expectedPath(r.segments)];
        }),
        claim_reads: expectedSet(expected.required_claim_reads, r => {
            if (!exactKeys(r, ['segments'])) fail('expected');
            return expectedPath(r.segments);
        }),
        edges: expectedSet(expected.required_edges, expectedId),
        structural: expectedSet(expected.required_structural, r => {
            if (!exactKeys(r, ['node', 'operation', 'segments'])
                || !['has', 'keys', 'iterator', 'index', 'order', 'membership', 'cardinality', 'length', 'selection', 'traversal', 'early_termination'].includes(r.operation)
                || !Array.isArray(r.segments) || !r.segments.every(field)) fail('expected');
            return [expectedId(r.node), r.operation, r.segments];
        })
    };
    const all = scopedTrace(trace, args.executionId, args.invocationId);
    const observed = Object.fromEntries(Object.keys(expectations).map(k => [k, new Map()]));
    const add = (dimension, value) => observed[dimension].set(JSON.stringify(value), value);
    const unclassified = [];
    const containers = new Set(); const iterators = new Map(); const keyViews = new Map();
    const containerKey = (e, path = e.path) => JSON.stringify([e.alias, e.role, e.projection, path]);
    function structural(e, operation, path = e.path) {
        add('nodes', e.alias); add('structural', [e.alias, operation, path]);
    }
    function consumeSequence(e) {
        const indexed = ['next', 'at'].includes(e.operation);
        const path = indexed ? e.path.slice(0, -1) : e.path;
        if (!path.every(field) || indexed && !Number.isSafeInteger(e.path.at(-1))) return false;
        const key = containerKey(e, path); const keys = e.projection === 'keys';
        if (!containers.has(key)) return false;
        if (keys) structural(e, 'keys', path);
        switch (e.operation) {
        case 'iterate':
            if (iterators.has(key) && !iterators.get(key).closed) return false;
            iterators.set(key, { cursor: 0, closed: false, exhausted: false });
            if (!keys) structural(e, 'iterator', path);
            return true;
        case 'next': {
            const iterator = iterators.get(key);
            if (!iterator || e.path.at(-1) !== iterator.cursor) return false;
            if (e.outcome[0] === 'done') {
                // After return(), next() reports done without consulting the
                // remaining members. Only natural exhaustion proves coverage.
                if (!iterator.closed) iterator.exhausted = true;
                if (keys && iterator.exhausted && iterator.cursor !== keyViews.get(key).length) return false;
                iterator.closed = true;
                if (!keys && iterator.exhausted) { structural(e, 'order', path); structural(e, 'cardinality', path); }
            } else {
                if (iterator.closed || e.outcome[0] !== 'scalar') return false;
                if (keys && e.outcome[1] !== keyViews.get(key)[iterator.cursor]) return false;
                iterator.cursor++;
            }
            return true;
        }
        case 'return': {
            const iterator = iterators.get(key);
            if (!iterator || e.outcome[1] !== iterator.cursor) return false;
            if (!iterator.closed && !keys) structural(e, 'early_termination', path);
            iterator.closed = true; return true;
        }
        case 'reuse_iterator': {
            const iterator = iterators.get(key);
            return !!iterator && e.outcome[1] === iterator.cursor && e.outcome[2] === iterator.closed;
        }
        case 'length':
            if (keys && e.outcome[1] !== keyViews.get(key).length) return false;
            if (!keys) structural(e, 'cardinality', path);
            return true;
        case 'includes':
            if (keys && e.outcome[2] !== keyViews.get(key).includes(e.outcome[1])) return false;
            if (!keys) structural(e, 'membership', path);
            return true;
        case 'at':
            if (keys) {
                const list = keyViews.get(key); const index = e.path.at(-1);
                if (index < list.length ? e.outcome[0] !== 'scalar' || e.outcome[1] !== list[index] : e.outcome[0] !== 'absent') return false;
            } else structural(e, 'index', path);
            return true;
        default: return false;
        }
    }
    for (const entry of all.filter(e => e.phase === args.phase)) {
        if (entry.operation === 'traverse') {
            add('edges', entry.outcome[1]);
        } else if (entry.operation === 'get' && entry.projection === 'data'
            && entry.path.length && entry.path.every(field)
            && (['scalar', 'absent'].includes(entry.outcome[0]) || entry.outcome[0] === 'container' && entry.outcome[1] === 'sequence')) {
            if (entry.alias === 'claim/context') add('claim_reads', entry.path);
            else { add('nodes', entry.alias); add('reads', [entry.alias, entry.path]); }
            if (entry.outcome[0] === 'container') containers.add(containerKey(entry));
        } else if (entry.alias !== 'claim/context' && entry.projection === 'data' && entry.path.every(field)
            && ['has', 'keys'].includes(entry.operation)) {
            structural(entry, entry.operation);
            if (entry.operation === 'keys') {
                const key = containerKey({ ...entry, projection: 'keys' });
                containers.add(key); keyViews.set(key, entry.outcome.slice(1));
            }
        } else if (entry.alias !== 'claim/context' && ['data', 'keys'].includes(entry.projection) && consumeSequence(entry)) {
            // Structural coverage is computed from actual iterator lifecycle.
        } else {
            unclassified.push({ sequence: entry.sequence, operation: entry.operation || entry.measurement });
        }
    }
    const mismatches = [];
    for (const dimension of Object.keys(expectations)) {
        const wanted = expectations[dimension]; const actual = observed[dimension];
        const missing = [...wanted.keys()].filter(k => !actual.has(k)).sort().map(k => wanted.get(k));
        const extra = [...actual.keys()].filter(k => !wanted.has(k)).sort().map(k => actual.get(k));
        if (missing.length || extra.length) mismatches.push({ dimension, missing, extra });
    }
    return copyData({ stage: 'read_edge_coverage_only', graph_accepted: false,
        matched: mismatches.length === 0 && unclassified.length === 0, mismatches, unclassified });
}

// Selection-only projection. `bindings` is a host-side association resolved
// before execution from the admitted operand/graph identities, never guessed
// from the selected outcome. This does not validate reads, predicates or R.
function compareSelectionCoverage(input) {
    let args;
    try { args = copyData(input); } catch { fail('input'); }
    if (!exactKeys(args, ['trace', 'expected', 'executionId', 'invocationId', 'phase', 'bindings', 'sets'])
        || !identifier(args.executionId) || !identifier(args.invocationId)
        || !['derivation', 'proof'].includes(args.phase) || !Array.isArray(args.bindings)
        || !args.sets || typeof args.sets !== 'object' || Array.isArray(args.sets)
        || !exactKeys(args.expected, ['required_selections', 'selected_nodes'])) fail('selection_input');
    const all = scopedTrace(args.trace, args.executionId, args.invocationId);
    const pair = value => {
        if (!exactKeys(value, ['candidate_set', 'selected_set'])) fail('selection_expected');
        return [expectedId(value.candidate_set), expectedId(value.selected_set)];
    };
    const required = expectedSet(args.expected.required_selections, pair);
    const selectedExpected = expectedSet(args.expected.selected_nodes, expectedId);
    const sets = new Map(Object.entries(args.sets).map(([name, members]) =>
        [expectedId(name), [...expectedSet(members, expectedId).values()]]));
    const bound = new Map(); const boundPairs = new Set();
    for (const b of args.bindings) {
        if (!exactKeys(b, ['role', 'candidate_set', 'selected_set']) || !identifier(b.role)
            || !identifier(b.candidate_set) || !identifier(b.selected_set)
            || !sets.has(b.candidate_set) || !sets.has(b.selected_set)) fail('selection_binding');
        const key = JSON.stringify([b.candidate_set, b.selected_set]);
        if (bound.has(b.role) || boundPairs.has(key)) fail('selection_binding_duplicate');
        if (!required.has(key)) fail('selection_binding_unexpected');
        boundPairs.add(key);
        bound.set(b.role, { binding: b, key, candidates: sets.get(b.candidate_set),
            state: 'pending', cursor: 0, awaitingDecision: false, selected: [], completed: false });
    }
    if (boundPairs.size !== required.size) fail('selection_binding_missing');
    const authoredUnion = new Set();
    for (const [candidate, selected] of required.values()) {
        if (!sets.has(candidate) || !sets.has(selected)
            || sets.get(selected).some(alias => !sets.get(candidate).includes(alias))) fail('selection_expected');
        for (const alias of sets.get(selected)) authoredUnion.add(JSON.stringify(alias));
    }
    if (authoredUnion.size !== selectedExpected.size || [...authoredUnion].some(key => !selectedExpected.has(key))) fail('selection_union');
    const errors = []; const completed = new Map(); const observedUnion = new Set();
    const error = (entry, code) => errors.push({ sequence: entry.sequence, code });
    for (const entry of all.filter(e => e.phase === args.phase)) {
        if (!['operand_set', 'operand_selection'].includes(entry.projection)) continue;
        const selectionOperation = entry.operation.startsWith('select_');
        const state = bound.get(entry.role);
        if (!state) { if (selectionOperation) error(entry, 'unbound_selection'); continue; }
        if (entry.projection === 'operand_selection') {
            if (selectionOperation || !state.completed || entry.path[0] !== state.viewId) error(entry, 'unknown_selected_view');
            continue;
        }
        switch (entry.operation) {
        case 'select_start':
            if (state.state !== 'pending') { error(entry, 'repeated_selection'); break; }
            state.state = 'running'; break;
        case 'at':
            if (state.state !== 'running') break;
            if (state.awaitingDecision || entry.path[0] !== state.cursor
                || state.cursor >= state.candidates.length || entry.outcome[0] !== 'node'
                || entry.outcome[1] !== state.candidates[state.cursor]) { error(entry, 'candidate_access'); break; }
            state.awaitingDecision = true; break;
        case 'select_member':
            if (state.state !== 'running' || !state.awaitingDecision || entry.path[0] !== state.cursor
                || entry.outcome[1] !== state.candidates[state.cursor]) { error(entry, 'candidate_decision'); break; }
            if (entry.outcome[2]) state.selected.push(entry.outcome[1]);
            state.cursor++; state.awaitingDecision = false; break;
        case 'select_return': {
            if (state.state !== 'running' || state.awaitingDecision || state.cursor !== state.candidates.length
                || JSON.stringify(entry.outcome.slice(2)) !== JSON.stringify(state.selected)) { error(entry, 'selection_return'); break; }
            state.state = 'complete'; state.completed = true; state.viewId = entry.outcome[1];
            completed.set(state.key, state.selected);
            for (const alias of state.selected) observedUnion.add(alias);
            break;
        }
        default:
            if (state.state === 'running') error(entry, 'unexpected_selection_operation');
        }
    }
    const mismatches = [];
    for (const [key, [candidate_set, selected_set]] of required) {
        const actual = completed.get(key);
        if (!actual) { mismatches.push({ candidate_set, selected_set, reason: 'selection_missing' }); continue; }
        const expected = new Set(sets.get(selected_set)); const members = new Set(actual);
        const missing = [...expected].filter(alias => !members.has(alias)).sort();
        const extra = [...members].filter(alias => !expected.has(alias)).sort();
        if (missing.length || extra.length) mismatches.push({ candidate_set, selected_set, reason: 'selection_members', missing, extra });
    }
    const actualIds = [...observedUnion].sort();
    const expectedIds = [...selectedExpected.values()].sort();
    if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) mismatches.push({ reason: 'selected_nodes', actual: actualIds, expected: expectedIds });
    return copyData({ stage: 'selection_coverage_only', graph_accepted: false,
        matched: errors.length === 0 && mismatches.length === 0, errors, mismatches, selected_nodes: actualIds });
}

module.exports = { compareReadEdgeCoverage, compareSelectionCoverage };
