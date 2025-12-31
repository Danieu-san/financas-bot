// test/suites/generico_tests.js
const { simulateMessage, logTestResult, SENDER_DANIEL, runTestCase } = require('../test_utils');
const userStateManager = require('../../src/state/userStateManager');

async function runGenericoTests() {
    console.log('\n--- SUÍTE DE TESTES: Mensagens Genéricas ---');

    // Limpa o estado antes de cada suíte
    userStateManager.clearState(SENDER_DANIEL);
    userStateManager.resetAllStates();

    const genericoTestCases = [
        {
            name: 'Cenário 5.1: Pergunta vs. Conversa - Saudação',
            type: 'single-step',
            input: 'bom dia, como você está?',
            expected: /Intenção desconhecida para a mensagem: "bom dia, como você está\?"\. Nenhuma resposta enviada\./, // Bot ainda não responde
            sender: SENDER_DANIEL
        },
        {
            name: 'Mensagem Genérica Complexa (Admin)',
            type: 'single-step',
            input: 'Me explique sobre investimentos de baixo risco.',
            expected: /Excelente pergunta! "Investimentos de baixo risco" é um termo que gera muito interesse/, // Bot explica o conceito
            sender: SENDER_DANIEL
        },
        {
            name: 'Mensagem Genérica Simples (Com Contexto do Usuário)',
            type: 'single-step',
            input: 'Olá bot, você me conhece?',
            expected: /Intenção desconhecida para a mensagem: "Olá bot, você me conhece\?"\. Nenhuma resposta enviada\./, // Bot ainda não responde
            sender: SENDER_DANIEL
        },
    ];

    for (const testCase of genericoTestCases) {
        await runTestCase(testCase);
    }

    console.log('\n--- FIM DA SUÍTE DE TESTES: Mensagens Genéricas ---');
}

module.exports = { runGenericoTests };