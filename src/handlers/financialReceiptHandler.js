const crypto = require('node:crypto');

const userStateManager = require('../state/userStateManager');
const { readDataFromSheet } = require('../services/google');
const { normalizeText } = require('../utils/helpers');
const {
    EVENT_SPECS,
    FinancialReceiptStore,
    buildFinancialReceiptPolicy,
    findLatestFinancialEvent,
    validateReceiptMedia
} = require('../receipts/financialReceiptService');
const {
    deleteFinancialReceipt,
    downloadFinancialReceipt,
    uploadFinancialReceipt
} = require('../receipts/financialReceiptDriveService');

const PENDING_TTL_MS = 15 * 60 * 1000;
const pendingReceipts = new Map();
let defaultStore;

function getDefaultStore() {
    if (!defaultStore) defaultStore = new FinancialReceiptStore();
    return defaultStore;
}

function parseFinancialReceiptCommand(text) {
    const normalized = normalizeText(String(text || ''));
    if (!/\bcomprovante(s)?\b/.test(normalized) || !/\b(ultimo|ultima)\b/.test(normalized)) return null;
    const action = /\b(anexar|anexe|adicionar|adicione|guardar|guarde|salvar|salve)\b/.test(normalized)
        ? 'attach'
        : /\b(buscar|busque|mostrar|mostre|ver|baixar|baixe)\b/.test(normalized) ? 'get' : null;
    if (!action) return null;
    const kind = /\b(cartao|compra no cartao)\b/.test(normalized)
        ? 'card'
        : /\b(entrada|receita)\b/.test(normalized) ? 'income' : /\b(gasto|saida|despesa)\b/.test(normalized) ? 'expense' : null;
    return kind ? { action, kind } : { action: 'invalid', reason: 'event_type_required' };
}

function dependencies(overrides = {}) {
    return {
        stateManager: userStateManager,
        readDataFromSheet,
        getStore: getDefaultStore,
        getPolicy: userId => buildFinancialReceiptPolicy(process.env, userId),
        uploadReceipt: uploadFinancialReceipt,
        downloadReceipt: downloadFinancialReceipt,
        deleteReceipt: deleteFinancialReceipt,
        createMessageMedia: ({ mimeType, buffer, fileName }) => {
            const { MessageMedia } = require('whatsapp-web.js');
            return new MessageMedia(mimeType, buffer.toString('base64'), fileName);
        },
        ...overrides
    };
}

function senderId(msg = {}) { return String(msg.author || msg.from || '').trim(); }

async function resolveEvent(userId, kind, deps) {
    const spec = EVENT_SPECS[kind];
    const end = kind === 'expense' ? 'K' : 'J';
    const rows = await deps.readDataFromSheet(`${spec.sheetName}!A:${end}`, { userId, suppressMissingSheetError: true });
    return findLatestFinancialEvent({ sheetDataByName: { [spec.sheetName]: rows || [] }, userId, kind });
}

function rememberPending(sender, event) {
    const key = crypto.randomUUID();
    pendingReceipts.set(key, { event, expiresAt: Date.now() + PENDING_TTL_MS });
    return key;
}

function getPending(key) {
    const pending = pendingReceipts.get(String(key || ''));
    if (!pending) return null;
    if (pending.expiresAt <= Date.now()) { pendingReceipts.delete(String(key || '')); return null; }
    return pending;
}

function clearPending(sender, state, deps) {
    pendingReceipts.delete(String(state?.data?.receiptPendingKey || ''));
    deps.stateManager.deleteState(sender);
}

function safeFileName(event, mediaInfo) {
    const date = String(event.date || '').replace(/\D/g, '').slice(0, 8) || 'sem-data';
    return `comprovante-${event.kind}-${date}-${mediaInfo.contentHash.slice(0, 10)}.${mediaInfo.extension}`;
}

async function processPendingMedia(msg, user, state, deps) {
    const sender = senderId(msg);
    const pending = getPending(state?.data?.receiptPendingKey);
    if (!pending) {
        clearPending(sender, state, deps);
        await msg.reply('O pedido de comprovante expirou. Inicie novamente; nenhum arquivo foi salvo.');
        return true;
    }
    if (!msg.hasMedia || typeof msg.downloadMedia !== 'function') {
        if (/^(nao|não|cancelar|cancela)$/i.test(String(msg.body || '').trim())) {
            clearPending(sender, state, deps);
            await msg.reply('Anexo cancelado. Nenhum arquivo foi salvo.');
        } else {
            await msg.reply('Envie agora o comprovante em PDF, JPEG, PNG ou WebP, ou responda `cancelar`.');
        }
        return true;
    }
    let mediaInfo;
    try { mediaInfo = validateReceiptMedia(await msg.downloadMedia()); }
    catch (error) {
        await msg.reply(error.code === 'RECEIPT_TOO_LARGE' ? 'O comprovante excede o limite seguro de 5 MB.' : 'Envie um comprovante válido em PDF, JPEG, PNG ou WebP.');
        return true;
    }
    const currentEvent = await resolveEvent(user.user_id, pending.event.kind, deps);
    if (!currentEvent || currentEvent.eventKey !== pending.event.eventKey) {
        clearPending(sender, state, deps);
        await msg.reply('O lançamento mudou desde o pedido. Nenhum arquivo foi salvo; inicie novamente para evitar vínculo incorreto.');
        return true;
    }
    const store = deps.getStore();
    if (store.findByEventHash({ userId: user.user_id, eventKey: currentEvent.eventKey, contentHash: mediaInfo.contentHash })) {
        clearPending(sender, state, deps);
        await msg.reply('Esse comprovante já está vinculado ao lançamento. Nenhum arquivo duplicado foi criado.');
        return true;
    }
    let uploaded;
    try {
        uploaded = await deps.uploadReceipt({ userId: user.user_id, buffer: mediaInfo.buffer, mimeType: mediaInfo.mimeType, fileName: safeFileName(currentEvent, mediaInfo) });
        store.attach({
            userId: user.user_id, eventKey: currentEvent.eventKey, eventType: currentEvent.kind,
            driveFileId: uploaded.driveFileId, contentHash: mediaInfo.contentHash, mimeType: mediaInfo.mimeType,
            fileName: safeFileName(currentEvent, mediaInfo), permissionScope: uploaded.permissionScope
        });
    } catch (error) {
        if (uploaded?.driveFileId) await deps.deleteReceipt({ userId: user.user_id, driveFileId: uploaded.driveFileId }).catch(() => {});
        await msg.reply('Não consegui guardar o comprovante com segurança. Nenhuma transação foi criada ou alterada.');
        return true;
    }
    clearPending(sender, state, deps);
    await msg.reply(`Comprovante vinculado ao ${currentEvent.label} de ${currentEvent.date}: ${currentEvent.description}. Nenhuma transação foi criada ou alterada.`);
    return true;
}

async function handleFinancialReceiptMessage(msg, user = {}, overrides = {}) {
    const deps = dependencies(overrides);
    const sender = senderId(msg);
    const state = deps.stateManager.getState(sender);
    if (state?.action === 'awaiting_financial_receipt_media') return processPendingMedia(msg, user, state, deps);
    const parsed = parseFinancialReceiptCommand(msg?.body);
    if (!parsed) return false;
    if (parsed.action === 'invalid') { await msg.reply('Diga se o comprovante é do último gasto, da última entrada ou da última compra no cartão.'); return true; }
    const policy = deps.getPolicy(user.user_id);
    if (!policy.allowed) { await msg.reply('Comprovantes financeiros ainda não estão liberados para este usuário.'); return true; }
    const event = await resolveEvent(user.user_id, parsed.kind, deps);
    if (!event) { await msg.reply('Não encontrei um lançamento existente desse tipo para vincular. Nenhum arquivo foi salvo.'); return true; }
    if (parsed.action === 'get') {
        const receipt = deps.getStore().findByEvent({ userId: user.user_id, eventKey: event.eventKey });
        if (!receipt) { await msg.reply('Esse lançamento não possui comprovante vinculado.'); return true; }
        const buffer = await deps.downloadReceipt({ userId: user.user_id, driveFileId: receipt.driveFileId });
        await msg.reply(deps.createMessageMedia({ mimeType: receipt.mimeType, buffer, fileName: receipt.fileName }), undefined, { sendMediaAsDocument: receipt.mimeType === 'application/pdf' });
        return true;
    }
    const receiptPendingKey = rememberPending(sender, event);
    deps.stateManager.setState(sender, { action: 'awaiting_financial_receipt_media', data: { receiptPendingKey } });
    if (msg.hasMedia) return processPendingMedia(msg, user, deps.stateManager.getState(sender), deps);
    await msg.reply(`Vou vincular o arquivo ao ${event.label} de ${event.date}: ${event.description}. Envie agora PDF, JPEG, PNG ou WebP, ou responda \`cancelar\`.`);
    return true;
}

module.exports = { handleFinancialReceiptMessage, parseFinancialReceiptCommand, __test__: { clearPendingReceipts: () => pendingReceipts.clear(), getPending, resolveEvent } };
