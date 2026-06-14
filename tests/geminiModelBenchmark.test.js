const test = require('node:test');
const assert = require('node:assert');

const {
    CASES,
    collectForbiddenKeys,
    evaluateBenchmarkResult,
    isMonthlyCapError,
    matchesExpected,
    normalizeBenchmarkField,
    parseJsonText
} = require('../scripts/runGeminiModelBenchmark');

test('Gemini model benchmark has forty safe synthetic cases', () => {
    assert.strictEqual(CASES.length, 40);
    assert.ok(CASES.every(item => !/token real|sheet_id real|user_id real/i.test(item.input)));
});

test('Gemini model benchmark compares expected subsets and normalized text', () => {
    assert.strictEqual(matchesExpected(
        { items: [{ intent: 'expense', amount: 10, payment: 'PIX', description: 'pão' }], needsClarification: false },
        { items: [{ intent: 'EXPENSE', amount: 10, payment: 'pix' }], needsClarification: false }
    ), true);
});

test('Gemini model benchmark parses fenced JSON and detects forbidden keys', () => {
    const parsed = parseJsonText('```json\n{"items":[],"token":"x"}\n```');
    assert.deepStrictEqual(collectForbiddenKeys(parsed), ['token']);
});

test('Gemini model benchmark stops safely on monthly spending cap errors', () => {
    assert.strictEqual(isMonthlyCapError({ status: 429, error: 'Your project has exceeded its monthly spending cap.' }), true);
    assert.strictEqual(isMonthlyCapError({ status: 429, error: 'Too many requests.' }), false);
});

test('Gemini model benchmark canonicalizes semantically equivalent fields', () => {
    assert.strictEqual(normalizeBenchmarkField('payment', 'cartão'), 'CREDIT');
    assert.strictEqual(normalizeBenchmarkField('payment', 'credito'), 'CREDIT');
    assert.strictEqual(normalizeBenchmarkField('category', 'ônibus'), 'Transporte');
    assert.strictEqual(normalizeBenchmarkField('transferType', 'resgate'), 'reserve_redeemed');
    assert.strictEqual(normalizeBenchmarkField('card', 'cartão nubank - thaís'), 'nubank thais');
});

test('Gemini model benchmark v2 reports field-level semantic equivalence and severity', () => {
    const evaluation = evaluateBenchmarkResult(
        {
            items: [{
                intent: 'expense',
                amount: 18.9,
                payment: 'cartão',
                category: 'ônibus',
                card: 'Cartão Nubank - Thaís'
            }],
            needsClarification: false
        },
        {
            items: [{
                intent: 'expense',
                amount: 18.9,
                payment: 'CREDIT',
                category: 'Transporte',
                card: 'Nubank Thais'
            }],
            needsClarification: false
        }
    );

    assert.strictEqual(evaluation.completeMatch, true);
    assert.strictEqual(evaluation.criticalMatch, true);
    assert.strictEqual(evaluation.worstSeverity, 'none');
    assert.ok(evaluation.fields.every(field => ['exact', 'semantic'].includes(field.status)));
});

test('Gemini model benchmark v2 marks unsafe adversarial execution as critical', () => {
    const evaluation = evaluateBenchmarkResult(
        { items: [{ intent: 'expense', amount: 10 }], needsClarification: false },
        { items: [{ intent: 'ambiguous' }], needsClarification: true }
    );

    assert.strictEqual(evaluation.completeMatch, false);
    assert.strictEqual(evaluation.criticalMatch, false);
    assert.strictEqual(evaluation.worstSeverity, 'critical');
    assert.ok(evaluation.fields.some(field => field.reason === 'unsafe_execution'));
});
