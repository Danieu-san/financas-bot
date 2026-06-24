const test = require('node:test');
const assert = require('node:assert');

const {
    buildDailyOpsCheckReport,
    formatDailyOpsCheckMessage,
    sendDailyOpsCheckReport
} = require('../src/services/dailyOpsCheckService');

function healthyInput(overrides = {}) {
    return {
        now: new Date('2026-06-16T12:00:00.000Z'),
        uptimeSeconds: 7200,
        memoryUsage: { rss: 180 * 1024 * 1024 },
        clientStatus: { canSendMessage: true },
        readModelStats: {
            lastSyncedAt: '2026-06-16T11:55:00.000Z',
            saidas: 4,
            entradas: 2,
            cartoes: 3,
            metas: 1,
            dividas: 1,
            sqlite: { ready: true }
        },
        readinessReport: {
            recommendedMode: 'keep_shadow',
            readyForManualReview: false,
            shadowEntries: 32,
            criticalDivergences: 0,
            blockers: ['not_enough_decisions']
        },
        metricsSnapshot: {
            counters: {},
            timings: {}
        },
        env: {
            DASHBOARD_ADMIN_ALL_USERS_ENABLED: 'false',
            FINANCIAL_AGENT_MODE: 'shadow',
            FINANCIAL_AGENT_ANSWER_APPROVED: 'false',
            FINANCIAL_AGENT_LLM_PLANNER_ENABLED: 'false',
            FINANCIAL_AGENT_LLM_PLANNER_APPROVED: 'false',
            FINANCIAL_AGENT_SHADOW_RECENT_ANSWER_ENABLED: 'true',
            FAMILY_MODE_ENABLED: 'false',
            INTERPRETATION_RELIABILITY_MODE: 'shadow'
        },
        ...overrides
    };
}

test('daily ops check reports ok without Gemini calls or sensitive identifiers', () => {
    const report = buildDailyOpsCheckReport(healthyInput());
    const message = formatDailyOpsCheckMessage(report);

    assert.strictEqual(report.status, 'ok');
    assert.doesNotMatch(message, /user_id|sheet_id|token|refresh|GOCSPX|apps\.googleusercontent\.com/i);
    assert.match(message, /FinancasBot - check diario/);
    assert.match(message, /Status geral: OK/);
    assert.match(message, /Sem chamada Gemini/);
    assert.match(message, /recent_answer=true/);
});

test('daily ops check marks unsafe production flags as critical', () => {
    const report = buildDailyOpsCheckReport(healthyInput({
        env: {
            DASHBOARD_ADMIN_ALL_USERS_ENABLED: 'true',
            FINANCIAL_AGENT_MODE: 'answer',
            FINANCIAL_AGENT_LLM_PLANNER_ENABLED: 'true',
            FAMILY_MODE_ENABLED: 'true',
            INTERPRETATION_RELIABILITY_MODE: 'enforce'
        }
    }));

    assert.strictEqual(report.status, 'critical');
    assert.ok(report.checks.some(check => check.name === 'Flags seguras' && check.status === 'critical'));
    assert.ok(report.issues.some(issue => issue.includes('DASHBOARD_ADMIN_ALL_USERS_ENABLED=true')));
    assert.ok(report.issues.some(issue => issue.includes('FINANCIAL_AGENT_MODE=answer')));
});

test('daily ops check accepts explicitly approved financial agent answer and LLM planner rollout', () => {
    const report = buildDailyOpsCheckReport(healthyInput({
        env: {
            DASHBOARD_ADMIN_ALL_USERS_ENABLED: 'false',
            FINANCIAL_AGENT_MODE: 'answer',
            FINANCIAL_AGENT_ANSWER_APPROVED: 'true',
            FINANCIAL_AGENT_LLM_PLANNER_ENABLED: 'true',
            FINANCIAL_AGENT_LLM_PLANNER_APPROVED: 'true',
            FAMILY_MODE_ENABLED: 'false',
            INTERPRETATION_RELIABILITY_MODE: 'shadow'
        }
    }));

    assert.strictEqual(report.status, 'ok');
    const flags = report.checks.find(check => check.name === 'Flags seguras');
    assert.strictEqual(flags.status, 'ok');
    assert.match(flags.detail, /agent=answer/);
    assert.match(flags.detail, /agent_answer_approved=true/);
    assert.match(flags.detail, /planner=true/);
    assert.match(flags.detail, /planner_approved=true/);
});

test('daily ops check accepts explicitly approved narrow interpretation enforce canary', () => {
    const report = buildDailyOpsCheckReport(healthyInput({
        env: {
            DASHBOARD_ADMIN_ALL_USERS_ENABLED: 'false',
            FINANCIAL_AGENT_MODE: 'shadow',
            FINANCIAL_AGENT_LLM_PLANNER_ENABLED: 'false',
            FINANCIAL_AGENT_SHADOW_RECENT_ANSWER_ENABLED: 'true',
            FAMILY_MODE_ENABLED: 'false',
            INTERPRETATION_RELIABILITY_MODE: 'enforce',
            INTERPRETATION_RELIABILITY_ENFORCE_APPROVED: 'true',
            INTERPRETATION_RELIABILITY_OPERATIONS: 'expense.create,income.create'
        }
    }));

    assert.strictEqual(report.status, 'ok');
    const flags = report.checks.find(check => check.name === 'Flags seguras');
    assert.strictEqual(flags.status, 'ok');
    assert.match(flags.detail, /interpretation=enforce/);
    assert.match(flags.detail, /enforce_approved=true/);
});

test('daily ops check rejects approved interpretation enforce with expanded allowlist', () => {
    const report = buildDailyOpsCheckReport(healthyInput({
        env: {
            DASHBOARD_ADMIN_ALL_USERS_ENABLED: 'false',
            FINANCIAL_AGENT_MODE: 'shadow',
            FINANCIAL_AGENT_LLM_PLANNER_ENABLED: 'false',
            FAMILY_MODE_ENABLED: 'false',
            INTERPRETATION_RELIABILITY_MODE: 'enforce',
            INTERPRETATION_RELIABILITY_ENFORCE_APPROVED: 'true',
            INTERPRETATION_RELIABILITY_OPERATIONS: 'expense.create,income.create,transfer.create'
        }
    }));

    assert.strictEqual(report.status, 'critical');
    assert.ok(report.issues.some(issue => issue.includes('allowlist')));
});

test('daily ops check surfaces shadow readiness and critical divergences', () => {
    const ready = buildDailyOpsCheckReport(healthyInput({
        readinessReport: {
            recommendedMode: 'manual_review_for_enforce',
            readyForManualReview: true,
            shadowEntries: 120,
            criticalDivergences: 0,
            blockers: []
        }
    }));
    assert.strictEqual(ready.status, 'attention');
    assert.ok(ready.nextActions.some(action => /revisar manualmente/.test(action)));

    const critical = buildDailyOpsCheckReport(healthyInput({
        readinessReport: {
            recommendedMode: 'keep_shadow',
            readyForManualReview: false,
            shadowEntries: 120,
            criticalDivergences: 2,
            blockers: ['critical_divergence_found']
        }
    }));
    assert.strictEqual(critical.status, 'attention');
    assert.ok(critical.issues.some(issue => /divergencia critica/i.test(issue)));
    assert.ok(critical.nextActions.some(action => /Nao ativar enforce/.test(action)));
});

test('daily ops check sends only when enabled and only to unique admins', async () => {
    const sent = [];
    const result = await sendDailyOpsCheckReport({
        env: { DAILY_OPS_CHECK_ENABLED: 'true' },
        adminIds: ['5511999999999@c.us', '5511999999999@c.us', ''],
        client: {
            sendMessage: async (to, message) => sent.push({ to, message })
        },
        reportBuilder: () => buildDailyOpsCheckReport(healthyInput())
    });

    assert.strictEqual(result.sent, true);
    assert.strictEqual(result.recipientCount, 1);
    assert.deepStrictEqual(sent.map(item => item.to), ['5511999999999@c.us']);

    const disabled = await sendDailyOpsCheckReport({
        env: { DAILY_OPS_CHECK_ENABLED: 'false' },
        adminIds: ['5511999999999@c.us'],
        client: { sendMessage: async () => assert.fail('should not send') }
    });

    assert.deepStrictEqual(disabled, { sent: false, reason: 'disabled' });
});
