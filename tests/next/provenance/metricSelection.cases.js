'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createInstrumentedAccess, createNodeSetAccess } = require('../../../src/next/provenance/instrumentedAccess');
const { evaluateConsumption, evaluateEconomicMetric } = require('../../../src/next/provenance/metricSelection');

const version = `sha256:${'a'.repeat(64)}`;
const scalar = { type: 'scalar' };
function fixture(options = {}) {
    const observations = []; const emit = e => observations.push(e); const controls = [];
    const rows = options.rows || [
        { id: 'purchase', date: '2042-06-10', state: 'confirmed', person_id: 'p1', category_id: 'food', amount_minor: -100 },
        { id: 'refund', date: '2042-06-11', state: 'confirmed', person_id: 'p1', category_id: 'refund-kind', amount_minor: 25, compensates: 'purchase' },
        { id: 'income', date: '2042-06-10', state: 'confirmed', person_id: 'p1', category_id: 'salary', amount_minor: 400 },
        { id: 'future', date: '2042-06-10', state: 'projected', person_id: 'p1', category_id: 'food', amount_minor: -30 },
        { id: 'old', date: '2042-05-31', state: 'confirmed', person_id: 'p1', category_id: 'food', amount_minor: -50 },
        { id: 'other-person', date: '2042-06-10', state: 'confirmed', person_id: 'p2', category_id: 'food', amount_minor: -60 }
    ];
    const categoryRows = options.categories || [{ id: 'food', kind: 'expense', budget_class: 'essential' }, { id: 'refund-kind', kind: 'compensation' }, { id: 'salary', kind: 'income' }];
    function binding(kind, value, role) {
        const names = kind === 'event' ? ['id', 'date', 'state', 'person_id', 'category_id', 'amount_minor', 'compensates', 'account_id', 'card_id'] : ['id', 'kind', 'budget_class', 'closing_day', 'due_day'];
        return { alias: value.id, role, identity: { kind, ref_id: value.id, version }, value,
            shape: { type: 'record', fields: Object.fromEntries(names.map(name => [name, scalar])) } };
    }
    const people = [...new Set(rows.map(row => row.person_id))].map(id => ({ ...binding('person', { id }, 'events'), alias: `owner-person-${id}` }));
    const links = rows.flatMap(row => [{ id: `cat-${row.id}`, source: row.id, field: 'category_id', target: row.category_id, type: 'ref' },
        ...(row.id === options.omitOwnerLink ? [] : [{ id: `owner-${row.id}`, source: row.id, field: 'person_id', target: `owner-person-${row.person_id}`, type: 'ref' }]),
        ...(row.compensates ? [{ id: `comp-${row.id}`, source: row.id, field: 'compensates', target: row.compensates, type: 'ref' }] : []),
        ...(options.instrument && row[`${options.instrument.kind}_id`] ? [{ id: `instrument-${row.id}`, source: row.id,
            field: `${options.instrument.kind}_id`, target: options.instrument.id, type: 'ref' }] : [])]);
    const eventBindings = rows.map(r => binding('event', r, 'events'));
    const roster = rows.map(r => r.id);
    if (options.duplicateEvent) {
        const duplicate = rows.find(row => row.id === options.duplicateEvent);
        const alias = `duplicate-alias-${duplicate.id}`;
        const copy = { ...binding('event', duplicate, 'events'), alias };
        copy.identity.version = options.duplicateVersion || version;
        eventBindings.push(copy); roster.push(alias);
        links.push(...links.filter(link => link.source === duplicate.id).map(link => ({ ...link, id: `duplicate-${link.id}`, source: alias })));
    }
    if (options.reverse) roster.reverse();
    const events = createNodeSetAccess({ role: 'events', emit, roster, links,
        bindings: [...eventBindings, ...categoryRows.map(r => binding('category', r, 'events')), ...people,
            ...(options.instrument ? [binding(options.instrument.kind, { ...options.instrument }, 'events')] : [])] });
    const categories = createNodeSetAccess({ role: 'categories', emit,
        bindings: categoryRows.map(r => binding('category', r, 'categories')) });
    const subject = options.subject || { kind: 'person', ref_id: 'p1' };
    const context = createInstrumentedAccess({ emit, bindings: [{ alias: 'context', role: 'context', value: {
        subject, coverage: options.coverage ?? 'complete', period: options.period || { kind: 'month', value: '2042-06' }, evidence_state: options.evidence_state || 'confirmed', time_basis: options.time_basis || 'event_date',
        ...(options.filters ? { filters: options.filters } : {})
    }, shape: { type: 'record', fields: { coverage: scalar, evidence_state: scalar, time_basis: scalar, filters: { type: 'record', fields: { budget_class: scalar } },
        period: { type: 'record', fields: { kind: scalar, value: scalar, start: scalar, end: scalar, start_inclusive: scalar, end_inclusive: scalar } }, subject: { type: 'record',
            fields: { kind: scalar, ref_id: scalar, family_id: scalar, category_id: scalar, person_id: scalar, budget_id: scalar } } } } }] });
    const familyMembers = options.members || ['p1', 'p2'];
    const family = createInstrumentedAccess({ emit, bindings: [{ alias: 'family', role: 'family', value: { id: 'f1', members: familyMembers },
        shape: { type: 'record', fields: { id: scalar, members: { type: 'sequence', item: scalar } } } },
        ...[...new Set(familyMembers)].map(id => ({ ...binding('person', { id }, 'family'), alias: `person-${id}` }))],
        links: familyMembers.filter(id => id !== options.omitMemberLink).map(id => ({
            id: `family-${id}`, source: 'family', field: 'members', target: `person-${id}`, type: 'ref_list' })) });
    controls.push(events, categories, context, family);
    const instrument = options.instrument ? createInstrumentedAccess({ emit,
        bindings: [binding(options.instrument.kind, { ...options.instrument }, 'instrument')] }) : null;
    if (instrument) controls.push(instrument);
    return { observations, controls, operands: { events: events.handle, categories: categories.handle,
        context: context.handle('context'), family: family.handle('family'),
        ...(instrument ? { instrument: instrument.handle(options.instrument.id), card: instrument.handle(options.instrument.id) } : {}) } };
}

// The same semantic property is exercised through different query bindings.
// No graph, trace-derived expectation or per-fact exception enters the kernel.
function compensationFixture(mode, rows, overrides = {}) {
    const options = { ...overrides, rows };
    if (mode === 'category' || mode === 'spent') options.subject = { kind: 'category', ref_id: 'food' };
    if (mode === 'budget_class') {
        options.subject = { kind: 'family', ref_id: 'f1' }; options.filters = { budget_class: 'essential' };
    }
    if (mode === 'instrument' || mode === 'statement') {
        options.subject = { kind: 'card', ref_id: 'instrument' };
        options.instrument = { kind: 'card', id: 'instrument', closing_day: 10, due_day: 17 };
    }
    if (mode === 'statement') {
        options.time_basis = 'statement_due_date'; options.period = { kind: 'statement_due', value: '2042-06-17' };
    }
    const f = fixture(options);
    if (mode === 'statement') {
        const policy = createInstrumentedAccess({ emit: e => f.observations.push(e), bindings: [{ alias: 'policy', role: 'policy',
            identity: { kind: 'evaluation_policy', ref_id: 'policy-id', version },
            value: { id: 'policy-id', calendar: 'proleptic_gregorian' }, shape: { type: 'record', fields: { id: scalar, calendar: scalar } } }] });
        f.controls.push(policy); f.operands.policy = policy.handle('policy');
    }
    return f;
}

const consumptionModes = ['total', 'category', 'spent', 'budget_class', 'instrument', 'statement'];
test('N02G:CANDIDATE-ID-001 distinct handles for the same event are rejected before financial exclusion', () => {
    for (const mode of [...consumptionModes, 'income']) for (const duplicateEvent of ['purchase', 'future', 'old', 'other-person'])
        for (const duplicateVersion of [version, `sha256:${'d'.repeat(64)}`]) for (const reverse of [false, true]) {
        const f = compensationFixture(mode, undefined, { duplicateEvent, duplicateVersion, reverse });
        try {
            assert.throws(() => evaluateEconomicMetric(f.operands, mode), /^Error: access_set_predicate_threw$/, `${mode}/${duplicateEvent}`);
            assert.throws(() => f.controls[0].assertHealthy(), /access_set_failed/);
        } finally { for (const c of f.controls) c.revoke(); }
    }
});

test('N02G:CANDIDATE-ID-002 malformed event IDs and versions cannot enter an economic candidate population', () => {
    for (const [field, value] of [...[undefined, 7, '', 'invalid id'].map(value => ['id', value]), ['version', 'invalid-digest']]) {
        const f = fixture();
        const events = Object.freeze({ select: predicate => f.operands.events.select(node => predicate(Object.freeze({
            ...node, get: key => field === 'id' && key === 'id' ? value : node.get(key),
            identity: key => field === 'version' && key === 'version' ? value : node.identity(key)
        }))) });
        try { assert.throws(() => evaluateConsumption({ ...f.operands, events }, 'total'), /^Error: access_set_predicate_threw$/); }
        finally { for (const c of f.controls) c.revoke(); }
    }
});

test('N02G:SCALAR-REFERENCE-001 economic candidates resolve owners without consuming person payloads', () => {
    for (const mode of [...consumptionModes, 'income']) {
        const f = compensationFixture(mode);
        try {
            evaluateEconomicMetric(f.operands, mode);
            const reads = f.observations.filter(e => e[1] === 'get' && e[4][0] === 'person_id');
            const traversals = f.observations.filter(e => e[1] === 'traverse' && e[4][0] === 'person_id');
            if (mode === 'instrument' || mode === 'statement') assert.equal(reads.length, 0);
            else assert.ok(reads.length > 1);
            assert.deepEqual(traversals.map(e => e[2]), reads.map(e => e[2]), mode);
            assert.equal(f.observations.some(e => e[2].startsWith('owner-person-')), false, mode);
        } finally { for (const c of f.controls) c.revoke(); }
    }
});

test('N02G:INSTRUMENT-PROFILE-001 ownership is not a dependency while complete coverage and optional guards are observed', () => {
    for (const mode of ['instrument', 'statement']) {
        const rows = [
            { id: 'original', date: '2042-06-01', state: 'confirmed', person_id: 'p1', category_id: 'food', amount_minor: -100, card_id: 'instrument' },
            { id: 'refund', date: '2042-06-03', state: 'confirmed', person_id: 'p2', category_id: 'refund-kind', amount_minor: 25, card_id: 'instrument', compensates: 'original' }
        ];
        for (const omitOwnerLink of ['original', 'refund']) {
            const f = compensationFixture(mode, rows, { omitOwnerLink });
            try {
                assert.equal(evaluateEconomicMetric(f.operands, mode), 75);
                assert.equal(f.observations.some(e => e[4][0] === 'person_id'), false);
                assert.ok(f.observations.some(e => e[1] === 'get' && e[4][0] === 'coverage'));
                for (const row of rows) assert.ok(f.observations.some(e => e[1] === 'has' && e[2] === row.id && e[4][0] === 'compensates'));
                if (mode === 'statement') assert.ok(f.observations.some(e => e[2] === 'policy' && e[1] === 'identity' && e[4][0] === 'version'));
            } finally { for (const c of f.controls) c.revoke(); }
        }
        const partial = compensationFixture(mode, rows, { coverage: 'partial' });
        try { assert.throws(() => evaluateEconomicMetric(partial.operands, mode), /metric_selection_coverage/); }
        finally { for (const c of partial.controls) c.revoke(); }
    }
});

test('N02G:INSTRUMENT-PROFILE-002 inconsistent compensation presence and chains fail before financial exclusion', () => {
    for (const mode of ['instrument', 'statement']) for (const excluded of [false, true]) {
        const original = { id: 'original', date: '2042-06-01', state: 'confirmed', person_id: 'p1', category_id: 'food', amount_minor: -100, card_id: 'instrument' };
        const refund = { id: 'refund', date: '2042-06-03', state: excluded ? 'projected' : 'confirmed', person_id: 'p2',
            category_id: 'refund-kind', amount_minor: 25, card_id: 'instrument', compensates: 'original' };
        for (const mutate of [r => { delete r[1].compensates; }, r => { r[1].category_id = 'food'; },
            r => { r[1].compensates = 'refund'; }, r => { r[0].compensates = 'refund'; }]) {
            const rows = structuredClone([original, refund]); mutate(rows);
            const f = compensationFixture(mode, rows);
            try { assert.throws(() => evaluateEconomicMetric(f.operands, mode), /access_set_predicate_threw/); }
            finally { for (const c of f.controls) c.revoke(); }
        }
    }
});

test('N02G:SCALAR-REFERENCE-002 unresolved ownership fails even for financially excluded candidates', () => {
    for (const omitOwnerLink of ['purchase', 'future', 'old', 'other-person']) {
        const f = fixture({ omitOwnerLink });
        try { assert.throws(() => evaluateConsumption(f.operands, 'total'), /access_set_predicate_threw/, omitOwnerLink); }
        finally { for (const c of f.controls) c.revoke(); }
    }
});

test('N02G:FAMILY-POPULATION-001 all family members are enumerated and resolved, including those with no spending', () => {
    for (const members of [[], ['p1'], ['p2', 'p1'], ['p1', 'p2', 'no-spending']]) {
        const f = fixture({ members, subject: { kind: 'family', ref_id: 'f1' } });
        try {
            const expected = (members.includes('p1') ? 75 : 0) + (members.includes('p2') ? 60 : 0);
            assert.equal(evaluateEconomicMetric(f.operands, 'total'), expected);
            const observations = f.observations.filter(e => e[2] === 'family' && e[4][0] === 'members');
            assert.ok(observations.some(e => e[1] === 'length'));
            assert.ok(observations.some(e => e[1] === 'iterate'));
            assert.equal(observations.filter(e => e[1] === 'traverse').length, members.length);
            assert.equal(observations.filter(e => e[1] === 'includes').length, 0);
            assert.equal(f.observations.some(e => e[2].startsWith('person-') && ['get', 'identity'].includes(e[1])), false);
            for (const c of f.controls) c.assertHealthy();
        } finally { for (const c of f.controls) c.revoke(); }
    }
});

test('N02G:FAMILY-POPULATION-002 an unresolved member cannot be hidden by no contribution or membership alone', () => {
    const f = fixture({ members: ['p1', 'p2', 'no-spending'], omitMemberLink: 'no-spending', subject: { kind: 'family', ref_id: 'f1' } });
    try { assert.throws(() => evaluateEconomicMetric(f.operands, 'total'), /access_traversal/); }
    finally { for (const c of f.controls) c.revoke(); }
});

test('N02G:FAMILY-POPULATION-003 reference population rejects count drift, duplicates and malformed IDs', () => {
    const { readReferenceIds } = require('../../../src/next/provenance/metricReferences');
    // Evaluator-boundary doubles; admission is still responsible for the real
    // list payload and its nominal target types. No acceptance claim here.
    for (const [count, values] of [[1, ['p1', 'p2']], [3, ['p1', 'p2']], [2, ['p1', 'p1']],
        [-0, []], [-1, []], [NaN, []], [0.5, []], ...[undefined, 7, '', 'invalid id'].map(id => [1, [id]])]) {
        const f = fixture();
        const source = Object.freeze({ ...f.operands.family, get: () => ({ length: () => count, [Symbol.iterator]: () => values[Symbol.iterator]() }) });
        try { assert.throws(() => readReferenceIds(source, 'members')); }
        finally { for (const c of f.controls) c.revoke(); }
    }
    const f = fixture({ members: ['p2', 'p1'] });
    try {
        const members = readReferenceIds(f.operands.family, 'members');
        assert.equal(members.includes('p1'), true); assert.equal(members.includes('p2'), true);
        assert.equal(members.includes('foreign'), false); assert.equal(Object.isFrozen(members), true);
        for (const c of f.controls) c.assertHealthy();
    } finally { for (const c of f.controls) c.revoke(); }
});

test('N02G:METRIC-SELECTION-016 categories have separate scalar reads and traversals for selected and excluded candidates', () => {
    for (const mode of [...consumptionModes, 'income']) {
        const f = compensationFixture(mode);
        try {
            evaluateEconomicMetric(f.operands, mode);
            const traversals = f.observations.filter(e => e[1] === 'traverse' && e[4][0] === 'category_id');
            assert.ok(traversals.length >= 6);
            for (const alias of new Set(traversals.map(e => e[2]))) {
                const reads = f.observations.filter(e => e[1] === 'get' && e[2] === alias && e[4][0] === 'category_id');
                assert.equal(reads.length, traversals.filter(e => e[2] === alias).length, `${mode}/${alias}`);
            }
        } finally { for (const c of f.controls) { c.revoke(); c.assertHealthy(); } }
    }
});

test('N02G:METRIC-SELECTION-017 category source scalar participates in evaluator rejection', () => {
    for (const mutant of [undefined, 7, '', 'unrelated-category']) {
        const f = fixture();
        // Deliberately inconsistent handle double; real admission forbids it.
        const events = Object.freeze({ select: predicate => f.operands.events.select(node => predicate(Object.freeze({
            ...node, get: field => field === 'category_id' ? mutant : node.get(field)
        }))) });
        try {
            assert.throws(() => evaluateConsumption({ ...f.operands, events }, 'total'), /^Error: access_set_predicate_threw$/);
            assert.throws(() => f.controls[0].assertHealthy(), /access_set_failed/);
        } finally { for (const c of f.controls) c.revoke(); }
    }
});

test('N02G:CATEGORY-POPULATION-001 an unused invalid category cannot silently enter the bound taxonomy', () => {
    for (const kind of ['', 'unexpected', 7]) {
        const f = fixture({ rows: [], categories: [{ id: 'unused-category', kind }] });
        try { assert.throws(() => evaluateConsumption(f.operands, 'total'), /metric_selection_category/); }
        finally { for (const c of f.controls) c.revoke(); }
    }
    const valid = fixture({ rows: [], categories: [{ id: 'unused-category', kind: 'neutral' }] });
    try {
        assert.equal(evaluateConsumption(valid.operands, 'total'), 0);
        assert.ok(valid.observations.some(e => e[1] === 'get' && e[2] === 'unused-category' && e[4][0] === 'kind'));
    } finally { for (const c of valid.controls) c.revoke(); }
});

test('N02G:CATEGORY-POPULATION-002 a resolved category cannot disagree with the bound economic class', () => {
    const { createCategoryReader } = require('../../../src/next/provenance/metricSelection');
    const f = fixture();
    try {
        const reader = createCategoryReader(f.operands.categories);
        const event = f.operands.events.at(0); const category = event.follow('category_id');
        assert.equal(reader.read(event).economicKind, 'expense');
        for (const kind of ['neutral', 'income', 'compensation']) {
            const divergent = Object.freeze({ ...category, get: field => field === 'kind' ? kind : category.get(field) });
            assert.throws(() => reader.read(Object.freeze({ ...event, follow: () => divergent })), /metric_selection_category/);
        }
    } finally { for (const c of f.controls) c.revoke(); }
});

test('N02G:METRIC-SELECTION-018 category population membership and version remain independent requirements', () => {
    const { createCategoryReader } = require('../../../src/next/provenance/metricSelection');
    const f = fixture();
    try {
        const event = f.operands.events.at(0);
        const category = event.follow('category_id');
        const reader = createCategoryReader(f.operands.categories);
        assert.equal(reader.read(event).key, 'food');
        assert.throws(() => createCategoryReader([]).read(event), /metric_selection_category/);
        assert.throws(() => createCategoryReader([category, category]), /metric_selection_category/);
        for (const [key, value] of [['kind', 'person'], ['version', `sha256:${'b'.repeat(64)}`]]) {
            const target = Object.freeze({ ...category, identity: field => field === key ? value : category.identity(field) });
            assert.throws(() => reader.read(Object.freeze({ ...event, follow: () => target })), /metric_selection_category|metric_reference_kind/);
        }
    } finally { for (const c of f.controls) { c.revoke(); c.assertHealthy(); } }
});

test('N02G:COMPENSATION-REFERENCE-001 consumption binds the compensation scalar to the resolved event', () => {
    for (const mode of consumptionModes) {
        const positive = compensationFixture(mode);
        try {
            evaluateEconomicMetric(positive.operands, mode);
            assert.equal(positive.observations.filter(e => e[1] === 'get' && e[4][0] === 'compensates').length, 1);
        } finally { for (const c of positive.controls) c.revoke(); }
        for (const value of [undefined, 7, '', 'unrelated-event']) {
            const f = compensationFixture(mode);
            const events = Object.freeze({ select: predicate => f.operands.events.select(node => predicate(Object.freeze({
                ...node, get: field => field === 'compensates' ? value : node.get(field)
            }))) });
            try { assert.throws(() => evaluateEconomicMetric({ ...f.operands, events }, mode), /^Error: access_set_predicate_threw$/); }
            finally { for (const c of f.controls) c.revoke(); }
        }
    }
});

test('N02G:METRIC-SELECTION-012 consumption resolves compensation independently of IDs, amounts, order and original window', () => {
    for (const mode of consumptionModes) for (const amount of [1, 25, 137]) for (const reverse of [false, true]) {
        const original = { id: `purchase-${amount}`, date: '2042-04-01', state: 'confirmed', person_id: 'p1',
            category_id: 'food', amount_minor: -400 };
        const refund = { id: `refund-${amount}`, date: '2042-06-10', state: 'confirmed', person_id: 'p1',
            category_id: 'refund-kind', amount_minor: amount, compensates: original.id, card_id: 'instrument' };
        const f = compensationFixture(mode, reverse ? [refund, original] : [original, refund]);
        try {
            // Original is outside the query window and has no queried card;
            // resolving it must not make it an eligible financial contribution.
            assert.equal(evaluateEconomicMetric(f.operands, mode), -amount);
            const traversals = f.observations.filter(e => e[1] === 'traverse' && e[4][0] === 'compensates');
            assert.equal(traversals.length, 1, `${mode} must resolve the compensated event`);
            assert.deepEqual(traversals[0][6], ['edge', `comp-${refund.id}`, original.id]);
        } finally { for (const control of f.controls) { control.revoke(); control.assertHealthy(); } }
    }
});

test('N02G:METRIC-SELECTION-013 consumption cannot use an unlinked compensation even if its total is plausible', () => {
    for (const mode of consumptionModes) for (const amount of [1, 25, 137]) {
        const f = compensationFixture(mode, [{ id: `unlinked-${amount}`, date: '2042-06-10', state: 'confirmed',
            person_id: 'p1', category_id: 'refund-kind', amount_minor: amount, card_id: 'instrument' }]);
        try {
            // The set boundary intentionally replaces predicate exceptions.
            assert.throws(() => evaluateEconomicMetric(f.operands, mode), /^Error: access_set_predicate_threw$/);
            assert.throws(() => f.controls[0].assertHealthy(), /access_set_failed/);
            assert.equal(f.observations.filter(e => e[1] === 'select_return').length, 0);
        }
        finally { for (const control of f.controls) control.revoke(); }
    }
});

test('N02G:METRIC-SELECTION-014 compensation rejects self, non-event and non-expense targets across consumption queries', () => {
    for (const mode of consumptionModes) for (const target of ['self', 'food', 'income-target']) {
        const refund = { id: 'self', date: '2042-06-10', state: 'confirmed', person_id: 'p1', category_id: 'refund-kind',
            amount_minor: 25, compensates: target, card_id: 'instrument' };
        const original = { id: 'income-target', date: '2042-04-01', state: 'confirmed', person_id: 'p1', category_id: 'salary', amount_minor: 100 };
        const f = compensationFixture(mode, [refund, original]);
        try {
            assert.throws(() => evaluateEconomicMetric(f.operands, mode), /^Error: access_set_predicate_threw$/);
            assert.throws(() => f.controls[0].assertHealthy(), /access_set_failed/);
            assert.equal(f.observations.filter(e => e[1] === 'select_return').length, 0);
        }
        finally { for (const control of f.controls) control.revoke(); }
    }
});

test('N02G:METRIC-SELECTION-015 income does not resolve compensation that cannot contribute to its formula', () => {
    const f = fixture({ rows: [
        { id: 'income', date: '2042-06-10', state: 'confirmed', person_id: 'p1', category_id: 'salary', amount_minor: 100 },
        { id: 'ignored-refund', date: '2042-06-10', state: 'confirmed', person_id: 'p1', category_id: 'refund-kind', amount_minor: 25 }
    ] });
    try {
        assert.equal(evaluateEconomicMetric(f.operands, 'income'), 100);
        assert.equal(f.observations.filter(e => e[1] === 'traverse' && e[4][0] === 'compensates').length, 0);
    } finally { for (const control of f.controls) { control.revoke(); control.assertHealthy(); } }
});

test('N02G:METRIC-SELECTION-001 consumption computes membership from handles and returns only the amount', () => {
    const f = fixture();
    assert.equal(evaluateConsumption(f.operands, 'total'), 75);
    assert.deepEqual(f.observations.filter(e => e[1] === 'select_member').map(e => e[6].slice(1)), [
        ['purchase', true], ['refund', true], ['income', false], ['future', false], ['old', false], ['other-person', false]
    ]);
    assert.equal(f.observations.filter(e => e[1] === 'get' && e[4][0] === 'amount_minor').length, 2);
    assert.ok(f.observations.some(e => e[1] === 'traverse'));
    for (const control of f.controls) { control.revoke(); control.assertHealthy(); }
});

test('N02G:METRIC-SELECTION-002 category selection follows compensation and respects family scope', () => {
    const f = fixture({ subject: { kind: 'family_category', family_id: 'f1', category_id: 'food' } });
    assert.equal(evaluateConsumption(f.operands, 'category'), 135);
    assert.ok(f.observations.some(e => e[1] === 'traverse' && e[4][0] === 'compensates'));
    const unknown = fixture({ subject: { kind: 'family_category', family_id: 'other-family', category_id: 'food' } });
    assert.throws(() => evaluateConsumption(unknown.operands, 'category'), /metric_selection_scope/);
});

test('N02G:METRIC-SELECTION-003 formerly excluded candidate changes result when its actual state changes', () => {
    const row = { id: 'candidate', date: '2042-06-10', state: 'projected', person_id: 'p1', category_id: 'food', amount_minor: -31 };
    assert.equal(evaluateConsumption(fixture({ rows: [row] }).operands, 'total'), 0);
    assert.equal(evaluateConsumption(fixture({ rows: [{ ...row, state: 'confirmed' }] }).operands, 'total'), 31);
    assert.equal(evaluateConsumption(fixture({ rows: [{ ...row, state: 'confirmed', date: '2042-07-01' }] }).operands, 'total'), 0);
});

test('N02G:METRIC-SELECTION-004 invalid mode, revoked handles and unsafe arithmetic cannot return a result', () => {
    assert.throws(() => evaluateConsumption(fixture().operands, 'guess'), /metric_selection_mode/);
    const f = fixture(); f.controls[0].revoke();
    assert.throws(() => evaluateConsumption(f.operands, 'total'), /access_set_/);
    const row = { id: 'a', date: '2042-06-10', state: 'confirmed', person_id: 'p1', category_id: 'food', amount_minor: -Number.MAX_SAFE_INTEGER };
    assert.throws(() => evaluateConsumption(fixture({ rows: [row, { ...row, id: 'b', amount_minor: -1 }] }).operands, 'total'), /metric_selection_money/);
});

test('N02G:METRIC-SELECTION-005 basis and scope are explicit even for empty populations', () => {
    const options = { rows: [], subject: { kind: 'category', ref_id: 'food' }, time_basis: 'budget_cycle' };
    assert.equal(evaluateConsumption(fixture(options).operands, 'spent'), 0);
    assert.throws(() => evaluateConsumption(fixture(options).operands, 'category'), /metric_selection_context/);
    assert.throws(() => evaluateConsumption(fixture({ rows: [], subject: { kind: 'category', ref_id: 'missing' } }).operands, 'category'), /metric_selection_category/);
    assert.throws(() => evaluateConsumption(fixture({ rows: [], evidence_state: 'estimated' }).operands, 'total'), /metric_selection_context/);
    assert.throws(() => evaluateConsumption(fixture({ rows: [], period: { kind: 'month', value: '2042-13' } }).operands, 'total'), /civil_month/);
});

test('N02G:METRIC-SELECTION-006 source count must equal eligible cardinality, not money or a declared zero', () => {
    const { evaluateDirectMetric } = require('../../../src/next/provenance/metricDirectReads');
    function run(count, coverage = 'complete', linked = true) {
        const f = fixture({ subject: { kind: 'family_category', family_id: 'f1', category_id: 'food' } });
        const source = createInstrumentedAccess({ emit: e => f.observations.push(e), bindings: [{ alias: 'source', role: 'source',
            identity: { kind: 'source_state', ref_id: 'source', version },
            value: { id: 'source', period: '2042-06', category_id: 'food', coverage, ...(count === undefined ? {} : { event_count: count }) },
            shape: { type: 'record', fields: Object.fromEntries(['id', 'period', 'category_id', 'coverage', 'event_count', 'entity_id'].map(k => [k, scalar])) } },
        { alias: 'source-category', role: 'source', identity: { kind: 'category', ref_id: 'food', version },
            value: { id: 'food' }, shape: { type: 'record', fields: { id: scalar } } }],
        links: linked ? [{ id: 'source-category-edge', source: 'source', field: 'category_id', target: 'source-category', type: 'ref' }] : [] });
        try {
            const result = evaluateDirectMetric({ ...f.operands, source: source.handle('source') }, 'eligible_event_count');
            assert.ok(f.observations.some(e => e[1] === 'traverse' && e[2] === 'source' && e[4][0] === 'category_id'));
            assert.equal(f.observations.some(e => e[2] === 'source-category'), false);
            return result;
        } finally { source.revoke(); for (const c of f.controls) c.revoke(); }
    }
    assert.equal(run(3), 3); // monetary total is 135, not 3
    for (const count of [0, 2, 4, undefined]) assert.throws(() => run(count), /direct_metric_count/);
    assert.throws(() => run(3, 'partial'), /direct_metric_coverage/);
    assert.throws(() => run(3, 'complete', false), /access_traversal/);
});

test('N02G:COUNT-COMPENSATION-001 inherited category changes count even when the original purchase is outside the window', () => {
    const { evaluateDirectMetric } = require('../../../src/next/provenance/metricDirectReads');
    function run(category, count, reverse) {
        const rows = [
            { id: 'original-outside', date: '2042-04-01', state: 'confirmed', person_id: 'p1', category_id: category, amount_minor: -900 },
            { id: 'refund-inside', date: '2042-06-15', state: 'confirmed', person_id: 'p1', category_id: 'refund-kind', compensates: 'original-outside', amount_minor: 37 }
        ];
        const f = fixture({ rows: reverse ? rows.reverse() : rows, subject: { kind: 'family_category', family_id: 'f1', category_id: 'food' },
            categories: [{ id: 'food', kind: 'expense' }, { id: 'other-expense', kind: 'expense' }, { id: 'refund-kind', kind: 'compensation' }] });
        const source = createInstrumentedAccess({ bindings: [
            { alias: 'count-source', role: 'source', identity: { kind: 'source_state', ref_id: 'source-id', version },
                value: { id: 'source-id', period: '2042-06', category_id: 'food', coverage: 'complete', event_count: count },
                shape: { type: 'record', fields: Object.fromEntries(['id', 'period', 'category_id', 'coverage', 'event_count', 'entity_id'].map(k => [k, scalar])) } },
            { alias: 'source-category', role: 'source', identity: { kind: 'category', ref_id: 'food', version },
                value: { id: 'food' }, shape: { type: 'record', fields: { id: scalar } } }
        ], links: [{ id: 'source-category-link', source: 'count-source', target: 'source-category', field: 'category_id', type: 'ref' }], emit: e => f.observations.push(e) });
        try { return evaluateDirectMetric({ ...f.operands, source: source.handle('count-source') }, 'eligible_event_count'); }
        finally { source.revoke(); for (const c of f.controls) c.revoke(); }
    }
    for (const reverse of [false, true]) {
        assert.equal(run('food', 1, reverse), 1);
        assert.equal(run('other-expense', 0, reverse), 0);
        assert.throws(() => run('food', 0, reverse), /direct_metric_count/);
        assert.throws(() => run('other-expense', 1, reverse), /direct_metric_count/);
    }
});

test('N02G:METRIC-SELECTION-007 income preserves its sign and budget class follows the compensated expense', () => {
    assert.equal(evaluateEconomicMetric(fixture().operands, 'income'), 400);
    const options = { subject: { kind: 'family', ref_id: 'f1' }, filters: { budget_class: 'essential' } };
    assert.equal(evaluateEconomicMetric(fixture(options).operands, 'budget_class'), 135);
    assert.equal(evaluateEconomicMetric(fixture({ ...options, filters: { budget_class: 'flexible' } }).operands, 'budget_class'), 0);
    assert.throws(() => evaluateEconomicMetric(fixture({ ...options, filters: { budget_class: 'guessed' } }).operands, 'budget_class'), /metric_selection_filter/);
});

test('N02G:METRIC-SELECTION-008 instrument uses the declared kind and observed reference, never an owner or amount coincidence', () => {
    for (const kind of ['account', 'card']) {
        const row = { id: 'purchase', date: '2042-06-10', state: 'confirmed', person_id: 'p1', category_id: 'food', amount_minor: -42, [`${kind}_id`]: 'i' };
        const options = { instrument: { kind, id: 'i' }, subject: { kind, ref_id: 'i' }, rows: [row, { ...row, id: 'unlinked', [`${kind}_id`]: undefined }] };
        delete options.rows[1][`${kind}_id`];
        assert.equal(evaluateEconomicMetric(fixture(options).operands, 'instrument'), 42);
        assert.throws(() => evaluateEconomicMetric(fixture({ ...options, subject: { kind, ref_id: 'foreign' } }).operands, 'instrument'), /metric_selection_scope/);
    }
});

test('N02G:INSTRUMENT-REFERENCE-001 instrument selection reads the reference before resolving every linked candidate', () => {
    for (const kind of ['account', 'card']) for (const reverse of [false, true]) {
        const field = `${kind}_id`;
        const rows = ['confirmed', 'projected'].map((state, i) => ({ id: `event-${i}`, state, date: '2042-06-10',
            person_id: 'p1', category_id: 'food', amount_minor: -42, [field]: 'i' }));
        const f = fixture({ rows, reverse, instrument: { kind, id: 'i' }, subject: { kind, ref_id: 'i' } });
        try {
            assert.equal(evaluateEconomicMetric(f.operands, 'instrument'), 42);
            for (const row of rows) {
                const read = f.observations.findIndex(e => e[1] === 'get' && e[2] === row.id && e[4][0] === field);
                const traversal = f.observations.findIndex(e => e[1] === 'traverse' && e[2] === row.id && e[4][0] === field);
                assert.ok(read >= 0 && traversal > read, `${kind}/${row.state}`);
            }
        } finally { for (const access of f.controls) access.revoke(); }
    }
});

test('N02G:INSTRUMENT-REFERENCE-002 inconsistent instrument scalar cannot borrow the identity of a valid target', () => {
    for (const kind of ['account', 'card']) for (const mutant of [undefined, '', 7, 'foreign']) {
        const field = `${kind}_id`;
        const f = fixture({ rows: [{ id: 'event', date: '2042-06-10', state: 'projected', person_id: 'p1',
            category_id: 'food', amount_minor: -42, [field]: 'i' }], instrument: { kind, id: 'i' }, subject: { kind, ref_id: 'i' } });
        const events = { select: predicate => f.operands.events.select(node => predicate(Object.freeze({ ...node,
            get: key => key === field ? mutant : node.get(key) }))) };
        try { assert.throws(() => evaluateEconomicMetric({ ...f.operands, events }, 'instrument'), /access_set_predicate_threw/); }
        finally { for (const access of f.controls) access.revoke(); }
    }
});

test('N02G:METRIC-SELECTION-009 a personal query uses the family limit but only that person consumption', () => {
    function run(subject, changes = {}, omitField) {
        const f = fixture({ subject, time_basis: 'budget_cycle' });
        const value = { id: 'budget', family_id: 'f1', category_id: 'food', period: '2042-06', evidence_state: 'confirmed', limit_minor: 200, ...changes };
        const budget = createInstrumentedAccess({ emit: e => f.observations.push(e), bindings: [{ alias: 'budget', role: 'budget',
            identity: { kind: 'budget', ref_id: 'budget', version }, value,
            shape: { type: 'record', fields: Object.fromEntries(Object.keys(value).map(k => [k, scalar])) } },
            ...[['family-target', 'family', value.family_id], ['category-target', 'category', value.category_id]].map(([alias, kind, id]) => ({
                alias, role: 'budget', identity: { kind, ref_id: id, version }, value: { id }, shape: { type: 'record', fields: { id: scalar } } }))],
            links: ['family_id', 'category_id'].filter(field => field !== omitField).map(field => ({ id: field, source: 'budget',
                field, target: field === 'family_id' ? 'family-target' : 'category-target', type: 'ref' })) });
        try {
            const result = evaluateEconomicMetric({ ...f.operands, budget: budget.handle('budget') }, 'budget_remaining');
            for (const field of ['family_id', 'category_id']) assert.ok(f.observations.some(e => e[1] === 'traverse' && e[2] === 'budget' && e[4][0] === field));
            assert.equal(f.observations.some(e => ['family-target', 'category-target'].includes(e[2])), false);
            return result;
        } finally { budget.revoke(); for (const access of f.controls) access.revoke(); }
    }
    assert.equal(run({ kind: 'budget', ref_id: 'budget' }), 65);
    assert.equal(run({ kind: 'budget_person', budget_id: 'budget', person_id: 'p2' }), 140);
    assert.equal(run({ kind: 'budget', ref_id: 'budget' }, { limit_minor: 100 }), -35);
    assert.throws(() => run({ kind: 'budget_person', budget_id: 'budget', person_id: 'foreign' }), /metric_selection_scope/);
    assert.throws(() => run({ kind: 'budget', ref_id: 'budget' }, { period: '2042-05' }), /metric_selection_budget/);
    assert.throws(() => run({ kind: 'budget', ref_id: 'budget' }, { family_id: 'foreign' }), /metric_selection_scope/);
    for (const field of ['family_id', 'category_id']) assert.throws(() => run({ kind: 'budget', ref_id: 'budget' }, {}, field), /access_/);
});

test('N02G:METRIC-SELECTION-010 statement uses the historical open-close civil window without clamping', () => {
    function run({ closing_day = 10, due_day = 17, value = '2042-06-17', basis = 'statement_due_date', calendar = 'proleptic_gregorian' } = {}) {
        const rows = ['2042-05-10', '2042-05-11', '2042-06-10', '2042-06-11'].map((date, i) => ({
            id: `e${i}`, date, state: 'confirmed', person_id: 'p1', category_id: 'food', amount_minor: -(i + 1), card_id: 'card' }));
        const f = fixture({ rows, subject: { kind: 'card', ref_id: 'card' }, period: { kind: 'statement_due', value },
            time_basis: basis, instrument: { kind: 'card', id: 'card', closing_day, due_day } });
        const policy = createInstrumentedAccess({ emit: e => f.observations.push(e), bindings: [{ alias: 'policy', role: 'policy',
            identity: { kind: 'evaluation_policy', ref_id: 'policy-id', version },
            value: { id: 'policy-id', calendar }, shape: { type: 'record', fields: { id: scalar, calendar: scalar } } }] });
        return evaluateEconomicMetric({ ...f.operands, policy: policy.handle('policy') }, 'statement');
    }
    assert.equal(run(), 5);
    assert.equal(run({ basis: 'statement_competence' }), 5);
    assert.throws(() => run({ value: '2042-06-18' }), /metric_selection_statement/);
    assert.throws(() => run({ closing_day: 31 }), /civil_date/);
    assert.throws(() => run({ closing_day: 30, value: '2042-03-17' }), /civil_nonexistent_target/);
    assert.throws(() => run({ calendar: 'guessed' }), /metric_selection_statement/);
});

test('N02G:METRIC-SELECTION-011 safe pace derives remaining civil days before checking literal policy and floors signed results', () => {
    function run({ clock = '2042-06-15T12:00:00Z', policy = {}, limit = 3400, omitCategoryLink = false } = {}) {
        const f = fixture({ subject: { kind: 'budget', ref_id: 'budget' }, evidence_state: 'estimated',
            time_basis: '15_full_days_after_as_of', period: { kind: 'range', start: '2042-06-16', end: '2042-06-30', start_inclusive: true, end_inclusive: true } });
        const emit = e => f.observations.push(e);
        const budget = { id: 'budget', family_id: 'family', category_id: 'food', period: '2042-06', limit_minor: limit, evidence_state: 'confirmed' };
        const family = { id: 'family', members: ['p1', 'p2'] };
        const access = createInstrumentedAccess({ emit, bindings: [['budget', 'budget', budget], ['family', 'family', family], ['food', 'category', { id: 'food' }],
            ...family.members.map(id => [id, 'person', { id }])].map(([alias, kind, value]) => ({
            alias, role: 'budget', value, identity: { kind, ref_id: alias, version }, shape: { type: 'record',
                fields: Object.fromEntries(Object.keys(value).map(k => [k, k === 'members' ? { type: 'sequence', item: scalar } : scalar])) }
        })), links: [{ id: 'family', source: 'budget', field: 'family_id', target: 'family', type: 'ref' },
            ...(omitCategoryLink ? [] : [{ id: 'category', source: 'budget', field: 'category_id', target: 'food', type: 'ref' }]),
            ...family.members.map(id => ({ id: `family-${id}`, source: 'family', field: 'members', target: id, type: 'ref_list' }))] });
        const policyValue = { timezone: 'America/Sao_Paulo', calendar: 'proleptic_gregorian', daily_pace_as_of: '2042-06-15',
            daily_pace_start: '2042-06-16', daily_pace_end: '2042-06-30', daily_pace_divisor: 15, daily_pace_rounding: 'floor', ...policy };
        const temporal = createInstrumentedAccess({ emit, bindings: [['clock', { fixed_clock: clock }], ['policy', policyValue]].map(([alias, value]) => ({
            alias, role: 'temporal', value, shape: { type: 'record', fields: Object.fromEntries(Object.keys(value).map(k => [k, scalar])) }
        })) });
        const operands = { events: f.operands.events, categories: f.operands.categories, context: f.operands.context,
            budget: access.handle('budget'), clock: temporal.handle('clock'), policy: temporal.handle('policy') };
        try {
            const result = evaluateEconomicMetric(operands, 'safe_pace');
            assert.ok(f.observations.some(e => e[1] === 'traverse' && e[2] === 'budget' && e[4][0] === 'category_id'));
            return result;
        } finally { access.revoke(); temporal.revoke(); for (const control of f.controls) control.revoke(); }
    }
    assert.equal(run(), 217); // (3400 - 135) / 15 = 217.66...
    assert.equal(run({ limit: 130 }), -1); // floor(-5 / 15), not truncation
    for (const policy of [{ daily_pace_divisor: 14 }, { daily_pace_as_of: '2042-06-14' },
        { daily_pace_start: '2042-06-15' }, { daily_pace_end: '2042-06-29' }, { daily_pace_rounding: 'round' }]) {
        assert.throws(() => run({ policy }), /metric_selection_pace/);
    }
    assert.throws(() => run({ clock: '2042-06-15T02:59:59Z' }), /metric_selection_pace/);
    assert.throws(() => run({ omitCategoryLink: true }), /access_/);
});
