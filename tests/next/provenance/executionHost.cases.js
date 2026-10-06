'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const { admitArtifact } = require('../../../src/next/provenance/artifactLoader');
const { runAdmittedMetric, runRegisteredMetric } = require('../../../src/next/provenance/executionHost');
const { admitExecutionRegistry, admitExecutionContract } = require('../../../src/next/provenance/executionRegistry');

const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
function artifact(source, kind = 'metric', profileInput) {
    const bytes = Buffer.from(source);
    const entries = [{ path: 'bundle.js', bytes }];
    if (profileInput) entries.push({ path: profileInput.path, bytes: Buffer.from(profileInput.source) });
    const manifestBytes = Buffer.from(canonicalValue({ format: 'financasbot.provenance.artifact',
        version: 1, kind, entry: 'bundle.js',
        files: entries.map(row => ({ path: row.path, media_type: row.path.endsWith('.json') ? 'application/json' : 'text/javascript',
            sha256: digest(row.bytes) })) }));
    return { sourceBytes: bytes, receipt: admitArtifact({ manifestBytes,
        entries, expectedRoot: digest(manifestBytes) }) };
}
const binding = () => [{ alias: 'input', role: 'source',
    value: { count: 7 }, shape: { type: 'record', fields: { count: { type: 'scalar' } } } }];
const config = (receipt, overrides = {}) => ({
    artifactReceipt: receipt, executionId: 'execution-host-test',
    invocationId: 'invocation-host-test', bindings: binding(), timeoutMs: 2000, ...overrides
});

test('N02G:HOST-CAPSULE-001 captured child closure runs without reopening project or SES files', async () => {
    const { buildMetricChildCapsule } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const built = buildMetricChildCapsule();
    assert.equal(built.stage, 'child_capsule_candidate_only');
    assert.equal(built.validation_tcb_complete, false);
    // Independent expected child closure. The pure proof codec is captured
    // by the proof artifact, not an unused module in the child host.
    const expectedPaths = [
        'kernel/canonicalValue.js',
        'provenance/artifactLoader.js', 'provenance/civilCalendar.js',
        'provenance/claimBinding.js', 'provenance/claimMonthIsolatedProfile.js',
        'provenance/executionHostChild.js', 'provenance/executionProfile.js',
        'provenance/executionRegistry.js', 'provenance/instrumentedAccess.js',
        'provenance/literalTypes.js', 'provenance/materialFingerprintCore.js',
        'provenance/observationContract.js', 'provenance/observationScalars.js',
        'provenance/phaseCompositionProfile.js', 'provenance/pinnedCivilTimezone.js',
        'provenance/proofContextBinding.js', 'provenance/proofObservedValues.js',
        'provenance/proofParentBinding.js', 'vendor/ses.js'
    ];
    assert.deepEqual(built.sourceHashes.map(row => row.path).sort(), expectedPaths);
    assert.equal(new Set(built.sourceHashes.map(row => row.path)).size, expectedPaths.length);
    assert.deepEqual(built.nativeExternals, ['node:crypto', 'node:process', 'node:util']);
    const bytes = Buffer.from(built.source);
    const childCapsuleReceipt = admitArtifact({ manifestBytes: Buffer.from(built.manifest),
        expectedRoot: built.artifact_root, entries: [{ path: 'bootstrap.js', bytes }] });
    bytes.fill(0);
    const { receipt } = artifact('(function(operands) { return { unit: "count", kind: "nonnegative_integer", value: operands.source.get("count") }; })');
    const result = await runAdmittedMetric(config(receipt, { childCapsuleReceipt }));
    assert.equal(result.graph_accepted, false);
    assert.equal(result.observed_child_capsule_root, built.artifact_root);
    assert.deepEqual(result.functional_result, { unit: 'count', kind: 'nonnegative_integer', value: 7 });
    assert.equal(result.trace.derivation_trace.filter(row => row.operation === 'get').length, 1);
    await assert.rejects(runAdmittedMetric(config(receipt, { childCapsuleReceipt: { ...childCapsuleReceipt } })), /host_child_capsule_invalid/);
    await assert.rejects(runAdmittedMetric(config(receipt, { childCapsuleReceipt: receipt })), /host_child_capsule_invalid/);
});

test('N02G:HOST-CAPSULE-002 captured bootstrap preserves confinement, output admission and external timeout', async () => {
    const { buildMetricChildCapsule } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const built = buildMetricChildCapsule();
    const childCapsuleReceipt = admitArtifact({ manifestBytes: Buffer.from(built.manifest),
        expectedRoot: built.artifact_root,
        entries: [{ path: 'bootstrap.js', bytes: Buffer.from(built.source) }] });
    for (const source of [
        '(function(operands) { return Function("return process")(); })',
        '(function(operands) { return { unit: "count", kind: "nonnegative_integer", get value() { return 7; } }; })',
        '(function(operands) { try { operands.source.get("missing"); } catch {} return { unit: "count", kind: "nonnegative_integer", value: 7 }; })'
    ]) {
        const { receipt } = artifact(source);
        await assert.rejects(runAdmittedMetric(config(receipt, { childCapsuleReceipt })), /host_/);
    }
    const endless = artifact('(function(operands) { for (;;) {} })');
    await assert.rejects(runAdmittedMetric(config(endless.receipt,
        { childCapsuleReceipt, timeoutMs: 500 })), /host_timeout/);
});

test('N02G:GRAPH-PROCESS-001 one captured child executes ordered phases with separate handles and provisional R', async () => {
    const { runAdmittedGraph } = require('../../../src/next/provenance/executionHost');
    const { buildMetricChildCapsule } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const built = buildMetricChildCapsule();
    const childCapsuleReceipt = admitArtifact({ manifestBytes: Buffer.from(built.manifest), expectedRoot: built.artifact_root,
        entries: [{ path: 'bootstrap.js', bytes: Buffer.from(built.source) }] });
    const metric = artifact('(function(operands){return {unit:"count",kind:"nonnegative_integer",value:operands.source.get("count")};})');
    const proof = artifact('(function(operands){return operands.node("input").get("count")===7;})', 'proof');
    const input = { executionId: 'graph-process-execution', invocationId: 'graph-process-invocation', timeoutMs: 2000, childCapsuleReceipt,
        derivation: { artifactReceipt: metric.receipt, bindings: binding() },
        proof: { artifactReceipt: proof.receipt, bindings: binding().map(row => ({ ...row, role: 'proof/snapshot' })) } };
    const result = await runAdmittedGraph(input);
    assert.equal(result.stage, 'isolated_graph_observations_only'); assert.equal(result.graph_accepted, false);
    assert.deepEqual(result.functional_result, { unit: 'count', kind: 'nonnegative_integer', value: 7 });
    assert.equal(result.proof_satisfied, true);
    assert.deepEqual(result.trace.derivation_trace.map(event => event.sequence), [0, 1]);
    assert.deepEqual(result.trace.proof_trace.map(event => event.sequence), [2, 3]);
    assert.equal(result.observed_child_capsule_root, built.artifact_root);
    assert.ok([...result.trace.derivation_trace, ...result.trace.proof_trace].every(event => !Object.hasOwn(event, 'functional_result')));
    const caught = artifact('(function(operands){try{operands.node("input").get("missing");}catch{}return true;})', 'proof');
    await assert.rejects(runAdmittedGraph({ ...input, proof: { ...input.proof, artifactReceipt: caught.receipt } }), /host_child_evaluation/);
    const loop = artifact('(function(operands){for(;;){} })', 'proof');
    await assert.rejects(runAdmittedGraph({ ...input, timeoutMs: 300, proof: { ...input.proof, artifactReceipt: loop.receipt } }), /host_timeout/);
    await assert.rejects(runAdmittedGraph({ ...input, proof: { ...input.proof, expected_trace: [] } }), /host_graph_config_invalid/);
    await assert.rejects(runAdmittedGraph({ ...input, childCapsuleReceipt: { ...childCapsuleReceipt } }), /host_child_capsule_invalid/);
    await assert.rejects(runAdmittedGraph({ ...input, childCapsuleReceipt: undefined }), /host_child_capsule_invalid/);
    let getters = 0;
    const hostilePhase = { artifactReceipt: metric.receipt, get bindings() { getters++; return binding(); } };
    await assert.rejects(runAdmittedGraph({ ...input, derivation: hostilePhase }), /host_graph_config_invalid/);
    assert.equal(getters, 0);
    const falseProof = artifact('(function(){return false;})', 'proof');
    const unsatisfied = await runAdmittedGraph({ ...input, proof: { ...input.proof, artifactReceipt: falseProof.receipt } });
    assert.equal(unsatisfied.proof_satisfied, false); assert.equal(unsatisfied.graph_accepted, false);
});

test('N02G:GRAPH-PROCESS-002 phase protocol and clean exit cannot be replaced by provisional results', async () => {
    const { runAdmittedGraph } = require('../../../src/next/provenance/executionHost');
    const metric = artifact('(function(){return {unit:"count",kind:"nonnegative_integer",value:7};})');
    const proof = artifact('(function(){return true;})', 'proof');
    const base = { executionId: 'graph-protocol', invocationId: 'graph-protocol', timeoutMs: 400,
        derivation: { artifactReceipt: metric.receipt, bindings: binding() },
        proof: { artifactReceipt: proof.receipt, bindings: binding().map(row => ({ ...row, role: 'proof/snapshot' })) } };
    // Deliberately malformed TCB fixtures test the parent's independent state
    // machine. A captured capsule root alone never certifies this code trusted.
    const sequence = [
        { kind: 'phase_start', phase: 'derivation' },
        { kind: 'measurement', event: ['M', 'evaluator_artifact_root', metric.receipt.observed_root] },
        { kind: 'phase_result', phase: 'derivation', value: { unit: 'count', kind: 'nonnegative_integer', value: 7 } },
        { kind: 'phase_start', phase: 'proof' },
        { kind: 'measurement', event: ['M', 'proof_engine_artifact_root', proof.receipt.observed_root] },
        { kind: 'phase_result', phase: 'proof', value: true },
        { kind: 'graph_done' }
    ];
    const run = (messages, tail = 'process.disconnect();') => {
        const source = 'process.once("message",()=>{' + messages.map(message => 'process.send(' + JSON.stringify(message) + ');').join('')
            + tail + '});process.send({kind:"ready"});';
        const bytes = Buffer.from(source); const manifestBytes = Buffer.from(canonicalValue({ format: 'financasbot.provenance.artifact',
            version: 1, kind: 'tcb', entry: 'bootstrap.js', files: [{ path: 'bootstrap.js', media_type: 'text/javascript', sha256: digest(bytes) }] }));
        const childCapsuleReceipt = admitArtifact({ manifestBytes, expectedRoot: digest(manifestBytes), entries: [{ path: 'bootstrap.js', bytes }] });
        return runAdmittedGraph({ ...base, childCapsuleReceipt });
    };
    const mutations = [
        sequence.slice(0, 3), // R without proof/done.
        sequence.slice(0, 6), // Both results without done.
        [{ kind: 'phase_start', phase: 'proof' }, ...sequence.slice(1)],
        [sequence[0], sequence[0], ...sequence.slice(1)],
        [sequence[0], sequence[2], ...sequence.slice(1)], // Result before M.
        [sequence[0], { kind: 'measurement', event: ['M', 'evaluator_artifact_root', proof.receipt.observed_root] }, ...sequence.slice(2)],
        [...sequence.slice(0, 5), { ...sequence[5], phase: 'derivation' }, sequence[6]],
        [...sequence.slice(0, 5), { ...sequence[5], value: 'true' }, sequence[6]],
        [...sequence.slice(0, 2), { ...sequence[2], value: { unit: 'count', kind: 'nonnegative_integer', value: 7, reads: [] } }, ...sequence.slice(3)],
        [...sequence, sequence[6]],
        [...sequence, { kind: 'observation', event: ['I', 'get', 'input', 'source', ['count'], 'number', 7] }]
    ];
    // Missing suffixes must still test a real clean exit. For an explicitly
    // invalid message, let the parent own termination: a concurrent voluntary
    // exit can be killed mid native coverage flush and produce an empty JSON.
    // Exact errors ensure an alive fixture cannot pass merely by timing out.
    const expectedErrors = [
        'incomplete_exit', 'incomplete_exit', 'protocol', 'protocol', 'protocol',
        'measurement_invalid', 'protocol', 'functional_result_invalid',
        'functional_result_invalid', 'protocol', 'protocol'
    ];
    for (const [index, messages] of mutations.entries()) {
        const tail = index < 2 ? 'process.disconnect();' : 'process.on("message",()=>{});';
        await assert.rejects(run(messages, tail), error => error.message === 'host_' + expectedErrors[index], `protocol mutation ${index}`);
    }
    await assert.rejects(run(sequence, 'process.exitCode=1;process.disconnect();'), /host_incomplete_exit/);
    await assert.rejects(run(sequence, 'for(;;){}'), /host_timeout/);
    await assert.rejects(run(sequence, 'process.stdout.write("fake evidence");process.on("message",()=>{});'), /host_output_forbidden/);
});

test('N02G:GRAPH-PROCESS-003 derivation guards read live handles under the same measured phase program', async () => {
    const { runAdmittedGraph } = require('../../../src/next/provenance/executionHost');
    const { buildMetricChildCapsule } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const { buildPhaseProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { admitPhaseCompositionProfile, PROFILE_PATH } = require('../../../src/next/provenance/phaseCompositionProfile');
    const root = path.resolve(__dirname, '../../..');
    const phaseProfile = admitPhaseCompositionProfile({ source: fs.readFileSync(path.join(root, PROFILE_PATH), 'utf8'),
        registry: JSON.parse(fs.readFileSync(path.join(root, 'docs/contracts/next/provenance-v2/metric-evaluator-registry-v1.json'), 'utf8')) });
    const built = buildMetricChildCapsule(); const bytes = Buffer.from(built.source);
    const childCapsuleReceipt = admitArtifact({ manifestBytes: Buffer.from(built.manifest), expectedRoot: built.artifact_root,
        entries: [{ path: 'bootstrap.js', bytes }] });
    const input = { predicates: [{ id: 'count-seven', operator: { id: 'eq', args: ['scalar:T', 'scalar:T'], semantics: 'typed_equal' },
        operands: [{ type: { form: 'scalar', type: 'integer' }, expression: { kind: 'field_ref', alias: 'input', segments: ['count'] } },
            { type: { form: 'scalar', type: 'integer' }, expression: { kind: 'literal', value_type: 'integer', value: 7 } }] }], windows: {} };
    const program = buildPhaseProofProgram({ derivation: input, proof: input }, phaseProfile);
    const proof = artifact(program.source, 'proof', program.profileInput);
    const metric = artifact('(function(operands){return {unit:"count",kind:"nonnegative_integer",value:operands.source.get("count")};})');
    const config = { executionId: 'guard-execution', invocationId: 'guard-invocation', timeoutMs: 2000, childCapsuleReceipt,
        derivation: { artifactReceipt: metric.receipt, bindings: binding(), derivationBindings: { sets: [], selections: [] } },
        proof: { artifactReceipt: proof.receipt, bindings: binding().map(row => ({ ...row, role: 'proof/snapshot' })) } };
    const result = await runAdmittedGraph(config);
    assert.equal(result.proof_satisfied, true); assert.equal(result.graph_accepted, false);
    assert.deepEqual(result.trace.derivation_trace.filter(row => row.measurement).map(row => [row.measurement, row.observed]),
        [['evaluator_artifact_root', metric.receipt.observed_root], ['proof_engine_artifact_root', proof.receipt.observed_root]]);
    assert.equal(result.trace.derivation_trace.filter(row => row.operation === 'get').length, 2);
    assert.ok(result.trace.derivation_trace.slice(0, 2).every(row => row.measurement));
    const changed = binding(); changed[0].value.count = 8;
    await assert.rejects(runAdmittedGraph({ ...config, derivation: { ...config.derivation, bindings: changed } }), /host_child_evaluation/);
    const replay = artifact('(function(operands){operands.events.select(()=>true);try{operands.events.select(()=>true);}catch{}return {unit:"count",kind:"nonnegative_integer",value:7};})');
    const pending = artifact('(function(){return {unit:"count",kind:"nonnegative_integer",value:7};})');
    const selected = { ...config.derivation,
        nodeSets: [{ role: 'events', bindings: binding().map(row => ({ ...row, role: 'events' })), links: [], roster: ['input'] }],
        derivationBindings: { sets: [{ name: 'candidates', aliases: ['input'] }],
            selections: [{ role: 'events', candidate_set: 'candidates', selected_set: 'selected' }] } };
    for (const candidate of [replay, pending]) await assert.rejects(runAdmittedGraph({ ...config,
        derivation: { ...selected, artifactReceipt: candidate.receipt } }), /host_child_evaluation/);
    const empty = { ...config.derivation, nodeSets: [{ role: 'entries', bindings: [], links: [], roster: [] }],
        derivationBindings: { sets: [{ name: 'candidates', aliases: [] }],
            selections: [{ role: 'entries', candidate_set: 'candidates', selected_set: 'selected' }] } };
    const emptyMetric = artifact('(function(operands){return {unit:"count",kind:"nonnegative_integer",value:operands.source.get("count")+operands.entries.select(()=>false).length()};})');
    const emptyResult = await runAdmittedGraph({ ...config, derivation: { ...empty, artifactReceipt: emptyMetric.receipt } });
    assert.equal(emptyResult.functional_result.value, 7);
    assert.equal(emptyResult.trace.derivation_trace.filter(row => row.operation === 'select_member').length, 0);
    assert.equal(emptyResult.trace.derivation_trace.filter(row => row.operation === 'select_start').length, 1);
    await assert.rejects(runAdmittedGraph({ ...config, derivation: { ...empty, artifactReceipt: pending.receipt } }), /host_child_evaluation/);
    const badProfile = artifact(program.source, 'proof', { ...program.profileInput, source: program.profileInput.source + ' ' });
    await assert.rejects(runAdmittedGraph({ ...config, proof: { ...config.proof, artifactReceipt: badProfile.receipt } }), /host_artifact_unsupported/);
    await assert.rejects(runAdmittedMetric({ ...config.derivation, executionId: config.executionId,
        invocationId: config.invocationId, timeoutMs: config.timeoutMs, childCapsuleReceipt }), /host_derivation_requires_graph/);
    assert.throws(() => buildPhaseProofProgram({ derivation: input, proof: input, expected_trace: [] }), /proof_program_shape/);
    assert.throws(() => buildPhaseProofProgram({ derivation: { ...input, selections: [{}] }, proof: input }, phaseProfile), /proof_program_derivation_selection/);
    assert.throws(() => buildPhaseProofProgram({ derivation: input, proof: input }), /phase_profile_receipt/);
});

test('N02G:HOST-001 admitted bytes execute in a child with separate R and I/M', async () => {
    const source = '(function evaluate(operands) { return Object.assign(Object.create(null), '
        + '{ unit: "count", kind: "nonnegative_integer", value: operands.source.get("count") }); })';
    const { receipt, sourceBytes } = artifact(source);
    sourceBytes.fill(0); // The loader captured exact bytes before caller mutation.
    const result = await runAdmittedMetric(config(receipt));
    assert.equal(result.stage, 'isolated_metric_observation_only');
    assert.equal(result.graph_accepted, false);
    assert.deepEqual(result.functional_result, { unit: 'count', kind: 'nonnegative_integer', value: 7 });
    assert.equal(result.observed_artifact_root, receipt.observed_root);
    assert.equal(result.trace.derivation_trace.filter(entry => entry.measurement === 'evaluator_artifact_root').length, 1);
    assert.deepEqual(result.trace.derivation_trace.filter(entry => entry.operation === 'get')
        .map(entry => [entry.alias, entry.role, entry.path]), [['input', 'source', ['count']]]);
    assert.ok(result.trace.derivation_trace.every(entry => !Object.hasOwn(entry, 'functional_result')));
});

test('N02G:HOST-002 forged admission and unauthorized guest globals fail closed', async () => {
    const benign = artifact('(function evaluate(operands) { return 7; })');
    await assert.rejects(runAdmittedMetric(config(Object.freeze(Object.create(null)))), /host_artifact_/);
    let getterCalls = 0;
    const hostile = [];
    Object.defineProperty(hostile, '0', { enumerable: true, get() {
        getterCalls++; return binding()[0];
    } });
    await assert.rejects(runAdmittedMetric(config(benign.receipt, { bindings: hostile })), /host_config_invalid/);
    assert.equal(getterCalls, 0);
    await assert.rejects(runAdmittedMetric(config(benign.receipt, { nodeSets: null })), /host_config_invalid/);
    await assert.rejects(runAdmittedMetric(config(benign.receipt)), /host_/);
    const causalOutput = artifact('(function evaluate(operands) { return { unit: "count", '
        + 'kind: "nonnegative_integer", value: 7, reads: ["input"] }; })');
    await assert.rejects(runAdmittedMetric(config(causalOutput.receipt)), /host_/);
    // Accessors must not be invoked/flattened into apparently safe R by cloning.
    const getterOutput = artifact('(function evaluate() { return { unit: "count", '
        + 'kind: "nonnegative_integer", get value() { return 7; } }; })');
    await assert.rejects(runAdmittedMetric(config(getterOutput.receipt)), /host_/);
    const classOutput = artifact('(function evaluate() { class R { constructor() { '
        + 'this.unit="count"; this.kind="nonnegative_integer"; this.value=7; } } return new R(); })');
    await assert.rejects(runAdmittedMetric(config(classOutput.receipt)), /host_/);
    const malicious = artifact('(function evaluate(operands) { return Function("return process")(); })');
    await assert.rejects(runAdmittedMetric(config(malicious.receipt)), /host_/);
    assert.equal(benign.receipt.stage, 'admitted_artifact_bytes_only');
});

test('N02G:HOST-003 nontermination cannot yield a functional result or trace approval', async () => {
    const endless = artifact('(function evaluate(operands) { for (;;) {} })');
    await assert.rejects(runAdmittedMetric(config(endless.receipt, { timeoutMs: 500 })), /host_timeout/);
});

test('N02G:HOST-004 admitted node set selection remains in I, not R', async () => {
    const source = '(function evaluate(operands) { let sum = 0; '
        + 'for (const event of operands.events.select(e => e.get("active"))) sum += event.get("amount"); '
        + 'return { unit: "BRL_minor", kind: "money_minor", value: sum }; })';
    const { receipt } = artifact(source);
    const scalar = { type: 'scalar' };
    const events = [true, false].map((active, i) => ({
        alias: `e${i}`, role: 'events', value: { active, amount: i === 0 ? -125 : -900 },
        shape: { type: 'record', fields: { active: scalar, amount: scalar } }
    }));
    const nodeSets = [{ role: 'events', bindings: events, roster: ['e0', 'e1'], links: [] }];
    const result = await runAdmittedMetric(config(receipt, { nodeSets }));
    assert.deepEqual(result.functional_result, { unit: 'BRL_minor', kind: 'money_minor', value: -125 });
    assert.deepEqual(result.trace.derivation_trace.filter(e => e.operation === 'select_member')
        .map(e => e.outcome[2]), [true, false]);
    assert.equal(result.trace.derivation_trace.filter(e => e.operation === 'select_return').length, 1);
    assert.ok(result.trace.derivation_trace.every(e => !Object.hasOwn(e, 'functional_result')));
    await assert.rejects(runAdmittedMetric(config(receipt, { nodeSets: [...nodeSets, nodeSets[0]] })), /host_/);
});

test('N02G:HOST-005 reviewed metric source runs as a closed measured bundle, without claim acceptance', async () => {
    const { buildAvailableMetricArtifacts } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const built = buildAvailableMetricArtifacts().built.find(item => item.evaluator_id === 'consumption_total');
    const receipt = admitArtifact({ manifestBytes: Buffer.from(built.manifest),
        expectedRoot: built.artifact_root,
        entries: [{ path: 'bundle.js', bytes: Buffer.from(built.source) }] });
    const scalar = { type: 'scalar' }; const version = `sha256:${'a'.repeat(64)}`;
    const category = role => ({ alias: 'food', role,
        identity: { kind: 'category', ref_id: 'food', version },
        value: { id: 'food', kind: 'expense' },
        shape: { type: 'record', fields: { id: scalar, kind: scalar } } });
    const eventPerson = { alias: 'p1', role: 'events', value: { id: 'p1' },
        shape: { type: 'record', fields: { id: scalar } } };
    const rows = ['confirmed', 'projected'].map((state, i) => ({
        alias: `e${i}`, role: 'events',
        identity: { kind: 'event', ref_id: `e${i}`, version },
        value: { id: `e${i}`, date: '2042-06-10', person_id: 'p1',
            category_id: 'food', state, amount_minor: -125 },
        shape: { type: 'record', fields: Object.fromEntries(
            ['id', 'date', 'person_id', 'category_id', 'state', 'amount_minor'].map(key => [key, scalar])) }
    }));
    const nodeSets = [
        { role: 'events', bindings: [...rows, category('events'), eventPerson], roster: ['e0', 'e1'],
            links: rows.flatMap(row => [
                { id: `category-${row.alias}`, source: row.alias,
                    target: 'food', field: 'category_id', type: 'ref' },
                { id: `person-${row.alias}`, source: row.alias,
                    target: 'p1', field: 'person_id', type: 'ref' }
            ]) },
        { role: 'categories', bindings: [category('categories')], roster: ['food'], links: [] }
    ];
    const context = { alias: 'context', role: 'context',
        value: { time_basis: 'event_date', evidence_state: 'confirmed',
            subject: { kind: 'person', ref_id: 'p1' },
            period: { kind: 'month', value: '2042-06' } },
        shape: { type: 'record', fields: { time_basis: scalar, evidence_state: scalar,
            subject: { type: 'record', fields: { kind: scalar, ref_id: scalar } },
            period: { type: 'record', fields: { kind: scalar, value: scalar } } } } };
    const family = { alias: 'family', role: 'family', value: { id: 'f1', members: ['p1'] },
        shape: { type: 'record', fields: { id: scalar, members: { type: 'sequence', item: scalar } } } };
    const person = { alias: 'person', role: 'family', value: { id: 'p1' },
        shape: { type: 'record', fields: { id: scalar } } };
    const { createInstrumentedAccess, createNodeSetAccess } = require('../../../src/next/provenance/instrumentedAccess');
    const { evaluateConsumption } = require('../../../src/next/provenance/metricSelection');
    const emit = () => {};
    const directLinks = [{ id: 'family-person', source: 'family', target: 'person',
        field: 'members', type: 'ref_list' }];
    const direct = createInstrumentedAccess({ bindings: [context, family, person], links: directLinks, emit });
    const events = createNodeSetAccess({ ...nodeSets[0], emit });
    const categories = createNodeSetAccess({ ...nodeSets[1], emit });
    assert.equal(evaluateConsumption({ context: direct.handle('context'), family: direct.handle('family'),
        events: events.handle, categories: categories.handle }, 'total'), 125);
    for (const control of [direct, events, categories]) control.revoke();
    const result = await runAdmittedMetric(config(receipt, { bindings: [context, family, person], nodeSets,
        operandAliases: [{ role: 'context', alias: 'context' }, { role: 'family', alias: 'family' }],
        directLinks }));
    assert.equal(result.stage, 'isolated_metric_observation_only');
    assert.equal(result.graph_accepted, false);
    assert.deepEqual(result.functional_result, { unit: 'BRL_minor', kind: 'money_minor', value: 125 });
    assert.deepEqual(result.trace.derivation_trace.filter(e => e.operation === 'select_member')
        .map(e => e.outcome[2]), [true, false]);
    assert.equal(result.trace.derivation_trace.filter(e => e.measurement === 'evaluator_artifact_root')[0].observed,
        receipt.observed_root);
    const { buildExecutionRegistryCandidate } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const registryCandidate = buildExecutionRegistryCandidate();
    const registryReceipt = admitExecutionRegistry({ bytes: Buffer.from(registryCandidate.bytes),
        expectedHash: registryCandidate.registry_hash });
    const evaluatorRef = { evaluator_id: 'consumption_total', evaluator_version: 1 };
    const contractBytes = Buffer.from(fs.readFileSync(path.join(__dirname,
        '../../../docs/contracts/next/provenance-v2/evaluator-contracts/consumption_total.json'), 'utf8')
        .replaceAll('\r\n', '\n'));
    const contractReceipt = admitExecutionContract({ registryReceipt, evaluatorRef, bytes: contractBytes });
    const registered = await runRegisteredMetric({ ...config(receipt, {
        bindings: [context, family, person], nodeSets,
        operandAliases: [{ role: 'context', alias: 'context' }, { role: 'family', alias: 'family' }],
        directLinks }), registryReceipt, evaluatorRef, contractReceipt });
    assert.equal(registered.stage, 'registry_root_bound_observation_only');
    assert.equal(registered.graph_accepted, false);
    assert.deepEqual(registered.functional_result, result.functional_result);
    const wrong = artifact('(function evaluate(operands) { return { unit: "BRL_minor", kind: "money_minor", value: 1 }; })');
    await assert.rejects(runRegisteredMetric({ ...config(wrong.receipt), registryReceipt,
        evaluatorRef, contractReceipt }), /host_registry_root/);
    await assert.rejects(runRegisteredMetric({ ...config(receipt), registryReceipt,
        evaluatorRef, contractReceipt: Object.freeze({ ...contractReceipt }) }), /host_registry_invalid/);
    await assert.rejects(runRegisteredMetric({ ...config(receipt, {
        bindings: [context, family, person], nodeSets,
        operandAliases: [{ role: 'context', alias: 'context' }, { role: 'unexpected', alias: 'family' }],
        directLinks }), registryReceipt, evaluatorRef, contractReceipt }), /host_registry_roles_invalid/);
});

test('N02G:HOST-006 registry unit alone cannot authorize wrong kind or enum value', async () => {
    const { buildExecutionRegistryCandidate } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const candidate = buildExecutionRegistryCandidate();
    const cases = [
        { id: 'owned_cards', source: '(function evaluate() { return '
            + '{ unit: "entity_ids", kind: "id", value: "card_1" }; })' },
        { id: 'source_coverage', source: '(function evaluate() { return '
            + '{ unit: "state", kind: "enum", value: "invented" }; })' }
    ];
    for (const item of cases) {
        const fakeArtifact = artifact(item.source);
        const registry = JSON.parse(candidate.bytes);
        const entry = registry.entries.find(row => row.evaluator_id === item.id);
        entry.evaluator_artifact_root = fakeArtifact.receipt.observed_root;
        const registryBytes = Buffer.from(canonicalValue(registry));
        const registryReceipt = admitExecutionRegistry({ bytes: registryBytes,
            expectedHash: digest(registryBytes) });
        const evaluatorRef = { evaluator_id: item.id, evaluator_version: 1 };
        const contractBytes = Buffer.from(fs.readFileSync(path.join(__dirname,
            `../../../docs/contracts/next/provenance-v2/evaluator-contracts/${item.id}.json`), 'utf8')
            .replaceAll('\r\n', '\n'));
        const contractReceipt = admitExecutionContract({ registryReceipt, evaluatorRef, bytes: contractBytes });
        const scalar = { type: 'scalar' };
        const directRoles = entry.roles.filter(role => role.input_kind !== 'node_set');
        const setRoles = entry.roles.filter(role => role.input_kind === 'node_set');
        const bindings = directRoles.map((role, i) => ({ alias: `direct_${i}`, role: role.role_id,
            value: { id: `direct_${i}` }, shape: { type: 'record', fields: { id: scalar } } }));
        const operandAliases = bindings.map(({ alias, role }) => ({ alias, role }));
        const nodeSets = setRoles.map((role, i) => ({ role: role.role_id,
            bindings: [{ alias: `set_${i}`, role: role.role_id,
                value: { id: `set_${i}` }, shape: { type: 'record', fields: { id: scalar } } }],
            roster: [`set_${i}`], links: [] }));
        await assert.rejects(runRegisteredMetric({ ...config(fakeArtifact.receipt,
            { bindings, operandAliases, nodeSets }),
            registryReceipt, evaluatorRef, contractReceipt }), /host_registry_output_mismatch/);
    }
});

test('N02G:HOST-007 one graph alias may be observed under two distinct registry roles', async () => {
    const { receipt } = artifact('(function evaluate(operands) { return { unit: "count", '
        + 'kind: "nonnegative_integer", value: operands.left.get("value") '
        + '+ operands.right.get("value") }; })');
    const group = role => ({ role, alias: 'shared', bindings: [{ alias: 'shared', role,
        value: { value: 7 }, shape: { type: 'record', fields: { value: { type: 'scalar' } } } }],
    links: [] });
    const result = await runAdmittedMetric(config(receipt, { bindings: [],
        directGroups: [group('left'), group('right')] }));
    assert.equal(result.graph_accepted, false);
    assert.deepEqual(result.functional_result, { unit: 'count', kind: 'nonnegative_integer', value: 14 });
    assert.deepEqual(result.trace.derivation_trace.filter(event => event.operation === 'get')
        .map(event => [event.alias, event.role, event.path]),
    [['shared', 'left', ['value']], ['shared', 'right', ['value']]]);
    await assert.rejects(runAdmittedMetric(config(receipt, { bindings: [],
        directGroups: [group('left'), { ...group('right'), alias: 'missing' }] })),
    /host_config_invalid/);
});
