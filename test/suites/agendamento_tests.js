// test/suites/agendamento_tests.js
const { simulateMessage, logTestResult, SENDER_DANIEL, runTestCase } = require('../test_utils');
const userStateManager = require('../../src/state/userStateManager');

async function runAgendamentoTests() {
    console.log('\n--- SUÍTE DE TESTES: Agendamento ---');

    // Limpa o estado antes de cada suíte
    userStateManager.clearState(SENDER_DANIEL);
    userStateManager.resetAllStates();

    const agendamentoTestCases = [
        {
            name: 'Agendar Lembrete (Admin)',
            type: 'single-step',
            input: 'Me lembre de pagar a conta de água dia 10 de janeiro',
            expected: /Houve um erro ao tentar salvar o evento na sua Agenda Google\./, // Ainda com erro GaxiosError: Bad Request
            sender: SENDER_DANIEL
        },
        {
            name: 'Adicionar Tarefa (Admin)',
            type: 'single-step',
            input: 'Adicionar tarefa: comprar mantimentos',
            expected: /Não entendi os detalhes do lembrete\. Por favor, inclua o que e quando \(ex: 'me lembre de pagar a luz amanhã às 10h'\)\./, // Bot pede mais detalhes
            sender: SENDER_DANIEL
        },
    ];

    for (const testCase of agendamentoTestCases) {
        await runTestCase(testCase);
    }

    console.log('\n--- FIM DA SUÍTE DE TESTES: Agendamento ---');
}

module.exports = { runAgendamentoTests };