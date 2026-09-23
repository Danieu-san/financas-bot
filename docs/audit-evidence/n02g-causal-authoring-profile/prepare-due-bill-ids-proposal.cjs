'use strict';
// Documentary inventory only; no evaluator, actual, oracle or normative writes.
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
const { createHash } = require('node:crypto'); const { execFileSync } = require('node:child_process');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const root = path.resolve(__dirname, '../../..'); const base = 'adc9cfcec1108c056fb2dd6f974c6f1ccd52d89c';
const prefix = 'docs/contracts/next/provenance-v2/'; const output = path.join(__dirname, 'due-bill-ids-proposal.json');
const sha = x => `sha256:${createHash('sha256').update(x).digest('hex')}`; const documents = new Map();
function read(file) {
    const text = fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
    const blob = execFileSync('git', ['show', `${base}:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    assert.equal(text, blob, `source_changed:${file}`); documents.set(file, { path: file, lf_sha256: sha(text), bytes: Buffer.byteLength(text) }); return text;
}
const corpus = JSON.parse(read(prefix + 'graphs-v2.json'));
const claims = JSON.parse(read(prefix + 'claims-v2.json')).claims;
const registry = JSON.parse(read(prefix + 'metric-evaluator-registry-v1.json'));
read(prefix + 'evidence-snapshot.schema.json'); read(prefix + 'material-field-registry-v1.json');
read(prefix + 'graph-binding-contract-v1.md'); read('src/next/provenance/metricDirectReads.js');
read('scripts/agent/validateFinancasBotNextFacts.mjs');
const manifestText = read(corpus.snapshot_manifest.path); assert.equal(sha(manifestText), corpus.snapshot_manifest.hash);
const snapshots = JSON.parse(manifestText).snapshots;
for (const id of ['due_bill_ids', 'due_bills_total']) {
    const matches = registry.entries.filter(e => e.evaluator_id === id && e.evaluator_version === 1); assert.equal(matches.length, 1);
    const e = matches[0]; assert.equal(sha(read(e.contract_path)), e.evaluator_contract_hash);
    assert.equal(e.roles.find(r => r.role_id === 'bills').input_kind, 'node_set');
    assert.equal(e.roles.find(r => r.role_id === 'bills').semantic_role, 'population');
}
function nonDerivationalAmounts(evaluator, roles, nodes) {
    assert.equal(evaluator.evaluator_id, 'due_bill_ids'); assert.equal(evaluator.evaluator_version, 1);
    assert.equal(roles.bills.kind, 'node_set'); assert.equal(new Set(roles.bills.aliases).size, roles.bills.aliases.length);
    return roles.bills.aliases.map(alias => {
        const node = nodes[alias]; assert.equal(node.kind, 'bill');
        const found = snapshots.filter(s => s.kind === node.kind && s.ref_id === node.ref_id && s.version === node.version);
        assert.equal(found.length, 1); assert.equal(found[0].payload.id, node.ref_id);
        assert.equal(found[0].semantic_fingerprint, node.semantic_fingerprint);
        return { node: alias, segments: ['amount_minor'] };
    });
}
const records = [];
for (const claim of claims.filter(c => c.evaluator_ref.evaluator_id === 'due_bill_ids' && c.evaluator_ref.evaluator_version === 1)) {
    const matches = corpus.graphs.filter(g => g.fact_key === claim.fact_key); assert.equal(matches.length, 1); const graph = matches[0];
    const nonDerivational = nonDerivationalAmounts(claim.evaluator_ref, claim.operand_bindings, graph.nodes);
    const removed = graph.trace_contract.derivation.required_reads.filter(r => nonDerivational.some(n => canonicalValue(n) === canonicalValue(r)));
    assert.equal(removed.length, 1); assert.equal(new Set(removed.map(r => canonicalValue(r))).size, removed.length);
    for (const item of removed) assert.ok(graph.trace_contract.proof.required_reads.some(r => canonicalValue(r) === canonicalValue(item)));
    records.push({ fact_key: claim.fact_key, evaluator_ref: claim.evaluator_ref, bindings: claim.operand_bindings,
        source_graph_sha256: sha(canonicalValue(graph)), current_derivation: graph.trace_contract.derivation,
        bill_nodes: Object.fromEntries(claim.operand_bindings.bills.aliases.map(alias => [alias, graph.nodes[alias]])),
        proposed_delta: { added: [], removed }, proof_reads_preserved: graph.trace_contract.proof.required_reads });
}
assert.equal(records.length, 1); assert.equal(corpus.graphs.length, 76);
const controls = claims.filter(c => c.evaluator_ref.evaluator_id === 'due_bills_total' && c.evaluator_ref.evaluator_version === 1).map(c => {
    const graph = corpus.graphs.find(g => g.fact_key === c.fact_key);
    return { fact_key: c.fact_key, evaluator_ref: c.evaluator_ref, source_graph_sha256: sha(canonicalValue(graph)),
        monetary_reads_preserved: graph.trace_contract.derivation.required_reads.filter(r => r.segments.length === 1 && r.segments[0] === 'amount_minor') };
});
assert.equal(controls.length, 1); assert.equal(controls[0].monetary_reads_preserved.length, 1);
const record = { schema: 'n02g-due-bill-ids-proposal-v1', base, status: 'documentary_proposal_not_applied',
    graph_accepted: false, normative_application_allowed: false, source_corpus_sha256: sha(canonicalValue(corpus)),
    documents: [...documents.values()], records, controls,
    proposed_totals: { changed_graphs: 1, unchanged_graphs: 75, added_reads: 0, removed_reads: 1 },
    limits: 'Source equality and declared snapshot identity only. No execution or full semantic fingerprint validation; no normative application or graph/host/global/production approval.' };
const mode = process.argv[2]; assert.ok(['--write-new', '--check'].includes(mode) && process.argv.length === 3);
if (mode === '--write-new') fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
else assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), record);
console.log(JSON.stringify({ valid: true, mode, base, documents: documents.size, proposed_totals: record.proposed_totals }));
