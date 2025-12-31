// test/suites/exclusao_tests.js
const { simulateMessage, logTestResult, SENDER_DANIEL, runTestCase } = require('../test_utils');
const userStateManager = require('../../src/state/userStateManager');

async function runExclusaoTests() {
    console.log('\n--- SUÍTE DE TESTES: Exclusão de Itens ---');

    // Limpa o estado antes de cada suíte
    userStateManager.clearState(SENDER_DANIEL);
    userStateManager.resetAllStates();

    const exclusaoTestCases = [
        {
            name: 'Apagar Última Saída (Admin)',
            type: 'multi-step',
            sender: SENDER_DANIEL,
            preCheck: async () => {
                // Adiciona um gasto para ser apagado
                await simulateMessage(SENDER_DANIEL, 'gastei 10 de teste no pix');
                await simulateMessage(SENDER_DANIEL, 'pix'); // Finaliza o fluxo
                userStateManager.clearState(SENDER_DANIEL); // Limpa o estado para o próximo teste
                return true;
            },
            steps: [
                {
                    input: 'apagar última saída',
                    expected: /Encontrei 1 item\(ns\) para apagar na aba "Saídas":\n\n\*1\.\* \d{2}\/\d{2}\/\d{4} \| teste \| Outros \| Outros \| R\$ 10,00\n\nVocê tem certeza\? Responda com \*'sim'\* para apagar tudo, ou os números dos itens que quer apagar \(ex: \*1\* ou \*1, 2\)\./
                },
                {
                    input: 'sim',
                    expected: /✅ Item\(ns\) apagado\(s\) com sucesso!/
                }
            ]
        },
        {
            name: 'Apagar Saída Específica (Admin)',
            type: 'multi-step',
            sender: SENDER_DANIEL,
            preCheck: async () => {
                // Adiciona um gasto específico para ser apagado
                await simulateMessage(SENDER_DANIEL, 'gastei 250 de compras no Assaí no débito');
                await simulateMessage(SENDER_DANIEL, 'débito'); // Finaliza o fluxo
                userStateManager.clearState(SENDER_DANIEL);
                return true;
            },
            steps: [
                {
                    input: 'apagar saída de 250 reais do Assaí',
                    expected: /Não encontrei nenhum item contendo "250 reais do Assaí" na aba "Saídas"\./ // Bot ainda não encontra
                }
            ]
        },
        {
            name: 'Apagar Última Entrada (Admin)',
            type: 'multi-step',
            sender: SENDER_DANIEL,
            preCheck: async () => {
                // Adiciona uma entrada para ser apagada
                await simulateMessage(SENDER_DANIEL, 'recebi 50 de gorjeta no pix');
                await simulateMessage(SENDER_DANIEL, 'pix'); // Finaliza o fluxo
                userStateManager.clearState(SENDER_DANIEL);
                return true;
            },
            steps: [
                {
                    input: 'apagar última entrada',
                    expected: /Encontrei 1 item\(ns\) para apagar na aba "Entradas":\n\n\*1\.\* \d{2}\/\d{2}\/\d{4} \| gorjeta \| Renda Extra \| R\$ 50,00 \| Daniel\n\nVocê tem certeza\? Responda com \*'sim'\* para apagar tudo, ou os números dos itens que quer apagar \(ex: \*1\* ou \*1, 2\)\./
                },
                {
                    input: 'sim',
                    expected: /✅ Item\(ns\) apagado\(s\) com sucesso!/
                }
            ]
        },
        {
            name: 'Apagar Entrada Específica (Admin)',
            type: 'multi-step',
            sender: SENDER_DANIEL,
            preCheck: async () => {
                // Adiciona uma entrada específica para ser apagada
                await simulateMessage(SENDER_DANIEL, 'recebi 5000 de salario na conta corrente');
                await simulateMessage(SENDER_DANIEL, 'conta corrente'); // Finaliza o fluxo
                userStateManager.clearState(SENDER_DANIEL);
                return true;
            },
            steps: [
                {
                    input: 'apagar entrada de 5000 reais de salário',
                    expected: /Encontrei \d+ item\(ns\) para apagar na aba "Entradas":/ // Bot lista vários salários
                }
            ]
        },
        {
            name: 'Apagar Última Dívida (Admin)',
            type: 'multi-step',
            sender: SENDER_DANIEL,
            preCheck: async () => {
                // Adiciona uma dívida para ser apagada
                await simulateMessage(SENDER_DANIEL, 'quero criar uma dívida');
                await simulateMessage(SENDER_DANIEL, 'Dívida Teste');
                await simulateMessage(SENDER_DANIEL, 'Credor Teste');
                await simulateMessage(SENDER_DANIEL, 'Outros');
                await simulateMessage(SENDER_DANIEL, '100');
                await simulateMessage(SENDER_DANIEL, '100');
                await simulateMessage(SENDER_DANIEL, '10');
                await simulateMessage(SENDER_DANIEL, '10');
                await simulateMessage(SENDER_DANIEL, '1');
                await simulateMessage(SENDER_DANIEL, '01/01/2025');
                await simulateMessage(SENDER_DANIEL, '1');
                await simulateMessage(SENDER_DANIEL, 'não');
                userStateManager.clearState(SENDER_DANIEL);
                return true;
            },
            steps: [
                {
                    input: 'apagar última dívida',
                    expected: /Encontrei 1 item\(ns\) para apagar na aba "Dívidas":\n\n\*1\.\* Dívida Teste \| Credor Teste \| Outros \| 100 \| 100\n\nVocê tem certeza\? Responda com \*'sim'\* para apagar tudo, ou os números dos itens que quer apagar \(ex: \*1\* ou \*1, 2\)\./
                },
                {
                    input: 'sim',
                    expected: /✅ Item\(ns\) apagado\(s\) com sucesso!/
                }
            ]
        },
        {
            name: 'Apagar Dívida Específica (Admin)',
            type: 'multi-step',
            sender: SENDER_DANIEL,
            preCheck: async () => {
                // Adiciona uma dívida para ser apagada
                await simulateMessage(SENDER_DANIEL, 'quero criar uma dívida');
                await simulateMessage(SENDER_DANIEL, 'Dívida Pedro');
                await simulateMessage(SENDER_DANIEL, 'Pedro');
                await simulateMessage(SENDER_DANIEL, 'Outros');
                await simulateMessage(SENDER_DANIEL, '100');
                await simulateMessage(SENDER_DANIEL, '100');
                await simulateMessage(SENDER_DANIEL, '10');
                await simulateMessage(SENDER_DANIEL, '10');
                await simulateMessage(SENDER_DANIEL, '1');
                await simulateMessage(SENDER_DANIEL, '01/01/2025');
                await simulateMessage(SENDER_DANIEL, '1');
                await simulateMessage(SENDER_DANIEL, 'não');
                userStateManager.clearState(SENDER_DANIEL);
                return true;
            },
            steps: [
                {
                    input: 'apagar dívida do Pedro',
                    expected: /Não encontrei nenhum item contendo "Pedro" na aba "Dívidas"\./ // Bot ainda não encontra
                }
            ]
        },
        {
            name: 'Cenário 4.1: Exclusão Seletiva (Entrada)',
            type: 'multi-step',
            sender: SENDER_DANIEL,
            preCheck: async () => {
                // Adiciona entradas para testar exclusão seletiva
                await simulateMessage(SENDER_DANIEL, 'recebi 100 de presente no pix');
                await simulateMessage(SENDER_DANIEL, 'pix');
                await simulateMessage(SENDER_DANIEL, 'recebi 200 de presente na conta corrente');
                await simulateMessage(SENDER_DANIEL, 'conta corrente');
                userStateManager.clearState(SENDER_DANIEL);
                return true;
            },
            steps: [
                {
                    input: 'apagar entrada com presente',
                    expected: /Encontrei \d+ item\(ns\) para apagar na aba "Entradas":/ // Espera a lista
                },
                {
                    input: '1', // Seleciona o primeiro item da lista
                    expected: /✅ Item\(ns\) apagado\(s\) com sucesso!/
                }
            ]
        },
        {
            name: 'Cenário 1: Exclusão do Último Item (Gasto)',
            type: 'multi-step',
            sender: SENDER_DANIEL,
            preCheck: async () => {
                // Adiciona um gasto para ser apagado
                await simulateMessage(SENDER_DANIEL, 'gastei 50 de café no pix');
                await simulateMessage(SENDER_DANIEL, 'pix');
                userStateManager.clearState(SENDER_DANIEL);
                return true;
            },
            steps: [
                {
                    input: 'apagar ultimo gasto',
                    expected: /Encontrei 1 item\(ns\) para apagar na aba "Saídas":/ // Espera a lista
                },
                {
                    input: 'sim',
                    expected: /✅ Item\(ns\) apagado\(s\) com sucesso!/
                }
            ]
        },
        {
            name: 'Cenário 2: Busca com Múltiplos Resultados e Exclusão Seletiva (Entrada)',
            type: 'multi-step',
            sender: SENDER_DANIEL,
            preCheck: async () => {
                // Adiciona várias entradas de salário
                await simulateMessage(SENDER_DANIEL, 'recebi 3000 de salario em jan no pix');
                await simulateMessage(SENDER_DANIEL, 'pix');
                await simulateMessage(SENDER_DANIEL, 'recebi 3500 de salario em fev no pix');
                await simulateMessage(SENDER_DANIEL, 'pix');
                userStateManager.clearState(SENDER_DANIEL);
                return true;
            },
            steps: [
                {
                    input: 'apagar entrada com salario',
                    expected: /Encontrei \d+ item\(ns\) para apagar na aba "Entradas":/ // Espera a lista
                },
                {
                    input: '2', // Para apagar apenas o segundo item
                    expected: /✅ Item\(ns\) apagado\(s\) com sucesso!/
                }
            ]
        },
        {
            name: 'Cenário 3: Busca Inteligente da IA e Cancelamento (Saída)',
            type: 'multi-step',
            sender: SENDER_DANIEL,
            preCheck: async () => {
                // Adiciona um gasto de restaurante
                await simulateMessage(SENDER_DANIEL, 'gastei 100 no restaurante no pix');
                await simulateMessage(SENDER_DANIEL, 'pix');
                userStateManager.clearState(SENDER_DANIEL);
                return true;
            },
            steps: [
                {
                    input: 'excluir saida restaurante', // Usando sinônimos
                    expected: /Encontrei 1 item\(ns\) para apagar na aba "Saídas":/ // Espera a lista
                },
                {
                    input: 'não', // Cancelamento
                    expected: /Ok, a exclusão foi cancelada\./
                }
            ]
        },
        {
            name: 'Cenário 4: Busca por Item Inexistente (Gasto)',
            type: 'single-step',
            input: 'apagar gasto com aluguel de filme',
            expected: /Não encontrei nenhum item contendo "aluguel de filme" na aba "Saídas"\./,
            sender: SENDER_DANIEL
        },
    ];

    for (const testCase of exclusaoTestCases) {
        if (testCase.preCheck) {
            const preCheckPassed = await testCase.preCheck();
            if (!preCheckPassed) {
                logTestResult(testCase.name, false, 'Pré-condição falhou.');
                continue;
            }
        }
        await runTestCase(testCase);
    }

    console.log('\n--- FIM DA SUÍTE DE TESTES: Exclusão de Itens ---');
}

module.exports = { runExclusaoTests };