'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createHash } = require('node:crypto'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const runner = require(path.join(root, 'scripts/runExhaustiveLocalTestCoverage.js'));
const mode = process.argv[2];
const selected = { red: '^N02G:PATH-V3-089 ', green: '^N02G:PATH-V3-(074|089|090) ',
    affected: '^N02G:PATH-V3-(067|068|069|070|075|080|086|087|088) ' }[mode];
if (!selected || process.version !== 'v22.17.0') throw new Error('fixed_validation_profile');
const prefix = path.join(__dirname, 'b4-02-ref-id-type-' + mode + '-20261022');
for (const suffix of ['.json', '.job.json', '.tap', '.err', '.coverage'])
    if (fs.existsSync(prefix + suffix)) throw new Error('duplicate_evidence_no_retry');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const measured = ['src/next/provenance/pathQualificationV3.js', 'tests/next/provenance/pathQualificationV3.cases.js',
    'src/next/provenance/predicateTypes.js', 'src/next/provenance/operatorTypes.js',
    'scripts/runExhaustiveLocalTestCoverage.js', 'tests/helpers/exhaustiveNetworkTripwire.js'];
const identity = () => measured.map(file => ({ path: file, sha256: sha(fs.readFileSync(path.join(root, file))) }));
const file = 'tests/next/provenance/pathQualificationV3.cases.js';
const expected = [...fs.readFileSync(path.join(root, file), 'utf8').matchAll(/^test\('([^']+)'/gm)]
    .map(match => match[1]).filter(title => new RegExp(selected).test(title)).sort();
if (!expected.length || new Set(expected).size !== expected.length) throw new Error('expected_authored_titles');
const before = identity(), started_at = new Date().toISOString();
fs.writeFileSync(prefix + '.job.json', JSON.stringify({ state: 'running', started_at, mode, expected }) + '\n', { flag: 'wx' });
fs.mkdirSync(prefix + '.coverage');
const auditTempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-ref-type-'));
const env = { ...runner.buildHermeticTestEnvironment(process.env, { auditTempRoot }), NODE_V8_COVERAGE: prefix + '.coverage' };
const args = runner.buildNodeTestArgs([file]); args.splice(args.length - 1, 0, '--test-name-pattern=' + selected);
const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, env });
const stdout = result.stdout || '', stderr = result.stderr || '';
fs.writeFileSync(prefix + '.tap', stdout, { flag: 'wx' }); fs.writeFileSync(prefix + '.err', stderr, { flag: 'wx' });
const actual = [...stdout.matchAll(/^# Subtest: (.+)$/gm)].map(match => match[1]).sort();
const counts = runner.parseTapSummary(stdout), after = identity();
const unchanged = JSON.stringify(before) === JSON.stringify(after);
const exact = JSON.stringify(actual) === JSON.stringify(expected);
const ordinary = !result.error && !result.signal && unchanged && exact && counts.tests === expected.length
    && ['cancelled', 'skipped', 'todo'].every(key => counts[key] === 0);
const expectedOutcome = mode === 'red'
    ? ordinary && result.status === 1 && expected.length === 1 && counts.fail === 1 && counts.pass === 0
        && stdout.includes('missing single-target ref ordinary type basis')
    : ordinary && result.status === 0 && counts.fail === 0 && counts.pass === expected.length;
const coverage = fs.readdirSync(prefix + '.coverage').filter(name => name.endsWith('.json')).sort().map(name => {
    const bytes = fs.readFileSync(path.join(prefix + '.coverage', name)); JSON.parse(bytes);
    return { name, bytes: bytes.length, sha256: sha(bytes) };
});
const report = { started_at, completed_at: new Date().toISOString(), mode, node: process.version,
    child_exit: result.status, child_signal: result.signal, error_code: result.error?.code || null,
    expected, exact_authored_titles: exact, counts, sources_before: before, sources_after: after,
    sources_unchanged: unchanged, stdout_sha256: sha(stdout), stderr_sha256: sha(stderr), coverage,
    expected_outcome_confirmed: expectedOutcome, red_is_product_failure_not_child_pass: mode === 'red',
    qualified_rows: 0, semantic_mutation_credit: 0, independent_code_audit: 'pending' };
fs.writeFileSync(prefix + '.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(prefix + '.job.json', JSON.stringify({ state: expectedOutcome ? 'expected_outcome_confirmed' : 'unexpected_outcome',
    started_at, completed_at: report.completed_at, child_exit: result.status, report_sha256: sha(fs.readFileSync(prefix + '.json')) }) + '\n');
console.log(JSON.stringify({ mode, child_exit: result.status, counts, exact, unchanged, expectedOutcome,
    coverage_count: coverage.length, report_sha256: sha(fs.readFileSync(prefix + '.json')) }));
process.exitCode = expectedOutcome ? 0 : 1;
