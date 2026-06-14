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
