// src/handlers/debtHandler.js

const { readDataFromSheet, updateRowInSheet } = require('../services/google');
const userStateManager = require('../state/userStateManager');
const { getFormattedDate, normalizeText, parseAmount, parseValue } = require('../utils/helpers');
const { getUserByWhatsAppId } = require('../services/userService');
const { createOperationKey } = require('../reliability/financialWriteLedger');
const { getProjectedPlanWriteContext } = require('../plans/projectedPlanWriteRuntime');
const { executeDebtPaymentWrite } = require('../plans/projectedPlanWriteService');

const DEBT_USER_ID_INDEX = 17;

function filterDebtsByUserId(allDebts, userId) {
    if (!Array.isArray(allDebts) || allDebts.length <= 1 || !userId) return [];

    return allDebts
        .map((row, index) => ({ row, index }))
        .filter(item => item.index !== 0 && String(item.row?.[DEBT_USER_ID_INDEX] || '').trim() === userId);
}

async function startPaymentRegistration(msg, pagamentoDetails) {
    
    if (!pagamentoDetails || !pagamentoDetails.descricao) {
        await msg.reply("Entendi que você quer registrar um pagamento. Por favor, diga qual dívida você pagou. Ex: 'paguei o empréstimo do carro'.");
         return;
    }

    const senderId = msg.author || msg.from;
    const user = await getUserByWhatsAppId(senderId);
    if (!user || !user.user_id) {
        await msg.reply('Não consegui identificar seu usuário para registrar esse pagamento.');
        return;
    }

    const termoBusca = pagamentoDetails.descricao;

    if (!termoBusca) {
        await msg.reply("Por favor, diga qual dívida você pagou. Ex: 'paguei o empréstimo do carro'.");
        return;
    }

    const allDebts = await readDataFromSheet('Dívidas');
    if (!allDebts || allDebts.length <= 1) {
        await msg.reply("Você ainda não tem nenhuma dívida registrada para pagar.");
        return;
    }

    const termoBuscaNormalizado = normalizeText(termoBusca);
    const foundDebts = filterDebtsByUserId(allDebts, user.user_id)
        .filter(item => {
            return normalizeText(item.row[0]).includes(termoBuscaNormalizado); // Procura na coluna "Nome da Dívida"
        });

    if (foundDebts.length === 0) {
        await msg.reply(`Não encontrei nenhuma dívida com o nome "${termoBusca}".`);
        return;
    }

    if (foundDebts.length > 1) {
        await msg.reply(`Encontrei mais de uma dívida com o nome "${termoBusca}". Por favor, seja mais específico.`);
        return;
    }

    const debtToUpdate = foundDebts[0];
    const valorParcela = debtToUpdate.row[5]; // Coluna F: Valor da Parcela

    userStateManager.setState(senderId, {
        action: 'awaiting_payment_amount',
        data: {
            ...debtToUpdate,
            user_id: user.user_id
        }
    });

    await msg.reply(`Encontrei a dívida "${debtToUpdate.row[0]}" com uma parcela de R$${valorParcela}. Qual foi o valor que você pagou?`);
}

async function finalizePaymentRegistration(msg) {
    const senderId = msg.author || msg.from;
    const state = userStateManager.getState(senderId);
    if (!state || state.action !== 'awaiting_payment_amount') return;

    const valorPago = await parseAmount(msg.body);
    if (valorPago === null || valorPago <= 0) {
        await msg.reply("Valor inválido. Por favor, digite apenas o número que você pagou.");
        return;
    }

    const debtToUpdate = state.data;
    const rowData = [...debtToUpdate.row];

    if (String(rowData?.[DEBT_USER_ID_INDEX] || '').trim() !== String(debtToUpdate.user_id || '').trim()) {
        await msg.reply('Não consegui validar que essa dívida pertence ao seu usuário. A operação foi cancelada por segurança.');
        userStateManager.deleteState(senderId);
        return;
    }

    const saldoDevedorAtual = parseFloat(rowData[4]);
    const novoSaldo = Math.max(0, saldoDevedorAtual - valorPago);

    const projectedPlanContext = getProjectedPlanWriteContext(debtToUpdate.user_id);
    if (projectedPlanContext.policy.shadowWritesAllowed) {
        userStateManager.setState(senderId, {
            action: 'confirming_legacy_debt_payment',
            data: {
                debtName: rowData[0],
                rowIndex: debtToUpdate.index,
                user_id: debtToUpdate.user_id,
                amount: valorPago,
                originalMessageId: msg?.id?.id || ''
            }
        });
        await msg.reply([
            `Identifiquei o pagamento da dívida *${rowData[0]}*.`,
            `Valor: *R$${valorPago.toFixed(2)}*`,
            `Saldo: *R$${saldoDevedorAtual.toFixed(2)}* → *R$${novoSaldo.toFixed(2)}*`,
            '',
            'Confirma o registro? Responda *sim* ou *não*.'
        ].join('\n'));
        return;
    }

    try {
        const saved = await saveLegacyDebtPayment({
            debtName: rowData[0],
            rowIndex: debtToUpdate.index,
            userId: debtToUpdate.user_id,
            amount: valorPago,
            originalMessageId: msg?.id?.id || ''
        });
        await msg.reply(`✅ Pagamento de R$${valorPago.toFixed(2)} registrado! O novo saldo devedor da dívida "${saved.debtName}" é R$${saved.newBalance.toFixed(2)}.`);
    } catch (error) {
        await msg.reply("Ocorreu um erro ao tentar atualizar a dívida na planilha.");
    } finally {
        userStateManager.deleteState(senderId);
    }
}

function buildLegacyDebtPaymentOperationKey({ userId, originalMessageId, debtName, amount }) {
    return createOperationKey({
        userId,
        messageId: originalMessageId || normalizeText(debtName || ''),
        operation: 'debt.pay.legacy',
        itemFingerprint: JSON.stringify({ target: normalizeText(debtName || ''), amount: parseValue(amount) })
    });
}

async function saveLegacyDebtPayment({ debtName, rowIndex, userId, amount, originalMessageId }) {
    const operationKey = buildLegacyDebtPaymentOperationKey({ userId, originalMessageId, debtName, amount });
    const projectedPlanContext = getProjectedPlanWriteContext(userId);
    const existingReceipt = projectedPlanContext.store?.getWriteReceipt(operationKey);
    if (existingReceipt?.status === 'shadow_committed') {
        return {
            debtName: existingReceipt.payload?.plan?.name || debtName,
            newBalance: Number(existingReceipt.payload?.movement?.balance_after_cents || 0) / 100,
            replayed: true
        };
    }

    const debtRows = await readDataFromSheet('Dívidas');
    const currentRow = debtRows?.[rowIndex];
    if (!currentRow
        || String(currentRow[DEBT_USER_ID_INDEX] || '').trim() !== String(userId || '').trim()
        || normalizeText(currentRow[0] || '') !== normalizeText(debtName || '')) {
        throw new Error('Não consegui revalidar a dívida no seu escopo.');
    }
    const currentBalance = parseValue(currentRow[4]);
    const safeAmount = parseValue(amount);
    if (!Number.isFinite(safeAmount) || safeAmount <= 0 || safeAmount > currentBalance) {
        throw new Error('O valor precisa ser positivo e não pode superar o saldo atual.');
    }
    const updatedRow = [...currentRow];
    const newBalance = Math.max(0, currentBalance - safeAmount);
    updatedRow[4] = newBalance;
    const originalAmount = parseValue(updatedRow[3]);
    if (originalAmount > 0) updatedRow[13] = `${((1 - (newBalance / originalAmount)) * 100).toFixed(2)}%`;

    let replayed = false;
    let shadowPending = false;
    if (projectedPlanContext.policy.shadowWritesAllowed) {
        const result = await executeDebtPaymentWrite({
            store: projectedPlanContext.store,
            operationKey,
            userId,
            messageId: originalMessageId || '',
            debt: { row: currentRow, rowIndex: rowIndex + 1, headers: debtRows[0] || [] },
            updatedRow,
            amount: safeAmount,
            occurredOn: getFormattedDate(),
            updateDebtRow: ({ range, row, ...options }) => updateRowInSheet(range, row, options)
        });
        replayed = result.replayed === true;
        shadowPending = result.shadowPending === true;
    } else {
        const range = `Dívidas!A${rowIndex + 1}:${String.fromCharCode(65 + updatedRow.length - 1)}${rowIndex + 1}`;
        const result = await updateRowInSheet(range, updatedRow, {
            operationKey,
            userId,
            messageId: originalMessageId || '',
            source: 'legacy.debt_payment'
        });
        replayed = result?.receipt?.replayed === true;
    }
    return { debtName: currentRow[0], newBalance: replayed ? currentBalance : newBalance, replayed, shadowPending };
}

async function confirmPaymentRegistration(msg) {
    const senderId = msg.author || msg.from;
    const state = userStateManager.getState(senderId);
    if (!state || state.action !== 'confirming_legacy_debt_payment') return;
    const reply = normalizeText(msg.body || '');
    if (['nao', 'não', 'n', 'cancelar', 'cancela'].includes(reply)) {
        userStateManager.deleteState(senderId);
        await msg.reply('Pagamento de dívida cancelado. Nenhum dado foi alterado.');
        return;
    }
    if (!['sim', 's', 'ss', 'confirmo'].includes(reply)) {
        await msg.reply('Responda `sim` para confirmar o pagamento da dívida ou `não` para cancelar.');
        return;
    }
    try {
        const saved = await saveLegacyDebtPayment({
            debtName: state.data.debtName,
            rowIndex: state.data.rowIndex,
            userId: state.data.user_id,
            amount: state.data.amount,
            originalMessageId: state.data.originalMessageId
        });
        if (saved.replayed) {
            await msg.reply(`Esse pagamento da dívida "${saved.debtName}" já havia sido registrado. O saldo permanece em R$${saved.newBalance.toFixed(2)}.`);
        } else {
            await msg.reply(`✅ Pagamento de R$${Number(state.data.amount).toFixed(2)} registrado! O novo saldo devedor da dívida "${saved.debtName}" é R$${saved.newBalance.toFixed(2)}.`);
        }
    } catch (error) {
        await msg.reply(`Não consegui registrar o pagamento da dívida com segurança. ${error.message}`);
    } finally {
        userStateManager.deleteState(senderId);
    }
}


module.exports = {
    startPaymentRegistration,
    finalizePaymentRegistration,
    confirmPaymentRegistration,
    __test__: {
        filterDebtsByUserId
    }
};
