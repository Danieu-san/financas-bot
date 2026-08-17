'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    OpenFinanceHistoricalAmbiguityReviewStore,
    applyOpenFinanceHistoricalAmbiguityLocalDecision,
    buildOpenFinanceHistoricalAmbiguityLocalReviewView,
    buildOpenFinanceHistoricalAmbiguityReview,
    buildOpenFinanceHistoricalAmbiguityResolutionPlan,
    readOpenFinanceHistoricalAmbiguityReviewPrivate,
    writeOpenFinanceHistoricalAmbiguityLocalReviewHtml
} = require('../src/openFinance/openFinanceHistoricalAmbiguityReview');

const SECRET = 'historical-local-review-secret-2026-strong';
const REVIEWER = 'daniel-local-review';

function ref(kind, value) {
    return crypto.createHmac('sha256', SECRET)
        .update(`${kind}:${value}`).digest('hex').slice(0, 32);
}

function fixture() {
    const alias = 'family_source';
    const creditId = 'credit-private-id';
    const bankId = 'bank-private-id';
    const basis = ['Compra A', '2025-07-10', 5000, 3].join(':');
    return {
        items: [{
            alias_code: alias,
            accounts: [{ id: creditId, type: 'CREDIT' }, { id: bankId, type: 'BANK' }],
            transactions: [
                { id: 'parcel-a', account_id: creditId, description: 'Compra A',
                    original_date: '2025-07-10', date: '2025-08-10', amount_cents: 5000,
                    installment_number: 2, total_installments: 3 },
                { id: 'parcel-b', account_id: creditId, description: 'Compra A',
                    original_date: '2025-07-10', date: '2025-08-11', amount_cents: 5000,
                    installment_number: 2, total_installments: 3 },
                { id: 'invest-a', account_id: bankId, description: 'Reserva antiga',
                    date: '2025-08-12', amount_cents: -2000, operation_type: 'INVESTIMENTO' },
                { id: 'invest-b', account_id: bankId, description: 'Reserva diferente',
                    date: '2025-09-15', amount_cents: -7350, operation_type: 'INVESTIMENTO' },
                { id: 'invest-c', account_id: bankId, description: 'Mesmo texto nao basta',
                    date: '2025-10-20', amount_cents: 7350, operation_type: 'INVESTIMENTO' }
            ]
        }],
        historicalRx: {
            financial_writes: 0,
            history_start_date: '2025-07-01',
            blockers: [`${alias}:installment_series_ambiguous`,
                `${alias}:investment_movement_semantics_ambiguous`],
            segments: [
                { source_alias: alias,
                    segment_ref: ref('historical_rx_segment', `${alias}:${creditId}`),
                    installments: { series: [{
                        series_ref: ref('historical_rx_installment', `${alias}:${creditId}:${basis}`),
                        duplicate_numbers: [2],
                        identity_status: 'ambiguous_duplicate_installment_number'
                    }] }, investment_movements: { semantically_ambiguous_count: 0 } },
                { source_alias: alias,
                    segment_ref: ref('historical_rx_segment', `${alias}:${bankId}`),
                    installments: { series: [] },
                    investment_movements: { semantically_ambiguous_count: 3 } }
            ]
        }
    };
}

function build() {
    return buildOpenFinanceHistoricalAmbiguityReview({
        ...fixture(), secret: SECRET, familyScope: 'family',
        reviewChannel: 'local_private', authorizedLocalReviewerIds: [REVIEWER],
        clock: () => new Date()
    });
}

test('renders a private local review without requiring WhatsApp actors', () => {
    const built = build();
    assert.equal(built.pending_count, 4);
    assert.doesNotMatch(JSON.stringify(built), /Reserva antiga|credit-private-id/);

    const view = buildOpenFinanceHistoricalAmbiguityLocalReviewView({
        sealedState: built.sealed_state, secret: SECRET, localReviewerId: REVIEWER,
        clock: () => new Date('2026-08-09T15:01:00.000Z')
    });
    assert.equal(view.review_channel, 'local_private');
    assert.equal(view.pending_count, 4);
    const collective = view.groups.find(group => group.item_count === 2);
    assert.ok(collective);
    assert.equal(collective.equivalence_basis.direction, 'debit');
    assert.equal(collective.equivalence_basis.operation_type, 'INVESTIMENTO');
    assert.deepStrictEqual(collective.collective_resolution_codes,
        ['not_investment_movement', 'reserve_application']);
    assert.match(JSON.stringify(collective), /Reserva antiga|Reserva diferente/);

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-local-review-'));
    const outputPath = path.join(directory, 'review.html');
    try {
        const written = writeOpenFinanceHistoricalAmbiguityLocalReviewHtml({
            sealedState: built.sealed_state, secret: SECRET, localReviewerId: REVIEWER,
            outputPath, clock: () => new Date('2026-08-09T15:01:00.000Z')
        });
        assert.equal(written.output_path, path.resolve(outputPath));
        assert.equal(written.financial_writes, 0);
        const html = fs.readFileSync(outputPath, 'utf8');
        assert.match(html, /Reserva antiga/);
        assert.match(html, /2 ocorrencias equivalentes/);
        assert.doesNotMatch(html, /https?:\/\/|<script/i);
        if (process.platform !== 'win32') {
            assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600);
        }
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('applies one decision only to the exact confirmed equivalence set', () => {
    const built = build();
    const view = buildOpenFinanceHistoricalAmbiguityLocalReviewView({
        sealedState: built.sealed_state, secret: SECRET, localReviewerId: REVIEWER
    });
    const collective = view.groups.find(group => group.item_count === 2);
    assert.throws(() => applyOpenFinanceHistoricalAmbiguityLocalDecision({
        sealedState: built.sealed_state, secret: SECRET, localReviewerId: REVIEWER,
        groupRef: collective.group_ref, scope: 'equivalent',
        expectedItemRefs: collective.item_refs.slice(0, 1),
        resolutionCode: 'reserve_application'
    }), /equivalence_set_mismatch/);
    assert.throws(() => applyOpenFinanceHistoricalAmbiguityLocalDecision({
        sealedState: built.sealed_state, secret: SECRET, localReviewerId: REVIEWER,
        groupRef: collective.group_ref, scope: 'equivalent',
        expectedItemRefs: [...collective.item_refs, collective.item_refs[0]],
        resolutionCode: 'reserve_application'
    }), /equivalence_set_mismatch/);

    const applied = applyOpenFinanceHistoricalAmbiguityLocalDecision({
        sealedState: built.sealed_state, secret: SECRET, localReviewerId: REVIEWER,
        groupRef: collective.group_ref, scope: 'equivalent',
        expectedItemRefs: collective.item_refs,
        resolutionCode: 'reserve_application'
    });
    assert.equal(applied.applied_count, 2);
    assert.equal(applied.pending_count, 2);
    assert.equal(applied.financial_writes, 0);

    const reopened = buildOpenFinanceHistoricalAmbiguityLocalReviewView({
        sealedState: applied.sealed_state, secret: SECRET, localReviewerId: REVIEWER
    });
    assert.equal(reopened.pending_count, 2);
    assert.equal(reopened.decided_count, 2);
    assert.equal(reopened.groups.some(group => group.group_ref === collective.group_ref), false);
});

test('completes the local review and feeds the existing read-only resolution plan', () => {
    const input = fixture();
    const built = buildOpenFinanceHistoricalAmbiguityReview({
        ...input, secret: SECRET, familyScope: 'family',
        reviewChannel: 'local_private', authorizedLocalReviewerIds: [REVIEWER]
    });
    const initial = buildOpenFinanceHistoricalAmbiguityLocalReviewView({
        sealedState: built.sealed_state, secret: SECRET, localReviewerId: REVIEWER
    });
    const negative = initial.groups.find(group => group.item_count === 2);
    const positive = initial.groups.find(group => group.type === 'investment_semantics'
        && group.equivalence_basis.direction === 'credit');
    const installment = initial.groups.find(group => group.type === 'installment_identity');

    const first = applyOpenFinanceHistoricalAmbiguityLocalDecision({
        sealedState: built.sealed_state, secret: SECRET, localReviewerId: REVIEWER,
        groupRef: negative.group_ref, scope: 'equivalent',
        expectedItemRefs: negative.item_refs, resolutionCode: 'reserve_application'
    });
    const second = applyOpenFinanceHistoricalAmbiguityLocalDecision({
        sealedState: first.sealed_state, secret: SECRET, localReviewerId: REVIEWER,
        groupRef: positive.group_ref, itemRef: positive.item_refs[0], scope: 'single',
        expectedItemRefs: positive.item_refs, resolutionCode: 'investment_income'
    });
    const final = applyOpenFinanceHistoricalAmbiguityLocalDecision({
        sealedState: second.sealed_state, secret: SECRET, localReviewerId: REVIEWER,
        groupRef: installment.group_ref, itemRef: installment.item_refs[0], scope: 'single',
        expectedItemRefs: installment.item_refs, resolutionCode: 'distinct_rows'
    });
    assert.equal(final.state, 'reviewed');
    assert.equal(final.pending_count, 0);

    const snapshot = readOpenFinanceHistoricalAmbiguityReviewPrivate({
        sealedState: final.sealed_state, secret: SECRET, actorWhatsappId: REVIEWER
    });
    assert.equal(snapshot.decisions.length, 4);
    const plan = buildOpenFinanceHistoricalAmbiguityResolutionPlan({
        ...input, resolutionSnapshot: snapshot, secret: SECRET, familyScope: 'family'
    });
    assert.equal(plan.applied_decisions, 4);
    assert.equal(plan.resolved_installment_items, 1);
    assert.equal(plan.resolved_investment_items, 3);
    assert.equal(plan.financial_writes, 0);
});

test('does not generalize keep-only installment choices across occurrences', () => {
    const built = build();
    const view = buildOpenFinanceHistoricalAmbiguityLocalReviewView({
        sealedState: built.sealed_state, secret: SECRET, localReviewerId: REVIEWER
    });
    const installment = view.groups.find(group => group.type === 'installment_identity');
    const keepOnly = installment.items[0].choices.find(choice => choice.code.startsWith('keep_only:'));
    assert.throws(() => applyOpenFinanceHistoricalAmbiguityLocalDecision({
        sealedState: built.sealed_state, secret: SECRET, localReviewerId: REVIEWER,
        groupRef: installment.group_ref, scope: 'equivalent',
        expectedItemRefs: installment.item_refs,
        resolutionCode: keepOnly.code
    }), /collective_resolution_not_allowed/);
});

test('persists the exact collective decision across restart with encrypted storage', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-local-store-'));
    const databasePath = path.join(directory, 'review.sqlite');
    try {
        const built = build();
        let store = new OpenFinanceHistoricalAmbiguityReviewStore({
            databasePath, secret: SECRET, familyScope: 'family',
            reviewChannel: 'local_private', authorizedLocalReviewerIds: [REVIEWER]
        });
        store.prepare({ sealedState: built.sealed_state });
        const view = store.readLocalView({ localReviewerId: REVIEWER });
        const collective = view.groups.find(group => group.item_count === 2);
        const applied = store.applyLocalDecision({
            localReviewerId: REVIEWER, groupRef: collective.group_ref,
            scope: 'equivalent', expectedItemRefs: collective.item_refs,
            resolutionCode: 'reserve_application'
        });
        assert.equal(applied.applied_count, 2);
        store.close();

        store = new OpenFinanceHistoricalAmbiguityReviewStore({
            databasePath, secret: SECRET, familyScope: 'family',
            reviewChannel: 'local_private', authorizedLocalReviewerIds: [REVIEWER]
        });
        const reopened = store.readLocalView({ localReviewerId: REVIEWER });
        assert.equal(reopened.decided_count, 2);
        assert.equal(reopened.pending_count, 2);
        store.close();

        const bytes = fs.readFileSync(databasePath).toString('latin1');
        assert.doesNotMatch(bytes, /Reserva antiga|Reserva diferente|daniel-local-review/);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
});
