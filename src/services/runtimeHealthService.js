const ALLOWED_WHATSAPP_STATUSES = new Set([
    'starting',
    'authenticated',
    'qr_pending',
    'ready',
    'degraded',
    'stopped'
]);

function sanitizeStatus(value) {
    const status = String(value || 'starting');
    return ALLOWED_WHATSAPP_STATUSES.has(status) ? status : 'starting';
}

function sanitizeLiveness(value) {
    const liveness = String(value || 'pending');
    return ['pending', 'healthy', 'degraded', 'stopped'].includes(liveness)
        ? liveness
        : 'pending';
}

function buildRuntimeHealthSnapshot({
    sqliteReady = false,
    whatsappHealth = {}
} = {}) {
    const sqlite = Boolean(sqliteReady);
    const whatsappStatus = sanitizeStatus(whatsappHealth?.status);
    const whatsappLiveness = sanitizeLiveness(whatsappHealth?.liveness);
    const whatsapp = whatsappStatus === 'ready' && whatsappLiveness === 'healthy';
    const ok = sqlite && whatsapp;

    return {
        statusCode: ok ? 200 : 503,
        payload: {
            ok,
            sqlite,
            whatsapp,
            whatsappStatus,
            whatsappLiveness
        }
    };
}

module.exports = {
    buildRuntimeHealthSnapshot
};
