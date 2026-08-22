const test = require('node:test');
const assert = require('node:assert');

const {
    compareShadowEvidence,
    runFinancialIterativeShadow: runPublicFinancialIterativeShadow,
    __test__: shadowTest
} = require('../src/agent/financialIterativeShadowAgent');
const runFinancialIterativeShadow = shadowTest.runFinancialIterativeShadowWithAdapters;

function trustedContext() {
    return {
        userIds: ['private-daniel'],
        ownerUserId: 'private-daniel',
        personByUserId: { 'private-daniel': 'Daniel' },
        currentDate: '2026-08-22',
        canonicalLedgerDbPath: 'private-ledger.sqlite'
    };
}

function readResult(tool, value, extra = {}) {
    return {
        ok: true,
        tool,
        source: 'canonical',
        result: { value },
        criteria: { domain: 'expenses' },
        ...extra
    };
}

test('iterative shadow agent enforces at most three semantic reads', async () => {
    let adapterCalls = 0;
    let reasonerCalls = 0;
    const output = await runFinancialIterativeShadow({
        message: 'investigue meus gastos',
        trajectory: { schemaVersion: 1, context: { scope: 'personal' } },
        trustedContext: trustedContext(),
        reasoner: async () => {
            reasonerCalls += 1;
            return {
                action: 'tool',
                tool: 'query_financial_plan',
                args: { plan: { kind: 'financial_query', domain: 'expenses', operation: 'sum', filters: {} } }
            };
        },
        adapters: {
            query_financial_plan: async () => {
                adapterCalls += 1;
                return readResult('query_financial_plan', adapterCalls);
            }
        },
        maxReads: 99
    });

    assert.strictEqual(adapterCalls, 3);
    assert.strictEqual(reasonerCalls, 4);
    assert.strictEqual(output.readCount, 3);
    assert.strictEqual(output.stopReason, 'read_limit_reached');
    assert.strictEqual(output.visibleResponse, null);
    assert.deepStrictEqual(output.sideEffects, { messagesSent: 0, financialWrites: 0 });
});

test('iterative shadow agent exposes only envelopes to the reasoner and no trusted ids', async () => {
    const observed = [];
    const decisions = [
        { action: 'tool', tool: 'list_recent_transactions', args: { limit: 1 } },
        { action: 'answer', answer: 'resultado candidato' }
    ];
    const output = await runFinancialIterativeShadow({
        message: 'qual foi o último?',
        trajectory: {
            schemaVersion: 1,
            context: { scope: 'personal', ownerUserId: 'private-daniel' },
            tool: { name: 'list_recent_transactions', source: 'canonical', secret: 'nested-secret' },
            coverage: { status: 'available', raw: 'nested-raw' },
            secret: 'must-not-pass'
        },
        trustedContext: trustedContext(),
        reasoner: async context => {
            observed.push(context);
            return decisions.shift();
        },
        adapters: {
            list_recent_transactions: async () => ({
                ok: true,
                tool: 'list_recent_transactions',
                source: 'canonical',
                rows: [{ description: 'lanche', amount: 12, user_id: 'private-daniel' }]
            })
        }
    });

    assert.strictEqual(output.stopReason, 'candidate_answer');
    assert.strictEqual(output.candidate.action, 'answer');
    assert.strictEqual(output.visibleResponse, null);
    assert.strictEqual(observed[1].evidenceHistory.length, 1);
    assert.strictEqual(observed[1].evidenceHistory[0].payload.rows[0].description, 'lanche');
    assert.doesNotMatch(JSON.stringify(observed), /private-daniel|private-ledger|must-not-pass|nested-secret|nested-raw|user_id/i);
});

test('iterative shadow agent rejects writers without executing an adapter', async () => {
    let calls = 0;
    const output = await runFinancialIterativeShadow({
        message: 'salve isto',
        trustedContext: trustedContext(),
        reasoner: async () => ({ action: 'tool', tool: 'write_transaction', args: { amount: 10 } }),
        adapters: {
            write_transaction: async () => {
                calls += 1;
                return { ok: true };
            }
        }
    });

    assert.strictEqual(calls, 0);
    assert.strictEqual(output.readCount, 0);
    assert.strictEqual(output.stopReason, 'tool_rejected');
    assert.strictEqual(output.steps[0].evidence.failure.reason, 'tool_not_allowed');
    assert.deepStrictEqual(output.sideEffects, { messagesSent: 0, financialWrites: 0 });
});

test('iterative shadow agent can refine after empty evidence and stop after a second read', async () => {
    const decisions = [
        { action: 'tool', tool: 'list_recent_transactions', args: { eventTypes: ['income'], limit: 1 } },
        { action: 'tool', tool: 'query_financial_plan', args: { plan: { kind: 'financial_query', domain: 'income', operation: 'sum', filters: {} } } },
        { action: 'clarify', question: 'Qual período você quer analisar?' }
    ];
    const output = await runFinancialIterativeShadow({
        message: 'e minhas entradas?',
        trustedContext: trustedContext(),
        reasoner: async context => {
            if (context.evidenceHistory.length === 1) {
                assert.strictEqual(context.evidenceHistory[0].coverage.status, 'empty');
            }
            return decisions.shift();
        },
        adapters: {
            list_recent_transactions: async () => ({ ok: true, tool: 'list_recent_transactions', source: 'canonical', rows: [] }),
            query_financial_plan: async () => readResult('query_financial_plan', 300)
        }
    });

    assert.strictEqual(output.readCount, 2);
    assert.strictEqual(output.stopReason, 'candidate_clarification');
    assert.strictEqual(output.candidate.action, 'clarify');
    assert.strictEqual(output.visibleResponse, null);
});

test('shadow comparison reports evidence equivalence without exposing payload', () => {
    const envelope = {
        schemaVersion: 1,
        capability: 'financial_query',
        provenance: { source: 'canonical', scope: 'personal', fallback: { used: false, reason: null } },
        coverage: { status: 'available', itemCount: null },
        payload: { result: { value: 125 } }
    };
    const comparison = compareShadowEvidence({
        baselineEvidence: envelope,
        candidateEvidence: JSON.parse(JSON.stringify(envelope))
    });

    assert.strictEqual(comparison.comparable, true);
    assert.strictEqual(comparison.sameCapability, true);
    assert.strictEqual(comparison.sameSource, true);
    assert.strictEqual(comparison.sameCoverage, true);
    assert.strictEqual(comparison.samePayload, true);
    assert.doesNotMatch(JSON.stringify(comparison), /125/);
});

test('iterative shadow agent contains reasoner failure without any side effect', async () => {
    const output = await runFinancialIterativeShadow({
        message: 'investigue',
        trustedContext: trustedContext(),
        reasoner: async () => {
            throw new Error('reasoner unavailable');
        }
    });

    assert.strictEqual(output.stopReason, 'reasoner_failed');
    assert.strictEqual(output.readCount, 0);
    assert.strictEqual(output.visibleResponse, null);
    assert.deepStrictEqual(output.sideEffects, { messagesSent: 0, financialWrites: 0 });
});

test('public iterative shadow runner discards caller-supplied adapters', async () => {
    let injectedAdapterCalls = 0;
    const output = await runPublicFinancialIterativeShadow({
        message: 'quanto gastei?',
        trustedContext: trustedContext(),
        reasoner: async () => ({
            action: 'tool',
            tool: 'query_financial_plan',
            args: { plan: { kind: 'financial_query', domain: 'expenses', operation: 'sum' } }
        }),
        adapters: {
            query_financial_plan: async () => {
                injectedAdapterCalls += 1;
                return { ok: true, result: { value: 999999 } };
            }
        }
    });

    assert.strictEqual(injectedAdapterCalls, 0);
    assert.strictEqual(output.sideEffects.messagesSent, 0);
    assert.strictEqual(output.sideEffects.financialWrites, 0);
});
