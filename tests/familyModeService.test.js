const test = require('node:test');
const assert = require('node:assert');

const {
    evaluateFamilyModeAccess,
    getFamilyModeConfig
} = require('../src/services/familyModeService');

test('family mode is disabled by default', () => {
    const config = getFamilyModeConfig({ env: {} });

    assert.strictEqual(config.enabled, false);
    assert.deepStrictEqual(config.allowedUserIds, []);
    assert.deepStrictEqual(config.allowedWhatsappIds, []);
});

test('family mode blocks users outside configured allowlist without exposing ids', () => {
    const env = {
        FAMILY_MODE_ENABLED: 'true',
        FAMILY_MODE_USER_IDS: 'daniel-user,thais-user',
        FAMILY_MODE_WHATSAPP_IDS: '5521000000000@c.us,5521111111111@c.us'
    };

    const allowed = evaluateFamilyModeAccess({
        user: { user_id: 'daniel-user', whatsapp_id: '5521000000000@c.us' },
        senderId: '5521000000000@c.us',
        env
    });
    const blocked = evaluateFamilyModeAccess({
        user: { user_id: 'outsider-user', whatsapp_id: '5521222222222@c.us' },
        senderId: '5521222222222@c.us',
        env
    });

    assert.strictEqual(allowed.allowed, true);
    assert.strictEqual(blocked.allowed, false);
    assert.match(blocked.reply, /modo familiar/i);
    assert.doesNotMatch(blocked.reply, /outsider-user|5521222222222/);
});

test('family mode treats missing allowlist as closed when explicitly enabled', () => {
    const result = evaluateFamilyModeAccess({
        user: { user_id: 'daniel-user', whatsapp_id: '5521000000000@c.us' },
        senderId: '5521000000000@c.us',
        env: { FAMILY_MODE_ENABLED: 'true' }
    });

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, 'family_mode_empty_allowlist');
});
