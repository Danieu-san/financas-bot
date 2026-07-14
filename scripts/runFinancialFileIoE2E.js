require('dotenv').config();

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const XLSX = require('xlsx');

const { getAllUsers } = require('../src/services/userService');
const { readDataFromSheet, runWithUserSheetContext } = require('../src/services/google');
const { parseSheetDate } = require('../src/utils/helpers');
const { parseImportMedia } = require('../src/services/statementImportService');
const { handleFinancialExportCommand } = require('../src/handlers/financialExportHandler');
const { resolveFixtureUser } = require('./runBatchMaintenanceE2E');

const PUBLIC_COLUMNS = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Conta', 'Origem'];

function syntheticMedia(bookType) {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
        ['Data', 'Descrição', 'Valor', 'Tipo'],
        ['14/07/2026', 'TESTE_APAGAR_FILE_IO_6B', -12.34, 'Débito']
    ]), 'Extrato');
    return {
        filename: `extrato-sintetico.${bookType}`,
        mimetype: bookType === 'xls'
            ? 'application/vnd.ms-excel'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        data: XLSX.write(workbook, { type: 'buffer', bookType }).toString('base64')
    };
}

function newestPeriod(sheetDataByName, userId) {
    const specs = [
        ['Saídas', 0, 9],
        ['Entradas', 0, 8],
        ['Lançamentos Cartão', 0, 9]
    ];
    const dates = [];
    for (const [sheetName, dateIndex, userIndex] of specs) {
        const rows = sheetDataByName[sheetName] || [];
        rows.slice(1).forEach(row => {
            if (String(row?.[userIndex] || '').trim() !== userId) return;
            const date = parseSheetDate(String(row?.[dateIndex] || ''));
            if (date) dates.push(date);
        });
    }
    if (!dates.length) throw new Error('Usuário E2E não possui período exportável.');
    dates.sort((a, b) => b.getTime() - a.getTime());
    return { month: dates[0].getMonth() + 1, year: dates[0].getFullYear() };
}

function verifyPublicWorkbook(exported, userId) {
    const workbook = XLSX.read(exported.buffer, { type: 'buffer' });
    if (workbook.SheetNames.length !== 1 || workbook.SheetNames[0] !== 'Exportacao') {
        throw new Error('Workbook exportado contém abas inesperadas.');
    }
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Exportacao, { defval: '' });
    if (!rows.length || JSON.stringify(Object.keys(rows[0])) !== JSON.stringify(PUBLIC_COLUMNS)) {
        throw new Error('Colunas públicas da exportação divergiram.');
    }
    const serialized = JSON.stringify(rows);
    const forbidden = [userId, 'user_id', 'card_id', 'operation_key', 'spreadsheet_id', 'row_index'];
    if (forbidden.some(value => value && serialized.includes(value))) {
        throw new Error('Exportação contém identificador interno.');
    }
    return rows.length;
}

async function main() {
    const user = resolveFixtureUser(await getAllUsers(), process.env.FINANCIAL_FILE_IO_E2E_USER_LOOKUP);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-file-io-6b-'));
    let exportRows = 0;
    try {
        for (const bookType of ['xls', 'xlsx']) {
            const media = syntheticMedia(bookType);
            const filePath = path.join(tempDir, media.filename);
            fs.writeFileSync(filePath, Buffer.from(media.data, 'base64'));
            const parsed = parseImportMedia(media);
            if (!parsed.supported || parsed.transactions.length !== 1 || !/Responda `sim`/.test(parsed.preview)) {
                throw new Error(`Preview sintético ${bookType.toUpperCase()} divergiu.`);
            }
        }

        exportRows = await runWithUserSheetContext(user, async () => {
            const options = { userId: user.user_id, suppressMissingSheetError: true };
            const [expenses, income, cards] = await Promise.all([
                readDataFromSheet('Saídas!A:K', options),
                readDataFromSheet('Entradas!A:J', options),
                readDataFromSheet('Lançamentos Cartão!A:J', options)
            ]);
            const period = newestPeriod({
                'Saídas': expenses,
                'Entradas': income,
                'Lançamentos Cartão': cards
            }, user.user_id);
            const replies = [];
            const handled = await handleFinancialExportCommand({
                body: `exportar finanças de ${String(period.month).padStart(2, '0')}/${period.year}`,
                reply: async (...args) => replies.push(args)
            }, user, {
                createMessageMedia: exported => exported
            });
            const exported = replies.find(reply => Buffer.isBuffer(reply?.[0]?.buffer))?.[0];
            if (!handled || !exported) throw new Error('Handler não produziu documento XLSX.');
            const rowCount = verifyPublicWorkbook(exported, user.user_id);
            fs.writeFileSync(path.join(tempDir, exported.filename), exported.buffer);
            return rowCount;
        });
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
    if (fs.existsSync(tempDir)) throw new Error('Cleanup dos arquivos sintéticos falhou.');
    console.log(`[financial-file-io-e2e] GO imports=2 export_rows=${exportRows} writes=zero cleanup=zero privacy=true`);
}

if (require.main === module) {
    main().catch(error => {
        console.error(`[financial-file-io-e2e] NO_GO error=${error.message}`);
        process.exit(1);
    });
}

module.exports = { newestPeriod, syntheticMedia, verifyPublicWorkbook };
