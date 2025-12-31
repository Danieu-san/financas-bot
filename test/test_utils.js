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

module.exports = {
    setupBotForTest,
    simulateMessage,
    logTestResult,
    logRawAIResponse,
    SENDER_DANIEL,
    SENDER_OTHER
};