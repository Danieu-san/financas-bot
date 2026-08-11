const test = require('node:test');
const assert = require('node:assert/strict');
const {
    collectSnapshot,
    REQUIRED_CATALOG_RANGES
} = require('../scripts/runOpenFinanceHistoricalSheetSnapshot');

test('collects existing ranges and required catalogs through read-only dependency only', async () => {
    const calls = [];
    const result = await collectSnapshot({
        existingSnapshot: { ranges: { 'Saídas!A:K': [['header']] } },
        readDataFromSheet: async (range, options) => {
            calls.push({ range, options });
            return [[range]];
        }
    });

    assert.deepEqual(calls.map(call => call.range), [
        'Saídas!A:K',
        ...REQUIRED_CATALOG_RANGES
    ]);
    assert.ok(calls.every(call => call.options.suppressMissingSheetError === true));
    assert.equal(result.financial_writes, 0);
    assert.equal(Object.keys(result.ranges).length, 5);
});
