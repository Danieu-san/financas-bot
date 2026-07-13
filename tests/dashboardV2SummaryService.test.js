const test = require('node:test');
const assert = require('node:assert');

const { buildDashboardV2Summary } = require('../src/services/dashboardV2SummaryService');
const { normalizeFinancialQueryPlan } = require('../src/query/financialQueryPlan');

function snapshotFixture() {
    return {
        period: { month: 6, year: 2026, label: 'Julho de 2026' },
        scope: { mode: 'family', label: 'Família', members: [{ name: 'Daniel', user_id: 'hidden-member' }] },
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
        topCategories: [{ category: 'Alimentação', value: 300, owner_hash: 'hidden-owner' }],
        dailyFlow: [{ date: '10/07/2026', entradas: 1000, saidas: 400, saldo: 600 }],
        recentTransactions: [{ date: '10/07/2026', description: 'Mercado', value: 300, type: 'saida', idempotency_key: 'hidden-key' }],
        goals: [{ name: 'Reserva', target: 3000, current: 600, source_row_hash: 'hidden-row' }],
        debts: [{ name: 'Cartão', saldoAtual: 1200, owner_person_id: 'hidden-person' }],
        financialAccounts: {
            totalBalance: 1527.77,
            items: [{ name: 'Nubank', balance: 1527.77, account_id: 'hidden-account' }]
        },
        criteria: {
            balance: 'Caixa por data da transação.',
            available: 'Disponível desconta reserva líquida.',
            categories: 'Categorias do período.',
            budget: 'Orçamento por ciclo.',
            recentTransactions: 'Lançamentos recentes por tipo.'
        }
    };
}

test('dashboard v2 composes every block from the snapshot and existing financial query tools', async () => {
    const plans = [];
    const queryTool = async ({ plan }) => {
        assert.strictEqual(normalizeFinancialQueryPlan(plan).ok, true, JSON.stringify(plan));
        plans.push(plan);
        if (plan.domain === 'expenses' && plan.operation === 'sum') {
            return {
                ok: true,
                source: 'sqlite_query_engine',
                result: { value: 430, details: { criteria: 'Competência da fatura para cartão.' } }
            };
        }
        if (plan.domain === 'expenses' && plan.operation === 'rank') {
            return {
                ok: true,
                source: 'sqlite_query_engine',
                result: { value: [{ category: 'Alimentação', total: 300 }] }
            };
        }
        if (plan.domain === 'budget') {
            return {
                ok: true,
                source: 'sqlite_query_engine',
                result: {
                    value: {
                        categoryBudget: {
                            status: 'available',
                            globalBudget: 1000,
                            allocatedBudget: 700,
                            unallocatedBudget: 300,
                            overallocatedBudget: 0,
                            actualBudget: 430,
                            remainingBudget: 570,
                            dailyPace: 31.67,
                            categories: [{ category: 'Alimentação', plannedAmount: 400, actualAmount: 300, owner_person_id: 'hidden-person' }]
                        }
                    },
                    details: { criteria: 'Orçamento pelo ciclo configurado.' }
                }
            };
        }
        if (plan.domain === 'accounts') {
            return {
                ok: true,
                source: 'canonical',
                result: {
                    value: {
                        total: 1527.77,
                        count: 1,
                        items: [{ name: 'Nubank', balance: 1527.77, account_id: 'hidden-account' }],
                        criteria: 'Saldo atual canônico.'
                    }
                }
            };
        }
        if (plan.domain === 'forecast') {
            return {
                ok: true,
                source: 'canonical',
                result: {
                    value: {
                        payable: 250,
                        receivable: 50,
                        netExpectedCash: -200,
                        currentCashImpact: 0,
                        count: 3,
                        items: [
                            { domain: 'invoice', description: 'Fatura Nubank', value: 100, isoDate: '2026-07-20', owner_person_id: 'hidden-person' },
                            { domain: 'bill', description: 'Telefone', value: 150, isoDate: '2026-07-22' },
                            { domain: 'income', description: 'Reembolso', value: 50, isoDate: '2026-07-25' }
                        ],
                        criteria: 'Vencimentos previstos não alteram o caixa atual.'
                    }
                }
            };
        }
        throw new Error(`unexpected plan ${plan.domain}`);
    };

    const result = await buildDashboardV2Summary({
        snapshot: snapshotFixture(),
        userIds: ['user-owner', 'user-member'],
        ownerUserId: 'user-owner',
        month: 6,
        year: 2026,
        currentDate: '2026-07-13',
        queryTool
    });

    assert.strictEqual(result.version, 'dashboard-summary-v2');
    assert.deepStrictEqual(Object.keys(result.blocks), [
        'cash', 'competence', 'reserve', 'budget', 'accounts', 'invoices',
        'forecast', 'goals', 'debts', 'quality', 'recentTransactions'
    ]);
    assert.deepStrictEqual(plans.map(plan => [plan.domain, plan.timeBasis]), [
        ['expenses', 'billing_month'],
        ['expenses', 'billing_month'],
        ['budget', 'budget_cycle'],
        ['accounts', 'current_state'],
        ['forecast', 'due_date'],
        ['quality', 'transaction_date']
    ]);
    assert.strictEqual(result.blocks.cash.currentBalance, 1527.77);
    assert.strictEqual(result.blocks.cash.periodDirectOutflows, 300);
    assert.strictEqual(result.blocks.cash.periodCardCommitments, 100);
    assert.strictEqual(result.blocks.cash.periodEconomicBalance, 600);
    assert.strictEqual(result.blocks.competence.realizedExpenses, 430);
    assert.strictEqual(result.blocks.reserve.availableBalance, 450);
    assert.strictEqual(result.blocks.budget.remainingBudget, 570);
    assert.strictEqual(result.blocks.accounts.totalBalance, 1527.77);
    assert.strictEqual(result.blocks.invoices.total, 100);
    assert.strictEqual(result.blocks.forecast.currentCashImpact, 0);
    assert.strictEqual(result.blocks.quality.status, 'unavailable');
    assert.strictEqual(result.blocks.quality.classifiedCount, null);
    assert.strictEqual(result.blocks.quality.pendingCount, null);
    assert.strictEqual(result.blocks.quality.unreconciledCount, null);
    assert.doesNotMatch(JSON.stringify(result), /user-owner|user-member|user_id|owner_hash|owner_person_id|account_id|idempotency_key|source_row_hash/i);
});

test('dashboard v2 keeps partial source failures scoped and never turns unknown values into zero', async () => {
    const result = await buildDashboardV2Summary({
        snapshot: snapshotFixture(),
        userIds: ['user-owner'],
        ownerUserId: 'user-owner',
        month: 6,
        year: 2026,
        currentDate: '2026-07-13',
        queryTool: async () => ({ ok: false, reason: 'canary_domain_disabled' })
    });

    assert.strictEqual(result.blocks.cash.status, 'fallback');
    assert.strictEqual(result.blocks.cash.currentBalance, 1527.77);
    assert.strictEqual(result.blocks.competence.status, 'unavailable');
    assert.strictEqual(result.blocks.competence.reason, 'source_unavailable');
    assert.strictEqual(result.blocks.competence.realizedExpenses, null);
    assert.strictEqual(result.blocks.budget.status, 'unavailable');
    assert.strictEqual(result.blocks.budget.globalBudget, null);
    assert.strictEqual(result.blocks.accounts.status, 'fallback');
    assert.strictEqual(result.blocks.accounts.totalBalance, 1527.77);
    assert.strictEqual(result.blocks.invoices.status, 'unavailable');
    assert.strictEqual(result.blocks.invoices.total, null);
    assert.strictEqual(result.blocks.forecast.status, 'unavailable');
    assert.strictEqual(result.blocks.forecast.payable, null);
    assert.match(result.blocks.forecast.criteria, /não equivale a zero/i);
});

test('dashboard v2 preserves null when neither canonical nor snapshot account balance exists', async () => {
    const snapshot = snapshotFixture();
    snapshot.financialAccounts = { totalBalance: 0, items: [] };
    const result = await buildDashboardV2Summary({
        snapshot,
        userIds: ['user-owner'],
        ownerUserId: 'user-owner',
        month: 6,
        year: 2026,
        currentDate: '2026-07-13',
        queryTool: async () => ({ ok: false, reason: 'source_unavailable' })
    });

    assert.strictEqual(result.blocks.accounts.status, 'unavailable');
    assert.strictEqual(result.blocks.accounts.totalBalance, null);
    assert.strictEqual(result.blocks.cash.status, 'partial');
    assert.strictEqual(result.blocks.cash.currentBalance, null);
    assert.notStrictEqual(result.blocks.cash.currentBalance, 0);
});

test('dashboard v2 exposes trusted quality indicators only when the snapshot provides them', async () => {
    const snapshot = snapshotFixture();
    snapshot.dataQuality = {
        status: 'partial',
        classifiedCount: 8,
        pendingCount: 2,
        unreconciledCount: 1,
        coveragePct: 80,
        owner_hash: 'hidden-owner',
        criteria: 'Cobertura medida pela fonte confiável.'
    };
    const result = await buildDashboardV2Summary({
        snapshot,
        userIds: ['user-owner'],
        ownerUserId: 'user-owner',
        month: 6,
        year: 2026,
        currentDate: '2026-07-13',
        queryTool: async () => ({ ok: false, reason: 'source_unavailable' })
    });

    assert.deepStrictEqual(result.blocks.quality, {
        status: 'partial',
        classifiedCount: 8,
        pendingCount: 2,
        unreconciledCount: 1,
        coveragePct: 80,
        criteria: 'Cobertura medida pela fonte confiável.'
    });
    assert.doesNotMatch(JSON.stringify(result.blocks.quality), /owner_hash|hidden-owner/i);
});

test('dashboard v2 exposes the six canonical quality indicators without internal identifiers', async () => {
    const snapshot = snapshotFixture();
    snapshot.dataQuality = { status: 'available', pendingCount: 999, criteria: 'fallback antigo' };
    const result = await buildDashboardV2Summary({
        snapshot,
        userIds: ['user-owner'],
        ownerUserId: 'user-owner',
        month: 6,
        year: 2026,
        currentDate: '2026-07-13',
        queryTool: async ({ plan }) => {
            if (plan.domain !== 'quality') return { ok: false, reason: 'source_unavailable' };
            return {
                ok: true,
                source: 'canonical',
                result: { value: {
                    status: 'partial',
                    totalCount: 10,
                    cleanCount: 4,
                    classificationApplicableCount: 8,
                    classifiedCount: 6,
                    missingCategoryCount: 2,
                    uncertainCount: 1,
                    pendingStatusCount: 1,
                    pendingCount: 6,
                    unreconciledCount: 2,
                    missingFinancialAccountCount: 3,
                    receiptRequiredCount: 0,
                    missingRequiredReceiptCount: 0,
                    receiptIndicatorStatus: 'not_applicable',
                    coveragePct: 75,
                    qualityCoveragePct: 40,
                    bySource: [{ source: 'WhatsApp', totalCount: 8, pendingCount: 4, coveragePct: 75, owner_hash: 'hidden' }],
                    items: [{ date: '2026-07-10', description: 'Item para revisar', source: 'WhatsApp', issues: ['missing_category'], event_id: 'hidden-event' }],
                    criteria: 'Qualidade canônica por data da transação.'
                } }
            };
        }
    });

    assert.strictEqual(result.blocks.quality.status, 'partial');
    assert.strictEqual(result.blocks.quality.missingCategoryCount, 2);
    assert.strictEqual(result.blocks.quality.uncertainCount, 1);
    assert.strictEqual(result.blocks.quality.pendingStatusCount, 1);
    assert.strictEqual(result.blocks.quality.unreconciledCount, 2);
    assert.strictEqual(result.blocks.quality.missingFinancialAccountCount, 3);
    assert.strictEqual(result.blocks.quality.receiptIndicatorStatus, 'not_applicable');
    assert.strictEqual(result.blocks.quality.pendingCount, 6);
    assert.strictEqual(result.blocks.quality.criteria, 'Qualidade canônica por data da transação.');
    assert.doesNotMatch(JSON.stringify(result.blocks.quality), /hidden|owner_hash|event_id/i);
});

test('dashboard v2 keeps key KPIs equal to the same verified tool values used by WhatsApp', async () => {
    const whatsappToolAnswers = {
        realizedExpenses: 430,
        budgetRemaining: 570,
        accountBalance: 1527.77,
        forecastPayable: 250
    };
    const queryTool = async ({ plan }) => {
        if (plan.domain === 'expenses' && plan.operation === 'sum') {
            return { ok: true, source: 'sqlite_query_engine', result: { value: whatsappToolAnswers.realizedExpenses } };
        }
        if (plan.domain === 'expenses' && plan.operation === 'rank') {
            return { ok: true, source: 'sqlite_query_engine', result: { value: [] } };
        }
        if (plan.domain === 'budget') {
            return {
                ok: true,
                source: 'sqlite_query_engine',
                result: { value: { categoryBudget: {
                    status: 'available',
                    globalBudget: 1000,
                    allocatedBudget: 700,
                    unallocatedBudget: 300,
                    overallocatedBudget: 0,
                    actualBudget: 430,
                    remainingBudget: whatsappToolAnswers.budgetRemaining,
                    dailyPace: 31.67,
                    categories: []
                } } }
            };
        }
        if (plan.domain === 'accounts') {
            return {
                ok: true,
                source: 'canonical',
                result: { value: { total: whatsappToolAnswers.accountBalance, count: 1, items: [], criteria: 'Saldo atual canônico.' } }
            };
        }
        if (plan.domain === 'forecast') {
            return {
                ok: true,
                source: 'canonical',
                result: { value: {
                    payable: whatsappToolAnswers.forecastPayable,
                    receivable: 50,
                    netExpectedCash: -200,
                    currentCashImpact: 0,
                    count: 1,
                    items: []
                } }
            };
        }
        return { ok: false, reason: 'source_unavailable' };
    };

    const result = await buildDashboardV2Summary({
        snapshot: snapshotFixture(),
        userIds: ['user-owner'],
        ownerUserId: 'user-owner',
        month: 6,
        year: 2026,
        currentDate: '2026-07-13',
        queryTool
    });

    assert.strictEqual(result.blocks.competence.realizedExpenses, whatsappToolAnswers.realizedExpenses);
    assert.strictEqual(result.blocks.budget.remainingBudget, whatsappToolAnswers.budgetRemaining);
    assert.strictEqual(result.blocks.accounts.totalBalance, whatsappToolAnswers.accountBalance);
    assert.strictEqual(result.blocks.cash.currentBalance, whatsappToolAnswers.accountBalance);
    assert.strictEqual(result.blocks.forecast.payable, whatsappToolAnswers.forecastPayable);
});
