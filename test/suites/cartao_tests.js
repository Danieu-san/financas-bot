// test/suites/cartao_tests.js
const { simulateMessage, logTestResult, SENDER_DANIEL, runTestCase } = require('../test_utils');
const userStateManager = require('../../src/state/userStateManager');

async function runCartaoTests() {
    console.log('\n--- SUÍTE DE TESTES: Cartões de Crédito ---');

    // Limpa o estado antes de cada suíte
    userStateManager.clearState(SENDER_DANIEL);
    userStateManager.resetAllStates();

    const cartaoTestCases = [
        {
            name: 'Adicionar Compra no Cartão (Admin)',
            type: 'single-step',
            input: 'Comprei 80 no cartão Nubank - Daniel: restaurante',
            expected: /Entendi, o gasto foi no crédito\. Em qual cartão\? Responda com o número:/, // Espera a pergunta do cartão
            sender: SENDER_DANIEL
        },
        {
            name: 'Adicionar Compra no Cartão com Data (Admin)',
            type: 'single-step',
            input: 'Gastei 120 no cartão Nubank - Thais no dia 20: roupas',
            expected: /Entendi, o gasto foi no crédito\. Em qual cartão\? Responda com o número:/, // Espera a pergunta do cartão
            sender: SENDER_DANIEL
        },
    ];

    for (const testCase of cartaoTestCases) {
        await runTestCase(testCase);
    }

    console.log('\n--- FIM DA SUÍTE DE TESTES: Cartões de Crédito ---');
}

module.exports = { runCartaoTests };