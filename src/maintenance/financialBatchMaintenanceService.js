const crypto = require('node:crypto');

const { createOperationKey } = require('../reliability/financialWriteLedger');
const { normalizeText, parseSheetDate, parseValue } = require('../utils/helpers');

const BATCH_OPERATIONS = Object.freeze({
    RECATEGORIZE_EXPENSES: 'expense.recategorize_many',
    CORRECT_EXPENSES: 'expense.correct_many'
});

const OPERATION_RULES = Object.freeze({
    [BATCH_OPERATIONS.RECATEGORIZE_EXPENSES]: Object.freeze({
        sheets: ['Saídas', 'Lançamentos Cartão'],
        allowedFields: ['category', 'subcategory'],
        requiredFields: ['category']
    }),
    [BATCH_OPERATIONS.CORRECT_EXPENSES]: Object.freeze({
        sheets: ['Saídas', 'Lançamentos Cartão'],
        allowedFields: ['description', 'notes'],
        requiredFields: []
    })
});

const CRITICAL_FIELDS = new Set([
    'amount', 'date', 'person', 'owner', 'userId', 'financialAccount',
    'paymentMethod', 'cardId', 'cardName', 'installment', 'billingMonth',
    'recurring', 'status'
]);

const SHEET_FIELDS = Object.freeze({
    'Saídas': Object.freeze({
        date: 0,
        description: 1,
        category: 2,
        subcategory: 3,
        amount: 4,
        person: 5,
        paymentMethod: 6,
        recurring: 7,
        notes: 8,
        userId: 9,
        financialAccount: 10
    }),
    'Lançamentos Cartão': Object.freeze({
        date: 0,
        description: 1,
        category: 2,
        amount: 3,
        installment: 4,
        billingMonth: 5,
        cardId: 6,
        cardName: 7,
        notes: 8,
        userId: 9
    })
});

function buildBatchMaintenancePolicy(env = process.env, userId = '') {
    const requestedMode = String(env.BATCH_MAINTENANCE_MODE || 'off').trim().toLowerCase();
    const mode = ['off', 'canary', 'on'].includes(requestedMode) ? requestedMode : 'off';
    const scopedUserId = String(userId || '').trim();
    const allowlist = new Set(String(env.BATCH_MAINTENANCE_USER_IDS || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean));
    if (mode === 'off') return { mode, allowed: false, reason: 'mode_off' };
    if (!scopedUserId) return { mode, allowed: false, reason: 'user_required' };
    if (mode === 'canary' && !allowlist.has(scopedUserId)) {
        return { mode, allowed: false, reason: 'user_not_allowlisted' };
    }
    return { mode, allowed: true, reason: mode === 'on' ? 'mode_on' : 'canary_allowlisted' };
}

function batchError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    error.details = details;
    return error;
}

function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function checksum(value) {
    return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function getOperationRule(operation) {
    const rule = OPERATION_RULES[operation];
    if (!rule) throw batchError('BATCH_OPERATION_FORBIDDEN', 'Operação em lote não permitida.');
    return rule;
}

function cleanTextValue(field, raw) {
    const value = String(raw ?? '').replace(/\s+/g, ' ').trim();
    const maxLength = field === 'notes' ? 240 : 100;
    if (!value && field !== 'subcategory' && field !== 'notes') {
        throw batchError('BATCH_VALUE_REQUIRED', `O campo ${field} não pode ficar vazio.`, { field });
    }
    if (value.length > maxLength) {
        throw batchError('BATCH_VALUE_TOO_LONG', `O campo ${field} excede o limite seguro.`, { field, maxLength });
    }
    if (/^[=+@]/.test(value) || /^-\s*[A-Za-z(]/.test(value)) {
        throw batchError('BATCH_FORMULA_FORBIDDEN', 'Fórmulas não são permitidas em correções em lote.', { field });
    }
    return value;
}

function validateBatchPatch(operation, patch = {}) {
    const rule = getOperationRule(operation);
    const keys = Object.keys(patch || {});
    if (keys.length === 0) throw batchError('BATCH_PATCH_REQUIRED', 'Nenhuma alteração foi informada.');

    for (const field of keys) {
        if (CRITICAL_FIELDS.has(field)) {
            throw batchError('BATCH_CRITICAL_FIELD', 'Campo crítico não pode ser alterado em lote.', { field });
        }
        if (!rule.allowedFields.includes(field)) {
            throw batchError('BATCH_FIELD_FORBIDDEN', 'Campo não permitido para esta operação em lote.', { field });
        }
    }

    for (const required of rule.requiredFields) {
        if (!Object.prototype.hasOwnProperty.call(patch, required)) {
            throw batchError('BATCH_REQUIRED_FIELD_MISSING', 'Campo obrigatório ausente.', { field: required });
        }
    }

    const normalized = {};
    for (const field of rule.allowedFields) {
        if (Object.prototype.hasOwnProperty.call(patch, field)) {
            normalized[field] = cleanTextValue(field, patch[field]);
        }
    }
    return normalized;
}

function normalizeFilter(filter = {}) {
    const descriptionContains = String(filter.descriptionContains || '').trim();
    const currentCategory = String(filter.currentCategory || '').trim();
    const period = filter.period && Number.isInteger(Number(filter.period.month)) && Number.isInteger(Number(filter.period.year))
        ? { month: Number(filter.period.month), year: Number(filter.period.year) }
        : null;
    if (!descriptionContains && !currentCategory && !period) {
        throw batchError('BATCH_FILTER_REQUIRED', 'Um filtro explícito é obrigatório para alterar itens em lote.');
    }
    if (period && (period.month < 1 || period.month > 12 || period.year < 2000 || period.year > 2100)) {
        throw batchError('BATCH_FILTER_INVALID', 'Período inválido para seleção em lote.');
    }
    const tokens = normalizeText(descriptionContains)
        .split(' ')
        .map(token => token.trim())
        .filter(token => token.length >= 2);
    if (descriptionContains && tokens.length === 0) {
        throw batchError('BATCH_FILTER_INVALID', 'Descrição muito ampla para seleção em lote.');
    }
    return { descriptionContains, descriptionTokens: tokens, currentCategory, period };
}

function rowMatchesFilter(row, fields, filter) {
    if (filter.descriptionTokens.length > 0) {
        const description = normalizeText(row[fields.description] || '');
        if (!filter.descriptionTokens.every(token => description.includes(token))) return false;
    }
    if (filter.currentCategory) {
        if (normalizeText(row[fields.category] || '') !== normalizeText(filter.currentCategory)) return false;
    }
    if (filter.period) {
        const date = parseSheetDate(String(row[fields.date] || ''));
        if (!date || date.getMonth() + 1 !== filter.period.month || date.getFullYear() !== filter.period.year) return false;
    }
    return true;
}

function selectBatchCandidates({
    sheetDataByName = {},
    userId,
    operation,
    filter = {},
    maxItems = 25
} = {}) {
    const scopedUserId = String(userId || '').trim();
    if (!scopedUserId) throw batchError('BATCH_USER_REQUIRED', 'Usuário obrigatório para seleção em lote.');
    const rule = getOperationRule(operation);
    const safeFilter = normalizeFilter(filter);
    const limit = Math.min(25, Math.max(1, Number(maxItems) || 25));
    const candidates = [];

    for (const sheetName of rule.sheets) {
        const fields = SHEET_FIELDS[sheetName];
        const rows = Array.isArray(sheetDataByName[sheetName]) ? sheetDataByName[sheetName] : [];
        rows.forEach((row, rowIndex) => {
            if (rowIndex === 0 || !Array.isArray(row)) return;
            if (String(row[fields.userId] || '').trim() !== scopedUserId) return;
            if (!rowMatchesFilter(row, fields, safeFilter)) return;
            candidates.push({
                sheetName,
                rowIndex,
                row: [...row],
                fields,
                userIdIndex: fields.userId
            });
        });
    }

    if (candidates.length > limit) {
        throw batchError('BATCH_LIMIT_EXCEEDED', 'O lote excede o limite seguro e não foi truncado.', {
            count: candidates.length,
            maxItems: limit
        });
    }

    const countsBySheet = {};
    for (const item of candidates) {
        countsBySheet[item.sheetName] = (countsBySheet[item.sheetName] || 0) + 1;
    }
    return { candidates, countsBySheet, filter: safeFilter, maxItems: limit };
}

function applyPatchToRow(candidate, patch) {
    const row = [...candidate.row];
    for (const [field, value] of Object.entries(patch)) {
        const index = candidate.fields[field];
        if (Number.isInteger(index)) row[index] = value;
    }
    return row;
}

function publicFields(row, fields) {
    return {
        date: String(row[fields.date] || ''),
        description: String(row[fields.description] || ''),
        category: String(row[fields.category] || ''),
        subcategory: Number.isInteger(fields.subcategory) ? String(row[fields.subcategory] || '') : '',
        notes: Number.isInteger(fields.notes) ? String(row[fields.notes] || '') : ''
    };
}

function previewChecksumPayload({ operation, patch, items }) {
    return {
        operation,
        patch,
        items: items.map(item => ({
            sheetName: item.sheetName,
            rowIndex: item.rowIndex,
            beforeRow: item.beforeRow,
            afterRow: item.afterRow
        }))
    };
}

function buildBatchMaintenancePreview({ operation, userId, messageId, candidates = [], patch = {} } = {}) {
    const scopedUserId = String(userId || '').trim();
    const sourceMessageId = String(messageId || '').trim();
    if (!scopedUserId || !sourceMessageId) {
        throw batchError('BATCH_PROVENANCE_REQUIRED', 'Usuário e mensagem são obrigatórios no preview.');
    }
    if (!Array.isArray(candidates) || candidates.length === 0) {
        throw batchError('BATCH_EMPTY', 'Nenhum item corresponde ao filtro informado.');
    }
    if (candidates.length > 25) throw batchError('BATCH_LIMIT_EXCEEDED', 'Lote acima do limite seguro.', { count: candidates.length, maxItems: 25 });
    const safePatch = validateBatchPatch(operation, patch);
    const items = candidates.map(candidate => {
        if (String(candidate.row[candidate.userIdIndex] || '').trim() !== scopedUserId) {
            throw batchError('BATCH_SCOPE_MISMATCH', 'Item fora do escopo do usuário.');
        }
        const afterRow = applyPatchToRow(candidate, safePatch);
        return {
            sheetName: candidate.sheetName,
            rowIndex: candidate.rowIndex,
            fields: candidate.fields,
            beforeRow: [...candidate.row],
            afterRow,
            before: publicFields(candidate.row, candidate.fields),
            after: publicFields(afterRow, candidate.fields),
            amountCents: Math.round((parseValue(candidate.row[candidate.fields.amount]) || 0) * 100)
        };
    });
    const payload = previewChecksumPayload({ operation, patch: safePatch, items });
    const previewChecksum = checksum(payload);
    return {
        version: 'financial-batch-maintenance-v1',
        operation,
        userId: scopedUserId,
        messageId: sourceMessageId,
        patch: safePatch,
        items,
        count: items.length,
        countsBySheet: items.reduce((acc, item) => {
            acc[item.sheetName] = (acc[item.sheetName] || 0) + 1;
            return acc;
        }, {}),
        totalAmountCents: items.reduce((sum, item) => sum + item.amountCents, 0),
        criticalFields: [],
        confirmationRequired: true,
        checksum: previewChecksum,
        operationKey: createOperationKey({
            userId: scopedUserId,
            messageId: sourceMessageId,
            operation,
            itemFingerprint: previewChecksum
        })
    };
}

function toPublicBatchPreview(preview) {
    return {
        version: preview.version,
        operation: preview.operation,
        count: preview.count,
        countsBySheet: { ...preview.countsBySheet },
        totalAmountCents: preview.totalAmountCents,
        confirmationRequired: true,
        criticalFields: [...preview.criticalFields],
        patch: { ...preview.patch },
        items: preview.items.map((item, index) => ({
            number: index + 1,
            sheetName: item.sheetName,
            before: { ...item.before },
            after: { ...item.after },
            amountCents: item.amountCents
        }))
    };
}

function rowsEqual(left, right) {
    return stableJson(left) === stableJson(right);
}

function assertPreviewIntegrity(preview) {
    const expected = checksum(previewChecksumPayload(preview));
    if (expected !== preview.checksum) {
        throw batchError('BATCH_PREVIEW_TAMPERED', 'O preview não corresponde mais ao lote preparado.');
    }
}

function childOperationKey(preview, item, index, phase) {
    return createOperationKey({
        userId: preview.userId,
        messageId: preview.messageId,
        operation: `${preview.operation}.${phase}`,
        itemFingerprint: `${preview.checksum}:${index}:${item.sheetName}:${item.rowIndex}`
    });
}

async function executeBatchMaintenance({
    preview,
    confirmed,
    writeLedger,
    readCurrentRow,
    updateRow
} = {}) {
    if (!confirmed) return { status: 'cancelled', writesPerformed: 0 };
    if (!preview || !writeLedger || typeof readCurrentRow !== 'function' || typeof updateRow !== 'function') {
        throw batchError('BATCH_EXECUTION_INVALID', 'Dependências de execução do lote estão incompletas.');
    }
    assertPreviewIntegrity(preview);

    const existing = writeLedger.getOperation(preview.operationKey);
    if (existing?.status === 'committed') {
        return { status: 'committed', updated: preview.count, replayed: true };
    }
    if (existing) {
        throw batchError('BATCH_OPERATION_NOT_RETRYABLE', 'Este lote não pode ser repetido sem um novo preview.', { status: existing.status });
    }

    for (const item of preview.items) {
        const current = await readCurrentRow(item);
        if (!rowsEqual(current, item.beforeRow)) {
            throw batchError('BATCH_PREVIEW_STALE', 'Um item mudou depois do preview; nenhuma alteração foi aplicada.');
        }
    }

    writeLedger.beginOperation({
        operationKey: preview.operationKey,
        actorScope: { userId: preview.userId, scope: 'user_spreadsheet' },
        operation: preview.operation,
        payload: { checksum: preview.checksum, count: preview.count, sheets: Object.keys(preview.countsBySheet) },
        provenance: { messageId: preview.messageId, source: 'financial_batch_maintenance' },
        validationVersion: preview.version
    });

    const applied = [];
    try {
        for (let index = 0; index < preview.items.length; index += 1) {
            const item = preview.items[index];
            const current = await readCurrentRow(item);
            if (!rowsEqual(current, item.beforeRow)) {
                throw batchError('BATCH_PREVIEW_STALE', 'Um item mudou durante a confirmação do lote.');
            }
            await updateRow({
                sheetName: item.sheetName,
                rowIndex: item.rowIndex,
                row: [...item.afterRow],
                phase: 'apply',
                operationKey: childOperationKey(preview, item, index, 'apply')
            });
            applied.push({ item, index });
        }

        writeLedger.commitOperation(preview.operationKey, {
            receipt: { updated: applied.length, sheets: Object.keys(preview.countsBySheet) }
        });
        return { status: 'committed', updated: applied.length, replayed: false };
    } catch (error) {
        let rollbackFailed = false;
        for (const { item, index } of [...applied].reverse()) {
            try {
                await updateRow({
                    sheetName: item.sheetName,
                    rowIndex: item.rowIndex,
                    row: [...item.beforeRow],
                    phase: 'rollback',
                    operationKey: childOperationKey(preview, item, index, 'rollback')
                });
            } catch (_rollbackError) {
                rollbackFailed = true;
            }
        }

        if (rollbackFailed) {
            writeLedger.markUncertain(preview.operationKey, {
                receipt: { applied: applied.length, rollback: 'incomplete' }
            });
            throw batchError('BATCH_WRITE_UNCERTAIN', 'Falha parcial com rollback incompleto; revisão manual obrigatória.');
        }

        writeLedger.markFailed(preview.operationKey, {
            receipt: { applied: applied.length, rollback: applied.length ? 'complete' : 'not_needed' }
        });
        if (error.code === 'BATCH_PREVIEW_STALE' && applied.length === 0) throw error;
        throw batchError('BATCH_WRITE_ROLLED_BACK', 'A alteração falhou e todas as linhas aplicadas foram restauradas.');
    }
}

module.exports = {
    BATCH_OPERATIONS,
    CRITICAL_FIELDS,
    SHEET_FIELDS,
    buildBatchMaintenancePolicy,
    buildBatchMaintenancePreview,
    executeBatchMaintenance,
    selectBatchCandidates,
    toPublicBatchPreview,
    validateBatchPatch,
    __test__: {
        batchError,
        checksum,
        normalizeFilter,
        rowsEqual,
        stableJson
    }
};
