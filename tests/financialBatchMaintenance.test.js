const test = require('node:test');
const assert = require('node:assert/strict');

const { FinancialWriteLedger } = require('../src/reliability/financialWriteLedger');
const {
    BATCH_OPERATIONS,
    buildBatchMaintenancePolicy,
    buildBatchMaintenancePreview,
    executeBatchMaintenance,
    selectBatchCandidates,
    validateBatchPatch,
    toPublicBatchPreview
} = require('../src/maintenance/financialBatchMaintenanceService');

const EXPENSE_HEADERS = [
    'Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Responsável',
    'Pagamento', 'Recorrente', 'Observações', 'user_id', 'Conta Financeira'
];
const CARD_HEADERS = [
    'Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela',
    'Mês de Cobrança', 'card_id', 'Cartão', 'Observações', 'user_id'
];

function datasets() {
    return {
        'Saídas': [
            EXPENSE_HEADERS,
            ['01/07/2026', 'Uber ida', 'Outros', '', 20, 'Daniel', 'PIX', 'Não', '', 'u1', 'Nubank'],
            ['02/07/2026', 'Uber volta', 'Outros', '', 30, 'Daniel', 'PIX', 'Não', '', 'u1', 'Nubank'],
            ['03/07/2026', 'Uber terceiro', 'Outros', '', 40, 'Outra pessoa', 'PIX', 'Não', '', 'u2', 'Nubank'],
            ['04/07/2026', 'Mercado', 'Alimentação', 'Supermercado', 100, 'Daniel', 'PIX', 'Não', '', 'u1', 'Nubank']
        ],
        'Lançamentos Cartão': [
            CARD_HEADERS,
            ['05/07/2026', 'Uber crédito', 'Outros', 25, '1/1', 'Julho de 2026', 'card-1', 'Nubank', '', 'u1']
        ]
    };
}

function buildPreview(overrides = {}) {
    const selected = selectBatchCandidates({
        sheetDataByName: datasets(),
        userId: 'u1',
        operation: BATCH_OPERATIONS.RECATEGORIZE_EXPENSES,
        filter: { descriptionContains: 'uber' }
    });
    return buildBatchMaintenancePreview({
        operation: BATCH_OPERATIONS.RECATEGORIZE_EXPENSES,
        userId: 'u1',
        messageId: 'message-1',
        candidates: selected.candidates,
        patch: { category: 'Transporte', subcategory: 'Aplicativo' },
        ...overrides
    });
}

function mutableExecutor(preview, { failApplyAt = -1, failRollback = false } = {}) {
    const rows = new Map(preview.items.map(item => [
        `${item.sheetName}:${item.rowIndex}`,
        [...item.beforeRow]
    ]));
    const calls = [];
    return {
        rows,
        calls,
        readCurrentRow: async ({ sheetName, rowIndex }) => {
            const row = rows.get(`${sheetName}:${rowIndex}`);
            return row ? [...row] : null;
        },
        updateRow: async ({ sheetName, rowIndex, row, phase }) => {
            calls.push({ sheetName, rowIndex, row: [...row], phase });
            if (phase === 'apply' && calls.filter(call => call.phase === 'apply').length - 1 === failApplyAt) {
                throw new Error('apply failed');
            }
            if (phase === 'rollback' && failRollback) throw new Error('rollback failed');
            rows.set(`${sheetName}:${rowIndex}`, [...row]);
            return { success: true };
        }
    };
}

test('6A only permits non-critical batch fields and rejects formula-like content', () => {
    assert.deepStrictEqual(
        validateBatchPatch(BATCH_OPERATIONS.RECATEGORIZE_EXPENSES, {
            category: 'Transporte',
            subcategory: 'Aplicativo'
        }),
        { category: 'Transporte', subcategory: 'Aplicativo' }
    );
    assert.throws(
        () => validateBatchPatch(BATCH_OPERATIONS.RECATEGORIZE_EXPENSES, { amount: 10, category: 'Transporte' }),
        error => error.code === 'BATCH_CRITICAL_FIELD'
    );
    assert.throws(
        () => validateBatchPatch(BATCH_OPERATIONS.CORRECT_EXPENSES, { description: '=IMPORTXML("x")' }),
        error => error.code === 'BATCH_FORMULA_FORBIDDEN'
    );
});

test('6A rollout policy defaults off and canary requires an exact user allowlist', () => {
    assert.deepStrictEqual(buildBatchMaintenancePolicy({}, 'u1'), {
        mode: 'off', allowed: false, reason: 'mode_off'
    });
    assert.deepStrictEqual(buildBatchMaintenancePolicy({
        BATCH_MAINTENANCE_MODE: 'canary',
        BATCH_MAINTENANCE_USER_IDS: 'u1,u2'
    }, 'u1'), {
        mode: 'canary', allowed: true, reason: 'canary_allowlisted'
    });
    assert.strictEqual(buildBatchMaintenancePolicy({
        BATCH_MAINTENANCE_MODE: 'canary',
        BATCH_MAINTENANCE_USER_IDS: 'u10'
    }, 'u1').allowed, false);
    assert.strictEqual(buildBatchMaintenancePolicy({ BATCH_MAINTENANCE_MODE: 'invalid' }, 'u1').mode, 'off');
});

test('6A selector requires a narrowing filter and scopes exact user rows across expense sheets', () => {
    assert.throws(
        () => selectBatchCandidates({
            sheetDataByName: datasets(), userId: 'u1',
            operation: BATCH_OPERATIONS.RECATEGORIZE_EXPENSES, filter: {}
        }),
        error => error.code === 'BATCH_FILTER_REQUIRED'
    );
    const selected = selectBatchCandidates({
        sheetDataByName: datasets(),
        userId: 'u1',
        operation: BATCH_OPERATIONS.RECATEGORIZE_EXPENSES,
        filter: { descriptionContains: 'uber' }
    });
    assert.strictEqual(selected.candidates.length, 3);
    assert.deepStrictEqual(selected.countsBySheet, { 'Saídas': 2, 'Lançamentos Cartão': 1 });
    assert.ok(selected.candidates.every(item => item.row[item.userIdIndex] === 'u1'));
});

test('6A selector fails closed instead of truncating a batch above the limit', () => {
    assert.throws(
        () => selectBatchCandidates({
            sheetDataByName: datasets(),
            userId: 'u1',
            operation: BATCH_OPERATIONS.RECATEGORIZE_EXPENSES,
            filter: { currentCategory: 'Outros' },
            maxItems: 2
        }),
        error => error.code === 'BATCH_LIMIT_EXCEEDED' && error.details.count === 3
    );
});

test('6A preview contains before/after impact but public form excludes internal identity and raw rows', () => {
    const preview = buildPreview();
    assert.strictEqual(preview.items.length, 3);
    assert.strictEqual(preview.totalAmountCents, 7500);
    assert.strictEqual(preview.confirmationRequired, true);
    assert.strictEqual(preview.criticalFields.length, 0);
    assert.ok(preview.operationKey);

    const publicPreview = toPublicBatchPreview(preview);
    const serialized = JSON.stringify(publicPreview);
    assert.doesNotMatch(serialized, /\bu1\b|operationKey|beforeRow|afterRow|checksum|userId/i);
    assert.match(serialized, /Uber ida/);
    assert.match(serialized, /Transporte/);
});

test('6A cancellation performs no write and creates no receipt', async () => {
    const preview = buildPreview();
    const ledger = new FinancialWriteLedger({ dbPath: ':memory:' });
    const executor = mutableExecutor(preview);
    try {
        const result = await executeBatchMaintenance({
            preview,
            confirmed: false,
            writeLedger: ledger,
            readCurrentRow: executor.readCurrentRow,
            updateRow: executor.updateRow
        });
        assert.deepStrictEqual(result, { status: 'cancelled', writesPerformed: 0 });
        assert.strictEqual(executor.calls.length, 0);
        assert.strictEqual(ledger.getOperation(preview.operationKey), null);
    } finally {
        ledger.close();
    }
});

test('6A confirmed execution writes every selected row once and replay is idempotent', async () => {
    const preview = buildPreview();
    const ledger = new FinancialWriteLedger({ dbPath: ':memory:' });
    const executor = mutableExecutor(preview);
    try {
        const first = await executeBatchMaintenance({
            preview, confirmed: true, writeLedger: ledger,
            readCurrentRow: executor.readCurrentRow, updateRow: executor.updateRow
        });
        assert.deepStrictEqual(first, { status: 'committed', updated: 3, replayed: false });
        assert.strictEqual(executor.calls.filter(call => call.phase === 'apply').length, 3);
        assert.ok([...executor.rows.values()].every(row => row[2] === 'Transporte'));

        const second = await executeBatchMaintenance({
            preview, confirmed: true, writeLedger: ledger,
            readCurrentRow: executor.readCurrentRow, updateRow: executor.updateRow
        });
        assert.deepStrictEqual(second, { status: 'committed', updated: 3, replayed: true });
        assert.strictEqual(executor.calls.filter(call => call.phase === 'apply').length, 3);
    } finally {
        ledger.close();
    }
});

test('6A stale preview blocks before writing when a selected row changed', async () => {
    const preview = buildPreview();
    const ledger = new FinancialWriteLedger({ dbPath: ':memory:' });
    const executor = mutableExecutor(preview);
    executor.rows.get(`${preview.items[0].sheetName}:${preview.items[0].rowIndex}`)[1] = 'alterado fora do preview';
    try {
        await assert.rejects(
            executeBatchMaintenance({
                preview, confirmed: true, writeLedger: ledger,
                readCurrentRow: executor.readCurrentRow, updateRow: executor.updateRow
            }),
            error => error.code === 'BATCH_PREVIEW_STALE'
        );
        assert.strictEqual(executor.calls.length, 0);
    } finally {
        ledger.close();
    }
});

test('6A partial failure restores applied rows and records a logical rollback', async () => {
    const preview = buildPreview();
    const ledger = new FinancialWriteLedger({ dbPath: ':memory:' });
    const executor = mutableExecutor(preview, { failApplyAt: 1 });
    try {
        await assert.rejects(
            executeBatchMaintenance({
                preview, confirmed: true, writeLedger: ledger,
                readCurrentRow: executor.readCurrentRow, updateRow: executor.updateRow
            }),
            error => error.code === 'BATCH_WRITE_ROLLED_BACK'
        );
        assert.deepStrictEqual(
            executor.rows.get(`${preview.items[0].sheetName}:${preview.items[0].rowIndex}`),
            preview.items[0].beforeRow
        );
        assert.strictEqual(ledger.getOperation(preview.operationKey).status, 'failed');
    } finally {
        ledger.close();
    }
});

test('6A rollback failure becomes uncertain and never reports success', async () => {
    const preview = buildPreview();
    const ledger = new FinancialWriteLedger({ dbPath: ':memory:' });
    const executor = mutableExecutor(preview, { failApplyAt: 1, failRollback: true });
    try {
        await assert.rejects(
            executeBatchMaintenance({
                preview, confirmed: true, writeLedger: ledger,
                readCurrentRow: executor.readCurrentRow, updateRow: executor.updateRow
            }),
            error => error.code === 'BATCH_WRITE_UNCERTAIN'
        );
        assert.strictEqual(ledger.getOperation(preview.operationKey).status, 'uncertain');
    } finally {
        ledger.close();
    }
});
