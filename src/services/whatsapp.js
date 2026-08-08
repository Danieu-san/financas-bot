const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { scheduleReadyRescue } = require('./whatsappReadyRescueService');
const { createWhatsAppLivenessMonitor } = require('./whatsappLivenessService');
const { createSupervisorExitRequester } = require('./supervisorExitService');
const logger = require('../utils/logger');

let clientInstance = null;
let isAuthenticated = false;
let isInitializing = false;
let livenessMonitor = null;

const CONFIGURED_WEB_VERSION = String(process.env.WWEB_VERSION || '').trim();
const WEB_VERSION_CACHE_TYPE = process.env.WWEB_CACHE_TYPE || 'none';
const DEFAULT_USER_AGENT = process.env.WWEB_USER_AGENT || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const READY_TIMEOUT_MS = Number(process.env.WWEB_READY_TIMEOUT_MS || 420000);
const AUTH_TIMEOUT_MS = Number(process.env.WWEB_AUTH_TIMEOUT_MS || 180000);
const PROTOCOL_TIMEOUT_MS = Number(process.env.PUPPETEER_PROTOCOL_TIMEOUT_MS || 180000);
const READY_RESCUE_DELAY_MS = Number(process.env.WWEB_READY_RESCUE_DELAY_MS || 15000);
const LIVENESS_INTERVAL_MS = Number(process.env.WWEB_LIVENESS_INTERVAL_MS || 60000);
const LIVENESS_PROBE_TIMEOUT_MS = Number(process.env.WWEB_LIVENESS_PROBE_TIMEOUT_MS || 15000);
const LIVENESS_FAILURE_THRESHOLD = Number(process.env.WWEB_LIVENESS_FAILURE_THRESHOLD || 2);

const supervisorExitRequester = createSupervisorExitRequester({ logger });

function exitForSupervisor(reasonCode) {
    return supervisorExitRequester.request(reasonCode);
}

function initializeWhatsAppClient() {
    if (clientInstance) {
        return clientInstance;
    }

    if (isInitializing) {
        console.log('⚠️ Já existe uma inicialização em andamento...');
        return null;
    }

    isInitializing = true;
    console.log('🔄 Inicializando cliente WhatsApp...');

    const clientOptions = {
        authStrategy: new LocalAuth({
            clientId: 'bot-financeiro'
        }),
        webVersionCache: {
            type: WEB_VERSION_CACHE_TYPE
        },
        userAgent: DEFAULT_USER_AGENT,
        authTimeoutMs: AUTH_TIMEOUT_MS,
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-background-timer-throttling',
                '--disable-renderer-backgrounding',
                '--disable-sync',
                '--disable-default-apps',
                '--single-process',
                '--renderer-process-limit=1',
                '--aggressive-cache-discard',
                '--disable-cache',
                '--disk-cache-size=1',
                '--media-cache-size=1',
                '--disable-features=site-per-process,Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints',
                '--mute-audio'
            ],
            // Aumentar o timeout para evitar falhas em conexões lentas
            protocolTimeout: PROTOCOL_TIMEOUT_MS,
            handleSIGINT: false,
            handleSIGTERM: false,
            handleSIGHUP: false
        }
    };

    if (CONFIGURED_WEB_VERSION && CONFIGURED_WEB_VERSION.toLowerCase() !== 'latest') {
        clientOptions.webVersion = CONFIGURED_WEB_VERSION;
    }

    console.log(`🌐 WhatsApp Web cache: ${WEB_VERSION_CACHE_TYPE}; versão: ${clientOptions.webVersion || 'live/default'}`);

    const client = new Client(clientOptions);
    livenessMonitor = createWhatsAppLivenessMonitor({
        probe: () => client.getState(),
        onUnhealthy: () => exitForSupervisor('runtime_liveness_failed'),
        logger,
        probeIntervalMs: LIVENESS_INTERVAL_MS,
        probeTimeoutMs: LIVENESS_PROBE_TIMEOUT_MS,
        failureThreshold: LIVENESS_FAILURE_THRESHOLD
    });
    livenessMonitor.markStarting();
    livenessMonitor.start();
    let readyWatchdog = null;
    let readyRescueTimer = null;

    function armReadyWatchdog(label) {
        clearReadyWatchdog();
        readyWatchdog = setTimeout(() => {
            if (isInitializing) {
                isInitializing = false;
                exitForSupervisor('ready_timeout');
            }
        }, READY_TIMEOUT_MS);
    }

    function clearReadyWatchdog() {
        if (readyWatchdog) {
            clearTimeout(readyWatchdog);
            readyWatchdog = null;
        }
    }

    function armReadyRescue() {
        if (readyRescueTimer || READY_RESCUE_DELAY_MS <= 0) return;
        readyRescueTimer = scheduleReadyRescue(client, {
            delayMs: READY_RESCUE_DELAY_MS,
            isStillPending: () => isInitializing && isAuthenticated,
            logger
        });
    }

    function clearReadyRescue() {
        if (readyRescueTimer) {
            if (typeof readyRescueTimer.cancel === 'function') {
                readyRescueTimer.cancel();
            } else {
                clearTimeout(readyRescueTimer);
            }
            readyRescueTimer = null;
        }
    }

    armReadyWatchdog('inicialização');

    client.on('qr', qr => {
        isAuthenticated = false;
        livenessMonitor?.markQrPending();
        clearReadyWatchdog();
        clearReadyRescue();
        console.log('⏸️ Aguardando leitura do QR Code. PM2 não será reiniciado enquanto a autenticação estiver pendente.');
        console.log('🔑 Novo QR Code gerado. Escaneie para conectar:');
        qrcode.generate(qr, { small: true });
    });

    client.on('loading_screen', (percent, message) => {
        console.log(`⏳ WhatsApp carregando: ${percent}% - ${message}`);
        if (Number(percent) >= 100 && isAuthenticated && isInitializing) {
            armReadyRescue();
        }
    });

    client.on('change_state', state => {
        console.log(`🔁 Estado do WhatsApp alterado: ${state}`);
    });

    client.on('authenticated', () => {
        if (!isAuthenticated) {
            console.log('🔓 Autenticado com sucesso! Carregando chats...');
            isAuthenticated = true;
            isInitializing = true;
            livenessMonitor?.markAuthenticated();
            armReadyWatchdog('autenticação');
            armReadyRescue();
        }
    });

    client.on('ready', () => {
        clearReadyWatchdog();
        clearReadyRescue();
        isInitializing = false;
        livenessMonitor?.markReady();
        console.log('🚀 Conexão estabelecida! WhatsApp pronto.');
    });

    client.on('auth_failure', msg => {
        clearReadyWatchdog();
        clearReadyRescue();
        livenessMonitor?.markStopped('auth_failure');
        logger.error(`[whatsapp] auth_failure ${logger.safeError(msg)}`);
        isAuthenticated = false;
        isInitializing = false;
        exitForSupervisor('auth_failure');
    });

    client.on('disconnected', async (reason) => {
        clearReadyWatchdog();
        clearReadyRescue();
        livenessMonitor?.markStopped('client_disconnected');
        logger.info('[whatsapp] client_disconnected');
        isAuthenticated = false;
        isInitializing = false;

        if (reason === 'LOGOUT') {
            logger.error('[whatsapp] session_logout');
            try {
                await client.destroy();
            } catch (e) {}
            process.exit(0);
        } else {
            exitForSupervisor('client_disconnected');
        }
    });

    // Inicia o processo de conexão
    client.initialize().catch(err => {
        clearReadyWatchdog();
        clearReadyRescue();
        livenessMonitor?.markStopped('initialization_failed');
        logger.error(`[whatsapp] initialization_failed ${logger.safeError(err)}`);
        isInitializing = false;
        exitForSupervisor('initialization_failed');
    });

    clientInstance = client;
    return client;
}

function getWhatsAppClient() {
    return clientInstance;
}

function getWhatsAppHealth() {
    return livenessMonitor?.getSnapshot() || Object.freeze({
        status: 'starting',
        liveness: 'pending',
        consecutiveFailures: 0,
        recoveryRequested: false,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastReason: null
    });
}

function runWhatsAppLivenessProbe() {
    if (!livenessMonitor) {
        return Promise.resolve({
            skipped: true,
            reason: 'monitor_unavailable'
        });
    }
    return livenessMonitor.runProbe();
}

async function sendWhatsAppMessage(to, message) {
    const safeTo = String(to || '').trim();
    if (!safeTo) throw new Error('Destino WhatsApp ausente.');
    if (!clientInstance || typeof clientInstance.sendMessage !== 'function') {
        throw new Error('Cliente WhatsApp indisponível.');
    }
    try {
        return await clientInstance.sendMessage(safeTo, message);
    } catch (error) {
        livenessMonitor?.recordTransportFailure(error);
        throw error;
    }
}

module.exports = {
    initializeWhatsAppClient,
    getWhatsAppClient,
    getWhatsAppHealth,
    runWhatsAppLivenessProbe,
    sendWhatsAppMessage
};
