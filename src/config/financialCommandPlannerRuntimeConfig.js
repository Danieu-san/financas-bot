const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const RUNTIME_MODES = new Set(['off', 'shadow', 'canary']);
const registeredProcesses = new WeakSet();

function parseAllowlistedUserIds(value) {
    return [...new Set(
        String(value || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
    )];
}

function applyFinancialCommandPlannerRuntimeConfig({ env = process.env, config = {} } = {}) {
    const mode = String(config.FINANCIAL_COMMAND_PLANNER_MODE || '').trim().toLowerCase();
    if (!RUNTIME_MODES.has(mode)) {
        return { applied: false, reason: 'unsupported_mode' };
    }

    const allowlistedUserIds = parseAllowlistedUserIds(
        config.FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS
    );
    if (mode === 'canary' && allowlistedUserIds.length === 0) {
        return { applied: false, reason: 'canary_allowlist_required' };
    }

    env.FINANCIAL_COMMAND_PLANNER_MODE = mode;
    env.FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS = mode === 'canary'
        ? allowlistedUserIds.join(',')
        : '';

    return {
        applied: true,
        mode,
        allowlistedUserCount: mode === 'canary' ? allowlistedUserIds.length : 0
    };
}

function readFinancialCommandPlannerRuntimeConfig({
    envFilePath = path.resolve(process.cwd(), '.env'),
    readFileSync = fs.readFileSync
} = {}) {
    const parsed = dotenv.parse(readFileSync(envFilePath));
    return {
        FINANCIAL_COMMAND_PLANNER_MODE: parsed.FINANCIAL_COMMAND_PLANNER_MODE,
        FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS: parsed.FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS
    };
}

function registerFinancialCommandPlannerRuntimeReload({
    processRef = process,
    logger = console,
    readRuntimeConfig = readFinancialCommandPlannerRuntimeConfig
} = {}) {
    if (registeredProcesses.has(processRef)) return false;

    processRef.on('SIGHUP', () => {
        try {
            const result = applyFinancialCommandPlannerRuntimeConfig({
                env: processRef.env,
                config: readRuntimeConfig()
            });
            if (!result.applied) {
                logger.warn(`[command-planner] recarga SIGHUP rejeitada: reason=${result.reason}`);
                return;
            }
            logger.info(
                `[command-planner] recarga SIGHUP aplicada: mode=${result.mode} ` +
                `allowlisted_users=${result.allowlistedUserCount}`
            );
        } catch (error) {
            logger.warn('[command-planner] recarga SIGHUP falhou; configuracao anterior preservada.');
        }
    });
    registeredProcesses.add(processRef);
    return true;
}

module.exports = {
    applyFinancialCommandPlannerRuntimeConfig,
    readFinancialCommandPlannerRuntimeConfig,
    registerFinancialCommandPlannerRuntimeReload,
    __test__: {
        parseAllowlistedUserIds
    }
};