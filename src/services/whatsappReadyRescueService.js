async function triggerReadyRescue(client, options = {}) {
    const logger = options.logger || console;
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
        await client.attachEventListeners();
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
    const setTimeoutFn = options.setTimeoutFn || setTimeout;
    const logger = options.logger || console;
    if (delayMs <= 0) return null;

    return setTimeoutFn(() => {
        void triggerReadyRescue(client, options).catch(error => {
            logger.warn('[whatsapp] ready rescue falhou: ' + error.message);
        });
    }, delayMs);
}

module.exports = {
    scheduleReadyRescue,
    triggerReadyRescue
};
