'use strict';
const process = require('node:process');
const { dayOrdinal, parseDate } = require('./civilCalendar');
const { validateLiteral } = require('./literalTypes');
const { copyData } = require('./observationContract');
const { EXECUTION_PROFILE } = require('./executionProfile');
const PIN = Object.freeze({ node: EXECUTION_PROFILE.node_version, ...EXECUTION_PROFILE.native_timezone });
const fail = () => { throw new Error('timezone_runtime_invalid'); };
const DateTimeFormat = Intl.DateTimeFormat;
const formatToParts = Intl.DateTimeFormat.prototype.formatToParts;

// TCB-only adapter. Native ICU is part of the explicitly pinned runtime, not
// an ambient guest capability. The final launcher must ALSO verify runtime
// binary identity; version labels alone do not authenticate a modified binary.
function checkTimezoneRuntime(versions, config, environment, argv) {
    for (const [key, expected] of Object.entries(PIN)) if (versions[key] !== expected) fail();
    if (config.icu_small !== false || config.icu_gyp_path !== 'tools/icu/icu-generic.gyp') fail();
    for (const key of ['NODE_ICU_DATA', 'ICU_TIMEZONE_FILES_DIR', 'NODE_OPTIONS']) if (environment[key]) fail();
    if (!Array.isArray(argv) || argv.some(arg => typeof arg !== 'string' || arg.startsWith('--icu-data-dir'))) fail();
    return true;
}
function civilDateInPinnedTimezone(rawInstant, rawZone, rawCalendar) {
    const [instant, zone, calendar] = copyData([rawInstant, rawZone, rawCalendar]);
    validateLiteral({ type: 'datetime', value: instant });
    if (zone !== 'America/Sao_Paulo' || calendar !== 'proleptic_gregorian') fail();
    checkTimezoneRuntime(process.versions, process.config.variables, process.env, process.execArgv);
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(instant);
    const offset = match[6] === 'Z' ? 0 : (match[7] === '+' ? 1 : -1) * (Number(match[8]) * 60 + Number(match[9]));
    // Floor fractions to the containing millisecond, including before epoch.
    // Civil boundaries and tzdb transitions occur on integral seconds; this
    // preserves the side of every boundary without Date.parse/coercion/clock.
    const seconds = (dayOrdinal(match[1]) - dayOrdinal('1970-01-01')) * 86400
        + Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4]) - offset * 60;
    const millis = seconds * 1000 + Number((match[5] || '').padEnd(3, '0').slice(0, 3));
    if (!Number.isSafeInteger(millis)) fail();
    const formatter = new DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
        timeZone: zone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit', era: 'short'
    });
    const fields = {};
    for (const part of formatToParts.call(formatter, millis)) {
        if (!['year', 'month', 'day', 'era'].includes(part.type)) continue;
        if (Object.hasOwn(fields, part.type)) fail(); fields[part.type] = part.value;
    }
    if (fields.era !== 'AD' || !/^\d{1,4}$/.test(fields.year) || !/^\d{2}$/.test(fields.month) || !/^\d{2}$/.test(fields.day)) fail();
    const result = `${fields.year.padStart(4, '0')}-${fields.month}-${fields.day}`;
    parseDate(result); return result;
}

module.exports = { civilDateInPinnedTimezone, checkTimezoneRuntime };
