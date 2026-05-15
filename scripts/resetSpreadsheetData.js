require('dotenv').config();

const googleService = require('../src/services/google');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const RESET_CONFIRMATION = 'RESETAR_PLANILHA_TESTE';

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

function parseBoolean(value) {
    return ['1', 'true', 'yes', 'sim'].includes(String(value || '').trim().toLowerCase());
}

function assertSpreadsheetResetAllowed({ env = process.env, spreadsheetId = SPREADSHEET_ID } = {}) {
    const safeSpreadsheetId = String(spreadsheetId || '').trim();
    if (!safeSpreadsheetId) {
        throw new Error('SPREADSHEET_ID não definido no .env.');
    }

    const confirmation = String(env.SPREADSHEET_RESET_CONFIRMATION || '').trim();
    const dedicatedTestSpreadsheetId = String(env.FUNCTIONAL_TEST_SPREADSHEET_ID || '').trim();
    const isDedicatedTestSheet = dedicatedTestSpreadsheetId && dedicatedTestSpreadsheetId === safeSpreadsheetId;
    const isMarkedTestSheet = parseBoolean(env.SPREADSHEET_IS_TEST) || parseBoolean(env.FUNCTIONAL_TEST_SPREADSHEET);
    const confirmed = confirmation === RESET_CONFIRMATION;

    if (confirmed && (isDedicatedTestSheet || isMarkedTestSheet)) {
        return true;
    }

    throw new Error(
        'Reset de planilha bloqueado por segurança. ' +
        `Para limpar dados, use uma planilha de teste e defina SPREADSHEET_RESET_CONFIRMATION=${RESET_CONFIRMATION} ` +
        'junto com FUNCTIONAL_TEST_SPREADSHEET_ID igual ao SPREADSHEET_ID ou SPREADSHEET_IS_TEST=true.'
    );
}

async function clearRange(range) {
    await googleService.sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range
    });
}

async function resetSpreadsheetData(options = {}) {
    if (!options.skipSafetyCheck) {
        assertSpreadsheetResetAllowed();
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

module.exports = {
    RESET_CONFIRMATION,
    assertSpreadsheetResetAllowed,
    resetSpreadsheetData
};
