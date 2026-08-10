const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    buildReviewedIncomeSaveProposal,
    prepareReviewedIncomeSaveProposal
} = require('../src/openFinance/openFinanceReviewedIncomeSaveProposal');
const {
    revalidateOpenFinanceSaveProposal
} = require('../src/openFinance/openFinanceSaveProposalFinalization');
const {
    classifyOpenFinanceLifecycle
} = require('../src/openFinance/openFinanceLifecycleClassifier');
const {
    OpenFinanceSaveProposalReviewStore
} = require('../src/openFinance/openFinanceSaveProposalReviewStore');
const {
    OpenFinanceShadowPreviewStore
} = require('../src/openFinance/openFinanceShadowPreviewStore');
const {
    OpenFinanceProactiveReviewStore
} = require('../src/openFinance/openFinanceProactiveReviewStore');
const {
    OpenFinanceLiveStagingVault
} = require('../src/openFinance/openFinanceLiveStagingVault');
const {
    OpenFinanceRevocationJournal
} = require('../src/openFinance/openFinanceRevocationJournal');

const secret = 'income-save-proposal-secret-1234567890';

function source(overrides = {}) {
    return {
        id: 'income-transaction-1',
        provider_id: 'provider-income-1',
        account_id: 'checking-1',
        amount_cents: 125000,
        description: 'Pagamento recebido',
        date: '2026-08-10T12:00:00.000Z',
        status: 'POSTED',
        ...overrides
    };
}

function item(overrides = {}) {
    return {
        id: 'item-daniel-nubank',
        alias_code: 'daniel_nubank',
        generation: 1,
        accounts: [{ id: 'checking-1', type: 'CHECKING' }],
        transactions: [source()],
        bills: [],
        investments: [],
        ...overrides
    };
}

const observationRef = classifyOpenFinanceLifecycle({
    items: [item()],
    observedAt: '2026-08-10T12:00:00.000Z',
    secret
}).decisions[0].observation_ref;

function decidedReview(overrides = {}) {
    return {
        review_ref: 'a'.repeat(32),
        observation_ref: observationRef,
        alias_ref: 'c'.repeat(32),
        generation: 1,
        principal: 'daniel',
        classification: 'income_candidate',
        review_kind: 'income',
        review_status: 'classification_required',
        review_state: 'decided',
        decision: 'income',
        source: source(),
        expires_at: '2026-08-11T12:00:00.000Z',
        ...overrides
    };
}

function currentSource(overrides = {}) {
    return {
        alias: 'daniel_nubank',
        alias_ref: 'c'.repeat(32),
        generation: 1,
        account_type: 'CHECKING',
        transaction: source(),
        ...overrides
    };
}

test('38.2 builds a save proposal only from an unchanged decided genuine income', () => {
    const proposal = buildReviewedIncomeSaveProposal({
        review: decidedReview(),
        currentSource: currentSource(),
        reconciliationDecision: {
            status: 'new',
            transaction_ref: 'd'.repeat(32)
        },
        secret
    });

    assert.equal(proposal.classification, 'income');
    assert.equal(proposal.source_classification, 'income_candidate');
    assert.equal(proposal.provider_state, 'POSTED');
    assert.equal(proposal.reconciliation_status, 'new');
    assert.equal(proposal.semantic_review_ref, 'a'.repeat(32));
    assert.equal(proposal.source.amount_cents, 125000);
    assert.match(proposal.proposal_ref, /^[a-f0-9]{32}$/);
    assert.match(proposal.operation_key, /^[a-f0-9]{48}$/);
    assert.equal(proposal.financial_writes, 0);
});

test('38.2 fails closed for undecided, non-income, changed or reconciled sources', () => {
    const build = (overrides = {}) => buildReviewedIncomeSaveProposal({
        review: decidedReview(overrides.review),
        currentSource: currentSource(overrides.currentSource),
        reconciliationDecision: {
            status: 'new',
            transaction_ref: 'd'.repeat(32),
            ...overrides.reconciliationDecision
        },
        secret
    });

    assert.throws(() => build({ review: { review_state: 'pending', decision: null } }),
        /review_not_approved/);
    assert.throws(() => build({ review: { decision: 'transfer' } }),
        /review_not_approved/);
    assert.throws(() => build({ currentSource: {
        transaction: source({ amount_cents: 124999 })
    } }), /source_changed/);
    assert.throws(() => build({ reconciliationDecision: { status: 'matched' } }),
        /not_new/);
});

test('38.2 revalidates reviewed income into one Entradas write plan', () => {
    const proposal = buildReviewedIncomeSaveProposal({
        review: decidedReview(),
        currentSource: currentSource(),
        reconciliationDecision: {
            status: 'new',
            transaction_ref: 'd'.repeat(32)
        },
        secret
    });
    const review = {
        proposal_ref: proposal.proposal_ref,
        state: 'ready',
        payload: {
            draft: {
                person: { id: 'user-daniel', label: 'Daniel' },
                category: {
                    id: 'income-category:salario',
                    label: 'Salario',
                    category: 'Salario',
                    subcategory: ''
                },
                paymentMethod: {
                    id: 'receipt:checking',
                    label: 'Conta Corrente',
                    value: 'Conta Corrente'
                },
                financialAccount: {
                    id: 'account:user-daniel:nubank',
                    label: 'Nubank Daniel',
                    ownerUserId: 'user-daniel'
                },
                card: null
            }
        }
    };
    const catalog = {
        people: [review.payload.draft.person],
        categories: [review.payload.draft.category],
        paymentMethods: [review.payload.draft.paymentMethod],
        financialAccounts: [review.payload.draft.financialAccount],
        cards: []
    };
    const result = revalidateOpenFinanceSaveProposal({
        proposal,
        review,
        semanticReview: decidedReview(),
        item: item(),
        internalSource: {
            available: true,
            transactions: [],
            scope_coverage: { complete: true }
        },
        catalog,
        secret
    });

    assert.equal(result.writePlan.operation, 'income.create');
    assert.equal(result.writePlan.sheetName, 'Entradas');
    assert.equal(result.writePlan.row[3], 1250);
    assert.equal(result.writePlan.row[8], 'user-daniel');
    assert.equal(result.writePlan.row[9], 'Nubank Daniel');
    assert.equal(result.financial_writes, 0);
});

test('38.2 final revalidation rejects changed semantic review, source and income catalog', () => {
    const proposal = buildReviewedIncomeSaveProposal({
        review: decidedReview(),
        currentSource: currentSource(),
        reconciliationDecision: {
            status: 'new',
            transaction_ref: 'd'.repeat(32)
        },
        secret
    });
    const draft = {
        person: { id: 'user-daniel', label: 'Daniel' },
        category: {
            id: 'category:salario', label: 'Salario',
            category: 'Salario', subcategory: ''
        },
        paymentMethod: {
            id: 'receipt:checking', label: 'Conta Corrente', value: 'Conta Corrente'
        },
        financialAccount: {
            id: 'account:user-daniel:nubank', label: 'Nubank Daniel',
            ownerUserId: 'user-daniel'
        },
        card: null
    };
    const review = {
        proposal_ref: proposal.proposal_ref,
        state: 'ready',
        payload: { draft }
    };
    const catalog = {
        people: [draft.person],
        categories: [],
        incomeCategories: [draft.category],
        paymentMethods: [],
        receiptMethods: [draft.paymentMethod],
        financialAccounts: [draft.financialAccount],
        cards: []
    };
    const baseline = {
        proposal,
        review,
        semanticReview: decidedReview(),
        item: item(),
        internalSource: {
            available: true,
            transactions: [],
            scope_coverage: { complete: true }
        },
        catalog,
        secret
    };

    assert.throws(() => revalidateOpenFinanceSaveProposal({
        ...baseline,
        semanticReview: decidedReview({ decision: 'transfer' })
    }), /income_review_changed/);
    assert.throws(() => revalidateOpenFinanceSaveProposal({
        ...baseline,
        item: item({ transactions: [source({ amount_cents: 125001 })] })
    }), /source_changed/);
    assert.throws(() => revalidateOpenFinanceSaveProposal({
        ...baseline,
        catalog: { ...catalog, incomeCategories: [] }
    }), /catalog_changed/);
    assert.throws(() => revalidateOpenFinanceSaveProposal({
        ...baseline,
        review: {
            ...review,
            payload: { draft: { ...draft, card: { id: 'forbidden' } } }
        }
    }), /payment_method_forbidden/);
});

test('38.2 guided review uses only income categories, receipt methods and accounts', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-income-review-'));
    const databasePath = path.join(directory, 'review.sqlite');
    const actor = '5511999999999@c.us';
    const proposal = buildReviewedIncomeSaveProposal({
        review: decidedReview(),
        currentSource: currentSource(),
        reconciliationDecision: {
            status: 'new',
            transaction_ref: 'd'.repeat(32)
        },
        secret
    });
    const preview = new OpenFinanceShadowPreviewStore({
        databasePath,
        secret,
        authorizedWhatsAppIds: [actor]
    });
    preview.close();
    const store = new OpenFinanceSaveProposalReviewStore({
        databasePath,
        secret,
        authorizedWhatsAppIds: [actor],
        clock: () => new Date('2026-08-10T13:00:00.000Z')
    });
    try {
        const prepared = store.prepareReview({
            proposalRef: proposal.proposal_ref,
            proposal,
            actorWhatsappId: actor,
            catalog: {
                people: [{ id: 'user-daniel', label: 'Daniel' }],
                categories: [{
                    id: 'expense:food', label: 'Alimentação',
                    category: 'Alimentação', subcategory: ''
                }],
                incomeCategories: [{
                    id: 'income:salary', label: 'Salário',
                    category: 'Salário', subcategory: ''
                }],
                paymentMethods: [{ id: 'credit', label: 'Crédito', value: 'Crédito' }],
                receiptMethods: [{
                    id: 'receipt:checking', label: 'Conta Corrente', value: 'Conta Corrente'
                }],
                financialAccounts: [{
                    id: 'account:daniel', label: 'Nubank Daniel', ownerUserId: 'user-daniel'
                }],
                cards: [{
                    id: 'card:daniel', label: 'Nubank Daniel',
                    cardId: 'card-daniel', closingDay: 20
                }]
            }
        });
        assert.equal(prepared.payload.classification, 'income');
        assert.deepEqual(prepared.payload.catalog.categories.map(value => value.label),
            ['Salário']);
        assert.deepEqual(prepared.payload.catalog.paymentMethods.map(value => value.value),
            ['Conta Corrente']);
        assert.deepEqual(prepared.payload.catalog.cards, []);
        assert.equal(prepared.payload.draft.paymentMethod.value, 'Conta Corrente');
        assert.equal(prepared.payload.draft.financialAccount, null);
        assert.equal(prepared.financial_writes, 0);
    } finally {
        store.close();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('38.2 promotes one decided income into one actor-bound durable proposal', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-income-promotion-'));
    const paths = {
        secret: path.join(directory, 'secret.txt'),
        mapping: path.join(directory, 'mapping.json'),
        staging: path.join(directory, 'staging.sqlite'),
        preview: path.join(directory, 'preview.sqlite'),
        journal: path.join(directory, 'journal.sqlite'),
        outbox: path.join(directory, 'outbox.sqlite')
    };
    const actor = '5511999999999@c.us';
    const liveItem = item();
    fs.writeFileSync(paths.secret, secret, { mode: 0o600 });
    fs.writeFileSync(paths.mapping, JSON.stringify([{
        itemId: liveItem.id,
        alias: liveItem.alias_code,
        ownerScope: 'daniel',
        generation: 1
    }]));
    fs.writeFileSync(paths.outbox, '');
    const vault = new OpenFinanceLiveStagingVault({
        databasePath: paths.staging,
        secret
    });
    vault.ingestSnapshot({
        provider: 'pluggy',
        mode: 'live_readonly_staging',
        event_id: 'income-promotion-event',
        observed_at: '2026-08-10T12:00:00.000Z',
        collection_health: { complete: true, warning_count: 0 },
        items: [liveItem]
    });
    vault.close();
    const journal = new OpenFinanceRevocationJournal({
        databasePath: paths.journal,
        secret
    });
    journal.close();
    const proactive = new OpenFinanceProactiveReviewStore({
        databasePath: paths.preview,
        secret,
        clock: () => new Date('2026-08-10T12:01:00.000Z')
    });
    const ingested = proactive.ingest({
        reviews: [{
            observation_ref: observationRef,
            source_alias: 'daniel_nubank',
            generation: 1,
            classification: 'income_candidate',
            review_kind: 'income',
            review_status: 'classification_required',
            save_eligible: false
        }],
        items: [liveItem],
        policies: [{
            alias: 'daniel_nubank',
            principal: 'daniel',
            recipients: ['daniel']
        }],
        confirmationActors: [{ principal: 'daniel', whatsappId: actor }],
        observedAt: '2026-08-10T12:00:00.000Z'
    });
    const reviewCode = ingested.links[0].review_code;
    proactive.decideByCode(reviewCode, 'income', { actorWhatsappId: actor });
    proactive.close();
    const env = {
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_WRITE_MODE: 'off',
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: paths.secret,
        OPEN_FINANCE_LIVE_STAGING_DB: paths.staging,
        OPEN_FINANCE_SHADOW_PREVIEW_DB: paths.preview,
        OPEN_FINANCE_REVOCATION_JOURNAL_DB: paths.journal,
        OPEN_FINANCE_OUTBOX_DB: paths.outbox,
        PLUGGY_ITEM_MAP_FILE: paths.mapping
    };
    try {
        const dependencies = {
            getActiveUsers: async () => [{
                user_id: 'user-daniel',
                display_name: 'Daniel',
                whatsapp_id: actor
            }],
            getFinancialScopeUserIds: () => ['user-daniel'],
            readOpenFinanceInternalSource: async () => ({
                available: true,
                transactions: [],
                scope_coverage: { daniel_nubank: { account: true, card: true } },
                financial_writes: 0
            })
        };
        const prepared = await prepareReviewedIncomeSaveProposal({
            reviewCode,
            actorWhatsappId: actor,
            userId: 'user-daniel',
            env,
            dependencies
        });
        assert.equal(prepared.handled, true);
        assert.match(prepared.proposal_ref, /^[a-f0-9]{32}$/);
        assert.match(prepared.reply, /Nenhum lançamento foi salvo ainda/);
        assert.equal(prepared.financial_writes, 0);

        const checkJournal = new OpenFinanceRevocationJournal({
            databasePath: paths.journal,
            secret
        });
        const preview = new OpenFinanceShadowPreviewStore({
            databasePath: paths.preview,
            secret,
            revocationJournal: checkJournal,
            authorizedWhatsAppIds: [actor],
            confirmationActors: [{ principal: 'daniel', whatsappId: actor }]
        });
        try {
            const stored = preview.readSaveProposalPrivate(
                prepared.proposal_ref,
                { actorWhatsappId: actor }
            );
            assert.equal(stored.classification, 'income');
            assert.equal(stored.semantic_review_ref, ingested.links[0].review_ref);
            assert.deepEqual(preview.listReadySaveProposalConfirmations({
                actorWhatsappId: actor,
                limit: 2
            }).map(value => value.proposal_ref), [prepared.proposal_ref]);
        } finally {
            preview.close();
            checkJournal.close();
        }
        const replay = await prepareReviewedIncomeSaveProposal({
            reviewCode,
            actorWhatsappId: actor,
            userId: 'user-daniel',
            env,
            dependencies
        });
        assert.equal(replay.proposal_ref, prepared.proposal_ref);
        assert.equal(replay.financial_writes, 0);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
