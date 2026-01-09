// test/suites/exclusao_tests.js
const { simulateMessage, logTestResult, SENDER_DANIEL, runTestCase } = require('../test_utils');
const userStateManager = require('../../src/state/userStateManager');

async function seedGastoAndFinalize({ sender, text, pagamentoFallback }) {
  const r1 = await simulateMessage(sender, text);

    // Se o bot entrou no modo de confirmação ("Você confirma..."), precisa responder "sim"
    if (typeof r1 === 'string' && /Você confirma o registro/i.test(r1)) {
        const r2 = await simulateMessage(sender, 'sim');

        // Se ele perguntar como foi pago, responde com o fallback
        if (typeof r2 === 'string' && /como esses itens foram pagos\?/i.test(r2)) {
        await simulateMessage(sender, pagamentoFallback || 'pix');
        }
    } else {
        // Caso não tenha pedido confirmação, pode ser que ele pergunte direto pagamento/parcelas
        // Se pedir pagamento, responde
        if (typeof r1 === 'string' && /onde você recebeu esse valor\?/i.test(r1)) {
            await simulateMessage(sender, recebimentoFallback || 'pix');
            return;
        }

        // Alguns fluxos perguntam "como esses itens foram pagos?"
        if (typeof r1 === 'string' && /como esses itens foram pagos\?/i.test(r1)) {
            await simulateMessage(sender, recebimentoFallback || 'pix');
            return;
        }
    }
}

    async function seedEntradaAndFinalize({ sender, text, recebimentoFallback }) {
    const r1 = await simulateMessage(sender, text);

    // Fluxo de confirmação em batch
    if (typeof r1 === 'string' && /Você confirma o registro/i.test(r1)) {
        const r2 = await simulateMessage(sender, 'sim');

        // Alguns fluxos reaproveitam "como esses itens foram pagos?"
        if (typeof r2 === 'string' && /como esses itens foram pagos\?/i.test(r2)) {
        await simulateMessage(sender, recebimentoFallback || 'pix');
        return;
        }
    }

    // Fluxo “interativo”: pergunta onde recebeu
    if (typeof r1 === 'string' && /onde você recebeu esse valor\?/i.test(r1)) {
        await simulateMessage(sender, recebimentoFallback || 'pix');
    }
    }

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
                await seedGastoAndFinalize({
                    sender: SENDER_DANIEL,
                    text: 'gastei 10 de teste no pix',
                    pagamentoFallback: 'pix',
                });

                userStateManager.clearState(SENDER_DANIEL);
                return true;
            },
            steps: [
                {
                    input: 'apagar última saída',
                    expected: /Encontrei 1 item\(ns\) para apagar na aba "Saídas":[\s\S]*\|\s*teste\s*\|[\s\S]*R\$\s*10,00[\s\S]*Você tem certeza\?/i
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
                await seedGastoAndFinalize({
                    sender: SENDER_DANIEL,
                    text: 'gastei 250 de compras no Assaí no débito',
                    pagamentoFallback: 'débito',
                });

                userStateManager.clearState(SENDER_DANIEL);
                return true;
            },
                steps: [
                    {
                        input: 'apagar saída de 250 reais do Assaí',
                        expected: /Encontrei \d+ item\(ns\) para apagar na aba "Saídas":[\s\S]*(assa[ií]|assai)[\s\S]*R\$\s*250/i
                    },
                    {
                        input: '1',
                        expected: /✅ Item\(ns\) apagado\(s\) com sucesso!/i
                    }
                ]
        },
        {
            name: 'Apagar Última Entrada (Admin)',
            type: 'multi-step',
            sender: SENDER_DANIEL,
            preCheck: async () => {
                await seedEntradaAndFinalize({
                    sender: SENDER_DANIEL,
                    text: 'recebi 50 de gorjeta no pix',
                    recebimentoFallback: 'pix',
                });

                userStateManager.clearState(SENDER_DANIEL);
                return true;
            },
            steps: [
                {
                    input: 'apagar última entrada',
                    expected: /Encontrei 1 item\(ns\) para apagar na aba "Entradas":[\s\S]*\|\s*gorjeta\s*\|[\s\S]*R\$\s*50,00[\s\S]*Você tem certeza\?/i
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
                await seedEntradaAndFinalize({
                    sender: SENDER_DANIEL,
                    text: 'recebi 5000 de salario na conta corrente',
                    recebimentoFallback: 'conta corrente',
                });

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
                    expected: /Encontrei 1 item\(ns\) para apagar na aba "Dívidas":[\s\S]*Dívida Teste[\s\S]*Credor Teste[\s\S]*(Categoria:\s*)?Outros[\s\S]*\|\s*100\s*\|\s*100[\s\S]*Você tem certeza\?/i
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
                    expected: /Encontrei \d+ item\(ns\) para apagar na aba "Dívidas":[\s\S]*Pedro[\s\S]*Você tem certeza\?/i
                },
                {
                    input: 'não',
                    expected: /Ok, a exclusão foi cancelada\./i
                }
            ]
        },
        {
            name: 'Cenário 4.1: Exclusão Seletiva (Entrada)',
            type: 'multi-step',
            sender: SENDER_DANIEL,
            preCheck: async () => {
                await seedEntradaAndFinalize({
                    sender: SENDER_DANIEL,
                    text: 'recebi 100 de presente no pix',
                    recebimentoFallback: 'pix',
                });

                await seedEntradaAndFinalize({
                    sender: SENDER_DANIEL,
                    text: 'recebi 200 de presente na conta corrente',
                    recebimentoFallback: 'conta corrente',
                });

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
                await seedGastoAndFinalize({
                    sender: SENDER_DANIEL,
                    text: 'gastei 50 de café no pix',
                    pagamentoFallback: 'pix',
                });

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
                 await seedEntradaAndFinalize({
                    sender: SENDER_DANIEL,
                    text: 'recebi 3000 de salario em jan no pix',
                    recebimentoFallback: 'pix',
                });

                await seedEntradaAndFinalize({
                    sender: SENDER_DANIEL,
                    text: 'recebi 3500 de salario em fev no pix',
                    recebimentoFallback: 'pix',
                });

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
                 await seedGastoAndFinalize({
                    sender: SENDER_DANIEL,
                    text: 'gastei 100 no restaurante no pix',
                    pagamentoFallback: 'pix',
                });

                userStateManager.clearState(SENDER_DANIEL);
                return true;
            },
            steps: [
                {
                    input: 'excluir saida restaurante', // Usando sinônimos
                    expected: /Encontrei \d+ item\(ns\) para apagar na aba "Saídas":/i
                },
                {
                    input: 'não', // Cancelamento
                    expected: /Ok, a exclusão foi cancelada\./
                }
            ]
        },
        {
            name: 'Cenário: Cancelamento via "cancelar" (Saídas)',
            type: 'multi-step',
            sender: SENDER_DANIEL,
            preCheck: async () => {
                await seedGastoAndFinalize({
                sender: SENDER_DANIEL,
                text: 'gastei 12 de teste cancelar no pix',
                pagamentoFallback: 'pix',
                });

                userStateManager.clearState(SENDER_DANIEL);
                return true;
            },
            steps: [
                {
                input: 'apagar ultimo gasto',
                expected: /Encontrei \d+ item\(ns\) para apagar na aba "Saídas":[\s\S]*Você tem certeza\?/i
                },
                {
                input: 'cancelar',
                expected: /Ok, a exclusão foi cancelada\./i
                }
            ]
        },
        {
            name: 'Cenário: Seleção inválida cancela exclusão (Saídas)',
            type: 'multi-step',
            sender: SENDER_DANIEL,
            preCheck: async () => {
                await seedGastoAndFinalize({
                sender: SENDER_DANIEL,
                text: 'gastei 13 de teste selecao invalida no pix',
                pagamentoFallback: 'pix',
                });

                userStateManager.clearState(SENDER_DANIEL);
                return true;
            },
            steps: [
                {
                input: 'apagar ultimo gasto',
                expected: /Encontrei \d+ item\(ns\) para apagar na aba "Saídas":[\s\S]*Você tem certeza\?/i
                },
                {
                input: 'banana',
                expected: /Não entendi sua seleção\. A exclusão foi cancelada\./i
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
        try {
        if (testCase.preCheck) {
            const preCheckPassed = await testCase.preCheck();
            if (!preCheckPassed) {
                logTestResult(testCase.name, false, 'Pré-condição falhou.');
                continue;
            }
        }

        await runTestCase(testCase);
        } finally {
            // ✅ garante isolamento: se um teste falhar no meio, não deixa "confirming_delete" preso
            userStateManager.clearState(SENDER_DANIEL);
        }
    }

    console.log('\n--- FIM DA SUÍTE DE TESTES: Exclusão de Itens ---');
}

module.exports = { runExclusaoTests };