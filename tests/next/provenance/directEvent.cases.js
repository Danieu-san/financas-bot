'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createInstrumentedAccess } = require('../../../src/next/provenance/instrumentedAccess');
const { evaluateDirectMetric, EVENT_V1_FIELDS } = require('../../../src/next/provenance/metricDirectReads');
const scalar = { type: 'scalar' }; const version = `sha256:${'a'.repeat(64)}`;
const metrics = ['balance_delta', 'invoice_payment_amount', 'invoice_payment_target_card', 'statement_payment_correspondence'];

// Synthetic kernel handles, not a claim of admitting altered corpus snapshots.
function fixture(metric, n = 0, patch = {}, adjust = options => options) {
    const event = { id: `event-${n}`, date: '2042-06-13', state: 'confirmed', amount_minor: n % 2 ? 300 + n : -300 - n,
        category_id: 'neutral.invoice_payment', account_id: `account-${n}`, settles_card_id: `card-${n}`, ...patch };
    const observations = []; const alias = `source-${n}`;
    const rows = [[alias, 'event', event], ['category', 'category', { id: event.category_id, kind: 'neutral' }],
        ['account', 'account', { id: event.account_id }], ['card', 'card', { id: event.settles_card_id }]];
    const context = { subject: { kind: metric === 'balance_delta' ? 'account' : 'event', ref_id: metric === 'balance_delta' ? event.account_id : event.id },
        period: { kind: 'date', value: '2042-06-13' }, time_basis: 'event_date' };
    const bindings = rows.map(([name, kind, value]) => ({ alias: name, role: 'test', value,
        identity: { kind, ref_id: value.id, version },
        shape: { type: 'record', fields: Object.fromEntries(Object.keys(value).map(k => [k, scalar])) } }));
    bindings.push({ alias: 'context', role: 'context', value: context, shape: { type: 'record', fields: {
        subject: { type: 'record', fields: { kind: scalar, ref_id: scalar } },
        period: { type: 'record', fields: { kind: scalar, value: scalar } }, time_basis: scalar } } });
    const links = ['category_id', 'account_id', 'settles_card_id'].map((field, i) => ({ id: `edge-${i}`, source: alias, field,
        target: ['category', 'account', 'card'][i], type: 'ref' }));
    const access = createInstrumentedAccess(adjust({ bindings, links, emit: e => observations.push(e) }));
    return { event, alias, observations, access, operands: { event: access.handle(alias), card: access.handle('card'), context: access.handle('context') } };
}
const unique = xs => [...new Set(xs)].sort();

test('N02G:DIRECT-EVENT-001 four compositions have exact causal reads independently of IDs, aliases and amounts', () => {
    const common = ['id', 'date', 'state'];
    const profiles = {
        balance_delta: { reads: [...common, 'account_id', 'amount_minor'], edges: ['account_id'] },
        invoice_payment_amount: { reads: [...common, 'category_id', 'account_id', 'settles_card_id', 'amount_minor'], edges: ['category_id', 'account_id', 'settles_card_id'] },
        invoice_payment_target_card: { reads: [...common, 'settles_card_id'], edges: ['settles_card_id'] },
        statement_payment_correspondence: { reads: common, edges: [] }
    };
    for (const metric of metrics) for (let n = 0; n < 12; n++) {
        const f = fixture(metric, n); const expected = metric === 'balance_delta' ? f.event.amount_minor
            : metric === 'invoice_payment_amount' ? Math.abs(f.event.amount_minor)
                : metric === 'invoice_payment_target_card' ? f.event.settles_card_id : 'unproven';
        assert.equal(evaluateDirectMetric(f.operands, metric), expected);
        assert.deepEqual(unique(f.observations.filter(e => e[1] === 'get' && e[2] === f.alias).map(e => e[4].join('.'))), profiles[metric].reads.sort(), metric);
        assert.deepEqual(unique(f.observations.filter(e => e[1] === 'traverse').map(e => e[4].join('.'))), profiles[metric].edges.sort(), metric);
        const targets = unique(f.observations.filter(e => e[1] === 'get' && ['category', 'account', 'card'].includes(e[2])).map(e => `${e[2]}.${e[4].join('.')}`));
        assert.deepEqual(targets, metric === 'invoice_payment_target_card' ? ['card.id'] : [], metric);
        assert.equal(f.observations.filter(e => e[1] === 'keys').length, metric === 'statement_payment_correspondence' ? 1 : 0);
        f.access.assertHealthy(); f.access.revoke();
    }
});

test('N02G:DIRECT-EVENT-002 guards reject mismatches rather than merely reading the fields', () => {
    const contextMutations = [c => ({ ...c, time_basis: 'posting_date' }), c => ({ ...c, period: { ...c.period, kind: 'month' } }),
        c => ({ ...c, period: { ...c.period, value: '2042-06-14' } }), c => ({ ...c, subject: { ...c.subject, kind: 'family' } }),
        c => ({ ...c, subject: { ...c.subject, ref_id: 'foreign' } })];
    // Context wrappers are deliberately not instrumented: this property tests
    // validation, while DIRECT-EVENT-001 and the corpus test prove observations.
    const handle = value => ({ get: k => value[k] && typeof value[k] === 'object' ? handle(value[k]) : value[k] });
    for (const metric of metrics) {
        for (const mutate of contextMutations) {
            const f = fixture(metric); const context = { subject: { kind: metric === 'balance_delta' ? 'account' : 'event', ref_id: metric === 'balance_delta' ? 'account-0' : 'event-0' },
                period: { kind: 'date', value: '2042-06-13' }, time_basis: 'event_date' };
            assert.throws(() => evaluateDirectMetric({ ...f.operands, context: handle(mutate(context)) }, metric));
        }
        for (const patch of [{ state: 'projected' }, { date: '2042-06-14' }, { date: '2042-02-30' }]) {
            const f = fixture(metric, 0, patch); assert.throws(() => evaluateDirectMetric(f.operands, metric));
        }
    }
    for (const category_id of ['neutral', 'neutral.transfer', 'expense.food']) {
        const f = fixture('invoice_payment_amount', 0, { category_id });
        assert.throws(() => evaluateDirectMetric(f.operands, 'invoice_payment_amount'), /direct_metric_payment_category/);
    }
    for (const metric of metrics.slice(0, 2)) for (const amount_minor of [NaN, Infinity, 0.1, -0, Number.MAX_SAFE_INTEGER + 1]) {
        // Non-JSON numbers are rejected by admission too; inject directly at
        // the scalar interface to isolate the evaluator's own numeric guard.
        const f = fixture(metric); const event = { ...f.operands.event,
            get: key => key === 'amount_minor' ? amount_minor : f.operands.event.get(key) };
        assert.throws(() => evaluateDirectMetric({ ...f.operands, event }, metric), /direct_metric_amount/);
    }
});

test('N02G:DIRECT-EVENT-003 correspondence observes closed schema keys, never card/reference payload', () => {
    const root = path.resolve(__dirname, '../../..');
    const proposal = JSON.parse(fs.readFileSync(path.join(root, 'docs/audit-evidence/n02g-causal-authoring-profile/direct-event-composition-review.json'), 'utf8'));
    // The runtime projection must equal the reviewed schema, not a blacklist of
    // three statement names. Locate the same schema via the frozen source list.
    const schemaDoc = proposal.documents.find(d => /schema.*json$/.test(d.path) && /snapshot/.test(d.path));
    assert.ok(schemaDoc, 'reviewed snapshot schema');
    const schema = JSON.parse(fs.readFileSync(path.join(root, schemaDoc.path), 'utf8'));
    assert.deepEqual([...EVENT_V1_FIELDS].sort(), Object.keys(schema.definitions.payload_event.properties).sort());
    for (const key of ['statement_id', 'settles_statement_id', 'settles_statement_period', ...Array.from({ length: 32 }, (_, i) => `unknown_${i}`)]) {
        const f = fixture('statement_payment_correspondence', 0, { [key]: 'unexpected' });
        assert.throws(() => evaluateDirectMetric(f.operands, 'statement_payment_correspondence'), /direct_metric_statement_schema/, key);
    }
    const f = fixture('statement_payment_correspondence');
    const unavailable = new Proxy({}, { get() { throw new Error('card_must_not_be_consumed'); } });
    assert.equal(evaluateDirectMetric({ ...f.operands, card: unavailable }, 'statement_payment_correspondence'), 'unproven');
    assert.equal(f.observations.some(e => e[1] === 'traverse' || e[2] === 'card'), false);
    for (const key of EVENT_V1_FIELDS.filter(k => !['id', 'date', 'state'].includes(k))) {
        const values = { [key]: 'not-consumed-by-this-formula' };
        const sample = fixture('statement_payment_correspondence', 1, values);
        assert.equal(evaluateDirectMetric(sample.operands, 'statement_payment_correspondence'), 'unproven');
    }
});

test('N02G:DIRECT-EVENT-006 reference-only formulas require admitted coherent relations and target metric binds role identity/version', () => {
    for (const field of ['category_id', 'account_id', 'settles_card_id']) {
        // Fail at admission, before execution: changing a target's payload ID
        // cannot be hidden by leaving its nominal identity or relation intact.
        assert.throws(() => fixture('invoice_payment_amount', 0, {}, options => {
            const link = options.links.find(e => e.field === field);
            options.bindings.find(b => b.alias === link.target).value.id = 'foreign'; return options;
        }));
        const f = fixture('invoice_payment_amount', 0, {}, options => ({ ...options, links: options.links.filter(e => e.field !== field) }));
        assert.throws(() => evaluateDirectMetric(f.operands, 'invoice_payment_amount'));
    }
    for (const mismatch of ['id', 'version', 'kind']) {
        const f = fixture('invoice_payment_target_card'); const original = f.operands.card;
        const card = { ...original, get: key => mismatch === 'id' && key === 'id' ? 'foreign' : original.get(key),
            identity: key => mismatch === 'version' && key === 'version' ? `sha256:${'b'.repeat(64)}`
                : mismatch === 'kind' && key === 'kind' ? 'account' : original.identity(key) };
        assert.throws(() => evaluateDirectMetric({ ...f.operands, card }, 'invoice_payment_target_card'));
    }
});
