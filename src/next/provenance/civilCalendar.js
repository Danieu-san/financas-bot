'use strict';

// Proleptic Gregorian civil arithmetic. No Date, timezone, clock or millisecond
// arithmetic. Instant-to-zone conversion is deliberately a separate boundary.
const fail = code => { throw new Error(`civil_${code}`); };
const integer = value => {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail('integer');
    return value;
};
const leap = year => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
const daysBeforeYear = year => 365 * (year - 1) + Math.floor((year - 1) / 4)
    - Math.floor((year - 1) / 100) + Math.floor((year - 1) / 400);
function daysInMonth(year, month) {
    if (month === 2) return leap(year) ? 29 : 28;
    return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
function parseMonth(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) fail('month');
    const [year, month] = value.split('-').map(Number);
    if (year < 1 || year > 9999 || month < 1 || month > 12) fail('month');
    return { year, month };
}
function parseDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('date');
    const { year, month } = parseMonth(value.slice(0, 7));
    const day = Number(value.slice(8));
    if (day < 1 || day > daysInMonth(year, month)) fail('date');
    return { year, month, day };
}
function format(year, month, day) {
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function dayOrdinal(value) {
    const { year, month, day } = parseDate(value);
    let ordinal = daysBeforeYear(year) + day;
    for (let m = 1; m < month; m++) ordinal += daysInMonth(year, m);
    return ordinal;
}
function dateFromOrdinal(value) {
    integer(value);
    if (value < 1 || value > daysBeforeYear(10000)) fail('overflow');
    let low = 1;
    let high = 9999;
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (daysBeforeYear(middle) < value) low = middle;
        else high = middle - 1;
    }
    let day = value - daysBeforeYear(low);
    let month = 1;
    while (day > daysInMonth(low, month)) day -= daysInMonth(low, month++);
    return format(low, month, day);
}
function offsetDate(value, amount, unit) {
    const { year, month, day } = parseDate(value);
    integer(amount);
    if (unit === 'day') return dateFromOrdinal(integer(dayOrdinal(value) + amount));
    if (unit !== 'month') fail('unit');
    const index = integer((year - 1) * 12 + month - 1 + amount);
    if (index < 0 || index >= 9999 * 12) fail('overflow');
    const targetYear = Math.floor(index / 12) + 1;
    const targetMonth = index % 12 + 1;
    if (day > daysInMonth(targetYear, targetMonth)) fail('nonexistent_target');
    return format(targetYear, targetMonth, day);
}
function monthBounds(value) {
    const { year, month } = parseMonth(value);
    return { start: format(year, month, 1), end: format(year, month, daysInMonth(year, month)) };
}
function inclusiveDayCount(range) {
    if (!range || range.start_inclusive !== true || range.end_inclusive !== true) fail('inclusive_range');
    const count = dayOrdinal(range.end) - dayOrdinal(range.start) + 1;
    if (count < 1) fail('range_order');
    return count;
}

module.exports = { parseDate, parseMonth, dayOrdinal, dateFromOrdinal, offsetDate, monthBounds, inclusiveDayCount };
