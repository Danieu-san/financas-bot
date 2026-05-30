const userStateManager = require('../state/userStateManager');
const { parseAmountLocal, normalizeText } = require('../utils/helpers');
const {
    getUserProfileByUserId,
    upsertUserProfile,
    updateUserDisplayName
} = require('../services/userService');
const { sendPlainMessage } = require('../utils/whatsappMessaging');

const ONBOARDING_ACTION = 'onboarding_flow';
const ONBOARDING_TTL_SECONDS = 60 * 60 * 12; // 12h
const POST_ONBOARDING_DEBT_OFFER_ACTION = 'post_onboarding_debt_offer';
const ONBOARDING_TOTAL_STEPS = 6;

function onboardingMenu({ hasDebt = false, primaryGoal = '' } = {}) {
    const goal = normalizeText(primaryGoal);
    const shouldSuggestDebt = hasDebt || goal.includes('quitar') || goal.includes('divida');
    const debtSuggestion = shouldSuggestDebt
        ? '\n\nComo você quer quitar dívidas, o próximo passo mais útil é cadastrar a primeira dívida.\nResponda `sim` para cadastrar agora ou `não` para deixar para depois.'
        : '';

    return [
        'Tudo pronto. Aqui vão 3 comandos úteis para começar:',
        '1) `gastei 50 no mercado`',
        '2) `recebi 2000 de salário`',
        '3) `qual meu saldo do mês?`',
        '',
        'Ajustes opcionais que você pode ativar quando quiser:',
        '- `ativar checkin semanal`: eu envio uma pergunta curta no domingo para ajudar você a revisar a semana.',
        '- `definir reserva 10%`: quando você registrar uma entrada, eu sugiro separar 10% para sua reserva.',
        '- `definir orçamento mensal 3000`: eu calculo um ritmo diário recomendado, aviso quando o dia aperta e mostro os gráficos diário e mensal no dashboard.',
        debtSuggestion
    ].filter(Boolean).join('\n');
}

function isYesNo(text) {
    const v = normalizeText(text || '');
    if (['sim', 's', 'ss', 'yes', 'y'].includes(v)) return 'SIM';
    if (['nao', 'não', 'n', 'no'].includes(v)) return 'NÃO';
    return null;
}

function looksLikeBotCommand(text) {
    const v = normalizeText(text || '');
    return /^(gastei|gasto|paguei|recebi|entrada|dashboard|painel|resumo|termos|admin|ajuda|liste|listar|mostre|mostrar|quanto|quantas|qual|saldo|criar|apagar|desativar|ativar|definir|me lembre)\b/.test(v) ||
        v.includes('?');
}

function isRestartCommand(text) {
    const v = normalizeText(text || '');
    return ['recomecar', 'recomeçar', 'reiniciar', 'resetar', 'comecar de novo', 'começar de novo'].includes(v);
}

function isBackCommand(text) {
    const v = normalizeText(text || '');
    return ['voltar', 'corrigir', 'anterior'].includes(v);
}

function isHelpCommand(text) {
    const v = normalizeText(text || '');
    return ['ajuda', 'help', 'duvida', 'dúvida'].includes(v);
}

function getQuestion(step) {
    const progress = `[${step}/${ONBOARDING_TOTAL_STEPS}] `;
    switch (step) {
        case 1:
            return `${progress}Qual é seu nome completo? Vou usar isso para reconhecer transferências entre contas da mesma titularidade em extratos.`;
        case 2:
            return `${progress}E como você prefere ser chamado no dia a dia?`;
        case 3:
            return `${progress}Qual sua renda mensal aproximada? (ex: 2000, R$ 2 mil, dois mil)`;
        case 4:
            return `${progress}Qual seu gasto fixo mensal aproximado?`;
        case 5:
            return `${progress}Você tem dívidas ativas hoje? (sim/não)`;
        case 6:
            return `${progress}Qual seu objetivo principal agora? (ex: quitar dívidas, montar reserva)`;
        default:
            return null;
    }
}

function buildOnboardingHelp(step) {
    const question = getQuestion(step) || getQuestion(1);
    return [
        'Você está no onboarding inicial.',
        `Pergunta atual: ${question}`,
        'Comandos úteis aqui:',
        '- `voltar` para corrigir a resposta anterior',
        '- `recomeçar` para começar do zero',
        '- `ajuda` para ver esta orientação'
    ].join('\n');
}

async function startOnboarding(senderId, msg) {
    const question = prepareOnboardingState(senderId);
    await sendPlainMessage(msg, question);
}

function prepareOnboardingState(senderId) {
    userStateManager.setState(
        senderId,
        {
            action: ONBOARDING_ACTION,
            step: 1,
            data: {}
        },
        ONBOARDING_TTL_SECONDS
    );
    return getQuestion(1);
}

async function completeOnboarding(senderId, userId, data, msg) {
    await upsertUserProfile(userId, {
        full_name: data.full_name ?? '',
        monthly_income: data.monthly_income ?? '',
        fixed_expense_estimate: data.fixed_expense_estimate ?? '',
        has_debt: data.has_debt ?? '',
        primary_goal: data.primary_goal ?? '',
        onboarding_completed_at: new Date().toISOString()
    });

    if (data.display_name) {
        await updateUserDisplayName(userId, data.display_name);
    }

    const hasDebt = data.has_debt === 'SIM';
    const primaryGoal = data.primary_goal || '';
    const goal = normalizeText(primaryGoal);
    const shouldOfferDebtCreation = hasDebt || goal.includes('quitar') || goal.includes('divida');

    if (shouldOfferDebtCreation) {
        userStateManager.setState(
            senderId,
            {
                action: POST_ONBOARDING_DEBT_OFFER_ACTION,
                data: { hasDebt, primaryGoal }
            },
            ONBOARDING_TTL_SECONDS
        );
    } else {
        userStateManager.deleteState(senderId);
    }

    await sendPlainMessage(msg, 'Onboarding concluído com sucesso.');
    await sendPlainMessage(msg, onboardingMenu({ hasDebt, primaryGoal }));
}

async function advanceOnboarding(senderId, state, msg, user) {
    const answer = String(msg.body || '').trim();
    const data = { ...(state.data || {}) };
    const step = state.step || 1;

    if (isRestartCommand(answer)) {
        userStateManager.setState(
            senderId,
            {
                action: ONBOARDING_ACTION,
                step: 1,
                data: {}
            },
            ONBOARDING_TTL_SECONDS
        );
        await sendPlainMessage(msg, 'Sem problema, vamos recomeçar o onboarding.');
        await sendPlainMessage(msg, getQuestion(1));
        return;
    }

    if (isBackCommand(answer)) {
        const previousStep = Math.max(1, step - 1);
        userStateManager.setState(
            senderId,
            {
                action: ONBOARDING_ACTION,
                step: previousStep,
                data
            },
            ONBOARDING_TTL_SECONDS
        );
        await sendPlainMessage(msg, previousStep === step ? 'Você já está na primeira pergunta.' : 'Claro, vamos voltar uma etapa.');
        await sendPlainMessage(msg, getQuestion(previousStep));
        return;
    }

    if (isHelpCommand(answer)) {
        await sendPlainMessage(msg, buildOnboardingHelp(step));
        return;
    }

    if (step === 1) {
        if (!answer) {
            await sendPlainMessage(msg, 'Me diga seu nome completo. Isso ajuda a identificar transferências internas nos extratos.');
            return;
        }
        if (looksLikeBotCommand(answer)) {
            await sendPlainMessage(msg, 'Isso parece um comando, não um nome. Me diga seu nome completo. Ex: Daniel Ferreira dos Santos');
            return;
        }
        data.full_name = answer;
    }

    if (step === 2) {
        if (!answer) {
            await sendPlainMessage(msg, 'Me diga um nome curto para te chamar. Ex: Daniel');
            return;
        }
        if (looksLikeBotCommand(answer)) {
            await sendPlainMessage(msg, 'Isso parece um comando, não um nome. Me diga só como prefere ser chamado. Ex: Daniel');
            return;
        }
        data.display_name = answer;
    }

    if (step === 3) {
        const income = parseAmountLocal(answer);
        if (income === null || income < 0) {
            await sendPlainMessage(msg, 'Não consegui entender a renda. Ex: 2000, R$ 2 mil, dois mil.');
            return;
        }
        data.monthly_income = income;
    }

    if (step === 4) {
        const fixed = parseAmountLocal(answer);
        if (fixed === null || fixed < 0) {
            await sendPlainMessage(msg, 'Não consegui entender o gasto fixo. Ex: 1500 ou R$ 1,5 mil.');
            return;
        }
        data.fixed_expense_estimate = fixed;
    }

    if (step === 5) {
        const yesNo = isYesNo(answer);
        if (!yesNo) {
            await sendPlainMessage(msg, 'Responda apenas com: sim ou não.');
            return;
        }
        data.has_debt = yesNo;
    }

    if (step === 6) {
        if (!answer) {
            await sendPlainMessage(msg, 'Me diga seu objetivo principal em uma frase curta.');
            return;
        }
        data.primary_goal = answer;
    }

    const nextStep = step + 1;
    if (nextStep > ONBOARDING_TOTAL_STEPS) {
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
    await sendPlainMessage(msg, getQuestion(nextStep));
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
    handleOnboarding,
    POST_ONBOARDING_DEBT_OFFER_ACTION,
    prepareOnboardingState,
    __test__: {
        looksLikeBotCommand,
        isRestartCommand,
        isBackCommand,
        buildOnboardingHelp,
        onboardingMenu,
        getQuestion,
        advanceOnboarding
    }
};
