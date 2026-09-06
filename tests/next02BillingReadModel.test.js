'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { observationDigest, observationDeduplicationKey, projectObservations } = require('../src/next/kernel/observationKernel');
const { createExpenseReadModel, createExpenseToolGateway } = require('../src/next/kernel/expenseReadModel');

const clock = '2042-06-30T23:59:59.999Z';
function fixture() {
    const catalog = { family_id: 'family-example', people: [{ id: 'person-a' }, { id: 'person-b' }],
        accounts: [{ id: 'account-a', owner_id: 'person-a' }], cards: [{ id: 'card-a', owner_id: 'person-a' }],
        categories: [{ id: 'gifts', kind: 'expense' }] };
    const coverage = ['transaction_date', 'billing_period'].flatMap(time_basis =>
        ['confirmed', 'projected'].map(evidence_state => ({ time_basis, evidence_state,
            start: '2042-05-01', end: evidence_state === 'confirmed' ? '2042-06-30' : '2042-08-31',
            as_of: clock, completeness: 'complete' })));
    const observations = ['purchase', 'part-1', 'part-2'].map((record, index) => {
        const payload = { record_type: index ? 'installment' : 'purchase', person_id: 'person-a',
            account_id: null, card_id: 'card-a', category_id: 'gifts', amount_minor: index ? 50000 : 100000,
            currency: 'BRL', transaction_date: '2042-05-20', status: 'active', related_record_ref: null,
            transfer_ref: null, settles_card_id: null, installment_total: 2, installment_index: index || null,
            installment_purchase_ref: index ? 'purchase' : null, billing_period: index ? `2042-0${index + 5}` : null };
        const o = { schema_version: 0, observation_id: 'obs-' + record, observation_version: 1,
            previous_observation_id: null, source_type: 'import', source_instance_ref: 'synthetic',
            source_record_ref: record, source_version: 'v1', observed_at: clock, effective_at: clock,
            coverage: { start: '2042-05-01', end: '2042-06-30', as_of: clock, completeness: 'complete' },
            normalized_payload: payload, evidence_state: index === 2 ? 'projected' : 'confirmed',
            origin_runtime: null, origin_operation_id: null, ingestion_policy_version: 'next02-import-v3' };
        o.field_provenance = Object.fromEntries(Object.keys(payload).map(k => [k, o.observation_id]));
        o.deduplication_key = observationDeduplicationKey(o);
        return resign(o);
    });
    return { observations, catalog, sourceInstanceRef: 'synthetic', coverage, policyVersion: 'next02-import-v3' };
}
function resign(o) { o.integrity_hash = observationDigest(o); return o; }
const context = { familyId: 'family-example', actorId: 'person-a' };
const query = { period: '2042-06', scope: 'family', timeBasis: 'billing_period', evidenceState: 'confirmed' };
const read = (input, patch = {}, ctx = context) => createExpenseReadModel(input).readConsumption({ ...query, ...patch }, ctx);
function refund(input, period = '2042-06') {
    const o = structuredClone(input.observations[0]);
    Object.assign(o, { observation_id: 'obs-refund', source_record_ref: 'refund' });
    Object.assign(o.normalized_payload, { record_type: 'refund', amount_minor: 10000,
        installment_total: null, billing_period: period, transaction_date: '2042-06-15', related_record_ref: 'purchase' });
    o.field_provenance = Object.fromEntries(Object.keys(o.normalized_payload).map(k => [k, o.observation_id]));
    o.deduplication_key = observationDeduplicationKey(o); input.observations.push(resign(o));
    return o;
}

test('NEXT02C:LENSES purchase and installments never double count', () => {
    const f = fixture();
    assert.equal(read(f).claim.value, 50000);
    assert.equal(read(f, { period: '2042-05', timeBasis: 'transaction_date' }).claim.value, 100000);
    assert.equal(read(f, { timeBasis: 'transaction_date' }).resultKind, 'empty');
    const projected = read(f, { period: '2042-07', evidenceState: 'projected' });
    assert.equal(projected.claim.value, 50000); assert.equal(projected.evidence.state, 'projected');
    assert.equal(projected.claim.evidenceState, 'projected');
    f.observations[2].normalized_payload.billing_period = '2042-06'; resign(f.observations[2]);
    assert.equal(read(f).claim.value, 50000);
    assert.equal(read(f, { evidenceState: 'projected' }).claim.value, 50000);
});
test('NEXT02C:COVERAGE proof must match lens and state with no fallback', () => {
    const f = fixture(); f.coverage = f.coverage.filter(c => c.time_basis === 'transaction_date');
    assert.equal(read(f).coverage, 'incomplete');
    for (const completeness of ['partial', 'unknown', 'unavailable']) {
        const x = fixture(); x.coverage[2].completeness = completeness;
        const r = read(x); assert.equal(r.ok, false); assert.equal(r.claim, undefined);
    }
    const duplicate = fixture(); duplicate.coverage.push(duplicate.coverage[0]);
    assert.throws(() => createExpenseReadModel(duplicate), /read_coverage/);
    const legacy = fixture(); delete legacy.coverage[0].time_basis; delete legacy.coverage[0].evidence_state;
    assert.throws(() => createExpenseReadModel(legacy), /read_coverage_invalid/);
});
test('NEXT02C:ASOF confirmed future cannot borrow projected horizon', () => {
    const f = fixture(); assert.equal(read(f, { period: '2042-07' }).coverage, 'incomplete');
    f.coverage[2].end = '2042-07-31';
    assert.throws(() => createExpenseReadModel(f), /read_coverage_as_of/);
});
test('NEXT02C:REFUND observed competence compensates exact target only', () => {
    const f = fixture(); refund(f);
    const r = read(f); assert.equal(r.claim.value, 40000); assert.ok(r.evidence.refs.length >= 4);
    assert.equal(read(f, { timeBasis: 'transaction_date' }).claim.value, -10000);
    const x = fixture(); refund(x, '2042-05');
    assert.equal(read(x).claim.value, 50000);
    assert.equal(read(x, { period: '2042-05' }).claim.value, -10000);
});
test('NEXT02C:MISSING unknown competence and schedule gaps never mean empty', () => {
    const f = fixture(); refund(f, null); assert.equal(read(f).coverage, 'incomplete');
    const x = fixture(); x.observations.pop(); assert.equal(read(x).coverage, 'incomplete');
    const y = fixture(); y.observations[0].normalized_payload.installment_total = null;
    y.observations = [resign(y.observations[0])]; assert.equal(read(y).coverage, 'incomplete');
});
test('NEXT02C:VERSIONS current tombstones and provenance remain version-bound', () => {
    const f = fixture(); const old = f.observations[1], next = structuredClone(old);
    Object.assign(next, { observation_id: 'obs-part-1-v2', observation_version: 2, source_version: 'v2', previous_observation_id: old.observation_id });
    next.normalized_payload.billing_period = '2042-05';
    next.field_provenance = Object.fromEntries(Object.keys(next.normalized_payload).map(k => [k, next.observation_id]));
    next.deduplication_key = observationDeduplicationKey(next); f.observations.push(resign(next));
    assert.equal(read(f).resultKind, 'empty');
    assert.ok(read(f, { period: '2042-05' }).evidence.refs.some(r => r.endsWith(':v2')));
    next.normalized_payload.status = 'tombstoned'; resign(next);
    assert.equal(read(f).coverage, 'incomplete');
});
test('NEXT02C:SCOPE family personal and filters stay isolated', () => {
    const f = fixture(); assert.equal(read(f, { scope: 'personal' }, { ...context, actorId: 'person-b' }).resultKind, 'empty');
    assert.equal(read(f, {}, { ...context, familyId: 'other' }).ok, false);
    assert.equal(read(f, { card: 'unknown' }).ok, false);
    assert.equal(read(f, { account: 'account-a' }).ok, false);
    assert.equal(read(f, { evidenceState: 'estimated' }).ok, false);
});
test('NEXT02C:NEUTRAL invoice payment does not affect either lens', () => {
    const f = fixture(), o = refund(f, null);
    Object.assign(o.normalized_payload, { record_type: 'invoice_payment', account_id: 'account-a', card_id: null,
        category_id: null, related_record_ref: null, settles_card_id: 'card-a' }); resign(o);
    assert.equal(read(f).claim.value, 50000);
    assert.equal(read(f, { timeBasis: 'transaction_date' }).resultKind, 'empty');
    f.catalog.accounts.push({ id: 'account-b', owner_id: 'person-a' });
    for (const [record, account, amount] of [['transfer-out', 'account-a', -1000], ['transfer-in', 'account-b', 1000]]) {
        const transfer = structuredClone(o);
        Object.assign(transfer, { observation_id: 'obs-' + record, source_record_ref: record });
        Object.assign(transfer.normalized_payload, { record_type: 'transfer', account_id: account,
            amount_minor: amount, transfer_ref: 'pair', settles_card_id: null });
        transfer.field_provenance = Object.fromEntries(Object.keys(transfer.normalized_payload).map(k => [k, transfer.observation_id]));
        transfer.deduplication_key = observationDeduplicationKey(transfer); f.observations.push(resign(transfer));
    }
    assert.equal(read(f).claim.value, 50000);
    assert.equal(read(f, { timeBasis: 'transaction_date' }).resultKind, 'empty');
});
test('NEXT02C:OPTIN v1 and v2 do not silently accept v3 semantics', () => {
    const f = fixture(); const { coverage, ...kernel } = f;
    assert.throws(() => projectObservations({ ...kernel, policyVersion: 'next02-import-v2' }), /source_policy/);
    assert.throws(() => createExpenseReadModel({ ...f, policyVersion: undefined }));
    const before = structuredClone(f); const a = read(f), b = read({ ...f, observations: [...f.observations].reverse() });
    assert.deepEqual(a,b); assert.deepEqual(f,before); assert.equal(Object.isFrozen(a),true);
});
test('NEXT02C:TOOL public boundary preserves state without exposing identity', async () => {
    const f = fixture(); f.publicLabels = { family: 'Família Teste', people: { 'person-a': 'Pessoa A', 'person-b': 'Pessoa B' },
        accounts: { 'account-a': 'Conta A' }, cards: { 'card-a': 'Cartão A' }, categories: { gifts: 'Presentes' } };
    const gateway = createExpenseToolGateway(f);
    const r = await gateway.execute({ request: { tool: 'expenses.sum', args: { ...query, card: 'Cartão A' } },
        trustedContext: context, budget: { reserve: () => ({ ok:true }) } });
    assert.equal(r.ok,true); assert.equal(r.claim.value,50000);
    assert.doesNotMatch(JSON.stringify(r), /family-example|person-a|card-a|obs-|evt_|synthetic/);
});

test('NEXT02C:ANCESTRY complete claim requires complete linked schedule evidence', () => {
    for (const index of [0, 1, 2]) {
        const f = fixture(); f.observations[index].coverage.completeness = 'partial'; resign(f.observations[index]);
        assert.equal(read(f).coverage, 'incomplete');
    }
    const f = fixture(), r = read(f);
    const { coverage, ...kernel } = f;
    const snapshot = projectObservations(kernel);
    for (const event of snapshot.events) assert.ok(r.evidence.refs.includes(event.event_id + ':v1'));
});

test('NEXT02C:SCHEMA explicit noninstallment billing fields are policy and kind bound', () => {
    const valid = fixture(); valid.observations = [valid.observations[0]];
    Object.assign(valid.observations[0].normalized_payload, { installment_total: null, billing_period: '2042-06' });
    resign(valid.observations[0]); assert.equal(read(valid).claim.value, 100000);
    for (const period of ['2042-00', '2042-13', '2042-06-01', 204206, {}]) {
        const f = structuredClone(valid); f.observations[0].normalized_payload.billing_period = period;
        resign(f.observations[0]); assert.throws(() => read(f), /installment_schema/);
    }
    const account = structuredClone(valid);
    Object.assign(account.observations[0].normalized_payload, { card_id: null, account_id: 'account-a' });
    resign(account.observations[0]); assert.throws(() => read(account), /installment_schema/);
    const scheduled = fixture(); scheduled.observations[0].normalized_payload.billing_period = '2042-06';
    resign(scheduled.observations[0]); assert.throws(() => read(scheduled), /installment_schema/);
    for (const state of ['estimated', 'incomplete', 'unavailable']) {
        const f = structuredClone(valid); f.observations[0].evidence_state = state; resign(f.observations[0]);
        assert.equal(read(f).coverage, 'incomplete');
    }
});

test('NEXT02C:GATE billing properties bind to actual non-skipped events and exact source tree', () => {
    const path = require('node:path');
    const policy = require('../scripts/agent/financasBotNext02ValidationPolicy');
    const contract = policy.sliceContract('N02-C');
    const events = contract.properties.map(p => ({ type: 'test:pass', data: {
        name: p.key + ' property', nesting: 0, details: { type: 'test' }, file: '/repo/tests/' + p.file
    } }));
    assert.deepEqual(policy.validatePropertyEvents(events, 'N02-C').errors, []);
    assert.equal(contract.properties.length, 44);
    for (const patch of [{ skip: true }, { todo: true }, { nesting: 1 }, { file: '/repo/tests/wrong.js' }]) {
        const mutated = structuredClone(events); Object.assign(mutated.at(-1).data, patch);
        assert.ok(policy.validatePropertyEvents(mutated, 'N02-C').errors.length);
    }
    assert.ok(policy.validatePropertyEvents(events.slice(0, -1), 'N02-C').errors.length);
    assert.ok(policy.validatePropertyEvents([...events, events.at(-1)], 'N02-C').errors.length);
    assert.deepEqual(policy.inspectSources(path.resolve(__dirname, '../src/next'), 'N02-C').errors, []);
});
