const test = require('node:test');
const assert = require('node:assert');

const {
    buildFinancialCommandPlannerAcceleratedGateReport
} = require('../src/planning/financialCommandPlannerAcceleratedGate');

const REQUIRED_OPERATIONS = ['bill.pay', 'debt.pay', 'invoice.pay', 'expense.create'];

function makeTelemetry() {
    const entries = [];
    let minute = 0;
    for (const operation of REQUIRED_OPERATIONS) {
        entries.push({
            ts: `2026-07-02T01:${String(minute++).padStart(2, '0')}:00.000Z`,
            operation,
            stage: 'route',
            outcome: 'handled',
            confirmation: 'pending',
            severity: 'none',
            plannerLatencyMs: 900,
            handlerLatencyMs: 1200
        });
        entries.push({
            ts: `2026-07-02T01:${String(minute++).padStart(2, '0')}:00.000Z`,
            operation,
            stage: 'confirmation',
            outcome: 'saved',
            confirmation: 'confirmed',
            severity: 'none'
        });
        entries.push({
            ts: `2026-07-02T01:${String(minute++).padStart(2, '0')}:00.000Z`,
            operation,
            stage: 'confirmation',
            outcome: 'cancelled',
            confirmation: 'cancelled',
            severity: 'none'
        });
    }
    entries.push({
        ts: '2026-07-02T02:00:00.000Z',
        operation: 'bill.pay',
        stage: 'confirmation',
        outcome: 'replayed',
        confirmation: 'confirmed',
        severity: 'none'
    });
    return entries;
}

function completeEvidence() {
    return {
        focusedTests: true,
        plannerBattery: true,
        ledgerParity: true,
        degradedFallbacks: true,
        idempotency: true,
        dateBoundaries: true,
        restartRecovery: true,
        securityAndPrivacy: true,
        productionE2E: true,
        rollback: true,
        cleanup: true
    };
}

test('accelerated command planner gate returns GO only with complete adversarial evidence', () => {
    const report = buildFinancialCommandPlannerAcceleratedGateReport({
        telemetryEntries: makeTelemetry(),
        evidence: completeEvidence(),
        plannerP95LimitMs: 5000,
        handlerP95LimitMs: 10000
    });

    assert.equal(report.decision, 'GO');
    assert.equal(report.ready, true);
    assert.deepEqual(report.blockers, []);
    assert.equal(report.telemetry.critical, 0);
    assert.equal(report.telemetry.errors, 0);
    assert.equal(report.telemetry.sensitiveRecords, 0);
    assert.equal(report.telemetry.coverage['bill.pay'].replayed, 1);
});

test('accelerated command planner gate blocks missing operation outcomes and missing evidence', () => {
    const telemetryEntries = makeTelemetry().filter(entry => (
        entry.operation !== 'invoice.pay' || entry.outcome === 'handled'
    ));
    const evidence = completeEvidence();
    evidence.restartRecovery = false;

    const report = buildFinancialCommandPlannerAcceleratedGateReport({
        telemetryEntries,
        evidence
    });

    assert.equal(report.decision, 'NO-GO');
    assert.ok(report.blockers.includes('invoice.pay:missing_saved'));
    assert.ok(report.blockers.includes('invoice.pay:missing_cancelled'));
    assert.ok(report.blockers.includes('evidence:restartRecovery'));
});

test('accelerated command planner gate blocks critical errors, latency and sensitive raw fields', () => {
    const telemetryEntries = makeTelemetry();
    telemetryEntries.push({
        ts: '2026-07-02T03:00:00.000Z',
        operation: 'expense.create',
        stage: 'confirmation',
        outcome: 'error',
        confirmation: 'confirmed',
        severity: 'critical',
        plannerLatencyMs: 12000,
        handlerLatencyMs: 45000,
        message: 'Gastei 99 via Pix',
        userId: 'user-secret',
        spreadsheetId: 'sheet-secret'
    });

    const report = buildFinancialCommandPlannerAcceleratedGateReport({
        telemetryEntries,
        evidence: completeEvidence(),
        plannerP95LimitMs: 5000,
        handlerP95LimitMs: 10000
    });

    assert.equal(report.decision, 'NO-GO');
    assert.ok(report.blockers.includes('telemetry:critical'));
    assert.ok(report.blockers.includes('telemetry:error'));
    assert.ok(report.blockers.includes('telemetry:sensitive_data'));
    assert.ok(report.blockers.includes('telemetry:planner_p95'));
    assert.ok(report.blockers.includes('telemetry:handler_p95'));
});

test('accelerated command planner gate treats malformed telemetry as a blocker', () => {
    const report = buildFinancialCommandPlannerAcceleratedGateReport({
        telemetryEntries: [...makeTelemetry(), null, 'not-an-object'],
        evidence: completeEvidence()
    });

    assert.equal(report.decision, 'NO-GO');
    assert.equal(report.telemetry.invalid, 2);
    assert.ok(report.blockers.includes('telemetry:invalid'));
});
