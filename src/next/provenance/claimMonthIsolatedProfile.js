'use strict';
// Closed data/identity contract for QUARANTINED observations. This parser
// never issues graph acceptance, a financial receipt or mutation credit.
const { copyData, identifier } = require('./observationContract');
const { canonicalValue, digest } = require('../kernel/canonicalValue');
const { validatePhaseArtifactInputs } = require('./phaseCompositionProfile');
const QUALIFICATION_PATH = 'qualification/claim-month-path-completion-v1.json';
const fail = code => { throw new Error(`month_isolated_${code}`); };
function fields(row, keys) {
    if (!row || Array.isArray(row) || Object.keys(row).sort().join(',') !== [...keys].sort().join(',')) fail('profile');
}
function decodeClaimMonthProfile(source) {
    if (typeof source !== 'string' || Buffer.byteLength(source) > 65536) fail('profile');
    let row; try { row = structuredClone(copyData(JSON.parse(source))); } catch { fail('profile'); }
    fields(row, ['schema_version', 'profile_id', 'normative_commit', 'quarantine_origin', 'variant', 'fact_key',
        'predicate_id', 'core_context_hash', 'proof_ir_hash', 'sidecar_hash', 'sidecar', 'original_period', 'predicate_ids']);
    if (canonicalValue(row) !== source || row.schema_version !== 1 || row.profile_id !== 'claim-month-path-completion/v1'
        || row.normative_commit !== '04eb9545516d100aa45e1ac6d8ebfda444fafbd7'
        || row.quarantine_origin !== 'negative_qualification' || !['C', 'M', 'S'].includes(row.variant)
        || !identifier(row.fact_key) || !identifier(row.predicate_id)
        || [row.core_context_hash, row.proof_ir_hash, row.sidecar_hash].some(hash => !/^sha256:[a-f0-9]{64}$/.test(hash))
        || !Array.isArray(row.predicate_ids) || !row.predicate_ids.length || row.predicate_ids.length > 16384
        || row.predicate_ids.some(id => !identifier(id)) || new Set(row.predicate_ids).size !== row.predicate_ids.length
        || row.predicate_ids.filter(id => id === row.predicate_id).length !== 1) fail('profile');
    fields(row.sidecar, ['qualification']); fields(row.sidecar.qualification, ['alternative_period']);
    const original = row.original_period; const alternative = row.sidecar.qualification.alternative_period;
    for (const month of [original, alternative]) {
        fields(month, ['kind', 'value']);
        if (month.kind !== 'month' || typeof month.value !== 'string'
            || !/^(?!0000)[0-9]{4}-(0[1-9]|1[0-2])$/.test(month.value)) fail('month');
    }
    const [year, month] = original.value.split('-').map(Number);
    const next = original.value === '9999-12' ? '9999-11'
        : `${String(month === 12 ? year + 1 : year).padStart(4, '0')}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}`;
    if (alternative.value !== next || row.sidecar_hash !== 'sha256:' + digest(row.sidecar)) fail('sidecar');
    return row;
}
function validateClaimMonthArtifact(contents, expectedSource) {
    if (!contents || contents.kind !== 'proof' || contents.files?.length !== 3) fail('artifact');
    validatePhaseArtifactInputs({ ...contents, files: contents.files.slice(0, 2) });
    const leaf = contents.files[2];
    if (leaf.path !== QUALIFICATION_PATH || leaf.media_type !== 'application/json'
        || expectedSource !== undefined && leaf.source !== expectedSource) fail('artifact');
    return decodeClaimMonthProfile(leaf.source);
}
module.exports = { QUALIFICATION_PATH, decodeClaimMonthProfile, validateClaimMonthArtifact };
