// test/test_runner.js
const path = require('path');
const fs = require('fs'); // Importa o módulo 'fs' para ler arquivos
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const readline = require('readline');

// Importar utilitários e suítes de teste
const { setupBotForTest } = require('./test_utils');
const { testarAmbiente } = require('./environment_diagnostics'); // O diagnóstico de ambiente é um caso especial

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let testSuites = []; // Será preenchido dinamicamente

async function loadTestSuites() {
    const suitesPath = path.join(__dirname, 'suites');
    const files = fs.readdirSync(suitesPath);

    let idCounter = 1;
    // Adiciona o diagnóstico de ambiente como a primeira opção fixa
    testSuites.push({ id: idCounter++, name: 'Diagnóstico de Ambiente', func: testarAmbiente });

    for (const file of files) {
        if (file.endsWith('_tests.js')) { // Garante que apenas arquivos de teste sejam carregados
            const suiteName = file.replace(/_tests\.js$/, '').replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            const suiteModule = require(path.join(suitesPath, file));
            
            // Assume que cada arquivo de suíte exporta uma única função chamada 'run[SuiteName]Tests'
            // Ex: admin_tests.js exporta runAdminTests
            const funcName = `run${suiteName.replace(/\s/g, '')}Tests`;
            if (typeof suiteModule[funcName] === 'function') {
                testSuites.push({ id: idCounter++, name: suiteName, func: suiteModule[funcName] });
            } else {
                console.warn(`⚠️ Aviso: O arquivo ${file} não exporta a função esperada "${funcName}".`);
            }
        }
    }
}

async function main() {
    await loadTestSuites(); // Carrega as suítes de teste dinamicamente

    console.log('\n--- SELETOR DE SUÍTES DE TESTE ---');
    testSuites.forEach(suite => {
        console.log(`${suite.id}. ${suite.name}`);
    });
    console.log('\nDigite os números das suítes que deseja executar, separados por vírgula (ex: 1,2,5):');
    console.log('Ou digite "all" para executar todas.');

    rl.question('> ', async (answer) => {
        let selectedIds = [];
        if (answer.toLowerCase() === 'all') {
            selectedIds = testSuites.map(s => s.id);
        } else {
            selectedIds = answer.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        }

        const suitesToRun = testSuites.filter(suite => selectedIds.includes(suite.id));

        if (suitesToRun.length === 0) {
            console.log('Nenhuma suíte selecionada ou IDs inválidos.');
            rl.close();
            return;
        }

        console.log('\n--- INICIANDO TESTES SELECIONADOS ---');

        // Executa o diagnóstico de ambiente primeiro se selecionado
        // E garante que seja a primeira coisa a rodar, se estiver na lista
        const environmentDiagnosticSuite = suitesToRun.find(s => s.name === 'Diagnóstico de Ambiente');
        if (environmentDiagnosticSuite) {
            console.log(`\n=== EXECUTANDO SUÍTE: ${environmentDiagnosticSuite.name} ===`);
            const envOk = await environmentDiagnosticSuite.func();
            console.log(`=== SUÍTE ${environmentDiagnosticSuite.name} CONCLUÍDA ===`);
            if (!envOk) {
                console.error("\n🚫 Diagnóstico de ambiente falhou. Corrija os problemas antes de prosseguir com os testes funcionais.");
                rl.close();
                return;
            }
        }
        
        // Configura o bot para testes funcionais (apenas uma vez, se houver testes funcionais além do diagnóstico)
        const functionalTestsSelected = suitesToRun.some(suite => suite.name !== 'Diagnóstico de Ambiente');
        if (functionalTestsSelected) {
            console.log('\n--- CONFIGURANDO BOT PARA TESTES FUNCIONAIS ---');
            await setupBotForTest();
            console.log('--- CONFIGURAÇÃO CONCLUÍDA ---');
        }

        for (const suite of suitesToRun) {
            if (suite.name !== 'Diagnóstico de Ambiente') { // Não executa o diagnóstico de ambiente novamente
                console.log(`\n=== EXECUTANDO SUÍTE: ${suite.name} ===`);
                await suite.func();
                console.log(`=== SUÍTE ${suite.name} CONCLUÍDA ===`);
            }
        }

        console.log('\n--- TODOS OS TESTES SELECIONADOS CONCLUÍDOS ---');
        rl.close();
    });
}

main();