const assert = require('node:assert/strict');
const test = require('node:test');
const {
    buildOpenFinanceSaveProposalReviewCatalog
} = require('../src/openFinance/openFinanceSaveProposalReviewCatalog');

test('9P.3 catalog keeps only authorized family data and deduplicates categories', async () => {
    const rows = {
        'Categorias!A:E': [
            ['Categoria', 'Subcategoria', 'Ativa', 'Criada em', 'user_id'],
            ['Alimentação', 'SUPERMERCADO', 'SIM', '', 'user-daniel'],
            ['Sigilosa', 'TERCEIRO', 'SIM', '', 'user-outsider'],
            ['Inativa', 'ANTIGA', 'NÃO', '', 'user-thais']
        ],
        'Saídas!A:K': [
            ['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor',
                'Responsável', 'Pagamento', 'Recorrente', 'Obs', 'user_id'],
            ['', '', 'Alimentação', 'SUPERMERCADO', '', '', '', '', '', 'user-thais'],
            ['', '', 'Transporte', 'UBER', '', '', '', '', '', 'user-thais'],
            ['', '', 'Privada', 'FORA', '', '', '', '', '', 'user-outsider']
        ],
        'Lançamentos Cartão!A:J': [
            ['Data', 'Descrição', 'Categoria', '', '', '', '', '', '', 'user_id'],
            ['', '', 'Lazer', '', '', '', '', '', '', 'user-daniel']
        ],
        'Contas Financeiras!A:I': [
            ['Nome', 'Tipo', '', '', 'Status', '', 'Responsável', 'user_id', ''],
            ['Nubank Daniel', 'bank', '', '', 'active', '', 'Daniel', 'user-daniel', ''],
            ['Conta Terceiro', 'bank', '', '', 'active', '', 'Outro', 'user-outsider', '']
        ],
        'Cartões!A:G': [
            ['card_id', 'Nome', 'Banco', '', '', 'Ativo', ''],
            ['nubank-daniel', 'Nubank Daniel', 'Nubank', '', '', 'SIM', ''],
            ['antigo', 'Cartão antigo', '', '', '', 'NÃO', '']
        ]
    };
    const catalog = await buildOpenFinanceSaveProposalReviewCatalog({
        userId: 'user-daniel',
        dependencies: {
            getFinancialScopeUserIds: () => ['user-daniel', 'user-thais'],
            getActiveUsers: async () => [
                { user_id: 'user-daniel', display_name: 'Daniel' },
                { user_id: 'user-thais', display_name: 'Thaís' },
                { user_id: 'user-outsider', display_name: 'Terceiro' }
            ],
            readDataFromSheet: async range => rows[range]
        }
    });

    assert.deepEqual(catalog.people.map(item => item.label), ['Daniel', 'Thaís']);
    assert.deepEqual(catalog.categories.map(item => item.label), [
        'Alimentação / SUPERMERCADO',
        'Lazer',
        'Transporte / UBER'
    ]);
    assert.deepEqual(catalog.financialAccounts.map(item => item.label), [
        'Nubank Daniel · Daniel'
    ]);
    assert.deepEqual(catalog.cards.map(item => item.label), ['Nubank Daniel']);
    assert.equal(catalog.paymentMethods.length, 4);
    assert.equal(catalog.financial_writes, 0);
});

test('9P.3 catalog fails closed when the authorized source is unavailable', async () => {
    await assert.rejects(
        buildOpenFinanceSaveProposalReviewCatalog({
            userId: 'user-daniel',
            dependencies: {
                getFinancialScopeUserIds: () => ['user-daniel'],
                getActiveUsers: async () => {
                    throw new Error('offline');
                },
                readDataFromSheet: async () => []
            }
        }),
        /open_finance_save_review_catalog_unavailable/
    );
});
