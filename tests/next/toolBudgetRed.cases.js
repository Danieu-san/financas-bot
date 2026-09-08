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

test('NEXT01:N01-BUDGET-001 budget enforces call, repeat and timeout limits', () => {
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

test('NEXT01:N01-BUDGET-002 budget enforces the frozen envelope', async () => {
    const { createToolBudgetTracker } = loadNext('policy/toolBudget');
    const budget = createToolBudgetTracker({ turnId: 'turn-envelope', now: () => 1000 });

    const batch = budget.reserveParallelReads({ count: 3 });
    assert.strictEqual(batch.ok, true);
    assert.deepStrictEqual(budget.reserveParallelReads({ count: 4 }), {
        ok: false, reason: 'PARALLEL_READ_LIMIT'
    });
    assert.deepStrictEqual(budget.reserveParallelReads({ count: 1 }), {
        ok: false, reason: 'PARALLEL_READ_LIMIT'
    });
    batch.release();
    const single = budget.reserveParallelReads({ count: 1 });
    batch.release();
    assert.strictEqual(budget.snapshot().activeReadCalls, 1);
    single.release();

    const { createReadOnlyToolGateway } = loadNext('tools/readOnlyToolGateway');
    const shared = createToolBudgetTracker({ turnId: 'parallel', now: () => 1000 });
    const pending = [];
    let active = 0, peak = 0, calls = 0;
    const configuration = {
        catalog: [{ name: 'read.test', mode: 'read_only', args: { n: 'finite_number' },
            allowedResultFields: ['ok'] }],
        adapters: { 'read.test': () => {
            calls += 1;
            active += 1;
            peak = Math.max(peak, active);
            return new Promise((resolve, reject) => pending.push({ resolve, reject }))
                .finally(() => { active -= 1; });
        } }
    };
    const gateways = [createReadOnlyToolGateway(configuration), createReadOnlyToolGateway(configuration)];
    const invoke = n => gateways[n % 2].execute({ request: { tool: 'read.test', args: { n } },
        trustedContext: { familyId: 'family-a', actorId: 'person-a' }, budget: shared });
    const running = [invoke(0), invoke(1), invoke(2)];
    assert.strictEqual((await invoke(3)).reason, 'PARALLEL_READ_LIMIT');
    assert.strictEqual(calls, 3);
    assert.strictEqual(shared.snapshot().calls, 3);
    assert.strictEqual(peak, 3);
    pending[0].resolve({ ok: true });
    assert.strictEqual((await running[0]).ok, true);
    running.push(invoke(3));
    assert.strictEqual(calls, 4); // rejected args did not consume a fingerprint
    pending[1].reject(new Error('synthetic failure'));
    assert.strictEqual((await running[1]).reason, 'tool_execution_failed');
    pending[2].resolve(null);
    assert.strictEqual((await running[2]).reason, 'invalid_tool_result');
    pending[3].resolve({ ok: true });
    await Promise.all(running);
    assert.strictEqual(shared.snapshot().activeReadCalls, 0);
    assert.strictEqual(peak, 3);

    const throwing = createReadOnlyToolGateway({ ...configuration,
        adapters: { 'read.test': () => { throw new Error('synchronous'); } } });
    const input = { request: { tool: 'read.test', args: { n: 99 } },
        trustedContext: { familyId: 'family-a', actorId: 'person-a' }, budget: shared };
    assert.strictEqual((await throwing.execute(input)).reason, 'tool_execution_failed');
    assert.strictEqual(shared.snapshot().activeReadCalls, 0);
    assert.strictEqual((await throwing.execute(input)).reason, 'REPEAT_NOT_ALLOWED');
    assert.strictEqual(shared.snapshot().activeReadCalls, 0);
    const other = createToolBudgetTracker({ turnId: 'other', now: () => 1000 });
    const occupied = shared.reserveParallelReads({ count: 3 });
    const otherLease = other.reserveParallelReads({ count: 3 });
    assert.strictEqual(otherLease.ok, true);
    otherLease.release();
    occupied.release();
    for (const count of [0, -1, 1.5, NaN, Infinity, '1', null]) {
        assert.strictEqual(shared.reserveParallelReads({ count }).ok, false);
        assert.strictEqual(shared.snapshot().activeReadCalls, 0);
    }
    let clock = 0;
    const expired = createToolBudgetTracker({ turnId: 'expiring', now: () => clock });
    const lease = expired.reserveParallelReads({ count: 1 });
    clock = 30000;
    assert.strictEqual(expired.reserveParallelReads({ count: 1 }).reason, 'BUDGET_EXHAUSTED');
    lease.release();
    assert.strictEqual(expired.snapshot().activeReadCalls, 0);
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

test('NEXT01:N01-BUDGET-003 tool gateway refuses a call without trusted budget', async () => {
    const { createReadOnlyToolGateway } = loadNext('tools/readOnlyToolGateway');
    let calls = 0;
    const gateway = createReadOnlyToolGateway({
        catalog: [{
            name: 'balance.get', mode: 'read_only', args: {},
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

test('NEXT01:N01-BUDGET-004 conversation fails closed on exhausted budget', async () => {
    const { createMemorySessionStore } = loadNext('session/memorySessionStore');
    const { createReadOnlyToolGateway } = loadNext('tools/readOnlyToolGateway');
    const { createConversationGateway } = loadNext('conversation/conversationGateway');
    const sessionStore = createMemorySessionStore();
    sessionStore.create({ sessionId: 'session-a', familyId: 'family-a', actorId: 'person-a' });
    let calls = 0;
    const toolGateway = createReadOnlyToolGateway({
        catalog: [{
            name: 'expenses.sum', mode: 'read_only',
            args: { scope: 'string', period: 'string', timeBasis: 'string' },
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
                periodType: 'month',
                requiredFilters: ['scope', 'period']
            }
        },
        budgetFactory: () => ({
            reserveParallelReads: () => ({ ok: true, release() {} }),
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
