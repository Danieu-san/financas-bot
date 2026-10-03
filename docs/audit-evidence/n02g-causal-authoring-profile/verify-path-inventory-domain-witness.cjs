'use strict';
// Extraction only: no compiler, evaluator, D/P, oracle or financial release.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const base = 'dbe72aa94894b7c4abf70c31fab8902f5e9236dc';
const corpusPath = 'docs/contracts/next/provenance-v2/graphs-v2.json';
const output = path.join(__dirname, 'path-inventory-domain-witness.json');
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
    : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
    : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
const source = execFileSync('git', ['show', base + ':' + corpusPath], {
    cwd: path.resolve(__dirname, '../../..'), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024
}).replace(/\r\n/g, '\n');
const corpus = JSON.parse(source);
assert.equal(corpus.graphs.length, 76);
assert.equal(new Set(corpus.graphs.map(row => row.fact_key)).size, 76);
const forms = {};
const examples = {};
const ids = new Set();
let predicates = 0;
for (const graph of corpus.graphs) {
    assert.equal(new Set(graph.predicates.map(row => row.id)).size, graph.predicates.length);
    predicates += graph.predicates.length;
    for (const predicate of graph.predicates) predicate.args.forEach((arg, operand_index) => {
        const form = Object.keys(arg).sort().join('+');
        forms[form] = (forms[form] || 0) + 1;
        const target = { fact_key: graph.fact_key, predicate_id: predicate.id, operand_index, strategy: 'unknown_path' };
        const id = sha(canonical({ domain: 'financasbot.mutation-requirement.v1', family: 'predicate_path_strategy', target }));
        assert.equal(ids.has(id), false);
        ids.add(id);
        if (['literal', 'period_literal', 'bindings+template'].includes(form) && !examples[form])
            examples[form] = { mutation_id: id, target, operator: predicate.op, operand: arg };
    });
}
const witness = {
    extraction_only: true, normative_approval: false, runtime_tests_executed: false,
    immutable_base: base, corpus_path: corpusPath, corpus_lf_sha256: sha(source),
    graph_count: corpus.graphs.length, predicate_count: predicates,
    all_operand_coordinates: ids.size, all_unknown_path_ids_sha256: sha([...ids].sort().join('\n')),
    operand_forms: Object.fromEntries(Object.entries(forms).sort(([a], [b]) => a.localeCompare(b))),
    literal_coordinates_without_authored_path: forms.literal + forms.period_literal,
    examples
};
assert.equal(ids.size, 22994);
assert.equal(witness.literal_coordinates_without_authored_path, 6179);
if (process.argv.length === 3 && process.argv[2] === '--write-new') {
    fs.writeFileSync(output, JSON.stringify(witness, null, 2) + '\n', { flag: 'wx' });
} else {
    assert.equal(process.argv.length, 2);
    assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), witness);
}
console.log(JSON.stringify({ extraction_verified: true, graphs: witness.graph_count,
    coordinates: ids.size, literal_coordinates_without_authored_path: 6179,
    normative_approval: false, runtime_tests_executed: false }));
