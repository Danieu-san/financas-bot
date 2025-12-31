// test/test_utils.js
const { handleMessage } = require('../src/handlers/messageHandler');
const userStateManager = require('../src/state/userStateManager');
const { authorizeGoogle, getSheetIds } = require('../src/services/google');
const { clearAllCache } = require('../src/utils/cache'); // Assumindo que você tem essa função
const { resetRateLimiter } = require('../src/utils/rateLimiter'); // Assumindo que você tem essa função

// IDs de usuários para simulação
const SENDER_DANIEL = '5521970112407@c.us';
const SENDER_OTHER = 'outro_usuario@c.us'; // Um ID de usuário que NÃO é admin

/**
 * Configura o bot para a execução dos testes funcionais.
 * Inclui inicialização de módulos, autorização de APIs e carregamento de IDs de planilhas.
 */
async function setupBotForTest() {
    console.log("✅ Módulo de Cache inicializado.");
    if (typeof clearAllCache === 'function') { // Verifica se a função existe
        clearAllCache(); // Limpa o cache para cada execução de teste
    } else {
        console.warn("⚠️ Função clearAllCache não encontrada. Cache pode não ser limpo.");
    }
    
    console.log("✅ Módulo Rate Limiter inicializado.");
    if (typeof resetRateLimiter === 'function') { // Verifica se a função existe
        resetRateLimiter(); // Reseta o rate limiter
    } else {
        console.warn("⚠️ Função resetRateLimiter não encontrada. Rate Limiter pode não ser resetado.");
    }

    // Garante que o userStateManager está limpo
    userStateManager.resetAllStates();
    console.log("Conteúdo de userStateManager:", userStateManager);

    console.log("✅ Google Sheets, Tasks e Calendar API autorizadas com sucesso!");
    await authorizeGoogle();

    console.log("✅ IDs das abas carregados:");
    const sheetIds = await getSheetIds();
    console.log(sheetIds);
    console.log("✅ Google APIs configuradas para testes.");
}

/**
 * Simula o envio de uma mensagem para o bot.
 * @param {string} senderId O ID do remetente da mensagem.
 * @param {string} messageBody O corpo da mensagem.
 * @returns {Promise<string>} A resposta do bot.
 */
async function simulateMessage(senderId, messageBody) {
    let botResponse = '';
    const mockMessage = {
        from: senderId,
        body: messageBody,
        id: { id: `mock-${Date.now()}-${Math.random()}` }, // ID único para evitar duplicação no Set
        type: 'chat', // Tipo padrão
        reply: async (response) => {
            console.log(`[BOT RESPONDEU]: ${response}`);
            botResponse = response;
            return response;
        }
    };
    console.log(`Mensagem de ${senderId}: "${messageBody}"`);
    await handleMessage(mockMessage);
    return botResponse;
}

/**
 * Registra o resultado de um teste.
 * @param {string} testName O nome do teste.
 * @param {boolean} success Se o teste foi bem-sucedido.
 * @param {string} [expected] O valor esperado (opcional).
 * @param {string} [received] O valor recebido (opcional).
 */
function logTestResult(testName, success, expected = '', received = '') {
    if (success) {
        console.log(`✅ SUCESSO! Teste: "${testName}"`);
    } else {
        console.log(`❌ FALHA! Teste: "${testName}"`);
        if (expected && received) {
            console.log(`  Esperado: "${expected}"`);
            console.log(`  Recebido: "${received}"`);
        }
    }
}

/**
 * Registra a resposta bruta da IA.
 * @param {object} aiResponse A resposta da IA.
 */
function logRawAIResponse(aiResponse) {
    console.log('--- RESPOSTA BRUTA DA IA ---');
    console.log(JSON.stringify(aiResponse, null, 2));
    console.log('--------------------------');
}

/**
 * Executa um caso de teste (single-step ou multi-step).
 * @param {object} testCase O objeto do caso de teste.
 */
async function runTestCase(testCase) {
    let currentBotResponse = null; // Variável local para a resposta do bot em cada passo/teste
    userStateManager.resetAllStates(); // Limpa o estado antes de cada caso de teste
    currentBotResponse = null; // Reseta a resposta capturada para cada teste

    console.log(`\n--- Teste: ${testCase.name} ---`);

    if (testCase.type === 'multi-step') {
        console.log(`Tipo: Multi-passos`);
        let allStepsPassed = true;
        for (let i = 0; i < testCase.steps.length; i++) {
            const step = testCase.steps[i];
            console.log(`  Passo ${i + 1} - Entrada: "${step.input}"`);
            currentBotResponse = null; // Reseta a resposta capturada para cada passo

            const mockMessage = {
                from: testCase.sender,
                body: step.input,
                id: { id: `mock-${Date.now()}-${Math.random()}` },
                type: 'chat',
                reply: async (response) => {
                    console.log(`[BOT RESPONDEU]: ${response}`);
                    currentBotResponse = response;
                    return response;
                }
            };

            try {
                await handleMessage(mockMessage);
                // Pequeno atraso para garantir que todas as operações assíncronas (Gemini, Google Sheets) sejam concluídas
                await new Promise(resolve => setTimeout(resolve, 3000)); // Aumentado para 3 segundos

                if (currentBotResponse) {
                    const success = step.expected instanceof RegExp ? step.expected.test(currentBotResponse) : currentBotResponse.includes(step.expected);
                    if (success) {
                        console.log(`  ✅ SUCESSO! Resposta esperada (${step.expected}) encontrada.`);
                    } else {
                        console.error(`  ❌ FALHA! Resposta inesperada no Passo ${i + 1} para "${testCase.name}".`);
                        console.error(`    Esperado: ${step.expected}`);
                        console.error(`    Recebido: "${currentBotResponse}"`);
                        allStepsPassed = false;
                        break; // Para o teste multi-passos no primeiro erro
                    }
                } else {
                    console.error(`  ❌ FALHA! Nenhuma resposta do bot no Passo ${i + 1} para "${testCase.name}".`);
                    allStepsPassed = false;
                    break;
                }
            } catch (error) {
                console.error(`  ❌ ERRO durante o Passo ${i + 1} do teste "${testCase.name}":`, error);
                allStepsPassed = false;
                break;
            }
        }
        if (allStepsPassed) {
            console.log(`✅ TESTE MULTI-PASSOS "${testCase.name}" CONCLUÍDO COM SUCESSO!`);
        } else {
            console.error(`❌ TESTE MULTI-PASSOS "${testCase.name}" FALHOU.`);
        }

    } else { // Single-step test
        console.log(`Mensagem de Entrada: "${testCase.input}"`);
        currentBotResponse = null; // Reseta a resposta capturada

        const mockMessage = {
            from: testCase.sender,
            body: testCase.input,
            id: { id: `mock-${Date.now()}-${Math.random()}` },
            type: 'chat',
            reply: async (response) => {
                console.log(`[BOT RESPONDEU]: ${response}`);
                currentBotResponse = response;
                return response;
            }
        };
        
        try {
            await handleMessage(mockMessage);
            await new Promise(resolve => setTimeout(resolve, 3000)); // Atraso para processamento

            if (currentBotResponse) {
                const success = testCase.expected instanceof RegExp ? testCase.expected.test(currentBotResponse) : currentBotResponse.includes(testCase.expected);
                if (success) {
                    console.log(`✅ SUCESSO! Resposta esperada (${testCase.expected}) encontrada.`);
                } else {
                    console.error(`❌ FALHA! Resposta inesperada para "${testCase.name}".`);
                    console.error(`  Esperado: ${testCase.expected}`);
                    console.error(`  Recebido: "${currentBotResponse}"`);
                }
            } else {
                console.error(`❌ FALHA! Nenhuma resposta do bot para "${testCase.name}".`);
            }
        } catch (error) {
            console.error(`❌ ERRO durante o teste "${testCase.name}":`, error);
        }
    }
}


module.exports = {
    setupBotForTest,
    simulateMessage,
    logTestResult,
    logRawAIResponse,
    SENDER_DANIEL,
    SENDER_OTHER,
    runTestCase // &lt;--- AGORA EXPORTADO!
};