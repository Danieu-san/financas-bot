'use strict';

// Mechanical review artifact only. Never rewrites a normative graph or derives
// expected coverage from execution. Sources are complete immutable Git blobs.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const [commit, metric, output, mode, ...rest] = process.argv.slice(2);
if (!/^[a-f0-9]{40}$/.test(commit || '') || !/^[a-z][a-z0-9_]+$/.test(metric || '')
    || !/^docs\/audit-evidence\/[a-z0-9-]+\/graphs-extract\.json$/.test(output || '')
    || rest.length || mode !== undefined && mode !== '--verify') throw new Error('review_extract_arguments');
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 16 * 1024 * 1024 });
const sources = [];
function read(file) {
    const bytes = git('show', `${commit}:${file}`);
    sources.push({ commit, path: file, git_blob: git('rev-parse', `${commit}:${file}`).toString().trim(),
        sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
    return JSON.parse(bytes);
}
const graphDocument = read('docs/contracts/next/provenance-v2/graphs-v2.json');
const claimDocument = read('docs/contracts/next/provenance-v2/claims-v2.json');
const claims = claimDocument.claims.filter(claim => claim.metric === metric);
if (!claims.length) throw new Error('review_extract_empty');
const facts = new Set(claims.map(claim => claim.fact_key));
const graphs = graphDocument.graphs.filter(graph => facts.has(graph.fact_key));
assert.equal(graphs.length, claims.length);
const { graphs: allGraphs, ...graph_header } = graphDocument;
const artifact = { purpose: 'review_only_full_graph_and_claim_objects_not_normative_authority', sources,
    extraction: 'Complete parsed objects from immutable Git blobs; property/array order retained; whitespace reformatted; equality checked locally',
    metric, graph_header, graphs, claims };
const target = path.join(root, output);
if (mode === '--verify') assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), artifact);
else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(artifact, null, 2) + '\n', { flag: 'wx' });
    assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), artifact);
}
console.log(JSON.stringify({ mode: mode || 'create', commit, metric, graphs: graphs.length, claims: claims.length,
    output, bytes: fs.statSync(target).size, source_equality: true }));
