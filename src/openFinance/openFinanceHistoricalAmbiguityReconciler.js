'use strict';

const {
    buildOpenFinanceHistoricalAmbiguityResolutionPlan
} = require('./openFinanceHistoricalAmbiguityReview');
const { buildOpenFinanceHistoricalRx } = require('./openFinanceHistoricalRx');

function reconcileOpenFinanceHistoricalAmbiguityDecisions({
    items = [],
    historicalRx,
    resolutionSnapshot,
    secret,
    familyScope = 'shared-family',
    historyStartDate,
    observedAt,
    sourceLifecycles = {},
    expectedInventory
} = {}) {
    if (!historicalRx || historicalRx.financial_writes !== 0
        || historicalRx.history_start_date !== historyStartDate
        || historicalRx.observed_at !== new Date(observedAt).toISOString()) {
        throw new Error('open_finance_historical_ambiguity_reconciler_rx_mismatch');
    }
    const ambiguityResolutionPlan = buildOpenFinanceHistoricalAmbiguityResolutionPlan({
        items,
        historicalRx,
        resolutionSnapshot,
        secret,
        familyScope
    });
    const reconciled = buildOpenFinanceHistoricalRx({
        items,
        historyStartDate,
        observedAt,
        secret,
        sourceLifecycles,
        expectedInventory,
        ambiguityResolutionPlan
    });
    return Object.freeze({
        ...reconciled,
        ambiguity_resolution: Object.freeze({
            review_ref: ambiguityResolutionPlan.review_ref,
            rx_ref: ambiguityResolutionPlan.rx_ref,
            applied_decisions: ambiguityResolutionPlan.applied_decisions,
            excluded_rows: ambiguityResolutionPlan.excluded_candidate_refs.length,
            resolved_installment_items: ambiguityResolutionPlan.resolved_installment_items,
            resolved_investment_items: ambiguityResolutionPlan.resolved_investment_items,
            financial_writes: 0
        }),
        financial_writes: 0
    });
}

module.exports = { reconcileOpenFinanceHistoricalAmbiguityDecisions };
