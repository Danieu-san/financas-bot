const { recordLegacyUsageEvent } = require('../telemetry/legacyUsageTelemetry');

const CANDIDATES = new Set([
    'debt_update_handler',
    'debt_avalanche_service',
    'financial_health_service',
    'legacy_auth_utility',
    'date_time_normalizer',
    'financial_query_spec',
    'financial_undo_service'
]);

function parseCandidateSet(value) {
    return new Set(String(value || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean));
}

function observeLegacyEntrypoint(candidate, options = {}) {
    const env = options.env || process.env;
    const normalized = String(candidate || '').trim().toLowerCase();
    if (!CANDIDATES.has(normalized)) throw new Error('invalid_legacy_tripwire_candidate');
    if (String(env.LEGACY_RETIREMENT_TRIPWIRE_ENABLED || '').toLowerCase() !== 'true') {
        return { observed: false, blocked: false, reason: 'tripwire_disabled' };
    }

    const softDisabled = parseCandidateSet(env.LEGACY_RETIREMENT_SOFT_DISABLED_CANDIDATES);
    for (const value of softDisabled) {
        if (!CANDIDATES.has(value)) throw new Error('invalid_soft_disabled_legacy_candidate');
    }
    const blocked = softDisabled.has(normalized);
    const record = recordLegacyUsageEvent({
        event: 'tripwire',
        surface: 'retirement',
        consumer: 'legacy_tripwire',
        handler: 'legacy_tripwire',
        route: 'legacy_entrypoint',
        domain: options.domain || 'none',
        operation: blocked ? 'soft_disable' : 'load',
        source: 'runtime',
        mode: blocked ? 'soft_disabled' : 'observe',
        result: blocked ? 'blocked' : 'success',
        reasonCode: blocked ? 'legacy_soft_disabled' : 'legacy_entrypoint_loaded',
        evidenceType: options.evidenceType || 'runtime',
        candidate: normalized,
        writeAttempted: false,
        writeResult: 'not_attempted'
    }, { env });

    if (blocked) {
        const error = new Error('legacy_entrypoint_soft_disabled');
        error.code = 'legacy_entrypoint_soft_disabled';
        error.candidate = normalized;
        error.telemetry = record;
        throw error;
    }
    return { observed: true, blocked: false, record };
}

module.exports = { CANDIDATES, parseCandidateSet, observeLegacyEntrypoint };
