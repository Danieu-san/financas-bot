const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildDataQualityCoverage,
    executeDataQualityQuery
} = require('../src/quality/dataQualityService');
const { executeFinancialQuery } = require('../src/query/financialQueryEngine');
const { normalizeFinancialQueryPlan } = require('../src/query/financialQueryPlan');
const { __test__: messageHandlerTest } = require('../src/handlers/messageHandler');

function event(overrides = {}) {
    return {
        event_id: overrides.event_id || `event-${Math.random()}`,
        owner_person_id: 'user-a',
        kind: 'expense',
        status: 'settled',
        description: 'Item sanitizado',
        occurred_on: '2026-07-10',
        effective_on: '2026-07-10',
        competence_month: '2026-07',
        category: 'Alimentação',
        subcategory: 'Mercado',
        category_status: 'resolved',
        source_type: 'sheet.saidas',
        ...overrides
    };
}

function line(eventId, lineType, accountId = null) {
    return {
        event_id: eventId,
        line_type: lineType,
        account_id: accountId
    };
}

function qualityFixture() {
    const events = [
        event({ event_id: 'good-expense', description: 'Mercado sanitizado' }),
        event({
            event_id: 'bad-expense',
            description: 'Item para revisar',
            status: 'uncertain',
            category: 'Outros',
            subcategory: '',
            category_status: 'resolved',
            receipt_required: true,
            receipt_status: 'missing'
        }),
        event({
            event_id: 'pending-bill',
            kind: 'bill_expected',
            status: 'pending',
            description: 'Conta sanitizada',
            category: 'Moradia',
            subcategory: 'Serviços',
            source_type: 'sheet.contas'
        }),
        event({
            event_id: 'unmatched-import',
            kind: 'adjustment',
            description: 'Importação sanitizada',
            category: null,
            subcategory: null,
            category_status: 'not_applicable',
            source_type: 'import.statement'
        }),
        event({
            event_id: 'transfer-without-destination-account',
            kind: 'transfer',
            description: 'Transferência sanitizada',
            category: null,
            subcategory: null,
            category_status: 'not_applicable',
            source_type: 'sheet.transferencias'
        }),
        event({
            event_id: 'old-bad-expense',
            occurred_on: '2026-06-30',
            effective_on: '2026-06-30',
            competence_month: '2026-06',
            category: '',
            category_status: 'unresolved'
        })
    ];
    const lines = [
        line('good-expense', 'cash', 'account-a'),
        line('good-expense', 'category'),
        line('bad-expense', 'cash'),
        line('bad-expense', 'category'),
        line('pending-bill', 'category'),
        line('pending-bill', 'clearing'),
        line('unmatched-import', 'clearing'),
        line('transfer-without-destination-account', 'cash', 'account-a'),
        line('transfer-without-destination-account', 'clearing'),
        line('old-bad-expense', 'cash')
    ];
    return {
        events,
        lines,
        reconciliationLinks: [],
        statementReconciliationLinks: [
            {
                decision_status: 'possible_duplicate',
                confirmed_at: '2026-07-12T10:00:00.000Z'
            },
            {
                decision_status: 'matched',
                confirmed_at: '2026-07-12T10:00:00.000Z'
            }
        ],
        sourceHealth: 'partial'
    };
}

test('phase 4D computes all quality indicators by period and source without exposing internal ids', () => {
    const coverage = buildDataQualityCoverage(qualityFixture(), {
        period: { type: 'month', month: 6, year: 2026 },
        personByUserId: { 'user-a': 'Pessoa A' }
    });

    assert.strictEqual(coverage.status, 'partial');
    assert.strictEqual(coverage.totalCount, 7);
    assert.strictEqual(coverage.classificationApplicableCount, 3);
    assert.strictEqual(coverage.classifiedCount, 2);
    assert.strictEqual(coverage.missingCategoryCount, 1);
    assert.strictEqual(coverage.uncertainCount, 2);
    assert.strictEqual(coverage.pendingStatusCount, 1);
    assert.strictEqual(coverage.unreconciledCount, 2);
    assert.strictEqual(coverage.missingFinancialAccountCount, 2);
    assert.strictEqual(coverage.receiptRequiredCount, 1);
    assert.strictEqual(coverage.missingRequiredReceiptCount, 1);
    assert.strictEqual(coverage.receiptIndicatorStatus, 'applicable');
    assert.strictEqual(coverage.pendingCount, 5);
    assert.strictEqual(coverage.coveragePct, 66.7);
    assert.ok(coverage.bySource.some(item => item.source === 'Saídas' && item.pendingCount === 1));
    assert.ok(coverage.bySource.some(item => item.source === 'Importação' && item.unreconciledCount === 2));
    assert.ok(coverage.items.some(item => item.description === 'Item para revisar' && item.issues.includes('missing_category')));
    assert.ok(coverage.items.some(item => item.description === 'Item de importação' && item.issues.includes('unreconciled')));
    assert.doesNotMatch(
        JSON.stringify(coverage),
        /user-a|event_id|owner_person_id|account-a|transaction_hash|actor_hash/i
    );
});

test('phase 4D filters quality coverage by origin and issue and keeps receipt indicator not applicable when no receipt is required', async () => {
    const source = qualityFixture();
    source.events = source.events.map(item => ({
        ...item,
        receipt_required: false,
        receipt_status: undefined
    }));

    const result = await executeDataQualityQuery({
        domain: 'quality',
        operation: 'list',
        filters: {
            period: { type: 'month', month: 6, year: 2026 },
            source: 'saidas',
            status: 'missing_category'
        },
        groupBy: [],
        limit: 10,
        timeBasis: 'transaction_date'
    }, source);

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.value.items.length, 1);
    assert.deepStrictEqual(result.result.value.items[0].issues, [
        'missing_category',
        'uncertain',
        'missing_financial_account'
    ]);
    assert.strictEqual(result.result.details.receiptRequiredCount, 0);
    assert.strictEqual(result.result.details.missingRequiredReceiptCount, 0);
    assert.strictEqual(result.result.details.receiptIndicatorStatus, 'not_applicable');
});

test('phase 4D quality projection is read-only and does not remove bad items from reliable financial totals', async () => {
    const source = qualityFixture();
    const totalBefore = source.events
        .filter(item => item.kind === 'expense' && item.occurred_on.startsWith('2026-07'))
        .reduce((sum, item) => sum + (item.event_id === 'good-expense' ? 10000 : 2500), 0);

    const result = await executeDataQualityQuery({
        domain: 'quality',
        operation: 'detail',
        filters: { period: { type: 'month', month: 6, year: 2026 } },
        groupBy: ['source'],
        limit: 10,
        timeBasis: 'transaction_date'
    }, source);

    const totalAfter = source.events
        .filter(item => item.kind === 'expense' && item.occurred_on.startsWith('2026-07'))
        .reduce((sum, item) => sum + (item.event_id === 'good-expense' ? 10000 : 2500), 0);

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.result.value.pendingCount, 5);
    assert.strictEqual(totalAfter, totalBefore);
    assert.strictEqual(totalAfter, 12500);
});

test('phase 4D registers quality in FinancialQueryPlan and executes it through the shared Query Engine', async () => {
    const normalized = normalizeFinancialQueryPlan({
        kind: 'financial_query',
        domain: 'quality',
        operation: 'detail',
        filters: { period: { type: 'month', month: 6, year: 2026 }, scope: 'family' },
        groupBy: ['source'],
        timeBasis: 'transaction_date'
    });

    assert.strictEqual(normalized.ok, true, JSON.stringify(normalized.errors));
    const result = await executeFinancialQuery(normalized.plan, {
        dataQualitySource: qualityFixture(),
        currentDate: '2026-07-13'
    });
    assert.strictEqual(result.ok, true, JSON.stringify(result.errors));
    assert.strictEqual(result.result.value.missingCategoryCount, 1);
    assert.strictEqual(result.result.value.pendingCount, 5);
});

test('phase 4D routes explicit WhatsApp quality questions locally and keeps ordinary pending bills unchanged', () => {
    const cases = [
        ['Como está a qualidade dos meus dados este mês?', 'qualidade_dados_resumo', 'detail', ''],
        ['Quais pendências de dados tenho este mês?', 'pendencias_dados_listagem', 'list', ''],
        ['Quais lançamentos estão sem categoria?', 'qualidade_sem_categoria', 'list', 'missing_category'],
        ['Quais lançamentos estão incertos?', 'qualidade_incertos', 'list', 'uncertain'],
        ['Quais lançamentos não foram conciliados?', 'qualidade_nao_conciliados', 'list', 'unreconciled'],
        ['Quais lançamentos estão sem conta financeira?', 'qualidade_sem_conta_financeira', 'list', 'missing_financial_account'],
        ['Quais itens obrigatórios estão sem comprovante?', 'qualidade_sem_comprovante', 'list', 'missing_required_receipt'],
        ['Mostre a cobertura dos dados por origem', 'qualidade_por_origem', 'group', '']
    ];

    for (const [question, intent, operation, status] of cases) {
        const classification = messageHandlerTest.classifyPerguntaLocally(question);
        assert.strictEqual(classification.intent, intent, question);
        assert.strictEqual(classification.financialQueryPlan.domain, 'quality', question);
        assert.strictEqual(classification.financialQueryPlan.operation, operation, question);
        assert.strictEqual(classification.financialQueryPlan.filters.status || '', status, question);
    }

    const bills = messageHandlerTest.classifyPerguntaLocally('Quais contas estão pendentes este mês?');
    assert.strictEqual(bills.intent, 'contas_pendentes');
    assert.strictEqual(bills.financialQueryPlan.domain, 'bills');
});

test('phase 4D composes a deterministic WhatsApp answer with actionable indicators and no financial recalculation', async () => {
    const runtime = await import('../src/agent/langGraphRuntime.mjs');
    const answer = runtime.__test__.composeFinancialPlanAnswer({
        plan: {
            domain: 'quality',
            operation: 'detail',
            filters: { period: { type: 'month', month: 6, year: 2026, label: 'Julho de 2026' } }
        },
        result: {
            value: {
                status: 'partial',
                totalCount: 7,
                classifiedCount: 2,
                classificationApplicableCount: 3,
                missingCategoryCount: 1,
                uncertainCount: 2,
                pendingStatusCount: 1,
                unreconciledCount: 2,
                missingFinancialAccountCount: 2,
                receiptRequiredCount: 0,
                missingRequiredReceiptCount: 0,
                receiptIndicatorStatus: 'not_applicable',
                pendingCount: 5,
                coveragePct: 66.7,
                items: [],
                criteria: 'Fonte canônica parcial; pendências não alteram os totais.'
            },
            details: {}
        }
    });

    assert.match(answer, /Qualidade dos dados/i);
    assert.match(answer, /Pendências.*5/i);
    assert.match(answer, /Sem categoria.*1/i);
    assert.match(answer, /Sem conta financeira.*2/i);
    assert.match(answer, /comprovante.*não aplicável/i);
    assert.match(answer, /não alteram os totais/i);
    assert.doesNotMatch(answer, /R\$|user_id|event_id|account_id/i);

    const bySource = runtime.__test__.composeFinancialPlanAnswer({
        plan: { domain: 'quality', operation: 'group', filters: {} },
        result: {
            value: [{ source: 'Saídas', coveragePct: 50, pendingCount: 2 }],
            details: { criteria: 'Agrupamento sanitizado.' }
        }
    });
    assert.match(bySource, /Cobertura de qualidade por origem/i);
    assert.match(bySource, /Saídas.*50%.*2 pendência/i);

    const pendingList = runtime.__test__.composeFinancialPlanAnswer({
        plan: { domain: 'quality', operation: 'list', filters: { status: 'missing_category' } },
        result: {
            value: {
                pendingCount: 1,
                items: [{ date: '2026-07-10', description: 'Item sanitizado', source: 'Saídas', issues: ['missing_category'] }],
                criteria: 'Lista sanitizada.'
            },
            details: {}
        }
    });
    assert.match(pendingList, /Pendências de qualidade \(1\)/i);
    assert.match(pendingList, /Item sanitizado.*sem categoria/i);
    assert.doesNotMatch(pendingList, /R\$|user_id|event_id|account_id/i);
});
