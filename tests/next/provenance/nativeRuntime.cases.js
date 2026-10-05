'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const { admitExecutionFreeze } = require('../../../src/next/provenance/freezeContract');
const { verifyNativeRuntime, verifiedNodeExecutable } = require('../../../src/next/provenance/nativeRuntime');
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const h = n => `sha256:${String(n).padStart(64, '0')}`;
function authority(overrides = {}) {
    // Synthetic test authority only, not a published/reviewed production freeze.
    const bytes = Buffer.from(canonicalValue({ schema_version: 1, freeze_id: 'provenance_execution', freeze_version: 1,
        stage: 'execution', metric_registry_hash: h(1), validation_tcb_root: h(2), child_capsule_root: h(3),
        native_runtime: { platform: process.platform, arch: process.arch, node_version: process.version,
            node_binary_sha256: hash(readFileSync(process.execPath)), ...overrides },
        package_authority: [{ path: 'docs/test.json', sha256: h(4) }],
        proof_programs: [{ program_id: h(5), proof_engine_artifact_root: h(6) }] }));
    return admitExecutionFreeze({ bytes, expectedHash: hash(bytes) });
}
test('N02G:NATIVE-RUNTIME-001 current Node binary must match the independent native commitment before selection', () => {
    const receipt = verifyNativeRuntime(authority());
    assert.equal(receipt.financial_acceptance, false); assert.equal(verifiedNodeExecutable(receipt), process.execPath);
    assert.throws(() => verifyNativeRuntime(authority({ node_binary_sha256: h(9) })), /native_runtime_binary_mismatch/);
    assert.throws(() => verifyNativeRuntime(authority({ node_version: 'v0.0.1' })), /native_runtime_identity/);
    assert.throws(() => verifyNativeRuntime(authority({ arch: process.arch === 'x64' ? 'arm64' : 'x64' })), /native_runtime_identity/);
    assert.throws(() => verifiedNodeExecutable({ ...receipt }), /native_runtime_not_admitted/);
    let effects = 0;
    const fake = { get native_runtime() { effects++; return {}; } };
    assert.throws(() => verifyNativeRuntime(fake), /execution_freeze_not_admitted/);
    assert.throws(() => verifiedNodeExecutable(new Proxy({}, { get() { effects++; } })), /native_runtime_not_admitted/);
    assert.equal(effects, 0);
});
