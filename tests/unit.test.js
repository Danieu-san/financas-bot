const test = require('node:test');
const assert = require('node:assert');
const helpers = require('../src/utils/helpers');
const analysisService = require('../src/services/analysisService');
const userStateManager = require('../src/state/userStateManager');

// --- Helpers Tests ---
test('helpers.parseValue', (t) => {
    assert.strictEqual(helpers.parseValue("1.800,50"), 1800.5, 'BR format should work');
    assert.strictEqual(helpers.parseValue("120.50"), 120.5, 'US format should work');
    assert.strictEqual(helpers.parseValue("R$ 1.234,56"), 1234.56, 'Format with R$ should work');
    assert.strictEqual(helpers.parseValue("abc"), 0, 'Invalid string should return 0');
    assert.strictEqual(helpers.parseValue(""), 0, 'Empty string should return 0');
    assert.strictEqual(helpers.parseValue(null), 0, 'Null should return 0');
});

test('helpers.parseAmountLocal', (t) => {
    assert.strictEqual(helpers.parseAmountLocal('2000'), 2000);
    assert.strictEqual(helpers.parseAmountLocal('2.000'), 2000);
    assert.strictEqual(helpers.parseAmountLocal('R$ 2 mil'), 2000);
    assert.strictEqual(helpers.parseAmountLocal('dois mil'), 2000);
    assert.strictEqual(helpers.parseAmountLocal('dois mil e quinhentos'), 2500);
});

test('helpers.normalizeText', (t) => {
    assert.strictEqual(helpers.normalizeText("Ação"), "acao", 'Accents should be removed');
    assert.strictEqual(helpers.normalizeText("TEXTO"), "texto", 'Should lowercase');
    assert.strictEqual(helpers.normalizeText("É o bicho!"), "e o bicho!", 'Mixed case and accents');
    assert.strictEqual(helpers.normalizeText(null), '', 'Null should return empty string');
});

test('helpers.parseSheetDate', (t) => {
    const d1 = helpers.parseSheetDate("15/03/2026");
    assert.strictEqual(d1.getDate(), 15);
    assert.strictEqual(d1.getMonth(), 2); // March is index 2
    assert.strictEqual(d1.getFullYear(), 2026);

    const d2 = helpers.parseSheetDate("15/03/2026 10:30");
    assert.strictEqual(d2.getDate(), 15);
    assert.strictEqual(d2.getFullYear(), 2026);

    assert.strictEqual(helpers.parseSheetDate("invalid"), null, 'Invalid date string should return null');
    assert.strictEqual(helpers.parseSheetDate(""), null, 'Empty string should return null');
});

test('helpers.getFormattedDateOnly', (t) => {
    const today = new Date();
    const formatted = helpers.getFormattedDateOnly(today);
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    assert.strictEqual(formatted, `${day}/${month}/${year}`);
});

// --- Analysis Service Tests ---
const mockData = [
    ["01/03/2026", "Gasto 1", "Alimentação", "Supermercado", "100,50"],
    ["15/03/2026", "Gasto 2", "Lazer", "Cinema", "50,00"],
    ["20/03/2026", "Gasto 3", "Alimentação", "Restaurante", "150,00"],
    ["05/04/2026", "Gasto 4", "Educação", "Curso", "500,00"]
];

test('analysisService.calculateTotal', (t) => {
    const total = analysisService.calculateTotal(mockData, 4);
    assert.strictEqual(total, 100.5 + 50.0 + 150.0 + 500.0);
});

test('analysisService.calculateAverage', (t) => {
    const avg = analysisService.calculateAverage(mockData);
    assert.strictEqual(avg, (100.5 + 50.0 + 150.0 + 500.0) / 4);
});

test('analysisService.findMinMax', (t) => {
    const { min, max } = analysisService.findMinMax(mockData);
    assert.deepStrictEqual(min, mockData[1], 'Min should be 50,00');
    assert.deepStrictEqual(max, mockData[3], 'Max should be 500,00');
});

test('analysisService.getExpensesByMonthAndCategory', (t) => {
    const result = analysisService.getExpensesByMonthAndCategory(mockData, 2, 2026, "Alimentação");
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0][1], "Gasto 1");
    assert.strictEqual(result[1][1], "Gasto 3");
});

// --- User State Manager Tests ---
test('userStateManager.stateFunctions', (t) => {
    const userId = '123456';
    const state = { step: 'awaiting_payment_method', amount: 100 };

    userStateManager.setState(userId, state);
    assert.deepStrictEqual(userStateManager.getState(userId), state, 'Should retrieve state');

    userStateManager.deleteState(userId);
    assert.strictEqual(userStateManager.getState(userId), undefined, 'Should be deleted');
});
