'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const evidenceDir = __dirname;
const repoRoot = path.resolve(evidenceDir, '../../..');
const manifest = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'evidence-manifest.json'), 'utf8'));
const expected = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'focal-record.json'), 'utf8'));
const sourcePath = path.join(repoRoot, manifest.source.path);
const sourceBytes = fs.readFileSync(sourcePath);

assert.equal(
  crypto.createHash('sha256').update(sourceBytes).digest('hex'),
  manifest.source.sha256,
  'source_sha256_mismatch'
);

const root = JSON.parse(sourceBytes.toString('utf8'));
const matches = root.graphs.filter((graph) => graph.fact_key === manifest.locator.fact_key);
assert.equal(matches.length, 1, 'fact_key_not_unique');

const graph = matches[0];
const edges = graph.edges.filter((edge) => edge.id === manifest.locator.edge_id);
assert.equal(edges.length, 1, 'edge_id_not_unique');

const actual = {
  fact_key: graph.fact_key,
  claim_id: graph.claim_id,
  edge: edges[0],
  derivation: {
    required_edges_contains_e0023: graph.trace_contract.derivation.required_edges.includes('e0023'),
    required_nodes_contains_person_b: graph.trace_contract.derivation.required_nodes.includes('person_b'),
    required_reads_for_person_b: graph.trace_contract.derivation.required_reads.filter(
      (read) => read.node === 'person_b'
    )
  },
  proof: {
    required_reads_for_person_b: graph.trace_contract.proof.required_reads.filter(
      (read) => read.node === 'person_b'
    )
  }
};

assert.deepEqual(actual, expected, 'focal_evidence_mismatch');
process.stdout.write('N02-G trace compatibility evidence: PASS\n');
process.stdout.write(`candidate=${manifest.candidate_sha}\n`);
process.stdout.write(`source_sha256=${manifest.source.sha256}\n`);
