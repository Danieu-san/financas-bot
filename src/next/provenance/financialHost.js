'use strict';
const { randomUUID, createHash } = require('node:crypto');
const { types } = require('node:util');
const { canonicalValue } = require('../kernel/canonicalValue');
const { copyData } = require('./observationContract');
const { admitPackage, admittedDocuments } = require('./packageContract');
const { compileAuthoringIR, compileSnapshotAccess } = require('./graphCompiler');
const { admitExecutionFreeze, freezeContents, admitFrozenArtifact, resolveFrozenProofRoot } = require('./freezeContract');
const { admitExecutionRegistry, resolveExecutionEvaluator, admitExecutionContract, resolveExecutionOutput } = require('./executionRegistry');
const { admitArtifact, artifactContents } = require('./artifactLoader');
const { admitPhaseCompositionProfile, phaseCompositionCommitment } = require('./phaseCompositionProfile');
const { verifyNativeRuntime } = require('./nativeRuntime');
const { runAdmittedGraph } = require('./executionHost');
const { comparePhaseCoverage } = require('./proofAcceptance');
const { createSameExecutionParentLedger, calculateDerivedResultHash } = require('./claimBinding');
const { proofProgramIdentity } = require('./phaseProgramIdentity');
const GRAPH_PATH = 'docs/contracts/next/provenance-v2/graphs-v2.json';
const fail = code => { throw new Error(`financial_host_${code}`); };
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
function own(raw, names) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== names.length || names.some(name => !d[name]?.enumerable
        || !Object.hasOwn(d[name], 'value'))) fail('input');
    return Object.fromEntries(names.map(name => [name, d[name].value]));
}
function list(raw, maximum) {
    if (types.isProxy(raw) || !Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype
        || !raw.length || raw.length > maximum) fail('inventory');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== raw.length + 1) fail('inventory');
    return Array.from({ length: raw.length }, (_, i) => {
        if (!d[i]?.enumerable || !Object.hasOwn(d[i], 'value')) fail('inventory'); return d[i].value;
    });
}
function capture(raw, max = 16 * 1024 * 1024) {
    if (types.isProxy(raw) || !Buffer.isBuffer(raw) || Object.getPrototypeOf(raw) !== Buffer.prototype) fail('bytes');
    const size = Reflect.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength').get.call(raw);
    if (!size || size > max) fail('bytes'); const result = Buffer.alloc(size); Uint8Array.prototype.set.call(result, raw); return result;
}
const plain = value => JSON.parse(JSON.stringify(copyData(value)));
function artifactMap(raw, identity, expectedIds) {
    const rows = new Map();
    for (const item of list(raw, 76)) {
        const row = own(item, [identity, 'manifestBytes', 'entries']);
        const id = row[identity];
        if (typeof id !== 'string' || rows.has(id) || !expectedIds.has(id)) fail('artifact_inventory'); rows.set(id, row);
    }
    if (rows.size !== expectedIds.size) fail('artifact_inventory'); return rows;
}
function expectedPhase(graph, phase) { const { evidence_set_mode, ...expected } = graph.trace_contract[phase]; return expected; }

// TCB INTERNAL factory. The captured launcher supplies bootstrap authority;
// model/request data cannot select a freeze, root, validator or callback.
// The exported runtime object contains no emitReceipt/acceptPrimary/ledger API.
function createPrivateFinancialHost(rawData, rawBootstrap, validators) {
    const data = own(rawData, ['packageEntries', 'registryBytes', 'metricArtifacts', 'proofArtifacts', 'profileSource', 'timeoutMs']);
    const bootstrap = own(rawBootstrap, ['freezeBytes', 'expectedFreezeHash', 'tcbArtifact']);
    if (!Number.isSafeInteger(data.timeoutMs) || data.timeoutMs < 100 || data.timeoutMs > 5000) fail('timeout');
    const freezeReceipt = admitExecutionFreeze({ bytes: bootstrap.freezeBytes, expectedHash: bootstrap.expectedFreezeHash });
    const freeze = freezeContents(freezeReceipt);
    const tcbInput = own(bootstrap.tcbArtifact, ['manifestBytes', 'entries']);
    const tcbArtifactReceipt = admitFrozenArtifact({ freezeReceipt, kind: 'tcb', programId: null, ...tcbInput });
    const tcb = artifactContents(tcbArtifactReceipt);
    if (tcb.entry !== 'launcher-bootstrap.js' || tcb.files.map(row => row.path).join(',')
        !== 'child-bootstrap.js,host-bootstrap.js,launcher-bootstrap.js,recipe.json') fail('tcb_inventory');
    const nativeRuntimeReceipt = verifyNativeRuntime(freezeReceipt);
    const childBytes = Buffer.from(tcb.files[0].source);
    const childManifest = Buffer.from(canonicalValue({ format: 'financasbot.provenance.artifact', version: 1, kind: 'tcb',
        entry: 'bootstrap.js', files: [{ path: 'bootstrap.js', media_type: 'text/javascript', sha256: hash(childBytes) }] }));
    const childCapsuleReceipt = admitFrozenArtifact({ freezeReceipt, kind: 'child', programId: null,
        manifestBytes: childManifest, entries: [{ path: 'bootstrap.js', bytes: childBytes }] });
    const packageEntries = list(data.packageEntries, 128).map(item => {
        const row = own(item, ['path', 'bytes']); return { path: row.path, bytes: capture(row.bytes) };
    });
    const packageReceipt = admitPackage({ entries: packageEntries, authority: plain(freeze.package_authority) });
    const documents = new Map(admittedDocuments(packageReceipt).map(row => [row.path, row]));
    const graphDocument = documents.get(GRAPH_PATH); if (!graphDocument) fail('graph_document');
    const corpus = graphDocument.value;
    const claims = new Map(documents.get(corpus.claim_contract.path).value.claims.map(row => [row.fact_key, row]));
    const graphs = new Map(corpus.graphs.map(row => [row.fact_key, row]));
    const authorRegistry = documents.get(corpus.metric_evaluator_registry.path).value;
    const materialRegistry = documents.get(corpus.material_registry.path).value;
    const plan = compileSnapshotAccess(packageReceipt, validators);
    const ir = compileAuthoringIR(packageReceipt, validators);
    if (ir.order.length !== 76 || graphs.size !== 76 || claims.size !== 76) fail('graph_inventory');
    const registryReceipt = admitExecutionRegistry({ bytes: data.registryBytes, expectedHash: freeze.metric_registry_hash });
    const metricIds = new Set(authorRegistry.entries.map(row => row.evaluator_id));
    const metricRows = artifactMap(data.metricArtifacts, 'evaluator_id', metricIds);
    const metrics = new Map(); const contracts = new Map();
    for (const authored of authorRegistry.entries) {
        const ref = { evaluator_id: authored.evaluator_id, evaluator_version: authored.evaluator_version };
        const entry = resolveExecutionEvaluator(registryReceipt, ref);
        for (const field of ['evaluator_id', 'evaluator_version', 'metric', 'unit', 'contract_path', 'evaluator_contract_hash', 'roles', 'witness_contract_ids']) {
            if (canonicalValue(plain(entry[field])) !== canonicalValue(plain(authored[field]))) fail('registry_identity');
        }
        const row = metricRows.get(entry.evaluator_id);
        const artifact = admitArtifact({ manifestBytes: row.manifestBytes, entries: row.entries, expectedRoot: entry.evaluator_artifact_root });
        if (artifactContents(artifact).kind !== 'metric') fail('metric_kind'); metrics.set(entry.evaluator_id, artifact);
        const contractBytes = packageEntries.find(row => row.path === entry.contract_path)?.bytes;
        contracts.set(entry.evaluator_id, admitExecutionContract({ registryReceipt, evaluatorRef: ref, bytes: contractBytes }));
    }
    const profile = admitPhaseCompositionProfile({ source: data.profileSource, registry: authorRegistry });
    const profileRoot = phaseCompositionCommitment(profile).sha256;
    const programIds = new Map();
    for (const factKey of ir.order) {
        const selector = { fact_key: factKey };
        programIds.set(factKey, proofProgramIdentity(plan.projectProofProgram(selector).input,
            plan.projectDerivationProgram(selector, profile).input, profileRoot));
    }
    const expectedProgramIds = new Set(programIds.values());
    if (freeze.proof_programs.length !== expectedProgramIds.size
        || freeze.proof_programs.some(row => !expectedProgramIds.has(row.program_id))) fail('proof_inventory');
    const proofRows = artifactMap(data.proofArtifacts, 'program_id', expectedProgramIds); const proofs = new Map();
    for (const programId of expectedProgramIds) {
        const row = proofRows.get(programId);
        proofs.set(programId, admitFrozenArtifact({ freezeReceipt, kind: 'proof', programId,
            manifestBytes: row.manifestBytes, entries: row.entries }));
    }
    const executionId = randomUUID();
    const ledger = createSameExecutionParentLedger({ executionId });
    const accepted = new Map(); const publicResults = new Map(); let state = 'idle';
    const descriptor = { registry_version: materialRegistry.registry_version, kind: 'derived_claim', fields: materialRegistry.kinds.derived_claim.fields };
    async function run() {
        if (arguments.length || state !== 'idle') fail('lifecycle'); state = 'running';
        try {
            for (const factKey of ir.order) {
                const graph = graphs.get(factKey); const claim = claims.get(factKey);
                const entry = resolveExecutionEvaluator(registryReceipt, claim.evaluator_ref);
                const invocationId = randomUUID(); const scope = ledger.openInvocation({ invocationId });
                try {
                    const parentRoles = entry.roles.filter(row => row.input_kind === 'parent_claim');
                    const parentContext = parentRoles.length ? { receiptScope: scope, registryReceipt,
                        receipts: Object.fromEntries(parentRoles.map(role => {
                            const parent = accepted.get(claim.operand_bindings[role.role_id].fact_key);
                            if (!parent?.receipt) fail('parent_missing'); return [role.role_id, parent.receipt];
                        })) } : undefined;
                    const selector = { fact_key: factKey };
                    const metric = plan.projectMetricTransport(selector, parentContext);
                    const proof = plan.projectProofTransport(selector, parentContext);
                    const programId = programIds.get(factKey); const proofArtifact = proofs.get(programId);
                    const result = await runAdmittedGraph({ executionId, invocationId, timeoutMs: data.timeoutMs,
                        nativeRuntimeReceipt, tcbArtifactReceipt, evaluatorContractReceipt: contracts.get(entry.evaluator_id), childCapsuleReceipt,
                        derivation: { artifactReceipt: metrics.get(entry.evaluator_id), bindings: [], directGroups: metric.directGroups,
                            nodeSets: metric.nodeSets, parentGroups: metric.parentGroups, derivationBindings: plan.projectDerivationBindings(selector) },
                        proof: { ...proof.config, artifactReceipt: proofArtifact } });
                    const output = resolveExecutionOutput(registryReceipt, claim.evaluator_ref, contracts.get(entry.evaluator_id));
                    if (result.functional_result.unit !== output.unit || result.functional_result.kind !== output.kind
                        || output.enumValues.length && !output.enumValues.includes(result.functional_result.value)) fail('result_signature');
                    if (result.proof_satisfied !== true || result.observed_child_capsule_root !== freeze.child_capsule_root
                        || result.observed_validation_tcb_root !== freeze.validation_tcb_root
                        || result.observed_evaluator_contract_hash !== entry.evaluator_contract_hash
                        || result.observed_evaluator_artifact_root !== entry.evaluator_artifact_root
                        || result.observed_proof_engine_artifact_root !== resolveFrozenProofRoot(freezeReceipt, programId)) fail('proof_or_roots');
                    for (const phase of ['derivation', 'proof']) {
                        const bindings = phase === 'proof' ? proof.config.proofSelections.map(row => ({ role: `proof/set/${row.candidate_set}`, ...row }))
                            : graph.trace_contract.derivation.required_selections.map(selection => {
                                const roles = Object.entries(claim.operand_bindings).filter(([, row]) => row.kind === 'node_set'
                                    && canonicalValue(row.aliases) === canonicalValue(graph.sets[selection.candidate_set]));
                                if (roles.length !== 1) fail('selection_binding');
                                return { role: roles[0][0], candidate_set: selection.candidate_set, selected_set: selection.selected_set };
                            });
                        const operandSets = phase === 'proof' ? proof.config.proofSets.map(row => ({ role: `proof/set/${row.name}`, aliases: row.roster }))
                            : Object.entries(claim.operand_bindings).filter(([, row]) => row.kind === 'node_set').map(([role, row]) => ({ role, aliases: row.aliases }));
                        const measurements = [{ measurement: 'validation_tcb_root', observed: freeze.validation_tcb_root },
                            { measurement: 'proof_engine_artifact_root', observed: resolveFrozenProofRoot(freezeReceipt, programId) },
                            ...(phase === 'derivation' ? [{ measurement: 'evaluator_artifact_root', observed: entry.evaluator_artifact_root },
                                { measurement: 'evaluator_contract_hash', observed: entry.evaluator_contract_hash }] : [])];
                        const coverage = comparePhaseCoverage({ trace: result.trace, executionId, invocationId, phase,
                            expected: expectedPhase(graph, phase), sets: graph.sets, bindings, operandSets,
                            accessBindings: plan.observationMetadata({ fact_key: factKey, phase }, parentContext), measurements });
                        if (!coverage.matched) fail('trace_mismatch');
                    }
                    const preimage = { claim_contract_hash: corpus.claim_contract.hash, graph_contract_hash: graphDocument.sha256,
                        metric_registry_hash: registryReceipt.observed_hash, claim_id: claim.claim_id, fact_key: factKey,
                        evaluator_ref: claim.evaluator_ref, result: result.functional_result, operand_bindings: claim.operand_bindings,
                        registry_roles: plain(entry.roles), primary_inputs: Object.entries(graph.nodes).filter(([, node]) => node.binding === 'snapshot')
                            .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([alias, node]) => ({ alias, kind: node.kind,
                                ref_id: node.ref_id, version: node.version, semantic_fingerprint: node.semantic_fingerprint })),
                        parents: parentRoles.map(role => { const parent = accepted.get(claim.operand_bindings[role.role_id].fact_key);
                            return { role_id: role.role_id, fact_key: parent.factKey, evaluator_version: parent.version, result_hash: parent.resultHash }; }) };
                    const resultHash = calculateDerivedResultHash(preimage);
                    const receipt = parentRoles.length ? null : scope.acceptPrimary({ preimage, descriptor });
                    accepted.set(factKey, { factKey, version: entry.evaluator_version, resultHash, receipt });
                    const publicRef = randomUUID(); publicResults.set(publicRef, result.functional_result);
                } finally { scope.seal(); }
            }
            ledger.finish(); state = 'complete';
            return Object.freeze({ stage: 'validated_dag_results', graph_count: accepted.size,
                evidence_refs: Object.freeze([...publicResults.keys()]) });
        } catch { state = 'failed'; accepted.clear(); publicResults.clear(); fail('execution_rejected'); }
    }
    return Object.freeze({ run, read(reference) {
        if (arguments.length !== 1 || state !== 'complete' || typeof reference !== 'string' || !publicResults.has(reference)) fail('reference');
        return publicResults.get(reference);
    } });
}
module.exports = { createPrivateFinancialHost, proofProgramIdentity };
