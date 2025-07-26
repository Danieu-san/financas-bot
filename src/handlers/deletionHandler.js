// src/handlers/deletionHandler.js

const { readDataFromSheet, deleteRowsByIndices } = require('../services/sheets');
const { askLLM } = require('../services/gemini');
const userStateManager = require('../state/userStateManager');
const { userMap, sheetCategoryMap } = require('../config/constants');
const { parseValue } = require('../utils/helpers');

async function handleDeletionRequest(msg, deletionRequest) {
    // ... (código da função handleDeletionRequest sem alterações,
    // mas substitua o `sheetMap` interno por `sheetCategoryMap` importado)
}

async function confirmDeletion(msg) {
    const senderId = msg.author || msg.from;
    const state = userStateManager.getState(senderId);

    if (msg.body.toLowerCase() === 'sim') {
        await msg.reply("Confirmado. Apagando os itens...");
        const result = await deleteRowsByIndices(state.sheetName, state.rowsToDelete);
        if (result.success) {
            await msg.reply(`✅ ${state.rowsToDelete.length} item(ns) foram apagados com sucesso!`);
        } else {
            await msg.reply(result.message || "Ocorreu um erro ao apagar.");
        }
    } else {
        await msg.reply("Ok, a exclusão foi cancelada.");
    }
    userStateManager.deleteState(senderId);
}

module.exports = { 
    handleDeletionRequest,
    confirmDeletion,
};