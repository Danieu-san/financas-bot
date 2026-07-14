const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.ADMIN_IDS = process.env.ADMIN_IDS || '5599990000001@c.us';
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
const TERMS_VERSION = process.env.TERMS_VERSION || 'v1.1';

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
const sheetReadCalls = [];
const deletedRows = [];
const appendedRows = [];
const seenAppendOperationKeys = new Set();
const seenUpdateOperationKeys = new Set();
const createdCalendarEvents = [];
const structuredResponses = [];
let stateMachineFailed = false;
let financialScopeUserIds = [USER_ID];
let failNextPlainMessage = false;
let usesPersonalSpreadsheet = false;

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
    seenAppendOperationKeys.clear();
    seenUpdateOperationKeys.clear();
    createdCalendarEvents.length = 0;
    structuredResponses.length = 0;
    Object.keys(personalSheetOverrides).forEach(key => delete personalSheetOverrides[key]);
    sheetReadCalls.length = 0;
    financialScopeUserIds = [USER_ID];
    failNextPlainMessage = false;
    usesPersonalSpreadsheet = false;
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
                if (usesPersonalSpreadsheet && options.userId && personalSheetOverrides[sheetName]) {
                    return personalSheetOverrides[sheetName];
                }
                return sheets[sheetName] || [];
            },
            appendRowToSheet: async (sheetName, row, options = {}) => {
                const name = getSheetName(sheetName);
                if (!sheets[name]) sheets[name] = [[]];
                if (options.operationKey) {
                    if (seenAppendOperationKeys.has(options.operationKey)) {
                        return { status: 'committed', receipt: { replayed: true } };
                    }
                    seenAppendOperationKeys.add(options.operationKey);
                }
                sheets[name].push(row);
                appendedRows.push({ sheetName: name, row, options });
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

const { handleMessage, __test__: messageHandlerTest } = require('../src/handlers/messageHandler');
const userStateManager = require('../src/state/userStateManager');
const userService = require('../src/services/userService');
const { getReadModelStats } = require('../src/services/readModelService');
const cache = require('../src/utils/cache');
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
    userStateManager.deleteState(SENDER);
    if (typeof userService.invalidateUserCaches === 'function') {
        userService.invalidateUserCaches();
    }
}

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
    sheets.Saídas.push([todayBr(), 'mercado anterior', 'Alimentação', 'SUPERMERCADO', 20, 'Usuario Estado', 'PIX', 'Não', '', USER_ID]);
    enqueueStructuredResponse({
        intent: 'gasto',
        gastoDetails: [{
            descricao: 'farmácia',
            valor: 25,
            categoria: 'Saúde',
            subcategoria: 'FARMÁCIA',
            pagamento: 'PIX',
            recorrente: 'Não',
            data: todayBr()
        }]
    });

    const reply = await send('gastei 25 na farmácia no pix');

    assert.match(reply, /orçamento mensal/i);
    assert.match(reply, /90%/);
    assert.strictEqual(sheets.UserSettings[1][15], todayBr());
    assert.strictEqual(String(sheets.UserSettings[1][16]), '80');
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
            descricao: 'mercado',
            valor: 20,
            categoria: 'Alimentação',
            subcategoria: 'SUPERMERCADO',
            pagamento: 'Crédito',
            recorrente: 'Não'
        }]
    });

    const reply = await send('gastei 20 reais no mercado no crédito no cartão nubank thais à vista');

    assert.match(reply, /orçamento mensal/i);
    assert.match(reply, /100%/);
    assert.strictEqual(sheets.UserSettings[1][15], todayBr());
    assert.strictEqual(sheets.UserSettings[1][16], '100');
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
    sheets.Saídas.push([todayBr(), 'mercado parceiro', 'Alimentação', 'SUPERMERCADO', 20, 'Thais', 'PIX', 'Não', '', PARTNER_ID]);
    enqueueStructuredResponse({
        intent: 'gasto',
        gastoDetails: [{
            descricao: 'farmácia',
            valor: 25,
            categoria: 'Saúde',
            subcategoria: 'FARMÁCIA',
            pagamento: 'PIX',
            recorrente: 'Não',
            data: todayBr()
        }]
    });

    const reply = await send('gastei 25 na farmácia no pix');

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

test.after(() => {
    userStateManager.closeStateStore();
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
