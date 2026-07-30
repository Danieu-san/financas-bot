const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { OpenFinanceAlertOutbox } = require('../src/openFinance/openFinanceAlertOutbox');
const { OpenFinanceRevocationJournal } = require('../src/openFinance/openFinanceRevocationJournal');
const { OpenFinanceShadowPreviewStore } = require('../src/openFinance/openFinanceShadowPreviewStore');
const {
    OpenFinanceSaveProposalReviewStore
} = require('../src/openFinance/openFinanceSaveProposalReviewStore');
const {
    handleOpenFinanceSaveProposalReply,
    handleOpenFinanceSaveProposalReviewReply,
    assertPromptConfiguration
} = require('../src/openFinance/openFinanceSaveProposalConversation');
const {
    deliverOneOpenFinanceCanary
} = require('../src/openFinance/openFinanceWhatsappCanaryDelivery');
const { observationRef } = require('../src/openFinance/openFinanceRuntimeReconciliation');

const secret = 'open-finance-save-proposal-conversation-secret';
const actorWhatsappId = 'daniel-family-actor@c.us';
const policies = [{
    alias: 'daniel_nubank',
    source_owner: 'daniel',
    authorized_viewers: ['daniel'],
    whatsapp_recipient: 'daniel',
    family_aggregation_allowed: false,
    write_confirmation_principal: 'daniel'
}];
const policy = {
    can_send_whatsapp: true,
    can_write_financial: false,
    canary_aliases: ['daniel_nubank'],
    canary_activations: {}
};
const reviewCatalog = {
    people: [
        { id: 'user-daniel', label: 'Daniel' },
        { id: 'user-thais', label: 'Thaís' }
    ],
    categories: [
        { id: 'alimentacao|supermercado', label: 'Alimentação / SUPERMERCADO',
            category: 'Alimentação', subcategory: 'SUPERMERCADO' }
    ],
    paymentMethods: [
        { id: 'credit', label: 'Crédito', value: 'Crédito' },
        { id: 'pix', label: 'PIX', value: 'PIX' }
    ],
    financialAccounts: [
        { id: 'account-nubank', label: 'Nubank Daniel', ownerUserId: 'user-daniel' }
    ],
    cards: [
        {
            id: 'card-nubank',
            label: 'Nubank Daniel',
            cardId: 'nubank-daniel',
            closingDay: 25
        }
    ]
};
const fullPaymentCatalog = {
    ...reviewCatalog,
    paymentMethods: [
        { id: 'credit', label: 'Crédito', value: 'Crédito' },
        { id: 'debit', label: 'Débito', value: 'Débito' },
        { id: 'pix', label: 'PIX', value: 'PIX' },
        { id: 'cash', label: 'Dinheiro', value: 'Dinheiro' }
    ]
};

function createHarness({ transactionId = 'purchase-posted' } = {}) {
    const now = new Date();
    const observedAt = new Date(now.getTime() - 60_000).toISOString();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-save-conversation-'));
    const journalPath = path.join(directory, 'journal.sqlite');
    const previewPath = path.join(directory, 'preview.sqlite');
    const outboxPath = path.join(directory, 'outbox.sqlite');
    const secretPath = path.join(directory, 'secret.txt');
    fs.writeFileSync(secretPath, secret, { mode: 0o600 });
    const journal = new OpenFinanceRevocationJournal({ databasePath: journalPath, secret });
    const store = new OpenFinanceShadowPreviewStore({
        databasePath: previewPath,
        secret,
        revocationJournal: journal,
        authorizedWhatsAppIds: [actorWhatsappId],
        confirmationActors: [{ principal: 'daniel', whatsappId: actorWhatsappId }],
        confirmationTtlMinutes: 60,
        clock: () => new Date(now)
    });
    const item = {
        id: 'item-daniel',
        alias_code: 'daniel_nubank',
        generation: 2,
        accounts: [{ id: 'credit-account', type: 'CREDIT' }],
        transactions: [{
            id: transactionId,
            provider_id: `provider-${transactionId}`,
            account_id: 'credit-account',
            amount_cents: 2590,
            description: 'Compra privada de teste',
            date: new Date(now.getTime() - 3_600_000).toISOString(),
            status: 'POSTED'
        }]
    };
    const ref = observationRef(secret, item.id, 'credit-account', transactionId);
    const lifecycleDecisions = [{
        observation_ref: ref,
        classification: 'purchase',
        provider_state: 'POSTED',
        lifecycle_milestone: 'first_posted'
    }];
    const reconciliationDecisions = [{
        alias: 'daniel_nubank',
        observation_ref: ref,
        transaction_ref: `transaction-ref-${transactionId}`,
        status: 'new',
        rule: 'no_candidate'
    }];
    const ingested = store.ingestSaveProposals({
        reconciliationDecisions,
        lifecycleDecisions,
        openFinanceItems: [item],
        policies,
        observedAt,
        includeProposalLinks: true
    });
    const [link] = ingested.proposal_links;
    const outbox = new OpenFinanceAlertOutbox({ databasePath: outboxPath, secret });
    outbox.enqueue({
        candidates: [{
            observation_ref: ref,
            external_event_ref: `external-${transactionId}`,
            correlation_state: 'new_event',
            reconciliation_status: 'new'
        }],
        lifecycleDecisions,
        items: [item],
        policies,
        baselineComplete: true,
        reconciliationRequired: true,
        saveProposalLinks: [link],
        createdAt: observedAt
    });
    const env = {
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_WRITE_MODE: 'off',
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: secretPath,
        OPEN_FINANCE_REVOCATION_JOURNAL_DB: journalPath,
        OPEN_FINANCE_SHADOW_PREVIEW_DB: previewPath,
        OPEN_FINANCE_OUTBOX_DB: outboxPath
    };
    let closed = false;
    return {
        directory,
        env,
        journal,
        store,
        outbox,
        now: now.toISOString(),
        proposalRef: link.proposal_ref,
        close() {
            if (closed) return;
            closed = true;
            outbox.close();
            store.close();
            journal.close();
        }
    };
}

function deliveryInput(harness, transport) {
    return {
        policy,
        outbox: harness.outbox,
        saveProposalStore: harness.store,
        proposalMode: 'prompt',
        recipientResolver: async principal =>
            principal === 'daniel' ? actorWhatsappId : null,
        sourceLabels: { daniel_nubank: 'Nubank Daniel' },
        transport,
        now: harness.now
    };
}

test('9P.2 keeps off and shadow modes passive in the public conversation path', () => {
    assert.deepEqual(assertPromptConfiguration({}), { enabled: false });
    assert.deepEqual(assertPromptConfiguration({
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'shadow'
    }), { enabled: false });
    assert.deepEqual(handleOpenFinanceSaveProposalReply({
        messageBody: 'sim',
        actorWhatsappId,
        env: { OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'shadow' }
    }), { handled: false, financial_writes: 0 });
});

test('9P.2 sends a reconciled proposal without exposing its bearer confirmation', async () => {
    const harness = createHarness();
    let sentText = '';
    try {
        const delivered = await deliverOneOpenFinanceCanary(deliveryInput(harness, {
            sendMessage: async (recipient, text) => {
                assert.equal(recipient, actorWhatsappId);
                sentText = text;
                return { id: { _serialized: 'proposal-message-id' } };
            }
        }));
        assert.equal(delivered.outcome, 'delivered_confirmed');
        assert.equal(delivered.proposal_ref, harness.proposalRef);
        assert.equal(delivered.recipient, actorWhatsappId);
        assert.equal(delivered.financial_writes, 0);
        assert.match(sentText, /Quer continuar para salvar este lançamento/);
        assert.match(sentText, /Nada será salvo antes da conferência final/);
        const [ready] = harness.store.listReadySaveProposalConfirmations({
            actorWhatsappId
        });
        assert.equal(ready.proposal_ref, harness.proposalRef);
        assert.doesNotMatch(sentText, new RegExp(ready.confirmation_ref));
        assert.equal(harness.outbox.getProposalDeliveryState(harness.proposalRef),
            'delivered_confirmed');
    } finally {
        harness.close();
    }
});

test('9P.2 reuses one ready confirmation after definitive no-send and succeeds on retry', async () => {
    const harness = createHarness();
    try {
        const failed = await deliverOneOpenFinanceCanary(deliveryInput(harness, {
            sendMessage: async () => {
                throw Object.assign(new Error('offline'), {
                    code: 'transport_offline',
                    definitiveNoSend: true
                });
            }
        }));
        assert.equal(failed.outcome, 'retry');
        assert.equal(harness.outbox.getProposalDeliveryState(harness.proposalRef), 'pending');
        const [before] = harness.store.listReadySaveProposalConfirmations({
            actorWhatsappId
        });
        const unseenReply = handleOpenFinanceSaveProposalReply({
            messageBody: 'sim',
            actorWhatsappId,
            env: harness.env
        });
        assert.equal(unseenReply.handled, false);
        assert.equal(unseenReply.financial_writes, 0);

        const delivered = await deliverOneOpenFinanceCanary(deliveryInput(harness, {
            sendMessage: async () => ({ id: 'retry-message-id' })
        }));
        const [after] = harness.store.listReadySaveProposalConfirmations({
            actorWhatsappId
        });
        assert.equal(delivered.outcome, 'delivered_confirmed');
        assert.equal(after.confirmation_ref, before.confirmation_ref);
        assert.equal(harness.store.listReadySaveProposalConfirmations({
            actorWhatsappId
        }).length, 1);
    } finally {
        harness.close();
    }
});

test('9P.2 keeps ambiguous transport at-most-once but ineligible for a reply', async () => {
    const harness = createHarness();
    let calls = 0;
    try {
        const ambiguous = await deliverOneOpenFinanceCanary(deliveryInput(harness, {
            sendMessage: async () => {
                calls += 1;
                throw new Error('unknown transport result');
            }
        }));
        assert.equal(ambiguous.outcome, 'accepted_unconfirmed');
        assert.equal(harness.outbox.getProposalDeliveryState(harness.proposalRef),
            'accepted_unconfirmed');
        assert.equal(harness.store.listReadySaveProposalConfirmations({
            actorWhatsappId
        }).length, 1);
        const unseenReply = handleOpenFinanceSaveProposalReply({
            messageBody: 'sim',
            actorWhatsappId,
            env: harness.env
        });
        assert.equal(unseenReply.handled, false);
        assert.equal(unseenReply.financial_writes, 0);
        const replay = await deliverOneOpenFinanceCanary(deliveryInput(harness, {
            sendMessage: async () => {
                calls += 1;
                return { id: 'must-not-send' };
            }
        }));
        assert.equal(replay.outcome, 'idle');
        assert.equal(calls, 1);
    } finally {
        harness.close();
    }
});

test('9P.2 excludes an actor with another active prompt before claiming transport', async () => {
    const harness = createHarness();
    let calls = 0;
    try {
        const result = await deliverOneOpenFinanceCanary({
            ...deliveryInput(harness, {
                sendMessage: async () => {
                    calls += 1;
                    return { id: 'must-not-send' };
                }
            }),
            excludedRecipients: ['daniel']
        });
        assert.equal(result.outcome, 'idle');
        assert.equal(calls, 0);
        assert.equal(harness.outbox.getProposalDeliveryState(harness.proposalRef), 'pending');
        assert.equal(harness.store.listReadySaveProposalConfirmations({
            actorWhatsappId
        }).length, 0);
    } finally {
        harness.close();
    }
});

test('9P.2 accepts the authorized reply after restart without auxiliary conversation state', async () => {
    const harness = createHarness();
    const proposalRef = harness.proposalRef;
    try {
        await deliverOneOpenFinanceCanary(deliveryInput(harness, {
            sendMessage: async () => ({ id: 'proposal-message-id' })
        }));
    } finally {
        harness.close();
    }

    const outsider = handleOpenFinanceSaveProposalReply({
        messageBody: 'sim',
        actorWhatsappId: 'outsider@c.us',
        env: harness.env
    });
    assert.equal(outsider.handled, false);
    assert.equal(outsider.financial_writes, 0);

    const accepted = handleOpenFinanceSaveProposalReply({
        messageBody: 'sim',
        actorWhatsappId,
        env: harness.env,
        reviewCatalog
    });
    assert.equal(accepted.handled, true);
    assert.equal(accepted.state, 'review_editing');
    assert.equal(accepted.keep_pending, true);
    assert.equal(accepted.proposal_ref, proposalRef);
    assert.equal(accepted.financial_writes, 0);
    assert.match(accepted.reply, /Nada foi salvo/);

    const journal = new OpenFinanceRevocationJournal({
        databasePath: harness.env.OPEN_FINANCE_REVOCATION_JOURNAL_DB,
        secret
    });
    const store = new OpenFinanceShadowPreviewStore({
        databasePath: harness.env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
        secret,
        revocationJournal: journal,
        authorizedWhatsAppIds: [actorWhatsappId],
        confirmationActors: [{ principal: 'daniel', whatsappId: actorWhatsappId }]
    });
    try {
        assert.equal(store.stats().save_confirmations_accepted, 1);
        assert.equal(store.listReadySaveProposalConfirmations({ actorWhatsappId }).length, 0);
    } finally {
        store.close();
        journal.close();
    }
});

test('9P.3 prepares a durable guided review before accepting the proposal', async () => {
    const harness = createHarness({ transactionId: 'purchase-guided-review' });
    try {
        await deliverOneOpenFinanceCanary(deliveryInput(harness, {
            sendMessage: async () => ({ id: 'guided-review-message-id' })
        }));
        const accepted = handleOpenFinanceSaveProposalReply({
            messageBody: 'sim',
            actorWhatsappId,
            env: harness.env,
            reviewCatalog
        });
        assert.equal(accepted.handled, true);
        assert.equal(accepted.state, 'review_editing');
        assert.equal(accepted.keep_pending, true);
        assert.equal(accepted.proposal_ref, harness.proposalRef);
        assert.equal(accepted.financial_writes, 0);
        assert.match(accepted.reply, /Confira a proposta/i);
        assert.match(accepted.reply, /Pessoa/i);
        assert.match(accepted.reply, /Categoria/i);
        assert.match(accepted.reply, /Nada foi salvo/i);

        const reopened = new OpenFinanceSaveProposalReviewStore({
            databasePath: harness.env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
            secret,
            authorizedWhatsAppIds: [actorWhatsappId]
        });
        try {
            const [review] = reopened.listActiveReviews({ actorWhatsappId });
            assert.equal(review.proposal_ref, harness.proposalRef);
            assert.equal(review.state, 'editing');
            assert.equal(review.financial_writes, 0);
        } finally {
            reopened.close();
        }
        assert.equal(harness.store.stats().save_confirmations_accepted, 1);
    } finally {
        harness.close();
    }
});

test('9P.3 corrects every guided field and only completes a causally valid draft', async () => {
    const harness = createHarness({ transactionId: 'purchase-guided-fields' });
    try {
        await deliverOneOpenFinanceCanary(deliveryInput(harness, {
            sendMessage: async () => ({ id: 'guided-fields-message-id' })
        }));
        const accepted = handleOpenFinanceSaveProposalReply({
            messageBody: 'sim',
            actorWhatsappId,
            env: harness.env,
            reviewCatalog
        });
        const reply = body => handleOpenFinanceSaveProposalReviewReply({
            messageBody: body,
            actorWhatsappId,
            expectedProposalRef: accepted.proposal_ref,
            env: harness.env
        });

        assert.match(reply('1').reply, /Escolha a pessoa/i);
        assert.match(reply('2').reply, /Pessoa: Thaís/i);
        assert.match(reply('2').reply, /Escolha a categoria/i);
        assert.match(reply('1').reply, /Alimentação \/ SUPERMERCADO/i);
        assert.match(reply('3').reply, /Escolha a forma de pagamento/i);
        const pix = reply('2');
        assert.match(pix.reply, /Pagamento: PIX/i);
        assert.match(pix.reply, /Conta financeira/i);
        assert.match(reply('4').reply, /Escolha a conta financeira/i);
        assert.match(reply('1').reply, /Nubank Daniel/i);

        const completed = reply('6');
        assert.equal(completed.state, 'review_ready');
        assert.equal(completed.keep_pending, false);
        assert.equal(completed.financial_writes, 0);
        assert.match(completed.reply, /Conferência concluída/i);
        assert.match(completed.reply, /Nada foi salvo/i);

        const reopened = new OpenFinanceSaveProposalReviewStore({
            databasePath: harness.env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
            secret,
            authorizedWhatsAppIds: [actorWhatsappId]
        });
        try {
            const stored = reopened.readReviewPrivate(
                harness.proposalRef,
                { actorWhatsappId }
            );
            assert.equal(stored.state, 'ready');
            assert.equal(stored.payload.draft.person.label, 'Thaís');
            assert.equal(stored.payload.draft.category.category, 'Alimentação');
            assert.equal(stored.payload.draft.paymentMethod.value, 'PIX');
            assert.equal(stored.payload.draft.financialAccount.id, 'account-nubank');
            assert.equal(stored.payload.draft.card, null);
        } finally {
            reopened.close();
        }
    } finally {
        harness.close();
    }
});

test('9P.3 lists existing categories before an explicit durable new-category choice', async () => {
    const harness = createHarness({ transactionId: 'purchase-new-category' });
    try {
        await deliverOneOpenFinanceCanary(deliveryInput(harness, {
            sendMessage: async () => ({ id: 'new-category-message-id' })
        }));
        const accepted = handleOpenFinanceSaveProposalReply({
            messageBody: 'sim',
            actorWhatsappId,
            env: harness.env,
            reviewCatalog
        });
        const reply = body => handleOpenFinanceSaveProposalReviewReply({
            messageBody: body,
            actorWhatsappId,
            expectedProposalRef: accepted.proposal_ref,
            env: harness.env
        });

        const categoryMenu = reply('2');
        assert.match(categoryMenu.reply, /^1\. Alimentação \/ SUPERMERCADO$/m);
        assert.match(categoryMenu.reply, /^2\. Criar nova categoria$/m);
        assert.ok(
            categoryMenu.reply.indexOf('Alimentação / SUPERMERCADO') <
            categoryMenu.reply.indexOf('Criar nova categoria')
        );
        assert.match(reply('categoria inventada').reply, /número de uma opção válida/i);
        assert.match(reply('2').reply, /nome da nova categoria/i);
        assert.match(reply('1').reply, /nome válido/i);
        assert.match(reply('=IMPORTXML').reply, /nome válido/i);
        assert.match(reply('Alimentação').reply, /categoria já existe/i);
        const created = reply('Pets');
        assert.match(created.reply, /Categoria: Pets/i);
        assert.match(created.reply, /Nada foi salvo/i);

        const reopened = new OpenFinanceSaveProposalReviewStore({
            databasePath: harness.env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
            secret,
            authorizedWhatsAppIds: [actorWhatsappId]
        });
        try {
            const stored = reopened.readReviewPrivate(
                harness.proposalRef,
                { actorWhatsappId }
            );
            assert.equal(stored.state, 'editing');
            assert.deepEqual(stored.payload.draft.category, {
                id: 'new-category:pets',
                label: 'Pets',
                category: 'Pets',
                subcategory: '',
                origin: 'user_created'
            });
        } finally {
            reopened.close();
        }
    } finally {
        harness.close();
    }
});

test('9P.3 shows every payment method as a numbered menu and clears stale dependencies', async () => {
    const harness = createHarness({ transactionId: 'purchase-payment-menu' });
    try {
        await deliverOneOpenFinanceCanary(deliveryInput(harness, {
            sendMessage: async () => ({ id: 'payment-menu-message-id' })
        }));
        const accepted = handleOpenFinanceSaveProposalReply({
            messageBody: 'sim',
            actorWhatsappId,
            env: harness.env,
            reviewCatalog: fullPaymentCatalog
        });
        const reply = body => handleOpenFinanceSaveProposalReviewReply({
            messageBody: body,
            actorWhatsappId,
            expectedProposalRef: accepted.proposal_ref,
            env: harness.env
        });

        assert.match(reply('2').reply, /Escolha a categoria/i);
        assert.match(reply('1').reply, /Alimentação \/ SUPERMERCADO/i);
        const paymentMenu = reply('3');
        assert.match(paymentMenu.reply, /^1\. Crédito$/m);
        assert.match(paymentMenu.reply, /^2\. Débito$/m);
        assert.match(paymentMenu.reply, /^3\. PIX$/m);
        assert.match(paymentMenu.reply, /^4\. Dinheiro$/m);
        assert.match(paymentMenu.reply, /Responda com o número/i);

        for (const invalidChoice of ['PIX', '1.5', '5']) {
            const invalid = reply(invalidChoice);
            assert.match(invalid.reply, /número de uma opção válida/i);
            assert.match(invalid.reply, /^1\. Crédito$/m);
            assert.match(invalid.reply, /^4\. Dinheiro$/m);
        }

        assert.match(reply('3').reply, /Pagamento: PIX/i);
        assert.match(reply('4').reply, /Escolha a conta financeira/i);
        assert.match(reply('1').reply, /Conta financeira: Nubank Daniel/i);

        assert.match(reply('3').reply, /Escolha a forma de pagamento/i);
        const cash = reply('4');
        assert.match(cash.reply, /Pagamento: Dinheiro/i);
        assert.match(cash.reply, /Conta financeira: não definida/i);
        assert.match(cash.reply, /Cartão: não definido/i);
        assert.match(reply('4').reply, /Dinheiro não usa conta financeira/i);
        assert.match(reply('5').reply, /Dinheiro não usa cartão/i);
        assert.equal(reply('6').state, 'review_ready');

        const reopened = new OpenFinanceSaveProposalReviewStore({
            databasePath: harness.env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
            secret,
            authorizedWhatsAppIds: [actorWhatsappId]
        });
        try {
            const stored = reopened.readReviewPrivate(
                harness.proposalRef,
                { actorWhatsappId }
            );
            assert.equal(stored.payload.draft.paymentMethod.value, 'Dinheiro');
            assert.equal(stored.payload.draft.financialAccount, null);
            assert.equal(stored.payload.draft.card, null);
        } finally {
            reopened.close();
        }
    } finally {
        harness.close();
    }
});

test('9P.3 permits only the payment dependency compatible with each numbered choice', async () => {
    const harness = createHarness({ transactionId: 'purchase-payment-dependencies' });
    try {
        await deliverOneOpenFinanceCanary(deliveryInput(harness, {
            sendMessage: async () => ({ id: 'payment-dependencies-message-id' })
        }));
        const accepted = handleOpenFinanceSaveProposalReply({
            messageBody: 'sim',
            actorWhatsappId,
            env: harness.env,
            reviewCatalog: fullPaymentCatalog
        });
        const reply = body => handleOpenFinanceSaveProposalReviewReply({
            messageBody: body,
            actorWhatsappId,
            expectedProposalRef: accepted.proposal_ref,
            env: harness.env
        });
        const choosePayment = number => {
            assert.match(reply('3').reply, /Escolha a forma de pagamento/i);
            return reply(number);
        };

        assert.match(choosePayment('1').reply, /Pagamento: Crédito/i);
        assert.match(reply('4').reply, /Crédito não usa conta financeira/i);
        assert.match(reply('5').reply, /Escolha o cartão/i);
        assert.match(reply('voltar').reply, /Pagamento: Crédito/i);

        assert.match(choosePayment('2').reply, /Pagamento: Débito/i);
        assert.match(reply('5').reply, /Débito não usa cartão/i);
        assert.match(reply('4').reply, /Escolha a conta financeira/i);
        assert.match(reply('voltar').reply, /Pagamento: Débito/i);

        assert.match(choosePayment('3').reply, /Pagamento: PIX/i);
        assert.match(reply('5').reply, /PIX não usa cartão/i);
        assert.match(reply('4').reply, /Escolha a conta financeira/i);
        assert.match(reply('voltar').reply, /Pagamento: PIX/i);

        assert.match(choosePayment('4').reply, /Pagamento: Dinheiro/i);
        assert.match(reply('4').reply, /Dinheiro não usa conta financeira/i);
        assert.match(reply('5').reply, /Dinheiro não usa cartão/i);

        const reopened = new OpenFinanceSaveProposalReviewStore({
            databasePath: harness.env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
            secret,
            authorizedWhatsAppIds: [actorWhatsappId]
        });
        try {
            const stored = reopened.readReviewPrivate(
                harness.proposalRef,
                { actorWhatsappId }
            );
            assert.equal(stored.payload.step, 'menu');
            assert.equal(stored.payload.draft.paymentMethod.value, 'Dinheiro');
            assert.equal(stored.payload.draft.financialAccount, null);
            assert.equal(stored.payload.draft.card, null);
        } finally {
            reopened.close();
        }
    } finally {
        harness.close();
    }
});

test('9P.3 fails closed when a durable legacy review contains an incompatible payment dependency', async () => {
    const harness = createHarness({ transactionId: 'purchase-payment-legacy-draft' });
    try {
        await deliverOneOpenFinanceCanary(deliveryInput(harness, {
            sendMessage: async () => ({ id: 'payment-legacy-message-id' })
        }));
        const accepted = handleOpenFinanceSaveProposalReply({
            messageBody: 'sim',
            actorWhatsappId,
            env: harness.env,
            reviewCatalog: fullPaymentCatalog
        });
        const legacyStore = new OpenFinanceSaveProposalReviewStore({
            databasePath: harness.env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
            secret,
            authorizedWhatsAppIds: [actorWhatsappId]
        });
        try {
            legacyStore.updateReview(accepted.proposal_ref, {
                actorWhatsappId,
                mutate: current => {
                    current.step = 'select_account';
                    current.draft.paymentMethod = {
                        id: 'cash',
                        label: 'Dinheiro',
                        value: 'Dinheiro'
                    };
                    current.draft.financialAccount = {
                        id: 'account-nubank',
                        label: 'Nubank Daniel',
                        ownerUserId: 'user-daniel'
                    };
                    current.draft.card = null;
                    return current;
                }
            });
        } finally {
            legacyStore.close();
        }

        const reply = body => handleOpenFinanceSaveProposalReviewReply({
            messageBody: body,
            actorWhatsappId,
            expectedProposalRef: accepted.proposal_ref,
            env: harness.env
        });
        const restored = reply('1');
        assert.equal(restored.state, 'review_editing');
        assert.match(restored.reply, /Dinheiro não usa conta financeira/i);
        const blocked = reply('6');
        assert.equal(blocked.state, 'review_editing');
        assert.match(blocked.reply, /remover conta ou cartão incompatível/i);
        assert.match(reply('3').reply, /Escolha a forma de pagamento/i);
        assert.match(reply('4').reply, /Conta financeira: não definida/i);
    } finally {
        harness.close();
    }
});

test('9P.3 blocks completion while a required card is missing', async () => {
    const harness = createHarness({ transactionId: 'purchase-missing-card' });
    try {
        await deliverOneOpenFinanceCanary(deliveryInput(harness, {
            sendMessage: async () => ({ id: 'missing-card-message-id' })
        }));
        handleOpenFinanceSaveProposalReply({
            messageBody: 'sim',
            actorWhatsappId,
            env: harness.env,
            reviewCatalog
        });
        const reply = body => handleOpenFinanceSaveProposalReviewReply({
            messageBody: body,
            actorWhatsappId,
            expectedProposalRef: harness.proposalRef,
            env: harness.env
        });
        reply('2');
        reply('1');
        const blocked = reply('6');
        assert.equal(blocked.state, 'review_editing');
        assert.equal(blocked.keep_pending, true);
        assert.match(blocked.reply, /falta cartão/i);
        assert.match(reply('5').reply, /Escolha o cartão/i);
        assert.match(reply('1').reply, /Cartão: Nubank Daniel/i);
        assert.equal(reply('6').state, 'review_ready');
    } finally {
        harness.close();
    }
});

test('9P.3 recovers a prepared review when acceptance failed before activation', async () => {
    const harness = createHarness({ transactionId: 'purchase-prepared-recovery' });
    try {
        await deliverOneOpenFinanceCanary(deliveryInput(harness, {
            sendMessage: async () => ({ id: 'prepared-recovery-message-id' })
        }));
        class FailBeforeAcceptanceStore extends OpenFinanceShadowPreviewStore {
            decideSaveProposalConfirmation() {
                throw new Error('simulated_acceptance_failure');
            }
        }
        assert.throws(() => handleOpenFinanceSaveProposalReply({
            messageBody: 'sim',
            actorWhatsappId,
            env: harness.env,
            reviewCatalog,
            dependencies: {
                OpenFinanceShadowPreviewStore: FailBeforeAcceptanceStore
            }
        }), /simulated_acceptance_failure/);

        const reviews = new OpenFinanceSaveProposalReviewStore({
            databasePath: harness.env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
            secret,
            authorizedWhatsAppIds: [actorWhatsappId]
        });
        try {
            assert.equal(
                reviews.listActiveReviews({ actorWhatsappId })[0].state,
                'prepared'
            );
        } finally {
            reviews.close();
        }
        const recovered = handleOpenFinanceSaveProposalReply({
            messageBody: 'sim',
            actorWhatsappId,
            env: harness.env,
            reviewCatalog
        });
        assert.equal(recovered.state, 'review_editing');
        assert.equal(recovered.financial_writes, 0);
    } finally {
        harness.close();
    }
});

test('9P.3 terminalizes prepared review after a pre-acceptance failure is declined or cancelled', async () => {
    for (const [suffix, reply] of [['declined', 'não'], ['cancelled', 'cancelar']]) {
        const harness = createHarness({ transactionId: `purchase-prepared-${suffix}` });
        try {
            await deliverOneOpenFinanceCanary(deliveryInput(harness, {
                sendMessage: async () => ({ id: `prepared-${suffix}-message-id` })
            }));
            class FailBeforeAcceptanceStore extends OpenFinanceShadowPreviewStore {
                decideSaveProposalConfirmation() {
                    throw new Error('simulated_acceptance_failure');
                }
            }
            assert.throws(() => handleOpenFinanceSaveProposalReply({
                messageBody: 'sim',
                actorWhatsappId,
                env: harness.env,
                reviewCatalog,
                dependencies: {
                    OpenFinanceShadowPreviewStore: FailBeforeAcceptanceStore
                }
            }), /simulated_acceptance_failure/);

            const terminal = handleOpenFinanceSaveProposalReply({
                messageBody: reply,
                actorWhatsappId,
                env: harness.env
            });
            assert.equal(terminal.keep_pending, false);
            assert.equal(terminal.financial_writes, 0);

            const reviews = new OpenFinanceSaveProposalReviewStore({
                databasePath: harness.env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
                secret,
                authorizedWhatsAppIds: [actorWhatsappId]
            });
            try {
                assert.equal(reviews.listActiveReviews({ actorWhatsappId }).length, 0);
                assert.equal(
                    reviews.readReviewPrivate(
                        harness.proposalRef,
                        { actorWhatsappId }
                    ).state,
                    'cancelled'
                );
            } finally {
                reviews.close();
            }
        } finally {
            harness.close();
        }
    }
});

test('9P.3 reconciles a prepared review after a terminal decision persisted before review cleanup', async () => {
    for (const terminal of ['declined', 'cancelled']) {
        const harness = createHarness({ transactionId: `purchase-terminal-${terminal}` });
        try {
            await deliverOneOpenFinanceCanary(deliveryInput(harness, {
                sendMessage: async () => ({ id: `terminal-${terminal}-message-id` })
            }));
            class FailBeforeAcceptanceStore extends OpenFinanceShadowPreviewStore {
                decideSaveProposalConfirmation() {
                    throw new Error('simulated_acceptance_failure');
                }
            }
            assert.throws(() => handleOpenFinanceSaveProposalReply({
                messageBody: 'sim',
                actorWhatsappId,
                env: harness.env,
                reviewCatalog,
                dependencies: {
                    OpenFinanceShadowPreviewStore: FailBeforeAcceptanceStore
                }
            }), /simulated_acceptance_failure/);

            if (terminal === 'declined') {
                const [confirmation] = harness.store.listReadySaveProposalConfirmations({
                    actorWhatsappId
                });
                harness.store.decideSaveProposalConfirmation(
                    confirmation.confirmation_ref,
                    'decline',
                    { actorWhatsappId }
                );
            } else {
                harness.store.cancelSaveProposal(
                    harness.proposalRef,
                    { actorWhatsappId }
                );
            }

            const recovered = handleOpenFinanceSaveProposalReviewReply({
                messageBody: '1',
                actorWhatsappId,
                expectedProposalRef: harness.proposalRef,
                env: harness.env
            });
            assert.equal(recovered.handled, true);
            assert.equal(recovered.keep_pending, false);
            assert.equal(recovered.state, 'cancelled');
            assert.equal(recovered.financial_writes, 0);

            const reviews = new OpenFinanceSaveProposalReviewStore({
                databasePath: harness.env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
                secret,
                authorizedWhatsAppIds: [actorWhatsappId]
            });
            try {
                assert.equal(reviews.listActiveReviews({ actorWhatsappId }).length, 0);
            } finally {
                reviews.close();
            }
        } finally {
            harness.close();
        }
    }
});

test('9P.3 recovers after acceptance persisted but activation failed, then routes the next review reply', async () => {
    const harness = createHarness({ transactionId: 'purchase-accepted-before-activation' });
    try {
        await deliverOneOpenFinanceCanary(deliveryInput(harness, {
            sendMessage: async () => ({ id: 'accepted-before-activation-message-id' })
        }));
        class FailActivationReviewStore extends OpenFinanceSaveProposalReviewStore {
            activateReview() {
                throw new Error('simulated_activation_failure');
            }
        }
        assert.throws(() => handleOpenFinanceSaveProposalReply({
            messageBody: 'sim',
            actorWhatsappId,
            env: harness.env,
            reviewCatalog,
            dependencies: {
                OpenFinanceSaveProposalReviewStore: FailActivationReviewStore
            }
        }), /simulated_activation_failure/);

        const persistedPreview = harness.store.readReviewableSaveProposal(
            harness.proposalRef,
            { actorWhatsappId }
        );
        assert.equal(persistedPreview.confirmation_state, 'accepted');
        harness.close();

        const beforeRestart = new OpenFinanceSaveProposalReviewStore({
            databasePath: harness.env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
            secret,
            authorizedWhatsAppIds: [actorWhatsappId]
        });
        try {
            assert.equal(
                beforeRestart.readReviewPrivate(
                    harness.proposalRef,
                    { actorWhatsappId }
                ).state,
                'prepared'
            );
        } finally {
            beforeRestart.close();
        }

        const recovered = handleOpenFinanceSaveProposalReviewReply({
            messageBody: '2',
            actorWhatsappId,
            expectedProposalRef: harness.proposalRef,
            env: harness.env
        });
        assert.equal(recovered.state, 'review_editing');
        assert.equal(recovered.keep_pending, true);
        assert.match(recovered.reply, /Escolha a categoria/i);
        assert.equal(recovered.financial_writes, 0);

        const afterRestart = new OpenFinanceSaveProposalReviewStore({
            databasePath: harness.env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
            secret,
            authorizedWhatsAppIds: [actorWhatsappId]
        });
        try {
            const review = afterRestart.readReviewPrivate(
                harness.proposalRef,
                { actorWhatsappId }
            );
            assert.equal(review.state, 'editing');
            assert.equal(review.payload.step, 'select_category');
        } finally {
            afterRestart.close();
        }
    } finally {
        harness.close();
    }
});

test('9P.3 keeps review payload encrypted, actor-bound and cancellation terminal', async () => {
    const harness = createHarness({ transactionId: 'purchase-private-review' });
    try {
        await deliverOneOpenFinanceCanary(deliveryInput(harness, {
            sendMessage: async () => ({ id: 'private-review-message-id' })
        }));
        handleOpenFinanceSaveProposalReply({
            messageBody: 'sim',
            actorWhatsappId,
            env: harness.env,
            reviewCatalog
        });
        const rawDatabase = fs.readFileSync(harness.env.OPEN_FINANCE_SHADOW_PREVIEW_DB);
        assert.equal(rawDatabase.includes(Buffer.from('Compra privada de teste')), false);
        assert.equal(rawDatabase.includes(Buffer.from('Nubank Daniel')), false);

        const outsider = handleOpenFinanceSaveProposalReviewReply({
            messageBody: '1',
            actorWhatsappId: 'outsider@c.us',
            env: harness.env
        });
        assert.equal(outsider.handled, false);
        assert.equal(outsider.financial_writes, 0);

        const cancelled = handleOpenFinanceSaveProposalReviewReply({
            messageBody: 'cancelar',
            actorWhatsappId,
            expectedProposalRef: harness.proposalRef,
            env: harness.env
        });
        assert.equal(cancelled.state, 'cancelled');
        assert.equal(cancelled.keep_pending, false);
        assert.equal(cancelled.financial_writes, 0);
        const replay = handleOpenFinanceSaveProposalReviewReply({
            messageBody: '1',
            actorWhatsappId,
            expectedProposalRef: harness.proposalRef,
            env: harness.env
        });
        assert.equal(replay.handled, true);
        assert.equal(replay.keep_pending, false);
        assert.match(replay.reply, /não está mais disponível/i);
    } finally {
        harness.close();
    }
});

test('9P.3 rejects mutable review metadata tampering before exposing the draft', async () => {
    const harness = createHarness({ transactionId: 'purchase-tampered-review' });
    try {
        await deliverOneOpenFinanceCanary(deliveryInput(harness, {
            sendMessage: async () => ({ id: 'tampered-review-message-id' })
        }));
        handleOpenFinanceSaveProposalReply({
            messageBody: 'sim',
            actorWhatsappId,
            env: harness.env,
            reviewCatalog
        });
        const database = new Database(harness.env.OPEN_FINANCE_SHADOW_PREVIEW_DB);
        database.prepare(`UPDATE open_finance_save_proposal_reviews
            SET review_state='ready' WHERE proposal_ref=?`).run(harness.proposalRef);
        database.close();
        assert.throws(() => handleOpenFinanceSaveProposalReviewReply({
            messageBody: '1',
            actorWhatsappId,
            expectedProposalRef: harness.proposalRef,
            env: harness.env
        }), /open_finance_save_review_state_metadata_mismatch/);
    } finally {
        harness.close();
    }
});

test('9P.3 expires an unfinished review with the original confirmation window', async () => {
    const harness = createHarness({ transactionId: 'purchase-expired-review' });
    try {
        await deliverOneOpenFinanceCanary(deliveryInput(harness, {
            sendMessage: async () => ({ id: 'expired-review-message-id' })
        }));
        handleOpenFinanceSaveProposalReply({
            messageBody: 'sim',
            actorWhatsappId,
            env: harness.env,
            reviewCatalog
        });
        const expiredStore = new OpenFinanceSaveProposalReviewStore({
            databasePath: harness.env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
            secret,
            authorizedWhatsAppIds: [actorWhatsappId],
            clock: () => new Date(Date.parse(harness.now) + 2 * 60 * 60 * 1000)
        });
        try {
            assert.equal(expiredStore.listActiveReviews({ actorWhatsappId }).length, 0);
            const expired = expiredStore.readReviewPrivate(
                harness.proposalRef,
                { actorWhatsappId }
            );
            assert.equal(expired.state, 'expired');
            assert.equal(expired.payload, null);
            assert.equal(expired.financial_writes, 0);
        } finally {
            expiredStore.close();
        }
    } finally {
        harness.close();
    }
});

test('9P.2 decline and cancel are terminal, actor-bound and write-free', async () => {
    for (const [reply, expectedState] of [['não', 'declined'], ['cancelar', 'cancelled']]) {
        const harness = createHarness({ transactionId: `purchase-${expectedState}` });
        try {
            await deliverOneOpenFinanceCanary(deliveryInput(harness, {
                sendMessage: async () => ({ id: `${expectedState}-message-id` })
            }));
            harness.store.close();
            harness.journal.close();
            const result = handleOpenFinanceSaveProposalReply({
                messageBody: reply,
                actorWhatsappId,
                expectedProposalRef: harness.proposalRef,
                env: harness.env
            });
            assert.equal(result.handled, true);
            assert.equal(result.state, expectedState);
            assert.equal(result.financial_writes, 0);
            assert.match(result.reply, /[Nn]enhum|[Nn]ão vou salvar/);
            harness.outbox.close();
        } catch (error) {
            try { harness.outbox.close(); } catch {}
            try { harness.store.close(); } catch {}
            try { harness.journal.close(); } catch {}
            throw error;
        }
    }
});

test('9P.2 fails closed when one actor has more than one delivered ready proposal', async () => {
    const first = createHarness({ transactionId: 'purchase-one' });
    try {
        await deliverOneOpenFinanceCanary(deliveryInput(first, {
            sendMessage: async () => ({ id: 'first-message-id' })
        }));
        const secondItem = {
            id: 'item-daniel',
            alias_code: 'daniel_nubank',
            generation: 2,
            accounts: [{ id: 'credit-account', type: 'CREDIT' }],
            transactions: [{
                id: 'purchase-two',
                account_id: 'credit-account',
                amount_cents: 4200,
                description: 'Segunda compra',
                date: new Date(Date.parse(first.now) - 1_800_000).toISOString(),
                status: 'POSTED'
            }]
        };
        const ref = observationRef(secret, secondItem.id, 'credit-account', 'purchase-two');
        const lifecycleDecisions = [{
            observation_ref: ref,
            classification: 'purchase',
            provider_state: 'POSTED',
            lifecycle_milestone: 'first_posted'
        }];
        const inserted = first.store.ingestSaveProposals({
            reconciliationDecisions: [{
                alias: 'daniel_nubank',
                observation_ref: ref,
                transaction_ref: 'transaction-ref-purchase-two',
                status: 'new',
                rule: 'no_candidate'
            }],
            lifecycleDecisions,
            openFinanceItems: [secondItem],
            policies,
            observedAt: new Date(Date.parse(first.now) - 30_000).toISOString(),
            includeProposalLinks: true
        });
        first.store.prepareSaveProposalConfirmation(
            inserted.proposal_links[0].proposal_ref,
            { actorWhatsappId }
        );
        first.outbox.enqueue({
            candidates: [{
                observation_ref: ref,
                external_event_ref: 'external-purchase-two',
                correlation_state: 'new_event',
                reconciliation_status: 'new'
            }],
            lifecycleDecisions,
            items: [secondItem],
            policies,
            baselineComplete: true,
            reconciliationRequired: true,
            saveProposalLinks: inserted.proposal_links,
            createdAt: new Date(Date.parse(first.now) + 1_000).toISOString()
        });
        await deliverOneOpenFinanceCanary(deliveryInput(first, {
            sendMessage: async () => ({ id: 'second-message-id' })
        }));
        assert.throws(() => handleOpenFinanceSaveProposalReply({
            messageBody: 'sim',
            actorWhatsappId,
            env: first.env
        }), /ambiguous_open_finance_save_proposal_reply/);
        assert.equal(first.store.listReadySaveProposalConfirmations({
            actorWhatsappId
        }).length, 2);
    } finally {
        first.close();
    }
});
