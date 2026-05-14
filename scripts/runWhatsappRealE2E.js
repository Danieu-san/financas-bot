require('dotenv').config();

const { spawn } = require('node:child_process');
const { loadWhatsAppE2EConfig } = require('../src/testing/whatsappE2EConfig');

try {
    loadWhatsAppE2EConfig(process.env);
} catch (error) {
    console.error(`WhatsApp E2E nao iniciado: ${error.message}`);
    process.exit(1);
}

const child = spawn(process.execPath, ['--test', 'tests/whatsapp-real-e2e.test.js'], {
    stdio: 'inherit',
    env: process.env
});

child.on('exit', code => {
    process.exit(code || 0);
});
