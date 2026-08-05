'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    CANONICAL_HISTORICAL_RX_INVENTORY,
    buildOpenFinanceHistoricalRx
} = require('../src/openFinance/openFinanceHistoricalRx');
const {
    OpenFinanceHistoricalAmbiguityReviewStore,
    buildOpenFinanceHistoricalAmbiguityReview
} = require('../src/openFinance/openFinanceHistoricalAmbiguityReview');
const {
    reconcileOpenFinanceHistoricalAmbiguityDecisions
} = require('../src/openFinance/openFinanceHistoricalAmbiguityReconciler');

const SECRET = 'historical-ambiguity-reconciler-secret-2026';
const DANIEL = '5511999999999@c.us';
const THAIS = '5511888888888@c.us';
const NOW = '2026-08-05T12:00:00.000Z';

function canonicalFixture({ investmentAmount = -2000, unrelatedBlocker = false } = {}) {
    const owners = {
        daniel_nubank: 'daniel',
        thais_nubank: 'thais',
        thais_itau: 'thais',
        cristina_nubank: 'thais'
    };
    const items = Object.entries(owners).map(([alias, ownerScope]) => ({
        alias_code: alias,
        owner_scope: ownerScope,
        availability: {
            accounts: 'available', transactions: 'available', bills: 'available',
            investments: 'available', investment_transactions: 'available'
        },
        accounts: [
            { id: `${alias}-bank`, type: 'BANK', subtype: 'CHECKING_ACCOUNT',
                currency: 'BRL', balance_cents: 0 },
            { id: `${alias}-card`, type: 'CREDIT', subtype: 'CREDIT_CARD',
                currency: 'BRL', balance_cents: 0, credit_limit_cents: 0,
                available_credit_limit_cents: 0, used_limit_cents: 0 }
        ],
        transactions: [],
        bills: [],
        investments: []
    }));
    items.find(item => item.alias_code === 'thais_itau').accounts.push({
        id: 'thais_itau-savings', type: 'BANK', subtype: 'SAVINGS_ACCOUNT',
        currency: 'BRL', balance_cents: 0
    });
    const thais = items.find(item => item.alias_code === 'thais_nubank');
    thais.transactions.push({
        id: 'nonambiguous-family-row', account_id: 'thais_nubank-bank',
        description: 'Movimento familiar observado', date: '2025-08-09T12:00:00.000Z',
        amount_cents: 100, status: 'POSTED'
    });
    if (unrelatedBlocker) thais.availability.bills = 'partial';
    const daniel = items.find(item => item.alias_code === 'daniel_nubank');
    daniel.transactions.push(
        {
            id: 'installment-a', account_id: 'daniel_nubank-card',
            description: 'Compra parcelada', original_date: '2025-07-10',
            date: '2025-08-10T12:00:00.000Z', amount_cents: -5000,
            installment_number: 2, total_installments: 3,
            bill_forecast_month: '2025-08', status: 'POSTED'
        },
        {
            id: 'installment-b', account_id: 'daniel_nubank-card',
            description: 'Compra parcelada', original_date: '2025-07-10',
            date: '2025-08-11T12:00:00.000Z', amount_cents: -5000,
            installment_number: 2, total_installments: 3,
            bill_forecast_month: '2025-08', status: 'POSTED'
        },
        {
            id: 'investment-a', account_id: 'daniel_nubank-bank',
            description: 'Movimento patrimonial', date: '2025-08-12T12:00:00.000Z',
            amount_cents: investmentAmount, operation_type: 'INVESTIMENTO', status: 'POSTED'
        }
    );
    return {
        items,
        historyStartDate: '2025-07-01',
        observedAt: '2026-08-04T12:00:00.000Z',
        secret: SECRET,
        expectedInventory: structuredClone(CANONICAL_HISTORICAL_RX_INVENTORY),
        sourceLifecycles: Object.fromEntries(Object.keys(owners)
            .map(alias => [alias, { existedAtHistoryStart: true }]))
    };
}

function buildReviewedSnapshot(directory, {
    installmentChoice = '2', investmentChoice = '1', investmentAmount = -2000,
    unrelatedBlocker = false
} = {}) {
    const input = canonicalFixture({ investmentAmount, unrelatedBlocker });
    const historicalRx = buildOpenFinanceHistoricalRx(input);
    const expectedBlockers = [
        'daniel_nubank:installment_series_ambiguous',
        'daniel_nubank:investment_movement_semantics_ambiguous',
        ...(unrelatedBlocker ? ['thais_nubank:bills_partial'] : [])
    ].sort();
    assert.deepStrictEqual(historicalRx.blockers, expectedBlockers);
    const candidate = buildOpenFinanceHistoricalAmbiguityReview({
        items: input.items,
        historicalRx,
        secret: SECRET,
        familyScope: 'family',
        authorizedWhatsAppIds: [DANIEL, THAIS],
        clock: () => new Date(NOW)
    });
    const store = new OpenFinanceHistoricalAmbiguityReviewStore({
        databasePath: path.join(directory, 'review.sqlite'),
        secret: SECRET,
        familyScope: 'family',
        authorizedWhatsAppIds: [DANIEL, THAIS],
        clock: () => new Date(NOW)
    });
    store.prepare({ sealedState: candidate.sealed_state });
    store.handleReply({ actorWhatsappId: DANIEL, body: '1' });
    store.handleReply({ actorWhatsappId: DANIEL, body: installmentChoice });
    store.handleReply({ actorWhatsappId: THAIS, body: '1' });
    const completed = store.handleReply({ actorWhatsappId: THAIS, body: investmentChoice });
    assert.equal(completed.state, 'reviewed');
    return { input, historicalRx, store };
}

test('durable family decisions deterministically unblock a read-only historical RX', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-ambiguity-reconciler-'));
    let store;
    try {
        const built = buildReviewedSnapshot(directory);
        store = built.store;
        const resolutionSnapshot = store.readPrivate({ actorWhatsappId: DANIEL });
        const first = reconcileOpenFinanceHistoricalAmbiguityDecisions({
            ...built.input,
            historicalRx: built.historicalRx,
            resolutionSnapshot,
            familyScope: 'family'
        });
        const replay = reconcileOpenFinanceHistoricalAmbiguityDecisions({
            ...built.input,
            historicalRx: built.historicalRx,
            resolutionSnapshot,
            familyScope: 'family'
        });

        assert.deepStrictEqual(replay, first);
        assert.equal(first.ready_for_reconciliation, true);
        assert.deepStrictEqual(first.blockers, []);
        assert.equal(first.financial_writes, 0);
        assert.deepStrictEqual(first.ambiguity_resolution, {
            review_ref: resolutionSnapshot.review_ref,
            rx_ref: resolutionSnapshot.rx_ref,
            applied_decisions: 2,
            excluded_rows: 1,
            resolved_installment_items: 1,
            resolved_investment_items: 1,
            financial_writes: 0
        });
        const card = first.segments.find(segment =>
            segment.source_alias === 'daniel_nubank' && segment.product === 'credit_card');
        const bank = first.segments.find(segment =>
            segment.source_alias === 'daniel_nubank' && segment.product === 'bank_account');
        assert.equal(card.flows.count, 1);
        assert.equal(bank.investment_movements.applications_cents, 2000);
    } finally {
        store?.close();
        fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});

test('restart preserves the same decisions and tampering fails closed', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-ambiguity-reconciler-restart-'));
    let store;
    try {
        const built = buildReviewedSnapshot(directory, { unrelatedBlocker: true });
        store = built.store;
        const before = store.readPrivate({ actorWhatsappId: THAIS });
        const beforeRestart = reconcileOpenFinanceHistoricalAmbiguityDecisions({
            ...built.input, historicalRx: built.historicalRx,
            resolutionSnapshot: before, familyScope: 'family'
        });
        assert.deepStrictEqual(beforeRestart.blockers, ['thais_nubank:bills_partial']);
        assert.equal(beforeRestart.ready_for_reconciliation, false);
        store.close();
        store = new OpenFinanceHistoricalAmbiguityReviewStore({
            databasePath: path.join(directory, 'review.sqlite'), secret: SECRET,
            familyScope: 'family', authorizedWhatsAppIds: [DANIEL, THAIS],
            clock: () => new Date(NOW)
        });
        const after = store.readPrivate({ actorWhatsappId: DANIEL });
        assert.deepStrictEqual(after, before);
        const afterRestart = reconcileOpenFinanceHistoricalAmbiguityDecisions({
            ...built.input, historicalRx: built.historicalRx,
            resolutionSnapshot: after, familyScope: 'family'
        });
        assert.deepStrictEqual(afterRestart, beforeRestart);

        const tampered = structuredClone(after);
        tampered.decisions[0].resolution_code = 'keep_only:forged';
        assert.throws(() => reconcileOpenFinanceHistoricalAmbiguityDecisions({
            ...built.input,
            historicalRx: built.historicalRx,
            resolutionSnapshot: tampered,
            familyScope: 'family'
        }), /resolution_snapshot_invalid/);
    } finally {
        store?.close();
        fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});

test('distinct installment rows are separated without creating a save authorization', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-ambiguity-distinct-'));
    let store;
    try {
        const built = buildReviewedSnapshot(directory, { installmentChoice: '1' });
        store = built.store;
        const resolutionSnapshot = store.readPrivate({ actorWhatsappId: DANIEL });
        const result = reconcileOpenFinanceHistoricalAmbiguityDecisions({
            ...built.input,
            historicalRx: built.historicalRx,
            resolutionSnapshot,
            familyScope: 'family'
        });
        const card = result.segments.find(segment =>
            segment.source_alias === 'daniel_nubank' && segment.product === 'credit_card');
        assert.equal(result.ready_for_reconciliation, true);
        assert.deepStrictEqual(result.blockers, []);
        assert.equal(card.flows.count, 2);
        assert.equal(card.installments.series_count, 2);
        assert.equal(card.installments.ambiguous_series_count, 0);
        assert.ok(card.installments.series.every(series =>
            series.grouping_confidence === 'family_review_distinct'
            && series.save_eligibility === 'not_authorized_by_read_only_rx'));
        assert.equal(result.financial_writes, 0);
    } finally {
        store?.close();
        fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});

test('partial, cross-RX, and direction-incompatible decisions fail closed', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-ambiguity-invalid-'));
    let store;
    try {
        const built = buildReviewedSnapshot(directory);
        store = built.store;
        const snapshot = store.readPrivate({ actorWhatsappId: DANIEL });
        const partial = structuredClone(snapshot);
        partial.state = 'pending';
        partial.pending_count = 1;
        partial.decisions.pop();
        assert.throws(() => reconcileOpenFinanceHistoricalAmbiguityDecisions({
            ...built.input, historicalRx: built.historicalRx,
            resolutionSnapshot: partial, familyScope: 'family'
        }), /resolution_snapshot_invalid/);

        const changedNonAmbiguousIdentity = structuredClone(built.input);
        changedNonAmbiguousIdentity.items.find(item => item.alias_code === 'thais_nubank')
            .transactions.find(transaction => transaction.id === 'nonambiguous-family-row')
            .description = 'Mesmo agregado, outra linha fonte';
        assert.throws(() => reconcileOpenFinanceHistoricalAmbiguityDecisions({
            ...changedNonAmbiguousIdentity, historicalRx: built.historicalRx,
            resolutionSnapshot: snapshot, familyScope: 'family'
        }), /resolution_snapshot_invalid/);

        const changedNonAmbiguousValue = structuredClone(built.input);
        changedNonAmbiguousValue.items.find(item => item.alias_code === 'thais_nubank')
            .transactions.find(transaction => transaction.id === 'nonambiguous-family-row')
            .amount_cents = 101;
        const changedHistoricalRx = buildOpenFinanceHistoricalRx(changedNonAmbiguousValue);
        assert.throws(() => reconcileOpenFinanceHistoricalAmbiguityDecisions({
            ...changedNonAmbiguousValue, historicalRx: changedHistoricalRx,
            resolutionSnapshot: snapshot, familyScope: 'family'
        }), /resolution_snapshot_invalid/);

        const changedInput = structuredClone(built.input);
        changedInput.items.find(item => item.alias_code === 'daniel_nubank')
            .transactions[0].id = 'different-provider-identity';
        const genericIdentityDecision = structuredClone(snapshot);
        genericIdentityDecision.decisions.find(decision =>
            decision.type === 'installment_identity').resolution_code = 'distinct_rows';
        assert.throws(() => reconcileOpenFinanceHistoricalAmbiguityDecisions({
            ...changedInput, historicalRx: built.historicalRx,
            resolutionSnapshot: genericIdentityDecision, familyScope: 'family'
        }), /resolution_snapshot_invalid/);

        const incompatible = structuredClone(snapshot);
        const investment = incompatible.decisions.find(decision =>
            decision.type === 'investment_semantics');
        investment.resolution_code = 'reserve_redemption';
        assert.throws(() => reconcileOpenFinanceHistoricalAmbiguityDecisions({
            ...built.input, historicalRx: built.historicalRx,
            resolutionSnapshot: incompatible, familyScope: 'family'
        }), /resolution_snapshot_invalid/);
    } finally {
        store?.close();
        fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});

test('all remaining family choices preserve direction and read-only semantics', async t => {
    const scenarios = [
        {
            name: 'discard all installments and keep a negative row outside investments',
            options: { installmentChoice: '4', investmentChoice: '2' },
            verify(result) {
                const card = result.segments.find(segment =>
                    segment.source_alias === 'daniel_nubank' && segment.product === 'credit_card');
                const bank = result.segments.find(segment =>
                    segment.source_alias === 'daniel_nubank' && segment.product === 'bank_account');
                assert.equal(card.flows.count, 0);
                assert.equal(bank.investment_movements.count, 0);
                assert.equal(bank.flows.non_reserve_principal_debits_cents, 2000);
                assert.equal(result.ambiguity_resolution.excluded_rows, 2);
            }
        },
        {
            name: 'positive movement can be classified as reserve redemption',
            options: { investmentAmount: 2000, investmentChoice: '1' },
            verify(result) {
                const bank = result.segments.find(segment =>
                    segment.source_alias === 'daniel_nubank' && segment.product === 'bank_account');
                assert.equal(bank.investment_movements.redemptions_cents, 2000);
                assert.equal(bank.investment_movements.investment_income_cents, 0);
            }
        },
        {
            name: 'positive movement can be classified as investment income',
            options: { investmentAmount: 2000, investmentChoice: '2' },
            verify(result) {
                const bank = result.segments.find(segment =>
                    segment.source_alias === 'daniel_nubank' && segment.product === 'bank_account');
                assert.equal(bank.investment_movements.redemptions_cents, 0);
                assert.equal(bank.investment_movements.investment_income_cents, 2000);
            }
        }
    ];
    for (const scenario of scenarios) {
        await t.test(scenario.name, () => {
            const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-ambiguity-choice-'));
            let store;
            try {
                const built = buildReviewedSnapshot(directory, scenario.options);
                store = built.store;
                const resolutionSnapshot = store.readPrivate({ actorWhatsappId: DANIEL });
                const result = reconcileOpenFinanceHistoricalAmbiguityDecisions({
                    ...built.input, historicalRx: built.historicalRx,
                    resolutionSnapshot, familyScope: 'family'
                });
                assert.equal(result.ready_for_reconciliation, true);
                assert.deepStrictEqual(result.blockers, []);
                assert.equal(result.financial_writes, 0);
                scenario.verify(result);
            } finally {
                store?.close();
                fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
            }
        });
    }
});
