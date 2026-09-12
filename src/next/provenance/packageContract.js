'use strict';

const { createHash } = require('node:crypto');
const admittedPackages = new WeakSet();

function fail(code) {
    throw new Error(`package_${code}`);
}

function record(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('shape_invalid');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== keys.length
        || keys.some(key => !Object.hasOwn(descriptors, key)
            || !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable)) {
        fail('shape_invalid');
    }
    return keys.map(key => descriptors[key].value);
}

function pathKey(path) {
    if (typeof path !== 'string' || path.length > 512
        || !path.split('/').every(part => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part)
            && !part.endsWith('.'))) fail('path_invalid');
    return path.toLowerCase();
}

function freeze(value) {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value)) freeze(child);
        Object.freeze(value);
    }
    return value;
}

/**
 * Content admission only, not schema/proof validation or execution authority.
 * The host supplies an independently reviewed authority inventory. Supplying a
 * self-generated inventory does not establish that review; this function never
 * loads files, resolves URLs, or derives expected digests from candidate bytes.
 */
function admitPackage(input) {
    const [entries, authority] = record(input, ['entries', 'authority']);
    if (!Array.isArray(entries) || !Array.isArray(authority) || !authority.length
        || entries.length !== authority.length) fail('inventory_mismatch');

    const expected = new Map();
    const folded = new Set();
    for (const item of authority) {
        const [path, sha256] = record(item, ['path', 'sha256']);
        const key = pathKey(path);
        if (folded.has(key)) fail('inventory_duplicate');
        if (typeof sha256 !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(sha256)) fail('digest_invalid');
        folded.add(key);
        expected.set(path, sha256);
    }

    const seen = new Set();
    const documents = [];
    for (const item of entries) {
        const [path, source] = record(item, ['path', 'bytes']);
        pathKey(path);
        if (seen.has(path)) fail('inventory_duplicate');
        if (!expected.has(path)) fail('inventory_mismatch');
        if (!Buffer.isBuffer(source)) fail('bytes_invalid');
        seen.add(path);
        // Snapshot before measurement; caller cannot mutate admitted contents later.
        const bytes = Buffer.from(source);
        const sha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
        if (sha256 !== expected.get(path)) fail('digest_mismatch');
        const text = bytes.toString('utf8');
        if (!Buffer.from(text, 'utf8').equals(bytes)) fail('utf8_invalid');
        let value;
        try { value = JSON.parse(text); } catch { fail('json_invalid'); }
        if (!value || typeof value !== 'object' || Array.isArray(value)) fail('json_invalid');
        documents.push({ path, sha256, value });
    }
    documents.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    const result = freeze({ stage: 'admitted_bytes_only', documents });
    admittedPackages.add(result);
    return result;
}

function admittedDocuments(value) {
    if (!admittedPackages.has(value)) fail('not_admitted');
    return value.documents;
}

module.exports = { admitPackage, admittedDocuments };
