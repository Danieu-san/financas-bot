const assert = require('node:assert');

process.env.NODE_ENV = 'test';
const SENDER = '5521970112407@c.us';
const FUNCTIONAL_SENDERS = Object.freeze({
    surface: '5599991000001@c.us',
    transactions: '5599991000002@c.us',
    creation: '5599991000003@c.us',
    analytics: '5599991000004@c.us',
    complexAnalytics: '5599991000005@c.us'
});

process.env.ADMIN_IDS = [
    process.env.ADMIN_IDS || '5521970112407@c.us',
    ...Object.values(FUNCTIONAL_SENDERS)
].filter(Boolean).join(',');
process.env.DASHBOARD_BASE_URL = process.env.DASHBOARD_BASE_URL || 'http://localhost:8787';
process.env.DASHBOARD_TOKEN_SECRET = process.env.DASHBOARD_TOKEN_SECRET || 'functional-test-secret';

require('dotenv').config();

const structuredQueue = [];
const askQueue = [];
const createdCalendarEvents = [];

function enqueueStructured(response) {
    structuredQueue.push(response);
}

function enqueueAsk(response) {
    askQueue.push(response);
}

function clearQueues() {
    structuredQueue.length = 0;
    askQueue.length = 0;
    createdCalendarEvents.length = 0;
}

function installMocks() {
    const geminiPath = require.resolve('../src/services/gemini');
    const geminiMock = {
        getStructuredResponseFromLLM: async (prompt = '') => {
            if (String(prompt).includes('mapear o número de parcelas')) {
                return { mercado: 1, farmacia: 1 };
            }
            if (structuredQueue.length === 0) {
                throw new Error(`Sem resposta mockada para getStructuredResponseFromLLM. Prompt: ${String(prompt).slice(0, 120)}`);
            }
            return structuredQueue.shift();
        },
        askLLM: async (prompt = '') => {
            if (askQueue.length > 0) return askQueue.shift();
            const text = String(prompt).toLowerCase();
            if (text.includes('forma de pagamento')) {
                const answerMatch = String(prompt).match(/Resposta do usuário:\s*"([^"]*)"/i);
                const answer = (answerMatch?.[1] || '').toLowerCase();
                if (answer.includes('crédito') || answer.includes('credito')) return 'Crédito';
                if (answer.includes('débito') || answer.includes('debito')) return 'Débito';
                if (answer.includes('dinheiro')) return 'Dinheiro';
                return 'PIX';
            }
            if (text.includes('normalize a prioridade')) return 'Alta';
            if (text.includes('normalize a resposta do usuário para uma das categorias')) return 'Financiamento';
            if (text.includes('padronizar uma taxa de juros')) return '2% a.m.';
            if (text.includes('converta o texto a seguir para uma data')) return '01/01/2026';
            if (text.includes('converta o seguinte texto para um número')) return '100';
            return 'PIX';
        },
        callGemini: async () => '',
        transcribeAudio: async () => 'gastei 30 com uber no pix'
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

const googlePath = require.resolve('../src/services/google');
const googleService = require('../src/services/google');
const googleHybrid = { ...googleService };
googleHybrid.createCalendarEvent = async (title, startDateTime, recurrenceRule, options = {}) => {
    const event = { id: `mock-event-${createdCalendarEvents.length + 1}`, title, startDateTime, recurrenceRule, options };
    createdCalendarEvents.push(event);
    return event;
};
Object.defineProperty(googleHybrid, 'sheets', { get: () => googleService.sheets });
require.cache[googlePath].exports = googleHybrid;

const { resetSpreadsheetData } = require('../scripts/resetSpreadsheetData');
const { handleMessage } = require('../src/handlers/messageHandler');
const userStateManager = require('../src/state/userStateManager');
const userService = require('../src/services/userService');
const { syncReadModelIfNeeded } = require('../src/services/readModelService');

function createMockMsg(body, from = SENDER) {
    const replies = [];
    return {
        id: { id: `functional_${Date.now()}_${Math.random().toString(36).slice(2)}` },
        type: 'chat',
        body,
        from,
        author: from,
        isStatus: false,
        fromMe: false,
        _data: { notifyName: 'Daniel', pushname: 'Daniel' },
        reply: async (text) => {
            replies.push(String(text));
            return { id: { id: `reply_${Date.now()}` } };
        },
        getReplies: () => replies,
        getLastReply: () => replies[replies.length - 1] || ''
    };
}

async function send(body, from = SENDER) {
    const msg = createMockMsg(body, from);
    await handleMessage(msg);
    return msg.getReplies();
}

function last(replies) {
    return replies[replies.length - 1] || '';
}

async function readRows(range, { minRows = 1, retries = 20, delayMs = 1000 } = {}) {
    let rows = [];
    for (let attempt = 0; attempt < retries; attempt += 1) {
        rows = await googleService.readDataFromSheet(range);
        if (rows.length >= minRows) return rows;
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    return rows;
}

async function resetFunctionalState(sender = SENDER, { resetSpreadsheet = false } = {}) {
    clearQueues();
    if (resetSpreadsheet) {
        await resetSpreadsheetData();
    }
    if (typeof userService.invalidateUserCaches === 'function') {
        userService.invalidateUserCaches();
    }
    userStateManager.deleteState(sender);
}

async function activateAndOnboard(sender = SENDER) {
    let replies = await send('TERMOS', sender);
    assert.ok(last(replies).includes('Resumo legal:'), 'TERMOS deve mostrar resumo antes do aceite');

    replies = await send('ACEITO', sender);
    assert.ok(replies.some(r => r.includes('aguardando aprovação')), 'ACEITO deve deixar cadastro aguardando aprovação');

    let user = await userService.getUserByWhatsAppId(sender);
    assert.strictEqual(user.status, 'PENDING_APPROVAL');
    user = await userService.approveUserByWhatsAppId(sender);
    assert.strictEqual(user.status, 'APPROVED_AWAITING_GOOGLE');
    user = await userService.updateUserStatus(user.user_id, 'ACTIVE');
    assert.strictEqual(user.status, 'ACTIVE');

    assert.ok(last(await send('Oi', sender)).includes('nome completo'), 'Onboarding inicia perguntando nome completo');
    assert.ok(last(await send('Daniel Ferreira Teste', sender)).includes('como você prefere ser chamado'), 'Onboarding pergunta nome de uso');
    assert.ok(last(await send('Daniel Teste', sender)).includes('renda mensal'), 'Onboarding pergunta renda');
    assert.ok(last(await send('5000', sender)).includes('gasto fixo'), 'Onboarding pergunta gasto fixo');
    assert.ok(last(await send('2500', sender)).includes('dívidas ativas'), 'Onboarding pergunta dívidas');
    assert.ok(last(await send('sim', sender)).includes('objetivo principal'), 'Onboarding pergunta objetivo');
    replies = await send('montar reserva', sender);
    assert.ok(replies.some(r => r.includes('Onboarding concluído')), 'Onboarding deve concluir');
    if (replies.some(r => r.includes('cadastrar a primeira dívida'))) {
        assert.ok(last(await send('não', sender)).includes('criar dívida'), 'Oferta de dívida deve aceitar adiamento');
    }

    user = await userService.getUserByWhatsAppId(sender);
    assert.strictEqual(user.status, 'ACTIVE');
    assert.ok(user.user_id, 'Usuário ativo deve ter user_id');
    return user;
}

function createFunctionalContext(sender = SENDER) {
    return {
        sender,
        activateAndOnboard: () => activateAndOnboard(sender),
        send: (body) => send(body, sender)
    };
}

module.exports = {
    SENDER,
    FUNCTIONAL_SENDERS,
    activateAndOnboard,
    createFunctionalContext,
    createdCalendarEvents,
    enqueueAsk,
    enqueueStructured,
    last,
    readRows,
    resetFunctionalState,
    send,
    syncReadModelIfNeeded,
    userStateManager,
    userService
};
