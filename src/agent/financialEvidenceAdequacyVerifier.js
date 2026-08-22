const { normalizeText } = require('../utils/helpers');
const { verifyAgentAnswer } = require('./resultVerifier');
const { sanitizeExecutedPlan } = require('./financialAgentTrajectory');

const NON_DIMENSION_FILTERS = new Set(['period', 'scope', 'member']);
const PROVEN_SOURCES = new Set(['', 'none', 'unknown', 'unavailable']);

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.keys(value).sort().map(key => [key, stableValue(value[key])])
    );
}

function sameValue(left, right) {
    return JSON.stringify(stableValue(left ?? null)) === JSON.stringify(stableValue(right ?? null));
}

function comparableValue(value) {
    if (Array.isArray(value)) return value.map(comparableValue);
    if (!value || typeof value !== 'object') {
        return typeof value === 'string' ? comparable(value) : value;
    }
    return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, comparableValue(child)])
    );
}

function comparable(value) {
    return normalizeText(String(value || '').trim());
}

function resultCheck(ok, reason = null, extra = {}) {
    return { ok: Boolean(ok), ...(reason ? { reason } : {}), ...extra };
}

function normalizePlan(value = null) {
    return sanitizeExecutedPlan(value);
}

function deriveReadPlan(execution = null) {
    const request = execution?.request || {};
    const result = execution?.result || {};
    const direct = normalizePlan(result.plan || request?.args?.plan);
    if (direct) return direct;

    const evidenceScope = result?.evidence?.provenance?.scope;
    if (request.tool === 'list_recent_transactions') {
        const eventTypes = Array.isArray(request?.args?.eventTypes)
            ? request.args.eventTypes.map(String)
            : [];
        const domain = eventTypes.includes('income')
            ? 'income'
            : eventTypes.includes('transfer')
                ? 'transfers'
                : eventTypes.includes('card_expense')
                    ? 'cards'
                    : 'expenses';
        return normalizePlan({
            kind: 'financial_query',
            domain,
            operation: 'list',
            filters: {
                period: { type: 'all_time' },
                scope: evidenceScope === 'family' ? 'family' : 'personal',
                ...(request?.args?.card ? { card: request.args.card } : {})
            },
            groupBy: [],
            sort: { by: 'date', direction: 'desc' },
            limit: Number(request?.args?.limit) || 5,
            needsContext: false,
            timeBasis: 'transaction_date',
            answerStyle: 'detailed'
        });
    }

    if (request.tool === 'get_dashboard_snapshot' || request.tool === 'explain_metric') {
        const month = Number(request?.args?.month);
        const year = Number(request?.args?.year);
        return normalizePlan({
            kind: 'financial_query',
            domain: 'dashboard',
            operation: request.tool === 'explain_metric' ? 'explain' : 'detail',
            filters: {
                period: Number.isInteger(month) && Number.isInteger(year)
                    ? { type: 'month', month, year }
                    : { type: 'current_month' },
                scope: evidenceScope === 'family' ? 'family' : 'personal'
            },
            groupBy: [],
            sort: { by: 'date', direction: 'desc' },
            limit: 20,
            needsContext: false,
            timeBasis: 'transaction_date',
            answerStyle: request.tool === 'explain_metric' ? 'audit' : 'detailed'
        });
    }
    return null;
}

function numericalCheck(answer, executions = []) {
    const toolResult = executions.length === 1
        ? executions[0]?.result || {}
        : {
            tool: 'shadow_evidence_bundle',
            evidenceResults: executions.map(execution => execution?.result || {})
        };
    const verified = verifyAgentAnswer(answer, { toolResult });
    return resultCheck(verified.ok, verified.ok ? null : verified.reason || 'numerical_verification_failed');
}

function personCheck(
    expectedPlan = null,
    actualPlan = null,
    evidence = null,
    expectedScopeOverride = '',
    answer = '',
    knownPeople = []
) {
    if (!expectedPlan || !actualPlan) return resultCheck(false, 'person_unproven');
    const evidenceScope = comparable(evidence?.provenance?.scope);
    const expectedScope = comparable(expectedPlan.filters?.scope || expectedScopeOverride || evidenceScope);
    const actualScope = comparable(actualPlan.filters?.scope || evidenceScope);
    const expectedMember = comparable(expectedPlan.filters?.member);
    const actualMember = comparable(actualPlan.filters?.member);
    if (expectedScope !== actualScope || expectedMember !== actualMember) {
        return resultCheck(false, 'person_mismatch');
    }
    if (!evidenceScope || evidenceScope === 'none') return resultCheck(false, 'person_scope_unproven');
    if (expectedScope === 'family' && evidenceScope !== 'family') {
        return resultCheck(false, 'person_scope_mismatch');
    }
    if (expectedScope === 'personal' && evidenceScope !== 'personal') {
        return resultCheck(false, 'person_scope_mismatch');
    }
    if (expectedMember) {
        const normalizedAnswer = comparable(answer);
        const conflictingPerson = (Array.isArray(knownPeople) ? knownPeople : [])
            .map(comparable)
            .filter(Boolean)
            .some(person => person !== expectedMember && normalizedAnswer.includes(person));
        if (conflictingPerson) return resultCheck(false, 'answer_person_mismatch');
    }
    return resultCheck(true);
}

function periodCheck(expectedPlan = null, actualPlan = null) {
    if (!expectedPlan || !actualPlan) return resultCheck(false, 'period_unproven');
    return sameValue(expectedPlan.filters?.period, actualPlan.filters?.period)
        ? resultCheck(true)
        : resultCheck(false, 'period_mismatch');
}

function timeBasisCheck(expectedPlan = null, actualPlan = null) {
    if (!expectedPlan || !actualPlan) return resultCheck(false, 'time_basis_unproven');
    return comparable(expectedPlan.timeBasis) === comparable(actualPlan.timeBasis)
        ? resultCheck(true)
        : resultCheck(false, 'time_basis_mismatch');
}

function dimensionProjection(plan = null) {
    if (!plan) return null;
    const filters = Object.fromEntries(
        Object.entries(plan.filters || {}).filter(([key]) => !NON_DIMENSION_FILTERS.has(key))
    );
    return {
        domain: comparable(plan.domain),
        operation: comparable(plan.operation),
        groupBy: Array.isArray(plan.groupBy) ? plan.groupBy.map(comparable) : [],
        filters: comparableValue(filters)
    };
}

function dimensionsCheck(expectedPlan = null, actualPlan = null) {
    if (!expectedPlan || !actualPlan) return resultCheck(false, 'dimensions_unproven');
    return sameValue(dimensionProjection(expectedPlan), dimensionProjection(actualPlan))
        ? resultCheck(true)
        : resultCheck(false, 'dimension_mismatch');
}

function sourceCheck(evidence = null) {
    const source = comparable(evidence?.provenance?.source);
    const authority = comparable(evidence?.provenance?.authority);
    const mode = comparable(evidence?.mode);
    if (authority !== 'server' || mode !== 'read_only' || PROVEN_SOURCES.has(source)) {
        return resultCheck(false, 'source_unproven');
    }
    return resultCheck(true, null, {
        status: evidence?.provenance?.fallback?.used ? 'fallback_declared' : 'canonical_declared'
    });
}

function answerClaimsAbsence(answer = '') {
    const text = comparable(answer);
    return /\b(?:nao\s+(?:houve|ha|encontrei|existem?)|nenhum[ao]?|zero|sem\s+(?:gastos?|lancamentos?|movimentacoes?|dados))\b/.test(text);
}

function resultProvesZero(toolResult = null) {
    const value = toolResult?.result?.value;
    if (typeof value === 'number') return Number.isFinite(value) && value === 0;
    if (Array.isArray(value)) return value.length === 0;
    if (Array.isArray(value?.items)) return value.items.length === 0;
    if (Array.isArray(toolResult?.rows)) return toolResult.rows.length === 0;
    const count = Number(toolResult?.result?.details?.count);
    return Number.isFinite(count) && count === 0;
}

function absenceCheck(evidence = null, toolResult = null, answer = '') {
    if (!evidence) return resultCheck(false, 'missing_evidence');
    const coverage = comparable(evidence.coverage?.status);
    if (toolResult?.ok !== true || evidence.failure || coverage === 'unavailable') {
        return resultCheck(false, 'source_unavailable', { status: 'unavailable' });
    }
    if (coverage === 'empty') {
        return Number(evidence.coverage?.itemCount) === 0
            ? resultCheck(true, null, { status: 'explicit_empty' })
            : resultCheck(false, 'empty_unproven', { status: 'unknown' });
    }
    if (coverage === 'available') {
        if (answerClaimsAbsence(answer) && !resultProvesZero(toolResult)) {
            return resultCheck(false, 'absence_claim_unsupported', { status: 'available' });
        }
        return resultCheck(true, null, {
            status: resultProvesZero(toolResult) ? 'available_zero' : 'available'
        });
    }
    return resultCheck(false, 'coverage_unproven', { status: coverage || 'unknown' });
}

function verifyFinancialEvidenceAdequacy({
    expectedPlan = null,
    expectedScope = '',
    knownPeople = [],
    executions = [],
    answer = ''
} = {}) {
    const safeExecutions = Array.isArray(executions) ? executions.filter(Boolean).slice(0, 3) : [];
    const finalExecution = safeExecutions[safeExecutions.length - 1] || null;
    const evidence = finalExecution?.result?.evidence || null;
    const expected = normalizePlan(expectedPlan);
    const actual = deriveReadPlan(finalExecution);
    const checks = {
        numerical: numericalCheck(answer, safeExecutions),
        person: personCheck(expected, actual, evidence, expectedScope, answer, knownPeople),
        period: periodCheck(expected, actual),
        timeBasis: timeBasisCheck(expected, actual),
        dimensions: dimensionsCheck(expected, actual),
        source: sourceCheck(evidence),
        absence: absenceCheck(evidence, finalExecution?.result, answer)
    };
    const ok = Object.values(checks).every(check => check.ok === true);
    return {
        schemaVersion: 1,
        ok,
        status: ok ? 'adequate' : 'inadequate',
        checks,
        reasons: Object.values(checks).filter(check => !check.ok).map(check => check.reason)
    };
}

module.exports = {
    verifyFinancialEvidenceAdequacy,
    __test__: {
        deriveReadPlan,
        dimensionProjection,
        comparableValue,
        sameValue,
        numericalCheck,
        personCheck,
        periodCheck,
        timeBasisCheck,
        dimensionsCheck,
        sourceCheck,
        absenceCheck,
        answerClaimsAbsence,
        resultProvesZero
    }
};
