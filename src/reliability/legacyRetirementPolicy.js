const RETIREMENT_PROFILES = Object.freeze({
    test_only: Object.freeze({ softDisableDays: 0, physicalDeleteDays: 7, acceleratedDeleteDays: 7 }),
    read_only: Object.freeze({ softDisableDays: 7, physicalDeleteDays: 60, acceleratedDeleteDays: 30 }),
    periodic_read_only: Object.freeze({ softDisableDays: 14, physicalDeleteDays: 60, acceleratedDeleteDays: 30, simulatedCycles: 2 }),
    mutating: Object.freeze({ softDisableDays: 14, physicalDeleteDays: 60, acceleratedDeleteDays: 60 }),
    source_rollback: Object.freeze({ softDisableDays: null, physicalDeleteDays: 60, acceleratedDeleteDays: 60 })
});

function nonNegative(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
}

function commonBlockers(evidence = {}) {
    const blockers = [];
    if (!evidence.telemetryActive) blockers.push('telemetry_inactive');
    if (nonNegative(evidence.invalidTelemetryLines) > 0) blockers.push('telemetry_invalid_lines');
    if (!evidence.entrypointsCovered) blockers.push('entrypoints_not_covered');
    if (!evidence.staticDynamicAuditComplete) blockers.push('static_dynamic_audit_incomplete');
    if (!evidence.activePathTestsPassed) blockers.push('active_path_tests_missing');
    if (!evidence.shadowParityPassed) blockers.push('shadow_parity_missing');
    if (!evidence.rollbackTested) blockers.push('rollback_not_tested');
    if (nonNegative(evidence.unexplainedDivergences) > 0) blockers.push('unexplained_divergence');
    return blockers;
}

function evaluateLegacyRetirementCandidate(input = {}) {
    const riskClass = String(input.riskClass || '');
    const profile = RETIREMENT_PROFILES[riskClass];
    if (!profile) {
        return {
            candidate: String(input.candidate || 'unknown'),
            risk_class: riskClass || 'unknown',
            soft_disable: { verdict: 'BLOCKED', blockers: ['invalid_risk_class'] },
            physical_delete: { verdict: 'BLOCKED', blockers: ['invalid_risk_class'] }
        };
    }

    const evidence = input.evidence || {};
    const shared = commonBlockers(evidence);
    const softBlockers = [...shared];

    if (riskClass === 'source_rollback') {
        softBlockers.push('required_for_cutover_rollback');
    } else if (nonNegative(evidence.observationDays) < profile.softDisableDays) {
        softBlockers.push('soft_disable_observation_incomplete');
    }
    if (nonNegative(evidence.criticalFallbackEvents) > 0) softBlockers.push('critical_fallback_observed');
    if (riskClass === 'test_only') {
        if (!evidence.productionFlagOff) softBlockers.push('production_flag_not_off');
        if (nonNegative(evidence.runtimeConsumers) > 0) softBlockers.push('runtime_consumer_present');
    }
    if (riskClass === 'periodic_read_only'
        && nonNegative(evidence.simulatedCycles) < profile.simulatedCycles) {
        softBlockers.push('simulated_cycles_incomplete');
    }
    if (riskClass === 'mutating') {
        if (!evidence.isolatedFixturePassed) softBlockers.push('isolated_fixture_missing');
        if (!evidence.cleanupProved) softBlockers.push('cleanup_not_proved');
        if (!evidence.writeIdempotencyPassed) softBlockers.push('write_idempotency_missing');
    }

    const deleteBlockers = [...shared];
    if (!evidence.softDisabled) deleteBlockers.push('soft_disable_not_active');
    if (nonNegative(evidence.realLegacyUsageEvents) > 0) deleteBlockers.push('legacy_usage_after_soft_disable');
    if (nonNegative(evidence.rollbackInvocations) > 0) deleteBlockers.push('rollback_was_needed');
    if (riskClass === 'source_rollback' && !evidence.cutoverStable) deleteBlockers.push('cutover_not_stable');

    const acceleratedDeleteAllowed = riskClass === 'test_only' || evidence.independentAuditApproved === true;
    const requiredDeleteDays = acceleratedDeleteAllowed
        ? profile.acceleratedDeleteDays
        : profile.physicalDeleteDays;
    if (nonNegative(evidence.softDisabledDays) < requiredDeleteDays) {
        deleteBlockers.push('physical_delete_observation_incomplete');
    }

    return {
        candidate: String(input.candidate || 'unknown'),
        risk_class: riskClass,
        soft_disable: {
            verdict: softBlockers.length ? 'OBSERVING' : 'CANDIDATE',
            minimum_days: profile.softDisableDays,
            blockers: Array.from(new Set(softBlockers))
        },
        physical_delete: {
            verdict: deleteBlockers.length ? 'BLOCKED' : 'CANDIDATE',
            minimum_days_after_soft_disable: requiredDeleteDays,
            accelerated_path: acceleratedDeleteAllowed,
            blockers: Array.from(new Set(deleteBlockers))
        }
    };
}

module.exports = {
    RETIREMENT_PROFILES,
    evaluateLegacyRetirementCandidate
};
