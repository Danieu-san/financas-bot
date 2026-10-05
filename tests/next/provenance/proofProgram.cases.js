'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const { admitArtifact } = require('../../../src/next/provenance/artifactLoader');
const { runAdmittedProof } = require('../../../src/next/provenance/executionHost');
const { createInstrumentedAccess } = require('../../../src/next/provenance/instrumentedAccess');
const { createNodeSetAccess } = require('../../../src/next/provenance/instrumentedAccess');
const { evaluateObservedOperator } = require('../../../src/next/provenance/proofOperators');

// VM here checks generated-program semantics only, not an isolation boundary.
test('N02G:ISOLATED-PROOF-001 lowered scalar proof reuses primitives and reads live handles, without raw IR', async () => {
    const { buildScalarProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const operator = { id: 'eq', args: ['scalar:T', 'scalar:T'], semantics: 'typed_equal' };
    const operands = [
        { type: { form: 'scalar', type: 'integer' }, expression: { kind: 'field_ref', alias: 'sample', segments: ['amount'] } },
        { type: { form: 'scalar', type: 'integer' }, expression: { kind: 'literal', value_type: 'integer', value: 7 } }
    ];
    const built = buildScalarProofProgram({ predicates: [{ id: 'p1', operator, operands }], windows: {} });
    assert.equal(built.stage, 'scalar_proof_program_candidate_only');
    assert.equal(built.executable, false);
    for (const forbidden of ['"kind":"field_ref"', '"value_type":', 'expected_trace', 'functional_result']) {
        assert.equal(built.source.includes(forbidden), false, forbidden);
    }
    assert.equal(built.imports.every(row => !row.target.startsWith('node:')), true);
    const run = vm.runInNewContext(built.source);
    for (const amount of [7, 8]) {
        const events = [];
        const access = createInstrumentedAccess({ bindings: [{ alias: 'sample', role: 'proof/snapshot',
            value: { amount }, shape: { type: 'record', fields: { amount: { type: 'scalar' } } } }], emit: event => events.push(event) });
        const scope = { node: alias => access.handle(alias) };
        const expected = evaluateObservedOperator(operator, operands, scope);
        events.length = 0;
        assert.equal(run(scope), expected);
        assert.equal(events.filter(event => event[1] === 'get').length, 1);
        access.revoke(); access.assertHealthy();
    }
});

function admitted(source, kind = 'proof', entry = 'bundle.js') {
    const bytes = Buffer.from(source);
    const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
    const manifestBytes = Buffer.from(canonicalValue({ format: 'financasbot.provenance.artifact', version: 1,
        kind, entry, files: [{ path: entry, media_type: 'text/javascript', sha256: sha(bytes) }] }));
    return admitArtifact({ manifestBytes, entries: [{ path: entry, bytes }], expectedRoot: sha(manifestBytes) });
}
const hostConfig = (artifactReceipt, childCapsuleReceipt, amount = 7) => ({
    artifactReceipt, childCapsuleReceipt, executionId: 'proof-execution', invocationId: 'proof-invocation', timeoutMs: 2000,
    bindings: [{ alias: 'sample', role: 'proof/snapshot', value: { amount },
        shape: { type: 'record', fields: { amount: { type: 'scalar' } } } }]
});

test('N02G:ISOLATED-PROOF-003 admitted scalar program runs in captured SES child with separate proof observation', async () => {
    const { buildScalarProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { buildMetricChildCapsule } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const capsule = buildMetricChildCapsule();
    const child = admitted(capsule.source, 'tcb', 'bootstrap.js');
    const program = buildScalarProofProgram({ predicates: [{ id: 'p1',
        operator: { id: 'eq', args: ['scalar:T', 'scalar:T'], semantics: 'typed_equal' },
        operands: [{ type: { form: 'scalar', type: 'integer' }, expression: { kind: 'field_ref', alias: 'sample', segments: ['amount'] } },
            { type: { form: 'scalar', type: 'integer' }, expression: { kind: 'literal', value_type: 'integer', value: 7 } }] }], windows: {} });
    const receipt = admitted(program.source);
    for (const amount of [7, 8]) {
        const result = await runAdmittedProof(hostConfig(receipt, child, amount));
        assert.equal(result.stage, 'isolated_proof_observation_only');
        assert.equal(result.graph_accepted, false);
        assert.equal(result.proof_satisfied, amount === 7);
        assert.equal(Object.hasOwn(result, 'functional_result'), false);
        assert.equal(result.trace.derivation_trace.length, 0);
        assert.equal(result.trace.proof_trace.filter(event => event.operation === 'get').length, 1);
        assert.equal(result.observed_artifact_root, receipt.observed_root);
    }
    await assert.rejects(runAdmittedProof(hostConfig({ ...receipt }, child)), /host_artifact_invalid/);
    await assert.rejects(runAdmittedProof(hostConfig(admitted(program.source, 'metric'), child)), /host_artifact_unsupported/);
});

test('N02G:ISOLATED-PROOF-004 proof cannot turn caught handle misuse or malformed outputs into success', async () => {
    const { buildMetricChildCapsule } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const child = admitted(buildMetricChildCapsule().source, 'tcb', 'bootstrap.js');
    for (const [source, reason] of [
        ['(function(operands) { try { operands.node("missing").get("amount"); } catch {} return true; })', /host_child_evaluation/],
        ['(function(operands) { try { operands.edge("missing"); } catch {} return true; })', /host_child_evaluation/],
        ['(function() { return { get value() { throw new Error("guest-error-not-transported"); } }; })', /host_child_result/],
        ['(function() { return 1; })', /host_child_result/]
    ]) await assert.rejects(runAdmittedProof(hostConfig(admitted(source), child)), reason);
});

test('N02G:ISOLATED-PROOF-005 collections and both window bounds are observed in the real child, without short circuit', async () => {
    const { buildScalarProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { buildMetricChildCapsule } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const child = admitted(buildMetricChildCapsule().source, 'tcb', 'bootstrap.js');
    const program = buildScalarProofProgram({ predicates: [
        { id: 'count', operator: { id: 'count_eq', args: ['sequence:T', 'nonnegative_integer'], semantics: 'sequence_length_equal' },
            operands: [{ type: { form: 'sequence', item: { form: 'scalar', type: 'integer' } },
                expression: { kind: 'field_ref', alias: 'sample', segments: ['items'] } },
            { type: { form: 'scalar', type: 'nonnegative_integer' }, expression: { kind: 'literal', value_type: 'integer', value: 2 } }] },
        { id: 'date', operator: { id: 'date_in_period', args: ['date', 'period'], semantics: 'contains_civil_date' },
            operands: [{ type: { form: 'scalar', type: 'date' }, expression: { kind: 'field_ref', alias: 'sample', segments: ['today'] } },
                { type: { form: 'period', periodKind: 'range' }, expression: { kind: 'window_ref', name: 'active' } }] }
    ], windows: { active: { kind: 'range',
        start: { kind: 'field_ref', alias: 'sample', segments: ['start'] },
        end: { kind: 'field_ref', alias: 'sample', segments: ['end'] }, start_inclusive: true, end_inclusive: true } } });
    const receipt = admitted(program.source);
    for (const items of [[4, 5], [4]]) {
        const input = hostConfig(receipt, child);
        input.bindings[0].value = { items, today: '2042-06-15', start: '2042-06-01', end: '2042-06-30' };
        input.bindings[0].shape = { type: 'record', fields: { items: { type: 'sequence', item: { type: 'scalar' } },
            today: { type: 'scalar' }, start: { type: 'scalar' }, end: { type: 'scalar' } } };
        const result = await runAdmittedProof(input);
        assert.equal(result.proof_satisfied, items.length === 2);
        const reads = result.trace.proof_trace.filter(event => event.operation === 'get').map(event => event.path.join('.'));
        assert.deepEqual(reads, ['items', 'today', 'start', 'end']);
        assert.equal(result.trace.proof_trace.filter(event => event.operation === 'iterate').length, 1);
        assert.equal(result.graph_accepted, false);
    }
});

test('N02G:ISOLATED-PROOF-002 lowering rejects unsupported/dynamic shapes and cannot embed extra evidence', async () => {
    const { buildScalarProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const input = { predicates: [{ id: 'p1', operator: { id: 'eq', args: ['scalar:T', 'scalar:T'], semantics: 'typed_equal' },
        operands: [1, 1].map(value => ({ type: { form: 'scalar', type: 'integer' },
            expression: { kind: 'literal', value_type: 'integer', value } })) }], windows: {} };
    for (const mutate of [
        value => { value.snapshot = { private: 'not-program-data' }; },
        value => { value.predicates[0].expected_trace = []; },
        value => { value.predicates[0].operands[0].expression.payload = { value: 1 }; },
        value => { value.predicates[0].operands[0].type.payload = { value: 1 }; },
        value => { value.predicates[0].operands[0].expression.kind = 'evaluate'; },
        value => { value.predicates[0].operator.id = 'fingerprint_is'; },
        value => { value.predicates.push(structuredClone(value.predicates[0])); },
        value => { value.windows.unused = { kind: 'range' }; }
    ]) {
        const candidate = structuredClone(input); mutate(candidate);
        assert.throws(() => buildScalarProofProgram(candidate), /proof_program_/);
    }
    assert.equal(vm.runInNewContext(buildScalarProofProgram(input).source)({}), true);
});

test('N02G:ISOLATED-PROOF-006 pure UTF-8 SHA-256 matches fixed and native vectors without native guest APIs', () => {
    const { sha256Utf8 } = require('../../../src/next/provenance/proofSha256');
    assert.equal(sha256Utf8(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    assert.equal(sha256Utf8('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const vectors = ['a'.repeat(1000000), 'ação 💰 漢字', '\ud800', '\udc00', '\ud800x\udc00', '\u0000'];
    for (let length = 0; length < 260; length++) {
        let value = '';
        for (let index = 0; index < length; index++) value += String.fromCharCode((index * 7919 + length * 3571) & 65535);
        vectors.push(value);
    }
    for (const value of vectors) assert.equal(sha256Utf8(value), createHash('sha256').update(value, 'utf8').digest('hex'));
    for (const value of [null, 1, {}, 'x'.repeat(1048577)]) assert.throws(() => sha256Utf8(value), /proof_sha256_input/);
});

test('N02G:ISOLATED-PROOF-007 isolated fingerprint measures all present material fields with the same native trace', async () => {
    const { buildScalarProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { buildMetricChildCapsule } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const { digest } = require('../../../src/next/kernel/canonicalValue');
    const child = admitted(buildMetricChildCapsule().source, 'tcb', 'bootstrap.js');
    const identity = { kind: 'event', ref_id: 'event-a', version: `sha256:${'a'.repeat(64)}` };
    const value = { id: 'event-a', amount: 0, active: false, refs: [], label: 'display-only' };
    const descriptor = { registry_version: 1, kind: 'event', fields: {
        id: { class: 'identity', type: 'id', required: true }, amount: { class: 'dimension', type: 'money_minor', required: true },
        active: { class: 'dimension', type: 'boolean', required: true },
        refs: { class: 'edge', type: 'ref_list', required: true, targets: ['event'] },
        optional: { class: 'dimension', type: 'text', required: false },
        label: { class: 'non_material', type: 'text', required: false, reason: 'display_only' }
    } };
    const shape = { type: 'record', fields: Object.fromEntries(Object.entries(descriptor.fields).map(([name, spec]) =>
        [name, spec.class === 'non_material' ? { type: 'non_material' } : spec.type === 'ref_list'
            ? { type: 'sequence', item: { type: 'scalar' } } : { type: 'scalar' }])) };
    const { label, ...payload } = value;
    const expected = 'sha256:' + digest({ registry_version: 1, ...identity, payload });
    const predicate = { id: 'fingerprint', operator: { id: 'fingerprint_is', args: ['node:K', 'digest_literal'], semantics: 'measured_material_fingerprint_equal' },
        operands: [{ type: { form: 'node', kind: 'event' }, expression: { kind: 'node_ref', alias: 'sample' } },
            { type: { form: 'digest_literal' }, expression: { kind: 'literal', value_type: 'digest', value: expected } }] };
    const input = { predicates: [predicate], windows: {}, materials: { sample: descriptor } };
    const program = buildScalarProofProgram(input);
    assert.equal(program.imports.every(row => !row.target.startsWith('node:')), true);
    const config = hostConfig(admitted(program.source), child);
    config.bindings[0] = { alias: 'sample', role: 'proof/snapshot', identity, value, shape };
    const result = await runAdmittedProof(config);
    assert.equal(result.proof_satisfied, true);
    const nativeEvents = [];
    const access = createInstrumentedAccess({ bindings: config.bindings, emit: event => nativeEvents.push(event) });
    assert.equal(evaluateObservedOperator(predicate.operator, predicate.operands,
        { node: alias => access.handle(alias), material: () => descriptor }), true);
    assert.deepEqual(result.trace.proof_trace.filter(event => event.operation).map(event => [event.operation, event.path]),
        nativeEvents.map(event => [event[1], event[4]]));
    access.revoke(); access.assertHealthy();
    const changed = hostConfig(admitted(program.source), child);
    changed.bindings[0] = { ...config.bindings[0], value: { ...value, amount: 1 } };
    assert.equal((await runAdmittedProof(changed)).proof_satisfied, false);
    const bad = structuredClone(input); bad.materials.sample.fields.amount.payload = { secret: 'not-a-descriptor' };
    assert.throws(() => buildScalarProofProgram(bad), /proof_program_material/);
});

test('N02G:ISOLATED-PROOF-008 proof sets resolve only the shared material bindings and observe their own roster', async () => {
    const { buildScalarProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { buildMetricChildCapsule } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const child = admitted(buildMetricChildCapsule().source, 'tcb', 'bootstrap.js');
    const program = buildScalarProofProgram({ predicates: [{ id: 'count',
        operator: { id: 'cardinality_eq', args: ['set:T', 'nonnegative_integer'], semantics: 'exact_set_cardinality' },
        operands: [{ type: { form: 'set', item: { form: 'node', kind: 'event' } }, expression: { kind: 'set_ref', name: 'events' } },
            { type: { form: 'scalar', type: 'nonnegative_integer' }, expression: { kind: 'literal', value_type: 'integer', value: 2 } }] }], windows: {} });
    const input = hostConfig(admitted(program.source), child);
    input.bindings = [0, 1].map(index => ({ alias: `event_${index}`, role: 'proof/snapshot',
        identity: { kind: 'event', ref_id: `event-${index}`, version: `sha256:${'a'.repeat(64)}` }, value: { id: `event-${index}` },
        shape: { type: 'record', fields: { id: { type: 'scalar' } } } }));
    input.proofSets = [{ name: 'events', roster: ['event_0', 'event_1'] }];
    const result = await runAdmittedProof(input);
    assert.equal(result.proof_satisfied, true);
    assert.ok(result.trace.proof_trace.some(event => event.role === 'proof/set/events' && event.operation === 'iterate'));
    assert.equal(result.trace.proof_trace.filter(event => event.role === 'proof/set/events' && event.operation === 'identity').length, 6);
    for (const roster of [['missing'], ['event_0', 'event_0'], ['claim/context']]) {
        await assert.rejects(runAdmittedProof({ ...input, proofSets: [{ name: 'events', roster }] }), /host_proof_set/);
    }
    await assert.rejects(runAdmittedProof({ ...input, proofSets: [{ ...input.proofSets[0], bindings: input.bindings }] }), /host_proof_set/);
    const unknown = { ...input, artifactReceipt: admitted('(function(operands) { try { operands.set("missing"); } catch {} return true; })') };
    await assert.rejects(runAdmittedProof(unknown), /host_child_evaluation/);
});

test('N02G:ISOLATED-PROOF-009 quantified proof lowers every guard and observes later members after a false result', async () => {
    const { buildScalarProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { buildMetricChildCapsule } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const child = admitted(buildMetricChildCapsule().source, 'tcb', 'bootstrap.js');
    const operator = { id: 'eq', args: ['scalar:T', 'scalar:T'], semantics: 'typed_equal' };
    const descriptor = { registry_version: 1, kind: 'event', fields: { id: { class: 'identity', type: 'id', required: true },
        amount: { class: 'dimension', type: 'money_minor', required: true } } };
    const input = { predicates: [{ id: 'all',
        operator: { id: 'all_match', args: ['set:node:K', 'predicate_template_ref'], semantics: 'all_members_satisfy_expanded_conjunction' },
        operands: [{ type: { form: 'set', item: { form: 'node', kind: 'event' } }, expression: { kind: 'set_ref', name: 'events' } },
            { type: { form: 'predicate_template_ref', kind: 'event' }, expression: { kind: 'predicate_template',
                template_ref: { id: 'field_equals_scalar', version: 1, hash: `sha256:${'a'.repeat(64)}` }, combinator: 'all', member_slot: 'current_member', bindings: {},
                body: [{ op: 'eq', operands: [{ kind: 'member_field', slot: 'current_member', node_kind: 'event', segments: ['amount'] },
                    { kind: 'literal', value_type: 'money_minor', value: 10 }] }] } }] }],
        windows: {}, materials: { event_0: descriptor }, operators: [operator] };
    const program = buildScalarProofProgram(input);
    for (const amounts of [[0, 10, 10], [10, 10], []]) {
        const config = hostConfig(admitted(program.source), child);
        config.bindings = amounts.map((amount, index) => ({ alias: `event_${index}`, role: 'proof/snapshot',
            identity: { kind: 'event', ref_id: `event-${index}`, version: `sha256:${'a'.repeat(64)}` },
            value: { id: `event-${index}`, amount }, shape: { type: 'record', fields: { id: { type: 'scalar' }, amount: { type: 'scalar' } } } }));
        if (!config.bindings.length) config.bindings = [{ alias: 'claim/context', role: 'proof/context', value: {}, shape: { type: 'record', fields: {} } }];
        config.proofSets = [{ name: 'events', roster: amounts.map((_, index) => `event_${index}`) }];
        const result = await runAdmittedProof(config);
        assert.equal(result.proof_satisfied, amounts.every(amount => amount === 10));
        assert.equal(result.trace.proof_trace.filter(event => event.operation === 'get' && event.path[0] === 'amount').length, amounts.length);
        assert.ok(result.trace.proof_trace.some(event => event.operation === 'next' && event.outcome[0] === 'done'));
    }
    const bad = structuredClone(input); bad.predicates[0].operands[1].expression.body[0].op = 'fingerprint_is';
    assert.throws(() => buildScalarProofProgram(bad), /proof_program_template/);
});

test('N02G:ISOLATED-PROOF-010 lowered collection relations preserve native results and actual reads', async () => {
    const { buildScalarProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { buildMetricChildCapsule } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const child = admitted(buildMetricChildCapsule().source, 'tcb', 'bootstrap.js');
    const operators = require('../../../docs/contracts/next/provenance-v2/operator-registry-v2.json').operators;
    const money = { form: 'scalar', type: 'money_minor', unit: 'BRL_minor' };
    const set = (name, form = 'set') => ({ type: { form, item: { form: 'node', kind: 'event' } }, expression: { kind: 'set_ref', name } });
    const selector = { type: { form: 'field_selector', kind: 'event', value: money },
        expression: { kind: 'field_selector', node_kind: 'event', segments: ['amount'] } };
    const descriptor = { registry_version: 1, kind: 'event', fields: { id: { class: 'identity', type: 'id', required: true },
        amount: { class: 'dimension', type: 'money_minor', required: true } } };
    const cases = [
        ['same_field', [1, 1], [], [set('left'), selector]],
        ['same_field', [1, 2], [], [set('left'), selector]],
        ['same_field', [], [], [set('left'), selector]],
        ['join_eq', [1, 2], [2, 1], [set('left'), set('right'), selector, selector]],
        ['join_eq', [1, 2], [1, 3], [set('left'), set('right'), selector, selector]],
        ['join_eq', [1, 1], [1, 2], [set('left'), set('right'), selector, selector]],
        ...[[3, 2, 1], [3, 1, 2], []].map(values => ['ordered_by', values, [], [set('left', 'sequence'),
            { type: { form: 'sort', kind: 'event' }, expression: { kind: 'sort', tie_break: 'kind_ref_version',
                keys: [{ selector: selector.expression, direction: 'desc' }] } }]]),
        ['sum_eq', [1, 2], [], [{ type: { form: 'sequence', item: money }, expression: { kind: 'projection',
            set: { kind: 'set_ref', name: 'left' }, selector: selector.expression, as: 'sequence' } },
            { type: money, expression: { kind: 'literal', value_type: 'money_minor', value: 3 } }]]
    ];
    for (const [id, left, right, operands] of cases) {
        const operator = operators.find(value => value.id === id);
        const program = buildScalarProofProgram({ predicates: [{ id: 'relation', operator, operands }], windows: {}, materials: { sample: descriptor } });
        const config = hostConfig(admitted(program.source), child);
        config.bindings = [['left', left], ['right', right]].flatMap(([side, values]) => values.map((amount, index) => ({
            alias: `${side}_${index}`, role: 'proof/snapshot', identity: { kind: 'event', ref_id: `${side}-${index}`, version: `sha256:${'a'.repeat(64)}` },
            value: { id: `${side}-${index}`, amount }, shape: { type: 'record', fields: { id: { type: 'scalar' }, amount: { type: 'scalar' } } } })));
        if (!config.bindings.length) config.bindings = [{ alias: 'claim/context', role: 'proof/context', value: {}, shape: { type: 'record', fields: {} } }];
        config.proofSets = [['left', left], ['right', right]].map(([name, values]) => ({ name, roster: values.map((_, index) => `${name}_${index}`) }));
        const nativeEvents = []; const controls = new Map(config.proofSets.map(({ name, roster }) => {
            const role = `proof/set/${name}`;
            return [name, createNodeSetAccess({ role, roster, links: [], emit: event => nativeEvents.push(event),
                bindings: config.bindings.filter(binding => binding.identity).map(binding => ({ ...binding, role })) })];
        }));
        const scope = { set: name => controls.get(name).handle, fieldDescriptor: (_, segments) => descriptor.fields[segments[0]] };
        if (id === 'join_eq' && new Set(left).size !== left.length) {
            assert.throws(() => evaluateObservedOperator(operator, operands, scope), /proof_expression_join_duplicate/);
            await assert.rejects(runAdmittedProof(config), /host_child_evaluation/);
        } else {
            const expected = evaluateObservedOperator(operator, operands, scope);
            const result = await runAdmittedProof(config);
            assert.equal(result.proof_satisfied, expected, id);
            assert.deepEqual(result.trace.proof_trace.filter(event => event.operation).map(event => [event.operation, event.alias, event.role, event.path]),
                nativeEvents.map(event => [event[1], event[2], event[3], event[4]]), id);
        }
        for (const control of controls.values()) { control.revoke(); control.assertHealthy(); }
    }
});

test('N02G:ISOLATED-PROOF-011 paired edges and reference sets require real current-invocation member handles', async () => {
    const { buildScalarProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { buildMetricChildCapsule } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const child = admitted(buildMetricChildCapsule().source, 'tcb', 'bootstrap.js');
    const binding = (alias, kind, id, fields, value) => ({ alias, role: 'proof/snapshot',
        identity: { kind, ref_id: id, version: `sha256:${'a'.repeat(64)}` }, value: { id, ...value },
        shape: { type: 'record', fields: { id: { type: 'scalar' }, ...fields } } });
    const config = hostConfig(admitted('(function(operands) { try { operands.memberEdge({ identity(){return "event";},get(){return "family";} },"family_id"); } catch {} return true; })'), child);
    config.bindings = [binding('event_a', 'event', 'event-a', { family_id: { type: 'scalar' } }, { family_id: 'family' }),
        binding('event_b', 'event', 'event-b', { family_id: { type: 'scalar' } }, { family_id: 'family' }),
        binding('family', 'family', 'family', {}, {}),
        binding('collection', 'collection', 'collection', { members: { type: 'sequence', item: { type: 'scalar' } } }, { members: ['event-a', 'event-b'] })];
    config.directLinks = [{ id: 'edge_a', source: 'event_a', target: 'family', field: 'family_id', type: 'ref' },
        { id: 'edge_b', source: 'event_b', target: 'family', field: 'family_id', type: 'ref' },
        { id: 'member_a', source: 'collection', target: 'event_a', field: 'members', type: 'ref_list' },
        { id: 'member_b', source: 'collection', target: 'event_b', field: 'members', type: 'ref_list' }];
    config.proofSets = [{ name: 'events', roster: ['event_a', 'event_b'] }];
    await assert.rejects(runAdmittedProof(config), /host_child_evaluation/);
    const predicate = { id: 'pair', operator: { id: 'edge_pair_complete',
        args: ['set:node:K', 'edge_selector:K:J', 'node:J'], semantics: 'two_distinct_nodes_share_exact_identity' },
        operands: [{ type: { form: 'set', item: { form: 'node', kind: 'event' } }, expression: { kind: 'set_ref', name: 'events' } },
            { type: { form: 'edge_selector', kind: 'event', target: 'family' }, expression: { kind: 'field_selector', node_kind: 'event', segments: ['family_id'] } },
            { type: { form: 'node', kind: 'family' }, expression: { kind: 'node_ref', alias: 'family' } }] };
    const reference = { id: 'references', operator: { id: 'set_eq', args: ['set:T', 'set:T'], semantics: 'exact_typed_members' },
        operands: [{ type: { form: 'set', item: { form: 'node', kind: 'event' } }, expression: { kind: 'reference_set',
            field: { kind: 'field_ref', alias: 'collection', segments: ['members'] } } },
            { type: { form: 'set', item: { form: 'node', kind: 'event' } }, expression: { kind: 'set_ref', name: 'events' } }] };
    const program = buildScalarProofProgram({ predicates: [predicate, reference], windows: {} });
    config.artifactReceipt = admitted(program.source);
    assert.equal((await runAdmittedProof(config)).proof_satisfied, true);
    for (const source of [
        '(function(operands){ try{operands.memberEdge(new Proxy(operands.node("event_a"),{}),"family_id");}catch{}return true;})',
        '(function(operands){ try{operands.resolveReference("collection","members","missing");}catch{}return true;})'
    ]) await assert.rejects(runAdmittedProof({ ...config, artifactReceipt: admitted(source) }), /host_child_evaluation/);
});

test('N02G:ISOLATED-PROOF-012 civil proof uses the existing observed handle conversion, never guest Date/Intl', async () => {
    const { buildScalarProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { buildMetricChildCapsule } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const child = admitted(buildMetricChildCapsule().source, 'tcb', 'bootstrap.js');
    const predicate = { id: 'civil', operator: { id: 'civil_date_matches', args: ['datetime', 'date', 'timezone', 'calendar'], semantics: 'instant_local_civil_date_equal' },
        operands: [['clock', 'instant', 'datetime'], ['policy', 'date', 'date'], ['policy', 'timezone', 'timezone'], ['policy', 'calendar', 'calendar']]
            .map(([alias, name, type]) => ({ type: { form: 'scalar', type }, expression: { kind: 'field_ref', alias, segments: [name] } })) };
    const program = buildScalarProofProgram({ predicates: [predicate], windows: {} });
    for (const date of ['2042-06-15', '2042-06-16']) {
        const config = hostConfig(admitted(program.source), child);
        config.bindings = [{ alias: 'clock', role: 'proof/snapshot', value: { instant: '2042-06-16T01:30:00Z' },
            shape: { type: 'record', fields: { instant: { type: 'scalar' } } } },
        { alias: 'policy', role: 'proof/snapshot', value: { date, timezone: 'America/Sao_Paulo', calendar: 'proleptic_gregorian' },
            shape: { type: 'record', fields: { date: { type: 'scalar' }, timezone: { type: 'scalar' }, calendar: { type: 'scalar' } } } }];
        const result = await runAdmittedProof(config);
        assert.equal(result.proof_satisfied, date === '2042-06-15');
        const civil = result.trace.proof_trace.find(event => event.operation === 'civil_date');
        assert.ok(civil);
        const source = result.trace.proof_trace.find(event => event.sequence === civil.sequence - 1);
        assert.equal(source.operation, 'get'); assert.equal(source.alias, 'clock');
        assert.deepEqual(source.path, ['instant']);
        const nativeEvents = []; const access = createInstrumentedAccess({ bindings: config.bindings, emit: event => nativeEvents.push(event) });
        assert.equal(evaluateObservedOperator(predicate.operator, predicate.operands, { node: alias => access.handle(alias) }), result.proof_satisfied);
        assert.deepEqual(result.trace.proof_trace.filter(event => event.operation).map(event => [event.operation, event.alias, event.path]),
            nativeEvents.map(event => [event[1], event[2], event[4]]));
        access.revoke(); access.assertHealthy();
        config.bindings[1].value.timezone = 'UTC';
        await assert.rejects(runAdmittedProof(config), /host_child_evaluation/);
    }
});

test('N02G:ISOLATED-PROOF-013 lowered selection computes its roster from live guards and refuses premature or repeated targets', async () => {
    const { buildScalarProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { buildMetricChildCapsule } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const child = admitted(buildMetricChildCapsule().source, 'tcb', 'bootstrap.js');
    const identity = alias => ({ kind: 'event', ref_id: `event-${alias}`, version: `sha256:${'a'.repeat(64)}` });
    const integer = { form: 'scalar', type: 'integer' };
    const eq = { id: 'eq', args: ['scalar:T', 'scalar:T'], semantics: 'typed_equal' };
    const predicates = ['a', 'b'].map((alias, index) => ({ id: alias, operator: eq, operands: [
        { type: integer, expression: { kind: 'field_ref', alias, segments: ['amount'] } },
        { type: integer, expression: { kind: 'literal', value_type: 'integer', value: 7 + index } }] }));
    predicates.push({ id: 'selected-count', operator: { id: 'cardinality_eq', args: ['set:T', 'nonnegative_integer'], semantics: 'exact_set_cardinality' }, operands: [
        { type: { form: 'set', item: { form: 'node', kind: 'event' } }, expression: { kind: 'set_ref', name: 'selected' } },
        { type: { form: 'scalar', type: 'nonnegative_integer' }, expression: { kind: 'literal', value_type: 'integer', value: 1 } }] });
    const selections = [{ candidate_set: 'candidates', selected_set: 'selected', cases: ['a', 'b'].map((node, index) => ({
        node, identity: identity(node), mode: index ? 'exclude_if_all' : 'include_if_all', predicates: [node] })) }];
    const built = buildScalarProofProgram({ predicates, windows: {}, selections });
    const config = hostConfig(admitted(built.source), child);
    config.bindings = ['a', 'b'].map((alias, index) => ({ alias, role: 'proof/snapshot', identity: identity(alias), value: { id: `event-${alias}`, amount: 7 + index },
        shape: { type: 'record', fields: { id: { type: 'scalar' }, amount: { type: 'scalar' } } } }));
    config.proofSets = [{ name: 'candidates', roster: ['a', 'b'] }];
    config.proofSelections = [{ candidate_set: 'candidates', selected_set: 'selected' }];
    const positive = await runAdmittedProof(config);
    assert.equal(positive.proof_satisfied, true);
    assert.deepEqual(positive.trace.proof_trace.filter(event => event.operation === 'select_member').map(event => event.outcome),
        [['decision', 'a', true], ['decision', 'b', false]]);
    config.bindings[0].value.amount = 9;
    assert.equal((await runAdmittedProof(config)).proof_satisfied, false);
    config.bindings[0].value.amount = 7;
    config.bindings[0].identity.version = `sha256:${'b'.repeat(64)}`;
    await assert.rejects(runAdmittedProof(config), /host_child_evaluation/);
    config.bindings[0].identity.version = identity('a').version;
    await assert.rejects(runAdmittedProof({ ...config, proofSets: [{ name: 'candidates', roster: ['a'] }] }), /host_child_evaluation/);
    for (const source of [
        '(function(operands){try{operands.set("selected");}catch{}return true;})',
        '(function(operands){operands.select("candidates","selected",()=>true);try{operands.select("candidates","selected",()=>true);}catch{}return true;})',
        '(function(operands){try{operands.select("candidates","forged",()=>true);}catch{}return true;})',
        '(function(operands){try{operands.select("candidates","selected",()=>1);}catch{}return true;})',
        '(function(operands){try{operands.select("candidates","selected",()=>{try{operands.select("candidates","selected",()=>true);}catch{}return true;});}catch{}return true;})'
    ]) await assert.rejects(runAdmittedProof({ ...config, artifactReceipt: admitted(source) }), /host_child_evaluation/);
    await assert.rejects(runAdmittedProof({ ...config, proofSets: [...config.proofSets, { name: 'selected', roster: ['a'] }] }), /host_proof_selection_invalid/);
    assert.throws(() => buildScalarProofProgram({ predicates, windows: {}, selections: [{ ...selections[0], cases: [{ ...selections[0].cases[0], predicates: ['missing'] }] }] }), /proof_program_selection/);
});
