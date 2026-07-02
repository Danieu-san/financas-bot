const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    buildFinancialCommandPlannerShadowDecision,
    normalizeFinancialCommandPlannerMode,
    recordFinancialCommandPlannerShadow,
    runFinancialCommandPlannerShadow,
    shouldRouteFinancialCommandPlanner,
    shouldEvaluateFinancialCommandPlannerShadow
} = require('../src/planning/financialCommandPlannerShadow');
const {
    recordFinancialCommandPlannerCanary,
    summarizeFinancialCommandPlannerCanaryTelemetry
} = require('../src/planning/financialCommandPlannerCanaryTelemetry');

test('financial command planner mode defaults closed to off', () => {
    assert.equal(normalizeFinancialCommandPlannerMode({}), 'off');
    assert.equal(normalizeFinancialCommandPlannerMode({ FINANCIAL_COMMAND_PLANNER_MODE: 'shadow' }), 'shadow');
    assert.equal(normalizeFinancialCommandPlannerMode({ FINANCIAL_COMMAND_PLANNER_MODE: 'route' }), 'route');
    assert.equal(normalizeFinancialCommandPlannerMode({ FINANCIAL_COMMAND_PLANNER_MODE: 'enabled' }), 'off');
});

test('financial command planner shadow only evaluates eligible initial messages', () => {
    const env = { FINANCIAL_COMMAND_PLANNER_MODE: 'shadow' };

    assert.equal(shouldEvaluateFinancialCommandPlannerShadow({ env, message: 'Paguei 469,09 da conta de telefone' }), true);
    assert.equal(shouldEvaluateFinancialCommandPlannerShadow({ env, message: 'Pix', currentState: { action: 'awaiting_payment_method' } }), false);
    assert.equal(shouldEvaluateFinancialCommandPlannerShadow({ env, message: '   ' }), false);
    assert.equal(shouldEvaluateFinancialCommandPlannerShadow({ env: {}, message: 'Paguei 469,09 da conta de telefone' }), false);

    const canaryEnv = {
        FINANCIAL_COMMAND_PLANNER_MODE: 'canary',
        FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS: 'user-a'
    };
    assert.equal(shouldEvaluateFinancialCommandPlannerShadow({ env: canaryEnv, userId: 'user-b', message: 'Paguei 469,09 da conta de telefone' }), true);
    assert.equal(shouldEvaluateFinancialCommandPlannerShadow({ env: canaryEnv, userId: 'user-a', message: 'Paguei 469,09 da conta de telefone' }), false);
});

test('financial command planner canary routes only trusted allowlisted user ids', () => {
    const canaryEnv = {
        FINANCIAL_COMMAND_PLANNER_MODE: 'canary',
        FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS: ' user-a, user-b '
    };

    assert.equal(shouldRouteFinancialCommandPlanner({ env: canaryEnv, userId: 'user-a' }), true);
    assert.equal(shouldRouteFinancialCommandPlanner({ env: canaryEnv, userId: 'user-c' }), false);
    assert.equal(shouldRouteFinancialCommandPlanner({ env: canaryEnv, userId: '' }), false);
    assert.equal(shouldRouteFinancialCommandPlanner({ env: { FINANCIAL_COMMAND_PLANNER_MODE: 'canary' }, userId: 'user-a' }), false);
    assert.equal(shouldRouteFinancialCommandPlanner({ env: { FINANCIAL_COMMAND_PLANNER_MODE: 'shadow' }, userId: 'user-a' }), false);
    assert.equal(shouldRouteFinancialCommandPlanner({ env: { FINANCIAL_COMMAND_PLANNER_MODE: 'route' }, userId: 'any-user' }), true);
});

test('financial command planner shadow records sanitized critical divergence', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-command-shadow-'));
    const telemetryPath = path.join(dir, 'shadow.jsonl');
    const result = recordFinancialCommandPlannerShadow({
        senderId: '5511999999999@c.us',
        message: 'Paguei 469,09 da conta de telefone',
        legacyStructuredResponse: { intent: 'gasto', gastoDetails: [{ descricao: 'conta de telefone', valor: 469.09 }] },
        structuredResponseSource: 'llm',
        plannerResult: {
            ok: true,
            plan: {
                operation: 'bill.pay',
                missingFields: ['paymentMethod'],
                contextRequests: [{ tool: 'match_recurring_bill', query: 'conta de telefone' }],
                requiresConfirmation: true
            }
        },
        evaluationLatencyMs: 12.6
    }, {
        env: { FINANCIAL_COMMAND_PLANNER_MODE: 'shadow' },
        telemetryPath,
        now: () => new Date('2026-06-26T12:00:00.000Z')
    });

    assert.equal(result.recorded, true);
    const line = fs.readFileSync(telemetryPath, 'utf8').trim();
    assert.ok(line);
    assert.doesNotMatch(line, /Paguei|telefone|5511999999999|user_id|rawRows|spreadsheet/i);

    const entry = JSON.parse(line);
    assert.equal(entry.mode, 'shadow');
    assert.equal(entry.legacyOperation, 'expense.create');
    assert.equal(entry.plannerOperation, 'bill.pay');
    assert.equal(entry.divergenceSeverity, 'critical');
    assert.deepEqual(entry.contextTools, ['match_recurring_bill']);
    assert.ok(entry.senderFingerprint);
});

test('financial command planner canary observes non-allowlisted users without replacing legacy response', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-command-shadow-runner-'));
    const telemetryPath = path.join(dir, 'shadow.jsonl');
    const legacyStructuredResponse = { intent: 'registrar_pagamento', pagamentoDetails: { nome: 'telefone' } };

    const result = await runFinancialCommandPlannerShadow({
        message: 'Paguei 469,09 da conta de telefone',
        senderId: '5511999999999@c.us',
        userId: 'user-b',
        legacyStructuredResponse,
        structuredResponseSource: 'llm',
        planner: async () => ({
            ok: true,
            plan: {
                operation: 'bill.pay',
                missingFields: ['paymentMethod'],
                contextRequests: [{ tool: 'match_recurring_bill' }],
                requiresConfirmation: true
            }
        })
    }, {
        env: {
            FINANCIAL_COMMAND_PLANNER_MODE: 'canary',
            FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS: 'user-a'
        },
        telemetryPath,
        now: () => new Date('2026-06-26T12:00:00.000Z')
    });

    assert.equal(result.observed, true);
    assert.equal(result.visibleStructuredResponse, legacyStructuredResponse);
    const telemetry = JSON.parse(fs.readFileSync(telemetryPath, 'utf8'));
    assert.equal(telemetry.mode, 'canary');
    assert.equal(telemetry.divergenceSeverity, 'critical');
});

test('financial command planner shadow decision marks matching operations as non divergent', () => {
    const decision = buildFinancialCommandPlannerShadowDecision({
        legacyStructuredResponse: { intent: 'gasto' },
        plannerResult: { ok: true, plan: { operation: 'expense.create', contextRequests: [] } },
        structuredResponseSource: 'deterministic',
        evaluationLatencyMs: 3
    });

    assert.equal(decision.legacyOperation, 'expense.create');
    assert.equal(decision.plannerOperation, 'expense.create');
    assert.equal(decision.divergenceSeverity, 'none');
});

test('financial command planner canary telemetry records sanitized route and confirmation events', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-command-canary-'));
    const telemetryPath = path.join(dir, 'canary.jsonl');

    const routed = recordFinancialCommandPlannerCanary({
        senderId: '5511999999999@c.us',
        userId: 'user-secret-123',
        message: 'Paguei 469,09 da conta de telefone',
        mode: 'canary',
        operation: 'bill.pay',
        stage: 'route',
        outcome: 'awaiting_confirmation',
        confirmation: 'pending',
        plannerLatencyMs: 1234.56,
        handlerLatencyMs: 1500.2,
        severity: 'none',
        requiresConfirmation: true,
        missingFields: ['paymentMethod'],
        contextTools: ['match_recurring_bill'],
        routeOperations: ['bill.pay', 'debt.pay']
    }, {
        telemetryPath,
        now: () => new Date('2026-07-02T01:00:00.000Z')
    });
    const confirmed = recordFinancialCommandPlannerCanary({
        senderId: '5511999999999@c.us',
        userId: 'user-secret-123',
        message: 'sim',
        mode: 'canary',
        operation: 'bill.pay',
        stage: 'confirmation',
        outcome: 'saved',
        confirmation: 'confirmed',
        severity: 'none'
    }, {
        telemetryPath,
        now: () => new Date('2026-07-02T01:01:00.000Z')
    });

    assert.equal(routed.recorded, true);
    assert.equal(confirmed.recorded, true);
    const payload = fs.readFileSync(telemetryPath, 'utf8');
    assert.doesNotMatch(payload, /Paguei|telefone|5511999999999|user-secret|rawRows|spreadsheet|469,09/i);

    const lines = payload.trim().split(/\r?\n/).map(JSON.parse);
    assert.equal(lines[0].schemaVersion, 'financial-command-planner-canary-v1');
    assert.equal(lines[0].operation, 'bill.pay');
    assert.equal(lines[0].stage, 'route');
    assert.equal(lines[0].outcome, 'awaiting_confirmation');
    assert.equal(lines[0].confirmation, 'pending');
    assert.equal(lines[0].plannerLatencyMs, 1235);
    assert.deepEqual(lines[0].contextTools, ['match_recurring_bill']);
    assert.ok(lines[0].senderFingerprint);
    assert.ok(lines[0].messageFingerprint);
    assert.equal(lines[1].stage, 'confirmation');
    assert.equal(lines[1].confirmation, 'confirmed');
});

test('financial command planner canary telemetry summary supports rollout gates by operation', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-command-canary-summary-'));
    const telemetryPath = path.join(dir, 'canary.jsonl');
    const now = [
        '2026-07-02T01:00:00.000Z',
        '2026-07-02T01:03:00.000Z',
        '2026-07-02T01:05:00.000Z'
    ];

    recordFinancialCommandPlannerCanary({ operation: 'bill.pay', stage: 'route', outcome: 'awaiting_confirmation', confirmation: 'pending', severity: 'none' }, { telemetryPath, now: () => new Date(now[0]) });
    recordFinancialCommandPlannerCanary({ operation: 'bill.pay', stage: 'confirmation', outcome: 'saved', confirmation: 'confirmed', severity: 'none' }, { telemetryPath, now: () => new Date(now[1]) });
    recordFinancialCommandPlannerCanary({ operation: 'expense.create', stage: 'confirmation', outcome: 'cancelled', confirmation: 'cancelled', severity: 'warning' }, { telemetryPath, now: () => new Date(now[2]) });

    const summary = summarizeFinancialCommandPlannerCanaryTelemetry({ telemetryPath });

    assert.equal(summary.total, 3);
    assert.equal(summary.invalid, 0);
    assert.equal(summary.first, now[0]);
    assert.equal(summary.last, now[2]);
    assert.deepEqual(summary.byOperation, { 'bill.pay': 2, 'expense.create': 1 });
    assert.deepEqual(summary.byStage, { route: 1, confirmation: 2 });
    assert.deepEqual(summary.byConfirmation, { pending: 1, confirmed: 1, cancelled: 1 });
    assert.deepEqual(summary.bySeverity, { none: 2, warning: 1 });
});
