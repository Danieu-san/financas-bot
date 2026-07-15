const crypto = require('crypto');

const DATA_EVENTS = new Set([
    'item/created',
    'item/updated',
    'item/deleted',
    'item/error',
    'item/waiting_user_input',
    'item/waiting_user_action',
    'item/login_succeeded',
    'transactions/created',
    'transactions/updated',
    'transactions/deleted'
]);
const REFRESH_EVENTS = new Set([
    'item/created',
    'item/updated',
    'transactions/created',
    'transactions/updated',
    'transactions/deleted'
]);

function opaqueId(value, field) {
    const text = String(value || '').trim();
    if (!text || text.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(text)) throw new Error(`invalid_${field}`);
    return text;
}

function verifyWebhookToken(headers = {}, expectedToken) {
    const expected = String(expectedToken || '');
    if (expected.length < 16) throw new Error('webhook_secret_required');
    const supplied = String(headers['x-finbot-webhook-token'] || headers['X-Finbot-Webhook-Token'] || '');
    const left = Buffer.from(supplied);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) throw new Error('webhook_unauthorized');
    return true;
}

function normalizePluggyDataWebhook(payload = {}) {
    const event = String(payload.event || '').trim().toLowerCase();
    if (!DATA_EVENTS.has(event)) throw new Error('unsupported_or_non_data_webhook');
    const eventId = opaqueId(payload.eventId || payload.event_id, 'webhook_event_id');
    const itemId = opaqueId(payload.itemId || payload.item_id, 'webhook_item_id');
    const transactionIds = (payload.transactionIds || payload.transaction_ids || []).map((id) => opaqueId(id, 'webhook_transaction_id'));
    if (transactionIds.length > 500) throw new Error('webhook_transaction_limit_exceeded');
    return Object.freeze({
        event,
        event_id: eventId,
        item_id: itemId,
        transaction_ids: Object.freeze(transactionIds),
        action: event === 'item/deleted' ? 'revoke_item' : (REFRESH_EVENTS.has(event) ? 'refresh_staging' : 'observe_only')
    });
}

class PluggySandboxWebhookProcessor {
    constructor(options = {}) {
        if (!options.transport) throw new Error('sandbox_transport_required');
        if (!options.store) throw new Error('staging_store_required');
        this.transport = options.transport;
        this.store = options.store;
        this.webhookSecret = options.webhookSecret;
    }

    accept(headers, payload) {
        verifyWebhookToken(headers, this.webhookSecret);
        const job = normalizePluggyDataWebhook(payload);
        return { status: 202, accepted: true, job };
    }

    process(job) {
        if (job.action === 'observe_only') return { outcome: 'observed', network_calls: 0, financial_writes: 0 };
        if (job.action === 'revoke_item') {
            this.store.revokeItem(job.item_id, { reasonCode: 'provider_item_deleted' });
            return { outcome: 'revoked', network_calls: 0, financial_writes: 0 };
        }
        try {
            const snapshot = this.transport.fetchSnapshot(job);
            const result = this.store.ingestSnapshot(snapshot);
            return { outcome: result.blocked ? 'blocked' : (result.replay ? 'replay' : 'staged'), network_calls: 0, financial_writes: 0 };
        } catch (error) {
            if (error && error.code === 'rate_limited') {
                return {
                    outcome: 'retry',
                    reason: 'rate_limited',
                    retry_after_seconds: Math.min(60, Math.max(1, Number(error.retryAfterSeconds) || 60)),
                    network_calls: 0,
                    financial_writes: 0
                };
            }
            throw error;
        }
    }
}

module.exports = {
    DATA_EVENTS,
    PluggySandboxWebhookProcessor,
    normalizePluggyDataWebhook,
    verifyWebhookToken
};
