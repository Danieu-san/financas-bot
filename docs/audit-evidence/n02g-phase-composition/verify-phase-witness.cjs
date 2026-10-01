'use strict';
// Bounded extraction of immutable AUTHORING inputs, not runtime/trace evidence.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const SOURCE_SHA = '6baf88dc8b33326f8e05245e38f9682cc722c0be';
const ROOT = path.resolve(__dirname, '../../..');
const PREFIX = 'docs/contracts/next/provenance-v2/';
const OUTPUT = path.join(__dirname, 'phase-witness.json');
const FULL_GUARD_METRICS = Object.freeze([
    'movement_ids', 'account_balance', 'installments_realized',
    'installments_realized_amount', 'installments_projected',
    'installments_projected_amount', 'projected_installments'
]);
const RATIFIED_KEYS = Object.freeze([
    'S-04#1#1', 'S-06#1#1', 'S-11#1#1', 'S-11#1#2', 'S-11#1#3',
    'S-12#1#1', 'M-07#1#2', 'F-07#1#1', 'F-07#1#2', 'F-07#2#1', 'F-07#2#2'
]);
const sha = text => 'sha256:' + createHash('sha256').update(text).digest('hex');
const git = args => execFileSync('git', ['-c', `safe.directory=${ROOT}`, ...args],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 }).trimEnd();
function frozenText(file) {
    // Do not trim source bytes: hashes describe complete UTF-8 source after LF normalization.
    return execFileSync('git', ['-c', `safe.directory=${ROOT}`, 'show', `${SOURCE_SHA}:${file}`],
        { cwd: ROOT, encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 }).replaceAll('\r\n', '\n');
}
function unique(values, name) {
    assert.equal(new Set(values).size, values.length, `duplicate:${name}`);
}
function buildWitness() {
    assert.equal(git(['rev-parse', `${SOURCE_SHA}^{commit}`]), SOURCE_SHA);
    const documents = {};
    const read = file => {
        const text = frozenText(file);
        documents[file] = { source_sha: SOURCE_SHA, git_blob: git(['rev-parse', `${SOURCE_SHA}:${file}`]),
            sha256_utf8_lf: sha(text), bytes_utf8_lf: Buffer.byteLength(text, 'utf8') };
        return JSON.parse(text);
    };
    const graphs = read(PREFIX + 'graphs-v2.json').graphs;
    const claims = read(PREFIX + 'claims-v2.json').claims;
    const entries = read(PREFIX + 'metric-evaluator-registry-v1.json').entries;
    assert.equal(graphs.length, 76); unique(graphs.map(g => g.fact_key), 'graphs');
    assert.equal(claims.length, 76); unique(claims.map(c => c.fact_key), 'claims');
    assert.equal(entries.length, 39); unique(entries.map(e => e.metric), 'metrics');
    unique(entries.map(e => `${e.evaluator_id}@${e.evaluator_version}`), 'evaluators');
    assert.deepEqual([...graphs.map(g => g.fact_key)].sort(), [...claims.map(c => c.fact_key)].sort());
    const byMetric = new Map(entries.map(e => [e.metric, e]));
    for (const c of claims) assert.ok(byMetric.has(c.metric), `unknown_metric:${c.metric}`);
    for (const metric of FULL_GUARD_METRICS) assert.ok(byMetric.has(metric), `profile_metric:${metric}`);
    const matchedKeys = claims.filter(c => FULL_GUARD_METRICS.includes(c.metric)).map(c => c.fact_key).sort();
    // These keys are evidence of the previously approved scope, NEVER runtime dispatch inputs.
    assert.deepEqual(matchedKeys, [...RATIFIED_KEYS].sort(), 'ratified_scope_changed');
    const policy = entries.map(e => ({ evaluator_id: e.evaluator_id,
        evaluator_version: e.evaluator_version, metric: e.metric,
        contract_path: e.contract_path, evaluator_contract_hash: e.evaluator_contract_hash,
        proposed_derivation_mode: FULL_GUARD_METRICS.includes(e.metric) ?
            'formula_plus_selection_guards' : 'formula_only' }));
    const focal = ['S-11#1#1', 'M-03#1#1'].map(key => {
        const graph = graphs.find(g => g.fact_key === key);
        const claim = claims.find(c => c.fact_key === key);
        assert.equal(graph.claim_id, claim.claim_id);
        const entry = byMetric.get(claim.metric);
        const contract = read(entry.contract_path);
        assert.equal(contract.metric, claim.metric);
        const guardIds = [...new Set(graph.selections.flatMap(s =>
            [...s.selected_predicates, ...s.excluded.flatMap(x => x.predicates)]))];
        unique(graph.predicates.map(p => p.id), `predicate:${key}`);
        for (const id of guardIds) assert.ok(graph.predicates.some(p => p.id === id), `guard:${key}:${id}`);
        const wanted = arg => (arg.presence && ['budget_class', 'installment_plan'].includes(
            arg.presence.segments.join('.'))) || (arg.field && arg.field.node === 'evt_bill_projected' &&
            arg.field.segments.join('.') === 'state');
        const predicates = graph.predicates.filter(p => guardIds.includes(p.id) && p.args.some(wanted));
        const relevant = op => ['budget_class', 'installment_plan'].includes(op.segments.join('.')) ||
            (op.node === 'evt_bill_projected' && op.segments.join('.') === 'state');
        const phases = Object.fromEntries(['derivation', 'proof'].map(phase => [phase, {
            required_reads: graph.trace_contract[phase].required_reads.filter(relevant),
            required_structural: graph.trace_contract[phase].required_structural.filter(relevant),
            required_selections: graph.trace_contract[phase].required_selections
        }]));
        const selectionBindings = graph.selections.map(s => ({
            candidate_set: s.candidate_set, selected_set: s.selected_set,
            candidate_count: graph.sets[s.candidate_set].length,
            matching_node_set_roles: Object.entries(claim.operand_bindings)
                .filter(([, b]) => b.kind === 'node_set' &&
                    JSON.stringify(b.aliases) === JSON.stringify(graph.sets[s.candidate_set]))
                .map(([role]) => role)
        }));
        for (const s of selectionBindings) assert.equal(s.matching_node_set_roles.length, 1);
        return { fact_key: key, metric: claim.metric, claim_id: claim.claim_id,
            evaluator_contract: contract, selection_bindings: selectionBindings,
            complete_authored_selection_guard_count: guardIds.length,
            relevant_selection_guards: predicates, relevant_phase_obligations: phases };
    });
    const installment = focal[0], budget = focal[1];
    assert.ok(installment.relevant_phase_obligations.derivation.required_reads.some(r =>
        r.node === 'evt_bill_projected' && r.segments.join('.') === 'state'));
    assert.equal(installment.relevant_phase_obligations.derivation.required_structural.filter(r =>
        r.operation === 'has' && r.segments.join('.') === 'installment_plan').length, 12);
    for (const alias of ['income_salary', 'neutral_transfer', 'neutral_invoice_payment']) {
        assert.ok(budget.relevant_selection_guards.some(p => p.args.some(a => a.presence &&
            a.presence.node === alias && a.presence.segments.join('.') === 'budget_class')));
        assert.ok(budget.relevant_phase_obligations.proof.required_structural.some(r =>
            r.node === alias && r.operation === 'has' && r.segments.join('.') === 'budget_class'));
        assert.ok(!budget.relevant_phase_obligations.derivation.required_structural.some(r =>
            r.node === alias && r.operation === 'has' && r.segments.join('.') === 'budget_class'));
    }
    return { schema_version: 1, stage: 'normative_phase_composition_proposal_only',
        source_sha: SOURCE_SHA, graph_count: graphs.length, distinct_fact_keys: graphs.length,
        registry_entry_count: entries.length, source_documents: documents,
        ratified_account_installment_scope: { graph_count: matchedKeys.length,
            fact_keys_for_evidence_only: matchedKeys, metric_signatures: [...FULL_GUARD_METRICS] },
        proposed_profile_inventory: policy, focal_records: focal,
        limitations: ['authoring extraction, not evaluator execution',
            'only relevant fields of two records are projected; not a full graph audit',
            'proposed policy is not ratified', 'source hashes normalize only CRLF to LF',
            'no runtime/recorder/oracle/expected trace is used to build this witness'] };
}
const expected = buildWitness();
const validate = value => assert.deepEqual(value, expected, 'witness_mismatch');
const negatives = [
    value => { value.source_sha = '0'.repeat(40); },
    value => { value.proposed_profile_inventory.pop(); },
    value => { value.focal_records[0].relevant_phase_obligations.derivation.required_structural = []; },
    value => { value.focal_records[1].relevant_phase_obligations.derivation.required_structural.push(
        { node: 'income_salary', operation: 'has', segments: ['budget_class'] }); }
];
for (const mutate of negatives) {
    const changed = JSON.parse(JSON.stringify(expected)); mutate(changed);
    assert.throws(() => validate(changed), /witness_mismatch/);
}
const args = process.argv.slice(2);
assert.ok(args.length === 1 && ['--write', '--check'].includes(args[0]), 'use --write or --check');
if (args[0] === '--write') fs.writeFileSync(OUTPUT, JSON.stringify(expected, null, 2) + '\n', 'utf8');
validate(JSON.parse(fs.readFileSync(OUTPUT, 'utf8')));
console.log(JSON.stringify({ valid: true, source_sha: SOURCE_SHA, graph_count: 76,
    registry_profiles: 39, ratified_full_guard_graphs: 11, focal_records: 2,
    witness_integrity_negatives: negatives.length, runtime_tests_executed: 0 }));
