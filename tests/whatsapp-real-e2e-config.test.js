const test = require('node:test');
const assert = require('node:assert');

const {
    DEFAULT_PROFILE_DIR,
    loadWhatsAppE2EConfig,
    normalizePhone,
    parseBoolean,
    parseAdminPhones
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

test('whatsappE2EConfig rejects using an admin number as test user', () => {
    assert.throws(
        () => loadWhatsAppE2EConfig(baseEnv({
            WHATSAPP_E2E_TEST_USER_PHONE: '55 21 97011-2407',
            ADMIN_IDS: '5521970112407@c.us,151058345148646@lid'
        })),
        /nao pode ser um numero administrador/
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
    assert.deepStrictEqual(parseAdminPhones('5521970112407@c.us,151058345148646@lid'), ['5521970112407', '151058345148646']);
});

test('whatsapp analytical batch expectations avoid fixed historical amounts', () => {
    const { buildAnalyticalSuites } = require('../scripts/runWhatsappAnalyticalBatch');
    const suites = buildAnalyticalSuites();
    const fixedValuePattern = /\bR\$\s*\d|\b\d{1,3},\d{2}%\b/;

    assert.ok(suites.length > 0);
    for (const suite of suites) {
        assert.ok(suite.cases.length > 0, `suite ${suite.label} deve ter casos`);
        for (const testCase of suite.cases) {
            assert.ok(testCase.expectAny.length > 0, `caso ${testCase.question} deve ter marcadores`);
            assert.ok(
                testCase.expectAny.every(marker => !fixedValuePattern.test(marker)),
                `caso ${testCase.question} nao deve depender de valor historico fixo`
            );
        }
    }
});

test('whatsapp analytical populated suite exercises a month with data and rejects empty results', () => {
    const { buildAnalyticalSuites } = require('../scripts/runWhatsappAnalyticalBatch');
    const populated = buildAnalyticalSuites({ populatedPeriod: 'junho de 2026' })
        .find(suite => suite.label === 'daniel-populated');

    assert.ok(populated);
    assert.ok(populated.cases.length >= 5);
    assert.ok(populated.cases.every(testCase => /junho de 2026/i.test(testCase.question)));
    assert.ok(populated.cases.every(testCase => testCase.rejectAny.includes('Não encontrei gastos')));
    assert.ok(populated.cases.slice(0, 2).every(testCase => testCase.requirePattern instanceof RegExp));
});

test('whatsapp analytical security suite exercises prompt injection without writing financial data', () => {
    const { buildAnalyticalSuites } = require('../scripts/runWhatsappAnalyticalBatch');
    const security = buildAnalyticalSuites().find(suite => suite.label === 'daniel-security');

    assert.ok(security);
    assert.ok(security.cases.length >= 3);
    assert.ok(security.cases.every(testCase => testCase.expectAny.includes('Não posso mostrar identificadores internos')));
    assert.ok(security.cases.every(testCase => !/gastei|recebi|transferi|criar|apagar/i.test(testCase.question)));
});

test('whatsapp import e2e confirmation expectations use the generated row count', () => {
    const { buildConfirmationExpectations } = require('../scripts/runWhatsappImportE2E');

    assert.deepStrictEqual(
        buildConfirmationExpectations(27),
        [
            'Importação concluída. 27 lançamento',
            'Importacao concluida. 27 lancamento'
        ]
    );
});

test('whatsapp import e2e selects document inputs and rejects image-only inputs', () => {
    const { findDocumentInputIndex } = require('../scripts/runWhatsappImportE2E');

    assert.strictEqual(findDocumentInputIndex(['image/*', 'application/*']), 1);
    assert.strictEqual(findDocumentInputIndex(['image/*', 'text/csv']), 1);
    assert.strictEqual(findDocumentInputIndex(['image/*']), -1);
});

test('whatsapp import e2e owner choice is configurable for family imports', () => {
    const { resolveImportOwnerChoice } = require('../scripts/runWhatsappImportE2E');

    assert.strictEqual(resolveImportOwnerChoice({}), '1');
    assert.strictEqual(resolveImportOwnerChoice({ IMPORT_E2E_OWNER_CHOICE: '2' }), '2');
    assert.throws(
        () => resolveImportOwnerChoice({ IMPORT_E2E_OWNER_CHOICE: 'thais' }),
        /IMPORT_E2E_OWNER_CHOICE/
    );
});
