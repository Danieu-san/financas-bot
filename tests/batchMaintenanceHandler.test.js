const test = require('node:test');
const assert = require('node:assert/strict');

const { FinancialWriteLedger } = require('../src/reliability/financialWriteLedger');
const {
    confirmBatchMaintenance,
    parseBatchMaintenanceCommand,
    startBatchMaintenance,
    __test__
} = require('../src/handlers/batchMaintenanceHandler');
const {
    resolveFixtureUser,
    rowHasMarker,
    sanitizeMarker
} = require('../scripts/runBatchMaintenanceE2E');
const { upsertEnvValue } = require('../scripts/configureBatchMaintenanceCanary');

const HEADERS = [
    'Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Responsável',
    'Pagamento', 'Recorrente', 'Observações', 'user_id', 'Conta Financeira'
];
const CARD_HEADERS = [
    'Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela',
    'Mês de Cobrança', 'card_id', 'Cartão', 'Observações', 'user_id'
];

function createContext() {
    const sheets = {
        'Saídas': [
            [...HEADERS],
            ['01/07/2026', 'Uber ida', 'Outros', '', 20, 'Daniel', 'PIX', 'Não', '', 'u1', 'Nubank'],
            ['02/07/2026', 'Mercado', 'Alimentação', 'Supermercado', 100, 'Daniel', 'PIX', 'Não', '', 'u1', 'Nubank']
        ],
        'Lançamentos Cartão': [
            [...CARD_HEADERS],
            ['03/07/2026', 'Uber volta', 'Outros', 30, '1/1', 'Julho de 2026', 'card-1', 'Nubank', '', 'u1']
        ]
    };
    const states = new Map();
    const replies = [];
    const updates = [];
    const ledger = new FinancialWriteLedger({ dbPath: ':memory:' });
    const stateManager = {
        setState(key, value) { states.set(key, value); },
        getState(key) { return states.get(key); },
        deleteState(key) { states.delete(key); },
        clearState(key) { states.delete(key); }
    };
    const deps = {
        stateManager,
        readDataFromSheet: async sheetName => sheets[sheetName].map(row => [...row]),
        updateRowInSheet: async (range, row, options) => {
            const match = range.match(/^'(.+)'!A(\d+):[A-Z]+\d+$/);
            assert.ok(match, range);
            const sheetName = match[1].replace(/''/g, "'");
            const rowIndex = Number(match[2]) - 1;
            sheets[sheetName][rowIndex] = [...row];
            updates.push({ range, row: [...row], options });
            return { success: true };
        },
        getWriteLedger: () => ledger,
        getPolicy: () => ({ mode: 'canary', allowed: true, reason: 'test' }),
        markReadModelDirty: reason => { deps.dirtyReason = reason; }
    };
    const msg = body => ({
        body,
        from: 'sender-1',
        id: { _serialized: 'message-1' },
        reply: async text => { replies.push(text); }
    });
    return { sheets, states, replies, updates, ledger, deps, msg };
}

test.afterEach(() => __test__.clearPendingBatches());

test('6A parser recognizes recategorization and safe text correction but blocks critical batch fields', () => {
    assert.deepStrictEqual(
        parseBatchMaintenanceCommand('categorize todos os gastos com uber como Transporte / Aplicativo'),
        {
            kind: 'command',
            operation: 'expense.recategorize_many',
            filter: { descriptionContains: 'uber' },
            patch: { category: 'Transporte', subcategory: 'Aplicativo' }
        }
    );
    assert.deepStrictEqual(
        parseBatchMaintenanceCommand('corrija a descrição de todos os gastos com mercado para Supermercado'),
        {
            kind: 'command',
            operation: 'expense.correct_many',
            filter: { descriptionContains: 'mercado' },
            patch: { description: 'Supermercado' }
        }
    );
    assert.deepStrictEqual(
        parseBatchMaintenanceCommand('corrija o valor de todos os gastos com uber para 10'),
        { kind: 'blocked', field: 'amount' }
    );
    assert.strictEqual(parseBatchMaintenanceCommand('gastei 20 com uber'), null);
});

test('6A start sends mandatory preview and persists only opaque state metadata', async () => {
    const context = createContext();
    try {
        const handled = await startBatchMaintenance(
            context.msg('categorize todos os gastos com uber como Transporte / Aplicativo'),
            { user_id: 'u1' },
            context.deps
        );
        assert.strictEqual(handled, true);
        assert.strictEqual(context.replies.length, 1);
        assert.match(context.replies[0], /2 itens/);
        assert.match(context.replies[0], /Uber ida/);
        assert.match(context.replies[0], /Outros.*Transporte/);
        assert.match(context.replies[0], /Responda `sim`/);

        const state = context.states.get('sender-1');
        assert.strictEqual(state.action, 'confirming_batch_maintenance');
        assert.deepStrictEqual(Object.keys(state.data).sort(), ['count', 'operationKey']);
        assert.doesNotMatch(JSON.stringify(state), /Uber|Transporte|u1/);
    } finally {
        context.ledger.close();
    }
});

test('6A start handles an empty batch without creating confirmation state', async () => {
    const context = createContext();
    try {
        await startBatchMaintenance(
            context.msg('categorize todos os gastos com táxi como Transporte'),
            { user_id: 'u1' },
            context.deps
        );
        assert.match(context.replies[0], /não encontrei/i);
        assert.strictEqual(context.states.size, 0);
        assert.strictEqual(context.updates.length, 0);
    } finally {
        context.ledger.close();
    }
});

test('6A confirmation cancellation clears pending state without writes', async () => {
    const context = createContext();
    try {
        await startBatchMaintenance(
            context.msg('categorize todos os gastos com uber como Transporte'),
            { user_id: 'u1' },
            context.deps
        );
        await confirmBatchMaintenance(context.msg('não'), { user_id: 'u1' }, context.deps);
        assert.strictEqual(context.updates.length, 0);
        assert.strictEqual(context.states.size, 0);
        assert.match(context.replies.at(-1), /cancelada/i);
    } finally {
        context.ledger.close();
    }
});

test('6A confirmation revalidates rows, writes the complete row and marks the read model dirty', async () => {
    const context = createContext();
    try {
        await startBatchMaintenance(
            context.msg('categorize todos os gastos com uber como Transporte / Aplicativo'),
            { user_id: 'u1' },
            context.deps
        );
        await confirmBatchMaintenance(context.msg('sim'), { user_id: 'u1' }, context.deps);
        assert.strictEqual(context.updates.length, 2);
        assert.ok(context.updates.every(update => update.options.operationKey));
        assert.strictEqual(context.sheets['Saídas'][1][2], 'Transporte');
        assert.strictEqual(context.sheets['Saídas'][1][3], 'Aplicativo');
        assert.strictEqual(context.sheets['Lançamentos Cartão'][1][2], 'Transporte');
        assert.strictEqual(context.deps.dirtyReason, 'batch_maintenance_write');
        assert.strictEqual(context.states.size, 0);
        assert.match(context.replies.at(-1), /2 itens atualizados/i);
    } finally {
        context.ledger.close();
    }
});

test('6A stale WhatsApp preview fails closed and asks for a new preview', async () => {
    const context = createContext();
    try {
        await startBatchMaintenance(
            context.msg('categorize todos os gastos com uber como Transporte'),
            { user_id: 'u1' },
            context.deps
        );
        context.sheets['Saídas'][1][1] = 'Uber alterado';
        await confirmBatchMaintenance(context.msg('sim'), { user_id: 'u1' }, context.deps);
        assert.strictEqual(context.updates.length, 0);
        assert.strictEqual(context.states.size, 0);
        assert.match(context.replies.at(-1), /mudou depois do preview/i);
    } finally {
        context.ledger.close();
    }
});

test('6A real E2E helpers require an exact safe marker and one active user', () => {
    assert.strictEqual(
        sanitizeMarker('TESTE_APAGAR_BATCH_6A_20260714060000'),
        'TESTE_APAGAR_BATCH_6A_20260714060000'
    );
    assert.throws(() => sanitizeMarker('produção'));
    assert.strictEqual(rowHasMarker(['Uber', 'TESTE_APAGAR_BATCH_6A_X'], 'TESTE_APAGAR_BATCH_6A_X'), true);
    assert.strictEqual(resolveFixtureUser([
        { user_id: 'u1', display_name: 'Daniel', status: 'ACTIVE' },
        { user_id: 'u2', display_name: 'Daniel', status: 'PENDING' }
    ], 'Daniel').user_id, 'u1');
    assert.throws(() => resolveFixtureUser([
        { user_id: 'u1', display_name: 'Daniel', status: 'ACTIVE' },
        { user_id: 'u2', display_name: 'Daniel', status: 'ACTIVE' }
    ], 'Daniel'));
    assert.strictEqual(
        upsertEnvValue('BATCH_MAINTENANCE_MODE=off\nKEEP=yes\n', 'BATCH_MAINTENANCE_MODE', 'canary'),
        'BATCH_MAINTENANCE_MODE=canary\nKEEP=yes\n'
    );
});
