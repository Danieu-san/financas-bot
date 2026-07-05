const VALID_PROJECTION_MODES = new Set(['off', 'shadow']);
const VALID_CANARY_READ_DOMAINS = new Set([
    'transactions',
    'accounts',
    'transfers',
    'forecast',
    'bills',
    'cards',
    'debts',
    'goals'
]);

function enabled(value) {
    return String(value || '').trim().toLowerCase() === 'true';
}

function projectionMode(value, blockers) {
    const normalized = String(value || 'off').trim().toLowerCase();
    if (VALID_PROJECTION_MODES.has(normalized)) return normalized;
    blockers.push('invalid_projection_mode');
    return 'off';
}

function canaryDomains(value, blockers) {
    const domains = [];
    const seen = new Set();

    for (const rawDomain of String(value || '').split(',')) {
        const domain = rawDomain.trim().toLowerCase();
        if (!domain || seen.has(domain)) continue;
        seen.add(domain);
        if (!VALID_CANARY_READ_DOMAINS.has(domain)) {
            blockers.push(`unknown_canary_domain:${domain}`);
            continue;
        }
        domains.push(domain);
    }

    return domains;
}

function buildCanonicalLedgerRolloutPolicy(env = process.env) {
    const blockers = [];
    const isProduction = String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
    const mode = projectionMode(env.CANONICAL_LEDGER_PROJECTION_MODE, blockers);
    const shadowWriteRequested = enabled(env.CANONICAL_LEDGER_SHADOW_WRITE_ENABLED);
    const productionShadowApproved = enabled(env.CANONICAL_LEDGER_PRODUCTION_SHADOW_APPROVED);
    const canaryReadRequested = enabled(env.CANONICAL_LEDGER_CANARY_READ_ENABLED);
    const canaryReadApproved = enabled(env.CANONICAL_LEDGER_CANARY_READ_APPROVED);
    const domains = canaryDomains(env.CANONICAL_LEDGER_CANARY_READ_DOMAINS, blockers);

    if (isProduction && mode === 'shadow' && shadowWriteRequested && !productionShadowApproved) {
        blockers.push('production_shadow_not_approved');
    }
    if (canaryReadRequested && domains.length === 0) {
        blockers.push('canary_domains_empty');
    }
    if (isProduction && canaryReadRequested && !canaryReadApproved) {
        blockers.push('production_canary_read_not_approved');
    }

    const shadowWritesAllowed = mode === 'shadow'
        && shadowWriteRequested
        && (!isProduction || productionShadowApproved);
    if (canaryReadRequested && !shadowWritesAllowed) {
        blockers.push('canary_requires_shadow_projection');
    }
    const canaryReadsAllowed = canaryReadRequested
        && domains.length > 0
        && shadowWritesAllowed
        && (!isProduction || canaryReadApproved);
    const allowedDomains = new Set(canaryReadsAllowed ? domains : []);

    return {
        projectionMode: mode,
        shadowWritesAllowed,
        canaryReadsAllowed,
        canaryReadDomains: domains,
        blockers,
        canReadDomain(domain) {
            return allowedDomains.has(String(domain || '').trim().toLowerCase());
        }
    };
}

function canonicalLedgerRollbackEnv() {
    return {
        CANONICAL_LEDGER_PROJECTION_MODE: 'off',
        CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'false',
        CANONICAL_LEDGER_PRODUCTION_SHADOW_APPROVED: 'false',
        CANONICAL_LEDGER_CANARY_READ_ENABLED: 'false',
        CANONICAL_LEDGER_CANARY_READ_APPROVED: 'false',
        CANONICAL_LEDGER_CANARY_READ_DOMAINS: ''
    };
}

module.exports = {
    VALID_PROJECTION_MODES,
    VALID_CANARY_READ_DOMAINS,
    buildCanonicalLedgerRolloutPolicy,
    canonicalLedgerRollbackEnv
};
