const test = require('node:test');
const assert = require('node:assert/strict');

const messageHandler = require('../src/handlers/messageHandler');
const { execute } = require('../src/services/calculationOrchestrator');

const DEBT_HEADERS = [
    'Nome da Dívida', 'Credor', 'Tipo', 'Valor Original', 'Saldo Atual', 'Valor da Parcela',
    'Taxa de Juros', 'Dia de Vencimento', 'Data de Início', 'Total de Parcelas',
    'Parcelas Pagas', 'Status', 'Observações', '% Quitado', 'Último Pagamento',
    'Próximo Vencimento', 'Estratégia', 'user_id'
];

const GOAL_HEADERS = [
    'Nome da Meta', 'Valor Alvo', 'Valor Atual', '% Progresso', 'Valor Mensal Sugerido',
    'Data Alvo', 'Status', 'Prioridade', 'user_id', 'Escopo', 'Última Movimentação'
];

function debtDataSources(rows) {
    return {
        currentDate: '13/07/2026',
        scopeUserIds: ['user-a'],
        dividas: [DEBT_HEADERS, ...rows]
    };
}

function activeDebt(name = 'Banco', interest = '2% a.m.') {
    return [
        name, 'Banco Azul', 'Empréstimo', '2.000,00', '1.200,00', '300,00', interest,
        20, '01/01/2026', 10, 4, 'Ativa', '', '40%', '20/06/2026', '20/07/2026', '', 'user-a'
    ];
}

test('5B local planner maps payoff, extra payment, changed contribution and withdrawal to sanitized forecast scenarios', () => {
    const { classifyPerguntaLocally } = messageHandler.__test__;

    const payoff = classifyPerguntaLocally('quando quito a dívida do banco?');
    assert.strictEqual(payoff.intent, 'simulacao_pagamento_divida');
    assert.strictEqual(payoff.financialQueryPlan.domain, 'debts');
    assert.strictEqual(payoff.financialQueryPlan.operation, 'forecast');
    assert.strictEqual(payoff.financialQueryPlan.filters.debt, 'banco');

    const extra = classifyPerguntaLocally('se eu pagar mais R$ 500 na dívida do banco, o que muda?');
    assert.strictEqual(extra.intent, 'simulacao_pagamento_divida');
    assert.deepStrictEqual(extra.financialQueryPlan.filters.scenario, {
        type: 'extra_payment',
        amount: 500,
        frequency: 'one_time'
    });

    const contribution = classifyPerguntaLocally('se eu aportar R$ 300 por mês na meta reserva, quando alcanço?');
    assert.strictEqual(contribution.intent, 'simulacao_meta');
    assert.strictEqual(contribution.financialQueryPlan.domain, 'goals');
    assert.deepStrictEqual(contribution.financialQueryPlan.filters.scenario, {
        type: 'monthly_contribution',
        amount: 300,
        frequency: 'monthly'
    });

    const additionalContribution = classifyPerguntaLocally('se eu aportar mais R$ 300 por mês na meta reserva, quando alcanço?');
    assert.deepStrictEqual(additionalContribution.financialQueryPlan.filters.scenario, {
        type: 'additional_monthly_contribution',
        amount: 300,
        frequency: 'monthly'
    });

    const withdrawal = classifyPerguntaLocally('se eu retirar R$ 200 da meta reserva, quando alcanço?');
    assert.strictEqual(withdrawal.intent, 'simulacao_meta');
    assert.deepStrictEqual(withdrawal.financialQueryPlan.filters.scenario, {
        type: 'withdrawal',
        amount: 200,
        frequency: 'one_time'
    });

    const serialized = JSON.stringify({ payoff, extra, contribution, withdrawal });
    assert.doesNotMatch(serialized, /user_id|plan_id|legacy_ref|operation_key/i);
});

test('5B debt forecast runs through the Query Engine, returns cent-exact impact and exposes no internal identity', async () => {
    const classification = messageHandler.__test__.classifyPerguntaLocally(
        'se eu pagar mais R$ 500 na dívida do banco, o que muda?'
    );
    const analyzed = await execute(
        classification.intent,
        { ...classification.parameters, financialQueryPlan: classification.financialQueryPlan },
        debtDataSources([activeDebt()])
    );

    assert.strictEqual(analyzed.results.kind, 'plan_schedule_forecast');
    assert.strictEqual(analyzed.results.status, 'available');
    assert.strictEqual(analyzed.results.plan.name, 'Banco');
    assert.strictEqual(analyzed.results.plan.remaining, 1200);
    assert.ok(analyzed.results.baseline.completionOn);
    assert.ok(analyzed.results.simulated.completionOn);
    assert.ok(analyzed.results.impact.monthsSaved > 0);
    assert.ok(analyzed.results.impact.interestSaved >= 0);
    assert.strictEqual(analyzed.results.simulated.schedule[0].dueOn, '2026-07-20');
    assert.deepStrictEqual(analyzed.results.simulated.schedule[0].scenarioEffects, [{
        type: 'extra_payment',
        amount: 500,
        effectiveOn: '2026-07-13'
    }]);
    assert.strictEqual(analyzed.results.separation.persisted, false);
    assert.strictEqual(analyzed.results.separation.writesPerformed, 0);
    assert.doesNotMatch(
        JSON.stringify(analyzed),
        /plan_id|owner_user_id|household_id|user-a|legacy_ref|operation_key|input_fingerprint/i
    );
});

test('5B source gaps remain partial and never appear as zero interest', async () => {
    const classification = messageHandler.__test__.classifyPerguntaLocally('quando quito a dívida do banco?');
    const analyzed = await execute(
        classification.intent,
        { ...classification.parameters, financialQueryPlan: classification.financialQueryPlan },
        debtDataSources([activeDebt('Banco', '')])
    );

    assert.strictEqual(analyzed.results.status, 'partial');
    assert.strictEqual(analyzed.results.baseline.totalInterest, null);
    assert.ok(analyzed.results.baseline.missingAssumptions.includes('interest_rate_basis_points'));
    assert.strictEqual(analyzed.results.baseline.completionOn, null);
});

test('5B quanto falta quitar uses the primary Query Engine path instead of the generic fallback', async () => {
    const question = 'quanto falta quitar da dÃ­vida do banco?';
    const classification = messageHandler.__test__.classifyPerguntaLocally(question);
    const analyzed = await execute(
        classification.intent,
        { ...classification.parameters, financialQueryPlan: classification.financialQueryPlan },
        debtDataSources([activeDebt()])
    );
    const response = messageHandler.__test__.buildLocalPerguntaResponse({
        userQuestion: question,
        intent: classification.intent,
        analyzedData: analyzed
    });

    assert.strictEqual(classification.intent, 'simulacao_pagamento_divida');
    assert.strictEqual(analyzed.results.kind, 'plan_schedule_forecast');
    assert.strictEqual(analyzed.results.plan.remaining, 1200);
    assert.match(response, /R\$\s*1\.200,00/);
    assert.doesNotMatch(response, /nÃ£o consegui|user_id|plan_id|legacy_ref|operation_key|fingerprint/i);
});

test('5B refuses to apply one extra payment ambiguously across multiple debts', async () => {
    const classification = messageHandler.__test__.classifyPerguntaLocally(
        'se eu pagar mais R$ 500 nas dívidas, o que muda?'
    );
    const analyzed = await execute(
        classification.intent,
        { ...classification.parameters, financialQueryPlan: classification.financialQueryPlan },
        debtDataSources([activeDebt('Banco'), activeDebt('Cartão')])
    );

    assert.strictEqual(analyzed.results.status, 'clarification_required');
    assert.deepStrictEqual(analyzed.results.candidates, ['Banco', 'Cartão']);
    assert.strictEqual(analyzed.results.separation.persisted, false);
});

test('5B goal forecast uses the 5A adapter and keeps scenario separate from realized movements', async () => {
    const classification = messageHandler.__test__.classifyPerguntaLocally(
        'se eu aportar R$ 300 por mês na meta reserva, quando alcanço?'
    );
    const analyzed = await execute(
        classification.intent,
        { ...classification.parameters, financialQueryPlan: classification.financialQueryPlan },
        {
            currentDate: '13/07/2026',
            scopeUserIds: ['user-a'],
            metas: [
                GOAL_HEADERS,
                ['Reserva', '2.000,00', '500,00', '25%', '200,00', '31/12/2026', 'Ativa', 'Alta', 'user-a', 'personal', '10/07/2026']
            ],
            movimentacoesMetas: [
                ['Data', 'Meta', 'Tipo', 'Valor', 'Valor Antes', 'Valor Depois', 'Observação', 'Responsável', 'user_id', 'goal_user_id'],
                ['10/07/2026', 'Reserva', 'Aporte', '500,00', '0', '500,00', '', 'Daniel', 'user-a', 'user-a']
            ]
        }
    );

    assert.strictEqual(analyzed.results.kind, 'plan_schedule_forecast');
    assert.strictEqual(analyzed.results.plan.type, 'goal');
    assert.strictEqual(analyzed.results.baseline.mode, 'projected');
    assert.strictEqual(analyzed.results.simulated.mode, 'simulated');
    assert.strictEqual(analyzed.results.separation.historyState, 'realized');
    assert.strictEqual(analyzed.results.separation.persisted, false);
});

test('5B WhatsApp formatter explains payoff criteria, impact and zero-write separation without Gemini', async () => {
    const question = 'se eu pagar mais R$ 500 na dívida do banco, o que muda?';
    const classification = messageHandler.__test__.classifyPerguntaLocally(question);
    const analyzed = await execute(
        classification.intent,
        { ...classification.parameters, financialQueryPlan: classification.financialQueryPlan },
        debtDataSources([activeDebt()])
    );
    const response = messageHandler.__test__.buildLocalPerguntaResponse({
        userQuestion: question,
        intent: classification.intent,
        analyzedData: analyzed
    });

    assert.match(response, /projeção|projetada/i);
    assert.match(response, /simulação/i);
    assert.match(response, /juros|principal/i);
    assert.match(response, /não grava|não alterou|não altera/i);
    assert.doesNotMatch(response, /user_id|plan_id|legacy_ref|operation_key|fingerprint/i);
});

test('5B WhatsApp formatter describes a slower monthly contribution as delay and distinguishes total from additional', () => {
    const buildResponse = (scenario) => messageHandler.__test__.buildLocalPerguntaResponse({
        userQuestion: 'quando alcanço?',
        intent: 'simulacao_meta',
        analyzedData: {
            results: {
                kind: 'plan_schedule_forecast',
                status: 'available',
                plan: { name: 'Anual', type: 'goal', remaining: 10310.26 },
                scenario,
                baseline: { completionOn: '2026-12-13', monthsToCompletion: 6, totalInterest: 0, missingAssumptions: [] },
                simulated: { completionOn: '2029-05-13', monthsToCompletion: 35, totalInterest: 0, missingAssumptions: [] },
                impact: { monthsSaved: -29, interestSaved: 0 },
                criteria: [],
                separation: { persisted: false, writesPerformed: 0 }
            }
        }
    });

    const total = buildResponse({ type: 'monthly_contribution', amount: 300, frequency: 'monthly' });
    const additional = buildResponse({ type: 'additional_monthly_contribution', amount: 300, frequency: 'monthly' });

    assert.match(total, /aporte mensal total de R\$\s*300,00/i);
    assert.match(total, /29 mês\(es\) mais tarde/i);
    assert.doesNotMatch(total, /-29|29 mês\(es\) antecipado/i);
    assert.match(additional, /aporte mensal adicional de R\$\s*300,00/i);
});

test('5B financial agent composer keeps the plan forecast deterministic and sanitized', async () => {
    const runtime = await import('../src/agent/langGraphRuntime.mjs');
    const answer = runtime.__test__.composeFinancialPlanAnswer({
        plan: { domain: 'debts', operation: 'forecast', filters: {} },
        result: {
            value: {
                kind: 'plan_schedule_forecast',
                status: 'available',
                plan: { name: 'Banco', type: 'debt', remaining: 1200 },
                scenario: { type: 'extra_payment', amount: 500, frequency: 'one_time' },
                baseline: { completionOn: '2026-12-20', monthsToCompletion: 6, totalInterest: 100, missingAssumptions: [] },
                simulated: { completionOn: '2026-10-20', monthsToCompletion: 4, totalInterest: 60, missingAssumptions: [] },
                impact: { monthsSaved: 2, interestSaved: 40 },
                criteria: ['Juros, custos e principal são calculados nessa ordem.'],
                separation: { persisted: false, writesPerformed: 0 }
            },
            details: {}
        }
    });

    assert.match(answer, /R\$\s*1\.200,00/);
    assert.match(answer, /2 mês\(es\) antecipado/i);
    assert.match(answer, /não altera nem grava/i);
    assert.doesNotMatch(answer, /plan_id|user_id|fingerprint|\[object Object\]/i);

    const delayed = runtime.__test__.composeFinancialPlanAnswer({
        plan: { domain: 'goals', operation: 'forecast', filters: {} },
        result: {
            value: {
                kind: 'plan_schedule_forecast',
                status: 'available',
                plan: { name: 'Anual', type: 'goal', remaining: 10310.26 },
                scenario: { type: 'monthly_contribution', amount: 300, frequency: 'monthly' },
                baseline: { completionOn: '2026-12-13', monthsToCompletion: 6, totalInterest: 0, missingAssumptions: [] },
                simulated: { completionOn: '2029-05-13', monthsToCompletion: 35, totalInterest: 0, missingAssumptions: [] },
                impact: { monthsSaved: -29, interestSaved: 0 },
                criteria: [],
                separation: { persisted: false, writesPerformed: 0 }
            },
            details: {}
        }
    });
    assert.match(delayed, /aporte mensal total de R\$\s*300,00/i);
    assert.match(delayed, /29 mês\(es\) mais tarde/i);
    assert.doesNotMatch(delayed, /-29|29 mês\(es\) antecipado/i);
});
