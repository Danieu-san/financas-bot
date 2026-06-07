function validDueDay(value) {
    const day = Number.parseInt(value, 10);
    return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

function buildRecurringDueDate(year, month, dueDay) {
    const day = validDueDay(dueDay);
    if (day === null || !Number.isInteger(year) || !Number.isInteger(month)) return null;
    const lastDay = new Date(year, month + 1, 0, 12, 0, 0, 0).getDate();
    return new Date(year, month, Math.min(day, lastDay), 12, 0, 0, 0);
}

function isRecurringDueOnDate(dueDay, targetDate) {
    if (!(targetDate instanceof Date) || Number.isNaN(targetDate.getTime())) return false;
    const dueDate = buildRecurringDueDate(targetDate.getFullYear(), targetDate.getMonth(), dueDay);
    return Boolean(dueDate && dueDate.getDate() === targetDate.getDate());
}

function buildNextRecurringDueDate(dueDay, referenceDate) {
    if (!(referenceDate instanceof Date) || Number.isNaN(referenceDate.getTime())) return null;
    const reference = new Date(
        referenceDate.getFullYear(),
        referenceDate.getMonth(),
        referenceDate.getDate(),
        12,
        0,
        0,
        0
    );
    const currentMonthDueDate = buildRecurringDueDate(reference.getFullYear(), reference.getMonth(), dueDay);
    if (!currentMonthDueDate) return null;
    if (currentMonthDueDate >= reference) return currentMonthDueDate;
    return buildRecurringDueDate(reference.getFullYear(), reference.getMonth() + 1, dueDay);
}

module.exports = {
    validDueDay,
    buildRecurringDueDate,
    buildNextRecurringDueDate,
    isRecurringDueOnDate
};
