const { recordLegacyUsageEvent } = require('./legacyUsageTelemetry');

function normalizeSheetName(value) {
    return String(value || '')
        .split('!')[0]
        .trim()
        .replace(/^'|'$/g, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function classifyCardSheetRoute(value) {
    const normalized = normalizeSheetName(value);
    if (normalized === 'lancamentos cartao') return 'card_sheet_unified_route';
    if (normalized.startsWith('cartao ')) return 'card_sheet_legacy_route';
    return '';
}

async function recordCardSheetInvocation(input = {}, options = {}) {
    const reasonCode = classifyCardSheetRoute(input.range || input.sheetName);
    if (!reasonCode) return { recorded: false, reason: 'not_card_sheet' };
    const operation = input.operation === 'write' ? 'write' : 'read';
    return recordLegacyUsageEvent({
        event: 'usage',
        surface: 'cards',
        consumer: 'sheets_runtime',
        handler: 'google_sheets',
        route: 'card_sheet_access',
        domain: 'cards',
        operation,
        source: 'sheets',
        mode: 'shadow',
        result: 'partial',
        reasonCode,
        writeAttempted: operation === 'write',
        writeResult: 'not_attempted',
        actorId: input.actorId,
        sessionId: input.sessionId
    }, options);
}

module.exports = {
    classifyCardSheetRoute,
    recordCardSheetInvocation
};
