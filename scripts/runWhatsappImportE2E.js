require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { loadWhatsAppE2EConfig } = require('../src/testing/whatsappE2EConfig');
const { launchWhatsAppWebDriver } = require('../src/testing/whatsappWebDriver');
const { sendAndWaitForAnyReply } = require('../src/testing/e2eAssertions');

function buildImportFixture() {
    const filePath = path.join(os.tmpdir(), `financasbot-import-${Date.now()}.csv`);
    const suffix = process.env.IMPORT_E2E_SUFFIX || new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 12);
    const csv = [
        'Data;Descrição;Valor;Tipo',
        `17/05/2026;Import teste mercado ${suffix};-7,77;Débito`,
        `17/05/2026;Import teste reembolso ${suffix};9,99;Crédito`
    ].join('\n');
    fs.writeFileSync(filePath, csv, 'utf8');
    return { filePath, suffix };
}

async function uploadFile(driver, filePath) {
    const page = driver.page;
    const attachSelectors = [
        '[aria-label="Anexar"]',
        '[aria-label="Attach"]',
        'span[data-icon="plus"]',
        'span[data-icon="clip"]'
    ];

    for (const selector of attachSelectors) {
        const candidate = page.locator(selector).first();
        if (await candidate.isVisible().catch(() => false)) {
            await candidate.click();
            break;
        }
    }

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePath);

    const sendSelectors = [
        '[aria-label="Enviar"]',
        '[aria-label="Send"]',
        'span[data-icon="send"]'
    ];
    for (const selector of sendSelectors) {
        const candidate = page.locator(selector).first();
        if (await candidate.isVisible({ timeout: 10000 }).catch(() => false)) {
            await candidate.click();
            return;
        }
    }
    await page.keyboard.press('Enter');
}

async function main() {
    const config = loadWhatsAppE2EConfig(process.env);
    const { filePath, suffix } = buildImportFixture();
    const shouldConfirm = ['1', 'true', 'sim', 's', 'yes'].includes(
        String(process.env.IMPORT_E2E_CONFIRM || '').trim().toLowerCase()
    );
    const driver = await launchWhatsAppWebDriver(config);

    try {
        console.log(`[import-e2e] fixture=${filePath} suffix=${suffix} confirm=${shouldConfirm}`);
        await driver.gotoHome();
        await driver.assertLoggedIn();
        await driver.openChat(config.botPhone);
        const previousPreviewCount = await driver.countTextOccurrences('Encontrei 2 lançamento');
        await uploadFile(driver, filePath);
        await driver.waitForIncomingMessage({
            contains: 'Encontrei 2 lançamento',
            previousCount: previousPreviewCount,
            timeoutMs: config.timeoutMs
        });

        if (shouldConfirm) {
            await sendAndWaitForAnyReply(driver, 'sim', [
                'Importação concluída. 2 lançamento',
                'Importacao concluida. 2 lancamento'
            ]);
        } else {
            await sendAndWaitForAnyReply(driver, 'não', [
                'Importação cancelada',
                'Importacao cancelada'
            ]);
        }
    } finally {
        await driver.close();
        fs.rmSync(filePath, { force: true });
    }
}

main().catch(error => {
    console.error(`[import-e2e] falhou: ${error.stack || error.message}`);
    process.exit(1);
});
