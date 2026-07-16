const assert = require('node:assert/strict');
const test = require('node:test');
const { reconcileOpenFinanceShadow } = require('../src/openFinance/openFinanceShadowReconciler');

const secret = 'open-finance-shadow-test-secret-32-bytes';
function item(transactions) { return { id: 'item-1', alias_code: 'daniel_nubank', transactions }; }

test('9D matches exact amount date direction and description without writes', () => {
    const result = reconcileOpenFinanceShadow({ secret, openFinanceItems: [item([{ id: 'p1', date: '2026-07-15', description: 'Mercado Central', amount_cents: -12500, type: 'DEBIT' }])], canonicalTransactions: [{ id: 'c1', date: '15/07/2026', description: 'Mercado Central', amountCents: 12500, direction: 'debit' }] });
    assert.equal(result.decisions[0].status, 'matched');
    assert.equal(result.phase3g_links.length, 1);
    assert.equal(result.financial_writes, 0);
});

test('9D marks reused canonical candidate as possible duplicate', () => {
    const source = { date: '2026-07-15', description: 'Loja A', amount_cents: -5000, type: 'DEBIT' };
    const result = reconcileOpenFinanceShadow({ secret, openFinanceItems: [item([{ ...source, id: 'p1' }, { ...source, id: 'p2' }])], canonicalTransactions: [{ id: 'c1', date: '15/07/2026', description: 'Loja A', amountCents: 5000, direction: 'debit' }] });
    assert.deepEqual(result.decisions.map(row => row.status), ['possible_duplicate', 'possible_duplicate']);
});

test('9D keeps amount and date match with different text as possible duplicate', () => {
    const result = reconcileOpenFinanceShadow({ secret, openFinanceItems: [item([{ id: 'p1', date: '2026-07-15', description: 'PAGAMENTO TRANSACAO', amount_cents: -5000, type: 'DEBIT' }])], canonicalTransactions: [{ id: 'c1', date: '15/07/2026', description: 'Descricao manual diferente', amountCents: 5000, direction: 'debit' }] });
    assert.equal(result.decisions[0].status, 'possible_duplicate');
    assert.equal(result.decisions[0].rule, 'weak_candidate');
});

test('9D never matches unavailable date or different direction', () => {
    const result = reconcileOpenFinanceShadow({ secret, openFinanceItems: [item([{ id: 'p1', date: null, description: 'Salario', amount_cents: 100000, type: 'CREDIT' }, { id: 'p2', date: '2026-07-15', description: 'Salario', amount_cents: 100000, type: 'CREDIT' }])], canonicalTransactions: [{ id: 'c1', date: '15/07/2026', description: 'Salario', amountCents: 100000, direction: 'debit' }] });
    assert.equal(result.decisions[0].status, 'uncertain');
    assert.equal(result.decisions[1].status, 'new');
});

test('9D output uses refs and does not expose descriptions', () => {
    const result = reconcileOpenFinanceShadow({ secret, openFinanceItems: [item([{ id: 'private-id', date: '2026-07-15', description: 'DESCRICAO PRIVADA', amount_cents: -100, type: 'DEBIT' }])], canonicalTransactions: [] });
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes('DESCRICAO PRIVADA'), false);
    assert.equal(serialized.includes('private-id'), false);
});
