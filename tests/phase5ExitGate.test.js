const test = require('node:test');
const assert = require('node:assert/strict');

const { ProjectedPlansStore } = require('../src/plans/projectedPlansStore');
const {
    buildProjectedPlanWritePolicy,
    executeDebtPaymentWrite,
    executeGoalMovementWrite
} = require('../src/plans/projectedPlanWriteService');
const { execute } = require('../src/services/calculationOrchestrator');
const messageHandler = require('../src/handlers/messageHandler');
const { buildDashboardV2Summary } = require('../src/services/dashboardV2SummaryService');

const USER_ID = 'phase5-gate-user';
const GOAL_HEADERS = [
    'Nome da Meta', 'Valor Alvo', 'Valor Atual', '% Progresso', 'Valor Mensal Sugerido',
    'Data Alvo', 'Status', 'Prioridade', 'user_id', 'Escopo', 'Última Movimentação'
];
const GOAL_MOVEMENT_HEADERS = [
    'Data', 'Meta', 'Tipo', 'Valor', 'Valor Antes', 'Valor Depois',
    'Observação', 'Responsável', 'user_id', 'goal_user_id'
];
const DEBT_HEADERS = [
    'Nome da Dívida', 'Credor', 'Tipo', 'Valor Original', 'Saldo Atual', 'Valor da Parcela',
    'Taxa de Juros', 'Dia de Vencimento', 'Data de Início', 'Total de Parcelas',
    'Parcelas Pagas', 'Status', 'Observações', '% Quitado', 'Último Pagamento',
    'Próximo Vencimento', 'Estratégia', 'user_id'
];

function dashboardSnapshot(goalRow, debtRow) {
    return {
        period: { month: 6, year: 2026, label: 'Julho de 2026' },
        scope: { mode: 'personal', label: 'Pessoal', members: [] },
        source: 'personal_sheet',
        kpis: {
            entradas: 0,
            saidas: 0,
            cartoes: 0,
            saldo: 0,
            reservaAplicada: 0,
            reservaResgatada: 0,
            reservaLiquida: 0,
            saldoDisponivelEstimado: 0
        },
        topCategories: [],
        dailyFlow: [],
        recentTransactions: [],
        goals: [{ name: goalRow[0], target: Number(goalRow[1]), current: Number(goalRow[2]), status: goalRow[6] }],
        debts: [{ name: debtRow[0], original: Number(debtRow[3]), balance: Number(debtRow[4]), status: debtRow[11] }],
        financialAccounts: { totalBalance: null, items: [] }
    };
}

async function unavailableQueryTool() {
    return { ok: false, reason: 'source_unavailable' };
}

async function buildCommittedFixture() {
    const store = new ProjectedPlansStore({
        dbPath: ':memory:',
        writeEnabled: true,
        clock: () => '2026-07-14T05:00:00.000Z'
    });
    let goalRow = ['Reserva', 1000, 200, '20%', 100, '31/12/2026', 'Em andamento', 'Alta', USER_ID, 'personal', '13/07/2026'];
    let debtRow = ['Casa', 'Banco', 'Financiamento', 1000, 1000, 200, '1% a.m.', 20, '01/01/2026', 5, 0, 'Ativa', '', '0%', '', '20/07/2026', 'PRICE', USER_ID];
    const goalMovements = [];
    const expenseEvents = [];
    const incomeEvents = [];

    const goalAfterContribution = [...goalRow];
    goalAfterContribution[2] = 250;
    goalAfterContribution[10] = '14/07/2026 05:00';
    const contributionRow = ['14/07/2026 05:00', 'Reserva', 'Aporte', 50, 200, 250, 'gate', 'Daniel', USER_ID, USER_ID];
    await executeGoalMovementWrite({
        store,
        operationKey: 'phase5:goal:contribution',
        userId: USER_ID,
        messageId: 'phase5-goal-message',
        goal: { row: goalRow, rowIndex: 2, headers: GOAL_HEADERS },
        updatedRow: goalAfterContribution,
        movementRow: contributionRow,
        updateGoalRow: async ({ row }) => { goalRow = [...row]; return { receipt: { replayed: false } }; },
        appendGoalMovement: async ({ row }) => { goalMovements.push([...row]); return { receipt: { replayed: false } }; }
    });

    const debtAfterPayment = [...debtRow];
    debtAfterPayment[4] = 800;
    debtAfterPayment[13] = '20.00%';
    await executeDebtPaymentWrite({
        store,
        operationKey: 'phase5:debt:payment',
        userId: USER_ID,
        messageId: 'phase5-debt-message',
        debt: { row: debtRow, rowIndex: 2, headers: DEBT_HEADERS },
        updatedRow: debtAfterPayment,
        amount: 200,
        occurredOn: '14/07/2026 05:01',
        updateDebtRow: async ({ row }) => { debtRow = [...row]; return { receipt: { replayed: false } }; }
    });

    return { store, get goalRow() { return goalRow; }, get debtRow() { return debtRow; }, goalMovements, expenseEvents, incomeEvents };
}

test('5D exit gate keeps Sheets, plan ledger, dashboard and WhatsApp in parity after reliable writes', async () => {
    const fixture = await buildCommittedFixture();
    try {
        const projection = fixture.store.readProjection();
        const goalPlan = projection.plans.find(plan => plan.type === 'goal');
        const debtPlan = projection.plans.find(plan => plan.type === 'financing');
        assert.strictEqual(goalPlan.amounts.current_cents, 25000);
        assert.strictEqual(debtPlan.amounts.outstanding_cents, 80000);
        assert.strictEqual(projection.plan_movements.length, 2);
        assert.strictEqual(fixture.expenseEvents.length, 0);
        assert.strictEqual(fixture.incomeEvents.length, 0);

        const goalQuestion = 'quando alcanço a meta reserva?';
        const goalClassification = messageHandler.__test__.classifyPerguntaLocally(goalQuestion);
        const goalAnalysis = await execute(
            goalClassification.intent,
            { ...goalClassification.parameters, financialQueryPlan: goalClassification.financialQueryPlan },
            {
                currentDate: '14/07/2026',
                scopeUserIds: [USER_ID],
                metas: [GOAL_HEADERS, fixture.goalRow],
                movimentacoesMetas: [GOAL_MOVEMENT_HEADERS, ...fixture.goalMovements]
            }
        );
        const goalReply = messageHandler.__test__.buildLocalPerguntaResponse({
            userQuestion: goalQuestion,
            intent: goalClassification.intent,
            analyzedData: goalAnalysis
        });
        assert.strictEqual(goalAnalysis.results.plan.remaining, 750);
        assert.match(goalReply, /Reserva/);
        assert.match(goalReply, /R\$\s*750,00/);

        const debtQuestion = 'quando quito a dívida da casa?';
        const debtClassification = messageHandler.__test__.classifyPerguntaLocally(debtQuestion);
        const debtAnalysis = await execute(
            debtClassification.intent,
            { ...debtClassification.parameters, financialQueryPlan: debtClassification.financialQueryPlan },
            { currentDate: '14/07/2026', scopeUserIds: [USER_ID], dividas: [DEBT_HEADERS, fixture.debtRow] }
        );
        const debtReply = messageHandler.__test__.buildLocalPerguntaResponse({
            userQuestion: debtQuestion,
            intent: debtClassification.intent,
            analyzedData: debtAnalysis
        });
        assert.strictEqual(debtAnalysis.results.plan.remaining, 800);
        assert.strictEqual(debtAnalysis.results.plan.type, 'financing');
        assert.match(debtReply, /Casa/);
        assert.match(debtReply, /R\$\s*800,00/);

        const dashboard = await buildDashboardV2Summary({
            snapshot: dashboardSnapshot(fixture.goalRow, fixture.debtRow),
            userIds: [USER_ID],
            ownerUserId: USER_ID,
            month: 6,
            year: 2026,
            currentDate: '2026-07-14',
            queryTool: unavailableQueryTool
        });
        assert.strictEqual(dashboard.blocks.goals.items[0].current, goalPlan.amounts.current_cents / 100);
        assert.strictEqual(dashboard.blocks.debts.items[0].balance, debtPlan.amounts.outstanding_cents / 100);

        assert.doesNotMatch(
            JSON.stringify({ goalReply, debtReply, dashboard }),
            /phase5-gate-user|plan_id|legacy_ref|operation_key|payload_checksum/i
        );
    } finally {
        fixture.store.close();
    }
});

test('5D exit gate keeps withdrawal simulation read-only and financing deterministic', async () => {
    const fixture = await buildCommittedFixture();
    try {
        const before = JSON.stringify(fixture.store.createBackup());
        const classification = messageHandler.__test__.classifyPerguntaLocally(
            'se eu retirar R$ 50 da meta reserva, quando alcanço?'
        );
        const analysis = await execute(
            classification.intent,
            { ...classification.parameters, financialQueryPlan: classification.financialQueryPlan },
            {
                currentDate: '14/07/2026',
                scopeUserIds: [USER_ID],
                metas: [GOAL_HEADERS, fixture.goalRow],
                movimentacoesMetas: [GOAL_MOVEMENT_HEADERS, ...fixture.goalMovements]
            }
        );
        assert.strictEqual(analysis.results.scenario.type, 'withdrawal');
        assert.strictEqual(analysis.results.scenario.amount, 50);
        assert.strictEqual(analysis.results.separation.persisted, false);
        assert.strictEqual(analysis.results.separation.writesPerformed, 0);
        assert.strictEqual(JSON.stringify(fixture.store.createBackup()), before);

        const debtClassification = messageHandler.__test__.classifyPerguntaLocally('quando quito a dívida da casa?');
        const first = await execute(
            debtClassification.intent,
            { ...debtClassification.parameters, financialQueryPlan: debtClassification.financialQueryPlan },
            { currentDate: '14/07/2026', scopeUserIds: [USER_ID], dividas: [DEBT_HEADERS, fixture.debtRow] }
        );
        const second = await execute(
            debtClassification.intent,
            { ...debtClassification.parameters, financialQueryPlan: debtClassification.financialQueryPlan },
            { currentDate: '14/07/2026', scopeUserIds: [USER_ID], dividas: [DEBT_HEADERS, fixture.debtRow] }
        );
        assert.deepStrictEqual(second.results.baseline, first.results.baseline);
        assert.strictEqual(first.results.plan.remaining, 800);
    } finally {
        fixture.store.close();
    }
});

test('5D exit gate has a fail-closed rollback to the legacy path', () => {
    assert.deepStrictEqual(buildProjectedPlanWritePolicy({}, USER_ID), {
        mode: 'off',
        shadowWritesAllowed: false,
        reason: 'mode_off'
    });
    assert.strictEqual(buildProjectedPlanWritePolicy({
        PROJECTED_PLAN_WRITES_MODE: 'shadow',
        PROJECTED_PLAN_WRITES_USER_IDS: 'another-user'
    }, USER_ID).shadowWritesAllowed, false);
    assert.strictEqual(buildProjectedPlanWritePolicy({
        PROJECTED_PLAN_WRITES_MODE: 'invalid',
        PROJECTED_PLAN_WRITES_USER_IDS: USER_ID
    }, USER_ID).mode, 'off');
});
