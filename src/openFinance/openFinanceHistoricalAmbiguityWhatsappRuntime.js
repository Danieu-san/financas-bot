'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { SchedulerMessageOutbox } = require('../jobs/schedulerMessageOutbox');
const {
    OpenFinanceHistoricalAmbiguityReviewStore
} = require('./openFinanceHistoricalAmbiguityReview');

const ATTEMPTED_DELIVERY_STATES = new Set([
    'in_flight',
    'accepted_unconfirmed',
    'delivered_confirmed'
]);

function providerMessageId(response) {
    return response?.id?._serialized || response?.id?.id || response?.id
        || response?.messageId || response?._data?.id?._serialized
        || response?._data?.id?.id || null;
}

function requireActors(values) {
    const actors = [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))];
    if (actors.length !== 2) {
        throw new Error('open_finance_historical_ambiguity_whatsapp_family_actors_required');
    }
    return actors;
}

function actorRef(actorWhatsappId) {
    return crypto.createHash('sha256').update(String(actorWhatsappId || '')).digest('hex');
}

function deliveryDedupeKey(reviewRef, actorWhatsappId) {
    return `historical-ambiguity-review:${reviewRef}:${actorRef(actorWhatsappId)}`;
}

class OpenFinanceHistoricalAmbiguityWhatsappRuntime {
    constructor({ reviewStore, outbox, client, authorizedWhatsAppIds = [],
        clock = () => new Date() } = {}) {
        if (!reviewStore || !outbox || !client || typeof client.sendMessage !== 'function') {
            throw new Error('open_finance_historical_ambiguity_whatsapp_dependencies_required');
        }
        this.reviewStore = reviewStore;
        this.outbox = outbox;
        this.client = client;
        this.authorizedWhatsAppIds = requireActors(authorizedWhatsAppIds);
        this.clock = clock;
    }

    #now() {
        const value = this.clock();
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) {
            throw new Error('open_finance_historical_ambiguity_whatsapp_clock_invalid');
        }
        return date.toISOString();
    }

    async prepareAndDeliver({ sealedState } = {}) {
        const prepared = this.reviewStore.prepare({ sealedState });
        const now = this.#now();
        let queued = 0;
        const jobRefs = [];
        for (const recipient of this.authorizedWhatsAppIds) {
            const result = this.outbox.enqueue({
                dedupeKey: deliveryDedupeKey(prepared.review_ref, recipient),
                jobKind: 'historical_ambiguity_review',
                recipient,
                message: prepared.reply,
                createdAt: now
            });
            jobRefs.push(result.jobRef);
            if (result.inserted) queued += 1;
        }
        const delivery = await this.#drain({
            now, limit: this.authorizedWhatsAppIds.length, jobRefs
        });
        return { queued, ...delivery, review_ref: prepared.review_ref, financial_writes: 0 };
    }

    async #drain({ now, limit, jobRefs }) {
        this.outbox.recoverExpiredAmbiguous({ now });
        this.outbox.purgeExpired({ now });
        const result = {
            transport_calls: 0,
            delivered_confirmed: 0,
            accepted_unconfirmed: 0,
            retry_scheduled: 0,
            financial_writes: 0
        };
        for (let index = 0; index < limit; index += 1) {
            const job = this.outbox.claimNext({ now, jobRefs });
            if (!job) break;
            result.transport_calls += 1;
            let response;
            try {
                response = await this.client.sendMessage(job.recipient, job.message);
            } catch (error) {
                if (error?.definitiveNoSend === true) {
                    const released = this.outbox.releaseFailure({
                        jobRef: job.jobRef, leaseToken: job.leaseToken, now
                    });
                    if (released.retryScheduled) result.retry_scheduled += 1;
                } else {
                    this.outbox.acknowledgeAccepted({
                        jobRef: job.jobRef, leaseToken: job.leaseToken, now
                    });
                    result.accepted_unconfirmed += 1;
                }
                continue;
            }
            const messageId = providerMessageId(response);
            if (messageId) {
                this.outbox.acknowledgeDelivered({
                    jobRef: job.jobRef,
                    leaseToken: job.leaseToken,
                    providerMessageId: String(messageId),
                    now
                });
                result.delivered_confirmed += 1;
            } else {
                this.outbox.acknowledgeAccepted({
                    jobRef: job.jobRef, leaseToken: job.leaseToken, now
                });
                result.accepted_unconfirmed += 1;
            }
        }
        return result;
    }

    handlePublicReply({ actorWhatsappId, body } = {}) {
        const actor = String(actorWhatsappId || '').trim();
        if (!this.authorizedWhatsAppIds.includes(actor)) {
            return { handled: false, financial_writes: 0 };
        }
        const eligibility = this.reviewStore.inspectPublicReply({ actorWhatsappId: actor });
        if (!eligibility.eligible) return { handled: false, financial_writes: 0 };
        const deliveryState = this.outbox.getDeliveryStateByDedupeKey(
            deliveryDedupeKey(eligibility.review_ref, actor)
        );
        if (!ATTEMPTED_DELIVERY_STATES.has(deliveryState)) {
            return { handled: false, financial_writes: 0 };
        }
        return this.reviewStore.handleReply({ actorWhatsappId: actor, body });
    }

    close() {
        this.reviewStore?.close?.();
        this.outbox?.close?.();
    }
}

let runtime = null;
let runtimeLogger = null;

async function initializeOpenFinanceHistoricalAmbiguityWhatsappRuntime({
    client,
    logger = null,
    env = process.env
} = {}) {
    runtimeLogger = logger;
    const mode = String(env.OPEN_FINANCE_HISTORICAL_AMBIGUITY_REVIEW_MODE || 'off')
        .trim().toLowerCase();
    if (mode === 'off') {
        runtime?.close?.();
        runtime = null;
        return { enabled: false, mode: 'off', financial_writes: 0 };
    }
    if (mode !== 'prompt') {
        logger?.warn?.('[open-finance-historical-review] invalid_mode_blocked');
        runtime?.close?.();
        runtime = null;
        return { enabled: false, mode: 'off', financial_writes: 0 };
    }
    let reviewStore = null;
    let outbox = null;
    try {
        const authorizedWhatsAppIds = requireActors(String(
            env.OPEN_FINANCE_HISTORICAL_AMBIGUITY_REVIEW_ACTOR_IDS || ''
        ).split(','));
        const sealedStateFile = String(
            env.OPEN_FINANCE_HISTORICAL_AMBIGUITY_REVIEW_SEALED_STATE_FILE || ''
        ).trim();
        if (!sealedStateFile || !path.isAbsolute(sealedStateFile)) {
            throw new Error('open_finance_historical_ambiguity_whatsapp_state_file_required');
        }
        const sealedState = fs.readFileSync(sealedStateFile, 'utf8').trim();
        if (!sealedState) {
            throw new Error('open_finance_historical_ambiguity_whatsapp_state_file_invalid');
        }
        const secret = String(
            env.OPEN_FINANCE_HISTORICAL_AMBIGUITY_REVIEW_SECRET
            || env.STATE_STORE_ENCRYPTION_KEY
            || ''
        ).trim();
        reviewStore = new OpenFinanceHistoricalAmbiguityReviewStore({
            databasePath: String(env.OPEN_FINANCE_HISTORICAL_AMBIGUITY_REVIEW_DB_PATH
                || path.resolve(process.cwd(), 'data', 'open-finance-historical-ambiguity-review.sqlite')),
            secret,
            familyScope: String(env.OPEN_FINANCE_HISTORICAL_AMBIGUITY_REVIEW_FAMILY_SCOPE
                || 'shared-family'),
            authorizedWhatsAppIds
        });
        outbox = new SchedulerMessageOutbox({
            databasePath: String(env.OPEN_FINANCE_HISTORICAL_AMBIGUITY_REVIEW_OUTBOX_DB_PATH
                || path.resolve(process.cwd(), 'data', 'open-finance-historical-ambiguity-review-outbox.sqlite')),
            encryptionKey: String(env.STATE_STORE_ENCRYPTION_KEY || '').trim()
        });
        runtime?.close?.();
        runtime = new OpenFinanceHistoricalAmbiguityWhatsappRuntime({
            reviewStore, outbox, client, authorizedWhatsAppIds
        });
        const activation = await runtime.prepareAndDeliver({ sealedState });
        return { enabled: true, mode: 'prompt', actor_count: 2,
            queued: activation.queued,
            transport_calls: activation.transport_calls,
            delivered_confirmed: activation.delivered_confirmed,
            accepted_unconfirmed: activation.accepted_unconfirmed,
            financial_writes: 0 };
    } catch (error) {
        if (runtime?.reviewStore === reviewStore && runtime?.outbox === outbox) {
            runtime.close();
        } else {
            reviewStore?.close?.();
            outbox?.close?.();
            runtime?.close?.();
        }
        logger?.warn?.('[open-finance-historical-review] configuration_blocked');
        runtime = null;
        return { enabled: false, mode: 'off', financial_writes: 0,
            reason: 'configuration_invalid' };
    }
}

function tryHandleOpenFinanceHistoricalAmbiguityReply({ actorWhatsappId, body } = {}) {
    if (!runtime) return { handled: false, financial_writes: 0 };
    try {
        return runtime.handlePublicReply({ actorWhatsappId, body });
    } catch (error) {
        runtimeLogger?.warn?.('[open-finance-historical-review] reply_blocked');
        return {
            handled: true,
            reply: 'Nao consegui abrir a revisao agora. Nada foi salvo.',
            financial_writes: 0,
            blocked: true
        };
    }
}

async function prepareAndDeliverOpenFinanceHistoricalAmbiguityReview({ sealedState } = {}) {
    if (!runtime) throw new Error('open_finance_historical_ambiguity_whatsapp_runtime_disabled');
    return runtime.prepareAndDeliver({ sealedState });
}

function setRuntimeForTests(value) {
    runtime?.close?.();
    runtime = value || null;
    runtimeLogger = null;
}

module.exports = {
    OpenFinanceHistoricalAmbiguityWhatsappRuntime,
    initializeOpenFinanceHistoricalAmbiguityWhatsappRuntime,
    prepareAndDeliverOpenFinanceHistoricalAmbiguityReview,
    tryHandleOpenFinanceHistoricalAmbiguityReply,
    __test__: { deliveryDedupeKey, providerMessageId, setRuntimeForTests }
};
