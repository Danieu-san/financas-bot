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
        name: 'Adicionar Compra no Cartão (Admin) - fluxo completo',
        type: 'multi-step',
        sender: SENDER_DANIEL,
        steps: [
            {
                input: 'Comprei 80 no cartão Nubank - Daniel: restaurante',
                expected: /Em quantas parcelas\?/,
            },
            {
                input: '1',
                expected: /Cartão Nubank - Daniel/,
            }
        ]
    },
    {
        name: 'Adicionar Compra no Cartão com Data (Admin) - fluxo completo',
        type: 'multi-step',
        sender: SENDER_DANIEL,
        steps: [
        {
    input: 'Gastei 120 no crédito no cartão Nubank - Thais no dia 20: roupas',
    expected: /Em quantas parcelas\?/,
  },
  {
    input: '1',
    expected: /Cartão Nubank - Thais/,
  }
        ]
    },

    {
        name: 'Cartão: variação de texto (nubank da thais)',
        type: 'multi-step',
        sender: SENDER_DANIEL,
        steps: [
            {
            input: 'Gastei 55 no crédito no nubank da thais: mercado',
            expected: /Cartão Nubank - Thais.*Em quantas parcelas\?/i,
            },
            {
            input: '1',
            expected: /Cartão Nubank - Thais/i,
            }
        ]
        },
        {
        name: 'Cartão: tolerância a erro de grafia (atacadao)',
        type: 'multi-step',
        sender: SENDER_DANIEL,
        steps: [
        {
        input: 'Comprei 40 no crédito no cartao atacadao: teste',
        expected: /Cartão Atacadão.*Em quantas parcelas\?/i,
        },
        {
        input: '1',
        expected: /Cartão Atacadão/i,
        }

        ]
        },

                {
            name: 'Cartão: erro ortográfico agressivo (nubnak tais)',
            type: 'multi-step',
            sender: SENDER_DANIEL,
            steps: [
                {
                    input: 'Comprei 33 no credito no nubnak da tais: padaria',
                    expected: /Cartão Nubank - Thais.*Em quantas parcelas\?/i,
                },
                {
                    input: '1',
                    expected: /Cartão Nubank - Thais/i,
                }
            ]
        },   

        {
            name: 'Cartão: ambíguo (só nubank) deve pedir lista',
            type: 'multi-step',
            sender: SENDER_DANIEL,
            steps: [
                {
                    input: 'Comprei 22 no crédito no nubank: teste',
                    expected: /Em qual cartão\? Responda com o número:/i,
                },
                {
                    input: '2',
                    expected: /Em quantas parcelas\?/i,
                },
                {
                    input: '1',
                    expected: /Cartão Nubank - Thais/i,
                }
            ]
        },

        {
        name: 'Cartão (batch): pular lista quando frase original já tem cartão',
        type: 'multi-step',
        sender: SENDER_DANIEL,
        steps: [
            {
            input: 'Hoje paguei 50 de restaurante e 20 de farmácia no crédito no nubank da thais',
            expected: /Você confirma o registro de todos os itens\?/i,
            },
            {
            input: 'sim',
            expected: /como esses itens foram pagos\?/i,
            },
            {
            input: 'credito',
            expected: /Entendido, no cartão \*Cartão Nubank - Thais\*.*parcelas\?/i,
            },
            {
            input: '1',
            expected: /✅ Lançamentos no crédito finalizados com sucesso!/i,
            }
        ]
        },
        {
                name: 'Parcelamento >1',
                type: 'multi-step',
                sender: SENDER_DANIEL,
                steps: [
                    {
                    input: 'Comprei 300 no cartão Nubank - Thais: mercado',
                    expected: /Em quantas parcelas\?/i,
                    },
                    {
                    input: '3',
                    expected: /lançado em\s*3x.*Cartão Nubank - Thais/i,
                    }
                ]
                },
                {
                name: 'Crédito sem cartão na mensagem, escolher cartão por texto',
                type: 'multi-step',
                sender: SENDER_DANIEL,
                steps: [
                    {
                    input: 'Comprei 50 no crédito: padaria',
                    expected: /Em qual cartão\? Responda com o número:/i,
                    },
                    {
                    input: 'nubank thais',
                    expected: /Em quantas parcelas\?/i,
                    },
                    {
                    input: '1',
                    expected: /Cartão Nubank - Thais/i,
                    }
                ]
                },
                {
                name: 'Batch com parcelas diferentes',
                type: 'multi-step',
                sender: SENDER_DANIEL,
                steps: [
                    {
                    input: 'Hoje paguei 90 de restaurante e 30 de farmácia no crédito no nubank da thais',
                    expected: /Você confirma o registro de todos os itens\?/i,
                    },
                    {
                    input: 'sim',
                    expected: /como esses itens foram pagos\?/i,
                    },
                    {
                    input: 'credito',
                    expected: /Entendido, no cartão \*Cartão Nubank - Thais\*.*parcelas\?/i,
                    },
                    {
                    input: 'restaurante em 3x, o resto à vista',
                    expected: /✅ Lançamentos no crédito finalizados com sucesso!/i,
                    }
                ]
                },
                {
                name: 'Cartão inexistente',
                type: 'multi-step',
                sender: SENDER_DANIEL,
                steps: [
                    {
                    input: 'Comprei 50 no crédito no cartão Inter: padaria',
                    expected: /Em qual cartão\? Responda com o número:/i,
                    },
                    {
                    input: '1',
                    expected: /Em quantas parcelas\?/i,
                    }
                ]
                },
                {
                name: 'Crédito sem valor',
                type: 'multi-step',
                sender: SENDER_DANIEL,
                steps: [
                    {
                    input: 'Comprei no crédito no nubank da thais: mercado',
                    expected: /não consegui identificar um valor numérico válido/i,
                    }
                ]
            },
            {
                name: 'Pergunta com palavra crédito',
                type: 'single-step',
                input: 'Qual o total no crédito esse mês?',
                expected: /(Analisando seus dados para responder|seus gastos com crédito totalizaram)/i,
                sender: SENDER_DANIEL
            }

    ];

    for (const testCase of cartaoTestCases) {
        await runTestCase(testCase);
    }

    console.log('\n--- FIM DA SUÍTE DE TESTES: Cartões de Crédito ---');
}

module.exports = { runCartaoTests };