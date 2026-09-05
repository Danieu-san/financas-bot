'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { projectInstallmentSchedule } = require('../src/next/kernel/installmentSchedule');
const { projectObservations, observationDigest, observationDeduplicationKey } = require('../src/next/kernel/observationKernel');

function observationInput() {
    const catalog = { family_id: 'family-a', people: [{ id: 'person-a' }], accounts: [],
        cards: [{ id: 'card-a', owner_id: 'person-a' }], categories: [{ id: 'gifts', kind: 'expense' }] };
    const clock = '2043-01-31T23:59:59.999Z';
    const observations = ['purchase', 'part-1', 'part-2'].map((record, index) => {
        const payload = { record_type: index ? 'installment' : 'purchase', person_id: 'person-a',
            account_id: null, card_id: 'card-a', category_id: 'gifts', currency: 'BRL',
            amount_minor: index ? (index === 1 ? 50000 : 50001) : 100001,
            transaction_date: '2042-11-20', status: 'active', related_record_ref: null,
            transfer_ref: null, settles_card_id: null, installment_total: 2,
            installment_index: index || null, installment_purchase_ref: index ? 'purchase' : null,
            billing_period: index ? (index === 1 ? '2042-12' : '2043-01') : null };
        const o = { schema_version: 0, observation_id: 'obs-' + record, observation_version: 1,
            previous_observation_id: null, source_type: 'import', source_instance_ref: 'synthetic',
            source_record_ref: record, source_version: 'v1', observed_at: clock, effective_at: clock,
            coverage: { start: '2042-11-01', end: '2043-01-31', as_of: clock, completeness: 'complete' },
            normalized_payload: payload, evidence_state: 'confirmed', origin_runtime: null,
            origin_operation_id: null, ingestion_policy_version: 'next02-import-v2',
            field_provenance: Object.fromEntries(Object.keys(payload).map(k => [k, 'obs-' + record])) };
        o.deduplication_key = observationDeduplicationKey(o);
        o.integrity_hash = observationDigest(o);
        return o;
    });
    return { observations, catalog, sourceInstanceRef: 'synthetic', policyVersion: 'next02-import-v2' };
}

function fixture() {
    const dimensions = { family_id: 'family-a', person_id: 'person-a', card_id: 'card-a', category_id: 'gifts', currency: 'BRL' };
    return {
        purchase: { ...dimensions, event_id: 'purchase-a', amount_minor: 100001, installment_total: 2 },
        installments: [1, 2].map(index => ({ ...dimensions, event_id: 'part-' + index,
            purchase_ref: 'purchase-a', index, total: 2, billing_period: index === 1 ? '2042-12' : '2043-01',
            amount_minor: index === 1 ? 50000 : 50001, evidence_state: index === 1 ? 'confirmed' : 'projected' }))
    };
}

test('NEXT02B:SCHEDULE preserves explicit amounts, links and projected state across years', () => {
    const input = fixture(), output = projectInstallmentSchedule(input);
    assert.equal(output.completeness, 'complete');
    assert.equal(output.purchase_amount_minor, 100001);
    assert.equal(output.observed_total_minor, 100001);
    assert.deepEqual(output.installments.map(p => [p.index, p.billing_period, p.amount_minor, p.evidence_state]),
        [[1, '2042-12', 50000, 'confirmed'], [2, '2043-01', 50001, 'projected']]);
    assert.equal(output.purchase_ref, 'purchase-a');
    assert.deepEqual(output.installments[1].field_provenance.amount_minor,
        { event_id: 'part-2', field: 'amount_minor' });
});

test('NEXT02B:MISSING does not estimate or invent missing installments', () => {
    const input = fixture(); input.installments.pop();
    const output = projectInstallmentSchedule(input);
    assert.equal(output.completeness, 'incomplete');
    assert.deepEqual(output.missing_indexes, [2]);
    assert.equal(output.observed_total_minor, 50000);
    assert.equal(output.purchase_amount_minor, 100001);
    assert.equal(output.installments.length, 1);
    const impossible = fixture();
    impossible.installments.pop();
    impossible.installments[0].amount_minor = impossible.purchase.amount_minor;
    assert.throws(() => projectInstallmentSchedule(impossible), /installment_amount/);
    const insufficient = fixture();
    insufficient.purchase.installment_total = 3;
    insufficient.installments = [insufficient.installments[0]];
    insufficient.installments[0].total = 3;
    insufficient.installments[0].amount_minor = insufficient.purchase.amount_minor - 1;
    assert.throws(() => projectInstallmentSchedule(insufficient), /installment_amount/);
});

test('NEXT02B:IDENTITY rejects orphan, duplicate and cross-dimension installments', () => {
    for (const field of ['purchase_ref', 'family_id', 'person_id', 'card_id', 'category_id', 'currency']) {
        const input = fixture(); input.installments[1][field] = 'different';
        assert.throws(() => projectInstallmentSchedule(input), /installment_/);
    }
    for (const field of ['index', 'event_id']) {
        const input = fixture(); input.installments[1][field] = input.installments[0][field];
        assert.throws(() => projectInstallmentSchedule(input), /installment_/);
    }
});

test('NEXT02B:AMOUNTS rejects mismatch, overpayment, coercion and overflow', () => {
    for (const amount of [50000, 100002, -1, 0, 0.5, '50001', Number.MAX_SAFE_INTEGER + 1]) {
        const input = fixture(); input.installments[1].amount_minor = amount;
        assert.throws(() => projectInstallmentSchedule(input));
    }
    const input = fixture(); input.purchase.amount_minor = Number.MAX_SAFE_INTEGER;
    input.installments.forEach(p => { p.amount_minor = Number.MAX_SAFE_INTEGER; });
    assert.throws(() => projectInstallmentSchedule(input), /installment_amount/);
});

test('NEXT02B:SCHEMA rejects unknown fields, dates and states without silent filtering', () => {
    for (const [field, value] of [['billing_period', '2043-13'], ['billing_period', '2043-1'],
        ['evidence_state', 'paid'], ['total', 3], ['index', 0], ['extra', true]]) {
        const input = fixture(); input.installments[0][field] = value;
        assert.throws(() => projectInstallmentSchedule(input), /installment_/);
    }
    const input = fixture(); input.purchase.installment_total = 1000000000;
    assert.throws(() => projectInstallmentSchedule(input), /installment_/);
});

test('NEXT02B:IMMUTABLE deterministic ordering and defensive immutable output', () => {
    const input = fixture(), original = structuredClone(input);
    const baseline = projectInstallmentSchedule(input);
    input.installments.reverse();
    assert.deepEqual(projectInstallmentSchedule(input), baseline);
    input.installments[0].amount_minor = 1;
    assert.equal(baseline.installments[1].amount_minor, 50001);
    assert.throws(() => { baseline.installments[0].amount_minor = 1; }, TypeError);
    assert.deepEqual(projectInstallmentSchedule(original), baseline);
});

test('NEXT02B:BOUNDARY rejects accessors without executing them and malformed JSON', () => {
    let reads = 0;
    const input = fixture();
    Object.defineProperty(input.purchase, 'amount_minor', {
        enumerable: true, get() { reads++; return 100001; }
    });
    assert.throws(() => projectInstallmentSchedule(input), /canonical_json_invalid/);
    assert.equal(reads, 0);
    for (const value of [null, false, [], { purchase: fixture().purchase, installments: null }]) {
        assert.throws(() => projectInstallmentSchedule(value));
    }
    const empty = fixture(); empty.installments = [];
    const result = projectInstallmentSchedule(empty);
    assert.equal(result.completeness, 'incomplete');
    assert.equal(result.observed_total_minor, 0);
    assert.deepEqual(result.missing_indexes, [1, 2]);
});

test('NEXT02B:OBSERVATIONS derives schedule only from validated current observations', () => {
    const input = observationInput(), output = projectObservations(input);
    assert.equal(output.installment_schedules.length, 1);
    const purchase = output.events.find(e => e.event_kind === 'purchase');
    const part = output.events.find(e => e.event_kind === 'installment');
    assert.equal(output.installment_schedules[0].purchase_ref, purchase.event_id);
    assert.equal(part.links[0].link_type, 'installment_of');
    assert.equal(part.links[0].to_event_id, purchase.event_id);
    assert.deepEqual(part.field_provenance.billing_period,
        { observation_id: part.observation_refs[0], field: 'billing_period' });
    for (const item of output.installment_schedules[0].installments) {
        const event = output.events.find(e => e.event_id === item.event_id);
        for (const [field, origin] of Object.entries(item.field_provenance)) {
            assert.equal(origin.event_version, event.event_version);
            const measured = origin.field === 'links' ? event.links[0].to_event_id : event[origin.field];
            assert.deepEqual(item[field], measured, 'provenance resolves: ' + field);
        }
    }
    assert.deepEqual(projectObservations({ ...input, observations: [...input.observations].reverse() }), output);
    const legacy = structuredClone(input); delete legacy.policyVersion;
    assert.throws(() => projectObservations(legacy), /source_policy_violation/);
});

test('NEXT02B:OBS-VERSIONS tombstones invalidate schedule without rewriting history', () => {
    const input = observationInput();
    const old = input.observations[2];
    const removed = structuredClone(old);
    removed.observation_id = 'obs-part-2-v2';
    removed.observation_version = 2;
    removed.previous_observation_id = old.observation_id;
    removed.source_version = 'v2';
    removed.normalized_payload.status = 'tombstoned';
    removed.field_provenance = Object.fromEntries(Object.keys(removed.normalized_payload)
        .map(k => [k, removed.observation_id]));
    removed.deduplication_key = observationDeduplicationKey(removed);
    removed.integrity_hash = observationDigest(removed);
    input.observations.push(removed);
    const output = projectObservations(input);
    assert.equal(output.installment_schedules[0].completeness, 'incomplete');
    assert.deepEqual(output.installment_schedules[0].missing_indexes, [2]);
    assert.equal(output.history.filter(e => e.event_kind === 'installment').length, 3);
    assert.equal(output.history.find(e => e.observation_refs[0] === old.observation_id).status, 'active');
    const orphan = observationInput();
    orphan.observations[0].normalized_payload.status = 'tombstoned';
    orphan.observations[0].integrity_hash = observationDigest(orphan.observations[0]);
    assert.throws(() => projectObservations(orphan), /installment_target_invalid/);
});

test('NEXT02B:OBS-LINK rejects re-signed orphan and dimension drift before scheduling', () => {
    for (const [field, value] of [['installment_purchase_ref', 'absent'], ['installment_total', 3],
        ['transaction_date', '2042-11-21'], ['installment_index', 1]]) {
        const input = observationInput();
        input.observations[2].normalized_payload[field] = value;
        input.observations[2].integrity_hash = observationDigest(input.observations[2]);
        assert.throws(() => projectObservations(input), /installment_/);
    }
});

test('NEXT02B:GATE requires exact slice inventory and executed properties from both files', () => {
    const path = require('node:path');
    const policy = require('../scripts/agent/financasBotNext02ValidationPolicy');
    const root = path.join(__dirname, '../src/next');
    assert.deepEqual(policy.inspectSources(root, 'N02-B').errors, []);
    assert.ok(policy.inspectSources(root).errors.includes('unexpected_executable_source:kernel/installmentSchedule.js'));
    assert.equal(policy.sliceContract('N02-A').paths.length, 14);
    assert.equal(policy.sliceContract('N02-B').paths.length, 15);
    assert.throws(() => policy.sliceContract('unknown'), /unknown_next02_slice/);
    const events = policy.sliceContract('N02-B').properties.map(p => ({ type: 'test:pass', data: {
        name: p.key + ' property', file: path.join(__dirname, p.file), nesting: 0, details: { type: 'test' }
    } }));
    assert.deepEqual(policy.validatePropertyEvents(events, 'N02-B').errors, []);
    for (const mutate of [e => e.pop(), e => { e[20].data.skip = true; },
        e => { e[20].data.todo = true; }, e => { e[20].type = 'test:fail'; },
        e => { e[20].data.file = __dirname + '/next02ObservationKernel.test.js'; },
        e => { e[20].data.nesting = 1; }, e => e.push(structuredClone(e[20])),
        e => { e[20].data.name = 'NEXT02B:UNKNOWN property'; },
        e => { e[20].type = 'test:stdout'; }]) {
        const candidate = structuredClone(events); mutate(candidate);
        assert.ok(policy.validatePropertyEvents(candidate, 'N02-B').errors.length);
    }
});
