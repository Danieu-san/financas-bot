'use strict';
// Documentary inventory, never imports evaluator/trace/oracle or applies graphs.
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
const { createHash } = require('node:crypto'); const { execFileSync } = require('node:child_process');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const root = path.resolve(__dirname, '../../..'); const base = '1257abafea4041a59d209e9bab80df7cda6a1433';
const prefix = 'docs/contracts/next/provenance-v2/'; const output = path.join(__dirname, 'source-entity-presence-proposal.json');
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`; const documents = new Map();
function read(file) {
    const text = fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
    const blob = execFileSync('git', ['show', `${base}:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    assert.equal(text, blob, `source_changed:${file}`);
    documents.set(file, { path: file, lf_sha256: sha(text), bytes: Buffer.byteLength(text) }); return text;
}
const corpus = JSON.parse(read(prefix + 'graphs-v2.json'));
const claims = JSON.parse(read(prefix + 'claims-v2.json')).claims;
const registry = JSON.parse(read(prefix + 'metric-evaluator-registry-v1.json'));
const schema = JSON.parse(read(prefix + 'evidence-snapshot.schema.json'));
const material = JSON.parse(read(prefix + 'material-field-registry-v1.json'));
const entry = registry.entries.find(e => e.evaluator_id === 'eligible_event_count' && e.evaluator_version === 1);
assert.equal(entry.evaluator_contract_hash, 'sha256:bf2a5e70c7cf661c8b983a2598ae4142567ce9e1b97e34985851b77dcf0e7937');
assert.equal(sha(read(entry.contract_path)), entry.evaluator_contract_hash);
assert.equal(entry.roles.find(r => r.role_id === 'source').input_kind, 'node');
const manifestText = read(corpus.snapshot_manifest.path); assert.equal(sha(manifestText), corpus.snapshot_manifest.hash);
const snapshots = JSON.parse(manifestText).snapshots;
read(prefix + 'graph-binding-contract-v1.md'); read('src/next/provenance/metricDirectReads.js');
read('src/next/provenance/metricSelection.js');
const sourceSchema = schema.definitions.payload_source_state;
assert.ok(Object.hasOwn(sourceSchema.properties, 'entity_id')); assert.ok(!sourceSchema.required.includes('entity_id'));
// The reviewed rule is scoped to eligible_event_count@1 and its source role.
// Presence itself is mandatory whether the optional value exists or not.
function author(roles, nodes, snapshots) {
    assert.equal(roles.source.kind, 'node'); const alias = roles.source.alias; const node = nodes[alias];
    assert.equal(node.kind, 'source_state');
    const matches = snapshots.filter(s => s.kind === node.kind && s.ref_id === node.ref_id && s.version === node.version);
    assert.equal(matches.length, 1); assert.equal(matches[0].payload.id, node.ref_id);
    assert.equal(matches[0].semantic_fingerprint, node.semantic_fingerprint);
    return { snapshot: matches[0], observation: { node: alias, operation: 'has', segments: ['entity_id'] } };
}
const records = [];
for (const claim of claims.filter(c => c.evaluator_ref.evaluator_id === entry.evaluator_id && c.evaluator_ref.evaluator_version === entry.evaluator_version)) {
    const matches = corpus.graphs.filter(g => g.fact_key === claim.fact_key); assert.equal(matches.length, 1);
    const graph = matches[0]; const candidate = author(claim.operand_bindings, graph.nodes, snapshots);
    assert.equal(Object.hasOwn(candidate.snapshot.payload, 'entity_id'), false, 'closed_delta_only_current_absent_cases');
    assert.ok(graph.trace_contract.derivation.required_nodes.includes(candidate.observation.node));
    const current = graph.trace_contract.derivation.required_structural;
    assert.ok(!current.some(o => canonicalValue(o) === canonicalValue(candidate.observation)));
    assert.equal(graph.edges.filter(e => e.source === candidate.observation.node && e.field === 'entity_id').length, 0);
    records.push({ fact_key: claim.fact_key, evaluator_ref: claim.evaluator_ref, subject: claim.subject,
        source_role: claim.operand_bindings.source, source_node: graph.nodes[candidate.observation.node], source_snapshot: candidate.snapshot,
        source_graph_sha256: sha(canonicalValue(graph)), proposed_delta: { added: [candidate.observation], removed: [] },
        source_derivation_reads: graph.trace_contract.derivation.required_reads.filter(r => r.node === candidate.observation.node),
        source_proof_structural: graph.trace_contract.proof.required_structural.filter(r => r.node === candidate.observation.node) });
}
assert.equal(records.length, 3); assert.equal(corpus.graphs.length, 76);
const result = { schema: 'n02g-source-entity-presence-proposal-v1', base, status: 'documentary_proposal_not_applied',
    graph_accepted: false, normative_application_allowed: false, evaluator_contract_hash: entry.evaluator_contract_hash,
    source_corpus_sha256: sha(canonicalValue(corpus)), documents: [...documents.values()], records,
    proposed_totals: { changed_graphs: 3, unchanged_graphs: 73, added_structural: 3, removed_structural: 0 },
    limits: 'Source equality and inventory only; no full semantic fingerprint validation, evaluator execution, actual/oracle, normative application or host/global acceptance. Present-field branch needs its own reads/edges and is not covered by the three absent-field deltas.' };
const mode = process.argv[2]; assert.ok(['--write-new', '--check'].includes(mode) && process.argv.length === 3);
if (mode === '--write-new') fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
else assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), result);
console.log(JSON.stringify({ valid: true, mode, base, documents: documents.size, proposed_totals: result.proposed_totals }));
