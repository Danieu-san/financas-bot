'use strict';
const { parseDate, parseMonth } = require('./civilCalendar');
const fail = () => { throw new Error('literal_type_value'); };
function validateLiteral(literal) {
    if (!literal || typeof literal !== 'object' || Array.isArray(literal)
        || Object.keys(literal).length !== 2 || !Object.hasOwn(literal, 'type') || !Object.hasOwn(literal, 'value')) fail();
    const { type, value } = literal;
    if (type === 'integer' || type === 'money_minor') {
        if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail();
    } else if (type === 'boolean') {
        if (typeof value !== 'boolean') fail();
    } else {
        if (typeof value !== 'string') fail();
        if (type === 'date') parseDate(value);
        else if (type === 'month') parseMonth(value);
        else if (type === 'datetime') {
            const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
            if (!match) fail();
            parseDate(match[1]);
            if (+match[2] > 23 || +match[3] > 59 || +match[4] > 59
                || (match[5] !== undefined && (+match[5] > 23 || +match[6] > 59))) fail();
        } else if (type === 'digest') {
            if (!/^sha256:[a-f0-9]{64}$/.test(value)) fail();
        } else if (type === 'id') {
            if (!/^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$/.test(value)) fail();
        } else if (type === 'kind') {
            if (!/^[a-z][a-z0-9_]*$/.test(value)) fail();
        } else if (type === 'enum') {
            if (!value.length) fail();
        } else if (type !== 'text') fail();
    }
    return type;
}
module.exports = { validateLiteral };
