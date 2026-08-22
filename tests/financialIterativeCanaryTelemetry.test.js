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

test('iterative canary telemetry persists and summarizes promoted and fallback attempts', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-iterative-canary-'));
    const telemetryPath = path.join(directory, 'attempts.jsonl');
    try {
        recordFinancialIterativeCanaryAttempt({
            domain: 'expenses', source: 'central_read_model', outcome: 'promoted',
            reason: 'candidate_answer', readCount: 2, candidateAction: 'answer',
            adequacyStatus: 'adequate', baselineAvailable: true, sideEffectsZero: true
        }, { telemetryPath, now: () => new Date('2026-08-22T12:00:00.000Z') });
        recordFinancialIterativeCanaryAttempt({
            domain: 'expenses', source: 'central_read_model', outcome: 'fallback',
            reason: 'reasoner_unavailable', readCount: 0, candidateAction: 'none',
            adequacyStatus: 'unknown', baselineAvailable: true
        }, { telemetryPath, now: () => new Date('2026-08-22T12:01:00.000Z') });
        fs.appendFileSync(telemetryPath, '{invalid\n', 'utf8');

        const summary = summarizeFinancialIterativeCanaryTelemetry({
            telemetryPath,
            since: '2026-08-22T11:59:00.000Z'
        });
        assert.strictEqual(summary.total, 2);
        assert.strictEqual(summary.invalid, 1);
        assert.deepStrictEqual(summary.byDomain, { expenses: 2 });
        assert.deepStrictEqual(summary.bySource, { central_read_model: 2 });
        assert.deepStrictEqual(summary.byOutcome, { promoted: 1, fallback: 1 });
        assert.deepStrictEqual(summary.byReason, { candidate_answer: 1, reasoner_unavailable: 1 });
        assert.strictEqual(summary.first, '2026-08-22T12:00:00.000Z');
        assert.strictEqual(summary.last, '2026-08-22T12:01:00.000Z');
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
