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
