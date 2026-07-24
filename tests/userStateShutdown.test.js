const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

const ORIGINAL_CWD = process.cwd();
const TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'financas-bot-state03-'));
const STATE_MANAGER_PATH = path.resolve(__dirname, '../src/state/userStateManager.js');
const TEST_KEY = Buffer.alloc(32, 0x53).toString('base64');
const SNAPSHOT_AAD = Buffer.from('financasbot-state:v1', 'utf8');

process.env.STATE_STORE_DRIVER = 'file';
process.env.STATE_STORE_ENCRYPTION_KEY = TEST_KEY;
process.env.STATE_STORE_MAX_RETENTION_SECONDS = '60';
process.chdir(TEMP_ROOT);

delete require.cache[STATE_MANAGER_PATH];
const userStateManager = require(STATE_MANAGER_PATH);

function decryptSnapshot(stateFile) {
    const envelope = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        Buffer.from(TEST_KEY, 'base64'),
        Buffer.from(envelope.iv, 'base64')
    );
    decipher.setAAD(SNAPSHOT_AAD);
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return JSON.parse(Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
        decipher.final()
    ]).toString('utf8'));
}

test.after(() => {
    process.chdir(ORIGINAL_CWD);
    fs.rmSync(TEMP_ROOT, { recursive: true, force: true });
});

test('signal shutdown exits only after the idempotent close persists the final state', async () => {
    const { stateFile } = userStateManager.__test__.getStateFilePaths();
    const exits = [];
    userStateManager.setState('shutdown-user', { step: 'final-state' });

    const shutdown = userStateManager.__test__.createSignalShutdownHandler({
        close: userStateManager.closeStateStore,
        exit: code => exits.push(code)
    });
    const signalCompletion = shutdown();
    const firstClose = userStateManager.closeStateStore();
    const secondClose = userStateManager.closeStateStore();

    assert.ok(firstClose instanceof Promise);
    assert.strictEqual(secondClose, firstClose);
    assert.deepStrictEqual(exits, []);
    await signalCompletion;
    assert.deepStrictEqual(exits, [0]);
    assert.strictEqual(userStateManager.__test__.isDirty(), false);
    assert.strictEqual(decryptSnapshot(stateFile)['shutdown-user'].data.step, 'final-state');
});

test('signal shutdown waits for close completion before requesting process exit', async () => {
    const events = [];
    let resolveClose;
    const closePromise = new Promise(resolve => {
        resolveClose = resolve;
    });
    const shutdown = userStateManager.__test__.createSignalShutdownHandler({
        close: () => closePromise,
        exit: code => events.push(`exit:${code}`)
    });

    const pending = shutdown();
    await Promise.resolve();
    assert.deepStrictEqual(events, []);

    resolveClose();
    await pending;
    assert.deepStrictEqual(events, ['exit:0']);
});

test('registered handlers coalesce repeated equal and mixed signals until close completes', async () => {
    const emitter = new EventEmitter();
    const exits = [];
    let closeCalls = 0;
    let resolveClose;
    const closePromise = new Promise(resolve => {
        resolveClose = resolve;
    });
    const shutdown = userStateManager.__test__.createSignalShutdownHandler({
        close: () => {
            closeCalls += 1;
            return closePromise;
        },
        exit: code => exits.push(code)
    });
    const unregister = userStateManager.__test__.registerStateStoreSignalHandlers({
        emitter,
        handler: shutdown
    });

    emitter.emit('SIGTERM');
    emitter.emit('SIGTERM');
    emitter.emit('SIGINT');
    await Promise.resolve();

    assert.strictEqual(closeCalls, 1);
    assert.deepStrictEqual(exits, []);
    assert.strictEqual(emitter.listenerCount('SIGTERM'), 1);
    assert.strictEqual(emitter.listenerCount('SIGINT'), 1);

    resolveClose();
    await shutdown();
    assert.deepStrictEqual(exits, [0]);

    unregister();
    assert.strictEqual(emitter.listenerCount('SIGTERM'), 0);
    assert.strictEqual(emitter.listenerCount('SIGINT'), 0);
});

test('signal shutdown exits non-zero with a bounded sanitized error when flush fails', async () => {
    const events = [];
    const shutdown = userStateManager.__test__.createSignalShutdownHandler({
        close: async () => {
            throw new Error('private-path-and-state');
        },
        exit: code => events.push(`exit:${code}`),
        logError: message => events.push(String(message))
    });

    await shutdown();

    assert.deepStrictEqual(events, [
        '[state-store] shutdown_failed code=state_store_shutdown_failed',
        'exit:1'
    ]);
    assert.doesNotMatch(events.join(' '), /private-path-and-state/);
});

test('unsupported Redis backend has no dormant client implementation', () => {
    const source = fs.readFileSync(STATE_MANAGER_PATH, 'utf8');
    assert.doesNotMatch(source, /require\(['"]redis['"]\)/);
    assert.doesNotMatch(source, /flushStateToRedis|REDIS_URL|REDIS_STATE_KEY/);
});
