'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { civilDateInPinnedTimezone, checkTimezoneRuntime } = require('../../../src/next/provenance/pinnedCivilTimezone');
test('N02G:TIMEZONE-001 explicit timezone conversion observes civil boundaries and historical DST', () => {
    const convert = instant => civilDateInPinnedTimezone(instant, 'America/Sao_Paulo', 'proleptic_gregorian');
    assert.equal(convert('2042-06-15T02:59:59.999999999Z'), '2042-06-14');
    assert.equal(convert('2042-06-15T03:00:00Z'), '2042-06-15');
    assert.equal(convert('2042-06-15T00:00:00-03:00'), '2042-06-15');
    assert.equal(convert('2018-11-04T02:59:59Z'), '2018-11-03');
    assert.equal(convert('2018-11-04T03:00:00Z'), '2018-11-04');
    assert.equal(convert('2019-02-17T01:59:59Z'), '2019-02-16');
    assert.equal(convert('2019-02-17T02:00:00Z'), '2019-02-16');
    assert.equal(convert('2019-02-17T03:00:00Z'), '2019-02-17');
});
test('N02G:TIMEZONE-002 runtime and data overrides fail closed', () => {
    assert.equal(checkTimezoneRuntime(process.versions, process.config.variables, {}, []), true);
    for (const key of ['node', 'icu', 'tz', 'cldr', 'unicode']) assert.throws(() => checkTimezoneRuntime({ ...process.versions, [key]: 'changed' }, process.config.variables, {}, []), /timezone_runtime/);
    assert.throws(() => checkTimezoneRuntime(process.versions, { ...process.config.variables, icu_small: true }, {}, []), /timezone_runtime/);
    for (const name of ['NODE_ICU_DATA', 'NODE_OPTIONS', 'ICU_TIMEZONE_FILES_DIR']) assert.throws(() => checkTimezoneRuntime(process.versions, process.config.variables, { [name]: 'override' }, []), /timezone_runtime/);
    assert.throws(() => checkTimezoneRuntime(process.versions, process.config.variables, {}, ['--icu-data-dir=x']), /timezone_runtime/);
});
test('N02G:TIMEZONE-003 unsupported zone/calendar, invalid instant and local date overflow are rejected', () => {
    for (const [instant, zone, calendar] of [['2042-02-30T00:00:00Z', 'America/Sao_Paulo', 'proleptic_gregorian'],
        ['2042-06-15T00:00:00', 'America/Sao_Paulo', 'proleptic_gregorian'],
        ['2042-06-15T00:00:00Z', 'UTC', 'proleptic_gregorian'],
        ['2042-06-15T00:00:00Z', 'America/Sao_Paulo', 'implicit'],
        ['0001-01-01T00:00:00Z', 'America/Sao_Paulo', 'proleptic_gregorian']]) {
        assert.throws(() => civilDateInPinnedTimezone(instant, zone, calendar));
    }
});
