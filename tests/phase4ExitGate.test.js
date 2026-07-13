const test = require('node:test');
const assert = require('node:assert');

const { buildDashboardV2Summary } = require('../src/services/dashboardV2SummaryService');
const {
    decorateDashboardSummary,
    buildDashboardWhatsAppSummary
} = require('../src/services/dashboardSummaryService');

function sheetsSnapshotFixture() {
    return {
        period: { month: 6, year: 2026, label: 'Julho de 2026' },
        scope: { mode: 'personal', label: 'Pessoal', members: [] },
        source: 'personal_sheet',
        kpis: {
            entradas: 1000,
            saidas: 300,
            cartoes: 100,
            saldo: 600,
            reservaAplicada: 200,
            reservaResgatada: 50,
            reservaLiquida: 150,
            saldoDisponivelEstimado: 450
        },
        topCategories: [{ category: 'Alimentacao', value: 250 }],
        dailyFlow: [{ date: '10/07/2026', entradas: 1000, saidas: 400, saldo: 600 }],
        recentTransactions: [{ date: '10/07/2026', description: 'Mercado', value: 250, type: 'saida' }],
        goals: [],
        debts: [],
        financialAccounts: {
            totalBalance: 1527.77,
            items: [{ name: 'Conta principal', balance: 1527.77 }]
        }
    };
}

test('phase 4 exit gate keeps Sheets, ledger, current dashboard, v2 and WhatsApp in parity', async () => {
    const sheetsSnapshot = sheetsSnapshotFixture();
    const currentDashboard = decorateDashboardSummary(sheetsSnapshot);
    const ledgerAnswers = {
        realizedExpenses: sheetsSnapshot.kpis.saidas + sheetsSnapshot.kpis.cartoes,
        accountBalance: sheetsSnapshot.financialAccounts.totalBalance,
        budgetRemaining: 600,
        forecastPayable: 250
    };
    const observedLedgerDomains = [];
    const queryTool = async ({ plan }) => {
        observedLedgerDomains.push(`${plan.domain}:${plan.operation}`);
        if (plan.domain === 'expenses' && plan.operation === 'sum') {
            return { ok: true, source: 'sqlite_query_engine', result: { value: ledgerAnswers.realizedExpenses } };
        }
        if (plan.domain === 'expenses' && plan.operation === 'rank') {
            return { ok: true, source: 'sqlite_query_engine', result: { value: [{ category: 'Alimentacao', total: 250 }] } };
        }
        if (plan.domain === 'budget') {
            return { ok: true, source: 'sqlite_query_engine', result: { value: { categoryBudget: {
                status: 'available',
                globalBudget: 1000,
                allocatedBudget: 700,
                unallocatedBudget: 300,
                overallocatedBudget: 0,
                actualBudget: ledgerAnswers.realizedExpenses,
                remainingBudget: ledgerAnswers.budgetRemaining,
                dailyPace: 40,
                categories: [{ category: 'Alimentacao', plannedAmount: 400, actualAmount: 250 }]
            } } } };
        }
        if (plan.domain === 'accounts') {
            return { ok: true, source: 'canonical', result: { value: {
                total: ledgerAnswers.accountBalance,
                count: 1,
                items: [{ name: 'Conta principal', balance: ledgerAnswers.accountBalance }]
            } } };
        }
        if (plan.domain === 'forecast') {
            return { ok: true, source: 'canonical', result: { value: {
                payable: ledgerAnswers.forecastPayable,
                receivable: 50,
                netExpectedCash: -200,
                currentCashImpact: 0,
                count: 2,
                items: []
            } } };
        }
        return { ok: false, reason: 'source_unavailable' };
    };

    const dashboardV2 = await buildDashboardV2Summary({
        snapshot: sheetsSnapshot,
        userIds: ['gate-user'],
        ownerUserId: 'gate-user',
        month: 6,
        year: 2026,
        currentDate: '2026-07-13',
        queryTool
    });
    const whatsapp = buildDashboardWhatsAppSummary(sheetsSnapshot);

    assert.strictEqual(currentDashboard.kpis.saldo, sheetsSnapshot.kpis.saldo);
    assert.strictEqual(currentDashboard.kpis.saldoDisponivelEstimado, sheetsSnapshot.kpis.saldoDisponivelEstimado);
    assert.strictEqual(dashboardV2.blocks.cash.periodEconomicBalance, currentDashboard.kpis.saldo);
    assert.strictEqual(dashboardV2.blocks.reserve.availableBalance, currentDashboard.kpis.saldoDisponivelEstimado);
    assert.strictEqual(dashboardV2.blocks.competence.realizedExpenses, ledgerAnswers.realizedExpenses);
    assert.strictEqual(dashboardV2.blocks.accounts.totalBalance, ledgerAnswers.accountBalance);
    assert.strictEqual(dashboardV2.blocks.cash.currentBalance, ledgerAnswers.accountBalance);
    assert.strictEqual(dashboardV2.blocks.budget.remainingBudget, ledgerAnswers.budgetRemaining);
    assert.strictEqual(dashboardV2.blocks.forecast.payable, ledgerAnswers.forecastPayable);
    assert.match(whatsapp, /Entradas: R\$ 1\.000,00/);
    assert.match(whatsapp, /Sa.das \+ cart.es: R\$ 400,00/);
    assert.match(whatsapp, /Saldo: R\$ 600,00/);
    assert.match(whatsapp, /Dispon.vel estimado: R\$ 450,00/);
    assert.deepStrictEqual(observedLedgerDomains, [
        'expenses:sum',
        'expenses:rank',
        'budget:detail',
        'accounts:explain',
        'forecast:forecast',
        'quality:detail'
    ]);
});
