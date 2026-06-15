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
const {
    buildPlannerPrompt,
    isLlmPlannerEnabled,
    normalizePlannerPlan
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

    const prompt = buildPlannerPrompt('Em que dia da semana eu mais gasto?');
    assert.match(prompt, /financial_events_public/);
    assert.match(prompt, /Nao calcule valores|Não calcule valores/i);
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
