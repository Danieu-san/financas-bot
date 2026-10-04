'use strict';
// Immutable extraction only; no WIP/compiler/evaluator/D/P execution or GO.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const base = 'f892a35fce88fe21d474bd7ed408fe2697052ce7';
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const gitFile = fs.readFileSync(path.join(root, '.git'), 'utf8').trim();
assert.ok(gitFile.startsWith('gitdir: '));
const gitDir = path.resolve(root, gitFile.slice(8));
const common = path.resolve(gitDir, fs.readFileSync(path.join(gitDir, 'commondir'), 'utf8').trim());
const safe = ['-c', 'safe.directory=' + root, '-c', 'safe.directory=' + path.dirname(common)];
const source = file => execFileSync('git', [...safe, 'show', `${base}:${file}`],
    { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const prefix = 'docs/contracts/next/provenance-v2/';
const graphPath = prefix + 'graphs-v2.json';
const graphsSource = source(graphPath), corpus = JSON.parse(graphsSource);
const claimPath = corpus.claim_contract.path;
const claimsSource = source(claimPath), claims = JSON.parse(claimsSource);
const typesPath = 'src/next/provenance/predicateTypes.js', typesSource = source(typesPath);
const start = typesSource.indexOf('        function claimField(ref) {');
const end = typesSource.indexOf('        const setKinds = new Map();', start);
assert.ok(start >= 0 && end > start);
const claimTypeFunction = typesSource.slice(start, end);
assert.ok(claimTypeFunction.includes("if (path === 'period') type = { form: claim.period.kind === 'range' ? 'range' : 'period', periodKind: claim.period.kind }"));
const factKey = 'M-01#1#1';
const graph = corpus.graphs.find(row => row.fact_key === factKey);
const claim = claims.claims.find(row => row.fact_key === factKey);
const predicate = graph.predicates.find(row => row.id === 'binding_1');
assert.equal(predicate.op, 'period_eq');
assert.deepEqual(predicate.args, [{ claim: { segments: ['period'] } }, { period_literal: claim.period }]);
const paths = [];
function visit(value, segments) {
    if (segments.length) paths.push(segments);
    if (value && typeof value === 'object' && !Array.isArray(value))
        for (const key of Object.keys(value).sort()) visit(value[key], [...segments, key]);
}
visit(claim, []);
const witness = { stage: 'immutable_path_semantic_singleton_extraction', extraction_only: true,
    normative_approval: false, runtime_tests_executed: false, global_g11: false,
    immutable_base: base, sources: [
        { path: graphPath, sha256: sha(graphsSource) },
        { path: claimPath, sha256: sha(claimsSource) },
        { path: typesPath, sha256: sha(typesSource) }
    ], target: { fact_key: factKey, predicate_id: predicate.id, family: 'predicate_path_semantic' },
    predicate, claim, all_object_key_claim_locations: paths,
    claim_type_function: claimTypeFunction,
    type_rule_period_locator: ['period'],
    same_class_distinct_period_locator_candidates: [],
    limitation: 'Extraction and exact type-rule excerpt, not runtime proof, normative applicability or approval of all WIP pending causes.' };
const output = path.join(__dirname, 'path-semantic-singleton-witness.json');
if (process.argv.length === 3 && process.argv[2] === '--write')
    fs.writeFileSync(output, JSON.stringify(witness, null, 2) + '\n', { flag: 'wx' });
else {
    assert.equal(process.argv.length, 2);
    assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), witness);
}
console.log(JSON.stringify({ extraction_matched: true, base, target: witness.target,
    locations: paths.length, same_class_distinct_period_locator_candidates: 0,
    witness_sha256: sha(fs.readFileSync(output)), runtime_tests_executed: false, global_g11: false }));
