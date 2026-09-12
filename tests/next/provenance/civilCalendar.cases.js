'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDate, parseMonth, dayOrdinal, dateFromOrdinal, offsetDate,
    monthBounds, inclusiveDayCount } = require('../../../src/next/provenance/civilCalendar');

test('N02G:CIVIL-001 real Gregorian dates and bounds, including years below 100', () => {
    assert.deepEqual(parseDate('0001-01-01'), { year: 1, month: 1, day: 1 });
    assert.deepEqual(parseMonth('0099-12'), { year: 99, month: 12 });
    for (const value of ['0000-01-01', '1900-02-29', '2042-02-30', '2042-04-31', '2042-13-01', '2042-1-01', '2042-01-01Z', 1, null]) {
        assert.throws(() => parseDate(value), /civil_/);
    }
    assert.equal(dayOrdinal('0001-01-01'), 1);
    assert.equal(dayOrdinal('2000-03-01') - dayOrdinal('2000-02-28'), 2);
    assert.equal(dayOrdinal('1900-03-01') - dayOrdinal('1900-02-28'), 1);
    for (const date of ['0001-01-01', '0099-12-31', '0400-02-29', '1900-03-01', '2042-06-30', '9999-12-31']) {
        assert.equal(dateFromOrdinal(dayOrdinal(date)), date);
    }
});

test('N02G:CIVIL-002 day/month offsets preserve civil semantics and never clamp', () => {
    assert.equal(offsetDate('2042-06-15', 1, 'day'), '2042-06-16');
    assert.equal(offsetDate('2042-06-10', -1, 'month'), '2042-05-10');
    assert.equal(offsetDate('2000-02-28', 2, 'day'), '2000-03-01');
    assert.equal(offsetDate('0100-01-01', -1, 'day'), '0099-12-31');
    for (const args of [['2042-01-31', 1, 'month'], ['0001-01-01', -1, 'day'],
        ['9999-12-31', 1, 'day'], ['9999-12-01', 1, 'month'], ['2042-01-01', -0, 'day'],
        ['2042-01-01', '1', 'day'], ['2042-01-01', 1, 'year'], ['2042-01-01', Number.MAX_SAFE_INTEGER, 'day']]) {
        assert.throws(() => offsetDate(...args), /civil_/);
    }
});

test('N02G:CIVIL-003 month bounds and inclusive cardinality do not use elapsed milliseconds', () => {
    assert.deepEqual(monthBounds('2000-02'), { start: '2000-02-01', end: '2000-02-29' });
    assert.deepEqual(monthBounds('1900-02'), { start: '1900-02-01', end: '1900-02-28' });
    assert.equal(inclusiveDayCount({ start: '2042-06-16', end: '2042-06-30', start_inclusive: true, end_inclusive: true }), 15);
    assert.equal(inclusiveDayCount({ start: '2018-11-03', end: '2018-11-05', start_inclusive: true, end_inclusive: true }), 3);
    for (const range of [{ start: '2042-06-30', end: '2042-06-16', start_inclusive: true, end_inclusive: true },
        { start: '2042-06-16', end: '2042-06-30', start_inclusive: false, end_inclusive: true }]) {
        assert.throws(() => inclusiveDayCount(range), /civil_/);
    }
});
