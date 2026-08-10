const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const {
    buildReviewedTransferSaveProposal
} = require('../src/openFinance/openFinanceReviewedTransferSaveProposal');
const {
    OpenFinanceShadowPreviewStore
} = require('../src/openFinance/openFinanceShadowPreviewStore');
const {
    classifyOpenFinanceLifecycle
} = require('../src/openFinance/openFinanceLifecycleClassifier');
const {
    analyzeOpenFinanceProactiveReviews
} = require('../src/openFinance/openFinanceProactiveReview');
const {
    revalidateOpenFinanceSaveProposal,
    prepareOpenFinanceSaveProposalFinalization
} = require('../src/openFinance/openFinanceSaveProposalFinalization');
const {
    OpenFinanceSaveProposalReviewStore
} = require('../src/openFinance/openFinanceSaveProposalReviewStore');
const {
    buildCanonicalLedgerReceiptProjection
} = require('../src/ledger/canonicalLedgerReceiptProjector');

const secret = 'transfer-save-proposal-secret-123456789';

function hmac(label) {
    return crypto.createHmac('sha256', secret).update(label).digest('hex').slice(0, 32);
}

function transaction(id, accountId, amountCents) {
    return {
        id,
        account_id: accountId,
        amount_cents: amountCents,
        description: id === 'out' ? 'Pix enviado' : 'Pix recebido',
        date: '2026-08-10T12:00:00.000Z',
        status: 'POSTED',
        reference_number: 'provider-transfer-1'
    };
}

const sourceObservationRef = hmac('source-observation');
const pairObservationRef = hmac('pair-observation');

function leg({ alias, principal, id, accountId, amountCents, observationRef }) {
    return {
        alias,
        generation: 1,
        principal,
        account_type: 'BANK',
        observation_ref: observationRef,
        transaction: transaction(id, accountId, amountCents)
    };
}

function reviewedTransfer(overrides = {}) {
    const source = leg({
        alias: 'daniel_nubank', principal: 'daniel', id: 'out',
        accountId: 'daniel-bank', amountCents: -10,
        observationRef: sourceObservationRef
    });
    const pair = leg({
        alias: 'thais_nubank', principal: 'thais', id: 'in',
        accountId: 'thais-bank', amountCents: 10,
        observationRef: pairObservationRef
    });
    const review = {
        review_ref: 'a'.repeat(32),
        observation_ref: sourceObservationRef,
        pair_observation_ref: pairObservationRef,
        alias_ref: hmac('open-finance-revocation-lineage:daniel_nubank'),
        generation: 1,
        principal: 'daniel',
        review_kind: 'transfer',
        review_status: 'strong_pair_confirmation_required',
        pair_basis: 'shared_provider_reference',
        review_state: 'decided',
        decision: 'confirm_transfer_pair',
        source: source.transaction,
        pair_source: pair.transaction,
        expires_at: '2099-08-11T12:00:00.000Z',
        ...(overrides.review || {})
    };
    return buildReviewedTransferSaveProposal({
        review,
        currentSource: { ...source, ...(overrides.currentSource || {}) },
        currentPair: { ...pair, ...(overrides.currentPair || {}) },
        sourceDecision: {
            status: 'new', transaction_ref: 'b'.repeat(32),
            ...(overrides.sourceDecision || {})
        },
        pairDecision: {
            status: 'new', transaction_ref: 'c'.repeat(32),
            ...(overrides.pairDecision || {})
        },
        strongPairReview: {
            review_kind: 'transfer',
            review_status: 'strong_pair_confirmation_required',
            pair_basis: 'shared_provider_reference',
            observation_ref: sourceObservationRef,
            pair_observation_ref: pairObservationRef,
            ...(overrides.strongPairReview || {})
        },
        secret
    });
}

test('38.4 builds one neutral proposal from an unchanged strong posted pair', () => {
    const proposal = reviewedTransfer();
    assert.equal(proposal.classification, 'transfer');
    assert.equal(proposal.reconciliation_status, 'new');
    assert.equal(proposal.pair_reconciliation_status, 'new');
    assert.equal(proposal.transfer_origin.principal, 'daniel');
    assert.equal(proposal.transfer_destination.principal, 'thais');
    assert.equal(proposal.source.amount_cents, -10);
    assert.equal(proposal.paired_source.amount_cents, 10);
    assert.match(proposal.proposal_ref, /^[a-f0-9]{32}$/);
    assert.match(proposal.operation_key, /^[a-f0-9]{48}$/);
    assert.equal(proposal.financial_writes, 0);
});

test('38.4 fails closed for weak, changed, same-account or already reconciled pairs', () => {
    assert.throws(() => reviewedTransfer({ review: { decision: 'uncertain' } }),
        /review_not_approved/);
    assert.throws(() => reviewedTransfer({
        currentPair: { transaction: transaction('in', 'thais-bank', 11) }
    }), /source_changed/);
    assert.throws(() => reviewedTransfer({
        currentPair: { transaction: transaction('in', 'daniel-bank', 10) }
    }), /source_changed/);
    assert.throws(() => reviewedTransfer({ pairDecision: { status: 'matched' } }),
        /not_new/);
    assert.throws(() => reviewedTransfer({
        strongPairReview: { pair_basis: 'amount_and_date' }
    }), /pair_not_strong/);
});

test('38.4 stores the transfer proposal idempotently and binds both legs', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'of-transfer-proposal-'));
    const databasePath = path.join(directory, 'preview.sqlite');
    const store = new OpenFinanceShadowPreviewStore({
        databasePath,
        secret,
        authorizedWhatsAppIds: ['5511999999999@c.us']
    });
    try {
        const proposal = reviewedTransfer();
        const first = store.ingestReviewedSemanticSaveProposal({ proposal });
        const replay = store.ingestReviewedSemanticSaveProposal({ proposal });
        assert.equal(first.inserted, 1);
        assert.equal(replay.replayed, 1);
        assert.equal(store.readSaveProposalPrivate(proposal.proposal_ref, {
            actorWhatsappId: '5511999999999@c.us'
        }).pair_observation_ref, pairObservationRef);
        assert.equal(first.financial_writes, 0);
    } finally {
        store.close();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

function revalidationFixture() {
    const items = [
        {
            id: 'item-daniel', alias_code: 'daniel_nubank', generation: 1,
            accounts: [{ id: 'daniel-bank', type: 'BANK' }],
            transactions: [transaction('out', 'daniel-bank', -10)]
        },
        {
            id: 'item-thais', alias_code: 'thais_nubank', generation: 1,
            accounts: [{ id: 'thais-bank', type: 'BANK' }],
            transactions: [transaction('in', 'thais-bank', 10)]
        }
    ];
    const lifecycle = classifyOpenFinanceLifecycle({
        items, observedAt: '2026-08-10T12:00:00.000Z', secret
    });
    const decisions = lifecycle.decisions.map(decision => ({
        observation_ref: decision.observation_ref,
        status: 'new',
        transaction_ref: hmac(`transaction:${decision.observation_ref}`)
    }));
    const pair = analyzeOpenFinanceProactiveReviews({
        items,
        lifecycleDecisions: lifecycle.decisions,
        reconciliationDecisions: decisions,
        secret
    }).reviews.find(candidate =>
        candidate.review_status === 'strong_pair_confirmation_required');
    const legByRef = new Map();
    for (const item of items) {
        for (const tx of item.transactions) {
            const ref = lifecycle.decisions.find(candidate =>
                candidate.account_ref === hmac(`account:${tx.account_id}`))?.observation_ref;
            legByRef.set(ref, {
                alias: item.alias_code,
                generation: item.generation,
                principal: item.alias_code.startsWith('daniel') ? 'daniel' : 'thais',
                account_type: 'BANK',
                observation_ref: ref,
                transaction: tx
            });
        }
    }
    const anchor = legByRef.get(pair.observation_ref);
    const counterpart = legByRef.get(pair.pair_observation_ref);
    const semanticReview = {
        review_ref: 'd'.repeat(32),
        observation_ref: pair.observation_ref,
        pair_observation_ref: pair.pair_observation_ref,
        alias_ref: hmac(`open-finance-revocation-lineage:${anchor.alias}`),
        generation: anchor.generation,
        principal: anchor.principal,
        review_kind: 'transfer',
        review_status: 'strong_pair_confirmation_required',
        pair_basis: 'shared_provider_reference',
        review_state: 'decided',
        decision: 'confirm_transfer_pair',
        source: anchor.transaction,
        pair_source: counterpart.transaction,
        expires_at: '2099-08-11T12:00:00.000Z'
    };
    const proposal = buildReviewedTransferSaveProposal({
        review: semanticReview,
        currentSource: anchor,
        currentPair: counterpart,
        sourceDecision: decisions.find(value =>
            value.observation_ref === pair.observation_ref),
        pairDecision: decisions.find(value =>
            value.observation_ref === pair.pair_observation_ref),
        strongPairReview: pair,
        secret
    });
    const originAccount = {
        id: 'account:daniel:nubank', label: 'Nubank Daniel',
        ownerUserId: 'user-daniel'
    };
    const destinationAccount = {
        id: 'account:thais:nubank', label: 'Nubank Thais',
        ownerUserId: 'user-thais'
    };
    return {
        proposal,
        semanticReview,
        item: items.find(value => value.alias_code === proposal.alias),
        pairItem: items.find(value => value.alias_code === proposal.pair_alias),
        review: {
            proposal_ref: proposal.proposal_ref,
            state: 'ready',
            payload: {
                classification: 'transfer',
                transfer_origin_principal: proposal.transfer_origin.principal,
                transfer_destination_principal: proposal.transfer_destination.principal,
                draft: {
                    originAccount,
                    destinationAccount,
                    originOwnerUserId: 'user-daniel',
                    destinationOwnerUserId: 'user-thais'
                }
            }
        },
        catalog: {
            people: [], categories: [], paymentMethods: [], cards: [],
            financialAccounts: [originAccount, destinationAccount]
        }
    };
}

test('38.4 revalidates both current legs into one neutral Transferências row', () => {
    const fixture = revalidationFixture();
    const result = revalidateOpenFinanceSaveProposal({
        ...fixture,
        internalSource: {
            available: true,
            transactions: [],
            scope_coverage: { complete: true }
        },
        secret
    });
    assert.equal(result.writePlan.operation, 'transfer.create');
    assert.equal(result.writePlan.sheetName, 'Transferências');
    assert.equal(result.writePlan.row[2], 0.1);
    assert.equal(result.writePlan.row[3], 'Nubank Daniel');
    assert.equal(result.writePlan.row[4], 'Nubank Thais');
    assert.equal(result.writePlan.userId, 'user-daniel');
    assert.equal(result.revalidation.internal, 'new');
    assert.equal(result.financial_writes, 0);
});

test('38.4 final revalidation rejects a changed pair or inverted account ownership', () => {
    const fixture = revalidationFixture();
    const invoke = overrides => revalidateOpenFinanceSaveProposal({
        ...fixture,
        internalSource: {
            available: true, transactions: [], scope_coverage: { complete: true }
        },
        ...overrides,
        secret
    });
    assert.throws(() => invoke({
        pairItem: {
            ...fixture.pairItem,
            transactions: [transaction('in', 'thais-bank', 11)]
        }
    }), /source_changed/);
    assert.throws(() => invoke({
        review: {
            ...fixture.review,
            payload: {
                ...fixture.review.payload,
                draft: {
                    ...fixture.review.payload.draft,
                    originOwnerUserId: 'user-thais'
                }
            }
        }
    }), /transfer_accounts_changed/);
});

test('38.4 default finalization fails closed when the anchor generation was revoked', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'of-transfer-anchor-revoked-'));
    const proposal = reviewedTransfer();
    const files = {
        secret: path.join(directory, 'secret.txt'),
        staging: path.join(directory, 'staging.sqlite'),
        preview: path.join(directory, 'preview.sqlite'),
        journal: path.join(directory, 'journal.sqlite'),
        mapping: path.join(directory, 'mapping.json')
    };
    fs.writeFileSync(files.secret, secret);
    fs.writeFileSync(files.staging, '');
    fs.writeFileSync(files.preview, '');
    fs.writeFileSync(files.journal, '');
    fs.writeFileSync(files.mapping, JSON.stringify([
        { alias: proposal.alias, generation: proposal.generation },
        { alias: proposal.pair_alias, generation: proposal.pair_generation }
    ]));
    const revokedChecks = [];
    class JournalStub {
        isGenerationRevoked(alias, generation) {
            revokedChecks.push([alias, generation]);
            return alias === proposal.alias && generation === proposal.generation;
        }
        close() {}
    }
    class PreviewStub {
        readSaveProposalDecisionState() {
            return { proposal_state: 'pending', confirmation_state: 'accepted' };
        }
        readReviewableSaveProposal() { return proposal; }
        close() {}
    }
    class ReviewStub {
        readReviewPrivate() {
            return { proposal_ref: proposal.proposal_ref, state: 'ready', payload: {} };
        }
        close() {}
    }
    class ProactiveReviewStub {
        readPrivate() { return { review_ref: proposal.semantic_review_ref }; }
        close() {}
    }
    class VaultStub {
        readItemByAlias(alias) {
            return {
                id: `item-${alias}`,
                alias_code: alias,
                accounts: [],
                transactions: []
            };
        }
        close() {}
    }
    const env = {
        OPEN_FINANCE_ALERT_MODE: 'canary',
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary',
        OPEN_FINANCE_RECONCILIATION_MODE: 'canary',
        OPEN_FINANCE_WRITE_MODE: 'confirm',
        OPEN_FINANCE_WRITE_APPROVED: 'true',
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: files.secret,
        OPEN_FINANCE_LIVE_STAGING_DB: files.staging,
        OPEN_FINANCE_SHADOW_PREVIEW_DB: files.preview,
        OPEN_FINANCE_REVOCATION_JOURNAL_DB: files.journal,
        PLUGGY_ITEM_MAP_FILE: files.mapping
    };
    try {
        await assert.rejects(() => prepareOpenFinanceSaveProposalFinalization({
            proposalRef: proposal.proposal_ref,
            actorWhatsappId: '5511999999999@c.us',
            userId: 'user-daniel',
            env,
            dependencies: {
                secret,
                OpenFinanceRevocationJournal: JournalStub,
                OpenFinanceShadowPreviewStore: PreviewStub,
                OpenFinanceSaveProposalReviewStore: ReviewStub,
                OpenFinanceProactiveReviewStore: ProactiveReviewStub,
                OpenFinanceLiveStagingVault: VaultStub
            }
        }), /save_proposal_revoked_generation/);
        assert.deepEqual(revokedChecks, [[proposal.alias, proposal.generation]]);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('38.4 guided review exposes only authorized origin and destination accounts', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'of-transfer-review-'));
    const databasePath = path.join(directory, 'review.sqlite');
    const fixture = revalidationFixture();
    const preview = new OpenFinanceShadowPreviewStore({
        databasePath,
        secret,
        authorizedWhatsAppIds: ['5511999999999@c.us']
    });
    preview.ingestReviewedSemanticSaveProposal({ proposal: fixture.proposal });
    preview.close();
    const store = new OpenFinanceSaveProposalReviewStore({
        databasePath,
        secret,
        authorizedWhatsAppIds: ['5511999999999@c.us'],
        clock: () => new Date('2026-08-10T13:00:00.000Z')
    });
    try {
        const prepared = store.prepareReview({
            proposalRef: fixture.proposal.proposal_ref,
            proposal: fixture.proposal,
            actorWhatsappId: '5511999999999@c.us',
            catalog: {
                people: [
                    { id: 'user-daniel', label: 'Daniel Santos' },
                    { id: 'user-thais', label: 'Thais Santos' },
                    { id: 'user-third', label: 'Terceiro' }
                ],
                categories: [], incomeCategories: [], paymentMethods: [],
                receiptMethods: [], cards: [],
                financialAccounts: [
                    ...fixture.catalog.financialAccounts,
                    { id: 'account:third', label: 'Conta de terceiro',
                        ownerUserId: 'user-third' }
                ]
            }
        });
        assert.equal(prepared.payload.classification, 'transfer');
        assert.equal(prepared.payload.catalog.people.length, 2);
        assert.equal(prepared.payload.catalog.financialAccounts.length, 2);
        assert.equal(prepared.payload.draft.originOwnerUserId, 'user-daniel');
        assert.equal(prepared.payload.draft.destinationOwnerUserId, 'user-thais');
        assert.equal(prepared.payload.draft.originAccount, null);
        assert.equal(prepared.payload.draft.destinationAccount, null);
    } finally {
        store.close();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('38.4 canonical projection keeps transfer neutral and account owners distinct', () => {
    const fixture = revalidationFixture();
    const validated = revalidateOpenFinanceSaveProposal({
        ...fixture,
        internalSource: {
            available: true, transactions: [], scope_coverage: { complete: true }
        },
        secret
    });
    const projection = buildCanonicalLedgerReceiptProjection({
        sheetName: validated.writePlan.sheetName,
        row: validated.writePlan.row,
        operationKey: validated.operationKey,
        status: 'committed',
        receipt: { updatedRange: 'Transferências!A2:I2' },
        committedAt: '2026-08-10T13:00:00.000Z',
        canonicalRelation: validated.writePlan.canonicalRelation,
        financialAccountRows: [
            ['Nome da Conta', 'Tipo', 'Saldo Inicial', 'Data de Abertura',
                'Status', 'Moeda', 'Responsável', 'user_id', 'Observações'],
            ['Nubank Daniel', 'bank', 0, '2025-01-01', 'ATIVA', 'BRL',
                'Daniel', 'user-daniel', ''],
            ['Nubank Thais', 'bank', 0, '2025-01-01', 'ATIVA', 'BRL',
                'Thais', 'user-thais', '']
        ]
    });
    const event = projection.projected.events[0];
    const cash = projection.projected.lines.find(line => line.line_type === 'cash');
    const clearing = projection.projected.lines.find(line =>
        line.line_type === 'clearing');
    const origin = projection.projected.accounts.find(account =>
        account.owner_person_id === 'user-daniel');
    const destination = projection.projected.accounts.find(account =>
        account.owner_person_id === 'user-thais');
    assert.equal(event.kind, 'transfer');
    assert.equal(event.free_budget_eligible, false);
    assert.equal(event.net_income_expense_impact, 0);
    assert.equal(cash.account_id, origin.account_id);
    assert.equal(clearing.account_id, destination.account_id);
    assert.notEqual(cash.account_id, clearing.account_id);
});
