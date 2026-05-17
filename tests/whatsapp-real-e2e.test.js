const test = require('node:test');

require('dotenv').config();

const { loadWhatsAppE2EConfig } = require('../src/testing/whatsappE2EConfig');
const { launchWhatsAppWebDriver } = require('../src/testing/whatsappWebDriver');
const { sendAndWaitForAnyReply, sendAndWaitForReply } = require('../src/testing/e2eAssertions');
const userService = require('../src/services/userService');

const config = loadWhatsAppE2EConfig(process.env);

async function ensureUserReady(driver) {
    const termsResult = await sendAndWaitForAnyReply(driver, 'TERMOS', [
        'Para ativar seu acesso',
        'Resumo legal:',
        'Termos atuais'
    ]);

    if (!requiresConsentReply(termsResult)) {
        return;
    }

    const aceitoResult = await sendAndWaitForAnyReply(driver, 'ACEITO', [
        'aguardando aprovação',
        'aguardando aprovacao',
        'como você prefere ser chamado',
        'como voce prefere ser chamado',
        'renda mensal',
        'gasto fixo',
        'dívidas ativas',
        'dividas ativas',
        'objetivo principal',
        'Onboarding concluído',
        'Onboarding concluido',
        'Cadastro confirmado',
        'já está ativo',
        'ja esta ativo',
        'Não entendi',
        'Nao entendi'
    ]);

    if (await activateLatestPendingUserForE2EIfNeeded(aceitoResult)) {
        const onboardingStart = await sendAndWaitForAnyReply(driver, 'Oi', [
            'como você prefere ser chamado',
            'como voce prefere ser chamado',
            'renda mensal',
            'Onboarding concluído',
            'Onboarding concluido'
        ]);
        await completeOnboardingIfNeeded(driver, onboardingStart);
        return;
    }

    await completeOnboardingIfNeeded(driver, aceitoResult);
}

async function activateLatestPendingUserForE2EIfNeeded(text) {
    const normalized = String(text || '').toLowerCase();
    if (!normalized.includes('aguardando aprova')) {
        return false;
    }

    const bridgeEnabled = ['true', '1', 'sim', 's'].includes(
        String(process.env.WHATSAPP_E2E_APPROVAL_BRIDGE || '').trim().toLowerCase()
    );
    if (!bridgeEnabled) {
        throw new Error(
            'Usuário aguardando aprovação. Aprove pelo admin ou rode com WHATSAPP_E2E_APPROVAL_BRIDGE=true para ativação controlada de teste.'
        );
    }

    const users = await userService.getAllUsers();
    const pending = users
        .filter(user => user.status === userService.USER_STATUS.PENDING_APPROVAL)
        .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));

    if (!pending.length) {
        throw new Error('E2E recebeu aguardando aprovação, mas não encontrou usuário PENDING_APPROVAL.');
    }

    const user = pending[0];
    await userService.updateUserStatus(user.user_id, userService.USER_STATUS.ACTIVE);
    console.log(`[whatsapp-e2e] usuário pendente ativado via bridge de teste: ${user.whatsapp_id}`);
    return true;
}

function requiresConsentReply(text) {
    const normalized = String(text || '').toLowerCase();
    return (
        normalized.includes('para ativar seu acesso') ||
        normalized.includes('antes de usar o bot') ||
        normalized.includes('atualizamos os termos')
    );
}

function detectOnboardingStep(text) {
    const normalized = String(text || '').toLowerCase();
    const completedAt = Math.max(
        normalized.lastIndexOf('onboarding concluído'),
        normalized.lastIndexOf('onboarding concluido')
    );
    const candidates = [
        { step: 'name', patterns: ['como você prefere', 'como voce prefere'] },
        { step: 'income', patterns: ['renda mensal'] },
        { step: 'fixed_expense', patterns: ['gasto fixo', 'gastos fixos'] },
        { step: 'debt', patterns: ['dívidas ativas', 'dividas ativas'] },
        { step: 'goal', patterns: ['objetivo principal'] }
    ];

    let latest = { step: null, index: -1 };
    for (const candidate of candidates) {
        for (const pattern of candidate.patterns) {
            const index = normalized.lastIndexOf(pattern);
            if (index > latest.index) {
                latest = { step: candidate.step, index };
            }
        }
    }

    if (completedAt > latest.index) {
        return null;
    }

    return latest.step;
}

async function currentOnboardingStep(driver, fallbackText = '') {
    const visibleText = await driver.getVisibleText();
    return detectOnboardingStep(`${fallbackText}\n${visibleText}`);
}

async function completeOnboardingIfNeeded(driver, fallbackText = '') {
    let step = await currentOnboardingStep(driver, fallbackText);

    for (let guard = 0; step && guard < 5; guard += 1) {
        if (step === 'name') {
            await sendAndWaitForAnyReply(driver, 'Daniel E2E', ['renda mensal', 'renda']);
        } else if (step === 'income') {
            await sendAndWaitForAnyReply(driver, '5000', ['gasto fixo', 'gastos fixos']);
        } else if (step === 'fixed_expense') {
            await sendAndWaitForAnyReply(driver, '2500', ['dívidas ativas', 'dividas ativas']);
        } else if (step === 'debt') {
            await sendAndWaitForAnyReply(driver, 'não', ['objetivo principal', 'objetivo']);
        } else if (step === 'goal') {
            await sendAndWaitForAnyReply(driver, 'montar reserva', ['Onboarding concluído', 'Onboarding concluido']);
            return;
        }

        step = await currentOnboardingStep(driver);
    }
}

async function ensureOnboardingReady(driver) {
    await completeOnboardingIfNeeded(driver);

    const result = await sendAndWaitForAnyReply(driver, 'Oi', [
        'Oi,',
        'como você prefere ser chamado',
        'como voce prefere ser chamado',
        'renda mensal',
        'gasto fixo',
        'dívidas ativas',
        'dividas ativas',
        'objetivo principal',
        'Onboarding concluído',
        'Onboarding concluido'
    ]);

    await completeOnboardingIfNeeded(driver, result);
}

async function registerExpense(driver) {
    const first = await sendAndWaitForAnyReply(driver, 'gastei 10 no teste E2E no pix', [
        'Você confirma',
        'Voce confirma',
        'Registro finalizado',
        'registrado como',
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

    if (!first.includes('Registro finalizado') && !first.includes('registrado como')) {
        await sendAndWaitForReply(driver, 'pix', 'Registro finalizado');
    }
}

test('whatsapp real e2e: onboarding, transaction, analytics and dashboard smoke', async () => {
    const driver = await launchWhatsAppWebDriver(config);

    try {
        await driver.gotoHome();
        await driver.assertLoggedIn();
        await driver.openChat(config.botPhone);

        await completeOnboardingIfNeeded(driver);
        await ensureUserReady(driver);
        await ensureOnboardingReady(driver);
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
