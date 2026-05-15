const test = require('node:test');
const assert = require('node:assert');

const { buildHealthSummary } = require('../src/services/financialHealthService');
const { buildDebtAvalanchePlan } = require('../src/services/debtAvalancheService');

test('financial health summary explains cash risk and emergency reserve inputs', () => {
    const user = { user_id: 'user-explain-a' };
    const health = buildHealthSummary({
        user,
        aliases: ['Daniel'],
        profile: { fixed_expense_estimate: 600 },
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
