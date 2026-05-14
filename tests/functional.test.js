const test = require('node:test');
const assert = require('node:assert');

process.env.NODE_ENV = 'test';
process.env.ADMIN_IDS = process.env.ADMIN_IDS || '5521970112407@c.us,5521964270368@c.us';
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

    return geminiMock;
}

installMocks();

const googlePath = require.resolve('../src/services/google');
const googleService = require('../src/services/google');
const googleHybrid = { ...googleService };
googleHybrid.createCalendarEvent = async (title, startDateTime, recurrenceRule) => {
    const event = { id: `mock-event-${createdCalendarEvents.length + 1}`, title, startDateTime, recurrenceRule };
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

const SENDER = '5521970112407@c.us';
const RUN_FUNCTIONAL_TESTS = String(process.env.RUN_FUNCTIONAL_TESTS || '').toLowerCase() === 'true';

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

let functionalFailed = false;
const functionalTest = RUN_FUNCTIONAL_TESTS ? test : test.skip;

functionalTest('functional smoke: principais fluxos do bot com Sheets real e IA mockada', async () => {
    try {
    await resetSpreadsheetData();
    userStateManager.deleteState(SENDER);

    let replies = await send('TERMOS');
    assert.ok(last(replies).includes('Resumo legal:'), 'TERMOS deve mostrar resumo antes do aceite');

    replies = await send('ACEITO');
    assert.ok(replies.some(r => r.includes('Cadastro confirmado')), 'ACEITO deve ativar cadastro');
    assert.ok(last(replies).includes('como você prefere ser chamado'), 'ACEITO deve iniciar onboarding');

    assert.ok(last(await send('Daniel Teste')).includes('renda mensal'), 'Onboarding pergunta renda');
    assert.ok(last(await send('5000')).includes('gasto fixo'), 'Onboarding pergunta gasto fixo');
    assert.ok(last(await send('2500')).includes('dívidas ativas'), 'Onboarding pergunta dívidas');
    assert.ok(last(await send('sim')).includes('objetivo principal'), 'Onboarding pergunta objetivo');
    replies = await send('montar reserva');
    assert.ok(replies.some(r => r.includes('Onboarding concluído')), 'Onboarding deve concluir');

    const user = await userService.getUserByWhatsAppId(SENDER);
    assert.strictEqual(user.status, 'ACTIVE');
    assert.ok(user.user_id, 'Usuário ativo deve ter user_id');

    replies = await send('Oi');
    assert.ok(last(replies).includes('Oi, Daniel'), 'Saudação deve responder localmente');

    assert.ok(last(await send('ativar checkin semanal')).includes('Check-in semanal ativado'));
    assert.ok(last(await send('definir reserva 12%')).includes('12%'));
    assert.ok(last(await send('dashboard')).includes('/dashboard?token='), 'Dashboard deve gerar link autenticado');

    enqueueStructured({
        intent: 'gasto',
        gastoDetails: [{
            descricao: 'lanche fevereiro',
            valor: 80,
            categoria: 'Alimentação',
            subcategoria: 'PADARIA / LANCHE',
            pagamento: 'PIX',
            recorrente: 'Não',
            data: '10/02/2026'
        }]
    });
    assert.ok(last(await send('gastei 80 no lanche em fevereiro no pix')).includes('Você confirma'));
    assert.ok(last(await send('sim')).includes('como esses itens foram pagos'));
    assert.ok(last(await send('pix')).includes('Registro finalizado'));

    let saidas = await readRows('Saídas!A:J', { minRows: 2 });
    assert.strictEqual(saidas.length, 2, 'Deve existir 1 saída + cabeçalho');
    assert.strictEqual(saidas[1][1], 'lanche fevereiro');
    assert.strictEqual(saidas[1][9], user.user_id);

    enqueueStructured({
        intent: 'entrada',
        entradaDetails: [{
            descricao: 'salário fevereiro',
            valor: 3000,
            categoria: 'Salário',
            recebimento: 'PIX',
            recorrente: 'Não'
        }]
    });
    assert.ok(last(await send('recebi 3000 de salário no pix')).includes('Você confirma'));
    assert.ok(last(await send('sim')).includes('como esses itens foram pagos'));
    assert.ok(last(await send('pix')).includes('Registro finalizado'));

    const entradas = await readRows('Entradas!A:I', { minRows: 2 });
    assert.strictEqual(entradas.length, 2, 'Deve existir 1 entrada + cabeçalho');
    assert.strictEqual(entradas[1][8], user.user_id);

    enqueueStructured({
        intent: 'gasto',
        gastoDetails: [{
            descricao: 'mercado cartão',
            valor: 200,
            categoria: 'Alimentação',
            subcategoria: 'SUPERMERCADO',
            pagamento: null,
            recorrente: 'Não',
            data: '10/02/2026'
        }]
    });
    assert.ok(last(await send('gastei 200 no mercado')).includes('forma de pagamento'));
    assert.ok(last(await send('crédito')).includes('Em qual cartão'));
    assert.ok(last(await send('1')).includes('parcelas'));
    assert.ok(last(await send('2')).includes('lançado em 2x'));

    const cartao = await readRows('Cartão Nubank - Daniel!A:G', { minRows: 3 });
    assert.strictEqual(cartao.length, 3, 'Compra em 2 parcelas deve criar 2 linhas + cabeçalho');
    assert.strictEqual(cartao[1][6], user.user_id);

    enqueueStructured({ intent: 'criar_meta' });
    assert.ok(last(await send('criar meta')).includes('nome da sua nova meta'));
    assert.ok(last(await send('Reserva')).includes('valor alvo'));
    assert.match(last(await send('1000')), /guardado|valor atual/i);
    assert.match(last(await send('100')), /data final|data/i);
    assert.match(last(await send('31/12/2026')), /prioridade/i);
    assert.match(last(await send('Alta')), /Meta "Reserva" registrada/i);

    const metas = await readRows('Metas!A:I', { minRows: 2 });
    assert.strictEqual(metas.length, 2, 'Meta deve ser registrada');
    assert.strictEqual(metas[1][8], user.user_id);

    enqueueStructured({ intent: 'criar_divida' });
    assert.ok(last(await send('criar dívida')).includes('nome da dívida'));
    assert.match(last(await send('Financiamento Teste')), /quem|deve/i);
    assert.match(last(await send('Banco Teste')), /tipo/i);
    assert.match(last(await send('Financiamento')), /valor original/i);
    assert.match(last(await send('1000')), /saldo|devedor/i);
    assert.match(last(await send('1000')), /parcela/i);
    assert.match(last(await send('100')), /juros/i);
    assert.match(last(await send('2 am')), /vencimento/i);
    assert.match(last(await send('10')), /início|inicio|data/i);
    assert.match(last(await send('01/01/2026')), /parcelas/i);
    assert.match(last(await send('10')), /observação|observacao/i);
    assert.ok(last(await send('não')).includes('Dívida "Financiamento Teste" registrada'));

    let dividas = await readRows('Dívidas!A:R', { minRows: 2 });
    assert.strictEqual(dividas.length, 2, 'Dívida deve ser registrada');
    assert.strictEqual(dividas[1][17], user.user_id);

    enqueueStructured({
        intent: 'registrar_pagamento',
        pagamentoDetails: { descricao: 'Financiamento Teste' }
    });
    assert.ok(last(await send('paguei financiamento teste')).includes('Qual foi o valor'));
    assert.ok(last(await send('100')).includes('novo saldo devedor'));
    dividas = await readRows('Dívidas!A:R', { minRows: 2 });
    assert.strictEqual(Number(dividas[1][4]), 900, 'Pagamento deve reduzir saldo da dívida');

    enqueueStructured({
        intent: 'criar_lembrete',
        lembreteDetails: { titulo: 'Pagar IPVA', dataHora: '12/05/2026 09:00', recorrencia: '' }
    });
    assert.ok(last(await send('me lembre de pagar o IPVA amanhã às 9h')).includes('Lembrete criado'));
    assert.strictEqual(createdCalendarEvents.length, 1, 'Lembrete deve chamar Calendar mockado');

    await syncReadModelIfNeeded({ force: true });

    replies = await send('Quanto gastei em fevereiro?');
    assert.ok(last(replies).includes('Total gasto em fevereiro/2026'), 'Total mensal sem categoria deve responder corretamente');
    assert.ok(!last(replies).includes('categoria informada'), 'Total mensal não deve falar categoria informada');

    replies = await send('Quanto gastei em fevereiro com alimentação?');
    assert.ok(last(replies).includes('Total gasto com alimentacao em fevereiro/2026'));

    replies = await send('qual meu saldo de fevereiro?');
    assert.ok(last(replies).includes('Saldo em fevereiro/2026'));

    replies = await send('liste meus gastos com alimentação em fevereiro');
    assert.ok(last(replies).includes('Gastos encontrados'), 'Listagem deve retornar gastos');

    enqueueStructured({
        intent: 'apagar_item',
        deleteDetails: { descricao: 'ultimo', categoria: 'gasto' }
    });
    assert.match(last(await send('apagar último gasto')), /Encontrei|Você tem certeza/i);
    assert.ok(last(await send('sim')).includes('apagado'));
    saidas = await readRows('Saídas!A:J', { minRows: 1, retries: 15, delayMs: 1000 });
    assert.strictEqual(saidas.length, 1, 'Exclusão deve remover saída da planilha');

    enqueueStructured({ intent: 'ajuda' });
    assert.ok(last(await send('ajuda')).includes('assistente financeiro'));

    assert.ok(last(await send('admin stats')).includes('Stats usuários'));
    assert.ok(last(await send('admin listar usuarios')).includes('Usuários'));
    assert.ok(last(await send(`admin status ${SENDER}`)).includes('Status do usuário'));
    assert.ok(last(await send(`admin log ${SENDER}`)).includes('Últimos consentimentos'));

    enqueueStructured({ intent: 'desconhecido' });
    assert.ok(last(await send('abacaxi azul')).includes('Não entendi'));

    assert.strictEqual(userStateManager.getState(SENDER), undefined, 'Nenhum estado de conversa deve ficar pendente');
    } catch (error) {
        functionalFailed = true;
        throw error;
    }
});

test.after(() => {
    userStateManager.closeStateStore();
    if (RUN_FUNCTIONAL_TESTS) {
        setTimeout(() => process.exit(functionalFailed ? 1 : 0), 1000);
    }
});
