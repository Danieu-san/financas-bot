const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const { planFinancialCommandWithGemini } = require('./financialCommandPlanner');

const DEFAULT_TELEMETRY_PATH = path.resolve(process.cwd(), 'data', 'financial-command-planner-shadow.jsonl');
const VALID_MODES = new Set(['off', 'shadow', 'canary', 'route']);
const WRITE_OPERATIONS = new Set([
    'expense.create',
    'income.create',
    'bill.pay',
    'debt.pay',
    'invoice.pay',
    'transfer.create'
]);

function normalizeFinancialCommandPlannerMode(env = process.env) {
    const mode = String(env.FINANCIAL_COMMAND_PLANNER_MODE || 'off').trim().toLowerCase();
    return VALID_MODES.has(mode) ? mode : 'off';
}

function shouldRouteFinancialCommandPlanner({ env = process.env, userId = '' } = {}) {
    const mode = normalizeFinancialCommandPlannerMode(env);
    if (mode === 'route') return true;
    if (mode !== 'canary') return false;

    const trustedUserId = String(userId || '').trim();
    if (!trustedUserId) return false;
    const allowlistedUserIds = new Set(
        String(env.FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS || '')
            .split(',')
            .map(value => value.trim())
            .filter(Boolean)
    );
    return allowlistedUserIds.has(trustedUserId);
}

function shouldEvaluateFinancialCommandPlannerShadow({
    env = process.env,
    message = '',
    currentState = null,
    userId = ''
} = {}) {
    const mode = normalizeFinancialCommandPlannerMode(env);
    if (mode !== 'shadow' && mode !== 'canary') return false;
    if (mode === 'canary' && shouldRouteFinancialCommandPlanner({ env, userId })) return false;
    if (currentState) return false;
    return String(message || '').trim().length > 0;
}

function mapLegacyIntentToOperation(legacyStructuredResponse = {}) {
    const intent = String(legacyStructuredResponse?.intent || '').trim();
    if (intent === 'gasto') return 'expense.create';
    if (intent === 'entrada') return 'income.create';
    if (intent === 'registrar_pagamento') return 'debt.pay';
    return intent || 'unknown';
}

function buildFinancialCommandPlannerShadowDecision({
    legacyStructuredResponse = {},
    structuredResponseSource = '',
    plannerResult = {},
    evaluationLatencyMs = 0,
    mode = 'shadow',
    now = () => new Date()
} = {}) {
    const legacyOperation = mapLegacyIntentToOperation(legacyStructuredResponse);
    const plannerOperation = plannerResult?.plan?.operation || 'unknown';
    const divergenceSeverity = classifyDivergenceSeverity(legacyOperation, plannerOperation, plannerResult);
    const contextTools = Array.isArray(plannerResult?.plan?.contextRequests)
        ? plannerResult.plan.contextRequests
            .map(request => String(request?.tool || '').trim())
            .filter(Boolean)
            .slice(0, 5)
        : [];

    return {
        ts: now().toISOString(),
        mode,
        schemaVersion: 'financial-command-planner-shadow-v1',
        legacyOperation,
        legacyIntent: String(legacyStructuredResponse?.intent || ''),
        legacySource: String(structuredResponseSource || ''),
        plannerOk: Boolean(plannerResult?.ok),
        plannerOperation,
        plannerErrors: sanitizeStringList(plannerResult?.errors),
        missingFields: sanitizeStringList(plannerResult?.plan?.missingFields),
        contextTools,
        requiresConfirmation: Boolean(plannerResult?.plan?.requiresConfirmation),
        divergenceSeverity,
        divergenceType: divergenceSeverity === 'none' ? 'none' : 'operation_mismatch',
        evaluationLatencyMs: Number.isFinite(evaluationLatencyMs) ? Math.round(evaluationLatencyMs) : null
    };
}

function classifyDivergenceSeverity(legacyOperation, plannerOperation, plannerResult = {}) {
    if (!plannerResult?.ok) return 'none';
    if (!legacyOperation || !plannerOperation || plannerOperation === 'unknown') return 'none';
    if (legacyOperation === plannerOperation) return 'none';
    if (WRITE_OPERATIONS.has(legacyOperation) || WRITE_OPERATIONS.has(plannerOperation)) return 'critical';
    return 'warning';
}

function sanitizeFinancialCommandPlannerShadowRecord(input = {}, options = {}) {
    const decision = buildFinancialCommandPlannerShadowDecision({
        ...input,
        now: options.now || input.now
    });
    return {
        ...decision,
        senderFingerprint: fingerprint(input.senderId),
        messageFingerprint: fingerprint(input.message)
    };
}

function recordFinancialCommandPlannerShadow(input = {}, options = {}) {
    const env = options.env || process.env;
    const mode = normalizeFinancialCommandPlannerMode(env);
    if (mode !== 'shadow' && mode !== 'canary') {
        return { recorded: false, reason: 'disabled' };
    }

    const telemetryPath = options.telemetryPath || env.FINANCIAL_COMMAND_PLANNER_TELEMETRY_PATH || DEFAULT_TELEMETRY_PATH;
    const telemetry = sanitizeFinancialCommandPlannerShadowRecord({
        ...input,
        mode
    }, options);

    fs.mkdirSync(path.dirname(telemetryPath), { recursive: true });
    fs.appendFileSync(telemetryPath, `${JSON.stringify(telemetry)}\n`, 'utf8');
    return { recorded: true, path: telemetryPath, telemetry };
}

async function runFinancialCommandPlannerShadow(input = {}, options = {}) {
    const env = options.env || process.env;
    const visibleStructuredResponse = input.legacyStructuredResponse;
    if (!shouldEvaluateFinancialCommandPlannerShadow({
        env,
        message: input.message,
        currentState: input.currentState,
        userId: input.userId
    })) {
        return {
            observed: false,
            reason: 'not_eligible',
            visibleStructuredResponse
        };
    }

    const planner = input.planner || planFinancialCommandWithGemini;
    const startedAt = performance.now();
    try {
        const plannerResult = await planner({
            message: input.message,
            referenceDate: input.referenceDate
        });
        const evaluationLatencyMs = performance.now() - startedAt;
        const record = recordFinancialCommandPlannerShadow({
            senderId: input.senderId,
            message: input.message,
            legacyStructuredResponse: input.legacyStructuredResponse,
            structuredResponseSource: input.structuredResponseSource,
            plannerResult,
            evaluationLatencyMs
        }, options);
        return {
            observed: true,
            record,
            plannerResult,
            visibleStructuredResponse
        };
    } catch (error) {
        return {
            observed: false,
            reason: 'planner_failed',
            error: error?.message || String(error),
            visibleStructuredResponse
        };
    }
}

function sanitizeStringList(values) {
    if (!Array.isArray(values)) return [];
    return values
        .map(value => String(value || '').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80))
        .filter(Boolean)
        .slice(0, 10);
}

function fingerprint(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

module.exports = {
    buildFinancialCommandPlannerShadowDecision,
    normalizeFinancialCommandPlannerMode,
    recordFinancialCommandPlannerShadow,
    runFinancialCommandPlannerShadow,
    sanitizeFinancialCommandPlannerShadowRecord,
    shouldEvaluateFinancialCommandPlannerShadow,
    shouldRouteFinancialCommandPlanner,
    __test__: {
        fingerprint,
        mapLegacyIntentToOperation
    }
};
