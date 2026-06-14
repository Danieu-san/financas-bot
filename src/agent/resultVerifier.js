const { parseValue } = require('../utils/helpers');

const INTERNAL_PATTERN = /\b(user_id|sheet_id|spreadsheet|token|secret|oauth|prompt|raw rows?|owner_hash|agent-[a-z0-9_-]+)\b/i;
const NUMERIC_RESULT_KEYS = new Set([
    'amount',
    'value',
    'total',
    'part',
    'denominator',
    'balance',
    'current',
    'previous',
    'difference',
    'percent',
    'entradas',
    'saidas',
    'cartoes',
    'saldo',
    'reservaAplicada',
    'reservaResgatada',
    'reservaLiquida',
    'saldoDisponivelEstimado',
    'disponivel',
    'expected',
    'remaining',
    'cycleSpent',
    'cycleRemaining',
    'monthlyAmount',
    'todaySpent',
    'remainingInCycle',
    'remainingToday',
    'dailyRecommended',
    'dailyRecommendedAmount'
]);

function collectAllowedAmounts(toolResult = {}) {
    const values = [];
    const collect = (value) => {
        const number = Number(value);
        if (Number.isFinite(number)) values.push(Math.round((number + Number.EPSILON) * 100) / 100);
    };
    (toolResult.rows || []).forEach((row) => {
        collect(row.amount);
        collect(row.total);
        collect(row.value);
    });
    Object.values(toolResult.metrics || {}).forEach(collect);
    const visit = (value, key = '', depth = 0) => {
        if (depth > 8 || value === null || value === undefined) return;
        if (typeof value === 'number') {
            if (NUMERIC_RESULT_KEYS.has(key)) collect(value);
            return;
        }
        if (Array.isArray(value)) {
            value.slice(0, 100).forEach(item => visit(item, key, depth + 1));
            return;
        }
        if (typeof value === 'object') {
            Object.entries(value).forEach(([childKey, childValue]) => visit(childValue, childKey, depth + 1));
        }
    };
    visit(toolResult);
    return values;
}

function extractCurrencyAmounts(answer) {
    const text = String(answer || '');
    const matches = text.match(/(?:R\$\s*)?\d{1,3}(?:\.\d{3})*(?:,\d{2})|\b\d+(?:,\d{2})\b/g) || [];
    return matches
        .filter(match => /R\$|,/.test(match))
        .map(match => Math.round((parseValue(match) + Number.EPSILON) * 100) / 100)
        .filter(Number.isFinite);
}

function verifyAgentAnswer(answer, { toolResult } = {}) {
    const text = String(answer || '');
    if (!text.trim()) return { ok: false, reason: 'empty_answer' };
    if (INTERNAL_PATTERN.test(text)) return { ok: false, reason: 'internal_data_leak' };

    const mentionedAmounts = extractCurrencyAmounts(text);
    if (mentionedAmounts.length === 0) return { ok: true };

    const allowedAmounts = collectAllowedAmounts(toolResult);
    const hasInvalidAmount = mentionedAmounts.some(amount =>
        !allowedAmounts.some(allowed => Math.abs(allowed - amount) < 0.01)
    );
    if (hasInvalidAmount) return { ok: false, reason: 'invented_amount' };

    return { ok: true };
}

module.exports = {
    verifyAgentAnswer,
    __test__: {
        extractCurrencyAmounts,
        collectAllowedAmounts
    }
};
