const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    __test__: { sourceRef }
} = require('../src/openFinance/openFinanceHistoricalImportPlanner');
const {
    buildReviewBatch,
    isInside
} = require('../scripts/buildOpenFinanceHistoricalReviewBatch');

test('groups category review items without losing individual source references', () => {
    const transactions = [
        { id: 'one', item_id: 'item', account_id: 'account',
            provider_id: 'one-provider', description: 'Fornecedor Central A',
            amount_cents: -100, date: '2026-01-01' },
        { id: 'two', item_id: 'item', account_id: 'account',
            provider_id: 'two-provider', description: 'Fornecedor Central B',
            amount_cents: -200, date: '2026-01-02' }
    ];
    const entries = transactions.map(transaction => ({
        source_ref: sourceRef(transaction),
        state: 'needs_review',
        reason: 'category_required'
    }));
    const result = buildReviewBatch({
        pluggySnapshot: { items: [{ id: 'item', transactions }] },
        plan: { plan_hash: 'hash', entries }
    });

    assert.equal(result.category_groups.length, 1);
    assert.equal(result.category_groups[0].count, 2);
    assert.equal(result.category_groups[0].source_refs.length, 2);
    assert.equal(result.summary.repeated_groups, 1);
    assert.equal(result.financial_writes, 0);
});
test('review batch path guard resolves symbolic ancestors', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-review-root-'));
    const privateDirectory = path.join(root, 'private');
    const externalDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-review-link-'));
    fs.mkdirSync(privateDirectory);
    const link = path.join(externalDirectory, 'linked-private');
    try {
        fs.symlinkSync(privateDirectory, link, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
        t.skip(`symbolic link unavailable: ${error.code || error.message}`);
        return;
    }
    assert.equal(isInside(root, path.join(link, 'review.json')), true);
});
