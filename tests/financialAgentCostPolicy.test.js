const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert');

const {
    createFinancialAgentCostGuard,
    __test__
} = require('../src/agent/financialAgentCostPolicy');
const { planWithGemini, __test__: plannerTest } = require('../src/agent/financialAgentPlanner');
const {
    composeContextualFinancialAnswer,
    __test__: contextualTest
} = require('../src/agent/contextualFinancialAnalyst');

function tempStatePath() {
    return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-agent-cost-')), 'usage.json');
}

test('financial agent cost guard caps a question and persists the monthly call budget', () => {
    const statePath = tempStatePath();
    const env = {
        FINANCIAL_AGENT_MAX_MODEL_CALLS_PER_QUESTION: '1',
        FINANCIAL_AGENT_MAX_MODEL_CALLS_PER_MONTH: '2'
    };
    const now = () => new Date('2026-07-09T12:00:00.000Z');
    const first = createFinancialAgentCostGuard({ env, now, statePath });

    assert.deepStrictEqual(first.reserveModelCall('planner'), { allowed: true, stage: 'planner' });
    assert.deepStrictEqual(first.reserveModelCall('contextual'), {
        allowed: false,
        reason: 'per_question_limit',
        stage: 'contextual'
    });

    const second = createFinancialAgentCostGuard({ env, now, statePath });
    assert.deepStrictEqual(second.reserveModelCall('planner'), { allowed: true, stage: 'planner' });

    const third = createFinancialAgentCostGuard({ env, now, statePath });
    assert.deepStrictEqual(third.reserveModelCall('planner'), {
        allowed: false,
        reason: 'monthly_limit',
        stage: 'planner'
    });
    assert.deepStrictEqual(__test__.readUsage(statePath), {
        version: 1,
        month: '2026-07',
        reservedCalls: 2
    });
});

test('financial agent cost guard resets its aggregate budget in the Sao Paulo month', () => {
    const statePath = tempStatePath();
    const env = {
        FINANCIAL_AGENT_MAX_MODEL_CALLS_PER_QUESTION: '1',
        FINANCIAL_AGENT_MAX_MODEL_CALLS_PER_MONTH: '1'
    };
    const july = createFinancialAgentCostGuard({
        env,
        now: () => new Date('2026-07-31T18:00:00.000Z'),
        statePath
    });
    const august = createFinancialAgentCostGuard({
        env,
        now: () => new Date('2026-08-01T18:00:00.000Z'),
        statePath
    });

    assert.strictEqual(july.reserveModelCall('planner').allowed, true);
    assert.strictEqual(august.reserveModelCall('planner').allowed, true);
    assert.strictEqual(__test__.readUsage(statePath).month, '2026-08');
});

test('financial agent test overrides do not consume a real-model reservation', async () => {
    let reservations = 0;
    plannerTest.setStructuredResponseOverrideForTest(async () => ({
        action: 'clarify',
        question: 'Qual periodo voce quer analisar?'
    }));
    contextualTest.setAskLLMOverride(async () => 'Resposta sintética verificada.');
    const reserveModelCall = () => {
        reservations += 1;
        return { allowed: false, reason: 'per_question_limit' };
    };

    try {
        const plan = await planWithGemini({
            message: 'qual foi meu ultimo gasto?',
            env: { FINANCIAL_AGENT_LLM_PLANNER_ENABLED: 'true' },
            reserveModelCall
        });
        const contextual = await composeContextualFinancialAnswer({
            message: 'qual foi meu ultimo gasto?',
            plan: { action: 'tool', tool: 'list_recent_transactions' },
            toolResult: { ok: true, tool: 'list_recent_transactions', transactions: [] },
            deterministicAnswer: 'Nao houve gasto no periodo.',
            env: { FINANCIAL_CONTEXTUAL_ANALYST_MODE: 'answer' },
            reserveModelCall
        });

        assert.strictEqual(plan.action, 'clarify');
        assert.strictEqual(contextual.ok, true);
        assert.strictEqual(reservations, 0);
    } finally {
        plannerTest.setStructuredResponseOverrideForTest(null);
        contextualTest.setAskLLMOverride(null);
    }
});
