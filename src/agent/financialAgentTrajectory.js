const { normalizeFinancialQueryPlan } = require('../query/financialQueryPlan');

const SENSITIVE_TEXT = /(?:user[_\s-]*id|sheet[_\s-]*id|spreadsheet|token|oauth|secret|prompt|raw[_\s-]*(?:row|data)|@c\.us|https?:\/\/|eyJ[A-Za-z0-9_-]+\.)/i;
const SAFE_FILTER_KEYS = new Set([
    'period', 'scope', 'member', 'category', 'categories', 'subcategory',
    'merchant', 'paymentMethod', 'card', 'goal', 'debt', 'status', 'type',
    'source', 'account', 'recurrence', 'scenario', 'value'
]);

function safeToken(value, fallback = 'unknown', maxLength = 64) {
    const token = String(value || '').trim().toLowerCase()
        .replace(/[^a-z0-9_:-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, maxLength);
    return token || fallback;
}

function safeLabel(value, maxLength = 80) {
    const label = String(value || '').trim().slice(0, maxLength);
    if (!label || SENSITIVE_TEXT.test(label)) return '';
    return label;
}

function lengthBucket(value) {
    const length = String(value || '').length;
    if (length === 0) return 'empty';
    if (length <= 40) return 'lte_40';
    if (length <= 120) return '41_120';
    if (length <= 300) return '121_300';
    return 'gt_300';
}

function countBucket(value) {
    const count = Number(value);
    if (!Number.isFinite(count) || count < 0) return 'unknown';
    if (count === 0) return 'zero';
    if (count === 1) return 'one';
    if (count <= 5) return 'two_to_five';
    if (count <= 20) return 'six_to_twenty';
    return 'gt_twenty';
}

function sanitizePeriod(period = {}) {
    if (!period || typeof period !== 'object' || Array.isArray(period)) return null;
    const safe = {};
    const type = safeToken(period.type, '', 32);
    if (type) safe.type = type;
    const month = Number(period.month);
    const year = Number(period.year);
    const days = Number(period.days);
    if (Number.isInteger(month) && month >= 0 && month <= 11) safe.month = month;
    if (Number.isInteger(year) && year >= 2000 && year <= 2100) safe.year = year;
    if (Number.isInteger(days) && days >= 1 && days <= 366) safe.days = days;
    for (const key of ['from', 'to']) {
        const date = String(period[key] || '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) safe[key] = date;
    }
    return Object.keys(safe).length > 0 ? safe : null;
}

function sanitizeFilterValue(key, value) {
    if (key === 'period') return sanitizePeriod(value);
    if (key === 'scope') {
        const scope = safeToken(value, '', 16);
        return ['personal', 'family', 'member'].includes(scope) ? scope : null;
    }
    if (key === 'categories') {
        if (!Array.isArray(value)) return null;
        const labels = value.slice(0, 5).map(item => safeLabel(item)).filter(Boolean);
        return labels.length > 0 ? labels : null;
    }
    if (key === 'value') {
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }
    return safeLabel(value) || null;
}

function sanitizeExecutedPlan(plan = null) {
    if (!plan || typeof plan !== 'object') return null;
    const normalized = normalizeFinancialQueryPlan(plan);
    if (!normalized.ok) return null;
    const source = normalized.plan;
    const filters = {};
    for (const [key, value] of Object.entries(source.filters || {})) {
        if (!SAFE_FILTER_KEYS.has(key)) continue;
        const sanitized = sanitizeFilterValue(key, value);
        if (sanitized !== null && sanitized !== undefined && sanitized !== '') filters[key] = sanitized;
    }
    return {
        kind: 'financial_query',
        domain: source.domain,
        operation: source.operation,
        filters,
        groupBy: Array.isArray(source.groupBy) ? source.groupBy.slice(0, 4) : [],
        sort: source.sort ? { by: source.sort.by, direction: source.sort.direction } : undefined,
        limit: Number.isInteger(source.limit) ? source.limit : undefined,
        needsContext: Boolean(source.needsContext),
        timeBasis: source.timeBasis,
        answerStyle: source.answerStyle
    };
}

function derivePlanFromTool(plan = {}, toolResult = {}, context = {}) {
    if (toolResult?.ok !== true) return null;

    const direct = toolResult.plan || plan?.args?.plan;
    const sanitized = sanitizeExecutedPlan(direct);
    if (sanitized) return sanitized;

    if (plan?.tool === 'list_recent_transactions') {
        const eventTypes = Array.isArray(plan?.args?.eventTypes) ? plan.args.eventTypes.map(String) : [];
        const domain = eventTypes.includes('income')
            ? 'income'
            : eventTypes.includes('transfer')
                ? 'transfers'
                : eventTypes.includes('card_expense')
                    ? 'cards'
                    : 'expenses';
        const filters = {
            period: { type: 'all_time' },
            scope: Number(context.authorizedUserCount) > 1 ? 'family' : 'personal'
        };
        const card = safeLabel(plan?.args?.card);
        if (card) filters.card = card;
        return sanitizeExecutedPlan({
            kind: 'financial_query', domain, operation: 'list', filters,
            groupBy: [], sort: { by: 'date', direction: 'desc' },
            limit: Number(plan?.args?.limit) || 5, needsContext: false,
            timeBasis: 'transaction_date', answerStyle: 'detailed'
        });
    }

    if (['get_dashboard_snapshot', 'explain_metric'].includes(plan?.tool)) {
        const month = Number(plan?.args?.month);
        const year = Number(plan?.args?.year);
        const period = Number.isInteger(month) && Number.isInteger(year)
            ? { type: 'month', month, year }
            : { type: 'current_month' };
        return sanitizeExecutedPlan({
            kind: 'financial_query', domain: 'dashboard',
            operation: plan.tool === 'explain_metric' ? 'explain' : 'detail',
            filters: {
                period,
                scope: Number(context.authorizedUserCount) > 1 ? 'family' : 'personal'
            }, groupBy: [],
            sort: { by: 'date', direction: 'desc' }, limit: 20,
            needsContext: false, timeBasis: 'transaction_date',
            answerStyle: plan.tool === 'explain_metric' ? 'audit' : 'detailed'
        });
    }
    return null;
}

function evidenceKind(toolResult = null) {
    if (!toolResult) return 'none';
    if (Array.isArray(toolResult.rows)) return 'rows';
    if (toolResult.snapshot) return 'snapshot';
    if (toolResult.components) return 'components';
    if (toolResult.result && Object.prototype.hasOwnProperty.call(toolResult.result, 'value')) return 'query_result';
    return 'metadata';
}

function evidenceCount(toolResult = null) {
    if (!toolResult) return null;
    if (Array.isArray(toolResult.rows)) return toolResult.rows.length;
    const details = toolResult?.result?.details;
    if (Number.isFinite(Number(details?.count))) return Number(details.count);
    const value = toolResult?.result?.value;
    if (Array.isArray(value)) return value.length;
    if (Array.isArray(value?.items)) return value.items.length;
    return null;
}

function coverageStatus(toolResult = null) {
    if (!toolResult) return 'not_applicable';
    if (toolResult.ok !== true) return 'unavailable';
    const count = evidenceCount(toolResult);
    if (count === 0) return 'empty';
    if (toolResult.fallbackReason) return 'fallback';
    return 'available';
}

function safeReason(value, fallback = 'none') {
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    if (SENSITIVE_TEXT.test(raw)) return 'redacted_reason';
    return safeToken(raw, fallback, 64);
}

function buildFinancialAgentTrajectory(input = {}) {
    const plan = input.plan || {};
    const toolResult = input.toolResult || null;
    const executedPlan = derivePlanFromTool(plan, toolResult, {
        authorizedUserCount: input.authorizedUserCount
    });
    const criteria = toolResult?.criteria && typeof toolResult.criteria === 'object'
        ? Object.keys(toolResult.criteria).filter(key => !SENSITIVE_TEXT.test(key)).slice(0, 12).sort()
        : [];
    const source = safeToken(toolResult?.source || (toolResult?.ok === true ? 'read_model' : 'none'), 'none');
    const fallbackReason = safeReason(toolResult?.fallbackReason, 'none');
    const action = safeToken(input.action || plan.action, 'error');
    const plannerSource = safeToken(plan.source || (input.suppliedPlan ? 'supplied_plan' : 'deterministic'), 'deterministic');
    const verificationReason = safeReason(input.verified?.reason, input.verified?.ok ? 'verified' : 'missing_verification');
    const result = {
        schemaVersion: 1,
        surface: 'financial_agent',
        readOnly: true,
        input: {
            questionLength: lengthBucket(input.message),
            shape: /^\s*(e|mas|agora|tambem|também)\b/i.test(String(input.message || '')) ? 'follow_up' : 'standalone',
            suppliedPlan: Boolean(input.suppliedPlan)
        },
        context: {
            scope: executedPlan?.filters?.scope || (Number(input.authorizedUserCount) > 1 ? 'family' : 'personal'),
            authorizedUsers: countBucket(input.authorizedUserCount)
        },
        decision: {
            action,
            plannerSource,
            reason: safeReason(plan.reason || input.migrationGap?.reason, 'none')
        },
        executedPlan,
        tool: {
            name: safeToken(plan.tool || toolResult?.tool, 'none'),
            source,
            fallbackReason
        },
        coverage: {
            status: coverageStatus(toolResult),
            evidenceKind: evidenceKind(toolResult),
            itemCount: countBucket(evidenceCount(toolResult)),
            criteriaKeys: criteria
        },
        verification: {
            ok: Boolean(input.verified?.ok),
            reason: verificationReason
        },
        response: {
            status: action === 'answer' && input.verified?.ok ? 'verified_answer' : action,
            length: lengthBucket(input.answer)
        },
        cost: {
            modelCalls: countBucket(input.telemetry?.modelCalls),
            latency: safeToken(input.telemetry?.latencyBucket || '', 'measured_separately')
        }
    };
    return result;
}

function contextParametersFromPlan(plan = {}) {
    const filters = plan.filters || {};
    const period = filters.period || {};
    const parameters = {
        timeBasis: plan.timeBasis
    };
    if (Number.isInteger(period.month)) parameters.mes = period.month;
    if (Number.isInteger(period.year)) parameters.ano = period.year;
    const mappings = {
        category: 'categoria', card: 'cartao', source: 'origem', scope: 'scope',
        member: 'member', status: 'status', account: 'account', goal: 'goal', debt: 'debt'
    };
    for (const [sourceKey, targetKey] of Object.entries(mappings)) {
        if (filters[sourceKey] !== undefined) parameters[targetKey] = filters[sourceKey];
    }
    if (Array.isArray(filters.categories)) parameters.categorias = filters.categories.slice(0, 5);
    return parameters;
}

function buildAnalyticalCheckpointFromTrajectory(trajectory = null, meta = {}) {
    const plan = trajectory?.executedPlan;
    if (!plan) return null;
    const metric = safeToken(meta.metric || `${plan.domain}_${plan.operation}`, '', 80);
    return {
        checkpointType: 'analytical_followup_v2',
        intent: `financial_agent:${plan.domain}:${plan.operation}`,
        parameters: contextParametersFromPlan(plan),
        metric,
        executedPlan: plan,
        trajectory: {
            schemaVersion: trajectory.schemaVersion,
            decision: trajectory.decision,
            tool: trajectory.tool,
            coverage: trajectory.coverage,
            verification: trajectory.verification
        }
    };
}

function buildFinancialAgentTrajectoryLog(trajectory = null) {
    if (!trajectory) return null;
    return {
        schema: trajectory.schemaVersion,
        action: trajectory.decision?.action || 'unknown',
        planner: trajectory.decision?.plannerSource || 'unknown',
        domain: trajectory.executedPlan?.domain || 'none',
        operation: trajectory.executedPlan?.operation || 'none',
        timeBasis: trajectory.executedPlan?.timeBasis || 'none',
        scope: trajectory.context?.scope || 'unknown',
        tool: trajectory.tool?.name || 'none',
        source: trajectory.tool?.source || 'none',
        fallback: trajectory.tool?.fallbackReason || 'none',
        coverage: trajectory.coverage?.status || 'unknown',
        evidence: trajectory.coverage?.evidenceKind || 'none',
        verified: Boolean(trajectory.verification?.ok),
        response: trajectory.response?.status || 'unknown'
    };
}

module.exports = {
    buildFinancialAgentTrajectory,
    buildAnalyticalCheckpointFromTrajectory,
    buildFinancialAgentTrajectoryLog,
    sanitizeExecutedPlan,
    __test__: {
        derivePlanFromTool,
        coverageStatus,
        evidenceCount,
        lengthBucket,
        countBucket,
        contextParametersFromPlan
    }
};
