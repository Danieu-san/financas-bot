const test = require('node:test');
const assert = require('node:assert');

const {
    USER_SPREADSHEET_TABS,
    buildUserSpreadsheetResource,
    createUserSpreadsheetForUser,
    quoteSheetName
} = require('../src/services/userSpreadsheetService');

test('user spreadsheet template includes required multiuser financial tabs', () => {
    const titles = USER_SPREADSHEET_TABS.map(tab => tab.title);

    assert.deepStrictEqual(titles, [
        'Dashboard',
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
                return { data: { spreadsheetId: 'spreadsheet-user-1' } };
            },
            values: {
                update: async (payload) => {
                    calls.push({ type: 'values.update', payload });
                    return { data: {} };
                }
            }
        }
    };

    const result = await createUserSpreadsheetForUser({
        user: { user_id: 'user-sheet-1', display_name: 'Usuário Planilha' },
        sheetsClient
    });

    assert.strictEqual(result.spreadsheetId, 'spreadsheet-user-1');
    assert.strictEqual(calls[0].type, 'create');
    const headerWrites = calls.filter(call => call.type === 'values.update');
    assert.strictEqual(headerWrites.length, USER_SPREADSHEET_TABS.length);
    assert.ok(headerWrites.every(call => call.payload.spreadsheetId === 'spreadsheet-user-1'));
    assert.ok(headerWrites.some(call => call.payload.range === "'Saídas'!A1:J1"));
    assert.ok(headerWrites.some(call => call.payload.range === "'Lançamentos Cartão'!A1:J1"));
});

test('quoteSheetName escapes apostrophes for A1 notation', () => {
    assert.strictEqual(quoteSheetName('Saídas'), "'Saídas'");
    assert.strictEqual(quoteSheetName("Banco D'Água"), "'Banco D''Água'");
});
