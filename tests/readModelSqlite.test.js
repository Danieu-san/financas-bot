const test = require('node:test');
const assert = require('node:assert');

const {
    ensureSqliteReady,
    syncSnapshotToSqlite,
    queryAnalyticalIntentSql,
    queryKpis,
    queryDebts,
    queryGoals,
    queryCashflow,
    queryRecentTransactions,
    queryAlerts
} = require('../src/services/sqliteReadModelService');
const { executeAnalyticalIntent } = require('../src/services/readModelService');
const metrics = require('../src/utils/metrics');

function syncControlledSnapshot() {
    assert.strictEqual(ensureSqliteReady(), true, 'SQLite should be available for read-model tests');
    const synced = syncSnapshotToSqlite({
        saidas: [
            { user_id: 'user-read-a', data: '10/02/2026', descricao: 'lanche', categoria: 'Alimentação', subcategoria: 'PADARIA / LANCHE', valor: 80, month: 1, year: 2026 },
            { user_id: 'user-read-a', data: '11/02/2026', descricao: 'uber', categoria: 'Transporte', subcategoria: 'UBER / 99', valor: 20, month: 1, year: 2026 },
            { user_id: 'user-read-b', data: '10/02/2026', descricao: 'outro usuario', categoria: 'Alimentação', subcategoria: '', valor: 999, month: 1, year: 2026 }
        ],
        cartoes: [
            { user_id: 'user-read-a', source: 'Cartão Nubank - Daniel', data: '12/02/2026', descricao: 'mercado cartão', categoria: 'Alimentação', subcategoria: 'Cartão de Crédito', valor: 100, month: 1, year: 2026 }
        ],
        entradas: [
            { user_id: 'user-read-a', data: '05/02/2026', descricao: 'salário', categoria: 'Salário', valor: 1000, month: 1, year: 2026 },
            { user_id: 'user-read-b', data: '05/02/2026', descricao: 'salário outro', categoria: 'Salário', valor: 5000, month: 1, year: 2026 }
        ],
        metas: [
            { user_id: 'user-read-a', row: ['Reserva', 1000, 250, '25%'] },
            { user_id: 'user-read-b', row: ['Meta outro', 9999, 9999, '100%'] }
        ],
        dividas: [
            { user_id: 'user-read-a', row: ['Financiamento', 'Banco', 'Financiamento', 2000, 1200, 200, 2, 10, '01/01/2026', 10, 'Ativa', '', '', '40%', '10/03/2026'] },
            { user_id: 'user-read-b', row: ['Dívida outro', 'Banco', 'Cartão', 9999, 9999, 999, 10, 10, '01/01/2026', 10, 'Ativa', '', '', '0%', '10/03/2026'] }
        ]
    });
    assert.strictEqual(synced, true);
}

test('sqlite read-model answers common analytical intents scoped by user_id', () => {
    syncControlledSnapshot();

    const total = queryAnalyticalIntentSql('total_gastos_mes', { mes: 1, ano: 2026 }, { userId: 'user-read-a' });
    assert.strictEqual(total.results, 200);
    assert.deepStrictEqual(total.details, { totalSaidas: 100, totalCartoes: 100, mes: 1, ano: 2026 });

    const category = queryAnalyticalIntentSql('total_gastos_categoria_mes', { categoria: 'alimentação', mes: 1, ano: 2026 }, { userId: 'user-read-a' });
    assert.strictEqual(category.results, 180);

    const list = queryAnalyticalIntentSql('listagem_gastos_categoria', { categoria: 'alimentação', mes: 1, ano: 2026 }, { userId: 'user-read-a' });
    assert.strictEqual(list.results.length, 2);
    assert.ok(list.results.every(row => !String(row[1]).includes('outro usuario')));

    const balance = queryAnalyticalIntentSql('saldo_do_mes', { mes: 1, ano: 2026 }, { userId: 'user-read-a' });
    assert.strictEqual(balance.results, 800);

    const minMax = queryAnalyticalIntentSql('maior_menor_gasto', { mes: 1, ano: 2026 }, { userId: 'user-read-a' });
    assert.strictEqual(minMax.results.min[1], 'uber');
    assert.strictEqual(minMax.results.max[1], 'mercado cartão');
});

test('sqlite read-model powers dashboard data without cross-user leakage', () => {
    syncControlledSnapshot();

    const kpis = queryKpis('user-read-a', { month: 1, year: 2026 });
    assert.strictEqual(kpis.entradas, 1000);
    assert.strictEqual(kpis.saidas, 100);
    assert.strictEqual(kpis.cartoes, 100);
    assert.strictEqual(kpis.saldo, 800);
    assert.strictEqual(kpis.debtActiveCount, 1);
    assert.strictEqual(kpis.debtTotal, 1200);

    const debts = queryDebts('user-read-a');
    assert.deepStrictEqual(debts.map(item => item.name), ['Financiamento']);

    const goals = queryGoals('user-read-a');
    assert.deepStrictEqual(goals.map(item => item.name), ['Reserva']);

    const cashflow = queryCashflow('user-read-a', { month: 1, year: 2026 });
    assert.ok(cashflow.some(day => day.date === '05/02/2026' && day.entradas === 1000));

    const recent = queryRecentTransactions('user-read-a', { month: 1, year: 2026 });
    assert.ok(recent.some(item => item.description === 'salário'));
    assert.ok(recent.every(item => !String(item.description).includes('outro')));

    const alerts = queryAlerts('user-read-a', { month: 1, year: 2026 });
    assert.deepStrictEqual(alerts, []);
});

test('analytical read-model reports sqlite source and hit metric', async () => {
    metrics.reset();
    syncControlledSnapshot();

    const result = await executeAnalyticalIntent(
        'total_gastos_mes',
        { mes: 1, ano: 2026 },
        { userId: 'user-read-a' }
    );

    assert.strictEqual(result.source, 'sqlite');
    assert.strictEqual(result.results, 200);

    const snapshot = metrics.getSnapshot();
    assert.strictEqual(snapshot.counters['read_model.sqlite.hit'], 1);
    assert.strictEqual(snapshot.counters['read_model.sqlite.miss'] || 0, 0);
    metrics.reset();
});
