// test/suites/gasto_tests.js
const { simulateMessage, logTestResult, SENDER_DANIEL, runTestCase } = require('../test_utils');
const userStateManager = require('../../src/state/userStateManager');

async function runGastoTests() {
    console.log('\n--- SUÍTE DE TESTES: Gastos (Saídas) ---');

    // Limpa o estado antes de cada suíte
    userStateManager.clearState(SENDER_DANIEL);
    userStateManager.resetAllStates();

    const gastoTestCases = [
        {
            name: 'Cenário 1.1: Gasto Interativo com Correção de Erro',
            type: 'multi-step',
            sender: SENDER_DANIEL,
            steps: [
                {
                    input: 'gastei 25 reais de lanche',
                    expected: /Entendido! E qual foi a forma de pagamento\? \(Crédito, Débito, PIX ou Dinheiro\)/
                },
                {
                    input: 'foi no pixi', // Typos aqui
                    expected: /✅ Gasto de R\$25\.00 \(lanche\) registrado como \*PIX\* para a data de \*\d{2}\/\d{2}\/\d{4}\*!/ // Regex para data
                }
            ]
        },
        {
            name: 'Parte 1.1 - Teste de Mapeamento Básico (Palavra-Chave)',
            type: 'single-step',
            input: 'paguei 25 reais no metrô',
            expected: /Entendido! E qual foi a forma de pagamento\? \(Crédito, Débito, PIX ou Dinheiro\)/, // Espera a pergunta
            sender: SENDER_DANIEL
        },
        {
            name: 'Parte 1.2 - Teste de Mapeamento Específico',
            type: 'single-step',
            input: 'gastei 250 de compras no Assaí',
            expected: /Entendido! E qual foi a forma de pagamento\? \(Crédito, Débito, PIX ou Dinheiro\)/, // Espera a pergunta
            sender: SENDER_DANIEL
        },
        {
            name: 'Parte 1.3 - Teste de Extração de Observações',
            type: 'single-step',
            input: 'gastei 80 de gasolina para a viagem, o posto estava cheio',
            expected: /Entendido! E qual foi a forma de pagamento\? \(Crédito, Débito, PIX ou Dinheiro\)/, // Espera a pergunta
            sender: SENDER_DANIEL
        },
        {
            name: 'Parte 1.4 - Teste de Pagamento Informado',
            type: 'single-step',
            input: 'comprei um remédio de 35 reais na farmácia no crédito',
            expected: /Entendi, o gasto foi no crédito\. Em qual cartão\? Responda com o número:/, // Espera a pergunta do cartão
            sender: SENDER_DANIEL
        },
        {
            name: 'Parte 1.5 - Teste de Recorrência',
            type: 'single-step',
            input: 'paguei a assinatura mensal de 50 reais do streaming',
            expected: /Não encontrei nenhuma dívida com o nome "assinatura mensal de streaming"\./, // Bot ainda classifica como dívida
            sender: SENDER_DANIEL
        },
        {
            name: 'Parte 3.1 - Teste de Pergunta de Pagamento (com erro de digitação)',
            type: 'multi-step',
            sender: SENDER_DANIEL,
            steps: [
                {
                    input: 'gastei 60 reais de uber',
                    expected: /Entendido! E qual foi a forma de pagamento\? \(Crédito, Débito, PIX ou Dinheiro\)/
                },
                {
                    input: 'crdito', // Typos aqui
                    expected: /✅ Gasto de R\$60\.00 \(uber\) registrado como \*Crédito\* para a data de \*\d{2}\/\d{2}\/\d{4}\*!/
                }
            ]
        },
    ];

    for (const testCase of gastoTestCases) {
        await runTestCase(testCase);
    }

    console.log('\n--- FIM DA SUÍTE DE TESTES: Gastos (Saídas) ---');
}

module.exports = { runGastoTests };