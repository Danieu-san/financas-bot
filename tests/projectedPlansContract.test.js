const test = require('node:test');
const assert = require('node:assert');

const {
    PLAN_SCHEMA_VERSION,
    PROJECTED_PLANS_SCHEMA_VERSION,
    adaptLegacyGoalRow,
    adaptLegacyDebtRow,
    projectLegacyPlans,
    projectLegacyPlanSheets,
    createProjectedPlansBackup,
    restoreProjectedPlansBackup,
    toPublicProjectedPlansView,
    assertProjectedPlans
} = require('../src/plans/projectedPlansContract');

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

test('5A goal adapter keeps immutable identity across rename and represents money in cents', () => {
    const base = {
        headers: GOAL_HEADERS,
        legacyRef: 'sheet:metas:stable-row-17',
        householdId: 'household-a',
        row: ['Reserva', '10.000,00', '1.500,25', '', '', '31/12/2027', 'Em andamento', 'Alta', 'user-a', 'family', '10/07/2026']
    };

    const first = adaptLegacyGoalRow(base);
    const renamed = adaptLegacyGoalRow({ ...base, row: ['Reserva da família', ...base.row.slice(1)] });

    assert.strictEqual(first.schema_version, PLAN_SCHEMA_VERSION);
    assert.strictEqual(first.plan_id, renamed.plan_id);
    assert.strictEqual(first.type, 'goal');
    assert.strictEqual(first.scope, 'family');
    assert.strictEqual(first.owner_user_id, 'user-a');
    assert.strictEqual(first.permissions.mutation_policy, 'household_members');
    assert.strictEqual(first.permissions.requires_joint_confirmation, false);
    assert.strictEqual(first.amounts.target_cents, 1_000_000);
    assert.strictEqual(first.amounts.current_cents, 150_025);
    assert.strictEqual(first.source.identity_status, 'stable');
    assert.strictEqual(first.terms.target_on, '2027-12-31');
});

test('5A debt adapter uses the same plan contract and preserves financing terms without inventing data', () => {
    const plan = adaptLegacyDebtRow({
        headers: DEBT_HEADERS,
        legacyRef: 'sheet:dividas:stable-row-4',
        householdId: 'household-a',
        row: ['Financiamento casa', 'Banco', 'Financiamento', '250.000,00', '198.765,43', '2.150,00', '1,5% a.m.', '10', '01/02/2024', '240', '29', 'Em dia', '', '', '10/07/2026', '10/08/2026', '', 'user-a']
    });

    assert.strictEqual(plan.schema_version, PLAN_SCHEMA_VERSION);
    assert.strictEqual(plan.type, 'financing');
    assert.strictEqual(plan.amounts.principal_cents, 25_000_000);
    assert.strictEqual(plan.amounts.outstanding_cents, 19_876_543);
    assert.strictEqual(plan.amounts.installment_cents, 215_000);
    assert.strictEqual(plan.terms.interest_rate_basis_points, 150);
    assert.strictEqual(plan.terms.interest_period, 'monthly');
    assert.strictEqual(plan.terms.term_months, 240);
    assert.strictEqual(plan.terms.amortization_method, null);
});

test('5A projector links realized legacy facts, rejects ambiguous name association and never persists simulation', () => {
    const projection = projectLegacyPlans({
        householdId: 'household-a',
        goals: [{
            headers: GOAL_HEADERS,
            legacyRef: 'sheet:metas:row-a',
            row: ['Reserva', 10000, 1500, '', '', '31/12/2027', 'Em andamento', 'Alta', 'user-a', 'personal', '10/07/2026']
        }],
        debts: [{
            headers: DEBT_HEADERS,
            legacyRef: 'sheet:dividas:row-a',
            row: ['Empréstimo', 'Banco', 'Empréstimo', 5000, 3200, 400, '', 5, '01/01/2026', 12, 4, 'Em dia', '', '', '', '05/08/2026', '', 'user-a']
        }],
        goalMovements: [{
            headers: GOAL_MOVEMENT_HEADERS,
            legacyRef: 'sheet:movimentacoes-metas:row-a',
            row: ['10/07/2026', 'Reserva', 'Aporte', '500,00', '1.000,00', '1.500,00', '', 'Daniel', 'user-a', 'user-a']
        }]
    });

    assert.strictEqual(projection.schema_version, PROJECTED_PLANS_SCHEMA_VERSION);
    assert.strictEqual(projection.plans.length, 2);
    assert.strictEqual(projection.plan_movements.length, 1);
    assert.strictEqual(projection.plan_movements[0].state, 'realized');
    assert.strictEqual(projection.plan_movements[0].type, 'contribution');
    assert.strictEqual(projection.plan_movements[0].amount_cents, 50_000);
    assert.ok(projection.plans.some(plan => plan.plan_id === projection.plan_movements[0].plan_id));
    assert.ok(projection.plan_movements.every(item => item.state !== 'projected' && item.state !== 'simulated'));
    assert.deepStrictEqual(projection.issues, []);

    const ambiguous = projectLegacyPlans({
        householdId: 'household-a',
        goals: [
            { headers: GOAL_HEADERS, legacyRef: 'goal-1', row: ['Viagem', 1000, 0, '', '', '', 'Em andamento', '', 'user-a', 'personal', ''] },
            { headers: GOAL_HEADERS, legacyRef: 'goal-2', row: ['Viagem', 2000, 0, '', '', '', 'Em andamento', '', 'user-a', 'personal', ''] }
        ],
        goalMovements: [
            { headers: GOAL_MOVEMENT_HEADERS, legacyRef: 'movement-1', row: ['10/07/2026', 'Viagem', 'Aporte', 100, 0, 100, '', 'Daniel', 'user-a', 'user-a'] }
        ]
    });

    assert.strictEqual(ambiguous.plan_movements.length, 0);
    assert.ok(ambiguous.issues.some(issue => issue.code === 'ambiguous_legacy_plan_match'));
});

test('5A projected-plan backup restores exactly, detects tampering and public view removes internal identity', () => {
    const projection = projectLegacyPlans({
        householdId: 'household-secret',
        goals: [{
            headers: GOAL_HEADERS,
            legacyRef: 'sheet:metas:private-ref',
            row: ['Reserva', 1000, 200, '', '', '', 'Em andamento', '', 'user-secret', 'personal', '']
        }]
    });
    const backup = createProjectedPlansBackup(projection, { createdAt: '2026-07-13T20:00:00.000Z' });
    const restored = restoreProjectedPlansBackup(JSON.parse(JSON.stringify(backup)));

    assert.deepStrictEqual(restored, projection);

    const tampered = JSON.parse(JSON.stringify(backup));
    tampered.payload.plans[0].amounts.current_cents += 1;
    assert.throws(() => restoreProjectedPlansBackup(tampered), /checksum/i);

    const publicView = toPublicProjectedPlansView(projection);
    const serialized = JSON.stringify(publicView);
    assert.doesNotMatch(serialized, /user-secret|household-secret|private-ref|operation_key|owner_user_id|legacy_ref/i);
    assert.strictEqual(publicView.plans[0].amounts.current_cents, 20_000);
});

test('5A missing legacy fields remain partial/null and row-derived identity is explicitly provisional', () => {
    const goal = adaptLegacyGoalRow({
        headers: GOAL_HEADERS,
        rowIndex: 9,
        householdId: 'household-a',
        row: ['Meta incompleta', '', '', '', '', '', 'Em andamento', '', '', 'personal', '']
    });
    const consortium = adaptLegacyDebtRow({
        headers: DEBT_HEADERS,
        rowIndex: 10,
        householdId: 'household-a',
        row: ['Consórcio', '', 'Consórcio', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'user-a']
    });

    assert.strictEqual(goal.source.identity_status, 'provisional');
    assert.strictEqual(goal.source.data_status, 'partial');
    assert.strictEqual(goal.amounts.target_cents, null);
    assert.strictEqual(goal.amounts.current_cents, null);
    assert.strictEqual(consortium.type, 'consortium');
    assert.strictEqual(consortium.amounts.principal_cents, null);
    assert.strictEqual(consortium.terms.interest_rate_basis_points, null);
    assert.strictEqual(consortium.terms.amortization_method, null);
});

test('5A contract rejects projected or simulated rows inside plan_movements', () => {
    const projection = projectLegacyPlans({
        householdId: 'household-a',
        goals: [{
            headers: GOAL_HEADERS,
            legacyRef: 'goal-stable',
            row: ['Reserva', 1000, 100, '', '', '', 'Em andamento', '', 'user-a', 'personal', '']
        }],
        goalMovements: [{
            headers: GOAL_MOVEMENT_HEADERS,
            legacyRef: 'movement-stable',
            row: ['10/07/2026', 'Reserva', 'Aporte', 100, 0, 100, '', '', 'user-a', 'user-a']
        }]
    });
    projection.plan_movements[0].state = 'simulated';

    assert.throws(() => assertProjectedPlans(projection), /non_realized_movement_forbidden/);
    assert.throws(() => createProjectedPlansBackup(projection), /non_realized_movement_forbidden/);
});

test('5A contract keeps corrections append-only through one compensating reversal', () => {
    const projection = projectLegacyPlans({
        householdId: 'household-a',
        goals: [{
            headers: GOAL_HEADERS,
            legacyRef: 'goal-reversal',
            row: ['Reserva', 1000, 100, '', '', '', 'Em andamento', '', 'user-a', 'personal', '']
        }],
        goalMovements: [{
            headers: GOAL_MOVEMENT_HEADERS,
            legacyRef: 'movement-original',
            row: ['10/07/2026', 'Reserva', 'Aporte', 100, 0, 100, '', '', 'user-a', 'user-a']
        }]
    });
    const original = projection.plan_movements[0];
    const reversal = {
        ...JSON.parse(JSON.stringify(original)),
        movement_id: 'movement_reversal_1',
        operation_key: 'operation_reversal_1',
        type: 'reversal',
        amount_cents: -original.amount_cents,
        balance_before_cents: original.balance_after_cents,
        balance_after_cents: original.balance_before_cents,
        reverses_movement_id: original.movement_id
    };
    projection.plan_movements.push(reversal);

    assert.strictEqual(assertProjectedPlans(projection), true);

    const mutatedOriginal = JSON.parse(JSON.stringify(projection));
    mutatedOriginal.plan_movements[0].amount_cents += 1;
    assert.throws(() => assertProjectedPlans(mutatedOriginal), /reversal_amount_mismatch/);

    const duplicateReversal = JSON.parse(JSON.stringify(projection));
    duplicateReversal.plan_movements.push({
        ...duplicateReversal.plan_movements[1],
        movement_id: 'movement_reversal_2',
        operation_key: 'operation_reversal_2'
    });
    assert.throws(() => assertProjectedPlans(duplicateReversal), /already_reversed/);
});

test('5A sheet adapter exposes legacy goals and debts as compatible views without writing or inventing stable ids', () => {
    const projection = projectLegacyPlanSheets({
        householdId: 'household-a',
        metasData: [
            GOAL_HEADERS,
            ['Reserva', '2.000,00', '350,50', '', '', '31/12/2026', 'Em andamento', 'Alta', 'user-a', 'personal', '10/07/2026']
        ],
        dividasData: [
            DEBT_HEADERS,
            ['Empréstimo', 'Banco', 'Empréstimo', '5.000,00', '3.200,00', '400,00', '', 5, '01/01/2026', 12, 4, 'Em dia', '', '', '', '05/08/2026', '', 'user-a']
        ],
        movimentacoesMetasData: [
            GOAL_MOVEMENT_HEADERS,
            ['10/07/2026', 'Reserva', 'Aporte', '50,50', '300,00', '350,50', '', 'Daniel', 'user-a', 'user-a']
        ]
    });

    assert.strictEqual(projection.plans.length, 2);
    assert.strictEqual(projection.plan_movements.length, 1);
    assert.strictEqual(projection.stats.issue_count, 0);
    assert.ok(projection.plans.every(plan => plan.source.identity_status === 'provisional'));
    assert.ok(projection.plans.some(plan => plan.type === 'goal' && plan.amounts.current_cents === 35_050));
    assert.ok(projection.plans.some(plan => plan.type === 'debt' && plan.amounts.outstanding_cents === 320_000));
    assert.strictEqual(projection.plan_movements[0].amount_cents, 5_050);
});
