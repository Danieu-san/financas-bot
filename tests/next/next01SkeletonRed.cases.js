 'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
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

test('NEXT01 RED: query plan contract rejects identity supplied by the caller', () => {
    const { normalizeFinancialQueryPlan } = loadNext('contracts/financialQueryPlan');
    const safe = normalizeFinancialQueryPlan({
        kind: 'financial_query',
        domain: 'expenses',
        operation: 'sum',
        filters: { scope: 'family' },
        timeBasis: 'transaction_date'
    });
    const unsafe = normalizeFinancialQueryPlan({
        kind: 'financial_query',
        domain: 'expenses',
        operation: 'sum',
        filters: { scope: 'family', user_id: 'caller-controlled' },
        timeBasis: 'transaction_date'
    });

    assert.strictEqual(safe.ok, true);
    assert.strictEqual(unsafe.ok, false);
    assert.strictEqual(normalizeFinancialQueryPlan({
        domain: 'expenses', operation: 'sum',
        filters: { scope: 'family', source: 'caller-selected-provider' }
    }).ok, false);
    assert.strictEqual(normalizeFinancialQueryPlan({
        domain: 'expenses', operation: 'group', filters: { scope: 'family' },
        groupBy: ['user_id']
    }).ok, false);
    assert.strictEqual(normalizeFinancialQueryPlan({
        domain: 'expenses', operation: 'sum', filters: { scope: 'family' },
        sort: { by: 'db_path', direction: 'asc' }
    }).ok, false);
});

test('NEXT01 RED: tool gateway is read-only and resolves scope only from trusted context', async () => {
    const { createReadOnlyToolGateway } = loadNext('tools/readOnlyToolGateway');
    const { createToolBudgetTracker } = loadNext('policy/toolBudget');
    let calls = 0;
    let received = null;
    const gateway = createReadOnlyToolGateway({
        catalog: [{
            name: 'balance.get',
            mode: 'read_only',
            allowedArgs: ['period'],
            allowedResultFields: ['ok', 'value', 'coverage']
        }],
        adapters: {
            'balance.get': async input => {
                calls += 1;
                received = input;
                return { ok: true, value: 0, coverage: 'complete' };
            }
        }
    });

    const rejected = await gateway.execute({
        request: { tool: 'transaction.write', args: { value: 100 } },
        trustedContext: { familyId: 'family-a', actorId: 'person-a' }
    });
    assert.strictEqual(rejected.ok, false);
    assert.strictEqual(calls, 0);

    const accepted = await gateway.execute({
        request: {
            tool: 'balance.get',
            args: { period: '2042-06', familyId: 'caller-controlled' }
        },
        trustedContext: { familyId: 'family-a', actorId: 'person-a' },
        budget: createToolBudgetTracker({ turnId: 'turn-a' })
    });
    assert.strictEqual(accepted.ok, true);
    assert.strictEqual(received.authorizedContext.familyId, 'family-a');
    assert.strictEqual(Object.hasOwn(received.args, 'familyId'), false);

    assert.throws(() => createReadOnlyToolGateway({
        catalog: [{ name: 'unsafe.write', mode: 'write', allowedArgs: [] }]
    }), /write_capability_forbidden/);
    assert.throws(() => createReadOnlyToolGateway({
        catalog: [{
            name: 'unsafe tool name', mode: 'read_only', allowedArgs: [],
            allowedResultFields: ['ok']
        }]
    }), /invalid_tool_catalog/);
    assert.throws(() => createReadOnlyToolGateway({
        catalog: [{
            name: 'unsafe.identity',
            mode: 'read_only',
            allowedArgs: ['familyId'],
            allowedResultFields: ['ok']
        }]
    }), /caller_identity_arg_forbidden/);
    assert.throws(() => createReadOnlyToolGateway({
        catalog: [{
            name: 'unsafe.secret',
            mode: 'read_only',
            allowedArgs: ['token'],
            allowedResultFields: ['ok']
        }]
    }), /model_boundary_arg_forbidden/);

    const leakingGateway = createReadOnlyToolGateway({
        catalog: [{
            name: 'leak.get',
            mode: 'read_only',
            allowedArgs: [],
            allowedResultFields: ['ok', 'value', 'coverage']
        }],
        adapters: {
            'leak.get': async () => ({
                ok: true,
                value: { amount: 0, provenance: { user_id: 'private-user' } },
                coverage: 'complete'
            })
        }
    });
    assert.deepStrictEqual(await leakingGateway.execute({
        request: { tool: 'leak.get', args: {} },
        trustedContext: { familyId: 'family-a', actorId: 'person-a' },
        budget: createToolBudgetTracker({ turnId: 'turn-b' })
    }), {
        ok: false,
        reason: 'tool_result_schema_violation',
        coverage: 'unavailable',
        tool: 'leak.get'
    });
});

test('NEXT01 RED: session store applies monotonic CAS and rejects stale follow-up', () => {
    const { createMemorySessionStore } = loadNext('session/memorySessionStore');
    const store = createMemorySessionStore({ now: () => '2042-06-15T12:00:00.000Z' });
    const created = store.create({
        sessionId: 'session-a',
        familyId: 'family-a',
        actorId: 'person-a'
    });
    assert.strictEqual(created.sessionVersion, 1);

    const updated = store.compareAndSwap({
        sessionId: 'session-a',
        expectedVersion: 1,
        patch: { subject: 'person-a', period: '2042-06', timeBasis: 'transaction_date' }
    });
    assert.strictEqual(updated.ok, true);
    assert.strictEqual(updated.session.sessionVersion, 2);

    const stale = store.compareAndSwap({
        sessionId: 'session-a',
        expectedVersion: 1,
        patch: { period: '2042-05' }
    });
    assert.deepStrictEqual(stale, { ok: false, reason: 'session_version_conflict' });
    assert.strictEqual(store.read('session-a').period, '2042-06');

    assert.deepStrictEqual(store.compareAndSwap({
        sessionId: 'session-a',
        expectedVersion: 2,
        patch: { rawMessage: 'private conversation text' }
    }), { ok: false, reason: 'invalid_session_patch_field' });
});

test('NEXT01 RED: typed evidence verifier never turns incomplete zero into a proven zero', () => {
    const { verifyTypedClaimEvidence } = loadNext('policy/typedEvidenceVerifier');
    const claim = {
        metric: 'expense_total',
        value: 0,
        unit: 'BRL_MINOR',
        entity: { kind: 'family', ref: 'family-a' },
        period: { type: 'month', value: '2042-06' },
        timeBasis: 'transaction_date'
    };

    const incomplete = verifyTypedClaimEvidence({
        claim,
        evidence: { coverage: 'incomplete', state: 'incomplete', refs: ['source-a'] }
    });
    assert.strictEqual(incomplete.ok, false);
    assert.strictEqual(incomplete.reason, 'coverage_insufficient');

    const complete = verifyTypedClaimEvidence({
        claim,
        evidence: { coverage: 'complete', state: 'confirmed', refs: ['source-a'] }
    });
    assert.strictEqual(complete.ok, true);
});

test('NEXT01 RED: ledger starts empty and exposes no writer capability', () => {
    const { createEmptyLedgerStore } = loadNext('ledger/emptyLedgerStore');
    const ledger = createEmptyLedgerStore();

    assert.deepStrictEqual(ledger.listObservations(), []);
    assert.deepStrictEqual(ledger.listEvents(), []);
    assert.strictEqual(typeof ledger.write, 'undefined');
    assert.strictEqual(typeof ledger.commit, 'undefined');
});

test('NEXT01 RED: observability rejects raw financial and identity payloads', () => {
    const { createSanitizedTraceRecorder } = loadNext('observability/sanitizedTraceRecorder');
    const recorder = createSanitizedTraceRecorder();

    assert.throws(() => recorder.record({
        event: 'tool_result',
        user_id: 'private-user',
        payload: { description: 'private purchase', amount_cents: 12345 }
    }), /unsafe_trace_payload/);

    recorder.record({ event: 'tool_result', code: 'OK', coverage: 'complete' });
    assert.deepStrictEqual(recorder.snapshot(), [
        { event: 'tool_result', code: 'OK', coverage: 'complete' }
    ]);
});

test('NEXT01 RED: hermetic replay blocks network access', async () => {
    const { runHermeticReplay } = loadNext('replay/hermeticReplayRunner');
    await assert.rejects(
        runHermeticReplay(async () => fetch('https://example.invalid')),
        /network_access_forbidden/
    );
    await assert.rejects(
        runHermeticReplay(async () => require('node:http')),
        /network_access_forbidden/
    );
});

test('NEXT01 RED: reuse manifest makes every priority decision executable', () => {
    const { getReuseDecision } = loadNext('contracts/reuseManifest');
    assert.strictEqual(getReuseDecision('AST-01').decision, 'ADAPT');
    assert.strictEqual(getReuseDecision('AST-02').decision, 'ADAPT');
    assert.strictEqual(getReuseDecision('AST-03').decision, 'EXTRACT_BEHAVIOR');
    assert.strictEqual(getReuseDecision('AST-04').decision, 'DEFER');
    assert.strictEqual(getReuseDecision('AST-11').decision, 'PORT_AS_IS');
    assert.strictEqual(getReuseDecision('AST-12').decision, 'PORT_AS_IS');
    assert.strictEqual(getReuseDecision('AST-13').decision, 'PORT_AS_IS');
    assert.strictEqual(getReuseDecision('AST-15').decision, 'EXTRACT_BEHAVIOR');
});

test('NEXT01 RED: source boundary exists and contains no direct legacy/runtime dependency', () => {
    const nextRoot = path.join(ROOT, 'src', 'next');
    assert.ok(fs.existsSync(nextRoot), 'NEXT01_RED_next_source_tree_missing');

    const pending = [nextRoot];
    const files = [];
    while (pending.length > 0) {
        const current = pending.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const absolute = path.join(current, entry.name);
            if (entry.isDirectory()) pending.push(absolute);
            else if (entry.isFile() && /\.(?:c?js|mjs)$/.test(entry.name)) files.push(absolute);
        }
    }

    const forbidden = [
        /require\(['"](?:node:)?(?:http|https|net|tls|dns|dgram)['"]\)/,
        /require\(['"][^'"]*(?:handlers|jobs|services\/google|messageHandler|legacyUsageTelemetry)[^'"]*['"]\)/,
        /\bfetch\s*\(/
    ];
    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        for (const pattern of forbidden) {
            assert.doesNotMatch(source, pattern, `forbidden dependency in ${path.relative(ROOT, file)}`);
        }
    }
});
