'use strict';
// Documentary inventory only: no evaluator, trace, oracle or normative writer.
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
const { createHash } = require('node:crypto'); const { execFileSync } = require('node:child_process');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const root = path.resolve(__dirname, '../../..'); const base = '1710b570007dde9ca94ed4f79d7afddfc9c3f81b';
const prefix = 'docs/contracts/next/provenance-v2/'; const file = path.join(__dirname, 'budget-class-population-proposal.json');
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const sources = new Map();
function read(name) {
    const text = fs.readFileSync(path.join(root, name), 'utf8').replaceAll('\r\n', '\n');
    const blob = execFileSync('git', ['show', `${base}:${name}`], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    assert.equal(text, blob, `source_changed:${name}`);
    sources.set(name, { path: name, lf_sha256: sha(text), bytes: Buffer.byteLength(text) }); return text;
}
function author(roles, nodes, edges, snapshots) {
    assert.equal(roles.events.kind, 'node_set'); assert.equal(roles.categories.kind, 'node_set');
    const snapshot = (alias, kind) => {
        const node = nodes[alias]; assert.equal(node.kind, kind);
        const matches = snapshots.filter(s => s.kind === node.kind && s.ref_id === node.ref_id && s.version === node.version);
        assert.equal(matches.length, 1); assert.equal(matches[0].semantic_fingerprint, node.semantic_fingerprint);
        return matches[0].payload;
    };
    const follow = (alias, field, kind) => {
        const matches = edges.filter(e => e.source === alias && e.field === field && e.relation === 'material_ref');
        assert.equal(matches.length, 1); const target = matches[0].target;
        assert.equal(nodes[target].kind, kind);
        assert.equal(snapshot(alias, nodes[alias].kind)[field], nodes[target].ref_id);
        snapshot(target, kind); return target;
    };
    const category = event => {
        const alias = follow(event, 'category_id', 'category'); assert.ok(roles.categories.aliases.includes(alias));
        return { alias, kind: snapshot(alias, 'category').kind };
    };
    const effective = new Set(); const population = [];
    for (const event of roles.events.aliases) {
        snapshot(event, 'event'); const own = category(event); let actual = null; let source = null;
        assert.ok(['expense', 'compensation', 'income', 'neutral'].includes(own.kind));
        if (own.kind === 'expense') actual = own;
        if (own.kind === 'compensation') {
            source = follow(event, 'compensates', 'event'); actual = category(source); assert.equal(actual.kind, 'expense');
        }
        if (actual) effective.add(actual.alias);
        population.push({ event, own_category: own.alias, economic_kind: own.kind, compensation_source: source, effective_category: actual?.alias || null });
    }
    return { population, obligations: [...effective].sort().map(node => ({ node, segments: ['budget_class'] })) };
}
const corpus = JSON.parse(read(prefix + 'graphs-v2.json')); const claims = JSON.parse(read(prefix + 'claims-v2.json'));
const registry = JSON.parse(read(prefix + 'metric-evaluator-registry-v1.json'));
const entry = registry.entries.find(e => e.evaluator_id === 'budget_class_consumption' && e.evaluator_version === 1);
assert.equal(entry.evaluator_contract_hash, 'sha256:e336d72e581c06401fd6ef3cc5b041b6c2b7ad56745fe25ff5980ca763ed8561');
assert.equal(sha(read(entry.contract_path)), entry.evaluator_contract_hash);
for (const role of ['events', 'categories']) assert.equal(entry.roles.find(r => r.role_id === role).input_kind, 'node_set');
const manifestText = read(corpus.snapshot_manifest.path); assert.equal(sha(manifestText), corpus.snapshot_manifest.hash);
const manifest = JSON.parse(manifestText);
for (const name of ['claim-contract.schema.json', 'evidence-snapshot.schema.json', 'graph-binding-contract-v1.md', 'material-field-registry-v1.json']) read(prefix + name);
read('src/next/provenance/metricSelection.js'); read('scripts/agent/validateFinancasBotNextFacts.mjs');
const records = [];
for (const claim of claims.claims.filter(c => c.evaluator_ref.evaluator_id === entry.evaluator_id && c.evaluator_ref.evaluator_version === entry.evaluator_version)) {
    const graph = corpus.graphs.find(g => g.fact_key === claim.fact_key);
    // Pass ONLY roles/material nodes/relations, not old obligations or selection.
    const candidate = author(claim.operand_bindings, graph.nodes, graph.edges, manifest.snapshots);
    const current = graph.trace_contract.derivation.required_reads.filter(r => r.segments.length === 1 && r.segments[0] === 'budget_class');
    const equals = (a, b) => canonicalValue(a) === canonicalValue(b);
    const removed = current.filter(r => !candidate.obligations.some(c => equals(r, c)));
    const added = candidate.obligations.filter(r => !current.some(c => equals(r, c)));
    assert.equal(removed.length, 1); assert.equal(added.length, 0);
    const removedAlias = removed[0].node;
    assert.ok(claim.operand_bindings.categories.aliases.includes(removedAlias));
    assert.equal(graph.edges.filter(e => e.target === removedAlias).length, 0);
    assert.ok(graph.trace_contract.proof.required_reads.some(r => equals(r, removed[0])));
    records.push({ fact_key: claim.fact_key, evaluator_ref: claim.evaluator_ref,
        source_graph_sha256: sha(canonicalValue(graph)), operand_bindings: claim.operand_bindings,
        category_nodes: Object.fromEntries(claim.operand_bindings.categories.aliases.map(alias => [alias, graph.nodes[alias]])),
        population: candidate.population, current_class_reads: current, proposed_class_reads: candidate.obligations,
        proposed_delta: { added, removed }, preserved_removed_node_reads: graph.trace_contract.derivation.required_reads
            .filter(r => r.node === removedAlias && !equals(r, removed[0])),
        unchanged_proof_reads: graph.trace_contract.proof.required_reads.filter(r => r.node === removedAlias) });
}
assert.equal(records.length, 2); assert.equal(corpus.graphs.length, 76);
const record = { schema: 'n02g-budget-class-population-proposal-v1', base, status: 'documentary_proposal_not_applied',
    evaluator_contract_hash: entry.evaluator_contract_hash, graph_accepted: false, normative_application_allowed: false,
    source_corpus_sha256: sha(canonicalValue(corpus)), documents: [...sources.values()], records,
    proposed_totals: { changed_graphs: 2, unchanged_graphs: 74, removed_reads: 2, added_reads: 0 },
    limits: 'Local inventory and source-byte equality only. Does not validate full semantic fingerprints, execute runtime, apply a delta or grant graph/host/global acceptance.' };
const mode = process.argv[2]; assert.ok(['--write-new', '--check'].includes(mode) && process.argv.length === 3);
if (mode === '--write-new') fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
else assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), record);
console.log(JSON.stringify({ valid: true, mode, base, documents: sources.size, proposed_totals: record.proposed_totals }));
