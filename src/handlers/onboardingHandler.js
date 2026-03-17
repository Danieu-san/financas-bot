const userStateManager = require('../state/userStateManager');
const { parseAmountLocal, normalizeText } = require('../utils/helpers');
const {
    getUserProfileByUserId,
    upsertUserProfile,
    updateUserDisplayName
} = require('../services/userService');

const ONBOARDING_ACTION = 'onboarding_flow';
const ONBOARDING_TTL_SECONDS = 60 * 60 * 12; // 12h

function onboardingMenu() {
    return (
        'Tudo pronto! Aqui vão 3 comandos úteis para começar:\n' +
        '1) `gastei 50 no mercado`\n' +
        '2) `recebi 2000 de salário`\n' +
        '3) `qual meu saldo do mês?`\n\n' +
        'Configurações rápidas:\n' +
        '- `ativar checkin semanal`\n' +
        '- `definir reserva 10%`'
    );
}

function isYesNo(text) {
    const v = normalizeText(text || '');
    if (['sim', 's', 'ss', 'yes', 'y'].includes(v)) return 'SIM';
    if (['nao', 'não', 'n', 'no'].includes(v)) return 'NÃO';
    return null;
}

function getQuestion(step) {
    switch (step) {
        case 1:
            return 'Antes de começarmos, como você prefere ser chamado?';
        case 2:
            return 'Qual sua renda mensal aproximada? (ex: 2000, R$ 2 mil, dois mil)';
        case 3:
            return 'Qual seu gasto fixo mensal aproximado?';
        case 4:
            return 'Você tem dívidas ativas hoje? (sim/não)';
        case 5:
            return 'Qual seu objetivo principal agora? (ex: quitar dívidas, montar reserva)';
        default:
            return null;
    }
}

async function startOnboarding(senderId, msg) {
    userStateManager.setState(
        senderId,
        {
            action: ONBOARDING_ACTION,
            step: 1,
            data: {}
        },
        ONBOARDING_TTL_SECONDS
    );
    await msg.reply(getQuestion(1));
}

async function completeOnboarding(senderId, userId, data, msg) {
    await upsertUserProfile(userId, {
        monthly_income: data.monthly_income ?? '',
        fixed_expense_estimate: data.fixed_expense_estimate ?? '',
        has_debt: data.has_debt ?? '',
        primary_goal: data.primary_goal ?? '',
        onboarding_completed_at: new Date().toISOString()
    });

    if (data.display_name) {
        await updateUserDisplayName(userId, data.display_name);
    }

    userStateManager.deleteState(senderId);
    await msg.reply('Onboarding concluído com sucesso.');
    await msg.reply(onboardingMenu());
}

async function advanceOnboarding(senderId, state, msg, user) {
    const answer = String(msg.body || '').trim();
    const data = { ...(state.data || {}) };
    const step = state.step || 1;

    if (step === 1) {
        if (!answer) {
            await msg.reply('Me diga um nome curto para te chamar.');
            return;
        }
        data.display_name = answer;
    }

    if (step === 2) {
        const income = parseAmountLocal(answer);
        if (income === null || income < 0) {
            await msg.reply('Não consegui entender a renda. Ex: 2000, R$ 2 mil, dois mil.');
            return;
        }
        data.monthly_income = income;
    }

    if (step === 3) {
        const fixed = parseAmountLocal(answer);
        if (fixed === null || fixed < 0) {
            await msg.reply('Não consegui entender o gasto fixo. Ex: 1500 ou R$ 1,5 mil.');
            return;
        }
        data.fixed_expense_estimate = fixed;
    }

    if (step === 4) {
        const yesNo = isYesNo(answer);
        if (!yesNo) {
            await msg.reply('Responda apenas com: sim ou não.');
            return;
        }
        data.has_debt = yesNo;
    }

    if (step === 5) {
        if (!answer) {
            await msg.reply('Me diga seu objetivo principal em uma frase curta.');
            return;
        }
        data.primary_goal = answer;
    }

    const nextStep = step + 1;
    if (nextStep > 5) {
        await completeOnboarding(senderId, user.user_id, data, msg);
        return;
    }

    userStateManager.setState(
        senderId,
        {
            action: ONBOARDING_ACTION,
            step: nextStep,
            data
        },
        ONBOARDING_TTL_SECONDS
    );
    await msg.reply(getQuestion(nextStep));
}

async function handleOnboarding(msg, user) {
    const senderId = msg.author || msg.from;
    const profile = await getUserProfileByUserId(user.user_id);

    if (profile?.onboarding_completed_at) {
        // Se existe estado pendente de onboarding mas já concluiu, limpa.
        const stale = userStateManager.getState(senderId);
        if (stale?.action === ONBOARDING_ACTION) {
            userStateManager.deleteState(senderId);
        }
        return { handled: false };
    }

    const state = userStateManager.getState(senderId);
    if (!state || state.action !== ONBOARDING_ACTION) {
        await startOnboarding(senderId, msg);
        return { handled: true };
    }

    await advanceOnboarding(senderId, state, msg, user);
    return { handled: true };
}

module.exports = {
    handleOnboarding
};
