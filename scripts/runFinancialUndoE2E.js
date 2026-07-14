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
const { getFormattedDateOnly } = require('../src/utils/helpers');
const { resolveFixtureUser } = require('./runBatchMaintenanceE2E');
const { FinancialUndoStore, FinancialUndoService, fingerprintRow } = require('../src/undo/financialUndoService');

function buildMarker(date = new Date()) {
    return `TESTE_APAGAR_UNDO_6E_${date.toISOString().replace(/\D/g, '').slice(0, 14)}`;
}

function sanitizeMarker(value) {
    const marker = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 96);
    if (!/^TESTE_APAGAR_UNDO_6E_[A-Z0-9_]+$/.test(marker)) throw new Error('Marcador E2E 6E inválido.');
    return marker;
}

async function markerRows(marker) {
    const rows = await readDataFromSheet('Saídas!A:Z');
    return rows.map((row, index) => ({ row, index })).filter(
        item => item.index > 0 && item.row.some(cell => String(cell || '').trim() === marker)
    );
}

async function cleanupMarker(marker) {
    const matches = await markerRows(marker);
    if (!matches.length) return;
    const result = await deleteRowsByIndices('Saídas', matches.map(item => item.index), {
        source: 'financial_undo_e2e.cleanup'
    });
    if (!result?.success) throw new Error('Cleanup marker-only 6E falhou.');
}

async function main() {
    const marker = sanitizeMarker(process.env.FINANCIAL_UNDO_E2E_RUN_ID || buildMarker());
    const user = resolveFixtureUser(await getAllUsers(), process.env.FINANCIAL_UNDO_E2E_USER_LOOKUP);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-undo-6e-'));
    const store = new FinancialUndoStore({ dbPath: path.join(tempDir, 'undo.sqlite') });
    const env = {
        ...process.env,
        FINANCIAL_UNDO_MODE: 'canary',
        FINANCIAL_UNDO_USER_IDS: user.user_id
    };
    let cleanupError;
    let result;
    try {
        result = await runWithUserSheetContext(user, async () => {
            await cleanupMarker(marker);
            const row = [
                getFormattedDateOnly(), marker, 'Outros', '', 0.01,
                user.display_name || 'E2E', 'PIX', 'Não', marker, user.user_id
            ];
            const operationKey = `financial-undo-e2e:${marker}`;
            const append = await appendRowToSheet('Saídas', row, {
                operationKey,
                source: 'financial_undo_e2e.seed'
            });
            const committedRows = await markerRows(marker);
            if (append?.status !== 'committed' || committedRows.length !== 1) {
                throw new Error('Fixture marker-only 6E não foi criada exatamente uma vez.');
            }
            const service = new FinancialUndoService({
                store,
                env,
                readRows: ({ sheetName }) => readDataFromSheet(`${sheetName}!A:Z`),
                deleteRow: ({ sheetName, rowIndex, operationKey: undoOperationKey }) => deleteRowsByIndices(
                    sheetName,
                    [rowIndex],
                    { operationKey: undoOperationKey, userId: user.user_id, source: 'financial_undo_e2e.undo' }
                ),
                isReconciled: async () => false
            });
            const receipt = service.registerMarkerAppend({
                userId: user.user_id,
                operationKey,
                sheetName: 'Saídas',
                marker,
                rowFingerprint: fingerprintRow(committedRows[0].row)
            });
            const undone = await service.undo({ userId: user.user_id, receiptId: receipt.receiptId });
            const replay = await service.undo({ userId: user.user_id, receiptId: receipt.receiptId });
            const remaining = await markerRows(marker);
            const history = service.listAuditHistory({ userId: user.user_id });
            const publicHistory = JSON.stringify(history);
            if (undone.status !== 'undone' || replay.replayed !== true || remaining.length !== 0) {
                throw new Error(`Undo marker-only, replay ou remoção exata divergiu undone=${undone.status} reason=${undone.reason || 'none'} replay=${Boolean(replay.replayed)} remaining=${remaining.length}.`);
            }
            if (history.length !== 3 || publicHistory.includes(marker) || publicHistory.includes(user.user_id)) {
                throw new Error('Histórico público não permaneceu sanitizado.');
            }
            return { receipts: 1, deletes: 1, replays: 1, auditEvents: history.length };
        });
    } finally {
        try {
            await runWithUserSheetContext(user, async () => {
                await cleanupMarker(marker);
                if ((await markerRows(marker)).length !== 0) throw new Error('Cleanup deixou resíduo marker-only.');
            });
        } catch (error) {
            cleanupError = error;
        }
        store.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
    if (cleanupError) throw cleanupError;
    console.log(`[financial-undo-e2e] GO receipts=${result.receipts} deletes=${result.deletes} replays=${result.replays} audit=${result.auditEvents} cleanup=zero privacy=true`);
}

if (require.main === module) main().catch(error => {
    console.error(`[financial-undo-e2e] NO_GO error=${error.message}`);
    process.exit(1);
});

module.exports = { buildMarker, cleanupMarker, main, markerRows, sanitizeMarker };
