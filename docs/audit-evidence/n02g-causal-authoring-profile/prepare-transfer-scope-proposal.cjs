'use strict';
// Documentary inventory only. Never executes an evaluator or edits normative files.
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
const { createHash } = require('node:crypto'); const { execFileSync } = require('node:child_process');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const root = path.resolve(__dirname, '../../..'); const base = '94138a06d293e0fb7d68f4d3387d9ca85e8c51d7';
const prefix = 'docs/contracts/next/provenance-v2/'; const output = path.join(__dirname, 'transfer-scope-proposal.json');
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
for (const file of ['src/next/provenance/metricEffects.js', 'src/next/provenance/metricSelection.js',
    'src/next/provenance/metricReferences.js', 'scripts/agent/validateFinancasBotNextFacts.mjs']) read(file);
const manifest = read(corpus.snapshot_manifest.path); assert.equal(sha(manifest), corpus.snapshot_manifest.hash);
const snapshots = JSON.parse(manifest).snapshots;
const entries = registry.entries.filter(e => e.evaluator_id === 'consumption_effect' && e.evaluator_version === 1);
assert.equal(entries.length, 1); const entry = entries[0];
assert.equal(sha(read(entry.contract_path)), entry.evaluator_contract_hash);
assert.deepEqual(entry.roles.find(r => r.role_id === 'events'), {
    role_id: 'events', semantic_role: 'population', input_kind: 'node_set', cardinality: 'many', ordered: true
});
// Manually authored semantic profile, reviewed against metricEffects separately.
const profile = { evaluator_id: 'consumption_effect', evaluator_version: 1, subject_kind: 'transfer_pair',
    role: 'events', kind: 'event', field: 'transfer_pair', operation: 'has_then_get' };
function requirements(claim, graph) {
    assert.equal(claim.evaluator_ref.evaluator_id, profile.evaluator_id);
    assert.equal(claim.evaluator_ref.evaluator_version, profile.evaluator_version);
    assert.equal(claim.subject.kind, profile.subject_kind);
    const role = claim.operand_bindings[profile.role]; assert.equal(role.kind, 'node_set');
    assert.equal(new Set(role.aliases).size, role.aliases.length);
    const required_reads = []; const required_structural = []; const sources = []; const identities = new Set();
    for (const alias of role.aliases) {
        const node = graph.nodes[alias]; assert.equal(node.binding, 'snapshot'); assert.equal(node.kind, profile.kind);
        assert.ok(!identities.has(node.ref_id)); identities.add(node.ref_id);
        const matches = snapshots.filter(s => s.kind === node.kind && s.ref_id === node.ref_id && s.version === node.version);
        assert.equal(matches.length, 1); const snapshot = matches[0]; assert.equal(snapshot.payload.id, node.ref_id);
        assert.equal(snapshot.semantic_fingerprint, node.semantic_fingerprint);
        const present = Object.hasOwn(snapshot.payload, profile.field);
        required_structural.push({ node: alias, operation: 'has', segments: [profile.field] });
        if (present) required_reads.push({ node: alias, segments: [profile.field] });
        sources.push({ alias, binding: node, present, source_snapshot_sha256: sha(canonicalValue(snapshot)) });
    }
    return { required_reads, required_structural, sources };
}
const same = (a, b) => canonicalValue(a) === canonicalValue(b);
const records = []; const excluded_claims = [];
for (const claim of claims.filter(c => c.evaluator_ref.evaluator_id === profile.evaluator_id && c.evaluator_ref.evaluator_version === profile.evaluator_version)) {
    if (claim.subject.kind !== profile.subject_kind) { excluded_claims.push({ fact_key: claim.fact_key, subject: claim.subject }); continue; }
    const graphs = corpus.graphs.filter(g => g.fact_key === claim.fact_key); assert.equal(graphs.length, 1);
    const graph = graphs[0]; assert.equal(graph.claim_id, claim.claim_id); const expected = requirements(claim, graph);
    const d = graph.trace_contract.derivation; const proof = graph.trace_contract.proof;
    const reads = expected.required_reads.filter(r => !d.required_reads.some(x => same(x, r)));
    const structural = expected.required_structural.filter(r => !d.required_structural.some(x => same(x, r)));
    records.push({ fact_key: claim.fact_key, evaluator_ref: claim.evaluator_ref, subject: claim.subject,
        bindings: claim.operand_bindings, source_graph_sha256: sha(canonicalValue(graph)), requirements: expected,
        current_derivation: d, proposed_delta: { added_reads: reads, added_structural: structural, removed: [] },
        proof_matching_reads: proof.required_reads.filter(r => expected.required_reads.some(x => same(x, r))),
        proof_matching_structural: proof.required_structural.filter(r => expected.required_structural.some(x => same(x, r))),
        proof_preserved_sha256: sha(canonicalValue(proof)) });
}
assert.equal(corpus.graphs.length, 76); assert.equal(records.length, 3); assert.equal(excluded_claims.length, 1);
for (const r of records) {
    assert.equal(r.proposed_delta.added_reads.length, 2); assert.equal(r.proposed_delta.added_structural.length, 2);
    assert.equal(r.proof_matching_reads.length, 2); assert.equal(r.proof_matching_structural.length, 0);
}
const record = { schema: 'n02g-transfer-scope-proposal-v1', base, status: 'documentary_proposal_not_applied',
    graph_accepted: false, normative_application_allowed: false, profile,
    source_corpus_sha256: sha(canonicalValue(corpus)), documents: [...documents.values()], records, excluded_claims,
    proposed_totals: { changed_graphs: 3, unchanged_graphs: 73, added_reads: 6, added_structural: 6, removed: 0 },
    limits: 'Full source equality and declared identity only; no complete fingerprint recomputation, generated property tests, evaluator execution or normative application. No graph/host/global/production approval.' };
const mode = process.argv[2]; assert.ok(['--write-new', '--check'].includes(mode) && process.argv.length === 3);
if (mode === '--write-new') fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
else assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), record);
console.log(JSON.stringify({ valid: true, mode, base, documents: documents.size, proposed_totals: record.proposed_totals }));
