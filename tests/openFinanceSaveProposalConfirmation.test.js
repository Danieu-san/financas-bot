const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { OpenFinanceShadowPreviewStore } = require('../src/openFinance/openFinanceShadowPreviewStore');
const { observationRef } = require('../src/openFinance/openFinanceRuntimeReconciliation');

const secret = 'open-finance-save-confirmation-secret';
const danielWhatsappId = 'daniel-family-actor@c.us';
const thaisWhatsappId = 'thais-family-actor@c.us';

function openStore(databasePath, clock) {
    return new OpenFinanceShadowPreviewStore({
        databasePath,
        secret,
        authorizedWhatsAppIds: [danielWhatsappId, thaisWhatsappId],
        confirmationActors: [
            { principal: 'daniel', whatsappId: danielWhatsappId },
            { principal: 'thais', whatsappId: thaisWhatsappId }
        ],
        confirmationTtlMinutes: 60,
        clock
    });
}

function seedProposal(store, {
    alias = 'daniel_nubank',
    principal = 'daniel',
    observedAt = '2026-07-23T11:00:00.000Z'
} = {}) {
    const itemId = `item-${alias}`;
    const transactionId = `purchase-${alias}`;
    const transaction = {
        id: transactionId,
        provider_id: `provider-${transactionId}`,
        account_id: 'credit-account',
        amount_cents: 2590,
        description: 'PRIVATE CONFIRMATION DESCRIPTION',
        date: '2026-07-23T10:00:00.000Z',
        status: 'POSTED'
    };
    const ref = observationRef(secret, itemId, transaction.account_id, transaction.id);
    store.ingestSaveProposals({
        reconciliationDecisions: [{
            alias,
            observation_ref: ref,
            transaction_ref: `transaction-ref-${transactionId}`,
            status: 'new',
            rule: 'no_candidate'
        }],
        lifecycleDecisions: [{
            observation_ref: ref,
            classification: 'purchase',
            provider_state: 'POSTED'
        }],
        openFinanceItems: [{
            id: itemId,
            alias_code: alias,
            generation: 2,
            accounts: [{ id: 'credit-account', type: 'CREDIT' }],
            transactions: [transaction]
        }],
        policies: [{ alias, write_confirmation_principal: principal }],
        observedAt
    });
    return store.listPendingSaveProposals({ actorWhatsappId: danielWhatsappId })[0].proposal_ref;
}

test('9P.1 prepares a confirmation only for the explicitly mapped family principal', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-save-confirmation-policy-'));
    const databasePath = path.join(directory, 'preview.sqlite');
    assert.throws(() => new OpenFinanceShadowPreviewStore({
        secret,
        authorizedWhatsAppIds: [danielWhatsappId],
        confirmationActors: [{ principal: 'thais', whatsappId: thaisWhatsappId }]
    }), /save_confirmation_actor_must_be_authorized/);
    const store = openStore(databasePath, () => new Date('2026-07-23T12:00:00.000Z'));
    try {
        const proposalRef = seedProposal(store);
        assert.throws(() => store.prepareSaveProposalConfirmation(proposalRef, {
            actorWhatsappId: thaisWhatsappId
        }), /save_proposal_confirmation_recipient_unauthorized/);
        assert.throws(() => store.prepareSaveProposalConfirmation(proposalRef, {
            actorWhatsappId: 'outsider@c.us'
        }), /shadow_preview_actor_unauthorized/);

        const prepared = store.prepareSaveProposalConfirmation(proposalRef, {
            actorWhatsappId: danielWhatsappId
        });
        assert.deepEqual(Object.keys(prepared).sort(), [
            'confirmation_ref', 'expires_at', 'financial_writes', 'proposal_ref', 'replay', 'state'
        ]);
        assert.match(prepared.confirmation_ref, /^[A-Za-z0-9_-]{32}$/);
        assert.equal(prepared.proposal_ref, proposalRef);
        assert.equal(prepared.state, 'ready');
        assert.equal(prepared.replay, false);
        assert.equal(prepared.financial_writes, 0);
        assert.throws(() => store.decideSaveProposalConfirmation(undefined, 'accept', {
            actorWhatsappId: danielWhatsappId
        }), /valid_save_proposal_confirmation_ref_required/);
        assert.throws(() => store.decideSaveProposalConfirmation(prepared.confirmation_ref, 'maybe', {
            actorWhatsappId: danielWhatsappId
        }), /valid_save_proposal_confirmation_decision_required/);
        assert.equal(store.listPendingSaveProposals({ actorWhatsappId: danielWhatsappId }).length, 0);
        assert.deepEqual(store.listReadySaveProposalConfirmations({
            actorWhatsappId: danielWhatsappId
        }), [{
            confirmation_ref: prepared.confirmation_ref,
            proposal_ref: proposalRef,
            expires_at: prepared.expires_at,
            state: 'ready'
        }]);
        assert.deepEqual(store.listReadySaveProposalConfirmations({
            actorWhatsappId: thaisWhatsappId
        }), []);

        const raw = store.db.prepare(`SELECT confirmation_ref_hash,encrypted_confirmation
            FROM open_finance_save_proposals WHERE proposal_ref=?`).get(proposalRef);
        assert.match(raw.confirmation_ref_hash, /^[a-f0-9]{32}$/);
        assert.doesNotMatch(raw.encrypted_confirmation, new RegExp(prepared.confirmation_ref));
    } finally {
        store.close();
    }

    const bytes = ['preview.sqlite', 'preview.sqlite-wal', 'preview.sqlite-shm']
        .filter(name => fs.existsSync(path.join(directory, name)))
        .map(name => fs.readFileSync(path.join(directory, name)))
        .reduce((combined, value) => Buffer.concat([combined, value]), Buffer.alloc(0))
        .toString('utf8');
    assert.doesNotMatch(bytes, /daniel-family-actor|thais-family-actor|PRIVATE CONFIRMATION DESCRIPTION/);
});

test('9P.1 rejects tampered confirmation bindings before exposing the token', () => {
    const store = openStore(':memory:', () => new Date('2026-07-23T12:00:00.000Z'));
    try {
        const proposalRef = seedProposal(store);
        store.prepareSaveProposalConfirmation(proposalRef, {
            actorWhatsappId: danielWhatsappId
        });
        store.db.prepare(`UPDATE open_finance_save_proposals
            SET confirmation_expires_at='2026-07-23T12:30:00.000Z'
            WHERE proposal_ref=?`).run(proposalRef);
        assert.throws(() => store.listReadySaveProposalConfirmations({
            actorWhatsappId: danielWhatsappId
        }), /save_proposal_confirmation_metadata_mismatch/);
    } finally {
        store.close();
    }
});

test('9P.1 preserves the same ready confirmation across restart and consumes it once', () => {
    const databasePath = path.join(
        fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-save-confirmation-restart-')),
        'preview.sqlite'
    );
    let store = openStore(databasePath, () => new Date('2026-07-23T12:00:00.000Z'));
    const proposalRef = seedProposal(store);
    const first = store.prepareSaveProposalConfirmation(proposalRef, {
        actorWhatsappId: danielWhatsappId
    });
    store.close();

    store = openStore(databasePath, () => new Date('2026-07-23T12:05:00.000Z'));
    try {
        assert.deepEqual(store.prepareSaveProposalConfirmation(proposalRef, {
            actorWhatsappId: danielWhatsappId
        }), { ...first, replay: true });
        assert.deepEqual(store.decideSaveProposalConfirmation(first.confirmation_ref, 'accept', {
            actorWhatsappId: danielWhatsappId
        }), {
            applied: true,
            replay: false,
            state: 'accepted',
            proposal_ref: proposalRef,
            financial_writes: 0
        });
    } finally {
        store.close();
    }

    store = openStore(databasePath, () => new Date('2026-07-23T12:10:00.000Z'));
    try {
        assert.deepEqual(store.prepareSaveProposalConfirmation(proposalRef, {
            actorWhatsappId: danielWhatsappId
        }), { ...first, state: 'accepted', replay: true });
        assert.deepEqual(store.decideSaveProposalConfirmation(first.confirmation_ref, 'accept', {
            actorWhatsappId: danielWhatsappId
        }), {
            applied: false,
            replay: true,
            state: 'accepted',
            proposal_ref: proposalRef,
            financial_writes: 0
        });
        assert.throws(() => store.decideSaveProposalConfirmation(first.confirmation_ref, 'decline', {
            actorWhatsappId: danielWhatsappId
        }), /save_proposal_confirmation_conflict/);
        assert.throws(() => store.decideSaveProposalConfirmation(first.confirmation_ref, 'accept', {
            actorWhatsappId: thaisWhatsappId
        }), /save_proposal_confirmation_actor_unauthorized/);
        assert.equal(store.stats().save_confirmations_accepted, 1);
        assert.equal(store.stats().financial_writes, 0);
    } finally {
        store.close();
    }
});

test('9P.1 expires ready confirmations without extending proposal retention', () => {
    const databasePath = path.join(
        fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-save-confirmation-expiry-')),
        'preview.sqlite'
    );
    let now = new Date('2026-07-23T12:00:00.000Z');
    const store = openStore(databasePath, () => now);
    try {
        const proposalRef = seedProposal(store);
        const prepared = store.prepareSaveProposalConfirmation(proposalRef, {
            actorWhatsappId: danielWhatsappId
        });
        now = new Date('2026-07-23T13:00:01.000Z');
        assert.deepEqual(store.listReadySaveProposalConfirmations({
            actorWhatsappId: danielWhatsappId
        }), []);
        assert.throws(() => store.decideSaveProposalConfirmation(prepared.confirmation_ref, 'accept', {
            actorWhatsappId: danielWhatsappId
        }), /save_proposal_confirmation_expired/);
        assert.equal(store.stats().save_confirmations_expired, 1);
        assert.equal(store.db.prepare(`SELECT encrypted_confirmation
            FROM open_finance_save_proposals WHERE proposal_ref=?`).get(proposalRef).encrypted_confirmation, null);
        assert.deepEqual(store.prepareSaveProposalConfirmation(proposalRef, {
            actorWhatsappId: danielWhatsappId
        }), {
            state: 'expired',
            replay: true,
            proposal_ref: proposalRef,
            financial_writes: 0
        });
    } finally {
        store.close();
    }
});

test('9P.1 revocation and cancellation invalidate confirmation decisions', () => {
    const store = openStore(':memory:', () => new Date('2026-07-23T12:00:00.000Z'));
    try {
        const revokedProposal = seedProposal(store);
        const revoked = store.prepareSaveProposalConfirmation(revokedProposal, {
            actorWhatsappId: danielWhatsappId
        });
        assert.equal(store.revokeSourceAlias('daniel_nubank', {
            generation: 2
        }).removed_save_proposals, 1);
        assert.throws(() => store.decideSaveProposalConfirmation(revoked.confirmation_ref, 'accept', {
            actorWhatsappId: danielWhatsappId
        }), /save_proposal_confirmation_not_found/);

        const cancelledProposal = seedProposal(store, {
            alias: 'daniel_visa',
            observedAt: '2026-07-23T11:05:00.000Z'
        });
        const cancelled = store.prepareSaveProposalConfirmation(cancelledProposal, {
            actorWhatsappId: danielWhatsappId
        });
        store.cancelSaveProposal(cancelledProposal, { actorWhatsappId: danielWhatsappId });
        assert.equal(store.db.prepare(`SELECT encrypted_confirmation
            FROM open_finance_save_proposals WHERE proposal_ref=?`)
            .get(cancelledProposal).encrypted_confirmation, null);
        assert.throws(() => store.decideSaveProposalConfirmation(cancelled.confirmation_ref, 'accept', {
            actorWhatsappId: danielWhatsappId
        }), /save_proposal_state_conflict/);
    } finally {
        store.close();
    }
});

test('9P.1 conditional updates fail closed across two store instances', () => {
    const databasePath = path.join(
        fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-save-confirmation-race-')),
        'preview.sqlite'
    );
    const firstStore = openStore(databasePath, () => new Date('2026-07-23T12:00:00.000Z'));
    const secondStore = openStore(databasePath, () => new Date('2026-07-23T12:00:01.000Z'));
    try {
        const proposalRef = seedProposal(firstStore);
        const prepared = firstStore.prepareSaveProposalConfirmation(proposalRef, {
            actorWhatsappId: danielWhatsappId
        });
        assert.deepEqual(secondStore.prepareSaveProposalConfirmation(proposalRef, {
            actorWhatsappId: danielWhatsappId
        }), { ...prepared, replay: true });
        firstStore.decideSaveProposalConfirmation(prepared.confirmation_ref, 'decline', {
            actorWhatsappId: danielWhatsappId
        });
        assert.throws(() => secondStore.decideSaveProposalConfirmation(
            prepared.confirmation_ref,
            'accept',
            { actorWhatsappId: danielWhatsappId }
        ), /save_proposal_confirmation_conflict/);
        assert.equal(secondStore.stats().save_confirmations_declined, 1);
    } finally {
        secondStore.close();
        firstStore.close();
    }
});
