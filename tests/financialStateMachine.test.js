const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    OpenFinanceHistoricalAmbiguityWhatsappRuntime,
    __test__: historicalAmbiguityRuntimeTest
} = require('../src/openFinance/openFinanceHistoricalAmbiguityWhatsappRuntime');
const {
    OpenFinanceHistoricalAmbiguityReviewStore,
    buildOpenFinanceHistoricalAmbiguityReview
} = require('../src/openFinance/openFinanceHistoricalAmbiguityReview');
const { SchedulerMessageOutbox } = require('../src/jobs/schedulerMessageOutbox');

process.env.NODE_ENV = 'test';
process.env.ADMIN_IDS = process.env.ADMIN_IDS || '5599990000001@c.us';
process.env.STATE_STORE_ENCRYPTION_KEY = process.env.STATE_STORE_ENCRYPTION_KEY
    || Buffer.alloc(32, 0x55).toString('base64');
const RELIABILITY_TELEMETRY_PATH = path.join(os.tmpdir(), `financas-bot-reliability-${process.pid}.jsonl`);
const COMMAND_CANARY_TELEMETRY_PATH = path.join(os.tmpdir(), `financas-bot-command-canary-${process.pid}.jsonl`);
process.env.INTERPRETATION_RELIABILITY_TELEMETRY_PATH = RELIABILITY_TELEMETRY_PATH;
process.env.FINANCIAL_COMMAND_PLANNER_CANARY_TELEMETRY_PATH = COMMAND_CANARY_TELEMETRY_PATH;
test.after(() => fs.rmSync(RELIABILITY_TELEMETRY_PATH, { force: true }));
test.after(() => fs.rmSync(COMMAND_CANARY_TELEMETRY_PATH, { force: true }));

const SENDER = '5599993000001@c.us';
const USER_ID = 'state-machine-user';
const PARTNER_ID = 'state-machine-partner';
const PARTNER_SENDER = '5599993000002@c.us';
const ADMIN_SENDER = String(process.env.ADMIN_IDS).split(',').map(value => value.trim()).find(Boolean);
const ADMIN_USER_ID = 'state-machine-admin';
const TERMS_VERSION = process.env.TERMS_VERSION || 'v1.1';
const HISTORICAL_REVIEW_SECRET = 'state-machine-historical-review-secret-2026';

function buildStateMachineHistoricalCandidate(clock) {
    const alias = 'family_source';
    const creditId = 'credit-private-id';
    const bankId = 'bank-private-id';
    const hmacRef = (kind, value) => crypto.createHmac('sha256', HISTORICAL_REVIEW_SECRET)
        .update(`${kind}:${value}`).digest('hex').slice(0, 32);
    const groupingBasis = ['Compra parcelada', '2025-07-10', 5000, 3].join(':');
    const seriesRef = hmacRef('historical_rx_installment',
        `${alias}:${creditId}:${groupingBasis}`);
    const items = [{
        alias_code: alias,
        owner_scope: 'family',
        availability: { accounts: 'available', transactions: 'available' },
        accounts: [{ id: creditId, type: 'CREDIT' }, { id: bankId, type: 'BANK' }],
        transactions: [
            { id: 'installment-a', account_id: creditId, description: 'Compra parcelada',
                original_date: '2025-07-10', date: '2025-08-10T12:00:00.000Z',
                amount_cents: 5000, installment_number: 2, total_installments: 3,
                status: 'POSTED' },
            { id: 'installment-b', account_id: creditId, description: 'Compra parcelada',
                original_date: '2025-07-10', date: '2025-08-11T12:00:00.000Z',
                amount_cents: 5000, installment_number: 2, total_installments: 3,
                status: 'POSTED' },
            { id: 'investment-a', account_id: bankId, description: 'Movimento patrimonial',
                date: '2025-08-12T12:00:00.000Z', amount_cents: -2000,
                operation_type: 'INVESTIMENTO', status: 'POSTED' }
        ]
    }];
    const built = buildOpenFinanceHistoricalAmbiguityReview({
        items,
        historicalRx: {
            schema_version: 1,
            financial_writes: 0,
            blockers: [`${alias}:installment_series_ambiguous`,
                `${alias}:investment_movement_semantics_ambiguous`],
            segments: [
                { source_alias: alias, segment_ref: hmacRef('historical_rx_segment',
                    `${alias}:${creditId}`),
                product: 'credit_card', installments: { series: [{
                    series_ref: seriesRef,
                    duplicate_numbers: [2],
                    identity_status: 'ambiguous_duplicate_installment_number'
                }] },
                investment_movements: { semantically_ambiguous_count: null } },
                { source_alias: alias, segment_ref: hmacRef('historical_rx_segment',
                    `${alias}:${bankId}`),
                product: 'bank_account', installments: { series: [] },
                investment_movements: {
                    status: 'provider_labeled_with_ambiguous_semantics',
                    semantically_ambiguous_count: 1
                } }
            ]
        },
        secret: HISTORICAL_REVIEW_SECRET,
        familyScope: 'family',
        authorizedWhatsAppIds: [SENDER, PARTNER_SENDER],
        clock
    });
    return built;
}

const USERS_HEADER = ['user_id', 'whatsapp_id', 'phone_e164', 'display_name', 'status', 'created_at', 'updated_at', 'consent_at', 'terms_version', 'deleted_at'];
const DEBTS_HEADER = [
    'Nome da Dívida', 'Credor', 'Tipo', 'Valor Original', 'Saldo Atual', 'Valor da Parcela',
    'Taxa de Juros', 'Dia de Vencimento', 'Data de Início', 'Total de Parcelas', 'Parcelas Pagas',
    'Status', 'Observações', '% Quitado', 'Último Pagamento', 'Próximo Vencimento', 'Estratégia', 'user_id'
];
const CARD_SHEETS = [
    'Cartão Nubank - Daniel',
    'Cartão Nubank - Thais',
    'Cartão Nubank - Cristina',
    'Cartão Atacadão'
];
const USER_SETTINGS_HEADER = [
    'user_id', 'timezone', 'weekly_checkin_enabled', 'monthly_report_enabled',
    'language', 'created_at', 'auto_reserve_enabled', 'auto_reserve_percent',
    'daily_goal_enabled', 'daily_goal_amount', 'daily_goal_last_alert_date', 'daily_goal_last_alert_level', 'daily_goal_scope',
    'monthly_budget_enabled', 'monthly_budget_amount', 'monthly_budget_last_alert_date', 'monthly_budget_last_alert_level', 'monthly_budget_scope', 'monthly_budget_cycle_start_day'
];

const sheets = {};
const personalSheetOverrides = {};
const sheetReadErrors = new Map();
const sheetReadCalls = [];
const deletedRows = [];
const appendedRows = [];
const appendRowAttempts = [];
const seenAppendOperationKeys = new Set();
const seenUpdateOperationKeys = new Set();
const createdCalendarEvents = [];
const structuredResponses = [];
let stateMachineFailed = false;
let financialScopeUserIds = [USER_ID];
let failNextPlainMessage = false;
let usesPersonalSpreadsheet = false;
let audioHandleCalls = 0;
let audioHandleDelayMs = 0;
let rateLimitCheckCount = 0;
const audioRateLimitChecksAtHandle = [];
let usersSheetReadDelayMs = 0;
let activeUsersSheetReads = 0;
let maxConcurrentUsersSheetReads = 0;
let appendRowDelayMs = 0;

function stateMachineTest(name, fn) {
    test(name, async () => {
        try {
            await fn();
        } catch (error) {
            stateMachineFailed = true;
            throw error;
        }
    });
}

function activeUserRow() {
    return [
        USER_ID,
        SENDER,
        '+5599993000001',
        'Usuario Estado',
        'ACTIVE',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
        TERMS_VERSION,
        ''
    ];
}

function partnerUserRow() {
    return [
        PARTNER_ID,
        PARTNER_SENDER,
        '+5599993000002',
        'Thais',
        'ACTIVE',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
        TERMS_VERSION,
        ''
    ];
}

function resetSheets() {
    sheets.Users = [USERS_HEADER, activeUserRow()];
    sheets.UserProfile = [
        ['user_id', 'full_name', 'monthly_income', 'fixed_expense_estimate', 'has_debt', 'primary_goal', 'onboarding_completed_at'],
        [USER_ID, 'Usuario Estado Completo', 5000, 2500, 'SIM', 'montar reserva', '2026-01-01T00:00:00.000Z']
    ];
    sheets.UserSettings = [
        USER_SETTINGS_HEADER,
        [USER_ID, 'America/Sao_Paulo', 'NÃO', 'SIM', 'pt-BR', '2026-01-01T00:00:00.000Z', 'NÃO', '10', 'NÃO', '', '', '', 'personal', 'NÃO', '', '', '', 'personal', '1']
    ];
    sheets.Saídas = [['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Responsável', 'Pagamento', 'Recorrente', 'Observações', 'user_id', 'Conta Financeira']];
    sheets.Entradas = [['Data', 'Descrição', 'Categoria', 'Valor', 'Responsável', 'Recebimento', 'Recorrente', 'Observações', 'user_id', 'Conta Financeira']];
    sheets.Transferências = [['Data', 'Descrição', 'Valor', 'Origem', 'Destino', 'Método', 'Observações', 'Status', 'user_id']];
    sheets['Lançamentos Cartão'] = [['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'card_id', 'Cartão', 'Status', 'user_id']];
    sheets['Cartões'] = [['card_id', 'Nome', 'Vencimento', 'Fechamento', 'Responsável', 'Ativo', 'Observações']];
    sheets.Categorias = [['Categoria', 'Subcategoria', 'Ativa', 'Criada em', 'user_id']];
    sheets.Contas = [['Nome da Conta', 'Dia do Vencimento', 'Observações', 'user_id', 'Nome Amigável', 'Categoria', 'Subcategoria', 'Valor Esperado', 'Regra Ativa']];
    sheets['Contas Financeiras'] = [['Nome da Conta', 'Tipo', 'Saldo Inicial', 'Data de Abertura', 'Status', 'Moeda', 'Responsável', 'user_id', 'Observações']];
    sheets.Dívidas = [DEBTS_HEADER];
    sheets.Metas = [['Nome da Meta', 'Valor Alvo', 'Valor Atual', '% Progresso', 'Valor Mensal Necessário', 'Data Fim', 'Status', 'Prioridade', 'user_id', 'Escopo', 'Última Movimentação']];
    sheets['Movimentações Metas'] = [['Data', 'Meta', 'Tipo', 'Valor', 'Valor Antes', 'Valor Depois', 'Observação', 'Responsável', 'user_id', 'goal_user_id']];
    for (const sheetName of CARD_SHEETS) {
        sheets[sheetName] = [['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'user_id']];
    }
    deletedRows.length = 0;
    appendedRows.length = 0;
    appendRowAttempts.length = 0;
    seenAppendOperationKeys.clear();
    seenUpdateOperationKeys.clear();
    createdCalendarEvents.length = 0;
    structuredResponses.length = 0;
    Object.keys(personalSheetOverrides).forEach(key => delete personalSheetOverrides[key]);
    sheetReadErrors.clear();
    sheetReadCalls.length = 0;
    financialScopeUserIds = [USER_ID];
    failNextPlainMessage = false;
    usesPersonalSpreadsheet = false;
    audioHandleCalls = 0;
    audioHandleDelayMs = 0;
    rateLimitCheckCount = 0;
    audioRateLimitChecksAtHandle.length = 0;
    usersSheetReadDelayMs = 0;
    activeUsersSheetReads = 0;
    maxConcurrentUsersSheetReads = 0;
    appendRowDelayMs = 0;
}

function activeAdminUserRow() {
    return [
        ADMIN_USER_ID,
        ADMIN_SENDER,
        '+5599990000001',
        'Admin Estado',
        'ACTIVE',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
        TERMS_VERSION,
        ''
    ];
}

function addActiveAdminTestUser() {
    sheets.Users.push(activeAdminUserRow());
    sheets.UserProfile.push([
        ADMIN_USER_ID,
        'Admin Estado Completo',
        5000,
        2500,
        'NÃO',
        'organizar finanças',
        '2026-01-01T00:00:00.000Z'
    ]);
    sheets.UserSettings.push([
        ADMIN_USER_ID,
        'America/Sao_Paulo',
        'NÃO',
        'SIM',
        'pt-BR',
        '2026-01-01T00:00:00.000Z',
        'NÃO',
        '10',
        'NÃO',
        '',
        '',
        '',
        'personal',
        'NÃO',
        '',
        '',
        '',
        'personal',
        '1'
    ]);
    userService.invalidateUserCaches();
}

function todayBr() {
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(new Date());
}

function daysRemainingTodaySaoPaulo() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date()).reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});
    const year = Number(parts.year);
    const month = Number(parts.month) - 1;
    const day = Number(parts.day);
    return Math.max(1, new Date(year, month + 1, 0).getDate() - day + 1);
}

function enqueueStructuredResponse(response) {
    structuredResponses.push(response);
}

function getSheetName(rangeOrSheet) {
    return String(rangeOrSheet || '').split('!')[0];
}

function columnNumber(column) {
    return String(column || '').split('').reduce((total, char) => (total * 26) + char.charCodeAt(0) - 64, 0);
}

function installMocks() {
    const oauthStorePath = require.resolve('../src/services/oauthTokenStore');
    require.cache[oauthStorePath] = {
        id: oauthStorePath,
        filename: oauthStorePath,
        loaded: true,
        exports: {
            getOAuthConnection: () => null,
            getFinancialScopeUserIds: () => financialScopeUserIds,
            getSharedSpreadsheetMembership: () => null,
            revokeSharedSpreadsheetMembership: () => null,
            setSharedSpreadsheetMembership: () => null
        }
    };

    const googlePath = require.resolve('../src/services/google');
    require.cache[googlePath] = {
        id: googlePath,
        filename: googlePath,
        loaded: true,
        exports: {
            readDataFromSheet: async (range, options = {}) => {
                const sheetName = getSheetName(range);
                sheetReadCalls.push({ sheetName, options: { ...options } });
                if (sheetReadErrors.has(sheetName)) throw sheetReadErrors.get(sheetName);
                if (sheetName === 'Users' && usersSheetReadDelayMs > 0) {
                    activeUsersSheetReads += 1;
                    maxConcurrentUsersSheetReads = Math.max(maxConcurrentUsersSheetReads, activeUsersSheetReads);
                    try {
                        await new Promise(resolve => setTimeout(resolve, usersSheetReadDelayMs));
                    } finally {
                        activeUsersSheetReads -= 1;
                    }
                }
                if (usesPersonalSpreadsheet && options.userId && personalSheetOverrides[sheetName]) {
                    return personalSheetOverrides[sheetName];
                }
                return sheets[sheetName] || [];
            },
            appendRowToSheet: async (sheetName, row, options = {}) => {
                const name = getSheetName(sheetName);
                if (!sheets[name]) sheets[name] = [[]];
                appendRowAttempts.push({ sheetName: name, row, options });
                if (appendRowDelayMs > 0) {
                    await new Promise(resolve => setTimeout(resolve, appendRowDelayMs));
                }
                if (options.operationKey) {
                    if (seenAppendOperationKeys.has(options.operationKey)) {
                        return { status: 'committed', receipt: { replayed: true } };
                    }
                    seenAppendOperationKeys.add(options.operationKey);
                }
                sheets[name].push(row);
                appendedRows.push({ sheetName: name, row, options });
                return {
                    status: 'committed',
                    receipt: {
                        sheetName: name,
                        updatedRange: `${name}!A${sheets[name].length}`
                    }
                };
            },
            createCalendarEvent: async (title, startDateTime, recurrenceRule, options = {}) => {
                const event = { title, startDateTime, recurrenceRule, options };
                createdCalendarEvents.push(event);
                return event;
            },
            updateRowInSheet: async (range, row, options = {}) => {
                const name = getSheetName(range);
                const rowMatch = String(range).match(/![A-Z]+(\d+):/);
                const rangeMatch = String(range).match(/!([A-Z]+)\d+:([A-Z]+)\d+/);
                if (rangeMatch) {
                    const width = columnNumber(rangeMatch[2]) - columnNumber(rangeMatch[1]) + 1;
                    if (row.length > width) {
                        throw new Error(`Mock range ${range} has width ${width}, but row has ${row.length} columns`);
                    }
                }
                const rowNumber = Number(rowMatch?.[1] || 0);
                if (options.operationKey) {
                    if (seenUpdateOperationKeys.has(options.operationKey)) {
                        return { success: true, status: 'committed', receipt: { replayed: true } };
                    }
                    seenUpdateOperationKeys.add(options.operationKey);
                }
                sheets[name][rowNumber - 1] = row;
                return { success: true, status: 'committed', receipt: { replayed: false } };
            },
            deleteRowsByIndices: async (sheetName, indices) => {
                deletedRows.push({ sheetName, indices });
                return { success: true };
            },
            hasUserSpreadsheetContext: async () => usesPersonalSpreadsheet,
            runWithUserSheetContext: async (_user, action) => action(),
            syncDashboardForUser: async () => {},
            __test__: {
                eventBelongsToUser: (event, userId) => event?.extendedProperties?.private?.user_id === userId
            }
        }
    };

    const geminiPath = require.resolve('../src/services/gemini');
    const geminiMock = {
        askLLM: async (prompt = '') => {
            const text = String(prompt).toLowerCase();
            if (text.includes('forma de pagamento')) {
                const answerMatch = String(prompt).match(/Resposta do usu.rio:\s*"([^"]*)"/i);
                const answer = (answerMatch?.[1] || '').toLowerCase();
                if (answer.includes('credito') || answer.includes('crédito')) return 'Crédito';
                if (answer.includes('debito') || answer.includes('débito')) return 'Débito';
                if (answer.includes('dinheiro')) return 'Dinheiro';
                return 'PIX';
            }
            if (text.includes('recebimento')) return 'PIX';
            if (text.includes('prioridade')) return 'Alta';
            return 'PIX';
        },
        getStructuredResponseFromLLM: async () => structuredResponses.shift() || {},
        callGemini: async () => '',
        transcribeAudio: async () => ''
    };
    require.cache[geminiPath] = {
        id: geminiPath,
        filename: geminiPath,
        loaded: true,
        exports: geminiMock
    };

    const geminiClientPath = require.resolve('../src/ai/geminiClient');
    require.cache[geminiClientPath] = {
        id: geminiClientPath,
        filename: geminiClientPath,
        loaded: true,
        exports: { askLLM: geminiMock.askLLM }
    };

    const audioPath = require.resolve('../src/handlers/audioHandler');
    require.cache[audioPath] = {
        id: audioPath,
        filename: audioPath,
        loaded: true,
        exports: {
            handleAudio: async (msg) => {
                audioHandleCalls += 1;
                audioRateLimitChecksAtHandle.push(rateLimitCheckCount);
                if (audioHandleDelayMs > 0) {
                    await new Promise(resolve => setTimeout(resolve, audioHandleDelayMs));
                }
                await msg.reply('🎙️ Entendido! Recebi seu áudio e já estou processando. Um momento...');
                return msg.__transcribedText || 'gastei 30 com uber no pix';
            }
        }
    };

    const whatsappMessagingPath = require.resolve('../src/utils/whatsappMessaging');
    require.cache[whatsappMessagingPath] = {
        id: whatsappMessagingPath,
        filename: whatsappMessagingPath,
        loaded: true,
        exports: {
            sendPlainMessage: async (msg, text) => {
                if (failNextPlainMessage) {
                    failNextPlainMessage = false;
                    throw new Error('simulated WhatsApp send failure');
                }
                return msg.reply(String(text));
            }
        }
    };
}

installMocks();

const {
    handleMessage,
    handleMessageForBackfill,
    __test__: messageHandlerTest
} = require('../src/handlers/messageHandler');
const {
    backfillUnreadMessages
} = require('../src/services/whatsappUnreadBackfillService');
const userStateManager = require('../src/state/userStateManager');
const userService = require('../src/services/userService');
const { getReadModelStats } = require('../src/services/readModelService');
const cache = require('../src/utils/cache');
const rateLimiter = require('../src/utils/rateLimiter');
const logger = require('../src/utils/logger');
const { OpenFinanceAlertOutbox } = require('../src/openFinance/openFinanceAlertOutbox');
const { OpenFinanceRevocationJournal } = require('../src/openFinance/openFinanceRevocationJournal');
const { OpenFinanceShadowPreviewStore } = require('../src/openFinance/openFinanceShadowPreviewStore');
const {
    OpenFinanceSaveProposalReviewStore
} = require('../src/openFinance/openFinanceSaveProposalReviewStore');
const {
    OpenFinanceSaveProposalFinalizationStore
} = require('../src/openFinance/openFinanceSaveProposalFinalizationStore');
const {
    OpenFinanceLiveStagingVault
} = require('../src/openFinance/openFinanceLiveStagingVault');
const {
    OpenFinanceProactiveReviewStore
} = require('../src/openFinance/openFinanceProactiveReviewStore');
const { observationRef } = require('../src/openFinance/openFinanceRuntimeReconciliation');
const originalRateLimiterIsAllowed = rateLimiter.isAllowed;
const {
    getProjectedPlanWriteContext,
    __test__: { resetProjectedPlanWriteRuntimeForTests }
} = require('../src/plans/projectedPlanWriteRuntime');

function createMockMessage(body) {
    const replies = [];
    return {
        id: { id: `state-${Date.now()}-${Math.random().toString(36).slice(2)}` },
        type: 'chat',
        body,
        timestamp: Math.floor(Date.now() / 1000),
        from: SENDER,
        author: SENDER,
        isStatus: false,
        fromMe: false,
        _data: { notifyName: 'Usuario Estado', pushname: 'Usuario Estado' },
        reply: async (text) => {
            replies.push(String(text));
        },
        replies
    };
}

function createMockMessageFrom(body, senderId) {
    const msg = createMockMessage(body);
    msg.from = senderId;
    msg.author = senderId;
    return msg;
}

function createMockMediaMessage(text, { filename = 'extrato.csv', mimetype = 'text/csv' } = {}) {
    const msg = createMockMessage('');
    msg.hasMedia = true;
    msg.type = 'document';
    msg._data.filename = filename;
    msg.downloadMedia = async () => ({
        filename,
        mimetype,
        data: Buffer.from(text, 'utf8').toString('base64')
    });
    return msg;
}

function createMockAudioMessage(transcribedText) {
    const msg = createMockMessage('');
    msg.type = 'ptt';
    msg.hasMedia = true;
    msg.__transcribedText = transcribedText;
    msg.downloadMedia = async () => ({
        mimetype: 'audio/ogg',
        data: Buffer.from('fake-audio', 'utf8').toString('base64')
    });
    return msg;
}

async function send(body) {
    const msg = createMockMessage(body);
    await handleMessage(msg);
    return msg.replies.at(-1) || '';
}

async function sendMedia(text, options) {
    const msg = createMockMediaMessage(text, options);
    await handleMessage(msg);
    return msg.replies.at(-1) || '';
}

async function sendAudio(transcribedText) {
    const msg = createMockAudioMessage(transcribedText);
    await handleMessage(msg);
    return msg.replies;
}

function resetState() {
    resetSheets();
    rateLimiter.isAllowed = originalRateLimiterIsAllowed;
    userStateManager.deleteState(SENDER);
    userStateManager.deleteState(PARTNER_SENDER);
    messageHandlerTest.clearSenderMessageQueueForTests();
    historicalAmbiguityRuntimeTest.setRuntimeForTests(null);
    if (typeof userService.invalidateUserCaches === 'function') {
        userService.invalidateUserCaches();
    }
}

stateMachineTest('public handler consumes an eligible historical ambiguity reply before every financial writer', async () => {
    resetState();
    const calls = [];
    historicalAmbiguityRuntimeTest.setRuntimeForTests({
        handlePublicReply({ actorWhatsappId, body }) {
            calls.push({ actorWhatsappId, body });
            return {
                handled: true,
                reply: 'Ambiguidades pendentes (2): responda com o nÃºmero.',
                financial_writes: 0
            };
        }
    });
    const msg = createMockMessage('dashboard');
    await handleMessage(msg);

    assert.deepStrictEqual(calls, [{ actorWhatsappId: SENDER, body: 'dashboard' }]);
    assert.match(msg.replies.at(-1), /Ambiguidades pendentes/);
    assert.strictEqual(appendedRows.length, 0);
    assert.strictEqual(structuredResponses.length, 0);
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});

stateMachineTest('public handler consumes one explicit Gate 36 review ahead of active financial state and every writer', async () => {
    resetState();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-public-gate36-review-'));
    const databasePath = path.join(directory, 'preview.sqlite');
    const secretPath = path.join(directory, 'secret.txt');
    const secret = 'state-machine-proactive-review-secret-2026';
    fs.writeFileSync(secretPath, secret, { mode: 0o600 });
    const item = {
        id: 'item-daniel', alias_code: 'daniel_nubank', generation: 1,
        accounts: [{ id: 'bank-daniel', type: 'BANK' }],
        transactions: [{ id: 'income-one', account_id: 'bank-daniel', amount_cents: 5000,
            description: 'Crédito legítimo', date: '2026-08-09T12:00:00.000Z', status: 'POSTED' }]
    };
    const observationRef = crypto.createHmac('sha256', secret)
        .update('observation:item-daniel:bank-daniel:income-one')
        .digest('hex').slice(0, 32);
    const store = new OpenFinanceProactiveReviewStore({
        databasePath, secret, clock: () => new Date('2026-08-09T13:00:00.000Z')
    });
    let code;
    try {
        code = store.ingest({
            reviews: [{ observation_ref: observationRef, source_alias: 'daniel_nubank',
                generation: 1, classification: 'income_candidate', review_kind: 'income',
                review_status: 'classification_required', save_eligible: false,
                financial_writes: 0 }],
            items: [item],
            policies: [{ alias: 'daniel_nubank', principal: 'daniel', recipients: ['daniel'] }],
            confirmationActors: [{ principal: 'daniel', whatsappId: SENDER }],
            observedAt: '2026-08-09T13:00:00.000Z'
        }).links[0].review_code;
    } finally {
        store.close();
    }
    const previous = {
        mode: process.env.OPEN_FINANCE_SAVE_PROPOSAL_MODE,
        secret: process.env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE,
        preview: process.env.OPEN_FINANCE_SHADOW_PREVIEW_DB
    };
    process.env.OPEN_FINANCE_SAVE_PROPOSAL_MODE = 'prompt';
    process.env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE = secretPath;
    process.env.OPEN_FINANCE_SHADOW_PREVIEW_DB = databasePath;
    try {
        userStateManager.setState(SENDER, {
            action: 'awaiting_payment_method',
            data: { amount: 99, description: 'must not be written' }
        });
        const msg = createMockMessage(`revisar ${code} entrada`);
        await handleMessage(msg);
        assert.match(msg.replies.at(-1), /Decisão registrada para futura conferência/);
        assert.strictEqual(appendedRows.length, 0);
        assert.strictEqual(structuredResponses.length, 0);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_payment_method');
        const reopened = new OpenFinanceProactiveReviewStore({ databasePath, secret });
        try {
            assert.strictEqual(reopened.stats().decided, 1);
        } finally {
            reopened.close();
        }
    } finally {
        if (previous.mode === undefined) delete process.env.OPEN_FINANCE_SAVE_PROPOSAL_MODE;
        else process.env.OPEN_FINANCE_SAVE_PROPOSAL_MODE = previous.mode;
        if (previous.secret === undefined) delete process.env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE;
        else process.env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE = previous.secret;
        if (previous.preview === undefined) delete process.env.OPEN_FINANCE_SHADOW_PREVIEW_DB;
        else process.env.OPEN_FINANCE_SHADOW_PREVIEW_DB = previous.preview;
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

stateMachineTest('real backfill, handler, runtime, review store and outbox reject a pre-attempt reply before writers', async () => {
    resetState();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-public-historical-review-'));
    const current = new Date('2026-08-05T18:00:00.000Z');
    const reviewStore = new OpenFinanceHistoricalAmbiguityReviewStore({
        databasePath: path.join(directory, 'review.sqlite'),
        secret: HISTORICAL_REVIEW_SECRET,
        familyScope: 'family',
        authorizedWhatsAppIds: [SENDER, PARTNER_SENDER],
        clock: () => current
    });
    const outbox = new SchedulerMessageOutbox({
        databasePath: path.join(directory, 'outbox.sqlite'),
        encryptionKey: process.env.STATE_STORE_ENCRYPTION_KEY
    });
    const runtime = new OpenFinanceHistoricalAmbiguityWhatsappRuntime({
        reviewStore,
        outbox,
        client: { sendMessage: async (_to, _message) => ({ id: 'confirmed' }) },
        authorizedWhatsAppIds: [SENDER, PARTNER_SENDER],
        clock: () => current
    });
    historicalAmbiguityRuntimeTest.setRuntimeForTests(runtime);
    try {
        await runtime.prepareAndDeliver({
            sealedState: buildStateMachineHistoricalCandidate(() => current).sealed_state
        });
        const attemptedAtSeconds = current.getTime() / 1000;
        const stale = createMockMessage('1');
        stale.timestamp = attemptedAtSeconds - 1;
        stale.id.fromMe = false;
        const currentReply = createMockMessage('1');
        currentReply.timestamp = attemptedAtSeconds + 1;
        currentReply.id.fromMe = false;

        const result = await backfillUnreadMessages({
            getChats: async () => [{
                unreadCount: 2,
                fetchMessages: async () => [currentReply, stale]
            }]
        }, handleMessageForBackfill, {
            delayMs: 0,
            retryDelayMs: 0,
            maxAttempts: 1,
            maxPerChat: 2
        });

        assert.strictEqual(result.processed, 2);
        assert.match(stale.replies.at(-1), /anterior.*revis.o/i);
        assert.match(currentReply.replies.at(-1), /Escolha.*resolu/i);
        assert.deepStrictEqual(
            reviewStore.readPrivate({ actorWhatsappId: SENDER }).decisions,
            []
        );
        assert.strictEqual(appendedRows.length, 0);
        assert.strictEqual(structuredResponses.length, 0);
    } finally {
        historicalAmbiguityRuntimeTest.setRuntimeForTests(null);
        fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});

stateMachineTest('public handler preserves an existing conversation ahead of historical ambiguity routing', async () => {
    resetState();
    let historicalCalls = 0;
    historicalAmbiguityRuntimeTest.setRuntimeForTests({
        handlePublicReply() {
            historicalCalls += 1;
            return { handled: true, reply: 'nao deveria responder', financial_writes: 0 };
        }
    });
    userStateManager.setState(SENDER, { action: 'awaiting_payment_method', data: {} });
    const msg = createMockMessage('cancelar');
    await handleMessage(msg);

    assert.strictEqual(historicalCalls, 0);
    assert.match(msg.replies.at(-1), /cancelada/i);
    assert.strictEqual(appendedRows.length, 0);
});

stateMachineTest('historical ambiguity integrity failure blocks fallback and financial writers', async () => {
    resetState();
    historicalAmbiguityRuntimeTest.setRuntimeForTests({
        handlePublicReply() {
            throw new Error('private integrity failure');
        }
    });
    const msg = createMockMessage('1');
    await handleMessage(msg);

    assert.match(msg.replies.at(-1), /Nada foi salvo/i);
    assert.strictEqual(appendedRows.length, 0);
    assert.strictEqual(structuredResponses.length, 0);
});

stateMachineTest('9P.2 public serialized handler consumes one durable proposal reply without financial write', async () => {
    resetState();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-public-save-proposal-'));
    const paths = {
        secret: path.join(directory, 'secret.txt'),
        journal: path.join(directory, 'journal.sqlite'),
        preview: path.join(directory, 'preview.sqlite'),
        outbox: path.join(directory, 'outbox.sqlite')
    };
    const secret = 'open-finance-public-handler-secret-32-bytes';
    fs.writeFileSync(paths.secret, secret, { mode: 0o600 });
    const journal = new OpenFinanceRevocationJournal({
        databasePath: paths.journal,
        secret
    });
    const store = new OpenFinanceShadowPreviewStore({
        databasePath: paths.preview,
        secret,
        revocationJournal: journal,
        authorizedWhatsAppIds: [SENDER],
        confirmationActors: [{ principal: 'daniel', whatsappId: SENDER }]
    });
    const item = {
        id: 'public-handler-item',
        alias_code: 'daniel_nubank',
        generation: 2,
        accounts: [{ id: 'credit-account', type: 'CREDIT' }],
        transactions: [{
            id: 'public-handler-purchase',
            account_id: 'credit-account',
            amount_cents: 3490,
            description: 'Compra para confirmação pública',
            date: new Date(Date.now() - 3_600_000).toISOString(),
            status: 'POSTED'
        }]
    };
    const ref = observationRef(secret, item.id, 'credit-account', 'public-handler-purchase');
    const ingested = store.ingestSaveProposals({
        reconciliationDecisions: [{
            alias: 'daniel_nubank',
            observation_ref: ref,
            transaction_ref: 'public-handler-transaction',
            status: 'new',
            rule: 'no_candidate'
        }],
        lifecycleDecisions: [{
            observation_ref: ref,
            classification: 'purchase',
            provider_state: 'POSTED',
            lifecycle_milestone: 'first_posted'
        }],
        openFinanceItems: [item],
        policies: [{
            alias: 'daniel_nubank',
            write_confirmation_principal: 'daniel'
        }],
        observedAt: new Date(Date.now() - 60_000).toISOString(),
        includeProposalLinks: true
    });
    const proposalRef = ingested.proposal_links[0].proposal_ref;
    store.prepareSaveProposalConfirmation(proposalRef, { actorWhatsappId: SENDER });
    const outbox = new OpenFinanceAlertOutbox({
        databasePath: paths.outbox,
        secret
    });
    outbox.enqueue({
        candidates: [{
            observation_ref: ref,
            external_event_ref: 'public-handler-external-event',
            correlation_state: 'new_event',
            reconciliation_status: 'new'
        }],
        lifecycleDecisions: [{
            observation_ref: ref,
            classification: 'purchase',
            provider_state: 'POSTED',
            lifecycle_milestone: 'first_posted'
        }],
        items: [item],
        policies: [{
            alias: 'daniel_nubank',
            source_owner: 'daniel',
            authorized_viewers: ['daniel'],
            whatsapp_recipient: 'daniel',
            family_aggregation_allowed: false,
            write_confirmation_principal: 'daniel'
        }],
        baselineComplete: true,
        reconciliationRequired: true,
        saveProposalLinks: ingested.proposal_links
    });
    const claimed = outbox.claimNext({ canaryAlias: 'daniel_nubank' });
    outbox.acknowledgeDelivered({
        alertRef: claimed.alert_ref,
        leaseToken: claimed.lease_token,
        whatsappMessageId: 'public-handler-message-id'
    });
    outbox.close();
    store.close();
    journal.close();

    const variableNames = [
        'OPEN_FINANCE_SAVE_PROPOSAL_MODE',
        'OPEN_FINANCE_WRITE_MODE',
        'OPEN_FINANCE_LIVE_STAGING_SECRET_FILE',
        'OPEN_FINANCE_REVOCATION_JOURNAL_DB',
        'OPEN_FINANCE_SHADOW_PREVIEW_DB',
        'OPEN_FINANCE_OUTBOX_DB'
    ];
    const previous = Object.fromEntries(variableNames.map(name => [name, process.env[name]]));
    Object.assign(process.env, {
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_WRITE_MODE: 'off',
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: paths.secret,
        OPEN_FINANCE_REVOCATION_JOURNAL_DB: paths.journal,
        OPEN_FINANCE_SHADOW_PREVIEW_DB: paths.preview,
        OPEN_FINANCE_OUTBOX_DB: paths.outbox
    });
    userStateManager.setState(SENDER, {
        action: 'awaiting_open_finance_save_confirmation',
        data: { proposalRef }
    });
    try {
        const reply = await send('sim');
        assert.match(reply, /Confira a proposta/);
        assert.match(reply, /Nada foi salvo/);
        assert.strictEqual(appendedRows.length, 0);
        assert.strictEqual(
            userStateManager.getState(SENDER).action,
            'awaiting_open_finance_save_review'
        );

        userStateManager.setState(SENDER, {
            action: 'awaiting_open_finance_save_confirmation',
            data: { proposalRef }
        });
        const routedAfterStaleState = await send('2');
        assert.match(routedAfterStaleState, /Escolha a categoria/);
        assert.match(routedAfterStaleState, /Criar nova categoria/i);
        assert.match(await send('1'), /nome da nova categoria/i);
        assert.match(await send('Pets'), /Categoria: Pets/i);
        assert.strictEqual(appendedRows.length, 0);
        assert.strictEqual(
            userStateManager.getState(SENDER).action,
            'awaiting_open_finance_save_review'
        );

        const reopenedJournal = new OpenFinanceRevocationJournal({
            databasePath: paths.journal,
            secret
        });
        const reopenedStore = new OpenFinanceShadowPreviewStore({
            databasePath: paths.preview,
            secret,
            revocationJournal: reopenedJournal,
            authorizedWhatsAppIds: [SENDER],
            confirmationActors: [{ principal: 'daniel', whatsappId: SENDER }]
        });
        const reopenedReviewStore = new OpenFinanceSaveProposalReviewStore({
            databasePath: paths.preview,
            secret,
            authorizedWhatsAppIds: [SENDER]
        });
        try {
            assert.strictEqual(reopenedStore.stats().save_confirmations_accepted, 1);
            assert.strictEqual(reopenedStore.stats().financial_writes, 0);
            assert.strictEqual(
                reopenedReviewStore.listActiveReviews({ actorWhatsappId: SENDER })[0].state,
                'editing'
            );
            const durableReview = reopenedReviewStore.readReviewPrivate(
                proposalRef,
                { actorWhatsappId: SENDER }
            );
            assert.strictEqual(durableReview.payload.step, 'menu');
            assert.deepStrictEqual(durableReview.payload.draft.category, {
                id: 'new-category:pets',
                label: 'Pets',
                category: 'Pets',
                subcategory: '',
                origin: 'user_created'
            });
        } finally {
            reopenedReviewStore.close();
            reopenedStore.close();
            reopenedJournal.close();
        }
    } finally {
        for (const name of variableNames) {
            if (previous[name] === undefined) delete process.env[name];
            else process.env[name] = previous[name];
        }
        userStateManager.deleteState(SENDER);
    }
});

function readReliabilityTelemetryEntries() {
    if (!fs.existsSync(RELIABILITY_TELEMETRY_PATH)) return [];
    return fs.readFileSync(RELIABILITY_TELEMETRY_PATH, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .map(line => JSON.parse(line));
}

function readCommandCanaryTelemetryEntries() {
    if (!fs.existsSync(COMMAND_CANARY_TELEMETRY_PATH)) return [];
    return fs.readFileSync(COMMAND_CANARY_TELEMETRY_PATH, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .map(line => JSON.parse(line));
}
stateMachineTest('financial states: payment method writes expense with user_id and clears state', async () => {
    resetState();
    userStateManager.setState(SENDER, {
        action: 'awaiting_payment_method',
        data: {
            gasto: {
                data: '10/02/2026',
                descricao: 'lanche',
                categoria: 'Alimentação',
                subcategoria: 'PADARIA / LANCHE',
                valor: 80,
                recorrente: 'Não'
            }
        }
    });

    const reply = await send('pix');

    assert.match(reply, /registrado/i);
    assert.strictEqual(sheets.Saídas.length, 2);
    assert.strictEqual(sheets.Saídas[1][9], USER_ID);
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});

stateMachineTest('financial states: payment method asks explicit financial account when accounts exist', async () => {
    resetState();
    sheets['Contas Financeiras'].push(
        ['Daniel - Nubank', 'bank', '1000,00', '03/07/2026', 'active', 'BRL', 'Usuario Estado', USER_ID, 'Principal'],
        ['Daniel - Carteira', 'cash', '50,00', '03/07/2026', 'active', 'BRL', 'Usuario Estado', USER_ID, 'Dinheiro']
    );
    userStateManager.setState(SENDER, {
        action: 'awaiting_payment_method',
        data: {
            gasto: {
                data: '10/02/2026',
                descricao: 'lanche',
                categoria: 'Alimentação',
                subcategoria: 'PADARIA / LANCHE',
                valor: 80,
                recorrente: 'Não'
            }
        }
    });

    const accountQuestion = await send('pix');

    assert.match(accountQuestion, /conta financeira/i);
    assert.match(accountQuestion, /1\. Daniel - Nubank/i);
    assert.match(accountQuestion, /2\. Daniel - Carteira/i);
    assert.strictEqual(sheets.Saídas.length, 1);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_expense_financial_account');

    const savedReply = await send('2');

    assert.match(savedReply, /registrado/i);
    assert.strictEqual(sheets.Saídas.length, 2);
    assert.strictEqual(sheets.Saídas[1][6], 'PIX');
    assert.strictEqual(sheets.Saídas[1][9], USER_ID);
    assert.strictEqual(sheets.Saídas[1][10], 'Daniel - Carteira');
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});
stateMachineTest('financial states: command planner canary registers recurring bill payment only for an allowlisted user', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    const previousCanaryUserIds = process.env.FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'canary';
    process.env.FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS = USER_ID;
    sheets.Contas.push([
        'Claro Residencial',
        '10',
        '',
        USER_ID,
        'Conta de telefone',
        'Moradia',
        'INTERNET / TELEFONE',
        '469,09',
        'SIM'
    ]);
    enqueueStructuredResponse({
        schemaVersion: 'financial-command-plan-v1',
        operation: 'bill.pay',
        entities: {
            description: 'conta de telefone',
            amount: 469.09,
            date: '25/06/2026',
            paymentMethod: null
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'explicit',
            date: 'explicit',
            paymentMethod: 'missing'
        },
        contextRequests: [{ tool: 'match_recurring_bill', query: 'conta de telefone' }],
        missingFields: ['paymentMethod'],
        requiresConfirmation: true
    });

    try {
        const methodQuestion = await send('Paguei 469,09 da conta de telefone');
        assert.match(methodQuestion, /conta recorrente/i);
        assert.match(methodQuestion, /forma de pagamento/i);
        assert.doesNotMatch(methodQuestion, /categoria/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_bill_payment_method');

        const confirmationQuestion = await send('Pix');
        assert.match(confirmationQuestion, /confirma/i);
        assert.match(confirmationQuestion, /Conta de telefone/i);
        assert.doesNotMatch(confirmationQuestion, /categoria/i);
        assert.strictEqual(sheets.Saídas.length, 1);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_bill_payment');

        const savedReply = await send('sim');
        assert.match(savedReply, /conta recorrente/i);
        assert.strictEqual(sheets.Saídas.length, 2);
        assert.deepStrictEqual(sheets.Saídas[1], [
            '25/06/2026',
            'Conta de telefone',
            'Moradia',
            'INTERNET / TELEFONE',
            469.09,
            'Usuario Estado',
            'PIX',
            'SIM',
            'Conta recorrente registrada pelo command planner.',
            USER_ID
        ]);
        assert.strictEqual(userStateManager.getState(SENDER), undefined);
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
        if (previousCanaryUserIds === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS;
        else process.env.FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS = previousCanaryUserIds;
    }
});

stateMachineTest('financial states: command planner promotes a strong payment verb to a matched recurring bill', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'route';
    sheets.Contas.push([
        'Gás', '10', '', USER_ID, 'Gás', 'Moradia', 'GÁS', '100,00', 'SIM'
    ]);
    enqueueStructuredResponse({
        schemaVersion: 'financial-command-plan-v1',
        operation: 'expense.create',
        entities: {
            description: 'gás',
            amount: 12.41,
            date: '27/06/2026',
            paymentMethod: 'Débito'
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'explicit',
            date: 'explicit',
            paymentMethod: 'explicit'
        },
        contextRequests: [],
        missingFields: [],
        requiresConfirmation: true
    });

    try {
        const reply = await send('Paguei 12,41 do gás no débito');

        assert.match(reply, /conta recorrente.*Gás/is);
        assert.match(reply, /confirma/i);
        assert.doesNotMatch(reply, /\[Gasto\]/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_bill_payment');
        assert.strictEqual(sheets.Saídas.length, 1);

        assert.match(await send('não'), /cancelad/i);
        assert.strictEqual(sheets.Saídas.length, 1);
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
    }
});

stateMachineTest('financial states: ambiguous recurring bill lists candidates and accepts a numbered choice', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'route';
    sheets.Contas.push(
        ['Mensal do ap', '10', '', USER_ID, 'Mensal do ap', 'Moradia', 'PARCELA', '100,00', 'SIM'],
        ['Taxa de obra do ap', '15', '', USER_ID, 'Taxa de obra do ap', 'Moradia', 'TAXA', '200,00', 'SIM']
    );
    enqueueStructuredResponse({
        schemaVersion: 'financial-command-plan-v1',
        operation: 'bill.pay',
        entities: {
            description: 'conta do ap',
            amount: 12.47,
            date: '27/06/2026',
            paymentMethod: null
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'explicit',
            date: 'explicit',
            paymentMethod: 'missing'
        },
        contextRequests: [{ tool: 'match_recurring_bill', query: 'conta do ap' }],
        missingFields: ['paymentMethod'],
        requiresConfirmation: true
    });

    try {
        const choiceQuestion = await send('Paguei 12,47 da conta do ap');

        assert.match(choiceQuestion, /1\..*Mensal do ap/is);
        assert.match(choiceQuestion, /2\..*Taxa de obra do ap/is);
        assert.match(choiceQuestion, /número/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_bill_payment_selection');
        assert.strictEqual(sheets.Saídas.length, 1);

        const methodQuestion = await send('2');
        assert.match(methodQuestion, /Taxa de obra do ap/i);
        assert.match(methodQuestion, /forma de pagamento/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_bill_payment_method');

        assert.match(await send('Pix'), /confirma/i);
        assert.match(await send('não'), /cancelad/i);
        assert.strictEqual(sheets.Saídas.length, 1);
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
    }
});

stateMachineTest('financial states: command planner route can cancel recurring bill payment without writing', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'route';
    sheets.Contas.push([
        'Claro Residencial',
        '10',
        '',
        USER_ID,
        'Conta de telefone',
        'Moradia',
        'INTERNET / TELEFONE',
        '469,09',
        'SIM'
    ]);
    enqueueStructuredResponse({
        schemaVersion: 'financial-command-plan-v1',
        operation: 'bill.pay',
        entities: {
            description: 'conta de telefone',
            amount: 469.09,
            date: '25/06/2026',
            paymentMethod: null
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'explicit',
            date: 'explicit',
            paymentMethod: 'missing'
        },
        contextRequests: [{ tool: 'match_recurring_bill', query: 'conta de telefone' }],
        missingFields: ['paymentMethod'],
        requiresConfirmation: true
    });

    try {
        assert.match(await send('Paguei 469,09 da conta de telefone'), /forma de pagamento/i);
        assert.match(await send('Pix'), /confirma/i);

        const reply = await send('não');

        assert.match(reply, /cancelad/i);
        assert.strictEqual(sheets.Saídas.length, 1);
        assert.strictEqual(appendedRows.length, 0);
        assert.strictEqual(userStateManager.getState(SENDER), undefined);
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
    }
});

stateMachineTest('financial states: command planner route uses stable write key for recurring bill payment replay', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'route';
    sheets.Contas.push([
        'Claro Residencial',
        '10',
        '',
        USER_ID,
        'Conta de telefone',
        'Moradia',
        'INTERNET / TELEFONE',
        '469,09',
        'SIM'
    ]);
    enqueueStructuredResponse({
        schemaVersion: 'financial-command-plan-v1',
        operation: 'bill.pay',
        entities: {
            description: 'conta de telefone',
            amount: 469.09,
            date: '25/06/2026',
            paymentMethod: null
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'explicit',
            date: 'explicit',
            paymentMethod: 'missing'
        },
        contextRequests: [{ tool: 'match_recurring_bill', query: 'conta de telefone' }],
        missingFields: ['paymentMethod'],
        requiresConfirmation: true
    });

    try {
        assert.match(await send('Paguei 469,09 da conta de telefone'), /forma de pagamento/i);
        assert.match(await send('Pix'), /confirma/i);
        const staleConfirmationState = userStateManager.getState(SENDER);

        assert.match(await send('sim'), /registrado/i);
        assert.strictEqual(sheets.Saídas.length, 2);
        assert.strictEqual(appendedRows.length, 1);
        assert.ok(appendedRows[0].options.operationKey, 'expected bill payment writes to carry an operation key');

        userStateManager.setState(SENDER, staleConfirmationState);
        assert.match(await send('sim'), /registrado/i);

        assert.strictEqual(sheets.Saídas.length, 2);
        assert.strictEqual(appendedRows.length, 1);
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
    }
});
stateMachineTest('financial states: command planner debt.pay confirms before updating the scoped debt', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'route';
    const debtRow = [
        'Financiamento Teste', 'Banco Teste', 'Financiamento', 1000, 1000, 200,
        '2% a.m.', 10, '01/01/2026', 5, 0, 'Ativa', '', '0%', '', '', '', USER_ID
    ];
    sheets.Dívidas.push(debtRow);
    enqueueStructuredResponse({
        schemaVersion: 'financial-command-plan-v1',
        operation: 'debt.pay',
        entities: {
            description: 'Financiamento Teste',
            amount: 200,
            date: '27/06/2026',
            paymentMethod: 'PIX'
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'explicit',
            date: 'explicit',
            paymentMethod: 'explicit'
        },
        contextRequests: [{ tool: 'match_debt', query: 'Financiamento Teste' }],
        missingFields: [],
        requiresConfirmation: true
    });

    try {
        const confirmationQuestion = await send('Paguei 200 da dívida Financiamento Teste');

        assert.match(confirmationQuestion, /dívida.*Financiamento Teste/is);
        assert.match(confirmationQuestion, /R\$ ?200,00/i);
        assert.match(confirmationQuestion, /confirma/i);
        assert.strictEqual(Number(sheets.Dívidas[1][4]), 1000);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_debt_payment');

        const savedReply = await send('sim');

        assert.match(savedReply, /pagamento.*dívida/i);
        assert.match(savedReply, /saldo devedor.*R\$ ?800,00/i);
        assert.strictEqual(Number(sheets.Dívidas[1][4]), 800);
        assert.strictEqual(sheets.Dívidas[1][13], '20.00%');
        assert.strictEqual(userStateManager.getState(SENDER), undefined);
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
    }
});
stateMachineTest('financial states: command planner debt.pay cancellation and stale replay do not reduce the debt twice', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'route';
    const debtRow = [
        'Empréstimo Teste', 'Banco Teste', 'Empréstimo', 1000, 1000, 100,
        '1% a.m.', 10, '01/01/2026', 10, 0, 'Ativa', '', '0%', '', '', '', USER_ID
    ];
    sheets.Dívidas.push(debtRow);
    const debtPlan = {
        schemaVersion: 'financial-command-plan-v1',
        operation: 'debt.pay',
        entities: {
            description: 'Empréstimo Teste',
            amount: 100,
            date: '27/06/2026',
            paymentMethod: 'PIX'
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'explicit',
            date: 'explicit',
            paymentMethod: 'explicit'
        },
        contextRequests: [{ tool: 'match_debt', query: 'Empréstimo Teste' }],
        missingFields: [],
        requiresConfirmation: true
    };

    try {
        enqueueStructuredResponse(debtPlan);
        assert.match(await send('Paguei 100 da dívida Empréstimo Teste'), /confirma/i);
        assert.match(await send('não'), /cancelad/i);
        assert.strictEqual(Number(sheets.Dívidas[1][4]), 1000);
        assert.strictEqual(seenUpdateOperationKeys.size, 0);

        enqueueStructuredResponse(debtPlan);
        assert.match(await send('Paguei 100 da dívida Empréstimo Teste'), /confirma/i);
        const staleConfirmationState = userStateManager.getState(SENDER);
        assert.match(await send('sim'), /saldo devedor.*R\$ ?900,00/i);
        assert.strictEqual(Number(sheets.Dívidas[1][4]), 900);

        userStateManager.setState(SENDER, staleConfirmationState);
        assert.match(await send('sim'), /já havia sido registrado/i);
        assert.strictEqual(Number(sheets.Dívidas[1][4]), 900);
        assert.strictEqual(seenUpdateOperationKeys.size, 1);
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
    }
});
stateMachineTest('financial states: command planner debt.pay asks for a missing amount and keeps the matched debt', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'route';
    sheets.Dívidas.push([
        'Financiamento Teste', 'Banco Teste', 'Financiamento', 1000, 1000, 200,
        '2% a.m.', 10, '01/01/2026', 5, 0, 'Ativa', '', '0%', '', '', '', USER_ID
    ]);
    enqueueStructuredResponse({
        schemaVersion: 'financial-command-plan-v1',
        operation: 'debt.pay',
        entities: {
            description: 'Financiamento Teste',
            amount: null,
            date: '27/06/2026',
            paymentMethod: null
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'missing',
            date: 'explicit',
            paymentMethod: 'missing'
        },
        contextRequests: [{ tool: 'match_debt', query: 'Financiamento Teste' }],
        missingFields: ['amount'],
        requiresConfirmation: true
    });

    try {
        const amountQuestion = await send('Paguei a dívida Financiamento Teste');
        assert.match(amountQuestion, /qual.*valor/i);
        assert.match(amountQuestion, /Financiamento Teste/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_debt_payment_amount');
        assert.strictEqual(Number(sheets.Dívidas[1][4]), 1000);

        assert.match(await send('200'), /confirma/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_debt_payment');
        assert.match(await send('não'), /cancelad/i);
        assert.strictEqual(Number(sheets.Dívidas[1][4]), 1000);
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
    }
});
stateMachineTest('financial states: command planner debt.pay lists ambiguous debts and accepts a numbered choice', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'route';
    sheets.Dívidas.push(
        ['Empréstimo Casa', 'Banco A', 'Empréstimo', 1000, 900, 100, '', 10, '', 10, 1, 'Ativa', '', '10%', '', '', '', USER_ID],
        ['Empréstimo Carro', 'Banco B', 'Empréstimo', 2000, 1800, 200, '', 15, '', 10, 1, 'Ativa', '', '10%', '', '', '', USER_ID]
    );
    enqueueStructuredResponse({
        schemaVersion: 'financial-command-plan-v1',
        operation: 'debt.pay',
        entities: {
            description: 'empréstimo',
            amount: 100,
            date: '27/06/2026',
            paymentMethod: null
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'explicit',
            date: 'explicit',
            paymentMethod: 'missing'
        },
        contextRequests: [{ tool: 'match_debt', query: 'empréstimo' }],
        missingFields: [],
        requiresConfirmation: true
    });

    try {
        const choiceQuestion = await send('Paguei 100 do empréstimo');
        assert.match(choiceQuestion, /1\..*Empréstimo Casa/is);
        assert.match(choiceQuestion, /2\..*Empréstimo Carro/is);
        assert.match(choiceQuestion, /número/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_debt_payment_selection');

        const confirmationQuestion = await send('2');
        assert.match(confirmationQuestion, /Empréstimo Carro/i);
        assert.match(confirmationQuestion, /confirma/i);
        assert.match(await send('não'), /cancelad/i);
        assert.strictEqual(Number(sheets.Dívidas[1][4]), 900);
        assert.strictEqual(Number(sheets.Dívidas[2][4]), 1800);
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
    }
});
stateMachineTest('financial states: command planner invoice.pay records a transfer without duplicating expense', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'route';
    sheets['Lançamentos Cartão'] = [
        ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'card_id', 'Cartão', 'Status', 'user_id'],
        ['10/06/2026', 'Compra Teste', 'Outros', 850, '1/1', '06/2026', 'nubank-daniel', 'Nubank Daniel', 'Aberta', USER_ID]
    ];
    enqueueStructuredResponse({
        schemaVersion: 'financial-command-plan-v1',
        operation: 'invoice.pay',
        entities: {
            description: 'fatura do Nubank Daniel',
            amount: 850,
            date: '27/06/2026',
            paymentMethod: 'PIX'
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'explicit',
            date: 'explicit',
            paymentMethod: 'explicit'
        },
        contextRequests: [{ tool: 'match_card_invoice', query: 'fatura do Nubank Daniel' }],
        missingFields: [],
        requiresConfirmation: true
    });

    try {
        const confirmationQuestion = await send('Paguei 850 da fatura do Nubank Daniel via Pix');
        assert.match(confirmationQuestion, /fatura.*Nubank Daniel/is);
        assert.match(confirmationQuestion, /R\$ ?850,00/i);
        assert.match(confirmationQuestion, /confirma/i);
        assert.strictEqual(sheets.Saídas.length, 1);
        assert.strictEqual(sheets.Transferências.length, 1);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_invoice_payment');

        const savedReply = await send('sim');
        assert.match(savedReply, /pagamento.*fatura/i);
        assert.strictEqual(sheets.Saídas.length, 1);
        assert.strictEqual(sheets.Transferências.length, 2);
        assert.deepStrictEqual(sheets.Transferências[1], [
            '27/06/2026',
            'Pagamento de fatura Nubank Daniel - 06/2026',
            850,
            '',
            'Nubank Daniel',
            'PIX',
            'Fatura identificada pelo command planner.',
            'Pagamento de fatura',
            USER_ID
        ]);
        assert.strictEqual(userStateManager.getState(SENDER), undefined);
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
    }
});
stateMachineTest('financial states: command planner invoice.pay asks explicit paying account before confirmation', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'route';
    sheets['Contas Financeiras'].push(
        ['Daniel - Nubank', 'bank', '1000,00', '03/07/2026', 'active', 'BRL', 'Usuario Estado', USER_ID, 'Principal'],
        ['Daniel - Carteira', 'cash', '50,00', '03/07/2026', 'active', 'BRL', 'Usuario Estado', USER_ID, 'Dinheiro']
    );
    sheets['Lançamentos Cartão'] = [
        ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'card_id', 'Cartão', 'Status', 'user_id'],
        ['10/06/2026', 'Compra Teste', 'Outros', 620, '1/1', '06/2026', 'nubank-daniel', 'Nubank Daniel', 'Aberta', USER_ID]
    ];
    enqueueStructuredResponse({
        schemaVersion: 'financial-command-plan-v1',
        operation: 'invoice.pay',
        entities: {
            description: 'fatura do Nubank Daniel',
            amount: 620,
            date: '27/06/2026',
            paymentMethod: 'PIX'
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'explicit',
            date: 'explicit',
            paymentMethod: 'explicit'
        },
        contextRequests: [{ tool: 'match_card_invoice', query: 'fatura do Nubank Daniel' }],
        missingFields: [],
        requiresConfirmation: true
    });

    try {
        const accountQuestion = await send('Paguei 620 da fatura do Nubank Daniel via Pix');
        assert.match(accountQuestion, /De qual conta financeira saiu/i);
        assert.match(accountQuestion, /1\. Daniel - Nubank/i);
        assert.match(accountQuestion, /2\. Daniel - Carteira/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_invoice_payment_financial_account');
        assert.strictEqual(sheets.Transferências.length, 1);

        const confirmation = await send('1');
        assert.match(confirmation, /Conta: \*Daniel - Nubank\*/i);
        assert.match(confirmation, /confirma/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_invoice_payment');

        const savedReply = await send('sim');
        assert.match(savedReply, /pagamento.*fatura/i);
        assert.strictEqual(sheets.Transferências.length, 2);
        assert.deepStrictEqual(sheets.Transferências[1], [
            '27/06/2026',
            'Pagamento de fatura Nubank Daniel - 06/2026',
            620,
            'Daniel - Nubank',
            'Nubank Daniel',
            'PIX',
            'Fatura identificada pelo command planner.',
            'Pagamento de fatura',
            USER_ID
        ]);
        assert.strictEqual(userStateManager.getState(SENDER), undefined);
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
    }
});
stateMachineTest('financial states: command planner invoice.pay asks for a missing payment method', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'route';
    sheets['Lançamentos Cartão'] = [
        ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'card_id', 'Cartão', 'Status', 'user_id'],
        ['10/06/2026', 'Compra Teste', 'Outros', 500, '1/1', '06/2026', 'nubank-daniel', 'Nubank Daniel', 'Aberta', USER_ID]
    ];
    enqueueStructuredResponse({
        schemaVersion: 'financial-command-plan-v1',
        operation: 'invoice.pay',
        entities: {
            description: 'fatura do Nubank Daniel',
            amount: 500,
            date: '27/06/2026',
            paymentMethod: null
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'explicit',
            date: 'explicit',
            paymentMethod: 'missing'
        },
        contextRequests: [{ tool: 'match_card_invoice', query: 'fatura do Nubank Daniel' }],
        missingFields: ['paymentMethod'],
        requiresConfirmation: true
    });

    try {
        const methodQuestion = await send('Paguei 500 da fatura do Nubank Daniel');
        assert.match(methodQuestion, /forma de pagamento/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_invoice_payment_method');
        assert.strictEqual(sheets.Transferências.length, 1);

        assert.match(await send('Pix'), /confirma/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_invoice_payment');
        assert.match(await send('não'), /cancelad/i);
        assert.strictEqual(sheets.Transferências.length, 1);
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
    }
});
stateMachineTest('financial states: command planner invoice.pay lists ambiguous invoices and accepts a numbered choice', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'route';
    sheets['Lançamentos Cartão'] = [
        ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'card_id', 'Cartão', 'Status', 'user_id'],
        ['10/06/2026', 'Compra Junho', 'Outros', 300, '1/1', '06/2026', 'nubank-daniel', 'Nubank Daniel', 'Aberta', USER_ID],
        ['10/07/2026', 'Compra Julho', 'Outros', 300, '1/1', '07/2026', 'nubank-daniel', 'Nubank Daniel', 'Aberta', USER_ID]
    ];
    enqueueStructuredResponse({
        schemaVersion: 'financial-command-plan-v1',
        operation: 'invoice.pay',
        entities: {
            description: 'fatura do Nubank Daniel',
            amount: 300,
            date: '27/06/2026',
            paymentMethod: 'PIX'
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'explicit',
            date: 'explicit',
            paymentMethod: 'explicit'
        },
        contextRequests: [{ tool: 'match_card_invoice', query: 'fatura do Nubank Daniel' }],
        missingFields: [],
        requiresConfirmation: true
    });

    try {
        const choiceQuestion = await send('Paguei 300 da fatura do Nubank Daniel via Pix');
        assert.match(choiceQuestion, /1\..*Nubank Daniel.*06\/2026/is);
        assert.match(choiceQuestion, /2\..*Nubank Daniel.*07\/2026/is);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_invoice_payment_selection');

        const confirmationQuestion = await send('2');
        assert.match(confirmationQuestion, /Nubank Daniel.*07\/2026/i);
        assert.match(confirmationQuestion, /confirma/i);
        assert.match(await send('não'), /cancelad/i);
        assert.strictEqual(sheets.Transferências.length, 1);
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
    }
});
stateMachineTest('financial states: command planner keeps an ordinary purchase out of debt and invoice payment flows', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'route';
    sheets.Dívidas.push([
        'Mercado Financiado', 'Banco Teste', 'Empréstimo', 1000, 1000, 100,
        '', 10, '', 10, 0, 'Ativa', '', '0%', '', '', '', USER_ID
    ]);
    sheets['Lançamentos Cartão'] = [
        ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'card_id', 'Cartão', 'Status', 'user_id'],
        ['10/06/2026', 'Compra Antiga', 'Outros', 50, '1/1', '06/2026', 'nubank-daniel', 'Nubank Daniel', 'Aberta', USER_ID]
    ];
    enqueueStructuredResponse({
        schemaVersion: 'financial-command-plan-v1',
        operation: 'expense.create',
        entities: {
            description: 'mercado',
            amount: 50,
            date: '27/06/2026',
            paymentMethod: 'PIX',
            category: 'Alimentação',
            subcategory: 'MERCADO'
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'explicit',
            date: 'explicit',
            paymentMethod: 'explicit'
        },
        contextRequests: [{ tool: 'resolve_category', query: 'mercado' }],
        missingFields: [],
        requiresConfirmation: true
    });

    try {
        const reply = await send('Gastei 50 no mercado no Pix');
        assert.match(reply, /confirma/i);
        assert.doesNotMatch(reply, /pagamento da dívida|pagamento da fatura/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_planned_expense');
        assert.strictEqual(sheets.Saídas.length, 1);
        assert.strictEqual(Number(sheets.Dívidas[1][4]), 1000);
        assert.strictEqual(sheets.Transferências.length, 1);

        assert.match(await send('não'), /cancelad/i);
        assert.strictEqual(sheets.Saídas.length, 1);
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
    }
});
stateMachineTest('financial states: planned debit expense asks explicit financial account before confirmation', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'route';
    sheets['Contas Financeiras'].push(
        ['Daniel - Nubank', 'bank', '1000,00', '03/07/2026', 'active', 'BRL', 'Usuario Estado', USER_ID, 'Principal'],
        ['Thais - Itaú', 'bank', '133,46', '03/07/2026', 'active', 'BRL', 'Thais', PARTNER_ID, 'Conta familiar']
    );
    financialScopeUserIds = [USER_ID, PARTNER_ID];
    enqueueStructuredResponse({
        schemaVersion: 'financial-command-plan-v1',
        operation: 'expense.create',
        entities: {
            description: 'mercado',
            amount: 50,
            date: '27/06/2026',
            paymentMethod: 'PIX',
            category: 'Alimentação',
            subcategory: 'SUPERMERCADO'
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'explicit',
            date: 'explicit',
            paymentMethod: 'explicit'
        },
        contextRequests: [{ tool: 'resolve_category', query: 'mercado' }],
        missingFields: [],
        requiresConfirmation: true
    });

    try {
        const accountQuestion = await send('Gastei 50 no mercado no Pix');
        assert.match(accountQuestion, /conta financeira/i);
        assert.match(accountQuestion, /1\. Daniel - Nubank/i);
        assert.match(accountQuestion, /2\. Thais - Itaú/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_planned_expense_financial_account');
        assert.strictEqual(sheets.Saídas.length, 1);

        const confirmation = await send('2');
        assert.match(confirmation, /Confirma/i);
        assert.match(confirmation, /Conta: \*Thais - Itaú\*/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_planned_expense');

        const savedReply = await send('sim');
        assert.match(savedReply, /registrado/i);
        assert.strictEqual(sheets.Saídas.length, 2);
        assert.strictEqual(sheets.Saídas[1][10], 'Thais - Itaú');
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
        financialScopeUserIds = [USER_ID];
    }
});
stateMachineTest('financial states: adversarial command planner keeps unmatched bill payment out of ordinary expense writes', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'route';
    enqueueStructuredResponse({
        schemaVersion: 'financial-command-plan-v1',
        operation: 'bill.pay',
        entities: {
            description: 'conta fantasma teste',
            amount: 77.77,
            date: '30/06/2026',
            paymentMethod: 'PIX',
            category: 'Alimentação',
            subcategory: 'SUPERMERCADO'
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'explicit',
            date: 'explicit',
            paymentMethod: 'explicit'
        },
        contextRequests: [{ tool: 'match_recurring_bill', query: 'conta fantasma teste' }],
        missingFields: [],
        requiresConfirmation: true
    });

    try {
        const reply = await send('Paguei 77,77 da conta fantasma teste via Pix');
        assert.match(reply, /conta recorrente/i);
        assert.match(reply, /não encontrei|nao encontrei/i);
        assert.strictEqual(sheets.Saídas.length, 1);
        assert.strictEqual(sheets.Transferências.length, 1);
        assert.strictEqual(userStateManager.getState(SENDER), undefined);
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
    }
});

stateMachineTest('financial states: adversarial command planner rejects debt payments above the current balance', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'route';
    sheets.Dívidas.push([
        'Empréstimo Baixo', 'Banco Teste', 'Empréstimo', 100, 50, 10,
        '', 10, '', 10, 1, 'Ativa', '', '50%', '', '', '', USER_ID
    ]);
    enqueueStructuredResponse({
        schemaVersion: 'financial-command-plan-v1',
        operation: 'debt.pay',
        entities: {
            description: 'Empréstimo Baixo',
            amount: 80,
            date: '30/06/2026',
            paymentMethod: 'PIX'
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'explicit',
            date: 'explicit',
            paymentMethod: 'explicit'
        },
        contextRequests: [{ tool: 'match_debt', query: 'Empréstimo Baixo' }],
        missingFields: [],
        requiresConfirmation: true
    });

    try {
        const reply = await send('Paguei 80 da dívida Empréstimo Baixo via Pix');
        assert.match(reply, /valor.*inválido|acima do saldo/i);
        assert.strictEqual(Number(sheets.Dívidas[1][4]), 50);
        assert.strictEqual(seenUpdateOperationKeys.size, 0);
        assert.strictEqual(userStateManager.getState(SENDER), undefined);
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
    }
});

stateMachineTest('financial states: adversarial command planner does not save invoice payment with credit as cash movement', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'route';
    sheets['Lançamentos Cartão'] = [
        ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'card_id', 'Cartão', 'Status', 'user_id'],
        ['10/06/2026', 'Compra Teste', 'Outros', 400, '1/1', '06/2026', 'nubank-daniel', 'Nubank Daniel', 'Aberta', USER_ID]
    ];
    enqueueStructuredResponse({
        schemaVersion: 'financial-command-plan-v1',
        operation: 'invoice.pay',
        entities: {
            description: 'fatura do Nubank Daniel',
            amount: 400,
            date: '30/06/2026',
            paymentMethod: 'Crédito'
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'explicit',
            date: 'explicit',
            paymentMethod: 'explicit'
        },
        contextRequests: [{ tool: 'match_card_invoice', query: 'fatura do Nubank Daniel' }],
        missingFields: [],
        requiresConfirmation: true
    });

    try {
        const methodQuestion = await send('Paguei 400 da fatura do Nubank Daniel no crédito');
        assert.match(methodQuestion, /forma de pagamento/i);
        assert.match(methodQuestion, /Débito, PIX ou Dinheiro/i);
        assert.strictEqual(sheets.Transferências.length, 1);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_invoice_payment_method');

        assert.match(await send('não'), /forma de pagamento/i);
        assert.strictEqual(sheets.Transferências.length, 1);
    } finally {
        userStateManager.deleteState(SENDER);
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
    }
});

stateMachineTest('financial states: adversarial command planner requires category choice before saving invented expense categories', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'route';
    enqueueStructuredResponse({
        schemaVersion: 'financial-command-plan-v1',
        operation: 'expense.create',
        entities: {
            description: 'assinatura secreta teste',
            amount: 19.99,
            date: '30/06/2026',
            paymentMethod: 'PIX',
            category: 'Categoria Inventada Pelo Modelo',
            subcategory: ''
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'explicit',
            date: 'explicit',
            paymentMethod: 'explicit'
        },
        contextRequests: [{ tool: 'resolve_category', query: 'assinatura secreta teste' }],
        missingFields: [],
        requiresConfirmation: true
    });

    try {
        const categoryQuestion = await send('Gastei 19,99 na assinatura secreta teste via Pix');
        assert.match(categoryQuestion, /Escolha uma (?:categoria|subcategoria) existente/i);
        assert.match(categoryQuestion, /Criar nova (?:categoria\/subcategoria|subcategoria em)/i);
        assert.doesNotMatch(categoryQuestion, /Categoria Inventada Pelo Modelo/i);
        assert.strictEqual(sheets.Saídas.length, 1);
        assert.ok(
            ['awaiting_planned_expense_category', 'awaiting_expense_category'].includes(userStateManager.getState(SENDER).action),
            'should wait for an explicit category choice before saving'
        );

        assert.match(await send('sim'), /Responda com o número/i);
        assert.strictEqual(sheets.Saídas.length, 1);
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
    }
});
stateMachineTest('financial states: command planner auto-confirms a uniquely resolved common expense category', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'route';
    enqueueStructuredResponse({
        schemaVersion: 'financial-command-plan-v1',
        operation: 'expense.create',
        entities: {
            description: 'mercado TESTE_APAGAR_PLANNER_WRITES_20260629_184200',
            amount: 12.33,
            date: '29/06/2026',
            paymentMethod: 'PIX',
            category: 'Outros',
            subcategory: ''
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'explicit',
            date: 'explicit',
            paymentMethod: 'explicit'
        },
        contextRequests: [{ tool: 'resolve_category', query: 'mercado TESTE_APAGAR_PLANNER_WRITES_20260629_184200' }],
        missingFields: [],
        requiresConfirmation: true
    });

    try {
        const reply = await send('Gastei 12,33 no mercado TESTE_APAGAR_PLANNER_WRITES_20260629_184200 via Pix');
        assert.doesNotMatch(reply, /Escolha uma categoria existente/i);
        assert.match(reply, /Categoria: \*Alimentação \/ SUPERMERCADO\*/i);
        assert.match(reply, /Confirma/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_planned_expense');
        assert.strictEqual(sheets.Saídas.length, 1);

        assert.match(await send('não'), /cancelad/i);
        assert.strictEqual(sheets.Saídas.length, 1);
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
    }
});

stateMachineTest('financial states: planned expense category clarification requires numbered existing option', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'route';
    enqueueStructuredResponse({
        schemaVersion: 'financial-command-plan-v1',
        operation: 'expense.create',
        entities: {
            description: 'mercado teste categoria',
            amount: 45,
            date: '27/06/2026',
            paymentMethod: 'PIX',
            category: 'Outros',
            subcategory: ''
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'explicit',
            date: 'explicit',
            paymentMethod: 'explicit'
        },
        contextRequests: [{ tool: 'resolve_category', query: 'mercado teste categoria' }],
        missingFields: [],
        requiresConfirmation: true
    });

    try {
        const categoryQuestion = await send('Gastei 45 no mercado teste categoria via Pix');
        assert.match(categoryQuestion, /parece ser Alimentação/i);
        assert.match(categoryQuestion, /Escolha uma subcategoria existente/i);
        const mercadoOption = categoryQuestion.match(/(^|\n)(\d+)\.\s*Alimentação\s*\/\s*SUPERMERCADO/im);
        assert.ok(mercadoOption, categoryQuestion);
        assert.match(categoryQuestion, /Criar nova subcategoria em Alimentação/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_planned_expense_category');
        assert.strictEqual(sheets.Saídas.length, 1);

        const rejectedFreeText = await send('banana espacial');
        assert.match(rejectedFreeText, /Responda com o número/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_planned_expense_category');
        assert.strictEqual(sheets.Saídas.length, 1);

        const confirmation = await send(mercadoOption[2]);
        assert.match(confirmation, /Categoria: \*Alimentação \/ SUPERMERCADO\*/i);
        assert.match(confirmation, /Confirma/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_planned_expense');
        assert.strictEqual(sheets.Saídas.length, 1);

        assert.match(await send('não'), /cancelad/i);
        assert.strictEqual(sheets.Saídas.length, 1);
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
    }
});

stateMachineTest('financial states: planned expense category clarification focuses inferred broad category subcategories', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'route';
    sheets.Categorias.push(['Alimentação', 'Comida na rua', 'SIM', '2026-07-01T00:00:00.000Z', USER_ID]);
    enqueueStructuredResponse({
        schemaVersion: 'financial-command-plan-v1',
        operation: 'expense.create',
        entities: {
            description: 'lanchando em petropolis',
            amount: 25,
            date: '28/06/2026',
            paymentMethod: 'PIX',
            category: 'Alimentação',
            subcategory: ''
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'explicit',
            date: 'explicit',
            paymentMethod: 'explicit'
        },
        contextRequests: [{ tool: 'resolve_category', query: 'lanchando em petropolis' }],
        missingFields: [],
        requiresConfirmation: true
    });

    try {
        const categoryQuestion = await send('Gastei 25 reais lanchando em petropolis no dia 28 de junho via Pix');
        assert.match(categoryQuestion, /parece ser Alimentação/i);
        assert.match(categoryQuestion, /Qual subcategoria/i);
        assert.match(categoryQuestion, /\d+\.\s*Alimentação\s*\/\s*Comida na rua/i);
        assert.match(categoryQuestion, /\d+\.\s*Alimentação\s*\/\s*SUPERMERCADO/i);
        assert.match(categoryQuestion, /\d+\.\s*Alimentação\s*\/\s*RESTAURANTE/i);
        assert.match(categoryQuestion, /\d+\.\s*Alimentação\s*\/\s*PADARIA \/ LANCHE/i);
        assert.doesNotMatch(categoryQuestion, /Transporte\s*\/\s*UBER/i);
        assert.doesNotMatch(categoryQuestion, /Moradia\s*\/\s*ALUGUEL/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_planned_expense_category');

        const comidaOption = categoryQuestion.match(/(^|\n)(\d+)\.\s*Alimentação\s*\/\s*Comida na rua/im);
        assert.ok(comidaOption, categoryQuestion);
        const confirmation = await send(comidaOption[2]);
        assert.match(confirmation, /Categoria: \*Alimentação \/ Comida na rua\*/i);
        assert.match(confirmation, /Data: \*28\/06\/2026\*/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_planned_expense');
        assert.strictEqual(sheets.Saídas.length, 1);

        assert.match(await send('não'), /cancelad/i);
        assert.strictEqual(sheets.Saídas.length, 1);
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
    }
});

stateMachineTest('financial states: planned focused category creation asks only for new subcategory', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'route';
    enqueueStructuredResponse({
        schemaVersion: 'financial-command-plan-v1',
        operation: 'expense.create',
        entities: {
            description: 'lanchando em petropolis',
            amount: 25,
            date: '28/06/2026',
            paymentMethod: 'PIX',
            category: 'Outros',
            subcategory: ''
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'explicit',
            date: 'explicit',
            paymentMethod: 'explicit'
        },
        contextRequests: [{ tool: 'resolve_category', query: 'lanchando em petropolis' }],
        missingFields: [],
        requiresConfirmation: true
    });

    try {
        const categoryQuestion = await send('Gastei 25 reais lanchando em petropolis no dia 28 de junho via Pix');
        const createOption = categoryQuestion.match(/(^|\n)(\d+)\.\s*Criar nova subcategoria em Alimentação/im);
        assert.ok(createOption, categoryQuestion);

        const subcategoryQuestion = await send(createOption[2]);
        assert.match(subcategoryQuestion, /nova subcategoria dentro de "Alimentação"/i);
        assert.doesNotMatch(subcategoryQuestion, /nome da nova categoria/i);

        const confirmation = await send('Comida na rua');
        assert.match(confirmation, /Categoria: \*Alimentação \/ Comida na rua\*/i);
        assert.match(confirmation, /Confirma/i);
        assert.strictEqual(sheets.Categorias.length, 1);

        assert.match(await send('sim'), /registrado/i);
        assert.strictEqual(sheets.Categorias.length, 2);
        assert.deepStrictEqual(sheets.Categorias[1].slice(0, 3), ['Alimentação', 'Comida na rua', 'SIM']);
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
    }
});
stateMachineTest('financial states: planned expense registers newly created category only after final confirmation', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'route';
    enqueueStructuredResponse({
        schemaVersion: 'financial-command-plan-v1',
        operation: 'expense.create',
        entities: {
            description: 'brecho raro teste',
            amount: 46,
            date: '27/06/2026',
            paymentMethod: 'PIX',
            category: 'Outros',
            subcategory: ''
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'explicit',
            date: 'explicit',
            paymentMethod: 'explicit'
        },
        contextRequests: [{ tool: 'resolve_category', query: 'brecho raro teste' }],
        missingFields: [],
        requiresConfirmation: true
    });

    try {
        const categoryQuestion = await send('Gastei 46 no brecho raro teste via Pix');
        assert.match(categoryQuestion, /Criar nova categoria\/subcategoria/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_planned_expense_category');

        assert.match(await send('criar nova'), /nome da nova categoria/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_expense_new_category_name');

        assert.match(await send('Hobbies'), /subcategoria dentro de "Hobbies"/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_expense_new_subcategory_name');

        const confirmation = await send('Colecionáveis');
        assert.match(confirmation, /Categoria: \*Hobbies \/ Colecionáveis\*/i);
        assert.match(confirmation, /Confirma/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_planned_expense');
        assert.strictEqual(sheets.Saídas.length, 1);
        assert.strictEqual(sheets.Categorias.length, 1);

        assert.match(await send('não'), /cancelad/i);
        assert.strictEqual(sheets.Saídas.length, 1);
        assert.strictEqual(sheets.Categorias.length, 1);

        enqueueStructuredResponse({
            schemaVersion: 'financial-command-plan-v1',
            operation: 'expense.create',
            entities: {
                description: 'brecho raro teste dois',
                amount: 47,
                date: '27/06/2026',
                paymentMethod: 'PIX',
                category: 'Outros',
                subcategory: ''
            },
            fieldEvidence: {
                description: 'explicit',
                amount: 'explicit',
                date: 'explicit',
                paymentMethod: 'explicit'
            },
            contextRequests: [{ tool: 'resolve_category', query: 'brecho raro teste dois' }],
            missingFields: [],
            requiresConfirmation: true
        });

        const persistedCategoryQuestion = await send('Gastei 47 no brecho raro teste dois via Pix');
        assert.doesNotMatch(persistedCategoryQuestion, /\d+\.\s*Hobbies\s*\/\s*Colecionáveis/i);
        assert.match(persistedCategoryQuestion, /Criar nova categoria\/subcategoria/i);

        assert.match(await send('criar nova'), /nome da nova categoria/i);
        assert.match(await send('Hobbies'), /subcategoria dentro de "Hobbies"/i);

        const secondConfirmation = await send('Colecionáveis');
        assert.match(secondConfirmation, /Categoria: \*Hobbies \/ Colecionáveis\*/i);
        assert.strictEqual(sheets.Categorias.length, 1);

        const savedReply = await send('sim');
        assert.match(savedReply, /registrado/i);
        assert.strictEqual(sheets.Saídas.length, 2);
        assert.strictEqual(sheets.Categorias.length, 2);
        assert.deepStrictEqual(sheets.Categorias[1].slice(0, 3), ['Hobbies', 'Colecionáveis', 'SIM']);
        assert.strictEqual(sheets.Categorias[1][4], USER_ID);
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
    }
});
stateMachineTest('financial states: planned category assist can continue with credit and preserve retroactive date', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'route';
    enqueueStructuredResponse({
        schemaVersion: 'financial-command-plan-v1',
        operation: 'expense.create',
        entities: {
            description: 'item catcredit',
            amount: 90.97,
            date: '01/07/2026',
            paymentMethod: null,
            category: 'Outros',
            subcategory: ''
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'explicit',
            date: 'explicit',
            paymentMethod: 'missing'
        },
        contextRequests: [{ tool: 'resolve_category', query: 'item catcredit' }],
        missingFields: ['paymentMethod'],
        requiresConfirmation: true
    });

    try {
        const categoryQuestion = await send('Gastei 90,97 no item catcredit no dia 28 de junho');
        assert.match(categoryQuestion, /Criar nova categoria\/subcategoria/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_planned_expense_category');

        assert.match(await send('criar nova'), /nome da nova categoria/i);
        assert.match(await send('Hobbies'), /subcategoria dentro de "Hobbies"/i);

        const paymentQuestion = await send('Passeios');
        assert.match(paymentQuestion, /forma de pagamento/i);
        assert.match(paymentQuestion, /Crédito/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_planned_expense_payment_method');
        assert.strictEqual(sheets.Categorias.length, 1);
        assert.strictEqual(sheets['Cartão Nubank - Thais'].length, 1);

        const cardQuestion = await send('crédito');
        assert.match(cardQuestion, /qual cartão/i);
        assert.match(cardQuestion, /Nubank Thais|nubank thais/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_planned_expense_credit_card_selection');

        const installmentsQuestion = await send('2');
        assert.match(installmentsQuestion, /parcelas/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_planned_expense_credit_installments');

        const confirmation = await send('1');
        assert.match(confirmation, /Confirma/i);
        assert.match(confirmation, /28\/06\/2026/);
        assert.match(confirmation, /Hobbies \/ Passeios/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_planned_credit_card_expense');
        assert.strictEqual(sheets.Categorias.length, 1);
        assert.strictEqual(sheets['Cartão Nubank - Thais'].length, 1);

        assert.match(await send('sim'), /lançado/i);
        assert.strictEqual(sheets.Saídas.length, 1);
        assert.strictEqual(sheets.Categorias.length, 2);
        assert.deepStrictEqual(sheets.Categorias[1].slice(0, 3), ['Hobbies', 'Passeios', 'SIM']);
        assert.strictEqual(sheets['Cartão Nubank - Thais'].length, 2);
        assert.deepStrictEqual(sheets['Cartão Nubank - Thais'][1], [
            '28/06/2026',
            'item catcredit',
            'Hobbies',
            90.97,
            '1/1',
            'Junho de 2026',
            USER_ID
        ]);
        assert.strictEqual(userStateManager.getState(SENDER), undefined);
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
    }
});
stateMachineTest('financial states: legacy category creation asks confirmation before saving expense with known payment', async () => {
    resetState();
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'off';
    enqueueStructuredResponse({
        intent: 'gasto',
        data: '28/06/2026',
        descricao: 'item TESTE_APAGAR_CATPERM_20260627_173500 via',
        categoria: 'Outros',
        subcategoria: '',
        valor: 12.61,
        pagamento: 'PIX',
        recorrente: 'Não'
    });

    try {
        const categoryQuestion = await send('Gastei 12,61 no item TESTE_APAGAR_CATPERM_20260627_173500 via Pix');
        assert.match(categoryQuestion, /Criar nova categoria\/subcategoria/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_expense_category');

        assert.match(await send('criar nova'), /nome da nova categoria/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_expense_new_category_name');

        assert.match(await send('Teste apagar 173500'), /subcategoria dentro de "Teste apagar 173500"/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_expense_new_subcategory_name');

        const confirmation = await send('Catperm 173500');
        assert.match(confirmation, /Categoria: \*Teste apagar 173500 \/ Catperm 173500\*/i);
        assert.match(confirmation, /Confirma/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_planned_expense');
        assert.strictEqual(sheets.Saídas.length, 1);
        assert.strictEqual(sheets.Categorias.length, 1);

        assert.match(await send('não'), /cancelad/i);
        assert.strictEqual(sheets.Saídas.length, 1);
        assert.strictEqual(sheets.Categorias.length, 1);
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
    }
});
stateMachineTest('financial states: unknown payment method asks again instead of defaulting to PIX', async () => {
    resetState();
    userStateManager.setState(SENDER, {
        action: 'awaiting_payment_method',
        data: {
            gasto: {
                data: '10/02/2026',
                descricao: 'lanche',
                categoria: 'Alimentação',
                subcategoria: 'PADARIA / LANCHE',
                valor: 80,
                recorrente: 'Não'
            }
        }
    });

    const reply = await send('banana');

    assert.match(reply, /não consegui entender a forma de pagamento/i);
    assert.strictEqual(sheets.Saídas.length, 1);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_payment_method');
});

stateMachineTest('financial states: unknown receipt method asks again instead of defaulting to PIX', async () => {
    resetState();
    userStateManager.setState(SENDER, {
        action: 'awaiting_receipt_method',
        data: {
            data: '10/02/2026',
            descricao: 'freela',
            categoria: 'Renda Extra',
            valor: 300,
            recorrente: 'Não'
        }
    });

    const reply = await send('banana');

    assert.match(reply, /não consegui entender onde você recebeu/i);
    assert.strictEqual(sheets.Entradas.length, 1);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_receipt_method');
});

stateMachineTest('financial states: receipt method asks explicit destination account when accounts exist', async () => {
    resetState();
    sheets['Contas Financeiras'].push(
        ['Daniel - Nubank', 'bank', '1000,00', '03/07/2026', 'active', 'BRL', 'Usuario Estado', USER_ID, 'Principal'],
        ['Daniel - Carteira', 'cash', '50,00', '03/07/2026', 'active', 'BRL', 'Usuario Estado', USER_ID, 'Dinheiro']
    );
    userStateManager.setState(SENDER, {
        action: 'awaiting_receipt_method',
        data: {
            data: '10/02/2026',
            descricao: 'freela',
            categoria: 'Renda Extra',
            valor: 300,
            recorrente: 'Não'
        }
    });

    const accountQuestion = await send('pix');

    assert.match(accountQuestion, /conta financeira/i);
    assert.match(accountQuestion, /1\. Daniel - Nubank/i);
    assert.match(accountQuestion, /2\. Daniel - Carteira/i);
    assert.strictEqual(sheets.Entradas.length, 1);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_income_financial_account');

    const savedReply = await send('1');

    assert.match(savedReply, /registrada/i);
    assert.strictEqual(sheets.Entradas.length, 2);
    assert.strictEqual(sheets.Entradas[1][5], 'PIX');
    assert.strictEqual(sheets.Entradas[1][8], USER_ID);
    assert.strictEqual(sheets.Entradas[1][9], 'Daniel - Nubank');
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});
stateMachineTest('financial states: reimbursement receipt is not presented as ordinary income', async () => {
    resetState();
    sheets['Contas Financeiras'].push(
        ['Daniel - Nubank', 'bank', '1000,00', '03/07/2026', 'active', 'BRL', 'Usuario Estado', USER_ID, 'Principal']
    );
    userStateManager.setState(SENDER, {
        action: 'awaiting_receipt_method',
        data: {
            data: '10/02/2026',
            descricao: 'reembolso mercado TESTE_APAGAR_3F_E2E',
            categoria: 'Reembolso',
            valor: 4.56,
            recorrente: 'Nao'
        }
    });

    const accountQuestion = await send('pix');

    assert.match(accountQuestion, /conta financeira/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_income_financial_account');

    const savedReply = await send('1');

    assert.match(savedReply, /Reembolso de R\$ 4,56/i);
    assert.doesNotMatch(savedReply, /Entrada de/i);
    assert.strictEqual(sheets.Entradas.length, 2);
    assert.strictEqual(sheets.Entradas[1][2], 'Reembolso');
    assert.strictEqual(sheets.Entradas[1][9], 'Daniel - Nubank');
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});
stateMachineTest('financial states: enforce requires final confirmation when expense amount came only from LLM', async () => {
    resetState();
    const previousMode = process.env.INTERPRETATION_RELIABILITY_MODE;
    const previousOperations = process.env.INTERPRETATION_RELIABILITY_OPERATIONS;
    process.env.INTERPRETATION_RELIABILITY_MODE = 'enforce';
    process.env.INTERPRETATION_RELIABILITY_OPERATIONS = 'expense.create,income.create';
    userStateManager.setState(SENDER, {
        action: 'awaiting_payment_method',
        data: {
            gasto: {
                data: '10/02/2026',
                descricao: 'almoço',
                categoria: 'Alimentação',
                valor: 80,
                recorrente: 'Não',
                originalMessage: 'paguei o almoço',
                interpretationSource: 'llm'
            }
        }
    });

    try {
        const categoryQuestion = await send('pix');
        assert.match(categoryQuestion, /parece ser Alimentação/i);
        const restaurantOption = categoryQuestion.match(/(^|\n)(\d+)\.\s*Alimentação\s*\/\s*RESTAURANTE/im);
        assert.ok(restaurantOption, categoryQuestion);

        const confirmationRequest = await send(restaurantOption[2]);
        assert.match(confirmationRequest, /confirma/i);
        assert.strictEqual(sheets.Saídas.length, 1);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_transactions');

        const savedReply = await send('sim');
        assert.match(savedReply, /1 de 1 itens foram salvos/i);
        assert.strictEqual(sheets.Saídas.length, 2);
        assert.strictEqual(sheets.Saídas[1][4], 80);
    } finally {
        if (previousMode === undefined) delete process.env.INTERPRETATION_RELIABILITY_MODE;
        else process.env.INTERPRETATION_RELIABILITY_MODE = previousMode;
        if (previousOperations === undefined) delete process.env.INTERPRETATION_RELIABILITY_OPERATIONS;
        else process.env.INTERPRETATION_RELIABILITY_OPERATIONS = previousOperations;
    }
});

stateMachineTest('financial states: enforce requires final confirmation when income amount came only from LLM', async () => {
    resetState();
    const previousMode = process.env.INTERPRETATION_RELIABILITY_MODE;
    const previousOperations = process.env.INTERPRETATION_RELIABILITY_OPERATIONS;
    process.env.INTERPRETATION_RELIABILITY_MODE = 'enforce';
    process.env.INTERPRETATION_RELIABILITY_OPERATIONS = 'expense.create,income.create';
    userStateManager.setState(SENDER, {
        action: 'awaiting_receipt_method',
        data: {
            data: '10/02/2026',
            descricao: 'freela',
            categoria: 'Renda Extra',
            valor: 300,
            recorrente: 'Não',
            originalMessage: 'caiu o pagamento do freela',
            interpretationSource: 'llm'
        }
    });

    try {
        const confirmationRequest = await send('cc');

        assert.match(confirmationRequest, /confirma/i);
        assert.strictEqual(sheets.Entradas.length, 1);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_transactions');

        const savedReply = await send('sim');
        assert.match(savedReply, /1 de 1 itens foram salvos/i);
        assert.strictEqual(sheets.Entradas.length, 2);
        assert.strictEqual(sheets.Entradas[1][3], 300);
    } finally {
        if (previousMode === undefined) delete process.env.INTERPRETATION_RELIABILITY_MODE;
        else process.env.INTERPRETATION_RELIABILITY_MODE = previousMode;
        if (previousOperations === undefined) delete process.env.INTERPRETATION_RELIABILITY_OPERATIONS;
        else process.env.INTERPRETATION_RELIABILITY_OPERATIONS = previousOperations;
    }
});

stateMachineTest('financial states: enforce preserves LLM provenance across the payment question', async () => {
    resetState();
    const previousMode = process.env.INTERPRETATION_RELIABILITY_MODE;
    const previousOperations = process.env.INTERPRETATION_RELIABILITY_OPERATIONS;
    process.env.INTERPRETATION_RELIABILITY_MODE = 'enforce';
    process.env.INTERPRETATION_RELIABILITY_OPERATIONS = 'expense.create,income.create';
    enqueueStructuredResponse({
        intent: 'gasto',
        gastoDetails: [
            {
                descricao: 'almoço',
                valor: 80,
                categoria: 'Alimentação',
                recorrente: 'Não'
            }
        ]
    });

    try {
        const paymentQuestion = await send('anote 80 do almoço');
        assert.match(paymentQuestion, /forma de pagamento/i);
        assert.strictEqual(userStateManager.getState(SENDER).data.gasto.interpretationSource, 'llm');
        assert.strictEqual(sheets.Saídas.length, 1);

        const categoryQuestion = await send('pix');
        assert.match(categoryQuestion, /parece ser Alimentação/i);
        const restaurantOption = categoryQuestion.match(/(^|\n)(\d+)\.\s*Alimentação\s*\/\s*RESTAURANTE/im);
        assert.ok(restaurantOption, categoryQuestion);

        const confirmationRequest = await send(restaurantOption[2]);
        assert.match(confirmationRequest, /confirme os dados interpretados/i);
        assert.strictEqual(userStateManager.getState(SENDER).data.transactions[0].reliabilityConfirmed, true);

        await send('sim');
        assert.strictEqual(sheets.Saídas.length, 2);
    } finally {
        if (previousMode === undefined) delete process.env.INTERPRETATION_RELIABILITY_MODE;
        else process.env.INTERPRETATION_RELIABILITY_MODE = previousMode;
        if (previousOperations === undefined) delete process.env.INTERPRETATION_RELIABILITY_OPERATIONS;
        else process.env.INTERPRETATION_RELIABILITY_OPERATIONS = previousOperations;
    }
});

stateMachineTest('financial states: enforce requires confirmation before saving LLM-origin credit card expense', async () => {
    resetState();
    const previousMode = process.env.INTERPRETATION_RELIABILITY_MODE;
    const previousOperations = process.env.INTERPRETATION_RELIABILITY_OPERATIONS;
    process.env.INTERPRETATION_RELIABILITY_MODE = 'enforce';
    process.env.INTERPRETATION_RELIABILITY_OPERATIONS = 'expense.create,income.create';
    enqueueStructuredResponse({
        intent: 'gasto',
        gastoDetails: [
            {
                descricao: 'almoço',
                valor: 80,
                categoria: 'Alimentação',
                recorrente: 'Não'
            }
        ]
    });

    try {
        assert.match(await send('anote 80 do almoço'), /forma de pagamento/i);
        assert.match(await send('credito'), /qual cartão/i);
        assert.match(await send('1'), /parcelas/i);

        const confirmationRequest = await send('1');
        assert.match(confirmationRequest, /Antes de salvar no cartão, confirme/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_credit_card_expense');
        assert.strictEqual(sheets[CARD_SHEETS[0]].length, 1);

        const done = await send('sim');
        assert.match(done, /lançado no/i);
        assert.strictEqual(sheets[CARD_SHEETS[0]].length, 2);
        assert.strictEqual(sheets[CARD_SHEETS[0]][1][1], 'almoço');
        assert.strictEqual(sheets[CARD_SHEETS[0]][1][3], 80);
        assert.strictEqual(sheets[CARD_SHEETS[0]][1][4], '1/1');
        assert.strictEqual(userStateManager.getState(SENDER), undefined);
    } finally {
        if (previousMode === undefined) delete process.env.INTERPRETATION_RELIABILITY_MODE;
        else process.env.INTERPRETATION_RELIABILITY_MODE = previousMode;
        if (previousOperations === undefined) delete process.env.INTERPRETATION_RELIABILITY_OPERATIONS;
        else process.env.INTERPRETATION_RELIABILITY_OPERATIONS = previousOperations;
    }
});

stateMachineTest('financial states: strips internal reliability metadata supplied by the LLM', async () => {
    resetState();
    enqueueStructuredResponse({
        intent: 'gasto',
        gastoDetails: [
            {
                descricao: 'almoço',
                valor: 80,
                categoria: 'Alimentação',
                pagamento: 'PIX',
                recorrente: 'Não',
                reliabilityConfirmed: true
            }
        ]
    });

    const confirmationRequest = await send('anote 80 do almoço no pix');

    assert.match(confirmationRequest, /confirma/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_transactions');
    assert.strictEqual(
        userStateManager.getState(SENDER).data.transactions[0].reliabilityConfirmed,
        undefined
    );
    assert.strictEqual(sheets.Saídas.length, 1);
});

stateMachineTest('financial states: multiple unmarked numbers require confirmation instead of guessing the amount', async () => {
    resetState();
    const previousMode = process.env.INTERPRETATION_RELIABILITY_MODE;
    const previousOperations = process.env.INTERPRETATION_RELIABILITY_OPERATIONS;
    process.env.INTERPRETATION_RELIABILITY_MODE = 'enforce';
    process.env.INTERPRETATION_RELIABILITY_OPERATIONS = 'expense.create,income.create';
    enqueueStructuredResponse({
        intent: 'gasto',
        gastoDetails: [
            {
                descricao: 'camisas',
                valor: 100,
                categoria: 'Vestuário',
                pagamento: 'PIX',
                recorrente: 'Não'
            }
        ]
    });

    try {
        const reply = await send('comprei 2 camisas por 100 no pix');

        assert.match(reply, /confirma/i);
        assert.strictEqual(sheets.Saídas.length, 1);

        await send('sim');
        assert.strictEqual(sheets.Saídas.length, 2);
        assert.strictEqual(sheets.Saídas[1][4], 100);
    } finally {
        if (previousMode === undefined) delete process.env.INTERPRETATION_RELIABILITY_MODE;
        else process.env.INTERPRETATION_RELIABILITY_MODE = previousMode;
        if (previousOperations === undefined) delete process.env.INTERPRETATION_RELIABILITY_OPERATIONS;
        else process.env.INTERPRETATION_RELIABILITY_OPERATIONS = previousOperations;
    }
});

stateMachineTest('financial states: enforce asks again instead of writing a complete transaction with conflicting amount', async () => {
    resetState();
    const previousMode = process.env.INTERPRETATION_RELIABILITY_MODE;
    const previousOperations = process.env.INTERPRETATION_RELIABILITY_OPERATIONS;
    process.env.INTERPRETATION_RELIABILITY_MODE = 'enforce';
    process.env.INTERPRETATION_RELIABILITY_OPERATIONS = 'expense.create,income.create';
    enqueueStructuredResponse({
        intent: 'gasto',
        gastoDetails: [
            {
                descricao: 'almoço',
                valor: 120,
                categoria: 'Alimentação',
                pagamento: 'PIX',
                recorrente: 'Não'
            }
        ]
    });

    try {
        const reply = await send('paguei 100 no pix');

        assert.match(reply, /conflito|confirmar um dado essencial|envie novamente/i);
        assert.strictEqual(sheets.Saídas.length, 1);
    } finally {
        if (previousMode === undefined) delete process.env.INTERPRETATION_RELIABILITY_MODE;
        else process.env.INTERPRETATION_RELIABILITY_MODE = previousMode;
        if (previousOperations === undefined) delete process.env.INTERPRETATION_RELIABILITY_OPERATIONS;
        else process.env.INTERPRETATION_RELIABILITY_OPERATIONS = previousOperations;
    }
});

stateMachineTest('financial states: explicit PIX expense is saved without asking payment again', async () => {
    resetState();
    enqueueStructuredResponse({
        intent: 'gasto',
        gastoDetails: [
            {
                descricao: 'mercado',
                valor: 25,
                categoria: 'Alimentação',
                subcategoria: 'SUPERMERCADO',
                pagamento: 'PIX',
                recorrente: 'Não'
            }
        ]
    });

    const reply = await send('gastei 25 no mercado no pix');

    assert.match(reply, /registrado como \*PIX\*/i);
    assert.doesNotMatch(reply, /forma de pagamento|como esses itens foram pagos|confirma/i);
    assert.strictEqual(sheets.Saídas.length, 2);
    assert.strictEqual(sheets.Saídas[1][1], 'mercado');
    assert.strictEqual(sheets.Saídas[1][4], 25);
    assert.strictEqual(sheets.Saídas[1][6], 'PIX');
    assert.strictEqual(sheets.Saídas[1][9], USER_ID);
    assert.match(getReadModelStats().source, /^dirty:/);
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});

stateMachineTest('financial states: written amount wins over digits embedded in a reference identifier', async () => {
    resetState();
    const previousMode = process.env.INTERPRETATION_RELIABILITY_MODE;
    const previousOperations = process.env.INTERPRETATION_RELIABILITY_OPERATIONS;
    process.env.INTERPRETATION_RELIABILITY_MODE = 'enforce';
    process.env.INTERPRETATION_RELIABILITY_OPERATIONS = 'expense.create,income.create';

    try {
        const reply = await send('gastei dez reais REFERENCIA_TESTE_20260620 no pix');

        assert.match(reply, /R\$10\.00/i);
        assert.strictEqual(sheets.Saídas.length, 2);
        assert.strictEqual(sheets.Saídas[1][4], 10);
        assert.match(sheets.Saídas[1][1], /REFERENCIA_TESTE_20260620/i);
    } finally {
        if (previousMode === undefined) delete process.env.INTERPRETATION_RELIABILITY_MODE;
        else process.env.INTERPRETATION_RELIABILITY_MODE = previousMode;
        if (previousOperations === undefined) delete process.env.INTERPRETATION_RELIABILITY_OPERATIONS;
        else process.env.INTERPRETATION_RELIABILITY_OPERATIONS = previousOperations;
    }
});

stateMachineTest('financial states: digits embedded in a reference identifier are not treated as an amount', async () => {
    resetState();

    const reply = await send('gastei no mercado REFERENCIA_TESTE_20260620 no pix');

    assert.doesNotMatch(reply, /R\$20260620|registrado como/i);
    assert.strictEqual(sheets.Saídas.length, 1);
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});

stateMachineTest('financial states: cancelar always exits a pending payment flow without writing', async () => {
    resetState();

    assert.match(await send('gastei 10 reais ontem no café'), /forma de pagamento/i);
    const reply = await send('cancelar');

    assert.match(reply, /cancelad/i);
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
    assert.strictEqual(sheets.Saídas.length, 1);
});

stateMachineTest('financial states: cancelar clears only the pending write when an analytical checkpoint exists', async () => {
    const {
        storeAnalyticalContext,
        getAnalyticalContext,
        clearAnalyticalContextForTests
    } = messageHandlerTest;

    resetState();
    clearAnalyticalContextForTests();
    try {
        storeAnalyticalContext(SENDER, {
            intent: 'total_gastos_mes',
            parameters: { mes: 4, ano: 2026, categoria: 'alimentacao' }
        }, { metric: 'expense_total' });

        assert.match(await send('gastei 10 reais ontem no cafe'), /forma de pagamento/i);
        const reply = await send('cancelar');

        assert.match(reply, /cancelad/i);
        assert.strictEqual(userStateManager.getState(SENDER), undefined);
        assert.strictEqual(sheets[Object.keys(sheets).find(name => name.startsWith('Sa'))].length, 1);
        assert.deepStrictEqual(getAnalyticalContext(SENDER), {
            checkpointType: 'analytical_followup_v1',
            intent: 'total_gastos_mes',
            parameters: { mes: 4, ano: 2026, categoria: 'alimentacao' },
            metric: 'expense_total'
        });
    } finally {
        clearAnalyticalContextForTests();
    }
});

stateMachineTest('public handler routes an elliptical family expense follow-up through the analytical context', async () => {
    const {
        classifyPerguntaLocally,
        storeAnalyticalContext,
        getAnalyticalContext,
        clearAnalyticalContextForTests
    } = messageHandlerTest;

    resetState();
    clearAnalyticalContextForTests();
    usesPersonalSpreadsheet = true;
    financialScopeUserIds = [USER_ID, PARTNER_ID];
    sheets.Users.push(partnerUserRow());
    sheets.Saídas.push(
        [todayBr(), 'Padaria Daniel', 'Alimentação', 'LANCHE', 10, 'Daniel', 'PIX', 'Não', '', USER_ID, 'Daniel - Nubank'],
        [todayBr(), 'Restaurante Thais', 'Alimentação', 'RESTAURANTE', 20, 'Thais', 'PIX', 'Não', '', PARTNER_ID, 'Thais - Nubank'],
        [todayBr(), 'Aluguel Thais', 'Moradia', 'Aluguel', 500, 'Thais', 'PIX', 'Não', '', PARTNER_ID, 'Thais - Nubank']
    );

    try {
        const initial = classifyPerguntaLocally('Quais foram os maiores gastos da família neste mês?');
        storeAnalyticalContext(SENDER, initial);

        const reply = await send('E só com alimentação?');

        assert.doesNotMatch(reply, /não entendi esse pedido/i);
        assert.strictEqual(getAnalyticalContext(SENDER).intent, 'ranking_maiores_gastos');
        assert.strictEqual(getAnalyticalContext(SENDER).parameters.categoria, 'alimentacao');
        assert.strictEqual(getAnalyticalContext(SENDER).parameters.scope, 'family');
        assert.match(await send('sim'), /não entendi esse pedido/i);
        assert.strictEqual(appendedRows.length, 0);
        assert.strictEqual(deletedRows.length, 0);
    } finally {
        clearAnalyticalContextForTests();
    }
});

stateMachineTest('financial states: ajuda exits a pending payment flow and opens the help menu', async () => {
    resetState();

    assert.match(await send('gastei 10 reais ontem no café'), /forma de pagamento/i);
    const reply = await send('ajuda');

    assert.match(reply, /assistente financeiro/i);
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
    assert.strictEqual(sheets.Saídas.length, 1);
});

stateMachineTest('financial states: shadow treats deterministic complete expense as aligned write', async () => {
    resetState();
    fs.rmSync(RELIABILITY_TELEMETRY_PATH, { force: true });
    const previousMode = process.env.INTERPRETATION_RELIABILITY_MODE;
    const previousOperations = process.env.INTERPRETATION_RELIABILITY_OPERATIONS;
    process.env.INTERPRETATION_RELIABILITY_MODE = 'shadow';
    process.env.INTERPRETATION_RELIABILITY_OPERATIONS = 'expense.create,income.create';

    try {
        const reply = await send('gastei 25 no mercado no pix');

        assert.match(reply, /registrado como \*PIX\*/i);
        const entries = readReliabilityTelemetryEntries();
        const expenseEntries = entries.filter(entry => entry.operation === 'expense.create');
        assert.ok(expenseEntries.length > 0, 'expected expense shadow telemetry');
        for (const entry of expenseEntries) {
            assert.strictEqual(entry.action, 'execute');
            assert.strictEqual(entry.divergenceSeverity, 'none');
            assert.strictEqual(entry.fields.amount.source, 'deterministic');
            assert.strictEqual(entry.fields.amount.assurance, 'verified');
            assert.strictEqual(entry.fields.movementType.source, 'deterministic');
            assert.strictEqual(entry.fields.movementType.assurance, 'verified');
        }
    } finally {
        if (previousMode === undefined) delete process.env.INTERPRETATION_RELIABILITY_MODE;
        else process.env.INTERPRETATION_RELIABILITY_MODE = previousMode;
        if (previousOperations === undefined) delete process.env.INTERPRETATION_RELIABILITY_OPERATIONS;
        else process.env.INTERPRETATION_RELIABILITY_OPERATIONS = previousOperations;
    }
});

stateMachineTest('financial states: shadow preserves deterministic provenance when persisting confirmed expense', async () => {
    resetState();
    fs.rmSync(RELIABILITY_TELEMETRY_PATH, { force: true });
    const previousMode = process.env.INTERPRETATION_RELIABILITY_MODE;
    const previousOperations = process.env.INTERPRETATION_RELIABILITY_OPERATIONS;
    process.env.INTERPRETATION_RELIABILITY_MODE = 'shadow';
    process.env.INTERPRETATION_RELIABILITY_OPERATIONS = 'expense.create,income.create';
    userStateManager.setState(SENDER, {
        action: 'confirming_transactions',
        data: {
            transactions: [
                {
                    type: 'Saídas',
                    data: '10/02/2026',
                    descricao: 'mercado confirmado',
                    categoria: 'Alimentação',
                    valor: 20,
                    pagamento: 'PIX',
                    recorrente: 'Não',
                    interpretationSource: 'deterministic'
                }
            ]
        }
    });

    try {
        const reply = await send('sim');

        assert.match(reply, /1 de 1 itens foram salvos/i);
        const entries = readReliabilityTelemetryEntries();
        const expenseEntry = entries.find(entry => entry.operation === 'expense.create');
        assert.ok(expenseEntry, 'expected expense shadow telemetry');
        assert.strictEqual(expenseEntry.fields.amount.source, 'deterministic');
        assert.strictEqual(expenseEntry.fields.amount.assurance, 'verified');
        assert.strictEqual(expenseEntry.fields.movementType.source, 'deterministic');
        assert.strictEqual(expenseEntry.fields.movementType.assurance, 'verified');
    } finally {
        if (previousMode === undefined) delete process.env.INTERPRETATION_RELIABILITY_MODE;
        else process.env.INTERPRETATION_RELIABILITY_MODE = previousMode;
        if (previousOperations === undefined) delete process.env.INTERPRETATION_RELIABILITY_OPERATIONS;
        else process.env.INTERPRETATION_RELIABILITY_OPERATIONS = previousOperations;
    }
});

stateMachineTest('financial states: shadow preserves deterministic provenance when persisting confirmed income', async () => {
    resetState();
    fs.rmSync(RELIABILITY_TELEMETRY_PATH, { force: true });
    const previousMode = process.env.INTERPRETATION_RELIABILITY_MODE;
    const previousOperations = process.env.INTERPRETATION_RELIABILITY_OPERATIONS;
    process.env.INTERPRETATION_RELIABILITY_MODE = 'shadow';
    process.env.INTERPRETATION_RELIABILITY_OPERATIONS = 'expense.create,income.create';
    userStateManager.setState(SENDER, {
        action: 'confirming_transactions',
        data: {
            transactions: [
                {
                    type: 'Entradas',
                    data: '10/02/2026',
                    descricao: 'freela confirmado',
                    categoria: 'Renda Extra',
                    valor: 200,
                    recebimento: 'PIX',
                    recorrente: 'Não',
                    interpretationSource: 'deterministic'
                }
            ]
        }
    });

    try {
        const reply = await send('sim');

        assert.match(reply, /1 de 1 itens foram salvos/i);
        const entries = readReliabilityTelemetryEntries();
        const incomeEntry = entries.find(entry => entry.operation === 'income.create');
        assert.ok(incomeEntry, 'expected income shadow telemetry');
        assert.strictEqual(incomeEntry.fields.amount.source, 'deterministic');
        assert.strictEqual(incomeEntry.fields.amount.assurance, 'verified');
        assert.strictEqual(incomeEntry.fields.movementType.source, 'deterministic');
        assert.strictEqual(incomeEntry.fields.movementType.assurance, 'verified');
    } finally {
        if (previousMode === undefined) delete process.env.INTERPRETATION_RELIABILITY_MODE;
        else process.env.INTERPRETATION_RELIABILITY_MODE = previousMode;
        if (previousOperations === undefined) delete process.env.INTERPRETATION_RELIABILITY_OPERATIONS;
        else process.env.INTERPRETATION_RELIABILITY_OPERATIONS = previousOperations;
    }
});

stateMachineTest('financial states: audio transcription enters the normal financial routing', async () => {
    resetState();
    enqueueStructuredResponse({
        intent: 'gasto',
        gastoDetails: [
            {
                descricao: 'uber do áudio',
                valor: 30,
                categoria: 'Transporte',
                subcategoria: 'UBER / 99',
                pagamento: 'PIX',
                recorrente: 'Não',
                data: '10/02/2026'
            }
        ]
    });

    const replies = await sendAudio('gastei 30 com uber no pix');

    assert.match(replies[0], /áudio/i);
    assert.match(replies.at(-1), /Você confirma o registro/i);
    assert.strictEqual(sheets.Saídas.length, 1);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_transactions');

    const confirmationReply = await send('sim');

    assert.match(confirmationReply, /1 de 1 itens foram salvos/i);
    assert.strictEqual(sheets.Saídas.length, 2);
    assert.strictEqual(sheets.Saídas[1][1], 'uber do áudio');
    assert.strictEqual(sheets.Saídas[1][6], 'PIX');
    assert.strictEqual(sheets.Saídas[1][9], USER_ID);
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});

stateMachineTest('audio ingress discards status and outgoing messages before transcription', async () => {
    resetState();
    const statusMessage = createMockAudioMessage('gastei 30 com uber no pix');
    statusMessage.isStatus = true;
    await handleMessage(statusMessage);

    const outgoingMessage = createMockAudioMessage('gastei 30 com uber no pix');
    outgoingMessage.fromMe = true;
    await handleMessage(outgoingMessage);

    assert.strictEqual(audioHandleCalls, 0);
    assert.deepStrictEqual(statusMessage.replies, []);
    assert.deepStrictEqual(outgoingMessage.replies, []);
});

stateMachineTest('gate 32 public handler rejects batch sim and advances a numeric queue without financial write', async () => {
    resetState();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-public-save-batch-'));
    const paths = {
        secret: path.join(directory, 'secret.txt'),
        journal: path.join(directory, 'journal.sqlite'),
        preview: path.join(directory, 'preview.sqlite'),
        outbox: path.join(directory, 'outbox.sqlite'),
        visibility: path.join(directory, 'visibility.json')
    };
    const secret = 'open-finance-public-save-batch-secret-32-bytes';
    fs.writeFileSync(paths.secret, secret, { mode: 0o600 });
    const journal = new OpenFinanceRevocationJournal({
        databasePath: paths.journal,
        secret
    });
    const store = new OpenFinanceShadowPreviewStore({
        databasePath: paths.preview,
        secret,
        revocationJournal: journal,
        authorizedWhatsAppIds: [SENDER],
        confirmationActors: [{ principal: 'daniel', whatsappId: SENDER }],
        familyConfirmationEnabled: true
    });
    const item = {
        id: 'public-handler-batch-item',
        alias_code: 'daniel_nubank',
        generation: 2,
        accounts: [{ id: 'credit-account', type: 'CREDIT' }],
        transactions: [1, 2].map(index => ({
            id: `public-handler-batch-${index}`,
            account_id: 'credit-account',
            amount_cents: 3400 + index,
            description: `Compra pública ${index}`,
            date: new Date(Date.now() - index * 3_600_000).toISOString(),
            status: 'POSTED'
        }))
    };
    const refs = item.transactions.map(transaction =>
        observationRef(secret, item.id, transaction.account_id, transaction.id));
    const lifecycleDecisions = refs.map(observation_ref => ({
        observation_ref,
        classification: 'purchase',
        provider_state: 'POSTED',
        lifecycle_milestone: 'first_posted'
    }));
    const policies = [{
        alias: 'daniel_nubank',
        source_owner: 'daniel',
        authorized_viewers: ['daniel', 'thais'],
        whatsapp_recipient: 'daniel',
        family_aggregation_allowed: true,
        write_confirmation_principal: 'daniel'
    }];
    fs.writeFileSync(paths.visibility, JSON.stringify(policies));
    const ingested = store.ingestSaveProposals({
        reconciliationDecisions: refs.map((observation_ref, index) => ({
            alias: 'daniel_nubank',
            observation_ref,
            transaction_ref: `public-handler-batch-transaction-${index + 1}`,
            status: 'new',
            rule: 'no_candidate'
        })),
        lifecycleDecisions,
        openFinanceItems: [item],
        policies,
        observedAt: new Date(Date.now() - 60_000).toISOString(),
        includeProposalLinks: true
    });
    const proposalRefs = ingested.proposal_links.map(link => link.proposal_ref);
    const outbox = new OpenFinanceAlertOutbox({
        databasePath: paths.outbox,
        secret
    });
    outbox.enqueue({
        candidates: refs.map((observation_ref, index) => ({
            observation_ref,
            external_event_ref: `public-handler-batch-event-${index + 1}`,
            correlation_state: 'new_event',
            reconciliation_status: 'new'
        })),
        lifecycleDecisions,
        items: [item],
        policies,
        baselineComplete: true,
        reconciliationRequired: true,
        saveProposalLinks: ingested.proposal_links
    });
    const claimed = outbox.claimNextBatch({
        canaryAliases: ['daniel_nubank'],
        excludedRecipients: ['thais'],
        batchSize: 4
    });
    outbox.acknowledgeDeliveredBatch({
        deliveries: claimed.map(entry => ({
            alertRef: entry.alert_ref,
            leaseToken: entry.lease_token
        })),
        whatsappMessageId: 'public-handler-batch-message-id'
    });
    outbox.close();
    store.close();
    journal.close();

    const variableNames = [
        'OPEN_FINANCE_SAVE_PROPOSAL_MODE',
        'OPEN_FINANCE_WRITE_MODE',
        'OPEN_FINANCE_LIVE_STAGING_SECRET_FILE',
        'OPEN_FINANCE_REVOCATION_JOURNAL_DB',
        'OPEN_FINANCE_SHADOW_PREVIEW_DB',
        'OPEN_FINANCE_OUTBOX_DB',
        'OPEN_FINANCE_VISIBILITY_POLICY_FILE'
    ];
    const previous = Object.fromEntries(variableNames.map(name => [name, process.env[name]]));
    Object.assign(process.env, {
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_WRITE_MODE: 'off',
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: paths.secret,
        OPEN_FINANCE_REVOCATION_JOURNAL_DB: paths.journal,
        OPEN_FINANCE_SHADOW_PREVIEW_DB: paths.preview,
        OPEN_FINANCE_OUTBOX_DB: paths.outbox,
        OPEN_FINANCE_VISIBILITY_POLICY_FILE: paths.visibility
    });
    const proposals = proposalRefs.map((proposalRef, index) => ({
        number: index + 1,
        proposalRef,
        recipientPrincipal: 'daniel'
    }));
    userStateManager.setState(SENDER, {
        action: 'awaiting_open_finance_save_selection',
        data: { proposals }
    });
    try {
        assert.match(await send('sim'), /isolado .* escolhe um lote/i);
        assert.strictEqual(
            userStateManager.getState(SENDER).action,
            'awaiting_open_finance_save_selection'
        );
        assert.match(await send('salvar 1 e 2'), /Confira a proposta/);
        let state = userStateManager.getState(SENDER);
        assert.strictEqual(state.action, 'awaiting_open_finance_save_review');
        assert.strictEqual(state.data.proposalRef, proposalRefs[0]);
        assert.deepStrictEqual(state.data.batch.queuedProposalRefs, [proposalRefs[1]]);
        const durableBatch = structuredClone(state.data.batch);

        userStateManager.setStateDurably(SENDER, {
            action: 'awaiting_open_finance_save_review',
            data: { proposalRef: proposalRefs[0] }
        });
        userStateManager.__test__.replaceStateFromJsonForTests('{}');
        userStateManager.__test__.loadStateFromDiskForTests();
        assert.match(await send('9'), /Escolha uma opção de 0 a 6/i);
        state = userStateManager.getState(SENDER);
        assert.strictEqual(state.action, 'awaiting_open_finance_save_review');
        assert.strictEqual(state.data.proposalRef, proposalRefs[0]);
        assert.equal(Object.hasOwn(state.data, 'batch'), false);
        assert.strictEqual(appendedRows.length, 0);

        userStateManager.setStateDurably(SENDER, {
            action: 'awaiting_open_finance_save_review',
            data: { proposalRef: proposalRefs[0], batch: durableBatch }
        });
        sheetReadErrors.set('Categorias', new Error('synthetic catalog outage'));
        const interruptedReply = await send('cancelar');
        assert.match(interruptedReply, /continua reservada/i);
        state = userStateManager.getState(SENDER);
        assert.strictEqual(
            state.action,
            'awaiting_open_finance_save_batch_continue'
        );
        assert.deepStrictEqual(state.data.batch.queuedProposalRefs, [proposalRefs[1]]);

        userStateManager.__test__.replaceStateFromJsonForTests('{}');
        assert.strictEqual(userStateManager.getState(SENDER), undefined);
        userStateManager.__test__.loadStateFromDiskForTests();
        state = userStateManager.getState(SENDER);
        assert.strictEqual(
            state.action,
            'awaiting_open_finance_save_batch_continue'
        );
        assert.deepStrictEqual(state.data.batch.queuedProposalRefs, [proposalRefs[1]]);

        sheetReadErrors.delete('Categorias');
        const nextReply = await send('continuar');
        assert.match(nextReply, /Confira a proposta/);
        state = userStateManager.getState(SENDER);
        assert.strictEqual(state.action, 'awaiting_open_finance_save_review');
        assert.strictEqual(state.data.proposalRef, proposalRefs[1]);
        assert.deepStrictEqual(state.data.batch.queuedProposalRefs, []);
        assert.strictEqual(appendedRows.length, 0);
    } finally {
        for (const name of variableNames) {
            if (previous[name] === undefined) delete process.env[name];
            else process.env[name] = previous[name];
        }
        sheetReadErrors.delete('Categorias');
        userStateManager.deleteStateDurably(SENDER);
    }
});

stateMachineTest('gate 38.1 public handler writes one item, recovers the receipt and advances the numeric batch without inherited consent', async () => {
    resetState();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-public-finalization-'));
    const paths = {
        secret: path.join(directory, 'secret.txt'),
        staging: path.join(directory, 'staging.sqlite'),
        journal: path.join(directory, 'journal.sqlite'),
        preview: path.join(directory, 'preview.sqlite'),
        outbox: path.join(directory, 'outbox.sqlite'),
        mapping: path.join(directory, 'mapping.json')
    };
    const secret = 'open-finance-public-final-secret-32-bytes';
    const item = {
        id: 'public-final-item',
        alias_code: 'daniel_nubank',
        owner_scope: 'daniel',
        availability: {
            accounts: 'available',
            transactions: 'available',
            bills: 'available',
            investments: 'available'
        },
        accounts: [{
            id: 'public-final-credit',
            type: 'CREDIT',
            name: 'Nubank Daniel',
            balance_cents: 0
        }],
        transactions: [
            {
                id: 'public-final-purchase',
                provider_id: 'public-final-provider',
                account_id: 'public-final-credit',
                amount_cents: 2590,
                description: 'Mercado final público',
                date: new Date(Date.now() - 3_600_000).toISOString(),
                status: 'POSTED'
            },
            {
                id: 'public-final-purchase-next',
                provider_id: 'public-final-provider-next',
                account_id: 'public-final-credit',
                amount_cents: 1790,
                description: 'Compra seguinte pública',
                date: new Date(Date.now() - 7_200_000).toISOString(),
                status: 'POSTED'
            }
        ],
        bills: [],
        investments: []
    };
    fs.writeFileSync(paths.secret, secret, { mode: 0o600 });
    fs.writeFileSync(paths.mapping, JSON.stringify([{
        itemId: item.id,
        alias: item.alias_code,
        ownerScope: 'daniel',
        generation: 2
    }]));
    const vault = new OpenFinanceLiveStagingVault({
        databasePath: paths.staging,
        secret
    });
    vault.ingestSnapshot({
        provider: 'pluggy',
        mode: 'live_readonly_staging',
        event_id: 'public-final-event',
        observed_at: new Date().toISOString(),
        collection_health: { complete: true, warning_count: 0 },
        items: [item]
    });
    vault.close();
    const journal = new OpenFinanceRevocationJournal({
        databasePath: paths.journal,
        secret
    });
    const preview = new OpenFinanceShadowPreviewStore({
        databasePath: paths.preview,
        secret,
        revocationJournal: journal,
        authorizedWhatsAppIds: [SENDER],
        confirmationActors: [{
            principal: 'daniel',
            whatsappId: SENDER
        }]
    });
    const observations = item.transactions.map(transaction => observationRef(
        secret,
        item.id,
        transaction.account_id,
        transaction.id
    ));
    const lifecycleDecisions = observations.map(observation_ref => ({
        observation_ref,
        classification: 'purchase',
        provider_state: 'POSTED',
        lifecycle_milestone: 'first_posted'
    }));
    const policies = [{
        alias: item.alias_code,
        source_owner: 'daniel',
        authorized_viewers: ['daniel', 'thais'],
        whatsapp_recipient: 'daniel',
        family_aggregation_allowed: true,
        write_confirmation_principal: 'daniel'
    }];
    const ingested = preview.ingestSaveProposals({
        reconciliationDecisions: observations.map((observation_ref, index) => ({
            alias: item.alias_code,
            observation_ref,
            transaction_ref: `public-final-transaction-${index + 1}`,
            status: 'new',
            rule: 'no_candidate'
        })),
        lifecycleDecisions,
        openFinanceItems: [{ ...item, generation: 2 }],
        policies,
        observedAt: new Date(Date.now() - 60_000).toISOString(),
        includeProposalLinks: true
    });
    const proposalRefs = ingested.proposal_links.map(link => link.proposal_ref);
    const [proposalRef, nextProposalRef] = proposalRefs;
    const confirmations = preview.prepareSaveProposalConfirmations(proposalRefs, {
        actorWhatsappId: SENDER
    });
    preview.decideSaveProposalConfirmation(
        confirmations.confirmations[0].confirmation_ref,
        'accept',
        { actorWhatsappId: SENDER }
    );
    const proposal = preview.readReviewableSaveProposal(proposalRef, {
        actorWhatsappId: SENDER
    });
    preview.close();
    journal.close();

    const outbox = new OpenFinanceAlertOutbox({
        databasePath: paths.outbox,
        secret
    });
    outbox.enqueue({
        candidates: observations.map((observation_ref, index) => ({
            observation_ref,
            external_event_ref: `public-final-event-${index + 1}`,
            correlation_state: 'new_event',
            reconciliation_status: 'new'
        })),
        lifecycleDecisions,
        items: [item],
        policies,
        baselineComplete: true,
        reconciliationRequired: true,
        saveProposalLinks: ingested.proposal_links
    });
    const claimed = outbox.claimNextBatch({
        canaryAliases: [item.alias_code],
        excludedRecipients: ['thais'],
        batchSize: 4
    });
    outbox.acknowledgeDeliveredBatch({
        deliveries: claimed.map(entry => ({
            alertRef: entry.alert_ref,
            leaseToken: entry.lease_token
        })),
        whatsappMessageId: 'public-final-batch-message-id'
    });
    outbox.close();

    sheets.Categorias.push([
        'Alimentação',
        'Mercado',
        'SIM',
        new Date().toISOString(),
        USER_ID
    ]);
    sheets['Cartões'].push([
        'nubank-daniel',
        'Nubank - Daniel',
        '10',
        '25',
        'Usuario Estado',
        'SIM',
        ''
    ]);
    usesPersonalSpreadsheet = true;
    const reviewStore = new OpenFinanceSaveProposalReviewStore({
        databasePath: paths.preview,
        secret,
        authorizedWhatsAppIds: [SENDER]
    });
    const catalog = {
        people: [{ id: USER_ID, label: 'Usuario Estado' }],
        categories: [{
            id: 'category:alimentacao:mercado',
            label: 'Alimentação / Mercado',
            category: 'Alimentação',
            subcategory: 'Mercado'
        }],
        paymentMethods: [{
            id: 'credit',
            label: 'Crédito',
            value: 'Crédito'
        }],
        financialAccounts: [],
        cards: [{
            id: 'card:nubank-daniel',
            label: 'Nubank - Daniel',
            cardId: 'nubank-daniel',
            closingDay: 25
        }]
    };
    reviewStore.prepareReview({
        proposalRef,
        proposal,
        actorWhatsappId: SENDER,
        catalog
    });
    reviewStore.activateReview(proposalRef, { actorWhatsappId: SENDER });
    reviewStore.updateReview(proposalRef, {
        actorWhatsappId: SENDER,
        mutate: current => ({
            ...current,
            step: 'menu',
            draft: {
                person: catalog.people[0],
                category: {
                    id: 'new-category:pets',
                    label: 'Pets',
                    category: 'Pets',
                    subcategory: '',
                    origin: 'user_created'
                },
                paymentMethod: catalog.paymentMethods[0],
                financialAccount: null,
                card: catalog.cards[0]
            }
        })
    });
    reviewStore.completeReview(proposalRef, { actorWhatsappId: SENDER });
    reviewStore.close();

    const variableNames = [
        'OPEN_FINANCE_ALERT_MODE',
        'OPEN_FINANCE_SAVE_PROPOSAL_MODE',
        'OPEN_FINANCE_SHADOW_PREVIEW_MODE',
        'OPEN_FINANCE_RECONCILIATION_MODE',
        'OPEN_FINANCE_WRITE_MODE',
        'OPEN_FINANCE_WRITE_APPROVED',
        'OPEN_FINANCE_LIVE_STAGING_SECRET_FILE',
        'OPEN_FINANCE_LIVE_STAGING_DB',
        'OPEN_FINANCE_REVOCATION_JOURNAL_DB',
        'OPEN_FINANCE_SHADOW_PREVIEW_DB',
        'OPEN_FINANCE_OUTBOX_DB',
        'PLUGGY_ITEM_MAP_FILE'
    ];
    const previous = Object.fromEntries(variableNames.map(name => [name, process.env[name]]));
    Object.assign(process.env, {
        OPEN_FINANCE_ALERT_MODE: 'canary',
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary',
        OPEN_FINANCE_RECONCILIATION_MODE: 'canary',
        OPEN_FINANCE_WRITE_MODE: 'confirm',
        OPEN_FINANCE_WRITE_APPROVED: 'true',
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: paths.secret,
        OPEN_FINANCE_LIVE_STAGING_DB: paths.staging,
        OPEN_FINANCE_REVOCATION_JOURNAL_DB: paths.journal,
        OPEN_FINANCE_SHADOW_PREVIEW_DB: paths.preview,
        OPEN_FINANCE_OUTBOX_DB: paths.outbox,
        PLUGGY_ITEM_MAP_FILE: paths.mapping
    });
    try {
        const batch = {
            version: 1,
            selectedProposalRefs: proposalRefs,
            queuedProposalRefs: [nextProposalRef],
            recipientPrincipalByProposal: Object.fromEntries(
                proposalRefs.map(value => [value, 'daniel'])
            )
        };
        userStateManager.setStateDurably(SENDER, {
            action: 'awaiting_open_finance_save_review',
            data: { proposalRef, batch }
        });
        const finalPrompt = await send('continuar');
        assert.match(finalPrompt, /Confirma o salvamento/i);
        assert.equal(appendedRows.length, 0);
        assert.equal(
            userStateManager.getState(SENDER).action,
            'awaiting_open_finance_final_confirmation'
        );

        failNextPlainMessage = true;
        const firstConfirmation = createMockMessage('sim');
        await handleMessage(firstConfirmation);
        assert.equal(appendedRows.length, 1);
        assert.equal(appendedRows[0].options.cardId, 'nubank-daniel');
        assert.equal(appendedRows[0].options.requireUserScoped, true);
        assert.equal(appendedRows[0].row[2], 'Pets');
        assert.equal(firstConfirmation.replies.length, 0);
        assert.equal(
            userStateManager.getState(SENDER).action,
            'awaiting_open_finance_final_confirmation'
        );

        const replayConfirmation = createMockMessage('sim');
        await handleMessage(replayConfirmation);
        assert.ok(replayConfirmation.replies.some(reply => /Recibo/.test(reply)));
        assert.match(replayConfirmation.replies.at(-1), /Confira a proposta/i);
        assert.equal(appendedRows.length, 1);
        let state = userStateManager.getState(SENDER);
        assert.equal(state.action, 'awaiting_open_finance_save_review');
        assert.equal(state.data.proposalRef, nextProposalRef);
        assert.deepEqual(state.data.batch.queuedProposalRefs, []);

        const nonInheritedReply = await send('sim');
        assert.match(nonInheritedReply, /Escolha uma opção de 0 a 6/i);
        assert.equal(appendedRows.length, 1);
        state = userStateManager.getState(SENDER);
        assert.equal(state.action, 'awaiting_open_finance_save_review');
        assert.equal(state.data.proposalRef, nextProposalRef);

        assert.match(await send('cancelar'), /cancelada/i);
        assert.equal(appendedRows.length, 1);
        assert.equal(userStateManager.getState(SENDER), undefined);

        const finalizationStore = new OpenFinanceSaveProposalFinalizationStore({
            databasePath: paths.preview,
            secret,
            authorizedWhatsAppIds: [SENDER]
        });
        const reopenedReviewStore = new OpenFinanceSaveProposalReviewStore({
            databasePath: paths.preview,
            secret,
            authorizedWhatsAppIds: [SENDER]
        });
        try {
            assert.equal(finalizationStore.read(proposalRef, {
                actorWhatsappId: SENDER
            }).state, 'receipt_delivered');
            assert.equal(reopenedReviewStore.readReviewPrivate(proposalRef, {
                actorWhatsappId: SENDER
            }).state, 'finalized');
        } finally {
            reopenedReviewStore.close();
            finalizationStore.close();
        }
    } finally {
        for (const name of variableNames) {
            if (previous[name] === undefined) delete process.env[name];
            else process.env[name] = previous[name];
        }
        userStateManager.deleteState(SENDER);
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

stateMachineTest('unread backfill uses the public serialized handler and never retries ambiguous processing', async () => {
    resetState();
    enqueueStructuredResponse({ intent: 'ajuda' });
    const msg = createMockMessage('ajuda');
    const originalReply = msg.reply;
    let discoveries = 0;
    let replyAttempts = 0;
    msg.reply = async () => {
        replyAttempts += 1;
        throw new Error('private simulated reply failure');
    };

    try {
        await assert.rejects(
            backfillUnreadMessages({
                async getChats() {
                    discoveries += 1;
                    return [{
                        unreadCount: 1,
                        fetchMessages: async () => [msg]
                    }];
                }
            }, handleMessageForBackfill, {
                delayMs: 0,
                retryDelayMs: 0,
                maxAttempts: 3,
                logger: { info() {}, warn() {} }
            }),
            error => (
                error?.code === 'WHATSAPP_UNREAD_BACKFILL_HANDLER_FAILED'
                && !String(error?.message || '').includes('private')
            )
        );
    } finally {
        msg.reply = originalReply;
    }

    assert.equal(discoveries, 1);
    assert.equal(replyAttempts, 2);
    assert.equal(sheets.Saídas.length, 1);
    assert.equal(sheets.Entradas.length, 1);
});

stateMachineTest('audio ingress resolves lifecycle before transcription', async () => {
    for (const status of ['PENDING_APPROVAL', 'APPROVED_AWAITING_GOOGLE', 'BLOCKED', 'INACTIVE', 'DELETED']) {
        resetState();
        sheets.Users[1][4] = status;
        userService.invalidateUserCaches();

        const msg = createMockAudioMessage('gastei 30 com uber no pix');
        await handleMessage(msg);

        assert.strictEqual(audioHandleCalls, 0, `status ${status} não pode transcrever áudio`);
    }

    resetState();
    sheets.Users = [USERS_HEADER];
    userService.invalidateUserCaches();
    await handleMessage(createMockAudioMessage('gastei 30 com uber no pix'));
    assert.strictEqual(audioHandleCalls, 0, 'usuário ausente não pode transcrever áudio');
});

stateMachineTest('audio ingress applies family mode before transcription', async () => {
    resetState();
    const previousEnabled = process.env.FAMILY_MODE_ENABLED;
    const previousUserIds = process.env.FAMILY_MODE_USER_IDS;
    const previousWhatsappIds = process.env.FAMILY_MODE_WHATSAPP_IDS;
    process.env.FAMILY_MODE_ENABLED = 'true';
    process.env.FAMILY_MODE_USER_IDS = 'another-user';
    process.env.FAMILY_MODE_WHATSAPP_IDS = '5599993999999@c.us';

    try {
        const msg = createMockAudioMessage('gastei 30 com uber no pix');
        await handleMessage(msg);
        assert.strictEqual(audioHandleCalls, 0);
        assert.match(msg.replies.at(-1), /modo familiar restrito/i);
    } finally {
        if (previousEnabled === undefined) delete process.env.FAMILY_MODE_ENABLED;
        else process.env.FAMILY_MODE_ENABLED = previousEnabled;
        if (previousUserIds === undefined) delete process.env.FAMILY_MODE_USER_IDS;
        else process.env.FAMILY_MODE_USER_IDS = previousUserIds;
        if (previousWhatsappIds === undefined) delete process.env.FAMILY_MODE_WHATSAPP_IDS;
        else process.env.FAMILY_MODE_WHATSAPP_IDS = previousWhatsappIds;
    }
});

stateMachineTest('audio ingress consumes rate limit once before transcription', async () => {
    resetState();
    rateLimiter.isAllowed = () => {
        rateLimitCheckCount += 1;
        return true;
    };
    enqueueStructuredResponse({ intent: 'ajuda' });

    const msg = createMockAudioMessage('ajuda');
    await handleMessage(msg);

    assert.strictEqual(audioHandleCalls, 1);
    assert.deepStrictEqual(audioRateLimitChecksAtHandle, [1]);
    assert.strictEqual(rateLimitCheckCount, 1);

    resetState();
    rateLimiter.isAllowed = () => {
        rateLimitCheckCount += 1;
        return false;
    };
    const blocked = createMockAudioMessage('gastei 30 com uber no pix');
    await handleMessage(blocked);
    assert.strictEqual(audioHandleCalls, 0);
    assert.strictEqual(rateLimitCheckCount, 1);
});

stateMachineTest('rate limit blocks heavy financial handlers before their effects', async () => {
    resetState();
    rateLimiter.isAllowed = () => {
        rateLimitCheckCount += 1;
        return false;
    };
    sheets.Metas.push([
        'Reserva de emergência', 10000, 1500, '', '', '31/12/2026',
        'Em andamento', 'Alta', USER_ID, 'personal', ''
    ]);

    let mediaDownloads = 0;
    const mediaMessage = (body, options) => {
        const msg = createMockMediaMessage('date,description,amount\n2026-07-01,Teste,10', options);
        msg.body = body;
        const downloadMedia = msg.downloadMedia;
        msg.downloadMedia = async () => {
            mediaDownloads += 1;
            return downloadMedia();
        };
        return msg;
    };
    const messages = [
        createMockMessage('anexar comprovante ao último gasto'),
        mediaMessage('importar extrato', { filename: 'extrato.pdf', mimetype: 'application/pdf' }),
        createMockMessage('exportar finanças de julho de 2026'),
        mediaMessage('', { filename: 'extrato.csv', mimetype: 'text/csv' }),
        createMockMessage('guardei 500 na meta reserva')
    ];
    const expensiveSheets = new Set(['Saídas', 'Entradas', 'Lançamentos Cartão', 'Metas']);

    for (const msg of messages) {
        const readsBefore = sheetReadCalls.filter(call => expensiveSheets.has(call.sheetName)).length;
        await handleMessage(msg);
        assert.strictEqual(msg.replies.length, 0);
        assert.strictEqual(
            sheetReadCalls.filter(call => expensiveSheets.has(call.sheetName)).length,
            readsBefore
        );
    }

    assert.strictEqual(rateLimitCheckCount, messages.length);
    assert.strictEqual(mediaDownloads, 0);
});

stateMachineTest('audio ingress claims duplicate id before asynchronous transcription', async () => {
    resetState();
    audioHandleDelayMs = 25;
    const first = createMockAudioMessage('ajuda');
    const second = createMockAudioMessage('ajuda');
    second.id.id = first.id.id;
    enqueueStructuredResponse({ intent: 'ajuda' });

    await Promise.all([handleMessage(first), handleMessage(second)]);

    assert.strictEqual(audioHandleCalls, 1);

    const replay = createMockAudioMessage('ajuda');
    replay.id.id = first.id.id;
    await handleMessage(replay);

    assert.strictEqual(audioHandleCalls, 1, 'reentrega dentro do TTL não pode transcrever novamente');
});

stateMachineTest('message ingress serializes distinct messages from the same sender', async () => {
    resetState();
    usersSheetReadDelayMs = 30;
    userService.invalidateUserCaches();
    const first = createMockMessage('ajuda');
    const second = createMockMessage('ajuda');

    await Promise.all([handleMessage(first), handleMessage(second)]);

    assert.strictEqual(maxConcurrentUsersSheetReads, 1);
    assert.ok(first.replies.length > 0);
    assert.ok(second.replies.length > 0);
});

stateMachineTest('message ingress lets different senders execute concurrently', async () => {
    resetState();
    sheets.Users.push(partnerUserRow());
    usersSheetReadDelayMs = 30;
    userService.invalidateUserCaches();
    const first = createMockMessage('ajuda');
    const second = createMockMessageFrom('ajuda', PARTNER_SENDER);

    await Promise.all([handleMessage(first), handleMessage(second)]);

    assert.strictEqual(maxConcurrentUsersSheetReads, 2);
});

stateMachineTest('message ingress consumes a confirmation state only once under concurrency', async () => {
    resetState();
    appendRowDelayMs = 30;
    userStateManager.setState(SENDER, {
        action: 'confirming_transactions',
        data: {
            person: 'Usuario Estado',
            transactions: [{
                type: 'Saídas',
                data: '10/02/2026',
                descricao: 'lanche concorrente',
                categoria: 'Alimentação',
                subcategoria: 'PADARIA / LANCHE',
                valor: 80,
                pagamento: 'PIX',
                recorrente: 'Não'
            }]
        }
    });
    const first = createMockMessage('sim');
    const second = createMockMessage('sim');

    await Promise.all([handleMessage(first), handleMessage(second)]);

    assert.strictEqual(appendedRows.filter(entry => entry.sheetName === 'Saídas').length, 1);
    assert.strictEqual(sheets.Saídas.length, 2);
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});

stateMachineTest('message ingress consumes confirmation before a post-commit reply failure', async () => {
    resetState();
    userStateManager.setState(SENDER, {
        action: 'confirming_transactions',
        data: {
            person: 'Usuario Estado',
            transactions: [{
                type: 'Saídas',
                data: '10/02/2026',
                descricao: 'lanche com falha de resposta',
                categoria: 'Alimentação',
                subcategoria: 'PADARIA / LANCHE',
                valor: 80,
                pagamento: 'PIX',
                recorrente: 'Não'
            }]
        }
    });
    const first = createMockMessage('sim');
    first.reply = async () => {
        throw new Error('simulated post-commit reply failure');
    };
    const second = createMockMessage('sim');

    await Promise.all([handleMessage(first), handleMessage(second)]);

    assert.strictEqual(appendedRows.filter(entry => entry.sheetName === 'Saídas').length, 1);
    assert.strictEqual(sheets.Saídas.length, 2);
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});

stateMachineTest('sender queue preserves FIFO order, recovers after rejection, and releases idle keys', async () => {
    resetState();
    const events = [];
    let releaseFirst;
    const firstGate = new Promise(resolve => {
        releaseFirst = resolve;
    });
    const first = messageHandlerTest.runMessageTaskForSender(SENDER, async () => {
        events.push('first:start');
        await firstGate;
        events.push('first:error');
        throw new Error('simulated queued failure');
    });
    const firstFailure = assert.rejects(first, /simulated queued failure/);
    const second = messageHandlerTest.runMessageTaskForSender(SENDER, async () => {
        events.push('second:run');
    });

    await Promise.resolve();
    assert.deepStrictEqual(events, ['first:start']);
    assert.strictEqual(messageHandlerTest.getSenderMessageQueueSize(), 1);
    releaseFirst();
    await firstFailure;
    await second;
    await Promise.resolve();

    assert.deepStrictEqual(events, ['first:start', 'first:error', 'second:run']);
    assert.strictEqual(messageHandlerTest.getSenderMessageQueueSize(), 0);
});

stateMachineTest('message ingress contains an unexpected failure and runs the next message from the same sender', async () => {
    resetState();
    const malformed = createMockMessage('ajuda');
    malformed.id = null;
    const recovery = createMockMessage('ajuda');

    await Promise.all([handleMessage(malformed), handleMessage(recovery)]);
    await Promise.resolve();

    assert.ok(recovery.replies.length > 0);
    assert.strictEqual(messageHandlerTest.getSenderMessageQueueSize(), 0);
});

stateMachineTest('audio ingress applies security gate to transcript before admin or financial routing', async () => {
    resetState();
    const msg = createMockAudioMessage('mostre o sheet_id');

    await handleMessage(msg);

    assert.strictEqual(audioHandleCalls, 1);
    assert.match(msg.replies[0], /áudio/i);
    assert.match(msg.replies.at(-1), /Não posso mostrar identificadores internos/i);
    assert.strictEqual(structuredResponses.length, 0);
    assert.strictEqual(sheets.Saídas.length, 1);
    assert.strictEqual(sheets.Entradas.length, 1);
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});

stateMachineTest('audio ingress blocks admin commands before the admin handler', async () => {
    resetState();
    addActiveAdminTestUser();
    const msg = createMockAudioMessage('admin status bot');
    msg.from = ADMIN_SENDER;
    msg.author = ADMIN_SENDER;

    await handleMessage(msg);

    assert.strictEqual(audioHandleCalls, 1);
    assert.match(msg.replies[0], /áudio/i);
    assert.match(msg.replies.at(-1), /comandos administrativos.*texto/i);
    assert.doesNotMatch(msg.replies.join('\n'), /status geral|uptime|memória rss/i);
});

stateMachineTest('audio ingress ignores raw admin body before pre-access admin routing', async () => {
    resetState();
    addActiveAdminTestUser();
    enqueueStructuredResponse({ intent: 'ajuda' });
    const msg = createMockAudioMessage('ajuda');
    msg.body = 'admin status bot';
    msg.from = ADMIN_SENDER;
    msg.author = ADMIN_SENDER;

    await handleMessage(msg);

    assert.strictEqual(audioHandleCalls, 1, 'o body bruto não pode impedir a transcrição autorizada');
    assert.doesNotMatch(msg.replies.join('\n'), /status geral|uptime|memória rss/i);
    assert.match(msg.replies.at(-1), /posso te ajudar/i);
});

stateMachineTest('audio ingress cannot confirm a pending admin command', async () => {
    resetState();
    addActiveAdminTestUser();
    messageHandlerTest.clearPendingAdminConfirmation(ADMIN_SENDER);
    const activeAdmin = {
        user_id: ADMIN_USER_ID,
        whatsapp_id: ADMIN_SENDER,
        display_name: 'Admin Estado',
        status: 'ACTIVE'
    };
    const command = createMockMessage('admin aprovar 5599999999999');
    command.from = ADMIN_SENDER;
    command.author = ADMIN_SENDER;

    try {
        const pendingHandled = await messageHandlerTest.handleAdminCommandBeforeAccess(
            command,
            ADMIN_SENDER,
            { allowed: true, user: activeAdmin }
        );
        assert.strictEqual(pendingHandled, true);
        assert.ok(messageHandlerTest.getPendingAdminConfirmation(ADMIN_SENDER));

        const confirmation = createMockAudioMessage('confirmar admin');
        confirmation.from = ADMIN_SENDER;
        confirmation.author = ADMIN_SENDER;
        await handleMessage(confirmation);

        assert.strictEqual(audioHandleCalls, 1);
        assert.match(confirmation.replies.at(-1), /comandos administrativos.*texto/i);
        assert.ok(
            messageHandlerTest.getPendingAdminConfirmation(ADMIN_SENDER),
            'áudio bloqueado não pode consumir a confirmação pendente'
        );
    } finally {
        messageHandlerTest.clearPendingAdminConfirmation(ADMIN_SENDER);
    }
});

stateMachineTest('audio ingress raw body cannot consume a pending admin confirmation', async () => {
    resetState();
    addActiveAdminTestUser();
    messageHandlerTest.clearPendingAdminConfirmation(ADMIN_SENDER);
    const activeAdmin = {
        user_id: ADMIN_USER_ID,
        whatsapp_id: ADMIN_SENDER,
        display_name: 'Admin Estado',
        status: 'ACTIVE'
    };
    const command = createMockMessage('admin aprovar 5599999999999');
    command.from = ADMIN_SENDER;
    command.author = ADMIN_SENDER;

    try {
        const pendingHandled = await messageHandlerTest.handleAdminCommandBeforeAccess(
            command,
            ADMIN_SENDER,
            { allowed: true, user: activeAdmin }
        );
        assert.strictEqual(pendingHandled, true);
        assert.ok(messageHandlerTest.getPendingAdminConfirmation(ADMIN_SENDER));

        enqueueStructuredResponse({ intent: 'ajuda' });
        const confirmation = createMockAudioMessage('ajuda');
        confirmation.body = 'confirmar admin';
        confirmation.from = ADMIN_SENDER;
        confirmation.author = ADMIN_SENDER;
        await handleMessage(confirmation);

        assert.strictEqual(audioHandleCalls, 1);
        assert.match(confirmation.replies.at(-1), /posso te ajudar/i);
        assert.ok(
            messageHandlerTest.getPendingAdminConfirmation(ADMIN_SENDER),
            'body bruto de áudio não pode consumir a confirmação pendente'
        );
    } finally {
        messageHandlerTest.clearPendingAdminConfirmation(ADMIN_SENDER);
    }
});

stateMachineTest('financial states: new expense command interrupts pending statement import confirmation', async () => {
    resetState();
    userStateManager.setState(SENDER, {
        action: 'confirming_statement_import',
        data: {
            transactions: [
                {
                    type: 'Saídas',
                    data: '17/05/2026',
                    descricao: 'Mercado antigo',
                    valor: 35.35,
                    userId: USER_ID
                }
            ],
            filename: 'extrato-antigo.csv',
            importKind: 'checking',
            person: 'Usuario Estado',
            userId: USER_ID
        }
    });
    enqueueStructuredResponse({
        intent: 'gasto',
        gastoDetails: [
            {
                descricao: 'material para reforma da casa',
                valor: 27.80,
                categoria: 'Casa',
                subcategoria: 'Reforma',
                recorrente: 'Não'
            }
        ]
    });

    const reply = await send('gastei 27,80 comprando material para reforma da casa');

    assert.doesNotMatch(reply, /importar os lançamentos/i);
    assert.match(reply, /forma de pagamento/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_payment_method');
    assert.strictEqual(userStateManager.getState(SENDER).data.gasto.descricao, 'material para reforma da casa');
});

stateMachineTest('financial states: terms command is not swallowed by incomplete onboarding', async () => {
    resetState();
    sheets.UserProfile[1][6] = '';

    const reply = await send('termos');

    assert.match(reply, /Resumo legal/i);
    assert.doesNotMatch(reply, /Antes de começarmos/i);
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});

stateMachineTest('financial states: settings commands update UserSettings and clear state', async () => {
    resetState();

    let reply = await send('ativar checkin semanal');
    assert.match(reply, /Check-in semanal ativado/i);
    assert.strictEqual(sheets.UserSettings[1][2], 'SIM');

    reply = await send('desativar checkin semanal');
    assert.match(reply, /Check-in semanal desativado/i);
    assert.strictEqual(sheets.UserSettings[1][2], 'NÃO');

    reply = await send('definir reserva 12%');
    assert.match(reply, /12%/);
    assert.strictEqual(sheets.UserSettings[1][6], 'SIM');
    assert.strictEqual(String(sheets.UserSettings[1][7]), '12');

    reply = await send('desativar reserva');
    assert.match(reply, /reserva desativada/i);
    assert.strictEqual(sheets.UserSettings[1][6], 'NÃO');
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});

stateMachineTest('financial states: monthly budget settings command stores the monthly free budget', async () => {
    resetState();

    const reply = await send('definir orçamento mensal 3000 dia 5');

    assert.match(reply, /orçamento mensal livre/i);
    assert.match(reply, /R\$ 3\.000,00/);
    assert.match(reply, /Ciclo/i);
    assert.strictEqual(sheets.UserSettings[1][13], 'SIM');
    assert.strictEqual(String(sheets.UserSettings[1][14]), '3000');
    assert.strictEqual(sheets.UserSettings[1][17], 'personal');
    assert.strictEqual(sheets.UserSettings[1][18], '5');
    assert.strictEqual(sheets.UserSettings[1][8], 'NÃO');
});

stateMachineTest('financial states: monthly budget asks for cycle start day when omitted', async () => {
    resetState();

    let reply = await send('definir orçamento mensal 3000');

    assert.match(reply, /qual dia/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_monthly_budget_cycle_start_day');

    reply = await send('17');

    assert.match(reply, /Orçamento mensal livre pessoal configurado/i);
    assert.strictEqual(sheets.UserSettings[1][18], '17');
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});

stateMachineTest('financial states: monthly budget asks for scope when user has family sharing', async () => {
    resetState();
    financialScopeUserIds = [USER_ID, PARTNER_ID];

    let reply = await send('definir orçamento mensal 3000 dia 5');

    assert.match(reply, /pessoal ou da família/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_monthly_budget_scope');

    reply = await send('família');

    assert.match(reply, /Orçamento mensal livre familiar configurado/i);
    assert.strictEqual(sheets.UserSettings[1][13], 'SIM');
    assert.strictEqual(String(sheets.UserSettings[1][14]), '3000');
    assert.strictEqual(sheets.UserSettings[1][17], 'family');
    assert.strictEqual(sheets.UserSettings[1][18], '5');
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});

stateMachineTest('financial states: monthly budget can ask for amount before scope', async () => {
    resetState();
    financialScopeUserIds = [USER_ID, PARTNER_ID];

    let reply = await send('definir orçamento mensal');

    assert.match(reply, /Qual é o valor/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_monthly_budget_amount');

    reply = await send('2500');

    assert.match(reply, /qual dia/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_monthly_budget_cycle_start_day');

    reply = await send('17');

    assert.match(reply, /pessoal ou da família/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_monthly_budget_scope');

    reply = await send('família');

    assert.match(reply, /Orçamento mensal livre familiar configurado/i);
    assert.strictEqual(String(sheets.UserSettings[1][14]), '2500');
    assert.strictEqual(sheets.UserSettings[1][17], 'family');
    assert.strictEqual(sheets.UserSettings[1][18], '17');
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});

stateMachineTest('financial states: owner can switch an existing monthly budget to family scope after sharing', async () => {
    resetState();
    financialScopeUserIds = [USER_ID, PARTNER_ID];
    sheets.UserSettings[1][13] = 'SIM';
    sheets.UserSettings[1][14] = '3000';
    sheets.UserSettings[1][17] = 'personal';

    const reply = await send('orçamento mensal família');

    assert.match(reply, /alterado para familiar/i);
    assert.strictEqual(sheets.UserSettings[1][17], 'family');
});

stateMachineTest('financial states: monthly budget alert fires when spending reaches the daily pace milestone', async () => {
    resetState();
    sheets.UserSettings[1][13] = 'SIM';
    sheets.UserSettings[1][14] = String(50 * daysRemainingTodaySaoPaulo());
    sheets.Saídas.push([todayBr(), 'restaurante anterior', 'Alimentação', 'RESTAURANTE', 20, 'Usuario Estado', 'PIX', 'Não', '', USER_ID]);
    enqueueStructuredResponse({
        intent: 'gasto',
        gastoDetails: [{
            descricao: 'lanche',
            valor: 25,
            categoria: 'Alimentação',
            subcategoria: 'PADARIA / LANCHE',
            pagamento: 'PIX',
            recorrente: 'Não',
            data: todayBr()
        }]
    });

    const reply = await send('gastei 25 no lanche no pix');

    assert.match(reply, /orçamento mensal/i);
    assert.match(reply, /90%/);
    assert.strictEqual(sheets.UserSettings[1][15], todayBr());
    assert.strictEqual(String(sheets.UserSettings[1][16]), '80');
});

stateMachineTest('financial states: monthly budget alert ignores supermarket spending', async () => {
    resetState();
    sheets.UserSettings[1][13] = 'SIM';
    sheets.UserSettings[1][14] = String(10 * daysRemainingTodaySaoPaulo());
    enqueueStructuredResponse({
        intent: 'gasto',
        gastoDetails: [{
            descricao: 'mercado',
            valor: 20,
            categoria: 'Alimentação',
            subcategoria: 'SUPERMERCADO',
            pagamento: 'PIX',
            recorrente: 'Não',
            data: todayBr()
        }]
    });

    const reply = await send('gastei 20 no mercado no pix');

    assert.match(reply, /registrado|lançado/i);
    assert.doesNotMatch(reply, /orçamento mensal/i);
    assert.strictEqual(sheets.UserSettings[1][15], '');
    assert.strictEqual(sheets.UserSettings[1][16], '');
});

stateMachineTest('financial states: reminder creation writes Calendar event scoped to user', async () => {
    resetState();
    enqueueStructuredResponse({
        intent: 'criar_lembrete',
        lembreteDetails: {
            titulo: 'Pagar IPVA',
            dataHora: '12/05/2026 09:00',
            recorrencia: ''
        }
    });

    const reply = await send('me lembre de pagar o IPVA amanhã às 9h');

    assert.match(reply, /Lembrete criado/i);
    assert.strictEqual(createdCalendarEvents.length, 1);
    assert.strictEqual(createdCalendarEvents[0].title, 'Pagar IPVA');
    assert.strictEqual(createdCalendarEvents[0].startDateTime, '12/05/2026 09:00');
    assert.strictEqual(createdCalendarEvents[0].options.userId, USER_ID);
    assert.strictEqual(createdCalendarEvents[0].options.whatsappId, SENDER);
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});

stateMachineTest('financial states: credit card selection validates input and installment writes keep user_id', async () => {
    resetState();
    userStateManager.setState(SENDER, {
        action: 'awaiting_payment_method',
        data: {
            gasto: {
                data: '10/02/2026',
                descricao: 'mercado',
                categoria: 'Alimentação',
                valor: 200,
                recorrente: 'Não'
            }
        }
    });

    assert.match(await send('crédito'), /qual cartão/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_credit_card_selection');

    assert.match(await send('99'), /opção inválida/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_credit_card_selection');

    assert.match(await send('1'), /parcelas/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_installment_number');

    assert.match(await send('0'), /número inválido/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_installment_number');

    assert.match(await send('2'), /lançado em 2x/i);
    const cardRows = CARD_SHEETS.flatMap(sheetName => sheets[sheetName].slice(1));
    assert.strictEqual(cardRows.length, 2);
    assert.ok(cardRows.every(row => row[6] === USER_ID));
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});

stateMachineTest('financial states: complete credit-card expense uses the deterministic card route', async () => {
    resetState();
    const reply = await send('Gastei R$ 4,58 no Mercado TESTE_APAGAR_ATOR_CARTAO_20260710 hoje, na categoria Alimentação, no crédito, no cartão Nubank - Thais, em 1x');

    assert.match(reply, /lançado no/i);
    assert.match(reply, /Cartão Nubank - Thais/i);
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
    assert.strictEqual(sheets['Cartão Nubank - Thais'].length, 2);
    assert.strictEqual(sheets['Cartão Nubank - Thais'][1][1], 'Mercado TESTE_APAGAR_ATOR_CARTAO_20260710');
    assert.strictEqual(sheets['Cartão Nubank - Thais'][1][3], 4.58);
    assert.strictEqual(sheets['Cartão Nubank - Thais'][1][4], '1/1');
    assert.strictEqual(sheets['Cartão Nubank - Thais'][1].at(-1), USER_ID);
});

stateMachineTest('financial states: enforce guides a credit expense through missing card and installments', async () => {
    resetState();
    const previousMode = process.env.INTERPRETATION_RELIABILITY_MODE;
    const previousOperations = process.env.INTERPRETATION_RELIABILITY_OPERATIONS;
    process.env.INTERPRETATION_RELIABILITY_MODE = 'enforce';
    process.env.INTERPRETATION_RELIABILITY_OPERATIONS = 'expense.create,income.create';
    enqueueStructuredResponse({
        intent: 'gasto',
        gastoDetails: [{
            descricao: 'roupa',
            valor: 7.77,
            categoria: 'Vestuário',
            subcategoria: 'ROUPA',
            pagamento: 'Crédito',
            recorrente: 'Não'
        }]
    });

    try {
        const reply = await send('gastei 7,77 comprando roupa no crédito');

        assert.match(reply, /qual cartão/i);
        assert.doesNotMatch(reply, /conflito/i);
        assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_credit_card_selection');
        assert.ok(CARD_SHEETS.every(sheetName => sheets[sheetName].length === 1));
    } finally {
        if (previousMode === undefined) delete process.env.INTERPRETATION_RELIABILITY_MODE;
        else process.env.INTERPRETATION_RELIABILITY_MODE = previousMode;
        if (previousOperations === undefined) delete process.env.INTERPRETATION_RELIABILITY_OPERATIONS;
        else process.env.INTERPRETATION_RELIABILITY_OPERATIONS = previousOperations;
    }
});

stateMachineTest('financial states: enforce allows deterministic complete credit card expense with explicit card and installments', async () => {
    resetState();
    const previousMode = process.env.INTERPRETATION_RELIABILITY_MODE;
    const previousOperations = process.env.INTERPRETATION_RELIABILITY_OPERATIONS;
    process.env.INTERPRETATION_RELIABILITY_MODE = 'enforce';
    process.env.INTERPRETATION_RELIABILITY_OPERATIONS = 'expense.create,income.create';
    enqueueStructuredResponse({
        intent: 'gasto',
        gastoDetails: [{
            descricao: 'mercado',
            valor: 10,
            categoria: 'Alimentação',
            subcategoria: 'SUPERMERCADO',
            pagamento: 'Crédito',
            recorrente: 'Não'
        }]
    });

    try {
        const reply = await send('gastei 10 reais no mercado no crédito no cartão nubank thais à vista');

        assert.match(reply, /lançado no/i);
        assert.match(reply, /Cartão Nubank - Thais/i);
        assert.doesNotMatch(reply, /conflito|forma de pagamento|qual cartão|parcelas/i);
        assert.strictEqual(userStateManager.getState(SENDER), undefined);
        assert.strictEqual(sheets['Cartão Nubank - Thais'].length, 2);
        assert.strictEqual(sheets['Cartão Nubank - Thais'][1][3], 10);
        assert.strictEqual(sheets['Cartão Nubank - Thais'][1][4], '1/1');
        assert.strictEqual(sheets['Cartão Nubank - Thais'][1].at(-1), USER_ID);
    } finally {
        if (previousMode === undefined) delete process.env.INTERPRETATION_RELIABILITY_MODE;
        else process.env.INTERPRETATION_RELIABILITY_MODE = previousMode;
        if (previousOperations === undefined) delete process.env.INTERPRETATION_RELIABILITY_OPERATIONS;
        else process.env.INTERPRETATION_RELIABILITY_OPERATIONS = previousOperations;
    }
});

stateMachineTest('5B personal spreadsheet forecasts bypass the central agent source and read an owned family goal', async () => {
    resetState();
    usesPersonalSpreadsheet = true;
    personalSheetOverrides.Metas = [
        ['Nome da Meta', 'Valor Alvo', 'Valor Atual', '% Progresso', 'Valor Mensal Necessário', 'Data Fim', 'Status', 'Prioridade', 'user_id', 'Escopo', 'Última Movimentação'],
        ['Reserva', '2.000,00', '0,00', '0%', '200,00', '', 'Ativa', 'Alta', USER_ID, 'family']
    ];
    const previousMode = process.env.FINANCIAL_AGENT_MODE;
    const previousCanaryUsers = process.env.FINANCIAL_AGENT_CANARY_USER_IDS;
    process.env.FINANCIAL_AGENT_MODE = 'canary';
    process.env.FINANCIAL_AGENT_CANARY_USER_IDS = USER_ID;
    cache.flushAll();

    try {
        const baseline = await send('Quando alcanço minha meta?');
        const contribution = await send('Se eu aportar R$ 300 por mês na meta, quando alcanço?');
        const withdrawal = await send('Se eu retirar R$ 200 da meta, quando alcanço?');
        const explicitPersonal = await send('Quando alcanço minha meta pessoal?');
        const missingDebt = await send('Quanto falta quitar da dívida do banco?');

        assert.match(baseline, /Meta: Reserva/);
        assert.match(baseline, /Quanto falta hoje: R\$ 2\.000,00/);
        assert.match(baseline, /Conclusão projetada/);
        assert.match(contribution, /Simulação: aporte mensal total de R\$ 300,00/);
        assert.match(contribution, /Conclusão simulada/);
        assert.match(withdrawal, /Simulação: retirada de R\$ 200,00/);
        assert.match(withdrawal, /Conclusão simulada/);
        assert.match(explicitPersonal, /Não encontrei um plano ativo e autorizado/);
        assert.match(explicitPersonal, /Nenhum valor ausente foi tratado como zero/);
        assert.match(missingDebt, /Não encontrei um plano ativo e autorizado/);
        assert.match(missingDebt, /Nenhum valor ausente foi tratado como zero/);
        assert.doesNotMatch(
            [baseline, contribution, withdrawal, missingDebt].join('\n'),
            /Desculpe, não entendi|configure suas metas|nenhuma meta financeira cadastrada/i
        );
        assert.ok(
            sheetReadCalls
                .filter(call => call.sheetName === 'Metas')
                .every(call => call.options.userId === USER_ID),
            'toda leitura de Metas deve usar o contexto da planilha pessoal'
        );
        assert.ok(
            sheetReadCalls
                .filter(call => call.sheetName === 'Dívidas')
                .every(call => call.options.userId === USER_ID),
            'toda leitura de Dívidas deve usar o contexto da planilha pessoal'
        );
        assert.strictEqual(appendedRows.length, 0);
        assert.strictEqual(deletedRows.length, 0);
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_AGENT_MODE;
        else process.env.FINANCIAL_AGENT_MODE = previousMode;
        if (previousCanaryUsers === undefined) delete process.env.FINANCIAL_AGENT_CANARY_USER_IDS;
        else process.env.FINANCIAL_AGENT_CANARY_USER_IDS = previousCanaryUsers;
        cache.flushAll();
    }
});

stateMachineTest('financial states: explicit personal card name ignores separators and skips redundant questions', async () => {
    resetState();
    usesPersonalSpreadsheet = true;
    sheets.Cartões = [
        ['card_id', 'Nome do Cartão', 'Dia de Vencimento', 'Dia de Fechamento', 'Bandeira', 'Ativo', 'Observações'],
        ['card-thais', 'Nubank - Thais', '5', '29', 'Mastercard', 'SIM', '']
    ];
    enqueueStructuredResponse({
        intent: 'gasto',
        gastoDetails: [{
            descricao: 'mercado',
            valor: 10,
            categoria: 'Alimentação',
            subcategoria: 'SUPERMERCADO',
            pagamento: 'Crédito',
            recorrente: 'Não'
        }]
    });

    const reply = await send('gastei 10 reais no mercado no crédito no cartão nubank thais à vista');

    assert.match(reply, /lançado no/i);
    assert.match(reply, /Cartão Nubank - Thais/i);
    assert.doesNotMatch(reply, /qual cartão|parcelas/i);
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
    assert.strictEqual(sheets['Cartão Nubank - Thais'].length, 2);
    assert.strictEqual(sheets['Cartão Nubank - Thais'][1][3], 10);
    assert.strictEqual(sheets['Cartão Nubank - Thais'][1][4], '1/1');
    assert.strictEqual(sheets['Cartão Nubank - Thais'][1].at(-1), USER_ID);
});

stateMachineTest('financial states: generic personal card name remains ambiguous when multiple cards match', async () => {
    resetState();
    usesPersonalSpreadsheet = true;
    sheets.Cartões = [
        ['card_id', 'Nome do Cartão', 'Dia de Vencimento', 'Dia de Fechamento', 'Bandeira', 'Ativo', 'Observações'],
        ['card-daniel', 'Nubank - Daniel', '5', '8', 'Mastercard', 'SIM', ''],
        ['card-thais', 'Nubank - Thais', '5', '29', 'Mastercard', 'SIM', '']
    ];
    enqueueStructuredResponse({
        intent: 'gasto',
        gastoDetails: [{
            descricao: 'mercado',
            valor: 10,
            categoria: 'Alimentação',
            subcategoria: 'SUPERMERCADO',
            pagamento: 'Crédito',
            recorrente: 'Não'
        }]
    });

    const reply = await send('gastei 10 reais no mercado no crédito no cartão nubank à vista');

    assert.match(reply, /qual cartão/i);
    assert.match(reply, /1\. Nubank - Daniel/i);
    assert.match(reply, /2\. Nubank - Thais/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_credit_card_selection');
    assert.strictEqual(sheets['Cartão Nubank - Daniel'].length, 1);
    assert.strictEqual(sheets['Cartão Nubank - Thais'].length, 1);
});

stateMachineTest('financial states: explicit card name overrides mistaken debit classification when debit was not said', async () => {
    resetState();
    enqueueStructuredResponse({
        intent: 'gasto',
        gastoDetails: [{
            descricao: 'restaurante malz',
            valor: 125.25,
            categoria: 'Alimentação',
            subcategoria: 'RESTAURANTE',
            pagamento: 'Débito',
            recorrente: 'Não'
        }]
    });

    const reply = await send('gastei 125,25 hoje no restaurante malz à vista no cartão nubank thais');

    assert.match(reply, /lançado no/i);
    assert.match(reply, /Cartão Nubank - Thais/i);
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
    assert.strictEqual(sheets['Saídas'].length, 1);
    assert.strictEqual(sheets['Cartão Nubank - Thais'].length, 2);
    assert.strictEqual(sheets['Cartão Nubank - Thais'][1][3], 125.25);
    assert.strictEqual(sheets['Cartão Nubank - Thais'][1][4], '1/1');
    assert.strictEqual(sheets['Cartão Nubank - Thais'][1].at(-1), USER_ID);
});

stateMachineTest('financial states: manual caixinha application is saved as transfer not income', async () => {
    resetState();
    enqueueStructuredResponse({
        intent: 'entrada',
        entradaDetails: [{
            data: '31/05/2026',
            descricao: 'Caixinha do Nubank',
            categoria: 'Outros',
            valor: 6666.62,
            recebimento: 'Poupança',
            recorrente: 'Não'
        }]
    });

    const reply = await send('guardei 6666,62 na caixinha do nubank');

    assert.match(reply, /\[Transferência\].*Caixinha do Nubank/i);
    assert.strictEqual(sheets.Entradas.length, 1);
    assert.strictEqual(sheets.Transferências.length, 1);

    const confirmationReply = await send('sim');

    assert.match(confirmationReply, /1 de 1 itens foram salvos/i);
    assert.strictEqual(sheets.Transferências.length, 2);
    assert.strictEqual(sheets.Transferências[1][1], 'Caixinha do Nubank');
    assert.strictEqual(sheets.Transferências[1][2], 6666.62);
    assert.strictEqual(sheets.Transferências[1][4], 'Caixinha Nubank');
    assert.strictEqual(sheets.Transferências[1][7], 'Movimentação de reserva/investimento');
    assert.strictEqual(sheets.Transferências[1][8], USER_ID);
});

stateMachineTest('financial states: reserve redemption is saved as transfer not income', async () => {
    resetState();

    const reply = await send('recebi 900 da caixinha do nubank');

    assert.match(reply, /Transferência de R\$ 900,00/i);
    assert.strictEqual(sheets.Entradas.length, 1);
    assert.strictEqual(sheets.Transferências.length, 2);
    assert.strictEqual(sheets.Transferências[1][1], 'caixinha do nubank');
    assert.strictEqual(sheets.Transferências[1][2], 900);
    assert.strictEqual(sheets.Transferências[1][3], 'Caixinha Nubank');
    assert.strictEqual(sheets.Transferências[1][7], 'Movimentação de reserva/investimento');
    assert.strictEqual(sheets.Transferências[1][8], USER_ID);
});

stateMachineTest('financial states: ambiguous income reserve question asks clarification without Gemini', async () => {
    resetState();

    const reply = await send('quanto dinheiro entrou na caixinha?');

    assert.match(reply, /Isso pode ser renda nova ou movimentação de reserva/i);
    assert.match(reply, /renda|transferência/i);
    assert.strictEqual(structuredResponses.length, 0);
});

stateMachineTest('financial states: transfer to family member is saved as internal transfer not expense', async () => {
    resetState();
    sheets.Users.push(partnerUserRow());
    financialScopeUserIds = [USER_ID, PARTNER_ID];
    enqueueStructuredResponse({
        intent: 'gasto',
        gastoDetails: [{
            data: '31/05/2026',
            descricao: 'Transferência para Thais',
            categoria: 'Outros',
            subcategoria: 'Outros',
            valor: 1269.74,
            pagamento: 'PIX',
            recorrente: 'Não'
        }]
    });

    const reply = await send('transferi 1269,74 para a thais');

    assert.match(reply, /\[Transferência\].*Transferência para Thais/i);
    assert.strictEqual(sheets.Saídas.length, 1);
    assert.strictEqual(sheets.Transferências.length, 1);

    const confirmationReply = await send('sim');

    assert.match(confirmationReply, /1 de 1 itens foram salvos/i);
    assert.strictEqual(sheets.Transferências.length, 2);
    assert.strictEqual(sheets.Transferências[1][1], 'Transferência para Thais');
    assert.strictEqual(sheets.Transferências[1][2], 1269.74);
    assert.strictEqual(sheets.Transferências[1][4], 'Thais');
    assert.strictEqual(sheets.Transferências[1][5], 'PIX');
    assert.strictEqual(sheets.Transferências[1][7], 'Provável transferência interna');
    assert.strictEqual(sheets.Transferências[1][8], USER_ID);
});

stateMachineTest('financial states: reserve transfer asks explicit origin and destination accounts before saving', async () => {
    resetState();
    sheets['Contas Financeiras'].push(
        ['Daniel - Nubank', 'bank', '262,85', '03/07/2026', 'active', 'BRL', 'Daniel', USER_ID, ''],
        ['Daniel - Nubank Caixinha', 'reserve', '1264,91', '03/07/2026', 'active', 'BRL', 'Daniel', USER_ID, '']
    );

    const originQuestion = await send('recebi 90 da caixinha do nubank no dia 30 de junho');
    assert.match(originQuestion, /De qual conta financeira saiu/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_transfer_origin_account');
    assert.strictEqual(sheets.Transferências.length, 1);

    const invalidOrigin = await send('9');
    assert.match(invalidOrigin, /Não consegui identificar a conta financeira de origem/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_transfer_origin_account');

    const destinationQuestion = await send('2');
    assert.match(destinationQuestion, /Para qual conta financeira entrou/i);
    assert.doesNotMatch(destinationQuestion, /Daniel - Nubank Caixinha/);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_transfer_destination_account');

    const confirmation = await send('1');
    assert.match(confirmation, /Daniel - Nubank Caixinha.*Daniel - Nubank/is);
    assert.match(confirmation, /30\/06\/2026/);
    assert.match(confirmation, /Concluída/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_manual_transfer');

    const saved = await send('sim');
    assert.match(saved, /Transferência.*registrada/i);
    assert.deepStrictEqual(sheets.Transferências[1].slice(0, 9), [
        '30/06/2026',
        'caixinha do nubank no dia 30 de junho',
        90,
        'Daniel - Nubank Caixinha',
        'Daniel - Nubank',
        'Transferência',
        'Movimentação de reserva/investimento registrada pelo WhatsApp; não conta como gasto nem renda.',
        'Concluída',
        USER_ID
    ]);
});

stateMachineTest('financial states: transfer destination cannot reuse the selected origin account', async () => {
    resetState();
    sheets['Contas Financeiras'].push(
        ['Daniel - Nubank', 'bank', '262,85', '03/07/2026', 'active', 'BRL', 'Daniel', USER_ID, ''],
        ['Daniel - Nubank Caixinha', 'reserve', '1264,91', '03/07/2026', 'active', 'BRL', 'Daniel', USER_ID, '']
    );

    assert.match(await send('recebi 91 da caixinha do nubank'), /De qual conta financeira saiu/i);
    assert.match(await send('2'), /Para qual conta financeira entrou/i);
    const invalid = await send('Daniel - Nubank Caixinha');

    assert.match(invalid, /Não consegui identificar a conta financeira de destino/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_transfer_destination_account');
    assert.strictEqual(sheets.Transferências.length, 1);
});

stateMachineTest('financial states: transfer with only one account blocks safely and clears intermediate state', async () => {
    resetState();
    sheets['Contas Financeiras'].push(
        ['Daniel - Nubank', 'bank', '262,85', '03/07/2026', 'active', 'BRL', 'Daniel', USER_ID, '']
    );
    userStateManager.setState(SENDER, {
        action: 'awaiting_receipt_method',
        data: {
            type: 'Entradas',
            descricao: 'caixinha do nubank',
            valor: 50,
            categoria: 'Outros',
            recorrente: 'Não',
            originalMessage: 'guardei 50 na caixinha do nubank'
        }
    });

    const blocked = await send('Poupança');

    assert.match(blocked, /Cadastre pelo menos duas contas financeiras ativas/i);
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
    assert.strictEqual(sheets.Transferências.length, 1);
});

stateMachineTest('financial states: pending family transfer preserves date and cancels after explicit accounts', async () => {
    resetState();
    sheets.Users.push(partnerUserRow());
    financialScopeUserIds = [USER_ID, PARTNER_ID];
    sheets['Contas Financeiras'].push(
        ['Daniel - Nubank', 'bank', '262,85', '03/07/2026', 'active', 'BRL', 'Daniel', USER_ID, ''],
        ['Daniel - Nubank Caixinha', 'reserve', '1264,91', '03/07/2026', 'active', 'BRL', 'Daniel', USER_ID, ''],
        ['Thais - Nubank', 'bank', '0,00', '03/07/2026', 'active', 'BRL', 'Thais', PARTNER_ID, ''],
        ['Thais - Itau', 'bank', '133,46', '03/07/2026', 'active', 'BRL', 'Thais', PARTNER_ID, '']
    );
    enqueueStructuredResponse({
        intent: 'gasto',
        gastoDetails: [{
            data: '10/07/2026',
            descricao: 'Transferência pendente para Thais',
            categoria: 'Outros',
            subcategoria: 'Outros',
            valor: 25,
            pagamento: 'PIX',
            recorrente: 'Não'
        }]
    });

    assert.match(await send('transferi 25 para a thais no dia 10 de julho e ficou pendente'), /\[Transferência\]/i);
    assert.match(await send('sim'), /De qual conta financeira saiu/i);
    assert.match(await send('1'), /Para qual conta financeira entrou/i);
    const confirmation = await send('2');
    assert.match(confirmation, /Daniel - Nubank.*Thais - Nubank/is);
    assert.match(confirmation, /10\/07\/2026/);
    assert.match(confirmation, /Pendente/i);

    const cancelled = await send('não');
    assert.match(cancelled, /cancelada/i);
    assert.strictEqual(sheets.Transferências.length, 1);
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});
stateMachineTest('financial states: multiline reserve and family transfers are parsed locally before Gemini', async () => {
    resetState();
    sheets.Users.push(partnerUserRow());
    financialScopeUserIds = [USER_ID, PARTNER_ID];

    const message = [
        'transferi 11,11 para a caixinha TESTE_APAGAR_SHADOW_TRANSFER_FIX_20260620',
        'resgatei 12,12 da caixinha TESTE_APAGAR_SHADOW_TRANSFER_FIX_20260620',
        'transferi 13,13 para a thais TESTE_APAGAR_SHADOW_TRANSFER_FIX_20260620'
    ].join('\n');

    const preview = await send(message);

    assert.match(preview, /Encontrei 3 transaç/);
    assert.match(preview, /\[Transferência\].*caixinha/i);
    assert.match(preview, /\[Transferência\].*resgate/i);
    assert.match(preview, /\[Transferência\].*Thais/i);
    assert.strictEqual(structuredResponses.length, 0);
    assert.strictEqual(sheets.Entradas.length, 1);
    assert.strictEqual(sheets.Saídas.length, 1);
    assert.strictEqual(sheets.Transferências.length, 1);

    const confirmationReply = await send('sim');

    assert.match(confirmationReply, /3 de 3 itens foram salvos/i);
    assert.strictEqual(sheets.Entradas.length, 1);
    assert.strictEqual(sheets.Saídas.length, 1);
    assert.strictEqual(sheets.Transferências.length, 4);
    const rows = sheets.Transferências.slice(1);
    assert.strictEqual(rows.filter(row => row[7] === 'Movimentação de reserva/investimento').length, 2);
    assert.strictEqual(rows.filter(row => row[7] === 'Provável transferência interna').length, 1);
});

stateMachineTest('financial states: monthly budget alert counts explicit credit card spending in legacy card sheets', async () => {
    resetState();
    sheets.UserSettings[1][13] = 'SIM';
    sheets.UserSettings[1][14] = String(20 * daysRemainingTodaySaoPaulo());
    enqueueStructuredResponse({
        intent: 'gasto',
        gastoDetails: [{
            descricao: 'restaurante',
            valor: 20,
            categoria: 'Alimentação',
            subcategoria: 'RESTAURANTE',
            pagamento: 'Crédito',
            recorrente: 'Não'
        }]
    });

    const reply = await send('gastei 20 reais no restaurante no crédito no cartão nubank thais à vista');

    assert.match(reply, /orçamento mensal/i);
    assert.match(reply, /100%/);
    assert.strictEqual(sheets.UserSettings[1][15], todayBr());
    assert.strictEqual(sheets.UserSettings[1][16], '100');
});

stateMachineTest('financial states: monthly budget alert excludes registered bills paid by card', async () => {
    resetState();
    sheets.UserSettings[1][13] = 'SIM';
    sheets.UserSettings[1][14] = String(20 * daysRemainingTodaySaoPaulo());
    const day = Number(todayBr().slice(0, 2));
    const billingMonth = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        month: 'long',
        year: 'numeric'
    }).format(new Date());
    sheets.Contas.push(['Spotify', String(day), '', USER_ID, 'Spotify', 'Assinaturas', 'Streaming', '50', 'SIM']);
    sheets['Cartão Nubank - Thais'].push([todayBr(), 'Spotify', 'Assinaturas', 50, '1/1', billingMonth, USER_ID]);
    enqueueStructuredResponse({
        intent: 'gasto',
        gastoDetails: [{
            descricao: 'restaurante',
            valor: 20,
            categoria: 'Alimentação',
            subcategoria: 'RESTAURANTE',
            pagamento: 'Crédito',
            recorrente: 'Não'
        }]
    });

    const reply = await send('gastei 20 reais no restaurante no crédito no cartão nubank thais à vista');

    assert.match(reply, /Gasto livre de hoje: R\$\s*20,00/i);
    assert.match(reply, /100%/);
    assert.doesNotMatch(reply, /R\$\s*70,00/);
});

stateMachineTest('financial states: public free-budget query loads recurring accounts and excludes their payments', async () => {
    resetState();
    usesPersonalSpreadsheet = true;
    sheets.UserSettings[1][13] = 'SIM';
    sheets.UserSettings[1][14] = '1000';
    sheets.UserSettings[1][17] = 'personal';
    sheets.UserSettings[1][18] = '1';
    sheets.Contas.push(['Dhalyn', '10', '', USER_ID, 'Aula recorrente', 'Educação', 'Curso', '150', 'SIM']);
    sheets.Saídas.push(
        [todayBr(), 'Dhalyn', 'Compras', 'Outros', 150, 'Daniel', 'PIX', 'Não', '', USER_ID, 'Daniel - Nubank'],
        [todayBr(), 'Lanche avulso', 'Alimentação', 'LANCHE', 20, 'Daniel', 'PIX', 'Não', '', USER_ID, 'Daniel - Nubank']
    );

    const reply = await send('quanto resta do meu gasto livre?');

    assert.match(reply, /Gasto livre no ciclo: R\$\s*20,00/i);
    assert.doesNotMatch(reply, /R\$\s*170,00/);
    assert.ok(sheetReadCalls.some(call => call.sheetName === 'Contas' && call.options.userId === USER_ID));
});

stateMachineTest('financial states: saved credit card expense is not reported as failed when budget alert send fails', async () => {
    resetState();
    sheets.UserSettings[1][13] = 'SIM';
    sheets.UserSettings[1][14] = String(10 * daysRemainingTodaySaoPaulo());
    userStateManager.setState(SENDER, {
        action: 'awaiting_installment_number',
        data: {
            gasto: {
                data: todayBr(),
                descricao: 'roupa',
                categoria: 'Vestuário',
                subcategoria: 'Roupa',
                valor: 10,
                pagamento: 'Crédito',
                recorrente: 'Não'
            },
            cardInfo: {
                sheetName: CARD_SHEETS[0],
                displayName: 'Nubank - Daniel',
                closingDay: 8
            }
        }
    });
    failNextPlainMessage = true;

    const reply = await send('1');

    assert.match(reply, /lançado/i);
    assert.doesNotMatch(reply, /erro ao salvar/i);
    assert.strictEqual(sheets[CARD_SHEETS[0]].length, 2);
    assert.strictEqual(sheets[CARD_SHEETS[0]][1][1], 'roupa');
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});

stateMachineTest('financial states: family monthly budget alert includes partner spending', async () => {
    resetState();
    financialScopeUserIds = [USER_ID, PARTNER_ID];
    sheets.UserSettings[1][13] = 'SIM';
    sheets.UserSettings[1][14] = String(50 * daysRemainingTodaySaoPaulo());
    sheets.UserSettings[1][17] = 'family';
    sheets.Saídas.push([todayBr(), 'restaurante parceiro', 'Alimentação', 'RESTAURANTE', 20, 'Thais', 'PIX', 'Não', '', PARTNER_ID]);
    enqueueStructuredResponse({
        intent: 'gasto',
        gastoDetails: [{
            descricao: 'lanche',
            valor: 25,
            categoria: 'Alimentação',
            subcategoria: 'PADARIA / LANCHE',
            pagamento: 'PIX',
            recorrente: 'Não',
            data: todayBr()
        }]
    });

    const reply = await send('gastei 25 no lanche no pix');

    assert.match(reply, /orçamento mensal familiar/i);
    assert.match(reply, /90%/);
    assert.strictEqual(sheets.UserSettings[1][15], todayBr());
    assert.strictEqual(String(sheets.UserSettings[1][16]), '80');
});

stateMachineTest('financial states: debt payment validates amount, updates owned debt and clears state', async () => {
    resetState();
    const debtRow = [
        'Financiamento Teste', 'Banco', 'Financiamento', 1000, 1000, 100,
        '2% a.m.', 10, '01/01/2026', 10, 0, 'Ativa', '', '0%', '', '', '', USER_ID
    ];
    sheets.Dívidas.push(debtRow);
    userStateManager.setState(SENDER, {
        action: 'awaiting_payment_amount',
        data: { row: debtRow, index: 1, user_id: USER_ID }
    });

    assert.match(await send('abc'), /valor inválido/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_payment_amount');

    assert.match(await send('100'), /novo saldo devedor/i);
    assert.strictEqual(Number(sheets.Dívidas[1][4]), 900);
    assert.strictEqual(sheets.Dívidas[1][13], '10.00%');
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});

stateMachineTest('5C legacy debt payment confirms and projects one accounting-neutral shadow movement', async () => {
    resetState();
    const dbPath = path.join(os.tmpdir(), `financas-bot-5c-debt-${process.pid}-${Date.now()}.sqlite`);
    const previousMode = process.env.PROJECTED_PLAN_WRITES_MODE;
    const previousUsers = process.env.PROJECTED_PLAN_WRITES_USER_IDS;
    const previousDbPath = process.env.PROJECTED_PLANS_DB_PATH;
    process.env.PROJECTED_PLAN_WRITES_MODE = 'shadow';
    process.env.PROJECTED_PLAN_WRITES_USER_IDS = USER_ID;
    process.env.PROJECTED_PLANS_DB_PATH = dbPath;
    resetProjectedPlanWriteRuntimeForTests();
    const debtRow = [
        'Financiamento 5C', 'Banco', 'Financiamento', 1000, 1000, 100,
        '2% a.m.', 10, '01/01/2026', 10, 0, 'Ativa', '', '0%', '', '', '', USER_ID
    ];
    sheets.Dívidas.push(debtRow);
    userStateManager.setState(SENDER, {
        action: 'awaiting_payment_amount',
        data: { row: debtRow, index: 1, user_id: USER_ID }
    });

    try {
        assert.match(await send('100'), /confirma/i);
        assert.strictEqual(Number(sheets.Dívidas[1][4]), 1000);
        const staleConfirmationState = userStateManager.getState(SENDER);
        assert.strictEqual(staleConfirmationState.action, 'confirming_legacy_debt_payment');

        assert.match(await send('sim'), /novo saldo devedor/i);
        assert.strictEqual(Number(sheets.Dívidas[1][4]), 900);
        assert.strictEqual(sheets.Saídas.length, 1);
        assert.strictEqual(sheets.Entradas.length, 1);
        const store = getProjectedPlanWriteContext(USER_ID).store;
        assert.strictEqual(store.readProjection().plan_movements.length, 1);
        assert.strictEqual(store.readProjection().plan_movements[0].type, 'payment');

        userStateManager.setState(SENDER, staleConfirmationState);
        assert.match(await send('sim'), /já havia sido registrado/i);
        assert.strictEqual(Number(sheets.Dívidas[1][4]), 900);
        assert.strictEqual(store.readProjection().plan_movements.length, 1);
    } finally {
        resetProjectedPlanWriteRuntimeForTests();
        for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
        if (previousMode === undefined) delete process.env.PROJECTED_PLAN_WRITES_MODE;
        else process.env.PROJECTED_PLAN_WRITES_MODE = previousMode;
        if (previousUsers === undefined) delete process.env.PROJECTED_PLAN_WRITES_USER_IDS;
        else process.env.PROJECTED_PLAN_WRITES_USER_IDS = previousUsers;
        if (previousDbPath === undefined) delete process.env.PROJECTED_PLANS_DB_PATH;
        else process.env.PROJECTED_PLANS_DB_PATH = previousDbPath;
    }
});

stateMachineTest('financial states: goal creation writes Metas row with user_id and clears state', async () => {
    resetState();
    enqueueStructuredResponse({ intent: 'criar_meta' });

    let reply = await send('criar meta');
    assert.match(reply, /nome da sua nova meta/i);

    reply = await send('Reserva de emergência');
    assert.match(reply, /valor alvo/i);

    reply = await send('10000');
    assert.match(reply, /valor guardado/i);

    reply = await send('2500');
    assert.match(reply, /data final/i);

    reply = await send('31/12/2026');
    assert.match(reply, /prioridade/i);

    reply = await send('alta');
    assert.match(reply, /registrada com sucesso/i);

    assert.strictEqual(sheets.Metas.length, 2);
    const row = sheets.Metas[1];
    assert.strictEqual(row[0], 'Reserva de emergência');
    assert.strictEqual(row[1], 10000);
    assert.strictEqual(row[2], 2500);
    assert.strictEqual(row[7], 'Alta');
    assert.strictEqual(row[8], USER_ID);
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});

stateMachineTest('financial states: goal movements update current value and append audit history', async () => {
    resetState();
    sheets.Metas.push(['Reserva de emergência', 10000, 1500, '', '', '31/12/2026', 'Em andamento', 'Alta', USER_ID, 'personal', '']);

    const reply = await send('guardei 500 na meta reserva');

    assert.match(reply, /Aporte registrado/i);
    assert.strictEqual(Number(sheets.Metas[1][2]), 2000);
    assert.strictEqual(sheets.Metas[1][6], 'Em andamento');
    assert.strictEqual(sheets.Metas[1][8], USER_ID);
    assert.strictEqual(sheets['Movimentações Metas'].length, 2);
    assert.strictEqual(sheets['Movimentações Metas'][1][1], 'Reserva de emergência');
    assert.strictEqual(sheets['Movimentações Metas'][1][2], 'Aporte');
    assert.strictEqual(Number(sheets['Movimentações Metas'][1][3]), 500);
    assert.strictEqual(Number(sheets['Movimentações Metas'][1][4]), 1500);
    assert.strictEqual(Number(sheets['Movimentações Metas'][1][5]), 2000);
    assert.strictEqual(sheets['Movimentações Metas'][1][8], USER_ID);
});

stateMachineTest('5C goal movement confirms, writes legacy plus shadow once, and replays after restart-safe receipt', async () => {
    resetState();
    const dbPath = path.join(os.tmpdir(), `financas-bot-5c-state-${process.pid}-${Date.now()}.sqlite`);
    const previousMode = process.env.PROJECTED_PLAN_WRITES_MODE;
    const previousUsers = process.env.PROJECTED_PLAN_WRITES_USER_IDS;
    const previousDbPath = process.env.PROJECTED_PLANS_DB_PATH;
    process.env.PROJECTED_PLAN_WRITES_MODE = 'shadow';
    process.env.PROJECTED_PLAN_WRITES_USER_IDS = USER_ID;
    process.env.PROJECTED_PLANS_DB_PATH = dbPath;
    resetProjectedPlanWriteRuntimeForTests();
    sheets.Metas.push(['Reserva 5C', 10000, 1500, '', '', '31/12/2026', 'Em andamento', 'Alta', USER_ID, 'personal', '']);

    try {
        const confirmation = await send('guardei 500 na meta reserva 5C');
        assert.match(confirmation, /confirma/i);
        assert.strictEqual(Number(sheets.Metas[1][2]), 1500);
        assert.strictEqual(sheets['Movimentações Metas'].length, 1);
        const staleConfirmationState = userStateManager.getState(SENDER);
        assert.strictEqual(staleConfirmationState.action, 'confirming_goal_movement');

        assert.match(await send('sim'), /Aporte registrado/i);
        assert.strictEqual(Number(sheets.Metas[1][2]), 2000);
        assert.strictEqual(sheets['Movimentações Metas'].length, 2);
        assert.strictEqual(sheets.Saídas.length, 1);
        assert.strictEqual(sheets.Entradas.length, 1);

        const store = getProjectedPlanWriteContext(USER_ID).store;
        const projection = store.readProjection();
        assert.strictEqual(projection.plans.length, 1);
        assert.strictEqual(projection.plan_movements.length, 1);
        assert.strictEqual(projection.plan_movements[0].type, 'contribution');

        userStateManager.setState(SENDER, staleConfirmationState);
        assert.match(await send('sim'), /já havia sido registrada/i);
        assert.strictEqual(Number(sheets.Metas[1][2]), 2000);
        assert.strictEqual(sheets['Movimentações Metas'].length, 2);
        assert.strictEqual(store.readProjection().plan_movements.length, 1);

        assert.match(await send('pausar meta reserva 5C'), /confirma/i);
        assert.strictEqual(sheets.Metas[1][6], 'Em andamento');
        assert.match(await send('sim'), /marcada como Pausada/i);
        assert.strictEqual(sheets.Metas[1][6], 'Pausada');
        assert.strictEqual(sheets['Movimentações Metas'].length, 3);
        const statusProjection = store.readProjection();
        assert.strictEqual(statusProjection.plan_movements.length, 2);
        assert.ok(statusProjection.plan_movements.some(item => item.type === 'status_change'));
        assert.strictEqual(store.listPlanVersions(statusProjection.plans[0].plan_id).length, 2);
    } finally {
        resetProjectedPlanWriteRuntimeForTests();
        for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
        if (previousMode === undefined) delete process.env.PROJECTED_PLAN_WRITES_MODE;
        else process.env.PROJECTED_PLAN_WRITES_MODE = previousMode;
        if (previousUsers === undefined) delete process.env.PROJECTED_PLAN_WRITES_USER_IDS;
        else process.env.PROJECTED_PLAN_WRITES_USER_IDS = previousUsers;
        if (previousDbPath === undefined) delete process.env.PROJECTED_PLANS_DB_PATH;
        else process.env.PROJECTED_PLANS_DB_PATH = previousDbPath;
    }
});

stateMachineTest('financial states: goal withdrawals cannot make the goal negative', async () => {
    resetState();
    sheets.Metas.push(['Viagem', 3000, 200, '', '', '31/12/2026', 'Em andamento', 'Média', USER_ID, 'personal', '']);

    const reply = await send('retirei 500 da meta viagem');

    assert.match(reply, /deixaria a meta "Viagem" negativa/i);
    assert.strictEqual(Number(sheets.Metas[1][2]), 200);
    assert.strictEqual(sheets['Movimentações Metas'].length, 1);
});

stateMachineTest('financial states: goal adjustment sets exact current value and status commands are audited', async () => {
    resetState();
    sheets.Metas.push(['Reserva de emergência', 10000, 1500, '', '', '31/12/2026', 'Em andamento', 'Alta', USER_ID, 'personal', '']);

    let reply = await send('ajustar meta reserva para 2500');
    assert.match(reply, /Ajuste registrado/i);
    assert.strictEqual(Number(sheets.Metas[1][2]), 2500);

    reply = await send('pausar meta reserva');
    assert.match(reply, /marcada como Pausada/i);
    assert.strictEqual(sheets.Metas[1][6], 'Pausada');

    reply = await send('retomar meta reserva');
    assert.match(reply, /marcada como Em andamento/i);
    assert.strictEqual(sheets.Metas[1][6], 'Em andamento');
    assert.strictEqual(sheets['Movimentações Metas'].length, 4);
    assert.strictEqual(sheets['Movimentações Metas'][2][2], 'Status: Pausada');
    assert.strictEqual(sheets['Movimentações Metas'][3][2], 'Status: Em andamento');
});

stateMachineTest('financial states: family goal can be moved by a family member', async () => {
    resetState();
    sheets.Users.push(partnerUserRow());
    sheets.UserProfile.push([
        PARTNER_ID,
        'Thais Cristina',
        5000,
        2500,
        'NÃO',
        'organizar contas',
        '2026-01-01T00:00:00.000Z'
    ]);
    financialScopeUserIds = [USER_ID, PARTNER_ID];
    sheets.Metas.push(['Reserva da família', 12000, 3000, '', '', '31/12/2026', 'Em andamento', 'Alta', USER_ID, 'family', '']);
    if (typeof userService.invalidateUserCaches === 'function') {
        userService.invalidateUserCaches();
    }

    const originalCreateMockMessage = createMockMessage;
    const msg = originalCreateMockMessage('guardei 700 na meta reserva da família');
    msg.from = PARTNER_SENDER;
    msg.author = PARTNER_SENDER;
    await handleMessage(msg);

    assert.match(msg.replies.at(-1), /Aporte registrado/i);
    assert.strictEqual(Number(sheets.Metas[1][2]), 3700);
    assert.strictEqual(sheets['Movimentações Metas'][1][8], PARTNER_ID);
    assert.strictEqual(sheets['Movimentações Metas'][1][9], USER_ID);
});

stateMachineTest('financial questions report Google source unavailability instead of an empty or zero result', async () => {
    resetState();
    usesPersonalSpreadsheet = true;
    const originalLoggerError = logger.error;
    const errors = [];
    const unavailable = Object.assign(new Error('google_sheet_read_unavailable'), {
        code: 'GOOGLE_SHEET_READ_UNAVAILABLE'
    });
    ['Saídas', 'Entradas', 'Metas', 'Dívidas'].forEach(sheetName => {
        sheetReadErrors.set(sheetName, unavailable);
    });

    logger.error = (...args) => errors.push(args);
    let reply;
    try {
        reply = await send('quanto gastei este mês?');
    } finally {
        logger.error = originalLoggerError;
    }

    assert.match(reply, /fonte está indisponível/i);
    assert.match(reply, /não vou tratar.*ausência.*valor zero/i);
    assert.doesNotMatch(reply, /não encontrei lançamentos|nenhum gasto/i);
    assert.deepStrictEqual(errors, [['[financial-read] source_unavailable']]);
});

stateMachineTest('financial states: batch confirmation saves mixed entries with existing payment methods', async () => {
    resetState();
    userStateManager.setState(SENDER, {
        action: 'confirming_transactions',
        data: {
            person: 'Usuario Estado',
            transactions: [
                {
                    type: 'Saídas',
                    data: '10/02/2026',
                    descricao: 'mercado lote',
                    categoria: 'Alimentação',
                    subcategoria: 'SUPERMERCADO',
                    valor: 80,
                    pagamento: 'PIX',
                    recorrente: 'Não'
                },
                {
                    type: 'Entradas',
                    data: '10/02/2026',
                    descricao: 'freela lote',
                    categoria: 'Renda Extra',
                    valor: 200,
                    recebimento: 'PIX',
                    recorrente: 'Não'
                }
            ]
        }
    });

    const reply = await send('sim');

    assert.match(reply, /2 de 2 itens foram salvos/i);
    assert.strictEqual(sheets.Saídas.length, 2);
    assert.strictEqual(sheets.Entradas.length, 2);
    assert.strictEqual(sheets.Saídas[1][1], 'mercado lote');
    assert.strictEqual(sheets.Entradas[1][1], 'freela lote');
    assert.strictEqual(sheets.Saídas[1][9], USER_ID);
    assert.strictEqual(sheets.Entradas[1][8], USER_ID);
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});

stateMachineTest('financial states: batch reserve movements stay transfers and are not contaminated by family transfer text', async () => {
    resetState();
    sheets.Users.push(partnerUserRow());
    financialScopeUserIds = [USER_ID, PARTNER_ID];
    const originalMessage = [
        'transferi 11,11 para a caixinha TESTE_APAGAR_SHADOW_20260620',
        'resgatei 12,12 da caixinha TESTE_APAGAR_SHADOW_20260620',
        'transferi 13,13 para a thais TESTE_APAGAR_SHADOW_20260620'
    ].join('\n');

    userStateManager.setState(SENDER, {
        action: 'confirming_transactions',
        data: {
            person: 'Usuario Estado',
            transactions: [
                {
                    type: 'Saídas',
                    data: '20/06/2026',
                    descricao: 'transferência para caixinha TESTE_APAGAR_SHADOW_20260620',
                    categoria: 'Transferência',
                    valor: 11.11,
                    pagamento: 'PIX',
                    recorrente: 'Não',
                    originalMessage
                },
                {
                    type: 'Saídas',
                    data: '20/06/2026',
                    descricao: 'transferência para Thais TESTE_APAGAR_SHADOW_20260620',
                    categoria: 'Transferência',
                    valor: 13.13,
                    pagamento: 'PIX',
                    recorrente: 'Não',
                    originalMessage
                },
                {
                    type: 'Entradas',
                    data: '20/06/2026',
                    descricao: 'resgate da caixinha TESTE_APAGAR_SHADOW_20260620',
                    categoria: 'Outros',
                    valor: 12.12,
                    recebimento: 'PIX',
                    recorrente: 'Não',
                    originalMessage
                }
            ]
        }
    });

    const reply = await send('sim');

    assert.match(reply, /3 de 3 itens foram salvos/i);
    assert.strictEqual(sheets.Entradas.length, 1);
    assert.strictEqual(sheets.Saídas.length, 1);
    assert.strictEqual(sheets.Transferências.length, 4);
    const transferRows = sheets.Transferências.slice(1);
    const reserveApplied = transferRows.find(row => row[1] === 'transferência para caixinha TESTE_APAGAR_SHADOW_20260620');
    const familyTransfer = transferRows.find(row => row[1] === 'transferência para Thais TESTE_APAGAR_SHADOW_20260620');
    const reserveRedeemed = transferRows.find(row => row[1] === 'resgate da caixinha TESTE_APAGAR_SHADOW_20260620');

    assert.ok(reserveApplied);
    assert.strictEqual(reserveApplied[2], 11.11);
    assert.strictEqual(reserveApplied[4], 'Reserva/Caixinha');
    assert.strictEqual(reserveApplied[7], 'Movimentação de reserva/investimento');
    assert.ok(familyTransfer);
    assert.strictEqual(familyTransfer[4], 'Thais');
    assert.strictEqual(familyTransfer[7], 'Provável transferência interna');
    assert.ok(reserveRedeemed);
    assert.strictEqual(reserveRedeemed[2], 12.12);
    assert.strictEqual(reserveRedeemed[3], 'Reserva/Caixinha');
    assert.strictEqual(reserveRedeemed[7], 'Movimentação de reserva/investimento');
});

stateMachineTest('financial states: batch asks one payment method when missing and writes every item', async () => {
    resetState();
    userStateManager.setState(SENDER, {
        action: 'confirming_transactions',
        data: {
            transactions: [
                {
                    type: 'Saídas',
                    data: '10/02/2026',
                    descricao: 'padaria lote',
                    categoria: 'Alimentação',
                    subcategoria: 'PADARIA',
                    valor: 20,
                    recorrente: 'Não'
                },
                {
                    type: 'Saídas',
                    data: '11/02/2026',
                    descricao: 'ônibus lote',
                    categoria: 'Transporte',
                    subcategoria: 'TRANSPORTE PÚBLICO',
                    valor: 5,
                    recorrente: 'Não'
                }
            ]
        }
    });

    let reply = await send('sim');
    assert.match(reply, /como esses itens foram pagos/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_batch_payment_method');

    reply = await send('pix');

    assert.match(reply, /2 de 2 itens foram salvos/i);
    assert.strictEqual(sheets.Saídas.length, 3);
    assert.deepStrictEqual(sheets.Saídas.slice(1).map(row => [row[1], row[6], row[9]]), [
        ['padaria lote', 'PIX', USER_ID],
        ['ônibus lote', 'PIX', USER_ID]
    ]);
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});

stateMachineTest('financial states: unknown batch payment method asks again instead of defaulting to PIX', async () => {
    resetState();
    userStateManager.setState(SENDER, {
        action: 'awaiting_batch_payment_method',
        data: {
            transactions: [
                {
                    type: 'Saídas',
                    descricao: 'mercado',
                    valor: 20,
                    categoria: 'Alimentação',
                    subcategoria: 'SUPERMERCADO',
                    recorrente: 'Não'
                }
            ]
        }
    });

    const reply = await send('banana');

    assert.match(reply, /não consegui entender a forma de pagamento/i);
    assert.strictEqual(sheets.Saídas.length, 1);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_batch_payment_method');
});

stateMachineTest('financial states: batch credit card flow writes installments for every item', async () => {
    resetState();
    userStateManager.setState(SENDER, {
        action: 'awaiting_batch_payment_method',
        data: {
            transactions: [
                {
                    type: 'Saídas',
                    data: '10/02/2026',
                    descricao: 'mercado crédito lote',
                    categoria: 'Alimentação',
                    valor: 100,
                    recorrente: 'Não'
                },
                {
                    type: 'Saídas',
                    data: '10/02/2026',
                    descricao: 'farmácia crédito lote',
                    categoria: 'Saúde',
                    valor: 50,
                    recorrente: 'Não'
                }
            ]
        }
    });

    let reply = await send('credito');
    assert.match(reply, /Em qual cartão/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_credit_card_selection_batch');

    reply = await send('1');
    assert.match(reply, /E as parcelas/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_installments_batch');

    reply = await send('2');

    assert.match(reply, /Lançamentos no crédito finalizados/i);
    const cardRows = sheets[CARD_SHEETS[0]].slice(1);
    assert.strictEqual(cardRows.length, 4);
    assert.deepStrictEqual(cardRows.map(row => [row[1], row[3], row[4], row[6]]), [
        ['mercado crédito lote', 50, '1/2', USER_ID],
        ['mercado crédito lote', 50, '2/2', USER_ID],
        ['farmácia crédito lote', 25, '1/2', USER_ID],
        ['farmácia crédito lote', 25, '2/2', USER_ID]
    ]);
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});

stateMachineTest('financial states: deletion confirmation supports cancel and selected delete with cleanup', async () => {
    resetState();
    userStateManager.setState(SENDER, {
        action: 'confirming_delete',
        sheetName: 'Saídas',
        foundItems: [
            { index: 3, data: ['10/02/2026', 'lanche', 'Alimentação', '', 80, 'Ambos', 'PIX', 'Não', '', USER_ID] },
            { index: 5, data: ['11/02/2026', 'uber', 'Transporte', '', 20, 'Ambos', 'PIX', 'Não', '', USER_ID] }
        ]
    });

    assert.match(await send('não'), /cancelada/i);
    assert.deepStrictEqual(deletedRows, []);
    assert.strictEqual(userStateManager.getState(SENDER), undefined);

    userStateManager.setState(SENDER, {
        action: 'confirming_delete',
        sheetName: 'Saídas',
        foundItems: [
            { index: 3, data: ['10/02/2026', 'lanche', 'Alimentação', '', 80, 'Ambos', 'PIX', 'Não', '', USER_ID] },
            { index: 5, data: ['11/02/2026', 'uber', 'Transporte', '', 20, 'Ambos', 'PIX', 'Não', '', USER_ID] }
        ]
    });

    assert.match(await send('2'), /apagado/i);
    assert.deepStrictEqual(deletedRows, [{ sheetName: 'Saídas', indices: [5] }]);
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});

stateMachineTest('financial states: deletion clears pending state before sending final success', async () => {
    resetState();
    const deletionHandler = require('../src/handlers/deletionHandler');
    userStateManager.setState(SENDER, {
        action: 'confirming_delete',
        sheetName: 'Saídas',
        foundItems: [
            { index: 3, data: ['10/02/2026', 'lanche', 'Alimentação', '', 80, 'Ambos', 'PIX', 'Não', '', USER_ID] }
        ]
    });

    const msg = createMockMessage('sim');
    let stateDuringSuccess = 'not-observed';
    msg.reply = async (text) => {
        msg.replies.push(String(text));
        if (/apagado\(s\) com sucesso/i.test(String(text))) {
            stateDuringSuccess = userStateManager.getState(SENDER);
        }
    };

    await deletionHandler.confirmDeletion(msg);

    assert.strictEqual(stateDuringSuccess, undefined);
    assert.deepStrictEqual(deletedRows, [{ sheetName: 'Saídas', indices: [3] }]);
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
});

stateMachineTest('financial states: apagar ultimo gasto targets latest expense regardless of sheet', async () => {
    resetState();
    sheets[CARD_SHEETS[0]].push([
        todayBr(),
        'teste cartão apagar',
        'Outros',
        2.49,
        '1/1',
        'Junho de 2026',
        USER_ID
    ]);
    enqueueStructuredResponse({
        intent: 'apagar_item',
        deleteDetails: {
            descricao: 'último',
            categoria: 'gasto'
        }
    });

    const reply = await send('Apagar último gasto');
    assert.match(reply, /Cartão Nubank - Daniel/i);
    assert.doesNotMatch(reply, /Saídas.*vazia/i);

    const state = userStateManager.getState(SENDER);
    assert.strictEqual(state.action, 'confirming_delete');
    assert.strictEqual(state.sheetName, CARD_SHEETS[0]);
    assert.strictEqual(state.foundItems[0].data[1], 'teste cartão apagar');

    const confirmed = await send('sim');
    assert.match(confirmed, /apagado/i);
    assert.deepStrictEqual(deletedRows, [{ sheetName: CARD_SHEETS[0], indices: [1] }]);
});

stateMachineTest('financial states: statement import asks account type before saving checking account rows', async () => {
    resetState();
    const csv = [
        'Data;Descrição;Valor;Tipo',
        '17/05/2026;Mercado Guanabara;-35,35;Débito'
    ].join('\n');

    const firstReply = await sendMedia(csv);
    assert.match(firstReply, /conta corrente/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_statement_import_kind');

    const preview = await send('1');
    assert.match(preview, /Mercado Guanabara/);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_statement_import');

    const done = await send('sim');
    assert.match(done, /Importação concluída/);
    assert.strictEqual(sheets.Saídas.length, 2);
    assert.strictEqual(sheets.Saídas[1][1], 'Mercado Guanabara');
    assert.strictEqual(sheets[CARD_SHEETS[0]].length, 1);

    await sendMedia(csv);
    const repeatedPreview = await send('1');
    assert.match(repeatedPreview, /\[Duplicado\]/);
    assert.match(repeatedPreview, /será ignorado/);

    const repeatedDone = await send('sim');
    assert.match(repeatedDone, /0 lançamento\(s\) foram salvos/);
    assert.strictEqual(sheets.Saídas.length, 2);
});

stateMachineTest('financial states: family statement import asks owner and stores rows under selected member', async () => {
    resetState();
    sheets.Users.push(partnerUserRow());
    sheets.UserProfile.push([
        PARTNER_ID,
        'Thais Cristina',
        5000,
        2500,
        'NÃO',
        'organizar contas',
        '2026-01-01T00:00:00.000Z'
    ]);
    financialScopeUserIds = [USER_ID, PARTNER_ID];
    if (typeof userService.invalidateUserCaches === 'function') {
        userService.invalidateUserCaches();
    }

    const csv = [
        'Data;Descrição;Valor;Tipo',
        '17/05/2026;Mercado Guanabara;-35,35;Débito',
        '17/05/2026;PIX TRANSF Usuario Estado;-50,00;Débito'
    ].join('\n');

    const ownerQuestion = await sendMedia(csv);
    assert.match(ownerQuestion, /extrato/i);
    assert.match(ownerQuestion, /1\. Usuario Estado/);
    assert.match(ownerQuestion, /2\. Thais/);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_statement_import_owner');

    const kindQuestion = await send('2');
    assert.match(kindQuestion, /conta corrente/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_statement_import_kind');

    const preview = await send('1');
    assert.match(preview, /Mercado Guanabara/);
    assert.match(preview, /Transferências internas prováveis no arquivo: 1/);

    const done = await send('sim');
    assert.match(done, /Importação concluída/);
    assert.strictEqual(sheets.Saídas.length, 2);
    assert.strictEqual(sheets.Saídas[1][1], 'Mercado Guanabara');
    assert.strictEqual(sheets.Saídas[1][5], 'Thais');
    assert.strictEqual(sheets.Saídas[1][9], PARTNER_ID);
    assert.strictEqual(sheets.Transferências.length, 2);
    assert.strictEqual(sheets.Transferências[1][1], 'PIX TRANSF Usuario Estado');
    assert.strictEqual(sheets.Transferências[1][8], PARTNER_ID);
});

stateMachineTest('financial states: statement import owner reply recovers state saved under another sender id for same user', async () => {
    resetState();
    sheets.Users.push(partnerUserRow());
    sheets.UserProfile.push([
        PARTNER_ID,
        'Thais Cristina',
        5000,
        2500,
        'NÃO',
        'organizar contas',
        '2026-01-01T00:00:00.000Z'
    ]);
    financialScopeUserIds = [USER_ID, PARTNER_ID];
    if (typeof userService.invalidateUserCaches === 'function') {
        userService.invalidateUserCaches();
    }

    const csv = [
        'Data;Descrição;Valor;Tipo',
        '17/05/2026;Mercado Guanabara;-35,35;Débito'
    ].join('\n');

    const ownerQuestion = await sendMedia(csv);
    assert.match(ownerQuestion, /extrato/i);

    const pendingState = userStateManager.getState(SENDER);
    userStateManager.deleteState(SENDER);
    userStateManager.setState('alternate-statement-import@lid', pendingState);

    const kindQuestion = await send('2');
    assert.match(kindQuestion, /conta corrente/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_statement_import_kind');
    assert.strictEqual(userStateManager.getState('alternate-statement-import@lid'), undefined);
});

stateMachineTest('financial states: statement import asks how to classify repeated incoming transfer before preview', async () => {
    resetState();
    sheets.Transferências.push(
        ['05/01/2026', 'Transferência Recebida - Usuario Estado - BCO BRADESCO S.A.', '2000', '', '', 'Importação', '', 'Provável transferência interna', USER_ID],
        ['05/02/2026', 'Transferência Recebida - Usuario Estado - BCO BRADESCO S.A.', '2000', '', '', 'Importação', '', 'Provável transferência interna', USER_ID]
    );

    const csv = [
        'Data;Descrição;Valor;Tipo',
        '05/03/2026;Transferência Recebida - Usuario Estado - BCO BRADESCO S.A.;2000,00;Crédito'
    ].join('\n');

    const firstReply = await sendMedia(csv);
    assert.match(firstReply, /conta corrente/i);

    const classificationQuestion = await send('1');
    assert.match(classificationQuestion, /entrada recorrente/i);
    assert.match(classificationQuestion, /Salário recorrente/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_statement_recurring_income_classification');

    const preview = await send('1');
    assert.match(preview, /\[Entrada\]/);
    assert.match(preview, /Salário/);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_statement_import');

    const done = await send('sim');
    assert.match(done, /Importação concluída/);
    assert.strictEqual(sheets.Entradas.length, 2);
    assert.strictEqual(sheets.Entradas[1][1], 'Transferência Recebida - Usuario Estado - BCO BRADESCO S.A.');
    assert.strictEqual(sheets.Entradas[1][2], 'Salário');
    assert.strictEqual(sheets.Entradas[1][6], 'Sim');
    assert.strictEqual(sheets.Transferências.length, 3);
});

stateMachineTest('financial states: statement import suggests recurring bills after saving', async () => {
    resetState();
    sheets.Saídas.push(
        ['05/01/2026', 'Pagamento de boleto - Internet', 'Moradia', 'CONTAS DA CASA', '120', 'Usuario Estado', 'Débito', 'Não', '', USER_ID],
        ['05/02/2026', 'Pagamento de boleto - Internet', 'Moradia', 'CONTAS DA CASA', '120', 'Usuario Estado', 'Débito', 'Não', '', USER_ID]
    );

    const csv = [
        'Data;Descrição;Valor;Tipo',
        '05/03/2026;Pagamento de boleto - Internet;-120,00;Débito'
    ].join('\n');

    const firstReply = await sendMedia(csv);
    assert.match(firstReply, /conta corrente/i);

    const preview = await send('1');
    assert.match(preview, /Pagamento de boleto - Internet/);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_statement_import');

    const done = await send('sim');
    assert.match(done, /Importação concluída/);
    assert.match(done, /saída recorrente/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_recurring_bill_suggestion');

    const classificationQuestion = await send('sim');
    assert.match(classificationQuestion, /como devo chamar/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_recurring_bill_classification');

    const created = await send('internet');
    assert.match(created, /Conta recorrente cadastrada/i);
    assert.match(created, /classificar/i);
    assert.strictEqual(sheets.Contas.length, 2);
    assert.strictEqual(sheets.Contas[1][1], 5);
    assert.strictEqual(sheets.Contas[1][3], USER_ID);
    assert.strictEqual(sheets.Contas[1][4], 'Internet');
    assert.strictEqual(sheets.Contas[1][5], 'Moradia');
    assert.strictEqual(sheets.Contas[1][6], 'INTERNET / TELEFONE');
    assert.strictEqual(sheets.Contas[1][8], 'SIM');
});

stateMachineTest('financial states: statement import asks for a fallback date only when the file has no dates', async () => {
    resetState();
    const csv = [
        'Descrição;Valor;Tipo',
        'Mercado Guanabara;-35,35;Débito'
    ].join('\n');

    const dateQuestion = await sendMedia(csv);
    assert.match(dateQuestion, /não encontrei data/i);
    assert.match(dateQuestion, /janeiro\/2026/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_statement_import_date');

    const kindQuestion = await send('janeiro/2026');
    assert.match(kindQuestion, /conta corrente/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_statement_import_kind');

    const preview = await send('1');
    assert.match(preview, /01\/01\/2026/);
    assert.match(preview, /Mercado Guanabara/);

    const done = await send('sim');
    assert.match(done, /Importação concluída/);
    assert.strictEqual(sheets.Saídas.length, 2);
    assert.strictEqual(sheets.Saídas[1][0], '01/01/2026');
});

stateMachineTest('financial states: statement import can route credit card purchases to selected card', async () => {
    resetState();
    const csv = [
        'Data;Descrição;Valor;Tipo',
        '17/05/2026;Amazon;-120,00;Débito',
        '18/05/2026;Estorno Amazon;20,00;Crédito'
    ].join('\n');

    const firstReply = await sendMedia(csv);
    assert.match(firstReply, /cartão de crédito/i);

    const cardQuestion = await send('2');
    assert.match(cardQuestion, /Em qual cartão/i);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'awaiting_statement_import_card_selection');

    const preview = await send('1');
    assert.match(preview, /Amazon/);
    assert.match(preview, /Fatura: Junho de 2026/);
    assert.doesNotMatch(preview, /Estorno Amazon/);
    assert.strictEqual(userStateManager.getState(SENDER).action, 'confirming_statement_import');

    const done = await send('sim');
    assert.match(done, /Importação concluída/);
    assert.strictEqual(sheets.Saídas.length, 1);
    assert.strictEqual(sheets.Entradas.length, 1);
    assert.strictEqual(sheets[CARD_SHEETS[0]].length, 2);
    assert.strictEqual(sheets[CARD_SHEETS[0]][1][1], 'Amazon');
    assert.strictEqual(sheets[CARD_SHEETS[0]][1][4], '1/1');
    assert.strictEqual(sheets[CARD_SHEETS[0]][1][5], 'Junho de 2026');
    assert.strictEqual(sheets[CARD_SHEETS[0]][1][6], USER_ID);
});

stateMachineTest('gate 38.2 public handler promotes, reviews and writes one genuine income exactly once', async () => {
    resetState();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-public-income-finalization-'));
    const paths = {
        secret: path.join(directory, 'secret.txt'),
        staging: path.join(directory, 'staging.sqlite'),
        journal: path.join(directory, 'journal.sqlite'),
        preview: path.join(directory, 'preview.sqlite'),
        outbox: path.join(directory, 'outbox.sqlite'),
        mapping: path.join(directory, 'mapping.json')
    };
    const secret = 'open-finance-public-income-secret-32-bytes';
    const item = {
        id: 'public-income-item',
        alias_code: 'daniel_nubank',
        owner_scope: 'daniel',
        availability: {
            accounts: 'available',
            transactions: 'available',
            bills: 'available',
            investments: 'available'
        },
        accounts: [{
            id: 'public-income-checking',
            type: 'CHECKING',
            name: 'Nubank Daniel',
            balance_cents: 125000
        }],
        transactions: [{
            id: 'public-income-transaction',
            provider_id: 'public-income-provider',
            account_id: 'public-income-checking',
            amount_cents: 125000,
            description: 'Pagamento recebido',
            date: new Date(Date.now() - 3_600_000).toISOString(),
            status: 'POSTED'
        }],
        bills: [],
        investments: []
    };
    fs.writeFileSync(paths.secret, secret, { mode: 0o600 });
    fs.writeFileSync(paths.mapping, JSON.stringify([{
        itemId: item.id,
        alias: item.alias_code,
        ownerScope: 'daniel',
        generation: 1
    }]));
    fs.writeFileSync(paths.outbox, '');
    const vault = new OpenFinanceLiveStagingVault({
        databasePath: paths.staging,
        secret
    });
    vault.ingestSnapshot({
        provider: 'pluggy',
        mode: 'live_readonly_staging',
        event_id: 'public-income-event',
        observed_at: new Date().toISOString(),
        collection_health: { complete: true, warning_count: 0 },
        items: [item]
    });
    vault.close();
    const journal = new OpenFinanceRevocationJournal({
        databasePath: paths.journal,
        secret
    });
    journal.close();
    const observation = observationRef(
        secret,
        item.id,
        item.transactions[0].account_id,
        item.transactions[0].id
    );
    const proactive = new OpenFinanceProactiveReviewStore({
        databasePath: paths.preview,
        secret
    });
    const reviewCode = proactive.ingest({
        reviews: [{
            observation_ref: observation,
            source_alias: item.alias_code,
            generation: 1,
            classification: 'income_candidate',
            review_kind: 'income',
            review_status: 'classification_required',
            save_eligible: false,
            financial_writes: 0
        }],
        items: [item],
        policies: [{
            alias: item.alias_code,
            principal: 'daniel',
            recipients: ['daniel']
        }],
        confirmationActors: [{ principal: 'daniel', whatsappId: SENDER }],
        observedAt: new Date().toISOString()
    }).links[0].review_code;
    proactive.close();
    sheets['Contas Financeiras'].push([
        'Daniel - Nubank', 'Conta Corrente', 0, '2025-01-01', 'ATIVA',
        'BRL', 'Usuario Estado', USER_ID, ''
    ]);
    usesPersonalSpreadsheet = true;
    const variableNames = [
        'OPEN_FINANCE_ALERT_MODE',
        'OPEN_FINANCE_SAVE_PROPOSAL_MODE',
        'OPEN_FINANCE_SHADOW_PREVIEW_MODE',
        'OPEN_FINANCE_RECONCILIATION_MODE',
        'OPEN_FINANCE_WRITE_MODE',
        'OPEN_FINANCE_WRITE_APPROVED',
        'OPEN_FINANCE_LIVE_STAGING_SECRET_FILE',
        'OPEN_FINANCE_LIVE_STAGING_DB',
        'OPEN_FINANCE_REVOCATION_JOURNAL_DB',
        'OPEN_FINANCE_SHADOW_PREVIEW_DB',
        'OPEN_FINANCE_OUTBOX_DB',
        'PLUGGY_ITEM_MAP_FILE'
    ];
    const previous = Object.fromEntries(variableNames.map(name => [name, process.env[name]]));
    Object.assign(process.env, {
        OPEN_FINANCE_ALERT_MODE: 'canary',
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary',
        OPEN_FINANCE_RECONCILIATION_MODE: 'canary',
        OPEN_FINANCE_WRITE_MODE: 'confirm',
        OPEN_FINANCE_WRITE_APPROVED: 'true',
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: paths.secret,
        OPEN_FINANCE_LIVE_STAGING_DB: paths.staging,
        OPEN_FINANCE_REVOCATION_JOURNAL_DB: paths.journal,
        OPEN_FINANCE_SHADOW_PREVIEW_DB: paths.preview,
        OPEN_FINANCE_OUTBOX_DB: paths.outbox,
        PLUGGY_ITEM_MAP_FILE: paths.mapping
    });
    try {
        const offered = await send(`revisar ${reviewCode} entrada`);
        assert.match(offered, /Nenhum .* foi salvo ainda/i);
        assert.equal(appendedRows.length, 0);
        let state = userStateManager.getState(SENDER);
        assert.equal(state.action, 'awaiting_open_finance_save_confirmation');

        assert.match(await send('sim'), /Confira a proposta/i);
        assert.equal(appendedRows.length, 0);
        state = userStateManager.getState(SENDER);
        assert.equal(state.action, 'awaiting_open_finance_save_review');

        assert.match(await send('1'), /Escolha a pessoa/i);
        assert.match(await send('1'), /Pessoa:/i);
        assert.match(await send('2'), /Escolha a categoria/i);
        assert.match(await send('1'), /Categoria:/i);
        assert.match(await send('4'), /Escolha a conta financeira/i);
        assert.match(await send('1'), /Conta financeira:/i);
        const finalPrompt = await send('5');
        assert.match(finalPrompt, /Confirma o salvamento/i);
        assert.equal(appendedRows.length, 0);
        assert.equal(
            userStateManager.getState(SENDER).action,
            'awaiting_open_finance_final_confirmation'
        );

        const receipt = await send('sim');
        assert.match(receipt, /Recibo/i);
        assert.equal(appendedRows.length, 1);
        assert.equal(appendedRows[0].sheetName, 'Entradas');
        assert.equal(appendedRows[0].row[1], 'Pagamento recebido');
        assert.equal(appendedRows[0].row[3], 1250);
        assert.equal(appendedRows[0].row[8], USER_ID);
        assert.equal(appendedRows[0].options.requireUserScoped, true);
        assert.match(String(appendedRows[0].options.operationKey), /^[a-f0-9]{48}$/);
        const committedProposalRef = String(appendedRows[0].options.messageId)
            .replace('open-finance-final:', '');
        assert.match(committedProposalRef, /^[a-f0-9]{32}$/);
        assert.equal(appendRowAttempts.length, 1);
        assert.equal(userStateManager.getState(SENDER), undefined);

        const replay = await send('sim');
        assert.doesNotMatch(replay, /salvo com sucesso/i);
        assert.equal(appendedRows.length, 1);
        assert.equal(appendRowAttempts.length, 1);

        const finalizationModulePath = require.resolve(
            '../src/openFinance/openFinanceSaveProposalFinalization'
        );
        delete require.cache[finalizationModulePath];
        const {
            handleOpenFinanceSaveProposalFinalizationReply: handleAfterRestart
        } = require(finalizationModulePath);
        const replayAfterRestart = await handleAfterRestart({
            messageBody: 'sim',
            actorWhatsappId: SENDER,
            userId: USER_ID,
            expectedProposalRef: committedProposalRef,
            env: process.env
        });
        assert.equal(replayAfterRestart.state, 'receipt_delivered');
        assert.equal(replayAfterRestart.financial_writes, 0);
        assert.equal(appendedRows.length, 1);
        assert.equal(appendRowAttempts.length, 1);
    } finally {
        for (const name of variableNames) {
            if (previous[name] === undefined) delete process.env[name];
            else process.env[name] = previous[name];
        }
        userStateManager.deleteState(SENDER);
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

stateMachineTest('gate 38.4 public handler writes one strongly paired internal transfer exactly once', async () => {
    resetSheets();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-public-transfer-'));
    const secret = 'public-transfer-state-machine-secret-12345';
    const paths = {
        secret: path.join(directory, 'secret.txt'),
        mapping: path.join(directory, 'mapping.json'),
        staging: path.join(directory, 'staging.sqlite'),
        preview: path.join(directory, 'preview.sqlite'),
        journal: path.join(directory, 'journal.sqlite'),
        outbox: path.join(directory, 'outbox.sqlite')
    };
    const observedAt = new Date().toISOString();
    const out = {
        id: 'public-transfer-out', account_id: 'daniel-bank', amount_cents: -10,
        description: 'Pix enviado para Thais', date: observedAt, status: 'POSTED',
        reference_number: 'public-provider-transfer-1'
    };
    const incoming = {
        id: 'public-transfer-in', account_id: 'thais-bank', amount_cents: 10,
        description: 'Pix recebido de Daniel', date: observedAt, status: 'POSTED',
        reference_number: 'public-provider-transfer-1'
    };
    const items = [
        {
            id: 'public-transfer-daniel', alias_code: 'daniel_nubank',
            owner_scope: 'daniel', generation: 1,
            accounts: [{ id: 'daniel-bank', type: 'BANK', name: 'Nubank Daniel' }],
            transactions: [out], bills: [], investments: []
        },
        {
            id: 'public-transfer-thais', alias_code: 'thais_nubank',
            owner_scope: 'thais', generation: 1,
            accounts: [{ id: 'thais-bank', type: 'BANK', name: 'Nubank Thais' }],
            transactions: [incoming], bills: [], investments: []
        }
    ];
    fs.writeFileSync(paths.secret, secret, { mode: 0o600 });
    fs.writeFileSync(paths.mapping, JSON.stringify(items.map(item => ({
        itemId: item.id,
        alias: item.alias_code,
        ownerScope: item.owner_scope,
        generation: 1
    }))));
    fs.writeFileSync(paths.outbox, '');
    const vault = new OpenFinanceLiveStagingVault({
        databasePath: paths.staging,
        secret
    });
    vault.ingestSnapshot({
        provider: 'pluggy', mode: 'live_readonly_staging',
        event_id: 'public-transfer-event', observed_at: observedAt,
        collection_health: { complete: true, warning_count: 0 }, items
    });
    vault.close();
    const journal = new OpenFinanceRevocationJournal({
        databasePath: paths.journal,
        secret
    });
    journal.close();
    const outObservation = observationRef(
        secret, items[0].id, out.account_id, out.id
    );
    const inObservation = observationRef(
        secret, items[1].id, incoming.account_id, incoming.id
    );
    const [anchorObservation, pairObservation] =
        [outObservation, inObservation].sort();
    const sourceAlias = anchorObservation === outObservation
        ? items[0].alias_code
        : items[1].alias_code;
    const proactive = new OpenFinanceProactiveReviewStore({
        databasePath: paths.preview,
        secret
    });
    const reviewCode = proactive.ingest({
        reviews: [{
            observation_ref: anchorObservation,
            source_alias: sourceAlias,
            generation: 1,
            classification: 'transfer',
            review_kind: 'transfer',
            review_status: 'strong_pair_confirmation_required',
            pair_observation_ref: pairObservation,
            pair_basis: 'shared_provider_reference',
            save_eligible: false,
            financial_writes: 0
        }],
        items,
        policies: [
            { alias: 'daniel_nubank', principal: 'daniel', recipients: ['daniel', 'thais'] },
            { alias: 'thais_nubank', principal: 'thais', recipients: ['daniel', 'thais'] }
        ],
        confirmationActors: [
            { principal: 'daniel', whatsappId: SENDER },
            { principal: 'thais', whatsappId: SENDER }
        ],
        observedAt
    }).links[0].review_code;
    proactive.close();

    sheets.Users[1][3] = 'Daniel';
    sheets.Users.push(partnerUserRow());
    userService.invalidateUserCaches();
    sheets['Contas Financeiras'].push(
        ['Daniel - Nubank', 'bank', 0, '2025-01-01', 'ATIVA',
            'BRL', 'Usuario Estado', USER_ID, ''],
        ['Thais - Nubank', 'bank', 0, '2025-01-01', 'ATIVA',
            'BRL', 'Thais', PARTNER_ID, '']
    );
    financialScopeUserIds = [USER_ID, PARTNER_ID];
    usesPersonalSpreadsheet = true;
    const variableNames = [
        'OPEN_FINANCE_ALERT_MODE', 'OPEN_FINANCE_SAVE_PROPOSAL_MODE',
        'OPEN_FINANCE_SHADOW_PREVIEW_MODE', 'OPEN_FINANCE_RECONCILIATION_MODE',
        'OPEN_FINANCE_WRITE_MODE', 'OPEN_FINANCE_WRITE_APPROVED',
        'OPEN_FINANCE_LIVE_STAGING_SECRET_FILE', 'OPEN_FINANCE_LIVE_STAGING_DB',
        'OPEN_FINANCE_REVOCATION_JOURNAL_DB', 'OPEN_FINANCE_SHADOW_PREVIEW_DB',
        'OPEN_FINANCE_OUTBOX_DB', 'PLUGGY_ITEM_MAP_FILE'
    ];
    const previous = Object.fromEntries(variableNames.map(name => [name, process.env[name]]));
    Object.assign(process.env, {
        OPEN_FINANCE_ALERT_MODE: 'canary',
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary',
        OPEN_FINANCE_RECONCILIATION_MODE: 'canary',
        OPEN_FINANCE_WRITE_MODE: 'confirm',
        OPEN_FINANCE_WRITE_APPROVED: 'true',
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: paths.secret,
        OPEN_FINANCE_LIVE_STAGING_DB: paths.staging,
        OPEN_FINANCE_REVOCATION_JOURNAL_DB: paths.journal,
        OPEN_FINANCE_SHADOW_PREVIEW_DB: paths.preview,
        OPEN_FINANCE_OUTBOX_DB: paths.outbox,
        PLUGGY_ITEM_MAP_FILE: paths.mapping
    });
    try {
        const offered = await send(`revisar ${reviewCode} confirmar`);
        assert.match(offered, /Transferência interna vinculada/i);
        assert.equal(appendedRows.length, 0);
        assert.equal(userStateManager.getState(SENDER).action,
            'awaiting_open_finance_save_confirmation');

        assert.match(await send('sim'), /Confira a transferência interna/i);
        assert.equal(appendedRows.length, 0);
        assert.match(await send('1'), /Escolha a conta de origem/i);
        assert.match(await send('1'), /Origem \(daniel\): Daniel - Nubank/i);
        assert.match(await send('2'), /Escolha a conta de destino/i);
        assert.match(await send('1'), /Destino \(thais\): Thais - Nubank/i);
        const finalPrompt = await send('3');
        assert.match(finalPrompt, /Confirma o salvamento/i);
        assert.equal(appendedRows.length, 0);

        const receipt = await send('sim');
        assert.match(receipt, /Recibo/i);
        assert.equal(appendedRows.length, 1);
        assert.equal(appendedRows[0].sheetName, 'Transferências');
        assert.equal(appendedRows[0].row[2], 0.1);
        assert.match(appendedRows[0].row[3], /^Daniel - Nubank/);
        assert.match(appendedRows[0].row[4], /^Thais - Nubank/);
        assert.equal(appendedRows[0].row[8], USER_ID);
        assert.equal(appendedRows[0].options.requireUserScoped, true);
        assert.deepEqual(appendedRows[0].options.canonicalRelation, {
            type: 'internal_transfer_pair',
            origin_owner_person_id: USER_ID,
            destination_owner_person_id: PARTNER_ID
        });
        const proposalRef = String(appendedRows[0].options.messageId)
            .replace('open-finance-final:', '');
        assert.equal(appendRowAttempts.length, 1);
        assert.equal(userStateManager.getState(SENDER), undefined);

        assert.doesNotMatch(await send('sim'), /salvo com sucesso/i);
        assert.equal(appendedRows.length, 1);
        assert.equal(appendRowAttempts.length, 1);
        const finalizationModulePath = require.resolve(
            '../src/openFinance/openFinanceSaveProposalFinalization'
        );
        delete require.cache[finalizationModulePath];
        const {
            handleOpenFinanceSaveProposalFinalizationReply: handleAfterRestart
        } = require(finalizationModulePath);
        const replayAfterRestart = await handleAfterRestart({
            messageBody: 'sim', actorWhatsappId: SENDER, userId: USER_ID,
            expectedProposalRef: proposalRef, env: process.env
        });
        assert.equal(replayAfterRestart.state, 'receipt_delivered');
        assert.equal(replayAfterRestart.financial_writes, 0);
        assert.equal(appendedRows.length, 1);
        assert.equal(appendRowAttempts.length, 1);
    } finally {
        for (const name of variableNames) {
            if (previous[name] === undefined) delete process.env[name];
            else process.env[name] = previous[name];
        }
        financialScopeUserIds = [USER_ID];
        userStateManager.deleteState(SENDER);
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

stateMachineTest('gate 38.5 public handler writes one neutral reserve application exactly once', async () => {
    resetSheets();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-public-reserve-'));
    const secret = 'public-reserve-state-machine-secret-123456';
    const paths = {
        secret: path.join(directory, 'secret.txt'),
        mapping: path.join(directory, 'mapping.json'),
        staging: path.join(directory, 'staging.sqlite'),
        preview: path.join(directory, 'preview.sqlite'),
        journal: path.join(directory, 'journal.sqlite'),
        outbox: path.join(directory, 'outbox.sqlite')
    };
    const observedAt = new Date().toISOString();
    const transaction = {
        id: 'public-reserve-application',
        account_id: 'daniel-bank',
        amount_cents: -2500,
        description: 'Aplicacao Caixinha',
        date: observedAt,
        status: 'POSTED',
        operation_type: 'APLICACAO_FINANCEIRA'
    };
    const item = {
        id: 'public-reserve-item',
        alias_code: 'daniel_nubank',
        owner_scope: 'daniel',
        generation: 1,
        accounts: [{ id: 'daniel-bank', type: 'BANK', name: 'Nubank Daniel' }],
        transactions: [transaction],
        bills: [],
        investments: []
    };
    fs.writeFileSync(paths.secret, secret, { mode: 0o600 });
    fs.writeFileSync(paths.mapping, JSON.stringify([{
        itemId: item.id,
        alias: item.alias_code,
        ownerScope: 'daniel',
        generation: 1
    }]));
    fs.writeFileSync(paths.outbox, '');
    const vault = new OpenFinanceLiveStagingVault({
        databasePath: paths.staging,
        secret
    });
    vault.ingestSnapshot({
        provider: 'pluggy',
        mode: 'live_readonly_staging',
        event_id: 'public-reserve-event',
        observed_at: observedAt,
        collection_health: { complete: true, warning_count: 0 },
        items: [item]
    });
    vault.close();
    const journal = new OpenFinanceRevocationJournal({
        databasePath: paths.journal,
        secret
    });
    journal.close();
    const observation = observationRef(
        secret,
        item.id,
        transaction.account_id,
        transaction.id
    );
    const proactive = new OpenFinanceProactiveReviewStore({
        databasePath: paths.preview,
        secret
    });
    const reviewCode = proactive.ingest({
        reviews: [{
            observation_ref: observation,
            source_alias: item.alias_code,
            generation: 1,
            classification: 'purchase_candidate',
            review_kind: 'reserve',
            review_status: 'provider_semantic_confirmation_required',
            suggested_decision: 'reserve_application',
            provider_operation_type: 'APLICACAO_FINANCEIRA',
            save_eligible: false,
            financial_writes: 0
        }],
        items: [item],
        policies: [{
            alias: item.alias_code,
            principal: 'daniel',
            recipients: ['daniel']
        }],
        confirmationActors: [{ principal: 'daniel', whatsappId: SENDER }],
        observedAt
    }).links[0].review_code;
    proactive.close();

    sheets.Users[1][3] = 'Daniel';
    userService.invalidateUserCaches();
    sheets['Contas Financeiras'].push(
        ['Daniel - Nubank', 'bank', 0, '2025-01-01', 'ATIVA',
            'BRL', 'Daniel', USER_ID, ''],
        ['Daniel - Caixinha', 'reserve', 0, '2025-01-01', 'ATIVA',
            'BRL', 'Daniel', USER_ID, '']
    );
    usesPersonalSpreadsheet = true;
    const variableNames = [
        'OPEN_FINANCE_ALERT_MODE', 'OPEN_FINANCE_SAVE_PROPOSAL_MODE',
        'OPEN_FINANCE_SHADOW_PREVIEW_MODE', 'OPEN_FINANCE_RECONCILIATION_MODE',
        'OPEN_FINANCE_WRITE_MODE', 'OPEN_FINANCE_WRITE_APPROVED',
        'OPEN_FINANCE_LIVE_STAGING_SECRET_FILE', 'OPEN_FINANCE_LIVE_STAGING_DB',
        'OPEN_FINANCE_REVOCATION_JOURNAL_DB', 'OPEN_FINANCE_SHADOW_PREVIEW_DB',
        'OPEN_FINANCE_OUTBOX_DB', 'PLUGGY_ITEM_MAP_FILE'
    ];
    const previous = Object.fromEntries(variableNames.map(name => [name, process.env[name]]));
    Object.assign(process.env, {
        OPEN_FINANCE_ALERT_MODE: 'canary',
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary',
        OPEN_FINANCE_RECONCILIATION_MODE: 'canary',
        OPEN_FINANCE_WRITE_MODE: 'confirm',
        OPEN_FINANCE_WRITE_APPROVED: 'true',
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: paths.secret,
        OPEN_FINANCE_LIVE_STAGING_DB: paths.staging,
        OPEN_FINANCE_REVOCATION_JOURNAL_DB: paths.journal,
        OPEN_FINANCE_SHADOW_PREVIEW_DB: paths.preview,
        OPEN_FINANCE_OUTBOX_DB: paths.outbox,
        PLUGGY_ITEM_MAP_FILE: paths.mapping
    });
    try {
        const offered = await send(`revisar ${reviewCode} confirmar`);
        assert.match(offered, /Aplica.*reserva confirmada/i);
        assert.equal(appendedRows.length, 0);
        assert.equal(userStateManager.getState(SENDER).action,
            'awaiting_open_finance_save_confirmation');

        assert.match(await send('sim'), /Confira a aplica.*reserva/i);
        assert.equal(appendedRows.length, 0);
        assert.match(await send('1'), /Escolha a conta de origem/i);
        assert.match(await send('1'), /Origem: Daniel - Nubank/i);
        assert.match(await send('2'), /Escolha a conta de destino/i);
        assert.match(await send('1'), /Destino: Daniel - Caixinha/i);
        const finalPrompt = await send('3');
        assert.match(finalPrompt, /Confirma o salvamento/i);
        assert.equal(appendedRows.length, 0);

        const receipt = await send('sim');
        assert.match(receipt, /Recibo/i);
        assert.equal(appendedRows.length, 1);
        assert.equal(appendedRows[0].sheetName, 'Transferências');
        assert.equal(appendedRows[0].row[2], 25);
        assert.equal(appendedRows[0].row[3], 'Daniel - Nubank');
        assert.equal(appendedRows[0].row[4], 'Daniel - Caixinha');
        assert.equal(appendedRows[0].row[8], USER_ID);
        assert.equal(appendedRows[0].options.requireUserScoped, true);
        assert.deepEqual(appendedRows[0].options.canonicalRelation, {
            type: 'reserve_application',
            owner_person_id: USER_ID
        });
        const proposalRef = String(appendedRows[0].options.messageId)
            .replace('open-finance-final:', '');
        assert.equal(appendRowAttempts.length, 1);
        assert.equal(userStateManager.getState(SENDER), undefined);

        assert.doesNotMatch(await send('sim'), /salvo com sucesso/i);
        assert.equal(appendedRows.length, 1);
        assert.equal(appendRowAttempts.length, 1);
        const finalizationModulePath = require.resolve(
            '../src/openFinance/openFinanceSaveProposalFinalization'
        );
        delete require.cache[finalizationModulePath];
        const {
            handleOpenFinanceSaveProposalFinalizationReply: handleAfterRestart
        } = require(finalizationModulePath);
        const replayAfterRestart = await handleAfterRestart({
            messageBody: 'sim',
            actorWhatsappId: SENDER,
            userId: USER_ID,
            expectedProposalRef: proposalRef,
            env: process.env
        });
        assert.equal(replayAfterRestart.state, 'receipt_delivered');
        assert.equal(replayAfterRestart.financial_writes, 0);
        assert.equal(appendedRows.length, 1);
        assert.equal(appendRowAttempts.length, 1);
    } finally {
        for (const name of variableNames) {
            if (previous[name] === undefined) delete process.env[name];
            else process.env[name] = previous[name];
        }
        userStateManager.deleteState(SENDER);
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

stateMachineTest('gate 38.6 public handler writes one investment income exactly once', async () => {
    resetSheets();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-public-investment-income-'));
    const secret = 'public-investment-income-secret-123456789';
    const paths = {
        secret: path.join(directory, 'secret.txt'),
        mapping: path.join(directory, 'mapping.json'),
        staging: path.join(directory, 'staging.sqlite'),
        preview: path.join(directory, 'preview.sqlite'),
        journal: path.join(directory, 'journal.sqlite'),
        outbox: path.join(directory, 'outbox.sqlite')
    };
    const observedAt = new Date().toISOString();
    const transaction = {
        id: 'public-investment-income',
        account_id: 'daniel-bank',
        amount_cents: 325,
        description: 'Rendimento Caixinha',
        date: observedAt,
        status: 'POSTED',
        operation_type: 'RENDIMENTO_APLIC_FINANCEIRA'
    };
    const item = {
        id: 'public-investment-income-item', alias_code: 'daniel_nubank',
        owner_scope: 'daniel', generation: 1,
        accounts: [{ id: 'daniel-bank', type: 'BANK', name: 'Nubank Daniel' }],
        transactions: [transaction], bills: [], investments: []
    };
    fs.writeFileSync(paths.secret, secret, { mode: 0o600 });
    fs.writeFileSync(paths.mapping, JSON.stringify([{
        itemId: item.id, alias: item.alias_code, ownerScope: 'daniel', generation: 1
    }]));
    fs.writeFileSync(paths.outbox, '');
    const vault = new OpenFinanceLiveStagingVault({
        databasePath: paths.staging, secret
    });
    vault.ingestSnapshot({
        provider: 'pluggy', mode: 'live_readonly_staging',
        event_id: 'public-investment-income-event', observed_at: observedAt,
        collection_health: { complete: true, warning_count: 0 }, items: [item]
    });
    vault.close();
    const journal = new OpenFinanceRevocationJournal({
        databasePath: paths.journal, secret
    });
    journal.close();
    const observation = observationRef(secret, item.id,
        transaction.account_id, transaction.id);
    const proactive = new OpenFinanceProactiveReviewStore({
        databasePath: paths.preview, secret
    });
    const reviewCode = proactive.ingest({
        reviews: [{
            observation_ref: observation, source_alias: item.alias_code,
            generation: 1, classification: 'income_candidate', review_kind: 'reserve',
            review_status: 'provider_semantic_confirmation_required',
            suggested_decision: 'investment_income',
            provider_operation_type: 'RENDIMENTO_APLIC_FINANCEIRA',
            save_eligible: false, financial_writes: 0
        }],
        items: [item],
        policies: [{ alias: item.alias_code, principal: 'daniel', recipients: ['daniel'] }],
        confirmationActors: [{ principal: 'daniel', whatsappId: SENDER }],
        observedAt
    }).links[0].review_code;
    proactive.close();

    sheets.Users[1][3] = 'Daniel';
    userService.invalidateUserCaches();
    sheets['Contas Financeiras'].push([
        'Daniel - Nubank', 'bank', 0, '2025-01-01', 'ATIVA',
        'BRL', 'Daniel', USER_ID, ''
    ]);
    usesPersonalSpreadsheet = true;
    const variableNames = [
        'OPEN_FINANCE_ALERT_MODE', 'OPEN_FINANCE_SAVE_PROPOSAL_MODE',
        'OPEN_FINANCE_SHADOW_PREVIEW_MODE', 'OPEN_FINANCE_RECONCILIATION_MODE',
        'OPEN_FINANCE_WRITE_MODE', 'OPEN_FINANCE_WRITE_APPROVED',
        'OPEN_FINANCE_LIVE_STAGING_SECRET_FILE', 'OPEN_FINANCE_LIVE_STAGING_DB',
        'OPEN_FINANCE_REVOCATION_JOURNAL_DB', 'OPEN_FINANCE_SHADOW_PREVIEW_DB',
        'OPEN_FINANCE_OUTBOX_DB', 'PLUGGY_ITEM_MAP_FILE'
    ];
    const previous = Object.fromEntries(variableNames.map(name => [name, process.env[name]]));
    Object.assign(process.env, {
        OPEN_FINANCE_ALERT_MODE: 'canary', OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary',
        OPEN_FINANCE_RECONCILIATION_MODE: 'canary', OPEN_FINANCE_WRITE_MODE: 'confirm',
        OPEN_FINANCE_WRITE_APPROVED: 'true',
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: paths.secret,
        OPEN_FINANCE_LIVE_STAGING_DB: paths.staging,
        OPEN_FINANCE_REVOCATION_JOURNAL_DB: paths.journal,
        OPEN_FINANCE_SHADOW_PREVIEW_DB: paths.preview,
        OPEN_FINANCE_OUTBOX_DB: paths.outbox, PLUGGY_ITEM_MAP_FILE: paths.mapping
    });
    try {
        const offered = await send(`revisar ${reviewCode} confirmar`);
        assert.match(offered, /Rendimento de reserva confirmado/i);
        assert.equal(appendedRows.length, 0);
        assert.equal(userStateManager.getState(SENDER).action,
            'awaiting_open_finance_save_confirmation');

        assert.match(await send('sim'), /Confira a proposta/i);
        assert.equal(appendedRows.length, 0);
        assert.match(await send('1'), /Escolha a pessoa/i);
        assert.match(await send('1'), /Pessoa:/i);
        const categoryPrompt = await send('2');
        assert.match(categoryPrompt, /Escolha a categoria/i);
        assert.match(categoryPrompt, /Investimentos/i);
        assert.doesNotMatch(categoryPrompt, /Criar nova categoria/i);
        assert.match(await send('1'), /Investimentos/i);
        assert.match(await send('4'), /Escolha a conta financeira/i);
        assert.match(await send('1'), /Conta financeira:/i);
        assert.match(await send('5'), /Confirma o salvamento/i);
        assert.equal(appendedRows.length, 0);

        const receipt = await send('sim');
        assert.match(receipt, /Recibo/i);
        assert.equal(appendedRows.length, 1);
        assert.equal(appendedRows[0].sheetName, 'Entradas');
        assert.equal(appendedRows[0].row[1], 'Rendimento Caixinha');
        assert.equal(appendedRows[0].row[2], 'Investimentos');
        assert.equal(appendedRows[0].row[3], 3.25);
        assert.equal(appendedRows[0].row[8], USER_ID);
        assert.deepEqual(appendedRows[0].options.canonicalRelation, {
            type: 'investment_income', owner_person_id: USER_ID
        });
        assert.equal(appendRowAttempts.length, 1);
        assert.equal(userStateManager.getState(SENDER), undefined);

        assert.doesNotMatch(await send('sim'), /salvo com sucesso/i);
        assert.equal(appendedRows.length, 1);
        assert.equal(appendRowAttempts.length, 1);
    } finally {
        for (const name of variableNames) {
            if (previous[name] === undefined) delete process.env[name];
            else process.env[name] = previous[name];
        }
        userStateManager.deleteState(SENDER);
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

stateMachineTest('gate 38.3 public handler writes one confirmed refund on the original card', async () => {
    resetSheets();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-public-refund-'));
    const secret = 'public-refund-state-machine-secret-123456';
    const paths = {
        secret: path.join(directory, 'secret.txt'),
        mapping: path.join(directory, 'mapping.json'),
        staging: path.join(directory, 'staging.sqlite'),
        preview: path.join(directory, 'preview.sqlite'),
        journal: path.join(directory, 'journal.sqlite'),
        outbox: path.join(directory, 'outbox.sqlite'),
        canonical: path.join(directory, 'canonical.sqlite')
    };
    const purchase = {
        id: 'public-purchase-1', account_id: 'public-credit-1', amount_cents: 5590,
        description: 'Mercado Central', date: '2026-08-08T12:00:00.000Z',
        status: 'POSTED'
    };
    const refund = {
        id: 'public-refund-1', account_id: 'public-credit-1', amount_cents: -5590,
        description: 'Estorno Mercado Central', date: '2026-08-09T12:00:00.000Z',
        status: 'POSTED'
    };
    const item = {
        id: 'public-refund-item', alias_code: 'daniel_nubank', generation: 1,
        accounts: [{ id: 'public-credit-1', type: 'CREDIT' }],
        transactions: [purchase, refund], bills: [], investments: []
    };
    fs.writeFileSync(paths.secret, secret, { mode: 0o600 });
    fs.writeFileSync(paths.mapping, JSON.stringify([{
        itemId: item.id, alias: item.alias_code, ownerScope: 'daniel', generation: 1
    }]));
    fs.writeFileSync(paths.outbox, '');
    const { OpenFinanceLiveStagingVault } =
        require('../src/openFinance/openFinanceLiveStagingVault');
    const { OpenFinanceRevocationJournal } =
        require('../src/openFinance/openFinanceRevocationJournal');
    const { OpenFinanceProactiveReviewStore } =
        require('../src/openFinance/openFinanceProactiveReviewStore');
    const { observationRef } =
        require('../src/openFinance/openFinanceRuntimeReconciliation');
    const { buildCanonicalLedgerReceiptProjection } =
        require('../src/ledger/canonicalLedgerReceiptProjector');
    const { CanonicalLedgerShadowStore } =
        require('../src/ledger/canonicalLedgerShadowStore');
    const vault = new OpenFinanceLiveStagingVault({
        databasePath: paths.staging,
        secret
    });
    vault.ingestSnapshot({
        provider: 'pluggy', mode: 'live_readonly_staging',
        event_id: 'public-refund-event', observed_at: new Date().toISOString(),
        collection_health: { complete: true, warning_count: 0 }, items: [item]
    });
    vault.close();
    const journal = new OpenFinanceRevocationJournal({
        databasePath: paths.journal,
        secret
    });
    journal.close();
    const purchaseObservation = observationRef(
        secret, item.id, purchase.account_id, purchase.id
    );
    const refundObservation = observationRef(
        secret, item.id, refund.account_id, refund.id
    );
    const proactive = new OpenFinanceProactiveReviewStore({
        databasePath: paths.preview,
        secret
    });
    const reviewCode = proactive.ingest({
        reviews: [{
            observation_ref: refundObservation,
            source_alias: item.alias_code,
            generation: 1,
            classification: 'refund',
            review_kind: 'refund_link',
            review_status: 'pair_confirmation_required',
            pair_observation_ref: purchaseObservation,
            pair_basis: 'same_account_amount_date_description',
            save_eligible: false,
            financial_writes: 0
        }],
        items: [item],
        policies: [{
            alias: item.alias_code, principal: 'daniel', recipients: ['daniel']
        }],
        confirmationActors: [{ principal: 'daniel', whatsappId: SENDER }],
        observedAt: new Date().toISOString()
    }).links[0].review_code;
    proactive.close();

    sheets['Lan\u00e7amentos Cart\u00e3o'].push([
        '08/08/2026', 'Mercado Central', 'Alimenta\u00e7\u00e3o', 55.9,
        '1/1', 'Agosto de 2026', 'nubank-daniel', 'Nubank Daniel', '', USER_ID
    ]);
    sheets['Cart\u00f5es'].push([
        'nubank-daniel', 'Nubank Daniel', 3, 25, 'Daniel', 'SIM', ''
    ]);
    sheets.Categorias.push([
        'Alimenta\u00e7\u00e3o', '', 'SIM', '2026-01-01', USER_ID
    ]);
    usesPersonalSpreadsheet = true;
    const canonicalStore = new CanonicalLedgerShadowStore({
        dbPath: paths.canonical,
        writesEnabled: true
    });
    canonicalStore.persistProjection(buildCanonicalLedgerReceiptProjection({
        sheetName: 'Cart\u00e3o Nubank Daniel',
        row: ['08/08/2026', 'Mercado Central', 'Alimenta\u00e7\u00e3o', 55.9,
            '1/1', 'Agosto de 2026', USER_ID],
        operationKey: 'public-original-card-write',
        receipt: { updatedRange: 'Cart\u00e3o Nubank Daniel!A2:G2' },
        committedAt: '2026-08-08T13:00:00.000Z'
    }));
    canonicalStore.close();
    const variableNames = [
        'OPEN_FINANCE_ALERT_MODE', 'OPEN_FINANCE_SAVE_PROPOSAL_MODE',
        'OPEN_FINANCE_SHADOW_PREVIEW_MODE', 'OPEN_FINANCE_RECONCILIATION_MODE',
        'OPEN_FINANCE_WRITE_MODE', 'OPEN_FINANCE_WRITE_APPROVED',
        'OPEN_FINANCE_LIVE_STAGING_SECRET_FILE', 'OPEN_FINANCE_LIVE_STAGING_DB',
        'OPEN_FINANCE_REVOCATION_JOURNAL_DB', 'OPEN_FINANCE_SHADOW_PREVIEW_DB',
        'OPEN_FINANCE_OUTBOX_DB', 'PLUGGY_ITEM_MAP_FILE',
        'CANONICAL_LEDGER_SHADOW_DB_PATH'
    ];
    const previous = Object.fromEntries(variableNames.map(name => [name, process.env[name]]));
    Object.assign(process.env, {
        OPEN_FINANCE_ALERT_MODE: 'canary',
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary',
        OPEN_FINANCE_RECONCILIATION_MODE: 'canary',
        OPEN_FINANCE_WRITE_MODE: 'confirm',
        OPEN_FINANCE_WRITE_APPROVED: 'true',
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: paths.secret,
        OPEN_FINANCE_LIVE_STAGING_DB: paths.staging,
        OPEN_FINANCE_REVOCATION_JOURNAL_DB: paths.journal,
        OPEN_FINANCE_SHADOW_PREVIEW_DB: paths.preview,
        OPEN_FINANCE_OUTBOX_DB: paths.outbox,
        PLUGGY_ITEM_MAP_FILE: paths.mapping,
        CANONICAL_LEDGER_SHADOW_DB_PATH: paths.canonical
    });
    try {
        const offered = await send(`revisar ${reviewCode} confirmar`);
        assert.match(offered, /Estorno vinculado/i);
        assert.equal(appendedRows.length, 0);
        assert.equal(userStateManager.getState(SENDER).action,
            'awaiting_open_finance_save_confirmation');

        const orphanProposalRef = 'a'.repeat(32);
        const orphanFinalization = new OpenFinanceSaveProposalFinalizationStore({
            databasePath: paths.preview,
            secret,
            authorizedWhatsAppIds: [SENDER]
        });
        orphanFinalization.prepare({
            proposalRef: orphanProposalRef,
            actorWhatsappId: SENDER,
            operationKey: 'b'.repeat(48),
            payload: { marker: 'unrelated-active-finalization' },
            expiresAt: new Date(Date.now() + 3_600_000).toISOString()
        });
        orphanFinalization.close();

        const offeredState = userStateManager.getState(SENDER);
        userStateManager.setStateDurably(SENDER, {
            action: 'awaiting_open_finance_save_review',
            data: { batch: offeredState.data.batch || null }
        });
        const malformedReviewReply = await send('sim');
        assert.match(malformedReviewReply, /identificar esta confer\u00eancia com seguran\u00e7a/i);
        assert.equal(appendedRows.length, 0);
        assert.equal(userStateManager.getState(SENDER).action,
            'awaiting_open_finance_save_review');
        assert.equal(userStateManager.getState(SENDER).data.proposalRef, undefined);
        const orphanAfterMalformedReview = new OpenFinanceSaveProposalFinalizationStore({
            databasePath: paths.preview,
            secret,
            authorizedWhatsAppIds: [SENDER]
        });
        try {
            assert.equal(orphanAfterMalformedReview.read(orphanProposalRef, {
                actorWhatsappId: SENDER
            }).state, 'awaiting_confirmation');
        } finally {
            orphanAfterMalformedReview.close();
        }
        userStateManager.setStateDurably(SENDER, offeredState);

        assert.match(await send('sim'), /Confira a proposta/i);
        assert.equal(appendedRows.length, 0);
        assert.equal(userStateManager.getState(SENDER).action,
            'awaiting_open_finance_save_review');

        const unchangedOrphan = new OpenFinanceSaveProposalFinalizationStore({
            databasePath: paths.preview,
            secret,
            authorizedWhatsAppIds: [SENDER]
        });
        try {
            assert.equal(unchangedOrphan.read(orphanProposalRef, {
                actorWhatsappId: SENDER
            }).state, 'awaiting_confirmation');
        } finally {
            unchangedOrphan.close();
        }

        const finalPrompt = await send('6');
        assert.match(finalPrompt, /Confirma o salvamento/i);
        assert.equal(appendedRows.length, 0);
        assert.equal(userStateManager.getState(SENDER).action,
            'awaiting_open_finance_final_confirmation');

        const exactFinalState = userStateManager.getState(SENDER);
        userStateManager.setStateDurably(SENDER, {
            action: 'awaiting_open_finance_final_confirmation',
            data: { batch: exactFinalState.data.batch || null }
        });
        const malformedFinalReply = await send('sim');
        assert.match(malformedFinalReply, /identificar esta confer\u00eancia com seguran\u00e7a/i);
        assert.equal(appendedRows.length, 0);
        assert.equal(appendRowAttempts.length, 0);
        assert.equal(userStateManager.getState(SENDER).action,
            'awaiting_open_finance_final_confirmation');
        assert.equal(userStateManager.getState(SENDER).data.proposalRef, undefined);
        userStateManager.setStateDurably(SENDER, exactFinalState);

        const receipt = await send('sim');
        assert.match(receipt, /Recibo/i);
        assert.equal(appendedRows.length, 1);
        assert.equal(appendedRows[0].sheetName, 'Cart\u00e3o Nubank Daniel');
        assert.equal(appendedRows[0].row[3], -55.9);
        assert.equal(appendedRows[0].row[6], USER_ID);
        assert.equal(appendedRows[0].options.canonicalRelation.type, 'refund_pair');
        assert.match(appendedRows[0].options.canonicalRelation.related_event_id,
            /^evt_[a-f0-9]{8,64}$/);
        const committedProposalRef = String(appendedRows[0].options.messageId)
            .replace('open-finance-final:', '');
        assert.match(committedProposalRef, /^[a-f0-9]{32}$/);
        assert.equal(appendRowAttempts.length, 1);
        assert.equal(userStateManager.getState(SENDER), undefined);

        const replay = await send('sim');
        assert.doesNotMatch(replay, /salvo com sucesso/i);
        assert.equal(appendedRows.length, 1);
        assert.equal(appendRowAttempts.length, 1);

        const finalizationModulePath = require.resolve(
            '../src/openFinance/openFinanceSaveProposalFinalization'
        );
        delete require.cache[finalizationModulePath];
        const {
            handleOpenFinanceSaveProposalFinalizationReply: handleAfterRestart
        } = require(finalizationModulePath);
        const replayAfterRestart = await handleAfterRestart({
            messageBody: 'sim',
            actorWhatsappId: SENDER,
            userId: USER_ID,
            expectedProposalRef: committedProposalRef,
            env: process.env
        });
        assert.equal(replayAfterRestart.state, 'receipt_delivered');
        assert.equal(replayAfterRestart.financial_writes, 0);
        assert.equal(appendedRows.length, 1);
        assert.equal(appendRowAttempts.length, 1);
    } finally {
        for (const name of variableNames) {
            if (previous[name] === undefined) delete process.env[name];
            else process.env[name] = previous[name];
        }
        userStateManager.deleteState(SENDER);
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test.after(async () => {
    await userStateManager.closeStateStore();
    if (typeof cache.close === 'function') {
        cache.close();
    }
    setTimeout(() => process.exit(stateMachineFailed ? 1 : 0), 100);
});

stateMachineTest('financial states: command planner canary telemetry records routed bill payment cancellation', async () => {
    resetState();
    fs.rmSync(COMMAND_CANARY_TELEMETRY_PATH, { force: true });
    const previousMode = process.env.FINANCIAL_COMMAND_PLANNER_MODE;
    process.env.FINANCIAL_COMMAND_PLANNER_MODE = 'route';
    sheets.Contas.push([
        'Claro Residencial',
        '10',
        '',
        USER_ID,
        'Conta de telefone',
        'Moradia',
        'INTERNET / TELEFONE',
        '469,09',
        'SIM'
    ]);
    enqueueStructuredResponse({
        schemaVersion: 'financial-command-plan-v1',
        operation: 'bill.pay',
        entities: {
            description: 'conta de telefone',
            amount: 469.09,
            date: '25/06/2026',
            paymentMethod: null
        },
        fieldEvidence: {
            description: 'explicit',
            amount: 'explicit',
            date: 'explicit',
            paymentMethod: 'missing'
        },
        contextRequests: [{ tool: 'match_recurring_bill', query: 'conta de telefone' }],
        missingFields: ['paymentMethod'],
        requiresConfirmation: true
    });

    try {
        assert.match(await send('Paguei 469,09 da conta de telefone'), /forma de pagamento/i);
        assert.match(await send('Pix'), /confirma/i);
        assert.match(await send('não'), /cancelad/i);

        const payload = fs.existsSync(COMMAND_CANARY_TELEMETRY_PATH)
            ? fs.readFileSync(COMMAND_CANARY_TELEMETRY_PATH, 'utf8')
            : '';
        assert.doesNotMatch(payload, /Paguei|telefone|469,09|5599993000001|state-machine-user/i);
        const entries = readCommandCanaryTelemetryEntries();
        assert.ok(entries.some(entry => entry.operation === 'bill.pay' && entry.stage === 'route' && entry.outcome === 'handled'));
        assert.ok(entries.some(entry => entry.operation === 'bill.pay' && entry.stage === 'confirmation' && entry.confirmation === 'cancelled'));
    } finally {
        if (previousMode === undefined) delete process.env.FINANCIAL_COMMAND_PLANNER_MODE;
        else process.env.FINANCIAL_COMMAND_PLANNER_MODE = previousMode;
    }
});
