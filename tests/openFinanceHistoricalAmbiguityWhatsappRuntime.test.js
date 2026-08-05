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

function openRuntime(directory, client, options = {}) {
    const clock = options.clock || (() => new Date(NOW));
    const reviewStore = new OpenFinanceHistoricalAmbiguityReviewStore({
        databasePath: path.join(directory, 'review.sqlite'), secret: SECRET,
        familyScope: 'family', authorizedWhatsAppIds: [DANIEL, THAIS],
        clock
    });
    const outbox = new SchedulerMessageOutbox({
        databasePath: path.join(directory, 'delivery.sqlite'), encryptionKey: OUTBOX_KEY
    });
    return {
        reviewStore,
        outbox,
        runtime: new OpenFinanceHistoricalAmbiguityWhatsappRuntime({
            reviewStore, outbox, client, authorizedWhatsAppIds: [DANIEL, THAIS],
            clock,
            setTimeoutFn: options.setTimeoutFn,
            clearTimeoutFn: options.clearTimeoutFn
        })
    };
}

function reply(runtime, actorWhatsappId, body, messageTimestamp = (Date.parse(NOW) / 1000) + 1) {
    return runtime.handlePublicReply({ actorWhatsappId, body, messageTimestamp });
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

        assert.equal(reply(opened.runtime, '5511777777777@c.us', '1').handled, false);
        const generic = reply(opened.runtime, DANIEL, 'sim');
        assert.equal(generic.handled, true);
        assert.match(generic.reply, /Sim.*n.o resolve ambiguidades/i);
        assert.equal(generic.financial_writes, 0);
        const selected = reply(opened.runtime, DANIEL, '1');
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
        reply(opened.runtime, DANIEL, '1');
        reply(opened.runtime, DANIEL, '1');
        reply(opened.runtime, DANIEL, '1');
        reply(opened.runtime, THAIS, '1');
        const finished = reply(opened.runtime, DANIEL, '1');
        assert.equal(finished.state, 'reviewed');

        const stale = reply(opened.runtime, THAIS, '1');
        assert.equal(stale.handled, true);
        assert.equal(stale.state, 'reviewed');
        assert.match(stale.reply, /Revis.o conclu.da/i);
        const next = reply(opened.runtime, THAIS, '1');
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

test('pre-attempt backfill is blocked without advancing review and malformed provider id stays unconfirmed', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-review-whatsapp-time-'));
    const opened = openRuntime(directory, {
        sendMessage: async () => ({ id: { unexpected: 'object' } })
    });
    try {
        const activation = await opened.runtime.prepareAndDeliver({
            sealedState: buildCandidate().sealed_state
        });
        assert.equal(activation.delivered_confirmed, 0);
        assert.equal(activation.accepted_unconfirmed, 2);

        const missingTimestamp = opened.runtime.handlePublicReply({
            actorWhatsappId: DANIEL, body: '1'
        });
        assert.equal(missingTimestamp.handled, true);
        assert.equal(missingTimestamp.blocked, true);
        const stale = reply(opened.runtime, DANIEL, '1', (Date.parse(NOW) / 1000) - 1);
        assert.equal(stale.handled, true);
        assert.equal(stale.blocked, true);
        assert.match(stale.reply, /anterior.*revis.o/i);

        const current = reply(opened.runtime, DANIEL, '1', (Date.parse(NOW) / 1000) + 1);
        assert.equal(current.state, 'awaiting_resolution_number');
    } finally {
        opened.runtime.close();
        fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});

test('definitive no-send is retried by the scoped runtime timer and never recovers an unrelated lease', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-review-whatsapp-retry-'));
    let current = new Date(NOW);
    const scheduled = [];
    let transportCalls = 0;
    const opened = openRuntime(directory, {
        sendMessage: async () => {
            transportCalls += 1;
            if (transportCalls === 1) {
                const error = new Error('definitive no send');
                error.definitiveNoSend = true;
                throw error;
            }
            return { id: `provider-${transportCalls}` };
        }
    }, {
        clock: () => current,
        setTimeoutFn(callback, delay) {
            scheduled.push({ callback, delay });
            return { unref() {} };
        },
        clearTimeoutFn() {}
    });
    try {
        const unrelatedTerminal = opened.outbox.enqueue({
            dedupeKey: 'unrelated-old-terminal', jobKind: 'historical_ambiguity_review',
            recipient: '5511555555555@c.us', message: 'terminal alheia',
            createdAt: new Date(Date.parse(NOW) - (40 * 24 * 60 * 60 * 1000)).toISOString()
        });
        const terminalClaim = opened.outbox.claimNext({
            now: new Date(Date.parse(NOW) - (40 * 24 * 60 * 60 * 1000)).toISOString(),
            jobRefs: [unrelatedTerminal.jobRef]
        });
        opened.outbox.acknowledgeDelivered({
            jobRef: terminalClaim.jobRef,
            leaseToken: terminalClaim.leaseToken,
            providerMessageId: 'unrelated-provider',
            now: new Date(Date.parse(NOW) - (40 * 24 * 60 * 60 * 1000)).toISOString()
        });
        const unrelated = opened.outbox.enqueue({
            dedupeKey: 'unrelated-in-flight', jobKind: 'historical_ambiguity_review',
            recipient: '5511666666666@c.us', message: 'alheia',
            createdAt: new Date(Date.parse(NOW) - 180000).toISOString()
        });
        opened.outbox.claimNext({
            now: new Date(Date.parse(NOW) - 180000).toISOString(),
            jobRefs: [unrelated.jobRef], leaseSeconds: 30
        });

        const first = await opened.runtime.prepareAndDeliver({
            sealedState: buildCandidate().sealed_state
        });
        assert.equal(first.retry_scheduled, 1);
        assert.equal(opened.outbox.getStateCounts().in_flight, 1);
        assert.equal(opened.outbox.getDeliveryStateByDedupeKey('unrelated-old-terminal'),
            'delivered_confirmed');
        assert.equal(scheduled.length, 1);
        assert.ok(scheduled[0].delay > 0);

        current = new Date(Date.parse(NOW) + 61000);
        await scheduled[0].callback();
        assert.equal(transportCalls, 3);
        assert.equal(opened.outbox.getStateCounts().in_flight, 1);
        assert.equal(opened.outbox.getStateCounts().delivered_confirmed, 3);
    } finally {
        opened.runtime.close();
        fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});

test('restart re-arms a pending definitive retry without duplicating the confirmed actor', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-review-whatsapp-restart-retry-'));
    let current = new Date(NOW);
    let transportCalls = 0;
    const client = {
        sendMessage: async () => {
            transportCalls += 1;
            if (transportCalls === 1) {
                const error = new Error('definitive no send');
                error.definitiveNoSend = true;
                throw error;
            }
            return { id: `provider-${transportCalls}` };
        }
    };
    const firstTimers = [];
    let opened = openRuntime(directory, client, {
        clock: () => current,
        setTimeoutFn(callback, delay) {
            firstTimers.push({ callback, delay });
            return { unref() {} };
        },
        clearTimeoutFn() {}
    });
    try {
        await opened.runtime.prepareAndDeliver({ sealedState: buildCandidate().sealed_state });
        assert.equal(transportCalls, 2);
        assert.equal(firstTimers.length, 1);
        opened.runtime.close();

        const restartTimers = [];
        opened = openRuntime(directory, client, {
            clock: () => current,
            setTimeoutFn(callback, delay) {
                restartTimers.push({ callback, delay });
                return { unref() {} };
            },
            clearTimeoutFn() {}
        });
        const restarted = await opened.runtime.prepareAndDeliver({
            sealedState: buildCandidate().sealed_state
        });
        assert.equal(restarted.queued, 0);
        assert.equal(restarted.transport_calls, 0);
        assert.equal(restartTimers.length, 1);

        current = new Date(Date.parse(NOW) + 61000);
        await restartTimers[0].callback();
        assert.equal(transportCalls, 3);
        assert.equal(opened.outbox.getStateCounts().delivered_confirmed, 2);
    } finally {
        opened.runtime.close();
        fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});

test('expired selection is consumed once without a decision or financial write', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-review-whatsapp-expiry-'));
    let current = new Date(NOW);
    const opened = openRuntime(directory, {
        sendMessage: async () => ({ id: 'confirmed' })
    }, { clock: () => current });
    try {
        await opened.runtime.prepareAndDeliver({ sealedState: buildCandidate().sealed_state });
        assert.equal(reply(opened.runtime, DANIEL, '1').state, 'awaiting_resolution_number');
        current = new Date(Date.parse(NOW) + (8 * 24 * 60 * 60 * 1000));
        const expired = reply(opened.runtime, DANIEL, '1', current.getTime() / 1000);
        assert.equal(expired.handled, true);
        assert.equal(expired.expired, true);
        assert.equal(expired.financial_writes, 0);
        assert.match(expired.reply, /expirou.*Nada foi salvo/i);
        assert.equal(reply(opened.runtime, DANIEL, '1', current.getTime() / 1000).handled, false);
    } finally {
        opened.runtime.close();
        fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
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
            actorWhatsappId: DANIEL, body: '1', messageTimestamp: (Date.now() / 1000) + 2
        });
        assert.equal(selected.state, 'awaiting_resolution_number');
        const second = await initializeOpenFinanceHistoricalAmbiguityWhatsappRuntime({ client, env });
        assert.equal(second.queued, 0);
        assert.equal(second.transport_calls, 0);
        assert.equal(sent.length, 2);
        const resumed = tryHandleOpenFinanceHistoricalAmbiguityReply({
            actorWhatsappId: DANIEL, body: '1', messageTimestamp: (Date.now() / 1000) + 2
        });
        assert.equal(resumed.state, 'awaiting_item_number');
        assert.equal(resumed.pending_count, 1);
    } finally {
        runtimeTest.setRuntimeForTests(null);
        fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
});
