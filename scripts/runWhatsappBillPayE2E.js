require('dotenv').config();

const { loadWhatsAppE2EConfig } = require('../src/testing/whatsappE2EConfig');
const { shouldRouteFinancialCommandPlanner } = require('../src/planning/financialCommandPlannerShadow');

const DEFAULT_SEED_SETTLE_MS = 25000;
const MAX_SEED_SETTLE_MS = 120000;
const ALLOWED_ACTIONS = new Set(['all', 'conversation', 'seed', 'verify-cleanup', 'cleanup']);

function sanitizeMarker(value) {
    const marker = String(value || '')
        .trim()
        .replace(/[^A-Za-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 80);
    if (!/^TESTE_APAGAR_[A-Za-z0-9_]+$/.test(marker)) {
        throw new Error('Bill pay E2E marker deve começar com TESTE_APAGAR_ e conter apenas letras, números e underscore.');
    }
    return marker;
}

function defaultRunId(date = new Date()) {
    return `TESTE_APAGAR_BILLPAY_${date.toISOString().replace(/\D/g, '').slice(0, 14)}`;
}

function resolveBillPayFixtureMode(env = process.env) {
    const mode = String(env.BILL_PAY_E2E_FIXTURE_MODE || 'local').trim().toLowerCase();
    if (!['local', 'external'].includes(mode)) {
        throw new Error('BILL_PAY_E2E_FIXTURE_MODE deve ser local ou external.');
    }
    return mode;
}

function resolveBillPayAction(env = process.env) {
    const action = String(env.BILL_PAY_E2E_ACTION || 'all').trim().toLowerCase();
    if (!ALLOWED_ACTIONS.has(action)) {
        throw new Error('BILL_PAY_E2E_ACTION deve ser all, conversation, seed, verify-cleanup ou cleanup.');
    }
    return action;
}

function resolveBillPaySeedSettleMs(env = process.env) {
    const raw = env.BILL_PAY_E2E_SEED_SETTLE_MS;
    if (raw === undefined || raw === null || raw === '') return DEFAULT_SEED_SETTLE_MS;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0 || value > MAX_SEED_SETTLE_MS) {
        throw new Error(`BILL_PAY_E2E_SEED_SETTLE_MS deve ser um inteiro positivo de ate ${MAX_SEED_SETTLE_MS}ms.`);
    }
    return value;
}

function normalizeAmountText(value = '12,34') {
    const text = String(value || '').trim().replace('.', ',');
    if (!/^\d{1,6},\d{2}$/.test(text)) {
        throw new Error('BILL_PAY_E2E_AMOUNT deve estar no formato 12,34.');
    }
    return text;
}

function requireBillPayRouteMode(env = process.env, userId = '') {
    if (!shouldRouteFinancialCommandPlanner({ env, userId })) {
        throw new Error('Bill pay E2E exige FINANCIAL_COMMAND_PLANNER_MODE=route ou canary autorizado para o usuario de teste.');
    }
}

function buildBillPayE2EPlan(options = {}) {
    const marker = sanitizeMarker(options.runId || process.env.BILL_PAY_E2E_RUN_ID || defaultRunId());
    const amount = normalizeAmountText(options.amount || process.env.BILL_PAY_E2E_AMOUNT || '12,34');
    const dueDay = String(options.dueDay || process.env.BILL_PAY_E2E_DUE_DAY || '25').trim();
    const userId = String(options.userId || '').trim();
    if (!/^([1-9]|[12]\d|3[01])$/.test(dueDay)) {
        throw new Error('BILL_PAY_E2E_DUE_DAY deve ser um dia entre 1 e 31.');
    }
    const billLabel = `Conta telefone ${marker}`;
    return {
        marker,
        billLabel,
        accountRow: [
            marker,
            dueDay,
            'Criado por E2E marker-only de bill.pay',
            userId,
            billLabel,
            'Moradia',
            'INTERNET / TELEFONE',
            amount,
            'SIM'
        ],
        messages: {
            initial: `Paguei ${amount} da ${billLabel}`,
            paymentMethod: 'Pix',
            confirm: 'sim'
        },
        expected: {
            initial: ['conta recorrente', 'forma de pagamento'],
            confirmation: ['Confirma', billLabel],
            saved: ['Pagamento da conta recorrente', 'registrado']
        }
    };
}

function rowContainsMarker(row = [], marker = '') {
    const escapedMarker = String(marker || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!escapedMarker) return false;
    const exactMarker = new RegExp(`(^|[^A-Za-z0-9_])${escapedMarker}(?=$|[^A-Za-z0-9_])`);
    return row.some(cell => exactMarker.test(String(cell || '')));
}

function testUserWhatsAppId(config = {}) {
    const digits = String(config.testUserPhone || '').replace(/\D/g, '');
    return digits ? `${digits}@c.us` : '';
}

function normalizeLookupText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function resolveUserByExplicitLookup(users = [], lookup = '') {
    const normalizedLookup = normalizeLookupText(lookup);
    const lookupDigits = String(lookup || '').replace(/\D/g, '');
    if (!normalizedLookup && !lookupDigits) return null;

    const matches = users.filter(user => {
        const displayNameMatches = normalizedLookup && normalizeLookupText(user.display_name) === normalizedLookup;
        const phoneMatches = lookupDigits && String(user.phone_e164 || '').replace(/\D/g, '') === lookupDigits;
        const whatsappMatches = lookupDigits && String(user.whatsapp_id || '').replace(/\D/g, '') === lookupDigits;
        return displayNameMatches || phoneMatches || whatsappMatches;
    });
    const activeMatches = matches.filter(user => user.status === 'ACTIVE');
    if (activeMatches.length === 1) return activeMatches[0];
    if (activeMatches.length > 1) {
        throw new Error('WHATSAPP_E2E_TEST_USER_LOOKUP encontrou mais de um usuario ativo. Use um lookup mais especifico.');
    }
    if (matches.length > 0) {
        throw new Error('WHATSAPP_E2E_TEST_USER_LOOKUP encontrou usuario, mas ele nao esta ACTIVE.');
    }
    return null;
}

function resolveBillPayFixtureUserFromRows(users = [], lookup = '') {
    if (!String(lookup || '').trim()) {
        throw new Error('Fixture remota exige lookup explicito em BILL_PAY_E2E_USER_LOOKUP.');
    }
    const user = resolveUserByExplicitLookup(users, lookup);
    if (!user?.user_id) {
        throw new Error('BILL_PAY_E2E_USER_LOOKUP deve identificar um unico usuario ACTIVE.');
    }
    return user;
}

async function resolveBillPayFixtureUserId(env = process.env) {
    const { getAllUsers } = getUserService();
    const users = await getAllUsers();
    return resolveBillPayFixtureUserFromRows(users, env.BILL_PAY_E2E_USER_LOOKUP).user_id;
}

function getGoogleService() {
    return require('../src/services/google');
}

function getUserService() {
    return require('../src/services/userService');
}

function getWhatsAppRuntime() {
    return {
        launchWhatsAppWebDriver: require('../src/testing/whatsappWebDriver').launchWhatsAppWebDriver,
        sendAndWaitForAllReply: require('../src/testing/e2eAssertions').sendAndWaitForAllReply
    };
}

async function resolveE2EUserId(config = {}, options = {}) {
    const whatsappId = testUserWhatsAppId(config);
    if (!whatsappId) {
        throw new Error('WHATSAPP_E2E_TEST_USER_PHONE invalido para resolver user_id.');
    }

    const { getAllUsers, getUserByWhatsAppId } = getUserService();
    const direct = await getUserByWhatsAppId(whatsappId);
    if (direct?.user_id) return direct.user_id;

    const testDigits = String(config.testUserPhone || '').replace(/\D/g, '');
    const users = await getAllUsers();
    const byPhone = users.find(user => String(user.phone_e164 || user.whatsapp_id || '').replace(/\D/g, '') === testDigits);
    if (byPhone?.user_id) return byPhone.user_id;

    const env = options.env || process.env;
    const explicitLookup = String(env.WHATSAPP_E2E_TEST_USER_LOOKUP || '').trim();
    if (explicitLookup) {
        const byLookup = resolveUserByExplicitLookup(users, explicitLookup);
        if (byLookup?.user_id) return byLookup.user_id;
    }

    throw new Error(`Usuario E2E nao encontrado para ${whatsappId}. Cadastre/aprove/conecte o usuario de teste antes de rodar bill.pay E2E.`);
}

async function cleanupMarkerRows(marker, options = {}) {
    const { deleteRowsByIndices, readDataFromSheet } = getGoogleService();
    const readOptions = options.userId ? { userId: options.userId } : {};
    for (const sheetName of ['Saídas', 'Contas']) {
        const rows = await readDataFromSheet(`${sheetName}!A:Z`, readOptions);
        const indices = [];
        rows.forEach((row, index) => {
            if (index > 0 && rowContainsMarker(row, marker)) {
                indices.push(index);
            }
        });
        if (indices.length > 0) {
            await deleteRowsByIndices(sheetName, indices, {
                ...readOptions,
                source: 'whatsapp_bill_pay_e2e_cleanup'
            });
        }
    }
}

async function seedRecurringBill(plan, options = {}) {
    const { appendRowToSheet } = getGoogleService();
    const writeOptions = options.userId ? { userId: options.userId } : {};
    await cleanupMarkerRows(plan.marker, writeOptions);
    await appendRowToSheet('Contas', plan.accountRow, {
        ...writeOptions,
        source: 'whatsapp_bill_pay_e2e_seed'
    });
}

async function readBillPayMarkerRows(plan, options = {}) {
    const { readDataFromSheet } = getGoogleService();
    const readOptions = options.userId ? { userId: options.userId } : {};
    const result = {};
    for (const sheetName of ['Contas', 'Saídas']) {
        const rows = await readDataFromSheet(`${sheetName}!A:Z`, readOptions);
        result[sheetName] = rows.filter((row, index) => index > 0 && rowContainsMarker(row, plan.marker));
    }
    return result;
}

async function assertBillPayMarkerRemoved(plan, options = {}) {
    const rows = await readBillPayMarkerRows(plan, options);
    if (rows.Contas.length || rows['Saídas'].length) {
        throw new Error(`Cleanup incompleto de bill.pay: contas=${rows.Contas.length} saidas=${rows['Saídas'].length}.`);
    }
}

async function verifyBillPayResult(plan, options = {}) {
    const rows = await readBillPayMarkerRows(plan, options);
    if (rows.Contas.length !== 1 || rows['Saídas'].length !== 1) {
        throw new Error(`Resultado bill.pay divergente: contas=${rows.Contas.length} saidas=${rows['Saídas'].length}.`);
    }
    if (String(rows['Saídas'][0][7] || '').trim().toLowerCase() !== 'sim') {
        throw new Error('Pagamento de conta recorrente nao foi marcado como Recorrente=SIM.');
    }
}

async function runBillPayFixtureAction(action, plan, options = {}) {
    if (action === 'seed') {
        await seedRecurringBill(plan, options);
        console.log('[bill-pay-e2e] fixture remota criada com marcador sanitizado');
        return;
    }
    if (action === 'cleanup') {
        await cleanupMarkerRows(plan.marker, options);
        await assertBillPayMarkerRemoved(plan, options);
        console.log('[bill-pay-e2e] cleanup remoto confirmado com zero linhas');
        return;
    }
    if (action === 'verify-cleanup') {
        let verificationError = null;
        try {
            await verifyBillPayResult(plan, options);
        } catch (error) {
            verificationError = error;
        } finally {
            await cleanupMarkerRows(plan.marker, options);
            await assertBillPayMarkerRemoved(plan, options);
        }
        if (verificationError) throw verificationError;
        console.log('[bill-pay-e2e] verificacao remota passou e cleanup ficou em zero');
        return;
    }
    throw new Error(`Acao de fixture bill.pay nao suportada: ${action}.`);
}

async function runBillPayConversation(driver, plan) {
    const { sendAndWaitForAllReply } = getWhatsAppRuntime();
    await sendAndWaitForAllReply(driver, plan.messages.initial, plan.expected.initial);
    await sendAndWaitForAllReply(driver, plan.messages.paymentMethod, plan.expected.confirmation);
    await sendAndWaitForAllReply(driver, plan.messages.confirm, plan.expected.saved);
}

async function main() {
    const action = resolveBillPayAction(process.env);
    if (['seed', 'verify-cleanup', 'cleanup'].includes(action)) {
        const userId = await resolveBillPayFixtureUserId(process.env);
        const plan = buildBillPayE2EPlan({ userId });
        await runBillPayFixtureAction(action, plan, { userId });
        return;
    }
    const config = loadWhatsAppE2EConfig(process.env);
    const userId = await resolveE2EUserId(config);
    requireBillPayRouteMode(process.env, userId);
    const plan = buildBillPayE2EPlan({ userId });
    const fixtureMode = resolveBillPayFixtureMode(process.env);
    const { launchWhatsAppWebDriver } = getWhatsAppRuntime();
    const driver = await launchWhatsAppWebDriver(config);

    try {
        if (fixtureMode === 'local') {
            await seedRecurringBill(plan, { userId });
            const seedSettleMs = resolveBillPaySeedSettleMs(process.env);
            console.log(`[bill-pay-e2e] aguardando propagacao do seed por ${seedSettleMs}ms`);
            await new Promise(resolve => setTimeout(resolve, seedSettleMs));
        } else {
            console.log('[bill-pay-e2e] fixture externo: seed e cleanup gerenciados pelo ambiente alvo');
        }
        await driver.gotoHome();
        await driver.assertLoggedIn();
        await driver.openChat(config.botPhone);
        await runBillPayConversation(driver, plan);
    } finally {
        await driver.close().catch(() => {});
        if (fixtureMode === 'local') {
            await cleanupMarkerRows(plan.marker, { userId }).catch(error => {
                console.error(`[bill-pay-e2e] cleanup_failed marker=${plan.marker} error=${error.message}`);
            });
        }
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error(`WhatsApp bill.pay E2E falhou: ${error.message}`);
        process.exit(1);
    });
}

module.exports = {
    buildBillPayE2EPlan,
    assertBillPayMarkerRemoved,
    cleanupMarkerRows,
    readBillPayMarkerRows,
    requireBillPayRouteMode,
    resolveBillPayAction,
    resolveBillPayFixtureUserFromRows,
    resolveBillPayFixtureMode,
    resolveBillPaySeedSettleMs,
    resolveE2EUserId,
    rowContainsMarker,
    sanitizeMarker,
    seedRecurringBill,
    testUserWhatsAppId
};
