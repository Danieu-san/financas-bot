'use strict';
// Mechanical reuse of the existing088/47-row producer. Fixed three-row
// roster, current validated source identities, new output directory only.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..'), sha = bytes => createHash('sha256').update(bytes).digest('hex');
for (const mode of ['green', 'affected']) {
    const report = JSON.parse(fs.readFileSync(path.join(__dirname, 'b4-02-ref-id-type-' + mode + '-20261022.json'), 'utf8'));
    assert.equal(report.child_exit, 0); assert.equal(report.expected_outcome_confirmed, true);
    assert.equal(report.sources_unchanged, true);
    for (const row of report.sources_after) assert.equal(sha(fs.readFileSync(path.join(root, row.path))), row.sha256);
}
const original = fs.readFileSync(path.join(__dirname, 'prepare-b4-02-S01-remaining47-reference-20261021.cjs'));
assert.equal(sha(original), 'de920e052dd4ae1f359ed6f9b7bcc8c0fc40925de35e2e76b9a987d7d36b3e71');
let source = original.toString('utf8');
function once(from, to) { assert.equal(source.split(from).length, 2, 'single mechanical replacement: ' + from); source = source.replace(from, to); }
once('b4-02-S01-remaining47-reference-20261021', 'b4-02-ref-id-three-precompile-20261022');
once('b4-02-pathv3-static11-qualified-ledger-20261021.json', 'b4-02-pathv3-static-A11-qualified-ledger-20261022.json');
const oldLedger = '2b9f20c906cad0a9a098de34e194d0369304d74dfe5f2d1fe74692eb36e10ba8';
assert.equal(source.split(oldLedger).length, 3);
source = source.replaceAll(oldLedger, '810385e906ca7386002e7f9c5691c170ed59826a710d7250c68a1ce219460ead');
once('assert.equal(ledger.verified_predicates,12);assert.equal(ledger.blocked,2407);',
    'assert.equal(ledger.verified_predicates,23);assert.equal(ledger.blocked,2396);');
once(".filter(x=>x.row.target.fact_key==='S-01#1#1'&&x.row.status==='blocked')",
    ".filter(x=>x.row.target.fact_key==='S-01#1#1'&&x.row.status==='blocked'&&[204,1695,1830].includes(x.row_index))");
once('assert.equal(roster.length,47);', 'assert.equal(roster.length,3);assert.deepEqual(roster.map(r=>r.row_index),[204,1695,1830]);');
const start = source.indexOf('const sources=wide.measured_sources_after;');
const end = source.indexOf('function measure()', start);
assert.ok(start >= 0 && end > start);
source = source.slice(0, start) + `const previous=wide.measured_sources_after;
assert.equal(previous.files.length,895);
assert.equal(sha(JSON.stringify(previous.files)),'183ba87724616c2226e7b1893fb8c3b5fa978631b116d99d23307ec9e782a6d7');
const current=previous.files.map(f=>({path:f.path,sha256:sha(read(f.path))}));
assert.deepEqual(previous.files.filter((f,i)=>f.sha256!==current[i].sha256).map(f=>f.path).sort(),
 ['src/next/provenance/pathQualificationV3.js','tests/next/provenance/pathQualificationV3.cases.js']);
const sources={files:current,sha256:sha(JSON.stringify(current))};
` + source.slice(end);
source = source.replaceAll('fixed47_original_S01_rows_before_first_new_materialization', 'fixed3_complete_ref_id_S01_rows_before_first_new_materialization')
    .replaceAll('all47_precompile_references_prepared_not_reviewed_or_qualified', 'all3_ref_id_precompile_references_prepared_not_reviewed_or_qualified');
assert.equal((source.match(/rows:47/g) || []).length, 3); source = source.replaceAll('rows:47', 'rows:3');
once('of:47', 'of:3');
once('const plan=api.preparePathQualificationWitnessPreselection({preparation,rowIndex:original.row_index});',
    'const plan=api.preparePathQualificationWitnessPreselection({preparation,rowIndex:original.row_index});'
    + 'assert.equal(plan.conditional_domain_partition.conditional_witness_partition_complete,true);'
    + 'assert.equal(plan.selected.entry_index,({204:0,1695:2,1830:0})[original.row_index]);');
const reused = new Module(__filename, module); reused.filename = __filename; reused.paths = module.paths;
reused._compile(source, __filename);
