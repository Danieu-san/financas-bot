'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { indexGraphDependencies, validateStaticEvidence } = require('../../../src/next/provenance/graphCompiler');
const root = '../../../docs/contracts/next/provenance-v2/';
const graphs = require(root + 'graphs-v2.json').graphs;
const claims = require(root + 'claims-v2.json').claims;
const evaluators = require(root + 'metric-evaluator-registry-v1.json').entries;
const v1 = require('../../fixtures/financasbot-next/golden-fact-contracts-v1.json');
const expectedFactKeys = Object.values(v1.turns).flat().map(f => f.fact_key);
const snapshots = require(root + 'snapshot-manifest-v1.json').snapshots;
const registry = require(root + 'material-field-registry-v1.json');
const fixture = () => structuredClone({ graphs, claims, evaluators, expectedFactKeys });

test('N02G:INDEX-001 all 76 identities linked, parents ordered before children', () => {
    const f = fixture();
    const result = indexGraphDependencies(f);
    assert.equal(result.stage, 'indexed_authoring_only');
    assert.equal(result.graphs.length, 76);
    assert.equal(result.evaluatorCount, 39);
    const positions = new Map(result.order.map((id, i) => [id, i]));
    let parentCount = 0;
    for (const graph of result.graphs) for (const parent of graph.parents) {
        parentCount++;
        assert.ok(positions.get(parent.fact_key) < positions.get(graph.fact_key));
    }
    assert.equal(parentCount, 6);
    assert.ok(Object.isFrozen(result.graphs[0]));
    assert.deepEqual(result, indexGraphDependencies({ ...f, graphs: [...f.graphs].reverse() }));
    f.claims[0].claim_id = 'changed';
    assert.notEqual(result.graphs[0].claim_id, 'changed');
});

test('N02G:INDEX-002 duplicates, omissions and extra identities never collapse into Map', () => {
    for (const mutate of [
        f => f.graphs.push(f.graphs[0]), f => f.graphs.pop(),
        f => f.claims.push(f.claims[0]), f => f.claims.pop(),
        f => { f.claims[1].claim_id = f.claims[0].claim_id; },
        f => { f.graphs[0].claim_id = 'wrong'; },
        f => { f.graphs[0].fact_key = 'N-99#9#9'; },
        f => f.expectedFactKeys.push(f.expectedFactKeys[0]),
        f => f.evaluators.push(f.evaluators[0]),
        f => { f.claims[0].evaluator_ref.evaluator_version = 999; }
    ]) {
        const f = fixture(); mutate(f);
        assert.throws(() => indexGraphDependencies(f), /graph_index_/);
    }
});

test('N02G:INDEX-003 parent node, role binding and derived edge must agree', () => {
    for (const mutate of [
        g => { g.nodes.parent_m_01_1_1.fact_key = 'missing'; },
        g => { g.nodes.parent_m_01_1_1.fact_key = 'M-01#1#2'; },
        g => { g.edges.find(e => e.relation === 'derived_from').target = 'person_a'; },
        g => { g.edges.find(e => e.relation === 'derived_from').field = 'right'; },
        g => { g.edges = g.edges.filter(e => e.id !== 'derived_left'); },
        g => { g.nodes.extra_parent = { ...g.nodes.parent_m_01_1_1 }; }
    ]) {
        const f = fixture(); mutate(f.graphs.find(g => g.fact_key === 'M-01#1#4'));
        assert.throws(() => indexGraphDependencies(f), /graph_index_/);
    }
});

test('N02G:INDEX-004 cycles fail even when node, binding and edge agree', () => {
    const f = fixture();
    const graph = f.graphs.find(g => g.fact_key === 'M-01#1#4');
    graph.nodes.parent_m_01_1_1.fact_key = graph.fact_key;
    f.claims.find(c => c.fact_key === graph.fact_key).operand_bindings.left.fact_key = graph.fact_key;
    assert.throws(() => indexGraphDependencies(f), /graph_index_cycle/);
});

test('N02G:INDEX-005 role set and metric/unit cannot drift from registry', () => {
    for (const mutate of [
        c => { delete c.operand_bindings.context; },
        c => { c.operand_bindings.extra = { kind: 'claim_context' }; },
        c => { c.metric = 'other'; }, c => { c.unit = 'other'; }
    ]) {
        const f = fixture(); mutate(f.claims[0]);
        assert.throws(() => indexGraphDependencies(f), /graph_index_/);
    }
});

test('N02G:EVIDENCE-001 fingerprints bind all material content, not display labels', () => {
    const baseline = validateStaticEvidence(graphs, snapshots, registry);
    assert.deepEqual(baseline, { snapshots: 115, graphs: 76 });
    const display = structuredClone(snapshots);
    display.find(s => s.kind === 'family').payload.label = 'Another display label';
    assert.deepEqual(validateStaticEvidence(graphs, display, registry), baseline);
    const changed = structuredClone(snapshots);
    changed.find(s => s.kind === 'account').payload.opening_balance_minor += 1;
    assert.throws(() => validateStaticEvidence(graphs, changed, registry), /graph_index_snapshot_fingerprint/);
});

test('N02G:EVIDENCE-002 edge and non-material failures are orthogonal to fingerprints', () => {
    const missing = structuredClone(graphs);
    missing[0].edges.splice(missing[0].edges.findIndex(e => e.relation === 'material_ref'), 1);
    assert.throws(() => validateStaticEvidence(missing, snapshots, registry), /graph_index_inventory_mismatch/);
    const retargeted = structuredClone(graphs);
    retargeted[0].edges.find(e => e.relation === 'material_ref').target = 'family_example';
    assert.throws(() => validateStaticEvidence(retargeted, snapshots, registry), /graph_index_inventory_mismatch/);
    const read = structuredClone(graphs);
    read[0].trace_contract.derivation.required_reads.push({ node: 'family_example', segments: ['label'] });
    assert.throws(() => validateStaticEvidence(read, snapshots, registry), /graph_index_read_non_material/);
});

test('N02G:EVIDENCE-003 snapshot alias/version and unknown payload fields fail', () => {
    const changed = structuredClone(graphs);
    changed[0].nodes.family_example.version = 'sha256:' + '0'.repeat(64);
    assert.throws(() => validateStaticEvidence(changed, snapshots, registry), /graph_index_node_snapshot_mismatch/);
    const duplicate = structuredClone(graphs);
    duplicate[0].nodes.family_copy = { ...duplicate[0].nodes.family_example };
    assert.throws(() => validateStaticEvidence(duplicate, snapshots, registry), /graph_index_node_snapshot_duplicate/);
    const unknown = structuredClone(snapshots);
    unknown[0].payload.secret = 'not-a-material-registry-field';
    assert.throws(() => validateStaticEvidence(graphs, unknown, registry), /graph_index_snapshot_field/);
});
