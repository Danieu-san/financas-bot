(function(nativeRequire) {
'use strict';
// closed-commonjs-bundle-v1
const factories = [function(require, module, exports, __dirname, __filename) {
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

},
function(require, module, exports, __dirname, __filename) {
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

},
function(require, module, exports, __dirname, __filename) {
'use strict';

const { createHash } = require('node:crypto');
const { types } = require('node:util');
const { canonicalValue } = require('../kernel/canonicalValue');
const { copyData } = require('./observationContract');
const { admitArtifact, artifactContents } = require('./artifactLoader');
const admitted = new WeakMap();
const fail = code => { throw new Error(`execution_freeze_${code}`); };
const sha = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...expected].sort().join(',');
function own(raw, names) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== names.length || names.some(name =>
        !d[name]?.enumerable || !Object.hasOwn(d[name], 'value'))) fail('input');
    return Object.fromEntries(names.map(name => [name, d[name].value]));
}
function capture(bytes) {
    if (!bytes || types.isProxy(bytes) || !Buffer.isBuffer(bytes)
        || Object.getPrototypeOf(bytes) !== Buffer.prototype) fail('bytes');
    const size = Reflect.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength').get.call(bytes);
    if (!size || size > 256 * 1024) fail('size');
    const result = Buffer.alloc(size); Uint8Array.prototype.set.call(result, bytes); return result;
}
function plain(value) {
    if (Array.isArray(value)) return value.map(plain);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
    return value;
}
function pathValid(path) {
    return typeof path === 'string' && path.length <= 512 && path.split('/').every(part =>
        /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part) && !part.endsWith('.')
        && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part));
}

// Trusted bootstrap supplies expectedHash from an independently reviewed
// immutable freeze. There is deliberately no API to calculate that expectation
// from the artifacts being admitted. This receipt is byte authority only: it
// does not authenticate its caller, certify closure completeness or accept R.
function admitExecutionFreeze(raw) {
    const { bytes: rawBytes, expectedHash } = own(raw, ['bytes', 'expectedHash']);
    if (!sha(expectedHash)) fail('expected_hash');
    const bytes = capture(rawBytes);
    if (hash(bytes) !== expectedHash) fail('hash');
    const source = bytes.toString('utf8');
    if (!Buffer.from(source, 'utf8').equals(bytes)) fail('utf8');
    let value;
    try { value = plain(copyData(JSON.parse(source))); } catch { fail('json'); }
    if (canonicalValue(value) !== source) fail('canonical');
    if (!keys(value, ['schema_version', 'freeze_id', 'freeze_version', 'stage', 'metric_registry_hash',
        'validation_tcb_root', 'child_capsule_root', 'native_runtime', 'package_authority', 'proof_programs'])
        || value.schema_version !== 1 || value.freeze_id !== 'provenance_execution'
        || !Number.isSafeInteger(value.freeze_version) || value.freeze_version < 1
        || value.stage !== 'execution' || !sha(value.metric_registry_hash)
        || !sha(value.validation_tcb_root) || !sha(value.child_capsule_root)) fail('shape');
    const native = value.native_runtime;
    if (!keys(native, ['platform', 'arch', 'node_version', 'node_binary_sha256'])
        || !['win32', 'linux', 'darwin'].includes(native.platform)
        || !['x64', 'arm64'].includes(native.arch) || !/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(native.node_version)
        || !sha(native.node_binary_sha256)) fail('native_runtime');
    if (!Array.isArray(value.package_authority) || !value.package_authority.length
        || value.package_authority.length > 128) fail('package_inventory');
    let previous = ''; const folded = new Set();
    for (const row of value.package_authority) {
        if (!keys(row, ['path', 'sha256']) || !pathValid(row.path) || !sha(row.sha256)
            || row.path <= previous || folded.has(row.path.toLowerCase())) fail('package_inventory');
        previous = row.path; folded.add(row.path.toLowerCase());
    }
    if (!Array.isArray(value.proof_programs) || !value.proof_programs.length || value.proof_programs.length > 76) fail('proof_inventory');
    previous = ''; const programs = new Map();
    for (const row of value.proof_programs) {
        if (!keys(row, ['program_id', 'proof_engine_artifact_root']) || !sha(row.program_id)
            || !sha(row.proof_engine_artifact_root) || row.program_id <= previous) fail('proof_inventory');
        previous = row.program_id; programs.set(row.program_id, row.proof_engine_artifact_root);
    }
    const immutable = copyData(value);
    const receipt = Object.freeze({ stage: 'admitted_execution_freeze_bytes_only', observed_hash: expectedHash,
        financial_acceptance: false });
    admitted.set(receipt, { value: immutable, programs }); return receipt;
}
function freezeContents(receipt) {
    const record = admitted.get(receipt); if (!record) fail('not_admitted'); return record.value;
}
function resolveFrozenProofRoot(receipt, programId) {
    const record = admitted.get(receipt); if (!record) fail('not_admitted');
    if (!sha(programId) || !record.programs.has(programId)) fail('proof_missing');
    return record.programs.get(programId);
}
function admitFrozenArtifact(raw) {
    const { freezeReceipt, kind, programId, manifestBytes, entries } = own(raw,
        ['freezeReceipt', 'kind', 'programId', 'manifestBytes', 'entries']);
    const authority = freezeContents(freezeReceipt);
    let expectedRoot;
    if (kind === 'proof') expectedRoot = resolveFrozenProofRoot(freezeReceipt, programId);
    else if (programId === null && kind === 'tcb') expectedRoot = authority.validation_tcb_root;
    else if (programId === null && kind === 'child') expectedRoot = authority.child_capsule_root;
    else fail('artifact_selector');
    const receipt = admitArtifact({ manifestBytes, entries, expectedRoot });
    if (artifactContents(receipt).kind !== (kind === 'child' ? 'tcb' : kind)) fail('artifact_kind');
    return receipt;
}
module.exports = { admitExecutionFreeze, freezeContents, resolveFrozenProofRoot, admitFrozenArtifact };

},
function(require, module, exports, __dirname, __filename) {
'use strict';
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { execPath, platform, arch, version } = require('node:process');
const { freezeContents } = require('./freezeContract');
const admitted = new WeakMap();
const fail = code => { throw new Error(`native_runtime_${code}`); };
function measure(expected) {
    if (expected.platform !== platform || expected.arch !== arch || expected.node_version !== version) fail('identity');
    let bytes;
    try { bytes = readFileSync(execPath); } catch { fail('unavailable'); }
    if (!bytes.length || bytes.length > 256 * 1024 * 1024) fail('size');
    const observed = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    if (observed !== expected.node_binary_sha256) fail('binary_mismatch');
    return observed;
}
// Only the current executable can be selected. No filesystem path, expected
// hash or environment hooks come from model/request data. Native Node/V8/OS
// remain the declared external trust boundary, not an OS sandbox or a defense
// against replacement by a compromised platform between measurement and launch.
function verifyNativeRuntime(freezeReceipt) {
    const expected = freezeContents(freezeReceipt).native_runtime;
    const observed = measure(expected);
    const receipt = Object.freeze({ stage: 'verified_native_runtime_only', observed_sha256: observed,
        financial_acceptance: false });
    admitted.set(receipt, expected); return receipt;
}
function verifiedNodeExecutable(receipt) {
    const expected = admitted.get(receipt); if (!expected) fail('not_admitted');
    measure(expected); return execPath;
}
function verifiedNativeRuntimeHash(receipt) {
    const expected = admitted.get(receipt); if (!expected) fail('not_admitted');
    return expected.node_binary_sha256;
}
// Launcher-to-captured-host capability, not the complete filesystem module.
// Only rereading the current native executable is allowed; no caller path,
// encoding option, directory, write or metadata API is exposed.
function nativeRuntimeFileCapability() {
    return Object.freeze({ readFileSync(path) {
        if (arguments.length !== 1 || path !== execPath) fail('path'); return readFileSync(execPath);
    } });
}
module.exports = { verifyNativeRuntime, verifiedNodeExecutable, verifiedNativeRuntimeHash, nativeRuntimeFileCapability };

},
function(require, module, exports, __dirname, __filename) {
'use strict';
const { digest } = require('../kernel/canonicalValue');
const { types } = require('node:util');
const fail = () => { throw new Error('observation_shape_invalid'); };
const { identifier, field, scalar } = require('./observationScalars');

// Copy only bounded data descriptors, never getters, proxies or coercions.
// This is transport/shape admission, not a financial schema validator.
function copyData(input) {
    let nodes = 0; let characters = 0; const ancestors = new Set();
    function copy(value, depth) {
        if (++nodes > 65536 || depth > 32) fail();
        if (scalar(value)) {
            if (typeof value === 'string' && (characters += value.length) > 1048576) fail();
            return value;
        }
        if (!value || typeof value !== 'object' || types.isProxy(value) || ancestors.has(value)) fail();
        const array = Array.isArray(value);
        if (array ? Object.getPrototypeOf(value) !== Array.prototype
            : ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail();
        const descriptors = Object.getOwnPropertyDescriptors(value);
        const keys = Reflect.ownKeys(descriptors);
        if (keys.length > 65536 || keys.some(k => typeof k !== 'string')) fail();
        ancestors.add(value);
        let result;
        if (array) {
            const length = descriptors.length.value;
            if (keys.length !== length + 1) fail();
            result = [];
            for (let i = 0; i < length; i++) {
                const d = descriptors[String(i)];
                if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) fail();
                result.push(copy(d.value, depth + 1));
            }
        } else {
            result = Object.create(null);
            for (const key of keys) {
                const d = descriptors[key];
                if (!field(key) || !d.enumerable || !Object.hasOwn(d, 'value')) fail();
                result[key] = copy(d.value, depth + 1);
            }
        }
        ancestors.delete(value);
        return Object.freeze(result);
    }
    return copy(input, 0);
}

function decodeObservation(raw) {
    const e = copyData(raw);
    if (!Array.isArray(e) || e.length !== 7 || e[0] !== 'I' || !identifier(e[2]) || !identifier(e[3])
        || !Array.isArray(e[4]) || e[4].length > 32
        || e[4].some(p => !field(p) && !(Number.isSafeInteger(p) && p >= 0))
        || !['data', 'keys', 'operand_set', 'operand_selection', 'node_identity'].includes(e[5]) || !Array.isArray(e[6])) fail();
    const o = e[6]; const tag = o[0];
    if (e[5] === 'node_identity' && e[1] !== 'identity') fail();
    const selectedView = e[5] === 'operand_selection';
    const nodeSet = e[5] === 'operand_set' || selectedView;
    const viewId = value => typeof value === 'string' && /^view_[a-f0-9]{64}$/.test(value);
    if (selectedView && !viewId(e[4][0])) fail();
    const setPath = selectedView ? e[4].slice(1) : e[4];
    if (nodeSet && (e[2] !== `operand/${e[3]}`
        || !['length', 'includes', 'at', 'iterate', 'next', 'return', 'reuse_iterator',
            'select_start', 'select_member', 'select_return'].includes(e[1])
        || (['at', 'next', 'select_member'].includes(e[1])
            ? setPath.length !== 1 || !Number.isSafeInteger(setPath[0]) || setPath[0] < 0 || Object.is(setPath[0], -0)
            : setPath.length !== 0))) fail();
    const valueOutcome = tag === 'scalar' && o.length === 2 && scalar(o[1])
        || tag === 'container' && o.length === 2 && ['record', 'sequence'].includes(o[1]);
    const accessOutcome = nodeSet ? tag === 'node' && o.length === 2 && identifier(o[1]) : valueOutcome;
    let valid = false;
    switch (e[1]) {
    case 'civil_date': valid = e[5] === 'data' && e[4].length >= 1
        && tag === 'civil' && o.length === 5 && o.slice(1).every(v => typeof v === 'string')
        && o[2] === 'America/Sao_Paulo' && o[3] === 'proleptic_gregorian'
        && /^\d{4}-\d{2}-\d{2}$/.test(o[4]); break;
    case 'identity': {
        const key = e[4][0];
        valid = e[5] === 'node_identity' && e[4].length === 1 && tag === 'scalar' && o.length === 2 && typeof o[1] === 'string'
            && (key === 'kind' ? /^[a-z][a-z0-9_]*$/.test(o[1]) : key === 'version' ? /^sha256:[a-f0-9]{64}$/.test(o[1])
                : key === 'ref_id' && /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$/.test(o[1]));
        break;
    }
    case 'traverse': valid = e[5] === 'data' && e[4].length === 1 && field(e[4][0])
        && tag === 'edge' && o.length === 3 && identifier(o[1]) && identifier(o[2]); break;
    case 'get': case 'at': valid = accessOutcome || tag === 'absent' && o.length === 1; break;
    case 'next': valid = accessOutcome || tag === 'done' && o.length === 1; break;
    case 'has': valid = tag === 'boolean' && o.length === 2 && typeof o[1] === 'boolean'; break;
    case 'keys': valid = tag === 'keys' && o.slice(1).every(k => typeof k === 'string'); break;
    case 'length': valid = tag === 'count' && o.length === 2 && Number.isSafeInteger(o[1]) && o[1] >= 0; break;
    case 'includes': valid = tag === 'membership' && o.length === 3
        && (nodeSet ? identifier(o[1]) : scalar(o[1])) && typeof o[2] === 'boolean'; break;
    case 'iterate': valid = tag === 'opened' && o.length === 1; break;
    case 'return': valid = tag === 'closed' && o.length === 2 && Number.isSafeInteger(o[1]) && o[1] >= 0; break;
    case 'reuse_iterator': valid = tag === 'cursor' && o.length === 3 && Number.isSafeInteger(o[1])
        && o[1] >= 0 && typeof o[2] === 'boolean'; break;
    case 'select_start': valid = nodeSet && tag === 'selection_opened' && o.length === 1; break;
    case 'select_member': valid = nodeSet && tag === 'decision' && o.length === 3
        && identifier(o[1]) && typeof o[2] === 'boolean'; break;
    case 'select_return': valid = nodeSet && tag === 'selected' && o.length >= 2 && o.length <= 514 && viewId(o[1])
        && o.slice(2).every(identifier) && new Set(o.slice(2)).size === o.length - 2
        && o[1] === `view_${digest({ role: e[3], aliases: o.slice(2) })}`; break;
    default: fail();
    }
    if (!valid) fail();
    // Remain in channel I. Only the recorder chooses field names in L/T.
    return e;
}

function decodeMeasurement(raw) {
    const e = copyData(raw);
    if (!Array.isArray(e) || e.length !== 3 || e[0] !== 'M'
        || !['evaluator_artifact_root', 'evaluator_contract_hash', 'validation_tcb_root', 'proof_engine_artifact_root'].includes(e[1])
        || typeof e[2] !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(e[2])) fail();
    return e;
}

module.exports = { copyData, identifier, field, scalar, decodeObservation, decodeMeasurement };

},
function(require, module, exports, __dirname, __filename) {
'use strict';
// Shared pure scalar grammar; no native APIs or transport authority.
const identifier = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:#/-]{0,127}$/.test(v);
const field = v => typeof v === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(v)
    && !['__proto__', 'constructor', 'prototype'].includes(v);
const scalar = v => v === null || typeof v === 'boolean' || typeof v === 'string' && v.length <= 65536
    || typeof v === 'number' && Number.isSafeInteger(v) && !Object.is(v, -0);
module.exports = { identifier, field, scalar };

},
function(require, module, exports, __dirname, __filename) {
'use strict';
const { createHash } = require('node:crypto');
const { canonicalValue, freezeDeep } = require('../kernel/canonicalValue');
const { copyData } = require('./observationContract');
const { artifactContents } = require('./artifactLoader');
const { types } = require('node:util');
const fail = code => { throw new Error('selected_day_ticket_' + code); };
const hash = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const dataHash = value => hash(canonicalValue(value));
const isHash = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
function keys(value, names) {
    if (!value || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...names].sort().join(',')) fail('shape');
}
function decode(source) {
    if (typeof source !== 'string' || Buffer.byteLength(source) > 1048576) fail('size');
    let data; try { data = structuredClone(copyData(JSON.parse(source))); } catch { fail('data'); }
    if (canonicalValue(data) !== source) fail('canonical');
    return data;
}
function own(raw, names) {
    if (!raw || types.isProxy(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== names.length || names.some(name => !d[name]?.enumerable || !Object.hasOwn(d[name], 'value'))) fail('input');
    return Object.fromEntries(names.map(name => [name, d[name].value]));
}
// This is structural verification of the hash-bound BUILD inventory, not a
// source re-parser or an independent execution of its trusted build platform.
function validateSelectedEventDayBuildRecipe(source) {
    const build = decode(source);
    keys(build, ['schema_version', 'boundary', 'entrypoints', 'sources', 'imports',
        'module_inventory_complete', 'independent_BUILD_execution']);
    if (build.schema_version !== 1 || build.boundary !== 'trusted_BUILD_platform_current_sources_not_independent_execution'
        || build.module_inventory_complete !== true || build.independent_BUILD_execution !== false
        || !Array.isArray(build.sources) || !build.sources.length || build.sources.length > 514
        || !Array.isArray(build.imports) || !Array.isArray(build.entrypoints) || !build.entrypoints.length) fail('build');
    const paths = new Set(); let previous;
    for (const row of build.sources) {
        keys(row, ['path', 'sha256']);
        if (typeof row.path !== 'string' || !isHash(row.sha256) || previous !== undefined && previous >= row.path) fail('build');
        previous = row.path; paths.add(row.path);
    }
    if (canonicalValue(build.entrypoints) !== canonicalValue([...new Set(build.entrypoints)].sort())
        || build.entrypoints.some(entry => !paths.has(entry))) fail('build');
    const links = new Map(); previous = undefined;
    for (const row of build.imports) {
        keys(row, ['source', 'specifier', 'target']);
        const key = canonicalValue(row);
        if (!paths.has(row.source) || typeof row.specifier !== 'string' || typeof row.target !== 'string'
            || !paths.has(row.target) && !/^node:[a-z_]+(?:\/[a-z_]+)*$/.test(row.target)
            || previous !== undefined && previous >= key) fail('build');
        previous = key;
        if (!links.has(row.source)) links.set(row.source, []);
        if (paths.has(row.target)) links.get(row.source).push(row.target);
    }
    const visited = new Set(), queue = [...build.entrypoints];
    while (queue.length) {
        const entry = queue.shift(); if (visited.has(entry)) continue;
        visited.add(entry); queue.push(...(links.get(entry) ?? []));
    }
    if ([...paths].some(file => !visited.has(file) && !['package.json', 'package-lock.json'].includes(file))) fail('build');
    return freezeDeep(build);
}
// Admission after exact outer negative artifact identity, before handles.
// This validates a candidate ticket, not reviewed source authority, independent
// BUILD execution, witness credit, receipt or a positive financial package.
function admitSelectedEventDayExecutionTicket(raw) {
    const input = own(raw, ['source', 'expectedHash', 'packet', 'compiler', 'artifactReceipt', 'nativeRuntime', 'recipe']);
    const { source, expectedHash } = input;
    if (typeof source !== 'string' || !isHash(expectedHash)) fail('identity');
    const packet = structuredClone(copyData(input.packet)), compiler = structuredClone(copyData(input.compiler));
    const nativeRuntime = structuredClone(copyData(input.nativeRuntime)), recipe = structuredClone(copyData(input.recipe));
    const { files } = artifactContents(input.artifactReceipt);
    const ticketFile = files.find(file => file.path === 'selected-day-ticket.json');
    if (hash(source) !== expectedHash || !ticketFile || ticketFile.observed_sha256 !== expectedHash
        || ticketFile.source !== source) fail('identity');
    const ticket = decode(source);
    keys(ticket, ['schema_version', 'profile_id', 'normative_commit', 'quarantine_origin', 'precommit_hash',
        'packet_sha256', 'program_artifact_root', 'program_sha256', 'dispatch_artifact_root', 'metric_artifact_root',
        'metric_contract_sha256', 'compiler_artifact_root', 'build_recipe_sha256', 'authorship', 'worlds',
        'program_conformance', 'executable_leaves', 'native_runtime', 'profile_witness_qualified',
        'semantic_mutation_credit', 'financial_release_eligible']);
    keys(ticket.authorship, ['precommit', 'plan', 'patch', 'worlds']);
    if (!ticket.authorship.precommit || Array.isArray(ticket.authorship.precommit)) fail('precommit');
    if (ticket.schema_version !== 1 || ticket.profile_id !== packet.profile_id || ticket.normative_commit !== packet.normative_commit
        || ticket.quarantine_origin !== 'negative_qualification' || ticket.profile_witness_qualified !== false
        || ticket.semantic_mutation_credit !== 0 || ticket.financial_release_eligible !== false
        || ticket.precommit_hash !== packet.precommit_hash || dataHash(ticket.authorship.precommit) !== packet.precommit_hash
        || ticket.program_sha256 !== packet.program_sha256 || ticket.compiler_artifact_root !== compiler.compiler_artifact_root
        || canonicalValue(ticket.native_runtime) !== canonicalValue(nativeRuntime)
        || ticket.packet_sha256 !== hash(recipe.packet_source)
        || ['program_artifact_root', 'metric_artifact_root', 'dispatch_artifact_root', 'metric_contract_sha256']
            .some(name => ticket[name] !== recipe[name])) fail('identity');
    for (const name of ['packet_sha256', 'program_artifact_root', 'program_sha256', 'dispatch_artifact_root',
        'metric_artifact_root', 'metric_contract_sha256', 'compiler_artifact_root', 'build_recipe_sha256'])
        if (!isHash(ticket[name])) fail('digest');
    const precommit = ticket.authorship.precommit;
    if (precommit.profile !== packet.profile_id || precommit.normative_commit !== packet.normative_commit
        || precommit.quarantine_origin !== ticket.quarantine_origin || precommit.dp_execution !== false
        || precommit.profile_witness_qualified !== false || precommit.semantic_mutation_credit !== 0
        || precommit.financial_release_eligible !== false || !Number.isSafeInteger(precommit.selected_candidate_index)
        || precommit.selected_candidate_index < 0 || ['candidate_order_hash', 'references_hash', 'world_hash', 'plan_hash', 'claims_hash']
            .some(name => !isHash(precommit[name]))) fail('precommit');
    keys(ticket.authorship.patch, ['location', 'before', 'after']);
    const plan = ticket.authorship.plan;
    if (dataHash(plan) !== precommit.plan_hash || plan.profile !== packet.profile_id
        || canonicalValue(ticket.authorship.patch.location) !== '["args",0,"field"]'
        || canonicalValue(ticket.authorship.patch.before) !== canonicalValue(plan.before)
        || canonicalValue(ticket.authorship.patch.after) !== canonicalValue(plan.after)
        || ['C', 'M', 'S'].some(variant => canonicalValue(plan.fringe[variant])
            !== canonicalValue(packet.variants[variant].plan.fringe))) fail('patch');
    const conformance = ticket.program_conformance;
    keys(conformance, ['expected_source_sha256', 'expected_ir_hashes', 'helper_sources', 'common_program_identity', 'dispatch_interface', 'executable_absence']);
    if (conformance.expected_source_sha256 !== packet.program_sha256 || conformance.common_program_identity !== true
        || conformance.dispatch_interface !== true || canonicalValue(conformance.helper_sources) !== canonicalValue(packet.helper_sources)) fail('program');
    const absence = conformance.executable_absence;
    keys(absence, ['schema_version', 'analysis', 'scope', 'program_sha256', 'selected_set', 'analysis_contract_sha256',
        'closed_guest_bundles', 'closed_factory_sources', 'closed_import_edges', 'discarded_selection_calls',
        'local_boolean_dispatches', 'selected_view_consumers', 'boolean_result_external_consumers',
        'executable_closure_absence_proved', 'profile_witness_qualified', 'semantic_mutation_credit', 'financial_release_eligible']);
    if (absence.schema_version !== 1 || absence.analysis !== 'closed_guest_selection_effects/v1'
        || absence.scope !== 'common_C_M_S_guest_and_finite_helpers_conjoined_with_whole_program_conformance'
        || absence.program_sha256 !== packet.program_sha256 || !isHash(absence.analysis_contract_sha256)
        || ['C', 'M', 'S'].some(v => absence.selected_set !== packet.variants[v].plan.selected_set)
        || absence.closed_guest_bundles !== 4 || absence.discarded_selection_calls !== 3
        || !Number.isSafeInteger(absence.closed_factory_sources) || absence.closed_factory_sources < 4
        || !Number.isSafeInteger(absence.closed_import_edges) || absence.closed_import_edges < 0
        || !Number.isSafeInteger(absence.local_boolean_dispatches) || absence.local_boolean_dispatches < 1
        || absence.selected_view_consumers !== 0 || absence.boolean_result_external_consumers !== 0
        || absence.executable_closure_absence_proved !== true || absence.profile_witness_qualified !== false
        || absence.semantic_mutation_credit !== 0 || absence.financial_release_eligible !== false) fail('executable_absence');
    // Structural verification of the captured external certificate, not an
    // independent analysis/replay at runtime. Its implementation bytes are
    // included in the closed BUILD recipe; outer negative identity is required.
    if (!Array.isArray(ticket.worlds) || ticket.worlds.map(row => row.variant).join(',') !== 'C,M,S'
        || !Array.isArray(ticket.authorship.worlds) || ticket.authorship.worlds.map(row => row.variant).join(',') !== 'C,M,S') fail('worlds');
    ticket.worlds.forEach((world, index) => {
        keys(world, ['variant', 'package_root', 'ir_sha256', 'compiler_artifact_root']);
        const authored = ticket.authorship.worlds[index]; keys(authored, ['variant', 'expected_ir_hash', 'authority']);
        if (canonicalValue(world) !== canonicalValue(compiler.worlds[index]) || !Array.isArray(authored.authority)
            || !authored.authority.length || dataHash(authored.authority) !== world.package_root
            || authored.expected_ir_hash !== packet.variants[world.variant].expected_ir_hash
            || world.ir_sha256 !== authored.expected_ir_hash || conformance.expected_ir_hashes[world.variant] !== authored.expected_ir_hash) fail('world');
        let previous;
        for (const row of authored.authority) {
            keys(row, ['path', 'sha256']);
            if (typeof row.path !== 'string' || !isHash(row.sha256) || previous !== undefined && previous >= row.path) fail('authority');
            previous = row.path;
        }
    });
    const leaves = ['selected-day-adjudicator.js', 'selected-day-launcher.js', 'selected-day-proof-child.js', 'selected-day-proof-host.js'];
    if (!Array.isArray(ticket.executable_leaves) || ticket.executable_leaves.map(row => row.path).join(',') !== leaves.join(',')) fail('closure');
    for (const row of ticket.executable_leaves) {
        keys(row, ['path', 'sha256']);
        if (!isHash(row.sha256) || files.find(file => file.path === row.path)?.observed_sha256 !== row.sha256) fail('closure');
    }
    const recipeFile = files.find(file => file.path === 'selected-day-build-recipe.json');
    if (!recipeFile || recipeFile.observed_sha256 !== ticket.build_recipe_sha256) fail('build');
    validateSelectedEventDayBuildRecipe(recipeFile.source);
    return freezeDeep({ stage: 'selected_day_private_execution_ticket_candidate_only', observed_sha256: expectedHash,
        execution_ticket_candidate_complete: true, profile_witness_qualified: false,
        semantic_mutation_credit: 0, financial_release_eligible: false });
}
module.exports = { admitSelectedEventDayExecutionTicket, validateSelectedEventDayBuildRecipe };

},
function(require, module, exports, __dirname, __filename) {
'use strict';
const { runInThisContext } = require('node:vm');
const { types } = require('node:util');
const { canonicalValue, freezeDeep } = require('../kernel/canonicalValue');
const { copyData, identifier } = require('./observationContract');
const { admitExecutionFreeze, admitFrozenArtifact } = require('./freezeContract');
const { artifactContents, admitArtifact } = require('./artifactLoader');
const { verifyNativeRuntime, verifiedNodeExecutable } = require('./nativeRuntime');
const { decodeSelectedEventDayPacket } = require('./selectedEventDayPacket');
const { admitSelectedEventDayExecutionTicket } = require('./selectedEventDayExecutionTicket');
const { freezeContents } = require('./freezeContract');
const natives = Object.freeze({ 'node:crypto': require('node:crypto'), 'node:util': require('node:util'),
    'node:process': require('node:process'), 'node:child_process': require('node:child_process') });
const fail = code => { throw new Error('selected_day_launcher_' + code); };
function own(raw, names) {
    if (!raw || types.isProxy(raw) || Array.isArray(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== names.length || names.some(name => !d[name]?.enumerable || !Object.hasOwn(d[name], 'value'))) fail('input');
    return Object.fromEntries(names.map(name => [name, d[name].value]));
}
// External precondition: identify this exact candidate leaf before evaluating
// it. The BUILD binding supplies the fixed negative freeze, never a request.
// Native Node/V8/OS is a declared trust boundary, not an OS isolation claim or
// protection against a compromised platform replacing the executable later.
function launch(raw) {
    const { freezeBytes, expectedFreezeHash, tcbArtifact } = own(raw, ['freezeBytes', 'expectedFreezeHash', 'tcbArtifact']);
    const freeze = admitExecutionFreeze({ bytes: freezeBytes, expectedHash: expectedFreezeHash });
    const artifact = own(tcbArtifact, ['manifestBytes', 'entries']);
    const artifactReceipt = admitFrozenArtifact({ freezeReceipt: freeze, kind: 'tcb', programId: null, ...artifact });
    const contents = artifactContents(artifactReceipt);
    const paths = ['selected-day-adjudicator.js', 'selected-day-build-recipe.json', 'selected-day-compiler-binding.json', 'selected-day-compiler-recipe.json',
        'selected-day-compiler.js', 'selected-day-launcher.js', 'selected-day-proof-child.js',
        'selected-day-proof-host.js', 'selected-day-recipe.json', 'selected-day-ticket.json'];
    if (contents.entry !== 'selected-day-launcher.js' || contents.files.map(file => file.path).join(',') !== paths.join(',')
        || contents.files.some(file => file.media_type !== (file.path.endsWith('.json') ? 'application/json' : 'text/javascript'))) fail('inventory');
    const source = name => contents.files.find(file => file.path === name).source;
    const recipe = freezeDeep(structuredClone(copyData(JSON.parse(source('selected-day-recipe.json')))));
    const packet = decodeSelectedEventDayPacket(recipe.packet_source);
    if (canonicalValue(recipe) !== source('selected-day-recipe.json') || recipe.quarantine_origin !== 'negative_qualification'
        || recipe.profile_id !== packet.profile_id || recipe.normative_commit !== packet.normative_commit
        || recipe.packet_sha256 !== contentsHash(recipe.packet_source)
        || recipe.profile_witness_qualified !== false || recipe.financial_release_eligible !== false) fail('quarantine');
    // Compiler bytes are the exact closed source that performed the private
    // BUILD compilation, not a runtime compiler replacement. Validate their
    // certificate/leaf linkage before any host handle; never execute a caller
    // compiler, import its financial tools or claim independent rerun here.
    const bindingSource = source('selected-day-compiler-binding.json');
    const binding = freezeDeep(structuredClone(copyData(JSON.parse(bindingSource))));
    if (canonicalValue(binding) !== bindingSource || contentsHash(bindingSource) !== recipe.compiler_binding_sha256
        || binding.compiler_artifact_root !== recipe.compiler_artifact_root
        || binding.precommit_hash !== packet.precommit_hash
        || binding.normal_compile_worlds !== 3 || binding.independent_compiler_execution !== false
        || binding.executable_ticket_complete !== false || binding.worlds.map(row => row.variant).join(',') !== 'C,M,S'
        || binding.worlds.some(row => row.compiler_artifact_root !== binding.compiler_artifact_root
            || row.ir_sha256 !== packet.variants[row.variant].expected_ir_hash)
        || binding.entries.length !== 2 || binding.entries.map(row => row.path).join(',') !== 'selected-day-compiler-recipe.json,selected-day-compiler.js'
        || binding.entries.some(row => row.sha256 !== contentsHash(source(row.path)))) fail('compiler_binding');
    admitArtifact({ manifestBytes: Buffer.from(binding.compiler_manifest), expectedRoot: binding.compiler_artifact_root,
        entries: binding.entries.map(row => ({ path: row.path, bytes: Buffer.from(source(row.path)) })) });
    const ticket = admitSelectedEventDayExecutionTicket({ source: source('selected-day-ticket.json'), expectedHash: recipe.ticket_sha256,
        packet, compiler: binding, artifactReceipt, nativeRuntime: freezeContents(freeze).native_runtime, recipe });
    for (const allowed of [recipe.host_native_externals, recipe.adjudicator_native_externals])
        if (!Array.isArray(allowed) || new Set(allowed).size !== allowed.length || allowed.some(name => !Object.hasOwn(natives, name))) fail('native_import');
    // Negative origin and all bytes admitted before loading a host factory or
    // returning any run handle. Remeasure the executable before each spawn.
    const native = verifyNativeRuntime(freeze);
    const load = (file, allowed) => runInThisContext(source(file))(name => {
        if (!allowed.includes(name)) fail('native_import'); return natives[name];
    });
    const host = load('selected-day-proof-host.js', recipe.host_native_externals);
    const adjudicate = load('selected-day-adjudicator.js', recipe.adjudicator_native_externals);
    if (typeof host !== 'function' || typeof adjudicate !== 'function') fail('entry');
    const used = new Set(), invocationIds = new Set(), records = Object.create(null);
    let executionId, poisoned = false, busy = false;
    return Object.freeze({ stage: 'captured_negative_launcher_only', financial_acceptance: false,
        async run(rawInvocation) {
            if (poisoned || busy) { poisoned = true; fail('poisoned'); }
            try {
                const { variant, scope: input, mode } = own(rawInvocation, ['variant', 'scope', 'mode']);
                const scope = structuredClone(copyData(own(input, ['executionId', 'invocationId'])));
                if (!['C', 'M', 'S'].includes(variant) || !['proof', 'graph'].includes(mode)
                    || !identifier(scope.executionId) || !identifier(scope.invocationId) || used.has(variant) || invocationIds.has(scope.invocationId)
                    || executionId !== undefined && executionId !== scope.executionId) fail('slot');
                executionId = scope.executionId; used.add(variant); invocationIds.add(scope.invocationId); busy = true;
                verifiedNodeExecutable(native);
                const result = await host({ variant, scope, mode });
                if (poisoned) fail('poisoned');
                const out = freezeDeep({ ...result, native_runtime_verified_before_handles: true,
                    execution_ticket_bound_before_handles: true, observed_execution_ticket_sha256: ticket.observed_sha256,
                    observed_native_runtime_sha256: native.observed_sha256 });
                records[variant] = { mode, result: out }; return out;
            } catch (error) { poisoned = true; throw error; } finally { busy = false; }
        },
        adjudicate() {
            if (arguments.length || poisoned || ['C', 'M', 'S'].some(v => records[v]?.mode !== 'graph')) fail('worlds');
            // No caller result/expected source can enter the captured adjudicator.
            return adjudicate({ results: Object.fromEntries(['C', 'M', 'S'].map(v => [v, records[v].result])) });
        } });
}
function contentsHash(source) {
    return 'sha256:' + natives['node:crypto'].createHash('sha256').update(source, 'utf8').digest('hex');
}
module.exports = { launch };

},
function(require, module, exports, __dirname, __filename) {
'use strict';
// Closed DATA codec only. Parsing/hash equality cannot grant private execution
// authority, normal graph acceptance, financial receipts or profile credit.
const { copyData, decodeObservation, identifier } = require('./observationContract');
const { canonicalValue, digest, freezeDeep } = require('../kernel/canonicalValue');
const PACKET_PATH = 'qualification/selected-event-day-path-v1.json';
const PROFILE = 'selected-event-day-path/v1';
const NORMATIVE_COMMIT = 'f1a8cd4629b245009b9dd8fbb8dce83da77ba3d4';
const fail = code => { throw new Error('selected_day_packet_' + code); };
const hash = value => 'sha256:' + digest(value);
const isHash = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
function keys(value, names) {
    if (!value || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...names].sort().join(',')) fail('shape');
}
function decodeSelectedEventDayPacket(source) {
    if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > 65536) fail('source');
    // Admit passive descriptors first, then materialize ordinary data records
    // for the existing canonical JSON contract (which excludes null prototypes).
    let data; try { data = structuredClone(copyData(JSON.parse(source))); } catch { fail('shape'); }
    keys(data, ['schema_version', 'profile_id', 'normative_commit', 'quarantine_origin', 'precommit_hash',
        'program_sha256', 'phase_sha256', 'registry_sha256', 'helper_sources', 'variants']);
    if (canonicalValue(data) !== source || data.schema_version !== 1 || data.profile_id !== PROFILE
        || data.normative_commit !== NORMATIVE_COMMIT || data.quarantine_origin !== 'negative_qualification'
        || [data.precommit_hash, data.program_sha256, data.phase_sha256, data.registry_sha256].some(v => !isHash(v))) fail('identity');
    keys(data.variants, ['C', 'M', 'S']);
    const paths = new Set();
    if (!Array.isArray(data.helper_sources) || !data.helper_sources.length || data.helper_sources.length > 64) fail('helpers');
    for (const helper of data.helper_sources) {
        keys(helper, ['path', 'sha256']);
        if (typeof helper.path !== 'string' || !/^(provenance|kernel)\/[A-Za-z][A-Za-z0-9]*\.js$/.test(helper.path)
            || paths.has(helper.path) || !isHash(helper.sha256)) fail('helpers');
        paths.add(helper.path);
    }
    for (const variant of ['C', 'M', 'S']) {
        const row = data.variants[variant]; keys(row, ['expected_ir_hash', 'plan_hash', 'plan']);
        if (!isHash(row.expected_ir_hash) || !isHash(row.plan_hash) || hash(row.plan) !== row.plan_hash) fail('plan_hash');
        const plan = row.plan;
        keys(plan, ['profile', 'variant', 'precommit_hash', 'expected_ir_hash', 'queue', 'fringe',
            'guard_count', 'candidate_set', 'selected_set']);
        if (plan.profile !== PROFILE || plan.variant !== variant || plan.precommit_hash !== data.precommit_hash
            || plan.expected_ir_hash !== row.expected_ir_hash || !Array.isArray(plan.fringe) || plan.fringe.length !== 4
            || !Array.isArray(plan.queue) || !plan.queue.length || plan.queue.length > 32768
            || !Number.isSafeInteger(plan.guard_count) || plan.guard_count < 1 || plan.guard_count >= plan.queue.length) fail('plan');
        if ([plan.candidate_set, plan.selected_set].some(n => typeof n !== 'string' || !/^[a-z][a-z0-9_]*$/.test(n))
            || plan.candidate_set === plan.selected_set) fail('selection');
        const sites = new Set(), targets = [];
        plan.queue.forEach((site, index) => {
            keys(site, ['site', 'predicate_id', 'selection_guard', 'target', 'truth']);
            const guard = index < plan.guard_count;
            if (!identifier(site.predicate_id) || site.selection_guard !== guard || typeof site.target !== 'boolean'
                || site.truth !== (site.target ? variant !== 'M' : true)
                || site.site !== (guard ? 'selection/0/candidate/0/guard/' : 'assertion/') + site.predicate_id
                || sites.has(site.site)) fail('site');
            sites.add(site.site); if (site.target) targets.push(site);
        });
        if (targets.length !== 2 || !targets[0].selection_guard || targets[1].selection_guard
            || targets[0].predicate_id !== targets[1].predicate_id) fail('target_sites');
        const tuples = plan.fringe.map((row, index) => {
            keys(row, ['site', 'operand', 'tuple']);
            const expectedSites = [targets[0].site, 'selection/0/member/0', 'selection/0/return', targets[1].site];
            if (row.site !== expectedSites[index] || row.operand !== ([0, null, null, 0][index])) fail('fringe_site');
            try { return decodeObservation(row.tuple); } catch { fail('fringe_tuple'); }
        });
        const role = 'proof/set/' + plan.candidate_set, operandAlias = 'operand/' + role;
        const member = tuples[1], returned = tuples[2];
        if (member[1] !== 'select_member' || member[2] !== operandAlias || member[3] !== role
            || canonicalValue(member[4]) !== '[0]' || member[5] !== 'operand_set'
            || member[6][2] !== (variant !== 'M')) fail('member');
        const aliases = variant === 'M' ? [] : [member[6][1]];
        const view = 'view_' + digest({ role, aliases });
        if (canonicalValue(returned) !== canonicalValue(['I', 'select_return', operandAlias, role,
            [], 'operand_set', ['selected', view, ...aliases]])) fail('return');
        for (const index of [0, 3]) {
            const tuple = tuples[index];
            if (tuple[1] !== 'get' || tuple[3] !== (index === 0 && variant !== 'M' ? role : 'proof/snapshot')
                || canonicalValue(tuple[4]) !== '["date"]' || tuple[5] !== 'data'
                || tuple[6][0] !== 'scalar' || typeof tuple[6][1] !== 'string'
                || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(tuple[6][1])
                || variant !== 'M' && tuple[2] !== member[6][1]) fail('date_operand');
        }
        if (tuples[0][2] !== tuples[3][2] || tuples[0][6][1] !== tuples[3][6][1]) fail('date_occurrences');
    }
    // This decoder deliberately does not claim that a self-rehashed packet
    // came from the sealed authorship. A measured host must require the exact
    // precommitted packet bytes, complete compiler/program ticket and roots.
    return freezeDeep(data);
}
module.exports = { PACKET_PATH, decodeSelectedEventDayPacket };

}];
const edges = [[["node:crypto","node:crypto"]],[["node:crypto","node:crypto"],["node:util","node:util"],["../kernel/canonicalValue",0]],[["node:crypto","node:crypto"],["node:util","node:util"],["../kernel/canonicalValue",0],["./observationContract",4],["./artifactLoader",1]],[["node:fs","node:fs"],["node:crypto","node:crypto"],["node:process","node:process"],["./freezeContract",2]],[["../kernel/canonicalValue",0],["node:util","node:util"],["./observationScalars",5]],[],[["node:crypto","node:crypto"],["../kernel/canonicalValue",0],["./observationContract",4],["./artifactLoader",1],["node:util","node:util"]],[["node:vm","node:vm"],["node:util","node:util"],["../kernel/canonicalValue",0],["./observationContract",4],["./freezeContract",2],["./artifactLoader",1],["./nativeRuntime",3],["./selectedEventDayPacket",8],["./selectedEventDayExecutionTicket",6],["node:crypto","node:crypto"],["node:process","node:process"],["node:child_process","node:child_process"]],[["./observationContract",4],["../kernel/canonicalValue",0]]];
const cache = new Map();
function load(index) {
if (cache.has(index)) return cache.get(index);
const module = { exports: Object.create(null) };
const localRequire = name => { const edge = edges[index].find(pair => pair[0] === name); if (!edge) throw new Error('guest_bundle_unresolved'); return typeof edge[1] === 'string' ? nativeRequire(edge[1]) : load(edge[1]); };
factories[index](localRequire, module, module.exports, ["kernel","provenance","provenance","provenance","provenance","provenance","provenance","provenance","provenance"][index], ["kernel/canonicalValue.js","provenance/artifactLoader.js","provenance/freezeContract.js","provenance/nativeRuntime.js","provenance/observationContract.js","provenance/observationScalars.js","provenance/selectedEventDayExecutionTicket.js","provenance/selectedEventDayLauncher.js","provenance/selectedEventDayPacket.js"][index]);
cache.set(index, module.exports); return module.exports;
}
return load(7)["launch"];
})