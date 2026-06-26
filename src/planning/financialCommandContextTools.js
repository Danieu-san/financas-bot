const { recurringBillRowsToBills, recurringBillPaymentScore } = require('../utils/recurringBillMatcher');
const { normalizeText, parseValue } = require('../utils/helpers');

const DEFAULT_CANDIDATE_LIMIT = 3;
const MATCH_RECURRING_BILL_TOOL = 'match_recurring_bill';

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
        'pela', 'pelo', 'com', 'uma', 'meu', 'minha', 'dia'
    ]);
    return normalizeText(value)
        .split(/[^a-z0-9]+/i)
        .map(term => term.trim())
        .filter(term => term.length >= 4 && !stopWords.has(term) && !/^\d+$/.test(term));
}

function hasSpecificBillTextMatch(bill = {}, request = {}) {
    const queryTerms = significantTerms(request.query);
    if (queryTerms.length === 0) return false;
    const billText = normalizeText(`${bill.description || ''} ${bill.accountName || ''}`);
    return queryTerms.some(term => billText.includes(term));
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
        .map(bill => ({
            bill,
            score: recurringBillPaymentScore(bill, expense, { allowFamilyPayment })
        }))
        .filter(item => item.score >= minScore && (
            hasSpecificBillTextMatch(item.bill, normalizedRequest) ||
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
    matchRecurringBill,
    __test__: {
        normalizeContextToolRequest,
        valuesAreCompatible,
        significantTerms,
        hasSpecificBillTextMatch
    }
};
