const stringSimilarity = require('string-similarity');
const { appendRowToSheet, readDataFromSheet, updateRowInSheet } = require('./google');
const { getFormattedDate, normalizeText, parseAmountLocal, parseSheetDate, parseValue } = require('../utils/helpers');

const GOALS_SHEET = 'Metas';
const GOAL_MOVEMENTS_SHEET = 'Movimentações Metas';
const GOAL_HEADERS = Object.freeze([
    'Nome da Meta',
    'Valor Alvo',
    'Valor Atual',
    '% Progresso',
    'Valor Mensal Sugerido',
    'Data Alvo',
    'Status',
    'Prioridade',
    'user_id',
    'Escopo',
    'Última Movimentação'
]);
const GOAL_MOVEMENT_HEADERS = Object.freeze([
    'Data',
    'Meta',
    'Tipo',
    'Valor',
    'Valor Antes',
    'Valor Depois',
    'Observação',
    'Responsável',
    'user_id',
    'goal_user_id'
]);

const GOAL_STATUS = Object.freeze({
    ACTIVE: 'Em andamento',
    PAUSED: 'Pausada',
    CANCELLED: 'Cancelada',
    COMPLETED: 'Concluída'
});

function formatCurrencyBR(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function normalizeGoalStatus(status) {
    const normalized = normalizeText(status || '');
    if (/cancelad/.test(normalized)) return GOAL_STATUS.CANCELLED;
    if (/pausad/.test(normalized)) return GOAL_STATUS.PAUSED;
    if (/concluid|finalizad|atingid/.test(normalized)) return GOAL_STATUS.COMPLETED;
    return GOAL_STATUS.ACTIVE;
}

function isGoalActiveStatus(status) {
    return normalizeGoalStatus(status) === GOAL_STATUS.ACTIVE;
}

function findHeaderIndex(headers, aliases, fallback) {
    const normalizedAliases = aliases.map(alias => normalizeText(alias));
    const found = (headers || []).findIndex(header => normalizedAliases.includes(normalizeText(header || '')));
    return found >= 0 ? found : fallback;
}

function buildGoalIndexes(headers = []) {
    return {
        name: findHeaderIndex(headers, ['Nome da Meta', 'Nome'], 0),
        target: findHeaderIndex(headers, ['Valor Alvo', 'Alvo'], 1),
        current: findHeaderIndex(headers, ['Valor Atual', 'Atual'], 2),
        progress: findHeaderIndex(headers, ['% Progresso', 'Progresso'], 3),
        monthly: findHeaderIndex(headers, ['Valor Mensal Sugerido', 'Valor Mensal', 'Valor Mensal Necessário'], 4),
        targetDate: findHeaderIndex(headers, ['Data Alvo', 'Data Fim', 'Prazo'], 5),
        status: findHeaderIndex(headers, ['Status'], 6),
        priority: findHeaderIndex(headers, ['Prioridade'], 7),
        userId: findHeaderIndex(headers, ['user_id'], 8),
        scope: findHeaderIndex(headers, ['Escopo'], 9),
        lastMovement: findHeaderIndex(headers, ['Última Movimentação', 'Ultima Movimentacao'], 10)
    };
}

function calculateMonthlySuggestion({ target, current, targetDate }) {
    const parsedDate = parseSheetDate(targetDate);
    if (!parsedDate) return 0;
    const now = new Date();
    const monthsRemaining = (parsedDate.getFullYear() - now.getFullYear()) * 12 + (parsedDate.getMonth() - now.getMonth());
    if (monthsRemaining <= 0) return 0;
    return Math.max(0, (Number(target || 0) - Number(current || 0)) / monthsRemaining);
}

function progressFormula() {
    return '=INDIRECT("C"&ROW())/INDIRECT("B"&ROW())';
}

function goalRowToObject(row, rowIndex, headers = []) {
    const idx = buildGoalIndexes(headers);
    const target = parseValue(row[idx.target]);
    const current = parseValue(row[idx.current]);
    const scope = String(row[idx.scope] || 'personal').trim() || 'personal';
    return {
        row,
        rowIndex,
        headers,
        name: String(row[idx.name] || '').trim(),
        target,
        current,
        progressPct: target > 0 ? Math.min(100, (current / target) * 100) : parseValue(row[idx.progress]),
        monthlySuggestion: parseValue(row[idx.monthly]),
        targetDate: row[idx.targetDate] || '',
        status: normalizeGoalStatus(row[idx.status]),
        priority: row[idx.priority] || '',
        userId: String(row[idx.userId] || '').trim(),
        scope,
        lastMovement: row[idx.lastMovement] || '',
        indexes: idx
    };
}

function userCanMutateGoal(goal, actorUserId) {
    if (!goal || !actorUserId) return false;
    if (goal.userId === actorUserId) return true;
    return goal.scope === 'family';
}

function scoreGoal(goal, query) {
    const goalName = normalizeText(goal.name || '');
    const normalizedQuery = normalizeText(query || '');
    if (!goalName || !normalizedQuery) return 0;
    if (goalName === normalizedQuery) return 100;
    if (goalName.includes(normalizedQuery) || normalizedQuery.includes(goalName)) return 80;
    return Math.round(stringSimilarity.compareTwoStrings(goalName, normalizedQuery) * 70);
}

function findGoalMatch(goals, query) {
    const scored = goals
        .map(goal => ({ goal, score: scoreGoal(goal, query) }))
        .sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best || best.score < 35) return null;
    return best.goal;
}

async function listGoals({ actorUserId, financialScopeUserIds = [actorUserId] } = {}) {
    const rows = await readDataFromSheet(`${GOALS_SHEET}!A:K`);
    const headers = rows[0] || GOAL_HEADERS;
    const scopeIds = new Set((financialScopeUserIds || [actorUserId]).map(id => String(id || '').trim()).filter(Boolean));
    return rows.slice(1)
        .map((row, offset) => goalRowToObject(row, offset + 2, headers))
        .filter(goal => goal.name && scopeIds.has(goal.userId))
        .filter(goal => userCanMutateGoal(goal, actorUserId));
}

function buildUpdatedGoalRow(goal, updates = {}) {
    const row = [...goal.row];
    const current = updates.current !== undefined ? Number(updates.current || 0) : goal.current;
    const target = updates.target !== undefined ? Number(updates.target || 0) : goal.target;
    const status = updates.status || (current >= target && target > 0 ? GOAL_STATUS.COMPLETED : goal.status);
    const scope = updates.scope || goal.scope || 'personal';
    const targetDate = updates.targetDate || goal.targetDate || '';
    const monthly = calculateMonthlySuggestion({ target, current, targetDate });

    row[0] = updates.name || goal.name;
    row[1] = target;
    row[2] = current;
    row[3] = progressFormula();
    row[4] = monthly;
    row[5] = targetDate;
    row[6] = status;
    row[7] = updates.priority || goal.priority || '';
    row[8] = goal.userId;
    row[9] = scope;
    row[10] = updates.lastMovement || getFormattedDate();

    return GOAL_HEADERS.map((_, index) => row[index] ?? '');
}

async function previewGoalMovement({ actorUserId, financialScopeUserIds = [actorUserId], goalQuery, type, amount }) {
    const safeAmount = Number(amount || 0);
    if (!goalQuery || !String(goalQuery).trim()) {
        return { ok: false, reason: 'missing_goal', message: 'Diga o nome da meta. Ex.: `guardei 500 na meta reserva`.' };
    }
    if (!['aporte', 'retirada', 'ajuste'].includes(type)) {
        return { ok: false, reason: 'invalid_type', message: 'Tipo de movimentação de meta inválido.' };
    }
    if (!Number.isFinite(safeAmount) || safeAmount < 0 || (safeAmount === 0 && type !== 'ajuste')) {
        return { ok: false, reason: 'invalid_amount', message: 'Valor inválido. Use um valor maior que zero.' };
    }

    const goals = await listGoals({ actorUserId, financialScopeUserIds });
    const goal = findGoalMatch(goals, goalQuery);
    if (!goal) {
        return {
            ok: false,
            reason: 'goal_not_found',
            message: goals.length
                ? `Não encontrei essa meta. Metas disponíveis: ${goals.map(item => item.name).join(', ')}.`
                : 'Você ainda não tem metas cadastradas. Envie `criar meta` para começar.'
        };
    }

    const before = Number(goal.current || 0);
    let after = before;
    if (type === 'aporte') after = before + safeAmount;
    if (type === 'retirada') after = before - safeAmount;
    if (type === 'ajuste') after = safeAmount;
    if (after < 0) {
        return {
            ok: false,
            reason: 'negative_goal_balance',
            message: `Essa retirada deixaria a meta "${goal.name}" negativa. Saldo atual: ${formatCurrencyBR(before)}.`
        };
    }

    const movementLabel = type === 'aporte' ? 'Aporte' : type === 'retirada' ? 'Retirada' : 'Ajuste';
    const updatedRow = buildUpdatedGoalRow(goal, {
        current: after,
        lastMovement: getFormattedDate()
    });

    return {
        ok: true,
        goal,
        before,
        after,
        safeAmount,
        movementAmount: type === 'ajuste' ? Math.abs(after - before) : safeAmount,
        movementLabel,
        updatedRow
    };
}

async function applyGoalMovement({
    actorUserId,
    actorName = '',
    financialScopeUserIds = [actorUserId],
    goalQuery,
    type,
    amount,
    note = '',
    projectedPlanStore = null,
    operationKey = '',
    messageId = ''
}) {
    if (projectedPlanStore && operationKey) {
        const existing = projectedPlanStore.getWriteReceipt(operationKey);
        if (existing?.status === 'shadow_committed') {
            const movement = existing.payload?.movement || {};
            const plan = existing.payload?.plan || {};
            return {
                ok: true,
                replayed: true,
                goal: { name: plan.name, current: Number(movement.balance_after_cents || 0) / 100 },
                before: Number(movement.balance_before_cents || 0) / 100,
                after: Number(movement.balance_after_cents || 0) / 100,
                type: movement.type,
                message: `Essa movimentação da meta "${plan.name}" já havia sido registrada. Saldo: ${formatCurrencyBR(Number(movement.balance_after_cents || 0) / 100)}.`
            };
        }
    }

    const preview = await previewGoalMovement({ actorUserId, financialScopeUserIds, goalQuery, type, amount });
    if (!preview.ok) return preview;
    const { goal, before, after, movementAmount, movementLabel, updatedRow } = preview;
    const movementRow = [
        getFormattedDate(),
        goal.name,
        movementLabel,
        Number(movementAmount || 0),
        Number(before || 0),
        Number(after || 0),
        note,
        actorName || 'Usuário',
        actorUserId,
        goal.userId
    ];

    let replayed = false;
    let shadowPending = false;
    if (projectedPlanStore && operationKey) {
        const { executeGoalMovementWrite } = require('../plans/projectedPlanWriteService');
        const writeResult = await executeGoalMovementWrite({
            store: projectedPlanStore,
            operationKey,
            userId: actorUserId,
            messageId,
            goal,
            updatedRow,
            movementRow,
            updateGoalRow: ({ range, row, ...options }) => updateRowInSheet(range, row, options),
            appendGoalMovement: ({ sheetName, row, ...options }) => appendRowToSheet(sheetName, row, options)
        });
        replayed = writeResult.replayed === true;
        shadowPending = writeResult.shadowPending === true;
    } else {
        await updateRowInSheet(`${GOALS_SHEET}!A${goal.rowIndex}:K${goal.rowIndex}`, updatedRow);
        await appendRowToSheet(GOAL_MOVEMENTS_SHEET, movementRow);
    }

    return {
        ok: true,
        replayed,
        shadowPending,
        goal: { ...goal, current: after, status: normalizeGoalStatus(updatedRow[6]) },
        before,
        after,
        type: movementLabel,
        message: `✅ ${movementLabel} registrado na meta "${goal.name}". Saldo: ${formatCurrencyBR(before)} → ${formatCurrencyBR(after)}.`
    };
}

async function previewGoalStatus({ actorUserId, financialScopeUserIds = [actorUserId], goalQuery, status }) {
    const goals = await listGoals({ actorUserId, financialScopeUserIds });
    const goal = findGoalMatch(goals, goalQuery);
    if (!goal) {
        return {
            ok: false,
            reason: 'goal_not_found',
            message: goals.length
                ? `Não encontrei essa meta. Metas disponíveis: ${goals.map(item => item.name).join(', ')}.`
                : 'Você ainda não tem metas cadastradas. Envie `criar meta` para começar.'
        };
    }
    const normalizedStatus = normalizeGoalStatus(status);
    const updatedRow = buildUpdatedGoalRow(goal, {
        status: normalizedStatus,
        lastMovement: getFormattedDate()
    });
    return { ok: true, goal, normalizedStatus, updatedRow };
}

async function updateGoalStatus({
    actorUserId,
    actorName = '',
    financialScopeUserIds = [actorUserId],
    goalQuery,
    status,
    note = '',
    projectedPlanStore = null,
    operationKey = '',
    messageId = ''
}) {
    if (projectedPlanStore && operationKey) {
        const existing = projectedPlanStore.getWriteReceipt(operationKey);
        if (existing?.status === 'shadow_committed') {
            const plan = existing.payload?.plan || {};
            return { ok: true, replayed: true, goal: plan, message: `Essa alteração da meta "${plan.name}" já havia sido registrada.` };
        }
    }
    const preview = await previewGoalStatus({ actorUserId, financialScopeUserIds, goalQuery, status });
    if (!preview.ok) return preview;
    const { goal, normalizedStatus, updatedRow } = preview;
    const movementRow = [
        getFormattedDate(),
        goal.name,
        `Status: ${normalizedStatus}`,
        0,
        goal.current,
        goal.current,
        note,
        actorName || 'Usuário',
        actorUserId,
        goal.userId
    ];
    let replayed = false;
    let shadowPending = false;
    if (projectedPlanStore && operationKey) {
        const { executeGoalMovementWrite } = require('../plans/projectedPlanWriteService');
        const result = await executeGoalMovementWrite({
            store: projectedPlanStore,
            operationKey,
            userId: actorUserId,
            messageId,
            goal,
            updatedRow,
            movementRow,
            updateGoalRow: ({ range, row, ...options }) => updateRowInSheet(range, row, options),
            appendGoalMovement: ({ sheetName, row, ...options }) => appendRowToSheet(sheetName, row, options)
        });
        replayed = result.replayed === true;
        shadowPending = result.shadowPending === true;
    } else {
        await updateRowInSheet(`${GOALS_SHEET}!A${goal.rowIndex}:K${goal.rowIndex}`, updatedRow);
        await appendRowToSheet(GOAL_MOVEMENTS_SHEET, movementRow);
    }
    return {
        ok: true,
        replayed,
        shadowPending,
        goal: { ...goal, status: normalizedStatus },
        message: `✅ Meta "${goal.name}" marcada como ${normalizedStatus}.`
    };
}

function extractFirstAmount(rawText) {
    const raw = String(rawText || '');
    const match = raw.match(/(?:r\$\s*)?(?:\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i);
    if (!match) return { amount: null, matchText: '' };
    return { amount: parseAmountLocal(match[0]), matchText: match[0] };
}

function cleanupGoalQuery(text) {
    return normalizeText(text || '')
        .replace(/\b(meta|objetivo|cofrinho)\b/g, ' ')
        .replace(/\b(para|pra|em|na|no|da|do|de|a|o)\b/g, ' ')
        .replace(/\b(r\$\s*)?\d+(?:[.,]\d+)?\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseGoalCommand(rawText) {
    const raw = String(rawText || '').trim();
    const text = normalizeText(raw).replace(/\s+/g, ' ').trim();
    if (!text || /^criar\s+meta\b/.test(text)) return null;

    const statusMatch = text.match(/^(pausar|cancelar|retomar|reativar|concluir|finalizar)\s+(?:a\s+|o\s+)?(?:meta\s+)?(.+)$/);
    if (statusMatch) {
        const verb = statusMatch[1];
        const status = verb === 'pausar'
            ? GOAL_STATUS.PAUSED
            : verb === 'cancelar'
                ? GOAL_STATUS.CANCELLED
                : (verb === 'concluir' || verb === 'finalizar')
                    ? GOAL_STATUS.COMPLETED
                    : GOAL_STATUS.ACTIVE;
        return { action: 'status', status, goalQuery: cleanupGoalQuery(statusMatch[2]) };
    }

    const adjustmentMatch = text.match(/^(?:ajustar|ajustei|corrigir|corrigi|definir)\s+(?:o\s+|a\s+)?(?:saldo\s+)?(?:da\s+|do\s+)?meta\s+(.+?)\s+(?:para|em)\s+(.+)$/);
    if (adjustmentMatch) {
        const amount = parseAmountLocal(adjustmentMatch[2]);
        return { action: 'movement', type: 'ajuste', amount, goalQuery: cleanupGoalQuery(adjustmentMatch[1]) };
    }

    const hasGoalSignal = /\b(meta|objetivo|cofrinho)\b/.test(text);
    const addVerb = /\b(guardei|juntei|adicionei|coloquei|aportei|depositei|separei)\b/.test(text);
    const withdrawVerb = /\b(retirei|resgatei|saquei|usei|tirei|mexi)\b/.test(text);
    if (!hasGoalSignal || (!addVerb && !withdrawVerb)) return null;

    const { amount, matchText } = extractFirstAmount(raw);
    const withoutAmount = matchText ? raw.replace(matchText, ' ') : raw;
    const normalizedWithoutAmount = normalizeText(withoutAmount);
    const goalMatch = normalizedWithoutAmount.match(/\b(?:na|no|para a|para o|para|em|da|do)\s+(?:meta|objetivo|cofrinho)\s+(.+)$/)
        || normalizedWithoutAmount.match(/\b(?:meta|objetivo|cofrinho)\s+(.+)$/);
    const goalQuery = cleanupGoalQuery(goalMatch?.[1] || normalizedWithoutAmount);
    return {
        action: 'movement',
        type: addVerb ? 'aporte' : 'retirada',
        amount,
        goalQuery
    };
}

module.exports = {
    GOAL_HEADERS,
    GOAL_MOVEMENT_HEADERS,
    GOAL_MOVEMENTS_SHEET,
    GOALS_SHEET,
    GOAL_STATUS,
    applyGoalMovement,
    buildGoalIndexes,
    buildUpdatedGoalRow,
    calculateMonthlySuggestion,
    formatCurrencyBR,
    goalRowToObject,
    isGoalActiveStatus,
    listGoals,
    normalizeGoalStatus,
    parseGoalCommand,
    previewGoalMovement,
    previewGoalStatus,
    updateGoalStatus,
    __test__: {
        cleanupGoalQuery,
        extractFirstAmount,
        findGoalMatch,
        scoreGoal
    }
};
