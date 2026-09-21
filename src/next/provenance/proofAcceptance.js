'use strict';
const { copyData, identifier, field, decodeObservation, decodeMeasurement } = require('./observationContract');
const { civilDateInPinnedTimezone } = require('./pinnedCivilTimezone');

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
    const unclassified = []; const covered = [];
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
            continue;
        }
        covered.push(entry.sequence);
    }
    const mismatches = [];
    for (const dimension of Object.keys(expectations)) {
        const wanted = expectations[dimension]; const actual = observed[dimension];
        const missing = [...wanted.keys()].filter(k => !actual.has(k)).sort().map(k => wanted.get(k));
        const extra = [...actual.keys()].filter(k => !wanted.has(k)).sort().map(k => actual.get(k));
        if (missing.length || extra.length) mismatches.push({ dimension, missing, extra });
    }
    return copyData({ stage: 'read_edge_coverage_only', graph_accepted: false,
        matched: mismatches.length === 0 && unclassified.length === 0, mismatches, unclassified, covered_sequences: covered });
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
    const errors = []; const completed = new Map(); const observedUnion = new Set(); const covered = [];
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
            state.state = 'running'; covered.push(entry.sequence); break;
        case 'at':
            if (state.state !== 'running') break;
            if (state.awaitingDecision || entry.path[0] !== state.cursor
                || state.cursor >= state.candidates.length || entry.outcome[0] !== 'node'
                || entry.outcome[1] !== state.candidates[state.cursor]) { error(entry, 'candidate_access'); break; }
            state.awaitingDecision = true; covered.push(entry.sequence); break;
        case 'select_member':
            if (state.state !== 'running' || !state.awaitingDecision || entry.path[0] !== state.cursor
                || entry.outcome[1] !== state.candidates[state.cursor]) { error(entry, 'candidate_decision'); break; }
            if (entry.outcome[2]) state.selected.push(entry.outcome[1]);
            state.cursor++; state.awaitingDecision = false; covered.push(entry.sequence); break;
        case 'select_return': {
            if (state.state !== 'running' || state.awaitingDecision || state.cursor !== state.candidates.length
                || JSON.stringify(entry.outcome.slice(2)) !== JSON.stringify(state.selected)) { error(entry, 'selection_return'); break; }
            state.state = 'complete'; state.completed = true; state.viewId = entry.outcome[1];
            completed.set(state.key, state.selected);
            for (const alias of state.selected) observedUnion.add(alias);
            covered.push(entry.sequence);
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
        matched: errors.length === 0 && mismatches.length === 0, errors, mismatches, selected_nodes: actualIds,
        covered_sequences: covered });
}

// Internal component: receives only the selection verdict recomputed below,
// never a caller's certificate. Rosters are admitted role bindings supplied
// BEFORE execution, not inferred from observations or selected members.
function compareOperandConsumption(args, selection) {
    if (!Array.isArray(args.operandSets)) fail('operand_bindings');
    const rosters = new Map(); const views = new Map();
    const key = (role, view = null) => JSON.stringify([role, view]);
    for (const binding of args.operandSets) {
        if (!exactKeys(binding, ['role', 'aliases']) || !identifier(binding.role)
            || !identifier(`operand/${binding.role}`) || !Array.isArray(binding.aliases)
            || binding.aliases.length > 512 || rosters.has(binding.role)) fail('operand_bindings');
        const aliases = [...expectedSet(binding.aliases, expectedId).values()];
        rosters.set(binding.role, aliases);
        views.set(key(binding.role), { aliases, iterator: null });
    }
    for (const binding of args.bindings) {
        if (JSON.stringify(rosters.get(binding.role)) !== JSON.stringify(args.sets[binding.candidate_set])) fail('operand_binding');
    }
    const selectionEvents = new Set(selection.covered_sequences);
    const covered = []; const errors = [];
    const error = (entry, code) => errors.push({ sequence: entry.sequence, code });
    const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
    for (const entry of args.trace[`${args.phase}_trace`]) {
        if (!['operand_set', 'operand_selection'].includes(entry.projection)) continue;
        if (selectionEvents.has(entry.sequence)) {
            if (entry.operation === 'select_return' && selection.matched) {
                views.set(key(entry.role, entry.outcome[1]), { aliases: entry.outcome.slice(2), iterator: null });
            }
            continue; // Selection owns its lifecycle, including candidate at().
        }
        if (entry.operation.startsWith('select_')) continue; // Invalid lifecycle remains an error of selection.
        const selected = entry.projection === 'operand_selection';
        const view = views.get(key(entry.role, selected ? entry.path[0] : null));
        if (!view) { error(entry, selected ? 'unknown_selected_view' : 'unknown_operand_role'); continue; }
        const { aliases } = view; const path = selected ? entry.path.slice(1) : entry.path;
        let valid = false;
        switch (entry.operation) {
        case 'length': valid = same(entry.outcome, ['count', aliases.length]); break;
        case 'includes': valid = same(entry.outcome, ['membership', entry.outcome[1], aliases.includes(entry.outcome[1])]); break;
        case 'at': valid = same(entry.outcome, path[0] < aliases.length ? ['node', aliases[path[0]]] : ['absent']); break;
        case 'iterate':
            // The wire format has no iterator IDs. Never guess the origin of
            // events from concurrent iterators on the same role/view.
            if (view.iterator && !view.iterator.closed) { error(entry, 'ambiguous_iterator'); continue; }
            view.iterator = { cursor: 0, closed: false }; valid = true; break;
        case 'next': {
            const iterator = view.iterator;
            if (!iterator || path[0] !== iterator.cursor) break;
            const done = iterator.closed || iterator.cursor === aliases.length;
            valid = same(entry.outcome, done ? ['done'] : ['node', aliases[iterator.cursor]]);
            if (valid) { if (done) iterator.closed = true; else iterator.cursor++; }
            break;
        }
        case 'return':
            valid = !!view.iterator && same(entry.outcome, ['closed', view.iterator.cursor]);
            if (valid) view.iterator.closed = true;
            break;
        case 'reuse_iterator':
            valid = !!view.iterator && same(entry.outcome, ['cursor', view.iterator.cursor, view.iterator.closed]); break;
        default: break;
        }
        if (valid) covered.push(entry.sequence); else error(entry, 'operand_operation');
    }
    return copyData({ stage: 'operand_consumption_only', graph_accepted: false,
        matched: errors.length === 0, errors, covered_sequences: covered });
}

// Authority here is host-supplied admitted metadata, not the observed values.
// This checks consistency only; it does not authenticate that host/TCB.
function compareAccessMetadata(args) {
    if (!Array.isArray(args.accessBindings)) fail('access_bindings');
    const bindings = new Map();
    const key = (alias, role) => JSON.stringify([alias, role]);
    for (const binding of args.accessBindings) {
        if (!exactKeys(binding, ['alias', 'role', 'identity', 'records']) || !identifier(binding.alias)
            || !identifier(binding.role) || bindings.has(key(binding.alias, binding.role))) fail('access_bindings');
        if (binding.identity !== null) {
            if (!exactKeys(binding.identity, ['kind', 'ref_id', 'version'])) fail('access_identity');
            for (const name of ['kind', 'ref_id', 'version']) {
                try { decodeObservation(['I', 'identity', binding.alias, binding.role, [name], 'node_identity', ['scalar', binding.identity[name]]]); }
                catch { fail('access_identity'); }
            }
        }
        const records = expectedSet(binding.records, path => {
            if (!Array.isArray(path) || !path.every(field)) fail('access_records');
            return path;
        });
        if (!records.has('[]') || [...records.values()].some(path => path.length && !records.has(JSON.stringify(path.slice(0, -1))))) fail('access_records');
        bindings.set(key(binding.alias, binding.role), { ...binding, records, opened: new Set(['[]']) });
    }
    const errors = []; const covered = [];
    const error = (entry, code) => errors.push({ sequence: entry.sequence, code });
    for (const entry of args.trace[`${args.phase}_trace`]) {
        const isIdentity = entry.projection === 'node_identity';
        const isRecordAccess = entry.projection === 'data' && ['get', 'has', 'keys'].includes(entry.operation) && entry.path.every(field);
        if (!isIdentity && !isRecordAccess) continue;
        const binding = bindings.get(key(entry.alias, entry.role));
        if (!binding) { error(entry, 'unknown_access_binding'); continue; }
        if (isIdentity) {
            if (!binding.identity || binding.identity[entry.path[0]] !== entry.outcome[1]) error(entry, 'identity_mismatch');
            else if (!args.expected.required_nodes.includes(entry.alias)) error(entry, 'identity_node_not_required');
            else covered.push(entry.sequence);
            continue;
        }
        const parent = entry.operation === 'keys' ? entry.path : entry.path.slice(0, -1);
        if (entry.operation !== 'keys' && !entry.path.length || !binding.opened.has(JSON.stringify(parent))) {
            error(entry, 'record_parent_missing'); continue;
        }
        if (entry.operation !== 'get') continue; // Structural coverage remains with reads/edges.
        const pathKey = JSON.stringify(entry.path);
        const isRecord = entry.outcome[0] === 'container' && entry.outcome[1] === 'record';
        if (isRecord !== binding.records.has(pathKey)) { error(entry, 'record_shape'); continue; }
        if (!isRecord) continue; // The read/edge component owns the leaf/sequence event.
        const required = entry.alias === 'claim/context' ? args.expected.required_claim_reads
            : args.expected.required_reads.filter(read => read.node === entry.alias);
        const structural = args.expected.required_structural.filter(read => read.node === entry.alias);
        const descends = read => read.segments.length > entry.path.length
            && entry.path.every((segment, i) => segment === read.segments[i]);
        if (!required.some(descends) && !structural.some(read => descends(read)
            || read.operation === 'keys' && JSON.stringify(read.segments) === pathKey)) {
            error(entry, 'record_not_required'); continue;
        }
        binding.opened.add(pathKey); covered.push(entry.sequence);
    }
    return copyData({ stage: 'access_metadata_only', graph_accepted: false,
        matched: errors.length === 0, errors, covered_sequences: covered });
}

function compareCivilDates(args) {
    const entries = args.trace[`${args.phase}_trace`]; const covered = []; const errors = [];
    const error = (entry, code) => errors.push({ sequence: entry.sequence, code });
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (entry.operation !== 'civil_date') continue;
        const source = entries[i - 1];
        // The instrumented primitive emits get immediately before civil_date.
        // Do not reuse an older read, normalize its instant string or borrow a
        // read from a different role, path, invocation, phase or global position.
        if (!source || source.sequence + 1 !== entry.sequence || source.operation !== 'get'
            || source.projection !== 'data' || source.alias !== entry.alias || source.role !== entry.role
            || JSON.stringify(source.path) !== JSON.stringify(entry.path)
            || source.outcome[0] !== 'scalar' || source.outcome[1] !== entry.outcome[1]) {
            error(entry, 'civil_source'); continue;
        }
        let date;
        try { date = civilDateInPinnedTimezone(source.outcome[1], entry.outcome[2], entry.outcome[3]); }
        catch { error(entry, 'civil_conversion'); continue; }
        if (date !== entry.outcome[4]) { error(entry, 'civil_result'); continue; }
        covered.push(entry.sequence);
    }
    return copyData({ stage: 'civil_conversion_only', graph_accepted: false,
        matched: errors.length === 0, errors, covered_sequences: covered });
}

// Compose only events actually checked by the components, never their ignored
// projections or caller-supplied verdicts. A local phase match is NOT graph
// acceptance: predicates, host identity, measurements and receipts remain out
// of scope. Civil conversion checks the pinned runtime, not its binary root.
// Roster consumption and metadata consistency are distinct from
// payload structural coverage: it cannot discharge a snapshot's required reads.
function comparePhaseCoverage(input) {
    let args;
    try { args = copyData(input); } catch { fail('input'); }
    if (!exactKeys(args, ['trace', 'expected', 'executionId', 'invocationId', 'phase', 'sets', 'bindings', 'operandSets', 'accessBindings'])) fail('input');
    const readKeys = ['required_nodes', 'required_reads', 'required_claim_reads', 'required_edges', 'required_structural'];
    const selectionKeys = ['required_selections', 'selected_nodes'];
    if (!exactKeys(args.expected, [...readKeys, ...selectionKeys])) fail('expected');
    const scope = { trace: args.trace, executionId: args.executionId, invocationId: args.invocationId, phase: args.phase };
    const project = keys => Object.fromEntries(keys.map(key => [key, args.expected[key]]));
    const readEdges = compareReadEdgeCoverage({ ...scope, expected: project(readKeys) });
    const selection = compareSelectionCoverage({ ...scope, expected: project(selectionKeys), sets: args.sets, bindings: args.bindings });
    const operandSets = compareOperandConsumption(args, selection);
    const accessMetadata = compareAccessMetadata(args);
    const civilDates = compareCivilDates(args);
    const components = { read_edges: readEdges, selection, operand_sets: operandSets, access_metadata: accessMetadata, civil_dates: civilDates };
    const owners = Object.entries(components).map(([name, component]) => ({ name,
        covered: new Set(component.covered_sequences), invalid: new Set((component.errors || []).map(e => e.sequence)) }));
    // Both components have already admitted the complete, identical trace and
    // execution/invocation/phase scope. Preserve every event's original index.
    const eventCoverage = args.trace[`${args.phase}_trace`].map(entry => {
        const sequence = entry.sequence;
        const covering = owners.filter(owner => owner.covered.has(sequence));
        if (covering.length > 1) fail('projection_overlap');
        const invalid = owners.find(owner => owner.invalid.has(sequence));
        if (invalid) return { sequence, status: 'invalid', component: invalid.name };
        if (covering.length) return { sequence, status: 'covered', component: covering[0].name };
        return { sequence, status: 'unsupported', component: 'none' };
    });
    // readEdges.matched also requires standalone classification of every event;
    // composition discharges those events only via an explicit second owner.
    // Its missing/extra requirements and selection errors remain binding.
    return copyData({ stage: 'phase_coverage_only', graph_accepted: false,
        matched: readEdges.mismatches.length === 0 && selection.matched && operandSets.matched && accessMetadata.matched && civilDates.matched
            && eventCoverage.every(e => e.status === 'covered'),
        components, event_coverage: eventCoverage });
}

module.exports = { compareReadEdgeCoverage, compareSelectionCoverage, comparePhaseCoverage };
