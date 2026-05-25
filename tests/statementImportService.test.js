const test = require('node:test');
const assert = require('node:assert');

const {
    annotateImportDuplicates,
    buildImportPreviewMessage,
    buildImportPreviewMessages,
    applyRecurringIncomeClassification,
    convertTransactionsForCreditCardStatement,
    detectRecurringBillCandidates,
    detectRecurringIncomeCandidates,
    detectImportFileType,
    parseCsvTransactions,
    parseImportMedia,
    parseOfxTransactions,
    parseRecurringIncomeClassificationReply,
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

test('statement import marks rows that do not have a recognizable date', () => {
    const csv = [
        'Descrição;Valor;Tipo',
        'Mercado Guanabara;-35,35;Débito'
    ].join('\n');

    const transactions = parseCsvTransactions(csv);

    assert.strictEqual(transactions.length, 1);
    assert.strictEqual(transactions[0].data, '');
    assert.strictEqual(transactions[0].needsDateInput, true);
    assert.match(buildImportPreviewMessage(transactions), /data pendente/i);
});

test('statement import finds the real header after bank metadata lines', () => {
    const csv = [
        'Extrato Conta Corrente',
        'Período;01/01/2026 a 31/01/2026',
        'Data Lançamento;Histórico;Valor (R$)',
        '2026-01-05;Compra Mercado;-35,35',
        '2026-01-06;Salário;2500,00'
    ].join('\n');

    const transactions = parseCsvTransactions(csv);

    assert.strictEqual(transactions.length, 2);
    assert.strictEqual(transactions[0].data, '05/01/2026');
    assert.strictEqual(transactions[0].descricao, 'Compra Mercado');
    assert.strictEqual(transactions[0].valor, 35.35);
    assert.strictEqual(transactions[1].type, 'Entradas');
    assert.strictEqual(transactions[1].data, '06/01/2026');
});

test('statement import parses bank CSVs with debit and credit in separate columns', () => {
    const csv = [
        'Data Movimento;Descrição;Débito;Crédito',
        '07/01/2026;Pix Mercado;35,35;',
        '08/01/2026;Recebimento;;120,00'
    ].join('\n');

    const transactions = parseCsvTransactions(csv);

    assert.strictEqual(transactions.length, 2);
    assert.strictEqual(transactions[0].type, 'Saídas');
    assert.strictEqual(transactions[0].valor, 35.35);
    assert.strictEqual(transactions[1].type, 'Entradas');
    assert.strictEqual(transactions[1].valor, 120);
});

test('statement import ignores bank balance marker rows', () => {
    const csv = [
        'data,lançamentos ,,valor,saldo',
        '20/05/2026,SALDO DO DIA,,,0.01',
        '20/05/2026,PIX TRANSF Daniel 20/05,,300,'
    ].join('\n');

    const transactions = parseCsvTransactions(csv);

    assert.strictEqual(transactions.length, 1);
    assert.strictEqual(transactions[0].descricao, 'PIX TRANSF Daniel 20/05');
});

test('statement import converts positive Nubank card CSV rows into card purchases', () => {
    const csv = [
        'date,title,amount',
        '2026-01-09,Okeo,9.00',
        '2026-01-08,Shopee*Platinum Indust,39.90'
    ].join('\n');

    const parsed = parseCsvTransactions(csv);
    const cardTransactions = convertTransactionsForCreditCardStatement(parsed);

    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(cardTransactions.length, 2);
    assert.strictEqual(cardTransactions[0].type, 'Cartão');
    assert.strictEqual(cardTransactions[0].data, '09/01/2026');
    assert.strictEqual(cardTransactions[0].descricao, 'Okeo');
    assert.strictEqual(cardTransactions[0].valor, 9);
});

test('statement import skips credit card payments and credits when importing card statements', () => {
    const csv = [
        'date,title,amount',
        '2026-01-09,Okeo,9.00',
        '2026-01-08,Pagamento recebido,-1075.57',
        '2026-01-07,Estorno compra,-35.00',
        '2026-01-06,Cashback Nubank,-2.50'
    ].join('\n');

    const parsed = parseCsvTransactions(csv);
    const cardTransactions = convertTransactionsForCreditCardStatement(parsed);

    assert.deepStrictEqual(cardTransactions.map(item => item.descricao), ['Okeo']);
    assert.strictEqual(cardTransactions[0].type, 'Cartão');
    assert.strictEqual(cardTransactions[0].valor, 9);
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

test('statement import rejects exact duplicate purchases across family users and cards', () => {
    const samePurchase = {
        type: 'Cartão',
        data: '17/05/2026',
        descricao: 'Uber - NuPay',
        valor: 2.95
    };
    const existingRowsByType = {
        'Lançamentos Cartão': [
            ['17/05/2026', 'Uber - NuPay', 'Transporte', 2.95, '1/1', 'Maio de 2026', 'nubank-thais', 'Cartão Nubank - Thais', '', 'user-thais']
        ]
    };

    const danielCard = annotateImportDuplicates([
        {
            ...samePurchase,
            userId: 'user-daniel',
            cardId: 'nubank-daniel',
            cartao: 'Cartão Nubank - Daniel'
        }
    ], existingRowsByType);
    assert.strictEqual(danielCard[0].duplicate, true);
    assert.strictEqual(danielCard[0].duplicateReason, 'já existe na planilha');

    const thaisDifferentCard = annotateImportDuplicates([
        {
            ...samePurchase,
            userId: 'user-thais',
            cardId: 'itau-thais',
            cartao: 'Cartão Itaú - Thais'
        }
    ], existingRowsByType);
    assert.strictEqual(thaisDifferentCard[0].duplicate, true);
    assert.strictEqual(thaisDifferentCard[0].duplicateReason, 'já existe na planilha');

    const thaisSameCard = annotateImportDuplicates([
        {
            ...samePurchase,
            userId: 'user-thais',
            cardId: 'nubank-thais',
            cartao: 'Cartão Nubank - Thais'
        }
    ], existingRowsByType);
    assert.strictEqual(thaisSameCard[0].duplicate, true);
    assert.strictEqual(thaisSameCard[0].duplicateReason, 'já existe na planilha');
});

test('statement import rejects exact checking-account duplicates across family users', () => {
    const csv = [
        'Data;Descrição;Valor;Tipo',
        '17/05/2026;Mercado Guanabara;-35,35;Débito'
    ].join('\n');
    const [transaction] = parseCsvTransactions(csv);
    const existingRowsByType = {
        'Saídas': [
            ['17/05/2026', 'Mercado Guanabara', 'Alimentação', 'SUPERMERCADO', '35,35', 'Thaís', 'Débito', 'Não', '', 'user-thais']
        ]
    };

    const danielImport = annotateImportDuplicates([{ ...transaction, userId: 'user-daniel' }], existingRowsByType);
    assert.strictEqual(danielImport[0].duplicate, true);
    assert.strictEqual(danielImport[0].duplicateReason, 'já existe na planilha');

    const thaisImport = annotateImportDuplicates([{ ...transaction, userId: 'user-thais' }], existingRowsByType);
    assert.strictEqual(thaisImport[0].duplicate, true);
    assert.strictEqual(thaisImport[0].duplicateReason, 'já existe na planilha');
});

test('statement import warns about possible duplicates by same type date and value without blocking import', () => {
    const csv = [
        'Data;Descrição;Valor;Tipo',
        '24/05/2026;LOJA ABC MATERIAL CONSTRUCAO;-27,80;Débito'
    ].join('\n');
    const [transaction] = parseCsvTransactions(csv);
    const existingRowsByType = {
        'Saídas': [
            ['24/05/2026', 'material para reforma da casa', 'Casa', 'Reforma', '27,80', 'Daniel', 'PIX', 'Não', '', 'user-daniel']
        ]
    };

    const annotated = annotateImportDuplicates([transaction], existingRowsByType);

    assert.strictEqual(annotated[0].duplicate, undefined);
    assert.strictEqual(annotated[0].possibleDuplicate, true);
    assert.match(annotated[0].possibleDuplicateReason, /material para reforma da casa/i);

    const preview = buildImportPreviewMessage(annotated);
    assert.match(preview, /Novos que serão importados: 1/);
    assert.match(preview, /Alertas de possível duplicidade: 1/);
    assert.match(preview, /será importado se você confirmar/);
});

test('statement import detects repeated incoming transfer and can classify it as salary', () => {
    const csv = [
        'Data;Descrição;Valor;Tipo',
        '04/03/2026;Transferência Recebida - DANIEL DOS SANTOS - BCO BRADESCO S.A.;7464,43;Crédito'
    ].join('\n');
    const transactions = parseCsvTransactions(csv, { ownerAliases: ['Daniel dos Santos', 'Daniel'] });
    const existingRowsByType = {
        'Transferências': [
            ['06/01/2026', 'Transferência Recebida - DANIEL DOS SANTOS - BCO BRADESCO S.A.', '7464,43', '', '', 'Importação', '', 'Provável transferência interna', 'user-daniel'],
            ['04/02/2026', 'Transferência Recebida - DANIEL DOS SANTOS - BCO BRADESCO S.A.', '7464,43', '', '', 'Importação', '', 'Provável transferência interna', 'user-daniel']
        ]
    };

    assert.strictEqual(transactions[0].type, 'Transferências');

    const [candidate] = detectRecurringIncomeCandidates(transactions, existingRowsByType);
    assert.ok(candidate);
    assert.match(candidate.description, /BRADESCO/);
    assert.strictEqual(candidate.monthCount, 3);

    const classified = applyRecurringIncomeClassification(transactions, candidate, 'salary');
    assert.strictEqual(classified[0].type, 'Entradas');
    assert.strictEqual(classified[0].categoria, 'Salário');
    assert.strictEqual(classified[0].recorrente, 'Sim');
    assert.match(classified[0].observacoes, /recorrente/i);

    assert.strictEqual(parseRecurringIncomeClassificationReply('1'), 'salary');
    assert.strictEqual(parseRecurringIncomeClassificationReply('renda extra'), 'extra_income');
});

test('statement import detects repeated expense as bill reminder candidate', () => {
    const csv = [
        'Data;Descrição;Valor;Tipo',
        '05/03/2026;Pagamento de boleto - Internet;-120,00;Débito'
    ].join('\n');
    const transactions = parseCsvTransactions(csv);
    const existingRowsByType = {
        'Saídas': [
            ['05/01/2026', 'Pagamento de boleto - Internet', 'Moradia', 'CONTAS DA CASA', '120,00', 'Daniel', 'Débito', 'Não', '', 'user-daniel'],
            ['05/02/2026', 'Pagamento de boleto - Internet', 'Moradia', 'CONTAS DA CASA', '120,00', 'Daniel', 'Débito', 'Não', '', 'user-daniel']
        ]
    };

    const [candidate] = detectRecurringBillCandidates(transactions, existingRowsByType);

    assert.ok(candidate);
    assert.match(candidate.description, /Internet/);
    assert.strictEqual(candidate.suggestedDueDay, 5);
    assert.strictEqual(candidate.monthCount, 3);
});
