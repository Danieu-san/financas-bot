const test = require('node:test');
const assert = require('node:assert');

const {
    DEFAULT_PROFILE_DIR,
    loadWhatsAppE2EConfig,
    normalizePhone,
    parseBoolean
} = require('../src/testing/whatsappE2EConfig');

function baseEnv(overrides = {}) {
    return {
        WHATSAPP_E2E_ENABLED: 'true',
        WHATSAPP_E2E_BOT_PHONE: '5521999999999',
        WHATSAPP_E2E_TEST_USER_PHONE: '5521888888888',
        ...overrides
    };
}

test('whatsappE2EConfig blocks accidental execution when disabled', () => {
    assert.throws(
        () => loadWhatsAppE2EConfig({ WHATSAPP_E2E_ENABLED: 'false' }),
        /WHATSAPP_E2E_ENABLED=true/
    );
});

test('whatsappE2EConfig can report disabled mode without throwing', () => {
    assert.deepStrictEqual(
        loadWhatsAppE2EConfig({ WHATSAPP_E2E_ENABLED: 'false' }, { allowDisabled: true }),
        { enabled: false }
    );
});

test('whatsappE2EConfig requires bot and test user phones', () => {
    assert.throws(
        () => loadWhatsAppE2EConfig(baseEnv({ WHATSAPP_E2E_BOT_PHONE: '' })),
        /WHATSAPP_E2E_BOT_PHONE/
    );
    assert.throws(
        () => loadWhatsAppE2EConfig(baseEnv({ WHATSAPP_E2E_TEST_USER_PHONE: '' })),
        /WHATSAPP_E2E_TEST_USER_PHONE/
    );
});

test('whatsappE2EConfig rejects using the bot number as sender', () => {
    assert.throws(
        () => loadWhatsAppE2EConfig(baseEnv({ WHATSAPP_E2E_TEST_USER_PHONE: '55 21 99999-9999' })),
        /nao podem ser o mesmo numero/
    );
});

test('whatsappE2EConfig returns normalized safe defaults', () => {
    const config = loadWhatsAppE2EConfig(baseEnv({
        WHATSAPP_E2E_BOT_PHONE: '+55 (21) 99999-9999',
        WHATSAPP_E2E_TEST_USER_PHONE: '55 21 88888-8888'
    }));

    assert.strictEqual(config.enabled, true);
    assert.strictEqual(config.botPhone, '5521999999999');
    assert.strictEqual(config.testUserPhone, '5521888888888');
    assert.strictEqual(config.senderKind, 'personal-temporary');
    assert.strictEqual(config.profileDir, DEFAULT_PROFILE_DIR);
    assert.strictEqual(config.timeoutMs, 60000);
    assert.strictEqual(config.headless, false);
    assert.strictEqual(config.resetSpreadsheet, false);
    assert.ok(config.profilePath.endsWith(DEFAULT_PROFILE_DIR.replace('/', '\\')) || config.profilePath.endsWith(DEFAULT_PROFILE_DIR));
});

test('whatsappE2EConfig accepts qa-dedicated sender mode and explicit options', () => {
    const config = loadWhatsAppE2EConfig(baseEnv({
        WHATSAPP_E2E_SENDER_KIND: 'qa-dedicated',
        WHATSAPP_E2E_BOT_CHAT_NAME: 'Meu numero',
        WHATSAPP_E2E_TIMEOUT_MS: '120000',
        WHATSAPP_E2E_HEADLESS: 'true',
        WHATSAPP_E2E_RESET_SPREADSHEET: 'sim',
        WHATSAPP_E2E_PROFILE_DIR: '.tmp/e2e-profile'
    }));

    assert.strictEqual(config.senderKind, 'qa-dedicated');
    assert.strictEqual(config.botChatName, 'Meu numero');
    assert.strictEqual(config.timeoutMs, 120000);
    assert.strictEqual(config.headless, true);
    assert.strictEqual(config.resetSpreadsheet, true);
    assert.strictEqual(config.profileDir, '.tmp/e2e-profile');
});

test('whatsappE2EConfig rejects invalid sender kind and timeout', () => {
    assert.throws(
        () => loadWhatsAppE2EConfig(baseEnv({ WHATSAPP_E2E_SENDER_KIND: 'bot-self' })),
        /WHATSAPP_E2E_SENDER_KIND invalido/
    );
    assert.throws(
        () => loadWhatsAppE2EConfig(baseEnv({ WHATSAPP_E2E_TIMEOUT_MS: '0' })),
        /WHATSAPP_E2E_TIMEOUT_MS/
    );
});

test('whatsappE2EConfig helpers normalize common inputs', () => {
    assert.strictEqual(parseBoolean('sim'), true);
    assert.strictEqual(parseBoolean('nao'), false);
    assert.strictEqual(normalizePhone('+55 (21) 97011-2407', 'phone'), '5521970112407');
});
