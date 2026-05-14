const test = require('node:test');

require('dotenv').config();

const { loadWhatsAppE2EConfig } = require('../src/testing/whatsappE2EConfig');
const { launchWhatsAppWebDriver } = require('../src/testing/whatsappWebDriver');
const { sendAndWaitForAnyReply, sendAndWaitForReply } = require('../src/testing/e2eAssertions');

const config = loadWhatsAppE2EConfig(process.env);

async function ensureUserReady(driver) {
    await sendAndWaitForAnyReply(driver, 'TERMOS', [
        'Resumo legal:',
        'Para ativar seu acesso',
        'Termos atuais'
    ]);

    const aceitoResult = await sendAndWaitForAnyReply(driver, 'ACEITO', [
        'como você prefere ser chamado',
        'como voce prefere ser chamado',
        'Onboarding concluído',
        'Onboarding concluido',
        'Cadastro confirmado',
        'já está ativo',
        'ja esta ativo',
        'Não entendi',
        'Nao entendi'
    ]);

    if (aceitoResult.includes('como você prefere') || aceitoResult.includes('como voce prefere')) {
        await completeOnboarding(driver);
    }
}

async function completeOnboarding(driver) {
    await sendAndWaitForAnyReply(driver, 'Daniel E2E', ['renda mensal', 'renda']);
    await sendAndWaitForAnyReply(driver, '5000', ['gasto fixo', 'gastos fixos']);
    await sendAndWaitForAnyReply(driver, '2500', ['dívidas ativas', 'dividas ativas']);
    await sendAndWaitForAnyReply(driver, 'não', ['objetivo principal', 'objetivo']);
    await sendAndWaitForAnyReply(driver, 'montar reserva', ['Onboarding concluído', 'Onboarding concluido']);
}

async function registerExpense(driver) {
    const first = await sendAndWaitForAnyReply(driver, 'gastei 10 no teste E2E no pix', [
        'Você confirma',
        'Voce confirma',
        'Registro finalizado',
        'como esses itens foram pagos',
        'forma de pagamento'
    ]);

    if (first.includes('confirma')) {
        const second = await sendAndWaitForAnyReply(driver, 'sim', [
            'Registro finalizado',
            'como esses itens foram pagos',
            'forma de pagamento'
        ]);

        if (!second.includes('Registro finalizado')) {
            await sendAndWaitForReply(driver, 'pix', 'Registro finalizado');
        }
        return;
    }

    if (!first.includes('Registro finalizado')) {
        await sendAndWaitForReply(driver, 'pix', 'Registro finalizado');
    }
}

test('whatsapp real e2e: onboarding, transaction, analytics and dashboard smoke', async () => {
    const driver = await launchWhatsAppWebDriver(config);

    try {
        await driver.gotoHome();
        await driver.assertLoggedIn();
        await driver.openChat(config.botPhone);

        await ensureUserReady(driver);
        await registerExpense(driver);
        await sendAndWaitForAnyReply(driver, 'quanto gastei esse mês?', [
            'Total gasto',
            'Total gasto em',
            'R$'
        ]);
        await sendAndWaitForReply(driver, 'dashboard', '/dashboard?token=');
    } finally {
        await driver.close();
    }
});
