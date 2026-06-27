const { recurringBillRowsToBills, recurringBillPaymentScore } = require('../utils/recurringBillMatcher');
const { normalizeText, parseValue } = require('../utils/helpers');

const DEFAULT_CANDIDATE_LIMIT = 3;
const MATCH_RECURRING_BILL_TOOL = 'match_recurring_bill';
const MATCH_DEBT_TOOL = 'match_debt';
const MATCH_CARD_INVOICE_TOOL = 'match_card_invoice';
const RESOLVE_CATEGORY_TOOL = 'resolve_category';
const LIST_USER_ACCOUNTS_TOOL = 'list_user_accounts';

function toTrustedUserIds(trustedScope = {}) {
    const raw = Array.isArray(trustedScope.userIds)
        ? trustedScope.userIds
        : [trustedScope.userId];
    return raw
        .map(item => String(item || '').trim())
        .filter(Boolean);
}

function sanitizeLabel(value, fallback = 'Conta recorrente') {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return (text || fallback).slice(0, 120);
}

function valuesAreCompatible(expectedValue, actualValue) {
    const expected = Number(expectedValue || 0);
    const actual = Number(actualValue || 0);
    if (!Number.isFinite(expected) || !Number.isFinite(actual) || expected <= 0 || actual <= 0) {
        return false;
    }
    const tolerance = Math.max(5, expected * 0.25);
    return Math.abs(expected - actual) <= tolerance;
}

function significantTerms(value) {
    const stopWords = new Set([
        'paguei', 'pagando', 'pagar', 'pago', 'quitei', 'quitando',
        'conta', 'boleto', 'fatura', 'valor', 'reais', 'real', 'pix',
        'dinheiro', 'debito', 'credito', 'cartao', 'cartão', 'para',
        'pela', 'pelo', 'com', 'uma', 'meu', 'minha', 'dia', 'divida',
        'da', 'de', 'do', 'das', 'dos', 'na', 'no', 'nas', 'nos',
        'em', 'via', 'foi', 'ja', 'ao', 'aos', 'que'
    ]);
    return normalizeText(value)
        .split(/[^a-z0-9]+/i)
        .map(term => term.trim())
        .filter(term => term.length >= 2 && !stopWords.has(term) && !/^\d+$/.test(term));
}

function hasSpecificBillTextMatch(bill = {}, request = {}) {
    const queryTerms = significantTerms(request.query);
    if (queryTerms.length === 0) return false;
    const billText = normalizeText(`${bill.description || ''} ${bill.accountName || ''}`);
    const billTerms = new Set(billText.split(/[^a-z0-9]+/i).filter(Boolean));
    return queryTerms.some(term => term.length >= 4 ? billText.includes(term) : billTerms.has(term));
}

function hasShortExactBillTextMatch(bill = {}, request = {}) {
    const shortTerms = significantTerms(request.query).filter(term => term.length < 4);
    if (shortTerms.length === 0) return false;
    const billTerms = new Set(
        normalizeText(`${bill.description || ''} ${bill.accountName || ''}`)
            .split(/[^a-z0-9]+/i)
            .filter(Boolean)
    );
    return shortTerms.some(term => billTerms.has(term));
}

function hasCategoryAmountMatch(bill = {}, request = {}) {
    const sameCategory = Boolean(request.category && bill.category) &&
        normalizeText(request.category) === normalizeText(bill.category);
    const sameSubcategory = Boolean(request.subcategory && bill.subcategory) &&
        normalizeText(request.subcategory) === normalizeText(bill.subcategory);
    return sameCategory && sameSubcategory && valuesAreCompatible(bill.expectedValue, request.amount);
}

function normalizeContextToolRequest(request = {}) {
    const query = sanitizeLabel(request.query || request.description || '');
    const amount = parseValue(request.amount);
    return {
        query,
        amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
        category: sanitizeLabel(request.category || '', ''),
        subcategory: sanitizeLabel(request.subcategory || '', '')
    };
}

function publicBillCandidate(bill = {}, request = {}) {
    return {
        label: sanitizeLabel(bill.description || bill.accountName),
        category: sanitizeLabel(bill.category || '', ''),
        subcategory: sanitizeLabel(bill.subcategory || '', ''),
        expectedAmount: Number(bill.expectedValue || 0),
        dueDay: sanitizeLabel(bill.dueDay || '', ''),
        amountCompatible: valuesAreCompatible(bill.expectedValue, request.amount)
    };
}

function findHeaderIndex(headers, aliases, fallbackIndex) {
    if (!Array.isArray(headers)) return fallbackIndex;
    const normalizedAliases = aliases.map(alias => normalizeText(alias));
    const found = headers.findIndex(header => normalizedAliases.includes(normalizeText(header)));
    return found >= 0 ? found : fallbackIndex;
}

function normalizeDebtRow(row = [], headers = []) {
    const idx = {
        name: findHeaderIndex(headers, ['Nome', 'Nome da Dívida', 'Nome da Divida'], 0),
        creditor: findHeaderIndex(headers, ['Credor'], 1),
        type: findHeaderIndex(headers, ['Tipo'], 2),
        original: findHeaderIndex(headers, ['Valor Original'], 3),
        balance: findHeaderIndex(headers, ['Saldo Atual'], 4),
        installment: findHeaderIndex(headers, ['Parcela', 'Valor da Parcela'], 5),
        dueDay: findHeaderIndex(headers, ['Vencimento', 'Dia do Vencimento'], 7),
        status: findHeaderIndex(headers, ['Status'], 10),
        userId: findHeaderIndex(headers, ['user_id', 'user id'], 17)
    };
    return {
        label: row[idx.name] || '',
        creditor: row[idx.creditor] || '',
        type: row[idx.type] || '',
        originalAmount: parseValue(row[idx.original]),
        balanceAmount: parseValue(row[idx.balance]),
        installmentAmount: parseValue(row[idx.installment]),
        dueDay: row[idx.dueDay] || '',
        status: row[idx.status] || '',
        userId: row[idx.userId] || ''
    };
}

function debtRowsToDebts(debtRows = []) {
    if (!Array.isArray(debtRows) || debtRows.length === 0) return [];
    const headers = debtRows[0] || [];
    return debtRows
        .slice(1)
        .map(row => normalizeDebtRow(row, headers))
        .filter(debt => debt.label || debt.creditor || debt.type);
}

function debtIsActive(debt = {}) {
    const status = normalizeText(debt.status || '');
    if (Number(debt.balanceAmount || 0) <= 0) return false;
    return !/(quitad|pago|concluid|finalizad|cancelad|inativ)/.test(status);
}

function debtMatchScore(debt = {}, request = {}) {
    const terms = significantTerms(request.query);
    if (terms.length === 0) return 0;
    const debtText = normalizeText(`${debt.label || ''} ${debt.creditor || ''} ${debt.type || ''}`);
    const matchedTerms = terms.filter(term => debtText.includes(term));
    if (matchedTerms.length === 0) return 0;

    let score = matchedTerms.length * 3;
    if (request.amount > 0 && request.amount <= Number(debt.balanceAmount || 0) + 0.005) score += 2;
    if (valuesAreCompatible(debt.installmentAmount, request.amount)) score += 2;
    return score;
}

function publicDebtCandidate(debt = {}, request = {}) {
    return {
        label: sanitizeLabel(debt.label, 'Dívida'),
        creditor: sanitizeLabel(debt.creditor || '', ''),
        type: sanitizeLabel(debt.type || '', ''),
        balanceAmount: Number(debt.balanceAmount || 0),
        installmentAmount: Number(debt.installmentAmount || 0),
        dueDay: sanitizeLabel(debt.dueDay || '', ''),
        status: sanitizeLabel(debt.status || '', ''),
        amountWithinBalance: request.amount > 0 && request.amount <= Number(debt.balanceAmount || 0) + 0.005
    };
}

function matchDebt({
    request = {},
    debtRows = [],
    trustedScope = {},
    limit = DEFAULT_CANDIDATE_LIMIT,
    minScore = 3
} = {}) {
    const trustedUserIds = toTrustedUserIds(trustedScope);
    if (trustedUserIds.length === 0) {
        return {
            ok: false,
            tool: MATCH_DEBT_TOOL,
            classification: 'scope_required',
            candidates: [],
            errors: ['trusted_scope_required']
        };
    }

    const allowedUserIds = new Set(trustedUserIds);
    const normalizedRequest = normalizeContextToolRequest(request);
    const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || DEFAULT_CANDIDATE_LIMIT, 5));
    const candidates = debtRowsToDebts(debtRows)
        .filter(debt => allowedUserIds.has(String(debt.userId || '').trim()))
        .filter(debtIsActive)
        .map(debt => ({ debt, score: debtMatchScore(debt, normalizedRequest) }))
        .filter(item => item.score >= minScore)
        .sort((left, right) => right.score - left.score || normalizeText(left.debt.label || '').localeCompare(normalizeText(right.debt.label || '')))
        .slice(0, safeLimit)
        .map(item => publicDebtCandidate(item.debt, normalizedRequest));

    return {
        ok: true,
        tool: MATCH_DEBT_TOOL,
        classification: candidates.length === 0
            ? 'no_match'
            : candidates.length === 1
                ? 'single_match'
                : 'multiple_matches',
        candidates
    };
}
function roundMoney(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function normalizeCardLaunchRow(row = [], headers = []) {
    const idx = {
        value: findHeaderIndex(headers, ['Valor Parcela', 'Valor'], 3),
        billingMonth: findHeaderIndex(headers, ['Mês de Cobrança', 'Mes de Cobranca', 'Fatura'], 5),
        cardId: findHeaderIndex(headers, ['card_id', 'card id'], 6),
        card: findHeaderIndex(headers, ['Cartão', 'Cartao'], 7),
        userId: findHeaderIndex(headers, ['user_id', 'user id'], 9)
    };
    return {
        value: parseValue(row[idx.value]),
        billingMonth: row[idx.billingMonth] || '',
        cardId: row[idx.cardId] || '',
        card: row[idx.card] || row[idx.cardId] || '',
        userId: row[idx.userId] || ''
    };
}

function cardLaunchRowsToInvoices(cardLaunchRows = [], trustedUserIds = []) {
    if (!Array.isArray(cardLaunchRows) || cardLaunchRows.length === 0) return [];
    const allowedUserIds = new Set(trustedUserIds);
    const headers = cardLaunchRows[0] || [];
    const grouped = new Map();
    for (const row of cardLaunchRows.slice(1)) {
        const launch = normalizeCardLaunchRow(row, headers);
        if (!allowedUserIds.has(String(launch.userId || '').trim())) continue;
        if (!launch.card || !launch.billingMonth || Number(launch.value || 0) <= 0) continue;
        const key = `${normalizeText(launch.cardId || launch.card)}|${normalizeText(launch.card)}|${normalizeText(launch.billingMonth)}`;
        const current = grouped.get(key) || {
            card: launch.card,
            cardId: launch.cardId,
            billingMonth: launch.billingMonth,
            invoiceAmount: 0,
            installmentCount: 0
        };
        current.invoiceAmount = roundMoney(current.invoiceAmount + Number(launch.value || 0));
        current.installmentCount += 1;
        grouped.set(key, current);
    }
    return [...grouped.values()];
}

function invoiceMatchScore(invoice = {}, request = {}) {
    const terms = significantTerms(request.query);
    if (terms.length === 0) return 0;
    const invoiceText = normalizeText(`${invoice.card || ''} ${invoice.cardId || ''} ${invoice.billingMonth || ''}`);
    const matchedTerms = terms.filter(term => invoiceText.includes(term));
    if (matchedTerms.length === 0) return 0;

    let score = matchedTerms.length * 3;
    if (valuesAreCompatible(invoice.invoiceAmount, request.amount)) score += 4;
    return score;
}

function publicInvoiceCandidate(invoice = {}, request = {}) {
    return {
        label: sanitizeLabel(`${invoice.card || 'Cartão'} - ${invoice.billingMonth || 'Fatura'}`, 'Fatura'),
        card: sanitizeLabel(invoice.card || '', ''),
        billingMonth: sanitizeLabel(invoice.billingMonth || '', ''),
        invoiceAmount: Number(invoice.invoiceAmount || 0),
        installmentCount: Number(invoice.installmentCount || 0),
        amountCompatible: valuesAreCompatible(invoice.invoiceAmount, request.amount),
        status: 'open_or_expected'
    };
}

function matchCardInvoice({
    request = {},
    cardLaunchRows = [],
    trustedScope = {},
    limit = DEFAULT_CANDIDATE_LIMIT,
    minScore = 3
} = {}) {
    const trustedUserIds = toTrustedUserIds(trustedScope);
    if (trustedUserIds.length === 0) {
        return {
            ok: false,
            tool: MATCH_CARD_INVOICE_TOOL,
            classification: 'scope_required',
            candidates: [],
            errors: ['trusted_scope_required']
        };
    }

    const normalizedRequest = normalizeContextToolRequest(request);
    const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || DEFAULT_CANDIDATE_LIMIT, 5));
    const candidates = cardLaunchRowsToInvoices(cardLaunchRows, trustedUserIds)
        .map(invoice => ({ invoice, score: invoiceMatchScore(invoice, normalizedRequest) }))
        .filter(item => item.score >= minScore)
        .filter(item => normalizedRequest.amount <= 0 || valuesAreCompatible(item.invoice.invoiceAmount, normalizedRequest.amount))
        .sort((left, right) => right.score - left.score || normalizeText(left.invoice.card || '').localeCompare(normalizeText(right.invoice.card || '')))
        .slice(0, safeLimit)
        .map(item => publicInvoiceCandidate(item.invoice, normalizedRequest));

    return {
        ok: true,
        tool: MATCH_CARD_INVOICE_TOOL,
        classification: candidates.length === 0
            ? 'no_match'
            : candidates.length === 1
                ? 'single_match'
                : 'multiple_matches',
        candidates
    };
}
function normalizeCategoryCandidate(category = '', subcategory = '', source = 'history', matchText = '') {
    const safeCategory = sanitizeLabel(category || '', '');
    const safeSubcategory = sanitizeLabel(subcategory || '', '');
    if (!safeCategory && !safeSubcategory) return null;
    return {
        category: safeCategory || 'Outros',
        subcategory: safeSubcategory,
        source,
        matchText: sanitizeLabel(matchText || `${safeCategory} ${safeSubcategory}`, '')
    };
}

function addCategoryCandidate(target, candidate) {
    if (!candidate) return;
    const key = `${normalizeText(candidate.category)}|${normalizeText(candidate.subcategory)}|${candidate.source}`;
    if (!target.has(key)) target.set(key, candidate);
}

function collectCategoryCandidates({
    expenseRows = [],
    cardLaunchRows = [],
    accountRows = [],
    knownCategories = [],
    trustedUserIds = []
} = {}) {
    const allowedUserIds = new Set(trustedUserIds);
    const candidates = new Map();

    if (Array.isArray(expenseRows) && expenseRows.length > 0) {
        const headers = expenseRows[0] || [];
        const idx = {
            description: findHeaderIndex(headers, ['Descrição', 'Descricao'], 1),
            category: findHeaderIndex(headers, ['Categoria'], 2),
            subcategory: findHeaderIndex(headers, ['Subcategoria'], 3),
            userId: findHeaderIndex(headers, ['user_id', 'user id'], 9)
        };
        for (const row of expenseRows.slice(1)) {
            if (!allowedUserIds.has(String(row[idx.userId] || '').trim())) continue;
            addCategoryCandidate(candidates, normalizeCategoryCandidate(
                row[idx.category],
                row[idx.subcategory],
                'history',
                `${row[idx.description] || ''} ${row[idx.category] || ''} ${row[idx.subcategory] || ''}`
            ));
        }
    }

    if (Array.isArray(cardLaunchRows) && cardLaunchRows.length > 0) {
        const headers = cardLaunchRows[0] || [];
        const idx = {
            description: findHeaderIndex(headers, ['Descrição', 'Descricao'], 1),
            category: findHeaderIndex(headers, ['Categoria'], 2),
            userId: findHeaderIndex(headers, ['user_id', 'user id'], 9)
        };
        for (const row of cardLaunchRows.slice(1)) {
            if (!allowedUserIds.has(String(row[idx.userId] || '').trim())) continue;
            addCategoryCandidate(candidates, normalizeCategoryCandidate(
                row[idx.category],
                'Cartão de Crédito',
                'history',
                `${row[idx.description] || ''} ${row[idx.category] || ''}`
            ));
        }
    }

    for (const bill of recurringBillRowsToBills(accountRows)) {
        if (!allowedUserIds.has(String(bill.userId || '').trim())) continue;
        addCategoryCandidate(candidates, normalizeCategoryCandidate(
            bill.category,
            bill.subcategory,
            'recurring_bill',
            `${bill.description || ''} ${bill.accountName || ''} ${bill.category || ''} ${bill.subcategory || ''}`
        ));
    }

    for (const item of Array.isArray(knownCategories) ? knownCategories : []) {
        addCategoryCandidate(candidates, normalizeCategoryCandidate(
            item.category,
            item.subcategory,
            'known',
            `${item.category || ''} ${item.subcategory || ''}`
        ));
    }

    return [...candidates.values()];
}

function categoryMatchScore(candidate = {}, request = {}) {
    const terms = significantTerms(request.query);
    if (terms.length === 0) return 0;
    const text = normalizeText(`${candidate.matchText || ''} ${candidate.category || ''} ${candidate.subcategory || ''}`);
    const matchedTerms = terms.filter(term => text.includes(term));
    if (matchedTerms.length === 0) return 0;
    const sourceBonus = candidate.source === 'history' ? 2 : candidate.source === 'recurring_bill' ? 1 : 0;
    return matchedTerms.length * 3 + sourceBonus;
}

function publicCategoryCandidate(candidate = {}) {
    return {
        category: sanitizeLabel(candidate.category || 'Outros', 'Outros'),
        subcategory: sanitizeLabel(candidate.subcategory || '', ''),
        source: candidate.source === 'recurring_bill' ? 'recurring_bill' : candidate.source === 'known' ? 'known' : 'history'
    };
}

function resolveCategory({
    request = {},
    expenseRows = [],
    cardLaunchRows = [],
    accountRows = [],
    knownCategories = [],
    trustedScope = {},
    limit = DEFAULT_CANDIDATE_LIMIT,
    minScore = 3
} = {}) {
    const trustedUserIds = toTrustedUserIds(trustedScope);
    if (trustedUserIds.length === 0) {
        return {
            ok: false,
            tool: RESOLVE_CATEGORY_TOOL,
            classification: 'scope_required',
            candidates: [],
            errors: ['trusted_scope_required']
        };
    }

    const normalizedRequest = normalizeContextToolRequest(request);
    const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || DEFAULT_CANDIDATE_LIMIT, 5));
    const candidates = collectCategoryCandidates({
        expenseRows,
        cardLaunchRows,
        accountRows,
        knownCategories,
        trustedUserIds
    })
        .map(candidate => ({ candidate, score: categoryMatchScore(candidate, normalizedRequest) }))
        .filter(item => item.score >= minScore)
        .sort((left, right) => right.score - left.score || normalizeText(left.candidate.category || '').localeCompare(normalizeText(right.candidate.category || '')))
        .slice(0, safeLimit)
        .map(item => publicCategoryCandidate(item.candidate));

    return {
        ok: true,
        tool: RESOLVE_CATEGORY_TOOL,
        classification: candidates.length === 0
            ? 'no_match'
            : candidates.length === 1
                ? 'single_match'
                : 'multiple_matches',
        candidates
    };
}
function normalizeRole(role = '') {
    const normalized = normalizeText(role || '');
    if (['cash_source', 'origem', 'source'].includes(normalized)) return 'cash_source';
    if (['cash_destination', 'destino', 'destination'].includes(normalized)) return 'cash_destination';
    if (['credit_card', 'cartao', 'cartão', 'card'].includes(normalized)) return 'credit_card';
    return '';
}

function addAccountRole(accounts, label, role, extra = {}) {
    const safeLabel = sanitizeLabel(label || '', '');
    const safeRole = normalizeRole(role);
    if (!safeLabel || !safeRole) return;
    const key = normalizeText(safeLabel);
    const current = accounts.get(key) || { label: safeLabel, roles: [] };
    if (!current.roles.includes(safeRole)) current.roles.push(safeRole);
    if (extra.bank && !current.bank) current.bank = sanitizeLabel(extra.bank, '');
    accounts.set(key, current);
}

function collectUserAccounts({
    transferRows = [],
    cardConfigRows = [],
    knownAccounts = [],
    trustedUserIds = []
} = {}) {
    const allowedUserIds = new Set(trustedUserIds);
    const accounts = new Map();

    for (const item of Array.isArray(knownAccounts) ? knownAccounts : []) {
        const roles = Array.isArray(item.roles) ? item.roles : [item.role];
        for (const role of roles) addAccountRole(accounts, item.label, role, { bank: item.bank });
    }

    if (Array.isArray(transferRows) && transferRows.length > 0) {
        const headers = transferRows[0] || [];
        const idx = {
            origin: findHeaderIndex(headers, ['Conta Origem', 'Origem'], 3),
            destination: findHeaderIndex(headers, ['Conta Destino', 'Destino'], 4),
            userId: findHeaderIndex(headers, ['user_id', 'user id'], 8)
        };
        for (const row of transferRows.slice(1)) {
            if (!allowedUserIds.has(String(row[idx.userId] || '').trim())) continue;
            addAccountRole(accounts, row[idx.origin], 'cash_source');
            addAccountRole(accounts, row[idx.destination], 'cash_destination');
        }
    }

    if (Array.isArray(cardConfigRows) && cardConfigRows.length > 0) {
        const headers = cardConfigRows[0] || [];
        const idx = {
            name: findHeaderIndex(headers, ['Nome', 'Cartão', 'Cartao'], 1),
            bank: findHeaderIndex(headers, ['Banco'], 2),
            active: findHeaderIndex(headers, ['Ativo', 'Status'], 5)
        };
        for (const row of cardConfigRows.slice(1)) {
            const active = normalizeText(row[idx.active] || 'sim');
            if (['nao', 'não', 'n', 'false', 'inativo', 'cancelado'].includes(active)) continue;
            addAccountRole(accounts, row[idx.name], 'credit_card', { bank: row[idx.bank] });
        }
    }

    return [...accounts.values()]
        .map(account => ({
            ...account,
            roles: account.roles.sort()
        }))
        .sort((left, right) => normalizeText(left.label).localeCompare(normalizeText(right.label)));
}

function listUserAccounts({
    transferRows = [],
    cardConfigRows = [],
    knownAccounts = [],
    trustedScope = {}
} = {}) {
    const trustedUserIds = toTrustedUserIds(trustedScope);
    if (trustedUserIds.length === 0) {
        return {
            ok: false,
            tool: LIST_USER_ACCOUNTS_TOOL,
            classification: 'scope_required',
            accounts: [],
            errors: ['trusted_scope_required']
        };
    }

    const accounts = collectUserAccounts({
        transferRows,
        cardConfigRows,
        knownAccounts,
        trustedUserIds
    });

    return {
        ok: true,
        tool: LIST_USER_ACCOUNTS_TOOL,
        classification: accounts.length > 0 ? 'available' : 'no_accounts',
        accounts
    };
}
function matchRecurringBill({
    request = {},
    accountRows = [],
    trustedScope = {},
    limit = DEFAULT_CANDIDATE_LIMIT,
    minScore = 4
} = {}) {
    const trustedUserIds = toTrustedUserIds(trustedScope);
    if (trustedUserIds.length === 0) {
        return {
            ok: false,
            tool: MATCH_RECURRING_BILL_TOOL,
            classification: 'scope_required',
            candidates: [],
            errors: ['trusted_scope_required']
        };
    }

    const allowedUserIds = new Set(trustedUserIds);
    const normalizedRequest = normalizeContextToolRequest(request);
    const expense = {
        description: normalizedRequest.query,
        value: normalizedRequest.amount,
        category: normalizedRequest.category,
        subcategory: normalizedRequest.subcategory,
        userId: trustedUserIds[0]
    };
    const allowFamilyPayment = trustedUserIds.length > 1 || trustedScope.allowFamilyPayment === true;
    const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || DEFAULT_CANDIDATE_LIMIT, 5));

    const candidates = recurringBillRowsToBills(accountRows)
        .filter(bill => allowedUserIds.has(String(bill.userId || '').trim()))
        .map(bill => {
            const baseScore = recurringBillPaymentScore(bill, expense, { allowFamilyPayment });
            const shortExactTextMatch = hasShortExactBillTextMatch(bill, normalizedRequest);
            return {
                bill,
                score: shortExactTextMatch ? Math.max(baseScore, minScore) : baseScore,
                specificTextMatch: hasSpecificBillTextMatch(bill, normalizedRequest)
            };
        })
        .filter(item => item.score >= minScore && (
            item.specificTextMatch ||
            hasCategoryAmountMatch(item.bill, normalizedRequest)
        ))
        .sort((left, right) => right.score - left.score || normalizeText(left.bill.description || '').localeCompare(normalizeText(right.bill.description || '')))
        .slice(0, safeLimit)
        .map(item => publicBillCandidate(item.bill, normalizedRequest));

    return {
        ok: true,
        tool: MATCH_RECURRING_BILL_TOOL,
        classification: candidates.length === 0
            ? 'no_match'
            : candidates.length === 1
                ? 'single_match'
                : 'multiple_matches',
        candidates
    };
}

module.exports = {
    MATCH_RECURRING_BILL_TOOL,
    MATCH_DEBT_TOOL,
    MATCH_CARD_INVOICE_TOOL,
    RESOLVE_CATEGORY_TOOL,
    LIST_USER_ACCOUNTS_TOOL,
    matchRecurringBill,
    matchDebt,
    matchCardInvoice,
    resolveCategory,
    listUserAccounts,
    __test__: {
        normalizeContextToolRequest,
        valuesAreCompatible,
        significantTerms,
        hasSpecificBillTextMatch,
        normalizeDebtRow,
        debtRowsToDebts,
        debtIsActive,
        debtMatchScore,
        normalizeCardLaunchRow,
        cardLaunchRowsToInvoices,
        invoiceMatchScore,
        collectCategoryCandidates,
        categoryMatchScore,
        collectUserAccounts
    }
};
