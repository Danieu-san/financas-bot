const test = require('node:test');
const assert = require('node:assert/strict');

const { FinancialReceiptStore } = require('../src/receipts/financialReceiptService');
const { handleFinancialReceiptMessage, parseFinancialReceiptCommand, __test__ } = require('../src/handlers/financialReceiptHandler');

function context() {
    const states = new Map();
    const replies = [];
    const uploads = [];
    const store = new FinancialReceiptStore({ dbPath: ':memory:' });
    const rows = [
        ['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Responsável', 'Pagamento', 'Recorrente', 'Obs', 'user_id'],
        ['14/07/2026', 'Mercado', 'Alimentação', '', 60, 'Daniel', 'PIX', 'Não', '', 'u1']
    ];
    const stateManager = {
        getState: key => states.get(key), setState: (key, value) => states.set(key, value), deleteState: key => states.delete(key)
    };
    const deps = {
        stateManager, getStore: () => store, getPolicy: () => ({ allowed: true, mode: 'canary' }),
        readDataFromSheet: async () => rows.map(row => [...row]),
        uploadReceipt: async input => { uploads.push(input); return { driveFileId: 'drive-private', permissionScope: 'private_owner_drive' }; },
        deleteReceipt: async () => true,
        downloadReceipt: async () => Buffer.from('%PDF-download'),
        createMessageMedia: input => ({ media: true, ...input })
    };
    const msg = (body, media = null) => ({
        body, from: 'sender-1', hasMedia: Boolean(media),
        downloadMedia: async () => media,
        reply: async (...args) => replies.push(args)
    });
    return { deps, msg, rows, states, replies, uploads, store };
}

test.afterEach(() => __test__.clearPendingReceipts());

test('6C parser recognizes explicit attach and search commands only', () => {
    assert.deepStrictEqual(parseFinancialReceiptCommand('anexar comprovante ao último gasto'), { action: 'attach', kind: 'expense' });
    assert.deepStrictEqual(parseFinancialReceiptCommand('mostrar comprovante da última entrada'), { action: 'get', kind: 'income' });
    assert.strictEqual(parseFinancialReceiptCommand('paguei um gasto'), null);
});

test('6C handler uploads only after an existing event and media, without financial writes', async () => {
    const c = context();
    try {
        assert.strictEqual(await handleFinancialReceiptMessage(c.msg('anexar comprovante ao último gasto'), { user_id: 'u1' }, c.deps), true);
        assert.strictEqual(c.uploads.length, 0);
        assert.deepStrictEqual(Object.keys(c.states.get('sender-1').data), ['receiptPendingKey']);
        const pdf = { mimetype: 'application/pdf', data: Buffer.from('%PDF-1.7 synthetic').toString('base64') };
        assert.strictEqual(await handleFinancialReceiptMessage(c.msg('', pdf), { user_id: 'u1' }, c.deps), true);
        assert.strictEqual(c.uploads.length, 1);
        assert.strictEqual(c.states.has('sender-1'), false);
        assert.match(c.replies.at(-1)[0], /Nenhuma transação foi criada ou alterada/);
    } finally { c.store.close(); }
});

test('6C handler fails closed when latest event changes before upload', async () => {
    const c = context();
    try {
        await handleFinancialReceiptMessage(c.msg('anexar comprovante ao último gasto'), { user_id: 'u1' }, c.deps);
        c.rows.push(['15/07/2026', 'Novo gasto', 'Outros', '', 10, 'Daniel', 'PIX', 'Não', '', 'u1']);
        const pdf = { mimetype: 'application/pdf', data: Buffer.from('%PDF-1.7 synthetic').toString('base64') };
        await handleFinancialReceiptMessage(c.msg('', pdf), { user_id: 'u1' }, c.deps);
        assert.strictEqual(c.uploads.length, 0);
        assert.match(c.replies.at(-1)[0], /lançamento mudou/i);
    } finally { c.store.close(); }
});
