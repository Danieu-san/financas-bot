const { getUserSheetDashboardData: defaultGetUserSheetDashboardData } = require('../services/userSheetAnalyticsService');
const { sanitizeFinancialEvidenceValue } = require('./financialSemanticReadFacade');

function normalizePeriod(plan = {}, currentDate = '') {
    const period = plan?.filters?.period || {};
    const month = Number.parseInt(period.month, 10);
    const year = Number.parseInt(period.year, 10);
    if (period.type === 'month' && Number.isInteger(month) && month >= 0 && month <= 11 && Number.isInteger(year)) {
        return { month, year };
    }
    const match = String(currentDate || '').match(/^(?:([0-3]?\d)\/([01]?\d)\/(\d{4})|(\d{4})-(\d{2})-(\d{2}))$/);
    if (match) {
        return {
            month: Number(match[2] || match[5]) - 1,
            year: Number(match[3] || match[4])
        };
    }
    const now = new Date();
    return { month: now.getMonth(), year: now.getFullYear() };
}

function publicSnapshot(snapshot = {}) {
    return {
        period: snapshot.period || null,
        scope: snapshot.scope ? { mode: snapshot.scope.mode, label: snapshot.scope.label } : null,
        kpis: snapshot.kpis || {},
        topCategories: Array.isArray(snapshot.topCategories) ? snapshot.topCategories : [],
        recentTransactions: Array.isArray(snapshot.recentTransactions) ? snapshot.recentTransactions : [],
        financialAccounts: snapshot.financialAccounts || { totalBalance: 0, items: [] },
        dailyGoal: snapshot.dailyGoal || null,
        goals: (Array.isArray(snapshot.goals) ? snapshot.goals : []).map(({ user_id, ...goal }) => goal)
    };
}

function selectPlanResult(plan = {}, snapshot = {}) {
    const domain = String(plan.domain || '').trim();
    const operation = String(plan.operation || '').trim();
    const kpis = snapshot.kpis || {};
    const recent = Array.isArray(snapshot.recentTransactions) ? snapshot.recentTransactions : [];
    const expenses = recent.filter(item => ['saida', 'cartao'].includes(String(item.type || '').toLowerCase()));
    const income = recent.filter(item => String(item.type || '').toLowerCase() === 'entrada');
    const totals = {
        expenses: Number(kpis.saidas || 0) + Number(kpis.cartoes || 0),
        cards: Number(kpis.cartoes || 0),
        income: Number(kpis.entradas || 0),
        accounts: Number(snapshot.financialAccounts?.totalBalance || 0)
    };

    const details = sanitizeFinancialEvidenceValue({
        domain,
        operation,
        timeBasis: plan.timeBasis || null,
        filters: plan.filters || {},
        groupBy: plan.groupBy || null,
        source: 'personal_sheet'
    });
    if (['expenses', 'cards', 'income'].includes(domain) && operation === 'sum') {
        return { ok: true, value: totals[domain], details };
    }
    if (domain === 'accounts' && ['sum', 'list', 'detail'].includes(operation)) {
        const items = domain === 'expenses'
            ? expenses
            : domain === 'cards'
                ? expenses.filter(item => String(item.type || '').toLowerCase() === 'cartao')
                : domain === 'income'
                    ? income
                    : (snapshot.financialAccounts?.items || []);
        const value = operation === 'sum' ? totals[domain] : items;
        return { ok: true, value, details };
    }
    if (domain === 'budget' && ['detail', 'explain', 'sum'].includes(operation)) {
        return {
            ok: true,
            value: operation === 'sum' ? Number(snapshot.dailyGoal?.spent || 0) : (snapshot.dailyGoal || null),
            details
        };
    }
    return { ok: false, reason: 'personal_sheet_domain_operation_unsupported' };
}

function createPersonalSheetSemanticAdapters({
    getUserSheetDashboardData = defaultGetUserSheetDashboardData
} = {}) {
    async function readSnapshot(input = {}) {
        const ownerUserId = String(input.ownerUserId || '').trim();
        if (!ownerUserId || !(Array.isArray(input.userIds) && input.userIds.includes(ownerUserId))) {
            return { ok: false, tool: input.tool || '', source: 'personal_sheet', reason: 'missing_authorized_scope' };
        }
        const period = normalizePeriod(input.plan || { filters: { period: { type: 'month', month: input.month, year: input.year } } }, input.currentDate);
        const snapshot = publicSnapshot(await getUserSheetDashboardData(ownerUserId, period));
        return { ownerUserId, period, snapshot };
    }

    return {
        query_financial_plan: async (input = {}) => {
            const read = await readSnapshot({ ...input, tool: 'query_financial_plan' });
            if (read.ok === false) return read;
            const selected = selectPlanResult(input.plan, read.snapshot);
            if (!selected.ok) {
                return { ok: false, tool: 'query_financial_plan', source: 'personal_sheet', reason: selected.reason };
            }
            return {
                ok: true,
                tool: 'query_financial_plan',
                source: 'personal_sheet',
                plan: sanitizeFinancialEvidenceValue(input.plan),
                result: { value: selected.value, details: selected.details },
                criteria: selected.details
            };
        },
        list_recent_transactions: async (input = {}) => {
            const read = await readSnapshot({ ...input, tool: 'list_recent_transactions' });
            if (read.ok === false) return read;
            const limit = Math.max(1, Math.min(50, Number.parseInt(input.limit, 10) || 10));
            return {
                ok: true,
                tool: 'list_recent_transactions',
                source: 'personal_sheet',
                rows: read.snapshot.recentTransactions.slice(0, limit),
                rowCount: Math.min(read.snapshot.recentTransactions.length, limit)
            };
        },
        get_dashboard_snapshot: async (input = {}) => {
            const read = await readSnapshot({ ...input, tool: 'get_dashboard_snapshot' });
            if (read.ok === false) return read;
            return {
                ok: true,
                tool: 'get_dashboard_snapshot',
                source: 'personal_sheet',
                snapshot: read.snapshot
            };
        }
    };
}

module.exports = {
    createPersonalSheetSemanticAdapters,
    __test__: { normalizePeriod, publicSnapshot, selectPlanResult }
};
