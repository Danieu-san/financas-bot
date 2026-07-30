const assert = require('node:assert/strict');
const test = require('node:test');

const {
    backfillUnreadMessages,
    collectUnreadIncomingMessages
} = require('../src/services/whatsappUnreadBackfillService');

function makeMessage(id, overrides = {}) {
    return {
        id: { id, _serialized: `${id}@serialized`, fromMe: false },
        fromMe: false,
        timestamp: 100,
        body: `body ${id}`,
        ...overrides
    };
}

test('collectUnreadIncomingMessages returns only unread incoming messages that were not processed', async () => {
    const incoming = makeMessage('incoming-1', { timestamp: 200 });
    const duplicate = makeMessage('duplicate-1', { timestamp: 150 });
    const outgoing = makeMessage('outgoing-1', {
        fromMe: true,
        id: { id: 'outgoing-1', _serialized: 'outgoing-1@serialized', fromMe: true }
    });
    const alreadyProcessed = makeMessage('already-1');

    const chats = [
        {
            unreadCount: 4,
            fetchMessages: async ({ limit }) => {
                assert.equal(limit, 4);
                return [outgoing, alreadyProcessed, duplicate, duplicate, incoming];
            }
        },
        {
            unreadCount: 0,
            fetchMessages: async () => {
                throw new Error('chat without unread messages should not be fetched');
            }
        }
    ];

    const messages = await collectUnreadIncomingMessages(chats, {
        isAlreadyProcessed: key => key === 'already-1@serialized'
    });

    assert.deepEqual(
        messages.map(message => message.id.id),
        ['duplicate-1', 'incoming-1']
    );
});

test('collectUnreadIncomingMessages ignores unread messages older than the current startup', async () => {
    const oldMessage = makeMessage('old-1', { timestamp: 99 });
    const newMessage = makeMessage('new-1', { timestamp: 101 });

    const messages = await collectUnreadIncomingMessages([
        {
            unreadCount: 2,
            fetchMessages: async () => [oldMessage, newMessage]
        }
    ], {
        notBeforeTimestamp: 100
    });

    assert.deepEqual(
        messages.map(message => message.id.id),
        ['new-1']
    );
});

test('backfillUnreadMessages retries a transient chat read and processes once', async () => {
    const incoming = makeMessage('retry-1', { timestamp: 200 });
    const handled = [];
    const warnings = [];
    let attempts = 0;

    const result = await backfillUnreadMessages({
        async getChats() {
            attempts += 1;
            if (attempts === 1) throw new Error('transient private browser failure');
            return [{
                unreadCount: 1,
                fetchMessages: async () => [incoming]
            }];
        }
    }, async message => {
        handled.push(message.id.id);
    }, {
        delayMs: 0,
        retryDelayMs: 0,
        maxAttempts: 2,
        logger: {
            info() {},
            warn(message) {
                warnings.push(message);
            }
        }
    });

    assert.equal(result.processed, 1);
    assert.equal(attempts, 2);
    assert.deepEqual(handled, ['retry-1']);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /reason_code=backfill_failed/);
    assert.equal(warnings[0].includes('private browser failure'), false);
});

test('backfillUnreadMessages fails with a stable code after bounded retries', async () => {
    let attempts = 0;
    await assert.rejects(
        backfillUnreadMessages({
            async getChats() {
                attempts += 1;
                throw new Error('r');
            }
        }, async () => {}, {
            delayMs: 0,
            retryDelayMs: 0,
            maxAttempts: 2,
            logger: { info() {}, warn() {} }
        }),
        error => error?.code === 'WHATSAPP_UNREAD_BACKFILL_EXHAUSTED'
    );
    assert.equal(attempts, 2);
});
