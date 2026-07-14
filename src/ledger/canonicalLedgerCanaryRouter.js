const {
    readCanonicalLedgerCanaryDomain
} = require('./canonicalLedgerReceiptProjector');
const { recordLegacyUsageEvent } = require('../telemetry/legacyUsageTelemetry');

async function readCanonicalLedgerCanaryWithFallback({
    legacyReader,
    ...input
} = {}) {
    if (typeof legacyReader !== 'function') {
        throw new Error('legacyReader is required for canonical canary fallback.');
    }

    let result;
    try {
        const canonical = readCanonicalLedgerCanaryDomain(input);
        if (canonical.enabled) {
            if (!Array.isArray(canonical.rows) || canonical.rows.length === 0) {
                result = {
                    source: 'legacy',
                    rows: await legacyReader(),
                    fallbackReason: 'canonical_empty'
                };
            } else {
                result = {
                    source: 'canonical',
                    rows: canonical.rows,
                    fallbackReason: null
                };
            }
        } else {
            result = {
                source: 'legacy',
                rows: await legacyReader(),
                fallbackReason: canonical.reason
            };
        }
    } catch (error) {
        result = {
            source: 'legacy',
            rows: await legacyReader(),
            fallbackReason: 'canonical_read_failed'
        };
    }

    const usedFallback = result.source === 'legacy';
    const env = input.env || process.env;
    await recordLegacyUsageEvent({
        event: 'usage',
        surface: 'canonical_ledger',
        consumer: 'canonical_canary_router',
        handler: 'canonical_canary_router',
        route: 'canonical_canary_read',
        domain: input.domain,
        operation: usedFallback ? 'fallback' : 'read',
        source: result.source,
        fallbackFrom: usedFallback ? 'canonical' : 'none',
        fallbackTo: usedFallback ? 'legacy' : 'none',
        mode: String(env.CANONICAL_LEDGER_CANARY_READ_ENABLED || '').toLowerCase() === 'true' ? 'canary' : 'off',
        result: 'success',
        reasonCode: result.fallbackReason || 'none',
        writeAttempted: false,
        writeResult: 'not_attempted'
    }, { env });
    return result;
}

module.exports = {
    readCanonicalLedgerCanaryWithFallback
};
