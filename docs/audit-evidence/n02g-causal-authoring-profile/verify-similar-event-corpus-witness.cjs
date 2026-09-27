'use strict';
// Compact, reproducible index of the immutable full corpus. This is evidence
// of byte identity and exact reconstruction, not an independent test run.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const parent = '133e919834ee53ddee3b51e47916331665716734';
const candidate = '030c9e07578d66ec6da8993bef9a002a3f7b172b';
const corpusPath = 'docs/contracts/next/provenance-v2/graphs-v2.json';
const proposalPath = 'docs/audit-evidence/n02g-causal-authoring-profile/similar-event-proposal.json';
const sha = text => createHash('sha256').update(text).digest('hex');
const show = (rev, file) => execFileSync('git', ['show', `${rev}:${file}`],
  { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const originalText = show(parent, corpusPath);
const candidateText = show(candidate, corpusPath);
const original = JSON.parse(originalText);
const current = JSON.parse(candidateText);
const proposal = JSON.parse(show(candidate, proposalPath));
assert.equal(original.graphs.length, 76);
assert.equal(current.graphs.length, 76);
assert.equal(proposal.records.length, 1);
const record = proposal.records[0];
assert.equal(record.fact_key, 'M-16#1#2');
const before = original.graphs.find(g => g.fact_key === record.fact_key);
const after = current.graphs.find(g => g.fact_key === record.fact_key);
assert.ok(before && after);
assert.deepEqual(before.trace_contract.derivation, record.current_derivation);
assert.deepEqual(after.trace_contract.derivation, record.proposed_derivation);
const expected = structuredClone(original);
expected.graphs.find(g => g.fact_key === record.fact_key).trace_contract.derivation =
  structuredClone(record.proposed_derivation);
assert.deepEqual(current, expected);
const byKey = graphs => new Map(graphs.map(g => [g.fact_key, sha(JSON.stringify(g))]));
const oldIndex = byKey(original.graphs);
const newIndex = byKey(current.graphs);
assert.equal(oldIndex.size, 76);
assert.equal(newIndex.size, 76);
assert.deepEqual([...newIndex.keys()], [...oldIndex.keys()]);
const changed = [...oldIndex].filter(([key, digest]) => newIndex.get(key) !== digest).map(([key]) => key);
assert.deepEqual(changed, [record.fact_key]);
const witness = {
  schema: 'n02g-similar-event-corpus-witness-v1',
  parent, candidate, corpus_path: corpusPath,
  parent_corpus_sha256: sha(originalText.replaceAll('\r\n', '\n')),
  candidate_corpus_sha256: sha(candidateText.replaceAll('\r\n', '\n')),
  graph_count: 76, changed_fact_keys: changed,
  changed_record: {
    fact_key: record.fact_key,
    parent_graph_sha256: oldIndex.get(record.fact_key),
    candidate_graph_sha256: newIndex.get(record.fact_key),
    parent_derivation_sha256: sha(JSON.stringify(before.trace_contract.derivation)),
    candidate_derivation_sha256: sha(JSON.stringify(after.trace_contract.derivation)),
    proof_preserved: JSON.stringify(before.trace_contract.proof) === JSON.stringify(after.trace_contract.proof),
    source: proposalPath
  },
  graph_index: [...newIndex].map(([fact_key, sha256]) => ({ fact_key, sha256 }))
};
const output = path.join(__dirname, 'similar-event-corpus-witness.json');
const serialized = JSON.stringify(witness, null, 2) + '\n';
if (process.argv[2] === '--write') fs.writeFileSync(output, serialized, { flag: 'wx' });
else if (process.argv[2] === '--check') assert.equal(fs.readFileSync(output, 'utf8'), serialized);
else throw new Error('Use --write or --check');
console.log(JSON.stringify({ valid: true, candidate, graph_count: 76, changed_fact_keys: changed }));
