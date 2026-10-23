'use strict';
// Reuse the exact successful wide driver's native hook/bootstrap/final
// validation. Replace only its candidate manifest and output prefix.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const assert = require('node:assert/strict'), { createHash } = require('node:crypto');
const bytes = fs.readFileSync(path.join(__dirname, 'run-b4-02-path-v3-final-wide-20261019.cjs'));
assert.equal(createHash('sha256').update(bytes).digest('hex'), '3c40ae222163b114323accd8d4fd7cce9d2d69d0863d642dde04fd3493c2330c');
let source = bytes.toString('utf8');
function once(from, to) { assert.equal(source.split(from).length, 2, from); source = source.replace(from, to); }
once("prefix=path.join(__dirname,'b4-02-path-v3-final-wide-20261019');",
    "prefix=path.join(__dirname,'ref-id-path-v3-final-wide-20261022');");
once('assert.equal(m.expected_total_tests,2788);', 'assert.equal(m.expected_total_tests,2790);');
function newManifest() {
    assert.equal(sha(fs.readFileSync(process.execPath)), '39d45b5933f339d3ebdebd76474893dab5d7da1038920f65cf5bbcf0f20f3636');
    const priorBytes = local('b4-02-path-v3-final-wide-20261019.json');
    assert.equal(sha(priorBytes), '42e6126d4c3f321534d72b7584951d9d4aa6a6c794e889618d9934589f35a866');
    const prior = JSON.parse(priorBytes);
    assert.equal(prior.valid, true); assert.equal(prior.matrix_green, true); assert.equal(prior.exit_status, 0);
    assert.deepEqual(prior.tap, { tests: 2788, suites: 0, pass: 2778, fail: 0, cancelled: 0, skipped: 10, todo: 0 });
    assert.equal(prior.measured_sources_unchanged, true); assert.equal(indexHash(), indexPin);
    const old = prior.measured_sources_after.files;
    assert.equal(old.length, 895);
    assert.equal(sha(JSON.stringify(old)), '183ba87724616c2226e7b1893fb8c3b5fa978631b116d99d23307ec9e782a6d7');
    const files = old.map(row => ({ path: row.path, sha256: sha(read(row.path)) }));
    const changed = old.filter((row, i) => row.sha256 !== files[i].sha256).map(row => row.path).sort();
    assert.deepEqual(changed, ['src/next/provenance/pathQualificationV3.js', 'tests/next/provenance/pathQualificationV3.cases.js']);
    const red = JSON.parse(local('b4-02-ref-id-type-red-20261022.json'));
    assert.equal(red.child_exit, 1); assert.equal(red.counts.fail, 1); assert.equal(red.expected_outcome_confirmed, true);
    for (const mode of ['green', 'affected']) {
        const result = JSON.parse(local('b4-02-ref-id-type-' + mode + '-20261022.json'));
        assert.equal(result.child_exit, 0); assert.equal(result.expected_outcome_confirmed, true);
        assert.equal(result.sources_unchanged, true);
        for (const row of result.sources_after) assert.equal(sha(read(row.path)), row.sha256);
    }
    assert.equal(sha(read('scripts/runExhaustiveLocalTestCoverage.js')), runnerPin);
    const runner = require(runnerPath), originalFiles = runner.listLocalTestFiles();
    assert.equal(originalFiles.length, 168); assert.equal(originalFiles.includes(path.join(root, casePath)), false);
    for (const file of originalFiles) assert.equal(fs.readFileSync(file, 'utf8').includes('pathQualificationV3.cases'), false);
    assert.deepEqual([...runner.EXPECTED_SKIPPED_TESTS].sort(), [...prior.skipped_tests].sort());
    const expected = titles(read(casePath)); assert.equal(expected.length, 90); assert.equal(new Set(expected).size, 90);
    const unchangedTitles = prior.expected_path_v3_titles.filter(title => !/^N02G:PATH-V3-074 /.test(title)).sort();
    assert.deepEqual(expected.filter(title => !/^N02G:PATH-V3-(074|089|090) /.test(title)), unchangedTitles);
    assert.equal(expected.filter(title => /^N02G:PATH-V3-074 /.test(title)).length, 1);
    assert.equal(expected.filter(title => /^N02G:PATH-V3-089 /.test(title)).length, 1);
    assert.equal(expected.filter(title => /^N02G:PATH-V3-090 /.test(title)).length, 1);
    const schema = titles(read('tests/next/provenance/schemaBuild.cases.js')).filter(title => /^N02G:SCHEMA-00[56] /.test(title));
    assert.deepEqual(schema, [...prior.expected_new_schema_titles].sort());
    assert.deepEqual(Object.keys(prior.new_harness_case_counts).sort(), newTitles);
    const capturePrefix = 'path-v3-complete-capture-refid-20261022';
    const capture = JSON.parse(local(capturePrefix + '.json'));
    assert.equal(capture.sources_unchanged, true); assert.equal(capture.artifacts.length, 9);
    for (const row of capture.source_inventory) assert.equal(sha(read(row.path)), row.sha256);
    for (const row of capture.artifacts) {
        const data = local(capturePrefix + '-bytes/' + row.path);
        assert.equal(data.length, row.bytes); assert.equal(sha(data), row.sha256);
    }
    const scopePrefix = 'b4-02-ref-id-three-precompile-20261022';
    const scopes = JSON.parse(local(scopePrefix + '.json'));
    assert.deepEqual(scopes.rows.map(row => row.row_index), [204, 1695, 1830]);
    assert.equal(scopes.snapshots, 3); assert.equal(scopes.no_selected_normal_compile, true);
    assert.equal(scopes.no_guest_execution, true); assert.deepEqual(scopes.source_after.mismatches, []);
    const proofNames = ['b4-02-ref-id-type-causal-case-20261022.md', 'b4-02-ref-id-type-basis-plan-20261022.md',
        'b4-02-ref-id-type-red-20261022.json', 'b4-02-ref-id-type-green-20261022.json', 'b4-02-ref-id-type-affected-20261022.json',
        capturePrefix + '.json', scopePrefix + '.json', scopePrefix + '/roster.json',
        'run-b4-02-ref-id-type-validation-20261022.cjs', 'prepare-path-v3-complete-capture-refid-20261022.cjs',
        'prepare-path-v3-complete-capture-ac08-20261015.cjs', 'prepare-b4-02-ref-id-three-precompile-20261022.cjs',
        'prepare-b4-02-S01-remaining47-reference-20261021.cjs', 'run-b4-02-path-v3-final-wide-20261019.cjs',
        'run-ref-id-path-v3-final-wide-20261022.cjs', 'confront-b4-02-ref-id-captures-20261022.cjs',
        'b4-02-ref-id-capture-confronted-20261022.json'];
    for (const row of scopes.rows) {
        assert.equal(row.conditional_partition_complete, true);
        proofNames.push(scopePrefix + '/' + row.plan_path, scopePrefix + '/' + row.snapshot.path);
        assert.equal(sha(local(scopePrefix + '/' + row.plan_path)), row.plan_sha256);
        assert.equal(sha(local(scopePrefix + '/' + row.snapshot.path)), row.snapshot.sha256);
    }
    proofNames.push(...capture.artifacts.map(row => capturePrefix + '-bytes/' + row.path));
    const proofBindings = proofNames.map(file => { const data = local(file);
        return { path: '.codex-temp/' + file, bytes: data.length, sha256: sha(data) }; });
    const dev = require('../scripts/agent/financasBotNext02ValidationPolicy').inspectDevelopmentSources(path.join(root, 'src/next'), 'N02-E');
    assert.deepEqual(dev.errors, []); assert.equal(dev.releaseEligible, false);
    return { files, sha256: sha(JSON.stringify(files)), changed, expected, originalFiles, newSchemaTitles: schema, proofBindings,
        expected_total_tests: prior.tap.tests + 2, newTitle, newTitles, runner_sha256: runnerPin,
        snapshot_sha256: capture.snapshot_sha256, index_sha256: indexPin,
        development_inventory: { errors: dev.errors, reviewed_matches: dev.reviewedSourceMatches,
            pending_paths: dev.pendingReviewPaths, release_eligible: false } };
}
const start = source.indexOf('function manifest(){'), end = source.indexOf('function installCapture(', start);
assert.ok(start >= 0 && end > start);
source = source.slice(0, start) + newManifest.toString().replace('function newManifest()', 'function manifest()') + '\n' + source.slice(end);
const reused = new Module(__filename, module); reused.filename = __filename; reused.paths = module.paths;
reused._compile(source, __filename);
