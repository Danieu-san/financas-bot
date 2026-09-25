'use strict';
const { parseDate, parseMonth } = require('./civilCalendar');
const { validateLiteral } = require('./literalTypes');
const { selectConsumption } = require('./metricSelection');
const { readNodeIdentity: identity, readReference, readReferenceId, readReferenceIds } = require('./metricReferences');
const fail = code => { throw new Error(`direct_metric_${code}`); };
const id = value => { validateLiteral({ type: 'id', value }); return value; };
// Reviewed projection of evidence-snapshot.schema.json/payload_event. Kept in
// the executable closure; a test requires equality with the normative schema.
const EVENT_V1_FIELDS = Object.freeze(['id', 'date', 'person_id', 'account_id', 'card_id', 'category_id', 'amount_minor', 'state',
    'merchant_key', 'compensates', 'transfer_pair', 'settles_card_id', 'installment_plan', 'installment_number', 'installment_total']);
function same(a, b) { return a.ref === b.ref && a.version === b.version; }
function period(context, kind, basis) {
    if (context.get('time_basis') !== basis) fail('basis');
    const p = context.get('period');
    if (p.get('kind') !== kind) fail('period');
    const value = p.get('value');
    if (kind === 'month') parseMonth(value); else parseDate(value);
    return value;
}
function subject(context, kind) {
    const s = context.get('subject');
    if (s.get('kind') !== kind) fail('scope');
    return id(s.get('ref_id'));
}
function checkedMoney(value) {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail('amount');
    return value;
}
function inclusiveRange(context, basis) {
    if (context.get('time_basis') !== basis) fail('basis');
    const p = context.get('period');
    if (p.get('kind') !== 'range' || p.get('start_inclusive') !== true || p.get('end_inclusive') !== true) fail('period');
    const start = p.get('start'); const end = p.get('end'); parseDate(start); parseDate(end);
    if (start > end) fail('period');
    return date => { parseDate(date); return date >= start && date <= end; };
}
function collectionMatches(collection, entries, name, kind) {
    identity(collection, 'collection');
    if (collection.get('collection_name') !== name) fail('collection');
    const members = []; for (const member of collection.get('members')) members.push(id(member));
    const actual = []; for (const entry of entries) actual.push(identity(entry, kind).ref);
    if (new Set(members).size !== members.length || new Set(actual).size !== actual.length
        || members.length !== actual.length || members.some((ref, i) => ref !== actual[i])) fail('collection');
}
function selectedIds(selected) {
    const result = []; const seen = new Set();
    for (const node of selected) {
        const value = id(node.get('id')); if (seen.has(value)) fail('duplicate');
        seen.add(value); result.push(value);
    }
    return result;
}

// Metric-only fixed dispatch. No graph predicates, expected values or oracle.
// A functional answer from this helper is not acceptance of a claim.
function evaluateDirectMetric(operands, metric) {
    const context = operands.context;
    if (metric === 'account_balance' || metric === 'movement_ids') {
        const account = identity(operands.account, 'account');
        if (subject(context, 'account') !== account.ref) fail('scope');
        let contains; let result = 0;
        if (metric === 'account_balance') {
            const end = period(context, 'as_of', 'event_date');
            const start = operands.account.get('opening_balance_as_of'); parseDate(start);
            if (start > end) fail('period');
            result = checkedMoney(operands.account.get('opening_balance_minor'));
            contains = date => date >= start && date <= end;
        } else {
            const month = period(context, 'month', 'event_date');
            contains = date => date.slice(0, 7) === month;
        }
        const selected = operands.events.select(event => {
            identity(event, 'event');
            const date = event.get('date'); parseDate(date);
            const state = event.get('state');
            if (!['confirmed', 'projected'].includes(state)) fail('state');
            const ownerMatches = event.has('account_id')
                && same(readReference(event, 'account_id', 'account'), account);
            return state === 'confirmed' && contains(date) && ownerMatches;
        });
        if (metric === 'movement_ids') return selectedIds(selected);
        for (const event of selected) result = checkedMoney(result + checkedMoney(event.get('amount_minor')));
        return result;
    }
    if (['bills_open', 'due_bill_ids', 'due_bills_total'].includes(metric)) {
        let contains; let ownerMatches;
        if (metric === 'bills_open') {
            const month = period(context, 'month', 'due_date');
            contains = date => { parseDate(date); return date.slice(0, 7) === month; };
            const s = context.get('subject'); const kind = s.get('kind');
            const family = identity(operands.family, 'family');
            if (kind === 'family') {
                if (id(s.get('ref_id')) !== family.ref) fail('scope');
                const members = readReferenceIds(operands.family, 'members');
                ownerMatches = owner => members.includes(owner.ref);
            } else if (kind === 'person') {
                const person = id(s.get('ref_id')); ownerMatches = owner => owner.ref === person;
            } else fail('scope');
        } else {
            contains = inclusiveRange(context, 'due_date');
            const person = identity(operands.person, 'person');
            if (person.ref !== subject(context, 'person')) fail('scope');
            ownerMatches = owner => same(owner, person);
        }
        const selected = operands.bills.select(bill => {
            identity(bill, 'bill'); const status = bill.get('status');
            if (!['open', 'paid', 'cancelled'].includes(status)) fail('status');
            const timely = contains(bill.get('due_date'));
            const owner = metric === 'bills_open' ? { ref: readReferenceId(bill, 'person_id') }
                : readReference(bill, 'person_id', 'person');
            return status === 'open' && timely && ownerMatches(owner);
        });
        if (metric === 'due_bill_ids') return selectedIds(selected);
        let sum = 0; for (const bill of selected) sum = checkedMoney(sum + checkedMoney(bill.get('amount_minor')));
        return sum;
    }
    if (metric === 'reminder_count' || metric === 'calendar_event_count') {
        const reminder = metric === 'reminder_count'; const kind = reminder ? 'reminder' : 'calendar_event';
        const contains = inclusiveRange(context, 'scheduled_at');
        const person = identity(operands.person, 'person');
        if (person.ref !== subject(context, 'person')) fail('scope');
        collectionMatches(operands.collection, operands.entries, reminder ? 'reminders' : 'calendar_events', kind);
        const selected = operands.entries.select(entry => {
            identity(entry, kind); const timely = contains(entry.get('scheduled_at'));
            const owner = readReference(entry, 'person_id', 'person');
            return timely && same(owner, person);
        });
        return selected.length();
    }
    if (metric === 'similar_event_ids') {
        const month = period(context, 'month', 'event_date');
        const merchant = identity(operands.merchant, 'merchant_identity');
        if (merchant.ref !== subject(context, 'merchant')) fail('scope');
        const selected = operands.events.select(event => {
            identity(event, 'event'); const date = event.get('date'); parseDate(date);
            const state = event.get('state'); if (!['confirmed', 'projected'].includes(state)) fail('state');
            const matches = event.has('merchant_key') && same(readReference(event, 'merchant_key', 'merchant_identity'), merchant);
            return state === 'confirmed' && date.slice(0, 7) === month && matches;
        });
        return selectedIds(selected);
    }
    if (['balance_delta', 'invoice_payment_amount', 'invoice_payment_target_card', 'statement_payment_correspondence'].includes(metric)) {
        const event = operands.event; const eventId = identity(event, 'event');
        const day = period(context, 'date', 'event_date');
        const actualDay = event.get('date'); parseDate(actualDay);
        if (actualDay !== day) fail('period');
        if (event.get('state') !== 'confirmed') fail('state');
        if (metric === 'balance_delta') {
            const account = readReferenceId(event, 'account_id');
            if (account !== subject(context, 'account')) fail('scope');
            return checkedMoney(event.get('amount_minor'));
        }
        if (subject(context, 'event') !== eventId.ref) fail('scope');
        if (metric === 'invoice_payment_amount') {
            // Admission already binds scalar references to typed targets. This
            // formula needs the nominal category, not the target payload.
            if (readReferenceId(event, 'category_id') !== 'neutral.invoice_payment') fail('payment_category');
            readReferenceId(event, 'account_id');
            readReferenceId(event, 'settles_card_id');
            return Math.abs(checkedMoney(event.get('amount_minor')));
        }
        if (metric === 'invoice_payment_target_card') {
            const target = readReference(event, 'settles_card_id', 'card');
            if (!same(target, identity(operands.card, 'card'))) fail('target');
            return target.ref;
        }
        // The admitted v1 schema has no statement-link fields. Enumerate the
        // actual exposed structure; a card reference cannot stand in for one.
        for (const name of event.keys()) if (!EVENT_V1_FIELDS.includes(name)) fail('statement_schema');
        return 'unproven';
    }
    if (metric === 'eligible_event_count') {
        const source = operands.source; identity(source, 'source_state');
        const month = period(context, 'month', 'event_date');
        const actual = source.get('period'); parseMonth(actual);
        if (actual !== month) fail('period');
        if (source.get('coverage') !== 'complete') fail('coverage');
        const s = context.get('subject'); const kind = s.get('kind');
        const category = id(s.get(kind === 'category' ? 'ref_id' : 'category_id'));
        if (readReferenceId(source, 'category_id') !== category) fail('scope');
        if (source.has('entity_id')) {
            const owner = kind === 'person_category' ? id(s.get('person_id'))
                : kind === 'family_category' ? id(s.get('family_id')) : id(operands.family.get('id'));
            if (id(source.get('entity_id')) !== owner) fail('scope');
        }
        const expected = source.get('event_count');
        if (!Number.isSafeInteger(expected) || expected < 0 || Object.is(expected, -0)) fail('count');
        const selected = selectConsumption(operands, 'category');
        const actualCount = selected.length();
        if (expected !== actualCount) fail('count');
        return expected;
    }
    if (metric === 'side_effect_count') {
        const turn = identity(operands.turn, 'turn');
        if (turn.ref !== subject(context, 'turn')) fail('scope');
        period(context, 'as_of', 'request_execution');
        collectionMatches(operands.collection, operands.entries, 'side_effects', 'side_effect');
        const selected = operands.entries.select(entry => same(readReference(entry, 'turn_id', 'turn'), turn));
        return selected.length();
    }
    if (metric === 'source_coverage') {
        const source = operands.source;
        if (identity(source, 'source_state').ref !== subject(context, 'source')) fail('scope');
        const month = period(context, 'month', 'source_period');
        const actual = source.get('period'); parseMonth(actual);
        if (month !== actual) fail('period');
        const coverage = source.get('coverage');
        if (!['complete', 'partial', 'unavailable'].includes(coverage)) fail('coverage');
        return coverage;
    }
    if (metric === 'owned_cards' || metric === 'merchant_rule_ids') {
        const ownership = metric === 'owned_cards';
        const scopeKind = ownership ? 'person' : 'merchant_identity';
        const target = identity(ownership ? operands.person : operands.merchant, scopeKind);
        if (target.ref !== subject(context, ownership ? 'person' : 'merchant')) fail('scope');
        period(context, 'as_of', 'registry_current');
        const population = ownership ? operands.cards : operands.rules;
        const selected = population.select(node => {
            identity(node, ownership ? 'card' : 'merchant_rule');
            return same(readReference(node, ownership ? 'owner_id' : 'merchant_key', scopeKind), target);
        });
        return selectedIds(selected);
    }
    fail('metric');
}

module.exports = { evaluateDirectMetric, EVENT_V1_FIELDS };
