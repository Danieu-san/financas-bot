const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const { isLoopbackHost, requestHost } = require('./helpers/exhaustiveNetworkTripwire');

const {
    EXCLUDED,
    MUTABLE_RUNTIME_FILES,
    listLocalTestFiles,
    parseTapSummary,
    parseCoverageSummary,
    parseFailures,
    findNestedTestEntries,
    validateRunnerResult,
    buildNodeTestArgs,
    captureFileSnapshot,
    restoreFileSnapshot
} = require('../scripts/runExhaustiveLocalTestCoverage');

test('local coverage runner excludes the real WhatsApp controller and nested duplicate entries', () => {
    const files = listLocalTestFiles().map(file => file.replace(/\\/g, '/'));
    assert.strictEqual(Object.keys(EXCLUDED).length, 1);
    assert.ok(!files.some(file => file.endsWith('/whatsapp-real-e2e.test.js')));
    assert.ok(files.some(file => file.endsWith('/functional.test.js')));
    assert.ok(files.some(file => file.endsWith('/exhaustiveRuntimeInventory.test.js')));
});

test('coverage runner parses the final TAP and coverage summaries', () => {
    const output = [
        '# tests 12',
        '# pass 11',
        '# fail 1',
        '# skipped 0',
        '# all files | 88.5 | 77.25 | 91.1 |',
        'not ok 4 - sample failure'
    ].join('\n');
    assert.deepStrictEqual(parseTapSummary(output), {
        tests: 12,
        suites: null,
        pass: 11,
        fail: 1,
        cancelled: null,
        skipped: 0,
        todo: null
    });
    assert.deepStrictEqual(parseCoverageSummary(output), {
        line_percent: 88.5,
        branch_percent: 77.25,
        function_percent: 91.1,
        uncovered_lines: ''
    });
    assert.deepStrictEqual(parseFailures(output), ['not ok 4 - sample failure']);
});

test('coverage runner identifies test entries loaded by an aggregator', () => {
    const nested = findNestedTestEntries([
        path.join(ROOT, 'tests', 'openFinanceSandboxStaging.test.js'),
        path.join(ROOT, 'tests', 'openFinanceSandboxWebhook.test.js')
    ]).map(file => file.replace(/\\/g, '/'));
    assert.ok(nested.some(file => file.endsWith('/openFinanceSandboxWebhook.test.js')));
});

test('coverage runner fails closed when TAP or coverage summary is incomplete', () => {
    assert.deepStrictEqual(validateRunnerResult({
        exitStatus: 0,
        tap: { tests: 10, pass: 10, fail: 0, cancelled: 0, skipped: 0, todo: 0 },
        coverage: { line_percent: 80, branch_percent: 70, function_percent: 75 }
    }), { valid: true, reasons: [] });

    const invalid = validateRunnerResult({
        exitStatus: 0,
        tap: { tests: null, pass: null, fail: null, cancelled: null, skipped: null, todo: null },
        coverage: null
    });
    assert.strictEqual(invalid.valid, false);
    assert.ok(invalid.reasons.includes('tap_summary_incomplete'));
    assert.ok(invalid.reasons.includes('coverage_summary_missing'));
});

test('coverage runner serializes local test files to avoid shared runtime races', () => {
    const args = buildNodeTestArgs([
        path.join(ROOT, 'tests', 'financialAgent.test.js'),
        path.join(ROOT, 'tests', 'readModelSqlite.test.js')
    ]);

    assert.ok(args.includes('--test-concurrency=1'));
    assert.ok(args.includes('--experimental-test-coverage'));
    assert.ok(args.includes('--test'));
});

test('coverage runner restores pre-existing state and removes test-created state', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'exhaustive-coverage-state-'));
    const stateFile = path.join(temporaryRoot, 'state_store.json');
    try {
        fs.writeFileSync(stateFile, '{"original":true}\n', { mode: 0o600 });
        const existingSnapshot = captureFileSnapshot(stateFile);
        fs.writeFileSync(stateFile, '{"test":true}\n', { mode: 0o644 });
        restoreFileSnapshot(stateFile, existingSnapshot);
        assert.strictEqual(fs.readFileSync(stateFile, 'utf8'), '{"original":true}\n');
        if (process.platform !== 'win32') {
            assert.strictEqual(fs.statSync(stateFile).mode & 0o777, 0o600);
        }

        fs.unlinkSync(stateFile);
        const missingSnapshot = captureFileSnapshot(stateFile);
        fs.writeFileSync(stateFile, '{"createdByTest":true}\n');
        restoreFileSnapshot(stateFile, missingSnapshot);
        assert.strictEqual(fs.existsSync(stateFile), false);
    } finally {
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
});

test('coverage runner snapshots state and file logs that product tests may mutate', () => {
    const normalized = MUTABLE_RUNTIME_FILES.map(file => file.replace(/\\/g, '/'));
    assert.ok(normalized.some(file => file.endsWith('/state_store.json')));
    assert.ok(normalized.some(file => file.endsWith('/state_store.tmp')));
    assert.ok(normalized.some(file => file.endsWith('/state_store.replay.json')));
    assert.ok(normalized.some(file => file.endsWith('/state_store.replay.tmp')));
    assert.ok(normalized.some(file => file.endsWith('/logs/combined.log')));
    assert.ok(normalized.some(file => file.endsWith('/logs/error.log')));
});

test('coverage runner network tripwire permits loopback and identifies external hosts', () => {
    assert.strictEqual(isLoopbackHost('localhost'), true);
    assert.strictEqual(isLoopbackHost('127.0.0.1'), true);
    assert.strictEqual(isLoopbackHost('::1'), true);
    assert.strictEqual(isLoopbackHost('googleapis.com'), false);
    assert.strictEqual(requestHost('https://example.com/path'), 'example.com');
});
