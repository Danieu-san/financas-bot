const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
    buildFinancialAgentTrajectory,
    buildAnalyticalCheckpointFromTrajectory,
    buildFinancialAgentTrajectoryLog
} = require('../src/agent/financialAgentTrajectory');
const { invokeFinancialAgent } = require('../src/agent/financialAgent');
const { ensureSqliteReady, syncSnapshotToSqlite } = require('../src/services/sqliteReadModelService');
const { __test__: messageHandlerTest } = require('../src/handlers/messageHandler');
const {
    buildSanitizedBaseline,
    validateSanitizedBaseline,
    CRITICAL_CASE_IDS
} = require('../scripts/runFinancialAgentTrajectoryBaseline');

function expensePlan(overrides = {}) {
    return {
        kind: 'financial_query',
        domain: 'expenses',
        operation: 'sum',
        filters: {
            period: { type: 'month', month: 7, year: 2026 },
            scope: 'personal',
            category: 'Alimentação'
        },
        groupBy: [],
        sort: { by: 'value', direction: 'desc' },
        limit: 20,
        needsContext: false,
        timeBasis: 'transaction_date',
        answerStyle: 'short',
        ...overrides
    };
}

test('trajectory records the executed plan instead of a conflicting supplied plan', () => {
    const suppliedPlan = expensePlan();
    const executedPlan = expensePlan({
        domain: 'cards',
        operation: 'detail',
        filters: {
            period: { type: 'month', month: 6, year: 2026, label: 'Julho de 2026' },
            scope: 'family',
            card: 'Nubank - Thais'
        },
        timeBasis: 'billing_month',
        answerStyle: 'detailed'
    });
    const trajectory = buildFinancialAgentTrajectory({
        message: 'e no cartão da Thais?',
        authorizedUserCount: 2,
        suppliedPlan,
        plan: { action: 'tool', source: 'llm_planner', tool: 'query_financial_plan', args: { plan: suppliedPlan } },
        toolResult: { ok: true, tool: 'query_financial_plan', source: 'canonical', plan: executedPlan, result: { value: [], details: { count: 0 } } },
        action: 'answer',
        verified: { ok: true },
        answer: 'Nenhum lançamento encontrado.',
        telemetry: { modelCalls: 1 }
    });

    assert.strictEqual(trajectory.executedPlan.domain, 'cards');
    assert.strictEqual(trajectory.executedPlan.timeBasis, 'billing_month');
    assert.strictEqual(trajectory.executedPlan.filters.card, 'Nubank - Thais');
    assert.strictEqual(trajectory.coverage.status, 'empty');

    const checkpoint = buildAnalyticalCheckpointFromTrajectory(trajectory);
    assert.strictEqual(checkpoint.checkpointType, 'analytical_followup_v2');
    assert.strictEqual(checkpoint.intent, 'financial_agent:cards:detail');
    assert.strictEqual(checkpoint.parameters.cartao, 'Nubank - Thais');
    assert.strictEqual(checkpoint.parameters.timeBasis, 'billing_month');
    assert.deepStrictEqual(checkpoint.executedPlan, trajectory.executedPlan);
});

test('trajectory distinguishes empty evidence from an unavailable source', () => {
    const plan = expensePlan();
    const empty = buildFinancialAgentTrajectory({
        message: 'quanto gastei?', authorizedUserCount: 1, suppliedPlan: plan,
        plan: { action: 'tool', tool: 'query_financial_plan', args: { plan } },
        toolResult: { ok: true, tool: 'query_financial_plan', plan, result: { value: [], details: { count: 0 } } },
        action: 'answer', verified: { ok: true }, answer: 'R$ 0,00'
    });
    const unavailable = buildFinancialAgentTrajectory({
        message: 'quanto gastei?', authorizedUserCount: 1, suppliedPlan: plan,
        plan: { action: 'tool', tool: 'query_financial_plan', args: { plan } },
        toolResult: { ok: false, tool: 'query_financial_plan', reason: 'read_model_unavailable' },
        action: 'error', verified: { ok: false, reason: 'tool_unavailable:read_model_unavailable' }, answer: ''
    });

    assert.strictEqual(empty.coverage.status, 'empty');
    assert.strictEqual(unavailable.coverage.status, 'unavailable');
    assert.strictEqual(unavailable.executedPlan, null);
});

test('derived recent-transaction checkpoint preserves an authorized family scope', () => {
    const trajectory = buildFinancialAgentTrajectory({
        message: 'qual foi o último gasto da família?',
        authorizedUserCount: 2,
        plan: {
            action: 'tool', tool: 'list_recent_transactions',
            args: { eventTypes: ['expense', 'card_expense'], limit: 1 }
        },
        toolResult: { ok: true, tool: 'list_recent_transactions', source: 'legacy', rows: [] },
        action: 'answer', verified: { ok: true }, answer: 'Nenhum lançamento.'
    });

    assert.strictEqual(trajectory.executedPlan.filters.scope, 'family');
    assert.strictEqual(buildAnalyticalCheckpointFromTrajectory(trajectory).parameters.scope, 'family');
});

test('trajectory and its log projection exclude raw messages, answers and identifiers', () => {
    const plan = expensePlan({
        filters: {
            period: { type: 'month', month: 7, year: 2026 },
            scope: 'personal',
            category: 'token=SEGREDO',
            user_id: 'raw-user-id'
        }
    });
    const trajectory = buildFinancialAgentTrajectory({
        message: 'meu texto privado token=SEGREDO user_id=raw-user-id',
        authorizedUserCount: 1,
        suppliedPlan: plan,
        plan: { action: 'clarify', reason: 'prompt user_id raw-user-id' },
        toolResult: null,
        action: 'clarify',
        verified: { ok: true },
        answer: 'resposta privada token=SEGREDO'
    });
    const serialized = JSON.stringify({ trajectory, log: buildFinancialAgentTrajectoryLog(trajectory) });

    assert.doesNotMatch(serialized, /SEGREDO|raw-user-id|texto privado|resposta privada/);
    assert.doesNotMatch(serialized, /"message"|"answer"/);
    assert.strictEqual(trajectory.decision.reason, 'redacted_reason');
});

test('runtime returns the executed trajectory and the analytical checkpoint persists it', async () => {
    assert.strictEqual(ensureSqliteReady(), true);
    assert.strictEqual(syncSnapshotToSqlite({
        saidas: [
            { user_id: 'trajectory-user', data: '10/08/2026', descricao: 'lanche', categoria: 'Alimentação', valor: 25, month: 7, year: 2026 }
        ],
        cartoes: [], entradas: [], transferencias: [], cartoesConfig: [], metas: [],
        movimentacoesMetas: [], dividas: [], contas: [], userSettings: []
    }), true);
    const suppliedPlan = expensePlan();
    const result = await invokeFinancialAgent({
        message: 'quanto gastei em alimentação?',
        userIds: ['trajectory-user'],
        personByUserId: { 'trajectory-user': 'Pessoa de teste' },
        currentDate: '22/08/2026',
        financialQueryPlan: suppliedPlan,
        mode: 'answer'
    });

    assert.strictEqual(result.action, 'answer', JSON.stringify(result));
    assert.strictEqual(result.verified.ok, true);
    assert.strictEqual(result.trajectory.executedPlan.domain, 'expenses');
    assert.strictEqual(result.trajectory.tool.name, 'query_financial_plan');
    assert.strictEqual(result.trajectory.verification.ok, true);

    const sender = 'trajectory-checkpoint@example.test';
    messageHandlerTest.clearAnalyticalContextForTests();
    try {
        messageHandlerTest.storeAnalyticalContext(sender, {
            intent: 'intencao_legada_divergente',
            parameters: { mes: 1, ano: 2020 }
        }, { trajectory: result.trajectory });
        const checkpoint = messageHandlerTest.getAnalyticalContext(sender);
        assert.strictEqual(checkpoint.checkpointType, 'analytical_followup_v2');
        assert.strictEqual(checkpoint.intent, 'financial_agent:expenses:sum');
        assert.strictEqual(checkpoint.parameters.mes, 7);
        assert.strictEqual(checkpoint.parameters.ano, 2026);
        assert.strictEqual(checkpoint.parameters.categoria, 'Alimentação');
        assert.strictEqual(checkpoint.parameters.timeBasis, 'transaction_date');
        assert.strictEqual(checkpoint.executedPlan.domain, 'expenses');
        assert.doesNotMatch(JSON.stringify(checkpoint), /trajectory-user|Pessoa de teste|quanto gastei/);
    } finally {
        messageHandlerTest.clearAnalyticalContextForTests();
    }
});

test('baseline projection keeps only aggregate trajectory evidence and fixed case ids', () => {
    const results = CRITICAL_CASE_IDS.map(id => ({
        id,
        accepted: true,
        question: `texto privado ${id}`,
        answer: 'resposta privada',
        trajectory: {
            readOnly: true,
            decision: { action: 'answer', plannerSource: 'deterministic' },
            executedPlan: { domain: 'expenses', operation: 'sum' },
            tool: { name: 'query_financial_plan', source: 'read_model', fallbackReason: 'none' },
            coverage: { status: 'available' },
            verification: { ok: true }
        }
    }));
    const baseline = buildSanitizedBaseline({
        run_id: 'ARQ01_TEST',
        started_at: '2026-08-22T00:00:00.000Z',
        finished_at: '2026-08-22T00:01:00.000Z',
        synthetic_user_only: true,
        results
    });
    const serialized = JSON.stringify(baseline);

    assert.strictEqual(baseline.critical.accepted, 15);
    assert.strictEqual(baseline.summary.missingTrajectory, 0);
    assert.strictEqual(baseline.summary.readOnly, results.length);
    assert.strictEqual(baseline.summary.writeCapableToolExecutions, 0);
    assert.match(baseline.sourceEvidenceFingerprint, /^[a-f0-9]{64}$/);
    assert.deepStrictEqual(validateSanitizedBaseline(baseline, results.length), { ok: true, errors: [] });
    assert.deepStrictEqual(validateSanitizedBaseline(baseline), { ok: false, errors: ['unexpected_total'] });
    assert.doesNotMatch(serialized, /texto privado|resposta privada|"question":|"answer":/);
});

test('versioned baseline evidence is the validated generated schema', () => {
    const evidence = JSON.parse(fs.readFileSync(path.join(
        __dirname,
        '..',
        'docs',
        'audit',
        '297-financial-agent-trajectory-baseline-evidence-2026-08-22.json'
    ), 'utf8'));

    assert.deepStrictEqual(evidence.validation, { ok: true, errors: [] });
    assert.deepStrictEqual(validateSanitizedBaseline(evidence), { ok: true, errors: [] });
    assert.strictEqual(evidence.summary.total, 265);
    assert.strictEqual(evidence.summary.readOnly, evidence.summary.total);
    assert.strictEqual(evidence.summary.writeCapableToolExecutions, 0);
    assert.match(evidence.sourceEvidenceFingerprint, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(JSON.stringify(evidence), /"question":|"answer":|user_id|sheet_id|spreadsheet|token/i);
});
