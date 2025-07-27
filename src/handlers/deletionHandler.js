// src/handlers/deletionHandler.js

const { readDataFromSheet, deleteRowsByIndices } = require('../services/sheets');
const userStateManager = require('../state/userStateManager');
const { sheetCategoryMap } = require('../config/constants');

async function handleDeletionRequest(msg, deleteDetails) {
    const senderId = msg.author || msg.from;
    const termoBusca = deleteDetails.descricao.toLowerCase();
    const categoriaAlvo = deleteDetails.categoria.toLowerCase();

    const sheetName = sheetCategoryMap[categoriaAlvo];
    if (!sheetName) {
        await msg.reply(`Não entendi se você quer apagar um 'gasto', 'entrada', etc.`);
        return;
    }

    const allData = await readDataFromSheet(sheetName);
    if (!allData || allData.length <= 1) {
        await msg.reply(`A aba "${sheetName}" já está vazia.`);
        return;
    }

    let rowsToDelete = [];
    
    // CORRIGIDO: Agora a checagem de "último" é mais robusta
    if (termoBusca.includes('ultimo') || termoBusca.includes('último')) {
        const lastRowIndex = allData.length - 1;
        rowsToDelete.push({ index: lastRowIndex, data: allData[lastRowIndex] });
    } else {
        const filteredRows = allData
            .map((row, index) => ({ row, index }))
            .filter(item => {
                if (item.index === 0) return false;
                const rowText = item.row.join(' ').toLowerCase();
                return rowText.includes(termoBusca);
            });
        rowsToDelete = filteredRows.map(item => ({ index: item.index, data: item.row }));
    }
    
    if (rowsToDelete.length === 0) {
        await msg.reply(`Não encontrei nenhum item contendo "${termoBusca}" na aba "${sheetName}".`);
        return;
    }

    userStateManager.setState(senderId, {
        action: 'confirming_delete',
        sheetName: sheetName,
        // Armazena os itens encontrados para que o usuário possa escolher
        foundItems: rowsToDelete 
    });

    let confirmationMessage = `Encontrei ${rowsToDelete.length} item(ns) para apagar na aba "${sheetName}":\n\n`;
    rowsToDelete.forEach((item, idx) => {
        // Adiciona um número de seleção para o usuário
        confirmationMessage += `*${idx + 1}.* ${item.data.slice(0, 5).join(' | ')}\n`;
    });
    confirmationMessage += "\nVocê tem certeza? Responda com *'sim'* para apagar tudo, ou os números dos itens que quer apagar (ex: *1* ou *1, 2*).";
    
    await msg.reply(confirmationMessage);
}

// ATUALIZADO: Função de confirmação agora entende números
async function confirmDeletion(msg) {
    const senderId = msg.author || msg.from;
    const state = userStateManager.getState(senderId);
    if (!state || state.action !== 'confirming_delete') return;

    const userReply = msg.body.toLowerCase();
    let finalRowsToDelete = [];

    if (userReply === 'sim') {
        finalRowsToDelete = state.foundItems.map(item => item.index);
    } else {
        // Tenta extrair os números da resposta do usuário
        const indicesToKeep = userReply.match(/\d+/g)?.map(n => parseInt(n) - 1) || [];
        const validItems = indicesToKeep
            .map(idx => state.foundItems[idx])
            .filter(Boolean); // Remove itens inválidos/não encontrados
        
        if (validItems.length > 0) {
            finalRowsToDelete = validItems.map(item => item.index);
        } else {
            await msg.reply("Não entendi sua seleção. A exclusão foi cancelada.");
            userStateManager.deleteState(senderId);
            return;
        }
    }

    if (finalRowsToDelete.length > 0) {
        await msg.reply(`Confirmado. Apagando ${finalRowsToDelete.length} item(ns)...`);
        const result = await deleteRowsByIndices(state.sheetName, finalRowsToDelete);
        if (result.success) {
            await msg.reply(`✅ Item(ns) apagado(s) com sucesso!`);
        } else {
            await msg.reply(result.message || "Ocorreu um erro ao apagar.");
        }
    } else {
        await msg.reply("Nenhum item selecionado. A exclusão foi cancelada.");
    }
    
    userStateManager.deleteState(senderId);
}

module.exports = { 
    handleDeletionRequest,
    confirmDeletion,
};