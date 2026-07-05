const test = require('node:test');
const assert = require('node:assert');

const { projectLegacyRowsToCanonicalLedger } = require('../src/ledger/canonicalLedgerProjector');
const financialQueryEngine = require('../src/query/financialQueryEngine');
const userSheetAnalyticsService = require('../src/services/userSheetAnalyticsService');
const { buildInstallmentReadSmoke } = require('../scripts/runCanonicalInstallmentReadSmoke');

function queryPlan(month, year) {
    return {
        kind: 'financial_query',
        domain: 'cards',
        operation: 'forecast',
        filters: { period: { type: 'month', month, year } },
        groupBy: ['month'],
        sort: { by: 'date', direction: 'asc' },
        limit: 20,
        timeBasis: 'billing_month',
        needsContext: false,
        answerStyle: 'detailed'
    };
}

test('Phase 3E keeps canonical invoices, WhatsApp forecast and dashboard commitments in monthly parity', async () => {
    const header = ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'card_id', 'Cartão', 'Obs', 'user_id'];
    const rows = [
        ['20/05/2026', 'Notebook idêntico', 'Eletrônicos', '500,00', '1/2', 'Junho de 2026', 'card-a', 'Cartão A', '', 'daniel'],
        ['20/05/2026', 'Notebook idêntico', 'Eletrônicos', '500,00', '2/2', 'Julho de 2026', 'card-a', 'Cartão A', '', 'daniel'],
        ['20/05/2026', 'Notebook idêntico', 'Eletrônicos', '500,00', '1/2', 'Junho de 2026', 'card-a', 'Cartão A', '', 'daniel'],
        ['20/05/2026', 'Notebook idêntico', 'Eletrônicos', '500,00', '2/2', 'Julho de 2026', 'card-a', 'Cartão A', '', 'daniel']
    ];
    const projected = projectLegacyRowsToCanonicalLedger({
        householdId: 'household-family',
        legacyRows: {
            contas: [], saidas: [], entradas: [], transferencias: [], dividas: [],
            pagamentosDividas: [], metas: [], movimentacoesMetas: [], importedTransactions: [],
            lancamentosCartao: rows.map((row, index) => ({
                source_row_id: `card-row-${index + 1}`,
                data: row[0], descricao: row[1], categoria: row[2], valor_parcela: row[3],
                parcela: row[4], mes_cobranca: row[5], card_id: row[6], cartao: row[7], user_id: row[9]
            }))
        },
        people: []
    });
    const forecast = await financialQueryEngine.executeFinancialQuery(queryPlan(5, 2026), {
        cartoes: [[header, ...rows]]
    });
    const dashboardMonthlyTotal = month => userSheetAnalyticsService.__test__.buildDailyGoalSummary({
        settings: {
            monthly_budget_enabled: 'Sim',
            monthly_budget_amount: '5000',
            monthly_budget_scope: 'family',
            monthly_budget_cycle_start_day: '1'
        },
        saidasRows: [['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Responsável', 'Pagamento', 'Recorrente', 'Obs', 'user_id']],
        cartaoRows: [header, ...rows],
        cardConfigRows: [
            ['ID', 'Nome', 'Fechamento', 'Responsável', 'Dia de Vencimento', 'Ativo'],
            ['card-a', 'Cartão A', '25', 'Daniel', '10', 'Sim']
        ],
        accountRows: [],
        userIds: ['daniel'],
        period: { month, year: 2026 }
    }).monthSpent;
    assert.strictEqual(projected.events.filter(event => event.kind === 'card_purchase').length, 2);
    assert.strictEqual(projected.schedules.filter(schedule => schedule.schedule_type === 'card_installment').length, 2);
    assert.deepStrictEqual(projected.invoices.map(invoice => [invoice.competence_month, invoice.observed_item_total_cents]), [
        ['2026-06', 100000],
        ['2026-07', 100000]
    ]);
    assert.strictEqual(forecast.result.value.total, 2000);
    assert.deepStrictEqual(forecast.result.value.groups.map(item => [item.label, item.total]), [
        ['Junho de 2026', 1000],
        ['Julho de 2026', 1000]
    ]);
    assert.strictEqual(dashboardMonthlyTotal(5), 1000);
    assert.strictEqual(dashboardMonthlyTotal(6), 1000);
});

test('Phase 3E read-only smoke reports aggregate parity without exposing card rows', () => {
    assert.strictEqual(buildInstallmentReadSmoke([]).ok, false);
    const report = buildInstallmentReadSmoke([
        ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'card_id', 'Cartão', 'Obs', 'user_id'],
        ['20/05/2026', 'Segredo financeiro', 'Eletrônicos', '500,00', '1/2', 'Junho de 2026', 'card-a', 'Cartão A', '', 'daniel'],
        ['20/05/2026', 'Segredo financeiro', 'Eletrônicos', '500,00', '2/2', 'Julho de 2026', 'card-a', 'Cartão A', '', 'daniel']
    ]);

    assert.strictEqual(report.ok, true);
    assert.strictEqual(report.scheduleCount, 1);
    assert.strictEqual(report.uncertainCount, 0);
    assert.deepStrictEqual(report.monthTotals, [
        { competenceMonth: '2026-06', sheetCents: 50000, canonicalCents: 50000 },
        { competenceMonth: '2026-07', sheetCents: 50000, canonicalCents: 50000 }
    ]);
    assert.doesNotMatch(JSON.stringify(report), /Segredo financeiro|daniel|Cartão A/);

    const multiCardReport = buildInstallmentReadSmoke([
        ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'card_id', 'Cartão', 'Obs', 'user_id'],
        ['20/05/2026', 'Compra A', 'Casa', '10,00', '1/1', 'Junho de 2026', 'card-a', 'Cartão A', '', 'daniel'],
        ['20/05/2026', 'Compra B', 'Casa', '20,00', '1/1', 'Junho de 2026', 'card-b', 'Cartão B', '', 'daniel'],
        ['20/05/2026', 'Compra C', 'Casa', '30,00', '1/2', 'Junho de 2026', 'card-b', 'Cartão B', '', 'daniel'],
        ['20/05/2026', 'Compra C', 'Casa', '30,00', '2/2', 'Julho de 2026', 'card-b', 'Cartão B', '', 'daniel']
    ]);

    assert.strictEqual(multiCardReport.ok, true);
    assert.deepStrictEqual(multiCardReport.monthTotals, [
        { competenceMonth: '2026-06', sheetCents: 6000, canonicalCents: 6000 },
        { competenceMonth: '2026-07', sheetCents: 3000, canonicalCents: 3000 }
    ]);
});
