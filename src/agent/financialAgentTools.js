const {
    ensureSqliteReady,
    queryFinancialEventsPublicRows,
    queryFinancialQueryDataSourcesSql
} = require('../services/sqliteReadModelService');
const { normalizeFinancialQueryPlan } = require('../query/financialQueryPlan');
const { normalizeText } = require('../utils/helpers');
const { executeFinancialQuery } = require('../query/financialQueryEngine');
const { buildDashboardCriteria } = require('../services/dashboardSummaryService');
const { runSafeReadonlySql } = require('./safeReadonlySql');
const {
    readCanonicalLedgerCanaryWithFallback
} = require('../ledger/canonicalLedgerCanaryRouter');

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
    const dateComparison = bKey.localeCompare(aKey);
    if (dateComparison !== 0) return dateComparison;
    return Number(b.insertion_order || 0) - Number(a.insertion_order || 0);
}

function canonicalKindToPublicEventType(kind = '') {
    const normalized = String(kind || '').trim();
    const aliases = {
        bill_payment: 'bill',
        bill_expected: 'bill',
        debt_opening: 'debt',
        debt_payment: 'debt',
        goal_opening: 'goal',
        goal_contribution: 'goal',
        goal_withdrawal: 'goal',
        invoice_payment: 'transfer',
        transfer: 'transfer',
        income: 'income',
        expense: 'expense'
    };
    return aliases[normalized] || normalized;
}

function canonicalDateToDisplay(date = '') {
    const match = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : String(date || '');
}

function normalizeCanonicalRecentRow(row = {}, index = 0) {
    const isoDate = String(row.date || row.effective_on || '').trim();
    return {
        date: canonicalDateToDisplay(isoDate),
        iso_date: isoDate,
        event_type: canonicalKindToPublicEventType(row.kind),
        amount: Number(row.amount_cents || 0) / 100,
        description: String(row.description || ''),
        category: String(row.category || ''),
        subcategory: String(row.subcategory || ''),
        person: String(row.responsible || 'Usuario'),
        payment_method: '',
        card: '',
        billing_month: String(row.competence_month || ''),
        due_date: String(row.due_on || ''),
        source: String(row.source || 'canonical'),
        insertion_order: index + 1
    };
}

function normalizeRecentLimit(limit = 5) {
    return Math.max(1, Math.min(20, Number.parseInt(limit, 10) || 5));
}

function filterRecentRows(rows = [], allowedTypes = new Set(), limit = 5) {
    return rows
        .filter(row => allowedTypes.has(row.event_type))
        .sort(compareRecent)
        .slice(0, normalizeRecentLimit(limit));
}
function matchesRecentCard(row = {}, card = '') {
    const normalizeCard = value => normalizeText(String(value || '').slice(0, 120))
        .replace(/\bcartao\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const requested = normalizeCard(card);
    if (!requested) return true;
    const actual = normalizeCard(row.card);
    return actual.includes(requested) || requested.split(' ').every(token => actual.includes(token));
}

function chooseCanonicalRecentDomain(eventTypes = []) {
    const types = new Set((eventTypes || []).map(type => String(type || '').trim()).filter(Boolean));
    if (types.size > 0 && Array.from(types).every(type => type === 'transfer')) {
        return 'transfers';
    }
    return 'transactions';
}

async function listRecentTransactions({
    userIds = [],
    personByUserId = {},
    eventTypes = DEFAULT_EVENT_TYPES,
    limit = 5,
    card = '',
    env = process.env,
    canonicalLedgerDbPath
} = {}) {
    const allowedTypes = new Set((eventTypes || DEFAULT_EVENT_TYPES).map(String));
    const legacyReader = () => filterRecentRows(
        getScopedPublicRows({ userIds, personByUserId })
            .filter(row => matchesRecentCard(row, card)),
        allowedTypes,
        limit
    );
    const canonicalDomain = chooseCanonicalRecentDomain(eventTypes);
    const canary = await readCanonicalLedgerCanaryWithFallback({
        env,
        dbPath: canonicalLedgerDbPath,
        domain: canonicalDomain,
        ownerPersonIds: userIds,
        personByUserId,
        legacyReader
    });
    const sourceRows = canary.source === 'canonical'
        ? canary.rows.map(normalizeCanonicalRecentRow)
        : canary.rows;
    const requestedLimit = normalizeRecentLimit(limit);
    let rows = filterRecentRows(sourceRows.filter(row => matchesRecentCard(row, card)), allowedTypes, requestedLimit);
    let source = canary.source;
    let fallbackReason = canary.fallbackReason;
    if (canary.source === 'canonical' && rows.length === 0) {
        rows = await legacyReader();
        source = 'legacy';
        fallbackReason = 'canonical_no_matching_rows';
    } else if (canary.source === 'canonical' && rows.length < requestedLimit) {
        const legacyRows = await legacyReader();
        if (legacyRows.length > rows.length) {
            rows = legacyRows;
            source = 'legacy';
            fallbackReason = 'canonical_partial_window';
        }
    }
    return {
        ok: true,
        tool: 'list_recent_transactions',
        source,
        fallbackReason,
        rows,
        metrics: rows.length === 1 ? { amount: rows[0].amount } : {},
        criteria: {
            sort: 'iso_date desc, insertion_order desc',
            limit: rows.length,
            eventTypes: Array.from(allowedTypes),
            card: String(card || '').trim()
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

async function getDashboardSnapshotTool({ userIds = [], ownerUserId = '', month, year } = {}) {
    const scope = resolvedScopeFromUserIds(userIds);
    if (scope.decision !== 'allow') {
        return { ok: false, tool: 'get_dashboard_snapshot', reason: 'missing_authorized_scope' };
    }
    const requestedOwnerId = String(ownerUserId || '').trim();
    const dashboardUserId = scope.scope === 'personal'
        ? scope.userIds[0]
        : requestedOwnerId && scope.userIds.includes(requestedOwnerId)
            ? requestedOwnerId
            : '';
    if (!dashboardUserId) {
        return { ok: false, tool: 'get_dashboard_snapshot', reason: 'family_dashboard_requires_owner_context' };
    }

    // Lazy import avoids loading Google/dashboard dependencies when the tool is not used.
    const { getDashboardSqlData, getDashboardSnapshot } = require('../services/readModelService');
    const snapshot = getDashboardSqlData(dashboardUserId, { month, year }) ||
        getDashboardSnapshot(dashboardUserId, { month, year });
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

async function explainMetricTool({ metric, userIds = [], ownerUserId = '', month, year } = {}) {
    const normalizedMetric = normalizeMetric(metric);
    if (!normalizedMetric) {
        return { ok: false, tool: 'explain_metric', reason: 'metric_not_allowed' };
    }
    const dashboard = await getDashboardSnapshotTool({ userIds, ownerUserId, month, year });
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
