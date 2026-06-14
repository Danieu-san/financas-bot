const test = require('node:test');
const assert = require('node:assert');

const schedulerPath = require.resolve('../src/jobs/scheduler');
const googlePath = require.resolve('../src/services/google');
const userServicePath = require.resolve('../src/services/userService');
const readinessNotifierPath = require.resolve('../src/reliability/enforceReadinessNotifier');

function formatDateBR(date) {
    return [
        String(date.getDate()).padStart(2, '0'),
        String(date.getMonth() + 1).padStart(2, '0'),
        date.getFullYear()
    ].join('/');
}

function installSchedulerMocks({ users, settingsByUser, sheetsByRange = {}, eventsByUser = {}, readinessAlertSender = null }) {
    delete require.cache[schedulerPath];
    delete require.cache[googlePath];
    delete require.cache[userServicePath];
    delete require.cache[readinessNotifierPath];

    require.cache[googlePath] = {
        id: googlePath,
        filename: googlePath,
        loaded: true,
        exports: {
            readDataFromSheet: async (range) => sheetsByRange[range] || [],
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
