const test = require('node:test');
const assert = require('node:assert');

const {
    matchRecurringBill,
    matchDebt
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
const debtRows = [
    ['Nome', 'Credor', 'Tipo', 'Valor Original', 'Saldo Atual', 'Parcela', 'Juros', 'Vencimento', 'Início', 'Total Parcelas', 'Status', 'Responsável', 'Observações', '% Quitado', 'Próximo Vencimento', 'Atraso (Dias)', 'Data Prevista para Quitação', 'user_id'],
    ['Financiamento carro', 'Banco XP', 'Financiamento', '10000,00', '8000,00', '500,00', '1,5%', '10', '01/01/2026', '24', 'Ativa', 'Daniel', 'contrato privado', '20%', '10/07/2026', '0', '', 'daniel-user'],
    ['Empréstimo amigo', 'Pessoa', 'Pessoal', '1000,00', '0,00', '100,00', '0%', '5', '01/01/2026', '10', 'Quitada', 'Daniel', 'nao vazar', '100%', '', '0', '', 'daniel-user'],
    ['Financiamento outro', 'Banco Y', 'Financiamento', '2000,00', '900,00', '100,00', '1%', '8', '01/01/2026', '20', 'Ativa', 'Outro', 'fora do escopo', '55%', '', '0', '', 'other-user']
];

test('matchDebt returns minimal active debt candidates from trusted scope only', () => {
    const result = matchDebt({
        request: {
            query: 'Paguei 500 da dívida do financiamento do carro',
            amount: 500,
            userId: 'other-user',
            rawRows: [['should not be honored']]
        },
        debtRows,
        trustedScope: {
            userIds: ['daniel-user']
        }
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.tool, 'match_debt');
    assert.strictEqual(result.classification, 'single_match');
    assert.deepStrictEqual(result.candidates, [{
        label: 'Financiamento carro',
        creditor: 'Banco XP',
        type: 'Financiamento',
        balanceAmount: 8000,
        installmentAmount: 500,
        dueDay: '10',
        status: 'Ativa',
        amountWithinBalance: true
    }]);

    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes('daniel-user'));
    assert.ok(!serialized.includes('other-user'));
    assert.ok(!serialized.includes('contrato privado'));
    assert.ok(!serialized.includes('rawRows'));
});

test('matchDebt does not return paid debts as payment candidates', () => {
    const result = matchDebt({
        request: {
            query: 'Paguei 100 da dívida do amigo',
            amount: 100
        },
        debtRows,
        trustedScope: {
            userIds: ['daniel-user']
        }
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.classification, 'no_match');
    assert.deepStrictEqual(result.candidates, []);
});
