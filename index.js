//index.js

require('dotenv').config();

const { initializeWhatsAppClient } = require('./src/services/whatsapp');
const { authorizeGoogle, getSheetIds, ensureSpreadsheetStructure } = require('./src/services/google');
const { handleMessage } = require('./src/handlers/messageHandler');
const { initializeScheduler } = require('./src/jobs/scheduler');
const { validateUserIdIntegrity, backfillMissingUserIds } = require('./src/services/userIdMaintenanceService');
const { initializeReadModel, syncReadModelIfNeeded, getReadModelStats } = require('./src/services/readModelService');
const { startDashboardServer } = require('./src/services/dashboardServer');
const { backfillUnreadMessages } = require('./src/services/whatsappUnreadBackfillService');
const logger = require('./src/utils/logger');
const { registerFinancialCommandPlannerRuntimeReload } = require('./src/config/financialCommandPlannerRuntimeConfig');
const { registerFinancialAgentRuntimeReload } = require('./src/config/financialAgentRuntimeConfig');
const { initializeOpenFinanceCanaryRuntime } = require('./src/openFinance/openFinanceCanaryRuntime');

registerFinancialCommandPlannerRuntimeReload({ logger });
registerFinancialAgentRuntimeReload({ logger });

async function startBot() {
    const startupUnixSeconds = Math.floor(Date.now() / 1000);
    const unreadBackfillLookbackSeconds = Number(process.env.WHATSAPP_UNREAD_BACKFILL_LOOKBACK_SECONDS || 60);
    console.log('🚀 Iniciando o bot...');

    // Validação de variáveis de ambiente
    if (!process.env.SPREADSHEET_ID || !process.env.GEMINI_API_KEY || !process.env.GOOGLE_REFRESH_TOKEN || !process.env.ADMIN_IDS) {
        logger.error('[startup] variaveis_essenciais_ausentes');
        process.exit(1);
    }

    try {
        // 1. Autoriza e prepara a API do Google Sheets ANTES do WhatsApp
        // Isso evita que o WhatsApp fique 'pendurado' esperando o Google
        await authorizeGoogle();
        await ensureSpreadsheetStructure();
        await getSheetIds(); 
        initializeReadModel();
        try {
            await syncReadModelIfNeeded({ force: true });
            logger.info(`[startup] read-model pronto: ${JSON.stringify(getReadModelStats())}`);
        } catch (readModelError) {
            logger.warn(`[startup] read-model indisponível no boot. fallback legado ativo. motivo=${readModelError.message}`);
        }

        const shouldAutoBackfill = String(process.env.AUTO_BACKFILL_USER_ID_ON_STARTUP || 'false').toLowerCase() === 'true';
        if (shouldAutoBackfill) {
            const backfillResult = await backfillMissingUserIds({
                allowSingleUserFallback: String(process.env.BACKFILL_ALLOW_SINGLE_USER_FALLBACK || 'false').toLowerCase() === 'true'
            });
            logger.info(`[startup] backfill user_id executado: ${JSON.stringify(backfillResult)}`);
        }

        const shouldValidateUserIds = String(process.env.VALIDATE_USER_ID_ON_STARTUP || 'true').toLowerCase() !== 'false';
        if (shouldValidateUserIds) {
            const report = await validateUserIdIntegrity();
            if (report.missingUserId > 0) {
                logger.warn(`[startup] integridade user_id com pendencias: ${JSON.stringify(report)}`);
            } else {
                logger.info('[startup] integridade user_id validada: sem pendencias.');
            }
        }

        console.log('✅ Google Sheets configurado. Iniciando WhatsApp...');

        // 2. Inicializa o cliente do WhatsApp
        const client = initializeWhatsAppClient();
        if (!client) return; // Evita erro se já estiver inicializando
        startDashboardServer();

        // 3. Configura os handlers de eventos
        client.once('ready', () => {
            console.log('✅ Bot pronto para receber mensagens!');
            // Inicia o agendador apenas quando o bot estiver pronto pela primeira vez
            initializeScheduler(client);
            initializeOpenFinanceCanaryRuntime({ client, logger });
            void backfillUnreadMessages(client, handleMessage, {
                logger,
                enabled: String(process.env.WHATSAPP_UNREAD_BACKFILL_ON_READY || 'true').toLowerCase() !== 'false',
                delayMs: Number(process.env.WHATSAPP_UNREAD_BACKFILL_DELAY_MS || 3000),
                maxPerChat: Number(process.env.WHATSAPP_UNREAD_BACKFILL_MAX_PER_CHAT || 20),
                notBeforeTimestamp: Math.max(0, startupUnixSeconds - unreadBackfillLookbackSeconds)
            }).catch(error => {
                logger.warn('[whatsapp] unread backfill falhou: ' + error.message);
            });
        });

        client.on('message', handleMessage);

    } catch (error) {
        logger.error(`[startup] fatal_error ${logger.safeError(error)}`);
        process.exit(1);
    }
}

// Tratamento de erros globais para evitar crashes silenciosos
process.on('unhandledRejection', (reason) => {
    logger.error(`[process] unhandled_rejection ${logger.safeError(reason)}`);
});

startBot();
