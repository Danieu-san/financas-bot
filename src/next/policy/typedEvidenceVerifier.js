const ACCEPTED_EVIDENCE_STATES = new Set(['confirmed', 'committed', 'projected', 'estimated']);

function claimIsTyped(claim) {
    return Boolean(
        claim &&
        typeof claim === 'object' &&
        typeof claim.metric === 'string' && claim.metric &&
        typeof claim.value === 'number' && Number.isFinite(claim.value) &&
        typeof claim.unit === 'string' && claim.unit &&
        claim.entity && typeof claim.entity === 'object' &&
        typeof claim.entity.kind === 'string' && claim.entity.kind &&
        typeof claim.entity.ref === 'string' && claim.entity.ref &&
        claim.period && typeof claim.period === 'object' &&
        typeof claim.period.type === 'string' && claim.period.type &&
        typeof claim.timeBasis === 'string' && claim.timeBasis
    );
}

function verifyTypedClaimEvidence({ claim, evidence, expected = {} } = {}) {
    if (!claimIsTyped(claim)) return { ok: false, reason: 'claim_schema_invalid' };
    if (expected.metric !== undefined && claim.metric !== expected.metric) {
        return { ok: false, reason: 'claim_metric_mismatch' };
    }
    if (expected.entity && (
        claim.entity.kind !== expected.entity.kind ||
        claim.entity.ref !== expected.entity.ref
    )) return { ok: false, reason: 'claim_entity_mismatch' };
    if (expected.periodValue !== undefined && claim.period.value !== expected.periodValue) {
        return { ok: false, reason: 'claim_period_mismatch' };
    }
    if (expected.timeBasis !== undefined && claim.timeBasis !== expected.timeBasis) {
        return { ok: false, reason: 'claim_time_basis_mismatch' };
    }
    if (!evidence || typeof evidence !== 'object') return { ok: false, reason: 'evidence_missing' };
    if (evidence.coverage !== 'complete') return { ok: false, reason: 'coverage_insufficient' };
    if (!ACCEPTED_EVIDENCE_STATES.has(String(evidence.state || ''))) {
        return { ok: false, reason: 'evidence_state_unproven' };
    }
    if (!Array.isArray(evidence.refs) || evidence.refs.length === 0 || evidence.refs.some(ref => !String(ref || '').trim())) {
        return { ok: false, reason: 'evidence_refs_missing' };
    }
    return { ok: true };
}

module.exports = {
    verifyTypedClaimEvidence
};
