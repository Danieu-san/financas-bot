const crypto = require('node:crypto');
const { normalizeText, parseSheetDate } = require('../utils/helpers');
const { __test__: readModelMappers } = require('../services/readModelService');

function normalizeDate(value) {
    const parsed = parseSheetDate(value);
    if (!parsed || Number.isNaN(parsed.getTime())) return '';
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function normalizedCardName(value) {
    return normalizeText(String(value || '')).replace(/\s+/g, ' ').trim();
}

function entryFingerprint(entry) {
    const normalized = [
        String(entry.user_id || '').trim(),
        normalizeDate(entry.data),
        normalizeText(String(entry.descricao || '')).replace(/\s+/g, ' ').trim(),
        normalizeText(String(entry.categoria || '')).replace(/\s+/g, ' ').trim(),
        String(Math.round(Number(entry.valor || 0) * 100)),
        normalizeText(String(entry.parcela || '')).replace(/\s+/g, '').trim(),
        String(entry.month ?? ''),
        String(entry.year ?? ''),
        normalizedCardName(entry.cartao)
    ].join('\u001f');
    return crypto.createHash('sha256').update(normalized).digest('hex');
}

function buildCounts(entries = []) {
    const counts = new Map();
    for (const entry of entries) {
        const fingerprint = entryFingerprint(entry);
        counts.set(fingerprint, (counts.get(fingerprint) || 0) + 1);
    }
    return counts;
}

function compareEntries(left = [], right = []) {
    const leftCounts = buildCounts(left);
    const rightCounts = buildCounts(right);
    let matched = 0;
    let missingInUnified = 0;
    let onlyInUnified = 0;
    const allKeys = new Set([...leftCounts.keys(), ...rightCounts.keys()]);
    for (const key of allKeys) {
        const legacyCount = leftCounts.get(key) || 0;
        const unifiedCount = rightCounts.get(key) || 0;
        matched += Math.min(legacyCount, unifiedCount);
        missingInUnified += Math.max(legacyCount - unifiedCount, 0);
        onlyInUnified += Math.max(unifiedCount - legacyCount, 0);
    }
    return { matched, missing_in_unified: missingInUnified, only_in_unified: onlyInUnified };
}

function buildCardSheetParityReport({ unifiedRows = [], legacySheets = [] } = {}) {
    const unifiedEntries = readModelMappers.mapUnifiedCardRows(unifiedRows);
    const configuredNames = new Set(legacySheets.map(item => normalizedCardName(item.sheetName)));
    const slots = legacySheets.map((item, index) => {
        const legacyEntries = readModelMappers.mapLegacyCardRows(item.rows || [], item.sheetName || '');
        const matchingUnified = unifiedEntries.filter(entry => (
            normalizedCardName(entry.cartao) === normalizedCardName(item.sheetName)
        ));
        const comparison = compareEntries(legacyEntries, matchingUnified);
        return {
            slot: `card_slot_${index + 1}`,
            legacy_rows: legacyEntries.length,
            unified_rows: matchingUnified.length,
            ...comparison,
            invalid_legacy_rows: Math.max((item.rows || []).length - 1 - legacyEntries.length, 0)
        };
    });
    const unmappedUnifiedRows = unifiedEntries.filter(entry => (
        !configuredNames.has(normalizedCardName(entry.cartao))
    )).length;
    const invalidUnifiedRows = Math.max(unifiedRows.length - 1 - unifiedEntries.length, 0);
    const totals = slots.reduce((acc, slot) => {
        acc.legacy_rows += slot.legacy_rows;
        acc.unified_rows += slot.unified_rows;
        acc.matched += slot.matched;
        acc.missing_in_unified += slot.missing_in_unified;
        acc.only_in_unified += slot.only_in_unified;
        acc.invalid_legacy_rows += slot.invalid_legacy_rows;
        return acc;
    }, {
        legacy_rows: 0,
        unified_rows: 0,
        matched: 0,
        missing_in_unified: 0,
        only_in_unified: 0,
        invalid_legacy_rows: 0,
        unmapped_unified_rows: unmappedUnifiedRows,
        invalid_unified_rows: invalidUnifiedRows
    });
    const populated = totals.legacy_rows + totals.unified_rows > 0;
    const exact = populated
        && totals.missing_in_unified === 0
        && totals.only_in_unified === 0
        && totals.invalid_legacy_rows === 0
        && totals.unmapped_unified_rows === 0
        && totals.invalid_unified_rows === 0;
    return {
        schema_version: 1,
        verdict: !populated ? 'EMPTY_SAMPLE' : exact ? 'PARITY' : 'GAP_DOCUMENTED',
        mode: 'read_only',
        slots,
        totals,
        writes: 0,
        removal_candidate: false
    };
}

function assessPersonalLegacyProjection(mapValuesFromUserSpreadsheetRange) {
    const fixture = [
        ['Data', 'Descrição', 'Categoria', 'Valor', 'Parcela', 'Mês', 'card_id', 'Cartão', 'Status', 'user_id'],
        ['01/07/2026', 'fixture-a', 'Casa', 1, '1/1', 'Julho de 2026', 'card-a', 'Cartão A', '', 'fixture-user'],
        ['02/07/2026', 'fixture-b', 'Casa', 2, '1/1', 'Julho de 2026', 'card-b', 'Cartão B', '', 'fixture-user']
    ];
    const projected = mapValuesFromUserSpreadsheetRange('Cartão A!A:G', fixture);
    const body = Array.isArray(projected) ? projected.slice(1) : [];
    const header = Array.isArray(projected?.[0]) ? projected[0].map(value => normalizedCardName(value)) : [];
    const filtersRequestedCard = body.length === 1;
    const preservesCardIdentity = header.includes('card_id') || header.includes('cartao');
    return {
        filters_requested_card: filtersRequestedCard,
        preserves_card_identity: preservesCardIdentity,
        migration_safe: filtersRequestedCard && preservesCardIdentity
    };
}

function summarizePersonalUnifiedScopes(scopes = []) {
    let scopesWithRows = 0;
    let unifiedRows = 0;
    let invalidUnifiedRows = 0;
    for (const rows of scopes) {
        const mapped = readModelMappers.mapUnifiedCardRows(rows || []);
        if (mapped.length > 0) scopesWithRows += 1;
        unifiedRows += mapped.length;
        invalidUnifiedRows += Math.max((rows || []).length - 1 - mapped.length, 0);
    }
    return {
        available_scopes: scopes.length,
        scopes_with_rows: scopesWithRows,
        unified_rows: unifiedRows,
        invalid_unified_rows: invalidUnifiedRows
    };
}

function buildCardMigrationAssessment({ central, personal, projection, sourceErrors = 0 } = {}) {
    const hasAnySample = Number(central?.totals?.legacy_rows || 0)
        + Number(central?.totals?.unified_rows || 0)
        + Number(personal?.unified_rows || 0) > 0;
    const verdict = sourceErrors > 0
        ? 'NO_GO_SOURCE_UNAVAILABLE'
        : projection && !projection.migration_safe
            ? 'GAP_DOCUMENTED'
            : !hasAnySample
                ? 'EMPTY_SAMPLE'
                : projection?.migration_safe && central?.verdict !== 'GAP_DOCUMENTED'
                ? 'READY_FOR_CANARY_PLANNING'
                : 'GAP_DOCUMENTED';
    return {
        schema_version: 1,
        verdict,
        mode: 'read_only',
        central,
        personal: { ...personal, source_errors: sourceErrors },
        compatibility_projection: projection,
        writes: 0,
        removal_candidate: false
    };
}

module.exports = {
    buildCardSheetParityReport,
    assessPersonalLegacyProjection,
    summarizePersonalUnifiedScopes,
    buildCardMigrationAssessment,
    __test__: { compareEntries, entryFingerprint }
};
