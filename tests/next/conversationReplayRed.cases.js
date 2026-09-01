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

function createFixture() {
    const { createMemorySessionStore } = loadNext('session/memorySessionStore');
    const { createReadOnlyToolGateway } = loadNext('tools/readOnlyToolGateway');
    const { createSanitizedTraceRecorder } = loadNext('observability/sanitizedTraceRecorder');
    const { createConversationGateway } = loadNext('conversation/conversationGateway');

    const calls = [];
    const sessionStore = createMemorySessionStore({ now: () => '2042-06-15T12:00:00.000Z' });
    sessionStore.create({ sessionId: 'session-a', familyId: 'family-a', actorId: 'person-a' });
    const toolGateway = createReadOnlyToolGateway({
        catalog: [{
            name: 'expenses.sum',
            mode: 'read_only',
            allowedArgs: ['period', 'scope', 'category', 'timeBasis'],
            allowedResultFields: ['ok', 'claim', 'evidence', 'coverage']
        }],
        adapters: {
            'expenses.sum': async ({ args, authorizedContext }) => {
                calls.push({ args, authorizedContext });
                return {
                    ok: true,
                    claim: {
                        metric: 'expense_total',
                        value: args.category === 'food' ? 30000 : 169400,
                        unit: 'BRL_MINOR',
                        entity: { kind: 'family', ref: 'family-a' },
                        period: { type: 'month', value: args.period },
                        timeBasis: args.timeBasis
                    },
                    evidence: {
                        coverage: 'complete',
                        state: 'confirmed',
                        refs: ['source-complete-june']
                    },
                    coverage: 'complete'
                };
            }
        }
    });
    const traceRecorder = createSanitizedTraceRecorder();
    const conversation = createConversationGateway({
        sessionStore,
        toolGateway,
        traceRecorder,
        toolRoutes: {
            'expenses.sum': {
                tool: 'expenses.sum',
                claimMetric: 'expense_total',
                requiredFilters: ['scope', 'period']
            }
        }
    });
    return { calls, conversation, sessionStore, traceRecorder };
}

test('NEXT01 RED: synthetic initial query traverses the read-only gateway without network', async () => {
    const { runHermeticReplay } = loadNext('replay/hermeticReplayRunner');
    const { calls, conversation, sessionStore } = createFixture();

    const result = await runHermeticReplay(() => conversation.executeTurn({
        sessionId: 'session-a',
        expectedSessionVersion: 1,
        trustedContext: { familyId: 'family-a', actorId: 'person-a' },
        planInput: {
            kind: 'financial_query',
            domain: 'expenses',
            operation: 'sum',
            filters: { scope: 'family', period: '2042-06' },
            timeBasis: 'transaction_date'
        }
    }));

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.claim.value, 169400);
    assert.strictEqual(result.sessionVersion, 2);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].authorizedContext.familyId, 'family-a');
    assert.deepStrictEqual(sessionStore.read('session-a').queryContext.filters, {
        scope: 'family',
        period: '2042-06'
    });
});

test('NEXT01 RED: follow-up restores versioned context and stale version fails before tool execution', async () => {
    const { runHermeticReplay } = loadNext('replay/hermeticReplayRunner');
    const { calls, conversation } = createFixture();

    const first = await runHermeticReplay(() => conversation.executeTurn({
        sessionId: 'session-a',
        expectedSessionVersion: 1,
        trustedContext: { familyId: 'family-a', actorId: 'person-a' },
        planInput: {
            domain: 'expenses',
            operation: 'sum',
            filters: { scope: 'family', period: '2042-06' },
            timeBasis: 'transaction_date'
        }
    }));
    assert.strictEqual(first.ok, true);

    const followUp = await runHermeticReplay(() => conversation.executeTurn({
        sessionId: 'session-a',
        expectedSessionVersion: 2,
        trustedContext: { familyId: 'family-a', actorId: 'person-a' },
        planInput: {
            domain: 'expenses',
            operation: 'sum',
            filters: { category: 'food' },
            timeBasis: 'context',
            needsContext: true
        }
    }));

    assert.strictEqual(followUp.ok, true);
    assert.strictEqual(followUp.claim.value, 30000);
    assert.deepStrictEqual(calls[1].args, {
        period: '2042-06',
        scope: 'family',
        category: 'food',
        timeBasis: 'transaction_date'
    });

    const stale = await runHermeticReplay(() => conversation.executeTurn({
        sessionId: 'session-a',
        expectedSessionVersion: 2,
        trustedContext: { familyId: 'family-a', actorId: 'person-a' },
        planInput: {
            domain: 'expenses',
            operation: 'sum',
            filters: { category: 'transport' },
            timeBasis: 'context',
            needsContext: true
        }
    }));
    assert.deepStrictEqual(stale, { ok: false, reason: 'session_version_conflict' });
    assert.strictEqual(calls.length, 2);
});

test('NEXT01 RED: mismatched trusted scope and incomplete evidence fail closed', async () => {
    const { createMemorySessionStore } = loadNext('session/memorySessionStore');
    const { createReadOnlyToolGateway } = loadNext('tools/readOnlyToolGateway');
    const { createConversationGateway } = loadNext('conversation/conversationGateway');

    let calls = 0;
    const sessionStore = createMemorySessionStore();
    sessionStore.create({ sessionId: 'session-a', familyId: 'family-a', actorId: 'person-a' });
    const toolGateway = createReadOnlyToolGateway({
        catalog: [{
            name: 'expenses.sum',
            mode: 'read_only',
            allowedArgs: ['period', 'scope', 'timeBasis'],
            allowedResultFields: ['ok', 'claim', 'evidence', 'coverage']
        }],
        adapters: {
            'expenses.sum': async ({ args }) => {
                calls += 1;
                return {
                    ok: true,
                    claim: {
                        metric: 'expense_total', value: 0, unit: 'BRL_MINOR',
                        entity: { kind: 'family', ref: 'family-a' },
                        period: { type: 'month', value: args.period },
                        timeBasis: args.timeBasis
                    },
                    evidence: { coverage: 'incomplete', state: 'incomplete', refs: ['source-partial'] },
                    coverage: 'incomplete'
                };
            }
        }
    });
    const conversation = createConversationGateway({
        sessionStore,
        toolGateway,
        toolRoutes: {
            'expenses.sum': {
                tool: 'expenses.sum', claimMetric: 'expense_total',
                requiredFilters: ['scope', 'period']
            }
        }
    });

    const denied = await conversation.executeTurn({
        sessionId: 'session-a', expectedSessionVersion: 1,
        trustedContext: { familyId: 'family-b', actorId: 'person-a' },
        planInput: { domain: 'expenses', operation: 'sum', filters: { scope: 'family', period: '2042-06' } }
    });
    assert.deepStrictEqual(denied, { ok: false, reason: 'scope_denied' });
    assert.strictEqual(calls, 0);

    const incomplete = await conversation.executeTurn({
        sessionId: 'session-a', expectedSessionVersion: 1,
        trustedContext: { familyId: 'family-a', actorId: 'person-a' },
        planInput: { domain: 'expenses', operation: 'sum', filters: { scope: 'family', period: '2042-06' } }
    });
    assert.deepStrictEqual(incomplete, { ok: false, reason: 'coverage_insufficient' });
    assert.strictEqual(calls, 1);
});

test('NEXT01 RED: a typed claim from another family is rejected as a scope violation', async () => {
    const { createMemorySessionStore } = loadNext('session/memorySessionStore');
    const { createReadOnlyToolGateway } = loadNext('tools/readOnlyToolGateway');
    const { createConversationGateway } = loadNext('conversation/conversationGateway');

    const sessionStore = createMemorySessionStore();
    sessionStore.create({ sessionId: 'session-a', familyId: 'family-a', actorId: 'person-a' });
    const toolGateway = createReadOnlyToolGateway({
        catalog: [{
            name: 'expenses.sum', mode: 'read_only',
            allowedArgs: ['period', 'scope', 'timeBasis'],
            allowedResultFields: ['ok', 'claim', 'evidence', 'coverage']
        }],
        adapters: {
            'expenses.sum': async ({ args }) => ({
                ok: true,
                claim: {
                    metric: 'expense_total', value: 12300, unit: 'BRL_MINOR',
                    entity: { kind: 'family', ref: 'family-b' },
                    period: { type: 'month', value: args.period },
                    timeBasis: args.timeBasis
                },
                evidence: { coverage: 'complete', state: 'confirmed', refs: ['source-family-b'] },
                coverage: 'complete'
            })
        }
    });
    const conversation = createConversationGateway({
        sessionStore,
        toolGateway,
        toolRoutes: {
            'expenses.sum': {
                tool: 'expenses.sum', claimMetric: 'expense_total',
                requiredFilters: ['scope', 'period']
            }
        }
    });

    const result = await conversation.executeTurn({
        sessionId: 'session-a', expectedSessionVersion: 1,
        trustedContext: { familyId: 'family-a', actorId: 'person-a' },
        planInput: {
            domain: 'expenses', operation: 'sum',
            filters: { scope: 'family', period: '2042-06' },
            timeBasis: 'transaction_date'
        }
    });
    assert.deepStrictEqual(result, { ok: false, reason: 'scope_denied' });
});

test('NEXT01 RED: route contract rejects missing dimensions and wrong claim metric', async () => {
    const { createMemorySessionStore } = loadNext('session/memorySessionStore');
    const { createReadOnlyToolGateway } = loadNext('tools/readOnlyToolGateway');
    const { createConversationGateway } = loadNext('conversation/conversationGateway');
    const sessionStore = createMemorySessionStore();
    sessionStore.create({ sessionId: 'session-a', familyId: 'family-a', actorId: 'person-a' });
    let calls = 0;
    const toolGateway = createReadOnlyToolGateway({
        catalog: [{
            name: 'expenses.sum', mode: 'read_only',
            allowedArgs: ['period', 'scope', 'timeBasis'],
            allowedResultFields: ['ok', 'claim', 'evidence', 'coverage']
        }],
        adapters: {
            'expenses.sum': async ({ args }) => {
                calls += 1;
                return {
                    ok: true,
                    claim: {
                        metric: 'income_total', value: 100, unit: 'BRL_MINOR',
                        entity: { kind: 'family', ref: 'family-a' },
                        period: { type: 'month', value: args.period },
                        timeBasis: args.timeBasis
                    },
                    evidence: { coverage: 'complete', state: 'confirmed', refs: ['source-a'] },
                    coverage: 'complete'
                };
            }
        }
    });
    const conversation = createConversationGateway({
        sessionStore,
        toolGateway,
        toolRoutes: {
            'expenses.sum': {
                tool: 'expenses.sum', claimMetric: 'expense_total',
                requiredFilters: ['scope', 'period']
            }
        }
    });

    assert.deepStrictEqual(await conversation.executeTurn({
        sessionId: 'session-a', expectedSessionVersion: 1,
        trustedContext: { familyId: 'family-a', actorId: 'person-a' },
        planInput: {
            domain: 'expenses', operation: 'sum',
            filters: { scope: 'family' }, timeBasis: 'transaction_date'
        }
    }), { ok: false, reason: 'input_missing' });
    assert.strictEqual(calls, 0);

    assert.deepStrictEqual(await conversation.executeTurn({
        sessionId: 'session-a', expectedSessionVersion: 1,
        trustedContext: { familyId: 'family-a', actorId: 'person-a' },
        planInput: {
            domain: 'expenses', operation: 'sum',
            filters: { scope: 'family', period: '2042-06' }, timeBasis: 'transaction_date'
        }
    }), { ok: false, reason: 'claim_metric_mismatch' });
    assert.strictEqual(calls, 1);
});
