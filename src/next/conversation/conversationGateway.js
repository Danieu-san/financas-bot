const { normalizeFinancialQueryPlan } = require('../contracts/financialQueryPlan');
const { verifyTypedClaimEvidence } = require('../policy/typedEvidenceVerifier');
const { createToolBudgetTracker } = require('../policy/toolBudget');

function fail(reason) {
    return { ok: false, reason };
}

function record(recorder, entry) {
    if (recorder && typeof recorder.record === 'function') recorder.record(entry);
}

function sameAuthorizedSession(session, trustedContext) {
    return Boolean(
        session &&
        trustedContext &&
        String(trustedContext.familyId || '') === session.familyId &&
        String(trustedContext.actorId || '') === session.actorId
    );
}

function planCandidate(planInput, session) {
    const input = planInput && typeof planInput === 'object' && !Array.isArray(planInput)
        ? structuredClone(planInput)
        : planInput;
    if (!input?.needsContext) return input;

    const previous = session?.queryContext;
    if (!previous || typeof previous !== 'object') return null;
    return {
        ...input,
        domain: input.domain || previous.domain,
        operation: input.operation || previous.operation,
        filters: {
            ...(previous.filters || {}),
            ...(input.filters || {})
        },
        timeBasis: input.timeBasis === 'context' || !input.timeBasis
            ? previous.timeBasis
            : input.timeBasis
    };
}

function toolArgs(plan) {
    return {
        ...structuredClone(plan.filters),
        timeBasis: plan.timeBasis
    };
}

function expectedClaimDimensions(plan, trustedContext, route) {
    const scope = plan.filters.scope;
    if (scope === 'family') {
        return {
            metric: route.claimMetric,
            entity: { kind: 'family', ref: trustedContext.familyId },
            periodValue: plan.filters.period,
            timeBasis: plan.timeBasis
        };
    }
    if (scope === 'personal') {
        return {
            metric: route.claimMetric,
            entity: { kind: 'person', ref: trustedContext.actorId },
            periodValue: plan.filters.period,
            timeBasis: plan.timeBasis
        };
    }
    return null;
}

function normalizeRoutes(toolRoutes) {
    if (!toolRoutes || typeof toolRoutes !== 'object' || Array.isArray(toolRoutes)) {
        throw new Error('invalid_tool_routes');
    }
    return Object.freeze(Object.fromEntries(Object.entries(toolRoutes).map(([key, route]) => {
        if (!route || typeof route !== 'object' || Array.isArray(route)) throw new Error('invalid_tool_route');
        const tool = String(route.tool || '').trim();
        const claimMetric = String(route.claimMetric || '').trim();
        const requiredFilters = Array.isArray(route.requiredFilters)
            ? [...new Set(route.requiredFilters.map(value => String(value || '').trim()))]
            : [];
        if (!String(key).includes('.') || !tool || !claimMetric || requiredFilters.some(value => !value)) {
            throw new Error('invalid_tool_route');
        }
        return [key, Object.freeze({
            tool,
            claimMetric,
            requiredFilters: Object.freeze(requiredFilters)
        })];
    })));
}

function missingRequiredFilter(plan, route) {
    return route.requiredFilters.some(key => (
        !Object.hasOwn(plan.filters, key) ||
        plan.filters[key] === null ||
        plan.filters[key] === ''
    ));
}

function createConversationGateway({
    sessionStore,
    toolGateway,
    traceRecorder = null,
    toolRoutes = {},
    budgetFactory = ({ turnId }) => createToolBudgetTracker({ turnId })
} = {}) {
    if (!sessionStore || typeof sessionStore.read !== 'function' || typeof sessionStore.compareAndSwap !== 'function') {
        throw new Error('invalid_session_store');
    }
    if (!toolGateway || typeof toolGateway.execute !== 'function') throw new Error('invalid_tool_gateway');
    if (typeof budgetFactory !== 'function') throw new Error('invalid_budget_factory');
    const routes = normalizeRoutes(toolRoutes);

    async function executeTurn({
        sessionId,
        expectedSessionVersion,
        trustedContext,
        planInput
    } = {}) {
        const session = sessionStore.read(sessionId);
        if (!session || !sameAuthorizedSession(session, trustedContext)) return fail('scope_denied');
        if (session.sessionVersion !== expectedSessionVersion) return fail('session_version_conflict');

        const candidate = planCandidate(planInput, session);
        if (!candidate) return fail('conversation_context_missing');
        const normalized = normalizeFinancialQueryPlan(candidate);
        if (!normalized.ok) return fail('query_plan_invalid');
        const plan = normalized.plan;
        const route = routes[`${plan.domain}.${plan.operation}`];
        if (!route) return fail('tool_route_unavailable');
        if (missingRequiredFilter(plan, route)) return fail('input_missing');
        const expectedClaim = expectedClaimDimensions(plan, trustedContext, route);
        if (!expectedClaim) return fail('query_plan_invalid');
        const tool = route.tool;

        record(traceRecorder, { event: 'turn_started', phase: 'read' });
        const budget = budgetFactory({
            turnId: `${session.sessionId}:${expectedSessionVersion}`
        });
        const toolResult = await toolGateway.execute({
            request: { tool, args: toolArgs(plan) },
            trustedContext,
            budget
        });
        if (!toolResult?.ok) {
            record(traceRecorder, {
                event: 'turn_failed',
                phase: 'read',
                code: String(toolResult?.reason || 'tool_failed'),
                coverage: String(toolResult?.coverage || 'unavailable')
            });
            return fail(String(toolResult?.reason || 'tool_failed'));
        }

        const evidence = verifyTypedClaimEvidence({
            claim: toolResult.claim,
            evidence: toolResult.evidence,
            expected: expectedClaim
        });
        if (!evidence.ok) {
            record(traceRecorder, {
                event: 'turn_failed',
                phase: 'verify',
                code: evidence.reason,
                coverage: String(toolResult.evidence?.coverage || 'unavailable')
            });
            return fail(evidence.reason === 'claim_entity_mismatch' ? 'scope_denied' : evidence.reason);
        }

        const updated = sessionStore.compareAndSwap({
            sessionId,
            expectedVersion: expectedSessionVersion,
            patch: {
                queryContext: {
                    domain: plan.domain,
                    operation: plan.operation,
                    filters: structuredClone(plan.filters),
                    timeBasis: plan.timeBasis
                },
                evidenceRefs: [...toolResult.evidence.refs]
            }
        });
        if (!updated.ok) return fail(updated.reason);

        record(traceRecorder, {
            event: 'turn_completed',
            phase: 'verify',
            code: 'OK',
            coverage: toolResult.evidence.coverage,
            tool
        });
        return {
            ok: true,
            claim: structuredClone(toolResult.claim),
            coverage: toolResult.evidence.coverage,
            sessionVersion: updated.session.sessionVersion
        };
    }

    return Object.freeze({ executeTurn });
}

module.exports = {
    createConversationGateway
};
