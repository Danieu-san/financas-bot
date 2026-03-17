const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

let clientInstance = null;
let isAuthenticated = false;
let isInitializing = false;

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
    
    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: 'bot-financeiro'
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ],
            // Aumentar o timeout para evitar falhas em conexões lentas
            handleSIGINT: false,
            handleSIGTERM: false,
            handleSIGHUP: false
        }
    });

    client.on('qr', qr => {
        isAuthenticated = false;
        console.log('🔑 Novo QR Code gerado. Escaneie para conectar:');
        qrcode.generate(qr, { small: true });
    });

    client.on('authenticated', () => {
        if (!isAuthenticated) {
            console.log('🔓 Autenticado com sucesso! Carregando chats...');
            isAuthenticated = true;
        }
    });

    client.on('ready', () => {
        isInitializing = false;
        console.log('🚀 Conexão estabelecida! WhatsApp pronto.');
    });

    client.on('auth_failure', msg => {
        console.error('❌ Falha na autenticação:', msg);
        isAuthenticated = false;
        isInitializing = false;
    });

    client.on('disconnected', async (reason) => {
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
            console.log('Tentando reconectar em 10 segundos...');
            setTimeout(() => {
                if (!isInitializing) {
                    client.initialize().catch(err => console.error('Erro ao reinicializar:', err.message));
                }
            }, 10000);
        }
    });

    // Inicia o processo de conexão
    client.initialize().catch(err => {
        console.error('❌ Erro na inicialização:', err.message);
        isInitializing = false;
    });

    clientInstance = client;
    return client;
}

module.exports = { initializeWhatsAppClient };
