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
            WHATSAPP_E2E_TEST_USER_PHONE: '55 99 99000-0001',
            ADMIN_IDS: '5599990000001@c.us,111122223333444@lid'
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
    assert.strictEqual(normalizePhone('+55 (99) 99000-0001', 'phone'), '5599990000001');
    assert.deepStrictEqual(parseAdminPhones('5599990000001@c.us,111122223333444@lid'), ['5599990000001', '111122223333444']);
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
test('whatsapp bill pay e2e builds marker-only plan and requires an authorized route mode', () => {
    const {
        buildBillPayE2EPlan,
        requireBillPayRouteMode,
        resolveBillPayFixtureMode,
        resolveBillPaySeedSettleMs,
        testUserWhatsAppId
    } = require('../scripts/runWhatsappBillPayE2E');

    assert.throws(
        () => requireBillPayRouteMode({ FINANCIAL_COMMAND_PLANNER_MODE: 'shadow' }, 'user-e2e'),
        /route ou canary autorizado/
    );
    assert.throws(
        () => requireBillPayRouteMode({ FINANCIAL_COMMAND_PLANNER_MODE: 'canary' }, 'user-e2e'),
        /route ou canary autorizado/
    );
    assert.doesNotThrow(
        () => requireBillPayRouteMode({
            FINANCIAL_COMMAND_PLANNER_MODE: 'canary',
            FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS: 'user-e2e'
        }, 'user-e2e')
    );
    assert.doesNotThrow(
        () => requireBillPayRouteMode({ FINANCIAL_COMMAND_PLANNER_MODE: 'route' }, 'user-e2e')
    );

    const plan = buildBillPayE2EPlan({
        runId: 'TESTE_APAGAR_BILLPAY_20260626',
        amount: '12,34',
        dueDay: '25',
        userId: 'user-e2e'
    });

    assert.match(plan.marker, /^TESTE_APAGAR_BILLPAY_20260626$/);
    assert.match(plan.billLabel, /TESTE_APAGAR_BILLPAY_20260626/);
    assert.deepStrictEqual(plan.accountRow.slice(0, 9), [
        'TESTE_APAGAR_BILLPAY_20260626',
        '25',
        'Criado por E2E marker-only de bill.pay',
        'user-e2e',
        'Conta telefone TESTE_APAGAR_BILLPAY_20260626',
        'Moradia',
        'INTERNET / TELEFONE',
        '12,34',
        'SIM'
    ]);
    assert.strictEqual(plan.messages.initial, 'Paguei 12,34 da Conta telefone TESTE_APAGAR_BILLPAY_20260626');
    assert.deepStrictEqual(plan.expected.initial, ['conta recorrente', 'forma de pagamento']);
    assert.deepStrictEqual(plan.expected.confirmation, ['Confirma', 'Conta telefone TESTE_APAGAR_BILLPAY_20260626']);
    assert.deepStrictEqual(plan.expected.saved, ['Pagamento da conta recorrente', 'registrado']);
    assert.strictEqual(testUserWhatsAppId({ testUserPhone: '+55 (21) 88888-8888' }), '5521888888888@c.us');
    assert.strictEqual(resolveBillPaySeedSettleMs({}), 25000);
    assert.strictEqual(resolveBillPaySeedSettleMs({ BILL_PAY_E2E_SEED_SETTLE_MS: '30000' }), 30000);
    assert.throws(() => resolveBillPaySeedSettleMs({ BILL_PAY_E2E_SEED_SETTLE_MS: 'agora' }), /inteiro positivo/);
    assert.strictEqual(resolveBillPayFixtureMode({}), 'local');
    assert.strictEqual(resolveBillPayFixtureMode({ BILL_PAY_E2E_FIXTURE_MODE: 'external' }), 'external');
    assert.throws(() => resolveBillPayFixtureMode({ BILL_PAY_E2E_FIXTURE_MODE: 'remote-ish' }), /local ou external/);
});
test('whatsapp bill pay e2e resolves active lid users by explicit safe lookup', async () => {
    const userServicePath = require.resolve('../src/services/userService');
    const originalUserService = require.cache[userServicePath];
    require.cache[userServicePath] = {
        id: userServicePath,
        filename: userServicePath,
        loaded: true,
        exports: {
            getUserByWhatsAppId: async () => null,
            getAllUsers: async () => [
                {
                    user_id: 'user-thais',
                    whatsapp_id: '123456789@lid',
                    phone_e164: '+123456789',
                    display_name: 'Thaís',
                    status: 'ACTIVE'
                }
            ]
        }
    };

    try {
        const { resolveE2EUserId } = require('../scripts/runWhatsappBillPayE2E');
        const userId = await resolveE2EUserId(
            { testUserPhone: '+55 (21) 96427-0368' },
            { env: { WHATSAPP_E2E_TEST_USER_LOOKUP: 'Thais' } }
        );
        assert.strictEqual(userId, 'user-thais');
    } finally {
        if (originalUserService) require.cache[userServicePath] = originalUserService;
        else delete require.cache[userServicePath];
    }
});

test('whatsapp planner writes e2e builds isolated marker fixtures and requires every step 7 route', () => {
    const {
        buildPlannerWritesE2EPlan,
        requirePlannerWritesRouteMode,
        resolvePlannerWritesFixtureMode,
        rowContainsMarker
    } = require('../scripts/runWhatsappPlannerWritesE2E');

    assert.throws(
        () => requirePlannerWritesRouteMode({
            FINANCIAL_COMMAND_PLANNER_MODE: 'shadow'
        }, 'user-e2e'),
        /route ou canary/
    );
    assert.throws(
        () => requirePlannerWritesRouteMode({
            FINANCIAL_COMMAND_PLANNER_MODE: 'canary',
            FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS: 'user-e2e',
            FINANCIAL_COMMAND_PLANNER_ROUTE_OPERATIONS: 'bill.pay,debt.pay'
        }, 'user-e2e'),
        /invoice\.pay/
    );
    assert.doesNotThrow(
        () => requirePlannerWritesRouteMode({
            FINANCIAL_COMMAND_PLANNER_MODE: 'canary',
            FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS: 'user-e2e',
            FINANCIAL_COMMAND_PLANNER_ROUTE_OPERATIONS: 'bill.pay,debt.pay,invoice.pay,expense.create'
        }, 'user-e2e')
    );

    const plan = buildPlannerWritesE2EPlan({
        runId: 'TESTE_APAGAR_PLANNER_WRITES_20260627',
        userId: 'user-e2e',
        debtAmount: '12,31',
        invoiceAmount: '12,32',
        expenseAmount: '12,33',
        billingMonth: '06/2026'
    });

    assert.strictEqual(plan.marker, 'TESTE_APAGAR_PLANNER_WRITES_20260627');
    assert.match(plan.debt.label, /TESTE_APAGAR_PLANNER_WRITES_20260627/);
    assert.strictEqual(plan.debt.row.length, 18);
    assert.strictEqual(plan.debt.row[4], '100,00');
    assert.strictEqual(plan.debt.row[10], 'Ativa');
    assert.strictEqual(plan.debt.row[17], 'user-e2e');
    assert.match(plan.invoice.cardLabel, /TESTE_APAGAR_PLANNER_WRITES_20260627/);
    assert.strictEqual(plan.invoice.row[3], '12,32');
    assert.strictEqual(plan.invoice.row[5], '06/2026');
    assert.strictEqual(plan.invoice.row[9], 'user-e2e');
    assert.match(plan.messages.debt.initial, /Paguei 12,31 da dívida/);
    assert.deepStrictEqual(plan.messages.debt.expectedConfirmation, ['dívida', 'Confirma']);
    assert.match(plan.messages.invoice.initial, /Paguei 12,32 da fatura/);
    assert.deepStrictEqual(plan.messages.invoice.expectedSaved, ['Pagamento da fatura', 'registrado']);
    assert.match(plan.messages.expense.initial, /Gastei 12,33 no mercado/);
    assert.deepStrictEqual(plan.messages.expense.expectedSaved, ['Gasto de', '12,33', 'registrado']);
    assert.strictEqual(resolvePlannerWritesFixtureMode({}), 'local');
    assert.strictEqual(
        resolvePlannerWritesFixtureMode({ PLANNER_WRITES_E2E_FIXTURE_MODE: 'external' }),
        'external'
    );
    assert.throws(
        () => resolvePlannerWritesFixtureMode({ PLANNER_WRITES_E2E_FIXTURE_MODE: 'remote-ish' }),
        /local ou external/
    );
    assert.strictEqual(
        rowContainsMarker(['Compra TESTE_APAGAR_PLANNER_WRITES_20260627'], plan.marker),
        true
    );
    assert.strictEqual(
        rowContainsMarker(['Compra TESTE_APAGAR_PLANNER_WRITES_20260627_OUTRO'], plan.marker),
        false
    );
});
test('whatsapp planner writes e2e supports explicit remote fixture actions and safe user lookup', () => {
    const {
        resolvePlannerWritesAction,
        resolvePlannerWritesUserFromRows
    } = require('../scripts/runWhatsappPlannerWritesE2E');

    assert.strictEqual(resolvePlannerWritesAction({}), 'all');
    for (const action of ['all', 'conversation', 'seed', 'verify-cleanup', 'cleanup']) {
        assert.strictEqual(
            resolvePlannerWritesAction({ PLANNER_WRITES_E2E_ACTION: action }),
            action
        );
    }
    assert.throws(
        () => resolvePlannerWritesAction({ PLANNER_WRITES_E2E_ACTION: 'delete-all' }),
        /PLANNER_WRITES_E2E_ACTION/
    );

    const users = [
        { user_id: 'user-daniel', display_name: 'Daniel', status: 'ACTIVE' },
        { user_id: 'user-thais', display_name: 'Thaís', status: 'ACTIVE' },
        { user_id: 'user-old', display_name: 'Daniel', status: 'BLOCKED' }
    ];
    assert.strictEqual(
        resolvePlannerWritesUserFromRows(users, 'Daniel').user_id,
        'user-daniel'
    );
    assert.throws(
        () => resolvePlannerWritesUserFromRows(users, ''),
        /lookup explícito/
    );
    assert.throws(
        () => resolvePlannerWritesUserFromRows(
            [...users, { user_id: 'user-daniel-2', display_name: 'Daniel', status: 'ACTIVE' }],
            'Daniel'
        ),
        /único usuário ACTIVE/
    );
});