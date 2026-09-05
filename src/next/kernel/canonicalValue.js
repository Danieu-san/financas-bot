'use strict';

const { createHash } = require('node:crypto');

// Adapted from the v1 projector's stableStringify. Unlike its input path,
// this accepts only plain JSON and safe integers; it never coerces money.
function canonicalValue(value, ancestors = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0)) return String(value);
    if (!value || typeof value !== 'object' || ancestors.has(value)) throw new Error('canonical_json_invalid');
    const array = Array.isArray(value);
    if (!array && Object.getPrototypeOf(value) !== Object.prototype) throw new Error('canonical_json_invalid');
    if (Object.getOwnPropertySymbols(value).length) throw new Error('canonical_json_invalid');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const [key, descriptor] of Object.entries(descriptors)) {
        if (array && key === 'length') continue;
        if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value') ||
            ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('canonical_json_invalid');
    }
    ancestors.add(value);
    let output;
    if (array) {
        if (Object.keys(value).length !== value.length ||
            Object.keys(value).some((key, index) => key !== String(index))) throw new Error('canonical_json_invalid');
        output = '[' + value.map(item => canonicalValue(item, ancestors)).join(',') + ']';
    } else {
        output = '{' + Object.keys(value).sort().map(key =>
            JSON.stringify(key) + ':' + canonicalValue(value[key], ancestors)).join(',') + '}';
    }
    ancestors.delete(value);
    return output;
}

function digest(value) {
    return createHash('sha256').update(canonicalValue(value)).digest('hex');
}

function freezeDeep(value) {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value)) freezeDeep(child);
        Object.freeze(value);
    }
    return value;
}

module.exports = { canonicalValue, digest, freezeDeep };
