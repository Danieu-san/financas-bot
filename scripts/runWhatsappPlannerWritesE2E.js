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

async function seedPlannerWritesFixtures(plan, { userId } = {}) {
    const { appendRowToSheet } = getGoogleService();
    const writeOptions = userId ? { userId } : {};
    await cleanupPlannerWritesMarker(plan.marker, writeOptions);
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
    const matches = await readMarkerRows(plan.marker, { userId });
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

async function runConversation(driver, plan) {
    const { sendAndWaitForAllReply } = getWhatsAppRuntime();
    for (const flow of [plan.messages.debt, plan.messages.invoice, plan.messages.expense]) {
        await sendAndWaitForAllReply(driver, flow.initial, flow.expectedConfirmation);
        await sendAndWaitForAllReply(driver, plan.messages.confirm, flow.expectedSaved);
    }
}

async function main() {
    const config = loadWhatsAppE2EConfig(process.env);
    const userId = await resolveE2EUserId(config);
    requirePlannerWritesRouteMode(process.env, userId);
    const plan = buildPlannerWritesE2EPlan({ userId });
    const fixtureMode = resolvePlannerWritesFixtureMode(process.env);
    const { launchWhatsAppWebDriver } = getWhatsAppRuntime();
    const driver = await launchWhatsAppWebDriver(config);

    try {
        if (fixtureMode === 'local') {
            await seedPlannerWritesFixtures(plan, { userId });
        } else {
            console.log('[planner-writes-e2e] fixture externo: seed, verificação e cleanup pertencem ao ambiente alvo');
        }
        await driver.gotoHome();
        await driver.assertLoggedIn();
        await driver.openChat(config.botPhone);
        await runConversation(driver, plan);
        if (fixtureMode === 'local') {
            await verifyPlannerWritesResults(plan, { userId });
        }
    } finally {
        await driver.close().catch(() => {});
        if (fixtureMode === 'local') {
            await cleanupPlannerWritesMarker(plan.marker, { userId }).catch(error => {
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
    readMarkerRows,
    requirePlannerWritesRouteMode,
    resolvePlannerWritesFixtureMode,
    rowContainsMarker,
    seedPlannerWritesFixtures,
    verifyPlannerWritesResults
};
