const { createHash } = require('node:crypto');

const POLICY = Object.freeze({
    softToolCalls: 6,
    hardToolCalls: 12,
    maxSameToolArgsFingerprint: 2,
    maxParallelReadCalls: 3,
    maxSequentialDecisionRounds: 4,
    maxClarificationQuestionsPerTurn: 2,
    maxResponseRecompositions: 1,
    totalTrajectoryTimeoutMs: 30000
});

function canonicalize(value, seen = new Set()) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (seen.has(value)) throw new Error('budget_args_not_canonical');
    seen.add(value);
    const serialized = Array.isArray(value)
        ? `[${value.map(item => canonicalize(item, seen)).join(',')}]`
        : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key], seen)}`).join(',')}}`;
    seen.delete(value);
    return serialized;
}

function argsFingerprint(tool, args) {
    return createHash('sha256')
        .update(String(tool || ''))
        .update('\0')
        .update(canonicalize(args ?? {}))
        .digest('hex');
}

function createToolBudgetTracker({ turnId, now = Date.now } = {}) {
    if (!String(turnId || '').trim()) throw new Error('invalid_budget_turn');
    if (typeof now !== 'function') throw new Error('invalid_budget_clock');
    const startedAt = Number(now());
    if (!Number.isFinite(startedAt)) throw new Error('invalid_budget_clock');
    let calls = 0;
    let decisionRounds = 0;
    let clarifications = 0;
    let recompositions = 0;
    const repeated = new Map();

    function budgetExpired() {
        const currentTime = Number(now());
        return !Number.isFinite(currentTime) || currentTime < startedAt ||
            currentTime - startedAt >= POLICY.totalTrajectoryTimeoutMs;
    }

    function reserve({ tool, args = {}, retryable = false, sourceVersionChanged = false } = {}) {
        if (budgetExpired() || calls >= POLICY.hardToolCalls) {
            return { ok: false, reason: 'BUDGET_EXHAUSTED' };
        }
        const name = String(tool || '').trim();
        if (!name) return { ok: false, reason: 'TOOL_SCHEMA_INVALID' };
        let fingerprint;
        try {
            fingerprint = argsFingerprint(name, args);
        } catch (_) {
            return { ok: false, reason: 'TOOL_SCHEMA_INVALID' };
        }
        const prior = repeated.get(fingerprint) || 0;
        if (prior >= POLICY.maxSameToolArgsFingerprint) {
            return { ok: false, reason: 'REPEATED_CALL_LIMIT' };
        }
        if (prior === 1 && retryable !== true && sourceVersionChanged !== true) {
            return { ok: false, reason: 'REPEAT_NOT_ALLOWED' };
        }
        repeated.set(fingerprint, prior + 1);
        calls += 1;
        return {
            ok: true,
            callNumber: calls,
            softBudgetReached: calls >= POLICY.softToolCalls
        };
    }

    function reserveParallelReads({ count } = {}) {
        if (budgetExpired()) return { ok: false, reason: 'BUDGET_EXHAUSTED' };
        if (!Number.isInteger(count) || count < 1 || count > POLICY.maxParallelReadCalls) {
            return { ok: false, reason: 'PARALLEL_READ_LIMIT' };
        }
        return { ok: true };
    }

    function reserveCounter(current, maximum, reason) {
        if (budgetExpired()) return { ok: false, reason: 'BUDGET_EXHAUSTED' };
        if (current >= maximum) return { ok: false, reason };
        return { ok: true };
    }

    function reserveDecisionRound() {
        const result = reserveCounter(decisionRounds, POLICY.maxSequentialDecisionRounds, 'DECISION_ROUND_LIMIT');
        if (result.ok) decisionRounds += 1;
        return result;
    }

    function reserveClarification() {
        const result = reserveCounter(clarifications, POLICY.maxClarificationQuestionsPerTurn, 'CLARIFICATION_LIMIT');
        if (result.ok) clarifications += 1;
        return result;
    }

    function reserveRecomposition() {
        const result = reserveCounter(recompositions, POLICY.maxResponseRecompositions, 'RECOMPOSITION_LIMIT');
        if (result.ok) recompositions += 1;
        return result;
    }

    return Object.freeze({
        reserve,
        reserveParallelReads,
        reserveDecisionRound,
        reserveClarification,
        reserveRecomposition,
        snapshot: () => Object.freeze({
            turnId: String(turnId),
            calls,
            decisionRounds,
            clarifications,
            recompositions,
            softBudgetReached: calls >= POLICY.softToolCalls,
            hardBudgetReached: calls >= POLICY.hardToolCalls
        })
    });
}

module.exports = {
    createToolBudgetTracker
};
