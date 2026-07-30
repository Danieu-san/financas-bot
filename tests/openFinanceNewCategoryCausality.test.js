const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const googleService = require('../src/services/google');
const oauthTokenStore = require('../src/services/oauthTokenStore');
const {
    FinancialWriteLedger
} = require('../src/reliability/financialWriteLedger');
const {
    writeOpenFinanceSaveProposal
} = require('../src/openFinance/openFinanceSaveProposalFinalization');
const {
    buildOpenFinanceSaveProposalReviewCatalog
} = require('../src/openFinance/openFinanceSaveProposalReviewCatalog');

test('new categories written by the final product writer are rediscovered from the user spreadsheet', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-category-causality-'));
    const previousDbPath = process.env.OAUTH_TOKEN_DB_PATH;
    const previousKey = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
    const previousClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const previousClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    process.env.OAUTH_TOKEN_DB_PATH = path.join(directory, 'oauth.sqlite');
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = '9'.repeat(64);
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
    oauthTokenStore.__test__.closeDatabaseForTests();
    const writeLedger = new FinancialWriteLedger({
        dbPath: path.join(directory, 'financial-writes.sqlite')
    });

    const expenseRows = [[
        'Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor',
        'Responsável', 'Pagamento', 'Recorrente', 'Obs', 'user_id', 'Conta'
    ]];
    const cardRows = [[
        'Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela',
        'Mês de Cobrança', 'card_id', 'Cartão', 'Observações', 'user_id'
    ]];
    const appendCalls = [];
    const fakeUserSheets = {
        spreadsheets: {
            values: {
                append: async ({ spreadsheetId, range, resource }) => {
                    const row = resource.values[0];
                    appendCalls.push({ spreadsheetId, range, row });
                    if (row.length === 10) {
                        cardRows.push(row);
                    } else {
                        expenseRows.push(row);
                    }
                    return {
                        data: {
                            updates: {
                                updatedRange: range.replace('A:A', `A${row.length}:K${row.length}`)
                            }
                        }
                    };
                },
                get: async ({ range }) => {
                    if (range.includes('Categorias!')) {
                        return { data: { values: [] } };
                    }
                    if (range.includes('A:K')) {
                        return { data: { values: expenseRows } };
                    }
                    if (range.includes('A:J')) {
                        return { data: { values: cardRows } };
                    }
                    return { data: { values: [] } };
                }
            },
            batchUpdate: async () => ({})
        }
    };

    try {
        oauthTokenStore.saveOAuthConnection('user-daniel', {
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            tokens: {
                access_token: 'test-access-token',
                refresh_token: 'test-refresh-token'
            },
            spreadsheetId: 'personal-family-sheet'
        });
        googleService.__test__.setUserSheetsClientFactoryForTest(
            () => fakeUserSheets
        );
        const appendRowToSheet = (sheetName, row, options) =>
            googleService.appendRowToSheet(sheetName, row, {
                ...options,
                writeLedger
            });

        await writeOpenFinanceSaveProposal({
            sheetName: 'Saídas',
            row: [
                '30/07/2026', 'Ração', 'Pets', '', 50, 'Daniel', 'PIX',
                'Não', '', 'user-daniel', 'Nubank'
            ],
            userId: 'user-daniel'
        }, {
            operationKey: 'expense-new-category',
            proposalRef: 'expense-proposal',
            dependencies: { appendRowToSheet }
        });
        await writeOpenFinanceSaveProposal({
            sheetName: 'Cartão Nubank Daniel',
            row: [
                '30/07/2026', 'Curso', 'Educação', 100, '1/1',
                'Julho de 2026', 'user-daniel'
            ],
            userId: 'user-daniel',
            cardId: 'nubank-daniel'
        }, {
            operationKey: 'credit-new-category',
            proposalRef: 'credit-proposal',
            dependencies: { appendRowToSheet }
        });

        assert.equal(appendCalls.length, 2);
        assert.deepEqual(appendCalls.map(call => call.row.length), [11, 10]);
        assert.equal(
            oauthTokenStore.getOAuthConnection('user-daniel').spreadsheet_id,
            'personal-family-sheet'
        );
        assert.equal(
            await googleService.hasUserSpreadsheetContext({
                userId: 'user-daniel'
            }),
            true
        );
        assert.equal(
            (await googleService.readDataFromSheet('Saídas!A:K', {
                userId: 'user-daniel',
                requireUserScoped: true,
                bypassReadCache: true
            })).length,
            2
        );
        assert.equal(
            (await googleService.readDataFromSheet('Lançamentos Cartão!A:J', {
                userId: 'user-daniel',
                requireUserScoped: true,
                bypassReadCache: true
            })).length,
            2
        );
        const rebuilt = await buildOpenFinanceSaveProposalReviewCatalog({
            userId: 'user-daniel',
            dependencies: {
                getFinancialScopeUserIds: oauthTokenStore.getFinancialScopeUserIds,
                readDataFromSheet: googleService.readDataFromSheet,
                getActiveUsers: async () => [
                    { user_id: 'user-daniel', display_name: 'Daniel' }
                ]
            }
        });
        assert.deepEqual(
            rebuilt.categories.map(item => item.category),
            ['Educação', 'Pets']
        );
        assert.equal(appendCalls.length, 2);
        assert.ok(appendCalls.every(call =>
            call.spreadsheetId === 'personal-family-sheet'));
        assert.equal(appendCalls[0].range, 'Saídas!A:A');
        assert.equal(appendCalls[1].range, 'Lançamentos Cartão!A:A');
        assert.equal(cardRows[1][6], 'nubank-daniel');
        assert.equal(cardRows[1][9], 'user-daniel');
    } finally {
        googleService.__test__.setUserSheetsClientFactoryForTest(null);
        googleService.__test__.clearSheetsReadCache();
        writeLedger.close();
        oauthTokenStore.__test__.closeDatabaseForTests();
        if (previousDbPath === undefined) delete process.env.OAUTH_TOKEN_DB_PATH;
        else process.env.OAUTH_TOKEN_DB_PATH = previousDbPath;
        if (previousKey === undefined) delete process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
        else process.env.OAUTH_TOKEN_ENCRYPTION_KEY = previousKey;
        if (previousClientId === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_ID;
        else process.env.GOOGLE_OAUTH_CLIENT_ID = previousClientId;
        if (previousClientSecret === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
        else process.env.GOOGLE_OAUTH_CLIENT_SECRET = previousClientSecret;
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
