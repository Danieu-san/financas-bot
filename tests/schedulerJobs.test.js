const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const schedulerPath = require.resolve('../src/jobs/scheduler');
const googlePath = require.resolve('../src/services/google');
const userServicePath = require.resolve('../src/services/userService');
const readinessNotifierPath = require.resolve('../src/reliability/enforceReadinessNotifier');
const dailyOpsCheckServicePath = require.resolve('../src/services/dailyOpsCheckService');
const googleOAuthRevocationServicePath = require.resolve('../src/services/googleOAuthRevocationService');
const googleOAuthServicePath = require.resolve('../src/services/googleOAuthService');
const oauthTokenStorePath = require.resolve('../src/services/oauthTokenStore');

function formatDateBR(date) {
    return [
        String(date.getDate()).padStart(2, '0'),
        String(date.getMonth() + 1).padStart(2, '0'),
        date.getFullYear()
    ].join('/');
}

function installSchedulerMocks({
    users,
    settingsByUser,
    sheetsByRange = {},
    eventsByUser = {},
    readinessAlertSender = null,
    dailyOpsSender = null,
    oauthRecovery = async () => ({ attempted: 0, revoked: 0, failed: 0, expired: 0 }),
    oauthCompensationRecovery = async () => ({ attempted: 0, compensated: 0, pending: 0, manualRequired: 0 }),
    oauthAttemptCleanup = () => ({ expired: 0, deleted: 0 }),
    readCalls = null,
    readErrorsByRange = {}
}) {
    delete require.cache[schedulerPath];
    delete require.cache[googlePath];
    delete require.cache[userServicePath];
    delete require.cache[oauthTokenStorePath];
    delete require.cache[readinessNotifierPath];
    delete require.cache[dailyOpsCheckServicePath];
    delete require.cache[googleOAuthRevocationServicePath];
    delete require.cache[googleOAuthServicePath];

    require.cache[googlePath] = {
        id: googlePath,
        filename: googlePath,
        loaded: true,
        exports: {
            readDataFromSheet: async (range, options = {}) => {
                if (Array.isArray(readCalls)) readCalls.push({ range, options });
                const scopedKey = options.userId ? `${options.userId}:${range}` : '';
                const readError = (scopedKey && readErrorsByRange[scopedKey]) || readErrorsByRange[range];
                if (readError) throw readError;
                if (scopedKey && Object.prototype.hasOwnProperty.call(sheetsByRange, scopedKey)) {
                    return sheetsByRange[scopedKey];
                }
                return sheetsByRange[range] || [];
            },
            getCalendarEventsForToday: async (_date, options = {}) => eventsByUser[options.userId] || []
        }
    };

    require.cache[userServicePath] = {
        id: userServicePath,
        filename: userServicePath,
        loaded: true,
        exports: {
            expireOldPendingUsers: async () => 0,
            getActiveUsers: async () => users,
            getUserSettingsByUserId: async (userId) => settingsByUser[userId] || {}
        }
    };

    require.cache[googleOAuthRevocationServicePath] = {
        id: googleOAuthRevocationServicePath,
        filename: googleOAuthRevocationServicePath,
        loaded: true,
        exports: {
            retryPendingGoogleRevocations: oauthRecovery
        }
    };

    require.cache[googleOAuthServicePath] = {
        id: googleOAuthServicePath,
        filename: googleOAuthServicePath,
        loaded: true,
        exports: {
            recoverPendingGoogleOAuthCompensations: oauthCompensationRecovery
        }
    };

    require.cache[oauthTokenStorePath] = {
        id: oauthTokenStorePath,
        filename: oauthTokenStorePath,
        loaded: true,
        exports: {
            expireOAuthConnectionAttempts: oauthAttemptCleanup
        }
    };

    if (readinessAlertSender) {
        require.cache[readinessNotifierPath] = {
            id: readinessNotifierPath,
            filename: readinessNotifierPath,
            loaded: true,
            exports: {
                sendInterpretationReadinessAlert: readinessAlertSender
            }
        };
    }

    if (dailyOpsSender) {
        require.cache[dailyOpsCheckServicePath] = {
            id: dailyOpsCheckServicePath,
            filename: dailyOpsCheckServicePath,
            loaded: true,
            exports: {
                sendDailyOpsCheckReport: dailyOpsSender
            }
        };
    }

    return require('../src/jobs/scheduler');
}

test('scheduler weekly check-in only sends to opted-in active users', async () => {
    const sent = [];
    const scheduler = installSchedulerMocks({
        users: [
            { user_id: 'user-a', whatsapp_id: '5511000000001@c.us' },
            { user_id: 'user-b', whatsapp_id: '5511000000002@c.us' }
        ],
        settingsByUser: {
            'user-a': { weekly_checkin_opt_in: 'SIM' },
            'user-b': { weekly_checkin_opt_in: 'NÃO' }
        }
    });

    scheduler.__test__.setClientForTest({
        sendMessage: async (to, message) => sent.push({ to, message })
    });

    await scheduler.__test__.sendWeeklyCheckIn();

    assert.deepStrictEqual(sent.map(item => item.to), ['5511000000001@c.us']);
    assert.match(sent[0].message, /Check-in da semana/);
});

test('scheduler card policy fails closed and canary requires a scoped user', () => {
    const scheduler = installSchedulerMocks({ users: [], settingsByUser: {} });

    assert.strictEqual(scheduler.__test__.getCardSchedulerRouteMode({}), 'off');
    assert.strictEqual(scheduler.__test__.getCardSchedulerRouteMode({ CARD_SCHEDULER_UNIFIED_FIRST_MODE: 'invalid' }), 'off');
    assert.strictEqual(scheduler.__test__.getCardSchedulerRouteMode({ CARD_SCHEDULER_UNIFIED_FIRST_MODE: ' ON ' }), 'on');
    assert.strictEqual(scheduler.__test__.shouldUseSchedulerCardUnifiedFirst({ mode: 'off', userId: 'user-a' }), false);
    assert.strictEqual(scheduler.__test__.shouldUseSchedulerCardUnifiedFirst({ mode: 'canary', userId: '' }), false);
    assert.strictEqual(scheduler.__test__.shouldUseSchedulerCardUnifiedFirst({ mode: 'canary', userId: 'user-a' }), true);
});

test('scheduler monthly canary reads populated personal unified cards and skips legacy routes', async () => {
    const previousMode = process.env.CARD_SCHEDULER_UNIFIED_FIRST_MODE;
    process.env.CARD_SCHEDULER_UNIFIED_FIRST_MODE = 'canary';
    const sent = [];
    const readCalls = [];
    try {
        const scheduler = installSchedulerMocks({
            users: [{ user_id: 'user-a', whatsapp_id: '5511000000001@c.us' }],
            settingsByUser: { 'user-a': { monthly_report_opt_in: 'SIM' } },
            readCalls,
            sheetsByRange: {
                'Sa\u00eddas!A:J': [['Data', 'Descri\u00e7\u00e3o', 'Categoria', 'Subcategoria', 'Valor', 'Respons\u00e1vel', 'Pagamento', 'Recorrente', 'Obs', 'user_id']],
                'Entradas!A:I': [['Data', 'Descri\u00e7\u00e3o', 'Categoria', 'Valor', 'Respons\u00e1vel', 'Recebimento', 'Recorrente', 'Obs', 'user_id']],
                'user-a:Lan\u00e7amentos Cart\u00e3o!A:J': [
                    ['Data', 'Descri\u00e7\u00e3o', 'Categoria', 'Valor Parcela', 'Parcela', 'M\u00eas de Cobran\u00e7a', 'card_id', 'Cart\u00e3o', 'Observa\u00e7\u00f5es', 'user_id'],
                    ['10/05/2026', 'Compra junho', 'Casa', '25,00', '1/1', 'Junho de 2026', 'card-a', 'Cart\u00e3o A', '', 'user-a'],
                    ['10/04/2026', 'Compra maio', 'Casa', '99,00', '1/1', 'Maio de 2026', 'card-a', 'Cart\u00e3o A', '', 'user-a']
                ]
            }
        });
        scheduler.__test__.setClientForTest({
            sendMessage: async (to, message) => sent.push({ to, message })
        });
        scheduler.__test__.setNowForTest(new Date('2026-07-15T15:00:00.000Z'));

        await scheduler.__test__.sendMonthlyReports();

        assert.strictEqual(sent.length, 1);
        assert.match(sent[0].message, /Cart\u00f5es: R\$ 25,00/);
        const cardCalls = readCalls.filter(call => /Cart/.test(call.range));
        assert.strictEqual(cardCalls.length, 1);
        assert.strictEqual(cardCalls[0].range, 'Lan\u00e7amentos Cart\u00e3o!A:J');
        assert.strictEqual(cardCalls[0].options.userId, 'user-a');
        assert.strictEqual(cardCalls[0].options.telemetryConsumer, 'scheduler');
    } finally {
        if (previousMode === undefined) delete process.env.CARD_SCHEDULER_UNIFIED_FIRST_MODE;
        else process.env.CARD_SCHEDULER_UNIFIED_FIRST_MODE = previousMode;
    }
});

test('scheduler monthly canary falls back to personal legacy routes when unified is empty', async () => {
    const previousMode = process.env.CARD_SCHEDULER_UNIFIED_FIRST_MODE;
    process.env.CARD_SCHEDULER_UNIFIED_FIRST_MODE = 'canary';
    const sent = [];
    const readCalls = [];
    try {
        const legacyHeader = ['Data', 'Descri\u00e7\u00e3o', 'Categoria', 'Valor Parcela', 'Parcela', 'M\u00eas de Cobran\u00e7a', 'user_id'];
        const scheduler = installSchedulerMocks({
            users: [{ user_id: 'user-a', whatsapp_id: '5511000000001@c.us' }],
            settingsByUser: {},
            readCalls,
            sheetsByRange: {
                'Sa\u00eddas!A:J': [['Data']],
                'Entradas!A:I': [['Data']],
                'user-a:Lan\u00e7amentos Cart\u00e3o!A:J': [['Data', 'Descri\u00e7\u00e3o']],
                'user-a:Cart\u00e3o Nubank - Daniel!A:G': [
                    legacyHeader,
                    ['10/05/2026', 'Compra legado', 'Casa', '12,50', '1/1', 'Junho de 2026', 'user-a']
                ],
                'user-a:Cart\u00e3o Nubank - Thais!A:G': [legacyHeader],
                'user-a:Cart\u00e3o Nubank - Cristina!A:G': [legacyHeader],
                'user-a:Cart\u00e3o Atacad\u00e3o!A:G': [legacyHeader]
            }
        });
        scheduler.__test__.setClientForTest({
            sendMessage: async (to, message) => sent.push({ to, message })
        });
        scheduler.__test__.setNowForTest(new Date('2026-07-15T15:00:00.000Z'));

        await scheduler.__test__.sendMonthlyReports();

        assert.match(sent[0].message, /Cart\u00f5es: R\$ 12,50/);
        const cardCalls = readCalls.filter(call => /Cart/.test(call.range));
        assert.strictEqual(cardCalls.length, 5);
        assert.strictEqual(cardCalls.filter(call => call.range !== 'Lan\u00e7amentos Cart\u00e3o!A:J').length, 4);
        assert.ok(cardCalls.every(call => call.options.userId === 'user-a'));
    } finally {
        if (previousMode === undefined) delete process.env.CARD_SCHEDULER_UNIFIED_FIRST_MODE;
        else process.env.CARD_SCHEDULER_UNIFIED_FIRST_MODE = previousMode;
    }
});

test('scheduler monthly off mode restores the central legacy route', async () => {
    const previousMode = process.env.CARD_SCHEDULER_UNIFIED_FIRST_MODE;
    process.env.CARD_SCHEDULER_UNIFIED_FIRST_MODE = 'off';
    const sent = [];
    const readCalls = [];
    try {
        const legacyHeader = ['Data', 'Descri\u00e7\u00e3o', 'Categoria', 'Valor Parcela', 'Parcela', 'M\u00eas de Cobran\u00e7a', 'user_id'];
        const scheduler = installSchedulerMocks({
            users: [{ user_id: 'user-a', whatsapp_id: '5511000000001@c.us' }],
            settingsByUser: {},
            readCalls,
            sheetsByRange: {
                'Sa\u00eddas!A:J': [['Data']],
                'Entradas!A:I': [['Data']],
                'Cart\u00e3o Nubank - Daniel!A:G': [
                    legacyHeader,
                    ['10/05/2026', 'Compra central', 'Casa', '8,75', '1/1', 'Junho de 2026', 'user-a']
                ],
                'Cart\u00e3o Nubank - Thais!A:G': [legacyHeader],
                'Cart\u00e3o Nubank - Cristina!A:G': [legacyHeader],
                'Cart\u00e3o Atacad\u00e3o!A:G': [legacyHeader]
            }
        });
        scheduler.__test__.setClientForTest({
            sendMessage: async (to, message) => sent.push({ to, message })
        });
        scheduler.__test__.setNowForTest(new Date('2026-07-15T15:00:00.000Z'));

        await scheduler.__test__.sendMonthlyReports();

        assert.match(sent[0].message, /Cart\u00f5es: R\$ 8,75/);
        const cardCalls = readCalls.filter(call => /Cart/.test(call.range));
        assert.strictEqual(cardCalls.length, 4);
        assert.ok(cardCalls.every(call => !call.options.userId));
        assert.ok(cardCalls.every(call => call.options.telemetryConsumer === 'scheduler'));
    } finally {
        if (previousMode === undefined) delete process.env.CARD_SCHEDULER_UNIFIED_FIRST_MODE;
        else process.env.CARD_SCHEDULER_UNIFIED_FIRST_MODE = previousMode;
    }
});

test('scheduler skips synthetic active test users outside test mode', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const sent = [];
    try {
        const scheduler = installSchedulerMocks({
            users: [
                { user_id: 'test-user', whatsapp_id: '5599991000001@c.us' },
                { user_id: 'real-user', whatsapp_id: '5511888888888@c.us' }
            ],
            settingsByUser: {
                'test-user': { weekly_checkin_opt_in: 'SIM' },
                'real-user': { weekly_checkin_opt_in: 'SIM' }
            }
        });

        scheduler.__test__.setClientForTest({
            sendMessage: async (to, message) => sent.push({ to, message })
        });

        await scheduler.__test__.sendWeeklyCheckIn();

        assert.strictEqual(scheduler.__test__.isSyntheticTestWhatsAppId('5599991000001@c.us'), true);
        assert.strictEqual(scheduler.__test__.shouldSendScheduledMessageToUser({ whatsapp_id: '5599991000001@c.us' }), false);
        assert.deepStrictEqual(sent.map(item => item.to), ['5511888888888@c.us']);
    } finally {
        process.env.NODE_ENV = previousNodeEnv;
    }
});

test('scheduler morning summary keeps debts and calendar events scoped per user', async () => {
    const fixedNow = new Date('2026-05-20T15:00:00.000Z');
    const tomorrow = new Date('2026-05-21T12:00:00.000Z');
    const sent = [];
    const users = [
        { user_id: 'user-a', whatsapp_id: '5511000000001@c.us' },
        { user_id: 'user-b', whatsapp_id: '5511000000002@c.us' }
    ];
    const scheduler = installSchedulerMocks({
        users,
        settingsByUser: {},
        sheetsByRange: {
            'Dívidas!A:R': [
                ['Nome', 'Credor', 'Tipo', 'Valor Original', 'Saldo Atual', 'Valor da Parcela', 'Taxa', 'Dia', 'Início', 'Total', 'Pagas', 'Status', 'Obs', '%', 'Próximo Vencimento', 'Atraso', 'Estratégia', 'user_id'],
                ['Dívida A', 'Banco', 'Empréstimo', 1000, 800, 100, '', '', '', '', '', 'Ativa', '', '', formatDateBR(tomorrow), '', '', 'user-a'],
                ['Dívida B', 'Banco', 'Empréstimo', 2000, 1800, 200, '', '', '', '', '', 'Ativa', '', '', formatDateBR(tomorrow), '', '', 'user-b']
            ]
        },
        eventsByUser: {
            'user-a': [{ summary: 'Evento A', start: { dateTime: tomorrow.toISOString() } }],
            'user-b': [{ summary: 'Evento B', start: { dateTime: tomorrow.toISOString() } }]
        }
    });

    scheduler.__test__.setClientForTest({
        sendMessage: async (to, message) => sent.push({ to, message })
    });
    scheduler.__test__.setNowForTest(fixedNow);

    await scheduler.__test__.sendMorningSummary();

    const byRecipient = Object.fromEntries(sent.map(item => [item.to, item.message]));
    assert.match(byRecipient['5511000000001@c.us'], /Dívida A/);
    assert.match(byRecipient['5511000000001@c.us'], /Evento A/);
    assert.doesNotMatch(byRecipient['5511000000001@c.us'], /Dívida B|Evento B/);
    assert.match(byRecipient['5511000000002@c.us'], /Dívida B/);
    assert.match(byRecipient['5511000000002@c.us'], /Evento B/);
    assert.doesNotMatch(byRecipient['5511000000002@c.us'], /Dívida A|Evento A/);
});

test('scheduler evening summary includes tomorrow calendar events and payment dates', async () => {
    const fixedNow = new Date('2026-05-20T15:00:00.000Z');
    const tomorrow = new Date('2026-05-21T12:00:00.000Z');
    const sent = [];
    const users = [
        { user_id: 'user-a', whatsapp_id: '5511000000001@c.us' },
        { user_id: 'user-b', whatsapp_id: '5511000000002@c.us' }
    ];
    const scheduler = installSchedulerMocks({
        users,
        settingsByUser: {},
        sheetsByRange: {
            'Dívidas!A:R': [
                ['Nome', 'Credor', 'Tipo', 'Valor Original', 'Saldo Atual', 'Valor da Parcela', 'Taxa', 'Dia', 'Início', 'Total', 'Pagas', 'Status', 'Obs', '%', 'Próximo Vencimento', 'Atraso', 'Estratégia', 'user_id'],
                ['Financiamento A', 'Banco', 'Financiamento', 1000, 800, 123.45, '', '', '', '', '', 'Ativa', '', '', formatDateBR(tomorrow), '', '', 'user-a'],
                ['Financiamento B', 'Banco', 'Financiamento', 2000, 1800, 222.22, '', '', '', '', '', 'Ativa', '', '', formatDateBR(tomorrow), '', '', 'user-b']
            ],
            'Contas!A:I': [
                ['Nome da Conta', 'Dia do Vencimento', 'Observações', 'user_id'],
                ['Internet A', tomorrow.getDate(), '', 'user-a'],
                ['Internet B', tomorrow.getDate(), '', 'user-b']
            ]
        },
        eventsByUser: {
            'user-a': [{ summary: 'Consulta A', start: { dateTime: tomorrow.toISOString() } }],
            'user-b': [{ summary: 'Consulta B', start: { dateTime: tomorrow.toISOString() } }]
        }
    });

    scheduler.__test__.setClientForTest({
        sendMessage: async (to, message) => sent.push({ to, message })
    });
    scheduler.__test__.setNowForTest(fixedNow);

    await scheduler.__test__.sendEveningSummary();

    const byRecipient = Object.fromEntries(sent.map(item => [item.to, item.message]));
    assert.match(byRecipient['5511000000001@c.us'], /Consulta A/);
    assert.match(byRecipient['5511000000001@c.us'], /Financiamento A/);
    assert.match(byRecipient['5511000000001@c.us'], /Internet A/);
    assert.doesNotMatch(byRecipient['5511000000001@c.us'], /Consulta B|Financiamento B|Internet B/);
    assert.match(byRecipient['5511000000002@c.us'], /Consulta B/);
    assert.match(byRecipient['5511000000002@c.us'], /Financiamento B/);
    assert.match(byRecipient['5511000000002@c.us'], /Internet B/);
    assert.doesNotMatch(byRecipient['5511000000002@c.us'], /Consulta A|Financiamento A|Internet A/);
});

test('scheduler summary event times are formatted in America/Sao_Paulo', async () => {
    const sent = [];
    const users = [
        { user_id: 'user-a', whatsapp_id: '5511000000001@c.us' }
    ];
    const scheduler = installSchedulerMocks({
        users,
        settingsByUser: {},
        sheetsByRange: {
            'Dívidas!A:R': [
                ['Nome', 'Credor', 'Tipo', 'Valor Original', 'Saldo Atual', 'Valor da Parcela', 'Taxa', 'Dia', 'Início', 'Total', 'Pagas', 'Status', 'Obs', '%', 'Próximo Vencimento', 'Atraso', 'Estratégia', 'user_id']
            ]
        },
        eventsByUser: {
            'user-a': [{ summary: 'Calistenia', start: { dateTime: '2026-05-20T10:00:00.000Z' } }]
        }
    });

    scheduler.__test__.setClientForTest({
        sendMessage: async (to, message) => sent.push({ to, message })
    });

    await scheduler.__test__.sendMorningSummary();

    assert.match(sent[0].message, /\*07:00\* - Calistenia/);
    assert.doesNotMatch(sent[0].message, /\*10:00\* - Calistenia/);
});

test('scheduler date helpers use America/Sao_Paulo day even when server is already on next UTC day', () => {
    const scheduler = installSchedulerMocks({
        users: [],
        settingsByUser: {}
    });
    const lateNightInBrazil = new Date('2026-05-20T00:30:00.000Z'); // 19/05/2026 21:30 in Sao Paulo
    const tomorrow = scheduler.__test__.addDaysForSchedule(lateNightInBrazil, 1);

    assert.strictEqual(formatDateBR(tomorrow), '20/05/2026');
});

test('scheduler public date/time formatters use Sao Paulo timezone', () => {
    const scheduler = installSchedulerMocks({
        users: [],
        settingsByUser: {}
    });

    assert.strictEqual(scheduler.__test__.formatScheduleTime(new Date('2026-05-20T10:00:00.000Z')), '07:00');
    assert.strictEqual(scheduler.__test__.formatScheduleDate(new Date('2026-05-20T15:00:00.000Z')), '20/05/2026');
});

test('scheduler clamps recurring bill day 31 to the last valid day of a short month', () => {
    const scheduler = installSchedulerMocks({
        users: [],
        settingsByUser: {}
    });
    const targetDate = new Date(2026, 1, 28, 12, 0, 0, 0);
    const payments = scheduler.__test__.collectPaymentsDueOnDate({
        billsData: [
            ['Nome da Conta', 'Dia do Vencimento', 'Observações', 'user_id'],
            ['Internet', '31', '', 'user-a']
        ],
        targetDate,
        userId: 'user-a'
    });

    assert.deepStrictEqual(payments, [{ type: 'Conta', name: 'Internet', amount: '' }]);
});

test('scheduler upcoming bill reminders cross month and year boundaries', async () => {
    const sent = [];
    const scheduler = installSchedulerMocks({
        users: [{ user_id: 'user-a', whatsapp_id: '5511000000001@c.us' }],
        settingsByUser: {},
        sheetsByRange: {
            'Contas!A:I': [
                ['Nome da Conta', 'Dia do Vencimento', 'Observações', 'user_id'],
                ['Conta janeiro', '2', '', 'user-a']
            ],
            'Saídas!A:J': [
                ['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Responsável', 'Pagamento', 'Recorrente', 'Obs', 'user_id']
            ]
        }
    });
    scheduler.__test__.setClientForTest({
        sendMessage: async (to, message) => sent.push({ to, message })
    });
    scheduler.__test__.setNowForTest(new Date(2026, 11, 28, 12, 0, 0, 0));

    await scheduler.__test__.checkUpcomingBills();

    assert.deepStrictEqual(sent.map(item => item.to), ['5511000000001@c.us']);
    assert.match(sent[0].message, /Conta janeiro/);
    assert.match(sent[0].message, /vence em 5 dias/);
});

test('scheduler sends interpretation readiness alerts only through the admin notifier', async () => {
    const previousAdminIds = process.env.ADMIN_IDS;
    process.env.ADMIN_IDS = '5511999999999@c.us';
    const calls = [];
    try {
        const scheduler = installSchedulerMocks({
            users: [],
            settingsByUser: {},
            readinessAlertSender: async (options) => {
                calls.push(options);
                return { sent: true, alertType: 'ready_for_manual_review' };
            }
        });
        const client = { sendMessage: async () => {} };
        scheduler.__test__.setClientForTest(client);

        const result = await scheduler.__test__.sendInterpretationReadinessAdminAlert();

        assert.strictEqual(result.sent, true);
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].client, client);
        assert.deepStrictEqual(Array.from(calls[0].adminIds), ['5511999999999@c.us']);
    } finally {
        process.env.ADMIN_IDS = previousAdminIds;
    }
});

test('scheduler does not send a false empty morning summary when Google Sheets is unavailable', async () => {
    const sent = [];
    const scheduler = installSchedulerMocks({
        users: [{ user_id: 'user-a', whatsapp_id: '5511000000001@c.us' }],
        settingsByUser: {},
        readErrorsByRange: {
            'Dívidas!A:R': Object.assign(new Error('google_sheet_read_unavailable'), {
                code: 'GOOGLE_SHEET_READ_UNAVAILABLE'
            })
        }
    });

    scheduler.__test__.setClientForTest({
        sendMessage: async (to, message) => sent.push({ to, message })
    });

    await scheduler.__test__.sendMorningSummary();

    assert.deepStrictEqual(sent, []);
});

test('scheduler sends daily ops check only through the admin ops notifier', async () => {
    const previousAdminIds = process.env.ADMIN_IDS;
    process.env.ADMIN_IDS = '5511999999999@c.us';
    const calls = [];
    try {
        const scheduler = installSchedulerMocks({
            users: [],
            settingsByUser: {},
            dailyOpsSender: async (options) => {
                calls.push(options);
                return { sent: true, status: 'ok' };
            }
        });
        const client = { sendMessage: async () => {} };
        scheduler.__test__.setClientForTest(client);

        const result = await scheduler.__test__.sendDailyOpsCheckAdminReport();

        assert.strictEqual(result.sent, true);
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].client, client);
        assert.deepStrictEqual(Array.from(calls[0].adminIds), ['5511999999999@c.us']);
    } finally {
        process.env.ADMIN_IDS = previousAdminIds;
    }
});

test('scheduler operational heartbeat persists telemetry self-check without financial data', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scheduler-legacy-telemetry-'));
    const telemetryPath = path.join(tempDir, 'events.jsonl');
    const keys = [
        'LEGACY_USAGE_TELEMETRY_ENABLED',
        'LEGACY_USAGE_TELEMETRY_PATH',
        'LEGACY_USAGE_TELEMETRY_HMAC_SECRET',
        'OPERATIONAL_ALERTS_ENABLED'
    ];
    const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    Object.assign(process.env, {
        LEGACY_USAGE_TELEMETRY_ENABLED: 'true',
        LEGACY_USAGE_TELEMETRY_PATH: telemetryPath,
        LEGACY_USAGE_TELEMETRY_HMAC_SECRET: 'test-only-scheduler-telemetry-secret',
        OPERATIONAL_ALERTS_ENABLED: 'false'
    });

    try {
        const scheduler = installSchedulerMocks({ users: [], settingsByUser: {} });
        await scheduler.__test__.sendOperationalHeartbeat();
        const events = (await fs.readFile(telemetryPath, 'utf8')).trim().split('\n').map(JSON.parse);
        assert.strictEqual(events.length, 1);
        assert.strictEqual(events[0].event, 'heartbeat');
        assert.strictEqual(events[0].surface, 'telemetry');
        assert.strictEqual(events[0].reason_code, 'self_check');
    } finally {
        for (const key of keys) {
            if (previous[key] === undefined) delete process.env[key];
            else process.env[key] = previous[key];
        }
    }
});

test('scheduler runs bounded OAuth revocation recovery without exposing job data', async () => {
    const calls = [];
    const scheduler = installSchedulerMocks({
        users: [],
        settingsByUser: {},
        oauthRecovery: async () => {
            calls.push('recovery');
            return { attempted: 2, revoked: 1, failed: 1, expired: 0 };
        }
    });

    const result = await scheduler.__test__.recoverPendingGoogleOAuthRevocations();

    assert.deepStrictEqual(calls, ['recovery']);
    assert.deepStrictEqual(result, { attempted: 2, revoked: 1, failed: 1, expired: 0 });
});

test('scheduler runs bounded OAuth connection compensation recovery with aggregate output', async () => {
    const calls = [];
    const scheduler = installSchedulerMocks({
        users: [],
        settingsByUser: {},
        oauthCompensationRecovery: async options => {
            calls.push(options);
            return { attempted: 2, compensated: 1, pending: 1, manualRequired: 0 };
        }
    });

    const result = await scheduler.__test__.recoverPendingGoogleOAuthConnectionCompensations();

    assert.deepStrictEqual(calls, [{ limit: 50 }]);
    assert.deepStrictEqual(result, { attempted: 2, compensated: 1, pending: 1, manualRequired: 0 });
});

test('scheduler removes expired OAuth attempt secrets using only bounded aggregate output', async () => {
    const calls = [];
    const scheduler = installSchedulerMocks({
        users: [],
        settingsByUser: {},
        oauthAttemptCleanup: ({ limit }) => {
            calls.push(limit);
            return { expired: 2, deleted: 1 };
        }
    });

    const result = await scheduler.__test__.cleanupExpiredGoogleOAuthConnectionAttempts();

    assert.deepStrictEqual(calls, [100]);
    assert.deepStrictEqual(result, { expired: 2, deleted: 1 });
});
