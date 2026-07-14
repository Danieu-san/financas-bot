const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildFinancialFileIoPolicy,
    handleFinancialExportCommand,
    parseFinancialExportCommand
} = require('../src/handlers/financialExportHandler');

test('6B export parser requires a period and supports period, source, category and account', () => {
    assert.deepStrictEqual(
        parseFinancialExportCommand('exportar gastos de julho de 2026 da categoria Transporte da conta Nubank'),
        {
            kind: 'command',
            filters: {
                month: 7,
                year: 2026,
                source: 'expenses',
                category: 'Transporte',
                account: 'Nubank'
            }
        }
    );
    assert.deepStrictEqual(
        parseFinancialExportCommand('exporte finanças de 07/2026'),
        { kind: 'command', filters: { month: 7, year: 2026 } }
    );
    assert.deepStrictEqual(
        parseFinancialExportCommand('exportar finanças'),
        { kind: 'invalid', reason: 'period_required' }
    );
    assert.strictEqual(parseFinancialExportCommand('gastei 20 no mercado'), null);
});

test('6B file IO rollout fails closed and canary requires exact user scope', () => {
    assert.strictEqual(buildFinancialFileIoPolicy({}, 'u1').allowed, false);
    assert.strictEqual(buildFinancialFileIoPolicy({ FINANCIAL_FILE_IO_MODE: 'invalid' }, 'u1').mode, 'off');
    assert.strictEqual(buildFinancialFileIoPolicy({
        FINANCIAL_FILE_IO_MODE: 'canary',
        FINANCIAL_FILE_IO_USER_IDS: 'u1'
    }, 'u1').allowed, true);
    assert.strictEqual(buildFinancialFileIoPolicy({
        FINANCIAL_FILE_IO_MODE: 'canary',
        FINANCIAL_FILE_IO_USER_IDS: 'u10'
    }, 'u1').allowed, false);
});

test('6B WhatsApp handler reads user-scoped sheets and sends XLSX as a document', async () => {
    const calls = [];
    const replies = [];
    const msg = {
        body: 'exportar finanças de julho de 2026',
        reply: async (...args) => replies.push(args)
    };
    const handled = await handleFinancialExportCommand(msg, { user_id: 'u1' }, {
        getPolicy: () => ({ mode: 'canary', allowed: true }),
        readDataFromSheet: async (range, options) => {
            calls.push({ range, options });
            return [['header']];
        },
        buildExport: input => {
            assert.strictEqual(input.userId, 'u1');
            assert.deepStrictEqual(input.filters, { month: 7, year: 2026 });
            return {
                filename: 'financas-2026-07.xlsx',
                mimetype: 'application/xlsx',
                buffer: Buffer.from('xlsx'),
                rowCount: 2
            };
        },
        createMessageMedia: exported => ({ safeMedia: true, filename: exported.filename })
    });
    assert.strictEqual(handled, true);
    assert.strictEqual(calls.length, 3);
    assert.ok(calls.every(call => call.options.userId === 'u1'));
    assert.deepStrictEqual(replies[0][0], { safeMedia: true, filename: 'financas-2026-07.xlsx' });
    assert.strictEqual(replies[0][2].sendMediaAsDocument, true);
});

test('6B WhatsApp handler does not read data when rollout is off', async () => {
    let reads = 0;
    const replies = [];
    const handled = await handleFinancialExportCommand({
        body: 'exportar finanças de julho de 2026',
        reply: async value => replies.push(value)
    }, { user_id: 'u1' }, {
        getPolicy: () => ({ mode: 'off', allowed: false }),
        readDataFromSheet: async () => { reads += 1; return []; }
    });
    assert.strictEqual(handled, true);
    assert.strictEqual(reads, 0);
    assert.match(replies[0], /ainda não está liberada/i);
});
