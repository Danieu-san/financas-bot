const test = require('node:test');
const assert = require('node:assert');

const {
    annotateImportDuplicates,
    buildImportPreviewMessage,
    buildImportPreviewMessages,
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

test('statement import preview includes every imported row instead of abbreviating', () => {
    const csvRows = ['Data;Descrição;Valor;Tipo'];
    for (let index = 1; index <= 27; index += 1) {
        csvRows.push(`17/05/2026;Compra ${index};-${index},00;Débito`);
    }

    const transactions = parseCsvTransactions(csvRows.join('\n'));
    const preview = buildImportPreviewMessage(transactions);

    assert.strictEqual(transactions.length, 27);
    assert.match(preview, /27\. \[Saída\]/);
    assert.doesNotMatch(preview, /mais 10 lançamento/);
});

test('statement import can split complete previews into multiple WhatsApp-sized messages', () => {
    const transactions = parseCsvTransactions([
        'Data;Descrição;Valor;Tipo',
        ...Array.from({ length: 12 }, (_, index) => `17/05/2026;Compra longa ${index + 1} com texto para dividir;-${index + 1},00;Débito`)
    ].join('\n'));

    const messages = buildImportPreviewMessages(transactions, { maxMessageLength: 450 });

    assert.ok(messages.length > 1);
    assert.match(messages[0], /Parte 1\//);
    assert.match(messages.at(-1), /Responda `sim`/);
    assert.ok(messages.join('\n').includes('12. [Saída]'));
});

test('statement import detects probable internal transfers using the user full name', () => {
    const csv = [
        'Data;Descrição;Valor;Tipo',
        '17/05/2026;PIX ENVIADO DANIEL FERREIRA DOS SANTOS;-1000,00;Débito',
        '17/05/2026;PIX MERCADO BOM PRECO;-50,00;Débito',
        '18/05/2026;TRANSFERENCIA MESMA TITULARIDADE;500,00;Crédito'
    ].join('\n');

    const transactions = parseCsvTransactions(csv, {
        ownerAliases: ['Daniel Ferreira dos Santos', 'Daniel']
    });

    assert.strictEqual(transactions[0].type, 'Transferências');
    assert.strictEqual(transactions[0].status, 'Provável transferência interna');
    assert.strictEqual(transactions[1].type, 'Saídas');
    assert.strictEqual(transactions[2].type, 'Transferências');

    const preview = buildImportPreviewMessage(transactions);
    assert.match(preview, /Transferências internas prováveis no arquivo: 2/);
});

test('statement import marks duplicates already in the sheet or repeated in the file', () => {
    const csv = [
        'Data;Descrição;Valor;Tipo',
        '17/05/2026;Mercado Guanabara;-35,35;Débito',
        '18/05/2026;Uber;-20,00;Débito',
        '18/05/2026;Uber;-20,00;Débito'
    ].join('\n');
    const transactions = parseCsvTransactions(csv);
    const annotated = annotateImportDuplicates(transactions, {
        'Saídas': [
            ['17/05/2026', 'Mercado Guanabara', 'Alimentação', 'SUPERMERCADO', '35,35']
        ]
    });

    assert.strictEqual(annotated[0].duplicate, true);
    assert.strictEqual(annotated[0].duplicateReason, 'já existe na planilha');
    assert.strictEqual(annotated[1].duplicate, undefined);
    assert.strictEqual(annotated[2].duplicate, true);
    assert.strictEqual(annotated[2].duplicateReason, 'repetido no arquivo');

    const preview = buildImportPreviewMessage(annotated);
    assert.match(preview, /Possíveis duplicados: 2/);
    assert.match(preview, /será ignorado/);
});
