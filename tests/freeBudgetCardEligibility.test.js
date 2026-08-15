const test = require('node:test');
const assert = require('node:assert');

const financialQueryEngine = require('../src/query/financialQueryEngine');
const userSheetAnalyticsService = require('../src/services/userSheetAnalyticsService');
const { getBudgetCycleForReportingPeriod } = require('../src/utils/budgetCycle');
const { isCategoryBudgetExpense, isFreeBudgetExpense } = require('../src/utils/freeBudgetEligibility');

const MONTH_NAMES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

function currentSaoPaulo() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date()).reduce((result, part) => {
        result[part.type] = part.value;
        return result;
    }, {});
    const year = Number(parts.year);
    const month = Number(parts.month) - 1;
    const day = Number(parts.day);
    return {
        year,
        month,
        day,
        br: `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`,
        billing: `${MONTH_NAMES[month]} de ${year}`
    };
}

function accountRows(today) {
    return [
        ['Nome da Conta', 'Dia do Vencimento', 'Observações', 'user_id', 'Nome Amigável', 'Categoria', 'Subcategoria', 'Valor Esperado', 'Regra Ativa'],
        ['Spotify', String(today.day), '', 'user-1', 'Spotify', 'Assinaturas', 'Streaming', '50', 'SIM']
    ];
}

function cardRows(today) {
    return [
        ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'card_id', 'Cartão', 'Observações', 'user_id'],
        [today.br, 'Spotify', 'Assinaturas', 50, '1/1', today.billing, 'card-1', 'Nubank', '', 'user-1'],
        [today.br, 'Supermercado Guanabara', 'Alimentação', 120, '1/1', today.billing, 'card-1', 'Nubank', 'SUPERMERCADO', 'user-1'],
        [today.br, 'Restaurante livre', 'Alimentação', 20, '1/1', today.billing, 'card-1', 'Nubank', '', 'user-1']
    ];
}

function cardConfig(today) {
    return [
        ['card_id', 'Nome', 'Banco', 'Dia de Fechamento', 'Dia de Vencimento', 'Ativo', 'Observações'],
        ['card-1', 'Nubank', 'Nubank', '1', String(today.day), 'SIM', '']
    ];
}

test('monthly grocery is essential while restaurant and Mercado Livre stay flexible', () => {
    assert.strictEqual(isFreeBudgetExpense({
        description: 'Supermercado Guanabara', category: 'Alimentação', subcategory: 'SUPERMERCADO'
    }), false);
    assert.strictEqual(isFreeBudgetExpense({
        description: 'Restaurante', category: 'Alimentação', subcategory: 'RESTAURANTE'
    }), true);
    assert.strictEqual(isFreeBudgetExpense({
        description: 'Mercado Livre', category: 'Compras', subcategory: 'COMPRAS ONLINE'
    }), true);
    for (const expense of [
        { description: 'Posto', category: 'Transporte', subcategory: 'COMBUSTÍVEL' },
        { description: 'Uber', category: 'Transporte', subcategory: 'UBER / 99' },
        { description: 'Farmácia', category: 'Saúde', subcategory: 'FARMÁCIA' },
        { description: 'Curso', category: 'Educação', subcategory: 'CURSOS' },
        { description: 'Aluguel', category: 'Moradia', subcategory: 'ALUGUEL' },
        { description: 'Sem classificação', category: 'Outros', subcategory: '' }
    ]) assert.strictEqual(isFreeBudgetExpense(expense), false);
    for (const expense of [
        { description: 'Cinema', category: 'Lazer' },
        { description: 'Presente', category: 'Presentes' },
        { description: 'Roupa', category: 'Vestuário' },
        { description: 'Cabeleireiro', category: 'Cuidados Pessoais' },
        { description: 'Item para casa', category: 'Compras' },
        { description: 'Ifood', category: 'Alimentação', subcategory: 'DELIVERY / IFOOD' }
    ]) assert.strictEqual(isFreeBudgetExpense(expense), true);
});

test('essential consumption remains eligible for its own category budget', () => {
    for (const expense of [
        { description: 'Supermercado', category: 'Alimentação', subcategory: 'SUPERMERCADO' },
        { description: 'Posto', category: 'Transporte', subcategory: 'COMBUSTÍVEL' },
        { description: 'Farmácia', category: 'Saúde', subcategory: 'FARMÁCIA' },
        { description: 'Curso', category: 'Educação', subcategory: 'CURSOS' },
        { description: 'Aluguel', category: 'Moradia', subcategory: 'ALUGUEL' }
    ]) assert.strictEqual(isCategoryBudgetExpense(expense), true);
    for (const expense of [
        { description: 'Caixinha', category: 'Transferências' },
        { description: 'Aluguel recorrente', category: 'Moradia', recurrence: 'Sim' }
    ]) assert.strictEqual(isCategoryBudgetExpense(expense), false);
});

test('current reporting month resolves the active salary cycle instead of the future cycle', () => {
    const current = getBudgetCycleForReportingPeriod(
        { month: 7, year: 2026 },
        28,
        { day: 15, month: 7, year: 2026 }
    );
    assert.deepStrictEqual([current.startLabel, current.endLabel, current.isCurrent], [
        '28/07/2026',
        '27/08/2026',
        true
    ]);

    const historical = getBudgetCycleForReportingPeriod(
        { month: 6, year: 2026 },
        28,
        { day: 15, month: 7, year: 2026 }
    );
    assert.deepStrictEqual([historical.startLabel, historical.endLabel, historical.isCurrent], [
        '28/06/2026',
        '27/07/2026',
        false
    ]);
});

test('dashboard monthly free budget excludes registered bills paid by card', () => {
    const today = currentSaoPaulo();
    const summary = userSheetAnalyticsService.__test__.buildDailyGoalSummary({
        settings: {
            monthly_budget_enabled: 'SIM',
            monthly_budget_amount: '938.11',
            monthly_budget_scope: 'personal',
            monthly_budget_cycle_start_day: '28'
        },
        userIds: ['user-1'],
        period: { month: today.month, year: today.year },
        saidasRows: [['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Responsável', 'Pagamento', 'Recorrente', 'Obs', 'user_id']],
        cartaoRows: cardRows(today),
        cardConfigRows: cardConfig(today),
        accountRows: accountRows(today)
    });

    assert.strictEqual(summary.monthSpent, 20);
    assert.strictEqual(summary.spent, 20);
});

test('family dashboard excludes a registered bill paid on the other family member card', () => {
    const today = currentSaoPaulo();
    const familyCards = cardRows(today).map((row, index) => {
        if (index === 0) return row;
        return [...row.slice(0, 9), 'user-2'];
    });
    const summary = userSheetAnalyticsService.__test__.buildDailyGoalSummary({
        settings: {
            monthly_budget_enabled: 'SIM',
            monthly_budget_amount: '938.11',
            monthly_budget_scope: 'family',
            monthly_budget_cycle_start_day: '28'
        },
        userIds: ['user-1', 'user-2'],
        period: { month: today.month, year: today.year },
        saidasRows: [['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Responsável', 'Pagamento', 'Recorrente', 'Obs', 'user_id']],
        cartaoRows: familyCards,
        cardConfigRows: cardConfig(today),
        accountRows: accountRows(today)
    });

    assert.strictEqual(summary.monthSpent, 20);
    assert.strictEqual(summary.spent, 20);
});

test('financial query monthly free budget excludes registered bills paid by card', async () => {
    const today = currentSaoPaulo();
    const result = await financialQueryEngine.executeFinancialQuery({
        kind: 'financial_query',
        domain: 'budget',
        operation: 'detail',
        filters: { period: { type: 'month', month: today.month, year: today.year }, scope: 'personal' },
        timeBasis: 'budget_cycle',
        groupBy: [],
        sort: { by: 'date', direction: 'desc' },
        limit: 10,
        answerStyle: 'detailed'
    }, {
        currentDate: today.br,
        scopeUserIds: ['user-1'],
        userSettings: [
            ['user_id', 'monthly_budget_enabled', 'monthly_budget_amount', 'monthly_budget_scope', 'monthly_budget_cycle_start_day'],
            ['user-1', 'SIM', '938.11', 'personal', '28']
        ],
        saidas: [['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Responsável', 'Pagamento', 'Recorrente', 'Obs', 'user_id']],
        cartoes: [cardRows(today)],
        cartoesConfig: cardConfig(today),
        contas: accountRows(today)
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.value.cycleSpent, 20);
    assert.strictEqual(result.result.value.totals.cards, 20);
});
