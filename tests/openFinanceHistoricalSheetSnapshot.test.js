const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    collectSnapshot,
    isInside,
    REQUIRED_CATALOG_RANGES
} = require('../scripts/runOpenFinanceHistoricalSheetSnapshot');

test('collects only consolidated personal ranges through a required user-scoped read', async () => {
    const calls = [];
    const result = await collectSnapshot({
        userId: 'user-1',
        readDataFromSheet: async (range, options) => {
            calls.push({ range, options });
            return [[range]];
        }
    });

    assert.deepEqual(calls.map(call => call.range), REQUIRED_CATALOG_RANGES);
    assert.ok(calls.every(call => call.options.userId === 'user-1'));
    assert.ok(calls.every(call => call.options.requireUserScoped === true));
    assert.ok(calls.every(call => call.options.suppressMissingSheetError === true));
    assert.equal(result.source, 'user_spreadsheet_read_only');
    assert.equal(result.financial_writes, 0);
    assert.equal(Object.keys(result.ranges).length, REQUIRED_CATALOG_RANGES.length);
    assert.ok(REQUIRED_CATALOG_RANGES.includes('Contas!A:I'));
});

test('refuses a personal snapshot without an explicit user identity', async () => {
    await assert.rejects(
        collectSnapshot({ readDataFromSheet: async () => [] }),
        /historical_sheet_snapshot_user_id_required/
    );
});

test('sheet snapshot path guard resolves symbolic ancestors', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-sheet-root-'));
    const privateDirectory = path.join(root, 'private');
    const externalDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-sheet-link-'));
    fs.mkdirSync(privateDirectory);
    const link = path.join(externalDirectory, 'linked-private');
    try {
        fs.symlinkSync(privateDirectory, link, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
        t.skip(`symbolic link unavailable: ${error.code || error.message}`);
        return;
    }
    assert.equal(isInside(root, path.join(link, 'snapshot.json')), true);
});
