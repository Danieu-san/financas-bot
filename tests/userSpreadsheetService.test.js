const test = require('node:test');
const assert = require('node:assert');

const {
    USER_SPREADSHEET_TABS,
    buildUserSpreadsheetResource,
    createUserSpreadsheetForUser,
    applyUserSpreadsheetTemplate,
    buildSpreadsheetUrl,
    quoteSheetName,
    __test__
} = require('../src/services/userSpreadsheetService');
const userSheetAnalyticsService = require('../src/services/userSheetAnalyticsService');

test('user spreadsheet template includes required multiuser financial tabs', () => {
    const titles = USER_SPREADSHEET_TABS.map(tab => tab.title);

    assert.deepStrictEqual(titles, [
        'Dashboard',
        'Manual',
        'Saídas',
        'Entradas',
        'Transferências',
        'Dívidas',
        'Metas',
        'Cartões',
        'Lançamentos Cartão',
        'Faturas',
        'Parcelamentos',
        'Contas'
    ]);
    assert.strictEqual(titles.includes('Importações'), false);
    assert.strictEqual(titles.includes('Configurações'), false);

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
    assert.ok(headerWrites.some(call => call.payload.range === "'Faturas'!A1:F1"));
    assert.ok(headerWrites.some(call => call.payload.range === "'Parcelamentos'!A1:G1"));
    const starterContent = calls.find(call => call.type === 'values.batchUpdate');
    assert.ok(starterContent, 'Should write dashboard/manual starter content');
    assert.ok(starterContent.payload.resource.data.some(item => item.range === "'Manual'!A1:C23"));
    assert.ok(starterContent.payload.resource.data.some(item => item.range === "'Faturas'!A1:F1"));
    assert.ok(starterContent.payload.resource.data.some(item => item.range === "'Parcelamentos'!A1:G1"));
    const formatCall = calls.find(call => call.type === 'batchUpdate');
    assert.ok(formatCall, 'Should apply visual formatting');
    assert.ok(formatCall.payload.resource.requests.some(req => req.addChart), 'Should add a dashboard chart');
});

test('applyUserSpreadsheetTemplate upgrades an existing sheet without recreating it', async () => {
    const calls = [];
    const existingSpreadsheet = {
        data: {
            sheets: [
                { properties: { title: 'Dashboard', sheetId: 10 }, charts: [{ chartId: 77 }] },
                { properties: { title: 'Saídas', sheetId: 11 } },
                { properties: { title: 'Entradas', sheetId: 12 } },
                { properties: { title: 'Importações', sheetId: 98 } },
                { properties: { title: 'Configurações', sheetId: 99 } }
            ]
        }
    };
    const upgradedSpreadsheet = {
        data: {
            sheets: USER_SPREADSHEET_TABS.map((tab, index) => ({
                properties: { title: tab.title, sheetId: 10 + index },
                charts: tab.title === 'Dashboard' ? [{ chartId: 77 }] : []
            }))
        }
    };
    const sheetsClient = {
        spreadsheets: {
            get: async () => {
                calls.push({ type: 'get' });
                return calls.filter(call => call.type === 'batchUpdate.addTabs').length ? upgradedSpreadsheet : existingSpreadsheet;
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
                const hasAddSheet = payload.resource.requests.some(req => req.addSheet);
                calls.push({ type: hasAddSheet ? 'batchUpdate.addTabs' : 'batchUpdate.format', payload });
                return { data: {} };
            }
        }
    };

    await applyUserSpreadsheetTemplate({
        user: { user_id: 'user-existing', display_name: 'Usuário Existente' },
        spreadsheetId: 'existing-sheet-id',
        sheetsClient
    });

    assert.ok(calls.some(call => call.type === 'batchUpdate.addTabs'), 'Should add missing template tabs');
    const tabUpdate = calls.find(call => call.type === 'batchUpdate.addTabs');
    assert.ok(tabUpdate.payload.resource.requests.some(req => req.deleteSheet?.sheetId === 98));
    assert.ok(tabUpdate.payload.resource.requests.some(req => req.deleteSheet?.sheetId === 99));
    const starterContent = calls.find(call => call.type === 'values.batchUpdate');
    assert.ok(starterContent.payload.resource.data.some(item => item.range === "'Manual'!A1:C23"));
    assert.ok(starterContent.payload.resource.data.some(item => item.range === "'Faturas'!A1:F1"));
    assert.ok(starterContent.payload.resource.data.some(item => item.range === "'Parcelamentos'!A1:G1"));
    const formatCall = calls.find(call => call.type === 'batchUpdate.format');
    assert.ok(formatCall.payload.resource.requests.some(req => req.deleteEmbeddedObject?.objectId === 77));
    assert.ok(formatCall.payload.resource.requests.some(req => req.addChart));
});

test('quoteSheetName escapes apostrophes for A1 notation', () => {
    assert.strictEqual(quoteSheetName('Saídas'), "'Saídas'");
    assert.strictEqual(quoteSheetName("Banco D'Água"), "'Banco D''Água'");
});

test('buildSpreadsheetUrl returns a usable sheet link for existing OAuth spreadsheets', () => {
    assert.strictEqual(
        buildSpreadsheetUrl('existing-sheet-id'),
        'https://docs.google.com/spreadsheets/d/existing-sheet-id/edit'
    );
    assert.strictEqual(buildSpreadsheetUrl(''), '');
});

test('user spreadsheet manual explains user-owned cards and sheet purpose', () => {
    const rows = __test__.buildManualRows({ user: { user_id: 'user-1', display_name: 'Pessoa Teste' } });
    const text = rows.flat().join(' ');
    const sections = rows.map(row => row[0]);

    assert.match(text, /Cartões/i);
    assert.match(text, /seus cartões/i);
    assert.match(text, /Dashboard/i);
    assert.match(text, /WhatsApp/i);
    assert.doesNotMatch(text, /Daniel|Thaís|Hash|Linhas Detectadas|Importações|user_id|CSV|OFX/i);
    for (const required of ['Primeiros passos', 'Comandos do WhatsApp', 'Saídas', 'Entradas', 'Cartões', 'Lançamentos Cartão', 'Faturas', 'Parcelamentos', 'Dívidas', 'Metas', 'Contas', 'Dashboard web', 'Correções']) {
        assert.ok(sections.includes(required), `Manual deve explicar: ${required}`);
    }
});

test('user spreadsheet starter content does not expose admin or technical configuration ranges', () => {
    const ranges = __test__.buildStarterValueRanges({ user: { user_id: 'user-1', display_name: 'Pessoa Teste' } });
    const text = JSON.stringify(ranges);

    assert.strictEqual(ranges.some(item => item.range.includes('Configurações')), false);
    assert.doesNotMatch(text, /Daniel|Thaís|Hash|Linhas Detectadas|import_id|cartoes_do_usuario/i);
});

test('user spreadsheet dashboard keeps title row and uses correct formulas', () => {
    const rows = __test__.buildDashboardRows({ user: { user_id: 'user-1', display_name: 'Pessoa Teste' } });
    assert.match(rows[0][0], /Painel de Pessoa Teste/);
    assert.strictEqual(rows[4][1], "=SUM('Entradas'!D2:D)");
    assert.ok(rows.some(row => row[0] === 'Faturas por mês' && String(row[1]).includes('Faturas')));
    assert.ok(rows.some(row => row[0] === 'Parcelamentos ativos' && String(row[1]).includes('Parcelamentos')));

    const requests = __test__.buildUserSpreadsheetFormattingRequests({ Dashboard: 1, Manual: 2, Saídas: 3 });
    const overwritesDashboardTitle = requests.some(req => (
        req.updateCells?.range?.sheetId === 1 &&
        req.updateCells.range.startRowIndex === 0
    ));
    assert.strictEqual(overwritesDashboardTitle, false);
    assert.ok(requests.some(req => req.unmergeCells), 'Should unmerge dashboard title area before reapplying template');
});

test('user spreadsheet card summary tabs are formula-driven from card launches', () => {
    const ranges = __test__.buildStarterValueRanges({ user: { user_id: 'user-1', display_name: 'Pessoa Teste' } });
    const faturas = ranges.find(item => item.range === "'Faturas'!A1:F1");
    const parcelamentos = ranges.find(item => item.range === "'Parcelamentos'!A1:G1");

    assert.ok(faturas, 'Should seed automatic invoice summary');
    assert.ok(parcelamentos, 'Should seed automatic installment summary');
    assert.match(faturas.values[0][0], /^=QUERY\(/);
    assert.match(parcelamentos.values[0][0], /^=QUERY\(/);
    assert.match(faturas.values[0][0], /'Lançamentos Cartão'!A:J/);
    assert.match(parcelamentos.values[0][0], /'Lançamentos Cartão'!A:J/);
    assert.doesNotMatch(JSON.stringify([faturas, parcelamentos]), /Importações|Hash|Configurações/i);
});

test('user spreadsheet formatting does not overwrite formula-driven summary headers', () => {
    const requests = __test__.buildUserSpreadsheetFormattingRequests({ Faturas: 31, Parcelamentos: 32 });
    const overwritesSummaryFormula = requests.some(req => (
        req.updateCells?.range?.startRowIndex === 0 &&
        [31, 32].includes(req.updateCells.range.sheetId)
    ));

    assert.strictEqual(overwritesSummaryFormula, false);
    assert.ok(requests.some(req => req.repeatCell?.range?.sheetId === 31 && req.repeatCell.range.startRowIndex === 0));
    assert.ok(requests.some(req => req.repeatCell?.range?.sheetId === 32 && req.repeatCell.range.startRowIndex === 0));
});

test('user sheet analytics can include all users in a shared financial scope', () => {
    const { rowBelongsToAnyUser } = userSheetAnalyticsService.__test__;
    const rowA = ['10/05/2026', 'mercado', 'Alimentação', '', 50, 'Daniel', 'PIX', 'Não', '', 'user-a'];
    const rowB = ['11/05/2026', 'farmácia', 'Saúde', '', 30, 'Thais', 'PIX', 'Não', '', 'user-b'];
    const rowC = ['12/05/2026', 'livro', 'Educação', '', 20, 'Outro', 'PIX', 'Não', '', 'user-c'];

    assert.strictEqual(rowBelongsToAnyUser(rowA, 9, ['user-a', 'user-b']), true);
    assert.strictEqual(rowBelongsToAnyUser(rowB, 9, ['user-a', 'user-b']), true);
    assert.strictEqual(rowBelongsToAnyUser(rowC, 9, ['user-a', 'user-b']), false);
});
