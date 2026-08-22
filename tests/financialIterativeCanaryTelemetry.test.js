const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    recordFinancialIterativeCanaryAttempt,
    sanitizeFinancialIterativeCanaryAttempt,
    summarizeFinancialIterativeCanaryTelemetry
} = require('../src/agent/financialIterativeCanaryTelemetry');

test('iterative canary telemetry keeps only sanitized operational fields', () => {
    const record = sanitizeFinancialIterativeCanaryAttempt({
        attemptId: '11111111-1111-4111-8111-111111111111',
        domain: 'Expenses Daniel 123',
        source: 'personal_sheet',
        outcome: 'promoted',
        reason: 'candidate answer',
        readCount: 99,
        candidateAction: 'answer',
        adequacyStatus: 'adequate',
        baselineAvailable: true,
        sideEffectsZero: true,
        userId: 'private-user',
        message: 'R$ 999,99 no mercado',
        payload: { value: 999.99 }
    }, { now: () => new Date('2026-08-22T12:00:00.000Z') });

    assert.deepStrictEqual(record, {
        ts: '2026-08-22T12:00:00.000Z',
        schemaVersion: 'financial-iterative-canary-v1',
        attemptId: '11111111-1111-4111-8111-111111111111',
        domain: 'expensesdaniel123',
        source: 'personal_sheet',
        outcome: 'promoted',
        reason: 'candidateanswer',
        readCount: 3,
        candidateAction: 'answer',
        adequacyStatus: 'adequate',
        baselineAvailable: true,
        sideEffectsZero: true
    });
    assert.doesNotMatch(JSON.stringify(record), /private|999|mercado|userId|payload|R\$/i);

    const unknownSideEffects = sanitizeFinancialIterativeCanaryAttempt({
        sideEffectsZero: 'false'
    }, { now: () => new Date('2026-08-22T12:00:00.000Z') });
    assert.strictEqual(unknownSideEffects.sideEffectsZero, null);
});

test('iterative canary telemetry refuses an invalid report boundary', () => {
    assert.throws(
        () => summarizeFinancialIterativeCanaryTelemetry({ since: 'not-a-date' }),
        /financial_iterative_canary_invalid_since/
    );
});

test('iterative canary telemetry distinguishes delivered, fallback and interrupted selections', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-iterative-canary-'));
    const telemetryPath = path.join(directory, 'attempts.jsonl');
    try {
        recordFinancialIterativeCanaryAttempt({
            attemptId: '11111111-1111-4111-8111-111111111111',
            domain: 'expenses', source: 'central_read_model', outcome: 'selected',
            reason: 'candidate_answer', readCount: 2, candidateAction: 'answer',
            adequacyStatus: 'adequate', baselineAvailable: true, sideEffectsZero: true
        }, { telemetryPath, now: () => new Date('2026-08-22T12:00:00.000Z') });
        recordFinancialIterativeCanaryAttempt({
            attemptId: '11111111-1111-4111-8111-111111111111',
            domain: 'expenses', source: 'central_read_model', outcome: 'promoted',
            reason: 'reply_succeeded', readCount: 2, candidateAction: 'answer',
            adequacyStatus: 'adequate', baselineAvailable: true, sideEffectsZero: true
        }, { telemetryPath, now: () => new Date('2026-08-22T12:00:30.000Z') });
        recordFinancialIterativeCanaryAttempt({
            attemptId: '22222222-2222-4222-8222-222222222222',
            domain: 'expenses', source: 'central_read_model', outcome: 'fallback',
            reason: 'reasoner_unavailable', readCount: 0, candidateAction: 'none',
            adequacyStatus: 'unknown', baselineAvailable: true
        }, { telemetryPath, now: () => new Date('2026-08-22T12:01:00.000Z') });
        recordFinancialIterativeCanaryAttempt({
            attemptId: '33333333-3333-4333-8333-333333333333',
            domain: 'expenses', source: 'personal_sheet', outcome: 'selected',
            reason: 'candidate_answer', readCount: 1, candidateAction: 'answer',
            adequacyStatus: 'adequate', baselineAvailable: true, sideEffectsZero: true
        }, { telemetryPath, now: () => new Date('2026-08-22T12:02:00.000Z') });
        fs.appendFileSync(telemetryPath, '{invalid\n', 'utf8');

        const summary = summarizeFinancialIterativeCanaryTelemetry({
            telemetryPath,
            since: '2026-08-22T11:59:00.000Z'
        });
        assert.strictEqual(summary.total, 4);
        assert.strictEqual(summary.invalid, 1);
        assert.deepStrictEqual(summary.byDomain, { expenses: 4 });
        assert.deepStrictEqual(summary.bySource, { central_read_model: 3, personal_sheet: 1 });
        assert.deepStrictEqual(summary.byOutcome, { selected: 2, promoted: 1, fallback: 1 });
        assert.deepStrictEqual(summary.byReason, {
            candidate_answer: 2,
            reply_succeeded: 1,
            reasoner_unavailable: 1
        });
        assert.deepStrictEqual(summary.attempts, {
            total: 3,
            promoted: 1,
            fallback: 1,
            pending: 1,
            conflicting: 0
        });
        assert.strictEqual(summary.first, '2026-08-22T12:00:00.000Z');
        assert.strictEqual(summary.last, '2026-08-22T12:02:00.000Z');
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
