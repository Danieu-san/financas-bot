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
    buildWriteInterpretationEvaluation,
    evaluateInterpretationReliabilityGate
} = require('../src/reliability/interpretationReliabilityGate');
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

test('interpretation reliability recognizes bill.pay as a confirm-only write operation', () => {
    const candidate = canonicalizeInterpretation(buildInterpretationCandidate({
        operation: 'bill.pay',
        fields: {
            amount: { value: 469.09, source: 'user_state', assurance: 'verified' },
            payment: { value: 'PIX', source: 'user_state', assurance: 'verified' },
            scope: { value: 'personal', source: 'user_state', assurance: 'verified' },
            target: { value: 'Conta de telefone', source: 'user_state', assurance: 'verified' }
        }
    }));

    const decision = decideInterpretationRisk(candidate);

    assert.strictEqual(decision.action, 'confirm');
    assert.ok(decision.reasons.includes('sensitive_or_multi_item_operation'));
    assert.ok(!decision.reasons.includes('operation_not_allowlisted'));
});

test('interpretation reliability recognizes debt.pay as a confirm-only write operation', () => {
    const candidate = canonicalizeInterpretation(buildInterpretationCandidate({
        operation: 'debt.pay',
        fields: {
            amount: { value: 200, source: 'user_state', assurance: 'verified' },
            scope: { value: 'personal', source: 'user_state', assurance: 'verified' },
            target: { value: 'Financiamento Teste', source: 'user_state', assurance: 'verified' }
        }
    }));

    const decision = decideInterpretationRisk(candidate);

    assert.strictEqual(decision.action, 'confirm');
    assert.ok(decision.reasons.includes('sensitive_or_multi_item_operation'));
    assert.ok(!decision.reasons.includes('operation_not_allowlisted'));
});

test('interpretation reliability recognizes invoice.pay as a confirm-only write operation', () => {
    const candidate = canonicalizeInterpretation(buildInterpretationCandidate({
        operation: 'invoice.pay',
        fields: {
            amount: { value: 850, source: 'user_state', assurance: 'verified' },
            payment: { value: 'PIX', source: 'user_state', assurance: 'verified' },
            scope: { value: 'personal', source: 'user_state', assurance: 'verified' },
            target: { value: 'Nubank Daniel - 06/2026', source: 'user_state', assurance: 'verified' },
            movementType: { value: 'invoice_payment', source: 'user_state', assurance: 'verified' }
        }
    }));

    const decision = decideInterpretationRisk(candidate);

    assert.strictEqual(decision.action, 'confirm');
    assert.ok(decision.reasons.includes('sensitive_or_multi_item_operation'));
    assert.ok(!decision.reasons.includes('operation_not_allowlisted'));
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
        evaluationLatencyMs: 7.8,
        additionalGeminiCalls: 0,
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
    assert.strictEqual(telemetry.evaluationLatencyMs, 8);
    assert.strictEqual(telemetry.additionalGeminiCalls, 0);
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

test('interpretation reliability gate preserves current flow while off or shadow', () => {
    const decision = { action: 'clarify', reasons: ['missing_critical_field'], clarificationFields: ['payment'] };

    const disabled = evaluateInterpretationReliabilityGate({
        operation: 'expense.create',
        decision
    }, {
        env: { INTERPRETATION_RELIABILITY_MODE: 'off' }
    });
    const shadow = evaluateInterpretationReliabilityGate({
        operation: 'expense.create',
        decision
    }, {
        env: {
            INTERPRETATION_RELIABILITY_MODE: 'shadow',
            INTERPRETATION_RELIABILITY_OPERATIONS: 'expense.create'
        }
    });

    assert.deepStrictEqual(disabled, {
        mode: 'off',
        applied: false,
        proceed: true,
        action: 'bypass',
        reason: 'disabled'
    });
    assert.deepStrictEqual(shadow, {
        mode: 'shadow',
        applied: true,
        proceed: true,
        action: 'observe',
        reason: 'shadow_observation_only'
    });
});

test('interpretation reliability gate enforces only allowlisted operations', () => {
    const env = {
        INTERPRETATION_RELIABILITY_MODE: 'enforce',
        INTERPRETATION_RELIABILITY_OPERATIONS: 'expense.create,income.create'
    };

    const execute = evaluateInterpretationReliabilityGate({
        operation: 'expense.create',
        decision: { action: 'execute', reasons: [] }
    }, { env });
    const confirm = evaluateInterpretationReliabilityGate({
        operation: 'income.create',
        decision: { action: 'confirm', reasons: ['critical_field_not_deterministic'] }
    }, { env });
    const clarify = evaluateInterpretationReliabilityGate({
        operation: 'expense.create',
        decision: { action: 'clarify', reasons: ['missing_critical_field'], clarificationFields: ['payment'] }
    }, { env });
    const block = evaluateInterpretationReliabilityGate({
        operation: 'expense.create',
        decision: { action: 'block', reasons: ['unauthorized_scope'] }
    }, { env });
    const outsideAllowlist = evaluateInterpretationReliabilityGate({
        operation: 'transfer.create',
        decision: { action: 'block', reasons: ['unauthorized_scope'] }
    }, { env });

    assert.strictEqual(execute.proceed, true);
    assert.strictEqual(execute.action, 'execute');
    assert.strictEqual(confirm.proceed, false);
    assert.strictEqual(confirm.action, 'confirm');
    assert.strictEqual(clarify.proceed, false);
    assert.strictEqual(clarify.action, 'clarify');
    assert.strictEqual(block.proceed, false);
    assert.strictEqual(block.action, 'block');
    assert.deepStrictEqual(outsideAllowlist, {
        mode: 'enforce',
        applied: false,
        proceed: true,
        action: 'bypass',
        reason: 'operation_not_allowlisted'
    });
});

test('interpretation reliability gate does not enforce any operation without an explicit allowlist', () => {
    const result = evaluateInterpretationReliabilityGate({
        operation: 'expense.create',
        decision: { action: 'execute', reasons: [] }
    }, {
        env: { INTERPRETATION_RELIABILITY_MODE: 'enforce' }
    });

    assert.deepStrictEqual(result, {
        mode: 'enforce',
        applied: false,
        proceed: true,
        action: 'bypass',
        reason: 'operation_not_allowlisted'
    });
});

test('interpretation reliability gate allows a confirm decision only after explicit user confirmation', () => {
    const env = {
        INTERPRETATION_RELIABILITY_MODE: 'enforce',
        INTERPRETATION_RELIABILITY_OPERATIONS: 'expense.create'
    };
    const decision = { action: 'confirm', reasons: ['critical_field_not_deterministic'] };

    const beforeConfirmation = evaluateInterpretationReliabilityGate({
        operation: 'expense.create',
        decision
    }, { env });
    const afterConfirmation = evaluateInterpretationReliabilityGate({
        operation: 'expense.create',
        decision,
        userConfirmed: true
    }, { env });

    assert.strictEqual(beforeConfirmation.proceed, false);
    assert.deepStrictEqual(afterConfirmation, {
        mode: 'enforce',
        applied: true,
        proceed: true,
        action: 'execute_after_confirmation',
        reason: 'user_confirmation_satisfied'
    });
});

test('write interpretation evaluation merges deterministic message evidence with verified state fields', () => {
    const evaluation = buildWriteInterpretationEvaluation({
        operation: 'expense.create',
        message: 'gastei 25 no mercado',
        fields: {
            payment: { value: 'PIX', source: 'user_state', assurance: 'verified', evidence: 'payment_reply' }
        }
    }, {
        env: {
            INTERPRETATION_RELIABILITY_MODE: 'enforce',
            INTERPRETATION_RELIABILITY_OPERATIONS: 'expense.create'
        }
    });

    assert.strictEqual(evaluation.candidate.fields.amount.source, 'deterministic');
    assert.strictEqual(evaluation.candidate.fields.payment.source, 'user_state');
    assert.strictEqual(evaluation.decision.action, 'execute');
    assert.strictEqual(evaluation.gate.proceed, true);
});

test('write interpretation evaluation does not auto-execute a critical amount supplied only by LLM', () => {
    const evaluation = buildWriteInterpretationEvaluation({
        operation: 'expense.create',
        message: 'paguei o almoço',
        fields: {
            amount: { value: 25, source: 'llm', assurance: 'supported', evidence: 'structured_response' },
            payment: { value: 'PIX', source: 'user_state', assurance: 'verified', evidence: 'payment_reply' },
            scope: { value: 'personal', source: 'user_state', assurance: 'verified', evidence: 'active_user' },
            movementType: { value: 'expense', source: 'llm', assurance: 'supported', evidence: 'structured_response' }
        }
    }, {
        env: {
            INTERPRETATION_RELIABILITY_MODE: 'enforce',
            INTERPRETATION_RELIABILITY_OPERATIONS: 'expense.create'
        }
    });

    assert.strictEqual(evaluation.decision.action, 'confirm');
    assert.strictEqual(evaluation.gate.proceed, false);
    assert.strictEqual(evaluation.gate.action, 'confirm');
});

test('write interpretation evaluation clarifies when deterministic and LLM critical fields conflict', () => {
    const evaluation = buildWriteInterpretationEvaluation({
        operation: 'expense.create',
        message: 'gastei 100 no pix',
        fields: {
            amount: { value: 120, source: 'llm', assurance: 'supported', evidence: 'structured_response' },
            payment: { value: 'PIX', source: 'llm', assurance: 'supported', evidence: 'structured_response' },
            scope: { value: 'personal', source: 'user_state', assurance: 'verified', evidence: 'active_user' },
            movementType: { value: 'expense', source: 'llm', assurance: 'supported', evidence: 'structured_response' }
        }
    }, {
        env: {
            INTERPRETATION_RELIABILITY_MODE: 'enforce',
            INTERPRETATION_RELIABILITY_OPERATIONS: 'expense.create'
        }
    });

    assert.strictEqual(evaluation.decision.action, 'clarify');
    assert.ok(evaluation.decision.clarificationFields.includes('amount'));
    assert.strictEqual(evaluation.gate.proceed, false);
});

test('deterministic interpretation does not guess the amount when a message has multiple unmarked numbers', () => {
    const candidate = extractDeterministicInterpretation('comprei 2 camisas por 100 no pix');

    assert.strictEqual(candidate.operation, 'expense.create');
    assert.strictEqual(candidate.fields.amount, undefined);
    assert.ok(candidate.missingFields.includes('amount'));
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
        evaluationLatencyMs: 5,
        additionalGeminiCalls: 0,
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
    assert.strictEqual(ready.autoSaveCandidatePrecision, 1);
    assert.strictEqual(ready.ambiguousAutoSaveViolations, 0);
    assert.strictEqual(ready.additionalGeminiCalls, 0);
    assert.strictEqual(ready.evaluationLatencyP95Ms, 5);
});

test('enforce readiness monitor blocks critical divergence and short observation windows', () => {
    const now = new Date('2026-06-30T12:00:00.000Z');
    const entries = Array.from({ length: 50 }, (_, index) => ({
        ts: new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000) + (index * 60 * 1000)).toISOString(),
        mode: 'shadow',
        operation: index % 2 === 0 ? 'expense.create' : 'income.create',
        action: 'execute',
        currentFlowOutcome: 'write_attempt',
        divergenceSeverity: index === 10 ? 'critical' : 'none',
        evaluationLatencyMs: 5,
        additionalGeminiCalls: 0
    }));

    const report = evaluateEnforceReadiness(entries, { now });

    assert.strictEqual(report.readyForManualReview, false);
    assert.ok(report.blockers.includes('observation_window_too_short'));
    assert.ok(report.blockers.includes('critical_divergence_found'));
    assert.strictEqual(report.criticalDivergences, 1);
});

test('enforce readiness monitor can evaluate an audited post-fix window without deleting old telemetry', () => {
    const now = new Date('2026-07-20T12:00:00.000Z');
    const since = '2026-07-01T00:00:00.000Z';
    const oldCritical = {
        ts: '2026-06-16T13:20:00.000Z',
        mode: 'shadow',
        operation: 'expense.create',
        action: 'confirm',
        currentFlowOutcome: 'write_attempt',
        divergenceSeverity: 'critical',
        evaluationLatencyMs: 5,
        additionalGeminiCalls: 0
    };
    const cleanWindow = Array.from({ length: 50 }, (_, index) => ({
        ts: new Date(Date.parse(since) + (index * 60 * 60 * 1000)).toISOString(),
        mode: 'shadow',
        operation: index % 2 === 0 ? 'expense.create' : 'income.create',
        action: 'execute',
        currentFlowOutcome: 'write_attempt',
        divergenceSeverity: 'none',
        evaluationLatencyMs: 5,
        additionalGeminiCalls: 0
    }));

    const withoutCutoff = evaluateEnforceReadiness([oldCritical, ...cleanWindow], { now });
    assert.ok(withoutCutoff.blockers.includes('critical_divergence_found'));

    const withCutoff = evaluateEnforceReadiness([oldCritical, ...cleanWindow], { now, since });
    assert.strictEqual(withCutoff.readyForManualReview, true);
    assert.strictEqual(withCutoff.criticalDivergences, 0);
    assert.strictEqual(withCutoff.shadowEntries, 50);
    assert.strictEqual(withCutoff.shadowEntriesTotal, 51);
    assert.strictEqual(withCutoff.ignoredEntriesBeforeSince, 1);
    assert.strictEqual(withCutoff.telemetrySince, since);
    assert.deepStrictEqual(withCutoff.blockers, []);
});

test('enforce readiness monitor requires a meaningful sample for every operation', () => {
    const now = new Date('2026-06-30T12:00:00.000Z');
    const entries = Array.from({ length: 50 }, (_, index) => ({
        ts: new Date(now.getTime() - (15 * 24 * 60 * 60 * 1000) + (index * 60 * 1000)).toISOString(),
        mode: 'shadow',
        operation: index === 49 ? 'income.create' : 'expense.create',
        action: 'execute',
        currentFlowOutcome: 'write_attempt',
        divergenceSeverity: 'none',
        evaluationLatencyMs: 5,
        additionalGeminiCalls: 0
    }));

    const report = evaluateEnforceReadiness(entries, { now });

    assert.strictEqual(report.readyForManualReview, false);
    assert.ok(report.blockers.includes('missing_required_operation:income.create'));
});

test('enforce readiness monitor blocks unsafe autosave alignment, extra Gemini calls and missing latency evidence', () => {
    const now = new Date('2026-06-30T12:00:00.000Z');
    const entries = Array.from({ length: 50 }, (_, index) => ({
        ts: new Date(now.getTime() - (15 * 24 * 60 * 60 * 1000) + (index * 60 * 1000)).toISOString(),
        mode: 'shadow',
        operation: index % 2 === 0 ? 'expense.create' : 'income.create',
        action: index === 1 ? 'clarify' : 'execute',
        currentFlowOutcome: 'write_attempt',
        divergenceSeverity: index === 0 ? 'important' : 'none',
        evaluationLatencyMs: index === 2 ? undefined : (index >= 3 && index <= 8 ? 100 : 5),
        additionalGeminiCalls: index === 4 ? 1 : 0
    }));

    const report = evaluateEnforceReadiness(entries, { now });

    assert.strictEqual(report.readyForManualReview, false);
    assert.ok(report.blockers.includes('auto_save_precision_below_threshold'));
    assert.ok(report.blockers.includes('ambiguous_auto_save_violation'));
    assert.ok(report.blockers.includes('extra_gemini_calls_detected'));
    assert.ok(report.blockers.includes('missing_latency_evidence'));
    assert.ok(report.blockers.includes('evaluation_latency_too_high'));
    assert.strictEqual(report.ambiguousAutoSaveViolations, 1);
    assert.strictEqual(report.additionalGeminiCalls, 1);
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
        autoSaveCandidatePrecision: 1,
        ambiguousAutoSaveViolations: 0,
        additionalGeminiCalls: 0,
        evaluationLatencyP95Ms: 4.5,
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
    assert.match(sent[0].message, /Precisão dos candidatos a auto-save: 100.00%/);
    assert.match(sent[0].message, /Chamadas Gemini adicionais: 0/);
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

    assert.strictEqual(report.total, 350);
    assert.strictEqual(report.matched, 350, JSON.stringify(report.mismatches.slice(0, 30)));
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

test('legacy response generator handles null details without crashing or calling Gemini', async () => {
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
        rawResults: 'Pergunta genérica',
        details: null,
        userQuestion: 'teste'
    });

    assert.match(reply, /resposta segura/i);
    assert.doesNotMatch(reply, /Pergunta genérica/);
});
