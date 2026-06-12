const test = require('node:test');
const assert = require('node:assert');

const {
    CASES,
    collectForbiddenKeys,
    isMonthlyCapError,
    matchesExpected,
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
