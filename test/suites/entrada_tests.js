// test/suites/entrada_tests.js
const { simulateMessage, logTestResult, SENDER_DANIEL, runTestCase } = require('../test_utils');
const userStateManager = require('../../src/state/userStateManager');

async function runEntradaTests() {
    console.log('\n--- SUÍTE DE TESTES: Entradas (Recebimentos) ---');

    // Limpa o estado antes de cada suíte
    userStateManager.clearState(SENDER_DANIEL);
    userStateManager.resetAllStates();

    const entradaTestCases = [
        {
            name: 'Cenário 2.1: Entrada Interativa com Mapeamento sem Acento',
            type: 'multi-step',
            sender: SENDER_DANIEL,
            steps: [
                {
                    input: 'recebi 5000 do salario', // Sem acento
                    expected: /Entendido! E onde você recebeu esse valor\? \(Conta Corrente, Poupança, PIX ou Dinheiro\)/
                },
                {
                    input: 'conta corrente',
                    expected: /✅ Entrada de R\$5000\.00 \(salario\) registrada como \*Conta Corrente\* para a data de \*\d{2}\/\d{2}\/\d{4}\*!/
                }
            ]
        },
        {
            name: 'Parte 2.1 - Teste de Categoria de Entrada',
            type: 'single-step',
            input: 'recebi 5000 do meu salário de julho',
            expected: /Entendido! E onde você recebeu esse valor\? \(Conta Corrente, Poupança, PIX ou Dinheiro\)/, // Espera a pergunta
            sender: SENDER_DANIEL
        },
        {
            name: 'Parte 2.2 - Teste de Recebimento Informado',
            type: 'single-step',
            input: 'vendi o videogame por 1500 reais no pix, finalmente!',
            expected: /Encontrei 1 transaç\(ão\|ões\) para registrar:\n\n\*1\.\* \[Entrada\] videogame - \*R\$1500\* \(Venda\)\n\nVocê confirma o registro de todos os itens\? Responda com \*'sim'\* ou \*'não'\*\./, // Espera a confirmação
            sender: SENDER_DANIEL
        },
        {
            name: 'Parte 3.2 - Teste de Pergunta de Recebimento (com erro de digitação)',
            type: 'multi-step',
            sender: SENDER_DANIEL,
            steps: [
                {
                    input: 'recebi 100 reais de presente da minha mãe',
                    expected: /Entendido! E onde você recebeu esse valor\? \(Conta Corrente, Poupança, PIX ou Dinheiro\)/
                },
                {
                    input: 'conta corente', // Typos aqui
                    expected: /✅ Entrada de R\$100\.00 \(presente da minha mãe\) registrada como \*Conta Corrente\* para a data de \*\d{2}\/\d{2}\/\d{4}\*!/
                }
            ]
        },
    ];

    for (const testCase of entradaTestCases) {
        await runTestCase(testCase);
    }

    console.log('\n--- FIM DA SUÍTE DE TESTES: Entradas (Recebimentos) ---');
}

module.exports = { runEntradaTests };