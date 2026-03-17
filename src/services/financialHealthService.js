const { parseSheetDate, parseValue, normalizeText } = require('../utils/helpers');

const monthNamesLower = [
    'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];
const monthNamesCapitalized = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

function normalizeNameList(names = []) {
    return names
        .map(n => normalizeText(String(n || '').trim()))
        .filter(Boolean);
}

function rowBelongsToUser({ row, userIdIndex, responsibleIndex = null, userId, aliases = [] }) {
    const rowUserId = String(row[userIdIndex] || '').trim();
    if (rowUserId) {
        return rowUserId === userId;
    }
    if (responsibleIndex === null) return false;
    const responsible = normalizeText(String(row[responsibleIndex] || '').trim());
    return responsible && aliases.includes(responsible);
}

function isSameMonthYear(date, month, year) {
    return date && date.getMonth() === month && date.getFullYear() === year;
}

function monthDiff(a, b) {
    return (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
}

function safeNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function findEmergencyReserveCurrent(metasData, userId) {
    if (!metasData || metasData.length <= 1) return 0;
    for (const row of metasData.slice(1)) {
        const name = normalizeText(row[0] || '');
        const rowUserId = String(row[8] || '').trim();
        if (!rowUserId || rowUserId !== userId) continue;
        if (name.includes('reserva')) {
            return parseValue(row[2] || 0);
        }
    }
    return 0;
}

function parseMonthlyRatePercent(rateText) {
    const raw = normalizeText(String(rateText || ''));
    if (!raw) return 0;
    const numberMatch = raw.match(/(\d+(?:[.,]\d+)?)/);
    if (!numberMatch) return 0;
    const n = parseFloat(numberMatch[1].replace(',', '.'));
    if (isNaN(n)) return 0;
    // Assume mensal por padrão quando não estiver explícito.
    if (raw.includes('a.a') || raw.includes('aa') || raw.includes('ano')) {
        return n / 12;
    }
    return n;
}

function buildHealthSummary(data) {
    const {
        user,
        aliases,
        profile,
        saidasData,
        entradasData,
        dividasData,
        metasData,
        creditCardData
    } = data;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const monthLabel = monthNamesLower[currentMonth];
    const billingMonthLabel = `${monthNamesCapitalized[currentMonth]} de ${currentYear}`;
    const aliasList = normalizeNameList(aliases);

    const saidasRows = (saidasData || []).slice(1).filter(row => rowBelongsToUser({
        row,
        userIdIndex: 9,
        responsibleIndex: 5,
        userId: user.user_id,
        aliases: aliasList
    }));

    const entradasRows = (entradasData || []).slice(1).filter(row => rowBelongsToUser({
        row,
        userIdIndex: 8,
        responsibleIndex: 4,
        userId: user.user_id,
        aliases: aliasList
    }));

    const currentMonthSaidas = saidasRows
        .filter(row => isSameMonthYear(parseSheetDate(row[0]), currentMonth, currentYear))
        .reduce((sum, row) => sum + parseValue(row[4]), 0);

    const currentMonthEntradas = entradasRows
        .filter(row => isSameMonthYear(parseSheetDate(row[0]), currentMonth, currentYear))
        .reduce((sum, row) => sum + parseValue(row[3]), 0);

    let currentMonthCard = 0;
    const cardOutflowLast3Months = [];

    (creditCardData || []).forEach(cardSheetData => {
        if (!cardSheetData || cardSheetData.length <= 1) return;
        cardSheetData.slice(1).forEach(row => {
            if (!rowBelongsToUser({ row, userIdIndex: 6, userId: user.user_id })) return;

            if ((row[5] || '') === billingMonthLabel) {
                currentMonthCard += parseValue(row[3]);
            }

            const purchaseDate = parseSheetDate(row[0]);
            if (!purchaseDate) return;
            const diff = monthDiff(now, purchaseDate);
            if (diff >= 0 && diff < 3) {
                cardOutflowLast3Months.push(parseValue(row[3]));
            }
        });
    });

    const totalOutflowCurrentMonth = currentMonthSaidas + currentMonthCard;
    const saldoMes = currentMonthEntradas - totalOutflowCurrentMonth;

    const saidasLast3Months = saidasRows
        .filter(row => {
            const d = parseSheetDate(row[0]);
            if (!d) return false;
            const diff = monthDiff(now, d);
            return diff >= 0 && diff < 3;
        })
        .map(row => parseValue(row[4]));

    const totalOutflowLast3Months = [
        ...saidasLast3Months,
        ...cardOutflowLast3Months
    ].reduce((sum, v) => sum + safeNumber(v), 0);

    const monthlyAvgOutflow = totalOutflowLast3Months / 3;
    const fixedExpenseEstimate = parseValue(profile?.fixed_expense_estimate || 0);
    const variableAvg = Math.max(0, monthlyAvgOutflow - fixedExpenseEstimate);
    const essentialMonthly = fixedExpenseEstimate > 0
        ? Math.max(fixedExpenseEstimate, monthlyAvgOutflow * 0.7)
        : monthlyAvgOutflow * 0.7;

    const reserveTarget3 = essentialMonthly * 3;
    const reserveCurrent = findEmergencyReserveCurrent(metasData, user.user_id);
    const reserveProgressPct = reserveTarget3 > 0
        ? Math.min(100, (reserveCurrent / reserveTarget3) * 100)
        : 0;

    const debtsRows = (dividasData || []).slice(1).filter(row => rowBelongsToUser({
        row,
        userIdIndex: 17,
        responsibleIndex: 11,
        userId: user.user_id,
        aliases: aliasList
    }));

    const debtsForPlanning = debtsRows
        .map(row => ({
            name: row[0] || 'Dívida',
            balance: parseValue(row[4]),
            minPayment: parseValue(row[5]),
            monthlyRatePct: parseMonthlyRatePercent(row[6])
        }))
        .filter(d => d.balance > 0 && d.minPayment > 0);

    let upcomingDebtCount = 0;
    let upcomingDebtTotal = 0;
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    debtsRows.forEach(row => {
        const dueDate = parseSheetDate(row[14]);
        if (!dueDate) return;
        if (dueDate >= now && dueDate <= thirtyDaysFromNow) {
            upcomingDebtCount += 1;
            upcomingDebtTotal += parseValue(row[5]);
        }
    });

    const estimatedDailyBurn = (fixedExpenseEstimate + variableAvg + upcomingDebtTotal) / 30;
    let daysToNegative = null;
    if (estimatedDailyBurn > 0) {
        if (saldoMes <= 0) {
            daysToNegative = 0;
        } else {
            daysToNegative = Math.floor(saldoMes / estimatedDailyBurn);
        }
    }

    const riskLevel = daysToNegative === null
        ? 'indefinido'
        : daysToNegative <= 7
            ? 'alto'
            : daysToNegative <= 15
                ? 'medio'
                : daysToNegative <= 30
                    ? 'baixo'
                    : 'controlado';

    const riskExplanation = [
        `${upcomingDebtCount} parcela(s) de dívida vencendo em até 30 dias`,
        `gasto fixo estimado de R$ ${fixedExpenseEstimate.toFixed(2)}`,
        `média variável mensal de R$ ${variableAvg.toFixed(2)}`
    ].join(' + ');

    return {
        periodLabel: `${monthLabel}/${currentYear}`,
        currentMonthEntradas,
        currentMonthSaidas,
        currentMonthCard,
        saldoMes,
        fixedExpenseEstimate,
        variableAvg,
        monthlyAvgOutflow,
        upcomingDebtCount,
        upcomingDebtTotal,
        daysToNegative,
        riskLevel,
        riskExplanation,
        reserveCurrent,
        reserveTarget3,
        reserveProgressPct,
        debtsForPlanning
    };
}

module.exports = {
    buildHealthSummary
};
