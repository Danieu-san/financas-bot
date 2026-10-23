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
const { runInThisContext } = require('node:vm');
const { types } = require('node:util');
const { canonicalValue, digest } = require('../kernel/canonicalValue');
const { admitExecutionFreeze, admitFrozenArtifact, freezeContents } = require('./freezeContract');
const { artifactContents } = require('./artifactLoader');
const { verifyNativeRuntime, nativeRuntimeFileCapability } = require('./nativeRuntime');
const nativeModules = Object.freeze({ 'node:crypto': require('node:crypto'), 'node:util': require('node:util'),
    'node:process': require('node:process'), 'node:child_process': require('node:child_process'),
    'node:path': require('node:path'), 'node:fs': nativeRuntimeFileCapability() });
const fail = code => { throw new Error(`captured_tcb_${code}`); };
function own(raw, names) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== names.length || names.some(name =>
        !d[name]?.enumerable || !Object.hasOwn(d[name], 'value'))) fail('input');
    return Object.fromEntries(names.map(name => [name, d[name].value]));
}
function packageArtifact(contents) {
    const entries = contents.files.map(row => ({ path: row.path, bytes: Buffer.from(row.source, 'utf8') }));
    const manifestBytes = Buffer.from(canonicalValue({ format: 'financasbot.provenance.artifact', version: 1,
        kind: contents.kind, entry: contents.entry, files: contents.files.map(row => ({ path: row.path,
            media_type: row.media_type, sha256: row.observed_sha256 })) }));
    return { manifestBytes, entries };
}

// EXTERNAL PRECONDITION: the native launching platform identifies the exact
// launcher-bootstrap.js leaf against the independently reviewed TCB manifest
// BEFORE evaluating it. This module is bundled into that measured leaf, never
// loaded through ambient project require-cache. It cannot authenticate itself
// or invent expectedFreezeHash; that value belongs to trusted provisioning.
// The VM operation below evaluates TRUSTED captured host code, not guest code
// and not an isolation claim. Guest isolation remains SES + disposable process.
function launchCapturedTcb(raw) {
    const hasQualification = raw && typeof raw === 'object' && !types.isProxy(raw)
        && Object.hasOwn(raw, 'qualification');
    const { freezeBytes, expectedFreezeHash, tcbArtifact, qualification } = own(raw,
        ['freezeBytes', 'expectedFreezeHash', 'tcbArtifact', ...(hasQualification ? ['qualification'] : [])]);
    let capturedQualification;
    if (hasQualification) {
        const value = own(qualification, ['ticketSource', 'payloadSource', 'expectedTicketCommitment']);
        if (typeof value.ticketSource !== 'string' || !value.ticketSource.length || value.ticketSource.length > 1048576
            || typeof value.payloadSource !== 'string' || !value.payloadSource.length || value.payloadSource.length > 16 * 1024 * 1024
            || typeof value.expectedTicketCommitment !== 'string'
            || !/^sha256:[a-f0-9]{64}$/.test(value.expectedTicketCommitment)
            || `sha256:${digest({ source: value.ticketSource })}` !== value.expectedTicketCommitment) fail('qualification_pin');
        // Exact immutable UTF8 strings. No caller Buffer.from hooks or receipt
        // brands are transported, and no root is learned from guest input.
        capturedQualification = Object.freeze(value);
    }
    const freezeReceipt = admitExecutionFreeze({ bytes: freezeBytes, expectedHash: expectedFreezeHash });
    if (!hasQualification) verifyNativeRuntime(freezeReceipt);
    const artifact = own(tcbArtifact, ['manifestBytes', 'entries']);
    const receipt = admitFrozenArtifact({ freezeReceipt, kind: 'tcb', programId: null, ...artifact });
    const contents = artifactContents(receipt);
    if (contents.entry !== 'launcher-bootstrap.js' || contents.files.map(row => row.path).join(',')
        !== 'child-bootstrap.js,host-bootstrap.js,launcher-bootstrap.js,recipe.json'
        || contents.files.some(row => row.media_type !== (row.path === 'recipe.json' ? 'application/json' : 'text/javascript'))) fail('inventory');
    const host = contents.files.find(row => row.path === 'host-bootstrap.js');
    const requireNative = specifier => {
        if (!Object.hasOwn(nativeModules, specifier)) fail('native_import'); return nativeModules[specifier];
    };
    let tools;
    try { tools = runInThisContext(`(function(require){ return ${host.source}\n})`, { filename: 'captured-host-bootstrap.js' })(requireNative); }
    catch { fail('host_loading'); }
    if (!tools || tools.stage !== 'captured_validation_tools_only' || typeof tools.initializeFinancialHost !== 'function') fail('host_entry');
    if (hasQualification && typeof tools.initializePathQualification !== 'function') fail('qualification_host_entry');
    // Reconstruct only the exact canonical manifest already admitted; never
    // derive an expected root from it. Fresh Buffers cross opaque receipt tables
    // between the captured launcher and separately captured host closures.
    const capturedArtifact = packageArtifact(contents);
    const capturedFreeze = Buffer.from(canonicalValue(JSON.parse(JSON.stringify(freezeContents(freezeReceipt)))));
    let used = false;
    if (hasQualification) {
        const result = Object.freeze({ stage: 'captured_tcb_path_qualification_loaded_only', financial_acceptance: false,
            initializePathQualification() {
                if (this !== result || arguments.length) fail('qualification_origin');
                if (used) fail('already_initialized'); used = true;
                return tools.initializePathQualification(capturedQualification, { freezeBytes: Buffer.from(capturedFreeze), expectedFreezeHash,
                    tcbArtifact: { manifestBytes: Buffer.from(capturedArtifact.manifestBytes),
                        entries: capturedArtifact.entries.map(row => ({ path: row.path, bytes: Buffer.from(row.bytes) })) } });
            } });
        return result;
    }
    return Object.freeze({ stage: 'captured_tcb_loaded_only', financial_acceptance: false,
        initialize(data) {
            if (used) fail('already_initialized'); used = true;
            return tools.initializeFinancialHost(data, { freezeBytes: Buffer.from(capturedFreeze), expectedFreezeHash,
                tcbArtifact: { manifestBytes: Buffer.from(capturedArtifact.manifestBytes),
                    entries: capturedArtifact.entries.map(row => ({ path: row.path, bytes: Buffer.from(row.bytes) })) } });
        } });
}
module.exports = { launchCapturedTcb };

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

}];
const edges = [[["node:crypto","node:crypto"]],[["node:crypto","node:crypto"],["node:util","node:util"],["../kernel/canonicalValue",0]],[["node:vm","node:vm"],["node:util","node:util"],["../kernel/canonicalValue",0],["./freezeContract",3],["./artifactLoader",1],["./nativeRuntime",4],["node:crypto","node:crypto"],["node:process","node:process"],["node:child_process","node:child_process"],["node:path","node:path"]],[["node:crypto","node:crypto"],["node:util","node:util"],["../kernel/canonicalValue",0],["./observationContract",5],["./artifactLoader",1]],[["node:fs","node:fs"],["node:crypto","node:crypto"],["node:process","node:process"],["./freezeContract",3]],[["../kernel/canonicalValue",0],["node:util","node:util"],["./observationScalars",6]],[]];
const cache = new Map();
function load(index) {
if (cache.has(index)) return cache.get(index);
const module = { exports: Object.create(null) };
const localRequire = name => { const edge = edges[index].find(pair => pair[0] === name); if (!edge) throw new Error('guest_bundle_unresolved'); return typeof edge[1] === 'string' ? nativeRequire(edge[1]) : load(edge[1]); };
factories[index](localRequire, module, module.exports, ["kernel","provenance","provenance","provenance","provenance","provenance","provenance"][index], ["kernel/canonicalValue.js","provenance/artifactLoader.js","provenance/capturedTcbLauncher.js","provenance/freezeContract.js","provenance/nativeRuntime.js","provenance/observationContract.js","provenance/observationScalars.js"][index]);
cache.set(index, module.exports); return module.exports;
}
return load(2)["launchCapturedTcb"];
})(require);
