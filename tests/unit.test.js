const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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
const calculationOrchestrator = require('../src/services/calculationOrchestrator');
const qaFailureLogService = require('../src/services/qaFailureLogService');

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

test('textMatcher.fuzzyIncludes tolerates common finance typos', () => {
    const { fuzzyIncludes, matchesAnyField } = require('../src/utils/textMatcher');

    assert.strictEqual(fuzzyIncludes('Transporte', 'transpote'), true);
    assert.strictEqual(fuzzyIncludes('ônibus volta', 'onibis'), true);
    assert.strictEqual(matchesAnyField(['Moradia', 'INTERNET', 'internet casa'], 'internete'), true);
    assert.strictEqual(matchesAnyField(['Alimentação', 'SUPERMERCADO', 'mercado'], 'transpote'), false);
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

test('adminCheck reads ADMIN_IDS dynamically when env changes', () => {
    const previousAdminIds = process.env.ADMIN_IDS;

    try {
        process.env.ADMIN_IDS = '111111111111@c.us';
        assert.strictEqual(adminCheck.isAdmin('111111111111@c.us'), true);
        assert.strictEqual(adminCheck.isAdmin('222222222222@c.us'), false);

        process.env.ADMIN_IDS = '222222222222@c.us';
        assert.strictEqual(adminCheck.isAdmin('111111111111@c.us'), false);
        assert.strictEqual(adminCheck.isAdmin('222222222222@c.us'), true);
    } finally {
        process.env.ADMIN_IDS = previousAdminIds;
    }
});

test('messageHandler lets admin commands bypass access gate for admin LID', async () => {
    const { handleAdminCommandBeforeAccess } = messageHandler.__test__;
    const previousAdminIds = process.env.ADMIN_IDS;
    const replies = [];

    try {
        process.env.ADMIN_IDS = '5521970112407@c.us';
        const handled = await handleAdminCommandBeforeAccess(
            {
                body: 'admin ajuda',
                reply: async (text) => replies.push(text)
            },
            '151058345148646@lid',
            { allowed: false, user: { display_name: 'Daniel', status: userService.USER_STATUS.PENDING_APPROVAL } }
        );

        assert.strictEqual(handled, true);
        assert.ok(replies[0].includes('Comandos admin:'));
    } finally {
        process.env.ADMIN_IDS = previousAdminIds;
    }
});

test('messageHandler admin invite reports WhatsApp send failures without throwing', async () => {
    const { handleAdminCommandBeforeAccess } = messageHandler.__test__;
    const previousAdminIds = process.env.ADMIN_IDS;
    const replies = [];

    try {
        process.env.ADMIN_IDS = '5521970112407@c.us';
        const handled = await handleAdminCommandBeforeAccess(
            {
                body: 'admin convidar 5521985969034',
                reply: async (text) => replies.push(text),
                client: {
                    sendMessage: async () => {
                        throw new Error('No LID for user');
                    }
                }
            },
            '151058345148646@lid',
            { allowed: false, user: { display_name: 'Daniel', status: userService.USER_STATUS.PENDING_APPROVAL } }
        );

        assert.strictEqual(handled, true);
        assert.match(replies[0], /Não consegui enviar o convite/i);
        assert.match(replies[0], /5521985969034@c\.us/);
    } finally {
        process.env.ADMIN_IDS = previousAdminIds;
    }
});

test('qaFailureLogService records sanitized reviewable failures as jsonl', async () => {
    const previousPath = process.env.QA_FAILURE_LOG_PATH;
    const previousEnabled = process.env.QA_FAILURE_LOG_ENABLED;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-qa-'));
    const logPath = path.join(tempDir, 'qa-failures.jsonl');

    try {
        process.env.QA_FAILURE_LOG_PATH = logPath;
        process.env.QA_FAILURE_LOG_ENABLED = 'true';

        const entry = await qaFailureLogService.recordQaFailure({
            kind: 'unknown_intent',
            reason: 'routing_unknown_intent',
            userId: 'user-real-id',
            whatsappId: '5521999999999@c.us',
            message: 'Meu email daniel@example.com e telefone 5521999999999 deram erro no link https://site.test/callback?code=abc&state=xyz',
            intent: 'desconhecido',
            parameters: { raw: 'token=super-secret' }
        });

        const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
        const saved = JSON.parse(lines[0]);

        assert.strictEqual(lines.length, 1);
        assert.strictEqual(saved.kind, 'unknown_intent');
        assert.strictEqual(saved.status, 'open');
        assert.ok(saved.user_ref);
        assert.ok(saved.whatsapp_ref);
        assert.notStrictEqual(saved.user_ref, 'user-real-id');
        assert.match(saved.message, /\[email\]/);
        assert.match(saved.message, /\[telefone\]/);
        assert.match(saved.message, /https:\/\/site\.test\/callback/);
        assert.doesNotMatch(saved.message, /abc|xyz|daniel@example\.com|5521999999999/);
        assert.strictEqual(entry.kind, saved.kind);
    } finally {
        if (previousPath === undefined) delete process.env.QA_FAILURE_LOG_PATH;
        else process.env.QA_FAILURE_LOG_PATH = previousPath;
        if (previousEnabled === undefined) delete process.env.QA_FAILURE_LOG_ENABLED;
        else process.env.QA_FAILURE_LOG_ENABLED = previousEnabled;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
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

test('messageHandler.classifyPerguntaLocally covers complex analytical questions', () => {
    const { classifyPerguntaLocally, inferAnalyticalQueryPlan } = messageHandler.__test__;

    const count = classifyPerguntaLocally('quantas vezes usei onibis em fevereiro?');
    assert.strictEqual(count.intent, 'contagem_ocorrencias');
    assert.strictEqual(count.parameters.categoria, 'onibis');

    const duplicates = classifyPerguntaLocally('tem valores duplicados em fevereiro?');
    assert.strictEqual(duplicates.intent, 'gastos_valores_duplicados');

    const minMax = classifyPerguntaLocally('qual foi o maior e menor gasto em fevereiro?');
    assert.strictEqual(minMax.intent, 'maior_menor_gasto');

    const leftover = classifyPerguntaLocally('quanto sobrou em maio de 2026?');
    assert.strictEqual(leftover.intent, 'saldo_do_mes');

    const dailyAverage = classifyPerguntaLocally('quanto eu gastei por dia em média em maio de 2026?');
    assert.strictEqual(dailyAverage.intent, 'media_diaria_gastos_mes');

    const dailyAverageVariant = inferAnalyticalQueryPlan('em média diária, quanto foram meus gastos em maio de 2026?');
    assert.strictEqual(dailyAverageVariant.metric, 'daily_average');
    assert.strictEqual(dailyAverageVariant.intent, 'media_diaria_gastos_mes');

    const combined = classifyPerguntaLocally('quanto gastei somando mercado e transporte em maio de 2026?');
    assert.strictEqual(combined.intent, 'total_gastos_multiplas_categorias');
    assert.deepStrictEqual(combined.parameters.categorias, ['mercado', 'transporte']);

    const combinedVariant = inferAnalyticalQueryPlan('qual foi a soma de alimentação, transporte e saúde em fevereiro?');
    assert.strictEqual(combinedVariant.metric, 'sum_by_categories');
    assert.deepStrictEqual(combinedVariant.parameters.categorias, ['alimentacao', 'transporte', 'saude']);

    const percentage = classifyPerguntaLocally('o mercado representou quantos por cento dos meus gastos de maio de 2026?');
    assert.strictEqual(percentage.intent, 'percentual_categoria_gastos');
    assert.strictEqual(percentage.parameters.categoria, 'mercado');

    const percentageVariant = inferAnalyticalQueryPlan('qual foi a participação de mercado no total de gastos em maio de 2026?');
    assert.strictEqual(percentageVariant.metric, 'percentage_of_expenses');
    assert.strictEqual(percentageVariant.parameters.categoria, 'mercado');

    const categoryExtremes = inferAnalyticalQueryPlan('qual foi minha maior compra de mercado em maio de 2026?');
    assert.strictEqual(categoryExtremes.intent, 'maior_menor_gasto_categoria');
    assert.strictEqual(categoryExtremes.parameters.categoria, 'mercado');

    const comparison = inferAnalyticalQueryPlan('mercado foi maior que transporte em maio de 2026?');
    assert.strictEqual(comparison.intent, 'comparacao_gastos_categorias');
    assert.deepStrictEqual(comparison.parameters.categorias, ['mercado', 'transporte']);

    const invoice = classifyPerguntaLocally('quanto está a fatura do nubank em maio de 2026?');
    assert.strictEqual(invoice.intent, 'total_fatura_cartao');
    assert.strictEqual(invoice.parameters.cartao, 'nubank');
    assert.strictEqual(invoice.parameters.mes, 4);

    const namedInvoice = classifyPerguntaLocally('qual a fatura do nubank thais em maio de 2026?');
    assert.strictEqual(namedInvoice.intent, 'total_fatura_cartao');
    assert.strictEqual(namedInvoice.parameters.cartao, 'nubank thais');
    assert.strictEqual(namedInvoice.parameters.mes, 4);

    const openCards = classifyPerguntaLocally('quanto ainda tenho em aberto nos cartões a partir de maio de 2026?');
    assert.strictEqual(openCards.intent, 'total_cartoes_em_aberto');
    assert.strictEqual(openCards.parameters.mes, 4);

    const namedOpenCards = classifyPerguntaLocally('quanto tem em aberto no nubank thais a partir de janeiro de 2026?');
    assert.strictEqual(namedOpenCards.intent, 'total_cartoes_em_aberto');
    assert.strictEqual(namedOpenCards.parameters.cartao, 'nubank thais');
    assert.strictEqual(namedOpenCards.parameters.mes, 0);

    const installments = classifyPerguntaLocally('quais parcelamentos tenho ativos no cartão?');
    assert.strictEqual(installments.intent, 'resumo_parcelamentos_cartao');

    const namedInstallments = classifyPerguntaLocally('quais parcelamentos ativos no nubank thais a partir de janeiro de 2026?');
    assert.strictEqual(namedInstallments.intent, 'resumo_parcelamentos_cartao');
    assert.strictEqual(namedInstallments.parameters.cartao, 'nubank thais');
    assert.strictEqual(namedInstallments.parameters.mes, 0);
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

test('messageHandler pre-onboarding invite helpers build safe admin invitation', () => {
    const { buildPreOnboardingInviteMessage, normalizeInvitePhoneToWhatsAppId } = messageHandler.__test__;

    assert.strictEqual(normalizeInvitePhoneToWhatsAppId('+55 (21) 98596-9034'), '5521985969034@c.us');
    assert.strictEqual(normalizeInvitePhoneToWhatsAppId('123'), '');

    const message = buildPreOnboardingInviteMessage();
    assert.match(message, /FinançasBot/);
    assert.match(message, /Salve este número/);
    assert.match(message, /responda aqui com `oi`/);
});

test('messageHandler builds personal credit card options without user_id column', () => {
    const { buildPersonalCreditCardOptionsFromRows } = messageHandler.__test__;

    const options = buildPersonalCreditCardOptionsFromRows([
        ['card_id', 'Nome', 'Banco', 'Dia de Fechamento', 'Dia de Vencimento', 'Ativo', 'Observações'],
        ['nubank-principal', 'Nubank Principal', 'Nubank', '8', '15', 'SIM', ''],
        ['itau-familia', 'Itaú Família', 'Itaú', '29', '5', 'SIM', 'Cartão compartilhado'],
        ['cartao-inativo', 'Cartão Inativo', 'Banco', '10', '20', 'NÃO', '']
    ]);

    assert.deepStrictEqual(options.map(option => option.key), ['nubank-principal', 'itau-familia']);
    assert.deepStrictEqual(options.map(option => option.label), ['Nubank Principal', 'Itaú Família']);
    assert.strictEqual(options[0].cardInfo.closingDay, 8);
    assert.strictEqual(options[1].cardInfo.closingDay, 29);
});

test('messageHandler local replies cover richer spreadsheet calculations', () => {
    const { buildLocalPerguntaResponse } = messageHandler.__test__;

    assert.match(
        buildLocalPerguntaResponse({
            intent: 'media_diaria_gastos_mes',
            analyzedData: { results: 2.079, details: { mes: 4, ano: 2026, diasConsiderados: 17, totalGastos: 35.35 } }
        }),
        /Média diária.*R\$ 2,08.*17 dia/
    );

    assert.match(
        buildLocalPerguntaResponse({
            intent: 'total_gastos_multiplas_categorias',
            analyzedData: { results: 135.7, details: { categorias: ['mercado', 'transporte'], mes: 4, ano: 2026 } }
        }),
        /mercado \+ transporte.*R\$ 135,70/
    );

    assert.match(
        buildLocalPerguntaResponse({
            intent: 'percentual_categoria_gastos',
            analyzedData: { results: 66.99, details: { categoria: 'mercado', mes: 4, ano: 2026, totalCategoria: 90.9, totalGastos: 135.7 } }
        }),
        /mercado representou 66,99%/
    );

    assert.match(
        buildLocalPerguntaResponse({
            intent: 'comparacao_gastos_categorias',
            analyzedData: {
                results: { categorias: [{ categoria: 'mercado', total: 90.9 }, { categoria: 'transporte', total: 44.8 }] },
                details: { mes: 4, ano: 2026 }
            }
        }),
        /mercado foi maior que transporte.*R\$ 90,90.*R\$ 44,80/s
    );

    assert.match(
        buildLocalPerguntaResponse({
            intent: 'maior_menor_gasto_categoria',
            analyzedData: {
                results: {
                    min: ['17/05/2026', 'mercado do daniel', 'Alimentação', 'SUPERMERCADO', 44.44],
                    max: ['17/05/2026', 'mercado', 'Alimentação', 'SUPERMERCADO', 46.46]
                },
                details: { categoria: 'mercado', mes: 4, ano: 2026 }
            }
        }),
        /Maior e menor gasto com mercado.*mercado.*R\$ 46,46/s
    );

    assert.match(
        buildLocalPerguntaResponse({
            intent: 'total_fatura_cartao',
            analyzedData: {
                results: 345.67,
                details: { cartao: 'nubank', mes: 4, ano: 2026, parcelas: 3 }
            }
        }),
        /Fatura.*nubank.*maio\/2026.*R\$ 345,67.*3 parcela/s
    );

    assert.match(
        buildLocalPerguntaResponse({
            intent: 'total_cartoes_em_aberto',
            analyzedData: {
                results: 800,
                details: { cartao: '', mes: 4, ano: 2026, parcelas: 8, meses: 4 }
            }
        }),
        /Em aberto.*cartões.*R\$ 800,00.*8 parcela/s
    );

    assert.match(
        buildLocalPerguntaResponse({
            intent: 'resumo_parcelamentos_cartao',
            analyzedData: {
                results: [
                    { descricao: 'notebook', cartao: 'Nubank', categoria: 'Eletrônicos', parcelasLancadas: 3, totalPrevisto: 3000, primeiraParcela: '10/05/2026', ultimaParcela: '10/07/2026' }
                ],
                details: { cartao: '', mes: 4, ano: 2026 }
            }
        }),
        /Parcelamentos.*notebook.*Nubank.*R\$ 3000,00/s
    );
});

test('creationHandler debt success message explains dashboard and spending distinction', () => {
    const { buildDebtSuccessMessage } = creationHandler.__test__;
    const message = buildDebtSuccessMessage('ap');

    assert.match(message, /Dívida "ap" registrada com sucesso/);
    assert.match(message, /dashboard/i);
    assert.match(message, /não entra como gasto/i);
    assert.match(message, /registrar pagamento/i);
});

test('calculationOrchestrator calculates card invoices and open installments deterministically', async () => {
    const dataSources = {
        saidas: [['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Responsável', 'Pagamento', 'Recorrente', 'Obs', 'user_id']],
        entradas: [['Data', 'Descrição', 'Categoria', 'Valor', 'Responsável', 'Recebimento', 'Recorrente', 'Obs', 'user_id']],
        cartoes: [[
            ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'card_id', 'Cartão', 'Observações', 'user_id'],
            ['10/05/2026', 'notebook', 'Eletrônicos', 1000, '1/3', 'Maio de 2026', 'nubank-daniel', 'Nubank Daniel', '', 'user-1'],
            ['10/05/2026', 'notebook', 'Eletrônicos', 1000, '2/3', 'Junho de 2026', 'nubank-daniel', 'Nubank Daniel', '', 'user-1'],
            ['10/05/2026', 'notebook', 'Eletrônicos', 1000, '3/3', 'Julho de 2026', 'nubank-daniel', 'Nubank Daniel', '', 'user-1'],
            ['12/05/2026', 'mercado', 'Alimentação', 200, '1/1', 'Maio de 2026', 'itau', 'Itaú', '', 'user-1'],
            ['15/01/2026', 'farmácia', 'Saúde', 80, '1/1', 'Janeiro de 2026', 'nubank-thais', 'Cartão Nubank - Thais', '', 'user-2']
        ]]
    };

    const invoice = await calculationOrchestrator.execute('total_fatura_cartao', { cartao: 'nubank', mes: 4, ano: 2026 }, dataSources);
    assert.strictEqual(invoice.results, 1000);
    assert.strictEqual(invoice.details.parcelas, 1);

    const open = await calculationOrchestrator.execute('total_cartoes_em_aberto', { mes: 4, ano: 2026 }, dataSources);
    assert.strictEqual(open.results, 3200);
    assert.strictEqual(open.details.parcelas, 4);
    assert.strictEqual(open.details.meses, 3);

    const installments = await calculationOrchestrator.execute('resumo_parcelamentos_cartao', { cartao: 'nubank', mes: 4, ano: 2026 }, dataSources);
    assert.strictEqual(installments.results.length, 1);
    assert.strictEqual(installments.results[0].descricao, 'notebook');
    assert.strictEqual(installments.results[0].totalPrevisto, 3000);
    assert.strictEqual(installments.results[0].parcelasLancadas, 3);

    const thaisInvoice = await calculationOrchestrator.execute('total_fatura_cartao', { cartao: 'nubank thais', mes: 0, ano: 2026 }, dataSources);
    assert.strictEqual(thaisInvoice.results, 80);
    assert.strictEqual(thaisInvoice.details.parcelas, 1);
});

test('messageHandler.normalizeMetricLabel keeps metric names bounded and safe', (t) => {
    const { normalizeMetricLabel } = messageHandler.__test__;

    assert.strictEqual(normalizeMetricLabel('SQLite'), 'sqlite');
    assert.strictEqual(normalizeMetricLabel('sheets fallback!'), 'sheets_fallback');
    assert.ok(normalizeMetricLabel('x'.repeat(100)).length <= 60);
});

test('messageHandler settings commands tolerate WhatsApp formatting variants', () => {
    const {
        normalizeSettingsCommandText,
        isCheckinSettingsCommand,
        isReserveDisableCommand,
        extractFullNameSettingsCommand
    } = messageHandler.__test__;

    assert.strictEqual(normalizeSettingsCommandText('`ativar check-in semanal`'), 'ativar check in semanal');
    assert.strictEqual(isCheckinSettingsCommand(normalizeSettingsCommandText('ativar checkin semanal'), 'ativar'), true);
    assert.strictEqual(isCheckinSettingsCommand(normalizeSettingsCommandText('ativar check-in semanal'), 'ativar'), true);
    assert.strictEqual(isCheckinSettingsCommand(normalizeSettingsCommandText('ativar check in'), 'ativar'), true);
    assert.strictEqual(isCheckinSettingsCommand(normalizeSettingsCommandText('desativar o check-in semanal'), 'desativar'), true);
    assert.strictEqual(isReserveDisableCommand(normalizeSettingsCommandText('desativar reserva')), true);
    assert.strictEqual(isReserveDisableCommand(normalizeSettingsCommandText('desativar a reserva automática')), true);
    assert.strictEqual(
        extractFullNameSettingsCommand('definir nome completo Daniel dos Santos da Silva'),
        'Daniel dos Santos da Silva'
    );
    assert.strictEqual(
        extractFullNameSettingsCommand('meu nome completo é Maria Oliveira'),
        'Maria Oliveira'
    );
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
    assert.strictEqual(looksLikeBotCommand('liste meus gastos com mercado em maio'), true);
    assert.strictEqual(looksLikeBotCommand('qual meu saldo do mês'), true);
    assert.strictEqual(looksLikeBotCommand('dashboard'), true);
    assert.strictEqual(looksLikeBotCommand('Daniel'), false);
});

test('messageHandler formats personal sheet list rows with serial dates and BR values', (t) => {
    const { buildLocalPerguntaResponse } = messageHandler.__test__;

    const reply = buildLocalPerguntaResponse({
        userQuestion: 'liste meus gastos com mercado em maio de 2026',
        intent: 'listagem_gastos_categoria',
        analyzedData: {
            results: [['46159', 'mercado', 'Alimentação', 'SUPERMERCADO', '35,35']],
            details: { categoria: 'mercado', mes: 4, ano: 2026 }
        }
    });

    assert.match(reply, /17\/05\/2026 \| mercado \| R\$ 35,35/);
    assert.doesNotMatch(reply, /46159/);
    assert.doesNotMatch(reply, /NaN/);
});

test('messageHandler clears cached analytical replies after financial writes', (t) => {
    const cache = require('../src/utils/cache');
    const { markFinancialReadModelDirty } = messageHandler.__test__;

    cache.set('user-1:liste meus gastos com mercado', 'resposta antiga');
    markFinancialReadModelDirty('unit_test_write');

    assert.strictEqual(cache.get('user-1:liste meus gastos com mercado'), undefined);
});

test('messageHandler.filterSheetRowsByUserId keeps header and isolates user rows', (t) => {
    const {
        filterSheetRowsByUserId,
        filterSheetRowsByUserIds,
        resolveQuestionUserScope,
        resolveQuestionUserScopeMatch,
        normalizeIntentForQuestionUserScope
    } = messageHandler.__test__;
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
    assert.deepStrictEqual(filterSheetRowsByUserIds(rows, 3, ['user-a', 'user-b']), rows);
    assert.deepStrictEqual(
        resolveQuestionUserScope('quanto o Daniel gastou em fevereiro?', [
            { user_id: 'user-a', display_name: 'Daniel' },
            { user_id: 'user-b', display_name: 'Oficial' }
        ], ['user-a', 'user-b']),
        ['user-a']
    );
    assert.deepStrictEqual(
        resolveQuestionUserScope('quanto o Oficial gastou em fevereiro?', [
            { user_id: 'user-a', display_name: 'Daniel' },
            { user_id: 'user-b', display_name: 'Oficial' }
        ], ['user-a', 'user-b']),
        ['user-b']
    );
    assert.deepStrictEqual(
        resolveQuestionUserScope('quanto gastamos em fevereiro?', [
            { user_id: 'user-a', display_name: 'Daniel' },
            { user_id: 'user-b', display_name: 'Oficial' }
        ], ['user-a', 'user-b']),
        ['user-a', 'user-b']
    );

    const matchedUserScope = resolveQuestionUserScopeMatch('quanto o Oficial gastou em fevereiro?', [
        { user_id: 'user-a', display_name: 'Daniel' },
        { user_id: 'user-b', display_name: 'Oficial' }
    ], ['user-a', 'user-b']);
    assert.deepStrictEqual(matchedUserScope.userIds, ['user-b']);
    assert.deepStrictEqual(
        normalizeIntentForQuestionUserScope({
            intent: 'total_gastos_categoria_mes',
            parameters: { categoria: 'Oficial', mes: 'fevereiro', ano: 2026 }
        }, matchedUserScope),
        {
            intent: 'total_gastos_mes',
            parameters: { mes: 'fevereiro', ano: 2026 }
        }
    );
    assert.deepStrictEqual(
        normalizeIntentForQuestionUserScope({
            intent: 'total_gastos_categoria_mes',
            parameters: { categoria: 'mercado', mes: 'fevereiro', ano: 2026 }
        }, matchedUserScope),
        {
            intent: 'total_gastos_categoria_mes',
            parameters: { categoria: 'mercado', mes: 'fevereiro', ano: 2026 }
        }
    );
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

test('google.filterCalendarEventsForTarget keeps user-owned calendar events even without bot marker', (t) => {
    const { filterCalendarEventsForTarget } = googleService.__test__;
    const events = [
        { id: 'normal-calendar-event', summary: 'Reunião real da agenda' },
        {
            id: 'bot-event',
            extendedProperties: { private: { financas_bot_user_id: 'user-a' } }
        },
        {
            id: 'other-bot-event',
            extendedProperties: { private: { financas_bot_user_id: 'user-b' } }
        }
    ];

    assert.deepStrictEqual(
        filterCalendarEventsForTarget(events, { userScoped: true }, 'user-a').map(event => event.id),
        ['normal-calendar-event', 'bot-event', 'other-bot-event']
    );
    assert.deepStrictEqual(
        filterCalendarEventsForTarget(events, { userScoped: false }, 'user-a').map(event => event.id),
        ['bot-event']
    );
});

test('google.buildCalendarDayRange uses Sao Paulo calendar-day bounds', (t) => {
    const { buildCalendarDayRange } = googleService.__test__;
    assert.deepStrictEqual(buildCalendarDayRange(new Date(Date.UTC(2026, 4, 20, 12, 0, 0))), {
        timeMin: '2026-05-20T00:00:00-03:00',
        timeMax: '2026-05-20T23:59:59-03:00',
        timeZone: 'America/Sao_Paulo'
    });
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

test('google share helpers create and revoke Drive permissions by email', async () => {
    const created = [];
    const deleted = [];
    const fakeDriveClient = {
        permissions: {
            create: async (request) => {
                created.push(request);
                return { data: { id: 'permission-1' } };
            },
            delete: async (request) => {
                deleted.push(request);
                return {};
            }
        }
    };

    const share = await googleService.shareSpreadsheetWithUserEmail({
        ownerUserId: 'owner-user',
        spreadsheetId: 'spreadsheet-1',
        email: 'Member.User@Example.com',
        driveClient: fakeDriveClient
    });

    assert.deepStrictEqual(share, {
        email: 'member.user@example.com',
        permissionId: 'permission-1'
    });
    assert.strictEqual(created[0].fileId, 'spreadsheet-1');
    assert.strictEqual(created[0].requestBody.emailAddress, 'member.user@example.com');
    assert.strictEqual(created[0].requestBody.role, 'writer');

    const revoked = await googleService.revokeSpreadsheetPermission({
        ownerUserId: 'owner-user',
        spreadsheetId: 'spreadsheet-1',
        permissionId: 'permission-1',
        driveClient: fakeDriveClient
    });

    assert.strictEqual(revoked, true);
    assert.deepStrictEqual(deleted[0], {
        fileId: 'spreadsheet-1',
        permissionId: 'permission-1',
        supportsAllDrives: true
    });
});

test('google retry helpers classify Sheets quota and transient errors', () => {
    const { isGoogleRetriableError } = googleService.__test__;

    assert.strictEqual(isGoogleRetriableError({ code: 429, message: 'Quota exceeded for write requests' }), true);
    assert.strictEqual(isGoogleRetriableError({ code: 503, message: 'backend unavailable' }), true);
    assert.strictEqual(isGoogleRetriableError({ code: 400, message: 'invalid range' }), false);
});

test('google.isMissingUserSheetError detects missing user spreadsheet tabs', () => {
    const { isMissingUserSheetError } = googleService.__test__;

    assert.strictEqual(isMissingUserSheetError({ message: 'Unable to parse range: Transferências!A:I' }), true);
    assert.strictEqual(isMissingUserSheetError({ response: { data: { error: { message: 'Range not found: Transferências' } } } }), true);
    assert.strictEqual(isMissingUserSheetError({ code: 400, message: 'invalid request' }), false);
});
