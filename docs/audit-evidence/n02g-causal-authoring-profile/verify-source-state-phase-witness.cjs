'use strict';
// Read-only immutable projection; --write-new creates only the fixed evidence
// file. This checks extraction, not normative sufficiency or runtime behavior.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const base = '6ed3822a1a4c4e8836232d3a874faefbda9ff05c';
const prefix = 'docs/contracts/next/provenance-v2/';
const paths = {
  graphs: prefix + 'graphs-v2.json', claims: prefix + 'claims-v2.json',
  architecture: 'docs/plans/workstreams/financasbot-next-00-provenance-graph-design-v1.md',
  binding: prefix + 'graph-binding-contract-v1.md',
  count: prefix + 'evaluator-contracts/eligible_event_count.json',
  coverage: prefix + 'evaluator-contracts/source_coverage.json'
};
const sha = value => createHash('sha256').update(value).digest('hex');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const sources = Object.fromEntries(Object.entries(paths).map(([key, name]) => [key, git(['show', `${base}:${name}`]).replaceAll('\r\n', '\n')]));
const manifest = Object.fromEntries(Object.entries(paths).map(([key, name]) => [key,
  { path: name, blob: git(['rev-parse', `${base}:${name}`]).trim(), lf_sha256: sha(sources[key]) }]));
const section = (text, start, end) => {
  assert.equal(text.split(start).length, 2, `unique start ${start}`);
  const tail = text.slice(text.indexOf(start));
  const position = tail.indexOf(end, start.length);
  assert.ok(position > start.length, `end ${end}`);
  return tail.slice(0, position).trimEnd();
};
const corpus = JSON.parse(sources.graphs); const claims = JSON.parse(sources.claims);
assert.equal(corpus.graphs.length, 76);
const byKey = new Map(corpus.graphs.map(graph => [graph.fact_key, graph]));
assert.equal(byKey.size, 76, 'global fact_key uniqueness');
const definitions = [
  ['S-13#1#1', ['binding_13', 'binding_14']],
  ['M-09#1#1', ['binding_13', 'binding_14']],
  ['N-04#1#1', ['binding_13', 'binding_14']],
  ['S-16#1#1', ['binding_11', 'binding_12', 'r0004_include_coverage']]
];
assert.ok(Array.isArray(claims.claims));
const projections = definitions.map(([fact_key, ids]) => {
  const graph = byKey.get(fact_key); assert.ok(graph);
  const claimMatches = claims.claims.filter(claim => claim.claim_id === graph.claim_id);
  assert.equal(claimMatches.length, 1, `claim ${fact_key}`);
  const predicates = ids.map(id => {
    const found = graph.predicates.filter(predicate => predicate.id === id);
    assert.equal(found.length, 1, `predicate ${fact_key}/${id}`);
    assert.equal(found[0].op, 'eq');
    assert.ok(['period', 'coverage'].includes(found[0].atom));
    return found[0];
  });
  const sourceNodes = [...new Set(predicates.map(predicate => predicate.args[0].field.node))];
  assert.equal(sourceNodes.length, 1, `one focal source ${fact_key}`);
  const sourceNode = sourceNodes[0];
  const phase = name => {
    const trace = graph.trace_contract[name];
    return { full_phase_json_sha256: sha(JSON.stringify(trace)),
      required_nodes_count: trace.required_nodes.length,
      source_node_required: trace.required_nodes.includes(sourceNode),
      source_reads: trace.required_reads.filter(read => read.node === sourceNode),
      required_claim_reads: trace.required_claim_reads,
      required_edges_count: trace.required_edges.length,
      required_structural_count: trace.required_structural.length,
      required_selections: trace.required_selections };
  };
  const compactSets = Object.fromEntries(Object.entries(graph.sets).map(([name, aliases]) =>
    [name, { count: aliases.length, json_sha256: sha(JSON.stringify(aliases)) }]));
  const compactSelections = graph.selections.map(selection => ({
    candidate_set: selection.candidate_set, selected_set: selection.selected_set,
    selected_predicates: selection.selected_predicates,
    excluded_count: selection.excluded.length,
    full_selection_json_sha256: sha(JSON.stringify(selection)) }));
  return { fact_key, graph_json_sha256: sha(JSON.stringify(graph)), claim: claimMatches[0],
    source_node: sourceNode, predicates,
    sets: fact_key === 'S-16#1#1' ? graph.sets : compactSets,
    selections: fact_key === 'S-16#1#1' ? graph.selections : compactSelections,
    derivation: phase('derivation'), proof: phase('proof') };
});
assert.equal(projections.reduce((count, row) => count + row.predicates.length, 0), 9);
const focal = projections.at(-1);
const duplicates = focal.predicates.filter(predicate => predicate.atom === 'coverage');
assert.equal(duplicates.length, 2);
assert.deepEqual(duplicates[0].args, duplicates[1].args);
assert.equal(duplicates[0].obligation, 'coverage');
assert.equal(duplicates[1].obligation, 'coverage');
const g16 = byKey.get(focal.fact_key);
const nominal = g16.predicates.filter(predicate => predicate.id === 'binding_7');
assert.equal(nominal.length, 1);
assert.deepEqual(nominal[0], { id: 'binding_7', obligation: 'subject_scope', atom: 'subject', op: 'eq',
  args: [{ field: { node: 'source_complete_june', segments: ['id'] } },
    { claim: { segments: ['subject', 'ref_id'] } }] });
assert.equal(focal.selections.length, 1);
assert.deepEqual(focal.selections[0].selected_predicates, ['r0004_include_coverage']);
assert.deepEqual(focal.sets.selected, ['source_complete_june']);
const output = {
  schema: 'n02g-source-state-phase-witness-v1', base, manifest,
  graph_count: 76, unique_fact_keys: 76, pending_predicate_count: 9,
  extraction_only: true, normative_approval: false, runtime_tests_executed: false,
  contracts: { eligible_event_count: JSON.parse(sources.count), source_coverage: JSON.parse(sources.coverage) },
  norms: {
    obligations: section(sources.architecture, '## 7. Obrigações de prova', '## 8. Trace determinístico de derivação'),
    acceptance: section(sources.architecture, '## 4. Modelo formal', '## 5. Schema lógico proposto'),
    phase_result_separation: section(sources.architecture, '## 8. Trace determinístico de derivação', '### Invariante de autoria causal'),
    source_coverage: section(sources.architecture, '### 9.1 Source coverage', '### 9.2 Vazio por categoria'),
    g11: section(sources.architecture, '## 10. Propriedades e mutações geradas', '## 11. Compilador e evaluator'),
    phase_selection: section(sources.binding, '### Seleção por fase — correção normativa N02G-SB-001', '## 5. Pais e hash de resultado derivado')
  },
  focal_graphs: projections,
  proposed_nominal_selector_existing_predicate: nominal[0],
  proposed_selection_change: { fact_key: focal.fact_key, selection_index: 0,
    before: ['r0004_include_coverage'], after: ['binding_7'], applied: false }
};
const filename = path.join(__dirname, 'source-state-phase-witness.json');
const serialized = JSON.stringify(output, null, 2) + '\n';
if (process.argv.length !== 3) throw new Error('Use --write-new or --check');
if (process.argv[2] === '--write-new') fs.writeFileSync(filename, serialized, { flag: 'wx' });
else if (process.argv[2] === '--check') assert.deepEqual(JSON.parse(fs.readFileSync(filename, 'utf8')), output);
else throw new Error('Use --write-new or --check');
console.log(JSON.stringify({ valid: true, extraction_only: true, base,
  graph_count: 76, pending_predicates: 9, witness_sha256: sha(serialized),
  normative_approval: false, runtime_tests_executed: false }));
