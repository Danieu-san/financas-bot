const test = require('node:test');
const assert = require('node:assert');

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
const { __test__: readModelTest } = require('../src/services/readModelService');
const {
    buildPlannerPrompt,
    isLlmPlannerEnabled,
    normalizePlannerPlan,
    __test__: plannerTest
} = require('../src/agent/financialAgentPlanner');
const { __test__: messageHandlerTest } = require('../src/handlers/messageHandler');

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
    const toolResult = {
        ok: true,
        tool: 'list_recent_transactions',
        rows: [
            { description: 'restaurante', amount: 75, date: '05/06/2026', iso_date: '2026-06-05', person: 'Thais' },
            { description: 'mercado', amount: 30, date: '01/06/2026', iso_date: '2026-06-01', person: 'Daniel' }
        ],
        criteria: { sort: 'iso_date desc', limit: 2 }
    };

    assert.strictEqual(
        verifyAgentAnswer('Seu último gasto foi em 05/06/2026: restaurante, R$ 75,00 (Thais).', { toolResult }).ok,
        true
    );
    assert.strictEqual(
        verifyAgentAnswer('Seu último gasto foi em 01/06/2026: mercado, R$ 30,00 (Daniel).', { toolResult }).reason,
        'wrong_latest_item'
    );

    const incorrectlyOrdered = { ...toolResult, rows: [...toolResult.rows].reverse() };
    assert.strictEqual(
        verifyAgentAnswer('Seu último gasto foi em 01/06/2026: mercado, R$ 30,00 (Daniel).', { toolResult: incorrectlyOrdered }).reason,
        'invalid_tool_order'
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
    assert.match(prompt, /este mes|do mes/i);
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
});

test('Gemini planner reference date follows the Sao Paulo calendar day', () => {
    assert.strictEqual(
        plannerTest.formatReferenceDate(new Date('2026-06-15T00:30:00.000Z')),
        '2026-06-14'
    );
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
