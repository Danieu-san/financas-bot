'use strict';
// Documentary authoring inventory. No evaluator, actual, oracle or graph writes.
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
const { createHash } = require('node:crypto'); const { execFileSync } = require('node:child_process');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const root = path.resolve(__dirname, '../../..'); const base = '6d85f096f0b88f4ecef77d62c2d9929a17547eb5';
const prefix = 'docs/contracts/next/provenance-v2/'; const output = path.join(__dirname, 'collection-kind-proposal.json');
const sha = x => `sha256:${createHash('sha256').update(x).digest('hex')}`; const documents = new Map();
function read(file) {
    const text = fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
    const blob = execFileSync('git', ['show', `${base}:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    assert.equal(text, blob, `source_changed:${file}`); documents.set(file, { path: file, lf_sha256: sha(text), bytes: Buffer.byteLength(text) }); return text;
}
const corpus = JSON.parse(read(prefix + 'graphs-v2.json'));
const claims = JSON.parse(read(prefix + 'claims-v2.json')).claims;
const registry = JSON.parse(read(prefix + 'metric-evaluator-registry-v1.json'));
const schema = JSON.parse(read(prefix + 'evidence-snapshot.schema.json'));
read(prefix + 'material-field-registry-v1.json'); read(prefix + 'graph-binding-contract-v1.md'); read('src/next/provenance/metricDirectReads.js');
const manifestText = read(corpus.snapshot_manifest.path); assert.equal(sha(manifestText), corpus.snapshot_manifest.hash);
const snapshots = JSON.parse(manifestText).snapshots;
// Semantic names from the three reviewed metric contracts, never node aliases.
const domains = { reminder_count: 'reminders', calendar_event_count: 'calendar_events', side_effect_count: 'side_effects' };
const entries = Object.keys(domains).map(id => {
    const matches = registry.entries.filter(e => e.evaluator_id === id && e.evaluator_version === 1); assert.equal(matches.length, 1);
    const e = matches[0]; assert.equal(sha(read(e.contract_path)), e.evaluator_contract_hash);
    assert.equal(e.roles.find(r => r.role_id === 'collection').input_kind, 'node');
    assert.equal(e.roles.find(r => r.role_id === 'collection').semantic_role, 'coverage');
    assert.equal(e.roles.find(r => r.role_id === 'entries').input_kind, 'node_set'); return e;
});
assert.ok(schema.definitions.payload_collection.required.includes('collection_name'));
function author(roles, nodes, snapshots) {
    assert.equal(roles.collection.kind, 'node'); const alias = roles.collection.alias; const node = nodes[alias];
    assert.equal(node.kind, 'collection');
    const matches = snapshots.filter(s => s.kind === node.kind && s.ref_id === node.ref_id && s.version === node.version);
    assert.equal(matches.length, 1); assert.equal(matches[0].payload.id, node.ref_id);
    assert.equal(matches[0].semantic_fingerprint, node.semantic_fingerprint);
    return { snapshot: matches[0], requirement: { node: alias, segments: ['collection_name'] } };
}
const records = [];
for (const claim of claims) {
    const entry = entries.find(e => e.evaluator_id === claim.evaluator_ref.evaluator_id && e.evaluator_version === claim.evaluator_ref.evaluator_version);
    if (!entry) continue;
    const matches = corpus.graphs.filter(g => g.fact_key === claim.fact_key); assert.equal(matches.length, 1); const graph = matches[0];
    const candidate = author(claim.operand_bindings, graph.nodes, snapshots);
    assert.equal(candidate.snapshot.payload.collection_name, domains[entry.evaluator_id]);
    assert.ok(graph.trace_contract.derivation.required_nodes.includes(candidate.requirement.node));
    assert.ok(!graph.trace_contract.derivation.required_reads.some(r => canonicalValue(r) === canonicalValue(candidate.requirement)));
    records.push({ fact_key: claim.fact_key, evaluator_ref: claim.evaluator_ref, contract_path: entry.contract_path,
        evaluator_contract_hash: entry.evaluator_contract_hash, collection_role: claim.operand_bindings.collection,
        entries_role: claim.operand_bindings.entries, collection_node: graph.nodes[candidate.requirement.node], collection_snapshot: candidate.snapshot,
        source_graph_sha256: sha(canonicalValue(graph)), proposed_delta: { added: [candidate.requirement], removed: [] },
        current_collection_reads: graph.trace_contract.derivation.required_reads.filter(r => r.node === candidate.requirement.node),
        proof_collection_reads: graph.trace_contract.proof.required_reads.filter(r => r.node === candidate.requirement.node) });
}
assert.equal(records.length, 3); assert.equal(corpus.graphs.length, 76);
const record = { schema: 'n02g-collection-kind-proposal-v1', base, status: 'documentary_proposal_not_applied',
    graph_accepted: false, normative_application_allowed: false, source_corpus_sha256: sha(canonicalValue(corpus)),
    documents: [...documents.values()], records, proposed_totals: { changed_graphs: 3, unchanged_graphs: 73, added_reads: 3, removed_reads: 0 },
    limits: 'Local source equality and inventory only, no full semantic fingerprint validation or execution. Does not apply normative delta or authorize code/host/global acceptance.' };
const mode = process.argv[2]; assert.ok(['--write-new', '--check'].includes(mode) && process.argv.length === 3);
if (mode === '--write-new') fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
else assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), record);
console.log(JSON.stringify({ valid: true, mode, base, documents: documents.size, proposed_totals: record.proposed_totals }));
