'use strict';

const { canonicalValue, digest, freezeDeep } = require('./canonicalValue');

const POLICY = 'next02-import-v1';
const PAYLOAD_FIELDS = [
    'record_type', 'person_id', 'account_id', 'card_id', 'category_id',
    'amount_minor', 'currency', 'transaction_date', 'status',
    'related_record_ref', 'transfer_ref', 'settles_card_id'
];
const OBSERVATION_FIELDS = [
    'schema_version', 'observation_id', 'observation_version', 'previous_observation_id',
    'source_type', 'source_instance_ref', 'source_record_ref', 'source_version',
    'deduplication_key', 'observed_at', 'effective_at', 'coverage', 'normalized_payload',
    'evidence_state', 'field_provenance', 'origin_runtime', 'origin_operation_id',
    'integrity_hash', 'ingestion_policy_version'
];
const KIND_RULES = Object.freeze({
    purchase: { category: 'expense', instrument: 'either' },
    income: { category: 'income', instrument: 'account' },
    transfer: { category: null, instrument: 'account', relation: 'transfer_ref' },
    invoice_payment: { category: null, instrument: 'account', relation: 'settles_card_id' },
    refund: { category: 'expense', instrument: 'either', relation: 'related_record_ref' }
});

function requireThat(condition, code) {
    if (!condition) throw new Error(code);
}

function exactKeys(value, keys, code) {
    requireThat(value && !Array.isArray(value) && typeof value === 'object' &&
        Object.keys(value).length === keys.length &&
        keys.every(key => Object.hasOwn(value, key)), code);
}

function ref(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(value);
}

function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function instant(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function recordIdentity(o) {
    return [o.source_type, o.source_instance_ref, o.source_record_ref];
}

function observationDeduplicationKey(o) {
    return digest([...recordIdentity(o), o.source_version]);
}

function observationDigest(o) {
    // Validate descriptors before reading values, including when called by
    // a test/import normalizer before integrity_hash has been filled.
    canonicalValue(o);
    const content = { ...o };
    delete content.integrity_hash;
    return digest(content);
}

function indexCatalog(items, fields) {
    requireThat(Array.isArray(items), 'catalog_schema_invalid');
    const map = new Map();
    for (const item of items) {
        exactKeys(item, fields, 'catalog_schema_invalid');
        requireThat(ref(item.id), 'catalog_schema_invalid');
        requireThat(!map.has(item.id), 'catalog_duplicate');
        map.set(item.id, item);
    }
    return map;
}

function validateCatalog(c) {
    exactKeys(c, ['family_id', 'people', 'accounts', 'cards', 'categories'], 'catalog_schema_invalid');
    requireThat(ref(c.family_id), 'catalog_schema_invalid');
    const people = indexCatalog(c.people, ['id']);
    const accounts = indexCatalog(c.accounts, ['id', 'owner_id']);
    const cards = indexCatalog(c.cards, ['id', 'owner_id']);
    const categories = indexCatalog(c.categories, ['id', 'kind']);
    for (const item of [...accounts.values(), ...cards.values()]) {
        requireThat(people.has(item.owner_id), 'catalog_owner_unknown');
    }
    for (const item of categories.values()) {
        requireThat(['expense', 'income'].includes(item.kind), 'catalog_category_invalid');
    }
    return { people, accounts, cards, categories };
}

function validateObservation(o, sourceInstanceRef, indices) {
    exactKeys(o, OBSERVATION_FIELDS, 'observation_schema_invalid');
    requireThat(o.integrity_hash === observationDigest(o), 'observation_integrity_invalid');
    requireThat(o.origin_runtime === null && o.origin_operation_id === null, 'observation_origin_forbidden');
    requireThat(o.schema_version === 0 && o.source_type === 'import' &&
        o.source_instance_ref === sourceInstanceRef && o.ingestion_policy_version === POLICY,
    'source_policy_violation');
    for (const key of ['observation_id', 'source_record_ref', 'source_version']) {
        requireThat(ref(o[key]), 'observation_identity_invalid');
    }
    requireThat(Number.isSafeInteger(o.observation_version) && o.observation_version >= 1 &&
        (o.previous_observation_id === null || ref(o.previous_observation_id)), 'observation_identity_invalid');
    requireThat(o.deduplication_key === observationDeduplicationKey(o), 'observation_deduplication_invalid');
    requireThat(instant(o.observed_at) && (o.effective_at === null || instant(o.effective_at)), 'observation_time_invalid');
    requireThat(['confirmed', 'projected', 'estimated', 'incomplete', 'unavailable'].includes(o.evidence_state),
        'evidence_state_invalid');
    exactKeys(o.coverage, ['start', 'end', 'as_of', 'completeness'], 'coverage_schema_invalid');
    requireThat(instant(o.coverage.as_of) &&
        ['complete', 'partial', 'unknown', 'unavailable'].includes(o.coverage.completeness),
    'coverage_schema_invalid');
    const bounded = date(o.coverage.start) && date(o.coverage.end) && o.coverage.start <= o.coverage.end;
    requireThat(bounded || (o.coverage.start === null && o.coverage.end === null &&
        o.coverage.completeness !== 'complete'), 'coverage_range_invalid');

    const p = o.normalized_payload;
    exactKeys(p, PAYLOAD_FIELDS, 'payload_schema_invalid');
    exactKeys(o.field_provenance, PAYLOAD_FIELDS, 'field_provenance_invalid');
    requireThat(PAYLOAD_FIELDS.every(field => o.field_provenance[field] === o.observation_id), 'field_provenance_invalid');
    requireThat(Object.hasOwn(KIND_RULES, p.record_type), 'event_kind_unsupported');
    requireThat(date(p.transaction_date), 'payload_date_invalid');
    requireThat(!bounded || (p.transaction_date >= o.coverage.start && p.transaction_date <= o.coverage.end),
        'observation_coverage_mismatch');
    requireThat(Number.isSafeInteger(p.amount_minor) && !Object.is(p.amount_minor, -0) &&
        (p.record_type === 'transfer' ? p.amount_minor !== 0 : p.amount_minor >= 0), 'amount_minor_invalid');
    requireThat(p.currency === 'BRL', 'currency_unsupported');
    requireThat(['active', 'tombstoned'].includes(p.status), 'event_status_invalid');
    requireThat(indices.people.has(p.person_id), 'person_unknown');
    const rule = KIND_RULES[p.record_type];
    const account = p.account_id !== null ? indices.accounts.get(p.account_id) : null;
    const card = p.card_id !== null ? indices.cards.get(p.card_id) : null;
    requireThat((Boolean(account) !== Boolean(card)) &&
        (rule.instrument !== 'account' || Boolean(account)) &&
        (p.account_id === null || Boolean(account)) && (p.card_id === null || Boolean(card)), 'instrument_invalid');
    // A family card can be used by another family member (v1 behavior).
    // Accounts remain person-owned in this first normalized import policy.
    requireThat(!account || account.owner_id === p.person_id, 'instrument_owner_mismatch');
    if (rule.category === null) {
        requireThat(p.category_id === null, 'category_invalid');
    } else {
        requireThat(indices.categories.has(p.category_id), 'category_unknown');
        requireThat(indices.categories.get(p.category_id).kind === rule.category, 'category_kind_invalid');
    }
    for (const field of ['related_record_ref', 'transfer_ref', 'settles_card_id']) {
        requireThat(rule.relation === field ? ref(p[field]) : p[field] === null, 'economic_link_invalid');
    }
    if (p.record_type === 'invoice_payment') {
        requireThat(indices.cards.has(p.settles_card_id), 'invoice_card_unknown');
    }
}

function eventFromObservation(o, familyId, catalogRef, transferTargets) {
    const p = o.normalized_payload;
    const identity = digest([familyId, ...recordIdentity(o)]);
    const fieldSources = {
        event_kind: 'record_type', person_id: 'person_id', account_id: 'account_id',
        card_id: 'card_id', category_id: 'category_id', amount_minor: 'amount_minor',
        currency: 'currency', transaction_date: 'transaction_date', status: 'status'
    };
    const event = {
        schema_version: 0, event_id: 'evt_' + identity,
        event_version: o.observation_version,
        previous_event_version: o.observation_version === 1 ? null : o.observation_version - 1,
        event_kind: p.record_type, family_id: familyId, person_id: p.person_id,
        account_id: p.account_id, card_id: p.card_id, category_id: p.category_id,
        amount_minor: p.amount_minor, currency: p.currency,
        transaction_date: p.transaction_date, billing_period: null, due_date: null,
        settlement_date: null, as_of: o.coverage.as_of, status: p.status,
        evidence_state: o.evidence_state, coverage: o.coverage,
        observation_refs: [o.observation_id],
        field_provenance: Object.fromEntries(Object.entries(fieldSources).map(([field, source]) =>
            [field, { observation_id: o.observation_id, field: source }])),
        links: [], economic_identity_key: identity, idempotency_key: o.deduplication_key,
        origin_operation_id: null, receipt_ref: null,
        source_policy_version: POLICY, created_at: o.observed_at
    };
    event.field_provenance.family_id = { catalog_ref: catalogRef, field: 'family_id' };
    for (const field of ['coverage', 'evidence_state']) {
        event.field_provenance[field] = { observation_id: o.observation_id, field };
    }
    const related = p.record_type === 'refund' ? p.related_record_ref :
        p.record_type === 'transfer' ? (transferTargets.get(p.transfer_ref) || []).find(r => r !== o.source_record_ref) : null;
    if (related) {
        event.links.push({
            link_type: p.record_type === 'refund' ? 'compensates' : 'originates_from',
            from_event_id: event.event_id,
            to_event_id: 'evt_' + digest([familyId, o.source_type, o.source_instance_ref, related]),
            link_version: o.observation_version,
            provenance: { observation_id: o.observation_id,
                field: p.record_type === 'refund' ? 'related_record_ref' : 'transfer_ref' }
        });
    }
    return event;
}

function link(from, to, type, field) {
    return {
        link_type: type, from_event_id: from.event_id, to_event_id: to.event_id,
        link_version: from.event_version,
        provenance: { observation_id: from.observation_refs[0], field },
        target_event_version: to.event_version
    };
}

function validateRelations(current, observationById) {
    const byRecord = new Map(current.map(e =>
        [observationById.get(e.observation_refs[0]).source_record_ref, e]));
    const refunds = new Map();
    const transfers = new Map();
    for (const e of current) {
        if (e.status !== 'active') continue;
        const p = observationById.get(e.observation_refs[0]).normalized_payload;
        if (e.event_kind === 'refund') {
            const target = byRecord.get(p.related_record_ref);
            requireThat(target && target.status === 'active' && target.event_kind === 'purchase', 'refund_target_invalid');
            requireThat(['family_id', 'person_id', 'account_id', 'card_id', 'category_id', 'currency'].every(k =>
                target[k] === e[k]) && target.transaction_date <= e.transaction_date &&
                (e.evidence_state !== 'confirmed' || target.evidence_state === 'confirmed'), 'refund_dimensions_mismatch');
            const total = (refunds.get(target.event_id) || 0n) + BigInt(e.amount_minor);
            requireThat(total <= BigInt(target.amount_minor), 'refund_exceeds_purchase');
            refunds.set(target.event_id, total);
            e.links = [link(e, target, 'compensates', 'related_record_ref')];
        }
        if (e.event_kind === 'transfer') {
            const pair = transfers.get(p.transfer_ref) || [];
            pair.push(e);
            transfers.set(p.transfer_ref, pair);
        }
    }
    for (const pair of transfers.values()) {
        requireThat(pair.length === 2, 'transfer_pair_invalid');
        const [a, b] = pair;
        requireThat(a.account_id !== b.account_id &&
            ['family_id', 'currency', 'transaction_date', 'evidence_state'].every(k => a[k] === b[k]) &&
            BigInt(a.amount_minor) + BigInt(b.amount_minor) === 0n, 'transfer_pair_invalid');
        // originates_from records the economic pair; it is not an income/expense.
        a.links = [link(a, b, 'originates_from', 'transfer_ref')];
        b.links = [link(b, a, 'originates_from', 'transfer_ref')];
    }
}

function projectObservations(input) {
    // Defensive copy once, with no getters/non-JSON coercion at the boundary.
    const { observations, catalog, sourceInstanceRef } = JSON.parse(canonicalValue(input));
    exactKeys(input, ['observations', 'catalog', 'sourceInstanceRef'], 'kernel_input_invalid');
    requireThat(Array.isArray(observations) && ref(sourceInstanceRef), 'kernel_input_invalid');
    const indices = validateCatalog(catalog);
    const byId = new Map(), byDedup = new Map(), chains = new Map();
    for (const o of observations) {
        validateObservation(o, sourceInstanceRef, indices);
        const prior = byId.get(o.observation_id) || byDedup.get(o.deduplication_key);
        if (prior) {
            requireThat(canonicalValue(prior) === canonicalValue(o), 'observation_identity_conflict');
            continue;
        }
        byId.set(o.observation_id, o);
        byDedup.set(o.deduplication_key, o);
        const key = canonicalValue(recordIdentity(o));
        const chain = chains.get(key) || [];
        chain.push(o);
        chains.set(key, chain);
    }
    const transferTargets = new Map();
    for (const o of byId.values()) {
        if (o.normalized_payload.record_type !== 'transfer') continue;
        const key = o.normalized_payload.transfer_ref;
        const records = new Set(transferTargets.get(key) || []);
        records.add(o.source_record_ref);
        requireThat(records.size <= 2, 'transfer_identity_conflict');
        transferTargets.set(key, [...records].sort());
    }
    const catalogRef = 'catalog_' + digest(catalog);
    const history = [], events = [];
    for (const key of [...chains.keys()].sort()) {
        const chain = chains.get(key).sort((a, b) => a.observation_version - b.observation_version);
        for (let i = 0; i < chain.length; i++) {
            const o = chain[i], previous = chain[i - 1];
            requireThat(o.observation_version === i + 1 &&
                o.previous_observation_id === (previous ? previous.observation_id : null) &&
                (!previous || o.observed_at >= previous.observed_at), 'observation_chain_invalid');
            history.push(eventFromObservation(o, catalog.family_id, catalogRef, transferTargets));
        }
        events.push(eventFromObservation(chain[chain.length - 1], catalog.family_id, catalogRef, transferTargets));
    }
    validateRelations(events, byId);
    // Each historical event is a projection of its immutable observation.
    // Current relations are resolved only against the complete current snapshot.
    return freezeDeep({
        policy_version: POLICY,
        family_id: catalog.family_id,
        observations: [...byId.values()].sort((a, b) => a.observation_id < b.observation_id ? -1 : 1),
        history, events
    });
}

module.exports = { observationDigest, observationDeduplicationKey, projectObservations };
