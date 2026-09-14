'use strict';

const { createHash } = require('node:crypto');
const { types } = require('node:util');
const { canonicalValue, freezeDeep } = require('../kernel/canonicalValue');
const admitted = new WeakMap();
const FORMAT = 'financasbot.provenance.artifact';
const MANIFEST_LIMIT = 256 * 1024;
const FILE_LIMIT = 8 * 1024 * 1024;
const TOTAL_LIMIT = 32 * 1024 * 1024;
const FILE_COUNT_LIMIT = 512;
const fail = code => { throw new Error(`artifact_${code}`); };
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function fields(value, keys) {
    if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('shape_invalid');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== keys.length || keys.some(key =>
        !Object.hasOwn(descriptors, key) || !Object.hasOwn(descriptors[key], 'value')
        || !descriptors[key].enumerable)) fail('shape_invalid');
    return keys.map(key => descriptors[key].value);
}

function list(value) {
    if (!value || typeof value !== 'object' || types.isProxy(value) || !Array.isArray(value)
        || Object.getPrototypeOf(value) !== Array.prototype) fail('shape_invalid');
    if (!value.length || value.length > FILE_COUNT_LIMIT) fail('inventory_mismatch');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== value.length + 1) fail('shape_invalid');
    const items = [];
    for (let i = 0; i < value.length; i++) {
        const item = descriptors[String(i)];
        if (!item || !Object.hasOwn(item, 'value') || !item.enumerable) fail('shape_invalid');
        items.push(item.value);
    }
    return items;
}

function pathKey(path) {
    if (typeof path !== 'string' || path.length > 512 || !path.split('/').every(part =>
        /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part) && !part.endsWith('.')
        && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) fail('path_invalid');
    return path.toLowerCase();
}

function checkedDigest(value) {
    if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) fail('digest_invalid');
    return value;
}

function captured(source, limit) {
    if (!source || typeof source !== 'object' || types.isProxy(source) || !Buffer.isBuffer(source)
        || Object.getPrototypeOf(source) !== Buffer.prototype) fail('bytes_invalid');
    // Never call a method obtained from the input Buffer itself.
    const length = Reflect.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')
        .get.call(source);
    if (length > limit) fail('size_limit');
    const copy = Buffer.alloc(length);
    // TypedArray-to-TypedArray set reads internal slots; Buffer.copy consults
    // shadowable metadata such as byteLength on the source Buffer.
    Uint8Array.prototype.set.call(copy, source);
    return copy;
}

function utf8(bytes) {
    const source = bytes.toString('utf8');
    if (!Buffer.from(source, 'utf8').equals(bytes)) fail('utf8_invalid');
    return source;
}

/**
 * Pure byte admission for a flat Merkle manifest, NOT a loader that executes JS.
 * expectedRoot must come from the reviewed registry/freeze through the trusted
 * host. Equality proves identity, not completeness/safety of the declared closure.
 * No filesystem, resolution, eval, guest callbacks or recorder writes occur here.
 */
function admitArtifact(input) {
    const [rawManifest, rawEntries, expectedRoot] = fields(input, ['manifestBytes', 'entries', 'expectedRoot']);
    checkedDigest(expectedRoot);
    const manifestBytes = captured(rawManifest, MANIFEST_LIMIT);
    const observedRoot = digest(manifestBytes);
    if (observedRoot !== expectedRoot) fail('root_mismatch');
    const source = utf8(manifestBytes);
    let manifest;
    try { manifest = JSON.parse(source); } catch { fail('manifest_invalid'); }
    const [format, version, kind, entry, rawFiles] = fields(manifest, ['format', 'version', 'kind', 'entry', 'files']);
    if (format !== FORMAT || version !== 1 || !['metric', 'proof', 'tcb'].includes(kind)) fail('manifest_invalid');
    pathKey(entry);
    const files = list(rawFiles);
    const expected = new Map(); const folded = new Set();
    let previous;
    for (const file of files) {
        const [path, mediaType, sha256] = fields(file, ['path', 'media_type', 'sha256']);
        const key = pathKey(path);
        if (folded.has(key)) fail('inventory_duplicate');
        folded.add(key);
        if (previous !== undefined && previous >= path) fail('manifest_noncanonical');
        previous = path;
        if (!((mediaType === 'text/javascript' && /\.js$/.test(path))
            || (mediaType === 'application/json' && /\.json$/.test(path)))) fail('media_type_invalid');
        expected.set(path, { path, media_type: mediaType, sha256: checkedDigest(sha256) });
    }
    if (expected.get(entry)?.media_type !== 'text/javascript') fail('entry_invalid');
    if (canonicalValue(manifest) !== source) fail('manifest_noncanonical');
    const entries = list(rawEntries);
    if (entries.length !== files.length) fail('inventory_mismatch');
    const capturedFiles = new Map(); let totalBytes = 0;
    for (const item of entries) {
        const [path, rawBytes] = fields(item, ['path', 'bytes']);
        pathKey(path);
        if (!expected.has(path)) fail('inventory_mismatch');
        if (capturedFiles.has(path)) fail('inventory_duplicate');
        const bytes = captured(rawBytes, FILE_LIMIT);
        totalBytes += bytes.length;
        if (totalBytes > TOTAL_LIMIT) fail('size_limit');
        const observedHash = digest(bytes);
        if (observedHash !== expected.get(path).sha256) fail('digest_mismatch');
        capturedFiles.set(path, { path, media_type: expected.get(path).media_type,
            source: utf8(bytes), observed_sha256: observedHash });
    }
    const ordered = files.map(file => capturedFiles.get(file.path));
    const contents = freezeDeep({ kind, entry, files: ordered });
    const result = freezeDeep({ stage: 'admitted_artifact_bytes_only', executable: false,
        observed_root: observedRoot,
        measurements: ordered.map(file => ({ path: file.path, observed_sha256: file.observed_sha256 })) });
    admitted.set(result, contents);
    return result;
}

// TCB-only retrieval: a serialized or look-alike receipt is not admission.
function artifactContents(receipt) {
    if (!admitted.has(receipt)) fail('not_admitted');
    return admitted.get(receipt);
}

module.exports = { admitArtifact, artifactContents };
