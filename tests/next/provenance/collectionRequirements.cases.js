'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateCollectionRequirements } = require('../../../src/next/provenance/collectionRequirements');
const read = file => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8'));
function fixture() {
    const d = read('docs/contracts/next/provenance-v2/graphs-v2.json');
    return { graphs: d.graphs, snapshots: read(d.snapshot_manifest.path).snapshots,
        materialRegistry: read(d.material_registry.path) };
}
function removePredicate(graph, id) {
    graph.predicates = graph.predicates.filter(p => p.id !== id);
    for (const o of graph.obligations) o.predicates = o.predicates.filter(p => p !== id);
}
function reject(mutate, error) {
    const f = fixture(); mutate(f.graphs[0], f);
    assert.throws(() => validateCollectionRequirements(f), error);
}

test('N02G:COLLECTION-001 all authored collections have independent candidate membership anchors', () => {
    const f = fixture();
    const result = validateCollectionRequirements(f);
    const expected = f.graphs.reduce((n, g) => n + Object.values(g.nodes).filter(n => n.kind === 'collection').length, 0);
    assert.equal(result.stage, 'collection_requirements_checked_only');
    assert.equal(result.graphs, 76);
    assert.equal(result.collections, expected);
    assert.ok(expected > 0);
    assert.ok(Object.isFrozen(result));
});

test('N02G:COLLECTION-002 deleting the membership predicate and references does not remove the requirement', () => {
    reject(g => removePredicate(g, g.predicates.find(p => p.op === 'set_eq' && p.args.some(a => a.ref_set)).id),
        /collection_requirements_membership_anchor/);
});

test('N02G:COLLECTION-003 collection cannot anchor selected subset or an unrelated set', () => {
    reject(g => { g.predicates.find(p => p.op === 'set_eq' && p.args.some(a => a.ref_set)).args.find(a => a.set).set = 'selected'; },
        /collection_requirements_candidate_anchor/);
    reject(g => { g.sets.unrelated = [...g.sets.candidates];
        g.predicates.find(p => p.op === 'set_eq' && p.args.some(a => a.ref_set)).args.find(a => a.set).set = 'unrelated'; },
        /collection_requirements_candidate_anchor/);
});

test('N02G:COLLECTION-004 coordinated candidate/exclusion removal still fails against members', () => {
    reject(g => {
        const s = g.selections[0]; const alias = s.excluded.pop().node;
        g.sets[s.candidate_set] = g.sets[s.candidate_set].filter(n => n !== alias);
    }, /collection_requirements_members/);
});

test('N02G:COLLECTION-005 fixture flags require matching predicates and true source facts', () => {
    for (const field of ['closed_world', 'synthetic']) {
        reject(g => removePredicate(g, g.predicates.find(p => p.args.some(a => a.field?.segments[0] === field)).id),
            /collection_requirements_fixture_anchor/);
        reject(g => { g.predicates.find(p => p.args.some(a => a.field?.segments[0] === field)).args.find(a => a.literal).literal.value = false; },
            /collection_requirements_fixture_anchor/);
        reject((_g, f) => { f.snapshots.find(s => s.kind === 'fixture').payload[field] = false; },
            /collection_requirements_fixture_state/);
    }
});

test('N02G:COLLECTION-006 collection name and fixture reference cannot drift with unchanged members', () => {
    reject((_g, f) => { f.snapshots.find(s => s.kind === 'collection' && s.payload.collection_name === 'events').payload.collection_name = 'cards'; },
        /collection_requirements_member_kind/);
    reject((_g, f) => { f.snapshots.find(s => s.kind === 'collection' && s.payload.collection_name === 'events').payload.fixture_id = 'missing'; },
        /collection_requirements_fixture/);
});

test('N02G:COLLECTION-007 empty collection keeps membership obligation without inventing a member', () => {
    const f = fixture();
    const graph = f.graphs.find(g => g.selections.length && g.sets[g.selections[0].candidate_set].length === 0
        && Object.values(g.nodes).some(n => n.kind === 'collection'));
    assert.ok(graph);
    const p = graph.predicates.find(p => p.op === 'set_eq' && p.args.some(a => a.ref_set));
    removePredicate(graph, p.id);
    assert.throws(() => validateCollectionRequirements(f), /collection_requirements_membership_anchor/);
});

test('N02G:COLLECTION-008 collection and candidate edits cannot erase a snapshot from the closed world', () => {
    reject((g, f) => {
        const s = g.selections[0]; const alias = s.excluded.pop().node;
        const id = g.nodes[alias].ref_id;
        g.sets[s.candidate_set] = g.sets[s.candidate_set].filter(n => n !== alias);
        const collection = f.snapshots.find(n => n.kind === 'collection' && n.payload.collection_name === 'events');
        collection.payload.members = collection.payload.members.filter(member => member !== id);
        g.edges = g.edges.filter(edge => !(edge.source === 'collection_events' && edge.target === alias));
        // Hash/edge validation is separate; this test reaches the independent
        // manifest membership requirement rather than relying on a stale hash.
    }, /collection_requirements_member_kind/);
});
