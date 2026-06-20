const { normalizeFinancialQueryPlan } = require('./financialQueryPlan');
const { parseSheetDate, parseValue, normalizeText, getFormattedDateOnly } = require('../utils/helpers');
const { matchesAnyField } = require('../utils/textMatcher');
const {
    normalizeCycleStartDay,
    getBudgetCycleForDate,
    getBudgetCycleForPeriod,
    dateIsWithinCycle
} = require('../utils/budgetCycle');
const { validDueDay, buildRecurringDueDate } = require('../utils/recurringDueDate');

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

function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

function parseDayOfMonth(value) {
    const parsed = Number.parseInt(String(value || '').trim(), 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) return null;
    return parsed;
}

function parseInstallment(value) {
    const match = String(value || '').trim().match(/^(\d{1,3})\s*\/\s*(\d{1,3})$/);
    if (!match) return { index: 1, total: 1, isInstallment: false };
    const index = Number.parseInt(match[1], 10);
    const total = Number.parseInt(match[2], 10);
    if (!Number.isInteger(index) || !Number.isInteger(total) || index < 1 || total < 1) {
        return { index: 1, total: 1, isInstallment: false };
    }
    return { index, total, isInstallment: total > 1 };
}

function normalizeCardKey(value) {
    return normalizeText(String(value || '').trim()).replace(/\s+/g, ' ');
}

function buildCardDueDayMap(cardConfigRows = []) {
    const rows = Array.isArray(cardConfigRows) ? cardConfigRows : [];
    const map = new Map();
    rows.slice(1).forEach((row) => {
        const active = normalizeText(row?.[5] || 'sim');
        if (['nao', 'não', 'n', 'false', 'inativo'].includes(active)) return;
        const dueDay = parseDayOfMonth(row?.[4]);
        if (!dueDay) return;
        [row?.[0], row?.[1]].forEach((key) => {
            const normalized = normalizeCardKey(key);
            if (normalized) map.set(normalized, dueDay);
        });
    });
    return map;
}

function getCardDueDay(item = {}, dueDayMap = new Map()) {
    const keys = [item.cardId, item.card].map(normalizeCardKey).filter(Boolean);
    for (const key of keys) {
        if (dueDayMap.has(key)) return dueDayMap.get(key);
    }
    return 1;
}

function getCardBudgetImpactDate(item = {}, dueDayMap = new Map()) {
    const billing = parseBillingMonth(item.billingMonth);
    if (!billing) return parseSheetDate(item.date);
    const dueDay = Math.min(getCardDueDay(item, dueDayMap), daysInMonth(billing.year, billing.month));
    return new Date(billing.year, billing.month, dueDay, 12, 0, 0, 0);
}

function periodFromPlan(plan) {
    const period = plan?.filters?.period || {};
    return {
        type: period.type || '',
        month: Number.isInteger(period.month) ? period.month : null,
        year: Number.isInteger(period.year) ? period.year : null,
        days: Number.isInteger(period.days) ? period.days : null,
        from: period.from || '',
        to: period.to || ''
    };
}

function daysConsideredForAverage(period = {}, currentDate = '') {
    if (!Number.isInteger(period.month) || !Number.isInteger(period.year)) return 365;
    const reference = parseSheetDate(currentDate) || new Date();
    if (reference.getFullYear() === period.year && reference.getMonth() === period.month) {
        return Math.max(1, reference.getDate());
    }
    return daysInMonth(period.year, period.month);
}

function isEssentialExpenseCategory(label = '') {
    const normalized = normalizeText(label);
    return /\b(moradia|aluguel|condominio|condomínio|financiamento|saude|saúde|educacao|educação|divida|dívida|dividas|dívidas|conta|contas|imposto|taxa)\b/.test(normalized);
}

function buildExpenseCutRecommendation(groups = [], total = 0) {
    const ranked = groups.slice().sort((a, b) => Number(b.total || 0) - Number(a.total || 0));
    const candidates = ranked.filter(item => !isEssentialExpenseCategory(item.label)).slice(0, 5);
    const protectedGroups = ranked.filter(item => isEssentialExpenseCategory(item.label)).slice(0, 5);
    return {
        total,
        candidates,
        protectedGroups,
        criteria: 'Critério: priorizei categorias classificadas como mais revisáveis e separei despesas essenciais para não sugerir cortes cegos.',
        disclaimer: 'Sugestão determinística para revisão, não conselho financeiro definitivo.'
    };
}

function dateMatchesPeriod(value, period) {
    if (period.month === null && period.year === null && !period.from && !period.to) return true;
    const date = parseSheetDate(value);
    if (!date) return false;
    if (period.from) {
        const from = parseSheetDate(period.from);
        if (from && date < from) return false;
    }
    if (period.to) {
        const to = parseSheetDate(period.to);
        if (to && date > to) return false;
    }
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
        recurrence: row[7] || '',
        card: '',
        installment: '',
        billingMonth: '',
        userId: row[9] || ''
    };
}

function toExpenseFromCard(row = []) {
    const installmentInfo = parseInstallment(row[4] || '');
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
        installmentIndex: installmentInfo.index,
        installmentTotal: installmentInfo.total,
        isInstallment: installmentInfo.isInstallment,
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

function classifyTransferType(item = {}) {
    const text = normalizeText(`${item.description || ''} ${item.status || ''} ${item.notes || ''}`);
    const origin = normalizeText(item.from || '');
    const destination = normalizeText(item.to || '');
    if (
        text.includes('pagamento de fatura') ||
        (/fatura|cartao|cartão/.test(text) && /\b(pagamento|paguei|paga|pagas|quitei|quitacao|quitação)\b/.test(text)) ||
        text.includes('qrs nu pagament')
    ) return 'invoice_payment';
    const reserveSignal = /(caixinha|reserva|investimento|investimentos|rdb|aplicacao|aplicação|aplicar|guardei|guardar|guardado|resgate|resgat)/.test(text);
    if (reserveSignal) {
        const redemptionSignal = /(resgate|resgat|retirada|retirei|saque)/.test(text) ||
            /(caixinha|reserva|investimento|rdb)/.test(origin) && !/(caixinha|reserva|investimento|rdb)/.test(destination);
        return redemptionSignal ? 'reserve_redeemed' : 'reserve_applied';
    }
    if (/(contas? proprias?|próprias?|minhas contas|mesma titularidade|entre contas)/.test(text)) return 'own_transfer';
    if (/(familia|família|familiar|casal|membro|thais|thaís|cristina|daniel)/.test(text) ||
        text.includes('provavel transferencia interna') ||
        text.includes('provável transferência interna')) return 'family_transfer';
    return 'internal_transfer';
}

function toTransfer(row = []) {
    const status = row[7] || '';
    const item = {
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
    const transferType = classifyTransferType(item);
    return { ...item, category: transferType, transferType };
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
        value: current,
        source: 'Metas',
        sourceType: 'goal',
        status,
        target,
        current,
        missing,
        monthlyRequired: parseValue(row[idx.monthly]),
        dueDate: row[idx.dueDate] || '',
        active: !isInactiveStatus(status) && missing > 0,
        scope: row[idx.scope] || 'personal',
        progressPercent: target > 0 ? Math.min(100, (current / target) * 100) : 0,
        userId: row[idx.userId] || ''
    };
}

function toGoalMovement(row = [], headers = []) {
    const idx = {
        date: findHeaderIndex(headers, ['Data'], 0),
        goal: findHeaderIndex(headers, ['Meta', 'Nome da Meta'], 1),
        type: findHeaderIndex(headers, ['Tipo'], 2),
        value: findHeaderIndex(headers, ['Valor'], 3),
        before: findHeaderIndex(headers, ['Valor Antes'], 4),
        after: findHeaderIndex(headers, ['Valor Depois'], 5),
        notes: findHeaderIndex(headers, ['Observação', 'Observacao'], 6),
        responsible: findHeaderIndex(headers, ['Responsável', 'Responsavel'], 7),
        userId: findHeaderIndex(headers, ['user_id', 'user id'], 8),
        goalUserId: findHeaderIndex(headers, ['goal_user_id', 'goal user id'], 9)
    };
    const type = row[idx.type] || '';
    return {
        date: row[idx.date] || '',
        description: row[idx.goal] || '',
        category: type,
        subcategory: row[idx.notes] || '',
        value: parseValue(row[idx.value]),
        source: 'Movimentações Metas',
        sourceType: 'goal_movement',
        status: type,
        movementType: type,
        valueBefore: parseValue(row[idx.before]),
        valueAfter: parseValue(row[idx.after]),
        responsible: row[idx.responsible] || '',
        userId: row[idx.goalUserId] || row[idx.userId] || ''
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
        interest: findHeaderIndex(headers, ['Juros', 'Taxa'], 6),
        dueDay: findHeaderIndex(headers, ['Dia do Vencimento', 'Vencimento'], 7),
        start: findHeaderIndex(headers, ['Início', 'Inicio', 'Data de Início', 'Data de Inicio'], 8),
        totalInstallments: findHeaderIndex(headers, ['Total Parcelas', 'Total'], 9),
        status: findHeaderIndex(headers, ['Status'], 10),
        responsible: findHeaderIndex(headers, ['Responsável', 'Responsavel'], 11),
        notes: findHeaderIndex(headers, ['Observações', 'Observacoes', 'Obs'], 12),
        progress: findHeaderIndex(headers, ['% Quitado', 'Quitado'], 13),
        nextDue: findHeaderIndex(headers, ['Próximo Vencimento', 'Proximo Vencimento', 'Next Due'], 14),
        overdueDays: findHeaderIndex(headers, ['Atraso (Dias)', 'Dias de Atraso', 'Atraso'], 15),
        payoffDate: findHeaderIndex(headers, ['Data Prevista para Quitação', 'Data Prevista para Quitacao'], 16),
        userId: findHeaderIndex(headers, ['user_id', 'user id'], 17)
    };
    const originalValue = parseValue(row[idx.original]);
    const balance = parseValue(row[idx.balance]);
    const paidAmount = Math.max(0, originalValue - balance);
    const progressPercent = originalValue > 0 ? roundMoney((paidAmount / originalValue) * 100) : parseValue(row[idx.progress]);
    const nextDueDate = row[idx.nextDue] || '';
    const dueDay = row[idx.dueDay] || '';
    const date = nextDueDate;
    return {
        date,
        description: row[idx.name] || '',
        category: row[idx.type] || 'Dívida',
        subcategory: row[idx.creditor] || '',
        value: balance,
        source: 'Dívidas',
        sourceType: 'debt',
        status: row[idx.status] || '',
        originalValue,
        installmentValue: parseValue(row[idx.installment]),
        interestRatePct: parseValue(row[idx.interest]),
        dueDay,
        startDate: row[idx.start] || '',
        totalInstallments: parseValue(row[idx.totalInstallments]),
        paidAmount,
        progressPercent,
        nextDueDate,
        overdueDays: parseValue(row[idx.overdueDays]),
        payoffDate: row[idx.payoffDate] || '',
        responsible: row[idx.responsible] || '',
        notes: row[idx.notes] || '',
        userId: row[idx.userId] || ''
    };
}

function currentDateFromDataSources(dataSources = {}) {
    return parseSheetDate(dataSources.currentDate) || new Date();
}

function addDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12, 0, 0, 0);
}

function endOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12, 0, 0, 0);
}

function debtDueDate(item = {}, referenceDate = new Date()) {
    const explicit = parseSheetDate(item.nextDueDate);
    if (explicit) return explicit;
    const day = Number.parseInt(item.dueDay, 10);
    if (!Number.isInteger(day) || day < 1) return null;
    const buildDueDate = (year, month) => {
        const maxDay = new Date(year, month + 1, 0).getDate();
        return new Date(year, month, Math.min(day, maxDay), 12, 0, 0, 0);
    };
    const currentDue = buildDueDate(referenceDate.getFullYear(), referenceDate.getMonth());
    const status = normalizeText(item.status || '');
    const explicitlyOverdue = Number(item.overdueDays || 0) > 0 || status.includes('atrasad');
    if (currentDue < addDays(referenceDate, 0) && !explicitlyOverdue) {
        return buildDueDate(referenceDate.getFullYear(), referenceDate.getMonth() + 1);
    }
    return currentDue;
}

function debtIsPaid(item = {}) {
    const status = normalizeText(item.status || '');
    return Number(item.value || 0) <= 0 ||
        status.includes('quitad') ||
        status.includes('concluid') ||
        status.includes('pago');
}

function debtIsActive(item = {}) {
    const status = normalizeText(item.status || '');
    return !debtIsPaid(item) && !status.includes('cancelad');
}

function debtIsOverdue(item = {}, referenceDate = new Date()) {
    if (!debtIsActive(item)) return false;
    if (Number(item.overdueDays || 0) > 0) return true;
    const due = debtDueDate(item, referenceDate);
    return Boolean(due && due < addDays(referenceDate, 0));
}

function debtStatusMatches(item = {}, status = '', referenceDate = new Date(), period = {}) {
    const normalized = normalizeText(status);
    if (!normalized) return true;
    if (['paid', 'quitada', 'quitado', 'quitei'].includes(normalized) || normalized.includes('quitad')) {
        return debtIsPaid(item);
    }
    if (normalized.includes('overdue') || normalized.includes('atrasad')) {
        return debtIsOverdue(item, referenceDate);
    }
    if (normalized.includes('upcoming') || normalized.includes('vencendo') || normalized.includes('vence')) {
        if (!debtIsActive(item)) return false;
        const due = debtDueDate(item, referenceDate);
        if (!due) return false;
        const start = addDays(referenceDate, 0);
        const days = Number.isInteger(period.days) ? period.days : 7;
        const end = period.month !== null || period.year !== null
            ? endOfMonth(new Date(period.year || referenceDate.getFullYear(), period.month ?? referenceDate.getMonth(), 1, 12, 0, 0, 0))
            : addDays(referenceDate, days);
        return due >= start && due <= end;
    }
    if (normalized.includes('active') || normalized.includes('ativa') || normalized.includes('ativo')) {
        return debtIsActive(item);
    }
    return containsFilter(`${item.status || ''} ${item.category || ''} ${item.description || ''} ${item.notes || ''}`, status);
}

function toBill(row = [], headers = []) {
    const idx = {
        name: findHeaderIndex(headers, ['Nome da Conta', 'Nome'], 0),
        dueDay: findHeaderIndex(headers, ['Dia do Vencimento', 'Vencimento', 'Dia'], 1),
        notes: findHeaderIndex(headers, ['Observações', 'Observacoes', 'Obs'], 2),
        userId: findHeaderIndex(headers, ['user_id', 'user id'], 3),
        friendlyName: findHeaderIndex(headers, ['Nome Amigável', 'Nome Amigavel'], 4),
        category: findHeaderIndex(headers, ['Categoria'], 5),
        subcategory: findHeaderIndex(headers, ['Subcategoria'], 6),
        expected: findHeaderIndex(headers, ['Valor Esperado', 'Valor'], 7),
        ruleActive: findHeaderIndex(headers, ['Regra Ativa'], 8)
    };
    return {
        date: '',
        description: row[idx.friendlyName] || row[idx.name] || '',
        accountName: row[idx.name] || '',
        category: row[idx.category] || 'Conta',
        subcategory: row[idx.subcategory] || '',
        value: parseValue(row[idx.expected]),
        expectedValue: parseValue(row[idx.expected]),
        source: 'Contas',
        sourceType: 'bill',
        notes: row[idx.notes] || '',
        status: 'scheduled',
        ruleActive: row[idx.ruleActive] || '',
        dueDay: validDueDay(row[idx.dueDay]),
        recurrence: 'Mensal',
        userId: row[idx.userId] || ''
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

function budgetSettingsFromDataSources(dataSources = {}, plan = {}) {
    if (!Array.isArray(dataSources.userSettings)) return null;
    const headers = dataSources.userSettings[0] || [];
    const activeSettings = dataSources.userSettings
        .slice(1)
        .map(row => toBudget(row, headers))
        .filter(item => normalizeText(item.status || '') === 'sim' && Number(item.value || 0) > 0);
    const requestedScope = normalizeText(plan.filters?.scope || '');
    if (requestedScope) {
        return activeSettings.find(item => normalizeText(item.category || '') === requestedScope) || null;
    }
    if (Array.isArray(dataSources.scopeUserIds) && dataSources.scopeUserIds.length > 1) {
        const familySettings = activeSettings.find(item => normalizeText(item.category || '') === 'family');
        if (familySettings) return familySettings;
    }
    return activeSettings[0] || null;
}

function parseReferenceDate(value) {
    const parsed = parseSheetDate(value);
    if (parsed) return parsed;
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
}

function datePartsFromDate(date) {
    return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
}

function budgetCycleFromPlan(plan = {}, cycleStartDay = 1, referenceDate = new Date()) {
    const period = plan.filters?.period || {};
    const referenceParts = datePartsFromDate(referenceDate);
    if (period.type === 'month' && Number.isInteger(period.month) && Number.isInteger(period.year)) {
        return getBudgetCycleForPeriod(period, cycleStartDay, referenceParts);
    }
    return getBudgetCycleForDate(referenceParts, cycleStartDay);
}

function isBudgetFreeSpendingItem(item = {}) {
    if (normalizeText(item.recurrence || '') === 'sim') return false;
    const text = normalizeText(`${item.category || ''} ${item.subcategory || ''} ${item.description || ''}`);
    return !['transferencia', 'transferencias', 'divida', 'dividas', 'investimento', 'investimentos', 'reserva', 'caixinha']
        .some(term => text.includes(term));
}

function sameCalendarDay(date, referenceDate) {
    return Boolean(date && referenceDate &&
        date.getFullYear() === referenceDate.getFullYear() &&
        date.getMonth() === referenceDate.getMonth() &&
        date.getDate() === referenceDate.getDate());
}

function groupBudgetRowsByPublicMember(rows = [], limit = 10) {
    const labels = new Map();
    const grouped = new Map();
    rows.forEach((item) => {
        const key = String(item.userId || 'default').trim() || 'default';
        if (!labels.has(key)) labels.set(key, `Membro ${labels.size + 1}`);
        const label = labels.get(key);
        const existing = grouped.get(label) || { label, total: 0, count: 0 };
        existing.total += Number(item.value || 0);
        existing.count += 1;
        grouped.set(label, existing);
    });
    return Array.from(grouped.values())
        .map(item => ({ ...item, total: roundMoney(item.total) }))
        .sort((a, b) => b.total - a.total || b.count - a.count || String(a.label).localeCompare(String(b.label), 'pt-BR'))
        .slice(0, limit);
}

function getBudgetRows(dataSources = {}, plan = {}, cycle = {}, referenceDate = new Date()) {
    const rows = [];
    const allowedUserIds = Array.isArray(dataSources.scopeUserIds)
        ? new Set(dataSources.scopeUserIds.map(id => String(id || '').trim()).filter(Boolean))
        : null;
    const allowed = (item) => !allowedUserIds || allowedUserIds.has(String(item.userId || '').trim());
    if (Array.isArray(dataSources.saidas)) {
        dataSources.saidas.slice(1).forEach((row) => {
            const item = toExpenseFromOutput(row);
            if (!allowed(item) || !isBudgetFreeSpendingItem(item)) return;
            const impactDate = parseSheetDate(item.date);
            if (!dateIsWithinCycle(impactDate, cycle)) return;
            rows.push({
                ...item,
                budgetImpactDate: impactDate,
                budgetImpactDateLabel: getFormattedDateOnly(impactDate),
                isToday: sameCalendarDay(impactDate, referenceDate)
            });
        });
    }
    const dueDayMap = buildCardDueDayMap(dataSources.cartoesConfig || dataSources.cartoesCadastro || dataSources.cards || []);
    if (Array.isArray(dataSources.cartoes)) {
        dataSources.cartoes.forEach((sheetRows) => {
            if (!Array.isArray(sheetRows)) return;
            sheetRows.slice(1).forEach((row) => {
                const item = toExpenseFromCard(row);
                if (!allowed(item)) return;
                const impactDate = getCardBudgetImpactDate(item, dueDayMap);
                if (!dateIsWithinCycle(impactDate, cycle)) return;
                rows.push({
                    ...item,
                    date: getFormattedDateOnly(impactDate) || item.date,
                    budgetImpactDate: impactDate,
                    budgetImpactDateLabel: getFormattedDateOnly(impactDate),
                    isToday: sameCalendarDay(impactDate, referenceDate)
                });
            });
        });
    }
    return applyFilters(rows, plan.filters || {});
}

function buildBudgetSummary(dataSources = {}, plan = {}) {
    const settings = budgetSettingsFromDataSources(dataSources, plan);
    if (!settings) {
        return {
            active: false,
            monthlyAmount: 0,
            cycleSpent: 0,
            todaySpent: 0,
            remainingInCycle: 0,
            remainingToday: 0,
            dailyRecommendedAmount: 0,
            daysRemaining: 0,
            scope: plan.filters?.scope || 'personal',
            cycleStartDay: 1,
            period: null,
            totals: { outputs: 0, cards: 0 },
            items: [],
            cycleItems: [],
            criteria: 'Orçamento mensal livre desativado.',
            explanation: 'Orçamento mensal livre desativado.'
        };
    }
    const referenceDate = parseReferenceDate(dataSources.currentDate || dataSources.today || dataSources.referenceDate);
    const cycleStartDay = normalizeCycleStartDay(settings.date || 1);
    const cycle = budgetCycleFromPlan(plan, cycleStartDay, referenceDate);
    const rows = getBudgetRows(dataSources, plan, cycle, referenceDate);
    const todayRows = rows.filter(item => item.isToday);
    const hasSpendingSources = Array.isArray(dataSources.saidas) || Array.isArray(dataSources.cartoes);
    const settingsItem = publicItem(settings);
    const cycleSpent = roundMoney(rows.reduce((sum, item) => sum + Number(item.value || 0), 0));
    const todaySpent = roundMoney(todayRows.reduce((sum, item) => sum + Number(item.value || 0), 0));
    const monthlyAmount = roundMoney(settings.value);
    const remainingInCycle = roundMoney(Math.max(0, monthlyAmount - cycleSpent));
    const daysRemaining = cycle.isCurrent ? Math.max(1, Number(cycle.daysRemaining || 1)) : 0;
    const spentBeforeToday = Math.max(0, cycleSpent - todaySpent);
    const budgetBeforeToday = Math.max(0, monthlyAmount - spentBeforeToday);
    const dailyRecommendedAmount = cycle.isCurrent ? roundMoney(budgetBeforeToday / daysRemaining) : 0;
    const remainingToday = roundMoney(Math.max(0, dailyRecommendedAmount - todaySpent));
    const totals = {
        outputs: roundMoney(rows.filter(item => item.sourceType === 'expense').reduce((sum, item) => sum + Number(item.value || 0), 0)),
        cards: roundMoney(rows.filter(item => item.sourceType === 'card').reduce((sum, item) => sum + Number(item.value || 0), 0))
    };
    const expectedByToday = cycle.isCurrent ? roundMoney(monthlyAmount - (dailyRecommendedAmount * daysRemaining) + dailyRecommendedAmount) : 0;
    return {
        active: true,
        total: monthlyAmount,
        monthlyAmount,
        cycleSpent,
        todaySpent,
        remainingInCycle,
        remainingToday,
        dailyRecommendedAmount,
        daysRemaining,
        daysInCycle: cycle.daysInCycle,
        expectedByToday,
        paceDifference: roundMoney(cycleSpent - expectedByToday),
        monthPercentUsed: monthlyAmount > 0 ? Math.round((cycleSpent / monthlyAmount) * 100) : 0,
        percentUsedToday: dailyRecommendedAmount > 0 ? Math.round((todaySpent / dailyRecommendedAmount) * 100) : 0,
        exceededToday: cycle.isCurrent && todaySpent > dailyRecommendedAmount,
        scope: plan.filters?.scope || settings.category || 'personal',
        cycleStartDay,
        period: { label: cycle.label, start: cycle.startLabel, end: cycle.endLabel },
        totals,
        excluded: { transfers: true, recurring: true, reserve: true, debts: true },
        criteria: 'Orçamento considera o ciclo configurado; saídas livres entram pela data do lançamento e cartões entram pelo vencimento/competência da parcela. Transferências, reserva/caixinha, dívidas e recorrentes não entram no gasto livre.',
        explanation: 'O cálculo usa gasto livre do ciclo de orçamento configurado. Entram saídas não recorrentes e parcelas de cartão cujo vencimento/competência cai no ciclo; ficam fora transferências internas, caixinha/reserva, dívidas e despesas recorrentes.',
        items: hasSpendingSources ? sortRows(todayRows, plan.sort).slice(0, plan.limit).map(publicItem) : [settingsItem],
        cycleItems: sortRows(rows, plan.sort).slice(0, plan.limit).map(publicItem),
        groups: {
            category: groupRows(rows, ['category']).slice(0, plan.limit),
            member: groupBudgetRowsByPublicMember(rows, plan.limit),
            source: groupRows(rows, ['source']).slice(0, plan.limit)
        }
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

    if (plan.domain === 'goals' && Array.isArray(dataSources.movimentacoesMetas)) {
        const headers = dataSources.movimentacoesMetas[0] || [];
        dataSources.movimentacoesMetas.slice(1).forEach((row) => {
            const item = toGoalMovement(row, headers);
            if (item.description && dateMatchesPeriod(item.date, period)) rows.push(item);
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
        const headers = dataSources.contas[0] || [];
        dataSources.contas.slice(1).forEach((row) => {
            const item = toBill(row, headers);
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
    const normalizedHaystack = normalizeText(haystack);
    return normalizedHaystack.includes(normalizedNeedle) ||
        matchesAnyField([normalizedHaystack], normalizedNeedle, { minWordLength: 3, wordThreshold: 0.66, phraseThreshold: 0.82 });
}

function cardMatchesFilter(item = {}, query = '') {
    const words = normalizeText(query || '')
        .split(/[^a-z0-9]+/i)
        .map(word => word.trim())
        .filter(word => word.length >= 3);
    if (words.length === 0) return true;
    const haystack = normalizeText(`${item.cardId || ''} ${item.card || ''}`);
    return words.every(word => haystack.includes(word));
}

function planStatusIsInstallment(status = '') {
    const normalized = normalizeText(status);
    return normalized.includes('installment') ||
        normalized.includes('parcel') ||
        normalized.includes('ativo') ||
        normalized.includes('aberto');
}

function transferCategoryMatches(item = {}, category = '') {
    const normalized = normalizeText(category || '');
    if (!normalized) return true;
    const canonical = new Set([
        'reserve_applied',
        'reserve_redeemed',
        'invoice_payment',
        'own_transfer',
        'family_transfer',
        'internal_transfer',
        'availability'
    ]);
    if (canonical.has(normalized)) return normalized === normalizeText(item.transferType || item.category || '');
    return normalized === normalizeText(item.transferType || '') ||
        containsFilter(`${item.category || ''} ${item.status || ''} ${item.description || ''} ${item.notes || ''}`, category);
}

function applyFilters(rows, filters = {}) {
    const period = periodFromPlan({ filters });
    const referenceDate = rows.find(item => item.currentDate)?.currentDate || new Date();
    return rows.filter((item) => {
        if (filters.goal && !containsFilter(item.description, filters.goal)) return false;
        if (filters.debt && !containsFilter(`${item.description} ${item.subcategory} ${item.category}`, filters.debt)) return false;
        if (filters.scope && ['goal', 'goal_movement'].includes(item.sourceType) && normalizeText(item.scope || '') !== normalizeText(filters.scope)) return false;
        if (filters.category) {
            if (item.sourceType === 'transfer') {
                if (!transferCategoryMatches(item, filters.category)) return false;
            } else if (!containsFilter(`${item.category} ${item.subcategory} ${item.description}`, filters.category)) return false;
        }
        if (Array.isArray(filters.categories) && filters.categories.length > 0) {
            const matchesCategory = filters.categories.some(category => containsFilter(`${item.category} ${item.subcategory} ${item.description}`, category));
            if (!matchesCategory) return false;
        }
        if (filters.subcategory && !containsFilter(`${item.subcategory} ${item.description}`, filters.subcategory)) return false;
        if (filters.merchant && !containsFilter(`${item.description} ${item.accountName || ''} ${normalizeMerchant(item.description)}`, filters.merchant)) return false;
        if (filters.paymentMethod && !containsFilter(item.paymentMethod, filters.paymentMethod)) return false;
        if (filters.card && !cardMatchesFilter(item, filters.card)) return false;
        if (filters.source && !containsFilter(`${item.source} ${item.sourceType}`, filters.source)) return false;
        if (filters.status && item.sourceType === 'debt' && !debtStatusMatches(item, filters.status, referenceDate, period)) return false;
        if (filters.status && item.sourceType === 'debt') return true;
        if (filters.status && planStatusIsInstallment(filters.status) && !item.isInstallment) return false;
        if (filters.status && !planStatusIsInstallment(filters.status) && !containsFilter(`${item.status || ''} ${item.category || ''} ${item.description || ''} ${item.notes || ''}`, filters.status)) return false;
        if (filters.recurrence && !containsFilter(`${item.recurrence || ''} ${item.status || ''}`, filters.recurrence)) return false;
        if (filters.member && !containsFilter(`${item.member || ''} ${item.userId || ''} ${item.to || ''} ${item.from || ''} ${item.description || ''}`, filters.member)) return false;
        if (filters.value?.min !== undefined && item.value < filters.value.min) return false;
        if (filters.value?.max !== undefined && item.value > filters.value.max) return false;
        if (filters.value?.equals !== undefined && Math.abs(item.value - filters.value.equals) > 0.005) return false;
        return true;
    });
}

function getGroupValue(item, groupBy, timeBasis = '') {
    const monthValue = (() => {
        const billing = timeBasis === 'transaction_date' ? null : parseBillingMonth(item.billingMonth);
        if (billing) return `${MONTH_NAMES[billing.month]} de ${billing.year}`;
        const date = parseSheetDate(item.date);
        if (date) return `${MONTH_NAMES[date.getMonth()]} de ${date.getFullYear()}`;
        return item.billingMonth || item.date;
    })();
    const map = {
        category: item.category,
        subcategory: item.subcategory,
        merchant: normalizeMerchant(item.description),
        paymentMethod: item.paymentMethod,
        card: item.card || item.cardId,
        member: item.userId,
        date: getFormattedDateOnly(parseSheetDate(item.date)) || item.date,
        month: monthValue,
        status: item.status,
        source: item.sourceType
    };
    return normalizeLabel(map[groupBy], 'Outros');
}

function groupRows(rows, groupBy = [], timeBasis = '') {
    const selected = groupBy.length > 0 ? groupBy : ['category'];
    const grouped = new Map();
    rows.forEach((item) => {
        const label = selected.map(key => getGroupValue(item, key, timeBasis)).join(' / ');
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

function sortMonthlyGroups(groups = []) {
    return [...groups].sort((a, b) => {
        const monthA = parseBillingMonth(a.label);
        const monthB = parseBillingMonth(b.label);
        const keyA = monthA ? monthA.year * 12 + monthA.month : Number.MAX_SAFE_INTEGER;
        const keyB = monthB ? monthB.year * 12 + monthB.month : Number.MAX_SAFE_INTEGER;
        return keyA - keyB || String(a.label).localeCompare(String(b.label), 'pt-BR');
    });
}

function sortRows(rows, sort = {}) {
    const by = sort.by || 'value';
    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
        if (by === 'date') {
            const diff = (parseSheetDate(a.date)?.getTime() || 0) - (parseSheetDate(b.date)?.getTime() || 0);
            return diff * direction;
        }
        if (by === 'due_date') {
            const dueA = parseSheetDate(a.date) || debtDueDate(a);
            const dueB = parseSheetDate(b.date) || debtDueDate(b);
            const diff = (dueA?.getTime() || Number.MAX_SAFE_INTEGER) - (dueB?.getTime() || Number.MAX_SAFE_INTEGER);
            return diff * direction;
        }
        if (by === 'interest') return (Number(a.interestRatePct || 0) - Number(b.interestRatePct || 0)) * direction;
        if (by === 'overdue') return (Number(a.overdueDays || 0) - Number(b.overdueDays || 0)) * direction;
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
    if (item.sourceType === 'debt') {
        output.originalValue = roundMoney(item.originalValue);
        output.paidAmount = roundMoney(item.paidAmount);
        output.progressPercent = roundMoney(item.progressPercent);
        output.installmentValue = roundMoney(item.installmentValue);
        output.interestRatePct = roundMoney(item.interestRatePct);
        output.dueDay = item.dueDay;
        output.nextDueDate = getFormattedDateOnly(debtDueDate(item)) || item.nextDueDate || '';
        output.overdueDays = Number(item.overdueDays || 0);
        output.payoffDate = item.payoffDate || '';
    }
    if (item.sourceType === 'transfer') {
        output.transferType = item.transferType;
        output.from = item.from;
        output.to = item.to;
    }
    if (item.totalPlanned !== undefined) output.totalPlanned = roundMoney(item.totalPlanned);
    if (item.remainingTotal !== undefined) output.remainingTotal = roundMoney(item.remainingTotal);
    if (item.installmentValue !== undefined) output.installmentValue = roundMoney(item.installmentValue);
    if (item.paidOrScheduledInstallments !== undefined) output.paidOrScheduledInstallments = item.paidOrScheduledInstallments;
    if (item.remainingInstallments !== undefined) output.remainingInstallments = item.remainingInstallments;
    if (item.firstPurchaseDate !== undefined) output.firstPurchaseDate = item.firstPurchaseDate;
    if (item.lastBillingMonth !== undefined) output.lastBillingMonth = item.lastBillingMonth;
    if (item.dueDay !== undefined) output.dueDay = item.dueDay;
    if (item.expectedValue !== undefined) output.expectedValue = roundMoney(item.expectedValue);
    if (item.realizedValue !== undefined) output.realizedValue = roundMoney(item.realizedValue);
    if (item.pendingValue !== undefined) output.pendingValue = roundMoney(item.pendingValue);
    if (item.ruleActive !== undefined) output.ruleActive = item.ruleActive;
    if (item.target !== undefined) output.target = roundMoney(item.target);
    if (item.current !== undefined) output.current = roundMoney(item.current);
    if (item.missing !== undefined) output.missing = roundMoney(item.missing);
    if (item.monthlyRequired !== undefined) output.monthlyRequired = roundMoney(item.monthlyRequired);
    if (item.active !== undefined) output.active = Boolean(item.active);
    if (item.scope !== undefined) output.scope = item.scope;
    if (item.progressPercent !== undefined) output.progressPercent = roundMoney(item.progressPercent);
    if (item.movementType !== undefined) output.movementType = item.movementType;
    if (item.valueBefore !== undefined) output.valueBefore = roundMoney(item.valueBefore);
    if (item.valueAfter !== undefined) output.valueAfter = roundMoney(item.valueAfter);
    if (item.responsible !== undefined) output.responsible = item.responsible;
    return output;
}

function cardPurchaseKey(item = {}) {
    return [
        normalizeText(item.description || ''),
        normalizeText(item.card || item.cardId || ''),
        normalizeText(item.category || ''),
        getFormattedDateOnly(parseSheetDate(item.date)) || normalizeText(item.date || ''),
        roundMoney(item.value || 0),
        Number(item.installmentTotal || 1)
    ].join('|');
}

function buildInstallmentPurchaseSummaries(rows = [], plan = {}) {
    const grouped = new Map();
    rows.forEach((item) => {
        if (!item.isInstallment) return;
        const key = cardPurchaseKey(item);
        const existing = grouped.get(key) || {
            date: item.date,
            description: item.description || 'sem descrição',
            category: item.category || 'Cartão',
            subcategory: item.subcategory || 'Cartão de Crédito',
            value: 0,
            source: item.source,
            sourceType: 'card',
            paymentMethod: item.paymentMethod,
            card: item.card || item.cardId || '',
            cardId: item.cardId || '',
            installment: item.installment || '',
            billingMonth: item.billingMonth || '',
            installmentValue: Number(item.value || 0),
            paidOrScheduledInstallments: 0,
            remainingInstallments: 0,
            totalPlanned: 0,
            remainingTotal: 0,
            firstPurchaseDate: item.date || '',
            lastBillingMonth: item.billingMonth || ''
        };
        existing.paidOrScheduledInstallments += 1;
        existing.installmentValue = Number(item.value || existing.installmentValue || 0);
        existing.totalPlanned = Math.max(existing.totalPlanned, Number(item.value || 0) * Number(item.installmentTotal || 1));
        existing.remainingInstallments = Math.max(0, Number(item.installmentTotal || 1) - existing.paidOrScheduledInstallments);
        existing.remainingTotal = existing.remainingInstallments * existing.installmentValue;
        existing.value = existing.totalPlanned;
        if (parseSheetDate(item.date) && (!parseSheetDate(existing.firstPurchaseDate) || parseSheetDate(item.date) < parseSheetDate(existing.firstPurchaseDate))) {
            existing.firstPurchaseDate = item.date;
        }
        if (item.billingMonth) existing.lastBillingMonth = item.billingMonth;
        grouped.set(key, existing);
    });
    return Array.from(grouped.values())
        .filter(item => item.paidOrScheduledInstallments > 0)
        .sort((a, b) => {
            const direction = plan.sort?.direction === 'asc' ? 1 : -1;
            return (Number(a.totalPlanned || 0) - Number(b.totalPlanned || 0)) * direction;
        })
        .slice(0, plan.limit)
        .map(publicItem);
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
    const goalRows = rows.filter(item => item.sourceType === 'goal');
    const activeRows = goalRows.filter(item => item.active);
    const totals = goalRows.reduce((acc, item) => {
        acc.target += Number(item.target || 0);
        acc.current += Number(item.current || 0);
        return acc;
    }, { target: 0, current: 0, missing: 0, monthlyRequired: 0 });
    activeRows.forEach((item) => {
        totals.missing += Number(item.missing || 0);
        totals.monthlyRequired += Number(item.monthlyRequired || 0);
    });
    return {
        totals: {
            target: roundMoney(totals.target),
            current: roundMoney(totals.current),
            missing: roundMoney(totals.missing),
            monthlyRequired: roundMoney(totals.monthlyRequired)
        },
        count: goalRows.length,
        activeCount: activeRows.length,
        items: goalRows.map(publicItem),
        criteria: 'Valor atual e status vêm de Metas. Movimentações Metas é usada como trilha auditável; os dois valores não são somados. Faltante considera somente metas ativas.'
    };
}

function goalMovementMatchesSource(item, source = '') {
    const normalized = normalizeText(source);
    if (!normalized || normalized === 'movements') return item.sourceType === 'goal_movement';
    const type = normalizeText(item.movementType || item.status || '');
    if (normalized === 'contributions') return item.sourceType === 'goal_movement' && type.includes('aporte');
    if (normalized === 'withdrawals') return item.sourceType === 'goal_movement' && type.includes('retirada');
    return containsFilter(`${item.source} ${item.sourceType} ${item.movementType}`, source);
}

function executeGoalsQuery(plan, dataSources = {}) {
    const allRows = getRowsForDomain(dataSources, plan);
    const goalScopeByOwnerAndName = new Map(
        allRows
            .filter(item => item.sourceType === 'goal')
            .map(item => [`${String(item.userId || '')}|${normalizeText(item.description)}`, item.scope || 'personal'])
    );
    allRows
        .filter(item => item.sourceType === 'goal_movement')
        .forEach((item) => {
            item.scope = goalScopeByOwnerAndName.get(`${String(item.userId || '')}|${normalizeText(item.description)}`) || 'personal';
        });
    const source = plan.filters?.source || '';
    const wantsMovements = Boolean(source);
    const selectedRows = wantsMovements
        ? allRows.filter(item => goalMovementMatchesSource(item, source))
        : allRows.filter(item => item.sourceType === 'goal');
    const rows = applyFilters(selectedRows, { ...plan.filters, source: undefined });
    const total = roundMoney(rows.reduce((sum, item) => sum + Number(item.value || 0), 0));
    const details = {
        domain: 'goals',
        operation: plan.operation,
        count: rows.length,
        total,
        timeBasis: plan.timeBasis,
        filters: plan.filters,
        criteria: wantsMovements
            ? 'Movimentações Metas fornece a trilha auditável e os totais de aporte/retirada.'
            : 'Valor atual e status vêm de Metas; movimentações não são somadas novamente.'
    };

    if (plan.operation === 'list') {
        const sort = wantsMovements ? { by: 'date', direction: 'desc' } : plan.sort;
        return { ok: true, plan, result: { value: sortRows(rows, sort).slice(0, plan.limit).map(publicItem), details } };
    }
    if (plan.operation === 'sum') return { ok: true, plan, result: { value: total, details } };
    if (plan.operation === 'count') return { ok: true, plan, result: { value: rows.length, details } };
    if (plan.operation === 'average') {
        const value = rows.length > 0
            ? (wantsMovements ? total / rows.length : rows.reduce((sum, item) => sum + Number(item.progressPercent || 0), 0) / rows.length)
            : 0;
        return { ok: true, plan, result: { value: roundMoney(value), details } };
    }
    if (plan.operation === 'percentage') {
        const allGoals = applyFilters(allRows.filter(item => item.sourceType === 'goal'), {
            scope: plan.filters?.scope,
            member: plan.filters?.member
        });
        const denominator = roundMoney(allGoals.reduce((sum, item) => sum + Number(item.current || 0), 0));
        return { ok: true, plan, result: { value: { percent: denominator > 0 ? roundMoney((total / denominator) * 100) : 0, part: total, total: denominator }, details: { ...details, denominator } } };
    }
    if (plan.operation === 'compare') {
        const sorted = [...rows].sort((a, b) => Number(b.current || b.value || 0) - Number(a.current || a.value || 0));
        return { ok: true, plan, result: { value: { items: sorted.slice(0, plan.limit).map(publicItem) }, details } };
    }
    if (plan.operation === 'rank' && plan.groupBy.length === 0 && !wantsMovements) {
        const ranked = [...rows]
            .sort((a, b) => Number(b.progressPercent || 0) - Number(a.progressPercent || 0) || Number(b.current || 0) - Number(a.current || 0))
            .slice(0, plan.limit)
            .map(publicItem);
        return { ok: true, plan, result: { value: ranked, details: { ...details, rankingCriterion: 'progressPercent' } } };
    }
    if (['group', 'rank'].includes(plan.operation)) {
        return { ok: true, plan, result: { value: groupRows(rows, plan.groupBy.length > 0 ? plan.groupBy : ['status']).slice(0, plan.limit), details: { ...details, groupBy: plan.groupBy } } };
    }
    if (plan.operation === 'detail' || plan.operation === 'explain') {
        const summary = buildGoalsDetail(rows);
        const names = new Set(rows.filter(item => item.sourceType === 'goal').map(item => normalizeText(item.description)));
        const movements = allRows
            .filter(item => item.sourceType === 'goal_movement' && (names.size === 0 || names.has(normalizeText(item.description))))
            .map(publicItem);
        return {
            ok: true,
            plan,
            result: {
                value: {
                    ...summary,
                    movements: movements.slice(0, plan.limit),
                    movementTotals: {
                        contributions: roundMoney(movements.filter(item => normalizeText(item.movementType).includes('aporte')).reduce((sum, item) => sum + Number(item.value || 0), 0)),
                        withdrawals: roundMoney(movements.filter(item => normalizeText(item.movementType).includes('retirada')).reduce((sum, item) => sum + Number(item.value || 0), 0))
                    }
                },
                details
            }
        };
    }
    return null;
}

function filterDebtsByPlan(rows = [], plan = {}, dataSources = {}) {
    const referenceDate = currentDateFromDataSources(dataSources);
    const period = periodFromPlan(plan);
    const allowedUserIds = new Set((dataSources.scopeUserIds || []).map(id => String(id || '').trim()).filter(Boolean));
    return rows.filter((item) => {
        if (allowedUserIds.size > 0 && item.userId && !allowedUserIds.has(String(item.userId || '').trim())) return false;
        if (plan.filters?.debt && !containsFilter(`${item.description} ${item.subcategory} ${item.category}`, plan.filters.debt)) return false;
        if (plan.filters?.category && !containsFilter(`${item.category} ${item.subcategory} ${item.description}`, plan.filters.category)) return false;
        if (plan.filters?.merchant && !containsFilter(`${item.description} ${item.subcategory}`, plan.filters.merchant)) return false;
        if (plan.filters?.status && !debtStatusMatches(item, plan.filters.status, referenceDate, period)) return false;
        if (!plan.filters?.status && ['sum', 'rank', 'recommend', 'average', 'percentage'].includes(plan.operation) && !debtIsActive(item)) return false;
        if (plan.filters?.period && plan.operation !== 'recommend') {
            const due = debtDueDate(item, referenceDate);
            if (!due) return false;
            if (period.month !== null && due.getMonth() !== period.month) return false;
            if (period.year !== null && due.getFullYear() !== period.year) return false;
            if (period.from) {
                const from = parseSheetDate(period.from);
                if (from && due < from) return false;
            }
            if (period.to) {
                const to = parseSheetDate(period.to);
                if (to && due > to) return false;
            }
        }
        return true;
    });
}

function buildDebtsDetail(rows = [], allRows = [], dataSources = {}) {
    const referenceDate = currentDateFromDataSources(dataSources);
    const activeRows = allRows.filter(debtIsActive);
    const paidRows = allRows.filter(debtIsPaid);
    const overdueRows = activeRows.filter(item => debtIsOverdue(item, referenceDate));
    const upcomingRows = activeRows.filter(item => {
        const due = debtDueDate(item, referenceDate);
        return due && due >= referenceDate && due <= addDays(referenceDate, 7);
    });
    const totals = activeRows.reduce((acc, item) => {
        acc.balance += Number(item.value || 0);
        acc.original += Number(item.originalValue || 0);
        acc.installments += Number(item.installmentValue || 0);
        return acc;
    }, { balance: 0, original: 0, paid: 0, installments: 0 });
    totals.paid = allRows.reduce((sum, item) => sum + Number(item.paidAmount || 0), 0);
    return {
        totalBalance: roundMoney(totals.balance),
        originalTotal: roundMoney(totals.original),
        paidAmount: roundMoney(totals.paid),
        installmentTotal: roundMoney(totals.installments),
        count: rows.length,
        activeCount: activeRows.length,
        paidCount: paidRows.length,
        overdueCount: overdueRows.length,
        upcomingCount: upcomingRows.length,
        items: sortRows(rows, { by: 'value', direction: 'desc' }).map(publicItem),
        criteria: 'Saldo atual vem da aba Dívidas. Pagamentos registrados são inferidos como Valor Original menos Saldo Atual. Vencimentos usam Próximo Vencimento quando preenchido; caso contrário, usam o dia de vencimento cadastrado.',
        historyGap: 'Não há trilha individual de pagamentos na aba atual; este pacote não altera schema real.'
    };
}

function buildDebtRecommendation(rows = [], dataSources = {}) {
    const referenceDate = currentDateFromDataSources(dataSources);
    const candidates = rows.filter(debtIsActive);
    const ranked = candidates
        .sort((a, b) => {
            const overdueDiff = Number(debtIsOverdue(b, referenceDate)) - Number(debtIsOverdue(a, referenceDate));
            if (overdueDiff) return overdueDiff;
            const interestDiff = Number(b.interestRatePct || 0) - Number(a.interestRatePct || 0);
            if (interestDiff) return interestDiff;
            const dueDiff = (debtDueDate(a, referenceDate)?.getTime() || Number.MAX_SAFE_INTEGER) - (debtDueDate(b, referenceDate)?.getTime() || Number.MAX_SAFE_INTEGER);
            if (dueDiff) return dueDiff;
            return Number(b.value || 0) - Number(a.value || 0);
        });
    const item = ranked[0] ? publicItem(ranked[0]) : null;
    return {
        item,
        criteria: item
            ? 'Critério read-only: priorizei dívidas ativas com atraso, depois maior juros, vencimento mais próximo e maior saldo.'
            : 'Critério read-only: não encontrei dívida ativa para priorizar.',
        disclaimer: 'Isso não é garantia financeira nem recomendação absoluta; é uma ordenação objetiva pelos dados cadastrados.',
        ranking: ranked.slice(0, 10).map(publicItem)
    };
}

function billPeriodBounds(plan = {}, dataSources = {}) {
    const reference = currentDateFromDataSources(dataSources);
    const period = plan.filters?.period || {};
    const atNoon = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
    if (period.from || period.to) {
        const from = parseSheetDate(period.from) || atNoon(reference);
        const to = parseSheetDate(period.to) || from;
        return { from: atNoon(from), to: atNoon(to), reference: atNoon(reference) };
    }
    if (Number.isInteger(period.month) && Number.isInteger(period.year)) {
        return {
            from: new Date(period.year, period.month, 1, 12, 0, 0, 0),
            to: endOfMonth(new Date(period.year, period.month, 1, 12, 0, 0, 0)),
            reference: atNoon(reference)
        };
    }
    if (period.type === 'relative') {
        const days = Math.max(1, Number(period.days || 7));
        const start = period.label === 'tomorrow' ? addDays(reference, 1) : atNoon(reference);
        return { from: start, to: addDays(start, days - 1), reference: atNoon(reference) };
    }
    if (period.type === 'today') {
        const today = atNoon(reference);
        return { from: today, to: today, reference: today };
    }
    return {
        from: new Date(reference.getFullYear(), reference.getMonth(), 1, 12, 0, 0, 0),
        to: endOfMonth(reference),
        reference: atNoon(reference)
    };
}

function monthsBetween(from, to) {
    const months = [];
    let cursor = new Date(from.getFullYear(), from.getMonth(), 1, 12, 0, 0, 0);
    const endKey = to.getFullYear() * 12 + to.getMonth();
    while ((cursor.getFullYear() * 12 + cursor.getMonth()) <= endKey) {
        months.push({ year: cursor.getFullYear(), month: cursor.getMonth() });
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1, 12, 0, 0, 0);
    }
    return months;
}

function billPaymentScore(bill, expense, { allowFamilyPayment = false } = {}) {
    const sameOwner = String(bill.userId || '') === String(expense.userId || '');
    if (!sameOwner && !allowFamilyPayment) return 0;
    const billText = normalizeText(`${bill.description} ${bill.accountName}`);
    const expenseText = normalizeText(expense.description);
    let score = 0;
    const directTextMatch = Boolean(
        billText.length >= 3 &&
        expenseText.length >= 3 &&
        (billText.includes(expenseText) || expenseText.includes(billText))
    );
    const fuzzyTextMatch = expenseText.length >= 3 && matchesAnyField(
        [bill.description, bill.accountName],
        expense.description,
        { minWordLength: 3, wordThreshold: 0.66, phraseThreshold: 0.72 }
    );
    const sameSubcategory = Boolean(bill.subcategory) &&
        normalizeText(bill.subcategory) === normalizeText(expense.subcategory);
    const sameCategory = Boolean(bill.category) &&
        normalizeText(bill.category) === normalizeText(expense.category);
    const expectedValue = Number(bill.expectedValue || 0);
    const expenseValue = Number(expense.value || 0);
    const amountTolerance = Math.max(5, expectedValue * 0.25);
    const compatibleAmount = expectedValue > 0 && Math.abs(expectedValue - expenseValue) <= amountTolerance;
    if (!directTextMatch && !fuzzyTextMatch && !(sameCategory && sameSubcategory && compatibleAmount)) return 0;

    if (directTextMatch) score += 6;
    else if (fuzzyTextMatch) score += 4;
    if (sameSubcategory) score += 2;
    if (sameCategory) score += 1;
    if (compatibleAmount) score += 2;
    if (sameOwner) score += 1;
    return score;
}

function materializeBills(plan = {}, dataSources = {}) {
    const bounds = billPeriodBounds(plan, dataSources);
    const scopeUserIds = new Set((dataSources.scopeUserIds || []).map(value => String(value || '')));
    const allowFamilyPayment = normalizeText(plan.filters?.scope || '') === 'family' && scopeUserIds.size > 1;
    const billHeaders = dataSources.contas?.[0] || [];
    const bills = (dataSources.contas || [])
        .slice(1)
        .map(row => toBill(row, billHeaders))
        .filter(item => item.description && item.dueDay)
        .filter(item => scopeUserIds.size === 0 || scopeUserIds.has(String(item.userId || '')));
    const expenses = (dataSources.saidas || [])
        .slice(1)
        .map(toExpenseFromOutput)
        .filter(item => scopeUserIds.size === 0 || scopeUserIds.has(String(item.userId || '')));
    const occurrences = [];

    monthsBetween(bounds.from, bounds.to).forEach(({ year, month }) => {
        bills.forEach((bill) => {
            const dueDate = buildRecurringDueDate(year, month, bill.dueDay);
            if (!dueDate || dueDate < bounds.from || dueDate > bounds.to) return;
            const expectedValue = roundMoney(bill.expectedValue || 0);
            occurrences.push({
                ...bill,
                date: getFormattedDateOnly(dueDate),
                value: expectedValue,
                expectedValue,
                realizedValue: 0,
                pendingValue: expectedValue,
                status: 'pending',
                currentDate: bounds.reference
            });
        });
    });

    expenses.forEach((expense) => {
        const expenseDate = parseSheetDate(expense.date);
        if (!expenseDate) return;
        const candidates = occurrences
            .map((occurrence, index) => ({
                occurrence,
                index,
                dueDate: parseSheetDate(occurrence.date),
                score: billPaymentScore(occurrence, expense, { allowFamilyPayment })
            }))
            .filter(candidate => candidate.dueDate &&
                candidate.dueDate.getFullYear() === expenseDate.getFullYear() &&
                candidate.dueDate.getMonth() === expenseDate.getMonth())
            .filter(candidate => candidate.score >= 4)
            .sort((a, b) => b.score - a.score || Math.abs(a.dueDate - expenseDate) - Math.abs(b.dueDate - expenseDate));
        if (candidates[0]) {
            const occurrence = occurrences[candidates[0].index];
            occurrence.realizedValue = roundMoney(occurrence.realizedValue + Number(expense.value || 0));
        }
    });
    occurrences.forEach((occurrence) => {
        occurrence.pendingValue = roundMoney(Math.max(0, occurrence.expectedValue - occurrence.realizedValue));
        occurrence.status = occurrence.expectedValue > 0
            ? (occurrence.pendingValue === 0 ? 'paid' : 'pending')
            : (occurrence.realizedValue > 0 ? 'paid' : 'pending');
    });
    return { occurrences, bounds };
}

function executeBillsQuery(plan, dataSources = {}) {
    const hasPeriod = Boolean(plan.filters?.period && Object.keys(plan.filters.period).length > 0);
    const definitionStatus = normalizeText(plan.filters?.status || '');
    if (plan.operation === 'list' && !hasPeriod && !/(upcoming|vence|vencendo|pending|pendente|paid|paga|pago)/.test(definitionStatus)) {
        const scopeUserIds = new Set((dataSources.scopeUserIds || []).map(value => String(value || '')));
        let definitions = getRowsForDomain(dataSources, plan)
            .filter(item => scopeUserIds.size === 0 || scopeUserIds.has(String(item.userId || '')));
        if (definitionStatus) {
            definitions = definitions.filter(item => containsFilter(item.ruleActive || item.status, definitionStatus));
        }
        const items = [...definitions]
            .sort((a, b) => Number(a.dueDay || 99) - Number(b.dueDay || 99) || String(a.description).localeCompare(String(b.description), 'pt-BR'))
            .slice(0, plan.limit)
            .map(publicItem);
        const expected = roundMoney(definitions.reduce((sum, item) => sum + Number(item.expectedValue || 0), 0));
        const criteria = 'Critério: cadastro de Contas recorrentes; Regra Ativa indica classificação automática e não confirmação de pagamento.';
        return {
            ok: true,
            plan,
            result: {
                value: items,
                details: {
                    domain: 'bills',
                    operation: plan.operation,
                    count: definitions.length,
                    total: expected,
                    timeBasis: 'due_date',
                    filters: plan.filters,
                    criteria,
                    rulesActive: definitions.filter(item => normalizeText(item.ruleActive) === 'sim').length
                }
            }
        };
    }
    const { occurrences, bounds } = materializeBills(plan, dataSources);
    const status = normalizeText(plan.filters?.status || '');
    const filtered = occurrences.filter((item) => {
        if (!status) return true;
        if (status.includes('paid') || status.includes('paga') || status.includes('pago')) return item.status === 'paid';
        if (status.includes('pending') || status.includes('pendente')) return item.status === 'pending';
        if (status.includes('upcoming') || status.includes('vence') || status.includes('vencendo')) return parseSheetDate(item.date) >= bounds.reference;
        return containsFilter(item.status, status);
    });
    const selected = applyFilters(filtered, { ...plan.filters, period: undefined, status: undefined });
    const totals = {
        expected: roundMoney(selected.reduce((sum, item) => sum + item.expectedValue, 0)),
        realized: roundMoney(selected.reduce((sum, item) => sum + item.realizedValue, 0)),
        pending: roundMoney(selected.reduce((sum, item) => sum + item.pendingValue, 0))
    };
    const items = sortRows(selected, plan.sort).slice(0, plan.limit).map(publicItem);
    const summary = {
        totals,
        count: selected.length,
        paidCount: selected.filter(item => item.status === 'paid').length,
        pendingCount: selected.filter(item => item.status === 'pending').length,
        items,
        criteria: 'Critério: data de vencimento recorrente registrada, ajustada para o último dia válido em meses curtos. Realizado associa Saídas do mesmo mês e usuário por descrição, categoria e subcategoria; eventos do Calendar não entram.'
    };
    const details = {
        domain: 'bills',
        operation: plan.operation,
        count: selected.length,
        total: totals.expected,
        timeBasis: 'due_date',
        filters: plan.filters,
        criteria: summary.criteria,
        totals
    };
    if (plan.operation === 'list') return { ok: true, plan, result: { value: items, details: { ...details, ...summary } } };
    if (plan.operation === 'sum') return { ok: true, plan, result: { value: totals.expected, details: { ...details, ...summary } } };
    if (plan.operation === 'count') return { ok: true, plan, result: { value: selected.length, details: { ...details, ...summary } } };
    if (['compare', 'detail', 'explain', 'detect'].includes(plan.operation)) {
        return { ok: true, plan, result: { value: summary, details: { ...details, ...summary } } };
    }
    if (['group', 'rank'].includes(plan.operation)) {
        return { ok: true, plan, result: { value: groupRows(selected, plan.groupBy, 'due_date').slice(0, plan.limit), details } };
    }
    if (plan.operation === 'trend') {
        return { ok: true, plan, result: { value: sortMonthlyGroups(groupRows(selected, ['month'], 'due_date')).slice(0, plan.limit), details: { ...details, groupBy: ['month'] } } };
    }
    return null;
}

function executeDebtsQuery(plan, dataSources = {}) {
    const allRows = getRowsForDomain(dataSources, { ...plan, filters: { ...plan.filters, period: undefined } });
    const visibleRows = filterDebtsByPlan(allRows, { ...plan, operation: 'list', filters: {} }, dataSources);
    const rows = filterDebtsByPlan(allRows, plan, dataSources);
    const activeRows = rows.filter(debtIsActive);
    const total = roundMoney(activeRows.reduce((sum, item) => sum + Number(item.value || 0), 0));
    const detail = buildDebtsDetail(rows, visibleRows, dataSources);
    const details = {
        domain: 'debts',
        operation: plan.operation,
        count: rows.length,
        total,
        timeBasis: plan.timeBasis,
        filters: plan.filters,
        activeCount: detail.activeCount,
        paidCount: detail.paidCount,
        overdueCount: detail.overdueCount,
        paidAmount: detail.paidAmount,
        criteria: detail.criteria
    };

    if (plan.operation === 'sum') return { ok: true, plan, result: { value: total, details } };
    if (plan.operation === 'count') return { ok: true, plan, result: { value: rows.length, details } };
    if (plan.operation === 'list') {
        const sort = plan.filters?.status === 'paid' ? { by: 'name', direction: 'asc' } : (plan.sort || { by: 'due_date', direction: 'asc' });
        return { ok: true, plan, result: { value: sortRows(rows, sort).slice(0, plan.limit).map(publicItem), details } };
    }
    if (plan.operation === 'rank') {
        return { ok: true, plan, result: { value: sortRows(activeRows, plan.sort).slice(0, plan.limit).map(publicItem), details: { ...details, rankingCriterion: plan.sort?.by || 'value' } } };
    }
    if (plan.operation === 'average') {
        const avg = activeRows.length ? total / activeRows.length : 0;
        return { ok: true, plan, result: { value: roundMoney(avg), details } };
    }
    if (plan.operation === 'percentage') {
        const part = total;
        const denominator = roundMoney(visibleRows.filter(debtIsActive).reduce((sum, item) => sum + Number(item.value || 0), 0));
        return { ok: true, plan, result: { value: { percent: denominator > 0 ? roundMoney((part / denominator) * 100) : 0, part, total: denominator }, details: { ...details, denominator } } };
    }
    if (plan.operation === 'detect') {
        return { ok: true, plan, result: { value: detail, details: { ...details, ...detail } } };
    }
    if (plan.operation === 'extreme') {
        const sorted = sortRows(activeRows, { by: 'value', direction: 'asc' });
        return { ok: true, plan, result: { value: { min: sorted[0] ? publicItem(sorted[0]) : null, max: sorted[sorted.length - 1] ? publicItem(sorted[sorted.length - 1]) : null }, details } };
    }
    if (plan.operation === 'explain' || plan.operation === 'detail') {
        return { ok: true, plan, result: { value: detail, details: { ...details, ...detail } } };
    }
    if (plan.operation === 'forecast') {
        const recommendation = buildDebtRecommendation(rows, dataSources);
        return { ok: true, plan, result: { value: recommendation, details: { ...details, criteria: recommendation.criteria } } };
    }
    if (plan.operation === 'trend') {
        return { ok: true, plan, result: { value: sortMonthlyGroups(groupRows(rows, ['month'], 'transaction_date')).slice(0, plan.limit), details: { ...details, groupBy: ['month'] } } };
    }
    if (plan.operation === 'recommend') {
        const recommendation = buildDebtRecommendation(rows, dataSources);
        return { ok: true, plan, result: { value: recommendation, details: { ...details, criteria: recommendation.criteria } } };
    }
    return null;
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

function buildTransferAvailabilitySummary(dataSources = {}, plan = {}) {
    const filters = { period: plan.filters?.period };
    const income = applyFilters(getRowsForDomain(dataSources, { domain: 'income', filters }), filters)
        .reduce((sum, item) => sum + Number(item.value || 0), 0);
    const expenses = applyFilters(getRowsForDomain(dataSources, { domain: 'expenses', filters, timeBasis: 'billing_month' }), filters)
        .reduce((sum, item) => sum + Number(item.value || 0), 0);
    const transfers = applyFilters(getRowsForDomain(dataSources, { domain: 'transfers', filters }), { period: plan.filters?.period });
    const reserveApplied = transfers
        .filter(item => item.transferType === 'reserve_applied')
        .reduce((sum, item) => sum + Number(item.value || 0), 0);
    const reserveRedeemed = transfers
        .filter(item => item.transferType === 'reserve_redeemed')
        .reduce((sum, item) => sum + Number(item.value || 0), 0);
    const invoicePayments = transfers
        .filter(item => item.transferType === 'invoice_payment')
        .reduce((sum, item) => sum + Number(item.value || 0), 0);
    const internalTransfers = transfers
        .filter(item => ['internal_transfer', 'own_transfer', 'family_transfer'].includes(item.transferType))
        .reduce((sum, item) => sum + Number(item.value || 0), 0);
    const reserveNet = reserveApplied - reserveRedeemed;
    const balance = income - expenses;
    return {
        income: roundMoney(income),
        spending: roundMoney(expenses),
        balance: roundMoney(balance),
        reserveApplied: roundMoney(reserveApplied),
        reserveRedeemed: roundMoney(reserveRedeemed),
        reserveNet: roundMoney(reserveNet),
        invoicePayments: roundMoney(invoicePayments),
        internalTransfers: roundMoney(internalTransfers),
        availableEstimate: roundMoney(balance - reserveNet),
        explanation: 'Saldo econômico considera entradas menos gastos. Disponível estimado subtrai o valor líquido aplicado em reserva/caixinha; pagamento de fatura e transferências internas não viram gasto duplicado.'
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

    if (plan.domain === 'budget') {
        const summary = buildBudgetSummary(dataSources, plan);
        const budgetDetails = {
            domain: plan.domain,
            operation: plan.operation,
            count: Array.isArray(summary.cycleItems) ? summary.cycleItems.length : 0,
            total: summary.cycleSpent,
            timeBasis: plan.timeBasis,
            filters: plan.filters
        };
        if (['sum', 'forecast', 'recommend', 'detail', 'explain'].includes(plan.operation)) {
            return { ok: true, plan, result: { value: summary, details: budgetDetails } };
        }
        if (['group', 'rank'].includes(plan.operation)) {
            return { ok: true, plan, result: { value: summary.groups?.category || [], details: budgetDetails } };
        }
    }

    if (plan.domain === 'goals') {
        const goalResult = executeGoalsQuery(plan, dataSources);
        if (goalResult) return goalResult;
    }

    if (plan.domain === 'debts') {
        const debtResult = executeDebtsQuery(plan, dataSources);
        if (debtResult) return debtResult;
    }

    if (plan.domain === 'bills') {
        const billResult = executeBillsQuery(plan, dataSources);
        if (billResult) return billResult;
    }

    const isOpenCardRanking = plan.domain === 'cards' &&
        plan.operation === 'rank' &&
        Array.isArray(plan.groupBy) &&
        plan.groupBy.includes('card') &&
        !plan.filters?.category &&
        !plan.filters?.merchant;
    const sourceRows = (plan.operation === 'forecast' || isOpenCardRanking)
        ? getRowsForForecast(dataSources, plan)
        : getRowsForDomain(dataSources, plan);
    const rows = applyFilters(sourceRows, plan.filters);
    const total = roundMoney(rows.reduce((sum, item) => sum + Number(item.value || 0), 0));
    const totals = {
        outputs: roundMoney(rows
            .filter(item => item.sourceType === 'expense')
            .reduce((sum, item) => sum + Number(item.value || 0), 0)),
        cards: roundMoney(rows
            .filter(item => item.sourceType === 'card')
            .reduce((sum, item) => sum + Number(item.value || 0), 0))
    };
    const baseDetails = {
        domain: plan.domain,
        operation: plan.operation,
        count: rows.length,
        total,
        totals,
        timeBasis: plan.timeBasis,
        filters: plan.filters
    };

    if (plan.operation === 'sum') {
        if (plan.domain === 'transfers' && plan.filters?.category === 'reserve_net') {
            const { category, ...netFilters } = plan.filters;
            const netPlan = { ...plan, filters: netFilters };
            const netRows = applyFilters(getRowsForDomain(dataSources, netPlan), netFilters);
            const applied = netRows
                .filter(item => item.transferType === 'reserve_applied')
                .reduce((sum, item) => sum + Number(item.value || 0), 0);
            const redeemed = netRows
                .filter(item => item.transferType === 'reserve_redeemed')
                .reduce((sum, item) => sum + Number(item.value || 0), 0);
            const reserveNet = roundMoney(applied - redeemed);
            return {
                ok: true,
                plan,
                result: {
                    value: reserveNet,
                    details: {
                        ...baseDetails,
                        count: netRows.length,
                        total: reserveNet,
                        reserveApplied: roundMoney(applied),
                        reserveRedeemed: roundMoney(redeemed)
                    }
                }
            };
        }
        return { ok: true, plan, result: { value: total, details: baseDetails } };
    }
    if (plan.operation === 'count') {
        return { ok: true, plan, result: { value: rows.length, details: baseDetails } };
    }
    if (plan.operation === 'list') {
        if (plan.domain === 'cards' && planStatusIsInstallment(plan.filters?.status || '')) {
            const fullPlan = { ...plan, filters: { ...plan.filters, period: undefined } };
            const fullRows = applyFilters(getRowsForDomain(dataSources, fullPlan), fullPlan.filters);
            return { ok: true, plan, result: { value: buildInstallmentPurchaseSummaries(fullRows, plan), details: { ...baseDetails, count: fullRows.length } } };
        }
        return { ok: true, plan, result: { value: sortRows(rows, plan.sort).slice(0, plan.limit).map(publicItem), details: baseDetails } };
    }
    if (plan.operation === 'average') {
        if (plan.domain === 'expenses' && Array.isArray(plan.groupBy) && plan.groupBy.includes('date')) {
            const period = periodFromPlan(plan);
            const days = daysConsideredForAverage(period, dataSources.currentDate || '');
            const average = days > 0 ? total / days : 0;
            return {
                ok: true,
                plan,
                result: {
                    value: {
                        average: roundMoney(average),
                        total,
                        daysConsidered: days,
                        count: rows.length
                    },
                    details: { ...baseDetails, total, daysConsidered: days, average: roundMoney(average) }
                }
            };
        }
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
        if (plan.domain === 'cards' && planStatusIsInstallment(plan.filters?.status || '')) {
            const purchases = buildInstallmentPurchaseSummaries(rows, { ...plan, limit: Number.MAX_SAFE_INTEGER })
                .sort((a, b) => Number(a.totalPlanned || 0) - Number(b.totalPlanned || 0));
            return {
                ok: true,
                plan,
                result: {
                    value: {
                        min: purchases[0] || null,
                        max: purchases[purchases.length - 1] || null
                    },
                    details: { ...baseDetails, count: purchases.length }
                }
            };
        }
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
            const groups = groupRows(rows, plan.groupBy.length > 0 ? plan.groupBy : ['category'], plan.timeBasis).slice(0, plan.limit);
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
        const groups = groupRows(rows, plan.groupBy, plan.timeBasis).slice(0, plan.limit);
        return { ok: true, plan, result: { value: groups, details: { ...baseDetails, groupBy: plan.groupBy } } };
    }
    if (plan.operation === 'detail' || plan.operation === 'explain') {
        if (plan.domain === 'transfers' && plan.filters?.category === 'availability') {
            const summary = buildTransferAvailabilitySummary(dataSources, plan);
            return {
                ok: true,
                plan,
                result: { value: summary, details: { ...baseDetails, ...summary } }
            };
        }
        if (plan.domain === 'transfers' && plan.filters?.category === 'family_transfer') {
            return {
                ok: true,
                plan,
                result: {
                    value: {
                        total,
                        isExpense: false,
                        explanation: 'Transferência familiar autorizada é movimento interno/familiar, não gasto de consumo.'
                    },
                    details: baseDetails
                }
            };
        }
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
        const groups = plan.groupBy.length > 0
            ? (plan.groupBy.includes('month') ? sortMonthlyGroups(groupRows(rows, plan.groupBy, plan.timeBasis)) : groupRows(rows, plan.groupBy, plan.timeBasis)).slice(0, plan.limit)
            : [];
        return { ok: true, plan, result: { value: { total, groups, items: sortRows(rows, plan.sort).slice(0, plan.limit).map(publicItem) }, details: baseDetails } };
    }
    if (plan.operation === 'search') {
        return { ok: true, plan, result: { value: sortRows(rows, plan.sort).slice(0, plan.limit).map(publicItem), details: baseDetails } };
    }
    if (plan.operation === 'recommend') {
        const groupBy = plan.groupBy.length > 0 ? plan.groupBy : ['month'];
        const grouped = groupRows(rows, groupBy, plan.timeBasis);
        const sortedGroups = groupBy.includes('month') ? sortMonthlyGroups(grouped) : grouped;
        const groups = groupBy.includes('month')
            ? sortedGroups.slice(Math.max(0, sortedGroups.length - plan.limit))
            : sortedGroups.slice(0, plan.limit);
        if (plan.domain === 'expenses') {
            const recommendation = buildExpenseCutRecommendation(groups, total);
            return { ok: true, plan, result: { value: recommendation, details: { ...baseDetails, groupBy: plan.groupBy, criteria: recommendation.criteria } } };
        }
        return { ok: true, plan, result: { value: groups, details: { ...baseDetails, groupBy: plan.groupBy } } };
    }
    if (plan.operation === 'trend') {
        const groupBy = plan.groupBy.length > 0 ? plan.groupBy : ['month'];
        const grouped = groupRows(rows, groupBy, plan.timeBasis);
        const sortedGroups = groupBy.includes('month') ? sortMonthlyGroups(grouped) : grouped;
        const groups = groupBy.includes('month')
            ? sortedGroups.slice(Math.max(0, sortedGroups.length - plan.limit))
            : sortedGroups.slice(0, plan.limit);
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
