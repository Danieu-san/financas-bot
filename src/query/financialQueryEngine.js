const { normalizeFinancialQueryPlan } = require('./financialQueryPlan');
const { parseSheetDate, parseValue, normalizeText, getFormattedDateOnly } = require('../utils/helpers');

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function roundMoney(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function normalizeLabel(value, fallback = 'Outros') {
    const text = String(value || '').trim();
    return text || fallback;
}

function normalizeMerchant(description) {
    const original = String(description || '').trim();
    const normalized = normalizeText(original);
    if (!normalized) return 'Sem descrição';
    if (normalized.includes('ifood') || normalized.includes('i food')) return 'iFood';
    if (normalized.includes('uber')) return 'Uber';
    if (normalized.includes('mercadolivre') || normalized.includes('mercado livre')) return 'Mercado Livre';
    if (normalized.includes('google')) return 'Google';
    return original
        .replace(/\s*[-–—]?\s*(?:parcela\s*)?\d+\s*\/\s*\d+\s*$/i, '')
        .replace(/\b(?:compra|pagamento|pix|debito|débito|credito|crédito|nu\s*pay|nupay)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim() || original || 'Sem descrição';
}

function parseBillingMonth(value) {
    const text = normalizeText(String(value || '').trim());
    const match = text.match(/^(.+?)\s+de\s+(\d{4})$/);
    if (!match) return null;
    const month = MONTH_NAMES.findIndex(name => normalizeText(name) === match[1]);
    const year = Number.parseInt(match[2], 10);
    if (month < 0 || !Number.isInteger(year)) return null;
    return { month, year };
}

function periodFromPlan(plan) {
    const period = plan?.filters?.period || {};
    return {
        month: Number.isInteger(period.month) ? period.month : null,
        year: Number.isInteger(period.year) ? period.year : null
    };
}

function dateMatchesPeriod(value, period) {
    if (period.month === null && period.year === null) return true;
    const date = parseSheetDate(value);
    if (!date) return false;
    if (period.month !== null && date.getMonth() !== period.month) return false;
    if (period.year !== null && date.getFullYear() !== period.year) return false;
    return true;
}

function billingMatchesPeriod(value, period) {
    if (period.month === null && period.year === null) return true;
    const billing = parseBillingMonth(value);
    if (!billing) return false;
    if (period.month !== null && billing.month !== period.month) return false;
    if (period.year !== null && billing.year !== period.year) return false;
    return true;
}

function toExpenseFromOutput(row = []) {
    return {
        date: row[0] || '',
        description: row[1] || '',
        category: row[2] || 'Outros',
        subcategory: row[3] || '',
        value: parseValue(row[4]),
        source: 'Saídas',
        sourceType: 'expense',
        paymentMethod: row[6] || '',
        card: '',
        installment: '',
        billingMonth: '',
        userId: row[9] || ''
    };
}

function toExpenseFromCard(row = []) {
    return {
        date: row[0] || '',
        description: row[1] || '',
        category: row[2] || 'Cartão',
        subcategory: 'Cartão de Crédito',
        value: parseValue(row[3]),
        source: 'Lançamentos Cartão',
        sourceType: 'card',
        paymentMethod: 'Crédito',
        cardId: row[6] || '',
        card: row[7] || row[6] || '',
        installment: row[4] || '',
        billingMonth: row[5] || '',
        userId: row[9] || ''
    };
}

function toIncome(row = []) {
    return {
        date: row[0] || '',
        description: row[1] || '',
        category: row[2] || 'Entrada',
        subcategory: '',
        value: parseValue(row[3]),
        source: 'Entradas',
        sourceType: 'income',
        paymentMethod: row[5] || '',
        recurrence: row[6] || '',
        status: row[6] || '',
        userId: row[8] || ''
    };
}

function toTransfer(row = []) {
    const status = row[7] || '';
    return {
        date: row[0] || '',
        description: row[1] || '',
        category: status || 'Transferência',
        subcategory: '',
        value: parseValue(row[2]),
        source: 'Transferências',
        sourceType: 'transfer',
        paymentMethod: row[5] || '',
        from: row[3] || '',
        to: row[4] || '',
        notes: row[6] || '',
        status,
        userId: row[8] || ''
    };
}

function findHeaderIndex(headers, aliases, fallbackIndex) {
    if (!Array.isArray(headers)) return fallbackIndex;
    const normalizedAliases = aliases.map(alias => normalizeText(alias));
    const found = headers.findIndex(header => normalizedAliases.includes(normalizeText(header)));
    return found >= 0 ? found : fallbackIndex;
}

function isInactiveStatus(status) {
    return /(cancelad|concluid|finalizad|pausad|inativ|nao|não)/.test(normalizeText(status || ''));
}

function toGoal(row = [], headers = []) {
    const idx = {
        name: findHeaderIndex(headers, ['Nome', 'Nome da Meta'], 0),
        target: findHeaderIndex(headers, ['Valor Alvo', 'Alvo'], 1),
        current: findHeaderIndex(headers, ['Valor Atual', 'Atual'], 2),
        monthly: findHeaderIndex(headers, ['Valor Mensal', 'Valor Mensal Necessário', 'Valor Mensal Sugerido'], 4),
        dueDate: findHeaderIndex(headers, ['Data Fim', 'Data Final', 'Data Alvo', 'Prazo'], 5),
        status: findHeaderIndex(headers, ['Status'], 6),
        priority: findHeaderIndex(headers, ['Prioridade'], 7),
        userId: findHeaderIndex(headers, ['user_id', 'user id'], 8),
        scope: findHeaderIndex(headers, ['Escopo', 'Scope'], 9)
    };
    const target = parseValue(row[idx.target]);
    const current = parseValue(row[idx.current]);
    const missing = Math.max(0, target - current);
    const status = row[idx.status] || '';
    return {
        date: row[idx.dueDate] || '',
        description: row[idx.name] || '',
        category: row[idx.scope] || 'Meta',
        subcategory: row[idx.priority] || '',
        value: missing,
        source: 'Metas',
        sourceType: 'goal',
        status,
        target,
        current,
        missing,
        monthlyRequired: parseValue(row[idx.monthly]),
        dueDate: row[idx.dueDate] || '',
        active: !isInactiveStatus(status) && missing > 0,
        userId: row[idx.userId] || ''
    };
}

function toDebt(row = [], headers = []) {
    const idx = {
        name: findHeaderIndex(headers, ['Nome', 'Nome da Dívida'], 0),
        creditor: findHeaderIndex(headers, ['Credor'], 1),
        type: findHeaderIndex(headers, ['Tipo'], 2),
        original: findHeaderIndex(headers, ['Valor Original'], 3),
        balance: findHeaderIndex(headers, ['Saldo Atual'], 4),
        installment: findHeaderIndex(headers, ['Parcela', 'Valor da Parcela'], 5),
        dueDay: findHeaderIndex(headers, ['Dia do Vencimento', 'Vencimento'], 7),
        status: findHeaderIndex(headers, ['Status'], 10),
        userId: findHeaderIndex(headers, ['user_id', 'user id'], 17)
    };
    return {
        date: row[idx.dueDay] || '',
        description: row[idx.name] || '',
        category: row[idx.type] || 'Dívida',
        subcategory: row[idx.creditor] || '',
        value: parseValue(row[idx.balance]),
        source: 'Dívidas',
        sourceType: 'debt',
        status: row[idx.status] || '',
        originalValue: parseValue(row[idx.original]),
        installmentValue: parseValue(row[idx.installment]),
        dueDay: row[idx.dueDay] || '',
        userId: row[idx.userId] || ''
    };
}

function toBill(row = []) {
    const activeText = row[8] || '';
    return {
        date: row[1] || '',
        description: row[4] || row[0] || '',
        category: row[5] || 'Conta',
        subcategory: row[6] || '',
        value: parseValue(row[7]),
        source: 'Contas',
        sourceType: 'bill',
        notes: row[2] || '',
        status: activeText || 'SIM',
        dueDay: row[1] || '',
        recurrence: 'Mensal',
        userId: row[3] || ''
    };
}

function toBudget(row = [], headers = []) {
    const idx = {
        enabled: findHeaderIndex(headers, ['monthly_budget_enabled', 'orçamento ativo', 'orcamento ativo'], 1),
        amount: findHeaderIndex(headers, ['monthly_budget_amount', 'valor orçamento mensal', 'valor orcamento mensal'], 2),
        scope: findHeaderIndex(headers, ['monthly_budget_scope', 'escopo orçamento', 'escopo orcamento'], 3),
        cycleStartDay: findHeaderIndex(headers, ['monthly_budget_cycle_start_day', 'dia inicio ciclo', 'dia início ciclo'], 4),
        userId: findHeaderIndex(headers, ['user_id', 'user id'], 0)
    };
    return {
        date: row[idx.cycleStartDay] || '',
        description: 'Orçamento mensal livre',
        category: row[idx.scope] || 'personal',
        subcategory: '',
        value: parseValue(row[idx.amount]),
        source: 'UserSettings',
        sourceType: 'budget',
        status: row[idx.enabled] || '',
        userId: row[idx.userId] || ''
    };
}

function getRowsForDomain(dataSources = {}, plan = {}) {
    const period = periodFromPlan(plan);
    const rows = [];
    const includeOutputs = plan.domain === 'expenses';
    const includeCards = plan.domain === 'expenses' || plan.domain === 'cards';

    if (includeOutputs && Array.isArray(dataSources.saidas)) {
        dataSources.saidas.slice(1).forEach((row) => {
            const item = toExpenseFromOutput(row);
            if (dateMatchesPeriod(item.date, period)) rows.push(item);
        });
    }

    if (includeCards && Array.isArray(dataSources.cartoes)) {
        dataSources.cartoes.forEach((sheetRows) => {
            if (!Array.isArray(sheetRows)) return;
            sheetRows.slice(1).forEach((row) => {
                const item = toExpenseFromCard(row);
                const matches = plan.timeBasis === 'transaction_date'
                    ? dateMatchesPeriod(item.date, period)
                    : billingMatchesPeriod(item.billingMonth, period);
                if (matches) rows.push(item);
            });
        });
    }

    if (plan.domain === 'income' && Array.isArray(dataSources.entradas)) {
        dataSources.entradas.slice(1).forEach((row) => {
            const item = toIncome(row);
            if (dateMatchesPeriod(item.date, period)) rows.push(item);
        });
    }

    if (plan.domain === 'transfers' && Array.isArray(dataSources.transferencias)) {
        dataSources.transferencias.slice(1).forEach((row) => {
            const item = toTransfer(row);
            if (dateMatchesPeriod(item.date, period)) rows.push(item);
        });
    }

    if (plan.domain === 'goals' && Array.isArray(dataSources.metas)) {
        const headers = dataSources.metas[0] || [];
        dataSources.metas.slice(1).forEach((row) => {
            const item = toGoal(row, headers);
            if (item.description) rows.push(item);
        });
    }

    if (plan.domain === 'debts' && Array.isArray(dataSources.dividas)) {
        const headers = dataSources.dividas[0] || [];
        dataSources.dividas.slice(1).forEach((row) => {
            const item = toDebt(row, headers);
            if (item.description) rows.push(item);
        });
    }

    if (plan.domain === 'bills' && Array.isArray(dataSources.contas)) {
        dataSources.contas.slice(1).forEach((row) => {
            const item = toBill(row);
            if (item.description) rows.push(item);
        });
    }

    if (plan.domain === 'budget' && Array.isArray(dataSources.userSettings)) {
        const headers = dataSources.userSettings[0] || [];
        dataSources.userSettings.slice(1).forEach((row) => {
            const item = toBudget(row, headers);
            if (item.description) rows.push(item);
        });
    }

    if (['goals', 'debts', 'bills', 'budget'].includes(plan.domain)) {
        return rows.filter(item => String(item.description || '').trim());
    }
    return rows.filter(item => Number(item.value || 0) > 0);
}

function containsFilter(haystack, needle) {
    const normalizedNeedle = normalizeText(needle);
    if (!normalizedNeedle) return true;
    return normalizeText(haystack).includes(normalizedNeedle);
}

function applyFilters(rows, filters = {}) {
    return rows.filter((item) => {
        if (filters.category && !containsFilter(`${item.category} ${item.subcategory} ${item.description}`, filters.category)) return false;
        if (Array.isArray(filters.categories) && filters.categories.length > 0) {
            const matchesCategory = filters.categories.some(category => containsFilter(`${item.category} ${item.subcategory} ${item.description}`, category));
            if (!matchesCategory) return false;
        }
        if (filters.subcategory && !containsFilter(`${item.subcategory} ${item.description}`, filters.subcategory)) return false;
        if (filters.merchant && !containsFilter(`${item.description} ${normalizeMerchant(item.description)}`, filters.merchant)) return false;
        if (filters.paymentMethod && !containsFilter(item.paymentMethod, filters.paymentMethod)) return false;
        if (filters.card && !containsFilter(`${item.cardId || ''} ${item.card || ''}`, filters.card)) return false;
        if (filters.source && !containsFilter(`${item.source} ${item.sourceType}`, filters.source)) return false;
        if (filters.status && !containsFilter(`${item.status || ''} ${item.category || ''} ${item.description || ''} ${item.notes || ''}`, filters.status)) return false;
        if (filters.recurrence && !containsFilter(`${item.recurrence || ''} ${item.status || ''}`, filters.recurrence)) return false;
        if (filters.member && !containsFilter(`${item.member || ''} ${item.userId || ''}`, filters.member)) return false;
        if (filters.value?.min !== undefined && item.value < filters.value.min) return false;
        if (filters.value?.max !== undefined && item.value > filters.value.max) return false;
        if (filters.value?.equals !== undefined && Math.abs(item.value - filters.value.equals) > 0.005) return false;
        return true;
    });
}

function getGroupValue(item, groupBy) {
    const map = {
        category: item.category,
        subcategory: item.subcategory,
        merchant: normalizeMerchant(item.description),
        paymentMethod: item.paymentMethod,
        card: item.card || item.cardId,
        member: item.userId,
        date: getFormattedDateOnly(parseSheetDate(item.date)) || item.date,
        month: item.billingMonth || item.date,
        status: item.status,
        source: item.sourceType
    };
    return normalizeLabel(map[groupBy], 'Outros');
}

function groupRows(rows, groupBy = []) {
    const selected = groupBy.length > 0 ? groupBy : ['category'];
    const grouped = new Map();
    rows.forEach((item) => {
        const label = selected.map(key => getGroupValue(item, key)).join(' / ');
        const key = normalizeText(label) || label;
        const existing = grouped.get(key) || { label, total: 0, count: 0 };
        existing.total += Number(item.value || 0);
        existing.count += 1;
        grouped.set(key, existing);
    });
    return Array.from(grouped.values())
        .map(item => ({ ...item, total: roundMoney(item.total) }))
        .sort((a, b) => b.total - a.total || b.count - a.count || String(a.label).localeCompare(String(b.label), 'pt-BR'));
}

function sortRows(rows, sort = {}) {
    const by = sort.by || 'value';
    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
        if (by === 'date') {
            const diff = (parseSheetDate(a.date)?.getTime() || 0) - (parseSheetDate(b.date)?.getTime() || 0);
            return diff * direction;
        }
        if (by === 'name') return String(a.description).localeCompare(String(b.description), 'pt-BR') * direction;
        return (Number(a.value || 0) - Number(b.value || 0)) * direction;
    });
}

function publicItem(item) {
    const output = {
        date: item.date,
        description: item.description,
        category: item.category,
        subcategory: item.subcategory,
        value: roundMoney(item.value),
        source: item.source,
        paymentMethod: item.paymentMethod,
        card: item.card,
        installment: item.installment,
        billingMonth: item.billingMonth
    };
    if (item.status !== undefined) output.status = item.status;
    if (item.dueDay !== undefined) output.dueDay = item.dueDay;
    if (item.target !== undefined) output.target = roundMoney(item.target);
    if (item.current !== undefined) output.current = roundMoney(item.current);
    if (item.missing !== undefined) output.missing = roundMoney(item.missing);
    if (item.monthlyRequired !== undefined) output.monthlyRequired = roundMoney(item.monthlyRequired);
    if (item.active !== undefined) output.active = Boolean(item.active);
    return output;
}

function buildDetail(rows, plan) {
    const totalOutputs = rows
        .filter(item => item.sourceType === 'expense')
        .reduce((sum, item) => sum + Number(item.value || 0), 0);
    const totalCards = rows
        .filter(item => item.sourceType === 'card')
        .reduce((sum, item) => sum + Number(item.value || 0), 0);
    return {
        total: roundMoney(rows.reduce((sum, item) => sum + Number(item.value || 0), 0)),
        totals: {
            outputs: roundMoney(totalOutputs),
            cards: roundMoney(totalCards)
        },
        count: rows.length,
        groups: {
            category: groupRows(rows, ['category']).slice(0, plan.limit),
            merchant: groupRows(rows, ['merchant']).slice(0, plan.limit),
            paymentMethod: groupRows(rows, ['paymentMethod']).slice(0, plan.limit),
            card: groupRows(rows.filter(item => item.sourceType === 'card'), ['card']).slice(0, plan.limit),
            source: groupRows(rows, ['source']).slice(0, plan.limit)
        },
        items: sortRows(rows, plan.sort).slice(0, plan.limit).map(publicItem)
    };
}

function buildGoalsDetail(rows) {
    const totals = rows.reduce((acc, item) => {
        acc.target += Number(item.target || 0);
        acc.current += Number(item.current || 0);
        acc.missing += Number(item.missing || 0);
        acc.monthlyRequired += Number(item.monthlyRequired || 0);
        return acc;
    }, { target: 0, current: 0, missing: 0, monthlyRequired: 0 });
    return {
        totals: {
            target: roundMoney(totals.target),
            current: roundMoney(totals.current),
            missing: roundMoney(totals.missing),
            monthlyRequired: roundMoney(totals.monthlyRequired)
        },
        count: rows.length,
        activeCount: rows.filter(item => item.active).length,
        items: rows.map(publicItem)
    };
}

function denominatorFiltersForPercentage(filters = {}) {
    const kept = {};
    ['period', 'scope', 'member', 'paymentMethod', 'card', 'status', 'source', 'recurrence'].forEach((key) => {
        if (filters[key] !== undefined) kept[key] = filters[key];
    });
    return kept;
}

function previousMonthPeriod(period) {
    if (period.month === null || period.year === null) return null;
    const date = new Date(period.year, period.month - 1, 1);
    return { month: date.getMonth(), year: date.getFullYear() };
}

function getBillingKey(value) {
    const billing = parseBillingMonth(value);
    if (!billing) return null;
    return billing.year * 12 + billing.month;
}

function getRowsForForecast(dataSources = {}, plan = {}) {
    if (plan.domain !== 'cards') return getRowsForDomain(dataSources, plan);
    const period = periodFromPlan(plan);
    if (period.month === null || period.year === null) return getRowsForDomain(dataSources, { ...plan, filters: { ...plan.filters, period: undefined } });
    const targetKey = period.year * 12 + period.month;
    const draftPlan = { ...plan, filters: { ...plan.filters, period: undefined } };
    return getRowsForDomain(dataSources, draftPlan).filter((item) => {
        const key = getBillingKey(item.billingMonth);
        return key !== null && key >= targetKey;
    });
}

function buildDashboardSummary(dataSources = {}, plan = {}) {
    const period = periodFromPlan(plan);
    const filters = { period: plan.filters?.period };
    const income = applyFilters(getRowsForDomain(dataSources, { domain: 'income', filters }), plan.filters)
        .reduce((sum, item) => sum + Number(item.value || 0), 0);
    const expenses = applyFilters(getRowsForDomain(dataSources, { domain: 'expenses', filters, timeBasis: 'billing_month' }), plan.filters)
        .reduce((sum, item) => sum + Number(item.value || 0), 0);
    const transfers = applyFilters(getRowsForDomain(dataSources, { domain: 'transfers', filters }), plan.filters);
    const reserveApplied = transfers
        .filter(item => /reserva|investimento|aplicacao|aplicação|caixinha/i.test(normalizeText(`${item.description} ${item.status} ${item.to}`)))
        .filter(item => !/resgate/i.test(normalizeText(`${item.description} ${item.status} ${item.from}`)))
        .reduce((sum, item) => sum + Number(item.value || 0), 0);
    const reserveRedeemed = transfers
        .filter(item => /resgate/i.test(normalizeText(`${item.description} ${item.status} ${item.from}`)))
        .reduce((sum, item) => sum + Number(item.value || 0), 0);
    const reserveNet = reserveApplied - reserveRedeemed;
    return {
        period,
        income: roundMoney(income),
        spending: roundMoney(expenses),
        balance: roundMoney(income - expenses),
        reserveApplied: roundMoney(reserveApplied),
        reserveRedeemed: roundMoney(reserveRedeemed),
        reserveNet: roundMoney(reserveNet),
        availableEstimate: roundMoney(income - expenses - reserveNet)
    };
}

async function executeFinancialQuery(rawPlan, dataSources = {}) {
    const normalized = normalizeFinancialQueryPlan(rawPlan);
    if (!normalized.ok) {
        return { ok: false, errors: normalized.errors, plan: null, result: null };
    }
    const plan = normalized.plan;
    const supportedDomains = ['expenses', 'cards', 'income', 'transfers', 'goals', 'debts', 'bills', 'budget', 'dashboard'];
    if (!supportedDomains.includes(plan.domain)) {
        return { ok: false, errors: [`dominio ainda nao implementado na Query Engine: ${plan.domain}`], plan, result: null };
    }

    if (plan.domain === 'dashboard') {
        const summary = buildDashboardSummary(dataSources, plan);
        const value = plan.operation === 'sum' ? summary.balance : summary;
        return {
            ok: true,
            plan,
            result: {
                value,
                details: {
                    domain: plan.domain,
                    operation: plan.operation,
                    count: 1,
                    total: summary.balance,
                    timeBasis: plan.timeBasis,
                    filters: plan.filters
                }
            }
        };
    }

    const sourceRows = plan.operation === 'forecast'
        ? getRowsForForecast(dataSources, plan)
        : getRowsForDomain(dataSources, plan);
    const rows = applyFilters(sourceRows, plan.filters);
    const total = roundMoney(rows.reduce((sum, item) => sum + Number(item.value || 0), 0));
    const baseDetails = {
        domain: plan.domain,
        operation: plan.operation,
        count: rows.length,
        total,
        timeBasis: plan.timeBasis,
        filters: plan.filters
    };

    if (plan.operation === 'sum') {
        return { ok: true, plan, result: { value: total, details: baseDetails } };
    }
    if (plan.operation === 'count') {
        return { ok: true, plan, result: { value: rows.length, details: baseDetails } };
    }
    if (plan.operation === 'list') {
        return { ok: true, plan, result: { value: sortRows(rows, plan.sort).slice(0, plan.limit).map(publicItem), details: baseDetails } };
    }
    if (plan.operation === 'average') {
        const average = rows.length > 0 ? total / rows.length : 0;
        return { ok: true, plan, result: { value: roundMoney(average), details: baseDetails } };
    }
    if (plan.operation === 'percentage') {
        const denominatorPlan = { ...plan, filters: denominatorFiltersForPercentage(plan.filters) };
        const denominatorRows = applyFilters(getRowsForDomain(dataSources, denominatorPlan), denominatorPlan.filters);
        const denominator = roundMoney(denominatorRows.reduce((sum, item) => sum + Number(item.value || 0), 0));
        const percent = denominator > 0 ? (total / denominator) * 100 : 0;
        return {
            ok: true,
            plan,
            result: {
                value: { percent: roundMoney(percent), part: total, total: denominator },
                details: { ...baseDetails, denominator }
            }
        };
    }
    if (plan.operation === 'extreme') {
        const sorted = sortRows(rows, { by: 'value', direction: 'asc' });
        return {
            ok: true,
            plan,
            result: {
                value: {
                    min: sorted[0] ? publicItem(sorted[0]) : null,
                    max: sorted[sorted.length - 1] ? publicItem(sorted[sorted.length - 1]) : null
                },
                details: baseDetails
            }
        };
    }
    if (plan.operation === 'compare') {
        if (Array.isArray(plan.filters.categories) && plan.filters.categories.length > 0) {
            const groups = groupRows(rows, plan.groupBy.length > 0 ? plan.groupBy : ['category']).slice(0, plan.limit);
            return { ok: true, plan, result: { value: { items: groups }, details: { ...baseDetails, groupBy: plan.groupBy } } };
        }
        const period = periodFromPlan(plan);
        const previous = previousMonthPeriod(period);
        if (previous) {
            const previousPlan = { ...plan, operation: 'sum', filters: { ...plan.filters, period: { type: 'month', ...previous } } };
            const previousRows = applyFilters(getRowsForDomain(dataSources, previousPlan), previousPlan.filters);
            const previousTotal = roundMoney(previousRows.reduce((sum, item) => sum + Number(item.value || 0), 0));
            const diff = roundMoney(total - previousTotal);
            const percent = previousTotal > 0 ? roundMoney((diff / previousTotal) * 100) : 0;
            return {
                ok: true,
                plan,
                result: { value: { current: total, previous: previousTotal, difference: diff, percent }, details: baseDetails }
            };
        }
        return { ok: true, plan, result: { value: { current: total, previous: 0, difference: total, percent: 0 }, details: baseDetails } };
    }
    if (['group', 'rank'].includes(plan.operation)) {
        const groups = groupRows(rows, plan.groupBy).slice(0, plan.limit);
        return { ok: true, plan, result: { value: groups, details: { ...baseDetails, groupBy: plan.groupBy } } };
    }
    if (plan.operation === 'detail' || plan.operation === 'explain') {
        if (plan.domain === 'goals') {
            return { ok: true, plan, result: { value: buildGoalsDetail(rows), details: baseDetails } };
        }
        return { ok: true, plan, result: { value: buildDetail(rows, plan), details: baseDetails } };
    }
    if (plan.operation === 'detect') {
        const duplicateGroups = groupRows(rows, ['date', 'merchant']).filter(item => item.count > 1);
        return { ok: true, plan, result: { value: duplicateGroups.slice(0, plan.limit), details: baseDetails } };
    }
    if (plan.operation === 'forecast') {
        const groups = plan.groupBy.length > 0 ? groupRows(rows, plan.groupBy).slice(0, plan.limit) : [];
        return { ok: true, plan, result: { value: { total, groups, items: sortRows(rows, plan.sort).slice(0, plan.limit).map(publicItem) }, details: baseDetails } };
    }
    if (plan.operation === 'search') {
        return { ok: true, plan, result: { value: sortRows(rows, plan.sort).slice(0, plan.limit).map(publicItem), details: baseDetails } };
    }
    if (plan.operation === 'trend' || plan.operation === 'recommend') {
        const groups = groupRows(rows, plan.groupBy.length > 0 ? plan.groupBy : ['month']).slice(0, plan.limit);
        return { ok: true, plan, result: { value: groups, details: { ...baseDetails, groupBy: plan.groupBy } } };
    }

    return { ok: false, errors: [`operacao ainda nao implementada na Query Engine: ${plan.operation}`], plan, result: null };
}

module.exports = {
    executeFinancialQuery,
    __test__: {
        parseBillingMonth,
        normalizeMerchant,
        getRowsForDomain,
        applyFilters,
        groupRows,
        buildDashboardSummary
    }
};
