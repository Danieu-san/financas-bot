const test = require('node:test');
const assert = require('node:assert');

const {
    buildImportPreviewMessage,
    detectImportFileType,
    parseCsvTransactions,
    parseImportMedia,
    parseOfxTransactions,
    unsupportedImportMessage
} = require('../src/services/statementImportService');

function mediaFromText(text, { filename = 'extrato.csv', mimetype = 'text/csv' } = {}) {
    return {
        filename,
        mimetype,
        data: Buffer.from(text, 'utf8').toString('base64')
    };
}

test('statement import parses CSV expenses and income into proposed transactions', () => {
    const csv = [
        'Data;Descrição;Valor;Tipo',
        '17/05/2026;Mercado Guanabara;-35,35;Débito',
        '18/05/2026;Salário;2000,00;Crédito'
    ].join('\n');

    const transactions = parseCsvTransactions(csv);

    assert.strictEqual(transactions.length, 2);
    assert.deepStrictEqual(transactions[0], {
        type: 'Saídas',
        data: '17/05/2026',
        descricao: 'Mercado Guanabara',
        categoria: 'Alimentação',
        subcategoria: 'SUPERMERCADO',
        valor: 35.35,
        pagamento: 'Débito',
        recorrente: 'Não',
        observacoes: 'Importado de arquivo'
    });
    assert.strictEqual(transactions[1].type, 'Entradas');
    assert.strictEqual(transactions[1].categoria, 'Salário');
    assert.strictEqual(transactions[1].valor, 2000);
});

test('statement import parses OFX statement transactions', () => {
    const ofx = [
        '<OFX><BANKTRANLIST>',
        '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260517120000<TRNAMT>-12.50<MEMO>ONIBUS',
        '<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260518120000<TRNAMT>150.00<NAME>REEMBOLSO',
        '</BANKTRANLIST></OFX>'
    ].join('\n');

    const transactions = parseOfxTransactions(ofx);

    assert.strictEqual(transactions.length, 2);
    assert.strictEqual(transactions[0].type, 'Saídas');
    assert.strictEqual(transactions[0].data, '17/05/2026');
    assert.strictEqual(transactions[0].categoria, 'Transporte');
    assert.strictEqual(transactions[1].type, 'Entradas');
    assert.strictEqual(transactions[1].categoria, 'Reembolso');
});

test('statement import rejects PDF and image files with clear MVP message', () => {
    assert.deepStrictEqual(
        detectImportFileType({ filename: 'extrato.pdf', mimetype: 'application/pdf' }),
        { supported: false, type: 'pdf', reason: 'unsupported_binary' }
    );
    assert.match(unsupportedImportMessage('unsupported_binary'), /CSV ou OFX/);
});

test('statement import builds preview and parseImportMedia result', () => {
    const media = mediaFromText('Data,Descricao,Valor\n17/05/2026,Uber,-23.40');
    const result = parseImportMedia(media);

    assert.strictEqual(result.supported, true);
    assert.strictEqual(result.type, 'csv');
    assert.strictEqual(result.transactions.length, 1);
    assert.match(result.preview, /Encontrei 1 lançamento/);
    assert.match(buildImportPreviewMessage(result.transactions), /Uber/);
});
