function normalizeCycleStartDay(value) {
    const parsed = Number.parseInt(String(value || '').trim(), 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) return 1;
    return parsed;
}

function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

function buildDate(year, month, day) {
    return new Date(year, month, day, 12, 0, 0, 0);
}

function getCycleStartForMonth(year, month, cycleStartDay) {
    const safeDay = normalizeCycleStartDay(cycleStartDay);
    const actualDay = Math.min(safeDay, daysInMonth(year, month));
    return buildDate(year, month, actualDay);
}

function toDateParts(value) {
    if (value instanceof Date) {
        return { year: value.getFullYear(), month: value.getMonth(), day: value.getDate() };
    }
    return {
        year: Number(value?.year),
        month: Number(value?.month),
        day: Number(value?.day)
    };
}

function dateOnlyTime(date) {
    return buildDate(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function addDays(date, days) {
    return buildDate(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function daysBetweenInclusive(start, end) {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.max(0, Math.round((dateOnlyTime(end) - dateOnlyTime(start)) / msPerDay) + 1);
}

function formatDateBR(date) {
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function buildCycle(start, nextStart, referenceDate = null) {
    const end = addDays(nextStart, -1);
    const refTime = referenceDate ? dateOnlyTime(referenceDate) : null;
    const isCurrent = refTime !== null && refTime >= dateOnlyTime(start) && refTime <= dateOnlyTime(end);
    return {
        start,
        end,
        startLabel: formatDateBR(start),
        endLabel: formatDateBR(end),
        label: `Ciclo ${formatDateBR(start)} a ${formatDateBR(end)}`,
        daysInCycle: daysBetweenInclusive(start, end),
        daysRemaining: isCurrent ? daysBetweenInclusive(referenceDate, end) : 0,
        isCurrent
    };
}

function getBudgetCycleForDate(reference, cycleStartDay = 1) {
    const parts = toDateParts(reference);
    const referenceDate = buildDate(parts.year, parts.month, parts.day);
    const currentStart = getCycleStartForMonth(parts.year, parts.month, cycleStartDay);
    if (dateOnlyTime(referenceDate) >= dateOnlyTime(currentStart)) {
        const nextStart = getCycleStartForMonth(parts.year, parts.month + 1, cycleStartDay);
        return buildCycle(currentStart, nextStart, referenceDate);
    }
    const previousStart = getCycleStartForMonth(parts.year, parts.month - 1, cycleStartDay);
    return buildCycle(previousStart, currentStart, referenceDate);
}

function getBudgetCycleForPeriod(period, cycleStartDay = 1, todayParts = null) {
    const year = Number(period?.year);
    const month = Number(period?.month);
    const start = getCycleStartForMonth(year, month, cycleStartDay);
    const nextStart = getCycleStartForMonth(year, month + 1, cycleStartDay);
    const referenceDate = todayParts ? buildDate(todayParts.year, todayParts.month, todayParts.day) : null;
    return buildCycle(start, nextStart, referenceDate);
}

function dateIsWithinCycle(date, cycle) {
    if (!(date instanceof Date) || !cycle?.start || !cycle?.end) return false;
    const time = dateOnlyTime(date);
    return time >= dateOnlyTime(cycle.start) && time <= dateOnlyTime(cycle.end);
}

module.exports = {
    normalizeCycleStartDay,
    getCycleStartForMonth,
    getBudgetCycleForDate,
    getBudgetCycleForPeriod,
    dateIsWithinCycle,
    formatDateBR,
    __test__: {
        daysInMonth,
        daysBetweenInclusive
    }
};
