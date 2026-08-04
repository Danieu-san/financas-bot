const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const { isLoopbackHost, requestHost } = require('./helpers/exhaustiveNetworkTripwire');

const {
    EXCLUDED,
    EXPECTED_SKIPPED_TESTS,
    MUTABLE_RUNTIME_FILES,
    listAllLocalTestFiles,
    listLocalTestFiles,
    parseTapSummary,
    parseCoverageSummary,
    parseFailures,
    findNestedTestEntries,
    validateRunnerResult,
    buildNodeTestArgs,
    buildHermeticTestEnvironment,
    resolveExecutableOnPath,
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

test('npm test delegates to the exhaustive local release gate while real E2E remains explicit', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.strictEqual(packageJson.scripts.pretest, undefined);
    assert.strictEqual(packageJson.scripts.test, 'npm run test:release');
    assert.strictEqual(
        packageJson.scripts['test:release'],
        'node scripts/runExhaustiveLocalTestCoverage.js'
    );
    assert.strictEqual(
        packageJson.scripts['test:whatsapp:e2e'],
        'node scripts/runWhatsappRealE2E.js'
    );
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
    const nested = findNestedTestEntries(listAllLocalTestFiles())
        .map(file => file.replace(/\\/g, '/'));
    assert.ok(nested.some(file => file.endsWith('/openFinanceSandboxWebhook.test.js')));
    assert.strictEqual(nested.length, 18);
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

test('coverage runner fails closed for new or missing skipped tests', () => {
    const tap = {
        tests: 10,
        pass: 9,
        fail: 0,
        cancelled: 0,
        skipped: 1,
        todo: 0
    };
    const coverage = { line_percent: 80, branch_percent: 70, function_percent: 75 };
    assert.deepStrictEqual(validateRunnerResult({
        exitStatus: 0,
        tap,
        coverage,
        skippedTests: ['expected skip'],
        expectedSkippedTests: ['expected skip']
    }), { valid: true, reasons: [] });
    assert.ok(validateRunnerResult({
        exitStatus: 0,
        tap,
        coverage,
        skippedTests: ['unexpected skip'],
        expectedSkippedTests: ['expected skip']
    }).reasons.includes('unexpected_skipped_tests'));
    assert.ok(validateRunnerResult({
        exitStatus: 0,
        tap: { ...tap, skipped: 0 },
        coverage,
        skippedTests: [],
        expectedSkippedTests: ['expected skip']
    }).reasons.includes('unexpected_skipped_tests'));
    assert.ok(validateRunnerResult({
        exitStatus: 0,
        tap: { ...tap, skipped: 0, todo: 1 },
        coverage,
        skippedTests: [],
        expectedSkippedTests: []
    }).reasons.includes('unexpected_todo_tests'));
    assert.strictEqual(EXPECTED_SKIPPED_TESTS.length, 10);
    assert.ok(EXPECTED_SKIPPED_TESTS.includes(
        'instalador executa install e uninstall restaurando bytes preexistentes'
    ));
    assert.ok(EXPECTED_SKIPPED_TESTS.includes(
        'uninstall recusa divergencia somente de BOM e preserva bytes atuais'
    ));
});

test('coverage runner scrubs credentials and propagates network blocking to Node descendants', () => {
    const environment = buildHermeticTestEnvironment({
        Path: process.env.Path || process.env.PATH || '',
        SYSTEMROOT: process.env.SYSTEMROOT || '',
        TEMP: os.tmpdir(),
        NODE_OPTIONS: '--inspect --preserve-symlinks --preserve-symlinks-main',
        GOOGLE_CLIENT_SECRET: 'must-not-survive',
        OPEN_FINANCE_CLIENT_SECRET: 'must-not-survive'
    });
    assert.strictEqual(environment.GOOGLE_CLIENT_SECRET, undefined);
    assert.strictEqual(environment.OPEN_FINANCE_CLIENT_SECRET, undefined);
    assert.ok(environment.NODE_OPTIONS.includes('--require='));
    assert.ok(environment.NODE_OPTIONS.includes('--preserve-symlinks'));
    assert.ok(!environment.NODE_OPTIONS.includes('--inspect'));
    assert.strictEqual(
        environment.EXHAUSTIVE_LOCAL_GIT_PATH,
        resolveExecutableOnPath('git', { ...process.env, ...environment })
    );
    assert.strictEqual(
        environment.EXHAUSTIVE_LOCAL_TAR_PATH,
        resolveExecutableOnPath('tar', { ...process.env, ...environment })
    );

    const child = spawnSync(process.execPath, [
        '-e',
        `try {
            require('node:https').get('https://example.com');
            process.exit(2);
        } catch (error) {
            if (error.code !== 'EXHAUSTIVE_AUDIT_NETWORK_BLOCKED') process.exit(3);
        }
        process.env.NODE_OPTIONS = '';
        const descendant = require('node:child_process').spawnSync(process.execPath, [
            '-e',
            "try { require('node:https').get('https://example.com'); process.exit(8); } catch (error) { process.exit(error.code === 'EXHAUSTIVE_AUDIT_NETWORK_BLOCKED' ? 0 : 9); }"
        ]);
        if (descendant.status !== 0) process.exit(6);
        try {
            require('node:child_process').spawnSync('unapproved-executable', []);
            process.exit(4);
        } catch (error) {
            if (error.code !== 'EXHAUSTIVE_AUDIT_SUBPROCESS_BLOCKED') process.exit(5);
        }
        const safeGit = require('node:child_process').spawnSync(
            process.env.EXHAUSTIVE_LOCAL_GIT_PATH,
            ['rev-parse', 'HEAD'],
            { cwd: ${JSON.stringify(ROOT)} }
        );
        if (safeGit.status !== 0) process.exit(14);
        try {
            require('node:child_process').spawnSync(
                process.env.EXHAUSTIVE_LOCAL_GIT_PATH,
                ['status'],
                { cwd: ${JSON.stringify(ROOT)} }
            );
            process.exit(15);
        } catch (error) {
            if (error.code !== 'EXHAUSTIVE_AUDIT_SUBPROCESS_BLOCKED') process.exit(16);
        }
        try {
            require('node:child_process').spawnSync(process.execPath, ['-e', ''], { shell: true });
            process.exit(10);
        } catch (error) {
            if (error.code !== 'EXHAUSTIVE_AUDIT_SUBPROCESS_BLOCKED') process.exit(11);
        }
        try {
            require('node:child_process').fork('missing.js', [], { execPath: 'unapproved-executable' });
            process.exit(12);
        } catch (error) {
            process.exit(error.code === 'EXHAUSTIVE_AUDIT_SUBPROCESS_BLOCKED' ? 0 : 13);
        }`
    ], { env: environment, encoding: 'utf8' });
    assert.strictEqual(child.status, 0, child.stderr);
});

test('coverage runner confines Git and Tar to exact controlled roots', () => {
    const inheritedAuditRoot =
        process.env.EXHAUSTIVE_AUDIT_TEMP_ROOT || null;
    const auditRoot = inheritedAuditRoot
        ? fs.realpathSync(inheritedAuditRoot)
        : fs.mkdtempSync(
            path.join(os.tmpdir(), 'financasbot-exhaustive-test-')
        );
    const ownsAuditRoot = !inheritedAuditRoot;
    const outsideRepo = fs.mkdtempSync(
        path.join(os.tmpdir(), 'financasbot-release-repo-')
    );
    const outsideTarget = fs.mkdtempSync(
        path.join(os.tmpdir(), 'financasbot-release-escape-')
    );
    let fixtureRepo = null;
    let buildRoot = null;
    let outputRoot = null;
    let linkedOutput = null;
    try {
        fixtureRepo = fs.mkdtempSync(
            path.join(auditRoot, 'financasbot-release-repo-')
        );
        buildRoot = fs.mkdtempSync(
            path.join(auditRoot, 'financasbot-build-')
        );
        const tree = path.join(buildRoot, 'tree');
        fs.mkdirSync(tree);
        outputRoot = fs.mkdtempSync(
            path.join(auditRoot, 'financasbot-release-output-')
        );
        linkedOutput = path.join(
            auditRoot,
            'financasbot-release-output-linked'
        );
        fs.symlinkSync(outsideTarget, linkedOutput, 'junction');
        const commit = 'a'.repeat(40);
        const environment = buildHermeticTestEnvironment(
            {
                ...process.env,
                TEMP: os.tmpdir()
            },
            { auditTempRoot: auditRoot }
        );
        const child = spawnSync(process.execPath, [
            '-e',
            `const assert = require('node:assert/strict');
            const path = require('node:path');
            const tripwire = require(${JSON.stringify(
                path.join(ROOT, 'tests', 'helpers', 'exhaustiveNetworkTripwire.js')
            )});
            const git = process.env.EXHAUSTIVE_LOCAL_GIT_PATH;
            const tar = process.env.EXHAUSTIVE_LOCAL_TAR_PATH;
            const commit = ${JSON.stringify(commit)};
            assert.equal(tripwire.isAuditedLocalGitCommand(
                git,
                ['init', '--quiet'],
                { cwd: ${JSON.stringify(ROOT)} }
            ), false);
            assert.equal(tripwire.isAuditedLocalGitCommand(
                git,
                ['init', '--quiet'],
                { cwd: ${JSON.stringify(fixtureRepo)} }
            ), true);
            assert.equal(tripwire.isAuditedLocalGitCommand(
                git,
                ['init', '--quiet'],
                { cwd: ${JSON.stringify(outsideRepo)} }
            ), false);
            assert.equal(tripwire.isAuditedLocalGitCommand(
                git,
                [
                    'archive',
                    '--format=tar',
                    '--output=' + path.join(${JSON.stringify(outsideTarget)}, 'source.tar'),
                    commit
                ],
                { cwd: ${JSON.stringify(ROOT)} }
            ), false);
            assert.equal(tripwire.isAuditedLocalTarCommand(
                tar,
                [
                    '-czf',
                    path.join(
                        ${JSON.stringify(outputRoot)},
                        'financas-bot-' + commit + '.tar.gz'
                    ),
                    '-C',
                    ${JSON.stringify(tree)},
                    '.'
                ]
            ), true);
            assert.equal(tripwire.isAuditedLocalTarCommand(
                tar,
                [
                    '-czf',
                    path.join(
                        ${JSON.stringify(linkedOutput)},
                        'financas-bot-' + commit + '.tar.gz'
                    ),
                    '-C',
                    ${JSON.stringify(tree)},
                    '.'
                ]
            ), false);`
        ], {
            env: environment,
            encoding: 'utf8'
        });
        assert.strictEqual(child.status, 0, child.stderr);
    } finally {
        for (const target of [
            linkedOutput,
            fixtureRepo,
            buildRoot,
            outputRoot
        ]) {
            if (target) fs.rmSync(target, { recursive: true, force: true });
        }
        if (ownsAuditRoot) {
            fs.rmSync(auditRoot, { recursive: true, force: true });
        }
        fs.rmSync(outsideRepo, { recursive: true, force: true });
        fs.rmSync(outsideTarget, { recursive: true, force: true });
    }
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
