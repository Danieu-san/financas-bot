'use strict';
// Read-only proposal inventory: no evaluator, trace, oracle or normative writes.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const prefix = 'docs/contracts/next/provenance-v2/';
const base = '69a385832876329afb4da73ffb5cc79d1ef94254';
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'] });
const rules = [
    ['consumption_total', 'confirmed', false], ['category_consumption', 'confirmed', false],
    ['category_spent', 'confirmed', false], ['income_realized', 'confirmed', false],
    ['budget_class_consumption', 'confirmed', false], ['category_budget_remaining', 'confirmed', true],
    ['safe_daily_pace', 'estimated', true], ['eligible_event_count', 'confirmed', false]
];
const filename = path.join(__dirname, 'evidence-state-proposal.json');
const sources = new Map();
function source(file) {
    const text = read(file); assert.equal(text, git(['show', `${base}:${file}`]), `source_drift:${file}`);
    sources.set(file, { path: file, lf_sha256: hash(text) }); return text;
}
const corpus = JSON.parse(source(prefix + 'graphs-v2.json'));
const claims = JSON.parse(source(prefix + 'claims-v2.json')).claims;
const registry = JSON.parse(source(prefix + 'metric-evaluator-registry-v1.json'));
for (const file of ['claim-contract.schema.json', 'evidence-snapshot.schema.json', 'material-field-registry-v1.json',
    'graph-binding-contract-v1.md', 'authoring-contract-v1.md', 'evaluator-authoring-semantics-v1.md',
    'temporal-relations-decision-v1.md']) source(prefix + file);
// These files document existing causal guards; their execution does not supply obligations.
source('src/next/provenance/metricSelection.js'); source('src/next/provenance/metricDirectReads.js');
const contains = (items, item) => items.some(value => JSON.stringify(value) === JSON.stringify(item));
function statePredicate(graph, operand, state) {
    const literal = { literal: { type: 'enum', value: state } };
    return graph.predicates.filter(p => p.obligation === 'evidence_state' && p.op === 'eq'
        && p.args.length === 2 && p.args.some(a => JSON.stringify(a) === JSON.stringify(operand))
        && p.args.some(a => JSON.stringify(a) === JSON.stringify(literal)));
}
const records = [];
const contracts = rules.map(([metric, state, usesBudget]) => {
    const entries = registry.entries.filter(e => e.metric === metric && e.evaluator_id === metric && e.evaluator_version === 1);
    assert.equal(entries.length, 1); const entry = entries[0];
    const contractText = source(entry.contract_path); assert.equal(hash(contractText), entry.evaluator_contract_hash);
    assert.ok(entry.roles.some(r => r.role_id === 'context' && r.input_kind === 'claim_context' && r.cardinality === 'one'));
    if (usesBudget) assert.ok(entry.roles.some(r => r.role_id === 'budget' && r.input_kind === 'node' && r.cardinality === 'one'));
    const matching = claims.filter(c => c.evaluator_ref.evaluator_id === entry.evaluator_id
        && c.evaluator_ref.evaluator_version === entry.evaluator_version);
    assert.ok(matching.length > 0);
    for (const claim of matching) {
        assert.equal(claim.metric, metric); assert.equal(claim.evidence_state, state);
        assert.deepEqual(claim.operand_bindings.context, { kind: 'claim_context' });
        const graphs = corpus.graphs.filter(g => g.fact_key === claim.fact_key && g.claim_id === claim.claim_id);
        assert.equal(graphs.length, 1); const graph = graphs[0];
        const claimRead = { segments: ['evidence_state'] };
        assert.equal(contains(graph.trace_contract.derivation.required_claim_reads, claimRead), false);
        assert.equal(contains(graph.trace_contract.proof.required_claim_reads, claimRead), true);
        const predicates = statePredicate(graph, { claim: claimRead }, state); assert.equal(predicates.length, 1);
        const reads = []; const budgetPredicates = [];
        if (usesBudget) {
            const binding = claim.operand_bindings.budget; assert.equal(binding.kind, 'node');
            assert.equal(graph.nodes[binding.alias].kind, 'budget');
            assert.ok(graph.trace_contract.derivation.required_nodes.includes(binding.alias));
            const budgetRead = { node: binding.alias, segments: ['evidence_state'] };
            assert.equal(contains(graph.trace_contract.derivation.required_reads, budgetRead), false);
            assert.equal(contains(graph.trace_contract.proof.required_reads, budgetRead), true);
            const boundPredicates = statePredicate(graph, { field: budgetRead }, 'confirmed');
            assert.equal(boundPredicates.length, 1); budgetPredicates.push(...boundPredicates); reads.push(budgetRead);
        }
        records.push({ fact_key: claim.fact_key, metric, evaluator_ref: claim.evaluator_ref,
            claim_evidence_state: state, context_binding: claim.operand_bindings.context,
            budget_binding: usesBudget ? claim.operand_bindings.budget : null,
            existing_state_predicates: [...predicates, ...budgetPredicates],
            add_required_claim_reads: [claimRead], add_required_reads: reads });
    }
    return { evaluator_id: entry.evaluator_id, evaluator_version: entry.evaluator_version,
        contract_path: entry.contract_path, contract_sha256: entry.evaluator_contract_hash,
        claim_state: state, budget_state: usesBudget ? 'confirmed' : null, claims: matching.length };
});
assert.equal(corpus.graphs.length, 76); assert.equal(records.length, 28);
assert.equal(new Set(records.map(r => r.fact_key)).size, 28);
assert.equal(records.reduce((sum, r) => sum + r.add_required_reads.length, 0), 6);
const record = { schema: 'n02g-evidence-state-proposal-v1', base, stage: 'documentary_proposal_not_applied',
    graph_accepted: false, normative_application_allowed: false, oracle_used: false, evaluator_executed: false,
    sources: [...sources.values()], contracts, totals: { graphs: 76, proposed_graphs: 28, outside_scope: 48,
        added_claim_reads: 28, added_snapshot_reads: 6, removals: 0, node_edge_structural_selection_changes: 0 }, records };
const mode = process.argv[2]; assert.ok(['--write-new', '--check'].includes(mode) && process.argv.length === 3);
if (mode === '--write-new') fs.writeFileSync(filename, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
else assert.deepEqual(JSON.parse(fs.readFileSync(filename, 'utf8')), record, 'proposal_changed');
console.log(JSON.stringify({ valid: true, mode, base, totals: record.totals, graph_accepted: false, normative_application_allowed: false }));
