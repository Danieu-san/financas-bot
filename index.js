require('dotenv').config();

const { initializeWhatsAppClient } = require('./src/services/whatsapp');
const { authorizeGoogleSheets, getSheetIds } = require('./src/services/sheets');
const { handleMessage } = require('./src/handlers/messageHandler');

async function startBot() {
    console.log('Iniciando o bot...');

    // Validação de variáveis de ambiente essenciais (VERSÃO CORRETA E FINAL)
    if (!process.env.SPREADSHEET_ID || !process.env.GEMINI_API_KEY || !process.env.GOOGLE_REFRESH_TOKEN || !process.env.ADMIN_IDS) {
        console.error("❌ Faltam variáveis de ambiente essenciais. Verifique seu .env (SPREADSHEET_ID, GEMINI_API_KEY, GOOGLE_REFRESH_TOKEN, ADMIN_IDS).");
        process.exit(1);
    }

    try {
        // 1. Autoriza e prepara a API do Google Sheets
        await authorizeGoogleSheets();
        await getSheetIds(); // Carrega os IDs das abas para o cache interno do módulo

        // 2. Inicializa o cliente do WhatsApp
        const client = initializeWhatsAppClient();

        // 3. Conecta o handler principal de mensagens ao evento 'message'
        client.on('message', handleMessage);

        console.log('✅ Bot pronto para receber mensagens.');

    } catch (error) {
        console.error('❌ Erro fatal ao iniciar o bot:', error);
        process.exit(1);
    }
}

startBot();