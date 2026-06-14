const {
    ensureSqliteReady,
    queryFinancialEventsPublicRows,
    queryFinancialQueryDataSourcesSql
} = require('../services/sqliteReadModelService');
const { normalizeFinancialQueryPlan } = require('../query/financialQueryPlan');
const { executeFinancialQuery } = require('../query/financialQueryEngine');
const { buildDashboardCriteria } = require('../services/dashboardSummaryService');
const { runSafeReadonlySql } = require('./safeReadonlySql');

const DEFAULT_EVENT_TYPES = [
    'expense',
    'card_expense',
    'income',
    'transfer',
    'goal',
    'debt',
    'bill'
];
const BLOCKED_PUBLIC_KEYS = new Set([
    'userid',
    'user_id',
    'sheetid',
    'sheet_id',
    'spreadsheetid',
    'spreadsheet_id',
    'token',
    'oauth',
    'ownerhash',
    'owner_hash',
    'rawrows',
    'raw_rows'
]);

function getScopedPublicRows({ userIds = [], personByUserId = {} } = {}) {
    return queryFinancialEventsPublicRows({ userIds, personByUserId });
}

function compareRecent(a, b) {
    const aKey = `${a.iso_date || ''} ${a.date || ''}`;
    const bKey = `${b.iso_date || ''} ${b.date || ''}`;
    return bKey.localeCompare(aKey);
}

async function listRecentTransactions({
    userIds = [],
    personByUserId = {},
    eventTypes = DEFAULT_EVENT_TYPES,
    limit = 5
} = {}) {
    const allowedTypes = new Set((eventTypes || DEFAULT_EVENT_TYPES).map(String));
    const rows = getScopedPublicRows({ userIds, personByUserId })
        .filter(row => allowedTypes.has(row.event_type))
        .sort(compareRecent)
        .slice(0, Math.max(1, Math.min(20, Number.parseInt(limit, 10) || 5)));
    return {
        ok: true,
        tool: 'list_recent_transactions',
        rows,
        metrics: rows.length === 1 ? { amount: rows[0].amount } : {},
        criteria: {
            sort: 'iso_date desc',
            limit: rows.length,
            eventTypes: Array.from(allowedTypes)
        }
    };
}

async function runSafeReadonlySqlTool({ sql, userIds = [], personByUserId = {}, limit = 50 } = {}) {
    const rows = getScopedPublicRows({ userIds, personByUserId });
    const result = runSafeReadonlySql(sql, { rows, maxRows: limit });
    return {
        ...result,
        tool: 'run_safe_readonly_sql'
    };
}

function resolvedScopeFromUserIds(userIds = []) {
    const ids = Array.from(new Set((userIds || []).map(id => String(id || '').trim()).filter(Boolean)));
    return {
        decision: ids.length > 0 ? 'allow' : 'block',
        scope: ids.length > 1 ? 'family' : 'personal',
        userIds: ids
    };
}

async function queryFinancialPlanTool({ plan, userIds = [], currentDate = '' } = {}) {
    if (!ensureSqliteReady()) {
        return { ok: false, tool: 'query_financial_plan', reason: 'read_model_unavailable' };
    }
    const normalized = normalizeFinancialQueryPlan(plan);
    if (!normalized.ok) {
        return { ok: false, tool: 'query_financial_plan', reason: 'invalid_financial_query_plan', errors: normalized.errors };
    }
    if (normalized.plan.domain === 'dashboard') {
        return { ok: false, tool: 'query_financial_plan', reason: 'dashboard_requires_snapshot_tool' };
    }

    const resolvedScope = resolvedScopeFromUserIds(userIds);
    if (resolvedScope.decision !== 'allow') {
        return { ok: false, tool: 'query_financial_plan', reason: 'missing_authorized_scope' };
    }
    const scopedPlan = {
        ...normalized.plan,
        filters: {
            ...(normalized.plan.filters || {}),
            scope: resolvedScope.scope
        }
    };
    delete scopedPlan.filters.member;

    const dataSources = queryFinancialQueryDataSourcesSql(scopedPlan, {
        userId: resolvedScope.userIds[0],
        userIds: resolvedScope.userIds,
        currentDate
    });
    if (!dataSources) {
        return { ok: false, tool: 'query_financial_plan', reason: 'read_model_unavailable' };
    }

    const execution = await executeFinancialQuery(scopedPlan, dataSources);
    if (!execution.ok) {
        return {
            ok: false,
            tool: 'query_financial_plan',
            reason: 'query_engine_rejected_plan',
            errors: execution.errors || []
        };
    }

    return {
        ok: true,
        tool: 'query_financial_plan',
        plan: execution.plan,
        result: execution.result,
        criteria: {
            domain: execution.plan.domain,
            operation: execution.plan.operation,
            timeBasis: execution.plan.timeBasis,
            filters: execution.plan.filters
        }
    };
}

function sanitizePublicValue(value, depth = 0) {
    if (depth > 8 || value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(item => sanitizePublicValue(item, depth + 1));
    if (typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.entries(value)
            .filter(([key]) => !BLOCKED_PUBLIC_KEYS.has(String(key || '').toLowerCase()))
            .map(([key, childValue]) => [key, sanitizePublicValue(childValue, depth + 1)])
    );
}

function sanitizeDashboardSnapshot(snapshot = {}) {
    return {
        period: sanitizePublicValue(snapshot.period || {}),
        kpis: sanitizePublicValue(snapshot.kpis || {}),
        topCategories: sanitizePublicValue(Array.isArray(snapshot.topCategories) ? snapshot.topCategories.slice(0, 10) : []),
        dailyFlow: sanitizePublicValue(Array.isArray(snapshot.dailyFlow) ? snapshot.dailyFlow.slice(-31) : []),
        recentTransactions: sanitizePublicValue(Array.isArray(snapshot.recentTransactions) ? snapshot.recentTransactions.slice(0, 12) : []),
        goals: sanitizePublicValue(Array.isArray(snapshot.goals) ? snapshot.goals.slice(0, 10) : []),
        debts: sanitizePublicValue(Array.isArray(snapshot.debts) ? snapshot.debts.slice(0, 10) : []),
        alerts: sanitizePublicValue(Array.isArray(snapshot.alerts) ? snapshot.alerts.slice(0, 10) : []),
        budget: sanitizePublicValue(snapshot.budget || null),
        criteria: {
            ...buildDashboardCriteria(),
            ...sanitizePublicValue(snapshot.criteria || {})
        }
    };
}

async function getDashboardSnapshotTool({ userIds = [], month, year } = {}) {
    const scope = resolvedScopeFromUserIds(userIds);
    if (scope.decision !== 'allow') {
        return { ok: false, tool: 'get_dashboard_snapshot', reason: 'missing_authorized_scope' };
    }
    if (scope.scope !== 'personal') {
        return { ok: false, tool: 'get_dashboard_snapshot', reason: 'family_dashboard_requires_owner_context' };
    }

    // Lazy import avoids loading Google/dashboard dependencies when the tool is not used.
    const { getDashboardSqlData, getDashboardSnapshot } = require('../services/readModelService');
    const snapshot = getDashboardSqlData(scope.userIds[0], { month, year }) ||
        getDashboardSnapshot(scope.userIds[0], { month, year });
    if (!snapshot) {
        return { ok: false, tool: 'get_dashboard_snapshot', reason: 'dashboard_snapshot_unavailable' };
    }
    const sanitizedSnapshot = sanitizeDashboardSnapshot(snapshot);
    return {
        ok: true,
        tool: 'get_dashboard_snapshot',
        snapshot: sanitizedSnapshot,
        criteria: sanitizedSnapshot.criteria
    };
}

function normalizeMetric(metric = '') {
    const normalized = String(metric || '').trim().toLowerCase();
    const aliases = {
        saldo: 'balance',
        balance: 'balance',
        disponivel: 'available',
        disponível: 'available',
        available: 'available',
        categorias: 'categories',
        categories: 'categories',
        orcamento: 'budget',
        orçamento: 'budget',
        budget: 'budget',
        recentes: 'recentTransactions',
        lancamentos_recentes: 'recentTransactions',
        recenttransactions: 'recentTransactions'
    };
    return aliases[normalized] || '';
}

async function explainMetricTool({ metric, userIds = [], month, year } = {}) {
    const normalizedMetric = normalizeMetric(metric);
    if (!normalizedMetric) {
        return { ok: false, tool: 'explain_metric', reason: 'metric_not_allowed' };
    }
    const dashboard = await getDashboardSnapshotTool({ userIds, month, year });
    if (!dashboard.ok) return { ...dashboard, tool: 'explain_metric' };
    const snapshot = dashboard.snapshot;
    const components = normalizedMetric === 'balance'
        ? {
            entradas: Number(snapshot.kpis?.entradas || 0),
            saidas: Number(snapshot.kpis?.saidas || 0),
            cartoes: Number(snapshot.kpis?.cartoes || 0),
            saldo: Number(snapshot.kpis?.saldo || 0)
        }
        : normalizedMetric === 'available'
            ? {
                saldo: Number(snapshot.kpis?.saldo || 0),
                reservaLiquida: Number(snapshot.kpis?.reservaLiquida || 0),
                disponivel: Number(snapshot.kpis?.saldoDisponivelEstimado ?? snapshot.kpis?.saldo ?? 0)
            }
            : normalizedMetric === 'categories'
                ? snapshot.topCategories
                : normalizedMetric === 'budget'
                    ? snapshot.budget || {}
                    : snapshot.recentTransactions;

    return {
        ok: true,
        tool: 'explain_metric',
        metric: normalizedMetric,
        components,
        criteria: snapshot.criteria?.[normalizedMetric] || buildDashboardCriteria()[normalizedMetric] || ''
    };
}

module.exports = {
    DEFAULT_EVENT_TYPES,
    getScopedPublicRows,
    listRecentTransactions,
    runSafeReadonlySqlTool,
    queryFinancialPlanTool,
    getDashboardSnapshotTool,
    explainMetricTool,
    __test__: {
        resolvedScopeFromUserIds,
        sanitizePublicValue,
        sanitizeDashboardSnapshot,
        normalizeMetric
    }
};
