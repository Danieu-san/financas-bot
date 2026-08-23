const {
    evaluateFinancialIterativeCanaryEligibility
} = require('../config/financialIterativeCanaryRuntimeConfig');
const {
    runFinancialIterativeShadowForSource
} = require('./financialIterativeShadowAgent');

function buildFinancialIterativeCanaryTelemetry({ eligibility = {}, shadow = null } = {}) {
    if (!eligibility.eligible || !shadow) {
        return {
            status: 'skipped',
            reason: String(eligibility.reason || 'shadow_unavailable'),
            domain: String(eligibility.domain || 'unknown'),
            source: String(eligibility.source || 'unknown')
        };
    }
    return {
        status: 'observed',
        reason: String(shadow.stopReason || 'unknown'),
        domain: String(eligibility.domain || 'unknown'),
        source: String(eligibility.source || 'unknown'),
        readCount: Number(shadow.readCount || 0),
        candidateAction: String(shadow.candidate?.action || 'none'),
        adequacyStatus: String(shadow.adequacy?.status || 'unknown'),
        adequacyReason: String(shadow.adequacy?.reasons?.[0] || 'none'),
        comparable: shadow.comparison?.comparable === true,
        sameCapability: shadow.comparison?.sameCapability ?? null,
        sameSource: shadow.comparison?.sameSource ?? null,
        sameCoverage: shadow.comparison?.sameCoverage ?? null,
        samePayload: shadow.comparison?.samePayload ?? null
    };
}

function hasExplicitZeroSideEffects(shadow = null) {
    return Boolean(
        shadow &&
        typeof shadow.sideEffects?.messagesSent === 'number' &&
        Number.isFinite(shadow.sideEffects.messagesSent) &&
        shadow.sideEffects.messagesSent === 0 &&
        typeof shadow.sideEffects?.financialWrites === 'number' &&
        Number.isFinite(shadow.sideEffects.financialWrites) &&
        shadow.sideEffects.financialWrites === 0
    );
}

function canPromoteShadow(shadow = null) {
    return Boolean(
        shadow &&
        shadow.candidate?.action === 'answer' &&
        String(shadow.candidate?.text || '').trim() &&
        shadow.adequacy?.ok === true &&
        hasExplicitZeroSideEffects(shadow)
    );
}

function selectFinancialIterativeCanaryResponse({ baselineAnswer = '', canary = null } = {}) {
    if (canary?.status !== 'observed' || !canPromoteShadow(canary.shadow)) {
        return String(baselineAnswer || '');
    }
    return String(canary.shadow.candidate.text || '').trim();
}

async function runFinancialIterativeCanary({
    message = '',
    domain = '',
    source = '',
    userId = '',
    trustedContext = {},
    trajectory = null,
    baselineEvidence = null,
    reasoner = null,
    env = process.env,
    runShadow = runFinancialIterativeShadowForSource
} = {}) {
    const eligibility = evaluateFinancialIterativeCanaryEligibility({ userId, domain, source, env });
    if (!eligibility.eligible) {
        return {
            status: 'skipped',
            eligibility,
            shadow: null,
            telemetry: buildFinancialIterativeCanaryTelemetry({ eligibility })
        };
    }
    if (typeof reasoner !== 'function') {
        const unavailable = { ...eligibility, eligible: false, reason: 'reasoner_unavailable' };
        return {
            status: 'skipped',
            eligibility: unavailable,
            shadow: null,
            telemetry: buildFinancialIterativeCanaryTelemetry({ eligibility: unavailable })
        };
    }
    const shadow = await runShadow({
        message,
        trajectory,
        trustedContext,
        baselineEvidence,
        reasoner,
        source
    });
    const output = { status: 'observed', eligibility, shadow };
    return {
        ...output,
        telemetry: buildFinancialIterativeCanaryTelemetry(output)
    };
}

module.exports = {
    runFinancialIterativeCanary,
    selectFinancialIterativeCanaryResponse,
    buildFinancialIterativeCanaryTelemetry,
    canPromoteFinancialIterativeShadow: canPromoteShadow,
    hasExplicitZeroSideEffects,
    __test__: { canPromoteShadow }
};
