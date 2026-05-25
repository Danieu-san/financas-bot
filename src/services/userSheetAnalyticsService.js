const { readDataFromSheet, runWithUserSheetContext, hasUserSpreadsheetContext } = require('./google');
const { getFinancialScopeUserIds } = require('./oauthTokenStore');
const { parseSheetDate, parseValue, normalizeText } = require('../utils/helpers');

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

function periodMatchesBillingMonth(value, month, year) {
    return String(value || '').trim() === `${MONTH_NAMES[month]} de ${year}`;
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
        date: row[0] || '',
        description: row[1] || '',
        category: row[2] || 'Outros',
        value: parseValue(row[type === 'entrada' ? 3 : 4]),
        type
    };
}

function toCardTransaction(row) {
    return {
        date: row[0] || '',
        description: row[1] || '',
        category: row[2] || 'Cartão',
        value: parseValue(row[3]),
        type: 'cartao'
    };
}

function toTransfer(row) {
    return {
        date: row[0] || '',
        description: row[1] || '',
        value: parseValue(row[2]),
        observations: row[6] || '',
        status: row[7] || ''
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

async function getUserSheetDashboardData(userId, { month, year } = {}) {
    const safeUserId = String(userId || '').trim();
    if (!safeUserId || !(await hasUserSpreadsheetContext({ userId: safeUserId }))) return null;

    return runWithUserSheetContext({ userId: safeUserId }, async () => {
        const financialScopeUserIds = getFinancialScopeUserIds(safeUserId);
        const period = normalizePeriod({ month, year });
        const [saidasRows, entradasRows, cartaoRows, transferRows, metasRows, dividasRows] = await Promise.all([
            readDataFromSheet('Saídas!A:J'),
            readDataFromSheet('Entradas!A:I'),
            readDataFromSheet('Lançamentos Cartão!A:J'),
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
            .filter(row => rowBelongsToAnyUser(row, 9, financialScopeUserIds) && periodMatchesBillingMonth(row[5], period.month, period.year))
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

        return {
            period: {
                month: period.month,
                year: period.year,
                label: `${MONTH_NAMES[period.month]} de ${period.year}`
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
            recentTransactions: [...entradas, ...expenses].slice(-10).reverse(),
            goals: metasRows.slice(1).filter(row => rowBelongsToAnyUser(row, 8, financialScopeUserIds)),
            debts: dividasRows.slice(1).filter(row => rowBelongsToAnyUser(row, 17, financialScopeUserIds)),
            alerts: [],
            source: 'personal_sheet'
        };
    });
}

module.exports = {
    getUserSheetDashboardData,
    __test__: {
        normalizePeriod,
        periodMatchesBillingMonth,
        buildTopCategories,
        rowBelongsToAnyUser,
        buildReserveSummary,
        isReserveApplication,
        isReserveRedemption
    }
};
