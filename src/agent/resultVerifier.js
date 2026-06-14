const { parseValue } = require('../utils/helpers');

const INTERNAL_PATTERN = /\b(user_id|sheet_id|spreadsheet|token|secret|oauth|prompt|raw rows?|owner_hash|agent-[a-z0-9_-]+)\b/i;

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
