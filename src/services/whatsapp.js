const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

let clientInstance = null;
let isAuthenticated = false;
let isInitializing = false;

const CONFIGURED_WEB_VERSION = String(process.env.WWEB_VERSION || '').trim();
const WEB_VERSION_CACHE_TYPE = process.env.WWEB_CACHE_TYPE || 'none';
const DEFAULT_USER_AGENT = process.env.WWEB_USER_AGENT || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const READY_TIMEOUT_MS = Number(process.env.WWEB_READY_TIMEOUT_MS || 420000);
const AUTH_TIMEOUT_MS = Number(process.env.WWEB_AUTH_TIMEOUT_MS || 180000);
const PROTOCOL_TIMEOUT_MS = Number(process.env.PUPPETEER_PROTOCOL_TIMEOUT_MS || 180000);

function exitForSupervisor(reason, delayMs = 1500) {
    console.error(`❌ WhatsApp indisponível: ${reason}. Encerrando para o PM2 reiniciar.`);
    setTimeout(() => process.exit(1), delayMs);
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
    let readyWatchdog = null;

    function armReadyWatchdog(label) {
        clearReadyWatchdog();
        readyWatchdog = setTimeout(() => {
            if (isInitializing) {
                isInitializing = false;
                exitForSupervisor(`timeout aguardando ready após ${label} (${READY_TIMEOUT_MS}ms)`);
            }
        }, READY_TIMEOUT_MS);
    }

    function clearReadyWatchdog() {
        if (readyWatchdog) {
            clearTimeout(readyWatchdog);
            readyWatchdog = null;
        }
    }

    armReadyWatchdog('inicialização');

    client.on('qr', qr => {
        isAuthenticated = false;
        clearReadyWatchdog();
        console.log('⏸️ Aguardando leitura do QR Code. PM2 não será reiniciado enquanto a autenticação estiver pendente.');
        console.log('🔑 Novo QR Code gerado. Escaneie para conectar:');
        qrcode.generate(qr, { small: true });
    });

    client.on('loading_screen', (percent, message) => {
        console.log(`⏳ WhatsApp carregando: ${percent}% - ${message}`);
    });

    client.on('change_state', state => {
        console.log(`🔁 Estado do WhatsApp alterado: ${state}`);
    });

    client.on('authenticated', () => {
        if (!isAuthenticated) {
            console.log('🔓 Autenticado com sucesso! Carregando chats...');
            isAuthenticated = true;
            isInitializing = true;
            armReadyWatchdog('autenticação');
        }
    });

    client.on('ready', () => {
        clearReadyWatchdog();
        isInitializing = false;
        console.log('🚀 Conexão estabelecida! WhatsApp pronto.');
    });

    client.on('auth_failure', msg => {
        clearReadyWatchdog();
        console.error('❌ Falha na autenticação:', msg);
        isAuthenticated = false;
        isInitializing = false;
        exitForSupervisor('falha de autenticação');
    });

    client.on('disconnected', async (reason) => {
        clearReadyWatchdog();
        console.log('⚠️ Cliente desconectado:', reason);
        isAuthenticated = false;
        isInitializing = false;
        
        if (reason === 'LOGOUT') {
            console.error('🚪 Sessão encerrada (LOGOUT).');
            try {
                await client.destroy();
            } catch (e) {}
            process.exit(0);
        } else {
            exitForSupervisor(`cliente desconectado (${reason})`);
        }
    });

    // Inicia o processo de conexão
    client.initialize().catch(err => {
        clearReadyWatchdog();
        console.error('❌ Erro na inicialização:', err.message);
        isInitializing = false;
        exitForSupervisor(err.message);
    });

    clientInstance = client;
    return client;
}

function getWhatsAppClient() {
    return clientInstance;
}

async function sendWhatsAppMessage(to, message) {
    const safeTo = String(to || '').trim();
    if (!safeTo) throw new Error('Destino WhatsApp ausente.');
    if (!clientInstance || typeof clientInstance.sendMessage !== 'function') {
        throw new Error('Cliente WhatsApp indisponível.');
    }
    return clientInstance.sendMessage(safeTo, message);
}

module.exports = { initializeWhatsAppClient, getWhatsAppClient, sendWhatsAppMessage };
