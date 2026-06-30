require('dotenv').config();

const { loadWhatsAppE2EConfig } = require('../src/testing/whatsappE2EConfig');
const {
    shouldRouteFinancialCommandOperation
} = require('../src/config/financialCommandPlannerRuntimeConfig');
const {
    shouldRouteFinancialCommandPlanner
} = require('../src/planning/financialCommandPlannerShadow');
const { resolveE2EUserId } = require('./runWhatsappBillPayE2E');

const REQUIRED_OPERATIONS = ['debt.pay', 'invoice.pay', 'expense.create'];
const ALLOWED_ACTIONS = new Set(['all', 'conversation', 'seed', 'verify-cleanup', 'cleanup']);

function sanitizeMarker(value) {
    const marker = String(value || '')
        .trim()
        .replace(/[^A-Za-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 80);
    if (!/^TESTE_APAGAR_[A-Za-z0-9_]+$/.test(marker)) {
        throw new Error('Planner writes E2E exige marcador TESTE_APAGAR_ com letras, números e underscore.');
    }
    return marker;
}

function defaultRunId(date = new Date()) {
    return `TESTE_APAGAR_PLANNER_WRITES_${date.toISOString().replace(/\D/g, '').slice(0, 14)}`;
}

function normalizeAmountText(value, envName) {
    const text = String(value || '').trim().replace('.', ',');
    if (!/^\d{1,6},\d{2}$/.test(text)) {
        throw new Error(`${envName} deve estar no formato 12,34.`);
    }
    return text;
}

function resolvePlannerWritesFixtureMode(env = process.env) {
    const mode = String(env.PLANNER_WRITES_E2E_FIXTURE_MODE || 'local').trim().toLowerCase();
    if (!['local', 'external'].includes(mode)) {
        throw new Error('PLANNER_WRITES_E2E_FIXTURE_MODE deve ser local ou external.');
    }
    return mode;
}

function resolvePlannerWritesAction(env = process.env) {
    const action = String(env.PLANNER_WRITES_E2E_ACTION || 'all').trim().toLowerCase();
    if (!ALLOWED_ACTIONS.has(action)) {
        throw new Error('PLANNER_WRITES_E2E_ACTION deve ser all, conversation, seed, verify-cleanup ou cleanup.');
    }
    return action;
}

function normalizeLookupText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function resolvePlannerWritesUserFromRows(users = [], lookup = '') {
    const normalizedLookup = normalizeLookupText(lookup);
    const lookupDigits = String(lookup || '').replace(/\D/g, '');
    if (!normalizedLookup && !lookupDigits) {
        throw new Error('Fixture remota exige lookup explícito em PLANNER_WRITES_E2E_USER_LOOKUP.');
    }

    const matches = users.filter(user => {
        if (user.status !== 'ACTIVE') return false;
        const displayNameMatches = normalizedLookup &&
            normalizeLookupText(user.display_name) === normalizedLookup;
        const phoneMatches = lookupDigits &&
            String(user.phone_e164 || user.whatsapp_id || '').replace(/\D/g, '') === lookupDigits;
        return displayNameMatches || phoneMatches;
    });
    if (matches.length !== 1 || !matches[0]?.user_id) {
        throw new Error('PLANNER_WRITES_E2E_USER_LOOKUP deve identificar um único usuário ACTIVE.');
    }
    return matches[0];
}

async function resolvePlannerWritesFixtureUserId(env = process.env) {
    const { getAllUsers } = require('../src/services/userService');
    const users = await getAllUsers();
    return resolvePlannerWritesUserFromRows(
        users,
        env.PLANNER_WRITES_E2E_USER_LOOKUP
    ).user_id;
}
function requirePlannerWritesRouteMode(env = process.env, userId = '') {
    if (!shouldRouteFinancialCommandPlanner({ env, userId })) {
        throw new Error('Planner writes E2E exige FINANCIAL_COMMAND_PLANNER_MODE=route ou canary autorizado.');
    }
    for (const operation of REQUIRED_OPERATIONS) {
        if (!shouldRouteFinancialCommandOperation(operation, { env })) {
            throw new Error(`Planner writes E2E exige ${operation} em FINANCIAL_COMMAND_PLANNER_ROUTE_OPERATIONS.`);
        }
    }
}

function buildPlannerWritesE2EPlan(options = {}) {
    const marker = sanitizeMarker(
        options.runId || process.env.PLANNER_WRITES_E2E_RUN_ID || defaultRunId()
    );
    const userId = String(options.userId || '').trim();
    if (!userId) throw new Error('Planner writes E2E exige userId confiável.');

    const debtAmount = normalizeAmountText(
        options.debtAmount || process.env.PLANNER_WRITES_E2E_DEBT_AMOUNT || '12,31',
        'PLANNER_WRITES_E2E_DEBT_AMOUNT'
    );
    const invoiceAmount = normalizeAmountText(
        options.invoiceAmount || process.env.PLANNER_WRITES_E2E_INVOICE_AMOUNT || '12,32',
        'PLANNER_WRITES_E2E_INVOICE_AMOUNT'
    );
    const expenseAmount = normalizeAmountText(
        options.expenseAmount || process.env.PLANNER_WRITES_E2E_EXPENSE_AMOUNT || '12,33',
        'PLANNER_WRITES_E2E_EXPENSE_AMOUNT'
    );
    const billingMonth = String(
        options.billingMonth || process.env.PLANNER_WRITES_E2E_BILLING_MONTH || '06/2026'
    ).trim();
    if (!/^(0[1-9]|1[0-2])\/\d{4}$/.test(billingMonth)) {
        throw new Error('PLANNER_WRITES_E2E_BILLING_MONTH deve estar no formato MM/AAAA.');
    }

    const debtLabel = `Empréstimo ${marker}`;
    const cardLabel = `Cartão ${marker}`;
    return {
        marker,
        debt: {
            label: debtLabel,
            initialBalance: 100,
            paymentAmount: Number(debtAmount.replace(',', '.')),
            row: [
                debtLabel,
                'Credor E2E',
                'Empréstimo',
                '100,00',
                '100,00',
                debtAmount,
                '',
                '27',
                '',
                '1',
                'Ativa',
                '',
                marker,
                '0%',
                '',
                '0',
                '',
                userId
            ]
        },
        invoice: {
            cardLabel,
            row: [
                '27/06/2026',
                `Compra fixture ${marker}`,
                'Outros',
                invoiceAmount,
                '1/1',
                billingMonth,
                `e2e-${marker}`.slice(0, 80),
                cardLabel,
                'Aberta',
                userId
            ]
        },
        expense: {
            description: 'mercado',
            category: 'Alimentação',
            subcategory: 'SUPERMERCADO',
            amount: Number(expenseAmount.replace(',', '.')),
            amountText: expenseAmount,
            payment: 'PIX',
            recurring: 'Não'
        },
        messages: {
            debt: {
                initial: `Paguei ${debtAmount} da dívida ${debtLabel} via Pix`,
                expectedConfirmation: ['dívida', 'Confirma'],
                expectedSaved: ['Pagamento da dívida', 'Novo saldo devedor']
            },
            invoice: {
                initial: `Paguei ${invoiceAmount} da fatura do ${cardLabel} via Pix`,
                expectedConfirmation: ['fatura', 'Confirma'],
                expectedSaved: ['Pagamento da fatura', 'registrado']
            },
            expense: {
                initial: `Gastei ${expenseAmount} no mercado ${marker} via Pix`,
                expectedConfirmation: ['gasto', 'Confirma'],
                expectedSaved: ['Gasto de', expenseAmount, 'registrado']
            },
            confirm: 'sim'
        }
    };
}

function rowContainsMarker(row = [], marker = '') {
    const escapedMarker = String(marker || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!escapedMarker) return false;
    const exactMarker = new RegExp(`(^|[^A-Za-z0-9_])${escapedMarker}(?=$|[^A-Za-z0-9_])`);
    return row.some(cell => exactMarker.test(String(cell || '')));
}

function normalizePlannerWritesText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function normalizePlannerWritesAmount(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
    }
    let normalized = String(value || '')
        .replace(/R\$/gi, '')
        .replace(/\s/g, '')
        .trim();
    if (!normalized) return null;
    if (normalized.includes(',')) {
        normalized = normalized.replace(/\./g, '').replace(',', '.');
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}

function findPlannerWritesExpenseRows(rows = [], plan = {}) {
    const expected = plan.expense || {};
    return rows
        .map((row, index) => ({ row, index }))
        .filter(item => {
            if (item.index === 0) return false;
            if (rowContainsMarker(item.row, plan.marker)) return false;
            const amount = normalizePlannerWritesAmount(item.row[4]);
            return normalizePlannerWritesText(item.row[1]) === normalizePlannerWritesText(expected.description) &&
                normalizePlannerWritesText(item.row[2]) === normalizePlannerWritesText(expected.category) &&
                normalizePlannerWritesText(item.row[3]) === normalizePlannerWritesText(expected.subcategory) &&
                amount === expected.amount &&
                normalizePlannerWritesText(item.row[6]) === normalizePlannerWritesText(expected.payment) &&
                normalizePlannerWritesText(item.row[7]) === normalizePlannerWritesText(expected.recurring);
        });
}

function getGoogleService() {
    return require('../src/services/google');
}

function getWhatsAppRuntime() {
    return {
        launchWhatsAppWebDriver: require('../src/testing/whatsappWebDriver').launchWhatsAppWebDriver,
        sendAndWaitForAllReply: require('../src/testing/e2eAssertions').sendAndWaitForAllReply
    };
}

async function readMarkerRows(marker, { userId } = {}) {
    const { readDataFromSheet } = getGoogleService();
    const readOptions = userId ? { userId } : {};
    const result = {};
    for (const sheetName of ['Dívidas', 'Lançamentos Cartão', 'Transferências', 'Saídas']) {
        const rows = await readDataFromSheet(`${sheetName}!A:Z`, readOptions);
        result[sheetName] = rows
            .map((row, index) => ({ row, index }))
            .filter(item => item.index > 0 && rowContainsMarker(item.row, marker));
    }
    return result;
}

async function cleanupPlannerWritesMarker(marker, { userId } = {}) {
    const { deleteRowsByIndices } = getGoogleService();
    const readOptions = userId ? { userId } : {};
    const matches = await readMarkerRows(marker, readOptions);
    for (const [sheetName, rows] of Object.entries(matches)) {
        if (rows.length === 0) continue;
        await deleteRowsByIndices(sheetName, rows.map(item => item.index), {
            ...readOptions,
            source: 'whatsapp_planner_writes_e2e_cleanup'
        });
    }
}

async function readPlannerWritesResultRows(plan, { userId } = {}) {
    const matches = await readMarkerRows(plan.marker, { userId });
    if ((matches['Saídas'] || []).length === 0) {
        const { readDataFromSheet } = getGoogleService();
        const readOptions = userId ? { userId } : {};
        const rows = await readDataFromSheet('Saídas!A:Z', readOptions);
        matches['Saídas'] = findPlannerWritesExpenseRows(rows, plan);
    }
    return matches;
}

async function cleanupPlannerWritesPlan(plan, { userId } = {}) {
    await cleanupPlannerWritesMarker(plan.marker, { userId });
    const { deleteRowsByIndices, readDataFromSheet } = getGoogleService();
    const readOptions = userId ? { userId } : {};
    const rows = await readDataFromSheet('Saídas!A:Z', readOptions);
    const expenseRows = findPlannerWritesExpenseRows(rows, plan);
    if (expenseRows.length > 1) {
        throw new Error(`Cleanup inseguro em Saídas: esperado no máximo 1 gasto limpo, atual=${expenseRows.length}.`);
    }
    if (expenseRows.length === 1) {
        await deleteRowsByIndices('Saídas', [expenseRows[0].index], {
            ...readOptions,
            source: 'whatsapp_planner_writes_e2e_expense_cleanup'
        });
    }
}

async function seedPlannerWritesFixtures(plan, { userId } = {}) {
    const { appendRowToSheet } = getGoogleService();
    const writeOptions = userId ? { userId } : {};
    await cleanupPlannerWritesPlan(plan, writeOptions);
    await appendRowToSheet('Dívidas', plan.debt.row, {
        ...writeOptions,
        source: 'whatsapp_planner_writes_e2e_seed_debt'
    });
    await appendRowToSheet('Lançamentos Cartão', plan.invoice.row, {
        ...writeOptions,
        source: 'whatsapp_planner_writes_e2e_seed_invoice'
    });
}

function assertMarkerCounts(matches, expected) {
    for (const [sheetName, count] of Object.entries(expected)) {
        const actual = matches[sheetName]?.length || 0;
        if (actual !== count) {
            throw new Error(`Marker-only inválido em ${sheetName}: esperado=${count} atual=${actual}.`);
        }
    }
}

async function verifyPlannerWritesResults(plan, { userId } = {}) {
    const matches = await readPlannerWritesResultRows(plan, { userId });
    assertMarkerCounts(matches, {
        'Dívidas': 1,
        'Lançamentos Cartão': 1,
        'Transferências': 1,
        'Saídas': 1
    });

    const debtBalance = Number(String(matches['Dívidas'][0].row[4] || '').replace(',', '.'));
    const expectedBalance = Number((plan.debt.initialBalance - plan.debt.paymentAmount).toFixed(2));
    if (debtBalance !== expectedBalance) {
        throw new Error(`Saldo da dívida divergente: esperado=${expectedBalance} atual=${debtBalance}.`);
    }
    if (matches['Transferências'][0].row[7] !== 'Pagamento de fatura') {
        throw new Error('invoice.pay não foi persistido como Pagamento de fatura em Transferências.');
    }
    if (String(matches['Saídas'][0].row[7] || '').toLowerCase() === 'sim') {
        throw new Error('expense.create comum foi marcado indevidamente como recorrente.');
    }
}

async function assertPlannerWritesMarkerRemoved(plan, { userId } = {}) {
    const remaining = await readMarkerRows(plan.marker, { userId });
    assertMarkerCounts(remaining, {
        'Dívidas': 0,
        'Lançamentos Cartão': 0,
        'Transferências': 0,
        'Saídas': 0
    });
    const { readDataFromSheet } = getGoogleService();
    const rows = await readDataFromSheet('Saídas!A:Z', userId ? { userId } : {});
    const expenseRows = findPlannerWritesExpenseRows(rows, plan);
    if (expenseRows.length !== 0) {
        throw new Error(`Cleanup incompleto em Saídas: restante=${expenseRows.length}.`);
    }
}

async function runFixtureAction(action, plan, { userId } = {}) {
    if (action === 'seed') {
        await seedPlannerWritesFixtures(plan, { userId });
        console.log('[planner-writes-e2e] fixture remota criada com marcador sanitizado');
        return;
    }
    if (action === 'cleanup') {
        await cleanupPlannerWritesPlan(plan, { userId });
        await assertPlannerWritesMarkerRemoved(plan, { userId });
        console.log('[planner-writes-e2e] cleanup remoto confirmado com zero linhas');
        return;
    }
    if (action === 'verify-cleanup') {
        let verificationError = null;
        try {
            await verifyPlannerWritesResults(plan, { userId });
        } catch (error) {
            verificationError = error;
        } finally {
            await cleanupPlannerWritesPlan(plan, { userId });
            await assertPlannerWritesMarkerRemoved(plan, { userId });
        }
        if (verificationError) throw verificationError;
        console.log('[planner-writes-e2e] verificação remota passou e cleanup ficou em zero');
        return;
    }
    throw new Error(`Ação de fixture não suportada: ${action}.`);
}
async function runConversation(driver, plan) {
    const { sendAndWaitForAllReply } = getWhatsAppRuntime();
    for (const flow of [plan.messages.debt, plan.messages.invoice, plan.messages.expense]) {
        await sendAndWaitForAllReply(driver, flow.initial, flow.expectedConfirmation);
        await sendAndWaitForAllReply(driver, plan.messages.confirm, flow.expectedSaved);
    }
}

async function main() {
    const action = resolvePlannerWritesAction(process.env);
    if (['seed', 'verify-cleanup', 'cleanup'].includes(action)) {
        const userId = await resolvePlannerWritesFixtureUserId(process.env);
        const plan = buildPlannerWritesE2EPlan({ userId });
        await runFixtureAction(action, plan, { userId });
        return;
    }

    const config = loadWhatsAppE2EConfig(process.env);
    const userId = await resolveE2EUserId(config);
    requirePlannerWritesRouteMode(process.env, userId);
    const plan = buildPlannerWritesE2EPlan({ userId });
    const fixtureMode = resolvePlannerWritesFixtureMode(process.env);
    const { launchWhatsAppWebDriver } = getWhatsAppRuntime();
    const driver = await launchWhatsAppWebDriver(config);

    try {
        if (action === 'all' && fixtureMode === 'local') {
            await seedPlannerWritesFixtures(plan, { userId });
        } else if (fixtureMode === 'external') {
            console.log('[planner-writes-e2e] fixture externo: seed, verificação e cleanup pertencem ao ambiente alvo');
        }
        await driver.gotoHome();
        await driver.assertLoggedIn();
        await driver.openChat(config.botPhone);
        await runConversation(driver, plan);
        if (action === 'all' && fixtureMode === 'local') {
            await verifyPlannerWritesResults(plan, { userId });
        }
    } finally {
        await driver.close().catch(() => {});
        if (action === 'all' && fixtureMode === 'local') {
            await cleanupPlannerWritesPlan(plan, { userId }).catch(error => {
                console.error(`[planner-writes-e2e] cleanup_failed marker=${plan.marker} error=${error.message}`);
            });
        }
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error(`WhatsApp planner writes E2E falhou: ${error.message}`);
        process.exit(1);
    });
}

module.exports = {
    buildPlannerWritesE2EPlan,
    cleanupPlannerWritesMarker,
    cleanupPlannerWritesPlan,
    findPlannerWritesExpenseRows,
    readMarkerRows,
    requirePlannerWritesRouteMode,
    resolvePlannerWritesAction,
    resolvePlannerWritesFixtureMode,
    resolvePlannerWritesUserFromRows,
    rowContainsMarker,
    runFixtureAction,
    seedPlannerWritesFixtures,
    verifyPlannerWritesResults
};
