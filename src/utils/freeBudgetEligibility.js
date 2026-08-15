const { normalizeText } = require('./helpers');
const { isRegisteredBillPayment } = require('./recurringBillMatcher');

const EXCLUDED_TERMS = [
    'transferencia',
    'transferencias',
    'divida',
    'dividas',
    'investimento',
    'investimentos',
    'reserva',
    'caixinha'
];

function isRecurringExpense(value) {
    return ['sim', 'mensal', 'recorrente', 'true'].includes(normalizeText(value || ''));
}

function hasExcludedFreeBudgetMeaning(expense = {}) {
    const text = normalizeText(`${expense.category || ''} ${expense.subcategory || ''} ${expense.description || ''}`);
    return EXCLUDED_TERMS.some(term => text.includes(term));
}

function isFreeBudgetExpense(expense = {}, accountRows = [], options = {}) {
    if (isRecurringExpense(expense.recurrence)) return false;
    if (hasExcludedFreeBudgetMeaning(expense)) return false;
    return !isRegisteredBillPayment(expense, accountRows, options);
}

module.exports = {
    isFreeBudgetExpense,
    __test__: {
        isRecurringExpense,
        hasExcludedFreeBudgetMeaning
    }
};
