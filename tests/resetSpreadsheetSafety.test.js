const test = require('node:test');
const assert = require('node:assert');

const {
    RESET_CONFIRMATION,
    assertSpreadsheetResetAllowed
} = require('../scripts/resetSpreadsheetData');

test('resetSpreadsheetData safety blocks missing spreadsheet id', () => {
    assert.throws(
        () => assertSpreadsheetResetAllowed({ env: {}, spreadsheetId: '' }),
        /SPREADSHEET_ID/
    );
});

test('resetSpreadsheetData safety blocks unconfirmed destructive reset', () => {
    assert.throws(
        () => assertSpreadsheetResetAllowed({
            env: {
                SPREADSHEET_IS_TEST: 'true'
            },
            spreadsheetId: 'sheet-1'
        }),
        /bloqueado por segurança/
    );
});

test('resetSpreadsheetData safety requires test sheet marker plus confirmation', () => {
    assert.throws(
        () => assertSpreadsheetResetAllowed({
            env: {
                SPREADSHEET_RESET_CONFIRMATION: RESET_CONFIRMATION
            },
            spreadsheetId: 'sheet-1'
        }),
        /planilha de teste/
    );

    assert.doesNotThrow(() => assertSpreadsheetResetAllowed({
        env: {
            SPREADSHEET_IS_TEST: 'true',
            SPREADSHEET_RESET_CONFIRMATION: RESET_CONFIRMATION
        },
        spreadsheetId: 'sheet-1'
    }));
});

test('resetSpreadsheetData safety allows dedicated functional spreadsheet id', () => {
    assert.doesNotThrow(() => assertSpreadsheetResetAllowed({
        env: {
            FUNCTIONAL_TEST_SPREADSHEET_ID: 'sheet-test',
            SPREADSHEET_RESET_CONFIRMATION: RESET_CONFIRMATION
        },
        spreadsheetId: 'sheet-test'
    }));
});
