'use strict';

// Evidence extraction only. No graph, registry, trace or executable is changed.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const prefix = 'docs/contracts/next/provenance-v2/';
const sourcePaths = [prefix + 'graphs-v2.json', prefix + 'claims-v2.json',
    prefix + 'metric-evaluator-registry-v1.json', prefix + 'evaluator-contracts/source_coverage.json',
    prefix + 'graph-binding-contract-v1.md', 'src/next/provenance/graphCompiler.js',
    'src/next/provenance/metricDirectReads.js', 'tests/next/provenance/authoringIndex.cases.js'];
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const blobId = bytes => crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');

function readSources(commit) {
    assert.match(commit, /^[a-f0-9]{40}$/);
    return sourcePaths.map(file => ({ path: file,
        bytes: execFileSync('git', ['show', `${commit}:${file}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 }) }));
}
function unique(items, predicate, label) {
    const matches = items.filter(predicate); assert.equal(matches.length, 1, label); return matches[0];
}
function excerpt(text, start, end) {
    const offset = text.indexOf(start); assert.notEqual(offset, -1, 'excerpt_start_missing');
    assert.equal(text.indexOf(start, offset + 1), -1, 'excerpt_start_ambiguous');
    const finish = text.indexOf(end, offset + start.length); assert.notEqual(finish, -1, 'excerpt_end_missing');
    return { first_line: text.slice(0, offset).split('\n').length, text: text.slice(offset, finish) };
}
function derive(sources) {
    const documents = new Map(sources.map(s => [s.path, s.bytes.toString('utf8')]));
    const json = file => JSON.parse(documents.get(file));
    const graphs = json(prefix + 'graphs-v2.json').graphs;
    const claims = json(prefix + 'claims-v2.json').claims;
    assert.equal(new Set(graphs.map(g => g.fact_key)).size, graphs.length, 'duplicate_graph_fact_key');
    assert.equal(new Set(claims.map(c => c.fact_key)).size, claims.length, 'duplicate_claim_fact_key');
    const graph = unique(graphs, g => g.fact_key === 'S-16#1#1', 'graph_not_unique');
    const claim = unique(claims, c => c.fact_key === graph.fact_key, 'claim_not_unique');
    assert.equal(graph.claim_id, claim.claim_id);
    const registry = json(prefix + 'metric-evaluator-registry-v1.json');
    const evaluator = unique(registry.entries, e => e.evaluator_id === claim.evaluator_ref.evaluator_id
        && e.evaluator_version === claim.evaluator_ref.evaluator_version, 'evaluator_not_unique');
    const roots = Object.values(claim.operand_bindings).flatMap(binding =>
        binding.kind === 'node' ? [binding.alias] : binding.kind === 'node_set' ? binding.aliases : []);
    const reachable = new Set(roots);
    for (const alias of reachable) for (const edge of graph.edges) {
        if (edge.relation === 'material_ref' && edge.source === alias) reachable.add(edge.target);
    }
    const selection = unique(graph.selections, s => s.candidate_set === 'candidates' && s.selected_set === 'selected', 'selection_not_unique');
    const candidates = graph.sets[selection.candidate_set];
    const compiler = documents.get('src/next/provenance/graphCompiler.js');
    const metric = documents.get('src/next/provenance/metricDirectReads.js');
    const tests = documents.get('tests/next/provenance/authoringIndex.cases.js');
    return { fact_key: graph.fact_key, claim, evaluator,
        evaluator_contract: json(evaluator.contract_path),
        graph: { claim_id: graph.claim_id, nodes: graph.nodes, sets: graph.sets, selections: graph.selections,
            edges: graph.edges, derivation: graph.trace_contract.derivation,
            proof: { required_nodes: graph.trace_contract.proof.required_nodes,
                required_reads_for_candidates: graph.trace_contract.proof.required_reads.filter(r => candidates.includes(r.node)),
                required_selections: graph.trace_contract.proof.required_selections,
                selected_nodes: graph.trace_contract.proof.selected_nodes } },
        reachability: { roots, reachable: [...reachable].sort(), unreachable_candidates: candidates.filter(a => !reachable.has(a)) },
        source_excerpts: {
            observation_contract: excerpt(documents.get(prefix + 'graph-binding-contract-v1.md'), '## 4. Contrato de observação', '## 5.'),
            access_compiler: excerpt(compiler, 'function compileSnapshotAccess(', '// Compile-time consistency only.'),
            metric_helpers: excerpt(metric, "'use strict';", 'function evaluateDirectMetric('),
            source_coverage: excerpt(metric, "    if (metric === 'source_coverage') {", "    if (metric === 'owned_cards'"),
            causal_test: excerpt(tests, "test('N02G:SELECTION-BINDING-001", "test('N02G:SNAPSHOT-ACCESS-001")
        } };
}
function build(commit) {
    const sources = readSources(commit);
    return { manifest: { schema: 'financasbot-n02g-selection-binding-evidence-v1', source_commit: commit,
        locator: { fact_key: 'S-16#1#1' }, sources: sources.map(s => ({ path: s.path,
            sha256: sha256(s.bytes), git_blob_sha1: blobId(s.bytes) })),
        scope: 'Focal evidence only. No verdict, graph acceptance or authorization.' }, focal: derive(sources) };
}
function verifyBundle(manifest, expected) {
    const actual = build(manifest.source_commit);
    assert.deepEqual(actual.manifest, manifest, 'source_identity_mismatch');
    assert.deepEqual(actual.focal, expected, 'focal_evidence_mismatch');
    return { valid: true, fact_key: expected.fact_key, sources: manifest.sources.length,
        unreachable_candidates: expected.reachability.unreachable_candidates, scope: 'extraction_only' };
}
if (require.main === module) {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'evidence-manifest.json'), 'utf8'));
    const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'focal-record.json'), 'utf8'));
    console.log(JSON.stringify(verifyBundle(manifest, expected)));
}
module.exports = { build, verifyBundle };
