'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    OpenFinanceHistoricalAmbiguityReviewStore,
    buildOpenFinanceHistoricalAmbiguityReview,
    handleOpenFinanceHistoricalAmbiguityReviewReply,
    readOpenFinanceHistoricalAmbiguityReviewPrivate
} = require('../src/openFinance/openFinanceHistoricalAmbiguityReview');
const {
    CANONICAL_HISTORICAL_RX_INVENTORY,
    buildOpenFinanceHistoricalRx
} = require('../src/openFinance/openFinanceHistoricalRx');

const SECRET = 'historical-ambiguity-review-secret-2026';
const DANIEL = '5511999999999@c.us';
const THAIS = '5511888888888@c.us';

function ref(kind, value) {
    return crypto.createHmac('sha256', SECRET)
        .update(`${kind}:${value}`)
        .digest('hex')
        .slice(0, 32);
}

function fixture() {
    const alias = 'family_source';
    const creditId = 'credit-private-id';
    const bankId = 'bank-private-id';
    const groupingBasis = ['Compra parcelada', '2025-07-10', 5000, 3].join(':');
    const seriesRef = ref('historical_rx_installment', `${alias}:${creditId}:${groupingBasis}`);
    const creditSegmentRef = ref('historical_rx_segment', `${alias}:${creditId}`);
    const bankSegmentRef = ref('historical_rx_segment', `${alias}:${bankId}`);
    return {
        items: [{
            alias_code: alias,
            owner_scope: 'family',
            availability: { accounts: 'available', transactions: 'available' },
            accounts: [
                { id: creditId, type: 'CREDIT' },
                { id: bankId, type: 'BANK' }
            ],
            transactions: [
                {
                    id: 'installment-private-a', account_id: creditId,
                    description: 'Compra parcelada', original_date: '2025-07-10',
                    date: '2025-08-10T12:00:00.000Z', amount_cents: 5000,
                    installment_number: 2, total_installments: 3,
                    bill_forecast_month: '2025-08', status: 'POSTED'
                },
                {
                    id: 'installment-private-b', account_id: creditId,
                    description: 'Compra parcelada', original_date: '2025-07-10',
                    date: '2025-08-11T12:00:00.000Z', amount_cents: 5000,
                    installment_number: 2, total_installments: 3,
                    bill_forecast_month: '2025-08', status: 'POSTED'
                },
                {
                    id: 'investment-private-a', account_id: bankId,
                    description: 'Movimento patrimonial', date: '2025-08-12T12:00:00.000Z',
                    amount_cents: -2000, operation_type: 'INVESTIMENTO', status: 'POSTED'
                }
            ]
        }],
        historicalRx: {
            schema_version: 1,
            financial_writes: 0,
            blockers: [
                `${alias}:installment_series_ambiguous`,
                `${alias}:investment_movement_semantics_ambiguous`
            ],
            segments: [
                {
                    source_alias: alias,
                    segment_ref: creditSegmentRef,
                    product: 'credit_card',
                    installments: {
                        series: [{
                            series_ref: seriesRef,
                            duplicate_numbers: [2],
                            identity_status: 'ambiguous_duplicate_installment_number'
                        }]
                    },
                    investment_movements: { semantically_ambiguous_count: null }
                },
                {
                    source_alias: alias,
                    segment_ref: bankSegmentRef,
                    product: 'bank_account',
                    installments: { series: [] },
                    investment_movements: {
                        status: 'provider_labeled_with_ambiguous_semantics',
                        semantically_ambiguous_count: 1
                    }
                }
            ]
        }
    };
}

test('builds an encrypted shared numbered inbox without exposing private rows', () => {
    const built = buildOpenFinanceHistoricalAmbiguityReview({
        ...fixture(),
        secret: SECRET,
        familyScope: 'family',
        authorizedWhatsAppIds: [DANIEL, THAIS],
        clock: () => new Date('2026-08-05T12:00:00.000Z')
    });

    assert.equal(built.pending_count, 2);
    assert.equal(built.financial_writes, 0);
    assert.match(built.reply, /1\./);
    assert.match(built.reply, /2\./);
    assert.match(built.reply, /Responda com o número/i);
    assert.doesNotMatch(JSON.stringify(built), /Compra parcelada|Movimento patrimonial|private-id/);
    assert.doesNotMatch(built.sealed_state, /installment-private|investment-private/);

    const daniel = readOpenFinanceHistoricalAmbiguityReviewPrivate({
        sealedState: built.sealed_state,
        secret: SECRET,
        actorWhatsappId: DANIEL,
        clock: () => new Date('2026-08-05T12:01:00.000Z')
    });
    const thais = readOpenFinanceHistoricalAmbiguityReviewPrivate({
        sealedState: built.sealed_state,
        secret: SECRET,
        actorWhatsappId: THAIS,
        clock: () => new Date('2026-08-05T12:01:00.000Z')
    });
    assert.equal(daniel.pending_count, 2);
    assert.equal(thais.review_ref, daniel.review_ref);
    assert.equal(daniel.financial_writes, 0);
});

test('rejects generic yes and resolves installment identity only by numbered choice', () => {
    const built = buildOpenFinanceHistoricalAmbiguityReview({
        ...fixture(), secret: SECRET, familyScope: 'family',
        authorizedWhatsAppIds: [DANIEL, THAIS]
    });
    const generic = handleOpenFinanceHistoricalAmbiguityReviewReply({
        sealedState: built.sealed_state, secret: SECRET,
        actorWhatsappId: DANIEL, body: 'sim'
    });
    assert.equal(generic.handled, true);
    assert.equal(generic.state, 'awaiting_item_number');
    assert.match(generic.reply, /não resolve ambiguidades/i);
    assert.equal(generic.financial_writes, 0);

    const selected = handleOpenFinanceHistoricalAmbiguityReviewReply({
        sealedState: generic.sealed_state, secret: SECRET,
        actorWhatsappId: DANIEL, body: '1'
    });
    assert.equal(selected.state, 'awaiting_resolution_number');
    assert.match(selected.reply, /1\. São lançamentos distintos/i);
    assert.match(selected.reply, /2\. Somente o registro 1/i);
    assert.match(selected.reply, /3\. Somente o registro 2/i);
    assert.match(selected.reply, /4\. Nenhum dos registros/i);
    assert.match(selected.reply, /Nada foi salvo/i);

    const otherActor = handleOpenFinanceHistoricalAmbiguityReviewReply({
        sealedState: selected.sealed_state, secret: SECRET,
        actorWhatsappId: THAIS, body: '2'
    });
    assert.equal(otherActor.state, 'awaiting_resolution_number');
    assert.match(otherActor.reply, /Movimento de investimento sem natureza definida/i);

    const resolved = handleOpenFinanceHistoricalAmbiguityReviewReply({
        sealedState: otherActor.sealed_state, secret: SECRET,
        actorWhatsappId: DANIEL, body: '2'
    });
    assert.equal(resolved.state, 'awaiting_item_number');
    assert.equal(resolved.pending_count, 1);
    assert.match(resolved.reply, /decisão familiar registrada/i);
    assert.equal(resolved.financial_writes, 0);
});

test('requires an explicit numbered semantic classification and survives resealing', () => {
    const built = buildOpenFinanceHistoricalAmbiguityReview({
        ...fixture(), secret: SECRET, familyScope: 'family',
        authorizedWhatsAppIds: [DANIEL, THAIS]
    });
    const selectInstallment = handleOpenFinanceHistoricalAmbiguityReviewReply({
        sealedState: built.sealed_state, secret: SECRET,
        actorWhatsappId: DANIEL, body: '1'
    });
    const resolveInstallment = handleOpenFinanceHistoricalAmbiguityReviewReply({
        sealedState: selectInstallment.sealed_state, secret: SECRET,
        actorWhatsappId: DANIEL, body: '1'
    });
    const selectInvestment = handleOpenFinanceHistoricalAmbiguityReviewReply({
        sealedState: resolveInstallment.sealed_state, secret: SECRET,
        actorWhatsappId: THAIS, body: '1'
    });
    assert.match(selectInvestment.reply, /1\. Aplicação em reserva/i);
    assert.match(selectInvestment.reply, /2\. Não é movimento de investimento/i);
    assert.doesNotMatch(selectInvestment.reply, /Resgate de reserva|Rendimento/i);

    const resolved = handleOpenFinanceHistoricalAmbiguityReviewReply({
        sealedState: selectInvestment.sealed_state, secret: SECRET,
        actorWhatsappId: THAIS, body: '2'
    });
    assert.equal(resolved.state, 'reviewed');
    assert.equal(resolved.pending_count, 0);
    assert.match(resolved.reply, /revisão concluída/i);
    assert.match(resolved.reply, /Nenhum lançamento foi salvo/i);
    assert.equal(resolved.financial_writes, 0);

    const reopened = readOpenFinanceHistoricalAmbiguityReviewPrivate({
        sealedState: resolved.sealed_state, secret: SECRET,
        actorWhatsappId: DANIEL
    });
    assert.equal(reopened.state, 'reviewed');
    assert.equal(reopened.decisions.length, 2);
    assert.equal(reopened.financial_writes, 0);
});

test('offers only direction-compatible investment semantics', () => {
    const positive = fixture();
    positive.items[0].transactions.find(transaction => transaction.id === 'investment-private-a')
        .amount_cents = 2000;
    const built = buildOpenFinanceHistoricalAmbiguityReview({
        ...positive, secret: SECRET, familyScope: 'family',
        authorizedWhatsAppIds: [DANIEL, THAIS]
    });
    const selectInstallment = handleOpenFinanceHistoricalAmbiguityReviewReply({
        sealedState: built.sealed_state, secret: SECRET,
        actorWhatsappId: DANIEL, body: '1'
    });
    const resolveInstallment = handleOpenFinanceHistoricalAmbiguityReviewReply({
        sealedState: selectInstallment.sealed_state, secret: SECRET,
        actorWhatsappId: DANIEL, body: '1'
    });
    const selectInvestment = handleOpenFinanceHistoricalAmbiguityReviewReply({
        sealedState: resolveInstallment.sealed_state, secret: SECRET,
        actorWhatsappId: THAIS, body: '1'
    });
    assert.match(selectInvestment.reply, /1\. Resgate de reserva/i);
    assert.match(selectInvestment.reply, /2\. Rendimento/i);
    assert.match(selectInvestment.reply, /3\. Não é movimento de investimento/i);
    assert.doesNotMatch(selectInvestment.reply, /Aplicação em reserva/i);
});

test('fails closed for outsider, tampering, expiry and RX without supported ambiguity', () => {
    const built = buildOpenFinanceHistoricalAmbiguityReview({
        ...fixture(), secret: SECRET, familyScope: 'family',
        authorizedWhatsAppIds: [DANIEL, THAIS],
        clock: () => new Date('2026-08-05T12:00:00.000Z'),
        ttlMs: 60_000
    });
    assert.throws(() => readOpenFinanceHistoricalAmbiguityReviewPrivate({
        sealedState: built.sealed_state, secret: SECRET,
        actorWhatsappId: 'outsider@c.us'
    }), /actor_unauthorized/);
    const tokenParts = built.sealed_state.split('.');
    tokenParts[3] = `${tokenParts[3][0] === 'a' ? 'b' : 'a'}${tokenParts[3].slice(1)}`;
    assert.throws(() => readOpenFinanceHistoricalAmbiguityReviewPrivate({
        sealedState: tokenParts.join('.'), secret: SECRET,
        actorWhatsappId: DANIEL,
        clock: () => new Date('2026-08-05T12:00:30.000Z')
    }), /state_invalid/);
    assert.throws(() => readOpenFinanceHistoricalAmbiguityReviewPrivate({
        sealedState: built.sealed_state, secret: SECRET,
        actorWhatsappId: DANIEL,
        clock: () => new Date('2026-08-05T12:02:00.000Z')
    }), /state_expired/);

    const clean = fixture();
    clean.historicalRx.blockers = [];
    clean.historicalRx.segments.forEach(segment => {
        segment.installments.series = [];
        segment.investment_movements = { status: 'provider_labeled_only', semantically_ambiguous_count: 0 };
    });
    assert.throws(() => buildOpenFinanceHistoricalAmbiguityReview({
        ...clean, secret: SECRET, familyScope: 'family',
        authorizedWhatsAppIds: [DANIEL, THAIS]
    }), /private_evidence_mismatch/);
    const invented = fixture();
    invented.items[0].transactions = invented.items[0].transactions.filter(transaction =>
        transaction.id !== 'installment-private-b' && transaction.id !== 'investment-private-a');
    assert.throws(() => buildOpenFinanceHistoricalAmbiguityReview({
        ...invented, secret: SECRET, familyScope: 'family',
        authorizedWhatsAppIds: [DANIEL, THAIS]
    }), /private_evidence_mismatch/);
    assert.throws(() => buildOpenFinanceHistoricalAmbiguityReview({
        ...fixture(), secret: SECRET, familyScope: 'family',
        authorizedWhatsAppIds: [DANIEL, THAIS, 'third-person@c.us']
    }), /family_actors_required/);
});

test('paginates four review items independently of the two authorized deliveries', () => {
    const input = fixture();
    const source = input.items[0];
    for (let index = 0; index < 5; index += 1) {
        source.transactions.push({
            id: `investment-private-extra-${index}`,
            account_id: 'bank-private-id',
            description: `Movimento extra ${index}`,
            date: `2025-08-${String(13 + index).padStart(2, '0')}T12:00:00.000Z`,
            amount_cents: -(3000 + index), operation_type: 'INVESTIMENTO', status: 'POSTED'
        });
    }
    input.historicalRx.segments[1].investment_movements.semantically_ambiguous_count = 6;
    const built = buildOpenFinanceHistoricalAmbiguityReview({
        ...input, secret: SECRET, familyScope: 'family',
        authorizedWhatsAppIds: [DANIEL, THAIS]
    });
    assert.equal(built.pending_count, 7);
    assert.equal((built.reply.match(/^\d+\./gm) || []).length, 4);
    assert.match(built.reply, /Página 1 de 2/i);
    const next = handleOpenFinanceHistoricalAmbiguityReviewReply({
        sealedState: built.sealed_state, secret: SECRET,
        actorWhatsappId: DANIEL, body: 'mais'
    });
    assert.equal((next.reply.match(/^\d+\./gm) || []).length, 3);
    assert.match(next.reply, /Página 2 de 2/i);
    assert.equal(next.financial_writes, 0);

    const thaisFirstPage = handleOpenFinanceHistoricalAmbiguityReviewReply({
        sealedState: next.sealed_state, secret: SECRET,
        actorWhatsappId: THAIS, body: '1'
    });
    assert.match(thaisFirstPage.reply, /Parcela com identidade duplicada/i);
    const danielSecondPage = handleOpenFinanceHistoricalAmbiguityReviewReply({
        sealedState: thaisFirstPage.sealed_state, secret: SECRET,
        actorWhatsappId: DANIEL, body: '1'
    });
    assert.match(danielSecondPage.reply, /Movimento de investimento sem natureza definida/i);
});

test('keeps a stale selection long enough to prevent a number from being reinterpreted', () => {
    const built = buildOpenFinanceHistoricalAmbiguityReview({
        ...fixture(), secret: SECRET, familyScope: 'family',
        authorizedWhatsAppIds: [DANIEL, THAIS]
    });
    const danielSelected = handleOpenFinanceHistoricalAmbiguityReviewReply({
        sealedState: built.sealed_state, secret: SECRET,
        actorWhatsappId: DANIEL, body: '1'
    });
    const bothSelected = handleOpenFinanceHistoricalAmbiguityReviewReply({
        sealedState: danielSelected.sealed_state, secret: SECRET,
        actorWhatsappId: THAIS, body: '1'
    });
    const danielResolved = handleOpenFinanceHistoricalAmbiguityReviewReply({
        sealedState: bothSelected.sealed_state, secret: SECRET,
        actorWhatsappId: DANIEL, body: '2'
    });
    const thaisStaleReply = handleOpenFinanceHistoricalAmbiguityReviewReply({
        sealedState: danielResolved.sealed_state, secret: SECRET,
        actorWhatsappId: THAIS, body: '2'
    });
    assert.equal(thaisStaleReply.state, 'awaiting_item_number');
    assert.match(thaisStaleReply.reply, /já foi resolvido pelo outro membro/i);
    assert.equal(thaisStaleReply.pending_count, 1);
    assert.equal(thaisStaleReply.financial_writes, 0);
});

test('accepts the real RX builder output and derives the same two private ambiguities', () => {
    const ownerByAlias = {
        daniel_nubank: 'daniel', thais_nubank: 'thais',
        thais_itau: 'thais', cristina_nubank: 'thais'
    };
    const items = Object.entries(ownerByAlias).map(([alias, ownerScope]) => ({
        id: `item-${alias}`, alias_code: alias, owner_scope: ownerScope,
        availability: {
            accounts: 'available', transactions: 'available', bills: 'available',
            investments: 'available', investment_transactions: 'available'
        },
        accounts: [
            { id: `${alias}-bank`, type: 'BANK', subtype: 'CHECKING_ACCOUNT', currency: 'BRL', balance_cents: 0 },
            { id: `${alias}-card`, type: 'CREDIT', subtype: 'CREDIT_CARD', currency: 'BRL', balance_cents: 0,
                credit_limit_cents: 0, available_credit_limit_cents: 0, used_limit_cents: 0 }
        ],
        transactions: [], bills: [], investments: []
    }));
    items.find(item => item.alias_code === 'thais_itau').accounts.push({
        id: 'thais_itau-savings', type: 'BANK', subtype: 'SAVINGS_ACCOUNT',
        currency: 'BRL', balance_cents: 0
    });
    const daniel = items.find(item => item.alias_code === 'daniel_nubank');
    daniel.transactions.push(
        { id: 'real-rx-installment-a', account_id: 'daniel_nubank-card', description: 'Serie sintetica',
            original_date: '2025-07-10', date: '2025-08-10T12:00:00.000Z', amount_cents: 5000,
            installment_number: 2, total_installments: 3, status: 'POSTED' },
        { id: 'real-rx-installment-b', account_id: 'daniel_nubank-card', description: 'Serie sintetica',
            original_date: '2025-07-10', date: '2025-08-11T12:00:00.000Z', amount_cents: 5000,
            installment_number: 2, total_installments: 3, status: 'POSTED' },
        { id: 'real-rx-investment', account_id: 'daniel_nubank-bank', description: 'Operacao sintetica',
            date: '2025-08-12T12:00:00.000Z', amount_cents: -2000,
            operation_type: 'INVESTIMENTO', status: 'POSTED' }
    );
    const sourceLifecycles = Object.fromEntries(Object.keys(ownerByAlias)
        .map(alias => [alias, { existedAtHistoryStart: true }]));
    const historicalRx = buildOpenFinanceHistoricalRx({
        items, historyStartDate: '2025-07-01', observedAt: '2026-08-05T12:00:00.000Z',
        secret: SECRET, sourceLifecycles,
        expectedInventory: structuredClone(CANONICAL_HISTORICAL_RX_INVENTORY)
    });
    const built = buildOpenFinanceHistoricalAmbiguityReview({
        items, historicalRx, secret: SECRET, familyScope: 'family',
        authorizedWhatsAppIds: [DANIEL, THAIS]
    });
    assert.equal(built.pending_count, 2);
    assert.equal(built.financial_writes, 0);
});

test('persists one shared encrypted family decision across restart and never stores private text in plaintext', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-ambiguity-review-'));
    const databasePath = path.join(directory, 'review.sqlite');
    try {
        const built = buildOpenFinanceHistoricalAmbiguityReview({
            ...fixture(), secret: SECRET, familyScope: 'family',
            authorizedWhatsAppIds: [DANIEL, THAIS]
        });
        let store = new OpenFinanceHistoricalAmbiguityReviewStore({
            databasePath, secret: SECRET, familyScope: 'family',
            authorizedWhatsAppIds: [DANIEL, THAIS]
        });
        const prepared = store.prepare({ sealedState: built.sealed_state });
        assert.equal(prepared.pending_count, 2);
        assert.equal(prepared.financial_writes, 0);
        const selected = store.handleReply({ actorWhatsappId: DANIEL, body: '1' });
        assert.equal(selected.state, 'awaiting_resolution_number');
        store.close();

        store = new OpenFinanceHistoricalAmbiguityReviewStore({
            databasePath, secret: SECRET, familyScope: 'family',
            authorizedWhatsAppIds: [DANIEL, THAIS]
        });
        const otherActor = store.handleReply({ actorWhatsappId: THAIS, body: '2' });
        assert.equal(otherActor.state, 'awaiting_resolution_number');
        const resolved = store.handleReply({ actorWhatsappId: DANIEL, body: '2' });
        assert.equal(resolved.pending_count, 1);
        assert.match(resolved.reply, /decisão familiar registrada/i);
        const shared = store.readPrivate({ actorWhatsappId: DANIEL });
        assert.equal(shared.decisions.length, 1);
        assert.equal(shared.financial_writes, 0);
        store.close();

        const storedBytes = Buffer.concat([
            fs.readFileSync(databasePath),
            ...['-wal', '-shm'].filter(suffix => fs.existsSync(`${databasePath}${suffix}`))
                .map(suffix => fs.readFileSync(`${databasePath}${suffix}`))
        ]).toString('latin1');
        assert.doesNotMatch(storedBytes,
            /Compra parcelada|Movimento patrimonial|installment-private|investment-private|5511999999999/);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('rejects replay of an older authenticated envelope after the durable revision advances', () => {
    const built = buildOpenFinanceHistoricalAmbiguityReview({
        ...fixture(), secret: SECRET, familyScope: 'family',
        authorizedWhatsAppIds: [DANIEL, THAIS]
    });
    const store = new OpenFinanceHistoricalAmbiguityReviewStore({
        secret: SECRET, familyScope: 'family',
        authorizedWhatsAppIds: [DANIEL, THAIS]
    });
    try {
        store.prepare({ sealedState: built.sealed_state });
        const advanced = store.handleReply({ actorWhatsappId: DANIEL, body: '1' });
        assert.equal(advanced.state, 'awaiting_resolution_number');

        const tamper = store.db.prepare(`UPDATE open_finance_historical_ambiguity_reviews
            SET sealed_state=?`).run(built.sealed_state);
        assert.equal(tamper.changes, 1);

        assert.throws(
            () => store.handleReply({ actorWhatsappId: DANIEL, body: '2' }),
            /open_finance_historical_ambiguity_review_store_state_invalid/
        );
        assert.throws(
            () => store.readPrivate({ actorWhatsappId: DANIEL }),
            /open_finance_historical_ambiguity_review_store_state_invalid/
        );
    } finally {
        store.close();
    }
});

test('restart accepts only the original candidate identity and never a rebuilt conflicting envelope', () => {
    const initial = buildOpenFinanceHistoricalAmbiguityReview({
        ...fixture(), secret: SECRET, familyScope: 'family',
        authorizedWhatsAppIds: [DANIEL, THAIS],
        clock: () => new Date('2026-08-05T12:00:00.000Z')
    });
    const conflicting = buildOpenFinanceHistoricalAmbiguityReview({
        ...fixture(), secret: SECRET, familyScope: 'family',
        authorizedWhatsAppIds: [DANIEL, THAIS],
        clock: () => new Date('2026-08-05T12:01:00.000Z')
    });
    const store = new OpenFinanceHistoricalAmbiguityReviewStore({
        secret: SECRET, familyScope: 'family',
        authorizedWhatsAppIds: [DANIEL, THAIS],
        clock: () => new Date('2026-08-05T12:02:00.000Z')
    });
    try {
        store.prepare({ sealedState: initial.sealed_state });
        store.handleReply({ actorWhatsappId: DANIEL, body: '1' });
        assert.throws(
            () => store.prepare({ sealedState: conflicting.sealed_state }),
            /open_finance_historical_ambiguity_review_store_prepare_conflict/
        );
    } finally {
        store.close();
    }
});
