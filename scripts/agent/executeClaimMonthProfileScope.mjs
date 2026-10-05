// Local, quarantined qualification. Never a product freeze or financial API.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { types } from 'node:util';
import { createRequire } from 'node:module';
import { loadLocalAuthoringPackage } from './executeNextDomainInvariantMatrix.mjs';
import { buildAdmittedSchemaValidators } from './buildNextProvenanceArtifacts.mjs';
import { buildCapturedValidationTools } from './buildNextValidationTcb.mjs';
import { buildAvailableMetricArtifacts, buildExecutionRegistryCandidate } from './buildNextMetricArtifacts.mjs';
import { buildPhaseProofProgram, buildClaimMonthPhaseProofProgram } from './lowerNextProofProgram.mjs';
const require = createRequire(import.meta.url);
const { admittedDocuments } = require('../../src/next/provenance/packageContract');
const { compileAuthoringIR } = require('../../src/next/provenance/graphCompiler');
const { enumeratePathInventoryCandidate, verifyMaterializedPathMigration, FROZEN_V1_HASH } = require('../../src/next/provenance/pathMutationInventory');
const { admitPhaseCompositionProfile, PROFILE_PATH } = require('../../src/next/provenance/phaseCompositionProfile');
const { proofProgramIdentity } = require('../../src/next/provenance/phaseProgramIdentity');
const { canonicalValue } = require('../../src/next/kernel/canonicalValue');
const { copyData } = require('../../src/next/provenance/observationContract');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const sourceAt = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
const same = (a, b) => canonicalValue(structuredClone(a)) === canonicalValue(structuredClone(b));
const fail = code => { throw new Error('claim_month_scope_' + code); };
function measuredInputs() {
    const rows = [];
    const visit = relative => {
        const file = path.join(root, relative); const stat = fs.lstatSync(file);
        if (stat.isSymbolicLink()) fail('measured_reparse_point');
        if (stat.isDirectory()) fs.readdirSync(file).sort().forEach(name => visit(path.join(relative, name)));
        else if (stat.isFile()) rows.push([relative.replaceAll('\\', '/'), sha(fs.readFileSync(file))]);
        else fail('measured_not_regular');
    };
    ['src/next', 'docs/contracts/next/provenance-v2', 'tests/fixtures/financasbot-next', 'package-lock.json',
        'scripts/agent/buildNextValidationTcb.mjs', 'scripts/agent/buildNextMetricArtifacts.mjs',
        'scripts/agent/buildNextProvenanceArtifacts.mjs', 'scripts/agent/lowerNextProofProgram.mjs',
        'scripts/agent/executeNextDomainInvariantMatrix.mjs', 'scripts/agent/executeClaimMonthProfileScope.mjs',
        'docs/audit-evidence/n02g-causal-authoring-profile/path-inventory-v1-frozen.json',
        'docs/audit-evidence/n02g-causal-authoring-profile/path-authorship-v1-frozen.json',
        'docs/audit-evidence/n02g-causal-authoring-profile/path-inventory-v1-v2-migration-r2.json'].forEach(visit);
    return sha(JSON.stringify(rows.sort()));
}

function coverage(graph, claim, access, selector, config, roots) {
    return Object.fromEntries(['derivation', 'proof'].map(phase => {
        const { evidence_set_mode, ...expected } = graph.trace_contract[phase];
        const proof = phase === 'proof';
        const bindings = proof ? config.proofSelections.map(row => ({ role: `proof/set/${row.candidate_set}`, ...row }))
            : expected.required_selections.map(selection => {
                const roles = Object.entries(claim.operand_bindings).filter(([, row]) => row.kind === 'node_set'
                    && same(row.aliases, graph.sets[selection.candidate_set]));
                if (roles.length !== 1) fail('selection_binding'); return { role: roles[0][0], ...selection };
            });
        return [phase, { expected, sets: graph.sets, bindings,
            operandSets: proof ? config.proofSets.map(row => ({ role: `proof/set/${row.name}`, aliases: row.roster }))
                : Object.entries(claim.operand_bindings).filter(([, row]) => row.kind === 'node_set').map(([role, row]) => ({ role, aliases: row.aliases })),
            accessBindings: access.observationMetadata({ fact_key: selector.fact_key, phase }),
            measurements: [{ measurement: 'validation_tcb_root', observed: roots.tcb },
                { measurement: 'proof_engine_artifact_root', observed: roots.proof },
                ...(!proof ? [{ measurement: 'evaluator_artifact_root', observed: roots.metric },
                    { measurement: 'evaluator_contract_hash', observed: roots.contract }] : [])] }];
    }));
}

// Supplemental differential control, not an oracle or authored expected trace.
// Each invocation must first pass the independently sealed coverage/fringe and
// frozen-root checks. Compare the complete ordered core, retaining site/origin
// and every outcome. Only invocation metadata and the separately checked
// per-variant proof artifact identity are normalized.
export function compareClaimMonthControlCore(raw, predicateId) {
    if (types.isProxy(raw) || !Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype) fail('core_controls');
    const descriptors = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(descriptors).length !== 4 || descriptors.length.value !== 3
        || [0, 1, 2].some(index => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], 'value'))) fail('core_controls');
    // Keep the existing admission budget per invocation; do not increase the
    // observation limit merely because three independent controls are compared.
    const controls = [0, 1, 2].map(index => copyData(descriptors[index].value));
    if (typeof predicateId !== 'string' || !predicateId || !Array.isArray(controls)
        || controls.length !== 3 || !same(controls.map(row => row.variant), ['C', 'M', 'S'])
        || controls.some(row => !row.trace || !Array.isArray(row.trace.derivation_trace)
            || !Array.isArray(row.trace.proof_trace) || !Array.isArray(row.proof_site_reads))) fail('core_controls');
    const entries = trace => trace.filter(row => row.measurement !== 'proof_engine_artifact_root')
        .map(({ sequence, invocation_id, ...entry }) => entry);
    const projections = controls.map(row => ({ variant: row.variant, core: {
        derivation: entries(row.trace.derivation_trace),
        proof_measurements: entries(row.trace.proof_trace.filter(entry => !entry.operation)),
        proof_reads: row.proof_site_reads.filter(entry => entry.site !== predicateId)
    } }));
    return { matched: projections.slice(1).every(row => same(row.core, projections[0].core)),
        control_core_sha256: projections.map(row => ({ variant: row.variant, sha256: sha(canonicalValue(structuredClone(row.core))) })) };
}

export async function executeClaimMonthProfileScope(target) {
    target = copyData(target);
    if (!target || Object.keys(target).sort().join(',') !== 'fact_key,predicate_id'
        || typeof target.fact_key !== 'string' || typeof target.predicate_id !== 'string') fail('target');
    const measuredBefore = measuredInputs();
    const packageReceipt = loadLocalAuthoringPackage();
    const documents = admittedDocuments(packageReceipt);
    const corpus = documents.find(row => row.path.endsWith('/graphs-v2.json')).value;
    const graph = corpus.graphs.find(row => row.fact_key === target.fact_key);
    const claim = documents.find(row => row.path === corpus.claim_contract.path).value.claims.find(row => row.fact_key === target.fact_key);
    if (!graph || !claim || Object.values(claim.operand_bindings).some(row => row.kind === 'parent_claim')) fail('scope_parents_not_provided');
    const ir = compileAuthoringIR(packageReceipt, buildAdmittedSchemaValidators(packageReceipt).validators);
    const inventory = enumeratePathInventoryCandidate({ packageReceipt, ir });
    const requirements = inventory.requirements.filter(row => row.family === 'predicate_path_semantic');
    const selected = requirements.filter(row => row.target.fact_key === target.fact_key && row.target.predicate_id === target.predicate_id);
    if (selected.length !== 1) fail('inventory_target');
    const requirement = selected[0];
    const evidence = name => sourceAt('docs/audit-evidence/n02g-causal-authoring-profile/' + name);
    const migration = verifyMaterializedPathMigration({ packageReceipt, ir,
        frozenSource: evidence('path-inventory-v1-frozen.json'), expectedFrozenHash: FROZEN_V1_HASH,
        frozenAuthorshipSource: evidence('path-authorship-v1-frozen.json'), migrationSource: evidence('path-inventory-v1-v2-migration-r2.json') });
    // Independent positive oracle bytes are frozen before compile/execution of M.
    const oracleSource = sourceAt('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json');
    const oracles = JSON.parse(oracleSource); const [conversation, turn, ordinal] = target.fact_key.split('#');
    const oracle = oracles.turns?.[`${conversation}#${turn}`]?.facts?.[Number(ordinal) - 1];
    if (oracles.synthetic !== true || !oracle || oracle.metric !== claim.metric) fail('positive_oracle');
    const tcb = buildCapturedValidationTools();
    const tools = vm.runInThisContext(`(function(require){return ${tcb.entries.find(row => row.path === 'host-bootstrap.js').source}\n})`)(specifier => {
        if (!tcb.nativeExternals.includes(specifier)) fail('ambient_import'); return require(specifier);
    });
    const entries = documents.map(row => ({ path: row.path, bytes: Buffer.from(sourceAt(row.path)) }));
    if (entries.some((row, index) => sha(row.bytes) !== documents[index].sha256)) fail('source_changed');
    const authority = documents.map(row => ({ path: row.path, sha256: row.sha256 })).sort((a, b) => a.path < b.path ? -1 : 1);
    const capturedPackage = tools.admitPackage({ entries, authority });
    const authoringRegistry = documents.find(row => row.path === corpus.metric_evaluator_registry.path).value;
    const profileSource = sourceAt(PROFILE_PATH);
    const phase = tools.admitPhaseCompositionProfile({ registry: authoringRegistry, source: profileSource });
    const ambientPhase = admitPhaseCompositionProfile({ registry: authoringRegistry, source: profileSource });
    const accessC = tools.compileSnapshotAccess(capturedPackage); const selector = { fact_key: target.fact_key };
    const positiveInput = { derivation: accessC.projectDerivationProgram(selector, phase).input, proof: accessC.projectProofProgram(selector).input };
    const positive = buildPhaseProofProgram(positiveInput, ambientPhase);
    const registry = buildExecutionRegistryCandidate();
    const registryReceipt = tools.admitExecutionRegistry({ bytes: Buffer.from(registry.bytes), expectedHash: registry.registry_hash });
    const freeze = { schema_version: 1, freeze_id: 'provenance_execution', freeze_version: 1, stage: 'execution',
        metric_registry_hash: registry.registry_hash, validation_tcb_root: tcb.artifact_root, child_capsule_root: tcb.child.artifact_root,
        native_runtime: { platform: process.platform, arch: process.arch, node_version: process.version,
            node_binary_sha256: sha(fs.readFileSync(process.execPath)) }, package_authority: authority,
        proof_programs: [{ program_id: proofProgramIdentity(positiveInput.proof, positiveInput.derivation,
            tools.phaseCompositionCommitment(phase).sha256), proof_engine_artifact_root: positive.artifact_root }] };
    const freezeBytes = Buffer.from(canonicalValue(freeze));
    const freezeReceipt = tools.admitExecutionFreeze({ bytes: freezeBytes, expectedHash: sha(freezeBytes) });
    const positiveReceipt = tools.admitFrozenArtifact({ freezeReceipt, kind: 'proof', programId: freeze.proof_programs[0].program_id,
        manifestBytes: Buffer.from(positive.manifest), entries: [{ path: 'bundle.js', bytes: Buffer.from(positive.source) },
            { path: positive.profileInput.path, bytes: Buffer.from(positive.profileInput.source) }] });
    const tcbArtifactReceipt = tools.admitFrozenArtifact({ freezeReceipt, kind: 'tcb', programId: null,
        manifestBytes: Buffer.from(tcb.manifest), entries: tcb.entries.map(row => ({ path: row.path, bytes: Buffer.from(row.source) })) });
    const child = tcb.child;
    const childCapsuleReceipt = tools.admitFrozenArtifact({ freezeReceipt, kind: 'child', programId: null,
        manifestBytes: Buffer.from(child.manifest), entries: [{ path: 'bootstrap.js', bytes: Buffer.from(child.source) }] });
    const nativeRuntimeReceipt = tools.verifyNativeRuntime(freezeReceipt);
    const entry = authoringRegistry.entries.find(row => row.evaluator_id === claim.evaluator_ref.evaluator_id);
    const expectedOutput = documents.find(row => row.path === entry.contract_path).value.signature.output;
    const evaluatorContractReceipt = tools.admitExecutionContract({ registryReceipt, evaluatorRef: claim.evaluator_ref,
        bytes: entries.find(row => row.path === entry.contract_path).bytes });
    const metric = buildAvailableMetricArtifacts().built.find(row => row.evaluator_id === claim.evaluator_ref.evaluator_id);
    const metricReceipt = tools.admitArtifact({ manifestBytes: Buffer.from(metric.manifest), expectedRoot: metric.artifact_root,
        entries: [{ path: 'bundle.js', bytes: Buffer.from(metric.source) }] });
    const roots = { tcb: tcb.artifact_root, metric: metric.artifact_root, contract: entry.evaluator_contract_hash };
    const rawFor = (access, artifactReceipt, variant) => {
        const transport = access.projectMetricTransport(selector);
        return { executionId: randomUUID(), invocationId: `claim-month-${variant}-${randomUUID()}`, timeoutMs: 5000,
            childCapsuleReceipt, tcbArtifactReceipt, nativeRuntimeReceipt, evaluatorContractReceipt,
            derivation: { artifactReceipt: metricReceipt, bindings: [], directGroups: transport.directGroups,
                nodeSets: transport.nodeSets, parentGroups: transport.parentGroups, derivationBindings: access.projectDerivationBindings(selector) },
            proof: { artifactReceipt, ...access.projectProofTransport(selector).config } };
    };
    const positiveRaw = rawFor(accessC, positiveReceipt, 'positive');
    const positiveCoverage = coverage(graph, claim, accessC, selector, positiveRaw.proof, { ...roots, proof: positive.artifact_root });
    const normal = await tools.runAdmittedGraph(positiveRaw);
    const oracleMatches = result => same(result.functional_result.value, oracle.value)
        && result.functional_result.unit === claim.unit && result.functional_result.kind === expectedOutput.kind;
    if (!oracleMatches(normal) || !normal.proof_satisfied || ['derivation', 'proof'].some(phase => !tools.comparePhaseCoverage({
        ...positiveCoverage[phase], trace: normal.trace, executionId: positiveRaw.executionId, invocationId: positiveRaw.invocationId, phase }).matched)) fail('baseline');
    const preparation = tools.prepareClaimMonthQualification(capturedPackage, target);
    const mutantEntries = entries.map(row => {
        if (!row.path.endsWith('/graphs-v2.json')) return row;
        const value = structuredClone(corpus); value.graphs = structuredClone(preparation.transport.mutant_graphs);
        return { path: row.path, bytes: Buffer.from(JSON.stringify(value)) };
    });
    const mutant = tools.admitPackage({ entries: mutantEntries, authority: mutantEntries.map(row => ({ path: row.path, sha256: sha(row.bytes) })) });
    let standardMutantRefusal;
    try { tools.compileAuthoringIR(mutant); fail('standard_mutant_admitted'); }
    catch (error) { if (error.message !== 'graph_structure_claim_path') throw error; standardMutantRefusal = error.message; }
    const bindingArgs = { phaseProfileReceipt: phase, freezeReceipt, registryReceipt, artifactReceipt: positiveReceipt };
    const controls = []; const coreObservations = [];
    for (const variant of ['C', 'M', 'S']) {
        const compilation = tools.compileClaimMonthQualificationIR(variant === 'M' ? mutant : capturedPackage, preparation, variant);
        const plan = tools.prepareClaimMonthIsolatedPlan(compilation);
        const baseline = tools.admitClaimMonthFrozenBaseline(plan, bindingArgs);
        const access = tools.compileClaimMonthQualificationAccess(compilation);
        const built = buildClaimMonthPhaseProofProgram({ derivation: access.projectDerivationProgram(selector, phase).input,
            proof: access.projectProofProgram(selector).input }, phase, plan, tools, baseline);
        const invocation = rawFor(access, built.artifactReceipt, variant);
        const targetExpected = tools.sealClaimMonthTargetTrace(built.qualificationInput.source);
        const coreExpected = tools.sealClaimMonthCoreTrace(targetExpected,
            coverage(graph, claim, access, selector, invocation.proof, { ...roots, proof: built.artifact_root }));
        const actual = await tools.runClaimMonthQualifiedGraph(invocation, built.isolatedProofReceipt);
        const targetTrace = { profile_hash: actual.qualification_profile_hash, proof_satisfied: actual.proof_satisfied,
            proof_site_results: actual.proof_site_results, proof_site_reads: actual.proof_site_reads,
            qualification_observations: actual.qualification_observations };
        const fringe = tools.compareClaimMonthTargetTrace(targetExpected, targetTrace);
        const core = tools.compareClaimMonthCoreTrace(coreExpected, { executionId: invocation.executionId,
            invocationId: invocation.invocationId, trace: actual.trace, targetTrace });
        coreObservations.push({ variant, trace: actual.trace, proof_site_reads: actual.proof_site_reads });
        const falseIds = actual.proof_site_results.filter(row => !row.satisfied).map(row => row.site);
        const rejected = [...(!oracleMatches(actual) ? ['positive_oracle'] : []), ...(!core.core_trace_matched ? ['trace'] : []),
            ...(!fringe.fringe_trace_matched ? ['fringe'] : []), ...(!same(falseIds, variant === 'M' ? [target.predicate_id] : []) ? ['collateral_proof'] : []),
            ...(variant === 'M' && same(falseIds, [target.predicate_id]) ? ['period'] : [])];
        const qualified = same(rejected, variant === 'M' ? ['period'] : []) && actual.proof_satisfied === (variant !== 'M')
            && compilation.authorship_ir_conformance && built.authorship_program_conformance
            && actual.positive_baseline_frozen && actual.positive_freeze_hash === sha(freezeBytes)
            && actual.observed_validation_tcb_root === freeze.validation_tcb_root
            && actual.observed_evaluator_contract_hash === entry.evaluator_contract_hash
            && actual.financial_release_eligible === false && actual.receipt_created === false;
        controls.push({ variant, invocation_id: invocation.invocationId, execution_id: invocation.executionId,
            standard_baseline_admitted: true, qualification_profile_admitted: true,
            static_target_binding_transported: compilation.static_target_binding_transported,
            authorship_ir_conformance: compilation.authorship_ir_conformance, authorship_program_conformance: built.authorship_program_conformance,
            positive_oracle_matched: oracleMatches(actual), core_trace_matched: core.core_trace_matched, fringe_trace_matched: fringe.fringe_trace_matched,
            proof_satisfied: actual.proof_satisfied, target_assertion_rejected: falseIds.includes(target.predicate_id),
            false_predicate_ids: falseIds, rejected_barriers: rejected, qualified_control: qualified,
            profile_hash: actual.qualification_profile_hash, artifact_root: built.artifact_root,
            proof_ir_hash: plan.descriptor.proof_ir_hash, sidecar_hash: plan.descriptor.sidecar_hash,
            target_expected_hash: targetExpected.expected_hash, core_expected_hash: coreExpected.expected_hash,
            observed_trace_sha256: sha(canonicalValue(structuredClone(actual.trace))),
            original_corpus_witness_qualified: false, financial_release_eligible: false, receipt_created: false });
    }
    const differentialCore = compareClaimMonthControlCore(coreObservations, target.predicate_id);
    for (const control of controls) {
        control.core_trace_exact_matched = differentialCore.matched;
        control.core_trace_sha256 = differentialCore.control_core_sha256.find(row => row.variant === control.variant).sha256;
        if (!differentialCore.matched) {
            control.rejected_barriers.push('trace_exact'); control.qualified_control = false;
        }
    }
    if (sha(sourceAt('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json')) !== sha(oracleSource)
        || entries.some(row => sha(Buffer.from(sourceAt(row.path))) !== sha(row.bytes))) fail('source_changed');
    const unchanged = measuredInputs() === measuredBefore;
    if (!unchanged) fail('measured_sources_changed');
    const unique = new Set([positiveRaw.invocationId, ...controls.map(row => row.invocation_id)]).size === 4;
    const qualified = unique && controls.every(row => row.qualified_control);
    const row = { ...requirement, authority: 'path-domain-v2 + claim-month-path-completion/v1 ratificado',
        normative_commit: '04eb9545516d100aa45e1ac6d8ebfda444fafbd7', invocation_id: controls[1].invocation_id,
        generated: true, dp_execution: true, matched: qualified, profile_witness_qualified: qualified,
        original_corpus_witness_qualified: false, financial_release_eligible: false, receipt_created: false };
    return { format: 'financasbot.claim-month-profile.local-scope', schema_version: 1,
        local_freeze_only: true, freeze_sha256: sha(freezeBytes), oracle_sha256: sha(oracleSource),
        validation_tcb_root: freeze.validation_tcb_root, child_capsule_root: freeze.child_capsule_root,
        normal_baseline: { invocation_id: positiveRaw.invocationId, oracle_matched: true, proof_satisfied: true,
            artifact_root: positive.artifact_root, program_id: freeze.proof_programs[0].program_id },
        standard_financial_mutant_compiler_executed: true, standard_financial_mutant_refusal: standardMutantRefusal,
        scoped_mutations: { expected: 1, generated: 1, executed: 1, matched: Number(qualified) },
        semantic_inventory_expected: requirements.length, measured_sources_sha256: measuredBefore, measured_sources_unchanged: unchanged,
        semantic_inventory_ids_sha256: sha(requirements.map(item => item.mutation_id).sort().join('\n')),
        outside_scope_ids: requirements.filter(item => item.mutation_id !== requirement.mutation_id).map(item => item.mutation_id).sort(),
        outside_scope_pending_in_this_report: requirements.length - 1, migration_verified: migration.verified,
        unique_invocations: unique, exact_control_core_matched: differentialCore.matched,
        controls, row, scope_valid: qualified, activated: false,
        global_g11: false, financial_receipt: false, independent_code_audit: 'pending' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.version !== 'v22.17.0' || process.argv.length !== 3 || process.argv[2] !== '--check') fail('pinned_node_or_usage');
    const output = path.join(root, '.codex-temp/claim-month-profile-scope-20261004.json');
    const job = path.join(root, '.codex-temp/claim-month-profile-scope-job-20261004.json');
    if (fs.existsSync(output) || fs.existsSync(job)) fail('duplicate_invocation');
    const identity = { pid: process.pid, node: process.version, started_at: new Date().toISOString(),
        command: 'executeClaimMonthProfileScope.mjs --check', report: output, global_g11: false };
    fs.writeFileSync(job, JSON.stringify({ ...identity, state: 'claim_month_profile_scope_running' }) + '\n', { flag: 'wx' });
    try {
        const report = await executeClaimMonthProfileScope({ fact_key: 'M-01#1#1', predicate_id: 'binding_1' });
        fs.writeFileSync(output, JSON.stringify(report) + '\n', { flag: 'wx' });
        const summary = { ...identity, state: report.scope_valid ? 'completed_local_scope_only' : 'completed_with_pending',
            exit_code: report.scope_valid ? 0 : 1, report_sha256: sha(fs.readFileSync(output)), scoped_mutations: report.scoped_mutations,
            measured_sources_unchanged: report.measured_sources_unchanged, scope_valid: report.scope_valid,
            outside_scope_pending_in_this_report: report.outside_scope_pending_in_this_report, activated: false };
        fs.writeFileSync(job, JSON.stringify(summary) + '\n'); console.log(JSON.stringify(summary));
        if (!report.scope_valid) process.exitCode = 1;
    } catch (error) {
        fs.writeFileSync(job, JSON.stringify({ ...identity, state: 'blocked', exit_code: 1, error: error.message }) + '\n');
        console.error(error.message); process.exitCode = 1;
    }
}
