const {
    readCanonicalLedgerCanaryDomain
} = require('./canonicalLedgerReceiptProjector');

async function readCanonicalLedgerCanaryWithFallback({
    legacyReader,
    ...input
} = {}) {
    if (typeof legacyReader !== 'function') {
        throw new Error('legacyReader is required for canonical canary fallback.');
    }

    try {
        const canonical = readCanonicalLedgerCanaryDomain(input);
        if (canonical.enabled) {
            if (!Array.isArray(canonical.rows) || canonical.rows.length === 0) {
                return {
                    source: 'legacy',
                    rows: await legacyReader(),
                    fallbackReason: 'canonical_empty'
                };
            }
            return {
                source: 'canonical',
                rows: canonical.rows,
                fallbackReason: null
            };
        }
        return {
            source: 'legacy',
            rows: await legacyReader(),
            fallbackReason: canonical.reason
        };
    } catch (error) {
        return {
            source: 'legacy',
            rows: await legacyReader(),
            fallbackReason: 'canonical_read_failed'
        };
    }
}

module.exports = {
    readCanonicalLedgerCanaryWithFallback
};
