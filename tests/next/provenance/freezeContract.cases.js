'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const { admitExecutionFreeze, freezeContents, resolveFrozenProofRoot, admitFrozenArtifact } = require('../../../src/next/provenance/freezeContract');
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const h = n => `sha256:${String(n).padStart(64, '0')}`;
function fixture() {
    const bundle = Buffer.from('(function(){return true;})');
    const manifestBytes = Buffer.from(canonicalValue({ format: 'financasbot.provenance.artifact', version: 1,
        kind: 'proof', entry: 'bundle.js', files: [{ path: 'bundle.js', media_type: 'text/javascript', sha256: hash(bundle) }] }));
    const value = { schema_version: 1, freeze_id: 'provenance_execution', freeze_version: 1, stage: 'execution',
        metric_registry_hash: h(1), validation_tcb_root: h(2), child_capsule_root: h(3),
        native_runtime: { platform: 'win32', arch: 'x64', node_version: 'v22.17.0', node_binary_sha256: h(4) },
        package_authority: [{ path: 'docs/graph.json', sha256: h(5) }],
        proof_programs: [{ program_id: h(6), proof_engine_artifact_root: hash(manifestBytes) }] };
    return { value, bytes: Buffer.from(canonicalValue(value)), manifestBytes, entries: [{ path: 'bundle.js', bytes: bundle }] };
}
test('N02G:FREEZE-001 roots come from captured independent authority, not caller artifact expectations', () => {
    const f = fixture(); const expectedHash = hash(f.bytes);
    const receipt = admitExecutionFreeze({ bytes: f.bytes, expectedHash }); f.bytes.fill(0);
    assert.equal(receipt.financial_acceptance, false); assert.equal(freezeContents(receipt).metric_registry_hash, h(1));
    assert.equal(resolveFrozenProofRoot(receipt, h(6)), hash(f.manifestBytes));
    const input = { freezeReceipt: receipt, kind: 'proof', programId: h(6), manifestBytes: f.manifestBytes, entries: f.entries };
    assert.equal(admitFrozenArtifact(input).observed_root, hash(f.manifestBytes));
    assert.throws(() => admitFrozenArtifact({ ...input, expectedRoot: hash(f.manifestBytes) }), /execution_freeze_input/);
    assert.throws(() => admitFrozenArtifact({ ...input, programId: h(7) }), /execution_freeze_proof_missing/);
    assert.throws(() => admitFrozenArtifact({ ...input, freezeReceipt: { ...receipt } }), /execution_freeze_not_admitted/);
    assert.throws(() => admitFrozenArtifact({ ...input, kind: 'metric' }), /execution_freeze_artifact_selector/);
    assert.throws(() => admitFrozenArtifact({ ...input, kind: 'tcb', programId: null }), /artifact_root_mismatch/);
    assert.throws(() => { freezeContents(receipt).proof_programs[0].proof_engine_artifact_root = h(9); }, TypeError);
    for (const field of ['metric_registry_hash', 'validation_tcb_root', 'child_capsule_root']) {
        const mutated = structuredClone(f.value); mutated[field] = h(9);
        assert.throws(() => admitExecutionFreeze({ bytes: Buffer.from(canonicalValue(mutated)), expectedHash }), /execution_freeze_hash/);
    }
});
test('N02G:FREEZE-002 closed grammar rejects ambiguous inventories, authoring and active input without effects', () => {
    const f = fixture();
    const reject = (mutate, pattern) => { const v = structuredClone(f.value); mutate(v); const bytes = Buffer.from(canonicalValue(v));
        assert.throws(() => admitExecutionFreeze({ bytes, expectedHash: hash(bytes) }), pattern); };
    reject(v => { v.stage = 'authoring'; }, /execution_freeze_shape/);
    reject(v => { v.proof_programs.push(v.proof_programs[0]); }, /execution_freeze_proof_inventory/);
    reject(v => { v.proof_programs = []; }, /execution_freeze_proof_inventory/);
    reject(v => { v.package_authority.push({ path: 'docs/Graph.json', sha256: h(8) }); }, /execution_freeze_package_inventory/);
    reject(v => { v.package_authority[0].path = '../graph.json'; }, /execution_freeze_package_inventory/);
    reject(v => { delete v.native_runtime.node_binary_sha256; }, /execution_freeze_native_runtime/);
    reject(v => { v.roles = []; }, /execution_freeze_shape/);
    const pretty = Buffer.from(JSON.stringify(f.value));
    assert.throws(() => admitExecutionFreeze({ bytes: pretty, expectedHash: hash(pretty) }), /execution_freeze_canonical/);
    let effects = 0; const input = { expectedHash: hash(f.bytes), get bytes() { effects++; return f.bytes; } };
    assert.throws(() => admitExecutionFreeze(input), /execution_freeze_input/);
    assert.throws(() => admitExecutionFreeze(new Proxy({}, { ownKeys() { effects++; return []; } })), /execution_freeze_input/);
    f.bytes.toString = () => { effects++; throw new Error('must not run'); };
    admitExecutionFreeze({ bytes: f.bytes, expectedHash: hash(f.bytes) }); assert.equal(effects, 0);
});
