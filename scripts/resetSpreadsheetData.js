require('dotenv').config();

const googleService = require('../src/services/google');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const DATA_SHEETS = [
    'Saídas',
    'Entradas',
    'Dívidas',
    'Metas',
    'Contas',
    'DashboardData',
    'Cartão Nubank - Daniel',
    'Cartão Nubank - Thais',
    'Cartão Nubank - Cristina',
    'Cartão Atacadão',
    'Users',
    'UserProfile',
    'UserSettings',
    'ConsentLog'
];

async function clearRange(range) {
    await googleService.sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range
    });
}

async function resetSpreadsheetData() {
    if (!SPREADSHEET_ID) {
        throw new Error('SPREADSHEET_ID não definido no .env.');
    }

    await googleService.authorizeGoogle();
    await googleService.ensureSpreadsheetStructure();

    const sheetMap = await googleService.getSheetIds();
    const cleared = [];
    const missing = [];

    for (const title of DATA_SHEETS) {
        if (sheetMap[title] === undefined) {
            missing.push(title);
            continue;
        }
        await clearRange(`'${title}'!A2:ZZ`);
        cleared.push(title);
    }

    if (sheetMap.Dashboard !== undefined) {
        await clearRange('Dashboard!A1:ZZ');
        await googleService.renderVisualDashboard({
            selectedUser: 'TODOS',
            selectedMonth: 'TODOS',
            periodLabel: 'Planilha zerada',
            updatedAt: new Date().toISOString()
        });
        cleared.push('Dashboard');
    }

    console.log('Reset da planilha concluído:', JSON.stringify({ cleared, missing }, null, 2));
}

if (require.main === module) {
    resetSpreadsheetData().catch((error) => {
        console.error('Falha ao resetar dados da planilha:', error);
        process.exit(1);
    });
}

module.exports = { resetSpreadsheetData };
