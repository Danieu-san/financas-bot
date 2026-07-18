const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const TEST_ROOT = path.join(ROOT, 'tests');
const STATE_STORE_PATH = path.join(ROOT, 'state_store.json');
const NETWORK_TRIPWIRE_PATH = path.join(TEST_ROOT, 'helpers', 'exhaustiveNetworkTripwire.js');
const MUTABLE_RUNTIME_FILES = Object.freeze([
    STATE_STORE_PATH,
    path.join(ROOT, 'logs', 'combined.log'),
    path.join(ROOT, 'logs', 'error.log')
]);
const EXCLUDED = Object.freeze({
    'whatsapp-real-e2e.test.js': 'controls a real signed-in WhatsApp session'
});

function listAllLocalTestFiles() {
    return fs.readdirSync(TEST_ROOT, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.test.js'))
        .filter(entry => !Object.hasOwn(EXCLUDED, entry.name))
        .map(entry => path.join(TEST_ROOT, entry.name))
        .sort();
}

function findNestedTestEntries(files) {
    const entries = new Set(files.map(file => path.resolve(file)));
    const nested = new Set();
    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        for (const match of source.matchAll(/require\(\s*['"](\.\/[^'"]+\.test(?:\.js)?)['"]\s*\)/g)) {
            const candidate = path.resolve(path.dirname(file), match[1].endsWith('.js') ? match[1] : `${match[1]}.js`);
            if (entries.has(candidate)) nested.add(candidate);
        }
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

function validateRunnerResult({ exitStatus, tap, coverage }) {
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
    return { valid: reasons.length === 0, reasons };
}

function captureFileSnapshot(file) {
    if (!fs.existsSync(file)) return { exists: false, data: null };
    return { exists: true, data: fs.readFileSync(file) };
}

function restoreFileSnapshot(file, snapshot) {
    if (snapshot.exists) {
        fs.writeFileSync(file, snapshot.data);
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
        result = spawnSync(process.execPath, [
            '--require',
            NETWORK_TRIPWIRE_PATH,
            '--experimental-test-coverage',
            '--test',
            ...files
        ], {
            cwd: ROOT,
            encoding: 'utf8',
            maxBuffer: 128 * 1024 * 1024,
            env: {
                ...process.env,
                NODE_ENV: 'test',
                RUN_FUNCTIONAL_TESTS: 'false',
                WHATSAPP_E2E_ENABLED: 'false',
                EXHAUSTIVE_NETWORK_TRIPWIRE_ACTIVE: 'true',
                OPEN_FINANCE_AUTO_SYNC_ENABLED: 'false',
                OPEN_FINANCE_LIVE_READ_ENABLED: 'false'
            }
        });
    } finally {
        for (const [file, snapshot] of runtimeSnapshots) restoreFileSnapshot(file, snapshot);
    }
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    const tap = parseTapSummary(output);
    const coverage = parseCoverageSummary(output);
    const validation = validateRunnerResult({ exitStatus: result.status, tap, coverage });
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
        skipped_tests: parseSkippedTests(output)
    };
}

if (require.main === module) {
    const result = runLocalCoverage();
    process.stdout.write(`EXHAUSTIVE_LOCAL_TEST_RESULT ${JSON.stringify(result)}\n`);
    process.exitCode = result.exit_status === 0 && result.valid ? 0 : 1;
}

module.exports = {
    EXCLUDED,
    MUTABLE_RUNTIME_FILES,
    listAllLocalTestFiles,
    listLocalTestFiles,
    findNestedTestEntries,
    parseTapSummary,
    parseCoverageSummary,
    parseFailures,
    parseSkippedTests,
    validateRunnerResult,
    captureFileSnapshot,
    restoreFileSnapshot,
    runLocalCoverage
};
