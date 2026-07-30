const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    OpenFinanceSaveProposalFinalizationStore
} = require('../src/openFinance/openFinanceSaveProposalFinalizationStore');
const {
    OpenFinanceShadowPreviewStore
} = require('../src/openFinance/openFinanceShadowPreviewStore');
const {
    OpenFinanceRevocationJournal
} = require('../src/openFinance/openFinanceRevocationJournal');
const {
    FinancialWriteLedger
} = require('../src/reliability/financialWriteLedger');
const googleService = require('../src/services/google');
const {
    revalidateOpenFinanceSaveProposal,
    executeOpenFinanceSaveProposalFinalization,
    prepareOpenFinanceSaveProposalFinalization,
    handleOpenFinanceSaveProposalFinalizationReply,
    acknowledgeOpenFinanceSaveProposalReceipt
} = require('../src/openFinance/openFinanceSaveProposalFinalization');
const { observationRef } = require('../src/openFinance/openFinanceRuntimeReconciliation');

const secret = 'open-finance-finalization-test-secret';
const actorWhatsappId = 'daniel@c.us';
const proposalRef = 'a'.repeat(32);

function fixture() {
    const transaction = {
        id: 'purchase-final',
        provider_id: 'provider-purchase-final',
        account_id: 'credit-account',
        amount_cents: 2590,
        description: 'Mercado familiar',
        date: '2026-07-30T10:00:00.000Z',
        status: 'POSTED'
    };
    const item = {
        id: 'item-daniel',
        alias_code: 'daniel_nubank',
        generation: 2,
        accounts: [{ id: 'credit-account', type: 'CREDIT' }],
        transactions: [transaction],
        bills: [],
        investments: []
    };
    const draft = {
        person: { id: 'user-daniel', label: 'Daniel' },
        category: {
            id: 'category:alimentacao:mercado',
            label: 'Alimentação / Mercado',
            category: 'Alimentação',
            subcategory: 'Mercado'
        },
        paymentMethod: { id: 'credit', label: 'Crédito', value: 'Crédito' },
        financialAccount: null,
        card: {
            id: 'card:nubank-daniel',
            label: 'Nubank Daniel',
            cardId: 'nubank-daniel',
            closingDay: 25
        }
    };
    const catalog = {
        people: [{ id: 'user-daniel', label: 'Daniel' }],
        categories: [draft.category],
        paymentMethods: [draft.paymentMethod],
        financialAccounts: [],
        cards: [draft.card]
    };
    return {
        proposal: {
            proposal_ref: proposalRef,
            alias: item.alias_code,
            generation: item.generation,
            principal: 'daniel',
            classification: 'purchase',
            provider_state: 'POSTED',
            account_type: 'CREDIT',
            source: transaction,
            observation_ref: observationRef(
                secret,
                item.id,
                transaction.account_id,
                transaction.id
            ),
            reconciliation_status: 'new',
            operation_key: 'b'.repeat(48),
            expires_at: '2026-07-31T12:00:00.000Z'
        },
        review: {
            proposal_ref: proposalRef,
            state: 'ready',
            payload: {
                proposal_ref: proposalRef,
                draft,
                expires_at: '2026-07-31T12:00:00.000Z'
            }
        },
        item,
        catalog,
        internalSource: {
            available: true,
            source_health: 'available',
            transactions: [],
            scope_coverage: {
                daniel_nubank: { card: true, account: true }
            },
            financial_writes: 0
        }
    };
}

test('9P.4 revalidates the current provider, family source and catalog before preparing one write', () => {
    const input = fixture();
    const result = revalidateOpenFinanceSaveProposal({
        ...input,
        secret
    });

    assert.equal(result.status, 'ready');
    assert.match(result.operationKey, /^[a-f0-9]{48}$/);
    assert.equal(result.writePlan.sheetName, 'Cartão Nubank Daniel');
    assert.equal(result.writePlan.cardId, 'nubank-daniel');
    assert.deepEqual(result.writePlan.row.slice(0, 5), [
        '30/07/2026',
        'Mercado familiar',
        'Alimentação',
        25.9,
        '1/1'
    ]);
    assert.equal(result.writePlan.row[6], 'user-daniel');
    assert.equal(result.financial_writes, 0);
});

test('9P.4 writes the selected family member independently of the confirming actor', async () => {
    const cases = [
        {
            actorWhatsappId,
            actorUserId: 'user-daniel',
            selectedPerson: { id: 'user-thais', label: 'Thaís' },
            configure(input) {
                input.review.payload.draft.person = this.selectedPerson;
            },
            expectedSheet: 'Cartão Nubank Daniel',
            expectedUserIdIndex: 6
        },
        {
            actorWhatsappId: 'thais@c.us',
            actorUserId: 'user-thais',
            selectedPerson: { id: 'user-daniel', label: 'Daniel' },
            configure(input) {
                input.review.payload.draft.person = this.selectedPerson;
                input.review.payload.draft.paymentMethod = {
                    id: 'pix',
                    label: 'PIX',
                    value: 'PIX'
                };
                input.review.payload.draft.financialAccount = {
                    id: 'account-thais',
                    label: 'Conta Thaís',
                    ownerUserId: 'user-thais'
                };
                input.review.payload.draft.card = null;
                input.catalog.paymentMethods.push(
                    input.review.payload.draft.paymentMethod
                );
                input.catalog.financialAccounts.push(
                    input.review.payload.draft.financialAccount
                );
            },
            expectedSheet: 'Saídas',
            expectedUserIdIndex: 9
        }
    ];
    const env = {
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_WRITE_MODE: 'confirm'
    };

    for (const scenario of cases) {
        const input = fixture();
        input.catalog.people.push({ id: 'user-thais', label: 'Thaís' });
        scenario.configure(input);
        const store = new OpenFinanceSaveProposalFinalizationStore({
            secret,
            authorizedWhatsAppIds: [scenario.actorWhatsappId]
        });
        const appendCalls = [];
        const dependencies = {
            secret,
            finalizationStore: store,
            loadContext: async () => input,
            appendRowToSheet: async (sheetName, row, options) => {
                appendCalls.push({ sheetName, row, options });
                return {
                    status: 'committed',
                    receipt: {
                        sheetName,
                        updatedRange: `${sheetName}!A2:K2`
                    }
                };
            }
        };

        try {
            await prepareOpenFinanceSaveProposalFinalization({
                proposalRef,
                actorWhatsappId: scenario.actorWhatsappId,
                userId: scenario.actorUserId,
                env,
                dependencies
            });
            const committed = await handleOpenFinanceSaveProposalFinalizationReply({
                messageBody: 'sim',
                actorWhatsappId: scenario.actorWhatsappId,
                userId: scenario.actorUserId,
                expectedProposalRef: proposalRef,
                env,
                dependencies
            });

            assert.equal(committed.state, 'committed');
            assert.equal(appendCalls.length, 1);
            assert.equal(appendCalls[0].sheetName, scenario.expectedSheet);
            assert.equal(
                appendCalls[0].row[scenario.expectedUserIdIndex],
                scenario.selectedPerson.id
            );
            assert.equal(
                appendCalls[0].options.userId,
                scenario.selectedPerson.id
            );
            assert.equal(
                appendCalls[0].options.messageId,
                `open-finance-final:${proposalRef}`
            );
        } finally {
            store.close();
        }
    }
});

test('9P.4 fails closed when source changed, catalog lost authorization or Sheets now matches', () => {
    const changed = fixture();
    changed.item.transactions[0] = {
        ...changed.item.transactions[0],
        amount_cents: changed.item.transactions[0].amount_cents + 1
    };
    assert.throws(
        () => revalidateOpenFinanceSaveProposal({ ...changed, secret }),
        /open_finance_final_source_changed/
    );

    const catalogLost = fixture();
    catalogLost.catalog.cards = [];
    assert.throws(
        () => revalidateOpenFinanceSaveProposal({ ...catalogLost, secret }),
        /open_finance_final_catalog_changed/
    );

    const matched = fixture();
    matched.internalSource.transactions.push({
        id: 'sheet-row',
        source_type: 'cartao',
        date: '30/07/2026',
        description: 'Mercado familiar',
        amountCents: 2590,
        direction: 'debit',
        card_id: 'daniel-nubank',
        card_name: 'Daniel Nubank'
    });
    assert.throws(
        () => revalidateOpenFinanceSaveProposal({ ...matched, secret }),
        /open_finance_final_not_new/
    );

    const installment = fixture();
    installment.proposal.source.total_installments = 3;
    installment.item.transactions[0].total_installments = 3;
    assert.throws(
        () => revalidateOpenFinanceSaveProposal({ ...installment, secret }),
        /open_finance_final_installments_unsupported/
    );
});

test('9P.4 finalization store is encrypted, actor-bound and restart-safe', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-9p4-store-'));
    const databasePath = path.join(directory, 'preview.sqlite');
    const input = fixture();
    const validated = revalidateOpenFinanceSaveProposal({ ...input, secret });
    try {
        const first = new OpenFinanceSaveProposalFinalizationStore({
            databasePath,
            secret,
            authorizedWhatsAppIds: [actorWhatsappId],
            clock: () => new Date('2026-07-30T12:00:00.000Z')
        });
        const prepared = first.prepare({
            proposalRef,
            actorWhatsappId,
            operationKey: validated.operationKey,
            payload: validated,
            expiresAt: '2026-07-31T12:00:00.000Z'
        });
        assert.equal(prepared.state, 'awaiting_confirmation');
        assert.equal(prepared.replay, false);
        first.close();

        const bytes = fs.readFileSync(databasePath).toString('latin1');
        assert.doesNotMatch(bytes, /Mercado familiar|Nubank Daniel|user-daniel|2590/);

        const reopened = new OpenFinanceSaveProposalFinalizationStore({
            databasePath,
            secret,
            authorizedWhatsAppIds: [actorWhatsappId],
            clock: () => new Date('2026-07-30T12:01:00.000Z')
        });
        const replay = reopened.prepare({
            proposalRef,
            actorWhatsappId,
            operationKey: validated.operationKey,
            payload: validated,
            expiresAt: '2026-07-31T12:00:00.000Z'
        });
        assert.equal(replay.replay, true);
        assert.equal(reopened.read(proposalRef, { actorWhatsappId }).state,
            'awaiting_confirmation');
        assert.throws(
            () => reopened.read(proposalRef, { actorWhatsappId: 'third@c.us' }),
            /open_finance_final_actor_unauthorized/
        );
        reopened.close();
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('9P.4 revocation purges the proposal finalization before another confirmation', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-9p4-revoke-'));
    const databasePath = path.join(directory, 'preview.sqlite');
    const input = fixture();
    const journal = new OpenFinanceRevocationJournal({
        databasePath: path.join(directory, 'revocations.sqlite'),
        secret
    });
    const preview = new OpenFinanceShadowPreviewStore({
        databasePath,
        secret,
        revocationJournal: journal,
        authorizedWhatsAppIds: [actorWhatsappId],
        confirmationActors: [{
            principal: 'daniel',
            whatsappId: actorWhatsappId
        }]
    });
    let finalization;
    try {
        const ingested = preview.ingestSaveProposals({
            reconciliationDecisions: [{
                alias: input.proposal.alias,
                observation_ref: input.proposal.observation_ref,
                transaction_ref: '9p4-revocation-transaction',
                status: 'new',
                rule: 'no_candidate'
            }],
            lifecycleDecisions: [{
                observation_ref: input.proposal.observation_ref,
                classification: 'purchase',
                provider_state: 'POSTED'
            }],
            openFinanceItems: [input.item],
            policies: [{
                alias: input.proposal.alias,
                write_confirmation_principal: 'daniel'
            }],
            observedAt: '2026-07-30T11:00:00.000Z',
            includeProposalLinks: true
        });
        const durableProposalRef = ingested.proposal_links[0].proposal_ref;
        finalization = new OpenFinanceSaveProposalFinalizationStore({
            databasePath,
            secret,
            authorizedWhatsAppIds: [actorWhatsappId]
        });
        finalization.prepare({
            proposalRef: durableProposalRef,
            actorWhatsappId,
            operationKey: 'c'.repeat(48),
            payload: { status: 'ready', financial_writes: 0 },
            expiresAt: '2099-01-01T00:00:00.000Z'
        });

        const revoked = preview.revokeSourceAlias(input.proposal.alias, {
            generation: input.proposal.generation
        });

        assert.equal(revoked.removed_save_proposals, 1);
        assert.equal(revoked.removed_save_proposal_finalizations, 1);
        assert.equal(finalization.read(durableProposalRef, {
            actorWhatsappId
        }), null);
    } finally {
        finalization?.close();
        preview.close();
        journal.close();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('9P.4 executes the same operation once across concurrent confirmation and restart replay', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-9p4-exec-'));
    const databasePath = path.join(directory, 'preview.sqlite');
    const input = fixture();
    const validated = revalidateOpenFinanceSaveProposal({ ...input, secret });
    let writes = 0;
    const writer = async (writePlan, { operationKey }) => {
        writes += 1;
        assert.equal(operationKey, validated.operationKey);
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
            status: 'committed',
            receipt: { sheetName: writePlan.sheetName, updatedRange: 'A10:J10' }
        };
    };
    try {
        const store = new OpenFinanceSaveProposalFinalizationStore({
            databasePath,
            secret,
            authorizedWhatsAppIds: [actorWhatsappId]
        });
        store.prepare({
            proposalRef,
            actorWhatsappId,
            operationKey: validated.operationKey,
            payload: validated,
            expiresAt: '2099-01-01T00:00:00.000Z'
        });

        const [left, right] = await Promise.all([
            executeOpenFinanceSaveProposalFinalization({
                proposalRef,
                actorWhatsappId,
                store,
                writer
            }),
            executeOpenFinanceSaveProposalFinalization({
                proposalRef,
                actorWhatsappId,
                store,
                writer
            })
        ]);
        assert.equal(writes, 1);
        assert.equal(left.receipt_ref, right.receipt_ref);
        assert.equal(left.state, 'committed');
        assert.equal(right.state, 'committed');
        store.close();

        const reopened = new OpenFinanceSaveProposalFinalizationStore({
            databasePath,
            secret,
            authorizedWhatsAppIds: [actorWhatsappId]
        });
        const replay = await executeOpenFinanceSaveProposalFinalization({
            proposalRef,
            actorWhatsappId,
            store: reopened,
            writer
        });
        assert.equal(writes, 1);
        assert.equal(replay.replay, true);
        assert.equal(replay.receipt_ref, left.receipt_ref);
        reopened.close();
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('9P.4 remains dormant with write mode off and requires a second explicit confirmation', async () => {
    const input = fixture();
    const disabled = await prepareOpenFinanceSaveProposalFinalization({
        proposalRef,
        actorWhatsappId,
        userId: 'user-daniel',
        env: {
            OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
            OPEN_FINANCE_WRITE_MODE: 'off'
        },
        dependencies: {
            secret,
            loadContext: async () => input
        }
    });
    assert.deepEqual(disabled, { handled: false, financial_writes: 0 });

    const store = new OpenFinanceSaveProposalFinalizationStore({
        secret,
        authorizedWhatsAppIds: [actorWhatsappId]
    });
    let writes = 0;
    let finalizedReviews = 0;
    const dependencies = {
        secret,
        finalizationStore: store,
        loadContext: async () => input,
        writer: async () => {
            writes += 1;
            return {
                status: 'committed',
                receipt: {
                    sheetName: 'Lançamentos Cartão',
                    updatedRange: 'Lançamentos Cartão!A10:J10'
                }
            };
        },
        reviewStore: {
            finalizeReview: () => {
                finalizedReviews += 1;
                return { state: 'finalized', replay: false };
            }
        }
    };
    const env = {
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_WRITE_MODE: 'confirm'
    };
    try {
        const prepared = await prepareOpenFinanceSaveProposalFinalization({
            proposalRef,
            actorWhatsappId,
            userId: 'user-daniel',
            env,
            dependencies
        });
        assert.equal(prepared.state, 'awaiting_confirmation');
        assert.match(prepared.reply, /Confirma o salvamento/i);
        assert.equal(writes, 0);

        const committed = await handleOpenFinanceSaveProposalFinalizationReply({
            messageBody: 'sim',
            actorWhatsappId,
            userId: 'user-daniel',
            expectedProposalRef: proposalRef,
            env,
            dependencies
        });
        assert.equal(writes, 1);
        assert.equal(committed.state, 'committed');
        assert.equal(committed.acknowledge_receipt, true);
        assert.match(committed.reply, /Recibo/);

        const acknowledged = acknowledgeOpenFinanceSaveProposalReceipt({
            proposalRef,
            actorWhatsappId,
            env,
            dependencies
        });
        assert.equal(acknowledged.acknowledged, true);
        assert.equal(finalizedReviews, 1);
        assert.equal(store.read(proposalRef, { actorWhatsappId }).state,
            'receipt_delivered');
    } finally {
        store.close();
    }
});

test('9P.4 keeps receipt acknowledgement retryable until the durable review is finalized', async () => {
    const input = fixture();
    const store = new OpenFinanceSaveProposalFinalizationStore({
        secret,
        authorizedWhatsAppIds: [actorWhatsappId]
    });
    const validated = revalidateOpenFinanceSaveProposal({ ...input, secret });
    store.prepare({
        proposalRef,
        actorWhatsappId,
        operationKey: validated.operationKey,
        payload: validated,
        expiresAt: '2099-01-01T00:00:00.000Z'
    });
    await executeOpenFinanceSaveProposalFinalization({
        proposalRef,
        actorWhatsappId,
        store,
        writer: async () => ({
            status: 'committed',
            receipt: { sheetName: 'Lançamentos Cartão' }
        })
    });
    const env = {
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_WRITE_MODE: 'confirm'
    };
    try {
        assert.throws(() => acknowledgeOpenFinanceSaveProposalReceipt({
            proposalRef,
            actorWhatsappId,
            env,
            dependencies: {
                secret,
                finalizationStore: store,
                reviewStore: {
                    finalizeReview: () => {
                        throw new Error('simulated_review_finalize_failure');
                    }
                }
            }
        }), /simulated_review_finalize_failure/);
        assert.equal(store.read(proposalRef, { actorWhatsappId }).state, 'committed');

        const acknowledged = acknowledgeOpenFinanceSaveProposalReceipt({
            proposalRef,
            actorWhatsappId,
            env,
            dependencies: {
                secret,
                finalizationStore: store,
                reviewStore: {
                    finalizeReview: () => ({ state: 'finalized' })
                }
            }
        });
        assert.equal(acknowledged.acknowledged, true);
        assert.equal(store.read(proposalRef, {
            actorWhatsappId
        }).state, 'receipt_delivered');
    } finally {
        store.close();
    }
});

test('9P.4 keeps an ambiguous write uncertain and reconciles with the same operation key', async () => {
    const input = fixture();
    const store = new OpenFinanceSaveProposalFinalizationStore({
        secret,
        authorizedWhatsAppIds: [actorWhatsappId]
    });
    const operationKeys = [];
    const reconcileModes = [];
    let attempts = 0;
    const performOperation = async (_plan, { operationKey, reconcileOnly }) => {
        attempts += 1;
        operationKeys.push(operationKey);
        reconcileModes.push(Boolean(reconcileOnly));
        if (attempts === 1) {
            const error = new Error('timeout after append');
            error.code = 'ETIMEDOUT';
            throw error;
        }
        return {
            status: 'committed',
            receipt: {
                sheetName: 'LanÃ§amentos CartÃ£o',
                reconciled: true
            }
        };
    };
    const dependencies = {
        secret,
        finalizationStore: store,
        loadContext: async () => input,
        writer: performOperation,
        reconciler: performOperation
    };
    const env = {
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_WRITE_MODE: 'confirm'
    };
    try {
        await prepareOpenFinanceSaveProposalFinalization({
            proposalRef,
            actorWhatsappId,
            userId: 'user-daniel',
            env,
            dependencies
        });
        const uncertain = await handleOpenFinanceSaveProposalFinalizationReply({
            messageBody: 'sim',
            actorWhatsappId,
            userId: 'user-daniel',
            expectedProposalRef: proposalRef,
            env,
            dependencies
        });
        assert.equal(uncertain.state, 'uncertain');
        assert.equal(store.read(proposalRef, { actorWhatsappId }).state,
            'uncertain');

        const reconciled = await handleOpenFinanceSaveProposalFinalizationReply({
            messageBody: 'sim',
            actorWhatsappId,
            userId: 'user-daniel',
            expectedProposalRef: proposalRef,
            env,
            dependencies
        });
        assert.equal(reconciled.state, 'committed');
        assert.equal(attempts, 2);
        assert.equal(operationKeys[0], operationKeys[1]);
        assert.deepEqual(reconcileModes, [false, true]);
    } finally {
        store.close();
    }
});

test('9P.4 restart across separate stores reconciles only and never blindly appends', async () => {
    const input = fixture();
    const dir = fs.mkdtempSync(path.join(
        os.tmpdir(),
        'financasbot-open-finance-final-restart-'
    ));
    const databasePath = path.join(dir, 'finalization.sqlite');
    const ledger = new FinancialWriteLedger({
        dbPath: path.join(dir, 'financial-writes.sqlite')
    });
    const validated = revalidateOpenFinanceSaveProposal({
        ...input,
        secret
    });
    const firstStore = new OpenFinanceSaveProposalFinalizationStore({
        databasePath,
        secret,
        authorizedWhatsAppIds: [actorWhatsappId]
    });
    firstStore.prepare({
        proposalRef,
        actorWhatsappId,
        operationKey: validated.operationKey,
        payload: validated,
        expiresAt: input.review.payload.expires_at
    });
    firstStore.claim(proposalRef, { actorWhatsappId });
    firstStore.close();

    let appendCalls = 0;
    let sheetRows = [];
    const fakeSheets = {
        spreadsheets: {
            values: {
                append: async () => {
                    appendCalls += 1;
                    return {
                        data: {
                            updates: {
                                updatedRange: 'CartÃ£o Nubank Daniel!A2:K2'
                            }
                        }
                    };
                },
                get: async () => ({ data: { values: sheetRows } })
            },
            batchUpdate: async () => ({})
        }
    };
    googleService.__test__.setGoogleClientsForTest({
        sheetsClient: fakeSheets,
        tasksClient: {},
        calendarClient: {},
        oauthClient: {}
    });
    const secondStore = new OpenFinanceSaveProposalFinalizationStore({
        databasePath,
        secret,
        authorizedWhatsAppIds: [actorWhatsappId]
    });
    const env = {
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_WRITE_MODE: 'confirm'
    };
    const appendRowToSheet = (sheetName, row, options) =>
        googleService.appendRowToSheet(sheetName, row, {
            ...options,
            forceCentral: true,
            writeLedger: ledger
        });

    try {
        const blocked = await handleOpenFinanceSaveProposalFinalizationReply({
            messageBody: 'sim',
            actorWhatsappId,
            userId: 'user-daniel',
            expectedProposalRef: proposalRef,
            env,
            dependencies: {
                secret,
                finalizationStore: secondStore,
                loadContext: async () => input,
                appendRowToSheet
            }
        });
        assert.equal(blocked.state, 'uncertain');
        assert.equal(blocked.financial_writes, 0);
        assert.equal(appendCalls, 0);
        assert.equal(
            ledger.getOperation(validated.operationKey),
            null
        );

        ledger.beginOperation({
            operationKey: validated.operationKey,
            actorScope: { scope: 'central' },
            operation: `append.${validated.writePlan.sheetName}`,
            payload: { recovery: true },
            provenance: { source: 'test.crash-window' }
        });
        sheetRows = [validated.writePlan.row];

        const reconciled = await handleOpenFinanceSaveProposalFinalizationReply({
            messageBody: 'sim',
            actorWhatsappId,
            userId: 'user-daniel',
            expectedProposalRef: proposalRef,
            env,
            dependencies: {
                secret,
                finalizationStore: secondStore,
                loadContext: async () => input,
                appendRowToSheet
            }
        });
        assert.equal(reconciled.state, 'committed');
        assert.equal(reconciled.financial_writes, 0);
        assert.equal(appendCalls, 0);
        assert.equal(
            ledger.getOperation(validated.operationKey).status,
            'committed'
        );
    } finally {
        secondStore.close();
        ledger.close();
        googleService.__test__.clearSheetsReadCache();
    }
});
