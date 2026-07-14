const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');

const {
    buildFilteredFinancialExport,
    selectPublicFinancialRows
} = require('../src/services/financialExportService');

const sheets = {
    'Saídas': [
        ['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Responsável', 'Pagamento', 'Recorrente', 'Observações', 'user_id', 'Conta Financeira'],
        ['01/07/2026', 'Uber', 'Transporte', 'Aplicativo', 20, 'Daniel', 'PIX', 'Não', '', 'u1', 'Nubank'],
        ['02/06/2026', 'Mercado', 'Alimentação', 'Mercado', 100, 'Daniel', 'PIX', 'Não', '', 'u1', 'Nubank'],
        ['03/07/2026', 'Outro usuário', 'Transporte', '', 30, 'Pessoa', 'PIX', 'Não', '', 'u2', 'Nubank']
    ],
    'Entradas': [
        ['Data', 'Descrição', 'Categoria', 'Valor', 'Responsável', 'Recebimento', 'Recorrente', 'Observações', 'user_id', 'Conta Financeira'],
        ['05/07/2026', 'Salário', 'Salário', 2000, 'Daniel', 'PIX', 'Sim', '', 'u1', 'Nubank']
    ],
    'Lançamentos Cartão': [
        ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'card_id', 'Cartão', 'Observações', 'user_id'],
        ['08/07/2026', '=HYPERLINK("x")', 'Transporte', 40, '1/1', 'Julho de 2026', 'internal-card-id', 'Nubank Roxo', '', 'u1']
    ]
};

test('6B export filters exact user rows by period account category and source', () => {
    const rows = selectPublicFinancialRows({
        sheetDataByName: sheets,
        userId: 'u1',
        filters: { month: 7, year: 2026, category: 'Transporte', source: 'expenses' }
    });
    assert.strictEqual(rows.length, 1);
    assert.deepStrictEqual(rows[0], {
        Data: '01/07/2026',
        Tipo: 'Saída',
        Descrição: 'Uber',
        Categoria: 'Transporte',
        Subcategoria: 'Aplicativo',
        Valor: 20,
        Conta: 'Nubank',
        Origem: 'Saídas'
    });
    assert.strictEqual(selectPublicFinancialRows({
        sheetDataByName: sheets,
        userId: 'u1',
        filters: { account: 'Nubank Roxo', source: 'cards' }
    }).length, 1);
});

test('6B XLSX export contains only public columns and neutralizes spreadsheet formulas', () => {
    const exported = buildFilteredFinancialExport({
        sheetDataByName: sheets,
        userId: 'u1',
        filters: { month: 7, year: 2026 }
    });
    assert.strictEqual(exported.rowCount, 3);
    assert.match(exported.filename, /^financas-2026-07\.xlsx$/);
    const workbook = XLSX.read(exported.buffer, { type: 'buffer' });
    assert.deepStrictEqual(workbook.SheetNames, ['Exportacao']);
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Exportacao, { defval: '' });
    assert.deepStrictEqual(Object.keys(rows[0]), [
        'Data', 'Tipo', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Conta', 'Origem'
    ]);
    assert.ok(rows.every(row => !JSON.stringify(row).includes('u1') && !JSON.stringify(row).includes('internal-card-id')));
    assert.strictEqual(rows.find(row => row.Origem === 'Cartão').Descrição, "'=HYPERLINK(\"x\")");
});

test('6B export fails closed on missing user, invalid filters, empty result and row overflow', () => {
    assert.throws(() => selectPublicFinancialRows({ sheetDataByName: sheets, filters: {} }), /EXPORT_USER_REQUIRED/);
    assert.throws(() => selectPublicFinancialRows({
        sheetDataByName: sheets, userId: 'u1', filters: { month: 13, year: 2026 }
    }), /EXPORT_FILTER_INVALID/);
    assert.throws(() => buildFilteredFinancialExport({
        sheetDataByName: sheets, userId: 'u1', filters: { category: 'Inexistente' }
    }), /EXPORT_EMPTY/);
    assert.throws(() => buildFilteredFinancialExport({
        sheetDataByName: sheets, userId: 'u1', filters: {}, maxRows: 2
    }), /EXPORT_LIMIT_EXCEEDED/);
});
