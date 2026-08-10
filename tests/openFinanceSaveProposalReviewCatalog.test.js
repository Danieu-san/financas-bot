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
            ['Legada', 'SEM DONO', 'SIM', '', ''],
            ['Inativa', 'ANTIGA', 'NÃO', '', 'user-thais']
        ],
        'Saídas!A:K': [
            ['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor',
                'Responsável', 'Pagamento', 'Recorrente', 'Obs', 'user_id'],
            ['', '', 'Alimentação', 'SUPERMERCADO', '', '', '', '', '', 'user-thais'],
            ['', '', 'Transporte', 'UBER', '', '', '', '', '', 'user-thais'],
            ['', '', 'Privada', 'FORA', '', '', '', '', '', 'user-outsider'],
            ['', '', 'Legada', 'SEM DONO', '', '', '', '', '', '']
        ],
        'Lançamentos Cartão!A:J': [
            ['Data', 'Descrição', 'Categoria', '', '', '', '', '', '', 'user_id'],
            ['', '', 'Lazer', '', '', '', '', '', '', 'user-daniel']
        ],
        'Entradas!A:J': [
            ['Data', 'Descrição', 'Categoria', 'Valor', 'Responsável',
                'Recebimento', 'Recorrente', 'Obs', 'user_id', 'Conta Financeira'],
            ['', '', 'Freela', '', '', '', '', '', 'user-thais', ''],
            ['', '', 'Privada', '', '', '', '', '', 'user-outsider', '']
        ],
        'Contas Financeiras!A:I': [
            ['Nome', 'Tipo', '', '', 'Status', '', 'Responsável', 'user_id', ''],
            ['Nubank Daniel', 'bank', '', '', 'active', '', 'Daniel', 'user-daniel', ''],
            ['Conta Terceiro', 'bank', '', '', 'active', '', 'Outro', 'user-outsider', ''],
            ['Conta legada', 'bank', '', '', 'active', '', 'Sem dono', '', '']
        ],
        'Cartões!A:G': [
            ['card_id', 'Nome', 'Banco', '', '', 'Ativo', ''],
            ['nubank-daniel', 'Nubank Daniel', 'Nubank', '', '', 'SIM', ''],
            ['antigo', 'Cartão antigo', '', '', '', 'NÃO', '']
        ]
    };
    const readCalls = [];
    const catalog = await buildOpenFinanceSaveProposalReviewCatalog({
        userId: 'user-daniel',
        dependencies: {
            getFinancialScopeUserIds: () => ['user-daniel', 'user-thais'],
            getActiveUsers: async () => [
                { user_id: 'user-daniel', display_name: 'Daniel' },
                { user_id: 'user-thais', display_name: 'Thaís' },
                { user_id: 'user-outsider', display_name: 'Terceiro' }
            ],
            readDataFromSheet: async (range, options) => {
                readCalls.push({ range, options });
                return rows[range];
            }
        }
    });

    assert.deepEqual(catalog.people.map(item => item.label), ['Daniel', 'Thaís']);
    assert.deepEqual(catalog.categories.map(item => item.label), [
        'Alimentação / SUPERMERCADO',
        'Lazer',
        'Transporte / UBER'
    ]);
    assert.equal(catalog.incomeCategories.some(item => item.label === 'Freela'), true);
    assert.equal(catalog.incomeCategories.some(item => item.label === 'Privada'), false);
    assert.deepEqual(catalog.financialAccounts.map(item => item.label), [
        'Nubank Daniel · Daniel'
    ]);
    assert.deepEqual(catalog.cards.map(item => item.label), ['Nubank Daniel']);
    assert.equal(readCalls.length, 6);
    assert.equal(readCalls.every(call =>
        call.options?.userId === 'user-daniel' &&
        call.options?.requireUserScoped === true), true);
    assert.equal(catalog.paymentMethods.length, 4);
    assert.deepEqual(catalog.receiptMethods.map(item => item.value), [
        'Conta Corrente', 'Conta Poupança', 'PIX'
    ]);
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

test('9P.3 catalog preserves every authorized category and fails closed above its bound', async () => {
    const buildRows = count => [
        ['Categoria', 'Subcategoria', 'Ativa', 'Criada em', 'user_id'],
        ...Array.from({ length: count }, (_, index) => [
            `Categoria ${String(index + 1).padStart(4, '0')}`,
            '',
            'SIM',
            '',
            'user-daniel'
        ])
    ];
    const build = count => buildOpenFinanceSaveProposalReviewCatalog({
        userId: 'user-daniel',
        dependencies: {
            getFinancialScopeUserIds: () => ['user-daniel'],
            getActiveUsers: async () => [
                { user_id: 'user-daniel', display_name: 'Daniel' }
            ],
            readDataFromSheet: async range => (
                range === 'Categorias!A:E' ? buildRows(count) : []
            )
        }
    });

    const catalog = await build(137);
    assert.equal(catalog.categories.length, 137);
    assert.equal(catalog.categories[136].category, 'Categoria 0137');
    await assert.rejects(
        build(1001),
        /open_finance_save_review_categories_catalog_too_large/
    );
});
