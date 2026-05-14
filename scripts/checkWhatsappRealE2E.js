require('dotenv').config();

const { loadWhatsAppE2EConfig } = require('../src/testing/whatsappE2EConfig');
const { launchWhatsAppWebDriver } = require('../src/testing/whatsappWebDriver');

async function main() {
    const config = loadWhatsAppE2EConfig(process.env);
    const driver = await launchWhatsAppWebDriver(config, { headless: false });

    try {
        await driver.gotoHome();
        const loginSelector = await driver.assertLoggedIn();
        console.log(`Login confirmado por seletor: ${loginSelector}`);
        const url = await driver.openChat(config.botPhone);
        console.log('WhatsApp E2E check OK.');
        console.log(`Chat do bot aberto sem envio de mensagem: ${url}`);
    } finally {
        await driver.close();
    }
}

main().catch(error => {
    console.error(`Erro no check WhatsApp E2E: ${error.message}`);
    process.exit(1);
});
