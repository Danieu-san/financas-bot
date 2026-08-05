const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { OpenFinanceAlertOutbox } = require('../src/openFinance/openFinanceAlertOutbox');
const { OpenFinanceRevocationJournal } = require('../src/openFinance/openFinanceRevocationJournal');
const { OpenFinanceShadowPreviewStore } = require('../src/openFinance/openFinanceShadowPreviewStore');
const { observationRef } = require('../src/openFinance/openFinanceRuntimeReconciliation');

const {
    classifySaveProposalBatchReply,
    handleOpenFinanceSaveProposalBatchReply,
    handleOpenFinanceSaveProposalReviewReply,
    advanceOpenFinanceSaveProposalBatch
} = require('../src/openFinance/openFinanceSaveProposalConversation');
const {
    formatSaveProposalBatchMessage,
    deliverOneOpenFinanceCanary
} = require('../src/openFinance/openFinanceWhatsappCanaryDelivery');
const {
    bindOpenFinanceProposalConversation
} = require('../src/openFinance/openFinanceCanaryRuntime');

const secret = 'open-finance-numeric-save-flow-secret-32-bytes';

function createBatchOutbox(size = 5) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-numeric-save-'));
    const outbox = new OpenFinanceAlertOutbox({
        databasePath: path.join(directory, 'outbox.sqlite'),
        secret
    });
    const item = {
        id: 'item-daniel',
        alias_code: 'daniel_nubank',
        transactions: Array.from({ length: size }, (_, index) => ({
            id: `purchase-${index + 1}`,
            account_id: 'credit-daniel',
            amount_cents: 1000 + index,
            description: `Compra ${index + 1}`,
            date: '2026-07-29T12:00:00.000Z'
        }))
    };
    const refs = item.transactions.map(transaction =>
        observationRef(secret, item.id, transaction.account_id, transaction.id));
    const lifecycleDecisions = refs.map(observation_ref => ({
        observation_ref,
        classification: 'purchase',
        provider_state: 'POSTED',
        lifecycle_milestone: 'first_posted'
    }));
    outbox.enqueue({
        candidates: refs.map((observation_ref, index) => ({
            observation_ref,
            external_event_ref: `external-${index + 1}`,
            correlation_state: 'new_event',
            reconciliation_status: 'new'
        })),
        lifecycleDecisions,
        items: [item],
        policies: [{
            alias: 'daniel_nubank',
            source_owner: 'daniel',
            authorized_viewers: ['daniel'],
            whatsapp_recipient: 'daniel',
            family_aggregation_allowed: false,
            write_confirmation_principal: 'daniel'
        }],
        baselineComplete: true,
        reconciliationRequired: true,
        saveProposalLinks: refs.map((observation_ref, index) => ({
            observation_ref,
            proposal_ref: (index + 1).toString(16).repeat(32),
            principal: 'daniel'
        })),
        createdAt: '2026-07-29T12:01:00.000Z'
    });
    return { outbox, directory };
}

function createBatchPreview(size = 2) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-numeric-preview-'));
    const journalPath = path.join(directory, 'journal.sqlite');
    const previewPath = path.join(directory, 'preview.sqlite');
    const outboxPath = path.join(directory, 'outbox.sqlite');
    const secretPath = path.join(directory, 'secret.txt');
    const visibilityPath = path.join(directory, 'visibility.json');
    fs.writeFileSync(secretPath, secret);
    const familyPolicy = {
        alias: 'daniel_nubank',
        source_owner: 'daniel',
        authorized_viewers: ['daniel', 'thais'],
        whatsapp_recipient: 'daniel',
        family_aggregation_allowed: true,
        write_confirmation_principal: 'daniel'
    };
    fs.writeFileSync(visibilityPath, JSON.stringify([familyPolicy]));
    const journal = new OpenFinanceRevocationJournal({ databasePath: journalPath, secret });
    const store = new OpenFinanceShadowPreviewStore({
        databasePath: previewPath,
        secret,
        revocationJournal: journal,
        authorizedWhatsAppIds: ['daniel@c.us', 'thais@c.us'],
        confirmationActors: [
            { principal: 'daniel', whatsappId: 'daniel@c.us' },
            { principal: 'thais', whatsappId: 'thais@c.us' }
        ],
        familyConfirmationEnabled: true,
        confirmationTtlMinutes: 60,
        clock: () => new Date('2026-07-29T12:02:00.000Z')
    });
    const item = {
        id: 'item-daniel',
        alias_code: 'daniel_nubank',
        generation: 1,
        accounts: [{ id: 'credit-daniel', type: 'CREDIT' }],
        transactions: Array.from({ length: size }, (_, index) => ({
            id: `purchase-${index + 1}`,
            provider_id: `provider-${index + 1}`,
            account_id: 'credit-daniel',
            amount_cents: 1000 + index,
            description: `Compra ${index + 1}`,
            date: '2026-07-29T11:00:00.000Z',
            status: 'POSTED'
        }))
    };
    const refs = item.transactions.map(transaction =>
        observationRef(secret, item.id, transaction.account_id, transaction.id));
    const lifecycleDecisions = refs.map(observation_ref => ({
        observation_ref,
        classification: 'purchase',
        provider_state: 'POSTED',
        lifecycle_milestone: 'first_posted'
    }));
    const ingested = store.ingestSaveProposals({
        reconciliationDecisions: refs.map((observation_ref, index) => ({
            alias: 'daniel_nubank',
            observation_ref,
            transaction_ref: `transaction-${index + 1}`,
            status: 'new',
            rule: 'no_candidate'
        })),
        lifecycleDecisions,
        openFinanceItems: [item],
        policies: [familyPolicy],
        observedAt: '2026-07-29T12:01:00.000Z',
        includeProposalLinks: true
    });
    const outbox = new OpenFinanceAlertOutbox({ databasePath: outboxPath, secret });
    outbox.enqueue({
        candidates: refs.map((observation_ref, index) => ({
            observation_ref,
            external_event_ref: `external-${index + 1}`,
            correlation_state: 'new_event',
            reconciliation_status: 'new'
        })),
        lifecycleDecisions,
        items: [item],
        policies: [familyPolicy],
        baselineComplete: true,
        reconciliationRequired: true,
        saveProposalLinks: ingested.proposal_links,
        createdAt: '2026-07-29T12:01:00.000Z'
    });
    const delivered = outbox.claimNextBatch({
        canaryAliases: ['daniel_nubank'],
        excludedRecipients: ['thais'],
        batchSize: 4,
        now: '2026-07-29T12:02:00.000Z'
    });
    outbox.acknowledgeDeliveredBatch({
        deliveries: delivered.map(entry => ({
            alertRef: entry.alert_ref,
            leaseToken: entry.lease_token
        })),
        whatsappMessageId: 'daniel-batch-message',
        sentAt: '2026-07-29T12:02:01.000Z'
    });
    return {
        directory,
        journalPath,
        previewPath,
        outboxPath,
        journal,
        store,
        outbox,
        proposalRefs: ingested.proposal_links.map(link => link.proposal_ref),
        env: {
            OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
            OPEN_FINANCE_WRITE_MODE: 'off',
            OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: secretPath,
            OPEN_FINANCE_REVOCATION_JOURNAL_DB: journalPath,
            OPEN_FINANCE_SHADOW_PREVIEW_DB: previewPath,
            OPEN_FINANCE_OUTBOX_DB: outboxPath,
            OPEN_FINANCE_VISIBILITY_POLICY_FILE: visibilityPath
        }
    };
}

test('gate 32 parses numeric save selections without treating a multi-item sim as consent', () => {
    assert.equal(typeof classifySaveProposalBatchReply, 'function');
    assert.deepEqual(classifySaveProposalBatchReply('salvar 1 e 3', 4), {
        action: 'select',
        indexes: [1, 3]
    });
    assert.deepEqual(classifySaveProposalBatchReply('salvar todas', 4), {
        action: 'select',
        indexes: [1, 2, 3, 4]
    });
    assert.deepEqual(classifySaveProposalBatchReply('sim', 1), {
        action: 'select',
        indexes: [1]
    });
    assert.deepEqual(classifySaveProposalBatchReply('sim', 4), {
        action: 'invalid',
        indexes: []
    });
    assert.deepEqual(classifySaveProposalBatchReply('salvar 0 e 5', 4), {
        action: 'invalid',
        indexes: []
    });
});

test('gate 32 formats one bounded numbered batch and keeps write confirmation per item', () => {
    assert.equal(typeof formatSaveProposalBatchMessage, 'function');
    const entries = Array.from({ length: 4 }, (_, index) => ({
        delivery: {
            internal_reference: `${index + 1}`.repeat(10),
            amount_cents: 1000 + index,
            description: `Compra ${index + 1}`,
            date: '2026-07-29T12:00:00.000Z'
        },
        sourceLabel: index % 2 ? 'Nubank Thais' : 'Nubank Daniel',
        proposal: {
            source: {
                amount_cents: 1000 + index,
                description: `Compra ${index + 1}`,
                date: '2026-07-29T12:00:00.000Z'
            }
        }
    }));
    const message = formatSaveProposalBatchMessage(entries);
    for (let index = 1; index <= 4; index += 1) {
        assert.match(message, new RegExp(`^${index}\\. `, 'm'));
    }
    assert.match(message, /salvar 1 e 3/i);
    assert.match(message, /salvar todas/i);
    assert.match(message, /conferido e confirmado separadamente/i);
    assert.doesNotMatch(message, /Responda \*sim\*/i);
});

test('gate 32 binds an authenticated durable selection list instead of one ambiguous sim', () => {
    const states = new Map();
    const excludedRecipients = new Set();
    const stateManager = {
        setStateDurably(key, value, ttl) {
            states.set(key, { value, ttl });
        }
    };
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const proposalItems = Array.from({ length: 4 }, (_, index) => ({
        proposal_ref: String(index + 1).repeat(32),
        confirmation_expires_at: expiresAt,
        recipient_principal: 'daniel'
    }));
    assert.equal(bindOpenFinanceProposalConversation({
        delivery: {
            outcome: 'delivered_confirmed',
            proposal_items: proposalItems,
            confirmation_expires_at: expiresAt,
            recipient: 'daniel@c.us',
            recipient_principal: 'daniel'
        },
        stateManager,
        excludedRecipients
    }), true);
    const state = states.get('daniel@c.us').value;
    assert.equal(state.action, 'awaiting_open_finance_save_selection');
    assert.deepEqual(state.data.proposals, proposalItems.map((item, index) => ({
        number: index + 1,
        proposalRef: item.proposal_ref,
        recipientPrincipal: 'daniel'
    })));
    assert.equal(excludedRecipients.has('daniel'), true);
});

test('gate 32 leases and acknowledges at most four proposals as one atomic transport batch', () => {
    const { outbox } = createBatchOutbox(5);
    try {
        assert.equal(typeof outbox.claimNextBatch, 'function');
        assert.equal(typeof outbox.acknowledgeDeliveredBatch, 'function');
        const first = outbox.claimNextBatch({
            canaryAliases: ['daniel_nubank'],
            batchSize: 4,
            now: '2026-07-29T12:02:00.000Z'
        });
        assert.equal(first.length, 4);
        assert.ok(first.every(item => item.recipient === 'daniel'));
        assert.equal(new Set(first.map(item => item.proposal_ref)).size, 4);
        assert.throws(() => outbox.acknowledgeDeliveredBatch({
            deliveries: first.map((item, index) => ({
                alertRef: item.alert_ref,
                leaseToken: index === 3 ? 'stale-lease' : item.lease_token
            })),
            whatsappMessageId: 'must-roll-back',
            sentAt: '2026-07-29T12:02:00.500Z'
        }), /batch_ack_lease_mismatch/);
        assert.ok(first.every(item =>
            outbox.getProposalDeliveryState(item.proposal_ref, {
                recipient: 'daniel'
            }) === 'in_flight'));
        assert.throws(() => outbox.acknowledgeAcceptedBatch({
            deliveries: first.map((item, index) => ({
                alertRef: item.alert_ref,
                leaseToken: index === 2 ? 'stale-lease' : item.lease_token
            })),
            acceptedAt: '2026-07-29T12:02:00.600Z'
        }), /outbox_batch_accept_lease_mismatch/);
        assert.ok(first.every(item =>
            outbox.getProposalDeliveryState(item.proposal_ref, {
                recipient: 'daniel'
            }) === 'in_flight'));
        assert.throws(() => outbox.releaseFailedBatch({
            deliveries: first.map((item, index) => ({
                alertRef: item.alert_ref,
                leaseToken: index === 1 ? 'stale-lease' : item.lease_token
            })),
            errorCode: 'synthetic_transport_failure'
        }), /outbox_batch_release_lease_mismatch/);
        assert.ok(first.every(item =>
            outbox.getProposalDeliveryState(item.proposal_ref, {
                recipient: 'daniel'
            }) === 'in_flight'));
        assert.deepEqual(outbox.acknowledgeDeliveredBatch({
            deliveries: first.map(item => ({
                alertRef: item.alert_ref,
                leaseToken: item.lease_token
            })),
            whatsappMessageId: 'whatsapp-batch-1',
            sentAt: '2026-07-29T12:02:01.000Z'
        }), { delivered_confirmed: 4, financial_writes: 0 });
        const second = outbox.claimNextBatch({
            canaryAliases: ['daniel_nubank'],
            batchSize: 4,
            now: '2026-07-29T12:03:00.000Z'
        });
        assert.equal(second.length, 1);
        assert.equal(second[0].recipient, 'daniel');
    } finally {
        outbox.close();
    }
});

test('gate 32 reserves a selected family batch atomically and survives reopening', () => {
    const harness = createBatchPreview(2);
    try {
        const reserved = harness.store.prepareSaveProposalConfirmations(
            harness.proposalRefs,
            { actorWhatsappId: 'daniel@c.us' }
        );
        assert.equal(reserved.confirmations.length, 2);
        assert.ok(reserved.confirmations.every(item => item.state === 'ready'));
        assert.throws(() => harness.store.prepareSaveProposalConfirmations(
            [harness.proposalRefs[0]],
            { actorWhatsappId: 'thais@c.us' }
        ), /confirmation_actor_unauthorized/);
        harness.store.close();
        harness.journal.close();
        const journal = new OpenFinanceRevocationJournal({
            databasePath: harness.journalPath,
            secret
        });
        const reopened = new OpenFinanceShadowPreviewStore({
            databasePath: harness.previewPath,
            secret,
            revocationJournal: journal,
            authorizedWhatsAppIds: ['daniel@c.us', 'thais@c.us'],
            confirmationActors: [
                { principal: 'daniel', whatsappId: 'daniel@c.us' },
                { principal: 'thais', whatsappId: 'thais@c.us' }
            ],
            familyConfirmationEnabled: true,
            clock: () => new Date('2026-07-29T12:03:00.000Z')
        });
        try {
            assert.deepEqual(
                reopened.listReadySaveProposalConfirmations({
                    actorWhatsappId: 'daniel@c.us',
                    limit: 4
                }).map(item => item.proposal_ref).sort(),
                harness.proposalRefs.slice().sort()
            );
        } finally {
            reopened.close();
            journal.close();
        }
    } finally {
        try { harness.store.close(); } catch {}
        try { harness.journal.close(); } catch {}
        try { harness.outbox.close(); } catch {}
    }
});

test('gate 32 rolls back the whole reservation when one selected proposal is stale', () => {
    const harness = createBatchPreview(2);
    try {
        assert.throws(() => harness.store.prepareSaveProposalConfirmations(
            [harness.proposalRefs[0], 'f'.repeat(32)],
            { actorWhatsappId: 'daniel@c.us' }
        ), /save_proposal_not_found/);
        assert.deepEqual(harness.store.readSaveProposalDecisionState(
            harness.proposalRefs[0],
            { actorWhatsappId: 'daniel@c.us' }
        ), {
            proposal_ref: harness.proposalRefs[0],
            proposal_state: 'pending',
            confirmation_state: 'pending',
            financial_writes: 0
        });
    } finally {
        harness.store.close();
        harness.journal.close();
        harness.outbox.close();
    }
});

test('gate 32 turns a numeric selection into sequential real guided reviews', () => {
    const harness = createBatchPreview(2);
    const reviewCatalog = {
        people: [{ id: 'daniel-user', label: 'Daniel' }],
        categories: [{
            id: 'alimentacao',
            label: 'Alimentação',
            category: 'Alimentação',
            subcategory: ''
        }],
        paymentMethods: [{ id: 'credit', label: 'Crédito', value: 'Crédito' }],
        financialAccounts: [],
        cards: [{
            id: 'nubank-daniel',
            label: 'Nubank Daniel',
            cardId: 'nubank-daniel',
            closingDay: 25
        }]
    };
    try {
        const proposals = harness.proposalRefs.map((proposalRef, index) => ({
            number: index + 1,
            proposalRef,
            recipientPrincipal: 'daniel'
        }));
        const selected = handleOpenFinanceSaveProposalBatchReply({
            messageBody: 'salvar 1 e 2',
            actorWhatsappId: 'daniel@c.us',
            proposals,
            reviewCatalog,
            env: harness.env
        });
        assert.equal(selected.state, 'review_editing');
        assert.equal(selected.proposal_ref, harness.proposalRefs[0]);
        assert.deepEqual(selected.batch.queuedProposalRefs, [harness.proposalRefs[1]]);
        assert.equal(selected.financial_writes, 0);

        const replayedSelection = handleOpenFinanceSaveProposalBatchReply({
            messageBody: 'salvar 1 e 2',
            actorWhatsappId: 'daniel@c.us',
            proposals,
            reviewCatalog,
            env: harness.env
        });
        assert.equal(replayedSelection.state, 'review_editing');
        assert.equal(replayedSelection.proposal_ref, harness.proposalRefs[0]);
        assert.deepEqual(
            replayedSelection.batch.queuedProposalRefs,
            [harness.proposalRefs[1]]
        );

        const cancelled = handleOpenFinanceSaveProposalReviewReply({
            messageBody: 'cancelar',
            actorWhatsappId: 'daniel@c.us',
            expectedProposalRef: harness.proposalRefs[0],
            env: harness.env
        });
        assert.equal(cancelled.state, 'cancelled');
        const advanced = advanceOpenFinanceSaveProposalBatch({
            batch: selected.batch,
            actorWhatsappId: 'daniel@c.us',
            reviewCatalog,
            env: harness.env
        });
        assert.equal(advanced.state, 'review_editing');
        assert.equal(advanced.proposal_ref, harness.proposalRefs[1]);
        assert.deepEqual(advanced.batch.queuedProposalRefs, []);
        assert.equal(advanced.financial_writes, 0);
        const replayedAdvance = advanceOpenFinanceSaveProposalBatch({
            batch: selected.batch,
            actorWhatsappId: 'daniel@c.us',
            reviewCatalog,
            env: harness.env
        });
        assert.equal(replayedAdvance.state, 'review_editing');
        assert.equal(replayedAdvance.proposal_ref, harness.proposalRefs[1]);
        assert.deepEqual(replayedAdvance.batch.queuedProposalRefs, []);
    } finally {
        harness.outbox.close();
        harness.store.close();
        harness.journal.close();
    }
});

test('gate 32 delivers one real numbered WhatsApp batch per family recipient', async () => {
    const harness = createBatchPreview(2);
    const messages = [];
    try {
        const delivery = await deliverOneOpenFinanceCanary({
            policy: {
                can_send_whatsapp: true,
                can_write_financial: false,
                canary_aliases: ['daniel_nubank'],
                canary_activations: {}
            },
            outbox: harness.outbox,
            transport: {
                async sendMessage(to, text) {
                    messages.push({ to, text });
                    return { id: 'thais-batch-message' };
                }
            },
            recipientResolver: async principal =>
                principal === 'thais' ? 'thais@c.us' : null,
            sourceLabels: { daniel_nubank: 'Nubank Daniel' },
            saveProposalStore: harness.store,
            proposalMode: 'prompt',
            proposalBatchSize: 4,
            deferSaveProposalConfirmation: true,
            excludedRecipients: ['daniel'],
            now: '2026-07-29T12:03:00.000Z'
        });
        assert.equal(delivery.outcome, 'delivered_confirmed');
        assert.equal(delivery.proposal_items.length, 2);
        assert.equal(messages.length, 1);
        assert.equal(messages[0].to, 'thais@c.us');
        assert.match(messages[0].text, /^1\. /m);
        assert.match(messages[0].text, /^2\. /m);
        assert.match(messages[0].text, /salvar todas/i);
        const states = new Map();
        assert.equal(bindOpenFinanceProposalConversation({
            delivery,
            stateManager: {
                setStateDurably(key, value, ttl) {
                    states.set(key, { value, ttl });
                }
            },
            excludedRecipients: new Set()
        }), true);
        assert.equal(
            states.get('thais@c.us').value.action,
            'awaiting_open_finance_save_selection'
        );
    } finally {
        harness.outbox.close();
        harness.store.close();
        harness.journal.close();
    }
});

test('gate 32 lets only the first spouse reserve a shared numeric selection', async () => {
    const harness = createBatchPreview(2);
    const reviewCatalog = {
        people: [{ id: 'family-user', label: 'Família' }],
        categories: [{
            id: 'outros', label: 'Outros', category: 'Outros', subcategory: ''
        }],
        paymentMethods: [{ id: 'credit', label: 'Crédito', value: 'Crédito' }],
        financialAccounts: [],
        cards: [{
            id: 'nubank-daniel', label: 'Nubank Daniel',
            cardId: 'nubank-daniel', closingDay: 25
        }]
    };
    try {
        await deliverOneOpenFinanceCanary({
            policy: {
                can_send_whatsapp: true,
                can_write_financial: false,
                canary_aliases: ['daniel_nubank'],
                canary_activations: {}
            },
            outbox: harness.outbox,
            transport: { sendMessage: async () => ({ id: 'thais-shared-batch' }) },
            recipientResolver: async principal =>
                principal === 'thais' ? 'thais@c.us' : null,
            sourceLabels: { daniel_nubank: 'Nubank Daniel' },
            saveProposalStore: harness.store,
            proposalMode: 'prompt',
            proposalBatchSize: 4,
            deferSaveProposalConfirmation: true,
            excludedRecipients: ['daniel'],
            now: '2026-07-29T12:03:00.000Z'
        });
        const daniel = handleOpenFinanceSaveProposalBatchReply({
            messageBody: 'salvar todas',
            actorWhatsappId: 'daniel@c.us',
            proposals: harness.proposalRefs.map((proposalRef, index) => ({
                number: index + 1,
                proposalRef,
                recipientPrincipal: 'daniel'
            })),
            reviewCatalog,
            env: harness.env
        });
        assert.equal(daniel.state, 'review_editing');
        const thais = handleOpenFinanceSaveProposalBatchReply({
            messageBody: 'salvar todas',
            actorWhatsappId: 'thais@c.us',
            proposals: harness.proposalRefs.map((proposalRef, index) => ({
                number: index + 1,
                proposalRef,
                recipientPrincipal: 'thais'
            })),
            reviewCatalog,
            env: harness.env
        });
        assert.equal(thais.state, 'selection_claimed_elsewhere');
        assert.equal(thais.keep_pending, false);
        assert.equal(thais.financial_writes, 0);
        assert.equal(harness.store.stats().save_confirmations_accepted, 1);
        assert.equal(harness.store.stats().save_confirmations_ready, 1);
        assert.equal(harness.store.stats().financial_writes, 0);
    } finally {
        harness.outbox.close();
        harness.store.close();
        harness.journal.close();
    }
});

test('gate 32 quarantines the whole batch after an ambiguous transport failure', async () => {
    const harness = createBatchPreview(2);
    try {
        const delivery = await deliverOneOpenFinanceCanary({
            policy: {
                can_send_whatsapp: true,
                can_write_financial: false,
                canary_aliases: ['daniel_nubank'],
                canary_activations: {}
            },
            outbox: harness.outbox,
            transport: {
                async sendMessage() {
                    throw new Error('transport outcome unknown');
                }
            },
            recipientResolver: async principal =>
                principal === 'thais' ? 'thais@c.us' : null,
            sourceLabels: { daniel_nubank: 'Nubank Daniel' },
            saveProposalStore: harness.store,
            proposalMode: 'prompt',
            proposalBatchSize: 4,
            deferSaveProposalConfirmation: true,
            excludedRecipients: ['daniel'],
            now: '2026-07-29T12:03:00.000Z'
        });
        assert.equal(delivery.outcome, 'accepted_unconfirmed');
        assert.equal(delivery.reason, 'ambiguous_delivery');
        assert.equal(delivery.conversation_bindable, false);
        assert.ok(harness.proposalRefs.every(proposalRef =>
            harness.outbox.getProposalDeliveryState(proposalRef, {
                recipient: 'thais'
            }) === 'accepted_unconfirmed'));
        const excludedRecipients = new Set();
        assert.equal(bindOpenFinanceProposalConversation({
            delivery,
            stateManager: {
                setStateDurably() { throw new Error('must not bind'); }
            },
            excludedRecipients
        }), false);
        assert.equal(excludedRecipients.has('thais'), true);
    } finally {
        harness.outbox.close();
        harness.store.close();
        harness.journal.close();
    }
});
