import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAdmittedSchemaValidators } from './buildNextProvenanceArtifacts.mjs';
import { buildMetricChildCapsule, buildAvailableMetricArtifacts, buildExecutionRegistryCandidate } from './buildNextMetricArtifacts.mjs';
import { buildPhaseProofProgram } from './lowerNextProofProgram.mjs';
import { loadLocalAuthoringPackage } from './executeNextDomainInvariantMatrix.mjs';

const require = createRequire(import.meta.url);
const { admittedDocuments } = require('../../src/next/provenance/packageContract');
const { compileAuthoringIR, compileSnapshotAccess } = require('../../src/next/provenance/graphCompiler');
const mutations = require('../../src/next/provenance/mutationWitnesses');
const { admitArtifact } = require('../../src/next/provenance/artifactLoader');
const { runAdmittedGraph } = require('../../src/next/provenance/executionHost');
const { comparePhaseCoverage } = require('../../src/next/provenance/proofAcceptance');
const { createSameExecutionParentLedger } = require('../../src/next/provenance/claimBinding');
const { admitExecutionRegistry, resolveExecutionEvaluator, admitExecutionContract, resolveExecutionOutput } = require('../../src/next/provenance/executionRegistry');
const { admitPhaseCompositionProfile, PROFILE_PATH } = require('../../src/next/provenance/phaseCompositionProfile');
const { copyData } = require('../../src/next/provenance/observationContract');
const { canonicalValue, freezeDeep } = require('../../src/next/kernel/canonicalValue');
const prefix = 'docs/contracts/next/provenance-v2/';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const fail = code => { throw new Error(`trace_matrix_${code}`); };
const plain = value => JSON.parse(JSON.stringify(copyData(value)));
const fields = ['required_nodes', 'required_reads', 'required_edges', 'required_claim_reads', 'required_structural',
    'required_selections', 'selected_nodes'];
let cliProgress = false;

// Report-only normalization. Native observations intentionally use passive
// null-prototype records; the runtime canonicalizer stays strict plain JSON.
// Copy each bounded record before JSON conversion: do not invoke getters,
// proxies/toJSON or silently discard unsupported values from evidence.
export function hashTraceMatrixEvidence(records) {
    if (types.isProxy(records) || !Array.isArray(records) || Object.getPrototypeOf(records) !== Array.prototype)
        fail('evidence_records');
    const descriptors = Object.getOwnPropertyDescriptors(records);
    if (Reflect.ownKeys(descriptors).length !== records.length + 1) fail('evidence_records');
    const normalized = Array.from({ length: records.length }, (_, index) => {
        const descriptor = descriptors[index];
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail('evidence_records');
        return plain(descriptor.value);
    });
    return sha(canonicalValue(normalized));
}

function inputFields(raw) {
    if (!raw || typeof raw !== 'object' || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const descriptors = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(descriptors).length !== 2 || ['packageReceipt', 'fact_keys'].some(name =>
        !descriptors[name]?.enumerable || !Object.hasOwn(descriptors[name], 'value'))) fail('input');
    const factKeys = copyData(descriptors.fact_keys.value);
    if (!Array.isArray(factKeys) || !factKeys.length || factKeys.length > 76
        || new Set(factKeys).size !== factKeys.length
        || factKeys.some(key => typeof key !== 'string' || !/^[SMFN]-[0-9]{2}#[1-9][0-9]*#[1-9][0-9]*$/.test(key))) fail('input');
    return { packageReceipt: descriptors.packageReceipt.value, factKeys };
}

function artifact(source, kind, entry, extra) {
    const files = [{ path: entry, bytes: Buffer.from(source) }];
    if (extra) files.push({ path: extra.path, bytes: Buffer.from(extra.source) });
    const manifestBytes = Buffer.from(canonicalValue({ format: 'financasbot.provenance.artifact', version: 1,
        kind, entry, files: files.map(row => ({ path: row.path, sha256: sha(row.bytes),
            media_type: row.path.endsWith('.json') ? 'application/json' : 'text/javascript' })) }));
    return admitArtifact({ manifestBytes, expectedRoot: sha(manifestBytes), entries: files });
}

// HARNESS only. Native baselines execute here; callers cannot supply traces,
// verdicts, IR, counters or artifacts. Mutations affect recorder OUTPUT only.
// This is not a trusted host admission, financial receipt or global G11 gate.
export async function executeTraceOmissionBatch(raw) {
    const { packageReceipt, factKeys } = inputFields(raw);
    const documents = admittedDocuments(packageReceipt);
    const byPath = new Map(documents.map(row => [row.path, row]));
    const corpus = byPath.get(prefix + 'graphs-v2.json')?.value;
    if (!corpus) fail('corpus');
    const { validators, schemaHashes } = buildAdmittedSchemaValidators(packageReceipt);
    const ir = compileAuthoringIR(packageReceipt, validators);
    const plan = compileSnapshotAccess(packageReceipt, validators);
    const registry = byPath.get(corpus.metric_evaluator_registry.path)?.value;
    const inventory = mutations.enumerateMutationRequirements({ packageReceipt, ir,
        graphSchema: byPath.get(prefix + 'provenance-graph.schema.json')?.value,
        materialRegistry: byPath.get(corpus.material_registry.path)?.value,
        operatorRegistry: byPath.get(corpus.operator_registry.path)?.value,
        evaluatorRegistry: registry, witnessContracts: byPath.get(prefix + 'evaluator-witness-contracts-v1.json')?.value });
    const phaseRequirements = inventory.requirements.filter(row => row.family === 'phase_trace_requirement');
    const requirements = phaseRequirements.filter(row => fields.includes(row.target.field));
    const requested = new Set(factKeys);
    const batchExpected = requirements.filter(row => requested.has(row.target.fact_key)).length;
    const graphByKey = new Map(corpus.graphs.map(graph => [graph.fact_key, graph]));
    const needed = new Set();
    const addDependency = key => {
        const graph = graphByKey.get(key); if (!graph) fail('graph_missing');
        if (needed.has(key)) return; needed.add(key);
        for (const node of Object.values(graph.nodes)) if (node.binding === 'validated_parent') addDependency(node.fact_key);
    };
    for (const key of requested) addDependency(key);
    // IR already rejects cycles and fixes the actual dependency order. Extra
    // parents execute only as supporting baselines, not as credited mutations.
    const graphs = ir.order.filter(key => needed.has(key)).map(key => graphByKey.get(key));

    const measuredSource = relative => {
        if (typeof relative !== 'string' || !relative.startsWith(prefix)
            || !/^[A-Za-z0-9_.\/-]+\.json$/.test(relative)
            || relative.split('/').some(part => !part || part === '.' || part === '..')) fail('build_path');
        const admitted = byPath.get(relative);
        if (!admitted) fail('build_document_missing');
        const actual = fs.realpathSync(path.join(root, relative));
        if (path.relative(fs.realpathSync(root), actual).split(path.sep).join('/') !== relative) fail('build_containment');
        const source = fs.readFileSync(actual, 'utf8').replaceAll('\r\n', '\n');
        if (sha(source) !== admitted.sha256) fail('build_document_mismatch');
        return source;
    };
    measuredSource(corpus.metric_evaluator_registry.path);
    for (const entry of registry.entries) measuredSource(entry.contract_path);
    const profile = admitPhaseCompositionProfile({ source: measuredSource(PROFILE_PATH), registry });
    const child = artifact(buildMetricChildCapsule().source, 'tcb', 'bootstrap.js');
    const metrics = new Map(buildAvailableMetricArtifacts().built.map(row => [row.evaluator_id, row]));
    const builtRegistry = buildExecutionRegistryCandidate();
    const registryReceipt = admitExecutionRegistry({ bytes: Buffer.from(builtRegistry.bytes), expectedHash: builtRegistry.registry_hash });
    const claims = new Map(byPath.get(corpus.claim_contract.path).value.claims.map(claim => [claim.fact_key, claim]));
    const materialRegistry = byPath.get(corpus.material_registry.path).value;
    const descriptor = { registry_version: materialRegistry.registry_version, kind: 'derived_claim',
        fields: materialRegistry.kinds.derived_claim.fields };
    const executionId = 'trace-omission-matrix';
    const ledger = createSameExecutionParentLedger({ executionId });
    const receipts = new Map();
    const counts = { expected: requirements.length, generated: 0, executed: 0, matched: 0 };
    const rows = []; const baselines = []; const unsatisfied = [];
    try { for (const graph of graphs) {
        if (cliProgress) console.log(JSON.stringify({ stage: 'trace_omission_graph_started', fact_key: graph.fact_key,
            completed_baselines: baselines.length, requested_graphs: graphs.length }));
        const claim = claims.get(graph.fact_key); const selector = { fact_key: graph.fact_key };
        const entry = resolveExecutionEvaluator(registryReceipt, claim.evaluator_ref);
        const authoredEntry = registry.entries.find(row => row.evaluator_id === entry.evaluator_id);
        for (const field of ['evaluator_id', 'evaluator_version', 'metric', 'unit', 'contract_path', 'evaluator_contract_hash', 'roles', 'witness_contract_ids']) {
            if (canonicalValue(plain(entry[field])) !== canonicalValue(plain(authoredEntry[field]))) fail('registry_identity');
        }
        const contractReceipt = admitExecutionContract({ registryReceipt, evaluatorRef: claim.evaluator_ref,
            bytes: Buffer.from(measuredSource(entry.contract_path)) });
        const output = resolveExecutionOutput(registryReceipt, claim.evaluator_ref, contractReceipt);
        const parentRoles = entry.roles.filter(row => row.input_kind === 'parent_claim');
        const scope = ledger.openInvocation({ invocationId: graph.fact_key });
        try {
        const parentContext = parentRoles.length ? { receiptScope: scope, registryReceipt,
            receipts: Object.fromEntries(parentRoles.map(role => {
                const receipt = receipts.get(claim.operand_bindings[role.role_id].fact_key);
                if (!receipt) fail('parent_not_executed'); return [role.role_id, receipt];
            })) } : undefined;
        const builtMetric = metrics.get(claim.evaluator_ref.evaluator_id);
        if (!builtMetric || builtMetric.evaluator_version !== claim.evaluator_ref.evaluator_version) fail('metric_missing');
        const metric = artifact(builtMetric.source, 'metric', 'bundle.js');
        const built = buildPhaseProofProgram({ proof: plan.projectProofProgram(selector).input,
            derivation: plan.projectDerivationProgram(selector, profile).input }, profile);
        const proof = artifact(built.source, 'proof', 'bundle.js', built.profileInput);
        const proofConfig = plan.projectProofTransport(selector, parentContext).config;
        const transport = plan.projectMetricTransport(selector, parentContext);
        const observed = await runAdmittedGraph({ childCapsuleReceipt: child, executionId,
            invocationId: graph.fact_key, timeoutMs: 5000,
            derivation: { artifactReceipt: metric, bindings: [], directGroups: transport.directGroups,
                nodeSets: transport.nodeSets, parentGroups: transport.parentGroups,
                derivationBindings: plan.projectDerivationBindings(selector) },
            proof: { ...proofConfig, artifactReceipt: proof } });
        if (observed.proof_satisfied !== true) fail('baseline_predicates');
        if (observed.functional_result.unit !== output.unit || observed.functional_result.kind !== output.kind
            || output.enumValues.length && !output.enumValues.includes(observed.functional_result.value)) fail('baseline_signature');
        if (observed.observed_child_capsule_root !== child.observed_root
            || observed.observed_evaluator_artifact_root !== metric.observed_root
            || observed.observed_proof_engine_artifact_root !== proof.observed_root
            || entry.evaluator_artifact_root !== metric.observed_root) fail('baseline_roots');
        for (const phase of ['derivation', 'proof']) {
            const { evidence_set_mode, ...expected } = graph.trace_contract[phase];
            const isProof = phase === 'proof';
            const bindings = isProof ? proofConfig.proofSelections.map(row => ({ role: `proof/set/${row.candidate_set}`,
                candidate_set: row.candidate_set, selected_set: row.selected_set })) : expected.required_selections.map(selection => {
                    const roles = Object.entries(claim.operand_bindings).filter(([, binding]) => binding.kind === 'node_set'
                        && canonicalValue(binding.aliases) === canonicalValue(graph.sets[selection.candidate_set]));
                    if (roles.length !== 1) fail('selection_binding');
                    return { role: roles[0][0], ...selection };
                });
            const args = { trace: observed.trace, executionId, invocationId: graph.fact_key, phase, expected,
                sets: graph.sets, bindings,
                operandSets: isProof ? proofConfig.proofSets.map(row => ({ role: `proof/set/${row.name}`, aliases: row.roster }))
                    : Object.entries(claim.operand_bindings).filter(([, row]) => row.kind === 'node_set')
                        .map(([role, row]) => ({ role, aliases: row.aliases })),
                accessBindings: plan.observationMetadata({ fact_key: graph.fact_key, phase }, parentContext),
                measurements: isProof ? [{ measurement: 'proof_engine_artifact_root', observed: proof.observed_root }]
                    : [{ measurement: 'evaluator_artifact_root', observed: metric.observed_root },
                        { measurement: 'proof_engine_artifact_root', observed: proof.observed_root }] };
            if (!comparePhaseCoverage(args).matched) fail('baseline_trace');
            for (const requirement of requirements.filter(row => requested.has(graph.fact_key)
                && row.target.fact_key === graph.fact_key && row.target.phase === phase)) {
                const { field, value } = requirement.target;
                const base = { trace: observed.trace, fact_key: graph.fact_key, phase };
                let generated;
                try {
                    if (field === 'required_selections') {
                        const bound = bindings.filter(row => row.candidate_set === value.candidate_set
                            && row.selected_set === value.selected_set);
                        if (bound.length !== 1) fail('selection_binding');
                        generated = mutations.materializeTraceSelectionOmission({ ...base, ...value, role: bound[0].role });
                    } else if (field === 'selected_nodes') generated = mutations.materializeTraceSelectedNodeOmission({ ...base, node: value });
                    else if (field === 'required_nodes') generated = mutations.materializeTraceNodeOmission({ ...base, node: value });
                    else if (field === 'required_reads') generated = mutations.materializeTraceReadOmission({ ...base, node: value.node, segments: value.segments });
                    else if (field === 'required_edges') generated = mutations.materializeTraceEdgeOmission({ ...base, edge: value });
                    else if (field === 'required_claim_reads') generated = mutations.materializeTraceClaimReadOmission({ ...base, segments: value.segments });
                    else generated = mutations.materializeTraceStructuralOmission({ ...base, ...value });
                } catch (error) {
                    unsatisfied.push({ mutation_id: requirement.mutation_id, target: requirement.target, code: error.message });
                    continue; // Explicitly pending; never counts as generated/executed/matched.
                }
                if (generated.mutation_id !== requirement.mutation_id
                    || canonicalValue(generated.target) !== canonicalValue(requirement.target)) fail('coordinate_mismatch');
                counts.generated++;
                const actual = comparePhaseCoverage({ ...args, trace: generated.trace }); counts.executed++;
                // The normative coordinate fixes the comparator dimension;
                // the observed failure cannot choose its own classification.
                const traceComponent = ['required_selections', 'selected_nodes'].includes(field) ? 'selection' : 'read_edges';
                // Standalone read coverage deliberately leaves events owned
                // by other projections unclassified. Use the native composite
                // rule (exact read dimensions + unique event ownership), not
                // the standalone flag, and never count unsupported events.
                const componentMatches = (name, result) => name === 'read_edges'
                    ? result.mismatches.length === 0 : result.matched;
                const collateral = Object.entries(actual.components).filter(([name, result]) => name !== traceComponent
                    && !componentMatches(name, result));
                const unowned = actual.event_coverage.filter(row => row.status !== 'covered');
                const otherComponentsMatch = collateral.length === 0 && unowned.length === 0;
                const traceFailed = traceComponent === 'read_edges'
                    ? actual.components.read_edges.mismatches.length > 0 : !actual.components.selection.matched;
                const actualViolations = traceFailed ? ['trace'] : [];
                const matched = otherComponentsMatch && canonicalValue(actualViolations) === canonicalValue(['trace']);
                if (matched) counts.matched++;
                rows.push({ mutation_id: requirement.mutation_id, target: requirement.target,
                    expected_violations: ['trace'], actual_violations: otherComponentsMatch ? actualViolations : null,
                    trace_component: traceComponent,
                    trace_component_errors: actual.components[traceComponent].errors || [],
                    trace_component_mismatches: actual.components[traceComponent].mismatches || [],
                    unmatched_components: [...collateral.map(([name, result]) => ({ name, errors: result.errors, mismatches: result.mismatches || [] })),
                        ...(unowned.length ? [{ name: 'event_coverage', errors: unowned, mismatches: [] }] : [])],
                    other_components_match: otherComponentsMatch, matched,
                    candidate_trace_sha256: sha(canonicalValue(generated.trace)) });
            }
        }
        // No made-up fixture value. Mint the native opaque local token only
        // after the same observed result, signature, artifact roots and both
        // native phase coverages passed. It remains HARNESS, not a published
        // host/freeze authority or financial receipt.
        if (!parentRoles.length) receipts.set(graph.fact_key, scope.acceptPrimary({ descriptor, preimage: {
            claim_contract_hash: corpus.claim_contract.hash,
            graph_contract_hash: byPath.get(prefix + 'graphs-v2.json').sha256,
            metric_registry_hash: registryReceipt.observed_hash, claim_id: claim.claim_id, fact_key: graph.fact_key,
            evaluator_ref: claim.evaluator_ref, result: observed.functional_result,
            operand_bindings: claim.operand_bindings, registry_roles: entry.roles, parents: [],
            primary_inputs: Object.entries(graph.nodes).filter(([, node]) => node.binding === 'snapshot')
                .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([alias, node]) => ({ alias, kind: node.kind,
                    ref_id: node.ref_id, version: node.version, semantic_fingerprint: node.semantic_fingerprint }))
        } }));
        baselines.push({ fact_key: graph.fact_key, requested: requested.has(graph.fact_key), proof_satisfied: true,
            parent_fact_keys: parentRoles.map(role => claim.operand_bindings[role.role_id].fact_key),
            functional_result_sha256: sha(canonicalValue(observed.functional_result)),
            trace_sha256: sha(canonicalValue(observed.trace)),
            metric_root: metric.observed_root, proof_root: proof.observed_root, child_root: child.observed_root });
        } finally { scope.seal(); }
        if (cliProgress) console.log(JSON.stringify({ stage: 'trace_omission_graph_completed', fact_key: graph.fact_key,
            omissions: { ...counts }, unsatisfied: unsatisfied.length, global_g11: false }));
    } } finally { ledger.finish(); }
    return freezeDeep({ stage: 'captured_trace_omission_batch_only', graph_accepted: false, global_g11: false,
        trace_fault_injection: 'recorder_output_only', artifact_authority: 'self_built_local_not_reviewed_host',
        oracle_used: false, financial_receipt: false, scope_fields: fields, requested_fact_keys: factKeys,
        parent_source: 'same_batch_executed_and_coverage_validated',
        supporting_fact_keys: graphs.filter(graph => !requested.has(graph.fact_key)).map(graph => graph.fact_key),
        phase_trace_family_expected: phaseRequirements.length,
        phase_trace_family_pending: phaseRequirements.length - counts.matched,
        phase_trace_family_complete: counts.matched === phaseRequirements.length,
        batch_expected: batchExpected,
        batch_complete: counts.generated === batchExpected && counts.executed === batchExpected && counts.matched === batchExpected,
        class_complete: Object.values(counts).every(count => count === counts.expected),
        authority_refs: ir.authority_refs, schema_sources: schemaHashes, omissions: counts,
        pending_omissions: counts.expected - counts.matched, baselines, rows, unsatisfied });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv.length !== 3 || !['--check', '--check-primary', '--check-derived', '--check-all'].includes(process.argv[2]))
        fail('usage: executeNextTraceOmissionMatrix.mjs --check|--check-primary|--check-derived|--check-all');
    const packageReceipt = loadLocalAuthoringPackage();
    const corpus = admittedDocuments(packageReceipt).find(row => row.path === prefix + 'graphs-v2.json').value;
    const excludedParents = corpus.graphs.filter(graph => Object.values(graph.nodes)
        .some(node => node.binding !== 'snapshot')).map(graph => graph.fact_key);
    const primary = process.argv[2] === '--check-primary';
    const derived = process.argv[2] === '--check-derived'; const all = process.argv[2] === '--check-all';
    cliProgress = primary || derived || all;
    const factKeys = primary ? corpus.graphs.filter(graph => !excludedParents.includes(graph.fact_key))
        .map(graph => graph.fact_key) : derived ? excludedParents : all ? corpus.graphs.map(graph => graph.fact_key) : ['S-04#1#1'];
    const result = await executeTraceOmissionBatch({ packageReceipt, fact_keys: factKeys });
    console.log(JSON.stringify({ stage: result.stage, scope: primary ? 'primary_graph_trace_omissions_only'
        : derived ? 'derived_graph_trace_omissions_only' : all ? 'all_graph_trace_omissions_only' : 'S-04#1#1_trace_omissions_only',
        requested_fact_keys: factKeys, excluded_parent_fact_keys: primary ? excludedParents : [],
        supporting_fact_keys: result.supporting_fact_keys, parent_source: result.parent_source,
        omission_scope_fields: result.scope_fields, phase_trace_family_expected: result.phase_trace_family_expected,
        phase_trace_family_pending: result.phase_trace_family_pending,
        phase_trace_family_complete: result.phase_trace_family_complete,
        normalization: 'CRLF_to_LF', authority_refs_sha256: hashTraceMatrixEvidence(result.authority_refs),
        omissions: result.omissions, batch_expected: result.batch_expected,
        batch_complete: result.batch_complete, class_complete: result.class_complete,
        pending_omissions: result.pending_omissions, unsatisfied: result.unsatisfied.length,
        baseline_count: result.baselines.length, baseline_evidence_sha256: hashTraceMatrixEvidence(result.baselines),
        row_evidence_sha256: hashTraceMatrixEvidence(result.rows), global_g11: false, financial_receipt: false }));
    // Exit zero certifies only the requested trace-omission subset. Unrequested
    // graphs and all other mutation families remain pending, never skipped.
    if (!result.batch_complete) process.exitCode = 1;
}
