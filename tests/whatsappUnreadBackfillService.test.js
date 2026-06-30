const assert = require('node:assert/strict');
const test = require('node:test');

const {
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
