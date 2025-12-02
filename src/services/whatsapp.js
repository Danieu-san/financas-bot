// src/services/whatsapp.js

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

function initializeWhatsAppClient() {
    console.log('Inicializando cliente WhatsApp...');
    const client = new Client({
        authStrategy: new LocalAuth(), // Armazena a sessão localmente
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        },
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2413.51.html',
        }
    });

    client.on('qr', qr => {
        console.log('QR Code recebido. Escaneie com seu celular:');
        qrcode.generate(qr, { small: true });
    });

    client.on('loading_screen', (percent, message) => {
        console.log('CARREGANDO TELA:', percent, message);
    });

    client.on('authenticated', () => {
        console.log('AUTENTICADO COM SUCESSO!');
    });

    client.on('ready', () => {
        console.log('✅ Cliente WhatsApp está pronto e conectado!');
    });

    client.on('auth_failure', msg => {
        console.error('❌ Falha na autenticação do WhatsApp:', msg);
    });

    client.on('disconnected', reason => {
        console.log('Cliente desconectado:', reason);
        console.log('Tentando reconectar...');
        client.initialize(); // Tenta reconectar
    });

    client.initialize();
    return client;
}

module.exports = { initializeWhatsAppClient };