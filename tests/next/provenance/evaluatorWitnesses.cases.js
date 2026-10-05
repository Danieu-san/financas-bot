'use strict';
// Harness only: schema-valid formula discriminants, not graph acceptance or
// completion of the proof-atom mutation matrix. Expectations stay outside guest.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const { admitArtifact } = require('../../../src/next/provenance/artifactLoader');
const { runAdmittedMetric } = require('../../../src/next/provenance/executionHost');
const { projectPrimaryDerivedClaimPayload } = require('../../../src/next/provenance/claimBinding');
const root = path.resolve(__dirname, '../../..');
const base = 'docs/contracts/next/provenance-v2/';
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
const json = file => JSON.parse(read(base + file));
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const scalar = Object.freeze({ type: 'scalar' });
const material = json('material-field-registry-v1.json');
const witnesses = json('evaluator-witness-contracts-v1.json').witnesses;
const registry = json('metric-evaluator-registry-v1.json');
let toolPromise;
function tools() {
    if (!toolPromise) toolPromise = Promise.all([
        import('../../../scripts/agent/buildNextMetricArtifacts.mjs'),
        import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs')
    ]).then(([metrics, build]) => {
        const child = metrics.buildMetricChildCapsule();
        return { build, validators: build.buildSchemaValidators().validators,
            built: metrics.buildAvailableMetricArtifacts().built,
            childReceipt: admitArtifact({ manifestBytes: Buffer.from(child.manifest),
                expectedRoot: child.artifact_root,
                entries: [{ path: 'bootstrap.js', bytes: Buffer.from(child.source) }] }) };
    });
    return toolPromise;
}
function shape(value) {
    if (Array.isArray(value)) return { type: 'sequence', item: value.length ? shape(value[0]) : scalar };
    if (value && typeof value === 'object') return { type: 'record',
        fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shape(item)])) };
    return scalar;
}
function common() {
    return [
        ['fixture', { id: 'fixture', synthetic: true, closed_world: true, currency: 'BRL', fixed_clock: '2042-06-15T12:00:00Z' }],
        ['source_origin', { id: 'origin', fixture_id: 'fixture' }],
        ['family', { id: 'family', label: 'synthetic family', members: ['person_a', 'person_b'] }],
        ...['person_a', 'person_b'].map(id => ['person', { id, label: id, family_id: 'family' }]),
        ...['account_a', 'account_b'].map(id => ['account', { id, label: id, owner_id: 'person_a',
            type: 'checking', opening_balance_minor: 100, opening_balance_as_of: '2042-06-01' }]),
        ...['card_a', 'card_b'].map(id => ['card', { id, label: id, owner_id: 'person_a', closing_day: 10, due_day: 17 }]),
        ['category', { id: 'expense', label: 'synthetic expense', kind: 'expense' }],
        ['category', { id: 'neutral.invoice_payment', label: 'synthetic payment', kind: 'neutral' }]
    ];
}
function event(id, amount_minor, changes = {}) {
    return ['event', { id, date: '2042-06-13', person_id: 'person_a', category_id: 'expense',
        state: 'confirmed', amount_minor, account_id: 'account_a', ...changes }];
}
function context(subject, period, time_basis) {
    return { subject, period, time_basis };
}
function operandData(rows, ctx, direct, populations = {}) {
    const ids = rows.map(([, value]) => value.id);
    assert.equal(new Set(ids).size, ids.length, 'fixture IDs must be globally unique');
    const all = new Map(rows.map(([kind, value]) => [value.id, { kind, value }]));
    const relations = [];
    for (const [kind, value] of rows) for (const [field, spec] of Object.entries(material.kinds[kind].fields)) {
        if (spec.class !== 'edge' || !Object.hasOwn(value, field)) continue;
        assert.ok(['ref', 'ref_list', 'role_ref_list'].includes(spec.type), 'no unmodelled reference fixture');
        const refs = spec.type === 'ref' ? [value[field]] : spec.type === 'role_ref_list' ? value[field].map(row => row.parent_ref) : value[field];
        assert.equal(new Set(refs).size, refs.length);
        for (const ref of refs) {
            const target = all.get(ref);
            assert.ok(target && spec.targets.includes(target.kind), `${kind}.${field}: typed closed-world target`);
            relations.push({ id: `edge/${value.id}/${field}/${ref}`, source: value.id,
                target: ref, field, type: spec.type });
        }
    }
    const bindingsFor = role => rows.map(([kind, value]) => ({ alias: value.id, role, value,
        identity: { kind, ref_id: value.id, version: kind === 'derived_claim' ? value.result_hash : hash(canonicalValue({ kind, value })) },
        shape: { type: 'record', fields: Object.fromEntries(Object.entries(material.kinds[kind].fields)
            .map(([name, spec]) => [name, spec.class === 'non_material' ? { type: 'non_material' }
                : spec.type === 'ref_list' ? { type: 'sequence', item: scalar }
                : spec.type === 'role_ref_list' ? { type: 'sequence', item: { type: 'record', fields: { role_id: scalar, parent_ref: scalar } } }
                : spec.type === 'typed_result' ? shape(value[name]) : scalar])) } }));
    return { bindings: [], directGroups: [
        { role: 'context', alias: 'context', bindings: [{ alias: 'context', role: 'context', value: ctx, shape: shape(ctx) }], links: [] },
        ...Object.entries(direct).map(([role, alias]) => ({ role, alias,
            bindings: bindingsFor(role), links: relations }))
    ], nodeSets: Object.entries(populations).map(([role, roster]) => ({ role, roster,
        bindings: bindingsFor(role), links: relations })) };
}
function mutateExactly(source, before, after) {
    assert.notEqual(before, after);
    assert.equal(source.split(before).length, 2, 'mutation must have one exact source anchor');
    return source.replace(before, after);
}
function artifact(source) {
    const bytes = Buffer.from(source);
    const manifestBytes = Buffer.from(canonicalValue({ format: 'financasbot.provenance.artifact',
        version: 1, kind: 'metric', entry: 'bundle.js', files: [{ path: 'bundle.js',
            media_type: 'text/javascript', sha256: hash(bytes) }] }));
    return admitArtifact({ manifestBytes, expectedRoot: hash(manifestBytes), entries: [{ path: 'bundle.js', bytes }] });
}
async function executeDiscriminant(t, id, make, mutation) {
    const tooling = await tools();
    const witness = witnesses.find(row => row.evaluator_id === id);
    const violationWitness = witness?.expected_violation === 'coverage';
    assert.ok(witness && (violationWitness || Object.hasOwn(witness, 'expected') && Object.hasOwn(witness, 'mutated_result')));
    const entry = registry.entries.find(row => row.evaluator_id === id);
    const contract = json(`evaluator-contracts/${id}.json`);
    const { rows, ctx, direct, populations, parentRoles = [] } = make(witness.inputs);
    for (const [kind, payload] of rows) {
        const envelope = { kind, ref_id: payload.id, version: hash(canonicalValue({ kind, payload })), payload };
        assert.equal(tooling.validators.snapshot(envelope), true,
            `${id}/${kind}/${payload.id}: ${JSON.stringify(tooling.validators.snapshot.errors)}`);
    }
    const operands = operandData(rows, ctx, direct, populations);
    if (parentRoles.length) {
        operands.parentGroups = parentRoles.map(role => {
            const group = operands.directGroups.find(row => row.role === role);
            assert.ok(group);
            const edgeId = `derived/${role}`;
            return { role, alias: group.alias, edgeId, bindings: group.bindings.filter(row => row.alias === group.alias),
                edges: [{ id: edgeId, source: 'claim', relation: 'derived_from', field: role, target: group.alias }] };
        });
        operands.directGroups = operands.directGroups.filter(row => !parentRoles.includes(row.role));
    }
    const operandHash = hash(canonicalValue(operands));
    const kernel = mutation.kernel || 'metricDirectReads';
    const plans = {
        metricSelection: { closure: ['metricSelection', 'civilCalendar', 'literalTypes', 'metricReferences'], exportName: 'evaluateEconomicMetric' },
        metricEffects: { closure: ['metricEffects', 'metricSelection', 'civilCalendar', 'literalTypes', 'metricReferences'], exportName: 'evaluateEffects' },
        metricInstallments: { closure: ['metricInstallments', 'civilCalendar', 'literalTypes', 'metricReferences'], exportName: 'evaluateInstallments' },
        metricParents: { closure: ['metricParents', 'civilCalendar', 'literalTypes'], exportName: 'evaluateParentMetric' },
        metricDirectReads: { closure: ['metricDirectReads', 'metricSelection', 'civilCalendar', 'literalTypes', 'metricReferences'], exportName: 'evaluateDirectMetric' }
    };
    const { closure, exportName } = plans[kernel];
    const mode = mutation.mode || id;
    const sources = closure
        .map(name => ({ path: `${name}.js`, source: read(`src/next/provenance/${name}.js`) }));
    const original = tooling.built.find(row => row.evaluator_id === id);
    const rebuilt = tooling.build.buildTypedMetricGuestBundle({ sources, entry: `${kernel}.js`,
        exportName, constants: [mode], unit: entry.unit, kind: contract.signature.output.kind });
    assert.equal(rebuilt.source, original.source, 'baseline is the actual normative evaluator build, not a second formula');
    const target = sources.find(row => row.path === `${kernel}.js`);
    target.source = mutateExactly(target.source, mutation.before, mutation.after);
    const mutant = tooling.build.buildTypedMetricGuestBundle({ sources, entry: `${kernel}.js`,
        exportName, constants: [mode], unit: entry.unit, kind: contract.signature.output.kind });
    const baselineConfig = { artifactReceipt: artifact(original.source),
        childCapsuleReceipt: tooling.childReceipt, executionId: 'witness-direct', invocationId: `${id}/baseline`,
        timeoutMs: 2500, ...operands };
    let baseline;
    if (violationWitness) await assert.rejects(runAdmittedMetric(baselineConfig), /^Error: host_child_evaluation$/);
    else {
        baseline = await runAdmittedMetric(baselineConfig);
        assert.deepEqual(baseline.functional_result, { unit: entry.unit, kind: contract.signature.output.kind, value: witness.expected });
        assert.equal(baseline.graph_accepted, false);
    }
    assert.equal(hash(canonicalValue(operands)), operandHash);
    const changed = await runAdmittedMetric({ artifactReceipt: artifact(mutant.source),
        childCapsuleReceipt: tooling.childReceipt, executionId: 'witness-direct', invocationId: `${id}/mutant`,
        timeoutMs: 2500, ...operands });
    assert.deepEqual(changed.functional_result, { unit: entry.unit, kind: contract.signature.output.kind,
        value: violationWitness ? witness.inputs.source_event_count : witness.mutated_result });
    if (baseline) assert.notDeepEqual(changed.functional_result, baseline.functional_result);
    assert.equal(hash(canonicalValue(operands)), operandHash, 'same admitted operands for both behaviors');
    if (baseline) assert.ok(baseline.trace.derivation_trace.some(row => row.operation === 'get'));
    t.diagnostic(`witness=${witness.id}; baseline_and_behavior_mutant_executed=true; payload_schema_valid=true; graph_acceptance=false; proof_atom_realization=pending; validated_parent_authority=false`);
}
const payment = inputs => ({ rows: [...common(), event('payment', inputs.payment_amount ?? inputs.amount_minor ?? -7,
    { category_id: 'neutral.invoice_payment', settles_card_id: inputs.settles_card_id ?? 'card_b' })],
    ctx: context({ kind: 'event', ref_id: 'payment' }, { kind: 'date', value: '2042-06-13' }, 'event_date'),
    direct: { event: 'payment', card: 'card_b' } });

test('N02G:EVALUATOR-WITNESS-001 signed balance discriminant runs real captured code and its absolute-value mutation', async t => {
    await executeDiscriminant(t, 'balance_delta', inputs => ({ ...payment(inputs),
        ctx: context({ kind: 'account', ref_id: 'account_a' }, { kind: 'date', value: '2042-06-13' }, 'event_date') }),
    { before: "return checkedMoney(event.get('amount_minor'));", after: "return Math.abs(checkedMoney(event.get('amount_minor')));" });
});
test('N02G:EVALUATOR-WITNESS-002 payment magnitude discriminates preserving a negative sign', async t => {
    await executeDiscriminant(t, 'invoice_payment_amount', payment,
        { before: "return Math.abs(checkedMoney(event.get('amount_minor')));", after: "return checkedMoney(event.get('amount_minor'));" });
});
test('N02G:EVALUATOR-WITNESS-003 target card discriminates an explicit retarget behavior', async t => {
    await executeDiscriminant(t, 'invoice_payment_target_card', payment,
        { before: 'return target.ref;', after: "return 'card_a';" });
});
test('N02G:EVALUATOR-WITNESS-004 absence of statement link discriminates inference from card alone', async t => {
    await executeDiscriminant(t, 'statement_payment_correspondence', payment,
        { before: "return 'unproven';", after: "return 'proven';" });
});
test('N02G:EVALUATOR-WITNESS-005 partial source coverage is not silently complete', async t => {
    await executeDiscriminant(t, 'source_coverage', inputs => ({ rows: [...common(),
        ['source_state', { id: 'source', source: 'origin', coverage: inputs.coverage, period: '2042-06' }]],
    ctx: context({ kind: 'source', ref_id: 'source' }, { kind: 'month', value: '2042-06' }, 'source_period'), direct: { source: 'source' } }),
    { before: 'return coverage;', after: "return 'complete';" });
});
test('N02G:EVALUATOR-WITNESS-006 account cutoff excludes a schema-valid later movement', async t => {
    await executeDiscriminant(t, 'account_balance', inputs => {
        const rows = common(); rows.find(([kind, p]) => kind === 'account' && p.id === 'account_a')[1].opening_balance_minor = inputs.opening_balance_minor;
        const events = inputs.eligible_amounts.map((amount, i) => event(`eligible_${i}`, amount));
        events.push(event('after_cutoff', inputs.after_cutoff_amount, { date: '2042-06-16' }));
        return { rows: [...rows, ...events], ctx: context({ kind: 'account', ref_id: 'account_a' }, { kind: 'as_of', value: '2042-06-15' }, 'event_date'),
            direct: { account: 'account_a' }, populations: { events: events.map(([, value]) => value.id) } };
    }, { before: 'contains = date => date >= start && date <= end;', after: 'contains = date => date >= start;' });
});
test('N02G:EVALUATOR-WITNESS-007 movement population does not become an expense-only filter', async t => {
    await executeDiscriminant(t, 'movement_ids', inputs => {
        const rows = inputs.account_ids.map((id, i) => event(id, i + 1));
        rows.push(event(inputs.other_account_id, -3, { account_id: 'account_b' }));
        return { rows: [...common(), ...rows], ctx: context({ kind: 'account', ref_id: 'account_a' }, { kind: 'month', value: '2042-06' }, 'event_date'),
            direct: { account: 'account_a' }, populations: { events: rows.map(([, value]) => value.id) } };
    }, { before: "if (metric === 'movement_ids') return selectedIds(selected);",
        after: "if (metric === 'movement_ids') { const ids = []; for (const event of selected) if (event.get('amount_minor') < 0) ids.push(event.get('id')); return ids; }" });
});
const range = { kind: 'range', start: '2042-06-15', end: '2042-06-30', start_inclusive: true, end_inclusive: true };
const bill = (id, amount_minor, changes = {}) => ['bill', { id, person_id: 'person_a', due_date: '2042-06-20',
    amount_minor, status: 'open', evidence_state: 'confirmed', source: 'origin', ...changes }];
test('N02G:EVALUATOR-WITNESS-008 open bills exclude a schema-valid paid bill', async t => {
    await executeDiscriminant(t, 'bills_open', inputs => {
        const bills = inputs.open_due_amounts.map((amount, i) => bill(`open_${i}`, amount));
        bills.push(bill('paid', inputs.paid_amount, { status: 'paid' }));
        return { rows: [...common(), ...bills], ctx: context({ kind: 'family', ref_id: 'family' }, { kind: 'month', value: '2042-06' }, 'due_date'),
            direct: { family: 'family' }, populations: { bills: bills.map(([, value]) => value.id) } };
    }, { before: "return status === 'open' && timely && ownerMatches(owner);", after: 'return timely && ownerMatches(owner);' });
});
test('N02G:EVALUATOR-WITNESS-009 due bill IDs exclude the later due date', async t => {
    await executeDiscriminant(t, 'due_bill_ids', inputs => {
        const bills = inputs.eligible_ids.map(id => bill(id, 1));
        bills.push(bill(inputs.outside_due_id, 2, { due_date: '2042-07-01' }));
        return { rows: [...common(), ...bills], ctx: context({ kind: 'person', ref_id: 'person_a' }, range, 'due_date'),
            direct: { person: 'person_a' }, populations: { bills: bills.map(([, value]) => value.id) } };
    }, { before: "return status === 'open' && timely && ownerMatches(owner);", after: "return status === 'open' && ownerMatches(owner);" });
});
test('N02G:EVALUATOR-WITNESS-010 due total excludes the later monetary contribution', async t => {
    await executeDiscriminant(t, 'due_bills_total', inputs => {
        const bills = inputs.eligible_amounts.map((amount, i) => bill(`due_${i}`, amount));
        bills.push(bill('outside', inputs.outside_due_amount, { due_date: '2042-07-01' }));
        return { rows: [...common(), ...bills], ctx: context({ kind: 'person', ref_id: 'person_a' }, range, 'due_date'),
            direct: { person: 'person_a' }, populations: { bills: bills.map(([, value]) => value.id) } };
    }, { before: "return status === 'open' && timely && ownerMatches(owner);", after: "return status === 'open' && ownerMatches(owner);" });
});
function scheduled(inputs, calendar) {
    const kind = calendar ? 'calendar_event' : 'reminder'; const collection_name = calendar ? 'calendar_events' : 'reminders';
    const entries = inputs.eligible_ids.map(id => [kind, { id, person_id: 'person_a', scheduled_at: '2042-06-20' }]);
    entries.push([kind, { id: calendar ? inputs.outside_period_id : inputs.other_person_id,
        person_id: calendar ? 'person_a' : 'person_b', scheduled_at: calendar ? '2042-07-01' : '2042-06-20' }]);
    const roster = entries.map(([, value]) => value.id);
    return { rows: [...common(), ...entries,
        ['collection', { id: 'collection', fixture_id: 'fixture', collection_name, members: roster }]],
    ctx: context({ kind: 'person', ref_id: 'person_a' }, range, 'scheduled_at'),
    direct: { person: 'person_a', collection: 'collection' }, populations: { entries: roster } };
}
test('N02G:EVALUATOR-WITNESS-011 calendar count excludes an out-of-window event', async t => {
    await executeDiscriminant(t, 'calendar_event_count', inputs => scheduled(inputs, true),
        { before: 'return timely && same(owner, person);', after: 'return same(owner, person);' });
});
test('N02G:EVALUATOR-WITNESS-012 reminder count excludes another person', async t => {
    await executeDiscriminant(t, 'reminder_count', inputs => scheduled(inputs, false),
        { before: 'return timely && same(owner, person);', after: 'return timely;' });
});
test('N02G:EVALUATOR-WITNESS-013 merchant rule IDs use nominal merchant identity', async t => {
    await executeDiscriminant(t, 'merchant_rule_ids', inputs => {
        const rules = inputs.matching_ids.map(id => ['merchant_rule', { id, merchant_key: 'merchant_a', category_id: 'expense',
            application: 'suggestion', reversible: true, evidence_state: 'confirmed', source: 'origin' }]);
        rules.push(['merchant_rule', { id: inputs.other_merchant_id, merchant_key: 'merchant_b', category_id: 'expense',
            application: 'suggestion', reversible: true, evidence_state: 'confirmed', source: 'origin' }]);
        return { rows: [...common(), ...['merchant_a', 'merchant_b'].map(id => ['merchant_identity', { id, fixture_id: 'fixture' }]), ...rules],
            ctx: context({ kind: 'merchant', ref_id: 'merchant_a' }, { kind: 'as_of', value: '2042-06-15' }, 'registry_current'),
            direct: { merchant: 'merchant_a' }, populations: { rules: rules.map(([, value]) => value.id) } };
    }, { before: "return same(readReference(node, ownership ? 'owner_id' : 'merchant_key', scopeKind), target);",
        after: "readReference(node, ownership ? 'owner_id' : 'merchant_key', scopeKind); return true;" });
});
test('N02G:EVALUATOR-WITNESS-014 side effects remain scoped to their actual turn', async t => {
    await executeDiscriminant(t, 'side_effect_count', inputs => {
        const entries = [...inputs.turn_a_effects.map(id => ['side_effect', { id, turn_id: 'turn_a' }]),
            ...inputs.turn_b_effects.map(id => ['side_effect', { id, turn_id: 'turn_b' }])];
        const roster = entries.map(([, value]) => value.id);
        return { rows: [...common(), ...['turn_a', 'turn_b'].map(id => ['turn', { id, fixture_id: 'fixture' }]), ...entries,
            ['collection', { id: 'collection', fixture_id: 'fixture', collection_name: 'side_effects', members: roster }]],
        ctx: context({ kind: 'turn', ref_id: 'turn_a' }, { kind: 'as_of', value: '2042-06-15' }, 'request_execution'),
        direct: { turn: 'turn_a', collection: 'collection' }, populations: { entries: roster } };
    }, { before: "const selected = operands.entries.select(entry => same(readReference(entry, 'turn_id', 'turn'), turn));",
        after: "const selected = operands.entries.select(entry => { readReference(entry, 'turn_id', 'turn'); return true; });" });
});
test('N02G:EVALUATOR-WITNESS-015 fixture schema and exact mutation anchors cannot be bypassed', async () => {
    const tooling = await tools(); const invalid = event('bad', '7')[1];
    assert.equal(tooling.validators.snapshot({ kind: 'event', ref_id: invalid.id, version: hash(canonicalValue(invalid)), payload: invalid }), false);
    assert.throws(() => mutateExactly('anchor anchor', 'anchor', 'changed'), /one exact source anchor/);
    assert.throws(() => mutateExactly('absent', 'anchor', 'changed'), /one exact source anchor/);
    const malformed = common(); malformed.push(event('unbound', 1, { settles_card_id: 'missing' }));
    assert.throws(() => operandData(malformed, {}, { event: 'unbound' }), /typed closed-world target/);
    assert.throws(() => operandData([...common(), common()[0]], {}, {}), /globally unique/);
});
function economic(events, changes = {}) {
    const rows = common(); rows.find(([kind, p]) => kind === 'category' && p.id === 'expense')[1].budget_class = 'flexible';
    rows.push(['category', { id: 'essential', label: 'synthetic essential', kind: 'expense', budget_class: 'essential' }],
        ['category', { id: 'income', label: 'synthetic income', kind: 'income' }],
        ['category', { id: 'refund', label: 'synthetic compensation', kind: 'compensation' }], ...events);
    return { rows,
        ctx: { ...context({ kind: 'person', ref_id: 'person_a' }, { kind: 'month', value: '2042-06' }, 'event_date'),
            coverage: 'complete', evidence_state: 'confirmed', ...changes.ctx },
        direct: { family: 'family', ...changes.direct }, populations: {
            events: events.map(([, value]) => value.id), categories: ['expense', 'essential', 'income', 'refund', 'neutral.invoice_payment'] } };
}
function withRefund(consumptions) {
    return consumptions.map((contribution, i) => event(`category_${i}`, -contribution,
        contribution < 0 ? { category_id: 'refund', compensates: 'category_0' } : {}));
}
const selectMutation = (mode, before, after) => ({ kernel: 'metricSelection', mode, before, after });
const selectedLine = "return state === 'confirmed' && contains(date) && inScope\n            && economicMatch && filterMatch;";
test('N02G:EVALUATOR-WITNESS-016 total consumption includes linked compensation', async t => {
    await executeDiscriminant(t, 'consumption_total', inputs => economic([
        event('purchase', -inputs.expense), event('linked_refund', -inputs.linked_refund, { category_id: 'refund', compensates: 'purchase' }),
        event('neutral', inputs.neutral, { category_id: 'neutral.invoice_payment' })]),
    selectMutation('total', "const amount = money(event.get('amount_minor'));", "const amount = money(event.get('amount_minor')); if (amount > 0) continue;"));
});
test('N02G:EVALUATOR-WITNESS-017 category consumption discriminates dropping compensation', async t => {
    await executeDiscriminant(t, 'category_consumption', inputs => economic([
        ...withRefund(inputs.category_consumption), event('other_category', -inputs.other_category_consumption, { category_id: 'essential' })],
    { ctx: { subject: { kind: 'person_category', person_id: 'person_a', category_id: 'expense' } } }),
    selectMutation('category', "const amount = money(event.get('amount_minor'));", "const amount = money(event.get('amount_minor')); if (amount > 0) continue;"));
});
test('N02G:EVALUATOR-WITNESS-018 category spent rejects other-category contribution', async t => {
    await executeDiscriminant(t, 'category_spent', inputs => economic([
        ...withRefund(inputs.category_consumption), event('other_category', -inputs.other_category_consumption, { category_id: 'essential' })],
    { ctx: { subject: { kind: 'person_category', person_id: 'person_a', category_id: 'expense' } } }),
    selectMutation('spent', 'let filterMatch = category === undefined || effectiveCategory.key === category;', 'let filterMatch = true;'));
});
test('N02G:EVALUATOR-WITNESS-019 budget remaining subtracts actual eligible consumption', async t => {
    await executeDiscriminant(t, 'category_budget_remaining', inputs => {
        const f = economic(inputs.eligible_consumption.map((amount, i) => event(`expense_${i}`, -amount)),
            { ctx: { subject: { kind: 'budget', ref_id: 'budget' }, time_basis: 'budget_cycle' }, direct: { budget: 'budget' } });
        f.rows.push(['budget', { id: 'budget', family_id: 'family', category_id: 'expense', period: '2042-06',
            limit_minor: inputs.limit_minor, evidence_state: 'confirmed', source: 'origin' }]); return f;
    }, selectMutation('budget_remaining', "result = money(money(operands.budget.get('limit_minor')) - result);",
        "result = money(money(operands.budget.get('limit_minor')) + result);"));
});
test('N02G:EVALUATOR-WITNESS-020 flexible budget class excludes essential consumption', async t => {
    await executeDiscriminant(t, 'budget_class_consumption', inputs => economic([
        ...inputs.flexible_consumption.map((amount, i) => event(`flexible_${i}`, -amount)),
        ...inputs.essential_consumption.map((amount, i) => event(`essential_${i}`, -amount, { category_id: 'essential' }))],
    { ctx: { subject: { kind: 'family', ref_id: 'family' }, filters: { budget_class: 'flexible' } } }),
    selectMutation('budget_class', 'filterMatch = actual === budgetClass;', 'filterMatch = true;'));
});
test('N02G:EVALUATOR-WITNESS-021 realized income excludes projected income', async t => {
    await executeDiscriminant(t, 'income_realized', inputs => economic([
        ...inputs.confirmed_income.map((amount, i) => event(`income_${i}`, amount, { category_id: 'income' })),
        event('projected_income', inputs.projected_income, { category_id: 'income', state: 'projected' })]),
    selectMutation('income', selectedLine, 'return contains(date) && inScope && economicMatch && filterMatch;'));
});
test('N02G:EVALUATOR-WITNESS-022 instrument consumption excludes another nominal instrument', async t => {
    await executeDiscriminant(t, 'consumption_by_instrument', inputs => economic([
        ...inputs.instrument_consumption.map((amount, i) => event(`instrument_${i}`, -amount, { card_id: 'card_a' })),
        event('other_instrument', -inputs.other_instrument_consumption, { card_id: 'card_b' })],
    { ctx: { subject: { kind: 'card', ref_id: 'card_a' } }, direct: { instrument: 'card_a' } }),
    selectMutation('instrument', 'inScope = target.ref === instrument && target.version === instrumentVersion;', 'inScope = true;'));
});
function policy() {
    return ['evaluation_policy', { id: 'policy', calendar: 'proleptic_gregorian', timezone: 'America/Sao_Paulo',
        ranking_key: 'validated_consumption_minor', ranking_direction: 'desc', ranking_tie_break: 'lexical_internal_id',
        daily_pace_divisor: 15, daily_pace_rounding: 'floor', daily_pace_start: '2042-06-16',
        daily_pace_end: '2042-06-30', daily_pace_as_of: '2042-06-15' }];
}
test('N02G:EVALUATOR-WITNESS-023 statement excludes the previous closing boundary', async t => {
    await executeDiscriminant(t, 'statement_total', inputs => {
        const f = economic([
            event('previous_close', -inputs.at_previous_close_consumption, { card_id: 'card_a', date: '2042-05-10' }),
            event('after_previous', -inputs.after_previous_close_consumption, { card_id: 'card_a', date: '2042-05-11' }),
            event('current_close', -inputs.at_current_close_consumption, { card_id: 'card_a', date: '2042-06-10' }),
            event('after_current', -inputs.after_current_close_consumption, { card_id: 'card_a', date: '2042-06-11' })],
        { ctx: { subject: { kind: 'card', ref_id: 'card_a' }, time_basis: 'statement_due_date',
            period: { kind: 'statement_due', value: '2042-06-17' } }, direct: { card: 'card_a', policy: 'policy' } });
        f.rows.push(policy()); return f;
    }, selectMutation('statement', 'contains = value => value > start && value <= end;', 'contains = value => value >= start && value <= end;'));
});
test('N02G:EVALUATOR-WITNESS-024 safe pace derives civil days and floors rather than ceilings', async t => {
    await executeDiscriminant(t, 'safe_daily_pace', inputs => {
        assert.equal(inputs.divisor, 15);
        const f = economic([], { ctx: { subject: { kind: 'budget', ref_id: 'budget' }, time_basis: '15_full_days_after_as_of',
            evidence_state: 'estimated', period: { ...range, start: '2042-06-16' } }, direct: { budget: 'budget', clock: 'fixture', policy: 'policy' } });
        f.rows.push(policy(), ['budget', { id: 'budget', family_id: 'family', category_id: 'expense', period: '2042-06',
            limit_minor: inputs.remaining_minor, evidence_state: 'confirmed', source: 'origin' }]); return f;
    }, selectMutation('safe_pace', 'Math.floor(result / divisor)', 'Math.ceil(result / divisor)'));
});
const effectMutation = (before, after) => ({ kernel: 'metricEffects', before, after });
const contributionLine = "const contribution = ['expense', 'compensation'].includes(ownKind) ? 0 - amount : 0;";
test('N02G:EVALUATOR-WITNESS-025 neutral paired transfer has no consumption effect', async t => {
    await executeDiscriminant(t, 'consumption_effect', inputs => {
        assert.equal(inputs.category, 'neutral');
        const events = inputs.neutral_transfer_amounts.map((amount, i) => event(`transfer_${i}`, amount,
            { category_id: 'neutral.transfer', transfer_pair: 'pair' }));
        const f = economic(events, { ctx: { subject: { kind: 'transfer_pair', ref_id: 'pair' } } });
        f.rows.push(['category', { id: 'neutral.transfer', label: 'synthetic transfer', kind: 'neutral' }],
            ['transfer_identity', { id: 'pair', members: events.map(([, value]) => value.id) }]);
        f.populations.categories.push('neutral.transfer'); return f;
    }, effectMutation(contributionLine, 'const contribution = Math.abs(amount);'));
});
test('N02G:EVALUATOR-WITNESS-026 payment consumes no budget merely because money moved', async t => {
    await executeDiscriminant(t, 'invoice_payment_consumption_effect', inputs => economic([
        event('payment', inputs.payment_amount, { category_id: inputs.category, settles_card_id: 'card_b' })],
    { ctx: { subject: { kind: 'event', ref_id: 'payment' } } }),
    effectMutation(contributionLine, "const contribution = ['expense', 'compensation', 'neutral'].includes(ownKind) ? 0 - amount : 0;"));
});
test('N02G:EVALUATOR-WITNESS-027 gross consumption does not become net consumption', async t => {
    await executeDiscriminant(t, 'gross_consumption', inputs => economic(withRefund(inputs.consumption_values),
        { ctx: { subject: { kind: 'person_category', person_id: 'person_a', category_id: 'expense' } } }),
    effectMutation("metric === 'gross_consumption' ? Math.max(0, contribution) : contribution",
        "metric === 'gross_consumption' ? contribution : contribution"));
});
test('N02G:EVALUATOR-WITNESS-028 net consumption includes a linked refund', async t => {
    await executeDiscriminant(t, 'net_consumption', inputs => economic([
        event('purchase', -inputs.purchase_consumption),
        event('compensation', -inputs.linked_refund_consumption, { category_id: 'refund', compensates: 'purchase' })],
    { ctx: { subject: { kind: 'event', ref_id: 'purchase' } } }),
    effectMutation(contributionLine, "const contribution = ['expense', 'compensation'].includes(ownKind) ? Math.max(0, 0 - amount) : 0;"));
});
test('N02G:EVALUATOR-WITNESS-029 refund amount does not add the purchase magnitude', async t => {
    await executeDiscriminant(t, 'refund_amount', inputs => {
        const f = economic([event('purchase', inputs.original_purchase_amount),
            event('compensation', inputs.refund_amount, { category_id: 'refund', compensates: 'purchase' })],
        { ctx: { subject: { kind: 'event', ref_id: 'compensation' } } });
        f.populations.events = ['compensation']; return f;
    }, effectMutation("metric === 'refund_amount' ? Math.max(0, amount)",
        "metric === 'refund_amount' ? Math.abs(amount) + Math.abs(money(event.follow('compensates').get('amount_minor')))"));
});
function installments(confirmed, projected, familyMode = false) {
    const entries = [...confirmed.map(([id, amount]) => ({ id, amount, state: 'confirmed' })),
        ...projected.map(([id, amount]) => ({ id, amount, state: 'projected' }))];
    const events = entries.map((row, i) => event(row.id, row.amount, { date: `2042-06-${16 + i}`, state: row.state,
        installment_plan: 'plan', installment_number: i + 1, installment_total: entries.length,
        ...(familyMode && row.id === 'outside' ? { person_id: 'person_c' } : {}) }));
    const rows = [...common(), ...events, ['installment_plan', { id: 'plan', members: entries.map(row => row.id), installment_total: entries.length }]];
    if (familyMode) rows.push(['person', { id: 'person_c', label: 'synthetic outside person', family_id: 'other_family' }],
        ['family', { id: 'other_family', label: 'synthetic other family', members: ['person_c'] }]);
    return { rows, ctx: context(familyMode ? { kind: 'family', ref_id: 'family' } : { kind: 'installment_plan', ref_id: 'plan' },
        range, 'installment_competence'), direct: familyMode ? { family: 'family' } : { plan: 'plan' },
        populations: { events: entries.map(row => row.id), ...(familyMode ? { plans: ['plan'] } : {}) } };
}
const stateLine = "return state === (realized ? 'confirmed' : 'projected') && contains(date) && inScope;";
const installmentMutation = (before, after) => ({ kernel: 'metricInstallments', before, after });
test('N02G:EVALUATOR-WITNESS-030 projected installment count excludes confirmed state', async t => {
    await executeDiscriminant(t, 'installments_projected', inputs => installments([[inputs.confirmed_id, -1]],
        inputs.projected_ids.map(id => [id, -1])), installmentMutation(stateLine, 'return contains(date) && inScope;'));
});
test('N02G:EVALUATOR-WITNESS-031 projected installment amount excludes confirmed money', async t => {
    await executeDiscriminant(t, 'installments_projected_amount', inputs => installments([['p1', inputs.confirmed_amount]],
        inputs.projected_amounts.map((amount, i) => [`p${i + 2}`, amount])), installmentMutation(stateLine, 'return contains(date) && inScope;'));
});
test('N02G:EVALUATOR-WITNESS-032 realized installment count excludes projected state', async t => {
    await executeDiscriminant(t, 'installments_realized', inputs => {
        const f = installments(inputs.confirmed_ids.map(id => [id, -1]), inputs.projected_ids.map(id => [id, -1]));
        f.ctx.period = { kind: 'through', value: '2042-06-30' }; return f;
    }, installmentMutation(stateLine, 'return contains(date) && inScope;'));
});
test('N02G:EVALUATOR-WITNESS-033 realized installment amount excludes projected money', async t => {
    await executeDiscriminant(t, 'installments_realized_amount', inputs => {
        const f = installments(inputs.confirmed_amounts.map((amount, i) => [`confirmed_${i}`, amount]),
            inputs.projected_amounts.map((amount, i) => [`projected_${i}`, amount]));
        f.ctx.period = { kind: 'through', value: '2042-06-30' }; return f;
    }, installmentMutation(stateLine, 'return contains(date) && inScope;'));
});
test('N02G:EVALUATOR-WITNESS-034 family projected installments exclude another family', async t => {
    await executeDiscriminant(t, 'projected_installments', inputs => installments([], [
        ...inputs.family_projected_amounts.map((amount, i) => [`family_${i}`, amount]), ['outside', inputs.outside_family_amount]], true),
    installmentMutation("const inScope = !familyMode || familyMembers.includes(readReferenceId(event, 'person_id'));", 'const inScope = true;'));
});
function parents(metric, leftValue, rightValue, direction = 'desc') {
    const rows = common();
    for (const [role, value] of [['left', leftValue], ['right', rightValue]]) {
        // Pure material projection only, NEVER an accepted/private receipt.
        // The same-execution acceptance obligations remain pending in G11.
        const { payload } = projectPrimaryDerivedClaimPayload({
            claim_contract_hash: hash('synthetic witness claim contract'), graph_contract_hash: hash('synthetic witness graph contract'),
            metric_registry_hash: hash('synthetic witness registry contract'), claim_id: `claim_${role}`, fact_key: `witness/${role}`,
            evaluator_ref: { evaluator_id: 'income_realized', evaluator_version: 1 },
            result: { unit: 'BRL_minor', kind: 'money_minor', value }, operand_bindings: {}, primary_inputs: [], parents: [], registry_roles: [] });
        rows.push(['derived_claim', payload]);
    }
    const p = policy(); p[1].ranking_direction = direction; rows.push(p);
    return { rows, ctx: context(metric === 'consumption_difference'
        ? { kind: 'person_comparison', person_ids: ['person_a', 'person_b'] } : { kind: 'family', ref_id: 'family' },
    { kind: 'month', value: '2042-06' }, metric === 'income_minus_open_bills' ? 'mixed_declared' : 'event_date'),
    direct: { left: 'claim_left', right: 'claim_right', sort_key: 'policy', sort_direction: 'policy' },
    parentRoles: ['left', 'right'], populations: { people: ['person_a', 'person_b'] } };
}
const parentMutation = (before, after) => ({ kernel: 'metricParents', before, after });
test('N02G:EVALUATOR-WITNESS-035 signed consumption difference distinguishes absolute value', async t => {
    await executeDiscriminant(t, 'consumption_difference', inputs => parents('consumption_difference', inputs.left, inputs.right),
        parentMutation("if (metric !== 'ranking_winner') return money(left - right);",
            "if (metric !== 'ranking_winner') return money(Math.abs(left - right));"));
});
test('N02G:EVALUATOR-WITNESS-036 income minus bills distinguishes reversed operands', async t => {
    await executeDiscriminant(t, 'income_minus_open_bills', inputs => parents('income_minus_open_bills', inputs.income, inputs.bills),
        parentMutation("if (metric !== 'ranking_winner') return money(left - right);",
            "if (metric !== 'ranking_winner') return money(right - left);"));
});
test('N02G:EVALUATOR-WITNESS-037 ranking reads ordered parent roles and direction', async t => {
    await executeDiscriminant(t, 'ranking_winner', inputs => parents('ranking_winner', inputs.person_a, inputs.person_b, inputs.direction),
        parentMutation("return (direction === 'desc' ? left > right : left < right) ? leftId : rightId;",
            "return (direction === 'desc' ? left < right : left > right) ? leftId : rightId;"));
});
test('N02G:EVALUATOR-WITNESS-038 ownership rejects an ID-based liveness heuristic', async t => {
    await executeDiscriminant(t, 'owned_cards', inputs => {
        const rows = common().filter(([kind]) => kind !== 'card');
        const cards = [...inputs.owner_a_cards.map(id => ['card', { id, label: id, owner_id: 'person_a', closing_day: 10, due_day: 17 }]),
            ...inputs.owner_b_cards.map(id => ['card', { id, label: id, owner_id: 'person_b', closing_day: 10, due_day: 17 }])];
        return { rows: [...rows, ...cards], ctx: context({ kind: 'person', ref_id: 'person_a' },
            { kind: 'as_of', value: '2042-06-15' }, 'registry_current'), direct: { person: 'person_a' },
            populations: { cards: cards.map(([, value]) => value.id) } };
    }, { before: "return same(readReference(node, ownership ? 'owner_id' : 'merchant_key', scopeKind), target);",
        after: "return same(readReference(node, ownership ? 'owner_id' : 'merchant_key', scopeKind), target) && !node.get('id').includes('offline');" });
    // There is no admitted availability field. This deliberately wrong ID
    // heuristic discriminates the stated output, not an availability authority.
    t.diagnostic('availability_not_in_material_schema=true; full_normative_mutation_realization=pending');
});
test('N02G:EVALUATOR-WITNESS-039 similar event IDs reject a fallback that ignores nominal merchant key', async t => {
    await executeDiscriminant(t, 'similar_event_ids', inputs => {
        const events = inputs.exact_merchant_ids.map(id => event(id, -1, { merchant_key: 'merchant_a' }));
        events.push(event(inputs.similar_label_other_key, -1, { merchant_key: 'merchant_b' }));
        return { rows: [...common(), ...['merchant_a', 'merchant_b'].map(id => ['merchant_identity', { id, fixture_id: 'fixture' }]), ...events],
            ctx: context({ kind: 'merchant', ref_id: 'merchant_a' }, { kind: 'month', value: '2042-06' }, 'event_date'),
            direct: { merchant: 'merchant_a' }, populations: { events: events.map(([, value]) => value.id) } };
    }, { before: "const matches = event.has('merchant_key') && same(readReference(event, 'merchant_key', 'merchant_identity'), merchant);",
        after: "const matches = event.has('merchant_key'); if (matches) readReference(event, 'merchant_key', 'merchant_identity');" });
    // No label input enters the guest. This covers the output/key-bypass
    // counterexample only; never claim a schema-valid label matcher executed.
    t.diagnostic('label_matcher_not_admitted=true; full_normative_mutation_realization=pending');
});
test('N02G:EVALUATOR-WITNESS-040 source zero is rejected when the actual eligible population is nonempty', async t => {
    await executeDiscriminant(t, 'eligible_event_count', inputs => {
        const f = economic(inputs.eligible_events.map(id => event(id, -1)),
            { ctx: { subject: { kind: 'person_category', person_id: 'person_a', category_id: 'expense' } }, direct: { source: 'source' } });
        f.rows.push(['source_state', { id: 'source', source: 'origin', coverage: 'complete', period: '2042-06',
            category_id: 'expense', entity_id: 'person_a', event_count: inputs.source_event_count }]); return f;
    }, { before: "if (expected !== actualCount) fail('count');", after: 'void actualCount;' });
    t.diagnostic('actual_rejection=host_child_evaluation; exact_coverage_violation_mapping=pending; not_full_G11');
});
