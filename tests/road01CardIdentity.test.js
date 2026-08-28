'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const userSpreadsheetService = require('../src/services/userSpreadsheetService');
const {
    buildInvoiceIdentity,
    summarizeCardInvoiceRows,
    buildInvoiceSummaryFormula
} = require('../src/services/cardInvoiceSummaryService');

function cardRow({
    date = '10/08/2026',
    value = 50,
    billing = 'Agosto de 2026',
    cardId = '',
    label = '',
    userId = 'user-1'
} = {}) {
    return [date, 'Compra teste', 'Outros', value, '1/1', billing, cardId, label, '', userId];
}

test('same canonical card_id with different labels produces one invoice and canonical display', () => {
    const rows = [
        cardRow({ cardId: 'nubank-daniel', label: 'Nubank - Daniel', value: 40 }),
        cardRow({ cardId: 'nubank-daniel', label: 'Cartão Nubank - Daniel', value: 60, date: '11/08/2026' })
    ];
    const catalog = [
        ['card_id', 'Nome'],
        ['nubank-daniel', 'Nubank - Daniel']
    ];

    const summary = summarizeCardInvoiceRows(rows, catalog);

    assert.equal(summary.length, 1);
    assert.equal(summary[0].identityKey, 'id:nubank-daniel');
    assert.equal(summary[0].displayName, 'Nubank - Daniel');
    assert.equal(summary[0].total, 100);
    assert.equal(summary[0].count, 2);
});

test('legacy row without card_id remains present and uses its label as isolated identity', () => {
    const summary = summarizeCardInvoiceRows([
        cardRow({ cardId: '', label: 'Itaú Daniel', value: 125 })
    ]);

    assert.equal(summary.length, 1);
    assert.equal(summary[0].identityKey, 'legacy:Itaú Daniel');
    assert.equal(summary[0].identityKind, 'legacy');
    assert.equal(summary[0].displayName, 'Itaú Daniel');
    assert.equal(summary[0].total, 125);
});

test('two distinct legacy labels without card_id stay in separate invoice groups', () => {
    const summary = summarizeCardInvoiceRows([
        cardRow({ cardId: '', label: 'Itaú Daniel', value: 10 }),
        cardRow({ cardId: '', label: 'Itaú Thaís', value: 20 })
    ]);

    assert.equal(summary.length, 2);
    assert.deepEqual(
        summary.map(item => item.identityKey).sort(),
        ['legacy:Itaú Daniel', 'legacy:Itaú Thaís']
    );
});

test('legacy label is never heuristically merged with a canonical card_id', () => {
    const summary = summarizeCardInvoiceRows([
        cardRow({ cardId: 'itau-daniel', label: 'Itaú Daniel', value: 30 }),
        cardRow({ cardId: '', label: 'Itaú Daniel', value: 40 })
    ], [
        ['card_id', 'Nome'],
        ['itau-daniel', 'Itaú Daniel']
    ]);

    assert.equal(summary.length, 2);
    assert.deepEqual(
        summary.map(item => item.identityKey).sort(),
        ['id:itau-daniel', 'legacy:Itaú Daniel']
    );
});

test('canonical identity wins whenever G is present; H is presentation only', () => {
    assert.deepEqual(
        buildInvoiceIdentity(cardRow({ cardId: 'stable-id', label: 'Completely Different Label' })),
        {
            key: 'id:stable-id',
            kind: 'canonical',
            cardId: 'stable-id',
            label: 'Completely Different Label'
        }
    );
});

test('invoice formula mirrors canonical/legacy identity split and resolves friendly display', () => {
    const formula = buildInvoiceSummaryFormula();

    assert.match(formula, /id:/);
    assert.match(formula, /legacy:/);
    assert.match(formula, /'Lançamentos Cartão'!G2:G/);
    assert.match(formula, /'Lançamentos Cartão'!H2:H/);
    assert.match(formula, /'Cartões'!A2:A/);
    assert.match(formula, /'Cartões'!B2:B/);
    assert.match(formula, /FILTER\(/);
    assert.match(formula, /group by Col1, Col2/);
    assert.doesNotMatch(formula, /where Col5 is not null and 'Lançamentos Cartão'!G/);
});

test('production Faturas formula is exactly the formula represented by the causal helper', () => {
    const productionFormula = userSpreadsheetService.__test__.buildInvoiceSummaryRows()[0][0];
    assert.equal(productionFormula, buildInvoiceSummaryFormula());
});
