'use strict';

const { initializeScheduler } = require('../jobs/scheduler');
const {
    initializeOpenFinanceCanaryRuntime
} = require('../openFinance/openFinanceCanaryRuntime');
const {
    initializeOpenFinanceHistoricalAmbiguityWhatsappRuntime
} = require('../openFinance/openFinanceHistoricalAmbiguityWhatsappRuntime');
const { handleMessageForBackfill } = require('../handlers/messageHandler');
const { backfillUnreadMessages } = require('./whatsappUnreadBackfillService');

const defaultDependencies = Object.freeze({
    initializeScheduler,
    initializeOpenFinanceCanaryRuntime,
    initializeOpenFinanceHistoricalAmbiguityWhatsappRuntime,
    handleMessageForBackfill,
    backfillUnreadMessages
});

function normalizedHistoricalReviewMode(env) {
    return String(env?.OPEN_FINANCE_HISTORICAL_AMBIGUITY_REVIEW_MODE || 'off')
        .trim().toLowerCase();
}

async function initializeWhatsappReadyServices({
    client,
    logger = null,
    env = process.env,
    startupUnixSeconds = Math.floor(Date.now() / 1000),
    unreadBackfillLookbackSeconds = 60,
    dependencies = {}
} = {}) {
    const deps = { ...defaultDependencies, ...dependencies };
    deps.initializeScheduler(client);

    const historicalReview = await deps.initializeOpenFinanceHistoricalAmbiguityWhatsappRuntime({
        client, logger, env
    });
    logger?.info?.(
        `[open-finance-historical-review] initialized enabled=${historicalReview.enabled} `
        + `mode=${historicalReview.mode} writes=${historicalReview.financial_writes}`
    );

    deps.initializeOpenFinanceCanaryRuntime({ client, logger });

    const requestedMode = normalizedHistoricalReviewMode(env);
    if (requestedMode !== 'off'
        && !(historicalReview.enabled === true && historicalReview.mode === 'prompt')) {
        logger?.warn?.('[open-finance-historical-review] unread_backfill_blocked_not_ready');
        return {
            historicalReview,
            backfill: {
                skipped: true,
                reason: 'historical_review_not_ready',
                processed: 0
            },
            financial_writes: 0
        };
    }

    const backfill = await deps.backfillUnreadMessages(client, deps.handleMessageForBackfill, {
        logger,
        enabled: String(env.WHATSAPP_UNREAD_BACKFILL_ON_READY || 'true').toLowerCase() !== 'false',
        delayMs: Number(env.WHATSAPP_UNREAD_BACKFILL_DELAY_MS || 3000),
        maxPerChat: Number(env.WHATSAPP_UNREAD_BACKFILL_MAX_PER_CHAT || 20),
        maxAttempts: Number(env.WHATSAPP_UNREAD_BACKFILL_MAX_ATTEMPTS || 3),
        retryDelayMs: Number(env.WHATSAPP_UNREAD_BACKFILL_RETRY_DELAY_MS || 5000),
        notBeforeTimestamp: Math.max(
            0,
            Number(startupUnixSeconds) - Number(unreadBackfillLookbackSeconds)
        )
    });

    return { historicalReview, backfill, financial_writes: 0 };
}

module.exports = {
    initializeWhatsappReadyServices,
    __test__: { normalizedHistoricalReviewMode }
};
