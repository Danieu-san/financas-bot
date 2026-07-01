const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');

const {
    ensureSqliteReady,
    syncSnapshotToSqlite,
    queryFinancialEventsPublicRows
} = require('../src/services/sqliteReadModelService');
const { runSafeReadonlySql, validateSafeReadonlySql } = require('../src/agent/safeReadonlySql');
const {
    listRecentTransactions,
    queryFinancialPlanTool,
    getDashboardSnapshotTool,
    explainMetricTool
} = require('../src/agent/financialAgentTools');
const { verifyAgentAnswer } = require('../src/agent/resultVerifier');
const { invokeFinancialAgent } = require('../src/agent/financialAgent');
const {
    buildContextPacket,
    composeContextualFinancialAnswer,
    selectVerifiedContextualAnswer,
    isContextualAnalystEnabled,
    __test__: contextualAnalystTest
} = require('../src/agent/contextualFinancialAnalyst');
const { __test__: readModelTest } = require('../src/services/readModelService');
const {
    buildPlannerPrompt,
    isLlmPlannerEnabled,
    normalizePlannerPlan,
    __test__: plannerTest
} = require('../src/agent/financialAgentPlanner');
const { __test__: messageHandlerTest } = require('../src/handlers/messageHandler');
const {
    CanonicalLedgerShadowStore
} = require('../src/ledger/canonicalLedgerShadowStore');

test('LangGraph financial agent tolerates small typos in recent transaction concepts', async () => {
    syncAgentSnapshot();
    for (const message of [
        'qual foi meu ultim lancameto?',
        'qual foi minha ultma transacao?',
        'detalhe meu ultmo movimento'
    ]) {
        const result = await invokeFinancialAgent({
            message,
            userIds: ['agent-daniel'],
            personByUserId: { 'agent-daniel': 'Daniel' },
            currentDate: '20/06/2026',
            mode: 'answer'
        });

        assert.strictEqual(result.action, 'answer', JSON.stringify(result));
        assert.strictEqual(result.plan.tool, 'list_recent_transactions');
        assert.strictEqual(result.verified.ok, true);
    }
});

test('LangGraph financial agent lists goals from the scoped read model', async () => {
    syncAgentSnapshot();
    const result = await invokeFinancialAgent({
        message: 'liste minhas metas',
        userIds: ['agent-daniel', 'agent-thais'],
        personByUserId: { 'agent-daniel': 'Daniel', 'agent-thais': 'Thais' },
        currentDate: '20/06/2026',
        financialQueryPlan: {
            kind: 'financial_query',
            domain: 'goals',
            operation: 'list',
            filters: { period: { type: 'all_time' }, scope: 'family' },
            timeBasis: 'transaction_date'
        },
        mode: 'answer'
    });

    assert.strictEqual(result.action, 'answer', JSON.stringify(result));
    assert.strictEqual(result.verified.ok, true);
    assert.match(result.answer, /Reserva/i);
    assert.match(result.answer, /R\$\s*1\.200,00/i);
});

test('LangGraph financial agent uses the authorized family budget configuration', async () => {
    assert.strictEqual(ensureSqliteReady(), true);
    assert.strictEqual(syncSnapshotToSqlite({
        saidas: [
            { user_id: 'agent-daniel', data: '10/06/2026', descricao: 'mercado', categoria: 'Alimentação', subcategoria: '', valor: 100, month: 5, year: 2026 },
            { user_id: 'agent-thais', data: '12/06/2026', descricao: 'farmácia', categoria: 'Saúde', subcategoria: '', valor: 50, month: 5, year: 2026 }
        ],
        cartoes: [], entradas: [], transferencias: [], cartoesConfig: [], metas: [], movimentacoesMetas: [], dividas: [], contas: [],
        userSettings: [
            { user_id: 'agent-daniel', monthly_budget_enabled: 'SIM', monthly_budget_amount: '1000', monthly_budget_scope: 'family', monthly_budget_cycle_start_day: '1' }
        ]
    }), true);
    const result = await invokeFinancialAgent({
        message: 'como está meu orçamento do ciclo?',
        userIds: ['agent-daniel', 'agent-thais'],
        personByUserId: { 'agent-daniel': 'Daniel', 'agent-thais': 'Thais' },
        currentDate: '20/06/2026',
        financialQueryPlan: {
            kind: 'financial_query',
            domain: 'budget',
            operation: 'detail',
            filters: { period: { type: 'month', month: 5, year: 2026 }, scope: 'family' },
            timeBasis: 'budget_cycle'
        },
        mode: 'answer'
    });

    assert.strictEqual(result.action, 'answer', JSON.stringify(result));
    assert.strictEqual(result.verified.ok, true);
    assert.doesNotMatch(result.answer, /desativado/i);
    assert.match(result.answer, /R\$\s*150,00/i);
});

test('LangGraph financial agent answers paid bill detection with status and realized value', async () => {
    assert.strictEqual(ensureSqliteReady(), true);
    assert.strictEqual(syncSnapshotToSqlite({
        saidas: [
            { user_id: 'agent-daniel', data: '07/06/2026', descricao: 'Pagamento aluguel', categoria: 'Moradia', subcategoria: 'ALUGUEL', valor: 932.97, month: 5, year: 2026 }
        ],
        cartoes: [], entradas: [], transferencias: [], userSettings: [], cartoesConfig: [], metas: [], movimentacoesMetas: [], dividas: [],
        contas: [
            { user_id: 'agent-daniel', headers: ['Nome da Conta', 'Dia do Vencimento', 'Observações', 'user_id', 'Nome Amigável', 'Categoria', 'Subcategoria', 'Valor Esperado', 'Regra Ativa'], row: ['ALUGUEL-REAL', '7', '', 'agent-daniel', 'Aluguel', 'Moradia', 'ALUGUEL', '', 'SIM'] }
        ]
    }), true);
    const result = await invokeFinancialAgent({
        message: 'já paguei aluguel esse mês?',
        userIds: ['agent-daniel'],
        personByUserId: { 'agent-daniel': 'Daniel' },
        currentDate: '20/06/2026',
        financialQueryPlan: {
            kind: 'financial_query',
            domain: 'bills',
            operation: 'detect',
            filters: { period: { type: 'month', month: 5, year: 2026 }, scope: 'personal', merchant: 'aluguel' },
            timeBasis: 'due_date'
        },
        mode: 'answer'
    });

    assert.strictEqual(result.action, 'answer', JSON.stringify(result));
    assert.strictEqual(result.verified.ok, true);
    assert.match(result.answer, /^Sim\./i);
    assert.match(result.answer, /R\$\s*932,97/i);
    assert.doesNotMatch(result.answer, /R\$\s*0,00/i);
});

function syncAgentSnapshot() {
    assert.strictEqual(ensureSqliteReady(), true);
    const synced = syncSnapshotToSqlite({
        saidas: [
            { user_id: 'agent-daniel', data: '01/06/2026', descricao: 'mercado', categoria: 'Alimentação', subcategoria: '', valor: 30, month: 5, year: 2026 },
            { user_id: 'agent-outsider', data: '04/06/2026', descricao: 'gasto outro usuario', categoria: 'Outros', subcategoria: '', valor: 9999, month: 5, year: 2026 }
        ],
        cartoes: [
            { user_id: 'agent-thais', source: 'Cartão Nubank - Thais', card_id: 'nubank-thais', cartao: 'Cartão Nubank - Thais', data: '05/06/2026', descricao: 'restaurante', categoria: 'Alimentação', subcategoria: 'Cartão de Crédito', valor: 75, parcela: '1/1', month: 5, year: 2026 }
        ],
        entradas: [
            { user_id: 'agent-daniel', data: '03/06/2026', descricao: 'salário', categoria: 'Salário', valor: 5000, recebimento: 'Conta Corrente', recorrente: 'Sim', month: 5, year: 2026 }
        ],
        transferencias: [
            { user_id: 'agent-daniel', data: '04/06/2026', descricao: 'resgate caixinha', valor: 100, origem: 'Caixinha', destino: 'Conta', metodo: 'PIX', observacoes: '', status: 'Movimentação de reserva/investimento', month: 5, year: 2026 }
        ],
        userSettings: [],
        cartoesConfig: [],
        metas: [
            { user_id: 'agent-daniel', row: ['Reserva', '10000', '1200', '12%', '', '31/12/2026', 'Em andamento', 'Alta', 'agent-daniel', 'family', ''] }
        ],
        movimentacoesMetas: [],
        dividas: [
            { user_id: 'agent-daniel', row: ['Financiamento', 'Banco', 'Financiamento', '200000', '150000', '2000', '1%', 10, '01/01/2026', 120, 'Ativa', '', '', '25%', '10/07/2026'] }
        ],
        contas: [
            { user_id: 'agent-daniel', headers: ['Nome da Conta', 'Dia do Vencimento', 'Observações', 'user_id', 'Nome Amigável', 'Categoria', 'Subcategoria', 'Valor Esperado', 'Regra Ativa'], row: ['NET', '10', '', 'agent-daniel', 'Internet', 'Moradia', 'Internet', '120', 'SIM'] }
        ]
    });
    assert.strictEqual(synced, true);
}

test('financial events public rows expose only scoped public fields', () => {
    syncAgentSnapshot();

    const rows = queryFinancialEventsPublicRows({
        userIds: ['agent-daniel', 'agent-thais'],
        personByUserId: { 'agent-daniel': 'Daniel', 'agent-thais': 'Thais' }
    });

    assert.ok(rows.length >= 6);
    assert.ok(rows.some(row => row.event_type === 'card_expense' && row.person === 'Thais'));
    assert.ok(rows.some(row => row.event_type === 'income' && row.description === 'salário'));
    assert.ok(!rows.some(row => row.description === 'gasto outro usuario'));
    for (const row of rows) {
        assert.ok(!Object.prototype.hasOwnProperty.call(row, 'user_id'));
        assert.ok(!Object.prototype.hasOwnProperty.call(row, 'sheet_id'));
        assert.ok(!Object.prototype.hasOwnProperty.call(row, 'token'));
    }
});

test('sqlite read-model keeps identical purchases made on different cards', () => {
    assert.strictEqual(ensureSqliteReady(), true);
    assert.strictEqual(syncSnapshotToSqlite({
        saidas: [],
        cartoes: [
            { user_id: 'agent-daniel', source: 'Lançamentos Cartão', card_id: 'nubank-daniel', cartao: 'Cartão Nubank - Daniel', data: '04/06/2026', descricao: 'mercado', categoria: 'Alimentação', subcategoria: 'Cartão de Crédito', valor: 2.49, parcela: '1/1', month: 5, year: 2026 },
            { user_id: 'agent-daniel', source: 'Lançamentos Cartão', card_id: 'nubank-thais', cartao: 'Cartão Nubank - Thais', data: '04/06/2026', descricao: 'mercado', categoria: 'Alimentação', subcategoria: 'Cartão de Crédito', valor: 2.49, parcela: '1/1', month: 5, year: 2026 }
        ],
        entradas: [],
        transferencias: [],
        userSettings: [],
        cartoesConfig: [],
        metas: [],
        movimentacoesMetas: [],
        dividas: [],
        contas: []
    }), true);

    const rows = queryFinancialEventsPublicRows({
        userIds: ['agent-daniel'],
        personByUserId: { 'agent-daniel': 'Daniel' },
        eventTypes: ['card_expense']
    });

    assert.strictEqual(rows.length, 2);
    assert.deepStrictEqual(rows.map(row => row.card).sort(), [
        'Cartão Nubank - Daniel',
        'Cartão Nubank - Thais'
    ]);
});

test('safe readonly SQL allows scoped SELECT and blocks unsafe/internal access', () => {
    syncAgentSnapshot();

    const rows = queryFinancialEventsPublicRows({
        userIds: ['agent-daniel', 'agent-thais'],
        personByUserId: { 'agent-daniel': 'Daniel', 'agent-thais': 'Thais' }
    });

    const result = runSafeReadonlySql(
        'SELECT event_type, SUM(amount) AS total FROM financial_events_public WHERE event_type IN (\'expense\', \'card_expense\') GROUP BY event_type ORDER BY total DESC LIMIT 5',
        { rows }
    );

    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.rows.map(row => row.event_type).sort(), ['card_expense', 'expense']);

    assert.strictEqual(validateSafeReadonlySql('UPDATE financial_events_public SET amount = 0').ok, false);
    assert.strictEqual(validateSafeReadonlySql('SELECT user_id FROM financial_events_public LIMIT 1').ok, false);
    assert.strictEqual(validateSafeReadonlySql('SELECT * FROM expenses LIMIT 1').ok, false);
    assert.strictEqual(validateSafeReadonlySql('SELECT a.amount FROM financial_events_public a JOIN financial_events_public b ON 1=1 LIMIT 5').ok, false);
    assert.strictEqual(validateSafeReadonlySql('SELECT amount FROM financial_events_public LIMIT 100000').ok, false);
    assert.strictEqual(runSafeReadonlySql('SELECT amount FROM financial_events_public LIMIT 100', { rows, maxRows: 5 }).ok, false);
});

test('financial agent tools can answer latest transaction questions without legacy intents', async () => {
    syncAgentSnapshot();

    const latest = await listRecentTransactions({
        userIds: ['agent-daniel', 'agent-thais'],
        personByUserId: { 'agent-daniel': 'Daniel', 'agent-thais': 'Thais' },
        eventTypes: ['expense', 'card_expense'],
        limit: 1
    });

    assert.strictEqual(latest.ok, true);
    assert.strictEqual(latest.rows[0].description, 'restaurante');
    assert.strictEqual(latest.rows[0].person, 'Thais');
});

test('read-model uses Lançamentos Cartão as canonical source and ignores remapped legacy duplicates', () => {
    const headers = ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'card_id', 'Cartão', 'Observações', 'user_id'];
    const canonicalRows = [
        headers,
        ['20/06/2026', 'farmácia teste', 'Saúde', '3,33', '1/2', 'Junho de 2026', 'nubank-thais', 'Cartão Nubank - Thais', '', 'agent-daniel']
    ];
    const legacyRows = [
        ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'user_id'],
        ['20/06/2026', 'farmácia teste', 'Saúde', '3,33', '1/2', 'Junho de 2026', 'agent-daniel']
    ];

    const entries = readModelTest.buildCanonicalCardEntries({
        unifiedRows: canonicalRows,
        legacyRowsBySheet: [
            { rows: legacyRows, sheetName: 'Cartão Nubank - Daniel' },
            { rows: legacyRows, sheetName: 'Cartão Nubank - Thais' },
            { rows: legacyRows, sheetName: 'Cartão Nubank - Cristina' },
            { rows: legacyRows, sheetName: 'Cartão Atacadão' }
        ]
    });

    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].cartao, 'Cartão Nubank - Thais');
    assert.strictEqual(entries[0].card_id, 'nubank-thais');
    assert.strictEqual(entries[0].source, 'Lançamentos Cartão');
    assert.strictEqual(entries[0].valor, 3.33);
});

test('read-model falls back to legacy card sheets only when canonical card sheet is empty', () => {
    const legacyRows = [
        ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'user_id'],
        ['20/06/2026', 'mercado legado', 'Alimentação', '5,55', '1/1', 'Julho de 2026', 'agent-daniel']
    ];

    const entries = readModelTest.buildCanonicalCardEntries({
        unifiedRows: [['Data', 'Descrição']],
        legacyRowsBySheet: [{ rows: legacyRows, sheetName: 'Cartão Nubank - Daniel' }]
    });

    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].cartao, 'Cartão Nubank - Daniel');
    assert.strictEqual(entries[0].card_id, 'nubank-daniel');
    assert.strictEqual(entries[0].source, 'Cartão Nubank - Daniel');
});

test('read-model does not reuse a fresh snapshot from another sheet context', () => {
    const now = Date.parse('2026-06-20T18:00:00.000Z');
    const freshMeta = {
        lastSyncedAt: '2026-06-20T17:59:50.000Z',
        source: 'sheets_full_refresh',
        contextKey: 'central'
    };

    assert.strictEqual(readModelTest.shouldReuseReadModelSnapshot(freshMeta, {
        now,
        intervalMs: 300000,
        currentContextKey: 'central'
    }), true);
    assert.strictEqual(readModelTest.shouldReuseReadModelSnapshot(freshMeta, {
        now,
        intervalMs: 300000,
        currentContextKey: 'user:agent-daniel'
    }), false);
    assert.strictEqual(readModelTest.shouldReuseReadModelSnapshot({
        lastSyncedAt: '2026-06-20T17:59:50.000Z',
        source: 'sheets_full_refresh'
    }, {
        now,
        intervalMs: 300000,
        currentContextKey: 'user:agent-daniel'
    }), false);
    assert.strictEqual(readModelTest.shouldReuseReadModelSnapshot(freshMeta, {
        force: true,
        now,
        intervalMs: 300000,
        currentContextKey: 'central'
    }), false);
});

test('financial agent recent transactions can read canonical transaction canary rows', async () => {
    syncAgentSnapshot();
    const dbPath = path.join(os.tmpdir(), `canonical-agent-canary-${Date.now()}-${Math.random()}.sqlite`);
    const store = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    store.persistProjection({
        runId: 'agent-canary-run',
        projected: {
            events: [{
                event_id: 'evt_agent_canary_1',
                owner_person_id: 'agent-daniel',
                actor_person_id: 'agent-daniel',
                kind: 'expense',
                status: 'settled',
                description: 'gasto canonico',
                amount_cents: 4321,
                currency: 'BRL',
                occurred_on: '2026-06-21',
                effective_on: '2026-06-21',
                competence_month: '2026-06',
                category: 'Alimentação',
                subcategory: 'SUPERMERCADO',
                category_status: 'resolved',
                free_budget_eligible: true,
                net_income_expense_impact: 4321,
                source_type: 'sheet.saidas',
                source_row_ref: 'row-1',
                source_id_hash: 'source-hash-1',
                source_row_hash: 'row-hash-1',
                idempotency_key: 'idem-1',
                created_at: '2026-06-21T12:00:00.000Z',
                updated_at: '2026-06-21T12:00:00.000Z'
            }]
        },
        publicProjection: [],
        report: {
            report_type: 'canonical_ledger_receipt_shadow',
            schema_version: 'canonical-ledger-v1',
            synthetic_fixture_only: false
        }
    });

    const latest = await listRecentTransactions({
        userIds: ['agent-daniel'],
        personByUserId: { 'agent-daniel': 'Daniel' },
        eventTypes: ['expense'],
        limit: 1,
        env: {
            NODE_ENV: 'production',
            CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
            CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true',
            CANONICAL_LEDGER_PRODUCTION_SHADOW_APPROVED: 'true',
            CANONICAL_LEDGER_CANARY_READ_ENABLED: 'true',
            CANONICAL_LEDGER_CANARY_READ_APPROVED: 'true',
            CANONICAL_LEDGER_CANARY_READ_DOMAINS: 'transactions'
        },
        canonicalLedgerDbPath: dbPath
    });

    assert.strictEqual(latest.ok, true);
    assert.strictEqual(latest.source, 'canonical');
    assert.strictEqual(latest.rows[0].event_type, 'expense');
    assert.strictEqual(latest.rows[0].description, 'gasto canonico');
    assert.strictEqual(latest.rows[0].amount, 43.21);
    assert.strictEqual(latest.rows[0].person, 'Daniel');
    assert.doesNotMatch(JSON.stringify(latest), /agent-daniel|owner_person_id|source_row_hash|idempotency_key/i);
});

test('financial agent recent transactions falls back when canonical canary has no rows', async () => {
    const synced = syncSnapshotToSqlite({
        saidas: [
            { user_id: 'agent-daniel', data: '21/06/2026', descricao: 'legado recente', categoria: 'Outros', subcategoria: '', valor: 9.87, month: 5, year: 2026 }
        ],
        cartoes: [],
        entradas: [],
        transferencias: [],
        userSettings: [],
        cartoesConfig: [],
        metas: [],
        movimentacoesMetas: [],
        dividas: [],
        contas: []
    });
    assert.strictEqual(synced, true);

    const dbPath = path.join(os.tmpdir(), `canonical-agent-empty-${Date.now()}-${Math.random()}.sqlite`);
    const store = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    store.persistProjection({
        runId: 'agent-empty-run',
        projected: { events: [] },
        publicProjection: [],
        report: {
            report_type: 'canonical_ledger_receipt_shadow',
            schema_version: 'canonical-ledger-v1',
            synthetic_fixture_only: false
        }
    });

    const latest = await listRecentTransactions({
        userIds: ['agent-daniel'],
        personByUserId: { 'agent-daniel': 'Daniel' },
        eventTypes: ['expense'],
        limit: 1,
        env: {
            NODE_ENV: 'production',
            CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
            CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true',
            CANONICAL_LEDGER_PRODUCTION_SHADOW_APPROVED: 'true',
            CANONICAL_LEDGER_CANARY_READ_ENABLED: 'true',
            CANONICAL_LEDGER_CANARY_READ_APPROVED: 'true',
            CANONICAL_LEDGER_CANARY_READ_DOMAINS: 'transactions'
        },
        canonicalLedgerDbPath: dbPath
    });

    assert.strictEqual(latest.ok, true);
    assert.strictEqual(latest.source, 'legacy');
    assert.strictEqual(latest.fallbackReason, 'canonical_empty');
    assert.strictEqual(latest.rows[0].description, 'legado recente');
});
test('financial agent recent transactions falls back when canonical canary window is partial', async () => {
    const synced = syncSnapshotToSqlite({
        saidas: [
            { user_id: 'agent-daniel', data: '23/06/2026', descricao: 'legado mais recente', categoria: 'Outros', subcategoria: '', valor: 10.01, month: 5, year: 2026 },
            { user_id: 'agent-daniel', data: '22/06/2026', descricao: 'legado anterior', categoria: 'Outros', subcategoria: '', valor: 10.02, month: 5, year: 2026 }
        ],
        cartoes: [],
        entradas: [],
        transferencias: [],
        userSettings: [],
        cartoesConfig: [],
        metas: [],
        movimentacoesMetas: [],
        dividas: [],
        contas: []
    });
    assert.strictEqual(synced, true);

    const dbPath = path.join(os.tmpdir(), `canonical-agent-partial-${Date.now()}-${Math.random()}.sqlite`);
    const store = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    store.persistProjection({
        runId: 'agent-partial-run',
        projected: {
            events: [{
                event_id: 'evt_agent_partial_1',
                owner_person_id: 'agent-daniel',
                actor_person_id: 'agent-daniel',
                kind: 'expense',
                status: 'settled',
                description: 'gasto canonico unico',
                amount_cents: 1001,
                currency: 'BRL',
                occurred_on: '2026-06-23',
                effective_on: '2026-06-23',
                competence_month: '2026-06',
                category: 'Outros',
                category_status: 'resolved',
                free_budget_eligible: true,
                net_income_expense_impact: 1001,
                source_type: 'sheet.saidas',
                source_row_ref: 'row-partial-1',
                source_id_hash: 'source-partial-1',
                source_row_hash: 'row-partial-hash-1',
                idempotency_key: 'idem-partial-1',
                created_at: '2026-06-23T12:00:00.000Z',
                updated_at: '2026-06-23T12:00:00.000Z'
            }]
        },
        publicProjection: [],
        report: {
            report_type: 'canonical_ledger_receipt_shadow',
            schema_version: 'canonical-ledger-v1',
            synthetic_fixture_only: false
        }
    });

    const latest = await listRecentTransactions({
        userIds: ['agent-daniel'],
        personByUserId: { 'agent-daniel': 'Daniel' },
        eventTypes: ['expense'],
        limit: 2,
        env: {
            NODE_ENV: 'production',
            CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
            CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true',
            CANONICAL_LEDGER_PRODUCTION_SHADOW_APPROVED: 'true',
            CANONICAL_LEDGER_CANARY_READ_ENABLED: 'true',
            CANONICAL_LEDGER_CANARY_READ_APPROVED: 'true',
            CANONICAL_LEDGER_CANARY_READ_DOMAINS: 'transactions'
        },
        canonicalLedgerDbPath: dbPath
    });

    assert.strictEqual(latest.ok, true);
    assert.strictEqual(latest.source, 'legacy');
    assert.strictEqual(latest.fallbackReason, 'canonical_partial_window');
    assert.deepStrictEqual(latest.rows.map(row => row.description), ['legado mais recente', 'legado anterior']);
});
test('financial agent recent transactions falls back when canonical canary has no matching event type', async () => {
    const synced = syncSnapshotToSqlite({
        saidas: [
            { user_id: 'agent-daniel', data: '22/06/2026', descricao: 'legado por tipo', categoria: 'Outros', subcategoria: '', valor: 8.76, month: 5, year: 2026 }
        ],
        cartoes: [],
        entradas: [],
        transferencias: [],
        userSettings: [],
        cartoesConfig: [],
        metas: [],
        movimentacoesMetas: [],
        dividas: [],
        contas: []
    });
    assert.strictEqual(synced, true);

    const dbPath = path.join(os.tmpdir(), `canonical-agent-wrong-type-${Date.now()}-${Math.random()}.sqlite`);
    const store = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    store.persistProjection({
        runId: 'agent-wrong-type-run',
        projected: {
            events: [{
                event_id: 'evt_agent_wrong_type_1',
                owner_person_id: 'agent-daniel',
                actor_person_id: 'agent-daniel',
                kind: 'invoice_payment',
                status: 'settled',
                description: 'pagamento fatura canonico',
                amount_cents: 1234,
                currency: 'BRL',
                occurred_on: '2026-06-22',
                effective_on: '2026-06-22',
                competence_month: '2026-06',
                category_status: 'resolved',
                free_budget_eligible: false,
                net_income_expense_impact: 0,
                source_type: 'sheet.transferencias',
                source_row_ref: 'row-transfer-1',
                source_id_hash: 'source-hash-transfer-1',
                source_row_hash: 'row-hash-transfer-1',
                idempotency_key: 'idem-transfer-1',
                created_at: '2026-06-22T12:00:00.000Z',
                updated_at: '2026-06-22T12:00:00.000Z'
            }]
        },
        publicProjection: [],
        report: {
            report_type: 'canonical_ledger_receipt_shadow',
            schema_version: 'canonical-ledger-v1',
            synthetic_fixture_only: false
        }
    });

    const latest = await listRecentTransactions({
        userIds: ['agent-daniel'],
        personByUserId: { 'agent-daniel': 'Daniel' },
        eventTypes: ['expense'],
        limit: 1,
        env: {
            NODE_ENV: 'production',
            CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
            CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true',
            CANONICAL_LEDGER_PRODUCTION_SHADOW_APPROVED: 'true',
            CANONICAL_LEDGER_CANARY_READ_ENABLED: 'true',
            CANONICAL_LEDGER_CANARY_READ_APPROVED: 'true',
            CANONICAL_LEDGER_CANARY_READ_DOMAINS: 'transactions'
        },
        canonicalLedgerDbPath: dbPath
    });

    assert.strictEqual(latest.ok, true);
    assert.strictEqual(latest.source, 'legacy');
    assert.strictEqual(latest.fallbackReason, 'canonical_no_matching_rows');
    assert.strictEqual(latest.rows[0].description, 'legado por tipo');
});
test('financial agent latest all transactions uses public read-model insertion order as same-day tie-breaker', async () => {
    assert.strictEqual(ensureSqliteReady(), true);
    const synced = syncSnapshotToSqlite({
        saidas: [
            { user_id: 'agent-daniel', data: '19/06/2026', descricao: 'pix etapa', categoria: 'Outros', subcategoria: '', valor: 4.21, month: 5, year: 2026 }
        ],
        cartoes: [
            { user_id: 'agent-daniel', source: 'Cartão Nubank - Daniel', card_id: 'nubank-daniel', cartao: 'Cartão Nubank - Daniel', data: '19/06/2026', descricao: 'cartao etapa', categoria: 'Outros', subcategoria: 'Cartão de Crédito', valor: 5.32, parcela: '1/1', month: 5, year: 2026 }
        ],
        entradas: [
            { user_id: 'agent-daniel', data: '19/06/2026', descricao: 'entrada etapa', categoria: 'Outros', valor: 6.43, recebimento: 'PIX', recorrente: 'Não', month: 5, year: 2026 }
        ],
        transferencias: [
            { user_id: 'agent-daniel', data: '19/06/2026', descricao: 'caixinha etapa', valor: 7.54, origem: 'Conta', destino: 'Caixinha', metodo: 'Transferência', observacoes: '', status: 'Movimentação de reserva/investimento', month: 5, year: 2026 }
        ],
        userSettings: [],
        cartoesConfig: [],
        metas: [],
        movimentacoesMetas: [],
        dividas: [],
        contas: []
    });
    assert.strictEqual(synced, true);

    const latest = await listRecentTransactions({
        userIds: ['agent-daniel'],
        personByUserId: { 'agent-daniel': 'Daniel' },
        limit: 1
    });

    assert.strictEqual(latest.ok, true);
    assert.strictEqual(latest.rows[0].event_type, 'transfer');
    assert.strictEqual(latest.rows[0].description, 'caixinha etapa');
    assert.strictEqual(latest.criteria.sort, 'iso_date desc, insertion_order desc');
});

test('financial agent Query Engine tool executes a validated scoped FinancialQueryPlan', async () => {
    syncAgentSnapshot();

    const result = await queryFinancialPlanTool({
        userIds: ['agent-daniel', 'agent-thais'],
        plan: {
            kind: 'financial_query',
            domain: 'expenses',
            operation: 'sum',
            filters: { period: { type: 'month', month: 5, year: 2026 } },
            timeBasis: 'billing_month'
        }
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.tool, 'query_financial_plan');
    assert.strictEqual(result.plan.filters.scope, 'family');
    assert.strictEqual(result.result.value, 105);
    assert.doesNotMatch(JSON.stringify(result), /agent-outsider|user_id|owner_hash/);
});

test('financial agent Query Engine treats missing budget settings as a valid inactive budget', async () => {
    syncAgentSnapshot();

    const result = await queryFinancialPlanTool({
        userIds: ['agent-daniel'],
        plan: {
            kind: 'financial_query',
            domain: 'budget',
            operation: 'forecast',
            filters: { period: { type: 'cycle', label: 'ciclo atual' } },
            timeBasis: 'budget_cycle'
        }
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.value.active, false);
    assert.match(result.result.value.criteria, /desativado/i);
});

test('financial agent dashboard and explain tools expose deterministic public snapshots', async () => {
    syncAgentSnapshot();

    const dashboard = await getDashboardSnapshotTool({
        userIds: ['agent-daniel'],
        month: 5,
        year: 2026
    });
    assert.strictEqual(dashboard.ok, true);
    assert.strictEqual(dashboard.snapshot.kpis.entradas, 5000);
    assert.strictEqual(dashboard.snapshot.kpis.saidas, 30);
    assert.match(dashboard.snapshot.criteria.balance, /Critério/i);
    assert.doesNotMatch(JSON.stringify(dashboard), /agent-daniel|user_id|owner_hash/);

    const explanation = await explainMetricTool({
        metric: 'available',
        userIds: ['agent-daniel'],
        month: 5,
        year: 2026
    });
    assert.strictEqual(explanation.ok, true);
    assert.strictEqual(explanation.metric, 'available');
    assert.match(explanation.criteria, /disponível estimado/i);
});

test('financial agent dashboard tools require family owner inside authorized scope', async () => {
    syncAgentSnapshot();

    const missingOwner = await getDashboardSnapshotTool({
        userIds: ['agent-daniel', 'agent-thais'],
        month: 5,
        year: 2026
    });
    assert.strictEqual(missingOwner.ok, false);
    assert.strictEqual(missingOwner.reason, 'family_dashboard_requires_owner_context');

    const outsideOwner = await getDashboardSnapshotTool({
        userIds: ['agent-daniel', 'agent-thais'],
        ownerUserId: 'agent-outsider',
        month: 5,
        year: 2026
    });
    assert.strictEqual(outsideOwner.ok, false);
    assert.strictEqual(outsideOwner.reason, 'family_dashboard_requires_owner_context');

    const authorizedOwner = await getDashboardSnapshotTool({
        userIds: ['agent-daniel', 'agent-thais'],
        ownerUserId: 'agent-daniel',
        month: 5,
        year: 2026
    });
    assert.strictEqual(authorizedOwner.ok, true);
    assert.doesNotMatch(JSON.stringify(authorizedOwner), /agent-daniel|agent-thais|agent-outsider|user_id|owner_hash/);
});

test('financial agent dashboard sanitizer removes nested internal identifiers', () => {
    const sanitized = require('../src/agent/financialAgentTools').__test__.sanitizeDashboardSnapshot({
        kpis: { saldo: 10, user_id: 'internal-user' },
        recentTransactions: [{ description: 'mercado', owner_hash: 'internal-hash', amount: 10 }],
        goals: [{ name: 'Reserva', sheet_id: 'internal-sheet' }]
    });

    assert.strictEqual(sanitized.kpis.saldo, 10);
    assert.doesNotMatch(JSON.stringify(sanitized), /internal-user|internal-hash|internal-sheet|user_id|owner_hash|sheet_id/i);
});

test('result verifier rejects invented numbers and internal fields', () => {
    const toolResult = {
        ok: true,
        rows: [{ description: 'restaurante', amount: 75, date: '05/06/2026' }],
        metrics: { total: 75 }
    };

    assert.strictEqual(verifyAgentAnswer('Seu último gasto foi restaurante, R$ 75,00.', { toolResult }).ok, true);
    assert.strictEqual(verifyAgentAnswer('Seu último gasto foi restaurante, R$ 80,00.', { toolResult }).ok, false);
    assert.strictEqual(verifyAgentAnswer('Usei user_id agent-daniel para consultar.', { toolResult }).ok, false);
});

test('result verifier validates percentage claims and their mathematical relationship', () => {
    const toolResult = {
        ok: true,
        tool: 'query_financial_plan',
        plan: { domain: 'expenses', operation: 'percentage' },
        result: {
            value: { percent: 25, part: 50, total: 200 },
            details: { denominator: 200 }
        }
    };

    assert.strictEqual(
        verifyAgentAnswer('Alimentação representa 25%: R$ 50,00 de R$ 200,00.', { toolResult }).ok,
        true
    );
    assert.strictEqual(
        verifyAgentAnswer('Alimentação representa 30%: R$ 50,00 de R$ 200,00.', { toolResult }).reason,
        'invented_percentage'
    );
    assert.strictEqual(
        verifyAgentAnswer('Alimentação representa 25%: R$ 200,00 de R$ 50,00.', { toolResult }).reason,
        'wrong_percentage_components'
    );

    const inconsistentToolResult = {
        ...toolResult,
        result: {
            ...toolResult.result,
            value: { percent: 30, part: 50, total: 200 }
        }
    };
    assert.strictEqual(
        verifyAgentAnswer('Alimentação representa 30%: R$ 50,00 de R$ 200,00.', { toolResult: inconsistentToolResult }).reason,
        'invalid_percentage_relation'
    );

    const inconsistentComparison = {
        ok: true,
        tool: 'query_financial_plan',
        plan: { domain: 'expenses', operation: 'compare' },
        result: {
            value: { current: 150, previous: 100, difference: 50, percent: 25 },
            details: {}
        }
    };
    assert.strictEqual(
        verifyAgentAnswer('Os gastos cresceram 25%.', { toolResult: inconsistentComparison }).reason,
        'invalid_percentage_relation'
    );
});

test('result verifier rejects unsupported row-count claims', () => {
    const toolResult = {
        ok: true,
        tool: 'run_safe_readonly_sql',
        rows: [{ category: 'Alimentação' }, { category: 'Transporte' }],
        rowCount: 2
    };

    assert.strictEqual(verifyAgentAnswer('Encontrei 2 resultados para essa análise.', { toolResult }).ok, true);
    assert.strictEqual(
        verifyAgentAnswer('Encontrei 3 resultados para essa análise.', { toolResult }).reason,
        'invented_count'
    );
});

test('result verifier requires latest answers to reference the first correctly ordered row', () => {
    const recentRows = [
        { description: 'restaurante', amount: 75, date: '05/06/2026', iso_date: '2026-06-05', person: 'Thais' },
        { description: 'mercado', amount: 30, date: '01/06/2026', iso_date: '2026-06-01', person: 'Daniel' }
    ];
    const toolResult = {
        ok: true,
        tool: 'list_recent_transactions',
        rows: recentRows.slice(0, 1),
        criteria: { sort: 'iso_date desc', limit: 1 }
    };

    assert.strictEqual(
        verifyAgentAnswer('Seu último gasto foi em 05/06/2026: restaurante, R$ 75,00 (Thais).', { toolResult }).ok,
        true
    );
    assert.strictEqual(
        verifyAgentAnswer('Seu último gasto foi em 01/06/2026: mercado, R$ 30,00 (Daniel).', { toolResult }).reason,
        'wrong_latest_item'
    );

    const incorrectlyOrdered = { ...toolResult, rows: [...recentRows].reverse(), criteria: { sort: 'iso_date desc', limit: 2 } };
    assert.strictEqual(
        verifyAgentAnswer('Seu último gasto foi em 01/06/2026: mercado, R$ 30,00 (Daniel).', { toolResult: incorrectlyOrdered }).reason,
        'invalid_tool_order'
    );
});
test('result verifier rejects recent-transaction lists that omit requested rows', () => {
    const toolResult = {
        ok: true,
        tool: 'list_recent_transactions',
        rows: [
            { description: 'hortifruti', amount: 50.44, date: '01/07/2026', iso_date: '2026-07-01', person: 'Daniel', insertion_order: 2 },
            { description: 'guaracamp', amount: 4, date: '30/06/2026', iso_date: '2026-06-30', person: 'Daniel', insertion_order: 1 }
        ],
        criteria: { sort: 'iso_date desc, insertion_order desc', limit: 2 }
    };

    assert.strictEqual(
        verifyAgentAnswer('Seu último gasto foi hortifruti em 01/07/2026.', { toolResult }).reason,
        'missing_recent_item'
    );
});


test('result verifier preserves the ordered labels returned for trends', () => {
    const toolResult = {
        ok: true,
        tool: 'query_financial_plan',
        plan: { domain: 'expenses', operation: 'trend' },
        result: {
            value: [
                { label: 'abril/2026', total: 100, count: 2 },
                { label: 'maio/2026', total: 150, count: 3 }
            ],
            details: { count: 5, groupBy: ['month'] }
        }
    };

    assert.strictEqual(
        verifyAgentAnswer(
            'Evolução:\n1. abril/2026: R$ 100,00, 2 lançamentos\n2. maio/2026: R$ 150,00, 3 lançamentos',
            { toolResult }
        ).ok,
        true
    );
    assert.strictEqual(
        verifyAgentAnswer(
            'Evolução:\n1. maio/2026: R$ 150,00, 3 lançamentos\n2. abril/2026: R$ 100,00, 2 lançamentos',
            { toolResult }
        ).reason,
        'wrong_result_order'
    );
});

test('LangGraph financial agent answers read-only latest expense with verified result', async () => {
    syncAgentSnapshot();

    const result = await invokeFinancialAgent({
        message: 'Qual foi meu último gasto?',
        userIds: ['agent-daniel', 'agent-thais'],
        personByUserId: { 'agent-daniel': 'Daniel', 'agent-thais': 'Thais' },
        mode: 'answer'
    });

    assert.strictEqual(result.action, 'answer');
    assert.strictEqual(result.verified.ok, true);
    assert.match(result.answer, /restaurante/i);
    assert.match(result.answer, /05\/06\/2026/);
    assert.doesNotMatch(result.answer, /agent-daniel|user_id|sheet/i);
});
test('LangGraph financial agent lets Gemini preserve count and card in plural recent queries', async () => {
    assert.strictEqual(ensureSqliteReady(), true);
    assert.strictEqual(syncSnapshotToSqlite({
        saidas: [],
        cartoes: [
            { user_id: 'agent-daniel', source: 'Lançamentos Cartão', card_id: 'nubank-thais', cartao: 'Cartão Nubank - Thais', data: '01/07/2026', descricao: 'hortifruti', categoria: 'Alimentação', subcategoria: 'SUPERMERCADO', valor: 50.44, parcela: '1/1', month: 6, year: 2026 },
            { user_id: 'agent-daniel', source: 'Lançamentos Cartão', card_id: 'nubank-thais', cartao: 'Cartão Nubank - Thais', data: '30/06/2026', descricao: 'abastecendo o carro', categoria: 'Transporte', subcategoria: 'COMBUSTÍVEL', valor: 59.59, parcela: '1/1', month: 5, year: 2026 },
            { user_id: 'agent-daniel', source: 'Lançamentos Cartão', card_id: 'nubank-thais', cartao: 'Cartão Nubank - Thais', data: '30/06/2026', descricao: 'sorvete no Burger King', categoria: 'Alimentação', subcategoria: 'PADARIA / LANCHE', valor: 15.8, parcela: '1/1', month: 5, year: 2026 },
            { user_id: 'agent-daniel', source: 'Lançamentos Cartão', card_id: 'nubank-thais', cartao: 'Cartão Nubank - Thais', data: '30/06/2026', descricao: 'guaracamp', categoria: 'Alimentação', subcategoria: 'PADARIA / LANCHE', valor: 4, parcela: '1/1', month: 5, year: 2026 },
            { user_id: 'agent-daniel', source: 'Lançamentos Cartão', card_id: 'nubank-daniel', cartao: 'Cartão Nubank - Daniel', data: '02/07/2026', descricao: 'compra de outro cartão', categoria: 'Outros', subcategoria: '', valor: 999, parcela: '1/1', month: 6, year: 2026 }
        ],
        entradas: [], transferencias: [], userSettings: [], cartoesConfig: [], metas: [], movimentacoesMetas: [], dividas: [], contas: []
    }), true);

    const originalPlannerFlag = process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED;
    const originalAnalystMode = process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE;
    process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED = 'true';
    process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE = 'off';
    plannerTest.setStructuredResponseOverrideForTest(() => ({
        action: 'tool',
        tool: 'list_recent_transactions',
        args: {
            eventTypes: ['card_expense'],
            limit: 4,
            card: 'Nubank - Thais'
        }
    }));

    try {
        const result = await invokeFinancialAgent({
            message: 'Quais foram os últimos 4 gastos no cartão Nubank - Thais?',
            userIds: ['agent-daniel'],
            personByUserId: { 'agent-daniel': 'Daniel' },
            currentDate: '01/07/2026',
            mode: 'answer'
        });

        assert.strictEqual(result.action, 'answer', JSON.stringify(result));
        assert.strictEqual(result.plan.source, 'llm_planner');
        assert.strictEqual(result.plan.args.limit, 4);
        assert.strictEqual(result.plan.args.card, 'Nubank - Thais');
        assert.strictEqual(result.toolResult.rows.length, 4);
        assert.ok(result.toolResult.rows.every(row => /nubank - thais/i.test(row.card)));
        for (const description of ['hortifruti', 'abastecendo o carro', 'sorvete no Burger King', 'guaracamp']) {
            assert.match(result.answer, new RegExp(description, 'i'));
        }
        assert.doesNotMatch(result.answer, /compra de outro cartão/i);
        assert.strictEqual(result.verified.ok, true);
    } finally {
        plannerTest.setStructuredResponseOverrideForTest(null);
        if (originalPlannerFlag === undefined) delete process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED;
        else process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED = originalPlannerFlag;
        if (originalAnalystMode === undefined) delete process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE;
        else process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE = originalAnalystMode;
    }
});


test('LangGraph financial agent lets Gemini override stale legacy card totals for explicit purchase-date ranges', async () => {
    assert.strictEqual(ensureSqliteReady(), true);
    assert.strictEqual(syncSnapshotToSqlite({
        saidas: [],
        cartoes: [
            { user_id: 'agent-daniel', source: 'Lançamentos Cartão', card_id: 'nubank-thais', cartao: 'Cartão Nubank - Thais', data: '01/07/2026', descricao: 'hortifruti', categoria: 'Alimentação', subcategoria: 'SUPERMERCADO', valor: 50.44, parcela: '1/1', month: 6, year: 2026 },
            { user_id: 'agent-daniel', source: 'Lançamentos Cartão', card_id: 'nubank-thais', cartao: 'Cartão Nubank - Thais', data: '01/07/2026', descricao: 'almoço no dia 28 de junho', categoria: 'Alimentação', subcategoria: 'RESTAURANTE', valor: 90.97, parcela: '1/1', month: 6, year: 2026 },
            { user_id: 'agent-daniel', source: 'Lançamentos Cartão', card_id: 'nubank-thais', cartao: 'Cartão Nubank - Thais', data: '30/06/2026', descricao: 'abastecendo o carro', categoria: 'Transporte', subcategoria: 'COMBUSTÍVEL', valor: 59.59, parcela: '1/1', month: 5, year: 2026 },
            { user_id: 'agent-daniel', source: 'Lançamentos Cartão', card_id: 'nubank-thais', cartao: 'Cartão Nubank - Thais', data: '30/06/2026', descricao: 'sorvete no Burger King', categoria: 'Alimentação', subcategoria: 'PADARIA / LANCHE', valor: 15.8, parcela: '1/1', month: 5, year: 2026 },
            { user_id: 'agent-daniel', source: 'Lançamentos Cartão', card_id: 'nubank-daniel', cartao: 'Cartão Nubank - Daniel', data: '01/07/2026', descricao: 'outro cartão', categoria: 'Outros', subcategoria: '', valor: 999, parcela: '1/1', month: 6, year: 2026 },
            { user_id: 'agent-daniel', source: 'Lançamentos Cartão', card_id: 'nubank-thais', cartao: 'Cartão Nubank - Thais', data: '29/06/2026', descricao: 'fora do período', categoria: 'Outros', subcategoria: '', valor: 777, parcela: '1/1', month: 5, year: 2026 }
        ],
        entradas: [], transferencias: [], userSettings: [], cartoesConfig: [], metas: [], movimentacoesMetas: [], dividas: [], contas: []
    }), true);

    const originalPlannerFlag = process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED;
    const originalAnalystMode = process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE;
    process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED = 'true';
    process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE = 'off';
    plannerTest.setStructuredResponseOverrideForTest(() => ({
        action: 'tool',
        tool: 'query_financial_plan',
        args: {
            plan: {
                kind: 'financial_query',
                domain: 'cards',
                operation: 'sum',
                filters: {
                    period: { type: 'date_range', from: '2026-06-30', to: '2026-07-01' },
                    card: 'Nubank - Thais'
                },
                timeBasis: 'transaction_date',
                answerStyle: 'short'
            }
        }
    }));

    try {
        const result = await invokeFinancialAgent({
            message: 'Quanto gastei no cartão Nubank - Thais entre 30 de junho e 1 de julho de 2026?',
            userIds: ['agent-daniel'],
            personByUserId: { 'agent-daniel': 'Daniel' },
            currentDate: '01/07/2026',
            financialQueryPlan: {
                kind: 'financial_query',
                domain: 'cards',
                operation: 'sum',
                filters: { period: { type: 'month', month: 5, year: 2026 }, card: 'nubank', scope: 'personal' },
                timeBasis: 'billing_month'
            },
            mode: 'answer'
        });

        assert.strictEqual(result.action, 'answer', JSON.stringify(result));
        assert.strictEqual(result.plan.source, 'llm_planner');
        assert.strictEqual(result.toolResult.plan.timeBasis, 'transaction_date');
        assert.deepStrictEqual(result.toolResult.plan.filters.period, { type: 'date_range', from: '2026-06-30', to: '2026-07-01' });
        assert.strictEqual(result.toolResult.plan.filters.card, 'Nubank - Thais');
        assert.strictEqual(result.toolResult.result.value, 216.8);
        assert.strictEqual(result.toolResult.result.details.count, 4);
        assert.match(result.answer, /R\$\s*216,80/i);
        assert.strictEqual(result.verified.ok, true);
    } finally {
        plannerTest.setStructuredResponseOverrideForTest(null);
        if (originalPlannerFlag === undefined) delete process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED;
        else process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED = originalPlannerFlag;
        if (originalAnalystMode === undefined) delete process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE;
        else process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE = originalAnalystMode;
    }
});

test('LangGraph financial agent uses grammatical labels for latest income and transfer answers', async () => {
    syncAgentSnapshot();

    const transfer = await invokeFinancialAgent({
        message: 'qual foi meu último lançamento?',
        userIds: ['agent-daniel'],
        personByUserId: { 'agent-daniel': 'Daniel' },
        mode: 'answer'
    });
    assert.strictEqual(transfer.action, 'answer');
    assert.strictEqual(transfer.verified.ok, true);
    assert.match(transfer.answer, /^Sua última transferência foi/i);

    const income = await invokeFinancialAgent({
        message: 'qual foi minha última entrada?',
        userIds: ['agent-daniel'],
        personByUserId: { 'agent-daniel': 'Daniel' },
        mode: 'answer'
    });
    assert.strictEqual(income.action, 'answer');
    assert.strictEqual(income.verified.ok, true);
    assert.match(income.answer, /^Sua última entrada foi/i);
});

test('LangGraph financial agent focuses latest-date questions on the date without losing verification evidence', async () => {
    syncAgentSnapshot();

    const result = await invokeFinancialAgent({
        message: 'qual a data do meu último lançamento?',
        userIds: ['agent-daniel'],
        personByUserId: { 'agent-daniel': 'Daniel' },
        mode: 'answer'
    });

    assert.strictEqual(result.action, 'answer');
    assert.strictEqual(result.verified.ok, true);
    assert.match(result.answer, /^A data do seu último lançamento é 04\/06\/2026/i);
    assert.match(result.answer, /resgate caixinha/i);
});

test('LangGraph financial agent executes an existing FinancialQueryPlan as a trusted tool', async () => {
    syncAgentSnapshot();

    const result = await invokeFinancialAgent({
        message: 'Quanto nós gastamos em junho?',
        userIds: ['agent-daniel', 'agent-thais'],
        personByUserId: { 'agent-daniel': 'Daniel', 'agent-thais': 'Thais' },
        financialQueryPlan: {
            kind: 'financial_query',
            domain: 'expenses',
            operation: 'sum',
            filters: { period: { type: 'month', month: 5, year: 2026 }, scope: 'family' },
            timeBasis: 'billing_month'
        },
        mode: 'shadow'
    });

    assert.strictEqual(result.action, 'answer');
    assert.strictEqual(result.plan.tool, 'query_financial_plan');
    assert.strictEqual(result.verified.ok, true);
    assert.match(result.answer, /R\$\s*105,00/i);
    assert.doesNotMatch(result.answer, /agent-|user_id|owner_hash/i);
});

test('LangGraph financial agent composes maior/menor expenses without generic fallback', async () => {
    syncAgentSnapshot();

    const result = await invokeFinancialAgent({
        message: 'qual foi meu maior gasto esse mês?',
        userIds: ['agent-daniel', 'agent-thais'],
        personByUserId: { 'agent-daniel': 'Daniel', 'agent-thais': 'Thais' },
        financialQueryPlan: {
            kind: 'financial_query',
            domain: 'expenses',
            operation: 'extreme',
            filters: { period: { type: 'month', month: 5, year: 2026 }, scope: 'family' },
            timeBasis: 'billing_month'
        },
        mode: 'answer'
    });

    assert.strictEqual(result.action, 'answer');
    assert.strictEqual(result.plan.tool, 'query_financial_plan');
    assert.strictEqual(result.verified.ok, true);
    assert.match(result.answer, /Maior gasto:/i);
    assert.match(result.answer, /Menor gasto:/i);
    assert.match(result.answer, /restaurante/i);
    assert.doesNotMatch(result.answer, /apresentação mais específica/i);
    assert.doesNotMatch(result.answer, /agent-|user_id|owner_hash/i);
});

test('LangGraph financial agent clarifies dashboard navigation instead of treating it as analytics', async () => {
    const result = await invokeFinancialAgent({
        message: 'gere link do dashboard',
        userIds: ['agent-daniel'],
        mode: 'shadow'
    });

    assert.strictEqual(result.action, 'clarify');
    assert.strictEqual(result.plan.action, 'clarify');
    assert.notStrictEqual(result.toolResult?.ok, true);
    assert.match(result.answer, /abrir o dashboard|consultar algum indicador/i);
});

test('LangGraph financial agent treats negated dashboard navigation as metric explanation', async () => {
    syncAgentSnapshot();

    const result = await invokeFinancialAgent({
        message: 'explique meu disponível sem abrir o dashboard',
        userIds: ['agent-daniel', 'agent-thais'],
        ownerUserId: 'agent-daniel',
        personByUserId: { 'agent-daniel': 'Daniel', 'agent-thais': 'Thais' },
        mode: 'shadow'
    });

    assert.strictEqual(result.action, 'answer');
    assert.strictEqual(result.plan.tool, 'explain_metric');
    assert.strictEqual(result.verified.ok, true);
});

test('financial agent activation defaults to off and accepts enforce as answer alias', () => {
    const original = process.env.FINANCIAL_AGENT_MODE;
    try {
        delete process.env.FINANCIAL_AGENT_MODE;
        assert.strictEqual(messageHandlerTest.getFinancialAgentMode(), 'off');

        process.env.FINANCIAL_AGENT_MODE = 'shadow';
        assert.strictEqual(messageHandlerTest.getFinancialAgentMode(), 'shadow');

        process.env.FINANCIAL_AGENT_MODE = 'enforce';
        assert.strictEqual(messageHandlerTest.getFinancialAgentMode(), 'answer');

        process.env.FINANCIAL_AGENT_MODE = 'unsafe';
        assert.strictEqual(messageHandlerTest.getFinancialAgentMode(), 'off');
    } finally {
        if (original === undefined) delete process.env.FINANCIAL_AGENT_MODE;
        else process.env.FINANCIAL_AGENT_MODE = original;
    }
});

test('financial agent answer gate uses verified answers but does not hijack planner gaps', () => {
    assert.strictEqual(messageHandlerTest.shouldUseFinancialAgentAnswer({
        action: 'answer',
        verified: { ok: true }
    }), true);
    assert.strictEqual(messageHandlerTest.shouldUseFinancialAgentAnswer({
        action: 'answer',
        verified: { ok: false }
    }), false);
    assert.strictEqual(messageHandlerTest.shouldUseFinancialAgentAnswer({
        action: 'clarify',
        plan: { reason: 'planner_gap' }
    }), false);
    assert.strictEqual(messageHandlerTest.shouldUseFinancialAgentAnswer({
        action: 'block',
        plan: { reason: 'unsafe_request' }
    }), true);
});

test('financial agent shadow mode can answer only verified recent-transaction tool results', () => {
    assert.strictEqual(messageHandlerTest.shouldUseFinancialAgentAnswerInMode('shadow', {
        action: 'answer',
        plan: { tool: 'list_recent_transactions' },
        verified: { ok: true },
        toolResult: { tool: 'list_recent_transactions', rows: [{ date: '2026-06-18' }] }
    }, {}), false);

    assert.strictEqual(messageHandlerTest.shouldUseFinancialAgentAnswerInMode('shadow', {
        action: 'answer',
        plan: { tool: 'list_recent_transactions' },
        verified: { ok: true },
        toolResult: { tool: 'list_recent_transactions', rows: [{ date: '2026-06-18' }] }
    }, { FINANCIAL_AGENT_SHADOW_RECENT_ANSWER_ENABLED: 'true' }), true);

    assert.strictEqual(messageHandlerTest.shouldUseFinancialAgentAnswerInMode('shadow', {
        action: 'answer',
        plan: { tool: 'query_financial_plan' },
        verified: { ok: true },
        toolResult: { tool: 'query_financial_plan', result: { total: 10 } }
    }, { FINANCIAL_AGENT_SHADOW_RECENT_ANSWER_ENABLED: 'true' }), false);

    assert.strictEqual(messageHandlerTest.shouldUseFinancialAgentAnswerInMode('shadow', {
        action: 'answer',
        plan: { tool: 'list_recent_transactions' },
        verified: { ok: false },
        toolResult: { tool: 'list_recent_transactions', rows: [{ date: '2026-06-18' }] }
    }, { FINANCIAL_AGENT_SHADOW_RECENT_ANSWER_ENABLED: 'true' }), false);

    assert.strictEqual(messageHandlerTest.shouldUseFinancialAgentAnswerInMode('answer', {
        action: 'answer',
        plan: { tool: 'query_financial_plan' },
        verified: { ok: true }
    }, {}), true);
});

test('financial agent full debug log is controlled by a simple env flag', () => {
    assert.strictEqual(messageHandlerTest.isFinancialAgentFullLogEnabled({}), false);
    assert.strictEqual(messageHandlerTest.isFinancialAgentFullLogEnabled({ FINANCIAL_AGENT_LOG_FULL: 'false' }), false);
    assert.strictEqual(messageHandlerTest.isFinancialAgentFullLogEnabled({ FINANCIAL_AGENT_LOG_FULL: 'true' }), true);
    assert.strictEqual(messageHandlerTest.isFinancialAgentFullLogEnabled({ FINANCIAL_AGENT_LOG_FULL: 'sim' }), true);

    const payload = messageHandlerTest.buildFinancialAgentFullLogPayload({
        answer: 'Seu último gasto foi mercado, R$ 10,00.',
        plan: { action: 'tool', tool: 'list_recent_transactions' },
        toolResult: {
            ok: true,
            rows: [{ date: '2026-06-20', description: 'mercado', amount: 10 }]
        },
        verified: { ok: true }
    });

    assert.match(payload, /Seu último gasto foi mercado/);
    assert.match(payload, /list_recent_transactions/);
    assert.match(payload, /2026-06-20/);
});

test('financial agent person map exposes display names instead of internal ids', () => {
    const map = messageHandlerTest.buildFinancialAgentPersonByUserId(
        ['agent-daniel', 'agent-thais'],
        [{ user_id: 'agent-thais', display_name: 'Thaís' }],
        { user_id: 'agent-daniel', display_name: 'Daniel' }
    );

    assert.deepStrictEqual(map, {
        'agent-daniel': 'Daniel',
        'agent-thais': 'Thaís'
    });
});

test('Gemini planner is disabled by default and can only produce safe tool plans', () => {
    assert.strictEqual(isLlmPlannerEnabled({}), false);
    assert.strictEqual(isLlmPlannerEnabled({ FINANCIAL_AGENT_LLM_PLANNER_ENABLED: 'true' }), true);

    const prompt = buildPlannerPrompt('Em que dia da semana eu mais gasto?', {
        referenceDate: new Date('2026-06-15T12:00:00.000Z')
    });
    assert.match(prompt, /financial_events_public/);
    assert.match(prompt, /Nao calcule valores|Não calcule valores/i);
    assert.match(prompt, /Data de referencia: 2026-06-15/);
    assert.match(prompt, /Indice de mes para FinancialQueryPlan: 5/);
    assert.match(prompt, /junho=5/);
    assert.match(prompt, /este mes|do mes/i);
    assert.match(prompt, /preserve.*quantidade|quantidade.*solicitada/i);
    assert.match(prompt, /cart[aã]o.*card/i);
    assert.match(prompt, /gastei.*transaction_date|transaction_date.*gastei/i);
    assert.match(prompt, /fatura.*billing_month|billing_month.*fatura/i);
    assert.match(prompt, /operation.*sum|sum.*quanto/i);
    assert.doesNotMatch(prompt, /user_id.*permitido/i);

    const safePlan = normalizePlannerPlan({
        action: 'tool',
        tool: 'run_safe_readonly_sql',
        args: {
            sql: "SELECT weekday, SUM(amount) AS total FROM financial_events_public WHERE event_type IN ('expense', 'card_expense') GROUP BY weekday ORDER BY total DESC LIMIT 7"
        }
    });
    assert.strictEqual(safePlan.action, 'tool');
    assert.strictEqual(safePlan.tool, 'run_safe_readonly_sql');

    const unsafePlan = normalizePlannerPlan({
        action: 'tool',
        tool: 'run_safe_readonly_sql',
        args: { sql: 'SELECT user_id FROM financial_events_public LIMIT 1' }
    });
    assert.strictEqual(unsafePlan.action, 'clarify');
    assert.match(unsafePlan.reason, /unsafe_sql/);

    const queryPlan = normalizePlannerPlan({
        action: 'tool',
        tool: 'query_financial_plan',
        args: {
            plan: {
                kind: 'financial_query',
                domain: 'bills',
                operation: 'list',
                filters: {
                    period: { type: 'month', month: 5, year: 2026 },
                    status: 'pending'
                },
                sort: { by: 'due_date', direction: 'asc' },
                timeBasis: 'due_date'
            }
        }
    });
    assert.strictEqual(queryPlan.action, 'tool');
    assert.strictEqual(queryPlan.tool, 'query_financial_plan');
    assert.strictEqual(queryPlan.args.plan.domain, 'bills');

    const cardFilteredExpensePlan = normalizePlannerPlan({
        action: 'tool',
        tool: 'query_financial_plan',
        args: {
            plan: {
                kind: 'financial_query',
                domain: 'expenses',
                operation: 'summary',
                filters: {
                    period: { type: 'date_range', from: '2026-06-30', to: '2026-07-01' },
                    card: 'Nubank - Thais'
                },
                timeBasis: 'transaction_date'
            }
        }
    });
    assert.strictEqual(cardFilteredExpensePlan.action, 'tool');
    assert.strictEqual(cardFilteredExpensePlan.args.plan.domain, 'cards');
    assert.strictEqual(cardFilteredExpensePlan.args.plan.operation, 'sum');
    assert.strictEqual(cardFilteredExpensePlan.args.plan.filters.card, 'Nubank - Thais');
    assert.strictEqual(cardFilteredExpensePlan.args.plan.timeBasis, 'transaction_date');

    const cardExpenseAliasPlan = normalizePlannerPlan({
        action: 'tool',
        tool: 'query_financial_plan',
        args: {
            plan: {
                kind: 'financial_query',
                domain: 'card_expenses',
                operation: 'sum',
                filters: {
                    period: { type: 'date_range', from: '2026-06-30', to: '2026-07-01' },
                    card: 'Nubank - Thais'
                },
                timeBasis: 'transaction_date'
            }
        }
    });
    assert.strictEqual(cardExpenseAliasPlan.action, 'tool');
    assert.strictEqual(cardExpenseAliasPlan.args.plan.domain, 'cards');
    assert.strictEqual(cardExpenseAliasPlan.args.plan.operation, 'sum');
    assert.strictEqual(cardExpenseAliasPlan.args.plan.filters.card, 'Nubank - Thais');
    assert.strictEqual(cardExpenseAliasPlan.args.plan.timeBasis, 'transaction_date');
    const unsafeQueryPlan = normalizePlannerPlan({
        action: 'tool',
        tool: 'query_financial_plan',
        args: {
            plan: {
                kind: 'financial_query',
                domain: 'expenses',
                operation: 'sum',
                filters: {
                    period: { type: 'month', month: 5, year: 2026 },
                    user_id: 'agent-daniel'
                },
                timeBasis: 'billing_month'
            }
        }
    });
    assert.strictEqual(unsafeQueryPlan.action, 'clarify');
    assert.strictEqual(unsafeQueryPlan.reason, 'invalid_financial_query_plan');
});

test('Gemini planner reference date follows the Sao Paulo calendar day', () => {
    assert.strictEqual(
        plannerTest.formatReferenceDate(new Date('2026-06-15T00:30:00.000Z')),
        '2026-06-14'
    );
    assert.strictEqual(plannerTest.formatReferenceDate('01/07/2026'), '2026-07-01');
});

test('Gemini planner repairs explicit relative dates from the bot civil reference date', () => {
    const rawPlan = normalizePlannerPlan({
        action: 'tool',
        tool: 'query_financial_plan',
        args: {
            plan: {
                kind: 'financial_query',
                domain: 'cards',
                operation: 'sum',
                filters: {
                    period: { type: 'date_range', from: '2026-06-29', to: '2026-06-29' },
                    card: 'Nubank - Thais'
                },
                timeBasis: 'transaction_date'
            }
        }
    });

    const yesterdayPlan = plannerTest.repairPlannerPlanForExplicitRelativeDate(rawPlan, {
        message: 'quanto gastei no cartão nubank thais ontem?',
        referenceDate: '01/07/2026'
    });
    assert.deepStrictEqual(yesterdayPlan.args.plan.filters.period, {
        type: 'date_range',
        from: '2026-06-30',
        to: '2026-06-30',
        label: 'ontem'
    });

    const dayBeforePlan = plannerTest.repairPlannerPlanForExplicitRelativeDate(rawPlan, {
        message: 'quanto gastei no cartão nubank thais anteontem?',
        referenceDate: '01/07/2026'
    });
    assert.deepStrictEqual(dayBeforePlan.args.plan.filters.period, {
        type: 'date_range',
        from: '2026-06-29',
        to: '2026-06-29',
        label: 'anteontem'
    });
});

test('LangGraph financial agent uses Gemini planner fallback for free-form pending bill questions', async () => {
    assert.strictEqual(ensureSqliteReady(), true);
    assert.strictEqual(syncSnapshotToSqlite({
        saidas: [
            { user_id: 'agent-daniel', data: '07/06/2026', descricao: 'Pagamento aluguel', categoria: 'Moradia', subcategoria: 'ALUGUEL', valor: 932.97, month: 5, year: 2026 }
        ],
        cartoes: [],
        entradas: [],
        transferencias: [],
        userSettings: [],
        cartoesConfig: [],
        metas: [],
        movimentacoesMetas: [],
        dividas: [],
        contas: [
            { user_id: 'agent-daniel', headers: ['Nome da Conta', 'Dia do Vencimento', 'Observações', 'user_id', 'Nome Amigável', 'Categoria', 'Subcategoria', 'Valor Esperado', 'Regra Ativa'], row: ['ALUGUEL', '7', '', 'agent-daniel', 'Aluguel', 'Moradia', 'ALUGUEL', '932,97', 'SIM'] },
            { user_id: 'agent-daniel', headers: ['Nome da Conta', 'Dia do Vencimento', 'Observações', 'user_id', 'Nome Amigável', 'Categoria', 'Subcategoria', 'Valor Esperado', 'Regra Ativa'], row: ['NET', '15', '', 'agent-daniel', 'Internet', 'Moradia', 'INTERNET / TELEFONE', '120,00', 'SIM'] }
        ]
    }), true);

    const originalFlag = process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED;
    process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED = 'true';
    plannerTest.setStructuredResponseOverrideForTest(() => ({
        action: 'tool',
        tool: 'query_financial_plan',
        args: {
            plan: {
                kind: 'financial_query',
                domain: 'bills',
                operation: 'list',
                filters: {
                    period: { type: 'month', month: 5, year: 2026 },
                    status: 'pending'
                },
                sort: { by: 'due_date', direction: 'asc' },
                timeBasis: 'due_date'
            }
        }
    }));
    try {
        const result = await invokeFinancialAgent({
            message: 'me diga as obrigações domésticas que ainda estão abertas',
            userIds: ['agent-daniel'],
            personByUserId: { 'agent-daniel': 'Daniel' },
            currentDate: '20/06/2026',
            mode: 'answer'
        });

        assert.strictEqual(result.action, 'answer', JSON.stringify(result));
        assert.strictEqual(result.plan.tool, 'query_financial_plan');
        assert.strictEqual(result.plan.source, 'llm_planner');
        assert.strictEqual(result.toolResult.plan.domain, 'bills');
        assert.strictEqual(result.toolResult.plan.operation, 'list');
        assert.strictEqual(result.verified.ok, true);
        assert.match(result.answer, /pendentes|em aberto/i);
        assert.match(result.answer, /Internet/i);
        assert.match(result.answer, /R\$\s*120,00/i);
        assert.doesNotMatch(result.answer, /Aluguel/i);
        assert.doesNotMatch(result.answer, / · (paid|pending)\b/i);
        assert.doesNotMatch(result.answer, /Contagem de gastos|categoria conta/i);
    } finally {
        plannerTest.setStructuredResponseOverrideForTest(null);
        if (originalFlag === undefined) delete process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED;
        else process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED = originalFlag;
    }
});

test('LangGraph financial agent answers weekday spending for the current month by default', async () => {
    assert.strictEqual(ensureSqliteReady(), true);
    assert.strictEqual(syncSnapshotToSqlite({
        saidas: [
            { user_id: 'agent-daniel', data: '03/05/2026', descricao: 'maio grande', categoria: 'Outros', subcategoria: '', valor: 1000, month: 4, year: 2026 },
            { user_id: 'agent-daniel', data: '20/06/2026', descricao: 'junho um', categoria: 'Outros', subcategoria: '', valor: 40, month: 5, year: 2026 },
            { user_id: 'agent-daniel', data: '20/06/2026', descricao: 'junho dois', categoria: 'Outros', subcategoria: '', valor: 60, month: 5, year: 2026 }
        ],
        cartoes: [],
        entradas: [],
        transferencias: [],
        userSettings: [],
        cartoesConfig: [],
        metas: [],
        movimentacoesMetas: [],
        dividas: [],
        contas: []
    }), true);

    const result = await invokeFinancialAgent({
        message: 'em que dia da semana eu mais gasto?',
        userIds: ['agent-daniel'],
        personByUserId: { 'agent-daniel': 'Daniel' },
        currentDate: '20/06/2026',
        mode: 'answer'
    });

    assert.strictEqual(result.action, 'answer');
    assert.strictEqual(result.plan.tool, 'run_safe_readonly_sql');
    assert.strictEqual(result.verified.ok, true);
    assert.match(result.answer, /R\$\s*100,00/i);
    assert.doesNotMatch(result.answer, /1\.000,00/);
});

test('LangGraph financial agent composes daily average from total divided by days considered', async () => {
    assert.strictEqual(ensureSqliteReady(), true);
    assert.strictEqual(syncSnapshotToSqlite({
        saidas: [
            { user_id: 'agent-daniel', data: '01/06/2026', descricao: 'mercado', categoria: 'Alimentação', subcategoria: '', valor: 40, month: 5, year: 2026 },
            { user_id: 'agent-daniel', data: '20/06/2026', descricao: 'lanche', categoria: 'Alimentação', subcategoria: '', valor: 60, month: 5, year: 2026 }
        ],
        cartoes: [],
        entradas: [],
        transferencias: [],
        userSettings: [],
        cartoesConfig: [],
        metas: [],
        movimentacoesMetas: [],
        dividas: [],
        contas: []
    }), true);

    const result = await invokeFinancialAgent({
        message: 'qual meu gasto médio por dia neste mês?',
        userIds: ['agent-daniel'],
        personByUserId: { 'agent-daniel': 'Daniel' },
        currentDate: '20/06/2026',
        financialQueryPlan: {
            kind: 'financial_query',
            domain: 'expenses',
            operation: 'average',
            filters: { period: { type: 'month', month: 5, year: 2026 }, scope: 'personal' },
            groupBy: ['date'],
            timeBasis: 'billing_month'
        },
        mode: 'answer'
    });

    assert.strictEqual(result.action, 'answer');
    assert.strictEqual(result.verified.ok, true);
    assert.match(result.answer, /m[eé]dia diária/i);
    assert.match(result.answer, /R\$\s*5,00/i);
    assert.match(result.answer, /20 dia/i);
    assert.match(result.answer, /R\$\s*100,00/i);
});

test('LangGraph financial agent compares current month with previous month using both periods', async () => {
    assert.strictEqual(ensureSqliteReady(), true);
    assert.strictEqual(syncSnapshotToSqlite({
        saidas: [
            { user_id: 'agent-daniel', data: '10/05/2026', descricao: 'maio', categoria: 'Outros', subcategoria: '', valor: 40, month: 4, year: 2026 },
            { user_id: 'agent-daniel', data: '10/06/2026', descricao: 'junho', categoria: 'Outros', subcategoria: '', valor: 100, month: 5, year: 2026 }
        ],
        cartoes: [],
        entradas: [],
        transferencias: [],
        userSettings: [],
        cartoesConfig: [],
        metas: [],
        movimentacoesMetas: [],
        dividas: [],
        contas: []
    }), true);

    const result = await invokeFinancialAgent({
        message: 'o que mudou do mês passado para esse mês?',
        userIds: ['agent-daniel'],
        personByUserId: { 'agent-daniel': 'Daniel' },
        currentDate: '20/06/2026',
        financialQueryPlan: {
            kind: 'financial_query',
            domain: 'expenses',
            operation: 'compare',
            filters: { period: { type: 'month', month: 5, year: 2026 }, scope: 'personal' },
            timeBasis: 'billing_month'
        },
        mode: 'answer'
    });

    assert.strictEqual(result.action, 'answer');
    assert.strictEqual(result.verified.ok, true);
    assert.match(result.answer, /R\$\s*100,00/i);
    assert.match(result.answer, /R\$\s*40,00/i);
    assert.match(result.answer, /R\$\s*60,00/i);
    assert.match(result.answer, /150/i);
    assert.doesNotMatch(result.answer, /R\$\s*0,00 de R\$\s*0,00/i);
});

test('LangGraph financial agent gives deterministic cut recommendations instead of a raw ranking', async () => {
    assert.strictEqual(ensureSqliteReady(), true);
    assert.strictEqual(syncSnapshotToSqlite({
        saidas: [
            { user_id: 'agent-daniel', data: '05/06/2026', descricao: 'aluguel', categoria: 'Moradia', subcategoria: '', valor: 1000, month: 5, year: 2026 },
            { user_id: 'agent-daniel', data: '10/06/2026', descricao: 'restaurante', categoria: 'Alimentação', subcategoria: '', valor: 200, month: 5, year: 2026 },
            { user_id: 'agent-daniel', data: '12/06/2026', descricao: 'streaming', categoria: 'Assinaturas', subcategoria: '', valor: 50, month: 5, year: 2026 }
        ],
        cartoes: [],
        entradas: [],
        transferencias: [],
        userSettings: [],
        cartoesConfig: [],
        metas: [],
        movimentacoesMetas: [],
        dividas: [],
        contas: []
    }), true);

    const result = await invokeFinancialAgent({
        message: 'onde posso cortar gastos olhando este mês?',
        userIds: ['agent-daniel'],
        personByUserId: { 'agent-daniel': 'Daniel' },
        currentDate: '20/06/2026',
        financialQueryPlan: {
            kind: 'financial_query',
            domain: 'expenses',
            operation: 'recommend',
            filters: { period: { type: 'month', month: 5, year: 2026 }, scope: 'personal' },
            groupBy: ['category'],
            timeBasis: 'billing_month'
        },
        mode: 'answer'
    });

    assert.strictEqual(result.action, 'answer');
    assert.strictEqual(result.verified.ok, true);
    assert.match(result.answer, /candidatos para revisar/i);
    assert.match(result.answer, /Alimentação/i);
    assert.match(result.answer, /Assinaturas/i);
    assert.match(result.answer, /Moradia/i);
    assert.strictEqual((result.answer.match(/Critério:/g) || []).length, 1);
    assert.doesNotMatch(result.answer, /1\. Moradia: R\$\s*1\.000,00/i);
});

test('LangGraph financial agent overrides legacy merchant ranking when the user asks where to cut expenses', async () => {
    assert.strictEqual(ensureSqliteReady(), true);
    assert.strictEqual(syncSnapshotToSqlite({
        saidas: [
            { user_id: 'agent-daniel', data: '05/06/2026', descricao: 'aluguel', categoria: 'Moradia', subcategoria: '', valor: 1000, month: 5, year: 2026 },
            { user_id: 'agent-daniel', data: '10/06/2026', descricao: 'restaurante', categoria: 'Alimentação', subcategoria: '', valor: 200, month: 5, year: 2026 },
            { user_id: 'agent-daniel', data: '12/06/2026', descricao: 'streaming', categoria: 'Assinaturas', subcategoria: '', valor: 50, month: 5, year: 2026 }
        ],
        cartoes: [],
        entradas: [],
        transferencias: [],
        userSettings: [],
        cartoesConfig: [],
        metas: [],
        movimentacoesMetas: [],
        dividas: [],
        contas: []
    }), true);

    const result = await invokeFinancialAgent({
        message: 'onde posso cortar gastos olhando este mês?',
        userIds: ['agent-daniel'],
        personByUserId: { 'agent-daniel': 'Daniel' },
        currentDate: '20/06/2026',
        financialQueryPlan: {
            kind: 'financial_query',
            domain: 'expenses',
            operation: 'rank',
            filters: { period: { type: 'month', month: 5, year: 2026 }, scope: 'personal' },
            groupBy: ['merchant'],
            timeBasis: 'billing_month'
        },
        mode: 'answer'
    });

    assert.strictEqual(result.action, 'answer');
    assert.strictEqual(result.plan.args.plan.operation, 'recommend');
    assert.deepStrictEqual(result.plan.args.plan.groupBy, ['category']);
    assert.strictEqual(result.verified.ok, true);
    assert.match(result.answer, /candidatos para revisar/i);
    assert.match(result.answer, /Alimentação/i);
    assert.match(result.answer, /Assinaturas/i);
    assert.match(result.answer, /despesas essenciais/i);
});

test('LangGraph financial agent overrides legacy list plans for biggest spending drivers', async () => {
    assert.strictEqual(ensureSqliteReady(), true);
    assert.strictEqual(syncSnapshotToSqlite({
        saidas: [
            { user_id: 'agent-daniel', data: '05/06/2026', descricao: 'restaurante', categoria: 'Alimentação', subcategoria: '', valor: 200, month: 5, year: 2026 },
            { user_id: 'agent-daniel', data: '12/06/2026', descricao: 'mercado', categoria: 'Alimentação', subcategoria: '', valor: 80, month: 5, year: 2026 }
        ],
        cartoes: [],
        entradas: [],
        transferencias: [],
        userSettings: [],
        cartoesConfig: [],
        metas: [],
        movimentacoesMetas: [],
        dividas: [],
        contas: []
    }), true);

    const result = await invokeFinancialAgent({
        message: 'me mostra os principais vilões do mês',
        userIds: ['agent-daniel'],
        personByUserId: { 'agent-daniel': 'Daniel' },
        currentDate: '20/06/2026',
        financialQueryPlan: {
            kind: 'financial_query',
            domain: 'expenses',
            operation: 'list',
            filters: { period: { type: 'month', month: 5, year: 2026 }, scope: 'personal' },
            timeBasis: 'context'
        },
        mode: 'answer'
    });

    assert.strictEqual(result.action, 'answer');
    assert.strictEqual(result.plan.args.plan.operation, 'rank');
    assert.deepStrictEqual(result.plan.args.plan.groupBy, ['merchant']);
    assert.strictEqual(result.verified.ok, true);
    assert.match(result.answer, /restaurante/i);
    assert.match(result.answer, /mercado/i);
    assert.doesNotMatch(result.answer, /05\/06\/2026/);
});

test('contextual financial analyst is explicitly switchable and sanitizes its context packet', () => {
    assert.strictEqual(isContextualAnalystEnabled({}), false);
    assert.strictEqual(isContextualAnalystEnabled({
        FINANCIAL_CONTEXTUAL_ANALYST_MODE: 'answer'
    }), true);

    const packet = buildContextPacket({
        message: 'quais contas ainda não foram pagas?',
        plan: {
            action: 'tool',
            tool: 'query_financial_plan',
            args: {
                user_id: 'internal-user',
                ownerUserId: 'internal-owner',
                plan: {
                    domain: 'bills',
                    operation: 'list',
                    filters: { status: 'pending' },
                    sheet_id: 'internal-sheet'
                }
            }
        },
        toolResult: {
            ok: true,
            tool: 'query_financial_plan',
            result: {
                value: [{
                    name: 'Claro',
                    status: 'pending',
                    pendingValue: 120,
                    user_id: 'internal-user',
                    token: 'secret'
                }]
            },
            criteria: 'Contas pendentes no período.'
        },
        deterministicAnswer: 'Claro está pendente por R$ 120,00.'
    });

    const serialized = JSON.stringify(packet);
    assert.match(serialized, /Claro/);
    assert.doesNotMatch(serialized, /internal-user|internal-owner|internal-sheet|secret|user_id|sheet_id|ownerUserId|token/i);
});

test('contextual financial analyst uses Gemini only to compose a verified read-only answer', async () => {
    contextualAnalystTest.setAskLLMOverride(async () =>
        'A conta da Claro ainda está pendente, no valor de R$ 120,00.'
    );
    try {
        const toolResult = {
            ok: true,
            tool: 'query_financial_plan',
            result: {
                value: [{
                    name: 'Claro',
                    status: 'pending',
                    pendingValue: 120
                }]
            },
            criteria: 'Contas pendentes no período.'
        };
        const contextual = await composeContextualFinancialAnswer({
            message: 'quais contas ainda não foram pagas?',
            plan: {
                action: 'tool',
                tool: 'query_financial_plan',
                args: { plan: { domain: 'bills', operation: 'list' } }
            },
            toolResult,
            deterministicAnswer: 'Claro está pendente por R$ 120,00.',
            env: { FINANCIAL_CONTEXTUAL_ANALYST_MODE: 'answer' }
        });

        assert.strictEqual(contextual.ok, true);
        const selected = selectVerifiedContextualAnswer({
            contextualAnswer: contextual.answer,
            deterministicAnswer: 'Claro está pendente por R$ 120,00.',
            toolResult
        });
        assert.strictEqual(selected.usedContextual, true);
        assert.match(selected.answer, /ainda está pendente/i);
    } finally {
        contextualAnalystTest.setAskLLMOverride(null);
    }
});

test('contextual financial analyst falls back when Gemini invents values or exposes internals', () => {
    const toolResult = {
        ok: true,
        tool: 'query_financial_plan',
        result: {
            value: [{
                name: 'Claro',
                status: 'pending',
                pendingValue: 120
            }]
        }
    };
    const deterministicAnswer = 'Claro está pendente por R$ 120,00.';

    const invented = selectVerifiedContextualAnswer({
        contextualAnswer: 'Claro está pendente por R$ 999,00.',
        deterministicAnswer,
        toolResult
    });
    assert.strictEqual(invented.usedContextual, false);
    assert.strictEqual(invented.answer, deterministicAnswer);
    assert.strictEqual(invented.reason, 'invented_amount');

    const leaked = selectVerifiedContextualAnswer({
        contextualAnswer: 'Consultei seu user_id e a Claro está pendente por R$ 120,00.',
        deterministicAnswer,
        toolResult
    });
    assert.strictEqual(leaked.usedContextual, false);
    assert.strictEqual(leaked.answer, deterministicAnswer);
    assert.strictEqual(leaked.reason, 'internal_data_leak');
});

test('LangGraph applies the contextual analyst to verified read-only answers when enabled', async () => {
    syncAgentSnapshot();
    const previousMode = process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE;
    process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE = 'answer';
    contextualAnalystTest.setAskLLMOverride(async () =>
        'Seu gasto mais recente foi no restaurante, em 05/06/2026, no valor de R$ 75,00, feito por Thais.'
    );

    try {
        const result = await invokeFinancialAgent({
            message: 'consegue me contar qual foi meu último gasto?',
            userIds: ['agent-daniel', 'agent-thais'],
            personByUserId: { 'agent-daniel': 'Daniel', 'agent-thais': 'Thais' },
            currentDate: '20/06/2026',
            mode: 'answer'
        });

        assert.strictEqual(result.action, 'answer', JSON.stringify(result));
        assert.strictEqual(result.verified.ok, true);
        assert.match(result.answer, /gasto mais recente/i);
        assert.match(result.answer, /restaurante/i);
    } finally {
        contextualAnalystTest.setAskLLMOverride(null);
        if (previousMode === undefined) {
            delete process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE;
        } else {
            process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE = previousMode;
        }
    }
});

test('LangGraph keeps the deterministic answer when contextual composition is unsafe', async () => {
    syncAgentSnapshot();
    const previousMode = process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE;
    process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE = 'answer';
    contextualAnalystTest.setAskLLMOverride(async () =>
        'Seu último gasto foi de R$ 999,00 e consultei o user_id interno.'
    );

    try {
        const result = await invokeFinancialAgent({
            message: 'qual foi meu último gasto?',
            userIds: ['agent-daniel', 'agent-thais'],
            personByUserId: { 'agent-daniel': 'Daniel', 'agent-thais': 'Thais' },
            currentDate: '20/06/2026',
            mode: 'answer'
        });

        assert.strictEqual(result.action, 'answer', JSON.stringify(result));
        assert.strictEqual(result.verified.ok, true);
        assert.doesNotMatch(result.answer, /999|user_id/i);
        assert.match(result.answer, /restaurante/i);
        assert.match(result.answer, /R\$\s*75,00/i);
    } finally {
        contextualAnalystTest.setAskLLMOverride(null);
        if (previousMode === undefined) {
            delete process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE;
        } else {
            process.env.FINANCIAL_CONTEXTUAL_ANALYST_MODE = previousMode;
        }
    }
});
