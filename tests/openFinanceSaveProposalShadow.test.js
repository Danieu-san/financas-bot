const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { OpenFinanceLiveStagingVault } = require('../src/openFinance/openFinanceLiveStagingVault');
const { OpenFinanceBaselineStore } = require('../src/openFinance/openFinanceBaselineStore');
const { OpenFinanceAlertOutbox } = require('../src/openFinance/openFinanceAlertOutbox');
const { OpenFinanceRevocationJournal } = require('../src/openFinance/openFinanceRevocationJournal');
const { OpenFinanceShadowPreviewStore } = require('../src/openFinance/openFinanceShadowPreviewStore');
const {
    OpenFinanceSaveProposalReviewStore
} = require('../src/openFinance/openFinanceSaveProposalReviewStore');
const { observationRef } = require('../src/openFinance/openFinanceRuntimeReconciliation');
const {
    runOpenFinanceCanaryCycle,
    initializeOpenFinanceCanaryRuntime,
    saveProposalMode,
    saveProposalConfiguration
} = require('../src/openFinance/openFinanceCanaryRuntime');

const secret = 'open-finance-save-proposal-shadow-secret';
const actorWhatsappId = 'family-actor@c.us';

function transaction(id, {
    amountCents = 2590,
    description = 'PRIVATE PROPOSAL DESCRIPTION',
    status = 'POSTED'
} = {}) {
    return {
        id,
        provider_id: `provider-${id}`,
        account_id: 'credit-account',
        amount_cents: amountCents,
        description,
        date: '2026-07-23T10:00:00.000Z',
        status
    };
}

function fixture() {
    const item = {
        id: 'private-item-id',
        alias_code: 'daniel_nubank',
        owner_scope: 'daniel',
        generation: 2,
        accounts: [{ id: 'credit-account', type: 'CREDIT' }],
        transactions: [
            transaction('purchase-posted'),
            transaction('purchase-pending', { status: 'PENDING' }),
            transaction('refund-posted', { amountCents: -2590 }),
            transaction('matched-posted')
        ]
    };
    const refs = Object.fromEntries(item.transactions.map(row => [
        row.id,
        observationRef(secret, item.id, row.account_id, row.id)
    ]));
    const reconciliationDecisions = item.transactions.map(row => ({
        alias: item.alias_code,
        observation_ref: refs[row.id],
        transaction_ref: `transaction-ref-${row.id}`,
        status: row.id === 'matched-posted' ? 'matched' : 'new',
        rule: row.id === 'matched-posted' ? 'amount_date_description' : 'no_candidate'
    }));
    const lifecycleDecisions = [
        { observation_ref: refs['purchase-posted'], classification: 'purchase', provider_state: 'POSTED' },
        { observation_ref: refs['purchase-pending'], classification: 'purchase', provider_state: 'PENDING' },
        { observation_ref: refs['refund-posted'], classification: 'refund', provider_state: 'POSTED' },
        { observation_ref: refs['matched-posted'], classification: 'purchase', provider_state: 'POSTED' }
    ];
    return {
        item,
        refs,
        reconciliationDecisions,
        lifecycleDecisions,
        policies: [{
            alias: 'daniel_nubank',
            write_confirmation_principal: 'daniel'
        }]
    };
}

function openStore(databasePath, clock = () => new Date('2026-07-23T12:00:00.000Z')) {
    return new OpenFinanceShadowPreviewStore({
        databasePath,
        secret,
        authorizedWhatsAppIds: [actorWhatsappId],
        clock
    });
}

function proposalInput(input, observedAt = '2026-07-23T11:00:00.000Z') {
    return {
        reconciliationDecisions: input.reconciliationDecisions,
        lifecycleDecisions: input.lifecycleDecisions,
        openFinanceItems: [input.item],
        policies: input.policies,
        observedAt
    };
}

test('9P.2 proposal mode is dark by default and exposes only shadow or write-free prompt', () => {
    assert.equal(saveProposalMode({}), 'off');
    assert.equal(saveProposalMode({ OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'shadow' }), 'shadow');
    assert.equal(saveProposalMode({ OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt' }), 'prompt');
    assert.throws(() => saveProposalMode({ OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'canary' }),
        /invalid_open_finance_save_proposal_mode/);
    assert.throws(() => saveProposalMode({ OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'on' }),
        /invalid_open_finance_save_proposal_mode/);
});

test('9P.2 prompt configuration requires reconciliation, preview and financial writes off', () => {
    const valid = {
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary',
        OPEN_FINANCE_RECONCILIATION_MODE: 'canary',
        OPEN_FINANCE_WRITE_MODE: 'off'
    };
    assert.deepEqual(saveProposalConfiguration(valid), {
        proposalMode: 'prompt',
        previewMode: 'canary',
        internalReconciliationMode: 'canary'
    });
    assert.throws(() => saveProposalConfiguration({
        ...valid,
        OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'off'
    }), /open_finance_save_proposal_preview_required/);
    assert.throws(() => saveProposalConfiguration({
        ...valid,
        OPEN_FINANCE_RECONCILIATION_MODE: 'off'
    }), /open_finance_save_proposal_reconciliation_required/);
    assert.throws(() => saveProposalConfiguration({
        ...valid,
        OPEN_FINANCE_WRITE_MODE: 'canary'
    }), /open_finance_write_mode_invalid/);
});

test('post-9P.4 prompt accepts confirmed writing only under the complete explicit gate', () => {
    const approved = {
        OPEN_FINANCE_ALERT_MODE: 'canary',
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary',
        OPEN_FINANCE_RECONCILIATION_MODE: 'canary',
        OPEN_FINANCE_WRITE_MODE: 'confirm',
        OPEN_FINANCE_WRITE_APPROVED: 'true'
    };
    assert.deepEqual(saveProposalConfiguration(approved), {
        proposalMode: 'prompt',
        previewMode: 'canary',
        internalReconciliationMode: 'canary'
    });
    for (const [key, value] of [
        ['OPEN_FINANCE_ALERT_MODE', 'shadow'],
        ['OPEN_FINANCE_SHADOW_PREVIEW_MODE', 'off'],
        ['OPEN_FINANCE_RECONCILIATION_MODE', 'off'],
        ['OPEN_FINANCE_WRITE_APPROVED', 'false']
    ]) {
        assert.throws(() => saveProposalConfiguration({
            ...approved,
            [key]: value
        }), /open_finance_write_/);
    }
});

test('9P.0 initializer rejects invalid proposal configuration before installing polling timers', () => {
    const originalTimeout = global.setTimeout;
    const originalInterval = global.setInterval;
    let timerCalls = 0;
    global.setTimeout = () => { timerCalls += 1; return { unref() {} }; };
    global.setInterval = () => { timerCalls += 1; return { unref() {} }; };
    try {
        assert.throws(() => initializeOpenFinanceCanaryRuntime({
            client: {},
            env: {
                OPEN_FINANCE_ALERT_MODE: 'canary',
                OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'canary'
            }
        }), /invalid_open_finance_save_proposal_mode/);
        assert.throws(() => initializeOpenFinanceCanaryRuntime({
            client: {},
            env: {
                OPEN_FINANCE_ALERT_MODE: 'canary',
                OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'shadow',
                OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'off',
                OPEN_FINANCE_RECONCILIATION_MODE: 'canary'
            }
        }), /open_finance_save_proposal_preview_required/);
        assert.throws(() => initializeOpenFinanceCanaryRuntime({
            client: {},
            env: {
                OPEN_FINANCE_ALERT_MODE: 'canary',
                OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'shadow',
                OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary',
                OPEN_FINANCE_RECONCILIATION_MODE: 'off'
            }
        }), /open_finance_save_proposal_reconciliation_required/);
        assert.equal(timerCalls, 0);
    } finally {
        global.setTimeout = originalTimeout;
        global.setInterval = originalInterval;
    }
});

test('9P.0 replay is content-immutable across causal fields and store instances', () => {
    const databasePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-save-proposal-replay-')),
        'preview.sqlite');
    const input = fixture();
    const firstStore = openStore(databasePath);
    const secondStore = openStore(databasePath);
    try {
        firstStore.ingestSaveProposals(proposalInput(input));
        const [initial] = firstStore.listPendingSaveProposals({ actorWhatsappId });
        const originalPayload = firstStore.readSaveProposalPrivate(initial.proposal_ref, { actorWhatsappId });
        assert.deepEqual(secondStore.ingestSaveProposals(proposalInput(structuredClone(input))), {
            inserted: 0,
            replayed: 1,
            blocked: 3,
            pending: 1,
            financial_writes: 0
        });
        assert.deepEqual(firstStore.listPendingSaveProposals({ actorWhatsappId }), [initial]);

        const mutations = [
            changed => { changed.item.transactions[0].amount_cents += 1; },
            changed => { changed.item.transactions[0].description = 'CHANGED DESCRIPTION'; },
            changed => { changed.item.transactions[0].date = '2026-07-23T10:01:00.000Z'; },
            changed => { changed.item.transactions[0].status = 'PENDING'; },
            changed => { changed.item.accounts[0].type = 'BANK'; },
            changed => { changed.policies[0].write_confirmation_principal = 'thais'; },
            changed => { changed.reconciliationDecisions[0].transaction_ref = 'changed-transaction-ref'; }
        ];
        for (const mutate of mutations) {
            const changed = structuredClone(input);
            mutate(changed);
            assert.throws(() => secondStore.ingestSaveProposals(proposalInput(changed)),
                /save_proposal_replay_conflict/);
        }
        assert.deepEqual(firstStore.readSaveProposalPrivate(initial.proposal_ref, { actorWhatsappId }), originalPayload);
        assert.deepEqual(firstStore.listPendingSaveProposals({ actorWhatsappId }), [initial]);

        firstStore.cancelSaveProposal(initial.proposal_ref, { actorWhatsappId });
        const changedAfterCancellation = structuredClone(input);
        changedAfterCancellation.item.transactions[0].amount_cents += 1;
        assert.throws(() => secondStore.ingestSaveProposals(proposalInput(changedAfterCancellation)),
            /save_proposal_replay_conflict/);
        assert.equal(firstStore.stats().save_proposals_cancelled, 1);
    } finally {
        secondStore.close();
        firstStore.close();
    }
});

test('OF-ALERT-BIND-01 eligibility loss durably invalidates a stale prompt without reopening it', () => {
    for (const scenario of ['lifecycle', 'reconciliation']) {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), `finbot-save-proposal-invalidation-${scenario}-`));
        const databasePath = path.join(directory, 'preview.sqlite');
        const journalPath = path.join(directory, 'journal.sqlite');
        const input = fixture();
        const journal = new OpenFinanceRevocationJournal({ databasePath: journalPath, secret });
        let store = new OpenFinanceShadowPreviewStore({
            databasePath,
            secret,
            revocationJournal: journal,
            authorizedWhatsAppIds: [actorWhatsappId],
            confirmationActors: [{ principal: 'daniel', whatsappId: actorWhatsappId }]
        });
        let proposalRef;
        try {
            store.ingestSaveProposals(proposalInput(input));
            proposalRef = store.listPendingSaveProposals({ actorWhatsappId })[0].proposal_ref;
            store.prepareSaveProposalConfirmation(proposalRef, { actorWhatsappId });
            const changed = structuredClone(input);
            if (scenario === 'lifecycle') {
                changed.lifecycleDecisions[0].classification = 'bill_balance';
            } else {
                changed.reconciliationDecisions[0].status = 'matched';
                changed.reconciliationDecisions[0].rule = 'amount_date_description';
            }
            const tampered = structuredClone(changed);
            tampered.item.transactions[0].amount_cents += 1;
            assert.throws(() => store.ingestSaveProposals(proposalInput(tampered)),
                /save_proposal_replay_conflict/);
            assert.equal(
                store.readSaveProposalDecisionState(proposalRef, { actorWhatsappId }).proposal_state,
                'pending'
            );
            assert.deepEqual(store.ingestSaveProposals(proposalInput(changed)), {
                inserted: 0,
                replayed: 0,
                blocked: 4,
                pending: 0,
                invalidated: 1,
                financial_writes: 0
            });
            assert.equal(store.listPendingSaveProposals({ actorWhatsappId }).length, 0);
            const decision = store.readSaveProposalDecisionState(proposalRef, { actorWhatsappId });
            assert.equal(decision.proposal_state, 'cancelled');
            assert.equal(decision.confirmation_state, 'declined');
            const terminal = journal.getSaveProposalTerminal(proposalRef);
            assert.equal(terminal.terminal_state, 'cancelled');
            assert.match(terminal.resolved_by_ref, /^[a-f0-9]{32}$/);
            assert.equal(store.ingestSaveProposals(proposalInput(changed)).invalidated, undefined);
        } finally {
            store.close();
        }
        store = new OpenFinanceShadowPreviewStore({
            databasePath,
            secret,
            revocationJournal: journal,
            authorizedWhatsAppIds: [actorWhatsappId],
            confirmationActors: [{ principal: 'daniel', whatsappId: actorWhatsappId }]
        });
        try {
            const replay = store.ingestSaveProposals(proposalInput(input));
            assert.equal(replay.inserted, 0);
            assert.equal(replay.pending, 0);
            assert.equal(store.listPendingSaveProposals({ actorWhatsappId }).length, 0);
            assert.equal(replay.financial_writes, 0);
        } finally {
            store.close();
            journal.close();
        }
    }
});

test('OF-ALERT-BIND-01 source identity displacement closes the old prompt and blocks the replacement', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-save-proposal-identity-displacement-'));
    const databasePath = path.join(directory, 'preview.sqlite');
    const journal = new OpenFinanceRevocationJournal({
        databasePath: path.join(directory, 'journal.sqlite'),
        secret
    });
    const store = new OpenFinanceShadowPreviewStore({
        databasePath,
        secret,
        revocationJournal: journal,
        authorizedWhatsAppIds: [actorWhatsappId],
        confirmationActors: [{ principal: 'daniel', whatsappId: actorWhatsappId }]
    });
    try {
        const input = fixture();
        store.ingestSaveProposals(proposalInput(input));
        const oldProposalRef = store.listPendingSaveProposals({ actorWhatsappId })[0].proposal_ref;
        store.prepareSaveProposalConfirmation(oldProposalRef, { actorWhatsappId });

        const changed = structuredClone(input);
        const changedTransaction = changed.item.transactions[0];
        changed.item.accounts = [{ id: 'moved-account', type: 'BANK' }];
        changedTransaction.account_id = 'moved-account';
        changedTransaction.amount_cents += 1;
        changedTransaction.description = 'CHANGED DESCRIPTION';
        const changedObservationRef = observationRef(
            secret,
            changed.item.id,
            changedTransaction.account_id,
            changedTransaction.id
        );
        changed.reconciliationDecisions[0] = {
            ...changed.reconciliationDecisions[0],
            observation_ref: changedObservationRef,
            transaction_ref: 'changed-transaction-ref'
        };
        changed.lifecycleDecisions[0] = {
            ...changed.lifecycleDecisions[0],
            observation_ref: changedObservationRef,
            classification: 'bill_balance'
        };
        changed.policies[0].write_confirmation_principal = 'thais';

        assert.deepEqual(store.ingestSaveProposals(proposalInput(changed)), {
            inserted: 0,
            replayed: 0,
            blocked: 4,
            pending: 0,
            invalidated: 1,
            financial_writes: 0
        });
        const decision = store.readSaveProposalDecisionState(oldProposalRef, { actorWhatsappId });
        assert.equal(decision.proposal_state, 'cancelled');
        assert.equal(decision.confirmation_state, 'declined');
        assert.equal(journal.getSaveProposalTerminal(oldProposalRef).terminal_state, 'cancelled');
        assert.equal(store.stats().save_proposals_total, 1);
        assert.equal(store.stats().save_proposals_pending, 0);
    } finally {
        store.close();
        journal.close();
    }
});

test('OF-ALERT-BIND-01 journal terminal recovers a preview rollback after restart', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-save-proposal-journal-recovery-'));
    const databasePath = path.join(directory, 'preview.sqlite');
    const journalPath = path.join(directory, 'journal.sqlite');
    const input = fixture();
    const changed = structuredClone(input);
    changed.lifecycleDecisions[0].classification = 'bill_balance';
    let journal = new OpenFinanceRevocationJournal({ databasePath: journalPath, secret });
    let store = new OpenFinanceShadowPreviewStore({
        databasePath,
        secret,
        revocationJournal: journal,
        authorizedWhatsAppIds: [actorWhatsappId],
        confirmationActors: [{ principal: 'daniel', whatsappId: actorWhatsappId }]
    });
    let proposalRef;
    try {
        store.ingestSaveProposals(proposalInput(input));
        proposalRef = store.listPendingSaveProposals({ actorWhatsappId })[0].proposal_ref;
        store.prepareSaveProposalConfirmation(proposalRef, { actorWhatsappId });
        store.db.exec(`CREATE TRIGGER fail_terminal_preview_update
            BEFORE UPDATE OF proposal_state ON open_finance_save_proposals
            WHEN NEW.proposal_state='cancelled'
            BEGIN SELECT RAISE(ABORT, 'injected_preview_update_failure'); END`);
        assert.throws(() => store.ingestSaveProposals(proposalInput(changed)),
            /injected_preview_update_failure/);
        assert.equal(journal.getSaveProposalTerminal(proposalRef).terminal_state, 'cancelled');
    } finally {
        store.close();
        journal.close();
    }

    const raw = new Database(databasePath);
    try {
        const row = raw.prepare(`SELECT proposal_state,confirmation_state
            FROM open_finance_save_proposals WHERE proposal_ref=?`).get(proposalRef);
        assert.deepEqual(row, { proposal_state: 'pending', confirmation_state: 'ready' });
        raw.exec('DROP TRIGGER fail_terminal_preview_update');
    } finally {
        raw.close();
    }

    journal = new OpenFinanceRevocationJournal({ databasePath: journalPath, secret });
    store = new OpenFinanceShadowPreviewStore({
        databasePath,
        secret,
        revocationJournal: journal,
        authorizedWhatsAppIds: [actorWhatsappId],
        confirmationActors: [{ principal: 'daniel', whatsappId: actorWhatsappId }]
    });
    try {
        const replay = store.ingestSaveProposals(proposalInput(changed));
        assert.equal(replay.pending, 0);
        assert.equal(replay.financial_writes, 0);
        const decision = store.readSaveProposalDecisionState(proposalRef, { actorWhatsappId });
        assert.equal(decision.proposal_state, 'cancelled');
        assert.equal(decision.confirmation_state, 'declined');
    } finally {
        store.close();
        journal.close();
    }
});

test('9P.0 conflicting decisions roll back atomically and metadata corruption fails closed', () => {
    const databasePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-save-proposal-conflict-')),
        'preview.sqlite');
    const input = fixture();
    const store = openStore(databasePath);
    try {
        const collision = structuredClone(input);
        collision.lifecycleDecisions[1].provider_state = 'POSTED';
        collision.reconciliationDecisions[1].transaction_ref =
            collision.reconciliationDecisions[0].transaction_ref;
        assert.throws(() => store.ingestSaveProposals(proposalInput(collision)),
            /save_proposal_replay_conflict/);
        assert.equal(store.stats().save_proposals_total, 0);

        store.ingestSaveProposals(proposalInput(input));
        const [pending] = store.listPendingSaveProposals({ actorWhatsappId });
        store.db.prepare(`UPDATE open_finance_save_proposals SET created_at=?
            WHERE proposal_ref=?`).run('2026-07-23T11:01:00.000Z', pending.proposal_ref);
        assert.throws(() => store.readSaveProposalPrivate(pending.proposal_ref, { actorWhatsappId }),
            /save_proposal_metadata_mismatch/);
    } finally {
        store.close();
    }
});

test('OF-ALERT-BIND-01 duplicate stable source identity in one ingest rolls back atomically', () => {
    const databasePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(),
        'finbot-save-proposal-intraingest-identity-')), 'preview.sqlite');
    const input = fixture();
    const duplicate = structuredClone(input.item.transactions[0]);
    duplicate.account_id = 'moved-account';
    input.item.accounts.push({ id: duplicate.account_id, type: 'BANK' });
    input.item.transactions.push(duplicate);
    const duplicateObservationRef = observationRef(
        secret,
        input.item.id,
        duplicate.account_id,
        duplicate.id
    );
    input.reconciliationDecisions.push({
        alias: input.item.alias_code,
        observation_ref: duplicateObservationRef,
        transaction_ref: 'transaction-ref-purchase-posted-moved',
        status: 'new',
        rule: 'no_candidate'
    });
    input.lifecycleDecisions.push({
        observation_ref: duplicateObservationRef,
        classification: 'purchase',
        provider_state: 'POSTED'
    });

    const store = openStore(databasePath);
    try {
        assert.throws(() => store.ingestSaveProposals(proposalInput(input)),
            /save_proposal_replay_conflict/);
        assert.equal(store.stats().save_proposals_total, 0);
        assert.equal(store.stats().save_proposals_pending, 0);
    } finally {
        store.close();
    }
});

test('9P.0 persists only reconciled posted purchases and never reopens a cancelled proposal', () => {
    const databasePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-save-proposal-')), 'preview.sqlite');
    const input = fixture();
    const store = openStore(databasePath);
    try {
        const first = store.ingestSaveProposals({
            reconciliationDecisions: input.reconciliationDecisions,
            lifecycleDecisions: input.lifecycleDecisions,
            openFinanceItems: [input.item],
            policies: input.policies,
            observedAt: '2026-07-23T11:00:00.000Z'
        });
        assert.deepEqual(first, {
            inserted: 1,
            replayed: 0,
            blocked: 3,
            pending: 1,
            financial_writes: 0
        });
        const [pending] = store.listPendingSaveProposals({ actorWhatsappId });
        assert.match(pending.proposal_ref, /^[a-f0-9]{32}$/);
        const privateProposal = store.readSaveProposalPrivate(pending.proposal_ref, { actorWhatsappId });
        assert.equal(privateProposal.alias, 'daniel_nubank');
        assert.equal(privateProposal.classification, 'purchase');
        assert.equal(privateProposal.provider_state, 'POSTED');
        assert.equal(privateProposal.source.description, 'PRIVATE PROPOSAL DESCRIPTION');
        assert.match(privateProposal.operation_key, /^[a-f0-9]{48}$/);

        assert.deepEqual(store.cancelSaveProposal(pending.proposal_ref, { actorWhatsappId }), {
            cancelled: true,
            replay: false,
            financial_writes: 0
        });
        const replay = store.ingestSaveProposals({
            reconciliationDecisions: input.reconciliationDecisions,
            lifecycleDecisions: input.lifecycleDecisions,
            openFinanceItems: [input.item],
            policies: input.policies,
            observedAt: '2026-07-23T11:00:00.000Z'
        });
        assert.equal(replay.inserted, 0);
        assert.equal(replay.replayed, 1);
        assert.equal(store.listPendingSaveProposals({ actorWhatsappId }).length, 0);
        assert.equal(store.stats().save_proposals_cancelled, 1);
    } finally {
        store.close();
    }
});

test('9P.0 proposal payload is encrypted, actor-scoped, revocable and expires without extension on replay', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-save-proposal-private-'));
    const databasePath = path.join(directory, 'preview.sqlite');
    const input = fixture();
    let now = new Date('2026-07-23T12:00:00.000Z');
    let store = openStore(databasePath, () => now);
    try {
        store.ingestSaveProposals({
            reconciliationDecisions: input.reconciliationDecisions,
            lifecycleDecisions: input.lifecycleDecisions,
            openFinanceItems: [input.item],
            policies: input.policies,
            observedAt: '2026-07-23T11:00:00.000Z'
        });
        const [pending] = store.listPendingSaveProposals({ actorWhatsappId });
        assert.throws(() => store.readSaveProposalPrivate(pending.proposal_ref, {
            actorWhatsappId: 'outsider@c.us'
        }), /shadow_preview_actor_unauthorized/);
        const originalExpiry = pending.expires_at;
        now = new Date('2026-07-24T12:00:00.000Z');
        store.ingestSaveProposals({
            reconciliationDecisions: input.reconciliationDecisions,
            lifecycleDecisions: input.lifecycleDecisions,
            openFinanceItems: [input.item],
            policies: input.policies,
            observedAt: '2026-07-24T11:00:00.000Z'
        });
        assert.equal(store.listPendingSaveProposals({ actorWhatsappId })[0].expires_at, originalExpiry);
        assert.equal(store.revokeSourceAlias('daniel_nubank', { generation: 2 }).removed_save_proposals, 1);
        assert.equal(store.stats().save_proposals_total, 0);
    } finally {
        store.close();
    }

    const bytes = ['preview.sqlite', 'preview.sqlite-wal', 'preview.sqlite-shm']
        .filter(name => fs.existsSync(path.join(directory, name)))
        .map(name => fs.readFileSync(path.join(directory, name)))
        .reduce((combined, value) => Buffer.concat([combined, value]), Buffer.alloc(0))
        .toString('utf8');
    assert.doesNotMatch(bytes, /PRIVATE PROPOSAL DESCRIPTION|private-item-id|daniel_nubank|provider-purchase-posted/);

    now = new Date('2026-08-23T12:00:00.000Z');
    store = openStore(databasePath, () => now);
    try {
        assert.equal(store.stats().save_proposals_total, 0);
    } finally {
        store.close();
    }
});

test('9P.0 runtime creates shadow proposals without changing WhatsApp or financial writes', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-save-proposal-runtime-'));
    const files = Object.fromEntries([
        'credentials', 'mapping', 'visibility', 'evidence', 'secret',
        'vault', 'baseline', 'outbox', 'journal', 'preview'
    ].map(name => [
        name,
        path.join(directory, `${name}.${['vault', 'baseline', 'outbox', 'journal', 'preview'].includes(name)
            ? 'sqlite'
            : name === 'secret' ? 'txt' : 'json'}`)
    ]));
    fs.writeFileSync(files.credentials, JSON.stringify({ clientId: 'client', clientSecret: 'secret' }));
    fs.writeFileSync(files.mapping, JSON.stringify([{
        itemId: 'private-item-id',
        alias: 'daniel_nubank',
        ownerScope: 'daniel',
        generation: 2
    }]));
    fs.writeFileSync(files.visibility, JSON.stringify([{
        alias: 'daniel_nubank',
        source_owner: 'daniel',
        authorized_viewers: ['daniel'],
        whatsapp_recipient: 'daniel',
        family_aggregation_allowed: false,
        write_confirmation_principal: 'daniel'
    }]));
    fs.writeFileSync(files.evidence, JSON.stringify({
        route: 'meu_pluggy_connector_200',
        connector_id: 200,
        observed_cost_cents: 0,
        payment_method_registered: false,
        pro_features_required: false,
        update_item_enabled: false,
        category_source: 'financasbot_local'
    }));
    fs.writeFileSync(files.secret, secret);

    const baseItem = {
        ...fixture().item,
        availability: {
            accounts: 'available',
            transactions: 'available',
            bills: 'available',
            investments: 'available'
        },
        bills: [],
        investments: [],
        transactions: [transaction('old')]
    };
    const initial = {
        provider: 'pluggy',
        mode: 'live_readonly_staging',
        event_id: 'initial',
        observed_at: '2026-07-23T10:00:00.000Z',
        collection_health: { complete: true, warning_count: 0 },
        items: [baseItem]
    };
    const changed = {
        ...initial,
        event_id: 'changed',
        observed_at: '2026-07-23T11:00:00.000Z',
        items: [{ ...baseItem, transactions: [transaction('old'), transaction('purchase-posted')] }]
    };
    const vault = new OpenFinanceLiveStagingVault({ databasePath: files.vault, secret });
    const baseline = new OpenFinanceBaselineStore({ databasePath: files.baseline, secret });
    const outbox = new OpenFinanceAlertOutbox({ databasePath: files.outbox, secret });
    const journal = new OpenFinanceRevocationJournal({ databasePath: files.journal, secret });
    const preview = new OpenFinanceShadowPreviewStore({ databasePath: files.preview, secret });
    vault.ingestSnapshot(initial);
    baseline.ingestSnapshot(initial);
    preview.close();
    journal.close();
    outbox.close();
    baseline.close();
    vault.close();

    let apiCalls = 0;
    let currentSnapshot = changed;
    let messages = 0;
    class FakeApi {
        async readSnapshot() {
            apiCalls += 1;
            return currentSnapshot;
        }
    }
    const env = {
        OPEN_FINANCE_ALERT_MODE: 'shadow',
        OPEN_FINANCE_RECONCILIATION_MODE: 'canary',
        OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary',
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'shadow',
        OPEN_FINANCE_WRITE_MODE: 'off',
        OPEN_FINANCE_COMMERCIAL_EVIDENCE_FILE: files.evidence,
        PLUGGY_ITEM_MAP_FILE: files.mapping,
        OPEN_FINANCE_VISIBILITY_POLICY_FILE: files.visibility,
        PLUGGY_CREDENTIALS_FILE: files.credentials,
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: files.secret,
        OPEN_FINANCE_LIVE_STAGING_DB: files.vault,
        OPEN_FINANCE_BASELINE_DB: files.baseline,
        OPEN_FINANCE_OUTBOX_DB: files.outbox,
        OPEN_FINANCE_REVOCATION_JOURNAL_DB: files.journal,
        OPEN_FINANCE_SHADOW_PREVIEW_DB: files.preview
    };
    const conversationStates = new Map();
    const dependencies = {
        PluggyReadOnlyClient: FakeApi,
        userStateManager: {
            getState: actor => conversationStates.get(actor),
            setStateDurably: (actor, state) => conversationStates.set(actor, state)
        },
        getActiveUsers: async () => [{
            user_id: 'user-daniel',
            display_name: 'Daniel',
            whatsapp_id: actorWhatsappId,
            status: 'ACTIVE'
        }],
        readOpenFinanceInternalSource: async () => ({
            available: true,
            source_health: 'available',
            transactions: [],
            scope_coverage: { daniel_nubank: { card: true, account: true } },
            financial_writes: 0
        })
    };

    const result = await runOpenFinanceCanaryCycle({
        client: { sendMessage: async () => { messages += 1; } },
        env,
        dependencies
    });
    assert.equal(result.outcome, 'GO');
    assert.equal(result.save_proposals.mode, 'shadow');
    assert.equal(result.save_proposals.inserted, 1);
    assert.equal(result.save_proposals.pending, 1);
    assert.equal(result.financial_writes, 0);
    assert.equal(messages, 0);
    assert.equal(apiCalls, 1);

    const reopened = openStore(files.preview);
    try {
        assert.equal(reopened.listPendingSaveProposals({ actorWhatsappId }).length, 1);
    } finally {
        reopened.close();
    }

    for (const suffix of ['', '-wal', '-shm']) {
        fs.rmSync(`${files.outbox}${suffix}`, { force: true });
    }
    new OpenFinanceAlertOutbox({ databasePath: files.outbox, secret }).close();
    currentSnapshot = {
        ...changed,
        event_id: 'prompt-changed',
        observed_at: '2026-07-23T12:00:00.000Z',
        items: [{
            ...baseItem,
            transactions: [
                transaction('old'),
                transaction('purchase-posted'),
                transaction('purchase-prompt')
            ]
        }]
    };
    const deliveredPromptSnapshot = currentSnapshot;
    let promptText = '';
    const promptResult = await runOpenFinanceCanaryCycle({
        client: {
            sendMessage: async (_recipient, text) => {
                messages += 1;
                promptText = text;
                return { id: 'runtime-prompt-message-id' };
            }
        },
        env: {
            ...env,
            OPEN_FINANCE_ALERT_MODE: 'canary',
            OPEN_FINANCE_ALERT_CANARY_ALIAS: 'daniel_nubank',
            OPEN_FINANCE_ALERT_CANARY_ACTIVATIONS_JSON: JSON.stringify({
                daniel_nubank: '2026-07-23T11:30:00.000Z'
            }),
            OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
            OPEN_FINANCE_WRITE_MODE: 'confirm',
            OPEN_FINANCE_WRITE_APPROVED: 'true'
        },
        dependencies
    });
    assert.equal(promptResult.outcome, 'GO');
    assert.equal(promptResult.save_proposals.mode, 'prompt');
    assert.equal(promptResult.save_proposals.inserted, 1);
    assert.deepEqual(promptResult.deliveries, ['delivered_confirmed', 'idle']);
    assert.equal(promptResult.financial_writes, 0);
    assert.equal(messages, 1);
    assert.match(promptText, /^1\. /m);
    assert.match(promptText, /^2\. /m);
    assert.match(promptText, /salvar todas/i);
    assert.match(promptText, /Nada será salvo automaticamente/);
    const promptState = conversationStates.get(actorWhatsappId);
    assert.equal(promptState.action, 'awaiting_open_finance_save_selection');
    assert.equal(promptState.data.proposals.length, 2);
    assert.ok(promptState.data.proposals.every(item =>
        /^[a-f0-9]{32}$/.test(item.proposalRef)));
    assert.equal(Object.hasOwn(promptState.data, 'confirmationRef'), false);
    const reviewProposalRef = promptState.data.proposals[0].proposalRef;
    conversationStates.delete(actorWhatsappId);

    const reviewJournal = new OpenFinanceRevocationJournal({
        databasePath: files.journal,
        secret
    });
    const reviewPreview = new OpenFinanceShadowPreviewStore({
        databasePath: files.preview,
        secret,
        revocationJournal: reviewJournal,
        authorizedWhatsAppIds: [actorWhatsappId]
    });
    const reviewStore = new OpenFinanceSaveProposalReviewStore({
        databasePath: files.preview,
        secret,
        authorizedWhatsAppIds: [actorWhatsappId]
    });
    try {
        const proposal = reviewPreview.readReviewableSaveProposal(
            reviewProposalRef,
            { actorWhatsappId }
        );
        reviewStore.prepareReview({
            proposalRef: reviewProposalRef,
            proposal,
            actorWhatsappId,
            catalog: {
                people: [{ id: 'user-daniel', label: 'Daniel' }],
                categories: [],
                paymentMethods: [{ id: 'credit', label: 'Crédito', value: 'Crédito' }],
                financialAccounts: [],
                cards: []
            }
        });
    } finally {
        reviewStore.close();
        reviewPreview.close();
        reviewJournal.close();
    }
    currentSnapshot = {
        ...deliveredPromptSnapshot,
        event_id: 'prompt-review-active',
        observed_at: '2026-07-23T13:00:00.000Z',
        items: [{
            ...baseItem,
            transactions: [
                ...deliveredPromptSnapshot.items[0].transactions,
                transaction('purchase-blocked-by-review')
            ]
        }]
    };
    const blockedByReview = await runOpenFinanceCanaryCycle({
        client: { sendMessage: async () => { messages += 1; return { id: 'must-not-send' }; } },
        env: {
            ...env,
            OPEN_FINANCE_ALERT_MODE: 'canary',
            OPEN_FINANCE_ALERT_CANARY_ALIAS: 'daniel_nubank',
            OPEN_FINANCE_ALERT_CANARY_ACTIVATIONS_JSON: JSON.stringify({
                daniel_nubank: '2026-07-23T11:30:00.000Z'
            }),
            OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt'
        },
        dependencies
    });
    assert.deepEqual(blockedByReview.deliveries, ['idle']);
    assert.equal(messages, 1);

    await assert.rejects(() => runOpenFinanceCanaryCycle({
        client: { sendMessage: async () => { messages += 1; } },
        env: { ...env, OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'off' },
        dependencies
    }), /open_finance_save_proposal_preview_required/);
    assert.equal(apiCalls, 3);
    assert.equal(messages, 1);
});
