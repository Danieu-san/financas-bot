const { readDataFromSheet, runWithUserSheetContext, hasUserSpreadsheetContext } = require('./google');
const { getFinancialScopeUserIds, getSharedSpreadsheetMembership } = require('./oauthTokenStore');
const { getAllUsers, getUserSettingsByUserId } = require('./userService');
const { parseSheetDate, parseValue, normalizeText, getFormattedDateOnly } = require('../utils/helpers');
const {
    normalizeCycleStartDay,
    getBudgetCycleForPeriod,
    dateIsWithinCycle
} = require('../utils/budgetCycle');
const { goalRowToObject } = require('./goalService');
const { decorateDashboardSummary } = require('./dashboardSummaryService');

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function normalizePeriod({ month, year } = {}) {
    const now = new Date();
    const parsedMonth = Number.parseInt(month, 10);
    const parsedYear = Number.parseInt(year, 10);
    return {
        month: Number.isInteger(parsedMonth) && parsedMonth >= 0 && parsedMonth <= 11 ? parsedMonth : now.getMonth(),
        year: Number.isInteger(parsedYear) && parsedYear > 1900 ? parsedYear : now.getFullYear()
    };
}

function periodMatchesDate(value, month, year) {
    const date = parseSheetDate(value);
    return Boolean(date && date.getMonth() === month && date.getFullYear() === year);
}

function formatDashboardDate(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    if (/^\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?$/.test(raw)) return raw;
    const parsed = parseSheetDate(raw);
    return parsed ? getFormattedDateOnly(parsed) : raw;
}

function transactionTimestamp(value) {
    const parsed = parseSheetDate(value);
    return parsed ? parsed.getTime() : 0;
}

function cycleMatchesDate(value, cycle) {
    return dateIsWithinCycle(parseSheetDate(value), cycle);
}

function periodMatchesBillingMonth(value, month, year) {
    return String(value || '').trim() === `${MONTH_NAMES[month]} de ${year}`;
}

function cardRowMatchesDashboardPeriod(row, month, year) {
    if (periodMatchesDate(row?.[0], month, year)) return true;
    return !parseSheetDate(row?.[0]) && periodMatchesBillingMonth(row?.[5], month, year);
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

function parseDayOfMonth(value) {
    const parsed = Number.parseInt(String(value || '').trim(), 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) return null;
    return parsed;
}

function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

function normalizeCardKey(value) {
    return normalizeText(String(value || '').trim()).replace(/\s+/g, ' ');
}

function buildCardDueDayMap(cardConfigRows = []) {
    const map = new Map();
    (Array.isArray(cardConfigRows) ? cardConfigRows.slice(1) : []).forEach((row) => {
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

function getCardDueDay(row, dueDayMap) {
    const keys = [row?.[6], row?.[7]].map(normalizeCardKey).filter(Boolean);
    for (const key of keys) {
        if (dueDayMap.has(key)) return dueDayMap.get(key);
    }
    return 1;
}

function getCardBudgetImpactDate(row, dueDayMap = new Map()) {
    const billing = parseBillingMonth(row?.[5]);
    if (!billing) return parseSheetDate(row?.[0]);
    const dueDay = Math.min(getCardDueDay(row, dueDayMap), daysInMonth(billing.year, billing.month));
    return new Date(billing.year, billing.month, dueDay, 12, 0, 0, 0);
}

function rowBelongsToUser(row, index, userId) {
    return String(row?.[index] || '').trim() === String(userId || '').trim();
}

function rowBelongsToAnyUser(row, index, userIds = []) {
    const allowed = new Set((Array.isArray(userIds) ? userIds : [userIds]).map(id => String(id || '').trim()).filter(Boolean));
    return allowed.has(String(row?.[index] || '').trim());
}

function toTransaction(row, type) {
    return {
        date: formatDashboardDate(row[0]),
        rawDate: row[0] || '',
        description: row[1] || '',
        category: row[2] || 'Outros',
        value: parseValue(row[type === 'entrada' ? 3 : 4]),
        type,
        typeLabel: type === 'entrada' ? 'Entrada' : 'Saída',
        timestamp: transactionTimestamp(row[0])
    };
}

function toCardTransaction(row) {
    return {
        date: formatDashboardDate(row[0]),
        rawDate: row[0] || '',
        description: row[1] || '',
        category: row[2] || 'Cartão',
        value: parseValue(row[3]),
        type: 'cartao',
        typeLabel: 'Cartão',
        installment: row[4] || '',
        card: row[7] || row[6] || '',
        timestamp: transactionTimestamp(row[0])
    };
}

function toTransfer(row) {
    return {
        date: formatDashboardDate(row[0]),
        rawDate: row[0] || '',
        description: row[1] || '',
        category: 'Transferência',
        value: parseValue(row[2]),
        type: 'transferencia',
        typeLabel: 'Transferência',
        observations: row[6] || '',
        status: row[7] || '',
        timestamp: transactionTimestamp(row[0])
    };
}

function transferHasReserveKeyword(item) {
    const text = normalizeText(`${item.description || ''} ${item.observations || ''} ${item.status || ''}`);
    return [
        'rdb',
        'caixinha',
        'nu reserva',
        'reserva',
        'investimento',
        'aplic aut',
        'aplicacao aut',
        'aplicação aut'
    ].some(term => text.includes(normalizeText(term)));
}

function isReserveApplication(item) {
    const description = normalizeText(item.description || '');
    return transferHasReserveKeyword(item) && (
        description.includes('aplicacao') ||
        description.includes('aplicação') ||
        description.includes('guardar') ||
        description.includes('guardado')
    );
}

function isReserveRedemption(item) {
    const description = normalizeText(item.description || '');
    return transferHasReserveKeyword(item) && (
        description.includes('resgate') ||
        description.includes('retirada')
    );
}

function roundMoney(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function getTodaySaoPauloDateString() {
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(new Date());
}

function getSaoPauloDateParts() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date()).reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});
    return {
        year: Number(parts.year),
        month: Number(parts.month) - 1,
        day: Number(parts.day)
    };
}

function isFreeSpendingRow(row) {
    const category = normalizeText(row?.[2] || '');
    const recurring = normalizeText(row?.[7] || '');
    if (recurring === 'sim') return false;
    return ![
        'transferencia',
        'transferencias',
        'divida',
        'dividas',
        'investimento',
        'investimentos',
        'reserva'
    ].some(term => category.includes(term));
}

function buildReserveSummary(transfers = []) {
    const applied = roundMoney(transfers
        .filter(isReserveApplication)
        .reduce((sum, item) => sum + Number(item.value || 0), 0));
    const redeemed = roundMoney(transfers
        .filter(isReserveRedemption)
        .reduce((sum, item) => sum + Number(item.value || 0), 0));
    const netApplied = roundMoney(applied - redeemed);

    return {
        applied,
        redeemed,
        netApplied,
        movementCount: transfers.filter(item => isReserveApplication(item) || isReserveRedemption(item)).length
    };
}

function buildTopCategories(transactions) {
    const totals = new Map();
    transactions.forEach((item) => {
        const key = item.category || 'Outros';
        totals.set(key, (totals.get(key) || 0) + Number(item.value || 0));
    });
    return Array.from(totals.entries())
        .map(([category, value]) => ({ category, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);
}

function parseInstallmentLabel(value) {
    const match = String(value || '').trim().match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!match) return { current: null, total: null };
    const current = Number.parseInt(match[1], 10);
    const total = Number.parseInt(match[2], 10);
    if (!Number.isInteger(current) || !Number.isInteger(total) || total <= 1) {
        return { current: null, total: null };
    }
    return { current, total };
}

function buildRecentTransactions({ entradas = [], saidas = [], cartoes = [], transferencias = [], limit = 10 } = {}) {
    const cardGroups = new Map();
    const groupedCards = [];

    cartoes.forEach((item) => {
        const installment = parseInstallmentLabel(item.installment);
        if (!installment.total) {
            groupedCards.push(item);
            return;
        }

        const key = [
            item.rawDate || item.date || '',
            normalizeText(item.description || ''),
            normalizeText(item.category || ''),
            normalizeText(item.card || ''),
            installment.total
        ].join('|');
        const existing = cardGroups.get(key) || {
            ...item,
            value: 0,
            installmentCount: 0,
            installmentTotal: installment.total,
            typeLabel: 'Cartão'
        };
        existing.value += Number(item.value || 0);
        existing.installmentCount += 1;
        existing.timestamp = Math.max(Number(existing.timestamp || 0), Number(item.timestamp || 0));
        cardGroups.set(key, existing);
    });

    cardGroups.forEach((item) => {
        groupedCards.push({
            ...item,
            value: roundMoney(item.value),
            description: item.installmentTotal
                ? `${item.description} (${item.installmentTotal}x no cartão)`
                : item.description
        });
    });

    return [...entradas, ...saidas, ...groupedCards, ...transferencias]
        .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
        .slice(0, limit)
        .map(({ timestamp, rawDate, installment, card, installmentCount, installmentTotal, observations, status, ...item }) => item);
}

function buildDailyFlow({ entradas, saidas, cartoes }) {
    const map = new Map();
    const ensure = (date) => {
        const key = date || 'Sem data';
        const existing = map.get(key) || { date: key, entradas: 0, saidas: 0, cartoes: 0, saldo: 0 };
        map.set(key, existing);
        return existing;
    };

    entradas.forEach((item) => {
        const entry = ensure(item.date);
        entry.entradas += item.value;
        entry.saldo += item.value;
    });
    [...saidas, ...cartoes].forEach((item) => {
        const entry = ensure(item.date);
        if (item.type === 'cartao') entry.cartoes += item.value;
        else entry.saidas += item.value;
        entry.saldo -= item.value;
    });

    return Array.from(map.values()).sort((a, b) => {
        const dateA = parseSheetDate(a.date)?.getTime() || 0;
        const dateB = parseSheetDate(b.date)?.getTime() || 0;
        return dateA - dateB;
    });
}

function roundBreakdownItem(item) {
    const { userId: _internalUserId, ...publicItem } = item;
    return {
        ...publicItem,
        entradas: roundMoney(item.entradas),
        saidas: roundMoney(item.saidas),
        cartoes: roundMoney(item.cartoes),
        saldo: roundMoney(item.entradas - item.saidas - item.cartoes)
    };
}

function buildMemberBreakdown({ entradasRows, saidasRows, cartaoRows, userIds, userNames, period }) {
    const members = new Map();
    const ensure = (userId) => {
        const safeUserId = String(userId || '').trim();
        if (!safeUserId) return null;
        if (!members.has(safeUserId)) {
            members.set(safeUserId, {
                userId: safeUserId,
                name: userNames?.get(safeUserId) || 'Membro',
                entradas: 0,
                saidas: 0,
                cartoes: 0
            });
        }
        return members.get(safeUserId);
    };

    (Array.isArray(userIds) ? userIds : [userIds]).forEach(ensure);

    entradasRows.slice(1).forEach((row) => {
        const member = ensure(row?.[8]);
        if (member && periodMatchesDate(row[0], period.month, period.year)) {
            member.entradas += parseValue(row[3]);
        }
    });
    saidasRows.slice(1).forEach((row) => {
        const member = ensure(row?.[9]);
        if (member && periodMatchesDate(row[0], period.month, period.year)) {
            member.saidas += parseValue(row[4]);
        }
    });
    cartaoRows.slice(1).forEach((row) => {
        const member = ensure(row?.[9]);
        if (member && cardRowMatchesDashboardPeriod(row, period.month, period.year)) {
            member.cartoes += parseValue(row[3]);
        }
    });

    return Array.from(members.values())
        .filter(member => (Array.isArray(userIds) ? userIds : [userIds]).map(String).includes(member.userId))
        .map(roundBreakdownItem);
}

function buildGoalDashboardRows(metasRows = [], userIds = []) {
    const headers = metasRows[0] || [];
    const allowedUserIds = new Set((Array.isArray(userIds) ? userIds : [userIds])
        .map(id => String(id || '').trim())
        .filter(Boolean));

    return metasRows.slice(1)
        .map((row, offset) => goalRowToObject(row, offset + 2, headers))
        .filter(goal => goal.name && allowedUserIds.has(goal.userId))
        .map(goal => ({
            name: goal.name,
            target: goal.target,
            current: goal.current,
            progressPct: goal.progressPct,
            status: goal.status,
            priority: goal.priority,
            scope: goal.scope,
            lastMovement: goal.lastMovement,
            user_id: goal.userId
        }))
        .sort((a, b) => Number(b.current || 0) - Number(a.current || 0));
}

function buildDailyGoalSummary({ settings, saidasRows, cartaoRows, cardConfigRows = [], userIds, period }) {
    if (normalizeText(settings?.monthly_budget_enabled || '') !== 'sim') return null;
    const monthlyAmount = parseValue(settings?.monthly_budget_amount);
    if (!monthlyAmount || monthlyAmount <= 0) return null;
    const scope = settings?.monthly_budget_scope === 'family' ? 'family' : 'personal';
    const cycleStartDay = normalizeCycleStartDay(settings?.monthly_budget_cycle_start_day || '1');
    const normalizedPeriod = normalizePeriod(period);
    const todayParts = getSaoPauloDateParts();
    const cycle = getBudgetCycleForPeriod(normalizedPeriod, cycleStartDay, todayParts);
    const isCurrentCycle = cycle.isCurrent;

    const today = getTodaySaoPauloDateString();
    const todayMatches = (value) => {
        const parsed = value instanceof Date ? value : parseSheetDate(value);
        return parsed ? `${String(parsed.getDate()).padStart(2, '0')}/${String(parsed.getMonth() + 1).padStart(2, '0')}/${parsed.getFullYear()}` === today : String(value || '').trim() === today;
    };
    const saidasEligible = saidasRows.slice(1)
        .filter(row => rowBelongsToAnyUser(row, 9, userIds) && isFreeSpendingRow(row));
    const cartoesEligible = cartaoRows.slice(1)
        .filter(row => rowBelongsToAnyUser(row, 9, userIds));
    const cardDueDayMap = buildCardDueDayMap(cardConfigRows);
    const saidasToday = isCurrentCycle
        ? saidasEligible.filter(row => todayMatches(row[0])).reduce((sum, row) => sum + parseValue(row[4]), 0)
        : 0;
    const cartoesToday = isCurrentCycle
        ? cartoesEligible.filter(row => todayMatches(getCardBudgetImpactDate(row, cardDueDayMap))).reduce((sum, row) => sum + parseValue(row[3]), 0)
        : 0;
    const saidasMonth = saidasEligible
        .filter(row => cycleMatchesDate(row[0], cycle))
        .reduce((sum, row) => sum + parseValue(row[4]), 0);
    const cartoesMonth = cartoesEligible
        .filter(row => dateIsWithinCycle(getCardBudgetImpactDate(row, cardDueDayMap), cycle))
        .reduce((sum, row) => sum + parseValue(row[3]), 0);
    const spent = roundMoney(saidasToday + cartoesToday);
    const monthSpent = roundMoney(saidasMonth + cartoesMonth);
    const monthRemaining = roundMoney(Math.max(0, monthlyAmount - monthSpent));
    const monthPercentUsed = monthlyAmount > 0 ? Math.round((monthSpent / monthlyAmount) * 100) : 0;
    const daysRemaining = isCurrentCycle ? Math.max(1, cycle.daysRemaining || 1) : 0;
    const spentBeforeToday = Math.max(0, monthSpent - spent);
    const budgetBeforeToday = Math.max(0, monthlyAmount - spentBeforeToday);
    const dailyRecommendedAmount = isCurrentCycle ? roundMoney(budgetBeforeToday / daysRemaining) : 0;
    const remaining = roundMoney(Math.max(0, dailyRecommendedAmount - spent));
    const percentUsed = dailyRecommendedAmount > 0 ? Math.round((spent / dailyRecommendedAmount) * 100) : 0;

    return {
        mode: 'monthly_budget',
        date: isCurrentCycle ? today : '',
        amount: dailyRecommendedAmount,
        monthlyAmount,
        spent,
        remaining,
        percentUsed,
        exceeded: isCurrentCycle && spent > dailyRecommendedAmount,
        scope,
        monthSpent,
        monthRemaining,
        monthPercentUsed,
        daysRemaining,
        dailyRecommendedAmount,
        cycleStartDay,
        period: {
            month: normalizedPeriod.month,
            year: normalizedPeriod.year,
            label: cycle.label,
            start: cycle.startLabel,
            end: cycle.endLabel
        }
    };
}

async function getDailyGoalDashboardSettings(userId) {
    const membership = getSharedSpreadsheetMembership(userId);
    if (membership?.owner_user_id) {
        const ownerSettings = await getUserSettingsByUserId(membership.owner_user_id);
        if (normalizeText(ownerSettings?.monthly_budget_enabled || '') === 'sim' && ownerSettings?.monthly_budget_scope === 'family') {
            return { settings: ownerSettings, ownerUserId: membership.owner_user_id };
        }
    }
    return { settings: await getUserSettingsByUserId(userId), ownerUserId: userId };
}

async function getUserSheetDashboardData(userId, { month, year } = {}) {
    const safeUserId = String(userId || '').trim();
    if (!safeUserId || !(await hasUserSpreadsheetContext({ userId: safeUserId }))) return null;

    const users = await getAllUsers();
    const userNames = new Map(users.map(user => [
        String(user.user_id || '').trim(),
        String(user.display_name || user.phone_e164 || 'Membro').trim()
    ]));

    return runWithUserSheetContext({ userId: safeUserId }, async () => {
        const financialScopeUserIds = getFinancialScopeUserIds(safeUserId);
        const period = normalizePeriod({ month, year });
        const dailyGoalConfig = await getDailyGoalDashboardSettings(safeUserId);
        const [saidasRows, entradasRows, cartaoRows, cardConfigRows, transferRows, metasRows, dividasRows] = await Promise.all([
            readDataFromSheet('Saídas!A:J'),
            readDataFromSheet('Entradas!A:I'),
            readDataFromSheet('Lançamentos Cartão!A:J'),
            readDataFromSheet('Cartões!A:G'),
            readDataFromSheet('Transferências!A:I'),
            readDataFromSheet('Metas!A:I'),
            readDataFromSheet('Dívidas!A:R')
        ]);

        const saidas = saidasRows.slice(1)
            .filter(row => rowBelongsToAnyUser(row, 9, financialScopeUserIds) && periodMatchesDate(row[0], period.month, period.year))
            .map(row => toTransaction(row, 'saida'));
        const entradas = entradasRows.slice(1)
            .filter(row => rowBelongsToAnyUser(row, 8, financialScopeUserIds) && periodMatchesDate(row[0], period.month, period.year))
            .map(row => toTransaction(row, 'entrada'));
        const cartoes = cartaoRows.slice(1)
            .filter(row => rowBelongsToAnyUser(row, 9, financialScopeUserIds) && cardRowMatchesDashboardPeriod(row, period.month, period.year))
            .map(toCardTransaction);
        const transfers = transferRows.slice(1)
            .filter(row => rowBelongsToAnyUser(row, 8, financialScopeUserIds) && periodMatchesDate(row[0], period.month, period.year))
            .map(toTransfer);

        const totalSaidas = saidas.reduce((sum, item) => sum + item.value, 0);
        const totalEntradas = entradas.reduce((sum, item) => sum + item.value, 0);
        const totalCartoes = cartoes.reduce((sum, item) => sum + item.value, 0);
        const reserveSummary = buildReserveSummary(transfers);
        const saldo = roundMoney(totalEntradas - totalSaidas - totalCartoes);
        const saldoDisponivelEstimado = roundMoney(saldo - reserveSummary.netApplied);
        const expenses = [...saidas, ...cartoes];
        const members = buildMemberBreakdown({
            entradasRows,
            saidasRows,
            cartaoRows,
            userIds: financialScopeUserIds,
            userNames,
            period
        });

        return decorateDashboardSummary({
            period: {
                month: period.month,
                year: period.year,
                label: `${MONTH_NAMES[period.month]} de ${period.year}`
            },
            scope: {
                mode: financialScopeUserIds.length > 1 ? 'family' : 'personal',
                label: financialScopeUserIds.length > 1 ? 'Família' : 'Pessoal',
                members
            },
            kpis: {
                entradas: totalEntradas,
                saidas: totalSaidas,
                cartoes: totalCartoes,
                saldo,
                reservaAplicada: reserveSummary.applied,
                reservaResgatada: reserveSummary.redeemed,
                reservaLiquida: reserveSummary.netApplied,
                saldoDisponivelEstimado
            },
            topCategories: buildTopCategories(expenses),
            dailyFlow: buildDailyFlow({ entradas, saidas, cartoes }),
            dailyGoal: buildDailyGoalSummary({
                settings: dailyGoalConfig.settings,
                saidasRows,
                cartaoRows,
                cardConfigRows,
                userIds: dailyGoalConfig.settings?.monthly_budget_scope === 'family' ? financialScopeUserIds : [safeUserId],
                period
            }),
            recentTransactions: buildRecentTransactions({ entradas, saidas, cartoes, transferencias: transfers }),
            goals: buildGoalDashboardRows(metasRows, financialScopeUserIds),
            debts: dividasRows.slice(1).filter(row => rowBelongsToAnyUser(row, 17, financialScopeUserIds)),
            alerts: [],
            source: 'personal_sheet'
        });
    });
}

module.exports = {
    getUserSheetDashboardData,
    __test__: {
        normalizePeriod,
        periodMatchesBillingMonth,
        cardRowMatchesDashboardPeriod,
        parseBillingMonth,
        formatDashboardDate,
        buildTopCategories,
        buildRecentTransactions,
        rowBelongsToAnyUser,
        buildReserveSummary,
        buildMemberBreakdown,
        buildGoalDashboardRows,
        isReserveApplication,
        isReserveRedemption,
        isFreeSpendingRow,
        buildCardDueDayMap,
        getCardBudgetImpactDate,
        buildDailyGoalSummary
    }
};
