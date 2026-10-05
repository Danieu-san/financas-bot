'use strict';

const { fork, spawn } = require('node:child_process');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { types } = require('node:util');
const { canonicalValue, freezeDeep } = require('../kernel/canonicalValue');
const { copyData, identifier } = require('./observationContract');
const { artifactContents } = require('./artifactLoader');
const { resolveExecutionEvaluator, resolveExecutionOutput, executionContractHash } = require('./executionRegistry');
const { createCausalRecorder } = require('./causalRecorder');
const { copyTypedFunctionalResult } = require('./claimBinding');
const { validatePhaseArtifactInputs } = require('./phaseCompositionProfile');
const { verifiedNodeExecutable, verifiedNativeRuntimeHash } = require('./nativeRuntime');
const { validateClaimMonthArtifact } = require('./claimMonthIsolatedProfile');

const childPath = path.join(__dirname, 'executionHostChild.cjs');
const fail = code => new Error(`host_${code}`);
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

// Executes one admitted, self-contained metric bundle in a disposable
// process. This returns R and external observations only. It cannot issue a
// validated-parent receipt or claim acceptance: registry resolution,
// provenance/proof comparison and TCB/freeze roots are not supplied here.
function prepareAdmittedInvocation(raw, phase, qualification = null) {
    const proof = phase === 'proof';
    const artifactKind = proof ? 'proof' : 'metric';
    const measurementKind = proof ? 'proof_engine_artifact_root' : 'evaluator_artifact_root';
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) throw fail('config_invalid');
    const fields = Object.getOwnPropertyDescriptors(raw);
    const names = ['artifactReceipt', 'executionId', 'invocationId', 'bindings', 'timeoutMs'];
    const optional = ['nodeSets', 'operandAliases', 'directLinks', 'directGroups', 'parentGroups', 'childCapsuleReceipt', 'proofSets', 'proofSelections', 'proofParentEdges', 'proofParentMaterials', 'derivationBindings'];
    if (Reflect.ownKeys(fields).length !== names.length + optional.filter(name => Object.hasOwn(fields, name)).length
        || names.some(name =>
        !fields[name] || !Object.hasOwn(fields[name], 'value') || !fields[name].enumerable)) throw fail('config_invalid');
    if (optional.some(name => Object.hasOwn(fields, name)
        && (!Object.hasOwn(fields[name], 'value') || !fields[name].enumerable))) throw fail('config_invalid');
    const receipt = fields.artifactReceipt.value;
    let contents;
    try { contents = artifactContents(receipt); } catch { throw fail('artifact_invalid'); }
    if (contents.kind !== artifactKind) throw fail('artifact_unsupported');
    try {
        if (proof && qualification) validateClaimMonthArtifact(contents, qualification.source);
        else validatePhaseArtifactInputs(contents);
    } catch { throw fail('artifact_unsupported'); }
    let childCapsule;
    if (fields.childCapsuleReceipt) {
        try { childCapsule = artifactContents(fields.childCapsuleReceipt.value); }
        catch { throw fail('child_capsule_invalid'); }
        if (childCapsule.kind !== 'tcb' || childCapsule.entry !== 'bootstrap.js' || childCapsule.files.length !== 1
            || childCapsule.files[0].path !== 'bootstrap.js') throw fail('child_capsule_invalid');
    }
    let input;
    try { input = copyData({ executionId: fields.executionId.value, invocationId: fields.invocationId.value,
        bindings: fields.bindings.value, nodeSets: fields.nodeSets ? fields.nodeSets.value : [],
        operandAliases: fields.operandAliases ? fields.operandAliases.value : [],
        directLinks: fields.directLinks ? fields.directLinks.value : [],
        directGroups: fields.directGroups ? fields.directGroups.value : [],
        parentGroups: fields.parentGroups ? fields.parentGroups.value : [],
        proofSets: fields.proofSets ? fields.proofSets.value : [],
        proofSelections: fields.proofSelections ? fields.proofSelections.value : [],
        proofParentEdges: fields.proofParentEdges ? fields.proofParentEdges.value : [],
        proofParentMaterials: fields.proofParentMaterials ? fields.proofParentMaterials.value : [],
        derivationBindings: fields.derivationBindings ? fields.derivationBindings.value : null,
        timeoutMs: fields.timeoutMs.value }); }
    catch { throw fail('config_invalid'); }
    if (!identifier(input.executionId) || !identifier(input.invocationId)
        || !Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 100 || input.timeoutMs > 5000
        || !Array.isArray(input.bindings) || input.bindings.length > (proof ? 512 : 16)
        || input.bindings.some(binding => !binding || typeof binding !== 'object' || Array.isArray(binding)
            || !identifier(binding.role) || !identifier(binding.alias))
        || !Array.isArray(input.nodeSets) || input.nodeSets.length > 16
        || !Array.isArray(input.operandAliases) || input.operandAliases.length > 16
        || !Array.isArray(input.directLinks) || input.directLinks.length > (proof ? 8192 : 128)
        || !Array.isArray(input.directGroups) || input.directGroups.length > 16
        || !Array.isArray(input.parentGroups) || input.parentGroups.length > 16
        || !Array.isArray(input.proofSets) || input.proofSets.length > 512
        || !Array.isArray(input.proofSelections) || input.proofSelections.length > 512
        || !Array.isArray(input.proofParentEdges) || input.proofParentEdges.length > 16
        || !Array.isArray(input.proofParentMaterials) || input.proofParentMaterials.length !== input.proofParentEdges.length
        || !proof && (input.proofSets.length || input.proofSelections.length || input.proofParentEdges.length || input.proofParentMaterials.length)
        || !input.bindings.length && !input.directGroups.length) throw fail('config_invalid');
    // Derive the legacy one-binding-per-role projection only from admitted
    // data. Never call map/getters on caller-supplied bindings before copyData.
    const operandAliases = fields.operandAliases
        ? input.operandAliases : proof ? [] : input.bindings.map(binding => ({ role: binding.role, alias: binding.alias }));
    if (proof && (input.directGroups.length || input.nodeSets.length || input.parentGroups.length || operandAliases.length
        || input.derivationBindings !== null
        || input.bindings.some(binding => binding.role !== (binding.alias === 'claim/context' ? 'proof/context' : 'proof/snapshot'))))
        throw fail('proof_config_invalid');
    if (input.derivationBindings !== null) {
        const bindings = input.derivationBindings;
        if (proof || !bindings || Object.keys(bindings).sort().join(',') !== 'selections,sets'
            || !Array.isArray(bindings.sets) || bindings.sets.length > 512
            || !Array.isArray(bindings.selections) || bindings.selections.length > 512) throw fail('derivation_bindings_invalid');
        const sets = new Set(); const targets = new Set();
        for (const set of bindings.sets) {
            if (!set || Object.keys(set).sort().join(',') !== 'aliases,name'
                || typeof set.name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(set.name) || sets.has(set.name)
                || !Array.isArray(set.aliases) || set.aliases.length > 512 || new Set(set.aliases).size !== set.aliases.length
                || set.aliases.some(alias => !identifier(alias))) throw fail('derivation_bindings_invalid');
            sets.add(set.name);
        }
        for (const row of bindings.selections) {
            if (!row || Object.keys(row).sort().join(',') !== 'candidate_set,role,selected_set'
                || !identifier(row.role) || !sets.has(row.candidate_set)
                || typeof row.selected_set !== 'string' || !/^[a-z][a-z0-9_]*$/.test(row.selected_set)
                || sets.has(row.selected_set) || targets.has(row.selected_set)
                || input.nodeSets.filter(set => set.role === row.role
                    && JSON.stringify(set.roster) === JSON.stringify(bindings.sets.find(set => set.name === row.candidate_set).aliases)).length !== 1)
                throw fail('derivation_bindings_invalid');
            targets.add(row.selected_set);
        }
    }
    const proofSetNames = new Set();
    for (const set of input.proofSets) {
        if (!set || Object.keys(set).sort().join(',') !== 'name,roster'
            || typeof set.name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(set.name)
            || !identifier(`operand/proof/set/${set.name}`) || proofSetNames.has(set.name)
            || !Array.isArray(set.roster) || set.roster.length > 512 || new Set(set.roster).size !== set.roster.length
            || set.roster.some(alias => alias === 'claim/context' || !identifier(alias)
                || input.bindings.filter(binding => binding.alias === alias && binding.identity).length !== 1))
            throw fail('proof_set_invalid');
        proofSetNames.add(set.name);
    }
    const selectionTargets = new Set();
    for (const selection of input.proofSelections) {
        if (!selection || Object.keys(selection).sort().join(',') !== 'candidate_set,selected_set'
            || [selection.candidate_set, selection.selected_set].some(name => typeof name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(name))
            || !proofSetNames.has(selection.candidate_set) || proofSetNames.has(selection.selected_set)
            || selectionTargets.has(selection.selected_set)) throw fail('proof_selection_invalid');
        selectionTargets.add(selection.selected_set);
    }
    const parentTargets = new Set(); const parentEdges = new Set(); const parentRoles = new Set();
    for (const edge of input.proofParentEdges) {
        if (!edge || Object.keys(edge).sort().join(',') !== 'field,id,relation,source,target'
            || edge.source !== 'claim' || edge.relation !== 'derived_from'
            || !identifier(edge.id) || !identifier(edge.target) || typeof edge.field !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(edge.field)
            || parentTargets.has(edge.target) || parentEdges.has(edge.id) || parentRoles.has(edge.field)
            || input.bindings.filter(binding => binding.alias === edge.target && binding.identity?.kind === 'derived_claim').length !== 1)
            throw fail('proof_parent_invalid');
        parentTargets.add(edge.target); parentEdges.add(edge.id); parentRoles.add(edge.field);
    }
    const materialEdges = new Set();
    for (const row of input.proofParentMaterials) {
        if (!row || Object.keys(row).sort().join(',') !== 'descriptor,edge_id,expected_fingerprint'
            || !parentEdges.has(row.edge_id) || materialEdges.has(row.edge_id)
            || typeof row.expected_fingerprint !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(row.expected_fingerprint)
            || !row.descriptor || Object.keys(row.descriptor).sort().join(',') !== 'fields,kind,registry_version'
            || row.descriptor.kind !== 'derived_claim' || !Number.isSafeInteger(row.descriptor.registry_version)
            || row.descriptor.registry_version < 1) throw fail('proof_parent_invalid');
        materialEdges.add(row.edge_id);
    }
    if (input.directGroups.length && (input.bindings.length || operandAliases.length
        || input.directLinks.length)) throw fail('config_invalid');
    const roles = new Set();
    for (const operand of operandAliases) {
        if (!operand || Object.keys(operand).sort().join(',') !== 'alias,role'
            || !identifier(operand.alias) || !identifier(operand.role) || roles.has(operand.role)
            || input.bindings.filter(binding => binding.alias === operand.alias && binding.role === operand.role).length !== 1)
            throw fail('config_invalid');
        roles.add(operand.role);
    }
    for (const group of input.directGroups) {
        if (!group || Object.keys(group).sort().join(',') !== 'alias,bindings,links,role'
            || !identifier(group.role) || !identifier(group.alias) || roles.has(group.role)
            || !Array.isArray(group.bindings) || !group.bindings.length || group.bindings.length > 512
            || !Array.isArray(group.links) || group.links.length > 8192
            || group.bindings.filter(binding => binding?.alias === group.alias
                && binding.role === group.role).length !== 1
            || group.bindings.some(binding => binding?.role !== group.role)) throw fail('config_invalid');
        roles.add(group.role);
    }
    for (const set of input.nodeSets) {
        if (!set || Object.keys(set).sort().join(',') !== 'bindings,links,role,roster'
            || !identifier(set.role) || roles.has(set.role)
            || !Array.isArray(set.bindings) || !Array.isArray(set.links) || !Array.isArray(set.roster)) throw fail('config_invalid');
        roles.add(set.role);
    }
    for (const group of input.parentGroups) {
        if (!group || Object.keys(group).sort().join(',') !== 'alias,bindings,edgeId,edges,role'
            || !identifier(group.role) || !identifier(group.alias) || !identifier(group.edgeId)
            || roles.has(group.role) || !Array.isArray(group.bindings) || group.bindings.length !== 1
            || !Array.isArray(group.edges) || group.edges.length !== 1
            || group.edges[0]?.id !== group.edgeId || group.edges[0]?.field !== group.role
            || group.edges[0]?.target !== group.alias || group.bindings[0]?.alias !== group.alias
            || group.bindings[0]?.role !== group.role) throw fail('config_invalid');
        roles.add(group.role);
    }
    const manifest = canonicalValue({ format: 'financasbot.provenance.artifact', version: 1,
        kind: contents.kind, entry: contents.entry,
        files: contents.files.map(file => ({ path: file.path, media_type: file.media_type,
            sha256: file.observed_sha256 })) });
    if (digest(manifest) !== receipt.observed_root) throw fail('artifact_mismatch');
    return { input, receipt, contents, manifest, childCapsule, fields, operandAliases, measurementKind, proof,
        qualificationSource: proof && qualification ? qualification.source : null };
}

function invocationMessage(prepared, phase) {
    const { input, receipt, manifest, contents, operandAliases } = prepared;
    return { kind: 'run', phase, expectedRoot: receipt.observed_root, manifest,
        source: contents.files[0].source, profileSource: contents.files.length >= 2 ? contents.files[1].source : null,
        bindings: input.bindings, operandAliases,
        directLinks: input.directLinks, directGroups: input.directGroups,
        parentGroups: input.parentGroups, proofSets: input.proofSets,
        proofSelections: input.proofSelections, proofParentEdges: input.proofParentEdges,
        proofParentMaterials: input.proofParentMaterials, nodeSets: input.nodeSets,
        derivationBindings: input.derivationBindings, qualificationSource: prepared.qualificationSource };
}

async function runAdmittedInvocation(raw, phase) {
    const prepared = prepareAdmittedInvocation(raw, phase);
    const { input, receipt, childCapsule, fields, measurementKind, proof } = prepared;
    if (input.derivationBindings !== null) throw fail('derivation_requires_graph');
    const recorder = createCausalRecorder({ executionId: input.executionId, maxEvents: 10000 });
    const scope = recorder.open({ invocationId: input.invocationId, phase });
    return new Promise((resolve, reject) => {
        // Node parses the already captured capsule from stdin; no project or
        // SES pathname is opened again. Native runtime remains external. This
        // child-only root is NOT the complete validation_tcb_root or a freeze.
        const child = childCapsule ? spawn(process.execPath,
            ['--max-old-space-size=64', '-', '--run-admitted-invocation'], {
                env: {}, windowsHide: true,
                stdio: ['pipe', 'pipe', 'pipe', 'ipc']
            }) : fork(childPath, ['--run-admitted-invocation'], {
            env: {}, cwd: __dirname, execArgv: ['--max-old-space-size=64'],
            windowsHide: true, silent: true
        });
        let ready = false; let measured = false; let result; let error; let deadline;
        const startup = setTimeout(() => stop('startup_timeout'), 15000);
        function stop(code) {
            if (error) return;
            error = fail(code);
            child.kill();
        }
        for (const stream of [child.stdout, child.stderr]) stream.on('data', () => stop('output_forbidden'));
        child.on('error', () => stop('process_error'));
        if (childCapsule) {
            child.stdin.on('error', () => stop('send_failed'));
            child.stdin.end(childCapsule.files[0].source, 'utf8');
        }
        child.on('message', message => {
            if (error) return;
            if (!message || typeof message !== 'object' || Array.isArray(message)) { stop('protocol'); return; }
            const keys = Object.keys(message).sort().join(',');
            if (ready && result === undefined && message.kind === 'failure' && keys === 'kind,stage'
                && ['admission', 'operands', 'compartment', 'evaluation', 'result'].includes(message.stage)) {
                stop('child_' + message.stage); return;
            }
            if (message.kind === 'ready' && keys === 'kind' && !ready) {
                ready = true; clearTimeout(startup);
                deadline = setTimeout(() => stop('timeout'), input.timeoutMs);
                child.send(invocationMessage(prepared, phase), sendError => {
                    if (sendError) stop('send_failed');
                });
                return;
            }
            if (!ready || result !== undefined) { stop('protocol'); return; }
            if (message.kind === 'measurement' && keys === 'event,kind' && !measured) {
                if (JSON.stringify(message.event) !== JSON.stringify(['M', measurementKind,
                    receipt.observed_root])) { stop('measurement_invalid'); return; }
                try { scope.measure(message.event); measured = true; } catch { stop('measurement_invalid'); }
                return;
            }
            if (message.kind === 'observation' && keys === 'event,kind' && measured) {
                try { scope.observe(message.event); } catch { stop('observation_invalid'); }
                return;
            }
            if (message.kind === 'result' && keys === 'kind,value' && measured) {
                try {
                    if (proof) {
                        if (typeof message.value !== 'boolean') throw fail('proof_result_invalid');
                        result = message.value;
                    } else result = copyTypedFunctionalResult(message.value);
                }
                catch { stop('functional_result_invalid'); }
                return;
            }
            stop('protocol');
        });
        child.on('close', code => {
            clearTimeout(startup); clearTimeout(deadline);
            if (error) { reject(error); return; }
            if (code !== 0 || !ready || !measured || result === undefined) {
                reject(fail('incomplete_exit')); return;
            }
            try {
                scope.seal();
                const trace = recorder.finish();
                resolve(Object.freeze({ stage: proof ? 'isolated_proof_observation_only' : 'isolated_metric_observation_only', graph_accepted: false,
                    ...(childCapsule ? { observed_child_capsule_root: fields.childCapsuleReceipt.value.observed_root } : {}),
                    observed_artifact_root: receipt.observed_root,
                    ...(proof ? { proof_satisfied: result } : { functional_result: result }), trace }));
            } catch { reject(fail('recorder_invalid')); }
        });
    });
}

function runAdmittedMetric(raw) { return runAdmittedInvocation(raw, 'derivation'); }
function runAdmittedProof(raw) { return runAdmittedInvocation(raw, 'proof'); }

// One disposable process, two fresh guest compartments and one external
// recorder. Neither phase result becomes an observation receipt until both
// phases and the child have completed cleanly. This is still not financial
// acceptance or a complete validation-TCB/freeze attestation.
async function runAdmittedGraph(raw) { return runAdmittedGraphInternal(raw); }
const usedQualificationRoots = new WeakSet();
async function runClaimMonthQualifiedGraph(raw, receipt) {
    const { resolveClaimMonthIsolatedProof } = require('./graphCompiler');
    const qualification = resolveClaimMonthIsolatedProof(receipt);
    if (usedQualificationRoots.has(receipt)) throw fail('qualification_reused');
    usedQualificationRoots.add(receipt);
    return runAdmittedGraphInternal(raw, qualification);
}
async function runAdmittedGraphInternal(raw, qualification = null) {
    const required = ['executionId', 'invocationId', 'timeoutMs', 'childCapsuleReceipt', 'derivation', 'proof'];
    const plain = value => value && typeof value === 'object' && !Array.isArray(value)
        && !types.isProxy(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
    if (!plain(raw)) throw fail('graph_config_invalid');
    const fields = Object.getOwnPropertyDescriptors(raw);
    const optional = ['nativeRuntimeReceipt', 'tcbArtifactReceipt', 'evaluatorContractReceipt'];
    if (Reflect.ownKeys(fields).length !== required.length + optional.filter(name => Object.hasOwn(fields, name)).length
        || required.some(name => !fields[name]?.enumerable || !Object.hasOwn(fields[name], 'value'))
        || optional.some(name => Object.hasOwn(fields, name)
            && (!fields[name].enumerable || !Object.hasOwn(fields[name], 'value')))) throw fail('graph_config_invalid');
    const phases = ['derivation', 'proof'];
    const phaseNames = ['artifactReceipt', 'bindings', 'nodeSets', 'operandAliases', 'directLinks',
        'directGroups', 'parentGroups', 'proofSets', 'proofSelections', 'proofParentEdges', 'proofParentMaterials', 'derivationBindings'];
    const prepared = phases.map(phase => {
        const value = fields[phase].value;
        if (!plain(value)) throw fail('graph_config_invalid');
        const d = Object.getOwnPropertyDescriptors(value);
        if (Reflect.ownKeys(d).some(name => typeof name !== 'string' || !phaseNames.includes(name)
            || !d[name].enumerable || !Object.hasOwn(d[name], 'value'))
            || !Object.hasOwn(d, 'artifactReceipt') || !Object.hasOwn(d, 'bindings')) throw fail('graph_config_invalid');
        return prepareAdmittedInvocation({ ...Object.fromEntries(Object.keys(d).map(name => [name, d[name].value])),
            ...Object.fromEntries(required.slice(0, 4).map(name => [name, fields[name].value])) }, phase, qualification);
    });
    if (qualification) {
        if (prepared[1].receipt !== qualification.artifactReceipt) throw fail('qualification_artifact');
        if (qualification.frozenBaseline) {
            const baseline = qualification.frozenBaseline;
            if (!fields.tcbArtifactReceipt || !fields.nativeRuntimeReceipt || !fields.evaluatorContractReceipt)
                throw fail('qualification_frozen_authority');
            artifactContents(fields.tcbArtifactReceipt.value);
            if (fields.tcbArtifactReceipt.value.observed_root !== baseline.freeze.validation_tcb_root
                || fields.childCapsuleReceipt.value.observed_root !== baseline.freeze.child_capsule_root
                || verifiedNativeRuntimeHash(fields.nativeRuntimeReceipt.value) !== baseline.freeze.native_runtime.node_binary_sha256
                || prepared[0].receipt.observed_root !== baseline.evaluatorRoot
                || executionContractHash(fields.evaluatorContractReceipt.value) !== baseline.contractHash)
                throw fail('qualification_frozen_root');
        }
        const selector = { fact_key: qualification.data.fact_key };
        const expectedP = qualification.access.projectProofTransport(selector).config;
        const expectedD = qualification.access.projectMetricTransport(selector);
        for (const [name, value] of Object.entries(expectedP)) if (canonicalValue(JSON.parse(JSON.stringify(prepared[1].input[name])))
            !== canonicalValue(JSON.parse(JSON.stringify(value)))) throw fail('qualification_inputs');
        for (const name of ['directGroups', 'nodeSets', 'parentGroups']) if (canonicalValue(JSON.parse(JSON.stringify(prepared[0].input[name])))
            !== canonicalValue(JSON.parse(JSON.stringify(expectedD[name])))) throw fail('qualification_inputs');
        if (canonicalValue(JSON.parse(JSON.stringify(prepared[0].input.derivationBindings)))
            !== canonicalValue(JSON.parse(JSON.stringify(qualification.access.projectDerivationBindings(selector))))) throw fail('qualification_inputs');
    }
    const { input, childCapsule } = prepared[0];
    if (!childCapsule) throw fail('child_capsule_invalid');
    let measuredTcbRoot; let measuredContractHash;
    if (fields.tcbArtifactReceipt || fields.evaluatorContractReceipt) {
        if (!fields.tcbArtifactReceipt || !fields.evaluatorContractReceipt || !fields.nativeRuntimeReceipt)
            throw fail('measured_authority_incomplete');
        const tcb = artifactContents(fields.tcbArtifactReceipt.value);
        if (tcb.kind !== 'tcb' || tcb.entry !== 'launcher-bootstrap.js'
            || tcb.files.map(row => row.path).join(',') !== 'child-bootstrap.js,host-bootstrap.js,launcher-bootstrap.js,recipe.json')
            throw fail('tcb_invalid');
        measuredTcbRoot = fields.tcbArtifactReceipt.value.observed_root;
        measuredContractHash = executionContractHash(fields.evaluatorContractReceipt.value);
    }
    // Diagnostic calls may omit this receipt. The future private accepting
    // host must require it; omission never grants financial acceptance.
    const executable = Object.hasOwn(fields, 'nativeRuntimeReceipt')
        ? verifiedNodeExecutable(fields.nativeRuntimeReceipt.value) : process.execPath;
    const recorder = createCausalRecorder({ executionId: input.executionId, maxEvents: 20000 });
    return new Promise((resolve, reject) => {
        const child = spawn(executable, ['--max-old-space-size=64', '-', qualification ? '--run-qualified-graph' : '--run-admitted-graph'], {
            env: {}, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe', 'ipc']
        });
        let ready = false; let index = 0; let scope; let measured = false;
        let complete = false; let error; let deadline;
        const measurementEvents = prepared.map((row, phase) => [
            ['M', row.measurementKind, row.receipt.observed_root],
            ...(phase === 0 && row.input.derivationBindings !== null
                ? [['M', 'proof_engine_artifact_root', prepared[1].receipt.observed_root]] : [])
        ]);
        const results = [];
        const proofSites = []; const proofReads = []; const fringe = [];
        let activeSite = null;
        const startup = setTimeout(() => stop('startup_timeout'), 15000);
        function stop(code) { if (!error) {
            error = fail(code);
            if (code === 'timeout') error.diagnostic = Object.freeze({ phase: phases[index] ?? 'completed',
                completed_phases: results.length, proof_sites_completed: proofSites.length });
            child.kill();
        } }
        for (const stream of [child.stdout, child.stderr]) stream.on('data', () => stop('output_forbidden'));
        child.on('error', () => stop('process_error'));
        child.stdin.on('error', () => stop('send_failed'));
        child.stdin.end(childCapsule.files[0].source, 'utf8');
        child.on('message', message => {
            if (error) return;
            if (!message || typeof message !== 'object' || Array.isArray(message)) { stop('protocol'); return; }
            const keys = Object.keys(message).sort().join(',');
            if (ready && !complete && message.kind === 'failure' && keys === 'kind,stage'
                && ['admission', 'operands', 'compartment', 'evaluation', 'result'].includes(message.stage)) {
                stop('child_' + message.stage); return;
            }
            if (!ready && message.kind === 'ready' && keys === 'kind') {
                ready = true; clearTimeout(startup);
                deadline = setTimeout(() => stop('timeout'), input.timeoutMs);
                child.send({ kind: 'run_graph', derivation: invocationMessage(prepared[0], 'derivation'),
                    proof: invocationMessage(prepared[1], 'proof') }, e => { if (e) stop('send_failed'); });
                return;
            }
            if (!ready || complete) { stop('protocol'); return; }
            if (message.kind === 'phase_start' && keys === 'kind,phase' && !scope && index < 2
                && message.phase === phases[index]) {
                try {
                    scope = recorder.open({ invocationId: input.invocationId, phase: phases[index] }); measured = 0;
                    if (measuredTcbRoot) scope.measure(['M', 'validation_tcb_root', measuredTcbRoot]);
                    if (index === 0 && measuredContractHash) scope.measure(['M', 'evaluator_contract_hash', measuredContractHash]);
                }
                catch { stop('recorder_invalid'); }
                return;
            }
            if (message.kind === 'measurement' && keys === 'event,kind' && scope && measured < measurementEvents[index].length) {
                if (JSON.stringify(message.event) !== JSON.stringify(measurementEvents[index][measured])) { stop('measurement_invalid'); return; }
                try { scope.measure(message.event); measured++; } catch { stop('measurement_invalid'); }
                return;
            }
            if (message.kind === 'observation' && keys === 'event,kind' && scope && measured === measurementEvents[index].length) {
                try {
                    scope.observe(message.event);
                    if (qualification && index === 1) proofReads.push({ origin: 'original', phase: 'proof', site: activeSite,
                        event: structuredClone(copyData(message.event)) });
                } catch { stop('observation_invalid'); }
                return;
            }
            if (qualification && index === 1 && scope && measured === measurementEvents[index].length) {
                if (message.kind === 'proof_site_start' && keys === 'kind,site' && activeSite === null
                    && message.site === qualification.data.predicate_ids[proofSites.length]) { activeSite = message.site; return; }
                if (message.kind === 'proof_site_result' && keys === 'kind,satisfied,site' && activeSite !== null
                    && message.site === activeSite && typeof message.satisfied === 'boolean') {
                    proofSites.push({ site: activeSite, satisfied: message.satisfied }); activeSite = null; return;
                }
                if (message.kind === 'qualification_observation' && keys === 'event,kind' && qualification.data.variant === 'M'
                    && activeSite === qualification.data.predicate_id) {
                    try {
                        const event = structuredClone(copyData(message.event));
                        if (event[2] !== 'qualification/context' || event[3] !== `proof/qualification/${activeSite}`
                            || event[4][0] !== 'qualification') throw fail('qualification_observation');
                        scope.observe(event);
                        const row = { origin: 'qualification', phase: 'proof', site: activeSite, event };
                        fringe.push(row); proofReads.push(row);
                    } catch { stop('qualification_observation'); }
                    return;
                }
            }
            if (message.kind === 'phase_result' && keys === 'kind,phase,value' && scope && measured === measurementEvents[index].length
                && message.phase === phases[index]) {
                try {
                    if (index === 1 && typeof message.value !== 'boolean') throw fail('proof_result_invalid');
                    if (qualification && index === 1 && (activeSite !== null
                        || proofSites.length !== qualification.data.predicate_ids.length
                        || message.value !== proofSites.every(row => row.satisfied))) throw fail('qualification_sites');
                    results.push(index === 0 ? copyTypedFunctionalResult(message.value) : message.value);
                    scope.seal(); scope = undefined; index++;
                } catch { stop('functional_result_invalid'); }
                return;
            }
            if (message.kind === 'graph_done' && keys === 'kind' && index === 2 && !scope) {
                complete = true; return;
            }
            stop('protocol');
        });
        child.on('close', code => {
            clearTimeout(startup); clearTimeout(deadline);
            if (error) { reject(error); return; }
            if (code !== 0 || !complete || results.length !== 2) { reject(fail('incomplete_exit')); return; }
            try {
                resolve(Object.freeze({ stage: qualification ? 'isolated_claim_month_observations_only' : 'isolated_graph_observations_only', graph_accepted: false,
                    functional_result: results[0], proof_satisfied: results[1],
                    observed_child_capsule_root: fields.childCapsuleReceipt.value.observed_root,
                    observed_evaluator_artifact_root: prepared[0].receipt.observed_root,
                    observed_proof_engine_artifact_root: prepared[1].receipt.observed_root,
                    ...(measuredTcbRoot ? { observed_validation_tcb_root: measuredTcbRoot,
                        observed_evaluator_contract_hash: measuredContractHash } : {}),
                    ...(qualification ? { proof_site_results: freezeDeep(proofSites), proof_site_reads: freezeDeep(proofReads),
                        qualification_observations: freezeDeep(fringe), qualification_profile_hash: 'sha256:' + require('../kernel/canonicalValue').digest(qualification.data),
                        positive_baseline_frozen: qualification.frozenBaseline !== null,
                        ...(qualification.frozenBaseline ? { positive_freeze_hash: qualification.frozenBaseline.freezeHash } : {}),
                        profile_witness_qualified: false, financial_release_eligible: false, receipt_created: false } : {}),
                    trace: recorder.finish() }));
            } catch { reject(fail('recorder_invalid')); }
        });
    });
}

// Registry-root bound transport only. The registry receipt must itself have
// been admitted against a reviewed freeze hash by the trusted caller; this
// function cannot manufacture that authority or accept a claim.
async function runRegisteredMetric(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) throw fail('config_invalid');
    const d = Object.getOwnPropertyDescriptors(raw);
    const required = ['artifactReceipt', 'executionId', 'invocationId', 'bindings',
        'timeoutMs', 'registryReceipt', 'evaluatorRef', 'contractReceipt'];
    const optional = ['nodeSets', 'operandAliases', 'directLinks', 'directGroups', 'parentGroups', 'childCapsuleReceipt'];
    if (Reflect.ownKeys(d).length !== required.length + optional.filter(key => Object.hasOwn(d, key)).length
        || required.some(key => !d[key] || !Object.hasOwn(d[key], 'value') || !d[key].enumerable)
        || optional.some(key => Object.hasOwn(d, key)
            && (!Object.hasOwn(d[key], 'value') || !d[key].enumerable))) throw fail('config_invalid');
    let entry; let contents; let output;
    try {
        entry = resolveExecutionEvaluator(d.registryReceipt.value, d.evaluatorRef.value);
        output = resolveExecutionOutput(d.registryReceipt.value, d.evaluatorRef.value,
            d.contractReceipt.value);
        contents = artifactContents(d.artifactReceipt.value);
    } catch { throw fail('registry_invalid'); }
    if (d.artifactReceipt.value.observed_root !== entry.evaluator_artifact_root
        || contents.kind !== 'metric') throw fail('registry_root_mismatch');
    let direct; let groups; let sets; let parents;
    try {
        direct = copyData(d.operandAliases?.value ?? []);
        groups = copyData(d.directGroups?.value ?? []);
        sets = copyData(d.nodeSets?.value ?? []);
        parents = copyData(d.parentGroups?.value ?? []);
    } catch { throw fail('registry_roles_invalid'); }
    if (!Array.isArray(direct) || !Array.isArray(groups) || !Array.isArray(sets) || !Array.isArray(parents)) throw fail('registry_roles_invalid');
    const actual = new Map();
    for (const operand of direct) {
        if (!operand || Object.keys(operand).sort().join(',') !== 'alias,role'
            || !identifier(operand.role) || !identifier(operand.alias)
            || actual.has(operand.role)) throw fail('registry_roles_invalid');
        actual.set(operand.role, 'direct');
    }
    for (const group of groups) {
        if (!group || !identifier(group.role) || actual.has(group.role)) throw fail('registry_roles_invalid');
        actual.set(group.role, 'direct');
    }
    for (const set of sets) {
        if (!set || !identifier(set.role) || actual.has(set.role)) throw fail('registry_roles_invalid');
        actual.set(set.role, 'node_set');
    }
    for (const parent of parents) {
        if (!parent || !identifier(parent.role) || actual.has(parent.role)) throw fail('registry_roles_invalid');
        actual.set(parent.role, 'parent_claim');
    }
    if (actual.size !== entry.roles.length || entry.roles.some(role =>
        actual.get(role.role_id) !== (['node_set', 'parent_claim'].includes(role.input_kind) ? role.input_kind : 'direct')))
        throw fail('registry_roles_invalid');
    const config = Object.fromEntries([...required.filter(key =>
        !['registryReceipt', 'evaluatorRef', 'contractReceipt'].includes(key)), ...optional.filter(key => Object.hasOwn(d, key))]
        .map(key => [key, d[key].value]));
    const result = await runAdmittedMetric(config);
    if (result.functional_result.unit !== output.unit || result.functional_result.kind !== output.kind
        || output.enumValues.length && !output.enumValues.includes(result.functional_result.value))
        throw fail('registry_output_mismatch');
    return Object.freeze({ ...result, stage: 'registry_root_bound_observation_only',
        evaluator_ref: Object.freeze({ evaluator_id: entry.evaluator_id,
            evaluator_version: entry.evaluator_version }) });
}

module.exports = { runAdmittedMetric, runRegisteredMetric, runAdmittedProof, runAdmittedGraph, runClaimMonthQualifiedGraph };
