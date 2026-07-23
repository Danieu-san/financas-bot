const test = require('node:test');
const assert = require('node:assert');

process.env.STATE_STORE_ENCRYPTION_KEY = process.env.STATE_STORE_ENCRYPTION_KEY
    || Buffer.alloc(32, 0x55).toString('base64');

const userServicePath = require.resolve('../src/services/userService');
require.cache[userServicePath] = {
    id: userServicePath,
    filename: userServicePath,
    loaded: true,
    exports: {
        getUserProfileByUserId: async () => ({
            user_id: 'onboarding-user',
            onboarding_completed_at: '2026-05-15T00:00:00.000Z'
        }),
        upsertUserProfile: async () => null,
        updateUserDisplayName: async () => null
    }
};

const userStateManager = require('../src/state/userStateManager');
const onboardingHandler = require('../src/handlers/onboardingHandler');
const { handleOnboarding } = onboardingHandler;

function createMessage(body = 'qual meu saldo?') {
    const replies = [];
    return {
        body,
        from: '5599994000001@c.us',
        author: '5599994000001@c.us',
        reply: async (text) => {
            replies.push(String(text));
        },
        replies
    };
}

test('onboarding clears stale state when profile is already completed', async () => {
    const msg = createMessage();
    userStateManager.setState(msg.from, {
        action: 'onboarding_flow',
        step: 3,
        data: { display_name: 'Daniel' }
    });

    const result = await handleOnboarding(msg, { user_id: 'onboarding-user' });

    assert.deepStrictEqual(result, { handled: false });
    assert.strictEqual(userStateManager.getState(msg.from), undefined);
    assert.deepStrictEqual(msg.replies, []);
});

test('onboarding can go back one step without losing stored answers', async () => {
    const { advanceOnboarding } = onboardingHandler.__test__;
    const msg = createMessage('voltar');
    userStateManager.setState(msg.from, {
        action: 'onboarding_flow',
        step: 3,
        data: { display_name: 'Daniel', monthly_income: 2000 }
    });

    await advanceOnboarding(
        msg.from,
        userStateManager.getState(msg.from),
        msg,
        { user_id: 'onboarding-user' }
    );

    const state = userStateManager.getState(msg.from);
    assert.strictEqual(state.step, 2);
    assert.strictEqual(state.data.monthly_income, 2000);
    assert.ok(msg.replies.some(text => text.includes('prefere ser chamado')));
});

test('onboarding can restart from any step', async () => {
    const { advanceOnboarding } = onboardingHandler.__test__;
    const msg = createMessage('recomeçar');
    userStateManager.setState(msg.from, {
        action: 'onboarding_flow',
        step: 4,
        data: { display_name: 'Daniel', monthly_income: 2000, fixed_expense_estimate: 1200 }
    });

    await advanceOnboarding(
        msg.from,
        userStateManager.getState(msg.from),
        msg,
        { user_id: 'onboarding-user' }
    );

    const state = userStateManager.getState(msg.from);
    assert.strictEqual(state.step, 1);
    assert.deepStrictEqual(state.data, {});
    assert.ok(msg.replies.some(text => text.includes('recomeçar')));
    assert.ok(msg.replies.some(text => text.includes('nome completo')));
});

test('onboarding help explains recovery commands', async () => {
    const { advanceOnboarding } = onboardingHandler.__test__;
    const msg = createMessage('ajuda');
    userStateManager.setState(msg.from, {
        action: 'onboarding_flow',
        step: 2,
        data: { display_name: 'Daniel' }
    });

    await advanceOnboarding(
        msg.from,
        userStateManager.getState(msg.from),
        msg,
        { user_id: 'onboarding-user' }
    );

    assert.strictEqual(userStateManager.getState(msg.from).step, 2);
    assert.ok(msg.replies[0].includes('voltar'));
    assert.ok(msg.replies[0].includes('recomeçar'));
});

test('onboarding questions show progress', () => {
    const { getQuestion } = onboardingHandler.__test__;

    assert.match(getQuestion(1), /^\[1\/6\]/);
    assert.match(getQuestion(1), /nome completo/i);
    assert.match(getQuestion(2), /^\[2\/6\]/);
    assert.match(getQuestion(2), /prefere ser chamado/i);
    assert.match(getQuestion(6), /^\[6\/6\]/);
    assert.match(getQuestion(6), /objetivo principal/i);
});

test('onboarding menu suggests debt registration when user has debt', () => {
    const { onboardingMenu } = onboardingHandler.__test__;
    const menu = onboardingMenu({ hasDebt: true, primaryGoal: 'quitar dívidas' });

    assert.ok(menu.includes('cadastrar a primeira dívida'));
    assert.ok(menu.includes('Responda `sim`'));
});

test('onboarding menu explains optional settings commands', () => {
    const { onboardingMenu } = onboardingHandler.__test__;
    const menu = onboardingMenu({ hasDebt: false, primaryGoal: 'montar reserva' });

    assert.ok(menu.includes('Ajustes opcionais'));
    assert.ok(menu.includes('pergunta curta no domingo'));
    assert.ok(menu.includes('sugiro separar 10%'));
    assert.ok(menu.includes('definir orçamento mensal 3000 dia 5'));
    assert.ok(menu.includes('gráficos diário e do ciclo no dashboard'));
    assert.ok(!menu.includes('Configurações rápidas'));
});

test('onboarding advances through the objective step before completing', async () => {
    const { advanceOnboarding } = onboardingHandler.__test__;
    const msgDebt = createMessage('sim');
    userStateManager.setState(msgDebt.from, {
        action: 'onboarding_flow',
        step: 5,
        data: {
            full_name: 'Daniel Teste',
            display_name: 'Daniel',
            monthly_income: 5000,
            fixed_expense_estimate: 2500
        }
    });

    await advanceOnboarding(
        msgDebt.from,
        userStateManager.getState(msgDebt.from),
        msgDebt,
        { user_id: 'onboarding-user' }
    );

    assert.strictEqual(userStateManager.getState(msgDebt.from).step, 6);
    assert.ok(msgDebt.replies.some(text => text.includes('objetivo principal')));

    const msgGoal = createMessage('montar reserva');
    await advanceOnboarding(
        msgGoal.from,
        userStateManager.getState(msgGoal.from),
        msgGoal,
        { user_id: 'onboarding-user' }
    );

    const state = userStateManager.getState(msgGoal.from);
    assert.strictEqual(state.action, onboardingHandler.POST_ONBOARDING_DEBT_OFFER_ACTION);
    assert.strictEqual(state.data.primaryGoal, 'montar reserva');
    assert.ok(msgGoal.replies.some(text => text.includes('Onboarding concluído')));
});

test.after(() => {
    userStateManager.closeStateStore();
});
