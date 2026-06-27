const test = require('node:test');
const assert = require('node:assert');

const {
    matchRecurringBill,
    matchDebt,
    matchCardInvoice,
    resolveCategory,
    listUserAccounts
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
test('matchRecurringBill matches short utility names as exact scoped words', () => {
    const shortNameRows = [
        accountRows[0],
        ['Gás', '10', '', 'daniel-user', 'Gás', 'Moradia', 'Gás', '100,00', 'SIM'],
        ['Luz', '15', '', 'daniel-user', 'Luz', 'Moradia', 'Energia', '200,00', 'SIM']
    ];

    const gas = matchRecurringBill({
        request: { query: 'Paguei 12,41 do gás no débito', amount: 12.41 },
        accountRows: shortNameRows,
        trustedScope: { userIds: ['daniel-user'] }
    });
    const light = matchRecurringBill({
        request: { query: 'Acabei de pagar 12,43 da luz em dinheiro', amount: 12.43 },
        accountRows: shortNameRows,
        trustedScope: { userIds: ['daniel-user'] }
    });

    assert.strictEqual(gas.classification, 'single_match');
    assert.strictEqual(gas.candidates[0].label, 'Gás');
    assert.strictEqual(light.classification, 'single_match');
    assert.strictEqual(light.candidates[0].label, 'Luz');
});

test('matchRecurringBill treats a short exact account word as ambiguous without substring matches', () => {
    const apartmentRows = [
        accountRows[0],
        ['Mensal do ap', '10', '', 'daniel-user', 'Mensal do ap', 'Moradia', 'Financiamento', '100,00', 'SIM'],
        ['Taxa de obra do ap', '15', '', 'daniel-user', 'Taxa de obra do ap', 'Moradia', 'Taxa', '200,00', 'SIM'],
        ['Aplicativo premium', '20', '', 'daniel-user', 'Aplicativo premium', 'Assinaturas', 'Aplicativo', '30,00', 'SIM']
    ];

    const result = matchRecurringBill({
        request: { query: 'Paguei 12,47 da conta do ap', amount: 12.47 },
        accountRows: apartmentRows,
        trustedScope: { userIds: ['daniel-user'] }
    });

    assert.strictEqual(result.classification, 'multiple_matches');
    assert.deepStrictEqual(
        result.candidates.map(candidate => candidate.label).sort(),
        ['Mensal do ap', 'Taxa de obra do ap']
    );
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
const cardLaunchRows = [
    ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'card_id', 'Cartão', 'Observações', 'user_id'],
    ['01/06/2026', 'Mercado', 'Casa', '500,00', '1/1', 'Junho de 2026', 'nubank-daniel', 'Nubank Daniel', 'compra privada', 'daniel-user'],
    ['05/06/2026', 'Farmácia', 'Saúde', '350,00', '1/1', 'Junho de 2026', 'nubank-daniel', 'Nubank Daniel', 'outra compra', 'daniel-user'],
    ['06/06/2026', 'Compra outro usuário', 'Casa', '120,00', '1/1', 'Junho de 2026', 'nubank-outro', 'Nubank Outro', 'fora do escopo', 'other-user'],
    ['10/06/2026', 'Supermercado', 'Casa', '220,00', '1/1', 'Junho de 2026', 'itau-daniel', 'Itaú Daniel', 'nao vazar', 'daniel-user']
];

test('matchCardInvoice builds scoped invoice candidates from card launches', () => {
    const result = matchCardInvoice({
        request: {
            query: 'Paguei 850 da fatura do Nubank',
            amount: 850,
            userId: 'other-user',
            rawRows: [['should not be honored']]
        },
        cardLaunchRows,
        trustedScope: {
            userIds: ['daniel-user']
        }
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.tool, 'match_card_invoice');
    assert.strictEqual(result.classification, 'single_match');
    assert.deepStrictEqual(result.candidates, [{
        label: 'Nubank Daniel - Junho de 2026',
        card: 'Nubank Daniel',
        billingMonth: 'Junho de 2026',
        invoiceAmount: 850,
        installmentCount: 2,
        amountCompatible: true,
        status: 'open_or_expected'
    }]);

    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes('daniel-user'));
    assert.ok(!serialized.includes('other-user'));
    assert.ok(!serialized.includes('compra privada'));
    assert.ok(!serialized.includes('rawRows'));
});

test('matchCardInvoice does not leak another user invoice with the same card brand', () => {
    const result = matchCardInvoice({
        request: {
            query: 'Paguei 120 da fatura do Nubank',
            amount: 120
        },
        cardLaunchRows,
        trustedScope: {
            userIds: ['daniel-user']
        }
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.classification, 'no_match');
    assert.deepStrictEqual(result.candidates, []);
});
const expenseRows = [
    ['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Responsável', 'Pagamento', 'Recorrente', 'Observações', 'user_id'],
    ['01/06/2026', 'Restaurante Malz', 'Alimentação', 'Restaurante', '120,00', 'Daniel', 'PIX', 'Não', 'mesa privada', 'daniel-user'],
    ['02/06/2026', 'Curso secreto', 'Educação', 'Curso', '999,00', 'Outro', 'PIX', 'Não', 'fora do escopo', 'other-user']
];

test('resolveCategory returns known category candidates without historical descriptions', () => {
    const result = resolveCategory({
        request: {
            query: 'gastei 120 no restaurante malz',
            userId: 'other-user',
            rawRows: [['should not be honored']]
        },
        expenseRows,
        cardLaunchRows,
        accountRows,
        knownCategories: [
            { category: 'Pets', subcategory: 'Banho e tosa' }
        ],
        trustedScope: {
            userIds: ['daniel-user']
        }
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.tool, 'resolve_category');
    assert.strictEqual(result.classification, 'single_match');
    assert.deepStrictEqual(result.candidates, [{
        category: 'Alimentação',
        subcategory: 'Restaurante',
        source: 'history'
    }]);

    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes('daniel-user'));
    assert.ok(!serialized.includes('other-user'));
    assert.ok(!serialized.includes('Restaurante Malz'));
    assert.ok(!serialized.includes('mesa privada'));
    assert.ok(!serialized.includes('Curso secreto'));
    assert.ok(!serialized.includes('rawRows'));
});

test('resolveCategory can return public known categories when scoped history has no match', () => {
    const result = resolveCategory({
        request: {
            query: 'banho e tosa'
        },
        expenseRows,
        knownCategories: [
            { category: 'Pets', subcategory: 'Banho e tosa' }
        ],
        trustedScope: {
            userIds: ['daniel-user']
        }
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.classification, 'single_match');
    assert.deepStrictEqual(result.candidates, [{
        category: 'Pets',
        subcategory: 'Banho e tosa',
        source: 'known'
    }]);
});
const transferRows = [
    ['Data', 'Descrição', 'Valor', 'Conta Origem', 'Conta Destino', 'Método', 'Observações', 'Status', 'user_id'],
    ['01/06/2026', 'Pagamento fatura', '850,00', 'Conta Corrente', 'Nubank Cartão', 'PIX', 'privado', 'Pagamento de fatura', 'daniel-user'],
    ['02/06/2026', 'Outro usuário', '10,00', 'Conta Secreta', 'Outra Conta', 'PIX', 'fora do escopo', 'Transferência', 'other-user']
];

const cardConfigRows = [
    ['card_id', 'Nome', 'Banco', 'Dia de Fechamento', 'Dia de Vencimento', 'Ativo', 'Observações'],
    ['nubank-daniel', 'Nubank Daniel', 'Nubank', '8', '15', 'SIM', 'cartao privado'],
    ['itau-inativo', 'Itaú Inativo', 'Itaú', '10', '20', 'NÃO', 'nao listar']
];

test('listUserAccounts returns scoped account labels and roles without transfer details', () => {
    const result = listUserAccounts({
        request: {
            query: 'de qual conta paguei a fatura?',
            userId: 'other-user',
            rawRows: [['should not be honored']]
        },
        transferRows,
        cardConfigRows,
        knownAccounts: [
            { label: 'Carteira', roles: ['cash_source'] }
        ],
        trustedScope: {
            userIds: ['daniel-user']
        }
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.tool, 'list_user_accounts');
    assert.strictEqual(result.classification, 'available');
    assert.deepStrictEqual(result.accounts, [
        { label: 'Carteira', roles: ['cash_source'] },
        { label: 'Conta Corrente', roles: ['cash_source'] },
        { label: 'Nubank Cartão', roles: ['cash_destination'] },
        { label: 'Nubank Daniel', roles: ['credit_card'], bank: 'Nubank' }
    ]);

    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes('daniel-user'));
    assert.ok(!serialized.includes('other-user'));
    assert.ok(!serialized.includes('Pagamento fatura'));
    assert.ok(!serialized.includes('Conta Secreta'));
    assert.ok(!serialized.includes('privado'));
    assert.ok(!serialized.includes('rawRows'));
});
