// src/handlers/debtHandler.js

const { readDataFromSheet, updateRowInSheet } = require('../services/google');
const userStateManager = require('../state/userStateManager');
const { normalizeText, parseAmount } = require('../utils/helpers');
const { getUserByWhatsAppId } = require('../services/userService');

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
    let rowData = debtToUpdate.row;
    const rowIndex = debtToUpdate.index;

    if (String(rowData?.[DEBT_USER_ID_INDEX] || '').trim() !== String(debtToUpdate.user_id || '').trim()) {
        await msg.reply('Não consegui validar que essa dívida pertence ao seu usuário. A operação foi cancelada por segurança.');
        userStateManager.deleteState(senderId);
        return;
    }

    const saldoDevedorAtual = parseFloat(rowData[4]);
    const novoSaldo = Math.max(0, saldoDevedorAtual - valorPago);

    rowData[4] = novoSaldo;

    const valorOriginal = parseFloat(rowData[3]);
    if (valorOriginal > 0) {
        const percentualQuitado = (1 - (novoSaldo / valorOriginal)) * 100;
        rowData[13] = `${percentualQuitado.toFixed(2)}%`;
    }

    const range = `Dívidas!A${rowIndex + 1}:${String.fromCharCode(65 + rowData.length - 1)}${rowIndex + 1}`;

    try {
        await updateRowInSheet(range, rowData);
        await msg.reply(`✅ Pagamento de R$${valorPago.toFixed(2)} registrado! O novo saldo devedor da dívida "${rowData[0]}" é R$${novoSaldo.toFixed(2)}.`);
    } catch (error) {
        await msg.reply("Ocorreu um erro ao tentar atualizar a dívida na planilha.");
    } finally {
        userStateManager.deleteState(senderId);
    }
}


module.exports = {
    startPaymentRegistration,
    finalizePaymentRegistration,
    __test__: {
        filterDebtsByUserId
    }
};
