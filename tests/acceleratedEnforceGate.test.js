const test = require('node:test');
const assert = require('node:assert');

const {
    buildAcceleratedEnforceGateReport
} = require('../src/reliability/acceleratedEnforceGate');
const {
    runInterpretationReliabilityAcceptance
} = require('../src/reliability/interpretationReliabilityAcceptance');
const messageHandler = require('../src/handlers/messageHandler');

test('accelerated enforce gate accepts offline evidence but still requires real rollout gates', () => {
    const acceptanceReport = runInterpretationReliabilityAcceptance({
        securityDetector: messageHandler.__test__.detectSecuritySensitiveRequest
    });
    const readinessReport = {
        telemetrySince: '2026-06-18T00:00:00.000Z',
        criticalDivergences: 0,
        shadowEntries: 9,
        byOperation: {
            'expense.create': 5,
            'income.create': 4
        },
        blockers: ['not_enough_decisions', 'observation_window_too_short']
    };

    const report = buildAcceleratedEnforceGateReport({
        acceptanceReport,
        readinessReport,
        e2eVerified: false,
        rollbackVerified: false,
        logsVerified: true
    });

    assert.strictEqual(report.offline.accepted, true);
    assert.strictEqual(report.shadow.accepted, true);
    assert.strictEqual(report.readyForAltissimaAudit, false);
    assert.ok(report.blockers.includes('real_e2e_not_verified'));
    assert.ok(report.blockers.includes('rollback_not_verified'));
    assert.ok(!report.blockers.includes('offline_acceptance_failed'));
    assert.ok(!report.blockers.includes('shadow_has_critical_divergence'));
});

test('accelerated enforce gate can reach audit-ready when active evidence replaces passive waiting', () => {
    const acceptanceReport = runInterpretationReliabilityAcceptance({
        securityDetector: messageHandler.__test__.detectSecuritySensitiveRequest
    });
    const readinessReport = {
        telemetrySince: '2026-06-18T00:00:00.000Z',
        criticalDivergences: 0,
        shadowEntries: 9,
        byOperation: {
            'expense.create': 5,
            'income.create': 4
        },
        blockers: ['not_enough_decisions', 'observation_window_too_short']
    };

    const report = buildAcceleratedEnforceGateReport({
        acceptanceReport,
        readinessReport,
        e2eVerified: true,
        rollbackVerified: true,
        logsVerified: true
    });

    assert.strictEqual(report.readyForAltissimaAudit, true);
    assert.deepStrictEqual(report.blockers, []);
    assert.strictEqual(report.offline.targetOperations['expense.create'].total >= 50, true);
    assert.strictEqual(report.offline.targetOperations['income.create'].total >= 50, true);
    assert.strictEqual(report.offline.adversarial.blocked, report.offline.adversarial.total);
});
