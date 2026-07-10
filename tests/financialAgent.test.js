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
const { verifyAgentAnswer, verifyAgentResult } = require('../src/agent/resultVerifier');
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
    selectRelevantFinancialAgentTools
} = require('../src/agent/financialAgentToolCatalog');
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

test('LangGraph financial agent keeps deterministic budget semantics when Gemini selects an incompatible plan', async () => {
    assert.strictEqual(ensureSqliteReady(), true);
    assert.strictEqual(syncSnapshotToSqlite({
        saidas: [],
        cartoes: [],
        entradas: [],
        transferencias: [],
        cartoesConfig: [],
        metas: [],
        movimentacoesMetas: [],
        dividas: [],
        contas: [],
        userSettings: [{
            user_id: 'agent-daniel',
            monthly_budget_enabled: 'SIM',
            monthly_budget_amount: '938.11',
            monthly_budget_scope: 'family',
            monthly_budget_cycle_start_day: '28'
        }]
    }), true);

    const originalPlannerFlag = process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED;
    process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED = 'true';
    plannerTest.setStructuredResponseOverrideForTest(() => ({
        action: 'tool',
        tool: 'explain_metric',
        args: { metric: 'budget', month: 6, year: 2026 }
    }));
    try {
        const result = await invokeFinancialAgent({
            message: 'Quanto falta do orçamento familiar?',
            userIds: ['agent-daniel', 'agent-thais'],
            personByUserId: { 'agent-daniel': 'Daniel', 'agent-thais': 'Thais' },
            currentDate: '02/07/2026',
            financialQueryPlan: {
                kind: 'financial_query',
                domain: 'budget',
                operation: 'forecast',
                filters: { period: { type: 'cycle', label: 'ciclo atual' }, scope: 'family' },
                timeBasis: 'budget_cycle'
            },
            mode: 'answer'
        });

        assert.strictEqual(result.action, 'answer');
        assert.strictEqual(result.plan.tool, 'query_financial_plan');
        assert.strictEqual(result.toolResult.result.value.active, true);
        assert.strictEqual(result.toolResult.result.value.monthlyAmount, 938.11);

        plannerTest.setStructuredResponseOverrideForTest(() => ({
            action: 'tool',
            tool: 'query_financial_plan',
            args: {
                plan: {
                    kind: 'financial_query',
                    domain: 'budget',
                    operation: 'list',
                    filters: { period: { type: 'month', month: 6, year: 2026 } },
                    timeBasis: 'budget_cycle'
                }
            }
        }));
        const detailResult = await invokeFinancialAgent({
            message: 'Qual o mei orçamento familiar?',
            userIds: ['agent-daniel', 'agent-thais'],
            personByUserId: { 'agent-daniel': 'Daniel', 'agent-thais': 'Thais' },
            currentDate: '03/07/2026',
            financialQueryPlan: {
                kind: 'financial_query',
                domain: 'budget',
                operation: 'detail',
                filters: { period: { type: 'cycle', label: 'ciclo atual' }, scope: 'family' },
                timeBasis: 'budget_cycle'
            },
            mode: 'answer'
        });

        assert.strictEqual(detailResult.plan.tool, 'query_financial_plan');
        assert.strictEqual(detailResult.plan.args.plan.operation, 'detail');
        assert.strictEqual(detailResult.plan.args.plan.filters.period.type, 'cycle');
        assert.doesNotMatch(detailResult.answer, /junho de 2026/i);
    } finally {
        plannerTest.setStructuredResponseOverrideForTest(null);
        if (originalPlannerFlag === undefined) delete process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED;
        else process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED = originalPlannerFlag;
    }
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

    const duplicateDescriptions = runSafeReadonlySql(
        "SELECT description, COUNT(*) AS count FROM financial_events_public WHERE event_type IN ('expense', 'card_expense') GROUP BY description HAVING COUNT(*) > 1 ORDER BY count DESC LIMIT 5",
        {
            rows: [
                { description: 'Mercado', event_type: 'expense' },
                { description: 'Mercado', event_type: 'card_expense' },
                { description: 'Uber', event_type: 'expense' }
            ]
        }
    );

    assert.strictEqual(duplicateDescriptions.ok, true);
    assert.deepStrictEqual(duplicateDescriptions.rows, [{ description: 'Mercado', count: 2 }]);

    assert.strictEqual(validateSafeReadonlySql('UPDATE financial_events_public SET amount = 0').ok, false);
    assert.strictEqual(validateSafeReadonlySql('SELECT user_id FROM financial_events_public LIMIT 1').ok, false);
    assert.strictEqual(validateSafeReadonlySql('SELECT * FROM expenses LIMIT 1').ok, false);
    assert.strictEqual(validateSafeReadonlySql('SELECT * FROM financial_events_public LIMIT 1').ok, false);
    assert.strictEqual(validateSafeReadonlySql('SELECT insertion_order FROM financial_events_public LIMIT 1').ok, false);
    assert.strictEqual(validateSafeReadonlySql('SELECT amount, source_row_ref FROM financial_events_public LIMIT 1').ok, false);
    assert.strictEqual(validateSafeReadonlySql('SELECT amount FROM financial_events_public WHERE source_row_ref IS NULL LIMIT 1').ok, false);
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

test('financial agent answers account balance questions from the canonical accounts canary', async () => {
    syncAgentSnapshot();
    const dbPath = path.join(os.tmpdir(), `canonical-agent-accounts-canary-${Date.now()}-${Math.random()}.sqlite`);
    const store = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    store.persistProjection({
        runId: 'agent-accounts-canary-run',
        projected: {
            accounts: [
                {
                    account_id: 'acct_agent_nubank',
                    household_id: 'household-agent',
                    owner_person_id: 'agent-daniel',
                    account_type: 'bank',
                    name: 'Daniel - Nubank',
                    currency: 'BRL',
                    opening_balance_cents: 26285,
                    opened_on: '2026-07-03',
                    status: 'active'
                },
                {
                    account_id: 'acct_agent_caixinha',
                    household_id: 'household-agent',
                    owner_person_id: 'agent-daniel',
                    account_type: 'wallet',
                    name: 'Daniel - Nubank Caixinha',
                    currency: 'BRL',
                    opening_balance_cents: 126491,
                    opened_on: '2026-07-03',
                    status: 'active'
                },
                {
                    account_id: 'acct_agent_thais_nubank',
                    household_id: 'household-agent',
                    owner_person_id: 'agent-thais',
                    account_type: 'bank',
                    name: 'Thais - Nubank',
                    currency: 'BRL',
                    opening_balance_cents: 0,
                    opened_on: '2026-07-03',
                    status: 'active'
                },
                {
                    account_id: 'acct_agent_thais_itau',
                    household_id: 'household-agent',
                    owner_person_id: 'agent-thais',
                    account_type: 'bank',
                    name: 'Thais - Itaú',
                    currency: 'BRL',
                    opening_balance_cents: 13346,
                    opened_on: '2026-07-03',
                    status: 'active'
                }
            ]
        },
        publicProjection: [],
        report: {
            report_type: 'canonical_ledger_receipt_shadow',
            schema_version: 'canonical-ledger-v1',
            synthetic_fixture_only: false
        }
    });

    const env = {
        NODE_ENV: 'production',
        CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
        CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true',
        CANONICAL_LEDGER_PRODUCTION_SHADOW_APPROVED: 'true',
        CANONICAL_LEDGER_CANARY_READ_ENABLED: 'true',
        CANONICAL_LEDGER_CANARY_READ_APPROVED: 'true',
        CANONICAL_LEDGER_CANARY_READ_DOMAINS: 'accounts',
        CANONICAL_LEDGER_SHADOW_DB_PATH: dbPath
    };
    const originalEnv = {};
    for (const [key, value] of Object.entries(env)) {
        originalEnv[key] = process.env[key];
        process.env[key] = value;
    }
    try {
        const totalResult = await invokeFinancialAgent({
            message: 'Qual o saldo das minhas contas?',
            userIds: ['agent-daniel'],
            personByUserId: { 'agent-daniel': 'Daniel' },
            currentDate: '04/07/2026',
            financialQueryPlan: {
                kind: 'financial_query',
                domain: 'accounts',
                operation: 'detail',
                filters: { scope: 'personal' },
                timeBasis: 'current_state'
            },
            mode: 'answer',
        });

        assert.strictEqual(totalResult.action, 'answer', JSON.stringify(totalResult));
        assert.strictEqual(totalResult.verified.ok, true, JSON.stringify(totalResult));
        assert.match(totalResult.answer, /Saldo total das contas/i);
        assert.strictEqual(totalResult.plan.tool, 'query_financial_plan');
        assert.strictEqual(totalResult.toolResult.source, 'canonical');
        assert.match(totalResult.answer, /Daniel - Nubank/i);
        assert.match(totalResult.answer, /Daniel - Nubank Caixinha/i);
        assert.match(totalResult.answer, /R\$\s*1\.527,76/i);
        assert.doesNotMatch(JSON.stringify(totalResult), /acct_agent|owner_person_id|source_row_hash|idempotency_key/i);

        const caixinhaResult = await invokeFinancialAgent({
            message: 'Quanto tenho na caixinha?',
            userIds: ['agent-daniel'],
            personByUserId: { 'agent-daniel': 'Daniel' },
            currentDate: '04/07/2026',
            financialQueryPlan: {
                kind: 'financial_query',
                domain: 'accounts',
                operation: 'sum',
                filters: { scope: 'personal', account: 'caixinha' },
                timeBasis: 'current_state'
            },
            mode: 'answer',
            canonicalLedgerDbPath: dbPath
        });

        assert.strictEqual(caixinhaResult.action, 'answer', JSON.stringify(caixinhaResult));
        assert.strictEqual(caixinhaResult.verified.ok, true, JSON.stringify(caixinhaResult));
        assert.match(caixinhaResult.answer, /R\$\s*1\.264,91/i);
        assert.doesNotMatch(caixinhaResult.answer, /R\$\s*262,85/i);

        const namedAccountResult = await invokeFinancialAgent({
            message: 'Quanto tenho na conta Daniel Nubank?',
            userIds: ['agent-daniel'],
            personByUserId: { 'agent-daniel': 'Daniel' },
            currentDate: '04/07/2026',
            financialQueryPlan: {
                kind: 'financial_query',
                domain: 'accounts',
                operation: 'sum',
                filters: { scope: 'personal' },
                timeBasis: 'current_state'
            },
            mode: 'answer',
            canonicalLedgerDbPath: dbPath
        });

        assert.strictEqual(namedAccountResult.action, 'answer', JSON.stringify(namedAccountResult));
        assert.strictEqual(namedAccountResult.verified.ok, true, JSON.stringify(namedAccountResult));
        assert.match(namedAccountResult.answer, /R\$\s*262,85/i);
        assert.doesNotMatch(namedAccountResult.answer, /R\$\s*1\.527,76/i);

        const thaisAccountResult = await invokeFinancialAgent({
            message: 'Quanto temos na conta Thais Itau?',
            userIds: ['agent-daniel', 'agent-thais'],
            personByUserId: { 'agent-daniel': 'Daniel', 'agent-thais': 'Thais' },
            currentDate: '04/07/2026',
            financialQueryPlan: {
                kind: 'financial_query',
                domain: 'accounts',
                operation: 'sum',
                filters: { scope: 'family' },
                timeBasis: 'current_state'
            },
            mode: 'answer',
            canonicalLedgerDbPath: dbPath
        });

        assert.strictEqual(thaisAccountResult.action, 'answer', JSON.stringify(thaisAccountResult));
        assert.strictEqual(thaisAccountResult.verified.ok, true, JSON.stringify(thaisAccountResult));
        assert.match(thaisAccountResult.answer, /R\$\s*133,46/i);
        assert.doesNotMatch(thaisAccountResult.answer, /R\$\s*1\.527,76/i);

        const missingAccountResult = await queryFinancialPlanTool({
            plan: {
                kind: 'financial_query',
                domain: 'accounts',
                operation: 'sum',
                filters: { scope: 'personal', account: 'conta fantasma' },
                timeBasis: 'current_state'
            },
            userIds: ['agent-daniel'],
            personByUserId: { 'agent-daniel': 'Daniel' },
            env,
            canonicalLedgerDbPath: dbPath
        });
        assert.strictEqual(missingAccountResult.ok, false);
        assert.strictEqual(missingAccountResult.source, 'canonical');
        assert.strictEqual(missingAccountResult.reason, 'account_not_found');

        const disabledCanaryResult = await queryFinancialPlanTool({
            plan: {
                kind: 'financial_query',
                domain: 'accounts',
                operation: 'sum',
                filters: { scope: 'personal' },
                timeBasis: 'current_state'
            },
            userIds: ['agent-daniel'],
            personByUserId: { 'agent-daniel': 'Daniel' },
            env: { ...env, CANONICAL_LEDGER_CANARY_READ_DOMAINS: 'transactions' },
            canonicalLedgerDbPath: dbPath
        });
        assert.strictEqual(disabledCanaryResult.ok, false);
        assert.strictEqual(disabledCanaryResult.source, 'canonical');
        assert.notStrictEqual(disabledCanaryResult.reason, 'read_model_unavailable');
    } finally {
        for (const [key, value] of Object.entries(originalEnv)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
});
test('financial agent recent transfer queries use the canonical transfers canary domain', async () => {
    const synced = syncSnapshotToSqlite({
        saidas: [],
        cartoes: [],
        entradas: [],
        transferencias: [
            { user_id: 'agent-daniel', data: '20/06/2026', descricao: 'transferencia legada', valor: 10, origem: 'Conta A', destino: 'Conta B', metodo: 'PIX', status: 'Transferência interna', month: 5, year: 2026 }
        ],
        userSettings: [],
        cartoesConfig: [],
        metas: [],
        movimentacoesMetas: [],
        dividas: [],
        contas: []
    });
    assert.strictEqual(synced, true);

    const dbPath = path.join(os.tmpdir(), `canonical-agent-transfer-canary-${Date.now()}-${Math.random()}.sqlite`);
    const store = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    store.persistProjection({
        runId: 'agent-transfer-canary-run',
        projected: {
            events: [{
                event_id: 'evt_agent_transfer_canary_1',
                owner_person_id: 'agent-daniel',
                actor_person_id: 'agent-daniel',
                kind: 'transfer',
                status: 'settled',
                description: 'transferencia canonica',
                amount_cents: 5432,
                currency: 'BRL',
                occurred_on: '2026-06-22',
                effective_on: '2026-06-22',
                competence_month: '2026-06',
                category_status: 'not_applicable',
                free_budget_eligible: false,
                net_income_expense_impact: 0,
                source_type: 'sheet.transferencias',
                source_row_ref: 'row-transfer-canary-1',
                source_id_hash: 'source-hash-transfer-canary-1',
                source_row_hash: 'row-hash-transfer-canary-1',
                idempotency_key: 'idem-transfer-canary-1',
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
        eventTypes: ['transfer'],
        limit: 1,
        env: {
            NODE_ENV: 'production',
            CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
            CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true',
            CANONICAL_LEDGER_PRODUCTION_SHADOW_APPROVED: 'true',
            CANONICAL_LEDGER_CANARY_READ_ENABLED: 'true',
            CANONICAL_LEDGER_CANARY_READ_APPROVED: 'true',
            CANONICAL_LEDGER_CANARY_READ_DOMAINS: 'transfers'
        },
        canonicalLedgerDbPath: dbPath
    });

    assert.strictEqual(latest.ok, true);
    assert.strictEqual(latest.source, 'canonical');
    assert.strictEqual(latest.fallbackReason, null);
    assert.strictEqual(latest.rows[0].event_type, 'transfer');
    assert.strictEqual(latest.rows[0].description, 'transferencia canonica');
    assert.strictEqual(latest.rows[0].amount, 54.32);
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

test('LangGraph keeps a trusted dashboard plan ahead of account keyword heuristics', async () => {
    syncAgentSnapshot();

    const result = await invokeFinancialAgent({
        message: 'por que meu disponível é diferente do saldo?',
        userIds: ['agent-daniel', 'agent-thais'],
        ownerUserId: 'agent-daniel',
        personByUserId: { 'agent-daniel': 'Daniel', 'agent-thais': 'Thais' },
        currentDate: '20/06/2026',
        financialQueryPlan: {
            kind: 'financial_query',
            domain: 'dashboard',
            operation: 'explain',
            filters: { period: { type: 'month', month: 5, year: 2026 } },
            timeBasis: 'transaction_date'
        },
        mode: 'answer'
    });

    assert.strictEqual(result.action, 'answer', JSON.stringify(result));
    assert.strictEqual(result.plan.tool, 'explain_metric');
    assert.strictEqual(result.verified.ok, true);
});

test('LangGraph keeps a trusted goals plan ahead of account keyword heuristics', async () => {
    syncAgentSnapshot();

    const result = await invokeFinancialAgent({
        message: 'explique o saldo da meta',
        userIds: ['agent-daniel'],
        personByUserId: { 'agent-daniel': 'Daniel' },
        currentDate: '20/06/2026',
        financialQueryPlan: {
            kind: 'financial_query',
            domain: 'goals',
            operation: 'explain',
            filters: { scope: 'personal' },
            timeBasis: 'current_state'
        },
        mode: 'answer'
    });

    assert.strictEqual(result.action, 'answer', JSON.stringify(result));
    assert.strictEqual(result.plan.tool, 'query_financial_plan');
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

test('financial agent analytical legacy fallback can be disabled by domain after parity gates', () => {
    const gapResult = {
        action: 'clarify',
        migrationGap: {
            tag: 'engine_gap',
            reason: 'planner_gap',
            domain: 'expenses',
            tool: 'query_financial_plan'
        }
    };

    assert.strictEqual(messageHandlerTest.shouldUseAnalyticalLegacyFallback({
        financialAgentMode: 'answer',
        agentResult: gapResult,
        env: {}
    }), true);
    assert.strictEqual(messageHandlerTest.shouldUseAnalyticalLegacyFallback({
        financialAgentMode: 'answer',
        agentResult: gapResult,
        env: { FINANCIAL_AGENT_ANALYTICAL_LEGACY_FALLBACK_DISABLED_DOMAINS: 'cards,expenses' }
    }), false);
    assert.strictEqual(messageHandlerTest.shouldUseAnalyticalLegacyFallback({
        financialAgentMode: 'answer',
        agentResult: gapResult,
        env: { FINANCIAL_AGENT_ANALYTICAL_LEGACY_FALLBACK_DISABLED_DOMAINS: '*' }
    }), false);
    assert.strictEqual(messageHandlerTest.shouldUseAnalyticalLegacyFallback({
        financialAgentMode: 'shadow',
        agentResult: gapResult,
        env: { FINANCIAL_AGENT_ANALYTICAL_LEGACY_FALLBACK_DISABLED_DOMAINS: '*' }
    }), true);
    assert.match(
        messageHandlerTest.buildAnalyticalLegacyFallbackDisabledReply(gapResult),
        /não consegui responder essa análise com segurança/i
    );
    assert.doesNotMatch(
        messageHandlerTest.buildAnalyticalLegacyFallbackDisabledReply(gapResult),
        /user_id|sheet|spreadsheet|token|raw|agent-daniel/i
    );
});
test('LangGraph tags analytical planner gaps for controlled legacy reduction', async () => {
    const originalPlannerFlag = process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED;
    process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED = 'false';
    try {
        const result = await invokeFinancialAgent({
            message: 'quanto economizei com promoções este mês?',
            userIds: ['agent-daniel'],
            personByUserId: { 'agent-daniel': 'Daniel' },
            currentDate: '20/06/2026',
            mode: 'answer'
        });

        assert.strictEqual(result.action, 'clarify');
        assert.deepStrictEqual(result.migrationGap, {
            tag: 'engine_gap',
            reason: 'planner_gap',
            surface: 'financial_agent',
            tool: null,
            domain: null
        });
        assert.doesNotMatch(JSON.stringify(result.migrationGap), /user_id|agent-daniel|sheet|token|raw/i);
    } finally {
        if (originalPlannerFlag === undefined) delete process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED;
        else process.env.FINANCIAL_AGENT_LLM_PLANNER_ENABLED = originalPlannerFlag;
    }
});

test('message handler builds sanitized analytical migration-gap telemetry', () => {
    const telemetry = messageHandlerTest.buildFinancialAgentMigrationGapTelemetry({
        action: 'clarify',
        migrationGap: {
            tag: 'unsupported_filter',
            reason: 'planner_gap user_id=agent-daniel raw sheet token',
            surface: 'financial_agent',
            tool: 'query_financial_plan',
            domain: 'card'
        }
    });

    assert.deepStrictEqual(telemetry, {
        tag: 'unsupported_filter',
        reason: 'redacted_gap_reason',
        surface: 'financial_agent',
        tool: 'query_financial_plan',
        domain: 'card',
        action: 'clarify'
    });
    assert.doesNotMatch(JSON.stringify(telemetry), /user_id|agent-daniel|sheet|token|raw/i);

    const unsafe = messageHandlerTest.buildFinancialAgentMigrationGapTelemetry({
        action: 'answer',
        migrationGap: {
            tag: 'anything',
            reason: '',
            tool: 'raw_rows',
            domain: 'spreadsheet_id'
        }
    });
    assert.deepStrictEqual(unsafe, {
        tag: 'engine_gap',
        reason: 'unknown',
        surface: 'financial_agent',
        tool: null,
        domain: null,
        action: 'answer'
    });
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
    assert.match(prompt, /hoje=2026-06-15, ontem=2026-06-14, anteontem=2026-06-13/);
    assert.match(prompt, /junho=5/);
    assert.match(prompt, /este mes|do mes/i);
    assert.match(prompt, /preserve.*quantidade|quantidade.*solicitada/i);
    assert.match(prompt, /cart[aã]o.*card/i);
    assert.match(prompt, /gastei.*transaction_date|transaction_date.*gastei/i);
    assert.match(prompt, /fatura.*billing_month|billing_month.*fatura/i);
    assert.match(prompt, /operation.*sum|sum.*quanto/i);
    assert.match(prompt, /Ferramentas selecionadas/);
    assert.match(prompt, /run_safe_readonly_sql/);
    assert.match(prompt, /query_financial_plan/);
    assert.doesNotMatch(prompt, /- get_dashboard_snapshot|"tool":"get_dashboard_snapshot"/);
    assert.doesNotMatch(prompt, /- explain_metric|"tool":"explain_metric"/);
    assert.doesNotMatch(prompt, /- list_recent_transactions|"tool":"list_recent_transactions"/);
    assert.match(prompt, /Escopo.*injetad[oa]s? pela aplicacao|escopo.*injetad[oa]s? pela aplicacao/i);
    assert.doesNotMatch(prompt, /`n/);
    assert.doesNotMatch(prompt, /user_id.*permitido/i);

    const recentPrompt = buildPlannerPrompt('Quais foram meus ultimos 4 gastos no cartao Nubank - Thais?', {
        referenceDate: new Date('2026-06-15T12:00:00.000Z')
    });
    assert.match(recentPrompt, /list_recent_transactions/);
    assert.match(recentPrompt, /query_financial_plan/);
    assert.doesNotMatch(recentPrompt, /- run_safe_readonly_sql|"tool":"run_safe_readonly_sql"/);
    assert.doesNotMatch(recentPrompt, /- get_dashboard_snapshot|"tool":"get_dashboard_snapshot"/);

    const dashboardPrompt = buildPlannerPrompt('Explique o indicador disponivel do dashboard', {
        referenceDate: new Date('2026-06-15T12:00:00.000Z')
    });
    assert.match(dashboardPrompt, /get_dashboard_snapshot/);
    assert.match(dashboardPrompt, /explain_metric/);
    assert.doesNotMatch(dashboardPrompt, /- run_safe_readonly_sql|"tool":"run_safe_readonly_sql"/);

    assert.deepStrictEqual(
        selectRelevantFinancialAgentTools('Explique o indicador disponivel do dashboard').map(tool => tool.id),
        ['query_financial_plan', 'get_dashboard_snapshot', 'explain_metric']
    );

    const safePlan = normalizePlannerPlan({
        action: 'tool',
        tool: 'run_safe_readonly_sql',
        args: {
            sql: "SELECT weekday, SUM(amount) AS total FROM financial_events_public WHERE event_type IN ('expense', 'card_expense') GROUP BY weekday ORDER BY total DESC LIMIT 7"
        }
    });
    assert.strictEqual(safePlan.action, 'tool');
    assert.strictEqual(safePlan.tool, 'run_safe_readonly_sql');

    const unselectedToolPlan = normalizePlannerPlan({
        action: 'tool',
        tool: 'get_dashboard_snapshot',
        args: { month: 5, year: 2026 }
    }, {
        allowedToolIds: new Set(['query_financial_plan'])
    });
    assert.strictEqual(unselectedToolPlan, null);

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

test('financial agent forecast queries use the canonical forecast canary without changing current cash', async () => {
    syncAgentSnapshot();
    const dbPath = path.join(os.tmpdir(), `canonical-agent-forecast-canary-${Date.now()}-${Math.random()}.sqlite`);
    const store = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    store.persistProjection({
        runId: 'agent-forecast-canary-run',
        projected: {
            events: [
                {
                    event_id: 'evt_agent_future_income',
                    household_id: 'household-agent',
                    owner_person_id: 'agent-daniel',
                    actor_person_id: 'agent-daniel',
                    kind: 'income',
                    status: 'pending',
                    description: 'reembolso futuro',
                    amount_cents: 5000,
                    currency: 'BRL',
                    occurred_on: '2026-07-30',
                    effective_on: '2026-07-30',
                    due_on: '2026-07-30',
                    source_type: 'sheet.entradas',
                    source_row_ref: 'row-income-future',
                    source_id_hash: 'source-income-future',
                    source_row_hash: 'hash-income-future',
                    idempotency_key: 'idem-income-future'
                },
                {
                    event_id: 'evt_agent_pending_transfer',
                    household_id: 'household-agent',
                    owner_person_id: 'agent-daniel',
                    actor_person_id: 'agent-daniel',
                    kind: 'transfer',
                    status: 'pending',
                    description: 'pix pendente para Thais',
                    amount_cents: 1234,
                    currency: 'BRL',
                    occurred_on: '2026-07-10',
                    effective_on: '2026-07-10',
                    due_on: null,
                    source_type: 'sheet.transferencias',
                    source_row_ref: 'row-transfer-future',
                    source_id_hash: 'source-transfer-future',
                    source_row_hash: 'hash-transfer-future',
                    idempotency_key: 'idem-transfer-future'
                }
            ],
            lines: [
                {
                    line_id: 'line_agent_pending_transfer_cash',
                    event_id: 'evt_agent_pending_transfer',
                    line_type: 'cash',
                    direction: 'outflow',
                    amount_cents: 1234,
                    currency: 'BRL',
                    metadata_hash: 'meta-agent-pending-transfer-cash'
                }
            ],
            recurrenceRules: [
                {
                    recurrence_rule_id: 'rr_agent_phone',
                    household_id: 'household-agent',
                    owner_person_id: 'agent-daniel',
                    source_type: 'sheet.contas',
                    source_row_ref: 'row-phone-rule',
                    rule_type: 'bill',
                    status: 'active',
                    description: 'Conta telefone futura',
                    frequency: 'monthly',
                    due_day: 20,
                    amount_cents: 12000,
                    currency: 'BRL'
                }
            ],
            recurrenceOccurrences: [
                {
                    recurrence_occurrence_id: 'occ_agent_phone_2026_07',
                    recurrence_rule_id: 'rr_agent_phone',
                    source_type: 'sheet.contas',
                    source_row_ref: 'row-phone-rule',
                    competence_month: '2026-07',
                    due_on: '2026-07-20',
                    status: 'pending',
                    amount_cents: 12000,
                    currency: 'BRL',
                    description: 'Conta telefone futura'
                }
            ],
            reconciliationLinks: []
        },
        publicProjection: [],
        report: {
            report_type: 'canonical_ledger_receipt_shadow',
            schema_version: 'canonical-ledger-v1',
            synthetic_fixture_only: false
        }
    });
    store.close();

    const env = {
        NODE_ENV: 'production',
        CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
        CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true',
        CANONICAL_LEDGER_PRODUCTION_SHADOW_APPROVED: 'true',
        CANONICAL_LEDGER_CANARY_READ_ENABLED: 'true',
        CANONICAL_LEDGER_CANARY_READ_APPROVED: 'true',
        CANONICAL_LEDGER_CANARY_READ_DOMAINS: 'forecast'
    };

    const payableForecast = await queryFinancialPlanTool({
        plan: {
            kind: 'financial_query',
            domain: 'forecast',
            operation: 'forecast',
            filters: { period: { type: 'date_range', from: '2026-07-01', to: '2026-07-31' }, type: 'payable' },
            sort: { by: 'due_date', direction: 'asc' },
            limit: 10,
            timeBasis: 'due_date'
        },
        userIds: ['agent-daniel', 'agent-thais'],
        personByUserId: { 'agent-daniel': 'Daniel', 'agent-thais': 'Thais' },
        currentDate: '05/07/2026',
        env,
        canonicalLedgerDbPath: dbPath
    });

    assert.strictEqual(payableForecast.ok, true, JSON.stringify(payableForecast));
    assert.strictEqual(payableForecast.source, 'canonical');
    assert.strictEqual(payableForecast.result.value.payable, 132.34);
    assert.strictEqual(payableForecast.result.value.receivable, 0);
    assert.strictEqual(payableForecast.result.value.currentCashImpact, 0);
    assert.deepStrictEqual(payableForecast.result.value.items.map(item => [item.domain, item.date, item.value, item.affectsCurrentCash]), [
        ['transfer', '10/07/2026', 12.34, false],
        ['bill', '20/07/2026', 120, false]
    ]);
    assert.match(payableForecast.result.value.criteria, /Pendencias nao alteram saldo atual/i);
    assert.doesNotMatch(JSON.stringify(payableForecast), /agent-daniel|owner_person_id|source_row_hash|idempotency_key/i);

    const bills = await queryFinancialPlanTool({
        plan: {
            kind: 'financial_query',
            domain: 'bills',
            operation: 'list',
            filters: { period: { type: 'date_range', from: '2026-07-01', to: '2026-07-31' }, status: 'pending' },
            sort: { by: 'due_date', direction: 'asc' },
            limit: 10,
            timeBasis: 'due_date'
        },
        userIds: ['agent-daniel'],
        personByUserId: { 'agent-daniel': 'Daniel' },
        currentDate: '05/07/2026',
        env,
        canonicalLedgerDbPath: dbPath
    });
    assert.strictEqual(bills.ok, true, JSON.stringify(bills));
    assert.strictEqual(bills.source, 'canonical');
    assert.deepStrictEqual(bills.result.value.map(item => [item.description, item.value]), [
        ['Conta telefone futura', 120]
    ]);

    const blocked = await queryFinancialPlanTool({
        plan: {
            kind: 'financial_query',
            domain: 'forecast',
            operation: 'sum',
            filters: { period: { type: 'date_range', from: '2026-07-01', to: '2026-07-31' }, type: 'payable' },
            timeBasis: 'due_date'
        },
        userIds: ['agent-daniel'],
        env: { ...env, CANONICAL_LEDGER_CANARY_READ_DOMAINS: 'accounts' },
        canonicalLedgerDbPath: dbPath
    });
    assert.strictEqual(blocked.ok, false);
    assert.strictEqual(blocked.reason, 'canary_domain_disabled');
});
test('financial agent forecast relative windows exclude cancelled and out-of-window items', async () => {
    syncAgentSnapshot();
    const dbPath = path.join(os.tmpdir(), 'canonical-agent-forecast-adversarial-' + Date.now() + '-' + Math.random() + '.sqlite');
    const store = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    store.persistProjection({
        runId: 'agent-forecast-adversarial-run',
        projected: {
            events: [
                {
                    event_id: 'evt_agent_income_relative',
                    household_id: 'household-agent',
                    owner_person_id: 'agent-daniel',
                    actor_person_id: 'agent-daniel',
                    kind: 'income',
                    status: 'pending',
                    description: 'reembolso nos proximos dias',
                    amount_cents: 4300,
                    currency: 'BRL',
                    occurred_on: '2026-07-06',
                    effective_on: '2026-07-06',
                    due_on: '2026-07-06',
                    source_type: 'sheet.entradas',
                    source_row_ref: 'row-income-relative',
                    source_id_hash: 'source-income-relative',
                    source_row_hash: 'hash-income-relative',
                    idempotency_key: 'idem-income-relative'
                },
                {
                    event_id: 'evt_agent_transfer_relative',
                    household_id: 'household-agent',
                    owner_person_id: 'agent-daniel',
                    actor_person_id: 'agent-daniel',
                    kind: 'transfer',
                    status: 'pending',
                    description: 'pix pendente dentro da semana',
                    amount_cents: 1234,
                    currency: 'BRL',
                    occurred_on: '2026-07-10',
                    effective_on: '2026-07-10',
                    due_on: null,
                    source_type: 'sheet.transferencias',
                    source_row_ref: 'row-transfer-relative',
                    source_id_hash: 'source-transfer-relative',
                    source_row_hash: 'hash-transfer-relative',
                    idempotency_key: 'idem-transfer-relative'
                }
            ],
            lines: [
                {
                    line_id: 'line_agent_transfer_relative_cash',
                    event_id: 'evt_agent_transfer_relative',
                    line_type: 'cash',
                    direction: 'outflow',
                    amount_cents: 1234,
                    currency: 'BRL',
                    metadata_hash: 'meta-agent-transfer-relative-cash'
                }
            ],
            recurrenceOccurrences: [
                {
                    recurrence_occurrence_id: 'occ_agent_uncertain_2026_07_06',
                    recurrence_rule_id: 'rr_agent_uncertain',
                    source_type: 'sheet.contas',
                    source_row_ref: 'row-uncertain-rule',
                    competence_month: '2026-07',
                    due_on: '2026-07-06',
                    status: 'uncertain',
                    amount_cents: 777,
                    currency: 'BRL',
                    description: 'Conta incerta da semana'
                },
                {
                    recurrence_occurrence_id: 'occ_agent_bill_2026_07_11',
                    recurrence_rule_id: 'rr_agent_bill',
                    source_type: 'sheet.contas',
                    source_row_ref: 'row-bill-rule',
                    competence_month: '2026-07',
                    due_on: '2026-07-11',
                    status: 'pending',
                    amount_cents: 1100,
                    currency: 'BRL',
                    description: 'Conta dentro da semana'
                },
                {
                    recurrence_occurrence_id: 'occ_agent_cancelled_2026_07_07',
                    recurrence_rule_id: 'rr_agent_cancelled',
                    source_type: 'sheet.contas',
                    source_row_ref: 'row-cancelled-rule',
                    competence_month: '2026-07',
                    due_on: '2026-07-07',
                    status: 'cancelled',
                    amount_cents: 99999,
                    currency: 'BRL',
                    description: 'Conta cancelada da semana'
                },
                {
                    recurrence_occurrence_id: 'occ_agent_outside_2026_07_12',
                    recurrence_rule_id: 'rr_agent_outside',
                    source_type: 'sheet.contas',
                    source_row_ref: 'row-outside-rule',
                    competence_month: '2026-07',
                    due_on: '2026-07-12',
                    status: 'pending',
                    amount_cents: 88888,
                    currency: 'BRL',
                    description: 'Conta fora da semana'
                }
            ],
            invoices: [],
            recurrenceRules: [
                {
                    recurrence_rule_id: 'rr_agent_uncertain',
                    household_id: 'household-agent',
                    owner_person_id: 'agent-daniel',
                    source_type: 'sheet.contas',
                    source_row_ref: 'row-uncertain-rule',
                    rule_type: 'bill',
                    status: 'active',
                    description: 'Conta incerta da semana',
                    frequency: 'monthly',
                    due_day: 6,
                    amount_cents: 777,
                    currency: 'BRL'
                },
                {
                    recurrence_rule_id: 'rr_agent_bill',
                    household_id: 'household-agent',
                    owner_person_id: 'agent-daniel',
                    source_type: 'sheet.contas',
                    source_row_ref: 'row-bill-rule',
                    rule_type: 'bill',
                    status: 'active',
                    description: 'Conta dentro da semana',
                    frequency: 'monthly',
                    due_day: 11,
                    amount_cents: 1100,
                    currency: 'BRL'
                },
                {
                    recurrence_rule_id: 'rr_agent_cancelled',
                    household_id: 'household-agent',
                    owner_person_id: 'agent-daniel',
                    source_type: 'sheet.contas',
                    source_row_ref: 'row-cancelled-rule',
                    rule_type: 'bill',
                    status: 'active',
                    description: 'Conta cancelada da semana',
                    frequency: 'monthly',
                    due_day: 7,
                    amount_cents: 99999,
                    currency: 'BRL'
                },
                {
                    recurrence_rule_id: 'rr_agent_outside',
                    household_id: 'household-agent',
                    owner_person_id: 'agent-daniel',
                    source_type: 'sheet.contas',
                    source_row_ref: 'row-outside-rule',
                    rule_type: 'bill',
                    status: 'active',
                    description: 'Conta fora da semana',
                    frequency: 'monthly',
                    due_day: 12,
                    amount_cents: 88888,
                    currency: 'BRL'
                }
            ],
            reconciliationLinks: []
        },
        publicProjection: [],
        report: {
            report_type: 'canonical_ledger_receipt_shadow',
            schema_version: 'canonical-ledger-v1',
            synthetic_fixture_only: false
        }
    });
    store.close();

    const env = {
        NODE_ENV: 'production',
        CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
        CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true',
        CANONICAL_LEDGER_PRODUCTION_SHADOW_APPROVED: 'true',
        CANONICAL_LEDGER_CANARY_READ_ENABLED: 'true',
        CANONICAL_LEDGER_CANARY_READ_APPROVED: 'true',
        CANONICAL_LEDGER_CANARY_READ_DOMAINS: 'forecast'
    };

    const payable = await queryFinancialPlanTool({
        plan: {
            kind: 'financial_query',
            domain: 'forecast',
            operation: 'forecast',
            filters: { period: { type: 'relative', days: 7 }, type: 'payable' },
            sort: { by: 'due_date', direction: 'asc' },
            limit: 10,
            timeBasis: 'due_date'
        },
        userIds: ['agent-daniel', 'agent-thais'],
        personByUserId: { 'agent-daniel': 'Daniel', 'agent-thais': 'Thais' },
        currentDate: '05/07/2026',
        env,
        canonicalLedgerDbPath: dbPath
    });

    assert.strictEqual(payable.ok, true, JSON.stringify(payable));
    assert.strictEqual(payable.result.details.window.from, '2026-07-05');
    assert.strictEqual(payable.result.details.window.to, '2026-07-11');
    assert.strictEqual(payable.result.value.payable, 31.11);
    assert.strictEqual(payable.result.value.currentCashImpact, 0);
    assert.deepStrictEqual(payable.result.value.items.map(item => [item.description, item.status, item.date, item.value]), [
        ['Conta incerta da semana', 'uncertain', '06/07/2026', 7.77],
        ['pix pendente dentro da semana', 'pending', '10/07/2026', 12.34],
        ['Conta dentro da semana', 'pending', '11/07/2026', 11]
    ]);
    assert.doesNotMatch(JSON.stringify(payable), /cancelada|fora da semana|owner_person_id|source_row_hash|idempotency_key/i);

    const receivable = await queryFinancialPlanTool({
        plan: {
            kind: 'financial_query',
            domain: 'forecast',
            operation: 'sum',
            filters: { period: { type: 'relative', days: 2 }, type: 'receivable' },
            timeBasis: 'due_date'
        },
        userIds: ['agent-daniel'],
        personByUserId: { 'agent-daniel': 'Daniel' },
        currentDate: '05/07/2026',
        env,
        canonicalLedgerDbPath: dbPath
    });

    assert.strictEqual(receivable.ok, true, JSON.stringify(receivable));
    assert.strictEqual(receivable.result.value, 43);
    assert.strictEqual(receivable.result.details.totals.currentCashImpact, 0);
});

test('result verifier rejects incoherent agent trajectories and generic label-free answers', () => {
    const plannedQuery = {
        action: 'tool',
        tool: 'query_financial_plan',
        args: {
            plan: {
                domain: 'expenses',
                operation: 'list',
                timeBasis: 'transaction_date'
            }
        }
    };
    const toolResult = {
        ok: true,
        tool: 'query_financial_plan',
        plan: {
            domain: 'expenses',
            operation: 'list',
            timeBasis: 'transaction_date'
        },
        result: {
            value: [{ description: 'Mercado', amount: 42 }]
        }
    };

    assert.strictEqual(
        verifyAgentResult({
            message: 'liste meus gastos',
            plan: plannedQuery,
            toolResult: { ...toolResult, tool: 'get_dashboard_snapshot' },
            answer: 'Mercado.'
        }).reason,
        'tool_mismatch'
    );
    assert.strictEqual(
        verifyAgentResult({
            message: 'liste meus gastos',
            plan: plannedQuery,
            toolResult: {
                ...toolResult,
                plan: { ...toolResult.plan, domain: 'income' }
            },
            answer: 'Mercado.'
        }).reason,
        'query_plan_domain_mismatch'
    );
    assert.strictEqual(
        verifyAgentResult({
            message: 'liste meus gastos',
            plan: plannedQuery,
            toolResult,
            answer: 'Aqui esta o resultado solicitado.'
        }).reason,
        'missing_result_reference'
    );
    assert.strictEqual(
        verifyAgentResult({
            message: 'liste meus gastos',
            plan: plannedQuery,
            toolResult,
            answer: 'Mercado.'
        }).ok,
        true
    );
    assert.strictEqual(
        verifyAgentResult({
            message: 'liste meus gastos',
            plan: plannedQuery,
            toolResult: { ok: false, tool: 'query_financial_plan', reason: 'read_model_unavailable' },
            answer: 'Nao consegui consultar agora.'
        }).reason,
        'tool_unavailable:read_model_unavailable'
    );
});

test('LangGraph makes unavailable data explicit instead of claiming empty or zero', async () => {
    const runtime = await import('../src/agent/langGraphRuntime.mjs');
    const answer = runtime.__test__.composeToolFailureAnswer({ reason: 'read_model_unavailable' });

    assert.match(answer, /fonte necessaria.*indisponivel/i);
    assert.match(answer, /nao vou tratar.*ausencia.*dados.*valor zero/i);
    assert.doesNotMatch(answer, /nao encontrei lancamentos/i);
});

test('LangGraph cost telemetry reports bounded calls, approximate tokens and configured estimate', async () => {
    const runtime = await import('../src/agent/langGraphRuntime.mjs');
    const telemetry = runtime.__test__.buildAgentCostTelemetry({
        before: { counters: { 'gemini.call.total': 4, 'gemini.prompt_chars.total': 100, 'gemini.response_chars.total': 20 } },
        after: { counters: { 'gemini.call.total': 5, 'gemini.prompt_chars.total': 140, 'gemini.response_chars.total': 36 } },
        latencyMs: 123.8,
        env: {
            FINANCIAL_AGENT_CHARS_PER_TOKEN: '4',
            FINANCIAL_AGENT_INPUT_USD_PER_MILLION_TOKENS: '1.5',
            FINANCIAL_AGENT_OUTPUT_USD_PER_MILLION_TOKENS: '6'
        }
    });

    assert.deepStrictEqual(telemetry, {
        modelCalls: 1,
        inputChars: 40,
        outputChars: 16,
        inputTokens: 10,
        outputTokens: 4,
        estimatedCostUsd: 0.000039,
        latencyMs: 124
    });
});
