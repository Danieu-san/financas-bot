'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    observationDigest, observationDeduplicationKey, projectObservations
} = require('../src/next/kernel/observationKernel');
const { createExpenseReadModel, createExpenseToolGateway } = require('../src/next/kernel/expenseReadModel');

const clock = '2042-06-30T23:59:59.999Z';
function catalog() {
    return {
        family_id: 'family-example',
        people: [{ id: 'person-a' }, { id: 'person-b' }],
        accounts: [{ id: 'account-a', owner_id: 'person-a' }, { id: 'account-b', owner_id: 'person-b' }],
        cards: [{ id: 'card-a', owner_id: 'person-a' }],
        categories: [{ id: 'food', kind: 'expense' }, { id: 'salary', kind: 'income' }]
    };
}
function observation(record, payload = {}, extra = {}) {
    const o = {
        schema_version: 0, observation_id: 'obs-' + record,
        observation_version: 1, previous_observation_id: null,
        source_type: 'import', source_instance_ref: 'synthetic-import',
        source_record_ref: record, source_version: 'v1',
        observed_at: clock, effective_at: clock,
        coverage: { start: '2042-06-01', end: '2042-06-30', as_of: clock, completeness: 'complete' },
        normalized_payload: {
            record_type: 'purchase', person_id: 'person-a', account_id: 'account-a',
            card_id: null, category_id: 'food', amount_minor: 1200, currency: 'BRL',
            transaction_date: '2042-06-05', status: 'active',
            related_record_ref: null, transfer_ref: null, settles_card_id: null,
            ...payload
        },
        evidence_state: 'confirmed', origin_runtime: null, origin_operation_id: null,
        ingestion_policy_version: 'next02-import-v1', ...extra
    };
    o.field_provenance = Object.fromEntries(Object.keys(o.normalized_payload).map(k => [k, o.observation_id]));
    o.deduplication_key = observationDeduplicationKey(o);
    o.integrity_hash = observationDigest(o);
    return o;
}
const project = observations => projectObservations({
    observations, catalog: catalog(), sourceInstanceRef: 'synthetic-import'
});
const resign = o => { o.integrity_hash = observationDigest(o); return o; };

test('NEXT02:DA-01 replay and order preserve one event per source version', () => {
    const a = observation('a'), b = observation('b');
    const first = project([a, b]);
    assert.deepEqual(project([b, a, structuredClone(a)]), first);
    assert.equal(first.events.length, 2);
    assert.equal(first.observations.length, 2);
});

test('NEXT02:DA-02 next projections and model origins cannot reenter', () => {
    for (const origin_runtime of ['financasbot_next', 'model', 'unknown']) {
        assert.throws(() => project([observation('a', {}, { origin_runtime })]), /observation_origin_forbidden/);
    }
    assert.throws(() => project([observation('a', {}, { origin_operation_id: 'operation' })]), /observation_origin_forbidden/);
});

test('NEXT02:DA-06 equal amounts and dimensions never merge different source records', () => {
    const r = project([observation('a'), observation('b')]);
    assert.equal(new Set(r.events.map(e => e.event_id)).size, 2);
    assert.equal(new Set(r.events.map(e => e.economic_identity_key)).size, 2);
});

test('NEXT02:OBS-VERSION immutable history and deterministic current version', () => {
    const a = observation('a');
    const b = observation('a', { amount_minor: 1500 }, {
        observation_id: 'obs-a-v2', observation_version: 2,
        previous_observation_id: a.observation_id, source_version: 'v2'
    });
    const r = project([b, a]);
    assert.equal(r.history.length, 2);
    assert.equal(r.events.length, 1);
    assert.equal(r.history[0].event_id, r.history[1].event_id);
    assert.equal(r.history[0].amount_minor, 1200);
    assert.equal(r.events[0].amount_minor, 1500);
    assert.equal(r.events[0].event_version, 2);
    assert.equal(r.events[0].previous_event_version, 1);
    assert.throws(() => project([b]), /observation_chain_invalid/);
    const fork = observation('a', { amount_minor: 1600 }, {
        observation_id: 'obs-a-fork', observation_version: 2,
        previous_observation_id: a.observation_id, source_version: 'v3'
    });
    assert.throws(() => project([a, b, fork]), /observation_chain_invalid/);
});

test('NEXT02:OBS-CONFLICT same immutable ID or source version cannot change content', () => {
    const a = observation('a');
    const changed = observation('a', { amount_minor: 9999 });
    assert.throws(() => project([a, changed]), /observation_identity_conflict/);
    const otherId = observation('a', {}, { observation_id: 'different-id' });
    assert.throws(() => project([a, otherId]), /observation_identity_conflict/);
});

test('NEXT02:OBS-INTEGRITY every payload field is hash-bound and provenance-bound', () => {
    const base = observation('a');
    for (const key of Object.keys(base.normalized_payload)) {
        const changed = structuredClone(base);
        changed.normalized_payload[key] = 'changed';
        assert.throws(() => project([changed]), /observation_integrity_invalid/);
        const missing = structuredClone(base);
        delete missing.field_provenance[key];
        assert.throws(() => project([resign(missing)]), /field_provenance_invalid/);
    }
    assert.throws(() => project([observation('a', { token: 'no' })]), /payload_schema_invalid/);
});

test('NEXT02:OBS-BOUNDARY unsafe cents, dates, sources and states fail closed', () => {
    for (const amount_minor of [0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, -1]) {
        assert.throws(() => project([observation('a', { amount_minor })]));
    }
    for (const transaction_date of ['2042-02-30', '2042-13-01', '', null]) {
        assert.throws(() => project([observation('a', { transaction_date })]), /payload_date_invalid/);
    }
    for (const evidence_state of ['realized', 'committed', 'invalid']) {
        assert.throws(() => project([observation('a', {}, { evidence_state })]), /evidence_state_invalid/);
    }
    assert.throws(() => project([observation('a', {}, { source_type: 'writer' })]), /source_policy_violation/);
    assert.throws(() => project([observation('a', {}, { source_instance_ref: 'outside' })]), /source_policy_violation/);
});

test('NEXT02:OBS-SCOPE person and instrument ownership are checked server-side', () => {
    assert.throws(() => project([observation('a', { person_id: 'outside' })]), /person_unknown/);
    assert.throws(() => project([observation('a', { account_id: 'account-b' })]), /instrument_owner_mismatch/);
    assert.throws(() => project([observation('a', { category_id: 'missing' })]), /category_unknown/);
    assert.throws(() => projectObservations({
        observations: [observation('a')], catalog: { ...catalog(), people: [{ id: 'person-a' }, { id: 'person-a' }] },
        sourceInstanceRef: 'synthetic-import'
    }), /catalog_duplicate/);
    assert.equal(project([observation('shared-card', {
        person_id: 'person-b', account_id: null, card_id: 'card-a'
    })]).events[0].person_id, 'person-b');
});

test('NEXT02:DA-04 purchase and invoice payment have separate economic types', () => {
    const r = project([
        observation('purchase', { account_id: null, card_id: 'card-a' }),
        observation('payment', { record_type: 'invoice_payment', category_id: null, settles_card_id: 'card-a' })
    ]);
    assert.deepEqual(r.events.map(e => e.event_kind).sort(), ['invoice_payment', 'purchase']);
    const payment = r.events.find(e => e.event_kind === 'invoice_payment');
    assert.equal(payment.amount_minor, 1200);
    assert.equal(payment.account_id, 'account-a');
    assert.equal(payment.card_id, 'card-a');
    assert.deepEqual(payment.field_provenance.card_id, {
        observation_id: 'obs-payment', field: 'settles_card_id'
    });
});

test('NEXT02:DA-05 transfer pairs require opposite directions and same economic dimensions', () => {
    const out = observation('out', { record_type: 'transfer', category_id: null, transfer_ref: 'pair', amount_minor: -1500 });
    const incoming = observation('in', {
        record_type: 'transfer', category_id: null, transfer_ref: 'pair',
        person_id: 'person-b', account_id: 'account-b', amount_minor: 1500
    });
    const r = project([out, incoming]);
    assert.equal(r.events.reduce((sum, e) => sum + e.amount_minor, 0), 0);
    assert.equal(r.events[0].links.length, 1);
    assert.throws(() => project([out]), /transfer_pair_invalid/);
    for (const patch of [{ amount_minor: 1400 }, { transaction_date: '2042-06-06' }, { account_id: 'account-a', person_id: 'person-a' }]) {
        assert.throws(() => project([out, observation('in', { ...incoming.normalized_payload, ...patch })]), /transfer_pair_invalid/);
    }
});

test('NEXT02:REFUND link, dimensions and cumulative amount are causal', () => {
    const buy = observation('buy');
    const refund = observation('refund', { record_type: 'refund', related_record_ref: 'buy', amount_minor: 700 });
    const r = project([refund, buy]);
    const e = r.events.find(e => e.event_kind === 'refund');
    assert.equal(e.links[0].link_type, 'compensates');
    assert.equal(e.links[0].to_event_id, r.events.find(e => e.event_kind === 'purchase').event_id);
    assert.throws(() => project([refund]), /refund_target_invalid/);
    assert.throws(() => project([buy, refund, observation('refund2', {
        record_type: 'refund', related_record_ref: 'buy', amount_minor: 700
    })]), /refund_exceeds_purchase/);
    assert.throws(() => project([buy, observation('bad-refund', {
        record_type: 'refund', related_record_ref: 'buy', person_id: 'person-b', account_id: 'account-b'
    })]), /refund_dimensions_mismatch/);
});

test('NEXT02:OBS-IMMUTABLE snapshots cannot be changed through input or output aliases', () => {
    const a = observation('a');
    const r = project([a]);
    a.normalized_payload.amount_minor = 9999;
    assert.equal(r.events[0].amount_minor, 1200);
    assert.ok(Object.isFrozen(r));
    assert.ok(Object.isFrozen(r.events[0].field_provenance));
    assert.throws(() => { r.events[0].amount_minor = 9999; }, TypeError);
});

test('NEXT02:OBS-UNSUPPORTED types cannot acquire unimplemented semantics', () => {
    for (const record_type of ['installment', 'reversal', 'adjustment', 'reserve_application']) {
        assert.throws(() => project([observation('a', { record_type })]), /event_kind_unsupported/);
    }
});

function model(observations, overrides = {}) {
    return createExpenseReadModel({
        observations, catalog: catalog(), sourceInstanceRef: 'synthetic-import',
        coverage: { start: '2042-06-01', end: '2042-06-30', as_of: clock, completeness: 'complete' },
        ...overrides
    });
}
const query = { period: '2042-06', scope: 'family', timeBasis: 'transaction_date' };
const context = { familyId: 'family-example', actorId: 'person-a' };

test('NEXT02:DA-03 partial coverage never produces numeric zero or empty', () => {
    for (const completeness of ['partial', 'unknown', 'unavailable']) {
        const r = model([], { coverage: { start: '2042-06-01', end: '2042-06-30', as_of: clock, completeness } })
            .readConsumption(query, context);
        assert.equal(r.ok, false);
        assert.equal(r.claim, undefined);
    }
    const partial = observation('partial', {}, { coverage: {
        start: '2042-06-01', end: '2042-06-30', as_of: clock, completeness: 'partial'
    } });
    assert.equal(model([partial]).readConsumption(query, context).coverage, 'incomplete');
    assert.throws(() => model([], { coverage: {
        start: '2042-06-01', end: '2042-06-30',
        as_of: '2042-06-15T12:00:00.000Z', completeness: 'complete'
    } }), /read_coverage_as_of_invalid/);
    assert.throws(() => model([], { coverage: {
        start: '2042-06-01', end: '2042-06-30',
        as_of: '2042-06-30T00:00:00.000Z', completeness: 'complete'
    } }), /read_coverage_as_of_invalid/);
    assert.throws(() => project([observation('future-complete', {}, { coverage: {
        start: '2042-06-01', end: '2042-06-30',
        as_of: '2042-06-15T12:00:00.000Z', completeness: 'complete'
    } })]), /coverage_as_of_invalid/);
});

test('NEXT02:VALUE-ZERO-EMPTY neutral movements do not count consumption', () => {
    const buy = observation('buy');
    const payment = observation('pay', { record_type: 'invoice_payment', category_id: null, settles_card_id: 'card-a' });
    assert.equal(model([buy, payment]).readConsumption(query, context).claim.value, 1200);
    assert.equal(model([payment]).readConsumption(query, context).resultKind, 'empty');
    const transfers = [
        observation('out', { record_type: 'transfer', category_id: null, transfer_ref: 'pair', amount_minor: -500 }),
        observation('in', { record_type: 'transfer', category_id: null, transfer_ref: 'pair',
            person_id: 'person-b', account_id: 'account-b', amount_minor: 500 })
    ];
    assert.equal(model([buy, ...transfers]).readConsumption(query, context).claim.value, 1200);
    assert.equal(model([]).readConsumption(query, context).resultKind, 'empty');
    const refunded = model([buy, observation('refund', { record_type: 'refund', related_record_ref: 'buy' })])
        .readConsumption(query, context);
    assert.equal(refunded.claim.value, 0);
    assert.equal(refunded.resultKind, 'zero');
});

test('NEXT02:QUERY-FILTERS scope, category, instrument and period are applied together', () => {
    const read = model([
        observation('a'), observation('b', { person_id: 'person-b', account_id: 'account-b', amount_minor: 300 }),
        observation('card', { account_id: null, card_id: 'card-a', amount_minor: 500 })
    ]).readConsumption;
    assert.equal(read(query, context).claim.value, 2000);
    assert.equal(read({ ...query, scope: 'personal' }, context).claim.value, 1700);
    assert.equal(read({ ...query, account: 'account-b' }, context).claim.value, 300);
    assert.equal(read({ ...query, card: 'card-a', category: 'food' }, context).claim.value, 500);
    assert.equal(read({ ...query, scope: 'personal', account: 'account-b' }, context).resultKind, 'empty');
    assert.equal(read({ ...query, period: '2042-07' }, context).ok, false);
    assert.equal(read(query, { ...context, familyId: 'other' }).ok, false);
    assert.equal(read(query, { ...context, actorId: 'other' }).ok, false);
    for (const patch of [{ period: '2042-13' }, { category: 'missing' },
        { family_id: 'other' }, { timeBasis: 'billing_month' }, { scope: 'member' }]) {
        assert.equal(read({ ...query, ...patch }, context).ok, false);
    }
});

test('NEXT02:OVERFLOW sum of individually safe amounts fails without rounding', () => {
    const result = model([observation('a', { amount_minor: Number.MAX_SAFE_INTEGER }),
        observation('b', { amount_minor: 1 })]).readConsumption(query, context);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'amount_overflow');
});

test('NEXT02:TOOL uses the existing boundary and only public claim/evidence fields', async () => {
    const publicLabels = {
        family: 'Família de teste',
        people: { 'person-a': 'Pessoa A', 'person-b': 'Pessoa B' },
        accounts: { 'account-a': 'Conta A', 'account-b': 'Conta B' },
        cards: { 'card-a': 'Cartão A' },
        categories: { food: 'Alimentação', salary: 'Salário' }
    };
    const gateway = createExpenseToolGateway({
        observations: [observation('a')], catalog: catalog(), sourceInstanceRef: 'synthetic-import',
        coverage: { start: '2042-06-01', end: '2042-06-30', as_of: clock, completeness: 'complete' },
        publicLabels
    });
    let reserved = 0;
    const budget = { reserve() { reserved++; return { ok: true }; } };
    const result = await gateway.execute({
        request: { tool: 'expenses.sum', args: query }, trustedContext: context, budget
    });
    assert.equal(result.ok, true);
    assert.equal(result.claim.value, 1200);
    assert.deepEqual(result.claim.entity, { kind: 'family', label: 'Família de teste' });
    assert.ok(result.evidence.refs.every(ref => /^eph_1_[1-9]\d*$/.test(ref)));
    assert.equal(reserved, 1);
    assert.doesNotMatch(JSON.stringify(result),
        /source_record_ref|observation_id|normalized_payload|family-example|person-a|account-a|card-a/);
    const filtered = await gateway.execute({ request: { tool: 'expenses.sum', args: {
        period: query.period, scope: query.scope, timeBasis: query.timeBasis,
        account: 'Conta A', category: 'Alimentação'
    } }, trustedContext: context, budget });
    assert.equal(filtered.ok, true);
    assert.deepEqual(filtered.claim.filters, { category: 'Alimentação', account: 'Conta A' });
    assert.doesNotMatch(JSON.stringify(filtered), /account-a|food|family-example|person-a/);
    assert.notDeepEqual(filtered.evidence.refs, result.evidence.refs);
    const personal = await gateway.execute({ request: { tool: 'expenses.sum', args: {
        ...query, scope: 'personal'
    } }, trustedContext: context, budget });
    assert.equal(personal.ok, true);
    assert.deepEqual(personal.claim.entity, { kind: 'person', label: 'Pessoa A' });
    const rejectedInternal = await gateway.execute({ request: { tool: 'expenses.sum', args: {
        period: query.period, scope: query.scope, timeBasis: query.timeBasis, account: 'account-a'
    } }, trustedContext: context, budget });
    assert.equal(rejectedInternal.ok, false);
    await gateway.execute({ request: { tool: 'expenses.sum', args: { ...query, familyId: 'other' } },
        trustedContext: context, budget });
    assert.equal(reserved, 4);
    const unsafeLabels = structuredClone(publicLabels);
    unsafeLabels.accounts['account-a'] = 'ACCOUNT-A';
    assert.throws(() => createExpenseToolGateway({
        observations: [observation('a')], catalog: catalog(), sourceInstanceRef: 'synthetic-import',
        coverage: { start: '2042-06-01', end: '2042-06-30', as_of: clock, completeness: 'complete' },
        publicLabels: unsafeLabels
    }), /public_labels_invalid/);
});

test('NEXT02:ADVERSARIAL resealed semantic drift and getters cannot produce a green snapshot', () => {
    assert.throws(() => model([observation('a')], { coverage: {
        start: '2042-06-01', end: '2042-06-14', as_of: '2042-06-14T23:59:59.999Z', completeness: 'complete'
    } }), /snapshot_as_of_mismatch/);
    const dateDrift = observation('a');
    dateDrift.coverage.start = '2042-07-01';
    dateDrift.coverage.end = '2042-07-31';
    dateDrift.coverage.as_of = '2042-07-31T23:59:59.999Z';
    assert.throws(() => project([resign(dateDrift)]), /observation_coverage_mismatch/);
    const wrongProvenance = observation('a');
    wrongProvenance.field_provenance.amount_minor = 'obs-other';
    assert.throws(() => project([resign(wrongProvenance)]), /field_provenance_invalid/);
    let reads = 0;
    const getter = observation('a');
    Object.defineProperty(getter.normalized_payload, 'amount_minor', {
        enumerable: true, get() { reads++; return 1200; }
    });
    assert.throws(() => project([getter]), /canonical_json_invalid/);
    assert.equal(reads, 0);
    const r = project([observation('buy'), observation('refund', { record_type: 'refund', related_record_ref: 'buy' })]);
    assert.equal(r.history.find(e => e.event_kind === 'refund').links[0].link_type, 'compensates');
});

test('NEXT02:GATE exact source tree and structured properties reject false greens', () => {
    const path = require('node:path');
    const policy = require('../scripts/agent/financasBotNext02ValidationPolicy');
    const prior = require('../scripts/agent/financasBotNext01ValidationPolicy');
    assert.deepEqual(policy.inspectSources(path.join(__dirname, '../src/next'), 'N02-B').errors, []);
    assert.equal(policy.EXPECTED_PATHS.length, 14);
    assert.ok(prior.validateSourceInventory({
        expectedPaths: policy.EXPECTED_PATHS,
        discoveredPaths: [...policy.EXPECTED_PATHS, 'escape.node']
    }).errors.length);
    const passes = policy.REQUIRED_IDS.map(id => ({ type: 'test:pass', data: {
        name: 'NEXT02:' + id + ' property', nesting: 0, details: { type: 'test' },
        file: __filename
    } }));
    assert.deepEqual(policy.validatePropertyEvents(passes).errors, []);
    for (const mutate of [
        e => { e[0].data.skip = true; },
        e => { e[0].data.todo = true; },
        e => { e[0].type = 'test:fail'; },
        e => { e[0].type = 'test:stdout'; },
        e => { e[0].data.nesting = 1; },
        e => { e[0].data.file = '/wrong.js'; },
        e => { e.push(structuredClone(e[0])); },
        e => { e[0].data.name = 'NEXT02:UNKNOWN property'; }
    ]) {
        const copy = structuredClone(passes);
        mutate(copy);
        assert.ok(policy.validatePropertyEvents(copy).errors.length);
    }
});
