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

function assertMoney(reply, expected, context) {
    const formatted = `R$ ${Number(expected).toFixed(2).replace('.', ',')}`;
    assert.ok(
        reply.includes(formatted),
        `${context}: esperado ${formatted}, resposta recebida: ${reply}`
    );
}

function assertRegistered(reply, context) {
    assert.match(
        reply,
        /registrad[ao]|Registro finalizado/i,
        `${context}: resposta recebida: ${reply}`
    );
}

async function registerExpense(sendFn, message, details, context) {
    enqueueStructured({ intent: 'gasto', gastoDetails: [details] });
    assertRegistered(last(await sendFn(message)), context);
}

async function registerIncome(sendFn, message, details, context) {
    enqueueStructured({ intent: 'entrada', entradaDetails: [details] });
    assertRegistered(last(await sendFn(message)), context);
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
        assertRegistered(last(await send('gastei 80 no lanche em fevereiro no pix')), 'Gasto com pagamento informado deve registrar direto');

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
        assertRegistered(last(await send('recebi 3000 de salário no pix')), 'Entrada com recebimento informado deve registrar direto');

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
        assertRegistered(last(await send('gastei 80 no lanche em fevereiro no pix')), 'Primeiro gasto analítico deve registrar direto');

        enqueueStructured({
            intent: 'gasto',
            gastoDetails: [{
                descricao: 'uber fevereiro',
                valor: 30,
                categoria: 'Transporte',
                subcategoria: 'UBER / 99',
                pagamento: 'PIX',
                recorrente: 'Não',
                data: '11/02/2026'
            }]
        });
        assertRegistered(last(await send('gastei 30 de uber em fevereiro no pix')), 'Segundo gasto analítico deve registrar direto');

        enqueueStructured({
            intent: 'entrada',
            entradaDetails: [{
                descricao: 'salário fevereiro',
                valor: 3000,
                categoria: 'Salário',
                recebimento: 'PIX',
                recorrente: 'Não',
                data: '01/02/2026'
            }]
        });
        assertRegistered(last(await send('recebi 3000 de salário em fevereiro no pix')), 'Entrada analítica deve registrar direto');

        await syncReadModelIfNeeded({ force: true });

        let replies = await send('Quanto gastei em fevereiro?');
        let reply = last(replies);
        assert.ok(reply.includes('Total gasto em fevereiro/2026'), 'Total mensal sem categoria deve responder corretamente');
        assertMoney(reply, 110, 'Total mensal deve somar alimentação + transporte');
        assertMoney(reply, 0, 'Total mensal deve informar cartão zerado');
        assert.ok(!reply.includes('categoria informada'), 'Total mensal não deve falar categoria informada');

        replies = await send('Quanto gastei em fevereiro com alimentação?');
        reply = last(replies);
        assert.ok(reply.includes('Total gasto com alimentacao em fevereiro/2026'));
        assertMoney(reply, 80, 'Total por categoria alimentação');

        replies = await send('Quanto gastei em fevereiro com transporte?');
        reply = last(replies);
        assert.ok(reply.includes('Total gasto com transporte em fevereiro/2026'));
        assertMoney(reply, 30, 'Total por categoria transporte');

        replies = await send('qual meu saldo de fevereiro?');
        reply = last(replies);
        assert.ok(reply.includes('Saldo em fevereiro/2026'));
        assertMoney(reply, 2890, 'Saldo deve ser entradas menos saídas e cartões');
        assertMoney(reply, 3000, 'Saldo deve exibir entradas');
        assertMoney(reply, 110, 'Saldo deve exibir saídas totais');

        replies = await send('liste meus gastos com alimentação em fevereiro');
        reply = last(replies);
        assert.ok(reply.includes('Gastos encontrados (1)'), 'Listagem deve retornar somente gastos da categoria pedida');
        assert.ok(reply.includes('lanche fevereiro'), 'Listagem deve incluir o gasto correto');
        assertMoney(reply, 80, 'Listagem deve exibir valor correto');

        enqueueStructured({
            intent: 'apagar_item',
            deleteDetails: { descricao: 'ultimo', categoria: 'gasto' }
        });
        assert.match(last(await send('apagar último gasto')), /Encontrei|Você tem certeza/i);
        assert.ok(last(await send('sim')).includes('apagado'));

        const saidas = await readRows('Saídas!A:J', { minRows: 1, retries: 15, delayMs: 1000 });
        const saidasRestantes = rowsForUser(saidas, user.user_id, 9);
        assert.strictEqual(saidasRestantes.length, 1, 'Exclusão deve remover apenas o último gasto do usuário');
        assert.strictEqual(saidasRestantes[0][1], 'lanche fevereiro');

        enqueueStructured({ intent: 'ajuda' });
        assert.ok(last(await send('ajuda')).includes('assistente financeiro'));

        enqueueStructured({ intent: 'desconhecido' });
        assert.ok(last(await send('abacaxi azul')).includes('Não entendi'));
    });
});

functionalTest('functional: complex analytics handles typos, counts, duplicates and min/max', { concurrency: false }, async () => {
    await withFunctionalState(FUNCTIONAL_SENDERS.complexAnalytics, async ({ activateAndOnboard, send }) => {
        await activateAndOnboard();

        const expenseBase = {
            pagamento: 'PIX',
            recorrente: 'Não'
        };

        await registerExpense(send, 'gastei 4,70 no onibis em fevereiro no pix', {
            ...expenseBase,
            descricao: 'onibis centro',
            valor: 4.70,
            categoria: 'Transporte',
            subcategoria: 'TRANSPORTE PÚBLICO',
            data: '03/02/2026'
        }, 'Ônibus com typo deve registrar como transporte');
        await registerExpense(send, 'gastei 4,70 no ônibus volta em fevereiro no pix', {
            ...expenseBase,
            descricao: 'ônibus volta',
            valor: 4.70,
            categoria: 'Transporte',
            subcategoria: 'TRANSPORTE PÚBLICO',
            data: '04/02/2026'
        }, 'Ônibus com acento deve registrar como transporte');
        await registerExpense(send, 'gastei 27,30 de uber em fevereiro no pix', {
            ...expenseBase,
            descricao: 'uber noite',
            valor: 27.30,
            categoria: 'Transporte',
            subcategoria: 'UBER / 99',
            data: '05/02/2026'
        }, 'Uber deve registrar como transporte');
        await registerExpense(send, 'gastei 125,49 no guanabara em fevereiro no pix', {
            ...expenseBase,
            descricao: 'mercado guanabara',
            valor: 125.49,
            categoria: 'Alimentação',
            subcategoria: 'SUPERMERCADO',
            data: '06/02/2026'
        }, 'Mercado deve registrar como alimentação');
        await registerExpense(send, 'gastei 12,50 na padaria em fevereiro no pix', {
            ...expenseBase,
            descricao: 'padaria pão',
            valor: 12.50,
            categoria: 'Alimentação',
            subcategoria: 'PADARIA / LANCHE',
            data: '07/02/2026'
        }, 'Padaria deve registrar como alimentação');
        await registerExpense(send, 'gastei 43,20 no ifood em fevereiro no pix', {
            ...expenseBase,
            descricao: 'ifood almoço',
            valor: 43.20,
            categoria: 'Alimentação',
            subcategoria: 'DELIVERY / IFOOD',
            data: '08/02/2026'
        }, 'Ifood deve registrar como alimentação');
        await registerExpense(send, 'gastei 35 na farmacia em fevereiro no pix', {
            ...expenseBase,
            descricao: 'remédio farmácia',
            valor: 35,
            categoria: 'Saúde',
            subcategoria: 'FARMÁCIA',
            data: '09/02/2026'
        }, 'Farmácia deve registrar como saúde');
        await registerExpense(send, 'gastei 99,90 de internet casa em fevereiro no pix', {
            ...expenseBase,
            descricao: 'internet casa',
            valor: 99.90,
            categoria: 'Moradia',
            subcategoria: 'INTERNET',
            data: '10/02/2026'
        }, 'Internet casa deve registrar como moradia');
        await registerExpense(send, 'gastei 99,90 de internet trabalho em fevereiro no pix', {
            ...expenseBase,
            descricao: 'internet trabalho',
            valor: 99.90,
            categoria: 'Moradia',
            subcategoria: 'INTERNET',
            data: '11/02/2026'
        }, 'Internet trabalho deve registrar como moradia');
        await registerExpense(send, 'gastei 50 de onibus em março no pix', {
            ...expenseBase,
            descricao: 'onibus março',
            valor: 50,
            categoria: 'Transporte',
            subcategoria: 'TRANSPORTE PÚBLICO',
            data: '05/03/2026'
        }, 'Gasto de março deve ficar fora das consultas de fevereiro');

        await registerIncome(send, 'recebi 2000 de salário em fevereiro no pix', {
            descricao: 'salário fevereiro',
            valor: 2000,
            categoria: 'Salário',
            recebimento: 'PIX',
            recorrente: 'Não',
            data: '01/02/2026'
        }, 'Salário deve registrar como entrada');
        await registerIncome(send, 'recebi 500 de freela em fevereiro no pix', {
            descricao: 'freela fevereiro',
            valor: 500,
            categoria: 'Renda Extra',
            recebimento: 'PIX',
            recorrente: 'Não',
            data: '15/02/2026'
        }, 'Freela deve registrar como entrada');

        await syncReadModelIfNeeded({ force: true });

        let reply = last(await send('Quanto gastei em fevereiro?'));
        assert.ok(reply.includes('Total gasto em fevereiro/2026'));
        assertMoney(reply, 452.69, 'Total mensal complexo deve somar todas as saídas de fevereiro e ignorar março');

        reply = last(await send('Quanto gastei com transpote em fevereiro?'));
        assert.ok(reply.includes('Total gasto com transpote em fevereiro/2026'));
        assertMoney(reply, 36.70, 'Categoria com typo "transpote" deve somar transporte');

        reply = last(await send('Quanto gastei de onibis em fevereiro?'));
        assert.ok(reply.includes('Total gasto com onibis em fevereiro/2026'));
        assertMoney(reply, 9.40, 'Busca por descrição com typo "onibis" deve somar as duas viagens de ônibus');

        reply = last(await send('media de gastos com alimentacao em fevereiro'));
        assert.ok(reply.includes('Média de gastos com alimentacao em fevereiro/2026'));
        assertMoney(reply, 60.40, 'Média de alimentação deve dividir por 3 itens');

        reply = last(await send('liste meus gastos de onibis em fevereiro'));
        assert.ok(reply.includes('Gastos encontrados (2)'), 'Listagem por typo de ônibus deve encontrar 2 itens de fevereiro');
        assert.ok(reply.includes('onibis centro'), 'Listagem deve incluir o item escrito errado');
        assert.ok(reply.includes('ônibus volta'), 'Listagem deve incluir o item com acento');

        reply = last(await send('quantas vezes usei onibis em fevereiro?'));
        assert.ok(reply.includes('Ocorrências encontradas em fevereiro/2026: 2'), `Contagem por typo deve retornar 2. Resposta: ${reply}`);

        reply = last(await send('quantas vezes usei transporte em fevereiro?'));
        assert.ok(reply.includes('Ocorrências encontradas em fevereiro/2026: 3'), `Contagem por categoria deve retornar 3. Resposta: ${reply}`);

        enqueueStructured({ intent: 'pergunta', question: 'tem valores duplicados em fevereiro?' });
        reply = last(await send('tem valores duplicados em fevereiro?'));
        assert.ok(reply.includes('Valores duplicados em fevereiro/2026'), 'Duplicados devem ser detectados');
        assert.ok(reply.includes('R$ 4,70 (2x)'), 'Duplicado de passagem deve aparecer');
        assert.ok(reply.includes('R$ 99,90 (2x)'), 'Duplicado de internet deve aparecer');

        reply = last(await send('qual foi o maior e menor gasto em fevereiro?'));
        assert.ok(reply.includes('Maior e menor gasto em fevereiro/2026'));
        assert.ok(reply.includes('mercado guanabara'), 'Maior gasto deve ser mercado guanabara');
        assert.ok(reply.includes('onibis centro'), 'Menor gasto deve ser uma das passagens');
        assertMoney(reply, 125.49, 'Maior gasto deve ter valor correto');
        assertMoney(reply, 4.70, 'Menor gasto deve ter valor correto');

        reply = last(await send('qual meu saldo de fevereiro?'));
        assert.ok(reply.includes('Saldo em fevereiro/2026'));
        assertMoney(reply, 2047.31, 'Saldo complexo deve ser entradas menos saídas');
        assertMoney(reply, 2500, 'Saldo complexo deve exibir entradas');
        assertMoney(reply, 452.69, 'Saldo complexo deve exibir saídas');
    });
});

test.after(() => {
    userStateManager.closeStateStore();
    if (RUN_FUNCTIONAL_TESTS) {
        setTimeout(() => process.exit(functionalFailed ? 1 : 0), 1000);
    }
});
