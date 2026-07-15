const test = require('node:test');
const assert = require('node:assert');

const {
    buildCardSheetParityReport,
    assessPersonalLegacyProjection,
    summarizePersonalUnifiedScopes,
    buildCardMigrationAssessment
} = require('../src/cards/cardSheetParityReport');
const googleService = require('../src/services/google');

test('card sheet parity matches duplicate rows across legacy and unified schemas', () => {
    const legacyRows = [
        ['Data', 'Descrição', 'Categoria', 'Valor', 'Parcela', 'Mês', 'user_id'],
        ['01/07/2026', 'Compra privada', 'Casa', '1.234,56', '1/2', 'Julho de 2026', 'user-private'],
        ['01/07/2026', 'Compra privada', 'Casa', '1.234,56', '1/2', 'Julho de 2026', 'user-private']
    ];
    const unifiedRows = [
        ['Data', 'Descrição', 'Categoria', 'Valor', 'Parcela', 'Mês', 'card_id', 'Cartão', 'Status', 'user_id'],
        ['01/07/2026', 'Compra privada', 'Casa', 1234.56, '1/2', 'Julho de 2026', 'private-card', 'Cartão Banco Privado', '', 'user-private'],
        ['01/07/2026', 'Compra privada', 'Casa', 1234.56, '1/2', 'Julho de 2026', 'private-card', 'Cartão Banco Privado', '', 'user-private']
    ];
    const report = buildCardSheetParityReport({
        unifiedRows,
        legacySheets: [{ sheetName: 'Cartão Banco Privado', rows: legacyRows }]
    });
    assert.strictEqual(report.verdict, 'PARITY');
    assert.deepStrictEqual(report.totals, {
        legacy_rows: 2,
        unified_rows: 2,
        matched: 2,
        missing_in_unified: 0,
        only_in_unified: 0,
        invalid_legacy_rows: 0,
        unmapped_unified_rows: 0,
        invalid_unified_rows: 0
    });
    assert.strictEqual(report.writes, 0);
    assert.doesNotMatch(JSON.stringify(report), /Compra privada|Banco Privado|user-private|1234/);
});

test('card sheet parity documents gaps and unknown unified cards without exposing rows', () => {
    const report = buildCardSheetParityReport({
        unifiedRows: [
            ['Data', 'Descrição', 'Categoria', 'Valor', 'Parcela', 'Mês', 'card_id', 'Cartão', 'Status', 'user_id'],
            ['02/07/2026', 'Somente nova', 'Casa', 10, '1/1', 'Julho de 2026', 'new', 'Cartão Não Mapeado', '', 'user-private']
        ],
        legacySheets: [{
            sheetName: 'Cartão Banco Privado',
            rows: [
                ['Data', 'Descrição', 'Categoria', 'Valor', 'Parcela', 'Mês', 'user_id'],
                ['01/07/2026', 'Somente antiga', 'Casa', 20, '1/1', 'Julho de 2026', 'user-private']
            ]
        }]
    });
    assert.strictEqual(report.verdict, 'GAP_DOCUMENTED');
    assert.strictEqual(report.totals.missing_in_unified, 1);
    assert.strictEqual(report.totals.unmapped_unified_rows, 1);
    assert.strictEqual(report.removal_candidate, false);
    assert.doesNotMatch(JSON.stringify(report), /Somente|Banco Privado|Não Mapeado|user-private/);
});

test('card sheet parity rejects a vacuous empty sample', () => {
    const report = buildCardSheetParityReport({
        unifiedRows: [],
        legacySheets: [{ sheetName: 'Cartão A', rows: [] }]
    });
    assert.strictEqual(report.verdict, 'EMPTY_SAMPLE');
    assert.strictEqual(report.removal_candidate, false);
});

test('card migration assessment documents the personal legacy projection gap', () => {
    const projection = assessPersonalLegacyProjection(
        googleService.__test__.mapValuesFromUserSpreadsheetRange
    );
    assert.deepStrictEqual(projection, {
        filters_requested_card: false,
        preserves_card_identity: false,
        migration_safe: false
    });
    const personal = summarizePersonalUnifiedScopes([[
        ['Data', 'Descrição', 'Categoria', 'Valor', 'Parcela', 'Mês', 'card_id', 'Cartão', 'Status', 'user_id'],
        ['01/07/2026', 'Privado', 'Casa', 10, '1/1', 'Julho de 2026', 'card-a', 'Cartão A', '', 'private-user']
    ]]);
    const report = buildCardMigrationAssessment({
        central: buildCardSheetParityReport({ unifiedRows: [], legacySheets: [] }),
        personal,
        projection
    });
    assert.strictEqual(report.verdict, 'GAP_DOCUMENTED');
    assert.strictEqual(report.writes, 0);
    assert.doesNotMatch(JSON.stringify(report), /Privado|private-user|Cartão A/);
});

test('known compatibility gap takes precedence over an empty data sample', () => {
    const report = buildCardMigrationAssessment({
        central: buildCardSheetParityReport({ unifiedRows: [], legacySheets: [] }),
        personal: summarizePersonalUnifiedScopes([]),
        projection: {
            filters_requested_card: false,
            preserves_card_identity: false,
            migration_safe: false
        }
    });
    assert.strictEqual(report.verdict, 'GAP_DOCUMENTED');
    assert.strictEqual(report.removal_candidate, false);
});
