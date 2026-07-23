const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ORIGINAL_CWD = process.cwd();
const TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'financas-bot-state04-'));
const STATE_MANAGER_PATH = path.resolve(__dirname, '../src/state/userStateManager.js');
const TEST_KEY = Buffer.alloc(32, 0x41).toString('base64');
const SNAPSHOT_AAD = Buffer.from('financasbot-state:v1', 'utf8');

process.env.STATE_STORE_DRIVER = 'file';
process.env.STATE_STORE_ENCRYPTION_KEY = TEST_KEY;
process.env.STATE_STORE_MAX_RETENTION_SECONDS = '60';
process.chdir(TEMP_ROOT);

delete require.cache[STATE_MANAGER_PATH];
const userStateManager = require(STATE_MANAGER_PATH);

function decryptTestSnapshot(stateFile) {
    const envelope = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        Buffer.from(TEST_KEY, 'base64'),
        Buffer.from(envelope.iv, 'base64'),
        { authTagLength: 16 }
    );
    decipher.setAAD(SNAPSHOT_AAD);
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return JSON.parse(Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
        decipher.final()
    ]).toString('utf8'));
}

function signTestReplayJournal(revoked) {
    return crypto
        .createHmac('sha256', Buffer.from(TEST_KEY, 'base64'))
        .update(JSON.stringify(revoked))
        .digest('hex');
}

test.after(() => {
    process.chdir(ORIGINAL_CWD);
    fs.rmSync(TEMP_ROOT, { recursive: true, force: true });
});

test('file snapshot encrypts every private field and explicitly creates private files', () => {
    const { flushStateToDisk, getStateFilePaths, loadStateFromDiskForTests } = userStateManager.__test__;
    const { stateFile, tempFile } = getStateFilePaths();
    const privateMarkers = [
        'private-user@example.test',
        'private-card-alias',
        'private-account-alias',
        'private-receipt-name.pdf',
        '987654.32',
        'private-description',
        'private-original-message'
    ];
    const originalWriteFileSync = fs.writeFileSync;
    const originalChmodSync = fs.chmodSync;
    const observedModes = [];

    fs.writeFileSync = function patchedWriteFileSync(target, data, options) {
        if (path.resolve(target) === path.resolve(tempFile)) {
            observedModes.push({ operation: 'write', mode: options?.mode });
        }
        return originalWriteFileSync.call(this, target, data, options);
    };
    fs.chmodSync = function patchedChmodSync(target, mode) {
        if ([stateFile, tempFile].map(item => path.resolve(item)).includes(path.resolve(target))) {
            observedModes.push({ operation: 'chmod', target: path.resolve(target), mode });
        }
        return originalChmodSync.call(this, target, mode);
    };

    try {
        userStateManager.setState(privateMarkers[0], {
            action: 'awaiting_confirmation',
            nestedUnknownField: {
                card: privateMarkers[1],
                account: privateMarkers[2],
                filename: privateMarkers[3],
                amount: 987654.32,
                description: privateMarkers[5],
                originalMessage: privateMarkers[6]
            }
        });
        flushStateToDisk();
    } finally {
        fs.writeFileSync = originalWriteFileSync;
        fs.chmodSync = originalChmodSync;
    }

    assert.strictEqual(fs.existsSync(tempFile), false);
    assert.strictEqual(fs.existsSync(stateFile), true);
    const protectedSnapshot = fs.readFileSync(stateFile, 'utf8');
    for (const marker of privateMarkers) {
        assert.doesNotMatch(protectedSnapshot, new RegExp(marker.replace('.', '\\.')));
    }
    assert.match(protectedSnapshot, /"format"\s*:\s*"financasbot-state"/);
    assert.match(protectedSnapshot, /"version"\s*:\s*1/);
    assert.ok(observedModes.some(item => item.operation === 'write' && item.mode === 0o600));
    assert.ok(observedModes.some(item => item.operation === 'chmod'
        && item.target === path.resolve(tempFile) && item.mode === 0o600));
    assert.strictEqual(userStateManager.__test__.getStateFileMode(), 0o600);
    if (process.platform !== 'win32') {
        assert.strictEqual(fs.statSync(stateFile).mode & 0o777, 0o600);
    }

    userStateManager.__test__.replaceStateFromJsonForTests('{}');
    loadStateFromDiskForTests();
    assert.strictEqual(
        userStateManager.getState(privateMarkers[0]).nestedUnknownField.filename,
        privateMarkers[3]
    );
    assert.strictEqual(
        userStateManager.getState(privateMarkers[0]).nestedUnknownField.description,
        privateMarkers[5]
    );
    assert.strictEqual(
        userStateManager.getState(privateMarkers[0]).nestedUnknownField.originalMessage,
        privateMarkers[6]
    );
});

test('atomic persistence failure preserves the last valid protected snapshot', () => {
    const { flushStateToDisk, getStateFilePaths, loadStateFromDiskForTests } = userStateManager.__test__;
    const { stateFile, tempFile, replayFile, replayTempFile } = getStateFilePaths();
    const previousSnapshot = fs.readFileSync(stateFile);
    const previousReplayJournal = fs.existsSync(replayFile)
        ? fs.readFileSync(replayFile)
        : null;
    const originalRenameSync = fs.renameSync;

    userStateManager.setState('private-user@example.test', {
        action: 'must-not-replace-last-valid-snapshot'
    });
    fs.renameSync = (source, target) => {
        if (path.resolve(target) === path.resolve(stateFile)) {
            throw new Error('synthetic_state_rename_failure');
        }
        return originalRenameSync(source, target);
    };
    try {
        assert.throws(() => flushStateToDisk(), /state_store_persist_failed/);
    } finally {
        fs.renameSync = originalRenameSync;
    }

    assert.deepStrictEqual(fs.readFileSync(stateFile), previousSnapshot);
    assert.strictEqual(fs.existsSync(tempFile), false);
    assert.strictEqual(fs.existsSync(replayTempFile), false);
    if (previousReplayJournal) {
        assert.deepStrictEqual(fs.readFileSync(replayFile), previousReplayJournal);
    } else {
        assert.strictEqual(fs.existsSync(replayFile), false);
    }
    userStateManager.__test__.replaceStateFromJsonForTests('{}');
    loadStateFromDiskForTests();
});

test('protected restore fails closed for tampering and a wrong key', () => {
    const { getStateFilePaths, loadStateFromDiskForTests } = userStateManager.__test__;
    const { stateFile } = getStateFilePaths();
    const envelope = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const originalCiphertext = envelope.ciphertext;
    const logger = require('../src/utils/logger');
    const originalLoggerError = logger.error;
    const errors = [];
    logger.error = message => errors.push(String(message));

    try {
        envelope.ciphertext = `${originalCiphertext[0] === 'A' ? 'B' : 'A'}${originalCiphertext.slice(1)}`;
        fs.writeFileSync(stateFile, JSON.stringify(envelope), { encoding: 'utf8', mode: 0o600 });
        userStateManager.__test__.replaceStateFromJsonForTests('{}');

        assert.throws(() => loadStateFromDiskForTests(), /state_store_restore_failed/);
        assert.strictEqual(userStateManager.getState('private-user@example.test'), undefined);

        envelope.ciphertext = originalCiphertext;
        fs.writeFileSync(stateFile, JSON.stringify(envelope), { encoding: 'utf8', mode: 0o600 });
        process.env.STATE_STORE_ENCRYPTION_KEY = Buffer.alloc(32, 0x42).toString('base64');
        assert.throws(() => loadStateFromDiskForTests(), /state_store_restore_failed/);
        assert.strictEqual(userStateManager.getState('private-user@example.test'), undefined);
    } finally {
        process.env.STATE_STORE_ENCRYPTION_KEY = TEST_KEY;
        logger.error = originalLoggerError;
    }
    assert.strictEqual(errors.length, 2);
    assert.ok(errors.every(message => message
        === '[state-store] file_restore_failed code=state_store_restore_failed'));
});

test('protected restore rejects non-canonical envelopes without replacing resident state', () => {
    const { flushStateToDisk, getStateFilePaths, loadStateFromDiskForTests } = userStateManager.__test__;
    const { stateFile } = getStateFilePaths();

    userStateManager.__test__.replaceStateFromJsonForTests('{}');
    userStateManager.setState('disk-state', { step: 'valid' });
    flushStateToDisk();
    const validEnvelope = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

    const invalidEnvelopes = [
        { ...validEnvelope, tag: Buffer.alloc(12).toString('base64') },
        { ...validEnvelope, iv: Buffer.alloc(8).toString('base64') },
        { ...validEnvelope, unexpected: true },
        { legacy: { plaintext: true } }
    ];
    for (const invalidEnvelope of invalidEnvelopes) {
        userStateManager.__test__.replaceStateFromJsonForTests('{}');
        userStateManager.setState('resident-state', { step: 'must-survive' });
        fs.writeFileSync(stateFile, JSON.stringify(invalidEnvelope), {
            encoding: 'utf8',
            mode: 0o600
        });
        assert.throws(() => loadStateFromDiskForTests(), /state_store_restore_failed/);
        assert.deepStrictEqual(
            userStateManager.getState('resident-state'),
            { step: 'must-survive' }
        );
    }

    fs.writeFileSync(stateFile, JSON.stringify(validEnvelope), {
        encoding: 'utf8',
        mode: 0o600
    });
});

test('a superseded protected snapshot is rejected as replay inside its TTL', () => {
    const { flushStateToDisk, getStateFilePaths, loadStateFromDiskForTests } = userStateManager.__test__;
    const { stateFile, replayFile } = getStateFilePaths();

    userStateManager.__test__.replaceStateFromJsonForTests('{}');
    userStateManager.setState('replay-state', { generation: 1 });
    flushStateToDisk();
    const supersededSnapshot = fs.readFileSync(stateFile);

    userStateManager.setState('replay-state', { generation: 2 });
    flushStateToDisk();
    const currentSnapshot = fs.readFileSync(stateFile);
    assert.strictEqual(fs.existsSync(replayFile), true);

    const supersededEnvelope = JSON.parse(supersededSnapshot.toString('utf8'));
    const semanticallyEquivalentSnapshot = JSON.stringify({
        ciphertext: supersededEnvelope.ciphertext,
        tag: supersededEnvelope.tag,
        iv: supersededEnvelope.iv,
        algorithm: supersededEnvelope.algorithm,
        version: supersededEnvelope.version,
        format: supersededEnvelope.format
    });
    fs.writeFileSync(stateFile, semanticallyEquivalentSnapshot, { mode: 0o600 });
    userStateManager.__test__.replaceStateFromJsonForTests('{}');
    assert.throws(() => loadStateFromDiskForTests(), /state_store_restore_failed/);

    fs.writeFileSync(stateFile, currentSnapshot, { mode: 0o600 });
    loadStateFromDiskForTests();
    assert.deepStrictEqual(userStateManager.getState('replay-state'), { generation: 2 });
});

test('durable replacement fsyncs both temporaries and commits the journal before state promotion', () => {
    const { flushStateToDisk, getStateFilePaths } = userStateManager.__test__;
    const {
        stateFile,
        tempFile,
        replayFile,
        replayTempFile
    } = getStateFilePaths();
    const originalOpenSync = fs.openSync;
    const originalFsyncSync = fs.fsyncSync;
    const originalRenameSync = fs.renameSync;
    const descriptorTargets = new Map();
    const events = [];

    fs.openSync = function patchedOpenSync(target, ...args) {
        const descriptor = originalOpenSync.call(this, target, ...args);
        const resolved = path.resolve(target);
        if ([tempFile, replayTempFile].map(item => path.resolve(item)).includes(resolved)) {
            descriptorTargets.set(descriptor, resolved);
        }
        return descriptor;
    };
    fs.fsyncSync = function patchedFsyncSync(descriptor) {
        const target = descriptorTargets.get(descriptor);
        if (target) events.push(`fsync:${path.basename(target)}`);
        return originalFsyncSync.call(this, descriptor);
    };
    fs.renameSync = function patchedRenameSync(source, target) {
        const resolvedTarget = path.resolve(target);
        if ([stateFile, replayFile].map(item => path.resolve(item)).includes(resolvedTarget)) {
            events.push(`rename:${path.basename(resolvedTarget)}`);
        }
        return originalRenameSync.call(this, source, target);
    };

    try {
        userStateManager.setState('durability-order', { generation: 1 });
        flushStateToDisk();
    } finally {
        fs.openSync = originalOpenSync;
        fs.fsyncSync = originalFsyncSync;
        fs.renameSync = originalRenameSync;
    }

    const stateFsync = events.indexOf(`fsync:${path.basename(tempFile)}`);
    const replayFsync = events.indexOf(`fsync:${path.basename(replayTempFile)}`);
    const replayRename = events.indexOf(`rename:${path.basename(replayFile)}`);
    const stateRename = events.indexOf(`rename:${path.basename(stateFile)}`);
    assert.ok(stateFsync >= 0);
    assert.ok(replayFsync > stateFsync);
    assert.ok(replayRename > replayFsync);
    assert.ok(stateRename > replayRename);
});

test('replay journal compacts expired revocations on the next replacement', () => {
    const { flushStateToDisk, getStateFilePaths } = userStateManager.__test__;
    const { replayFile } = getStateFilePaths();
    const journal = JSON.parse(fs.readFileSync(replayFile, 'utf8'));
    assert.ok(journal.revoked.length > 0);

    const expiredDigest = journal.revoked[0].digest;
    journal.revoked[0].expiresAt = Date.now() - 1;
    journal.mac = signTestReplayJournal(journal.revoked);
    fs.writeFileSync(replayFile, JSON.stringify(journal), { mode: 0o600 });

    userStateManager.setState('journal-compaction', { generation: 1 });
    flushStateToDisk();

    const compacted = JSON.parse(fs.readFileSync(replayFile, 'utf8'));
    assert.strictEqual(compacted.version, 2);
    assert.strictEqual(compacted.revoked.some(item => item.digest === expiredDigest), false);
    assert.ok(compacted.revoked.every(item => item.expiresAt > Date.now()));
});

test('state retention is mandatory and explicit TTL is capped by policy', () => {
    const before = Date.now();
    userStateManager.setState('default-retention', { step: 'pending' });
    userStateManager.setState('oversized-retention', { step: 'pending' }, 3600);

    const serialized = JSON.parse(userStateManager.__test__.serializeState());
    for (const key of ['default-retention', 'oversized-retention']) {
        assert.ok(Number.isFinite(serialized[key].expiresAt));
        assert.ok(serialized[key].expiresAt > before);
        assert.ok(serialized[key].expiresAt <= before + 60_000 + 1000);
    }
});

test('restore physically compacts expired entries immediately', async () => {
    const { flushStateToDisk, getStateFilePaths, loadStateFromDiskForTests } = userStateManager.__test__;
    const { stateFile } = getStateFilePaths();

    userStateManager.__test__.replaceStateFromJsonForTests('{}');
    userStateManager.setState('expired-private-state', {
        description: 'expired-private-description'
    }, 0.01);
    flushStateToDisk();
    await new Promise(resolve => setTimeout(resolve, 25));

    userStateManager.__test__.replaceStateFromJsonForTests('{}');
    loadStateFromDiskForTests();

    assert.strictEqual(userStateManager.getState('expired-private-state'), undefined);
    assert.strictEqual(
        Object.hasOwn(decryptTestSnapshot(stateFile), 'expired-private-state'),
        false
    );
});

test('file state-store configuration rejects a missing or malformed dedicated key', () => {
    const originalKey = process.env.STATE_STORE_ENCRYPTION_KEY;
    try {
        delete process.env.STATE_STORE_ENCRYPTION_KEY;
        assert.throws(
            () => userStateManager.assertStateStoreConfiguration(),
            /state_store_encryption_key_required/
        );
        process.env.STATE_STORE_ENCRYPTION_KEY = 'not-a-valid-key';
        assert.throws(
            () => userStateManager.assertStateStoreConfiguration(),
            /state_store_encryption_key_invalid/
        );
    } finally {
        process.env.STATE_STORE_ENCRYPTION_KEY = originalKey;
    }
});

test('missing protected snapshot fails closed when a replay journal proves prior persistence', () => {
    const { getStateFilePaths, loadStateFromDiskForTests } = userStateManager.__test__;
    const { stateFile, replayFile } = getStateFilePaths();
    assert.strictEqual(fs.existsSync(stateFile), true);
    assert.strictEqual(fs.existsSync(replayFile), true);

    fs.rmSync(stateFile);
    assert.throws(() => loadStateFromDiskForTests(), /state_store_restore_failed/);
});

test('abrupt interruption after durable journal commit makes the prior snapshot fail closed', () => {
    const childRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'financas-bot-state04-crash-'));
    const loggerPath = path.resolve(__dirname, '../src/utils/logger.js');
    const writerScript = `
        const fs = require('node:fs');
        const path = require('node:path');
        const manager = require(${JSON.stringify(STATE_MANAGER_PATH)});
        manager.setState('synthetic-crash-state', { generation: 1 });
        manager.__test__.flushStateToDisk();
        const { stateFile } = manager.__test__.getStateFilePaths();
        manager.setState('synthetic-crash-state', { generation: 2 });
        const originalRename = fs.renameSync;
        fs.renameSync = (source, target) => {
            if (path.resolve(target) === path.resolve(stateFile)) process.exit(86);
            return originalRename(source, target);
        };
        manager.__test__.flushStateToDisk();
    `;
    const readerScript = `
        const logger = require(${JSON.stringify(loggerPath)});
        logger.error = () => {};
        try {
            const manager = require(${JSON.stringify(STATE_MANAGER_PATH)});
            manager.assertStateStoreConfiguration();
            process.stdout.write('unexpected_success');
            process.exit(0);
        } catch (error) {
            process.stdout.write(String(error && error.message));
            process.exit(1);
        }
    `;
    const childEnv = {
        ...process.env,
        STATE_STORE_DRIVER: 'file',
        STATE_STORE_ENCRYPTION_KEY: TEST_KEY,
        STATE_STORE_MAX_RETENTION_SECONDS: '60'
    };
    try {
        const writer = spawnSync(process.execPath, ['-e', writerScript], {
            cwd: childRoot,
            encoding: 'utf8',
            env: childEnv
        });
        assert.strictEqual(writer.status, 86);
        assert.strictEqual(writer.stderr, '');

        const reader = spawnSync(process.execPath, ['-e', readerScript], {
            cwd: childRoot,
            encoding: 'utf8',
            env: childEnv
        });
        assert.strictEqual(reader.status, 1);
        assert.strictEqual(reader.stderr, '');
        assert.strictEqual(reader.stdout, 'state_store_restore_failed');
    } finally {
        fs.rmSync(childRoot, { recursive: true, force: true });
    }
});

test('startup subprocess fails closed with bounded sanitized configuration errors', () => {
    const childRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'financas-bot-state04-startup-'));
    const script = `
        try {
            const manager = require(${JSON.stringify(STATE_MANAGER_PATH)});
            manager.assertStateStoreConfiguration();
            process.exit(0);
        } catch (error) {
            process.stdout.write(String(error && error.message));
            process.exit(1);
        }
    `;
    try {
        const cases = [
            {
                env: { STATE_STORE_ENCRYPTION_KEY: '' },
                expected: 'state_store_encryption_key_required'
            },
            {
                env: {
                    STATE_STORE_ENCRYPTION_KEY: TEST_KEY,
                    STATE_STORE_MAX_RETENTION_SECONDS: String(31 * 24 * 60 * 60)
                },
                expected: 'state_store_retention_invalid'
            },
            {
                env: {
                    STATE_STORE_DRIVER: 'files',
                    STATE_STORE_ENCRYPTION_KEY: TEST_KEY
                },
                expected: 'state_store_driver_invalid'
            }
        ];
        for (const item of cases) {
            const result = spawnSync(process.execPath, ['-e', script], {
                cwd: childRoot,
                encoding: 'utf8',
                env: {
                    ...process.env,
                    STATE_STORE_DRIVER: 'file',
                    STATE_STORE_MAX_RETENTION_SECONDS: '',
                    ...item.env
                }
            });
            assert.strictEqual(result.status, 1);
            assert.strictEqual(result.stderr, '');
            assert.strictEqual(result.stdout, item.expected);
            assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(childRoot.replace(/\\/g, '\\\\')));
        }
    } finally {
        fs.rmSync(childRoot, { recursive: true, force: true });
    }
});
