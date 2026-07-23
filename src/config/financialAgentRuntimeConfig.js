const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const defaultLogger = require('../utils/logger');

const RUNTIME_MODES = new Set(['off', 'shadow', 'answer', 'canary']);
const registeredProcesses = new WeakSet();

function parseAllowlistedUserIds(value) {
    return [...new Set(
        String(value || '')
            .split(/[\s,;]+/)
            .map(item => item.trim())
            .filter(Boolean)
    )];
}

function applyFinancialAgentRuntimeConfig({ env = process.env, config = {} } = {}) {
    const mode = String(config.FINANCIAL_AGENT_MODE || '').trim().toLowerCase();
    if (!RUNTIME_MODES.has(mode)) {
        return { applied: false, reason: 'unsupported_mode' };
    }

    const allowlistedUserIds = parseAllowlistedUserIds(
        config.FINANCIAL_AGENT_CANARY_USER_IDS
    );
    if (mode === 'canary' && allowlistedUserIds.length !== 2) {
        return { applied: false, reason: 'authorized_couple_required' };
    }

    env.FINANCIAL_AGENT_MODE = mode;
    env.FINANCIAL_AGENT_CANARY_USER_IDS = mode === 'canary'
        ? allowlistedUserIds.join(',')
        : '';

    return {
        applied: true,
        mode,
        allowlistedUserCount: mode === 'canary' ? allowlistedUserIds.length : 0
    };
}

function readFinancialAgentRuntimeConfig({
    envFilePath = path.resolve(process.cwd(), '.env'),
    readFileSync = fs.readFileSync
} = {}) {
    const parsed = dotenv.parse(readFileSync(envFilePath));
    return {
        FINANCIAL_AGENT_MODE: parsed.FINANCIAL_AGENT_MODE,
        FINANCIAL_AGENT_CANARY_USER_IDS: parsed.FINANCIAL_AGENT_CANARY_USER_IDS
    };
}

function registerFinancialAgentRuntimeReload({
    processRef = process,
    logger = defaultLogger,
    readRuntimeConfig = readFinancialAgentRuntimeConfig
} = {}) {
    if (registeredProcesses.has(processRef)) return false;

    processRef.on('SIGHUP', () => {
        try {
            const result = applyFinancialAgentRuntimeConfig({
                env: processRef.env,
                config: readRuntimeConfig()
            });
            if (!result.applied) {
                logger.warn(`[financial-agent] recarga SIGHUP rejeitada: reason=${result.reason}`);
                return;
            }
            logger.info(
                `[financial-agent] recarga SIGHUP aplicada: mode=${result.mode} ` +
                `allowlisted_users=${result.allowlistedUserCount}`
            );
        } catch (error) {
            logger.warn('[financial-agent] recarga SIGHUP falhou; configuracao anterior preservada.');
        }
    });
    registeredProcesses.add(processRef);
    return true;
}

module.exports = {
    applyFinancialAgentRuntimeConfig,
    readFinancialAgentRuntimeConfig,
    registerFinancialAgentRuntimeReload,
    __test__: {
        parseAllowlistedUserIds
    }
};
