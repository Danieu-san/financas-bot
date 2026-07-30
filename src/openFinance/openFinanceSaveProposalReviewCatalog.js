const { readDataFromSheet } = require('../services/google');
const { getActiveUsers } = require('../services/userService');
const { getFinancialScopeUserIds } = require('../services/oauthTokenStore');

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function stableId(prefix, ...parts) {
    return [
        prefix,
        ...parts.map(part => normalizeText(part).replace(/[^a-z0-9]+/g, '-'))
    ].filter(Boolean).join(':').slice(0, 128);
}

function addCategory(target, seen, category, subcategory = '') {
    const safeCategory = String(category || '').trim();
    const safeSubcategory = String(subcategory || '').trim();
    if (!safeCategory) return;
    const key = `${normalizeText(safeCategory)}|${normalizeText(safeSubcategory)}`;
    if (seen.has(key)) return;
    seen.add(key);
    target.push({
        id: stableId('category', safeCategory, safeSubcategory),
        label: safeSubcategory ? `${safeCategory} / ${safeSubcategory}` : safeCategory,
        category: safeCategory,
        subcategory: safeSubcategory
    });
}

function categoriesFromRows({ registryRows = [], expenseRows = [], cardRows = [],
    scopeUserIds = [] } = {}) {
    const allowed = new Set(scopeUserIds.map(String));
    const categories = [];
    const seen = new Set();
    const registry = Array.isArray(registryRows) ? registryRows.slice(1) : [];
    for (const row of registry) {
        const rowUserId = String(row?.[4] || '').trim();
        const active = normalizeText(row?.[2] ?? 'sim');
        if (!allowed.has(rowUserId)) continue;
        if (['nao', 'n', 'false', '0', 'inativa', 'inativo'].includes(active)) continue;
        addCategory(categories, seen, row?.[0], row?.[1]);
    }
    for (const row of Array.isArray(expenseRows) ? expenseRows.slice(1) : []) {
        const rowUserId = String(row?.[9] || '').trim();
        if (!allowed.has(rowUserId)) continue;
        addCategory(categories, seen, row?.[2], row?.[3]);
    }
    for (const row of Array.isArray(cardRows) ? cardRows.slice(1) : []) {
        const rowUserId = String(row?.[9] || '').trim();
        if (!allowed.has(rowUserId)) continue;
        addCategory(categories, seen, row?.[2], '');
    }
    return categories
        .sort((left, right) => left.label.localeCompare(right.label, 'pt-BR'))
        .slice(0, 100);
}

function accountsFromRows(rows = [], scopeUserIds = []) {
    const allowed = new Set(scopeUserIds.map(String));
    const seen = new Set();
    return (Array.isArray(rows) ? rows.slice(1) : [])
        .map((row) => {
            const name = String(row?.[0] || '').trim();
            const status = normalizeText(row?.[4] || 'active');
            const owner = String(row?.[6] || '').trim();
            const rowUserId = String(row?.[7] || '').trim();
            if (!name || !allowed.has(rowUserId) ||
                !['active', 'ativo', 'ativa', 'sim'].includes(status)) return null;
            const id = stableId('account', rowUserId || owner, name);
            if (seen.has(id)) return null;
            seen.add(id);
            return {
                id,
                label: owner ? `${name} · ${owner}` : name,
                ownerUserId: rowUserId
            };
        })
        .filter(Boolean)
        .slice(0, 50);
}

function cardsFromRows(rows = []) {
    const seen = new Set();
    return (Array.isArray(rows) ? rows.slice(1) : [])
        .map((row) => {
            const rawId = String(row?.[0] || '').trim();
            const name = String(row?.[1] || rawId).trim();
            const closingDay = Number.parseInt(row?.[3], 10);
            const active = normalizeText(row?.[5] || 'sim');
            if (!name || ['nao', 'n', 'false', '0', 'inativo', 'inativa'].includes(active)) {
                return null;
            }
            const id = stableId('card', rawId || name);
            if (seen.has(id)) return null;
            seen.add(id);
            return {
                id,
                label: name,
                cardId: rawId || name,
                closingDay: Number.isInteger(closingDay) &&
                    closingDay >= 1 && closingDay <= 31
                    ? closingDay
                    : 1
            };
        })
        .filter(Boolean)
        .slice(0, 50);
}

async function buildOpenFinanceSaveProposalReviewCatalog({
    userId,
    dependencies = {}
} = {}) {
    const safeUserId = String(userId || '').trim();
    if (!safeUserId) throw new Error('open_finance_save_review_user_required');
    const resolveScope = dependencies.getFinancialScopeUserIds ||
        getFinancialScopeUserIds;
    const loadUsers = dependencies.getActiveUsers || getActiveUsers;
    const readSheet = dependencies.readDataFromSheet || readDataFromSheet;
    const scopeUserIds = resolveScope(safeUserId).map(String).filter(Boolean);
    if (!scopeUserIds.length) {
        throw new Error('open_finance_save_review_scope_unavailable');
    }
    try {
        const [users, registryRows, expenseRows, cardLaunchRows, accountRows, cardRows] =
            await Promise.all([
                loadUsers(),
                readSheet('Categorias!A:E', {
                    userId: safeUserId,
                    requireUserScoped: true,
                    suppressMissingSheetError: true
                }),
                readSheet('Saídas!A:K', {
                    userId: safeUserId,
                    requireUserScoped: true,
                    suppressMissingSheetError: true
                }),
                readSheet('Lançamentos Cartão!A:J', {
                    userId: safeUserId,
                    requireUserScoped: true,
                    suppressMissingSheetError: true
                }),
                readSheet('Contas Financeiras!A:I', {
                    userId: safeUserId,
                    requireUserScoped: true,
                    suppressMissingSheetError: true
                }),
                readSheet('Cartões!A:G', {
                    userId: safeUserId,
                    requireUserScoped: true,
                    suppressMissingSheetError: true
                })
            ]);
        const allowed = new Set(scopeUserIds);
        const people = (Array.isArray(users) ? users : [])
            .filter(user => allowed.has(String(user?.user_id || '')))
            .map(user => ({
                id: String(user.user_id),
                label: String(user.display_name || '').trim()
            }))
            .filter(item => item.id && item.label);
        if (!people.length) {
            throw new Error('open_finance_save_review_people_unavailable');
        }
        return {
            people,
            categories: categoriesFromRows({
                registryRows,
                expenseRows,
                cardRows: cardLaunchRows,
                scopeUserIds
            }),
            paymentMethods: [
                { id: 'credit', label: 'Crédito', value: 'Crédito' },
                { id: 'debit', label: 'Débito', value: 'Débito' },
                { id: 'pix', label: 'PIX', value: 'PIX' },
                { id: 'cash', label: 'Dinheiro', value: 'Dinheiro' }
            ],
            financialAccounts: accountsFromRows(accountRows, scopeUserIds),
            cards: cardsFromRows(cardRows),
            financial_writes: 0
        };
    } catch (error) {
        if (String(error?.message || '').startsWith('open_finance_save_review_')) {
            throw error;
        }
        throw new Error('open_finance_save_review_catalog_unavailable');
    }
}

module.exports = {
    buildOpenFinanceSaveProposalReviewCatalog,
    __test__: {
        categoriesFromRows,
        accountsFromRows,
        cardsFromRows
    }
};
