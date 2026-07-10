const test = require('node:test');
const assert = require('node:assert');

const { parseAcceptanceBattery } = require('../scripts/runFinancialQueryAcceptanceBattery');
const {
    readCorpus,
    validateCorpus,
    materializeCases,
    resolveFollowUpFinancialQueryPlan,
    summarize
} = require('../scripts/runFinancialAgentGoldenBaseline');

test('phase 3F.1A golden corpus has the approved size, split and provenance', () => {
    const corpus = readCorpus();
    const stats = validateCorpus(corpus);

    assert.deepStrictEqual(stats, {
        total: 60,
        development: 40,
        approval: 20,
        critical: 15
    });
});

test('phase 3F.1A golden corpus materializes complete semantic labels', () => {
    const cases = materializeCases(readCorpus(), parseAcceptanceBattery());
    const unavailable = cases.find(item => item.id === '3F1A-060');

    assert.strictEqual(cases.length, 60);
    assert.ok(cases.every(item =>
        item.question &&
        item.expected.domain &&
        item.expected.operation &&
        item.expected.timeBasis &&
        item.expected.metric &&
        item.expected.period &&
        item.expected.scope &&
        item.expected.sourceHealth
    ));
    assert.strictEqual(unavailable.expected.sourceHealth, 'unavailable');
    assert.strictEqual(unavailable.expected.responseMode, 'source_unavailable');
});

test('phase 3F.1A materializes a follow-up with its sanitized analytical checkpoint', () => {
    const followUp = materializeCases(readCorpus(), parseAcceptanceBattery())
        .find(item => item.id === '3F1A-025');
    const plan = resolveFollowUpFinancialQueryPlan(followUp, (question, context) => {
        assert.strictEqual(question, 'e no mes passado?');
        assert.deepStrictEqual(context, {
            intent: 'total_gastos_mes',
            parameters: { mes: 6, ano: 2026, scope: 'personal' },
            metric: 'expenses_total'
        });
        return {
            financialQueryPlan: {
                kind: 'financial_query',
                domain: 'expenses',
                operation: 'compare',
                filters: { period: { type: 'month', month: 6, year: 2026 }, scope: 'personal' },
                timeBasis: 'billing_month'
            }
        };
    });

    assert.strictEqual(plan.domain, 'expenses');
    assert.strictEqual(plan.operation, 'compare');
    assert.strictEqual(plan.timeBasis, 'billing_month');
});

test('phase 3F.1A summary keeps deferred fault injection separate from baseline gaps', () => {
    const summary = summarize([
        {
            id: '3F1A-001',
            baselineAccepted: true,
            route: { matches: { all: true } },
            agent: { execution: 'executed', accepted: true },
            telemetry: {
                gemini_calls: 1,
                input_tokens: 12,
                output_tokens: 4,
                estimated_cost: 0.0001,
                latency_ms: 10
            }
        },
        {
            id: '3F1A-060',
            baselineAccepted: true,
            route: { matches: { all: true } },
            agent: { execution: 'deferred_fault_injection', accepted: false },
            telemetry: { latency_ms: 0 }
        }
    ], { total: 2, development: 1, approval: 1, critical: 1 });

    assert.strictEqual(summary.executed, 1);
    assert.strictEqual(summary.deferredFaultInjection, 1);
    assert.deepStrictEqual(summary.baselineGaps, []);
    assert.strictEqual(summary.geminiCalls, 1);
    assert.strictEqual(summary.inputTokens, 12);
    assert.strictEqual(summary.outputTokens, 4);
    assert.strictEqual(summary.estimatedCost, 0.0001);
});
