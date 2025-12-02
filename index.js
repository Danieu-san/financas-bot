//index.js

require('dotenv').config();

const { initializeWhatsAppClient } = require('./src/services/whatsapp');
const { authorizeGoogle, getSheetIds } = require('./src/services/google');
const { handleMessage } = require('./src/handlers/messageHandler');
const { initializeScheduler } = require('./src/jobs/scheduler');

async function startBot() {
    console.log('Iniciando o bot...');

    // Validação de variáveis de ambiente essenciais (VERSÃO CORRETA E FINAL)
    if (!process.env.SPREADSHEET_ID || !process.env.GEMINI_API_KEY || !process.env.GOOGLE_REFRESH_TOKEN || !process.env.ADMIN_IDS) {
        console.error("❌ Faltam variáveis de ambiente essenciais. Verifique seu .env (SPREADSHEET_ID, GEMINI_API_KEY, GOOGLE_REFRESH_TOKEN, ADMIN_IDS).");
        process.exit(1);
    }

    try {
        // 1. Autoriza e prepara a API do Google Sheets
        await authorizeGoogle();
        await getSheetIds(); // Carrega os IDs das abas para o cache interno do módulo

        // 2. Inicializa o cliente do WhatsApp
        const client = initializeWhatsAppClient();

        // 3. INICIA O AGENDADOR DE TAREFAS
        client.on('ready', () => {
            console.log('🚀 WhatsApp pronto! Iniciando agendador de tarefas...');
            initializeScheduler(client);
        });

        // 4. Conecta o handler principal de mensagens ao evento 'message'
        client.on('message', handleMessage);

        console.log('✅ Bot pronto para receber mensagens.');

    } catch (error) {
        console.error('❌ Erro fatal ao iniciar o bot:', error);
        process.exit(1);
    }
}

startBot();