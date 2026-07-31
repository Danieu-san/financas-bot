const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');

const {
    assertArtifactPathsSafe,
    bootstrapEncryptedEmptyStateStore,
    buildArtifact,
    createReleaseManifest,
    extractArchive,
    inspectStateStorePromotion,
    prepareExtractedRelease,
    promotePreparedRelease,
    rollbackStateStoreBootstrap,
    readAndVerifyReleaseManifest,
    createPromotionPlan
} = require('../scripts/release/ociArtifactRelease');
const {
    verifyOciReleaseRuntime
} = require('../scripts/release/verifyOciReleaseRuntime');

const COMMIT = 'a'.repeat(40);
const TEST_TEMP_ROOT = process.env.EXHAUSTIVE_AUDIT_TEMP_ROOT
    ? fs.realpathSync(process.env.EXHAUSTIVE_AUDIT_TEMP_ROOT)
    : os.tmpdir();

function tempDir(prefix) {
    return fs.mkdtempSync(path.join(TEST_TEMP_ROOT, prefix));
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

function writeTarOctal(header, offset, length, value) {
    const text = Number(value).toString(8).padStart(length - 1, '0');
    header.write(`${text}\0`, offset, length, 'ascii');
}

function createTarEntry({
    name,
    type = '0',
    linkName = '',
    content = Buffer.alloc(0)
}) {
    const body = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const header = Buffer.alloc(512);
    header.write(name, 0, 100, 'utf8');
    writeTarOctal(header, 100, 8, type === '5' ? 0o755 : 0o644);
    writeTarOctal(header, 108, 8, 0);
    writeTarOctal(header, 116, 8, 0);
    writeTarOctal(header, 124, 12, body.length);
    writeTarOctal(header, 136, 12, 0);
    header.fill(0x20, 148, 156);
    header.write(type, 156, 1, 'ascii');
    header.write(linkName, 157, 100, 'utf8');
    header.write('ustar\0', 257, 6, 'ascii');
    header.write('00', 263, 2, 'ascii');
    const checksum = header.reduce((total, byte) => total + byte, 0);
    header.write(
        `${checksum.toString(8).padStart(6, '0')}\0 `,
        148,
        8,
        'ascii'
    );
    const padding = Buffer.alloc((512 - (body.length % 512)) % 512);
    return Buffer.concat([header, body, padding]);
}

function writeTarGz(file, entries) {
    const tar = Buffer.concat([
        ...entries.map(createTarEntry),
        Buffer.alloc(1024)
    ]);
    fs.writeFileSync(file, zlib.gzipSync(tar));
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

test('OPS-03 rejects a symlink archive before creating any extracted path', () => {
    const root = tempDir('financasbot-release-symlink-');
    const artifact = path.join(root, 'malicious.tar.gz');
    const destination = path.join(root, 'extract');
    const escaped = path.join(root, 'escaped.txt');
    try {
        writeTarGz(artifact, [
            {
                name: 'link',
                type: '2',
                linkName: '..'
            },
            {
                name: 'link/escaped.txt',
                content: 'must-not-extract\n'
            }
        ]);
        assert.throws(
            () => extractArchive(artifact, destination),
            /oci_release_unsafe_tar_type:2:link/
        );
        assert.equal(fs.existsSync(destination), false);
        assert.equal(fs.existsSync(escaped), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
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
        const gitExecutable = process.env.EXHAUSTIVE_LOCAL_GIT_PATH || 'git';
        const git = args => {
            const result = run(gitExecutable, args, {
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
        git(['commit', '--quiet', '--no-verify', '-m', 'fixture']);
        const commitSha = git(['rev-parse', 'HEAD']);
        write(repo, 'index.js', 'console.log("dirty");\n');
        write(repo, '.env', 'SECRET=never\n');
        write(repo, 'data/runtime.sqlite', 'never\n');

        await assert.rejects(
            buildArtifact({
                repoRoot: repo,
                commitRef: 'HEAD',
                outputDir: output
            }),
            /oci_release_literal_full_commit_required/
        );
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
        const positionalVerify = run(
            process.execPath,
            [
                path.join(
                    __dirname,
                    '..',
                    'scripts',
                    'release',
                    'ociArtifactRelease.js'
                ),
                'verify',
                built.artifact_path,
                built.checksum_path
            ],
            { encoding: 'utf8' }
        );
        assert.equal(positionalVerify.status, 0, positionalVerify.stderr);
        assert.equal(
            JSON.parse(positionalVerify.stdout).commit_sha,
            commitSha
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

async function preparedPromotionFixture({ legacyEmptyState = false } = {}) {
    const targetRoot = tempDir('financasbot-release-promote-');
    const extractedRoot = createSourceTree();
    write(targetRoot, 'index.js', 'console.log("previous");\n');
    write(targetRoot, '.env', 'ADMIN_IDS=daniel\n');
    write(targetRoot, 'state_store.json', '{}');
    if (!legacyEmptyState) {
        bootstrapEncryptedEmptyStateStore(targetRoot, {
            randomBytes: length => Buffer.alloc(length, 0x31),
            now: () => new Date('2026-07-31T00:00:00.000Z'),
            assertProcessStopped: () => true
        });
    }
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

test('OPS-04 inspects encrypted state and refuses non-empty legacy payloads', () => {
    const root = tempDir('financasbot-state-inspect-');
    try {
        write(root, '.env', 'ADMIN_IDS=daniel\n');
        write(root, 'state_store.json', '{}');
        assert.deepEqual(inspectStateStorePromotion(root), {
            ready: false,
            bootstrap_required: true,
            encrypted: false,
            legacy_empty: true
        });
        write(root, 'state_store.json', '{"user":{"data":{"step":1}}}');
        assert.throws(
            () => inspectStateStorePromotion(root),
            /oci_release_state_store_legacy_nonempty/
        );
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('OPS-04 bootstraps only an empty legacy state and supports exact rollback', () => {
    const root = tempDir('financasbot-state-bootstrap-');
    try {
        const originalEnv = 'ADMIN_IDS=daniel\n';
        const originalState = '{}';
        write(root, '.env', originalEnv);
        write(root, 'state_store.json', originalState);
        const result = bootstrapEncryptedEmptyStateStore(root, {
            randomBytes: length => Buffer.alloc(length, 0x42),
            now: () => new Date('2026-07-31T01:02:03.000Z'),
            assertProcessStopped: () => true
        });
        assert.equal(result.changed, true);
        assert.equal(result.backup_files.length, 2);
        if (process.platform !== 'win32') {
            assert.equal(
                fs.statSync(path.join(root, 'data', 'backups')).mode & 0o777,
                0o700
            );
            for (const backupFile of result.backup_files) {
                assert.equal(
                    fs.statSync(path.join(root, backupFile)).mode & 0o777,
                    0o600
                );
            }
        }
        assert.equal(inspectStateStorePromotion(root).ready, true);
        assert.match(
            fs.readFileSync(path.join(root, '.env'), 'utf8'),
            /STATE_STORE_ENCRYPTION_KEY=/
        );
        if (process.platform !== 'win32') {
            assert.equal(fs.statSync(path.join(root, '.env')).mode & 0o777, 0o600);
        }
        assert.equal(
            JSON.parse(fs.readFileSync(path.join(root, 'state_store.json'), 'utf8'))
                .format,
            'financasbot-state'
        );
        assert.equal(rollbackStateStoreBootstrap(result.transaction), true);
        assert.equal(fs.readFileSync(path.join(root, '.env'), 'utf8'), originalEnv);
        assert.equal(
            fs.readFileSync(path.join(root, 'state_store.json'), 'utf8'),
            originalState
        );
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('OPS-04 refuses bootstrap before the process-stop boundary', () => {
    const root = tempDir('financasbot-state-stop-boundary-');
    try {
        const originalEnv = 'ADMIN_IDS=daniel\n';
        write(root, '.env', originalEnv);
        write(root, 'state_store.json', '{}');
        assert.throws(
            () => bootstrapEncryptedEmptyStateStore(root, {
                assertProcessStopped: () => false
            }),
            /oci_release_state_store_process_not_stopped/
        );
        assert.equal(fs.readFileSync(path.join(root, '.env'), 'utf8'), originalEnv);
        assert.equal(
            fs.readFileSync(path.join(root, 'state_store.json'), 'utf8'),
            '{}'
        );
        assert.equal(fs.existsSync(path.join(root, 'data')), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('OPS-04 rejects tampered encrypted state and replay journals', () => {
    const root = tempDir('financasbot-state-tamper-');
    try {
        write(root, '.env', 'ADMIN_IDS=daniel\n');
        write(root, 'state_store.json', '{}');
        bootstrapEncryptedEmptyStateStore(root, {
            randomBytes: length => Buffer.alloc(length, 0x43),
            now: () => new Date('2026-07-31T01:03:00.000Z'),
            assertProcessStopped: () => true
        });
        const statePath = path.join(root, 'state_store.json');
        const originalState = fs.readFileSync(statePath, 'utf8');
        const tampered = JSON.parse(originalState);
        tampered.ciphertext = Buffer.from('tampered').toString('base64');
        fs.writeFileSync(statePath, JSON.stringify(tampered));
        assert.throws(
            () => inspectStateStorePromotion(root),
            /oci_release_state_store_snapshot_invalid/
        );

        fs.writeFileSync(statePath, originalState);
        write(root, 'state_store.replay.json', JSON.stringify({
            format: 'financasbot-state-replay',
            version: 2,
            revoked: [],
            mac: '0'.repeat(64)
        }));
        assert.throws(
            () => inspectStateStorePromotion(root),
            /oci_release_state_store_replay_invalid/
        );
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('OPS-04 promotion refuses legacy state before stopping PM2 without confirmation', async () => {
    const fixture = await preparedPromotionFixture({ legacyEmptyState: true });
    const calls = [];
    try {
        await assert.rejects(
            promotePreparedRelease({
                targetRoot: fixture.targetRoot,
                commitSha: COMMIT,
                runCommand: async (command, args) => {
                    calls.push([command, args[0]]);
                    return { stdout: pm2Inventory(fixture.targetRoot) };
                }
            }),
            /oci_release_state_store_bootstrap_confirmation_required/
        );
        assert.deepEqual(calls, [['pm2', 'jlist']]);
    } finally {
        fs.rmSync(fixture.targetRoot, { recursive: true, force: true });
        fs.rmSync(fixture.extractedRoot, { recursive: true, force: true });
    }
});

test('OPS-04 confirmed promotion bootstraps empty state after stopping PM2', async () => {
    const fixture = await preparedPromotionFixture({ legacyEmptyState: true });
    const calls = [];
    try {
        const result = await promotePreparedRelease({
            targetRoot: fixture.targetRoot,
            commitSha: COMMIT,
            bootstrapEmptyStateStore: true,
            runCommand: async (command, args) => {
                calls.push([command, args[0]]);
                if (command === 'pm2' && args[0] === 'delete') {
                    assert.equal(
                        fs.readFileSync(
                            path.join(fixture.targetRoot, 'state_store.json'),
                            'utf8'
                        ),
                        '{}'
                    );
                    assert.doesNotMatch(
                        fs.readFileSync(
                            path.join(fixture.targetRoot, '.env'),
                            'utf8'
                        ),
                        /STATE_STORE_ENCRYPTION_KEY=/
                    );
                    assert.equal(
                        fs.existsSync(
                            path.join(fixture.targetRoot, 'data', 'backups')
                        ),
                        false
                    );
                }
                return command === 'pm2' && args[0] === 'jlist'
                    ? { stdout: pm2Inventory(fixture.targetRoot) }
                    : { stdout: '' };
            },
            healthCheck: async () => true,
            healthAttempts: 1,
            healthDelayMs: 0
        });
        assert.equal(result.promoted, true);
        assert.equal(result.state_store_bootstrapped, true);
        assert.equal(inspectStateStorePromotion(fixture.targetRoot).ready, true);
        assert.deepEqual(calls.slice(0, 2), [
            ['pm2', 'jlist'],
            ['pm2', 'delete']
        ]);
    } finally {
        fs.rmSync(fixture.targetRoot, { recursive: true, force: true });
        fs.rmSync(fixture.extractedRoot, { recursive: true, force: true });
    }
});

test('OPS-04 failed candidate restores legacy state before starting rollback', async () => {
    const fixture = await preparedPromotionFixture({ legacyEmptyState: true });
    const originalEnv = fs.readFileSync(path.join(fixture.targetRoot, '.env'), 'utf8');
    const calls = [];
    let healthCalls = 0;
    try {
        await assert.rejects(
            promotePreparedRelease({
                targetRoot: fixture.targetRoot,
                commitSha: COMMIT,
                bootstrapEmptyStateStore: true,
                runCommand: async (command, args) => {
                    calls.push([command, args[0]]);
                    if (command === 'pm2' &&
                        args[0] === 'start' &&
                        calls.filter(call =>
                            call[0] === 'pm2' && call[1] === 'start'
                        ).length === 2) {
                        assert.equal(
                            fs.readFileSync(
                                path.join(fixture.targetRoot, '.env'),
                                'utf8'
                            ),
                            originalEnv
                        );
                        assert.equal(
                            fs.readFileSync(
                                path.join(
                                    fixture.targetRoot,
                                    'state_store.json'
                                ),
                                'utf8'
                            ),
                            '{}'
                        );
                    }
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
            /oci_release_promote_rolled_back/
        );
        assert.equal(
            fs.readFileSync(path.join(fixture.targetRoot, '.env'), 'utf8'),
            originalEnv
        );
        assert.equal(
            fs.readFileSync(path.join(fixture.targetRoot, 'state_store.json'), 'utf8'),
            '{}'
        );
        assert.deepEqual(calls.slice(-2), [
            ['pm2', 'start'],
            ['pm2', 'save']
        ]);
    } finally {
        fs.rmSync(fixture.targetRoot, { recursive: true, force: true });
        fs.rmSync(fixture.extractedRoot, { recursive: true, force: true });
    }
});

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

test('OPS-03 rollback fails closed when the candidate cannot be deleted', async () => {
    const fixture = await preparedPromotionFixture();
    const calls = [];
    try {
        await assert.rejects(
            promotePreparedRelease({
                targetRoot: fixture.targetRoot,
                commitSha: COMMIT,
                runCommand: async (command, args) => {
                    calls.push([command, args[0]]);
                    if (command === 'pm2' && args[0] === 'jlist') {
                        return { stdout: pm2Inventory(fixture.targetRoot) };
                    }
                    if (command === 'pm2' &&
                        args[0] === 'delete' &&
                        calls.length === 4) {
                        throw new Error('synthetic_candidate_still_running');
                    }
                    return { stdout: '' };
                },
                healthCheck: async () => false,
                healthAttempts: 1,
                healthDelayMs: 0
            }),
            /oci_release_rollback_candidate_delete_failed:synthetic_candidate_still_running/
        );
        assert.deepEqual(calls, [
            ['pm2', 'jlist'],
            ['pm2', 'delete'],
            ['pm2', 'start'],
            ['pm2', 'delete']
        ]);
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

test('OPS-04 CLI plan defaults to the single financas-bot process', () => {
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
            'plan',
            '--target',
            '/home/ubuntu/financas-bot',
            '--commit',
            COMMIT,
            '--previous-script',
            '/home/ubuntu/financas-bot/index.js'
        ],
        { encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).process_name, 'financas-bot');
});
