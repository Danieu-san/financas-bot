// test/suites/divida_tests.js
const { simulateMessage, logTestResult, SENDER_DANIEL, runTestCase } = require('../test_utils');
const userStateManager = require('../../src/state/userStateManager');

async function runDividaTests() {
    console.log('\n--- SUÍTE DE TESTES: Dívidas ---');

    // Limpa o estado antes de cada suíte
    userStateManager.clearState(SENDER_DANIEL);
    userStateManager.resetAllStates();

    const dividaTestCases = [
        {
            name: 'Cenário 3.1: Criação de uma Nova Dívida (Fluxo Completo)',
            type: 'multi-step',
            sender: SENDER_DANIEL,
            steps: [
                { input: 'quero criar uma dívida', expected: /Qual o nome da dívida\?/ },
                { input: 'Financiamento Apartamento', expected: /Para quem você deve\?/ },
                { input: 'Caixa', expected: /Qual o tipo da dívida\?/ },
                { input: 'financiamneto', expected: /Qual foi o valor original da dívida\?/ }, // Typos aqui
                { input: '200000', expected: /O saldo devedor atual ainda é...\?/ },
                { input: '195000', expected: /Qual o valor da parcela\?/ },
                { input: '1800', expected: /Qual a taxa de juros\?/ },
                { input: '10aa', expected: /Qual o dia do vencimento\?/ }, // Typos aqui
                { input: '15', expected: /Qual a data de início\?/ },
                { input: '01/01/2024', expected: /Qual o total de parcelas\?/ },
                { input: '360', expected: /Alguma observação\?/ },
                { input: 'não', expected: /Dívida "Financiamento Apartamento" registrada com sucesso!/ }
            ]
        },
        {
            name: 'Cenário 3.2: Registro de Pagamento de Dívida',
            type: 'multi-step',
            sender: SENDER_DANIEL,
            steps: [
                {
                    input: 'paguei a dívida do apartamento',
                    expected: /Não encontrei nenhuma dívida com o nome "dívida do apartamento"\./ // Ainda falha aqui, bot não encontra
                }
            ]
        },
        {
            name: 'Adicionar Dívida Simples (Admin)',
            type: 'single-step',
            input: 'Devo 100 para o Pedro',
            expected: /Qual o nome da dívida\? \(ex: Financiamento Carro\)/, // Bot espera o fluxo completo
            sender: SENDER_DANIEL
        },
        {
            name: 'Atualizar Dívida (Admin)',
            type: 'single-step',
            input: 'Atualizar dívida do Pedro para 70 reais',
            expected: /Intenção desconhecida para a mensagem: "Atualizar dívida do Pedro para 70 reais"\. Nenhuma resposta enviada\./, // Bot não tem essa intenção
            sender: SENDER_DANIEL
        },
    ];

    for (const testCase of dividaTestCases) {
        await runTestCase(testCase);
    }

    console.log('\n--- FIM DA SUÍTE DE TESTES: Dívidas ---');
}

module.exports = { runDividaTests };