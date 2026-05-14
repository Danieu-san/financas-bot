const test = require('node:test');

require('dotenv').config();

const { loadWhatsAppE2EConfig } = require('../src/testing/whatsappE2EConfig');
const { launchWhatsAppWebDriver } = require('../src/testing/whatsappWebDriver');
const { sendAndWaitForReply } = require('../src/testing/e2eAssertions');

const config = loadWhatsAppE2EConfig(process.env);

test('whatsapp real e2e: termos and dashboard smoke', async () => {
    const driver = await launchWhatsAppWebDriver(config);

    try {
        await driver.gotoHome();
        await driver.assertLoggedIn();
        await driver.openChat(config.botPhone);

        await sendAndWaitForReply(driver, 'TERMOS', 'Resumo legal:');
        await sendAndWaitForReply(driver, 'dashboard', '/dashboard?token=');
    } finally {
        await driver.close();
    }
});
