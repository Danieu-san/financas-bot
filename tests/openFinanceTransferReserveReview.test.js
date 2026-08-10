const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { analyzeOpenFinanceProactiveReviews } = require('../src/openFinance/openFinanceProactiveReview');
const { OpenFinanceProactiveReviewStore } = require('../src/openFinance/openFinanceProactiveReviewStore');
const {
    tryHandleOpenFinanceProactiveReviewReply,
    __test__: proactiveConversationTest
} = require('../src/openFinance/openFinanceProactiveReviewConversation');
const { OpenFinanceAlertOutbox } = require('../src/openFinance/openFinanceAlertOutbox');
const { formatCanaryMessage } = require('../src/openFinance/openFinanceWhatsappCanaryDelivery');

const secret = 'gate-37-transfer-reserve-review-secret';

function ref(kind, value) {
    return crypto.createHmac('sha256', secret).update(`${kind}:${value}`).digest('hex').slice(0, 32);
}

function tx(id, accountId, amountCents, description, extra = {}) {
    return {
        id, account_id: accountId, amount_cents: amountCents, description,
        date: '2026-08-10T10:00:00.000Z', status: 'POSTED', ...extra
    };
}

function item(alias, transactions, accounts) {
    return { id: `item-${alias}`, alias_code: alias, generation: 1, transactions, accounts };
}

function analyze(items, classifications) {
    const lifecycleDecisions = [];
    const reconciliationDecisions = [];
    for (const source of items) {
        for (const transaction of source.transactions) {
            const observation = ref('observation', `${source.id}:${transaction.account_id}:${transaction.id}`);
            lifecycleDecisions.push({
                observation_ref: observation,
                classification: classifications[transaction.id],
                provider_state: transaction.status
            });
            reconciliationDecisions.push({ observation_ref: observation, status: 'new' });
        }
    }
    return analyzeOpenFinanceProactiveReviews({
        items, lifecycleDecisions, reconciliationDecisions, secret
    });
}

test('gate 37 creates one review for a mutual strong bank pair', () => {
    const items = [
        item('daniel_nubank', [tx('out', 'daniel-bank', -10, 'Movimento A', {
            reference_number: 'provider-pair-1'
        })], [{ id: 'daniel-bank', type: 'BANK' }]),
        item('thais_nubank', [tx('in', 'thais-bank', 10, 'Movimento B', {
            reference_number: 'provider-pair-1'
        })], [{ id: 'thais-bank', type: 'BANK' }])
    ];
    const result = analyze(items, { out: 'purchase_candidate', in: 'income_candidate' });
    assert.equal(result.reviews.length, 1);
    assert.equal(result.reviews[0].review_kind, 'transfer');
    assert.equal(result.reviews[0].review_status, 'strong_pair_confirmation_required');
    assert.equal(result.reviews[0].pair_basis, 'shared_provider_reference');
    assert.match(result.reviews[0].pair_observation_ref, /^[a-f0-9]{32}$/);
    assert.equal(result.summary.transfer_pairs, 1);
    assert.equal(result.financial_writes, 0);
});

test('gate 37 never pairs bank legs by amount and date alone', () => {
    const items = [
        item('daniel_nubank', [tx('out', 'daniel-bank', -10, 'Envio familiar')],
            [{ id: 'daniel-bank', type: 'BANK' }]),
        item('thais_nubank', [tx('in', 'thais-bank', 10, 'Credito recebido')],
            [{ id: 'thais-bank', type: 'BANK' }])
    ];
    const result = analyze(items, { out: 'purchase_candidate', in: 'income_candidate' });
    assert.equal(result.reviews.length, 1);
    assert.equal(result.reviews[0].review_kind, 'transfer');
    assert.equal(result.reviews[0].review_status, 'unpaired_classification_required');
    assert.equal(result.reviews[0].pair_observation_ref, undefined);
    assert.equal(result.summary.transfer_pairs, 0);
});

test('gate 37 leaves a non-unique strong counterpart unpaired and reviewable', () => {
    const shared = { reference_number: 'provider-ambiguous' };
    const items = [
        item('daniel_nubank', [tx('out', 'daniel-bank', -100, 'A', shared)],
            [{ id: 'daniel-bank', type: 'BANK' }]),
        item('thais_nubank', [
            tx('in-1', 'thais-bank', 100, 'B', shared),
            tx('in-2', 'thais-savings', 100, 'C', shared)
        ], [{ id: 'thais-bank', type: 'BANK' }, { id: 'thais-savings', type: 'BANK' }])
    ];
    const result = analyze(items, {
        out: 'transfer', 'in-1': 'transfer', 'in-2': 'transfer'
    });
    assert.equal(result.reviews.some(review => review.pair_observation_ref), false);
    assert.equal(result.reviews.every(review => review.review_kind === 'transfer'), true);
    assert.equal(result.summary.transfer_pairs, 0);
});

test('gate 37 uses provider operation type for reserve semantics', () => {
    const bank = [{ id: 'daniel-bank', type: 'BANK' }];
    const source = item('daniel_nubank', [
        tx('apply', 'daniel-bank', -5000, 'Texto neutro', {
            operation_type: 'APLICACAO_FINANCEIRA'
        }),
        tx('redeem', 'daniel-bank', 4000, 'Texto neutro', {
            operation_type: 'RESGATE_APLIC_FINANCEIRA'
        }),
        tx('yield', 'daniel-bank', 100, 'Texto neutro', {
            operation_type: 'RENDIMENTO_APLIC_FINANCEIRA'
        })
    ], bank);
    const result = analyze([source], {
        apply: 'purchase_candidate', redeem: 'income_candidate', yield: 'income_candidate'
    });
    assert.deepEqual(result.reviews.map(review => review.suggested_decision).sort(), [
        'investment_income', 'reserve_application', 'reserve_redemption'
    ]);
    assert.equal(result.reviews.every(review => review.review_kind === 'reserve'), true);
    assert.equal(result.summary.reserve_reviews, 3);
});

test('gate 37 description alone opens review without choosing reserve semantics', () => {
    const source = item('daniel_nubank', [
        tx('generic', 'daniel-bank', -5000, 'Guardar na Caixinha')
    ], [{ id: 'daniel-bank', type: 'BANK' }]);
    const result = analyze([source], { generic: 'purchase_candidate' });
    assert.equal(result.reviews.length, 1);
    assert.equal(result.reviews[0].review_kind, 'reserve');
    assert.equal(result.reviews[0].review_status, 'reserve_semantic_classification_required');
    assert.equal(result.reviews[0].suggested_decision, undefined);
});

test('gate 37 generic provider investment type remains a classification review', () => {
    const source = item('daniel_nubank', [
        tx('generic-provider', 'daniel-bank', -5000, 'Texto neutro', {
            operation_type: 'INVESTIMENTO_MOVIMENTO'
        })
    ], [{ id: 'daniel-bank', type: 'BANK' }]);
    const result = analyze([source], { 'generic-provider': 'purchase_candidate' });
    assert.equal(result.reviews.length, 1);
    assert.equal(result.reviews[0].review_kind, 'reserve');
    assert.equal(result.reviews[0].review_status, 'provider_semantic_classification_required');
    assert.equal(result.reviews[0].suggested_decision, undefined);
});

test('gate 37 typed choices never collapse reserve principal and income', () => {
    const positiveTransfer = {
        review_code: 'a'.repeat(10), review_kind: 'transfer',
        review_status: 'unpaired_classification_required', source: { amount_cents: 100 }
    };
    const negativeTransfer = {
        ...positiveTransfer, source: { amount_cents: -100 }
    };
    assert.equal(proactiveConversationTest.decisionFor('resgate', positiveTransfer),
        'reserve_redemption');
    assert.equal(proactiveConversationTest.decisionFor('rendimento', positiveTransfer),
        'investment_income');
    assert.equal(proactiveConversationTest.decisionFor('aplicação', negativeTransfer),
        'reserve_application');
    assert.equal(proactiveConversationTest.decisionFor('reserva', positiveTransfer), null);
    assert.doesNotMatch(proactiveConversationTest.optionsFor(positiveTransfer), /\*reserva\*/i);
});

test('gate 37 outbox exposes one review identity for both family recipients of a strong pair', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-gate37-pair-outbox-'));
    const databasePath = path.join(directory, 'state.sqlite');
    const items = [
        item('daniel_nubank', [tx('out', 'daniel-bank', -10, 'Movimento A', {
            reference_number: 'provider-pair-outbox'
        })], [{ id: 'daniel-bank', type: 'BANK' }]),
        item('thais_nubank', [tx('in', 'thais-bank', 10, 'Movimento B', {
            reference_number: 'provider-pair-outbox'
        })], [{ id: 'thais-bank', type: 'BANK' }])
    ];
    const result = analyze(items, { out: 'purchase_candidate', in: 'income_candidate' });
    const storePolicies = [
        { alias: 'daniel_nubank', principal: 'daniel', recipients: ['daniel', 'thais'] },
        { alias: 'thais_nubank', principal: 'thais', recipients: ['daniel', 'thais'] }
    ];
    const actors = [
        { principal: 'daniel', whatsappId: '5511999999999@c.us' },
        { principal: 'thais', whatsappId: '5511888888888@c.us' }
    ];
    const outboxPolicies = storePolicies.map(policy => ({
        alias: policy.alias,
        source_owner: policy.principal,
        authorized_viewers: ['daniel', 'thais'],
        whatsapp_recipient: policy.principal,
        family_aggregation_allowed: true,
        write_confirmation_principal: policy.principal
    }));
    const lifecycleDecisions = [];
    const candidates = [];
    for (const source of items) {
        for (const transaction of source.transactions) {
            const observation = ref('observation', `${source.id}:${transaction.account_id}:${transaction.id}`);
            lifecycleDecisions.push({
                observation_ref: observation,
                classification: transaction.id === 'out' ? 'purchase_candidate' : 'income_candidate',
                provider_state: 'POSTED', lifecycle_milestone: 'first_posted'
            });
            candidates.push({ observation_ref: observation, external_event_ref: `event-${transaction.id}`,
                correlation_state: 'new_event', reconciliation_status: 'new' });
        }
    }
    const store = new OpenFinanceProactiveReviewStore({ databasePath, secret });
    const outbox = new OpenFinanceAlertOutbox({ databasePath, secret });
    try {
        const links = store.ingest({
            reviews: result.reviews, items, policies: storePolicies,
            confirmationActors: actors
        }).links;
        assert.equal(links.length, 1);
        outbox.enqueue({
            candidates, lifecycleDecisions, items, policies: outboxPolicies,
            baselineComplete: true, reconciliationRequired: true,
            semanticReviewLinks: links, semanticAnnotations: result.annotations
        });
        const deliveries = [];
        while (true) {
            const delivery = outbox.claimNext({
                canaryAliases: ['daniel_nubank', 'thais_nubank']
            });
            if (!delivery) break;
            deliveries.push(delivery);
            outbox.acknowledgeDelivered({
                alertRef: delivery.alert_ref,
                leaseToken: delivery.lease_token,
                whatsappMessageId: `message-${deliveries.length}`
            });
        }
        assert.equal(deliveries.length, 4);
        const actionable = deliveries.filter(delivery => delivery.semantic_review);
        assert.equal(actionable.length, 2);
        assert.equal(new Set(actionable.map(delivery =>
            delivery.semantic_review.review_code)).size, 1);
        assert.equal(actionable.every(delivery =>
            /revisar [a-f0-9]{10} confirmar/.test(formatCanaryMessage(delivery, 'Conta'))), true);
        assert.equal(deliveries.filter(delivery => !delivery.semantic_review).length, 2);
    } finally {
        store.close();
        outbox.close();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('gate 37 public review displays both legs before a transfer-pair decision', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-gate37-pair-command-'));
    const databasePath = path.join(directory, 'preview.sqlite');
    const secretPath = path.join(directory, 'secret.txt');
    fs.writeFileSync(secretPath, secret, { mode: 0o600 });
    const items = [
        item('daniel_nubank', [tx('out', 'daniel-bank', -10, 'Origem', {
            reference_number: 'provider-command-pair'
        })], [{ id: 'daniel-bank', type: 'BANK' }]),
        item('thais_nubank', [tx('in', 'thais-bank', 10, 'Destino', {
            reference_number: 'provider-command-pair'
        })], [{ id: 'thais-bank', type: 'BANK' }])
    ];
    const result = analyze(items, { out: 'purchase_candidate', in: 'income_candidate' });
    let code;
    const store = new OpenFinanceProactiveReviewStore({ databasePath, secret });
    try {
        code = store.ingest({
            reviews: result.reviews, items,
            policies: [
                { alias: 'daniel_nubank', principal: 'daniel', recipients: ['daniel', 'thais'] },
                { alias: 'thais_nubank', principal: 'thais', recipients: ['daniel', 'thais'] }
            ],
            confirmationActors: [
                { principal: 'daniel', whatsappId: '5511999999999@c.us' },
                { principal: 'thais', whatsappId: '5511888888888@c.us' }
            ]
        }).links[0].review_code;
    } finally { store.close(); }
    try {
        const opened = tryHandleOpenFinanceProactiveReviewReply({
            actorWhatsappId: '5511888888888@c.us', body: `revisar ${code}`,
            env: {
                OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
                OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: secretPath,
                OPEN_FINANCE_SHADOW_PREVIEW_DB: databasePath
            }
        });
        assert.equal(opened.handled, true);
        assert.match(opened.reply, /Outra ponta vinculada por referência forte/);
        assert.match(opened.reply, /Origem/);
        assert.match(opened.reply, /Destino/);
        assert.match(opened.reply, new RegExp(`revisar ${code} confirmar`));
        assert.equal(opened.financial_writes, 0);
        const decided = tryHandleOpenFinanceProactiveReviewReply({
            actorWhatsappId: '5511999999999@c.us', body: `revisar ${code} confirmar`,
            env: {
                OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
                OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: secretPath,
                OPEN_FINANCE_SHADOW_PREVIEW_DB: databasePath
            }
        });
        assert.equal(decided.decision, 'confirm_transfer_pair');
        assert.equal(decided.financial_writes, 0);
        const reopened = new OpenFinanceProactiveReviewStore({ databasePath, secret });
        try { assert.equal(reopened.stats().decided, 1); } finally { reopened.close(); }
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('gate 37 store and public command persist typed decisions with zero writes', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-gate37-review-'));
    const databasePath = path.join(directory, 'preview.sqlite');
    const secretPath = path.join(directory, 'secret.txt');
    fs.writeFileSync(secretPath, secret, { mode: 0o600 });
    const source = item('daniel_nubank', [tx('apply', 'daniel-bank', -5000, 'Texto neutro', {
        operation_type: 'APLICACAO_FINANCEIRA'
    })], [{ id: 'daniel-bank', type: 'BANK' }]);
    const result = analyze([source], { apply: 'purchase_candidate' });
    let code;
    try {
        const store = new OpenFinanceProactiveReviewStore({ databasePath, secret });
        try {
            code = store.ingest({
                reviews: result.reviews,
                items: [source],
                policies: [{ alias: 'daniel_nubank', principal: 'daniel', recipients: ['daniel'] }],
                confirmationActors: [{ principal: 'daniel', whatsappId: '5511999999999@c.us' }]
            }).links[0].review_code;
        } finally { store.close(); }
        const handled = tryHandleOpenFinanceProactiveReviewReply({
            actorWhatsappId: '5511999999999@c.us',
            body: `revisar ${code} confirmar`,
            env: {
                OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
                OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: secretPath,
                OPEN_FINANCE_SHADOW_PREVIEW_DB: databasePath
            }
        });
        assert.equal(handled.handled, true);
        assert.equal(handled.decision, 'reserve_application');
        assert.equal(handled.financial_writes, 0);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
