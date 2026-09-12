'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateLiteral } = require('../../../src/next/provenance/literalTypes');
test('N02G:LITERAL-001 labels cannot override actual primitive type or civil validity', () => {
    for (const literal of [{ type: 'date', value: 1 }, { type: 'date', value: '2042-02-30' },
        { type: 'month', value: '2042-13' }, { type: 'integer', value: '1' }, { type: 'integer', value: -0 },
        { type: 'integer', value: Number.MAX_SAFE_INTEGER + 1 }, { type: 'boolean', value: 1 },
        { type: 'enum', value: false }, { type: 'digest', value: 'sha256:abc' },
        { type: 'datetime', value: '2042-06-01T12:00:00' }, { type: 'datetime', value: '2042-02-30T12:00:00Z' },
        { type: 'id', value: 'a'.repeat(161) }]) {
        assert.throws(() => validateLiteral(literal), /literal_|civil_/);
    }
    for (const literal of [{ type: 'date', value: '2042-06-16' }, { type: 'month', value: '2042-06' },
        { type: 'integer', value: -1 }, { type: 'money_minor', value: 0 }, { type: 'boolean', value: false },
        { type: 'enum', value: 'confirmed' }, { type: 'datetime', value: '2042-06-15T23:59:59-03:00' },
        { type: 'id', value: 'synthetic:source/part@v1' }, { type: 'id', value: 'a'.repeat(160) }]) {
        assert.equal(validateLiteral(literal), literal.type);
    }
});
