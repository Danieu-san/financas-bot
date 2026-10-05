'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const reviewed = require('../src/next/kernel/canonicalValue');
const pure = require('../src/next/kernel/canonicalJson');

test('reviewed canonical codec retains its immutable source and no pending dependency', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/next/kernel/canonicalValue.js'), 'utf8').replaceAll('\r\n', '\n');
    assert.equal(createHash('sha256').update(source).digest('hex'),
        'f6d571ddc1c7917f6a0ec8e25b17368c3e23ba10111ea5aa591c692d6739205b');
    assert.equal(source.includes('canonicalJson'), false);
    const guest = fs.readFileSync(path.join(__dirname, '../src/next/kernel/canonicalJson.js'), 'utf8');
    assert.equal(require('../scripts/runExhaustiveRuntimeInventory').scanImports(guest).imports.length, 0);
});

test('pure proof codec agrees with reviewed JSON semantics without crossing its source boundary', () => {
    const values = [null, true, false, '', 'ç😀', 0, 1, -1, Number.MAX_SAFE_INTEGER, [], {}];
    for (let i = 0; i < 40; i++) values.push({ z: [i, null, { b: 'v' + i, a: -i || 0 }], a: i });
    for (const value of values) {
        const expected = reviewed.canonicalValue(value);
        assert.equal(pure.canonicalValue(value), expected);
        assert.equal(pure.canonicalValue(JSON.parse(expected)), expected);
        const left = structuredClone(value), right = structuredClone(value);
        assert.deepEqual(pure.freezeDeep(left), reviewed.freezeDeep(right));
        if (left && typeof left === 'object') {
            assert.equal(Object.isFrozen(left), true);
            for (const child of Object.values(left)) if (child && typeof child === 'object') assert.equal(Object.isFrozen(child), true);
        }
    }
    const cyclic = {}; cyclic.self = cyclic;
    const accessor = {}; Object.defineProperty(accessor, 'x', { enumerable: true, get() { throw new Error('getter_executed'); } });
    const hidden = {}; Object.defineProperty(hidden, 'x', { value: 1 });
    const invalid = [undefined, -0, NaN, Infinity, 0.1, 2n, () => {}, new Date(), cyclic, accessor, hidden,
        Object.create(null), [1, , 3], { [Symbol('x')]: 1 }, JSON.parse('{"__proto__":1}')];
    for (const value of invalid) for (const codec of [reviewed, pure])
        assert.throws(() => codec.canonicalValue(value), /^Error: canonical_json_invalid$/);
});
