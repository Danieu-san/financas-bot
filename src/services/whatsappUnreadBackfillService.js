const defaultLogger = require('../utils/logger');

function getMessageKey(message) {
    return message?.id?._serialized || message?.id?.id || '';
}

function getMessageTimestamp(message) {
    return Number(message?.timestamp || message?.t || 0);
}

function isIncomingMessage(message) {
    return Boolean(message?.id) && !message.fromMe && !message.id.fromMe;
}

async function collectUnreadIncomingMessages(chats, options = {}) {
    const isAlreadyProcessed = typeof options.isAlreadyProcessed === 'function'
        ? options.isAlreadyProcessed
        : () => false;
    const maxPerChat = Number(options.maxPerChat || 20);
    const seen = new Set();
    const notBeforeTimestamp = Number(options.notBeforeTimestamp || 0);
    const messages = [];

    for (const chat of chats || []) {
        const unreadCount = Number(chat?.unreadCount || 0);
        if (!unreadCount || typeof chat.fetchMessages !== 'function') continue;

        const limit = Math.max(1, Math.min(unreadCount, maxPerChat));
        const fetchedMessages = await chat.fetchMessages({ limit });
        for (const message of fetchedMessages || []) {
            const key = getMessageKey(message);
            if (!key || seen.has(key) || isAlreadyProcessed(key)) continue;
            if (!isIncomingMessage(message)) continue;
            if (notBeforeTimestamp > 0 && getMessageTimestamp(message) < notBeforeTimestamp) continue;
            seen.add(key);
            messages.push(message);
        }
    }

    return messages.sort((a, b) => getMessageTimestamp(a) - getMessageTimestamp(b));
}

async function backfillUnreadMessages(client, handleMessage, options = {}) {
    const logger = options.logger || defaultLogger;
    const delayMs = Number(options.delayMs || 3000);
    const enabled = options.enabled !== false;
    if (!enabled) return { skipped: true, reason: 'disabled', processed: 0 };
    if (!client || typeof client.getChats !== 'function') {
        return { skipped: true, reason: 'client_without_getChats', processed: 0 };
    }
    if (typeof handleMessage !== 'function') {
        return { skipped: true, reason: 'handler_missing', processed: 0 };
    }

    if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    const chats = await client.getChats();
    const messages = await collectUnreadIncomingMessages(chats, options);
    for (const message of messages) {
        await handleMessage(message);
    }

    if (messages.length > 0) {
        logger.info(`[whatsapp] unread backfill processou ${messages.length} mensagem(ns).`);
    }

    return { skipped: false, processed: messages.length };
}

module.exports = {
    backfillUnreadMessages,
    collectUnreadIncomingMessages,
    getMessageKey
};
