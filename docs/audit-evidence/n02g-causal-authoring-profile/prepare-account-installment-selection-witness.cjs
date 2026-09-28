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
const revisedProposal = '629a6871ffbdaa581fb64bd59165589bae04c92a';
const graphPath = 'docs/contracts/next/provenance-v2/graphs-v2.json';
const proposalPath = 'docs/audit-evidence/n02g-causal-authoring-profile/account-installment-observation-proposal.json';
const output = path.join(__dirname, 'account-installment-selection-witness.json');
const summaryOutput = path.join(__dirname, 'account-installment-selection-summary.md');
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
const proposalText = source(revisedProposal, proposalPath);
assert.equal(fs.readFileSync(path.join(root, proposalPath), 'utf8').replaceAll('\r\n', '\n'),
    proposalText, 'working_proposal_differs_from_immutable_commit');
const proposalRecords = JSON.parse(proposalText).records;
assert.equal(corpus.graphs.length, 76);
assert.equal(new Set(corpus.graphs.map(graph => graph.fact_key)).size, 76);
assert.equal(proposalRecords.length, keys.length);
assert.deepEqual(proposalRecords.map(record => record.fact_key), keys);

function requiredPair(value, structural = false) {
    exactKeys(value, structural ? ['node', 'segments', 'operation'] :
        ['node', 'segments'], 'selection_field_shape');
    assert.equal(typeof value.node, 'string');
    assert.ok(Array.isArray(value.segments) && value.segments.length === 1 &&
        typeof value.segments[0] === 'string');
    return `${value.node}.${value.segments.join('.')}`;
}
function exactKeys(value, keys, label) {
    assert.ok(value && typeof value === 'object' && !Array.isArray(value), label);
    assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), label);
}
function directDependencies(graph, predicates) {
    const reads = new Set(), has = new Set(), edges = new Set();
    const templateIds = new Set();
    for (const predicate of predicates) {
        assert.ok(Array.isArray(predicate.args), `predicate_args:${predicate.id}`);
        let setRef;
        for (const arg of predicate.args) {
            assert.ok(arg && typeof arg === 'object' && !Array.isArray(arg),
                `selection_arg_object:${predicate.id}`);
            const forms = Object.keys(arg).sort();
            const form = forms.length === 1 ? forms[0] : forms.join('+');
            switch (form) {
            case 'field':
                reads.add(requiredPair(arg.field));
                break;
            case 'presence':
                has.add(requiredPair(arg.presence));
                break;
            case 'edge':
                assert.equal(typeof arg.edge, 'string');
                assert.ok(graph.edges.some(edge => edge.id === arg.edge));
                edges.add(arg.edge);
                break;
            case 'claim':
                exactKeys(arg.claim, ['segments'], `selection_claim:${predicate.id}`);
                assert.deepEqual(arg.claim.segments, ['period']);
                break;
            case 'literal':
                exactKeys(arg.literal, ['type', 'value'], `selection_literal:${predicate.id}`);
                break;
            case 'period_ref':
                assert.equal(typeof arg.period_ref, 'string');
                assert.ok(graph.windows[arg.period_ref]);
                break;
            case 'set':
                assert.equal(typeof arg.set, 'string');
                assert.ok(Array.isArray(graph.sets[arg.set]));
                setRef = arg.set;
                break;
            case 'bindings+template': {
                assert.ok(setRef && Array.isArray(graph.sets[setRef]));
                exactKeys(arg.template, ['id', 'version', 'hash'],
                    `selection_template:${predicate.id}`);
                assert.equal(arg.template.id, 'date_within_period');
                assert.equal(arg.template.version, 1);
                assert.equal(arg.template.hash,
                    'sha256:34e3de01f97da0b4f027255e4313258f201607adb8634a47f6892f82128fc61b');
                exactKeys(arg.bindings, ['field', 'period'],
                    `selection_bindings:${predicate.id}`);
                exactKeys(arg.bindings.field, ['selector'],
                    `selection_field_binding:${predicate.id}`);
                exactKeys(arg.bindings.field.selector, ['kind', 'segments'],
                    `selection_field_selector:${predicate.id}`);
                assert.equal(arg.bindings.field.selector.kind, 'event');
                assert.equal(arg.bindings.field.selector.segments.length, 1);
                const periodKeys = Object.keys(arg.bindings.period).sort();
                assert.ok(periodKeys.length === 1 &&
                    ['claim', 'period_ref'].includes(periodKeys[0]),
                `selection_period_binding:${predicate.id}`);
                if (periodKeys[0] === 'claim') {
                    exactKeys(arg.bindings.period.claim, ['segments'],
                        `selection_period_claim:${predicate.id}`);
                    assert.deepEqual(arg.bindings.period.claim.segments, ['period']);
                } else {
                    assert.equal(arg.bindings.period.period_ref, 'selection_window');
                    assert.ok(graph.windows.selection_window);
                }
                for (const alias of graph.sets[setRef])
                    reads.add(`${alias}.${arg.bindings.field.selector.segments[0]}`);
                templateIds.add(predicate.id);
                break;
            }
            default:
                assert.fail(`unsupported_selection_arg:${predicate.id}:${form}`);
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
    const proposedReads = new Set(record.proposed_derivation.required_reads.map(value => requiredPair(value)));
    const proposedHas = new Set(record.proposed_derivation.required_structural
        .filter(value => value.operation === 'has').map(value => requiredPair(value, true)));
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
    schema: 'n02g_account_installment_selection_witness_v2',
    scope: 'diagnostic_not_approval',
    base, prior_proposal_commit: priorProposal, revised_proposal_commit: revisedProposal,
    revised_proposal_sha256_lf: hash(proposalText),
    source: { path: graphPath, git_blob: git('rev-parse', `${base}:${graphPath}`).trim(),
        sha256_lf: hash(graphText), graph_count: corpus.graphs.length },
    selected_fact_keys: keys,
    records
};
const text = JSON.stringify(witness, null, 2) + '\n';
for (const invalid of [
    { id: 'unknown', args: [{ hidden_read: { node: 'x', segments: ['id'] } }] },
    { id: 'mixed', args: [{ field: { node: 'x', segments: ['id'] },
        hidden_read: { node: 'x', segments: ['secret'] } }] }
]) assert.throws(() => directDependencies(corpus.graphs[0], [invalid]),
    /unsupported_selection_arg/);
const count = (record, version, name) => record[version][name].length;
const delta = name => records.reduce((sum, record) => {
    const sourceRecord = proposalRecords.find(item => item.fact_key === record.fact_key);
    return sum + count(sourceRecord, 'proposed_derivation', name) -
        count(sourceRecord, 'current_derivation', name);
}, 0);
const summary = [
    '# N02-G — evidência focal de seleção',
    '',
    `Corpus imutável: \`${base}:${graphPath}\` (blob \`${witness.source.git_blob}\`; SHA-256 LF \`${witness.source.sha256_lf}\`).`,
    `Proposta imutável: \`${revisedProposal}:${proposalPath}\` (SHA-256 LF \`${witness.revised_proposal_sha256_lf}\`).`,
    'Este resumo é gerado pelo helper e não substitui sua revisão independente.',
    '',
    '| Fact key | Predicados | Reads diretos | Has diretos | Edges diretas | Faltantes |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...records.map(record => {
        const direct = record.direct_predicate_dependencies;
        const missing = record.direct_missing_in_proposed_derivation;
        return `| ${record.fact_key} | ${record.predicates.length} | ${direct.reads.length} | ${direct.has.length} | ${direct.edges.length} | ${Object.values(missing).reduce((n, items) => n + items.length, 0)} |`;
    }),
    '',
    `Delta somado nas 11 derivations: required_nodes ${delta('required_nodes') >= 0 ? '+' : ''}${delta('required_nodes')}; required_reads ${delta('required_reads') >= 0 ? '+' : ''}${delta('required_reads')}; required_edges ${delta('required_edges') >= 0 ? '+' : ''}${delta('required_edges')}; required_structural ${delta('required_structural') >= 0 ? '+' : ''}${delta('required_structural')}.`,
    '',
    'O helper falha diante de forma de argumento desconhecida, forma mista, binding temporal não admitido, referência de edge/set/window ausente e dependência direta não coberta.',
    ''
].join('\n');
if (process.argv.includes('--check')) {
    assert.equal(fs.readFileSync(output, 'utf8'), text, 'selection_witness_mismatch');
    assert.equal(fs.readFileSync(summaryOutput, 'utf8').replaceAll('\r\n', '\n'),
        summary, 'selection_summary_mismatch');
    console.log('selection_witness=PASS records=11');
} else {
    fs.writeFileSync(output, text);
    fs.writeFileSync(summaryOutput, summary);
    console.log(`selection_witness=written records=${records.length}`);
}
console.log(`direct_missing=${records.reduce((n, record) => n +
    Object.values(record.direct_missing_in_proposed_derivation).reduce((m, list) => m + list.length, 0), 0)}`);
