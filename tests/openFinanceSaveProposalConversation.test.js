const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { OpenFinanceAlertOutbox } = require('../src/openFinance/openFinanceAlertOutbox');
const { OpenFinanceRevocationJournal } = require('../src/openFinance/openFinanceRevocationJournal');
const { OpenFinanceShadowPreviewStore } = require('../src/openFinance/openFinanceShadowPreviewStore');
const {
    handleOpenFinanceSaveProposalReply,
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
    return {
        directory,
        env,
        journal,
        store,
        outbox,
        now: now.toISOString(),
        proposalRef: link.proposal_ref,
        close() {
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

test('9P.2 treats ambiguous transport as at-most-once and leaves the reply ready', async () => {
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
        env: harness.env
    });
    assert.equal(accepted.handled, true);
    assert.equal(accepted.state, 'accepted');
    assert.equal(accepted.proposal_ref, proposalRef);
    assert.equal(accepted.financial_writes, 0);
    assert.match(accepted.reply, /Nada foi salvo ainda/);

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
