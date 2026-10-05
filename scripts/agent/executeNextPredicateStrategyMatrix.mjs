// HARNESS only: operator-strategy qualification, not predicate_atom or release authority.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { types } from 'node:util';
import { buildAdmittedSchemaValidators } from './buildNextProvenanceArtifacts.mjs';
import { buildMetricChildCapsule, buildAvailableMetricArtifacts, buildExecutionRegistryCandidate } from './buildNextMetricArtifacts.mjs';
import { buildPhaseProofProgram, buildPhaseAssertionFaultProgram } from './lowerNextProofProgram.mjs';
import { verifyPhaseProofAssertionFault, sealAuthoredStrategyExpectation, verifyAuthoredStrategyCompile,
    sealEqualityStrategyReference } from './verifyNextProofStrategySites.mjs';
const require = createRequire(import.meta.url);
const { admitPackage, admittedDocuments } = require('../../src/next/provenance/packageContract');
const { compileAuthoringIR, compileSnapshotAccess } = require('../../src/next/provenance/graphCompiler');
const { enumerateMutationRequirements, materializeScalarEqualityStrategy } = require('../../src/next/provenance/mutationWitnesses');
const { enumeratePathInventoryCandidate, enumeratePathSemanticCandidates, readPathSemanticCandidate } = require('../../src/next/provenance/pathMutationInventory');
const { sealPathSemanticReference } = require('../../src/next/provenance/pathSemanticReference');
const { admitArtifact } = require('../../src/next/provenance/artifactLoader');
const { runAdmittedGraph } = require('../../src/next/provenance/executionHost');
const { comparePhaseCoverage } = require('../../src/next/provenance/proofAcceptance');
const { claimRequirementFailure } = require('../../src/next/provenance/claimRequirements');
const { collectionRequirementFailure } = require('../../src/next/provenance/collectionRequirements');
const { obligationBindingFailure } = require('../../src/next/provenance/obligationBindings');
const { admitExecutionRegistry, resolveExecutionEvaluator } = require('../../src/next/provenance/executionRegistry');
const { createSameExecutionParentLedger } = require('../../src/next/provenance/claimBinding');
const { admitPhaseCompositionProfile, PROFILE_PATH } = require('../../src/next/provenance/phaseCompositionProfile');
const { copyData } = require('../../src/next/provenance/observationContract');
const { canonicalValue, freezeDeep } = require('../../src/next/kernel/canonicalValue');
const prefix = 'docs/contracts/next/provenance-v2/';
const root = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const sha = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const equal = (a, b) => canonicalValue(a) === canonicalValue(b);
const fail = code => { throw new Error(`predicate_strategy_matrix_${code}`); };

function input(raw) {
    if (!raw || typeof raw !== 'object' || types.isProxy(raw) || Array.isArray(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== 2 || ['packageReceipt', 'fact_keys'].some(name =>
        !d[name]?.enumerable || !Object.hasOwn(d[name], 'value'))) fail('input');
    const keys = d.fact_keys.value;
    if (types.isProxy(keys) || !Array.isArray(keys) || Object.getPrototypeOf(keys) !== Array.prototype) fail('input');
    const descriptors = Object.getOwnPropertyDescriptors(keys);
    if (!keys.length || keys.length > 76 || Reflect.ownKeys(descriptors).length !== keys.length + 1) fail('input');
    const factKeys = Array.from({ length: keys.length }, (_, index) => {
        const field = descriptors[index];
        if (!field?.enumerable || !Object.hasOwn(field, 'value') || typeof field.value !== 'string'
            || !/^[SMFN]-\d{2}#\d+#\d+$/.test(field.value)) fail('input');
        return field.value;
    });
    if (new Set(factKeys).size !== factKeys.length) fail('input');
    return { packageReceipt: d.packageReceipt.value, factKeys };
}
function sourceAt(relative) {
    if (typeof relative !== 'string' || !/^[A-Za-z0-9_.\/-]+\.json$/.test(relative)
        || !relative.startsWith(prefix) && !relative.startsWith('tests/fixtures/financasbot-next/')
        || relative.split('/').some(part => !part || part === '.' || part === '..')) fail('path');
    const actual = fs.realpathSync(path.join(root, relative));
    if (path.relative(root, actual).split(path.sep).join('/') !== relative || !fs.statSync(actual).isFile()) fail('containment');
    return fs.readFileSync(actual, 'utf8').replaceAll('\r\n', '\n');
}
function artifact(source, kind, entry, extra) {
    const files = [{ path: entry, bytes: Buffer.from(source) }];
    if (extra) files.push({ path: extra.path, bytes: Buffer.from(extra.source) });
    const manifestBytes = Buffer.from(canonicalValue({ format: 'financasbot.provenance.artifact', version: 1,
        kind, entry, files: files.map(row => ({ path: row.path, sha256: sha(row.bytes),
            media_type: row.path.endsWith('.json') ? 'application/json' : 'text/javascript' })) }));
    return admitArtifact({ manifestBytes, expectedRoot: sha(manifestBytes), entries: files });
}

export async function executePredicateStrategyBatch(raw) {
    return executeBatch(raw, false);
}

export async function executePredicateStrategyBoundaryBatch(raw) {
    return executeBatch(raw, true);
}
// Authored locator mutations use no A/B assertion injection or source-state
// counterfactual exception. An early refusal remains UNSATISFIED.
export async function executePathSemanticV2Batch(raw) {
    return executeBatch(raw, true, true);
}

async function executeBatch(raw, boundary, pathSemantic = false) {
    const { packageReceipt, factKeys } = input(raw);
    const docs = admittedDocuments(packageReceipt); const byPath = new Map(docs.map(row => [row.path, row]));
    const corpus = byPath.get(prefix + 'graphs-v2.json')?.value;
    if (!corpus) fail('corpus');
    const entries = docs.map(row => {
        const bytes = Buffer.from(sourceAt(row.path));
        if (sha(bytes) !== row.sha256) fail('source_mismatch');
        return { path: row.path, bytes };
    });
    const { validators } = buildAdmittedSchemaValidators(packageReceipt);
    const ir = compileAuthoringIR(packageReceipt, validators);
    const baselinePlan = compileSnapshotAccess(packageReceipt, validators);
    const registry = byPath.get(corpus.metric_evaluator_registry.path).value;
    const inventory = enumerateMutationRequirements({ packageReceipt, ir,
        graphSchema: byPath.get(prefix + 'provenance-graph.schema.json').value,
        materialRegistry: byPath.get(corpus.material_registry.path).value,
        operatorRegistry: byPath.get(corpus.operator_registry.path).value, evaluatorRegistry: registry,
        witnessContracts: byPath.get(prefix + 'evaluator-witness-contracts-v1.json').value });
    const pathInventory = pathSemantic ? enumeratePathInventoryCandidate({ packageReceipt, ir }) : null;
    const scoped = pathSemantic ? pathInventory.requirements.filter(row => row.family === 'predicate_path_semantic')
        : inventory.requirements.filter(row => row.family === 'predicate_strategy'
            && row.target.operator === 'eq' && row.target.strategy === 'compatible_wrong_operator');
    const selected = scoped.filter(row => factKeys.includes(row.target.fact_key));
    const graphs = new Map(corpus.graphs.map(row => [row.fact_key, row]));
    if (factKeys.some(key => !graphs.has(key)) || !selected.length) fail('fact_keys');
    const profile = admitPhaseCompositionProfile({ source: sourceAt(PROFILE_PATH), registry });
    const metrics = new Map(buildAvailableMetricArtifacts().built.map(row => [row.evaluator_id, row]));
    const child = artifact(buildMetricChildCapsule().source, 'tcb', 'bootstrap.js');
    const claims = new Map(byPath.get(corpus.claim_contract.path).value.claims.map(row => [row.fact_key, row]));
    const needed = new Set(factKeys);
    if (boundary) {
        const includeParents = key => {
            for (const binding of Object.values(claims.get(key).operand_bindings)) if (binding.kind === 'parent_claim' && !needed.has(binding.fact_key)) {
                needed.add(binding.fact_key); includeParents(binding.fact_key);
            }
        };
        factKeys.forEach(includeParents);
    }
    const runKeys = boundary ? ir.order.filter(key => needed.has(key)) : factKeys;
    const ledgerExecutionId = 'predicate-strategy-boundary-batch';
    const ledger = boundary ? createSameExecutionParentLedger({ executionId: ledgerExecutionId }) : null;
    const parentReceipts = new Map();
    const executionRegistry = boundary ? buildExecutionRegistryCandidate() : null;
    const registryReceipt = boundary ? admitExecutionRegistry({ bytes: Buffer.from(executionRegistry.bytes), expectedHash: executionRegistry.registry_hash }) : null;
    const materialRegistry = byPath.get(corpus.material_registry.path).value;
    const parentDescriptor = { registry_version: materialRegistry.registry_version, kind: 'derived_claim', fields: materialRegistry.kinds.derived_claim.fields };
    // Oracle is sealed before all observations; it never comes from caller or actual.
    const oracleSource = sourceAt('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json');
    const oracles = JSON.parse(oracleSource); if (oracles.synthetic !== true) fail('oracle');
    const counts = { expected: selected.length, generated: 0, executed: 0, matched: 0 };
    const authoringCounts = { expected: selected.length, generated: 0, executed: 0, matched: 0 };
    const semanticCounts = { expected: selected.length, generated: 0, executed: 0, matched: 0 };
    const authoringRows = [];
    const rows = []; const baselines = []; const unsatisfied = [];
    const pending = (requirement, cause) => unsatisfied.push({ mutation_id: requirement.mutation_id,
        target: requirement.target, code: 'UNSATISFIED_MUTATION_WITNESS', cause });

    async function capture(plan, graph, claim, metric, executionId, faultId = null, parentContext) {
        const hostExecutionId = boundary ? ledgerExecutionId : executionId;
        const invocationId = boundary ? executionId : graph.fact_key;
        const selector = { fact_key: graph.fact_key };
        const programInput = { proof: plan.projectProofProgram(selector).input,
            derivation: plan.projectDerivationProgram(selector, profile).input };
        const original = buildPhaseProofProgram(programInput, profile);
        const built = faultId === null ? original : buildPhaseAssertionFaultProgram(programInput, profile, faultId);
        const conformance = faultId === null ? null : verifyPhaseProofAssertionFault({ input: programInput,
            baselineSource: original.source, negativeSource: built.source, predicateId: faultId });
        const proof = artifact(built.source, 'proof', 'bundle.js', built.profileInput);
        const config = plan.projectProofTransport(selector, parentContext).config;
        const transport = plan.projectMetricTransport(selector, parentContext);
        const observed = await runAdmittedGraph({ childCapsuleReceipt: child, executionId: hostExecutionId,
            invocationId, timeoutMs: 5000,
            derivation: { artifactReceipt: metric, bindings: [], directGroups: transport.directGroups,
                nodeSets: transport.nodeSets, parentGroups: transport.parentGroups, derivationBindings: plan.projectDerivationBindings(selector) },
            proof: { ...config, artifactReceipt: proof } });
        if (observed.observed_child_capsule_root !== child.observed_root
            || observed.observed_evaluator_artifact_root !== metric.observed_root
            || observed.observed_proof_engine_artifact_root !== proof.observed_root) fail('roots');
        const coverage = {};
        for (const phase of ['derivation', 'proof']) {
            const { evidence_set_mode, ...expected } = graph.trace_contract[phase];
            const isProof = phase === 'proof';
            const bindings = isProof ? config.proofSelections.map(row => ({ role: `proof/set/${row.candidate_set}`,
                candidate_set: row.candidate_set, selected_set: row.selected_set }))
                : expected.required_selections.map(selection => {
                    const roles = Object.entries(claim.operand_bindings).filter(([, binding]) => binding.kind === 'node_set'
                        && equal(binding.aliases, graph.sets[selection.candidate_set]));
                    if (roles.length !== 1) fail('selection_binding');
                    return { role: roles[0][0], ...selection };
                });
            coverage[phase] = comparePhaseCoverage({ executionId: hostExecutionId, invocationId, phase,
                trace: observed.trace, expected, sets: graph.sets, bindings,
                operandSets: isProof ? config.proofSets.map(row => ({ role: `proof/set/${row.name}`, aliases: row.roster }))
                    : Object.entries(claim.operand_bindings).filter(([, binding]) => binding.kind === 'node_set')
                        .map(([role, binding]) => ({ role, aliases: binding.aliases })),
                accessBindings: plan.observationMetadata({ fact_key: graph.fact_key, phase }, parentContext),
                measurements: isProof ? [{ measurement: 'proof_engine_artifact_root', observed: proof.observed_root }]
                    : [{ measurement: 'evaluator_artifact_root', observed: metric.observed_root },
                        { measurement: 'proof_engine_artifact_root', observed: proof.observed_root }] });
        }
        const parentSnapshots = config.bindings.filter(row => row.identity?.kind === 'derived_claim')
            .map(row => ({ ...row.identity, alias: row.alias, payload: row.value }));
        return { observed, coverage, built, programInput, conformance, proofRoot: proof.observed_root, parentSnapshots };
    }
    try { for (const key of runKeys) {
        const graph = graphs.get(key); const requirements = selected.filter(row => row.target.fact_key === key);
        if (!requirements.length && !boundary) continue;
        if (!boundary && Object.values(graph.nodes).some(node => node.binding !== 'snapshot')) {
            requirements.forEach(row => pending(row, 'parent_execution_required')); continue;
        }
        const claim = claims.get(key); const definition = metrics.get(claim.evaluator_ref.evaluator_id);
        if (!definition || definition.evaluator_version !== claim.evaluator_ref.evaluator_version) fail('metric');
        const metric = artifact(definition.source, 'metric', 'bundle.js');
        const entry = boundary ? resolveExecutionEvaluator(registryReceipt, claim.evaluator_ref) : null;
        if (boundary && entry.evaluator_artifact_root !== metric.observed_root) fail('registry_metric');
        const parentRoles = entry?.roles.filter(row => row.input_kind === 'parent_claim') ?? [];
        const scope = boundary ? ledger.openInvocation({ invocationId: `ps-baseline-${key}` }) : null;
        try {
        const parentContext = parentRoles.length ? { receiptScope: scope, registryReceipt,
            receipts: Object.fromEntries(parentRoles.map(role => {
                const receipt = parentReceipts.get(claim.operand_bindings[role.role_id].fact_key);
                if (!receipt) fail('parent_not_executed'); return [role.role_id, receipt];
            })) } : undefined;
        const baselinePredicates = baselinePlan.inspectProofPredicates({ fact_key: key }, () => {}, parentContext);
        const baseline = await capture(baselinePlan, graph, claim, metric, `ps-baseline-${key}`, null, parentContext);
        const [conversation, turn, ordinal] = key.split('#');
        const oracle = oracles.turns?.[`${conversation}#${turn}`]?.facts?.[Number(ordinal) - 1];
        if (!oracle || oracle.metric !== claim.metric || oracle.unit !== baseline.observed.functional_result.unit
            || !equal(oracle.value, baseline.observed.functional_result.value) || !baseline.observed.proof_satisfied
            || !baselinePredicates.satisfied || !Object.values(baseline.coverage).every(row => row.matched)) fail('baseline');
        baselines.push({ fact_key: key, oracle_matched: true, proof_satisfied: true,
            result_sha256: sha(canonicalValue(baseline.observed.functional_result)), supporting_parent: !factKeys.includes(key),
            parent_fact_keys: parentRoles.map(role => claim.operand_bindings[role.role_id].fact_key) });
        // Only the real positive baseline, already checked against the frozen
        // oracle, roots and both coverages, may mint a local transport token.
        // Negative captures below never call acceptPrimary.
        if (boundary && !parentRoles.length) parentReceipts.set(key, scope.acceptPrimary({ descriptor: parentDescriptor, preimage: {
            claim_contract_hash: corpus.claim_contract.hash, graph_contract_hash: byPath.get(prefix + 'graphs-v2.json').sha256,
            metric_registry_hash: registryReceipt.observed_hash, claim_id: claim.claim_id, fact_key: key,
            evaluator_ref: claim.evaluator_ref, result: baseline.observed.functional_result,
            operand_bindings: claim.operand_bindings, registry_roles: entry.roles, parents: [],
            primary_inputs: Object.entries(graph.nodes).filter(([, node]) => node.binding === 'snapshot')
                .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([alias, node]) => ({ alias, kind: node.kind,
                    ref_id: node.ref_id, version: node.version, semantic_fingerprint: node.semantic_fingerprint }))
        } }));
        for (const requirement of requirements) {
            if (pathSemantic) {
                const predicateId = requirement.target.predicate_id;
                const targetPredicate = graph.predicates.find(row => row.id === predicateId);
                const expectedViolations = [targetPredicate.atom];
                const row = { mutation_id: requirement.mutation_id, target: requirement.target,
                    expected_violations: expectedViolations, generated: false, dp_execution: false,
                    matched: false, financial_receipt: false, graph_accepted: false };
                try {
                    const alternatives = enumeratePathSemanticCandidates({ inventoryCandidate: pathInventory,
                        mutation_id: requirement.mutation_id });
                    row.sealed_alternatives_sha256 = alternatives.candidates_sha256;
                    row.alternatives = alternatives.candidates.length;
                    if (!alternatives.candidates.length) throw new Error('no_typed_closed_world_alternative');
                    const references = alternatives.candidates.map(candidate => ({ candidate,
                        reference: sealPathSemanticReference({ packageReceipt, candidate }) }));
                    const selectedReference = references.find(item => item.reference.available
                        && item.reference.baseline_satisfied && item.reference.mutant_satisfied === false);
                    if (!selectedReference) throw new Error(references.some(item => item.reference.available)
                        ? 'no_discriminating_candidate_in_supported_reference_domain' : 'independent_reference_domain_pending');
                    const { candidate: generated, reference } = selectedReference;
                    const authority = readPathSemanticCandidate(generated);
                    if (!authority || authority.mutation_id !== requirement.mutation_id
                        || !equal(authority.expected_violations, expectedViolations)) fail('path_coordinate');
                    row.generated = true; counts.generated++;
                    row.candidate_id = generated.candidate_id; row.patch = generated.patch;
                    row.selection_policy = 'first_presealed_independently_discriminating_alternative';
                    row.reference = reference;
                    const expectedCorpus = structuredClone(corpus);
                    const graphIndex = expectedCorpus.graphs.findIndex(item => item.fact_key === key);
                    expectedCorpus.graphs[graphIndex] = generated.graph;
                    const negativeSource = JSON.stringify(expectedCorpus);
                    row.authoring_sha256 = sha(negativeSource);
                    const mutantEntries = entries.map(item => ({ path: item.path,
                        bytes: item.path === prefix + 'graphs-v2.json' ? Buffer.from(negativeSource) : item.bytes }));
                    const mutant = admitPackage({ entries: mutantEntries,
                        authority: mutantEntries.map(item => ({ path: item.path, sha256: sha(item.bytes) })) });
                    // Recheck all lowered authored operands without trusting a
                    // compiler site map. No mutated claim, oracle or payload.
                    const changedIR = compileAuthoringIR(mutant, validators);
                    enumeratePathInventoryCandidate({ packageReceipt: mutant, ir: changedIR });
                    const changed = compileSnapshotAccess(mutant, validators);
                    row.whole_compiler_admitted = true;
                    const predicates = changed.inspectProofPredicates({ fact_key: key }, () => {}, parentContext);
                    const executionId = `path-v2-${requirement.mutation_id.slice(7)}`;
                    row.execution_id = executionId; row.invocation_id = executionId;
                    const candidate = await capture(changed, graph, claim, metric, executionId, null, parentContext);
                    row.dp_execution = true; counts.executed++;
                    const falsePredicates = predicates.results.filter(item => !item.satisfied);
                    const outsideTargetPreserved = equal(predicates.results.filter(item => item.id !== predicateId),
                        baselinePredicates.results.filter(item => item.id !== predicateId));
                    const targetFalse = falsePredicates.some(item => item.id === predicateId);
                    const phasesCovered = Object.values(candidate.coverage).every(item => item.matched);
                    const resultPreserved = equal(candidate.observed.functional_result, baseline.observed.functional_result);
                    const violations = [...new Set(falsePredicates.map(item => item.atom)),
                        ...(!phasesCovered ? ['trace'] : []), ...(!resultPreserved ? ['positive_oracle'] : [])].sort();
                    const matched = targetFalse && outsideTargetPreserved && phasesCovered && resultPreserved
                        && candidate.observed.proof_satisfied === false
                        && equal(violations, [...expectedViolations].sort())
                        && sha(sourceAt('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json')) === sha(oracleSource);
                    Object.assign(row, { false_predicates: falsePredicates, observed_violations: violations,
                        outside_target_preserved: outsideTargetPreserved, phases_covered: phasesCovered,
                        rejected_coverage_components: Object.entries(candidate.coverage).filter(([, item]) => !item.matched)
                            .map(([phase, item]) => ({ phase, components: Object.entries(item.components).filter(([, value]) =>
                                value.matched === false || value.mismatches?.length > 0).map(([name]) => name) })),
                        positive_oracle_matched: resultPreserved, proof_satisfied: candidate.observed.proof_satisfied,
                        trace_sha256: sha(canonicalValue(candidate.observed.trace)), matched });
                    if (matched) counts.matched++;
                    else throw new Error('collateral_or_missing_rejection');
                } catch (error) {
                    row.cause = error.message;
                    const causal = [claimRequirementFailure, collectionRequirementFailure, obligationBindingFailure]
                        .map(read => read(error)).find(Boolean);
                    if (causal) row.native_checker_dependency = causal;
                    pending(requirement, error.message);
                }
                rows.push(row);
                continue;
            }
            try {
                const generated = materializeScalarEqualityStrategy({ packageReceipt, fact_key: key,
                    predicate_id: requirement.target.predicate_id });
                if (generated.mutation_id !== requirement.mutation_id || !equal(generated.target, requirement.target)) fail('coordinate');
                const change = generated.changes[0];
                const expectedCorpus = structuredClone(corpus);
                expectedCorpus.graphs.find(row => row.fact_key === key).predicates.find(row => row.id === requirement.target.predicate_id).op = 'not_eq';
                if (generated.changes.length !== 1 || change.path !== prefix + 'graphs-v2.json'
                    || change.sha256 !== sha(change.source) || !equal(JSON.parse(change.source), expectedCorpus)) fail('content_preservation');
                counts.generated++;
                const mutantEntries = entries.map(row => ({ path: row.path, bytes: row.path === change.path
                    ? Buffer.from(change.source) : row.bytes }));
                const mutant = admitPackage({ entries: mutantEntries,
                    authority: mutantEntries.map(row => ({ path: row.path, sha256: sha(row.bytes) })) });
                if (boundary) {
                    const predicateId = requirement.target.predicate_id;
                    // Both expectations are sealed before mutated compile or
                    // negative execution. No actual/result is used to form them.
                    const reference = sealEqualityStrategyReference({ graph, claim, predicateId,
                        snapshots: [...byPath.get(corpus.snapshot_manifest.path).value.snapshots, ...baseline.parentSnapshots] });
                    const expectation = sealAuthoredStrategyExpectation({ input: baseline.programInput,
                        baselineSource: baseline.built.source, predicateId,
                        authoredPredicate: graph.predicates.find(row => row.id === predicateId) });
                    authoringCounts.generated++;
                    const authoring = { mutation_id: requirement.mutation_id, generated: true, executed: false,
                        admission_outcome: null, quarantine_compile_completed: false,
                        authoring_ir_conformance_matched: false, matched: false, financial_receipt: false };
                    try {
                        authoringCounts.executed++; authoring.executed = true;
                        let changed;
                        try { changed = compileSnapshotAccess(mutant, validators); }
                        catch (error) {
                            // Checker-origin capabilities, never an allowlist
                            // of exception messages learned from the RED batch.
                            const causal = [claimRequirementFailure, collectionRequirementFailure, obligationBindingFailure]
                                .map(read => read(error)).find(Boolean);
                            authoring.admission_outcome = 'rejected';
                            if (!causal || causal.fact_key !== key || !causal.predicate_ids.includes(predicateId)) throw error;
                            authoring.matched = true; authoring.checker_dependency = causal;
                            authoring.quarantine_compile_completed = null;
                            authoring.authoring_ir_conformance_matched = null;
                        }
                        if (changed) {
                            authoring.admission_outcome = 'admitted';
                            const selector = { fact_key: key };
                            const compiledInput = { proof: changed.projectProofProgram(selector).input,
                                derivation: changed.projectDerivationProgram(selector, profile).input };
                            const compiled = buildPhaseProofProgram(compiledInput, profile);
                            const checked = verifyAuthoredStrategyCompile({ expectation, compiledInput, compiledSource: compiled.source });
                            authoring.quarantine_compile_completed = true;
                            authoring.authoring_ir_conformance_matched = checked.matched;
                            authoring.matched = checked.matched;
                            authoring.expected_reference_sha256 = checked.expected_reference_sha256;
                        }
                    } catch (error) { authoring.cause = error.message; }
                    if (authoring.matched) authoringCounts.matched++;
                    authoringRows.push(authoring);
                    const executionId = `ps-boundary-${requirement.mutation_id.slice(7)}`;
                    semanticCounts.generated++;
                    const candidate = await capture(baselinePlan, graph, claim, metric, executionId, predicateId, parentContext);
                    counts.executed++; semanticCounts.executed++;
                    const phasesCovered = Object.values(candidate.coverage).every(row => row.matched);
                    const resultPreserved = equal(candidate.observed.functional_result, baseline.observed.functional_result);
                    const negativeRootMatched = candidate.observed.observed_proof_engine_artifact_root === candidate.built.artifact_root;
                    const positiveReleaseRootMatched = candidate.proofRoot === baseline.proofRoot;
                    const semanticMatched = candidate.conformance.matched && reference.mutant_satisfied === false
                        && candidate.observed.proof_satisfied === false && phasesCovered && resultPreserved
                        && negativeRootMatched && !positiveReleaseRootMatched
                        && sha(sourceAt('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json')) === sha(oracleSource);
                    if (semanticMatched) semanticCounts.matched++;
                    const matched = authoring.matched && semanticMatched;
                    if (matched) counts.matched++; else pending(requirement, authoring.cause ?? 'boundary_semantic_pending');
                    rows.push({ mutation_id: requirement.mutation_id, target: requirement.target, execution_id: executionId,
                        host_execution_id: ledgerExecutionId, invocation_id: executionId,
                        expected_violations: [requirement.target.atom], reference_false_predicate: reference.predicate_id,
                        reference_sha256: reference.reference_sha256, outside_target_preserved: candidate.conformance.matched,
                        phases_covered: phasesCovered, positive_oracle_matched: resultPreserved,
                        proof_satisfied: candidate.observed.proof_satisfied, authoring_probe_matched: authoring.matched,
                        semantic_assertion_fault_matched: semanticMatched, negative_artifact_root_matched: negativeRootMatched,
                        positive_release_root_matched: positiveReleaseRootMatched, negative_witness_only: true,
                        graph_accepted: false, financial_receipt: false, matched,
                        trace_sha256: sha(canonicalValue(candidate.observed.trace)) });
                    continue;
                }
                const plan = compileSnapshotAccess(mutant, validators);
                const predicates = plan.inspectProofPredicates({ fact_key: key }, () => {});
                const executionId = `ps-${requirement.mutation_id.slice(7)}`;
                const candidate = await capture(plan, graph, claim, metric, executionId);
                counts.executed++;
                const falsePredicates = predicates.results.filter(row => !row.satisfied);
                const targetFalse = falsePredicates.some(row => row.id === requirement.target.predicate_id);
                const outsideTargetPreserved = equal(predicates.results.filter(row => row.id !== requirement.target.predicate_id),
                    baselinePredicates.results.filter(row => row.id !== requirement.target.predicate_id));
                const phasesCovered = Object.values(candidate.coverage).every(row => row.matched);
                const resultPreserved = equal(candidate.observed.functional_result, baseline.observed.functional_result);
                const rejectedCoverage = Object.entries(candidate.coverage).flatMap(([phase, coverage]) =>
                    [...Object.entries(coverage.components).filter(([name, value]) => name === 'read_edges'
                        ? value.mismatches.length > 0 : value.matched === false)
                        .map(([component]) => ({ phase, component })),
                    ...(coverage.event_coverage.some(event => event.status !== 'covered')
                        ? [{ phase, component: 'event_classification' }] : [])]);
                const matched = targetFalse && outsideTargetPreserved && falsePredicates.length === 1
                    && candidate.observed.proof_satisfied === false && phasesCovered && resultPreserved
                    && sha(sourceAt('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json')) === sha(oracleSource);
                if (matched) counts.matched++; else pending(requirement, 'collateral_or_missing_rejection');
                rows.push({ mutation_id: requirement.mutation_id, target: requirement.target, execution_id: executionId,
                    expected_violations: [requirement.target.atom], false_predicates: falsePredicates,
                    outside_target_preserved: outsideTargetPreserved, phases_covered: phasesCovered,
                    rejected_coverage_components: rejectedCoverage,
                    positive_oracle_matched: resultPreserved, proof_satisfied: candidate.observed.proof_satisfied,
                    content_and_structure_preserved: true, graph_accepted: false, financial_receipt: false,
                    matched, trace_sha256: sha(canonicalValue(candidate.observed.trace)) });
            } catch (error) { pending(requirement, error.message); }
        }
        } finally { scope?.seal(); }
    } } finally { ledger?.finish(); }
    return freezeDeep({ stage: pathSemantic ? 'path_semantic_v2_subset_only' : 'scalar_equality_predicate_strategy_subset_only', global_g11: false,
        artifact_authority: 'self_built_local_not_reviewed_host',
        scope: pathSemantic ? 'predicate_path_semantic/same_type_wrong_path' : 'predicate_strategy/compatible_wrong_operator/eq', predicate_atom_credit: 0,
        full_scalar_scope_expected: scoped.length, mutations: counts, baselines, rows, unsatisfied,
        qualification_boundary: pathSemantic ? 'authored_locator_full_admission_and_unmodified_dp' : boundary ? 'authoring_plus_isolated_final_assertion' : 'historical_authored_mutant_only',
        parent_source: boundary ? 'same_batch_positive_oracle_and_coverage_verified' : 'pending',
        authoring_probe: boundary && !pathSemantic ? { mutations: authoringCounts, rows: authoringRows } : null,
        semantic_assertion_fault: boundary && !pathSemantic ? { mutations: semanticCounts } : null,
        batch_complete: Object.values(counts).every(value => value === counts.expected) && !unsatisfied.length
            && (!boundary || pathSemantic || [authoringCounts, semanticCounts].every(ledger => Object.values(ledger).every(value => value === ledger.expected))),
        graph_accepted: false, financial_receipt: false, oracle_sha256: sha(oracleSource) });
}
