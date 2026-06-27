const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const RUNTIME_MODES = new Set(['off', 'shadow', 'canary']);
const ROUTABLE_OPERATIONS = new Set(['bill.pay', 'debt.pay', 'invoice.pay', 'expense.create', 'income.create']);
const DEFAULT_ROUTE_OPERATIONS = ['bill.pay'];
const registeredProcesses = new WeakSet();

function parseAllowlistedUserIds(value) {
    return [...new Set(
        String(value || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
    )];
}

function parseRouteOperations(value) {
    const requested = String(value || '').trim()
        ? parseAllowlistedUserIds(value)
        : DEFAULT_ROUTE_OPERATIONS;
    const unknown = requested.filter(operation => !ROUTABLE_OPERATIONS.has(operation));
    return {
        operations: unknown.length > 0 ? [] : requested,
        unknown
    };
}

function shouldRouteFinancialCommandOperation(operation, { env = process.env } = {}) {
    if (String(env.FINANCIAL_COMMAND_PLANNER_MODE || '').trim().toLowerCase() === 'route') {
        return ROUTABLE_OPERATIONS.has(operation);
    }
    const parsed = parseRouteOperations(env.FINANCIAL_COMMAND_PLANNER_ROUTE_OPERATIONS);
    return parsed.unknown.length === 0 && parsed.operations.includes(operation);
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
    const routeOperations = parseRouteOperations(config.FINANCIAL_COMMAND_PLANNER_ROUTE_OPERATIONS);
    if (routeOperations.unknown.length > 0) {
        return { applied: false, reason: 'unsupported_route_operation' };
    }

    env.FINANCIAL_COMMAND_PLANNER_MODE = mode;
    env.FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS = mode === 'canary'
        ? allowlistedUserIds.join(',')
        : '';
    env.FINANCIAL_COMMAND_PLANNER_ROUTE_OPERATIONS = routeOperations.operations.join(',');

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
        FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS: parsed.FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS,
        FINANCIAL_COMMAND_PLANNER_ROUTE_OPERATIONS: parsed.FINANCIAL_COMMAND_PLANNER_ROUTE_OPERATIONS
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
    shouldRouteFinancialCommandOperation,
    __test__: {
        parseAllowlistedUserIds,
        parseRouteOperations
    }
};