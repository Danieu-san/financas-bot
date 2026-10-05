'use strict';

const { createHash } = require('node:crypto');
const { copyData } = require('./observationContract');
const { digest } = require('../kernel/canonicalValue');
const admitted = new WeakMap();
// Commitment to the table materialized from the reviewed proposal, not a
// digest recalculated from the candidate on admission. Updating either table
// or pin requires independent review of the new immutable code candidate.
// Source-state contract adenda ratified in 98e3d6a; modes remain unchanged.
// This candidate pin and code still require independent code audit.
const REVIEWED_PROFILE_SHA256 = 'sha256:204962b56fd0833f3d15ac030e6c55dd3866c8fd18ded5e24784f729e41be2bc';
const PROFILE_PATH = 'docs/contracts/next/provenance-v2/phase-composition-profile-v1.json';
const REGISTRY_PATH = 'docs/contracts/next/provenance-v2/metric-evaluator-registry-v1.json';
const IDENTITY_FIELDS = ['evaluator_id', 'evaluator_version', 'metric', 'contract_path', 'evaluator_contract_hash'];
const fail = code => { throw new Error(`phase_profile_${code}`); };
function fields(value, keys) {
    if (!value || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail('shape');
}
function key(row) {
    if (!row || typeof row.evaluator_id !== 'string' || !row.evaluator_id.length
        || !Number.isSafeInteger(row.evaluator_version) || row.evaluator_version < 1) fail('identity');
    return JSON.stringify([row.evaluator_id, row.evaluator_version]);
}
function inventory(rows) {
    if (!Array.isArray(rows) || rows.length !== 39) fail('inventory');
    const result = new Map();
    for (const row of rows) { const id = key(row); if (result.has(id)) fail('duplicate'); result.set(id, row); }
    return result;
}
// copyData deliberately uses null-prototype records. Project that already
// admitted JSON to ordinary records before the existing canonical encoder;
// never relax the encoder or stringify an unadmitted caller object.
const registryDigest = registry => `sha256:${digest(JSON.parse(JSON.stringify(registry)))}`;

// Build/TCB only. This receipt is not graph approval, a financial receipt or
// the independent validation_tcb_root. No guest, trace or oracle is consulted.
function admitPhaseCompositionProfile(raw) {
    const input = copyData(raw); fields(input, ['source', 'registry']);
    if (typeof input.source !== 'string' || input.source.length > 65536) fail('source');
    const hash = `sha256:${createHash('sha256').update(input.source, 'utf8').digest('hex')}`;
    if (hash !== REVIEWED_PROFILE_SHA256) fail('reviewed_content_mismatch');
    let profile; try { profile = copyData(JSON.parse(input.source)); } catch { fail('shape'); }
    fields(profile, ['schema_version', 'profile_id', 'profile_version', 'reviewed_proposal_sha', 'registry_path', 'entries']);
    if (profile.schema_version !== 1 || profile.profile_id !== 'phase_composition' || profile.profile_version !== 1
        || profile.reviewed_proposal_sha !== '8741d57e39a60b1bf5e8390bd8aa585df3f212c5'
        || profile.registry_path !== REGISTRY_PATH) fail('version');
    const registry = input.registry;
    if (registry.registry_id !== 'metric_evaluator_registry' || registry.registry_version !== 1 || registry.schema_version !== 1) fail('registry');
    const entries = inventory(registry.entries); const modes = new Map();
    for (const [id, row] of inventory(profile.entries)) {
        fields(row, [...IDENTITY_FIELDS, 'derivation_mode']);
        const authority = entries.get(id);
        if (!authority || IDENTITY_FIELDS.some(field => row[field] !== authority[field])) fail('registry_identity');
        if (!['formula_only', 'formula_plus_selection_guards'].includes(row.derivation_mode)) fail('mode');
        modes.set(id, row.derivation_mode);
    }
    const receipt = Object.freeze(Object.create(null));
    admitted.set(receipt, { modes, registryHash: registryDigest(registry), source: input.source, hash });
    return receipt;
}
function receiptData(receipt) { const row = admitted.get(receipt); if (!row) fail('receipt'); return row; }
function resolvePhaseCompositionMode(receipt, registry, evaluatorRef, metric) {
    const admitted = receiptData(receipt); const data = copyData({ registry, evaluatorRef, metric });
    if (registryDigest(data.registry) !== admitted.registryHash) fail('registry_mismatch');
    const id = key(data.evaluatorRef); const entry = data.registry.entries.find(row => key(row) === id);
    if (!entry || entry.metric !== data.metric || !admitted.modes.has(id)) fail('identity');
    return admitted.modes.get(id);
}
function phaseCompositionCommitment(receipt) {
    const row = receiptData(receipt);
    return Object.freeze({ path: PROFILE_PATH, sha256: row.hash, source: row.source,
        registry_sha256: row.registryHash, profile_version: 1 });
}
// Only the proof product may carry the reviewed data-only profile leaf.
// Single-leaf diagnostic artifacts remain supported; this shape check grants
// no freeze/financial authority. Capture/admission has already measured bytes.
function validatePhaseArtifactInputs(contents) {
    if (!contents || !['metric', 'proof'].includes(contents.kind) || contents.entry !== 'bundle.js'
        || !Array.isArray(contents.files) || ![1, 2].includes(contents.files.length)
        || contents.files[0].path !== 'bundle.js' || contents.files[0].media_type !== 'text/javascript') fail('artifact_inputs');
    if (contents.files.length === 2) {
        const profile = contents.files[1];
        if (contents.kind !== 'proof' || profile.path !== PROFILE_PATH || profile.media_type !== 'application/json'
            || profile.observed_sha256 !== REVIEWED_PROFILE_SHA256) fail('artifact_inputs');
    }
}
module.exports = { admitPhaseCompositionProfile, resolvePhaseCompositionMode, phaseCompositionCommitment,
    validatePhaseArtifactInputs, REVIEWED_PROFILE_SHA256, PROFILE_PATH };
