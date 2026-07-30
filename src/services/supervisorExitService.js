const fallbackLogger = Object.freeze({
    error() {}
});

function createSupervisorExitRequester(options = {}) {
    const logger = options.logger || fallbackLogger;
    const exitFn = typeof options.exitFn === 'function'
        ? options.exitFn
        : code => process.exit(code);
    const setTimeoutFn = options.setTimeoutFn || setTimeout;
    const delayMs = Number.isFinite(Number(options.delayMs))
        ? Math.max(0, Number(options.delayMs))
        : 1500;
    let requested = false;

    function request(reasonCode = 'unknown') {
        if (requested) return false;
        requested = true;
        logger.error(`[whatsapp] unavailable reason_code=${String(reasonCode || 'unknown')}`);
        setTimeoutFn(() => exitFn(1), delayMs);
        return true;
    }

    function isRequested() {
        return requested;
    }

    return {
        isRequested,
        request
    };
}

module.exports = {
    createSupervisorExitRequester
};
