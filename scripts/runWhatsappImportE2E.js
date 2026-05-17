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
    const complex = ['1', 'true', 'sim', 's', 'yes'].includes(
        String(process.env.IMPORT_E2E_COMPLEX || '').trim().toLowerCase()
    );
    const rows = complex
        ? Array.from({ length: 27 }, (_, index) => {
            const rowNumber = index + 1;
            if (rowNumber === 7) {
                return `17/05/2026;Transferência mesma titularidade reserva ${suffix};-1000,00;Débito`;
            }
            const value = rowNumber % 5 === 0
                ? `${(100 + rowNumber).toFixed(2).replace('.', ',')}`
                : `-${(rowNumber + 0.37).toFixed(2).replace('.', ',')}`;
            const type = value.startsWith('-') ? 'Débito' : 'Crédito';
            return `17/05/2026;Import complexo item ${rowNumber} ${suffix};${value};${type}`;
        })
        : [
            `17/05/2026;Import teste mercado ${suffix};-7,77;Débito`,
            `17/05/2026;Import teste reembolso ${suffix};9,99;Crédito`
        ];
    const csv = [
        'Data;Descrição;Valor;Tipo',
        ...rows
    ].join('\n');
    fs.writeFileSync(filePath, csv, 'utf8');
    return { filePath, suffix, expectedCount: rows.length, complex };
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

    const fileInputs = page.locator('input[type="file"]');
    const fileInputCount = await fileInputs.count();
    const accepts = [];
    let selectedIndex = Math.max(0, fileInputCount - 1);
    for (let index = 0; index < fileInputCount; index += 1) {
        const accept = await fileInputs.nth(index).getAttribute('accept').catch(() => '') || '';
        accepts.push(accept);
        const normalizedAccept = accept.toLowerCase();
        if (
            !normalizedAccept ||
            normalizedAccept.includes('*') ||
            normalizedAccept.includes('text') ||
            normalizedAccept.includes('csv') ||
            normalizedAccept.includes('application')
        ) {
            selectedIndex = index;
            break;
        }
    }
    if (fileInputCount === 0) {
        throw new Error('Nenhum input de arquivo apareceu após clicar em anexar.');
    }

    const fileInput = fileInputs.nth(selectedIndex);
    await fileInput.setInputFiles(filePath);

    const sendSelectors = [
        '[aria-label="Enviar"]',
        '[aria-label="Send"]',
        'span[data-icon="send"]'
    ];
    for (const selector of sendSelectors) {
        const candidate = page.locator(selector).last();
        if (await candidate.isVisible({ timeout: 30000 }).catch(() => false)) {
            await candidate.click();
            return;
        }
    }
    throw new Error(`Botão de envio do anexo não apareceu. Inputs accept vistos: ${JSON.stringify(accepts)}`);
}

async function main() {
    const config = loadWhatsAppE2EConfig(process.env);
    const { filePath, suffix, expectedCount, complex } = buildImportFixture();
    const shouldConfirm = ['1', 'true', 'sim', 's', 'yes'].includes(
        String(process.env.IMPORT_E2E_CONFIRM || '').trim().toLowerCase()
    );
    const driver = await launchWhatsAppWebDriver(config);

    try {
        console.log(`[import-e2e] fixture=${filePath} suffix=${suffix} count=${expectedCount} complex=${complex} confirm=${shouldConfirm}`);
        await driver.gotoHome();
        await driver.assertLoggedIn();
        await driver.openChat(config.botPhone);
        const expectedPreviewText = `Encontrei ${expectedCount} lançamento`;
        const previousPreviewCount = await driver.countTextOccurrences(expectedPreviewText);
        const previousPromptCount = await driver.countTextOccurrences('Responda sim');
        await uploadFile(driver, filePath);
        await driver.waitForIncomingMessage({
            contains: expectedPreviewText,
            previousCount: previousPreviewCount,
            timeoutMs: config.timeoutMs
        });
        await driver.waitForIncomingMessage({
            contains: 'Responda sim',
            previousCount: previousPromptCount,
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
