const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const defaultLogger = require('../utils/logger');

const CANARY_MODES = new Set(['off', 'canary']);
const CANARY_DOMAINS = new Set([
    'accounts', 'bills', 'budget', 'cards', 'debts', 'expenses',
    'forecast', 'goals', 'income', 'quality', 'transfers'
]);
const CANARY_SOURCES = new Set(['central_read_model', 'personal_sheet']);
const registeredProcesses = new WeakSet();

function parseUniqueList(value) {
    return [...new Set(
        String(value || '')
            .split(/[\s,;]+/)
            .map(item => item.trim().toLowerCase())
            .filter(Boolean)
    )].sort();
}

function parseUserIds(value) {
    return [...new Set(
        String(value || '')
            .split(/[\s,;]+/)
            .map(item => item.trim())
            .filter(Boolean)
    )];
}

function validateSubset(items, allowed) {
    return items.length > 0 && items.every(item => allowed.has(item));
}

function applyFinancialIterativeCanaryRuntimeConfig({ env = process.env, config = {} } = {}) {
    const mode = String(config.FINANCIAL_ITERATIVE_CANARY_MODE || '').trim().toLowerCase();
    if (!CANARY_MODES.has(mode)) return { applied: false, reason: 'unsupported_mode' };

    const userIds = parseUserIds(config.FINANCIAL_ITERATIVE_CANARY_USER_IDS);
    const domains = parseUniqueList(config.FINANCIAL_ITERATIVE_CANARY_DOMAINS);
    const sources = parseUniqueList(config.FINANCIAL_ITERATIVE_CANARY_SOURCES);
    if (mode === 'canary' && userIds.length !== 2) {
        return { applied: false, reason: 'authorized_couple_required' };
    }
    if (mode === 'canary' && !validateSubset(domains, CANARY_DOMAINS)) {
        return { applied: false, reason: 'valid_domain_required' };
    }
    if (mode === 'canary' && !validateSubset(sources, CANARY_SOURCES)) {
        return { applied: false, reason: 'valid_source_required' };
    }

    env.FINANCIAL_ITERATIVE_CANARY_MODE = mode;
    env.FINANCIAL_ITERATIVE_CANARY_USER_IDS = mode === 'canary' ? userIds.join(',') : '';
    env.FINANCIAL_ITERATIVE_CANARY_DOMAINS = mode === 'canary' ? domains.join(',') : '';
    env.FINANCIAL_ITERATIVE_CANARY_SOURCES = mode === 'canary' ? sources.join(',') : '';
    return {
        applied: true,
        mode,
        allowlistedUserCount: mode === 'canary' ? userIds.length : 0,
        domains: mode === 'canary' ? domains : [],
        sources: mode === 'canary' ? sources : []
    };
}

function readFinancialIterativeCanaryRuntimeConfig({
    envFilePath = path.resolve(process.cwd(), '.env'),
    readFileSync = fs.readFileSync
} = {}) {
    const parsed = dotenv.parse(readFileSync(envFilePath));
    return {
        FINANCIAL_ITERATIVE_CANARY_MODE: parsed.FINANCIAL_ITERATIVE_CANARY_MODE,
        FINANCIAL_ITERATIVE_CANARY_USER_IDS: parsed.FINANCIAL_ITERATIVE_CANARY_USER_IDS,
        FINANCIAL_ITERATIVE_CANARY_DOMAINS: parsed.FINANCIAL_ITERATIVE_CANARY_DOMAINS,
        FINANCIAL_ITERATIVE_CANARY_SOURCES: parsed.FINANCIAL_ITERATIVE_CANARY_SOURCES
    };
}

function evaluateFinancialIterativeCanaryEligibility({
    userId = '',
    domain = '',
    source = '',
    env = process.env
} = {}) {
    const normalizedDomain = String(domain || '').trim().toLowerCase();
    const normalizedSource = String(source || '').trim().toLowerCase();
    const base = { domain: normalizedDomain || 'unknown', source: normalizedSource || 'unknown' };
    if (String(env.FINANCIAL_ITERATIVE_CANARY_MODE || 'off').trim().toLowerCase() !== 'canary') {
        return { eligible: false, reason: 'canary_disabled', ...base };
    }
    if (!parseUserIds(env.FINANCIAL_ITERATIVE_CANARY_USER_IDS).includes(String(userId || '').trim())) {
        return { eligible: false, reason: 'user_not_allowed', ...base };
    }
    if (!parseUniqueList(env.FINANCIAL_ITERATIVE_CANARY_DOMAINS).includes(normalizedDomain)) {
        return { eligible: false, reason: 'domain_not_enabled', ...base };
    }
    if (!parseUniqueList(env.FINANCIAL_ITERATIVE_CANARY_SOURCES).includes(normalizedSource)) {
        return { eligible: false, reason: 'source_not_enabled', ...base };
    }
    return { eligible: true, reason: 'eligible', ...base };
}

function registerFinancialIterativeCanaryRuntimeReload({
    processRef = process,
    logger = defaultLogger,
    readRuntimeConfig = readFinancialIterativeCanaryRuntimeConfig
} = {}) {
    if (registeredProcesses.has(processRef)) return false;
    processRef.on('SIGHUP', () => {
        try {
            const result = applyFinancialIterativeCanaryRuntimeConfig({
                env: processRef.env,
                config: readRuntimeConfig()
            });
            if (!result.applied) {
                logger.warn(`[financial-iterative-canary] recarga rejeitada: reason=${result.reason}`);
                return;
            }
            logger.info(
                `[financial-iterative-canary] recarga aplicada: mode=${result.mode} ` +
                `users=${result.allowlistedUserCount} domains=${result.domains.length} sources=${result.sources.length}`
            );
        } catch (_) {
            logger.warn('[financial-iterative-canary] recarga falhou; configuracao anterior preservada.');
        }
    });
    registeredProcesses.add(processRef);
    return true;
}

module.exports = {
    applyFinancialIterativeCanaryRuntimeConfig,
    readFinancialIterativeCanaryRuntimeConfig,
    evaluateFinancialIterativeCanaryEligibility,
    registerFinancialIterativeCanaryRuntimeReload,
    __test__: { parseUniqueList, parseUserIds }
};
