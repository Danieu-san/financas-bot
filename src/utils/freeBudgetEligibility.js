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

const FLEXIBLE_CATEGORIES = new Set([
    'compras',
    'cuidados pessoais',
    'lazer',
    'presente',
    'presentes',
    'servicos pessoais',
    'vestuario'
]);

function isRecurringExpense(value) {
    return ['sim', 'mensal', 'recorrente', 'true'].includes(normalizeText(value || ''));
}

function hasExcludedFreeBudgetMeaning(expense = {}) {
    const text = normalizeText(`${expense.category || ''} ${expense.subcategory || ''} ${expense.description || ''}`);
    return EXCLUDED_TERMS.some(term => text.includes(term));
}

function isMonthlyGroceryExpense(expense = {}) {
    const category = normalizeText(expense.category || '');
    const subcategory = normalizeText(expense.subcategory || '');
    const description = normalizeText(expense.description || '');
    if (['mercado', 'supermercado'].includes(category)) return true;
    if (category !== 'alimentacao') return false;
    const grocerySignal = /\b(mercado|supermercado|guanabara|assai|sacolao|hortifruti|hortfruti)\b/;
    if (grocerySignal.test(subcategory)) return true;
    return (!subcategory || subcategory === 'cartao de credito') && grocerySignal.test(description);
}

function hasFlexibleFreeBudgetMeaning(expense = {}) {
    const category = normalizeText(expense.category || '');
    const subcategory = normalizeText(expense.subcategory || '');
    const description = normalizeText(expense.description || '');
    if (FLEXIBLE_CATEGORIES.has(category)) return true;
    if (['restaurante', 'delivery', 'lanche'].includes(category)) return true;
    if (category !== 'alimentacao') return false;
    const flexibleFoodSignal = /\b(restaurante|delivery|ifood|lanche|lanchonete|padaria|pastel|cafe)\b/;
    if (flexibleFoodSignal.test(subcategory)) return true;
    return (!subcategory || subcategory === 'cartao de credito') &&
        flexibleFoodSignal.test(description);
}

function isCategoryBudgetExpense(expense = {}, accountRows = [], options = {}) {
    if (isRecurringExpense(expense.recurrence)) return false;
    if (hasExcludedFreeBudgetMeaning(expense)) return false;
    return !isRegisteredBillPayment(expense, accountRows, options);
}

function isFreeBudgetExpense(expense = {}, accountRows = [], options = {}) {
    if (!isCategoryBudgetExpense(expense, accountRows, options)) return false;
    if (isMonthlyGroceryExpense(expense)) return false;
    return hasFlexibleFreeBudgetMeaning(expense);
}

module.exports = {
    isCategoryBudgetExpense,
    isFreeBudgetExpense,
    __test__: {
        isRecurringExpense,
        hasExcludedFreeBudgetMeaning,
        isMonthlyGroceryExpense,
        hasFlexibleFreeBudgetMeaning
    }
};
