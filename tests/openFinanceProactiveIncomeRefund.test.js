const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    analyzeOpenFinanceProactiveReviews
} = require('../src/openFinance/openFinanceProactiveReview');
const {
    OpenFinanceProactiveReviewStore
} = require('../src/openFinance/openFinanceProactiveReviewStore');
const { OpenFinanceShadowPreviewStore } = require('../src/openFinance/openFinanceShadowPreviewStore');
const { OpenFinanceRevocationJournal } = require('../src/openFinance/openFinanceRevocationJournal');
const { OpenFinanceAlertOutbox } = require('../src/openFinance/openFinanceAlertOutbox');
const { OpenFinanceLiveStagingVault } = require('../src/openFinance/openFinanceLiveStagingVault');
const { OpenFinanceBaselineStore } = require('../src/openFinance/openFinanceBaselineStore');
const { runOpenFinanceCanaryCycle } = require('../src/openFinance/openFinanceCanaryRuntime');
const {
    formatCanaryMessage
} = require('../src/openFinance/openFinanceWhatsappCanaryDelivery');
const {
    tryHandleOpenFinanceProactiveReviewReply
} = require('../src/openFinance/openFinanceProactiveReviewConversation');

const secret = 'gate-36-proactive-review-secret-value';

function ref(kind, value) {
    return crypto.createHmac('sha256', secret)
        .update(`${kind}:${value}`)
        .digest('hex')
        .slice(0, 32);
}

function tx(id, accountId, amountCents, description, date, extra = {}) {
    return {
        id,
        provider_id: `provider-${id}`,
        account_id: accountId,
        amount_cents: amountCents,
        description,
        date,
        status: 'POSTED',
        ...extra
    };
}

function item(alias, transactions, accounts = [{ id: `${alias}-bank`, type: 'BANK' }]) {
    return {
        id: `item-${alias}`,
        alias_code: alias,
        generation: 1,
        accounts,
        transactions
    };
}

function decisions(items, classifications) {
    return items.flatMap(source => source.transactions.map(transaction => {
        const observationRef = ref('observation', `${source.id}:${transaction.account_id}:${transaction.id}`);
        return {
            observation_ref: observationRef,
            lifecycle: {
                observation_ref: observationRef,
                classification: classifications[transaction.id],
                provider_state: transaction.status,
                account_type: source.accounts.find(account => account.id === transaction.account_id).type
            },
            reconciliation: {
                observation_ref: observationRef,
                transaction_ref: ref('transaction', `${source.id}:${transaction.id}`),
                status: 'new',
                rule: 'no_candidate'
            }
        };
    }));
}

function analyze(items, classifications) {
    const rows = decisions(items, classifications);
    return analyzeOpenFinanceProactiveReviews({
        items,
        lifecycleDecisions: rows.map(row => row.lifecycle),
        reconciliationDecisions: rows.map(row => row.reconciliation),
        secret
    });
}

test('gate 37 preserves genuine income while promoting deferred transfers and reserves to review', () => {
    const danielAccount = 'daniel_nubank-bank';
    const thaisAccount = 'thais_nubank-bank';
    const items = [
        item('daniel_nubank', [
            tx('salary', danielAccount, 500000, 'Salário organização', '2026-08-08'),
            tx('transfer-out', danielAccount, -10, 'Envio familiar', '2026-08-08'),
            tx('reserve', danielAccount, 20000, 'Resgate Caixinha', '2026-08-08', {
                operation_type: 'RESGATE_APLIC_FINANCEIRA'
            })
        ]),
        item('thais_nubank', [
            tx('transfer-in', thaisAccount, 10, 'Crédito recebido', '2026-08-08')
        ])
    ];
    const result = analyze(items, {
        salary: 'income_candidate',
        'transfer-out': 'purchase_candidate',
        reserve: 'income_candidate',
        'transfer-in': 'income_candidate'
    });

    assert.equal(result.reviews.length, 3);
    assert.equal(result.reviews.find(row => row.observation_ref ===
        ref('observation', 'item-daniel_nubank:daniel_nubank-bank:salary')).review_kind, 'income');
    const reserveReview = result.reviews.find(row => row.observation_ref ===
        ref('observation', 'item-daniel_nubank:daniel_nubank-bank:reserve'));
    assert.equal(reserveReview.review_kind, 'reserve');
    assert.equal(reserveReview.suggested_decision, 'reserve_redemption');
    const transferReview = result.reviews.find(row => row.observation_ref ===
        ref('observation', 'item-thais_nubank:thais_nubank-bank:transfer-in'));
    assert.equal(transferReview.review_kind, 'transfer');
    assert.equal(transferReview.review_status, 'unpaired_classification_required');
    assert.deepEqual(result.annotations.map(row => row.status).sort(), [
        'reserve_review_required',
        'unpaired_transfer_review_required'
    ]);
    assert.equal(result.financial_writes, 0);
});

test('gate 36 does not mistake an equal debit in the same account for an internal transfer', () => {
    const accountId = 'daniel_nubank-bank';
    const source = item('daniel_nubank', [
        tx('income', accountId, 2000, 'Crédito recebido', '2026-08-09'),
        tx('expense', accountId, -2000, 'Compra mercado', '2026-08-09')
    ]);
    const result = analyze([source], {
        income: 'income_candidate',
        expense: 'purchase_candidate'
    });

    assert.equal(result.reviews.length, 1);
    assert.equal(result.reviews[0].review_kind, 'income');
    assert.equal(result.annotations.length, 0);
    assert.equal(result.financial_writes, 0);
});

test('gate 36 neutralizes one strongly paired refund when the purchase is still unsaved', () => {
    const accountId = 'thais_nubank-card';
    const items = [item('thais_nubank', [
        tx('purchase', accountId, 1199, 'Uber *Trip', '2026-08-09'),
        tx('refund', accountId, -1199, 'Estorno Uber Trip', '2026-08-09')
    ], [{ id: accountId, type: 'CREDIT' }])];
    const result = analyze(items, { purchase: 'purchase', refund: 'refund' });

    assert.equal(result.reviews.length, 0);
    assert.deepEqual(result.suppressed_purchase_observation_refs, [
        ref('observation', 'item-thais_nubank:thais_nubank-card:purchase')
    ]);
    assert.deepEqual(result.annotations.map(row => row.status).sort(), [
        'paired_refund_neutralized',
        'paired_unsaved_purchase_neutralized'
    ]);
    assert.equal(result.financial_writes, 0);
});

test('gate 36 keeps an unlinked refund reviewable but never marks it save-ready', () => {
    const accountId = 'daniel_nubank-card';
    const items = [item('daniel_nubank', [
        tx('refund', accountId, -4050, 'Estorno estabelecimento', '2026-08-09')
    ], [{ id: accountId, type: 'CREDIT' }])];
    const result = analyze(items, { refund: 'refund' });

    assert.equal(result.reviews.length, 1);
    assert.equal(result.reviews[0].review_kind, 'refund_link');
    assert.equal(result.reviews[0].review_status, 'link_required');
    assert.equal(result.reviews[0].save_eligible, false);
    assert.equal(result.financial_writes, 0);
});

test('gate 36 review store is encrypted, family-scoped, durable and terminal', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-gate36-review-'));
    const databasePath = path.join(directory, 'preview.sqlite');
    const source = item('daniel_nubank', [
        tx('salary', 'daniel_nubank-bank', 100000, 'Salário', '2026-08-09')
    ]);
    const result = analyze([source], { salary: 'income_candidate' });
    const input = {
        reviews: result.reviews,
        items: [source],
        policies: [{
            alias: 'daniel_nubank',
            principal: 'daniel',
            recipients: ['daniel', 'thais']
        }],
        confirmationActors: [
            { principal: 'daniel', whatsappId: '5511999999999@c.us' },
            { principal: 'thais', whatsappId: '5511888888888@c.us' }
        ],
        observedAt: '2026-08-09T15:00:00.000Z'
    };
    let code;
    let reviewRef;
    try {
        let store = new OpenFinanceProactiveReviewStore({
            databasePath,
            secret,
            clock: () => new Date('2026-08-09T15:00:00.000Z')
        });
        const first = store.ingest(input);
        assert.equal(first.inserted, 1);
        assert.equal(first.links.length, 1);
        ({ review_code: code, review_ref: reviewRef } = first.links[0]);
        assert.match(code, /^[a-f0-9]{10}$/);
        assert.doesNotMatch(fs.readFileSync(databasePath).toString('latin1'), /Salário/);
        assert.equal(store.ingest(input).replayed, 1);
        assert.throws(() => store.readPrivateByCode(code, {
            actorWhatsappId: '5511777777777@c.us'
        }), /proactive_review_actor_unauthorized/);
        store.close();

        store = new OpenFinanceProactiveReviewStore({
            databasePath,
            secret,
            clock: () => new Date('2026-08-09T15:01:00.000Z')
        });
        const privateReview = store.readPrivateByCode(code, {
            actorWhatsappId: '5511888888888@c.us'
        });
        assert.equal(privateReview.review_ref, reviewRef);
        assert.equal(privateReview.review_kind, 'income');
        assert.deepEqual(store.decideByCode(code, 'income', {
            actorWhatsappId: '5511888888888@c.us'
        }), {
            decided: true,
            replay: false,
            review_ref: reviewRef,
            decision: 'income',
            financial_writes: 0
        });
        assert.equal(store.decideByCode(code, 'income', {
            actorWhatsappId: '5511888888888@c.us'
        }).replay, true);
        assert.throws(() => store.decideByCode(code, 'reserve', {
            actorWhatsappId: '5511999999999@c.us'
        }), /proactive_review_decision_conflict/);
        assert.equal(store.stats().decided, 1);
        store.close();
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('gate 36 neutralization durably cancels an earlier pending purchase proposal', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-gate36-neutralize-'));
    const databasePath = path.join(directory, 'preview.sqlite');
    const journalPath = path.join(directory, 'journal.sqlite');
    const accountId = 'daniel_nubank-card';
    const purchase = tx('purchase', accountId, 1199, 'Uber Trip', '2026-08-09');
    const source = item('daniel_nubank', [purchase], [{ id: accountId, type: 'CREDIT' }]);
    const observation = ref('observation', `item-daniel_nubank:${accountId}:purchase`);
    const reconciliationDecisions = [{
        observation_ref: observation,
        transaction_ref: ref('transaction', 'item-daniel_nubank:purchase'),
        status: 'new',
        rule: 'no_candidate'
    }];
    const lifecycleDecisions = [{
        observation_ref: observation,
        classification: 'purchase',
        provider_state: 'POSTED'
    }];
    const journal = new OpenFinanceRevocationJournal({ databasePath: journalPath, secret });
    const store = new OpenFinanceShadowPreviewStore({
        databasePath,
        secret,
        revocationJournal: journal,
        authorizedWhatsAppIds: ['5511999999999@c.us'],
        clock: () => new Date('2026-08-09T15:00:00.000Z')
    });
    try {
        assert.equal(store.ingestSaveProposals({
            reconciliationDecisions,
            lifecycleDecisions,
            openFinanceItems: [source],
            policies: [{ alias: 'daniel_nubank', write_confirmation_principal: 'daniel' }],
            observedAt: '2026-08-09T14:59:00.000Z'
        }).inserted, 1);
        const neutralized = store.ingestSaveProposals({
            reconciliationDecisions,
            lifecycleDecisions,
            openFinanceItems: [source],
            policies: [{ alias: 'daniel_nubank', write_confirmation_principal: 'daniel' }],
            observedAt: '2026-08-09T14:59:00.000Z',
            suppressedObservationRefs: [observation]
        });
        assert.equal(neutralized.invalidated, 1);
        assert.equal(neutralized.pending, 0);
        assert.equal(store.stats().save_proposals_cancelled, 1);
        assert.equal(neutralized.financial_writes, 0);
    } finally {
        store.close();
        journal.close();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('gate 36 detects a pending purchase from a prior cycle before neutralizing its refund', () => {
    const accountId = 'daniel_nubank-card';
    const source = item('daniel_nubank', [
        tx('purchase', accountId, 1199, 'Uber Trip', '2026-08-08'),
        tx('refund', accountId, -1199, 'Estorno Uber Trip', '2026-08-09')
    ], [{ id: accountId, type: 'CREDIT' }]);
    const rows = decisions([source], { purchase: 'purchase', refund: 'refund' });
    const purchaseObservation = rows.find(row =>
        row.lifecycle.classification === 'purchase').lifecycle.observation_ref;
    const refundRow = rows.find(row => row.lifecycle.classification === 'refund');
    const result = analyzeOpenFinanceProactiveReviews({
        items: [source],
        lifecycleDecisions: rows.map(row => row.lifecycle),
        reconciliationDecisions: [refundRow.reconciliation],
        pendingPurchaseObservationRefs: [purchaseObservation],
        secret
    });
    assert.deepEqual(result.suppressed_purchase_observation_refs, [purchaseObservation]);
    assert.equal(result.reviews.length, 0);
    assert.equal(result.summary.suppressed_purchases, 1);
    assert.equal(result.financial_writes, 0);
});

test('gate 36 expiry removes the encrypted payload and rejects late review', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-gate36-expiry-'));
    const databasePath = path.join(directory, 'preview.sqlite');
    const source = item('daniel_nubank', [
        tx('salary', 'daniel_nubank-bank', 100000, 'Salário', '2026-07-01')
    ]);
    const result = analyze([source], { salary: 'income_candidate' });
    let current = new Date('2026-07-01T00:01:00.000Z');
    const store = new OpenFinanceProactiveReviewStore({
        databasePath,
        secret,
        retentionDays: 7,
        clock: () => current
    });
    try {
        const ingested = store.ingest({
            reviews: result.reviews,
            items: [source],
            policies: [{ alias: 'daniel_nubank', principal: 'daniel', recipients: ['daniel'] }],
            confirmationActors: [{ principal: 'daniel', whatsappId: '5511999999999@c.us' }],
            observedAt: '2026-07-01T00:00:00.000Z'
        });
        assert.equal(ingested.pending, 1);
        current = new Date('2026-07-09T00:00:00.000Z');
        assert.throws(() => store.readPrivateByCode(ingested.links[0].review_code, {
            actorWhatsappId: '5511999999999@c.us'
        }), /proactive_review_not_pending/);
        const raw = store.db.prepare(`SELECT encrypted_payload,payload_version,review_state
            FROM open_finance_proactive_reviews`).get();
        assert.deepEqual(raw, { encrypted_payload: null, payload_version: null,
            review_state: 'expired' });
        assert.equal(store.stats().expired, 1);
    } finally {
        store.close();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('gate 36 rejects an observation that was already expired before ingest', () => {
    const source = item('daniel_nubank', [
        tx('salary', 'daniel_nubank-bank', 100000, 'Salário', '2026-07-01')
    ]);
    const result = analyze([source], { salary: 'income_candidate' });
    const store = new OpenFinanceProactiveReviewStore({
        secret,
        retentionDays: 7,
        clock: () => new Date('2026-07-09T00:00:00.000Z')
    });
    try {
        assert.throws(() => store.ingest({
            reviews: result.reviews,
            items: [source],
            policies: [{ alias: 'daniel_nubank', principal: 'daniel', recipients: ['daniel'] }],
            confirmationActors: [{ principal: 'daniel', whatsappId: '5511999999999@c.us' }],
            observedAt: '2026-07-01T00:00:00.000Z'
        }), /proactive_review_observation_expired/);
        assert.equal(store.stats().total, 0);
    } finally {
        store.close();
    }
});

test('gate 36 expiry removes a decided payload while retaining terminal metadata', () => {
    const source = item('daniel_nubank', [
        tx('salary', 'daniel_nubank-bank', 100000, 'Salario', '2026-07-01')
    ]);
    const result = analyze([source], { salary: 'income_candidate' });
    let current = new Date('2026-07-01T00:01:00.000Z');
    const store = new OpenFinanceProactiveReviewStore({
        secret,
        retentionDays: 7,
        clock: () => current
    });
    try {
        const code = store.ingest({
            reviews: result.reviews,
            items: [source],
            policies: [{ alias: 'daniel_nubank', principal: 'daniel', recipients: ['daniel'] }],
            confirmationActors: [{ principal: 'daniel', whatsappId: '5511999999999@c.us' }],
            observedAt: '2026-07-01T00:00:00.000Z'
        }).links[0].review_code;
        assert.equal(store.decideByCode(code, 'income', {
            actorWhatsappId: '5511999999999@c.us'
        }).decided, true);
        current = new Date('2026-07-09T00:00:00.000Z');
        assert.deepEqual(store.purgeExpired(), { expired: 1, financial_writes: 0 });
        const raw = store.db.prepare(`SELECT encrypted_payload,payload_version,review_state,
            decision,decided_by_ref FROM open_finance_proactive_reviews`).get();
        assert.equal(raw.encrypted_payload, null);
        assert.equal(raw.payload_version, null);
        assert.equal(raw.review_state, 'expired');
        assert.equal(raw.decision, 'income');
        assert.match(raw.decided_by_ref, /^[a-f0-9]{32}$/);
        assert.throws(() => store.readPrivateByCode(code, {
            actorWhatsappId: '5511999999999@c.us'
        }), /proactive_review_not_pending/);
    } finally {
        store.close();
    }
});

test('gate 36 outbox binds one actionable semantic review without creating a save proposal', () => {
    const accountId = 'daniel_nubank-bank';
    const source = item('daniel_nubank', [
        tx('salary', accountId, 100000, 'Salário', '2026-08-09')
    ]);
    const observation = ref('observation', `item-daniel_nubank:${accountId}:salary`);
    const outbox = new OpenFinanceAlertOutbox({ secret });
    try {
        const queued = outbox.enqueue({
            candidates: [{ observation_ref: observation, external_event_ref: 'event-salary',
                correlation_state: 'new_event', reconciliation_status: 'new' }],
            lifecycleDecisions: [{ observation_ref: observation,
                classification: 'income_candidate', provider_state: 'POSTED',
                lifecycle_milestone: 'first_posted' }],
            items: [source],
            policies: [{ alias: 'daniel_nubank', source_owner: 'daniel',
                authorized_viewers: ['daniel'], whatsapp_recipient: 'daniel',
                family_aggregation_allowed: false, write_confirmation_principal: 'daniel' }],
            baselineComplete: true,
            reconciliationRequired: true,
            semanticReviewLinks: [{
                observation_ref: observation,
                review_ref: 'a'.repeat(32),
                review_code: 'b'.repeat(10),
                principal: 'daniel',
                review_kind: 'income',
                review_status: 'classification_required'
            }]
        });
        assert.equal(queued.inserted, 1);
        const delivery = outbox.claimNext({ canaryAlias: 'daniel_nubank' });
        assert.equal(delivery.proposal_ref, undefined);
        assert.deepEqual(delivery.semantic_review, {
            review_code: 'b'.repeat(10),
            review_kind: 'income',
            review_status: 'classification_required'
        });
        const message = formatCanaryMessage(delivery, 'Nubank Daniel');
        assert.match(message, /revisar bbbbbbbbbb entrada/);
        assert.match(message, /transferência/);
        assert.match(message, /resgate/);
        assert.match(message, /rendimento/);
        assert.doesNotMatch(message, /salvar/i);
    } finally {
        outbox.close();
    }
});

test('gate 36 public review command is explicit, durable and never writes', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-gate36-command-'));
    const databasePath = path.join(directory, 'preview.sqlite');
    const secretPath = path.join(directory, 'secret.txt');
    fs.writeFileSync(secretPath, secret, { mode: 0o600 });
    const source = item('daniel_nubank', [
        tx('salary', 'daniel_nubank-bank', 100000, 'Salário', '2026-08-09')
    ]);
    const result = analyze([source], { salary: 'income_candidate' });
    const store = new OpenFinanceProactiveReviewStore({
        databasePath,
        secret,
        clock: () => new Date('2026-08-09T15:00:00.000Z')
    });
    let code;
    try {
        code = store.ingest({
            reviews: result.reviews,
            items: [source],
            policies: [{ alias: 'daniel_nubank', principal: 'daniel',
                recipients: ['daniel', 'thais'] }],
            confirmationActors: [
                { principal: 'daniel', whatsappId: '5511999999999@c.us' },
                { principal: 'thais', whatsappId: '5511888888888@c.us' }
            ],
            observedAt: '2026-08-09T15:00:00.000Z'
        }).links[0].review_code;
    } finally {
        store.close();
    }
    const env = {
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: secretPath,
        OPEN_FINANCE_SHADOW_PREVIEW_DB: databasePath
    };
    try {
        const opened = tryHandleOpenFinanceProactiveReviewReply({
            actorWhatsappId: '5511999999999@c.us',
            body: `revisar ${code}`,
            env
        });
        assert.equal(opened.handled, true);
        assert.match(opened.reply, /revisar .* entrada/);
        const decided = tryHandleOpenFinanceProactiveReviewReply({
            actorWhatsappId: '5511888888888@c.us',
            body: `revisar ${code} entrada`,
            env
        });
        assert.equal(decided.handled, true);
        assert.equal(decided.decision, 'income');
        assert.equal(decided.financial_writes, 0);
        assert.match(decided.reply, /registrada para futura conferência/i);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('gate 36 public review command reports expiry without falling through to writers', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-gate36-expired-command-'));
    const secretPath = path.join(directory, 'secret.txt');
    fs.writeFileSync(secretPath, secret, { mode: 0o600 });
    class ExpiredStore {
        readPrivateByCode() {
            throw new Error('open_finance_proactive_review_not_pending');
        }
        close() {}
    }
    try {
        const result = tryHandleOpenFinanceProactiveReviewReply({
            actorWhatsappId: '5511999999999@c.us',
            body: 'revisar aaaaaaaaaa entrada',
            env: {
                OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
                OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: secretPath,
                OPEN_FINANCE_SHADOW_PREVIEW_DB: path.join(directory, 'preview.sqlite')
            },
            dependencies: { OpenFinanceProactiveReviewStore: ExpiredStore }
        });
        assert.equal(result.handled, true);
        assert.equal(result.financial_writes, 0);
        assert.match(result.reply, /expirou/i);
        assert.match(result.reply, /Nada foi salvo/i);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('gate 37 real canary runtime persists income and reserve reviews with zero writes', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-gate36-runtime-'));
    const names = ['credentials', 'mapping', 'visibility', 'evidence', 'secret',
        'vault', 'baseline', 'outbox', 'journal', 'preview'];
    const files = Object.fromEntries(names.map(name => [name, path.join(directory,
        `${name}.${['vault', 'baseline', 'outbox', 'journal', 'preview'].includes(name)
            ? 'sqlite' : name === 'secret' ? 'txt' : 'json'}`)]));
    fs.writeFileSync(files.credentials, JSON.stringify({ clientId: 'client', clientSecret: 'secret' }));
    fs.writeFileSync(files.mapping, JSON.stringify([{
        itemId: 'item-daniel_nubank', alias: 'daniel_nubank', ownerScope: 'daniel', generation: 1
    }]));
    fs.writeFileSync(files.visibility, JSON.stringify([{
        alias: 'daniel_nubank', source_owner: 'daniel', authorized_viewers: ['daniel'],
        whatsapp_recipient: 'daniel', family_aggregation_allowed: false,
        write_confirmation_principal: 'daniel'
    }]));
    fs.writeFileSync(files.evidence, JSON.stringify({
        route: 'meu_pluggy_connector_200', connector_id: 200, observed_cost_cents: 0,
        payment_method_registered: false, pro_features_required: false,
        update_item_enabled: false, category_source: 'financasbot_local'
    }));
    fs.writeFileSync(files.secret, secret);
    const accountId = 'daniel_nubank-bank';
    const old = tx('old', accountId, -500, 'Compra antiga', '2026-08-08');
    const salary = tx('salary', accountId, 100000, 'Salário organização', '2026-08-09');
    const reserve = tx('reserve', accountId, -5000, 'Texto neutro', '2026-08-09', {
        operation_type: 'APLICACAO_FINANCEIRA'
    });
    const baseItem = {
        ...item('daniel_nubank', [old]),
        owner_scope: 'daniel',
        availability: { accounts: 'available', transactions: 'available',
            bills: 'available', investments: 'available' },
        bills: [], investments: []
    };
    const initial = {
        provider: 'pluggy', mode: 'live_readonly_staging', event_id: 'initial',
        observed_at: '2026-08-09T14:00:00.000Z',
        collection_health: { complete: true, warning_count: 0 }, items: [baseItem]
    };
    const changed = {
        ...initial, event_id: 'changed', observed_at: '2026-08-09T15:00:00.000Z',
        items: [{ ...baseItem, transactions: [old, salary, reserve] }]
    };
    const stores = [
        new OpenFinanceLiveStagingVault({ databasePath: files.vault, secret }),
        new OpenFinanceBaselineStore({ databasePath: files.baseline, secret }),
        new OpenFinanceAlertOutbox({ databasePath: files.outbox, secret }),
        new OpenFinanceRevocationJournal({ databasePath: files.journal, secret }),
        new OpenFinanceShadowPreviewStore({ databasePath: files.preview, secret })
    ];
    stores[0].ingestSnapshot(initial);
    stores[1].ingestSnapshot(initial);
    stores.forEach(store => store.close());
    class FakeApi {
        async readSnapshot() { return changed; }
    }
    const sentTexts = [];
    const env = {
        OPEN_FINANCE_ALERT_MODE: 'canary',
        OPEN_FINANCE_ALERT_CANARY_ALIAS: 'daniel_nubank',
        OPEN_FINANCE_ALERT_CANARY_ACTIVATIONS_JSON: JSON.stringify({
            daniel_nubank: '2026-08-09T14:30:00.000Z'
        }),
        OPEN_FINANCE_RECONCILIATION_MODE: 'canary',
        OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary',
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
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
    try {
        const result = await runOpenFinanceCanaryCycle({
            client: { sendMessage: async (_to, text) => {
                sentTexts.push(text);
                return { id: 'gate36-message-id' };
            } },
            env,
            dependencies: {
                PluggyReadOnlyClient: FakeApi,
                userStateManager: { getState: () => null, setStateDurably: () => {
                    throw new Error('semantic review must not bind ambiguous yes state');
                } },
                getActiveUsers: async () => [{ user_id: 'user-daniel', display_name: 'Daniel',
                    whatsapp_id: '5511999999999@c.us', status: 'ACTIVE' }],
                readOpenFinanceInternalSource: async () => ({
                    available: true, source_health: 'available', transactions: [],
                    scope_coverage: { daniel_nubank: { card: true, account: true } },
                    financial_writes: 0
                })
            }
        });
        assert.equal(result.outcome, 'GO');
        assert.equal(result.save_proposals.inserted, 0);
        assert.equal(result.proactive_reviews.store.inserted, 2);
        assert.equal(result.proactive_reviews.summary.reviewable, 2);
        assert.equal(result.proactive_reviews.summary.reserve_reviews, 1);
        assert.equal(sentTexts.some(text => /revisar [a-f0-9]{10} entrada/.test(text)), true);
        assert.equal(sentTexts.some(text => /provedor sinalizou aplicação em reserva/i.test(text)), true);
        assert.equal(sentTexts.some(text => /revisar [a-f0-9]{10} confirmar/.test(text)), true);
        assert.equal(result.financial_writes, 0);
        const reviewStore = new OpenFinanceProactiveReviewStore({
            databasePath: files.preview, secret
        });
        try {
            assert.equal(reviewStore.stats().pending, 2);
        } finally {
            reviewStore.close();
        }
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
