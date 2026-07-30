const fallbackLogger = Object.freeze({
    info() {},
    warn() {},
    error() {}
});

function positiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function classifyFailure(error, fallback = 'probe_error') {
    const message = String(error?.message || error || '').toLowerCase();
    if (
        message.includes('runtime.callfunctionon')
        || (message.includes('protocol') && message.includes('timed out'))
    ) {
        return 'protocol_timeout';
    }
    if (error?.code === 'WHATSAPP_PROBE_TIMEOUT') {
        return 'probe_timeout';
    }
    return fallback;
}

function withTimeout(promise, timeoutMs) {
    let timer = null;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const error = new Error('WhatsApp liveness probe timed out.');
            error.code = 'WHATSAPP_PROBE_TIMEOUT';
            reject(error);
        }, timeoutMs);
    });

    return Promise.race([promise, timeout]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}

function createWhatsAppLivenessMonitor(options = {}) {
    const probe = typeof options.probe === 'function'
        ? options.probe
        : async () => null;
    const onUnhealthy = typeof options.onUnhealthy === 'function'
        ? options.onUnhealthy
        : () => {};
    const logger = options.logger || fallbackLogger;
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    const failureThreshold = positiveInteger(options.failureThreshold, 2);
    const probeTimeoutMs = positiveInteger(options.probeTimeoutMs, 15000);
    const probeIntervalMs = positiveInteger(options.probeIntervalMs, 60000);
    const setIntervalFn = options.setIntervalFn || setInterval;
    const clearIntervalFn = options.clearIntervalFn || clearInterval;

    let status = 'starting';
    let liveness = 'pending';
    let consecutiveFailures = 0;
    let recoveryRequested = false;
    let lastSuccessAt = null;
    let lastFailureAt = null;
    let lastReason = null;
    let probeInFlight = null;
    let probeTimedOut = false;
    let intervalHandle = null;

    function getSnapshot() {
        return Object.freeze({
            status,
            liveness,
            consecutiveFailures,
            recoveryRequested,
            lastSuccessAt,
            lastFailureAt,
            lastReason
        });
    }

    function resetPending(nextStatus) {
        status = nextStatus;
        liveness = 'pending';
        consecutiveFailures = 0;
        lastReason = null;
    }

    function markStarting() {
        resetPending('starting');
    }

    function markQrPending() {
        resetPending('qr_pending');
    }

    function markAuthenticated() {
        resetPending('authenticated');
    }

    function markReady() {
        if (recoveryRequested) return;
        status = 'ready';
        liveness = 'healthy';
        consecutiveFailures = 0;
        lastSuccessAt = now();
        lastReason = null;
    }

    function markStopped(reason = 'stopped') {
        status = 'stopped';
        liveness = 'stopped';
        lastReason = String(reason || 'stopped');
    }

    function isRuntimeProbeEligible() {
        return !recoveryRequested && (status === 'ready' || status === 'degraded');
    }

    function recordFailure(reason) {
        if (!isRuntimeProbeEligible()) {
            return { skipped: true, reason: 'not_ready' };
        }

        const normalizedReason = String(reason || 'probe_error');
        status = 'degraded';
        liveness = 'degraded';
        consecutiveFailures += 1;
        lastFailureAt = now();
        lastReason = normalizedReason;

        logger.warn(
            `[whatsapp] liveness_failed reason_code=${normalizedReason} `
            + `consecutive=${consecutiveFailures} threshold=${failureThreshold}`
        );

        if (consecutiveFailures >= failureThreshold && !recoveryRequested) {
            recoveryRequested = true;
            logger.error(`[whatsapp] liveness_recovery_requested reason_code=${normalizedReason}`);
            try {
                onUnhealthy(normalizedReason);
            } catch {
                logger.error('[whatsapp] liveness_recovery_callback_failed');
            }
        }

        return {
            ok: false,
            reason: normalizedReason,
            consecutiveFailures,
            recoveryRequested
        };
    }

    function recordSuccess() {
        if (recoveryRequested) {
            return { skipped: true, reason: 'recovery_requested' };
        }
        status = 'ready';
        liveness = 'healthy';
        consecutiveFailures = 0;
        lastSuccessAt = now();
        lastReason = null;
        return { ok: true, state: 'CONNECTED' };
    }

    async function executeProbe(activeProbe) {
        try {
            const state = await withTimeout(
                activeProbe,
                probeTimeoutMs
            );
            if (String(state || '').toUpperCase() !== 'CONNECTED') {
                return recordFailure('state_not_connected');
            }
            return recordSuccess();
        } catch (error) {
            if (error?.code === 'WHATSAPP_PROBE_TIMEOUT') {
                probeTimedOut = true;
            }
            return recordFailure(classifyFailure(error));
        }
    }

    function runProbe() {
        if (!isRuntimeProbeEligible()) {
            return Promise.resolve({
                skipped: true,
                reason: recoveryRequested ? 'recovery_requested' : 'not_ready'
            });
        }
        if (probeInFlight) {
            if (probeTimedOut) {
                return Promise.resolve(recordFailure('probe_still_in_flight'));
            }
            return Promise.resolve({
                skipped: true,
                reason: 'probe_in_flight'
            });
        }

        const activeProbe = Promise.resolve().then(() => probe());
        probeInFlight = activeProbe;
        probeTimedOut = false;
        void activeProbe.then(state => {
            if (
                probeTimedOut
                && String(state || '').toUpperCase() === 'CONNECTED'
                && !recoveryRequested
            ) {
                recordSuccess();
            }
        }).catch(() => {}).finally(() => {
            if (probeInFlight === activeProbe) {
                probeInFlight = null;
                probeTimedOut = false;
            }
        });
        return executeProbe(activeProbe);
    }

    function recordTransportFailure(error) {
        return recordFailure(classifyFailure(error, 'transport_error'));
    }

    function start() {
        if (intervalHandle) return intervalHandle;
        intervalHandle = setIntervalFn(() => {
            void runProbe().catch(error => {
                logger.warn(`[whatsapp] liveness_probe_internal_error reason_code=${classifyFailure(error)}`);
            });
        }, probeIntervalMs);
        intervalHandle?.unref?.();
        return intervalHandle;
    }

    function stop() {
        if (intervalHandle) {
            clearIntervalFn(intervalHandle);
            intervalHandle = null;
        }
    }

    return {
        getSnapshot,
        markStarting,
        markQrPending,
        markAuthenticated,
        markReady,
        markStopped,
        recordTransportFailure,
        runProbe,
        start,
        stop
    };
}

module.exports = {
    classifyFailure,
    createWhatsAppLivenessMonitor
};
