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

function buildConfirmationExpectations(expectedCount) {
    const count = Number(expectedCount) || 0;
    return [
        `Importação concluída. ${count} lançamento`,
        `Importacao concluida. ${count} lancamento`
    ];
}

async function waitForAnyNewText(driver, expectedAny, previousCounts) {
    return driver.waitForAnyIncomingMessage({
        containsAny: expectedAny,
        previousCounts,
        timeoutMs: driver.config.timeoutMs
    });
}

async function progressImportToPreview(driver, previewMarker, previousCounts) {
    const expectedSteps = [
        previewMarker,
        'é de quem?',
        'Esse extrato é de qual tipo?',
        'Não encontrei data em'
    ];
    let found = await waitForAnyNewText(driver, expectedSteps, previousCounts);

    for (let guard = 0; found !== previewMarker && guard < 4; guard += 1) {
        if (found === 'é de quem?') {
            found = await sendAndWaitForAnyReply(driver, '1', [
                previewMarker,
                'Esse extrato é de qual tipo?',
                'Não encontrei data em'
            ]);
            continue;
        }
        if (found === 'Não encontrei data em') {
            found = await sendAndWaitForAnyReply(driver, '17/05/2026', [
                previewMarker,
                'Esse extrato é de qual tipo?'
            ]);
            continue;
        }
        if (found === 'Esse extrato é de qual tipo?') {
            found = await sendAndWaitForAnyReply(driver, '1', [previewMarker]);
            continue;
        }
        break;
    }

    if (found !== previewMarker) {
        throw new Error(`Fluxo de importação não chegou à prévia. Última etapa observada: ${found || 'nenhuma'}`);
    }
}

async function cleanupImportedFixture(driver, suffix) {
    for (const type of ['gasto', 'entrada']) {
        const found = await sendAndWaitForAnyReply(driver, `apagar ${type} ${suffix}`, [
            'Encontrei',
            'Não encontrei nenhum item'
        ]);
        if (found === 'Não encontrei nenhum item') {
            throw new Error(`Limpeza seletiva não encontrou o ${type} marcado com ${suffix}.`);
        }
        await sendAndWaitForAnyReply(driver, 'sim', [
            'Item(ns) apagado(s) com sucesso',
            'Ocorreu um erro ao apagar'
        ]);
    }
}

async function prepareImportPreview(driver, filePath, previewMarker, expectedPreviewText) {
    const expectedSteps = [
        previewMarker,
        'é de quem?',
        'Esse extrato é de qual tipo?',
        'Não encontrei data em'
    ];
    const previousCounts = {};
    for (const expected of expectedSteps) {
        previousCounts[expected] = await driver.countTextOccurrences(expected);
    }
    const previousPromptCount = await driver.countTextOccurrences('Responda sim');

    await uploadFile(driver, filePath);
    await progressImportToPreview(driver, previewMarker, previousCounts);
    const visibleText = await driver.getVisibleText();
    if (!visibleText.includes(expectedPreviewText)) {
        throw new Error(`A prévia nova não informou a contagem esperada: ${expectedPreviewText}.`);
    }
    await driver.waitForIncomingMessage({
        contains: 'Responda sim',
        previousCount: previousPromptCount,
        timeoutMs: driver.config.timeoutMs
    });
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

    const documentOptionFactories = [
        () => page.locator('button[role="menuitem"][aria-label="Documento"]').last(),
        () => page.locator('button[role="menuitem"][aria-label="Document"]').last(),
        () => page.locator('[role="menuitem"][aria-label="Documento"]').last(),
        () => page.locator('[role="menuitem"][aria-label="Document"]').last(),
        () => page.getByText('Documento', { exact: true }).last(),
        () => page.getByText('Document', { exact: true }).last(),
        () => page.locator('[aria-label="Documento"]').last(),
        () => page.locator('[aria-label="Document"]').last()
    ];
    for (const buildCandidate of documentOptionFactories) {
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const candidate = buildCandidate();
            if (!(await candidate.isVisible({ timeout: 1500 }).catch(() => false))) break;

            const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 10000 }).catch(() => null);
            const clicked = await candidate.click({ force: true, timeout: 5000 })
                .then(() => true)
                .catch(() => false);
            if (!clicked) continue;

            const fileChooser = await fileChooserPromise;
            if (fileChooser) {
                await fileChooser.setFiles(filePath);
                return clickAttachmentSendButton(page);
            }
            break;
        }
    }

    const fileInputs = page.locator('input[type="file"]');
    const fileInputCount = await fileInputs.count();
    const accepts = [];
    for (let index = 0; index < fileInputCount; index += 1) {
        const accept = await fileInputs.nth(index).getAttribute('accept').catch(() => '') || '';
        accepts.push(accept);
    }
    const selectedIndex = findDocumentInputIndex(accepts);
    if (fileInputCount === 0) {
        throw new Error('Nenhum input de arquivo apareceu após clicar em anexar.');
    }
    if (selectedIndex < 0) {
        throw new Error(`Nenhum input de documento apareceu após clicar em anexar. Inputs accept vistos: ${JSON.stringify(accepts)}`);
    }

    const fileInput = fileInputs.nth(selectedIndex);
    await fileInput.setInputFiles(filePath);
    await clickAttachmentSendButton(page);
}

async function clickAttachmentSendButton(page) {
    const sendSelectors = [
        '[aria-label="Enviar"]',
        '[aria-label="Send"]',
        '[aria-label^="Enviar "]',
        '[aria-label^="Send "]',
        'span[data-icon="send"]',
        'span[data-icon="wds-ic-send-filled"]'
    ];
    for (const selector of sendSelectors) {
        const candidate = page.locator(selector).last();
        const visible = await candidate.waitFor({ state: 'visible', timeout: 10000 })
            .then(() => true)
            .catch(() => false);
        if (!visible) continue;
        await candidate.click({ force: true });
        const previewClosed = await candidate.waitFor({ state: 'hidden', timeout: 30000 })
            .then(() => true)
            .catch(() => false);
        if (!previewClosed) {
            throw new Error('A prévia do anexo permaneceu aberta após clicar em enviar.');
        }
        return;
    }
    throw new Error('Botão de envio do anexo não apareceu.');
}

function findDocumentInputIndex(accepts = []) {
    return accepts.findIndex(accept => {
        const normalized = String(accept || '').toLowerCase();
        if (!normalized) return true;
        if (normalized.includes('image/') && !normalized.includes('application')) return false;
        return (
            normalized.includes('*') ||
            normalized.includes('text') ||
            normalized.includes('csv') ||
            normalized.includes('application')
        );
    });
}

async function main() {
    const config = loadWhatsAppE2EConfig(process.env);
    const { filePath, suffix, expectedCount, complex } = buildImportFixture();
    const shouldConfirm = ['1', 'true', 'sim', 's', 'yes'].includes(
        String(process.env.IMPORT_E2E_CONFIRM || '').trim().toLowerCase()
    );
    const shouldCheckDuplicate = ['1', 'true', 'sim', 's', 'yes'].includes(
        String(process.env.IMPORT_E2E_DUPLICATE_CHECK || '').trim().toLowerCase()
    );
    const driver = await launchWhatsAppWebDriver(config);

    try {
        console.log(`[import-e2e] fixture=${filePath} suffix=${suffix} count=${expectedCount} complex=${complex} confirm=${shouldConfirm} duplicate=${shouldCheckDuplicate}`);
        await driver.gotoHome();
        await driver.assertLoggedIn();
        await driver.openChat(config.botPhone);
        const expectedPreviewText = `Encontrei ${expectedCount} lançamento`;
        await prepareImportPreview(driver, filePath, suffix, expectedPreviewText);

        if (shouldConfirm) {
            await sendAndWaitForAnyReply(driver, 'sim', buildConfirmationExpectations(expectedCount));
            if (shouldCheckDuplicate) {
                await prepareImportPreview(driver, filePath, suffix, expectedPreviewText);
                await sendAndWaitForAnyReply(driver, 'sim', buildConfirmationExpectations(0));
            }
            await cleanupImportedFixture(driver, suffix);
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

if (require.main === module) {
    main().catch(error => {
        console.error(`[import-e2e] falhou: ${error.stack || error.message}`);
        process.exit(1);
    });
}

module.exports = {
    buildConfirmationExpectations,
    buildImportFixture,
    cleanupImportedFixture,
    findDocumentInputIndex,
    prepareImportPreview,
    progressImportToPreview,
    uploadFile
};
