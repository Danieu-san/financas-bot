const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ORIGINAL_CWD = process.cwd();
const TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'financas-bot-state04-'));
const STATE_MANAGER_PATH = path.resolve(__dirname, '../src/state/userStateManager.js');
const TEST_KEY = Buffer.alloc(32, 0x41).toString('base64');

process.env.STATE_STORE_DRIVER = 'file';
process.env.STATE_STORE_ENCRYPTION_KEY = TEST_KEY;
process.env.STATE_STORE_MAX_RETENTION_SECONDS = '60';
process.chdir(TEMP_ROOT);

delete require.cache[STATE_MANAGER_PATH];
const userStateManager = require(STATE_MANAGER_PATH);

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
        '987654.32'
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
                amount: 987654.32
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
});

test('atomic persistence failure preserves the last valid protected snapshot', () => {
    const { flushStateToDisk, getStateFilePaths, loadStateFromDiskForTests } = userStateManager.__test__;
    const { stateFile, tempFile } = getStateFilePaths();
    const previousSnapshot = fs.readFileSync(stateFile);
    const originalRenameSync = fs.renameSync;

    userStateManager.setState('private-user@example.test', {
        action: 'must-not-replace-last-valid-snapshot'
    });
    fs.renameSync = () => {
        throw new Error('synthetic_rename_failure');
    };
    try {
        assert.throws(() => flushStateToDisk(), /state_store_persist_failed/);
    } finally {
        fs.renameSync = originalRenameSync;
    }

    assert.deepStrictEqual(fs.readFileSync(stateFile), previousSnapshot);
    assert.strictEqual(fs.existsSync(tempFile), false);
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
