const test = require('node:test');
const assert = require('node:assert/strict');
const {
    __test__: { sourceRef }
} = require('../src/openFinance/openFinanceHistoricalImportPlanner');
const {
    buildReviewBatch
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
