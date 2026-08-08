const defaultLogger = require('../utils/logger');

const listenerAttachmentState = new WeakMap();

function installSingleFlightListenerAttachment(client) {
    if (!client || typeof client.attachEventListeners !== 'function') {
        return client;
    }
    if (listenerAttachmentState.has(client)) return client;

    const original = client.attachEventListeners;
    const state = { inFlight: null };
    listenerAttachmentState.set(client, state);

    client.attachEventListeners = function attachEventListenersSingleFlight(...args) {
        if (state.inFlight) return state.inFlight;

        const operation = Promise.resolve().then(() => original.apply(this, args));
        const tracked = operation.finally(() => {
            if (state.inFlight === tracked) state.inFlight = null;
        });
        state.inFlight = tracked;
        return tracked;
    };
    return client;
}

function isExistingMessageBindingError(error) {
    const message = String(error?.message || error || '');
    return message.includes('onAddMessageEvent')
        && message.includes('already exists');
}

async function triggerReadyRescue(client, options = {}) {
    const logger = options.logger || defaultLogger;
    const isStillPending = typeof options.isStillPending === 'function'
        ? options.isStillPending
        : () => true;

    if (!isStillPending()) {
        return { skipped: true, reason: 'not_pending' };
    }

    const page = client?.pupPage;
    if (!page || typeof page.evaluate !== 'function') {
        return { skipped: true, reason: 'page_unavailable' };
    }

    if (typeof client.attachEventListeners === 'function') {
        try {
            await client.attachEventListeners();
        } catch (error) {
            if (!isExistingMessageBindingError(error)) throw error;
            logger.info('[whatsapp] ready_rescue_binding_already_attached');
        }
    }

    if (!isStillPending()) {
        return { skipped: true, reason: 'not_pending_after_attach' };
    }

    const result = await page.evaluate(() => {
        const status = {
            href: typeof location !== 'undefined' ? location.href : '',
            title: typeof document !== 'undefined' ? document.title : '',
            wwebjs: typeof window.WWebJS,
            sync: typeof window.onAppStateHasSyncedEvent,
            add: typeof window.onAddMessageEvent,
            triggered: false
        };

        if (status.sync === 'function') {
            window.onAppStateHasSyncedEvent();
            status.triggered = true;
        }

        return status;
    });

    if (result?.triggered) {
        logger.info(`[whatsapp] ready rescue acionado: wwebjs=${result.wwebjs} add=${result.add}`);
    } else {
        logger.warn(`[whatsapp] ready rescue nao acionado: sync=${result?.sync || 'unknown'} wwebjs=${result?.wwebjs || 'unknown'}`);
    }

    return { skipped: false, result };
}

function scheduleReadyRescue(client, options = {}) {
    const delayMs = Number(options.delayMs || 15000);
    const retryDelayMs = Number(options.retryDelayMs || delayMs);
    const maxAttempts = Number.isInteger(Number(options.maxAttempts))
        ? Math.min(3, Math.max(1, Number(options.maxAttempts)))
        : 3;
    const setTimeoutFn = options.setTimeoutFn || setTimeout;
    const clearTimeoutFn = options.clearTimeoutFn || clearTimeout;
    const logger = options.logger || defaultLogger;
    if (delayMs <= 0) return null;

    let attempt = 0;
    let cancelled = false;
    let timer = null;

    const isStillPending = typeof options.isStillPending === 'function'
        ? options.isStillPending
        : () => true;

    function scheduleNext(waitMs) {
        timer = setTimeoutFn(runAttempt, waitMs);
    }

    async function runAttempt() {
        timer = null;
        if (cancelled || !isStillPending()) return;

        attempt += 1;
        try {
            await triggerReadyRescue(client, {
                ...options,
                isStillPending: () => !cancelled && isStillPending()
            });
        } catch (error) {
            logger.warn(
                `[whatsapp] ready_rescue_failed attempt=${attempt} ` +
                defaultLogger.safeError(error)
            );
        }

        if (cancelled || !isStillPending()) return;
        if (attempt >= maxAttempts) {
            logger.warn(`[whatsapp] ready_rescue_exhausted attempts=${attempt}`);
            return;
        }
        scheduleNext(retryDelayMs);
    }

    scheduleNext(delayMs);
    return {
        cancel() {
            cancelled = true;
            if (timer !== null) {
                clearTimeoutFn(timer);
                timer = null;
            }
        }
    };
}

module.exports = {
    installSingleFlightListenerAttachment,
    isExistingMessageBindingError,
    scheduleReadyRescue,
    triggerReadyRescue
};
