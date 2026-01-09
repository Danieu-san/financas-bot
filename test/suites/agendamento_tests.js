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
            expected: /✅ Lembrete criado:/,
            sender: SENDER_DANIEL
        },
        {
            name: 'Adicionar Tarefa (Admin)',
            type: 'single-step',
            input: 'Adicionar tarefa: comprar mantimentos',
            expected: /Não entendi os detalhes do lembrete\. Por favor, inclua o que e quando \(ex: 'me lembre de pagar a luz amanhã às 10h'\)\./, // Bot pede mais detalhes
            sender: SENDER_DANIEL
        },
        {
            name: 'Agendar Lembrete com Horário (Admin) - data + hora',
            type: 'single-step',
            input: 'Me lembre de pagar a internet dia 10/01/2026 às 10:00',
            expected: /✅ Lembrete criado:/,
            sender: SENDER_DANIEL
        },
        {
            name: 'Agendar Lembrete (Admin) - hoje',
            type: 'single-step',
            input: 'Me lembre de tomar remédio hoje',
            expected: /✅ Lembrete criado:/,
            sender: SENDER_DANIEL
        },
        {
            name: 'Agendar Lembrete (Admin) - amanhã com horário',
            type: 'single-step',
            input: 'Me lembre de pagar a fatura amanhã às 10:00',
            expected: /✅ Lembrete criado:/,
            sender: SENDER_DANIEL
        },
        {
            name: 'Agendar Lembrete (Admin) - erro de digitação',
            type: 'single-step',
            input: 'Me lembre de pagra a agua dia 10 de janeiro',
            expected: /✅ Lembrete criado:/,
            sender: SENDER_DANIEL
        },
        {
            name: 'Agendar Lembrete (Admin) - sem quando (deve pedir detalhes)',
            type: 'single-step',
            input: 'Me lembre de pagar a água',
            expected: /Não entendi os detalhes do lembrete\./,
            sender: SENDER_DANIEL
        },
        {
            name: 'Agendar Lembrete (Admin) - data impossível',
            type: 'single-step',
            input: 'Me lembre de pagar a água dia 32/01/2026',
            expected: /(Não entendi os detalhes do lembrete|Houve um erro ao tentar salvar o evento)/,
            sender: SENDER_DANIEL
        },
        {
            name: 'Agendar Lembrete (Admin) - hora impossível',
            type: 'single-step',
            input: 'Me lembre de pagar a água dia 10/01/2026 às 25:99',
            expected: /(Não entendi os detalhes do lembrete|Houve um erro ao tentar salvar o evento)/,
            sender: SENDER_DANIEL
        },
        {
            name: 'Agendar Lembrete (Admin) - recorrente',
            type: 'single-step',
            input: 'Me lembre de tomar vitamina todo dia às 09:00',
            expected: /✅ Lembrete criado:/,
            sender: SENDER_DANIEL
         },
       {
            name: 'Agendar Lembrete (Admin) - formato com "às" válido',
            type: 'single-step',
            input: 'Me lembre de pagar a luz dia 10/01/2026 às 10:00',
            expected: /✅ Lembrete criado:/,
            sender: SENDER_DANIEL
        },
    ];

    for (const testCase of agendamentoTestCases) {
        await runTestCase(testCase);
    }

    console.log('\n--- FIM DA SUÍTE DE TESTES: Agendamento ---');
}

module.exports = { runAgendamentoTests };