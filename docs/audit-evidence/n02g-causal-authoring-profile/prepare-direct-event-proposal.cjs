'use strict';
// Documentary projection/proposal. No evaluator, trace, oracle or normative writes.
const fs = require('node:fs'); const path = require('node:path');
const assert = require('node:assert/strict'); const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const root = path.resolve(__dirname, '../../..');
const base = '07a2b2f04707c504c5412c0fc1456f1ced02fcf4';
const prefix = 'docs/contracts/next/provenance-v2/';
const output = path.join(__dirname, 'direct-event-proposal.json');
const metrics = ['balance_delta', 'invoice_payment_amount', 'invoice_payment_target_card', 'statement_payment_correspondence'];
const sha = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const digest = value => sha(canonicalValue(value)); const documents = new Map();
function read(file) {
    const text = fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
    const original = execFileSync('git', ['show', `${base}:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).replaceAll('\r\n', '\n');
    assert.equal(text, original, `source_changed:${file}`);
    const blob = execFileSync('git', ['rev-parse', `${base}:${file}`], { cwd: root, encoding: 'utf8' }).trim();
    documents.set(file, { path: file, blob, lf_sha256: sha(text), bytes: Buffer.byteLength(text) });
    return text;
}
const corpus = JSON.parse(read(prefix + 'graphs-v2.json'));
const claims = JSON.parse(read(prefix + 'claims-v2.json')).claims;
const registry = JSON.parse(read(prefix + 'metric-evaluator-registry-v1.json'));
const schema = JSON.parse(read(prefix + 'evidence-snapshot.schema.json'));
read(prefix + 'material-field-registry-v1.json'); read(prefix + 'graph-binding-contract-v1.md');
const manifestText = read(corpus.snapshot_manifest.path);
assert.equal(sha(manifestText), corpus.snapshot_manifest.hash);
const snapshots = JSON.parse(manifestText).snapshots;
const eventSchema = schema.definitions.payload_event;
assert.equal(eventSchema.additionalProperties, false);
const statementFields = ['statement_id', 'settles_statement_id', 'settles_statement_period'];
for (const field of statementFields) assert.equal(Object.hasOwn(eventSchema.properties, field), false);
const contracts = metrics.map(metric => {
    const entries = registry.entries.filter(e => e.evaluator_id === metric && e.evaluator_version === 1);
    assert.equal(entries.length, 1); const entry = entries[0]; const text = read(entry.contract_path);
    assert.equal(sha(text), entry.evaluator_contract_hash);
    return { evaluator_id: metric, evaluator_version: 1, roles: entry.roles, contract: JSON.parse(text) };
});
assert.equal(corpus.graphs.length, 76);
assert.equal(new Set(corpus.graphs.map(g => g.fact_key)).size, 76);
assert.equal(new Set(claims.map(c => c.fact_key)).size, claims.length);
const before = digest(corpus);
function proposedDelta(metric, bindings, graph) {
    assert.ok(metrics.includes(metric), 'unknown_metric');
    assert.equal(bindings.event.kind, 'node');
    const alias = bindings.event.alias; assert.equal(graph.nodes[alias].kind, 'event');
    assert.ok(graph.trace_contract.derivation.required_nodes.includes(alias));
    if (metric !== 'statement_payment_correspondence') return [];
    const operation = { node: alias, operation: 'keys', segments: [] };
    assert.ok(!graph.trace_contract.derivation.required_structural.some(x => digest(x) === digest(operation)), 'already_present');
    return [operation];
}
function snapshot(graph, alias) {
    const node = graph.nodes[alias]; assert.equal(node.binding, 'snapshot');
    const found = snapshots.filter(s => s.kind === node.kind && s.ref_id === node.ref_id && s.version === node.version);
    assert.equal(found.length, 1); const s = found[0]; assert.equal(s.payload.id, node.ref_id);
    assert.equal(s.semantic_fingerprint, node.semantic_fingerprint); return s;
}
const records = [];
for (const claim of claims.filter(c => metrics.includes(c.evaluator_ref.evaluator_id))) {
    assert.equal(claim.evaluator_ref.evaluator_version, 1);
    assert.equal(claim.metric, claim.evaluator_ref.evaluator_id);
    const found = corpus.graphs.filter(g => g.fact_key === claim.fact_key); assert.equal(found.length, 1);
    const graph = found[0]; assert.equal(graph.claim_id, claim.claim_id);
    const eventAlias = claim.operand_bindings.event.alias; const event = snapshot(graph, eventAlias);
    const cardAlias = claim.operand_bindings.card?.alias;
    const aliases = [eventAlias, ...(cardAlias ? [cardAlias] : [])];
    const links = graph.edges.filter(e => aliases.includes(e.source) && e.relation === 'material_ref').map(edge => {
        const source = snapshot(graph, edge.source); const target = snapshot(graph, edge.target);
        assert.equal(source.payload[edge.field], target.payload.id);
        return { edge, source_value: source.payload[edge.field], target_binding: graph.nodes[edge.target],
            derivation_required: graph.trace_contract.derivation.required_edges.includes(edge.id),
            proof_required: graph.trace_contract.proof.required_edges.includes(edge.id),
            target_derivation_reads: graph.trace_contract.derivation.required_reads.filter(r => r.node === edge.target),
            target_proof_reads: graph.trace_contract.proof.required_reads.filter(r => r.node === edge.target) };
    });
    const referencedPredicates = new Set(links.flatMap(x => x.edge.proof_predicates));
    const predicates = graph.predicates.filter(p => referencedPredicates.has(p.id));
    assert.equal(predicates.length, referencedPredicates.size);
    records.push({ fact_key: claim.fact_key, claim_id: claim.claim_id, evaluator_ref: claim.evaluator_ref,
        operand_bindings: claim.operand_bindings, source_graph_sha256: digest(graph),
        current_derivation: graph.trace_contract.derivation, event_schema_keys: Object.keys(eventSchema.properties).sort(),
        event_snapshot_keys: Object.keys(event.payload).sort(), links, proof_predicates: predicates,
        proof_preserved_sha256: digest(graph.trace_contract.proof),
        proposed_delta: { added_structural: proposedDelta(claim.metric, claim.operand_bindings, graph), removed: [] } });
}
assert.equal(records.length, 5);
assert.equal(records.flatMap(r => r.proposed_delta.added_structural).length, 1);
const simulated = structuredClone(corpus);
for (const r of records) simulated.graphs.find(g => g.fact_key === r.fact_key).trace_contract.derivation.required_structural.push(...r.proposed_delta.added_structural);
assert.equal(simulated.graphs.filter((g, i) => digest(g) !== digest(corpus.graphs[i])).length, 1);
for (let i = 0; i < simulated.graphs.length; i++) {
    assert.deepEqual(simulated.graphs[i].trace_contract.proof, corpus.graphs[i].trace_contract.proof);
    const copy = structuredClone(simulated.graphs[i]); copy.trace_contract.derivation.required_structural = corpus.graphs[i].trace_contract.derivation.required_structural;
    assert.deepEqual(copy, corpus.graphs[i]);
}
// Class properties use semantic roles, never observed traces or financial R.
let renamed = 0;
for (const r of records) for (const suffix of ['a', 'b', 'c']) {
    const original = corpus.graphs.find(g => g.fact_key === r.fact_key);
    const g = structuredClone(original); const bindings = structuredClone(r.operand_bindings);
    const old = bindings.event.alias; const next = `renamed-${suffix}`;
    g.nodes[next] = g.nodes[old]; delete g.nodes[old]; bindings.event.alias = next;
    g.trace_contract.derivation.required_nodes = g.trace_contract.derivation.required_nodes.map(a => a === old ? next : a);
    g.edges = g.edges.map((e, i) => ({ ...e, id: `edge-${suffix}-${i}`, source: e.source === old ? next : e.source, target: e.target === old ? next : e.target }));
    assert.deepEqual(proposedDelta(r.evaluator_ref.evaluator_id, bindings, g), r.proposed_delta.added_structural.map(x => ({ ...x, node: next })));
    renamed++;
}
const reversed = [...records].reverse().map(r => [r.fact_key, proposedDelta(r.evaluator_ref.evaluator_id, r.operand_bindings, corpus.graphs.find(g => g.fact_key === r.fact_key))]);
assert.deepEqual(Object.fromEntries(reversed), Object.fromEntries(records.map(r => [r.fact_key, r.proposed_delta.added_structural])));
const statement = records.find(r => r.evaluator_ref.evaluator_id === 'statement_payment_correspondence');
const statementGraph = corpus.graphs.find(g => g.fact_key === statement.fact_key);
assert.throws(() => proposedDelta('unknown', statement.operand_bindings, statementGraph));
assert.throws(() => proposedDelta('statement_payment_correspondence', { event: { kind: 'node_set', aliases: ['x', 'y'] } }, statementGraph));
assert.throws(() => proposedDelta('statement_payment_correspondence', statement.operand_bindings, simulated.graphs.find(g => g.fact_key === statement.fact_key)));
assert.equal(digest(corpus), before);
const record = { schema: 'n02g-direct-event-proposal-v1', base, status: 'documentary_proposal_not_applied',
    graph_accepted: false, normative_application_allowed: false, runtime_approval: false,
    source_corpus_sha256: before, documents: [...documents.values()], contracts, records,
    proposed_totals: { focal_graphs: 5, changed_graphs: 1, unchanged_graphs: 75, added_structural: 1, removed: 0 },
    checks: { renamed_cases: renamed, reordered: true, unknown_metric_rejected: true, invalid_event_role_rejected: true,
        repeated_operation_rejected: true, original_corpus_unchanged: true, all_proof_preserved: true },
    limits: 'Document identity/projection and simulated delta only. No evaluator, oracle, full semantic fingerprint validation or financial execution; no runtime, graph, global or production acceptance.' };
const mode = process.argv[2]; assert.ok(['--write-new', '--check'].includes(mode) && process.argv.length === 3);
if (mode === '--write-new') fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
else assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), record);
console.log(JSON.stringify({ valid: true, mode, base, documents: documents.size, proposed_totals: record.proposed_totals, checks: record.checks }));
