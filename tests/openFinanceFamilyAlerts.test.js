const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const {
    OpenFinanceAlertOutbox
} = require('../src/openFinance/openFinanceAlertOutbox');
const {
    classifyOpenFinanceLifecycle
} = require('../src/openFinance/openFinanceLifecycleClassifier');
const {
    OpenFinanceShadowPreviewStore
} = require('../src/openFinance/openFinanceShadowPreviewStore');
const {
    OpenFinanceRevocationJournal
} = require('../src/openFinance/openFinanceRevocationJournal');
const {
    observationRef
} = require('../src/openFinance/openFinanceRuntimeReconciliation');
const {
    deliverOneOpenFinanceCanary
} = require('../src/openFinance/openFinanceWhatsappCanaryDelivery');
const {
    handleOpenFinanceSaveProposalReply
} = require('../src/openFinance/openFinanceSaveProposalConversation');

const secret = 'open-finance-family-alerts-secret-32-bytes';
const danielWhatsappId = 'daniel-family-alert@c.us';
const thaisWhatsappId = 'thais-family-alert@c.us';
const familyPolicy = {
    alias: 'daniel_nubank',
    source_owner: 'daniel',
    authorized_viewers: ['daniel', 'thais'],
    whatsapp_recipient: 'daniel',
    family_aggregation_allowed: true,
    write_confirmation_principal: 'daniel'
};

function transactionFixture() {
    const item = {
        id: 'family-item',
        alias_code: familyPolicy.alias,
        generation: 1,
        accounts: [{ id: 'credit-account', type: 'CREDIT' }],
        transactions: [{
            id: 'family-purchase',
            provider_id: 'family-provider-purchase',
            account_id: 'credit-account',
            amount_cents: 1983,
            description: 'COMPRA FAMILIAR PRIVADA',
            date: '2026-07-29T12:00:00.000Z',
            status: 'POSTED',
            currency: 'BRL'
        }]
    };
    const lifecycle = classifyOpenFinanceLifecycle({ items: [item], secret });
    const observation = lifecycle.decisions[0].observation_ref;
    return {
        item,
        lifecycle,
        candidate: {
            observation_ref: observation,
            external_event_ref: 'family-external-event',
            correlation_state: 'new_event',
            reconciliation_status: 'new'
        },
        proposalLink: {
            observation_ref: observation,
            proposal_ref: 'a'.repeat(32),
            principal: 'daniel'
        }
    };
}

function canaryPolicy() {
    return {
        can_send_whatsapp: true,
        can_write_financial: false,
        canary_aliases: [familyPolicy.alias],
        canary_activations: {}
    };
}

test('OF-FAMILY-01 creates one durable alert per spouse and replays without duplication', () => {
    const data = transactionFixture();
    const outbox = new OpenFinanceAlertOutbox({ secret });
    try {
        const first = outbox.enqueue({
            candidates: [data.candidate],
            lifecycleDecisions: data.lifecycle.decisions,
            items: [data.item],
            policies: [familyPolicy],
            baselineComplete: true,
            reconciliationRequired: true,
            saveProposalLinks: [data.proposalLink]
        });
        assert.deepEqual(first, {
            inserted: 2,
            replayed: 0,
            blocked: 0,
            transport_calls: 0,
            financial_writes: 0
        });

        const recipients = [];
        for (let index = 0; index < 2; index += 1) {
            const delivery = outbox.claimNext({ canaryAlias: familyPolicy.alias });
            recipients.push(delivery.recipient);
            outbox.acknowledgeDelivered({
                alertRef: delivery.alert_ref,
                leaseToken: delivery.lease_token,
                whatsappMessageId: `family-message-${index}`
            });
        }
        assert.deepEqual(recipients.sort(), ['daniel', 'thais']);
        assert.equal(outbox.claimNext({ canaryAlias: familyPolicy.alias }), null);

        const replay = outbox.enqueue({
            candidates: [data.candidate],
            lifecycleDecisions: data.lifecycle.decisions,
            items: [data.item],
            policies: [familyPolicy],
            baselineComplete: true,
            reconciliationRequired: true,
            saveProposalLinks: [data.proposalLink]
        });
        assert.equal(replay.inserted, 0);
        assert.equal(replay.replayed, 2);
        assert.equal(outbox.stats().total, 2);
        assert.equal(outbox.stats().delivered_confirmed, 2);
    } finally {
        outbox.close();
    }
});

test('OF-FAMILY-01 migrates a populated owner-only outbox without losing its delivery', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-family-outbox-migration-'));
    const databasePath = path.join(directory, 'outbox.sqlite');
    const data = transactionFixture();
    const ownerOnlyPolicy = {
        ...familyPolicy,
        authorized_viewers: ['daniel'],
        family_aggregation_allowed: false
    };
    let outbox = new OpenFinanceAlertOutbox({ databasePath, secret });
    outbox.enqueue({
        candidates: [data.candidate],
        lifecycleDecisions: data.lifecycle.decisions,
        items: [data.item],
        policies: [ownerOnlyPolicy],
        baselineComplete: true,
        reconciliationRequired: true,
        saveProposalLinks: [data.proposalLink]
    });
    outbox.close();

    const database = new Database(databasePath);
    database.transaction(() => {
        database.exec(`
            ALTER TABLE finance_alert_outbox RENAME TO finance_alert_outbox_current;
            CREATE TABLE finance_alert_outbox (
                alert_ref TEXT PRIMARY KEY, external_event_ref TEXT NOT NULL,
                milestone TEXT NOT NULL, recipient_ref TEXT NOT NULL,
                encrypted_payload TEXT NOT NULL, delivery_state TEXT NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
                sent_at TEXT, whatsapp_message_ref TEXT,
                lease_token TEXT, lease_expires_at TEXT, last_error_code TEXT,
                attempt_ref TEXT, accepted_at TEXT, confirmed_at TEXT,
                UNIQUE(external_event_ref, milestone)
            );
            INSERT INTO finance_alert_outbox
            SELECT * FROM finance_alert_outbox_current;
            DROP TABLE finance_alert_outbox_current;
        `);
    })();
    database.close();

    outbox = new OpenFinanceAlertOutbox({ databasePath, secret });
    try {
        assert.equal(outbox.stats().total, 1);
        const expanded = outbox.enqueue({
            candidates: [data.candidate],
            lifecycleDecisions: data.lifecycle.decisions,
            items: [data.item],
            policies: [familyPolicy],
            baselineComplete: true,
            reconciliationRequired: true,
            saveProposalLinks: [data.proposalLink]
        });
        assert.equal(expanded.inserted, 1);
        assert.equal(expanded.replayed, 1);
        assert.equal(outbox.stats().total, 2);
    } finally {
        outbox.close();
    }
});

test('OF-FAMILY-01 blocks an item already represented in the internal source', () => {
    const data = transactionFixture();
    const outbox = new OpenFinanceAlertOutbox({ secret });
    try {
        const result = outbox.enqueue({
            candidates: [{
                ...data.candidate,
                reconciliation_status: 'exact_match'
            }],
            lifecycleDecisions: data.lifecycle.decisions,
            items: [data.item],
            policies: [familyPolicy],
            baselineComplete: true,
            reconciliationRequired: true
        });
        assert.equal(result.inserted, 0);
        assert.equal(result.blocked, 1);
        assert.equal(outbox.stats().total, 0);
    } finally {
        outbox.close();
    }
});

test('OF-FAMILY-01 defers confirmation ownership while sending a proactive prompt', async () => {
    const data = transactionFixture();
    const outbox = new OpenFinanceAlertOutbox({ secret });
    let prepareCalls = 0;
    try {
        outbox.enqueue({
            candidates: [data.candidate],
            lifecycleDecisions: data.lifecycle.decisions,
            items: [data.item],
            policies: [familyPolicy],
            baselineComplete: true,
            reconciliationRequired: true,
            saveProposalLinks: [data.proposalLink]
        });
        const sent = [];
        const result = await deliverOneOpenFinanceCanary({
            policy: canaryPolicy(),
            outbox,
            recipientResolver: async principal => `${principal}@c.us`,
            sourceLabels: { [familyPolicy.alias]: 'Nubank Daniel' },
            proposalMode: 'prompt',
            eligibleProposalRefs: [data.proposalLink.proposal_ref],
            deferSaveProposalConfirmation: true,
            saveProposalStore: {
                prepareSaveProposalConfirmation: () => {
                    prepareCalls += 1;
                    throw new Error('confirmation must be claimed only after reply');
                },
                readSaveProposalPrivate: () => ({
                    principal: 'daniel',
                    expires_at: '2026-07-31T12:00:00.000Z',
                    source: data.item.transactions[0]
                })
            },
            transport: {
                sendMessage: async (recipient, message) => {
                    sent.push({ recipient, message });
                    return { id: `provider-${recipient}` };
                }
            }
        });

        assert.equal(result.outcome, 'delivered_confirmed');
        assert.equal(prepareCalls, 0);
        assert.equal(sent.length, 1);
        assert.match(sent[0].message, /Quer continuar para salvar este lançamento/);
        assert.equal(result.proposal_ref, data.proposalLink.proposal_ref);
    } finally {
        outbox.close();
    }
});

test('OF-FAMILY-01 lets the first authorized spouse claim confirmation exactly once', () => {
    const journal = new OpenFinanceRevocationJournal({
        databasePath: ':memory:',
        secret
    });
    const store = new OpenFinanceShadowPreviewStore({
        databasePath: ':memory:',
        secret,
        revocationJournal: journal,
        authorizedWhatsAppIds: [danielWhatsappId, thaisWhatsappId],
        confirmationActors: [
            { principal: 'daniel', whatsappId: danielWhatsappId },
            { principal: 'thais', whatsappId: thaisWhatsappId }
        ],
        familyConfirmationEnabled: true,
        clock: () => new Date('2026-07-30T12:00:00.000Z')
    });
    try {
        const data = transactionFixture();
        const ref = observationRef(
            secret,
            data.item.id,
            data.item.transactions[0].account_id,
            data.item.transactions[0].id
        );
        store.ingestSaveProposals({
            reconciliationDecisions: [{
                alias: familyPolicy.alias,
                observation_ref: ref,
                transaction_ref: 'family-transaction-ref',
                status: 'new',
                rule: 'no_candidate'
            }],
            lifecycleDecisions: [{
                observation_ref: ref,
                classification: 'purchase',
                provider_state: 'POSTED'
            }],
            openFinanceItems: [data.item],
            policies: [familyPolicy],
            observedAt: '2026-07-30T11:00:00.000Z'
        });
        const proposalRef = store.listPendingSaveProposals({
            actorWhatsappId: thaisWhatsappId
        })[0].proposal_ref;

        const claimed = store.prepareSaveProposalConfirmation(proposalRef, {
            actorWhatsappId: thaisWhatsappId
        });
        assert.equal(claimed.state, 'ready');
        assert.throws(() => store.prepareSaveProposalConfirmation(proposalRef, {
            actorWhatsappId: danielWhatsappId
        }), /actor_unauthorized/);
        assert.deepEqual(store.decideSaveProposalConfirmation(
            claimed.confirmation_ref,
            'accept',
            { actorWhatsappId: thaisWhatsappId }
        ), {
            applied: true,
            replay: false,
            state: 'accepted',
            proposal_ref: proposalRef,
            financial_writes: 0
        });
    } finally {
        store.close();
        journal.close();
    }
});

test('OF-FAMILY-01 public reply lets either spouse start one durable review after both alerts', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-family-alert-flow-'));
    const secretPath = path.join(directory, 'secret.txt');
    const policyPath = path.join(directory, 'visibility.json');
    const journalPath = path.join(directory, 'journal.sqlite');
    const previewPath = path.join(directory, 'preview.sqlite');
    const outboxPath = path.join(directory, 'outbox.sqlite');
    fs.writeFileSync(secretPath, secret, { mode: 0o600 });
    fs.writeFileSync(policyPath, JSON.stringify([familyPolicy]), { mode: 0o600 });

    const journal = new OpenFinanceRevocationJournal({
        databasePath: journalPath,
        secret
    });
    const store = new OpenFinanceShadowPreviewStore({
        databasePath: previewPath,
        secret,
        revocationJournal: journal,
        authorizedWhatsAppIds: [danielWhatsappId, thaisWhatsappId],
        confirmationActors: [
            { principal: 'daniel', whatsappId: danielWhatsappId },
            { principal: 'thais', whatsappId: thaisWhatsappId }
        ],
        familyConfirmationEnabled: true
    });
    const outbox = new OpenFinanceAlertOutbox({
        databasePath: outboxPath,
        secret
    });
    const data = transactionFixture();
    const ref = observationRef(
        secret,
        data.item.id,
        data.item.transactions[0].account_id,
        data.item.transactions[0].id
    );
    const proposals = store.ingestSaveProposals({
        reconciliationDecisions: [{
            alias: familyPolicy.alias,
            observation_ref: ref,
            transaction_ref: 'family-public-reply-transaction',
            status: 'new',
            rule: 'no_candidate'
        }],
        lifecycleDecisions: [{
            observation_ref: ref,
            classification: 'purchase',
            provider_state: 'POSTED'
        }],
        openFinanceItems: [data.item],
        policies: [familyPolicy],
        observedAt: new Date(Date.now() - 60_000).toISOString(),
        includeProposalLinks: true
    });
    const proposalLink = proposals.proposal_links[0];
    outbox.enqueue({
        candidates: [data.candidate],
        lifecycleDecisions: data.lifecycle.decisions,
        items: [data.item],
        policies: [familyPolicy],
        baselineComplete: true,
        reconciliationRequired: true,
        saveProposalLinks: [proposalLink]
    });

    const recipients = [];
    for (let index = 0; index < 2; index += 1) {
        const delivered = await deliverOneOpenFinanceCanary({
            policy: canaryPolicy(),
            outbox,
            recipientResolver: async principal => ({
                daniel: danielWhatsappId,
                thais: thaisWhatsappId
            })[principal],
            sourceLabels: { [familyPolicy.alias]: 'Nubank Daniel' },
            proposalMode: 'prompt',
            eligibleProposalRefs: [proposalLink.proposal_ref],
            deferSaveProposalConfirmation: true,
            saveProposalStore: store,
            transport: {
                sendMessage: async recipient => {
                    recipients.push(recipient);
                    if (recipient === thaisWhatsappId) {
                        return undefined;
                    }
                    return { id: `provider-${recipient}` };
                }
            }
        });
        if (delivered.recipient === thaisWhatsappId) {
            assert.equal(delivered.outcome, 'accepted_unconfirmed');
            assert.equal(delivered.conversation_bindable, true);
        } else {
            assert.equal(delivered.outcome, 'delivered_confirmed');
        }
    }
    assert.deepEqual(recipients.sort(), [danielWhatsappId, thaisWhatsappId].sort());
    outbox.close();
    store.close();
    journal.close();

    const env = {
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_WRITE_MODE: 'off',
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: secretPath,
        OPEN_FINANCE_VISIBILITY_POLICY_FILE: policyPath,
        OPEN_FINANCE_REVOCATION_JOURNAL_DB: journalPath,
        OPEN_FINANCE_SHADOW_PREVIEW_DB: previewPath,
        OPEN_FINANCE_OUTBOX_DB: outboxPath
    };
    const reviewCatalog = {
        people: [
            { id: 'person-daniel', label: 'Daniel' },
            { id: 'person-thais', label: 'Thaís' }
        ],
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

    const claimedByThais = handleOpenFinanceSaveProposalReply({
        messageBody: 'sim',
        actorWhatsappId: thaisWhatsappId,
        expectedProposalRef: proposalLink.proposal_ref,
        expectedRecipientPrincipal: 'thais',
        reviewCatalog,
        env
    });
    assert.equal(claimedByThais.handled, true);
    assert.equal(claimedByThais.state, 'review_editing');
    assert.equal(claimedByThais.financial_writes, 0);

    const refusedToDaniel = handleOpenFinanceSaveProposalReply({
        messageBody: 'sim',
        actorWhatsappId: danielWhatsappId,
        expectedProposalRef: proposalLink.proposal_ref,
        expectedRecipientPrincipal: 'daniel',
        reviewCatalog,
        env
    });
    assert.equal(refusedToDaniel.handled, true);
    assert.equal(refusedToDaniel.keep_pending, false);
    assert.match(refusedToDaniel.reply, /outro membro do casal/);
    assert.equal(refusedToDaniel.financial_writes, 0);
});
