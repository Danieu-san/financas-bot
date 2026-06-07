const test = require('node:test');
const assert = require('node:assert');

const { buildHealthSummary } = require('../src/services/financialHealthService');
const { buildDebtAvalanchePlan } = require('../src/services/debtAvalancheService');
const { executeFinancialQuery } = require('../src/query/financialQueryEngine');

test('financial health summary explains cash risk and emergency reserve inputs', () => {
    const user = { user_id: 'user-explain-a' };
    const health = buildHealthSummary({
        user,
        aliases: ['Daniel'],
        profile: { fixed_expense_estimate: 600 },
        now: new Date('2026-05-20T12:00:00.000Z'),
        saidasData: [
            ['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Responsável', 'Pagamento', 'Recorrente', 'Obs', 'user_id'],
            ['10/05/2026', 'mercado', 'Alimentação', 'Supermercado', 300, 'Daniel', 'PIX', 'Não', '', user.user_id]
        ],
        entradasData: [
            ['Data', 'Descrição', 'Categoria', 'Valor', 'Responsável', 'Recebimento', 'Recorrente', 'Obs', 'user_id'],
            ['05/05/2026', 'salário', 'Salário', 1000, 'Daniel', 'PIX', 'Sim', '', user.user_id]
        ],
        dividasData: [
            ['Nome', 'Credor', 'Tipo', 'Valor Original', 'Saldo Atual', 'Parcela', 'Taxa', 'Vencimento', 'Inicio', 'Total', 'Status', 'Responsável', 'Obs', '%', 'Proximo', 'Atraso', 'Quitacao', 'user_id'],
            ['Cartão', 'Banco', 'Cartão', 2000, 1200, 250, '3% a.m.', 10, '01/01/2026', 10, 'Ativa', 'Daniel', '', '', '25/05/2026', 0, '', user.user_id]
        ],
        metasData: [
            ['Nome', 'Valor Alvo', 'Valor Atual', '% Progresso', 'Prazo', 'Prioridade', 'Status', 'Obs', 'user_id'],
            ['Reserva de emergência', 5000, 700, '14%', '', 'Alta', 'Ativa', '', user.user_id]
        ],
        creditCardData: [
            [
                ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'user_id'],
                ['12/05/2026', 'farmácia', 'Saúde', 120, '1/1', 'Maio de 2026', user.user_id]
            ]
        ]
    });

    assert.ok(health.riskExplanation.includes('queima diária estimada'));
    assert.ok(health.riskExplanation.includes('parcela(s) de dívida'));
    assert.ok(health.reserveExplanation.includes('Alvo de 3 meses'));
    assert.strictEqual(health.riskInputs.upcomingDebtCount, 1);
    assert.ok(health.estimatedDailyBurn > 0);
});

test('debt avalanche plan explains selected inputs and priority debt', () => {
    const plan = buildDebtAvalanchePlan({
        extraBudget: 100,
        debts: [
            { name: 'Financiamento', balance: 5000, minPayment: 300, monthlyRatePct: 1.5 },
            { name: 'Cartão', balance: 1200, minPayment: 250, monthlyRatePct: 8 }
        ]
    });

    assert.ok(plan);
    assert.strictEqual(plan.inputs.debtCount, 2);
    assert.strictEqual(plan.inputs.highestRateDebt.name, 'Cartão');
    assert.ok(plan.explanation.includes('Cartão'));
    assert.ok(plan.explanation.includes('maior taxa'));
});

test('debt Query Engine recommendation is auditable, read-only, and redacts internal ids', async () => {
    const result = await executeFinancialQuery(
        {
            kind: 'financial_query',
            domain: 'debts',
            operation: 'recommend',
            filters: {},
            groupBy: [],
            sort: { by: 'interest', direction: 'desc' },
            limit: 10,
            timeBasis: 'due_date',
            needsContext: false,
            answerStyle: 'audit'
        },
        {
            currentDate: '15/06/2026',
            scopeUserIds: ['user-explain-a'],
            dividas: [
                ['Nome', 'Credor', 'Tipo', 'Valor Original', 'Saldo Atual', 'Parcela', 'Juros', 'Vencimento', 'Início', 'Total Parcelas', 'Status', 'Responsável', 'Observações', '% Quitado', 'Próximo Vencimento', 'Atraso (Dias)', 'Data Prevista para Quitação', 'user_id'],
                ['Banco', 'Banco Alfa', 'Empréstimo', 2000, 1200, 200, '2% a.m.', 20, '01/01/2026', 10, 'Ativa', 'Daniel', '', '40%', '20/06/2026', 0, '', 'user-explain-a'],
                ['Cartão caro', 'Beta Financeira', 'Cartão', 1000, 600, 150, '8% a.m.', 10, '01/01/2026', 8, 'Ativa', 'Daniel', '', '40%', '10/06/2026', 5, '', 'user-explain-a'],
                ['Outro usuário', 'Credor externo', 'Empréstimo', 9999, 9999, 999, '20% a.m.', 10, '01/01/2026', 10, 'Ativa', 'Outro', '', '0%', '10/06/2026', 5, '', 'user-explain-b']
            ]
        }
    );

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.value.item.description, 'Cartão caro');
    assert.match(result.result.value.criteria, /critério/i);
    assert.match(result.result.value.criteria, /atraso/i);
    assert.match(result.result.value.criteria, /juros/i);
    assert.match(result.result.value.disclaimer, /não é garantia financeira/i);
    assert.ok(!JSON.stringify(result.result.value).includes('user-explain-a'));
    assert.ok(!JSON.stringify(result.result.value).includes('user-explain-b'));
    assert.ok(!JSON.stringify(result.result.value).includes('Outro usuário'));
});
