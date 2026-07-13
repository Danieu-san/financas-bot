const {
    ensureSqliteReady,
    queryFinancialEventsPublicRows,
    queryFinancialQueryDataSourcesSql
} = require('../services/sqliteReadModelService');
const { normalizeFinancialQueryPlan, labelMonthlyPeriod } = require('../query/financialQueryPlan');
const { normalizeText, parseSheetDate } = require('../utils/helpers');
const { executeFinancialQuery } = require('../query/financialQueryEngine');
const { buildDashboardCriteria } = require('../services/dashboardSummaryService');
const { runSafeReadonlySql } = require('./safeReadonlySql');
const {
    readCanonicalLedgerCanaryDomain,
    readCanonicalCategoryBudgetSource
} = require('../ledger/canonicalLedgerReceiptProjector');
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

function roundMoney(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function moneyFromCents(value) {
    return value === null || value === undefined ? null : roundMoney(Number(value) / 100);
}

function publicCategoryBudgetContract(contract = null) {
    if (!contract || typeof contract !== 'object') return contract;
    return {
        ...contract,
        globalBudget: moneyFromCents(contract.globalBudgetCents),
        allocatedBudget: moneyFromCents(contract.allocatedBudgetCents),
        unallocatedBudget: moneyFromCents(contract.unallocatedBudgetCents),
        overallocatedBudget: moneyFromCents(contract.overallocatedBudgetCents),
        actualBudget: moneyFromCents(contract.actualBudgetCents),
        remainingBudget: moneyFromCents(contract.remainingBudgetCents),
        dailyPace: moneyFromCents(contract.dailyPaceCents),
        categories: (contract.categories || []).map(item => ({
            ...item,
            plannedAmount: moneyFromCents(item.plannedAmountCents),
            actualAmount: moneyFromCents(item.actualAmountCents),
            remainingAmount: moneyFromCents(item.remainingAmountCents),
            dailyPace: moneyFromCents(item.dailyPaceCents)
        }))
    };
}

function canonicalAccountToPublicItem(row = {}) {
    const balance = roundMoney(Number(row.balance_cents || 0) / 100);
    return {
        name: String(row.name || ''),
        label: String(row.name || ''),
        accountType: String(row.account_type || ''),
        status: String(row.status || ''),
        currency: String(row.currency || 'BRL'),
        responsible: String(row.responsible || ''),
        openedOn: String(row.opened_on || ''),
        openingBalance: roundMoney(Number(row.opening_balance_cents || 0) / 100),
        balance,
        value: balance
    };
}

function accountMatchesFilter(item = {}, accountFilter = '') {
    const requested = normalizeText(String(accountFilter || '').trim());
    if (!requested) return true;
    const haystack = normalizeText(`${item.name || ''} ${item.accountType || ''} ${item.responsible || ''}`);
    return requested.split(/[^a-z0-9]+/).filter(Boolean).every(token => haystack.includes(token));
}

async function queryCanonicalAccountsPlanTool({
    plan,
    userIds = [],
    personByUserId = {},
    env = process.env,
    canonicalLedgerDbPath
} = {}) {
    const canary = readCanonicalLedgerCanaryDomain({
        env,
        dbPath: canonicalLedgerDbPath,
        domain: 'accounts',
        ownerPersonIds: userIds,
        personByUserId
    });
    if (!canary.enabled) {
        return {
            ok: false,
            tool: 'query_financial_plan',
            source: 'canonical',
            reason: canary.reason || 'canonical_accounts_unavailable'
        };
    }

    const requestedAccount = plan.filters?.account || '';
    const publicRows = (canary.rows || []).map(canonicalAccountToPublicItem);
    const matchingRows = publicRows.filter(item => accountMatchesFilter(item, requestedAccount));
    const normalizedRequestedAccount = normalizeText(String(requestedAccount || '').trim()).replace(/[^a-z0-9]+/g, ' ').trim();
    const exactRows = normalizedRequestedAccount
        ? matchingRows.filter(item => normalizeText(String(item.name || '').trim()).replace(/[^a-z0-9]+/g, ' ').trim() === normalizedRequestedAccount)
        : [];
    const rows = exactRows.length > 0 ? exactRows : matchingRows;
    if (String(requestedAccount || '').trim() && rows.length === 0) {
        return {
            ok: false,
            tool: 'query_financial_plan',
            source: 'canonical',
            reason: 'account_not_found'
        };
    }
    const sortBy = String(plan.sort?.by || 'name');
    const direction = String(plan.sort?.direction || 'asc');
    const sortedRows = rows.slice().sort((left, right) => {
        const multiplier = direction === 'desc' ? -1 : 1;
        if (sortBy === 'balance' || sortBy === 'value') {
            return multiplier * (Number(left.balance || 0) - Number(right.balance || 0));
        }
        return multiplier * String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR');
    });
    const limitedRows = sortedRows.slice(0, plan.limit || 50);
    const total = roundMoney(rows.reduce((sum, item) => sum + Number(item.balance || 0), 0));
    const details = {
        domain: 'accounts',
        operation: plan.operation,
        count: rows.length,
        total,
        timeBasis: plan.timeBasis,
        filters: plan.filters,
        criteria: 'Saldos lidos do canary accounts do ledger canonico; movimentos pendentes nao entram no saldo atual.'
    };

    if (plan.operation === 'count') {
        return { ok: true, tool: 'query_financial_plan', source: 'canonical', plan, result: { value: rows.length, details }, criteria: details };
    }
    if (plan.operation === 'sum') {
        return { ok: true, tool: 'query_financial_plan', source: 'canonical', plan, result: { value: total, details }, criteria: details };
    }
    if (['detail', 'list', 'explain'].includes(plan.operation)) {
        return {
            ok: true,
            tool: 'query_financial_plan',
            source: 'canonical',
            plan,
            result: {
                value: {
                    total,
                    count: rows.length,
                    items: limitedRows,
                    criteria: details.criteria
                },
                details
            },
            criteria: details
        };
    }

    return {
        ok: false,
        tool: 'query_financial_plan',
        source: 'canonical',
        reason: 'unsupported_accounts_operation',
        errors: [`operacao de contas ainda nao implementada: ${plan.operation}`]
    };
}

function isoDateFromInput(value) {
    const raw = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const parsed = parseSheetDate(raw);
    if (!parsed) return '';
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function isoDateFromParts(year, month, day) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return '';
    const date = new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
    return date.toISOString().slice(0, 10);
}

function forecastWindowFromPlan(plan = {}, currentDate = '') {
    const period = plan.filters?.period || {};
    const currentIso = isoDateFromInput(currentDate) || isoDateFromInput(new Date().toISOString().slice(0, 10));
    if (period.type === 'date_range') {
        return { from: isoDateFromInput(period.from), to: isoDateFromInput(period.to) };
    }
    if (Number.isInteger(period.month) && Number.isInteger(period.year)) {
        const from = isoDateFromParts(period.year, period.month, 1);
        const lastDay = new Date(Date.UTC(period.year, period.month + 1, 0, 12, 0, 0, 0)).getUTCDate();
        return { from, to: isoDateFromParts(period.year, period.month, lastDay) };
    }
    if (period.type === 'today') return { from: currentIso, to: currentIso };
    if (period.type === 'relative') {
        const base = new Date(`${currentIso}T12:00:00.000Z`);
        const offset = period.label === 'tomorrow' ? 1 : 0;
        const days = Math.max(1, Number.parseInt(period.days || '7', 10) || 7);
        const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + offset, 12, 0, 0, 0));
        const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + days - 1, 12, 0, 0, 0));
        return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
    }
    const current = new Date(`${currentIso}T12:00:00.000Z`);
    const from = isoDateFromParts(current.getUTCFullYear(), current.getUTCMonth(), 1);
    const lastDay = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0, 12, 0, 0, 0)).getUTCDate();
    return { from, to: isoDateFromParts(current.getUTCFullYear(), current.getUTCMonth(), lastDay) };
}

function forecastItemToPublicItem(row = {}) {
    const value = roundMoney(Number(row.amount_cents || 0) / 100);
    return {
        date: canonicalDateToDisplay(row.date),
        isoDate: String(row.date || ''),
        description: String(row.description || ''),
        value,
        amount: value,
        type: String(row.type || ''),
        domain: String(row.domain || ''),
        status: String(row.status || ''),
        expectedCashDirection: String(row.expected_cash_direction || ''),
        affectsCurrentCash: row.affects_current_cash === true
    };
}

function forecastItemMatchesPlan(item = {}, plan = {}) {
    const filters = plan.filters || {};
    if (plan.domain === 'bills' && item.domain !== 'bill') return false;
    if (filters.type && normalizeText(item.type) !== normalizeText(filters.type)) return false;
    if (filters.status && normalizeText(item.status) !== normalizeText(filters.status)) return false;
    if (filters.source && normalizeText(item.domain) !== normalizeText(filters.source)) return false;
    if (filters.category && !normalizeText(`${item.domain} ${item.description}`).includes(normalizeText(filters.category))) return false;
    if (filters.merchant && !normalizeText(item.description).includes(normalizeText(filters.merchant))) return false;
    return true;
}

function forecastSortRows(rows = [], sort = {}) {
    const direction = sort.direction === 'desc' ? -1 : 1;
    const by = sort.by || 'due_date';
    return rows.slice().sort((left, right) => {
        if (by === 'value') return (Number(left.value || 0) - Number(right.value || 0)) * direction;
        if (by === 'name') return String(left.description || '').localeCompare(String(right.description || ''), 'pt-BR') * direction;
        return String(left.isoDate || '').localeCompare(String(right.isoDate || '')) * direction;
    });
}

async function queryCanonicalForecastPlanTool({
    plan,
    userIds = [],
    personByUserId = {},
    currentDate = '',
    env = process.env,
    canonicalLedgerDbPath
} = {}) {
    const window = forecastWindowFromPlan(plan, currentDate);
    const canary = readCanonicalLedgerCanaryDomain({
        env,
        dbPath: canonicalLedgerDbPath,
        domain: 'forecast',
        ownerPersonIds: userIds,
        personByUserId,
        forecastWindow: window
    });
    if (!canary.enabled) {
        return {
            ok: false,
            tool: 'query_financial_plan',
            source: 'canonical',
            reason: canary.reason || 'canonical_forecast_unavailable'
        };
    }

    const rows = forecastSortRows(
        (canary.rows || []).map(forecastItemToPublicItem).filter(item => forecastItemMatchesPlan(item, plan)),
        plan.sort || { by: 'due_date', direction: 'asc' }
    );
    const limitedRows = rows.slice(0, plan.limit || 50);
    const payable = roundMoney(rows.filter(item => item.type !== 'receivable').reduce((sum, item) => sum + Number(item.value || 0), 0));
    const receivable = roundMoney(rows.filter(item => item.type === 'receivable').reduce((sum, item) => sum + Number(item.value || 0), 0));
    const total = plan.filters?.type === 'receivable' ? receivable : payable;
    const criteriaText = 'Previsões lidas do canary forecast do ledger canonico; criterio de data: vencimento previsto quando existir, ou data efetiva para transferencias pendentes. Pendencias nao alteram saldo atual.';
    const details = {
        domain: plan.domain,
        operation: plan.operation,
        count: rows.length,
        total,
        timeBasis: plan.timeBasis || 'due_date',
        filters: plan.filters,
        criteria: criteriaText,
        window,
        totals: {
            payable,
            receivable,
            netExpectedCash: roundMoney(receivable - payable),
            currentCashImpact: 0
        }
    };

    if (plan.operation === 'count') {
        return { ok: true, tool: 'query_financial_plan', source: 'canonical', plan, result: { value: rows.length, details }, criteria: details };
    }
    if (plan.operation === 'sum') {
        return { ok: true, tool: 'query_financial_plan', source: 'canonical', plan, result: { value: total, details }, criteria: details };
    }
    if (plan.domain === 'bills' && plan.operation === 'list') {
        return { ok: true, tool: 'query_financial_plan', source: 'canonical', plan, result: { value: limitedRows, details }, criteria: details };
    }
    if (['list', 'forecast', 'detail', 'explain'].includes(plan.operation)) {
        return {
            ok: true,
            tool: 'query_financial_plan',
            source: 'canonical',
            plan,
            result: {
                value: {
                    total,
                    payable,
                    receivable,
                    netExpectedCash: roundMoney(receivable - payable),
                    currentCashImpact: 0,
                    count: rows.length,
                    items: limitedRows,
                    criteria: criteriaText
                },
                details
            },
            criteria: details
        };
    }

    return {
        ok: false,
        tool: 'query_financial_plan',
        source: 'canonical',
        reason: 'unsupported_forecast_operation',
        errors: [`operacao de previsao ainda nao implementada: ${plan.operation}`]
    };
}
async function queryFinancialPlanTool({ plan, userIds = [], personByUserId = {}, currentDate = '', env = process.env, canonicalLedgerDbPath } = {}) {
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

    if (scopedPlan.domain === 'accounts') {
        return await queryCanonicalAccountsPlanTool({
            plan: scopedPlan,
            userIds: resolvedScope.userIds,
            personByUserId,
            env,
            canonicalLedgerDbPath
        });
    }

    if (scopedPlan.domain === 'forecast') {
        return await queryCanonicalForecastPlanTool({
            plan: scopedPlan,
            userIds: resolvedScope.userIds,
            personByUserId,
            currentDate,
            env,
            canonicalLedgerDbPath
        });
    }

    if (scopedPlan.domain === 'bills' && ['list', 'sum', 'count', 'forecast', 'detail', 'explain'].includes(scopedPlan.operation)) {
        const forecastResult = await queryCanonicalForecastPlanTool({
            plan: scopedPlan,
            userIds: resolvedScope.userIds,
            personByUserId,
            currentDate,
            env,
            canonicalLedgerDbPath
        });
        if (forecastResult.ok) return forecastResult;
    }

    if (!ensureSqliteReady()) {
        return { ok: false, tool: 'query_financial_plan', reason: 'read_model_unavailable' };
    }

    const dataSources = queryFinancialQueryDataSourcesSql(scopedPlan, {
        userId: resolvedScope.userIds[0],
        userIds: resolvedScope.userIds,
        currentDate
    });
    if (!dataSources) {
        return { ok: false, tool: 'query_financial_plan', reason: 'read_model_unavailable' };
    }

    if (scopedPlan.domain === 'budget') {
        const canonicalBudget = readCanonicalCategoryBudgetSource({
            env,
            dbPath: canonicalLedgerDbPath,
            ownerPersonIds: resolvedScope.userIds
        });
        if (canonicalBudget.enabled) {
            Object.assign(dataSources, {
                resolvedBudgetScope: canonicalBudget.scope,
                budgetCategories: canonicalBudget.categories,
                budgetAllocations: canonicalBudget.allocations,
                canonicalBudgetEvents: canonicalBudget.events,
                budgetActualSource: 'query_engine',
                budgetSourceHealth: canonicalBudget.sourceHealth
            });
        }
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
    if (scopedPlan.domain === 'budget' && execution.result?.value?.categoryBudget) {
        execution.result.value.categoryBudget = publicCategoryBudgetContract(execution.result.value.categoryBudget);
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
        period: sanitizePublicValue(labelMonthlyPeriod(snapshot.period || {})),
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
        period: snapshot.period,
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
