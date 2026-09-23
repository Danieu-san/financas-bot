'use strict';
// Documentary proposal only: no evaluator, actual, oracle or normative writes.
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
const { createHash } = require('node:crypto'); const { execFileSync } = require('node:child_process');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const root = path.resolve(__dirname, '../../..'); const base = '76c8a2fe6891ad043ad3e8015ec7ff2471bf473b';
const prefix = 'docs/contracts/next/provenance-v2/'; const output = path.join(__dirname, 'owned-cards-proposal.json');
const sha = x => `sha256:${createHash('sha256').update(x).digest('hex')}`; const documents = new Map();
function read(file) {
    const text = fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
    const blob = execFileSync('git', ['show', `${base}:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    assert.equal(text, blob, `source_changed:${file}`);
    documents.set(file, { path: file, lf_sha256: sha(text), bytes: Buffer.byteLength(text) }); return text;
}
const corpus = JSON.parse(read(prefix + 'graphs-v2.json'));
const claims = JSON.parse(read(prefix + 'claims-v2.json')).claims;
const registry = JSON.parse(read(prefix + 'metric-evaluator-registry-v1.json'));
for (const file of ['evidence-snapshot.schema.json', 'material-field-registry-v1.json', 'graph-binding-contract-v1.md']) read(prefix + file);
read('src/next/provenance/metricDirectReads.js'); read('src/next/provenance/metricReferences.js');
read('scripts/agent/validateFinancasBotNextFacts.mjs');
const manifest = read(corpus.snapshot_manifest.path); assert.equal(sha(manifest), corpus.snapshot_manifest.hash);
const snapshots = JSON.parse(manifest).snapshots;
const entries = registry.entries.filter(e => e.evaluator_id === 'owned_cards' && e.evaluator_version === 1); assert.equal(entries.length, 1);
const entry = entries[0]; assert.equal(sha(read(entry.contract_path)), entry.evaluator_contract_hash);
assert.deepEqual(entry.roles.find(r => r.role_id === 'cards'), {
    role_id: 'cards', semantic_role: 'population', input_kind: 'node_set', cardinality: 'many', ordered: true
});
function snapshot(nodes, alias, kind) {
    const node = nodes[alias]; assert.equal(node.binding, 'snapshot'); assert.equal(node.kind, kind);
    const matches = snapshots.filter(s => s.kind === kind && s.ref_id === node.ref_id && s.version === node.version);
    assert.equal(matches.length, 1); const s = matches[0]; assert.equal(s.payload.id, node.ref_id);
    assert.equal(s.semantic_fingerprint, node.semantic_fingerprint); return s;
}
function ownerRequirements(evaluator, roles, graph) {
    assert.equal(evaluator.evaluator_id, 'owned_cards'); assert.equal(evaluator.evaluator_version, 1);
    assert.equal(roles.cards.kind, 'node_set'); const aliases = roles.cards.aliases;
    assert.equal(new Set(aliases).size, aliases.length);
    const owners = []; const relations = [];
    for (const alias of aliases) {
        const card = snapshot(graph.nodes, alias, 'card');
        const edges = graph.edges.filter(e => e.source === alias && e.field === 'owner_id' && e.relation === 'material_ref');
        assert.equal(edges.length, 1); const edge = edges[0];
        const owner = snapshot(graph.nodes, edge.target, 'person'); assert.equal(card.payload.owner_id, owner.payload.id);
        assert.ok(graph.trace_contract.derivation.required_edges.includes(edge.id));
        assert.ok(graph.trace_contract.derivation.required_reads.some(r => r.node === alias && canonicalValue(r.segments) === '["owner_id"]'));
        if (!owners.includes(edge.target)) owners.push(edge.target);
        relations.push({ card: alias, card_binding: graph.nodes[alias], edge, owner: edge.target, owner_binding: graph.nodes[edge.target] });
    }
    return { required_nodes: owners, required_reads: owners.map(node => ({ node, segments: ['id'] })), relations };
}
const records = [];
for (const claim of claims.filter(c => c.evaluator_ref.evaluator_id === 'owned_cards' && c.evaluator_ref.evaluator_version === 1)) {
    const graphs = corpus.graphs.filter(g => g.fact_key === claim.fact_key); assert.equal(graphs.length, 1); const graph = graphs[0];
    const requirements = ownerRequirements(claim.evaluator_ref, claim.operand_bindings, graph);
    const d = graph.trace_contract.derivation;
    const nodes = requirements.required_nodes.filter(n => !d.required_nodes.includes(n));
    const reads = requirements.required_reads.filter(r => !d.required_reads.some(x => canonicalValue(x) === canonicalValue(r)));
    for (const n of nodes) assert.ok(graph.trace_contract.proof.required_nodes.includes(n));
    for (const r of reads) assert.ok(graph.trace_contract.proof.required_reads.some(x => canonicalValue(x) === canonicalValue(r)));
    records.push({ fact_key: claim.fact_key, evaluator_ref: claim.evaluator_ref, bindings: claim.operand_bindings,
        source_graph_sha256: sha(canonicalValue(graph)), requirements, current_derivation: d,
        proposed_delta: { added_nodes: nodes, added_reads: reads, removed: [] }, proof_preserved_sha256: sha(canonicalValue(graph.trace_contract.proof)) });
}
assert.equal(corpus.graphs.length, 76); assert.equal(records.length, 1);
assert.equal(records[0].proposed_delta.added_nodes.length, 1); assert.equal(records[0].proposed_delta.added_reads.length, 1);
const record = { schema: 'n02g-owned-cards-proposal-v1', base, status: 'documentary_proposal_not_applied',
    graph_accepted: false, normative_application_allowed: false, source_corpus_sha256: sha(canonicalValue(corpus)),
    documents: [...documents.values()], records,
    proposed_totals: { changed_graphs: 1, unchanged_graphs: 75, added_nodes: 1, added_reads: 1, removed: 0 },
    limits: 'Source equality and declared snapshot identity only; no full semantic fingerprint validation, evaluator execution or normative application. No graph/host/global/production approval.' };
const mode = process.argv[2]; assert.ok(['--write-new', '--check'].includes(mode) && process.argv.length === 3);
if (mode === '--write-new') fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
else assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), record);
console.log(JSON.stringify({ valid: true, mode, base, documents: documents.size, proposed_totals: record.proposed_totals }));
