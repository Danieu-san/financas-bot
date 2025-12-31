    // src/state/userStateManager.js

    const userStates = new Map(); // Armazena o estado de cada usuário

    function setState(userId, state) {
        userStates.set(userId, state);
    }

    function getState(userId) {
        return userStates.get(userId);
    }

    function clearState(userId) {
        userStates.delete(userId);
    }

    // NOVO: Função para resetar todos os estados (útil para testes)
    function resetAllStates() {
        userStates.clear();
    }

    module.exports = {
        setState,
        getState,
        clearState,
        resetAllStates // Exporta a nova função
    };