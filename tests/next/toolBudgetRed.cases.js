 'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function loadNext(relativePath) {
    const absolutePath = path.join(ROOT, 'src', 'next', relativePath);
    try {
        return require(absolutePath);
    } catch (error) {
        if (error?.code === 'MODULE_NOT_FOUND' && String(error.message).includes(absolutePath)) {
            assert.fail(`NEXT01_RED_MISSING_MODULE:${relativePath}`);
        }
        throw error;
    }
}

test('NEXT01 RED: budget enforces soft, hard, repeat and timeout limits', () => {
    const { createToolBudgetTracker } = loadNext('policy/toolBudget');
    let now = 1000;
    const budget = createToolBudgetTracker({ turnId: 'turn-a', now: () => now });

    for (let index = 1; index <= 6; index += 1) {
        const reserved = budget.reserve({ tool: `read.${index}`, args: { index } });
        assert.strictEqual(reserved.ok, true);
        assert.strictEqual(reserved.softBudgetReached, index === 6);
    }
    for (let index = 7; index <= 12; index += 1) {
        assert.strictEqual(budget.reserve({ tool: `read.${index}`, args: { index } }).ok, true);
    }
    assert.deepStrictEqual(budget.reserve({ tool: 'read.13', args: { index: 13 } }), {
        ok: false,
        reason: 'BUDGET_EXHAUSTED'
    });

    const repeated = createToolBudgetTracker({ turnId: 'turn-b', now: () => now });
    assert.strictEqual(repeated.reserve({ tool: 'balance.get', args: { period: '2042-06' } }).ok, true);
    assert.deepStrictEqual(repeated.reserve({ tool: 'balance.get', args: { period: '2042-06' } }), {
        ok: false,
        reason: 'REPEAT_NOT_ALLOWED'
    });
    assert.strictEqual(repeated.reserve({
        tool: 'balance.get', args: { period: '2042-06' }, retryable: true
    }).ok, true);
    assert.deepStrictEqual(repeated.reserve({
        tool: 'balance.get', args: { period: '2042-06' }, sourceVersionChanged: true
    }), {
        ok: false,
        reason: 'REPEATED_CALL_LIMIT'
    });

    const timed = createToolBudgetTracker({ turnId: 'turn-c', now: () => now });
    now += 30000;
    assert.deepStrictEqual(timed.reserve({ tool: 'balance.get', args: {} }), {
        ok: false,
        reason: 'BUDGET_EXHAUSTED'
    });
});

test('NEXT01 RED: budget exposes the remaining frozen envelope limits fail-closed', () => {
    const { createToolBudgetTracker } = loadNext('policy/toolBudget');
    const budget = createToolBudgetTracker({ turnId: 'turn-envelope', now: () => 1000 });

    assert.deepStrictEqual(budget.reserveParallelReads({ count: 3 }), { ok: true });
    assert.deepStrictEqual(budget.reserveParallelReads({ count: 4 }), {
        ok: false, reason: 'PARALLEL_READ_LIMIT'
    });
    for (let index = 0; index < 4; index += 1) assert.strictEqual(budget.reserveDecisionRound().ok, true);
    assert.deepStrictEqual(budget.reserveDecisionRound(), {
        ok: false, reason: 'DECISION_ROUND_LIMIT'
    });
    assert.strictEqual(budget.reserveClarification().ok, true);
    assert.strictEqual(budget.reserveClarification().ok, true);
    assert.deepStrictEqual(budget.reserveClarification(), {
        ok: false, reason: 'CLARIFICATION_LIMIT'
    });
    assert.strictEqual(budget.reserveRecomposition().ok, true);
    assert.deepStrictEqual(budget.reserveRecomposition(), {
        ok: false, reason: 'RECOMPOSITION_LIMIT'
    });
});

test('NEXT01 RED: Tool Gateway refuses an allowed call without a trusted budget', async () => {
    const { createReadOnlyToolGateway } = loadNext('tools/readOnlyToolGateway');
    let calls = 0;
    const gateway = createReadOnlyToolGateway({
        catalog: [{
            name: 'balance.get', mode: 'read_only', allowedArgs: [],
            allowedResultFields: ['ok', 'value', 'coverage']
        }],
        adapters: {
            'balance.get': async () => {
                calls += 1;
                return { ok: true, value: 0, coverage: 'complete' };
            }
        }
    });

    assert.deepStrictEqual(await gateway.execute({
        request: { tool: 'balance.get', args: {} },
        trustedContext: { familyId: 'family-a', actorId: 'person-a' }
    }), {
        ok: false,
        reason: 'budget_missing',
        coverage: 'unavailable',
        tool: 'balance.get'
    });
    assert.strictEqual(calls, 0);
});

test('NEXT01 RED: conversation maps an exhausted budget to fail-closed without tool execution', async () => {
    const { createMemorySessionStore } = loadNext('session/memorySessionStore');
    const { createReadOnlyToolGateway } = loadNext('tools/readOnlyToolGateway');
    const { createConversationGateway } = loadNext('conversation/conversationGateway');
    const sessionStore = createMemorySessionStore();
    sessionStore.create({ sessionId: 'session-a', familyId: 'family-a', actorId: 'person-a' });
    let calls = 0;
    const toolGateway = createReadOnlyToolGateway({
        catalog: [{
            name: 'expenses.sum', mode: 'read_only',
            allowedArgs: ['scope', 'period', 'timeBasis'],
            allowedResultFields: ['ok']
        }],
        adapters: { 'expenses.sum': async () => { calls += 1; return { ok: true }; } }
    });
    const conversation = createConversationGateway({
        sessionStore,
        toolGateway,
        toolRoutes: {
            'expenses.sum': {
                tool: 'expenses.sum', claimMetric: 'expense_total',
                requiredFilters: ['scope', 'period']
            }
        },
        budgetFactory: () => ({
            reserve: () => ({ ok: false, reason: 'BUDGET_EXHAUSTED' })
        })
    });

    assert.deepStrictEqual(await conversation.executeTurn({
        sessionId: 'session-a', expectedSessionVersion: 1,
        trustedContext: { familyId: 'family-a', actorId: 'person-a' },
        planInput: {
            domain: 'expenses', operation: 'sum',
            filters: { scope: 'family', period: '2042-06' },
            timeBasis: 'transaction_date'
        }
    }), { ok: false, reason: 'BUDGET_EXHAUSTED' });
    assert.strictEqual(calls, 0);
});
