require('dotenv').config();

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getAllUsers } = require('../src/services/userService');
const {
    appendRowToSheet,
    deleteRowsByIndices,
    readDataFromSheet,
    runWithUserSheetContext
} = require('../src/services/google');
const { getFormattedDateOnly, normalizeText } = require('../src/utils/helpers');

function buildMarker(date = new Date()) {
    return `TESTE_APAGAR_BATCH_6A_${date.toISOString().replace(/\D/g, '').slice(0, 14)}`;
}

function sanitizeMarker(value) {
    const marker = String(value || '').trim().replace(/[^A-Za-z0-9_]/g, '_').slice(0, 80);
    if (!/^TESTE_APAGAR_BATCH_6A_[A-Za-z0-9_]+$/.test(marker)) throw new Error('Marcador E2E 6A inválido.');
    return marker;
}

function resolveFixtureUser(users, lookup) {
    const normalized = normalizeText(String(lookup || '').trim());
    const digits = String(lookup || '').replace(/\D/g, '');
    if (!normalized && !digits) throw new Error('BATCH_MAINTENANCE_E2E_USER_LOOKUP é obrigatório.');
    const matches = (users || []).filter(user => user.status === 'ACTIVE').filter(user => {
        return (normalized && normalizeText(user.display_name || '') === normalized)
            || (digits && String(user.phone_e164 || user.whatsapp_id || '').replace(/\D/g, '') === digits);
    });
    if (matches.length !== 1 || !matches[0]?.user_id) {
        throw new Error('BATCH_MAINTENANCE_E2E_USER_LOOKUP deve identificar um único usuário ACTIVE.');
    }
    return matches[0];
}

function rowHasMarker(row, marker) {
    return (row || []).some(cell => String(cell || '').includes(marker));
}

async function markerRows(sheetName, marker) {
    const rows = await readDataFromSheet(`${sheetName}!A:Z`);
    return rows
        .map((row, index) => ({ row, index }))
        .filter(item => item.index > 0 && rowHasMarker(item.row, marker));
}

async function cleanupMarker(marker) {
    for (const sheetName of ['Saídas', 'Lançamentos Cartão']) {
        const matches = await markerRows(sheetName, marker);
        if (matches.length > 0) {
            const result = await deleteRowsByIndices(sheetName, matches.map(item => item.index), {
                source: 'batch_maintenance_e2e.cleanup'
            });
            if (!result?.success) throw new Error(`Cleanup falhou em ${sheetName}.`);
        }
    }
}

async function assertCleanup(marker) {
    for (const sheetName of ['Saídas', 'Lançamentos Cartão']) {
        if ((await markerRows(sheetName, marker)).length !== 0) {
            throw new Error(`Cleanup incompleto em ${sheetName}.`);
        }
    }
}

async function seedFixtures(marker, user) {
    const date = getFormattedDateOnly();
    await appendRowToSheet('Saídas', [
        date, `Uber ${marker}`, 'Outros', '', 12.34, user.display_name || 'E2E',
        'PIX', 'Não', marker, user.user_id, ''
    ], { source: 'batch_maintenance_e2e.seed' });
    await appendRowToSheet('Lançamentos Cartão', [
        date, `Uber ${marker}`, 'Outros', 23.45, '1/1', 'Julho de 2026',
        `card_${marker}`, 'Cartão E2E', marker, user.user_id
    ], { source: 'batch_maintenance_e2e.seed' });
}

async function runHandlerFlow(marker, user) {
    const { startBatchMaintenance, confirmBatchMaintenance, __test__ } = require('../src/handlers/batchMaintenanceHandler');
    const replies = [];
    const sender = String(user.whatsapp_id || user.phone_e164 || `e2e-${marker}`);
    const message = (body, id) => ({
        body,
        from: sender,
        id: { _serialized: id },
        reply: async text => { replies.push(String(text)); }
    });
    __test__.clearPendingBatches();
    const started = await startBatchMaintenance(
        message(`categorize todos os gastos com ${marker} como Transporte / E2E`, `e2e-${marker}-preview`),
        user
    );
    if (!started || !replies.some(reply => /Preview obrigatório/.test(reply) && /2 itens/.test(reply))) {
        throw new Error('Preview obrigatório não confirmou exatamente dois itens.');
    }
    const confirmed = await confirmBatchMaintenance(message('sim', `e2e-${marker}-confirm`), user);
    if (!confirmed || !replies.some(reply => /2 itens atualizados com sucesso/.test(reply))) {
        throw new Error('Confirmação do lote não retornou sucesso exato.');
    }
}

async function verifyWrites(marker) {
    const expenses = await markerRows('Saídas', marker);
    const cards = await markerRows('Lançamentos Cartão', marker);
    if (expenses.length !== 1 || cards.length !== 1) throw new Error('Fixtures marker-only perderam isolamento.');
    if (String(expenses[0].row[2]) !== 'Transporte' || String(expenses[0].row[3]) !== 'E2E') {
        throw new Error('Recategorização da saída divergiu.');
    }
    if (String(cards[0].row[2]) !== 'Transporte') throw new Error('Recategorização do cartão divergiu.');
    return { expenses: expenses.length, cards: cards.length };
}

async function main() {
    const marker = sanitizeMarker(process.env.BATCH_MAINTENANCE_E2E_RUN_ID || buildMarker());
    const dbPath = path.join(os.tmpdir(), `batch-maintenance-e2e-${marker}.sqlite`);
    process.env.BATCH_MAINTENANCE_WRITE_DB_PATH = dbPath;
    const user = resolveFixtureUser(await getAllUsers(), process.env.BATCH_MAINTENANCE_E2E_USER_LOOKUP);
    let result;
    let cleanupError = null;
    try {
        result = await runWithUserSheetContext(user, async () => {
            await cleanupMarker(marker);
            await seedFixtures(marker, user);
            await runHandlerFlow(marker, user);
            return verifyWrites(marker);
        });
    } finally {
        await runWithUserSheetContext(user, async () => {
            try {
                await cleanupMarker(marker);
                await assertCleanup(marker);
            } catch (error) {
                cleanupError = error;
            }
        });
        for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
    }
    if (cleanupError) throw cleanupError;
    console.log(`[batch-maintenance-e2e] GO items=${result.expenses + result.cards} sheets=2 cleanup=zero privacy=true`);
}

if (require.main === module) {
    main().catch(error => {
        console.error(`[batch-maintenance-e2e] NO_GO error=${error.message}`);
        process.exit(1);
    });
}

module.exports = {
    assertCleanup,
    buildMarker,
    cleanupMarker,
    resolveFixtureUser,
    rowHasMarker,
    sanitizeMarker
};
