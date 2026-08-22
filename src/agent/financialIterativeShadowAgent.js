const crypto = require('node:crypto');
const {
    executeFinancialSemanticRead,
    listFinancialSemanticCapabilities,
    sanitizeFinancialEvidenceValue
} = require('./financialSemanticReadFacade');
const { sanitizeExecutedPlan } = require('./financialAgentTrajectory');
const { verifyFinancialEvidenceAdequacy } = require('./financialEvidenceAdequacyVerifier');
const { createPersonalSheetSemanticAdapters } = require('./financialPersonalSheetSemanticAdapters');

const MAX_SHADOW_READS = 3;
const BLOCKING_TOOL_REASONS = new Set([
    'tool_not_allowed',
    'tool_adapter_unavailable',
    'missing_authorized_scope'
]);

function boundedText(value, maxLength = 3000) {
    return String(value || '').trim().slice(0, maxLength);
}

function sanitizeTrajectoryForReasoner(trajectory = null) {
    if (!trajectory || typeof trajectory !== 'object') return null;
    return sanitizeFinancialEvidenceValue({
        schemaVersion: trajectory.schemaVersion || null,
        context: {
            scope: trajectory.context?.scope || 'unknown',
            timeBasis: trajectory.context?.timeBasis || null,
            referencePeriod: trajectory.context?.referencePeriod || null,
            followUp: Boolean(trajectory.context?.followUp),
            authorizedUserCount: trajectory.context?.authorizedUserCount ?? null
        },
        decision: {
            action: trajectory.decision?.action || 'unknown',
            plannerSource: trajectory.decision?.plannerSource || 'unknown',
            reason: trajectory.decision?.reason || null
        },
        executedPlan: sanitizeExecutedPlan(trajectory.executedPlan),
        tool: {
            name: trajectory.tool?.name || 'none',
            source: trajectory.tool?.source || 'none',
            fallbackReason: trajectory.tool?.fallbackReason || 'none'
        },
        coverage: {
            status: trajectory.coverage?.status || 'unknown',
            evidenceKind: trajectory.coverage?.evidenceKind || 'none',
            itemCount: trajectory.coverage?.itemCount ?? null,
            criteriaKeys: Array.isArray(trajectory.coverage?.criteriaKeys)
                ? trajectory.coverage.criteriaKeys.slice(0, 20)
                : []
        },
        verification: {
            ok: Boolean(trajectory.verification?.ok),
            reason: trajectory.verification?.reason || 'unknown'
        },
        response: {
            status: trajectory.response?.status || 'unknown',
            lengthBucket: trajectory.response?.lengthBucket || 'unknown'
        }
    });
}

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.keys(value).sort().map(key => [key, stableValue(value[key])])
    );
}

function payloadFingerprint(payload) {
    if (payload === null || payload === undefined) return null;
    return crypto
        .createHash('sha256')
        .update(JSON.stringify(stableValue(sanitizeFinancialEvidenceValue(payload))))
        .digest('hex');
}

function compareShadowEvidence({ baselineEvidence = null, candidateEvidence = null } = {}) {
    const comparable = Boolean(baselineEvidence && candidateEvidence);
    if (!comparable) {
        return {
            comparable: false,
            sameCapability: null,
            sameSource: null,
            sameCoverage: null,
            samePayload: null
        };
    }
    return {
        comparable: true,
        sameCapability: baselineEvidence.capability === candidateEvidence.capability,
        sameSource: baselineEvidence.provenance?.source === candidateEvidence.provenance?.source,
        sameCoverage: baselineEvidence.coverage?.status === candidateEvidence.coverage?.status &&
            baselineEvidence.coverage?.itemCount === candidateEvidence.coverage?.itemCount,
        samePayload: payloadFingerprint(baselineEvidence.payload) === payloadFingerprint(candidateEvidence.payload)
    };
}

function normalizeCandidate(decision = {}) {
    const action = String(decision?.action || '').trim();
    if (action === 'answer') {
        return { action, text: boundedText(decision.answer) };
    }
    if (action === 'clarify') {
        return { action, text: boundedText(decision.question) };
    }
    return null;
}

function shadowResult({ steps, candidate = null, stopReason, baselineEvidence = null, adequacy = null } = {}) {
    const candidateEvidence = steps.length > 0 ? steps[steps.length - 1].evidence : null;
    return {
        mode: 'shadow',
        readCount: steps.filter(step => step.executed === true).length,
        stopReason,
        steps,
        candidate,
        adequacy,
        comparison: compareShadowEvidence({ baselineEvidence, candidateEvidence }),
        visibleResponse: null,
        sideEffects: { messagesSent: 0, financialWrites: 0 }
    };
}

async function runFinancialIterativeShadowCore({
    message = '',
    trajectory = null,
    trustedContext = {},
    baselineToolResult = null,
    baselineEvidence = baselineToolResult?.evidence || null,
    reasoner,
    adapters,
    maxReads = MAX_SHADOW_READS
} = {}) {
    const readLimit = Math.max(1, Math.min(MAX_SHADOW_READS, Number.parseInt(maxReads, 10) || MAX_SHADOW_READS));
    const steps = [];
    const executions = [];
    if (typeof reasoner !== 'function') {
        return shadowResult({ steps, stopReason: 'reasoner_unavailable', baselineEvidence });
    }

    const baseContext = {
        message: boundedText(message, 700),
        trajectory: sanitizeTrajectoryForReasoner(trajectory),
        allowedCapabilities: listFinancialSemanticCapabilities(),
        readLimit
    };

    while (true) {
        let decision;
        try {
            decision = await reasoner({
                ...baseContext,
                remainingReads: readLimit - steps.filter(step => step.executed === true).length,
                evidenceHistory: steps.map(step => step.evidence)
            });
        } catch (_) {
            return shadowResult({ steps, stopReason: 'reasoner_failed', baselineEvidence });
        }

        const candidate = normalizeCandidate(decision);
        if (candidate) {
            const adequacy = candidate.action === 'answer'
                ? verifyFinancialEvidenceAdequacy({
                    expectedPlan: trajectory?.executedPlan,
                    expectedScope: trajectory?.context?.scope,
                    knownPeople: Object.values(trustedContext?.personByUserId || {}),
                    executions,
                    answer: candidate.text
                })
                : { schemaVersion: 1, ok: null, status: 'not_applicable', checks: {}, reasons: [] };
            return shadowResult({
                steps,
                candidate,
                adequacy,
                stopReason: candidate.action === 'answer' ? 'candidate_answer' : 'candidate_clarification',
                baselineEvidence
            });
        }
        if (decision?.action !== 'tool') {
            return shadowResult({ steps, stopReason: 'invalid_reasoner_decision', baselineEvidence });
        }

        const completedReads = steps.filter(step => step.executed === true).length;
        if (completedReads >= readLimit) {
            return shadowResult({ steps, stopReason: 'read_limit_reached', baselineEvidence });
        }

        const execution = await executeFinancialSemanticRead({
            request: {
                tool: decision.tool,
                args: decision.args || {}
            },
            trustedContext,
            adapters
        });
        const reason = String(execution?.reason || '');
        executions.push({
            request: { tool: String(decision.tool || ''), args: decision.args || {} },
            result: execution
        });
        const executed = !BLOCKING_TOOL_REASONS.has(reason);
        steps.push({
            index: steps.length + 1,
            tool: String(decision.tool || ''),
            executed,
            evidence: execution.evidence
        });
        if (!executed) {
            return shadowResult({ steps, stopReason: 'tool_rejected', baselineEvidence });
        }
    }
}

async function runFinancialIterativeShadow(input = {}) {
    const safeInput = input && typeof input === 'object' ? { ...input } : {};
    delete safeInput.adapters;
    return await runFinancialIterativeShadowCore(safeInput);
}

async function runFinancialIterativeShadowForSource(input = {}) {
    const safeInput = input && typeof input === 'object' ? { ...input } : {};
    delete safeInput.adapters;
    const source = String(safeInput.source || 'central_read_model').trim().toLowerCase();
    delete safeInput.source;
    const adapters = source === 'personal_sheet'
        ? createPersonalSheetSemanticAdapters()
        : undefined;
    return await runFinancialIterativeShadowCore({ ...safeInput, adapters });
}

module.exports = {
    MAX_SHADOW_READS,
    runFinancialIterativeShadow,
    runFinancialIterativeShadowForSource,
    compareShadowEvidence,
    __test__: {
        sanitizeTrajectoryForReasoner,
        payloadFingerprint,
        stableValue,
        normalizeCandidate,
        runFinancialIterativeShadowWithAdapters: runFinancialIterativeShadowCore
    }
};
