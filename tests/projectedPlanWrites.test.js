const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ProjectedPlansStore } = require('../src/plans/projectedPlansStore');
const {
    buildProjectedPlanWritePolicy,
    executeGoalMovementWrite,
    executeDebtPaymentWrite
} = require('../src/plans/projectedPlanWriteService');
const {
    resolveFixtureUser,
    rowHasMarker,
    sanitizeMarker
} = require('../scripts/runProjectedPlanWritesE2E');
const { upsertEnvValue } = require('../scripts/configureProjectedPlanWritesCanary');

const GOAL_HEADERS = [
    'Nome da Meta', 'Valor Alvo', 'Valor Atual', '% Progresso', 'Valor Mensal Sugerido',
    'Data Alvo', 'Status', 'Prioridade', 'user_id', 'Escopo', 'Ultima Movimentacao'
];
const DEBT_HEADERS = [
    'Nome da Divida', 'Credor', 'Tipo', 'Valor Original', 'Saldo Atual', 'Valor da Parcela',
    'Taxa de Juros', 'Dia de Vencimento', 'Data de Inicio', 'Total de Parcelas',
    'Parcelas Pagas', 'Status', 'Observacoes', '% Quitado', 'Ultimo Pagamento',
    'Proximo Vencimento', 'Estrategia', 'user_id'
];

function tempStore() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-plan-writes-'));
    const dbPath = path.join(dir, 'plans.sqlite');
    let store = new ProjectedPlansStore({
        dbPath,
        writeEnabled: true,
        clock: () => '2026-07-14T04:00:00.000Z'
    });
    return {
        get store() { return store; },
        restart() {
            store.close();
            store = new ProjectedPlansStore({
                dbPath,
                writeEnabled: true,
                clock: () => '2026-07-14T04:01:00.000Z'
            });
            return store;
        },
        cleanup() {
            if (store?.db?.open) store.close();
            fs.rmSync(dir, { recursive: true, force: true });
        }
    };
}

test('5C write policy fails closed and requires an explicit user allowlist', () => {
    assert.deepStrictEqual(buildProjectedPlanWritePolicy({}, 'user-a'), {
        mode: 'off',
        shadowWritesAllowed: false,
        reason: 'mode_off'
    });
    assert.strictEqual(buildProjectedPlanWritePolicy({ PROJECTED_PLAN_WRITES_MODE: 'invalid' }, 'user-a').reason, 'invalid_mode');
    assert.strictEqual(buildProjectedPlanWritePolicy({ PROJECTED_PLAN_WRITES_MODE: 'shadow' }, 'user-a').reason, 'allowlist_empty');
    assert.strictEqual(buildProjectedPlanWritePolicy({
        PROJECTED_PLAN_WRITES_MODE: 'shadow',
        PROJECTED_PLAN_WRITES_USER_IDS: 'user-b'
    }, 'user-a').reason, 'user_not_allowlisted');
    assert.deepStrictEqual(buildProjectedPlanWritePolicy({
        PROJECTED_PLAN_WRITES_MODE: 'shadow',
        PROJECTED_PLAN_WRITES_USER_IDS: 'user-a,user-b'
    }, 'user-a'), {
        mode: 'shadow',
        shadowWritesAllowed: true,
        reason: 'allowed'
    });
});

test('5C real E2E helpers require an isolated exact marker and one active user', () => {
    const marker = sanitizeMarker('TESTE_APAGAR_PLAN_WRITES_20260714');
    assert.strictEqual(rowHasMarker([`Reserva ${marker}`], marker), true);
    assert.strictEqual(rowHasMarker([`Reserva ${marker}_OUTRO`], marker), false);
    assert.throws(() => sanitizeMarker('marcador-inseguro'), /inválido/);
    assert.strictEqual(resolveFixtureUser([
        { user_id: 'user-a', display_name: 'Daniel', status: 'ACTIVE' },
        { user_id: 'user-old', display_name: 'Daniel', status: 'BLOCKED' }
    ], 'Daniel').user_id, 'user-a');
    assert.throws(() => resolveFixtureUser([
        { user_id: 'user-a', display_name: 'Daniel', status: 'ACTIVE' },
        { user_id: 'user-b', display_name: 'Daniel', status: 'ACTIVE' }
    ], 'Daniel'), /único usuário ACTIVE/);
    assert.strictEqual(
        upsertEnvValue('A=1\nPROJECTED_PLAN_WRITES_MODE=off\n', 'PROJECTED_PLAN_WRITES_MODE', 'shadow'),
        'A=1\nPROJECTED_PLAN_WRITES_MODE=shadow\n'
    );
    assert.strictEqual(
        upsertEnvValue('A=1', 'PROJECTED_PLAN_WRITES_USER_IDS', 'user-a'),
        'A=1\nPROJECTED_PLAN_WRITES_USER_IDS=user-a\n'
    );
    assert.throws(() => upsertEnvValue('', 'PROJECTED_PLAN_WRITES_MODE', 'shadow\nLEAK=1'), /inválido/);
});

test('5C goal write survives failure between legacy update and movement append, then replays after restart', async () => {
    const context = tempStore();
    const planId = 'plan_goal_reserva';
    context.store.bindLegacyIdentity({
        sourceType: 'sheet.metas',
        legacyRef: 'sheet.metas:row:2',
        planId,
        identityStatus: 'stable'
    });
    const operationKey = 'goal-operation-1';
    const goal = {
        rowIndex: 2,
        headers: GOAL_HEADERS,
        row: ['Reserva', 10000, 1500, '', 500, '31/12/2027', 'Em andamento', 'Alta', 'user-a', 'personal', '13/07/2026']
    };
    const updatedRow = ['Reserva', 10000, 2000, '', 500, '31/12/2027', 'Em andamento', 'Alta', 'user-a', 'personal', '14/07/2026'];
    const movementRow = ['14/07/2026', 'Reserva', 'Aporte', 500, 1500, 2000, '', 'Daniel', 'user-a', 'user-a'];
    const updateKeys = new Set();
    const appendKeys = new Set();
    let failAppend = true;
    const updateGoalRow = async ({ operationKey: childKey }) => {
        const replayed = updateKeys.has(childKey);
        updateKeys.add(childKey);
        return { status: 'committed', receipt: { replayed } };
    };
    const appendGoalMovement = async ({ operationKey: childKey }) => {
        if (failAppend) {
            failAppend = false;
            throw new Error('simulated_append_failure');
        }
        const replayed = appendKeys.has(childKey);
        appendKeys.add(childKey);
        return { status: 'committed', receipt: { replayed } };
    };

    try {
        await assert.rejects(() => executeGoalMovementWrite({
            store: context.store,
            operationKey,
            userId: 'user-a',
            messageId: 'message-1',
            goal,
            updatedRow,
            movementRow,
            updateGoalRow,
            appendGoalMovement
        }), /simulated_append_failure/);
        assert.strictEqual(context.store.getWriteReceipt(operationKey).status, 'prepared');

        const committed = await executeGoalMovementWrite({
            store: context.store,
            operationKey,
            userId: 'user-a',
            messageId: 'message-1',
            goal,
            updatedRow,
            movementRow,
            updateGoalRow,
            appendGoalMovement
        });
        assert.strictEqual(committed.replayed, false);
        assert.strictEqual(committed.shadowProjected, true);
        assert.strictEqual(context.store.getWriteReceipt(operationKey).status, 'shadow_committed');
        assert.strictEqual(context.store.listPlanVersions(planId).length, 1);
        assert.strictEqual(context.store.readProjection().plans[0].amounts.current_cents, 200000);
        assert.strictEqual(context.store.readProjection().plan_movements.length, 1);

        const restarted = context.restart();
        const replay = await executeGoalMovementWrite({
            store: restarted,
            operationKey,
            userId: 'user-a',
            messageId: 'message-1',
            goal: { ...goal, row: updatedRow },
            updatedRow: [...updatedRow.slice(0, 2), 2500, ...updatedRow.slice(3)],
            movementRow: ['14/07/2026', 'Reserva', 'Aporte', 500, 2000, 2500, '', 'Daniel', 'user-a', 'user-a'],
            updateGoalRow,
            appendGoalMovement
        });
        assert.strictEqual(replay.replayed, true);
        assert.strictEqual(restarted.listPlanVersions(planId).length, 1);
        assert.strictEqual(restarted.readProjection().plan_movements.length, 1);
        assert.strictEqual(updateKeys.size, 1);
        assert.strictEqual(appendKeys.size, 1);
    } finally {
        context.cleanup();
    }
});

test('5C debt payment writes one plan movement without creating expense or income events', async () => {
    const context = tempStore();
    const planId = 'plan_debt_house';
    context.store.bindLegacyIdentity({
        sourceType: 'sheet.dividas',
        legacyRef: 'sheet.dividas:row:2',
        planId,
        identityStatus: 'stable'
    });
    const operationKey = 'debt-operation-1';
    const debt = {
        rowIndex: 2,
        headers: DEBT_HEADERS,
        row: ['Casa', 'Banco', 'Financiamento', 1000, 1000, 100, '1% a.m.', 10, '01/01/2026', 10, 0, 'Ativa', '', '0%', '', '', 'PRICE', 'user-a']
    };
    const updatedRow = [...debt.row];
    updatedRow[4] = 900;
    const updateKeys = new Set();

    try {
        const result = await executeDebtPaymentWrite({
            store: context.store,
            operationKey,
            userId: 'user-a',
            messageId: 'message-debt-1',
            debt,
            updatedRow,
            amount: 100,
            occurredOn: '14/07/2026',
            updateDebtRow: async ({ operationKey: childKey }) => {
                const replayed = updateKeys.has(childKey);
                updateKeys.add(childKey);
                return { status: 'committed', receipt: { replayed } };
            }
        });
        assert.strictEqual(result.shadowProjected, true);
        const projection = context.store.readProjection();
        assert.strictEqual(projection.plans[0].amounts.outstanding_cents, 90000);
        assert.strictEqual(projection.plan_movements[0].type, 'payment');
        assert.strictEqual(projection.plan_movements[0].amount_cents, 10000);
        assert.strictEqual(projection.plan_movements[0].balance_before_cents, 100000);
        assert.strictEqual(projection.plan_movements[0].balance_after_cents, 90000);
        assert.deepStrictEqual(Object.keys(projection).sort(), ['issues', 'plan_movements', 'plans', 'schema_version', 'stats']);
    } finally {
        context.cleanup();
    }
});

test('5C reports a committed legacy write as shadow-pending instead of a false failure', async () => {
    const context = tempStore();
    const debt = {
        rowIndex: 2,
        headers: DEBT_HEADERS,
        row: ['Casa', 'Banco', 'Financiamento', 1000, 1000, 100, '1% a.m.', 10, '01/01/2026', 10, 0, 'Ativa', '', '0%', '', '', 'PRICE', 'user-a']
    };
    const updatedRow = [...debt.row];
    updatedRow[4] = 900;
    const originalPersist = context.store.persistCommittedWrite.bind(context.store);
    let failShadowOnce = true;
    context.store.persistCommittedWrite = (...args) => {
        if (failShadowOnce) {
            failShadowOnce = false;
            throw new Error('simulated_shadow_failure');
        }
        return originalPersist(...args);
    };
    let legacyCalls = 0;
    const input = {
        store: context.store,
        operationKey: 'debt-shadow-pending-1',
        userId: 'user-a',
        messageId: 'message-debt-pending-1',
        debt,
        updatedRow,
        amount: 100,
        occurredOn: '14/07/2026',
        updateDebtRow: async () => {
            legacyCalls += 1;
            return { status: 'committed', receipt: { replayed: legacyCalls > 1 } };
        }
    };

    try {
        const pending = await executeDebtPaymentWrite(input);
        assert.strictEqual(pending.shadowProjected, false);
        assert.strictEqual(pending.shadowPending, true);
        assert.strictEqual(context.store.getWriteReceipt(input.operationKey).status, 'legacy_committed');
        assert.strictEqual(context.store.readProjection(), null);

        const recovered = await executeDebtPaymentWrite(input);
        assert.strictEqual(recovered.shadowProjected, true);
        assert.strictEqual(recovered.shadowPending, false);
        assert.strictEqual(context.store.getWriteReceipt(input.operationKey).status, 'shadow_committed');
        assert.strictEqual(context.store.readProjection().plan_movements.length, 1);
        assert.strictEqual(legacyCalls, 2);
    } finally {
        context.cleanup();
    }
});
