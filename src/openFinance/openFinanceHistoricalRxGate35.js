'use strict';

const {
    buildOpenFinanceHistoricalAmbiguityReview
} = require('./openFinanceHistoricalAmbiguityReview');
const {
    reconcileOpenFinanceHistoricalAmbiguityDecisions
} = require('./openFinanceHistoricalAmbiguityReconciler');

const GATE = 'OPEN_FINANCE_HISTORICAL_RX_GATE_35';

function requireReadOnly(value) {
    if (!value || value.financial_writes !== 0) {
        throw new Error('open_finance_historical_rx_gate35_financial_write_blocked');
    }
    return value;
}

function prepareOpenFinanceHistoricalRxGate35(input = {}, {
    buildReview = buildOpenFinanceHistoricalAmbiguityReview
} = {}) {
    requireReadOnly(input.historicalRx);
    const prepared = requireReadOnly(buildReview(input));
    if (!prepared.sealed_state || !Number.isSafeInteger(prepared.pending_count)
        || prepared.pending_count < 1) {
        throw new Error('open_finance_historical_rx_gate35_review_invalid');
    }
    return Object.freeze({
        gate: GATE,
        state: 'review_ready',
        sealed_state: prepared.sealed_state,
        pending_count: prepared.pending_count,
        financial_writes: 0
    });
}

function recalculateOpenFinanceHistoricalRxGate35(input = {}, {
    reconcile = reconcileOpenFinanceHistoricalAmbiguityDecisions
} = {}) {
    requireReadOnly(input.historicalRx);
    const resolution = requireReadOnly(input.resolutionSnapshot);
    if (resolution.state !== 'reviewed' || resolution.pending_count !== 0) {
        throw new Error('open_finance_historical_rx_gate35_complete_resolution_required');
    }
    const report = requireReadOnly(reconcile(input));
    if (!Array.isArray(report.blockers)
        || typeof report.ready_for_reconciliation !== 'boolean'
        || !Number.isSafeInteger(report.ambiguity_resolution?.applied_decisions)) {
        throw new Error('open_finance_historical_rx_gate35_recalculation_invalid');
    }
    const blockers = Object.freeze([...report.blockers]);
    return Object.freeze({
        gate: GATE,
        state: report.ready_for_reconciliation ? 'resolved' : 'partial_no_go',
        ready_for_reconciliation: report.ready_for_reconciliation,
        applied_decisions: report.ambiguity_resolution.applied_decisions,
        remaining_blockers: blockers,
        report,
        financial_writes: 0
    });
}

module.exports = {
    GATE,
    prepareOpenFinanceHistoricalRxGate35,
    recalculateOpenFinanceHistoricalRxGate35
};
