// src/state/userStateManager.js

const userStates = {}; // Armazena o estado da conversa atual para cada usuário

const getState = (userId) => {
    return userStates[userId];
};

const setState = (userId, state) => {
    userStates[userId] = state;
};

const deleteState = (userId) => {
    delete userStates[userId];
};

module.exports = {
    getState,
    setState,
    deleteState,
};