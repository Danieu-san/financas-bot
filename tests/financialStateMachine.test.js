const test = require('node:test');
const assert = require('node:assert');

process.env.NODE_ENV = 'test';
process.env.ADMIN_IDS = process.env.ADMIN_IDS || '5521970112407@c.us,5521964270368@c.us';

const SENDER = '5599993000001@c.us';
const USER_ID = 'state-machine-user';
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

const sheets = {};
const deletedRows = [];
const structuredResponses = [];
let stateMachineFailed = false;

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

function resetSheets() {
    sheets.Users = [USERS_HEADER, activeUserRow()];
    sheets.UserProfile = [
        ['user_id', 'monthly_income', 'fixed_expense_estimate', 'has_debt', 'primary_goal', 'onboarding_completed_at'],
        [USER_ID, 5000, 2500, 'SIM', 'montar reserva', '2026-01-01T00:00:00.000Z']
    ];
    sheets.UserSettings = [
        ['user_id', 'timezone', 'weekly_checkin_enabled', 'monthly_report_enabled', 'language', 'created_at', 'auto_reserve_enabled', 'auto_reserve_percent'],
        [USER_ID, 'America/Sao_Paulo', 'NÃO', 'SIM', 'pt-BR', '2026-01-01T00:00:00.000Z', 'NÃO', '10']
    ];
    sheets.Saídas = [['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Responsável', 'Pagamento', 'Recorrente', 'Observações', 'user_id']];
    sheets.Entradas = [['Data', 'Descrição', 'Categoria', 'Valor', 'Responsável', 'Recebimento', 'Recorrente', 'Observações', 'user_id']];
    sheets.Dívidas = [DEBTS_HEADER];
    for (const sheetName of CARD_SHEETS) {
        sheets[sheetName] = [['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'user_id']];
    }
    deletedRows.length = 0;
    structuredResponses.length = 0;
}

function enqueueStructuredResponse(response) {
    structuredResponses.push(response);
}

function getSheetName(rangeOrSheet) {
    return String(rangeOrSheet || '').split('!')[0];
}

function installMocks() {
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
            updateRowInSheet: async (range, row) => {
                const name = getSheetName(range);
                const rowMatch = String(range).match(/![A-Z]+(\d+):/);
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
            if (text.includes('forma de pagamento')) return 'PIX';
            if (text.includes('recebimento')) return 'PIX';
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

async function send(body) {
    const msg = createMockMessage(body);
    await handleMessage(msg);
    return msg.replies.at(-1) || '';
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

stateMachineTest('financial states: terms command is not swallowed by incomplete onboarding', async () => {
    resetState();
    sheets.UserProfile[1][5] = '';

    const reply = await send('termos');

    assert.match(reply, /Resumo legal/i);
    assert.doesNotMatch(reply, /Antes de começarmos/i);
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

test.after(() => {
    userStateManager.closeStateStore();
    if (typeof cache.close === 'function') {
        cache.close();
    }
    setTimeout(() => process.exit(stateMachineFailed ? 1 : 0), 100);
});
