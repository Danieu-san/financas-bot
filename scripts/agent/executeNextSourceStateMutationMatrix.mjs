import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAdmittedSchemaValidators } from './buildNextProvenanceArtifacts.mjs';
import { buildMetricChildCapsule, buildAvailableMetricArtifacts } from './buildNextMetricArtifacts.mjs';
import { buildPhaseProofProgram } from './lowerNextProofProgram.mjs';
import { loadLocalAuthoringPackage } from './executeNextDomainInvariantMatrix.mjs';

const require = createRequire(import.meta.url);
const { admitPackage, admittedDocuments } = require('../../src/next/provenance/packageContract');
const { compileAuthoringIR, compileSnapshotAccess } = require('../../src/next/provenance/graphCompiler');
const mutations = require('../../src/next/provenance/mutationWitnesses');
const { admitArtifact } = require('../../src/next/provenance/artifactLoader');
const { runAdmittedGraph } = require('../../src/next/provenance/executionHost');
const { comparePhaseCoverage } = require('../../src/next/provenance/proofAcceptance');
const { admitPhaseCompositionProfile, PROFILE_PATH } = require('../../src/next/provenance/phaseCompositionProfile');
const { canonicalValue, freezeDeep } = require('../../src/next/kernel/canonicalValue');
const { sealSourceStateReference, qualifySourceStateNegative } = require('./sourceStateNegativeReference.cjs');
const prefix = 'docs/contracts/next/provenance-v2/';
const fixturePaths = new Set(['golden-conversation-set-v1', 'golden-fact-contracts-v1',
    'golden-financial-fixture-v1', 'golden-claim-oracles-v1']
    .map(name => `tests/fixtures/financasbot-next/${name}.json`));
const root = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const equal = (a, b) => canonicalValue(a) === canonicalValue(b);
const fail = code => { throw new Error(`source_state_matrix_${code}`); };

function input(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const descriptors = Object.getOwnPropertyDescriptors(raw);
    const names = ['packageReceipt', 'fact_keys'];
    if (Reflect.ownKeys(descriptors).length !== names.length
        || names.some(name => !descriptors[name]?.enumerable || !Object.hasOwn(descriptors[name], 'value'))) fail('input');
    const keys = descriptors.fact_keys.value;
    if (types.isProxy(keys) || !Array.isArray(keys) || Object.getPrototypeOf(keys) !== Array.prototype) fail('input');
    const values = Object.getOwnPropertyDescriptors(keys);
    if (!keys.length || keys.length > 76 || Reflect.ownKeys(values).length !== keys.length + 1) fail('input');
    const factKeys = Array.from({ length: keys.length }, (_, index) => {
        const value = values[index];
        if (!value?.enumerable || !Object.hasOwn(value, 'value') || typeof value.value !== 'string'
            || !/^[A-Z]-\d{2}#\d+#\d+$/.test(value.value)) fail('input');
        return value.value;
    });
    if (new Set(factKeys).size !== factKeys.length) fail('input');
    return { packageReceipt: descriptors.packageReceipt.value, factKeys };
}

function sourceAt(relative) {
    if (typeof relative !== 'string' || !/^[A-Za-z0-9_.\/-]+\.json$/.test(relative)
        || !relative.startsWith(prefix) && !fixturePaths.has(relative)
        || relative.split('/').some(part => !part || part === '.' || part === '..')) fail('path');
    const resolved = fs.realpathSync(path.join(root, relative));
    if (path.relative(root, resolved).split(path.sep).join('/') !== relative || !fs.statSync(resolved).isFile()) fail('containment');
    return fs.readFileSync(resolved, 'utf8').replaceAll('\r\n', '\n');
}

function artifact(source, kind, entry, extra) {
    const files = [{ path: entry, bytes: Buffer.from(source) }];
    if (extra) files.push({ path: extra.path, bytes: Buffer.from(extra.source) });
    const manifestBytes = Buffer.from(canonicalValue({ format: 'financasbot.provenance.artifact', version: 1,
        kind, entry, files: files.map(row => ({ path: row.path, sha256: sha(row.bytes),
            media_type: row.path.endsWith('.json') ? 'application/json' : 'text/javascript' })) }));
    return admitArtifact({ manifestBytes, expectedRoot: sha(manifestBytes), entries: files });
}

// HARNESS-only subset. Inputs are opaque admission + fact keys, never traces,
// expected results, counters or a caller's predicate classification.
export async function executeSourceStateMutationBatch(raw) {
    const { packageReceipt, factKeys } = input(raw);
    const documents = admittedDocuments(packageReceipt);
    const byPath = new Map(documents.map(row => [row.path, row]));
    const corpus = byPath.get(prefix + 'graphs-v2.json')?.value;
    if (!corpus) fail('corpus');
    const entries = documents.map(row => {
        const bytes = Buffer.from(sourceAt(row.path));
        if (sha(bytes) !== row.sha256) fail('source_mismatch');
        return { path: row.path, bytes };
    });
    const { validators, schemaHashes } = buildAdmittedSchemaValidators(packageReceipt);
    const ir = compileAuthoringIR(packageReceipt, validators);
    const plan = compileSnapshotAccess(packageReceipt, validators);
    const registry = byPath.get(corpus.metric_evaluator_registry.path)?.value;
    const inventory = mutations.enumerateMutationRequirements({ packageReceipt, ir,
        graphSchema: byPath.get(prefix + 'provenance-graph.schema.json')?.value,
        materialRegistry: byPath.get(corpus.material_registry.path)?.value,
        operatorRegistry: byPath.get(corpus.operator_registry.path)?.value,
        evaluatorRegistry: registry, witnessContracts: byPath.get(prefix + 'evaluator-witness-contracts-v1.json')?.value });
    const graphMap = new Map(corpus.graphs.map(graph => [graph.fact_key, graph]));
    if (factKeys.some(key => !graphMap.has(key))) fail('fact_key');
    const requested = new Set(factKeys);
    const predicates = inventory.requirements.filter(row => row.family === 'predicate_atom');
    // This narrow scope is explicit, not a substitute for the complete family.
    const scoped = predicates.filter(row => {
        const graph = graphMap.get(row.target.fact_key);
        const predicate = graph.predicates.find(item => item.id === row.target.predicate_id);
        const field = predicate.args?.[0]?.field;
        return predicate.op === 'eq' && ['period', 'coverage'].includes(predicate.atom)
            && graph.nodes[field?.node]?.kind === 'source_state';
    });
    const targets = scoped.filter(row => requested.has(row.target.fact_key));
    if (!targets.length) fail('empty_scope');
    const profile = admitPhaseCompositionProfile({ source: sourceAt(PROFILE_PATH), registry });
    const child = artifact(buildMetricChildCapsule().source, 'tcb', 'bootstrap.js');
    const metrics = new Map(buildAvailableMetricArtifacts().built.map(row => [row.evaluator_id, row]));
    const claims = new Map(byPath.get(corpus.claim_contract.path).value.claims.map(claim => [claim.fact_key, claim]));
    const oracleSource = sourceAt('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json');
    const oracles = JSON.parse(oracleSource);
    if (oracles.synthetic !== true) fail('oracle');
    const counts = { expected: targets.length, generated: 0, executed: 0, matched: 0 };
    const rows = []; const unsatisfied = []; const baselines = [];
    const unresolved = (requirement, cause) => unsatisfied.push({
        mutation_id: requirement.mutation_id, target: requirement.target,
        code: 'UNSATISFIED_MUTATION_WITNESS', cause });

    async function capture(currentPlan, graph, claim, metric, executionId = 'source-state-baseline') {
        const selector = { fact_key: graph.fact_key };
        const built = buildPhaseProofProgram({ proof: currentPlan.projectProofProgram(selector).input,
            derivation: currentPlan.projectDerivationProgram(selector, profile).input }, profile);
        const proof = artifact(built.source, 'proof', 'bundle.js', built.profileInput);
        const proofConfig = currentPlan.projectProofTransport(selector).config;
        const transport = currentPlan.projectMetricTransport(selector);
        const observed = await runAdmittedGraph({ childCapsuleReceipt: child, executionId,
            invocationId: graph.fact_key, timeoutMs: 5000,
            derivation: { artifactReceipt: metric, bindings: [], directGroups: transport.directGroups,
                nodeSets: transport.nodeSets, derivationBindings: currentPlan.projectDerivationBindings(selector) },
            proof: { ...proofConfig, artifactReceipt: proof } });
        if (observed.observed_child_capsule_root !== child.observed_root
            || observed.observed_evaluator_artifact_root !== metric.observed_root
            || observed.observed_proof_engine_artifact_root !== proof.observed_root) fail('roots');
        const coverage = {};
        for (const phase of ['derivation', 'proof']) {
            const { evidence_set_mode, ...expected } = graph.trace_contract[phase];
            const isProof = phase === 'proof';
            const bindings = isProof ? proofConfig.proofSelections.map(row => ({ role: `proof/set/${row.candidate_set}`,
                candidate_set: row.candidate_set, selected_set: row.selected_set })) : expected.required_selections.map(selection => {
                    const roles = Object.entries(claim.operand_bindings).filter(([, binding]) => binding.kind === 'node_set'
                        && equal(binding.aliases, graph.sets[selection.candidate_set]));
                    if (roles.length !== 1) fail('selection_binding');
                    return { role: roles[0][0], ...selection };
                });
            coverage[phase] = comparePhaseCoverage({ executionId, invocationId: graph.fact_key, phase,
                trace: observed.trace, expected, sets: graph.sets, bindings,
                operandSets: isProof ? proofConfig.proofSets.map(row => ({ role: `proof/set/${row.name}`, aliases: row.roster }))
                    : Object.entries(claim.operand_bindings).filter(([, binding]) => binding.kind === 'node_set')
                        .map(([role, binding]) => ({ role, aliases: binding.aliases })),
                accessBindings: currentPlan.observationMetadata({ fact_key: graph.fact_key, phase }),
                measurements: isProof ? [{ measurement: 'proof_engine_artifact_root', observed: proof.observed_root }]
                    : [{ measurement: 'evaluator_artifact_root', observed: metric.observed_root },
                        { measurement: 'proof_engine_artifact_root', observed: proof.observed_root }] });
        }
        return { observed, coverage };
    }

    for (const key of factKeys) {
        const graph = graphMap.get(key); const selected = targets.filter(row => row.target.fact_key === key);
        if (!selected.length) continue;
        if (Object.values(graph.nodes).some(node => node.binding !== 'snapshot')) {
            selected.forEach(row => unresolved(row, 'parent_execution_required'));
            continue;
        }
        const claim = claims.get(key); const builtMetric = metrics.get(claim?.evaluator_ref.evaluator_id);
        if (!builtMetric || builtMetric.evaluator_version !== claim.evaluator_ref.evaluator_version) fail('metric');
        const metric = artifact(builtMetric.source, 'metric', 'bundle.js');
        const selector = { fact_key: key };
        const diagnostic = plan.inspectProofPredicates(selector, () => {});
        const baseline = await capture(plan, graph, claim, metric);
        const [conversation, turn, ordinal] = key.split('#');
        const oracle = oracles.turns?.[`${conversation}#${turn}`]?.facts?.[Number(ordinal) - 1];
        if (!oracle || oracle.metric !== claim.metric || !equal(baseline.observed.functional_result.value, oracle.value)
            || baseline.observed.functional_result.unit !== oracle.unit || diagnostic.satisfied !== true
            || baseline.observed.proof_satisfied !== true || !Object.values(baseline.coverage).every(row => row.matched)) fail('baseline');
        baselines.push({ fact_key: key, proof_satisfied: true, oracle_matched: true,
            functional_result_sha256: sha(canonicalValue(baseline.observed.functional_result)) });
        for (const requirement of selected) {
            let generated;
            try {
                generated = requirement.target.atom === 'period'
                    ? mutations.materializeMonthRelationMutation({ packageReceipt, fact_key: key,
                        predicate_id: requirement.target.predicate_id })
                    : mutations.materializeEnumEqualityMutationVariant({ packageReceipt, fact_key: key,
                        predicate_id: requirement.target.predicate_id, variant_index: selected.indexOf(requirement) });
            } catch (error) {
                unresolved(requirement, error.message); continue;
            }
            if (generated.mutation_id !== requirement.mutation_id || !equal(generated.target, requirement.target)
                || !equal(generated.expected_violations, [requirement.target.atom])) fail('coordinate');
            counts.generated++;
            try {
                const changes = new Map(generated.changes.map(row => [row.path, row]));
                if (changes.size !== generated.changes.length || [...changes].some(([name, row]) => !byPath.has(name)
                    || sha(row.source) !== row.sha256)) fail('changes');
                const graphPath = prefix + 'graphs-v2.json';
                const changedCorpus = JSON.parse(changes.get(graphPath)?.source || 'null');
                if (!changedCorpus || changedCorpus.graphs.length !== corpus.graphs.length) fail('graph_preservation');
                // The semantic witness may repair identity/fingerprint metadata,
                // never the authored predicate, selections or expected trace.
                const normalized = structuredClone(changedCorpus);
                normalized.snapshot_manifest.hash = corpus.snapshot_manifest.hash;
                for (let index = 0; index < corpus.graphs.length; index++) {
                    const before = corpus.graphs[index]; const after = normalized.graphs[index];
                    if (after.fact_key !== before.fact_key || !equal(Object.keys(after.nodes), Object.keys(before.nodes))) fail('graph_preservation');
                    for (const [alias, node] of Object.entries(before.nodes)) if (node.binding === 'snapshot') {
                        after.nodes[alias].version = node.version;
                        after.nodes[alias].semantic_fingerprint = node.semantic_fingerprint;
                    }
                    if (after.predicates.length !== before.predicates.length) fail('graph_preservation');
                    for (let position = 0; position < before.predicates.length; position++) {
                        const predicate = before.predicates[position];
                        if (predicate.op === 'fingerprint_is') {
                            const candidate = after.predicates[position];
                            if (candidate.id !== predicate.id || !candidate.args?.[1]?.literal) fail('graph_preservation');
                            candidate.args[1].literal.value = predicate.args[1].literal.value;
                        }
                    }
                }
                if (!equal(normalized, corpus)) fail('graph_preservation');
                const changedEntries = entries.map(row => ({ path: row.path,
                    bytes: changes.has(row.path) ? Buffer.from(changes.get(row.path).source) : Buffer.from(row.bytes) }));
                const mutantReceipt = admitPackage({ entries: changedEntries,
                    authority: changedEntries.map(row => ({ path: row.path, sha256: sha(row.bytes) })) });
                const changed = compileSnapshotAccess(mutantReceipt, validators);
                // Independently compute and seal expected functional behavior BEFORE D/P.
                const referenceReceipt = sealSourceStateReference({ baselineReceipt: packageReceipt,
                    mutantReceipt, requirement });
                const actual = changed.inspectProofPredicates(selector, () => {});
                const negativeExecutionId = 'ss-' + requirement.mutation_id.slice(7);
                const candidate = await capture(changed, graph, claim, metric, negativeExecutionId);
                counts.executed++;
                const falsePredicates = actual.results.filter(row => !row.satisfied);
                // Diagnostic subset only: this is not a classification of
                // trace, functional-result or all other proof barriers.
                const falsePredicateAtoms = [...new Set(falsePredicates.map(row => row.atom))].sort();
                const qualification = qualifySourceStateNegative({ referenceReceipt, mutantReceipt,
                    observed: candidate.observed, coverage: candidate.coverage, predicates: actual,
                    baselinePredicates: diagnostic, expectedViolations: generated.expected_violations,
                    executionId: negativeExecutionId });
                const otherPredicatesMatch = qualification.other_atoms_preserved;
                const coverageMatches = Object.values(candidate.coverage).every(row => row.matched);
                const resultMatches = equal(candidate.observed.functional_result, baseline.observed.functional_result);
                const matched = qualification.negative_witness_qualified;
                if (qualification.oracle_sha256 !== sha(oracleSource)) fail('oracle_seal_mismatch');
                if (matched) counts.matched++;
                else unresolved(requirement, 'qualification_mismatch');
                rows.push({ mutation_id: requirement.mutation_id, target: requirement.target,
                    expected_violations: [requirement.target.atom], false_predicates: falsePredicates,
                    false_predicate_atoms: falsePredicateAtoms,
                    other_predicates_match: otherPredicatesMatch, phases_covered: coverageMatches,
                    functional_result_preserved: resultMatches, matched, ...qualification,
                    content_mutation: generated.patch,
                    candidate_functional_result_sha256: sha(canonicalValue(candidate.observed.functional_result)),
                    candidate_trace_sha256: sha(canonicalValue(candidate.observed.trace)) });
            } catch (error) {
                unresolved(requirement, error.message);
            }
        }
    }
    return freezeDeep({ stage: 'source_state_predicate_subset_executed_only', global_g11: false,
        graph_accepted: false, financial_receipt: false, artifact_authority: 'self_built_local_not_reviewed_host',
        authority_refs: ir.authority_refs, schema_sources: schemaHashes, oracle_sha256: sha(oracleSource),
        requested_fact_keys: factKeys, source_state_scope_expected: scoped.length,
        predicate_family_expected: predicates.length, predicate_family_pending: predicates.length - counts.matched,
        mutations: counts, batch_complete: Object.values(counts).every(value => value === counts.expected)
            && unsatisfied.length === 0, baselines, rows, unsatisfied });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv.length !== 3 || process.argv[2] !== '--check') fail('usage: --check');
    const result = await executeSourceStateMutationBatch({ packageReceipt: loadLocalAuthoringPackage(), fact_keys: ['M-01#1#1'] });
    console.log(JSON.stringify(result));
    if (!result.batch_complete) process.exitCode = 1;
}
