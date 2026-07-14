const test = require('node:test');
const assert = require('node:assert/strict');

const {
    FinancialUndoStore,
    FinancialUndoService,
    buildFinancialUndoPolicy,
    fingerprintRow
} = require('../src/undo/financialUndoService');

function createHarness(overrides = {}) {
    const store = new FinancialUndoStore({ dbPath: ':memory:' });
    const rows = [
        ['Data', 'Descrição', 'Categoria'],
        ['14/07/2026', 'TESTE_APAGAR_UNDO_6E_ABC', 'Outros']
    ];
    const deleted = [];
    const service = new FinancialUndoService({
        store,
        env: { FINANCIAL_UNDO_MODE: 'on' },
        readRows: async () => rows.map(row => [...row]),
        deleteRow: async input => {
            deleted.push(input);
            rows.splice(input.rowIndex, 1);
            return { success: true, status: 'committed' };
        },
        isReconciled: async () => false,
        ...overrides
    });
    return { store, service, rows, deleted };
}

function register(service, overrides = {}) {
    const row = ['14/07/2026', 'TESTE_APAGAR_UNDO_6E_ABC', 'Outros'];
    return service.registerMarkerAppend({
        userId: 'user-private-1',
        operationKey: 'message-private-1:append',
        sheetName: 'Saídas',
        marker: 'TESTE_APAGAR_UNDO_6E_ABC',
        rowFingerprint: fingerprintRow(row),
        ...overrides
    });
}

test('financial undo policy fails closed and restricts canary to one allowlisted user', () => {
    assert.deepEqual(buildFinancialUndoPolicy({}, 'u1'), { mode: 'off', allowed: false, reason: 'mode_off' });
    assert.equal(buildFinancialUndoPolicy({ FINANCIAL_UNDO_MODE: 'canary', FINANCIAL_UNDO_USER_IDS: 'u1' }, 'u1').allowed, true);
    assert.equal(buildFinancialUndoPolicy({ FINANCIAL_UNDO_MODE: 'canary', FINANCIAL_UNDO_USER_IDS: 'u1' }, 'u2').reason, 'user_not_allowlisted');
});

test('structured marker-only receipt is idempotent and public audit is sanitized', () => {
    const { store, service } = createHarness();
    const first = register(service);
    const replay = register(service);
    assert.equal(first.receiptId, replay.receiptId);
    assert.equal(replay.replayed, true);
    assert.equal(first.operationType, 'sheet.append.marker_only');
    assert.throws(() => register(service, {
        marker: 'TESTE_APAGAR_UNDO_6E_DIFFERENT',
        rowFingerprint: fingerprintRow(['different'])
    }), error => error.code === 'FINANCIAL_UNDO_RECEIPT_CONFLICT');

    const serialized = JSON.stringify(service.listAuditHistory({ userId: 'user-private-1' }));
    assert.doesNotMatch(serialized, /user-private|message-private|TESTE_APAGAR|14\/07\/2026|Outros/);
    store.close();
});

test('undo deletes exactly one matching marker and double undo becomes an audited replay', async () => {
    const { store, service, rows, deleted } = createHarness();
    const receipt = register(service);
    const first = await service.undo({ userId: 'user-private-1', receiptId: receipt.receiptId });
    const replay = await service.undo({ userId: 'user-private-1', receiptId: receipt.receiptId });

    assert.equal(first.status, 'undone');
    assert.equal(replay.status, 'undone');
    assert.equal(replay.replayed, true);
    assert.equal(deleted.length, 1);
    assert.equal(deleted[0].rowIndex, 1);
    assert.equal(rows.length, 1);
    assert.deepEqual(service.listAuditHistory({ userId: 'user-private-1' }).map(item => item.outcome), ['replayed', 'undone', 'registered']);
    store.close();
});

test('undo refuses a changed, absent or duplicated marker without deleting a row', async () => {
    for (const mutation of ['changed', 'absent', 'duplicated']) {
        const { store, service, rows, deleted } = createHarness();
        const receipt = register(service, { operationKey: `private-${mutation}` });
        if (mutation === 'changed') rows[1][2] = 'Categoria alterada';
        if (mutation === 'absent') rows.splice(1, 1);
        if (mutation === 'duplicated') rows.push([...rows[1]]);
        const result = await service.undo({ userId: 'user-private-1', receiptId: receipt.receiptId });
        assert.equal(result.status, 'blocked');
        assert.equal(result.reason, mutation === 'duplicated' ? 'multiple_exact_matches' : 'exact_match_not_found');
        assert.equal(deleted.length, 0);
        store.close();
    }
});

test('undo refuses an item that has already been reconciled', async () => {
    const { store, service, deleted } = createHarness({ isReconciled: async () => true });
    const receipt = register(service);
    const result = await service.undo({ userId: 'user-private-1', receiptId: receipt.receiptId });
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'already_reconciled');
    assert.equal(deleted.length, 0);
    assert.equal(service.listAuditHistory({ userId: 'user-private-1' })[0].outcome, 'blocked');
    store.close();
});
