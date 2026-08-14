const assert = require('node:assert/strict');
const test = require('node:test');
const { classifyOpenFinanceLifecycle } = require('../src/openFinance/openFinanceLifecycleClassifier');
const {
    isReviewableCreditPurchase,
    isMonotonicPurchaseStateTransition
} = require('../src/openFinance/openFinancePurchaseProposalEligibility');

const secret = 'open-finance-lifecycle-test-secret-32-bytes';

test('gate 39.1 limits open-invoice proposals to current non-installment credit purchases', () => {
    const pendingPurchase = {
        id: 'pending-current', account_id: 'card', amount_cents: 999,
        description: 'Assinatura', date: '2026-08-08T10:00:00.000Z', status: 'PENDING'
    };
    assert.equal(isReviewableCreditPurchase({
        classification: 'purchase', providerState: 'PENDING', accountType: 'CREDIT',
        transaction: pendingPurchase
    }), true);
    assert.equal(isReviewableCreditPurchase({
        classification: 'purchase', providerState: 'PENDING', accountType: 'CREDIT',
        transaction: { ...pendingPurchase, installment_number: 1, total_installments: 3 }
    }), false);
    assert.equal(isReviewableCreditPurchase({
        classification: 'future_installment', providerState: 'PENDING', accountType: 'CREDIT',
        transaction: pendingPurchase
    }), false);
    assert.equal(isReviewableCreditPurchase({
        classification: 'purchase', providerState: 'PENDING', accountType: 'BANK',
        transaction: pendingPurchase
    }), false);
    assert.equal(isReviewableCreditPurchase({
        classification: 'purchase', providerState: 'PENDING', accountType: 'CREDIT',
        transaction: { ...pendingPurchase, description: 'Electrolux 1/4' }
    }), false);
    assert.equal(isMonotonicPurchaseStateTransition('PENDING', 'POSTED'), true);
    assert.equal(isMonotonicPurchaseStateTransition('POSTED', 'PENDING'), false);
});
function item({ alias = 'daniel_nubank', accounts, transactions, investments = [] }) {
    return { id: `item-${alias}`, alias_code: alias, accounts, transactions, investments };
}
function account(id, type) { return { id, type }; }
function tx(id, accountId, amount, description, overrides = {}) {
    return { id, account_id: accountId, amount_cents: amount, description, date: '2026-07-16T10:00:00.000Z', status: 'POSTED', currency: 'BRL', ...overrides };
}

test('9D.1b classifies credit charge, refund and payment without write eligibility', () => {
    const result = classifyOpenFinanceLifecycle({ secret, items: [item({ accounts: [account('card', 'CREDIT')], transactions: [
        tx('purchase', 'card', 10000, 'Compra mercado'),
        tx('refund', 'card', -2000, 'Estorno compra'),
        tx('payment', 'card', -8000, 'Pagamento recebido')
    ] })] });
    assert.deepEqual(result.decisions.map(row => row.classification), ['purchase', 'refund', 'bill_payment']);
    assert.equal(result.decisions.every(row => !row.write_eligible && !row.alert_eligible), true);
});

test('Open Finance does not treat an overdue balance marker as a new purchase', () => {
    const result = classifyOpenFinanceLifecycle({ secret, items: [item({
        accounts: [account('card', 'CREDIT')],
        transactions: [tx('overdue-balance', 'card', 12345, 'Saldo em atraso')]
    })] });
    assert.equal(result.decisions[0].classification, 'bill_balance');
    assert.equal(result.decisions[0].rule, 'credit_overdue_balance_marker');
    assert.equal(result.decisions[0].write_eligible, false);
});

test('9D.1b PENDING and future installment never become write eligible', () => {
    const result = classifyOpenFinanceLifecycle({ secret, observedAt: '2026-07-16T10:00:00.000Z', items: [item({ accounts: [account('card', 'CREDIT')], transactions: [
        tx('pending', 'card', 1000, 'Compra', { status: 'PENDING' }),
        tx('future', 'card', 2000, 'Parcela', { status: 'PENDING', installment_number: 2, total_installments: 6, bill_forecast_month: '2026-08' })
    ] })] });
    assert.deepEqual(result.decisions.map(row => row.classification), ['purchase', 'future_installment']);
    assert.equal(result.decisions.every(row => !row.write_eligible), true);
});

test('9D.1b pairs bank debit and credit-card payment as one bill payment', () => {
    const result = classifyOpenFinanceLifecycle({ secret, items: [item({ accounts: [account('bank', 'BANK'), account('card', 'CREDIT')], transactions: [
        tx('bank-leg', 'bank', -50000, 'Pagamento fatura cartao'),
        tx('card-leg', 'card', -50000, 'Pagamento recebido')
    ] })] });
    assert.equal(result.decisions.every(row => row.classification === 'bill_payment'), true);
    assert.equal(result.decisions[0].pair_ref, result.decisions[1].pair_ref);
});

test('9D.1b pairs opposite known bank legs as transfer', () => {
    const result = classifyOpenFinanceLifecycle({ secret, items: [item({ accounts: [account('a', 'BANK'), account('b', 'BANK')], transactions: [
        tx('out', 'a', -10000, 'Pix enviado'), tx('in', 'b', 10000, 'Pix recebido')
    ] })] });
    assert.equal(result.decisions.every(row => row.classification === 'transfer'), true);
    assert.equal(result.decisions[0].pair_ref, result.decisions[1].pair_ref);
});

test('9D.1b same amount and date alone never pairs unrelated operations', () => {
    const result = classifyOpenFinanceLifecycle({ secret, items: [item({ accounts: [account('bank', 'BANK'), account('card', 'CREDIT')], transactions: [
        tx('bank-purchase', 'bank', -10000, 'Compra externa'), tx('card-purchase', 'card', 10000, 'Compra diferente')
    ] })] });
    assert.deepEqual(result.decisions.map(row => row.classification), ['purchase_candidate', 'purchase']);
    assert.equal(result.decisions.every(row => row.pair_ref === null), true);
});

test('9D.1b excludes investments and never treats them as transactions', () => {
    const result = classifyOpenFinanceLifecycle({ secret, items: [item({ accounts: [account('bank', 'BANK')], transactions: [], investments: [{ id: 'investment-private' }] })] });
    assert.equal(result.decisions.length, 0);
    assert.equal(result.investments_excluded, 1);
});

test('9D.1b public output contains no raw IDs, descriptions or values', () => {
    const result = classifyOpenFinanceLifecycle({ secret, items: [item({ accounts: [account('private-account', 'BANK')], transactions: [tx('private-tx', 'private-account', -12345, 'DESCRICAO PRIVADA')] })] });
    const serialized = JSON.stringify(result);
    for (const forbidden of ['private-account', 'private-tx', 'DESCRICAO PRIVADA', '12345']) assert.equal(serialized.includes(forbidden), false);
});
