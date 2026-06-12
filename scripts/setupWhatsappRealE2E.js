require('dotenv').config();

const fs = require('node:fs');
const { chromium } = require('playwright');
const { loadWhatsAppE2EConfig } = require('../src/testing/whatsappE2EConfig');
const { LOGGED_IN_SELECTORS } = require('../src/testing/whatsappWebDriver');

async function waitForEnter() {
    if (!process.stdin.isTTY) return;

    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    await new Promise(resolve => {
        console.log('\nPressione Enter para fechar o navegador quando terminar o login.');
        process.stdin.once('data', resolve);
    });
}

async function waitForLogin(page, timeoutMs) {
    return Promise.any(LOGGED_IN_SELECTORS.map(async selector => {
        await page.locator(selector).first().waitFor({ state: 'visible', timeout: timeoutMs });
        return selector;
    }));
}

async function main() {
    const config = loadWhatsAppE2EConfig(process.env);

    fs.mkdirSync(config.profilePath, { recursive: true });

    console.log('WhatsApp E2E setup');
    console.log(`- Remetente: ${config.testUserPhone} (${config.senderKind})`);
    console.log(`- Bot alvo: ${config.botPhone}`);
    console.log(`- Perfil local: ${config.profilePath}`);
    console.log('\nAbrindo WhatsApp Web. Se aparecer QR Code, escaneie com o numero remetente de teste.');

    const context = await chromium.launchPersistentContext(config.profilePath, {
        headless: false,
        viewport: { width: 1366, height: 900 },
        args: ['--start-maximized']
    });

    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded', timeout: config.timeoutMs });

    if (process.stdin.isTTY) {
        await waitForEnter();
    } else {
        console.log(`Aguardando login por ate ${config.timeoutMs}ms...`);
        const selector = await waitForLogin(page, config.timeoutMs);
        console.log(`Login confirmado por seletor: ${selector}`);
    }
    await context.close();
}

main().catch(error => {
    console.error(`Erro no setup WhatsApp E2E: ${error.message}`);
    process.exit(1);
});
