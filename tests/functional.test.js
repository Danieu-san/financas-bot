const test = require('node:test');
const assert = require('node:assert');

const RUN_FUNCTIONAL_TESTS = String(process.env.RUN_FUNCTIONAL_TESTS || '').toLowerCase() === 'true';
const functionalTest = RUN_FUNCTIONAL_TESTS ? test : test.skip;

const {
    FUNCTIONAL_SENDERS,
    SENDER,
    createFunctionalContext,
    createdCalendarEvents,
    enqueueStructured,
    last,
    readRows,
    resetFunctionalState,
    send,
    syncReadModelIfNeeded,
    userStateManager
} = require('./functionalHarness');

let functionalFailed = false;
let spreadsheetReset = false;

function rowsForUser(rows, userId, userIdIndex) {
    return rows.slice(1).filter(row => row[userIdIndex] === userId);
}

async function withFunctionalState(sender, fn) {
    try {
        if (!spreadsheetReset) {
            await resetFunctionalState(SENDER, { resetSpreadsheet: true });
            spreadsheetReset = true;
        }
        await resetFunctionalState(sender);
        await fn(createFunctionalContext(sender));
    } catch (error) {
        functionalFailed = true;
        throw error;
    }
}

functionalTest('functional: consent, onboarding, settings and dashboard', { concurrency: false }, async () => {
    await withFunctionalState(FUNCTIONAL_SENDERS.surface, async ({ activateAndOnboard, send }) => {
        const user = await activateAndOnboard();

        let replies = await send('Oi');
        assert.ok(last(replies).includes('Oi, Daniel'), 'Saudação deve responder localmente');

        assert.ok(last(await send('ativar checkin semanal')).includes('Check-in semanal ativado'));
        assert.ok(last(await send('definir reserva 12%')).includes('12%'));
        assert.ok(last(await send('dashboard')).includes('/dashboard?token='), 'Dashboard deve gerar link autenticado');
        assert.strictEqual(userStateManager.getState(user.whatsapp_id), undefined, 'Onboarding não deve deixar estado pendente');
    });
});

functionalTest('functional: expenses, income and credit card installments', { concurrency: false }, async () => {
    await withFunctionalState(FUNCTIONAL_SENDERS.transactions, async ({ activateAndOnboard, send }) => {
        const user = await activateAndOnboard();

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

        const saidas = await readRows('Saídas!A:J', { minRows: 2 });
        const saidasDoUsuario = rowsForUser(saidas, user.user_id, 9);
        assert.strictEqual(saidasDoUsuario.length, 1, 'Deve existir 1 saída do usuário');
        assert.strictEqual(saidasDoUsuario[0][1], 'lanche fevereiro');

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
        const entradasDoUsuario = rowsForUser(entradas, user.user_id, 8);
        assert.strictEqual(entradasDoUsuario.length, 1, 'Deve existir 1 entrada do usuário');

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
        const parcelasDoUsuario = rowsForUser(cartao, user.user_id, 6);
        assert.strictEqual(parcelasDoUsuario.length, 2, 'Compra em 2 parcelas deve criar 2 linhas do usuário');
    });
});

functionalTest('functional: goals, debts, payments and reminders', { concurrency: false }, async () => {
    await withFunctionalState(FUNCTIONAL_SENDERS.creation, async ({ activateAndOnboard, send }) => {
        const user = await activateAndOnboard();

        enqueueStructured({ intent: 'criar_meta' });
        assert.ok(last(await send('criar meta')).includes('nome da sua nova meta'));
        assert.ok(last(await send('Reserva')).includes('valor alvo'));
        assert.match(last(await send('1000')), /guardado|valor atual/i);
        assert.match(last(await send('100')), /data final|data/i);
        assert.match(last(await send('31/12/2026')), /prioridade/i);
        assert.match(last(await send('Alta')), /Meta "Reserva" registrada/i);

        const metas = await readRows('Metas!A:I', { minRows: 2 });
        const metasDoUsuario = rowsForUser(metas, user.user_id, 8);
        assert.strictEqual(metasDoUsuario.length, 1, 'Meta deve ser registrada para o usuário');

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
        let dividasDoUsuario = rowsForUser(dividas, user.user_id, 17);
        assert.strictEqual(dividasDoUsuario.length, 1, 'Dívida deve ser registrada para o usuário');

        enqueueStructured({
            intent: 'registrar_pagamento',
            pagamentoDetails: { descricao: 'Financiamento Teste' }
        });
        assert.ok(last(await send('paguei financiamento teste')).includes('Qual foi o valor'));
        assert.ok(last(await send('100')).includes('novo saldo devedor'));
        dividas = await readRows('Dívidas!A:R', { minRows: 2 });
        dividasDoUsuario = rowsForUser(dividas, user.user_id, 17);
        assert.strictEqual(Number(dividasDoUsuario[0][4]), 900, 'Pagamento deve reduzir saldo da dívida');

        enqueueStructured({
            intent: 'criar_lembrete',
            lembreteDetails: { titulo: 'Pagar IPVA', dataHora: '12/05/2026 09:00', recorrencia: '' }
        });
        assert.ok(last(await send('me lembre de pagar o IPVA amanhã às 9h')).includes('Lembrete criado'));
        assert.strictEqual(createdCalendarEvents.length, 1, 'Lembrete deve chamar Calendar mockado');
        assert.strictEqual(createdCalendarEvents[0].options.userId, user.user_id, 'Lembrete deve ser marcado com user_id');
    });
});

functionalTest('functional: analytics, deletion, admin and fallback', { concurrency: false }, async () => {
    await withFunctionalState(FUNCTIONAL_SENDERS.analytics, async ({ activateAndOnboard, send, sender }) => {
        const user = await activateAndOnboard();

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

        await syncReadModelIfNeeded({ force: true });

        let replies = await send('Quanto gastei em fevereiro?');
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

        const saidas = await readRows('Saídas!A:J', { minRows: 1, retries: 15, delayMs: 1000 });
        assert.strictEqual(rowsForUser(saidas, user.user_id, 9).length, 0, 'Exclusão deve remover saída do usuário');

        enqueueStructured({ intent: 'ajuda' });
        assert.ok(last(await send('ajuda')).includes('assistente financeiro'));

        assert.ok(last(await send('admin stats')).includes('Stats usuários'));
        assert.ok(last(await send('admin listar usuarios')).includes('Usuários'));
        assert.ok(last(await send(`admin status ${sender}`)).includes('Status do usuário'));
        assert.ok(last(await send(`admin log ${sender}`)).includes('Últimos consentimentos'));

        enqueueStructured({ intent: 'desconhecido' });
        assert.ok(last(await send('abacaxi azul')).includes('Não entendi'));
    });
});

test.after(() => {
    userStateManager.closeStateStore();
    if (RUN_FUNCTIONAL_TESTS) {
        setTimeout(() => process.exit(functionalFailed ? 1 : 0), 1000);
    }
});
