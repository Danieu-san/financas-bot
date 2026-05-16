const test = require('node:test');
const assert = require('node:assert');

const {
    USER_SPREADSHEET_TABS,
    buildUserSpreadsheetResource,
    createUserSpreadsheetForUser,
    quoteSheetName,
    __test__
} = require('../src/services/userSpreadsheetService');

test('user spreadsheet template includes required multiuser financial tabs', () => {
    const titles = USER_SPREADSHEET_TABS.map(tab => tab.title);

    assert.deepStrictEqual(titles, [
        'Dashboard',
        'Manual',
        'Saídas',
        'Entradas',
        'Dívidas',
        'Metas',
        'Cartões',
        'Lançamentos Cartão',
        'Contas',
        'Importações',
        'Configurações'
    ]);

    const cards = USER_SPREADSHEET_TABS.find(tab => tab.title === 'Cartões');
    assert.deepStrictEqual(cards.headers, [
        'card_id',
        'Nome',
        'Banco',
        'Dia de Fechamento',
        'Dia de Vencimento',
        'Ativo',
        'Observações',
        'user_id'
    ]);
});

test('buildUserSpreadsheetResource creates a user-specific title without financial data', () => {
    const resource = buildUserSpreadsheetResource({ displayName: 'Daniel Teste' });

    assert.match(resource.properties.title, /FinançasBot - Daniel Teste/);
    assert.ok(resource.sheets.some(sheet => sheet.properties.title === 'Saídas'));
    assert.strictEqual(JSON.stringify(resource).includes('refresh_token'), false);
});

test('createUserSpreadsheetForUser creates spreadsheet and writes headers to every tab', async () => {
    const calls = [];
    const sheetsClient = {
        spreadsheets: {
            create: async (payload) => {
                calls.push({ type: 'create', payload });
                return {
                    data: {
                        spreadsheetId: 'spreadsheet-user-1',
                        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/spreadsheet-user-1/edit',
                        sheets: USER_SPREADSHEET_TABS.map((tab, index) => ({
                            properties: { title: tab.title, sheetId: 1000 + index }
                        }))
                    }
                };
            },
            values: {
                update: async (payload) => {
                    calls.push({ type: 'values.update', payload });
                    return { data: {} };
                },
                batchUpdate: async (payload) => {
                    calls.push({ type: 'values.batchUpdate', payload });
                    return { data: {} };
                }
            },
            batchUpdate: async (payload) => {
                calls.push({ type: 'batchUpdate', payload });
                return { data: {} };
            }
        }
    };

    const result = await createUserSpreadsheetForUser({
        user: { user_id: 'user-sheet-1', display_name: 'Usuário Planilha' },
        sheetsClient
    });

    assert.strictEqual(result.spreadsheetId, 'spreadsheet-user-1');
    assert.match(result.spreadsheetUrl, /spreadsheet-user-1/);
    assert.strictEqual(calls[0].type, 'create');
    const headerWrites = calls.filter(call => call.type === 'values.update');
    assert.strictEqual(headerWrites.length, USER_SPREADSHEET_TABS.length);
    assert.ok(headerWrites.every(call => call.payload.spreadsheetId === 'spreadsheet-user-1'));
    assert.ok(headerWrites.some(call => call.payload.range === "'Saídas'!A1:J1"));
    assert.ok(headerWrites.some(call => call.payload.range === "'Lançamentos Cartão'!A1:J1"));
    const starterContent = calls.find(call => call.type === 'values.batchUpdate');
    assert.ok(starterContent, 'Should write dashboard/manual starter content');
    assert.ok(starterContent.payload.resource.data.some(item => item.range === "'Manual'!A1:C16"));
    const formatCall = calls.find(call => call.type === 'batchUpdate');
    assert.ok(formatCall, 'Should apply visual formatting');
    assert.ok(formatCall.payload.resource.requests.some(req => req.addChart), 'Should add a dashboard chart');
});

test('quoteSheetName escapes apostrophes for A1 notation', () => {
    assert.strictEqual(quoteSheetName('Saídas'), "'Saídas'");
    assert.strictEqual(quoteSheetName("Banco D'Água"), "'Banco D''Água'");
});

test('user spreadsheet manual explains user-owned cards and sheet purpose', () => {
    const rows = __test__.buildManualRows({ user_id: 'user-1', display_name: 'Pessoa Teste' });
    const text = rows.flat().join(' ');

    assert.match(text, /Cartões/i);
    assert.match(text, /seus cartões/i);
    assert.match(text, /Dashboard/i);
    assert.match(text, /WhatsApp/i);
});

test('user spreadsheet dashboard keeps title row and uses correct formulas', () => {
    const rows = __test__.buildDashboardRows({ user: { user_id: 'user-1', display_name: 'Pessoa Teste' } });
    assert.match(rows[0][0], /Painel de Pessoa Teste/);
    assert.strictEqual(rows[4][1], "=SUM('Entradas'!D2:D)");

    const requests = __test__.buildUserSpreadsheetFormattingRequests({ Dashboard: 1, Manual: 2, Saídas: 3 });
    const overwritesDashboardTitle = requests.some(req => (
        req.updateCells?.range?.sheetId === 1 &&
        req.updateCells.range.startRowIndex === 0
    ));
    assert.strictEqual(overwritesDashboardTitle, false);
});
