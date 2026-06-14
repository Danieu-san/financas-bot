const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const {
    buildInterpretationCandidate,
    canonicalizeInterpretation,
    decideInterpretationRisk,
    normalizePaymentReply,
    normalizeTransferType,
    sanitizeReliabilityTelemetry
} = require('../src/reliability/interpretationReliability');
const { extractDeterministicInterpretation } = require('../src/reliability/deterministicExtractor');
const {
    buildFinancialWriteEnvelope,
    createOperationKey,
    FinancialWriteLedger
} = require('../src/reliability/financialWriteLedger');
const {
    recordInterpretationReliabilityShadow
} = require('../src/reliability/reliabilityTelemetry');
const {
    evaluateEnforceReadiness,
    parseShadowTelemetryJsonl
} = require('../src/reliability/enforceReadinessMonitor');
const {
    sendInterpretationReadinessAlert
} = require('../src/reliability/enforceReadinessNotifier');
const {
    buildInterpretationReliabilityAcceptanceCases,
    runInterpretationReliabilityAcceptance
} = require('../src/reliability/interpretationReliabilityAcceptance');
const messageHandler = require('../src/handlers/messageHandler');

test('interpretation reliability canonicalizes payment aliases without unsafe default', () => {
    assert.strictEqual(normalizePaymentReply('pix'), 'PIX');
    assert.strictEqual(normalizePaymentReply('cartão de crédito'), 'Crédito');
    assert.strictEqual(normalizePaymentReply('cc'), 'Conta Corrente');
    assert.strictEqual(normalizePaymentReply('qualquer coisa'), null);
});

test('interpretation reliability only treats a named person as family transfer after authorized alias resolution', () => {
    assert.strictEqual(normalizeTransferType('transferi para pessoa teste'), null);
    assert.strictEqual(
        normalizeTransferType('transferi para pessoa teste', { familyMemberAliases: ['Pessoa Teste'] }),
        'family_transfer'
    );
    assert.strictEqual(
        normalizeTransferType('transferi para pessoa teste para pagar o cartao', { familyMemberAliases: ['Pessoa Teste'] }),
        'family_transfer'
    );

    const withoutAuthorizedAlias = extractDeterministicInterpretation('transferi 50 para pessoa teste');
    assert.strictEqual(decideInterpretationRisk(withoutAuthorizedAlias).action, 'clarify');

    const withAuthorizedAlias = extractDeterministicInterpretation(
        'transferi 50 para pessoa teste',
        { familyMemberAliases: ['Pessoa Teste'] }
    );
    assert.strictEqual(decideInterpretationRisk(withAuthorizedAlias).action, 'execute');
});

test('interpretation reliability executes only deterministic complete single expense', () => {
    const candidate = canonicalizeInterpretation(buildInterpretationCandidate({
        operation: 'expense.create',
        fields: {
            amount: { value: 25, source: 'deterministic', assurance: 'verified', evidence: 'money_pattern' },
            payment: { value: 'pix', source: 'deterministic', assurance: 'verified', evidence: 'payment_alias' },
            scope: { value: 'personal', source: 'user_state', assurance: 'verified', evidence: 'active_user' },
            movementType: { value: 'expense', source: 'deterministic', assurance: 'verified', evidence: 'verb' }
        }
    }));

    const decision = decideInterpretationRisk(candidate);

    assert.strictEqual(decision.action, 'execute');
    assert.deepStrictEqual(decision.clarificationFields, []);
    assert.match(decision.preview, /R\$ 25,00/);
});

test('interpretation reliability confirms when a critical field depends on LLM', () => {
    const candidate = canonicalizeInterpretation(buildInterpretationCandidate({
        operation: 'expense.create',
        fields: {
            amount: { value: 25, source: 'deterministic', assurance: 'verified' },
            payment: { value: 'pix', source: 'llm', assurance: 'supported' },
            scope: { value: 'personal', source: 'user_state', assurance: 'verified' },
            movementType: { value: 'expense', source: 'deterministic', assurance: 'verified' }
        }
    }));

    const decision = decideInterpretationRisk(candidate);

    assert.strictEqual(decision.action, 'confirm');
    assert.ok(decision.reasons.includes('critical_field_not_deterministic'));
});

test('interpretation reliability clarifies missing or conflicting critical fields', () => {
    const missing = canonicalizeInterpretation(buildInterpretationCandidate({
        operation: 'expense.create',
        fields: {
            amount: { value: 25, source: 'deterministic', assurance: 'verified' },
            scope: { value: 'personal', source: 'user_state', assurance: 'verified' },
            movementType: { value: 'expense', source: 'deterministic', assurance: 'verified' }
        }
    }));
    assert.strictEqual(decideInterpretationRisk(missing).action, 'clarify');
    assert.ok(decideInterpretationRisk(missing).clarificationFields.includes('payment'));

    const conflicting = canonicalizeInterpretation(buildInterpretationCandidate({
        operation: 'expense.create',
        fields: {
            amount: { value: 25, source: 'deterministic', assurance: 'verified' },
            payment: { value: 'pix', source: 'deterministic', assurance: 'verified' },
            scope: { value: 'personal', source: 'user_state', assurance: 'verified' },
            movementType: { value: 'expense', source: 'deterministic', assurance: 'verified' }
        },
        conflicts: [{ field: 'payment', values: ['PIX', 'Crédito'] }]
    }));
    assert.strictEqual(decideInterpretationRisk(conflicting).action, 'clarify');
});

test('interpretation reliability blocks disallowed operations and unsafe scope', () => {
    const candidate = canonicalizeInterpretation(buildInterpretationCandidate({
        operation: 'admin.delete_user',
        fields: {
            amount: { value: 10, source: 'deterministic', assurance: 'verified' },
            scope: { value: 'all_users', source: 'llm', assurance: 'supported' }
        }
    }));

    const decision = decideInterpretationRisk(candidate);

    assert.strictEqual(decision.action, 'block');
    assert.ok(decision.reasons.includes('operation_not_allowlisted'));
    assert.ok(decision.reasons.includes('unauthorized_scope'));
});

test('interpretation reliability telemetry is sanitized and does not store raw financial text', () => {
    const telemetry = sanitizeReliabilityTelemetry({
        userId: 'real-user-id-123',
        senderId: '5521999999999@c.us',
        message: 'gastei 1234,56 no mercado secreto',
        amount: 1234.56,
        decision: { action: 'confirm', reasons: ['critical_field_not_deterministic'] },
        candidate: {
            operation: 'expense.create',
            fields: {
                amount: { value: 1234.56, source: 'deterministic', assurance: 'verified' },
                payment: { value: 'PIX', source: 'llm', assurance: 'supported' }
            }
        }
    });

    const serialized = JSON.stringify(telemetry);
    assert.match(serialized, /expense\.create/);
    assert.doesNotMatch(serialized, /mercado secreto|1234,56|1234\.56|5521999999999|real-user-id/);
    assert.ok(telemetry.messageHash);
    assert.ok(telemetry.userHash);
});

test('interpretation reliability shadow telemetry is disabled by default and never stores raw content', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-shadow-'));
    const telemetryPath = path.join(dir, 'shadow.jsonl');
    const candidate = buildInterpretationCandidate({
        operation: 'expense.create',
        fields: {
            amount: { value: 123.45, source: 'deterministic', assurance: 'verified' },
            payment: { value: 'PIX', source: 'deterministic', assurance: 'verified' },
            scope: { value: 'personal', source: 'user_state', assurance: 'verified' },
            movementType: { value: 'expense', source: 'deterministic', assurance: 'verified' }
        }
    });
    const decision = decideInterpretationRisk(candidate);

    const disabled = recordInterpretationReliabilityShadow({
        userId: 'real-user-id-123',
        senderId: '5521999999999@c.us',
        message: 'gastei 123,45 no mercado privado',
        candidate,
        decision
    }, {
        env: { INTERPRETATION_RELIABILITY_MODE: 'off' },
        telemetryPath
    });

    assert.strictEqual(disabled.recorded, false);
    assert.strictEqual(fs.existsSync(telemetryPath), false);

    const enabled = recordInterpretationReliabilityShadow({
        userId: 'real-user-id-123',
        senderId: '5521999999999@c.us',
        message: 'gastei 123,45 no mercado privado',
        candidate,
        decision
    }, {
        env: {
            INTERPRETATION_RELIABILITY_MODE: 'shadow',
            INTERPRETATION_RELIABILITY_OPERATIONS: 'expense.create'
        },
        telemetryPath
    });

    assert.strictEqual(enabled.recorded, true);
    const payload = fs.readFileSync(telemetryPath, 'utf8');
    assert.match(payload, /expense\.create/);
    assert.doesNotMatch(payload, /mercado privado|123,45|123\.45|real-user-id|5521999999999/);
});

test('interpretation reliability shadow telemetry can record sanitized current-flow comparison', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-shadow-comparison-'));
    const telemetryPath = path.join(dir, 'shadow.jsonl');
    const candidate = buildInterpretationCandidate({
        operation: 'expense.create',
        fields: {
            amount: { value: 100, source: 'llm', assurance: 'supported' },
            payment: { value: 'PIX', source: 'llm', assurance: 'supported' },
            scope: { value: 'personal', source: 'user_state', assurance: 'verified' },
            movementType: { value: 'expense', source: 'deterministic', assurance: 'verified' }
        }
    });
    const decision = decideInterpretationRisk(candidate);

    recordInterpretationReliabilityShadow({
        userId: 'real-user-id-123',
        senderId: '5521999999999@c.us',
        message: 'gastei 100 no mercado privado',
        candidate,
        decision,
        currentFlowOutcome: 'write_attempt',
        divergenceSeverity: decision.action === 'execute' ? 'none' : 'critical',
        divergenceReason: 'current_flow_would_write_but_reliability_requires_user_control'
    }, {
        env: { INTERPRETATION_RELIABILITY_MODE: 'shadow' },
        telemetryPath
    });

    const payload = fs.readFileSync(telemetryPath, 'utf8');
    const saved = JSON.parse(payload.trim());
    assert.strictEqual(saved.currentFlowOutcome, 'write_attempt');
    assert.strictEqual(saved.divergenceSeverity, 'critical');
    assert.match(saved.divergenceReason, /requires_user_control/);
    assert.doesNotMatch(payload, /mercado privado|100 no mercado|real-user-id|5521999999999/);
});

test('enforce readiness monitor requires enough shadow evidence before manual review', () => {
    const now = new Date('2026-06-30T12:00:00.000Z');
    const makeEntry = (index, operation = index % 2 === 0 ? 'expense.create' : 'income.create') => ({
        ts: new Date(now.getTime() - (15 * 24 * 60 * 60 * 1000) + (index * 60 * 1000)).toISOString(),
        mode: 'shadow',
        operation,
        action: 'execute',
        currentFlowOutcome: 'write_attempt',
        divergenceSeverity: 'none',
        fields: {
            amount: { source: 'deterministic', assurance: 'verified', valueHash: `h${index}` },
            scope: { source: 'user_state', assurance: 'verified', valueHash: `s${index}` }
        }
    });

    const insufficientVolume = evaluateEnforceReadiness(
        Array.from({ length: 49 }, (_, index) => makeEntry(index)),
        { now }
    );
    assert.strictEqual(insufficientVolume.readyForManualReview, false);
    assert.ok(insufficientVolume.blockers.includes('not_enough_decisions'));

    const ready = evaluateEnforceReadiness(
        Array.from({ length: 50 }, (_, index) => makeEntry(index)),
        { now }
    );
    assert.strictEqual(ready.readyForManualReview, true);
    assert.strictEqual(ready.recommendedMode, 'manual_review_for_enforce');
    assert.deepStrictEqual(ready.blockers, []);
});

test('enforce readiness monitor blocks critical divergence and short observation windows', () => {
    const now = new Date('2026-06-30T12:00:00.000Z');
    const entries = Array.from({ length: 50 }, (_, index) => ({
        ts: new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000) + (index * 60 * 1000)).toISOString(),
        mode: 'shadow',
        operation: index % 2 === 0 ? 'expense.create' : 'income.create',
        action: 'execute',
        currentFlowOutcome: 'write_attempt',
        divergenceSeverity: index === 10 ? 'critical' : 'none'
    }));

    const report = evaluateEnforceReadiness(entries, { now });

    assert.strictEqual(report.readyForManualReview, false);
    assert.ok(report.blockers.includes('observation_window_too_short'));
    assert.ok(report.blockers.includes('critical_divergence_found'));
    assert.strictEqual(report.criticalDivergences, 1);
});

test('enforce readiness monitor parses jsonl without treating malformed lines as safe', () => {
    const parsed = parseShadowTelemetryJsonl([
        JSON.stringify({ ts: '2026-06-01T00:00:00.000Z', mode: 'shadow', operation: 'expense.create' }),
        '{invalid-json',
        ''
    ].join('\n'));

    assert.strictEqual(parsed.entries.length, 1);
    assert.strictEqual(parsed.invalidLines, 1);
    assert.strictEqual(evaluateEnforceReadiness(parsed.entries, { invalidLines: parsed.invalidLines }).readyForManualReview, false);
    assert.ok(evaluateEnforceReadiness(parsed.entries, { invalidLines: parsed.invalidLines }).blockers.includes('invalid_telemetry_lines'));
});

test('interpretation readiness alert notifies admins once when shadow is ready for manual review', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-readiness-alert-'));
    const statePath = path.join(dir, 'readiness-state.json');
    const sent = [];
    const readyReport = {
        readyForManualReview: true,
        recommendedMode: 'manual_review_for_enforce',
        blockers: [],
        warnings: [],
        shadowEntries: 72,
        observationWindowDays: 15,
        criticalDivergences: 0,
        invalidLines: 0,
        byOperation: { 'expense.create': 40, 'income.create': 32 },
        thresholds: { minDecisions: 50, minObservationDays: 14 },
        missingFile: false
    };

    const client = {
        sendMessage: async (to, message) => sent.push({ to, message })
    };

    const first = await sendInterpretationReadinessAlert({
        client,
        adminIds: ['5511999999999@c.us'],
        statePath,
        env: { INTERPRETATION_RELIABILITY_MODE: 'shadow' },
        reportBuilder: () => readyReport
    });
    const second = await sendInterpretationReadinessAlert({
        client,
        adminIds: ['5511999999999@c.us'],
        statePath,
        env: { INTERPRETATION_RELIABILITY_MODE: 'shadow' },
        reportBuilder: () => readyReport
    });

    assert.strictEqual(first.sent, true);
    assert.strictEqual(second.sent, false);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].to, '5511999999999@c.us');
    assert.match(sent[0].message, /Shadow pronto para revisão manual/);
    assert.match(sent[0].message, /O enforce NAO foi ativado automaticamente/);
    assert.doesNotMatch(sent[0].message, /5511999999999|user_id|sheet_id|token/i);
});

test('interpretation readiness alert warns admins once about critical divergence', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-readiness-critical-'));
    const statePath = path.join(dir, 'readiness-state.json');
    const sent = [];
    const criticalReport = {
        readyForManualReview: false,
        recommendedMode: 'keep_shadow',
        blockers: ['critical_divergence_found'],
        warnings: [],
        shadowEntries: 80,
        observationWindowDays: 16,
        criticalDivergences: 2,
        invalidLines: 0,
        byOperation: { 'expense.create': 50, 'income.create': 30 },
        thresholds: { minDecisions: 50, minObservationDays: 14 },
        missingFile: false
    };

    const client = {
        sendMessage: async (to, message) => sent.push({ to, message })
    };

    const first = await sendInterpretationReadinessAlert({
        client,
        adminIds: ['5511999999999@c.us'],
        statePath,
        env: { INTERPRETATION_RELIABILITY_MODE: 'shadow' },
        reportBuilder: () => criticalReport
    });
    const second = await sendInterpretationReadinessAlert({
        client,
        adminIds: ['5511999999999@c.us'],
        statePath,
        env: { INTERPRETATION_RELIABILITY_MODE: 'shadow' },
        reportBuilder: () => criticalReport
    });
    const third = await sendInterpretationReadinessAlert({
        client,
        adminIds: ['5511999999999@c.us'],
        statePath,
        env: { INTERPRETATION_RELIABILITY_MODE: 'shadow' },
        reportBuilder: () => ({ ...criticalReport, criticalDivergences: 3 })
    });

    assert.strictEqual(first.sent, true);
    assert.strictEqual(second.sent, false);
    assert.strictEqual(third.sent, true);
    assert.strictEqual(sent.length, 2);
    assert.match(sent[0].message, /Divergência crítica no shadow/);
    assert.match(sent[0].message, /NAO ative enforce/);
    assert.match(sent[1].message, /Divergências críticas observadas: 3/);
});

test('interpretation readiness alert stays silent when shadow mode is off', async () => {
    const sent = [];
    const result = await sendInterpretationReadinessAlert({
        client: { sendMessage: async (to, message) => sent.push({ to, message }) },
        adminIds: ['5511999999999@c.us'],
        env: { INTERPRETATION_RELIABILITY_MODE: 'off' },
        reportBuilder: () => {
            throw new Error('report should not be built when disabled');
        }
    });

    assert.strictEqual(result.sent, false);
    assert.strictEqual(result.reason, 'shadow_disabled');
    assert.deepStrictEqual(sent, []);
});

test('financial write ledger tracks operation states and keeps operation keys stable', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-ledger-'));
    const dbPath = path.join(dir, 'ledger.sqlite');
    const ledger = new FinancialWriteLedger({ dbPath });
    const envelope = buildFinancialWriteEnvelope({
        actorScope: { userHash: 'u1', scope: 'personal' },
        operation: 'expense.create',
        payload: { sheetName: 'Saídas', rowFingerprint: 'abc123' },
        provenance: { messageId: 'msg-1' }
    });

    const keyA = createOperationKey({ userId: 'u1', messageId: 'msg-1', operation: 'expense.create', itemFingerprint: 'abc123' });
    const keyB = createOperationKey({ userId: 'u1', messageId: 'msg-1', operation: 'expense.create', itemFingerprint: 'abc123' });
    assert.strictEqual(keyA, keyB);

    ledger.beginOperation({ ...envelope, operationKey: keyA });
    assert.strictEqual(ledger.getOperation(keyA).status, 'pending');
    ledger.commitOperation(keyA, { receipt: { sheetName: 'Saídas', rowFingerprint: 'abc123' } });
    assert.strictEqual(ledger.getOperation(keyA).status, 'committed');
    ledger.close();
});

test('interpretation reliability acceptance battery has at least 300 offline cases', () => {
    const cases = buildInterpretationReliabilityAcceptanceCases();
    assert.ok(cases.length >= 300);
    assert.ok(cases.some(item => item.expectedDecision === 'block'));
    assert.ok(cases.some(item => item.expectedDecision === 'clarify'));
    assert.ok(cases.some(item => item.expectedDecision === 'confirm'));
    assert.ok(cases.some(item => item.expectedDecision === 'execute'));
    assert.ok(cases.every(item => /^IRAB-\d{3}$/.test(item.id)));
});

test('interpretation reliability acceptance battery executes every case without Gemini', () => {
    const report = runInterpretationReliabilityAcceptance({
        securityDetector: messageHandler.__test__.detectSecuritySensitiveRequest
    });

    assert.strictEqual(report.total, 340);
    assert.strictEqual(report.matched, 340, JSON.stringify(report.mismatches.slice(0, 30)));
    assert.deepStrictEqual(report.mismatches, []);
    assert.strictEqual(report.byDecision.block.matched, report.byDecision.block.total);
    assert.strictEqual(report.byDecision.execute.matched, report.byDecision.execute.total);
    assert.strictEqual(report.byDecision.confirm.matched, report.byDecision.confirm.total);
    assert.strictEqual(report.byDecision.clarify.matched, report.byDecision.clarify.total);
});

test('legacy response generator does not send raw analytical rows to Gemini', async () => {
    const geminiClientPath = require.resolve('../src/ai/geminiClient');
    const responseGeneratorPath = require.resolve('../src/ai/responseGenerator');
    delete require.cache[responseGeneratorPath];
    require.cache[geminiClientPath] = {
        id: geminiClientPath,
        filename: geminiClientPath,
        loaded: true,
        exports: {
            askLLM: async () => {
                throw new Error('Gemini should not be called for legacy analytical formatting');
            }
        }
    };

    const { generate } = require('../src/ai/responseGenerator');
    const reply = await generate({
        intent: 'pergunta_geral',
        rawResults: [['10/06/2026', 'mercado privado', 'Alimentação', '', 10]],
        details: {},
        userQuestion: 'me explique'
    });

    assert.match(reply, /resposta segura/i);
    assert.doesNotMatch(reply, /mercado privado/);
});
