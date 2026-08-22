const test = require('node:test');
const assert = require('node:assert');

const {
    executeFinancialSemanticRead,
    listFinancialSemanticCapabilities
} = require('../src/agent/financialSemanticReadFacade');
const { buildContextPacket } = require('../src/agent/contextualFinancialAnalyst');

function trustedContext(overrides = {}) {
    return {
        userIds: ['trusted-daniel', 'trusted-thais'],
        ownerUserId: 'trusted-daniel',
        personByUserId: {
            'trusted-daniel': 'Daniel',
            'trusted-thais': 'Thais'
        },
        currentDate: '2026-08-22',
        canonicalLedgerDbPath: 'trusted-ledger.sqlite',
        ...overrides
    };
}

test('semantic read facade keeps identity and scope exclusively server-authorized', async () => {
    let received = null;
    const adapters = {
        query_financial_plan: async input => {
            received = input;
            return {
                ok: true,
                tool: 'query_financial_plan',
                plan: input.plan,
                result: { value: 42 },
                criteria: { scope: 'family' }
            };
        }
    };

    const output = await executeFinancialSemanticRead({
        request: {
            tool: 'query_financial_plan',
            args: {
                plan: {
                    kind: 'financial_query',
                    domain: 'expenses',
                    operation: 'sum',
                    filters: { period: { type: 'month', month: 8, year: 2026 } },
                    timeBasis: 'transaction_date'
                },
                userIds: ['attacker'],
                ownerUserId: 'attacker',
                personByUserId: { attacker: 'Attacker' },
                canonicalLedgerDbPath: 'attacker.sqlite'
            }
        },
        trustedContext: trustedContext(),
        adapters
    });

    assert.strictEqual(output.ok, true);
    assert.deepStrictEqual(received.userIds, ['trusted-daniel', 'trusted-thais']);
    assert.strictEqual(received.ownerUserId, 'trusted-daniel');
    assert.deepStrictEqual(received.personByUserId, {
        'trusted-daniel': 'Daniel',
        'trusted-thais': 'Thais'
    });
    assert.strictEqual(received.canonicalLedgerDbPath, 'trusted-ledger.sqlite');
    assert.doesNotMatch(JSON.stringify(output.evidence), /trusted-daniel|trusted-thais|attacker|\.sqlite/i);
});

test('semantic read facade fails closed before adapters when trusted scope is absent', async () => {
    let calls = 0;
    const output = await executeFinancialSemanticRead({
        request: { tool: 'list_recent_transactions', args: { limit: 2 } },
        trustedContext: trustedContext({ userIds: [], ownerUserId: '', personByUserId: {} }),
        adapters: {
            list_recent_transactions: async () => {
                calls += 1;
                return { ok: true, rows: [] };
            }
        }
    });

    assert.strictEqual(calls, 0);
    assert.strictEqual(output.ok, false);
    assert.strictEqual(output.reason, 'missing_authorized_scope');
    assert.strictEqual(output.evidence.coverage.status, 'unavailable');
});

test('semantic read facade standardizes source, fallback, coverage and sanitized evidence', async () => {
    const output = await executeFinancialSemanticRead({
        request: { tool: 'list_recent_transactions', args: { limit: 2 } },
        trustedContext: trustedContext(),
        adapters: {
            list_recent_transactions: async () => ({
                ok: true,
                tool: 'list_recent_transactions',
                source: 'legacy',
                fallbackReason: 'canonical_partial_window',
                rows: [
                    { description: 'mercado', amount: 10, user_id: 'private-user' },
                    { description: 'lanche', amount: 5, owner_hash: 'private-owner' }
                ],
                criteria: { limit: 2, sheet_id: 'private-sheet' }
            })
        }
    });

    assert.strictEqual(output.ok, true);
    assert.strictEqual(output.evidence.schemaVersion, 1);
    assert.strictEqual(output.evidence.capability, 'recent_transactions');
    assert.strictEqual(output.evidence.provenance.source, 'legacy');
    assert.strictEqual(output.evidence.provenance.fallback.used, true);
    assert.strictEqual(output.evidence.provenance.fallback.reason, 'canonical_partial_window');
    assert.strictEqual(output.evidence.coverage.status, 'available');
    assert.strictEqual(output.evidence.coverage.itemCount, 2);
    assert.strictEqual(output.evidence.payload.rows[0].description, 'mercado');
    assert.doesNotMatch(JSON.stringify(output.evidence), /private-user|private-owner|private-sheet|user_id|owner_hash|sheet_id/i);
});

test('semantic read facade distinguishes empty and unavailable evidence', async () => {
    const empty = await executeFinancialSemanticRead({
        request: { tool: 'list_recent_transactions', args: {} },
        trustedContext: trustedContext(),
        adapters: {
            list_recent_transactions: async () => ({ ok: true, tool: 'list_recent_transactions', source: 'canonical', rows: [] })
        }
    });
    const unavailable = await executeFinancialSemanticRead({
        request: { tool: 'get_dashboard_snapshot', args: { month: 8, year: 2026 } },
        trustedContext: trustedContext(),
        adapters: {
            get_dashboard_snapshot: async () => ({ ok: false, tool: 'get_dashboard_snapshot', reason: 'dashboard_snapshot_unavailable' })
        }
    });

    assert.strictEqual(empty.evidence.coverage.status, 'empty');
    assert.strictEqual(empty.evidence.coverage.itemCount, 0);
    assert.strictEqual(unavailable.evidence.coverage.status, 'unavailable');
    assert.strictEqual(unavailable.evidence.failure.reason, 'dashboard_snapshot_unavailable');
});

test('semantic read facade exposes only the existing read-only capability set', async () => {
    const capabilities = listFinancialSemanticCapabilities();
    assert.deepStrictEqual(capabilities.map(item => item.tool).sort(), [
        'explain_metric',
        'get_dashboard_snapshot',
        'list_recent_transactions',
        'query_financial_plan',
        'run_safe_readonly_sql'
    ]);
    assert.ok(capabilities.every(item => item.mode === 'read_only'));
    assert.ok(capabilities.every(item => item.acceptsIdentityFromModel === false));

    const rejected = await executeFinancialSemanticRead({
        request: { tool: 'write_transaction', args: { amount: 10 } },
        trustedContext: trustedContext(),
        adapters: {}
    });
    assert.strictEqual(rejected.ok, false);
    assert.strictEqual(rejected.reason, 'tool_not_allowed');
});

test('contextual reasoner consumes the standardized envelope without duplicating raw tool output', () => {
    const packet = buildContextPacket({
        message: 'quanto gastei?',
        plan: { action: 'tool', tool: 'query_financial_plan' },
        toolResult: {
            ok: true,
            tool: 'query_financial_plan',
            result: { value: 999999 },
            evidence: {
                schemaVersion: 1,
                capability: 'financial_query',
                coverage: { status: 'available', itemCount: null },
                payload: { result: { value: 42 } }
            }
        },
        deterministicAnswer: 'R$ 42,00'
    });

    assert.strictEqual(packet.result.payload.result.value, 42);
    assert.doesNotMatch(JSON.stringify(packet.result), /999999/);
});
