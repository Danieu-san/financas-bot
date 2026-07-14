const test = require('node:test');
const assert = require('node:assert/strict');

const {
    FinancialReceiptStore,
    buildFinancialReceiptPolicy,
    buildStableEventKey,
    findLatestFinancialEvent,
    validateReceiptMedia
} = require('../src/receipts/financialReceiptService');
const {
    deleteFinancialReceipt,
    downloadFinancialReceipt,
    uploadFinancialReceipt
} = require('../src/receipts/financialReceiptDriveService');

const sheets = {
    'Saídas': [
        ['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Responsável', 'Pagamento', 'Recorrente', 'Obs', 'user_id'],
        ['13/07/2026', 'Mercado antigo', 'Alimentação', '', 50, 'Daniel', 'PIX', 'Não', '', 'u1'],
        ['14/07/2026', 'Mercado novo', 'Alimentação', '', 60, 'Daniel', 'PIX', 'Não', '', 'u1'],
        ['15/07/2026', 'Outro usuário', 'Outros', '', 70, 'Pessoa', 'PIX', 'Não', '', 'u2']
    ],
    'Entradas': [
        ['Data', 'Descrição', 'Categoria', 'Valor', 'Responsável', 'Recebimento', 'Recorrente', 'Obs', 'user_id'],
        ['12/07/2026', 'Reembolso', 'Outros', 20, 'Daniel', 'PIX', 'Não', '', 'u1']
    ]
};

test('6C rollout fails closed and canary requires exact user id', () => {
    assert.strictEqual(buildFinancialReceiptPolicy({}, 'u1').allowed, false);
    assert.strictEqual(buildFinancialReceiptPolicy({ FINANCIAL_RECEIPTS_MODE: 'invalid' }, 'u1').mode, 'off');
    assert.strictEqual(buildFinancialReceiptPolicy({
        FINANCIAL_RECEIPTS_MODE: 'canary', FINANCIAL_RECEIPTS_USER_IDS: 'u1'
    }, 'u1').allowed, true);
    assert.strictEqual(buildFinancialReceiptPolicy({
        FINANCIAL_RECEIPTS_MODE: 'canary', FINANCIAL_RECEIPTS_USER_IDS: 'u10'
    }, 'u1').allowed, false);
});

test('6C resolves only an existing event in exact user scope', () => {
    const event = findLatestFinancialEvent({ sheetDataByName: sheets, userId: 'u1', kind: 'expense' });
    assert.strictEqual(event.description, 'Mercado novo');
    assert.strictEqual(event.userId, 'u1');
    assert.notStrictEqual(event.eventKey, buildStableEventKey({ ...event, userId: 'u2' }));
    assert.strictEqual(findLatestFinancialEvent({ sheetDataByName: sheets, userId: 'missing', kind: 'expense' }), null);
});

test('6C validates bytes and rejects unsupported or disguised receipt media', () => {
    const pdf = Buffer.from('%PDF-1.7\nsynthetic');
    assert.strictEqual(validateReceiptMedia({ mimetype: 'application/pdf', data: pdf.toString('base64') }).buffer.length, pdf.length);
    assert.throws(() => validateReceiptMedia({ mimetype: 'text/plain', data: Buffer.from('x').toString('base64') }), /RECEIPT_TYPE_FORBIDDEN/);
    assert.throws(() => validateReceiptMedia({ mimetype: 'image/png', data: Buffer.from('not-png').toString('base64') }), /RECEIPT_SIGNATURE_INVALID/);
});

test('6C store is idempotent by event and hash and public view hides Drive ids', () => {
    const store = new FinancialReceiptStore({ dbPath: ':memory:' });
    try {
        const first = store.attach({
            userId: 'u1', eventKey: 'event-a', eventType: 'expense', driveFileId: 'private-drive-id',
            contentHash: 'a'.repeat(64), mimeType: 'application/pdf', fileName: 'receipt.pdf', permissionScope: 'private_owner_drive'
        });
        const replay = store.attach({
            userId: 'u1', eventKey: 'event-a', eventType: 'expense', driveFileId: 'other-id',
            contentHash: 'a'.repeat(64), mimeType: 'application/pdf', fileName: 'receipt.pdf', permissionScope: 'private_owner_drive'
        });
        assert.strictEqual(replay.receiptId, first.receiptId);
        assert.strictEqual(replay.replayed, true);
        const publicReceipt = store.findPublicByEvent({ userId: 'u1', eventKey: 'event-a' });
        assert.ok(publicReceipt);
        assert.strictEqual(JSON.stringify(publicReceipt).includes('private-drive-id'), false);
        assert.strictEqual(store.findPublicByEvent({ userId: 'u2', eventKey: 'event-a' }), null);
    } finally {
        store.close();
    }
});

test('6C Drive adapter creates a private app folder, uploads, downloads and deletes exact file', async () => {
    const calls = [];
    const driveClient = { files: {
        list: async input => { calls.push(['list', input]); return { data: { files: [] } }; },
        create: async input => {
            calls.push(['create', input]);
            return input.requestBody.mimeType === 'application/vnd.google-apps.folder'
                ? { data: { id: 'folder-private' } }
                : { data: { id: 'file-private' } };
        },
        get: async () => ({ data: Buffer.from('%PDF-download') }),
        delete: async input => { calls.push(['delete', input]); }
    } };
    const uploaded = await uploadFinancialReceipt({
        userId: 'u1', buffer: Buffer.from('%PDF-upload'), mimeType: 'application/pdf',
        fileName: 'receipt.pdf', driveClient
    });
    assert.deepStrictEqual(uploaded, { driveFileId: 'file-private', permissionScope: 'private_owner_drive' });
    assert.deepStrictEqual(await downloadFinancialReceipt({ userId: 'u1', driveFileId: 'file-private', driveClient }), Buffer.from('%PDF-download'));
    assert.strictEqual(await deleteFinancialReceipt({ userId: 'u1', driveFileId: 'file-private', driveClient }), true);
    assert.ok(calls.some(([name, input]) => name === 'create' && input.requestBody.parents?.[0] === 'folder-private'));
});
