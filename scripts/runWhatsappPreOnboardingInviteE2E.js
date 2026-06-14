require('dotenv').config();

const { loadWhatsAppE2EConfig } = require('../src/testing/whatsappE2EConfig');
const { launchWhatsAppWebDriver } = require('../src/testing/whatsappWebDriver');
const { sendAndWaitForAnyReply } = require('../src/testing/e2eAssertions');

function normalizePhone(value) {
    return String(value || '').replace(/\D/g, '');
}

async function main() {
    const config = loadWhatsAppE2EConfig(process.env);
    const targetPhone = normalizePhone(process.env.INVITE_E2E_TARGET_PHONE);

    if (!targetPhone) {
        throw new Error('Defina INVITE_E2E_TARGET_PHONE com DDI + DDD + telefone.');
    }

    const driver = await launchWhatsAppWebDriver(config);

    try {
        await driver.gotoHome();
        await driver.assertLoggedIn();
        await driver.openChat(config.botPhone);
        await sendAndWaitForAnyReply(driver, `admin convidar ${targetPhone}`, [
            `Convite enviado para ${targetPhone}@c.us.`,
            `Convite enviado para ${targetPhone}@c.us`
        ]);
    } finally {
        await driver.close();
    }
}

main().catch(error => {
    console.error(`[pre-onboarding-e2e] falhou: ${error.stack || error.message}`);
    process.exit(1);
});
