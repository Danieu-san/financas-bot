const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

if (!process.env.ADMIN_IDS) {
    process.env.ADMIN_IDS = '5521970112407@c.us';
}

const helpers = require('../src/utils/helpers');
const analysisService = require('../src/services/analysisService');
const userStateManager = require('../src/state/userStateManager');
const userService = require('../src/services/userService');
const adminCheck = require('../src/utils/adminCheck');
const messageHandler = require('../src/handlers/messageHandler');
const onboardingHandler = require('../src/handlers/onboardingHandler');
const creationHandler = require('../src/handlers/creationHandler');
const debtHandler = require('../src/handlers/debtHandler');
const deletionHandler = require('../src/handlers/deletionHandler');
const googleService = require('../src/services/google');

// --- Helpers Tests ---
test('helpers.parseValue', (t) => {
    assert.strictEqual(helpers.parseValue("1.800,50"), 1800.5, 'BR format should work');
    assert.strictEqual(helpers.parseValue("120.50"), 120.5, 'US format should work');
    assert.strictEqual(helpers.parseValue("R$ 1.234,56"), 1234.56, 'Format with R$ should work');
    assert.strictEqual(helpers.parseValue("abc"), 0, 'Invalid string should return 0');
    assert.strictEqual(helpers.parseValue(""), 0, 'Empty string should return 0');
    assert.strictEqual(helpers.parseValue(null), 0, 'Null should return 0');
});

test('helpers.parseAmountLocal', (t) => {
    assert.strictEqual(helpers.parseAmountLocal('2000'), 2000);
    assert.strictEqual(helpers.parseAmountLocal('2.000'), 2000);
    assert.strictEqual(helpers.parseAmountLocal('R$ 2 mil'), 2000);
    assert.strictEqual(helpers.parseAmountLocal('dois mil'), 2000);
    assert.strictEqual(helpers.parseAmountLocal('dois mil e quinhentos'), 2500);
});

test('helpers.normalizeText', (t) => {
    assert.strictEqual(helpers.normalizeText("Ação"), "acao", 'Accents should be removed');
    assert.strictEqual(helpers.normalizeText("TEXTO"), "texto", 'Should lowercase');
    assert.strictEqual(helpers.normalizeText("É o bicho!"), "e o bicho!", 'Mixed case and accents');
    assert.strictEqual(helpers.normalizeText(null), '', 'Null should return empty string');
});

test('helpers.parseSheetDate', (t) => {
    const d1 = helpers.parseSheetDate("15/03/2026");
    assert.strictEqual(d1.getDate(), 15);
    assert.strictEqual(d1.getMonth(), 2); // March is index 2
    assert.strictEqual(d1.getFullYear(), 2026);

    const d2 = helpers.parseSheetDate("15/03/2026 10:30");
    assert.strictEqual(d2.getDate(), 15);
    assert.strictEqual(d2.getFullYear(), 2026);

    const d3 = helpers.parseSheetDate("46063");
    assert.strictEqual(d3.getDate(), 10);
    assert.strictEqual(d3.getMonth(), 1);
    assert.strictEqual(d3.getFullYear(), 2026);

    assert.strictEqual(helpers.parseSheetDate("invalid"), null, 'Invalid date string should return null');
    assert.strictEqual(helpers.parseSheetDate(""), null, 'Empty string should return null');
});

test('helpers.getFormattedDateOnly', (t) => {
    const today = new Date();
    const formatted = helpers.getFormattedDateOnly(today);
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    assert.strictEqual(formatted, `${day}/${month}/${year}`);
});

// --- Analysis Service Tests ---
const mockData = [
    ["01/03/2026", "Gasto 1", "Alimentação", "Supermercado", "100,50"],
    ["15/03/2026", "Gasto 2", "Lazer", "Cinema", "50,00"],
    ["20/03/2026", "Gasto 3", "Alimentação", "Restaurante", "150,00"],
    ["05/04/2026", "Gasto 4", "Educação", "Curso", "500,00"]
];

test('analysisService.calculateTotal', (t) => {
    const total = analysisService.calculateTotal(mockData, 4);
    assert.strictEqual(total, 100.5 + 50.0 + 150.0 + 500.0);
});

test('analysisService.calculateAverage', (t) => {
    const avg = analysisService.calculateAverage(mockData);
    assert.strictEqual(avg, (100.5 + 50.0 + 150.0 + 500.0) / 4);
});

test('analysisService.findMinMax', (t) => {
    const { min, max } = analysisService.findMinMax(mockData);
    assert.deepStrictEqual(min, mockData[1], 'Min should be 50,00');
    assert.deepStrictEqual(max, mockData[3], 'Max should be 500,00');
});

test('analysisService.getExpensesByMonthAndCategory', (t) => {
    const result = analysisService.getExpensesByMonthAndCategory(mockData, 2, 2026, "Alimentação");
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0][1], "Gasto 1");
    assert.strictEqual(result[1][1], "Gasto 3");
});

// --- User State Manager Tests ---
test('userStateManager.stateFunctions', (t) => {
    const userId = '123456';
    const state = { step: 'awaiting_payment_method', amount: 100 };

    userStateManager.setState(userId, state);
    assert.deepStrictEqual(userStateManager.getState(userId), state, 'Should retrieve state');

    userStateManager.deleteState(userId);
    assert.strictEqual(userStateManager.getState(userId), undefined, 'Should be deleted');
});

test('userStateManager TTL expires stale states', async (t) => {
    const userId = 'ttl-user';

    userStateManager.setState(userId, { step: 'temporary' }, 0.01);
    assert.deepStrictEqual(userStateManager.getState(userId), { step: 'temporary' });

    await new Promise(resolve => setTimeout(resolve, 25));
    assert.strictEqual(userStateManager.getState(userId), undefined, 'Expired state should be removed');
});

test('userStateManager flush is atomic via temp file rename', (t) => {
    const { flushStateToDisk, getStateFilePaths } = userStateManager.__test__;
    const { stateFile, tempFile } = getStateFilePaths();
    const userId = 'flush-user';

    userStateManager.setState(userId, { step: 'persisted' });
    flushStateToDisk();

    assert.strictEqual(fs.existsSync(tempFile), false, 'Temporary file should not remain after atomic rename');
    assert.strictEqual(fs.existsSync(stateFile), true, 'State file should exist after flush');
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.deepStrictEqual(parsed[userId].data, { step: 'persisted' });

    userStateManager.deleteState(userId);
    flushStateToDisk();
});

test('userService.legalInfoHelpers', (t) => {
    assert.strictEqual(userService.isLegalInfoCommand('termos'), true);
    assert.strictEqual(userService.isLegalInfoCommand('privacidade'), true);
    assert.strictEqual(userService.isLegalInfoCommand('politica de privacidade'), true);
    assert.strictEqual(userService.isLegalInfoCommand('qual saldo'), false);

    const reply = userService.buildPublicLegalSummaryReply({ includeAcceptInstruction: true, termsVersion: 'v1.1' });
    assert.ok(reply.includes('Termos (v1.1):'), 'Should include terms version');
    assert.ok(reply.includes('Resumo legal:'), 'Should include summary header');
    assert.ok(reply.includes('BLOCKED'), 'Should include BLOCKED in lifecycle summary');
    assert.ok(reply.includes('responda apenas: ACEITO'), 'Should include acceptance instruction when requested');
});

test('userService.USER_STATUS', (t) => {
    assert.strictEqual(userService.USER_STATUS.BLOCKED, 'BLOCKED');
    assert.strictEqual(userService.USER_STATUS.ACTIVE, 'ACTIVE');
    assert.strictEqual(userService.USER_STATUS.PENDING_APPROVAL, 'PENDING_APPROVAL');
    assert.strictEqual(userService.USER_STATUS.APPROVED_AWAITING_GOOGLE, 'APPROVED_AWAITING_GOOGLE');
});

test('adminCheck.isAdminWithContext', (t) => {
    assert.strictEqual(
        adminCheck.isAdminWithContext('151058345148646@lid', { display_name: 'Daniel' }),
        true,
        'LID sender with known admin display name should be treated as admin'
    );
    assert.strictEqual(
        adminCheck.isAdminWithContext('151058345148646@lid', { display_name: 'Outro Nome' }),
        false,
        'Unknown display name should not be admin'
    );
});

test('messageHandler.classifyPerguntaLocally distinguishes total month from category total', (t) => {
    const { classifyPerguntaLocally } = messageHandler.__test__;

    const totalMonth = classifyPerguntaLocally('Quanto gastei em fevereiro?');
    assert.strictEqual(totalMonth.intent, 'total_gastos_mes');
    assert.strictEqual(totalMonth.parameters.mes, 1);
    assert.strictEqual(totalMonth.parameters.categoria, undefined);

    const categoryTotal = classifyPerguntaLocally('Quanto gastei esse mês com alimentação?');
    assert.strictEqual(categoryTotal.intent, 'total_gastos_categoria_mes');
    assert.strictEqual(categoryTotal.parameters.categoria, 'alimentacao');
});

test('messageHandler local command routing avoids AI for common commands and low-signal text', (t) => {
    const { detectLocalCommandIntent, shouldSkipAiForUnknownMessage } = messageHandler.__test__;

    assert.deepStrictEqual(detectLocalCommandIntent('AJUDA'), { intent: 'ajuda' });
    assert.deepStrictEqual(detectLocalCommandIntent('relatório mensal'), { intent: 'resumo' });
    assert.strictEqual(shouldSkipAiForUnknownMessage('teste'), true);
    assert.strictEqual(shouldSkipAiForUnknownMessage('valeu'), true);
    assert.strictEqual(shouldSkipAiForUnknownMessage('Uber 20'), false);
    assert.strictEqual(shouldSkipAiForUnknownMessage('gastei no mercado'), false);
});

test('messageHandler.local replies cover greeting and total month', (t) => {
    const { isGreetingMessage, buildGreetingReply, buildLocalPerguntaResponse } = messageHandler.__test__;

    assert.strictEqual(isGreetingMessage('Oi'), true);
    assert.strictEqual(isGreetingMessage('Quanto gastei?'), false);
    assert.ok(buildGreetingReply('Daniel').includes('Oi, Daniel!'));

    const reply = buildLocalPerguntaResponse({
        intent: 'total_gastos_mes',
        analyzedData: {
            results: 150.5,
            details: { totalSaidas: 100, totalCartoes: 50.5, mes: 1, ano: 2026 }
        }
    });

    assert.ok(reply.includes('Total gasto em fevereiro/2026: R$ 150,50'));
    assert.ok(reply.includes('Saídas: R$ 100,00'));
    assert.ok(reply.includes('Cartões: R$ 50,50'));
});

test('creationHandler debt success message explains dashboard and spending distinction', () => {
    const { buildDebtSuccessMessage } = creationHandler.__test__;
    const message = buildDebtSuccessMessage('ap');

    assert.match(message, /Dívida "ap" registrada com sucesso/);
    assert.match(message, /dashboard/i);
    assert.match(message, /não entra como gasto/i);
    assert.match(message, /registrar pagamento/i);
});

test('messageHandler.normalizeMetricLabel keeps metric names bounded and safe', (t) => {
    const { normalizeMetricLabel } = messageHandler.__test__;

    assert.strictEqual(normalizeMetricLabel('SQLite'), 'sqlite');
    assert.strictEqual(normalizeMetricLabel('sheets fallback!'), 'sheets_fallback');
    assert.ok(normalizeMetricLabel('x'.repeat(100)).length <= 60);
});

test('messageHandler active ACEITO is handled before AI routing', async (t) => {
    const { handleAccountLifecycleCommands } = messageHandler.__test__;
    const replies = [];
    const msg = {
        body: 'ACEITO',
        reply: async text => replies.push(String(text))
    };

    const handled = await handleAccountLifecycleCommands(msg, { user_id: 'user-active' });

    assert.strictEqual(handled, true);
    assert.strictEqual(replies.length, 1);
    assert.ok(replies[0].includes('consentimento já está ativo'));
});

test('messageHandler legal commands build audit log context', () => {
    const { buildLegalCommandLogContext } = messageHandler.__test__;
    const context = buildLegalCommandLogContext(
        { body: 'TERMOS', author: '5511999999999@c.us' },
        { user_id: 'user-123', display_name: 'Daniel' }
    );

    assert.deepStrictEqual(context, {
        command: 'termos',
        sender_id: '5511999999999@c.us',
        user_id: 'user-123',
        display_name: 'Daniel',
        terms_version: process.env.TERMS_VERSION || 'v1.1'
    });

    assert.strictEqual(buildLegalCommandLogContext({ body: 'oi', from: 'x' }, { user_id: 'u' }), null);
});

test('onboarding rejects command-looking text as display name', (t) => {
    const { looksLikeBotCommand } = onboardingHandler.__test__;

    assert.strictEqual(looksLikeBotCommand('gastei 10 no teste E2E no pix'), true);
    assert.strictEqual(looksLikeBotCommand('quanto gastei esse mês?'), true);
    assert.strictEqual(looksLikeBotCommand('dashboard'), true);
    assert.strictEqual(looksLikeBotCommand('Daniel'), false);
});

test('messageHandler.filterSheetRowsByUserId keeps header and isolates user rows', (t) => {
    const { filterSheetRowsByUserId } = messageHandler.__test__;
    const rows = [
        ['Data', 'Descrição', 'Valor', 'user_id'],
        ['10/02/2026', 'lanche', '20', 'user-a'],
        ['10/02/2026', 'uber', '30', 'user-b'],
        ['11/02/2026', 'mercado', '40', 'user-a']
    ];

    const filtered = filterSheetRowsByUserId(rows, 3, 'user-a');
    assert.deepStrictEqual(filtered, [
        ['Data', 'Descrição', 'Valor', 'user_id'],
        ['10/02/2026', 'lanche', '20', 'user-a'],
        ['11/02/2026', 'mercado', '40', 'user-a']
    ]);
});

test('debtHandler.filterDebtsByUserId isolates debts by user_id', (t) => {
    const { filterDebtsByUserId } = debtHandler.__test__;
    const rows = [
        ['Nome', 'Credor', 'Tipo', 'Valor Original', 'Saldo Atual', 'Parcela', 'Taxa', 'Vencimento', 'Inicio', 'Total', 'Status', 'Responsável', 'Obs', '%', 'Proximo', 'Atraso', 'Quitacao', 'user_id'],
        ['Carro', 'Banco A', 'Financiamento', 10000, 9000, 500, '2% a.m.', 10, '01/01/2026', 20, 'Em dia', 'Daniel', '', '', '', 0, '', 'user-a'],
        ['Casa', 'Banco B', 'Financiamento', 20000, 19000, 800, '1% a.m.', 12, '01/01/2026', 30, 'Em dia', 'Thais', '', '', '', 0, '', 'user-b']
    ];

    const result = filterDebtsByUserId(rows, 'user-a');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].row[0], 'Carro');
    assert.strictEqual(result[0].index, 1);
});

test('deletionHandler.filterCandidateRowsByUserId isolates deletable rows by user_id', (t) => {
    const { filterCandidateRowsByUserId } = deletionHandler.__test__;
    const rows = [
        ['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Responsável', 'Pagamento', 'Recorrente', 'Obs', 'user_id'],
        ['10/02/2026', 'lanche', 'Alimentação', 'Lanche', '20', 'Daniel', 'PIX', 'Não', '', 'user-a'],
        ['10/02/2026', 'uber', 'Transporte', 'App', '30', 'Thais', 'PIX', 'Não', '', 'user-b'],
        ['11/02/2026', 'mercado', 'Alimentação', 'Mercado', '40', 'Daniel', 'PIX', 'Não', '', 'user-a']
    ];
    const headerMap = {
        data: 0,
        descricao: 1,
        categoria: 2,
        subcategoria: 3,
        valor: 4,
        user_id: 9
    };

    const result = filterCandidateRowsByUserId(rows, headerMap, 'Saídas', 'user-a');
    assert.deepStrictEqual(result.map(item => item.index), [1, 3]);
    assert.deepStrictEqual(result.map(item => item.row[1]), ['lanche', 'mercado']);
});

test('google.eventBelongsToUser isolates Calendar events by private user_id', (t) => {
    const { eventBelongsToUser } = googleService.__test__;
    const event = {
        id: 'event-1',
        extendedProperties: {
            private: {
                financas_bot_user_id: 'user-a'
            }
        }
    };

    assert.strictEqual(eventBelongsToUser(event, 'user-a'), true);
    assert.strictEqual(eventBelongsToUser(event, 'user-b'), false);
    assert.strictEqual(eventBelongsToUser({ id: 'untagged' }, 'user-a'), false);
    assert.strictEqual(eventBelongsToUser({ id: 'untagged' }), true);
});

test('google.validateUserScopedWrite blocks user scoped rows without user_id', (t) => {
    const { validateUserScopedWrite } = googleService.__test__;

    assert.throws(
        () => validateUserScopedWrite('Saídas', ['10/02/2026', 'lanche', 'Alimentação', '', 10, 'Daniel', 'PIX', 'Não', '', '']),
        /user_id válido/
    );
    assert.throws(
        () => validateUserScopedWrite('Cartão Nubank - Daniel', ['10/02/2026', 'mercado', 'Alimentação', 50, '1/1', 'Fevereiro de 2026', '']),
        /user_id válido/
    );
    assert.doesNotThrow(() => {
        validateUserScopedWrite('Saídas', ['10/02/2026', 'lanche', 'Alimentação', '', 10, 'Daniel', 'PIX', 'Não', '', 'user-1']);
        validateUserScopedWrite('Entradas', ['10/02/2026', 'salário', 'Salário', 1000, 'Daniel', 'PIX', 'Não', '', 'user-1']);
        validateUserScopedWrite('Dívidas', ['financiamento', 'banco', 'Financiamento', 1000, 900, 100, '2%', 10, '01/01/2026', 10, 'Ativa', 'Daniel', '', '10%', '', '', '', 'user-1']);
        validateUserScopedWrite('Metas', ['Reserva', 1000, 100, '10%', 100, '31/12/2026', 'Ativa', 'Alta', 'user-1']);
        validateUserScopedWrite('DashboardData', ['Saldo', 'R$ 100', 'Maio/2026', 'user-1', '2026-05-15T00:00:00.000Z']);
        validateUserScopedWrite('Cartão Nubank - Daniel', ['10/02/2026', 'mercado', 'Alimentação', 50, '1/1', 'Fevereiro de 2026', 'user-1']);
    });
});

test('google user spreadsheet mapping keeps legacy card flows compatible', (t) => {
    const {
        mapSheetNameForUserSpreadsheet,
        mapRangeForUserSpreadsheet,
        mapRowForUserSpreadsheet,
        mapValuesFromUserSpreadsheetRange
    } = googleService.__test__;

    assert.strictEqual(mapSheetNameForUserSpreadsheet('Saídas'), 'Saídas');
    assert.strictEqual(mapSheetNameForUserSpreadsheet('Cartão Nubank - Daniel'), 'Lançamentos Cartão');
    assert.strictEqual(mapRangeForUserSpreadsheet('Dívidas'), 'Dívidas');
    assert.strictEqual(mapRangeForUserSpreadsheet('Cartão Nubank - Daniel!A:G'), 'Lançamentos Cartão!A:J');

    assert.deepStrictEqual(
        mapRowForUserSpreadsheet('Cartão Nubank - Daniel', ['10/02/2026', 'mercado', 'Alimentação', 50, '1/1', 'Fevereiro de 2026', 'user-1']),
        ['10/02/2026', 'mercado', 'Alimentação', 50, '1/1', 'Fevereiro de 2026', 'nubank-daniel', 'Cartão Nubank - Daniel', '', 'user-1']
    );

    assert.deepStrictEqual(
        mapValuesFromUserSpreadsheetRange('Cartão Nubank - Daniel!A:G', [
            ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'card_id', 'Cartão', 'Observações', 'user_id'],
            ['10/02/2026', 'mercado', 'Alimentação', 50, '1/1', 'Fevereiro de 2026', 'nubank-daniel', 'Nubank', '', 'user-1']
        ]),
        [
            ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'user_id'],
            ['10/02/2026', 'mercado', 'Alimentação', 50, '1/1', 'Fevereiro de 2026', 'user-1']
        ]
    );
});

test('google.headerToNumberFormat distinguishes date columns from due-day columns', (t) => {
    const { headerToNumberFormat } = googleService.__test__;

    assert.deepStrictEqual(headerToNumberFormat('Data'), { type: 'DATE', pattern: 'dd/mm/yyyy' });
    assert.deepStrictEqual(headerToNumberFormat('Próximo Vencimento'), { type: 'DATE', pattern: 'dd/mm/yyyy' });
    assert.deepStrictEqual(headerToNumberFormat('Data Prevista para Quitação'), { type: 'DATE', pattern: 'dd/mm/yyyy' });
    assert.deepStrictEqual(headerToNumberFormat('Dia do Vencimento'), { type: 'NUMBER', pattern: '0' });
    assert.deepStrictEqual(headerToNumberFormat('Vencimento'), { type: 'NUMBER', pattern: '0' });
    assert.deepStrictEqual(headerToNumberFormat('accepted_at'), { type: 'DATE_TIME', pattern: 'dd/mm/yyyy hh:mm' });
});

test('google.requireUserId protects calendar writes', (t) => {
    const { requireUserId } = googleService.__test__;

    assert.throws(() => requireUserId('', 'createCalendarEvent'), /user_id válido/);
    assert.strictEqual(requireUserId(' user-1 ', 'createCalendarEvent'), 'user-1');
});
