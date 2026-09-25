'use strict';
// Read-only extraction of immutable authorship inputs; no formula or trace execution.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const base = '3d343696482136ff4c5535e81776d3ed04c44f7e';
const prefix = 'docs/contracts/next/provenance-v2/';
const output = path.join(__dirname, 'direct-event-composition-review.json');
const sha = text => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const documents = [];
function read(file) {
    const text = fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
    const original = execFileSync('git', ['show', `${base}:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).replaceAll('\r\n', '\n');
    assert.equal(text, original, `source_changed:${file}`);
    documents.push({ path: file, lf_sha256: sha(text), bytes: Buffer.byteLength(text) });
    return text;
}
function unique(items, predicate, label) {
    const found = items.filter(predicate); assert.equal(found.length, 1, label); return found[0];
}
const proposal = JSON.parse(read('docs/audit-evidence/n02g-causal-authoring-profile/direct-event-proposal-v2.json'));
const corpus = JSON.parse(read(prefix + 'graphs-v2.json'));
const claims = JSON.parse(read(prefix + 'claims-v2.json')).claims;
const registry = JSON.parse(read(prefix + 'metric-evaluator-registry-v1.json'));
const manifestText = read(corpus.snapshot_manifest.path);
assert.equal(sha(manifestText), corpus.snapshot_manifest.hash);
const snapshots = JSON.parse(manifestText).snapshots;
const schema = JSON.parse(read(prefix + 'evidence-snapshot.schema.json'));
const binding = read(prefix + 'graph-binding-contract-v1.md');
function section(number) {
    const marker = `## ${number}. `;
    assert.equal(binding.split(marker).length, 2);
    const start = binding.indexOf(marker); const end = binding.indexOf('\n## ', start + marker.length);
    return binding.slice(start, end < 0 ? undefined : end).trim();
}
const ids = [...new Set(proposal.records.map(r => r.evaluator_ref.evaluator_id))];
assert.equal(ids.length, 4); assert.equal(proposal.records.length, 5);
const contracts = ids.map(id => {
    const entry = unique(registry.entries, e => e.evaluator_id === id && e.evaluator_version === 1, 'registry_identity');
    const text = read(entry.contract_path); assert.equal(sha(text), entry.evaluator_contract_hash);
    const contract = JSON.parse(text);
    assert.deepEqual(contract, unique(proposal.contracts, c => c.evaluator_id === id, 'proposal_contract').contract);
    return { registry_entry: entry, contract };
});
const selectedSnapshots = new Map();
const records = proposal.records.map(proposed => {
    const graph = unique(corpus.graphs, g => g.fact_key === proposed.fact_key, 'graph_identity');
    const claim = unique(claims, c => c.fact_key === graph.fact_key, 'claim_identity');
    assert.equal(graph.claim_id, claim.claim_id);
    assert.deepEqual(graph.trace_contract.derivation, proposed.current_derivation);
    assert.deepEqual(claim.operand_bindings, proposed.operand_bindings);
    const roleAliases = Object.values(claim.operand_bindings).filter(b => b.kind === 'node').map(b => b.alias);
    const relations = graph.edges.filter(e => roleAliases.includes(e.source) && e.relation === 'material_ref');
    const aliases = [...new Set([...roleAliases, ...relations.map(e => e.target)])].sort();
    const nodes = Object.fromEntries(aliases.map(alias => {
        const node = graph.nodes[alias]; assert.equal(node.binding, 'snapshot');
        const snap = unique(snapshots, s => s.kind === node.kind && s.ref_id === node.ref_id && s.version === node.version, 'snapshot_identity');
        assert.equal(snap.payload.id, node.ref_id); assert.equal(snap.semantic_fingerprint, node.semantic_fingerprint);
        selectedSnapshots.set(JSON.stringify([snap.kind, snap.ref_id, snap.version]), snap);
        return [alias, node];
    }));
    for (const edge of relations) {
        const source = unique(snapshots, s => s.kind === nodes[edge.source].kind && s.ref_id === nodes[edge.source].ref_id && s.version === nodes[edge.source].version, 'relation_source');
        assert.equal(source.payload[edge.field], nodes[edge.target].ref_id, 'relation_value');
    }
    return { claim, role_and_relation_nodes: nodes, direct_material_relations: relations,
        original_derivation: graph.trace_contract.derivation,
        proposed_derivation: proposed.proposed_derivation, reasons: proposed.reasons,
        delta: proposed.delta, preserved_proof_identity: proposed.proof_preserved_sha256 };
});
const record = { schema: 'n02g-direct-event-composition-review-v1', base,
    status: 'normative_review_pending_not_applied',
    scope: 'Five derivation compositions only. Not a new audit of the approved helper, 76 graphs, proof sufficiency or runtime.',
    documents, contracts, event_payload_schema: schema.definitions.payload_event,
    binding_sections: { snapshots: section(2), observation: section(4) },
    snapshots: [...selectedSnapshots.values()], records,
    limits: 'Lossless selected source fields with explicit omissions. Proof hash identifies preserved proof; it does not prove semantic sufficiency. No oracle, evaluator, actual trace or financial execution. Schema excerpt does not replace its referenced definitions.' };
const mode = process.argv[2]; assert.ok(['--write-new', '--check'].includes(mode) && process.argv.length === 3);
if (mode === '--write-new') fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
else assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), record);
console.log(JSON.stringify({ valid: true, base, records: records.length, contracts: contracts.length,
    snapshots: selectedSnapshots.size, documents: documents.length, bytes: Buffer.byteLength(JSON.stringify(record, null, 2) + '\n'), normative_approval: false }));
