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

test('coverage evidence preserves raw diagnostics without overwriting an earlier invocation', t => {
    const { persistCoverageOutput } = require('../scripts/runExhaustiveLocalTestCoverage');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'exhaustive-coverage-evidence-'));
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    const stdout = Buffer.from('not ok 1 - preserved failure\n  error: immutable_expected_mismatch\n');
    const stderr = Buffer.from('raw stderr\n');
    const evidence = persistCoverageOutput({ stdout, stderr, status: 1, signal: null }, temp);
    assert.deepStrictEqual(fs.readFileSync(evidence.stdout.path), stdout);
    assert.deepStrictEqual(fs.readFileSync(evidence.stderr.path), stderr);
    const digest = bytes => require('node:crypto').createHash('sha256').update(bytes).digest('hex');
    assert.strictEqual(evidence.stdout.sha256, digest(stdout));
    assert.strictEqual(evidence.stderr.sha256, digest(stderr));
    assert.strictEqual(evidence.capture_complete, true);
    assert.throws(() => persistCoverageOutput({ stdout: 'overwrite', stderr: '' }, temp), /EEXIST/);
    assert.deepStrictEqual(fs.readFileSync(evidence.stdout.path), stdout);
});

test('subprocess errors invalidate complete-looking summaries and remain in retained evidence', t => {
    const { persistCoverageOutput } = require('../scripts/runExhaustiveLocalTestCoverage');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'exhaustive-coverage-partial-'));
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    const error = { code: 'ENOBUFS', message: 'not a qualification' };
    const evidence = persistCoverageOutput({ stdout: 'partial TAP', stderr: '', status: 0, error }, temp);
    assert.strictEqual(evidence.capture_complete, false);
    assert.deepStrictEqual(evidence.subprocess_error, { code: 'ENOBUFS' });
    const result = validateRunnerResult({ exitStatus: 0,
        tap: { tests: 1, pass: 1, fail: 0, cancelled: 0, skipped: 0, todo: 0 },
        coverage: { line_percent: 80, branch_percent: 80, function_percent: 80 },
        subprocessError: evidence.subprocess_error });
    assert.strictEqual(result.valid, false);
    assert.ok(result.reasons.includes('child_subprocess_error'));
});

test('real subprocess buffer exhaustion retains diagnostics without claiming complete capture', t => {
    const { persistCoverageOutput } = require('../scripts/runExhaustiveLocalTestCoverage');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'exhaustive-coverage-buffer-'));
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    const result = spawnSync(process.execPath, ['-e',
        "process.stdout.write('# tests 1\\n# pass 1\\n# fail 0\\n' + 'x'.repeat(8192));"],
        { cwd: ROOT, env: buildHermeticTestEnvironment(process.env), maxBuffer: 1024, windowsHide: true });
    assert.strictEqual(result.error?.code, 'ENOBUFS');
    const evidence = persistCoverageOutput(result, temp);
    assert.strictEqual(evidence.capture_complete, false);
    assert.strictEqual(evidence.subprocess_error.code, 'ENOBUFS');
    assert.deepStrictEqual(fs.readFileSync(evidence.stdout.path), result.stdout);
});

test('hermetic Git blob reads require immutable objects and the audited root; commands and escapes remain denied', () => {
    const environment = buildHermeticTestEnvironment(process.env);
    const child = spawnSync(process.execPath, ['-e', `
        const assert = require('node:assert/strict');
        const { execFileSync } = require('node:child_process');
        const { isAuditedLocalGitCommand: allowed } = require(${JSON.stringify(path.join(ROOT, 'tests/helpers/exhaustiveNetworkTripwire.js'))});
        const git = process.env.EXHAUSTIVE_LOCAL_GIT_PATH;
        const cwd = ${JSON.stringify(ROOT)};
        const commit = '42a16c8516373d1c5fc49a3836f0eba54e61d4c5';
        const file = 'src/utils/budgetCycle.js';
        const object = commit + ':' + file;
        for (const spec of [commit, object, commit + ':.github/workflows/a.yml']) {
            assert.equal(allowed(git, ['cat-file', 'blob', spec], { cwd }), true);
            assert.equal(allowed(git, ['cat-file', 'blob', spec], { cwd: require('node:os').tmpdir() }), false);
        }
        for (const spec of ['HEAD:' + file, commit + '^:' + file, commit + ':/absolute',
            commit + ':../escape', commit + ':a/../b', commit + ':a//b', commit + ':./b',
            commit + ':a\\\\b', commit + ':a:b', commit + ':a;echo', commit + ':', '--help']) {
            assert.equal(allowed(git, ['cat-file', 'blob', spec], { cwd }), false, spec);
        }
        for (const args of [['cat-file', '--filters', object], ['cat-file', '--textconv', object],
            ['cat-file', 'blob', object, '--help'], ['show', object], ['fetch'], ['reset', '--hard'],
            ['-c', 'core.sshCommand=anything', 'cat-file', 'blob', object]]) {
            assert.equal(allowed(git, args, { cwd }), false, JSON.stringify(args));
        }
        const text = execFileSync(git, ['cat-file', 'blob', object], { cwd, encoding: 'utf8' });
        assert.equal(text.replaceAll('\\r\\n', '\\n'), require('node:fs').readFileSync(require('node:path').join(cwd, file), 'utf8').replaceAll('\\r\\n', '\\n'));
    `], { cwd: ROOT, env: environment, encoding: 'utf8' });
    assert.strictEqual(child.status, 0, `${child.stdout || ''}\n${child.stderr || ''}`);
});

test('coverage tripwire admits only the finite scope fixture contract and local exclusions', t => {
    const inherited = process.env.EXHAUSTIVE_AUDIT_TEMP_ROOT;
    const auditRoot = inherited ? fs.realpathSync(inherited)
        : fs.mkdtempSync(path.join(os.tmpdir(), 'fb-scope-audit-'));
    if (!inherited) t.after(() => fs.rmSync(auditRoot, { recursive: true, force: true }));
    const fixture = fs.mkdtempSync(path.join(auditRoot, 'financasbot-scope-test-'));
    const outside = fs.mkdtempSync(path.join(path.dirname(auditRoot), 'financasbot-scope-test-'));
    const nested = fs.mkdtempSync(path.join(fixture, 'financasbot-scope-test-'));
    const link = path.join(auditRoot, 'financasbot-scope-test-linked');
    fs.symlinkSync(outside, link, 'junction');
    t.after(() => { fs.rmSync(link, { force: true }); fs.rmSync(outside, { recursive: true, force: true });
        if (inherited) fs.rmSync(fixture, { recursive: true, force: true }); });
    const context = { fixture, outside, nested, link, root: ROOT,
        tripwire: path.join(ROOT, 'tests/helpers/exhaustiveNetworkTripwire.js') };
    function probe(context) {
        const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
        const cp = require('node:child_process'), wire = require(context.tripwire);
        const git = process.env.EXHAUSTIVE_LOCAL_GIT_PATH;
        assert.ok(git, 'pinned Git is required for the scope fixture');
        const object = 'a'.repeat(40), prefix = ['-c', 'safe.directory=' + context.fixture];
        const commands = [
            ['init', '-q', '-b', 'codex/test'], ['add', '--', 'old/wip.js', 'scripts/guard.js'],
            ['add', '--', 'old/wip.js'], ['add', '--', 'scripts/guard.js'], ['add', '--', 'old/new.js'],
            ['-c', 'user.name=Scope Test', '-c', 'user.email=scope-test@example.invalid', 'commit', '-q', '-m', 'fixture'],
            ['-c', 'user.name=Scope Test', '-c', 'user.email=scope-test@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'new head'],
            ['switch', '-q', '-c', 'codex/other'], ['switch', '-q', 'codex/test'],
            ['rm', '--cached', '--', 'old/wip.js'], ['rm', '--cached', '--', 'scripts/guard.js'],
            ['rev-parse', 'HEAD'], ['rev-parse', ':scripts/guard.js'],
            ['update-index', '--cacheinfo', '120000,' + object + ',scripts/guard.js'],
            ['update-index', '--cacheinfo', '100644,' + object + ',scripts/guard.js'],
            ['update-index', '--chmod=+x', '--', 'old/wip.js'], ['branch', '--show-current'],
            ['diff', '--name-only', '--no-renames', '-z', 'HEAD', '--'],
            ['ls-files', '--others', '--exclude-standard', '-z'], ['ls-files', '--stage', '-z'],
            ['diff', '--cached', '--name-only', '--no-renames', '-z', 'HEAD', '--'],
            ['diff', '--cached', '--name-only', '--no-renames', '--diff-filter=D', '-z', 'HEAD', '--']
        ];
        const allowed = (command, args, cwd, extra = {}) =>
            wire.isAuditedLocalGitCommand(command, args, { cwd, ...extra });
        let mutations = 0;
        for (const command of commands) {
            const args = [...prefix, ...command];
            assert.equal(allowed(git, args, context.fixture), true, JSON.stringify(args));
            for (const cwd of [context.root, context.outside, context.nested, context.link]) {
                assert.equal(allowed(git, args, cwd), false, cwd); mutations++;
            }
            assert.equal(allowed(process.execPath, args, context.fixture), false); mutations++;
            assert.equal(allowed(git, args, context.fixture, { shell: true }), false); mutations++;
            assert.equal(allowed(git, args.slice(2), context.fixture), false); mutations++;
            assert.equal(allowed(git, [...args, '--unapproved'], context.fixture), false); mutations++;
            for (let i = 0; i < args.length; i++) {
                const changed = [...args]; changed[i] = 'unapproved-token';
                assert.equal(allowed(git, changed, context.fixture), false, JSON.stringify(changed)); mutations++;
            }
        }
        for (const command of [['fetch'], ['push'], ['clone', 'anything'], ['reset', '--hard'],
            ['config', '--global', 'core.hooksPath', 'anything'], ['add', '--', '../escape'],
            ['add', '--', '.git/config'], ['switch', '-q', 'main'],
            ['update-index', '--cacheinfo', '100755,' + object + ',scripts/guard.js'],
            ['rev-parse', ':../escape'], ['-c', 'core.sshCommand=anything', 'rev-parse', 'HEAD']]) {
            assert.equal(allowed(git, [...prefix, ...command], context.fixture), false); mutations++;
        }
        const g = (args, env = process.env) => cp.execFileSync(git, [...prefix, ...args],
            { cwd: context.fixture, encoding: 'utf8', env });
        g(commands[0]);
        const exclude = path.join(context.fixture, '.git/info/scope-test.exclude');
        fs.writeFileSync(exclude, 'ignored-runtime/\n');
        fs.mkdirSync(path.join(context.fixture, 'ignored-runtime'));
        fs.writeFileSync(path.join(context.fixture, 'ignored-runtime/private.txt'), 'synthetic');
        const exclusions = { ...process.env, GIT_CONFIG_COUNT: '1',
            GIT_CONFIG_KEY_0: 'core.excludesFile', GIT_CONFIG_VALUE_0: exclude };
        const query = ['ls-files', '--others', '--exclude-standard', '-z'];
        assert.equal(g(query, exclusions).includes('ignored-runtime/'), false, 'fixture-local exclusions preserved');
        const externalExclude = path.join(context.outside, 'scope-test.exclude');
        fs.writeFileSync(externalExclude, 'ignored-runtime/\n');
        const nonCanonicalExclude = path.join(context.fixture, '.git', 'info') +
            path.sep + '..' + path.sep + 'info' + path.sep + 'scope-test.exclude';
        for (const value of [externalExclude, nonCanonicalExclude]) {
            assert.equal(g(query, { ...exclusions, GIT_CONFIG_VALUE_0: value }).includes('ignored-runtime/'),
                true, 'non-exact exclusion path must not survive');
        }
        assert.equal(g(query, { ...exclusions, GIT_CONFIG_COUNT: '2',
            GIT_CONFIG_KEY_1: 'core.hooksPath', GIT_CONFIG_VALUE_1: externalExclude }).includes('ignored-runtime/'),
            true, 'arbitrary config vector must be scrubbed');
        assert.equal(g(query, { ...exclusions, GIT_CONFIG_PARAMETERS: "'core.excludesFile=" + externalExclude + "'" })
            .includes('ignored-runtime/'), true, 'alternate config channel must be scrubbed');
        for (const key of ['GIT_DIR', 'GIT_COMMON_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE',
            'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_EXEC_PATH', 'GIT_TEMPLATE_DIR']) {
            assert.equal(g(query, { ...process.env, [key]: context.outside }).includes('ignored-runtime/'),
                true, 'Git path redirection must not survive: ' + key);
        }
        const info = path.dirname(exclude), retainedInfo = info + '-physical';
        fs.renameSync(info, retainedInfo);
        fs.symlinkSync(context.outside, info, 'junction');
        try {
            assert.equal(g(query, exclusions).includes('ignored-runtime/'), true, 'linked exclusion directory refused');
        } finally {
            fs.rmSync(info, { recursive: true, force: true });
            fs.renameSync(retainedInfo, info);
        }
        assert.throws(() => g(['fetch']), /EXHAUSTIVE_AUDIT_SUBPROCESS_BLOCKED/);
        assert.throws(() => cp.execFileSync(git, [...prefix, 'rev-parse', 'HEAD'],
            { cwd: context.fixture, shell: true }), /EXHAUSTIVE_AUDIT_SUBPROCESS_BLOCKED/);
        assert.ok(mutations > 250, 'generated finite-command mutations covered');
        process.stdout.write('scope-fixture-contract-ok:' + mutations);
    }
    const environment = buildHermeticTestEnvironment(process.env, { auditTempRoot: auditRoot });
    const child = spawnSync(process.execPath, ['-e',
        '(' + probe.toString() + ')(' + JSON.stringify(context) + ');'],
        { cwd: ROOT, env: environment, encoding: 'utf8' });
    assert.strictEqual(child.status, 0, (child.stdout || '') + '\n' + (child.stderr || ''));
    assert.match(child.stdout, /^scope-fixture-contract-ok:\d+$/);
});

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

test('coverage runner preserves pinned timezone and network blocking through every child API', () => {
    for (const flags of ['', '--preserve-symlinks --preserve-symlinks-main']) {
        const environment = buildHermeticTestEnvironment({ ...process.env, NODE_OPTIONS: flags });
        const child = spawnSync(process.execPath, [
            path.join(__dirname, 'helpers', 'exhaustiveTimezoneChild.cjs'), 'tree'
        ], { env: environment, encoding: 'utf8', timeout: 30000 });
        assert.strictEqual(child.status, 0, child.stderr);
        assert.strictEqual(child.stdout.trim(), 'protected-tree-ok');
    }
});

test('explicit CLI tripwire preload protects descendants without ambient Node options', () => {
    const environment = buildHermeticTestEnvironment(process.env);
    delete environment.NODE_OPTIONS;
    const child = spawnSync(process.execPath, [
        '--require', path.join(__dirname, 'helpers', 'exhaustiveNetworkTripwire.js'),
        path.join(__dirname, 'helpers', 'exhaustiveTimezoneChild.cjs'), 'tree'
    ], { env: environment, encoding: 'utf8', timeout: 30000 });
    assert.strictEqual(child.status, 0, child.stderr);
    assert.strictEqual(child.stdout.trim(), 'protected-tree-ok');
});

test('coverage tripwire never conceals additional Node options from timezone validation', () => {
    const tripwirePath = path.join(__dirname, 'helpers', 'exhaustiveNetworkTripwire.js');
    const environment = buildHermeticTestEnvironment(process.env);
    // Set the override after launch so this assertion also works inside the
    // broad suite, whose parent tripwire sanitizes every child environment.
    const child = spawnSync(process.execPath, ['-e', `
        const assert = require('node:assert/strict');
        const tripwirePath = ${JSON.stringify(tripwirePath)};
        const timezone = require(${JSON.stringify(path.join(ROOT, 'src/next/provenance/pinnedCivilTimezone.js'))});
        const canonical = ${JSON.stringify(environment.NODE_OPTIONS)};
        const tripwire = require(tripwirePath);
        for (const extra of ['--no-warnings', '--icu-data-dir=untrusted']) {
            process.env.NODE_OPTIONS = canonical + ' ' + extra;
            delete global.__FINANCASBOT_EXHAUSTIVE_NETWORK_TRIPWIRE__;
            tripwire.installTripwire();
            assert.equal(process.env.NODE_OPTIONS, canonical + ' ' + extra);
            assert.throws(() => timezone.civilDateInPinnedTimezone(
                '2018-11-04T03:00:00Z', 'America/Sao_Paulo', 'proleptic_gregorian'),
                /timezone_runtime_invalid/);
        }
    `], { env: environment, encoding: 'utf8', timeout: 30000 });
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
        path.join(path.dirname(auditRoot), 'financasbot-release-repo-')
    );
    const outsideTarget = fs.mkdtempSync(
        path.join(path.dirname(auditRoot), 'financasbot-release-escape-')
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
    assert.ok(args.includes('--test-reporter=tap'));
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
    assert.strictEqual(isLoopbackHost('127.0.0.2'), true);
    assert.strictEqual(isLoopbackHost('127.255.255.255'), true);
    assert.strictEqual(isLoopbackHost('::1'), true);
    assert.strictEqual(isLoopbackHost('[::1]'), true);
    assert.strictEqual(isLoopbackHost(' LOCALHOST '), true);
    assert.strictEqual(isLoopbackHost('0.0.0.0'), true);
    assert.strictEqual(isLoopbackHost(''), true);
    assert.strictEqual(isLoopbackHost('googleapis.com'), false);
    assert.strictEqual(isLoopbackHost('126.255.255.255'), false);
    assert.strictEqual(isLoopbackHost('128.0.0.1'), false);
    for (const host of ['127.example.invalid', '127.0.0.1.example.invalid', '127.0.0.256']) {
        assert.strictEqual(isLoopbackHost(host), false, host);
    }
    // Generate both classes, rather than an allowlist of previously seen names.
    for (const first of [0, 1, 126, 127, 128, 255]) {
        for (const middle of [0, 1, 127, 255]) {
            for (const last of [0, 1, 254, 255]) {
                const address = `${first}.${middle}.${middle}.${last}`;
                assert.strictEqual(isLoopbackHost(address),
                    first === 127 || address === '0.0.0.0', address);
                assert.strictEqual(isLoopbackHost(`${address}.example.invalid`),
                    false, `${address}.example.invalid`);
            }
        }
    }
    assert.strictEqual(requestHost('https://example.com/path'), 'example.com');
    assert.strictEqual(requestHost('http://127.0.0.1/', {
        hostname: 'ordinary.example.invalid'
    }), 'ordinary.example.invalid');
    assert.strictEqual(requestHost(new URL('http://127.0.0.1/'), {
        host: 'ordinary.example.invalid'
    }), '127.0.0.1');
    assert.strictEqual(requestHost('http://127.0.0.1/', {
        hostname: undefined,
        host: 'ordinary.example.invalid'
    }), 'ordinary.example.invalid');
    const nonEnumerable = { host: 'ordinary.example.invalid' };
    Object.defineProperty(nonEnumerable, 'hostname', { value: 'localhost' });
    assert.strictEqual(requestHost('https://ordinary.example.invalid/', nonEnumerable),
        'ordinary.example.invalid');
    assert.strictEqual(requestHost(nonEnumerable), 'ordinary.example.invalid');
    const failure = new Error('fixture-option-access');
    assert.throws(() => requestHost('http://127.0.0.1/', {
        get hostname() { throw failure; }
    }), error => error === failure);
});

test('coverage tripwire checks effective HTTP hosts and fetch Request inputs without network', () => {
    const tripwirePath = path.join(__dirname, 'helpers', 'exhaustiveNetworkTripwire.js');
    const environment = buildHermeticTestEnvironment(process.env);
    const child = spawnSync(process.execPath, ['-e', `
        const assert = require('node:assert/strict');
        const http = require('node:http');
        const https = require('node:https');
        const net = require('node:net');
        const forwarded = [];
        // Synthetic originals only. No socket/HTTP/fetch implementation is called.
        for (const module of [http, https]) {
            module.request = () => 'local-http';
            module.get = () => 'local-http';
        }
        net.connect = () => 'local-net';
        net.createConnection = () => 'local-net';
        global.fetch = async (input, init) => {
            forwarded.push({ input, init }); return 'local-fetch';
        };
        // Rebind the existing guard around the fake originals in this child only.
        delete global.__FINANCASBOT_EXHAUSTIVE_NETWORK_TRIPWIRE__;
        require(${JSON.stringify(tripwirePath)}).installTripwire();
        const blocked = { code: 'EXHAUSTIVE_AUDIT_NETWORK_BLOCKED' };
        (async () => {
            const inputForms = [value => value, value => new URL(value), value => new Request(value)];
            for (const makeInput of inputForms) {
                await assert.rejects(fetch(makeInput('https://ordinary.example.invalid/'),
                    { hostname: 'localhost' }), blocked);
            }
            const shadowed = new Request('https://ordinary.example.invalid/');
            Object.defineProperty(shadowed, 'url', { value: 'http://127.0.0.1/' });
            await assert.rejects(fetch(shadowed), blocked);
            await assert.rejects(fetch('https://ordinary.example.invalid/', { hostname: 'localhost' }), blocked);
            let coerced = 0;
            await assert.rejects(fetch({ hostname: 'localhost', toString() {
                coerced++; return 'https://ordinary.example.invalid/';
            } }), blocked);
            assert.equal(coerced, 1);
            assert.equal(forwarded.length, 0);
            for (const module of [http, https]) {
                for (const method of ['request', 'get']) {
                    for (const makeInput of inputForms.slice(0, 2)) {
                        assert.throws(() => module[method](makeInput('http://127.0.0.1/'),
                            { hostname: 'ordinary.example.invalid' }), blocked);
                        assert.equal(module[method](makeInput('http://ordinary.example.invalid/'),
                            { hostname: '127.0.0.1' }), 'local-http');
                    }
                }
            }
            const local = new Request('http://127.0.0.1/', { method: 'POST', body: 'synthetic' });
            const init = { headers: { 'x-fixture': 'local' }, dispatcher: {} };
            assert.equal(await fetch(local, init), 'local-fetch');
            assert.equal(forwarded[0].input, local);
            assert.equal(forwarded[0].init, init);
            assert.equal(local.bodyUsed, false);
            assert.equal(await fetch(new URL('http://127.0.0.1/'),
                { hostname: 'ordinary.example.invalid' }), 'local-fetch');
            assert.equal(forwarded[1].input, 'http://127.0.0.1/');
            console.log('guard-inputs-ok');
        })().catch(error => { console.error(error); process.exitCode = 1; });
    `], { env: environment, encoding: 'utf8', timeout: 30000 });
    assert.strictEqual(child.status, 0, child.stderr);
    assert.strictEqual(child.stdout.trim(), 'guard-inputs-ok');
});
