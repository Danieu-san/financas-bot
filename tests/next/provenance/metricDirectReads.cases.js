'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createInstrumentedAccess, createNodeSetAccess } = require('../../../src/next/provenance/instrumentedAccess');
const { evaluateDirectMetric } = require('../../../src/next/provenance/metricDirectReads');
const scalar = { type: 'scalar' }; const version = `sha256:${'a'.repeat(64)}`;
function instrument(rows, links = [], roster) {
    const observations = [];
    const bindings = rows.map(([alias, kind, value, fields]) => ({ alias, role: 'test', value,
        ...(kind ? { identity: { kind, ref_id: value.id, version } } : {}),
        shape: { type: 'record', fields: fields || Object.fromEntries(Object.keys(value).map(k => [k, scalar])) } }));
    const options = { bindings, links, emit: e => observations.push(e) };
    const access = roster ? createNodeSetAccess({ ...options, role: 'test', roster }) : createInstrumentedAccess(options);
    return { access, observations };
}
function context(subject, period, time_basis) {
    return instrument([['ctx', null, { subject, period, time_basis }, { subject: { type: 'record', fields: { kind: scalar, ref_id: scalar } },
        period: { type: 'record', fields: { kind: scalar, value: scalar, start: scalar, end: scalar, start_inclusive: scalar, end_inclusive: scalar } }, time_basis: scalar }]]).access.handle('ctx');
}
function assertResolvedReferenceReads(observations) {
    for (let i = 0; i < observations.length; i++) {
        const event = observations[i];
        if (event[1] !== 'traverse') continue;
        assert.ok(observations.slice(0, i).some(e => e[1] === 'get' && e[2] === event[2]
            && JSON.stringify(e[4]) === JSON.stringify(event[4])), `${event[2]}: ${event[4]} scalar before traverse`);
    }
}
function payment() {
    const f = instrument([['event', 'event', { id: 'payment', date: '2042-06-13', state: 'confirmed', amount_minor: -300,
        category_id: 'neutral.invoice_payment', account_id: 'account', settles_card_id: 'card' }],
    ['category', 'category', { id: 'neutral.invoice_payment', kind: 'neutral' }], ['account', 'account', { id: 'account' }],
    ['card', 'card', { id: 'card' }]], ['category_id', 'account_id', 'settles_card_id'].map((field, i) => ({
        id: `link${i}`, source: 'event', field, target: ['category', 'account', 'card'][i], type: 'ref' })));
    return { ...f, operands: { context: context({ kind: 'event', ref_id: 'payment' }, { kind: 'date', value: '2042-06-13' }, 'event_date'),
        event: f.access.handle('event'), card: f.access.handle('card') } };
}

test('N02G:DIRECT-METRIC-001 movement preserves sign and payment magnitude requires observed links', () => {
    const f = payment();
    assert.equal(evaluateDirectMetric(f.operands, 'invoice_payment_amount'), 300);
    const balance = { ...f.operands, context: context({ kind: 'account', ref_id: 'account' }, { kind: 'date', value: '2042-06-13' }, 'event_date') };
    assert.equal(evaluateDirectMetric(balance, 'balance_delta'), -300);
    assert.equal(evaluateDirectMetric(f.operands, 'invoice_payment_target_card'), 'card');
    assertResolvedReferenceReads(f.observations);
    assert.ok(f.observations.some(e => e[1] === 'traverse' && e[4][0] === 'settles_card_id'));
    assert.throws(() => evaluateDirectMetric({ ...balance, context: context({ kind: 'account', ref_id: 'foreign' },
        { kind: 'date', value: '2042-06-13' }, 'event_date') }, 'balance_delta'), /direct_metric_scope/);
});

test('N02G:DIRECT-METRIC-002 card link never becomes proof of a particular statement', () => {
    const f = payment();
    assert.equal(evaluateDirectMetric(f.operands, 'statement_payment_correspondence'), 'unproven');
    assert.ok(f.observations.some(e => e[1] === 'keys' && e[2] === 'event'));
    f.access.revoke(); assert.throws(() => evaluateDirectMetric(f.operands, 'invoice_payment_amount'), /access_/);
});

test('N02G:DIRECT-METRIC-003 source coverage preserves each valid status and rejects period mismatch', () => {
    for (const coverage of ['complete', 'partial', 'unavailable']) {
        const f = instrument([['source', 'source_state', { id: 'source', period: '2042-06', coverage }]]);
        const operands = { source: f.access.handle('source'), context: context({ kind: 'source', ref_id: 'source' },
            { kind: 'month', value: '2042-06' }, 'source_period') };
        assert.equal(evaluateDirectMetric(operands, 'source_coverage'), coverage);
        assert.throws(() => evaluateDirectMetric({ ...operands, context: context({ kind: 'source', ref_id: 'source' },
            { kind: 'month', value: '2042-05' }, 'source_period') }, 'source_coverage'), /direct_metric_period/);
    }
});

test('N02G:DIRECT-METRIC-008 account opening balance bounds are inclusive and movement IDs do not filter economic kind', () => {
    const rows = [['a', 'account', { id: 'a', opening_balance_minor: 1000, opening_balance_as_of: '2042-06-10' }],
        ['b', 'account', { id: 'b' }]];
    const data = [['before', '2042-06-09', 'a', 'confirmed', 700], ['first', '2042-06-10', 'a', 'confirmed', 100],
        ['last', '2042-06-15', 'a', 'confirmed', -30], ['after', '2042-06-16', 'a', 'confirmed', -800],
        ['foreign', '2042-06-12', 'b', 'confirmed', 900], ['future', '2042-06-12', 'a', 'projected', 600],
        ['card-only', '2042-06-12', null, 'confirmed', -20]];
    for (const [ref, date, account, state, amount_minor] of data) rows.push([ref, 'event', { id: ref, date, state,
        amount_minor, ...(account ? { account_id: account } : {}) }, { id: scalar, date: scalar, state: scalar, amount_minor: scalar, account_id: scalar }]);
    const f = instrument(rows, data.filter(d => d[2]).map(([source, , target]) => ({ id: source, source, target, field: 'account_id', type: 'ref' })), data.map(d => d[0]));
    const account = instrument([rows[0]]).access.handle('a');
    const args = period => ({ account, events: f.access.handle,
        context: context({ kind: 'account', ref_id: 'a' }, period, 'event_date') });
    assert.equal(evaluateDirectMetric(args({ kind: 'as_of', value: '2042-06-15' }), 'account_balance'), 1070);
    assert.deepEqual(evaluateDirectMetric(args({ kind: 'month', value: '2042-06' }), 'movement_ids'), ['before', 'first', 'last', 'after']);
    assert.throws(() => evaluateDirectMetric(args({ kind: 'as_of', value: '2042-06-09' }), 'account_balance'), /direct_metric_period/);
    assert.ok(f.observations.some(e => e[1] === 'has' && e[2] === 'card-only'));
    assertResolvedReferenceReads(f.observations);
});

test('N02G:DIRECT-METRIC-004 ownership is computed from references, preserves order and excludes foreign owners', () => {
    const f = instrument([['a', 'card', { id: 'a', owner_id: 'p1' }], ['b', 'card', { id: 'b', owner_id: 'p2' }],
        ['c', 'card', { id: 'c', owner_id: 'p1' }], ['p1', 'person', { id: 'p1' }], ['p2', 'person', { id: 'p2' }]],
    ['a', 'b', 'c'].map((source, i) => ({ id: `owner${i}`, source, target: i === 1 ? 'p2' : 'p1', field: 'owner_id', type: 'ref' })), ['c', 'b', 'a']);
    const person = instrument([['p', 'person', { id: 'p1' }]]).access.handle('p');
    assert.deepEqual(evaluateDirectMetric({ cards: f.access.handle, person, context: context({ kind: 'person', ref_id: 'p1' },
        { kind: 'as_of', value: '2042-06-15' }, 'registry_current') }, 'owned_cards'), ['c', 'a']);
    assert.equal(f.observations.filter(e => e[1] === 'select_member').length, 3);
});

test('N02G:OWNED-CARDS-004 kernel consumes excluded owners and compares both ID and version', () => {
    // Kernel handles only, not admitted mutated graphs.
    for (const reverse of [false, true]) for (const suffix of ['one', 'two', 'three']) {
        const targetId = `owner-${suffix}`; const foreignId = `foreign-${suffix}`;
        const observations = []; const otherVersion = `sha256:${'b'.repeat(64)}`;
        const rows = [
            ['included', 'card', { id: `card-in-${suffix}`, owner_id: targetId }, version],
            ['foreign-card', 'card', { id: `card-out-${suffix}`, owner_id: foreignId }, version],
            ['old-card', 'card', { id: `card-old-${suffix}`, owner_id: targetId }, version],
            ['current-owner', 'person', { id: targetId, family_id: 'unused' }, version],
            ['foreign-owner', 'person', { id: foreignId, family_id: 'unused' }, version],
            ['old-owner', 'person', { id: targetId, family_id: 'unused' }, otherVersion]
        ];
        const bindings = rows.map(([alias, kind, value, v]) => ({ alias, role: 'cards', value,
            identity: { kind, ref_id: value.id, version: v },
            shape: { type: 'record', fields: Object.fromEntries(Object.keys(value).map(k => [k, scalar])) } }));
        const roster = ['included', 'foreign-card', 'old-card']; if (reverse) roster.reverse();
        const links = [['included', 'current-owner'], ['foreign-card', 'foreign-owner'], ['old-card', 'old-owner']]
            .map(([source, target], i) => ({ id: `owner-link-${i}`, source, target, field: 'owner_id', type: 'ref' }));
        const access = createNodeSetAccess({ bindings, links, roster, role: 'cards', emit: e => observations.push(e) });
        const target = instrument([['query', 'person', { id: targetId }]]);
        try {
            const result = evaluateDirectMetric({ cards: access.handle, person: target.access.handle('query'),
                context: context({ kind: 'person', ref_id: targetId }, { kind: 'as_of', value: '2042-06-15' }, 'registry_current') }, 'owned_cards');
            assert.deepEqual(result, [`card-in-${suffix}`]);
            for (const owner of ['current-owner', 'foreign-owner', 'old-owner']) {
                assert.ok(observations.some(e => e[1] === 'get' && e[2] === owner && e[4][0] === 'id'));
                assert.equal(observations.some(e => e[1] === 'get' && e[2] === owner && e[4][0] === 'family_id'), false);
            }
            assert.equal(observations.filter(e => e[1] === 'select_member').length, 3);
            access.assertHealthy(); target.access.assertHealthy();
        } finally { access.revoke(); target.access.revoke(); }
    }
});

test('N02G:DIRECT-METRIC-005 effect count is tied to complete collection and actual turn references', () => {
    function run(members) {
        const f = instrument([['e1', 'side_effect', { id: 'e1', turn_id: 't1' }], ['e2', 'side_effect', { id: 'e2', turn_id: 't2' }],
            ['t1', 'turn', { id: 't1' }], ['t2', 'turn', { id: 't2' }]],
        ['e1', 'e2'].map((source, i) => ({ id: `turn${i}`, source, target: `t${i + 1}`, field: 'turn_id', type: 'ref' })), ['e1', 'e2']);
        const collection = instrument([['collection', 'collection', { id: 'effects', collection_name: 'side_effects', members },
            { id: scalar, collection_name: scalar, members: { type: 'sequence', item: scalar } }]]).access.handle('collection');
        const turn = instrument([['turn', 'turn', { id: 't1' }]]).access.handle('turn');
        const result = evaluateDirectMetric({ entries: f.access.handle, collection, turn,
            context: context({ kind: 'turn', ref_id: 't1' }, { kind: 'as_of', value: '2042-06-15' }, 'request_execution') }, 'side_effect_count');
        assert.equal(f.observations.filter(e => e[1] === 'select_member').length, 2);
        assertResolvedReferenceReads(f.observations);
        return result;
    }
    assert.equal(run(['e1', 'e2']), 1);
    assert.throws(() => run([]), /direct_metric_collection/);
    assert.throws(() => run(['e1', 'e1']), /direct_metric_collection/);
});

const juneRange = { kind: 'range', start: '2042-06-15', end: '2042-06-30', start_inclusive: true, end_inclusive: true };
test('N02G:COLLECTION-KIND-004 kernel rejects wrong domain with empty or positive populations', () => {
    // Kernel handle boundary, not acceptance of synthetic mutated graphs.
    const domains = [['reminder_count', 'reminder', 'reminders'],
        ['calendar_event_count', 'calendar_event', 'calendar_events'], ['side_effect_count', 'side_effect', 'side_effects']];
    for (const [metric, kind, domain] of domains) for (const size of [0, 2]) for (const [, , name] of domains) {
        const effects = metric === 'side_effect_count'; const scopeKind = effects ? 'turn' : 'person';
        const field = effects ? 'turn_id' : 'person_id';
        const rows = Array.from({ length: size }, (_, i) => [`entry-${i}`, kind,
            { id: `entry-${i}`, [field]: 'scope-id', ...(effects ? {} : { scheduled_at: '2042-06-20' }) }]);
        const population = instrument([...rows, ['scope', scopeKind, { id: 'scope-id' }]], rows.map(([source], i) =>
            ({ id: `scope-link-${i}`, source, target: 'scope', field, type: 'ref' })), rows.map(([alias]) => alias));
        const collection = instrument([['collection', 'collection', { id: 'col', collection_name: name, members: rows.map(([alias]) => alias) },
            { id: scalar, collection_name: scalar, members: { type: 'sequence', item: scalar } }]]);
        const target = instrument([['scope', scopeKind, { id: 'scope-id' }]]);
        const ctx = context({ kind: scopeKind, ref_id: 'scope-id' }, effects ? { kind: 'as_of', value: '2042-06-20' } : juneRange,
            effects ? 'request_execution' : 'scheduled_at');
        try {
            const operands = { context: ctx, entries: population.access.handle, collection: collection.access.handle('collection'),
                [effects ? 'turn' : 'person']: target.access.handle('scope') };
            if (name === domain) assert.equal(evaluateDirectMetric(operands, metric), size);
            else assert.throws(() => evaluateDirectMetric(operands, metric), /^Error: direct_metric_collection$/);
            assert.equal(collection.observations.filter(e => e[1] === 'get' && e[4].join('.') === 'collection_name').length, 1);
            if (name !== domain) {
                assert.equal(collection.observations.some(e => e[1] === 'get' && e[4].join('.') === 'members'), false);
                assert.equal(population.observations.length, 0);
            }
            for (const control of [population.access, collection.access, target.access]) control.assertHealthy();
        } finally { for (const control of [population.access, collection.access, target.access]) control.revoke(); }
    }
});

test('N02G:DIRECT-METRIC-006 due dates include both boundaries and exclude status, owner and date mismatches', () => {
    const rows = [['start', '2042-06-15', 'open', 'p1'], ['end', '2042-06-30', 'open', 'p1'],
        ['after', '2042-07-01', 'open', 'p1'], ['paid', '2042-06-20', 'paid', 'p1'], ['foreign', '2042-06-20', 'open', 'p2']];
    function operands(range = juneRange) {
        const f = instrument([...rows.map(([alias, due_date, status, person_id]) => [alias, 'bill', { id: alias, due_date, status, person_id, amount_minor: 100 }]),
            ['p1', 'person', { id: 'p1' }], ['p2', 'person', { id: 'p2' }]], rows.map(([source, , , target], i) => ({
                id: `owner${i}`, source, target, field: 'person_id', type: 'ref' })), rows.map(row => row[0]));
        return { bills: f.access.handle, person: instrument([['person', 'person', { id: 'p1' }]]).access.handle('person'),
            context: context({ kind: 'person', ref_id: 'p1' }, range, 'due_date') };
    }
    assert.deepEqual(evaluateDirectMetric(operands(), 'due_bill_ids'), ['start', 'end']);
    assert.equal(evaluateDirectMetric(operands(), 'due_bills_total'), 200);
    assert.throws(() => evaluateDirectMetric(operands({ ...juneRange, end_inclusive: false }), 'due_bills_total'), /direct_metric_period/);
    assert.throws(() => evaluateDirectMetric(operands({ ...juneRange, start: '2042-07-01' }), 'due_bill_ids'), /direct_metric_period/);
});

test('N02G:DUE-BILL-IDS-004 kernel IDs ignore monetary values while totals consume them', () => {
    // Kernel handles only, not admitted graph mutations.
    for (const amounts of [[0, 0], [101, 307], [9999, 3]]) for (const metric of ['due_bill_ids', 'due_bills_total']) {
        const rows = [['first', '2042-06-15', 'open', 'p1', amounts[0]], ['last', '2042-06-30', 'open', 'p1', amounts[1]],
            ['foreign', '2042-06-20', 'open', 'p2', 500], ['paid', '2042-06-20', 'paid', 'p1', 700], ['late', '2042-07-01', 'open', 'p1', 900]];
        const bills = instrument([...rows.map(([alias, due_date, status, person_id, amount_minor]) =>
            [alias, 'bill', { id: alias, due_date, status, person_id, amount_minor }]), ['p1', 'person', { id: 'p1' }], ['p2', 'person', { id: 'p2' }]],
        rows.map(([source, , , target], i) => ({ id: `link-${i}`, source, target, field: 'person_id', type: 'ref' })), rows.map(row => row[0]));
        const person = instrument([['person', 'person', { id: 'p1' }]]);
        try {
            const value = evaluateDirectMetric({ bills: bills.access.handle, person: person.access.handle('person'),
                context: context({ kind: 'person', ref_id: 'p1' }, juneRange, 'due_date') }, metric);
            const reads = bills.observations.filter(e => e[1] === 'get' && e[4].join('.') === 'amount_minor');
            if (metric === 'due_bill_ids') { assert.deepEqual(value, ['first', 'last']); assert.equal(reads.length, 0); }
            else { assert.equal(value, amounts[0] + amounts[1]); assert.deepEqual(reads.map(e => e[2]), ['first', 'last']); }
            bills.access.assertHealthy(); person.access.assertHealthy();
        } finally { bills.access.revoke(); person.access.revoke(); }
    }
});

test('N02G:DIRECT-METRIC-012 family bills resolve every member even without a contributing bill', () => {
    function fixture(members, missing, empty = false) {
        const family = instrument([
            ['family-alias', 'family', { id: 'family-id', members },
                { id: scalar, members: { type: 'sequence', item: scalar } }],
            ...['person-a', 'person-b', 'no-bills'].map((id, i) => [`member-${i}`, 'person', { id }])
        ], members.filter(id => id !== missing).map(id => ({ id: `edge-${id}`, source: 'family-alias',
            target: `member-${['person-a', 'person-b', 'no-bills'].indexOf(id)}`, field: 'members', type: 'ref_list' })));
        const bills = empty ? { access: createNodeSetAccess({ role: 'bills', bindings: [], emit() {} }) } : instrument([
            ...['person-a', 'person-b'].map((person_id, i) => [`bill-${i}`, 'bill', {
                id: `bill-id-${i}`, due_date: '2042-06-20', status: 'open', person_id, amount_minor: [13, 29][i] }]),
            ...['person-a', 'person-b'].map((id, i) => [`owner-${i}`, 'person', { id }])
        ], [0, 1].map(i => ({ id: `owner-edge-${i}`, source: `bill-${i}`, target: `owner-${i}`,
            field: 'person_id', type: 'ref' })), ['bill-0', 'bill-1']);
        return { family, bills, run: () => evaluateDirectMetric({ family: family.access.handle('family-alias'),
            bills: bills.access.handle, context: context({ kind: 'family', ref_id: 'family-id' },
                { kind: 'month', value: '2042-06' }, 'due_date') }, 'bills_open') };
    }
    for (const [members, expected] of [[[], 0], [['person-a'], 13], [['person-b', 'person-a', 'no-bills'], 42]]) {
        const f = fixture(members);
        try {
            assert.equal(f.run(), expected);
            assert.equal(f.family.observations.filter(e => e[1] === 'traverse').length, members.length);
            assert.ok(f.family.observations.some(e => e[1] === 'length'));
            assert.ok(f.family.observations.some(e => e[1] === 'iterate'));
            assert.equal(f.family.observations.some(e => e[2].startsWith('member-')), false);
            assert.equal(f.bills.observations.some(e => e[2].startsWith('owner-')), false);
        } finally { f.family.access.revoke(); f.bills.access.revoke(); }
    }
    for (const empty of [false, true]) {
        const valid = fixture(['person-a', 'no-bills'], undefined, empty);
        const invalid = fixture(['person-a', 'no-bills'], 'no-bills', empty);
        try {
            assert.equal(valid.run(), empty ? 0 : 13);
            assert.throws(invalid.run, /access_/);
        } finally {
            for (const f of [valid, invalid]) { f.family.access.revoke(); f.bills.access.revoke(); }
        }
    }
});

function referenceSelectionFixture(metric, suffix, reverse = false) {
    const bill = metric === 'due_bill_ids' || metric === 'due_bills_total';
    const card = metric === 'owned_cards';
    const kind = bill ? 'bill' : card ? 'card' : 'merchant_rule';
    const targetKind = bill || card ? 'person' : 'merchant_identity';
    const field = bill ? 'person_id' : card ? 'owner_id' : 'merchant_key';
    const targetId = `target-${suffix}`; const foreignId = `foreign-${suffix}`;
    const roster = reverse ? ['excluded-alias', 'included-alias'] : ['included-alias', 'excluded-alias'];
    const f = instrument([
        ...[['included-alias', targetId], ['excluded-alias', foreignId]].map(([alias, ref]) => [alias, kind,
            { id: `${alias}-${suffix}`, [field]: ref, ...(bill ? { due_date: '2042-06-20', status: 'open', amount_minor: 100 } : {}) }]),
        ['target-alias', targetKind, { id: targetId }], ['foreign-alias', targetKind, { id: foreignId }]
    ], [['included-alias', 'target-alias'], ['excluded-alias', 'foreign-alias']].map(([source, target], i) => ({
        id: `ref-${i}`, source, target, field, type: 'ref' })), roster);
    const target = instrument([['query-alias', targetKind, { id: targetId }]]);
    const role = bill ? 'bills' : card ? 'cards' : 'rules';
    const operands = { [role]: f.access.handle, [bill || card ? 'person' : 'merchant']: target.access.handle('query-alias'),
        context: context({ kind: bill || card ? 'person' : 'merchant', ref_id: targetId },
            bill ? juneRange : { kind: 'as_of', value: '2042-06-15' }, bill ? 'due_date' : 'registry_current') };
    return { ...f, target, operands, role, field, targetId, roster };
}

const referenceMetrics = ['due_bill_ids', 'due_bills_total', 'owned_cards', 'merchant_rule_ids'];
test('N02G:DIRECT-METRIC-009 reference selection reads source IDs and follows targets independently of aliases and order', () => {
    for (const metric of referenceMetrics) for (const suffix of ['a', 'b', 'c']) for (const reverse of [false, true]) {
        const f = referenceSelectionFixture(metric, suffix, reverse);
        try {
            assert.deepEqual(evaluateDirectMetric(f.operands, metric), metric === 'due_bills_total' ? 100 : [`included-alias-${suffix}`]);
            for (const alias of f.roster) {
                const read = f.observations.findIndex(e => e[1] === 'get' && e[2] === alias && e[4][0] === f.field);
                const traversal = f.observations.findIndex(e => e[1] === 'traverse' && e[2] === alias && e[4][0] === f.field);
                assert.ok(read >= 0 && traversal > read, `${metric}: scalar read precedes its separate traversal`);
            }
        } finally {
            for (const control of [f.access, f.target.access]) { control.revoke(); control.assertHealthy(); }
        }
    }
});

test('N02G:DIRECT-METRIC-010 evaluator rejects absent, malformed or divergent scalar references at its handle boundary', () => {
    for (const metric of referenceMetrics) for (const mutant of [undefined, '', 7, 'different-target']) {
        const f = referenceSelectionFixture(metric, 'causal');
        // Admission forbids this inconsistent pair. This double tests the
        // evaluator contract only: get must affect the result, not just the log.
        const population = Object.freeze({ select: predicate => f.access.handle.select(node => predicate(Object.freeze({
            ...node, get: key => key === f.field ? mutant : node.get(key)
        }))) });
        try {
            assert.throws(() => evaluateDirectMetric({ ...f.operands, [f.role]: population }, metric), /^Error: access_set_predicate_threw$/);
            assert.throws(() => f.access.assertHealthy(), /access_set_failed/);
            assert.equal(f.observations.filter(e => e[1] === 'select_return').length, 0);
        } finally { f.access.revoke(); f.target.access.revoke(); }
    }
});

test('N02G:DIRECT-METRIC-011 real access admission rejects scalar and target disagreement before evaluation', () => {
    for (const field of ['person_id', 'owner_id', 'merchant_key']) {
        assert.throws(() => instrument([
            ['source-alias', 'bill', { id: 'source', [field]: 'wrong' }],
            ['target-alias', 'person', { id: 'actual' }]
        ], [{ id: 'link', source: 'source-alias', target: 'target-alias', field, type: 'ref' }]), /access_shape_invalid/);
    }
});

test('N02G:DIRECT-METRIC-007 calendar and reminder zeros require a complete population, including positive witnesses', () => {
    for (const [metric, kind, name] of [['reminder_count', 'reminder', 'reminders'], ['calendar_event_count', 'calendar_event', 'calendar_events']]) {
        const rows = [['start', '2042-06-15'], ['end', '2042-06-30'], ['after', '2042-07-01']];
        const f = instrument([...rows.map(([alias, scheduled_at]) => [alias, kind, { id: alias, scheduled_at, person_id: 'p1' }]),
            ['p1', 'person', { id: 'p1' }]], rows.map(([source], i) => ({ id: `owner${i}`, source, target: 'p1', field: 'person_id', type: 'ref' })), rows.map(row => row[0]));
        const collection = members => instrument([['collection', 'collection', { id: 'col', collection_name: name, members },
            { id: scalar, collection_name: scalar, members: { type: 'sequence', item: scalar } }]]).access.handle('collection');
        const operands = { entries: f.access.handle, collection: collection(rows.map(row => row[0])),
            person: instrument([['person', 'person', { id: 'p1' }]]).access.handle('person'),
            context: context({ kind: 'person', ref_id: 'p1' }, juneRange, 'scheduled_at') };
        assert.equal(evaluateDirectMetric(operands, metric), 2);
        assertResolvedReferenceReads(f.observations);
        assert.throws(() => evaluateDirectMetric({ ...operands, collection: collection([]) }, metric), /direct_metric_collection/);
    }
});

test('N02G:DIRECT-REFERENCE-001 consumed reference scalars are validated; coherence of reference-only targets belongs to admission', () => {
    for (const metric of ['balance_delta', 'invoice_payment_amount', 'invoice_payment_target_card']) {
        const fields = metric === 'balance_delta' ? ['account_id'] : metric === 'invoice_payment_amount'
            ? ['category_id', 'account_id', 'settles_card_id'] : ['settles_card_id'];
        for (const field of fields) for (const mutant of [undefined, '', 7, ...(
            metric !== 'invoice_payment_amount' || field === 'category_id' ? ['different-valid-id'] : [])]) {
            const f = payment();
            const event = Object.freeze({ ...f.operands.event,
                get: key => key === field ? mutant : f.operands.event.get(key) });
            const ctx = metric === 'balance_delta' ? context({ kind: 'account', ref_id: 'account' },
                { kind: 'date', value: '2042-06-13' }, 'event_date') : f.operands.context;
            try {
                assert.throws(() => evaluateDirectMetric({ ...f.operands, event, context: ctx }, metric));
            } finally { f.access.revoke(); }
        }
    }
});

test('N02G:DIRECT-REFERENCE-002 similar events bind merchant scalar and identity, including excluded rows', () => {
    const rows = [['match', 'm1'], ['foreign', 'm2']];
    for (const reverse of [false, true]) {
        const f = instrument([...rows.map(([alias, merchant_key]) => [alias, 'event',
            { id: `${alias}-id`, merchant_key, state: 'confirmed', date: '2042-06-13' }]),
        ['merchant-a', 'merchant_identity', { id: 'm1' }], ['merchant-b', 'merchant_identity', { id: 'm2' }]],
        rows.map(([source], i) => ({ id: `edge-${i}`, source, target: i ? 'merchant-b' : 'merchant-a', field: 'merchant_key', type: 'ref' })),
        (reverse ? [...rows].reverse() : rows).map(row => row[0]));
        const merchant = instrument([['query', 'merchant_identity', { id: 'm1' }]]);
        const operands = { events: f.access.handle, merchant: merchant.access.handle('query'),
            context: context({ kind: 'merchant', ref_id: 'm1' }, { kind: 'month', value: '2042-06' }, 'event_date') };
        try {
            assert.deepEqual(evaluateDirectMetric(operands, 'similar_event_ids'), ['match-id']);
            assertResolvedReferenceReads(f.observations);
            const events = { select: predicate => f.access.handle.select(node => predicate(Object.freeze({ ...node,
                get: key => key === 'merchant_key' ? 'different-id' : node.get(key) }))) };
            assert.throws(() => evaluateDirectMetric({ ...operands, events }, 'similar_event_ids'), /access_set_predicate_threw/);
        } finally { f.access.revoke(); merchant.access.revoke(); }
    }
});
