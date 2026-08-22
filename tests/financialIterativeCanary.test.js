const test = require('node:test');
const assert = require('node:assert');

const {
    applyFinancialIterativeCanaryRuntimeConfig,
    evaluateFinancialIterativeCanaryEligibility,
    readFinancialIterativeCanaryRuntimeConfig,
    registerFinancialIterativeCanaryRuntimeReload
} = require('../src/config/financialIterativeCanaryRuntimeConfig');
const {
    selectFinancialIterativeCanaryResponse,
    buildFinancialIterativeCanaryTelemetry,
    runFinancialIterativeCanary
} = require('../src/agent/financialIterativeCanary');
const {
    createFinancialIterativeReasoner,
    __test__: reasonerTest
} = require('../src/agent/financialIterativeReasoner');
const {
    createPersonalSheetSemanticAdapters
} = require('../src/agent/financialPersonalSheetSemanticAdapters');
const { __test__: messageHandlerTest } = require('../src/handlers/messageHandler');

function activeEnv(overrides = {}) {
    return {
        FINANCIAL_ITERATIVE_CANARY_MODE: 'canary',
        FINANCIAL_ITERATIVE_CANARY_USER_IDS: 'member-a,member-b',
        FINANCIAL_ITERATIVE_CANARY_DOMAINS: 'expenses,budget',
        FINANCIAL_ITERATIVE_CANARY_SOURCES: 'central_read_model,personal_sheet',
        ...overrides
    };
}

test('iterative canary config applies atomically and rolls back one domain without affecting another', () => {
    const env = {
        FINANCIAL_ITERATIVE_CANARY_MODE: 'off',
        FINANCIAL_ITERATIVE_CANARY_USER_IDS: '',
        FINANCIAL_ITERATIVE_CANARY_DOMAINS: '',
        FINANCIAL_ITERATIVE_CANARY_SOURCES: ''
    };
    const applied = applyFinancialIterativeCanaryRuntimeConfig({ env, config: activeEnv() });
    assert.deepStrictEqual(applied, {
        applied: true,
        mode: 'canary',
        allowlistedUserCount: 2,
        domains: ['budget', 'expenses'],
        sources: ['central_read_model', 'personal_sheet']
    });

    const rolledBack = applyFinancialIterativeCanaryRuntimeConfig({
        env,
        config: activeEnv({ FINANCIAL_ITERATIVE_CANARY_DOMAINS: 'budget' })
    });
    assert.strictEqual(rolledBack.applied, true);
    assert.strictEqual(env.FINANCIAL_ITERATIVE_CANARY_DOMAINS, 'budget');
    assert.deepStrictEqual(evaluateFinancialIterativeCanaryEligibility({
        userId: 'member-a', domain: 'expenses', source: 'central_read_model', env
    }), { eligible: false, reason: 'domain_not_enabled', domain: 'expenses', source: 'central_read_model' });
    assert.strictEqual(evaluateFinancialIterativeCanaryEligibility({
        userId: 'member-a', domain: 'budget', source: 'personal_sheet', env
    }).eligible, true);

    const previous = { ...env };
    const rejected = applyFinancialIterativeCanaryRuntimeConfig({
        env,
        config: activeEnv({ FINANCIAL_ITERATIVE_CANARY_USER_IDS: 'member-a' })
    });
    assert.deepStrictEqual(rejected, { applied: false, reason: 'authorized_couple_required' });
    assert.deepStrictEqual(env, previous);
});

test('iterative canary eligibility fails closed for user, domain, source and mode', () => {
    assert.strictEqual(evaluateFinancialIterativeCanaryEligibility({
        userId: 'outsider', domain: 'expenses', source: 'central_read_model', env: activeEnv()
    }).reason, 'user_not_allowed');
    assert.strictEqual(evaluateFinancialIterativeCanaryEligibility({
        userId: 'member-a', domain: 'income', source: 'central_read_model', env: activeEnv()
    }).reason, 'domain_not_enabled');
    assert.strictEqual(evaluateFinancialIterativeCanaryEligibility({
        userId: 'member-a', domain: 'expenses', source: 'unknown', env: activeEnv()
    }).reason, 'source_not_enabled');
    assert.strictEqual(evaluateFinancialIterativeCanaryEligibility({
        userId: 'member-a', domain: 'expenses', source: 'central_read_model', env: activeEnv({ FINANCIAL_ITERATIVE_CANARY_MODE: 'off' })
    }).reason, 'canary_disabled');
});

test('disabled or ineligible canary never calls the reasoner or semantic runner', async () => {
    let reasonerCalls = 0;
    let runnerCalls = 0;
    const output = await runFinancialIterativeCanary({
        message: 'quanto gastei?',
        userId: 'member-a',
        domain: 'expenses',
        source: 'central_read_model',
        env: activeEnv({ FINANCIAL_ITERATIVE_CANARY_MODE: 'off' }),
        reasoner: async () => { reasonerCalls += 1; },
        runShadow: async () => { runnerCalls += 1; }
    });
    assert.strictEqual(output.status, 'skipped');
    assert.strictEqual(output.telemetry.reason, 'canary_disabled');
    assert.strictEqual(reasonerCalls, 0);
    assert.strictEqual(runnerCalls, 0);
});

test('iterative canary promotes only adequate read-only candidate and otherwise preserves baseline', async () => {
    const sideEffectFree = {
        mode: 'shadow',
        readCount: 1,
        stopReason: 'candidate_answer',
        candidate: { action: 'answer', text: 'Resposta nova comprovada.' },
        adequacy: { ok: true, status: 'adequate' },
        comparison: { comparable: true, sameCapability: true, sameSource: true, sameCoverage: true, samePayload: true },
        visibleResponse: null,
        sideEffects: { messagesSent: 0, financialWrites: 0 }
    };
    const output = await runFinancialIterativeCanary({
        message: 'quanto gastei?',
        domain: 'expenses',
        source: 'central_read_model',
        userId: 'member-a',
        trustedContext: { userIds: ['member-a'], personByUserId: { 'member-a': 'Pessoa' } },
        trajectory: { context: { scope: 'personal' }, executedPlan: { domain: 'expenses', operation: 'sum' } },
        reasoner: async () => ({ action: 'answer', answer: 'unused' }),
        env: activeEnv(),
        runShadow: async () => sideEffectFree
    });
    assert.strictEqual(output.status, 'observed');
    assert.strictEqual(selectFinancialIterativeCanaryResponse({ baselineAnswer: 'Resposta vigente.', canary: output }), 'Resposta nova comprovada.');

    const unsafe = { ...output, shadow: { ...sideEffectFree, sideEffects: { messagesSent: 0, financialWrites: 1 } } };
    assert.strictEqual(selectFinancialIterativeCanaryResponse({ baselineAnswer: 'Resposta vigente.', canary: unsafe }), 'Resposta vigente.');
    const inadequate = { ...output, shadow: { ...sideEffectFree, adequacy: { ok: false, status: 'inadequate' } } };
    assert.strictEqual(selectFinancialIterativeCanaryResponse({ baselineAnswer: 'Resposta vigente.', canary: inadequate }), 'Resposta vigente.');
    const missingCounters = { ...output, shadow: { ...sideEffectFree, sideEffects: {} } };
    assert.strictEqual(selectFinancialIterativeCanaryResponse({ baselineAnswer: 'Resposta vigente.', canary: missingCounters }), 'Resposta vigente.');
    const textualCounters = {
        ...output,
        shadow: { ...sideEffectFree, sideEffects: { messagesSent: '0', financialWrites: '0' } }
    };
    assert.strictEqual(selectFinancialIterativeCanaryResponse({ baselineAnswer: 'Resposta vigente.', canary: textualCounters }), 'Resposta vigente.');
});

test('iterative canary preserves server family scope, follow-up trajectory and selected source', async () => {
    let observedInput = null;
    const output = await runFinancialIterativeCanary({
        message: 'e somente os da Thais?',
        domain: 'expenses',
        source: 'personal_sheet',
        userId: 'member-b',
        trustedContext: {
            userIds: ['member-a', 'member-b'],
            ownerUserId: 'member-b',
            personByUserId: { 'member-a': 'Daniel', 'member-b': 'Thais' }
        },
        trajectory: {
            context: { scope: 'family', followUp: true, authorizedUserCount: 2 },
            executedPlan: { domain: 'expenses', operation: 'sum', filters: { member: 'Thais' } }
        },
        reasoner: async () => ({ action: 'answer', answer: 'R$ 20,00' }),
        env: activeEnv(),
        runShadow: async input => {
            observedInput = input;
            return {
                mode: 'shadow', readCount: 1, stopReason: 'candidate_answer',
                candidate: { action: 'answer', text: 'R$ 20,00' },
                adequacy: { ok: true, status: 'adequate' },
                comparison: { comparable: false },
                visibleResponse: null,
                sideEffects: { messagesSent: 0, financialWrites: 0 }
            };
        }
    });
    assert.strictEqual(output.status, 'observed');
    assert.strictEqual(observedInput.source, 'personal_sheet');
    assert.strictEqual(observedInput.trajectory.context.followUp, true);
    assert.deepStrictEqual(observedInput.trustedContext.userIds, ['member-a', 'member-b']);
    assert.strictEqual(observedInput.trustedContext.ownerUserId, 'member-b');
    assert.doesNotMatch(JSON.stringify(output.telemetry), /member-a|member-b|Daniel|Thais/);
});

test('iterative canary telemetry is value-free, identity-free and comparison-only', () => {
    const telemetry = buildFinancialIterativeCanaryTelemetry({
        eligibility: { eligible: true, domain: 'expenses', source: 'personal_sheet' },
        shadow: {
            readCount: 2,
            stopReason: 'candidate_answer',
            candidate: { action: 'answer', text: 'R$ 999,99 de Pessoa Privada' },
            adequacy: { ok: true, status: 'adequate', reasons: [{ secret: 'x' }] },
            comparison: { comparable: true, sameCapability: true, sameSource: false, sameCoverage: true, samePayload: false },
            sideEffects: { messagesSent: 0, financialWrites: 0 },
            steps: [{ evidence: { payload: { value: 999.99, user_id: 'private' } } }]
        }
    });
    assert.deepStrictEqual(telemetry, {
        status: 'observed',
        reason: 'candidate_answer',
        domain: 'expenses',
        source: 'personal_sheet',
        readCount: 2,
        candidateAction: 'answer',
        adequacyStatus: 'adequate',
        comparable: true,
        sameCapability: true,
        sameSource: false,
        sameCoverage: true,
        samePayload: false
    });
    assert.doesNotMatch(JSON.stringify(telemetry), /999|Pessoa|private|user_id|R\$/i);
});

test('personal sheet adapters keep server owner authority and expose only personal-sheet results', async () => {
    const calls = [];
    const adapters = createPersonalSheetSemanticAdapters({
        getUserSheetDashboardData: async (ownerUserId, period) => {
            calls.push({ ownerUserId, period });
            return {
                source: 'personal_sheet',
                kpis: { entradas: 300, saidas: 70, cartoes: 30, saldo: 200 },
                recentTransactions: [{ type: 'saida', value: 70, description: 'mercado' }],
                financialAccounts: { totalBalance: 200, items: [] },
                dailyGoal: { spent: 100, remaining: 50 }
            };
        }
    });
    const result = await adapters.query_financial_plan({
        ownerUserId: 'trusted-owner',
        userIds: ['trusted-owner'],
        plan: {
            kind: 'financial_query',
            domain: 'expenses',
            operation: 'sum',
            filters: { period: { type: 'month', month: 7, year: 2026 }, userId: 'attacker' }
        }
    });
    assert.deepStrictEqual(calls, [{ ownerUserId: 'trusted-owner', period: { month: 7, year: 2026 } }]);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.source, 'personal_sheet');
    assert.strictEqual(result.result.value, 100);
    assert.doesNotMatch(JSON.stringify(result), /attacker|trusted-owner/);

    const incompleteList = await adapters.query_financial_plan({
        ownerUserId: 'trusted-owner',
        userIds: ['trusted-owner'],
        plan: { kind: 'financial_query', domain: 'expenses', operation: 'list', filters: {} }
    });
    assert.strictEqual(incompleteList.ok, false);
    assert.strictEqual(incompleteList.reason, 'personal_sheet_domain_operation_unsupported');
});

test('iterative reasoner sends only sanitized context and fails closed on invalid output', async () => {
    const requests = [];
    const reasoner = createFinancialIterativeReasoner({
        env: { OPENROUTER_API_KEY: 'secret-key', FINANCIAL_ITERATIVE_REASONER_MODEL: 'openai/test-model' },
        costGuard: { reserveModelCall: () => ({ allowed: true }) },
        fetchImpl: async (_url, options) => {
            requests.push(JSON.parse(options.body));
            return {
                ok: true,
                json: async () => ({ choices: [{ message: { content: '{"action":"clarify","question":"Qual periodo?"}' } }] })
            };
        }
    });
    const decision = await reasoner({
        message: 'quanto gastei?',
        allowedCapabilities: [{ tool: 'query_financial_plan', capability: 'financial_query' }],
        remainingReads: 2,
        evidenceHistory: [{ payload: { value: 10, user_id: 'private-user' } }],
        trajectory: { context: { scope: 'personal' } }
    });
    assert.deepStrictEqual(decision, { action: 'clarify', question: 'Qual periodo?' });
    assert.strictEqual(requests[0].model, 'openai/test-model');
    assert.doesNotMatch(JSON.stringify(requests), /secret-key|private-user|user_id/);

    assert.strictEqual(reasonerTest.normalizeReasonerDecision({ action: 'write', amount: 10 }), null);
    assert.strictEqual(createFinancialIterativeReasoner({ env: {}, fetchImpl: async () => {} }), null);
});

test('iterative reasoner enforces the persistent model-call budget before network use', async () => {
    let fetchCalls = 0;
    const reasoner = createFinancialIterativeReasoner({
        env: { OPENROUTER_API_KEY: 'secret-key' },
        costGuard: { reserveModelCall: () => ({ allowed: false, reason: 'monthly_limit' }) },
        fetchImpl: async () => { fetchCalls += 1; }
    });
    await assert.rejects(() => reasoner({ message: 'teste' }), /reasoner_budget_monthly_limit/);
    assert.strictEqual(fetchCalls, 0);
});

test('runtime config reader does not load unrelated secrets', () => {
    const parsed = readFinancialIterativeCanaryRuntimeConfig({
        readFileSync: () => Buffer.from([
            'FINANCIAL_ITERATIVE_CANARY_MODE=canary',
            'FINANCIAL_ITERATIVE_CANARY_USER_IDS=member-a,member-b',
            'FINANCIAL_ITERATIVE_CANARY_DOMAINS=expenses',
            'FINANCIAL_ITERATIVE_CANARY_SOURCES=central_read_model',
            'OPENROUTER_API_KEY=private'
        ].join('\n'))
    });
    assert.deepStrictEqual(parsed, {
        FINANCIAL_ITERATIVE_CANARY_MODE: 'canary',
        FINANCIAL_ITERATIVE_CANARY_USER_IDS: 'member-a,member-b',
        FINANCIAL_ITERATIVE_CANARY_DOMAINS: 'expenses',
        FINANCIAL_ITERATIVE_CANARY_SOURCES: 'central_read_model'
    });
});

test('runtime reload logs only counts and preserves prior config on a rejected domain set', () => {
    const handlers = [];
    const info = [];
    const warnings = [];
    const processRef = {
        env: activeEnv({ FINANCIAL_ITERATIVE_CANARY_DOMAINS: 'budget' }),
        on: (signal, handler) => handlers.push({ signal, handler })
    };
    let config = activeEnv({ FINANCIAL_ITERATIVE_CANARY_DOMAINS: 'expenses' });
    assert.strictEqual(registerFinancialIterativeCanaryRuntimeReload({
        processRef,
        logger: { info: message => info.push(message), warn: message => warnings.push(message) },
        readRuntimeConfig: () => config
    }), true);
    handlers[0].handler();
    assert.strictEqual(processRef.env.FINANCIAL_ITERATIVE_CANARY_DOMAINS, 'expenses');
    assert.match(info[0], /users=2 domains=1 sources=2/);
    assert.doesNotMatch(info[0], /member-a|member-b/);

    const previous = { ...processRef.env };
    config = activeEnv({ FINANCIAL_ITERATIVE_CANARY_DOMAINS: 'unknown-domain' });
    handlers[0].handler();
    assert.deepStrictEqual(processRef.env, previous);
    assert.match(warnings[0], /valid_domain_required/);
});

test('message-handler boundary contains canary failure and preserves the baseline answer', async () => {
    let recorded = null;
    const output = await messageHandlerTest.maybeRunFinancialIterativeCanary({
        baselineAnswer: 'Resposta vigente intacta.',
        message: 'quanto gastei?',
        userId: 'member-a',
        domain: 'expenses',
        source: 'central_read_model',
        env: activeEnv(),
        reasoner: async () => ({ action: 'answer', answer: 'não deve aparecer' }),
        runCanary: async () => { throw new Error('falha simulada'); },
        recordAttempt: input => { recorded = input; }
    });
    assert.deepStrictEqual(output, {
        answer: 'Resposta vigente intacta.',
        canary: null,
        promoted: false
    });
    assert.strictEqual(recorded.outcome, 'fallback');
    assert.strictEqual(recorded.reason, 'contained_error');
});

test('message-handler records every eligible selection before exposing it', async () => {
    let recorded = null;
    const canary = {
        status: 'observed',
        eligibility: { eligible: true, reason: 'eligible', domain: 'expenses', source: 'central_read_model' },
        telemetry: {
            status: 'observed', reason: 'candidate_answer', domain: 'expenses',
            source: 'central_read_model', readCount: 1, candidateAction: 'answer',
            adequacyStatus: 'adequate'
        },
        shadow: {
            candidate: { action: 'answer', text: 'Resposta nova comprovada.' },
            adequacy: { ok: true, status: 'adequate' },
            sideEffects: { messagesSent: 0, financialWrites: 0 }
        }
    };
    const output = await messageHandlerTest.maybeRunFinancialIterativeCanary({
        baselineAnswer: 'Resposta vigente.',
        message: 'quanto gastei?',
        userId: 'member-a',
        domain: 'expenses',
        source: 'central_read_model',
        env: activeEnv(),
        runCanary: async () => canary,
        recordAttempt: (input, options) => {
            recorded = { input, options };
            return {
                recorded: true,
                record: { attemptId: '11111111-1111-4111-8111-111111111111' }
            };
        }
    });
    assert.strictEqual(output.promoted, true);
    assert.strictEqual(output.answer, 'Resposta nova comprovada.');
    assert.strictEqual(recorded.input.outcome, 'selected');
    assert.strictEqual(recorded.input.baselineAvailable, true);
    assert.strictEqual(recorded.input.sideEffectsZero, true);
    assert.strictEqual(recorded.options.env.FINANCIAL_ITERATIVE_CANARY_MODE, 'canary');
    assert.strictEqual(output.delivery.attemptId, '11111111-1111-4111-8111-111111111111');
});

test('message-handler records terminal delivery only after the caller resolves reply', () => {
    let terminal = null;
    const delivery = {
        attemptId: '11111111-1111-4111-8111-111111111111',
        domain: 'expenses',
        source: 'central_read_model',
        readCount: 1,
        candidateAction: 'answer',
        adequacyStatus: 'adequate',
        baselineAvailable: true,
        sideEffectsZero: true
    };
    const finalized = messageHandlerTest.finalizeFinancialIterativeCanaryDelivery({
        delivery,
        outcome: 'promoted',
        reason: 'reply_succeeded',
        env: activeEnv(),
        recordAttempt: (input, options) => { terminal = { input, options }; }
    });
    assert.strictEqual(finalized, true);
    assert.strictEqual(terminal.input.attemptId, delivery.attemptId);
    assert.strictEqual(terminal.input.outcome, 'promoted');
    assert.strictEqual(terminal.input.reason, 'reply_succeeded');
    assert.strictEqual(terminal.options.env.FINANCIAL_ITERATIVE_CANARY_MODE, 'canary');
});

test('message-handler delivery boundary records promoted only after reply success and fallback after rejection', async () => {
    const selection = {
        promoted: true,
        answer: 'Resposta nova comprovada.',
        delivery: { attemptId: '11111111-1111-4111-8111-111111111111' }
    };
    const successEvents = [];
    assert.strictEqual(await messageHandlerTest.deliverFinancialIterativeCanarySelection({
        selection,
        reply: async answer => { successEvents.push(`reply:${answer}`); },
        finalizeDelivery: terminal => { successEvents.push(terminal.outcome); }
    }), true);
    assert.deepStrictEqual(successEvents, ['reply:Resposta nova comprovada.', 'promoted']);

    const failureEvents = [];
    await assert.rejects(
        () => messageHandlerTest.deliverFinancialIterativeCanarySelection({
            selection,
            reply: async () => {
                failureEvents.push('reply_failed');
                throw new Error('delivery unavailable');
            },
            finalizeDelivery: terminal => { failureEvents.push(terminal.outcome); }
        }),
        /delivery unavailable/
    );
    assert.deepStrictEqual(failureEvents, ['reply_failed', 'fallback']);
});

test('message-handler refuses a candidate without explicit numeric side-effect counters', async () => {
    const output = await messageHandlerTest.maybeRunFinancialIterativeCanary({
        baselineAnswer: 'Resposta vigente.',
        message: 'quanto gastei?',
        userId: 'member-a',
        domain: 'expenses',
        source: 'central_read_model',
        env: activeEnv(),
        runCanary: async () => ({
            status: 'observed',
            eligibility: { eligible: true, reason: 'eligible' },
            telemetry: { status: 'observed', reason: 'candidate_answer' },
            shadow: {
                candidate: { action: 'answer', text: 'Não pode aparecer.' },
                adequacy: { ok: true, status: 'adequate' },
                sideEffects: {}
            }
        }),
        recordAttempt: () => ({ recorded: true })
    });
    assert.strictEqual(output.promoted, false);
    assert.strictEqual(output.answer, 'Resposta vigente.');
});

test('message-handler blocks promotion when eligible-attempt telemetry cannot be persisted', async () => {
    const canary = {
        status: 'observed',
        eligibility: { eligible: true, reason: 'eligible', domain: 'expenses', source: 'central_read_model' },
        telemetry: {
            status: 'observed', reason: 'candidate_answer', domain: 'expenses',
            source: 'central_read_model', readCount: 1, candidateAction: 'answer',
            adequacyStatus: 'adequate'
        },
        shadow: {
            candidate: { action: 'answer', text: 'Não pode aparecer.' },
            adequacy: { ok: true, status: 'adequate' },
            sideEffects: { messagesSent: 0, financialWrites: 0 }
        }
    };
    const output = await messageHandlerTest.maybeRunFinancialIterativeCanary({
        baselineAnswer: 'Resposta vigente preservada.',
        message: 'quanto gastei?',
        userId: 'member-a',
        domain: 'expenses',
        source: 'central_read_model',
        env: activeEnv(),
        runCanary: async () => canary,
        recordAttempt: () => { throw new Error('disk unavailable'); }
    });
    assert.strictEqual(output.promoted, false);
    assert.strictEqual(output.answer, 'Resposta vigente preservada.');
});

test('message-handler does not persist telemetry for an ineligible canary', async () => {
    let records = 0;
    const output = await messageHandlerTest.maybeRunFinancialIterativeCanary({
        baselineAnswer: 'Resposta vigente.',
        message: 'quanto gastei?',
        userId: 'member-a',
        domain: 'expenses',
        source: 'central_read_model',
        env: activeEnv({ FINANCIAL_ITERATIVE_CANARY_MODE: 'off' }),
        runCanary: async () => ({
            status: 'skipped',
            eligibility: { eligible: false, reason: 'canary_disabled' },
            telemetry: { status: 'skipped', reason: 'canary_disabled' },
            shadow: null
        }),
        recordAttempt: () => { records += 1; }
    });
    assert.strictEqual(output.answer, 'Resposta vigente.');
    assert.strictEqual(output.promoted, false);
    assert.strictEqual(records, 0);
});

test('message-handler rejects an observed candidate when server-side eligibility is false', async () => {
    let records = 0;
    const output = await messageHandlerTest.maybeRunFinancialIterativeCanary({
        baselineAnswer: 'Resposta vigente.',
        message: 'quanto gastei?',
        userId: 'member-a',
        domain: 'expenses',
        source: 'central_read_model',
        env: activeEnv({ FINANCIAL_ITERATIVE_CANARY_MODE: 'off' }),
        runCanary: async () => ({
            status: 'observed',
            eligibility: { eligible: true, reason: 'incoherent_runner_result' },
            telemetry: { status: 'observed', reason: 'candidate_answer' },
            shadow: {
                candidate: { action: 'answer', text: 'Não pode aparecer.' },
                adequacy: { ok: true, status: 'adequate' },
                sideEffects: { messagesSent: 0, financialWrites: 0 }
            }
        }),
        recordAttempt: () => { records += 1; }
    });
    assert.strictEqual(output.promoted, false);
    assert.strictEqual(output.answer, 'Resposta vigente.');
    assert.strictEqual(output.delivery, null);
    assert.strictEqual(records, 0);
});
