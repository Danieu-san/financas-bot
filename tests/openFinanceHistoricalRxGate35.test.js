'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    prepareOpenFinanceHistoricalRxGate35,
    recalculateOpenFinanceHistoricalRxGate35
} = require('../src/openFinance/openFinanceHistoricalRxGate35');

const BASE = Object.freeze({
    items: Object.freeze([{ alias_code: 'private-fixture' }]),
    historicalRx: Object.freeze({
        history_start_date: '2025-07-01',
        observed_at: '2026-08-04T12:00:00.000Z',
        blockers: Object.freeze(['source:installment_series_ambiguous']),
        ready_for_reconciliation: false,
        financial_writes: 0
    }),
    secret: 'gate-35-local-test-secret-with-32-characters',
    familyScope: 'family',
    authorizedWhatsAppIds: Object.freeze(['daniel@c.us', 'thais@c.us'])
});

test('Gate 35 prepara somente a revisao cifrada', () => {
    let received;
    const result = prepareOpenFinanceHistoricalRxGate35(BASE, {
        buildReview(input) {
            received = input;
            return { sealed_state: 'sealed-private-state', pending_count: 2,
                reply: 'private reply', financial_writes: 0 };
        }
    });
    assert.deepStrictEqual(received, BASE);
    assert.deepStrictEqual(result, {
        gate: 'OPEN_FINANCE_HISTORICAL_RX_GATE_35', state: 'review_ready',
        sealed_state: 'sealed-private-state', pending_count: 2, financial_writes: 0
    });
    assert.equal(JSON.stringify(result).includes('private reply'), false);
});

test('Gate 35 recalcula e preserva blockers independentes', () => {
    const resolutionSnapshot = Object.freeze({ state: 'reviewed', pending_count: 0,
        financial_writes: 0 });
    const report = { ready_for_reconciliation: false,
        blockers: ['thais_nubank:bills_partial'],
        ambiguity_resolution: { applied_decisions: 2 }, financial_writes: 0 };
    const result = recalculateOpenFinanceHistoricalRxGate35({
        ...BASE, resolutionSnapshot, historyStartDate: '2025-07-01',
        observedAt: '2026-08-04T12:00:00.000Z'
    }, { reconcile: () => report });
    assert.deepStrictEqual(result, {
        gate: 'OPEN_FINANCE_HISTORICAL_RX_GATE_35', state: 'partial_no_go',
        ready_for_reconciliation: false, applied_decisions: 2,
        remaining_blockers: ['thais_nubank:bills_partial'], report,
        financial_writes: 0
    });
});

test('Gate 35 falha fechado para escrita ou decisao incompleta', () => {
    assert.throws(() => prepareOpenFinanceHistoricalRxGate35(BASE, {
        buildReview: () => ({ sealed_state: 'sealed', pending_count: 1, financial_writes: 1 })
    }), /gate35_financial_write_blocked/);
    assert.throws(() => recalculateOpenFinanceHistoricalRxGate35({
        ...BASE,
        resolutionSnapshot: { state: 'pending', pending_count: 1, financial_writes: 0 },
        historyStartDate: '2025-07-01', observedAt: '2026-08-04T12:00:00.000Z'
    }, { reconcile: () => { throw new Error('must_not_run'); } }),
    /gate35_complete_resolution_required/);
});
