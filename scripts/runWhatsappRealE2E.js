require('dotenv').config();

const { spawn } = require('node:child_process');
const { loadWhatsAppE2EConfig } = require('../src/testing/whatsappE2EConfig');

async function resetSpreadsheetIfRequested(config) {
    if (!config.resetSpreadsheet) return;

    console.log('WhatsApp E2E: WHATSAPP_E2E_RESET_SPREADSHEET=true, limpando planilha antes do teste...');
    const { resetSpreadsheetData } = require('./resetSpreadsheetData');
    await resetSpreadsheetData();
}

async function main() {
    let config;

    try {
        config = loadWhatsAppE2EConfig(process.env);
    } catch (error) {
        console.error(`WhatsApp E2E nao iniciado: ${error.message}`);
        process.exit(1);
    }

    await resetSpreadsheetIfRequested(config);

    const child = spawn(process.execPath, ['--test', 'tests/whatsapp-real-e2e.test.js'], {
        stdio: 'inherit',
        env: process.env
    });

    child.on('exit', code => {
        process.exit(code || 0);
    });
}

try {
    main().catch(error => {
        console.error(`WhatsApp E2E falhou antes dos testes: ${error.message}`);
        process.exit(1);
    });
} catch (error) {
    console.error(`WhatsApp E2E nao iniciado: ${error.message}`);
    process.exit(1);
}
