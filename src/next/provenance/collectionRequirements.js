'use strict';

const fail = code => { throw new Error(`collection_requirements_${code}`); };
const tuple = node => JSON.stringify([node.kind, node.ref_id, node.version]);
const sameSet = (a, b) => a.length === new Set(a).size && b.length === new Set(b).size
    && a.length === b.length && a.every(value => b.includes(value));

// Necessary closed-world authoring checks after schemas/material edge checks.
// Candidate coverage is not financial selection truth or observed provenance.
function validateCollectionRequirements({ graphs, snapshots, materialRegistry }) {
    const snapshotMap = new Map(snapshots.map(snapshot => [tuple(snapshot), snapshot]));
    if (snapshotMap.size !== snapshots.length) fail('duplicate');
    let collections = 0;
    for (const graph of graphs) {
        const entries = Object.entries(graph.nodes);
        function payload(node) {
            const snapshot = snapshotMap.get(tuple(node));
            if (!snapshot) fail('snapshot');
            return snapshot.payload;
        }
        function anchors(alias, field, type, value) {
            const predicates = graph.predicates.filter(p => p.op === 'eq' && p.obligation === 'coverage'
                && p.args.some(a => a.field?.node === alias && a.field.segments.length === 1 && a.field.segments[0] === field));
            if (!predicates.length || predicates.some(p => !p.args.some(a => a.literal?.type === type && a.literal.value === value))) {
                fail('fixture_anchor');
            }
        }
        for (const [alias, node] of entries.filter(([, node]) => node.kind === 'fixture')) {
            const source = payload(node);
            for (const field of ['closed_world', 'synthetic']) {
                if (source[field] !== true) fail('fixture_state');
                anchors(alias, field, 'boolean', true);
            }
        }
        for (const [alias, node] of entries.filter(([, node]) => node.kind === 'collection')) {
            collections++;
            const collection = payload(node);
            const fixtures = entries.filter(([, n]) => n.kind === 'fixture' && n.ref_id === collection.fixture_id
                && n.version === node.version);
            if (fixtures.length !== 1) fail('fixture');
            const kinds = Object.entries(materialRegistry.kinds).filter(([, kind]) => kind.origin === collection.collection_name);
            if (kinds.length !== 1) fail('member_kind');
            const kind = kinds[0][0];
            const complete = snapshots.filter(s => s.kind === kind && s.version === node.version).map(s => s.ref_id);
            if (!sameSet(collection.members, complete)) fail('member_kind');
            const links = graph.predicates.filter(p => p.op === 'set_eq' && p.obligation === 'evidence_set'
                && p.args.some(a => a.ref_set?.field.node === alias
                    && a.ref_set.field.segments.length === 1 && a.ref_set.field.segments[0] === 'members'));
            if (!links.length) fail('membership_anchor');
            for (const p of links) {
                const sets = p.args.filter(a => a.set).map(a => a.set);
                if (sets.length !== 1 || !graph.selections.some(s => s.candidate_set === sets[0])) fail('candidate_anchor');
                const candidates = graph.sets[sets[0]];
                if (!Array.isArray(candidates)) fail('members');
                const identities = candidates.map(alias => {
                    const member = graph.nodes[alias];
                    if (member?.binding !== 'snapshot' || member.kind !== kind || member.version !== node.version) fail('member_kind');
                    return member.ref_id;
                });
                if (!sameSet(identities, collection.members)) fail('members');
            }
        }
    }
    return Object.freeze({ stage: 'collection_requirements_checked_only', graphs: graphs.length, collections });
}

module.exports = { validateCollectionRequirements };
