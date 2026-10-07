'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const prefix = 'docs/contracts/next/provenance-v2/';
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const api = () => require('../../../src/next/provenance/selectedEventDayProfile');
const witness = read('docs/audit-evidence/n02g-causal-authoring-profile/selected-event-day-path-profile-witness.json');
function planInput() {
    const corpus = read(prefix + 'graphs-v2.json');
    const graph = corpus.graphs.find(row => row.fact_key === 'F-06#2#1');
    return { graph, claim: read(corpus.claim_contract.path).claims.find(row => row.fact_key === graph.fact_key),
        snapshots: read(corpus.snapshot_manifest.path).snapshots,
        materialRegistry: read(corpus.material_registry.path),
        phaseProfile: read(prefix + 'phase-composition-profile-v1.json'),
        predicate_id: 'p0055_selected_period', after: structuredClone(witness.patch.after) };
}
test('N02G:SELECTED-DAY-001 independent plan constructs exactly four fringe tuples without execution authority', () => {
    const plan = api().buildSelectedEventDayPlan(planInput());
    assert.deepEqual(plan.fringe, witness.proposed_plan.fringe_construction);
    assert.deepEqual(plan.truth, { C: true, M: false, S: true });
    assert.deepEqual(plan.proof_selected, witness.proposed_plan.expected_proof_selected);
    assert.deepEqual(plan.derivation_selected, witness.proposed_plan.expected_derivation_selected);
    assert.equal(plan.executable_closure_absence_proved, false);
    assert.equal(plan.profile_witness_qualified, false);
    assert.equal(plan.financial_release_eligible, false);
});

test('N02G:SELECTED-DAY-007 presealed complete program rejects changes to guard assertion D helpers and closure', async () => {
    const contract = await import('../../../scripts/agent/selectedEventDayProgramContract.mjs');
    const f = await fixture();
    const precommit = api().prepareSelectedEventDayPrecommit({ packageReceipt: f.packageReceipt,
        inventoryCandidate: f.inventoryCandidate, mutation_id: f.mutation_id });
    const { admittedDocuments, admitPackage } = require('../../../src/next/provenance/packageContract');
    const { createHash } = require('node:crypto');
    const docs = admittedDocuments(f.packageReceipt);
    const entries = docs.map(d => {
        let bytes = Buffer.from(fs.readFileSync(path.join(root, d.path), 'utf8').replaceAll('\r\n', '\n'));
        if (d.path === prefix + 'graphs-v2.json') {
            const value = structuredClone(d.value);
            value.graphs.find(g => g.fact_key === 'F-06#2#1').predicates
                .find(p => p.id === 'p0055_selected_period').args[0].field = structuredClone(witness.patch.after);
            bytes = Buffer.from(JSON.stringify(value));
        }
        return { path: d.path, bytes };
    });
    const packageReceipt = admitPackage({ entries, authority: entries.map(e => ({ path: e.path,
        sha256: 'sha256:' + createHash('sha256').update(e.bytes).digest('hex') })) });
    const expectation = api().sealSelectedEventDayIrExpectation({ precommit, variant: 'M', packageReceipt });
    const programExpectation = contract.sealSelectedEventDayProgramExpectation({ expectation });
    const controls = ['C', 'S'].map(variant => {
        const irExpectation = api().sealSelectedEventDayIrExpectation({ precommit, variant, packageReceipt: f.packageReceipt });
        return { variant, irExpectation, programExpectation: contract.sealSelectedEventDayProgramExpectation({ expectation: irExpectation }) };
    });
    assert.equal(programExpectation.profile_witness_qualified, false);
    // The expected whole program is already sealed; now compile M normally.
    const { compileAuthoringIR, compileSnapshotAccess } = require('../../../src/next/provenance/graphCompiler');
    api().compareSelectedEventDayIr({ expectation, ir: compileAuthoringIR(packageReceipt, f.validators) });
    const access = compileSnapshotAccess(packageReceipt, f.validators);
    const { admitPhaseCompositionProfile } = require('../../../src/next/provenance/phaseCompositionProfile');
    const corpus = docs.find(d => d.path === prefix + 'graphs-v2.json').value;
    const phase = admitPhaseCompositionProfile({ source: fs.readFileSync(path.join(root,
        prefix + 'phase-composition-profile-v1.json'), 'utf8').replaceAll('\r\n', '\n'),
        registry: docs.find(d => d.path === corpus.metric_evaluator_registry.path).value });
    const { buildPhaseProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const selector = { fact_key: 'F-06#2#1' };
    const built = buildPhaseProofProgram({ proof: access.projectProofProgram(selector).input,
        derivation: access.projectDerivationProgram(selector, phase).input }, phase);
    const checked = contract.verifySelectedEventDayProgram({ programExpectation, source: built.source });
    assert.equal(checked.program_sha256, programExpectation.expected_source_sha256);
    assert.equal(checked.whole_program_conformance, true);
    assert.equal(checked.profile_witness_qualified, false);
    assert.equal(checked.external_leases_implemented, false);
    assert.equal(checked.financial_release_eligible, false);
    assert.equal(checked.executable_closure_absence_proved, false);
    for (const control of controls) {
        // C and S are independently recompiled controls, not baseline source
        // copied into the mutant's expected contract.
        api().compareSelectedEventDayIr({ expectation: control.irExpectation,
            ir: compileAuthoringIR(f.packageReceipt, f.validators) });
        const controlAccess = compileSnapshotAccess(f.packageReceipt, f.validators);
        const program = buildPhaseProofProgram({ proof: controlAccess.projectProofProgram(selector).input,
            derivation: controlAccess.projectDerivationProgram(selector, phase).input }, phase);
        assert.equal(contract.verifySelectedEventDayProgram({ programExpectation: control.programExpectation,
            source: program.source }).whole_program_conformance, true);
        assert.throws(() => contract.verifySelectedEventDayProgram({ programExpectation, source: program.source }), /source_identity/);
        assert.throws(() => contract.verifySelectedEventDayProgram({ programExpectation: control.programExpectation,
            source: built.source }), /source_identity/);
    }
    const label = 'proof_assertion_' + Buffer.from('p0055_selected_period').toString('hex');
    const edits = [
        s => s.replace('operands.node("evt_restaurant_b").get("date")', 'operands.node("evt_refund_b").get("date")'),
        s => s.replace(label + ':{', 'omitted_assertion:{'),
        s => s.replace('return all;}', 'return true;}'),
        s => s.replace('let seen=0;', 'let seen=0;operands.set("selected");'),
        s => s.replace('seen++;switch(index)', 'seen++;if(index<0)return false;switch(index)'),
        s => s.replace('if(operands.phase==="derivation")return (', 'if(operands.phase==="derivation")return false&&('),
        s => s.replace('function checkedNode(handle,kind)', 'function checkedNode(changed,kind)'),
        s => s.replace('return all; }', 'return !all; }'),
        s => '/* unbound metadata */' + s
    ];
    for (const edit of edits) {
        const changed = edit(built.source); assert.notEqual(changed, built.source);
        assert.throws(() => contract.verifySelectedEventDayProgram({ programExpectation, source: changed }), /selected_day_program_/);
    }
    assert.throws(() => contract.verifySelectedEventDayProgram({ programExpectation: structuredClone(programExpectation), source: built.source }), /authority/);
    assert.throws(() => contract.sealSelectedEventDayProgramExpectation({ expectation: structuredClone(expectation) }), /authority/);
    let effects = 0;
    const proxy = new Proxy({ expectation }, { getPrototypeOf() { effects++; return Object.prototype; } });
    const accessor = Object.defineProperty({}, 'expectation', { enumerable: true, get() { effects++; return expectation; } });
    for (const value of [proxy, accessor]) assert.throws(() => contract.sealSelectedEventDayProgramExpectation(value), /input/);
    assert.equal(effects, 0);
});
test('N02G:SELECTED-DAY-002 class rejects collateral consumers guards incidence and date-domain changes', () => {
    const changes = [
        x => { x.graph.sets[x.graph.selections[0].candidate_set].push('evt_restaurant_b'); },
        x => { x.graph.sets[x.graph.selections[0].selected_set] = []; },
        x => { x.graph.selections[0].excluded.push({ node: 'evt_restaurant_b', reason: 'period', predicates: [] }); },
        x => { x.graph.selections[0].selected_predicates.push(x.predicate_id); },
        x => { x.graph.predicates.find(p => p.id === 'p0056_selected_state').op = 'not_eq'; },
        x => { x.graph.predicates.find(p => p.id === 'p0056_selected_state').args[1].literal.value = 'projected'; },
        x => { x.graph.edges = x.graph.edges.filter(e => e.target !== x.after.node || e.source !== 'evt_refund_b'); },
        x => { x.claim.period.kind = 'month'; },
        x => { x.claim.period.value = '2042-02-29'; },
        x => { x.graph.windows.extra = { kind: 'month', value: { literal: { type: 'month', value: '2042-06' } } }; },
        x => { x.graph.predicates.push({ id: 'consume_view', args: [{ set: x.graph.selections[0].selected_set }] }); },
        x => { x.after.node = 'evt_refund_b'; },
        x => { x.after.segments = ['state']; },
        x => { x.graph.nodes.evt_refund_b.binding = 'validated_parent'; },
        x => { x.phaseProfile.entries.find(p => p.metric === x.claim.metric).derivation_mode = 'formula_plus_selection_guards'; }
    ];
    for (const change of changes) {
        const input = planInput(); change(input);
        assert.throws(() => api().buildSelectedEventDayPlan(input), /selected_day_/);
    }
});
test('N02G:SELECTED-DAY-003 passive boundaries reject expected and IR injection without evaluating accessors', () => {
    const module = api(); const input = planInput(); let effects = 0;
    const active = Object.defineProperty({}, 'graph', { enumerable: true, get() { effects++; return input.graph; } });
    const proxy = new Proxy(input, { ownKeys() { effects++; return []; } });
    for (const value of [active, proxy, { ...input, expected: witness.proposed_plan }, { ...input, ir: {} }])
        assert.throws(() => module.buildSelectedEventDayPlan(value), /selected_day_/);
    assert.equal(effects, 0);
});
test('N02G:SELECTED-DAY-005 plan is a declarative class, not a whitelist of F-06 aliases or predicate IDs', () => {
    const input = planInput();
    const old = input.predicate_id, next = 'other_selected_day';
    input.predicate_id = next;
    input.graph.predicates.find(p => p.id === old).id = next;
    input.graph.selections[0].selected_predicates = input.graph.selections[0].selected_predicates.map(id => id === old ? next : id);
    input.graph.fact_key = input.claim.fact_key = 'F-OTHER#1#1';
    const aliases = { evt_refund_b: 'source_event', evt_restaurant_b: 'related_event' };
    function rename(value) {
        if (typeof value === 'string') return aliases[value] ?? value;
        if (!value || typeof value !== 'object') return value;
        if (Array.isArray(value)) return value.map(rename);
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [aliases[key] ?? key, rename(child)]));
    }
    input.graph = rename(input.graph); input.after = rename(input.after);
    const plan = api().buildSelectedEventDayPlan(input);
    assert.equal(plan.predicate_id, next);
    assert.equal(plan.fact_key, 'F-OTHER#1#1');
    assert.equal(plan.fringe.M[0].tuple[2], 'related_event');
    assert.deepEqual(plan.proof_selected.C, ['source_event']);
    assert.equal(plan.profile_witness_qualified, false);
});
test('N02G:SELECTED-DAY-014 private admission compiles whole worlds and binds roots without caller authority', async () => {
    const admission = await import('../../../scripts/agent/prepareSelectedEventDayAdmission.mjs');
    const lowerer = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const contract = await import('../../../scripts/agent/selectedEventDayProgramContract.mjs');
    const capture = await import('../../../scripts/agent/buildSelectedEventDayDispatchCapsule.mjs');
    const f = { C: await profileBuildFixture('C') };
    f.M = await profileBuildFixture('M', f.C.precommit); f.S = await profileBuildFixture('S', f.C.precommit);
    const expectations = Object.fromEntries(['C', 'M', 'S'].map(v => [v, f[v].expectation]));
    const programme = contract.sealSelectedEventDayCommonProgramExpectation({ expectations });
    const leases = Object.fromEntries(['C', 'M', 'S'].map(v => [v,
        api().sealSelectedEventDayLeaseExpectation({ expectation: expectations[v] })]));
    const family = api().selectedEventDayProgramFamily(expectations);
    const inputs = Object.fromEntries(['C', 'M', 'S'].map(v => [v,
        { proof: family[v].proof, derivation: family[v].derivation }]));
    const built = lowerer.buildSelectedEventDayCommonProofProgram(inputs, f.C.phase, expectations);
    const conformance = contract.verifySelectedEventDayProgram({ programExpectation: programme, source: built.source });
    const raw = { expectations, leaseExpectations: leases, programConformance: conformance };
    const capsule = capture.buildSelectedEventDayDispatchCapsule(raw);
    const { admitArtifact } = require('../../../src/next/provenance/artifactLoader');
    const proofArtifactReceipt = admitArtifact({ manifestBytes: Buffer.from(built.manifest), expectedRoot: built.artifact_root,
        entries: [{ path: 'bundle.js', bytes: Buffer.from(built.source) },
            { path: built.profileInput.path, bytes: Buffer.from(built.profileInput.source) }] });
    const dispatchArtifactReceipt = admitArtifact({ manifestBytes: Buffer.from(capsule.manifest), expectedRoot: capsule.artifact_root,
        entries: [{ path: capsule.entry, bytes: Buffer.from(capsule.source) }] });
    const options = { ...raw, proofArtifactReceipt, dispatchArtifactReceipt };
    // A caller may admit new bytes against a newly self-hashed manifest. That
    // is byte identity, not authority to replace the independently sealed code.
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const changedSource = built.source.replace('selected-event-day-path/v1 common', 'ordinary-positive common');
    const changedManifest = JSON.parse(built.manifest);
    const { createHash } = require('node:crypto');
    changedManifest.files[0].sha256 = 'sha256:' + createHash('sha256').update(changedSource).digest('hex');
    const manifestSource = canonicalValue(changedManifest);
    const substituted = admitArtifact({ manifestBytes: Buffer.from(manifestSource),
        expectedRoot: 'sha256:' + createHash('sha256').update(manifestSource).digest('hex'),
        entries: [{ path: 'bundle.js', bytes: Buffer.from(changedSource) },
            { path: built.profileInput.path, bytes: Buffer.from(built.profileInput.source) }] });
    assert.throws(() => admission.prepareSelectedEventDayAdmission({ ...options,
        proofArtifactReceipt: substituted }), /selected_day_admission_program/);
    assert.throws(() => admission.prepareSelectedEventDayAdmission({ ...options,
        validators: f.M.validators }), /selected_day_admission_input/);
    assert.throws(() => admission.prepareSelectedEventDayAdmission({ ...options,
        proofArtifactReceipt: structuredClone(proofArtifactReceipt) }), /artifact_not_admitted/);
    assert.throws(() => admission.prepareSelectedEventDayAdmission({ ...options,
        dispatchArtifactReceipt: proofArtifactReceipt }), /selected_day_admission_dispatch/);
    assert.throws(() => admission.prepareSelectedEventDayAdmission({ ...options,
        programConformance: structuredClone(conformance) }), /conformance_authority/);
    let effects = 0;
    const active = { ...options }; Object.defineProperty(active, 'proofArtifactReceipt',
        { enumerable: true, get() { effects++; return proofArtifactReceipt; } });
    assert.throws(() => admission.prepareSelectedEventDayAdmission(active), /selected_day_admission_input/);
    assert.equal(effects, 0);
    const receipt = admission.prepareSelectedEventDayAdmission(options);
    assert.equal(receipt.normal_compile_worlds, 3);
    assert.equal(receipt.program_artifact_root, built.artifact_root);
    assert.equal(receipt.dispatch_artifact_root, capsule.artifact_root);
    assert.equal(receipt.executable_ticket_complete, false);
    assert.equal(receipt.measured_tcb_admission, false);
    assert.equal(receipt.profile_witness_qualified, false);
    assert.equal(receipt.financial_release_eligible, false);
    assert.throws(() => admission.claimSelectedEventDayInvocation({ admission: structuredClone(receipt), variant: 'M',
        scope: { executionId: 'admission', invocationId: 'admission/M' } }), /authority/);
    for (const variant of ['C', 'M', 'S']) {
        const scope = { executionId: 'admission', invocationId: 'admission/' + variant };
        if (variant !== 'C') assert.throws(() => admission.claimSelectedEventDayInvocation({ admission: receipt, variant,
            scope: { ...scope, executionId: 'other' } }), /scope_identity/);
        const invocation = admission.claimSelectedEventDayInvocation({ admission: receipt, variant, scope });
        const resolved = admission.resolveSelectedEventDayInvocation(invocation);
        assert.equal(resolved.variant, variant);
        assert.equal(resolved.packet_source.includes('negative_qualification'), true);
        assert.equal(resolved.proof_source, built.source);
        assert.equal(resolved.proof.config.proofSelections.length, 1);
        assert.equal(invocation.financial_release_eligible, false);
        assert.throws(() => admission.resolveSelectedEventDayInvocation(structuredClone(invocation)), /authority/);
        assert.throws(() => admission.claimSelectedEventDayInvocation({ admission: receipt, variant, scope }), /reused/);
    }
});
test('N02G:SELECTED-DAY-015 closed negative proof child records native calls with parent-owned leases', async () => {
    const runtime = await import('../../../scripts/agent/buildSelectedEventDayProofExecution.mjs');
    const f = await negativeNativeFixture();
    const execution = runtime.buildSelectedEventDayProofExecution({ admission: f.admission });
    assert.equal(execution.financial_release_eligible, false);
    assert.equal(execution.validation_tcb_complete, false);
    assert.throws(() => runtime.buildSelectedEventDayProofExecution({ admission: structuredClone(f.admission) }), /authority/);
    assert.equal(execution.sourceHashes.some(r => /graphCompiler|selectedEventDayProfile|ProgramContract/.test(r.path)), false);
    for (const variant of ['C', 'M', 'S']) {
        const scope = { executionId: 'native-selected-day', invocationId: 'native/' + variant };
        const invocation = f.api.claimSelectedEventDayInvocation({ admission: f.admission, variant, scope });
        const result = await runtime.executeSelectedEventDayProof({ execution: execution.executionReceipt, invocation });
        assert.equal(result.proof_satisfied, variant !== 'M');
        assert.equal(result.fringe_count, 4);
        assert.equal(result.raw_rows.every((r, i) => r.sequence === i), true);
        assert.equal(result.raw_rows.filter(r => r.owner.kind === 'fringe').length, 4);
        assert.equal(result.site_results.filter(r => r.site.endsWith('p0055_selected_period')).length, 2);
        assert.equal(result.trace.proof_trace.length, result.raw_rows.length);
        assert.equal(result.profile_witness_qualified, false);
        assert.equal(result.financial_release_eligible, false);
        assert.equal(result.receipt_created, false);
        await assert.rejects(runtime.executeSelectedEventDayProof({ execution: execution.executionReceipt, invocation }), /reused/);
    }
    await assert.rejects(runtime.executeSelectedEventDayProof({ execution: structuredClone(execution.executionReceipt),
        invocation: {} }), /authority/);
});
test('N02G:SELECTED-DAY-016 parent boundary replay rejects every missing duplicated or mislabeled fringe', async () => {
    const { applySelectedEventDayProofBoundary } = require('../../../src/next/provenance/selectedEventDayProofProtocol');
    const { createSelectedEventDayDispatchCore } = require('../../../src/next/provenance/selectedEventDayDispatchCore');
    const f = await negativeNativeFixture();
    const prepared = f.api.resolveSelectedEventDayAdmission(f.admission);
    const { decodeSelectedEventDayPacket } = require('../../../src/next/provenance/selectedEventDayPacket');
    const packet = decodeSelectedEventDayPacket(prepared.packet.source);
    for (const variant of ['C', 'M', 'S']) {
        const scope = { executionId: 'boundary-test', invocationId: 'boundary/' + variant };
        const plan = packet.variants[variant].plan, messages = [];
        const child = createSelectedEventDayDispatchCore({ plan, scope, emit: () => {} });
        const boundary = (event, value) => messages.push({ kind: 'boundary', event,
            ...(value === undefined ? {} : { value }) });
        const proof = prepared.worlds[variant].access.openProof({ fact_key: 'F-06#2#1' }, event => {
            child.observe(event); messages.push({ kind: 'observation', event });
        });
        const operands = { phase: 'proof', ...proof, ...child.guest,
            dispatch: callback => { boundary('site_begin'); const value = child.guest.dispatch(callback); boundary('site_end', value); return value; },
            operand: callback => { boundary('operand_begin'); const value = child.guest.operand(callback); boundary('operand_end'); return value; },
            select: (...args) => { boundary('selection_begin'); const value = child.select(() => proof.select(...args)); boundary('selection_end'); return value; }
        };
        const value = require('node:vm').runInNewContext(`(${prepared.proof.files[0].source})(operands)`, { operands }, { timeout: 5000 });
        child.finish(value); proof.revoke(); proof.assertHealthy();
        function replay(input) {
            const rows = [];
            const parent = createSelectedEventDayDispatchCore({ plan, scope, emit: row => rows.push(row) });
            for (const message of input) {
                if (message.kind === 'boundary') applySelectedEventDayProofBoundary(parent, message);
                else parent.observe(message.event);
            }
            parent.finish(value); return rows;
        }
        const rows = replay(messages), indices = [];
        let observation = 0;
        for (let i = 0; i < messages.length; i++) if (messages[i].kind === 'observation') {
            if (rows[observation++].owner.kind === 'fringe') indices.push(i);
        }
        assert.equal(indices.length, 4);
        for (const index of indices) {
            const omitted = structuredClone(messages); omitted.splice(index, 1);
            const duplicated = structuredClone(messages); duplicated.splice(index, 0, duplicated[index]);
            const altered = structuredClone(messages); altered[index].event[2] += '/forged';
            for (const input of [omitted, duplicated, altered]) assert.throws(() => replay(input), /selected_day_dispatch_/);
        }
        for (let index = 0; index < messages.length; index++) if (messages[index].kind === 'boundary') {
            const omitted = structuredClone(messages); omitted.splice(index, 1);
            const duplicated = structuredClone(messages); duplicated.splice(index, 0, duplicated[index]);
            const labeled = structuredClone(messages); labeled[index].site = 'guest-chosen';
            for (const input of [omitted, duplicated, labeled]) assert.throws(() => replay(input), /selected_day_/);
        }
    }
});
test('N02G:SELECTED-DAY-017 isolated negative graph retains whole native D and attributes no D fringe', async () => {
    const runtime = await import('../../../scripts/agent/buildSelectedEventDayProofExecution.mjs');
    const f = await negativeNativeFixture();
    const execution = runtime.buildSelectedEventDayProofExecution({ admission: f.admission });
    const results = {};
    for (const variant of ['C', 'M', 'S']) {
        const invocation = f.api.claimSelectedEventDayInvocation({ admission: f.admission, variant,
            scope: { executionId: 'negative-native-graph', invocationId: 'graph/' + variant } });
        results[variant] = await runtime.executeSelectedEventDayGraph({ execution: execution.executionReceipt, invocation });
        const r = results[variant];
        assert.equal(r.derivation_satisfied, true);
        assert.equal(r.proof_satisfied, variant !== 'M');
        // Independently read the authored refund snapshot, not any actual R.
        const input = planInput(), refund = input.snapshots.find(s => s.ref_id === input.claim.subject.ref_id);
        assert.deepEqual(r.result, { kind: 'money_minor', unit: 'BRL_minor', value: refund.payload.amount_minor });
        assert.equal(r.raw_rows.every((row, i) => row.sequence === i), true);
        assert.equal(r.raw_rows.filter(row => row.phase === 'derivation').every(row => row.owner.kind === 'core'), true);
        assert.ok(r.trace.derivation_trace.some(row => row.operation === 'select_return'));
        assert.equal(r.trace.derivation_trace.length + r.trace.proof_trace.length, r.raw_rows.length);
        assert.equal(r.raw_rows.filter(row => row.owner.kind === 'fringe').length, 4);
        assert.equal(r.validation_tcb_complete, false);
        assert.equal(r.profile_witness_qualified, false);
        assert.equal(r.receipt_created, false);
        await assert.rejects(runtime.executeSelectedEventDayGraph({ execution: execution.executionReceipt, invocation }), /reused/);
    }
    const payload = row => row.raw_rows.map(r => r.event);
    assert.deepEqual(payload(results.C).slice(0, results.C.trace.derivation_trace.length),
        payload(results.M).slice(0, results.M.trace.derivation_trace.length));
    assert.deepEqual(payload(results.C).slice(0, results.C.trace.derivation_trace.length),
        payload(results.S).slice(0, results.S.trace.derivation_trace.length));
    const compared = runtime.compareSelectedEventDayGraphCore({ execution: execution.executionReceipt, results });
    assert.equal(compared.exact_core_matched, true);
    assert.equal(compared.fringe_count_per_variant, 4);
    assert.equal(compared.profile_witness_qualified, false);
    assert.equal(compared.profile_coverage_complete, false);
    assert.equal(compared.oracle_verified, false);
    assert.throws(() => runtime.compareSelectedEventDayGraphCore({ execution: execution.executionReceipt,
        results: { ...results, M: structuredClone(results.M) } }), /authority/);
});
test('N02G:SELECTED-DAY-018 complete core comparison rejects D differences P replay and scope substitution', async () => {
    const { compareSelectedEventDayCore } = require('../../../src/next/provenance/selectedEventDayCoreComparison');
    const { decodeSelectedEventDayPacket } = require('../../../src/next/provenance/selectedEventDayPacket');
    const runtime = await import('../../../scripts/agent/buildSelectedEventDayProofExecution.mjs');
    const f = await negativeNativeFixture(), execution = runtime.buildSelectedEventDayProofExecution({ admission: f.admission });
    const plans = decodeSelectedEventDayPacket(f.api.resolveSelectedEventDayAdmission(f.admission).packet.source).variants;
    const results = {};
    for (const variant of ['C', 'M', 'S']) {
        const invocation = f.api.claimSelectedEventDayInvocation({ admission: f.admission, variant,
            scope: { executionId: 'core-exact-native', invocationId: 'core/' + variant } });
        results[variant] = await runtime.executeSelectedEventDayGraph({ execution: execution.executionReceipt, invocation });
    }
    assert.equal(compareSelectedEventDayCore({ results, plans }).exact_core_matched, true);
    const changes = [
        r => { r.M.raw_rows[0].event[2] = 'sha256:' + '0'.repeat(64); },
        r => { const i = r.M.raw_rows.findIndex(row => row.phase === 'derivation' && row.event[0] === 'I');
            r.M.raw_rows[i].owner.kind = 'fringe'; },
        r => { r.M.raw_rows.splice(0, 1); },
        r => { r.M.raw_rows.push(structuredClone(r.M.raw_rows.at(-1))); },
        r => { const i = r.M.raw_rows.findIndex(row => row.owner.kind === 'fringe'); r.M.raw_rows[i].event[2] += '/forged'; },
        r => { r.M.trace.proof_trace[0].invocation_id = r.C.trace.proof_trace[0].invocation_id; },
        r => { r.M.trace.derivation_trace[0].sequence += 1; },
        r => { r.M.result.value += 1; }
    ];
    for (const change of changes) { const forged = structuredClone(results); change(forged);
        assert.throws(() => compareSelectedEventDayCore({ results: forged, plans }), /selected_day_core_/); }
});
test('N02G:SELECTED-DAY-019 profile coverage retains every native position without changing normal coverage', async () => {
    const runtime = await import('../../../scripts/agent/buildSelectedEventDayProofExecution.mjs');
    assert.equal(typeof runtime.compareSelectedEventDayGraphCoverage, 'function');
    const f = await negativeNativeFixture(), execution = runtime.buildSelectedEventDayProofExecution({ admission: f.admission });
    const results = {};
    for (const variant of ['C', 'M', 'S']) {
        const invocation = f.api.claimSelectedEventDayInvocation({ admission: f.admission, variant,
            scope: { executionId: 'coverage-native', invocationId: 'coverage/' + variant } });
        results[variant] = await runtime.executeSelectedEventDayGraph({ execution: execution.executionReceipt, invocation });
    }
    const coverage = runtime.compareSelectedEventDayGraphCoverage({ execution: execution.executionReceipt, results });
    assert.equal(coverage.profile_coverage_complete, true);
    assert.equal(coverage.normal_checker_modified, false);
    assert.equal(coverage.profile_witness_qualified, false);
    assert.equal(coverage.oracle_verified, false);
    for (const variant of ['C', 'M', 'S']) {
        const positions = coverage.variants[variant].positions;
        assert.equal(positions.length, results[variant].raw_rows.length);
        assert.deepEqual(positions.map(r => r.sequence), results[variant].raw_rows.map(r => r.sequence));
        assert.equal(positions.every(r => r.status === 'covered'), true);
        assert.equal(positions.filter(r => r.owner === 'fringe').length, 4);
    }
    assert.throws(() => runtime.compareSelectedEventDayGraphCoverage({ execution: execution.executionReceipt,
        results: { ...results, M: structuredClone(results.M) } }), /authority/);
    // The pure helper has no authority. Give it independently built recipe
    // data solely to show that common corruption is not rescued by C/M/S equality.
    const prepared = f.api.resolveSelectedEventDayAdmission(f.admission);
    const metrics = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const metric = metrics.buildAvailableMetricArtifacts().built.find(m => m.evaluator_id === prepared.metricIdentity.evaluator_id
        && m.evaluator_version === prepared.metricIdentity.evaluator_version);
    const { decodeSelectedEventDayPacket } = require('../../../src/next/provenance/selectedEventDayPacket');
    const { compareSelectedEventDayCoverage } = require('../../../src/next/provenance/selectedEventDayCoverage');
    const { compareSelectedEventDayCore } = require('../../../src/next/provenance/selectedEventDayCoreComparison');
    const plans = decodeSelectedEventDayPacket(prepared.packet.source).variants;
    const recipe = {
        plans, coverage: Object.fromEntries(['C', 'M', 'S'].map(v => [v, prepared.worlds[v].coverage])),
        measurements: { derivation: [
            { measurement: 'evaluator_artifact_root', observed: metric.artifact_root },
            { measurement: 'proof_engine_artifact_root', observed: f.admission.program_artifact_root },
            { measurement: 'evaluator_contract_hash', observed: prepared.metricIdentity.contract_sha256 }],
            proof: [{ measurement: 'proof_engine_artifact_root', observed: f.admission.program_artifact_root }] }
    };
    assert.equal(compareSelectedEventDayCoverage({ ...recipe, results }).profile_coverage_complete, true);
    const traceEntry = row => ({ sequence: row.sequence, invocation_id: row.invocation_id, phase: row.phase,
        ...(row.event[0] === 'I' ? { operation: row.event[1], alias: row.event[2], role: row.event[3],
            path: row.event[4], projection: row.event[5], outcome: row.event[6] }
            : { measurement: row.event[1], observed: row.event[2] }) });
    const commonChanges = [
        r => { r.raw_rows = r.raw_rows.filter(row => !(row.phase === 'derivation' && row.event[0] === 'I'
            && row.event[1] === 'get' && row.event[4].join('/') === 'amount_minor')); },
        r => { const row = r.raw_rows.find(row => row.phase === 'derivation' && row.event[0] === 'I'
            && row.event[1] === 'get' && row.event[2] === 'claim/context' && row.event[4].join('/') === 'period');
            assert.ok(row); assert.deepEqual(row.event[6], ['container', 'record']);
            row.event[6] = ['container', 'sequence']; },
        r => { r.raw_rows[0].event[2] = 'sha256:' + '0'.repeat(64); },
        r => { r.raw_rows = r.raw_rows.filter(row => !(row.phase === 'proof' && row.event[0] === 'I'
            && row.event[1] === 'next' && row.event[5] === 'data' && row.event[6][0] === 'done')); }
    ];
    for (const change of commonChanges) {
        const forged = structuredClone(results);
        for (const variant of ['C', 'M', 'S']) {
            change(forged[variant]);
            const r = forged[variant];
            r.raw_rows.forEach((row, index) => { row.sequence = index; });
            r.raw_event_count = r.raw_rows.length;
            r.trace.derivation_trace = r.raw_rows.filter(row => row.phase === 'derivation').map(traceEntry);
            r.trace.proof_trace = r.raw_rows.filter(row => row.phase === 'proof').map(traceEntry);
        }
        // Exact equality alone deliberately still succeeds; coverage rejects.
        assert.equal(compareSelectedEventDayCore({ results: forged, plans }).exact_core_matched, true);
        assert.throws(() => compareSelectedEventDayCoverage({ ...recipe, results: forged }), /selected_day_coverage_/);
    }
    let touched = 0;
    const accessor = { ...recipe };
    Object.defineProperty(accessor, 'results', { enumerable: true, get() { touched++; return results; } });
    for (const forged of [accessor, new Proxy({ ...recipe, results }, { ownKeys() { touched++; return []; } })])
        assert.throws(() => compareSelectedEventDayCoverage(forged), /selected_day_coverage_shape/);
    assert.equal(touched, 0);
});
test('N02G:SELECTED-DAY-020 coverage expectations come from sealed authorship before any native result', async () => {
    const c = await profileBuildFixture('C'), m = await profileBuildFixture('M', c.precommit),
        s = await profileBuildFixture('S', c.precommit);
    const rows = Object.fromEntries(Object.entries({ C: c, M: m, S: s }).map(([v, f]) =>
        [v, api().selectedEventDayCoverageInputs(f.expectation)]));
    assert.deepEqual(rows.C.derivation, rows.M.derivation);
    assert.deepEqual(rows.C.derivation, rows.S.derivation);
    assert.deepEqual(rows.C.proof.expected.selected_nodes, ['evt_refund_b']);
    assert.deepEqual(rows.M.proof.expected.selected_nodes, []);
    assert.deepEqual(rows.M.proof.sets.selected, []);
    assert.deepEqual(rows.C.proof.expected.required_reads, rows.M.proof.expected.required_reads);
    assert.deepEqual(rows.C.proof.expected.required_edges, rows.M.proof.expected.required_edges);
    assert.deepEqual(rows.C.proof.expected.required_structural, rows.M.proof.expected.required_structural);
    assert.equal(Object.isFrozen(rows.M.proof.expected), true);
    assert.throws(() => api().selectedEventDayCoverageInputs(structuredClone(m.expectation)), /authority/);
});
test('N02G:SELECTED-DAY-021 original oracle and CoreClaim are sealed before M and checked for every native world', async () => {
    const runtime = await import('../../../scripts/agent/buildSelectedEventDayProofExecution.mjs');
    assert.equal(typeof runtime.compareSelectedEventDayGraphOracle, 'function');
    const f = await negativeNativeFixture(), execution = runtime.buildSelectedEventDayProofExecution({ admission: f.admission });
    const prepared = f.api.resolveSelectedEventDayAdmission(f.admission);
    assert.equal(Object.isFrozen(prepared.oracle), true);
    assert.equal(prepared.oracle.source_path, 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json');
    assert.equal(prepared.oracle.expected_result.value, read(prepared.oracle.source_path).turns['F-06#2'].facts[0].value);
    const results = {};
    for (const variant of ['C', 'M', 'S']) {
        const invocation = f.api.claimSelectedEventDayInvocation({ admission: f.admission, variant,
            scope: { executionId: 'oracle-native', invocationId: 'oracle/' + variant } });
        results[variant] = await runtime.executeSelectedEventDayGraph({ execution: execution.executionReceipt, invocation });
    }
    const checked = runtime.compareSelectedEventDayGraphOracle({ execution: execution.executionReceipt, results });
    assert.equal(checked.oracle_verified, true);
    assert.equal(checked.core_claim_verified, true);
    assert.equal(checked.profile_coverage_complete, true);
    assert.equal(checked.profile_witness_qualified, false);
    assert.equal(checked.semantic_mutation_credit, 0);
    assert.equal(checked.financial_release_eligible, false);
    assert.throws(() => runtime.compareSelectedEventDayGraphOracle({ execution: execution.executionReceipt,
        results: { ...results, M: structuredClone(results.M) } }), /authority/);
    assert.throws(() => runtime.compareSelectedEventDayGraphOracle({ execution: execution.executionReceipt,
        results, expectation: prepared.oracle }), /input/);
    const { compareSelectedEventDayOracle } = require('../../../src/next/provenance/selectedEventDayOracle');
    assert.equal(compareSelectedEventDayOracle({ results, expectation: prepared.oracle }).oracle_verified, true);
    const commonChanges = [
        r => { r.result.value++; },
        r => { r.result = { kind: 'nonnegative_integer', unit: 'count', value: r.result.value }; },
        r => { const row = r.raw_rows.find(row => row.event[0] === 'I' && row.event[1] === 'get'
            && row.event[2] === 'claim/context' && row.event[4].join('/') === 'period/value');
            assert.ok(row); row.event[6][1] = '2042-06-10'; },
        r => { const row = r.raw_rows.find(row => row.event[0] === 'I' && row.event[1] === 'get'
            && row.event[2] === 'claim/context' && row.event[4].join('/') === 'unit');
            assert.ok(row); row.event[6][1] = 'count'; },
        r => { r.raw_rows = r.raw_rows.filter(row => row.event[2] !== 'claim/context'); }
    ];
    for (const change of commonChanges) {
        const forged = structuredClone(results);
        for (const variant of ['C', 'M', 'S']) change(forged[variant]);
        assert.throws(() => compareSelectedEventDayOracle({ results: forged, expectation: prepared.oracle }), /selected_day_oracle_/);
    }
    // Generate mutations for EVERY actually read scalar in CoreClaim, not a
    // handpicked field allowlist. Expected always remains the sealed authorship.
    const scalarReads = new Map(results.C.raw_rows.filter(row => row.event[0] === 'I' && row.event[1] === 'get'
        && row.event[2] === 'claim/context' && row.event[5] === 'data' && row.event[6][0] === 'scalar')
        .map(row => [row.event[4].join('/'), row.event[6][1]]));
    assert.ok(scalarReads.size > 5);
    for (const [key, value] of scalarReads) {
        const altered = typeof value === 'string' ? value + '/forged'
            : typeof value === 'boolean' ? !value : typeof value === 'number' ? value + 1 : 'forged-null';
        const forged = structuredClone(results);
        for (const variant of ['C', 'M', 'S']) for (const row of forged[variant].raw_rows)
            if (row.event[0] === 'I' && row.event[1] === 'get' && row.event[2] === 'claim/context'
                && row.event[4].join('/') === key) row.event[6][1] = altered;
        assert.throws(() => compareSelectedEventDayOracle({ results: forged, expectation: prepared.oracle }), /core_claim_read/);
    }
    let effects = 0;
    const active = { results };
    Object.defineProperty(active, 'expectation', { enumerable: true, get() { effects++; return prepared.oracle; } });
    assert.throws(() => compareSelectedEventDayOracle(active), /shape/);
    assert.throws(() => compareSelectedEventDayOracle(new Proxy({ results, expectation: prepared.oracle },
        { ownKeys() { effects++; return []; } })), /shape/);
    assert.equal(effects, 0);
});
test('N02G:SELECTED-DAY-022 oracle family and CoreClaim projection are immutable authorship-only data', async () => {
    const c = await profileBuildFixture('C'), m = await profileBuildFixture('M', c.precommit),
        s = await profileBuildFixture('S', c.precommit);
    const { canonicalValue, digest } = require('../../../src/next/kernel/canonicalValue');
    const { projectClaimContext } = require('../../../src/next/provenance/claimContext');
    const { copyData } = require('../../../src/next/provenance/observationContract');
    const rows = Object.fromEntries(Object.entries({ C: c, M: m, S: s }).map(([v, f]) =>
        [v, api().selectedEventDayClaimInputs(f.expectation)]));
    assert.deepEqual(rows.C, rows.M); assert.deepEqual(rows.C, rows.S);
    // The representation boundary is compositional across every nested field,
    // including nominal projection's null-prototype records, not a field patch.
    const projected = structuredClone(copyData(projectClaimContext(planInput().claim, read(prefix + 'claim-contract.schema.json'))));
    assert.equal(canonicalValue(rows.C.core_claim), canonicalValue(projected.value));
    assert.equal(rows.C.core_claim_hash, 'sha256:' + digest(projected.value));
    function allPlain(value) {
        if (!value || typeof value !== 'object') return;
        assert.equal(Object.getPrototypeOf(value), Array.isArray(value) ? Array.prototype : Object.prototype);
        for (const item of Object.values(value)) allPlain(item);
    }
    allPlain(rows.C); assert.equal(Object.isFrozen(rows.C.core_claim), true);
    const sealing = await import('../../../scripts/agent/sealSelectedEventDayOracle.mjs');
    const expectations = { C: c.expectation, M: m.expectation, S: s.expectation };
    const sealed = sealing.sealSelectedEventDayOracle(expectations);
    assert.equal(sealed.core_claim_hash, rows.C.core_claim_hash);
    assert.throws(() => sealing.sealSelectedEventDayOracle({ ...expectations, expected_result: sealed.expected_result }), /input/);
    assert.throws(() => sealing.sealSelectedEventDayOracle({ ...expectations, M: structuredClone(m.expectation) }), /authority/);
    assert.throws(() => api().selectedEventDayClaimInputs(structuredClone(c.expectation)), /authority/);
});
test('N02G:SELECTED-DAY-023 captured adjudicator binds original expectations and ignores ambient comparator changes', async () => {
    const runtime = await import('../../../scripts/agent/buildSelectedEventDayProofExecution.mjs');
    assert.equal(typeof runtime.adjudicateSelectedEventDayGraph, 'function');
    const f = await negativeNativeFixture(), execution = runtime.buildSelectedEventDayProofExecution({ admission: f.admission });
    const results = {};
    for (const variant of ['C', 'M', 'S']) {
        const invocation = f.api.claimSelectedEventDayInvocation({ admission: f.admission, variant,
            scope: { executionId: 'captured-adjudicator', invocationId: 'captured/' + variant } });
        results[variant] = await runtime.executeSelectedEventDayGraph({ execution: execution.executionReceipt, invocation });
    }
    const modules = [require('../../../src/next/provenance/selectedEventDayCoreComparison'),
        require('../../../src/next/provenance/selectedEventDayCoverage'), require('../../../src/next/provenance/selectedEventDayOracle')];
    const names = ['compareSelectedEventDayCore', 'compareSelectedEventDayCoverage', 'compareSelectedEventDayOracle'];
    const saved = modules.map((m, i) => m[names[i]]);
    let ambientCalls = 0;
    try {
        modules.forEach((m, i) => { m[names[i]] = () => { ambientCalls++; throw new Error('ambient_comparator_called'); }; });
        const checked = runtime.adjudicateSelectedEventDayGraph({ execution: execution.executionReceipt, results });
        assert.equal(checked.exact_core_matched, true); assert.equal(checked.profile_coverage_complete, true);
        assert.equal(checked.oracle_verified, true); assert.equal(checked.core_claim_verified, true);
        assert.equal(checked.adjudicator_captured, true); assert.equal(checked.negative_qualification, true);
        assert.equal(checked.profile_witness_qualified, false); assert.equal(checked.semantic_mutation_credit, 0);
        assert.equal(checked.financial_release_eligible, false); assert.equal(checked.validation_tcb_complete, false);
        assert.equal(checked.observed_negative_component_root, execution.artifact_root);
        assert.equal(checked.observed_adjudicator_artifact_root, execution.adjudicator_artifact_root);
    } finally { modules.forEach((m, i) => { m[names[i]] = saved[i]; }); }
    assert.equal(ambientCalls, 0);
    assert.throws(() => runtime.adjudicateSelectedEventDayGraph({ execution: execution.executionReceipt,
        results: { ...results, M: structuredClone(results.M) } }), /authority/);
    assert.throws(() => runtime.adjudicateSelectedEventDayGraph({ execution: execution.executionReceipt,
        results, expectation: f.api.resolveSelectedEventDayAdmission(f.admission).oracle }), /input/);
    assert.throws(() => runtime.adjudicateSelectedEventDayGraph({ execution: structuredClone(execution.executionReceipt), results }), /authority/);
});

test('N02G:SELECTED-DAY-024 adjudication closure is finite hash-bound and accepts no caller source or authority', async () => {
    const runtime = await import('../../../scripts/agent/buildSelectedEventDayProofExecution.mjs');
    const f = await negativeNativeFixture(), execution = runtime.buildSelectedEventDayProofExecution({ admission: f.admission });
    const { createHash } = require('node:crypto');
    const hash = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
    const manifest = JSON.parse(execution.manifest);
    assert.equal(hash(execution.manifest), execution.artifact_root);
    assert.deepEqual(manifest.files.map(file => file.path),
        ['selected-day-adjudicator.js', 'selected-day-build-recipe.json', 'selected-day-compiler-binding.json', 'selected-day-compiler-recipe.json',
            'selected-day-compiler.js', 'selected-day-launcher.js', 'selected-day-proof-child.js',
            'selected-day-proof-host.js', 'selected-day-recipe.json', 'selected-day-ticket.json']);
    const leaf = manifest.files.find(file => file.path === 'selected-day-adjudicator.js');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const adjudicatorManifest = canonicalValue({ format: 'financasbot.provenance.artifact', version: 1, kind: 'tcb',
        entry: 'selected-day-adjudicator.js', files: [leaf] });
    assert.equal(hash(adjudicatorManifest), execution.adjudicator_artifact_root);
    const hashes = new Map(execution.adjudicator_source_hashes.map(row => [row.path, row.sha256]));
    assert.equal(hashes.size, execution.adjudicator_source_hashes.length); assert.equal(hashes.size, 15);
    const generated = 'provenance/selectedDayCapturedAdjudicationRecipe.js';
    assert.equal(hashes.has(generated), true); assert.equal(fs.existsSync(path.join(root, 'src/next', generated)), false);
    for (const [file, expected] of hashes) if (file !== generated)
        assert.equal(hash(fs.readFileSync(path.join(root, 'src/next', file))), expected);
    const natives = new Set();
    for (const edge of execution.adjudicator_import_bindings) {
        assert.equal(hashes.has(edge.source), true);
        if (edge.target.startsWith('node:')) natives.add(edge.target);
        else assert.equal(hashes.has(edge.target), true);
        assert.equal(edge.source.includes('scripts/'), false); assert.equal(edge.target.includes('scripts/'), false);
    }
    assert.deepEqual([...natives].sort(), ['node:crypto', 'node:process', 'node:util']);
    assert.equal(execution.validation_tcb_complete, false); assert.equal(execution.profile_witness_qualified, false);
    assert.equal(execution.financial_release_eligible, false);
    assert.throws(() => runtime.buildSelectedEventDayProofExecution({ admission: f.admission, source: 'return true' }), /input/);
    let effects = 0;
    const active = { execution: execution.executionReceipt };
    Object.defineProperty(active, 'results', { enumerable: true, get() { effects++; return {}; } });
    assert.throws(() => runtime.adjudicateSelectedEventDayGraph(active), /input/);
    assert.throws(() => runtime.adjudicateSelectedEventDayGraph(new Proxy({},
        { ownKeys() { effects++; return []; } })), /input/);
    assert.equal(effects, 0);
});

test('N02G:SELECTED-DAY-025 captured negative launcher verifies runtime before handles and retains private world slots', async () => {
    const runtime = await import('../../../scripts/agent/buildSelectedEventDayProofExecution.mjs');
    const f = await negativeNativeFixture(), execution = runtime.buildSelectedEventDayProofExecution({ admission: f.admission });
    assert.equal(execution.negative_launcher_captured, true);
    const results = {};
    for (const variant of ['C', 'M', 'S']) {
        const invocation = f.api.claimSelectedEventDayInvocation({ admission: f.admission, variant,
            scope: { executionId: 'negative-launcher', invocationId: 'launcher/' + variant } });
        results[variant] = await runtime.executeSelectedEventDayGraph({ execution: execution.executionReceipt, invocation });
        assert.equal(results[variant].native_runtime_verified_before_handles, true);
        assert.equal(results[variant].execution_ticket_bound_before_handles, true);
        assert.equal(results[variant].observed_execution_ticket_sha256, execution.execution_ticket_sha256);
        assert.equal(results[variant].observed_native_runtime_sha256, execution.native_runtime_candidate.node_binary_sha256);
        assert.equal(results[variant].financial_release_eligible, false);
    }
    const checked = runtime.adjudicateSelectedEventDayGraph({ execution: execution.executionReceipt, results });
    assert.equal(checked.oracle_verified, true); assert.equal(checked.negative_qualification, true);
    assert.equal(checked.receipt_created, false); assert.equal(checked.profile_witness_qualified, false);
    assert.equal(checked.validation_tcb_complete, false);
    assert.equal(checked.observed_negative_component_root, execution.artifact_root);
    for (const variant of ['C', 'M', 'S']) {
        const stripped = structuredClone(results[variant]);
        for (const key of ['negative_qualification', 'financial_release_eligible', 'observed_native_runtime_sha256']) delete stripped[key];
        assert.throws(() => runtime.adjudicateSelectedEventDayGraph({ execution: execution.executionReceipt,
            results: { ...results, [variant]: stripped } }), /authority/);
    }
    assert.equal(typeof execution.emitReceipt, 'undefined'); assert.equal(typeof execution.acceptParent, 'undefined');
});

test('N02G:SELECTED-DAY-026 negative bootstrap fails closed before handles and cannot enter normal financial launcher', async () => {
    const runtime = await import('../../../scripts/agent/buildSelectedEventDayProofExecution.mjs');
    const f = await negativeNativeFixture(), execution = runtime.buildSelectedEventDayProofExecution({ admission: f.admission });
    const candidate = execution.negative_bootstrap_candidate;
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const { createHash } = require('node:crypto');
    const hash = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
    const bootstrap = () => ({ freezeBytes: Buffer.from(candidate.freeze_source), expectedFreezeHash: candidate.expected_freeze_hash,
        tcbArtifact: { manifestBytes: Buffer.from(candidate.manifest),
            entries: candidate.entries.map(file => ({ path: file.path, bytes: Buffer.from(file.source) })) } });
    const native = require('../../../src/next/provenance/nativeRuntime');
    let spawns = 0;
    const launch = require('node:vm').runInThisContext(candidate.entries.find(file => file.path === 'selected-day-launcher.js').source)(name => {
        assert.ok(execution.launcher_native_externals.includes(name));
        if (name === 'node:fs') return native.nativeRuntimeFileCapability();
        if (name === 'node:child_process') return Object.freeze({ spawn() { spawns++; throw new Error('handle_opened'); } });
        return require(name);
    });
    const wrongRuntime = bootstrap(), freeze = JSON.parse(candidate.freeze_source);
    freeze.native_runtime.node_binary_sha256 = hash('not-this-executable');
    wrongRuntime.freezeBytes = Buffer.from(canonicalValue(freeze)); wrongRuntime.expectedFreezeHash = hash(wrongRuntime.freezeBytes);
    // A runtime identity different from the sealed ticket is rejected even
    // before binary verification, and still before any handle or spawn.
    assert.throws(() => launch(wrongRuntime), /selected_day_ticket_identity/); assert.equal(spawns, 0);
    const altered = bootstrap();
    altered.tcbArtifact.entries.find(file => file.path === 'selected-day-recipe.json').bytes[0] ^= 1;
    assert.throws(() => launch(altered), /artifact_/); assert.equal(spawns, 0);
    const alteredCompiler = bootstrap();
    alteredCompiler.tcbArtifact.entries.find(file => file.path === 'selected-day-compiler.js').bytes[0] ^= 1;
    assert.throws(() => launch(alteredCompiler), /artifact_/); assert.equal(spawns, 0);
    const normal = require('../../../src/next/provenance/capturedTcbLauncher');
    // The unmodified financial entry requires the positive captured inventory;
    // a synthetically provisioned negative root is rejected before host handles.
    assert.throws(() => normal.launchCapturedTcb(bootstrap()), /captured_tcb_inventory/);
    let effects = 0;
    const active = bootstrap(); Object.defineProperty(active, 'freezeBytes', { enumerable: true, get() { effects++; return Buffer.from(candidate.freeze_source); } });
    assert.throws(() => launch(active), /selected_day_launcher_input/); assert.equal(effects, 0); assert.equal(spawns, 0);
    const handles = launch(bootstrap());
    assert.deepEqual(Object.keys(handles).sort(), ['adjudicate', 'financial_acceptance', 'run', 'stage']);
    assert.equal(handles.financial_acceptance, false); assert.throws(() => handles.adjudicate(), /worlds/);
    assert.throws(() => handles.adjudicate({ results: {} }), /worlds/); assert.equal(spawns, 0);
    await assert.rejects(handles.run({ variant: 'Z', scope: { executionId: 'bad-slot', invocationId: 'bad-slot/0' }, mode: 'graph' }), /slot/);
    await assert.rejects(handles.run({ variant: 'C', scope: { executionId: 'bad-slot', invocationId: 'bad-slot/1' }, mode: 'graph' }), /poisoned/);
    assert.equal(spawns, 0);
});

test('N02G:SELECTED-DAY-027 admission uses one captured normal compiler and binds its exact bytes to the negative execution', async () => {
    const f = await negativeNativeFixture();
    assert.equal(f.admission.normal_compiler_captured, true);
    assert.equal(f.admission.captured_normal_compile_worlds, 3);
    const runtime = await import('../../../scripts/agent/buildSelectedEventDayProofExecution.mjs');
    const built = runtime.buildSelectedEventDayProofExecution({ admission: f.admission });
    assert.equal(built.compiler_artifact_root, f.admission.compiler_artifact_root);
    assert.ok(built.compiler_source_hashes.some(row => row.path === 'provenance/graphCompiler.js'));
    const files = built.negative_bootstrap_candidate.entries;
    assert.ok(files.some(file => file.path === 'selected-day-compiler.js'));
    const binding = JSON.parse(files.find(file => file.path === 'selected-day-compiler-binding.json').source);
    assert.equal(binding.compiler_artifact_root, built.compiler_artifact_root);
    assert.equal(binding.worlds.length, 3);
    const manifest = JSON.parse(binding.compiler_manifest);
    assert.equal(manifest.entry, 'selected-day-compiler.js');
    assert.deepEqual(manifest.files.map(row => row.path), manifest.files.map(row => row.path).sort());
    const { admitArtifact } = require('../../../src/next/provenance/artifactLoader');
    // Every input-order permutation of this two-leaf table has the same
    // admitted identity; executable entry is never inferred from array index.
    for (const inventory of [manifest.files, [...manifest.files].reverse()]) {
        const receipt = admitArtifact({ manifestBytes: Buffer.from(binding.compiler_manifest), expectedRoot: binding.compiler_artifact_root,
            entries: inventory.map(row => ({ path: row.path, bytes: Buffer.from(files.find(file => file.path === row.path).source) })) });
        assert.equal(receipt.observed_root, binding.compiler_artifact_root);
    }
    assert.deepEqual(binding.worlds.map(row => row.variant), ['C', 'M', 'S']);
    assert.equal(new Set(binding.worlds.map(row => row.package_root)).size, 2);
    const compiler = require('node:vm').runInThisContext(files.find(file => file.path === 'selected-day-compiler.js').source)(name => {
        if (name === 'node:fs' || name === 'node:child_process') return Object.freeze({});
        return require(name);
    });
    assert.deepEqual(Object.keys(compiler).sort(), ['admitPackage', 'compileAuthoringIR', 'compileSnapshotAccess']);
    assert.equal(built.profile_witness_qualified, false);
    assert.equal(f.admission.executable_ticket_complete, false);
});

test('N02G:SELECTED-DAY-028 captured compiler rejects copied seals and is independent of later ambient module edits', async () => {
    const f = { C: await profileBuildFixture('C') };
    f.M = await profileBuildFixture('M', f.C.precommit); f.S = await profileBuildFixture('S', f.C.precommit);
    const expectations = Object.fromEntries(['C', 'M', 'S'].map(v => [v, f[v].expectation]));
    const compilerApi = await import('../../../scripts/agent/captureSelectedEventDayCompiler.mjs');
    const captured = compilerApi.captureSelectedEventDayCompiler({ expectations });
    assert.throws(() => compilerApi.selectedEventDayCompilerBinding(captured), /incomplete/);
    assert.throws(() => compilerApi.captureSelectedEventDayCompiler({ expectations: structuredClone(expectations) }), /authority/);
    assert.throws(() => compilerApi.compileSelectedEventDayCapturedWorld({ capture: structuredClone(captured), expectation: expectations.C }), /authority/);
    const compiler = require('../../../src/next/provenance/graphCompiler');
    const original = compiler.compileAuthoringIR, originalAccess = compiler.compileSnapshotAccess;
    compiler.compileAuthoringIR = compiler.compileSnapshotAccess = () => { throw new Error('ambient_compiler_used'); };
    try {
        for (const variant of ['C', 'M', 'S']) {
            const out = compilerApi.compileSelectedEventDayCapturedWorld({ capture: captured, expectation: expectations[variant] });
            assert.equal(api().compareSelectedEventDayIr({ expectation: expectations[variant], ir: out.ir }).authorship_ir_conformance, true);
            assert.ok(out.access.projectProofTransport({ fact_key: 'F-06#2#1' }));
        }
    } finally { compiler.compileAuthoringIR = original; compiler.compileSnapshotAccess = originalAccess; }
    const binding = compilerApi.selectedEventDayCompilerBinding(captured);
    assert.equal(binding.normal_compile_worlds, 3); assert.equal(binding.independent_compiler_execution, false);
    assert.equal(binding.schemas.every(row => /^sha256:[a-f0-9]{64}$/.test(row.sha256)), true);
    assert.throws(() => compilerApi.compileSelectedEventDayCapturedWorld({ capture: captured, expectation: expectations.C }), /world/);
    let effects = 0;
    const active = { expectations }; Object.defineProperty(active, 'expectations', { enumerable: true, get() { effects++; return expectations; } });
    assert.throws(() => compilerApi.captureSelectedEventDayCompiler(active), /input/); assert.equal(effects, 0);
});

test('N02G:SELECTED-DAY-029 complete candidate ticket binds authored authority and captured execution closure before handles', async () => {
    const f = await negativeNativeFixture();
    const runtime = await import('../../../scripts/agent/buildSelectedEventDayProofExecution.mjs');
    const built = runtime.buildSelectedEventDayProofExecution({ admission: f.admission });
    assert.equal(built.execution_ticket_candidate_complete, true);
    const files = built.negative_bootstrap_candidate.entries;
    const ticket = JSON.parse(files.find(row => row.path === 'selected-day-ticket.json').source);
    assert.equal(ticket.compiler_artifact_root, built.compiler_artifact_root);
    assert.equal(ticket.authorship.precommit.candidate_id, witness.candidate_id);
    assert.equal(ticket.authorship.precommit.mutation_id, witness.mutation_id);
    assert.equal(ticket.authorship.precommit.quarantine_origin, 'negative_qualification');
    assert.equal(ticket.worlds.length, 3);
    assert.equal(ticket.executable_leaves.length, 4);
    assert.equal(ticket.executable_leaves.every(row => files.some(file => file.path === row.path)), true);
    assert.equal(ticket.profile_witness_qualified, false); assert.equal(ticket.semantic_mutation_credit, 0);
    assert.equal(built.validation_tcb_complete, false); assert.equal(built.financial_release_eligible, false);
});

test('N02G:SELECTED-DAY-030 ticket admission rejects cross-world plan closure and authority perturbations without handles', async () => {
    const f = await negativeNativeFixture();
    const runtime = await import('../../../scripts/agent/buildSelectedEventDayProofExecution.mjs');
    const built = runtime.buildSelectedEventDayProofExecution({ admission: f.admission });
    const candidate = built.negative_bootstrap_candidate, files = candidate.entries;
    const { admitArtifact } = require('../../../src/next/provenance/artifactLoader');
    const { admitSelectedEventDayExecutionTicket: admit } = require('../../../src/next/provenance/selectedEventDayExecutionTicket');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const { createHash } = require('node:crypto');
    const hash = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
    const source = name => files.find(row => row.path === name).source;
    const artifactReceipt = admitArtifact({ manifestBytes: Buffer.from(candidate.manifest), expectedRoot: built.artifact_root,
        entries: files.map(row => ({ path: row.path, bytes: Buffer.from(row.source) })) });
    const recipe = JSON.parse(source('selected-day-recipe.json'));
    const input = { source: source('selected-day-ticket.json'), expectedHash: recipe.ticket_sha256,
        packet: JSON.parse(recipe.packet_source), compiler: JSON.parse(source('selected-day-compiler-binding.json')),
        artifactReceipt, nativeRuntime: JSON.parse(candidate.freeze_source).native_runtime, recipe };
    assert.equal(admit(input).execution_ticket_candidate_complete, true);
    // Self-rehashing data is insufficient: every cross-binding must survive.
    for (const edit of [
        x => { x.authorship.patch.after.node = 'wrong_alias'; },
        x => { x.authorship.plan.fringe.M.pop(); },
        x => { x.authorship.precommit.selected_candidate_index++; },
        x => { x.authorship.worlds[0].authority.pop(); },
        x => { x.worlds.reverse(); },
        x => { x.worlds[1].ir_sha256 = hash('wrong_ir'); },
        x => { x.executable_leaves.pop(); },
        x => { x.executable_leaves[0].sha256 = hash('wrong_leaf'); },
        x => { x.native_runtime.node_binary_sha256 = hash('wrong_node'); },
        x => { x.build_recipe_sha256 = hash('wrong_build'); },
        x => { x.program_conformance.helper_sources.pop(); },
        x => { x.program_conformance.executable_absence.selected_view_consumers = 1; },
        x => { x.program_conformance.executable_absence.program_sha256 = hash('wrong_program'); },
        x => { x.program_conformance.executable_absence.selected_set = 'other_set'; },
        x => { x.program_conformance.executable_absence.executable_closure_absence_proved = false; },
        x => { x.program_conformance.executable_absence.analysis_contract_sha256 = hash('wrong_analysis'); },
        x => { x.semantic_mutation_credit = 1; },
        x => { x.financial_release_eligible = true; }
    ]) {
        const ticket = JSON.parse(input.source); edit(ticket);
        const changed = canonicalValue(ticket);
        assert.throws(() => admit({ ...input, source: changed, expectedHash: hash(changed) }), /selected_day_ticket_/);
    }
    assert.throws(() => admit({ ...input, artifactReceipt: structuredClone(artifactReceipt) }), /artifact_/);
    let effects = 0;
    const active = { ...input }; Object.defineProperty(active, 'source', { enumerable: true, get() { effects++; return input.source; } });
    assert.throws(() => admit(active), /selected_day_ticket_input/);
    assert.throws(() => admit(new Proxy(input, { ownKeys() { effects++; return []; } })), /selected_day_ticket_input/);
    assert.equal(effects, 0);
    assert.equal(built.executionReceipt.executable_ticket_complete, false);
    assert.equal(built.validation_tcb_complete, false); assert.equal(built.financial_release_eligible, false);
});

test('N02G:SELECTED-DAY-031 BUILD module inventory resolves transitive imports and rejects the complete dynamic-loader class', async () => {
    const recipeApi = await import('../../../scripts/agent/captureSelectedEventDayBuildRecipe.mjs');
    const recipe = recipeApi.captureSelectedEventDayBuildRecipe();
    assert.equal(recipe.module_inventory_complete, true);
    assert.equal(recipe.independent_BUILD_execution, false);
    assert.ok(recipe.sources.some(row => row.path === 'src/next/provenance/pathSemanticReference.js'));
    assert.ok(recipe.sources.some(row => row.path === 'src/next/provenance/templateReferences.js'));
    assert.ok(recipe.sources.some(row => row.path === 'node_modules/acorn/dist/acorn.js'));
    const paths = recipe.sources.map(row => row.path);
    assert.deepEqual(paths, [...new Set(paths)].sort());
    assert.equal(recipe.imports.every(row => row.target.startsWith('node:') || paths.includes(row.target)), true);
    assert.equal(recipeApi.assertCurrentSelectedEventDayBuildRecipe(recipe), recipe);
    assert.throws(() => recipeApi.assertCurrentSelectedEventDayBuildRecipe(structuredClone(recipe)), /selected_day_build_authority/);
    for (let index = 0; index < 24; index++) {
        const spec = './module' + index;
        const result = recipeApi.analyzeSelectedEventDayBuildModule(`const x=require(${JSON.stringify(spec)});module.exports=x;`);
        assert.deepEqual(result, [spec]);
        for (const source of [`const name=${JSON.stringify(spec)};require(name);`,
            `const alias=require;alias(${JSON.stringify(spec)});`, `import(${JSON.stringify(spec)});`,
            `require.resolve(${JSON.stringify(spec)});`, `require(${JSON.stringify(spec)},42);`])
            assert.throws(() => recipeApi.analyzeSelectedEventDayBuildModule(source), /selected_day_build_loader/);
    }
    let effects = 0;
    assert.throws(() => recipeApi.analyzeSelectedEventDayBuildModule(new Proxy({}, { get() { effects++; return ''; } })), /selected_day_build_source/);
    assert.equal(effects, 0);
});

test('N02G:SELECTED-DAY-032 BUILD inventory data checks every generated graph and does not confer execution authority', async () => {
    const recipeApi = await import('../../../scripts/agent/captureSelectedEventDayBuildRecipe.mjs');
    const { validateSelectedEventDayBuildRecipe: validate } = require('../../../src/next/provenance/selectedEventDayExecutionTicket');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const recipe = recipeApi.captureSelectedEventDayBuildRecipe();
    assert.equal(validate(canonicalValue(recipe)).module_inventory_complete, true);
    for (let length = 2; length < 26; length++) {
        const paths = Array.from({ length }, (_, index) => 'src/next/recipe' + String(index).padStart(2, '0') + '.js');
        const value = { schema_version: 1, boundary: recipe.boundary, entrypoints: [paths[0]],
            sources: paths.map(file => ({ path: file, sha256: 'sha256:' + 'a'.repeat(64) })),
            imports: paths.slice(0, -1).map((file, index) => ({ source: file, specifier: './recipe' + (index + 1), target: paths[index + 1] })),
            module_inventory_complete: true, independent_BUILD_execution: false };
        value.imports.sort((a, b) => canonicalValue(a) < canonicalValue(b) ? -1 : 1);
        assert.equal(validate(canonicalValue(value)).independent_BUILD_execution, false);
        for (let edge = 0; edge < length - 1; edge++) {
            const missing = structuredClone(value); missing.imports.splice(edge, 1);
            assert.throws(() => validate(canonicalValue(missing)), /selected_day_ticket_build/);
        }
        const outside = structuredClone(value); outside.imports[0].target = '../outside.js';
        assert.throws(() => validate(canonicalValue(outside)), /selected_day_ticket_build/);
        const duplicate = structuredClone(value); duplicate.sources.push(duplicate.sources[0]);
        assert.throws(() => validate(canonicalValue(duplicate)), /selected_day_ticket_build/);
        const falseClaim = structuredClone(value); falseClaim.independent_BUILD_execution = true;
        assert.throws(() => validate(canonicalValue(falseClaim)), /selected_day_ticket_build/);
    }
});

test('N02G:SELECTED-DAY-033 external executable analysis proves discarded selection views and local boolean sinks', async () => {
    const f = await negativeNativeFixture();
    const admitted = f.api.resolveSelectedEventDayAdmission(f.admission);
    const analysis = await import('../../../scripts/agent/analyzeSelectedEventDayExecutableClosure.mjs');
    const selectedSet = JSON.parse(admitted.packet.source).variants.C.plan.selected_set;
    const receipt = analysis.analyzeSelectedEventDayExecutableClosure({ source: admitted.proof.files[0].source, selectedSet });
    assert.equal(receipt.closed_guest_bundles, 4);
    assert.equal(receipt.discarded_selection_calls, 3);
    assert.equal(receipt.selected_view_consumers, 0);
    assert.equal(receipt.boolean_result_external_consumers, 0);
    assert.equal(receipt.executable_closure_absence_proved, true);
    assert.equal(receipt.profile_witness_qualified, false);
    assert.deepEqual(admitted.executableAbsence, receipt);
});

test('N02G:SELECTED-DAY-034 executable analysis rejects the capability escape and selection consumption class', async () => {
    const f = await negativeNativeFixture();
    const admitted = f.api.resolveSelectedEventDayAdmission(f.admission);
    const { analyzeSelectedEventDayExecutableClosure: analyze } = await import('../../../scripts/agent/analyzeSelectedEventDayExecutableClosure.mjs');
    const input = { source: admitted.proof.files[0].source, selectedSet: JSON.parse(admitted.packet.source).variants.C.plan.selected_set };
    const changes = [
        s => s.replace('operands.select(', 'const stolen=operands.select('),
        s => s.replace('operands.select(', 'return operands.select('),
        s => s.replace('operands.select(', 'use(operands.select(').replace('if(seen!==1)', ') ;if(seen!==1)'),
        s => s.replace('const rootOperands=operands;', 'const rootOperands=operands;const stolen=operands;'),
        s => s.replace('const rootOperands=operands;', 'const rootOperands=operands;consume(operands);'),
        s => s.replace('const rootOperands=operands;', 'const rootOperands=operands;operands.set(' + JSON.stringify(input.selectedSet) + ');'),
        s => s.replace('const rootOperands=operands;', 'const rootOperands=operands;const get=operands.set;'),
        s => s.replace('const rootOperands=operands;', 'const rootOperands=operands;rootOperands["set"](' + JSON.stringify(input.selectedSet) + ');'),
        s => s.replace('let all = true;\n', 'let all = true;consume(all);\n'),
        s => s.replace('let all = true;\n', 'let all = true;if(all)consume(1);\n'),
        s => s.replace('let all = true;\n', 'let all = true;const leak=()=>all;\n'),
        s => s.replace('const rootOperands=operands;', 'const rootOperands=operands;import("./extra.js");'),
        s => s.replace('const rootOperands=operands;', 'const rootOperands=operands;eval("consume(operands)");'),
        s => s.replace('const rootOperands=operands;', 'const rootOperands=operands;Function("return this")();'),
        s => s.replace('const factories = [function(require, module, exports) {', 'const factories = [function(require, module, exports) {consume(operands);')
    ];
    for (const [index, change] of changes.entries()) {
        const source = change(input.source); assert.notEqual(source, input.source);
        assert.throws(() => analyze({ ...input, source }), /selected_day_executable_/, 'mutation ' + index);
    }
    let effects = 0;
    const active = { ...input }; Object.defineProperty(active, 'source', { enumerable: true, get() { effects++; return input.source; } });
    assert.throws(() => analyze(active), /selected_day_executable_input/);
    assert.throws(() => analyze(new Proxy(input, { ownKeys() { effects++; return []; } })), /selected_day_executable_input/);
    assert.equal(effects, 0);
});

async function negativeNativeFixture() {
    const lowerer = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const contract = await import('../../../scripts/agent/selectedEventDayProgramContract.mjs');
    const capture = await import('../../../scripts/agent/buildSelectedEventDayDispatchCapsule.mjs');
    const admissionApi = await import('../../../scripts/agent/prepareSelectedEventDayAdmission.mjs');
    const f = { C: await profileBuildFixture('C') };
    f.M = await profileBuildFixture('M', f.C.precommit); f.S = await profileBuildFixture('S', f.C.precommit);
    const expectations = Object.fromEntries(['C', 'M', 'S'].map(v => [v, f[v].expectation]));
    const programme = contract.sealSelectedEventDayCommonProgramExpectation({ expectations });
    const leaseExpectations = Object.fromEntries(['C', 'M', 'S'].map(v => [v,
        api().sealSelectedEventDayLeaseExpectation({ expectation: expectations[v] })]));
    const family = api().selectedEventDayProgramFamily(expectations);
    const built = lowerer.buildSelectedEventDayCommonProofProgram(Object.fromEntries(['C', 'M', 'S'].map(v => [v,
        { proof: family[v].proof, derivation: family[v].derivation }])), f.C.phase, expectations);
    const programConformance = contract.verifySelectedEventDayProgram({ programExpectation: programme, source: built.source });
    const options = { expectations, leaseExpectations, programConformance };
    const capsule = capture.buildSelectedEventDayDispatchCapsule(options);
    const { admitArtifact } = require('../../../src/next/provenance/artifactLoader');
    const proofArtifactReceipt = admitArtifact({ manifestBytes: Buffer.from(built.manifest), expectedRoot: built.artifact_root,
        entries: [{ path: 'bundle.js', bytes: Buffer.from(built.source) },
            { path: built.profileInput.path, bytes: Buffer.from(built.profileInput.source) }] });
    const dispatchArtifactReceipt = admitArtifact({ manifestBytes: Buffer.from(capsule.manifest), expectedRoot: capsule.artifact_root,
        entries: [{ path: capsule.entry, bytes: Buffer.from(capsule.source) }] });
    return { api: admissionApi, admission: admissionApi.prepareSelectedEventDayAdmission({ ...options,
        proofArtifactReceipt, dispatchArtifactReceipt }) };
}
test('N02G:SELECTED-DAY-035 complete candidate executor composes fresh native worlds and retains both authorities without credit', async () => {
    const driver = await import('../../../scripts/agent/executeSelectedEventDayCandidate.mjs');
    const output = await driver.executeSelectedEventDayCandidate({ mutation_id: witness.mutation_id });
    assert.equal(output.mutation_id, witness.mutation_id);
    assert.equal(output.candidate_id, witness.candidate_id);
    assert.equal(output.normal_compile_worlds, 3);
    assert.equal(output.native_graph_worlds, 3);
    assert.deepEqual(output.worlds.map(row => row.variant), ['C', 'M', 'S']);
    assert.equal(new Set(output.worlds.map(row => row.invocation_id)).size, 3);
    assert.deepEqual(output.worlds.map(row => row.proof_satisfied), [true, false, true]);
    assert.equal(output.worlds.every(row => row.fringe_count === 4 && row.receipt_created === false), true);
    assert.equal(output.adjudication.exact_core_matched, true);
    assert.equal(output.adjudication.profile_coverage_complete, true);
    assert.equal(output.adjudication.oracle_verified, true);
    assert.deepEqual(output.adjudication.normal_diagnosis.M.observed_violations, ['period', 'trace']);
    assert.equal(output.adjudication.normal_diagnosis.M.phases_covered, false);
    assert.equal(output.adjudication.normal_diagnosis.C.phases_covered, true);
    assert.equal(output.adjudication.normal_diagnosis.S.phases_covered, true);
    assert.equal(output.measured_sources_unchanged, true);
    assert.equal(output.profile_witness_qualified, false);
    assert.equal(output.semantic_mutation_credit, 0);
    assert.equal(output.financial_release_eligible, false);
    assert.equal(output.ordinary_v2_witness_qualified, false);
    assert.equal(output.code_audit_required, true);
});

test('N02G:SELECTED-DAY-037 reviewed boundary admits an opaque preparation only against an independently supplied freeze before handles', async () => {
    const driver = await import('../../../scripts/agent/executeSelectedEventDayCandidate.mjs');
    const prepared = await driver.prepareSelectedEventDayCandidate({ mutation_id: witness.mutation_id });
    const boundary = driver.selectedEventDayCandidateBoundary(prepared);
    assert.equal(boundary.stage, 'selected_day_candidate_review_snapshot_only');
    assert.equal(boundary.financial_release_eligible, false);
    assert.equal(boundary.profile_witness_qualified, false);
    assert.throws(() => driver.selectedEventDayCandidateBoundary({ ...prepared }), /selected_day_candidate_authority/);
    const source = require('../../../src/next/kernel/canonicalValue').canonicalValue(structuredClone(boundary));
    const digest = value => 'sha256:' + require('node:crypto').createHash('sha256').update(value).digest('hex');
    const admit = (value, expected = digest(source)) => driver.admitSelectedEventDayReviewedCandidate({
        prepared, reviewBytes: Buffer.from(value), expectedReviewHash: expected
    });
    assert.throws(() => admit(source, 'sha256:' + '0'.repeat(64)), /selected_day_candidate_review_hash/);
    const leafPaths = value => value && typeof value === 'object'
        ? Object.keys(value).flatMap(key => leafPaths(value[key]).map(tail => [key, ...tail])) : [[]];
    const leaves = leafPaths(boundary);
    assert.ok(leaves.length > 300);
    // Every scalar leaf of the actual review snapshot, including every BUILD
    // path/hash, is perturbed independently and rehashed. This tests complete
    // byte binding rather than a whitelist of a few known root fields.
    for (const keys of leaves) {
        const changed = structuredClone(boundary);
        const parent = keys.slice(0, -1).reduce((value, key) => value[key], changed);
        const key = keys.at(-1), old = parent[key];
        parent[key] = typeof old === 'string' ? old + 'tampered' : typeof old === 'boolean' ? !old : old + 1;
        const text = require('../../../src/next/kernel/canonicalValue').canonicalValue(changed);
        assert.throws(() => admit(text, digest(text)), /selected_day_candidate_review_binding/);
    }
    for (const transform of [rows => rows.slice(1), rows => [...rows, rows[0]], rows => [...rows].reverse()]) {
        const changed = structuredClone(boundary); changed.build_sources = transform(changed.build_sources);
        const text = require('../../../src/next/kernel/canonicalValue').canonicalValue(changed);
        assert.throws(() => admit(text, digest(text)), /selected_day_candidate_review_binding/);
    }
    const artifact = driver.selectedEventDayCandidateArtifacts(prepared);
    assert.equal(artifact.stage, 'selected_day_review_artifact_bytes_only');
    const manifest = JSON.parse(boundary.manifest);
    assert.deepEqual(artifact.entries.map(row => ({ path: row.path, sha256: digest(row.source) })),
        manifest.files.map(row => ({ path: row.path, sha256: row.sha256 })));
    assert.equal(digest(boundary.manifest), boundary.negative_component_root);
    assert.throws(() => driver.selectedEventDayCandidateArtifacts({ ...prepared }), /selected_day_candidate_authority/);
    const reviewed = admit(source);
    assert.equal(reviewed.stage, 'selected_day_reviewed_boundary_bytes_only');
    assert.equal(reviewed.financial_release_eligible, false);
    await assert.rejects(driver.executeSelectedEventDayReviewedCandidate({ reviewed: { ...reviewed } }), /selected_day_candidate_authority/);
    // Trusted bootstrap supplied the digest for this construction test. This
    // does NOT claim an independent audit of these newly changed test bytes.
    const output = await driver.executeSelectedEventDayReviewedCandidate({ reviewed });
    assert.equal(output.reviewed_boundary_admitted_before_handles, true);
    assert.equal(output.review_snapshot_sha256, digest(source));
    assert.deepEqual(output.worlds.map(w => w.proof_satisfied), [true, false, true]);
    assert.equal(output.semantic_mutation_credit, 0);
    assert.equal(output.profile_witness_qualified, false);
    await assert.rejects(driver.executeSelectedEventDayReviewedCandidate({ reviewed }), /selected_day_candidate_reused/);
});

test('N02G:SELECTED-DAY-038 trusted reviewed bootstrap exposes only mutation ID and qualifies a fresh nonfinancial profile row once', async () => {
    const driver = await import('../../../scripts/agent/executeSelectedEventDayCandidate.mjs');
    const qualification = await import('../../../scripts/agent/selectedEventDayQualification.mjs');
    const prepared = await driver.prepareSelectedEventDayCandidate({ mutation_id: witness.mutation_id });
    const source = require('../../../src/next/kernel/canonicalValue').canonicalValue(
        structuredClone(driver.selectedEventDayCandidateBoundary(prepared)));
    const digest = 'sha256:' + require('node:crypto').createHash('sha256').update(source).digest('hex');
    const create = () => qualification.createSelectedEventDayQualification({
        reviewBytes: Buffer.from(source), expectedReviewHash: digest
    });
    assert.throws(() => qualification.createSelectedEventDayQualification({
        reviewBytes: Buffer.from(source), expectedReviewHash: 'sha256:' + '0'.repeat(64)
    }), /selected_day_qualification_review_hash/);
    let effects = 0;
    const active = {}; Object.defineProperty(active, 'reviewBytes', { enumerable: true, get() { effects++; return Buffer.from(source); } });
    active.expectedReviewHash = digest;
    assert.throws(() => qualification.createSelectedEventDayQualification(active), /selected_day_qualification_input/);
    for (const field of ['approved', 'expected', 'candidate', 'scope', 'outcomes', 'reviewBytes', 'expectedReviewHash']) {
        const instance = create();
        await assert.rejects(instance.execute({ mutation_id: witness.mutation_id, [field]: true }), /selected_day_qualification_input/);
        await assert.rejects(instance.execute({ mutation_id: witness.mutation_id }), /selected_day_qualification_reused/);
    }
    const instance = create();
    const guest = {}; Object.defineProperty(guest, 'mutation_id', { enumerable: true, get() { effects++; return witness.mutation_id; } });
    await assert.rejects(instance.execute(guest), /selected_day_qualification_input/);
    assert.equal(effects, 0);
    const supplied = Buffer.from(source);
    for (const name of ['length', 'constructor', 'valueOf']) Object.defineProperty(supplied, name, {
        get() { effects++; throw Error('active_bootstrap_buffer'); }
    });
    const nominal = qualification.createSelectedEventDayQualification({ reviewBytes: supplied, expectedReviewHash: digest });
    Uint8Array.prototype.fill.call(supplied, 0);
    const row = await nominal.execute({ mutation_id: witness.mutation_id });
    assert.equal(effects, 0);
    assert.equal(row.profile_witness_qualified, true);
    assert.equal(row.semantic_mutation_credit, 1);
    assert.equal(row.credit_scope, 'one_fresh_profile_invocation_not_a_consolidated_ledger');
    assert.equal(row.ordinary_v2_witness_qualified, false);
    assert.equal(row.financial_release_eligible, false);
    assert.equal(row.receipt_created, false);
    assert.equal(row.validated_parent_created, false);
    assert.deepEqual(row.normal_diagnosis.M.observed_violations, ['period', 'trace']);
    assert.equal(row.normal_diagnosis.M.phases_covered, false);
    assert.equal(row.review_snapshot_sha256, digest);
    await assert.rejects(nominal.execute({ mutation_id: witness.mutation_id }), /selected_day_qualification_reused/);
    // Synthetic trusted-bootstrap byte authority proves the protocol, not an
    // external review or operational credit for this as-yet unaudited delta.
});

test('N02G:SELECTED-DAY-039 review byte capture uses native typed-array slots without executing own getters or coercions', async () => {
    const driver = await import('../../../scripts/agent/executeSelectedEventDayCandidate.mjs');
    let effects = 0;
    const bytes = Buffer.from('canonical-review-bytes');
    for (const name of ['length', 'byteLength', 'buffer', 'byteOffset', 'constructor', 'valueOf']) {
        Object.defineProperty(bytes, name, { get() { effects++; throw Error('active_review_bytes'); } });
    }
    const captured = driver.captureSelectedEventDayReviewBytes(bytes);
    assert.equal(captured.toString(), 'canonical-review-bytes');
    Uint8Array.prototype.fill.call(bytes, 0); assert.equal(captured.toString(), 'canonical-review-bytes');
    assert.throws(() => driver.captureSelectedEventDayReviewBytes(new Proxy(bytes, {
        get() { effects++; throw Error('active_proxy'); }
    })), /selected_day_candidate_review_input/);
    assert.throws(() => driver.captureSelectedEventDayReviewBytes(Buffer.alloc(256 * 1024 + 1)), /selected_day_candidate_review_size/);
    assert.throws(() => driver.captureSelectedEventDayReviewBytes(Buffer.alloc(0)), /selected_day_candidate_review_size/);
    assert.equal(effects, 0);
});

test('N02G:SELECTED-DAY-036 candidate executor rejects caller outcomes and active inputs before BUILD or handles', async () => {
    const driver = await import('../../../scripts/agent/executeSelectedEventDayCandidate.mjs');
    for (const field of ['candidate_id', 'expected', 'ir', 'validator', 'code_audit', 'scope', 'actual']) {
        await assert.rejects(driver.executeSelectedEventDayCandidate({ mutation_id: witness.mutation_id, [field]: true }), /selected_day_candidate_input/);
    }
    let effects = 0;
    const active = {}; Object.defineProperty(active, 'mutation_id', { enumerable: true, get() { effects++; return witness.mutation_id; } });
    await assert.rejects(driver.executeSelectedEventDayCandidate(active), /selected_day_candidate_input/);
    await assert.rejects(driver.executeSelectedEventDayCandidate(new Proxy({}, { get() { effects++; }, ownKeys() { effects++; return []; } })), /selected_day_candidate_input/);
    await assert.rejects(driver.executeSelectedEventDayCandidate({ mutation_id: {
        [Symbol.toPrimitive]() { effects++; return witness.mutation_id; }
    } }), /selected_day_candidate_input/);
    await assert.rejects(driver.executeSelectedEventDayCandidate({ mutation_id: new Proxy({}, {
        get() { effects++; return () => witness.mutation_id; }
    }) }), /selected_day_candidate_input/);
    assert.equal(effects, 0);
});
let cached;
async function profileBuildFixture(variant, sharedPrecommit = null) {
    const f = await fixture();
    const { admittedDocuments, admitPackage } = require('../../../src/next/provenance/packageContract');
    const { createHash } = require('node:crypto');
    const docs = admittedDocuments(f.packageReceipt);
    const precommit = sharedPrecommit ?? api().prepareSelectedEventDayPrecommit({ packageReceipt: f.packageReceipt,
        inventoryCandidate: f.inventoryCandidate, mutation_id: f.mutation_id });
    let packageReceipt = f.packageReceipt;
    if (variant === 'M') {
        const entries = docs.map(d => {
            let bytes = Buffer.from(fs.readFileSync(path.join(root, d.path), 'utf8').replaceAll('\r\n', '\n'));
            if (d.path === prefix + 'graphs-v2.json') {
                const corpus = structuredClone(d.value);
                corpus.graphs.find(g => g.fact_key === 'F-06#2#1').predicates
                    .find(p => p.id === 'p0055_selected_period').args[0].field = structuredClone(witness.patch.after);
                bytes = Buffer.from(JSON.stringify(corpus));
            }
            return { path: d.path, bytes };
        });
        packageReceipt = admitPackage({ entries, authority: entries.map(e => ({ path: e.path,
            sha256: 'sha256:' + createHash('sha256').update(e.bytes).digest('hex') })) });
    }
    const expectation = api().sealSelectedEventDayIrExpectation({ precommit, variant, packageReceipt });
    const corpus = docs.find(d => d.path === prefix + 'graphs-v2.json').value;
    const { admitPhaseCompositionProfile } = require('../../../src/next/provenance/phaseCompositionProfile');
    const phase = admitPhaseCompositionProfile({ source: fs.readFileSync(path.join(root,
        prefix + 'phase-composition-profile-v1.json'), 'utf8').replaceAll('\r\n', '\n'),
        registry: docs.find(d => d.path === corpus.metric_evaluator_registry.path).value });
    return { ...f, packageReceipt, expectation, phase, precommit };
}
test('N02G:SELECTED-DAY-010 external dispatcher owns ordered sites operands and every raw position', async () => {
    const { createSelectedEventDayDispatcher } = require('../../../src/next/provenance/selectedEventDayDispatcher');
    const lowerer = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const contract = await import('../../../scripts/agent/selectedEventDayProgramContract.mjs');
    const fixtures = { C: await profileBuildFixture('C') };
    fixtures.M = await profileBuildFixture('M', fixtures.C.precommit);
    fixtures.S = await profileBuildFixture('S', fixtures.C.precommit);
    const expectations = Object.fromEntries(['C', 'M', 'S'].map(v => [v, fixtures[v].expectation]));
    // Seal all lease plans and the entire program before any M compiler.
    const programExpectation = contract.sealSelectedEventDayCommonProgramExpectation({ expectations });
    const leases = Object.fromEntries(['C', 'M', 'S'].map(v => [v,
        api().sealSelectedEventDayLeaseExpectation({ expectation: expectations[v] })]));
    const { compileAuthoringIR, compileSnapshotAccess } = require('../../../src/next/provenance/graphCompiler');
    const inputs = {}, accesses = {}, selector = { fact_key: 'F-06#2#1' };
    for (const v of ['C', 'M', 'S']) {
        const f = fixtures[v];
        api().compareSelectedEventDayIr({ expectation: expectations[v], ir: compileAuthoringIR(f.packageReceipt, f.validators) });
        accesses[v] = compileSnapshotAccess(f.packageReceipt, f.validators);
        inputs[v] = { derivation: accesses[v].projectDerivationProgram(selector, f.phase).input,
            proof: accesses[v].projectProofProgram(selector).input };
    }
    const built = lowerer.buildSelectedEventDayCommonProofProgram(inputs, fixtures.C.phase, expectations);
    contract.verifySelectedEventDayProgram({ programExpectation, source: built.source });
    const vm = require('node:vm');
    for (const v of ['C', 'M', 'S']) {
        const rows = [], raw = [];
        const dispatcher = createSelectedEventDayDispatcher({ leaseExpectation: leases[v],
            scope: { executionId: 'selected/day/test', invocationId: 'invocation/' + v }, emit: row => rows.push(row) });
        const proof = accesses[v].openProof(selector, event => { raw.push(event); dispatcher.observe(event); });
        const operands = { phase: 'proof', ...proof, ...dispatcher.guest,
            select: (...args) => dispatcher.select(() => proof.select(...args)) };
        dispatcher.measure(['M', 'proof_engine_artifact_root', built.artifact_root]);
        const result = vm.runInNewContext(`(${built.source})(operands)`, { operands }, { timeout: 5000 });
        const trace = dispatcher.finish(result);
        assert.equal(result, v !== 'M');
        assert.equal(trace.raw_event_count, raw.length + 1);
        assert.deepEqual(rows.map(r => r.sequence), rows.map((_, index) => index));
        assert.deepEqual(rows.filter(r => r.owner.kind === 'fringe').map(r => r.event), witness.proposed_plan.fringe_construction[v].map(r => r.tuple));
        assert.equal(trace.fringe_count, 4);
        assert.equal(trace.profile_witness_qualified, false);
        assert.equal(trace.measured_tcb_admission, false);
        assert.equal(rows[0].owner.kind, 'core');
        assert.throws(() => dispatcher.observe(raw[0]), /selected_day_dispatch_finished/);
        proof.assertHealthy(); proof.revoke();
    }
    assert.throws(() => createSelectedEventDayDispatcher({ leaseExpectation: structuredClone(leases.M),
        scope: { executionId: 'e', invocationId: 'i' }, emit() {} }), /authority/);
});

test('N02G:SELECTED-DAY-011 every fringe omission replay and active-scope forgery poisons dispatch', async () => {
    const { createSelectedEventDayDispatcher } = require('../../../src/next/provenance/selectedEventDayDispatcher');
    const f = await profileBuildFixture('M');
    const lease = api().sealSelectedEventDayLeaseExpectation({ expectation: f.expectation });
    const lowerer = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { compileSnapshotAccess } = require('../../../src/next/provenance/graphCompiler');
    const access = compileSnapshotAccess(f.packageReceipt, f.validators), selector = { fact_key: 'F-06#2#1' };
    const built = lowerer.buildSelectedEventDayPhaseProofProgram({
        derivation: access.projectDerivationProgram(selector, f.phase).input,
        proof: access.projectProofProgram(selector).input }, f.phase, f.expectation);
    const vm = require('node:vm');
    const attack = mutate => {
        let dispatcher;
        dispatcher = createSelectedEventDayDispatcher({ leaseExpectation: lease,
            scope: { executionId: 'attack', invocationId: 'attack/invocation' }, emit() {} });
        const proof = access.openProof(selector, event => mutate(event, dispatcher));
        const operands = { phase: 'proof', ...proof, ...dispatcher.guest,
            select: (...args) => dispatcher.select(() => proof.select(...args)) };
        assert.throws(() => { const result = vm.runInNewContext(`(${built.source})(operands)`, { operands }, { timeout: 5000 });
            dispatcher.finish(result); }, /selected_day_dispatch_|access_set_sink|access_set_predicate_threw|access_sink_failed/);
        assert.throws(() => dispatcher.finish(false), /selected_day_dispatch_failed/);
        proof.revoke();
    };
    // Generate the whole four-event class rather than repairing a known alias.
    for (const target of witness.proposed_plan.fringe_construction.M.map(r => r.tuple)) {
        for (const mode of ['omit', 'replay', 'alter']) {
            let visited = false;
            attack((event, dispatcher) => {
                const hit = !visited && JSON.stringify(event) === JSON.stringify(target);
                if (!hit) return dispatcher.observe(event);
                visited = true;
                if (mode === 'omit') return;
                if (mode === 'replay') { dispatcher.observe(event); return dispatcher.observe(event); }
                const altered = structuredClone(event);
                if (event[1] === 'get') altered[6][1] = '2042-06-08';
                else if (event[1] === 'select_member') altered[6][2] = !altered[6][2];
                else altered[6][1] = 'view_' + '0'.repeat(64);
                dispatcher.observe(altered);
            });
            assert.equal(visited, true);
        }
    }
    const options = { leaseExpectation: lease, scope: { executionId: 'e', invocationId: 'i' }, emit() {} };
    const d = createSelectedEventDayDispatcher(options);
    assert.throws(() => d.guest.dispatch(() => true), /selected_day_dispatch_site/);
    assert.throws(() => d.finish(false), /selected_day_dispatch_failed/);
    const operand = createSelectedEventDayDispatcher(options);
    assert.throws(() => operand.guest.operand(() => false), /selected_day_dispatch_operand/);
    attack((event, dispatcher) => {
        dispatcher.observe(event);
        if (event[1] === 'select_return') dispatcher.observe(['I', 'length', event[2], event[3],
            [event[6][1]], 'operand_selection', ['count', event[6].length - 2]]);
    });
    attack((event, dispatcher) => {
        dispatcher.observe(event);
        if (event[1] === 'select_start') dispatcher.measure(['M', 'proof_engine_artifact_root', built.artifact_root]);
    });
    assert.throws(() => createSelectedEventDayDispatcher({ ...options, variant: 'C' }), /selected_day_dispatch_input/);
    assert.throws(() => createSelectedEventDayDispatcher({ ...options, scope: { ...options.scope, phase: 'derivation' } }), /scope/);
    let effects = 0;
    const getter = Object.defineProperty({}, 'leaseExpectation', { enumerable: true, get() { effects++; return lease; } });
    assert.throws(() => createSelectedEventDayDispatcher(getter), /input/);
    assert.throws(() => createSelectedEventDayDispatcher(new Proxy(options,
        { getPrototypeOf() { effects++; return Object.prototype; } })), /input/);
    assert.equal(effects, 0);
});

test('N02G:SELECTED-DAY-012 common negative sidecar requires opaque program conformance and all presealed leases', async () => {
    const packet = await import('../../../scripts/agent/prepareSelectedEventDayPacket.mjs');
    const contract = await import('../../../scripts/agent/selectedEventDayProgramContract.mjs');
    const lowerer = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const fixtures = { C: await profileBuildFixture('C') };
    fixtures.M = await profileBuildFixture('M', fixtures.C.precommit);
    fixtures.S = await profileBuildFixture('S', fixtures.C.precommit);
    const expectations = Object.fromEntries(['C', 'M', 'S'].map(v => [v, fixtures[v].expectation]));
    const programExpectation = contract.sealSelectedEventDayCommonProgramExpectation({ expectations });
    const leases = Object.fromEntries(['C', 'M', 'S'].map(v => [v,
        api().sealSelectedEventDayLeaseExpectation({ expectation: expectations[v] })]));
    const { compileAuthoringIR, compileSnapshotAccess } = require('../../../src/next/provenance/graphCompiler');
    const inputs = {}, selector = { fact_key: 'F-06#2#1' };
    for (const v of ['C', 'M', 'S']) {
        const f = fixtures[v];
        api().compareSelectedEventDayIr({ expectation: expectations[v], ir: compileAuthoringIR(f.packageReceipt, f.validators) });
        const access = compileSnapshotAccess(f.packageReceipt, f.validators);
        inputs[v] = { derivation: access.projectDerivationProgram(selector, f.phase).input,
            proof: access.projectProofProgram(selector).input };
    }
    const built = lowerer.buildSelectedEventDayCommonProofProgram(inputs, fixtures.C.phase, expectations);
    const conformance = contract.verifySelectedEventDayProgram({ programExpectation, source: built.source });
    const prepared = packet.prepareSelectedEventDayPacket({ expectations, leaseExpectations: leases, programConformance: conformance });
    const { decodeSelectedEventDayPacket } = require('../../../src/next/provenance/selectedEventDayPacket');
    const decoded = decodeSelectedEventDayPacket(prepared.source);
    assert.equal(decoded.quarantine_origin, 'negative_qualification');
    assert.equal(decoded.program_sha256, conformance.program_sha256);
    assert.equal(decoded.variants.M.plan.fringe[0].tuple[6][1], '2042-06-07');
    assert.equal(prepared.executable_ticket_complete, false);
    assert.equal(prepared.profile_witness_qualified, false);
    const { canonicalValue, digest } = require('../../../src/next/kernel/canonicalValue');
    for (const change of [d => { d.variants.M.plan.queue[0].truth = true; },
        d => { d.variants.M.plan.fringe[0].operand = 1; },
        d => { d.variants.M.plan.fringe[2].tuple[6][1] = 'view_' + '0'.repeat(64); },
        d => { d.variants.M.plan.fringe[3].tuple[6][1] = '2042-06-08'; }]) {
        const data = JSON.parse(prepared.source); change(data);
        data.variants.M.plan_hash = 'sha256:' + digest(data.variants.M.plan);
        assert.throws(() => decodeSelectedEventDayPacket(canonicalValue(data)), /selected_day_packet_/);
    }
    for (const change of [raw => { raw.programConformance = structuredClone(conformance); },
        raw => { raw.leaseExpectations = { ...leases, S: leases.C }; },
        raw => { raw.expectations = { ...expectations, M: structuredClone(expectations.M) }; }]) {
        const raw = { expectations, leaseExpectations: leases, programConformance: conformance }; change(raw);
        assert.throws(() => packet.prepareSelectedEventDayPacket(raw), /selected_day_/);
    }
    const { validatePhaseArtifactInputs } = require('../../../src/next/provenance/phaseCompositionProfile');
    assert.throws(() => validatePhaseArtifactInputs({ kind: 'proof', entry: 'bundle.js', files: [
        { path: 'bundle.js', media_type: 'text/javascript' },
        { path: built.profileInput.path, media_type: 'application/json', observed_sha256: built.profileInput.sha256 },
        { path: prepared.path, media_type: 'application/json', source: prepared.source }] }), /artifact_inputs/);
});

test('N02G:SELECTED-DAY-013 captured dispatcher binds negative packet bytes without importing BUILD authority', async () => {
    const capture = await import('../../../scripts/agent/buildSelectedEventDayDispatchCapsule.mjs');
    const lowerer = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const contract = await import('../../../scripts/agent/selectedEventDayProgramContract.mjs');
    const f = { C: await profileBuildFixture('C') };
    f.M = await profileBuildFixture('M', f.C.precommit); f.S = await profileBuildFixture('S', f.C.precommit);
    const expectations = Object.fromEntries(['C', 'M', 'S'].map(v => [v, f[v].expectation]));
    const programme = contract.sealSelectedEventDayCommonProgramExpectation({ expectations });
    const leases = Object.fromEntries(['C', 'M', 'S'].map(v => [v,
        api().sealSelectedEventDayLeaseExpectation({ expectation: expectations[v] })]));
    const { compileAuthoringIR, compileSnapshotAccess } = require('../../../src/next/provenance/graphCompiler');
    const inputs = {}, accesses = {};
    for (const v of ['C', 'M', 'S']) {
        api().compareSelectedEventDayIr({ expectation: expectations[v], ir: compileAuthoringIR(f[v].packageReceipt, f[v].validators) });
        const access = accesses[v] = compileSnapshotAccess(f[v].packageReceipt, f[v].validators), selector = { fact_key: 'F-06#2#1' };
        inputs[v] = { derivation: access.projectDerivationProgram(selector, f[v].phase).input,
            proof: access.projectProofProgram(selector).input };
    }
    const built = lowerer.buildSelectedEventDayCommonProofProgram(inputs, f.C.phase, expectations);
    const conformance = contract.verifySelectedEventDayProgram({ programExpectation: programme, source: built.source });
    const capsule = capture.buildSelectedEventDayDispatchCapsule({ expectations, leaseExpectations: leases, programConformance: conformance });
    assert.equal(capsule.profile_witness_qualified, false);
    assert.equal(capsule.sourceHashes.some(r => /selectedEventDayProfile|pathMutationInventory|graphCompiler/.test(r.path)), false);
    assert.deepEqual(capsule.nativeExternals, ['node:crypto', 'node:util']);
    const { admitArtifact } = require('../../../src/next/provenance/artifactLoader');
    const receipt = admitArtifact({ manifestBytes: Buffer.from(capsule.manifest), expectedRoot: capsule.artifact_root,
        entries: [{ path: capsule.entry, bytes: Buffer.from(capsule.source) }] });
    assert.equal(receipt.observed_root, capsule.artifact_root);
    const factory = require('node:vm').runInThisContext(capsule.source)(name => {
        if (!capsule.nativeExternals.includes(name)) throw new Error('unexpected_native_import'); return require(name);
    });
    for (const v of ['C', 'M', 'S']) {
        const rows = [];
        const controller = factory({ variant: v, scope: { executionId: 'capture', invocationId: 'capture/' + v }, emit: row => rows.push(row) });
        assert.equal(controller.guest.selectedDayVariant(), v);
        const proof = accesses[v].openProof({ fact_key: 'F-06#2#1' }, event => controller.observe(event));
        const operands = { phase: 'proof', ...proof, ...controller.guest,
            select: (...args) => controller.select(() => proof.select(...args)) };
        const result = require('node:vm').runInNewContext(`(${built.source})(operands)`, { operands }, { timeout: 5000 });
        const trace = controller.finish(result);
        assert.equal(result, v !== 'M'); assert.equal(trace.fringe_count, 4);
        assert.deepEqual(rows.map(row => row.sequence), rows.map((_, index) => index));
        proof.assertHealthy(); proof.revoke();
    }
    assert.throws(() => factory({ variant: 'C', scope: { executionId: 'e', invocationId: 'i' }, emit() {}, packet: {} }), /selected_day_/);
    assert.throws(() => factory({ variant: 'positive', scope: { executionId: 'e', invocationId: 'i' }, emit() {} }), /selected_day_/);
    assert.throws(() => admitArtifact({ manifestBytes: Buffer.from(capsule.manifest), expectedRoot: capsule.artifact_root,
        entries: [{ path: capsule.entry, bytes: Buffer.from(capsule.source.replace('negative_qualification', 'positive_qualification')) }] }), /artifact_/);
});

test('N02G:SELECTED-DAY-009 common capsule retains one measurement identity without skipping either target site', async () => {
    const contract = await import('../../../scripts/agent/selectedEventDayProgramContract.mjs');
    const lowerer = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const fixtures = { C: await profileBuildFixture('C') };
    fixtures.M = await profileBuildFixture('M', fixtures.C.precommit);
    fixtures.S = await profileBuildFixture('S', fixtures.C.precommit);
    const expectations = Object.fromEntries(['C', 'M', 'S'].map(v => [v, fixtures[v].expectation]));
    const programExpectation = contract.sealSelectedEventDayCommonProgramExpectation({ expectations });
    assert.equal(programExpectation.common_program_identity, true);
    const { compileAuthoringIR, compileSnapshotAccess } = require('../../../src/next/provenance/graphCompiler');
    const inputs = {}, accesses = {}, selector = { fact_key: 'F-06#2#1' };
    for (const v of ['C', 'M', 'S']) {
        const f = fixtures[v];
        api().compareSelectedEventDayIr({ expectation: expectations[v], ir: compileAuthoringIR(f.packageReceipt, f.validators) });
        accesses[v] = compileSnapshotAccess(f.packageReceipt, f.validators);
        inputs[v] = { derivation: accesses[v].projectDerivationProgram(selector, f.phase).input,
            proof: accesses[v].projectProofProgram(selector).input };
    }
    const built = lowerer.buildSelectedEventDayCommonProofProgram(inputs, fixtures.C.phase, expectations);
    const checked = contract.verifySelectedEventDayProgram({ programExpectation, source: built.source });
    assert.equal(checked.whole_program_conformance, true);
    assert.equal(checked.profile_witness_qualified, false);
    const { admitArtifact } = require('../../../src/next/provenance/artifactLoader');
    const roots = ['C', 'M', 'S'].map(() => admitArtifact({ manifestBytes: Buffer.from(built.manifest),
        expectedRoot: built.artifact_root, entries: [{ path: 'bundle.js', bytes: Buffer.from(built.source) },
            { path: built.profileInput.path, bytes: Buffer.from(built.profileInput.source) }] }).observed_root);
    assert.equal(roots.every(root => root === built.artifact_root), true);
    assert.equal(new Set(roots).size, 1);
    const vm = require('node:vm');
    for (const v of ['C', 'M', 'S']) {
        const events = [], targetResults = [];
        const queue = [...inputs[v].proof.selections[0].cases[0].predicates,
            ...inputs[v].proof.predicates.map(p => p.id)];
        let active = null, index = 0, operandsSeen = 0;
        const proof = accesses[v].openProof(selector, e => events.push(e));
        const operands = { phase: 'proof', ...proof, selectedDayVariant: () => v, selectedDayOrigin: () => true,
            dispatch: callback => {
                assert.equal(active, null); active = queue[index++]; assert.ok(active);
                try { const satisfied = callback();
                    if (active === 'p0055_selected_period') targetResults.push(satisfied);
                    return satisfied;
                } finally { active = null; }
            }, operand: callback => { assert.equal(active, 'p0055_selected_period'); operandsSeen++; return callback(); } };
        assert.equal(vm.runInNewContext(`(${built.source})(operands)`, { operands }, { timeout: 5000 }), v !== 'M');
        assert.deepEqual(targetResults, [v !== 'M', v !== 'M']); assert.equal(operandsSeen, 4);
        assert.equal(index, queue.length);
        assert.deepEqual(events.filter(e => e[1] === 'select_member').map(e => e[6][2]), [v !== 'M']);
        proof.assertHealthy(); proof.revoke();
    }
    for (const source of [built.source, built.source.replace(/^\/\* selected-event-day[^\n]*\n/, '')])
        assert.throws(() => vm.runInNewContext(`(${source})(operands)`, { operands: { phase: 'proof' } }, { timeout: 5000 }), /selectedDayVariant/);
    assert.throws(() => contract.verifySelectedEventDayProgram({ programExpectation,
        source: built.source.replace(/^\/\* selected-event-day[^\n]*\n/, '') }), /source_identity/);
    assert.throws(() => lowerer.buildSelectedEventDayCommonProofProgram(inputs, fixtures.C.phase,
        { ...expectations, S: expectations.C }), /authority/);
    assert.throws(() => contract.sealSelectedEventDayCommonProgramExpectation({ expectations:
        { ...expectations, M: structuredClone(expectations.M) } }), /authority/);
    const other = await profileBuildFixture('S');
    assert.throws(() => contract.sealSelectedEventDayCommonProgramExpectation({ expectations:
        { ...expectations, S: other.expectation } }), /family_authority/);
});
test('N02G:SELECTED-DAY-008 dispatch candidate makes both real target calls and rejects ordinary operands', async () => {
    const contract = await import('../../../scripts/agent/selectedEventDayProgramContract.mjs');
    const lowerer = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    assert.equal(typeof contract.sealSelectedEventDayDispatchProgramExpectation, 'function');
    assert.equal(typeof lowerer.buildSelectedEventDayPhaseProofProgram, 'function');
    const { compileAuthoringIR, compileSnapshotAccess } = require('../../../src/next/provenance/graphCompiler');
    for (const variant of ['C', 'M', 'S']) {
        const f = await profileBuildFixture(variant);
        const programExpectation = contract.sealSelectedEventDayDispatchProgramExpectation({ expectation: f.expectation });
        api().compareSelectedEventDayIr({ expectation: f.expectation,
            ir: compileAuthoringIR(f.packageReceipt, f.validators) });
        const access = compileSnapshotAccess(f.packageReceipt, f.validators);
        const selector = { fact_key: 'F-06#2#1' };
        const input = { proof: access.projectProofProgram(selector).input,
            derivation: access.projectDerivationProgram(selector, f.phase).input };
        const built = lowerer.buildSelectedEventDayPhaseProofProgram(input, f.phase, f.expectation);
        assert.equal(contract.verifySelectedEventDayProgram({ programExpectation, source: built.source }).whole_program_conformance, true);
        assert.equal(built.negative_witness_only, true);
        assert.equal(built.profile_witness_qualified, false);
        assert.equal(built.financial_release_eligible, false);
        const events = [], results = [], queue = [
            ...input.proof.selections.flatMap(s => s.cases.flatMap(c => c.predicates.map(id => ({ role: 'guard', id })))),
            ...input.proof.predicates.map(p => ({ role: 'assertion', id: p.id }))
        ];
        let active = null, operandsSeen = 0;
        const proof = access.openProof(selector, event => events.push(event));
        const vm = require('node:vm');
        // Development ABI execution only, NOT a measured child, lease or ticket.
        const execute = operands => vm.runInNewContext(`(${built.source})(operands)`, { operands }, { timeout: 5000 });
        assert.throws(() => execute({ phase: 'proof', ...proof }), /selectedDayOrigin/);
        const controls = { phase: 'proof', ...proof,
            selectedDayOrigin: () => true,
            dispatch: callback => {
                assert.equal(active, null); active = queue[results.length]; assert.ok(active);
                const site = active, before = operandsSeen;
                try {
                    const satisfied = callback(); assert.equal(typeof satisfied, 'boolean');
                    assert.equal(operandsSeen - before, site.id === 'p0055_selected_period' ? 2 : 0);
                    results.push({ ...site, satisfied }); return satisfied;
                } finally { active = null; }
            },
            operand: callback => {
                assert.equal(active?.id, 'p0055_selected_period'); operandsSeen++;
                return callback();
            }
        };
        assert.equal(execute(controls), variant !== 'M');
        assert.equal(results.length, queue.length);
        assert.equal(operandsSeen, 4);
        assert.deepEqual(results.filter(r => r.id === 'p0055_selected_period').map(r => [r.role, r.satisfied]),
            [['guard', variant !== 'M'], ['assertion', variant !== 'M']]);
        assert.equal(results.filter(r => r.id !== 'p0055_selected_period').every(r => r.satisfied), true);
        assert.deepEqual(events.filter(e => e[1] === 'select_member').map(e => e[6][2]), [variant !== 'M']);
        proof.assertHealthy(); proof.revoke();
        const altered = structuredClone(input); altered.proof.predicates[0].operator.id = 'eq';
        assert.throws(() => lowerer.buildSelectedEventDayPhaseProofProgram(altered, f.phase, f.expectation), /selected_day_/);
    }
});
async function fixture() {
    if (cached) return cached;
    const { loadLocalAuthoringPackage } = await import('../../../scripts/agent/executeNextDomainInvariantMatrix.mjs');
    const { buildAdmittedSchemaValidators } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const { compileAuthoringIR } = require('../../../src/next/provenance/graphCompiler');
    const { enumeratePathInventoryCandidate } = require('../../../src/next/provenance/pathMutationInventory');
    const packageReceipt = loadLocalAuthoringPackage();
    const validators = buildAdmittedSchemaValidators(packageReceipt).validators;
    const ir = compileAuthoringIR(packageReceipt, validators);
    const inventoryCandidate = enumeratePathInventoryCandidate({ packageReceipt, ir });
    cached = { packageReceipt, inventoryCandidate, mutation_id: witness.mutation_id, ir, validators }; return cached;
}
test('N02G:SELECTED-DAY-004 private precommit selects the first independent discriminator and preserves all other graphs', async () => {
    const f = await fixture(); const input = { packageReceipt: f.packageReceipt,
        inventoryCandidate: f.inventoryCandidate, mutation_id: f.mutation_id };
    const receipt = api().prepareSelectedEventDayPrecommit(input);
    assert.equal(receipt.candidate_id, witness.candidate_id);
    assert.equal(receipt.normative_commit, 'f1a8cd4629b245009b9dd8fbb8dce83da77ba3d4');
    assert.equal(receipt.dp_execution, false); assert.equal(receipt.semantic_mutation_credit, 0);
    assert.equal(receipt.profile_witness_qualified, false);
    assert.equal(receipt.plan_hash.length, 71);
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const docs = admittedDocuments(input.packageReceipt);
    const corpus = docs.find(row => row.path === prefix + 'graphs-v2.json').value;
    const claims = docs.find(row => row.path === corpus.claim_contract.path).value.claims;
    const original = corpus.graphs;
    const mutant = structuredClone(original);
    mutant.find(g => g.fact_key === 'F-06#2#1').predicates.find(p => p.id === 'p0055_selected_period')
        .args[0].field = structuredClone(witness.patch.after);
    for (const variant of ['C', 'M', 'S'])
        assert.equal(api().assertSelectedEventDayPrecommit({ precommit: receipt, variant,
            graphs: variant === 'M' ? mutant : original, claims }).financial_release_eligible, false);
    assert.throws(() => api().assertSelectedEventDayPrecommit({ precommit: structuredClone(receipt), variant: 'M', graphs: mutant, claims }), /authority/);
    assert.throws(() => api().assertSelectedEventDayPrecommit({ precommit: receipt, variant: 'M', graphs: original, claims }), /world/);
    const changed = structuredClone(mutant); changed[0].predicates[0].op = 'not_eq';
    assert.throws(() => api().assertSelectedEventDayPrecommit({ precommit: receipt, variant: 'M', graphs: changed, claims }), /world/);
    assert.throws(() => api().prepareSelectedEventDayPrecommit({ ...input, candidate: witness.candidate_id }), /input/);
    let effects = 0;
    const active = [...mutant]; Object.defineProperty(active, 0, { enumerable: true, get() { effects++; return mutant[0]; } });
    assert.throws(() => api().assertSelectedEventDayPrecommit({ precommit: receipt, variant: 'M', graphs: active, claims }), /input/);
    assert.throws(() => api().assertSelectedEventDayPrecommit({ precommit: receipt, variant: 'M',
        graphs: new Proxy(mutant, { ownKeys() { effects++; return []; } }), claims }), /input/);
    assert.equal(effects, 0);
});
test('N02G:SELECTED-DAY-006 presealed whole IR rejects normalization omitted sites and collateral changes', async () => {
    const f = await fixture();
    const precommit = api().prepareSelectedEventDayPrecommit({ packageReceipt: f.packageReceipt,
        inventoryCandidate: f.inventoryCandidate, mutation_id: f.mutation_id });
    const { admittedDocuments, admitPackage } = require('../../../src/next/provenance/packageContract');
    const { createHash } = require('node:crypto');
    const docs = admittedDocuments(f.packageReceipt);
    const entries = docs.map(d => {
        let bytes = fs.readFileSync(path.join(root, d.path));
        bytes = Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'));
        if (d.path === prefix + 'graphs-v2.json') {
            const corpus = structuredClone(d.value);
            corpus.graphs.find(g => g.fact_key === 'F-06#2#1').predicates.find(p => p.id === 'p0055_selected_period')
                .args[0].field = structuredClone(witness.patch.after);
            bytes = Buffer.from(JSON.stringify(corpus));
        }
        return { path: d.path, bytes };
    });
    const packageReceipt = admitPackage({ entries, authority: entries.map(e => ({ path: e.path,
        sha256: 'sha256:' + createHash('sha256').update(e.bytes).digest('hex') })) });
    const expectation = api().sealSelectedEventDayIrExpectation({ precommit, variant: 'M', packageReceipt });
    assert.equal(expectation.compiler_admitted, false);
    // Complete NORMAL M compile occurs only AFTER the independent expectation.
    const { compileAuthoringIR } = require('../../../src/next/provenance/graphCompiler');
    const ir = compileAuthoringIR(packageReceipt, f.validators);
    const checked = api().compareSelectedEventDayIr({ expectation, ir });
    assert.equal(checked.authorship_ir_conformance, true);
    assert.equal(checked.executable_program_conformance, false);
    assert.equal(checked.profile_witness_qualified, false);
    const edits = [
        x => { x.graphs.find(g => g.fact_key === 'F-06#2#1').predicates.find(p => p.id === 'p0055_selected_period')
            .operands[0].expression.alias = 'evt_refund_b'; },
        x => { x.graphs.find(g => g.fact_key === 'F-06#2#1').selections = []; },
        x => { x.graphs[0].nodes = {}; },
        x => { x.graphs[0].claim.period = { kind: 'date', value: '2042-01-01' }; },
        x => { x.graphs[0].operands = []; },
        x => { x.graphs[0].required_state_checks = []; },
        x => { x.graphs[0].predicates[0].operands[0].type = { form: 'scalar', type: 'date' }; },
        x => { x.graphs.reverse(); },
        x => { x.order.reverse(); },
        x => { x.authority_refs.pop(); },
        x => { x.graphs.pop(); }
    ];
    for (const edit of edits) {
        const value = structuredClone(ir); edit(value);
        // Some graphs have no required state checks: pick an actual nonempty row.
        if (edit === edits[5]) value.graphs.find(g => g.required_state_checks.length).required_state_checks = [];
        assert.throws(() => api().compareSelectedEventDayIr({ expectation, ir: value }), /ir_conformance/);
    }
    assert.throws(() => api().compareSelectedEventDayIr({ expectation: structuredClone(expectation), ir }), /authority/);
    assert.throws(() => api().sealSelectedEventDayIrExpectation({ precommit, variant: 'M', packageReceipt: f.packageReceipt }), /world/);
});
