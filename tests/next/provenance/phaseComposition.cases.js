'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { admitPhaseCompositionProfile, resolvePhaseCompositionMode, phaseCompositionCommitment,
    validatePhaseArtifactInputs, REVIEWED_PROFILE_SHA256, PROFILE_PATH } = require('../../../src/next/provenance/phaseCompositionProfile');
const root = path.resolve(__dirname, '../../..');
const source = () => fs.readFileSync(path.join(root, PROFILE_PATH), 'utf8');
const registry = () => JSON.parse(fs.readFileSync(path.join(root,
    'docs/contracts/next/provenance-v2/metric-evaluator-registry-v1.json'), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));

test('N02G:PHASE-COMPOSITION-001 independently versioned exact profile rejects drift and forged receipts', () => {
    const authority = registry(); const profile = JSON.parse(source());
    const receipt = admitPhaseCompositionProfile({ source: source(), registry: authority });
    const commitment = phaseCompositionCommitment(receipt);
    assert.equal(commitment.sha256, REVIEWED_PROFILE_SHA256); assert.equal(commitment.source, source());
    assert.equal(profile.entries.length, 39); let guarded = 0;
    for (const row of profile.entries) {
        const mode = resolvePhaseCompositionMode(receipt, authority,
            { evaluator_id: row.evaluator_id, evaluator_version: row.evaluator_version }, row.metric);
        assert.equal(mode, row.derivation_mode); guarded += Number(mode === 'formula_plus_selection_guards');
        for (const field of ['evaluator_id', 'evaluator_version', 'metric', 'contract_path', 'evaluator_contract_hash']) {
            const changed = clone(authority); const entry = changed.entries.find(e => e.evaluator_id === row.evaluator_id);
            entry[field] = field === 'evaluator_version' ? entry[field] + 1 : entry[field] + '_changed';
            assert.throws(() => admitPhaseCompositionProfile({ source: source(), registry: changed }), /phase_profile_registry_identity/);
        }
    }
    assert.equal(guarded, 7);
    const mutations = [p => p.entries.pop(), p => p.entries.push(clone(p.entries[0])),
        p => { p.entries[0].derivation_mode = 'formula_only'; },
        p => { p.entries[1].derivation_mode = 'unknown'; }, p => p.profile_version++,
        p => { p.entries[0].evaluator_contract_hash = 'sha256:' + '0'.repeat(64); }];
    for (const mutate of mutations) { const changed = clone(profile); mutate(changed);
        assert.throws(() => admitPhaseCompositionProfile({ source: JSON.stringify(changed, null, 2) + '\n', registry: authority }),
            /phase_profile_reviewed_content_mismatch/); }
    for (const mutate of [r => r.entries.pop(), r => r.entries.push(clone(r.entries[0])),
        r => { r.entries[1] = clone(r.entries[0]); }]) {
        const changed = clone(authority); mutate(changed);
        assert.throws(() => admitPhaseCompositionProfile({ source: source(), registry: changed }), /phase_profile_(inventory|duplicate)/);
    }
    const changedRoles = clone(authority); changedRoles.entries[0].roles.reverse();
    assert.throws(() => resolvePhaseCompositionMode(receipt, changedRoles, authority.entries[0], authority.entries[0].metric), /phase_profile_registry_mismatch/);
    assert.throws(() => resolvePhaseCompositionMode({}, authority, authority.entries[0], authority.entries[0].metric), /phase_profile_receipt/);
    assert.throws(() => resolvePhaseCompositionMode(receipt, authority, authority.entries[0], 'unknown'), /phase_profile_identity/);
    assert.throws(() => admitPhaseCompositionProfile({ source: source(), registry: authority, expected_trace: [] }), /phase_profile_shape/);
    let effects = 0;
    assert.throws(() => admitPhaseCompositionProfile({ get source() { effects++; return source(); }, registry: authority }), /observation_shape_invalid/);
    assert.equal(effects, 0);
    const artifact = { kind: 'proof', entry: 'bundle.js', files: [
        { path: 'bundle.js', media_type: 'text/javascript', observed_sha256: 'sha256:' + '0'.repeat(64) },
        { path: PROFILE_PATH, media_type: 'application/json', observed_sha256: REVIEWED_PROFILE_SHA256 }] };
    assert.doesNotThrow(() => validatePhaseArtifactInputs(artifact));
    for (const mutate of [a => { a.kind = 'metric'; }, a => { a.files[1].path = 'payload.json'; },
        a => { a.files[1].observed_sha256 = 'sha256:' + '0'.repeat(64); }, a => a.files.push(clone(a.files[1]))]) {
        const changed = clone(artifact); mutate(changed);
        assert.throws(() => validatePhaseArtifactInputs(changed), /phase_profile_artifact_inputs/);
    }
});
