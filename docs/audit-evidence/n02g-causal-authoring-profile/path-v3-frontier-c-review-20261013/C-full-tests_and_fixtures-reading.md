# Fronteira C — tests_and_fixtures integrais

CODE cf6e43cbaa7c378f2b64590c50d0818700a3bdd0. Nenhum veredito ou autoridade por esta entrega.

## tests/exhaustiveLocalTestCoverageRunner.test.js

SHA-256 5b1d104ad84690f0f527c20f0e032d7cbb976c4928ceab250ed7d4a7515e27c9; Git blob 3c392eb513e106232a7c021170add0f2895484d7; bytes 32280.

```javascript
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
    assert.strictEqual(isLoopbackHost('::1'), true);
    assert.strictEqual(isLoopbackHost('googleapis.com'), false);
    assert.strictEqual(requestHost('https://example.com/path'), 'example.com');
});
```

## tests/fixtures/financasbot-next/golden-claim-oracles-v1.json

SHA-256 0e68ed70b10fdde5c90dc14aa3caf2ef72a4842bbbc6db8779287900567994d8; Git blob d20288e05e9d5abadd99cccd7f2cb571140986d2; bytes 22765.

```json
{
  "schema_version": 1,
  "oracle_id": "NEXT-GOLDEN-CLAIM-ORACLES-V1",
  "synthetic": true,
  "fixed_clock": "2042-06-15T12:00:00-03:00",
  "unit_conventions": {
    "money": "BRL_minor",
    "count": "count",
    "boolean": "boolean",
    "entity_ids": "entity_ids",
    "state": "state"
  },
  "turns": {
    "S-01#1": {"disposition":"materialized","facts":[{"metric":"consumption_total","value":169400,"unit":"BRL_minor","entity":"family-example","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-market-a","evt-snack-a","evt-fuel-a","evt-restaurant-b","evt-refund-b","evt-cinema-b","evt-gift-b","evt-rent-a","evt-installment-1"]}]},
    "S-02#1": {"disposition":"materialized","facts":[{"metric":"consumption_total","value":161200,"unit":"BRL_minor","entity":"person-a","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-market-a","evt-snack-a","evt-fuel-a","evt-rent-a","evt-installment-1"]}]},
    "S-03#1": {"disposition":"materialized","facts":[{"metric":"category_consumption","value":30000,"unit":"BRL_minor","entity":"family-example:food.market","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-market-a"]}]},
    "S-04#1": {"disposition":"materialized","facts":[{"metric":"movement_ids","value":["evt-salary-a","evt-market-a","evt-transfer-out","evt-invoice-payment","evt-rent-a"],"unit":"entity_ids","entity":"account-a","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-salary-a","evt-market-a","evt-transfer-out","evt-invoice-payment","evt-rent-a"]}]},
    "S-05#1": {"disposition":"materialized","facts":[{"metric":"statement_total","value":21200,"unit":"BRL_minor","entity":"card-blue","period":"statement_due:2042-06-17","time_basis":"statement_due_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-snack-a","evt-fuel-a"]}]},
    "S-06#1": {"disposition":"materialized","facts":[{"metric":"account_balance","value":295000,"unit":"BRL_minor","entity":"account-a","period":"as_of:2042-06-14","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["account-a","evt-salary-a","evt-market-a","evt-transfer-out","evt-invoice-payment","evt-rent-a"]}]},
    "S-07#1": {"disposition":"materialized","facts":[{"metric":"owned_cards","value":["card-blue","card-offline"],"unit":"entity_ids","entity":"person-a","period":"as_of:2042-06-15","time_basis":"registry_current","coverage":"complete","evidence_state":"confirmed","evidence_refs":["person-a","card-blue","card-offline"]}]},
    "S-08#1": {"disposition":"materialized","facts":[{"metric":"consumption_effect","value":0,"unit":"BRL_minor","entity":"transfer-01","period":"2042-06-12","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-transfer-out","evt-transfer-in"]}]},
    "S-09#1": {"disposition":"materialized","facts":[{"metric":"consumption_effect","value":0,"unit":"BRL_minor","entity":"evt-invoice-payment","period":"2042-06-13","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-invoice-payment"]}]},
    "S-10#1": {"disposition":"materialized","facts":[{"metric":"net_consumption","value":0,"unit":"BRL_minor","entity":"evt-restaurant-b","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-restaurant-b","evt-refund-b"]}]},
    "S-11#1": {"disposition":"materialized","facts":[{"metric":"installments_realized","value":1,"unit":"count","entity":"plan-01","period":"through:2042-06-15","time_basis":"installment_competence","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-installment-1"]},{"metric":"installments_projected","value":2,"unit":"count","entity":"plan-01","period":"2042-07..2042-08","time_basis":"installment_competence","coverage":"complete","evidence_state":"projected","evidence_refs":["evt-installment-2","evt-installment-3"]},{"metric":"installments_projected_amount","value":20000,"unit":"BRL_minor","entity":"plan-01","period":"2042-07..2042-08","time_basis":"installment_competence","coverage":"complete","evidence_state":"projected","evidence_refs":["evt-installment-2","evt-installment-3"]}]},
    "S-12#1": {"disposition":"materialized","facts":[{"metric":"account_balance","value":0,"unit":"BRL_minor","entity":"account-reserve","period":"as_of:2042-06-11","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["account-reserve"]}]},
    "S-13#1": {"disposition":"materialized","facts":[{"metric":"eligible_event_count","value":0,"unit":"count","entity":"family-example:health.general","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["source-empty-health"]}]},
    "S-14#1": {"disposition":"insufficient","reason":"coverage_partial","coverage":"partial","facts":[]},
    "S-15#1": {"disposition":"unavailable","reason":"required_source_unavailable","coverage":"unavailable","facts":[]},
    "S-16#1": {"disposition":"materialized","facts":[{"metric":"source_coverage","value":"complete","unit":"state","entity":"source-complete-june","period":"2042-06","time_basis":"source_period","coverage":"complete","evidence_state":"confirmed","evidence_refs":["source-complete-june"]}]},
    "M-01#1": {"disposition":"materialized","facts":[{"metric":"consumption_total","value":161200,"unit":"BRL_minor","entity":"person-a","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-market-a","evt-snack-a","evt-fuel-a","evt-rent-a","evt-installment-1"]},{"metric":"consumption_total","value":8200,"unit":"BRL_minor","entity":"person-b","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-restaurant-b","evt-refund-b","evt-cinema-b","evt-gift-b"]},{"metric":"ranking_winner","value":"person-a","unit":"entity_ids","entity":"family-example","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["person-a","person-b"]},{"metric":"consumption_difference","value":153000,"unit":"BRL_minor","entity":"person-a-minus-person-b","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["person-a","person-b"]}]},
    "M-02#1": {"disposition":"materialized","facts":[{"metric":"consumption_by_instrument","value":130000,"unit":"BRL_minor","entity":"account-a","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-market-a","evt-rent-a"]},{"metric":"consumption_by_instrument","value":31200,"unit":"BRL_minor","entity":"card-blue","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-snack-a","evt-fuel-a","evt-installment-1"]}]},
    "M-03#1": {"disposition":"materialized","facts":[{"metric":"budget_class_consumption","value":19400,"unit":"BRL_minor","entity":"family-example:flexible","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-snack-a","evt-restaurant-b","evt-refund-b","evt-cinema-b","evt-gift-b","evt-installment-1"]},{"metric":"budget_class_consumption","value":150000,"unit":"BRL_minor","entity":"family-example:essential","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-market-a","evt-fuel-a","evt-rent-a"]}]},
    "M-04#1": {"disposition":"materialized","facts":[{"metric":"balance_delta","value":-15000,"unit":"BRL_minor","entity":"account-a","period":"2042-06-12","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-transfer-out"]},{"metric":"balance_delta","value":15000,"unit":"BRL_minor","entity":"account-reserve","period":"2042-06-12","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-transfer-in"]},{"metric":"consumption_effect","value":0,"unit":"BRL_minor","entity":"transfer-01","period":"2042-06-12","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-transfer-out","evt-transfer-in"]}]},
    "M-05#1": {"disposition":"materialized","facts":[{"metric":"statement_total","value":21200,"unit":"BRL_minor","entity":"card-blue","period":"statement_due:2042-06-17","time_basis":"statement_due_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-snack-a","evt-fuel-a"]},{"metric":"invoice_payment_amount","value":60000,"unit":"BRL_minor","entity":"evt-invoice-payment","period":"2042-06-13","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-invoice-payment"]},{"metric":"invoice_payment_target_card","value":"card-blue","unit":"entity_ids","entity":"evt-invoice-payment","period":"2042-06-13","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-invoice-payment","card-blue"]},{"metric":"statement_payment_correspondence","value":"unproven","unit":"state","entity":"evt-invoice-payment","period":"2042-06-13","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-invoice-payment","card-blue"]},{"metric":"invoice_payment_consumption_effect","value":0,"unit":"BRL_minor","entity":"evt-invoice-payment","period":"2042-06-13","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-invoice-payment"]}]},
    "M-06#1": {"disposition":"materialized","facts":[{"metric":"gross_consumption","value":4500,"unit":"BRL_minor","entity":"person-b:food.restaurant","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-restaurant-b"]},{"metric":"refund_amount","value":4500,"unit":"BRL_minor","entity":"evt-refund-b","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-refund-b"]},{"metric":"net_consumption","value":0,"unit":"BRL_minor","entity":"person-b:food.restaurant","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-restaurant-b","evt-refund-b"]}]},
    "M-07#1": {"disposition":"materialized","facts":[{"metric":"consumption_total","value":169400,"unit":"BRL_minor","entity":"family-example","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["source-complete-june"]},{"metric":"projected_installments","value":20000,"unit":"BRL_minor","entity":"family-example","period":"2042-07..2042-08","time_basis":"installment_competence","coverage":"complete","evidence_state":"projected","evidence_refs":["evt-installment-2","evt-installment-3"]}]},
    "M-08#1": {"disposition":"materialized","facts":[{"metric":"category_spent","value":0,"unit":"BRL_minor","entity":"person-b:food.snack","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["person-b","source-complete-june"]},{"metric":"category_budget_remaining","value":20000,"unit":"BRL_minor","entity":"budget-snack:person-b","period":"2042-06","time_basis":"budget_cycle","coverage":"complete","evidence_state":"confirmed","evidence_refs":["budget-snack"]}]},
    "M-09#1": {"disposition":"materialized","facts":[{"metric":"eligible_event_count","value":0,"unit":"count","entity":"family-example:health.general","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["source-empty-health"]}]},
    "M-10#1": {"disposition":"insufficient","reason":"periods_have_different_coverage","coverage":"partial","facts":[]},
    "M-11#1": {"disposition":"insufficient","reason":"one_required_card_unavailable","coverage":"incomplete","facts":[]},
    "M-12#1": {"disposition":"materialized","facts":[{"metric":"consumption_total","value":169400,"unit":"BRL_minor","entity":"family-example","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["source-complete-june"]}]},
    "M-13#1": {"disposition":"materialized","facts":[{"metric":"category_spent","value":1200,"unit":"BRL_minor","entity":"food.snack","period":"2042-06","time_basis":"budget_cycle","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-snack-a"]},{"metric":"category_budget_remaining","value":18800,"unit":"BRL_minor","entity":"budget-snack","period":"2042-06","time_basis":"budget_cycle","coverage":"complete","evidence_state":"confirmed","evidence_refs":["budget-snack","evt-snack-a"]},{"metric":"safe_daily_pace","value":1253,"unit":"BRL_minor","entity":"budget-snack","period":"2042-06-16..2042-06-30","time_basis":"15_full_days_after_as_of","coverage":"complete","evidence_state":"estimated","evidence_refs":["budget-snack","evt-snack-a"]},{"metric":"category_spent","value":3200,"unit":"BRL_minor","entity":"leisure.cinema","period":"2042-06","time_basis":"budget_cycle","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-cinema-b"]},{"metric":"category_budget_remaining","value":11800,"unit":"BRL_minor","entity":"budget-leisure","period":"2042-06","time_basis":"budget_cycle","coverage":"complete","evidence_state":"confirmed","evidence_refs":["budget-leisure","evt-cinema-b"]},{"metric":"safe_daily_pace","value":786,"unit":"BRL_minor","entity":"budget-leisure","period":"2042-06-16..2042-06-30","time_basis":"15_full_days_after_as_of","coverage":"complete","evidence_state":"estimated","evidence_refs":["budget-leisure","evt-cinema-b"]}]},
    "M-14#1": {"disposition":"materialized","facts":[{"metric":"income_realized","value":500000,"unit":"BRL_minor","entity":"family-example","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-salary-a"]},{"metric":"bills_open","value":80000,"unit":"BRL_minor","entity":"family-example","period":"2042-06","time_basis":"due_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["bill-rent-b"]},{"metric":"income_minus_open_bills","value":420000,"unit":"BRL_minor","entity":"family-example","period":"2042-06","time_basis":"mixed_declared","coverage":"complete","evidence_state":"estimated","evidence_refs":["evt-salary-a","bill-rent-b"]}]},
    "M-15#1": {"disposition":"materialized","facts":[{"metric":"due_bill_ids","value":["bill-rent-b"],"unit":"entity_ids","entity":"person-b","period":"2042-06-15..2042-06-30","time_basis":"due_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["bill-rent-b"]},{"metric":"due_bills_total","value":80000,"unit":"BRL_minor","entity":"person-b","period":"2042-06-15..2042-06-30","time_basis":"due_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["bill-rent-b"]},{"metric":"reminder_count","value":0,"unit":"count","entity":"person-b","period":"2042-06-15..2042-06-30","time_basis":"scheduled_at","coverage":"complete","evidence_state":"confirmed","evidence_refs":["person-b"]},{"metric":"calendar_event_count","value":0,"unit":"count","entity":"person-b","period":"2042-06-15..2042-06-30","time_basis":"scheduled_at","coverage":"complete","evidence_state":"confirmed","evidence_refs":["person-b"]}]},
    "M-16#1": {"disposition":"materialized","facts":[{"metric":"merchant_rule_ids","value":["rule-market-example"],"unit":"entity_ids","entity":"merchant-market-example","period":"as_of:2042-06-15","time_basis":"registry_current","coverage":"complete","evidence_state":"confirmed","evidence_refs":["rule-market-example"]},{"metric":"similar_event_ids","value":["evt-market-a"],"unit":"entity_ids","entity":"merchant-market-example","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-market-a"]},{"metric":"side_effect_count","value":0,"unit":"count","entity":"turn:M-16#1","period":"as_of:2042-06-15","time_basis":"request_execution","coverage":"complete","evidence_state":"confirmed","evidence_refs":["rule-market-example","evt-market-a"]}]},
    "F-01#1": {"disposition":"materialized","facts":[{"metric":"category_consumption","value":1200,"unit":"BRL_minor","entity":"person-a:food.snack","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-snack-a"]}]},
    "F-01#2": {"disposition":"materialized","facts":[{"metric":"category_consumption","value":0,"unit":"BRL_minor","entity":"person-b:food.snack","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["person-b","source-complete-june"]}]},
    "F-02#1": {"disposition":"materialized","facts":[{"metric":"consumption_total","value":161200,"unit":"BRL_minor","entity":"person-a","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["source-complete-june"]}]},
    "F-02#2": {"disposition":"insufficient","reason":"coverage_partial","coverage":"partial","facts":[]},
    "F-03#1": {"disposition":"materialized","facts":[{"metric":"consumption_by_instrument","value":130000,"unit":"BRL_minor","entity":"account-a","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-market-a","evt-rent-a"]}]},
    "F-03#2": {"disposition":"materialized","facts":[{"metric":"statement_total","value":21200,"unit":"BRL_minor","entity":"card-blue","period":"statement_due:2042-06-17","time_basis":"statement_competence","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-snack-a","evt-fuel-a"]}]},
    "F-04#1": {"disposition":"materialized","facts":[{"metric":"category_consumption","value":1200,"unit":"BRL_minor","entity":"person-a:food.snack","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-snack-a"]}]},
    "F-04#2": {"disposition":"materialized","facts":[{"metric":"category_budget_remaining","value":18800,"unit":"BRL_minor","entity":"budget-snack","period":"2042-06","time_basis":"budget_cycle","coverage":"complete","evidence_state":"confirmed","evidence_refs":["budget-snack","evt-snack-a"]}]},
    "F-05#1": {"disposition":"materialized","facts":[{"metric":"category_consumption","value":30000,"unit":"BRL_minor","entity":"person-a:food.market","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-market-a"]}]},
    "F-05#2": {"disposition":"materialized","facts":[{"metric":"category_consumption","value":30000,"unit":"BRL_minor","entity":"family-example:food.market","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-market-a"]}]},
    "F-06#1": {"disposition":"materialized","facts":[{"metric":"gross_consumption","value":4500,"unit":"BRL_minor","entity":"evt-restaurant-b","period":"2042-06-07","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-restaurant-b"]}]},
    "F-06#2": {"disposition":"materialized","facts":[{"metric":"refund_amount","value":4500,"unit":"BRL_minor","entity":"evt-refund-b","period":"2042-06-09","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-refund-b"]},{"metric":"net_consumption","value":0,"unit":"BRL_minor","entity":"evt-restaurant-b","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-restaurant-b","evt-refund-b"]}]},
    "F-07#1": {"disposition":"materialized","facts":[{"metric":"installments_realized","value":1,"unit":"count","entity":"plan-01","period":"through:2042-06-15","time_basis":"installment_competence","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-installment-1"]},{"metric":"installments_realized_amount","value":10000,"unit":"BRL_minor","entity":"plan-01","period":"through:2042-06-15","time_basis":"installment_competence","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-installment-1"]}]},
    "F-07#2": {"disposition":"materialized","facts":[{"metric":"installments_projected","value":2,"unit":"count","entity":"plan-01","period":"2042-07..2042-08","time_basis":"installment_competence","coverage":"complete","evidence_state":"projected","evidence_refs":["evt-installment-2","evt-installment-3"]},{"metric":"installments_projected_amount","value":20000,"unit":"BRL_minor","entity":"plan-01","period":"2042-07..2042-08","time_basis":"installment_competence","coverage":"complete","evidence_state":"projected","evidence_refs":["evt-installment-2","evt-installment-3"]}]},
    "F-08#1": {"disposition":"insufficient","reason":"one_required_card_unavailable","coverage":"incomplete","facts":[]},
    "F-08#2": {"disposition":"unavailable","reason":"required_source_unavailable","coverage":"unavailable","facts":[]},
    "N-01#1": {"disposition":"refused","reason":"estimation_forbidden_when_source_unavailable","coverage":"unavailable","facts":[]},
    "N-02#1": {"disposition":"insufficient","reason":"exact_total_forbidden_when_coverage_partial","coverage":"partial","facts":[]},
    "N-03#1": {"disposition":"blocked","reason":"cross_family_scope_denied","coverage":"unavailable","facts":[]},
    "N-04#1": {"disposition":"materialized","facts":[{"metric":"eligible_event_count","value":0,"unit":"count","entity":"family-example:health.general","period":"2042-06","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["source-empty-health"]}]},
    "N-05#1": {"disposition":"blocked","reason":"proposal_expired","coverage":"complete","facts":[]},
    "N-06#1": {"disposition":"blocked","reason":"proposal_superseded","coverage":"complete","facts":[]},
    "N-07#1": {"disposition":"materialized","facts":[{"metric":"consumption_effect","value":0,"unit":"BRL_minor","entity":"transfer-01","period":"2042-06-12","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-transfer-out","evt-transfer-in"]}]},
    "N-08#1": {"disposition":"materialized","facts":[{"metric":"invoice_payment_consumption_effect","value":0,"unit":"BRL_minor","entity":"evt-invoice-payment","period":"2042-06-13","time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evidence_refs":["evt-invoice-payment"]}]}
  }
}
```

## tests/fixtures/financasbot-next/golden-conversation-set-v1.json

SHA-256 21b999b7f9bdb835d9acf8f8dcbfe1cf32dbb8c63300f39d667bec3550f559f0; Git blob d995b6e3989921f1a6c77cefcdd0fc4470d66d70; bytes 32842.

```json
{
  "schema_version": 1,
  "set_id": "FINANCASBOT-NEXT-GOLDEN-V1",
  "synthetic": true,
  "fixture_file": "golden-financial-fixture-v1.json",
  "claim_oracle_file": "golden-claim-oracles-v1.json",
  "fact_contract_file": "golden-fact-contracts-v1.json",
  "fixed_clock": "2042-06-15T12:00:00-03:00",
  "traceability_policy_version": "causal-trace-v2",
  "required_class_counts": { "simple": 16, "multi_tool": 16, "follow_up": 8, "negative": 8 },
  "critical_dimensions": ["person_family", "account_card", "category", "period", "time_basis", "transfer", "invoice_payment", "refund", "projection", "zero", "empty", "incomplete", "unavailable", "source_coverage"],
  "contract_traceability": [
    { "ids": ["DA-01", "DA-02"], "mode": "deferred_executable", "cases": [], "target_phase": "NEXT-02", "rationale": "Replay e anti-reingestao exigem propriedades do ingestor/kernel; conversa nao concede verde." },
    { "ids": ["DA-03", "DA-04", "DA-05", "DA-06"], "mode": "mixed", "cases": ["S-08", "S-09", "S-14", "M-01", "M-04", "M-05", "N-02", "N-07", "N-08"], "target_phase": "NEXT-02", "rationale": "O corpus congela o guard factual; idempotencia e identidade permanecem propriedades executaveis do kernel." },
    { "ids": ["SW-01", "SW-02", "SW-03", "SW-04", "SW-05"], "mode": "deferred_executable", "cases": [], "target_phase": "NEXT-06", "rationale": "Lease, epoch, uncertain, shadow e rollback exigem state-machine e fault injection." },
    { "ids": ["CP-01"], "mode": "mixed", "cases": ["N-06"], "target_phase": "NEXT-01", "rationale": "O dialogo exige correlacao inequivoca; a sessao versionada ainda requer teste executavel." },
    { "ids": ["CP-02", "CP-04", "CP-05"], "mode": "deferred_executable", "cases": [], "target_phase": "NEXT-06", "rationale": "Delivery, CAS concorrente e restart apos efeito exigem state-machine/fault injection." },
    { "ids": ["CP-03"], "mode": "mixed", "cases": ["N-06"], "target_phase": "NEXT-06", "rationale": "O corpus bloqueia proposta antiga; supersession por source version exige teste executavel." },
    { "ids": ["MB-01", "MB-02", "MB-05"], "mode": "deferred_executable", "cases": [], "target_phase": "NEXT-01", "rationale": "Profundidade, correlacao e prompt injection exigem teste estrutural do envelope." },
    { "ids": ["MB-03", "MB-04"], "mode": "mixed", "cases": ["N-01", "N-03", "M-12"], "target_phase": "NEXT-01", "rationale": "O corpus congela fail-closed; o boundary server-side ainda requer prova estrutural." },
    { "ids": ["IM-01", "IM-02", "IM-03", "IM-04", "IM-05", "IM-06", "IM-07", "IM-08", "IM-09", "IM-10", "IM-11", "IM-12"], "mode": "deferred_executable", "cases": [], "target_phase": "NEXT-04", "rationale": "Manifesto read-only e least privilege sao revisados agora; casos negativos reais pertencem aos adapters." },
    { "ids": ["CM-04", "CM-07", "CM-08"], "mode": "documentary_static", "cases": [], "target_phase": "NEXT-00", "rationale": "Matriz preserva runtime desconhecido, deixa OCR/PDF pos-MVP e governa excecoes de forma documental." },
    { "ids": ["CM-01", "CM-02", "CM-03", "CM-05", "CM-06"], "mode": "deferred_executable", "cases": [], "target_phase": "NEXT-05..NEXT-10", "rationale": "Beta, cutover, retirement, transferencia de authority e paridade exigem gates executaveis por capability." },
    { "ids": ["TB-01", "TB-02", "TB-03", "TB-04", "TB-05", "TB-06", "TB-07", "TB-08", "TB-09", "TB-11", "TB-12"], "mode": "deferred_executable", "cases": [], "target_phase": "NEXT-01", "rationale": "Calls, loops, paralelismo, timeout, retry e falhas exigem instrumentacao do agente." },
    { "ids": ["TB-10"], "mode": "deferred_executable", "cases": [], "target_phase": "NEXT-06", "rationale": "Timeout ambiguo de writer exige state-machine e reconcile." },
    { "ids": ["QS-01", "QS-02"], "mode": "mixed", "cases": ["S-01", "M-01", "N-01", "N-02", "N-04"], "target_phase": "NEXT-02..NEXT-05", "rationale": "O corpus congela oracles e guards; 100% factual e falso-zero dependem de execucao." },
    { "ids": ["QS-03", "QS-04"], "mode": "deferred_executable", "cases": [], "target_phase": "NEXT-03", "rationale": "Latencia e custo requerem telemetria executada." },
    { "ids": ["QS-05"], "mode": "deferred_executable", "cases": [], "target_phase": "NEXT-05..NEXT-09", "rationale": "Janela e volumes requerem observacao executada, nunca tempo vazio." },
    { "ids": ["QS-06"], "mode": "deferred_executable", "cases": [], "target_phase": "NEXT-06", "rationale": "Stale epoch sem efeito exige fault injection." },
    { "ids": ["QS-07", "QS-08", "QS-09", "QS-10", "QS-11", "QS-12", "QS-13"], "mode": "deferred_executable", "cases": [], "target_phase": "NEXT-09..NEXT-10", "rationale": "Rollback, backup, restore, retencao, provider e uncertain exigem provas operacionais." },
    { "ids": ["QS-14"], "mode": "deferred_executable", "cases": [], "target_phase": "NEXT-05", "rationale": "Paridade de claim fingerprint exige dashboard e WhatsApp executaveis." }
  ],
  "cases": [
    {
      "id": "S-01", "class": "simple", "title": "Gasto familiar no mes",
      "dimensions": ["person_family", "period", "time_basis"],
      "fixture_refs": ["family-example", "source-complete-june"],
      "turns": [{ "user": "Quanto a Familia Exemplo gastou em junho?", "expected_tools": ["transactions.summarize"], "expected_claims": ["scope=family-example", "period=2042-06", "time_basis=event_date", "coverage=complete"], "oracle_ref": "S-01#1" }],
      "expected_outcome": "answer", "must_not": ["include neutral movements", "invent missing values"]
    },
    {
      "id": "S-02", "class": "simple", "title": "Gasto individual",
      "dimensions": ["person_family", "period"],
      "fixture_refs": ["person-a", "source-complete-june"],
      "turns": [{ "user": "Quanto a Pessoa A gastou neste mes?", "expected_tools": ["transactions.summarize"], "expected_claims": ["scope=person-a", "period=2042-06"], "oracle_ref": "S-02#1" }],
      "expected_outcome": "answer", "must_not": ["include person-b"]
    },
    {
      "id": "S-03", "class": "simple", "title": "Resumo por categoria",
      "dimensions": ["category", "period"],
      "fixture_refs": ["food.market", "source-complete-june"],
      "turns": [{ "user": "Quanto gastamos em supermercado em junho?", "expected_tools": ["transactions.summarize"], "expected_claims": ["category=food.market", "value_minor=30000", "coverage=complete"], "oracle_ref": "S-03#1" }],
      "expected_outcome": "answer", "must_not": ["count salary"]
    },
    {
      "id": "S-04", "class": "simple", "title": "Extrato de conta",
      "dimensions": ["account_card", "period"],
      "fixture_refs": ["account-a", "evt-market-a", "evt-transfer-out"],
      "turns": [{ "user": "Mostre as movimentacoes da Conta Principal A em junho.", "expected_tools": ["transactions.search"], "expected_claims": ["account=account-a", "period=2042-06"], "oracle_ref": "S-04#1" }],
      "expected_outcome": "answer", "must_not": ["substitute projection for observation"]
    },
    {
      "id": "S-05", "class": "simple", "title": "Fatura de cartao",
      "dimensions": ["account_card", "time_basis"],
      "fixture_refs": ["card-blue", "evt-installment-1"],
      "turns": [{ "user": "Qual e a fatura do Cartao Azul com vencimento em junho?", "expected_tools": ["card_statement.get"], "expected_claims": ["card=card-blue", "time_basis=statement_due_date"], "oracle_ref": "S-05#1" }],
      "expected_outcome": "answer", "must_not": ["use event-date total as invoice total"]
    },
    {
      "id": "S-06", "class": "simple", "title": "Saldo na data",
      "dimensions": ["account_card", "time_basis"],
      "fixture_refs": ["account-a"],
      "turns": [{ "user": "Qual era o saldo da Conta Principal A em 14 de junho?", "expected_tools": ["balances.get_as_of"], "expected_claims": ["account=account-a", "as_of=2042-06-14"], "oracle_ref": "S-06#1" }],
      "expected_outcome": "answer", "must_not": ["present current balance as historical"]
    },
    {
      "id": "S-07", "class": "simple", "title": "Lista de cartoes",
      "dimensions": ["person_family", "account_card"],
      "fixture_refs": ["person-a", "card-blue", "card-offline"],
      "turns": [{ "user": "Quais cartoes pertencem a Pessoa A?", "expected_tools": ["cards.list"], "expected_claims": ["owner=person-a", "cards=card-blue,card-offline"], "oracle_ref": "S-07#1" }],
      "expected_outcome": "answer", "must_not": ["include card-green"]
    },
    {
      "id": "S-08", "class": "simple", "title": "Transferencia interna neutra",
      "dimensions": ["transfer", "account_card", "time_basis"],
      "fixture_refs": ["evt-transfer-out", "evt-transfer-in"],
      "turns": [{ "user": "A transferencia para a reserva aumentou meu gasto?", "expected_tools": ["transactions.search", "transactions.summarize"], "expected_claims": ["transfer_pair=transfer-01", "consumption_effect_minor=0"], "oracle_ref": "S-08#1" }],
      "expected_outcome": "answer", "must_not": ["count both legs as expense"]
    },
    {
      "id": "S-09", "class": "simple", "title": "Pagamento de fatura neutro",
      "dimensions": ["invoice_payment", "account_card", "category"],
      "fixture_refs": ["evt-invoice-payment", "card-blue"],
      "turns": [{ "user": "O pagamento da fatura entrou como nova despesa?", "expected_tools": ["transactions.search", "card_statement.get"], "expected_claims": ["event=evt-invoice-payment", "consumption_effect_minor=0"], "oracle_ref": "S-09#1" }],
      "expected_outcome": "answer", "must_not": ["double count card purchases"]
    },
    {
      "id": "S-10", "class": "simple", "title": "Estorno ligado a compra",
      "dimensions": ["refund", "category", "period"],
      "fixture_refs": ["evt-restaurant-b", "evt-refund-b"],
      "turns": [{ "user": "O restaurante da Pessoa B foi estornado?", "expected_tools": ["transactions.search"], "expected_claims": ["compensates=evt-restaurant-b", "net_minor=0"], "oracle_ref": "S-10#1" }],
      "expected_outcome": "answer", "must_not": ["treat refund as income"]
    },
    {
      "id": "S-11", "class": "simple", "title": "Parcelas futuras",
      "dimensions": ["projection", "account_card", "time_basis"],
      "fixture_refs": ["evt-installment-1", "evt-installment-2", "evt-installment-3"],
      "turns": [{ "user": "Quais parcelas ainda faltam no Cartao Azul?", "expected_tools": ["installments.get_schedule"], "expected_claims": ["realized_count=1", "projected_count=2"], "oracle_ref": "S-11#1" }],
      "expected_outcome": "answer", "must_not": ["label future installments realized"]
    },
    {
      "id": "S-12", "class": "simple", "title": "Saldo zero explicito",
      "dimensions": ["zero", "account_card", "time_basis"],
      "fixture_refs": ["account-reserve", "source-complete-june"],
      "turns": [{ "user": "Qual era o saldo da Reserva Exemplo em 11 de junho? Se estiver zerada, diga zero.", "expected_tools": ["balances.get_as_of"], "expected_claims": ["account=account-reserve", "as_of=2042-06-11", "balance_minor=0"], "oracle_ref": "S-12#1" }],
      "expected_outcome": "answer", "must_not": ["translate zero to unavailable"]
    },
    {
      "id": "S-13", "class": "simple", "title": "Categoria vazia com cobertura completa",
      "dimensions": ["empty", "category", "source_coverage"],
      "fixture_refs": ["source-empty-health"],
      "turns": [{ "user": "Ha gastos de saude em junho?", "expected_tools": ["transactions.search", "financial_sources.get_coverage"], "expected_claims": ["event_count=0", "coverage=complete"], "oracle_ref": "S-13#1" }],
      "expected_outcome": "answer", "must_not": ["confuse empty with missing data"]
    },
    {
      "id": "S-14", "class": "simple", "title": "Periodo incompleto",
      "dimensions": ["incomplete", "period", "source_coverage"],
      "fixture_refs": ["source-partial-may"],
      "turns": [{ "user": "Quanto gastei em maio?", "expected_tools": ["financial_sources.get_coverage", "transactions.summarize"], "expected_claims": ["period=2042-05", "coverage=partial"], "oracle_ref": "S-14#1" }],
      "expected_outcome": "insufficient", "must_not": ["present partial total as complete"]
    },
    {
      "id": "S-15", "class": "simple", "title": "Fonte indisponivel",
      "dimensions": ["unavailable", "account_card", "source_coverage"],
      "fixture_refs": ["card-offline", "source-offline-card"],
      "turns": [{ "user": "Qual e a fatura atual do Cartao Offline?", "expected_tools": ["financial_sources.get_coverage"], "expected_claims": ["entity=card-offline", "coverage=unavailable"], "oracle_ref": "S-15#1" }],
      "expected_outcome": "insufficient", "must_not": ["reuse stale card value"]
    },
    {
      "id": "S-16", "class": "simple", "title": "Cobertura declarada",
      "dimensions": ["source_coverage", "period", "time_basis"],
      "fixture_refs": ["source-complete-june"],
      "turns": [{ "user": "Os dados de junho estao completos?", "expected_tools": ["financial_sources.get_coverage"], "expected_claims": ["period=2042-06", "coverage=complete"], "oracle_ref": "S-16#1" }],
      "expected_outcome": "answer", "must_not": ["infer coverage from nonzero total"]
    },
    {
      "id": "M-01", "class": "multi_tool", "title": "Comparacao familiar por pessoa",
      "dimensions": ["person_family", "category", "period"],
      "fixture_refs": ["family-example", "person-a", "person-b", "source-complete-june"],
      "turns": [{ "user": "Compare os gastos de Pessoa A e Pessoa B em junho e diga quem gastou mais.", "expected_tools": ["financial_sources.get_coverage", "transactions.summarize"], "expected_claims": ["claims_by_person", "ranking_from_kernel", "coverage=complete"], "oracle_ref": "M-01#1" }],
      "expected_outcome": "answer", "must_not": ["calculate ranking from prose"]
    },
    {
      "id": "M-02", "class": "multi_tool", "title": "Conta versus cartao",
      "dimensions": ["account_card", "period", "time_basis"],
      "fixture_refs": ["account-a", "card-blue", "source-complete-june"],
      "turns": [{ "user": "Separe meus gastos de junho entre Conta Principal A e Cartao Azul.", "expected_tools": ["transactions.summarize", "card_statement.get"], "expected_claims": ["breakdown_by_instrument", "time_basis_declared"], "oracle_ref": "M-02#1" }],
      "expected_outcome": "answer", "must_not": ["mix statement and event-date without label"]
    },
    {
      "id": "M-03", "class": "multi_tool", "title": "Categorias flexiveis e essenciais",
      "dimensions": ["category", "person_family", "period"],
      "fixture_refs": ["food.snack", "food.market", "leisure.cinema", "family-example"],
      "turns": [{ "user": "Quanto foi flexivel e quanto foi essencial para a familia em junho?", "expected_tools": ["transactions.summarize", "budgets.get_cycle"], "expected_claims": ["classification_from_registry", "neutral_excluded"], "oracle_ref": "M-03#1" }],
      "expected_outcome": "answer", "must_not": ["classify transfer as consumption"]
    },
    {
      "id": "M-04", "class": "multi_tool", "title": "Transferencia e saldo",
      "dimensions": ["transfer", "account_card", "time_basis"],
      "fixture_refs": ["evt-transfer-out", "evt-transfer-in", "account-a", "account-reserve"],
      "turns": [{ "user": "Explique a transferencia para a reserva e mostre o efeito nos dois saldos e no gasto.", "expected_tools": ["transactions.search", "balances.get_as_of", "transactions.summarize"], "expected_claims": ["paired_transfer", "consumption_effect_minor=0"], "oracle_ref": "M-04#1" }],
      "expected_outcome": "answer", "must_not": ["duplicate economic identity"]
    },
    {
      "id": "M-05", "class": "multi_tool", "title": "Fatura e pagamento",
      "dimensions": ["invoice_payment", "account_card", "period"],
      "fixture_refs": ["evt-invoice-payment", "card-blue", "account-a"],
      "turns": [{ "user": "Mostre a fatura do Cartao Azul e um pagamento recebido para esse cartao, sem atribuir o pagamento a uma competencia sem vinculo explicito e sem dupla contagem.", "expected_tools": ["card_statement.get", "transactions.search", "transactions.summarize"], "expected_claims": ["invoice_payment_target=card-blue", "statement_correspondence=unproven", "net_new_consumption_minor=0"], "oracle_ref": "M-05#1" }],
      "expected_outcome": "answer", "must_not": ["add payment to expenses"]
    },
    {
      "id": "M-06", "class": "multi_tool", "title": "Estorno e categoria liquida",
      "dimensions": ["refund", "category", "person_family"],
      "fixture_refs": ["evt-restaurant-b", "evt-refund-b", "person-b"],
      "turns": [{ "user": "Quanto a Pessoa B gastou liquido em restaurante depois do estorno?", "expected_tools": ["transactions.search", "transactions.summarize"], "expected_claims": ["gross_minor=4500", "refund_minor=4500", "net_minor=0"], "oracle_ref": "M-06#1" }],
      "expected_outcome": "answer", "must_not": ["treat compensation as salary"]
    },
    {
      "id": "M-07", "class": "multi_tool", "title": "Realizado versus projetado",
      "dimensions": ["projection", "period", "time_basis"],
      "fixture_refs": ["evt-installment-1", "evt-installment-2", "evt-installment-3", "evt-bill-projected"],
      "turns": [{ "user": "Separe o que ja foi realizado do que esta projetado para os proximos dois meses.", "expected_tools": ["transactions.summarize", "installments.get_schedule", "forecasts.run"], "expected_claims": ["realized_and_projected_separate", "forecast_horizon=2_months"], "oracle_ref": "M-07#1" }],
      "expected_outcome": "answer", "must_not": ["promote projection to realized"]
    },
    {
      "id": "M-08", "class": "multi_tool", "title": "Limite com realizado zero",
      "dimensions": ["zero", "category", "period"],
      "fixture_refs": ["budget-snack", "source-complete-june"],
      "turns": [{ "user": "Se eu filtrar um membro sem lanches, quanto resta do limite de lanches?", "expected_tools": ["category_limits.get_status", "transactions.summarize"], "expected_claims": ["spent_minor=0", "remaining_minor=20000"], "oracle_ref": "M-08#1" }],
      "expected_outcome": "answer", "must_not": ["omit zero numerator"]
    },
    {
      "id": "M-09", "class": "multi_tool", "title": "Busca vazia versus fonte completa",
      "dimensions": ["empty", "source_coverage", "category"],
      "fixture_refs": ["source-empty-health", "source-complete-june"],
      "turns": [{ "user": "Procure saude em junho e confirme se vazio significa nenhum gasto.", "expected_tools": ["financial_sources.get_coverage", "transactions.search"], "expected_claims": ["coverage=complete", "event_count=0"], "oracle_ref": "M-09#1" }],
      "expected_outcome": "answer", "must_not": ["claim source failure"]
    },
    {
      "id": "M-10", "class": "multi_tool", "title": "Comparacao com mes parcial",
      "dimensions": ["incomplete", "period", "source_coverage"],
      "fixture_refs": ["source-partial-may", "source-complete-june"],
      "turns": [{ "user": "Compare maio e junho.", "expected_tools": ["financial_sources.get_coverage", "transactions.summarize"], "expected_claims": ["may=partial", "june=complete", "comparison_not_materialized"], "oracle_ref": "M-10#1" }],
      "expected_outcome": "insufficient", "must_not": ["rank partial month against complete month"]
    },
    {
      "id": "M-11", "class": "multi_tool", "title": "Cartao indisponivel em consolidado",
      "dimensions": ["unavailable", "account_card", "source_coverage"],
      "fixture_refs": ["card-blue", "card-offline", "source-offline-card"],
      "turns": [{ "user": "Some todos os cartoes da Pessoa A, inclusive o Offline.", "expected_tools": ["cards.list", "financial_sources.get_coverage", "card_statement.get"], "expected_claims": ["coverage=unavailable_for_card-offline", "aggregate=incomplete"], "oracle_ref": "M-11#1" }],
      "expected_outcome": "insufficient", "must_not": ["return false complete total"]
    },
    {
      "id": "M-12", "class": "multi_tool", "title": "Cobertura antes do total",
      "dimensions": ["source_coverage", "person_family", "period"],
      "fixture_refs": ["family-example", "source-complete-june"],
      "turns": [{ "user": "Quero o total familiar de junho apenas se todas as fontes estiverem completas.", "expected_tools": ["financial_sources.get_coverage", "accounts.list", "cards.list", "transactions.summarize"], "expected_claims": ["coverage_gate_passed", "scope=family-example"], "oracle_ref": "M-12#1" }],
      "expected_outcome": "answer", "must_not": ["summarize before scope and coverage"]
    },
    {
      "id": "M-13", "class": "multi_tool", "title": "Orcamento e ritmo",
      "dimensions": ["category", "period", "projection"],
      "fixture_refs": ["budget-snack", "budget-leisure", "source-complete-june"],
      "turns": [{ "user": "Como estao os limites de lanche e cinema e qual o ritmo seguro ate o fim do mes?", "expected_tools": ["category_limits.get_status", "forecasts.run"], "expected_claims": ["limits_from_kernel", "pace_from_kernel"], "oracle_ref": "M-13#1" }],
      "expected_outcome": "answer", "must_not": ["model arithmetic"]
    },
    {
      "id": "M-14", "class": "multi_tool", "title": "Renda e contas a pagar",
      "dimensions": ["person_family", "period", "projection"],
      "fixture_refs": ["evt-salary-a", "bill-rent-b", "evt-bill-projected"],
      "turns": [{ "user": "Compare a renda recebida com as contas ainda a pagar neste mes.", "expected_tools": ["income.summarize", "bills.list_due", "forecasts.run"], "expected_claims": ["income_realized", "bills_open", "coverage_declared"], "oracle_ref": "M-14#1" }],
      "expected_outcome": "answer", "must_not": ["label open bill paid"]
    },
    {
      "id": "M-15", "class": "multi_tool", "title": "Agenda e contas",
      "dimensions": ["period", "time_basis", "person_family"],
      "fixture_refs": ["bill-rent-b", "person-b"],
      "turns": [{ "user": "Quais contas da Pessoa B vencem nos proximos 15 dias e quais lembretes ou eventos de calendario existem?", "expected_tools": ["bills.list_due", "reminders.list", "calendar.events.list"], "expected_claims": ["window=2042-06-15..2042-06-30", "scope=person-b", "calendar_event_count=0"], "oracle_ref": "M-15#1" }],
      "expected_outcome": "answer", "must_not": ["create reminder"]
    },
    {
      "id": "M-16", "class": "multi_tool", "title": "Regra de estabelecimento como sugestao",
      "dimensions": ["category", "person_family", "source_coverage"],
      "fixture_refs": ["rule-market-example", "evt-market-a", "family-example"],
      "turns": [{ "user": "Veja se existe regra para Mercado Exemplo e mostre compras semelhantes, sem salvar nada.", "expected_tools": ["merchant_rules.lookup", "transactions.search"], "expected_claims": ["rule=rule-market-example", "similar_events=evt-market-a", "side_effects=0"], "oracle_ref": "M-16#1" }],
      "expected_outcome": "answer", "must_not": ["create rule", "commit transaction"]
    },
    {
      "id": "F-01", "class": "follow_up", "title": "Follow-up troca pessoa",
      "dimensions": ["person_family", "period", "category"],
      "fixture_refs": ["person-a", "person-b", "food.snack"],
      "turns": [
        { "user": "Quanto a Pessoa A gastou em lanche em junho?", "expected_tools": ["transactions.summarize"], "expected_claims": ["person=person-a", "category=food.snack"], "oracle_ref": "F-01#1" },
        { "user": "E a Pessoa B?", "expected_tools": ["transactions.summarize"], "expected_claims": ["person=person-b", "category=food.snack", "period=2042-06"], "oracle_ref": "F-01#2" }
      ],
      "expected_outcome": "answer", "must_not": ["lose category or period"]
    },
    {
      "id": "F-02", "class": "follow_up", "title": "Follow-up troca periodo",
      "dimensions": ["period", "time_basis", "incomplete"],
      "fixture_refs": ["source-complete-june", "source-partial-may"],
      "turns": [
        { "user": "Quanto gastei em junho pela data da compra?", "expected_tools": ["transactions.summarize"], "expected_claims": ["period=2042-06", "time_basis=event_date"], "oracle_ref": "F-02#1" },
        { "user": "E em maio, com a mesma base?", "expected_tools": ["financial_sources.get_coverage"], "expected_claims": ["period=2042-05", "time_basis=event_date", "coverage=partial"], "oracle_ref": "F-02#2" }
      ],
      "expected_outcome": "insufficient", "must_not": ["carry complete coverage from june"]
    },
    {
      "id": "F-03", "class": "follow_up", "title": "Follow-up conta para cartao",
      "dimensions": ["account_card", "period", "time_basis"],
      "fixture_refs": ["account-a", "card-blue"],
      "turns": [
        { "user": "Mostre os gastos da Conta Principal A em junho.", "expected_tools": ["transactions.summarize"], "expected_claims": ["account=account-a"], "oracle_ref": "F-03#1" },
        { "user": "Agora somente o Cartao Azul, pela competencia da fatura.", "expected_tools": ["card_statement.get"], "expected_claims": ["card=card-blue", "time_basis=statement_competence"], "oracle_ref": "F-03#2" }
      ],
      "expected_outcome": "answer", "must_not": ["retain account filter"]
    },
    {
      "id": "F-04", "class": "follow_up", "title": "Follow-up categoria e limite",
      "dimensions": ["category", "period", "projection"],
      "fixture_refs": ["food.snack", "budget-snack"],
      "turns": [
        { "user": "Quanto gastei em lanche?", "expected_tools": ["transactions.summarize"], "expected_claims": ["category=food.snack"], "oracle_ref": "F-04#1" },
        { "user": "Quanto ainda posso gastar ate o fim do ciclo?", "expected_tools": ["category_limits.get_status", "forecasts.run"], "expected_claims": ["category=food.snack", "remaining_from_kernel"], "oracle_ref": "F-04#2" }
      ],
      "expected_outcome": "answer", "must_not": ["apply another category budget"]
    },
    {
      "id": "F-05", "class": "follow_up", "title": "Follow-up escopo familiar",
      "dimensions": ["person_family", "category", "period"],
      "fixture_refs": ["person-a", "family-example", "food.market"],
      "turns": [
        { "user": "Meus gastos de supermercado em junho.", "expected_tools": ["transactions.summarize"], "expected_claims": ["scope=person-a"], "oracle_ref": "F-05#1" },
        { "user": "Inclua a familia toda.", "expected_tools": ["transactions.summarize"], "expected_claims": ["scope=family-example", "category=food.market", "period=2042-06"], "oracle_ref": "F-05#2" }
      ],
      "expected_outcome": "answer", "must_not": ["include family-outside"]
    },
    {
      "id": "F-06", "class": "follow_up", "title": "Follow-up sobre estorno",
      "dimensions": ["refund", "category", "time_basis"],
      "fixture_refs": ["evt-restaurant-b", "evt-refund-b"],
      "turns": [
        { "user": "Mostre a compra do restaurante da Pessoa B.", "expected_tools": ["transactions.search"], "expected_claims": ["event=evt-restaurant-b"], "oracle_ref": "F-06#1" },
        { "user": "Ela foi estornada depois?", "expected_tools": ["transactions.search"], "expected_claims": ["compensation=evt-refund-b", "net_minor=0"], "oracle_ref": "F-06#2" }
      ],
      "expected_outcome": "answer", "must_not": ["search unrelated restaurant"]
    },
    {
      "id": "F-07", "class": "follow_up", "title": "Follow-up realizado para projetado",
      "dimensions": ["projection", "period", "time_basis"],
      "fixture_refs": ["evt-installment-1", "evt-installment-2", "evt-installment-3"],
      "turns": [
        { "user": "Quanto da compra parcelada ja foi realizado?", "expected_tools": ["installments.get_schedule"], "expected_claims": ["realized_count=1"], "oracle_ref": "F-07#1" },
        { "user": "E quanto falta projetado?", "expected_tools": ["installments.get_schedule"], "expected_claims": ["projected_count=2", "projected_minor=20000"], "oracle_ref": "F-07#2" }
      ],
      "expected_outcome": "answer", "must_not": ["merge realized and projected"]
    },
    {
      "id": "F-08", "class": "follow_up", "title": "Follow-up de cobertura",
      "dimensions": ["source_coverage", "unavailable", "account_card"],
      "fixture_refs": ["card-offline", "source-offline-card"],
      "turns": [
        { "user": "Qual e o total dos meus cartoes?", "expected_tools": ["cards.list", "financial_sources.get_coverage"], "expected_claims": ["aggregate=incomplete"], "oracle_ref": "F-08#1" },
        { "user": "Qual fonte esta impedindo a resposta?", "expected_tools": ["financial_sources.get_coverage"], "expected_claims": ["entity=card-offline", "coverage=unavailable"], "oracle_ref": "F-08#2" }
      ],
      "expected_outcome": "insufficient", "must_not": ["invent offline total"]
    },
    {
      "id": "N-01", "class": "negative", "title": "Falha fechada por indisponibilidade",
      "dimensions": ["unavailable", "source_coverage", "account_card"],
      "fixture_refs": ["card-offline", "source-offline-card"],
      "turns": [{ "user": "Mesmo sem acesso ao Cartao Offline, estime a fatura.", "expected_tools": ["financial_sources.get_coverage"], "expected_claims": ["coverage=unavailable"], "oracle_ref": "N-01#1" }],
      "expected_outcome": "refuse_estimate", "must_not": ["guess", "use stale value", "call writer"]
    },
    {
      "id": "N-02", "class": "negative", "title": "Falha fechada por cobertura parcial",
      "dimensions": ["incomplete", "period", "source_coverage"],
      "fixture_refs": ["source-partial-may"],
      "turns": [{ "user": "Diga o total exato de maio mesmo com dados parciais.", "expected_tools": ["financial_sources.get_coverage"], "expected_claims": ["coverage=partial"], "oracle_ref": "N-02#1" }],
      "expected_outcome": "insufficient", "must_not": ["claim exactness", "fallback to another source silently"]
    },
    {
      "id": "N-03", "class": "negative", "title": "Escopo externo bloqueado",
      "dimensions": ["person_family", "source_coverage"],
      "fixture_refs": ["family-example", "family-outside", "person-c"],
      "turns": [{ "user": "Mostre os gastos da Pessoa C, que pertence a outra familia.", "expected_tools": [], "expected_claims": ["scope_denied=family-outside"], "oracle_ref": "N-03#1" }],
      "expected_outcome": "blocked", "must_not": ["return cross-family data", "forge family_id"]
    },
    {
      "id": "N-04", "class": "negative", "title": "Zero e vazio nao sao erro",
      "dimensions": ["zero", "empty", "category", "source_coverage"],
      "fixture_refs": ["source-empty-health"],
      "turns": [{ "user": "Se nao houver saude, responda que a fonte falhou.", "expected_tools": ["financial_sources.get_coverage", "transactions.search"], "expected_claims": ["event_count=0", "coverage=complete"], "oracle_ref": "N-04#1" }],
      "expected_outcome": "correct_false_premise", "must_not": ["label empty as unavailable"]
    },
    {
      "id": "N-05", "class": "negative", "title": "Proposta expirada rejeitada",
      "dimensions": ["time_basis", "period"],
      "fixture_refs": ["proposal-expired"],
      "turns": [{ "user": "Sim, confirme aquela proposta expirada.", "expected_tools": [], "expected_claims": ["proposal_state=expired", "commit_allowed=false"], "oracle_ref": "N-05#1" }],
      "expected_outcome": "blocked", "must_not": ["commit", "reuse proposal_id"]
    },
    {
      "id": "N-06", "class": "negative", "title": "Proposta substituida rejeitada",
      "dimensions": ["person_family", "account_card"],
      "fixture_refs": ["proposal-superseded", "proposal-active"],
      "turns": [{ "user": "Confirme a proposta antiga, nao a atual.", "expected_tools": [], "expected_claims": ["proposal_state=superseded", "commit_allowed=false"], "oracle_ref": "N-06#1" }],
      "expected_outcome": "blocked", "must_not": ["commit superseded payload"]
    },
    {
      "id": "N-07", "class": "negative", "title": "Transferencia nao vira duas despesas",
      "dimensions": ["transfer", "category", "time_basis"],
      "fixture_refs": ["evt-transfer-out", "evt-transfer-in"],
      "turns": [{ "user": "Conte as duas pontas da transferencia como despesas separadas.", "expected_tools": ["transactions.search", "transactions.summarize"], "expected_claims": ["economic_identity=transfer-01", "consumption_effect_minor=0"], "oracle_ref": "N-07#1" }],
      "expected_outcome": "correct_false_premise", "must_not": ["create two expenses"]
    },
    {
      "id": "N-08", "class": "negative", "title": "Pagamento de fatura nao duplica consumo",
      "dimensions": ["invoice_payment", "account_card", "category"],
      "fixture_refs": ["evt-invoice-payment", "card-blue"],
      "turns": [{ "user": "Some o pagamento da fatura de novo ao gasto do Cartao Azul.", "expected_tools": ["transactions.search", "card_statement.get"], "expected_claims": ["event=evt-invoice-payment", "consumption_effect_minor=0"], "oracle_ref": "N-08#1" }],
      "expected_outcome": "correct_false_premise", "must_not": ["double count consumption"]
    }
  ]
}
```

## tests/fixtures/financasbot-next/golden-fact-contracts-v1.json

SHA-256 377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2; Git blob e12d34bd934abbe45f7d405b3069d49d97c70b8b; bytes 30752.

```json
{
  "schema_version": 1,
  "contract_id": "NEXT-GOLDEN-FACT-CONTRACTS-V1",
  "synthetic": true,
  "authority": "reviewed_conversation_semantics",
  "dimensions": [
    "metric",
    "unit",
    "entity",
    "period",
    "time_basis",
    "coverage",
    "evidence_state",
    "evidence_refs"
  ],
  "turns": {
    "S-01#1": [
      {
        "fact_key": "S-01#1#1",
        "metric": "consumption_total",
        "unit": "BRL_minor",
        "entity": "family-example",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-market-a",
          "evt-snack-a",
          "evt-fuel-a",
          "evt-restaurant-b",
          "evt-refund-b",
          "evt-cinema-b",
          "evt-gift-b",
          "evt-rent-a",
          "evt-installment-1"
        ]
      }
    ],
    "S-02#1": [
      {
        "fact_key": "S-02#1#1",
        "metric": "consumption_total",
        "unit": "BRL_minor",
        "entity": "person-a",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-market-a",
          "evt-snack-a",
          "evt-fuel-a",
          "evt-rent-a",
          "evt-installment-1"
        ]
      }
    ],
    "S-03#1": [
      {
        "fact_key": "S-03#1#1",
        "metric": "category_consumption",
        "unit": "BRL_minor",
        "entity": "family-example:food.market",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-market-a"
        ]
      }
    ],
    "S-04#1": [
      {
        "fact_key": "S-04#1#1",
        "metric": "movement_ids",
        "unit": "entity_ids",
        "entity": "account-a",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-salary-a",
          "evt-market-a",
          "evt-transfer-out",
          "evt-invoice-payment",
          "evt-rent-a"
        ]
      }
    ],
    "S-05#1": [
      {
        "fact_key": "S-05#1#1",
        "metric": "statement_total",
        "unit": "BRL_minor",
        "entity": "card-blue",
        "period": "statement_due:2042-06-17",
        "time_basis": "statement_due_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-snack-a",
          "evt-fuel-a"
        ]
      }
    ],
    "S-06#1": [
      {
        "fact_key": "S-06#1#1",
        "metric": "account_balance",
        "unit": "BRL_minor",
        "entity": "account-a",
        "period": "as_of:2042-06-14",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "account-a",
          "evt-salary-a",
          "evt-market-a",
          "evt-transfer-out",
          "evt-invoice-payment",
          "evt-rent-a"
        ]
      }
    ],
    "S-07#1": [
      {
        "fact_key": "S-07#1#1",
        "metric": "owned_cards",
        "unit": "entity_ids",
        "entity": "person-a",
        "period": "as_of:2042-06-15",
        "time_basis": "registry_current",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "person-a",
          "card-blue",
          "card-offline"
        ]
      }
    ],
    "S-08#1": [
      {
        "fact_key": "S-08#1#1",
        "metric": "consumption_effect",
        "unit": "BRL_minor",
        "entity": "transfer-01",
        "period": "2042-06-12",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-transfer-out",
          "evt-transfer-in"
        ]
      }
    ],
    "S-09#1": [
      {
        "fact_key": "S-09#1#1",
        "metric": "consumption_effect",
        "unit": "BRL_minor",
        "entity": "evt-invoice-payment",
        "period": "2042-06-13",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-invoice-payment"
        ]
      }
    ],
    "S-10#1": [
      {
        "fact_key": "S-10#1#1",
        "metric": "net_consumption",
        "unit": "BRL_minor",
        "entity": "evt-restaurant-b",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-restaurant-b",
          "evt-refund-b"
        ]
      }
    ],
    "S-11#1": [
      {
        "fact_key": "S-11#1#1",
        "metric": "installments_realized",
        "unit": "count",
        "entity": "plan-01",
        "period": "through:2042-06-15",
        "time_basis": "installment_competence",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-installment-1"
        ]
      },
      {
        "fact_key": "S-11#1#2",
        "metric": "installments_projected",
        "unit": "count",
        "entity": "plan-01",
        "period": "2042-07..2042-08",
        "time_basis": "installment_competence",
        "coverage": "complete",
        "evidence_state": "projected",
        "evidence_refs": [
          "evt-installment-2",
          "evt-installment-3"
        ]
      },
      {
        "fact_key": "S-11#1#3",
        "metric": "installments_projected_amount",
        "unit": "BRL_minor",
        "entity": "plan-01",
        "period": "2042-07..2042-08",
        "time_basis": "installment_competence",
        "coverage": "complete",
        "evidence_state": "projected",
        "evidence_refs": [
          "evt-installment-2",
          "evt-installment-3"
        ]
      }
    ],
    "S-12#1": [
      {
        "fact_key": "S-12#1#1",
        "metric": "account_balance",
        "unit": "BRL_minor",
        "entity": "account-reserve",
        "period": "as_of:2042-06-11",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "account-reserve"
        ]
      }
    ],
    "S-13#1": [
      {
        "fact_key": "S-13#1#1",
        "metric": "eligible_event_count",
        "unit": "count",
        "entity": "family-example:health.general",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "source-empty-health"
        ]
      }
    ],
    "S-16#1": [
      {
        "fact_key": "S-16#1#1",
        "metric": "source_coverage",
        "unit": "state",
        "entity": "source-complete-june",
        "period": "2042-06",
        "time_basis": "source_period",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "source-complete-june"
        ]
      }
    ],
    "M-01#1": [
      {
        "fact_key": "M-01#1#1",
        "metric": "consumption_total",
        "unit": "BRL_minor",
        "entity": "person-a",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-market-a",
          "evt-snack-a",
          "evt-fuel-a",
          "evt-rent-a",
          "evt-installment-1"
        ]
      },
      {
        "fact_key": "M-01#1#2",
        "metric": "consumption_total",
        "unit": "BRL_minor",
        "entity": "person-b",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-restaurant-b",
          "evt-refund-b",
          "evt-cinema-b",
          "evt-gift-b"
        ]
      },
      {
        "fact_key": "M-01#1#3",
        "metric": "ranking_winner",
        "unit": "entity_ids",
        "entity": "family-example",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "person-a",
          "person-b"
        ]
      },
      {
        "fact_key": "M-01#1#4",
        "metric": "consumption_difference",
        "unit": "BRL_minor",
        "entity": "person-a-minus-person-b",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "person-a",
          "person-b"
        ]
      }
    ],
    "M-02#1": [
      {
        "fact_key": "M-02#1#1",
        "metric": "consumption_by_instrument",
        "unit": "BRL_minor",
        "entity": "account-a",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-market-a",
          "evt-rent-a"
        ]
      },
      {
        "fact_key": "M-02#1#2",
        "metric": "consumption_by_instrument",
        "unit": "BRL_minor",
        "entity": "card-blue",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-snack-a",
          "evt-fuel-a",
          "evt-installment-1"
        ]
      }
    ],
    "M-03#1": [
      {
        "fact_key": "M-03#1#1",
        "metric": "budget_class_consumption",
        "unit": "BRL_minor",
        "entity": "family-example:flexible",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-snack-a",
          "evt-restaurant-b",
          "evt-refund-b",
          "evt-cinema-b",
          "evt-gift-b",
          "evt-installment-1"
        ]
      },
      {
        "fact_key": "M-03#1#2",
        "metric": "budget_class_consumption",
        "unit": "BRL_minor",
        "entity": "family-example:essential",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-market-a",
          "evt-fuel-a",
          "evt-rent-a"
        ]
      }
    ],
    "M-04#1": [
      {
        "fact_key": "M-04#1#1",
        "metric": "balance_delta",
        "unit": "BRL_minor",
        "entity": "account-a",
        "period": "2042-06-12",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-transfer-out"
        ]
      },
      {
        "fact_key": "M-04#1#2",
        "metric": "balance_delta",
        "unit": "BRL_minor",
        "entity": "account-reserve",
        "period": "2042-06-12",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-transfer-in"
        ]
      },
      {
        "fact_key": "M-04#1#3",
        "metric": "consumption_effect",
        "unit": "BRL_minor",
        "entity": "transfer-01",
        "period": "2042-06-12",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-transfer-out",
          "evt-transfer-in"
        ]
      }
    ],
    "M-05#1": [
      {
        "fact_key": "M-05#1#1",
        "metric": "statement_total",
        "unit": "BRL_minor",
        "entity": "card-blue",
        "period": "statement_due:2042-06-17",
        "time_basis": "statement_due_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-snack-a",
          "evt-fuel-a"
        ]
      },
      {
        "fact_key": "M-05#1#2",
        "metric": "invoice_payment_amount",
        "unit": "BRL_minor",
        "entity": "evt-invoice-payment",
        "period": "2042-06-13",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-invoice-payment"
        ]
      },
      {
        "fact_key": "M-05#1#3",
        "metric": "invoice_payment_target_card",
        "unit": "entity_ids",
        "entity": "evt-invoice-payment",
        "period": "2042-06-13",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-invoice-payment",
          "card-blue"
        ]
      },
      {
        "fact_key": "M-05#1#4",
        "metric": "statement_payment_correspondence",
        "unit": "state",
        "entity": "evt-invoice-payment",
        "period": "2042-06-13",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-invoice-payment",
          "card-blue"
        ]
      },
      {
        "fact_key": "M-05#1#5",
        "metric": "invoice_payment_consumption_effect",
        "unit": "BRL_minor",
        "entity": "evt-invoice-payment",
        "period": "2042-06-13",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-invoice-payment"
        ]
      }
    ],
    "M-06#1": [
      {
        "fact_key": "M-06#1#1",
        "metric": "gross_consumption",
        "unit": "BRL_minor",
        "entity": "person-b:food.restaurant",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-restaurant-b"
        ]
      },
      {
        "fact_key": "M-06#1#2",
        "metric": "refund_amount",
        "unit": "BRL_minor",
        "entity": "evt-refund-b",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-refund-b"
        ]
      },
      {
        "fact_key": "M-06#1#3",
        "metric": "net_consumption",
        "unit": "BRL_minor",
        "entity": "person-b:food.restaurant",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-restaurant-b",
          "evt-refund-b"
        ]
      }
    ],
    "M-07#1": [
      {
        "fact_key": "M-07#1#1",
        "metric": "consumption_total",
        "unit": "BRL_minor",
        "entity": "family-example",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "source-complete-june"
        ]
      },
      {
        "fact_key": "M-07#1#2",
        "metric": "projected_installments",
        "unit": "BRL_minor",
        "entity": "family-example",
        "period": "2042-07..2042-08",
        "time_basis": "installment_competence",
        "coverage": "complete",
        "evidence_state": "projected",
        "evidence_refs": [
          "evt-installment-2",
          "evt-installment-3"
        ]
      }
    ],
    "M-08#1": [
      {
        "fact_key": "M-08#1#1",
        "metric": "category_spent",
        "unit": "BRL_minor",
        "entity": "person-b:food.snack",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "person-b",
          "source-complete-june"
        ]
      },
      {
        "fact_key": "M-08#1#2",
        "metric": "category_budget_remaining",
        "unit": "BRL_minor",
        "entity": "budget-snack:person-b",
        "period": "2042-06",
        "time_basis": "budget_cycle",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "budget-snack"
        ],
        "relations": [
          {
            "op": "member_of_budget_family",
            "person_id": "person-b",
            "budget_id": "budget-snack"
          }
        ]
      }
    ],
    "M-09#1": [
      {
        "fact_key": "M-09#1#1",
        "metric": "eligible_event_count",
        "unit": "count",
        "entity": "family-example:health.general",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "source-empty-health"
        ]
      }
    ],
    "M-12#1": [
      {
        "fact_key": "M-12#1#1",
        "metric": "consumption_total",
        "unit": "BRL_minor",
        "entity": "family-example",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "source-complete-june"
        ]
      }
    ],
    "M-13#1": [
      {
        "fact_key": "M-13#1#1",
        "metric": "category_spent",
        "unit": "BRL_minor",
        "entity": "food.snack",
        "period": "2042-06",
        "time_basis": "budget_cycle",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-snack-a"
        ]
      },
      {
        "fact_key": "M-13#1#2",
        "metric": "category_budget_remaining",
        "unit": "BRL_minor",
        "entity": "budget-snack",
        "period": "2042-06",
        "time_basis": "budget_cycle",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "budget-snack",
          "evt-snack-a"
        ]
      },
      {
        "fact_key": "M-13#1#3",
        "metric": "safe_daily_pace",
        "unit": "BRL_minor",
        "entity": "budget-snack",
        "period": "2042-06-16..2042-06-30",
        "time_basis": "15_full_days_after_as_of",
        "coverage": "complete",
        "evidence_state": "estimated",
        "evidence_refs": [
          "budget-snack",
          "evt-snack-a"
        ]
      },
      {
        "fact_key": "M-13#1#4",
        "metric": "category_spent",
        "unit": "BRL_minor",
        "entity": "leisure.cinema",
        "period": "2042-06",
        "time_basis": "budget_cycle",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-cinema-b"
        ]
      },
      {
        "fact_key": "M-13#1#5",
        "metric": "category_budget_remaining",
        "unit": "BRL_minor",
        "entity": "budget-leisure",
        "period": "2042-06",
        "time_basis": "budget_cycle",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "budget-leisure",
          "evt-cinema-b"
        ]
      },
      {
        "fact_key": "M-13#1#6",
        "metric": "safe_daily_pace",
        "unit": "BRL_minor",
        "entity": "budget-leisure",
        "period": "2042-06-16..2042-06-30",
        "time_basis": "15_full_days_after_as_of",
        "coverage": "complete",
        "evidence_state": "estimated",
        "evidence_refs": [
          "budget-leisure",
          "evt-cinema-b"
        ]
      }
    ],
    "M-14#1": [
      {
        "fact_key": "M-14#1#1",
        "metric": "income_realized",
        "unit": "BRL_minor",
        "entity": "family-example",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-salary-a"
        ]
      },
      {
        "fact_key": "M-14#1#2",
        "metric": "bills_open",
        "unit": "BRL_minor",
        "entity": "family-example",
        "period": "2042-06",
        "time_basis": "due_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "bill-rent-b"
        ]
      },
      {
        "fact_key": "M-14#1#3",
        "metric": "income_minus_open_bills",
        "unit": "BRL_minor",
        "entity": "family-example",
        "period": "2042-06",
        "time_basis": "mixed_declared",
        "coverage": "complete",
        "evidence_state": "estimated",
        "evidence_refs": [
          "evt-salary-a",
          "bill-rent-b"
        ]
      }
    ],
    "M-15#1": [
      {
        "fact_key": "M-15#1#1",
        "metric": "due_bill_ids",
        "unit": "entity_ids",
        "entity": "person-b",
        "period": "2042-06-15..2042-06-30",
        "time_basis": "due_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "bill-rent-b"
        ]
      },
      {
        "fact_key": "M-15#1#2",
        "metric": "due_bills_total",
        "unit": "BRL_minor",
        "entity": "person-b",
        "period": "2042-06-15..2042-06-30",
        "time_basis": "due_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "bill-rent-b"
        ]
      },
      {
        "fact_key": "M-15#1#3",
        "metric": "reminder_count",
        "unit": "count",
        "entity": "person-b",
        "period": "2042-06-15..2042-06-30",
        "time_basis": "scheduled_at",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "person-b"
        ]
      },
      {
        "fact_key": "M-15#1#4",
        "metric": "calendar_event_count",
        "unit": "count",
        "entity": "person-b",
        "period": "2042-06-15..2042-06-30",
        "time_basis": "scheduled_at",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "person-b"
        ]
      }
    ],
    "M-16#1": [
      {
        "fact_key": "M-16#1#1",
        "metric": "merchant_rule_ids",
        "unit": "entity_ids",
        "entity": "merchant-market-example",
        "period": "as_of:2042-06-15",
        "time_basis": "registry_current",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "rule-market-example"
        ]
      },
      {
        "fact_key": "M-16#1#2",
        "metric": "similar_event_ids",
        "unit": "entity_ids",
        "entity": "merchant-market-example",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-market-a"
        ]
      },
      {
        "fact_key": "M-16#1#3",
        "metric": "side_effect_count",
        "unit": "count",
        "entity": "turn:M-16#1",
        "period": "as_of:2042-06-15",
        "time_basis": "request_execution",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "rule-market-example",
          "evt-market-a"
        ]
      }
    ],
    "F-01#1": [
      {
        "fact_key": "F-01#1#1",
        "metric": "category_consumption",
        "unit": "BRL_minor",
        "entity": "person-a:food.snack",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-snack-a"
        ]
      }
    ],
    "F-01#2": [
      {
        "fact_key": "F-01#2#1",
        "metric": "category_consumption",
        "unit": "BRL_minor",
        "entity": "person-b:food.snack",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "person-b",
          "source-complete-june"
        ]
      }
    ],
    "F-02#1": [
      {
        "fact_key": "F-02#1#1",
        "metric": "consumption_total",
        "unit": "BRL_minor",
        "entity": "person-a",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "source-complete-june"
        ]
      }
    ],
    "F-03#1": [
      {
        "fact_key": "F-03#1#1",
        "metric": "consumption_by_instrument",
        "unit": "BRL_minor",
        "entity": "account-a",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-market-a",
          "evt-rent-a"
        ]
      }
    ],
    "F-03#2": [
      {
        "fact_key": "F-03#2#1",
        "metric": "statement_total",
        "unit": "BRL_minor",
        "entity": "card-blue",
        "period": "statement_due:2042-06-17",
        "time_basis": "statement_competence",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-snack-a",
          "evt-fuel-a"
        ]
      }
    ],
    "F-04#1": [
      {
        "fact_key": "F-04#1#1",
        "metric": "category_consumption",
        "unit": "BRL_minor",
        "entity": "person-a:food.snack",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-snack-a"
        ]
      }
    ],
    "F-04#2": [
      {
        "fact_key": "F-04#2#1",
        "metric": "category_budget_remaining",
        "unit": "BRL_minor",
        "entity": "budget-snack",
        "period": "2042-06",
        "time_basis": "budget_cycle",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "budget-snack",
          "evt-snack-a"
        ]
      }
    ],
    "F-05#1": [
      {
        "fact_key": "F-05#1#1",
        "metric": "category_consumption",
        "unit": "BRL_minor",
        "entity": "person-a:food.market",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-market-a"
        ]
      }
    ],
    "F-05#2": [
      {
        "fact_key": "F-05#2#1",
        "metric": "category_consumption",
        "unit": "BRL_minor",
        "entity": "family-example:food.market",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-market-a"
        ]
      }
    ],
    "F-06#1": [
      {
        "fact_key": "F-06#1#1",
        "metric": "gross_consumption",
        "unit": "BRL_minor",
        "entity": "evt-restaurant-b",
        "period": "2042-06-07",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-restaurant-b"
        ]
      }
    ],
    "F-06#2": [
      {
        "fact_key": "F-06#2#1",
        "metric": "refund_amount",
        "unit": "BRL_minor",
        "entity": "evt-refund-b",
        "period": "2042-06-09",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-refund-b"
        ]
      },
      {
        "fact_key": "F-06#2#2",
        "metric": "net_consumption",
        "unit": "BRL_minor",
        "entity": "evt-restaurant-b",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-restaurant-b",
          "evt-refund-b"
        ]
      }
    ],
    "F-07#1": [
      {
        "fact_key": "F-07#1#1",
        "metric": "installments_realized",
        "unit": "count",
        "entity": "plan-01",
        "period": "through:2042-06-15",
        "time_basis": "installment_competence",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-installment-1"
        ]
      },
      {
        "fact_key": "F-07#1#2",
        "metric": "installments_realized_amount",
        "unit": "BRL_minor",
        "entity": "plan-01",
        "period": "through:2042-06-15",
        "time_basis": "installment_competence",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-installment-1"
        ]
      }
    ],
    "F-07#2": [
      {
        "fact_key": "F-07#2#1",
        "metric": "installments_projected",
        "unit": "count",
        "entity": "plan-01",
        "period": "2042-07..2042-08",
        "time_basis": "installment_competence",
        "coverage": "complete",
        "evidence_state": "projected",
        "evidence_refs": [
          "evt-installment-2",
          "evt-installment-3"
        ]
      },
      {
        "fact_key": "F-07#2#2",
        "metric": "installments_projected_amount",
        "unit": "BRL_minor",
        "entity": "plan-01",
        "period": "2042-07..2042-08",
        "time_basis": "installment_competence",
        "coverage": "complete",
        "evidence_state": "projected",
        "evidence_refs": [
          "evt-installment-2",
          "evt-installment-3"
        ]
      }
    ],
    "N-04#1": [
      {
        "fact_key": "N-04#1#1",
        "metric": "eligible_event_count",
        "unit": "count",
        "entity": "family-example:health.general",
        "period": "2042-06",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "source-empty-health"
        ]
      }
    ],
    "N-07#1": [
      {
        "fact_key": "N-07#1#1",
        "metric": "consumption_effect",
        "unit": "BRL_minor",
        "entity": "transfer-01",
        "period": "2042-06-12",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-transfer-out",
          "evt-transfer-in"
        ]
      }
    ],
    "N-08#1": [
      {
        "fact_key": "N-08#1#1",
        "metric": "invoice_payment_consumption_effect",
        "unit": "BRL_minor",
        "entity": "evt-invoice-payment",
        "period": "2042-06-13",
        "time_basis": "event_date",
        "coverage": "complete",
        "evidence_state": "confirmed",
        "evidence_refs": [
          "evt-invoice-payment"
        ]
      }
    ]
  }
}
```

## tests/fixtures/financasbot-next/golden-financial-fixture-v1.json

SHA-256 09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b; Git blob 62715a2e4822df07c0b9dc118a2818ed60e435e8; bytes 7936.

```json
{
  "schema_version": 1,
  "fixture_id": "NEXT-GOLDEN-FINANCIAL-V1",
  "synthetic": true,
  "closed_world": true,
  "notice": "Dados integralmente ficticios, criados apenas para testes.",
  "fixed_clock": "2042-06-15T12:00:00-03:00",
  "currency": "BRL",
  "families": [
    { "id": "family-example", "label": "Familia Exemplo", "members": ["person-a", "person-b"] },
    { "id": "family-outside", "label": "Familia Externa", "members": ["person-c"] }
  ],
  "people": [
    { "id": "person-a", "label": "Pessoa A", "family_id": "family-example" },
    { "id": "person-b", "label": "Pessoa B", "family_id": "family-example" },
    { "id": "person-c", "label": "Pessoa C", "family_id": "family-outside" }
  ],
  "accounts": [
    { "id": "account-a", "label": "Conta Principal A", "owner_id": "person-a", "type": "checking", "opening_balance_minor": 0, "opening_balance_as_of": "2042-06-01" },
    { "id": "account-b", "label": "Conta Principal B", "owner_id": "person-b", "type": "checking", "opening_balance_minor": 0, "opening_balance_as_of": "2042-06-01" },
    { "id": "account-reserve", "label": "Reserva Exemplo", "owner_id": "person-a", "type": "reserve", "opening_balance_minor": 0, "opening_balance_as_of": "2042-06-01" }
  ],
  "cards": [
    { "id": "card-blue", "label": "Cartao Azul", "owner_id": "person-a", "closing_day": 10, "due_day": 17 },
    { "id": "card-green", "label": "Cartao Verde", "owner_id": "person-b", "closing_day": 20, "due_day": 27 },
    { "id": "card-offline", "label": "Cartao Offline", "owner_id": "person-a", "closing_day": 5, "due_day": 12 }
  ],
  "categories": [
    { "id": "food.snack", "label": "Lanche", "kind": "expense", "budget_class": "flexible" },
    { "id": "food.market", "label": "Supermercado", "kind": "expense", "budget_class": "essential" },
    { "id": "food.restaurant", "label": "Restaurante", "kind": "expense", "budget_class": "flexible" },
    { "id": "transport.fuel", "label": "Combustivel", "kind": "expense", "budget_class": "essential" },
    { "id": "housing.rent", "label": "Moradia", "kind": "expense", "budget_class": "essential" },
    { "id": "leisure.cinema", "label": "Cinema", "kind": "expense", "budget_class": "flexible" },
    { "id": "gifts", "label": "Presentes", "kind": "expense", "budget_class": "flexible" },
    { "id": "income.salary", "label": "Salario", "kind": "income" },
    { "id": "neutral.transfer", "label": "Transferencia interna", "kind": "neutral" },
    { "id": "neutral.invoice_payment", "label": "Pagamento de fatura", "kind": "neutral" },
    { "id": "neutral.refund", "label": "Estorno", "kind": "compensation" },
    { "id": "health.general", "label": "Saude Exemplo", "kind": "expense", "budget_class": "essential" }
  ],
  "events": [
    { "id": "evt-salary-a", "date": "2042-06-03", "person_id": "person-a", "account_id": "account-a", "category_id": "income.salary", "amount_minor": 500000, "state": "confirmed" },
    { "id": "evt-market-a", "date": "2042-06-04", "person_id": "person-a", "account_id": "account-a", "category_id": "food.market", "amount_minor": -30000, "state": "confirmed", "merchant_key": "merchant-market-example" },
    { "id": "evt-snack-a", "date": "2042-06-05", "person_id": "person-a", "card_id": "card-blue", "category_id": "food.snack", "amount_minor": -1200, "state": "confirmed" },
    { "id": "evt-fuel-a", "date": "2042-06-06", "person_id": "person-a", "card_id": "card-blue", "category_id": "transport.fuel", "amount_minor": -20000, "state": "confirmed" },
    { "id": "evt-restaurant-b", "date": "2042-06-07", "person_id": "person-b", "card_id": "card-green", "category_id": "food.restaurant", "amount_minor": -4500, "state": "confirmed" },
    { "id": "evt-refund-b", "date": "2042-06-09", "person_id": "person-b", "card_id": "card-green", "category_id": "neutral.refund", "amount_minor": 4500, "state": "confirmed", "compensates": "evt-restaurant-b" },
    { "id": "evt-cinema-b", "date": "2042-06-10", "person_id": "person-b", "card_id": "card-green", "category_id": "leisure.cinema", "amount_minor": -3200, "state": "confirmed" },
    { "id": "evt-gift-b", "date": "2042-06-11", "person_id": "person-b", "account_id": "account-b", "category_id": "gifts", "amount_minor": -5000, "state": "confirmed" },
    { "id": "evt-transfer-out", "date": "2042-06-12", "person_id": "person-a", "account_id": "account-a", "category_id": "neutral.transfer", "amount_minor": -15000, "state": "confirmed", "transfer_pair": "transfer-01" },
    { "id": "evt-transfer-in", "date": "2042-06-12", "person_id": "person-a", "account_id": "account-reserve", "category_id": "neutral.transfer", "amount_minor": 15000, "state": "confirmed", "transfer_pair": "transfer-01" },
    { "id": "evt-invoice-payment", "date": "2042-06-13", "person_id": "person-a", "account_id": "account-a", "category_id": "neutral.invoice_payment", "amount_minor": -60000, "state": "confirmed", "settles_card_id": "card-blue" },
    { "id": "evt-rent-a", "date": "2042-06-14", "person_id": "person-a", "account_id": "account-a", "category_id": "housing.rent", "amount_minor": -100000, "state": "confirmed" },
    { "id": "evt-installment-1", "date": "2042-06-14", "person_id": "person-a", "card_id": "card-blue", "category_id": "gifts", "amount_minor": -10000, "state": "confirmed", "installment_plan": "plan-01", "installment_number": 1, "installment_total": 3 },
    { "id": "evt-installment-2", "date": "2042-07-14", "person_id": "person-a", "card_id": "card-blue", "category_id": "gifts", "amount_minor": -10000, "state": "projected", "installment_plan": "plan-01", "installment_number": 2, "installment_total": 3 },
    { "id": "evt-installment-3", "date": "2042-08-14", "person_id": "person-a", "card_id": "card-blue", "category_id": "gifts", "amount_minor": -10000, "state": "projected", "installment_plan": "plan-01", "installment_number": 3, "installment_total": 3 },
    { "id": "evt-bill-projected", "date": "2042-06-25", "person_id": "person-b", "account_id": "account-b", "category_id": "housing.rent", "amount_minor": -80000, "state": "projected" }
  ],
  "budgets": [
    { "id": "budget-snack", "family_id": "family-example", "category_id": "food.snack", "period": "2042-06", "limit_minor": 20000, "evidence_state": "confirmed", "source": "synthetic-ledger" },
    { "id": "budget-leisure", "family_id": "family-example", "category_id": "leisure.cinema", "period": "2042-06", "limit_minor": 15000, "evidence_state": "confirmed", "source": "synthetic-ledger" }
  ],
  "bills": [
    { "id": "bill-rent-b", "person_id": "person-b", "due_date": "2042-06-25", "amount_minor": 80000, "status": "open", "evidence_state": "confirmed", "source": "synthetic-ledger" }
  ],
  "source_states": [
    { "id": "source-complete-june", "source": "synthetic-ledger", "period": "2042-06", "coverage": "complete" },
    { "id": "source-partial-may", "source": "synthetic-ledger", "period": "2042-05", "coverage": "partial" },
    { "id": "source-offline-card", "source": "synthetic-open-finance", "entity_id": "card-offline", "coverage": "unavailable" },
    { "id": "source-empty-health", "source": "synthetic-ledger", "period": "2042-06", "category_id": "health.general", "coverage": "complete", "event_count": 0 }
  ],
  "proposals": [
    { "id": "proposal-active", "state": "presented", "expires_at": "2042-06-15T12:10:00-03:00", "source_version": "obs-v2" },
    { "id": "proposal-expired", "state": "expired", "expires_at": "2042-06-15T11:55:00-03:00", "source_version": "obs-v1" },
    { "id": "proposal-superseded", "state": "superseded", "expires_at": "2042-06-15T12:20:00-03:00", "source_version": "obs-v0" }
  ],
  "reminders": [],
  "calendar_events": [],
  "side_effects": [],
  "merchant_rules": [
    { "id": "rule-market-example", "merchant_key": "merchant-market-example", "category_id": "food.market", "application": "suggestion", "reversible": true, "evidence_state": "confirmed", "source": "synthetic-ledger" }
  ]
}
```

## tests/fixtures/financasbot-next/next02-expense-expectations-v1.json

SHA-256 07d68caa5b6e606381683cfad3bc4732d8f165a116b1ba382ececd1b69fe0717; Git blob f7bb07bd8c799d458839dcd62499f1dc083c2475; bytes 6209.

```json
{
  "schema_version":1,
  "authority":"candidate_hand_authored_expectations_pending_review",
  "query_columns":["scope","actor","period","timeBasis","evidenceState","filters"],
  "evidence_rule":"Exact event record IDs plus exactly one independently measured coverage reference; record IDs resolve through observation identity, not by value.",
  "cases":[
    {"id":"family-june","q":["family","person-a","2042-06","transaction_date","confirmed",{}],"value":159400,"kind":"value","records":["evt-market-a","evt-snack-a","evt-fuel-a","evt-restaurant-b","evt-refund-b","evt-cinema-b","evt-gift-b","evt-rent-a"]},
    {"id":"person-a-june","q":["personal","person-a","2042-06","transaction_date","confirmed",{}],"value":151200,"kind":"value","records":["evt-market-a","evt-snack-a","evt-fuel-a","evt-rent-a"]},
    {"id":"person-b-june","q":["personal","person-b","2042-06","transaction_date","confirmed",{}],"value":8200,"kind":"value","records":["evt-restaurant-b","evt-refund-b","evt-cinema-b","evt-gift-b"]},
    {"id":"market-family","q":["family","person-a","2042-06","transaction_date","confirmed",{"category":"food.market"}],"value":30000,"kind":"value","records":["evt-market-a"]},
    {"id":"market-person","q":["personal","person-a","2042-06","transaction_date","confirmed",{"category":"food.market"}],"value":30000,"kind":"value","records":["evt-market-a"]},
    {"id":"snack-a","q":["personal","person-a","2042-06","transaction_date","confirmed",{"category":"food.snack"}],"value":1200,"kind":"value","records":["evt-snack-a"]},
    {"id":"snack-b-empty","q":["personal","person-b","2042-06","transaction_date","confirmed",{"category":"food.snack"}],"value":0,"kind":"empty","records":[]},
    {"id":"account-a","q":["family","person-a","2042-06","transaction_date","confirmed",{"account":"account-a"}],"value":130000,"kind":"value","records":["evt-market-a","evt-rent-a"]},
    {"id":"card-blue-transaction","q":["family","person-a","2042-06","transaction_date","confirmed",{"card":"card-blue"}],"value":21200,"kind":"value","records":["evt-snack-a","evt-fuel-a"]},
    {"id":"refund-zero","q":["personal","person-b","2042-06","transaction_date","confirmed",{"category":"food.restaurant"}],"value":0,"kind":"zero","records":["evt-restaurant-b","evt-refund-b"]},
    {"id":"health-empty","q":["family","person-a","2042-06","transaction_date","confirmed",{"category":"health.general"}],"value":0,"kind":"empty","records":[]},
    {"id":"purchase-may","q":["family","person-a","2042-05","transaction_date","confirmed",{}],"value":30000,"kind":"value","records":["purchase-plan-01"]},
    {"id":"billing-family","q":["family","person-a","2042-06","billing_period","confirmed",{}],"value":34400,"kind":"value","records":["evt-snack-a","evt-fuel-a","evt-restaurant-b","evt-refund-b","evt-cinema-b","purchase-plan-01","evt-installment-1","evt-installment-2","evt-installment-3"]},
    {"id":"billing-blue","q":["family","person-a","2042-06","billing_period","confirmed",{"card":"card-blue"}],"value":31200,"kind":"value","records":["evt-snack-a","evt-fuel-a","purchase-plan-01","evt-installment-1","evt-installment-2","evt-installment-3"]},
    {"id":"billing-refund-zero","q":["personal","person-b","2042-06","billing_period","confirmed",{"category":"food.restaurant"}],"value":0,"kind":"zero","records":["evt-restaurant-b","evt-refund-b"]},
    {"id":"installment-june","q":["family","person-a","2042-06","billing_period","confirmed",{"subcategory":"gifts.electronics"}],"value":10000,"kind":"value","records":["purchase-plan-01","evt-installment-1","evt-installment-2","evt-installment-3"]},
    {"id":"installment-july","q":["family","person-a","2042-07","billing_period","projected",{"subcategory":"gifts.electronics"}],"value":10000,"kind":"value","records":["purchase-plan-01","evt-installment-1","evt-installment-2","evt-installment-3"]},
    {"id":"installment-august","q":["family","person-a","2042-08","billing_period","projected",{"subcategory":"gifts.electronics"}],"value":10000,"kind":"value","records":["purchase-plan-01","evt-installment-1","evt-installment-2","evt-installment-3"]},
    {"id":"projected-june","q":["family","person-a","2042-06","transaction_date","projected",{}],"value":80000,"kind":"value","records":["evt-bill-projected"]},
    {"id":"subcategory-market","q":["family","person-a","2042-06","transaction_date","confirmed",{"subcategory":"food.market.weekly"}],"value":30000,"kind":"value","records":["evt-market-a"]},
    {"id":"subcategory-purchase","q":["family","person-a","2042-05","transaction_date","confirmed",{"subcategory":"gifts.electronics"}],"value":30000,"kind":"value","records":["purchase-plan-01"]},
    {"id":"subcategory-other","q":["family","person-a","2042-06","transaction_date","confirmed",{"subcategory":"gifts.other"}],"value":5000,"kind":"value","records":["evt-gift-b"]},
    {"id":"health-subcategory-empty","q":["family","person-a","2042-06","transaction_date","confirmed",{"subcategory":"health.exam"}],"value":0,"kind":"empty","records":[]}
  ],
  "refusals":[
    {"id":"partial-may","case":"purchase-may","coverage":"partial","reason":"coverage_insufficient","result_coverage":"incomplete"},
    {"id":"unavailable-card","case":"billing-blue","coverage":"unavailable","reason":"source_unavailable","result_coverage":"unavailable"},
    {"id":"missing-lens","case":"billing-family","coverage":"absent","reason":"coverage_insufficient","result_coverage":"incomplete"},
    {"id":"external-actor","case":"family-june","actor":"person-c","reason":"authorized_scope_mismatch","result_coverage":"unavailable"},
    {"id":"legacy-lens","case":"family-june","timeBasis":"event_date","reason":"query_schema_invalid","result_coverage":"unavailable"}
  ],
  "arithmetic_review":{
    "family-june":"30000 + 1200 + 20000 + 4500 - 4500 + 3200 + 5000 + 100000 = 159400; neither purchase in May nor installment rows enter this lens.",
    "billing-family":"1200 + 20000 + 4500 - 4500 + 3200 + 10000 = 34400. Account purchases are not card competence.",
    "installments":"New purchase 30000 in May; explicit 10000 in each of June/July/August. Only June confirmed. All four nodes prove the complete schedule, even for one selected installment."
  }
}
```

## tests/fixtures/financasbot-next/next02-expense-observations-v1.json

SHA-256 a76c3512ef7b4c4af07b445d9be67757e62a1540c2551235cfea716ea9ccf956; Git blob e4870c0e53c197df0078a25b51e58ad9f761c9e0; bytes 6035.

```json
{
  "schema_version": 1,
  "synthetic": true,
  "closed_world": true,
  "status": "candidate_pending_independent_review",
  "source_instance": "next02-golden-synthetic",
  "policy_version": "next02-import-v4",
  "clock": "2042-06-30T23:59:59.999Z",
  "observation_coverage": {"start":"2042-05-01","end":"2042-06-30","as_of":"2042-06-30T23:59:59.999Z","completeness":"complete"},
  "coverage": [
    {"time_basis":"transaction_date","evidence_state":"confirmed","start":"2042-05-01","end":"2042-06-30","as_of":"2042-06-30T23:59:59.999Z","completeness":"complete"},
    {"time_basis":"transaction_date","evidence_state":"projected","start":"2042-05-01","end":"2042-08-31","as_of":"2042-06-30T23:59:59.999Z","completeness":"complete"},
    {"time_basis":"billing_period","evidence_state":"confirmed","start":"2042-05-01","end":"2042-06-30","as_of":"2042-06-30T23:59:59.999Z","completeness":"complete"},
    {"time_basis":"billing_period","evidence_state":"projected","start":"2042-05-01","end":"2042-08-31","as_of":"2042-06-30T23:59:59.999Z","completeness":"complete"}
  ],
  "catalog": {
    "family_id":"family-example",
    "people":[{"id":"person-a"},{"id":"person-b"}],
    "accounts":[{"id":"account-a","owner_id":"person-a"},{"id":"account-b","owner_id":"person-b"},{"id":"account-reserve","owner_id":"person-a"}],
    "cards":[{"id":"card-blue","owner_id":"person-a"},{"id":"card-green","owner_id":"person-b"},{"id":"card-offline","owner_id":"person-a"}],
    "categories":[{"id":"food.snack","kind":"expense"},{"id":"food.market","kind":"expense"},{"id":"food.restaurant","kind":"expense"},{"id":"transport.fuel","kind":"expense"},{"id":"housing.rent","kind":"expense"},{"id":"leisure.cinema","kind":"expense"},{"id":"gifts","kind":"expense"},{"id":"income.salary","kind":"income"},{"id":"health.general","kind":"expense"}],
    "subcategories":[{"id":"gifts.electronics","category_id":"gifts"},{"id":"gifts.other","category_id":"gifts"},{"id":"food.market.weekly","category_id":"food.market"},{"id":"health.exam","category_id":"health.general"}]
  },
  "columns":["id","record_type","person_id","account_id","card_id","category_id","subcategory_id","amount_minor","transaction_date","evidence_state","related_record_ref","transfer_ref","settles_card_id","installment_total","installment_index","installment_purchase_ref","billing_period"],
  "records":[
    ["evt-salary-a","income","person-a","account-a",null,"income.salary",null,500000,"2042-06-03","confirmed",null,null,null,null,null,null,null],
    ["evt-market-a","purchase","person-a","account-a",null,"food.market","food.market.weekly",30000,"2042-06-04","confirmed",null,null,null,null,null,null,null],
    ["evt-snack-a","purchase","person-a",null,"card-blue","food.snack",null,1200,"2042-06-05","confirmed",null,null,null,null,null,null,"2042-06"],
    ["evt-fuel-a","purchase","person-a",null,"card-blue","transport.fuel",null,20000,"2042-06-06","confirmed",null,null,null,null,null,null,"2042-06"],
    ["evt-restaurant-b","purchase","person-b",null,"card-green","food.restaurant",null,4500,"2042-06-07","confirmed",null,null,null,null,null,null,"2042-06"],
    ["evt-refund-b","refund","person-b",null,"card-green","food.restaurant",null,4500,"2042-06-09","confirmed","evt-restaurant-b",null,null,null,null,null,"2042-06"],
    ["evt-cinema-b","purchase","person-b",null,"card-green","leisure.cinema",null,3200,"2042-06-10","confirmed",null,null,null,null,null,null,"2042-06"],
    ["evt-gift-b","purchase","person-b","account-b",null,"gifts","gifts.other",5000,"2042-06-11","confirmed",null,null,null,null,null,null,null],
    ["evt-transfer-out","transfer","person-a","account-a",null,null,null,-15000,"2042-06-12","confirmed",null,"transfer-01",null,null,null,null,null],
    ["evt-transfer-in","transfer","person-a","account-reserve",null,null,null,15000,"2042-06-12","confirmed",null,"transfer-01",null,null,null,null,null],
    ["evt-invoice-payment","invoice_payment","person-a","account-a",null,null,null,60000,"2042-06-13","confirmed",null,null,"card-blue",null,null,null,null],
    ["evt-rent-a","purchase","person-a","account-a",null,"housing.rent",null,100000,"2042-06-14","confirmed",null,null,null,null,null,null,null],
    ["purchase-plan-01","purchase","person-a",null,"card-blue","gifts","gifts.electronics",30000,"2042-05-20","confirmed",null,null,null,3,null,null,null],
    ["evt-installment-1","installment","person-a",null,"card-blue","gifts","gifts.electronics",10000,"2042-05-20","confirmed",null,null,null,3,1,"purchase-plan-01","2042-06"],
    ["evt-installment-2","installment","person-a",null,"card-blue","gifts","gifts.electronics",10000,"2042-05-20","projected",null,null,null,3,2,"purchase-plan-01","2042-07"],
    ["evt-installment-3","installment","person-a",null,"card-blue","gifts","gifts.electronics",10000,"2042-05-20","projected",null,null,null,3,3,"purchase-plan-01","2042-08"],
    ["evt-bill-projected","purchase","person-b","account-b",null,"housing.rent",null,80000,"2042-06-25","projected",null,null,null,null,null,null,null]
  ],
  "new_information": {
    "purchase-plan-01":"New synthetic observation: purchase 30000 on 2042-05-20. Not recovered from the v1 oracle or inferred at runtime.",
    "installments":"Explicit purchase link and June/July/August billing periods; transaction_date now names the new purchase date. Original row dates remain only in frozen v1.",
    "card_billing":"June competence explicitly stipulated for non-installment card purchases and refund. Not inferred from card close/due rules.",
    "subcategories":"New explicit catalog and values; null means unknown, not an inferred category hierarchy.",
    "coverage":"New closed-world source and clock at June month end; v1 mid-month clock and coverage assertions are not reused as proof.",
    "normalization":"Expense/income/payment/refund use positive amounts, transfers keep signed amounts. Refund category follows its explicit target. Neutral category is null. Status active and currency BRL are explicit corpus-wide constants."
  }
}
```

## tests/fixtures/financasbot-next/next02-golden-traceability-v1.json

SHA-256 cee0bdd591b46305bb6ef76122b3a5320c44abc83d9abbdfea726c622638e685; Git blob 6a4bc4df99bfa694cecfffd67c738e078529d5d8; bytes 6274.

```json
{
  "schema_version":1,
  "claim":"Turn inventory only; links never assert full conversational or fact equivalence. All 76 original facts remain in v1; no percentage of full Golden Set approval is derived from this map.",
  "baseline_hash_encoding":"UTF-8, CRLF normalized to LF; all other bytes preserved",
  "baseline_hashes":{
    "golden-financial-fixture-v1.json":"09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b",
    "golden-claim-oracles-v1.json":"0e68ed70b10fdde5c90dc14aa3caf2ef72a4842bbbc6db8779287900567994d8",
    "golden-fact-contracts-v1.json":"377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2",
    "golden-conversation-set-v1.json":"21b999b7f9bdb835d9acf8f8dcbfe1cf32dbb8c63300f39d667bec3550f559f0"
  },
  "groups":[
    {"turns":["S-01#1","M-07#1","M-12#1"],"relation":"changed_scenario","cases":["family-june","installment-july","installment-august"],"remaining":"Explicit time bases and new purchase/coverage replace ambiguous event_date; projected aggregation and conversation composition are not implemented by these cases."},
    {"turns":["S-02#1","F-02#1"],"relation":"changed_scenario","cases":["person-a-june"],"remaining":"151200 replaces 161200 only in the supplemental transaction_date scenario. Follow-up resolution remains outside this test."},
    {"turns":["S-03#1","F-05#1","F-05#2"],"relation":"selected_events_equivalent","cases":["market-family","market-person"],"remaining":"Same selected market event and value; different explicit lens/coverage. No assertion of conversation or full claim equivalence."},
    {"turns":["S-04#1","S-06#1","S-07#1","S-12#1"],"relation":"pending","cases":[],"remaining":"Movement lists, balances and card listing are not expense totals; no replacement or skip counted as evidence."},
    {"turns":["S-05#1","F-03#2"],"relation":"pending","cases":[],"remaining":"Statement due/close cycle is not the explicit monthly billing_period lens. Do not relabel it."},
    {"turns":["S-08#1","S-09#1","N-07#1","N-08#1"],"relation":"invariant_only","cases":["family-june","account-a","billing-family"],"remaining":"Neutrality proven in expense totals and exact evidence exclusion, not standalone consumption_effect tools or conversational replies."},
    {"turns":["S-10#1","M-06#1","F-06#1","F-06#2"],"relation":"invariant_only","cases":["refund-zero","billing-refund-zero"],"remaining":"Compensation and zero versus empty covered; gross/refund separate claims and follow-ups remain unimplemented here."},
    {"turns":["S-11#1","F-07#1","F-07#2"],"relation":"changed_scenario","cases":["installment-june","installment-july","installment-august","purchase-may"],"remaining":"New explicit purchase and schedule prove amounts by lens/state. Schedule counts and follow-up replies are not outputs of expenses.sum."},
    {"turns":["S-13#1","M-09#1","N-04#1"],"relation":"invariant_only","cases":["health-empty"],"remaining":"Complete empty domain distinguished from compensated zero; eligible_event_count remains a different metric."},
    {"turns":["S-14#1","M-10#1","F-02#2","N-02#1"],"relation":"invariant_only","cases":["partial-may"],"remaining":"Partial coverage refuses exact total; no comparative ranking or conversational state demonstrated."},
    {"turns":["S-15#1","M-11#1","F-08#1","F-08#2","N-01#1"],"relation":"invariant_only","cases":["unavailable-card"],"remaining":"Unavailable source refuses result. Multi-source aggregation, source identification and refusal text remain pending; the supplemental source is globally unavailable in this scenario."},
    {"turns":["S-16#1"],"relation":"invariant_only","cases":["family-june","missing-lens"],"remaining":"Coverage lens participates in acceptance; no financial_sources.get_coverage standalone tool is implemented here."},
    {"turns":["M-01#1"],"relation":"invariant_only","cases":["person-a-june","person-b-june"],"remaining":"Per-person inputs only. Ranking and signed difference require separate reviewed expectations/implementation; not claimed covered."},
    {"turns":["M-02#1","F-03#1"],"relation":"invariant_only","cases":["account-a","card-blue-transaction","billing-blue"],"remaining":"Account value preserved; card lens changed because installments are not transactions. No equivalence of all facts in M-02."},
    {"turns":["M-03#1","M-13#1"],"relation":"pending","cases":[],"remaining":"Budget-class grouping, budget-cycle balances and daily pace are not category/subcategory totals; applicability to global roadmap still requires explicit decision, not silent exclusion."},
    {"turns":["M-04#1"],"relation":"invariant_only","cases":["account-a","family-june"],"remaining":"Neutral transfer exclusion only; balance deltas are not implemented by expense query."},
    {"turns":["M-05#1"],"relation":"invariant_only","cases":["billing-blue","account-a"],"remaining":"Payment neutral and target preserved by kernel; statement identity/payment correspondence and separate payment amount not certified here."},
    {"turns":["M-08#1"],"relation":"invariant_only","cases":["snack-b-empty"],"remaining":"Person/category expense scope only; budget balance and budget-family semantics are not this query."},
    {"turns":["M-14#1","M-15#1","M-16#1"],"relation":"pending","cases":[],"remaining":"Income versus bills, calendar/reminders, merchant rules/proposals and side-effect claims are not the implemented expense vertical."},
    {"turns":["F-01#1","F-04#1"],"relation":"selected_events_equivalent","cases":["snack-a"],"remaining":"Same selected event and amount; no follow-up interpretation or full claim equivalence."},
    {"turns":["F-01#2"],"relation":"selected_events_equivalent","cases":["snack-b-empty"],"remaining":"Same empty person/category selection; context is supplied explicitly, not inferred from conversation."},
    {"turns":["F-04#2"],"relation":"pending","cases":[],"remaining":"Budget remaining is not consumption_total."},
    {"turns":["N-03#1"],"relation":"invariant_only","cases":["external-actor"],"remaining":"Kernel denies out-of-family actor; no model or natural-language authorization proof."},
    {"turns":["N-05#1","N-06#1"],"relation":"pending","cases":[],"remaining":"Expired/superseded proposals are not executed by this read-only corpus. No writer authorization."}
  ]
}
```

## tests/helpers/exhaustiveNetworkTripwire.js

SHA-256 0e617850ce48a52dc88cfa05f8ab55b6e3f866638f932077536c4760217839e0; Git blob ffc1c17c630bd9e262075ecde940e870879e1653; bytes 21939.

```javascript
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const childProcess = require('node:child_process');
const { buildDescendantNodeOptions } = require('./exhaustiveNodeOptions');

const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const RELEASE_ARTIFACT_PATTERN =
    /^financas-bot-[a-f0-9]{40}\.tar\.gz$/;

function canonicalExistingPath(value) {
    if (typeof value !== 'string' || !value || !path.isAbsolute(value)) {
        return null;
    }
    try {
        return fs.realpathSync(value);
    } catch {
        return null;
    }
}

function samePath(left, right) {
    if (!left || !right) return false;
    const resolvedLeft = path.resolve(left);
    const resolvedRight = path.resolve(right);
    return process.platform === 'win32'
        ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
        : resolvedLeft === resolvedRight;
}

const AUDITED_GIT_EXECUTABLE =
    canonicalExistingPath(process.env.EXHAUSTIVE_LOCAL_GIT_PATH);
const AUDITED_TAR_EXECUTABLE =
    canonicalExistingPath(process.env.EXHAUSTIVE_LOCAL_TAR_PATH);
const AUDITED_REPO_ROOT =
    canonicalExistingPath(process.env.EXHAUSTIVE_REPO_ROOT);
const AUDITED_TEMP_ROOT =
    canonicalExistingPath(process.env.EXHAUSTIVE_AUDIT_TEMP_ROOT);

function normalizeHost(value) {
    return String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
}

function isLoopbackHost(value) {
    const host = normalizeHost(value);
    return !host || host === 'localhost' || host === '::1' || host === '0.0.0.0'
        || host.startsWith('127.');
}

function requestHost(input, options) {
    if (typeof input === 'string' || input instanceof URL) {
        try {
            return new URL(input).hostname;
        } catch {
            return '';
        }
    }
    const candidate = input && typeof input === 'object' ? input : options;
    return candidate?.hostname || candidate?.host || '';
}

function blockedError(host) {
    const error = new Error(`EXHAUSTIVE_AUDIT_NETWORK_BLOCKED:${normalizeHost(host) || 'unknown'}`);
    error.code = 'EXHAUSTIVE_AUDIT_NETWORK_BLOCKED';
    return error;
}

function blockedSubprocessError() {
    const error = new Error('EXHAUSTIVE_AUDIT_SUBPROCESS_BLOCKED');
    error.code = 'EXHAUSTIVE_AUDIT_SUBPROCESS_BLOCKED';
    return error;
}

function isCurrentNodeExecutable(command) {
    if (typeof command !== 'string' || !command) return false;
    const resolvedCommand = path.resolve(command);
    const resolvedNode = path.resolve(process.execPath);
    return process.platform === 'win32'
        ? resolvedCommand.toLowerCase() === resolvedNode.toLowerCase()
        : resolvedCommand === resolvedNode;
}

function isAuditedLocalGitExecutable(command) {
    return samePath(canonicalExistingPath(command), AUDITED_GIT_EXECUTABLE);
}

function isCommitObject(value) {
    return typeof value === 'string' &&
        COMMIT_PATTERN.test(value.replace(/\^\{commit\}$/, ''));
}

// Raw local object reads only: no revision expressions, path traversal,
// textconv/filters, diff drivers, mutable refs, shell or network commands.
function isImmutableBlobObject(value) {
    if (typeof value !== 'string') return false;
    if (COMMIT_PATTERN.test(value)) return true;
    const match = /^([a-f0-9]{40}):([A-Za-z0-9._/-]+)$/.exec(value);
    if (!match || match[2].startsWith('/')) return false;
    return match[2].split('/').every(segment => segment && segment !== '.' && segment !== '..');
}

function resolvedCwd(options) {
    const source = options && typeof options === 'object' ? options : {};
    return canonicalExistingPath(
        path.resolve(source.cwd || process.cwd())
    );
}

function isDirectControlledDirectory(candidate, prefix) {
    if (!AUDITED_TEMP_ROOT || !candidate) return false;
    const realCandidate = canonicalExistingPath(candidate);
    return Boolean(realCandidate) &&
        samePath(path.dirname(realCandidate), AUDITED_TEMP_ROOT) &&
        path.basename(realCandidate).startsWith(prefix);
}

function auditedGitDirectoryKind(options) {
    const cwd = resolvedCwd(options);
    if (samePath(cwd, AUDITED_REPO_ROOT)) return 'audited_repo';
    if (isScopeFixtureDirectory(options)) return 'scope_fixture';
    if (isDirectControlledDirectory(
        cwd,
        'financasbot-release-repo-'
    )) return 'release_fixture';
    if (isDirectControlledDirectory(
        cwd,
        'orch-watch-ignored-'
    )) return 'watcher_ignored_fixture';
    return null;
}

function controlledMissingFile(candidate, {
    directoryPrefix,
    basenamePattern
}) {
    if (!AUDITED_TEMP_ROOT || typeof candidate !== 'string' ||
        !path.isAbsolute(candidate)) return false;
    const parent = canonicalExistingPath(path.dirname(candidate));
    if (!isDirectControlledDirectory(parent, directoryPrefix)) return false;
    if (fs.existsSync(candidate) &&
        !samePath(
            canonicalExistingPath(candidate),
            path.join(parent, path.basename(candidate))
        )) return false;
    return basenamePattern.test(path.basename(candidate));
}

function isControlledGitArchiveOutput(candidate) {
    return controlledMissingFile(candidate, {
        directoryPrefix: 'financasbot-build-',
        basenamePattern: /^source\.tar$/
    });
}

function isControlledTarOutput(candidate) {
    return controlledMissingFile(candidate, {
        directoryPrefix: 'financasbot-release-output-',
        basenamePattern: RELEASE_ARTIFACT_PATTERN
    });
}

function isControlledTarSource(candidate) {
    if (!AUDITED_TEMP_ROOT || typeof candidate !== 'string' ||
        !path.isAbsolute(candidate)) return false;
    const source = canonicalExistingPath(candidate);
    if (!source || path.basename(source) !== 'tree') return false;
    return isDirectControlledDirectory(
        path.dirname(source),
        'financasbot-build-'
    );
}

// Closed contract of the existing synthetic agentScopeGuard fixture. This is
// not an authorization for arbitrary Git operations or repositories.
const SCOPE_FIXTURE_COMMANDS = Object.freeze([
    ['init', '-q', '-b', 'codex/test'],
    ['add', '--', 'old/wip.js', 'scripts/guard.js'],
    ['add', '--', 'old/wip.js'], ['add', '--', 'scripts/guard.js'], ['add', '--', 'old/new.js'],
    ['-c', 'user.name=Scope Test', '-c', 'user.email=scope-test@example.invalid', 'commit', '-q', '-m', 'fixture'],
    ['-c', 'user.name=Scope Test', '-c', 'user.email=scope-test@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'new head'],
    ['switch', '-q', '-c', 'codex/other'], ['switch', '-q', 'codex/test'],
    ['rm', '--cached', '--', 'old/wip.js'], ['rm', '--cached', '--', 'scripts/guard.js'],
    ['rev-parse', 'HEAD'], ['rev-parse', ':scripts/guard.js'],
    ['update-index', '--chmod=+x', '--', 'old/wip.js'],
    ['branch', '--show-current'],
    ['diff', '--name-only', '--no-renames', '-z', 'HEAD', '--'],
    ['ls-files', '--others', '--exclude-standard', '-z'], ['ls-files', '--stage', '-z'],
    ['diff', '--cached', '--name-only', '--no-renames', '-z', 'HEAD', '--'],
    ['diff', '--cached', '--name-only', '--no-renames', '--diff-filter=D', '-z', 'HEAD', '--']
].map(command => Object.freeze(command)));

function isScopeFixtureDirectory(options) {
    if (!AUDITED_TEMP_ROOT || !AUDITED_REPO_ROOT) return false;
    const relative = path.relative(AUDITED_REPO_ROOT, AUDITED_TEMP_ROOT);
    if (!(relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative))) return false;
    if (!options || typeof options.cwd !== 'string' || !path.isAbsolute(options.cwd) ||
        options.shell || options.cwd.split(/[\\/]/).some(part => part === '.' || part === '..')) return false;
    const cwd = resolvedCwd(options);
    if (!samePath(options.cwd, cwd) ||
        !isDirectControlledDirectory(cwd, 'financasbot-scope-test-')) return false;
    try { return fs.lstatSync(options.cwd).isDirectory() && !fs.lstatSync(options.cwd).isSymbolicLink(); }
    catch { return false; }
}

function isScopeFixtureCommand(args, options) {
    if (!isScopeFixtureDirectory(options) || !args.every(arg => typeof arg === 'string') ||
        args[0] !== '-c' || args[1] !== 'safe.directory=' + resolvedCwd(options)) return false;
    const command = args.slice(2);
    if (SCOPE_FIXTURE_COMMANDS.some(expected => expected.length === command.length &&
        expected.every((arg, index) => arg === command[index]))) return true;
    return command.length === 3 && command[0] === 'update-index' &&
        command[1] === '--cacheinfo' &&
        /^(?:120000|100644),[a-f0-9]{40},scripts\/guard\.js$/.test(command[2]);
}

function scopeFixtureExclusion(options, environment) {
    if (!isScopeFixtureDirectory(options) || environment.GIT_CONFIG_COUNT !== '1' ||
        environment.GIT_CONFIG_KEY_0 !== 'core.excludesFile') return null;
    const keys = Object.keys(environment).filter(key => /^GIT_CONFIG(?:_|$)/.test(key));
    if (keys.length !== 3 || !keys.every(key =>
        ['GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0'].includes(key))) return null;
    const cwd = resolvedCwd(options), expected = path.join(cwd, '.git', 'info', 'scope-test.exclude');
    if (environment.GIT_CONFIG_VALUE_0 !== expected) return null;
    try {
        for (const candidate of [path.join(cwd, '.git'), path.join(cwd, '.git', 'info'), expected]) {
            if (fs.lstatSync(candidate).isSymbolicLink() ||
                !samePath(fs.realpathSync(candidate), candidate)) return null;
        }
        return fs.lstatSync(expected).isFile() ? expected : null;
    } catch { return null; }
}

function isAuditedLocalGitCommand(command, args, options) {
    if (!isAuditedLocalGitExecutable(command) || !Array.isArray(args)) return false;
    const directoryKind = auditedGitDirectoryKind(options);
    if (!directoryKind) return false;
    if (directoryKind === 'scope_fixture') return isScopeFixtureCommand(args, options);
    if (directoryKind === 'release_fixture' &&
        args.length === 2 && args[0] === 'init' &&
        args[1] === '--quiet') return true;
    if (directoryKind === 'watcher_ignored_fixture' &&
        args.length === 2 && args[0] === 'init' &&
        args[1] === '-q') return true;
    if (directoryKind === 'watcher_ignored_fixture' &&
        args.length === 2 && args[0] === 'add' &&
        args[1] === '.gitignore') return true;
    if (directoryKind === 'watcher_ignored_fixture' &&
        args.length === 9 && args[0] === '-c' &&
        args[1] === `safe.directory=${resolvedCwd(options)}` &&
        args[2] === '-C' && samePath(args[3], resolvedCwd(options)) &&
        args.slice(4).join(' ') ===
            'ls-files -z --others --ignored --exclude-standard') return true;
    if (args.length === 3 && args[0] === 'add' &&
        directoryKind === 'release_fixture' &&
        args[1] === 'index.js' && args[2] === 'package.json') return true;
    if (args.length === 5 && args[0] === 'commit' && args[1] === '--quiet' &&
        directoryKind === 'release_fixture' &&
        args[2] === '--no-verify' && args[3] === '-m' && args[4] === 'fixture') return true;
    if (args.length === 2 && args[0] === 'rev-parse' && args[1] === 'HEAD') return true;
    if (args.length === 3 && args[0] === 'rev-parse' && args[1] === '--verify' &&
        isCommitObject(args[2])) return true;
    if (args.length === 3 && args[0] === 'cat-file' && args[1] === '-e' &&
        isCommitObject(args[2])) return true;
    if (directoryKind === 'audited_repo' && args.length === 3 &&
        args[0] === 'cat-file' && args[1] === 'blob' && isImmutableBlobObject(args[2])) return true;
    if (args.length === 4 && args[0] === 'merge-base' &&
        args[1] === '--is-ancestor' && COMMIT_PATTERN.test(args[2]) &&
        COMMIT_PATTERN.test(args[3])) return true;
    if (args.length === 4 && args[0] === 'ls-tree' && args[1] === '-r' &&
        args[2] === '--name-only' && COMMIT_PATTERN.test(args[3])) return true;
    if (args.length === 4 && args[0] === 'archive' && args[1] === '--format=tar' &&
        args[2].startsWith('--output=') &&
        isControlledGitArchiveOutput(
            args[2].slice('--output='.length)
        ) &&
        COMMIT_PATTERN.test(args[3])) return true;
    return false;
}

function isAuditedLocalTarCommand(command, args) {
    if (!Array.isArray(args) ||
        !samePath(
            canonicalExistingPath(command),
            AUDITED_TAR_EXECUTABLE
        )) return false;
    return args.length === 5 && args[0] === '-czf' &&
        isControlledTarOutput(args[1]) &&
        args[2] === '-C' && path.isAbsolute(args[3]) &&
        isControlledTarSource(args[3]) && args[4] === '.';
}

function protectedChildOptions(options, protectedNodeOptions, auditedGit = false) {
    const source = options && typeof options === 'object' ? options : {};
    if (source.shell) throw blockedSubprocessError();
    const sourceEnvironment = { ...(source.env || process.env) };
    sourceEnvironment.EXHAUSTIVE_LOCAL_GIT_PATH =
        AUDITED_GIT_EXECUTABLE || '';
    sourceEnvironment.EXHAUSTIVE_LOCAL_TAR_PATH =
        AUDITED_TAR_EXECUTABLE || '';
    sourceEnvironment.EXHAUSTIVE_REPO_ROOT = AUDITED_REPO_ROOT || '';
    sourceEnvironment.EXHAUSTIVE_AUDIT_TEMP_ROOT =
        AUDITED_TEMP_ROOT || '';
    if (auditedGit) {
        const fixtureExclusion = scopeFixtureExclusion(source, sourceEnvironment);
        for (const key of Object.keys(sourceEnvironment)) {
            if (/^GIT_CONFIG(?:_|$)/.test(key) ||
                ['GIT_SSH', 'GIT_SSH_COMMAND', 'GIT_ASKPASS', 'GIT_PROXY_COMMAND',
                    'GIT_DIR', 'GIT_COMMON_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE',
                    'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES',
                    'GIT_EXEC_PATH', 'GIT_TEMPLATE_DIR']
                    .includes(key)) {
                delete sourceEnvironment[key];
            }
        }
        sourceEnvironment.GIT_CONFIG_NOSYSTEM = '1';
        sourceEnvironment.GIT_CONFIG_GLOBAL = process.platform === 'win32'
            ? 'NUL'
            : '/dev/null';
        sourceEnvironment.GIT_CONFIG_COUNT = '4';
        sourceEnvironment.GIT_CONFIG_KEY_0 = 'safe.directory';
        sourceEnvironment.GIT_CONFIG_VALUE_0 = path.resolve(source.cwd || process.cwd());
        sourceEnvironment.GIT_CONFIG_KEY_1 = 'core.hooksPath';
        sourceEnvironment.GIT_CONFIG_VALUE_1 = process.platform === 'win32'
            ? 'NUL'
            : '/dev/null';
        sourceEnvironment.GIT_CONFIG_KEY_2 = 'commit.gpgSign';
        sourceEnvironment.GIT_CONFIG_VALUE_2 = 'false';
        sourceEnvironment.GIT_CONFIG_KEY_3 = 'core.fsmonitor';
        sourceEnvironment.GIT_CONFIG_VALUE_3 = 'false';
        if (fixtureExclusion) {
            sourceEnvironment.GIT_CONFIG_COUNT = '5';
            sourceEnvironment.GIT_CONFIG_KEY_4 = 'core.excludesFile';
            sourceEnvironment.GIT_CONFIG_VALUE_4 = fixtureExclusion;
        }
        sourceEnvironment.GIT_TERMINAL_PROMPT = '0';
        sourceEnvironment.GIT_ALLOW_PROTOCOL = 'file';
    }
    return {
        ...source,
        shell: false,
        env: {
            ...sourceEnvironment,
            EXHAUSTIVE_NETWORK_TRIPWIRE_ACTIVE: 'true',
            NODE_OPTIONS: protectedNodeOptions
        }
    };
}

function installSubprocessTripwire() {
    const protectedNodeOptions = process.env.NODE_OPTIONS || buildDescendantNodeOptions();
    const originalSpawn = childProcess.spawn.bind(childProcess);
    childProcess.spawn = function guardedSpawn(command, args, options) {
        const auditedGit = isAuditedLocalGitCommand(command, args, options);
        const auditedTar = isAuditedLocalTarCommand(command, args);
        if (!isCurrentNodeExecutable(command) && !auditedGit && !auditedTar) {
            throw blockedSubprocessError();
        }
        if (!Array.isArray(args)) {
            return originalSpawn(command, [], protectedChildOptions(args, protectedNodeOptions));
        }
        return originalSpawn(
            command,
            args,
            protectedChildOptions(options, protectedNodeOptions, auditedGit)
        );
    };

    const originalSpawnSync = childProcess.spawnSync.bind(childProcess);
    childProcess.spawnSync = function guardedSpawnSync(command, args, options) {
        const auditedGit = isAuditedLocalGitCommand(command, args, options);
        const auditedTar = isAuditedLocalTarCommand(command, args);
        if (!isCurrentNodeExecutable(command) && !auditedGit && !auditedTar) {
            throw blockedSubprocessError();
        }
        if (!Array.isArray(args)) {
            return originalSpawnSync(command, [], protectedChildOptions(args, protectedNodeOptions));
        }
        return originalSpawnSync(
            command,
            args,
            protectedChildOptions(options, protectedNodeOptions, auditedGit)
        );
    };

    const originalExecFile = childProcess.execFile.bind(childProcess);
    childProcess.execFile = function guardedExecFile(file, args, options, callback) {
        const auditedGit = isAuditedLocalGitCommand(file, args, options);
        const auditedTar = isAuditedLocalTarCommand(file, args);
        if (!isCurrentNodeExecutable(file) && !auditedGit && !auditedTar) {
            throw blockedSubprocessError();
        }
        if (typeof args === 'function') {
            callback = args;
            args = [];
            options = {};
        } else if (!Array.isArray(args)) {
            callback = typeof options === 'function' ? options : callback;
            options = args;
            args = [];
        } else if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        return originalExecFile(
            file,
            args,
            protectedChildOptions(options, protectedNodeOptions, auditedGit),
            callback
        );
    };

    const originalExecFileSync = childProcess.execFileSync.bind(childProcess);
    childProcess.execFileSync = function guardedExecFileSync(file, args, options) {
        const auditedGit = isAuditedLocalGitCommand(file, args, options);
        const auditedTar = isAuditedLocalTarCommand(file, args);
        if (!isCurrentNodeExecutable(file) && !auditedGit && !auditedTar) {
            throw blockedSubprocessError();
        }
        if (!Array.isArray(args)) {
            options = args;
            args = [];
        }
        return originalExecFileSync(
            file,
            args,
            protectedChildOptions(options, protectedNodeOptions, auditedGit)
        );
    };

    const originalFork = childProcess.fork.bind(childProcess);
    childProcess.fork = function guardedFork(modulePath, args, options) {
        const sourceOptions = Array.isArray(args) ? options : args;
        if (sourceOptions?.execPath && !isCurrentNodeExecutable(sourceOptions.execPath)) {
            throw blockedSubprocessError();
        }
        const guardedOptions = {
            ...protectedChildOptions(sourceOptions, protectedNodeOptions),
            execPath: process.execPath
        };
        if (!Array.isArray(args)) return originalFork(modulePath, [], guardedOptions);
        return originalFork(modulePath, args, guardedOptions);
    };

    childProcess.exec = function blockedExec() {
        throw blockedSubprocessError();
    };
    childProcess.execSync = function blockedExecSync() {
        throw blockedSubprocessError();
    };
}

function installTripwire() {
    if (global.__FINANCASBOT_EXHAUSTIVE_NETWORK_TRIPWIRE__) return;
    global.__FINANCASBOT_EXHAUSTIVE_NETWORK_TRIPWIRE__ = true;

    for (const module of [http, https]) {
        const originalRequest = module.request.bind(module);
        module.request = function guardedRequest(input, options, callback) {
            const host = requestHost(input, options);
            if (!isLoopbackHost(host)) throw blockedError(host);
            return originalRequest(input, options, callback);
        };
        const originalGet = module.get.bind(module);
        module.get = function guardedGet(input, options, callback) {
            const host = requestHost(input, options);
            if (!isLoopbackHost(host)) throw blockedError(host);
            return originalGet(input, options, callback);
        };
    }

    for (const method of ['connect', 'createConnection']) {
        const original = net[method].bind(net);
        net[method] = function guardedConnect(...args) {
            const options = args[0] && typeof args[0] === 'object' ? args[0] : null;
            const host = options?.host || options?.hostname || (typeof args[1] === 'string' ? args[1] : '');
            if (!isLoopbackHost(host)) throw blockedError(host);
            return original(...args);
        };
    }

    if (typeof global.fetch === 'function') {
        const originalFetch = global.fetch.bind(global);
        global.fetch = function guardedFetch(input, init) {
            const host = requestHost(input, init);
            if (!isLoopbackHost(host)) return Promise.reject(blockedError(host));
            return originalFetch(input, init);
        };
    }

    installSubprocessTripwire();
    // The preload has executed, and child wrappers captured its exact options.
    // Do not expose harness transport as an ambient runtime override. Unknown
    // options remain visible so strict runtime consumers still reject them.
    if (process.env.NODE_OPTIONS === buildDescendantNodeOptions(process.env.NODE_OPTIONS)) {
        delete process.env.NODE_OPTIONS;
    }
}

if (String(process.env.EXHAUSTIVE_NETWORK_TRIPWIRE_ACTIVE || '').toLowerCase() === 'true') {
    installTripwire();
}

module.exports = {
    normalizeHost,
    isLoopbackHost,
    requestHost,
    installTripwire,
    isCurrentNodeExecutable,
    isAuditedLocalGitCommand,
    isAuditedLocalTarCommand
};
```

## tests/next/provenance/financialHost.cases.js

SHA-256 6ace9c3389bd20b6fd3954896775b8538a60feb2f3c3b6d0432fa70209f2cc7c; Git blob 878192a0607816e0488fda7b7b9e0b282ab742e1; bytes 13810.

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const { admitArtifact, artifactContents } = require('../../../src/next/provenance/artifactLoader');
const { admitPackage } = require('../../../src/next/provenance/packageContract');
const { compileAuthoringIR, compileSnapshotAccess } = require('../../../src/next/provenance/graphCompiler');
const { admitPhaseCompositionProfile, PROFILE_PATH, phaseCompositionCommitment } = require('../../../src/next/provenance/phaseCompositionProfile');
const { proofProgramIdentity } = require('../../../src/next/provenance/financialHost');
const root = path.resolve(__dirname, '../../..');
const prefix = 'docs/contracts/next/provenance-v2/';
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const clone = value => Buffer.isBuffer(value) ? Buffer.from(value) : Array.isArray(value) ? value.map(clone)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) : value;
const artifact = built => ({ manifestBytes: Buffer.from(built.manifest), entries: built.entries
    ? built.entries.map(row => ({ path: row.path, bytes: Buffer.from(row.source) }))
    : [{ path: 'bundle.js', bytes: Buffer.from(built.source) }, ...(built.profileInput
        ? [{ path: built.profileInput.path, bytes: Buffer.from(built.profileInput.source) }] : [])] });
let fixturePromise;
async function fixture() {
    if (fixturePromise) return fixturePromise;
    fixturePromise = (async () => {
        const { buildCapturedValidationTools } = await import('../../../scripts/agent/buildNextValidationTcb.mjs');
        const { buildAvailableMetricArtifacts, buildExecutionRegistryCandidate } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
        const { buildSchemaValidators } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
        const { buildPhaseProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
        const files = new Map();
        const add = file => {
            if (!files.has(file)) files.set(file, { path: file, bytes: Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n')) });
            return JSON.parse(files.get(file).bytes);
        };
        const corpus = add(prefix + 'graphs-v2.json');
        for (const file of ['predicate-templates-v1.json', 'claim-contract.schema.json', 'evidence-snapshot.schema.json']) add(prefix + file);
        for (const key of ['claim_contract', 'snapshot_manifest', 'material_registry', 'operator_registry', 'metric_evaluator_registry']) add(corpus[key].path);
        for (const source of add(corpus.snapshot_manifest.path).sources) add(source.path);
        const authorRegistry = add(corpus.metric_evaluator_registry.path);
        for (const row of authorRegistry.entries) add(row.contract_path);
        for (const graph of corpus.graphs) for (const source of graph.authoring_sources) add(source.path);
        const packageEntries = [...files.values()];
        const authority = packageEntries.map(row => ({ path: row.path, sha256: hash(row.bytes) })).sort((a, b) => a.path < b.path ? -1 : 1);
        const receipt = admitPackage({ entries: packageEntries, authority });
        const validators = buildSchemaValidators().validators;
        const plan = compileSnapshotAccess(receipt, validators); const ir = compileAuthoringIR(receipt, validators);
        const profileSource = fs.readFileSync(path.join(root, PROFILE_PATH), 'utf8');
        const profile = admitPhaseCompositionProfile({ source: profileSource, registry: authorRegistry });
        const proofs = new Map(); const programIds = new Map();
        for (const factKey of ir.order) {
            const input = { proof: plan.projectProofProgram({ fact_key: factKey }).input,
                derivation: plan.projectDerivationProgram({ fact_key: factKey }, profile).input };
            const programId = proofProgramIdentity(input.proof, input.derivation, phaseCompositionCommitment(profile).sha256);
            const built = buildPhaseProofProgram(input, profile);
            if (proofs.has(programId)) assert.equal(proofs.get(programId).built.artifact_root, built.artifact_root);
            proofs.set(programId, { built, row: { program_id: programId, ...artifact(built) } }); programIds.set(factKey, programId);
        }
        const tcb = buildCapturedValidationTools(); const registry = buildExecutionRegistryCandidate();
        // Synthetic TEST authority only. This is not a published/reviewed freeze
        // and must never be promoted to financial/product approval.
        const freeze = { schema_version: 1, freeze_id: 'provenance_execution', freeze_version: 1, stage: 'execution',
            metric_registry_hash: registry.registry_hash, validation_tcb_root: tcb.artifact_root, child_capsule_root: tcb.child.artifact_root,
            native_runtime: { platform: process.platform, arch: process.arch, node_version: process.version,
                node_binary_sha256: hash(fs.readFileSync(process.execPath)) }, package_authority: authority,
            proof_programs: [...proofs].map(([program_id, row]) => ({ program_id, proof_engine_artifact_root: row.built.artifact_root }))
                .sort((a, b) => a.program_id < b.program_id ? -1 : 1) };
        return { tcb, freeze, order: ir.order, programIds, data: { packageEntries, registryBytes: Buffer.from(registry.bytes),
            metricArtifacts: buildAvailableMetricArtifacts().built.map(row => ({ evaluator_id: row.evaluator_id, ...artifact(row) })),
            proofArtifacts: [...proofs.values()].map(row => row.row), profileSource, timeoutMs: 5000 } };
    })();
    return fixturePromise;
}
function bootstrap(fixture, freeze = fixture.freeze, tcbArtifact = artifact(fixture.tcb)) {
    const freezeBytes = Buffer.from(canonicalValue(freeze));
    return { freezeBytes, expectedFreezeHash: hash(freezeBytes), tcbArtifact };
}
function externalLauncher(fixture, input) {
    // Models the DECLARED native external trust boundary: identify the captured
    // leaf BEFORE executing project bootstrap bytes. No ambient project require.
    const receipt = admitArtifact({ ...input.tcbArtifact, expectedRoot: fixture.freeze.validation_tcb_root });
    const contents = artifactContents(receipt);
    const launcher = contents.files.find(row => row.path === 'launcher-bootstrap.js');
    const launch = vm.runInThisContext(`(function(require){return ${launcher.source}\n})`)(specifier => {
        assert.ok(fixture.tcb.launcherNativeExternals.includes(specifier)); return require(specifier);
    });
    assert.equal(typeof launch, 'function'); return launch(input);
}

test('N02G:FINANCIAL-HOST-001 captured private host accepts the complete DAG only after exact D/P and clean exit', async t => {
    const f = await fixture(); const input = bootstrap(f); const data = clone(f.data);
    const launcher = externalLauncher(f, input);
    assert.deepEqual(Object.keys(launcher).sort(), ['financial_acceptance', 'initialize', 'stage']);
    assert.equal(launcher.financial_acceptance, false);
    const host = launcher.initialize(data);
    assert.deepEqual(Object.keys(host).sort(), ['read', 'run']);
    assert.throws(() => host.read('not-issued'), /financial_host_reference/);
    assert.throws(() => launcher.initialize(data), /already_initialized/);
    // Captured data remains stable after every caller-owned byte buffer changes.
    data.registryBytes.fill(0); for (const row of data.packageEntries) row.bytes.fill(0);
    for (const row of [...data.metricArtifacts, ...data.proofArtifacts]) { row.manifestBytes.fill(0); for (const leaf of row.entries) leaf.bytes.fill(0); }
    input.freezeBytes.fill(0); input.tcbArtifact.manifestBytes.fill(0); for (const row of input.tcbArtifact.entries) row.bytes.fill(0);
    const running = host.run(); await assert.rejects(host.run(), /financial_host_lifecycle/);
    const result = await running;
    assert.equal(result.stage, 'validated_dag_results'); assert.equal(result.graph_count, 76);
    assert.equal(result.evidence_refs.length, 76); assert.equal(new Set(result.evidence_refs).size, 76);
    const oracle = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8'));
    for (let i = 0; i < f.order.length; i++) {
        const key = f.order[i]; const split = key.lastIndexOf('#'); const actual = host.read(result.evidence_refs[i]);
        assert.deepEqual(actual.value, oracle.turns[key.slice(0, split)].facts[Number(key.slice(split + 1)) - 1].value, key);
        assert.ok(Object.isFrozen(actual));
    }
    await assert.rejects(host.run(), /financial_host_lifecycle/);
    assert.throws(() => host.read({ reference: result.evidence_refs[0] }), /financial_host_reference/);
    const anotherHost = externalLauncher(f, bootstrap(f)).initialize(clone(f.data));
    assert.throws(() => anotherHost.read(result.evidence_refs[0]), /financial_host_reference/);
    const second = await anotherHost.run(); assert.equal(second.graph_count, 76);
    assert.throws(() => anotherHost.read(result.evidence_refs[0]), /financial_host_reference/);
    assert.throws(() => host.read(second.evidence_refs[0]), /financial_host_reference/);
    assert.equal(second.evidence_refs.some(reference => result.evidence_refs.includes(reference)), false);
    t.diagnostic('captured_private_dag_per_execution=76; independent_executions=2; phases=304; cross_request_refs=rejected; oracle=harness_only; public_parent_receipt_api=absent; synthetic_freeze_only=true');
});

test('N02G:FINANCIAL-HOST-002 external leaf admission and host inputs fail before untrusted code or callbacks', async () => {
    const f = await fixture(); let effects = 0;
    const changed = bootstrap(f); changed.tcbArtifact.entries.find(row => row.path === 'host-bootstrap.js').bytes = Buffer.from('globalThis.__n02gExecuted=true');
    assert.throws(() => externalLauncher(f, changed), /artifact_/); assert.equal(globalThis.__n02gExecuted, undefined);
    const badFreeze = bootstrap(f); badFreeze.freezeBytes[0] ^= 1;
    assert.throws(() => externalLauncher(f, badFreeze), /execution_freeze_hash/);
    const wrongNative = clone(f.freeze); wrongNative.native_runtime.node_binary_sha256 = hash('not-this-runtime');
    assert.throws(() => externalLauncher(f, bootstrap(f, wrongNative)), /native_runtime_binary_mismatch/);
    const loader = externalLauncher(f, bootstrap(f));
    const getter = { ...f.data }; Object.defineProperty(getter, 'registryBytes', { enumerable: true, get() { effects++; return f.data.registryBytes; } });
    assert.throws(() => loader.initialize(getter), /financial_host_input/); assert.equal(effects, 0);
    const fresh = () => externalLauncher(f, bootstrap(f));
    assert.throws(() => fresh().initialize({ ...f.data, verdict: true }), /financial_host_input/);
    const proxy = new Proxy(f.data, { ownKeys() { effects++; return Reflect.ownKeys(f.data); } });
    assert.throws(() => fresh().initialize(proxy), /financial_host_input/); assert.equal(effects, 0);
    const forged = clone(f.data); forged.registryBytes[0] ^= 1;
    assert.throws(() => fresh().initialize(forged), /execution_registry_hash/);
    const missing = clone(f.data); missing.proofArtifacts.pop();
    assert.throws(() => fresh().initialize(missing), /financial_host_artifact_inventory/);
    const duplicate = clone(f.data); duplicate.proofArtifacts[1] = duplicate.proofArtifacts[0];
    assert.throws(() => fresh().initialize(duplicate), /financial_host_artifact_inventory/);
    const wrongCatalog = clone(f.freeze); wrongCatalog.proof_programs[0].program_id = hash('unknown-program');
    wrongCatalog.proof_programs.sort((a, b) => a.program_id < b.program_id ? -1 : 1);
    assert.throws(() => externalLauncher(f, bootstrap(f, wrongCatalog)).initialize(clone(f.data)), /financial_host_proof_inventory/);
    const { nativeRuntimeFileCapability } = require('../../../src/next/provenance/nativeRuntime');
    const capability = nativeRuntimeFileCapability(); assert.deepEqual(Object.keys(capability), ['readFileSync']);
    assert.throws(() => capability.readFileSync('some-other-file'), /native_runtime_path/);
    assert.throws(() => capability.readFileSync(process.execPath, 'utf8'), /native_runtime_path/);
});

test('N02G:FINANCIAL-HOST-003 proof failure never exposes partial results or transferable parent authority', async () => {
    const f = await fixture(); const data = clone(f.data); const freeze = clone(f.freeze);
    const target = f.order.find((key, i) => i > 0 && f.programIds.get(key) !== f.programIds.get(f.order[0]));
    assert.ok(target); // At least one complete primary precedes this failure.
    const programId = f.programIds.get(target); const row = data.proofArtifacts.find(row => row.program_id === programId);
    row.entries[0].bytes = Buffer.from('(function(){return false;})');
    const manifest = JSON.parse(row.manifestBytes); manifest.files[0].sha256 = hash(row.entries[0].bytes);
    row.manifestBytes = Buffer.from(canonicalValue(manifest));
    freeze.proof_programs.find(row => row.program_id === programId).proof_engine_artifact_root = hash(row.manifestBytes);
    const host = externalLauncher(f, bootstrap(f, freeze)).initialize(data);
    await assert.rejects(host.run(), { message: 'financial_host_execution_rejected' });
    assert.throws(() => host.read('any-reference'), /financial_host_reference/);
    await assert.rejects(host.run(), /financial_host_lifecycle/);
});
```

## tests/next/provenance/graphStructure.cases.js

SHA-256 dc3bc495dc695cd9968a75bd65b6da419982fb301f2d664f63e8412efefc2f66; Git blob 986ee75b7f76372fba0101efa9f660c599116828; bytes 8704.

```javascript
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateGraphStructure } = require('../../../src/next/provenance/graphStructure');
const root = path.resolve(__dirname, '../../..');
const prefix = 'docs/contracts/next/provenance-v2/';
const read = name => JSON.parse(fs.readFileSync(path.join(root, prefix + name), 'utf8'));
function fixture() {
    const graphDocument = read('graphs-v2.json');
    return { graphs: graphDocument.graphs,
        claims: JSON.parse(fs.readFileSync(path.join(root, graphDocument.claim_contract.path))).claims,
        materialRegistry: JSON.parse(fs.readFileSync(path.join(root, graphDocument.material_registry.path))),
        operatorRegistry: JSON.parse(fs.readFileSync(path.join(root, graphDocument.operator_registry.path))) };
}
function reject(mutate, pattern) {
    const input = fixture();
    mutate(input.graphs[0], input);
    assert.throws(() => validateGraphStructure(input), pattern);
}

test('N02G:STRUCTURE-001 all 76 graphs resolve without executing evaluators', () => {
    const result = validateGraphStructure(fixture());
    assert.equal(result.graphs, 76);
    assert.equal(result.phases, 152);
    assert.equal(result.stage, 'structure_checked_only');
});

test('N02G:STRUCTURE-002 predicates and obligations cannot disappear or change authority', () => {
    reject(g => g.obligations.pop(), /obligation_inventory/);
    reject(g => g.obligations.push(structuredClone(g.obligations[0])), /duplicate/);
    reject(g => g.obligations[1].predicates.pop(), /predicate_membership/);
    reject(g => { g.predicates[0].atom = 'fingerprint'; }, /predicate_atom/);
    reject(g => { g.predicates[0].op = 'unregistered'; }, /operator_missing/);
    reject(g => g.predicates[0].args.pop(), /operator_arity/);
    reject(g => { g.edges[0].proof_predicates[0] = 'missing'; }, /predicate_missing/);
    reject(g => { g.obligations[0].checks = ['exact_observed_trace']; }, /obligation_checks/);
});

test('N02G:STRUCTURE-003 invalid aliases and scalar traversal cannot hide in trace or arguments', () => {
    reject(g => { g.trace_contract.proof.required_reads[0].segments.push('invented'); }, /path_scalar_traversal/);
    reject(g => { g.trace_contract.proof.required_reads[0].node = 'missing'; }, /node_missing/);
    reject(g => g.trace_contract.proof.required_claim_reads.push({ segments: ['period', 'unknown'] }), /claim_path/);
    reject(g => { g.predicates[0].args[0].node = 'missing'; }, /node_missing/);
    reject(g => { g.predicates[0].args[0] = { field: { node: 'person_a', segments: ['label'] } }; }, /path_non_material/);
    reject(g => g.sets.candidates.push('missing'), /node_missing/);
    reject(g => g.sets.candidates.push(g.sets.candidates[0]), /duplicate/);
    reject(g => { g.predicates[0].args[1] = { literal: { type: 'date', value: 1 } }; }, /literal_type_value/);
});

test('N02G:STRUCTURE-004 candidates partition exactly and remain observed by proof', () => {
    reject(g => g.selections[0].excluded.pop(), /selection_partition/);
    reject(g => { g.sets.selected.push('person_a'); }, /selection_subset/);
    reject(g => { g.selections[0].excluded[0].predicates = ['missing']; }, /predicate_missing/);
    reject(g => g.trace_contract.proof.required_selections.pop(), /trace_selections/);
    reject(g => g.trace_contract.derivation.selected_nodes.pop(), /trace_selected_nodes/);
    reject(g => {
        const node = g.sets.candidates[0];
        g.trace_contract.proof.required_reads = g.trace_contract.proof.required_reads.filter(r => r.node !== node);
    }, /candidate_unobserved/);
    reject(g => g.trace_contract.proof.required_reads.push(structuredClone(g.trace_contract.proof.required_reads[0])), /duplicate/);
});

test('N02G:STRUCTURE-005 structural operations and window references are closed', () => {
    reject(g => { g.trace_contract.proof.required_structural[0].operation = 'iterator'; }, /structural_type/);
    reject(g => { g.predicates[0].args[0] = { period_ref: 'missing' }; }, /window_missing/);
    reject(g => {
        g.windows.month = { kind: 'month', value: { literal: { type: 'month', value: '2042-06' } } };
        g.predicates[0].args[0] = { period_bound: { period: 'month', bound: 'start' } };
    }, /window_bound/);
    reject(g => {
        g.predicates[0].args[0] = { projection: { set: 'family_people',
            selector: { kind: 'card', segments: ['id'] }, as: 'set' } };
    }, /selector_kind/);
    reject(g => { g.predicates[0].args[0] = { ref_set: { field: { node: 'person_a', segments: ['id'] } } }; }, /ref_set_type/);
});

test('N02G:STRUCTURE-006 prebound derivation differs from proof, while validated parents are required in both', () => {
    const input = fixture();
    const sourceGraph = input.graphs.find(g => g.fact_key === 'S-16#1#1');
    assert.equal(sourceGraph.trace_contract.derivation.required_nodes.length, 1);
    assert.equal(sourceGraph.sets.candidates.length, 4);
    assert.equal(validateGraphStructure(input).graphs, 76);
    for (const phase of ['derivation', 'proof']) {
        const f = fixture();
        const derived = f.graphs.find(g => Object.values(g.nodes).some(n => n.binding === 'validated_parent'));
        const alias = Object.keys(derived.nodes).find(key => derived.nodes[key].binding === 'validated_parent');
        derived.trace_contract[phase].required_reads = derived.trace_contract[phase].required_reads.filter(r => r.node !== alias);
        assert.throws(() => validateGraphStructure(f), /parent_unobserved/);
    }
});

test('N02G:STRUCTURE-007 phase selection follows operand bindings, never fact keys or observed output', () => {
    const input = fixture();
    const prebound = [];
    for (const graph of input.graphs) {
        const claim = input.claims.find(c => c.fact_key === graph.fact_key);
        const bindings = Object.values(claim.operand_bindings);
        const derivation = graph.selections.filter(s => bindings.some(b => b.kind === 'node_set'
            && JSON.stringify(b.aliases) === JSON.stringify(graph.sets[s.candidate_set])));
        if (derivation.length !== graph.selections.length) {
            prebound.push(graph.fact_key);
            assert.deepEqual(graph.trace_contract.derivation.required_selections, derivation.map(({ candidate_set, selected_set }) => ({ candidate_set, selected_set })));
            assert.deepEqual(graph.trace_contract.derivation.selected_nodes, [...new Set(derivation.flatMap(s => graph.sets[s.selected_set]))]);
        }
    }
    assert.deepEqual(prebound, ['S-16#1#1', 'M-04#1#1', 'M-04#1#2', 'M-05#1#2', 'M-05#1#3', 'M-05#1#4']);
    assert.equal(validateGraphStructure(input).graphs, 76);
    for (const key of prebound) {
        const f = structuredClone(input), graph = f.graphs.find(g => g.fact_key === key);
        graph.trace_contract.derivation.required_selections = structuredClone(graph.trace_contract.proof.required_selections);
        graph.trace_contract.derivation.selected_nodes = structuredClone(graph.trace_contract.proof.selected_nodes);
        assert.throws(() => validateGraphStructure(f), /trace_selections/);
    }
    const missing = structuredClone(input), graph = missing.graphs[0];
    graph.trace_contract.derivation.required_selections = [];
    graph.trace_contract.derivation.selected_nodes = [];
    assert.throws(() => validateGraphStructure(missing), /trace_selections/);
    const unbound = structuredClone(input);
    delete unbound.claims.find(c => c.fact_key === prebound[0]).operand_bindings.source;
    assert.throws(() => validateGraphStructure(unbound), /selection_binding/);
    const ambiguous = structuredClone(input);
    const firstClaim = ambiguous.claims.find(c => c.fact_key === ambiguous.graphs[0].fact_key);
    firstClaim.operand_bindings.duplicate = structuredClone(Object.values(firstClaim.operand_bindings).find(b => b.kind === 'node_set'));
    assert.throws(() => validateGraphStructure(ambiguous), /selection_binding/);
    const consumed = structuredClone(input), direct = consumed.graphs.find(g => g.fact_key === prebound[0]);
    direct.trace_contract.derivation.required_reads = [];
    assert.throws(() => validateGraphStructure(consumed), /prebound_unobserved/);
});

test('N02G:STRUCTURE-008 every active phase selection must cover excluded candidates too', () => {
    for (const phase of ['derivation', 'proof']) {
        reject(g => {
            const alias = g.selections[0].excluded[0].node;
            g.trace_contract[phase].required_reads = g.trace_contract[phase].required_reads.filter(r => r.node !== alias);
        }, /candidate_unobserved/);
    }
});
```

## tests/next/provenance/pathInventoryV2.cases.js

SHA-256 9ed3ab51875a6943448a09cfb3e6c3dc1bf4c92fff96fcccdca5e193e364f93f; Git blob 6bf86815e837202922bec0cd9dbefc19fbfbc131; bytes 14109.

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const prefix = 'docs/contracts/next/provenance-v2/';
let cache;
async function fixture() {
    if (cache) return cache;
    const { loadLocalAuthoringPackage } = await import('../../../scripts/agent/executeNextDomainInvariantMatrix.mjs');
    const { buildAdmittedSchemaValidators } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const { compileAuthoringIR } = require('../../../src/next/provenance/graphCompiler');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const packageReceipt = loadLocalAuthoringPackage();
    const documents = new Map(admittedDocuments(packageReceipt).map(row => [row.path, row.value]));
    const ir = compileAuthoringIR(packageReceipt, buildAdmittedSchemaValidators(packageReceipt).validators);
    const corpus = documents.get(prefix + 'graphs-v2.json');
    cache = { packageReceipt, ir, documents, corpus };
    return cache;
}

test('N02G:PATH-V2-001 schema sites preserve recursive locations and literals never become references', () => {
    const { enumeratePathSites } = require('../../../src/next/provenance/pathMutationInventory');
    const schema = JSON.parse(fs.readFileSync(path.join(root, prefix + 'provenance-graph.schema.json'), 'utf8'));
    assert.deepEqual(enumeratePathSites(schema, { literal: { type: 'id', value: 'source' } }, 0), []);
    const value = { template: { id: 'outer', version: 1, hash: 'sha256:' + '0'.repeat(64) }, bindings: {
        nested: { template: { id: 'inner', version: 1, hash: 'sha256:' + '0'.repeat(64) }, bindings: {
            a: { selector: { kind: 'event', segments: ['date'] } },
            b: { selector: { kind: 'event', segments: ['date'] } }
        } }
    } };
    const sites = enumeratePathSites(schema, value, 1);
    assert.equal(sites.filter(row => row.class === 'path').length, 2);
    assert.equal(sites.filter(row => row.class === 'reference').length, 2);
    assert.equal(new Set(sites.map(row => JSON.stringify(row.site_path))).size, 4);
    assert.throws(() => enumeratePathSites(schema, { invented: 'value' }, 0));
    assert.throws(() => enumeratePathSites(schema, { partial_policy: value.template }, 0), /namespace/);
    let effects = 0;
    const active = {}; Object.defineProperty(active, 'literal', { enumerable: true, get() { effects++; } });
    assert.throws(() => enumeratePathSites(schema, active, 0));
    assert.throws(() => enumeratePathSites(schema, new Proxy({}, { ownKeys() { effects++; return []; } }), 0));
    assert.equal(effects, 0);
});

test('N02G:PATH-V2-002 candidate inventory agrees with all authored/IR sites without activating or granting credit', async () => {
    const { enumeratePathInventoryCandidate } = require('../../../src/next/provenance/pathMutationInventory');
    const { packageReceipt, ir } = await fixture();
    const result = enumeratePathInventoryCandidate({ packageReceipt, ir });
    assert.equal(result.activated, false);
    assert.equal(result.mutation_acceptance, false);
    assert.equal(result.executed, 0);
    assert.equal(result.matched, 0);
    assert.equal(result.requirements.length, result.sites.length + result.applicability.filter(row => row.path_semantic_required).length);
    assert.equal(new Set(result.requirements.map(row => row.mutation_id)).size, result.requirements.length);
    assert.ok(result.applicability.some(row => row.path_sites === 0));
    assert.ok(result.requirements.every(row => row.realization === 'UNSATISFIED_MUTATION_WITNESS'));
    for (const mutate of [copy => copy.graphs[0].predicates.pop(),
        copy => copy.graphs[0].predicates[0].op = 'not_eq',
        copy => copy.graphs[0].predicates[0].operands[0].expression = { kind: 'node_ref', alias: 'forged' },
        copy => copy.graphs[0].predicates[0].operands[0].type = { form: 'scalar', type: 'forged' },
        copy => copy.authority_refs.pop()]) {
        const broken = structuredClone(ir); mutate(broken);
        assert.throws(() => enumeratePathInventoryCandidate({ packageReceipt, ir: broken }));
    }
});

test('N02G:PATH-V2-003 migration is equal to the frozen v1 set and rejects same-count replacement, forged targets and orphans', async () => {
    const { enumeratePathInventoryCandidate, materializePathMigration } = require('../../../src/next/provenance/pathMutationInventory');
    const { packageReceipt, ir } = await fixture();
    const candidate = enumeratePathInventoryCandidate({ packageReceipt, ir });
    const file = path.join(root, 'docs/audit-evidence/n02g-causal-authoring-profile/path-inventory-v1-frozen.json');
    const bytes = fs.readFileSync(file);
    const authority = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
    const frozen = JSON.parse(bytes);
    const input = { packageReceipt, ir, frozenSource: bytes.toString('utf8'), expectedFrozenHash: authority,
        frozenAuthorshipSource: fs.readFileSync(path.join(root, 'docs/audit-evidence/n02g-causal-authoring-profile/path-authorship-v1-frozen.json'), 'utf8') };
    const result = materializePathMigration(input);
    assert.equal(result.rows.length, frozen.requirements.length);
    assert.deepEqual(result.rows.map(row => row.old_id).sort(), frozen.requirements.map(row => row.mutation_id).sort());
    assert.equal(result.activated, false);
    assert.equal(result.executed, 0);
    assert.equal(result.matched, 0);
    assert.equal(result.introduced_sites.length, 0);
    const newIds = new Set(candidate.requirements.map(row => row.mutation_id));
    assert.ok(result.rows.every(row => row.new_ids.every(id => newIds.has(id))));
    for (const mutate of [copy => copy.requirements[0].mutation_id = 'sha256:' + 'f'.repeat(64),
        copy => copy.requirements[0].target.operand_index += 1,
        copy => copy.requirements[0] = copy.requirements[1], copy => copy.requirements.pop()]) {
        const broken = structuredClone(frozen); mutate(broken);
        const source = JSON.stringify(broken);
        assert.throws(() => materializePathMigration({ ...input, frozenSource: source,
            expectedFrozenHash: 'sha256:' + createHash('sha256').update(source).digest('hex') }));
    }
    assert.throws(() => materializePathMigration({ ...input, expectedFrozenHash: 'sha256:' + 'f'.repeat(64) }));
});

test('N02G:PATH-V2-004 persisted migration cannot forge credit, drop rows or redirect mapped IDs', async () => {
    const { materializePathMigration, verifyMaterializedPathMigration, FROZEN_V1_HASH } = require('../../../src/next/provenance/pathMutationInventory');
    const { packageReceipt, ir } = await fixture();
    const input = { packageReceipt, ir, expectedFrozenHash: FROZEN_V1_HASH,
        frozenSource: fs.readFileSync(path.join(root, 'docs/audit-evidence/n02g-causal-authoring-profile/path-inventory-v1-frozen.json'), 'utf8'),
        frozenAuthorshipSource: fs.readFileSync(path.join(root, 'docs/audit-evidence/n02g-causal-authoring-profile/path-authorship-v1-frozen.json'), 'utf8') };
    const table = materializePathMigration(input);
    const check = value => verifyMaterializedPathMigration({ ...input, migrationSource: JSON.stringify(value) });
    assert.equal(check(table).verified, true);
    for (const mutate of [copy => copy.rows.pop(), copy => copy.rows[0].execution_credit = 1,
        copy => copy.rows.find(row => row.new_ids.length).new_ids[0] = 'sha256:' + 'f'.repeat(64)]) {
        const broken = structuredClone(table); mutate(broken); assert.throws(() => check(broken), /persisted_migration/);
    }
});

test('N02G:PATH-V2-005 each admission site changes exactly one authored leaf and cloned receipts have no authority', async () => {
    const { enumeratePathInventoryCandidate, materializePathAdmissionCandidate, readPathAdmissionCandidate } = require('../../../src/next/provenance/pathMutationInventory');
    const { packageReceipt, ir, corpus } = await fixture();
    const inventoryCandidate = enumeratePathInventoryCandidate({ packageReceipt, ir });
    const representatives = new Map();
    for (const row of inventoryCandidate.requirements.filter(row => row.family !== 'predicate_path_semantic')) {
        const key = JSON.stringify([row.family, row.target.definition, row.target.namespace,
            row.target.site_path.slice(2, -1)]);
        if (!representatives.has(key)) representatives.set(key, row);
    }
    assert.ok(representatives.size > 8);
    for (const row of representatives.values()) {
        const generated = materializePathAdmissionCandidate({ inventoryCandidate, mutation_id: row.mutation_id });
        const expected = structuredClone(corpus.graphs.find(graph => graph.fact_key === row.target.fact_key));
        let slot = expected.predicates.find(predicate => predicate.id === row.target.predicate_id);
        for (const token of row.target.site_path.slice(0, -1)) slot = slot[token];
        slot[row.target.site_path.at(-1)] = generated.patch.after;
        assert.deepEqual(generated.graph, expected);
        assert.equal(generated.dp_execution, false); assert.equal(generated.semantic_mutation_credit, 0);
        assert.ok(readPathAdmissionCandidate(generated));
        assert.equal(readPathAdmissionCandidate(structuredClone(generated)), null);
        assert.throws(() => materializePathAdmissionCandidate({ inventoryCandidate: structuredClone(inventoryCandidate), mutation_id: row.mutation_id }));
    }
    const semantic = inventoryCandidate.requirements.find(row => row.family === 'predicate_path_semantic');
    assert.throws(() => materializePathAdmissionCandidate({ inventoryCandidate, mutation_id: semantic.mutation_id }));
});

test('N02G:PATH-V2-006 native controls reject representative namespaces and exact sites without semantic credit', async () => {
    const { enumeratePathInventoryCandidate, materializePathAdmissionCandidate } = require('../../../src/next/provenance/pathMutationInventory');
    const { createPathAdmissionValidation } = await import('../../../scripts/agent/executePathAdmissionV2.mjs');
    const { packageReceipt, ir } = await fixture();
    const inventoryCandidate = enumeratePathInventoryCandidate({ packageReceipt, ir });
    const qualify = createPathAdmissionValidation(packageReceipt);
    const samples = new Map();
    for (const requirement of inventoryCandidate.requirements.filter(row => row.family !== 'predicate_path_semantic')) {
        const key = JSON.stringify([requirement.family, requirement.target.definition, requirement.target.namespace,
            requirement.target.site_path.slice(2, -1)]);
        if (!samples.has(key)) samples.set(key, requirement);
    }
    for (const row of samples.values()) {
        const generated = materializePathAdmissionCandidate({ inventoryCandidate, mutation_id: row.mutation_id });
        const result = qualify(generated);
        assert.equal(result.matched, true, JSON.stringify(result));
        assert.equal(result.restore_admitted, true);
        assert.equal(result.dp_execution, false); assert.equal(result.semantic_mutation_credit, 0);
        assert.notDeepEqual(result.diagnostic, { ...result.expected_diagnostic, operand_index: result.expected_diagnostic.operand_index + 1 });
        assert.throws(() => qualify(structuredClone(generated)), /candidate_authority/);
    }
});

test('N02G:PATH-V2-007 new authored predicate adds v2 requirements and introductions without rewriting frozen v1', async () => {
    const { enumeratePathInventoryCandidate, materializePathMigration, FROZEN_V1_HASH } = require('../../../src/next/provenance/pathMutationInventory');
    const { admittedDocuments, admitPackage } = require('../../../src/next/provenance/packageContract');
    const { packageReceipt, ir, corpus } = await fixture();
    const baseline = enumeratePathInventoryCandidate({ packageReceipt, ir });
    const chosen = baseline.applicability.find(row => row.path_semantic_required);
    const graph = corpus.graphs.find(row => row.fact_key === chosen.fact_key);
    const predicate = graph.predicates.find(row => row.id === chosen.predicate_id);
    const grown = structuredClone(corpus);
    grown.graphs.find(row => row.fact_key === chosen.fact_key).predicates.push({ ...structuredClone(predicate), id: 'v2_growth_probe' });
    const entries = admittedDocuments(packageReceipt).map(row => ({ path: row.path, bytes: Buffer.from(
        row.path === prefix + 'graphs-v2.json' ? JSON.stringify(grown) : fs.readFileSync(path.join(root, row.path), 'utf8').replaceAll('\r\n', '\n')) }));
    const package2 = admitPackage({ entries, authority: entries.map(row => ({ path: row.path,
        sha256: 'sha256:' + createHash('sha256').update(row.bytes).digest('hex') })) });
    const ir2 = structuredClone(ir);
    ir2.authority_refs = admittedDocuments(package2).map(({ path, sha256 }) => ({ path, sha256 }));
    const lowered = ir2.graphs.find(row => row.fact_key === chosen.fact_key);
    lowered.predicates.push({ ...structuredClone(lowered.predicates.find(row => row.id === chosen.predicate_id)), id: 'v2_growth_probe' });
    const candidate = enumeratePathInventoryCandidate({ packageReceipt: package2, ir: ir2 });
    assert.ok(candidate.requirements.length > baseline.requirements.length);
    const evidence = path.join(root, 'docs/audit-evidence/n02g-causal-authoring-profile');
    const table = materializePathMigration({ packageReceipt: package2, ir: ir2, expectedFrozenHash: FROZEN_V1_HASH,
        frozenSource: fs.readFileSync(path.join(evidence, 'path-inventory-v1-frozen.json'), 'utf8'),
        frozenAuthorshipSource: fs.readFileSync(path.join(evidence, 'path-authorship-v1-frozen.json'), 'utf8') });
    assert.equal(table.rows.length, 45988);
    assert.ok(table.introduced_sites.length > 0);
    assert.ok(table.introduced_requirements.some(row => row.family === 'predicate_path_semantic'));
    assert.equal(table.executed, 0); assert.equal(table.matched, 0);
});
```

## tests/next/provenance/pathQualificationV3.cases.js

SHA-256 94e7d6da406e7cc26cd817fe7bdd1276bad0498e9fca2f72dbb3b43e4d81988e; Git blob c548adcafc652023498bbc958570fba5bfffb606; bytes 329476.

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('N02G:PATH-V3-088 reusable external rule scope seals complete A W before compile and retains fresh identity without audit or execution credit', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const fs = require('node:fs'), path = require('node:path');
    const hash = value => 'sha256:' + require('node:crypto').createHash('sha256').update(value).digest('hex');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input), phaseProfile = await phaseFixture();
    const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
        && row.target.predicate_id === 'link_2_refund_sign');
    const plan = api.preparePathQualificationWitnessPreselection({ preparation, rowIndex });
    // Synthetic constructor scope, generated BEFORE compile from genuine
    // authorial/reference inputs. It is not independent review or authority
    // for an operational invocation, and is never used to run guest D/P.
    const shadow = api.materializePathQualificationLocator({ preparation, rowIndex,
        siteIndex: plan.selected.site_index, locatorIndex: plan.selected.locator_index });
    const expectation = contract.sealPathCandidateProgramExpectation({
        authorship: api.preparePathCandidateProgramAuthorship({ candidate: shadow, phaseProfile }) });
    const capture = compiler.capturePathQualificationCompiler();
    const normalize = entries => entries.map(entry => {
        const { invocation_id, ...stable } = entry;
        if (stable.reference !== null) { const { invocation_id: ignored, ...reference } = stable.reference; stable.reference = reference; }
        return stable;
    });
    const stableEntries = normalize(plan.entries);
    const stablePartition = { ...plan.conditional_domain_partition, entries: plan.conditional_domain_partition.entries
        .map(member => ({ ...member, reference_sha256: stableEntries[member.entry_index].reference === null ? null
            : hash(canonicalValue(stableEntries[member.entry_index].reference)) })) };
    const perSite = plan.admission_foundation.sites.map(site => {
        const members = stablePartition.entries.filter(member => member.site_index === site.site_index);
        return { site_index: site.site_index, L: members.map(member => member.locator_index),
            A: members.filter(member => ['conditional_witness', 'conditional_non_witness'].includes(member.classification))
                .map(member => member.locator_index),
            W: members.filter(member => member.classification === 'conditional_witness').map(member => member.locator_index),
            excluded: members.filter(member => member.classification === 'necessary_exclusion_pending_native_barrier')
                .map(member => member.locator_index) };
    });
    const producers = ['src/next/provenance/pathQualificationV3.js', 'src/next/provenance/pathLocatorDomainV3.js',
        'src/next/provenance/pathMutationInventory.js', 'src/next/provenance/pathSemanticReference.js',
        'scripts/agent/capturePathQualificationCompiler.mjs', 'scripts/agent/pathProofProgramContract.mjs',
        'scripts/agent/pathExecutableClosureContract.mjs', 'scripts/agent/pathCapabilityEffectContract.mjs',
        'scripts/agent/pathReceiverOriginContract.mjs'];
    const snapshotReference = { ...expectation.normal_admission_checker_reference };
    for (const key of ['sources', 'schema_reference_sources']) snapshotReference[key] = snapshotReference[key].map(row => {
        const { source, ...metadata } = row;
        const source_chunks = Array.from({ length: Math.ceil(source.length / 65536) },
            (_, index) => source.slice(index * 65536, (index + 1) * 65536));
        assert.equal(source_chunks.join(''), source);
        assert.equal(hash(source_chunks.join('')), row.sha256);
        return { ...metadata, source_chunks };
    });
    const core = { method_authority: plan.method_authority, target_id: plan.target_id, target: shadow.target,
        baseline_package: plan.baseline_package, phase_profile_sha256: expectation.profile_sha256,
        compiler: { artifact_root: capture.artifact_root, host_sources_sha256: capture.normal_compiler_source_bindings_sha256,
            child_sources_sha256: capture.normal_child_source_bindings_sha256 },
        authority_builder_sources: producers.map(relative => ({ path: relative,
            sha256: hash(fs.readFileSync(path.resolve(__dirname, '../../../', relative))) })),
        normal_rule_reference: snapshotReference, entries: stableEntries,
        conditional_partition: stablePartition, per_site_domains: perSite,
        native_control_plans: { unknown: plan.site_admission_control_plan, selection: plan.selection_admission_control_plan },
        scope: 'finite_target_normal_admission_and_independent_witness_not_equivalence',
        qualified: false, semantic_mutation_credit: 0, dp_execution: false, financial_acceptance: false };
    const snapshot = { format: 'financasbot.path-normal-rule-review-snapshot', version: 1,
        stage: 'path_v3_normal_rule_review_snapshot_only', core };
    // Audit receipt/commit attribution stays OUTSIDE immutable snapshot bytes:
    // otherwise adding the later verdict would change what was audited.
    assert.equal(Object.hasOwn(snapshot, 'receipt'), false);
    const snapshotSource = canonicalValue(snapshot);
    assert.ok(snapshotSource.length <= 1048576);
    const secondPreparation = api.preparePathQualificationInventory(input);
    const fresh = api.preparePathQualificationWitnessPreselection({ preparation: secondPreparation, rowIndex });
    assert.notEqual(fresh.selected.invocation_id, plan.selected.invocation_id);
    assert.deepEqual(normalize(fresh.entries), stableEntries, 'review scope accidentally pins the previous invocation');
    const result = compiler.compilePathQualificationWitnessPreselection({ capture, plan, phaseProfile,
        normalRuleReview: { snapshotSource, expectedReviewHash: hash(snapshotSource) } });
    const sealed = result.witness_preselection.review_bound_domain_seal;
    assert.ok(sealed);
    assert.equal(sealed.sealed_before_any_captured_compile, true);
    assert.equal(sealed.constructor_authenticates_review, false);
    assert.deepEqual(sealed.per_site_domains, perSite);
    assert.equal(sealed.invocation_id, plan.selected.invocation_id);
    for (const key of ['admitted_domain_complete', 'witness_domain_complete', 'first_witness_proved', 'normal_admission_verified'])
        assert.equal(result.witness_preselection[key], true);
    assert.equal(plan.admitted_domain_complete, false, 'original unreviewed plan mutated after M');
    assert.equal(result.witness_execution_prerequisites.execution_permitted, false);
    assert.equal(result.qualified, false); assert.equal(result.semantic_mutation_credit, 0);
    assert.equal(result.validation_tcb_complete, false); assert.equal(result.handle_attempts, 0);
    assert.equal(result.witness_site_admission_controls.normal_admission_premise_evidence.independent_reviewed_rule_basis_verified, false);
    const transport = compiler.preparePathQualificationExecutionTransport({ result });
    const ticket = JSON.parse(transport.ticketSource), payload = JSON.parse(transport.payloadSource);
    assert.deepEqual(payload.normal_admission_basis.native_controls.review_bound_domain_seal, sealed);
    assert.equal(ticket.prerequisites.first_witness_proved, true);
    // Admit only a prepared INTERNAL host using synthetic TEST pins. Do not
    // call run: real code+reference+TCB review and fresh operational checks are
    // not acquired by this constructor test or by these fabricated receipts.
    const built = (await import('../../../scripts/agent/buildNextValidationTcb.mjs')).buildCapturedValidationTools();
    const roots = new Map(payload.worlds.map(world => [world.proof_program_id, hash(world.proof_artifact.manifest)]));
    const freezeBytes = Buffer.from(canonicalValue({ schema_version: 1, freeze_id: 'provenance_execution', freeze_version: 1,
        stage: 'execution', metric_registry_hash: hash(payload.worlds[0].registry_source), validation_tcb_root: built.artifact_root,
        child_capsule_root: built.child.artifact_root, native_runtime: { platform: process.platform, arch: process.arch,
            node_version: process.version, node_binary_sha256: 'sha256:' + '0'.repeat(64) }, package_authority: plan.baseline_package,
        proof_programs: [...roots].sort(([a], [b]) => a.localeCompare(b))
            .map(([program_id, proof_engine_artifact_root]) => ({ program_id, proof_engine_artifact_root })) }));
    let handles = 0;
    const launch = require('node:vm').runInThisContext(`(function(require){return ${built.launcherSource}\n})`)(name => {
        if (name === 'node:fs') return { readFileSync() { handles++; throw Error('no handles'); } };
        if (name === 'node:child_process') return { spawn() { handles++; throw Error('no child'); }, fork() { handles++; throw Error('no child'); } };
        return require(name);
    });
    const bootstrap = { freezeBytes, expectedFreezeHash: hash(freezeBytes), tcbArtifact: { manifestBytes: Buffer.from(built.manifest),
        entries: built.entries.map(row => ({ path: row.path, bytes: Buffer.from(row.source) })) } };
    const load = (source, request) => launch({ ...bootstrap, qualification: { ticketSource: source, payloadSource: request,
        expectedTicketCommitment: hash(canonicalValue({ source })) } });
    const loaded = load(transport.ticketSource, transport.payloadSource), host = loaded.initializePathQualification();
    assert.equal(host.candidate_id, result.candidate_id); assert.equal(host.execution_permitted, false);
    assert.equal(host.qualified, false); assert.equal(handles, 0);
    assert.throws(() => loaded.initializePathQualification(), /already_initialized/);
    for (const [label, mutate] of [
        ['old-invocation', basis => { basis.native_controls.review_bound_domain_seal.invocation_id = fresh.selected.invocation_id; }],
        ['domain', basis => { basis.native_controls.review_bound_domain_seal.per_site_domains[0].A.pop(); }],
        ['source-body', basis => { basis.native_controls.review_bound_domain_seal.snapshot_core.normal_rule_reference.sources[0].source_chunks[0] += '\n// foreign'; }],
        ['first-witness', basis => { basis.native_controls.review_bound_domain_seal.selected.entry_index++; }],
        ['no-review', basis => { basis.native_controls.normal_rule_review = null; basis.native_controls.review_bound_domain_seal = null; }]
    ]) {
        const changed = structuredClone(payload); mutate(changed.normal_admission_basis);
        const request = canonicalValue(changed), source = canonicalValue({ ...ticket,
            payload_commitment: hash(canonicalValue({ source: request })),
            normal_admission_basis_commitment: hash(canonicalValue({ source: canonicalValue(changed.normal_admission_basis) })) });
        assert.throws(() => load(source, request).initializePathQualification(), /normal_admission_basis_relation/, label);
        assert.equal(handles, 0);
    }
    assert.throws(() => compiler.compilePathQualificationWitnessPreselection({ capture, plan, phaseProfile,
        normalRuleReview: { snapshotSource, expectedReviewHash: hash(snapshotSource) } }), /origin_or_replay/);
    // Rewrite the WHOLE input snapshot and its external TEST pin. A checksum
    // disagreement must not substitute for the genuine source/reference join.
    const foreign = structuredClone(snapshot), sourceRow = foreign.core.normal_rule_reference.sources[0];
    sourceRow.source_chunks[0] = (sourceRow.source_chunks[0][0] === 'x' ? 'y' : 'x') + sourceRow.source_chunks[0].slice(1);
    sourceRow.sha256 = hash(sourceRow.source_chunks.join(''));
    const foreignSource = canonicalValue(foreign), freshCapture = compiler.capturePathQualificationCompiler();
    let error;
    try { compiler.compilePathQualificationWitnessPreselection({ capture: freshCapture, plan: fresh, phaseProfile,
        normalRuleReview: { snapshotSource: foreignSource, expectedReviewHash: hash(foreignSource) } }); }
    catch (value) { error = value; }
    assert.match(error?.message ?? '', /rule_review_reference_binding/);
    const rejected = compiler.readPathQualificationCompilerEvidence(error);
    assert.equal(rejected.normal_compile_path_entered, false); assert.equal(rejected.handle_attempts, 0);
    assert.equal(rejected.qualified, false);
    assert.throws(() => compiler.compilePathQualificationWitnessPreselection({ capture: freshCapture, plan: fresh, phaseProfile }), /poisoned/);
    console.log(JSON.stringify({ reviewed_scope_constructor_only: true, snapshot_bytes: Buffer.byteLength(snapshotSource),
        sites: perSite.length, admitted_members: perSite.reduce((sum, site) => sum + site.A.length, 0),
        witnesses: perSite.reduce((sum, site) => sum + site.W.length, 0), native_handles: handles, qualified: false, credit: 0 }));
});

test('N02G:PATH-V3-087 trusted external rule review is a closed byte transport and never raw approval flags or active data', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const input = await fixture(), phaseProfile = await phaseFixture();
    const hash = source => 'sha256:' + require('node:crypto').createHash('sha256').update(source).digest('hex');
    let effects = 0;
    const active = { expectedReviewHash: hash('{}') };
    Object.defineProperty(active, 'snapshotSource', { enumerable: true, get() { effects++; return '{}'; } });
    const proxy = new Proxy({}, { get() { effects++; throw new Error('active'); },
        ownKeys() { effects++; throw new Error('active'); } });
    for (const review of [true, { approved: true }, active, proxy,
        { snapshotSource: '{}', expectedReviewHash: hash('foreign') },
        { snapshotSource: '{}', expectedReviewHash: hash('{}') }]) {
        const preparation = api.preparePathQualificationInventory(input);
        const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
            && row.target.predicate_id === 'link_2_refund_sign');
        const plan = api.preparePathQualificationWitnessPreselection({ preparation, rowIndex });
        const capture = compiler.capturePathQualificationCompiler();
        let error;
        try { compiler.compilePathQualificationWitnessPreselection({ capture, plan, phaseProfile, normalRuleReview: review }); }
        catch (value) { error = value; }
        assert.match(error?.message ?? '', /rule_review_(packet|pin|snapshot)/);
        const failure = compiler.readPathQualificationCompilerEvidence(error);
        assert.equal(failure.normal_compile_path_entered, false);
        assert.equal(failure.handle_attempts, 0);
        assert.equal(failure.qualified, false);
        assert.throws(() => compiler.compilePathQualificationWitnessPreselection({ capture, plan, phaseProfile }), /poisoned/);
    }
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-086 finite conditional L A W partition binds every rule and independent reference before M and cannot select an uncovered discriminant', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const sha = value => 'sha256:' + require('node:crypto').createHash('sha256').update(canonicalValue(value)).digest('hex');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
        && row.target.predicate_id === 'link_2_refund_sign');
    const plan = api.preparePathQualificationWitnessPreselection({ preparation, rowIndex });
    const partition = plan.conditional_domain_partition;
    assert.ok(partition, 'missing pre-M conditional L A W partition');
    assert.equal(plan.conditional_domain_partition_sha256, sha(partition));
    assert.equal(partition.domain_sha256, plan.domain_sha256);
    assert.equal(partition.normal_rule_composition_sha256,
        sha(plan.admission_foundation.admission_foundation.normal_rule_composition));
    assert.equal(partition.entries.length, plan.entries.length);
    assert.equal(partition.conditional_admission_partition_complete, true);
    assert.equal(partition.conditional_witness_partition_complete,
        partition.entries.every(entry => !entry.classification.startsWith('blocked_')));
    for (const member of partition.entries) {
        const entry = plan.entries[member.entry_index];
        assert.equal(member.site_index, entry.site_index);
        assert.equal(member.locator_index, entry.locator_index);
        assert.equal(member.locator_sha256, sha(entry.locator));
        assert.equal(member.reference_sha256, entry.reference ? sha(entry.reference) : null);
        if (member.classification === 'necessary_exclusion_pending_native_barrier') {
            assert.equal(entry.admission, 'necessary_exclusion_not_native_control');
            continue;
        }
        assert.equal(member.conditional_rule_preservation_verified, true);
        const basis = plan.admission_foundation.admission_foundation.normal_rule_composition
            .sites[member.site_index].locators[member.locator_index];
        assert.equal(member.normal_rule_basis_sha256, sha(basis));
        const available = entry.reference.available && entry.reference.baseline_satisfied === true
            && typeof entry.reference.mutant_satisfied === 'boolean';
        assert.equal(member.classification, !available ? 'blocked_semantic_reference'
            : entry.reference.discriminating ? 'conditional_witness' : 'conditional_non_witness');
    }
    const first = partition.entries.find(entry => entry.classification === 'conditional_witness');
    assert.ok(first);
    assert.equal(partition.first_conditional_witness_entry_index, first.entry_index);
    assert.equal(plan.selected.entry_index, first.entry_index);
    assert.ok(Object.values(partition.required_premises).every(value => value === false));
    for (const field of ['admitted_domain_complete', 'witness_domain_complete', 'first_witness_proved', 'compiler_result_used', 'qualified', 'dp_execution'])
        assert.equal(partition[field], false);
    assert.equal(partition.semantic_mutation_credit, 0);
    const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
    const file = path.resolve(__dirname, '../../../src/next/provenance/pathQualificationV3.js');
    const isolated = new Module(file); isolated.filename = file;
    isolated.paths = Module._nodeModulePaths(path.dirname(file));
    isolated._compile(fs.readFileSync(file, 'utf8') + `
        module.exports.testWitnessReadGap = (input, rowIndex) => {
            const original = projectAdmissionRuleDependencyFrames, saved = require.cache[__filename];
            projectAdmissionRuleDependencyFrames = (...args) => { const frames = original(...args); frames.pop(); return frames; };
            require.cache[__filename] = module;
            try { return preparePathQualificationWitnessPreselection({ preparation: preparePathQualificationInventory(input), rowIndex }); }
            finally { projectAdmissionRuleDependencyFrames = original; require.cache[__filename] = saved; }
        };`, file);
    const blocked = isolated.exports.testWitnessReadGap(input, rowIndex);
    assert.ok(blocked.entries.some(entry => entry.reference?.discriminating === true));
    assert.equal(blocked.selected, null);
    assert.equal(blocked.conditional_domain_partition.conditional_admission_partition_complete, false);
    assert.ok(blocked.conditional_domain_partition.entries.every(entry => entry.classification === 'blocked_normal_rule_coverage'));
    assert.throws(() => isolated.exports.takePathQualificationWitnessPreselection({ plan: blocked }), /missing_candidate/);
    assert.throws(() => api.takePathQualificationWitnessPreselection({ plan: structuredClone(plan) }));
    console.log(JSON.stringify({ conditional_partition: { entries: partition.entries.length,
        classifications: partition.entries.reduce((counts, entry) => ({ ...counts, [entry.classification]: (counts[entry.classification] || 0) + 1 }), {}),
        conditional_admission_complete: partition.conditional_admission_partition_complete,
        conditional_witness_complete: partition.conditional_witness_partition_complete,
        admitted: false, qualified: false, credit: 0 } }));
});

test('N02G:PATH-V3-085 necessary selection controls do not recompute full twelve rule admission foundation while full admission keeps it', async () => {
    const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
    const file = path.resolve(__dirname, '../../../src/next/provenance/pathQualificationV3.js');
    const isolated = new Module(file); isolated.filename = file;
    isolated.paths = Module._nodeModulePaths(path.dirname(file));
    isolated._compile(fs.readFileSync(file, 'utf8') + `
        module.exports.testSelectionProjection = input => {
            const original = projectAdmissionFoundation; let calls = 0;
            projectAdmissionFoundation = (...args) => { calls++; return original(...args); };
            try {
                const preparation = preparePathQualificationInventory(input);
                const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
                    && row.target.predicate_id === 'link_2_refund_sign');
                const plan = preparePathSelectionAdmissionControls({ preparation, rowIndex });
                const selectionCalls = calls;
                const domain = preparePathQualificationAdmissionDomain({ preparation, rowIndex });
                return { preparation, rowIndex, plan, domain, selectionCalls, fullCalls: calls };
            } finally { projectAdmissionFoundation = original; }
        };`, file);
    const observed = isolated.exports.testSelectionProjection(await fixture());
    assert.equal(observed.selectionCalls, 0, 'necessary selection controls redundantly project full admission foundation');
    assert.equal(observed.fullCalls, 1);
    const { plan, domain, preparation, rowIndex } = observed;
    assert.equal(plan.domain_sha256, domain.domain_sha256);
    assert.equal(plan.admitted_domain_complete, domain.admitted_domain_complete);
    assert.deepEqual(plan.controls.map(control => ({ site_index: control.site_index, locator_index: control.locator_index,
        rule: control.rule, instances: control.instances, unchanged_authorship_sha256: control.unchanged_authorship_sha256 })),
    domain.sites.flatMap(site => site.excluded.map(exclusion => ({ site_index: site.site_index,
        locator_index: exclusion.locator_index, rule: exclusion.rule, instances: exclusion.instances,
        unchanged_authorship_sha256: exclusion.unchanged_authorship_sha256 }))));
    assert.equal(domain.admission_foundation.normal_rule_composition.pass_ids.length, 12);
    assert.equal(domain.admission_foundation.normal_rule_composition.conditional_coverage_complete, true);
    assert.equal(domain.admission_foundation.normal_rule_composition.admitted_domain_complete, false);
    assert.equal(plan.qualified, false);
    assert.equal(plan.semantic_mutation_credit, 0);
    let effects = 0;
    const activeMode = new Proxy({}, { get() { effects++; throw new Error('active'); } });
    for (const mode of [false, true, 'selection', Symbol('selection_projection'), activeMode])
        assert.throws(() => isolated.exports.preparePathQualificationAdmissionDomain({ preparation, rowIndex }, mode),
            /projection/);
    assert.equal(effects, 0);
    assert.throws(() => isolated.exports.preparePathSelectionAdmissionControls({ preparation, rowIndex, projection: 'selection' }));
});

test('N02G:PATH-V3-084 consumed native site control poisons the witness bridge before first normal C without fallback or replay authority', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const preparation = api.preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
        && row.target.predicate_id === 'link_2_refund_sign');
    const plan = api.preparePathQualificationWitnessPreselection({ preparation, rowIndex });
    const unusedCandidate = api.materializePathStaticDomainControl({ plan: plan.site_admission_control_plan, siteIndex: 0 });
    assert.ok(unusedCandidate.candidate_id);
    const capture = compiler.capturePathQualificationCompiler(), phaseProfile = await phaseFixture();
    let failure;
    try { compiler.compilePathQualificationWitnessPreselection({ capture, plan, phaseProfile }); }
    catch (error) { failure = error; }
    assert.ok(failure);
    assert.match(failure.message, /replay/);
    const evidence = compiler.readPathQualificationCompilerEvidence(failure);
    assert.ok(evidence);
    assert.equal(evidence.stage, 'path_v3_witness_program_preparation_failed_before_compile');
    assert.equal(evidence.normal_compile_path_entered, false);
    assert.equal(evidence.candidate_id, plan.selected.candidate_id);
    assert.equal(evidence.invocation_id, plan.selected.invocation_id);
    assert.equal(evidence.handle_attempts, 0);
    assert.equal(evidence.dp_execution, false);
    assert.equal(evidence.qualified, false);
    assert.equal(evidence.semantic_mutation_credit, 0);
    assert.equal(compiler.readPathQualificationCompilerEvidence(new Error(failure.message)), null);
    assert.throws(() => api.takePathQualificationWitnessPreselection({ plan }), /replay/);
    assert.throws(() => compiler.compilePathQualificationWitnessPreselection({ capture, plan, phaseProfile }),
        /capture_authority_or_poisoned/);
    assert.throws(() => compiler.compilePathQualificationCandidate({ capture, candidate: unusedCandidate }),
        /capture_authority_or_poisoned/);
    assert.throws(() => api.materializePathStaticDomainControl({ plan: plan.site_admission_control_plan, siteIndex: 0 }), /replay/);
});

test('N02G:PATH-V3-083 witness bridge verifies genuine native site controls before selected normal M without semantic or execution credit', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const preparation = api.preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
        && row.target.predicate_id === 'link_2_refund_sign');
    const plan = api.preparePathQualificationWitnessPreselection({ preparation, rowIndex });
    const result = compiler.compilePathQualificationWitnessPreselection({ capture: compiler.capturePathQualificationCompiler(),
        plan, phaseProfile: await phaseFixture() });
    const controls = result.witness_site_admission_controls;
    assert.ok(controls, 'missing captured witness site admission controls before selected compile');
    const premises = controls.normal_admission_premise_evidence;
    assert.ok(premises, 'missing preselected normal baseline and checker rule premise binding');
    assert.equal(premises.conditional_partition_sha256, plan.conditional_domain_partition_sha256);
    assert.equal(premises.normal_rule_composition_sha256, plan.conditional_domain_partition.normal_rule_composition_sha256);
    assert.equal(premises.normal_admission_checker_reference_sha256,
        result.normal_admission_checker_reference_sha256);
    assert.equal(premises.normal_baseline_admission_verified, true);
    assert.equal(premises.normal_checker_binding_verified, true);
    assert.equal(premises.site_admission_controls_verified, true);
    assert.equal(premises.normal_positive_restoration_verified, true);
    assert.equal(premises.sealed_before_selected_normal_compile, true);
    assert.equal(premises.independent_reviewed_rule_basis_verified, false);
    assert.equal(premises.whole_selected_actual_program_conformance_verified, false);
    assert.equal(premises.admitted_domain_complete, false);
    assert.equal(premises.first_witness_proved, false);
    assert.equal(premises.qualified, false);
    assert.equal(premises.semantic_mutation_credit, 0);
    assert.equal(controls.unknown_path_control_plan_sha256, plan.site_admission_control_plan_sha256);
    assert.equal(controls.selection_control_plan_sha256, plan.selection_admission_control_plan_sha256);
    assert.equal(controls.unknown_path_controls.length, preparation.rows[rowIndex].sites.length);
    assert.equal(controls.selection_controls.length, plan.selection_admission_control_plan.controls.length);
    assert.equal(controls.native_barriers_verified, true);
    assert.equal(controls.selected_normal_compile_started_after_controls, true);
    assert.equal(controls.compiler_result_used_to_define_domain, false);
    assert.equal(controls.qualified, false);
    assert.equal(controls.semantic_mutation_credit, 0);
    for (const control of [...controls.unknown_path_controls, ...controls.selection_controls]) {
        assert.equal(control.compiler_artifact_root, result.compiler_artifact_root);
        assert.equal(control.native_control_matched, true);
        assert.equal(control.handle_attempts, 0);
        assert.deepEqual(control.worlds.map(world => world.admitted), [true, false, true]);
        assert.notEqual(control.invocation_id, result.invocation_id);
        assert.notEqual(control.candidate_id, result.candidate_id);
        assert.equal(control.qualified, false);
        assert.equal(control.semantic_mutation_credit, 0);
    }
    assert.deepEqual(result.worlds.map(world => world.admitted), [true, true, true]);
    assert.deepEqual(result.witness_preselection.conditional_domain_partition, plan.conditional_domain_partition);
    assert.equal(result.witness_preselection.conditional_domain_partition_sha256, plan.conditional_domain_partition_sha256);
    assert.ok(Object.isFrozen(result.witness_preselection.conditional_domain_partition));
    assert.equal(result.witness_preselection.conditional_domain_partition.compiler_result_used, false);
    assert.equal(result.witness_preselection.conditional_domain_partition.first_witness_proved, false);
    assert.equal(result.witness_preselection.admitted_domain_complete, false);
    assert.equal(result.witness_preselection.witness_domain_complete, false);
    assert.equal(result.witness_execution_prerequisites.execution_permitted, false);
    assert.equal(result.dp_execution, false);
    assert.equal(result.qualified, false);
});

test('N02G:PATH-V3-082 witness site unknown path controls use full native C M S admission and exact precommitted coordinates with zero handles', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const preparation = api.preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
        && row.target.predicate_id === 'link_2_refund_sign');
    const plan = api.preparePathQualificationWitnessPreselection({ preparation, rowIndex });
    const controlPlan = plan.site_admission_control_plan, capture = compiler.capturePathQualificationCompiler();
    assert.equal(controlPlan.locator_domain_empty, false);
    const ids = new Set();
    for (const [siteIndex, control] of controlPlan.controls.entries()) {
        const candidate = api.materializePathStaticDomainControl({ plan: controlPlan, siteIndex });
        assert.deepEqual(candidate.expected_diagnostic, control.expected_diagnostic);
        assert.equal(candidate.locator_index, null);
        assert.ok(!ids.has(candidate.invocation_id)); ids.add(candidate.invocation_id);
        const result = compiler.compilePathQualificationCandidate({ capture, candidate });
        assert.deepEqual(result.worlds.map(world => world.variant), ['C', 'M', 'S']);
        assert.deepEqual(result.worlds.map(world => world.admitted), [true, false, true]);
        assert.deepEqual(result.worlds[1].diagnostic.native_coordinate, control.expected_diagnostic);
        assert.equal(result.worlds[1].diagnostic.forged_same_text_has_authority, false);
        assert.equal(result.worlds[0].ir_sha256, result.worlds[2].ir_sha256);
        assert.equal(result.reference.locator_domain_empty, false);
        assert.equal(result.native_control_matched, true);
        assert.equal(result.handle_attempts, 0);
        assert.equal(result.dp_execution, false);
        assert.equal(result.qualified, false);
        assert.equal(result.validation_tcb_complete, false);
        assert.equal(result.semantic_mutation_credit, 0);
        assert.throws(() => compiler.compilePathQualificationCandidate({ capture, candidate }), /candidate_authority_or_replay/);
    }
    assert.equal(ids.size, preparation.rows[rowIndex].sites.length);
    assert.equal(plan.normal_admission_verified, false);
    assert.equal(plan.admitted_domain_complete, false);
    assert.equal(plan.witness_domain_complete, false);
});

test('N02G:PATH-V3-081 witness preparation seals one genuine normal unknown path control per site without empty domain or execution credit', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const preparation = api.preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
        && row.target.predicate_id === 'link_2_refund_sign');
    const row = preparation.rows[rowIndex];
    assert.ok(row.sites.every(site => site.domain.locators.length > 0));
    const plan = api.preparePathQualificationWitnessPreselection({ preparation, rowIndex });
    const controls = plan.site_admission_control_plan;
    assert.ok(controls, 'missing genuine witness site admission control plan');
    assert.equal(controls.locator_domain_empty, false);
    assert.equal(controls.controls.length, row.sites.length);
    assert.equal(controls.domain_sha256, plan.domain_sha256);
    assert.equal(controls.qualified, false);
    assert.equal(controls.semantic_mutation_credit, 0);
    assert.equal(plan.normal_admission_verified, false);
    assert.throws(() => api.materializePathStaticDomainControl({ plan: structuredClone(controls), siteIndex: 0 }));
    let touched = false;
    const active = { plan: controls };
    Object.defineProperty(active, 'siteIndex', { enumerable: true, get() { touched = true; return 0; } });
    assert.throws(() => api.materializePathStaticDomainControl(active));
    assert.equal(touched, false);
    for (const [siteIndex, site] of row.sites.entries()) {
        assert.deepEqual(controls.controls[siteIndex].authored_site, site.authored_site);
        const candidate = api.materializePathStaticDomainControl({ plan: controls, siteIndex });
        assert.equal(candidate.candidate_kind, 'unknown_path_control_for_witness_site');
        assert.equal(candidate.locator_index, null);
        assert.deepEqual(candidate.expected_diagnostic.site_path, site.authored_site.site_path);
        assert.equal(candidate.qualified, false);
        assert.equal(candidate.dp_execution, false);
        const taken = api.takePathQualificationCandidatePackage({ candidate });
        assert.equal(taken.reference.locator_domain_empty, false);
        assert.equal(taken.reference.discriminating, false);
        assert.equal(taken.reference.stage, 'path_v3_witness_site_native_control_sealed_before_compile');
        assert.throws(() => api.materializePathStaticDomainControl({ plan: controls, siteIndex }), /replay/);
    }
    assert.equal(plan.witness_domain_complete, false);
    assert.equal(plan.admitted_domain_complete, false);
    assert.equal(plan.qualified, false);
});

test('N02G:PATH-V3-080 complete normal rule composition covers each genuine locator before M and blocks any missing premise', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
        && row.target.predicate_id === 'link_2_refund_sign');
    assert.ok(rowIndex >= 0);
    const domain = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex });
    const foundation = domain.admission_foundation, composition = foundation.normal_rule_composition;
    assert.ok(composition, 'missing complete normal rule composition');
    assert.deepEqual(composition.pass_ids, foundation.passes.map(pass => pass.id));
    assert.equal(composition.pass_ids.length, 12);
    assert.equal(composition.conditional_coverage_complete, true);
    assert.equal(composition.admitted_domain_complete, false);
    assert.equal(composition.compiler_result_used, false);
    assert.equal(composition.qualified, false);
    assert.equal(composition.semantic_mutation_credit, 0);
    assert.ok(Object.values(composition.required_premises).every(value => value === false));
    let locators = 0;
    for (const site of composition.sites) {
        const source = preparation.rows[rowIndex].sites[site.site_index];
        assert.equal(site.domain_complete, true);
        assert.equal(site.locators.length, source.domain.locators.length);
        for (const [index, member] of site.locators.entries()) {
            locators++;
            assert.equal(member.locator_index, index);
            assert.deepEqual(member.pass_coverage.map(pass => pass.pass_id), composition.pass_ids);
            assert.ok(member.pass_coverage.every(pass => pass.conditional_preservation_verified));
            assert.ok(member.pass_coverage.every(pass => typeof pass.contract_sha256 === 'string'));
            assert.equal(member.status, 'conditionally_preserved_pending_baseline_binding_and_controls');
            assert.equal(member.admitted, false);
            assert.equal(member.discharged, false);
            assert.equal(member.mutant_authorship_sha256, foundation.sites[site.site_index].frames[index].mutant_authorship_sha256);
        }
    }
    assert.ok(locators > 0);
    for (const alter of [value => value.admission_foundation.normal_rule_composition.pass_ids.pop(),
        value => value.admission_foundation.normal_rule_composition.sites[0].locators.pop(),
        value => value.admission_foundation.normal_rule_composition.sites[0].locators[0].pass_coverage.pop(),
        value => value.admission_foundation.normal_rule_composition.required_premises.normal_baseline_admission_verified = true,
        value => value.admission_foundation.normal_rule_composition.admitted_domain_complete = true]) {
        const changed = structuredClone(domain); alter(changed);
        assert.throws(() => api.verifyPathQualificationAdmissionDomain({ domain, candidate: changed }), /admission_foundation_changed/);
    }
    const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
    const file = path.resolve(__dirname, '../../../src/next/provenance/pathQualificationV3.js');
    const isolated = new Module(file); isolated.filename = file;
    isolated.paths = Module._nodeModulePaths(path.dirname(file));
    isolated._compile(fs.readFileSync(file, 'utf8') + `
        module.exports.testReadGap = (input, rowIndex, mode) => {
            const original = projectAdmissionRuleDependencyFrames;
            projectAdmissionRuleDependencyFrames = (...args) => {
                const frames = original(...args);
                if (mode === 'omit') frames.pop();
                if (mode === 'duplicate') frames.push(frames[0]);
                if (mode === 'different') frames[0].conditional_preservation_verified = false;
                if (mode === 'foreign_contract') frames[0].normal_read_rule_contract_sha256 = 'sha256:' + '0'.repeat(64);
                try { return frames; } finally { /* restoration belongs to the caller after projection */ }
            };
            try { return preparePathQualificationAdmissionDomain({ preparation: preparePathQualificationInventory(input), rowIndex }); }
            finally { projectAdmissionRuleDependencyFrames = original; }
        };`, file);
    for (const mode of ['omit', 'duplicate', 'different', 'foreign_contract']) {
        const blocked = isolated.exports.testReadGap(input, rowIndex, mode).admission_foundation.normal_rule_composition;
        assert.equal(blocked.conditional_coverage_complete, false);
        assert.ok(blocked.sites.every(site => site.locators.every(member => member.status === 'blocked_incomplete_normal_rule_coverage')));
        assert.equal(blocked.admitted_domain_complete, false);
    }
});

test('N02G:PATH-V3-079 document schema preservation binds normal schemas recipe and every genuine locator shape before C', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const docs = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = docs.get('docs/contracts/next/provenance-v2/graphs-v2.json');
    const graphs = new Map(corpus.graphs.map(graph => [graph.fact_key, graph]));
    const first = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex: 0 });
    const schemaContract = first.admission_foundation.normal_package_schema_contract;
    assert.ok(schemaContract, 'missing normal package schema preservation contract');
    assert.equal(schemaContract.baseline_admission_required, true);
    assert.equal(schemaContract.independent_code_audit, false);
    const { buildSchemaValidators, buildCapturedValidationTools } = {
        ...await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs'),
        ...await import('../../../scripts/agent/buildNextValidationTcb.mjs') };
    const normal = buildSchemaValidators();
    const samples = new Map();
    for (const [rowIndex, row] of preparation.rows.entries()) {
        // Empty L is still a genuine schema branch: cover its original,
        // without manufacturing alternatives or treating emptiness as credit.
        for (const site of row.sites) if (site.domain_complete && !samples.has(site.authored_site.definition))
            samples.set(site.authored_site.definition, rowIndex);
        if (samples.size === 3) break;
    }
    assert.equal(samples.size, 3);
    assert.deepEqual([...samples.keys()].sort(), ['claimPath', 'fieldPath', 'selector']);
    let controls = 0;
    for (const rowIndex of new Set(samples.values())) {
        const domain = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex });
        const graph = graphs.get(preparation.rows[rowIndex].target.fact_key);
        assert.equal(normal.validators.graphs({ ...corpus, graphs: [graph] }), true);
        for (const site of domain.admission_foundation.sites) for (const frame of site.frames ?? []) {
            const constraint = frame.structural_locator_constraint.schema_locator_constraint;
            assert.equal(constraint.shape_preservation_verified, true);
            assert.equal(constraint.predicate_identity_uniqueness_preserved, true);
            assert.equal(constraint.discharged, false);
            const mutant = structuredClone(graph); let holder = mutant;
            for (const token of site.graph_location.slice(0, -1)) holder = holder[token];
            holder[site.graph_location.at(-1)] = structuredClone(preparation.rows[rowIndex]
                .sites[site.site_index].domain.locators[frame.locator_index]);
            assert.equal(normal.validators.graphs({ ...corpus, graphs: [mutant] }), true); controls++;
        }
    }
    assert.ok(controls > 0);
    const program = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate: admittedCandidate(api, preparation), phaseProfile: await phaseFixture() });
    const fs = require('node:fs'), path = require('node:path');
    const originalRead = fs.readFileSync;
    for (const [relative, from, to] of [
        ['docs/contracts/next/provenance-v2/provenance-graph.schema.json', '"minItems":1', '"minItems":0'],
        ['scripts/agent/buildNextProvenanceArtifacts.mjs', 'coerceTypes: false', 'coerceTypes: true']]) {
        let changed = 0;
        fs.readFileSync = function(file, ...args) {
            const value = originalRead.call(this, file, ...args);
            if (path.resolve(String(file)) !== path.resolve(__dirname, '../../..', relative)) return value;
            const source = value.toString().replace(from, to); assert.notEqual(source, value.toString()); changed++;
            return typeof value === 'string' ? source : Buffer.from(source);
        };
        try { assert.throws(() => program.sealPathCandidateProgramExpectation({ authorship }), /admission_checker_schema_contract_pin/); }
        finally { fs.readFileSync = originalRead; }
        assert.ok(changed > 0);
    }
    const expectation = program.sealPathCandidateProgramExpectation({ authorship });
    const reference = expectation.normal_admission_checker_reference.normal_package_schema_contract;
    assert.equal(reference.source_bindings_verified, true);
    assert.equal(reference.conditional_preservation_complete, true);
    assert.equal(reference.normal_baseline_admission_verified, false);
    assert.equal(reference.discharged, false);
    const built = buildCapturedValidationTools(), recipe = JSON.parse(built.entries.find(row => row.path === 'recipe.json').source);
    const binding = { expectation, sourceHashes: built.hostSourceHashes, childSourceHashes: built.child.sourceHashes,
        schemaSources: recipe.schema_sources, schemaBuildSource: recipe.recipes.find(row => row.path === 'scripts/agent/buildNextProvenanceArtifacts.mjs').source };
    assert.equal(program.verifyPathCandidateCapabilityBuildBinding(binding).normal_package_schema_source_conformance, true);
    for (const mutate of [value => value.pop(), value => value.reverse(), value => value.push(value[0]),
        value => value[0].sha256 = 'sha256:' + '0'.repeat(64)]) {
        const sources = structuredClone(binding.schemaSources); mutate(sources);
        assert.throws(() => program.verifyPathCandidateCapabilityBuildBinding({ ...binding, schemaSources: sources }));
    }
    assert.throws(() => program.verifyPathCandidateCapabilityBuildBinding({ ...binding,
        schemaBuildSource: binding.schemaBuildSource.replace('coerceTypes: false', 'coerceTypes: true') }));
    let touched = false;
    const active = structuredClone(binding.schemaSources);
    Object.defineProperty(active[0], 'sha256', { enumerable: true, get() { touched = true; throw new Error('active'); } });
    assert.throws(() => program.verifyPathCandidateCapabilityBuildBinding({ ...binding, schemaSources: active }));
    assert.equal(touched, false);
});

test('N02G:PATH-V3-078 selection read frames retain every referenced predicate and preserve only unchanged selection inputs before C', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const docs = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = docs.get('docs/contracts/next/provenance-v2/graphs-v2.json');
    const graphs = new Map(corpus.graphs.map(graph => [graph.fact_key, graph]));
    const samples = new Map();
    for (const [rowIndex, row] of preparation.rows.entries()) {
        if (!row.sites.every(site => site.domain_complete) || !row.sites.some(site => site.domain.locators.length)) continue;
        const graph = graphs.get(row.target.fact_key);
        const referenced = graph.selections.some(selection => selection.selected_predicates.includes(row.target.predicate_id)
            || selection.excluded.some(excluded => excluded.predicates.includes(row.target.predicate_id)));
        if (!samples.has(referenced)) samples.set(referenced, rowIndex);
        if (samples.size === 2) break;
    }
    assert.equal(samples.size, 2);
    const first = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex: samples.get(false) });
    const contract = first.admission_foundation.normal_read_rule_contracts.find(row => row.pass_id === 'selection_bindings');
    assert.ok(contract, 'missing normal selection read contract');
    assert.equal(contract.entrypoint, 'validateSelectionBindings');
    assert.equal(contract.independent_code_audit, false);
    const { validateSelectionBindings } = require('../../../src/next/provenance/selectionBindings');
    let controls = 0;
    for (const [referenced, rowIndex] of samples) {
        const domain = referenced ? api.preparePathQualificationAdmissionDomain({ preparation, rowIndex }) : first;
        const graph = graphs.get(preparation.rows[rowIndex].target.fact_key);
        const normalInput = { claims: docs.get(corpus.claim_contract.path).claims, materialRegistry: docs.get(corpus.material_registry.path) };
        const baseline = validateSelectionBindings({ ...normalInput, graphs: [graph] });
        for (const site of domain.admission_foundation.sites) for (const frame of site.frames) {
            const rule = frame.rule_dependency_frames.find(row => row.pass_id === contract.pass_id);
            assert.equal(rule.conditional_preservation_verified, !referenced);
            assert.equal(rule.discharged, false);
            if (!referenced) {
                const mutant = structuredClone(graph); let holder = mutant;
                for (const token of site.graph_location.slice(0, -1)) holder = holder[token];
                holder[site.graph_location.at(-1)] = structuredClone(preparation.rows[rowIndex]
                    .sites[site.site_index].domain.locators[frame.locator_index]);
                assert.deepEqual(validateSelectionBindings({ ...normalInput, graphs: [mutant] }), baseline); controls++;
            }
        }
    }
    assert.ok(controls > 0);
    const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
    const file = path.resolve(__dirname, '../../../src/next/provenance/pathQualificationV3.js');
    const isolated = new Module(file); isolated.filename = file;
    isolated.paths = Module._nodeModulePaths(path.dirname(file));
    isolated._compile(fs.readFileSync(file, 'utf8') + '\nmodule.exports.testQuery = projectAdmissionRuleDependencyFrames;', file);
    const graph = graphs.get(preparation.rows[samples.get(true)].target.fact_key);
    const target = graph.predicates.findIndex(value => value.id === preparation.rows[samples.get(true)].target.predicate_id);
    const referenceIDs = new Set(graph.selections.flatMap(selection => [...selection.selected_predicates,
        ...selection.excluded.flatMap(row => row.predicates)]));
    const other = graph.predicates.findIndex((value, index) => index !== target && referenceIDs.has(value.id));
    assert.ok(other >= 0);
    for (const mutate of [value => value.predicates[other].args[0] = { node: '__synthetic__' },
        value => value.predicates[other].id += '_synthetic',
        value => value.selections[0].selected_predicates.push('__synthetic__'),
        value => value.edges.push({ id: '__synthetic__' }),
        value => value.trace_contract.proof.required_reads.push({ node: '__synthetic__', segments: ['state'] })]) {
        const mutant = structuredClone(graph); mutate(mutant);
        const rule = isolated.exports.testQuery(graph, mutant, target).find(row => row.pass_id === contract.pass_id);
        assert.equal(rule.dependency_frame_verified, false);
        assert.equal(rule.conditional_preservation_verified, false);
    }
    const normal = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate: admittedCandidate(api, preparation), phaseProfile: await phaseFixture() });
    const originalRead = fs.readFileSync; let altered = 0;
    fs.readFileSync = function(file, ...args) {
        const value = originalRead.call(this, file, ...args);
        if (path.resolve(String(file)) !== path.resolve(__dirname, '../../../src/next/provenance/selectionBindings.js')) return value;
        const source = value.toString().replace('if (!ids.length)', 'if (false)');
        assert.notEqual(source, value.toString()); altered++;
        return typeof value === 'string' ? source : Buffer.from(source);
    };
    try { assert.throws(() => normal.sealPathCandidateProgramExpectation({ authorship }), /admission_checker_read_contract_pin/); }
    finally { fs.readFileSync = originalRead; }
    assert.ok(altered > 0);
});

test('N02G:PATH-V3-076 ordinary claim read frames retain all descriptor subject period arguments and roots before C', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const docs = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = docs.get('docs/contracts/next/provenance-v2/graphs-v2.json');
    const graphs = new Map(corpus.graphs.map(graph => [graph.fact_key, graph]));
    const roots = ['subject_scope', 'period', 'time_basis', 'coverage', 'evidence_state'];
    const samples = new Map();
    for (const [rowIndex, row] of preparation.rows.entries()) {
        if (!row.sites.every(site => site.domain_complete) || !row.sites.some(site => site.domain.locators.length)) continue;
        const predicate = graphs.get(row.target.fact_key).predicates.find(value => value.id === row.target.predicate_id);
        const sensitive = roots.includes(predicate.obligation);
        if (!sensitive && predicate.args.some(arg => arg.claim)) continue;
        if (!samples.has(sensitive)) samples.set(sensitive, rowIndex);
        if (samples.size === 2) break;
    }
    assert.equal(samples.size, 2);
    const first = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex: samples.get(false) });
    const contract = first.admission_foundation.normal_read_rule_contracts.find(row => row.pass_id === 'claim_requirements');
    assert.ok(contract, 'missing normal ordinary claim read contract');
    assert.equal(contract.entrypoint, 'validateClaimRequirements');
    assert.equal(contract.independent_code_audit, false);
    const { validateClaimRequirements } = require('../../../src/next/provenance/claimRequirementCore');
    let controls = 0;
    for (const [sensitive, rowIndex] of samples) {
        const domain = sensitive ? api.preparePathQualificationAdmissionDomain({ preparation, rowIndex }) : first;
        const graph = graphs.get(preparation.rows[rowIndex].target.fact_key);
        const normalInput = { claims: docs.get(corpus.claim_contract.path).claims };
        const baseline = validateClaimRequirements({ ...normalInput, graphs: [graph] });
        for (const site of domain.admission_foundation.sites) for (const frame of site.frames) {
            const rule = frame.rule_dependency_frames.find(row => row.pass_id === contract.pass_id);
            assert.equal(rule.conditional_preservation_verified, !sensitive);
            assert.equal(rule.discharged, false);
            if (!sensitive) {
                const mutant = structuredClone(graph); let holder = mutant;
                for (const token of site.graph_location.slice(0, -1)) holder = holder[token];
                holder[site.graph_location.at(-1)] = structuredClone(preparation.rows[rowIndex]
                    .sites[site.site_index].domain.locators[frame.locator_index]);
                // Regression control, never a candidate-derived A/W basis.
                assert.deepEqual(validateClaimRequirements({ ...normalInput, graphs: [mutant] }), baseline); controls++;
            }
        }
    }
    assert.ok(controls > 0);
    const changed = structuredClone(first);
    changed.admission_foundation.normal_read_rule_contracts.find(row => row.pass_id === contract.pass_id).baseline_admission_required = false;
    assert.throws(() => api.verifyPathQualificationAdmissionDomain({ domain: first, candidate: changed }));
    const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
    const file = path.resolve(__dirname, '../../../src/next/provenance/pathQualificationV3.js');
    const isolated = new Module(file); isolated.filename = file;
    isolated.paths = Module._nodeModulePaths(path.dirname(file));
    isolated._compile(fs.readFileSync(file, 'utf8') + '\nmodule.exports.testQuery = projectAdmissionRuleDependencyFrames;', file);
    const graph = graphs.get(preparation.rows[samples.get(false)].target.fact_key);
    const target = graph.predicates.findIndex(value => value.id === preparation.rows[samples.get(false)].target.predicate_id);
    const participant = graph.predicates.findIndex(value => roots.includes(value.obligation));
    assert.ok(participant >= 0 && participant !== target);
    for (const mutate of [value => value.predicates[participant].args[0] = { literal: { type: 'id', value: '__synthetic__' } },
        value => value.predicates[participant].id += '_synthetic',
        value => value.claim_id += '_synthetic',
        value => value.trace_contract.proof.required_claim_reads.push({ segments: ['__synthetic__'] }),
        value => value.windows.__synthetic__ = { kind: 'month' },
        value => value.predicates[target].args[0] = { claim: { segments: ['period'] } }]) {
        const mutant = structuredClone(graph); mutate(mutant);
        const rule = isolated.exports.testQuery(graph, mutant, target).find(row => row.pass_id === contract.pass_id);
        assert.equal(rule.dependency_frame_verified, false);
        assert.equal(rule.conditional_preservation_verified, false);
    }
    const normal = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate: admittedCandidate(api, preparation), phaseProfile: await phaseFixture() });
    const originalRead = fs.readFileSync; let altered = 0;
    fs.readFileSync = function(file, ...args) {
        const value = originalRead.call(this, file, ...args);
        if (path.resolve(String(file)) !== path.resolve(__dirname, '../../../src/next/provenance/claimRequirementCore.js')) return value;
        const source = value.toString().replace('literal.type !== type || !same(literal.value, value)', 'false');
        assert.notEqual(source, value.toString()); altered++;
        return typeof value === 'string' ? source : Buffer.from(source);
    };
    try { assert.throws(() => normal.sealPathCandidateProgramExpectation({ authorship }), /admission_checker_read_contract_pin/); }
    finally { fs.readFileSync = originalRead; }
    assert.ok(altered > 0);
});

test('N02G:PATH-V3-077 collection read frames retain all fixture membership candidate anchors and graph roots before C', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const docs = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = docs.get('docs/contracts/next/provenance-v2/graphs-v2.json');
    const graphs = new Map(corpus.graphs.map(graph => [graph.fact_key, graph]));
    const samples = new Map();
    for (const [rowIndex, row] of preparation.rows.entries()) {
        if (!row.sites.every(site => site.domain_complete) || !row.sites.some(site => site.domain.locators.length)) continue;
        const predicate = graphs.get(row.target.fact_key).predicates.find(value => value.id === row.target.predicate_id);
        const sensitive = ['coverage', 'evidence_set'].includes(predicate.obligation);
        if (!samples.has(sensitive)) samples.set(sensitive, rowIndex);
        if (samples.size === 2) break;
    }
    assert.equal(samples.size, 2);
    const first = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex: samples.get(false) });
    const contract = first.admission_foundation.normal_read_rule_contracts.find(row => row.pass_id === 'collection_requirements');
    assert.ok(contract, 'missing normal collection read contract');
    assert.equal(contract.entrypoint, 'validateCollectionRequirements');
    assert.equal(contract.independent_code_audit, false);
    const { validateCollectionRequirements } = require('../../../src/next/provenance/collectionRequirements');
    let controls = 0;
    for (const [sensitive, rowIndex] of samples) {
        const domain = sensitive ? api.preparePathQualificationAdmissionDomain({ preparation, rowIndex }) : first;
        const graph = graphs.get(preparation.rows[rowIndex].target.fact_key);
        const normalInput = { snapshots: docs.get(corpus.snapshot_manifest.path).snapshots,
            materialRegistry: docs.get(corpus.material_registry.path) };
        const baseline = validateCollectionRequirements({ ...normalInput, graphs: [graph] });
        for (const site of domain.admission_foundation.sites) for (const frame of site.frames) {
            const rule = frame.rule_dependency_frames.find(row => row.pass_id === contract.pass_id);
            assert.equal(rule.conditional_preservation_verified, !sensitive);
            assert.equal(rule.discharged, false);
            if (!sensitive) {
                const mutant = structuredClone(graph); let holder = mutant;
                for (const token of site.graph_location.slice(0, -1)) holder = holder[token];
                holder[site.graph_location.at(-1)] = structuredClone(preparation.rows[rowIndex]
                    .sites[site.site_index].domain.locators[frame.locator_index]);
                assert.deepEqual(validateCollectionRequirements({ ...normalInput, graphs: [mutant] }), baseline); controls++;
            }
        }
    }
    assert.ok(controls > 0);
    const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
    const file = path.resolve(__dirname, '../../../src/next/provenance/pathQualificationV3.js');
    const isolated = new Module(file); isolated.filename = file;
    isolated.paths = Module._nodeModulePaths(path.dirname(file));
    isolated._compile(fs.readFileSync(file, 'utf8') + '\nmodule.exports.testQuery = projectAdmissionRuleDependencyFrames;', file);
    const graph = graphs.get(preparation.rows[samples.get(false)].target.fact_key);
    const target = graph.predicates.findIndex(value => value.id === preparation.rows[samples.get(false)].target.predicate_id);
    const participant = graph.predicates.findIndex(value => ['coverage', 'evidence_set'].includes(value.obligation));
    assert.ok(participant >= 0 && participant !== target);
    const selectionTemplate = corpus.graphs.flatMap(value => value.selections)[0];
    assert.ok(selectionTemplate, 'normal selection shape required for the collection root control');
    for (const mutate of [value => value.predicates[participant].args[0] = { literal: { type: 'boolean', value: false } },
        value => value.predicates[participant].id += '_synthetic',
        // Change the collection anchor while preserving the normal selection
        // shape. Missing predicate arrays would fail the separate selection
        // projection before this collection dependency frame is inspected.
        value => value.selections.push({ ...structuredClone(selectionTemplate), candidate_set: '__synthetic__' }),
        value => value.sets.__synthetic__ = [],
        value => value.nodes[Object.keys(value.nodes)[0]].kind = '__synthetic__']) {
        const mutant = structuredClone(graph); mutate(mutant);
        const rule = isolated.exports.testQuery(graph, mutant, target).find(row => row.pass_id === contract.pass_id);
        assert.equal(rule.dependency_frame_verified, false);
        assert.equal(rule.conditional_preservation_verified, false);
    }
    const normal = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate: admittedCandidate(api, preparation), phaseProfile: await phaseFixture() });
    const originalRead = fs.readFileSync; let altered = 0;
    fs.readFileSync = function(file, ...args) {
        const value = originalRead.call(this, file, ...args);
        if (path.resolve(String(file)) !== path.resolve(__dirname, '../../../src/next/provenance/collectionRequirements.js')) return value;
        const source = value.toString().replace('if (source[field] !== true)', 'if (false)');
        assert.notEqual(source, value.toString()); altered++;
        return typeof value === 'string' ? source : Buffer.from(source);
    };
    try { assert.throws(() => normal.sealPathCandidateProgramExpectation({ authorship }), /admission_checker_read_contract_pin/); }
    finally { fs.readFileSync = originalRead; }
    assert.ok(altered > 0);
});

test('N02G:PATH-V3-075 obligation read frames bind all participating arguments roots and pinned normal body before C', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const corpus = admittedDocuments(input.packageReceipt).find(row => row.path.endsWith('/graphs-v2.json')).value;
    const graphs = new Map(corpus.graphs.map(graph => [graph.fact_key, graph]));
    const sensitive = predicate => ['node_identity', 'semantic_integrity'].includes(predicate.obligation)
        || ['kind_is', 'fingerprint_is', 'ref_targets_node'].includes(predicate.op);
    const samples = new Map();
    for (const [rowIndex, row] of preparation.rows.entries()) {
        if (!row.sites.every(site => site.domain_complete) || !row.sites.some(site => site.domain.locators.length)) continue;
        const graph = graphs.get(row.target.fact_key), predicate = graph.predicates.find(value => value.id === row.target.predicate_id);
        if (!samples.has(sensitive(predicate))) samples.set(sensitive(predicate), rowIndex);
        if (samples.size === 2) break;
    }
    assert.equal(samples.size, 2);
    const first = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex: samples.get(false) });
    const contract = first.admission_foundation.normal_read_rule_contracts.find(row => row.pass_id === 'obligation_bindings');
    assert.ok(contract, 'missing normal obligation read contract');
    assert.equal(contract.entrypoint, 'validateObligationBindings');
    assert.equal(contract.baseline_admission_required, true);
    assert.equal(contract.independent_code_audit, false);
    const documents = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const normalInput = { snapshots: documents.get(corpus.snapshot_manifest.path).snapshots,
        materialRegistry: documents.get(corpus.material_registry.path) };
    const { validateObligationBindings } = require('../../../src/next/provenance/obligationBindings');
    for (const [isSensitive, rowIndex] of samples) {
        const domain = rowIndex === samples.get(false) ? first : api.preparePathQualificationAdmissionDomain({ preparation, rowIndex });
        const originalGraph = graphs.get(preparation.rows[rowIndex].target.fact_key);
        // Native static comparisons are regression controls only. The query
        // and rule are authored independently; a normal pass on M cannot
        // discharge A or supply a witness/domain expectation.
        const baselineControl = validateObligationBindings({ ...normalInput, graphs: [originalGraph] });
        let count = 0;
        for (const site of domain.admission_foundation.sites) for (const frame of site.frames) {
            const rule = frame.rule_dependency_frames.find(row => row.pass_id === contract.pass_id);
            assert.equal(rule.dependency_frame_verified, !isSensitive);
            assert.equal(rule.conditional_preservation_verified, !isSensitive);
            assert.equal(rule.discharged, false); count++;
            if (!isSensitive) {
                const mutant = structuredClone(originalGraph);
                let holder = mutant;
                for (const token of site.graph_location.slice(0, -1)) holder = holder[token];
                holder[site.graph_location.at(-1)] = structuredClone(preparation.rows[rowIndex]
                    .sites[site.site_index].domain.locators[frame.locator_index]);
                assert.deepEqual(validateObligationBindings({ ...normalInput, graphs: [mutant] }), baselineControl);
            }
        }
        assert.ok(count > 0);
    }
    const changed = structuredClone(first);
    changed.admission_foundation.normal_read_rule_contracts.find(row => row.pass_id === contract.pass_id).source_bindings.pop();
    assert.throws(() => api.verifyPathQualificationAdmissionDomain({ domain: first, candidate: changed }));
    // Isolated synthetic query sensitivity, not an operational candidate,
    // normal admission result or additional production authority.
    const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
    const file = path.resolve(__dirname, '../../../src/next/provenance/pathQualificationV3.js');
    const isolated = new Module(file); isolated.filename = file;
    isolated.paths = Module._nodeModulePaths(path.dirname(file));
    isolated._compile(fs.readFileSync(file, 'utf8') + '\nmodule.exports.testQuery = projectAdmissionRuleDependencyFrames;', file);
    const graph = graphs.get(preparation.rows[samples.get(false)].target.fact_key);
    const target = graph.predicates.findIndex(value => value.id === preparation.rows[samples.get(false)].target.predicate_id);
    const participant = graph.predicates.findIndex(sensitive);
    assert.ok(participant >= 0 && participant !== target);
    for (const mutate of [value => value.predicates[participant].args[0] = { literal: { type: 'id', value: '__synthetic__' } },
        value => value.predicates[participant].id += '_synthetic',
        value => value.nodes[Object.keys(value.nodes)[0]].version += '_synthetic',
        value => value.edges.push({ id: '__synthetic__' }),
        value => value.trace_contract.proof.required_reads.push({ node: '__synthetic__', segments: ['id'] })]) {
        const mutant = structuredClone(graph); mutate(mutant);
        const rule = isolated.exports.testQuery(graph, mutant, target).find(row => row.pass_id === contract.pass_id);
        assert.equal(rule.dependency_frame_verified, false);
        assert.equal(rule.conditional_preservation_verified, false);
    }
    const normal = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate: admittedCandidate(api, preparation),
        phaseProfile: await phaseFixture() });
    const originalRead = fs.readFileSync; let altered = 0;
    fs.readFileSync = function(file, ...args) {
        const value = originalRead.call(this, file, ...args);
        if (path.resolve(String(file)) !== path.resolve(__dirname, '../../../src/next/provenance/obligationBindings.js')) return value;
        const source = value.toString().replace("?.class === 'identity'", "?.class !== 'non_material'");
        assert.notEqual(source, value.toString()); altered++;
        return typeof value === 'string' ? source : Buffer.from(source);
    };
    try { assert.throws(() => normal.sealPathCandidateProgramExpectation({ authorship }), /admission_checker_read_contract_pin/); }
    finally { fs.readFileSync = originalRead; }
    assert.ok(altered > 0);
});

test('N02G:PATH-V3-074 primitive material type constraints preserve nominal peers but leave reference and claim bases blocked before C', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const docs = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = docs.get('docs/contracts/next/provenance-v2/graphs-v2.json');
    const registry = docs.get(corpus.material_registry.path);
    const graphs = new Map(corpus.graphs.map(graph => [graph.fact_key, graph]));
    const samples = new Map();
    for (const [rowIndex, row] of preparation.rows.entries()) {
        if (!row.sites.every(site => site.domain_complete)) continue;
        const graph = graphs.get(row.target.fact_key);
        for (const site of row.sites) if (site.domain.locators.length) {
            let kind = 'claim';
            if (site.authored_site.definition !== 'claimPath') {
                const locator = site.domain.original;
                const owner = site.authored_site.definition === 'fieldPath' ? graph.nodes[locator.node].kind : locator.kind;
                const type = registry.kinds[owner].fields[locator.segments[0]].type;
                kind = ['ref', 'ref_list', 'typed_result', 'typed_period', 'role_ref_list'].includes(type) ? 'reference_or_record' : 'primitive:' + type;
            }
            if (!samples.has(kind)) samples.set(kind, rowIndex);
        }
    }
    const primitiveKey = [...samples.keys()].find(key => key.startsWith('primitive:'));
    assert.ok(primitiveKey);
    const first = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex: samples.get(primitiveKey) });
    assert.ok(first.admission_foundation.normal_primitive_type_contract, 'missing normal primitive type contract');
    let preserved = 0, blocked = 0;
    const { compilePredicateTypes } = require('../../../src/next/provenance/predicateTypes');
    const typeInput = { claims: docs.get(corpus.claim_contract.path).claims,
        snapshots: docs.get(corpus.snapshot_manifest.path).snapshots, materialRegistry: registry,
        operatorRegistry: docs.get(corpus.operator_registry.path),
        claimSchema: docs.get('docs/contracts/next/provenance-v2/claim-contract.schema.json') };
    const projectedTypes = graph => compilePredicateTypes({ ...typeInput, graphs: [graph] })
        .typedGraphs[0].predicates.map(predicate => predicate.operands.map(operand => operand.type));
    for (const rowIndex of new Set(samples.values())) {
        const domain = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex });
        const graph = graphs.get(preparation.rows[rowIndex].target.fact_key), baselineTypes = projectedTypes(graph);
        for (const site of domain.admission_foundation.sites) for (const frame of site.frames) {
            const type = frame.structural_locator_constraint.primitive_type_constraint;
            assert.ok(type);
            assert.equal(type.normal_baseline_admission_verified, false);
            assert.equal(type.compiler_result_used, false);
            assert.equal(type.discharged, false);
            if (type.conditional_preservation_verified) {
                preserved++; assert.equal(type.status, 'same_normal_material_primitive_type_under_explicit_premises');
                assert.deepEqual(type.baseline_nominal, type.alternative_nominal);
                assert.ok(type.operator_instance.args.length > 0);
                assert.equal(type.window_and_set_inference_unchanged, true);
                // Native ordinary-pass comparison is a regression CONTROL
                // of this conditional lemma, not the authorial basis of A/W
                // or an operational expected derived from compiler output.
                const mutant = structuredClone(graph); let leaf = mutant;
                for (const token of site.graph_location.slice(0, -1)) leaf = leaf[token];
                const locator = preparation.rows[rowIndex].sites[site.site_index].domain.locators[frame.locator_index];
                leaf[site.graph_location.at(-1)] = structuredClone(locator);
                assert.deepEqual(projectedTypes(mutant), baselineTypes);
            } else {
                blocked++; assert.ok(type.status.startsWith('blocked_'));
            }
        }
        const clone = structuredClone(domain);
        clone.admission_foundation.normal_primitive_type_contract.baseline_admission_required = false;
        assert.throws(() => api.verifyPathQualificationAdmissionDomain({ domain, candidate: clone }));
        assert.equal(domain.admission_foundation.rule_discharge_complete, false);
    }
    assert.ok(preserved > 0);
    assert.equal(blocked > 0, samples.has('claim') || samples.has('reference_or_record'));
    const normal = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate: admittedCandidate(api, preparation),
        phaseProfile: await phaseFixture() });
    const fs = require('node:fs'), path = require('node:path'), originalRead = fs.readFileSync;
    let altered = 0;
    fs.readFileSync = function(file, ...args) {
        const value = originalRead.call(this, file, ...args);
        if (path.resolve(String(file)) !== path.resolve(__dirname, '../../../src/next/provenance/predicateTypes.js')) return value;
        const source = value.toString().replace("if (!own(registryFields, segments[0]) || registryFields[segments[0]].class === 'non_material') fail('field_material');",
            "if (false) fail('field_material');");
        assert.notEqual(source, value.toString()); altered++;
        return typeof value === 'string' ? source : Buffer.from(source);
    };
    try { assert.throws(() => normal.sealPathCandidateProgramExpectation({ authorship }), /admission_checker_primitive_type_contract_pin/); }
    finally { fs.readFileSync = originalRead; }
    assert.ok(altered > 0);
    assert.equal(canonicalValue(first).includes('reference_type_admitted'), false);
});

test('N02G:PATH-V3-073 template read frames retain all named bindings and set peers before C without type admission claims', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const preparation = api.preparePathQualificationInventory(await fixture());
    const samples = new Map();
    for (const [rowIndex, row] of preparation.rows.entries()) {
        if (!row.sites.every(site => site.domain_complete)) continue;
        for (const site of row.sites) if (site.domain.locators.length) {
            const kind = site.authored_site.site_path.includes('bindings') ? 'binding' : 'outside';
            if (!samples.has(kind)) samples.set(kind, rowIndex);
        }
    }
    assert.ok(samples.size > 0);
    const first = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex: samples.values().next().value });
    const contract = first.admission_foundation.normal_read_rule_contracts.find(row => row.pass_id === 'template_references');
    assert.ok(contract, 'missing pinned template input read contract');
    assert.equal(contract.entrypoint, 'validateTemplateReferences');
    assert.equal(contract.read_projection, 'all_template_arguments_set_peers_and_graph_roots_with_unchanged_documents');
    let preserved = 0, dependent = 0;
    for (const rowIndex of new Set(samples.values())) {
        const domain = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex });
        for (const [siteIndex, site] of domain.admission_foundation.sites.entries()) for (const frame of site.frames) {
            const rule = frame.rule_dependency_frames.find(row => row.pass_id === 'template_references');
            const binding = preparation.rows[rowIndex].sites[siteIndex].authored_site.site_path.includes('bindings');
            assert.equal(rule.dependency_frame_verified, !binding);
            assert.equal(rule.conditional_preservation_verified, !binding);
            assert.equal(rule.discharged, false);
            if (binding) dependent++; else preserved++;
        }
        const changed = structuredClone(domain);
        changed.admission_foundation.normal_read_rule_contracts.find(row => row.pass_id === 'template_references').source_bindings.pop();
        assert.throws(() => api.verifyPathQualificationAdmissionDomain({ domain, candidate: changed }));
        assert.equal(domain.admission_foundation.rule_discharge_complete, false);
    }
    assert.ok(preserved > 0);
    assert.equal(dependent > 0, samples.has('binding'));
    // Current authored template sites have no alternative in their genuine L.
    // Exercise read sensitivity separately with a synthetic mutation of an
    // actual authored binding. This is NOT an admitted candidate or a witness.
    // The private query is exposed only in this isolated test module copy;
    // no new production API, receipt/brand or runtime authority is created.
    const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
    const file = path.resolve(__dirname, '../../../src/next/provenance/pathQualificationV3.js');
    const isolated = new Module(file); isolated.filename = file;
    isolated.paths = Module._nodeModulePaths(path.dirname(file));
    isolated._compile(fs.readFileSync(file, 'utf8') + '\nmodule.exports.testQuery = projectAdmissionRuleDependencyFrames;', file);
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const input = await fixture();
    const corpus = admittedDocuments(input.packageReceipt).find(row => row.path.endsWith('/graphs-v2.json')).value;
    let sensitivity = 0;
    for (const graph of corpus.graphs) for (const [index, predicate] of graph.predicates.entries()) {
        for (const [operand, arg] of predicate.args.entries()) {
            if (!arg.template) continue;
            for (const [name, binding] of Object.entries(arg.bindings)) {
                const kind = ['field', 'selector', 'claim'].find(key => binding[key]?.segments);
                if (!kind) continue;
                const mutant = structuredClone(graph);
                mutant.predicates[index].args[operand].bindings[name][kind].segments[0] = '__synthetic_read_change__';
                const query = isolated.exports.testQuery(graph, mutant, index).find(row => row.pass_id === 'template_references');
                assert.equal(query.dependency_frame_verified, false);
                assert.equal(query.conditional_preservation_verified, false);
                assert.equal(query.discharged, false);
                sensitivity++;
            }
        }
    }
    assert.ok(sensitivity > 0);
    const normal = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate: admittedCandidate(api, preparation),
        phaseProfile: await phaseFixture() });
    const originalRead = fs.readFileSync;
    let altered = 0;
    fs.readFileSync = function(file, ...args) {
        const value = originalRead.call(this, file, ...args);
        if (path.resolve(String(file)) !== path.resolve(__dirname, '../../../src/next/provenance/templateReferences.js')) return value;
        const source = value.toString().replace("if (entry.hash !== arg.template.hash) fail('hash');", "if (false) fail('hash');");
        assert.notEqual(source, value.toString()); altered++;
        return typeof value === 'string' ? source : Buffer.from(source);
    };
    try { assert.throws(() => normal.sealPathCandidateProgramExpectation({ authorship }), /admission_checker_read_contract_pin/); }
    finally { fs.readFileSync = originalRead; }
    assert.ok(altered > 0);
    assert.equal(canonicalValue(first).includes('template_signature_admitted'), false);
});

test('N02G:PATH-V3-072 unchanged schema registry documents bind the normal projection rule before C without general schema claims', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const preparation = api.preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.sites.every(site => site.domain_complete)
        && row.sites.some(site => site.domain.locators.length));
    const domain = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex });
    const rule = domain.admission_foundation.normal_read_rule_contracts.find(rule => rule.pass_id === 'schema_registry_projection');
    assert.ok(rule, 'missing pinned schema registry projection read contract');
    assert.equal(rule.entrypoint, 'validateSchemaRegistryProjection');
    assert.equal(rule.independent_code_audit, false);
    for (const site of domain.admission_foundation.sites) for (const frame of site.frames) {
        const dependency = frame.rule_dependency_frames.find(row => row.pass_id === rule.pass_id);
        assert.equal(dependency.dependency_frame_verified, true);
        assert.equal(dependency.conditional_preservation_verified, true);
        assert.equal(dependency.discharged, false);
    }
    const changed = structuredClone(domain);
    changed.admission_foundation.normal_read_rule_contracts.find(row => row.pass_id === rule.pass_id).source_bindings.pop();
    assert.throws(() => api.verifyPathQualificationAdmissionDomain({ domain, candidate: changed }));
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate: admittedCandidate(api, preparation),
        phaseProfile: await phaseFixture() });
    const fs = require('node:fs'), path = require('node:path'), originalRead = fs.readFileSync;
    let changedBody = 0;
    fs.readFileSync = function(file, ...args) {
        const value = originalRead.call(this, file, ...args);
        if (path.resolve(String(file)) !== path.resolve(__dirname, '../../../src/next/provenance/schemaRegistryProjection.js')) return value;
        const source = value.toString().replace("registry.stage !== 'authoring' || registry.closed_world !== true", 'false');
        assert.notEqual(source, value.toString()); changedBody++;
        return typeof value === 'string' ? source : Buffer.from(source);
    };
    try { assert.throws(() => contract.sealPathCandidateProgramExpectation({ authorship }), /admission_checker_read_contract_pin/); }
    finally { fs.readFileSync = originalRead; }
    assert.ok(changedBody > 0);
    assert.equal(canonicalValue(domain).includes('general_schema_solver'), false);
    assert.equal(domain.admission_foundation.rule_discharge_complete, false);
});

test('N02G:PATH-V3-071 structural constraints classify only genuine locator members and preserve declared optional paths before M', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const documents = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = documents.get('docs/contracts/next/provenance-v2/graphs-v2.json');
    const claims = new Map(documents.get(corpus.claim_contract.path).claims.map(row => [row.fact_key, row]));
    const choices = new Map();
    for (const [rowIndex, row] of preparation.rows.entries()) for (const [siteIndex, site] of row.sites.entries()) {
        if (!site.domain_complete || !site.domain.locators.length) continue;
        if (!choices.has(site.authored_site.definition)) choices.set(site.authored_site.definition, { rowIndex, siteIndex });
        if (site.authored_site.definition !== 'claimPath' || choices.has('absent_claim')) continue;
        const absent = site.domain.locators.findIndex(locator => {
            let value = claims.get(row.target.fact_key);
            for (const key of locator.segments) {
                if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, key)) return true;
                value = value[key];
            }
            return false;
        });
        if (absent >= 0) choices.set('absent_claim', { rowIndex, siteIndex, absent });
    }
    let present = 0, absent = 0;
    for (const { rowIndex, siteIndex } of choices.values()) {
        const domain = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex });
        const site = domain.admission_foundation.sites[siteIndex];
        for (const frame of site.frames) {
            const constraint = frame.structural_locator_constraint;
            assert.ok(constraint, 'missing pre-M structural locator constraint');
            assert.equal(constraint.checker, 'graph_structure');
            assert.equal(constraint.baseline_locator_resolved, true);
            assert.equal(constraint.normal_baseline_admission_verified, false);
            assert.equal(constraint.compiler_result_used, false);
            assert.equal(constraint.qualified, false);
            if (constraint.resolution === 'present_authored_locator') {
                present++; assert.equal(constraint.expected_native_coordinate, null);
            } else {
                absent++; assert.equal(constraint.resolution, 'absent_authored_claim_path');
                assert.equal(constraint.expected_native_coordinate.code, 'claim_path');
                assert.deepEqual(constraint.expected_native_coordinate.site_path,
                    preparation.rows[rowIndex].sites[siteIndex].authored_site.site_path);
            }
        }
        const changed = structuredClone(domain);
        changed.admission_foundation.sites[siteIndex].frames[0].structural_locator_constraint.resolution = 'invented_admission';
        assert.throws(() => api.verifyPathQualificationAdmissionDomain({ domain, candidate: changed }));
        assert.equal(canonicalValue(domain.admission_foundation).includes('invented_admission'), false);
        assert.equal(domain.qualified, false);
    }
    assert.ok(present > 0);
    assert.equal(absent > 0, choices.has('absent_claim'));
    // Optional declarations are not necessarily members of the same nominal
    // domain of an actual predicate site. Reuse the existing enumeration test
    // case instead of inventing an operational missing-path candidate.
    const enumeration = require('../../../src/next/provenance/pathLocatorDomainV3').createLocatorDomainEnumeration(input.packageReceipt);
    let optional = 0;
    for (const [factKey, claim] of claims) if (!Object.hasOwn(claim, 'filters')) {
        assert.ok(enumeration.enumerateClaimLocators(factKey).some(row => canonicalValue(row.segments) === '["filters"]'));
        optional++;
    }
    assert.ok(optional > 0);
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate: admittedCandidate(api, preparation),
        phaseProfile: await phaseFixture() });
    const fs = require('node:fs'), path = require('node:path'), originalRead = fs.readFileSync;
    let changed = 0;
    fs.readFileSync = function(file, ...args) {
        const value = originalRead.call(this, file, ...args);
        if (path.resolve(String(file)) !== path.resolve(__dirname, '../../../src/next/provenance/graphStructure.js')) return value;
        const source = value.toString().replace("if (!Array.isArray(ref.segments) || !ref.segments.length) fail('claim_path');",
            "if (false) fail('claim_path');");
        assert.notEqual(source, value.toString()); changed++;
        return typeof value === 'string' ? source : Buffer.from(source);
    };
    try { assert.throws(() => contract.sealPathCandidateProgramExpectation({ authorship }), /admission_checker_structure_contract_pin/); }
    finally { fs.readFileSync = originalRead; }
    assert.ok(changed > 0);
});

test('N02G:PATH-V3-070 pinned normal read frames prove only conditional preservation and reject a changed checker before family sealing', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const fs = require('node:fs'), path = require('node:path');
    const sha = value => 'sha256:' + require('node:crypto').createHash('sha256').update(value).digest('hex');
    const preparation = api.preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.sites.every(site => site.domain_complete)
        && row.sites.some(site => site.domain.locators.length));
    const domain = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex });
    const contracts = domain.admission_foundation.normal_read_rule_contracts;
    assert.ok(contracts, 'missing pinned conditional normal read frame contracts');
    assert.deepEqual(contracts.map(row => row.pass_id), ['static_evidence', 'graph_dependencies', 'operand_bindings', 'schema_registry_projection', 'template_references', 'obligation_bindings', 'claim_requirements', 'collection_requirements', 'selection_bindings']);
    for (const contract of contracts) {
        assert.equal(contract.scope, 'finite_pinned_normal_body_under_plain_admitted_data_and_normal_primitives');
        assert.equal(contract.baseline_admission_required, true);
        assert.equal(contract.checker_byte_binding_required, true);
        assert.equal(contract.argument_site_only, true);
        assert.equal(contract.normal_baseline_admission_verified, false);
        assert.equal(contract.independent_code_audit, false);
        for (const binding of contract.source_bindings)
            assert.equal(sha(fs.readFileSync(path.resolve(__dirname, '../../..', binding.path))), binding.sha256);
    }
    for (const site of domain.admission_foundation.sites) for (const frame of site.frames) {
        for (const contract of contracts) {
            const rule = frame.rule_dependency_frames.find(rule => rule.pass_id === contract.pass_id);
            assert.equal(rule.normal_read_rule_contract_sha256, sha(canonicalValue(contract)));
            assert.equal(rule.conditional_preservation_verified, rule.dependency_frame_verified);
            assert.equal(rule.normal_checker_read_coverage_verified, false);
            assert.equal(rule.discharged, false);
        }
        assert.equal(frame.normal_rule_frame_proved, false);
    }
    for (const mutate of [value => value.admission_foundation.normal_read_rule_contracts.pop(),
        value => value.admission_foundation.normal_read_rule_contracts[0].source_bindings[0].sha256 = 'sha256:' + '0'.repeat(64),
        value => value.admission_foundation.normal_read_rule_contracts[0].baseline_admission_required = false,
        value => value.admission_foundation.normal_read_rule_contracts[0].normal_baseline_admission_verified = true]) {
        const value = structuredClone(domain); mutate(value);
        assert.throws(() => api.verifyPathQualificationAdmissionDomain({ domain, candidate: value }));
    }
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate: admittedCandidate(api, preparation),
        phaseProfile: await phaseFixture() });
    const original = fs.readFileSync;
    let changed = 0;
    fs.readFileSync = function(file, ...args) {
        const value = original.call(this, file, ...args);
        if (path.resolve(String(file)) !== path.resolve(__dirname, '../../../src/next/provenance/graphCompiler.js')) return value;
        const source = value.toString().replace("if (graph.claim_id !== claim.claim_id) fail('claim_mismatch');",
            "if (false) fail('claim_mismatch');");
        assert.notEqual(source, value.toString()); changed++;
        return typeof value === 'string' ? source : Buffer.from(source);
    };
    try { assert.throws(() => contract.sealPathCandidateProgramExpectation({ authorship }), /admission_checker_read_contract_pin/); }
    finally { fs.readFileSync = original; }
    assert.ok(changed > 0);
    assert.equal(domain.admitted_domain_complete, domain.sites.every(site => site.admitted_domain_complete));
    assert.equal(domain.admission_foundation.rule_discharge_complete, false);
    assert.equal(domain.qualified, false);
});

test('N02G:PATH-V3-069 normal admission checker bytes bind the genuine family before C without discharging semantic rules', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const { buildCapturedValidationTools } = await import('../../../scripts/agent/buildNextValidationTcb.mjs');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const fs = require('node:fs'), path = require('node:path');
    const sha = value => 'sha256:' + require('node:crypto').createHash('sha256').update(value).digest('hex');
    const preparation = api.preparePathQualificationInventory(await fixture());
    const candidate = admittedCandidate(api, preparation), phaseProfile = await phaseFixture();
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile });
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship });
    const reference = expectation.normal_admission_checker_reference;
    assert.ok(reference, 'missing pre-C normal admission checker byte reference');
    const foundation = api.readPathCandidateProgramAuthorship({ authorship }).admissionFoundation;
    assert.equal(reference.admission_foundation_sha256, sha(canonicalValue(foundation)));
    assert.deepEqual(reference.normal_rule_composition, foundation.normal_rule_composition);
    assert.equal(reference.normal_rule_composition_sha256, sha(canonicalValue(foundation.normal_rule_composition)));
    assert.equal(reference.normal_rule_composition.conditional_coverage_complete, true);
    assert.equal(reference.normal_rule_composition.admitted_domain_complete, false);
    assert.ok(Object.values(reference.normal_rule_composition.required_premises).every(value => value === false));
    assert.deepEqual(reference.method_authority, foundation.method_authority);
    assert.deepEqual(reference.passes.map(pass => pass.id), foundation.passes.map(pass => pass.id));
    const expectedPaths = [...new Set(foundation.passes.flatMap(pass => pass.checker_sources))].sort();
    assert.deepEqual(reference.sources.map(source => source.path), expectedPaths);
    for (const source of reference.sources) {
        assert.equal(source.source, fs.readFileSync(path.resolve(__dirname, '../../..', source.path), 'utf8'));
        assert.equal(source.sha256, sha(source.source));
    }
    for (const pass of reference.passes) {
        const original = foundation.passes.find(row => row.id === pass.id);
        assert.deepEqual(pass.source_bindings.map(source => source.path), original.checker_sources);
        assert.equal(pass.normal_checker_read_coverage_verified,
            ['static_evidence', 'graph_dependencies', 'operand_bindings', 'schema_registry_projection', 'template_references', 'obligation_bindings', 'claim_requirements', 'collection_requirements', 'selection_bindings'].includes(pass.id));
        assert.equal(pass.discharged, false);
    }
    assert.equal(reference.sealed_before_captured_compile, true);
    assert.equal(reference.rule_discharge_complete, false);
    assert.deepEqual(reference.normal_read_rule_contracts.map(row => row.pass_id),
        foundation.normal_read_rule_contracts.map(row => row.pass_id));
    for (const contract of reference.normal_read_rule_contracts) {
        assert.equal(contract.source_bindings_verified, true);
        assert.equal(contract.normal_checker_read_coverage_verified, true);
        assert.equal(contract.conditional_preservation_verified, foundation.sites.every(site => site.domain_complete
            && site.frames.every(frame => frame.rule_dependency_frames.find(row => row.pass_id === contract.pass_id).dependency_frame_verified)));
        assert.equal(contract.normal_baseline_admission_verified, false);
        assert.equal(contract.discharged, false);
        assert.equal(contract.independent_code_audit, false);
    }
    assert.equal(reference.normal_structural_locator_contract.source_bindings_verified, true);
    assert.equal(reference.normal_structural_locator_contract.classification_complete, true);
    assert.equal(reference.normal_structural_locator_contract.normal_baseline_admission_verified, false);
    assert.equal(reference.normal_structural_locator_contract.discharged, false);
    assert.equal(reference.normal_primitive_type_contract.source_bindings_verified, true);
    assert.equal(reference.normal_primitive_type_contract.normal_baseline_admission_verified, false);
    assert.equal(reference.normal_primitive_type_contract.discharged, false);
    assert.equal(reference.normal_primitive_type_contract.conditional_preservation_complete,
        foundation.sites.every(site => site.domain_complete
            && site.frames.every(frame => frame.structural_locator_constraint.primitive_type_constraint.conditional_preservation_verified)));
    assert.ok(Object.isFrozen(reference) && Object.isFrozen(reference.sources[0]));
    const built = buildCapturedValidationTools();
    const recipe = JSON.parse(built.entries.find(row => row.path === 'recipe.json').source);
    const binding = { expectation, sourceHashes: built.hostSourceHashes, childSourceHashes: built.child.sourceHashes,
        schemaSources: recipe.schema_sources, schemaBuildSource: recipe.recipes.find(row => row.path === 'scripts/agent/buildNextProvenanceArtifacts.mjs').source };
    const verified = contract.verifyPathCandidateCapabilityBuildBinding(binding);
    assert.equal(verified.normal_admission_checker_source_conformance, true);
    assert.equal(verified.normal_admission_checker_reference_sha256, sha(canonicalValue(reference)));
    assert.equal(verified.normal_admission_rule_discharge_complete, false);
    for (const source of reference.sources) {
        const sources = structuredClone(built.hostSourceHashes);
        const row = sources.find(row => row.path === source.path.slice('src/next/'.length));
        assert.ok(row);
        row.sha256 = 'sha256:' + '0'.repeat(64);
        assert.throws(() => contract.verifyPathCandidateCapabilityBuildBinding({ ...binding, sourceHashes: sources }));
        assert.throws(() => contract.verifyPathCandidateCapabilityBuildBinding({ ...binding,
            sourceHashes: built.hostSourceHashes.filter(row => row.path !== source.path.slice('src/next/'.length)) }));
    }
    assert.throws(() => contract.verifyPathCandidateCapabilityBuildBinding({ ...binding, expectation: structuredClone(expectation) }));
    assert.throws(() => contract.verifyPathCandidateCapabilityBuildBinding({ ...binding,
        sourceHashes: [...built.hostSourceHashes, built.hostSourceHashes[0]] }));
    let touched = false;
    const active = structuredClone(built.hostSourceHashes);
    Object.defineProperty(active[0], 'sha256', { enumerable: true, get() { touched = true; throw new Error('active'); } });
    assert.throws(() => contract.verifyPathCandidateCapabilityBuildBinding({ ...binding, sourceHashes: active }));
    assert.equal(touched, false);
    const originalRead = fs.readFileSync;
    try {
        for (const source of reference.sources) {
            fs.readFileSync = function(file, ...args) {
                const value = originalRead.call(this, file, ...args);
                if (path.resolve(String(file)) !== path.resolve(__dirname, '../../..', source.path)) return value;
                return typeof value === 'string' ? value + '\n/* checker drift */' : Buffer.concat([value, Buffer.from('\n/* checker drift */')]);
            };
            assert.throws(() => contract.recheckPathCandidateCapabilities({ expectation }));
        }
    } finally { fs.readFileSync = originalRead; }
    contract.recheckPathCandidateCapabilities({ expectation });
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    require('../../../src/next/provenance/pathSemanticReference').sealPathQualificationReference({ candidate });
    let capture, changedReads = 0;
    fs.readFileSync = function(file, ...args) {
        const value = originalRead.call(this, file, ...args);
        if (path.resolve(String(file)) !== path.resolve(__dirname, '../../../src/next/provenance/graphStructure.js')) return value;
        changedReads++;
        return typeof value === 'string' ? value + '\n/* captured checker drift */'
            : Buffer.concat([value, Buffer.from('\n/* captured checker drift */')]);
    };
    try { capture = compiler.capturePathQualificationCompiler(); } finally { fs.readFileSync = originalRead; }
    assert.ok(changedReads > 0);
    let failure;
    try { compiler.compilePathQualificationProgramCandidate({ capture, candidate, expectation }); }
    catch (error) { failure = error; }
    assert.match(failure?.message ?? '', /admission_checker_BUILD_binding/);
    const retained = compiler.readPathQualificationCompilerEvidence(failure);
    assert.equal(retained.capability_conformance_failed, true);
    assert.equal(retained.stage, 'before_first_normal_compile');
    assert.equal(retained.handle_attempts, 0);
    assert.equal(retained.semantic_mutation_credit, 0);
    assert.throws(() => compiler.compilePathQualificationProgramCandidate({ capture, candidate, expectation }), /poisoned/);
    assert.equal(expectation.qualified, false);
    assert.equal(expectation.semantic_mutation_credit, 0);
    assert.equal(reference.independent_checker_semantics, false);
});

test('N02G:PATH-V3-068 relational rule dependency frames distinguish unchanged queries from argument sensitive bindings before M', async () => {
    const { preparePathQualificationInventory, preparePathQualificationAdmissionDomain } = require('../../../src/next/provenance/pathQualificationV3');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const input = await fixture(), preparation = preparePathQualificationInventory(input);
    const graphs = new Map(admittedDocuments(input.packageReceipt).find(entry => entry.path.endsWith('/graphs-v2.json'))
        .value.graphs.map(graph => [graph.fact_key, graph]));
    const expectedPasses = ['static_evidence', 'graph_dependencies', 'operand_bindings', 'schema_registry_projection', 'template_references',
        'obligation_bindings', 'claim_requirements', 'collection_requirements', 'selection_bindings'];
    const targets = [];
    for (let rowIndex = 0; rowIndex < preparation.rows.length; rowIndex++) {
        const row = preparation.rows[rowIndex], graph = graphs.get(row.target.fact_key);
        const predicate = graph.predicates.find(predicate => predicate.id === row.target.predicate_id);
        if (!row.sites.every(site => site.domain_complete) || !row.sites.some(site => site.domain.locators.length)) continue;
        const sensitive = predicate.obligation === 'node_identity' || predicate.obligation === 'semantic_integrity'
            || ['kind_is', 'fingerprint_is', 'ref_targets_node'].includes(predicate.op);
        if ((!sensitive && !targets.some(target => !target.sensitive)) || (sensitive && !targets.some(target => target.sensitive)))
            targets.push({ rowIndex, sensitive });
        if (targets.length === 2) break;
    }
    assert.equal(targets.length, 2);
    for (const target of targets) {
        const foundation = preparePathQualificationAdmissionDomain({ preparation, rowIndex: target.rowIndex }).admission_foundation;
        let frames = 0;
        for (const site of foundation.sites) for (const frame of site.frames) {
            frames++;
            assert.ok(frame.rule_dependency_frames, 'missing relational rule dependency frames');
            assert.deepEqual(frame.rule_dependency_frames.map(rule => rule.pass_id), expectedPasses);
            for (const rule of frame.rule_dependency_frames) {
                assert.equal(rule.dependency_frame_verified, rule.baseline_projection_sha256 === rule.mutant_projection_sha256);
                assert.equal(rule.normal_checker_read_coverage_verified, false);
                assert.equal(rule.discharged, false);
            }
            for (const id of expectedPasses.slice(0, 3)) {
                const rule = frame.rule_dependency_frames.find(rule => rule.pass_id === id);
                assert.equal(rule.dependency_frame_verified, true);
                assert.equal(rule.basis, 'unchanged_graph_and_documents_no_predicate_argument_reads');
            }
            const obligation = frame.rule_dependency_frames.find(rule => rule.pass_id === 'obligation_bindings');
            assert.equal(obligation.dependency_frame_verified, !target.sensitive);
            if (target.sensitive) assert.notEqual(obligation.baseline_projection_sha256, obligation.mutant_projection_sha256);
        }
        assert.ok(frames > 0);
        assert.equal(foundation.rule_discharge_complete, false);
        assert.equal(foundation.compiler_result_used, false);
    }
});

test('N02G:PATH-V3-067 admission foundation seals normal pass obligations and exact single site frames before M without claiming complete A', async () => {
    const { preparePathQualificationInventory, preparePathQualificationAdmissionDomain,
        verifyPathQualificationAdmissionDomain } = require('../../../src/next/provenance/pathQualificationV3');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const hash = value => 'sha256:' + require('node:crypto').createHash('sha256').update(canonicalValue(value)).digest('hex');
    const input = await fixture(), preparation = preparePathQualificationInventory(input);
    const rowIndex = preparation.rows.findIndex(row => row.sites.every(site => site.domain_complete)
        && row.sites.some(site => site.domain.locators.length > 1));
    assert.ok(rowIndex >= 0);
    const row = preparation.rows[rowIndex];
    const graph = admittedDocuments(input.packageReceipt).find(entry => entry.path.endsWith('/graphs-v2.json'))
        .value.graphs.find(graph => graph.fact_key === row.target.fact_key);
    const predicateIndex = graph.predicates.findIndex(predicate => predicate.id === row.target.predicate_id);
    const domain = preparePathQualificationAdmissionDomain({ preparation, rowIndex });
    const foundation = domain.admission_foundation;
    assert.ok(foundation, 'missing pre-M declarative admission foundation');
    assert.equal(foundation.graph_sha256, hash(graph));
    assert.equal(foundation.rule_discharge_complete, false);
    assert.equal(foundation.normal_pipeline_binding_verified, false);
    assert.equal(foundation.compiler_result_used, false);
    assert.deepEqual(foundation.passes.map(pass => pass.id), ['package_schemas', 'schema_registry_projection',
        'static_evidence', 'graph_dependencies', 'operand_bindings', 'graph_structure', 'template_references',
        'predicate_types', 'obligation_bindings', 'claim_requirements', 'selection_bindings', 'collection_requirements']);
    assert.equal(foundation.documents.length, admittedDocuments(input.packageReceipt).length);
    for (const pass of foundation.passes) {
        assert.equal(pass.status, 'pending_normative_rule_discharge');
        assert.equal(pass.instance.fact_key, row.target.fact_key);
        assert.equal(pass.instance.predicate_id, row.target.predicate_id);
        assert.deepEqual(pass.instance.predicate, graph.predicates[predicateIndex]);
        assert.equal(pass.discharged, false);
        assert.ok(pass.checker_sources.length > 0);
    }
    for (const site of foundation.sites) {
        const source = row.sites[site.site_index];
        assert.deepEqual(site.graph_location, ['predicates', predicateIndex, ...source.domain.location]);
        assert.equal(site.frames.length, source.domain.locators.length);
        const erase = value => {
            const result = structuredClone(value); let container = result;
            for (const token of site.graph_location.slice(0, -1)) container = container[token];
            container[site.graph_location.at(-1)] = null;
            return hash(result);
        };
        assert.equal(site.unchanged_authorship_sha256, erase(graph));
        for (const frame of site.frames) {
            const mutant = structuredClone(graph); let container = mutant;
            for (const token of site.graph_location.slice(0, -1)) container = container[token];
            container[site.graph_location.at(-1)] = structuredClone(source.domain.locators[frame.locator_index]);
            assert.equal(frame.original_locator_sha256, hash(source.domain.original));
            assert.equal(frame.alternative_locator_sha256, hash(source.domain.locators[frame.locator_index]));
            assert.equal(frame.mutant_authorship_sha256, hash(mutant));
            assert.equal(frame.unchanged_authorship_sha256, erase(mutant));
            assert.equal(frame.single_site_frame_verified, true);
            assert.equal(frame.normal_rule_frame_proved, false);
        }
    }
    assert.equal(verifyPathQualificationAdmissionDomain({ domain, candidate: structuredClone(domain) }).foundation_integrity, true);
    for (const mutate of [x => x.admission_foundation.passes.pop(),
        x => x.admission_foundation.passes[0].discharged = true,
        x => x.admission_foundation.passes[1].instance.predicate.args.reverse(),
        x => x.admission_foundation.documents.pop(),
        x => x.admission_foundation.sites[0].graph_location.reverse(),
        x => x.admission_foundation.sites.find(site => site.frames.length).frames.pop(),
        x => x.admission_foundation.rule_discharge_complete = true]) {
        const candidate = structuredClone(domain); mutate(candidate);
        assert.throws(() => verifyPathQualificationAdmissionDomain({ domain, candidate }));
    }
    for (let index = 0; index < foundation.passes.length; index++) {
        const candidate = structuredClone(domain);
        candidate.admission_foundation.passes[index].checker_sources = ['caller_checker.js'];
        assert.throws(() => verifyPathQualificationAdmissionDomain({ domain, candidate }));
    }
    let effects = 0;
    const active = structuredClone(domain);
    Object.defineProperty(active.admission_foundation.passes[0], 'instance', {
        enumerable: true, get() { effects++; return foundation.passes[0].instance; } });
    assert.throws(() => verifyPathQualificationAdmissionDomain({ domain, candidate: active }));
    const proxy = structuredClone(domain);
    proxy.admission_foundation.sites[0] = new Proxy(proxy.admission_foundation.sites[0], {
        ownKeys() { effects++; return []; } });
    assert.throws(() => verifyPathQualificationAdmissionDomain({ domain, candidate: proxy }));
    assert.throws(() => verifyPathQualificationAdmissionDomain({ domain: structuredClone(domain), candidate: domain }));
    assert.equal(effects, 0);
    assert.equal(domain.qualified, false);
    assert.equal(domain.semantic_mutation_credit, 0);
});

test('N02G:PATH-V3-066 captured INTERNAL witness entry binds external pins and blocks incomplete prerequisites before handles', async () => {
    const { buildCapturedValidationTools } = await import('../../../scripts/agent/buildNextValidationTcb.mjs');
    const built = buildCapturedValidationTools();
    let handles = 0;
    const tools = require('node:vm').runInThisContext(`(function(require){return ${built.source}\n})`)(name => {
        if (name === 'node:fs') return Object.freeze({ readFileSync() { handles++; throw new Error('no handles'); } });
        if (name === 'node:child_process') return { spawn() { handles++; throw new Error('no child'); },
            fork() { handles++; throw new Error('no child'); } };
        return require(name);
    });
    assert.equal(typeof tools.initializePathQualification, 'function');
    const { canonicalValue, digest } = require('../../../src/next/kernel/canonicalValue');
    const hash = value => 'sha256:' + require('node:crypto').createHash('sha256').update(value).digest('hex');
    const commitment = source => 'sha256:' + digest({ source });
    // Synthetic blocked transport construction, NOT an audited/executable ticket.
    const normalAdmissionBasis = {
        stage: 'path_v3_captured_normal_admission_basis_not_independent_review',
        conditional_partition: null, normal_rule_reference: null, premise_evidence: null,
        native_controls: null, normal_worlds: [],
        independent_reviewed_rule_basis_verified: false, qualified: false, semantic_mutation_credit: 0 };
    const payloadSource = canonicalValue({ worlds: [], normal_admission_basis: normalAdmissionBasis });
    const ticket = { stage: 'path_v3_execution_ticket_not_financial_authority', method_commit: '72fc5a5b707909687da9b5cec892be2dcc892a62',
        candidate_id: 'candidate/blocked', invocation_id: 'invocation/blocked', target_fact_key: 'S-01#1#1',
        reference: { candidate_id: 'candidate/blocked', invocation_id: 'invocation/blocked', discriminating: true },
        reference_commitment: 'sha256:' + digest({ candidate_id: 'candidate/blocked', invocation_id: 'invocation/blocked', discriminating: true }),
        preselection_commitments: { entries_sha256: hash('entries'), domain_sha256: hash('domain') },
        normal_admission_basis_commitment: commitment(canonicalValue(normalAdmissionBasis)),
        prerequisites: { admitted_domain_complete: false, witness_domain_complete: false, first_witness_proved: false,
            normal_admission_verified: false, reference_preselected: true, normal_compilation_complete: false },
        payload_commitment: commitment(payloadSource), worlds: ['C', 'M', 'S'].map(variant =>
            ({ variant, execution_id: 'execution/' + variant, package_root: hash(variant) })) };
    const ticketSource = canonicalValue(ticket), expectedTicketCommitment = commitment(ticketSource);
    const freezeBytes = Buffer.from(canonicalValue({ schema_version: 1, freeze_id: 'provenance_execution', freeze_version: 1,
        stage: 'execution', metric_registry_hash: hash('registry'), validation_tcb_root: built.artifact_root,
        child_capsule_root: built.child.artifact_root, native_runtime: { platform: process.platform, arch: process.arch,
            node_version: process.version, node_binary_sha256: 'sha256:' + '0'.repeat(64) },
        package_authority: [{ path: 'docs/sample.json', sha256: hash('{}') }],
        proof_programs: [{ program_id: hash('program'), proof_engine_artifact_root: hash('proof') }] }));
    const bootstrap = { freezeBytes, expectedFreezeHash: hash(freezeBytes), tcbArtifact: { manifestBytes: Buffer.from(built.manifest),
        entries: built.entries.map(row => ({ path: row.path, bytes: Buffer.from(row.source) })) } };
    const input = { ticketSource, payloadSource, expectedTicketCommitment };
    let effects = 0;
    const active = { payloadSource, expectedTicketCommitment };
    Object.defineProperty(active, 'ticketSource', { enumerable: true, get() { effects++; return ticketSource; } });
    for (const bad of [active, new Proxy(input, { ownKeys() { effects++; return []; } }),
        { ...input, extra: true }, { ...input, payloadSource: payloadSource + ' ' },
        { ...input, ticketSource: canonicalValue({ ...ticket, invocation_id: 'caller' }) }])
        assert.throws(() => tools.initializePathQualification(bad, bootstrap));
    assert.equal(effects, 0); assert.equal(handles, 0);
    const host = tools.initializePathQualification(input, bootstrap);
    assert.equal(host.candidate_id, ticket.candidate_id); assert.equal(host.invocation_id, ticket.invocation_id);
    assert.equal(host.execution_permitted, false); assert.equal(host.qualified, false);
    assert.equal(host.financial_acceptance, false); assert.equal(host.semantic_mutation_credit, 0);
    assert.equal(Object.isFrozen(host), true);
    assert.equal(host.runAdmittedGraph, undefined);
    await assert.rejects(host.run.call({ ...host }), /origin/);
    await assert.rejects(host.run(), /prerequisites/);
    await assert.rejects(host.run(), /replay/);
    assert.equal(handles, 0);
    const launcherSource = built.entries.find(row => row.path === 'launcher-bootstrap.js').source;
    const launch = require('node:vm').runInThisContext(`(function(require){return ${launcherSource}\n})`)(name => {
        if (name === 'node:fs') return Object.freeze({ readFileSync() { handles++; throw new Error('no handles'); } });
        if (name === 'node:child_process') return { spawn() { handles++; throw new Error('no child'); },
            fork() { handles++; throw new Error('no child'); } };
        return require(name);
    });
    assert.throws(() => launch({ ...bootstrap, qualification: { ...input, expectedTicketCommitment: hash('caller') } }), /pin/);
    const qualification = { ...input }, loaded = launch({ ...bootstrap, qualification });
    qualification.ticketSource = 'caller mutation'; qualification.payloadSource = '{}';
    assert.deepEqual(Object.keys(loaded).sort(), ['financial_acceptance', 'initializePathQualification', 'stage']);
    assert.throws(() => loaded.initializePathQualification.call({ ...loaded }), /origin/);
    assert.throws(() => loaded.initializePathQualification({ invocation_id: 'caller' }), /origin/);
    const capturedHost = loaded.initializePathQualification();
    assert.equal(capturedHost.invocation_id, ticket.invocation_id);
    assert.throws(() => loaded.initializePathQualification(), /already_initialized/);
    await assert.rejects(capturedHost.run(), /prerequisites/);
    assert.equal(handles, 0);
    // Synthetic malformed provisioning exercises source-shape rejection only.
    // Locally computed pins/true flags are NOT audited admission or permission;
    // these payloads must fail before registry admission, runtime or D/P.
    const world = variant => ({ variant, package_root: hash(variant), proof_program_id: hash('program'),
        evaluator_ref: { evaluator_id: 'synthetic', evaluator_version: 1 }, registry_source: '{}', contract_source: '{}',
        metric_artifact: { manifest: '{}', entries: [] }, proof_artifact: { manifest: '{}', entries: [] },
        derivation: {}, proof: {}, timeout_ms: 5000 });
    const absentBasisPayload = canonicalValue({ worlds: ['C', 'M', 'S'].map(world),
        normal_admission_basis: normalAdmissionBasis });
    const absentBasisTicket = canonicalValue({ ...ticket,
        prerequisites: Object.fromEntries(Object.keys(ticket.prerequisites).map(key => [key, true])),
        payload_commitment: commitment(absentBasisPayload) });
    const absentBasisHost = tools.initializePathQualification({ ticketSource: absentBasisTicket,
        payloadSource: absentBasisPayload, expectedTicketCommitment: commitment(absentBasisTicket) }, bootstrap);
    await assert.rejects(absentBasisHost.run(), /captured_path_normal_admission_basis_relation/);
    await assert.rejects(absentBasisHost.run(), /replay/);
    assert.equal(handles, 0);
    for (const variant of ['C', 'M', 'S']) for (const field of ['registry_source', 'contract_source',
        'metric_artifact.manifest', 'proof_artifact.manifest']) for (const bad of [null, true, 7, [], {}]) {
        const worlds = ['C', 'M', 'S'].map(world);
        const row = worlds.find(item => item.variant === variant), parts = field.split('.');
        if (parts.length === 1) row[field] = bad; else row[parts[0]][parts[1]] = bad;
        const malformedPayload = canonicalValue({ worlds, normal_admission_basis: normalAdmissionBasis });
        const malformedTicket = canonicalValue({ ...ticket,
            prerequisites: Object.fromEntries(Object.keys(ticket.prerequisites).map(key => [key, true])),
            payload_commitment: commitment(malformedPayload) });
        const malformed = tools.initializePathQualification({ ticketSource: malformedTicket,
            payloadSource: malformedPayload, expectedTicketCommitment: commitment(malformedTicket) }, bootstrap);
        await assert.rejects(malformed.run(), /captured_path_source_type/, `${variant}/${field}/${JSON.stringify(bad)}`);
        await assert.rejects(malformed.run(), /replay/);
    }
    // The BUILD transport carries the normal closed id/version reference.
    // Bad references must fail before even the deliberately invalid registry
    // source below, without running any admitted graph or acquiring handles.
    for (const variant of ['C', 'M', 'S']) for (const bad of ['synthetic', null, [], {},
        { evaluator_id: 'synthetic' }, { evaluator_id: 'synthetic', evaluator_version: 0 },
        { evaluator_id: 'synthetic', evaluator_version: '1' },
        { evaluator_id: 7, evaluator_version: 1 },
        { evaluator_id: 'synthetic', evaluator_version: 1, extra: true }]) {
        const worlds = ['C', 'M', 'S'].map(world), row = worlds.find(item => item.variant === variant);
        row.evaluator_ref = bad; row.registry_source = null;
        const malformedPayload = canonicalValue({ worlds, normal_admission_basis: normalAdmissionBasis });
        const malformedTicket = canonicalValue({ ...ticket,
            prerequisites: Object.fromEntries(Object.keys(ticket.prerequisites).map(key => [key, true])),
            payload_commitment: commitment(malformedPayload) });
        const malformed = tools.initializePathQualification({ ticketSource: malformedTicket,
            payloadSource: malformedPayload, expectedTicketCommitment: commitment(malformedTicket) }, bootstrap);
        await assert.rejects(malformed.run(), /captured_path_evaluator_ref/, `${variant}/${JSON.stringify(bad)}`);
        await assert.rejects(malformed.run(), /replay/);
    }
    assert.equal(handles, 0);
});

test('N02G:PATH-V3-065 invalid phase authority poisons the witness bridge before compile and keeps genuine failure evidence', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const preparation = api.preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
        && row.target.predicate_id === 'link_2_refund_sign');
    const plan = api.preparePathQualificationWitnessPreselection({ preparation, rowIndex });
    const capture = compiler.capturePathQualificationCompiler(), phaseProfile = await phaseFixture();
    let effects = 0;
    const activeProfile = new Proxy(phaseProfile, { get() { effects++; throw new Error('active'); } });
    let failure;
    try { compiler.compilePathQualificationWitnessPreselection({ capture, plan, phaseProfile: activeProfile }); }
    catch (error) { failure = error; }
    assert.ok(failure);
    assert.equal(effects, 0);
    const evidence = compiler.readPathQualificationCompilerEvidence(failure);
    assert.ok(evidence);
    assert.equal(evidence.normal_compile_path_entered, false);
    assert.equal(evidence.stage, 'path_v3_witness_program_preparation_failed_before_compile');
    assert.equal(evidence.invocation_id, plan.selected.invocation_id);
    assert.deepEqual(evidence.witness_preselection.selected, plan.selected);
    assert.equal(evidence.handle_attempts, 0);
    assert.equal(evidence.qualified, false);
    assert.equal(evidence.dp_execution, false);
    assert.equal(evidence.semantic_mutation_credit, 0);
    assert.equal(compiler.readPathQualificationCompilerEvidence(new Error(failure.message)), null);
    assert.throws(() => api.takePathQualificationWitnessPreselection({ plan }));
    assert.throws(() => compiler.compilePathQualificationWitnessPreselection({ capture, plan: null, phaseProfile }),
        /capture_authority_or_poisoned/);
    assert.throws(() => compiler.readPathQualificationProgramsEvidence({ result: failure, variant: 'C' }));
});

test('N02G:PATH-V3-064 preselected reference is bound to whole real normal C M S programs without caller choice or qualification', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    assert.equal(typeof compiler.compilePathQualificationWitnessPreselection, 'function');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
        && row.target.predicate_id === 'link_2_refund_sign');
    const plan = api.preparePathQualificationWitnessPreselection({ preparation, rowIndex });
    const capture = compiler.capturePathQualificationCompiler(), phaseProfile = await phaseFixture();
    assert.throws(() => compiler.compilePathQualificationWitnessPreselection({ capture, plan: structuredClone(plan), phaseProfile }));
    assert.throws(() => compiler.compilePathQualificationWitnessPreselection({ capture: structuredClone(capture), plan, phaseProfile }));
    assert.throws(() => compiler.compilePathQualificationWitnessPreselection({ capture, plan, phaseProfile, expected: false }));
    let effects = 0;
    const active = { capture, phaseProfile };
    Object.defineProperty(active, 'plan', { enumerable: true, get() { effects++; return plan; } });
    assert.throws(() => compiler.compilePathQualificationWitnessPreselection(active));
    const proxy = new Proxy(plan, { get() { effects++; throw new Error('active'); } });
    assert.throws(() => compiler.compilePathQualificationWitnessPreselection({ capture, plan: proxy, phaseProfile }));
    assert.equal(effects, 0);
    const result = compiler.compilePathQualificationWitnessPreselection({ capture, plan, phaseProfile });
    assert.equal(typeof compiler.preparePathQualificationExecutionTransport, 'function');
    assert.throws(() => compiler.preparePathQualificationExecutionTransport({ result: structuredClone(result) }));
    assert.throws(() => compiler.preparePathQualificationExecutionTransport({ result, expected: true }));
    const transport = compiler.preparePathQualificationExecutionTransport({ result });
    const ticket = JSON.parse(transport.ticketSource), payload = JSON.parse(transport.payloadSource);
    assert.ok(payload.normal_admission_basis, 'missing full genuine normal admission basis in INTERNAL transport');
    assert.deepEqual(payload.normal_admission_basis.conditional_partition, plan.conditional_domain_partition);
    assert.deepEqual(payload.normal_admission_basis.normal_rule_reference,
        result.program_expectation.normal_admission_checker_reference);
    assert.deepEqual(payload.normal_admission_basis.premise_evidence,
        result.witness_site_admission_controls.normal_admission_premise_evidence);
    assert.deepEqual(payload.normal_admission_basis.native_controls, result.witness_site_admission_controls);
    assert.deepEqual(payload.normal_admission_basis.native_controls.unknown_path_control_plan, plan.site_admission_control_plan);
    assert.deepEqual(payload.normal_admission_basis.native_controls.selection_control_plan, plan.selection_admission_control_plan);
    assert.deepEqual(payload.normal_admission_basis.normal_worlds, result.worlds);
    const basisSource = require('../../../src/next/kernel/canonicalValue').canonicalValue(payload.normal_admission_basis);
    assert.equal(ticket.normal_admission_basis_commitment,
        'sha256:' + require('../../../src/next/kernel/canonicalValue').digest({ source: basisSource }));
    assert.equal(payload.normal_admission_basis.independent_reviewed_rule_basis_verified, false);
    assert.equal(payload.normal_admission_basis.qualified, false);
    assert.equal(payload.normal_admission_basis.semantic_mutation_credit, 0);
    assert.equal(ticket.candidate_id, plan.selected.candidate_id);
    assert.equal(ticket.invocation_id, plan.selected.invocation_id);
    assert.equal(ticket.target_fact_key, 'S-01#1#1');
    assert.deepEqual(ticket.reference, result.reference);
    assert.equal(ticket.reference_commitment, plan.selected.reference_sha256);
    assert.deepEqual(ticket.worlds.map(world => world.variant), ['C', 'M', 'S']);
    assert.equal(new Set(ticket.worlds.map(world => world.execution_id)).size, 3);
    assert.equal(ticket.prerequisites.admitted_domain_complete, false);
    assert.equal(ticket.prerequisites.first_witness_proved, false);
    assert.equal(transport.qualified, false);
    assert.equal(transport.semantic_mutation_credit, 0);
    assert.equal(Object.isFrozen(transport), true);
    for (const world of payload.worlds) {
        const actual = compiler.readPathQualificationProgramsEvidence({ result, variant: world.variant })
            .find(row => row.fact_key === ticket.target_fact_key).candidate;
        assert.equal(world.proof_artifact.entries[0].source, actual.source);
        assert.equal(world.proof_artifact.manifest, actual.manifest);
    }
    assert.throws(() => compiler.preparePathQualificationExecutionTransport({ result }), /replay/);
    // End-to-end construction from the genuine BUILD result, without changing
    // its incomplete A/W flags. These measured TEST pins are not independent
    // review, and the impossible runtime pin ensures no runtime read is needed
    // to reject the captured request before handles.
    const { buildCapturedValidationTools } = await import('../../../scripts/agent/buildNextValidationTcb.mjs');
    const tcb = buildCapturedValidationTools();
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const hash = bytes => 'sha256:' + require('node:crypto').createHash('sha256').update(bytes).digest('hex');
    const proofRoots = new Map();
    for (const world of payload.worlds) {
        const root = hash(world.proof_artifact.manifest);
        if (proofRoots.has(world.proof_program_id)) assert.equal(proofRoots.get(world.proof_program_id), root);
        proofRoots.set(world.proof_program_id, root);
    }
    const freezeBytes = Buffer.from(canonicalValue({ schema_version: 1, freeze_id: 'provenance_execution', freeze_version: 1,
        stage: 'execution', metric_registry_hash: hash(payload.worlds[0].registry_source),
        validation_tcb_root: tcb.artifact_root, child_capsule_root: tcb.child.artifact_root,
        native_runtime: { platform: process.platform, arch: process.arch, node_version: process.version,
            node_binary_sha256: 'sha256:' + '0'.repeat(64) }, package_authority: plan.baseline_package,
        proof_programs: [...proofRoots].sort(([a], [b]) => a.localeCompare(b))
            .map(([program_id, proof_engine_artifact_root]) => ({ program_id, proof_engine_artifact_root })) }));
    let capturedHandles = 0;
    const launcherSource = tcb.entries.find(row => row.path === 'launcher-bootstrap.js').source;
    const launch = require('node:vm').runInThisContext(`(function(require){return ${launcherSource}\n})`)(name => {
        if (name === 'node:fs') return Object.freeze({ readFileSync() { capturedHandles++; throw new Error('no handles'); } });
        if (name === 'node:child_process') return { spawn() { capturedHandles++; throw new Error('no child'); },
            fork() { capturedHandles++; throw new Error('no child'); } };
        return require(name);
    });
    const loaded = launch({ freezeBytes, expectedFreezeHash: hash(freezeBytes),
        tcbArtifact: { manifestBytes: Buffer.from(tcb.manifest),
            entries: tcb.entries.map(row => ({ path: row.path, bytes: Buffer.from(row.source) })) },
        qualification: { ticketSource: transport.ticketSource, payloadSource: transport.payloadSource,
            expectedTicketCommitment: transport.measured_ticket_commitment } });
    const capturedHost = loaded.initializePathQualification();
    assert.equal(capturedHost.candidate_id, result.candidate_id);
    assert.equal(capturedHost.invocation_id, result.invocation_id);
    assert.equal(capturedHost.reference_commitment, plan.selected.reference_sha256);
    assert.equal(capturedHost.execution_permitted, false);
    await assert.rejects(capturedHost.run(), /captured_path_prerequisites/);
    await assert.rejects(capturedHost.run(), /captured_path_replay/);
    assert.throws(() => loaded.initializePathQualification(), /already_initialized/);
    assert.equal(capturedHandles, 0);
    // Recomputed TEST pins exercise internal lineage, not authentication of a
    // provisioning caller or independent approval of the rewritten request.
    const commitSource = source => hash(canonicalValue({ source }));
    const basisMutations = [
        ['domain', basis => { basis.conditional_partition.domain_sha256 = hash('foreign-domain'); }],
        ['rule-composition', basis => { basis.normal_rule_reference.normal_rule_composition_sha256 = hash('foreign-rules'); }],
        ['partition-premise', basis => { basis.premise_evidence.conditional_partition_sha256 = hash('foreign-partition'); }],
        ['rule-premise', basis => { basis.premise_evidence.normal_rule_composition_sha256 = hash('foreign-premise'); }],
        ['native-controls', basis => { basis.native_controls.native_barriers_verified = false; }],
        ['positive-root', basis => { basis.normal_worlds[0].package_root = hash('foreign-package'); }],
        ['compiler-root', basis => { basis.premise_evidence.compiler_artifact_root = hash('foreign-compiler'); }],
        ['checker-source', basis => { const row = basis.normal_rule_reference.sources[0];
            row.source += '\n// foreign body'; row.sha256 = hash(row.source); }]
    ];
    // Rebind all transport/premise hashes after corrupting each observed
    // control. A checksum mismatch must not hide missing predicate checks.
    for (const key of ['unknown_path_controls', 'selection_controls']) {
        for (let index = 0; index < payload.normal_admission_basis.native_controls[key].length; index++) {
            for (const [label, mutate] of [
                ['native-match', control => { control.native_control_matched = false; }],
                ['handle-attempt', control => { control.handle_attempts = 1; }],
                ['negative-M', control => { control.worlds[1].admitted = true; }],
                ['site-coordinate', control => { control.site_index = -1; }],
                ['control-order', control => { control.control_index = -1; }],
                ['control-mode', control => { control.mode = 'foreign'; }],
                ['selected-candidate', control => { control.candidate_id = ticket.candidate_id; }],
                ['selected-invocation', control => { control.invocation_id = ticket.invocation_id; }],
                ['forged-native-authority', control => { control.worlds[1].diagnostic.forged_same_text_has_authority = true; }],
                ['qualified-control', control => { control.qualified = true; }],
                ['control-credit', control => { control.semantic_mutation_credit = 1; }],
                ['control-DP', control => { control.dp_execution = true; }],
                ['negative-coordinate', control => { control.worlds[1].diagnostic.native_coordinate = { checker: 'foreign' }; }]
            ]) basisMutations.push([`${key}/${index}/${label}`, basis => mutate(basis.native_controls[key][index]), true]);
        }
        if (payload.normal_admission_basis.native_controls[key].length) {
            basisMutations.push([`${key}/omission`, basis => { basis.native_controls[key].pop(); }, true]);
            basisMutations.push([`${key}/duplicate`, basis => {
                basis.native_controls[key].push(structuredClone(basis.native_controls[key][0]));
            }, true]);
        }
    }
    for (const [label, mutate, rebindControls] of basisMutations) {
        const changedPayload = structuredClone(payload);
        mutate(changedPayload.normal_admission_basis);
        if (rebindControls) {
            const basis = changedPayload.normal_admission_basis, controls = basis.native_controls;
            basis.premise_evidence.native_controls_sha256 = hash(canonicalValue({
                unknownControls: controls.unknown_path_controls, selectionControls: controls.selection_controls }));
            controls.normal_admission_premise_evidence = structuredClone(basis.premise_evidence);
        }
        const changedPayloadSource = canonicalValue(changedPayload);
        const changedTicketSource = canonicalValue({ ...ticket,
            payload_commitment: commitSource(changedPayloadSource),
            normal_admission_basis_commitment: commitSource(canonicalValue(changedPayload.normal_admission_basis)) });
        const changedLoaded = launch({ freezeBytes, expectedFreezeHash: hash(freezeBytes),
            tcbArtifact: { manifestBytes: Buffer.from(tcb.manifest),
                entries: tcb.entries.map(row => ({ path: row.path, bytes: Buffer.from(row.source) })) },
            qualification: { ticketSource: changedTicketSource, payloadSource: changedPayloadSource,
                expectedTicketCommitment: commitSource(changedTicketSource) } });
        assert.throws(() => changedLoaded.initializePathQualification(), /captured_path_normal_admission_basis_relation/,
            `rehashed normal admission basis ${label}`);
        assert.equal(capturedHandles, 0);
    }
    assert.equal(compiler.readPathQualificationCompilerEvidence(result), result);
    assert.equal(result.invocation_id, plan.selected.invocation_id);
    assert.equal(result.candidate_id, plan.selected.candidate_id);
    assert.deepEqual(result.reference, plan.entries[plan.selected.entry_index].reference);
    assert.equal(result.witness_preselection.entries_sha256, plan.entries_sha256);
    assert.equal(result.witness_preselection.domain_sha256, plan.domain_sha256);
    assert.deepEqual(result.witness_preselection.selected, plan.selected);
    assert.equal(result.witness_preselection.disposition, 'blocked');
    assert.equal(result.witness_preselection.admitted_domain_complete, false);
    assert.equal(result.witness_preselection.witness_domain_complete, false);
    // A captured normal compile must not masquerade as permission to run a
    // witness. This finite report is tied to this genuine capture, not caller
    // flags or a promotion of the whole A/W domains after observing M.
    const readiness = result.witness_execution_prerequisites;
    assert.ok(readiness);
    assert.equal(readiness.stage, 'path_v3_witness_execution_prerequisites_not_authority');
    assert.equal(readiness.candidate_id, result.candidate_id);
    assert.equal(readiness.invocation_id, result.invocation_id);
    assert.equal(readiness.reference_preselected, true);
    assert.equal(readiness.selected_candidate_normal_compilation_complete,
        result.worlds.length === 3 && result.worlds.every(world => world.admitted
            && world.whole_ir_conformance && world.whole_phase_program_conformance));
    assert.equal(readiness.execution_permitted, false);
    assert.equal(readiness.qualified, false);
    assert.equal(readiness.semantic_mutation_credit, 0);
    for (const blocker of ['admitted_domain_incomplete', 'first_witness_not_proved',
        'normal_site_admission_controls_incomplete', 'reviewed_tcb_and_execution_ticket_missing'])
        assert.ok(readiness.blockers.includes(blocker));
    assert.equal(readiness.blockers.includes('selected_candidate_normal_compile_rejected'),
        result.worlds.some(world => world.admitted === false));
    assert.ok(Object.isFrozen(readiness));
    assert.ok(Object.isFrozen(readiness.blockers));
    assert.equal(compiler.readPathQualificationCompilerEvidence(structuredClone(result)), null);
    for (const world of result.worlds.filter(world => world.admitted)) {
        assert.equal(world.whole_phase_program_conformance, true);
        assert.equal(world.program_count, input.ir.graphs.length);
        const programs = compiler.readPathQualificationProgramsEvidence({ result, variant: world.variant });
        assert.equal(programs.length, input.ir.graphs.length);
        assert.ok(programs.every(row => typeof row.candidate.source === 'string' && row.candidate.source.length > 0));
        assert.equal(world.effect_closure_complete, false);
    }
    assert.equal(result.worlds[0].admitted, true);
    assert.equal(result.worlds[2].admitted, true);
    for (const field of ['qualified', 'dp_execution', 'validation_tcb_complete', 'executable_consumer_absence_proved'])
        assert.equal(result[field], false);
    assert.equal(result.semantic_mutation_credit, 0);
    assert.equal(result.handle_attempts, 0);
    assert.throws(() => compiler.compilePathQualificationWitnessPreselection({ capture, plan, phaseProfile }));
});

test('N02G:PATH-V3-062 witness preselection seals independent references over authored L before compile without promoting unknown admission', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const semantic = require('../../../src/next/provenance/pathSemanticReference');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const preparation = api.preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
        && row.target.predicate_id === 'link_2_refund_sign');
    const row = preparation.rows[rowIndex];
    const plan = api.preparePathQualificationWitnessPreselection({ preparation, rowIndex });
    assert.equal(plan.entries.length, row.sites.reduce((n, site) => n + site.domain.locators.length, 0));
    assert.equal(plan.locator_domain_complete, true);
    assert.equal(plan.admitted_domain_complete, false);
    assert.equal(plan.witness_domain_complete, false);
    assert.equal(plan.normal_admission_verified, false);
    assert.equal(plan.disposition, 'blocked');
    assert.equal(plan.status, 'preselected_discriminating_reference_not_qualified');
    const first = plan.entries.findIndex(entry => entry.admission === 'unclassified'
        && entry.reference?.discriminating === true);
    assert.ok(first >= 0);
    assert.equal(plan.selected.entry_index, first);
    assert.ok(plan.entries.every(entry => entry.admission !== 'admitted'));
    assert.equal(plan.expected_violations.length, 1);
    const candidate = api.takePathQualificationWitnessPreselection({ plan });
    assert.equal(candidate.candidate_id, plan.selected.candidate_id);
    assert.equal(candidate.invocation_id, plan.selected.invocation_id);
    assert.throws(() => semantic.sealPathQualificationReference({ candidate }));
    const result = compiler.compilePathQualificationCandidate({ capture: compiler.capturePathQualificationCompiler(), candidate });
    assert.equal(semantic.readPathSemanticReference(result.reference), result.reference);
    assert.deepEqual(result.reference, plan.entries[first].reference);
    assert.deepEqual(result.worlds.map(world => world.variant), ['C', 'M', 'S']);
    assert.equal(result.worlds[0].admitted, true);
    assert.equal(result.worlds[2].admitted, true);
    assert.equal(result.qualified, false);
    assert.equal(result.semantic_mutation_credit, 0);
    assert.throws(() => api.takePathQualificationWitnessPreselection({ plan }));
    assert.throws(() => api.preparePathQualificationWitnessPreselection({ preparation, rowIndex }));
});

test('N02G:PATH-V3-063 empty or forged witness preselection cannot supply execution authority or fallback candidates', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const preparation = api.preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.sites.every(site => site.domain_complete && site.domain.locators.length === 0));
    assert.ok(rowIndex >= 0);
    assert.throws(() => api.preparePathQualificationWitnessPreselection({ preparation: structuredClone(preparation), rowIndex }));
    assert.throws(() => api.preparePathQualificationWitnessPreselection({ preparation, rowIndex, expected: false }));
    let effects = 0;
    const active = { preparation };
    Object.defineProperty(active, 'rowIndex', { enumerable: true, get() { effects++; return rowIndex; } });
    assert.throws(() => api.preparePathQualificationWitnessPreselection(active));
    const proxy = new Proxy(preparation, { get() { effects++; throw new Error('active'); } });
    assert.throws(() => api.preparePathQualificationWitnessPreselection({ preparation: proxy, rowIndex }));
    const plan = api.preparePathQualificationWitnessPreselection({ preparation, rowIndex });
    assert.deepEqual(plan.entries, []);
    assert.equal(plan.selected, null);
    assert.equal(plan.expected_violations, null);
    assert.equal(plan.disposition, 'blocked');
    assert.equal(plan.witness_domain_complete, false);
    for (const field of ['qualified', 'dp_execution', 'effect_closure_complete', 'validation_tcb_complete', 'global_g11'])
        assert.equal(plan[field], false);
    assert.equal(plan.semantic_mutation_credit, 0);
    assert.throws(() => api.takePathQualificationWitnessPreselection({ plan }));
    assert.throws(() => api.takePathQualificationWitnessPreselection({ plan: structuredClone(plan) }));
    assert.throws(() => api.takePathQualificationWitnessPreselection({ plan, selected: 0 }));
    const activePlan = new Proxy(plan, { get() { effects++; throw new Error('active'); } });
    assert.throws(() => api.takePathQualificationWitnessPreselection({ plan: activePlan }));
    assert.equal(effects, 0);
    assert.throws(() => api.preparePathQualificationWitnessPreselection({ preparation, rowIndex }));
});

test('N02G:PATH-V3-058 composition retains indirect effect sites even without recognized capability calls', async () => {
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const cases = [
        ['property_read', 'const result=value.hidden;return result;'],
        ['mutation', 'value.hidden=1;return true;'],
        ['mutation', 'delete value.hidden;return true;'],
        ['coercion', 'return value+1;'],
        ['iteration', 'for(const item of value){return item;}return null;'],
        ['accessor_definition', 'return {get hidden(){return value;}};'],
        ['spread', 'return {...value};']
    ];
    for (const [kind, body] of cases) {
        const built = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source:
            `function run(value){${body}}module.exports={run};` }], entry: 'program.js', exportName: 'run' });
        const inspected = inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' });
        const module = inspected.inventories[0].modules.find(row => row.path === 'program.js');
        assert.ok(Array.isArray(module.effect_sites), 'effect inventory is distinct from call inventory');
        assert.ok(module.effect_sites.some(row => row.kind === kind && row.enclosing_function !== null), kind);
        assert.equal(inspected.effect_site_inventory_complete, true);
        assert.equal(inspected.executable_consumer_absence_proved, false);
        assert.equal(inspected.qualified, false);
    }
});

test('N02G:PATH-V3-059 effect inventory is whole syntax not observed branches and changes with real helper bytes', async () => {
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const analyze = body => {
        const built = buildCommonJsGuestBundle({ sources: [
            { path: 'program.js', source: 'const helper=require("./helper");function run(value){return helper.read(value);}module.exports={run};' },
            { path: 'helper.js', source: `function read(value){${body}}module.exports={read};` }
        ], entry: 'program.js', exportName: 'run' });
        return inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' });
    };
    const before = analyze('return value.hidden;');
    const after = analyze('if(false){value.hidden=1;}return value.hidden;');
    const helper = after.inventories[0].modules.find(row => row.path === 'helper.js');
    assert.ok(Array.isArray(helper.effect_sites));
    assert.ok(helper.effect_sites.some(row => row.kind === 'mutation'));
    assert.notEqual(before.analysis_sha256, after.analysis_sha256);
    assert.equal(after.value_flow_proof_complete, false);
    assert.equal(after.semantic_mutation_credit, 0);
});

test('N02G:PATH-V3-060 finite composition preserves indirect obligations and cannot promote conditional links or caller clones', async () => {
    const origins = await import('../../../scripts/agent/pathReceiverOriginContract.mjs');
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const built = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source:
        'function helper(value){if(false){value.hidden=1;}return value.hidden;}function run(value){return helper(value);}module.exports={run};' }],
        entry: 'program.js', exportName: 'run' });
    const bundle = inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' }).inventories[0];
    const projected = origins.projectPathReceiverOrigins(bundle, 'metric_operands', { fact_key: 'synthetic', operands: [] },
        { surfaces: [] }, { surfaces: [], normal_factory_reference_sha256: 'synthetic-not-authority', source: { sha256: 'synthetic' } });
    const composition = origins.composePathReceiverEffects(projected);
    assert.equal(composition.status, 'blocked_missing_effect_discharge');
    assert.equal(composition.obligations.length, bundle.modules.reduce((n, module) => n + module.effect_sites.length, 0));
    assert.ok(composition.obligations.some(row => row.kind === 'mutation'));
    assert.ok(composition.obligations.some(row => row.kind === 'property_read'));
    assert.ok(composition.obligations.every(row => row.discharged === false));
    assert.ok(composition.dependencies.some(row => row.target_origin.kind === 'callable'));
    for (const field of ['effect_closure_complete', 'guest_call_provenance_complete', 'executable_consumer_absence_proved', 'qualified'])
        assert.equal(composition[field], false);
    assert.equal(composition.semantic_mutation_credit, 0);
    assert.throws(() => origins.composePathReceiverEffects(structuredClone(projected)));
    let effects = 0;
    const active = new Proxy(projected, { get() { effects++; throw new Error('active'); } });
    assert.throws(() => origins.composePathReceiverEffects(active));
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-061 genuine pre M family binds whole effect compositions but missing premises remain blocked', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation);
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship:
        api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile: await phaseFixture() }) });
    for (const variant of ['C', 'M', 'S']) {
        const rows = contract.readPathCandidateEffectComposition({ expectation, variant });
        const origins = contract.readPathCandidateReceiverOrigins({ expectation, variant });
        assert.equal(rows.length, origins.length);
        assert.ok(rows.every(row => row.phases.length === 2 && row.functional));
        for (const row of rows) for (const composition of [...row.phases, row.functional]) {
            assert.ok(composition.obligations.length > 0);
            assert.equal(composition.status, 'blocked_missing_effect_discharge');
            assert.equal(composition.effect_closure_complete, false);
            assert.equal(composition.qualified, false);
        }
    }
    assert.throws(() => contract.readPathCandidateEffectComposition({ expectation: structuredClone(expectation), variant: 'C' }));
    let effects = 0;
    const active = { expectation };
    Object.defineProperty(active, 'variant', { enumerable: true, get() { effects++; return 'C'; } });
    assert.throws(() => contract.readPathCandidateEffectComposition(active));
    assert.equal(effects, 0);
    assert.equal(expectation.effect_closure_complete, false);
    assert.equal(expectation.semantic_mutation_credit, 0);
});

let fixturePromise;
function historicalSource() {
    return require('node:fs').readFileSync(require('node:path').resolve(__dirname,
        '../../../docs/audit-evidence/n02g-causal-authoring-profile/path-v3-history-20261008/historical-v2-report.json'), 'utf8');
}
function fixture() {
    return fixturePromise ||= (async () => {
        const { loadLocalAuthoringPackage } = await import('../../../scripts/agent/executeNextDomainInvariantMatrix.mjs');
        const { buildAdmittedSchemaValidators } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
        const { compileAuthoringIR } = require('../../../src/next/provenance/graphCompiler');
        const packageReceipt = loadLocalAuthoringPackage();
        return { packageReceipt, ir: compileAuthoringIR(packageReceipt,
            buildAdmittedSchemaValidators(packageReceipt).validators) };
    })();
}

let selectionControlPromise;
let phaseFixturePromise;
function phaseFixture() {
    return phaseFixturePromise ||= (async () => {
        const input = await fixture();
        const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
        const { admitPhaseCompositionProfile, PROFILE_PATH } = require('../../../src/next/provenance/phaseCompositionProfile');
        const registry = admittedDocuments(input.packageReceipt).find(row => row.value?.registry_id === 'metric_evaluator_registry').value;
        return admitPhaseCompositionProfile({ source: require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../../..', PROFILE_PATH), 'utf8'), registry });
    })();
}
function admittedCandidate(api, preparation) {
    const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
        && row.target.predicate_id === 'link_2_refund_sign');
    const siteIndex = preparation.rows[rowIndex].sites.findIndex(site => site.authored_site.site_path[1] === 0);
    const domain = preparation.rows[rowIndex].sites[siteIndex].domain;
    const locatorIndex = domain.locators.findIndex(locator => locator.node !== domain.original.node
        && JSON.stringify(locator.segments) === JSON.stringify(domain.original.segments));
    assert.ok(locatorIndex >= 0);
    return api.materializePathQualificationLocator({ preparation, rowIndex, siteIndex, locatorIndex });
}
test('N02G:PATH-V3-032 whole admitted C M S normal programs match prelowering authorial seals with hash-bound common reuse', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation), phaseProfile = await phaseFixture();
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile });
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship });
    assert.equal(expectation.sealed_before_captured_compile, true);
    assert.equal(expectation.programs_per_positive_world, input.ir.graphs.length);
    assert.equal(expectation.shared_programs, input.ir.graphs.length - 1);
    const foreign = admittedCandidate(api, preparation);
    assert.throws(() => compiler.compilePathQualificationProgramCandidate({
        capture: compiler.capturePathQualificationCompiler(), candidate: foreign, expectation }));
    assert.throws(() => compiler.compilePathQualificationProgramCandidate({
        capture: compiler.capturePathQualificationCompiler(), candidate, expectation: structuredClone(expectation) }));
    assert.throws(() => compiler.compilePathQualificationProgramCandidate({ candidate, expectation,
        capture: null, expected: input.ir }));
    require('../../../src/next/provenance/pathSemanticReference').sealPathQualificationReference({ candidate });
    const result = compiler.compilePathQualificationProgramCandidate({ capture: compiler.capturePathQualificationCompiler(), candidate, expectation });
    assert.equal(result.program_expectation, expectation);
    assert.equal(result.normal_admission_checker_source_conformance, true);
    assert.equal(result.normal_admission_rule_discharge_complete, false);
    assert.deepEqual(result.worlds.map(row => row.admitted), [true, true, true]);
    assert.deepEqual(result.worlds.map(row => row.whole_phase_program_conformance), [true, true, true]);
    assert.deepEqual(result.worlds.map(row => row.program_count), [input.ir.graphs.length, input.ir.graphs.length, input.ir.graphs.length]);
    assert.equal(result.worlds[0].programs_sha256, result.worlds[2].programs_sha256);
    assert.notEqual(result.worlds[0].programs_sha256, result.worlds[1].programs_sha256);
    for (const variant of ['C', 'M', 'S']) {
        const actual = compiler.readPathQualificationProgramsEvidence({ result, variant });
        const reference = contract.readPathCandidateProgramReference({ expectation, variant });
        assert.notEqual(actual, reference);
        assert.ok(Object.isFrozen(actual) && Object.isFrozen(actual[0].candidate));
        assert.deepEqual(actual, reference);
        assert.equal(contract.verifyPathCandidatePrograms({ expectation, variant, programs: actual }).programs_sha256,
            result.worlds.find(row => row.variant === variant).programs_sha256);
    }
    assert.throws(() => compiler.readPathQualificationProgramsEvidence({ result: structuredClone(result), variant: 'C' }));
    assert.equal(result.handle_attempts, 0); assert.equal(result.dp_execution, false);
    assert.equal(result.validation_tcb_complete, false); assert.equal(result.semantic_mutation_credit, 0);
    assert.throws(() => api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile }));
});
test('N02G:PATH-V3-033 whole program family rejects missing reordered duplicated graphs cached C and active or cloned authority', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation), phaseProfile = await phaseFixture();
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile });
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship });
    const programs = contract.readPathCandidateProgramReference({ expectation, variant: 'C' });
    assert.equal(contract.verifyPathCandidatePrograms({ expectation, variant: 'C', programs }).whole_phase_program_conformance, true);
    assert.throws(() => contract.verifyPathCandidatePrograms({ expectation, variant: 'M', programs }));
    for (const mutate of [rows => rows.pop(), rows => rows.reverse(), rows => rows[1] = rows[0],
        rows => rows[0].fact_key = 'redirected', rows => rows[0].candidate.source += '\n',
        rows => rows[0].candidate.sourceHashes[0].sha256 = 'sha256:' + '0'.repeat(64)]) {
        const rows = structuredClone(programs); mutate(rows);
        assert.throws(() => contract.verifyPathCandidatePrograms({ expectation, variant: 'C', programs: rows }));
    }
    assert.throws(() => api.preparePathCandidateProgramAuthorship({ candidate: structuredClone(candidate), phaseProfile }));
    assert.throws(() => api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile, expected: input.ir }));
    assert.throws(() => contract.sealPathCandidateProgramExpectation({ authorship: structuredClone(authorship) }));
    assert.throws(() => contract.readPathCandidateProgramReference({ expectation: structuredClone(expectation), variant: 'C' }));
    let effects = 0;
    const active = { expectation, variant: 'C' };
    Object.defineProperty(active, 'programs', { enumerable: true, get() { effects++; return programs; } });
    assert.throws(() => contract.verifyPathCandidatePrograms(active));
    assert.throws(() => contract.verifyPathCandidatePrograms({ expectation, variant: 'C', programs: new Proxy(programs, { ownKeys() { effects++; return []; } }) }));
    const rows = [...programs], row = { fact_key: rows[0].fact_key };
    Object.defineProperty(row, 'candidate', { enumerable: true, get() { effects++; return rows[0].candidate; } }); rows[0] = row;
    assert.throws(() => contract.verifyPathCandidatePrograms({ expectation, variant: 'C', programs: rows }));
    assert.equal(effects, 0);
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const capture = compiler.capturePathQualificationCompiler();
    require('../../../src/next/provenance/pathSemanticReference').sealPathQualificationReference({ candidate });
    const fs = require('node:fs'), read = fs.readFileSync;
    let helperReads = 0, failure;
    fs.readFileSync = function(file, ...args) {
        const value = read.call(this, file, ...args);
        if (typeof file !== 'string' || !file.replaceAll('\\', '/').endsWith('/src/next/kernel/canonicalJson.js')) return value;
        helperReads++;
        const changed = (typeof value === 'string' ? value : value.toString('utf8')) + '\n// adversarial BUILD byte drift\n';
        return typeof value === 'string' ? changed : Buffer.from(changed);
    };
    try {
        // Reuse is bound to helper bytes, not only the authorial baseline.
        const drifted = contract.sealPathCandidateProgramExpectation({ authorship });
        assert.notEqual(drifted.helper_sources_sha256, expectation.helper_sources_sha256);
        assert.notEqual(drifted.worlds[0].programs_sha256, expectation.worlds[0].programs_sha256);
        try { compiler.compilePathQualificationProgramCandidate({ capture, candidate, expectation }); }
        catch (error) { failure = error; }
    } finally { fs.readFileSync = read; }
    assert.ok(helperReads > 0 && failure);
    const retained = compiler.readPathQualificationCompilerEvidence(failure);
    assert.equal(retained.program_conformance_failed, true);
    assert.equal(retained.variant, 'C');
    assert.equal(retained.program_expectation, expectation);
    assert.equal(retained.contradiction.graph_index, 0);
    assert.equal(retained.contradiction.variant, 'C');
    assert.ok(retained.contradiction.observed.source.includes('// adversarial BUILD byte drift'));
    const sourceHash = 'sha256:' + require('node:crypto').createHash('sha256')
        .update(retained.contradiction.observed.source).digest('hex');
    assert.notEqual(sourceHash, retained.contradiction.expected.expected_source_sha256);
    assert.equal(sourceHash, retained.actual_programs[0].source_sha256);
    assert.equal(retained.actual_programs.length, input.ir.graphs.length);
    assert.ok(retained.actual_programs.every(row => /^sha256:[a-f0-9]{64}$/.test(row.source_sha256)));
    assert.equal(retained.handle_attempts, 0); assert.equal(retained.qualified, false);
    assert.equal(retained.semantic_mutation_credit, 0);
    assert.throws(() => compiler.compilePathQualificationProgramCandidate({ capture, candidate, expectation }),
        /capture_authority_or_poisoned/);
});

test('N02G:PATH-V3-034 complete common functional D assets and every authored evaluator binding seal before C M S compilation', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation), phaseProfile = await phaseFixture();
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile });
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship });
    const reference = contract.readPathCandidateMetricReference({ expectation });
    const registry = require('../../../src/next/provenance/packageContract').admittedDocuments(input.packageReceipt)
        .find(row => row.value?.registry_id === 'metric_evaluator_registry').value;
    assert.equal(reference.metrics.length, registry.entries.length);
    assert.equal(reference.bindings.length, input.ir.graphs.length);
    assert.equal(expectation.metric_reference_scope, 'shared_normal_functional_BUILD_bytes_not_independent_formula_or_oracle');
    require('../../../src/next/provenance/pathSemanticReference').sealPathQualificationReference({ candidate });
    const result = compiler.compilePathQualificationProgramCandidate({ capture: compiler.capturePathQualificationCompiler(), candidate, expectation });
    const actual = compiler.readPathQualificationMetricEvidence({ result });
    assert.notEqual(actual, reference.metrics);
    assert.deepEqual(actual, reference.metrics);
    assert.equal(contract.verifyPathCandidateMetrics({ expectation, metrics: actual }).functional_metric_conformance, true);
    for (const world of result.worlds) {
        assert.equal(world.metric_count, registry.entries.length);
        assert.equal(world.metric_bindings_count, input.ir.graphs.length);
        assert.equal(world.functional_metric_conformance, true);
        assert.equal(world.metric_bindings_sha256, expectation.metric_bindings_sha256);
    }
    assert.equal(result.handle_attempts, 0); assert.equal(result.dp_execution, false);
    assert.equal(result.independent_compiler_execution, false); assert.equal(result.validation_tcb_complete, false);
    assert.equal(result.semantic_mutation_credit, 0);
    assert.throws(() => compiler.readPathQualificationMetricEvidence({ result: structuredClone(result) }));
});

test('N02G:PATH-V3-035 functional D reference rejects asset binding drift omissions aliases and active or cloned authority', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation);
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship:
        api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile: await phaseFixture() }) });
    const reference = contract.readPathCandidateMetricReference({ expectation });
    for (const mutate of [rows => rows.pop(), rows => rows.reverse(), rows => rows[1] = rows[0],
        rows => rows[0].evaluator_id = 'redirected', rows => rows[0].evaluator_version++,
        rows => rows[0].source += '\n', rows => rows[0].manifest += '\n',
        rows => rows[0].artifact_root = 'sha256:' + '0'.repeat(64),
        rows => rows[0].sourceHashes[0].sha256 = 'sha256:' + '0'.repeat(64)]) {
        const metrics = structuredClone(reference.metrics); mutate(metrics);
        assert.throws(() => contract.verifyPathCandidateMetrics({ expectation, metrics }));
    }
    for (const mutate of [rows => rows.pop(), rows => rows.reverse(), rows => rows[1] = rows[0],
        rows => rows[0].evaluator_ref.evaluator_id = 'redirected',
        rows => rows[0].claim.unit = 'count', rows => rows[0].operands[0].role_ref.role_id = 'redirected',
        rows => rows.find(row => row.derivation_bindings.sets.some(set => set.aliases.length > 1))
            .derivation_bindings.sets.find(set => set.aliases.length > 1).aliases.reverse()]) {
        const bindings = structuredClone(reference.bindings); mutate(bindings);
        assert.throws(() => contract.verifyPathCandidateMetricBindings({ expectation, variant: 'C', bindings }));
    }
    assert.throws(() => contract.readPathCandidateMetricReference({ expectation: structuredClone(expectation) }));
    let effects = 0;
    const active = { expectation };
    Object.defineProperty(active, 'metrics', { enumerable: true, get() { effects++; return reference.metrics; } });
    assert.throws(() => contract.verifyPathCandidateMetrics(active));
    assert.throws(() => contract.verifyPathCandidateMetrics({ expectation, metrics: new Proxy(reference.metrics,
        { ownKeys() { effects++; return []; } }) }));
    assert.throws(() => contract.verifyPathCandidateMetricBindings({ expectation, variant: 'C', bindings:
        new Proxy(reference.bindings, { ownKeys() { effects++; return []; } }) }));
    const activeMetrics = structuredClone(reference.metrics);
    Object.defineProperty(activeMetrics[0], 'source', { enumerable: true, get() { effects++; return ''; } });
    assert.throws(() => contract.verifyPathCandidateMetrics({ expectation, metrics: activeMetrics }));
    assert.equal(effects, 0);
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const capture = compiler.capturePathQualificationCompiler();
    require('../../../src/next/provenance/pathSemanticReference').sealPathQualificationReference({ candidate });
    const fs = require('node:fs'), read = fs.readFileSync;
    let changedReads = 0, failure;
    fs.readFileSync = function(file, ...args) {
        const value = read.call(this, file, ...args);
        if (typeof file !== 'string' || !file.replaceAll('\\', '/').endsWith('/src/next/provenance/metricDirectReads.js')) return value;
        const changed = (typeof value === 'string' ? value : value.toString('utf8')) + '\n// adversarial functional BUILD drift\n';
        changedReads++;
        return typeof value === 'string' ? changed : Buffer.from(changed);
    };
    try { compiler.compilePathQualificationProgramCandidate({ capture, candidate, expectation }); }
    catch (error) { failure = error; }
    finally { fs.readFileSync = read; }
    assert.ok(changedReads > 0 && failure);
    const retained = compiler.readPathQualificationCompilerEvidence(failure);
    assert.equal(retained.metric_conformance_failed, true);
    assert.equal(retained.stage, 'before_first_normal_compile');
    assert.ok(retained.contradiction.observed.source.includes('// adversarial functional BUILD drift'));
    assert.notEqual(retained.contradiction.expected_sha256, retained.contradiction.observed_sha256);
    assert.equal(retained.handle_attempts, 0); assert.equal(retained.semantic_mutation_credit, 0);
    assert.throws(() => compiler.compilePathQualificationProgramCandidate({ capture, candidate, expectation }),
        /capture_authority_or_poisoned/);
});

test('N02G:PATH-V3-036 every actual phase and functional bundle links complete modules imports and lexical consumers without claiming absence', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation);
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship:
        api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile: await phaseFixture() }) });
    const closure = contract.readPathCandidateClosureReference({ expectation, variant: 'C' });
    assert.equal(closure.programs.length, input.ir.graphs.length);
    assert.equal(closure.metrics.length, expectation.metric_count);
    for (const item of [...closure.programs, ...closure.metrics]) {
        assert.equal(item.analysis.import_resolution_complete, true);
        assert.equal(item.analysis.module_sources_complete, true);
        assert.equal(item.analysis.lexical_reference_resolution_complete, true);
        assert.equal(item.analysis.value_flow_proof_complete, false);
        assert.equal(item.analysis.executable_consumer_absence_proved, false);
        assert.ok(item.analysis.call_site_count > 0);
        assert.ok(item.analysis.closed_import_edges > 0);
    }
    require('../../../src/next/provenance/pathSemanticReference').sealPathQualificationReference({ candidate });
    const result = compiler.compilePathQualificationProgramCandidate({ capture: compiler.capturePathQualificationCompiler(), candidate, expectation });
    assert.deepEqual(result.worlds.map(row => row.module_closure_conformance), [true, true, true]);
    assert.equal(result.executable_consumer_absence_proved, false);
    assert.equal(result.qualified, false); assert.equal(result.handle_attempts, 0);
    assert.throws(() => contract.readPathCandidateClosureReference({ expectation: structuredClone(expectation), variant: 'C' }));
});

test('N02G:PATH-V3-037 external module closure rejects loader drift dynamic edges free captures and active inputs even with self consistent hashes', async () => {
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const source = "'use strict'; module.exports={run:operands=>operands.get('id')};";
    const built = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source }], entry: 'program.js', exportName: 'run' });
    const checked = inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' });
    assert.equal(checked.closed_factory_sources, 1);
    assert.equal(checked.executable_consumer_absence_proved, false);
    for (const change of [text => text.replace('const cache = new Map();', 'const cache = new Map(); let escape;'),
        text => text.replace('return load(0)', 'return load(1)'),
        text => text.replace('return load(edge[1]);', 'return load(0);'),
        text => text + ';globalThis.consume(1);']) {
        const changed = change(built.source); assert.notEqual(changed, built.source);
        assert.throws(() => inspectPathExecutableClosure({ source: changed, sourceHashes: built.sourceHashes, kind: 'metric' }));
    }
    for (const entrySource of ["module.exports={run:operands=>hiddenConsumer(operands)};",
        "module.exports={run:operands=>globalThis.consume(operands)};",
        "module.exports={run:(operands=hiddenConsumer())=>operands.get('id')};"] ) {
        const changed = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source: entrySource }], entry: 'program.js', exportName: 'run' });
        assert.throws(() => inspectPathExecutableClosure({ source: changed.source, sourceHashes: changed.sourceHashes, kind: 'metric' }));
    }
    const missingExport = buildCommonJsGuestBundle({ sources: [
        { path: 'program.js', source: "const {missing}=require('./helper');module.exports={run:operands=>missing(operands)};" },
        { path: 'helper.js', source: 'module.exports={present:value=>value};' }], entry: 'program.js', exportName: 'run' });
    assert.throws(() => inspectPathExecutableClosure({ source: missingExport.source,
        sourceHashes: missingExport.sourceHashes, kind: 'metric' }));
    const wrongCatalog = structuredClone(built.sourceHashes); wrongCatalog[0].sha256 = 'sha256:' + '0'.repeat(64);
    assert.throws(() => inspectPathExecutableClosure({ source: built.source, sourceHashes: wrongCatalog, kind: 'metric' }));
    assert.throws(() => inspectPathExecutableClosure({ source: built.source, sourceHashes: [...built.sourceHashes, ...built.sourceHashes], kind: 'metric' }));
    const wrapped = `(function(operands){'use strict'; const evaluate=${built.source};
        globalThis.consume(operands);return {unit:'count',kind:'nonnegative_integer',value:evaluate(operands)};})`;
    assert.throws(() => inspectPathExecutableClosure({ source: wrapped, sourceHashes: built.sourceHashes, kind: 'metric' }));
    let effects = 0;
    const active = { sourceHashes: built.sourceHashes, kind: 'metric' };
    Object.defineProperty(active, 'source', { enumerable: true, get() { effects++; return built.source; } });
    assert.throws(() => inspectPathExecutableClosure(active));
    assert.throws(() => inspectPathExecutableClosure({ source: built.source, kind: 'metric', sourceHashes:
        new Proxy(built.sourceHashes, { ownKeys() { effects++; return []; } }) }));
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-044 finite function boundaries bind formal arguments returns and callback forwarding across real closed modules', async () => {
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const helper = 'function forward(value){const alias=value;return alias;}module.exports={forward};';
    const source = 'const {forward:f}=require("./helper");const read=x=>x.get("id");function run(x){return f(read)(x);}module.exports={run};';
    const built = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source }, { path: 'helper.js', source: helper }],
        entry: 'program.js', exportName: 'run' });
    const analysis = inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' });
    assert.equal(analysis.function_boundary_inventory_complete, true);
    assert.equal(analysis.inventories[0].entry_argument_bindings[0].source.kind, 'ordinary_bundle_operands_forwarding');
    const program = analysis.inventories[0].modules.find(row => row.path === 'program.js');
    const helperRow = analysis.inventories[0].modules.find(row => row.path === 'helper.js');
    assert.ok(helperRow.function_boundaries.some(row => row.parameters.length === 1 && row.returns.length === 1
        && row.transparent_return_grammar === true));
    const returned = program.call_bindings.find(row => row.callee.kind === 'call_result');
    assert.equal(returned.target?.kind, 'local_function');
    assert.equal(returned.target?.module, 'program.js');
    assert.ok(program.call_bindings.some(row => row.target === null && row.reason === 'parameter_dispatch'));
    assert.equal(analysis.guest_call_provenance_complete, false);
    assert.equal(analysis.value_flow_proof_complete, false);
    assert.equal(analysis.executable_consumer_absence_proved, false);
    assert.equal(analysis.semantic_mutation_credit, 0);
    for (let depth = 1; depth <= 5; depth++) {
        const aliases = Array.from({ length: depth }, (_, n) => `const a${n}=${n ? 'a' + (n - 1) : 'f'};`).join('');
        const changed = source.replace('const read=', aliases + 'const read=').replace('return f(read)(x)', `return a${depth - 1}(read)(x)`);
        const bundle = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source: changed }, { path: 'helper.js', source: helper }],
            entry: 'program.js', exportName: 'run' });
        const result = inspectPathExecutableClosure({ source: bundle.source, sourceHashes: bundle.sourceHashes, kind: 'metric' });
        assert.equal(result.inventories[0].modules.find(row => row.path === 'program.js').call_bindings
            .find(row => row.callee.kind === 'call_result').target?.module, 'program.js');
    }
});

test('N02G:PATH-V3-045 return linkage blocks effects branches writes recursion and fake same-name capabilities', async () => {
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const analyze = helper => {
        const source = 'const {forward}=require("./helper");const read=x=>x.get("id");module.exports={run:x=>forward(read)(x)};';
        const built = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source }, { path: 'helper.js', source: helper }],
            entry: 'program.js', exportName: 'run' });
        return inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' });
    };
    for (const body of ['value=()=>0;return value;', 'if(value)return value;return ()=>0;',
        'value.get=()=>0;return value;', 'return forward(value);', 'return value();',
        'const alias=value;alias.get=()=>0;return value;', 'Object.freeze(value);return value;']) {
        const analysis = analyze('function forward(value){' + body + '}module.exports={forward};');
        const call = analysis.inventories[0].modules.find(row => row.path === 'program.js').call_bindings
            .find(row => row.callee.kind === 'call_result');
        assert.equal(call.target, null, body);
        assert.equal(analysis.qualified, false);
    }
    const defaults = analyze('const forward=(value=()=>0)=>value;module.exports={forward};');
    assert.equal(defaults.inventories[0].modules.find(row => row.path === 'program.js').call_bindings
        .find(row => row.callee.kind === 'call_result').target, null);
    const fake = analyze('function forward(value){return {get:()=>0};}module.exports={forward};');
    assert.equal(fake.guest_call_provenance_complete, false);
    assert.equal(fake.necessary_equivalence_proved, false);
    const hazardous = buildCommonJsGuestBundle({ sources: [{ path: 'program.js',
        source: 'const value=()=>0;const effect=()=>value;function ignore(x){return value;}module.exports={run:x=>ignore(effect())(x)};' }],
        entry: 'program.js', exportName: 'run' });
    const blocked = inspectPathExecutableClosure({ source: hazardous.source, sourceHashes: hazardous.sourceHashes, kind: 'metric' });
    assert.ok(blocked.inventories[0].modules[0].call_bindings.some(row => row.callee.kind === 'call_result'
        && row.target === null && row.reason === 'unsupported_return_invocation'));
    for (const body of ['return {same:value,same:()=>0}.same;', 'return {get same(){return value;}}.same;']) {
        const malformed = analyze('function forward(value){' + body + '}module.exports={forward};');
        assert.equal(malformed.inventories[0].modules.find(row => row.path === 'program.js').call_bindings
            .find(row => row.callee.kind === 'call_result').target, null);
    }
});

async function conditionalNodeFixture() {
    const { normal, child, contract, expectation } = await claimShapeFixture();
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const { projectPathReceiverOrigins } = await import('../../../scripts/agent/pathReceiverOriginContract.mjs');
    const aliasesFor = seed => Object.keys(seed.nodes).filter(alias => seed.nodes[alias].binding === 'snapshot'
        && seed.material_descriptors[alias]?.fields.id?.type === 'id');
    const seed = child.seeds.find(row => aliasesFor(row).length >= 2), aliases = aliasesFor(seed).slice(0, 2);
    return { seed, aliases, contract, expectation, inspect(source) {
        const built = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source }], entry: 'program.js', exportName: 'run' });
        const syntax = inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' });
        return projectPathReceiverOrigins(syntax.inventories[0], 'child_proof_operands', seed, normal.data, child.data);
    } };
}

async function materialReferenceFixture() {
    const { normal, child, contract, expectation } = await claimShapeFixture();
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const { projectPathReceiverOrigins } = await import('../../../scripts/agent/pathReceiverOriginContract.mjs');
    const eligible = seed => seed.edges.find(edge => edge.relation === 'material_ref'
        && seed.nodes[edge.source]?.binding === 'snapshot' && seed.nodes[edge.target]?.binding === 'snapshot'
        && seed.material_descriptors[edge.source]?.fields[edge.field]?.type === 'ref'
        && seed.material_descriptors[edge.target]?.fields.id?.type === 'id'
        && seed.edges.filter(other => other.relation === 'material_ref'
            && other.source === edge.source && other.field === edge.field).length === 1);
    const seed = child.seeds.find(seed => eligible(seed)), edge = eligible(seed);
    assert.ok(edge, 'genuine admitted single material-ref fixture');
    return { seed, edge, contract, expectation, inspect(source) {
        const built = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source }], entry: 'program.js', exportName: 'run' });
        const syntax = inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' });
        return projectPathReceiverOrigins(syntax.inventories[0], 'child_proof_operands', seed, normal.data, child.data);
    } };
}

test('N02G:PATH-V3-056 material reference returns retain genuine source edge target and native preconditions without proving runtime ownership', async () => {
    const { seed, edge, inspect } = await materialReferenceFixture(), q = JSON.stringify;
    const projection = inspect(`function run(ops){const source=ops.node(${q(edge.source)});
        ops.resolveReference(${q(edge.source)},${q(edge.field)},${q(seed.nodes[edge.target].ref_id)}).get("id");
        return ops.memberEdge(source,${q(edge.field)}).get("id");}module.exports={run};`);
    for (const name of ['resolveReference', 'memberEdge']) {
        const call = projection.calls.find(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === name);
        assert.equal(call.return_origin.kind, 'capability', name);
        assert.equal(call.return_origin.binding.alias, edge.target);
        assert.equal(call.return_origin.binding.reference_link.edge_id, edge.id);
        assert.equal(call.return_origin.binding.reference_link.source_alias, edge.source);
        assert.equal(call.return_origin.binding.reference_link.field, edge.field);
        assert.equal(call.return_origin.binding.return_conditions.runtime_proved, false);
        assert.ok(call.return_origin.binding.return_conditions.obligations.includes('normal_unique_reference_match_and_string_value'));
    }
    assert.ok(projection.calls.filter(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'get')
        .every(row => row.return_origin.kind === 'scalar'));
    assert.equal(projection.operational_receiver_authority, false);
    assert.equal(projection.effect_closure_complete, false);
    assert.equal(projection.necessary_equivalence_proved, false);
    assert.equal(projection.semantic_mutation_credit, 0);
});

test('N02G:PATH-V3-057 material reference linkage rejects fake ownership nonroot handles invalid references and undeclared edges', async () => {
    const { edge, inspect } = await materialReferenceFixture(), q = JSON.stringify;
    const source = `ops.node(${q(edge.source)})`, field = q(edge.field);
    const linked = inspect(`function run(ops){return ops.resolveReference(${q(edge.source)},${field},${source}.get(${field}));}module.exports={run};`);
    const call = linked.calls.find(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'resolveReference');
    assert.equal(call.return_origin.kind, 'capability', 'known normal scalar reference is conditional, not erased');
    assert.equal(call.return_origin.binding.return_conditions.runtime_proved, false);
    for (const expression of [
        `ops.memberEdge({identity:()=>"fake",get:()=>"fake"},${field})`,
        `ops.memberEdge(${source}.keys(),${field})`,
        `ops.memberEdge(ops.claim(),${field})`,
        `ops.memberEdge(${source},"not_admitted")`,
        `ops.resolveReference(${q(edge.source)},${field},0)`,
        `ops.resolveReference(${q(edge.source)},${field},"not_an_admitted_reference")`,
        `ops.resolveReference("fake",${field},"fake")`,
        `ops.resolveReference(${q(edge.source)},"not_admitted","fake")`
    ]) {
        const rejected = inspect(`function run(ops){return ${expression};}module.exports={run};`);
        const reference = rejected.calls.find(row => row.target_origin.kind === 'capability_method'
            && ['memberEdge', 'resolveReference'].includes(row.target_origin.name));
        assert.equal(reference.return_origin.kind, 'unknown', expression);
        assert.equal(rejected.executable_consumer_absence_proved, false);
        assert.equal(rejected.qualified, false);
    }
});

test('N02G:PATH-V3-054 shared helpers retain every known conditional node origin and only common admitted fields', async () => {
    const { aliases, inspect, contract, expectation } = await conditionalNodeFixture();
    const calls = aliases.map(alias => `read(ops.node(${JSON.stringify(alias)}));`).join('');
    const projection = inspect(`function read(node){return node.get("id");}function run(ops){${calls}return true;}module.exports={run};`);
    const joined = projection.parameter_origins.find(row => row.origin.binding?.kind === 'conditional_incoming_node_origins');
    assert.ok(joined, 'legitimate distinct nodes must retain alternatives instead of erasing origin');
    assert.deepEqual(joined.origin.binding.alternatives.map(binding => binding.alias).sort(), [...aliases].sort());
    const get = projection.calls.find(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'get');
    assert.equal(get.return_origin.kind, 'scalar');
    assert.equal(get.return_origin.origin.alternatives.length, 2);
    assert.equal(joined.origin.binding.return_conditions.runtime_proved, false);
    assert.equal(Object.hasOwn(joined.origin.binding, 'alias'), false);
    assert.equal(Object.hasOwn(joined.origin.binding, 'identity'), false);
    assert.equal(projection.necessary_equivalence_proved, false);
    assert.equal(projection.effect_closure_complete, false);
    assert.equal(projection.operational_receiver_authority, false);
    const reverse = inspect(`function read(node){return node.get("id");}function run(ops){${aliases.slice().reverse()
        .map(alias => `read(ops.node(${JSON.stringify(alias)}));`).join('')}return true;}module.exports={run};`);
    assert.deepEqual(reverse.parameter_origins.find(row => row.origin.binding?.kind === 'conditional_incoming_node_origins')
        .origin.binding.alternatives, joined.origin.binding.alternatives);
    let wholeFamilyUnions = 0;
    for (const variant of ['C', 'M', 'S']) for (const row of contract.readPathCandidateReceiverOrigins({ expectation, variant }))
        for (const projection of [...row.phases, row.functional]) {
            const bindings = [
                ...projection.parameter_origins.map(row => row.origin.binding),
                ...projection.calls.flatMap(call => [call.target_origin.receiver?.binding,
                    call.return_origin.binding, call.return_origin.origin])
            ].filter(binding => binding?.kind === 'conditional_incoming_node_origins');
            for (const binding of bindings) {
                wholeFamilyUnions++;
                for (const alternative of binding.alternatives) {
                    assert.deepEqual(alternative.path, binding.path);
                    assert.equal(alternative.projection, binding.projection);
                    assert.equal(alternative.return_conditions.runtime_proved, false);
                }
                assert.equal(projection.operational_receiver_authority, false);
                assert.equal(projection.semantic_mutation_credit, 0);
            }
        }
    assert.ok(wholeFamilyUnions > 0);
});

test('N02G:PATH-V3-055 conditional node joins reject fake or scalar inputs and do not collapse ownership or unknown shapes', async () => {
    const { aliases, inspect } = await conditionalNodeFixture();
    const calls = aliases.map(alias => `read(ops.node(${JSON.stringify(alias)}));`).join('');
    for (const fake of ['{get:()=>0}', '0', '"node"', '{surface:"node",binding:{alias:"fake"}}']) {
        for (const inputCalls of [calls + `read(${fake});`, `read(${fake});` + calls]) {
            const projection = inspect(`function read(node){return node.get("id");}function run(ops){${inputCalls}return true;}module.exports={run};`);
            assert.ok(projection.parameter_origins.some(row => row.origin.reason === 'conflicting_incoming_origins'));
            assert.ok(!projection.calls.some(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'get'));
        }
    }
    const mixed = inspect(`function read(node){return node.get("id");}function run(ops){${calls}read(ops.claim());return true;}module.exports={run};`);
    assert.ok(mixed.calls.some(row => row.return_origin.reason === 'non_material_or_unknown_field'));
    const traversal = inspect(`function read(node){return node.traverse("not_an_edge");}function run(ops){${calls}return true;}module.exports={run};`);
    assert.ok(traversal.calls.some(row => row.return_origin.reason === 'traversal_requires_single_root'));
    assert.equal(traversal.semantic_mutation_credit, 0);
    assert.equal(traversal.executable_consumer_absence_proved, false);
    const forwarded = inspect(`function next(keys){return keys.at(0);}function read(node){return next(node.keys());}function run(ops){${calls}return true;}module.exports={run};`);
    const at = forwarded.calls.find(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'at');
    assert.equal(at.return_origin.kind, 'scalar');
    assert.equal(at.return_origin.origin.alternatives.length, 2);
    assert.ok(at.return_origin.origin.alternatives.every(binding => binding.projection === 'keys' && binding.path.length === 0));
});

let claimShapeFixturePromise;
function claimShapeFixture() {
    return claimShapeFixturePromise ||= (async () => {
        const api = require('../../../src/next/provenance/pathQualificationV3');
        const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
        const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
        const expectation = contract.sealPathCandidateProgramExpectation({ authorship: api.preparePathCandidateProgramAuthorship({
            candidate: admittedCandidate(api, preparation), phaseProfile: await phaseFixture() }) });
        const normal = contract.readPathCandidateCapabilityReference({ expectation });
        const child = contract.readPathCandidateChildABIReference({ expectation });
        return { input, expectation, contract, normal, child };
    })();
}

test('N02G:PATH-V3-052 claim context shape reuses the admitted normal projection before C M S without copying payload or output', async () => {
    const { input, expectation, contract, normal, child } = await claimShapeFixture();
    const documents = require('../../../src/next/provenance/packageContract').admittedDocuments(input.packageReceipt);
    const schema = documents.find(row => row.path === 'docs/contracts/next/provenance-v2/claim-contract.schema.json');
    const bindings = contract.readPathCandidateMetricReference({ expectation }).bindings;
    const helper = normal.data.sources.find(row => row.path === 'src/next/provenance/claimContext.js');
    assert.ok(helper, 'normal projection bytes must be captured, not inferred by field names');
    for (const seed of child.seeds) {
        const claim = bindings.find(row => row.fact_key === seed.fact_key).claim;
        const projected = require('../../../src/next/provenance/claimContext').projectClaimContext(claim, schema.value);
        assert.deepEqual(seed.claim_context.shape, JSON.parse(JSON.stringify(projected.shape)));
        assert.equal(seed.claim_context.schema_sha256, schema.sha256);
        assert.equal(Object.hasOwn(seed.claim_context, 'value'), false);
        assert.equal(Object.hasOwn(seed.claim_context.shape.fields, 'output'), false);
        assert.equal(Object.hasOwn(seed.claim_context.shape.fields, 'qualification'), false);
    }
    let periodReaders = 0;
    for (const variant of ['C', 'M', 'S']) for (const row of contract.readPathCandidateReceiverOrigins({ expectation, variant }))
        for (const projection of [...row.phases, row.functional]) for (const call of projection.calls)
            if (call.target_origin.kind === 'capability_method' && call.target_origin.name === 'get'
                && call.target_origin.receiver.binding.kind === 'claim_context'
                && call.return_origin.kind === 'capability' && call.return_origin.binding.path.join('/') === 'period') {
                periodReaders++;
                assert.equal(call.return_origin.binding.return_conditions.runtime_proved, false);
                assert.equal(call.return_origin.binding.return_conditions.may_be_absent, true);
            }
    assert.ok(periodReaders > 0);
    assert.equal(expectation.qualified, false);
    assert.equal(expectation.semantic_mutation_credit, 0);
});

test('N02G:PATH-V3-053 claim shape linkage cannot admit output qualification foreign source rehash or fake same name receivers', async () => {
    const { normal, child } = await claimShapeFixture();
    const capability = await import('../../../scripts/agent/pathCapabilityEffectContract.mjs');
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const { projectPathReceiverOrigins } = await import('../../../scripts/agent/pathReceiverOriginContract.mjs');
    const seed = child.seeds.find(row => row.claim_context?.shape.fields.period);
    assert.ok(seed);
    const inspect = source => {
        const built = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source }], entry: 'program.js', exportName: 'run' });
        const syntax = inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' });
        return projectPathReceiverOrigins(syntax.inventories[0], 'child_proof_operands', seed, normal.data, child.data);
    };
    for (const field of ['output', 'qualification', 'expected', 'not_admitted']) {
        const projection = inspect(`function run(ops){return ops.claim().get(${JSON.stringify(field)}).get("value");}module.exports={run};`);
        assert.ok(projection.calls.some(row => row.return_origin.reason === 'non_material_or_unknown_field'));
        assert.equal(projection.effect_closure_complete, false);
        assert.equal(projection.semantic_mutation_credit, 0);
    }
    const fake = inspect('function run(ops){const fake={claim:()=>({get:()=>({get:()=>0})})};return fake.claim().get("period").get("kind");}module.exports={run};');
    assert.ok(!fake.calls.some(row => row.target_origin.kind === 'capability_method'));
    const changed = JSON.parse(JSON.stringify(normal.data.sources));
    const helper = changed.find(row => row.path === 'src/next/provenance/claimContext.js');
    helper.source += '\n// changed';
    helper.sha256 = 'sha256:' + require('node:crypto').createHash('sha256').update(helper.source).digest('hex');
    assert.throws(() => capability.verifyPathNormalCapabilityReference({ reference: normal.reference, sources: changed }));
    assert.throws(() => capability.verifyPathNormalCapabilityReference({ reference: { ...normal.reference }, sources: normal.data.sources }));
});

test('N02G:PATH-V3-050 real common factories bind passive returned methods to exact captured definitions before C M S', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation);
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship:
        api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile: await phaseFixture() }) });
    let exact = 0, conditional = 0;
    for (const variant of ['C', 'M', 'S']) {
        const closure = contract.readPathCandidateClosureReference({ expectation, variant });
        for (const program of closure.programs) for (const bundle of program.analysis.inventories)
            for (const module of bundle.modules) for (const call of module.call_bindings) {
                if (call.callee.kind === 'member' && ['members', 'evaluateScalarProof', 'compareTypedScalars'].includes(call.callee.property)
                    && call.target?.kind === 'local_function' && /(?:collection|scalar)ProofCore\.js$/.test(call.target.module)) exact++;
            }
        for (const row of contract.readPathCandidateReceiverOrigins({ expectation, variant }))
            for (const projection of row.phases) for (const call of projection.calls)
                if (call.target_origin.kind === 'callable' && /(?:collection|scalar)ProofCore\.js$/.test(call.target_origin.module)) {
                    conditional++;
                    assert.equal(call.runtime_dominance_and_effects_proved, false);
                    assert.match(call.target_origin.body_sha256, /^sha256:[a-f0-9]{64}$/);
                }
    }
    assert.ok(exact > 0, 'normal passive factory methods must link to their actual bodies');
    assert.ok(conditional > 0);
    assert.equal(expectation.qualified, false);
    assert.equal(expectation.semantic_mutation_credit, 0);
});

test('N02G:PATH-V3-051 passive factory grammar cannot hide getters prototypes effects branches or mutated intrinsic authority', async () => {
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    function inspect(body, top = '', property = 'read') {
        const built = buildCommonJsGuestBundle({ sources: [
            { path: 'program.js', source: 'const {create}=require("./helper");const api=create();module.exports={run:ops=>api['
                + JSON.stringify(property) + '](ops)};' },
            { path: 'helper.js', source: top + 'function create(){function read(node){return node.get("id");}' + body + '}module.exports={create};' }],
            entry: 'program.js', exportName: 'run' });
        const analysis = inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' });
        return { analysis, call: analysis.inventories[0].modules.find(module => module.path === 'program.js')
            .call_bindings.find(call => call.callee.property === property) };
    }
    const positive = inspect('const metadata=Object.freeze(["fixed",1]);return Object.freeze({read,metadata});');
    assert.equal(positive.call.target?.module, 'helper.js');
    assert.match(positive.call.target.body_sha256, /^sha256:[a-f0-9]{64}$/);
    assert.equal(positive.analysis.necessary_equivalence_proved, false);
    for (const body of ['return Object.freeze({get read(){return read;}});',
        'return Object.freeze({__proto__:{read}});', 'return Object.freeze({read,read:()=>0});',
        'const value={read};return Object.freeze(value);', 'return Object.seal({read});',
        'const metadata=[Object.keys({read})];return Object.freeze({read,metadata});',
        'const Object={freeze:x=>x};return Object.freeze({read});',
        'if(true)return Object.freeze({read});return Object.freeze({read:()=>0});',
        'read=()=>0;return Object.freeze({read});', 'Object.keys({read});return Object.freeze({read});']) {
        assert.equal(inspect(body).call.target, null, body);
    }
    assert.equal(inspect('return Object.freeze({read});', 'Object.freeze=x=>x;').call.target, null);
    assert.equal(inspect('const metadata=Object.freeze([1]);return {read};', 'Object.freeze=x=>x;').call.target, null);
    assert.equal(inspect('const metadata={x:Object.freeze([1])};return {read};', 'Object.freeze=x=>x;').call.target, null);
    assert.equal(inspect('return Object.freeze({1:read,"1":()=>0});', '', '1').call.target, null);
});

async function receiverReturnFixture() {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation);
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship:
        api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile: await phaseFixture() }) });
    const normal = contract.readPathCandidateCapabilityReference({ expectation });
    const child = contract.readPathCandidateChildABIReference({ expectation });
    const seed = child.seeds.find(seed => seed.selected_sets.length && seed.input_sets.length && Object.values(seed.material_descriptors)
        .some(material => Object.values(material.fields).some(field => field.type === 'ref_list')));
    const { projectPathReceiverOrigins } = await import('../../../scripts/agent/pathReceiverOriginContract.mjs');
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    return { seed, inspect(source) {
        const built = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source }], entry: 'program.js', exportName: 'run' });
        const syntax = inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' });
        return projectPathReceiverOrigins(syntax.inventories[0], 'child_proof_operands', seed, normal.data, child.data);
    } };
}

test('N02G:PATH-V3-048 admitted return shapes preserve conditional child handles absence projections and scalar distinctions', async () => {
    const { seed, inspect } = await receiverReturnFixture();
    const [alias, material] = Object.entries(seed.material_descriptors).find(([alias, material]) => seed.nodes[alias]?.binding === 'snapshot'
        && Object.values(material.fields).some(field => field.type === 'ref_list'));
    const field = Object.keys(material.fields).find(name => material.fields[name].type === 'ref_list');
    const projection = inspect(`function run(ops){const root=ops.node(${JSON.stringify(alias)});const list=root.get(${JSON.stringify(field)});list.length();list.at(0);root.keys().length();return root.get("id");}module.exports={run};`);
    const get = projection.calls.find(row => row.target_origin.kind === 'capability_method'
        && row.target_origin.name === 'get' && row.return_origin.kind === 'capability');
    assert.ok(get, 'ref_list is a conditional child handle, not scalar by substring');
    assert.equal(get.return_origin.surface, 'node');
    assert.equal(get.return_origin.binding.shape.type, 'sequence');
    assert.equal(get.return_origin.binding.shape.item.type, 'scalar');
    assert.deepEqual(get.return_origin.binding.path, [field]);
    assert.equal(get.return_origin.binding.projection, 'data');
    assert.equal(get.return_origin.binding.return_conditions.runtime_proved, false);
    const lengths = projection.calls.filter(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'length');
    assert.equal(lengths.length, 2);
    assert.equal(lengths.find(row => row.target_origin.receiver.binding.projection === 'keys').target_origin.receiver.binding.shape.item.type, 'scalar');
    const at = projection.calls.find(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'at');
    assert.equal(at.return_origin.kind, 'scalar');
    assert.equal(at.return_origin.return_conditions.may_be_absent, true);
    assert.ok(projection.calls.some(row => row.target_origin.name === 'get' && row.return_origin.kind === 'scalar'));
    assert.equal(projection.operational_receiver_authority, false);
    assert.equal(projection.necessary_equivalence_proved, false);
});

test('N02G:PATH-V3-049 return shape propagation cannot manufacture payload presence membership edges or same-name authority', async () => {
    const { seed, inspect } = await receiverReturnFixture();
    const alias = Object.keys(seed.material_descriptors).find(alias => seed.nodes[alias]?.binding === 'snapshot'
        && Object.values(seed.material_descriptors[alias].fields).some(field => field.type === 'ref_list'));
    const material = seed.material_descriptors[alias], q = JSON.stringify(alias);
    for (const term of ['ops.node(' + q + ').get("not_admitted")', 'ops.node(' + q + ').get(field)',
        'ops.node(' + q + ').get("id")', '({get:()=>({length:()=>1})}).get("members")']) {
        const p = inspect(`function run(ops){const field="id";return ${term}.length();}module.exports={run};`);
        assert.ok(!p.calls.some(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'length'), term);
        assert.equal(p.semantic_mutation_credit, 0);
    }
    const display = Object.keys(material.fields).find(name => material.fields[name].class === 'non_material');
    if (display) {
        const p = inspect(`function run(ops){return ops.node(${q}).get(${JSON.stringify(display)}).length();}module.exports={run};`);
        assert.ok(p.calls.some(row => row.return_origin.reason === 'non_material_or_unknown_field'));
    }
    const setName = JSON.stringify(seed.input_sets[0].name);
    const p = inspect(`function run(ops){const members=ops.set(${setName}).select(node=>true);return members.at(0).get("id");}module.exports={run};`);
    const selected = p.calls.find(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'select');
    assert.equal(selected.return_origin.kind, 'capability');
    assert.equal(selected.return_origin.binding.membership, 'runtime_selected_not_fixture_output');
    const member = p.calls.find(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'at');
    assert.equal(member.return_origin.binding.return_conditions.may_be_absent, true);
    assert.equal(member.return_origin.binding.return_conditions.runtime_proved, false);
    assert.equal(p.effect_closure_complete, false);
    assert.equal(p.executable_consumer_absence_proved, false);
    const selection = seed.selected_sets[0];
    const selectedCall = inspect(`function read(node){return node.get("id");}function run(ops){return ops.select(${JSON.stringify(selection.candidate_set)},${JSON.stringify(selection.selected_set)},read);}module.exports={run};`);
    assert.ok(selectedCall.callback_bindings.some(row => row.callback_argument_index === 2), 'REAL child select callback is its third argument');
    assert.ok(selectedCall.calls.some(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'get'));
    assert.equal(selectedCall.calls.find(row => row.target_origin.name === 'select').return_origin.binding.membership,
        'runtime_selected_not_fixture_output');
    const invalidSelect = inspect(`function read(node){return node.get("id");}function run(ops){return ops.select(${JSON.stringify(selection.candidate_set)},"unbound_target",read);}module.exports={run};`);
    assert.ok(!invalidSelect.calls.some(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'get'));
    assert.ok(invalidSelect.calls.some(row => row.return_origin.reason === 'selection_target_or_population_not_admitted'));
    const listField = Object.keys(material.fields).find(name => material.fields[name].type === 'ref_list');
    const wrongShape = inspect(`function run(ops){const root=ops.node(${q});root.length();root.get(${JSON.stringify(listField)}).identity("kind");return root.keys().keys();}module.exports={run};`);
    assert.ok(wrongShape.calls.some(row => row.return_origin.reason === 'sequence_shape_not_admitted'));
    assert.ok(wrongShape.calls.some(row => row.return_origin.reason === 'identity_requires_root_data_projection'));
    assert.ok(wrongShape.calls.some(row => row.return_origin.reason === 'keys_requires_data_projection'));
    const dynamic = inspect(`function run(ops){const root=ops.node(${q});const field=root.get("id");return root.get(field).length();}module.exports={run};`);
    assert.ok(dynamic.calls.some(row => row.return_origin.reason === 'non_material_or_unknown_field'));
    assert.ok(!dynamic.calls.some(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'length'));
    const edge = seed.edges.find(edge => edge.relation === 'material_ref' && seed.nodes[edge.source]?.binding === 'snapshot'
        && seed.nodes[edge.target]?.binding === 'snapshot');
    assert.ok(edge);
    const traversal = inspect(`function run(ops){return ops.node(${JSON.stringify(edge.source)}).traverse(${JSON.stringify(edge.id)}).identity("ref_id");}module.exports={run};`);
    const target = traversal.calls.find(row => row.target_origin.name === 'traverse').return_origin;
    assert.equal(target.binding.alias, edge.target);
    assert.equal(target.binding.return_conditions.runtime_proved, false);
    const claim = inspect('function run(ops){return ops.claim().get("not_admitted").get("kind");}module.exports={run};');
    assert.ok(claim.calls.some(row => row.return_origin.reason === 'non_material_or_unknown_field'));
});

test('N02G:PATH-V3-046 genuine child roots compose finite receivers and callback origins over every real program before C M S', async t => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation);
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship:
        api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile: await phaseFixture() }) });
    let bound = 0, unresolved = 0, callbacks = 0;
    for (const variant of ['C', 'M', 'S']) {
        const rows = contract.readPathCandidateReceiverOrigins({ expectation, variant });
        assert.equal(rows.length, input.ir.graphs.length);
        for (const row of rows) for (const projection of [...row.phases, row.functional]) {
            assert.equal(projection.fact_key, row.fact_key);
            assert.equal(projection.qualified, false);
            assert.equal(projection.guest_call_provenance_complete, false);
            assert.equal(projection.effect_closure_complete, false);
            assert.equal(projection.necessary_equivalence_proved, false);
            assert.ok(projection.calls.length > 0);
            bound += projection.conditional_capability_calls;
            unresolved += projection.unresolved_potential_calls;
            callbacks += projection.callback_bindings.length;
            assert.ok(projection.calls.filter(call => call.target_origin.kind === 'capability_method')
                .every(call => /^sha256:[a-f0-9]{64}$/.test(call.target_origin.definition_sha256)
                    && call.runtime_dominance_and_effects_proved === false));
        }
    }
    assert.ok(bound > 0 && unresolved > 0 && callbacks > 0);
    assert.equal(expectation.semantic_mutation_credit, 0);
    const causes = Object.create(null), unresolvedReturns = Object.create(null);
    for (const row of contract.readPathCandidateReceiverOrigins({ expectation, variant: 'C' }))
        for (const projection of [...row.phases, row.functional]) for (const call of projection.calls)
            if (call.potential_consumer && call.target_origin.kind === 'unknown') {
                const reason = call.target_origin.reason;
                causes[reason] = (causes[reason] || 0) + 1;
            } else if (call.potential_consumer && call.target_origin.kind === 'capability_method' && call.return_origin.kind === 'unknown') {
                const reason = call.return_origin.reason;
                unresolvedReturns[reason] = (unresolvedReturns[reason] || 0) + 1;
            }
    t.diagnostic(JSON.stringify({ stage: 'C_conditional_projection_not_execution_or_credit', unknown_causes: causes,
        unresolved_capability_returns: unresolvedReturns }));
});

test('N02G:PATH-V3-047 receiver references cannot be replaced by caller roots clones outputs parent receipts or active scopes', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation);
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship:
        api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile: await phaseFixture() }) });
    const rows = contract.readPathCandidateReceiverOrigins({ expectation, variant: 'C' });
    assert.ok(rows.every(row => Object.isFrozen(row) && Object.isFrozen(row.functional.calls)));
    assert.throws(() => contract.readPathCandidateReceiverOrigins({ expectation: structuredClone(expectation), variant: 'C' }));
    for (const key of ['roots', 'expected', 'scope', 'selected_output', 'parent_receipts', 'approval'])
        assert.throws(() => contract.readPathCandidateReceiverOrigins({ expectation, variant: 'C', [key]: rows }));
    let effects = 0;
    const active = { expectation };
    Object.defineProperty(active, 'variant', { enumerable: true, get() { effects++; return 'C'; } });
    assert.throws(() => contract.readPathCandidateReceiverOrigins(active));
    assert.throws(() => contract.readPathCandidateReceiverOrigins(new Proxy({ expectation, variant: 'C' }, { ownKeys() { effects++; return []; } })));
    assert.equal(effects, 0);
    const calls = rows.flatMap(row => [...row.phases, row.functional].flatMap(projection => projection.calls));
    assert.ok(calls.some(call => call.target_origin.kind === 'unknown'));
    assert.ok(calls.every(call => call.runtime_dominance_and_effects_proved === false));
    assert.ok(rows.every(row => row.functional.executable_consumer_absence_proved === false));
    const { projectPathReceiverOrigins } = await import('../../../scripts/agent/pathReceiverOriginContract.mjs');
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const child = contract.readPathCandidateChildABIReference({ expectation });
    const normal = contract.readPathCandidateCapabilityReference({ expectation });
    const seed = child.seeds.find(seed => seed.input_sets.length && Object.values(seed.nodes).some(node => node.binding === 'snapshot'));
    const alias = Object.keys(seed.nodes).find(alias => seed.nodes[alias].binding === 'snapshot');
    const inspect = source => {
        const built = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source }], entry: 'program.js', exportName: 'run' });
        const syntax = inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' });
        // Low-level BUILD projection is NOT an admission API. Genuine product
        // references can only be obtained through the opaque family above.
        return projectPathReceiverOrigins(syntax.inventories[0], 'child_proof_operands', seed, normal.data, child.data);
    };
    const bound = inspect(`function run(ops){const alias=ops;return alias.node(${JSON.stringify(alias)}).get("id");}module.exports={run};`);
    assert.ok(bound.calls.some(call => call.target_origin.kind === 'capability_method' && call.target_origin.name === 'get'));
    for (const prefix of ['const alias={node:()=>({get:()=>0})};',
        'let alias=ops;alias={node:()=>({get:()=>0})};',
        'const alias=ops;alias.node=()=>({get:()=>0});']) {
        const fake = inspect(`function run(ops){${prefix}return alias.node(${JSON.stringify(alias)}).get("id");}module.exports={run};`);
        assert.ok(!fake.calls.some(call => call.target_origin.kind === 'capability_method' && call.target_origin.name === 'get'));
        assert.equal(fake.operational_receiver_authority, false);
    }
    const setName = JSON.stringify(seed.input_sets[0].name);
    const mixed = inspect(`function read(node){return node.get("id");}function run(ops){ops.set(${setName}).select(read);read({get:()=>0});return true;}module.exports={run};`);
    assert.ok(mixed.parameter_origins.some(row => row.origin.reason === 'conflicting_incoming_origins'));
    assert.ok(!mixed.calls.some(call => call.target_origin.kind === 'capability_method' && call.target_origin.name === 'get'));
    assert.ok(mixed.callback_bindings.length > 0);
    assert.equal(mixed.qualified, false);
    assert.equal(mixed.effect_closure_complete, false);
    const linked = buildCommonJsGuestBundle({ sources: [
        { path: 'program.js', source: `const ns=require("./reader");const alias=ns;function run(ops){return ops.set(${setName}).select(alias.read);}module.exports={run};` },
        { path: 'reader.js', source: 'function read(node){return node.get("id");}module.exports={read};' }],
        entry: 'program.js', exportName: 'run' });
    const syntax = inspectPathExecutableClosure({ source: linked.source, sourceHashes: linked.sourceHashes, kind: 'metric' });
    const callback = projectPathReceiverOrigins(syntax.inventories[0], 'child_proof_operands', seed, normal.data, child.data);
    assert.ok(callback.callback_bindings.some(row => row.target.module === 'reader.js'));
    assert.ok(callback.calls.some(call => call.module === 'reader.js' && call.target_origin.kind === 'capability_method'
        && call.target_origin.name === 'get'));
});

test('N02G:PATH-V3-038 whole family call bindings are sealed before M and retain unresolved dispatch without granting value flow proof', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation);
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship:
        api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile: await phaseFixture() }) });
    for (const variant of ['C', 'M', 'S']) {
        const closure = contract.readPathCandidateClosureReference({ expectation, variant });
        const roots = contract.readPathCandidateRootCapabilityBindings({ expectation, variant });
        assert.equal(roots.length, closure.programs.length);
        assert.ok(roots.every(row => row.phase_entries.length === 2 && row.phase_entries.every(entry => entry.function
            && entry.bindings?.[0]?.source.kind === 'ordinary_bundle_operands_forwarding')));
        assert.ok(roots.every(row => row.guest_call_provenance_complete === false));
        assert.ok(roots.every(row => row.functional_entries.length === 1 && row.functional_entries[0].function
            && row.functional_entries[0].bindings?.[0]?.source.kind === 'ordinary_bundle_operands_forwarding'));
        for (const row of [...closure.programs, ...closure.metrics]) {
            assert.equal(row.analysis.call_binding_inventory_complete, true);
            assert.equal(row.analysis.function_boundary_inventory_complete, true);
            assert.equal(row.analysis.value_flow_proof_complete, false);
            assert.ok(row.analysis.unresolved_call_count > 0);
            for (const bundle of row.analysis.inventories) for (const module of bundle.modules)
                assert.equal(module.call_bindings.length, module.call_site_count);
        }
    }
    require('../../../src/next/provenance/pathSemanticReference').sealPathQualificationReference({ candidate });
    const result = compiler.compilePathQualificationProgramCandidate({ capture: compiler.capturePathQualificationCompiler(), candidate, expectation });
    assert.deepEqual(result.worlds.map(row => row.static_call_binding_conformance), [true, true, true]);
    assert.deepEqual(result.worlds.map(row => row.function_boundary_conformance), [true, true, true]);
    assert.deepEqual(result.worlds.map(row => row.conditional_receiver_reference_conformance), [true, true, true]);
    assert.deepEqual(result.worlds.map(row => row.effect_obligation_conformance), [true, true, true]);
    assert.ok(result.worlds.every(row => row.effect_closure_complete === false
        && row.effect_composition_status === 'blocked_missing_effect_discharge'));
    assert.ok(result.worlds.every(row => row.operational_receiver_authority === false));
    assert.throws(() => contract.readPathCandidateRootCapabilityBindings({ expectation: structuredClone(expectation), variant: 'C' }));
    let effects = 0;
    const active = { expectation };
    Object.defineProperty(active, 'variant', { enumerable: true, get() { effects++; return 'C'; } });
    assert.throws(() => contract.readPathCandidateRootCapabilityBindings(active));
    assert.equal(effects, 0);
    assert.equal(result.executable_consumer_absence_proved, false);
    assert.equal(result.qualified, false); assert.equal(result.handle_attempts, 0);
});

test('N02G:PATH-V3-039 callable linkage resolves renamed imports namespace and local aliases but never assumes mutable or dynamic dispatch', async () => {
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const helper = 'const read=handle=>handle.get("id");module.exports={read};';
    const analyze = source => {
        const built = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source },
            { path: 'helper.js', source: helper }], entry: 'program.js', exportName: 'run' });
        return inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' });
    };
    const checked = analyze('const {read:reader}=require("./helper");const alias=reader;function run(x){return alias(x);}module.exports={run};');
    const calls = checked.inventories[0].modules.find(row => row.path === 'program.js').call_bindings;
    assert.ok(calls.some(row => row.target?.kind === 'local_function' && row.target.module === 'helper.js'));
    assert.equal(checked.call_binding_inventory_complete, true);
    const namespace = analyze('const namespace=require("./helper");const alias=namespace;module.exports={run:x=>alias.read(x)};');
    assert.ok(namespace.inventories[0].modules.find(row => row.path === 'program.js').call_bindings
        .some(row => row.target?.kind === 'local_function' && row.target.module === 'helper.js'));
    for (const source of [
        'const {read}=require("./helper");let alias=read;alias=x=>x;module.exports={run:x=>alias(x)};',
        'const ns=require("./helper");module.exports={run:(x,key)=>ns[key](x)};']) {
        const ambiguous = analyze(source);
        const unresolved = ambiguous.inventories[0].modules.find(row => row.path === 'program.js').call_bindings
            .filter(row => row.target === null);
        assert.ok(unresolved.length > 0);
        assert.equal(ambiguous.value_flow_proof_complete, false);
        assert.equal(ambiguous.executable_consumer_absence_proved, false);
    }
    const shadowed = analyze('const {read}=require("./helper");module.exports={run:read=>read(1)};');
    assert.ok(shadowed.inventories[0].modules.find(row => row.path === 'program.js').call_bindings
        .some(row => row.target === null && row.reason === 'parameter_dispatch'));
    const namespaceWrite = analyze('const ns=require("./helper");const alias=ns;alias.read=x=>x;module.exports={run:x=>ns.read(x)};');
    assert.ok(namespaceWrite.inventories[0].modules.find(row => row.path === 'program.js').call_bindings
        .some(row => row.target === null && ['mutable_binding', 'module_namespace_mutated'].includes(row.reason)));
    const intrinsicWrite = analyze('require("./helper");Object.freeze=x=>x;module.exports={run:x=>Object.freeze(x)};');
    assert.ok(intrinsicWrite.inventories[0].modules.find(row => row.path === 'program.js').call_bindings
        .some(row => row.target === null && row.reason === 'intrinsic_reassigned'));
    const cycle = analyze('require("./helper");const a=b;const b=a;module.exports={run:x=>a(x)};');
    assert.ok(cycle.inventories[0].modules.find(row => row.path === 'program.js').call_bindings
        .some(row => row.target === null && row.reason === 'alias_cycle'));
    for (let depth = 1; depth <= 4; depth++) {
        const aliases = Array.from({ length: depth }, (_, index) =>
            `const a${index}=${index ? 'a' + (index - 1) : 'ns'};`).join('');
        const mutated = analyze(`const ns=require("./helper");${aliases}a${depth - 1}.read=x=>x;module.exports={run:x=>ns.read(x)};`);
        assert.ok(mutated.inventories[0].modules.find(row => row.path === 'program.js').call_bindings
            .some(row => row.target === null && ['mutable_binding', 'module_namespace_mutated'].includes(row.reason)));
        const intrinsicAlias = analyze(`require("./helper");const ns=Object;${aliases}a${depth - 1}.freeze=x=>x;module.exports={run:x=>Object.freeze(x)};`);
        assert.ok(intrinsicAlias.inventories[0].modules.find(row => row.path === 'program.js').call_bindings
            .some(row => row.target === null && row.reason === 'intrinsic_reassigned'));
    }
});

test('N02G:PATH-V3-040 normal capability authority binds every real exposed surface and complete source before C M S', async () => {
    const capability = await import('../../../scripts/agent/pathCapabilityEffectContract.mjs');
    const reference = capability.capturePathNormalCapabilityReference();
    const data = capability.readPathNormalCapabilityReference({ reference });
    assert.equal(data.surfaces.length, 6);
    assert.deepEqual(data.surfaces.map(row => row.kind).sort(),
        ['node', 'node_iterator', 'node_set', 'set_iterator', 'derived_parent', 'proof_operands'].sort());
    assert.equal(data.sources.length, 3);
    for (const surface of data.surfaces) for (const method of surface.methods) {
        assert.ok(method.source.length > 0 && /^sha256:[a-f0-9]{64}$/.test(method.source_sha256));
        assert.ok(method.rule.returns && Array.isArray(method.rule.observation_operations));
        assert.equal(method.rule.effect_scope, 'shared_normal_capability_contract_not_call_provenance');
    }
    const node = data.surfaces.find(row => row.kind === 'node');
    assert.equal(node.methods.find(row => row.name === 'get').rule.returns, 'absent_or_scalar_or_child_handle_by_admitted_shape');
    assert.equal(node.methods.find(row => row.name === 'follow').rule.returns, 'root_node_by_admitted_edge');
    assert.equal(data.surfaces.find(row => row.kind === 'node_set').methods.find(row => row.name === 'select').rule.callback,
        'each_member_node_and_index_boolean_decision_no_raw_payload');
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation);
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship:
        api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile: await phaseFixture() }) });
    const sealed = contract.readPathCandidateCapabilityReference({ expectation });
    assert.equal(sealed.reference.reference_sha256, reference.reference_sha256);
    assert.equal(expectation.normal_capability_reference_sha256, reference.reference_sha256);
    assert.equal(expectation.value_flow_proof_complete, false);
    assert.equal(expectation.executable_consumer_absence_proved, false);
    assert.equal(expectation.semantic_mutation_credit, 0);
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    require('../../../src/next/provenance/pathSemanticReference').sealPathQualificationReference({ candidate });
    const result = compiler.compilePathQualificationProgramCandidate({ capture: compiler.capturePathQualificationCompiler(), candidate, expectation });
    assert.equal(result.normal_capability_source_conformance, true);
    assert.equal(result.normal_capability_reference_sha256, reference.reference_sha256);
    assert.equal(result.executable_consumer_absence_proved, false); assert.equal(result.handle_attempts, 0);
});

test('N02G:PATH-V3-041 capability source or full surface drift and rehash cannot replace private authority and active transports are inert', async () => {
    const capability = await import('../../../scripts/agent/pathCapabilityEffectContract.mjs');
    const reference = capability.capturePathNormalCapabilityReference();
    const data = capability.readPathNormalCapabilityReference({ reference });
    assert.equal(capability.verifyPathNormalCapabilityReference({ reference, sources: data.sources }).source_conformance, true);
    const buildHashes = data.sources.map(row => ({ path: row.path.slice('src/next/'.length), sha256: row.sha256 }));
    assert.equal(capability.verifyPathNormalCapabilityBuildBinding({ reference, sourceHashes: buildHashes }).normal_capability_source_conformance, true);
    for (let index = 0; index < buildHashes.length; index++) {
        const changed = structuredClone(buildHashes); changed[index].sha256 = 'sha256:' + '0'.repeat(64);
        assert.throws(() => capability.verifyPathNormalCapabilityBuildBinding({ reference, sourceHashes: changed }));
    }
    assert.throws(() => capability.verifyPathNormalCapabilityBuildBinding({ reference, sourceHashes: [...buildHashes, buildHashes[0]] }));
    assert.throws(() => capability.verifyPathNormalCapabilityBuildBinding({ reference, sourceHashes: buildHashes.slice(1) }));
    for (let index = 0; index < data.sources.length; index++) {
        const changed = structuredClone(data.sources);
        changed[index].source += '\n// drift with newly calculated raw digest\n';
        changed[index].sha256 = 'sha256:' + require('node:crypto').createHash('sha256').update(changed[index].source).digest('hex');
        assert.throws(() => capability.verifyPathNormalCapabilityReference({ reference, sources: changed }));
    }
    assert.throws(() => capability.readPathNormalCapabilityReference({ reference: structuredClone(reference) }));
    assert.throws(() => capability.capturePathNormalCapabilityReference({ sources: data.sources }));
    assert.throws(() => capability.verifyPathNormalCapabilityReference({ reference, sources: [...data.sources].reverse() }));
    assert.throws(() => capability.verifyPathNormalCapabilityReference({ reference, sources: data.sources.slice(1) }));
    let effects = 0;
    const active = { reference };
    Object.defineProperty(active, 'sources', { enumerable: true, get() { effects++; return data.sources; } });
    assert.throws(() => capability.verifyPathNormalCapabilityReference(active));
    assert.throws(() => capability.verifyPathNormalCapabilityReference({ reference, sources:
        new Proxy(data.sources, { ownKeys() { effects++; return []; } }) }));
    assert.equal(effects, 0);
    const fs = require('node:fs'), read = fs.readFileSync;
    fs.readFileSync = function(file, ...args) {
        const value = read.call(this, file, ...args);
        if (typeof file !== 'string' || !file.replaceAll('\\', '/').endsWith('/src/next/provenance/instrumentedAccess.js')) return value;
        const altered = value.toString().replace("event('has',", "event('get',");
        assert.notEqual(altered, value.toString());
        return typeof value === 'string' ? altered : Buffer.from(altered);
    };
    try { assert.throws(() => capability.recheckPathNormalCapabilityReference({ reference })); }
    finally { fs.readFileSync = read; }
    assert.equal(reference.value_flow_proof_complete, false);
    assert.equal(reference.executable_consumer_absence_proved, false);
    assert.equal(reference.validation_tcb_complete, false);
    // Capture an altered REAL factory in memory, then restore physical reads.
    // Fresh raw/source table digests do not authorize it against the earlier seal.
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation);
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship:
        api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile: await phaseFixture() }) });
    require('../../../src/next/provenance/pathSemanticReference').sealPathQualificationReference({ candidate });
    let capture, changedReads = 0;
    fs.readFileSync = function(file, ...args) {
        const value = read.call(this, file, ...args);
        if (typeof file !== 'string' || !file.replaceAll('\\', '/').endsWith('/src/next/provenance/instrumentedAccess.js')) return value;
        const altered = value.toString().replace("event('has',", "event('get',");
        assert.notEqual(altered, value.toString()); changedReads++;
        return typeof value === 'string' ? altered : Buffer.from(altered);
    };
    try { capture = compiler.capturePathQualificationCompiler(); } finally { fs.readFileSync = read; }
    assert.ok(changedReads > 0);
    let failure;
    try { compiler.compilePathQualificationProgramCandidate({ capture, candidate, expectation }); }
    catch (error) { failure = error; }
    assert.match(failure?.message ?? '', /BUILD_source_binding/);
    const retained = compiler.readPathQualificationCompilerEvidence(failure);
    assert.equal(retained.capability_conformance_failed, true);
    assert.equal(retained.stage, 'before_first_normal_compile');
    assert.equal(retained.compiler_artifact_root, capture.artifact_root);
    assert.equal(retained.handle_attempts, 0); assert.equal(retained.semantic_mutation_credit, 0);
    assert.throws(() => compiler.compilePathQualificationProgramCandidate({ capture, candidate, expectation }), /poisoned/);
});

test('N02G:PATH-V3-042 child ABI and all authorial input capability seeds are sealed before C M S without fixture selected rosters', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation);
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship:
        api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile: await phaseFixture() }) });
    const child = contract.readPathCandidateChildABIReference({ expectation });
    assert.equal(child.reference.reference_sha256, expectation.normal_child_abi_reference_sha256);
    assert.equal(child.data.role_constructions.length, 4);
    assert.deepEqual(child.data.surfaces.find(row => row.kind === 'child_proof_operands').methods.map(row => row.name).sort(),
        ['node', 'claim', 'set', 'select', 'resolveReference', 'memberEdge', 'edge'].sort());
    assert.deepEqual(child.data.surfaces.find(row => row.kind === 'child_derivation_guard').methods.map(row => row.name).sort(),
        ['node', 'claim', 'set', 'edge', 'edgeTargetInSet'].sort());
    assert.equal(child.data.excluded_profile_extensions.length, 2);
    assert.equal(child.reference.profile_extension_authority, false);
    assert.equal(child.seeds.length, input.ir.graphs.length);
    for (let index = 0; index < child.seeds.length; index++) {
        const row = child.seeds[index], graph = input.ir.graphs[index];
        assert.equal(row.fact_key, graph.fact_key);
        assert.deepEqual(row.nodes, graph.nodes);
        assert.deepEqual(row.edges, graph.edges);
        assert.deepEqual(row.operands, graph.operands);
        for (const set of row.selected_sets) {
            assert.equal(set.runtime_membership_not_pinned_to_authored_output, true);
            assert.equal(Object.hasOwn(set, 'aliases'), false);
        }
        assert.equal(row.parent_receipts_admitted, false);
    }
    require('../../../src/next/provenance/pathSemanticReference').sealPathQualificationReference({ candidate });
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const result = compiler.compilePathQualificationProgramCandidate({ capture: compiler.capturePathQualificationCompiler(), candidate, expectation });
    assert.equal(result.normal_child_abi_source_conformance, true);
    assert.equal(result.normal_child_abi_reference_sha256, expectation.normal_child_abi_reference_sha256);
    assert.equal(result.guest_call_provenance_complete, false);
    assert.equal(result.dp_execution, false); assert.equal(result.handle_attempts, 0);
});

test('N02G:PATH-V3-043 child ABI bytes rehash or active transport cannot replace authority and altered capsule is refused before C', async () => {
    const capability = await import('../../../scripts/agent/pathCapabilityEffectContract.mjs');
    const normalReference = capability.capturePathNormalCapabilityReference();
    const reference = capability.capturePathNormalChildABIReference({ normalReference });
    const data = capability.readPathNormalChildABIReference({ reference });
    const hashes = [{ path: 'provenance/executionHostChild.js', sha256: data.source.sha256 },
        ...capability.readPathNormalCapabilityReference({ reference: normalReference }).sources
            .filter(row => row.path.endsWith('/instrumentedAccess.js'))
            .map(row => ({ path: 'provenance/instrumentedAccess.js', sha256: row.sha256 }))];
    assert.equal(capability.verifyPathNormalChildABIBuildBinding({ reference, sourceHashes: hashes }).normal_child_abi_source_conformance, true);
    assert.throws(() => capability.readPathNormalChildABIReference({ reference: structuredClone(reference) }));
    assert.throws(() => capability.capturePathNormalChildABIReference({ normalReference: structuredClone(normalReference) }));
    assert.throws(() => capability.capturePathNormalChildABIReference({ normalReference, profileExtensionAuthority: true }));
    for (let index = 0; index < hashes.length; index++) {
        const changed = structuredClone(hashes); changed[index].sha256 = 'sha256:' + '0'.repeat(64);
        assert.throws(() => capability.verifyPathNormalChildABIBuildBinding({ reference, sourceHashes: changed }));
    }
    let effects = 0;
    const active = { reference };
    Object.defineProperty(active, 'sourceHashes', { enumerable: true, get() { effects++; return hashes; } });
    assert.throws(() => capability.verifyPathNormalChildABIBuildBinding(active));
    assert.throws(() => capability.verifyPathNormalChildABIBuildBinding({ reference, sourceHashes:
        new Proxy(hashes, { ownKeys() { effects++; return []; } }) }));
    assert.equal(effects, 0);
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation);
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship:
        api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile: await phaseFixture() }) });
    require('../../../src/next/provenance/pathSemanticReference').sealPathQualificationReference({ candidate });
    const fs = require('node:fs'), read = fs.readFileSync;
    let capture, reads = 0;
    for (const [before, after] of [
        ["phase: { enumerable: true, value: 'proof' },", "phase: { enumerable: true, value: 'proof' }, forged: { enumerable: true, value: () => 0 },"],
        ['Object.defineProperty(operands, operand.role,', 'Object.defineProperty(operands, operand.foreign,'],
        ['Object.create(control.handle, { select:', 'Object.create(control.foreign, { select:'],
        ['const view = Object.freeze({ length:', 'const view = Object.freeze({ foreign:']
    ]) {
        fs.readFileSync = function(file, ...args) {
            const value = read.call(this, file, ...args);
            if (typeof file !== 'string' || !file.replaceAll('\\', '/').endsWith('/src/next/provenance/executionHostChild.cjs')) return value;
            const changed = value.toString().replace(before, after);
            assert.notEqual(changed, value.toString());
            return typeof value === 'string' ? changed : Buffer.from(changed);
        };
        try { assert.throws(() => capability.capturePathNormalChildABIReference({ normalReference })); }
        finally { fs.readFileSync = read; }
    }
    fs.readFileSync = function(file, ...args) {
        const value = read.call(this, file, ...args);
        if (typeof file !== 'string' || !file.replaceAll('\\', '/').endsWith('/src/next/provenance/executionHostChild.cjs')) return value;
        const changed = value.toString().replace('node: { enumerable: true, value: alias => access.handle(alias) }',
            'node: { enumerable: true, value: alias => access.handle("claim/context") }');
        assert.notEqual(changed, value.toString()); reads++;
        return typeof value === 'string' ? changed : Buffer.from(changed);
    };
    try { capture = compiler.capturePathQualificationCompiler(); } finally { fs.readFileSync = read; }
    assert.ok(reads > 0);
    let failure;
    try { compiler.compilePathQualificationProgramCandidate({ capture, candidate, expectation }); }
    catch (error) { failure = error; }
    assert.match(failure?.message ?? '', /child_BUILD_source_binding/);
    const retained = compiler.readPathQualificationCompilerEvidence(failure);
    assert.equal(retained.capability_conformance_failed, true);
    assert.equal(retained.stage, 'before_first_normal_compile');
    assert.equal(retained.handle_attempts, 0); assert.equal(retained.semantic_mutation_credit, 0);
    assert.throws(() => compiler.compilePathQualificationProgramCandidate({ capture, candidate, expectation }), /poisoned/);
});

test('N02G:PATH-V3-030 single-site whole C M S references bind authored package bytes before captured compilation', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const { sealPathQualificationReference } = require('../../../src/next/provenance/pathSemanticReference');
    const { capturePathQualificationCompiler, compilePathQualificationCandidate } = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    // A same-nominal material anchor not consumed by a selection. Test target,
    // not a production exemption: the implementation has no target-ID cases.
    const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
        && row.target.predicate_id === 'link_2_refund_sign');
    assert.ok(rowIndex >= 0);
    const siteIndex = preparation.rows[rowIndex].sites.findIndex(site => site.authored_site.site_path[1] === 0);
    const domain = preparation.rows[rowIndex].sites[siteIndex].domain;
    const locatorIndex = domain.locators.findIndex(locator => locator.node !== domain.original.node
        && JSON.stringify(locator.segments) === JSON.stringify(domain.original.segments));
    assert.ok(locatorIndex >= 0);
    const candidate = api.materializePathQualificationLocator({ preparation, rowIndex, siteIndex, locatorIndex });
    const reference = api.preparePathCandidateWholeIRReference({ candidate });
    assert.equal(reference.sealed_before_captured_compile, true);
    assert.deepEqual(reference.worlds.map(world => world.variant), ['C', 'M', 'S']);
    assert.deepEqual(reference.worlds[0].authority_refs, candidate.baseline_package);
    assert.deepEqual(reference.worlds[1].authority_refs, candidate.candidate_package);
    assert.equal(reference.worlds[0].ir_sha256, reference.worlds[2].ir_sha256);
    assert.notEqual(reference.worlds[0].ir_sha256, reference.worlds[1].ir_sha256);
    assert.equal(api.verifyPathCandidateWholeIRReference({ reference, variant: 'C', ir: input.ir }).whole_ir_conformance, true);
    assert.throws(() => api.verifyPathCandidateWholeIRReference({ reference, variant: 'M', ir: input.ir }));
    sealPathQualificationReference({ candidate });
    const result = compilePathQualificationCandidate({ capture: capturePathQualificationCompiler(), candidate });
    assert.equal(result.whole_ir_reference, reference);
    assert.equal(result.worlds[1].admitted, true);
    for (const world of result.worlds.filter(world => world.admitted)) {
        assert.equal(world.whole_ir_conformance, true);
        assert.equal(world.ir_sha256, reference.worlds.find(row => row.variant === world.variant).ir_sha256);
    }
    assert.equal(result.qualified, false); assert.equal(result.semantic_mutation_credit, 0);
});

test('N02G:PATH-V3-031 whole C M S seals reject cached baseline active transports clones and compiler metadata corruption', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const rowIndex = preparation.rows.findIndex(row => row.sites.some(site => site.domain?.locators.length));
    const siteIndex = preparation.rows[rowIndex].sites.findIndex(site => site.domain?.locators.length);
    const candidate = api.materializePathQualificationLocator({ preparation, rowIndex, siteIndex, locatorIndex: 0 });
    const reference = api.preparePathCandidateWholeIRReference({ candidate });
    assert.throws(() => api.preparePathCandidateWholeIRReference({ candidate: structuredClone(candidate) }));
    assert.throws(() => api.preparePathCandidateWholeIRReference({ candidate, expected: input.ir }));
    assert.throws(() => api.verifyPathCandidateWholeIRReference({ reference: structuredClone(reference), variant: 'C', ir: input.ir }));
    assert.throws(() => api.verifyPathCandidateWholeIRReference({ reference, variant: { toString() { throw new Error('coercion'); } }, ir: input.ir }));
    let effects = 0;
    const active = { reference, variant: 'C' };
    Object.defineProperty(active, 'ir', { enumerable: true, get() { effects++; return input.ir; } });
    assert.throws(() => api.verifyPathCandidateWholeIRReference(active));
    assert.throws(() => api.verifyPathCandidateWholeIRReference({ reference, variant: 'C', ir: new Proxy(input.ir, { ownKeys() { effects++; return []; } }) }));
    assert.equal(effects, 0);
    const fs = require('node:fs'), read = fs.readFileSync;
    const { capturePathQualificationCompiler, compilePathQualificationCandidate, readPathQualificationCompilerEvidence } = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    let capture, reads = 0;
    fs.readFileSync = function(file, ...args) {
        const value = read.call(this, file, ...args);
        if (typeof file !== 'string' || !file.replaceAll('\\', '/').endsWith('/src/next/provenance/validationTcbEntry.js')) return value;
        const source = typeof value === 'string' ? value : value.toString('utf8');
        const changed = source.replace('compileAuthoringIR: receipt => compileAuthoringIR(receipt, validators)',
            "compileAuthoringIR: receipt => { const ir = JSON.parse(JSON.stringify(compileAuthoringIR(receipt, validators))); ir.graphs[0].claim.metric += '_corrupt'; return ir; }");
        assert.notEqual(changed, source); reads++;
        return typeof value === 'string' ? changed : Buffer.from(changed);
    };
    try { capture = capturePathQualificationCompiler(); } finally { fs.readFileSync = read; }
    assert.ok(reads > 0);
    require('../../../src/next/provenance/pathSemanticReference').sealPathQualificationReference({ candidate });
    let failure;
    try { compilePathQualificationCandidate({ capture, candidate }); } catch (error) { failure = error; }
    assert.ok(failure);
    const retained = readPathQualificationCompilerEvidence(failure);
    assert.equal(retained.conformance_failed, true);
    assert.equal(retained.variant, 'C');
    assert.equal(retained.contradiction.graph_index, 0);
    assert.notEqual(retained.contradiction.expected_sha256, retained.contradiction.observed_sha256);
    assert.ok(JSON.parse(retained.contradiction.observed_canonical_json).claim.metric.endsWith('_corrupt'));
    assert.equal(retained.handle_attempts, 0);
    assert.equal(retained.qualified, false);
    assert.throws(() => compilePathQualificationCandidate({ capture, candidate }));
});

function selectionControlPlans() {
    return selectionControlPromise ||= (async () => {
    const { preparePathQualificationInventory, preparePathSelectionAdmissionControls } = require('../../../src/next/provenance/pathQualificationV3');
    const preparation = preparePathQualificationInventory(await fixture());
    const plans = [];
    for (let rowIndex = 0; rowIndex < preparation.rows.length; rowIndex++) {
        const plan = preparePathSelectionAdmissionControls({ preparation, rowIndex });
        if (plan.controls.length) plans.push(plan);
    }
        return { preparation, plans };
    })();
}

test('N02G:PATH-V3-028 whole authoring IR is sealed from authored documents including topology roles trace and state requirements', async () => {
    const { preparePathQualificationInventory, preparePathWholeIRReference, verifyPathWholeIRReference,
        readPathWholeIRReference } = require('../../../src/next/provenance/pathQualificationV3');
    const input = await fixture(), preparation = preparePathQualificationInventory(input);
    const reference = preparePathWholeIRReference({ preparation });
    const checked = verifyPathWholeIRReference({ reference, ir: input.ir });
    assert.equal(checked.whole_ir_conformance, true);
    assert.equal(checked.graphs, input.ir.order.length);
    assert.equal(checked.qualified, false); assert.equal(checked.semantic_mutation_credit, 0);
    assert.equal(reference.source_basis, 'authored_documents_shared_declared_nominal_types_not_observed_IR');
    assert.deepEqual(readPathWholeIRReference({ reference }), input.ir);
    assert.equal(reference.independent_compiler, false);
    assert.equal(preparation.whole_ir_conformance.whole_ir_conformance, true);
});

test('N02G:PATH-V3-029 whole IR rejects every graph metadata class order forged flags and active transports before mutant preparation', async () => {
    const { preparePathQualificationInventory, preparePathWholeIRReference, verifyPathWholeIRReference,
        readPathWholeIRReference } = require('../../../src/next/provenance/pathQualificationV3');
    const input = await fixture(), preparation = preparePathQualificationInventory(input);
    const reference = preparePathWholeIRReference({ preparation });
    const candidate = graph => ({ ...input.ir, graphs: [graph, ...input.ir.graphs.slice(1)] });
    const first = input.ir.graphs[0];
    for (const key of Object.keys(first)) {
        const graph = structuredClone(first); delete graph[key];
        assert.throws(() => verifyPathWholeIRReference({ reference, ir: candidate(graph) }));
    }
    for (let index = 0; index < input.ir.graphs.length; index++) {
        const graphs = [...input.ir.graphs], graph = structuredClone(graphs[index]);
        graph.claim.evidence_state = graph.claim.evidence_state === 'confirmed' ? 'projected' : 'confirmed';
        graphs[index] = graph;
        assert.throws(() => verifyPathWholeIRReference({ reference, ir: { ...input.ir, graphs } }));
    }
    for (const mutate of [x => x.order.reverse(), x => x.graphs.reverse(), x => x.graphs.pop(),
        x => x.graphs[1] = structuredClone(x.graphs[0]), x => x.executable = true,
        x => x.authority_refs[0].sha256 = 'sha256:' + '0'.repeat(64)]) {
        const ir = structuredClone(input.ir); mutate(ir);
        assert.throws(() => verifyPathWholeIRReference({ reference, ir }));
    }
    const corrupted = structuredClone(input.ir); corrupted.graphs[0].claim.metric += '_changed';
    assert.throws(() => preparePathQualificationInventory({ packageReceipt: input.packageReceipt, ir: corrupted }));
    assert.throws(() => preparePathWholeIRReference({ preparation: structuredClone(preparation) }));
    assert.throws(() => verifyPathWholeIRReference({ reference: structuredClone(reference), ir: input.ir }));
    assert.throws(() => readPathWholeIRReference({ reference: structuredClone(reference) }));
    assert.throws(() => preparePathWholeIRReference({ preparation, expected: input.ir }));
    let effects = 0;
    const active = { reference };
    Object.defineProperty(active, 'ir', { enumerable: true, get() { effects++; return input.ir; } });
    assert.throws(() => verifyPathWholeIRReference(active));
    const nested = candidate(structuredClone(first));
    Object.defineProperty(nested.graphs[0].claim, 'metric', { enumerable: true, get() { effects++; return first.claim.metric; } });
    assert.throws(() => verifyPathWholeIRReference({ reference, ir: nested }));
    assert.throws(() => verifyPathWholeIRReference({ reference, ir: new Proxy(input.ir, { ownKeys() { effects++; return []; } }) }));
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-026 whole normal phase program seals authored role associations and reviewed mode before lowering all baseline graphs', async () => {
    const { preparePathQualificationInventory, preparePathPhaseAuthorship } = require('../../../src/next/provenance/pathQualificationV3');
    const { sealPathPhaseProgramExpectation, verifyPathPhaseProgram } = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const { compileSnapshotAccess } = require('../../../src/next/provenance/graphCompiler');
    const { buildAdmittedSchemaValidators } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const { buildPhaseProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const { admitPhaseCompositionProfile, PROFILE_PATH } = require('../../../src/next/provenance/phaseCompositionProfile');
    const input = await fixture(), preparation = preparePathQualificationInventory(input);
    const registry = admittedDocuments(input.packageReceipt).find(row => row.value?.registry_id === 'metric_evaluator_registry').value;
    const phaseProfile = admitPhaseCompositionProfile({ source: require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../../..', PROFILE_PATH), 'utf8'), registry });
    const expectations = input.ir.order.map(fact => ({ fact, expectation: sealPathPhaseProgramExpectation({
        authorship: preparePathPhaseAuthorship({ preparation, factKey: fact, phaseProfile }) }) }));
    const access = compileSnapshotAccess(input.packageReceipt, buildAdmittedSchemaValidators(input.packageReceipt).validators);
    const modes = new Set(); let guarded = 0;
    for (const { fact, expectation } of expectations) {
        modes.add(expectation.derivation_mode);
        const actual = buildPhaseProofProgram({ derivation: access.projectDerivationProgram({ fact_key: fact }, phaseProfile).input,
            proof: access.projectProofProgram({ fact_key: fact }).input }, phaseProfile);
        const checked = verifyPathPhaseProgram({ expectation, candidate: actual });
        assert.equal(checked.whole_phase_program_conformance, true);
        assert.equal(checked.derivation_conformance, true);
        assert.equal(checked.whole_proof_program_conformance, true);
        assert.equal(checked.helper_closure_complete, true);
        assert.equal(checked.qualified, false); assert.equal(checked.semantic_mutation_credit, 0);
        assert.equal(checked.handles_opened, 0); assert.equal(checked.fact_key, fact);
        if (expectation.derivation_mode === 'formula_only') assert.equal(actual.derivationPredicateCount, 0);
        else guarded += Number(actual.derivationPredicateCount > 0);
    }
    assert.deepEqual([...modes].sort(), ['formula_only', 'formula_plus_selection_guards']);
    assert.ok(guarded > 0); assert.equal(expectations.length, input.ir.order.length);
});

test('N02G:PATH-V3-027 phase conformance rejects phase bypass guards profile manifest source table and active caller authority', async () => {
    const { preparePathQualificationInventory, preparePathPhaseAuthorship } = require('../../../src/next/provenance/pathQualificationV3');
    const { sealPathPhaseProgramExpectation, verifyPathPhaseProgram, readPathPhaseProgramReference } = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const { compileSnapshotAccess } = require('../../../src/next/provenance/graphCompiler');
    const { buildAdmittedSchemaValidators } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const { buildPhaseProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const { admitPhaseCompositionProfile, PROFILE_PATH } = require('../../../src/next/provenance/phaseCompositionProfile');
    const input = await fixture(), preparation = preparePathQualificationInventory(input);
    const registry = admittedDocuments(input.packageReceipt).find(row => row.value?.registry_id === 'metric_evaluator_registry').value;
    const phaseProfile = admitPhaseCompositionProfile({ source: require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../../..', PROFILE_PATH), 'utf8'), registry });
    const authorships = input.ir.order.map(fact => preparePathPhaseAuthorship({ preparation, factKey: fact, phaseProfile }));
    const authorship = authorships.find(row => row.derivation_predicate_ids.length);
    assert.ok(authorship);
    const expectation = sealPathPhaseProgramExpectation({ authorship });
    const access = compileSnapshotAccess(input.packageReceipt, buildAdmittedSchemaValidators(input.packageReceipt).validators);
    const actual = buildPhaseProofProgram({ derivation: access.projectDerivationProgram({ fact_key: authorship.fact_key }, phaseProfile).input,
        proof: access.projectProofProgram({ fact_key: authorship.fact_key }).input }, phaseProfile);
    assert.equal(verifyPathPhaseProgram({ expectation, candidate: actual }).whole_phase_program_conformance, true);
    const reference = readPathPhaseProgramReference({ expectation });
    assert.equal(reference.source, actual.source); assert.equal(reference.manifest, actual.manifest);
    assert.throws(() => readPathPhaseProgramReference({ expectation: structuredClone(expectation) }));
    assert.throws(() => readPathPhaseProgramReference({ expectation, source: actual.source }));
    const hash = source => 'sha256:' + require('node:crypto').createHash('sha256').update(source).digest('hex');
    for (const alter of [s => s.replace('operands.phase==="derivation"', 'false'),
        s => s.replace('derivation_guard_', 'wrong_guard_'), s => s.replace('proof_program_phase', 'wrong_phase'),
        s => s.replace('.get("period"),false)', '.get("period"),true)'),
        s => s.replace('let all = true;', 'let all = false;')]) {
        const changed = structuredClone(actual); changed.source = alter(changed.source);
        assert.notEqual(changed.source, actual.source);
        const manifest = JSON.parse(changed.manifest); manifest.files[0].sha256 = hash(changed.source);
        changed.manifest = require('../../../src/next/kernel/canonicalValue').canonicalValue(manifest);
        changed.artifact_root = hash(changed.manifest);
        assert.throws(() => verifyPathPhaseProgram({ expectation, candidate: changed }));
    }
    for (const mutate of [x => x.sourceHashes.pop(), x => x.sourceHashes.reverse(),
        x => x.sourceHashes[0].sha256 = 'sha256:' + '0'.repeat(64),
        x => x.profileInput.registry_sha256 = 'sha256:' + '0'.repeat(64),
        x => x.profileInput.source += '\n', x => x.assertionSites.pop(),
        x => x.derivationPredicateCount = 0, x => x.negative_witness_only = true,
        x => x.manifest += '\n']) {
        const changed = structuredClone(actual); mutate(changed);
        assert.throws(() => verifyPathPhaseProgram({ expectation, candidate: changed }));
    }
    assert.throws(() => preparePathPhaseAuthorship({ preparation, factKey: authorship.fact_key, phaseProfile: structuredClone(phaseProfile) }));
    assert.throws(() => preparePathPhaseAuthorship({ preparation, factKey: authorship.fact_key, phaseProfile, ir: input.ir }));
    assert.throws(() => sealPathPhaseProgramExpectation({ authorship: structuredClone(authorship) }));
    assert.throws(() => verifyPathPhaseProgram({ expectation: structuredClone(expectation), candidate: actual }));
    let effects = 0;
    const active = { expectation };
    Object.defineProperty(active, 'candidate', { enumerable: true, get() { effects++; return actual; } });
    assert.throws(() => verifyPathPhaseProgram(active));
    const nested = structuredClone(actual);
    Object.defineProperty(nested.profileInput, 'source', { enumerable: true, get() { effects++; return actual.profileInput.source; } });
    assert.throws(() => verifyPathPhaseProgram({ expectation, candidate: nested }));
    assert.throws(() => verifyPathPhaseProgram({ expectation, candidate: new Proxy(actual, { ownKeys() { effects++; return []; } }) }));
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-024 proof program expectations precede normal lowering and cover the whole authored baseline without caller IR', async () => {
    const { preparePathQualificationInventory, preparePathProofAuthorship } = require('../../../src/next/provenance/pathQualificationV3');
    const { sealPathProofProgramExpectation, verifyPathProofProgram } = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const { compileSnapshotAccess } = require('../../../src/next/provenance/graphCompiler');
    const { buildAdmittedSchemaValidators } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const { buildScalarProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const input = await fixture(), preparation = preparePathQualificationInventory(input);
    const expectations = input.ir.order.map(fact => ({ fact,
        expectation: sealPathProofProgramExpectation({ authorship: preparePathProofAuthorship({ preparation, factKey: fact }) }) }));
    const access = compileSnapshotAccess(input.packageReceipt, buildAdmittedSchemaValidators(input.packageReceipt).validators);
    for (const { fact, expectation } of expectations) {
        const actual = buildScalarProofProgram(access.projectProofProgram({ fact_key: fact }).input);
        const checked = verifyPathProofProgram({ expectation, source: actual.source });
        assert.equal(checked.whole_proof_program_conformance, true);
        assert.equal(checked.helper_closure_complete, true);
        assert.equal(checked.derivation_conformance, false);
        assert.equal(checked.qualified, false);
        assert.equal(checked.semantic_mutation_credit, 0);
        assert.equal(checked.handles_opened, 0);
        assert.equal(checked.fact_key, fact);
    }
    assert.equal(expectations.length, input.ir.order.length);
});

test('N02G:PATH-V3-025 program conformance refuses changed paths selection returns helper bytes caller expectations and active boundaries', async () => {
    const { preparePathQualificationInventory, preparePathProofAuthorship } = require('../../../src/next/provenance/pathQualificationV3');
    const { sealPathProofProgramExpectation, verifyPathProofProgram } = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const { compileSnapshotAccess } = require('../../../src/next/provenance/graphCompiler');
    const { buildAdmittedSchemaValidators } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const { buildScalarProofProgram, buildScalarAssertionFaultProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const input = await fixture(), preparation = preparePathQualificationInventory(input);
    const authorship = preparePathProofAuthorship({ preparation, factKey: input.ir.order[0] });
    const expectation = sealPathProofProgramExpectation({ authorship });
    const access = compileSnapshotAccess(input.packageReceipt, buildAdmittedSchemaValidators(input.packageReceipt).validators);
    const projected = access.projectProofProgram({ fact_key: input.ir.order[0] }).input;
    const source = buildScalarProofProgram(projected).source;
    for (const alter of [s => s.replace('proof_assertion_', 'wrong_assertion_'),
        s => s.replace('.get(', '.has('), s => s.replace('return !all;', 'return all;'),
        s => s.replace('const rootOperands=operands;', 'const rootOperands=null;'),
        s => s.replace('const cache = new Map();', 'const cache = new Map();throw new Error("extra");')]) {
        const changed = alter(source); assert.notEqual(changed, source);
        assert.throws(() => verifyPathProofProgram({ expectation, source: changed }));
    }
    const eq = projected.predicates.find(predicate => predicate.operator.id === 'eq');
    assert.ok(eq);
    assert.throws(() => verifyPathProofProgram({ expectation, source: buildScalarAssertionFaultProgram(projected, eq.id).source }));
    assert.throws(() => sealPathProofProgramExpectation({ authorship: structuredClone(authorship) }));
    assert.throws(() => preparePathProofAuthorship({ preparation, factKey: input.ir.order[0], input: projected }));
    assert.throws(() => verifyPathProofProgram({ expectation: structuredClone(expectation), source }));
    assert.throws(() => verifyPathProofProgram({ expectation, source, expectedHash: expectation.expected_source_sha256 }));
    let effects = 0;
    const active = { expectation };
    Object.defineProperty(active, 'source', { enumerable: true, get() { effects++; return source; } });
    assert.throws(() => verifyPathProofProgram(active));
    assert.throws(() => verifyPathProofProgram(new Proxy({ expectation, source }, { ownKeys() { effects++; return []; } })));
    assert.throws(() => verifyPathProofProgram({ expectation, source: { toString() { effects++; return source; } } }));
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-021 every selection exclusion precommits its native instance and remains unqualified after a captured barrier', async () => {
    const { materializePathSelectionAdmissionControl } = require('../../../src/next/provenance/pathQualificationV3');
    const { capturePathQualificationCompiler, compilePathQualificationCandidate } = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const { preparation, plans } = await selectionControlPlans();
    assert.ok(plans.length > 0);
    const modes = new Set();
    for (const plan of plans) {
        assert.equal(plan.qualified, false);
        assert.equal(plan.semantic_mutation_credit, 0);
        const keys = new Set();
        for (const control of plan.controls) {
            keys.add(JSON.stringify([control.site_index, control.locator_index]));
            assert.deepEqual(control.authored_site, preparation.rows[plan.row_index].sites[control.site_index].authored_site);
            assert.equal(control.expected_diagnostic.checker, 'selection_bindings');
            assert.equal(control.expected_diagnostic.fact_key, preparation.rows[plan.row_index].target.fact_key);
            assert.equal(control.expected_diagnostic.predicate_id,
                control.expected_diagnostic.mode === 'selected_member_retains_authored_reason' ? null
                    : preparation.rows[plan.row_index].target.predicate_id);
            assert.equal(control.coordinate_scope, 'native_selection_instance_single_authored_patch_not_operand_reader');
            assert.equal(control.compiler_barrier_verified, false);
            modes.add(control.expected_diagnostic.mode);
        }
        assert.equal(keys.size, plan.controls.length);
    }
    assert.ok(modes.has('excluded_reason_concerns_own_candidate'));
    const plan = plans[0], candidate = materializePathSelectionAdmissionControl({ plan, controlIndex: 0 });
    const capture = capturePathQualificationCompiler();
    const result = compilePathQualificationCandidate({ capture, candidate });
    assert.deepEqual(result.worlds.map(world => world.admitted), [true, false, true]);
    assert.equal(result.native_control_matched, true);
    assert.deepEqual(result.worlds[1].diagnostic.native_coordinate, candidate.expected_diagnostic);
    assert.equal(result.worlds[1].diagnostic.forged_same_text_has_authority, false);
    assert.equal(result.handle_attempts, 0);
    assert.equal(result.qualified, false);
    assert.equal(result.semantic_mutation_credit, 0);
    assert.equal(result.dp_execution, false);
    assert.equal(result.normal_compiler_source_bindings_sha256, capture.normal_compiler_source_bindings_sha256);
    assert.equal(result.selection_binding_source_sha256, 'sha256:' + require('node:crypto').createHash('sha256')
        .update(require('node:fs').readFileSync(require('node:path').resolve(__dirname,
            '../../../src/next/provenance/selectionBindings.js'))).digest('hex'));
    assert.match(result.selection_binding_source_sha256, /^sha256:[0-9a-f]{64}$/);
});

test('N02G:PATH-V3-022 selection controls reject caller coordinates source authority clones replay getters and proxies', async () => {
    const { preparePathSelectionAdmissionControls, materializePathSelectionAdmissionControl,
        takePathQualificationCandidatePackage } = require('../../../src/next/provenance/pathQualificationV3');
    const { readSelectionBindingDiagnostic } = require('../../../src/next/provenance/selectionBindings');
    const { preparation, plans } = await selectionControlPlans(), plan = plans[0];
    assert.throws(() => preparePathSelectionAdmissionControls({ preparation, rowIndex: plan.row_index, expected: {} }));
    assert.throws(() => materializePathSelectionAdmissionControl({ plan: structuredClone(plan), controlIndex: 0 }));
    assert.throws(() => materializePathSelectionAdmissionControl({ plan, controlIndex: 0, coordinate: {} }));
    let effects = 0;
    const active = { plan };
    Object.defineProperty(active, 'controlIndex', { enumerable: true, get() { effects++; return 0; } });
    assert.throws(() => materializePathSelectionAdmissionControl(active));
    assert.throws(() => materializePathSelectionAdmissionControl(new Proxy({ plan, controlIndex: 0 }, { ownKeys() { effects++; return []; } })));
    assert.throws(() => materializePathSelectionAdmissionControl({ plan, controlIndex: { valueOf() { effects++; return 0; } } }));
    const candidate = materializePathSelectionAdmissionControl({ plan, controlIndex: 0 });
    assert.throws(() => takePathQualificationCandidatePackage({ candidate: structuredClone(candidate) }));
    assert.equal(takePathQualificationCandidatePackage({ candidate }).reference.qualified, false);
    assert.throws(() => takePathQualificationCandidatePackage({ candidate }));
    assert.equal(readSelectionBindingDiagnostic(new Error('selection_binding_selected')), null);
    assert.equal(readSelectionBindingDiagnostic(new Proxy({}, { get() { effects++; return true; } })), null);
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-023 selection barrier controls detect removed inverted redirected guards and cached positive admission', async () => {
    const fs = require('node:fs');
    const { materializePathSelectionAdmissionControl } = require('../../../src/next/provenance/pathQualificationV3');
    const { capturePathQualificationCompiler, compilePathQualificationCandidate } = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const { plans } = await selectionControlPlans();
    const plan = plans.find(plan => plan.controls.some(control => control.expected_diagnostic.mode === 'excluded_reason_concerns_own_candidate'));
    const controlIndex = plan.controls.findIndex(control => control.expected_diagnostic.mode === 'excluded_reason_concerns_own_candidate');
    const positiveRoot = capturePathQualificationCompiler().artifact_root;
    const guard = 'if (!concerns(predicate, excluded.node)) {';
    const changes = [
        { file: 'selectionBindings.js', change: source => source.replace(guard, 'if (false) {'), poisoned: false },
        { file: 'selectionBindings.js', change: source => source.replace(guard, 'if (concerns(predicate, excluded.node)) {'), poisoned: true },
        { file: 'selectionBindings.js', change: source => source.replace(
            "mode: 'excluded_reason_concerns_own_candidate'", "mode: 'redirected_native_selection_instance'"), poisoned: false },
        { file: 'validationTcbEntry.js', change: source => source
            .replace('function capturedValidationTools() {', 'function capturedValidationTools() { let cachedIR, cachedAccess;')
            .replace('compileAuthoringIR: receipt => compileAuthoringIR(receipt, validators)',
                'compileAuthoringIR: receipt => (cachedIR ||= compileAuthoringIR(receipt, validators))')
            .replace('compileSnapshotAccess: receipt => compileSnapshotAccess(receipt, validators)',
                'compileSnapshotAccess: receipt => (cachedAccess ||= compileSnapshotAccess(receipt, validators))'), poisoned: true }
    ];
    for (const item of changes) {
        const read = fs.readFileSync;
        let reads = 0, capture;
        fs.readFileSync = function(file, ...args) {
            const value = read.call(this, file, ...args);
            if (typeof file !== 'string' || !file.replaceAll('\\', '/').endsWith('/src/next/provenance/' + item.file)) return value;
            const source = typeof value === 'string' ? value : value.toString('utf8'), changed = item.change(source);
            assert.notEqual(changed, source); reads++;
            return typeof value === 'string' ? changed : Buffer.from(changed);
        };
        try { capture = capturePathQualificationCompiler(); } finally { fs.readFileSync = read; }
        assert.ok(reads > 0);
        assert.notEqual(capture.artifact_root, positiveRoot);
        const candidate = materializePathSelectionAdmissionControl({ plan, controlIndex });
        if (item.poisoned) {
            assert.throws(() => compilePathQualificationCandidate({ capture, candidate }));
            assert.throws(() => compilePathQualificationCandidate({ capture,
                candidate: materializePathSelectionAdmissionControl({ plan, controlIndex }) }));
        } else {
            const result = compilePathQualificationCandidate({ capture, candidate });
            assert.equal(result.native_control_matched, false);
            assert.equal(result.qualified, false);
            assert.equal(result.semantic_mutation_credit, 0);
            assert.equal(result.handle_attempts, 0);
            assert.throws(() => compilePathQualificationCandidate({ capture,
                candidate: materializePathSelectionAdmissionControl({ plan, controlIndex }) }));
        }
    }
});

test('N02G:PATH-V3-016 historical migration preserves every old target, state and evidence without importing credit', async () => {
    const { preparePathQualificationInventory, preparePathQualificationHistoricalMigration,
        verifyPathQualificationHistoricalMigration } = require('../../../src/next/provenance/pathQualificationV3');
    const preparation = preparePathQualificationInventory(await fixture());
    const source = historicalSource(), old = JSON.parse(source);
    const migration = preparePathQualificationHistoricalMigration({ preparation, historicalSource: source });
    assert.equal(migration.rows.length, preparation.rows.length);
    assert.equal(migration.exact_old_membership, true);
    assert.equal(migration.historical_report_flags.valid, old.valid);
    assert.equal(migration.historical_report_flags.predicate_atom_credit, old.predicate_atom_credit);
    const byId = new Map(old.rows.map(row => [row.mutation_id, row]));
    for (const row of migration.rows) {
        assert.deepEqual(JSON.parse(JSON.stringify(row.historical_record)), byId.get(row.target_id));
        assert.equal(row.new_disposition, 'blocked');
        assert.equal(row.semantic_mutation_credit, 0);
        assert.equal(row.historical_state_changed, false);
        assert.equal(row.evidence_reused_for_v3, false);
        assert.equal(row.method_authority.commit, '72fc5a5b707909687da9b5cec892be2dcc892a62');
    }
    assert.equal(new Set(migration.rows.map(row => row.target_id)).size, migration.rows.length);
    const checked = verifyPathQualificationHistoricalMigration({ migration, candidate: structuredClone(migration) });
    assert.equal(checked.migration_integrity, true);
    assert.equal(checked.qualified, false);
    assert.equal(checked.semantic_mutation_credit, 0);
    assert.equal(checked.activated, false);
});

test('N02G:PATH-V3-017 historical migration refuses changed source, same-count redirection, forged state and active boundaries', async () => {
    const { preparePathQualificationInventory, preparePathQualificationHistoricalMigration,
        verifyPathQualificationHistoricalMigration } = require('../../../src/next/provenance/pathQualificationV3');
    const preparation = preparePathQualificationInventory(await fixture()), source = historicalSource();
    let effects = 0;
    const input = { preparation, historicalSource: source };
    for (const altered of [{ ...input, historicalSource: source + '\n' },
        { ...input, preparation: structuredClone(preparation) },
        { ...input, expectedHash: 'caller authority' },
        { ...input, historicalSource: { toString() { effects++; return source; } } },
        new Proxy(input, { ownKeys() { effects++; return []; } })]) {
        assert.throws(() => preparePathQualificationHistoricalMigration(altered));
    }
    const active = { preparation };
    Object.defineProperty(active, 'historicalSource', { enumerable: true, get() { effects++; return source; } });
    assert.throws(() => preparePathQualificationHistoricalMigration(active));
    const migration = preparePathQualificationHistoricalMigration(input);
    for (const mutate of [x => x.rows.pop(), x => x.rows[1] = structuredClone(x.rows[0]),
        x => x.rows[0].target_id = x.rows[1].target_id,
        x => x.rows[0].historical_record.matched = !x.rows[0].historical_record.matched,
        x => x.rows[0].new_disposition = 'semantic_witness',
        x => x.rows[0].semantic_mutation_credit = 1,
        x => x.historical_report_flags.valid = true,
        x => x.rows[0].evidence_reused_for_v3 = true]) {
        const candidate = structuredClone(migration); mutate(candidate);
        assert.throws(() => verifyPathQualificationHistoricalMigration({ migration, candidate }));
    }
    assert.throws(() => verifyPathQualificationHistoricalMigration({ migration: structuredClone(migration), candidate: migration }));
    const candidate = structuredClone(migration);
    Object.defineProperty(candidate.rows[0], 'historical_record', { enumerable: true, get() { effects++; return {}; } });
    assert.throws(() => verifyPathQualificationHistoricalMigration({ migration, candidate }));
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-007 candidate bytes change exactly one sealed locator and preserve the entire baseline package', async () => {
    const { preparePathQualificationInventory, materializePathQualificationLocator,
        takePathQualificationCandidatePackage } = require('../../../src/next/provenance/pathQualificationV3');
    const { admittedPackageEntries, admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const input = await fixture();
    const preparation = preparePathQualificationInventory(input);
    const rowIndex = preparation.rows.findIndex(row => row.sites.some(site => site.domain?.locators.length));
    const siteIndex = preparation.rows[rowIndex].sites.findIndex(site => site.domain?.locators.length);
    const candidate = materializePathQualificationLocator({ preparation, rowIndex, siteIndex, locatorIndex: 0 });
    const { sealPathQualificationReference } = require('../../../src/next/provenance/pathSemanticReference');
    sealPathQualificationReference({ candidate });
    const packageResult = takePathQualificationCandidatePackage({ candidate });
    assert.equal(candidate.semantic_mutation_credit, 0);
    assert.equal(candidate.qualified, false);
    assert.equal(packageResult.restorationReceipt, input.packageReceipt);
    const path = 'docs/contracts/next/provenance-v2/graphs-v2.json';
    const original = admittedDocuments(input.packageReceipt).find(row => row.path === path).value;
    const mutated = structuredClone(admittedDocuments(packageResult.packageReceipt).find(row => row.path === path).value);
    const graph = mutated.graphs.find(graph => graph.fact_key === candidate.target.fact_key);
    const predicate = graph.predicates.find(predicate => predicate.id === candidate.target.predicate_id);
    let container = predicate;
    for (const token of candidate.patch.location.slice(0, -1)) container = container[token];
    const leaf = candidate.patch.location.at(-1);
    assert.deepEqual(container[leaf], candidate.patch.after);
    container[leaf] = structuredClone(candidate.patch.before);
    assert.deepEqual(mutated, original);
    const baselineEntries = new Map(admittedPackageEntries(input.packageReceipt).map(row => [row.path, row.bytes]));
    for (const entry of admittedPackageEntries(packageResult.packageReceipt)) {
        if (entry.path !== path) assert.ok(entry.bytes.equals(baselineEntries.get(entry.path)));
    }
    assert.throws(() => takePathQualificationCandidatePackage({ candidate }));
    const next = materializePathQualificationLocator({ preparation, rowIndex, siteIndex, locatorIndex: 0 });
    assert.notEqual(next.invocation_id, candidate.invocation_id);
});

test('N02G:PATH-V3-008 candidate construction and consumption reject caller payloads, clones, replay and active indices', async () => {
    const { preparePathQualificationInventory, materializePathQualificationLocator,
        takePathQualificationCandidatePackage } = require('../../../src/next/provenance/pathQualificationV3');
    const preparation = preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.sites.some(site => site.domain?.locators.length));
    const siteIndex = preparation.rows[rowIndex].sites.findIndex(site => site.domain?.locators.length);
    const input = { preparation, rowIndex, siteIndex, locatorIndex: 0 };
    let effects = 0;
    for (const altered of [{ ...input, preparation: structuredClone(preparation) },
        { ...input, rowIndex: -1 }, { ...input, siteIndex: Infinity }, { ...input, locatorIndex: '0' },
        { ...input, locatorIndex: { valueOf() { effects++; return 0; } } },
        { ...input, after: { segments: ['forged'] } },
        new Proxy(input, { ownKeys() { effects++; return []; } })]) {
        assert.throws(() => materializePathQualificationLocator(altered));
    }
    const active = { ...input };
    Object.defineProperty(active, 'locatorIndex', { enumerable: true, get() { effects++; return 0; } });
    assert.throws(() => materializePathQualificationLocator(active));
    const candidate = materializePathQualificationLocator(input);
    assert.throws(() => takePathQualificationCandidatePackage({ candidate: structuredClone(candidate) }));
    const baselineReceipt = (await fixture()).packageReceipt;
    assert.throws(() => takePathQualificationCandidatePackage({ candidate,
        packageReceipt: baselineReceipt }));
    const copied = { ...candidate };
    Object.defineProperty(copied, 'invocation_id', { enumerable: true, get() { effects++; return candidate.invocation_id; } });
    assert.throws(() => takePathQualificationCandidatePackage({ candidate: copied }));
    const { sealPathQualificationReference } = require('../../../src/next/provenance/pathSemanticReference');
    sealPathQualificationReference({ candidate });
    assert.equal(takePathQualificationCandidatePackage({ candidate }).qualified, false);
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-009 independent reference is sealed before M bytes are released and unavailable is never a witness', async () => {
    const { preparePathQualificationInventory, materializePathQualificationLocator,
        takePathQualificationCandidatePackage } = require('../../../src/next/provenance/pathQualificationV3');
    const { sealPathQualificationReference, readPathSemanticReference } = require('../../../src/next/provenance/pathSemanticReference');
    const preparation = preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.sites.some(site => site.domain?.locators.length));
    const siteIndex = preparation.rows[rowIndex].sites.findIndex(site => site.domain?.locators.length);
    const candidate = materializePathQualificationLocator({ preparation, rowIndex, siteIndex, locatorIndex: 0 });
    assert.throws(() => takePathQualificationCandidatePackage({ candidate }));
    assert.throws(() => sealPathQualificationReference({ candidate: structuredClone(candidate) }));
    const sealed = sealPathQualificationReference({ candidate });
    assert.equal(readPathSemanticReference(sealed), sealed);
    assert.equal(sealed.method_version, 3);
    assert.equal(sealed.mutation_id, candidate.target_id);
    assert.equal(sealed.candidate_id, candidate.candidate_id);
    assert.equal(sealed.semantic_mutation_credit, 0);
    assert.equal(sealed.discriminating, sealed.available && sealed.baseline_satisfied === true && sealed.mutant_satisfied === false);
    assert.throws(() => sealPathQualificationReference({ candidate }));
    assert.equal(takePathQualificationCandidatePackage({ candidate }).reference, sealed);
    assert.throws(() => sealPathQualificationReference({ candidate }));
});

test('N02G:PATH-V3-010 captured normal compiler controls whole C/M/S without caller validators or operational credit', async () => {
    const { preparePathQualificationInventory, materializePathQualificationLocator } = require('../../../src/next/provenance/pathQualificationV3');
    const { sealPathQualificationReference } = require('../../../src/next/provenance/pathSemanticReference');
    const { capturePathQualificationCompiler, compilePathQualificationCandidate,
        readPathQualificationCompilerEvidence } = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const preparation = preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.sites.some(site => site.domain?.locators.length));
    const siteIndex = preparation.rows[rowIndex].sites.findIndex(site => site.domain?.locators.length);
    const candidate = materializePathQualificationLocator({ preparation, rowIndex, siteIndex, locatorIndex: 0 });
    sealPathQualificationReference({ candidate });
    const capture = capturePathQualificationCompiler();
    const result = compilePathQualificationCandidate({ capture, candidate });
    assert.equal(readPathQualificationCompilerEvidence(result), result);
    assert.deepEqual(result.worlds.map(world => world.variant), ['C', 'M', 'S']);
    assert.equal(result.worlds[0].admitted, true);
    assert.equal(result.worlds[2].admitted, true);
    assert.equal(result.worlds[0].ir_sha256, result.worlds[2].ir_sha256);
    assert.equal(result.worlds[0].access_descriptor_sha256, result.worlds[2].access_descriptor_sha256);
    assert.equal(result.worlds[0].graph_count, preparation.authority_refs.length > 0 ? (await fixture()).ir.graphs.length : -1);
    assert.equal(result.semantic_mutation_credit, 0);
    assert.equal(result.qualified, false);
    assert.equal(result.dp_execution, false);
    assert.equal(result.handle_attempts, 0);
    assert.equal(result.validation_tcb_complete, false);
    assert.throws(() => compilePathQualificationCandidate({ capture, candidate }));
});

test('N02G:PATH-V3-011 captured compiler ignores ambient replacement and refuses forged capabilities or extra APIs', async () => {
    const { preparePathQualificationInventory, materializePathQualificationLocator } = require('../../../src/next/provenance/pathQualificationV3');
    const { sealPathQualificationReference } = require('../../../src/next/provenance/pathSemanticReference');
    const { capturePathQualificationCompiler, compilePathQualificationCandidate } = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const preparation = preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.sites.some(site => site.domain?.locators.length));
    const siteIndex = preparation.rows[rowIndex].sites.findIndex(site => site.domain?.locators.length);
    const candidate = materializePathQualificationLocator({ preparation, rowIndex, siteIndex, locatorIndex: 0 });
    sealPathQualificationReference({ candidate });
    const capture = capturePathQualificationCompiler();
    assert.throws(() => compilePathQualificationCandidate({ capture: structuredClone(capture), candidate }));
    assert.throws(() => compilePathQualificationCandidate({ capture, candidate: structuredClone(candidate) }));
    let effects = 0;
    const active = { capture };
    Object.defineProperty(active, 'candidate', { enumerable: true, get() { effects++; return candidate; } });
    assert.throws(() => compilePathQualificationCandidate(active));
    assert.throws(() => compilePathQualificationCandidate(new Proxy({ capture, candidate }, { ownKeys() { effects++; return []; } })));
    assert.throws(() => compilePathQualificationCandidate({ capture, candidate, validators: {} }));
    const compiler = require('../../../src/next/provenance/graphCompiler');
    const previous = compiler.compileAuthoringIR;
    compiler.compileAuthoringIR = () => { effects++; throw new Error('ambient compiler must not run'); };
    try {
        const result = compilePathQualificationCandidate({ capture, candidate });
        assert.equal(result.worlds[0].admitted, true);
        assert.equal(result.worlds[2].admitted, true);
        assert.equal(result.handle_attempts, 0);
    } finally { compiler.compileAuthoringIR = previous; }
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-012 a disjoint declared reference nominal cannot make a scalar locator domain incomplete', async () => {
    const { preparePathQualificationInventory } = require('../../../src/next/provenance/pathQualificationV3');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const input = await fixture();
    const docs = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = docs.get('docs/contracts/next/provenance-v2/graphs-v2.json');
    const registry = docs.get(corpus.material_registry.path);
    const prepared = preparePathQualificationInventory(input);
    let checked = 0;
    for (const row of prepared.rows) for (const site of row.sites) {
        if (site.authored_site.definition !== 'fieldPath') continue;
        const graph = corpus.graphs.find(graph => graph.fact_key === row.target.fact_key);
        let original = graph.predicates.find(predicate => predicate.id === row.target.predicate_id);
        for (const token of site.authored_site.site_path.slice(0, -1)) original = original[token];
        const fields = registry.kinds[graph.nodes[original.node].kind].fields;
        const descriptor = fields[original.segments[0]];
        if (!['month', 'enum'].includes(descriptor.type)
            || !Object.values(fields).some(field => field.type === 'ref' && field.targets.length > 1)) continue;
        assert.equal(site.domain_complete, true);
        assert.equal(site.domain_reason, null);
        assert.equal(site.admitted_domain_complete, false);
        checked++;
    }
    assert.ok(checked > 0);
});

test('N02G:PATH-V3-013 empty L uses a genuine v2 unknown-path control and full native rejection without static credit', async () => {
    const { preparePathQualificationInventory, preparePathStaticDomainControls,
        materializePathStaticDomainControl } = require('../../../src/next/provenance/pathQualificationV3');
    const { capturePathQualificationCompiler, compilePathQualificationCandidate } = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const preparation = preparePathQualificationInventory(await fixture());
    const samples = new Map();
    preparation.rows.forEach((row, rowIndex) => {
        if (!row.sites.every(site => site.domain_complete && site.domain.locators.length === 0)) return;
        row.sites.forEach((site, siteIndex) => {
            if (!samples.has(site.domain.namespace)) samples.set(site.domain.namespace, { rowIndex, siteIndex });
        });
    });
    const capture = capturePathQualificationCompiler();
    for (const { rowIndex, siteIndex } of samples.values()) {
        const plan = preparePathStaticDomainControls({ preparation, rowIndex });
        const candidate = materializePathStaticDomainControl({ plan, siteIndex });
        assert.equal(candidate.candidate_kind, 'unknown_path_control_for_empty_L');
        assert.equal(candidate.locator_index, null);
        assert.equal(candidate.semantic_mutation_credit, 0);
        const result = compilePathQualificationCandidate({ capture, candidate });
        assert.equal(result.worlds[0].admitted, true);
        assert.equal(result.worlds[1].admitted, false);
        assert.equal(result.worlds[2].admitted, true);
        assert.deepEqual(result.worlds[1].diagnostic.native_coordinate, candidate.expected_diagnostic,
            JSON.stringify(result.worlds[1].diagnostic));
        assert.equal(result.native_control_matched, true);
        assert.equal(result.qualified, false);
        assert.equal(result.dp_execution, false);
        assert.equal(result.semantic_mutation_credit, 0);
        assert.equal(result.handle_attempts, 0);
    }
    assert.ok(samples.size >= 2);
});

test('N02G:PATH-V3-014 empty-domain preparation never absorbs mixed sites or caller claims and rejects cloned controls', async () => {
    const { preparePathQualificationInventory, preparePathStaticDomainControls,
        materializePathStaticDomainControl, takePathQualificationCandidatePackage } = require('../../../src/next/provenance/pathQualificationV3');
    const { sealPathQualificationReference } = require('../../../src/next/provenance/pathSemanticReference');
    const preparation = preparePathQualificationInventory(await fixture());
    const mixed = preparation.rows.findIndex(row => row.sites.some(site => site.domain?.locators.length > 0));
    assert.throws(() => preparePathStaticDomainControls({ preparation, rowIndex: mixed }));
    const rowIndex = preparation.rows.findIndex(row => row.sites.every(site => site.domain_complete && site.domain.locators.length === 0));
    assert.throws(() => preparePathStaticDomainControls({ preparation: structuredClone(preparation), rowIndex }));
    assert.throws(() => preparePathStaticDomainControls({ preparation, rowIndex, disposition: 'static_domain_proof' }));
    const plan = preparePathStaticDomainControls({ preparation, rowIndex });
    assert.equal(plan.qualified, false);
    assert.throws(() => materializePathStaticDomainControl({ plan: structuredClone(plan), siteIndex: 0 }));
    let effects = 0;
    const active = { plan };
    Object.defineProperty(active, 'siteIndex', { enumerable: true, get() { effects++; return 0; } });
    assert.throws(() => materializePathStaticDomainControl(active));
    const candidate = materializePathStaticDomainControl({ plan, siteIndex: 0 });
    assert.throws(() => sealPathQualificationReference({ candidate }));
    assert.throws(() => takePathQualificationCandidatePackage({ candidate: structuredClone(candidate) }));
    assert.equal(takePathQualificationCandidatePackage({ candidate }).reference.qualified, false);
    assert.throws(() => takePathQualificationCandidatePackage({ candidate }));
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-015 structural diagnostics carry the first native authored site and forged same-text errors remain unauthoritative', async () => {
    const { preparePathQualificationInventory, preparePathStaticDomainControls,
        materializePathStaticDomainControl, takePathQualificationCandidatePackage } = require('../../../src/next/provenance/pathQualificationV3');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const { validateGraphStructure, readGraphStructureDiagnostic } = require('../../../src/next/provenance/graphStructure');
    const preparation = preparePathQualificationInventory(await fixture());
    const samples = new Map();
    preparation.rows.forEach((row, rowIndex) => {
        if (!row.sites.every(site => site.domain_complete && site.domain.locators.length === 0)) return;
        row.sites.forEach((site, siteIndex) => {
            const key = site.authored_site.definition + ':' + site.authored_site.site_path.includes('bindings');
            if (!samples.has(key)) samples.set(key, { rowIndex, siteIndex });
        });
    });
    for (const { rowIndex, siteIndex } of samples.values()) {
        const plan = preparePathStaticDomainControls({ preparation, rowIndex });
        const candidate = materializePathStaticDomainControl({ plan, siteIndex });
        const input = takePathQualificationCandidatePackage({ candidate });
        const docs = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
        const corpus = docs.get('docs/contracts/next/provenance-v2/graphs-v2.json');
        let observed;
        try { validateGraphStructure({ graphs: corpus.graphs, claims: docs.get(corpus.claim_contract.path).claims,
            materialRegistry: docs.get(corpus.material_registry.path), operatorRegistry: docs.get(corpus.operator_registry.path) });
        } catch (error) { observed = error; }
        assert.ok(observed);
        assert.deepEqual(readGraphStructureDiagnostic(observed), candidate.expected_diagnostic);
        assert.equal(readGraphStructureDiagnostic(new Error(observed.message)), null);
        assert.equal(readGraphStructureDiagnostic({ message: observed.message, ...candidate.expected_diagnostic }), null);
        const wrong = { ...candidate.expected_diagnostic, operand_index: candidate.expected_diagnostic.operand_index + 1 };
        assert.notDeepEqual(readGraphStructureDiagnostic(observed), wrong);
    }
    assert.ok(samples.size >= 3);
});

test('N02G:PATH-V3-018 captured barrier controls detect removed inverted redirected guards and an excluded member accepted from cached C', async () => {
    const fs = require('node:fs');
    const { preparePathQualificationInventory, preparePathStaticDomainControls,
        materializePathStaticDomainControl } = require('../../../src/next/provenance/pathQualificationV3');
    const { capturePathQualificationCompiler, compilePathQualificationCandidate } = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const preparation = preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.sites.every(site => site.domain_complete
        && site.domain.locators.length === 0) && row.sites.some(site => site.domain.namespace === 'material'));
    const plan = preparePathStaticDomainControls({ preparation, rowIndex });
    const siteIndex = plan.controls.findIndex(control => control.namespace === 'material');
    assert.ok(siteIndex >= 0);
    const positiveRoot = capturePathQualificationCompiler().artifact_root;
    const guard = "if (!own(fields, segments[0])) fail('path_missing');";
    const cases = [
        { file: 'graphStructure.js', change: source => source.replace(guard,
            "if (!own(fields, segments[0])) return { type: 'text' };"), mode: 'unmatched' },
        { file: 'graphStructure.js', change: source => source.replace(guard,
            "if (own(fields, segments[0])) fail('path_missing');"), mode: 'poisoned' },
        { file: 'graphStructure.js', change: source => source.replace(
            'site_path: [...coordinate.site_path, ...path]', "site_path: ['args', 0, 'forged']"), mode: 'unmatched' },
        { file: 'validationTcbEntry.js', change: source => source
            .replace('function capturedValidationTools() {', 'function capturedValidationTools() { let cachedIR, cachedAccess;')
            .replace('compileAuthoringIR: receipt => compileAuthoringIR(receipt, validators)',
                'compileAuthoringIR: receipt => (cachedIR ||= compileAuthoringIR(receipt, validators))')
            .replace('compileSnapshotAccess: receipt => compileSnapshotAccess(receipt, validators)',
                'compileSnapshotAccess: receipt => (cachedAccess ||= compileSnapshotAccess(receipt, validators))'), mode: 'poisoned' }
    ];
    for (const item of cases) {
        const originalRead = fs.readFileSync;
        let modifiedReads = 0, capture;
        // Adversarial BUILD bytes only, no disk edit and no weakened product
        // checker. The whole normal closure is still captured and executed.
        fs.readFileSync = function(file, ...args) {
            const value = originalRead.call(this, file, ...args);
            if (typeof file !== 'string' || !file.replaceAll('\\', '/').endsWith('/src/next/provenance/' + item.file)) return value;
            const source = typeof value === 'string' ? value : value.toString('utf8');
            const changed = item.change(source);
            assert.notEqual(changed, source); modifiedReads++;
            return typeof value === 'string' ? changed : Buffer.from(changed, 'utf8');
        };
        try { capture = capturePathQualificationCompiler(); } finally { fs.readFileSync = originalRead; }
        assert.ok(modifiedReads > 0);
        assert.notEqual(capture.artifact_root, positiveRoot);
        const candidate = materializePathStaticDomainControl({ plan, siteIndex });
        if (item.mode === 'poisoned') {
            assert.throws(() => compilePathQualificationCandidate({ capture, candidate }));
            assert.throws(() => compilePathQualificationCandidate({ capture,
                candidate: materializePathStaticDomainControl({ plan, siteIndex }) }));
        } else {
            const result = compilePathQualificationCandidate({ capture, candidate });
            assert.equal(result.native_control_matched, false);
            if (item.mode === 'accepted_M') assert.equal(result.worlds[1].admitted, true);
            assert.equal(result.qualified, false);
            assert.equal(result.semantic_mutation_credit, 0);
            assert.equal(result.handle_attempts, 0);
        }
    }
});

test('N02G:PATH-V3-019 authored selection constraints seal exclusions before M without calling unclassified members admitted', async () => {
    const { preparePathQualificationInventory, preparePathQualificationAdmissionDomain,
        materializePathQualificationLocator } = require('../../../src/next/provenance/pathQualificationV3');
    const { sealPathQualificationReference } = require('../../../src/next/provenance/pathSemanticReference');
    const { capturePathQualificationCompiler, compilePathQualificationCandidate } = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const preparation = preparePathQualificationInventory(await fixture());
    let excluded = 0, unresolved = 0, control = null;
    for (let rowIndex = 0; rowIndex < preparation.rows.length; rowIndex++) {
        const domain = preparePathQualificationAdmissionDomain({ preparation, rowIndex });
        assert.equal(domain.qualified, false);
        assert.equal(domain.semantic_mutation_credit, 0);
        for (const site of domain.sites) {
            const original = preparation.rows[rowIndex].sites[site.site_index].domain;
            assert.equal(site.excluded.length + site.unclassified_locator_indices.length, original.locators.length);
            assert.equal(new Set([...site.excluded.map(x => x.locator_index), ...site.unclassified_locator_indices]).size,
                original.locators.length);
            if (site.unclassified_locator_indices.length) {
                assert.equal(site.admitted_locator_indices, null);
                assert.equal(site.admitted_domain_complete, false);
            } else assert.deepEqual(site.admitted_locator_indices, []);
            excluded += site.excluded.length;
            unresolved += site.unclassified_locator_indices.length;
            for (const member of site.excluded) {
                assert.equal(member.rule.id, 'selection_requires_authored_candidate_concern');
                assert.equal(member.rule.method_authority.commit, preparation.method_authority.commit);
                assert.deepEqual(member.site_path, preparation.rows[rowIndex].sites[site.site_index].authored_site.site_path);
                assert.equal(member.compiler_barrier_verified, false);
                assert.equal(member.expected_native_coordinate, null);
                assert.equal(member.basis, 'unchanged_authored_bindings_only_not_compiler_result');
                if (!control) control = { rowIndex, siteIndex: site.site_index, locatorIndex: member.locator_index };
            }
        }
    }
    assert.ok(excluded > 0);
    assert.ok(unresolved > 0);
    const candidate = materializePathQualificationLocator({ preparation, ...control });
    sealPathQualificationReference({ candidate });
    const result = compilePathQualificationCandidate({ capture: capturePathQualificationCompiler(), candidate });
    assert.equal(result.worlds[0].admitted, true);
    assert.equal(result.worlds[1].admitted, false);
    assert.equal(result.worlds[2].admitted, true);
    assert.equal(result.qualified, false);
    assert.equal(result.semantic_mutation_credit, 0);
});

test('N02G:PATH-V3-020 admission foundations reject caller rules clones reclassification omission and active inputs', async () => {
    const { preparePathQualificationInventory, preparePathQualificationAdmissionDomain,
        verifyPathQualificationAdmissionDomain } = require('../../../src/next/provenance/pathQualificationV3');
    const preparation = preparePathQualificationInventory(await fixture());
    let rowIndex = 0, domain;
    for (; rowIndex < preparation.rows.length; rowIndex++) {
        domain = preparePathQualificationAdmissionDomain({ preparation, rowIndex });
        if (domain.sites.some(site => site.excluded.length)) break;
    }
    assert.ok(rowIndex < preparation.rows.length);
    assert.equal(verifyPathQualificationAdmissionDomain({ domain, candidate: structuredClone(domain) }).foundation_integrity, true);
    const siteIndex = domain.sites.findIndex(site => site.excluded.length);
    for (const mutate of [x => x.sites[siteIndex].excluded.pop(),
        x => x.sites[siteIndex].excluded[0].locator_index = -1,
        x => x.sites[siteIndex].excluded[0].compiler_barrier_verified = true,
        x => x.sites[siteIndex].excluded[0].rule.id = 'caller_rule',
        x => x.sites[siteIndex].admitted_locator_indices = [0],
        x => x.qualified = true]) {
        const candidate = structuredClone(domain); mutate(candidate);
        assert.throws(() => verifyPathQualificationAdmissionDomain({ domain, candidate }));
    }
    assert.throws(() => verifyPathQualificationAdmissionDomain({ domain: structuredClone(domain), candidate: domain }));
    assert.throws(() => preparePathQualificationAdmissionDomain({ preparation, rowIndex, rules: [] }));
    let effects = 0;
    const active = { preparation };
    Object.defineProperty(active, 'rowIndex', { enumerable: true, get() { effects++; return rowIndex; } });
    assert.throws(() => preparePathQualificationAdmissionDomain(active));
    assert.throws(() => preparePathQualificationAdmissionDomain({ preparation,
        rowIndex: { valueOf() { effects++; return rowIndex; } } }));
    assert.throws(() => preparePathQualificationAdmissionDomain(new Proxy({ preparation, rowIndex }, { ownKeys() { effects++; return []; } })));
    const candidate = structuredClone(domain);
    Object.defineProperty(candidate.sites[siteIndex].excluded[0], 'rule', { enumerable: true, get() { effects++; return {}; } });
    assert.throws(() => verifyPathQualificationAdmissionDomain({ domain, candidate }));
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-001 preparation preserves every v2 target and authored site without semantic credit', async () => {
    const { preparePathQualificationInventory } = require('../../../src/next/provenance/pathQualificationV3');
    const { enumeratePathInventoryCandidate } = require('../../../src/next/provenance/pathMutationInventory');
    const input = await fixture();
    const previous = enumeratePathInventoryCandidate(input);
    const expected = previous.requirements.filter(row => row.family === 'predicate_path_semantic');
    const result = preparePathQualificationInventory(input);
    assert.deepEqual(result.rows.map(row => row.target_id), expected.map(row => row.mutation_id));
    for (const row of result.rows) {
        const sites = previous.sites.filter(site => site.class === 'path'
            && site.fact_key === row.target.fact_key && site.predicate_id === row.target.predicate_id);
        assert.deepEqual(row.sites.map(site => site.authored_site), sites);
        assert.equal(row.status, 'blocked');
        assert.equal(row.semantic_mutation_credit, 0);
        assert.equal(row.dp_execution, false);
    }
    assert.equal(result.verified, 0);
    assert.equal(result.global_g11, false);
    assert.equal(result.activated, false);
});

test('N02G:PATH-V3-002 exact migration rejects omissions, duplicates, redirected targets and forged proof flags', async () => {
    const { preparePathQualificationInventory, verifyPathQualificationInventory } = require('../../../src/next/provenance/pathQualificationV3');
    const prepared = preparePathQualificationInventory(await fixture());
    assert.equal(verifyPathQualificationInventory({ preparation: prepared, candidate: prepared }).verified, false);
    for (const mutate of [copy => copy.rows.pop(), copy => copy.rows[0] = copy.rows[1],
        copy => copy.rows[0].target.predicate_id += '_forged', copy => copy.rows[0].sites.pop(),
        copy => copy.rows[0].semantic_mutation_credit = 1, copy => copy.rows[0].status = 'verified',
        copy => copy.rows[0].disposition = 'static_domain_proof', copy => copy.verified = copy.rows.length,
        copy => copy.rows.find(row => row.sites.some(site => site.domain?.locators.length))
            .sites.find(site => site.domain?.locators.length).domain.locators.pop()]) {
        const candidate = structuredClone(prepared); mutate(candidate);
        assert.throws(() => verifyPathQualificationInventory({ preparation: prepared, candidate }));
    }
    assert.throws(() => verifyPathQualificationInventory({ preparation: structuredClone(prepared), candidate: prepared }));
});

test('N02G:PATH-V3-003 preparations and reconciliations never execute getters, proxies or caller coercion', async () => {
    const { preparePathQualificationInventory, verifyPathQualificationInventory } = require('../../../src/next/provenance/pathQualificationV3');
    const input = await fixture();
    const preparation = preparePathQualificationInventory(input);
    let effects = 0;
    const active = {};
    Object.defineProperty(active, 'packageReceipt', { enumerable: true, get() { effects++; return input.packageReceipt; } });
    Object.defineProperty(active, 'ir', { enumerable: true, value: input.ir });
    assert.throws(() => preparePathQualificationInventory(active));
    assert.throws(() => preparePathQualificationInventory(new Proxy(input, { ownKeys() { effects++; return []; } })));
    const candidate = structuredClone(preparation);
    Object.defineProperty(candidate.rows[0], 'status', { enumerable: true, get() { effects++; return 'verified'; } });
    assert.throws(() => verifyPathQualificationInventory({ preparation, candidate }));
    assert.throws(() => verifyPathQualificationInventory({ preparation, candidate: new Proxy({}, { ownKeys() { effects++; return []; } }) }));
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-004 locator domains retain equal-value anchors and every same nominal registry field before admission filtering', async () => {
    const { preparePathQualificationInventory } = require('../../../src/next/provenance/pathQualificationV3');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const input = await fixture();
    const docs = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = docs.get('docs/contracts/next/provenance-v2/graphs-v2.json');
    const registry = docs.get(corpus.material_registry.path);
    const prepared = preparePathQualificationInventory(input);
    let checked = 0;
    for (const row of prepared.rows) for (const site of row.sites) {
        assert.equal(site.admitted_domain_complete, false);
        if (!site.domain_complete) {
            assert.equal(site.domain, null);
            assert.equal(typeof site.domain_reason, 'string');
            assert.equal(row.status, 'blocked');
            continue;
        }
        const domain = site.domain;
        assert.equal(new Set(domain.locators.map(locator => JSON.stringify(locator))).size, domain.locators.length);
        if (domain.namespace !== 'material' || domain.original_nominal.type !== 'money_minor'
            || domain.original_nominal.form !== 'scalar' || site.authored_site.definition !== 'fieldPath') continue;
        const graph = corpus.graphs.find(graph => graph.fact_key === row.target.fact_key);
        const kind = graph.nodes[domain.original.node].kind;
        const fields = Object.entries(registry.kinds[kind].fields).filter(([, field]) => field.type === 'money_minor').map(([name]) => name).sort();
        const expected = Object.entries(graph.nodes).filter(([, node]) => node.kind === kind)
            .flatMap(([node]) => fields.map(field => ({ node, segments: [field] })))
            .filter(locator => JSON.stringify(locator) !== JSON.stringify(domain.original));
        const normalized = rows => rows.map(row => JSON.stringify(row)).sort();
        assert.deepEqual(normalized(domain.locators), normalized(expected));
        checked++;
    }
    assert.ok(checked > 0);
});

test('N02G:PATH-V3-005 optional declared claim locators do not disappear merely because absent in current authorship', async () => {
    const { createLocatorDomainEnumeration } = require('../../../src/next/provenance/pathLocatorDomainV3');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const input = await fixture();
    const docs = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = docs.get('docs/contracts/next/provenance-v2/graphs-v2.json');
    const claims = new Map(docs.get(corpus.claim_contract.path).claims.map(row => [row.fact_key, row]));
    const enumeration = createLocatorDomainEnumeration(input.packageReceipt);
    let checked = 0;
    for (const [factKey, claim] of claims) {
        if (Object.hasOwn(claim, 'filters')) continue;
        const locators = enumeration.enumerateClaimLocators(factKey);
        assert.ok(locators.some(locator => JSON.stringify(locator.segments) === '["filters"]'));
        assert.ok(locators.some(locator => JSON.stringify(locator.segments) === '["filters","budget_class"]'));
        checked++;
    }
    assert.ok(checked > 0);
});

test('N02G:PATH-V3-006 the domain boundary rejects active targets and sites without evaluating them', async () => {
    const { createLocatorDomainEnumeration } = require('../../../src/next/provenance/pathLocatorDomainV3');
    const { preparePathQualificationInventory } = require('../../../src/next/provenance/pathQualificationV3');
    const input = await fixture();
    const enumeration = createLocatorDomainEnumeration(input.packageReceipt);
    const row = preparePathQualificationInventory(input).rows[0];
    let effects = 0;
    const target = structuredClone(row.target);
    Object.defineProperty(target, 'fact_key', { enumerable: true, get() { effects++; return row.target.fact_key; } });
    assert.throws(() => enumeration.enumerateSite(target, row.sites[0].authored_site));
    assert.throws(() => enumeration.enumerateSite(row.target, new Proxy({}, { ownKeys() { effects++; return []; } })));
    assert.throws(() => enumeration.enumerateClaimLocators({ toString() { effects++; return row.target.fact_key; } }));
    assert.equal(effects, 0);
});
```

## tests/next/provenance/pathSemanticV2.cases.js

SHA-256 af45849af0217f704da75e6d8f8fab7454dd239c9f39ea406b2b16ee2182d76d; Git blob 85315a6d97de4db9c46651560e2726aeedd85148; bytes 35762.

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let cached;
test('N02G:PATH-SEMANTIC-V2-013 independent pinned civil instant reference covers timezone boundaries', () => {
    const { referenceCivilRelation } = require('../../../src/next/provenance/pathSemanticReference');
    const zone = 'America/Sao_Paulo', calendar = 'proleptic_gregorian';
    const compare = (instant, date, z = zone, c = calendar) =>
        referenceCivilRelation('civil_date_matches', [instant, date, z, c]);
    const source = fs.readFileSync(path.resolve(__dirname,
        '../../../docs/audit-evidence/n02g-causal-authoring-profile/path-timezone-reference-20261007/iana-tzdb-2025b-southamerica.txt'));
    const hash = require('node:crypto').createHash('sha256').update(source).digest('hex');
    assert.equal(hash, '57cc4ee3dc4bd575f126ba76f284a9ee67330c6fbb7576792eda27f41451ff22');
    const lines = source.toString('utf8').split('\n');
    const rules = lines.filter(line => /^Rule\s+Brazil\s/.test(line)).map(line => line.split(/\s+/));
    assert.equal(rules.length, 57);
    assert.ok(rules.every(rule => /^\d{4}$/.test(rule[2])
        && (rule[3] === 'only' || /^\d{4}$/.test(rule[3]))));
    const latest = Math.max(...rules.map(rule => Number(rule[3] === 'only' ? rule[2] : rule[3])));
    assert.equal(latest, 2019);
    assert.equal(rules.filter(rule => Number(rule[3] === 'only' ? rule[2] : rule[3]) === latest)[0][8], '0');
    const index = lines.findIndex(line => line.startsWith('Zone America/Sao_Paulo'));
    assert.match(lines[index + 3], /^\s+-3:00\s+Brazil\s+%z$/);
    for (const [instant, date] of [
        ['2042-06-15T12:00:00-03:00', '2042-06-15'],
        ['2042-06-16T01:00:00Z', '2042-06-15'],
        ['2020-01-01T00:00:00Z', '2019-12-31'],
        ['2024-03-01T02:59:59.999999Z', '2024-02-29'],
        ['2024-03-01T03:00:00Z', '2024-03-01'],
        ['2100-03-01T02:59:59Z', '2100-02-28'],
        ['9999-12-31T23:59:59Z', '9999-12-31']
    ]) assert.equal(compare(instant, date), true, instant);
    assert.equal(compare('2042-06-16T01:00:00Z', '2042-06-16'), false);
    assert.equal(compare('2042-06-15T12:00:00-03:00', '2042-06-30'), false);
    for (const offset of [-1439, -180, 0, 330, 1439]) {
        // Independent equivalence fixture: every spelling denotes 2024-03-01T03:00Z.
        const minute = 3 * 60 + offset;
        const date = minute < 0 ? '2024-02-29' : minute >= 1440 ? '2024-03-02' : '2024-03-01';
        const time = (minute % 1440 + 1440) % 1440;
        const hh = String(Math.floor(time / 60)).padStart(2, '0'), mm = String(time % 60).padStart(2, '0');
        const off = Math.abs(offset), oh = String(Math.floor(off / 60)).padStart(2, '0'), om = String(off % 60).padStart(2, '0');
        assert.equal(compare(`${date}T${hh}:${mm}:00${offset < 0 ? '-' : '+'}${oh}:${om}`, '2024-03-01'), true);
    }
    for (const instant of ['2019-12-31T23:59:59Z', '9999-12-31T23:59:59-23:59',
        '2024-02-30T00:00:00Z', '2024-01-01T24:00:00Z', '2024-01-01T00:00:60Z',
        '2024-01-01T00:00:00+24:00', '2024-01-01T00:00:00', '0000-01-01T00:00:00Z'])
        assert.equal(compare(instant, '2024-01-01'), null, instant);
    assert.equal(compare('2024-01-01T00:00:00Z', '2023-12-31', 'UTC'), null);
    assert.equal(compare('2024-01-01T00:00:00Z', '2023-12-31', zone, 'gregorian'), null);
    let effects = 0;
    const hostile = { toString() { effects++; return '2024-01-01T00:00:00Z'; } };
    assert.equal(compare(hostile, '2023-12-31'), null);
    const getter = ['2024-01-01T00:00:00Z', '2023-12-31', zone, calendar];
    Object.defineProperty(getter, 0, { enumerable: true, get() { effects++; return 'ignored'; } });
    assert.equal(referenceCivilRelation('civil_date_matches', getter), null);
    assert.equal(referenceCivilRelation('civil_date_matches', new Proxy([], { ownKeys() { effects++; return []; } })), null);
    assert.equal(effects, 0);
});

test('N02G:PATH-SEMANTIC-V2-014 authored civil clock references preserve first alternatives without execution credit', async () => {
    const { packageReceipt, inventoryCandidate } = await fixture();
    const { enumeratePathSemanticCandidates } = require('../../../src/next/provenance/pathMutationInventory');
    const { sealPathSemanticReference } = require('../../../src/next/provenance/pathSemanticReference');
    const ids = ['M-13#1#3', 'M-13#1#6'];
    for (const fact_key of ids) {
        const requirement = inventoryCandidate.requirements.find(row => row.family === 'predicate_path_semantic'
            && row.target.fact_key === fact_key && row.target.predicate_id === 'calendar_clock_cutoff');
        assert.ok(requirement);
        const candidates = enumeratePathSemanticCandidates({ inventoryCandidate, mutation_id: requirement.mutation_id }).candidates;
        assert.equal(candidates.length, 2);
        assert.equal(candidates[0].patch.after.segments.at(-1), 'daily_pace_end');
        for (const candidate of candidates) {
            const ref = sealPathSemanticReference({ packageReceipt, candidate });
            assert.equal(ref.available, true);
            assert.equal(ref.baseline_satisfied, true);
            assert.equal(ref.mutant_satisfied, false);
            assert.equal(ref.financial_receipt, false);
            assert.deepEqual(ref.expected_violations, ['period']);
        }
    }
});

test('N02G:PATH-SEMANTIC-V2-012 independent authored windows resolve only frozen civil operands', async () => {
    const { packageReceipt, inventoryCandidate } = await fixture();
    const { enumeratePathSemanticCandidates } = require('../../../src/next/provenance/pathMutationInventory');
    const { sealPathSemanticReference } = require('../../../src/next/provenance/pathSemanticReference');
    const targets = [
        ['F-03#2#1', 'calendar_close_day'], ['M-05#1#1', 'calendar_close_day'],
        ['S-05#1#1', 'calendar_close_day'], ['M-13#1#3', 'calendar_budget_bounds'],
        ['M-13#1#6', 'calendar_budget_bounds']
    ];
    for (const [fact_key, predicate_id] of targets) {
        const requirement = inventoryCandidate.requirements.find(row => row.family === 'predicate_path_semantic'
            && row.target.fact_key === fact_key && row.target.predicate_id === predicate_id);
        assert.ok(requirement);
        const candidates = enumeratePathSemanticCandidates({ inventoryCandidate, mutation_id: requirement.mutation_id }).candidates;
        assert.ok(candidates.length > 0);
        const refs = candidates.map(candidate => sealPathSemanticReference({ packageReceipt, candidate }));
        assert.ok(refs.every(row => row.available), `${fact_key}/${predicate_id} reference domain`);
        assert.ok(refs.every(row => row.baseline_satisfied === true));
        assert.ok(refs.some(row => row.mutant_satisfied === false));
        assert.ok(refs.every(row => row.financial_receipt === false
            && row.source === 'admitted_frozen_claim_and_primary_snapshot_only'));
        assert.throws(() => sealPathSemanticReference({ packageReceipt, candidate: structuredClone(candidates[0]) }));
    }
    for (const [fact_key, predicate_id] of [['F-03#2#1','calendar_previous_close'], ['M-13#1#3','calendar_day_count']]) {
        const requirement = inventoryCandidate.requirements.find(row => row.family === 'predicate_path_semantic'
            && row.target.fact_key === fact_key && row.target.predicate_id === predicate_id);
        const result = enumeratePathSemanticCandidates({ inventoryCandidate, mutation_id: requirement.mutation_id });
        assert.equal(result.candidates.length, 0);
        assert.equal(result.no_candidate_disposition, 'UNSATISFIED_MUTATION_WITNESS');
    }
});

test('N02G:PATH-SEMANTIC-V2-010 explicit ID scope retains exact expected row and never claims global coverage', async () => {
    const { executePathSemanticV2ScopedBatch } = await import('../../../scripts/agent/executeNextPredicateStrategyMatrix.mjs');
    const { packageReceipt, inventoryCandidate } = await fixture();
    const requirement = inventoryCandidate.requirements.find(row => row.family === 'predicate_path_semantic'
        && row.target.fact_key === 'F-03#2#1' && row.target.predicate_id === 'calendar_due_day');
    const result = await executePathSemanticV2ScopedBatch({ packageReceipt, fact_keys: ['F-03#2#1'],
        mutation_ids: [requirement.mutation_id] });
    assert.equal(result.mutations.expected, 1);
    assert.deepEqual(result.rows.map(row => row.mutation_id), [requirement.mutation_id]);
    assert.deepEqual(result.explicit_scope.mutation_ids, [requirement.mutation_id]);
    assert.equal(result.explicit_scope.policy, 'authored_required_ids_before_outcomes');
    assert.equal(result.full_scalar_scope_expected,
        inventoryCandidate.requirements.filter(row => row.family === 'predicate_path_semantic').length);
    assert.equal(result.financial_receipt, false);
    assert.equal(result.global_g11, false);
    assert.equal(result.rows[0].matched, !result.unsatisfied.length);
    if (result.rows[0].matched) {
        assert.equal(result.rows[0].dp_execution, true);
        assert.equal(result.rows[0].reference.mutant_satisfied, false);
        assert.equal(result.rows[0].outside_target_preserved, true);
        assert.equal(result.rows[0].phases_covered, true);
        assert.equal(result.rows[0].positive_oracle_matched, true);
    }
});

test('N02G:PATH-SEMANTIC-V2-011 scoped harness rejects absent duplicate cross-graph and effectful IDs before guest', async () => {
    const { executePathSemanticV2ScopedBatch } = await import('../../../scripts/agent/executeNextPredicateStrategyMatrix.mjs');
    const { packageReceipt, inventoryCandidate } = await fixture();
    const requirement = inventoryCandidate.requirements.find(row => row.family === 'predicate_path_semantic'
        && row.target.fact_key === 'F-03#2#1' && row.target.predicate_id === 'calendar_due_day');
    const base = { packageReceipt, fact_keys: ['F-03#2#1'] };
    for (const mutation_ids of [[], ['sha256:' + '0'.repeat(64)], [requirement.mutation_id, requirement.mutation_id], ['bad']])
        await assert.rejects(() => executePathSemanticV2ScopedBatch({ ...base, mutation_ids }), /predicate_strategy_matrix_(input|path_scope)/);
    await assert.rejects(() => executePathSemanticV2ScopedBatch({ packageReceipt, fact_keys: ['M-01#1#1'],
        mutation_ids: [requirement.mutation_id] }), /predicate_strategy_matrix_path_scope/);
    await assert.rejects(() => executePathSemanticV2ScopedBatch({ packageReceipt, fact_keys: ['F-03#2#1','M-01#1#1'],
        mutation_ids: [requirement.mutation_id] }), /predicate_strategy_matrix_path_scope/);
    const admission = inventoryCandidate.requirements.find(row => row.family === 'predicate_path_admission'
        && row.target.fact_key === 'F-03#2#1');
    assert.ok(admission);
    await assert.rejects(() => executePathSemanticV2ScopedBatch({ ...base, mutation_ids: [admission.mutation_id] }),
        /predicate_strategy_matrix_path_scope/);
    let effects = 0;
    const getter = [requirement.mutation_id];
    Object.defineProperty(getter, 0, { enumerable: true, get() { effects++; return requirement.mutation_id; } });
    for (const mutation_ids of [getter, new Proxy([], { ownKeys() { effects++; return []; } })])
        await assert.rejects(() => executePathSemanticV2ScopedBatch({ ...base, mutation_ids }), /predicate_strategy_matrix_input/);
    const sparse = new Array(1);
    const extra = [requirement.mutation_id]; extra.actual = 'ignored';
    const symbolic = [requirement.mutation_id]; symbolic[Symbol('actual')] = 'ignored';
    for (const mutation_ids of [sparse, extra, symbolic])
        await assert.rejects(() => executePathSemanticV2ScopedBatch({ ...base, mutation_ids }), /predicate_strategy_matrix_input/);
    const raw = { ...base, mutation_ids: [requirement.mutation_id] };
    Object.defineProperty(raw, 'mutation_ids', { enumerable: true, get() { effects++; return getter; } });
    await assert.rejects(() => executePathSemanticV2ScopedBatch(raw), /predicate_strategy_matrix_input/);
    await assert.rejects(() => executePathSemanticV2ScopedBatch({ ...base, mutation_ids: [requirement.mutation_id], actual: {} }),
        /predicate_strategy_matrix_input/);
    assert.equal(effects, 0);
});

test('N02G:PATH-SEMANTIC-V2-008 independent civil relations respect arity, Gregorian boundaries and inert inputs', () => {
    const { referenceCivilRelation } = require('../../../src/next/provenance/pathSemanticReference');
    const calendar = 'proleptic_gregorian';
    const years = [...Array.from({ length: 400 }, (_, index) => index + 1), 1900, 2000, 2024, 2100, 9999];
    for (const year of years) for (let month = 1; month <= 12; month++) {
        const y = String(year).padStart(4, '0'), m = String(month).padStart(2, '0');
        const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const last = month === 2 ? leap ? 29 : 28 : [4, 6, 9, 11].includes(month) ? 30 : 31;
        const start = `${y}-${m}-01`, end = `${y}-${m}-${last}`;
        assert.equal(referenceCivilRelation('month_bounds_match', [`${y}-${m}`, start, end, calendar]), true);
        assert.equal(referenceCivilRelation('month_bounds_match', [`${y}-${m}`, start, start, calendar]), false);
        for (let day = 1; day <= last; day++) {
            const date = `${y}-${m}-${String(day).padStart(2, '0')}`;
            assert.equal(referenceCivilRelation('day_of_month_matches', [date, day, calendar]), true);
            assert.equal(referenceCivilRelation('day_of_month_matches', [date, day === 1 ? 2 : 1, calendar]), false);
            assert.equal(referenceCivilRelation('civil_offset_matches', [start, day - 1, 'day', date, calendar]), true);
            assert.equal(referenceCivilRelation('civil_offset_matches', [date, 1 - day, 'day', start, calendar]), true);
        }
        const range = { kind: 'range', start, end, start_inclusive: true, end_inclusive: true };
        assert.equal(referenceCivilRelation('inclusive_day_count_matches', [range, last, calendar]), true);
        assert.equal(referenceCivilRelation('inclusive_day_count_matches', [range, last + 1, calendar]), false);
        if (year < 9999 || month < 12) {
            const next = month === 12 ? `${String(year + 1).padStart(4, '0')}-01-01`
                : `${y}-${String(month + 1).padStart(2, '0')}-01`;
            assert.equal(referenceCivilRelation('civil_offset_matches', [end, 1, 'day', next, calendar]), true);
            assert.equal(referenceCivilRelation('civil_offset_matches', [next, -1, 'day', end, calendar]), true);
            assert.equal(referenceCivilRelation('civil_offset_matches', [start, 1, 'month', next, calendar]), true);
            assert.equal(referenceCivilRelation('civil_offset_matches', [next, -1, 'month', start, calendar]), true);
        }
    }
    for (const [origin, amount, target] of [['2024-01-31', 1, '2024-02-29'], ['2024-03-31', -1, '2024-02-29']])
        assert.equal(referenceCivilRelation('civil_offset_matches', [origin, amount, 'month', target, calendar]), null);
    assert.equal(referenceCivilRelation('civil_offset_matches', ['2024-01-29', 1, 'month', '2024-02-29', calendar]), true);
    assert.equal(referenceCivilRelation('civil_offset_matches', ['2000-01-01', -1, 'day', '1999-12-31', calendar]), true);
    for (const unit of ['day', 'month']) {
        assert.equal(referenceCivilRelation('civil_offset_matches', ['0001-01-01', -1, unit, '0001-01-01', calendar]), null);
        assert.equal(referenceCivilRelation('civil_offset_matches', ['9999-12-31', 1, unit, '9999-12-31', calendar]), null);
    }
    for (const date of ['0000-01-01', '1900-02-29', '2100-02-29', '2024-04-31', '2024-1-01', '10000-01-01'])
        assert.equal(referenceCivilRelation('day_of_month_matches', [date, 1, calendar]), null);
    for (const value of [0, -0, 32, 1.5, '1', Number.MAX_SAFE_INTEGER + 1])
        assert.equal(referenceCivilRelation('day_of_month_matches', ['2024-01-01', value, calendar]), null);
    assert.equal(referenceCivilRelation('civil_offset_matches', ['2024-01-01', -0, 'day', '2024-01-01', calendar]), null);
    assert.equal(referenceCivilRelation('civil_offset_matches', ['2024-01-01', 1, 'hour', '2024-01-02', calendar]), null);
    assert.equal(referenceCivilRelation('day_of_month_matches', ['2024-01-01', 1, 'gregorian']), null);
    assert.equal(referenceCivilRelation('day_of_month_matches', ['2024-01-01', 1, calendar, 'actual']), null);
    assert.equal(referenceCivilRelation('civil_date_matches', ['2024-01-01T00:00:00Z', '2024-01-01', 'UTC', calendar]), null);
    let effects = 0;
    const getter = ['2024-01-01', 1, calendar];
    Object.defineProperty(getter, 0, { enumerable: true, get() { effects++; return '2024-01-01'; } });
    assert.equal(referenceCivilRelation('day_of_month_matches', getter), null);
    assert.equal(referenceCivilRelation('day_of_month_matches', new Proxy([], { ownKeys() { effects++; return []; } })), null);
    const range = { kind: 'range', start: '2024-01-01', end: '2024-01-02', start_inclusive: true, end_inclusive: true };
    for (const invalid of [{ ...range, actual: 2 }, { ...range, start_inclusive: false }, { ...range, end: '2023-12-31' }])
        assert.equal(referenceCivilRelation('inclusive_day_count_matches', [invalid, 2, calendar]), null);
    Object.defineProperty(range, 'start', { enumerable: true, get() { effects++; return '2024-01-01'; } });
    assert.equal(referenceCivilRelation('inclusive_day_count_matches', [range, 2, calendar]), null);
    assert.equal(referenceCivilRelation('inclusive_day_count_matches', [new Proxy({}, { ownKeys() { effects++; return []; } }), 1, calendar]), null);
    assert.equal(referenceCivilRelation('__proto__', getter), null);
    assert.equal(effects, 0);
});

test('N02G:PATH-SEMANTIC-V2-009 authored three-argument civil predicates seal independent references without D/P credit', async () => {
    const { packageReceipt, inventoryCandidate } = await fixture();
    const { enumeratePathSemanticCandidates } = require('../../../src/next/provenance/pathMutationInventory');
    const { sealPathSemanticReference } = require('../../../src/next/provenance/pathSemanticReference');
    const requirement = inventoryCandidate.requirements.find(row => row.family === 'predicate_path_semantic'
        && row.target.fact_key === 'F-03#2#1' && row.target.predicate_id === 'calendar_due_day');
    assert.ok(requirement);
    const enumeration = enumeratePathSemanticCandidates({ inventoryCandidate, mutation_id: requirement.mutation_id });
    assert.ok(enumeration.candidates.length > 0);
    const refs = enumeration.candidates.map(candidate => sealPathSemanticReference({ packageReceipt, candidate }));
    assert.ok(refs.some(reference => reference.available && reference.baseline_satisfied));
    assert.ok(refs.every(reference => reference.financial_receipt === false
        && reference.source === 'admitted_frozen_claim_and_primary_snapshot_only'));
    assert.equal(enumeration.executed, 0);
    assert.equal(enumeration.matched, 0);
});

async function fixture() {
    if (cached) return cached;
    const { loadLocalAuthoringPackage } = await import('../../../scripts/agent/executeNextDomainInvariantMatrix.mjs');
    const { buildAdmittedSchemaValidators } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const { compileAuthoringIR } = require('../../../src/next/provenance/graphCompiler');
    const { enumeratePathInventoryCandidate } = require('../../../src/next/provenance/pathMutationInventory');
    const packageReceipt = loadLocalAuthoringPackage();
    const validators = buildAdmittedSchemaValidators(packageReceipt).validators;
    const ir = compileAuthoringIR(packageReceipt, validators);
    cached = { packageReceipt, validators, ir, inventoryCandidate: enumeratePathInventoryCandidate({ packageReceipt, ir }) };
    return cached;
}
test('N02G:PATH-SEMANTIC-V2-007 invalid template alternatives do not abort the closed-world search or grant credit', async () => {
    const { enumeratePathSemanticCandidates } = require('../../../src/next/provenance/pathMutationInventory');
    const { inventoryCandidate } = await fixture();
    const graphs = JSON.parse(fs.readFileSync(path.resolve(__dirname,
        '../../../docs/contracts/next/provenance-v2/graphs-v2.json'), 'utf8')).graphs;
    const requirements = inventoryCandidate.requirements.filter(row => row.family === 'predicate_path_semantic'
        && graphs.find(graph => graph.fact_key === row.target.fact_key).predicates
            .find(predicate => predicate.id === row.target.predicate_id).args.some(arg => arg.template));
    assert.ok(requirements.length > 0);
    for (const requirement of requirements) {
        const result = enumeratePathSemanticCandidates({ inventoryCandidate, mutation_id: requirement.mutation_id });
        assert.equal(result.mutation_id, requirement.mutation_id);
        assert.equal(result.required, true);
        assert.equal(result.executed, 0);
        assert.equal(result.matched, 0);
        assert.equal(result.no_candidate_disposition, 'UNSATISFIED_MUTATION_WITNESS');
        assert.ok(result.candidates.every(candidate => candidate.nominal_type_preserved
            && candidate.operator_preserved && candidate.executed === 0 && candidate.matched === 0));
    }
});

test('N02G:PATH-SEMANTIC-V2-001 alternatives are sealed by coordinate, preserve one locator and never grant execution credit', async () => {
    const { enumeratePathSemanticCandidates, readPathSemanticCandidate } = require('../../../src/next/provenance/pathMutationInventory');
    const { inventoryCandidate } = await fixture();
    const requirement = inventoryCandidate.requirements.find(row => row.family === 'predicate_path_semantic'
        && row.target.fact_key === 'M-01#1#1' && row.target.predicate_id === 'binding_7');
    const result = enumeratePathSemanticCandidates({ inventoryCandidate, mutation_id: requirement.mutation_id });
    assert.equal(result.mutation_id, requirement.mutation_id);
    assert.equal(result.executed, 0);
    assert.equal(result.matched, 0);
    assert.equal(result.activated, false);
    assert.ok(result.candidates.length > 0);
    assert.equal(new Set(result.candidates.map(row => row.candidate_id)).size, result.candidates.length);
    for (const candidate of result.candidates) {
        assert.equal(candidate.mutation_id, requirement.mutation_id);
        assert.equal(candidate.expected_violations.length, 1);
        assert.equal(candidate.operator_preserved, true);
        assert.equal(candidate.nominal_type_preserved, true);
        assert.equal(candidate.claim_oracle_preserved, true);
        assert.equal(candidate.material_payload_preserved, true);
        assert.notDeepEqual(candidate.patch.before, candidate.patch.after);
        const restored = structuredClone(candidate.graph);
        let node = restored.predicates.find(row => row.id === requirement.target.predicate_id);
        for (const token of candidate.patch.location.slice(0, -1)) node = node[token];
        node[candidate.patch.location.at(-1)] = structuredClone(candidate.patch.before);
        const { createHash } = require('node:crypto');
        assert.equal('sha256:' + createHash('sha256').update(JSON.stringify(restored)).digest('hex'), candidate.baseline_graph_sha256);
        assert.ok(readPathSemanticCandidate(candidate));
        assert.equal(readPathSemanticCandidate(structuredClone(candidate)), null);
    }
    assert.throws(() => enumeratePathSemanticCandidates({ inventoryCandidate: structuredClone(inventoryCandidate), mutation_id: requirement.mutation_id }));
    const admission = inventoryCandidate.requirements.find(row => row.family === 'predicate_path_admission');
    assert.throws(() => enumeratePathSemanticCandidates({ inventoryCandidate, mutation_id: admission.mutation_id }));
    let effects = 0;
    assert.throws(() => enumeratePathSemanticCandidates(new Proxy({}, { ownKeys() { effects++; return []; } })));
    assert.equal(effects, 0);
    const period = inventoryCandidate.requirements.find(row => row.family === 'predicate_path_semantic'
        && row.target.fact_key === 'M-01#1#1' && row.target.predicate_id === 'binding_1');
    const empty = enumeratePathSemanticCandidates({ inventoryCandidate, mutation_id: period.mutation_id });
    assert.equal(empty.required, true);
    assert.equal(empty.candidates.length, 0);
    assert.equal(empty.no_candidate_disposition, 'UNSATISFIED_MUTATION_WITNESS');
});
test('N02G:PATH-SEMANTIC-V2-002 real authored locator negatives do not receive credit for early or collateral rejection', async () => {
    const { executePathSemanticV2Batch } = await import('../../../scripts/agent/executeNextPredicateStrategyMatrix.mjs');
    const { packageReceipt, inventoryCandidate } = await fixture();
    const result = await executePathSemanticV2Batch({ packageReceipt, fact_keys: ['M-01#1#1'] });
    const report = path.resolve(__dirname, '../../../.codex-temp/path-semantic-v2-discriminating-focal-20261004.json');
    // Evidence export is opt-in for a local run, not a side effect of the
    // hermetic suite. A prior report is never overwritten.
    if (process.env.FINANCASBOT_PATH_SEMANTIC_EVIDENCE === '20261004-focal-r1')
        fs.writeFileSync(report, JSON.stringify(result) + '\n', { flag: 'wx' });
    const expected = inventoryCandidate.requirements.filter(row => row.family === 'predicate_path_semantic'
        && row.target.fact_key === 'M-01#1#1');
    assert.equal(result.mutations.expected, expected.length);
    assert.deepEqual(result.rows.map(row => row.mutation_id).sort(), expected.map(row => row.mutation_id).sort());
    assert.equal(new Set(result.rows.map(row => row.mutation_id)).size, expected.length);
    assert.ok(result.unsatisfied.some(row => row.cause === 'no_typed_closed_world_alternative'));
    assert.ok(result.unsatisfied.some(row => row.cause.includes('claim_requirements')));
    for (const row of result.rows) {
        assert.equal(row.financial_receipt, false);
        if (!row.dp_execution) assert.equal(row.matched, false);
        if (row.matched) {
            assert.equal(row.reference.available, true);
            assert.equal(row.reference.baseline_satisfied, true);
            assert.equal(row.reference.mutant_satisfied, false);
            assert.equal(row.outside_target_preserved, true);
            assert.equal(row.phases_covered, true);
            assert.equal(row.positive_oracle_matched, true);
            assert.equal(row.proof_satisfied, false);
            assert.deepEqual(row.observed_violations, row.expected_violations);
        }
    }
    assert.equal(result.batch_complete, false);
    assert.equal(result.global_g11, false);
    assert.equal(result.predicate_atom_credit, 0);
    assert.equal(result.financial_receipt, false);
});
test('N02G:PATH-SEMANTIC-V2-003 independent references reject wrong coordinates, actual inputs and cloned capabilities', async () => {
    const { enumeratePathSemanticCandidates } = require('../../../src/next/provenance/pathMutationInventory');
    const { sealPathSemanticReference, readPathSemanticReference } = require('../../../src/next/provenance/pathSemanticReference');
    const { packageReceipt, inventoryCandidate } = await fixture();
    const requirement = inventoryCandidate.requirements.find(row => row.family === 'predicate_path_semantic'
        && row.target.fact_key === 'M-01#1#1' && row.target.predicate_id === 'binding_7');
    const candidate = enumeratePathSemanticCandidates({ inventoryCandidate, mutation_id: requirement.mutation_id }).candidates[0];
    const reference = sealPathSemanticReference({ packageReceipt, candidate });
    assert.equal(reference.available, true);
    assert.equal(reference.baseline_satisfied, true);
    assert.equal(reference.mutant_satisfied, false);
    assert.deepEqual(reference.expected_violations, candidate.expected_violations);
    assert.ok(readPathSemanticReference(reference));
    assert.equal(readPathSemanticReference(structuredClone(reference)), null);
    assert.throws(() => sealPathSemanticReference({ packageReceipt, candidate: structuredClone(candidate) }));
    const wrong = structuredClone(candidate); wrong.target.predicate_id = 'binding_1';
    assert.throws(() => sealPathSemanticReference({ packageReceipt, candidate: wrong }));
    assert.throws(() => sealPathSemanticReference({ packageReceipt, candidate, actual: false }));
    let effects = 0;
    const getter = { candidate };
    Object.defineProperty(getter, 'packageReceipt', { enumerable: true, get() { effects++; return packageReceipt; } });
    assert.throws(() => sealPathSemanticReference(getter));
    assert.equal(effects, 0);
});
test('N02G:PATH-SEMANTIC-V2-004 unexpected checker failure is not relabelled as absence of a witness', async () => {
    const { enumeratePathSemanticCandidates } = require('../../../src/next/provenance/pathMutationInventory');
    const native = require('../../../src/next/provenance/predicateTypes');
    const { inventoryCandidate } = await fixture();
    const requirement = inventoryCandidate.requirements.find(row => row.family === 'predicate_path_semantic'
        && row.target.fact_key === 'M-01#1#1' && row.target.predicate_id === 'binding_7');
    const saved = native.compilePredicateTypes;
    native.compilePredicateTypes = () => { throw new Error('unexpected_checker_failure'); };
    try {
        assert.throws(() => enumeratePathSemanticCandidates({ inventoryCandidate, mutation_id: requirement.mutation_id }),
            /unexpected_checker_failure/);
    } finally { native.compilePredicateTypes = saved; }
    const templates = require('../../../src/next/provenance/templateReferences');
    const original = templates.validateTemplateReferences;
    const forged = new Error('operator_types_shape');
    templates.validateTemplateReferences = () => { throw forged; };
    try {
        assert.throws(() => enumeratePathSemanticCandidates({ inventoryCandidate, mutation_id: requirement.mutation_id }),
            error => error === forged);
    } finally { templates.validateTemplateReferences = original; }
});

test('N02G:PATH-SEMANTIC-V2-005 independent civil containment covers boundaries without runtime or actual', async () => {
    const { referenceCivilDateContained, sealPathSemanticReference } = require('../../../src/next/provenance/pathSemanticReference');
    for (const year of [1900, 2000, 2024, 2025, 2100]) {
        const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const month = `${year}-02`; const end = `${month}-${leap ? '29' : '28'}`;
        for (let day = 1; day <= (leap ? 29 : 28); day++) {
            const date = `${month}-${String(day).padStart(2, '0')}`;
            for (const kind of ['month', 'statement_competence', 'budget_cycle'])
                assert.equal(referenceCivilDateContained(date, { kind, value: month }), true);
            for (const start_inclusive of [false, true]) for (const end_inclusive of [false, true]) {
                const range = { kind: 'range', start: `${month}-01`, end, start_inclusive, end_inclusive };
                assert.equal(referenceCivilDateContained(date, range),
                    (day > 1 || start_inclusive) && (date !== end || end_inclusive));
            }
            assert.equal(referenceCivilDateContained(date, { kind: 'through', value: end }), true);
            assert.equal(referenceCivilDateContained(date, { kind: 'date', value: end }), date === end);
            assert.equal(referenceCivilDateContained(date, { kind: 'statement_due', value: end }), date === end);
        }
        assert.equal(referenceCivilDateContained(`${year}-03-01`, { kind: 'month', value: month }), false);
        assert.equal(referenceCivilDateContained(`${year}-03-01`, { kind: 'through', value: end }), false);
    }
    for (const date of ['1900-02-29', '2100-02-29', '2024-04-31', '2024-13-01', '2024-00-01', '2024-1-01', '2024-01-00'])
        assert.equal(referenceCivilDateContained(date, { kind: 'month', value: '2024-01' }), null);
    assert.equal(referenceCivilDateContained('2024-02-29', { kind: 'as_of', value: '2024-02-29' }), null);
    assert.equal(referenceCivilDateContained('2024-02-29', { kind: 'range', start: '2024-03-01', end: '2024-02-01', start_inclusive: true, end_inclusive: true }), null);
    assert.equal(referenceCivilDateContained('2024-02-29', { kind: 'month', value: '2024-02', actual: true }), null);
    let effects = 0;
    const getter = { kind: 'month' };
    Object.defineProperty(getter, 'value', { enumerable: true, get() { effects++; return '2024-02'; } });
    assert.equal(referenceCivilDateContained('2024-02-29', getter), null);
    assert.equal(referenceCivilDateContained('2024-02-29', new Proxy({}, { ownKeys() { effects++; return []; } })), null);
    assert.equal(effects, 0);
    const { packageReceipt, inventoryCandidate } = await fixture();
    const requirement = inventoryCandidate.requirements.find(row => row.family === 'predicate_path_semantic'
        && row.target.fact_key === 'F-01#1#1' && row.target.predicate_id === 'p0315_selected_period');
    const { enumeratePathSemanticCandidates } = require('../../../src/next/provenance/pathMutationInventory');
    const references = enumeratePathSemanticCandidates({ inventoryCandidate, mutation_id: requirement.mutation_id }).candidates
        .map(candidate => sealPathSemanticReference({ packageReceipt, candidate }));
    assert.ok(references.some(row => row.available && row.baseline_satisfied && row.mutant_satisfied === false));
    assert.ok(references.every(row => row.financial_receipt === false));
});

test('N02G:PATH-SEMANTIC-V2-006 temporal reference reaches authored admission without crediting its refusal', async () => {
    const { packageReceipt, inventoryCandidate } = await fixture();
    const { executePathSemanticV2Batch } = await import('../../../scripts/agent/executeNextPredicateStrategyMatrix.mjs');
    const result = await executePathSemanticV2Batch({ packageReceipt, fact_keys: ['F-01#1#1'] });
    const expected = inventoryCandidate.requirements.filter(row => row.family === 'predicate_path_semantic'
        && row.target.fact_key === 'F-01#1#1');
    assert.deepEqual(result.rows.map(row => row.mutation_id).sort(), expected.map(row => row.mutation_id).sort());
    const row = result.rows.find(item => item.target.predicate_id === 'p0315_selected_period');
    assert.equal(row.generated, true);
    assert.equal(row.reference.available, true);
    assert.equal(row.reference.baseline_satisfied, true);
    assert.equal(row.reference.mutant_satisfied, false);
    assert.notEqual(row.cause, 'independent_reference_domain_pending');
    for (const item of result.rows) {
        assert.equal(item.financial_receipt, false);
        if (!item.dp_execution) assert.equal(item.matched, false);
        if (item.matched) {
            assert.equal(item.whole_compiler_admitted, true);
            assert.equal(item.outside_target_preserved, true);
            assert.equal(item.phases_covered, true);
            assert.equal(item.positive_oracle_matched, true);
            assert.deepEqual(item.observed_violations, item.expected_violations);
        }
    }
    assert.equal(result.global_g11, false);
    assert.equal(result.predicate_atom_credit, 0);
    if (process.env.FINANCASBOT_PATH_SEMANTIC_EVIDENCE === '20261004-temporal-r1')
        fs.writeFileSync(path.resolve(__dirname, '../../../.codex-temp/path-semantic-temporal-dp-focal-20261004.json'),
            JSON.stringify(result) + '\n', { flag: 'wx' });
});
```

## tests/next/provenance/phaseComposition.cases.js

SHA-256 5bfe7314a93592c6e044c794e832f421186231d0faac16986b9efeca14d150b9; Git blob 75bcc08a97b7f00af65da39c70a7e0e9a734c65a; bytes 4662.

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { admitPhaseCompositionProfile, resolvePhaseCompositionMode, phaseCompositionCommitment,
    validatePhaseArtifactInputs, REVIEWED_PROFILE_SHA256, PROFILE_PATH } = require('../../../src/next/provenance/phaseCompositionProfile');
const root = path.resolve(__dirname, '../../..');
const source = () => fs.readFileSync(path.join(root, PROFILE_PATH), 'utf8');
const registry = () => JSON.parse(fs.readFileSync(path.join(root,
    'docs/contracts/next/provenance-v2/metric-evaluator-registry-v1.json'), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));

test('N02G:PHASE-COMPOSITION-001 independently versioned exact profile rejects drift and forged receipts', () => {
    const authority = registry(); const profile = JSON.parse(source());
    const receipt = admitPhaseCompositionProfile({ source: source(), registry: authority });
    const commitment = phaseCompositionCommitment(receipt);
    assert.equal(commitment.sha256, REVIEWED_PROFILE_SHA256); assert.equal(commitment.source, source());
    assert.equal(profile.entries.length, 39); let guarded = 0;
    for (const row of profile.entries) {
        const mode = resolvePhaseCompositionMode(receipt, authority,
            { evaluator_id: row.evaluator_id, evaluator_version: row.evaluator_version }, row.metric);
        assert.equal(mode, row.derivation_mode); guarded += Number(mode === 'formula_plus_selection_guards');
        for (const field of ['evaluator_id', 'evaluator_version', 'metric', 'contract_path', 'evaluator_contract_hash']) {
            const changed = clone(authority); const entry = changed.entries.find(e => e.evaluator_id === row.evaluator_id);
            entry[field] = field === 'evaluator_version' ? entry[field] + 1 : entry[field] + '_changed';
            assert.throws(() => admitPhaseCompositionProfile({ source: source(), registry: changed }), /phase_profile_registry_identity/);
        }
    }
    assert.equal(guarded, 7);
    const mutations = [p => p.entries.pop(), p => p.entries.push(clone(p.entries[0])),
        p => { p.entries[0].derivation_mode = 'formula_only'; },
        p => { p.entries[1].derivation_mode = 'unknown'; }, p => p.profile_version++,
        p => { p.entries[0].evaluator_contract_hash = 'sha256:' + '0'.repeat(64); }];
    for (const mutate of mutations) { const changed = clone(profile); mutate(changed);
        assert.throws(() => admitPhaseCompositionProfile({ source: JSON.stringify(changed, null, 2) + '\n', registry: authority }),
            /phase_profile_reviewed_content_mismatch/); }
    for (const mutate of [r => r.entries.pop(), r => r.entries.push(clone(r.entries[0])),
        r => { r.entries[1] = clone(r.entries[0]); }]) {
        const changed = clone(authority); mutate(changed);
        assert.throws(() => admitPhaseCompositionProfile({ source: source(), registry: changed }), /phase_profile_(inventory|duplicate)/);
    }
    const changedRoles = clone(authority); changedRoles.entries[0].roles.reverse();
    assert.throws(() => resolvePhaseCompositionMode(receipt, changedRoles, authority.entries[0], authority.entries[0].metric), /phase_profile_registry_mismatch/);
    assert.throws(() => resolvePhaseCompositionMode({}, authority, authority.entries[0], authority.entries[0].metric), /phase_profile_receipt/);
    assert.throws(() => resolvePhaseCompositionMode(receipt, authority, authority.entries[0], 'unknown'), /phase_profile_identity/);
    assert.throws(() => admitPhaseCompositionProfile({ source: source(), registry: authority, expected_trace: [] }), /phase_profile_shape/);
    let effects = 0;
    assert.throws(() => admitPhaseCompositionProfile({ get source() { effects++; return source(); }, registry: authority }), /observation_shape_invalid/);
    assert.equal(effects, 0);
    const artifact = { kind: 'proof', entry: 'bundle.js', files: [
        { path: 'bundle.js', media_type: 'text/javascript', observed_sha256: 'sha256:' + '0'.repeat(64) },
        { path: PROFILE_PATH, media_type: 'application/json', observed_sha256: REVIEWED_PROFILE_SHA256 }] };
    assert.doesNotThrow(() => validatePhaseArtifactInputs(artifact));
    for (const mutate of [a => { a.kind = 'metric'; }, a => { a.files[1].path = 'payload.json'; },
        a => { a.files[1].observed_sha256 = 'sha256:' + '0'.repeat(64); }, a => a.files.push(clone(a.files[1]))]) {
        const changed = clone(artifact); mutate(changed);
        assert.throws(() => validatePhaseArtifactInputs(changed), /phase_profile_artifact_inputs/);
    }
});
```

## tests/next/provenance/selectionBindings.cases.js

SHA-256 31c927998c85716b144a7726a4f3aa17b2a044de74d47ef1f151e6773153ec99; Git blob 0ba9fea248017e9ee68ff7e8a0ffd41047762115; bytes 7155.

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateSelectionBindings } = require('../../../src/next/provenance/selectionBindings');
const read = file => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8'));
function fixture() {
    const d = read('docs/contracts/next/provenance-v2/graphs-v2.json');
    return { graphs: d.graphs, claims: read(d.claim_contract.path).claims, materialRegistry: read(d.material_registry.path) };
}
function reject(mutate, pattern) {
    const f = fixture(); mutate(f.graphs[0], f);
    assert.throws(() => validateSelectionBindings(f), pattern);
}

test('N02G:SELECTION-BINDINGS-001 all 73 selections bind reasons and input guards', () => {
    const result = validateSelectionBindings(fixture());
    assert.equal(result.stage, 'selection_bindings_checked_only');
    assert.equal(result.graphs, 76);
    assert.equal(result.selections, 73);
    assert.ok(result.stateChecks.some(check => check.fact_key === 'M-14#1#2'
        && check.node === 'bill_rent_b' && check.field === 'evidence_state' && check.expected === 'confirmed'));
    assert.ok(Object.isFrozen(result.stateChecks));
});

test('N02G:SELECTION-BINDINGS-011 native concern diagnostics distinguish selected predicate member coverage and excluded reason without accepting labels', () => {
    const { readSelectionBindingDiagnostic } = require('../../../src/next/provenance/selectionBindings');
    const mutations = [
        f => {
            const g = f.graphs[0], selection = g.selections[0];
            const excluded = selection.excluded.find(row => row.reason === 'state');
            selection.selected_predicates.push(excluded.predicates[0]);
            return { checker: 'selection_bindings', fact_key: g.fact_key, predicate_id: excluded.predicates[0],
                selection_index: 0, mode: 'included_predicate_concerns_selected_member', node: null };
        },
        f => {
            const g = f.graphs[0], selection = g.selections[0];
            selection.selected_predicates = [];
            return { checker: 'selection_bindings', fact_key: g.fact_key, predicate_id: null, selection_index: 0,
                mode: 'selected_member_retains_authored_reason', node: g.sets[selection.selected_set][0] };
        },
        f => {
            const g = f.graphs[0], selection = g.selections[0];
            const [a, b] = selection.excluded.filter(row => row.reason === 'state');
            a.predicates = [...b.predicates];
            return { checker: 'selection_bindings', fact_key: g.fact_key, predicate_id: b.predicates[0], selection_index: 0,
                mode: 'excluded_reason_concerns_own_candidate', node: a.node };
        }
    ];
    for (const mutate of mutations) {
        const f = fixture(), expected = mutate(f);
        let thrown;
        try { validateSelectionBindings(f); } catch (error) { thrown = error; }
        assert.ok(thrown);
        assert.deepEqual(readSelectionBindingDiagnostic(thrown), expected);
        assert.equal(readSelectionBindingDiagnostic(new Error(thrown.message)), null);
        assert.equal(readSelectionBindingDiagnostic({ message: thrown.message, ...expected }), null);
        assert.ok(Object.isFrozen(readSelectionBindingDiagnostic(thrown)));
    }
    let effects = 0;
    assert.equal(readSelectionBindingDiagnostic(new Proxy({}, { get() { effects++; return true; } })), null);
    assert.equal(effects, 0);
});

test('N02G:SELECTION-BINDINGS-002 another candidate proof cannot justify an exclusion', () => {
    reject(g => {
        const excluded = g.selections[0].excluded;
        const a = excluded.find(x => x.reason === 'state');
        const b = excluded.find(x => x.reason === 'state' && x.node !== a.node);
        a.predicates = [...b.predicates];
    }, /selection_binding_candidate/);
});

test('N02G:SELECTION-BINDINGS-003 exclusion reason must agree with predicate obligation', () => {
    reject(g => { g.selections[0].excluded.find(x => x.reason === 'state').reason = 'period'; }, /selection_binding_reason/);
    reject(g => { g.selections[0].excluded[0].predicates = [g.predicates.find(p => p.op === 'fingerprint_is').id]; }, /selection_binding_reason/);
});

test('N02G:SELECTION-BINDINGS-004 no selected candidate can lose its evidence state guard', () => {
    reject(g => {
        const s = g.selections[0];
        const id = s.selected_predicates.find(id => g.predicates.find(p => p.id === id).op === 'state_is');
        s.selected_predicates = s.selected_predicates.filter(p => p !== id);
    }, /selection_binding_state_guard/);
});

test('N02G:SELECTION-BINDINGS-005 estimated output requires explicit input state even with correct guards', () => {
    reject((_g, f) => {
        const g = f.graphs.find(g => g.selections.some(s => s.input_evidence_state));
        delete g.selections[0].input_evidence_state;
    }, /selection_binding_input_state/);
    reject((_g, f) => {
        const g = f.graphs.find(g => g.selections.some(s => s.input_evidence_state));
        g.selections[0].input_evidence_state = 'projected';
    }, /selection_binding_state_guard/);
});

test('N02G:SELECTION-BINDINGS-006 a state exclusion must compare against the same expected input state', () => {
    reject(g => {
        const s = g.selections[0];
        const id = s.excluded.find(x => x.reason === 'state').predicates[0];
        g.predicates.find(p => p.id === id).args[1].literal.value = 'projected';
    }, /selection_binding_state_guard/);
});

test('N02G:SELECTION-BINDINGS-007 selected predicates cannot point exclusively at excluded nodes', () => {
    reject(g => {
        const s = g.selections[0];
        const id = s.excluded.find(x => x.reason === 'state').predicates[0];
        s.selected_predicates.push(id);
    }, /selection_binding_selected/);
});

test('N02G:SELECTION-BINDINGS-008 period exclusion must quantify the excluded candidate', () => {
    reject((_g, f) => {
        const g = f.graphs.find(g => g.selections.some(s => s.excluded.some(x => x.reason === 'period')));
        const e = g.selections[0].excluded.find(x => x.reason === 'period');
        const p = g.predicates.find(p => p.id === e.predicates[0]);
        p.args[0] = { set: g.selections[0].selected_set };
    }, /selection_binding_candidate/);
});

test('N02G:SELECTION-BINDINGS-009 inherited category requires the compensated-event edge', () => {
    reject((_g, f) => {
        const g = f.graphs.find(g => g.fact_key === 'S-03#1#1');
        g.edges = g.edges.filter(e => !(e.source === 'evt_refund_b' && e.field === 'compensates'));
    }, /selection_binding_candidate/);
});

test('N02G:SELECTION-BINDINGS-010 generic evidence quality checks require their own material read', () => {
    reject((_g, f) => {
        const g = f.graphs.find(g => g.fact_key === 'M-14#1#2');
        g.trace_contract.proof.required_reads = g.trace_contract.proof.required_reads.filter(r =>
            !(r.node === 'bill_rent_b' && r.segments[0] === 'evidence_state'));
    }, /selection_binding_state_read/);
});
```

## tests/next/provenance/unknownPathAdmission.cases.js

SHA-256 258a172e322772468cdf789bc44f8b512037ce81f916a3fee74256088ff1f59d; Git blob 2adb542e1022ec32ade25a4de9aa9d8d16943850; bytes 13998.

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
const { materializeUnknownPredicatePath } = require('../../../src/next/provenance/mutationWitnesses');
const { compilePredicateTypes, readPredicateTypeDiagnostic } = require('../../../src/next/provenance/predicateTypes');
const prefix = 'docs/contracts/next/provenance-v2/';

test('N02G:UNKNOWN-PATH-006 every template coordinate preserves bindings and rejects only the mutated native path', async () => {
    const { loadLocalAuthoringPackage } = await import('../../../scripts/agent/executeNextDomainInvariantMatrix.mjs');
    const { validateTemplateReferences, readTemplateReferenceDiagnostic } = require('../../../src/next/provenance/templateReferences');
    const receipt = loadLocalAuthoringPackage();
    const docs = new Map(admittedDocuments(receipt).map(row => [row.path, row.value]));
    const corpus = docs.get(prefix + 'graphs-v2.json');
    const context = { templates: docs.get(prefix + 'predicate-templates-v1.json'),
        operators: docs.get(corpus.operator_registry.path).operators,
        materialRegistry: docs.get(corpus.material_registry.path),
        claims: docs.get(corpus.claim_contract.path).claims };
    let coordinates = 0;
    for (const graph of corpus.graphs) for (const predicate of graph.predicates)
        for (let operand_index = 0; operand_index < predicate.args.length; operand_index++) {
            const original = predicate.args[operand_index];
            if (!original.template) continue;
            const names = Object.keys(original.bindings).filter(name => original.bindings[name].selector).sort();
            assert.ok(names.length > 0);
            const binding_name = names[0];
            const expectedDiagnostic = Object.freeze({ checker: 'template_references', code: 'binding_field',
                fact_key: graph.fact_key, predicate_id: predicate.id, operand_index, binding_name });
            const generated = materializeUnknownPredicatePath({ packageReceipt: receipt, fact_key: graph.fact_key,
                predicate_id: predicate.id, operand_index });
            const expected = structuredClone(graph);
            const location = ['bindings', binding_name, 'selector', 'segments'];
            const after = [...original.bindings[binding_name].selector.segments.slice(0, -1),
                'unknown_' + generated.mutation_id.slice(7, 23)];
            expected.predicates.find(row => row.id === predicate.id).args[operand_index]
                .bindings[binding_name].selector.segments = after;
            assert.deepEqual(generated.graph, expected);
            assert.deepEqual(generated.patch.location, location);
            assert.equal(validateTemplateReferences({ ...context, graphs: [graph] }).stage, 'template_references_checked_only');
            let error;
            try { validateTemplateReferences({ ...context, graphs: [generated.graph] }); } catch (caught) { error = caught; }
            assert.ok(error);
            assert.deepEqual(readTemplateReferenceDiagnostic(error), expectedDiagnostic);
            assert.equal(readTemplateReferenceDiagnostic(new Error(error.message)), null);
            assert.notDeepEqual(readTemplateReferenceDiagnostic(error), { ...expectedDiagnostic, operand_index: operand_index + 1 });
            assert.deepEqual(generated.graph.predicates.find(row => row.id === predicate.id).args[operand_index].template, original.template);
            assert.equal(generated.semantic_mutation_credit, 0);
            coordinates++;
        }
    assert.equal(coordinates, 28);
});

test('N02G:UNKNOWN-PATH-001 path negatives preserve the operand form and expose an authentic coordinate diagnostic', async () => {
    const { loadLocalAuthoringPackage } = await import('../../../scripts/agent/executeNextDomainInvariantMatrix.mjs');
    const receipt = loadLocalAuthoringPackage();
    const docs = new Map(admittedDocuments(receipt).map(row => [row.path, row.value]));
    const corpus = docs.get(prefix + 'graphs-v2.json');
    const context = { claims: docs.get(corpus.claim_contract.path).claims,
        snapshots: docs.get(corpus.snapshot_manifest.path).snapshots,
        materialRegistry: docs.get(corpus.material_registry.path),
        operatorRegistry: docs.get(corpus.operator_registry.path),
        claimSchema: docs.get(prefix + 'claim-contract.schema.json') };
    const original = corpus.graphs.find(row => row.fact_key === 'F-01#1#1');
    const target = original.predicates.find(row => row.args.some(arg => arg.field));
    const operand_index = target.args.findIndex(arg => arg.field);
    const request = { packageReceipt: receipt, fact_key: original.fact_key, predicate_id: target.id, operand_index };
    const generated = materializeUnknownPredicatePath(request);
    const expected = structuredClone(original);
    expected.predicates.find(row => row.id === target.id).args[operand_index].field.segments = generated.patch.after;
    assert.deepEqual(generated.graph, expected);
    assert.deepEqual(materializeUnknownPredicatePath(request), generated);
    assert.equal(generated.dp_execution, false);
    assert.equal(generated.semantic_mutation_credit, 0);
    assert.equal(Object.hasOwn(generated, 'expected_violations'), false);
    assert.equal(compilePredicateTypes({ ...context, graphs: [original] }).unresolved, 0);
    let observed;
    try { compilePredicateTypes({ ...context, graphs: [generated.graph] }); } catch (error) { observed = error; }
    assert.ok(observed);
    assert.deepEqual(readPredicateTypeDiagnostic(observed), {
        checker: 'predicate_types', code: 'field_material', fact_key: original.fact_key,
        predicate_id: target.id, operand_index });
    assert.equal(readPredicateTypeDiagnostic(new Error(observed.message)), null);
    assert.equal(readPredicateTypeDiagnostic({ message: observed.message, code: 'field_material' }), null);
    assert.deepEqual(corpus.graphs.find(row => row.fact_key === original.fact_key), original);
    const literal = original.predicates.find(row => row.args.some(arg => arg.literal));
    assert.throws(() => materializeUnknownPredicatePath({ ...request, predicate_id: literal.id,
        operand_index: literal.args.findIndex(arg => arg.literal) }), /unknown_path_form/);
    let effects = 0;
    const active = { ...request };
    Object.defineProperty(active, 'packageReceipt', { enumerable: true, get() { effects++; return receipt; } });
    assert.throws(() => materializeUnknownPredicatePath(active));
    assert.throws(() => materializeUnknownPredicatePath(new Proxy(request, { ownKeys() { effects++; return []; } })));
    assert.throws(() => materializeUnknownPredicatePath({ ...request, packageReceipt: { ...receipt } }));
    assert.equal(effects, 0);
});

test('N02G:UNKNOWN-PATH-002 each supported path form has its own diagnostic and restore control', async () => {
    const { loadLocalAuthoringPackage } = await import('../../../scripts/agent/executeNextDomainInvariantMatrix.mjs');
    const receipt = loadLocalAuthoringPackage();
    const docs = new Map(admittedDocuments(receipt).map(row => [row.path, row.value]));
    const corpus = docs.get(prefix + 'graphs-v2.json');
    const context = { claims: docs.get(corpus.claim_contract.path).claims,
        snapshots: docs.get(corpus.snapshot_manifest.path).snapshots,
        materialRegistry: docs.get(corpus.material_registry.path),
        operatorRegistry: docs.get(corpus.operator_registry.path),
        claimSchema: docs.get(prefix + 'claim-contract.schema.json') };
    for (const form of ['field', 'claim', 'presence', 'selector', 'ref_set']) {
        let coordinate;
        for (const graph of corpus.graphs) {
            const predicate = graph.predicates.find(row => row.args.some(arg => form === 'ref_set' ? arg.ref_set?.field : arg[form]));
            if (predicate) { coordinate = { graph, predicate, index: predicate.args.findIndex(arg => form === 'ref_set' ? arg.ref_set?.field : arg[form]) }; break; }
        }
        assert.ok(coordinate, form);
        const { graph, predicate, index } = coordinate;
        const generated = materializeUnknownPredicatePath({ packageReceipt: receipt, fact_key: graph.fact_key,
            predicate_id: predicate.id, operand_index: index });
        let error;
        try { compilePredicateTypes({ ...context, graphs: [generated.graph] }); } catch (caught) { error = caught; }
        assert.deepEqual(readPredicateTypeDiagnostic(error), { checker: 'predicate_types',
            code: form === 'claim' ? 'claim_path' : 'field_material',
            fact_key: graph.fact_key, predicate_id: predicate.id, operand_index: index }, form);
        assert.equal(compilePredicateTypes({ ...context, graphs: [graph] }).unresolved, 0, 'restore ' + form);
        const wrong = { ...readPredicateTypeDiagnostic(error), operand_index: index + 1 };
        assert.notDeepEqual(readPredicateTypeDiagnostic(error), wrong);
    }
});

test('N02G:UNKNOWN-PATH-003 scoped matrix rejects active and forged receipt verdicts', async () => {
    const { executeUnknownPathAdmissionMatrix } = await import('../../../scripts/agent/executeUnknownPathAdmissionMatrix.mjs');
    let effects = 0;
    const active = {};
    Object.defineProperty(active, 'documents', { enumerable: true, get() { effects++; throw new Error('effect'); } });
    const proxy = new Proxy({}, { get() { effects++; throw new Error('effect'); }, ownKeys() { effects++; throw new Error('effect'); } });
    for (const receipt of [{}, active, proxy, { valid: true, matched: true, expected: 0 }])
        assert.throws(() => executeUnknownPathAdmissionMatrix(receipt));
    assert.equal(effects, 0);
});

test('N02G:UNKNOWN-PATH-004 unknown references preserve their namespace and hit the owning operand', async () => {
    const { loadLocalAuthoringPackage } = await import('../../../scripts/agent/executeNextDomainInvariantMatrix.mjs');
    const receipt = loadLocalAuthoringPackage();
    const docs = new Map(admittedDocuments(receipt).map(row => [row.path, row.value]));
    const corpus = docs.get(prefix + 'graphs-v2.json');
    const context = { claims: docs.get(corpus.claim_contract.path).claims,
        snapshots: docs.get(corpus.snapshot_manifest.path).snapshots,
        materialRegistry: docs.get(corpus.material_registry.path),
        operatorRegistry: docs.get(corpus.operator_registry.path),
        claimSchema: docs.get(prefix + 'claim-contract.schema.json') };
    for (const form of ['node', 'edge', 'set', 'period_ref', 'period_bound']) {
        let coordinate;
        for (const graph of corpus.graphs) {
            const predicate = graph.predicates.find(row => row.args.some(arg => Object.hasOwn(arg, form)));
            if (predicate) { coordinate = { graph, predicate, index: predicate.args.findIndex(arg => Object.hasOwn(arg, form)) }; break; }
        }
        assert.ok(coordinate);
        const { graph, predicate, index } = coordinate;
        const generated = materializeUnknownPredicatePath({ packageReceipt: receipt,
            fact_key: graph.fact_key, predicate_id: predicate.id, operand_index: index });
        const changed = generated.graph.predicates.find(row => row.id === predicate.id).args[index];
        assert.deepEqual(Object.keys(changed), Object.keys(predicate.args[index]));
        if (form === 'period_bound') assert.equal(changed.period_bound.bound, predicate.args[index].period_bound.bound);
        let error;
        try { compilePredicateTypes({ ...context, graphs: [generated.graph] }); } catch (caught) { error = caught; }
        const code = form === 'node' ? 'node_missing' : form === 'edge' ? 'edge_missing'
            : form === 'set' ? ['set_eq', 'set_subset'].includes(predicate.op) ? 'set_missing' : 'set_kind_unresolved'
            : 'window_missing';
        assert.deepEqual(readPredicateTypeDiagnostic(error), { checker: 'predicate_types', code,
            fact_key: graph.fact_key, predicate_id: predicate.id, operand_index: index }, form);
        assert.equal(compilePredicateTypes({ ...context, graphs: [graph] }).unresolved, 0);
        assert.equal(readPredicateTypeDiagnostic(new Error(error.message)), null);
    }
});

test('N02G:UNKNOWN-PATH-005 template set inference attributes the absent set to its own operand', async () => {
    const { loadLocalAuthoringPackage } = await import('../../../scripts/agent/executeNextDomainInvariantMatrix.mjs');
    const receipt = loadLocalAuthoringPackage();
    const docs = new Map(admittedDocuments(receipt).map(row => [row.path, row.value]));
    const corpus = docs.get(prefix + 'graphs-v2.json');
    const graph = corpus.graphs.find(row => row.fact_key === 'S-05#1#1');
    const predicate = graph.predicates.find(row => row.id === 'r0006_outside_window');
    const index = predicate.args.findIndex(arg => arg.set);
    assert.ok(predicate.args.some(arg => arg.template && Object.values(arg.bindings).some(binding => binding.selector)));
    const generated = materializeUnknownPredicatePath({ packageReceipt: receipt, fact_key: graph.fact_key,
        predicate_id: predicate.id, operand_index: index });
    const context = { claims: docs.get(corpus.claim_contract.path).claims,
        snapshots: docs.get(corpus.snapshot_manifest.path).snapshots,
        materialRegistry: docs.get(corpus.material_registry.path),
        operatorRegistry: docs.get(corpus.operator_registry.path),
        claimSchema: docs.get(prefix + 'claim-contract.schema.json') };
    let error;
    try { compilePredicateTypes({ ...context, graphs: [generated.graph] }); } catch (caught) { error = caught; }
    assert.deepEqual(readPredicateTypeDiagnostic(error), { checker: 'predicate_types', code: 'set_missing',
        fact_key: graph.fact_key, predicate_id: predicate.id, operand_index: index });
    assert.equal(compilePredicateTypes({ ...context, graphs: [graph] }).unresolved, 0);
});
```

## tests/next/provenance/validationTcb.cases.js

SHA-256 0426f4c8e249d4d7966864c98c87339fe6220321827b4060f1bebb55486b8ffb; Git blob 295663c589e44890c0bb287b5e78393fe467f9e6; bytes 8258.

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const { admitArtifact, artifactContents } = require('../../../src/next/provenance/artifactLoader');
const { admitPackage, admittedDocuments } = require('../../../src/next/provenance/packageContract');
const hash = source => `sha256:${createHash('sha256').update(source).digest('hex')}`;

test('N02G:VALIDATION-TCB-001 captured host/compiler/schema closure executes without ambient project requires', async () => {
    const { buildCapturedValidationTools } = await import('../../../scripts/agent/buildNextValidationTcb.mjs');
    const built = buildCapturedValidationTools();
    assert.equal(built.validation_tcb_complete, false); assert.equal(built.financial_acceptance, false);
    assert.equal(built.hostSourceHashes.length, 56);
    assert.equal(new Set(built.hostSourceHashes.map(row => row.path)).size, 56);
    assert.equal(built.hostSourceHashes.some(row => row.path === 'kernel/canonicalJson.js'), false);
    for (const required of ['provenance/executionHost.js', 'provenance/graphCompiler.js', 'provenance/proofAcceptance.js',
        'provenance/causalRecorder.js', 'provenance/claimMonthPathProfile.js', 'provenance/claimRequirementCore.js',
        'provenance/claimNominalTypes.js', 'provenance/claimMonthIsolatedProfile.js', 'provenance/claimMonthProofConformance.js',
        'provenance/claimMonthTraceContract.js', 'provenance/phaseProgramIdentity.js',
        'vendor/acorn.js', 'vendor/schemaValidators.js', 'vendor/formats.js', 'vendor/ajvEqual.js',
        'vendor/ucs2length.js', 'vendor/fastDeepEqual.js', 'provenance/freezeContract.js', 'provenance/nativeRuntime.js', 'provenance/financialHost.js']) assert.ok(built.hostSourceHashes.some(row => row.path === required));
    const entries = built.entries.map(row => ({ path: row.path, bytes: Buffer.from(row.source) }));
    const tcbReceipt = admitArtifact({ manifestBytes: Buffer.from(built.manifest), expectedRoot: built.artifact_root, entries });
    for (const row of entries) row.bytes.fill(0);
    const host = artifactContents(tcbReceipt).files.find(row => row.path === 'host-bootstrap.js');
    const nativeCalls = [];
    const tools = vm.runInThisContext(`(function(require){ return ${host.source}\n})`)(specifier => {
        assert.ok(built.nativeExternals.includes(specifier)); nativeCalls.push(specifier); return require(specifier);
    });
    assert.equal(tools.stage, 'captured_validation_tools_only'); assert.equal(tools.financial_acceptance, false);
    assert.notEqual(tools.runAdmittedGraph, require('../../../src/next/provenance/executionHost').runAdmittedGraph);
    assert.notEqual(tools.comparePhaseCoverage, require('../../../src/next/provenance/proofAcceptance').comparePhaseCoverage);
    const packageBytes = Buffer.from('{}');
    const packageInput = { entries: [{ path: 'docs/sample.json', bytes: packageBytes }],
        authority: [{ path: 'docs/sample.json', sha256: hash(packageBytes) }] };
    const capturedPackage = tools.admitPackage(packageInput);
    assert.throws(() => admittedDocuments(capturedPackage), /package_/);
    assert.throws(() => tools.compileAuthoringIR(admitPackage(packageInput)), /package_/);
    // Separate opaque receipt tables ensure these calls did not route back to
    // ambient require-cache code while measuring different filesystem bytes.
    const artifact = (source, kind) => {
        const bytes = Buffer.from(source); const manifestBytes = Buffer.from(canonicalValue({
            format: 'financasbot.provenance.artifact', version: 1, kind, entry: 'bundle.js',
            files: [{ path: 'bundle.js', media_type: 'text/javascript', sha256: hash(bytes) }] }));
        return tools.admitArtifact({ manifestBytes, expectedRoot: hash(manifestBytes), entries: [{ path: 'bundle.js', bytes }] });
    };
    const metric = artifact('(function(operands){return {unit:"count",kind:"nonnegative_integer",value:operands.source.get("count")};})', 'metric');
    const proof = artifact('(function(operands){return operands.node("input").get("count")===7;})', 'proof');
    const childCapsuleReceipt = tools.admitArtifact({ manifestBytes: Buffer.from(built.child.manifest), expectedRoot: built.child.artifact_root,
        entries: [{ path: 'bootstrap.js', bytes: Buffer.from(built.child.source) }] });
    const freezeBytes = Buffer.from(canonicalValue({ schema_version: 1, freeze_id: 'provenance_execution', freeze_version: 1,
        stage: 'execution', metric_registry_hash: hash('synthetic-registry'), validation_tcb_root: built.artifact_root,
        child_capsule_root: built.child.artifact_root, native_runtime: { platform: process.platform, arch: process.arch,
            node_version: process.version, node_binary_sha256: hash(require('node:fs').readFileSync(process.execPath)) },
        package_authority: [{ path: 'docs/sample.json', sha256: hash(packageBytes) }],
        proof_programs: [{ program_id: hash('synthetic-program'), proof_engine_artifact_root: proof.observed_root }] }));
    const freezeReceipt = tools.admitExecutionFreeze({ bytes: freezeBytes, expectedHash: hash(freezeBytes) });
    const nativeRuntimeReceipt = tools.verifyNativeRuntime(freezeReceipt);
    const binding = { alias: 'input', role: 'source', value: { count: 7 },
        shape: { type: 'record', fields: { count: { type: 'scalar' } } } };
    const result = await tools.runAdmittedGraph({ executionId: 'captured-tcb', invocationId: 'synthetic-graph', timeoutMs: 2000,
        childCapsuleReceipt, nativeRuntimeReceipt, derivation: { artifactReceipt: metric, bindings: [binding] },
        proof: { artifactReceipt: proof, bindings: [{ ...binding, role: 'proof/snapshot' }] } });
    assert.equal(result.functional_result.value, 7); assert.equal(result.proof_satisfied, true);
    assert.equal(result.graph_accepted, false); assert.equal(result.observed_child_capsule_root, built.child.artifact_root);
    assert.equal(result.trace.derivation_trace.filter(row => row.operation === 'get').length, 1);
    assert.equal(result.trace.proof_trace.filter(row => row.operation === 'get').length, 1);
    await assert.rejects(tools.runAdmittedGraph({ executionId: 'captured-tcb', invocationId: 'forged-native', timeoutMs: 2000,
        childCapsuleReceipt, nativeRuntimeReceipt: { ...nativeRuntimeReceipt }, derivation: { artifactReceipt: metric, bindings: [binding] },
        proof: { artifactReceipt: proof, bindings: [{ ...binding, role: 'proof/snapshot' }] } }), /native_runtime_not_admitted/);
    assert.deepEqual([...new Set(nativeCalls)].sort(), built.nativeExternals);
    assert.throws(() => tools.comparePhaseCoverage({}), /trace_coverage_/);
});

test('N02G:VALIDATION-TCB-002 privileged native edges require exact declarations and never enter guest bundles', async () => {
    const { buildTrustedCommonJsBundle, buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const sources = [{ path: 'host.js', source: "const child = require('node:child_process'); module.exports={run:()=>true};" }];
    const input = { sources, entry: 'host.js', exportName: 'run' };
    assert.throws(() => buildTrustedCommonJsBundle(input), /guest_bundle_external_import/);
    const nativeImports = [{ source: 'host.js', specifier: 'node:child_process' }];
    const built = buildTrustedCommonJsBundle({ ...input, nativeImports });
    assert.deepEqual(built.nativeExternals, ['node:child_process']);
    assert.throws(() => buildCommonJsGuestBundle({ ...input, nativeImports }), /guest_bundle_native_imports/);
    for (const declarations of [[...nativeImports, ...nativeImports], [{ source: 'unknown.js', specifier: 'node:child_process' }],
        [{ source: 'host.js', specifier: 'node:fs' }]]) {
        assert.throws(() => buildTrustedCommonJsBundle({ ...input, nativeImports: declarations }), /guest_bundle_native_imports/);
    }
    assert.throws(() => buildTrustedCommonJsBundle({ ...input, nativeImports: [...nativeImports, { source: 'host.js', specifier: 'node:path' }] }), /guest_bundle_unused_native_import/);
});
```

## tests/next02DevelopmentInventory.test.js

SHA-256 854f1716ceb89b9c3bf26ffab3b84493cc569ec7c37027cfb3c2e423b9e91c52; Git blob f7a5d25fff6c2179be84228acdd6b108a221524b; bytes 7958.

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const policy = require('../scripts/agent/financasBotNext02ValidationPolicy');
const prior = require('../scripts/agent/financasBotNext01ValidationPolicy');
const sourceRoot = path.resolve(__dirname, '../src/next');
const selectedDayPending = Object.freeze([
    'selectedEventDayAdjudicator.js', 'selectedEventDayCoreComparison.js', 'selectedEventDayCoverage.js',
    'selectedEventDayDerivationOperands.js', 'selectedEventDayDispatchCore.js', 'selectedEventDayDispatcher.js',
    'selectedEventDayExecutionTicket.js', 'selectedEventDayIrContract.js', 'selectedEventDayLauncher.js',
    'selectedEventDayOracle.js', 'selectedEventDayPacket.js', 'selectedEventDayProfile.js',
    'selectedEventDayProofChild.cjs', 'selectedEventDayProofHost.js', 'selectedEventDayProofOperands.js',
    'selectedEventDayProofProtocol.js'
].map(file => 'provenance/' + file));

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'next02-dev-inventory-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.cpSync(sourceRoot, root, { recursive: true });
    return root;
}

test('development inventory preserves reviewed hashes and reports pending sources without release approval', () => {
    const result = policy.inspectDevelopmentSources(sourceRoot, 'N02-E');
    assert.deepEqual(result.errors, []);
    assert.equal(result.reviewedSourceMatches, 15);
    assert.equal(result.releaseEligible, false);
    assert.equal(result.scope, 'development-regression');
    assert.equal(result.pendingReviewPaths.length, 81);
    assert.equal(new Set(result.pendingReviewPaths).size, 81);
    for (const file of result.pendingReviewPaths) assert.equal(Object.hasOwn(prior.REVIEWED_SOURCE_SHA256, file), false);
    assert.ok(result.pendingReviewPaths.includes('kernel/canonicalJson.js'));
    assert.ok(result.pendingReviewPaths.includes('provenance/executionHostChild.cjs'));
    assert.ok(result.pendingReviewPaths.includes('provenance/claimMonthIsolatedProfile.js'));
    assert.ok(result.pendingReviewPaths.includes('provenance/metricReferences.js'));
    assert.equal(Object.hasOwn(prior.REVIEWED_SOURCE_SHA256, 'provenance/metricReferences.js'), false);
    assert.deepEqual(Object.keys(prior.REVIEWED_SOURCE_SHA256).sort(),
        [...policy.sliceContract('N02-E').paths].sort());
    assert.deepEqual(policy.inspectSources(sourceRoot, 'N02-E').errors,
        result.pendingReviewPaths.map(file => 'unexpected_executable_source:' + file));
});

test('development inventory rejects extra files, missing candidates and redirected source entries', t => {
    const root = fixture(t);
    for (const relative of ['provenance/extra.js', 'provenance/extra.node', 'unexpected.json']) {
        const file = path.join(root, relative);
        fs.writeFileSync(file, '');
        assert.ok(policy.inspectDevelopmentSources(root, 'N02-E').errors
            .includes('unexpected_executable_source:' + relative));
        fs.unlinkSync(file);
    }
    const candidate = path.join(root, 'provenance/civilCalendar.js');
    fs.unlinkSync(candidate);
    assert.ok(policy.inspectDevelopmentSources(root, 'N02-E').errors
        .includes('missing_executable_source:provenance/civilCalendar.js'));
    fs.copyFileSync(path.join(sourceRoot, 'provenance/civilCalendar.js'), candidate);
    const provenance = path.join(root, 'provenance');
    fs.renameSync(provenance, path.join(root, 'saved-provenance'));
    fs.symlinkSync(path.join(root, 'saved-provenance'), provenance, 'junction');
    const redirected = policy.inspectDevelopmentSources(root, 'N02-E');
    assert.ok(redirected.errors.includes('unexpected_source_entry_type:provenance:other'));
    assert.equal(redirected.releaseEligible, false);
});

test('development inventory rejects changed reviewed bytes and imports into pending sources', t => {
    const root = fixture(t);
    const relative = 'contracts/reuseManifest.js';
    const file = path.join(root, relative);
    const source = fs.readFileSync(file, 'utf8');
    for (const suffix of ['\nvoid 42;\n', "\nrequire('../provenance/civilCalendar');\n",
        "\nrequire('../provenance/selectedEventDayLauncher');\n"]) {
        fs.writeFileSync(file, source + suffix);
        const result = policy.inspectDevelopmentSources(root, 'N02-E');
        assert.ok(result.errors.includes('reviewed_source_mismatch:' + relative));
        assert.equal(result.releaseEligible, false);
        if (suffix.includes('require')) {
            const target = suffix.includes('selectedEventDayLauncher') ? 'selectedEventDayLauncher' : 'civilCalendar';
            assert.ok(result.errors.includes('relative_import_target_not_in_inventory:' + relative + ':../provenance/' + target));
        }
    }
});

test('selected-day development inventory is explicit pending-only and every omitted path remains an error', t => {
    const root = fixture(t);
    const clean = policy.inspectDevelopmentSources(root, 'N02-E');
    assert.deepEqual(clean.errors, []);
    assert.equal(clean.releaseEligible, false);
    assert.equal(clean.reviewedSourceMatches, 15);
    for (const relative of selectedDayPending) {
        assert.ok(clean.pendingReviewPaths.includes(relative));
        assert.equal(Object.hasOwn(prior.REVIEWED_SOURCE_SHA256, relative), false);
        assert.ok(policy.inspectSources(root, 'N02-E').errors.includes('unexpected_executable_source:' + relative));
        const file = path.join(root, relative), bytes = fs.readFileSync(file);
        fs.unlinkSync(file);
        assert.ok(policy.inspectDevelopmentSources(root, 'N02-E').errors.includes('missing_executable_source:' + relative));
        fs.writeFileSync(file, bytes);
    }
    const candidate = path.join(root, 'provenance/selectedEventDayLauncher.js');
    fs.appendFileSync(candidate, '\nvoid 42;\n');
    const changed = policy.inspectDevelopmentSources(root, 'N02-E');
    assert.deepEqual(changed.errors, []);
    assert.equal(changed.releaseEligible, false);
    assert.equal(changed.reviewedSourceMatches, 15);
    assert.ok(policy.inspectSources(root, 'N02-E').errors.includes('unexpected_executable_source:provenance/selectedEventDayLauncher.js'));
});

test('development inventory does not promote pending bytes to reviewed sources', t => {
    const root = fixture(t);
    fs.appendFileSync(path.join(root, 'provenance/civilCalendar.js'), '\nvoid 42;\n');
    const result = policy.inspectDevelopmentSources(root, 'N02-E');
    assert.deepEqual(result.errors, []);
    assert.equal(result.reviewedSourceMatches, 15);
    assert.equal(result.releaseEligible, false);
    assert.ok(result.pendingReviewPaths.includes('provenance/civilCalendar.js'));
    assert.ok(policy.inspectSources(root, 'N02-E').errors.length > 0);
});

test('path-v3 development candidates are explicit pending-only and omission never implies review', t => {
    const root = fixture(t);
    const pending = ['provenance/pathQualificationV3.js', 'provenance/pathLocatorDomainV3.js'];
    const result = policy.inspectDevelopmentSources(root, 'N02-E');
    assert.deepEqual(result.errors, []);
    assert.equal(result.releaseEligible, false);
    assert.equal(result.reviewedSourceMatches, 15);
    for (const relative of pending) {
        assert.ok(result.pendingReviewPaths.includes(relative));
        assert.equal(Object.hasOwn(prior.REVIEWED_SOURCE_SHA256, relative), false);
        const file = path.join(root, relative), bytes = fs.readFileSync(file);
        fs.unlinkSync(file);
        assert.ok(policy.inspectDevelopmentSources(root, 'N02-E').errors.includes('missing_executable_source:' + relative));
        fs.writeFileSync(file, bytes);
        assert.ok(policy.inspectSources(root, 'N02-E').errors.includes('unexpected_executable_source:' + relative));
    }
});
```
