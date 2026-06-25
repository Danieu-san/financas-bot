const { normalizeText, parseValue } = require('./helpers');
const { matchesAnyField } = require('./textMatcher');

function findHeaderIndex(headers, aliases, fallbackIndex) {
    if (!Array.isArray(headers)) return fallbackIndex;
    const normalizedAliases = aliases.map(alias => normalizeText(alias));
    const found = headers.findIndex(header => normalizedAliases.includes(normalizeText(header)));
    return found >= 0 ? found : fallbackIndex;
}

function normalizeRecurringBillRow(row = [], headers = []) {
    const idx = {
        name: findHeaderIndex(headers, ['Nome da Conta', 'Nome'], 0),
        dueDay: findHeaderIndex(headers, ['Dia do Vencimento', 'Vencimento', 'Dia'], 1),
        notes: findHeaderIndex(headers, ['Observações', 'Observacoes', 'Obs'], 2),
        userId: findHeaderIndex(headers, ['user_id', 'user id'], 3),
        friendlyName: findHeaderIndex(headers, ['Nome Amigável', 'Nome Amigavel'], 4),
        category: findHeaderIndex(headers, ['Categoria'], 5),
        subcategory: findHeaderIndex(headers, ['Subcategoria'], 6),
        expected: findHeaderIndex(headers, ['Valor Esperado', 'Valor'], 7),
        ruleActive: findHeaderIndex(headers, ['Regra Ativa'], 8)
    };
    return {
        description: row[idx.friendlyName] || row[idx.name] || '',
        accountName: row[idx.name] || '',
        category: row[idx.category] || '',
        subcategory: row[idx.subcategory] || '',
        expectedValue: parseValue(row[idx.expected]),
        dueDay: row[idx.dueDay] || '',
        notes: row[idx.notes] || '',
        ruleActive: row[idx.ruleActive] || '',
        userId: row[idx.userId] || ''
    };
}

function recurringBillRowsToBills(accountRows = []) {
    if (!Array.isArray(accountRows)) return [];
    const headers = accountRows[0] || [];
    return accountRows
        .slice(1)
        .map(row => normalizeRecurringBillRow(row, headers))
        .filter(item => item.description || item.accountName || item.category || item.subcategory);
}

function recurringBillPaymentScore(bill = {}, expense = {}, { allowFamilyPayment = false } = {}) {
    const sameOwner = String(bill.userId || '') === String(expense.userId || '');
    if (!sameOwner && !allowFamilyPayment) return 0;

    const billText = normalizeText(`${bill.description || ''} ${bill.accountName || ''}`);
    const expenseText = normalizeText(expense.description || '');
    const directTextMatch = Boolean(
        billText.length >= 3 &&
        expenseText.length >= 3 &&
        (billText.includes(expenseText) || expenseText.includes(billText))
    );
    const fuzzyTextMatch = expenseText.length >= 3 && matchesAnyField(
        [bill.description, bill.accountName],
        expense.description,
        { minWordLength: 3, wordThreshold: 0.66, phraseThreshold: 0.72 }
    );
    const sameSubcategory = Boolean(bill.subcategory) &&
        normalizeText(bill.subcategory) === normalizeText(expense.subcategory);
    const sameCategory = Boolean(bill.category) &&
        normalizeText(bill.category) === normalizeText(expense.category);
    const expectedValue = Number(bill.expectedValue || 0);
    const expenseValue = Number(expense.value || 0);
    const amountTolerance = Math.max(5, expectedValue * 0.25);
    const compatibleAmount = expectedValue > 0 && Math.abs(expectedValue - expenseValue) <= amountTolerance;
    if (!directTextMatch && !fuzzyTextMatch && !(sameCategory && sameSubcategory && compatibleAmount)) return 0;

    let score = 0;
    if (directTextMatch) score += 6;
    else if (fuzzyTextMatch) score += 4;
    if (sameSubcategory) score += 2;
    if (sameCategory) score += 1;
    if (compatibleAmount) score += 2;
    if (sameOwner) score += 1;
    return score;
}

function isRegisteredBillPayment(expense = {}, accountRows = [], { userIds = [], allowFamilyPayment = false, minScore = 4 } = {}) {
    const allowedUserIds = new Set((Array.isArray(userIds) ? userIds : [userIds])
        .map(id => String(id || '').trim())
        .filter(Boolean));
    return recurringBillRowsToBills(accountRows)
        .filter(bill => allowedUserIds.size === 0 || allowedUserIds.has(String(bill.userId || '').trim()))
        .some(bill => recurringBillPaymentScore(bill, expense, { allowFamilyPayment }) >= minScore);
}

module.exports = {
    normalizeRecurringBillRow,
    recurringBillRowsToBills,
    recurringBillPaymentScore,
    isRegisteredBillPayment
};
