const test = require('node:test');
const assert = require('node:assert');

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
const { handleOnboarding } = require('../src/handlers/onboardingHandler');

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

test.after(() => {
    userStateManager.closeStateStore();
});
