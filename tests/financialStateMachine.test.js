const test = require('node:test');
const assert = require('node:assert');

process.env.NODE_ENV = 'test';
process.env.ADMIN_IDS = process.env.ADMIN_IDS || '5521970112407@c.us';

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
const deletedRows = [];
const createdCalendarEvents = [];
const structuredResponses = [];
let stateMachineFailed = false;
let financialScopeUserIds = [USER_ID];

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
    sheets.Saídas = [['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Responsável', 'Pagamento', 'Recorrente', 'Observações', 'user_id']];
    sheets.Entradas = [['Data', 'Descrição', 'Categoria', 'Valor', 'Responsável', 'Recebimento', 'Recorrente', 'Observações', 'user_id']];
    sheets.Transferências = [['Data', 'Descrição', 'Valor', 'Origem', 'Destino', 'Método', 'Observações', 'Status', 'user_id']];
    sheets.Contas = [['Nome da Conta', 'Dia do Vencimento', 'Observações', 'user_id', 'Nome Amigável', 'Categoria', 'Subcategoria', 'Valor Esperado', 'Regra Ativa']];
    sheets.Dívidas = [DEBTS_HEADER];
    sheets.Metas = [['Nome da Meta', 'Valor Alvo', 'Valor Atual', '% Progresso', 'Valor Mensal Necessário', 'Data Fim', 'Status', 'Prioridade', 'user_id']];
    for (const sheetName of CARD_SHEETS) {
        sheets[sheetName] = [['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'user_id']];
    }
    deletedRows.length = 0;
    createdCalendarEvents.length = 0;
    structuredResponses.length = 0;
    financialScopeUserIds = [USER_ID];
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
            readDataFromSheet: async (range) => sheets[getSheetName(range)] || [],
            appendRowToSheet: async (sheetName, row) => {
                const name = getSheetName(sheetName);
                if (!sheets[name]) sheets[name] = [[]];
                sheets[name].push(row);
            },
            createCalendarEvent: async (title, startDateTime, recurrenceRule, options = {}) => {
                const event = { title, startDateTime, recurrenceRule, options };
                createdCalendarEvents.push(event);
                return event;
            },
            updateRowInSheet: async (range, row) => {
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
                sheets[name][rowNumber - 1] = row;
            },
            deleteRowsByIndices: async (sheetName, indices) => {
                deletedRows.push({ sheetName, indices });
                return { success: true };
            },
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
}

installMocks();

const { handleMessage } = require('../src/handlers/messageHandler');
const userStateManager = require('../src/state/userStateManager');
const userService = require('../src/services/userService');
const { getReadModelStats } = require('../src/services/readModelService');
const cache = require('../src/utils/cache');

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
    assert.match(replies.at(-1), /Gasto de R\$30\.00/i);
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
    assert.match(reply, /R\$ 3000,00/);
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

stateMachineTest('financial states: explicit credit card and à vista expense skips card and installment questions', async () => {
    resetState();
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
    assert.strictEqual(userStateManager.getState(SENDER), undefined);
    assert.strictEqual(sheets['Cartão Nubank - Thais'].length, 2);
    assert.strictEqual(sheets['Cartão Nubank - Thais'][1][3], 10);
    assert.strictEqual(sheets['Cartão Nubank - Thais'][1][4], '1/1');
    assert.strictEqual(sheets['Cartão Nubank - Thais'][1].at(-1), USER_ID);
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

    assert.match(reply, /Transferência de R\$ 6666,62/i);
    assert.strictEqual(sheets.Entradas.length, 1);
    assert.strictEqual(sheets.Transferências.length, 2);
    assert.strictEqual(sheets.Transferências[1][1], 'Caixinha do Nubank');
    assert.strictEqual(sheets.Transferências[1][2], 6666.62);
    assert.strictEqual(sheets.Transferências[1][4], 'Caixinha Nubank');
    assert.strictEqual(sheets.Transferências[1][7], 'Movimentação de reserva/investimento');
    assert.strictEqual(sheets.Transferências[1][8], USER_ID);
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

    assert.match(reply, /Transferência de R\$ 1269,74/i);
    assert.strictEqual(sheets.Saídas.length, 1);
    assert.strictEqual(sheets.Transferências.length, 2);
    assert.strictEqual(sheets.Transferências[1][1], 'Transferência para Thais');
    assert.strictEqual(sheets.Transferências[1][2], 1269.74);
    assert.strictEqual(sheets.Transferências[1][4], 'Thais');
    assert.strictEqual(sheets.Transferências[1][5], 'PIX');
    assert.strictEqual(sheets.Transferências[1][7], 'Provável transferência interna');
    assert.strictEqual(sheets.Transferências[1][8], USER_ID);
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
