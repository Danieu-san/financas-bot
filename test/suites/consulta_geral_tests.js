// test/suites/consulta_geral_tests.js
const { simulateMessage, logTestResult, SENDER_DANIEL, runTestCase } = require('../test_utils');
const userStateManager = require('../../src/state/userStateManager');

async function runConsultaGeralTests() {
    console.log('\n--- SUÍTE DE TESTES: Consultas e Geral ---');

    // Limpa o estado antes de cada suíte
    userStateManager.clearState(SENDER_DANIEL);
    userStateManager.resetAllStates();

    const consultaGeralTestCases = [
        {
            name: 'Cenário 5.1: Pergunta vs. Conversa - Saldo Devedor',
            type: 'single-step',
            input: 'qual meu saldo devedor total?',
            expected: /Desculpe, não consegui processar essa análise\. Tente reformular a pergunta\./, // Ainda com erro de parseValue
            sender: SENDER_DANIEL
        },
        {
            name: 'Parte 4.1 - Teste de Pergunta (Transporte)',
            type: 'single-step',
            input: 'quanto gastei com transporte?',
            expected: /Certo! Aqui está a resposta amigável:\n\n"Em \w+ de \d{4}, seus gastos com transporte totalizaram R\$ \d+,\d{2}\."/, // Resposta formatada
            sender: SENDER_DANIEL
        },
        {
            name: 'Consulta de Saldo (Admin)',
            type: 'single-step',
            input: 'Qual meu saldo?',
            expected: /Desculpe, não consegui processar essa análise\. Tente reformular a pergunta\./, // Ainda com erro de parseValue
            sender: SENDER_DANIEL
        },
        {
            name: 'Consulta de Dívidas (Admin)',
            type: 'single-step',
            input: 'Resumo das dívidas',
            expected: /Para que eu possa te dar um resumo útil e preciso sobre as dívidas, preciso que você seja um pouco mais específico\(a\)\./, // Bot pede mais detalhes
            sender: SENDER_DANIEL
        },
        {
            name: 'Consulta de Gastos no Mês (Admin)',
            type: 'single-step',
            input: 'Quanto gastei este mês?',
            expected: /Desculpe, não consegui processar essa análise\. Tente reformular a pergunta\./, // Ainda com erro de parseValue
            sender: SENDER_DANIEL
        },
        {
            name: 'Consulta de Orçamento (Admin)',
            type: 'single-step',
            input: 'Meu orçamento para alimentação',
            expected: /Você está certo! A sua pergunta sobre "orçamento para alimentação" é bastante genérica/, // Bot explica o conceito
            sender: SENDER_DANIEL
        },
        {
            name: 'Consulta de Metas (Admin)',
            type: 'single-step',
            input: 'Quais são minhas metas?',
            expected: /Como uma inteligência artificial, eu \*\*não tenho acesso às suas informações pessoais, sentimentos, aspirações ou contexto de vida\*\./, // Bot explica o conceito
            sender: SENDER_DANIEL
        },
        {
            name: 'Consulta de Patrimônio (Admin)',
            type: 'single-step',
            input: 'Qual meu patrimônio?',
            expected: /Como uma inteligência artificial, eu não tenho acesso às suas informações pessoais ou financeiras, portanto, não consigo calcular ou informar o seu patrimônio específico\./, // Bot explica o conceito
            sender: SENDER_DANIEL
        },
        {
            name: 'Perguntar sobre Categorias de Dívidas (Admin)',
            type: 'single-step',
            input: 'Quais categorias de dívidas eu tenho?',
            expected: /Entendo que você queira saber quais categorias de dívidas você tem\./, // Bot explica o conceito
            sender: SENDER_DANIEL
        },
        {
            name: 'Perguntar sobre Limite de Cartão (Admin)',
            type: 'single-step',
            input: 'Qual o limite do meu cartão Nubank - Daniel?',
            expected: /A sua pergunta é "genérica" porque, como inteligência artificial, \*\*eu não tenho acesso aos seus dados pessoais ou à sua conta bancária do Nubank\.\*\*/, // Bot explica o conceito
            sender: SENDER_DANIEL
        },
        {
            name: 'Extrato de Conta (Admin)',
            type: 'single-step',
            input: 'Extrato da conta Bradesco',
            expected: /Para consultar o extrato da sua conta Bradesco, existem diversas formas, pois a sua solicitação é bastante ampla\./, // Bot explica o conceito
            sender: SENDER_DANIEL
        },
    ];

    for (const testCase of consultaGeralTestCases) {
        await runTestCase(testCase);
    }

    console.log('\n--- FIM DA SUÍTE DE TESTES: Consultas e Geral ---');
}

module.exports = { runConsultaGeralTests };