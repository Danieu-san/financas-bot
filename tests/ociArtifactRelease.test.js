const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    assertArtifactPathsSafe,
    buildArtifact,
    createReleaseManifest,
    prepareExtractedRelease,
    promotePreparedRelease,
    readAndVerifyReleaseManifest,
    createPromotionPlan
} = require('../scripts/release/ociArtifactRelease');
const {
    verifyOciReleaseRuntime
} = require('../scripts/release/verifyOciReleaseRuntime');

const COMMIT = 'a'.repeat(40);

function tempDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function write(root, relativePath, content) {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
}

function createSourceTree() {
    const root = tempDir('financasbot-release-source-');
    write(root, 'index.js', 'console.log("release");\n');
    write(root, 'package.json', '{"name":"fixture","version":"1.0.0"}\n');
    write(root, 'src/value.js', 'module.exports = 1;\n');
    return root;
}

test('OPS-03 rejects traversal, secrets, state and runtime dependencies in an artifact', () => {
    for (const unsafe of [
        '../escape',
        '/absolute/path',
        './C:/absolute/path',
        '.env',
        'credentials.json',
        '.wwebjs_auth/session.json',
        '.wwebjs_cache/cache.bin',
        'data/runtime.sqlite',
        'private/secret.json',
        'state_store.json',
        'node_modules/package/index.js'
    ]) {
        assert.throws(
            () => assertArtifactPathsSafe(['index.js', unsafe]),
            /unsafe_oci_artifact_path/
        );
    }
    assert.doesNotThrow(() => assertArtifactPathsSafe([
        'index.js',
        'src/service.js',
        'docs/runbooks/release-checklist.md'
    ]));
});

test('OPS-03 manifest binds every source file and rejects tampering or extras', () => {
    const root = createSourceTree();
    try {
        const manifest = createReleaseManifest({ root, commitSha: COMMIT });
        write(root, '.release-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
        const verified = readAndVerifyReleaseManifest(root);
        assert.equal(verified.commit_sha, COMMIT);
        assert.equal(verified.files.length, 3);

        write(root, 'src/value.js', 'module.exports = 2;\n');
        assert.throws(
            () => readAndVerifyReleaseManifest(root),
            /oci_release_file_hash_mismatch/
        );
        write(root, 'src/value.js', 'module.exports = 1;\n');
        write(root, 'src/unlisted.js', 'unexpected\n');
        assert.throws(
            () => readAndVerifyReleaseManifest(root),
            /oci_release_unlisted_file/
        );
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('OPS-03 preparation installs an isolated slot and preserves all active state', async () => {
    const targetRoot = tempDir('financasbot-release-target-');
    const extractedRoot = createSourceTree();
    const calls = [];
    try {
        write(targetRoot, '.env', 'SECRET=preserve\n');
        write(targetRoot, 'credentials.json', '{"preserve":true}\n');
        write(targetRoot, '.wwebjs_auth/session.json', 'session\n');
        write(targetRoot, 'data/runtime.sqlite', 'state\n');
        write(targetRoot, 'private/vault.json', 'vault\n');
        write(targetRoot, 'state_store.json', '{"pending":true}\n');
        write(targetRoot, 'node_modules/active/sentinel', 'active\n');
        const before = new Map([
            ['.env', fs.readFileSync(path.join(targetRoot, '.env'), 'utf8')],
            ['credentials.json', fs.readFileSync(path.join(targetRoot, 'credentials.json'), 'utf8')],
            ['.wwebjs_auth/session.json', fs.readFileSync(path.join(targetRoot, '.wwebjs_auth/session.json'), 'utf8')],
            ['data/runtime.sqlite', fs.readFileSync(path.join(targetRoot, 'data/runtime.sqlite'), 'utf8')],
            ['private/vault.json', fs.readFileSync(path.join(targetRoot, 'private/vault.json'), 'utf8')],
            ['state_store.json', fs.readFileSync(path.join(targetRoot, 'state_store.json'), 'utf8')],
            ['node_modules/active/sentinel', fs.readFileSync(path.join(targetRoot, 'node_modules/active/sentinel'), 'utf8')]
        ]);
        const manifest = createReleaseManifest({
            root: extractedRoot,
            commitSha: COMMIT
        });
        write(
            extractedRoot,
            '.release-manifest.json',
            `${JSON.stringify(manifest, null, 2)}\n`
        );
        const prepared = await prepareExtractedRelease({
            extractedRoot,
            targetRoot,
            runCommand: async (command, args, options) => {
                calls.push({
                    command,
                    args,
                    cwd: options.cwd,
                    env: options.env
                });
                if (command === 'npm') {
                    write(options.cwd, 'node_modules/new/sentinel', 'new\n');
                }
            }
        });
        assert.equal(prepared.commit_sha, COMMIT);
        assert.equal(
            prepared.release_dir,
            path.join(targetRoot, 'releases', COMMIT)
        );
        assert.deepEqual(
            calls.map(call => [call.command, call.args]),
            [
                ['npm', ['ci', '--omit=dev']],
                [process.execPath, ['--check', 'index.js']]
            ]
        );
        assert.equal(
            calls[0].env?.PUPPETEER_SKIP_DOWNLOAD,
            'true'
        );
        for (const [relativePath, content] of before) {
            assert.equal(
                fs.readFileSync(path.join(targetRoot, relativePath), 'utf8'),
                content
            );
        }
        assert.equal(
            fs.readFileSync(
                path.join(prepared.release_dir, 'node_modules/new/sentinel'),
                'utf8'
            ),
            'new\n'
        );
    } finally {
        fs.rmSync(targetRoot, { recursive: true, force: true });
        fs.rmSync(extractedRoot, { recursive: true, force: true });
    }
});

test('OPS-03 failed preparation leaves active state and final slot untouched', async () => {
    const targetRoot = tempDir('financasbot-release-failed-');
    const extractedRoot = createSourceTree();
    try {
        write(targetRoot, 'state_store.json', '{"preserved":true}\n');
        const manifest = createReleaseManifest({
            root: extractedRoot,
            commitSha: COMMIT
        });
        write(
            extractedRoot,
            '.release-manifest.json',
            `${JSON.stringify(manifest, null, 2)}\n`
        );
        await assert.rejects(
            prepareExtractedRelease({
                extractedRoot,
                targetRoot,
                runCommand: async () => {
                    throw new Error('synthetic_npm_failure');
                }
            }),
            /synthetic_npm_failure/
        );
        assert.equal(
            fs.readFileSync(path.join(targetRoot, 'state_store.json'), 'utf8'),
            '{"preserved":true}\n'
        );
        assert.equal(
            fs.existsSync(path.join(targetRoot, 'releases', COMMIT)),
            false
        );
    } finally {
        fs.rmSync(targetRoot, { recursive: true, force: true });
        fs.rmSync(extractedRoot, { recursive: true, force: true });
    }
});

test('OPS-03 preparation executes the committed native/browser preflight before promotion', async () => {
    const targetRoot = tempDir('financasbot-release-preflight-');
    const extractedRoot = createSourceTree();
    const calls = [];
    try {
        write(
            extractedRoot,
            'scripts/release/verifyOciReleaseRuntime.js',
            'process.stdout.write("preflight");\n'
        );
        const manifest = createReleaseManifest({
            root: extractedRoot,
            commitSha: COMMIT
        });
        write(
            extractedRoot,
            '.release-manifest.json',
            `${JSON.stringify(manifest, null, 2)}\n`
        );
        await prepareExtractedRelease({
            extractedRoot,
            targetRoot,
            runCommand: async (command, args) => {
                calls.push([command, args]);
            }
        });
        assert.deepEqual(calls, [
            ['npm', ['ci', '--omit=dev']],
            [process.execPath, ['--check', 'index.js']],
            [
                process.execPath,
                ['scripts/release/verifyOciReleaseRuntime.js']
            ]
        ]);
    } finally {
        fs.rmSync(targetRoot, { recursive: true, force: true });
        fs.rmSync(extractedRoot, { recursive: true, force: true });
    }
});

test('OPS-03 promotion plan captures the current OCI script and deterministic rollback', () => {
    const root = '/home/ubuntu/financas-bot';
    const previous = '/home/ubuntu/financas-bot/index.js';
    const plan = createPromotionPlan({
        targetRoot: root,
        commitSha: COMMIT,
        previousScript: previous
    });
    assert.equal(plan.cwd, root);
    assert.equal(plan.next_script, `${root}/releases/${COMMIT}/index.js`);
    assert.equal(plan.previous_script, previous);
    assert.equal(plan.process_name, 'financas-bot');
    assert.equal(plan.app_commit_sha, COMMIT);
    assert.equal(plan.rollback.script, previous);
    assert.equal(plan.rollback.cwd, root);
    assert.equal(JSON.stringify(plan).includes('amazonaws'), false);
    assert.equal(JSON.stringify(plan).includes('git pull'), false);
});

test('OPS-03 builder archives the exact commit and excludes dirty local state', async () => {
    const repo = tempDir('financasbot-release-repo-');
    const output = tempDir('financasbot-release-output-');
    try {
        const run = require('node:child_process').spawnSync;
        const git = args => {
            const result = run('git', args, {
                cwd: repo,
                encoding: 'utf8',
                env: {
                    ...process.env,
                    GIT_AUTHOR_NAME: 'Release Test',
                    GIT_AUTHOR_EMAIL: 'release@example.invalid',
                    GIT_COMMITTER_NAME: 'Release Test',
                    GIT_COMMITTER_EMAIL: 'release@example.invalid'
                }
            });
            assert.equal(result.status, 0, result.stderr);
            return result.stdout.trim();
        };
        git(['init', '--quiet']);
        write(repo, 'index.js', 'console.log("committed");\n');
        write(repo, 'package.json', '{"name":"fixture","version":"1.0.0"}\n');
        git(['add', 'index.js', 'package.json']);
        git(['commit', '--quiet', '-m', 'fixture']);
        const commitSha = git(['rev-parse', 'HEAD']);
        write(repo, 'index.js', 'console.log("dirty");\n');
        write(repo, '.env', 'SECRET=never\n');
        write(repo, 'data/runtime.sqlite', 'never\n');

        const built = await buildArtifact({
            repoRoot: repo,
            commitRef: commitSha,
            outputDir: output
        });
        assert.equal(built.commit_sha, commitSha);
        assert.equal(fs.existsSync(built.artifact_path), true);
        assert.equal(fs.existsSync(built.checksum_path), true);
        assert.match(
            fs.readFileSync(built.checksum_path, 'utf8'),
            new RegExp(`^[a-f0-9]{64}  ${path.basename(built.artifact_path)}\\n$`)
        );
        assert.equal(built.verified_manifest.commit_sha, commitSha);
        const indexEntry = built.verified_manifest.files.find(
            file => file.path === 'index.js'
        );
        assert.ok(indexEntry);
        assert.equal(
            built.verified_manifest.files.some(file =>
                ['.env', 'data/runtime.sqlite'].includes(file.path)),
            false
        );
    } finally {
        fs.rmSync(repo, { recursive: true, force: true });
        fs.rmSync(output, { recursive: true, force: true });
    }
});

test('OPS-03 runtime preflight checks native SQLite and an isolated browser only', async () => {
    let databaseClosed = 0;
    let browserClosed = 0;
    let pages = 0;
    class FakeDatabase {
        prepare(sql) {
            assert.equal(sql, 'SELECT 1 AS ok');
            return { get: () => ({ ok: 1 }) };
        }
        close() {
            databaseClosed += 1;
        }
    }
    const result = await verifyOciReleaseRuntime({
        Database: FakeDatabase,
        puppeteer: {
            launch: async options => {
                assert.equal(options.headless, true);
                return {
                    newPage: async () => ({
                        goto: async url => {
                            assert.equal(url, 'about:blank');
                            pages += 1;
                        }
                    }),
                    close: async () => {
                        browserClosed += 1;
                    }
                };
            }
        }
    });
    assert.deepEqual(result, {
        sqlite: true,
        puppeteer: true,
        financial_writes: 0,
        whatsapp_session_reads: 0
    });
    assert.equal(databaseClosed, 1);
    assert.equal(browserClosed, 1);
    assert.equal(pages, 1);
});

async function preparedPromotionFixture() {
    const targetRoot = tempDir('financasbot-release-promote-');
    const extractedRoot = createSourceTree();
    write(targetRoot, 'index.js', 'console.log("previous");\n');
    const manifest = createReleaseManifest({
        root: extractedRoot,
        commitSha: COMMIT
    });
    write(
        extractedRoot,
        '.release-manifest.json',
        `${JSON.stringify(manifest, null, 2)}\n`
    );
    const prepared = await prepareExtractedRelease({
        extractedRoot,
        targetRoot,
        runCommand: async (command, args, options) => {
            if (command === 'npm') {
                write(options.cwd, 'node_modules/new/sentinel', 'new\n');
            }
        }
    });
    return { targetRoot, extractedRoot, prepared };
}

function pm2Inventory(targetRoot) {
    return JSON.stringify([{
        name: 'financas-bot',
        pm2_env: {
            status: 'online',
            pm_exec_path: path.join(targetRoot, 'index.js'),
            pm_cwd: targetRoot,
            env: { APP_COMMIT_SHA: 'previous-runtime' }
        }
    }]);
}

test('OPS-03 promotion stops the single OCI process before starting the prepared slot', async () => {
    const fixture = await preparedPromotionFixture();
    const calls = [];
    let healthCalls = 0;
    try {
        const result = await promotePreparedRelease({
            targetRoot: fixture.targetRoot,
            commitSha: COMMIT,
            runCommand: async (command, args, options) => {
                calls.push({ command, args, env: options.env });
                return command === 'pm2' && args[0] === 'jlist'
                    ? { stdout: pm2Inventory(fixture.targetRoot) }
                    : { stdout: '' };
            },
            healthCheck: async () => {
                healthCalls += 1;
                return healthCalls === 2;
            },
            healthAttempts: 2,
            healthDelayMs: 0
        });
        assert.equal(result.promoted, true);
        assert.equal(result.rollback_performed, false);
        assert.deepEqual(
            calls.map(call => [call.command, call.args[0]]),
            [
                ['pm2', 'jlist'],
                ['pm2', 'delete'],
                ['pm2', 'start'],
                ['pm2', 'save']
            ]
        );
        assert.equal(calls[2].env.APP_COMMIT_SHA, COMMIT);
        assert.equal(healthCalls, 2);
        assert.equal(
            calls[2].args[1],
            path.join(fixture.targetRoot, 'releases', COMMIT, 'index.js')
        );
    } finally {
        fs.rmSync(fixture.targetRoot, { recursive: true, force: true });
        fs.rmSync(fixture.extractedRoot, { recursive: true, force: true });
    }
});

test('OPS-03 failed health deletes the candidate and restores the captured script', async () => {
    const fixture = await preparedPromotionFixture();
    const calls = [];
    let healthCalls = 0;
    try {
        await assert.rejects(
            promotePreparedRelease({
                targetRoot: fixture.targetRoot,
                commitSha: COMMIT,
                runCommand: async (command, args, options) => {
                    calls.push({ command, args, env: options.env });
                    return command === 'pm2' && args[0] === 'jlist'
                        ? { stdout: pm2Inventory(fixture.targetRoot) }
                        : { stdout: '' };
                },
                healthCheck: async () => {
                    healthCalls += 1;
                    return healthCalls === 2;
                },
                healthAttempts: 1,
                healthDelayMs: 0
            }),
            /oci_release_promote_rolled_back:oci_release_new_health_failed/
        );
        assert.deepEqual(
            calls.map(call => [call.command, call.args[0]]),
            [
                ['pm2', 'jlist'],
                ['pm2', 'delete'],
                ['pm2', 'start'],
                ['pm2', 'delete'],
                ['pm2', 'start'],
                ['pm2', 'save']
            ]
        );
        assert.equal(
            calls[4].args[1],
            path.join(fixture.targetRoot, 'index.js')
        );
        assert.equal(calls[4].env.APP_COMMIT_SHA, 'previous-runtime');
    } finally {
        fs.rmSync(fixture.targetRoot, { recursive: true, force: true });
        fs.rmSync(fixture.extractedRoot, { recursive: true, force: true });
    }
});

test('OPS-03 CLI refuses promotion without the literal restart confirmation', () => {
    const result = require('node:child_process').spawnSync(
        process.execPath,
        [
            path.join(
                __dirname,
                '..',
                'scripts',
                'release',
                'ociArtifactRelease.js'
            ),
            'promote',
            '--target',
            '/home/ubuntu/financas-bot',
            '--commit',
            COMMIT
        ],
        { encoding: 'utf8' }
    );
    assert.equal(result.status, 1);
    assert.match(
        result.stderr,
        /oci_release_process_restart_confirmation_required/
    );
});
