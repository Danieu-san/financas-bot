const test = require('node:test');
const assert = require('node:assert');

const {
    matchRecurringBill
} = require('../src/planning/financialCommandContextTools');

const accountRows = [
    ['Nome da Conta', 'Dia do Vencimento', 'Observações', 'user_id', 'Nome Amigável', 'Categoria', 'Subcategoria', 'Valor Esperado', 'Regra Ativa'],
    ['Claro Residencial', '10', 'linha familiar', 'daniel-user', 'Conta de telefone', 'Moradia', 'Telefone', '469,09', 'SIM'],
    ['Internet Vizinho', '12', 'fora do escopo', 'other-user', 'Internet', 'Moradia', 'Internet', '120,00', 'SIM'],
    ['Energia', '15', 'conta ativa', 'daniel-user', 'Conta de luz', 'Moradia', 'Energia', '300,00', 'SIM']
];

test('matchRecurringBill returns minimal scoped recurring bill candidates', () => {
    const result = matchRecurringBill({
        request: {
            query: 'Paguei 469,09 da conta de telefone',
            amount: 469.09,
            userId: 'other-user',
            rawRows: [['should not be honored']]
        },
        accountRows,
        trustedScope: {
            userIds: ['daniel-user']
        }
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.tool, 'match_recurring_bill');
    assert.strictEqual(result.classification, 'single_match');
    assert.strictEqual(result.candidates.length, 1);
    assert.deepStrictEqual(result.candidates[0], {
        label: 'Conta de telefone',
        category: 'Moradia',
        subcategory: 'Telefone',
        expectedAmount: 469.09,
        dueDay: '10',
        amountCompatible: true
    });

    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes('daniel-user'));
    assert.ok(!serialized.includes('other-user'));
    assert.ok(!serialized.includes('linha familiar'));
    assert.ok(!serialized.includes('rawRows'));
});

test('matchRecurringBill classifies no match without leaking scoped rows', () => {
    const result = matchRecurringBill({
        request: {
            query: 'Paguei 999,00 do boleto do curso',
            amount: 999
        },
        accountRows,
        trustedScope: {
            userIds: ['daniel-user']
        }
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.classification, 'no_match');
    assert.deepStrictEqual(result.candidates, []);
});
