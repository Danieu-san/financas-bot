const test = require('node:test');
const assert = require('node:assert');

const {
    ensureSqliteReady,
    syncSnapshotToSqlite,
    queryAnalyticalIntentSql,
    queryKpis,
    queryDebts,
    queryGoals,
    queryCashflow,
    queryRecentTransactions,
    queryAlerts,
    ALL_USERS_ID
} = require('../src/services/sqliteReadModelService');
const {
    executeAnalyticalIntent,
    executeFinancialQueryPlanFromReadModel,
    getDashboardSqlData,
    __test__: readModelTestHelpers
} = require('../src/services/readModelService');
const metrics = require('../src/utils/metrics');

function resolvedScope(scope, userIds) {
    return { decision: 'allow', scope, userIds };
}

test('read-model preserves the configured budget when a duplicate blank UserSettings row follows it', async () => {
    const header = Array.from({ length: 19 }, (_, index) => `column_${index}`);
    const configured = Array(19).fill('');
    configured[0] = 'user-budget-owner';
    configured[13] = 'SIM';
    configured[14] = '938.11';
    configured[17] = 'family';
    configured[18] = '28';
    const duplicateBlank = Array(19).fill('');
    duplicateBlank[0] = 'user-budget-owner';

    const rows = readModelTestHelpers.mapUserSettingsRows([header, configured, duplicateBlank]);

    assert.deepStrictEqual(rows, [{
        user_id: 'user-budget-owner',
        monthly_budget_enabled: 'SIM',
        monthly_budget_amount: '938.11',
        monthly_budget_scope: 'family',
        monthly_budget_cycle_start_day: '28'
    }]);

    assert.strictEqual(ensureSqliteReady(), true);
    assert.strictEqual(syncSnapshotToSqlite({
        saidas: [],
        cartoes: [],
        entradas: [],
        transferencias: [],
        userSettings: rows,
        cartoesConfig: [],
        metas: [],
        movimentacoesMetas: [],
        dividas: [],
        contas: []
    }), true);
    const result = await executeFinancialQueryPlanFromReadModel({
        kind: 'financial_query',
        domain: 'budget',
        operation: 'forecast',
        filters: { period: { type: 'cycle', label: 'ciclo atual' }, scope: 'family' },
        timeBasis: 'budget_cycle'
    }, 'orcamento_restante_ciclo', { currentDate: '02/07/2026' }, {
        userId: 'user-budget-owner',
        resolvedScope: resolvedScope('family', ['user-budget-owner', 'user-budget-member'])
    });

    assert.strictEqual(result.results.active, true);
    assert.strictEqual(result.results.monthlyAmount, 938.11);
    assert.strictEqual(result.results.scope, 'family');
});

function syncControlledSnapshot() {
    assert.strictEqual(ensureSqliteReady(), true, 'SQLite should be available for read-model tests');
    const synced = syncSnapshotToSqlite({
        saidas: [
            { user_id: 'user-read-a', data: '10/02/2026', descricao: 'lanche', categoria: 'Alimentação', subcategoria: 'PADARIA / LANCHE', valor: 80, month: 1, year: 2026 },
            { user_id: 'user-read-a', data: '11/02/2026', descricao: 'uber', categoria: 'Transporte', subcategoria: 'UBER / 99', valor: 20, month: 1, year: 2026 },
            { user_id: 'user-read-b', data: '10/02/2026', descricao: 'outro usuario', categoria: 'Alimentação', subcategoria: '', valor: 999, month: 1, year: 2026 }
        ],
        cartoes: [
            { user_id: 'user-read-a', source: 'Cartão Nubank - Daniel', card_id: 'nubank-daniel', cartao: 'Cartão Nubank - Daniel', data: '12/02/2026', descricao: 'mercado cartão', categoria: 'Alimentação', subcategoria: 'Cartão de Crédito', valor: 100, parcela: '1/1', month: 1, year: 2026 },
            { user_id: 'user-read-a', source: 'Cartão Nubank - Daniel', card_id: 'nubank-daniel', cartao: 'Cartão Nubank - Daniel', data: '13/02/2026', descricao: 'notebook', categoria: 'Eletrônicos', subcategoria: 'Cartão de Crédito', valor: 1000, parcela: '1/2', month: 1, year: 2026 },
            { user_id: 'user-read-a', source: 'Cartão Nubank - Daniel', card_id: 'nubank-daniel', cartao: 'Cartão Nubank - Daniel', data: '13/02/2026', descricao: 'notebook', categoria: 'Eletrônicos', subcategoria: 'Cartão de Crédito', valor: 1000, parcela: '2/2', month: 2, year: 2026 },
            { user_id: 'user-read-a', source: 'Cartão Itaú', card_id: 'itau', cartao: 'Cartão Itaú', data: '02/03/2026', descricao: 'farmácia', categoria: 'Saúde', subcategoria: 'Cartão de Crédito', valor: 50, parcela: '1/1', month: 2, year: 2026 },
            { user_id: 'user-read-b', source: 'Cartão Nubank - Outro', card_id: 'nubank-outro', cartao: 'Cartão Nubank - Outro', data: '12/02/2026', descricao: 'cartão outro', categoria: 'Alimentação', subcategoria: 'Cartão de Crédito', valor: 999, parcela: '1/1', month: 1, year: 2026 }
        ],
        entradas: [
            { user_id: 'user-read-a', data: '05/02/2026', descricao: 'salário', categoria: 'Salário', valor: 1000, recebimento: 'Conta Corrente', recorrente: 'Sim', month: 1, year: 2026 },
            { user_id: 'user-read-a', data: '10/02/2026', descricao: 'freela', categoria: 'Renda Extra', valor: 250, recebimento: 'PIX', recorrente: 'Não', month: 1, year: 2026 },
            { user_id: 'user-read-b', data: '05/02/2026', descricao: 'salário outro', categoria: 'Salário', valor: 5000, recebimento: 'Conta Corrente', recorrente: 'Sim', month: 1, year: 2026 }
        ],
        transferencias: [
            { user_id: 'user-read-a', data: '06/02/2026', descricao: 'aplicação caixinha', valor: 300, origem: 'Conta Corrente', destino: 'Caixinha Nubank', metodo: 'PIX', observacoes: '', status: 'Movimentação de reserva/investimento', month: 1, year: 2026 },
            { user_id: 'user-read-a', data: '16/02/2026', descricao: 'resgate caixinha', valor: 100, origem: 'Caixinha Nubank', destino: 'Conta Corrente', metodo: 'PIX', observacoes: '', status: 'Movimentação de reserva/investimento', month: 1, year: 2026 },
            { user_id: 'user-read-a', data: '20/02/2026', descricao: 'pagamento fatura nubank', valor: 700, origem: 'Conta Corrente', destino: 'Nubank Cartão', metodo: 'PIX', observacoes: '', status: 'Pagamento de fatura', month: 1, year: 2026 },
            { user_id: 'user-read-a', data: '22/02/2026', descricao: 'pix para thais', valor: 150, origem: 'Conta Corrente', destino: 'Thais', metodo: 'PIX', observacoes: '', status: 'Provável transferência interna', month: 1, year: 2026 },
            { user_id: 'user-read-a', data: '23/02/2026', descricao: 'entre contas próprias', valor: 75, origem: 'Conta Corrente', destino: 'Poupança', metodo: 'TED', observacoes: '', status: 'Transferência entre contas próprias', month: 1, year: 2026 },
            { user_id: 'user-read-b', data: '06/02/2026', descricao: 'aplicação outro', valor: 9999, origem: 'Conta', destino: 'Caixinha', metodo: 'PIX', observacoes: '', status: 'Movimentação de reserva/investimento', month: 1, year: 2026 }
        ],
        userSettings: [
            { user_id: 'user-read-a', monthly_budget_enabled: 'SIM', monthly_budget_amount: '1000', monthly_budget_scope: 'family', monthly_budget_cycle_start_day: '31' },
            { user_id: 'user-read-b', monthly_budget_enabled: 'SIM', monthly_budget_amount: '500', monthly_budget_scope: 'personal', monthly_budget_cycle_start_day: '31' }
        ],
        cartoesConfig: [
            { card_id: 'nubank-daniel', nome: 'Cartão Nubank - Daniel', due_day: 15, active: 'SIM' },
            { card_id: 'itau', nome: 'Cartão Itaú', due_day: 15, active: 'SIM' }
        ],
        metas: [
            { user_id: 'user-read-a', row: ['Reserva', 'R$1.000,00', 'R$250,00', '25%', '', '31/12/2026', 'Em andamento', 'Alta', 'user-read-a', 'family', 'Aporte de R$250,00'] },
            { user_id: 'user-read-a', row: ['Viagem pausada', 'R$2.000,00', 'R$100,00', '5%', '', '31/12/2026', 'Pausada', 'Baixa', 'user-read-a', 'personal', 'Status: Pausada'] },
            { user_id: 'user-read-b', row: ['Meta outro', 'R$9.999,00', 'R$9.999,00', '100%'] }
        ],
        movimentacoesMetas: [
            { user_id: 'user-read-a', row: ['01/02/2026', 'Reserva', 'Aporte', '300', '0', '300', 'aporte inicial', 'Daniel', 'user-read-a', 'user-read-a'] },
            { user_id: 'user-read-a', row: ['10/02/2026', 'Reserva', 'Retirada', '50', '300', '250', 'ajuste', 'Daniel', 'user-read-a', 'user-read-a'] },
            { user_id: 'user-read-b', row: ['10/02/2026', 'Meta outro', 'Aporte', '9999', '0', '9999', '', 'Outro', 'user-read-b', 'user-read-b'] }
        ],
        dividas: [
            { user_id: 'user-read-a', row: ['Financiamento', 'Banco', 'Financiamento', 'R$2.000,00', 'R$1.200,00', 'R$200,00', '2% a.m.', 10, '01/01/2026', 10, 'Ativa', '', '', '40%', '10/03/2026'] },
            { user_id: 'user-read-b', row: ['Dívida outro', 'Banco', 'Cartão', 'R$9.999,00', 'R$9.999,00', 'R$999,00', '10% a.m.', 10, '01/01/2026', 10, 'Ativa', '', '', '0%', '10/03/2026'] }
        ],
        contas: [
            { user_id: 'user-read-a', headers: ['Categoria', 'Nome Amigável', 'Dia do Vencimento', 'Valor Esperado', 'Regra Ativa', 'Subcategoria', 'Nome da Conta', 'Observações', 'user_id'], row: ['Moradia', 'Internet', '28', '120', 'SIM', 'INTERNET', 'NET', '', 'user-read-a'] },
            { user_id: 'user-read-b', headers: ['Nome da Conta', 'Dia do Vencimento', 'Observações', 'user_id', 'Nome Amigável', 'Categoria', 'Subcategoria', 'Valor Esperado', 'Regra Ativa'], row: ['OUTRA', '28', '', 'user-read-b', 'Conta outro', 'Moradia', '', '9999', 'SIM'] }
        ]
    });
    assert.strictEqual(synced, true);
}

test('Packet 08 SQLite read-model feeds scoped bills and matching outputs to Query Engine', async () => {
    syncControlledSnapshot();
    const result = await executeFinancialQueryPlanFromReadModel({
        kind: 'financial_query',
        domain: 'bills',
        operation: 'compare',
        filters: { period: { type: 'month', month: 1, year: 2026 } },
        groupBy: [],
        sort: { by: 'due_date', direction: 'asc' },
        limit: 10,
        timeBasis: 'due_date',
        needsContext: false,
        answerStyle: 'audit'
    }, 'comparacao_contas_realizado', { mes: 1, ano: 2026, currentDate: '28/02/2026' }, { userId: 'user-read-a' });

    assert.strictEqual(result.source, 'sqlite_query_engine');
    assert.strictEqual(result.results.totals.expected, 120);
    assert.strictEqual(result.results.items.length, 1);
    assert.doesNotMatch(JSON.stringify(result), /user-read-b|9999/);

    const family = await executeFinancialQueryPlanFromReadModel({
        kind: 'financial_query',
        domain: 'bills',
        operation: 'sum',
        filters: { period: { type: 'month', month: 1, year: 2026 }, scope: 'family' },
        groupBy: [],
        sort: { by: 'due_date', direction: 'asc' },
        limit: 10,
        timeBasis: 'due_date',
        needsContext: false,
        answerStyle: 'detailed'
    }, 'total_contas_recorrentes', { mes: 1, ano: 2026, currentDate: '28/02/2026' }, {
        userId: 'user-read-a',
        resolvedScope: resolvedScope('family', ['user-read-a', 'user-read-b'])
    });
    assert.strictEqual(family.results, 10119);

    const outsider = await executeFinancialQueryPlanFromReadModel({
        kind: 'financial_query',
        domain: 'bills',
        operation: 'sum',
        filters: { period: { type: 'month', month: 1, year: 2026 } },
        groupBy: [],
        sort: { by: 'due_date', direction: 'asc' },
        limit: 10,
        timeBasis: 'due_date',
        needsContext: false,
        answerStyle: 'detailed'
    }, 'total_contas_recorrentes', { mes: 1, ano: 2026, currentDate: '28/02/2026' }, { userId: 'user-read-b' });
    assert.strictEqual(outsider.results, 9999);
});

test('sqlite read-model answers common analytical intents scoped by user_id', () => {
    syncControlledSnapshot();

    const total = queryAnalyticalIntentSql('total_gastos_mes', { mes: 1, ano: 2026 }, { userId: 'user-read-a' });
    assert.strictEqual(total.results, 1200);
    assert.deepStrictEqual(total.details, { totalSaidas: 100, totalCartoes: 1100, mes: 1, ano: 2026 });

    const category = queryAnalyticalIntentSql('total_gastos_categoria_mes', { categoria: 'alimentação', mes: 1, ano: 2026 }, { userId: 'user-read-a' });
    assert.strictEqual(category.results, 180);

    const list = queryAnalyticalIntentSql('listagem_gastos_categoria', { categoria: 'alimentação', mes: 1, ano: 2026 }, { userId: 'user-read-a' });
    assert.strictEqual(list.results.length, 2);
    assert.ok(list.results.every(row => !String(row[1]).includes('outro usuario')));

    const balance = queryAnalyticalIntentSql('saldo_do_mes', { mes: 1, ano: 2026 }, { userId: 'user-read-a' });
    assert.strictEqual(balance.results, 50);

    const minMax = queryAnalyticalIntentSql('maior_menor_gasto', { mes: 1, ano: 2026 }, { userId: 'user-read-a' });
    assert.strictEqual(minMax.results.min[1], 'uber');
    assert.strictEqual(minMax.results.max[1], 'notebook');

    const dailyAverage = queryAnalyticalIntentSql('media_diaria_gastos_mes', { mes: 1, ano: 2026 }, { userId: 'user-read-a' });
    assert.strictEqual(Math.round(dailyAverage.results * 100) / 100, Math.round((1200 / 28) * 100) / 100);
    assert.strictEqual(dailyAverage.details.totalGastos, 1200);

    const combined = queryAnalyticalIntentSql('total_gastos_multiplas_categorias', { categorias: ['alimentação', 'transporte'], mes: 1, ano: 2026 }, { userId: 'user-read-a' });
    assert.strictEqual(combined.results, 200);

    const percentage = queryAnalyticalIntentSql('percentual_categoria_gastos', { categoria: 'alimentação', mes: 1, ano: 2026 }, { userId: 'user-read-a' });
    assert.strictEqual(percentage.results, 15);
    assert.strictEqual(percentage.details.totalCategoria, 180);
    assert.strictEqual(percentage.details.totalGastos, 1200);

    const comparison = queryAnalyticalIntentSql('comparacao_gastos_categorias', { categorias: ['alimentação', 'transporte'], mes: 1, ano: 2026 }, { userId: 'user-read-a' });
    assert.deepStrictEqual(comparison.results.categorias, [
        { categoria: 'alimentação', total: 180 },
        { categoria: 'transporte', total: 20 }
    ]);

    const categoryMinMax = queryAnalyticalIntentSql('maior_menor_gasto_categoria', { categoria: 'alimentação', mes: 1, ano: 2026 }, { userId: 'user-read-a' });
    assert.strictEqual(categoryMinMax.results.min[1], 'lanche');
    assert.strictEqual(categoryMinMax.results.max[1], 'mercado cartão');

    const invoice = queryAnalyticalIntentSql('total_fatura_cartao', { cartao: 'nubank', mes: 1, ano: 2026 }, { userId: 'user-read-a' });
    assert.strictEqual(invoice.results, 1100);
    assert.strictEqual(invoice.details.parcelas, 2);

    const accentlessInvoice = queryAnalyticalIntentSql('total_fatura_cartao', { cartao: 'itau', mes: 2, ano: 2026 }, { userId: 'user-read-a' });
    assert.strictEqual(accentlessInvoice.results, 50);
    assert.strictEqual(accentlessInvoice.details.parcelas, 1);

    const openCards = queryAnalyticalIntentSql('total_cartoes_em_aberto', { cartao: 'nubank', mes: 1, ano: 2026 }, { userId: 'user-read-a' });
    assert.strictEqual(openCards.results, 2100);
    assert.strictEqual(openCards.details.parcelas, 3);

    const installments = queryAnalyticalIntentSql('resumo_parcelamentos_cartao', { cartao: 'nubank', mes: 1, ano: 2026 }, { userId: 'user-read-a' });
    assert.strictEqual(installments.results.length, 1);
    assert.strictEqual(installments.results[0].descricao, 'notebook');
    assert.strictEqual(installments.results[0].totalPrevisto, 2000);

    const expenseDetails = queryAnalyticalIntentSql('detalhamento_gastos_mes', { mes: 1, ano: 2026 }, { userId: 'user-read-a' });
    assert.strictEqual(expenseDetails.results.total, 1200);
    assert.deepStrictEqual(expenseDetails.results.categorias.slice(0, 2).map(item => [item.label, item.total, item.count]), [
        ['Eletrônicos', 1000, 1],
        ['Alimentação', 180, 2]
    ]);
    assert.ok(expenseDetails.results.estabelecimentos.some(item => item.label === 'Mercado Cartão' && item.total === 100));
    assert.ok(expenseDetails.results.lancamentos.every(item => !String(item.descricao).includes('outro')));

    const cardDetails = queryAnalyticalIntentSql('detalhamento_cartao_mes', { cartao: 'nubank', mes: 1, ano: 2026 }, { userId: 'user-read-a' });
    assert.strictEqual(cardDetails.results.total, 1100);
    assert.strictEqual(cardDetails.results.totalSaidas, 0);
    assert.strictEqual(cardDetails.results.totalCartoes, 1100);
    assert.strictEqual(cardDetails.results.lancamentos.length, 2);

    const establishments = queryAnalyticalIntentSql('ranking_estabelecimentos_gastos', { mes: 1, ano: 2026 }, { userId: 'user-read-a' });
    assert.deepStrictEqual(establishments.results.slice(0, 3).map(item => [item.label, item.total, item.count]), [
        ['Notebook', 1000, 1],
        ['Mercado Cartão', 100, 1],
        ['Lanche', 80, 1]
    ]);

    const goalsSummary = queryAnalyticalIntentSql('resumo_metas', {}, { userId: 'user-read-a' });
    assert.strictEqual(goalsSummary.results.length, 2);
    const reservaGoal = goalsSummary.results.find(goal => goal.nome === 'Reserva');
    const pausedGoal = goalsSummary.results.find(goal => goal.nome === 'Viagem pausada');
    assert.strictEqual(reservaGoal.falta, 750);
    assert.strictEqual(reservaGoal.escopo, 'family');
    assert.strictEqual(pausedGoal.ativa, false);
    assert.strictEqual(pausedGoal.status, 'Pausada');
    assert.strictEqual(goalsSummary.details.ativas, 1);
    assert.strictEqual(goalsSummary.details.totalFalta, 2650);

    const goalsProgress = queryAnalyticalIntentSql('progresso_metas', {}, { userId: 'user-read-a' });
    assert.strictEqual(goalsProgress.results.length, 1);
    assert.strictEqual(goalsProgress.results[0].progressoPct, 25);
});

test('sqlite read-model feeds FinancialQueryPlan into Query Engine for expenses', async () => {
    syncControlledSnapshot();

    const result = await executeFinancialQueryPlanFromReadModel(
        {
            kind: 'financial_query',
            domain: 'expenses',
            operation: 'percentage',
            filters: {
                period: { type: 'month', month: 1, year: 2026 },
                category: 'alimentacao'
            },
            groupBy: ['category'],
            sort: { by: 'value', direction: 'desc' },
            limit: 10,
            timeBasis: 'billing_month',
            needsContext: false,
            answerStyle: 'short'
        },
        'percentual_categoria_gastos',
        { categoria: 'alimentacao', mes: 1, ano: 2026 },
        { userId: 'user-read-a' }
    );

    assert.strictEqual(result.source, 'sqlite_query_engine');
    assert.strictEqual(result.results, 15);
    assert.strictEqual(result.details.totalCategoria, 180);
    assert.strictEqual(result.details.totalGastos, 1200);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(result.details, 'financialQueryPlan'), false);
});

test('sqlite read-model feeds Packet 02 card plans into Query Engine with scoped users', async () => {
    syncControlledSnapshot();

    const invoicePlan = {
        kind: 'financial_query',
        domain: 'cards',
        operation: 'sum',
        filters: { period: { type: 'month', month: 1, year: 2026 }, card: 'nubank daniel' },
        groupBy: [],
        sort: { by: 'value', direction: 'desc' },
        limit: 10,
        timeBasis: 'billing_month',
        needsContext: false,
        answerStyle: 'short'
    };
    const invoice = await executeFinancialQueryPlanFromReadModel(
        invoicePlan,
        'total_fatura_cartao',
        { cartao: 'nubank daniel', mes: 1, ano: 2026 },
        { userId: 'user-read-a' }
    );
    assert.strictEqual(invoice.source, 'sqlite_query_engine');
    assert.strictEqual(invoice.results, 1100);
    assert.strictEqual(invoice.details.parcelas, 2);

    const installmentsPlan = {
        ...invoicePlan,
        operation: 'list',
        filters: { period: { type: 'month', month: 1, year: 2026 }, card: 'nubank daniel', status: 'active_installments' },
        groupBy: ['card'],
        answerStyle: 'detailed'
    };
    const installments = await executeFinancialQueryPlanFromReadModel(
        installmentsPlan,
        'resumo_parcelamentos_cartao',
        { cartao: 'nubank daniel', mes: 1, ano: 2026 },
        { userId: 'user-read-a' }
    );
    assert.strictEqual(installments.source, 'sqlite_query_engine');
    assert.strictEqual(installments.results.length, 1);
    assert.strictEqual(installments.results[0].descricao, 'notebook');
    assert.strictEqual(installments.results[0].totalPrevisto, 2000);
    assert.strictEqual(installments.results[0].parcelasLancadas, 2);

    const groupPlan = {
        ...invoicePlan,
        operation: 'group',
        filters: { period: { type: 'month', month: 1, year: 2026 } },
        groupBy: ['card']
    };
    const personal = await executeFinancialQueryPlanFromReadModel(
        groupPlan,
        'total_faturas_por_cartao',
        { mes: 1, ano: 2026 },
        { userId: 'user-read-a' }
    );
    assert.deepStrictEqual(personal.results.map(item => item.cartao), ['Cartão Nubank - Daniel']);

    const family = await executeFinancialQueryPlanFromReadModel(
        groupPlan,
        'total_faturas_por_cartao',
        { mes: 1, ano: 2026 },
        { userId: 'user-read-a', resolvedScope: resolvedScope('family', ['user-read-a', 'user-read-b']) }
    );
    assert.deepStrictEqual(family.results.map(item => [item.cartao, item.total]), [
        ['Cartão Nubank - Daniel', 1100],
        ['Cartão Nubank - Outro', 999]
    ]);
});

test('sqlite read-model feeds Packet 03 income plans into Query Engine with scoped users', async () => {
    syncControlledSnapshot();

    const basePlan = {
        kind: 'financial_query',
        domain: 'income',
        operation: 'sum',
        filters: { period: { type: 'month', month: 1, year: 2026 } },
        groupBy: [],
        sort: { by: 'value', direction: 'desc' },
        limit: 10,
        timeBasis: 'transaction_date',
        needsContext: false,
        answerStyle: 'short'
    };

    const personal = await executeFinancialQueryPlanFromReadModel(
        basePlan,
        'total_entradas_mes',
        { mes: 1, ano: 2026 },
        { userId: 'user-read-a' }
    );
    assert.strictEqual(personal.source, 'sqlite_query_engine');
    assert.strictEqual(personal.results, 1250);
    assert.strictEqual(personal.details.totalLancamentos, 2);

    const salary = await executeFinancialQueryPlanFromReadModel(
        { ...basePlan, filters: { ...basePlan.filters, category: 'salario' } },
        'total_entradas_categoria_mes',
        { mes: 1, ano: 2026, categoria: 'salario' },
        { userId: 'user-read-a' }
    );
    assert.strictEqual(salary.source, 'sqlite_query_engine');
    assert.strictEqual(salary.results, 1000);
    assert.strictEqual(salary.details.totalEntradas, 1250);

    const ranking = await executeFinancialQueryPlanFromReadModel(
        { ...basePlan, operation: 'rank', groupBy: ['category'] },
        'ranking_fontes_entradas',
        { mes: 1, ano: 2026 },
        { userId: 'user-read-a' }
    );
    assert.deepStrictEqual(ranking.results.map(item => [item.label, item.total, item.count]), [
        ['Salário', 1000, 1],
        ['Renda Extra', 250, 1]
    ]);

    const family = await executeFinancialQueryPlanFromReadModel(
        basePlan,
        'total_entradas_mes',
        { mes: 1, ano: 2026 },
        { userId: 'user-read-a', resolvedScope: resolvedScope('family', ['user-read-a', 'user-read-b']) }
    );
    assert.strictEqual(family.source, 'sqlite_query_engine');
    assert.strictEqual(family.results, 6250);
});

test('sqlite read-model feeds Packet 04 transfer plans into Query Engine with scoped users', async () => {
    syncControlledSnapshot();

    const basePlan = {
        kind: 'financial_query',
        domain: 'transfers',
        operation: 'sum',
        filters: { period: { type: 'month', month: 1, year: 2026 } },
        groupBy: [],
        sort: { by: 'value', direction: 'desc' },
        limit: 10,
        timeBasis: 'transaction_date',
        needsContext: false,
        answerStyle: 'short'
    };

    const applied = await executeFinancialQueryPlanFromReadModel(
        { ...basePlan, filters: { ...basePlan.filters, category: 'reserve_applied' } },
        'total_reserva_aplicada_mes',
        { mes: 1, ano: 2026 },
        { userId: 'user-read-a' }
    );
    assert.strictEqual(applied.source, 'sqlite_query_engine');
    assert.strictEqual(applied.results, 300);

    const redeemed = await executeFinancialQueryPlanFromReadModel(
        { ...basePlan, filters: { ...basePlan.filters, category: 'reserve_redeemed' } },
        'total_reserva_resgatada_mes',
        { mes: 1, ano: 2026 },
        { userId: 'user-read-a' }
    );
    assert.strictEqual(redeemed.results, 100);

    const invoice = await executeFinancialQueryPlanFromReadModel(
        { ...basePlan, filters: { ...basePlan.filters, category: 'invoice_payment' } },
        'total_pagamentos_fatura_mes',
        { mes: 1, ano: 2026 },
        { userId: 'user-read-a' }
    );
    assert.strictEqual(invoice.results, 700);

    const own = await executeFinancialQueryPlanFromReadModel(
        { ...basePlan, filters: { ...basePlan.filters, category: 'own_transfer' } },
        'total_transferencias_contas_mes',
        { mes: 1, ano: 2026 },
        { userId: 'user-read-a' }
    );
    assert.strictEqual(own.results, 75);

    const familyTransfer = await executeFinancialQueryPlanFromReadModel(
        { ...basePlan, operation: 'explain', filters: { ...basePlan.filters, category: 'family_transfer', member: 'thais' }, answerStyle: 'audit' },
        'transferencia_familiar_eh_gasto',
        { mes: 1, ano: 2026, member: 'thais' },
        { userId: 'user-read-a' }
    );
    assert.strictEqual(familyTransfer.results.isExpense, false);
    assert.strictEqual(familyTransfer.results.total, 150);

    const availability = await executeFinancialQueryPlanFromReadModel(
        { ...basePlan, operation: 'explain', filters: { ...basePlan.filters, category: 'availability' }, answerStyle: 'audit' },
        'saldo_disponivel_estimado',
        { mes: 1, ano: 2026 },
        { userId: 'user-read-a' }
    );
    assert.strictEqual(availability.results, -150);
    assert.strictEqual(availability.details.saldo, 50);
    assert.strictEqual(availability.details.reservaLiquida, 200);

    const outsider = await executeFinancialQueryPlanFromReadModel(
        { ...basePlan, filters: { ...basePlan.filters, category: 'reserve_applied' } },
        'total_reserva_aplicada_mes',
        { mes: 1, ano: 2026 },
        { userId: 'user-read-b' }
    );
    assert.strictEqual(outsider.results, 9999);

    const authorizedFamily = await executeFinancialQueryPlanFromReadModel(
        { ...basePlan, filters: { ...basePlan.filters, category: 'reserve_applied' } },
        'total_reserva_aplicada_mes',
        { mes: 1, ano: 2026 },
        { userId: 'user-read-a', resolvedScope: resolvedScope('family', ['user-read-a', 'user-read-b']) }
    );
    assert.strictEqual(authorizedFamily.results, 10299);
});

test('sqlite read-model feeds Packet 05 budget plans into Query Engine with scoped users', async () => {
    syncControlledSnapshot();

    const plan = {
        kind: 'financial_query',
        domain: 'budget',
        operation: 'forecast',
        filters: { period: { type: 'cycle', label: 'ciclo atual' }, scope: 'family' },
        groupBy: [],
        sort: { by: 'value', direction: 'desc' },
        limit: 10,
        timeBasis: 'budget_cycle',
        needsContext: false,
        answerStyle: 'detailed'
    };

    const personal = await executeFinancialQueryPlanFromReadModel(
        { ...plan, filters: { ...plan.filters, scope: 'personal' } },
        'orcamento_usado_ciclo',
        { currentDate: '15/02/2026' },
        { userId: 'user-read-a' }
    );
    assert.strictEqual(personal.source, 'sqlite_query_engine');
    assert.strictEqual(personal.results.active, false);
    assert.strictEqual(personal.results.cycleSpent, 0);
    assert.strictEqual(personal.results.todaySpent, 0);
    assert.strictEqual(personal.results.period, null);
    assert.strictEqual(personal.results.scope, 'personal');

    const family = await executeFinancialQueryPlanFromReadModel(
        plan,
        'orcamento_usado_ciclo',
        { currentDate: '15/02/2026' },
        { userId: 'user-read-a', resolvedScope: resolvedScope('family', ['user-read-a', 'user-read-b']) }
    );
    assert.strictEqual(family.results.cycleSpent, 3198);
    assert.strictEqual(family.results.scope, 'family');

    const familyFromMember = await executeFinancialQueryPlanFromReadModel(
        plan,
        'orcamento_usado_ciclo',
        { currentDate: '15/02/2026' },
        { userId: 'user-read-b', resolvedScope: resolvedScope('family', ['user-read-a', 'user-read-b']) }
    );
    assert.strictEqual(familyFromMember.results.monthlyAmount, 1000);
    assert.strictEqual(familyFromMember.results.cycleSpent, 3198);
    assert.strictEqual(familyFromMember.results.scope, 'family');

    const implicitFamilyFromMember = await executeFinancialQueryPlanFromReadModel(
        { ...plan, filters: { period: { type: 'cycle', label: 'ciclo atual' } } },
        'orcamento_usado_ciclo',
        { currentDate: '15/02/2026' },
        { userId: 'user-read-b', resolvedScope: resolvedScope('family', ['user-read-a', 'user-read-b']) }
    );
    assert.strictEqual(implicitFamilyFromMember.results.monthlyAmount, 1000);
    assert.strictEqual(implicitFamilyFromMember.results.scope, 'family');

    const outsider = await executeFinancialQueryPlanFromReadModel(
        { ...plan, filters: { ...plan.filters, scope: 'personal' } },
        'orcamento_usado_ciclo',
        { currentDate: '15/02/2026' },
        { userId: 'user-read-b' }
    );
    assert.strictEqual(outsider.results.monthlyAmount, 500);
    assert.strictEqual(outsider.results.cycleSpent, 1998);
});

test('sqlite Query Engine source filters period in SQL before large histories', async () => {
    assert.strictEqual(ensureSqliteReady(), true, 'SQLite should be available for read-model tests');
    const recentRows = Array.from({ length: 1105 }, (_, index) => ({
        user_id: 'heavy-user',
        source: 'Cartão Recente',
        card_id: 'recent-card',
        cartao: 'Cartão Recente',
        data: `01/12/2027`,
        descricao: `compra recente ${index}`,
        categoria: 'Outros',
        subcategoria: 'Cartão de Crédito',
        valor: 1,
        parcela: '1/1',
        month: 11,
        year: 2027
    }));
    const synced = syncSnapshotToSqlite({
        saidas: [],
        cartoes: [
            ...recentRows,
            {
                user_id: 'heavy-user',
                source: 'Cartão Antigo',
                card_id: 'old-card',
                cartao: 'Cartão Antigo',
                data: '10/02/2026',
                descricao: 'compra antiga alvo',
                categoria: 'Compras',
                subcategoria: 'Cartão de Crédito',
                valor: 432,
                parcela: '1/1',
                month: 1,
                year: 2026
            }
        ],
        entradas: [],
        metas: [],
        dividas: []
    });
    assert.strictEqual(synced, true);

    const result = await executeFinancialQueryPlanFromReadModel(
        {
            kind: 'financial_query',
            domain: 'cards',
            operation: 'sum',
            filters: { period: { type: 'month', month: 1, year: 2026 }, card: 'old-card' },
            groupBy: [],
            sort: { by: 'value', direction: 'desc' },
            limit: 10,
            timeBasis: 'billing_month',
            needsContext: false,
            answerStyle: 'short'
        },
        'total_fatura_cartao',
        { cartao: 'old-card', mes: 1, ano: 2026 },
        { userId: 'heavy-user' }
    );

    assert.strictEqual(result.source, 'sqlite_query_engine');
    assert.strictEqual(result.results, 432);
});

test('sqlite Query Engine source respects authorized family scope without leaking by default', async () => {
    syncControlledSnapshot();

    const plan = {
        kind: 'financial_query',
        domain: 'expenses',
        operation: 'sum',
        filters: { period: { type: 'month', month: 1, year: 2026 } },
        groupBy: [],
        sort: { by: 'value', direction: 'desc' },
        limit: 10,
        timeBasis: 'billing_month',
        needsContext: false,
        answerStyle: 'short'
    };

    const personal = await executeFinancialQueryPlanFromReadModel(
        plan,
        'total_gastos_mes',
        { mes: 1, ano: 2026 },
        { userId: 'user-read-a' }
    );
    assert.strictEqual(personal.results, 1200);

    const family = await executeFinancialQueryPlanFromReadModel(
        plan,
        'total_gastos_mes',
        { mes: 1, ano: 2026 },
        { userId: 'user-read-a', resolvedScope: resolvedScope('family', ['user-read-a', 'user-read-b']) }
    );
    assert.strictEqual(family.results, 3198);
    assert.strictEqual(family.source, 'sqlite_query_engine');
});

test('Packet 09 SQLite scope uses only the resolved scope and ignores untrusted userIds promotion', async () => {
    syncControlledSnapshot();
    const plan = {
        kind: 'financial_query',
        domain: 'expenses',
        operation: 'sum',
        filters: { period: { type: 'month', month: 1, year: 2026 }, scope: 'family' },
        groupBy: [],
        sort: { by: 'value', direction: 'desc' },
        limit: 10,
        timeBasis: 'billing_month',
        needsContext: false,
        answerStyle: 'short'
    };

    const attemptedPromotion = await executeFinancialQueryPlanFromReadModel(
        plan,
        'total_gastos_mes',
        { mes: 1, ano: 2026 },
        { userId: 'user-read-a', userIds: ['user-read-a', 'user-read-b'] }
    );
    assert.strictEqual(attemptedPromotion.results, 1200);

    const authorizedFamily = await executeFinancialQueryPlanFromReadModel(
        plan,
        'total_gastos_mes',
        { mes: 1, ano: 2026 },
        { userId: 'user-read-a', resolvedScope: resolvedScope('family', ['user-read-a', 'user-read-b']) }
    );
    assert.strictEqual(authorizedFamily.results, 3198);
    assert.doesNotMatch(JSON.stringify(authorizedFamily), /user-read-a|user-read-b/);
});

test('sqlite Query Engine serves goal progress and auditable movements with family visibility rules', async () => {
    syncControlledSnapshot();

    const history = await executeFinancialQueryPlanFromReadModel(
        {
            kind: 'financial_query',
            domain: 'goals',
            operation: 'list',
            filters: { goal: 'Reserva', source: 'movements' },
            timeBasis: 'transaction_date',
            answerStyle: 'audit'
        },
        'historico_meta',
        { meta: 'Reserva' },
        { userId: 'user-read-a', resolvedScope: resolvedScope('family', ['user-read-a', 'user-read-b']) }
    );
    assert.strictEqual(history.source, 'sqlite_query_engine');
    assert.deepStrictEqual(history.results.map(item => item.tipo), ['Retirada', 'Aporte']);
    assert.ok(!JSON.stringify(history).includes('Meta outro'));
    assert.ok(!JSON.stringify(history).includes('user-read-a'));

    const outsider = await executeFinancialQueryPlanFromReadModel(
        {
            kind: 'financial_query',
            domain: 'goals',
            operation: 'list',
            filters: {},
            answerStyle: 'detailed'
        },
        'resumo_metas',
        {},
        { userId: 'user-read-b', userIds: ['user-read-b'] }
    );
    assert.deepStrictEqual(outsider.results.map(item => item.nome), ['Meta outro']);
});

test('sqlite read-model feeds Packet 07 debt plans into Query Engine with scoped users', async () => {
    assert.strictEqual(ensureSqliteReady(), true, 'SQLite should be available for debt read-model tests');
    assert.strictEqual(syncSnapshotToSqlite({
        dividas: [
            { user_id: 'user-debt-a', row: ['Banco', 'Banco Alfa', 'Empréstimo', 'R$2.000,00', 'R$1.200,00', 'R$200,00', '2% a.m.', 20, '01/01/2026', 10, 'Ativa', 'Daniel', '', '40%', '20/06/2026', 0, '20/12/2026'] },
            { user_id: 'user-debt-a', row: ['Sem pagamento', 'Financeira', 'Boleto', 'R$800,00', 'R$800,00', 'R$100,00', '1% a.m.', 25, '01/01/2026', 8, 'Ativa', 'Daniel', '', '0%', '25/06/2026', 0, '25/01/2027'] },
            { user_id: 'user-debt-a', row: ['Cartão caro', 'Beta Financeira', 'Cartão', 'R$1.000,00', 'R$600,00', 'R$150,00', '8% a.m.', 10, '01/01/2026', 8, 'Ativa', 'Daniel', '', '40%', '10/06/2026', 5, '10/12/2026'] },
            { user_id: 'user-debt-a', row: ['Quitada', 'Gama Crédito', 'Empréstimo', 'R$500,00', 'R$0,00', 'R$100,00', '3% a.m.', 5, '01/01/2026', 5, 'Quitada', 'Daniel', '', '100%', '05/06/2026', 0, ''] },
            { user_id: 'user-debt-b', row: ['Dívida outro', 'Banco Outro', 'Empréstimo', 'R$9.999,00', 'R$9.999,00', 'R$999,00', '10% a.m.', 20, '01/01/2026', 10, 'Ativa', 'Outro', '', '0%', '20/06/2026', 0, ''] }
        ]
    }), true);

    const basePlan = {
        kind: 'financial_query',
        domain: 'debts',
        operation: 'sum',
        filters: {},
        groupBy: [],
        sort: { by: 'value', direction: 'desc' },
        limit: 10,
        timeBasis: 'due_date',
        needsContext: false,
        answerStyle: 'short'
    };

    const personal = await executeFinancialQueryPlanFromReadModel(
        basePlan,
        'total_dividas',
        { currentDate: '15/06/2026' },
        { userId: 'user-debt-a' }
    );
    assert.strictEqual(personal.source, 'sqlite_query_engine');
    assert.strictEqual(personal.results, 2600);
    assert.strictEqual(personal.details.activeCount, 3);
    assert.strictEqual(personal.details.paidAmount, 1700);
    assert.ok(!JSON.stringify(personal).includes('user-debt-a'));
    assert.ok(!JSON.stringify(personal).includes('Dívida outro'));

    const bank = await executeFinancialQueryPlanFromReadModel(
        { ...basePlan, filters: { debt: 'banco alfa' } },
        'saldo_divida',
        { divida: 'banco alfa', currentDate: '15/06/2026' },
        { userId: 'user-debt-a' }
    );
    assert.strictEqual(bank.results, 1200);

    const interestRanking = await executeFinancialQueryPlanFromReadModel(
        { ...basePlan, operation: 'rank', sort: { by: 'interest', direction: 'desc' } },
        'ranking_dividas_juros',
        { currentDate: '15/06/2026' },
        { userId: 'user-debt-a' }
    );
    assert.deepStrictEqual(interestRanking.results.slice(0, 2).map(item => item.nome), ['Cartão caro', 'Banco']);

    const upcoming = await executeFinancialQueryPlanFromReadModel(
        {
            ...basePlan,
            operation: 'list',
            filters: { status: 'upcoming', period: { type: 'relative', days: 10 } },
            sort: { by: 'due_date', direction: 'asc' },
            answerStyle: 'detailed'
        },
        'dividas_vencendo',
        { currentDate: '15/06/2026', dias: 10 },
        { userId: 'user-debt-a' }
    );
    assert.deepStrictEqual(upcoming.results.map(item => item.nome), ['Banco', 'Sem pagamento']);

    const family = await executeFinancialQueryPlanFromReadModel(
        basePlan,
        'total_dividas',
        { currentDate: '15/06/2026' },
        { userId: 'user-debt-a', resolvedScope: resolvedScope('family', ['user-debt-a', 'user-debt-b']) }
    );
    assert.strictEqual(family.results, 12599);

    const outsider = await executeFinancialQueryPlanFromReadModel(
        basePlan,
        'total_dividas',
        { currentDate: '15/06/2026' },
        { userId: 'user-debt-b', userIds: ['user-debt-b'] }
    );
    assert.strictEqual(outsider.results, 9999);
    assert.ok(!JSON.stringify(outsider).includes('Banco Alfa'));

    const allUsers = await executeFinancialQueryPlanFromReadModel(
        basePlan,
        'total_dividas',
        { currentDate: '15/06/2026' },
        { userId: ALL_USERS_ID }
    );
    assert.strictEqual(allUsers, null);
});

test('sqlite Packet 07 reads current debt headers and keeps relative due windows across months', async () => {
    assert.strictEqual(ensureSqliteReady(), true, 'SQLite should be available for debt header tests');
    const currentHeaders = [
        'Nome da Dívida', 'Credor', 'Tipo', 'Valor Original', 'Saldo Atual', 'Valor da Parcela',
        'Taxa de Juros', 'Dia de Vencimento', 'Data de Início', 'Total de Parcelas', 'Parcelas Pagas',
        'Status', 'Observações', '% Quitado', 'Último Pagamento', 'Próximo Vencimento', 'Estratégia', 'user_id'
    ];
    assert.strictEqual(syncSnapshotToSqlite({
        dividas: [
            {
                user_id: 'user-debt-current',
                headers: currentHeaders,
                row: ['Cruza mês', 'Banco Atual', 'Empréstimo', 'R$1.000,00', 'R$800,00', 'R$100,00', '2% a.m.', 3, '01/01/2026', 10, 2, 'Em dia', 'teste', '20%', '03/06/2026', '03/07/2026', 'Avalanche', 'user-debt-current']
            },
            {
                user_id: 'user-debt-current',
                headers: currentHeaders,
                row: ['Sem próximo vencimento', 'Banco Atual', 'Empréstimo', 'R$500,00', 'R$400,00', 'R$50,00', '1% a.m.', 3, '01/01/2026', 10, 2, 'Em dia', 'teste', '20%', '03/06/2026', '', 'Avalanche', 'user-debt-current']
            }
        ]
    }), true);

    const upcoming = await executeFinancialQueryPlanFromReadModel(
        {
            kind: 'financial_query',
            domain: 'debts',
            operation: 'list',
            filters: { status: 'upcoming', period: { type: 'relative', days: 10 } },
            groupBy: [],
            sort: { by: 'due_date', direction: 'asc' },
            limit: 10,
            timeBasis: 'due_date',
            needsContext: false,
            answerStyle: 'detailed'
        },
        'dividas_vencendo',
        { currentDate: '28/06/2026', dias: 10 },
        { userId: 'user-debt-current' }
    );

    assert.deepStrictEqual(upcoming.results.map(item => [item.nome, item.status, item.proximoVencimento]), [
        ['Cruza mês', 'Em dia', '03/07/2026'],
        ['Sem próximo vencimento', 'Em dia', '03/07/2026']
    ]);
});

test('sqlite read-model powers dashboard data without cross-user leakage', () => {
    syncControlledSnapshot();

    const kpis = queryKpis('user-read-a', { month: 1, year: 2026 });
    assert.strictEqual(kpis.entradas, 1250);
    assert.strictEqual(kpis.saidas, 100);
    assert.strictEqual(kpis.cartoes, 1100);
    assert.strictEqual(kpis.saldo, 50);
    assert.strictEqual(kpis.reservaAplicada, 300);
    assert.strictEqual(kpis.reservaResgatada, 100);
    assert.strictEqual(kpis.reservaLiquida, 200);
    assert.strictEqual(kpis.saldoDisponivelEstimado, -150);
    assert.strictEqual(kpis.debtActiveCount, 1);
    assert.strictEqual(kpis.debtTotal, 1200);

    const debts = queryDebts('user-read-a');
    assert.deepStrictEqual(debts.map(item => item.name), ['Financiamento']);
    assert.strictEqual(debts[0].saldoAtual, 1200);
    assert.strictEqual(debts[0].jurosPct, 2);

    const goals = queryGoals('user-read-a');
    assert.deepStrictEqual(goals.map(item => item.name), ['Reserva', 'Viagem pausada']);
    assert.strictEqual(goals[0].target, 1000);
    assert.strictEqual(goals[0].current, 250);
    assert.strictEqual(goals[0].scope, 'family');
    assert.strictEqual(goals[1].status, 'Pausada');

    const cashflow = queryCashflow('user-read-a', { month: 1, year: 2026 });
    assert.ok(cashflow.some(day => day.date === '05/02/2026' && day.entradas === 1000));

    const recent = queryRecentTransactions('user-read-a', { month: 1, year: 2026 });
    assert.ok(recent.some(item => item.description === 'salário'));
    assert.ok(recent.some(item => item.description === 'aplicação caixinha' && item.type === 'transferencia'));
    assert.ok(recent.every(item => !String(item.description).includes('outro')));

    const alerts = queryAlerts('user-read-a', { month: 1, year: 2026 });
    assert.ok(!alerts.some(item => item.code === 'NEGATIVE_CASHFLOW'));

    const dashboard = getDashboardSqlData('user-read-a', { month: 1, year: 2026 });
    assert.strictEqual(dashboard.kpis.saldoDisponivelEstimado, -150);
    assert.match(dashboard.criteria.balance, /data da compra/i);
    assert.match(dashboard.criteria.available, /reserva/i);
    assert.match(dashboard.criteria.recentTransactions, /Transferência/i);
});

test('sqlite dashboard orders cashflow and recent transactions by real dates', () => {
    assert.strictEqual(ensureSqliteReady(), true, 'SQLite should be available for dashboard ordering tests');
    syncSnapshotToSqlite({
        entradas: [
            { user_id: 'user-order-a', data: '20/02/2026', descricao: 'salário', categoria: 'Salário', valor: 1000, month: 1, year: 2026 },
            { user_id: 'user-order-a', data: '01/02/2026', descricao: 'freela', categoria: 'Renda Extra', valor: 100, month: 1, year: 2026 }
        ],
        saidas: [
            { user_id: 'user-order-a', data: '10/02/2026', descricao: 'mercado', categoria: 'Alimentação', valor: 50, month: 1, year: 2026 }
        ],
        cartoes: [],
        transferencias: [
            { user_id: 'user-order-a', data: '05/02/2026', descricao: 'caixinha', valor: 25, origem: 'Conta', destino: 'Caixinha', status: 'Movimentação de reserva/investimento', month: 1, year: 2026 }
        ],
        metas: [],
        dividas: [],
        userSettings: []
    });

    const cashflow = queryCashflow('user-order-a', { month: 1, year: 2026 });
    assert.deepStrictEqual(cashflow.map(item => item.date), ['01/02/2026', '10/02/2026', '20/02/2026']);

    const recent = queryRecentTransactions('user-order-a', { month: 1, year: 2026 });
    assert.deepStrictEqual(recent.map(item => item.date), ['20/02/2026', '10/02/2026', '05/02/2026', '01/02/2026']);
    assert.deepStrictEqual(recent.map(item => item.typeLabel), ['Entrada', 'Saída', 'Transferência', 'Entrada']);
});

test('sqlite read-model supports explicit admin all-users dashboard scope', () => {
    syncControlledSnapshot();

    const kpis = queryKpis(ALL_USERS_ID, { month: 1, year: 2026 });
    assert.strictEqual(kpis.entradas, 6250);
    assert.strictEqual(kpis.saidas, 1099);
    assert.strictEqual(kpis.cartoes, 2099);
    assert.strictEqual(kpis.saldo, 3052);
    assert.strictEqual(kpis.debtActiveCount, 2);

    const debts = queryDebts(ALL_USERS_ID);
    assert.deepStrictEqual(debts.map(item => item.name), ['Dívida outro', 'Financiamento']);

    const recent = queryRecentTransactions(ALL_USERS_ID, { month: 1, year: 2026 });
    assert.ok(recent.some(item => item.description === 'outro usuario'));
    assert.ok(recent.some(item => item.description === 'salário'));
});

test('analytical read-model reports sqlite source and hit metric', async () => {
    metrics.reset();
    syncControlledSnapshot();

    const result = await executeAnalyticalIntent(
        'total_gastos_mes',
        { mes: 1, ano: 2026 },
        { userId: 'user-read-a' }
    );

    assert.strictEqual(result.source, 'sqlite');
    assert.strictEqual(result.results, 1200);

    const snapshot = metrics.getSnapshot();
    assert.strictEqual(snapshot.counters['read_model.sqlite.hit'], 1);
    assert.strictEqual(snapshot.counters['read_model.sqlite.miss'] || 0, 0);
    metrics.reset();
});
