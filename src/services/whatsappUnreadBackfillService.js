const defaultLogger = require('../utils/logger');

function nonNegativeNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function positiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function classifyBackfillFailure(error) {
    const message = String(error?.message || error || '').toLowerCase();
    if (
        message.includes('runtime.callfunctionon')
        || (message.includes('protocol') && message.includes('timed out'))
    ) {
        return 'protocol_timeout';
    }
    return 'backfill_failed';
}

function wait(delayMs) {
    if (delayMs <= 0) return Promise.resolve();
    return new Promise(resolve => setTimeout(resolve, delayMs));
}

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
    const delayMs = nonNegativeNumber(options.delayMs, 3000);
    const retryDelayMs = nonNegativeNumber(options.retryDelayMs, 5000);
    const maxAttempts = positiveInteger(options.maxAttempts, 3);
    const enabled = options.enabled !== false;
    if (!enabled) return { skipped: true, reason: 'disabled', processed: 0 };
    if (!client || typeof client.getChats !== 'function') {
        return { skipped: true, reason: 'client_without_getChats', processed: 0 };
    }
    if (typeof handleMessage !== 'function') {
        return { skipped: true, reason: 'handler_missing', processed: 0 };
    }

    await wait(delayMs);

    let discovery = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const chats = await client.getChats();
            const messages = await collectUnreadIncomingMessages(chats, options);
            discovery = { messages, attempts: attempt };
            break;
        } catch (error) {
            const reasonCode = classifyBackfillFailure(error);
            logger.warn(
                `[whatsapp] unread_backfill_attempt_failed reason_code=${reasonCode} `
                + `attempt=${attempt} max_attempts=${maxAttempts}`
            );
            if (attempt >= maxAttempts) {
                const exhausted = new Error('WhatsApp unread backfill exhausted.');
                exhausted.code = 'WHATSAPP_UNREAD_BACKFILL_EXHAUSTED';
                throw exhausted;
            }
            await wait(retryDelayMs);
        }
    }

    let processed = 0;
    for (const message of discovery?.messages || []) {
        try {
            await handleMessage(message);
            processed += 1;
        } catch {
            const handlerFailure = new Error('WhatsApp unread backfill handler failed.');
            handlerFailure.code = 'WHATSAPP_UNREAD_BACKFILL_HANDLER_FAILED';
            throw handlerFailure;
        }
    }

    if (processed > 0) {
        logger.info(`[whatsapp] unread backfill processou ${processed} mensagem(ns).`);
    }

    return {
        skipped: false,
        processed,
        attempts: discovery?.attempts || maxAttempts
    };
}

module.exports = {
    backfillUnreadMessages,
    classifyBackfillFailure,
    collectUnreadIncomingMessages,
    getMessageKey
};
