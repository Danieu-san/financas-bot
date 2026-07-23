const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const TEST_ROOT = path.join(ROOT, 'tests');
const TEST_AGGREGATES_PATH = path.join(TEST_ROOT, 'exhaustiveLocalTestAggregates.json');
const STATE_STORE_PATH = path.join(ROOT, 'state_store.json');
const STATE_STORE_TEMP_PATH = path.join(ROOT, 'state_store.tmp');
const STATE_STORE_REPLAY_PATH = path.join(ROOT, 'state_store.replay.json');
const STATE_STORE_REPLAY_TEMP_PATH = path.join(ROOT, 'state_store.replay.tmp');
const NETWORK_TRIPWIRE_PATH = path.join(TEST_ROOT, 'helpers', 'exhaustiveNetworkTripwire.js');
const MUTABLE_RUNTIME_FILES = Object.freeze([
    STATE_STORE_PATH,
    STATE_STORE_TEMP_PATH,
    STATE_STORE_REPLAY_PATH,
    STATE_STORE_REPLAY_TEMP_PATH,
    path.join(ROOT, 'logs', 'combined.log'),
    path.join(ROOT, 'logs', 'error.log')
]);
const EXCLUDED = Object.freeze({
    'whatsapp-real-e2e.test.js': 'controls a real signed-in WhatsApp session'
});
const EXPECTED_SKIPPED_TESTS = Object.freeze([
    'functional: consent, onboarding, settings and dashboard',
    'functional: expenses, income and credit card installments',
    'functional: goals, debts, payments and reminders',
    'functional: analytics, deletion, admin and fallback',
    'functional: complex analytics handles typos, counts, duplicates and min/max'
]);
const SAFE_ENVIRONMENT_KEYS = Object.freeze([
    'APPDATA',
    'CI',
    'COMSPEC',
    'HOME',
    'LANG',
    'LC_ALL',
    'LOCALAPPDATA',
    'NO_COLOR',
    'OS',
    'PATH',
    'PATHEXT',
    'Path',
    'SYSTEMROOT',
    'SystemRoot',
    'TEMP',
    'TERM',
    'TMP',
    'TMPDIR',
    'TZ',
    'USERPROFILE',
    'WINDIR'
]);

function listAllLocalTestFiles() {
    return fs.readdirSync(TEST_ROOT, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.test.js'))
        .filter(entry => !Object.hasOwn(EXCLUDED, entry.name))
        .map(entry => path.join(TEST_ROOT, entry.name))
        .sort();
}

function readTestAggregateManifest(files) {
    const entries = new Set(files.map(file => path.resolve(file)));
    const manifest = JSON.parse(fs.readFileSync(TEST_AGGREGATES_PATH, 'utf8'));
    if (!manifest || Array.isArray(manifest) || typeof manifest !== 'object') {
        throw new Error('invalid_test_aggregate_manifest');
    }
    const normalized = {};
    const nested = new Set();
    for (const [aggregateName, childNames] of Object.entries(manifest)) {
        if (!aggregateName.endsWith('.test.js') || !Array.isArray(childNames) || childNames.length === 0) {
            throw new Error('invalid_test_aggregate_entry');
        }
        const aggregatePath = path.resolve(TEST_ROOT, aggregateName);
        if (!entries.has(aggregatePath) || Object.hasOwn(EXCLUDED, aggregateName)) {
            throw new Error('invalid_test_aggregate_root');
        }
        normalized[aggregateName] = [];
        for (const childName of childNames) {
            if (typeof childName !== 'string' || !childName.endsWith('.test.js')) {
                throw new Error('invalid_nested_test_entry');
            }
            const childPath = path.resolve(TEST_ROOT, childName);
            if (childPath === aggregatePath || !entries.has(childPath)
                || Object.hasOwn(EXCLUDED, childName) || nested.has(childPath)) {
                throw new Error('invalid_nested_test_entry');
            }
            nested.add(childPath);
            normalized[aggregateName].push(childPath);
        }
    }
    return normalized;
}

function findNestedTestEntries(files) {
    const manifest = readTestAggregateManifest(files);
    const nested = new Set();
    for (const childPaths of Object.values(manifest)) {
        for (const childPath of childPaths) nested.add(childPath);
    }
    return [...nested].sort();
}

function listLocalTestFiles() {
    const allFiles = listAllLocalTestFiles();
    const nested = new Set(findNestedTestEntries(allFiles));
    return allFiles.filter(file => !nested.has(file));
}

function parseTapSummary(output) {
    const summary = {};
    for (const key of ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
        const matches = [...String(output).matchAll(new RegExp(`^# ${key} (\\d+)$`, 'gm'))];
        summary[key] = matches.length ? Number(matches.at(-1)[1]) : null;
    }
    return summary;
}

function parseCoverageSummary(output) {
    const line = String(output).split(/\r?\n/).find(item => /^# all files\s+\|/.test(item));
    if (!line) return null;
    const columns = line.replace(/^#\s*/, '').split('|').map(item => item.trim());
    if (columns.length < 5) return null;
    return {
        line_percent: Number(columns[1]),
        branch_percent: Number(columns[2]),
        function_percent: Number(columns[3]),
        uncovered_lines: columns[4]
    };
}

function parseFailures(output) {
    return String(output).split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => /^not ok \d+ - /.test(line))
        .slice(0, 100);
}

function parseSkippedTests(output) {
    return String(output).split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => /^ok \d+ - .+ # SKIP\b/i.test(line))
        .map(line => line.replace(/^ok \d+ - /, '').replace(/ # SKIP.*$/i, ''))
        .slice(0, 100);
}

function validateRunnerResult({
    exitStatus,
    tap,
    coverage,
    skippedTests = [],
    expectedSkippedTests = []
}) {
    const reasons = [];
    if (!Number.isInteger(exitStatus)) reasons.push('child_exit_status_missing');
    const requiredTapFields = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];
    if (!tap || requiredTapFields.some(field => !Number.isInteger(tap[field]))) {
        reasons.push('tap_summary_incomplete');
    }
    if (!coverage || !Number.isFinite(coverage.line_percent)
        || !Number.isFinite(coverage.branch_percent)
        || !Number.isFinite(coverage.function_percent)) {
        reasons.push('coverage_summary_missing');
    }
    if (tap && Number.isInteger(tap.skipped) && tap.skipped !== skippedTests.length) {
        reasons.push('skipped_summary_mismatch');
    }
    const actualSkipped = [...skippedTests].sort();
    const expectedSkipped = [...expectedSkippedTests].sort();
    if (actualSkipped.some((name, index) => name !== expectedSkipped[index])
        || actualSkipped.length !== expectedSkipped.length) {
        reasons.push('unexpected_skipped_tests');
    }
    return { valid: reasons.length === 0, reasons };
}

function buildNodeTestArgs(files) {
    return [
        '--require',
        NETWORK_TRIPWIRE_PATH,
        '--experimental-test-coverage',
        '--test',
        '--test-concurrency=1',
        ...files
    ];
}

function buildDescendantNodeOptions(existingNodeOptions = '') {
    const preservedFlags = ['--preserve-symlinks', '--preserve-symlinks-main']
        .filter(flag => String(existingNodeOptions).split(/\s+/).includes(flag));
    const tripwirePath = NETWORK_TRIPWIRE_PATH.replace(/\\/g, '/').replace(/"/g, '\\"');
    return [`--require="${tripwirePath}"`, ...preservedFlags].join(' ');
}

function buildHermeticTestEnvironment(sourceEnvironment = process.env) {
    const environment = {};
    for (const key of SAFE_ENVIRONMENT_KEYS) {
        if (typeof sourceEnvironment[key] === 'string' && sourceEnvironment[key]) {
            environment[key] = sourceEnvironment[key];
        }
    }
    return {
        ...environment,
        NODE_ENV: 'test',
        NODE_OPTIONS: buildDescendantNodeOptions(sourceEnvironment.NODE_OPTIONS),
        RUN_FUNCTIONAL_TESTS: 'false',
        WHATSAPP_E2E_ENABLED: 'false',
        EXHAUSTIVE_NETWORK_TRIPWIRE_ACTIVE: 'true',
        STATE_STORE_ENCRYPTION_KEY: Buffer.alloc(32, 0x55).toString('base64'),
        OPEN_FINANCE_AUTO_SYNC_ENABLED: 'false',
        OPEN_FINANCE_LIVE_READ_ENABLED: 'false'
    };
}

function captureFileSnapshot(file) {
    if (!fs.existsSync(file)) return { exists: false, data: null };
    return {
        exists: true,
        data: fs.readFileSync(file),
        mode: fs.statSync(file).mode & 0o777
    };
}

function restoreFileSnapshot(file, snapshot) {
    if (snapshot.exists) {
        fs.writeFileSync(file, snapshot.data, { mode: snapshot.mode });
        fs.chmodSync(file, snapshot.mode);
        return;
    }
    if (fs.existsSync(file)) fs.unlinkSync(file);
}

function runLocalCoverage() {
    const allFiles = listAllLocalTestFiles();
    const nestedTestEntries = findNestedTestEntries(allFiles);
    const files = listLocalTestFiles();
    const startedAt = Date.now();
    const runtimeSnapshots = MUTABLE_RUNTIME_FILES.map(file => [file, captureFileSnapshot(file)]);
    let result;
    try {
        result = spawnSync(process.execPath, buildNodeTestArgs(files), {
            cwd: ROOT,
            encoding: 'utf8',
            maxBuffer: 128 * 1024 * 1024,
            env: buildHermeticTestEnvironment()
        });
    } finally {
        for (const [file, snapshot] of runtimeSnapshots) restoreFileSnapshot(file, snapshot);
    }
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    const tap = parseTapSummary(output);
    const coverage = parseCoverageSummary(output);
    const skippedTests = parseSkippedTests(output);
    const validation = validateRunnerResult({
        exitStatus: result.status,
        tap,
        coverage,
        skippedTests,
        expectedSkippedTests: EXPECTED_SKIPPED_TESTS
    });
    return {
        schema_version: 1,
        local_only: true,
        external_network_blocked: true,
        discovered_test_files: allFiles.length,
        test_files: files.length,
        nested_test_entries: nestedTestEntries.map(file => path.relative(ROOT, file).replace(/\\/g, '/')),
        excluded: Object.entries(EXCLUDED).map(([file, reason]) => ({ file: `tests/${file}`, reason })),
        duration_ms: Date.now() - startedAt,
        exit_status: result.status,
        signal: result.signal || null,
        valid: validation.valid,
        validation_reasons: validation.reasons,
        tap,
        coverage,
        failures: parseFailures(output),
        skipped_tests: skippedTests
    };
}

if (require.main === module) {
    const result = runLocalCoverage();
    process.stdout.write(`EXHAUSTIVE_LOCAL_TEST_RESULT ${JSON.stringify(result)}\n`);
    process.exitCode = result.exit_status === 0 && result.valid ? 0 : 1;
}

module.exports = {
    EXCLUDED,
    EXPECTED_SKIPPED_TESTS,
    MUTABLE_RUNTIME_FILES,
    listAllLocalTestFiles,
    listLocalTestFiles,
    findNestedTestEntries,
    readTestAggregateManifest,
    parseTapSummary,
    parseCoverageSummary,
    parseFailures,
    parseSkippedTests,
    validateRunnerResult,
    buildNodeTestArgs,
    buildDescendantNodeOptions,
    buildHermeticTestEnvironment,
    captureFileSnapshot,
    restoreFileSnapshot,
    runLocalCoverage
};
