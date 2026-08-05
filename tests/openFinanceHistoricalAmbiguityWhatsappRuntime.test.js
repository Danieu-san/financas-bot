'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { SchedulerMessageOutbox } = require('../src/jobs/schedulerMessageOutbox');
const {
    OpenFinanceHistoricalAmbiguityReviewStore,
    buildOpenFinanceHistoricalAmbiguityReview
} = require('../src/openFinance/openFinanceHistoricalAmbiguityReview');
const {
    OpenFinanceHistoricalAmbiguityWhatsappRuntime,
    initializeOpenFinanceHistoricalAmbiguityWhatsappRuntime,
    tryHandleOpenFinanceHistoricalAmbiguityReply,
    __test__: runtimeTest
} = require('../src/openFinance/openFinanceHistoricalAmbiguityWhatsappRuntime');

const SECRET = 'historical-ambiguity-whatsapp-secret-2026';
const OUTBOX_KEY = Buffer.alloc(32, 0x63).toString('base64');
const DANIEL = '5511999999999@c.us';
const THAIS = '5511888888888@c.us';
const NOW = '2026-08-05T12:00:00.000Z';

function ref(kind, value) {
    return crypto.createHmac('sha256', SECRET).update(`${kind}:${value}`)
        .digest('hex').slice(0, 32);
}

function buildCandidate() {
    const alias = 'family_source';
    const creditId = 'credit-private-id';
    const bankId = 'bank-private-id';
    const groupingBasis = ['Compra parcelada', '2025-07-10', 5000, 3].join(':');
    const seriesRef = ref('historical_rx_installment', `${alias}:${creditId}:${groupingBasis}`);
    const items = [{
        alias_code: alias,
        owner_scope: 'family',
        availability: { accounts: 'available', transactions: 'available' },
        accounts: [{ id: creditId, type: 'CREDIT' }, { id: bankId, type: 'BANK' }],
        transactions: [
            { id: 'installment-private-a', account_id: creditId, description: 'Compra parcelada',
                original_date: '2025-07-10', date: '2025-08-10T12:00:00.000Z', amount_cents: 5000,
                installment_number: 2, total_installments: 3, status: 'POSTED' },
            { id: 'installment-private-b', account_id: creditId, description: 'Compra parcelada',
                original_date: '2025-07-10', date: '2025-08-11T12:00:00.000Z', amount_cents: 5000,
                installment_number: 2, total_installments: 3, status: 'POSTED' },
            { id: 'investment-private-a', account_id: bankId, description: 'Movimento patrimonial',
                date: '2025-08-12T12:00:00.000Z', amount_cents: -2000,
                operation_type: 'INVESTIMENTO', status: 'POSTED' }
        ]
    }];
    const historicalRx = {
        schema_version: 1,
        financial_writes: 0,
        blockers: [`${alias}:installment_series_ambiguous`,
            `${alias}:investment_movement_semantics_ambiguous`],
        segments: [
            { source_alias: alias, segment_ref: ref('historical_rx_segment', `${alias}:${creditId}`),
                product: 'credit_card', installments: { series: [{ series_ref: seriesRef,
                    duplicate_numbers: [2], identity_status: 'ambiguous_duplicate_installment_number' }] },
                investment_movements: { semantically_ambiguous_count: null } },
            { source_alias: alias, segment_ref: ref('historical_rx_segment', `${alias}:${bankId}`),
                product: 'bank_account', installments: { series: [] }, investment_movements: {
                    status: 'provider_labeled_with_ambiguous_semantics', semantically_ambiguous_count: 1 } }
        ]
    };
    return buildOpenFinanceHistoricalAmbiguityReview({
        items, historicalRx, secret: SECRET, familyScope: 'family',
        authorizedWhatsAppIds: [DANIEL, THAIS], clock: () => new Date(NOW)
    });
}

function openRuntime(directory, client) {
    const reviewStore = new OpenFinanceHistoricalAmbiguityReviewStore({
        databasePath: path.join(directory, 'review.sqlite'), secret: SECRET,
        familyScope: 'family', authorizedWhatsAppIds: [DANIEL, THAIS],
        clock: () => new Date(NOW)
    });
    const outbox = new SchedulerMessageOutbox({
        databasePath: path.join(directory, 'delivery.sqlite'), encryptionKey: OUTBOX_KEY
    });
    return {
        reviewStore,
        outbox,
        runtime: new OpenFinanceHistoricalAmbiguityWhatsappRuntime({
            reviewStore, outbox, client, authorizedWhatsAppIds: [DANIEL, THAIS],
            clock: () => new Date(NOW)
        })
    };
}

test('delivers one encrypted review per actor and restart never duplicates a terminal delivery', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-review-whatsapp-'));
    const sent = [];
    const candidate = buildCandidate();
    const client = { sendMessage: async (to, message) => {
        sent.push({ to, message });
        return { id: { _serialized: `provider-${sent.length}` } };
    } };
    try {
        let opened = openRuntime(directory, client);
        opened.outbox.enqueue({
            dedupeKey: 'unrelated-old-review',
            jobKind: 'historical_ambiguity_review',
            recipient: '5511666666666@c.us',
            message: 'mensagem antiga',
            createdAt: '2026-08-05T11:00:00.000Z'
        });
        const first = await opened.runtime.prepareAndDeliver({ sealedState: candidate.sealed_state });
        assert.equal(first.queued, 2);
        assert.equal(first.delivered_confirmed, 2);
        assert.deepEqual(sent.map(item => item.to).sort(), [DANIEL, THAIS].sort());
        assert.equal(opened.outbox.getStateCounts().pending, 1);
        assert.ok(sent.every(item => /Ambiguidades pendentes/.test(item.message)));
        opened.reviewStore.close();
        opened.outbox.close();

        opened = openRuntime(directory, client);
        const replay = await opened.runtime.prepareAndDeliver({ sealedState: candidate.sealed_state });
        assert.equal(replay.queued, 0);
        assert.equal(replay.transport_calls, 0);
        assert.equal(sent.length, 2);
        opened.reviewStore.close();
        opened.outbox.close();
    } finally {
        fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});

test('ambiguous transport is accepted at most once and enables only authorized public replies', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-review-whatsapp-'));
    let calls = 0;
    const candidate = buildCandidate();
    const client = { sendMessage: async () => {
        calls += 1;
        throw new Error('transport outcome unknown');
    } };
    const opened = openRuntime(directory, client);
    try {
        const first = await opened.runtime.prepareAndDeliver({ sealedState: candidate.sealed_state });
        assert.equal(first.accepted_unconfirmed, 2);
        assert.equal(calls, 2);
        const replay = await opened.runtime.prepareAndDeliver({ sealedState: candidate.sealed_state });
        assert.equal(replay.transport_calls, 0);
        assert.equal(calls, 2);

        assert.equal(opened.runtime.handlePublicReply({
            actorWhatsappId: '5511777777777@c.us', body: '1'
        }).handled, false);
        const generic = opened.runtime.handlePublicReply({ actorWhatsappId: DANIEL, body: 'sim' });
        assert.equal(generic.handled, true);
        assert.match(generic.reply, /Sim.*n.o resolve ambiguidades/i);
        assert.equal(generic.financial_writes, 0);
        const selected = opened.runtime.handlePublicReply({ actorWhatsappId: DANIEL, body: '1' });
        assert.equal(selected.state, 'awaiting_resolution_number');
        assert.equal(selected.financial_writes, 0);
    } finally {
        opened.reviewStore.close();
        opened.outbox.close();
        fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});

test('one stale reply after family completion is consumed once and never reinterpreted', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-review-whatsapp-'));
    const opened = openRuntime(directory, { sendMessage: async (_to, _message) => ({ id: 'confirmed' }) });
    try {
        await opened.runtime.prepareAndDeliver({ sealedState: buildCandidate().sealed_state });
        opened.runtime.handlePublicReply({ actorWhatsappId: DANIEL, body: '1' });
        opened.runtime.handlePublicReply({ actorWhatsappId: DANIEL, body: '1' });
        opened.runtime.handlePublicReply({ actorWhatsappId: DANIEL, body: '1' });
        opened.runtime.handlePublicReply({ actorWhatsappId: THAIS, body: '1' });
        const finished = opened.runtime.handlePublicReply({ actorWhatsappId: DANIEL, body: '1' });
        assert.equal(finished.state, 'reviewed');

        const stale = opened.runtime.handlePublicReply({ actorWhatsappId: THAIS, body: '1' });
        assert.equal(stale.handled, true);
        assert.equal(stale.state, 'reviewed');
        assert.match(stale.reply, /Revis.o conclu.da/i);
        const next = opened.runtime.handlePublicReply({ actorWhatsappId: THAIS, body: '1' });
        assert.equal(next.handled, false);
        assert.equal(next.financial_writes, 0);
    } finally {
        opened.runtime.close();
        fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});

test('runtime initialization is off by default and invalid prompt configuration fails closed', async () => {
    runtimeTest.setRuntimeForTests(null);
    const client = { sendMessage: async () => ({ id: 'unused' }) };
    const off = await initializeOpenFinanceHistoricalAmbiguityWhatsappRuntime({ client, env: {} });
    assert.deepEqual(off, { enabled: false, mode: 'off', financial_writes: 0 });
    const invalid = await initializeOpenFinanceHistoricalAmbiguityWhatsappRuntime({
        client,
        env: { OPEN_FINANCE_HISTORICAL_AMBIGUITY_REVIEW_MODE: 'prompt' }
    });
    assert.equal(invalid.enabled, false);
    assert.equal(invalid.reason, 'configuration_invalid');
    assert.equal(invalid.financial_writes, 0);
    runtimeTest.setRuntimeForTests(null);
});

test('prompt initialization consumes an external sealed file and restart preserves progress without redelivery', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-review-whatsapp-init-'));
    const candidate = buildCandidate();
    const sealedStateFile = path.join(directory, 'sealed-state.txt');
    fs.writeFileSync(sealedStateFile, candidate.sealed_state, { mode: 0o600 });
    const sent = [];
    const client = { sendMessage: async to => {
        sent.push(to);
        return { id: `provider-${sent.length}` };
    } };
    const env = {
        OPEN_FINANCE_HISTORICAL_AMBIGUITY_REVIEW_MODE: 'prompt',
        OPEN_FINANCE_HISTORICAL_AMBIGUITY_REVIEW_ACTOR_IDS: `${DANIEL},${THAIS}`,
        OPEN_FINANCE_HISTORICAL_AMBIGUITY_REVIEW_SEALED_STATE_FILE: sealedStateFile,
        OPEN_FINANCE_HISTORICAL_AMBIGUITY_REVIEW_DB_PATH: path.join(directory, 'review.sqlite'),
        OPEN_FINANCE_HISTORICAL_AMBIGUITY_REVIEW_OUTBOX_DB_PATH: path.join(directory, 'outbox.sqlite'),
        OPEN_FINANCE_HISTORICAL_AMBIGUITY_REVIEW_FAMILY_SCOPE: 'family',
        OPEN_FINANCE_HISTORICAL_AMBIGUITY_REVIEW_SECRET: SECRET,
        STATE_STORE_ENCRYPTION_KEY: OUTBOX_KEY
    };
    try {
        const first = await initializeOpenFinanceHistoricalAmbiguityWhatsappRuntime({ client, env });
        assert.equal(first.enabled, true);
        assert.equal(first.delivered_confirmed, 2);
        const selected = tryHandleOpenFinanceHistoricalAmbiguityReply({
            actorWhatsappId: DANIEL, body: '1'
        });
        assert.equal(selected.state, 'awaiting_resolution_number');
        const second = await initializeOpenFinanceHistoricalAmbiguityWhatsappRuntime({ client, env });
        assert.equal(second.queued, 0);
        assert.equal(second.transport_calls, 0);
        assert.equal(sent.length, 2);
        const resumed = tryHandleOpenFinanceHistoricalAmbiguityReply({
            actorWhatsappId: DANIEL, body: '1'
        });
        assert.equal(resumed.state, 'awaiting_item_number');
        assert.equal(resumed.pending_count, 1);
    } finally {
        runtimeTest.setRuntimeForTests(null);
        fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});
