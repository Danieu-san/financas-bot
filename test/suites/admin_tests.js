// test/suites/admin_tests.js
const { simulateMessage, logTestResult, SENDER_DANIEL, SENDER_OTHER, logRawAIResponse } = require('../test_utils');
const userStateManager = require('../../src/state/userStateManager'); // Ajuste o caminho se necessário
const { getSheetIds } = require('../../src/services/google'); // Para !veridsplanilhas

async function runAdminTests() {
    console.log('\n--- SUÍTE DE TESTES: Comandos Administrativos ---');

    // Limpa o estado de ambos os usuários antes de iniciar a suíte
    userStateManager.clearState(SENDER_DANIEL);
    userStateManager.clearState(SENDER_OTHER);
    userStateManager.resetAllStates(); // Garante que todos os estados estão limpos

    // Teste: !souadmin (Usuário Admin)
    let testName = 'Admin: !souadmin (Usuário Admin)';
    let botResponse = await simulateMessage(SENDER_DANIEL, '!souadmin');
    logTestResult(testName, botResponse === 'Você é um administrador.');

    // Teste: !souadmin (Usuário Não Admin)
    testName = 'Admin: !souadmin (Usuário Não Admin)';
    botResponse = await simulateMessage(SENDER_OTHER, '!souadmin');
    logTestResult(testName, botResponse === 'Você não tem permissão para usar comandos administrativos.');

    // Teste: !ajudaadmin
    testName = 'Admin: !ajudaadmin';
    botResponse = await simulateMessage(SENDER_DANIEL, '!ajudaadmin');
    // Verifica se a resposta contém partes esperadas da mensagem de ajuda
    const expectedHelpAdmin = 'Comandos administrativos disponíveis:';
    logTestResult(testName, botResponse.includes(expectedHelpAdmin));

    // Teste: !veridsplanilhas
    testName = 'Admin: !veridsplanilhas';
    botResponse = await simulateMessage(SENDER_DANIEL, '!veridsplanilhas');
    // Verifica se a resposta contém "IDs das planilhas carregados" e é um JSON válido
    let isJson = false;
    try {
        const jsonPart = botResponse.substring(botResponse.indexOf('```json') + 7, botResponse.lastIndexOf('```'));
        JSON.parse(jsonPart);
        isJson = true;
    } catch (e) {
        isJson = false;
    }
    logTestResult(testName, botResponse.includes('IDs das planilhas carregados:') && isJson);

    // Teste: !limparcache <userId>
    testName = 'Admin: !limparcache (limpar estado de Daniel)';
    // Primeiro, coloca algo no estado de Daniel
    userStateManager.setState(SENDER_DANIEL, { action: 'test_state', data: { value: 'abc' } });
    let stateBeforeClear = userStateManager.getState(SENDER_DANIEL);
    let stateExistsBefore = stateBeforeClear && stateBeforeClear.action === 'test_state';
    botResponse = await simulateMessage(SENDER_DANIEL, `!limparcache ${SENDER_DANIEL}`);
    let stateAfterClear = userStateManager.getState(SENDER_DANIEL);
    let stateCleared = !stateAfterClear;
    logTestResult(testName, stateExistsBefore && stateCleared && botResponse === `Estado do usuário ${SENDER_DANIEL} limpo com sucesso!`);

    // Teste: !resetartodosestados
    testName = 'Admin: !resetartodosestados';
    // Coloca algo no estado de Daniel e de Outro Usuário
    userStateManager.setState(SENDER_DANIEL, { action: 'test_state_daniel', data: { value: 'daniel' } });
    userStateManager.setState(SENDER_OTHER, { action: 'test_state_other', data: { value: 'other' } });
    let danielStateBefore = userStateManager.getState(SENDER_DANIEL);
    let otherStateBefore = userStateManager.getState(SENDER_OTHER);
    let allStatesExistBefore = danielStateBefore && otherStateBefore;
    botResponse = await simulateMessage(SENDER_DANIEL, '!resetartodosestados');
    let danielStateAfter = userStateManager.getState(SENDER_DANIEL);
    let otherStateAfter = userStateManager.getState(SENDER_OTHER);
    let allStatesCleared = !danielStateAfter && !otherStateAfter;
    logTestResult(testName, allStatesExistBefore && allStatesCleared && botResponse === 'Estado de todos os usuários resetado com sucesso!');

    // Teste: !comando_desconhecido (Admin)
    testName = 'Admin: Comando Desconhecido';
    botResponse = await simulateMessage(SENDER_DANIEL, '!comando_desconhecido');
    logTestResult(testName, botResponse === 'Comando administrativo não reconhecido. Use !ajudaadmin para ver a lista.');

    console.log('\n--- FIM DA SUÍTE DE TESTES: Comandos Administrativos ---');
}

module.exports = { runAdminTests };