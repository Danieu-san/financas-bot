const { queryFinancialPlanTool } = require('../agent/financialAgentTools');
const { buildDashboardCriteria } = require('./dashboardSummaryService');
const { labelMonthlyPeriod } = require('../query/financialQueryPlan');

const BLOCK_STATUS = new Set(['available', 'fallback', 'partial', 'unavailable']);
const BLOCKED_PUBLIC_KEYS = new Set([
    'userid', 'user_id', 'ownerpersonid', 'owner_person_id', 'householdid', 'household_id',
    'ownerhash', 'owner_hash', 'accountid', 'account_id', 'allocationid', 'allocation_id',
    'eventid', 'event_id', 'invoiceid', 'invoice_id', 'runid', 'run_id',
    'idempotencykey', 'idempotency_key', 'sourcerowhash', 'source_row_hash',
    'sourceid', 'source_id', 'sheetid', 'sheet_id', 'spreadsheetid', 'spreadsheet_id',
    'token', 'oauth', 'rawrows', 'raw_rows', 'rawdata', 'raw_data'
]);
const UNAVAILABLE_CRITERIA = 'Fonte indisponível; ausência de dados não equivale a zero.';

function normalizedKey(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '');
}

function sanitizePublicValue(value, depth = 0) {
    if (depth > 10 || value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(item => sanitizePublicValue(item, depth + 1));
    if (typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value)
        .filter(([key]) => !BLOCKED_PUBLIC_KEYS.has(normalizedKey(key)))
        .map(([key, child]) => [key, sanitizePublicValue(child, depth + 1)]));
}

function finiteNumber(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && !value.trim()) return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function roundMoney(value) {
    const numeric = finiteNumber(value);
    return numeric === null ? null : Math.round((numeric + Number.EPSILON) * 100) / 100;
}

function saoPauloIsoDate(referenceDate = new Date()) {
    if (typeof referenceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(referenceDate.trim())) {
        return referenceDate.trim();
    }
    const date = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(safeDate);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function normalizePeriod(snapshot = {}, month, year) {
    const snapshotPeriod = snapshot.period || {};
    const normalizedMonth = Number.parseInt(month ?? snapshotPeriod.month, 10);
    const normalizedYear = Number.parseInt(year ?? snapshotPeriod.year, 10);
    if (Number.isInteger(normalizedMonth) && normalizedMonth >= 0 && normalizedMonth <= 11 &&
        Number.isInteger(normalizedYear) && normalizedYear >= 2000 && normalizedYear <= 2100) {
        return sanitizePublicValue(labelMonthlyPeriod({
            ...snapshotPeriod,
            type: 'month',
            month: normalizedMonth,
            year: normalizedYear
        }));
    }
    return sanitizePublicValue(snapshotPeriod);
}

function normalizeScope(snapshot = {}, userIds = []) {
    const fallback = {
        mode: userIds.length > 1 ? 'family' : 'personal',
        label: userIds.length > 1 ? 'Família' : 'Pessoal',
        members: []
    };
    return sanitizePublicValue({ ...fallback, ...(snapshot.scope || {}) });
}

function publicSource(source = '') {
    const normalized = String(source || '').trim().toLowerCase();
    if (normalized === 'canonical') return 'canonical';
    if (normalized.includes('sqlite')) return 'query_engine';
    if (normalized === 'personal_sheet') return 'dashboard_snapshot';
    return normalized ? 'query_engine' : 'unavailable';
}

function toolCriteria(result, fallback) {
    const candidates = [
        result?.result?.value?.criteria,
        result?.result?.details?.criteria,
        result?.criteria?.criteria
    ];
    return candidates.find(value => typeof value === 'string' && value.trim()) || fallback;
}

async function safeQuery(queryTool, input) {
    try {
        const result = await queryTool(input);
        return result && typeof result === 'object' ? result : { ok: false, reason: 'source_unavailable' };
    } catch (_error) {
        return { ok: false, reason: 'source_unavailable' };
    }
}

function buildCashBlock(snapshot = {}, accountsBlock = {}) {
    const kpis = snapshot.kpis || {};
    const periodInflows = roundMoney(kpis.entradas);
    const directOutflows = roundMoney(kpis.saidas);
    const cardCommitments = roundMoney(kpis.cartoes);
    const economicBalance = roundMoney(kpis.saldo);
    const currentBalance = roundMoney(accountsBlock.totalBalance);
    const periodAvailable = [periodInflows, directOutflows, cardCommitments, economicBalance]
        .every(value => value !== null);
    if (currentBalance === null && !periodAvailable) {
        return {
            status: 'unavailable',
            reason: 'source_unavailable',
            timeBasis: 'current_state',
            currentBalance: null,
            periodInflows: null,
            periodDirectOutflows: null,
            periodCardCommitments: null,
            periodEconomicBalance: null,
            economicDailyFlow: [],
            criteria: UNAVAILABLE_CRITERIA
        };
    }
    return {
        status: currentBalance === null
            ? 'partial'
            : accountsBlock.status === 'fallback'
                ? 'fallback'
                : 'available',
        timeBasis: 'current_state',
        currentBalance,
        periodInflows: periodAvailable ? periodInflows : null,
        periodDirectOutflows: periodAvailable ? directOutflows : null,
        periodCardCommitments: periodAvailable ? cardCommitments : null,
        periodEconomicBalance: periodAvailable ? economicBalance : null,
        periodTimeBasis: 'transaction_date',
        economicDailyFlow: periodAvailable && Array.isArray(snapshot.dailyFlow)
            ? sanitizePublicValue(snapshot.dailyFlow)
            : [],
        source: accountsBlock.source || 'unavailable',
        criteria: 'Caixa atual usa o saldo das contas. Entradas, saídas diretas e compromissos de cartão do período ficam separados e não representam competência de cobrança.'
    };
}

function buildReserveBlock(snapshot = {}, criteria = {}) {
    const kpis = snapshot.kpis || {};
    const applied = roundMoney(kpis.reservaAplicada);
    const redeemed = roundMoney(kpis.reservaResgatada);
    const net = roundMoney(kpis.reservaLiquida);
    const availableBalance = roundMoney(kpis.saldoDisponivelEstimado);
    if ([applied, redeemed, net, availableBalance].some(value => value === null)) {
        return {
            status: 'unavailable',
            reason: 'source_unavailable',
            timeBasis: 'transaction_date',
            applied: null,
            redeemed: null,
            net: null,
            availableBalance: null,
            criteria: UNAVAILABLE_CRITERIA
        };
    }
    return {
        status: 'available',
        timeBasis: 'transaction_date',
        applied,
        redeemed,
        net,
        availableBalance,
        criteria: criteria.available
    };
}

function buildCompetenceBlock(totalResult, categoryResult) {
    const total = totalResult?.ok ? roundMoney(totalResult.result?.value) : null;
    const categories = categoryResult?.ok && Array.isArray(categoryResult.result?.value)
        ? sanitizePublicValue(categoryResult.result.value)
        : [];
    const status = totalResult?.ok && categoryResult?.ok
        ? 'available'
        : totalResult?.ok || categoryResult?.ok
            ? 'partial'
            : 'unavailable';
    return {
        status,
        ...(status === 'unavailable' ? { reason: 'source_unavailable' } : {}),
        timeBasis: 'billing_month',
        realizedExpenses: total,
        categories,
        source: publicSource(totalResult?.source || categoryResult?.source),
        criteria: toolCriteria(totalResult, toolCriteria(categoryResult, status === 'unavailable' ? UNAVAILABLE_CRITERIA : 'Competência de cobrança calculada pelo Query Engine.'))
    };
}

function buildBudgetCategories(categories = []) {
    return categories.map(item => sanitizePublicValue({
        category: item.category || '',
        subcategory: item.subcategory || '',
        hasAllocation: item.hasAllocation === true,
        plannedAmount: roundMoney(item.plannedAmount),
        actualAmount: roundMoney(item.actualAmount),
        remainingAmount: roundMoney(item.remainingAmount),
        dailyPace: roundMoney(item.dailyPace),
        status: item.status || ''
    }));
}

function buildBudgetBlock(result) {
    const value = result?.result?.value || {};
    const contract = value.categoryBudget;
    if (!result?.ok || !contract || contract.status !== 'available') {
        return {
            status: 'unavailable',
            reason: 'source_unavailable',
            timeBasis: 'budget_cycle',
            globalBudget: null,
            allocatedBudget: null,
            unallocatedBudget: null,
            overallocatedBudget: null,
            actualBudget: null,
            remainingBudget: null,
            dailyPace: null,
            categories: [],
            criteria: UNAVAILABLE_CRITERIA
        };
    }
    return {
        status: 'available',
        timeBasis: 'budget_cycle',
        active: value.active === true,
        cycle: sanitizePublicValue(contract.cycle || value.cycle || null),
        globalBudget: roundMoney(contract.globalBudget),
        allocatedBudget: roundMoney(contract.allocatedBudget),
        unallocatedBudget: roundMoney(contract.unallocatedBudget),
        overallocatedBudget: roundMoney(contract.overallocatedBudget),
        actualBudget: roundMoney(contract.actualBudget),
        remainingBudget: roundMoney(contract.remainingBudget),
        dailyPace: roundMoney(contract.dailyPace),
        categories: buildBudgetCategories(Array.isArray(contract.categories) ? contract.categories : []),
        source: publicSource(result.source),
        criteria: toolCriteria(result, 'Orçamento por categoria calculado pelo ciclo configurado.')
    };
}

function snapshotAccountsFallback(snapshot = {}) {
    const accounts = snapshot.financialAccounts;
    const totalBalance = roundMoney(accounts?.totalBalance);
    if (!accounts || totalBalance === null || !Array.isArray(accounts.items) || accounts.items.length === 0) return null;
    return {
        status: 'fallback',
        timeBasis: 'current_state',
        totalBalance,
        count: accounts.items.length,
        items: sanitizePublicValue(accounts.items),
        source: 'dashboard_snapshot',
        criteria: 'Saldo por conta lido do snapshot sanitizado do dashboard.'
    };
}

function buildAccountsBlock(result, snapshot = {}) {
    const value = result?.result?.value;
    if (result?.ok && value && typeof value === 'object') {
        return {
            status: 'available',
            timeBasis: 'current_state',
            totalBalance: roundMoney(value.total),
            count: Number.isInteger(value.count) ? value.count : Array.isArray(value.items) ? value.items.length : 0,
            items: sanitizePublicValue(Array.isArray(value.items) ? value.items : []),
            source: publicSource(result.source),
            criteria: toolCriteria(result, 'Saldo atual lido da fonte canônica de contas.')
        };
    }
    return snapshotAccountsFallback(snapshot) || {
        status: 'unavailable',
        reason: 'source_unavailable',
        timeBasis: 'current_state',
        totalBalance: null,
        count: null,
        items: [],
        criteria: UNAVAILABLE_CRITERIA
    };
}

function buildForecastBlocks(result) {
    const value = result?.result?.value;
    if (!result?.ok || !value || typeof value !== 'object') {
        return {
            invoices: {
                status: 'unavailable',
                reason: 'source_unavailable',
                timeBasis: 'due_date',
                total: null,
                count: null,
                items: [],
                criteria: UNAVAILABLE_CRITERIA
            },
            forecast: {
                status: 'unavailable',
                reason: 'source_unavailable',
                timeBasis: 'due_date',
                payable: null,
                receivable: null,
                netExpectedCash: null,
                currentCashImpact: null,
                count: null,
                items: [],
                criteria: UNAVAILABLE_CRITERIA
            }
        };
    }
    const items = sanitizePublicValue(Array.isArray(value.items) ? value.items : []);
    const invoiceItems = items.filter(item => String(item.domain || '').toLowerCase() === 'invoice');
    const criteria = toolCriteria(result, 'Vencimentos previstos não alteram o caixa atual.');
    return {
        invoices: {
            status: 'available',
            timeBasis: 'due_date',
            total: roundMoney(invoiceItems.reduce((sum, item) => sum + Number(item.value || item.amount || 0), 0)),
            count: invoiceItems.length,
            items: invoiceItems,
            source: publicSource(result.source),
            criteria
        },
        forecast: {
            status: 'available',
            timeBasis: 'due_date',
            payable: roundMoney(value.payable),
            receivable: roundMoney(value.receivable),
            netExpectedCash: roundMoney(value.netExpectedCash),
            currentCashImpact: roundMoney(value.currentCashImpact),
            count: Number.isInteger(value.count) ? value.count : items.length,
            items,
            source: publicSource(result.source),
            criteria
        }
    };
}

function buildCollectionBlock(items, criteria) {
    if (!Array.isArray(items)) {
        return { status: 'unavailable', reason: 'source_unavailable', count: null, items: [], criteria: UNAVAILABLE_CRITERIA };
    }
    return { status: 'available', count: items.length, items: sanitizePublicValue(items), criteria };
}

function buildQualityBlock(result, snapshot = {}) {
    const canonical = result?.ok && result.result?.value && typeof result.result.value === 'object'
        ? result.result.value
        : null;
    if (canonical) {
        const requestedStatus = String(canonical.status || 'partial').toLowerCase();
        return sanitizePublicValue({
            status: BLOCK_STATUS.has(requestedStatus) ? requestedStatus : 'partial',
            timeBasis: 'transaction_date',
            totalCount: finiteNumber(canonical.totalCount),
            cleanCount: finiteNumber(canonical.cleanCount),
            classificationApplicableCount: finiteNumber(canonical.classificationApplicableCount),
            classifiedCount: finiteNumber(canonical.classifiedCount),
            missingCategoryCount: finiteNumber(canonical.missingCategoryCount),
            uncertainCount: finiteNumber(canonical.uncertainCount),
            pendingStatusCount: finiteNumber(canonical.pendingStatusCount),
            pendingCount: finiteNumber(canonical.pendingCount),
            unreconciledCount: finiteNumber(canonical.unreconciledCount),
            missingFinancialAccountCount: finiteNumber(canonical.missingFinancialAccountCount),
            receiptRequiredCount: finiteNumber(canonical.receiptRequiredCount),
            missingRequiredReceiptCount: finiteNumber(canonical.missingRequiredReceiptCount),
            receiptIndicatorStatus: canonical.receiptIndicatorStatus === 'applicable' ? 'applicable' : 'not_applicable',
            coveragePct: finiteNumber(canonical.coveragePct),
            qualityCoveragePct: finiteNumber(canonical.qualityCoveragePct),
            bySource: Array.isArray(canonical.bySource) ? canonical.bySource : [],
            items: Array.isArray(canonical.items) ? canonical.items : [],
            source: publicSource(result.source),
            criteria: typeof canonical.criteria === 'string' && canonical.criteria.trim()
                ? canonical.criteria
                : 'Indicadores calculados sobre eventos canônicos observados no período.'
        });
    }

    const quality = snapshot.dataQuality;
    if (!quality || typeof quality !== 'object') {
        return {
            status: 'unavailable',
            reason: 'source_unavailable',
            classifiedCount: null,
            pendingCount: null,
            unreconciledCount: null,
            coveragePct: null,
            criteria: UNAVAILABLE_CRITERIA
        };
    }
    const requestedStatus = String(quality.status || 'available').toLowerCase();
    return sanitizePublicValue({
        status: BLOCK_STATUS.has(requestedStatus) ? requestedStatus : 'available',
        classifiedCount: finiteNumber(quality.classifiedCount),
        pendingCount: finiteNumber(quality.pendingCount),
        unreconciledCount: finiteNumber(quality.unreconciledCount),
        coveragePct: finiteNumber(quality.coveragePct),
        criteria: typeof quality.criteria === 'string' && quality.criteria.trim()
            ? quality.criteria
            : 'Indicadores de qualidade fornecidos pelo read-model.'
    });
}

async function buildDashboardV2Summary({
    snapshot = {},
    userIds = [],
    ownerUserId = '',
    month,
    year,
    currentDate,
    queryTool = queryFinancialPlanTool
} = {}) {
    const safeUserIds = Array.from(new Set((userIds || []).map(value => String(value || '').trim()).filter(Boolean)));
    const period = normalizePeriod(snapshot, month, year);
    const planPeriod = {
        type: 'month',
        month: Number(period.month),
        year: Number(period.year)
    };
    const common = {
        userIds: safeUserIds,
        ownerUserId: String(ownerUserId || '').trim(),
        currentDate: saoPauloIsoDate(currentDate)
    };
    const plans = [
        { kind: 'financial_query', domain: 'expenses', operation: 'sum', filters: { period: planPeriod }, timeBasis: 'billing_month' },
        { kind: 'financial_query', domain: 'expenses', operation: 'rank', filters: { period: planPeriod }, groupBy: ['category'], sort: { by: 'value', direction: 'desc' }, limit: 10, timeBasis: 'billing_month' },
        { kind: 'financial_query', domain: 'budget', operation: 'detail', filters: { period: planPeriod }, timeBasis: 'budget_cycle' },
        { kind: 'financial_query', domain: 'accounts', operation: 'explain', filters: {}, timeBasis: 'current_state' },
        { kind: 'financial_query', domain: 'forecast', operation: 'forecast', filters: { period: planPeriod }, sort: { by: 'due_date', direction: 'asc' }, limit: 50, timeBasis: 'due_date' },
        { kind: 'financial_query', domain: 'quality', operation: 'detail', filters: { period: planPeriod }, groupBy: ['source'], limit: 12, timeBasis: 'transaction_date' }
    ];
    const [competenceTotal, competenceCategories, budget, accounts, forecast, quality] = await Promise.all(
        plans.map(plan => safeQuery(queryTool, { ...common, plan }))
    );
    const criteria = { ...buildDashboardCriteria(), ...(snapshot.criteria || {}) };
    const forecastBlocks = buildForecastBlocks(forecast);
    const accountsBlock = buildAccountsBlock(accounts, snapshot);

    return sanitizePublicValue({
        version: 'dashboard-summary-v2',
        period,
        scope: normalizeScope(snapshot, safeUserIds),
        blocks: {
            cash: buildCashBlock(snapshot, accountsBlock),
            competence: buildCompetenceBlock(competenceTotal, competenceCategories),
            reserve: buildReserveBlock(snapshot, criteria),
            budget: buildBudgetBlock(budget),
            accounts: accountsBlock,
            invoices: forecastBlocks.invoices,
            forecast: forecastBlocks.forecast,
            goals: buildCollectionBlock(snapshot.goals, 'Metas atuais do snapshot read-only.'),
            debts: buildCollectionBlock(snapshot.debts, 'Dívidas atuais do snapshot read-only.'),
            quality: buildQualityBlock(quality, snapshot),
            recentTransactions: buildCollectionBlock(snapshot.recentTransactions, criteria.recentTransactions)
        }
    });
}

module.exports = {
    buildDashboardV2Summary,
    __test__: {
        sanitizePublicValue,
        saoPauloIsoDate,
        normalizePeriod,
        buildQualityBlock
    }
};
