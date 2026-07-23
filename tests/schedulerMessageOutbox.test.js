const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
    SchedulerMessageOutbox,
    drainSchedulerMessageOutbox,
    enqueueAndDrainScheduledMessage,
    __test__: schedulerOutboxTest
} = require('../src/jobs/schedulerMessageOutbox');

const TEST_KEY = Buffer.alloc(32, 0x47).toString('base64');

async function createFixture(options = {}) {
    const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'scheduler-outbox-'));
    const databasePath = path.join(directory, 'private', 'outbox.sqlite');
    const store = new SchedulerMessageOutbox({
        databasePath,
        encryptionKey: TEST_KEY,
        ...options
    });
    return {
        directory,
        databasePath,
        store,
        async cleanup() {
            store.close();
            await fsp.rm(directory, { recursive: true, force: true });
        }
    };
}

test('scheduler outbox isolates a failed recipient, retains retry and continues with the next user', async () => {
    const fixture = await createFixture({ baseBackoffSeconds: 10 });
    try {
        fixture.store.enqueue({
            dedupeKey: 'morning:user-a:2026-07-23',
            jobKind: 'morning_summary',
            recipient: '5511000000001@c.us',
            message: 'mensagem privada A',
            createdAt: '2026-07-23T10:00:00.000Z'
        });
        fixture.store.enqueue({
            dedupeKey: 'morning:user-b:2026-07-23',
            jobKind: 'morning_summary',
            recipient: '5511000000002@c.us',
            message: 'mensagem privada B',
            createdAt: '2026-07-23T10:00:00.000Z'
        });

        const calls = [];
        const first = await drainSchedulerMessageOutbox({
            store: fixture.store,
            client: {
                sendMessage: async (recipient) => {
                    calls.push(recipient);
                    if (recipient.endsWith('1@c.us')) throw new Error('private transport detail');
                    return { id: { _serialized: 'provider-message-b' } };
                }
            },
            now: '2026-07-23T10:00:00.000Z',
            limit: 10
        });

        assert.deepStrictEqual(first, {
            claimed: 2,
            delivered: 1,
            acceptedUnconfirmed: 0,
            retryScheduled: 1,
            dead: 0,
            recoveredAmbiguous: 0,
            purged: 0
        });
        assert.deepStrictEqual(calls, ['5511000000001@c.us', '5511000000002@c.us']);
        assert.deepStrictEqual(fixture.store.getStateCounts(), {
            pending: 1,
            delivered_confirmed: 1
        });

        const retryCalls = [];
        const retried = await drainSchedulerMessageOutbox({
            store: fixture.store,
            client: {
                sendMessage: async (recipient) => {
                    retryCalls.push(recipient);
                    return { id: { _serialized: 'provider-message-a' } };
                }
            },
            now: '2026-07-23T10:00:10.000Z',
            limit: 10
        });
        assert.strictEqual(retried.delivered, 1);
        assert.deepStrictEqual(retryCalls, ['5511000000001@c.us']);
    } finally {
        await fixture.cleanup();
    }
});

test('scheduler outbox deduplicates a confirmed job across process restarts', async () => {
    const fixture = await createFixture();
    try {
        const firstInsert = fixture.store.enqueue({
            dedupeKey: 'weekly:user-a:2026-W30',
            jobKind: 'weekly_checkin',
            recipient: '5511000000001@c.us',
            message: 'check-in privado',
            createdAt: '2026-07-23T10:00:00.000Z'
        });
        assert.strictEqual(firstInsert.inserted, true);
        await drainSchedulerMessageOutbox({
            store: fixture.store,
            client: { sendMessage: async () => ({ id: { _serialized: 'provider-message-a' } }) },
            now: '2026-07-23T10:00:00.000Z'
        });
        fixture.store.close();

        const reopened = new SchedulerMessageOutbox({
            databasePath: fixture.databasePath,
            encryptionKey: TEST_KEY
        });
        const replay = reopened.enqueue({
            dedupeKey: 'weekly:user-a:2026-W30',
            jobKind: 'weekly_checkin',
            recipient: '5511000000001@c.us',
            message: 'check-in privado',
            createdAt: '2026-07-23T10:05:00.000Z'
        });
        let sends = 0;
        const result = await drainSchedulerMessageOutbox({
            store: reopened,
            client: { sendMessage: async () => { sends += 1; } },
            now: '2026-07-23T10:05:00.000Z'
        });
        assert.strictEqual(replay.inserted, false);
        assert.strictEqual(result.claimed, 0);
        assert.strictEqual(sends, 0);
        reopened.close();
    } finally {
        await fixture.cleanup();
    }
});

test('expired in-flight lease becomes accepted-unconfirmed and is never retried blindly', async () => {
    const fixture = await createFixture();
    try {
        fixture.store.enqueue({
            dedupeKey: 'monthly:user-a:2026-06',
            jobKind: 'monthly_report',
            recipient: '5511000000001@c.us',
            message: 'relatório privado',
            createdAt: '2026-07-23T10:00:00.000Z'
        });
        const claimed = fixture.store.claimNext({
            now: '2026-07-23T10:00:00.000Z',
            leaseSeconds: 30
        });
        assert.strictEqual(claimed.jobKind, 'monthly_report');
        fixture.store.close();

        const reopened = new SchedulerMessageOutbox({
            databasePath: fixture.databasePath,
            encryptionKey: TEST_KEY
        });
        let sends = 0;
        const result = await drainSchedulerMessageOutbox({
            store: reopened,
            client: { sendMessage: async () => { sends += 1; } },
            now: '2026-07-23T10:00:31.000Z'
        });
        assert.strictEqual(result.recoveredAmbiguous, 1);
        assert.strictEqual(result.claimed, 0);
        assert.strictEqual(sends, 0);
        assert.deepStrictEqual(reopened.getStateCounts(), { accepted_unconfirmed: 1 });
        reopened.close();
    } finally {
        await fixture.cleanup();
    }
});

test('transport acceptance without a provider id is terminal and replay-safe', async () => {
    const fixture = await createFixture();
    try {
        const input = {
            dedupeKey: 'evening:user-a:2026-07-24',
            jobKind: 'evening_summary',
            recipient: '5511000000001@c.us',
            message: 'resumo privado',
            createdAt: '2026-07-23T10:00:00.000Z'
        };
        fixture.store.enqueue(input);
        let sends = 0;
        const first = await drainSchedulerMessageOutbox({
            store: fixture.store,
            client: {
                sendMessage: async () => {
                    sends += 1;
                    return {};
                }
            },
            now: '2026-07-23T10:00:00.000Z'
        });
        fixture.store.enqueue(input);
        const replay = await drainSchedulerMessageOutbox({
            store: fixture.store,
            client: {
                sendMessage: async () => {
                    sends += 1;
                    return {};
                }
            },
            now: '2026-07-23T10:05:00.000Z'
        });
        assert.strictEqual(first.acceptedUnconfirmed, 1);
        assert.strictEqual(replay.claimed, 0);
        assert.strictEqual(sends, 1);
        assert.deepStrictEqual(fixture.store.getStateCounts(), { accepted_unconfirmed: 1 });
    } finally {
        await fixture.cleanup();
    }
});

test('independent workers cannot claim the same durable job', async () => {
    const fixture = await createFixture();
    let secondStore;
    try {
        fixture.store.enqueue({
            dedupeKey: 'morning:user-a:2026-07-23',
            jobKind: 'morning_summary',
            recipient: '5511000000001@c.us',
            message: 'resumo privado',
            createdAt: '2026-07-23T10:00:00.000Z'
        });
        secondStore = new SchedulerMessageOutbox({
            databasePath: fixture.databasePath,
            encryptionKey: TEST_KEY
        });
        const firstClaim = fixture.store.claimNext({ now: '2026-07-23T10:00:00.000Z' });
        const secondClaim = secondStore.claimNext({ now: '2026-07-23T10:00:00.000Z' });
        assert.ok(firstClaim);
        assert.strictEqual(secondClaim, null);
    } finally {
        if (secondStore) secondStore.close();
        await fixture.cleanup();
    }
});

test('scheduler outbox encrypts private payload, uses private permissions and purges terminal payloads', async () => {
    const fixture = await createFixture({ retentionSeconds: 60 });
    try {
        fixture.store.enqueue({
            dedupeKey: 'event:user-a:event-private',
            jobKind: 'event_reminder',
            recipient: '5511999888777@c.us',
            message: 'descrição financeira privada e exclusiva',
            createdAt: '2026-07-23T10:00:00.000Z'
        });
        await drainSchedulerMessageOutbox({
            store: fixture.store,
            client: { sendMessage: async () => ({ id: { _serialized: 'provider-private-id' } }) },
            now: '2026-07-23T10:00:00.000Z'
        });

        const persistedBytes = fs.readdirSync(path.dirname(fixture.databasePath))
            .map(name => fs.readFileSync(path.join(path.dirname(fixture.databasePath), name)))
            .map(value => value.toString('utf8'))
            .join('\n');
        assert.doesNotMatch(
            persistedBytes,
            /5511999888777|descrição financeira privada|provider-private-id/
        );
        if (process.platform !== 'win32') {
            assert.strictEqual(fs.statSync(path.dirname(fixture.databasePath)).mode & 0o777, 0o700);
            assert.strictEqual(fs.statSync(fixture.databasePath).mode & 0o777, 0o600);
        }

        const purged = fixture.store.purgeExpired({
            now: '2026-07-23T10:01:01.000Z'
        });
        assert.strictEqual(purged.purged, 1);
        assert.deepStrictEqual(fixture.store.getStateCounts(), {});
    } finally {
        await fixture.cleanup();
    }
});

test('scheduler outbox bounds retry attempts and exposes only sanitized aggregate results', async () => {
    const fixture = await createFixture({ maxAttempts: 2, baseBackoffSeconds: 1 });
    try {
        fixture.store.enqueue({
            dedupeKey: 'bill:user-a:2026-07-24:private',
            jobKind: 'bill_reminder',
            recipient: '5511000000001@c.us',
            message: 'conta privada',
            createdAt: '2026-07-23T10:00:00.000Z'
        });
        const client = { sendMessage: async () => { throw new Error('raw secret transport error'); } };
        const first = await drainSchedulerMessageOutbox({
            store: fixture.store,
            client,
            now: '2026-07-23T10:00:00.000Z'
        });
        const second = await drainSchedulerMessageOutbox({
            store: fixture.store,
            client,
            now: '2026-07-23T10:00:01.000Z'
        });
        assert.strictEqual(first.retryScheduled, 1);
        assert.strictEqual(second.dead, 1);
        assert.deepStrictEqual(fixture.store.getStateCounts(), { dead: 1 });
        assert.doesNotMatch(JSON.stringify({ first, second }), /raw secret|5511000000001|conta privada/);
    } finally {
        await fixture.cleanup();
    }
});

test('scheduler outbox fails closed when encryption configuration is missing or invalid', () => {
    assert.throws(() => new SchedulerMessageOutbox({
        databasePath: ':memory:',
        encryptionKey: ''
    }), /scheduler_outbox_encryption_key_required/);
    assert.throws(() => new SchedulerMessageOutbox({
        databasePath: ':memory:',
        encryptionKey: 'invalid'
    }), /scheduler_outbox_encryption_key_invalid/);
});

test('scheduler runtime never bypasses the outbox when secure configuration is unavailable', async () => {
    const previousKey = process.env.STATE_STORE_ENCRYPTION_KEY;
    const previousPath = process.env.SCHEDULER_OUTBOX_DB_PATH;
    let sends = 0;
    try {
        delete process.env.STATE_STORE_ENCRYPTION_KEY;
        process.env.SCHEDULER_OUTBOX_DB_PATH = ':memory:';
        schedulerOutboxTest.resetRuntimeStoreForTest();
        const result = await enqueueAndDrainScheduledMessage({
            client: { sendMessage: async () => { sends += 1; } },
            recipient: '5511000000001@c.us',
            message: 'mensagem privada',
            jobKind: 'morning_summary',
            dedupeKey: 'morning:user-a:2026-07-23',
            now: '2026-07-23T10:00:00.000Z'
        });
        assert.strictEqual(result.errorCode, 'SCHEDULER_OUTBOX_UNAVAILABLE');
        assert.strictEqual(sends, 0);
    } finally {
        schedulerOutboxTest.resetRuntimeStoreForTest();
        if (previousKey === undefined) delete process.env.STATE_STORE_ENCRYPTION_KEY;
        else process.env.STATE_STORE_ENCRYPTION_KEY = previousKey;
        if (previousPath === undefined) delete process.env.SCHEDULER_OUTBOX_DB_PATH;
        else process.env.SCHEDULER_OUTBOX_DB_PATH = previousPath;
    }
});

test('scheduler outbox close is idempotent', () => {
    const store = new SchedulerMessageOutbox({
        databasePath: ':memory:',
        encryptionKey: TEST_KEY
    });
    store.close();
    store.close();
});
