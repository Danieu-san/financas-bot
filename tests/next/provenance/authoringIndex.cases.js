'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { admitPackage } = require('../../../src/next/provenance/packageContract');
const { compileAuthoringIndex, compileAuthoringIR, compileSnapshotAccess } = require('../../../src/next/provenance/graphCompiler');
const { lowerAuthoringIR } = require('../../../src/next/provenance/authoringIR');
const root = path.resolve(__dirname, '../../..');
const prefix = 'docs/contracts/next/provenance-v2/';
const graphPath = prefix + 'graphs-v2.json';
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function fixture() {
    const byPath = new Map();
    function add(file) {
        if (byPath.has(file)) return JSON.parse(byPath.get(file).bytes);
        // This test reconstructs the LF-published JSON fixture on Windows.
        // The admission module itself never performs line-ending normalization.
        const bytes = Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n'));
        byPath.set(file, { path: file, bytes });
        return JSON.parse(bytes);
    }
    const graphs = add(graphPath);
    add(prefix + 'predicate-templates-v1.json');
    add(prefix + 'claim-contract.schema.json');
    add(prefix + 'evidence-snapshot.schema.json');
    for (const field of ['claim_contract', 'snapshot_manifest', 'material_registry', 'operator_registry', 'metric_evaluator_registry']) add(graphs[field].path);
    for (const source of add(graphs.snapshot_manifest.path).sources) add(source.path);
    for (const entry of add(graphs.metric_evaluator_registry.path).entries) add(entry.contract_path);
    for (const graph of graphs.graphs) for (const source of graph.authoring_sources) add(source.path);
    const entries = [...byPath.values()];
    return { entries, authority: entries.map(({ path, bytes }) => ({ path, sha256: hash(bytes) })) };
}
async function validators() {
    const builder = await import(pathToFileURL(path.join(root, 'scripts/agent/buildNextProvenanceArtifacts.mjs')));
    return builder.buildSchemaValidators().validators;
}

let accessFixture;
function snapshotAccessFixture() {
    accessFixture ||= (async () => {
        const f = fixture(); const admitted = admitPackage(f);
        const documents = new Map(admitted.documents.map(d => [d.path, d.value]));
        const graphs = documents.get(graphPath);
        const claims = documents.get(graphs.claim_contract.path).claims;
        const snapshots = documents.get(graphs.snapshot_manifest.path).snapshots;
        const registry = documents.get(graphs.material_registry.path);
        const plan = compileSnapshotAccess(admitted, await validators());
        const ir = compileAuthoringIR(admitted, await validators());
        const operators = documents.get(graphs.operator_registry.path).operators;
        // Subsequent caller mutation of input bytes cannot retarget a handle.
        for (const entry of f.entries) entry.bytes.fill(0);
        return { plan, graphs: graphs.graphs, claims, snapshots, registry, ir, operators };
    })();
    return accessFixture;
}

test('N02G:OBSERVED-METRIC-001 consumption roles select independently of graph expectations and oracle', async () => {
    const { evaluateEconomicMetric } = require('../../../src/next/provenance/metricSelection');
    const { createCausalRecorder } = require('../../../src/next/provenance/causalRecorder');
    const oracle = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8'));
    const { plan, claims, graphs } = await snapshotAccessFixture(); let checked = 0;
    const modes = { consumption_total: 'total', category_consumption: 'category', category_spent: 'spent',
        income_realized: 'income', consumption_by_instrument: 'instrument', budget_class_consumption: 'budget_class',
        category_budget_remaining: 'budget_remaining', statement_total: 'statement', safe_daily_pace: 'safe_pace' };
    for (const claim of claims.filter(c => Object.hasOwn(modes, c.metric))) {
        const recorder = createCausalRecorder({ executionId: `consumption-${checked}`, maxEvents: 10000 });
        const phase = recorder.open({ invocationId: claim.fact_key, phase: 'derivation' });
        const controls = []; const operands = {};
        for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
            const selector = { fact_key: claim.fact_key, role_id };
            const access = binding.kind === 'claim_context' ? plan.openContext(selector, phase.observe)
                : binding.kind === 'node_set' ? plan.openSet(selector, phase.observe)
                    : plan.open({ ...selector, alias: binding.alias }, phase.observe);
            controls.push(access); operands[role_id] = access.handle;
        }
        const result = evaluateEconomicMetric(Object.freeze(operands), modes[claim.metric]);
        for (const access of controls) { access.revoke(); access.assertHealthy(); }
        phase.seal(); const trace = recorder.finish().derivation_trace;
        const split = claim.fact_key.lastIndexOf('#');
        const expected = oracle.turns[claim.fact_key.slice(0, split)].facts[Number(claim.fact_key.slice(split + 1)) - 1];
        assert.equal(expected.metric, claim.metric);
        assert.equal(result, expected.value, claim.fact_key);
        const graph = graphs.find(g => g.fact_key === claim.fact_key);
        const decisions = trace.filter(e => e.operation === 'select_member');
        assert.equal(decisions.length, claim.operand_bindings.events.aliases.length);
        const selected = decisions.filter(e => e.outcome[2]).map(e => e.outcome[1]);
        assert.deepEqual(selected, graph.sets[graph.selections[0].selected_set], claim.fact_key);
        assert.ok(trace.some(e => e.operation === 'traverse'));
        checked++;
    }
    assert.equal(checked, 31);
});

test('N02G:OBSERVED-METRIC-002 direct reads preserve values and identities through admitted roles', async () => {
    const { evaluateDirectMetric } = require('../../../src/next/provenance/metricDirectReads');
    const oracle = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8'));
    const { plan, claims } = await snapshotAccessFixture(); let checked = 0;
    const supported = ['balance_delta', 'invoice_payment_amount', 'invoice_payment_target_card', 'statement_payment_correspondence',
        'source_coverage', 'owned_cards', 'merchant_rule_ids', 'eligible_event_count', 'side_effect_count',
        'bills_open', 'due_bill_ids', 'due_bills_total', 'reminder_count', 'calendar_event_count', 'similar_event_ids',
        'account_balance', 'movement_ids'];
    for (const claim of claims.filter(c => supported.includes(c.metric))) {
        const controls = []; const operands = {}; const events = [];
        for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
            const selector = { fact_key: claim.fact_key, role_id }; const observe = e => events.push(e);
            const access = binding.kind === 'claim_context' ? plan.openContext(selector, observe)
                : binding.kind === 'node_set' ? plan.openSet(selector, observe)
                    : plan.open({ ...selector, alias: binding.alias }, observe);
            controls.push(access); operands[role_id] = access.handle;
        }
        const result = evaluateDirectMetric(Object.freeze(operands), claim.metric);
        for (const access of controls) { access.revoke(); access.assertHealthy(); }
        const split = claim.fact_key.lastIndexOf('#');
        const expected = oracle.turns[claim.fact_key.slice(0, split)].facts[Number(claim.fact_key.slice(split + 1)) - 1];
        assert.equal(expected.metric, claim.metric); assert.deepEqual(result, expected.value, claim.fact_key);
        assert.ok(events.some(e => e[1] === 'get'));
        checked++;
    }
    assert.equal(checked, 21);
});

test('N02G:OBSERVED-METRIC-003 installment selection is independently observed for each state and period', async () => {
    const { evaluateInstallments } = require('../../../src/next/provenance/metricInstallments');
    const oracle = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8'));
    const { plan, claims, graphs } = await snapshotAccessFixture(); let checked = 0;
    const supported = ['installments_realized', 'installments_realized_amount', 'installments_projected', 'installments_projected_amount', 'projected_installments'];
    for (const claim of claims.filter(c => supported.includes(c.metric))) {
        const controls = []; const operands = {}; const observations = [];
        for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
            const selector = { fact_key: claim.fact_key, role_id }; const observe = e => observations.push(e);
            const access = binding.kind === 'claim_context' ? plan.openContext(selector, observe)
                : binding.kind === 'node_set' ? plan.openSet(selector, observe)
                    : plan.open({ ...selector, alias: binding.alias }, observe);
            controls.push(access); operands[role_id] = access.handle;
        }
        const result = evaluateInstallments(Object.freeze(operands), claim.metric);
        for (const access of controls) { access.revoke(); access.assertHealthy(); }
        const split = claim.fact_key.lastIndexOf('#');
        const expected = oracle.turns[claim.fact_key.slice(0, split)].facts[Number(claim.fact_key.slice(split + 1)) - 1];
        assert.equal(expected.metric, claim.metric); assert.equal(result, expected.value, claim.fact_key);
        const graph = graphs.find(g => g.fact_key === claim.fact_key);
        const decisions = observations.filter(e => e[1] === 'select_member');
        assert.equal(decisions.length, claim.operand_bindings.events.aliases.length);
        assert.deepEqual(decisions.filter(e => e[6][2]).map(e => e[6][1]), graph.sets[graph.selections[0].selected_set], claim.fact_key);
        checked++;
    }
    assert.equal(checked, 8);
});

test('N02G:OBSERVED-METRIC-004 economic effects use observed links, not signed amount coincidence', async () => {
    const { evaluateEffects } = require('../../../src/next/provenance/metricEffects');
    const oracle = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8'));
    const { plan, claims, graphs } = await snapshotAccessFixture(); let checked = 0;
    const supported = ['consumption_effect', 'net_consumption', 'invoice_payment_consumption_effect', 'gross_consumption', 'refund_amount'];
    for (const claim of claims.filter(c => supported.includes(c.metric))) {
        const controls = []; const operands = {}; const observations = [];
        for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
            const selector = { fact_key: claim.fact_key, role_id }; const observe = e => observations.push(e);
            const access = binding.kind === 'claim_context' ? plan.openContext(selector, observe)
                : binding.kind === 'node_set' ? plan.openSet(selector, observe)
                    : plan.open({ ...selector, alias: binding.alias }, observe);
            controls.push(access); operands[role_id] = access.handle;
        }
        const result = evaluateEffects(Object.freeze(operands), claim.metric);
        for (const access of controls) { access.revoke(); access.assertHealthy(); }
        const split = claim.fact_key.lastIndexOf('#');
        const expected = oracle.turns[claim.fact_key.slice(0, split)].facts[Number(claim.fact_key.slice(split + 1)) - 1];
        assert.equal(expected.metric, claim.metric); assert.equal(result, expected.value, claim.fact_key);
        const graph = graphs.find(g => g.fact_key === claim.fact_key);
        const decisions = observations.filter(e => e[1] === 'select_member');
        assert.equal(decisions.length, claim.operand_bindings.events.aliases.length);
        assert.deepEqual(decisions.filter(e => e[6][2]).map(e => e[6][1]), graph.sets[graph.selections[0].selected_set], claim.fact_key);
        checked++;
    }
    assert.equal(checked, 13);
});

test('N02G:TRACE-COMPAT-001 required traversal exposes a read and node excluded by the authored derivation contract', async () => {
    const { inspectTraversalCoverage } = await import(pathToFileURL(path.join(root, 'scripts/agent/inspectNextProvenanceTraceCompatibility.mjs')));
    const { plan, graphs } = await snapshotAccessFixture();
    const report = inspectTraversalCoverage(graphs);
    assert.equal(report.compatible, false); assert.equal(report.graphs_checked, 76);
    assert.equal(report.affected_graphs, 66); assert.equal(report.gap_count, 1133);
    assert.ok(report.gaps.every(g => g.phase === 'derivation'));
    const graph = graphs.find(g => g.fact_key === 'S-01#1#1');
    const contract = graph.trace_contract.derivation;
    const edge = graph.edges.find(e => e.id === 'e0023');
    assert.ok(contract.required_edges.includes(edge.id));
    const observations = [];
    const access = plan.open({ fact_key: graph.fact_key, role_id: 'events', alias: edge.source }, e => observations.push(e));
    access.handle.traverse(edge.id); access.assertHealthy(); access.revoke();
    const actualReads = observations.filter(e => e[1] === 'get').map(e => [e[2], e[4]]);
    assert.deepEqual(actualReads, [[edge.source, [edge.field]], [edge.target, ['id']]]);
    assert.equal(contract.required_nodes.includes(edge.target), false);
    assert.equal(contract.required_reads.some(r => r.node === edge.target && r.segments.join('.') === 'id'), false);
    assert.ok(observations.some(e => e[1] === 'traverse' && e[6][1] === edge.id));
    // The test proves a blocker, not successful graph acceptance. A copied
    // local contract can cover this one edge; normative authoring is untouched.
    const minimal = { fact_key: 'diagnostic', edges: [edge], trace_contract: Object.fromEntries(['derivation', 'proof'].map(phase => [phase, {
        required_edges: [edge.id], required_nodes: [edge.source, edge.target],
        required_reads: actualReads.map(([node, segments]) => ({ node, segments }))
    }])) };
    assert.equal(inspectTraversalCoverage([minimal]).compatible, true);
    for (const endpoint of [edge.source, edge.target]) {
        const broken = structuredClone(minimal);
        broken.trace_contract.derivation.required_nodes = broken.trace_contract.derivation.required_nodes.filter(n => n !== endpoint);
        assert.equal(inspectTraversalCoverage([broken]).compatible, false);
    }
});

test('N02G:SNAPSHOT-ACCESS-001 handles resolve exact admitted fact/role/alias identities', async () => {
    const { plan, graphs, claims, snapshots, registry } = await snapshotAccessFixture();
    assert.equal(plan.stage, 'snapshot_access_plan_only');
    assert.equal(plan.executable, false);
    assert.equal(plan.snapshot_count, 115);
    assert.deepEqual(Object.keys(plan).sort(), ['executable', 'open', 'openContext', 'openProof', 'openSet', 'snapshot_count', 'stage']);
    let opened = 0;
    for (const claim of claims) {
        const graph = graphs.find(g => g.fact_key === claim.fact_key);
        for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
            const aliases = binding.kind === 'node' ? [binding.alias] : binding.kind === 'node_set' ? binding.aliases : [];
            for (const alias of aliases) {
                const node = graph.nodes[alias];
                const snapshot = snapshots.find(s => s.kind === node.kind && s.ref_id === node.ref_id && s.version === node.version);
                const events = [];
                const access = plan.open({ fact_key: claim.fact_key, role_id, alias }, e => events.push(e));
                assert.equal(access.handle.get('id'), snapshot.payload.id);
                for (const key of ['kind', 'ref_id', 'version']) assert.equal(access.handle.identity(key), snapshot[key]);
                const material = Object.keys(snapshot.payload).filter(k => registry.kinds[node.kind].fields[k].class !== 'non_material');
                assert.deepEqual([...access.handle.keys()], material);
                for (const field of material) {
                    const actual = access.handle.get(field);
                    const expected = snapshot.payload[field];
                    if (Array.isArray(expected)) {
                        assert.equal(actual.length(), expected.length);
                        assert.deepEqual([...actual], expected);
                    } else assert.equal(actual, expected);
                }
                assert.ok(events.every(e => e[0] === 'I' && e[2] === alias && e[3] === role_id));
                access.revoke();
                assert.throws(() => access.handle.get('id'), /access_revoked/);
                assert.throws(() => access.assertHealthy(), /access_failed/);
                opened++;
            }
        }
    }
    assert.ok(opened > 100);
});

test('N02G:SNAPSHOT-ACCESS-009 proof snapshots are read independently of metric operand bindings', async () => {
    const { measureMaterialFingerprint } = require('../../../src/next/provenance/proofOperators');
    const { plan, graphs, snapshots } = await snapshotAccessFixture();
    const measured = new Set(); let traversals = 0;
    for (const graph of graphs) {
        if (Object.values(graph.nodes).some(node => node.binding !== 'snapshot')) {
            assert.throws(() => plan.openProof({ fact_key: graph.fact_key }, () => {}), /proof_parent_pending/);
            continue;
        }
        const events = []; const scope = plan.openProof({ fact_key: graph.fact_key }, e => events.push(e));
        for (const [alias, node] of Object.entries(graph.nodes)) {
            const key = JSON.stringify([node.kind, node.ref_id, node.version]);
            if (measured.has(key)) continue;
            const actual = measureMaterialFingerprint(scope.node(alias), scope.material(alias));
            const snapshot = snapshots.find(s => s.kind === node.kind && s.ref_id === node.ref_id && s.version === node.version);
            assert.equal(actual, snapshot.semantic_fingerprint); measured.add(key);
        }
        for (const edge of graph.edges.filter(e => e.relation === 'material_ref')) {
            const target = scope.edge(edge.id);
            assert.equal(target.identity('ref_id'), graph.nodes[edge.target].ref_id); traversals++;
        }
        assert.ok(events.every(e => e[0] === 'I' && e[3] === 'proof/snapshot'));
        scope.assertHealthy(); const handle = scope.node(Object.keys(graph.nodes)[0]); scope.revoke();
        assert.throws(() => handle.get('id'), /access_revoked/);
        assert.throws(() => scope.assertHealthy(), /access_failed/);
    }
    const referenced = new Set(graphs.flatMap(graph => Object.values(graph.nodes)
        .filter(node => node.binding === 'snapshot').map(node => JSON.stringify([node.kind, node.ref_id, node.version]))));
    assert.deepEqual([...measured].sort(), [...referenced].sort());
    assert.equal(referenced.size, 61);
    assert.equal(snapshots.length, 115); // 54 admitted snapshots are not graph operands.
    assert.ok(traversals > 4000);
});

test('N02G:SNAPSHOT-ACCESS-010 proof scope rejects data injection, unknown aliases and edges', async () => {
    const { plan, graphs } = await snapshotAccessFixture();
    const graph = graphs.find(g => Object.values(g.nodes).every(n => n.binding === 'snapshot'));
    for (const extra of [{ phase: 'derivation' }, { expected_trace: {} }, { payload: {} }, { role_id: 'events' }]) {
        assert.throws(() => plan.openProof({ fact_key: graph.fact_key, ...extra }, () => {}), /snapshot_access_/);
    }
    const scope = plan.openProof({ fact_key: graph.fact_key }, () => {});
    assert.throws(() => scope.node('unknown'), /access_binding_invalid/);
    assert.throws(() => scope.assertHealthy(), /access_failed/);
    const second = plan.openProof({ fact_key: graph.fact_key }, () => {});
    assert.throws(() => second.edge('unknown'), /snapshot_access_proof_edge/);
    assert.throws(() => second.assertHealthy(), /snapshot_access_proof_failed/);
});

test('N02G:SNAPSHOT-ACCESS-011 metric and proof contexts are observed without output or binding tables', async () => {
    const { plan, graphs, claims } = await snapshotAccessFixture(); let count = 0;
    for (const claim of claims) {
        for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
            if (binding.kind !== 'claim_context') continue;
            const events = []; const access = plan.openContext({ fact_key: claim.fact_key, role_id }, e => events.push(e));
            assert.equal(access.handle.get('period').get('kind'), claim.period.kind);
            assert.ok(events.every(e => e[2] === 'claim/context' && e[3] === role_id));
            access.revoke(); assert.throws(() => access.handle.get('coverage'), /access_revoked/); count++;
        }
    }
    assert.ok(count > 60);
    const graph = graphs.find(g => Object.values(g.nodes).every(n => n.binding === 'snapshot'));
    const events = []; const scope = plan.openProof({ fact_key: graph.fact_key }, e => events.push(e));
    assert.equal(scope.claim().get('period').get('kind'), claims.find(c => c.fact_key === graph.fact_key).period.kind);
    assert.ok(events.every(e => e[2] === 'claim/context' && e[3] === 'proof/context'));
    assert.throws(() => scope.claim().get('operand_bindings'), /access_/);
    assert.throws(() => scope.node(Object.keys(graph.nodes)[0]), /access_failed/);
});

test('N02G:OBSERVED-PROOF-001 compiled scalar, identity and fingerprint predicates execute from handles', async t => {
    const { evaluateObservedOperator } = require('../../../src/next/provenance/proofOperators');
    const { plan, ir, operators } = await snapshotAccessFixture();
    const implemented = new Set(['kind_is', 'fingerprint_is', 'same_identity', 'ref_targets_node', 'eq', 'not_eq',
        'field_eq', 'state_is', 'date_in_period', 'period_eq', 'same_month', 'range_contains', 'opposite_sign', 'abs_eq',
        'civil_offset_matches', 'month_bounds_match', 'day_of_month_matches', 'inclusive_day_count_matches']);
    let executed = 0; let observations = 0;
    for (const graph of ir.graphs) {
        if (Object.values(graph.nodes).some(n => n.binding !== 'snapshot')) continue;
        const access = plan.openProof({ fact_key: graph.fact_key }, () => observations++);
        const scope = { ...access, window(name) { if (!Object.hasOwn(graph.windows, name)) throw new Error('unknown_window'); return graph.windows[name]; } };
        for (const predicate of graph.predicates.filter(p => implemented.has(p.op))) {
            try {
                assert.equal(evaluateObservedOperator(operators.find(o => o.id === predicate.op), predicate.operands, scope), true);
            } catch (error) { throw new Error(`${graph.fact_key}:${predicate.id}:${error.message}`, { cause: error }); }
            executed++;
        }
        access.assertHealthy(); access.revoke();
    }
    // Development integration, NOT the 76-graph acceptance gate. Quantifiers,
    // selections, timezone and validated parents remain explicitly pending.
    assert.ok(executed > 11000); assert.ok(observations > executed);
    t.diagnostic(`compiled_predicates_executed=${executed}; instrumented_observations=${observations}; acceptance_gate=false`);
});

test('N02G:SNAPSHOT-ACCESS-012 proof selected sets exist only after observed computation', async () => {
    const { plan, graphs } = await snapshotAccessFixture();
    const graph = graphs.find(g => g.selections.length && Object.values(g.nodes).every(n => n.binding === 'snapshot'));
    const selection = graph.selections[0]; const events = [];
    const early = plan.openProof({ fact_key: graph.fact_key }, () => {});
    assert.throws(() => early.set(selection.selected_set), /proof_selection_pending/);
    assert.throws(() => early.assertHealthy(), /proof_failed/);
    const scope = plan.openProof({ fact_key: graph.fact_key }, e => events.push(e));
    const candidates = scope.set(selection.candidate_set);
    assert.equal(candidates.length(), graph.sets[selection.candidate_set].length);
    let calls = 0;
    const selected = scope.select(selection.candidate_set, selection.selected_set, member => {
        member.get('id'); calls++; return false;
    });
    assert.equal(calls, graph.sets[selection.candidate_set].length);
    assert.equal(selected.length(), 0);
    assert.ok(graph.sets[selection.selected_set].length > 0); // No copying the authored expected roster.
    assert.equal(scope.set(selection.selected_set), selected);
    assert.equal(events.filter(e => e[1] === 'select_member').length, calls);
    const member = candidates.at(0); scope.revoke();
    assert.throws(() => selected.length(), /access_set_revoked/);
    assert.throws(() => member.get('id'), /access_/);
});

test('N02G:SNAPSHOT-ACCESS-013 proof sets cannot survive a sibling failure or replace selection targets', async () => {
    const { plan, graphs } = await snapshotAccessFixture();
    const graph = graphs.find(g => g.selections.length && Object.values(g.nodes).every(n => n.binding === 'snapshot'));
    const selection = graph.selections[0];
    const scope = plan.openProof({ fact_key: graph.fact_key }, () => {});
    const candidates = scope.set(selection.candidate_set);
    assert.throws(() => scope.claim().get('result'), /access_/);
    assert.throws(() => candidates.length(), /access_/);
    const second = plan.openProof({ fact_key: graph.fact_key }, () => {});
    assert.throws(() => second.select(selection.candidate_set, 'forged_set', () => true), /proof_selection/);
    assert.throws(() => second.assertHealthy(), /proof_failed/);
});

test('N02G:OBSERVED-PROOF-002 reference sets resolve observed list members through graph traversals', async t => {
    const { evaluateObservedOperator } = require('../../../src/next/provenance/proofOperators');
    const { plan, ir, operators } = await snapshotAccessFixture(); let executed = 0; let traversals = 0;
    for (const graph of ir.graphs) {
        if (Object.values(graph.nodes).some(n => n.binding !== 'snapshot')) continue;
        const access = plan.openProof({ fact_key: graph.fact_key }, e => { if (e[1] === 'traverse') traversals++; });
        for (const predicate of graph.predicates.filter(p => ['set_eq', 'edge_target_in_set'].includes(p.op))) {
            assert.equal(evaluateObservedOperator(operators.find(o => o.id === predicate.op), predicate.operands, access), true);
            executed++;
        }
        access.assertHealthy(); access.revoke();
    }
    assert.equal(executed, 102); assert.ok(traversals > 500);
    t.diagnostic(`observed_set_predicates=${executed}; reference_traversals=${traversals}`);
});

test('N02G:OBSERVED-PROOF-003 quantified exclusions and paired edges consume all members', async t => {
    const { evaluateObservedOperator } = require('../../../src/next/provenance/proofOperators');
    const { plan, ir, operators } = await snapshotAccessFixture(); let executed = 0; let observations = 0;
    for (const graph of ir.graphs) {
        if (Object.values(graph.nodes).some(n => n.binding !== 'snapshot')) continue;
        const access = plan.openProof({ fact_key: graph.fact_key }, () => observations++);
        const scope = { ...access, window: name => graph.windows[name] };
        for (const predicate of graph.predicates.filter(p => ['none_match', 'edge_pair_complete'].includes(p.op))) {
            try { assert.equal(evaluateObservedOperator(operators.find(o => o.id === predicate.op), predicate.operands, scope), true); }
            catch (error) { throw new Error(`${graph.fact_key}:${predicate.id}:${error.message}`, { cause: error }); }
            executed++;
        }
        access.assertHealthy(); access.revoke();
    }
    assert.equal(executed, 79); assert.ok(observations > executed);
    t.diagnostic(`observed_quantified_predicates=${executed}; observations=${observations}`);
});

test('N02G:OBSERVED-PROOF-004 clock cutoff uses observed clock and policy through pinned timezone conversion', async () => {
    const { evaluateObservedOperator } = require('../../../src/next/provenance/proofOperators');
    const { plan, ir, operators } = await snapshotAccessFixture(); let executed = 0;
    for (const graph of ir.graphs) {
        for (const predicate of graph.predicates.filter(p => p.op === 'civil_date_matches')) {
            const events = []; const access = plan.openProof({ fact_key: graph.fact_key }, e => events.push(e));
            assert.equal(evaluateObservedOperator(operators.find(o => o.id === predicate.op), predicate.operands, access), true);
            for (const name of ['fixed_clock', 'daily_pace_as_of', 'timezone', 'calendar']) assert.ok(events.some(e => e[1] === 'get' && e[4][0] === name));
            executed++; access.assertHealthy(); access.revoke();
        }
    }
    assert.equal(executed, 2);
});

test('N02G:SNAPSHOT-ACCESS-002 callers cannot substitute shape, identity or operand roles', async () => {
    const { plan, claims, graphs } = await snapshotAccessFixture();
    const claim = claims.find(c => Object.values(c.operand_bindings).some(b => b.kind === 'node'));
    const [role_id, binding] = Object.entries(claim.operand_bindings).find(([, b]) => b.kind === 'node');
    const selector = { fact_key: claim.fact_key, role_id, alias: binding.alias };
    const foreignAlias = Object.keys(graphs.find(g => g.fact_key === claim.fact_key).nodes).find(a => a !== binding.alias);
    for (const changed of [{ fact_key: 'unknown' }, { role_id: 'unknown' }, { alias: foreignAlias },
        { shape: { type: 'scalar' } }, { value: {} }, { version: 'forged' }, { phase: 'proof' }]) {
        let events = 0;
        assert.throws(() => plan.open({ ...selector, ...changed }, () => events++), /snapshot_access_/);
        assert.equal(events, 0);
    }
    let getterCalls = 0;
    assert.throws(() => plan.open({ ...selector, get alias() { getterCalls++; return binding.alias; } }, () => {}), /snapshot_access_selector/);
    assert.throws(() => plan.open(new Proxy(selector, { ownKeys() { getterCalls++; return []; } }), () => {}), /snapshot_access_selector/);
    assert.equal(getterCalls, 0);
    assert.throws(() => plan.open(selector, null), /snapshot_access_selector/);
    for (const c of claims) for (const [role, b] of Object.entries(c.operand_bindings)) {
        if (b.kind === 'node' || b.kind === 'node_set') continue;
        assert.throws(() => plan.open({ fact_key: c.fact_key, role_id: role, alias: b.alias || 'claim' }, () => {}), /snapshot_access_binding_kind/);
    }
    const access = plan.open(selector, () => {});
    assert.throws(() => access.handle.get('label'), /access_/);
    assert.throws(() => access.assertHealthy(), /access_failed/);
});

test('N02G:SNAPSHOT-ACCESS-004 admitted handles feed the recorder without expected-trace input', async () => {
    const { createCausalRecorder } = require('../../../src/next/provenance/causalRecorder');
    const { plan, claims, graphs } = await snapshotAccessFixture();
    const claim = claims.find(c => Object.values(c.operand_bindings).some(b => b.kind === 'node'));
    const [role_id, binding] = Object.entries(claim.operand_bindings).find(([, b]) => b.kind === 'node');
    const recorder = createCausalRecorder({ executionId: 'snapshot-admission-test', maxEvents: 10 });
    const scope = recorder.open({ invocationId: claim.fact_key, phase: 'derivation' });
    const access = plan.open({ fact_key: claim.fact_key, role_id, alias: binding.alias }, scope.observe);
    const value = access.handle.get('id');
    assert.equal(value, graphs.find(g => g.fact_key === claim.fact_key).nodes[binding.alias].ref_id);
    access.revoke(); access.assertHealthy(); scope.seal();
    const trace = recorder.finish();
    assert.equal(trace.derivation_trace.length, 1);
    assert.equal(trace.proof_trace.length, 0);
    assert.equal(trace.derivation_trace[0].alias, binding.alias);
    assert.equal(trace.derivation_trace[0].role, role_id);
    assert.deepEqual(trace.derivation_trace[0].path, ['id']);
    assert.deepEqual(trace.derivation_trace[0].outcome, ['scalar', value]);
    assert.equal(Object.hasOwn(trace, 'result'), false);
});

test('N02G:SNAPSHOT-ACCESS-005 node-set roster, order and emptiness come only from admitted bindings', async () => {
    const { plan, claims, graphs } = await snapshotAccessFixture();
    let sets = 0; let empty = 0;
    const { decodeObservation } = require('../../../src/next/provenance/observationContract');
    for (const claim of claims) for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
        if (binding.kind !== 'node_set') {
            assert.throws(() => plan.openSet({ fact_key: claim.fact_key, role_id }, () => {}), /snapshot_access_binding_kind/);
            continue;
        }
        const events = [];
        const selector = { fact_key: claim.fact_key, role_id };
        for (const override of [{ aliases: [] }, { alias: 'forged' }, { shape: {} }, { value: [] }]) {
            assert.throws(() => plan.openSet({ ...selector, ...override }, () => events.push('unexpected')), /snapshot_access_selector/);
        }
        assert.equal(events.length, 0);
        const access = plan.openSet(selector, e => events.push(e));
        const graph = graphs.find(g => g.fact_key === claim.fact_key);
        assert.equal(access.handle.length(), binding.aliases.length);
        assert.deepEqual([...access.handle].map(node => node.get('id')), binding.aliases.map(alias => graph.nodes[alias].ref_id));
        assert.deepEqual(events.filter(e => e[5] === 'operand_set' && e[1] === 'next' && e[6][0] === 'node').map(e => e[6][1]), binding.aliases);
        for (const event of events) assert.deepEqual(decodeObservation(event), event);
        access.revoke(); access.assertHealthy();
        sets++; if (!binding.aliases.length) empty++;
    }
    assert.ok(sets > 10); assert.ok(empty > 0);
});

test('N02G:SNAPSHOT-ACCESS-006 selection reads admitted members rather than an expected result set', async () => {
    const { createCausalRecorder } = require('../../../src/next/provenance/causalRecorder');
    const { plan, claims, graphs } = await snapshotAccessFixture();
    const claim = claims.find(c => Object.values(c.operand_bindings).some(b => b.kind === 'node_set' && b.aliases.length > 2));
    const [role_id, binding] = Object.entries(claim.operand_bindings).find(([, b]) => b.kind === 'node_set' && b.aliases.length > 2);
    const graph = graphs.find(g => g.fact_key === claim.fact_key);
    const excluded = graph.nodes[binding.aliases[1]].ref_id;
    const recorder = createCausalRecorder({ executionId: 'admitted-selection', maxEvents: 1000 });
    const scope = recorder.open({ invocationId: claim.fact_key, phase: 'derivation' });
    const access = plan.openSet({ fact_key: claim.fact_key, role_id }, scope.observe);
    const selected = access.handle.select(node => node.get('id') !== excluded);
    const ids = [...selected].map(node => node.get('id'));
    assert.deepEqual(ids, binding.aliases.filter((_, i) => i !== 1).map(alias => graph.nodes[alias].ref_id));
    access.revoke(); access.assertHealthy(); scope.seal();
    const trace = recorder.finish().derivation_trace;
    assert.deepEqual(trace.filter(e => e.operation === 'select_member').map(e => e.outcome),
        binding.aliases.map((alias, i) => ['decision', alias, i !== 1]));
    assert.deepEqual(trace.find(e => e.operation === 'select_return').outcome.slice(2), binding.aliases.filter((_, i) => i !== 1));
    assert.ok(binding.aliases.every(alias => trace.some(e => e.alias === alias && e.operation === 'get' && e.path[0] === 'id')));
});

test('N02G:SNAPSHOT-ACCESS-007 traversal follows only admitted reachable material edges', async () => {
    const { plan, claims, graphs } = await snapshotAccessFixture();
    let traversals = 0; const visitedKinds = new Set();
    for (const claim of claims) {
        const first = Object.entries(claim.operand_bindings).find(([, b]) => b.kind === 'node');
        if (!first) continue;
        const [role_id, binding] = first; const graph = graphs.find(g => g.fact_key === claim.fact_key);
        const events = []; const access = plan.open({ fact_key: claim.fact_key, role_id, alias: binding.alias }, e => events.push(e));
        const queue = [[binding.alias, access.handle]]; const seen = new Set([binding.alias]);
        for (let i = 0; i < queue.length; i++) {
            const [alias, handle] = queue[i];
            for (const edge of graph.edges.filter(e => e.relation === 'material_ref' && e.source === alias)) {
                const target = handle.traverse(edge.id);
                assert.equal(target.get('id'), graph.nodes[edge.target].ref_id);
                assert.ok(events.some(e => e[1] === 'traverse' && e[2] === alias && e[6][1] === edge.id && e[6][2] === edge.target));
                visitedKinds.add(graph.nodes[edge.target].kind); traversals++;
                if (!seen.has(edge.target)) { seen.add(edge.target); queue.push([edge.target, target]); }
            }
        }
        access.revoke(); access.assertHealthy();
    }
    assert.ok(traversals > 100); assert.ok(visitedKinds.size > 5);
});

test('N02G:SNAPSHOT-ACCESS-008 admitted node-set selections retain traversal and shared revocation', async () => {
    const { plan, claims, graphs } = await snapshotAccessFixture(); let exercised = 0;
    for (const claim of claims) for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
        if (binding.kind !== 'node_set' || !binding.aliases.length) continue;
        const graph = graphs.find(g => g.fact_key === claim.fact_key);
        const edge = graph.edges.find(e => e.relation === 'material_ref' && e.source === binding.aliases[0]);
        if (!edge) continue;
        const events = []; const access = plan.openSet({ fact_key: claim.fact_key, role_id }, e => events.push(e));
        const selected = access.handle.select((node, index) => index === 0 && node.traverse(edge.id).get('id') === graph.nodes[edge.target].ref_id);
        assert.equal(selected.length(), 1); assert.equal(access.handle.length(), binding.aliases.length);
        const target = selected.at(0).traverse(edge.id);
        assert.equal(target.get('id'), graph.nodes[edge.target].ref_id);
        assert.equal(events.filter(e => e[1] === 'traverse').length, 2);
        access.revoke(); access.assertHealthy();
        assert.throws(() => target.get('id'), /access_revoked/);
        assert.throws(() => access.assertHealthy(), /access_failed/);
        exercised++;
    }
    assert.ok(exercised > 10);
});

test('N02G:SNAPSHOT-ACCESS-003 projection cannot bypass package or composite snapshot identity admission', async () => {
    const validation = await validators();
    assert.throws(() => compileSnapshotAccess({ documents: [] }, validation), /package_not_admitted/);
    const f = fixture(); const entry = f.entries.find(e => e.path === graphPath);
    const graphs = JSON.parse(entry.bytes);
    const node = Object.values(graphs.graphs[0].nodes).find(n => n.binding === 'snapshot');
    node.version = `sha256:${'0'.repeat(64)}`;
    entry.bytes = Buffer.from(JSON.stringify(graphs));
    f.authority.find(a => a.path === graphPath).sha256 = hash(entry.bytes);
    assert.equal(validation.graphs(graphs), true);
    assert.throws(() => compileSnapshotAccess(admitPackage(f), validation), /graph_index_node_snapshot_mismatch/);
});

test('N02G:AUTHORING-001 complete package resolves reviewed links and identities', async () => {
    const result = compileAuthoringIndex(admitPackage(fixture()), await validators());
    assert.equal(result.stage, 'indexed_authoring_only');
    assert.equal(result.graphs.length, 76);
    assert.equal(result.evaluatorCount, 39);
    assert.equal(Object.hasOwn(result, 'proof'), false);
});

test('N02G:AUTHORING-010 IR keeps all graphs, typed predicates, roles and proof expectations', async () => {
    const f = fixture();
    const admitted = admitPackage(f);
    const ir = compileAuthoringIR(admitted, await validators());
    const original = admitted.documents.find(d => d.path === graphPath).value;
    assert.equal(ir.stage, 'typed_authoring_ir_only');
    assert.equal(ir.executable, false);
    assert.equal(ir.graphs.length, 76);
    assert.equal(ir.graphs.reduce((n, g) => n + g.predicates.length, 0), 11456);
    assert.equal(ir.graphs.reduce((n, g) => n + g.operands.length, 0), 277);
    assert.equal(ir.graphs.reduce((n, g) => n + g.selections.length, 0), 73);
    assert.deepEqual(ir.graphs.map(g => g.fact_key), ir.order);
    assert.deepEqual(ir.authority_refs, admitted.documents.map(({ path, sha256 }) => ({ path, sha256 })));
    for (const graph of ir.graphs) {
        const source = original.graphs.find(g => g.fact_key === graph.fact_key);
        for (const key of ['nodes', 'sets', 'edges', 'obligations', 'selections']) assert.deepEqual(graph[key], source[key]);
        assert.deepEqual(graph.expected_trace, source.trace_contract);
        assert.deepEqual(graph.predicates.map(p => p.id), source.predicates.map(p => p.id));
        assert.ok(graph.predicates.every(p => p.operands.every(a => a.type && a.expression.kind)));
        for (const parent of graph.parents) assert.ok(ir.order.indexOf(parent.fact_key) < ir.order.indexOf(graph.fact_key));
        assert.equal(Object.hasOwn(graph.claim, 'operand_bindings'), false);
        assert.equal(Object.hasOwn(graph, 'result'), false);
        assert.equal(Object.hasOwn(graph, 'payload'), false);
    }
    assert.ok(ir.graphs.flatMap(g => g.required_state_checks).length > 0);
});

test('N02G:AUTHORING-011 template expansion is lexical and preserves window boundaries', async () => {
    const admitted = admitPackage(fixture());
    const ir = compileAuthoringIR(admitted, await validators());
    const original = admitted.documents.find(d => d.path === graphPath).value;
    const templates = admitted.documents.find(d => d.path === prefix + 'predicate-templates-v1.json').value.templates;
    let expansions = 0;
    for (const graph of ir.graphs) {
        const source = original.graphs.find(g => g.fact_key === graph.fact_key);
        for (const [id, window] of Object.entries(source.windows || {})) {
            assert.equal(graph.windows[id].kind, window.kind);
            if (window.kind === 'range') {
                assert.equal(graph.windows[id].start_inclusive, window.start_inclusive);
                assert.equal(graph.windows[id].end_inclusive, window.end_inclusive);
            }
        }
        for (const predicate of graph.predicates) for (const operand of predicate.operands) {
            const e = operand.expression;
            if (e.kind !== 'predicate_template') continue;
            expansions++;
            const t = templates.find(t => t.id === e.template_ref.id && t.version === e.template_ref.version);
            const p = source.predicates.find(p => p.id === predicate.id);
            const ref = p.args.find(a => a.template);
            assert.equal(e.combinator, 'all');
            assert.equal(e.member_slot, 'current_member');
            assert.equal(e.template_ref.hash, ref.template.hash);
            assert.deepEqual(e.body.map(p => p.op), t.body.map(p => p.op));
            e.body.forEach((p, i) => p.operands.forEach((arg, j) => {
                const parameter = t.body[i].args[j];
                if (parameter.current_member_field_parameter) {
                    const selector = ref.bindings[parameter.current_member_field_parameter].selector;
                    assert.deepEqual(arg, { kind: 'member_field', slot: 'current_member',
                        node_kind: selector.kind, segments: selector.segments });
                } else assert.deepEqual(arg, e.bindings[parameter.parameter]);
            }));
        }
    }
    assert.equal(expansions, 28);
});

test('N02G:AUTHORING-012 IR remains frozen and cannot bypass package or semantic admission', async () => {
    const validation = await validators();
    const f = fixture();
    const admitted = admitPackage(f);
    const ir = compileAuthoringIR(admitted, validation);
    function frozen(value) {
        if (value && typeof value === 'object') {
            assert.ok(Object.isFrozen(value));
            for (const child of Object.values(value)) frozen(child);
        }
    }
    frozen(ir);
    assert.throws(() => { ir.graphs[0].expected_trace.proof.required_nodes.pop(); }, TypeError);
    assert.throws(() => compileAuthoringIR({ ...admitted }, validation), /package_not_admitted/);
    const entry = f.entries.find(e => e.path === graphPath);
    const graphs = JSON.parse(entry.bytes);
    const graph = graphs.graphs.find(g => g.selections.some(s => s.input_evidence_state));
    delete graph.selections[0].input_evidence_state;
    entry.bytes = Buffer.from(JSON.stringify(graphs));
    f.authority.find(a => a.path === graphPath).sha256 = hash(entry.bytes);
    assert.throws(() => compileAuthoringIR(admitPackage(f), validation), /selection_binding_input_state/);
});

test('N02G:AUTHORING-013 IR is deterministic without copying source payloads or oracle data', async () => {
    const validation = await validators();
    const f = fixture();
    const first = compileAuthoringIR(admitPackage(f), validation);
    f.entries.reverse();
    f.authority.reverse();
    const second = compileAuthoringIR(admitPackage(f), validation);
    assert.deepEqual(second, first);
    assert.deepEqual(Object.keys(first).sort(), ['authority_refs', 'executable', 'format', 'graphs', 'order', 'stage', 'version']);
    for (const graph of first.graphs) {
        assert.deepEqual(Object.keys(graph).sort(), ['claim', 'claim_id', 'edges', 'evaluator_ref', 'expected_trace',
            'fact_key', 'nodes', 'obligations', 'operands', 'parents', 'predicates', 'required_state_checks',
            'selections', 'sets', 'windows']);
        assert.equal(Object.hasOwn(graph.claim, 'value'), false);
        assert.equal(Object.hasOwn(graph.claim, 'expected'), false);
    }
});

test('N02G:AUTHORING-015 internal lowering preserves sort ties and projection multiplicity', () => {
    // Isolated lowering contract, not an admitted graph or an executable proof.
    const sources = [{ sort: { keys: [
        { selector: { kind: 'event', segments: ['date'] }, direction: 'desc' },
        { selector: { kind: 'event', segments: ['amount_minor'] }, direction: 'asc' }
    ], tie_break: 'kind_ref_version' } },
    { projection: { set: 'ordered', selector: { kind: 'event', segments: ['amount_minor'] }, as: 'sequence' } }];
    const graph = { fact_key: 'internal', claim_id: 'claim-internal', nodes: {}, sets: { ordered: ['a', 'b'] },
        predicates: [{ id: 'p' }], edges: [], obligations: [], selections: [], trace_contract: {} };
    const index = { order: ['internal'], graphs: [{ fact_key: 'internal', evaluator_ref: {}, parents: [] }] };
    const input = { documents: [], graphs: [graph], claims: [{ fact_key: 'internal', claim_id: 'claim-internal' }], index,
        operandBindings: { stage: 'operand_bindings_indexed_only', graphs: [{ fact_key: 'internal', operands: [] }] },
        predicateTypes: { stage: 'predicate_types_checked_only', unresolved: 0, typedGraphs: [{ fact_key: 'internal',
            claim_id: 'claim-internal', predicates: [{ id: 'p', op: 'internal_test', obligation: 'evidence_set', atom: 'evidence_set',
                operands: sources.map(source => ({ type: {}, source })) }] }] },
        selectionBindings: { stage: 'selection_bindings_checked_only', stateChecks: [] }, templates: { templates: [] } };
    const [sort, projection] = lowerAuthoringIR(input).graphs[0].predicates[0].operands.map(o => o.expression);
    assert.equal(sort.tie_break, 'kind_ref_version');
    assert.deepEqual(sort.keys.map(k => k.direction), ['desc', 'asc']);
    assert.deepEqual(sort.keys.map(k => k.selector.segments), [['date'], ['amount_minor']]);
    assert.equal(projection.as, 'sequence');
    assert.deepEqual(projection.set, { kind: 'set_ref', name: 'ordered' });
});

test('N02G:AUTHORING-004 schema-valid type substitution fails after package hash is repaired', async () => {
    const validation = await validators();
    const f = fixture();
    const entry = f.entries.find(e => e.path === graphPath);
    const value = JSON.parse(entry.bytes);
    const predicate = value.graphs[0].predicates.find(p => p.op === 'field_eq');
    predicate.args[1] = { field: { node: 'card_blue', segments: ['id'] } };
    assert.equal(validation.graphs(value), true);
    entry.bytes = Buffer.from(JSON.stringify(value));
    f.authority.find(a => a.path === graphPath).sha256 = hash(entry.bytes);
    assert.throws(() => compileAuthoringIndex(admitPackage(f), validation), /operator_types_nominal_mismatch/);
});

test('N02G:AUTHORING-005 registry/schema drift fails independently of current payload values and hashes', async () => {
    const validation = await validators();
    const f = fixture();
    const graphEntry = f.entries.find(e => e.path === graphPath);
    const graphs = JSON.parse(graphEntry.bytes);
    const registryEntry = f.entries.find(e => e.path === graphs.material_registry.path);
    const registry = JSON.parse(registryEntry.bytes);
    // A more permissive registry limit need not invalidate any present payload.
    // Repair both hash layers: only the schema/registry projection can reject it.
    registry.kinds.card.fields.closing_day.maximum = 32;
    registryEntry.bytes = Buffer.from(JSON.stringify(registry));
    graphs.material_registry.hash = hash(registryEntry.bytes);
    graphEntry.bytes = Buffer.from(JSON.stringify(graphs));
    for (const entry of [registryEntry, graphEntry]) f.authority.find(a => a.path === entry.path).sha256 = hash(entry.bytes);
    assert.equal(validation.graphs(graphs), true);
    assert.throws(() => compileAuthoringIndex(admitPackage(f), validation), /schema_registry_projection:payload_card/);
});

test('N02G:AUTHORING-006 type-compatible money comparison cannot discharge node identity', async () => {
    const validation = await validators();
    const f = fixture();
    const entry = f.entries.find(e => e.path === graphPath);
    const graphs = JSON.parse(entry.bytes);
    const predicate = graphs.graphs[0].predicates.find(p => p.op === 'kind_is');
    predicate.op = 'eq';
    predicate.args = [{ field: { node: 'account_a', segments: ['opening_balance_minor'] } },
        { field: { node: 'account_b', segments: ['opening_balance_minor'] } }];
    assert.equal(validation.graphs(graphs), true);
    entry.bytes = Buffer.from(JSON.stringify(graphs));
    f.authority.find(a => a.path === graphPath).sha256 = hash(entry.bytes);
    // Same nominal unit and valid references: rejection must be the obligation
    // association, not package/schema/fingerprint or operand-type mismatch.
    assert.throws(() => compileAuthoringIndex(admitPackage(f), validation), /obligation_binding_semantics/);
});

test('N02G:AUTHORING-007 valid binding shape cannot change a registry role input kind', async () => {
    const validation = await validators();
    const f = fixture();
    const graphEntry = f.entries.find(e => e.path === graphPath);
    const graphs = JSON.parse(graphEntry.bytes);
    const claimEntry = f.entries.find(e => e.path === graphs.claim_contract.path);
    const claims = JSON.parse(claimEntry.bytes);
    claims.claims[0].operand_bindings.context = { kind: 'node', alias: 'person_a' };
    assert.equal(validation.claims(claims), true);
    claimEntry.bytes = Buffer.from(JSON.stringify(claims));
    graphs.claim_contract.hash = hash(claimEntry.bytes);
    graphEntry.bytes = Buffer.from(JSON.stringify(graphs));
    for (const entry of [claimEntry, graphEntry]) f.authority.find(a => a.path === entry.path).sha256 = hash(entry.bytes);
    assert.throws(() => compileAuthoringIndex(admitPackage(f), validation), /operand_binding_kind/);
});

test('N02G:AUTHORING-008 removed estimated-input state fails after package hashes are repaired', async () => {
    const validation = await validators();
    const f = fixture();
    const entry = f.entries.find(e => e.path === graphPath);
    const graphs = JSON.parse(entry.bytes);
    const graph = graphs.graphs.find(g => g.selections.some(s => s.input_evidence_state));
    delete graph.selections[0].input_evidence_state;
    assert.equal(validation.graphs(graphs), true);
    entry.bytes = Buffer.from(JSON.stringify(graphs));
    f.authority.find(a => a.path === graphPath).sha256 = hash(entry.bytes);
    assert.throws(() => compileAuthoringIndex(admitPackage(f), validation), /selection_binding_input_state/);
});

test('N02G:AUTHORING-009 a changed claim literal reaches descriptor binding rejection', async () => {
    const validation = await validators();
    const f = fixture();
    const entry = f.entries.find(e => e.path === graphPath);
    const graphs = JSON.parse(entry.bytes);
    const predicate = graphs.graphs[0].predicates.find(p => p.args.some(a =>
        JSON.stringify(a.claim?.segments) === JSON.stringify(['time_basis'])));
    predicate.args.find(a => a.literal).literal.value = 'due_date';
    assert.equal(validation.graphs(graphs), true);
    entry.bytes = Buffer.from(JSON.stringify(graphs));
    f.authority.find(a => a.path === graphPath).sha256 = hash(entry.bytes);
    assert.throws(() => compileAuthoringIndex(admitPackage(f), validation), /claim_requirements_value/);
});

test('N02G:AUTHORING-014 removing collection anchor cannot be hidden by repaired schema and hashes', async () => {
    const validation = await validators();
    const f = fixture();
    const entry = f.entries.find(e => e.path === graphPath);
    const graphs = JSON.parse(entry.bytes);
    const g = graphs.graphs[0];
    const id = g.predicates.find(p => p.op === 'set_eq' && p.args.some(a => a.ref_set)).id;
    g.predicates = g.predicates.filter(p => p.id !== id);
    for (const o of g.obligations) o.predicates = o.predicates.filter(p => p !== id);
    assert.equal(validation.graphs(graphs), true);
    entry.bytes = Buffer.from(JSON.stringify(graphs));
    f.authority.find(a => a.path === graphPath).sha256 = hash(entry.bytes);
    assert.throws(() => compileAuthoringIR(admitPackage(f), validation), /collection_requirements_membership_anchor/);
});

test('N02G:AUTHORING-002 admitted but altered authority cannot evade cross-document hashes', async () => {
    const validation = await validators();
    const f = fixture();
    const entry = f.entries.find(e => e.path === prefix + 'claims-v2.json');
    entry.bytes = Buffer.from(entry.bytes.toString() + ' ');
    f.authority.find(a => a.path === entry.path).sha256 = hash(entry.bytes);
    assert.throws(() => compileAuthoringIndex(admitPackage(f), validation), /graph_index_authority_hash/);
    assert.throws(() => compileAuthoringIndex({ stage: 'admitted_bytes_only', documents: [] }, validation), /package_not_admitted/);
});

test('N02G:AUTHORING-003 schema-valid duplicate graph fails after package hashes are repaired', async () => {
    const validation = await validators();
    const f = fixture();
    const entry = f.entries.find(e => e.path === graphPath);
    const value = JSON.parse(entry.bytes);
    // Keep the objects different so JSON Schema uniqueItems cannot mask the
    // identity collision this test must reach in the index pass.
    value.graphs[1].fact_key = value.graphs[0].fact_key;
    value.graphs[1].claim_id = value.graphs[0].claim_id;
    entry.bytes = Buffer.from(JSON.stringify(value));
    f.authority.find(a => a.path === graphPath).sha256 = hash(entry.bytes);
    assert.throws(() => compileAuthoringIndex(admitPackage(f), validation), /graph_index_duplicate/);
});
