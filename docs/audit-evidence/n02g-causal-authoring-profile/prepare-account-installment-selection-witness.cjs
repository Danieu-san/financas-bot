'use strict';
// Focal, reproducible extraction from immutable Git objects. Diagnostic only.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
const base = '207ca56b87381d69a922224332fcdda3a629d822';
const priorProposal = '399918ccf7ea209cd4ee0255d8c4e690635a2d03';
const graphPath = 'docs/contracts/next/provenance-v2/graphs-v2.json';
const proposalPath = 'docs/audit-evidence/n02g-causal-authoring-profile/account-installment-observation-proposal.json';
const output = path.join(__dirname, 'account-installment-selection-witness.json');
const keys = [
    'S-04#1#1', 'S-06#1#1', 'S-11#1#1', 'S-11#1#2', 'S-11#1#3',
    'S-12#1#1', 'M-07#1#2', 'F-07#1#1', 'F-07#1#2', 'F-07#2#1', 'F-07#2#2'
];
const git = (...args) => execFileSync('git', ['-c', `safe.directory=${root}`, ...args],
    { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
const source = (commit, file) => git('show', `${commit}:${file}`).replaceAll('\r\n', '\n');
const hash = text => 'sha256:' + createHash('sha256').update(text).digest('hex');
const graphText = source(base, graphPath);
const corpus = JSON.parse(graphText);
const proposalText = fs.readFileSync(path.join(root, proposalPath), 'utf8').replaceAll('\r\n', '\n');
const proposalRecords = JSON.parse(proposalText).records;
assert.equal(corpus.graphs.length, 76);
assert.equal(new Set(corpus.graphs.map(graph => graph.fact_key)).size, 76);
assert.equal(proposalRecords.length, keys.length);
assert.deepEqual(proposalRecords.map(record => record.fact_key), keys);

function requiredPair(value) {
    assert.equal(typeof value.node, 'string');
    assert.ok(Array.isArray(value.segments) && value.segments.length);
    return `${value.node}.${value.segments.join('.')}`;
}
function directDependencies(graph, predicates) {
    const reads = new Set(), has = new Set(), edges = new Set();
    const templateIds = new Set();
    for (const predicate of predicates) {
        for (const arg of predicate.args) {
            if (arg.field) reads.add(requiredPair(arg.field));
            if (arg.presence) has.add(requiredPair(arg.presence));
            if (arg.edge) edges.add(arg.edge);
            if (arg.template && arg.bindings) {
                const setArg = predicate.args.find(item => item.set);
                assert.ok(setArg && Array.isArray(graph.sets[setArg.set]));
                const field = arg.bindings.field.selector;
                assert.equal(field.segments.length, 1);
                for (const alias of graph.sets[setArg.set])
                    reads.add(`${alias}.${field.segments[0]}`);
                templateIds.add(predicate.id);
            }
        }
    }
    return { reads: [...reads].sort(), has: [...has].sort(), edges: [...edges].sort(),
        expanded_template_predicate_ids: [...templateIds].sort() };
}
const records = keys.map(factKey => {
    const graph = corpus.graphs.find(item => item.fact_key === factKey);
    const record = proposalRecords.find(item => item.fact_key === factKey);
    assert.ok(graph && record);
    assert.deepEqual(record.current_derivation, graph.trace_contract.derivation,
        `base_derivation_mismatch:${factKey}`);
    assert.deepEqual(record.proposed_derivation.required_selections,
        graph.trace_contract.derivation.required_selections,
        `selection_assignment_changed:${factKey}`);
    const predicateIds = [...new Set(graph.selections.flatMap(selection => [
        ...selection.selected_predicates,
        ...selection.excluded.flatMap(excluded => excluded.predicates)
    ]))];
    const predicates = predicateIds.map(id => {
        const matches = graph.predicates.filter(predicate => predicate.id === id);
        assert.equal(matches.length, 1, `selection_predicate_ambiguous:${factKey}:${id}`);
        return matches[0];
    });
    const direct = directDependencies(graph, predicates);
    const proposedReads = new Set(record.proposed_derivation.required_reads.map(requiredPair));
    const proposedHas = new Set(record.proposed_derivation.required_structural
        .filter(value => value.operation === 'has').map(requiredPair));
    const proposedEdges = new Set(record.proposed_derivation.required_edges);
    const missing = {
        reads: direct.reads.filter(value => !proposedReads.has(value)),
        has: direct.has.filter(value => !proposedHas.has(value)),
        edges: direct.edges.filter(value => !proposedEdges.has(value))
    };
    assert.deepEqual(missing, { reads: [], has: [], edges: [] },
        `selection_observation_missing:${factKey}`);
    return { fact_key: factKey, claim_id: graph.claim_id,
        base_graph_sha256_json: hash(JSON.stringify(graph)),
        current_derivation_sha256_json: hash(JSON.stringify(graph.trace_contract.derivation)),
        proposed_derivation_sha256_json: hash(JSON.stringify(record.proposed_derivation)),
        selections: graph.selections, predicates,
        direct_predicate_dependencies: direct,
        direct_missing_in_proposed_derivation: missing };
});
const witness = {
    schema: 'n02g_account_installment_selection_witness_v1',
    scope: 'diagnostic_not_approval',
    base, prior_proposal_commit: priorProposal,
    revised_proposal_sha256_lf: hash(proposalText),
    source: { path: graphPath, git_blob: git('rev-parse', `${base}:${graphPath}`).trim(),
        sha256_lf: hash(graphText), graph_count: corpus.graphs.length },
    selected_fact_keys: keys,
    records
};
const text = JSON.stringify(witness) + '\n';
if (process.argv.includes('--check')) {
    assert.equal(fs.readFileSync(output, 'utf8'), text, 'selection_witness_mismatch');
    console.log('selection_witness=PASS records=11');
} else {
    fs.writeFileSync(output, text);
    console.log(`selection_witness=written records=${records.length}`);
}
console.log(`direct_missing=${records.reduce((n, record) => n +
    Object.values(record.direct_missing_in_proposed_derivation).reduce((m, list) => m + list.length, 0), 0)}`);
