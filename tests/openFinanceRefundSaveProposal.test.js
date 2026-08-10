const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    buildReviewedRefundSaveProposal
} = require('../src/openFinance/openFinanceReviewedRefundSaveProposal');
const {
    revalidateOpenFinanceSaveProposal,
    buildOpenFinanceFinalizationWritePlan
} = require('../src/openFinance/openFinanceSaveProposalFinalization');
const {
    OpenFinanceSaveProposalReviewStore
} = require('../src/openFinance/openFinanceSaveProposalReviewStore');
const {
    OpenFinanceShadowPreviewStore
} = require('../src/openFinance/openFinanceShadowPreviewStore');
const {
    reconcileOpenFinanceRuntimeCandidates,
    observationRef
} = require('../src/openFinance/openFinanceRuntimeReconciliation');
const {
    buildCanonicalLedgerReceiptProjection,
    resolveCanonicalRefundOriginal,
    __test__: canonicalReceiptTest
} = require('../src/ledger/canonicalLedgerReceiptProjector');
const {
    CanonicalLedgerShadowStore
} = require('../src/ledger/canonicalLedgerShadowStore');
const { __test__: googleTest } = require('../src/services/google');

const secret = 'refund-save-proposal-secret-123456789';

function providerFixture() {
    const purchase = {
        id: 'purchase-1', account_id: 'credit-1', amount_cents: 5590,
        description: 'Mercado Central', date: '2026-08-08T12:00:00.000Z',
        status: 'POSTED'
    };
    const refund = {
        id: 'refund-1', account_id: 'credit-1', amount_cents: -5590,
        description: 'Estorno Mercado Central', date: '2026-08-09T12:00:00.000Z',
        status: 'POSTED'
    };
    const item = {
        id: 'item-daniel', alias_code: 'daniel_nubank', generation: 1,
        accounts: [{ id: 'credit-1', type: 'CREDIT' }],
        transactions: [purchase, refund], bills: [], investments: []
    };
    return { purchase, refund, item };
}

function internalCard() {
    return {
        id: 'cartao:original-row', user_id: 'user-daniel', source_type: 'cartao',
        date: '08/08/2026', description: 'Mercado Central', amountCents: 5590,
        direction: 'debit', category: 'Alimenta\u00e7\u00e3o', subcategory: '',
        card_id: 'nubank-daniel', card_name: 'Nubank Daniel',
        reconciliation_scope: 'verified'
    };
}

function reviewFixture() {
    const { item, purchase, refund } = providerFixture();
    return {
        review_ref: 'a'.repeat(32),
        observation_ref: observationRef(secret, item.id, refund.account_id, refund.id),
        pair_observation_ref: observationRef(
            secret, item.id, purchase.account_id, purchase.id
        ),
        alias_ref: 'b'.repeat(32), generation: 1, principal: 'daniel',
        classification: 'refund', review_kind: 'refund_link',
        review_status: 'pair_confirmation_required', review_state: 'decided',
        decision: 'confirm_pair', source: refund, pair_source: purchase,
        expires_at: '2099-01-01T00:00:00.000Z'
    };
}

function reconciliationFixture() {
    const { item } = providerFixture();
    const review = reviewFixture();
    const result = reconcileOpenFinanceRuntimeCandidates({
        items: [item],
        candidates: [review.observation_ref, review.pair_observation_ref].map(
            observation_ref => ({ observation_ref, correlation_state: 'new_event' })
        ),
        internalTransactions: [internalCard()],
        scopeCoverage: { daniel_nubank: { card: true, account: true } },
        secret,
        previewDatabasePath: null
    });
    return {
        refundDecision: result.decisions.find(value =>
            value.observation_ref === review.observation_ref),
        pairDecision: result.decisions.find(value =>
            value.observation_ref === review.pair_observation_ref)
    };
}

function canonicalOriginal(overrides = {}) {
    return {
        resolved: true,
        related_event_id: `evt_${'c'.repeat(24)}`,
        related_source_row_ref: 'Cart\u00e3o Nubank Daniel!A2:G2',
        original_amount_cents: 5590,
        category: 'Alimenta\u00e7\u00e3o', subcategory: '',
        owner_person_id: 'user-daniel',
        source_type: 'sheet.lancamentos_cartao',
        financial_writes: 0,
        ...overrides
    };
}

function proposalFixture() {
    const { purchase, refund } = providerFixture();
    const decisions = reconciliationFixture();
    return buildReviewedRefundSaveProposal({
        review: reviewFixture(),
        currentSource: {
            alias: 'daniel_nubank', alias_ref: 'b'.repeat(32), generation: 1,
            account_type: 'CREDIT', purchase, refund
        },
        ...decisions,
        internalTransaction: internalCard(),
        canonicalOriginal: canonicalOriginal(),
        secret
    });
}

test('38.3 builds only a confirmed strongly linked card refund proposal', () => {
    const proposal = proposalFixture();
    assert.equal(proposal.classification, 'refund');
    assert.equal(proposal.reconciliation_status, 'new');
    assert.equal(proposal.pair_reconciliation_status, 'matched');
    assert.deepEqual(proposal.linked_target, {
        kind: 'card', user_id: 'user-daniel', category: 'Alimenta\u00e7\u00e3o',
        subcategory: '', card_id: 'nubank-daniel', card_name: 'Nubank Daniel',
        related_event_id: `evt_${'c'.repeat(24)}`,
        related_source_row_ref: 'Cart\u00e3o Nubank Daniel!A2:G2',
        original_amount_cents: 5590
    });
    assert.match(proposal.proposal_ref, /^[a-f0-9]{32}$/);
    assert.match(proposal.operation_key, /^[a-f0-9]{48}$/);
    assert.equal(proposal.financial_writes, 0);
});

test('38.3 fails closed for unconfirmed, weak, changed or unavailable originals', () => {
    const build = ({ review = {}, pairDecision = {}, canonical = {} } = {}) => {
        const { purchase, refund } = providerFixture();
        const decisions = reconciliationFixture();
        return buildReviewedRefundSaveProposal({
            review: { ...reviewFixture(), ...review },
            currentSource: {
                alias: 'daniel_nubank', alias_ref: 'b'.repeat(32), generation: 1,
                account_type: 'CREDIT', purchase, refund
            },
            refundDecision: decisions.refundDecision,
            pairDecision: { ...decisions.pairDecision, ...pairDecision },
            internalTransaction: internalCard(),
            canonicalOriginal: { ...canonicalOriginal(), ...canonical },
            secret
        });
    };
    assert.throws(() => build({ review: { decision: 'reject_pair' } }),
        /review_not_approved/);
    assert.throws(() => build({ pairDecision: { confidence_band: 'medium' } }),
        /pair_not_strong/);
    assert.throws(() => build({ canonical: { resolved: false } }),
        /original_unavailable/);
    assert.throws(() => build({ canonical: { source_type: 'sheet.saidas' } }),
        /target_invalid/);
});

test('38.3 revalidates the pair into one negative append on the same card', () => {
    const proposal = proposalFixture();
    const { item } = providerFixture();
    const draft = {
        person: { id: 'user-daniel', label: 'Daniel' },
        category: {
            id: 'category:alimentacao', label: 'Alimenta\u00e7\u00e3o',
            category: 'Alimenta\u00e7\u00e3o', subcategory: ''
        },
        paymentMethod: { id: 'credit', label: 'Cr\u00e9dito', value: 'Cr\u00e9dito' },
        financialAccount: null,
        card: {
            id: 'card:nubank-daniel', label: 'Nubank Daniel',
            cardId: 'nubank-daniel', closingDay: 25
        }
    };
    const catalog = {
        people: [draft.person], categories: [draft.category],
        paymentMethods: [draft.paymentMethod], financialAccounts: [],
        cards: [draft.card]
    };
    const result = revalidateOpenFinanceSaveProposal({
        proposal,
        review: {
            proposal_ref: proposal.proposal_ref, state: 'ready',
            payload: { draft }
        },
        semanticReview: reviewFixture(),
        canonicalOriginal: canonicalOriginal(),
        item,
        internalSource: {
            available: true, transactions: [internalCard()],
            scope_coverage: { daniel_nubank: { card: true, account: true } }
        },
        catalog,
        secret
    });
    assert.equal(result.writePlan.operation, 'refund.create');
    assert.equal(result.writePlan.sheetName, 'Cart\u00e3o Nubank Daniel');
    assert.equal(result.writePlan.cardId, 'nubank-daniel');
    assert.equal(result.writePlan.row[3], -55.9);
    assert.equal(result.writePlan.row[6], 'user-daniel');
    assert.deepEqual(result.writePlan.canonicalRelation, {
        type: 'refund_pair', related_event_id: `evt_${'c'.repeat(24)}`,
        related_source_row_ref: 'Cart\u00e3o Nubank Daniel!A2:G2',
        original_amount_cents: 5590, category: 'Alimenta\u00e7\u00e3o', subcategory: '',
        owner_person_id: 'user-daniel',
        original_source_type: 'sheet.lancamentos_cartao'
    });
    assert.equal(result.financial_writes, 0);
});

test('38.3 canonical receipt keeps the external pair and reduces expense impact', () => {
    const projection = buildCanonicalLedgerReceiptProjection({
        sheetName: 'Cart\u00e3o Nubank Daniel',
        row: ['09/08/2026', 'Estorno Mercado Central', 'Alimenta\u00e7\u00e3o', -55.9,
            '1/1', 'Agosto de 2026', 'user-daniel'],
        operationKey: 'refund-operation-1',
        receipt: { updatedRange: 'Cart\u00e3o Nubank Daniel!A20:G20' },
        canonicalRelation: {
            type: 'refund_pair', related_event_id: `evt_${'d'.repeat(24)}`,
            related_source_row_ref: 'Cart\u00e3o Nubank Daniel!A2:G2',
            original_amount_cents: 5590, category: 'Alimenta\u00e7\u00e3o', subcategory: '',
            owner_person_id: 'user-daniel',
            original_source_type: 'sheet.lancamentos_cartao'
        },
        committedAt: '2026-08-09T14:00:00.000Z'
    });
    const event = projection.projected.events[0];
    assert.equal(event.kind, 'chargeback');
    assert.equal(event.status, 'settled');
    assert.equal(event.amount_cents, 5590);
    assert.equal(event.net_income_expense_impact, -5590);
    assert.equal(event.free_budget_eligible, false);
    assert.ok(projection.projected.reconciliationLinks.some(link =>
        link.event_id === event.event_id && link.link_type === 'refund_pair' &&
        link.related_event_id === `evt_${'d'.repeat(24)}`));
});

test('38.3 persists and recovers the original row identity in both supported sinks', () => {
    const relatedSourceRowRef = 'Cart\u00e3o Nubank Daniel!A2:G2';
    const canonicalRelation = { related_source_row_ref: relatedSourceRowRef };
    const cardRow = googleTest.mapRowForUserSpreadsheet(
        'Cart\u00e3o Nubank Daniel',
        ['09/08/2026', 'Estorno Mercado Central', 'Alimenta\u00e7\u00e3o', -55.9,
            '1/1', 'Agosto de 2026', 'user-daniel'],
        { cardId: 'nubank-daniel', canonicalRelation }
    );
    assert.equal(canonicalReceiptTest.refundRelationSourceRowRef(cardRow[8]),
        relatedSourceRowRef);

    const bankPlan = buildOpenFinanceFinalizationWritePlan({
        proposal: {
            classification: 'refund',
            source: {
                date: '2026-08-09T15:00:00.000Z',
                description: 'Reembolso Uber', amount_cents: 1199
            },
            linked_target: {
                kind: 'bank', user_id: 'user-thais', category: 'Transporte',
                subcategory: 'Aplicativo', financial_account: 'Nubank Thais',
                related_event_id: `evt_${'e'.repeat(24)}`,
                related_source_row_ref: relatedSourceRowRef,
                original_amount_cents: 1199
            }
        },
        draft: {
            person: { id: 'user-thais', label: 'Tha\u00eds' },
            category: { id: 'income:reembolso', label: 'Reembolso' },
            paymentMethod: {
                id: 'receipt:checking', label: 'Conta Corrente', value: 'Conta Corrente'
            },
            financialAccount: {
                id: 'account:thais:nubank', label: 'Nubank Thais \u00b7 Tha\u00eds',
                ownerUserId: 'user-thais'
            },
            card: null
        }
    });
    assert.equal(canonicalReceiptTest.refundRelationSourceRowRef(bankPlan.row[7]),
        relatedSourceRowRef);
});

test('38.3 resolves one exact canonical original and rejects ambiguity', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-refund-ledger-'));
    const dbPath = path.join(directory, 'canonical.sqlite');
    const store = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    const makeProjection = operationKey => buildCanonicalLedgerReceiptProjection({
        sheetName: 'Cart\u00e3o Nubank Daniel',
        row: ['08/08/2026', 'Mercado Central', 'Alimenta\u00e7\u00e3o', 55.9,
            '1/1', 'Agosto de 2026', 'user-daniel'],
        operationKey,
        receipt: { updatedRange: `${operationKey}!A2:G2` },
        committedAt: '2026-08-08T14:00:00.000Z'
    });
    try {
        store.persistProjection(makeProjection('original-operation-1'));
        const resolved = resolveCanonicalRefundOriginal({
            dbPath,
            original: internalCard()
        });
        assert.equal(resolved.resolved, true);
        assert.equal(resolved.original_amount_cents, 5590);
        assert.equal(resolved.category, 'Alimenta\u00e7\u00e3o');

        store.persistProjection(buildCanonicalLedgerReceiptProjection({
            sheetName: 'Cart\u00e3o Nubank Daniel',
            row: ['09/08/2026', 'Estorno Mercado Central', 'Alimenta\u00e7\u00e3o',
                -55.9, '1/1', 'Agosto de 2026', 'user-daniel'],
            operationKey: 'refund-operation-linked',
            receipt: { updatedRange: 'refund-operation-linked!A2:G2' },
            canonicalRelation: {
                type: 'refund_pair',
                related_event_id: resolved.related_event_id,
                related_source_row_ref: resolved.related_source_row_ref,
                original_amount_cents: 5590,
                category: 'Alimenta\u00e7\u00e3o', subcategory: '',
                owner_person_id: 'user-daniel',
                original_source_type: 'sheet.lancamentos_cartao'
            },
            committedAt: '2026-08-09T14:00:00.000Z'
        }));
        const alreadyCompensated = resolveCanonicalRefundOriginal({
            dbPath,
            original: internalCard()
        });
        assert.equal(alreadyCompensated.resolved, false);
        assert.equal(alreadyCompensated.reason,
            'canonical_refund_original_already_compensated');

        store.persistProjection(makeProjection('original-operation-2'));
        const ambiguous = resolveCanonicalRefundOriginal({
            dbPath,
            original: internalCard()
        });
        assert.equal(ambiguous.resolved, false);
        assert.equal(ambiguous.reason, 'canonical_refund_original_ambiguous');
    } finally {
        store.close();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('38.3 keeps a bank reimbursement on the original account and out of genuine income', () => {
    const target = {
        kind: 'bank', user_id: 'user-thais', category: 'Transporte',
        subcategory: 'Aplicativo', financial_account: 'Nubank Thais',
        related_event_id: `evt_${'e'.repeat(24)}`,
        related_source_row_ref: 'Sa\u00eddas!A20:K20', original_amount_cents: 1199
    };
    const plan = buildOpenFinanceFinalizationWritePlan({
        proposal: {
            classification: 'refund',
            source: {
                date: '2026-08-09T15:00:00.000Z',
                description: 'Reembolso Uber', amount_cents: 1199
            },
            linked_target: target
        },
        draft: {
            person: { id: 'user-thais', label: 'Tha\u00eds' },
            category: {
                id: 'income:reembolso', label: 'Reembolso',
                category: 'Reembolso', subcategory: ''
            },
            paymentMethod: {
                id: 'receipt:checking', label: 'Conta Corrente',
                value: 'Conta Corrente'
            },
            financialAccount: {
                id: 'account:thais:nubank', label: 'Nubank Thais \u00b7 Tha\u00eds',
                ownerUserId: 'user-thais'
            },
            card: null
        }
    });
    assert.equal(plan.sheetName, 'Entradas');
    assert.equal(plan.row[2], 'Reembolso');
    assert.equal(plan.row[3], 11.99);
    assert.equal(plan.row[8], 'user-thais');
    assert.equal(plan.row[9], 'Nubank Thais');
    assert.equal(plan.canonicalRelation.category, 'Transporte');
    assert.equal(plan.operation, 'refund.create');
});

test('38.3 guided review exposes only the immutable original person, category and card', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-refund-review-'));
    const databasePath = path.join(directory, 'review.sqlite');
    const actor = '5511999999999@c.us';
    const proposal = proposalFixture();
    const preview = new OpenFinanceShadowPreviewStore({
        databasePath,
        secret,
        authorizedWhatsAppIds: [actor]
    });
    preview.close();
    const store = new OpenFinanceSaveProposalReviewStore({
        databasePath,
        secret,
        authorizedWhatsAppIds: [actor]
    });
    try {
        const prepared = store.prepareReview({
            proposalRef: proposal.proposal_ref,
            proposal,
            actorWhatsappId: actor,
            catalog: {
                people: [
                    { id: 'user-daniel', label: 'Daniel' },
                    { id: 'user-thais', label: 'Tha\u00eds' }
                ],
                categories: [
                    { id: 'food', label: 'Alimenta\u00e7\u00e3o',
                        category: 'Alimenta\u00e7\u00e3o', subcategory: '' },
                    { id: 'leisure', label: 'Lazer', category: 'Lazer', subcategory: '' }
                ],
                incomeCategories: [
                    { id: 'refund', label: 'Reembolso',
                        category: 'Reembolso', subcategory: '' }
                ],
                paymentMethods: [
                    { id: 'credit', label: 'Cr\u00e9dito', value: 'Cr\u00e9dito' },
                    { id: 'pix', label: 'PIX', value: 'PIX' }
                ],
                receiptMethods: [
                    { id: 'checking', label: 'Conta Corrente', value: 'Conta Corrente' }
                ],
                financialAccounts: [],
                cards: [
                    { id: 'daniel-card', label: 'Nubank Daniel',
                        cardId: 'nubank-daniel', closingDay: 25 },
                    { id: 'thais-card', label: 'Nubank Thais',
                        cardId: 'nubank-thais', closingDay: 20 }
                ]
            }
        });
        assert.equal(prepared.payload.linked_target_kind, 'card');
        assert.deepEqual(prepared.payload.catalog.people.map(value => value.id),
            ['user-daniel']);
        assert.deepEqual(prepared.payload.catalog.categories.map(value => value.category),
            ['Alimenta\u00e7\u00e3o']);
        assert.deepEqual(prepared.payload.catalog.cards.map(value => value.cardId),
            ['nubank-daniel']);
        assert.equal(prepared.payload.draft.card.cardId, 'nubank-daniel');
        assert.equal(prepared.financial_writes, 0);
    } finally {
        store.close();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
