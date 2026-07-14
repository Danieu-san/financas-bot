const { createOperationKey } = require('../reliability/financialWriteLedger');
const {
    adaptLegacyGoalRow,
    adaptLegacyDebtRow,
    buildCommittedPlanMovement,
    __test__: { moneyToCents }
} = require('./projectedPlansContract');

const ALLOWED_MODES = new Set(['off', 'shadow']);

function buildProjectedPlanWritePolicy(env = process.env, userId = '') {
    const rawMode = String(env.PROJECTED_PLAN_WRITES_MODE || 'off').trim().toLowerCase();
    if (!ALLOWED_MODES.has(rawMode)) return { mode: 'off', shadowWritesAllowed: false, reason: 'invalid_mode' };
    if (rawMode === 'off') return { mode: 'off', shadowWritesAllowed: false, reason: 'mode_off' };
    const allowlist = String(env.PROJECTED_PLAN_WRITES_USER_IDS || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
    if (allowlist.length === 0) return { mode: 'shadow', shadowWritesAllowed: false, reason: 'allowlist_empty' };
    if (!allowlist.includes(String(userId || '').trim())) return { mode: 'shadow', shadowWritesAllowed: false, reason: 'user_not_allowlisted' };
    return { mode: 'shadow', shadowWritesAllowed: true, reason: 'allowed' };
}

function childOperationKey({ operationKey, userId, messageId, operation }) {
    return createOperationKey({
        userId,
        messageId: messageId || operationKey,
        operation,
        itemFingerprint: operationKey
    });
}

function movementTypeFromLegacyLabel(label) {
    const normalized = String(label || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (normalized.includes('retirada') || normalized.includes('resgate')) return 'withdrawal';
    if (normalized.includes('ajuste')) return 'adjustment';
    if (normalized.includes('status')) return 'status_change';
    return 'contribution';
}

function ensureIdentity(store, { sourceType, legacyRef, provisionalPlan }) {
    const existing = store.resolveLegacyIdentity({ sourceType, legacyRef });
    if (existing?.state === 'active') return existing;
    if (existing) throw new Error('projected_plan_identity_not_active');
    return store.bindLegacyIdentity({
        sourceType,
        legacyRef,
        planId: provisionalPlan.plan_id,
        identityStatus: 'stable'
    });
}

function prepareGoalPayload({ store, operationKey, userId, messageId, goal, updatedRow, movementRow }) {
    const existing = store.getWriteReceipt(operationKey);
    if (existing) return { receipt: existing, payload: existing.payload, replayed: true };
    const sourceType = 'sheet.metas';
    const legacyRef = `${sourceType}:row:${goal.rowIndex}`;
    const provisional = adaptLegacyGoalRow({ row: updatedRow, headers: goal.headers, rowIndex: goal.rowIndex, legacyRef });
    const identity = ensureIdentity(store, { sourceType, legacyRef, provisionalPlan: provisional });
    const currentPlan = store.getCurrentPlan(identity.plan_id);
    const plan = adaptLegacyGoalRow({
        row: updatedRow,
        headers: goal.headers,
        rowIndex: goal.rowIndex,
        legacyRef,
        planId: identity.plan_id,
        version: Number(currentPlan?.version || 0) + 1
    });
    const amountCents = moneyToCents(movementRow[3]);
    const beforeCents = moneyToCents(movementRow[4]);
    const afterCents = moneyToCents(movementRow[5]);
    const movement = buildCommittedPlanMovement({
        plan,
        operationKey,
        type: movementTypeFromLegacyLabel(movementRow[2]),
        amountCents,
        balanceBeforeCents: beforeCents,
        balanceAfterCents: afterCents,
        occurredOn: movementRow[0],
        actorUserId: userId,
        sourceType: 'receipt.goal_movement',
        note: ''
    });
    const payload = {
        kind: 'goal_movement',
        plan,
        movement,
        legacy: {
            goal_range: `Metas!A${goal.rowIndex}:K${goal.rowIndex}`,
            goal_row: updatedRow,
            movement_sheet: 'Movimentações Metas',
            movement_row: movementRow,
            update_operation_key: childOperationKey({ operationKey, userId, messageId, operation: 'plan.goal.update' }),
            append_operation_key: childOperationKey({ operationKey, userId, messageId, operation: 'plan.goal.movement.append' })
        }
    };
    const receipt = store.prepareWriteReceipt({ operationKey, payload });
    return { receipt, payload: receipt.payload, replayed: false };
}

async function executeGoalMovementWrite({
    store,
    operationKey,
    userId,
    messageId = '',
    goal,
    updatedRow,
    movementRow,
    updateGoalRow,
    appendGoalMovement
} = {}) {
    if (!store || typeof updateGoalRow !== 'function' || typeof appendGoalMovement !== 'function') throw new Error('goal_write_dependencies_required');
    const prepared = prepareGoalPayload({ store, operationKey, userId, messageId, goal, updatedRow, movementRow });
    if (prepared.receipt.status === 'shadow_committed') {
        return { replayed: true, shadowProjected: true, receipt: prepared.receipt };
    }
    const payload = prepared.payload;
    await updateGoalRow({
        range: payload.legacy.goal_range,
        row: payload.legacy.goal_row,
        operationKey: payload.legacy.update_operation_key,
        userId,
        messageId,
        source: 'projected_plan.goal_movement'
    });
    await appendGoalMovement({
        sheetName: payload.legacy.movement_sheet,
        row: payload.legacy.movement_row,
        operationKey: payload.legacy.append_operation_key,
        userId,
        messageId,
        source: 'projected_plan.goal_movement'
    });
    store.markLegacyWriteCommitted(operationKey, { legacy_writes: 2 });
    try {
        const shadow = store.persistCommittedWrite({ operationKey, plan: payload.plan, movement: payload.movement });
        return { replayed: shadow.replayed, shadowProjected: true, shadowPending: false, receipt: store.getWriteReceipt(operationKey) };
    } catch (error) {
        const receipt = store.getWriteReceipt(operationKey);
        if (receipt?.status !== 'legacy_committed') throw error;
        return { replayed: false, shadowProjected: false, shadowPending: true, receipt };
    }
}

function prepareDebtPayload({ store, operationKey, userId, messageId, debt, updatedRow, amount, occurredOn }) {
    const existing = store.getWriteReceipt(operationKey);
    if (existing) return { receipt: existing, payload: existing.payload, replayed: true };
    const sourceType = 'sheet.dividas';
    const legacyRef = `${sourceType}:row:${debt.rowIndex}`;
    const provisional = adaptLegacyDebtRow({ row: updatedRow, headers: debt.headers, rowIndex: debt.rowIndex, legacyRef });
    const identity = ensureIdentity(store, { sourceType, legacyRef, provisionalPlan: provisional });
    const currentPlan = store.getCurrentPlan(identity.plan_id);
    const plan = adaptLegacyDebtRow({
        row: updatedRow,
        headers: debt.headers,
        rowIndex: debt.rowIndex,
        legacyRef,
        planId: identity.plan_id,
        version: Number(currentPlan?.version || 0) + 1
    });
    const movement = buildCommittedPlanMovement({
        plan,
        operationKey,
        type: 'payment',
        amountCents: moneyToCents(amount),
        balanceBeforeCents: moneyToCents(debt.row[4]),
        balanceAfterCents: moneyToCents(updatedRow[4]),
        occurredOn,
        actorUserId: userId,
        sourceType: 'receipt.debt_payment',
        note: ''
    });
    const lastColumn = String.fromCharCode(64 + updatedRow.length);
    const payload = {
        kind: 'debt_payment',
        plan,
        movement,
        legacy: {
            debt_range: `Dívidas!A${debt.rowIndex}:${lastColumn}${debt.rowIndex}`,
            debt_row: updatedRow,
            update_operation_key: childOperationKey({ operationKey, userId, messageId, operation: 'plan.debt.update' })
        }
    };
    const receipt = store.prepareWriteReceipt({ operationKey, payload });
    return { receipt, payload: receipt.payload, replayed: false };
}

async function executeDebtPaymentWrite({
    store,
    operationKey,
    userId,
    messageId = '',
    debt,
    updatedRow,
    amount,
    occurredOn,
    updateDebtRow
} = {}) {
    if (!store || typeof updateDebtRow !== 'function') throw new Error('debt_write_dependencies_required');
    const prepared = prepareDebtPayload({ store, operationKey, userId, messageId, debt, updatedRow, amount, occurredOn });
    if (prepared.receipt.status === 'shadow_committed') {
        return { replayed: true, shadowProjected: true, receipt: prepared.receipt };
    }
    const payload = prepared.payload;
    await updateDebtRow({
        range: payload.legacy.debt_range,
        row: payload.legacy.debt_row,
        operationKey: payload.legacy.update_operation_key,
        userId,
        messageId,
        source: 'projected_plan.debt_payment'
    });
    store.markLegacyWriteCommitted(operationKey, { legacy_writes: 1 });
    try {
        const shadow = store.persistCommittedWrite({ operationKey, plan: payload.plan, movement: payload.movement });
        return { replayed: shadow.replayed, shadowProjected: true, shadowPending: false, receipt: store.getWriteReceipt(operationKey) };
    } catch (error) {
        const receipt = store.getWriteReceipt(operationKey);
        if (receipt?.status !== 'legacy_committed') throw error;
        return { replayed: false, shadowProjected: false, shadowPending: true, receipt };
    }
}

module.exports = {
    buildProjectedPlanWritePolicy,
    executeGoalMovementWrite,
    executeDebtPaymentWrite,
    __test__: {
        childOperationKey,
        movementTypeFromLegacyLabel
    }
};
