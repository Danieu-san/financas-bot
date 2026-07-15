const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateLegacyRetirementCandidate } = require('../src/reliability/legacyRetirementPolicy');

function completeEvidence(overrides = {}) {
    return {
        telemetryActive: true,
        invalidTelemetryLines: 0,
        entrypointsCovered: true,
        staticDynamicAuditComplete: true,
        activePathTestsPassed: true,
        shadowParityPassed: true,
        rollbackTested: true,
        unexplainedDivergences: 0,
        criticalFallbackEvents: 0,
        observationDays: 14,
        softDisabled: false,
        softDisabledDays: 0,
        realLegacyUsageEvents: 0,
        rollbackInvocations: 0,
        ...overrides
    };
}

test('read-only path can become a reversible soft-disable candidate before physical deletion', () => {
    const report = evaluateLegacyRetirementCandidate({
        candidate: 'read-only-path',
        riskClass: 'read_only',
        evidence: completeEvidence({ observationDays: 7 })
    });
    assert.strictEqual(report.soft_disable.verdict, 'CANDIDATE');
    assert.strictEqual(report.physical_delete.verdict, 'BLOCKED');
    assert.ok(report.physical_delete.blockers.includes('soft_disable_not_active'));
});

test('periodic route requires two simulated cycles even for reversible disablement', () => {
    const report = evaluateLegacyRetirementCandidate({
        candidate: 'monthly-route',
        riskClass: 'periodic_read_only',
        evidence: completeEvidence({ observationDays: 14, simulatedCycles: 1 })
    });
    assert.strictEqual(report.soft_disable.verdict, 'OBSERVING');
    assert.ok(report.soft_disable.blockers.includes('simulated_cycles_incomplete'));
});

test('mutating path requires isolated fixture cleanup and idempotency evidence', () => {
    const report = evaluateLegacyRetirementCandidate({
        candidate: 'mutating-route',
        riskClass: 'mutating',
        evidence: completeEvidence({ observationDays: 14 })
    });
    assert.deepStrictEqual(report.soft_disable.blockers.filter(item => [
        'isolated_fixture_missing', 'cleanup_not_proved', 'write_idempotency_missing'
    ].includes(item)), [
        'isolated_fixture_missing', 'cleanup_not_proved', 'write_idempotency_missing'
    ]);
});

test('source rollback cannot be soft-disabled before the cutover is stable', () => {
    const report = evaluateLegacyRetirementCandidate({
        candidate: 'sheets-fallback',
        riskClass: 'source_rollback',
        evidence: completeEvidence({ softDisabled: true, softDisabledDays: 60 })
    });
    assert.ok(report.soft_disable.blockers.includes('required_for_cutover_rollback'));
    assert.ok(report.physical_delete.blockers.includes('cutover_not_stable'));
});

test('accelerated physical deletion of read-only code still needs independent audit and 30 disabled days', () => {
    const withoutAudit = evaluateLegacyRetirementCandidate({
        candidate: 'read-only-path',
        riskClass: 'read_only',
        evidence: completeEvidence({ softDisabled: true, softDisabledDays: 30 })
    });
    assert.strictEqual(withoutAudit.physical_delete.minimum_days_after_soft_disable, 60);
    assert.strictEqual(withoutAudit.physical_delete.verdict, 'BLOCKED');

    const withAudit = evaluateLegacyRetirementCandidate({
        candidate: 'read-only-path',
        riskClass: 'read_only',
        evidence: completeEvidence({
            softDisabled: true,
            softDisabledDays: 30,
            independentAuditApproved: true
        })
    });
    assert.strictEqual(withAudit.physical_delete.minimum_days_after_soft_disable, 30);
    assert.strictEqual(withAudit.physical_delete.verdict, 'CANDIDATE');
});

test('test-only component can use the short path only when production is off and runtime has no consumer', () => {
    const report = evaluateLegacyRetirementCandidate({
        candidate: 'test-only-service',
        riskClass: 'test_only',
        evidence: completeEvidence({
            observationDays: 0,
            productionFlagOff: true,
            runtimeConsumers: 0,
            softDisabled: true,
            softDisabledDays: 7
        })
    });
    assert.strictEqual(report.soft_disable.verdict, 'CANDIDATE');
    assert.strictEqual(report.physical_delete.verdict, 'CANDIDATE');
});
