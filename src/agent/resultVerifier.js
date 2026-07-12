const { normalizeText, parseValue } = require('../utils/helpers');

const INTERNAL_PATTERN = /\b(user_id|sheet_id|spreadsheet|token|secret|oauth|prompt|raw rows?|owner_hash|agent-[a-z0-9_-]+)\b/i;
const MONTH_INDEX = new Map([
    'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
].map((month, index) => [month, index]));
const NUMERIC_RESULT_KEYS = new Set([
    'amount',
    'value',
    'total',
    'average',
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
    'expectedValue',
    'realizedValue',
    'pendingValue',
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

function roundNumber(value) {
    const number = Number(value);
    return Number.isFinite(number)
        ? Math.round((number + Number.EPSILON) * 100) / 100
        : null;
}

function visitResult(value, visitor, key = '', depth = 0) {
    if (depth > 8 || value === null || value === undefined) return;
    visitor(value, key);
    if (Array.isArray(value)) {
        value.slice(0, 100).forEach(item => visitResult(item, visitor, key, depth + 1));
        return;
    }
    if (typeof value === 'object') {
        Object.entries(value).forEach(([childKey, childValue]) => visitResult(childValue, visitor, childKey, depth + 1));
    }
}

function collectAllowedPercentages(toolResult = {}) {
    const values = [];
    visitResult(toolResult, (value, key) => {
        if (!/(?:percent|percentage|progresspercent)$/i.test(key)) return;
        const rounded = roundNumber(value);
        if (rounded !== null) values.push(rounded);
    });
    return values;
}

function collectPercentageRelations(toolResult = {}) {
    const relations = [];
    visitResult(toolResult, (value) => {
        if (!value || Array.isArray(value) || typeof value !== 'object') return;
        const percent = roundNumber(value.percent);
        const part = roundNumber(value.part);
        const total = roundNumber(value.total);
        if (percent !== null && part !== null && total !== null) {
            relations.push({ percent, numerator: part, denominator: total, part, total });
            return;
        }
        const difference = roundNumber(value.difference);
        const previous = roundNumber(value.previous);
        if (percent !== null && difference !== null && previous !== null) {
            relations.push({ percent, numerator: difference, denominator: previous });
        }
    });
    return relations;
}

function collectAllowedCounts(toolResult = {}) {
    const values = [];
    visitResult(toolResult, (value, key) => {
        if (!/^(?:count|rowCount)$/i.test(key)) return;
        const number = Number(value);
        if (Number.isInteger(number) && number >= 0) values.push(number);
    });
    if (toolResult?.tool === 'query_financial_plan' && toolResult?.plan?.operation === 'count') {
        const value = Number(toolResult?.result?.value);
        if (Number.isInteger(value) && value >= 0) values.push(value);
    }
    return values;
}

function extractPercentages(answer) {
    const matches = String(answer || '').match(/-?\d+(?:[.,]\d+)?\s*%/g) || [];
    return matches
        .map(match => roundNumber(parseValue(match.replace('%', '').trim())))
        .filter(value => value !== null);
}

function extractCountClaims(answer) {
    const text = String(answer || '');
    const values = [];
    const nounPattern = /\b(\d+)\s+(?:resultado(?:\(s\)|s)?|lan[cç]amento(?:\(s\)|s)?|ocorr[eê]ncia(?:\(s\)|s)?|itens?|item(?:\(ns\)|\(s\))?)\b/gi;
    let match;
    while ((match = nounPattern.exec(text)) !== null) values.push(Number(match[1]));
    const countPattern = /\bcontagem\b[^:\n]*:\s*(\d+)\b/gi;
    while ((match = countPattern.exec(text)) !== null) values.push(Number(match[1]));
    return values;
}

function extractAmountRelations(answer) {
    const amount = '(?:R\\$\\s*)?(\\d{1,3}(?:\\.\\d{3})*(?:,\\d{2})|\\d+(?:,\\d{2}))';
    const pattern = new RegExp(`${amount}\\s+de\\s+${amount}`, 'gi');
    const values = [];
    let match;
    while ((match = pattern.exec(String(answer || ''))) !== null) {
        values.push({
            part: roundNumber(parseValue(match[1])),
            total: roundNumber(parseValue(match[2]))
        });
    }
    return values;
}

function closeEnough(left, right, tolerance = 0.011) {
    return Math.abs(Number(left) - Number(right)) < tolerance;
}

function sortableDateKey(row = {}) {
    if (/^\d{4}-\d{2}-\d{2}/.test(String(row.iso_date || ''))) {
        return String(row.iso_date).slice(0, 10);
    }
    const match = String(row.date || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

function validateLatestContract(answer, toolResult = {}) {
    const sort = String(toolResult.criteria?.sort || '');
    if (toolResult.tool !== 'list_recent_transactions' || !sort.startsWith('iso_date desc')) {
        return { ok: true };
    }
    const rows = Array.isArray(toolResult.rows) ? toolResult.rows : [];
    for (let index = 1; index < rows.length; index += 1) {
        if (sortableDateKey(rows[index - 1]) < sortableDateKey(rows[index])) {
            return { ok: false, reason: 'invalid_tool_order' };
        }
        if (
            sort.includes('insertion_order') &&
            sortableDateKey(rows[index - 1]) === sortableDateKey(rows[index]) &&
            Number(rows[index - 1].insertion_order || 0) < Number(rows[index].insertion_order || 0)
        ) {
            return { ok: false, reason: 'invalid_tool_order' };
        }
    }
    if (rows.length > 1) {
        const normalizedListAnswer = normalizeText(String(answer || ''));
        let cursor = -1;
        for (const row of rows) {
            const description = normalizeText(String(row.description || '').trim());
            if (!description) continue;
            const index = normalizedListAnswer.indexOf(description, cursor + 1);
            if (index < 0) return { ok: false, reason: 'missing_recent_item' };
            if (index < cursor) return { ok: false, reason: 'wrong_recent_order' };
            cursor = index;
        }
    }
    const first = rows[0];
    if (!first) return { ok: true };
    const normalizedAnswer = normalizeText(String(answer || ''));
    const expectedFragments = [first.date, first.description, first.person]
        .map(value => normalizeText(String(value || '').trim()))
        .filter(Boolean);
    if (expectedFragments.some(fragment => !normalizedAnswer.includes(fragment))) {
        return { ok: false, reason: 'wrong_latest_item' };
    }
    return { ok: true };
}

function labelFromResultItem(item = {}) {
    return item.label || item.description || item.name || item.category || item.card || item.monthLabel || item.month || '';
}

function expectedOrderedLabels(toolResult = {}) {
    if (toolResult.tool !== 'query_financial_plan') return [];
    const operation = toolResult.plan?.operation;
    if (!['trend', 'rank', 'group'].includes(operation)) return [];
    const value = toolResult.result?.value;
    if (!Array.isArray(value)) return [];
    return value.slice(0, 10).map(labelFromResultItem).map(String).filter(Boolean);
}

function validateOrderedLabels(answer, toolResult = {}) {
    const labels = expectedOrderedLabels(toolResult);
    if (labels.length < 2) return { ok: true };
    const normalizedAnswer = normalizeText(String(answer || ''));
    let cursor = -1;
    for (const label of labels) {
        const index = normalizedAnswer.indexOf(normalizeText(label), cursor + 1);
        if (index < 0 || index < cursor) return { ok: false, reason: 'wrong_result_order' };
        cursor = index;
    }
    return { ok: true };
}

function validatePercentageContract(answer, toolResult = {}) {
    const relations = collectPercentageRelations(toolResult);
    for (const relation of relations) {
        const expected = relation.denominator === 0 ? 0 : roundNumber((relation.numerator / relation.denominator) * 100);
        if (!closeEnough(relation.percent, expected)) {
            return { ok: false, reason: 'invalid_percentage_relation' };
        }
    }
    const mentioned = extractPercentages(answer);
    if (mentioned.length === 0) return { ok: true };
    const allowed = collectAllowedPercentages(toolResult);
    if (mentioned.some(value => !allowed.some(candidate => closeEnough(value, candidate)))) {
        return { ok: false, reason: 'invented_percentage' };
    }
    if (toolResult?.plan?.operation === 'percentage') {
        const mentionedRelations = extractAmountRelations(answer);
        const componentRelations = relations.filter(relation => relation.part !== undefined && relation.total !== undefined);
        if (mentionedRelations.some(mentionedRelation =>
            !componentRelations.some(relation =>
                closeEnough(mentionedRelation.part, relation.part) &&
                closeEnough(mentionedRelation.total, relation.total)
            )
        )) {
            return { ok: false, reason: 'wrong_percentage_components' };
        }
    }
    return { ok: true };
}

function validateCountContract(answer, toolResult = {}) {
    const mentioned = extractCountClaims(answer);
    if (mentioned.length === 0) return { ok: true };
    const allowed = collectAllowedCounts(toolResult);
    if (mentioned.some(value => !allowed.includes(value))) {
        return { ok: false, reason: 'invented_count' };
    }
    return { ok: true };
}

function collectExpectedMonthlyPeriods(toolResult = {}) {
    const periods = new Set();
    visitResult(toolResult, (value) => {
        if (!value || Array.isArray(value) || typeof value !== 'object') return;
        const month = Number(value.month);
        const year = Number(value.year);
        if (Number.isInteger(month) && month >= 0 && month <= 11 && Number.isInteger(year)) {
            periods.add(`${year}-${month}`);
        }
    });
    return periods;
}

function extractMonthlyPeriodClaims(answer = '') {
    const normalized = normalizeText(answer);
    const pattern = /\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(20\d{2})\b/g;
    const claims = [];
    let match;
    while ((match = pattern.exec(normalized)) !== null) {
        claims.push(`${Number(match[2])}-${MONTH_INDEX.get(match[1])}`);
    }
    return claims;
}

function validatePeriodLabelContract(answer, toolResult = {}) {
    if (toolResult?.plan?.operation === 'compare' || toolResult?.plan?.operation === 'trend') {
        return { ok: true };
    }
    const expected = collectExpectedMonthlyPeriods(toolResult);
    const claims = extractMonthlyPeriodClaims(answer);
    if (expected.size === 0 || claims.length === 0) return { ok: true };
    if (claims.some(claim => !expected.has(claim))) {
        return { ok: false, reason: 'period_label_mismatch' };
    }
    return { ok: true };
}

function extractCurrencyAmounts(answer) {
    const text = String(answer || '');
    const matches = text.match(/-?\s*(?:R\$\s*)?-?\d{1,3}(?:\.\d{3})*(?:,\d{2})|-?\s*\b\d+(?:,\d{2})\b/g) || [];
    return matches
        .filter(match => /R\$|,/.test(match))
        .map((match) => {
            const normalized = String(match || '');
            const isNegative = /^-\s*/.test(normalized) || /R\$\s*-/.test(normalized);
            const amount = parseValue(normalized.replace(/-/g, ''));
            return Math.round(((isNegative ? -amount : amount) + Number.EPSILON) * 100) / 100;
        })
        .filter(Number.isFinite);
}

function comparable(value) {
    return normalizeText(String(value || '').trim());
}

function validateFinancialQueryTrajectory(plan = {}, toolResult = {}) {
    const expected = plan?.args?.plan || {};
    const actual = toolResult?.plan || {};
    if (!expected || Object.keys(expected).length === 0) return { ok: false, reason: 'missing_query_plan' };
    if (!actual || Object.keys(actual).length === 0) return { ok: false, reason: 'missing_executed_query_plan' };
    for (const field of ['domain', 'operation', 'timeBasis']) {
        if (expected[field] && comparable(expected[field]) !== comparable(actual[field])) {
            return { ok: false, reason: `query_plan_${field}_mismatch` };
        }
    }
    return { ok: true };
}

function validateAgentTrajectory({ message, plan, toolResult } = {}) {
    if (message !== undefined && !String(message || '').trim()) {
        return { ok: false, reason: 'empty_question' };
    }
    const action = String(plan?.action || '').trim();
    if (!action) return { ok: false, reason: 'missing_plan_action' };
    if (action === 'tool') {
        const tool = String(plan?.tool || '').trim();
        if (!tool) return { ok: false, reason: 'missing_planned_tool' };
        if (!toolResult) return { ok: false, reason: 'missing_tool_result' };
        if (String(toolResult.tool || '').trim() !== tool) return { ok: false, reason: 'tool_mismatch' };
        if (toolResult.ok !== true) return { ok: false, reason: `tool_unavailable:${toolResult.reason || 'unknown'}` };
        if (tool === 'query_financial_plan') {
            return validateFinancialQueryTrajectory(plan, toolResult);
        }
        return { ok: true };
    }
    if (action === 'clarify' || action === 'block') {
        return toolResult ? { ok: false, reason: 'unexpected_tool_result' } : { ok: true };
    }
    return { ok: false, reason: 'invalid_plan_action' };
}

function publicResultLabels(toolResult = {}) {
    const labels = [];
    const collect = (item = {}) => {
        const value = labelFromResultItem(item);
        if (value) labels.push(String(value));
    };
    (toolResult.rows || []).slice(0, 10).forEach(collect);
    const value = toolResult?.result?.value;
    if (Array.isArray(value)) value.slice(0, 10).forEach(collect);
    return labels;
}

function validateAnswerCoverage(answer, toolResult = {}) {
    const text = String(answer || '');
    if (
        extractCurrencyAmounts(text).length > 0 ||
        extractPercentages(text).length > 0 ||
        extractCountClaims(text).length > 0
    ) {
        return { ok: true };
    }
    const labels = publicResultLabels(toolResult);
    if (labels.length === 0) return { ok: true };
    const normalizedAnswer = normalizeText(text);
    if (!labels.some(label => normalizedAnswer.includes(normalizeText(label)))) {
        return { ok: false, reason: 'missing_result_reference' };
    }
    return { ok: true };
}

function verifyAgentAnswer(answer, { toolResult } = {}) {
    const text = String(answer || '');
    const safeToolResult = toolResult || {};
    if (!text.trim()) return { ok: false, reason: 'empty_answer' };
    if (INTERNAL_PATTERN.test(text)) return { ok: false, reason: 'internal_data_leak' };

    for (const validation of [
        validatePercentageContract(text, safeToolResult),
        validateCountContract(text, safeToolResult),
        validatePeriodLabelContract(text, safeToolResult),
        validateLatestContract(text, safeToolResult),
        validateOrderedLabels(text, safeToolResult),
        validateAnswerCoverage(text, safeToolResult)
    ]) {
        if (!validation.ok) return validation;
    }

    const mentionedAmounts = extractCurrencyAmounts(text);
    if (mentionedAmounts.length === 0) return { ok: true };

    const allowedAmounts = collectAllowedAmounts(safeToolResult);
    const hasInvalidAmount = mentionedAmounts.some(amount =>
        !allowedAmounts.some(allowed => Math.abs(allowed - amount) < 0.01)
    );
    if (hasInvalidAmount) return { ok: false, reason: 'invented_amount' };

    return { ok: true };
}

function verifyAgentResult({ message, plan, toolResult, answer } = {}) {
    const trajectory = validateAgentTrajectory({ message, plan, toolResult });
    if (!trajectory.ok) return trajectory;
    return verifyAgentAnswer(answer, { toolResult });
}

module.exports = {
    verifyAgentAnswer,
    verifyAgentResult,
    __test__: {
        extractCurrencyAmounts,
        collectAllowedAmounts,
        collectAllowedPercentages,
        collectAllowedCounts,
        extractPercentages,
        extractCountClaims,
        extractAmountRelations,
        extractMonthlyPeriodClaims,
        collectExpectedMonthlyPeriods,
        validatePeriodLabelContract,
        expectedOrderedLabels,
        validateAgentTrajectory,
        validateAnswerCoverage
    }
};
