require('dotenv').config();

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getAllUsers } = require('../src/services/userService');
const {
    appendRowToSheet,
    deleteRowsByIndices,
    readDataFromSheet,
    runWithUserSheetContext,
    updateRowInSheet
} = require('../src/services/google');
const {
    GOAL_MOVEMENTS_SHEET,
    buildUpdatedGoalRow,
    goalRowToObject
} = require('../src/services/goalService');
const { getFormattedDate, normalizeText } = require('../src/utils/helpers');
const {
    closeProjectedPlanWriteRuntime,
    getProjectedPlanWriteContext
} = require('../src/plans/projectedPlanWriteRuntime');
const {
    executeDebtPaymentWrite,
    executeGoalMovementWrite
} = require('../src/plans/projectedPlanWriteService');

function buildMarker(date = new Date()) {
    return `TESTE_APAGAR_PLAN_WRITES_${date.toISOString().replace(/\D/g, '').slice(0, 14)}`;
}

function sanitizeMarker(value) {
    const marker = String(value || '').trim().replace(/[^A-Za-z0-9_]/g, '_').slice(0, 80);
    if (!/^TESTE_APAGAR_[A-Za-z0-9_]+$/.test(marker)) throw new Error('Marcador E2E inválido.');
    return marker;
}

function resolveFixtureUser(users, lookup) {
    const normalized = normalizeText(String(lookup || '').trim());
    const digits = String(lookup || '').replace(/\D/g, '');
    if (!normalized && !digits) throw new Error('PROJECTED_PLAN_E2E_USER_LOOKUP é obrigatório.');
    const matches = (users || []).filter(user => user.status === 'ACTIVE').filter(user => {
        return (normalized && normalizeText(user.display_name || '') === normalized)
            || (digits && String(user.phone_e164 || user.whatsapp_id || '').replace(/\D/g, '') === digits);
    });
    if (matches.length !== 1 || !matches[0]?.user_id) {
        throw new Error('PROJECTED_PLAN_E2E_USER_LOOKUP deve identificar um único usuário ACTIVE.');
    }
    return matches[0];
}

function rowHasMarker(row, marker) {
    const escaped = String(marker || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!escaped) return false;
    const exact = new RegExp(`(^|[^A-Za-z0-9_])${escaped}(?=$|[^A-Za-z0-9_])`);
    return (row || []).some(cell => exact.test(String(cell || '')));
}

async function markerRows(sheetName, marker) {
    const rows = await readDataFromSheet(`${sheetName}!A:Z`);
    return {
        headers: rows[0] || [],
        matches: rows.map((row, index) => ({ row, index })).filter(item => item.index > 0 && rowHasMarker(item.row, marker))
    };
}

async function cleanupMarker(marker) {
    for (const sheetName of [GOAL_MOVEMENTS_SHEET, 'Metas', 'Dívidas', 'Saídas', 'Entradas']) {
        const { matches } = await markerRows(sheetName, marker);
        if (matches.length > 0) {
            await deleteRowsByIndices(sheetName, matches.map(item => item.index), {
                source: 'projected_plan_writes_e2e.cleanup'
            });
        }
    }
}

async function assertMarkerRemoved(marker) {
    for (const sheetName of [GOAL_MOVEMENTS_SHEET, 'Metas', 'Dívidas', 'Saídas', 'Entradas']) {
        const { matches } = await markerRows(sheetName, marker);
        if (matches.length !== 0) throw new Error(`Cleanup incompleto em ${sheetName}.`);
    }
}

async function runWrites(marker, user) {
    const goalName = `Reserva ${marker}`;
    const debtName = `Empréstimo ${marker}`;
    const goalInitial = 100;
    const goalContribution = 12.41;
    const debtInitial = 100;
    const debtPayment = 12.42;

    await cleanupMarker(marker);
    await appendRowToSheet('Metas', [
        goalName, 1000, goalInitial, '', 100, '31/12/2027', 'Em andamento', 'Alta', user.user_id, 'personal', getFormattedDate()
    ], { operationKey: `e2e:${marker}:seed:goal`, userId: user.user_id, source: 'projected_plan_writes_e2e.seed' });
    await appendRowToSheet('Dívidas', [
        debtName, 'Credor E2E', 'Empréstimo', debtInitial, debtInitial, debtPayment, '', 27, '01/01/2026', 10, 0,
        'Ativa', marker, '0%', '', '', '', user.user_id
    ], { operationKey: `e2e:${marker}:seed:debt`, userId: user.user_id, source: 'projected_plan_writes_e2e.seed' });

    const context = getProjectedPlanWriteContext(user.user_id);
    if (!context.policy.shadowWritesAllowed || !context.store) throw new Error(`Canário 5C bloqueado: ${context.policy.reason}.`);

    const goalRows = await markerRows('Metas', marker);
    if (goalRows.matches.length !== 1) throw new Error('Fixture de meta não ficou isolada.');
    const goalMatch = goalRows.matches[0];
    const goal = goalRowToObject(goalMatch.row, goalMatch.index + 1, goalRows.headers);
    const goalAfter = goalInitial + goalContribution;
    const updatedGoalRow = buildUpdatedGoalRow(goal, { current: goalAfter, lastMovement: getFormattedDate() });
    const movementRow = [
        getFormattedDate(), goalName, 'Aporte', goalContribution, goalInitial, goalAfter, marker,
        user.display_name || 'E2E', user.user_id, user.user_id
    ];
    const goalInput = {
        store: context.store,
        operationKey: `e2e:${marker}:goal:contribution`,
        userId: user.user_id,
        messageId: `e2e-${marker}-goal`,
        goal,
        updatedRow: updatedGoalRow,
        movementRow,
        updateGoalRow: ({ range, row, ...options }) => updateRowInSheet(range, row, options),
        appendGoalMovement: ({ sheetName, row, ...options }) => appendRowToSheet(sheetName, row, options)
    };
    const goalFirst = await executeGoalMovementWrite(goalInput);
    const goalReplay = await executeGoalMovementWrite(goalInput);
    if (!goalFirst.shadowProjected || !goalReplay.replayed) throw new Error('Meta não confirmou projeção e replay idempotente.');

    const goalAfterContributionRows = await markerRows('Metas', marker);
    const currentGoalMatch = goalAfterContributionRows.matches[0];
    const currentGoal = goalRowToObject(currentGoalMatch.row, currentGoalMatch.index + 1, goalAfterContributionRows.headers);
    const pausedGoalRow = buildUpdatedGoalRow(currentGoal, { status: 'Pausada', lastMovement: getFormattedDate() });
    const statusResult = await executeGoalMovementWrite({
        store: context.store,
        operationKey: `e2e:${marker}:goal:status`,
        userId: user.user_id,
        messageId: `e2e-${marker}-goal-status`,
        goal: currentGoal,
        updatedRow: pausedGoalRow,
        movementRow: [
            getFormattedDate(), goalName, 'Status: Pausada', 0, goalAfter, goalAfter, marker,
            user.display_name || 'E2E', user.user_id, user.user_id
        ],
        updateGoalRow: ({ range, row, ...options }) => updateRowInSheet(range, row, options),
        appendGoalMovement: ({ sheetName, row, ...options }) => appendRowToSheet(sheetName, row, options)
    });
    if (!statusResult.shadowProjected) throw new Error('Status da meta não foi projetado.');

    const debtRows = await markerRows('Dívidas', marker);
    if (debtRows.matches.length !== 1) throw new Error('Fixture de dívida não ficou isolada.');
    const debtMatch = debtRows.matches[0];
    const updatedDebtRow = [...debtMatch.row];
    updatedDebtRow[4] = debtInitial - debtPayment;
    updatedDebtRow[13] = `${((debtPayment / debtInitial) * 100).toFixed(2)}%`;
    const debtInput = {
        store: context.store,
        operationKey: `e2e:${marker}:debt:payment`,
        userId: user.user_id,
        messageId: `e2e-${marker}-debt`,
        debt: { row: debtMatch.row, rowIndex: debtMatch.index + 1, headers: debtRows.headers },
        updatedRow: updatedDebtRow,
        amount: debtPayment,
        occurredOn: getFormattedDate(),
        updateDebtRow: ({ range, row, ...options }) => updateRowInSheet(range, row, options)
    };
    const debtFirst = await executeDebtPaymentWrite(debtInput);
    const debtReplay = await executeDebtPaymentWrite(debtInput);
    if (!debtFirst.shadowProjected || !debtReplay.replayed) throw new Error('Dívida não confirmou projeção e replay idempotente.');

    const goalResult = await markerRows('Metas', marker);
    const debtResult = await markerRows('Dívidas', marker);
    const movementResult = await markerRows(GOAL_MOVEMENTS_SHEET, marker);
    const expenses = await markerRows('Saídas', marker);
    const incomes = await markerRows('Entradas', marker);
    if (goalResult.matches.length !== 1 || Number(goalResult.matches[0].row[2]) !== goalAfter) throw new Error('Saldo final da meta divergiu.');
    if (debtResult.matches.length !== 1 || Number(debtResult.matches[0].row[4]) !== debtInitial - debtPayment) throw new Error('Saldo final da dívida divergiu.');
    if (movementResult.matches.length !== 2) throw new Error('Movimento de meta duplicado ou ausente.');
    if (expenses.matches.length !== 0 || incomes.matches.length !== 0) throw new Error('Movimento de plano contaminou Entradas ou Saídas.');

    const projection = context.store.readProjection();
    const plans = projection?.plans?.filter(plan => String(plan.name || '').includes(marker)) || [];
    const planIds = new Set(plans.map(plan => plan.plan_id));
    const movements = projection?.plan_movements?.filter(item => planIds.has(item.plan_id)) || [];
    if (plans.length !== 2 || movements.length !== 3) throw new Error('Projeção isolada não contém exatamente dois planos e três movimentos.');
    if (!movements.some(item => item.type === 'contribution')
        || !movements.some(item => item.type === 'status_change')
        || !movements.some(item => item.type === 'payment')) {
        throw new Error('Tipos de movimento projetados divergiram.');
    }
    return { planCount: plans.length, movementCount: movements.length };
}

async function main() {
    const marker = sanitizeMarker(process.env.PROJECTED_PLAN_E2E_RUN_ID || buildMarker());
    const dbPath = path.join(os.tmpdir(), `projected-plan-e2e-${marker}.sqlite`);
    process.env.PROJECTED_PLANS_DB_PATH = dbPath;
    const user = resolveFixtureUser(await getAllUsers(), process.env.PROJECTED_PLAN_E2E_USER_LOOKUP);
    let result;
    let cleanupError = null;
    try {
        result = await runWithUserSheetContext(user, () => runWrites(marker, user));
    } finally {
        await runWithUserSheetContext(user, async () => {
            try {
                await cleanupMarker(marker);
                await assertMarkerRemoved(marker);
            } catch (error) {
                cleanupError = error;
            }
        });
        closeProjectedPlanWriteRuntime();
        for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
    }
    if (cleanupError) throw cleanupError;
    console.log(`[projected-plan-e2e] GO marker=${marker} plans=${result.planCount} movements=${result.movementCount} cleanup=zero privacy=true`);
}

if (require.main === module) {
    main().catch(error => {
        console.error(`[projected-plan-e2e] NO_GO error=${error.message}`);
        process.exit(1);
    });
}

module.exports = {
    assertMarkerRemoved,
    buildMarker,
    cleanupMarker,
    resolveFixtureUser,
    rowHasMarker,
    sanitizeMarker
};
