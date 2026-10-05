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
