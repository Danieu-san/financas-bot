const userStateManager = require('../state/userStateManager');
const { readDataFromSheet, updateRowInSheet } = require('../services/google');
const { markReadModelDirty } = require('../services/readModelService');
const { FinancialWriteLedger } = require('../reliability/financialWriteLedger');
const { normalizeText } = require('../utils/helpers');
const {
    BATCH_OPERATIONS,
    buildBatchMaintenancePolicy,
    buildBatchMaintenancePreview,
    executeBatchMaintenance,
    selectBatchCandidates,
    toPublicBatchPreview
} = require('../maintenance/financialBatchMaintenanceService');

const PENDING_TTL_MS = 15 * 60 * 1000;
const pendingBatches = new Map();
let defaultWriteLedger = null;

function getDefaultWriteLedger() {
    if (!defaultWriteLedger) {
        defaultWriteLedger = new FinancialWriteLedger({
            dbPath: process.env.BATCH_MAINTENANCE_WRITE_DB_PATH || undefined
        });
    }
    return defaultWriteLedger;
}

function defaultDependencies() {
    return {
        stateManager: userStateManager,
        readDataFromSheet,
        updateRowInSheet,
        getWriteLedger: getDefaultWriteLedger,
        getPolicy: userId => buildBatchMaintenancePolicy(process.env, userId),
        markReadModelDirty
    };
}

function dependencySet(overrides = {}) {
    return { ...defaultDependencies(), ...overrides };
}

function parseCategoryTarget(raw) {
    const parts = String(raw || '')
        .split('/')
        .map(part => part.replace(/[.!?]+$/g, '').trim())
        .filter(Boolean);
    if (parts.length === 0) return null;
    return {
        category: parts[0],
        ...(parts[1] ? { subcategory: parts[1] } : {})
    };
}

function parseBatchMaintenanceCommand(text) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    const normalized = normalizeText(raw);
    const hasBatchSignal = /\b(todos|todas|gastos|compras|lancamentos|em lote)\b/.test(normalized);
    const hasMaintenanceVerb = /\b(categoriz|recategoriz|corrij|corrig|alter|mud|troqu)/.test(normalized);
    if (!hasBatchSignal || !hasMaintenanceVerb) return null;

    const criticalAliases = [
        ['financialAccount', /\b(conta financeira|conta)\b/],
        ['paymentMethod', /\b(pagamento|forma de pagamento|metodo)\b/],
        ['amount', /\b(valor|preco|quantia)\b/],
        ['date', /\b(data|dia)\b/],
        ['person', /\b(responsavel|pessoa|titular)\b/],
        ['cardName', /\b(cartao)\b/],
        ['installment', /\b(parcela)\b/]
    ];
    if (/\b(corrij|corrig|alter|mud|troqu)/.test(normalized)) {
        for (const [field, pattern] of criticalAliases) {
            if (pattern.test(normalized)) return { kind: 'blocked', field };
        }
    }

    const textCorrection = raw.match(
        /^(?:corrij\w*|alter\w*)\s+(?:a\s+|as\s+|o\s+|os\s+)?(descri[cç][aã]o|observa[cç][aã](?:o|ões|oes))\s+(?:de\s+)?(?:todos\s+os\s+|todas\s+as\s+)?(?:gastos|compras|lan[cç]amentos)\s+(?:com|de|do|da)\s+(.+?)\s+(?:para|como)\s+(.+)$/i
    );
    if (textCorrection) {
        const field = normalizeText(textCorrection[1]).startsWith('descri') ? 'description' : 'notes';
        return {
            kind: 'command',
            operation: BATCH_OPERATIONS.CORRECT_EXPENSES,
            filter: { descriptionContains: textCorrection[2].trim() },
            patch: { [field]: textCorrection[3].replace(/[.!?]+$/g, '').trim() }
        };
    }

    const categoryCommand = raw.match(
        /^(?:categoriz\w*|recategoriz\w*)\s+(?:todos\s+os\s+|todas\s+as\s+)?(?:gastos|compras|lan[cç]amentos)\s+(?:com|de|do|da)\s+(.+?)\s+(?:como|para)\s+(.+)$/i
    ) || raw.match(
        /^(?:mud\w*|troqu\w*|corrij\w*|alter\w*)\s+(?:a\s+)?categoria\s+(?:de\s+)?(?:todos\s+os\s+|todas\s+as\s+)?(?:gastos|compras|lan[cç]amentos)\s+(?:com|de|do|da)\s+(.+?)\s+(?:como|para)\s+(.+)$/i
    );
    if (!categoryCommand) return null;
    const patch = parseCategoryTarget(categoryCommand[2]);
    if (!patch) return null;
    return {
        kind: 'command',
        operation: BATCH_OPERATIONS.RECATEGORIZE_EXPENSES,
        filter: { descriptionContains: categoryCommand[1].trim() },
        patch
    };
}

function senderIdFromMessage(msg = {}) {
    return String(msg.author || msg.from || '').trim();
}

function messageIdFromMessage(msg = {}) {
    return String(msg.id?._serialized || msg.id?.id || msg.messageId || '').trim();
}

function rememberPendingBatch(senderId, preview) {
    pendingBatches.set(senderId, { preview, expiresAt: Date.now() + PENDING_TTL_MS });
}

function getPendingBatch(senderId) {
    const pending = pendingBatches.get(senderId);
    if (!pending) return null;
    if (pending.expiresAt <= Date.now()) {
        pendingBatches.delete(senderId);
        return null;
    }
    return pending.preview;
}

function forgetPendingBatch(senderId) {
    pendingBatches.delete(senderId);
}

function moneyFromCents(cents) {
    return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPreviewMessage(preview) {
    const publicPreview = toPublicBatchPreview(preview);
    const lines = [
        `Preview obrigatório: encontrei *${publicPreview.count} itens* para alterar.`,
        `Valor total apenas informativo: *${moneyFromCents(publicPreview.totalAmountCents)}*. Nenhum valor financeiro será modificado.`,
        ''
    ];
    for (const item of publicPreview.items) {
        const sheet = item.sheetName === 'Saídas' ? 'saída' : 'cartão';
        if (publicPreview.operation === BATCH_OPERATIONS.RECATEGORIZE_EXPENSES) {
            const before = [item.before.category, item.before.subcategory].filter(Boolean).join(' / ') || 'Sem categoria';
            const after = [item.after.category, item.after.subcategory].filter(Boolean).join(' / ');
            lines.push(`*${item.number}.* [${sheet}] ${item.before.date} | ${item.before.description} | ${before} → ${after}`);
        } else {
            lines.push(`*${item.number}.* [${sheet}] ${item.before.date} | ${item.before.description} → ${item.after.description}`);
        }
    }
    lines.push('', 'Responda `sim` para confirmar o lote inteiro ou `não` para cancelar.');
    return lines.join('\n');
}

function replyForStartError(error) {
    if (error.code === 'BATCH_LIMIT_EXCEEDED') {
        return `Esse filtro encontrou ${error.details?.count || 'mais de 25'} itens. O limite seguro é 25 e nada foi truncado. Refine o texto do item ou o período.`;
    }
    if (error.code === 'BATCH_EMPTY') return 'Não encontrei itens seus que correspondam a esse filtro. Nenhuma alteração foi preparada.';
    if (error.code === 'BATCH_FORMULA_FORBIDDEN') return 'Não preparo fórmulas em correções em lote. Use apenas texto simples.';
    return 'Não consegui preparar esse lote com segurança. Refine o item e tente novamente.';
}

async function startBatchMaintenance(msg, activeUser = {}, overrides = {}) {
    const command = parseBatchMaintenanceCommand(msg?.body);
    if (!command) return false;
    if (command.kind === 'blocked') {
        await msg.reply('Esse campo é crítico e não pode ser alterado em lote. Corrija valor, data, responsável, pagamento, conta, cartão ou parcela em um item por vez.');
        return true;
    }

    const deps = dependencySet(overrides);
    const senderId = senderIdFromMessage(msg);
    const userId = String(activeUser.user_id || '').trim();
    const messageId = messageIdFromMessage(msg);
    if (!senderId || !userId || !messageId) {
        await msg.reply('Não consegui vincular esse lote ao usuário e à mensagem. Nenhuma alteração foi preparada.');
        return true;
    }
    const policy = deps.getPolicy(userId);
    if (!policy?.allowed) {
        await msg.reply('A manutenção em lote está desativada para este usuário. Nenhuma alteração foi preparada.');
        return true;
    }

    try {
        const sheetDataByName = {};
        for (const sheetName of ['Saídas', 'Lançamentos Cartão']) {
            sheetDataByName[sheetName] = await deps.readDataFromSheet(sheetName);
        }
        const selected = selectBatchCandidates({
            sheetDataByName,
            userId,
            operation: command.operation,
            filter: command.filter
        });
        if (selected.candidates.length === 0) {
            const emptyError = new Error('empty');
            emptyError.code = 'BATCH_EMPTY';
            throw emptyError;
        }
        const preview = buildBatchMaintenancePreview({
            operation: command.operation,
            userId,
            messageId,
            candidates: selected.candidates,
            patch: command.patch
        });
        rememberPendingBatch(senderId, preview);
        deps.stateManager.setState(senderId, {
            action: 'confirming_batch_maintenance',
            data: { operationKey: preview.operationKey, count: preview.count }
        }, Math.floor(PENDING_TTL_MS / 1000));
        await msg.reply(formatPreviewMessage(preview));
    } catch (error) {
        forgetPendingBatch(senderId);
        deps.stateManager.deleteState(senderId);
        await msg.reply(replyForStartError(error));
    }
    return true;
}

function columnLetter(index) {
    let n = Number(index) + 1;
    let output = '';
    while (n > 0) {
        const remainder = (n - 1) % 26;
        output = String.fromCharCode(65 + remainder) + output;
        n = Math.floor((n - 1) / 26);
    }
    return output;
}

function quoteSheetName(sheetName) {
    return `'${String(sheetName || '').replace(/'/g, "''")}'`;
}

async function confirmBatchMaintenance(msg, activeUser = {}, overrides = {}) {
    const deps = dependencySet(overrides);
    const senderId = senderIdFromMessage(msg);
    const state = deps.stateManager.getState(senderId);
    if (!state || state.action !== 'confirming_batch_maintenance') return false;
    const answer = normalizeText(msg?.body || '');
    if (['nao', 'n', 'cancelar', 'cancela'].includes(answer)) {
        forgetPendingBatch(senderId);
        deps.stateManager.deleteState(senderId);
        await msg.reply('Operação em lote cancelada. Nenhum item foi alterado.');
        return true;
    }
    if (!['sim', 's', 'ss', 'confirmo', 'confirmar'].includes(answer)) {
        await msg.reply('Responda apenas `sim` para confirmar o lote inteiro ou `não` para cancelar.');
        return true;
    }

    const preview = getPendingBatch(senderId);
    if (!preview || preview.operationKey !== state.data?.operationKey) {
        forgetPendingBatch(senderId);
        deps.stateManager.deleteState(senderId);
        await msg.reply('Esse preview expirou ou foi perdido após um reinício. Nenhuma alteração foi feita; envie o pedido novamente.');
        return true;
    }
    if (preview.userId !== String(activeUser.user_id || '').trim()) {
        forgetPendingBatch(senderId);
        deps.stateManager.deleteState(senderId);
        await msg.reply('O usuário atual não corresponde ao preview. Nenhuma alteração foi feita.');
        return true;
    }

    try {
        const currentSheets = {};
        for (const sheetName of Object.keys(preview.countsBySheet)) {
            currentSheets[sheetName] = await deps.readDataFromSheet(sheetName);
        }
        const writeLedger = deps.getWriteLedger();
        const result = await executeBatchMaintenance({
            preview,
            confirmed: true,
            writeLedger,
            readCurrentRow: async ({ sheetName, rowIndex }) => {
                const row = currentSheets[sheetName]?.[rowIndex];
                return Array.isArray(row) ? [...row] : null;
            },
            updateRow: async ({ sheetName, rowIndex, row, phase, operationKey }) => {
                const rowNumber = rowIndex + 1;
                const range = `${quoteSheetName(sheetName)}!A${rowNumber}:${columnLetter(row.length - 1)}${rowNumber}`;
                const response = await deps.updateRowInSheet(range, row, {
                    operationKey,
                    userId: preview.userId,
                    messageId: preview.messageId,
                    writeLedger,
                    source: `batch_maintenance.${phase}`,
                    allowIdempotentUpdateRetry: false
                });
                currentSheets[sheetName][rowIndex] = [...row];
                return response;
            }
        });
        deps.markReadModelDirty('batch_maintenance_write');
        await msg.reply(`✅ Lote confirmado: ${result.updated} itens atualizados com sucesso.`);
    } catch (error) {
        if (error.code === 'BATCH_PREVIEW_STALE') {
            await msg.reply('Um dos itens mudou depois do preview. Nada foi alterado; envie o pedido novamente para gerar um preview novo.');
        } else if (error.code === 'BATCH_WRITE_ROLLED_BACK') {
            await msg.reply('A atualização falhou no meio do lote, mas todas as linhas já alteradas foram restauradas. Gere um novo preview para tentar novamente.');
        } else if (error.code === 'BATCH_WRITE_UNCERTAIN') {
            await msg.reply('A atualização teve uma falha parcial e o rollback não pôde ser confirmado. Não repita o pedido; a revisão manual foi sinalizada.');
        } else {
            await msg.reply('Não consegui aplicar esse lote com segurança. Nenhuma confirmação de sucesso foi emitida; gere um novo preview.');
        }
    } finally {
        forgetPendingBatch(senderId);
        deps.stateManager.deleteState(senderId);
    }
    return true;
}

module.exports = {
    confirmBatchMaintenance,
    parseBatchMaintenanceCommand,
    startBatchMaintenance,
    __test__: {
        clearPendingBatches: () => pendingBatches.clear(),
        formatPreviewMessage,
        getPendingBatch,
        parseCategoryTarget
    }
};
