'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('N02G:PATH-V3-090 reference constructor basis covers the declared class but excludes ambiguous nominal record selector and incomplete witness cases', async () => {
    const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
    const file = path.resolve(__dirname, '../../../src/next/provenance/pathQualificationV3.js');
    const isolated = new Module(file); isolated.filename = file;
    isolated.paths = Module._nodeModulePaths(path.dirname(file));
    isolated._compile(fs.readFileSync(file, 'utf8') + '\nmodule.exports.testStructuralProjection = projectStructuralLocatorConstraint;', file);
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const input = await fixture();
    const docs = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = docs.get('docs/contracts/next/provenance-v2/graphs-v2.json');
    const registry = docs.get(corpus.material_registry.path), operatorRegistry = docs.get(corpus.operator_registry.path);
    const operator = operatorRegistry.operators.find(operator => operator.id === 'field_eq');
    let constructors = 0;
    for (const [kind, schema] of Object.entries(registry.kinds)) for (const [name, descriptor] of Object.entries(schema.fields)) {
        if (descriptor.class === 'non_material' || descriptor.type !== 'ref' || descriptor.targets.length !== 1) continue;
        // Test-only projector inputs exercise the descriptor class. They are
        // not genuine L, schema admission, independent review or execution.
        const graph = { nodes: { before: { kind }, after: { kind } }, predicates: [{ id: 'type_control', op: operator.id }] };
        const predicate = graph.predicates[0];
        const site = { authored_site: { definition: 'fieldPath', site_path: ['args', 0, 'field', 'segments'] },
            domain: { original: { node: 'before', segments: [name] },
                original_nominal: { form: 'scalar', type: 'id', kind: descriptor.targets[0] } } };
        const locator = { node: 'after', segments: [name] };
        const project = (changedRegistry = registry, changedSite = site, changedLocator = locator) => isolated.exports.testStructuralProjection(
            { registry: changedRegistry, claim: {}, operatorRegistry }, graph, predicate, changedSite, changedLocator).primitive_type_constraint;
        const positive = project(); constructors++;
        assert.equal(positive.status, 'same_normal_single_target_reference_id_under_explicit_premises');
        assert.equal(positive.conditional_preservation_verified, true);
        assert.deepEqual(positive.alternative_nominal, site.domain.original_nominal);
        for (const replacement of [
            { ...descriptor, targets: [...descriptor.targets, 'another_kind'] },
            { ...descriptor, targets: ['another_kind'] },
            { ...descriptor, type: 'ref_list' }, { ...descriptor, type: 'typed_result' }
        ]) {
            const changed = structuredClone(registry); changed.kinds[kind].fields[name] = replacement;
            const negative = project(changed);
            assert.equal(negative.conditional_preservation_verified, false);
            assert.equal(negative.status, 'blocked_reference_record_or_nominal_basis');
            assert.equal(negative.discharged, false); assert.equal(negative.qualified, false);
        }
        const selectorSite = { ...site, authored_site: { ...site.authored_site, definition: 'selector' },
            domain: { ...site.domain, original: { kind, segments: [name] } } };
        assert.equal(project(registry, selectorSite, { kind, segments: [name] }).conditional_preservation_verified, false);
    }
    assert.ok(constructors > 3, 'descriptor class must not be reduced to three observed examples');
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const preparation = api.preparePathQualificationInventory(input);
    for (const [rowIndex, unavailable] of [[950, 16], [2308, 46]]) {
        const plan = api.preparePathQualificationWitnessPreselection({ preparation, rowIndex });
        assert.equal(plan.entries.filter(entry => entry.reference?.available !== true).length, unavailable);
        assert.equal(plan.conditional_domain_partition.conditional_witness_partition_complete, false);
        assert.ok(plan.conditional_domain_partition.entries.some(entry => entry.classification.startsWith('blocked_')));
        for (const field of ['admitted_domain_complete', 'witness_domain_complete', 'first_witness_proved', 'qualified', 'dp_execution'])
            assert.equal(plan[field], false);
        assert.equal(plan.semantic_mutation_credit, 0);
    }
});

test('N02G:PATH-V3-089 single target reference id constructor composes all genuine person domains without admission or execution credit', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const { compilePredicateTypes } = require('../../../src/next/provenance/predicateTypes');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const docs = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = docs.get('docs/contracts/next/provenance-v2/graphs-v2.json');
    const typeInput = { claims: docs.get(corpus.claim_contract.path).claims,
        snapshots: docs.get(corpus.snapshot_manifest.path).snapshots,
        materialRegistry: docs.get(corpus.material_registry.path), operatorRegistry: docs.get(corpus.operator_registry.path),
        claimSchema: docs.get('docs/contracts/next/provenance-v2/claim-contract.schema.json') };
    const projectedTypes = graph => compilePredicateTypes({ ...typeInput, graphs: [graph] })
        .typedGraphs[0].predicates.map(predicate => predicate.operands.map(operand => operand.type));
    let compared = 0;
    for (const [rowIndex, predicate, count, witnesses] of [
        [204, 'link_1_payment_owner', 16, [0, 1, 3, 8, 10, 15]],
        [1695, 'link_3_refund_person', 30, [2, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 17, 19, 20, 21, 22, 23, 25, 26, 27, 28, 29]],
        [1830, 'link_8_same_person', 30, [0, 1, 3, 9, 11, 15, 16, 18, 24, 26]]
    ]) {
        assert.equal(preparation.rows[rowIndex].target.predicate_id, predicate);
        const plan = api.preparePathQualificationWitnessPreselection({ preparation, rowIndex });
        const partition = plan.conditional_domain_partition;
        assert.equal(plan.entries.length, count);
        assert.ok(plan.entries.every(entry => entry.reference?.available === true));
        assert.equal(partition.conditional_admission_partition_complete, true, 'missing single-target ref ordinary type basis');
        assert.equal(partition.conditional_witness_partition_complete, true);
        assert.deepEqual(partition.entries.filter(entry => entry.classification === 'conditional_witness')
            .map(entry => entry.entry_index), witnesses);
        assert.equal(plan.selected.entry_index, witnesses[0]);
        const foundation = plan.admission_foundation.admission_foundation;
        for (const site of foundation.sites) for (const frame of site.frames) {
            const type = frame.structural_locator_constraint.primitive_type_constraint;
            assert.equal(type.status, 'same_normal_single_target_reference_id_under_explicit_premises');
            assert.deepEqual(type.baseline_nominal, { form: 'scalar', type: 'id', kind: 'person' });
            assert.deepEqual(type.alternative_nominal, type.baseline_nominal);
            assert.equal(type.compiler_result_used, false); assert.equal(type.discharged, false);
        }
        assert.equal(Object.values(partition.required_premises).length, 6);
        assert.ok(Object.values(partition.required_premises).every(value => value === false));
        for (const value of [plan, partition]) {
            for (const field of ['admitted_domain_complete', 'witness_domain_complete', 'first_witness_proved', 'qualified', 'dp_execution'])
                assert.equal(value[field], false);
            assert.equal(value.semantic_mutation_credit, 0);
        }
        // Ordinary checker comparisons are regression controls only, never
        // the authorial basis of A/W or an operational expected after M.
        const graph = corpus.graphs.find(graph => graph.fact_key === preparation.rows[rowIndex].target.fact_key);
        const baseline = projectedTypes(graph);
        for (const entry of plan.entries) {
            const mutant = structuredClone(graph); let parent = mutant;
            const location = foundation.sites[entry.site_index].graph_location;
            for (const token of location.slice(0, -1)) parent = parent[token];
            parent[location.at(-1)] = structuredClone(entry.locator);
            assert.deepEqual(projectedTypes(mutant), baseline); compared++;
        }
        assert.throws(() => api.preparePathQualificationWitnessPreselection({ preparation, rowIndex }), /witness_preselection_replay/);
    }
    assert.equal(compared, 76);
});

test('N02G:PATH-V3-088 reusable external rule scope seals complete A W before compile and retains fresh identity without audit or execution credit', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const fs = require('node:fs'), path = require('node:path');
    const hash = value => 'sha256:' + require('node:crypto').createHash('sha256').update(value).digest('hex');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input), phaseProfile = await phaseFixture();
    const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
        && row.target.predicate_id === 'link_2_refund_sign');
    const plan = api.preparePathQualificationWitnessPreselection({ preparation, rowIndex });
    // Synthetic constructor scope, generated BEFORE compile from genuine
    // authorial/reference inputs. It is not independent review or authority
    // for an operational invocation, and is never used to run guest D/P.
    const shadow = api.materializePathQualificationLocator({ preparation, rowIndex,
        siteIndex: plan.selected.site_index, locatorIndex: plan.selected.locator_index });
    const expectation = contract.sealPathCandidateProgramExpectation({
        authorship: api.preparePathCandidateProgramAuthorship({ candidate: shadow, phaseProfile }) });
    const capture = compiler.capturePathQualificationCompiler();
    const normalize = entries => entries.map(entry => {
        const { invocation_id, ...stable } = entry;
        if (stable.reference !== null) { const { invocation_id: ignored, ...reference } = stable.reference; stable.reference = reference; }
        return stable;
    });
    const stableEntries = normalize(plan.entries);
    const stablePartition = { ...plan.conditional_domain_partition, entries: plan.conditional_domain_partition.entries
        .map(member => ({ ...member, reference_sha256: stableEntries[member.entry_index].reference === null ? null
            : hash(canonicalValue(stableEntries[member.entry_index].reference)) })) };
    const perSite = plan.admission_foundation.sites.map(site => {
        const members = stablePartition.entries.filter(member => member.site_index === site.site_index);
        return { site_index: site.site_index, L: members.map(member => member.locator_index),
            A: members.filter(member => ['conditional_witness', 'conditional_non_witness'].includes(member.classification))
                .map(member => member.locator_index),
            W: members.filter(member => member.classification === 'conditional_witness').map(member => member.locator_index),
            excluded: members.filter(member => member.classification === 'necessary_exclusion_pending_native_barrier')
                .map(member => member.locator_index) };
    });
    const producers = ['src/next/provenance/pathQualificationV3.js', 'src/next/provenance/pathLocatorDomainV3.js',
        'src/next/provenance/pathMutationInventory.js', 'src/next/provenance/pathSemanticReference.js',
        'scripts/agent/capturePathQualificationCompiler.mjs', 'scripts/agent/pathProofProgramContract.mjs',
        'scripts/agent/pathExecutableClosureContract.mjs', 'scripts/agent/pathCapabilityEffectContract.mjs',
        'scripts/agent/pathReceiverOriginContract.mjs'];
    const snapshotReference = { ...expectation.normal_admission_checker_reference };
    for (const key of ['sources', 'schema_reference_sources']) snapshotReference[key] = snapshotReference[key].map(row => {
        const { source, ...metadata } = row;
        const source_chunks = Array.from({ length: Math.ceil(source.length / 65536) },
            (_, index) => source.slice(index * 65536, (index + 1) * 65536));
        assert.equal(source_chunks.join(''), source);
        assert.equal(hash(source_chunks.join('')), row.sha256);
        return { ...metadata, source_chunks };
    });
    const core = { method_authority: plan.method_authority, target_id: plan.target_id, target: shadow.target,
        baseline_package: plan.baseline_package, phase_profile_sha256: expectation.profile_sha256,
        compiler: { artifact_root: capture.artifact_root, host_sources_sha256: capture.normal_compiler_source_bindings_sha256,
            child_sources_sha256: capture.normal_child_source_bindings_sha256 },
        authority_builder_sources: producers.map(relative => ({ path: relative,
            sha256: hash(fs.readFileSync(path.resolve(__dirname, '../../../', relative))) })),
        normal_rule_reference: snapshotReference, entries: stableEntries,
        conditional_partition: stablePartition, per_site_domains: perSite,
        native_control_plans: { unknown: plan.site_admission_control_plan, selection: plan.selection_admission_control_plan },
        scope: 'finite_target_normal_admission_and_independent_witness_not_equivalence',
        qualified: false, semantic_mutation_credit: 0, dp_execution: false, financial_acceptance: false };
    const snapshot = { format: 'financasbot.path-normal-rule-review-snapshot', version: 1,
        stage: 'path_v3_normal_rule_review_snapshot_only', core };
    // Audit receipt/commit attribution stays OUTSIDE immutable snapshot bytes:
    // otherwise adding the later verdict would change what was audited.
    assert.equal(Object.hasOwn(snapshot, 'receipt'), false);
    const snapshotSource = canonicalValue(snapshot);
    assert.ok(snapshotSource.length <= 1048576);
    const secondPreparation = api.preparePathQualificationInventory(input);
    const fresh = api.preparePathQualificationWitnessPreselection({ preparation: secondPreparation, rowIndex });
    assert.notEqual(fresh.selected.invocation_id, plan.selected.invocation_id);
    assert.deepEqual(normalize(fresh.entries), stableEntries, 'review scope accidentally pins the previous invocation');
    const result = compiler.compilePathQualificationWitnessPreselection({ capture, plan, phaseProfile,
        normalRuleReview: { snapshotSource, expectedReviewHash: hash(snapshotSource) } });
    const sealed = result.witness_preselection.review_bound_domain_seal;
    assert.ok(sealed);
    assert.equal(sealed.sealed_before_any_captured_compile, true);
    assert.equal(sealed.constructor_authenticates_review, false);
    assert.deepEqual(sealed.per_site_domains, perSite);
    assert.equal(sealed.invocation_id, plan.selected.invocation_id);
    for (const key of ['admitted_domain_complete', 'witness_domain_complete', 'first_witness_proved', 'normal_admission_verified'])
        assert.equal(result.witness_preselection[key], true);
    assert.equal(plan.admitted_domain_complete, false, 'original unreviewed plan mutated after M');
    assert.equal(result.witness_execution_prerequisites.execution_permitted, false);
    assert.equal(result.qualified, false); assert.equal(result.semantic_mutation_credit, 0);
    assert.equal(result.validation_tcb_complete, false); assert.equal(result.handle_attempts, 0);
    assert.equal(result.witness_site_admission_controls.normal_admission_premise_evidence.independent_reviewed_rule_basis_verified, false);
    const transport = compiler.preparePathQualificationExecutionTransport({ result });
    const ticket = JSON.parse(transport.ticketSource), payload = JSON.parse(transport.payloadSource);
    assert.deepEqual(payload.normal_admission_basis.native_controls.review_bound_domain_seal, sealed);
    assert.equal(ticket.prerequisites.first_witness_proved, true);
    // Admit only a prepared INTERNAL host using synthetic TEST pins. Do not
    // call run: real code+reference+TCB review and fresh operational checks are
    // not acquired by this constructor test or by these fabricated receipts.
    const built = (await import('../../../scripts/agent/buildNextValidationTcb.mjs')).buildCapturedValidationTools();
    const roots = new Map(payload.worlds.map(world => [world.proof_program_id, hash(world.proof_artifact.manifest)]));
    const freezeBytes = Buffer.from(canonicalValue({ schema_version: 1, freeze_id: 'provenance_execution', freeze_version: 1,
        stage: 'execution', metric_registry_hash: hash(payload.worlds[0].registry_source), validation_tcb_root: built.artifact_root,
        child_capsule_root: built.child.artifact_root, native_runtime: { platform: process.platform, arch: process.arch,
            node_version: process.version, node_binary_sha256: 'sha256:' + '0'.repeat(64) }, package_authority: plan.baseline_package,
        proof_programs: [...roots].sort(([a], [b]) => a.localeCompare(b))
            .map(([program_id, proof_engine_artifact_root]) => ({ program_id, proof_engine_artifact_root })) }));
    let handles = 0;
    const launch = require('node:vm').runInThisContext(`(function(require){return ${built.launcherSource}\n})`)(name => {
        if (name === 'node:fs') return { readFileSync() { handles++; throw Error('no handles'); } };
        if (name === 'node:child_process') return { spawn() { handles++; throw Error('no child'); }, fork() { handles++; throw Error('no child'); } };
        return require(name);
    });
    const bootstrap = { freezeBytes, expectedFreezeHash: hash(freezeBytes), tcbArtifact: { manifestBytes: Buffer.from(built.manifest),
        entries: built.entries.map(row => ({ path: row.path, bytes: Buffer.from(row.source) })) } };
    const load = (source, request) => launch({ ...bootstrap, qualification: { ticketSource: source, payloadSource: request,
        expectedTicketCommitment: hash(canonicalValue({ source })) } });
    const loaded = load(transport.ticketSource, transport.payloadSource), host = loaded.initializePathQualification();
    assert.equal(host.candidate_id, result.candidate_id); assert.equal(host.execution_permitted, false);
    assert.equal(host.qualified, false); assert.equal(handles, 0);
    assert.throws(() => loaded.initializePathQualification(), /already_initialized/);
    for (const [label, mutate] of [
        ['old-invocation', basis => { basis.native_controls.review_bound_domain_seal.invocation_id = fresh.selected.invocation_id; }],
        ['domain', basis => { basis.native_controls.review_bound_domain_seal.per_site_domains[0].A.pop(); }],
        ['source-body', basis => { basis.native_controls.review_bound_domain_seal.snapshot_core.normal_rule_reference.sources[0].source_chunks[0] += '\n// foreign'; }],
        ['first-witness', basis => { basis.native_controls.review_bound_domain_seal.selected.entry_index++; }],
        ['no-review', basis => { basis.native_controls.normal_rule_review = null; basis.native_controls.review_bound_domain_seal = null; }]
    ]) {
        const changed = structuredClone(payload); mutate(changed.normal_admission_basis);
        const request = canonicalValue(changed), source = canonicalValue({ ...ticket,
            payload_commitment: hash(canonicalValue({ source: request })),
            normal_admission_basis_commitment: hash(canonicalValue({ source: canonicalValue(changed.normal_admission_basis) })) });
        assert.throws(() => load(source, request).initializePathQualification(), /normal_admission_basis_relation/, label);
        assert.equal(handles, 0);
    }
    assert.throws(() => compiler.compilePathQualificationWitnessPreselection({ capture, plan, phaseProfile,
        normalRuleReview: { snapshotSource, expectedReviewHash: hash(snapshotSource) } }), /origin_or_replay/);
    // Rewrite the WHOLE input snapshot and its external TEST pin. A checksum
    // disagreement must not substitute for the genuine source/reference join.
    const foreign = structuredClone(snapshot), sourceRow = foreign.core.normal_rule_reference.sources[0];
    sourceRow.source_chunks[0] = (sourceRow.source_chunks[0][0] === 'x' ? 'y' : 'x') + sourceRow.source_chunks[0].slice(1);
    sourceRow.sha256 = hash(sourceRow.source_chunks.join(''));
    const foreignSource = canonicalValue(foreign), freshCapture = compiler.capturePathQualificationCompiler();
    let error;
    try { compiler.compilePathQualificationWitnessPreselection({ capture: freshCapture, plan: fresh, phaseProfile,
        normalRuleReview: { snapshotSource: foreignSource, expectedReviewHash: hash(foreignSource) } }); }
    catch (value) { error = value; }
    assert.match(error?.message ?? '', /rule_review_reference_binding/);
    const rejected = compiler.readPathQualificationCompilerEvidence(error);
    assert.equal(rejected.normal_compile_path_entered, false); assert.equal(rejected.handle_attempts, 0);
    assert.equal(rejected.qualified, false);
    assert.throws(() => compiler.compilePathQualificationWitnessPreselection({ capture: freshCapture, plan: fresh, phaseProfile }), /poisoned/);
    console.log(JSON.stringify({ reviewed_scope_constructor_only: true, snapshot_bytes: Buffer.byteLength(snapshotSource),
        sites: perSite.length, admitted_members: perSite.reduce((sum, site) => sum + site.A.length, 0),
        witnesses: perSite.reduce((sum, site) => sum + site.W.length, 0), native_handles: handles, qualified: false, credit: 0 }));
});

test('N02G:PATH-V3-087 trusted external rule review is a closed byte transport and never raw approval flags or active data', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const input = await fixture(), phaseProfile = await phaseFixture();
    const hash = source => 'sha256:' + require('node:crypto').createHash('sha256').update(source).digest('hex');
    let effects = 0;
    const active = { expectedReviewHash: hash('{}') };
    Object.defineProperty(active, 'snapshotSource', { enumerable: true, get() { effects++; return '{}'; } });
    const proxy = new Proxy({}, { get() { effects++; throw new Error('active'); },
        ownKeys() { effects++; throw new Error('active'); } });
    for (const review of [true, { approved: true }, active, proxy,
        { snapshotSource: '{}', expectedReviewHash: hash('foreign') },
        { snapshotSource: '{}', expectedReviewHash: hash('{}') }]) {
        const preparation = api.preparePathQualificationInventory(input);
        const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
            && row.target.predicate_id === 'link_2_refund_sign');
        const plan = api.preparePathQualificationWitnessPreselection({ preparation, rowIndex });
        const capture = compiler.capturePathQualificationCompiler();
        let error;
        try { compiler.compilePathQualificationWitnessPreselection({ capture, plan, phaseProfile, normalRuleReview: review }); }
        catch (value) { error = value; }
        assert.match(error?.message ?? '', /rule_review_(packet|pin|snapshot)/);
        const failure = compiler.readPathQualificationCompilerEvidence(error);
        assert.equal(failure.normal_compile_path_entered, false);
        assert.equal(failure.handle_attempts, 0);
        assert.equal(failure.qualified, false);
        assert.throws(() => compiler.compilePathQualificationWitnessPreselection({ capture, plan, phaseProfile }), /poisoned/);
    }
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-086 finite conditional L A W partition binds every rule and independent reference before M and cannot select an uncovered discriminant', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const sha = value => 'sha256:' + require('node:crypto').createHash('sha256').update(canonicalValue(value)).digest('hex');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
        && row.target.predicate_id === 'link_2_refund_sign');
    const plan = api.preparePathQualificationWitnessPreselection({ preparation, rowIndex });
    const partition = plan.conditional_domain_partition;
    assert.ok(partition, 'missing pre-M conditional L A W partition');
    assert.equal(plan.conditional_domain_partition_sha256, sha(partition));
    assert.equal(partition.domain_sha256, plan.domain_sha256);
    assert.equal(partition.normal_rule_composition_sha256,
        sha(plan.admission_foundation.admission_foundation.normal_rule_composition));
    assert.equal(partition.entries.length, plan.entries.length);
    assert.equal(partition.conditional_admission_partition_complete, true);
    assert.equal(partition.conditional_witness_partition_complete,
        partition.entries.every(entry => !entry.classification.startsWith('blocked_')));
    for (const member of partition.entries) {
        const entry = plan.entries[member.entry_index];
        assert.equal(member.site_index, entry.site_index);
        assert.equal(member.locator_index, entry.locator_index);
        assert.equal(member.locator_sha256, sha(entry.locator));
        assert.equal(member.reference_sha256, entry.reference ? sha(entry.reference) : null);
        if (member.classification === 'necessary_exclusion_pending_native_barrier') {
            assert.equal(entry.admission, 'necessary_exclusion_not_native_control');
            continue;
        }
        assert.equal(member.conditional_rule_preservation_verified, true);
        const basis = plan.admission_foundation.admission_foundation.normal_rule_composition
            .sites[member.site_index].locators[member.locator_index];
        assert.equal(member.normal_rule_basis_sha256, sha(basis));
        const available = entry.reference.available && entry.reference.baseline_satisfied === true
            && typeof entry.reference.mutant_satisfied === 'boolean';
        assert.equal(member.classification, !available ? 'blocked_semantic_reference'
            : entry.reference.discriminating ? 'conditional_witness' : 'conditional_non_witness');
    }
    const first = partition.entries.find(entry => entry.classification === 'conditional_witness');
    assert.ok(first);
    assert.equal(partition.first_conditional_witness_entry_index, first.entry_index);
    assert.equal(plan.selected.entry_index, first.entry_index);
    assert.ok(Object.values(partition.required_premises).every(value => value === false));
    for (const field of ['admitted_domain_complete', 'witness_domain_complete', 'first_witness_proved', 'compiler_result_used', 'qualified', 'dp_execution'])
        assert.equal(partition[field], false);
    assert.equal(partition.semantic_mutation_credit, 0);
    const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
    const file = path.resolve(__dirname, '../../../src/next/provenance/pathQualificationV3.js');
    const isolated = new Module(file); isolated.filename = file;
    isolated.paths = Module._nodeModulePaths(path.dirname(file));
    isolated._compile(fs.readFileSync(file, 'utf8') + `
        module.exports.testWitnessReadGap = (input, rowIndex) => {
            const original = projectAdmissionRuleDependencyFrames, saved = require.cache[__filename];
            projectAdmissionRuleDependencyFrames = (...args) => { const frames = original(...args); frames.pop(); return frames; };
            require.cache[__filename] = module;
            try { return preparePathQualificationWitnessPreselection({ preparation: preparePathQualificationInventory(input), rowIndex }); }
            finally { projectAdmissionRuleDependencyFrames = original; require.cache[__filename] = saved; }
        };`, file);
    const blocked = isolated.exports.testWitnessReadGap(input, rowIndex);
    assert.ok(blocked.entries.some(entry => entry.reference?.discriminating === true));
    assert.equal(blocked.selected, null);
    assert.equal(blocked.conditional_domain_partition.conditional_admission_partition_complete, false);
    assert.ok(blocked.conditional_domain_partition.entries.every(entry => entry.classification === 'blocked_normal_rule_coverage'));
    assert.throws(() => isolated.exports.takePathQualificationWitnessPreselection({ plan: blocked }), /missing_candidate/);
    assert.throws(() => api.takePathQualificationWitnessPreselection({ plan: structuredClone(plan) }));
    console.log(JSON.stringify({ conditional_partition: { entries: partition.entries.length,
        classifications: partition.entries.reduce((counts, entry) => ({ ...counts, [entry.classification]: (counts[entry.classification] || 0) + 1 }), {}),
        conditional_admission_complete: partition.conditional_admission_partition_complete,
        conditional_witness_complete: partition.conditional_witness_partition_complete,
        admitted: false, qualified: false, credit: 0 } }));
});

test('N02G:PATH-V3-085 necessary selection controls do not recompute full twelve rule admission foundation while full admission keeps it', async () => {
    const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
    const file = path.resolve(__dirname, '../../../src/next/provenance/pathQualificationV3.js');
    const isolated = new Module(file); isolated.filename = file;
    isolated.paths = Module._nodeModulePaths(path.dirname(file));
    isolated._compile(fs.readFileSync(file, 'utf8') + `
        module.exports.testSelectionProjection = input => {
            const original = projectAdmissionFoundation; let calls = 0;
            projectAdmissionFoundation = (...args) => { calls++; return original(...args); };
            try {
                const preparation = preparePathQualificationInventory(input);
                const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
                    && row.target.predicate_id === 'link_2_refund_sign');
                const plan = preparePathSelectionAdmissionControls({ preparation, rowIndex });
                const selectionCalls = calls;
                const domain = preparePathQualificationAdmissionDomain({ preparation, rowIndex });
                return { preparation, rowIndex, plan, domain, selectionCalls, fullCalls: calls };
            } finally { projectAdmissionFoundation = original; }
        };`, file);
    const observed = isolated.exports.testSelectionProjection(await fixture());
    assert.equal(observed.selectionCalls, 0, 'necessary selection controls redundantly project full admission foundation');
    assert.equal(observed.fullCalls, 1);
    const { plan, domain, preparation, rowIndex } = observed;
    assert.equal(plan.domain_sha256, domain.domain_sha256);
    assert.equal(plan.admitted_domain_complete, domain.admitted_domain_complete);
    assert.deepEqual(plan.controls.map(control => ({ site_index: control.site_index, locator_index: control.locator_index,
        rule: control.rule, instances: control.instances, unchanged_authorship_sha256: control.unchanged_authorship_sha256 })),
    domain.sites.flatMap(site => site.excluded.map(exclusion => ({ site_index: site.site_index,
        locator_index: exclusion.locator_index, rule: exclusion.rule, instances: exclusion.instances,
        unchanged_authorship_sha256: exclusion.unchanged_authorship_sha256 }))));
    assert.equal(domain.admission_foundation.normal_rule_composition.pass_ids.length, 12);
    assert.equal(domain.admission_foundation.normal_rule_composition.conditional_coverage_complete, true);
    assert.equal(domain.admission_foundation.normal_rule_composition.admitted_domain_complete, false);
    assert.equal(plan.qualified, false);
    assert.equal(plan.semantic_mutation_credit, 0);
    let effects = 0;
    const activeMode = new Proxy({}, { get() { effects++; throw new Error('active'); } });
    for (const mode of [false, true, 'selection', Symbol('selection_projection'), activeMode])
        assert.throws(() => isolated.exports.preparePathQualificationAdmissionDomain({ preparation, rowIndex }, mode),
            /projection/);
    assert.equal(effects, 0);
    assert.throws(() => isolated.exports.preparePathSelectionAdmissionControls({ preparation, rowIndex, projection: 'selection' }));
});

test('N02G:PATH-V3-084 consumed native site control poisons the witness bridge before first normal C without fallback or replay authority', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const preparation = api.preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
        && row.target.predicate_id === 'link_2_refund_sign');
    const plan = api.preparePathQualificationWitnessPreselection({ preparation, rowIndex });
    const unusedCandidate = api.materializePathStaticDomainControl({ plan: plan.site_admission_control_plan, siteIndex: 0 });
    assert.ok(unusedCandidate.candidate_id);
    const capture = compiler.capturePathQualificationCompiler(), phaseProfile = await phaseFixture();
    let failure;
    try { compiler.compilePathQualificationWitnessPreselection({ capture, plan, phaseProfile }); }
    catch (error) { failure = error; }
    assert.ok(failure);
    assert.match(failure.message, /replay/);
    const evidence = compiler.readPathQualificationCompilerEvidence(failure);
    assert.ok(evidence);
    assert.equal(evidence.stage, 'path_v3_witness_program_preparation_failed_before_compile');
    assert.equal(evidence.normal_compile_path_entered, false);
    assert.equal(evidence.candidate_id, plan.selected.candidate_id);
    assert.equal(evidence.invocation_id, plan.selected.invocation_id);
    assert.equal(evidence.handle_attempts, 0);
    assert.equal(evidence.dp_execution, false);
    assert.equal(evidence.qualified, false);
    assert.equal(evidence.semantic_mutation_credit, 0);
    assert.equal(compiler.readPathQualificationCompilerEvidence(new Error(failure.message)), null);
    assert.throws(() => api.takePathQualificationWitnessPreselection({ plan }), /replay/);
    assert.throws(() => compiler.compilePathQualificationWitnessPreselection({ capture, plan, phaseProfile }),
        /capture_authority_or_poisoned/);
    assert.throws(() => compiler.compilePathQualificationCandidate({ capture, candidate: unusedCandidate }),
        /capture_authority_or_poisoned/);
    assert.throws(() => api.materializePathStaticDomainControl({ plan: plan.site_admission_control_plan, siteIndex: 0 }), /replay/);
});

test('N02G:PATH-V3-083 witness bridge verifies genuine native site controls before selected normal M without semantic or execution credit', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const preparation = api.preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
        && row.target.predicate_id === 'link_2_refund_sign');
    const plan = api.preparePathQualificationWitnessPreselection({ preparation, rowIndex });
    const result = compiler.compilePathQualificationWitnessPreselection({ capture: compiler.capturePathQualificationCompiler(),
        plan, phaseProfile: await phaseFixture() });
    const controls = result.witness_site_admission_controls;
    assert.ok(controls, 'missing captured witness site admission controls before selected compile');
    const premises = controls.normal_admission_premise_evidence;
    assert.ok(premises, 'missing preselected normal baseline and checker rule premise binding');
    assert.equal(premises.conditional_partition_sha256, plan.conditional_domain_partition_sha256);
    assert.equal(premises.normal_rule_composition_sha256, plan.conditional_domain_partition.normal_rule_composition_sha256);
    assert.equal(premises.normal_admission_checker_reference_sha256,
        result.normal_admission_checker_reference_sha256);
    assert.equal(premises.normal_baseline_admission_verified, true);
    assert.equal(premises.normal_checker_binding_verified, true);
    assert.equal(premises.site_admission_controls_verified, true);
    assert.equal(premises.normal_positive_restoration_verified, true);
    assert.equal(premises.sealed_before_selected_normal_compile, true);
    assert.equal(premises.independent_reviewed_rule_basis_verified, false);
    assert.equal(premises.whole_selected_actual_program_conformance_verified, false);
    assert.equal(premises.admitted_domain_complete, false);
    assert.equal(premises.first_witness_proved, false);
    assert.equal(premises.qualified, false);
    assert.equal(premises.semantic_mutation_credit, 0);
    assert.equal(controls.unknown_path_control_plan_sha256, plan.site_admission_control_plan_sha256);
    assert.equal(controls.selection_control_plan_sha256, plan.selection_admission_control_plan_sha256);
    assert.equal(controls.unknown_path_controls.length, preparation.rows[rowIndex].sites.length);
    assert.equal(controls.selection_controls.length, plan.selection_admission_control_plan.controls.length);
    assert.equal(controls.native_barriers_verified, true);
    assert.equal(controls.selected_normal_compile_started_after_controls, true);
    assert.equal(controls.compiler_result_used_to_define_domain, false);
    assert.equal(controls.qualified, false);
    assert.equal(controls.semantic_mutation_credit, 0);
    for (const control of [...controls.unknown_path_controls, ...controls.selection_controls]) {
        assert.equal(control.compiler_artifact_root, result.compiler_artifact_root);
        assert.equal(control.native_control_matched, true);
        assert.equal(control.handle_attempts, 0);
        assert.deepEqual(control.worlds.map(world => world.admitted), [true, false, true]);
        assert.notEqual(control.invocation_id, result.invocation_id);
        assert.notEqual(control.candidate_id, result.candidate_id);
        assert.equal(control.qualified, false);
        assert.equal(control.semantic_mutation_credit, 0);
    }
    assert.deepEqual(result.worlds.map(world => world.admitted), [true, true, true]);
    assert.deepEqual(result.witness_preselection.conditional_domain_partition, plan.conditional_domain_partition);
    assert.equal(result.witness_preselection.conditional_domain_partition_sha256, plan.conditional_domain_partition_sha256);
    assert.ok(Object.isFrozen(result.witness_preselection.conditional_domain_partition));
    assert.equal(result.witness_preselection.conditional_domain_partition.compiler_result_used, false);
    assert.equal(result.witness_preselection.conditional_domain_partition.first_witness_proved, false);
    assert.equal(result.witness_preselection.admitted_domain_complete, false);
    assert.equal(result.witness_preselection.witness_domain_complete, false);
    assert.equal(result.witness_execution_prerequisites.execution_permitted, false);
    assert.equal(result.dp_execution, false);
    assert.equal(result.qualified, false);
});

test('N02G:PATH-V3-082 witness site unknown path controls use full native C M S admission and exact precommitted coordinates with zero handles', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const preparation = api.preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
        && row.target.predicate_id === 'link_2_refund_sign');
    const plan = api.preparePathQualificationWitnessPreselection({ preparation, rowIndex });
    const controlPlan = plan.site_admission_control_plan, capture = compiler.capturePathQualificationCompiler();
    assert.equal(controlPlan.locator_domain_empty, false);
    const ids = new Set();
    for (const [siteIndex, control] of controlPlan.controls.entries()) {
        const candidate = api.materializePathStaticDomainControl({ plan: controlPlan, siteIndex });
        assert.deepEqual(candidate.expected_diagnostic, control.expected_diagnostic);
        assert.equal(candidate.locator_index, null);
        assert.ok(!ids.has(candidate.invocation_id)); ids.add(candidate.invocation_id);
        const result = compiler.compilePathQualificationCandidate({ capture, candidate });
        assert.deepEqual(result.worlds.map(world => world.variant), ['C', 'M', 'S']);
        assert.deepEqual(result.worlds.map(world => world.admitted), [true, false, true]);
        assert.deepEqual(result.worlds[1].diagnostic.native_coordinate, control.expected_diagnostic);
        assert.equal(result.worlds[1].diagnostic.forged_same_text_has_authority, false);
        assert.equal(result.worlds[0].ir_sha256, result.worlds[2].ir_sha256);
        assert.equal(result.reference.locator_domain_empty, false);
        assert.equal(result.native_control_matched, true);
        assert.equal(result.handle_attempts, 0);
        assert.equal(result.dp_execution, false);
        assert.equal(result.qualified, false);
        assert.equal(result.validation_tcb_complete, false);
        assert.equal(result.semantic_mutation_credit, 0);
        assert.throws(() => compiler.compilePathQualificationCandidate({ capture, candidate }), /candidate_authority_or_replay/);
    }
    assert.equal(ids.size, preparation.rows[rowIndex].sites.length);
    assert.equal(plan.normal_admission_verified, false);
    assert.equal(plan.admitted_domain_complete, false);
    assert.equal(plan.witness_domain_complete, false);
});

test('N02G:PATH-V3-081 witness preparation seals one genuine normal unknown path control per site without empty domain or execution credit', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const preparation = api.preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
        && row.target.predicate_id === 'link_2_refund_sign');
    const row = preparation.rows[rowIndex];
    assert.ok(row.sites.every(site => site.domain.locators.length > 0));
    const plan = api.preparePathQualificationWitnessPreselection({ preparation, rowIndex });
    const controls = plan.site_admission_control_plan;
    assert.ok(controls, 'missing genuine witness site admission control plan');
    assert.equal(controls.locator_domain_empty, false);
    assert.equal(controls.controls.length, row.sites.length);
    assert.equal(controls.domain_sha256, plan.domain_sha256);
    assert.equal(controls.qualified, false);
    assert.equal(controls.semantic_mutation_credit, 0);
    assert.equal(plan.normal_admission_verified, false);
    assert.throws(() => api.materializePathStaticDomainControl({ plan: structuredClone(controls), siteIndex: 0 }));
    let touched = false;
    const active = { plan: controls };
    Object.defineProperty(active, 'siteIndex', { enumerable: true, get() { touched = true; return 0; } });
    assert.throws(() => api.materializePathStaticDomainControl(active));
    assert.equal(touched, false);
    for (const [siteIndex, site] of row.sites.entries()) {
        assert.deepEqual(controls.controls[siteIndex].authored_site, site.authored_site);
        const candidate = api.materializePathStaticDomainControl({ plan: controls, siteIndex });
        assert.equal(candidate.candidate_kind, 'unknown_path_control_for_witness_site');
        assert.equal(candidate.locator_index, null);
        assert.deepEqual(candidate.expected_diagnostic.site_path, site.authored_site.site_path);
        assert.equal(candidate.qualified, false);
        assert.equal(candidate.dp_execution, false);
        const taken = api.takePathQualificationCandidatePackage({ candidate });
        assert.equal(taken.reference.locator_domain_empty, false);
        assert.equal(taken.reference.discriminating, false);
        assert.equal(taken.reference.stage, 'path_v3_witness_site_native_control_sealed_before_compile');
        assert.throws(() => api.materializePathStaticDomainControl({ plan: controls, siteIndex }), /replay/);
    }
    assert.equal(plan.witness_domain_complete, false);
    assert.equal(plan.admitted_domain_complete, false);
    assert.equal(plan.qualified, false);
});

test('N02G:PATH-V3-080 complete normal rule composition covers each genuine locator before M and blocks any missing premise', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
        && row.target.predicate_id === 'link_2_refund_sign');
    assert.ok(rowIndex >= 0);
    const domain = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex });
    const foundation = domain.admission_foundation, composition = foundation.normal_rule_composition;
    assert.ok(composition, 'missing complete normal rule composition');
    assert.deepEqual(composition.pass_ids, foundation.passes.map(pass => pass.id));
    assert.equal(composition.pass_ids.length, 12);
    assert.equal(composition.conditional_coverage_complete, true);
    assert.equal(composition.admitted_domain_complete, false);
    assert.equal(composition.compiler_result_used, false);
    assert.equal(composition.qualified, false);
    assert.equal(composition.semantic_mutation_credit, 0);
    assert.ok(Object.values(composition.required_premises).every(value => value === false));
    let locators = 0;
    for (const site of composition.sites) {
        const source = preparation.rows[rowIndex].sites[site.site_index];
        assert.equal(site.domain_complete, true);
        assert.equal(site.locators.length, source.domain.locators.length);
        for (const [index, member] of site.locators.entries()) {
            locators++;
            assert.equal(member.locator_index, index);
            assert.deepEqual(member.pass_coverage.map(pass => pass.pass_id), composition.pass_ids);
            assert.ok(member.pass_coverage.every(pass => pass.conditional_preservation_verified));
            assert.ok(member.pass_coverage.every(pass => typeof pass.contract_sha256 === 'string'));
            assert.equal(member.status, 'conditionally_preserved_pending_baseline_binding_and_controls');
            assert.equal(member.admitted, false);
            assert.equal(member.discharged, false);
            assert.equal(member.mutant_authorship_sha256, foundation.sites[site.site_index].frames[index].mutant_authorship_sha256);
        }
    }
    assert.ok(locators > 0);
    for (const alter of [value => value.admission_foundation.normal_rule_composition.pass_ids.pop(),
        value => value.admission_foundation.normal_rule_composition.sites[0].locators.pop(),
        value => value.admission_foundation.normal_rule_composition.sites[0].locators[0].pass_coverage.pop(),
        value => value.admission_foundation.normal_rule_composition.required_premises.normal_baseline_admission_verified = true,
        value => value.admission_foundation.normal_rule_composition.admitted_domain_complete = true]) {
        const changed = structuredClone(domain); alter(changed);
        assert.throws(() => api.verifyPathQualificationAdmissionDomain({ domain, candidate: changed }), /admission_foundation_changed/);
    }
    const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
    const file = path.resolve(__dirname, '../../../src/next/provenance/pathQualificationV3.js');
    const isolated = new Module(file); isolated.filename = file;
    isolated.paths = Module._nodeModulePaths(path.dirname(file));
    isolated._compile(fs.readFileSync(file, 'utf8') + `
        module.exports.testReadGap = (input, rowIndex, mode) => {
            const original = projectAdmissionRuleDependencyFrames;
            projectAdmissionRuleDependencyFrames = (...args) => {
                const frames = original(...args);
                if (mode === 'omit') frames.pop();
                if (mode === 'duplicate') frames.push(frames[0]);
                if (mode === 'different') frames[0].conditional_preservation_verified = false;
                if (mode === 'foreign_contract') frames[0].normal_read_rule_contract_sha256 = 'sha256:' + '0'.repeat(64);
                try { return frames; } finally { /* restoration belongs to the caller after projection */ }
            };
            try { return preparePathQualificationAdmissionDomain({ preparation: preparePathQualificationInventory(input), rowIndex }); }
            finally { projectAdmissionRuleDependencyFrames = original; }
        };`, file);
    for (const mode of ['omit', 'duplicate', 'different', 'foreign_contract']) {
        const blocked = isolated.exports.testReadGap(input, rowIndex, mode).admission_foundation.normal_rule_composition;
        assert.equal(blocked.conditional_coverage_complete, false);
        assert.ok(blocked.sites.every(site => site.locators.every(member => member.status === 'blocked_incomplete_normal_rule_coverage')));
        assert.equal(blocked.admitted_domain_complete, false);
    }
});

test('N02G:PATH-V3-079 document schema preservation binds normal schemas recipe and every genuine locator shape before C', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const docs = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = docs.get('docs/contracts/next/provenance-v2/graphs-v2.json');
    const graphs = new Map(corpus.graphs.map(graph => [graph.fact_key, graph]));
    const first = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex: 0 });
    const schemaContract = first.admission_foundation.normal_package_schema_contract;
    assert.ok(schemaContract, 'missing normal package schema preservation contract');
    assert.equal(schemaContract.baseline_admission_required, true);
    assert.equal(schemaContract.independent_code_audit, false);
    const { buildSchemaValidators, buildCapturedValidationTools } = {
        ...await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs'),
        ...await import('../../../scripts/agent/buildNextValidationTcb.mjs') };
    const normal = buildSchemaValidators();
    const samples = new Map();
    for (const [rowIndex, row] of preparation.rows.entries()) {
        // Empty L is still a genuine schema branch: cover its original,
        // without manufacturing alternatives or treating emptiness as credit.
        for (const site of row.sites) if (site.domain_complete && !samples.has(site.authored_site.definition))
            samples.set(site.authored_site.definition, rowIndex);
        if (samples.size === 3) break;
    }
    assert.equal(samples.size, 3);
    assert.deepEqual([...samples.keys()].sort(), ['claimPath', 'fieldPath', 'selector']);
    let controls = 0;
    for (const rowIndex of new Set(samples.values())) {
        const domain = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex });
        const graph = graphs.get(preparation.rows[rowIndex].target.fact_key);
        assert.equal(normal.validators.graphs({ ...corpus, graphs: [graph] }), true);
        for (const site of domain.admission_foundation.sites) for (const frame of site.frames ?? []) {
            const constraint = frame.structural_locator_constraint.schema_locator_constraint;
            assert.equal(constraint.shape_preservation_verified, true);
            assert.equal(constraint.predicate_identity_uniqueness_preserved, true);
            assert.equal(constraint.discharged, false);
            const mutant = structuredClone(graph); let holder = mutant;
            for (const token of site.graph_location.slice(0, -1)) holder = holder[token];
            holder[site.graph_location.at(-1)] = structuredClone(preparation.rows[rowIndex]
                .sites[site.site_index].domain.locators[frame.locator_index]);
            assert.equal(normal.validators.graphs({ ...corpus, graphs: [mutant] }), true); controls++;
        }
    }
    assert.ok(controls > 0);
    const program = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate: admittedCandidate(api, preparation), phaseProfile: await phaseFixture() });
    const fs = require('node:fs'), path = require('node:path');
    const originalRead = fs.readFileSync;
    for (const [relative, from, to] of [
        ['docs/contracts/next/provenance-v2/provenance-graph.schema.json', '"minItems":1', '"minItems":0'],
        ['scripts/agent/buildNextProvenanceArtifacts.mjs', 'coerceTypes: false', 'coerceTypes: true']]) {
        let changed = 0;
        fs.readFileSync = function(file, ...args) {
            const value = originalRead.call(this, file, ...args);
            if (path.resolve(String(file)) !== path.resolve(__dirname, '../../..', relative)) return value;
            const source = value.toString().replace(from, to); assert.notEqual(source, value.toString()); changed++;
            return typeof value === 'string' ? source : Buffer.from(source);
        };
        try { assert.throws(() => program.sealPathCandidateProgramExpectation({ authorship }), /admission_checker_schema_contract_pin/); }
        finally { fs.readFileSync = originalRead; }
        assert.ok(changed > 0);
    }
    const expectation = program.sealPathCandidateProgramExpectation({ authorship });
    const reference = expectation.normal_admission_checker_reference.normal_package_schema_contract;
    assert.equal(reference.source_bindings_verified, true);
    assert.equal(reference.conditional_preservation_complete, true);
    assert.equal(reference.normal_baseline_admission_verified, false);
    assert.equal(reference.discharged, false);
    const built = buildCapturedValidationTools(), recipe = JSON.parse(built.entries.find(row => row.path === 'recipe.json').source);
    const binding = { expectation, sourceHashes: built.hostSourceHashes, childSourceHashes: built.child.sourceHashes,
        schemaSources: recipe.schema_sources, schemaBuildSource: recipe.recipes.find(row => row.path === 'scripts/agent/buildNextProvenanceArtifacts.mjs').source };
    assert.equal(program.verifyPathCandidateCapabilityBuildBinding(binding).normal_package_schema_source_conformance, true);
    for (const mutate of [value => value.pop(), value => value.reverse(), value => value.push(value[0]),
        value => value[0].sha256 = 'sha256:' + '0'.repeat(64)]) {
        const sources = structuredClone(binding.schemaSources); mutate(sources);
        assert.throws(() => program.verifyPathCandidateCapabilityBuildBinding({ ...binding, schemaSources: sources }));
    }
    assert.throws(() => program.verifyPathCandidateCapabilityBuildBinding({ ...binding,
        schemaBuildSource: binding.schemaBuildSource.replace('coerceTypes: false', 'coerceTypes: true') }));
    let touched = false;
    const active = structuredClone(binding.schemaSources);
    Object.defineProperty(active[0], 'sha256', { enumerable: true, get() { touched = true; throw new Error('active'); } });
    assert.throws(() => program.verifyPathCandidateCapabilityBuildBinding({ ...binding, schemaSources: active }));
    assert.equal(touched, false);
});

test('N02G:PATH-V3-078 selection read frames retain every referenced predicate and preserve only unchanged selection inputs before C', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const docs = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = docs.get('docs/contracts/next/provenance-v2/graphs-v2.json');
    const graphs = new Map(corpus.graphs.map(graph => [graph.fact_key, graph]));
    const samples = new Map();
    for (const [rowIndex, row] of preparation.rows.entries()) {
        if (!row.sites.every(site => site.domain_complete) || !row.sites.some(site => site.domain.locators.length)) continue;
        const graph = graphs.get(row.target.fact_key);
        const referenced = graph.selections.some(selection => selection.selected_predicates.includes(row.target.predicate_id)
            || selection.excluded.some(excluded => excluded.predicates.includes(row.target.predicate_id)));
        if (!samples.has(referenced)) samples.set(referenced, rowIndex);
        if (samples.size === 2) break;
    }
    assert.equal(samples.size, 2);
    const first = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex: samples.get(false) });
    const contract = first.admission_foundation.normal_read_rule_contracts.find(row => row.pass_id === 'selection_bindings');
    assert.ok(contract, 'missing normal selection read contract');
    assert.equal(contract.entrypoint, 'validateSelectionBindings');
    assert.equal(contract.independent_code_audit, false);
    const { validateSelectionBindings } = require('../../../src/next/provenance/selectionBindings');
    let controls = 0;
    for (const [referenced, rowIndex] of samples) {
        const domain = referenced ? api.preparePathQualificationAdmissionDomain({ preparation, rowIndex }) : first;
        const graph = graphs.get(preparation.rows[rowIndex].target.fact_key);
        const normalInput = { claims: docs.get(corpus.claim_contract.path).claims, materialRegistry: docs.get(corpus.material_registry.path) };
        const baseline = validateSelectionBindings({ ...normalInput, graphs: [graph] });
        for (const site of domain.admission_foundation.sites) for (const frame of site.frames) {
            const rule = frame.rule_dependency_frames.find(row => row.pass_id === contract.pass_id);
            assert.equal(rule.conditional_preservation_verified, !referenced);
            assert.equal(rule.discharged, false);
            if (!referenced) {
                const mutant = structuredClone(graph); let holder = mutant;
                for (const token of site.graph_location.slice(0, -1)) holder = holder[token];
                holder[site.graph_location.at(-1)] = structuredClone(preparation.rows[rowIndex]
                    .sites[site.site_index].domain.locators[frame.locator_index]);
                assert.deepEqual(validateSelectionBindings({ ...normalInput, graphs: [mutant] }), baseline); controls++;
            }
        }
    }
    assert.ok(controls > 0);
    const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
    const file = path.resolve(__dirname, '../../../src/next/provenance/pathQualificationV3.js');
    const isolated = new Module(file); isolated.filename = file;
    isolated.paths = Module._nodeModulePaths(path.dirname(file));
    isolated._compile(fs.readFileSync(file, 'utf8') + '\nmodule.exports.testQuery = projectAdmissionRuleDependencyFrames;', file);
    const graph = graphs.get(preparation.rows[samples.get(true)].target.fact_key);
    const target = graph.predicates.findIndex(value => value.id === preparation.rows[samples.get(true)].target.predicate_id);
    const referenceIDs = new Set(graph.selections.flatMap(selection => [...selection.selected_predicates,
        ...selection.excluded.flatMap(row => row.predicates)]));
    const other = graph.predicates.findIndex((value, index) => index !== target && referenceIDs.has(value.id));
    assert.ok(other >= 0);
    for (const mutate of [value => value.predicates[other].args[0] = { node: '__synthetic__' },
        value => value.predicates[other].id += '_synthetic',
        value => value.selections[0].selected_predicates.push('__synthetic__'),
        value => value.edges.push({ id: '__synthetic__' }),
        value => value.trace_contract.proof.required_reads.push({ node: '__synthetic__', segments: ['state'] })]) {
        const mutant = structuredClone(graph); mutate(mutant);
        const rule = isolated.exports.testQuery(graph, mutant, target).find(row => row.pass_id === contract.pass_id);
        assert.equal(rule.dependency_frame_verified, false);
        assert.equal(rule.conditional_preservation_verified, false);
    }
    const normal = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate: admittedCandidate(api, preparation), phaseProfile: await phaseFixture() });
    const originalRead = fs.readFileSync; let altered = 0;
    fs.readFileSync = function(file, ...args) {
        const value = originalRead.call(this, file, ...args);
        if (path.resolve(String(file)) !== path.resolve(__dirname, '../../../src/next/provenance/selectionBindings.js')) return value;
        const source = value.toString().replace('if (!ids.length)', 'if (false)');
        assert.notEqual(source, value.toString()); altered++;
        return typeof value === 'string' ? source : Buffer.from(source);
    };
    try { assert.throws(() => normal.sealPathCandidateProgramExpectation({ authorship }), /admission_checker_read_contract_pin/); }
    finally { fs.readFileSync = originalRead; }
    assert.ok(altered > 0);
});

test('N02G:PATH-V3-076 ordinary claim read frames retain all descriptor subject period arguments and roots before C', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const docs = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = docs.get('docs/contracts/next/provenance-v2/graphs-v2.json');
    const graphs = new Map(corpus.graphs.map(graph => [graph.fact_key, graph]));
    const roots = ['subject_scope', 'period', 'time_basis', 'coverage', 'evidence_state'];
    const samples = new Map();
    for (const [rowIndex, row] of preparation.rows.entries()) {
        if (!row.sites.every(site => site.domain_complete) || !row.sites.some(site => site.domain.locators.length)) continue;
        const predicate = graphs.get(row.target.fact_key).predicates.find(value => value.id === row.target.predicate_id);
        const sensitive = roots.includes(predicate.obligation);
        if (!sensitive && predicate.args.some(arg => arg.claim)) continue;
        if (!samples.has(sensitive)) samples.set(sensitive, rowIndex);
        if (samples.size === 2) break;
    }
    assert.equal(samples.size, 2);
    const first = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex: samples.get(false) });
    const contract = first.admission_foundation.normal_read_rule_contracts.find(row => row.pass_id === 'claim_requirements');
    assert.ok(contract, 'missing normal ordinary claim read contract');
    assert.equal(contract.entrypoint, 'validateClaimRequirements');
    assert.equal(contract.independent_code_audit, false);
    const { validateClaimRequirements } = require('../../../src/next/provenance/claimRequirementCore');
    let controls = 0;
    for (const [sensitive, rowIndex] of samples) {
        const domain = sensitive ? api.preparePathQualificationAdmissionDomain({ preparation, rowIndex }) : first;
        const graph = graphs.get(preparation.rows[rowIndex].target.fact_key);
        const normalInput = { claims: docs.get(corpus.claim_contract.path).claims };
        const baseline = validateClaimRequirements({ ...normalInput, graphs: [graph] });
        for (const site of domain.admission_foundation.sites) for (const frame of site.frames) {
            const rule = frame.rule_dependency_frames.find(row => row.pass_id === contract.pass_id);
            assert.equal(rule.conditional_preservation_verified, !sensitive);
            assert.equal(rule.discharged, false);
            if (!sensitive) {
                const mutant = structuredClone(graph); let holder = mutant;
                for (const token of site.graph_location.slice(0, -1)) holder = holder[token];
                holder[site.graph_location.at(-1)] = structuredClone(preparation.rows[rowIndex]
                    .sites[site.site_index].domain.locators[frame.locator_index]);
                // Regression control, never a candidate-derived A/W basis.
                assert.deepEqual(validateClaimRequirements({ ...normalInput, graphs: [mutant] }), baseline); controls++;
            }
        }
    }
    assert.ok(controls > 0);
    const changed = structuredClone(first);
    changed.admission_foundation.normal_read_rule_contracts.find(row => row.pass_id === contract.pass_id).baseline_admission_required = false;
    assert.throws(() => api.verifyPathQualificationAdmissionDomain({ domain: first, candidate: changed }));
    const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
    const file = path.resolve(__dirname, '../../../src/next/provenance/pathQualificationV3.js');
    const isolated = new Module(file); isolated.filename = file;
    isolated.paths = Module._nodeModulePaths(path.dirname(file));
    isolated._compile(fs.readFileSync(file, 'utf8') + '\nmodule.exports.testQuery = projectAdmissionRuleDependencyFrames;', file);
    const graph = graphs.get(preparation.rows[samples.get(false)].target.fact_key);
    const target = graph.predicates.findIndex(value => value.id === preparation.rows[samples.get(false)].target.predicate_id);
    const participant = graph.predicates.findIndex(value => roots.includes(value.obligation));
    assert.ok(participant >= 0 && participant !== target);
    for (const mutate of [value => value.predicates[participant].args[0] = { literal: { type: 'id', value: '__synthetic__' } },
        value => value.predicates[participant].id += '_synthetic',
        value => value.claim_id += '_synthetic',
        value => value.trace_contract.proof.required_claim_reads.push({ segments: ['__synthetic__'] }),
        value => value.windows.__synthetic__ = { kind: 'month' },
        value => value.predicates[target].args[0] = { claim: { segments: ['period'] } }]) {
        const mutant = structuredClone(graph); mutate(mutant);
        const rule = isolated.exports.testQuery(graph, mutant, target).find(row => row.pass_id === contract.pass_id);
        assert.equal(rule.dependency_frame_verified, false);
        assert.equal(rule.conditional_preservation_verified, false);
    }
    const normal = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate: admittedCandidate(api, preparation), phaseProfile: await phaseFixture() });
    const originalRead = fs.readFileSync; let altered = 0;
    fs.readFileSync = function(file, ...args) {
        const value = originalRead.call(this, file, ...args);
        if (path.resolve(String(file)) !== path.resolve(__dirname, '../../../src/next/provenance/claimRequirementCore.js')) return value;
        const source = value.toString().replace('literal.type !== type || !same(literal.value, value)', 'false');
        assert.notEqual(source, value.toString()); altered++;
        return typeof value === 'string' ? source : Buffer.from(source);
    };
    try { assert.throws(() => normal.sealPathCandidateProgramExpectation({ authorship }), /admission_checker_read_contract_pin/); }
    finally { fs.readFileSync = originalRead; }
    assert.ok(altered > 0);
});

test('N02G:PATH-V3-077 collection read frames retain all fixture membership candidate anchors and graph roots before C', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const docs = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = docs.get('docs/contracts/next/provenance-v2/graphs-v2.json');
    const graphs = new Map(corpus.graphs.map(graph => [graph.fact_key, graph]));
    const samples = new Map();
    for (const [rowIndex, row] of preparation.rows.entries()) {
        if (!row.sites.every(site => site.domain_complete) || !row.sites.some(site => site.domain.locators.length)) continue;
        const predicate = graphs.get(row.target.fact_key).predicates.find(value => value.id === row.target.predicate_id);
        const sensitive = ['coverage', 'evidence_set'].includes(predicate.obligation);
        if (!samples.has(sensitive)) samples.set(sensitive, rowIndex);
        if (samples.size === 2) break;
    }
    assert.equal(samples.size, 2);
    const first = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex: samples.get(false) });
    const contract = first.admission_foundation.normal_read_rule_contracts.find(row => row.pass_id === 'collection_requirements');
    assert.ok(contract, 'missing normal collection read contract');
    assert.equal(contract.entrypoint, 'validateCollectionRequirements');
    assert.equal(contract.independent_code_audit, false);
    const { validateCollectionRequirements } = require('../../../src/next/provenance/collectionRequirements');
    let controls = 0;
    for (const [sensitive, rowIndex] of samples) {
        const domain = sensitive ? api.preparePathQualificationAdmissionDomain({ preparation, rowIndex }) : first;
        const graph = graphs.get(preparation.rows[rowIndex].target.fact_key);
        const normalInput = { snapshots: docs.get(corpus.snapshot_manifest.path).snapshots,
            materialRegistry: docs.get(corpus.material_registry.path) };
        const baseline = validateCollectionRequirements({ ...normalInput, graphs: [graph] });
        for (const site of domain.admission_foundation.sites) for (const frame of site.frames) {
            const rule = frame.rule_dependency_frames.find(row => row.pass_id === contract.pass_id);
            assert.equal(rule.conditional_preservation_verified, !sensitive);
            assert.equal(rule.discharged, false);
            if (!sensitive) {
                const mutant = structuredClone(graph); let holder = mutant;
                for (const token of site.graph_location.slice(0, -1)) holder = holder[token];
                holder[site.graph_location.at(-1)] = structuredClone(preparation.rows[rowIndex]
                    .sites[site.site_index].domain.locators[frame.locator_index]);
                assert.deepEqual(validateCollectionRequirements({ ...normalInput, graphs: [mutant] }), baseline); controls++;
            }
        }
    }
    assert.ok(controls > 0);
    const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
    const file = path.resolve(__dirname, '../../../src/next/provenance/pathQualificationV3.js');
    const isolated = new Module(file); isolated.filename = file;
    isolated.paths = Module._nodeModulePaths(path.dirname(file));
    isolated._compile(fs.readFileSync(file, 'utf8') + '\nmodule.exports.testQuery = projectAdmissionRuleDependencyFrames;', file);
    const graph = graphs.get(preparation.rows[samples.get(false)].target.fact_key);
    const target = graph.predicates.findIndex(value => value.id === preparation.rows[samples.get(false)].target.predicate_id);
    const participant = graph.predicates.findIndex(value => ['coverage', 'evidence_set'].includes(value.obligation));
    assert.ok(participant >= 0 && participant !== target);
    const selectionTemplate = corpus.graphs.flatMap(value => value.selections)[0];
    assert.ok(selectionTemplate, 'normal selection shape required for the collection root control');
    for (const mutate of [value => value.predicates[participant].args[0] = { literal: { type: 'boolean', value: false } },
        value => value.predicates[participant].id += '_synthetic',
        // Change the collection anchor while preserving the normal selection
        // shape. Missing predicate arrays would fail the separate selection
        // projection before this collection dependency frame is inspected.
        value => value.selections.push({ ...structuredClone(selectionTemplate), candidate_set: '__synthetic__' }),
        value => value.sets.__synthetic__ = [],
        value => value.nodes[Object.keys(value.nodes)[0]].kind = '__synthetic__']) {
        const mutant = structuredClone(graph); mutate(mutant);
        const rule = isolated.exports.testQuery(graph, mutant, target).find(row => row.pass_id === contract.pass_id);
        assert.equal(rule.dependency_frame_verified, false);
        assert.equal(rule.conditional_preservation_verified, false);
    }
    const normal = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate: admittedCandidate(api, preparation), phaseProfile: await phaseFixture() });
    const originalRead = fs.readFileSync; let altered = 0;
    fs.readFileSync = function(file, ...args) {
        const value = originalRead.call(this, file, ...args);
        if (path.resolve(String(file)) !== path.resolve(__dirname, '../../../src/next/provenance/collectionRequirements.js')) return value;
        const source = value.toString().replace('if (source[field] !== true)', 'if (false)');
        assert.notEqual(source, value.toString()); altered++;
        return typeof value === 'string' ? source : Buffer.from(source);
    };
    try { assert.throws(() => normal.sealPathCandidateProgramExpectation({ authorship }), /admission_checker_read_contract_pin/); }
    finally { fs.readFileSync = originalRead; }
    assert.ok(altered > 0);
});

test('N02G:PATH-V3-075 obligation read frames bind all participating arguments roots and pinned normal body before C', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const corpus = admittedDocuments(input.packageReceipt).find(row => row.path.endsWith('/graphs-v2.json')).value;
    const graphs = new Map(corpus.graphs.map(graph => [graph.fact_key, graph]));
    const sensitive = predicate => ['node_identity', 'semantic_integrity'].includes(predicate.obligation)
        || ['kind_is', 'fingerprint_is', 'ref_targets_node'].includes(predicate.op);
    const samples = new Map();
    for (const [rowIndex, row] of preparation.rows.entries()) {
        if (!row.sites.every(site => site.domain_complete) || !row.sites.some(site => site.domain.locators.length)) continue;
        const graph = graphs.get(row.target.fact_key), predicate = graph.predicates.find(value => value.id === row.target.predicate_id);
        if (!samples.has(sensitive(predicate))) samples.set(sensitive(predicate), rowIndex);
        if (samples.size === 2) break;
    }
    assert.equal(samples.size, 2);
    const first = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex: samples.get(false) });
    const contract = first.admission_foundation.normal_read_rule_contracts.find(row => row.pass_id === 'obligation_bindings');
    assert.ok(contract, 'missing normal obligation read contract');
    assert.equal(contract.entrypoint, 'validateObligationBindings');
    assert.equal(contract.baseline_admission_required, true);
    assert.equal(contract.independent_code_audit, false);
    const documents = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const normalInput = { snapshots: documents.get(corpus.snapshot_manifest.path).snapshots,
        materialRegistry: documents.get(corpus.material_registry.path) };
    const { validateObligationBindings } = require('../../../src/next/provenance/obligationBindings');
    for (const [isSensitive, rowIndex] of samples) {
        const domain = rowIndex === samples.get(false) ? first : api.preparePathQualificationAdmissionDomain({ preparation, rowIndex });
        const originalGraph = graphs.get(preparation.rows[rowIndex].target.fact_key);
        // Native static comparisons are regression controls only. The query
        // and rule are authored independently; a normal pass on M cannot
        // discharge A or supply a witness/domain expectation.
        const baselineControl = validateObligationBindings({ ...normalInput, graphs: [originalGraph] });
        let count = 0;
        for (const site of domain.admission_foundation.sites) for (const frame of site.frames) {
            const rule = frame.rule_dependency_frames.find(row => row.pass_id === contract.pass_id);
            assert.equal(rule.dependency_frame_verified, !isSensitive);
            assert.equal(rule.conditional_preservation_verified, !isSensitive);
            assert.equal(rule.discharged, false); count++;
            if (!isSensitive) {
                const mutant = structuredClone(originalGraph);
                let holder = mutant;
                for (const token of site.graph_location.slice(0, -1)) holder = holder[token];
                holder[site.graph_location.at(-1)] = structuredClone(preparation.rows[rowIndex]
                    .sites[site.site_index].domain.locators[frame.locator_index]);
                assert.deepEqual(validateObligationBindings({ ...normalInput, graphs: [mutant] }), baselineControl);
            }
        }
        assert.ok(count > 0);
    }
    const changed = structuredClone(first);
    changed.admission_foundation.normal_read_rule_contracts.find(row => row.pass_id === contract.pass_id).source_bindings.pop();
    assert.throws(() => api.verifyPathQualificationAdmissionDomain({ domain: first, candidate: changed }));
    // Isolated synthetic query sensitivity, not an operational candidate,
    // normal admission result or additional production authority.
    const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
    const file = path.resolve(__dirname, '../../../src/next/provenance/pathQualificationV3.js');
    const isolated = new Module(file); isolated.filename = file;
    isolated.paths = Module._nodeModulePaths(path.dirname(file));
    isolated._compile(fs.readFileSync(file, 'utf8') + '\nmodule.exports.testQuery = projectAdmissionRuleDependencyFrames;', file);
    const graph = graphs.get(preparation.rows[samples.get(false)].target.fact_key);
    const target = graph.predicates.findIndex(value => value.id === preparation.rows[samples.get(false)].target.predicate_id);
    const participant = graph.predicates.findIndex(sensitive);
    assert.ok(participant >= 0 && participant !== target);
    for (const mutate of [value => value.predicates[participant].args[0] = { literal: { type: 'id', value: '__synthetic__' } },
        value => value.predicates[participant].id += '_synthetic',
        value => value.nodes[Object.keys(value.nodes)[0]].version += '_synthetic',
        value => value.edges.push({ id: '__synthetic__' }),
        value => value.trace_contract.proof.required_reads.push({ node: '__synthetic__', segments: ['id'] })]) {
        const mutant = structuredClone(graph); mutate(mutant);
        const rule = isolated.exports.testQuery(graph, mutant, target).find(row => row.pass_id === contract.pass_id);
        assert.equal(rule.dependency_frame_verified, false);
        assert.equal(rule.conditional_preservation_verified, false);
    }
    const normal = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate: admittedCandidate(api, preparation),
        phaseProfile: await phaseFixture() });
    const originalRead = fs.readFileSync; let altered = 0;
    fs.readFileSync = function(file, ...args) {
        const value = originalRead.call(this, file, ...args);
        if (path.resolve(String(file)) !== path.resolve(__dirname, '../../../src/next/provenance/obligationBindings.js')) return value;
        const source = value.toString().replace("?.class === 'identity'", "?.class !== 'non_material'");
        assert.notEqual(source, value.toString()); altered++;
        return typeof value === 'string' ? source : Buffer.from(source);
    };
    try { assert.throws(() => normal.sealPathCandidateProgramExpectation({ authorship }), /admission_checker_read_contract_pin/); }
    finally { fs.readFileSync = originalRead; }
    assert.ok(altered > 0);
});

test('N02G:PATH-V3-074 normal material type constructors preserve nominal peers but leave ambiguous reference record and claim bases blocked before C', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const docs = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = docs.get('docs/contracts/next/provenance-v2/graphs-v2.json');
    const registry = docs.get(corpus.material_registry.path);
    const graphs = new Map(corpus.graphs.map(graph => [graph.fact_key, graph]));
    const samples = new Map();
    for (const [rowIndex, row] of preparation.rows.entries()) {
        if (!row.sites.every(site => site.domain_complete)) continue;
        const graph = graphs.get(row.target.fact_key);
        for (const site of row.sites) if (site.domain.locators.length) {
            let kind = 'claim';
            if (site.authored_site.definition !== 'claimPath') {
                const locator = site.domain.original;
                const owner = site.authored_site.definition === 'fieldPath' ? graph.nodes[locator.node].kind : locator.kind;
                const descriptor = registry.kinds[owner].fields[locator.segments[0]], type = descriptor.type;
                kind = site.authored_site.definition === 'fieldPath' && type === 'ref' && descriptor.targets.length === 1
                    ? 'single_target_reference'
                    : ['ref', 'ref_list', 'typed_result', 'typed_period', 'role_ref_list'].includes(type) ? 'reference_or_record' : 'primitive:' + type;
            }
            if (!samples.has(kind)) samples.set(kind, rowIndex);
        }
    }
    const primitiveKey = [...samples.keys()].find(key => key.startsWith('primitive:'));
    assert.ok(primitiveKey);
    const first = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex: samples.get(primitiveKey) });
    assert.ok(first.admission_foundation.normal_primitive_type_contract, 'missing normal primitive type contract');
    let preserved = 0, blocked = 0;
    const { compilePredicateTypes } = require('../../../src/next/provenance/predicateTypes');
    const typeInput = { claims: docs.get(corpus.claim_contract.path).claims,
        snapshots: docs.get(corpus.snapshot_manifest.path).snapshots, materialRegistry: registry,
        operatorRegistry: docs.get(corpus.operator_registry.path),
        claimSchema: docs.get('docs/contracts/next/provenance-v2/claim-contract.schema.json') };
    const projectedTypes = graph => compilePredicateTypes({ ...typeInput, graphs: [graph] })
        .typedGraphs[0].predicates.map(predicate => predicate.operands.map(operand => operand.type));
    for (const rowIndex of new Set(samples.values())) {
        const domain = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex });
        const graph = graphs.get(preparation.rows[rowIndex].target.fact_key), baselineTypes = projectedTypes(graph);
        for (const site of domain.admission_foundation.sites) for (const frame of site.frames) {
            const type = frame.structural_locator_constraint.primitive_type_constraint;
            assert.ok(type);
            assert.equal(type.normal_baseline_admission_verified, false);
            assert.equal(type.compiler_result_used, false);
            assert.equal(type.discharged, false);
            if (type.conditional_preservation_verified) {
                preserved++;
                const constructors = [type.baseline_constructor, type.alternative_constructor];
                assert.ok(constructors.every(value => ['material_primitive', 'single_target_reference_id'].includes(value)));
                assert.equal(type.status, constructors.includes('single_target_reference_id')
                    ? 'same_normal_single_target_reference_id_under_explicit_premises'
                    : 'same_normal_material_primitive_type_under_explicit_premises');
                assert.deepEqual(type.baseline_nominal, type.alternative_nominal);
                assert.ok(type.operator_instance.args.length > 0);
                assert.equal(type.window_and_set_inference_unchanged, true);
                // Native ordinary-pass comparison is a regression CONTROL
                // of this conditional lemma, not the authorial basis of A/W
                // or an operational expected derived from compiler output.
                const mutant = structuredClone(graph); let leaf = mutant;
                for (const token of site.graph_location.slice(0, -1)) leaf = leaf[token];
                const locator = preparation.rows[rowIndex].sites[site.site_index].domain.locators[frame.locator_index];
                leaf[site.graph_location.at(-1)] = structuredClone(locator);
                assert.deepEqual(projectedTypes(mutant), baselineTypes);
            } else {
                blocked++; assert.ok(type.status.startsWith('blocked_'));
            }
        }
        const clone = structuredClone(domain);
        clone.admission_foundation.normal_primitive_type_contract.baseline_admission_required = false;
        assert.throws(() => api.verifyPathQualificationAdmissionDomain({ domain, candidate: clone }));
        assert.equal(domain.admission_foundation.rule_discharge_complete, false);
    }
    assert.ok(preserved > 0);
    assert.equal(blocked > 0, samples.has('claim') || samples.has('reference_or_record'));
    const normal = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate: admittedCandidate(api, preparation),
        phaseProfile: await phaseFixture() });
    const fs = require('node:fs'), path = require('node:path'), originalRead = fs.readFileSync;
    let altered = 0;
    fs.readFileSync = function(file, ...args) {
        const value = originalRead.call(this, file, ...args);
        if (path.resolve(String(file)) !== path.resolve(__dirname, '../../../src/next/provenance/predicateTypes.js')) return value;
        const source = value.toString().replace("if (!own(registryFields, segments[0]) || registryFields[segments[0]].class === 'non_material') fail('field_material');",
            "if (false) fail('field_material');");
        assert.notEqual(source, value.toString()); altered++;
        return typeof value === 'string' ? source : Buffer.from(source);
    };
    try { assert.throws(() => normal.sealPathCandidateProgramExpectation({ authorship }), /admission_checker_primitive_type_contract_pin/); }
    finally { fs.readFileSync = originalRead; }
    assert.ok(altered > 0);
    assert.equal(canonicalValue(first).includes('reference_type_admitted'), false);
});

test('N02G:PATH-V3-073 template read frames retain all named bindings and set peers before C without type admission claims', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const preparation = api.preparePathQualificationInventory(await fixture());
    const samples = new Map();
    for (const [rowIndex, row] of preparation.rows.entries()) {
        if (!row.sites.every(site => site.domain_complete)) continue;
        for (const site of row.sites) if (site.domain.locators.length) {
            const kind = site.authored_site.site_path.includes('bindings') ? 'binding' : 'outside';
            if (!samples.has(kind)) samples.set(kind, rowIndex);
        }
    }
    assert.ok(samples.size > 0);
    const first = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex: samples.values().next().value });
    const contract = first.admission_foundation.normal_read_rule_contracts.find(row => row.pass_id === 'template_references');
    assert.ok(contract, 'missing pinned template input read contract');
    assert.equal(contract.entrypoint, 'validateTemplateReferences');
    assert.equal(contract.read_projection, 'all_template_arguments_set_peers_and_graph_roots_with_unchanged_documents');
    let preserved = 0, dependent = 0;
    for (const rowIndex of new Set(samples.values())) {
        const domain = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex });
        for (const [siteIndex, site] of domain.admission_foundation.sites.entries()) for (const frame of site.frames) {
            const rule = frame.rule_dependency_frames.find(row => row.pass_id === 'template_references');
            const binding = preparation.rows[rowIndex].sites[siteIndex].authored_site.site_path.includes('bindings');
            assert.equal(rule.dependency_frame_verified, !binding);
            assert.equal(rule.conditional_preservation_verified, !binding);
            assert.equal(rule.discharged, false);
            if (binding) dependent++; else preserved++;
        }
        const changed = structuredClone(domain);
        changed.admission_foundation.normal_read_rule_contracts.find(row => row.pass_id === 'template_references').source_bindings.pop();
        assert.throws(() => api.verifyPathQualificationAdmissionDomain({ domain, candidate: changed }));
        assert.equal(domain.admission_foundation.rule_discharge_complete, false);
    }
    assert.ok(preserved > 0);
    assert.equal(dependent > 0, samples.has('binding'));
    // Current authored template sites have no alternative in their genuine L.
    // Exercise read sensitivity separately with a synthetic mutation of an
    // actual authored binding. This is NOT an admitted candidate or a witness.
    // The private query is exposed only in this isolated test module copy;
    // no new production API, receipt/brand or runtime authority is created.
    const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
    const file = path.resolve(__dirname, '../../../src/next/provenance/pathQualificationV3.js');
    const isolated = new Module(file); isolated.filename = file;
    isolated.paths = Module._nodeModulePaths(path.dirname(file));
    isolated._compile(fs.readFileSync(file, 'utf8') + '\nmodule.exports.testQuery = projectAdmissionRuleDependencyFrames;', file);
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const input = await fixture();
    const corpus = admittedDocuments(input.packageReceipt).find(row => row.path.endsWith('/graphs-v2.json')).value;
    let sensitivity = 0;
    for (const graph of corpus.graphs) for (const [index, predicate] of graph.predicates.entries()) {
        for (const [operand, arg] of predicate.args.entries()) {
            if (!arg.template) continue;
            for (const [name, binding] of Object.entries(arg.bindings)) {
                const kind = ['field', 'selector', 'claim'].find(key => binding[key]?.segments);
                if (!kind) continue;
                const mutant = structuredClone(graph);
                mutant.predicates[index].args[operand].bindings[name][kind].segments[0] = '__synthetic_read_change__';
                const query = isolated.exports.testQuery(graph, mutant, index).find(row => row.pass_id === 'template_references');
                assert.equal(query.dependency_frame_verified, false);
                assert.equal(query.conditional_preservation_verified, false);
                assert.equal(query.discharged, false);
                sensitivity++;
            }
        }
    }
    assert.ok(sensitivity > 0);
    const normal = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate: admittedCandidate(api, preparation),
        phaseProfile: await phaseFixture() });
    const originalRead = fs.readFileSync;
    let altered = 0;
    fs.readFileSync = function(file, ...args) {
        const value = originalRead.call(this, file, ...args);
        if (path.resolve(String(file)) !== path.resolve(__dirname, '../../../src/next/provenance/templateReferences.js')) return value;
        const source = value.toString().replace("if (entry.hash !== arg.template.hash) fail('hash');", "if (false) fail('hash');");
        assert.notEqual(source, value.toString()); altered++;
        return typeof value === 'string' ? source : Buffer.from(source);
    };
    try { assert.throws(() => normal.sealPathCandidateProgramExpectation({ authorship }), /admission_checker_read_contract_pin/); }
    finally { fs.readFileSync = originalRead; }
    assert.ok(altered > 0);
    assert.equal(canonicalValue(first).includes('template_signature_admitted'), false);
});

test('N02G:PATH-V3-072 unchanged schema registry documents bind the normal projection rule before C without general schema claims', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const preparation = api.preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.sites.every(site => site.domain_complete)
        && row.sites.some(site => site.domain.locators.length));
    const domain = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex });
    const rule = domain.admission_foundation.normal_read_rule_contracts.find(rule => rule.pass_id === 'schema_registry_projection');
    assert.ok(rule, 'missing pinned schema registry projection read contract');
    assert.equal(rule.entrypoint, 'validateSchemaRegistryProjection');
    assert.equal(rule.independent_code_audit, false);
    for (const site of domain.admission_foundation.sites) for (const frame of site.frames) {
        const dependency = frame.rule_dependency_frames.find(row => row.pass_id === rule.pass_id);
        assert.equal(dependency.dependency_frame_verified, true);
        assert.equal(dependency.conditional_preservation_verified, true);
        assert.equal(dependency.discharged, false);
    }
    const changed = structuredClone(domain);
    changed.admission_foundation.normal_read_rule_contracts.find(row => row.pass_id === rule.pass_id).source_bindings.pop();
    assert.throws(() => api.verifyPathQualificationAdmissionDomain({ domain, candidate: changed }));
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate: admittedCandidate(api, preparation),
        phaseProfile: await phaseFixture() });
    const fs = require('node:fs'), path = require('node:path'), originalRead = fs.readFileSync;
    let changedBody = 0;
    fs.readFileSync = function(file, ...args) {
        const value = originalRead.call(this, file, ...args);
        if (path.resolve(String(file)) !== path.resolve(__dirname, '../../../src/next/provenance/schemaRegistryProjection.js')) return value;
        const source = value.toString().replace("registry.stage !== 'authoring' || registry.closed_world !== true", 'false');
        assert.notEqual(source, value.toString()); changedBody++;
        return typeof value === 'string' ? source : Buffer.from(source);
    };
    try { assert.throws(() => contract.sealPathCandidateProgramExpectation({ authorship }), /admission_checker_read_contract_pin/); }
    finally { fs.readFileSync = originalRead; }
    assert.ok(changedBody > 0);
    assert.equal(canonicalValue(domain).includes('general_schema_solver'), false);
    assert.equal(domain.admission_foundation.rule_discharge_complete, false);
});

test('N02G:PATH-V3-071 structural constraints classify only genuine locator members and preserve declared optional paths before M', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const documents = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = documents.get('docs/contracts/next/provenance-v2/graphs-v2.json');
    const claims = new Map(documents.get(corpus.claim_contract.path).claims.map(row => [row.fact_key, row]));
    const choices = new Map();
    for (const [rowIndex, row] of preparation.rows.entries()) for (const [siteIndex, site] of row.sites.entries()) {
        if (!site.domain_complete || !site.domain.locators.length) continue;
        if (!choices.has(site.authored_site.definition)) choices.set(site.authored_site.definition, { rowIndex, siteIndex });
        if (site.authored_site.definition !== 'claimPath' || choices.has('absent_claim')) continue;
        const absent = site.domain.locators.findIndex(locator => {
            let value = claims.get(row.target.fact_key);
            for (const key of locator.segments) {
                if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, key)) return true;
                value = value[key];
            }
            return false;
        });
        if (absent >= 0) choices.set('absent_claim', { rowIndex, siteIndex, absent });
    }
    let present = 0, absent = 0;
    for (const { rowIndex, siteIndex } of choices.values()) {
        const domain = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex });
        const site = domain.admission_foundation.sites[siteIndex];
        for (const frame of site.frames) {
            const constraint = frame.structural_locator_constraint;
            assert.ok(constraint, 'missing pre-M structural locator constraint');
            assert.equal(constraint.checker, 'graph_structure');
            assert.equal(constraint.baseline_locator_resolved, true);
            assert.equal(constraint.normal_baseline_admission_verified, false);
            assert.equal(constraint.compiler_result_used, false);
            assert.equal(constraint.qualified, false);
            if (constraint.resolution === 'present_authored_locator') {
                present++; assert.equal(constraint.expected_native_coordinate, null);
            } else {
                absent++; assert.equal(constraint.resolution, 'absent_authored_claim_path');
                assert.equal(constraint.expected_native_coordinate.code, 'claim_path');
                assert.deepEqual(constraint.expected_native_coordinate.site_path,
                    preparation.rows[rowIndex].sites[siteIndex].authored_site.site_path);
            }
        }
        const changed = structuredClone(domain);
        changed.admission_foundation.sites[siteIndex].frames[0].structural_locator_constraint.resolution = 'invented_admission';
        assert.throws(() => api.verifyPathQualificationAdmissionDomain({ domain, candidate: changed }));
        assert.equal(canonicalValue(domain.admission_foundation).includes('invented_admission'), false);
        assert.equal(domain.qualified, false);
    }
    assert.ok(present > 0);
    assert.equal(absent > 0, choices.has('absent_claim'));
    // Optional declarations are not necessarily members of the same nominal
    // domain of an actual predicate site. Reuse the existing enumeration test
    // case instead of inventing an operational missing-path candidate.
    const enumeration = require('../../../src/next/provenance/pathLocatorDomainV3').createLocatorDomainEnumeration(input.packageReceipt);
    let optional = 0;
    for (const [factKey, claim] of claims) if (!Object.hasOwn(claim, 'filters')) {
        assert.ok(enumeration.enumerateClaimLocators(factKey).some(row => canonicalValue(row.segments) === '["filters"]'));
        optional++;
    }
    assert.ok(optional > 0);
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate: admittedCandidate(api, preparation),
        phaseProfile: await phaseFixture() });
    const fs = require('node:fs'), path = require('node:path'), originalRead = fs.readFileSync;
    let changed = 0;
    fs.readFileSync = function(file, ...args) {
        const value = originalRead.call(this, file, ...args);
        if (path.resolve(String(file)) !== path.resolve(__dirname, '../../../src/next/provenance/graphStructure.js')) return value;
        const source = value.toString().replace("if (!Array.isArray(ref.segments) || !ref.segments.length) fail('claim_path');",
            "if (false) fail('claim_path');");
        assert.notEqual(source, value.toString()); changed++;
        return typeof value === 'string' ? source : Buffer.from(source);
    };
    try { assert.throws(() => contract.sealPathCandidateProgramExpectation({ authorship }), /admission_checker_structure_contract_pin/); }
    finally { fs.readFileSync = originalRead; }
    assert.ok(changed > 0);
});

test('N02G:PATH-V3-070 pinned normal read frames prove only conditional preservation and reject a changed checker before family sealing', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const fs = require('node:fs'), path = require('node:path');
    const sha = value => 'sha256:' + require('node:crypto').createHash('sha256').update(value).digest('hex');
    const preparation = api.preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.sites.every(site => site.domain_complete)
        && row.sites.some(site => site.domain.locators.length));
    const domain = api.preparePathQualificationAdmissionDomain({ preparation, rowIndex });
    const contracts = domain.admission_foundation.normal_read_rule_contracts;
    assert.ok(contracts, 'missing pinned conditional normal read frame contracts');
    assert.deepEqual(contracts.map(row => row.pass_id), ['static_evidence', 'graph_dependencies', 'operand_bindings', 'schema_registry_projection', 'template_references', 'obligation_bindings', 'claim_requirements', 'collection_requirements', 'selection_bindings']);
    for (const contract of contracts) {
        assert.equal(contract.scope, 'finite_pinned_normal_body_under_plain_admitted_data_and_normal_primitives');
        assert.equal(contract.baseline_admission_required, true);
        assert.equal(contract.checker_byte_binding_required, true);
        assert.equal(contract.argument_site_only, true);
        assert.equal(contract.normal_baseline_admission_verified, false);
        assert.equal(contract.independent_code_audit, false);
        for (const binding of contract.source_bindings)
            assert.equal(sha(fs.readFileSync(path.resolve(__dirname, '../../..', binding.path))), binding.sha256);
    }
    for (const site of domain.admission_foundation.sites) for (const frame of site.frames) {
        for (const contract of contracts) {
            const rule = frame.rule_dependency_frames.find(rule => rule.pass_id === contract.pass_id);
            assert.equal(rule.normal_read_rule_contract_sha256, sha(canonicalValue(contract)));
            assert.equal(rule.conditional_preservation_verified, rule.dependency_frame_verified);
            assert.equal(rule.normal_checker_read_coverage_verified, false);
            assert.equal(rule.discharged, false);
        }
        assert.equal(frame.normal_rule_frame_proved, false);
    }
    for (const mutate of [value => value.admission_foundation.normal_read_rule_contracts.pop(),
        value => value.admission_foundation.normal_read_rule_contracts[0].source_bindings[0].sha256 = 'sha256:' + '0'.repeat(64),
        value => value.admission_foundation.normal_read_rule_contracts[0].baseline_admission_required = false,
        value => value.admission_foundation.normal_read_rule_contracts[0].normal_baseline_admission_verified = true]) {
        const value = structuredClone(domain); mutate(value);
        assert.throws(() => api.verifyPathQualificationAdmissionDomain({ domain, candidate: value }));
    }
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate: admittedCandidate(api, preparation),
        phaseProfile: await phaseFixture() });
    const original = fs.readFileSync;
    let changed = 0;
    fs.readFileSync = function(file, ...args) {
        const value = original.call(this, file, ...args);
        if (path.resolve(String(file)) !== path.resolve(__dirname, '../../../src/next/provenance/graphCompiler.js')) return value;
        const source = value.toString().replace("if (graph.claim_id !== claim.claim_id) fail('claim_mismatch');",
            "if (false) fail('claim_mismatch');");
        assert.notEqual(source, value.toString()); changed++;
        return typeof value === 'string' ? source : Buffer.from(source);
    };
    try { assert.throws(() => contract.sealPathCandidateProgramExpectation({ authorship }), /admission_checker_read_contract_pin/); }
    finally { fs.readFileSync = original; }
    assert.ok(changed > 0);
    assert.equal(domain.admitted_domain_complete, domain.sites.every(site => site.admitted_domain_complete));
    assert.equal(domain.admission_foundation.rule_discharge_complete, false);
    assert.equal(domain.qualified, false);
});

test('N02G:PATH-V3-069 normal admission checker bytes bind the genuine family before C without discharging semantic rules', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const { buildCapturedValidationTools } = await import('../../../scripts/agent/buildNextValidationTcb.mjs');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const fs = require('node:fs'), path = require('node:path');
    const sha = value => 'sha256:' + require('node:crypto').createHash('sha256').update(value).digest('hex');
    const preparation = api.preparePathQualificationInventory(await fixture());
    const candidate = admittedCandidate(api, preparation), phaseProfile = await phaseFixture();
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile });
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship });
    const reference = expectation.normal_admission_checker_reference;
    assert.ok(reference, 'missing pre-C normal admission checker byte reference');
    const foundation = api.readPathCandidateProgramAuthorship({ authorship }).admissionFoundation;
    assert.equal(reference.admission_foundation_sha256, sha(canonicalValue(foundation)));
    assert.deepEqual(reference.normal_rule_composition, foundation.normal_rule_composition);
    assert.equal(reference.normal_rule_composition_sha256, sha(canonicalValue(foundation.normal_rule_composition)));
    assert.equal(reference.normal_rule_composition.conditional_coverage_complete, true);
    assert.equal(reference.normal_rule_composition.admitted_domain_complete, false);
    assert.ok(Object.values(reference.normal_rule_composition.required_premises).every(value => value === false));
    assert.deepEqual(reference.method_authority, foundation.method_authority);
    assert.deepEqual(reference.passes.map(pass => pass.id), foundation.passes.map(pass => pass.id));
    const expectedPaths = [...new Set(foundation.passes.flatMap(pass => pass.checker_sources))].sort();
    assert.deepEqual(reference.sources.map(source => source.path), expectedPaths);
    for (const source of reference.sources) {
        assert.equal(source.source, fs.readFileSync(path.resolve(__dirname, '../../..', source.path), 'utf8'));
        assert.equal(source.sha256, sha(source.source));
    }
    for (const pass of reference.passes) {
        const original = foundation.passes.find(row => row.id === pass.id);
        assert.deepEqual(pass.source_bindings.map(source => source.path), original.checker_sources);
        assert.equal(pass.normal_checker_read_coverage_verified,
            ['static_evidence', 'graph_dependencies', 'operand_bindings', 'schema_registry_projection', 'template_references', 'obligation_bindings', 'claim_requirements', 'collection_requirements', 'selection_bindings'].includes(pass.id));
        assert.equal(pass.discharged, false);
    }
    assert.equal(reference.sealed_before_captured_compile, true);
    assert.equal(reference.rule_discharge_complete, false);
    assert.deepEqual(reference.normal_read_rule_contracts.map(row => row.pass_id),
        foundation.normal_read_rule_contracts.map(row => row.pass_id));
    for (const contract of reference.normal_read_rule_contracts) {
        assert.equal(contract.source_bindings_verified, true);
        assert.equal(contract.normal_checker_read_coverage_verified, true);
        assert.equal(contract.conditional_preservation_verified, foundation.sites.every(site => site.domain_complete
            && site.frames.every(frame => frame.rule_dependency_frames.find(row => row.pass_id === contract.pass_id).dependency_frame_verified)));
        assert.equal(contract.normal_baseline_admission_verified, false);
        assert.equal(contract.discharged, false);
        assert.equal(contract.independent_code_audit, false);
    }
    assert.equal(reference.normal_structural_locator_contract.source_bindings_verified, true);
    assert.equal(reference.normal_structural_locator_contract.classification_complete, true);
    assert.equal(reference.normal_structural_locator_contract.normal_baseline_admission_verified, false);
    assert.equal(reference.normal_structural_locator_contract.discharged, false);
    assert.equal(reference.normal_primitive_type_contract.source_bindings_verified, true);
    assert.equal(reference.normal_primitive_type_contract.normal_baseline_admission_verified, false);
    assert.equal(reference.normal_primitive_type_contract.discharged, false);
    assert.equal(reference.normal_primitive_type_contract.conditional_preservation_complete,
        foundation.sites.every(site => site.domain_complete
            && site.frames.every(frame => frame.structural_locator_constraint.primitive_type_constraint.conditional_preservation_verified)));
    assert.ok(Object.isFrozen(reference) && Object.isFrozen(reference.sources[0]));
    const built = buildCapturedValidationTools();
    const recipe = JSON.parse(built.entries.find(row => row.path === 'recipe.json').source);
    const binding = { expectation, sourceHashes: built.hostSourceHashes, childSourceHashes: built.child.sourceHashes,
        schemaSources: recipe.schema_sources, schemaBuildSource: recipe.recipes.find(row => row.path === 'scripts/agent/buildNextProvenanceArtifacts.mjs').source };
    const verified = contract.verifyPathCandidateCapabilityBuildBinding(binding);
    assert.equal(verified.normal_admission_checker_source_conformance, true);
    assert.equal(verified.normal_admission_checker_reference_sha256, sha(canonicalValue(reference)));
    assert.equal(verified.normal_admission_rule_discharge_complete, false);
    for (const source of reference.sources) {
        const sources = structuredClone(built.hostSourceHashes);
        const row = sources.find(row => row.path === source.path.slice('src/next/'.length));
        assert.ok(row);
        row.sha256 = 'sha256:' + '0'.repeat(64);
        assert.throws(() => contract.verifyPathCandidateCapabilityBuildBinding({ ...binding, sourceHashes: sources }));
        assert.throws(() => contract.verifyPathCandidateCapabilityBuildBinding({ ...binding,
            sourceHashes: built.hostSourceHashes.filter(row => row.path !== source.path.slice('src/next/'.length)) }));
    }
    assert.throws(() => contract.verifyPathCandidateCapabilityBuildBinding({ ...binding, expectation: structuredClone(expectation) }));
    assert.throws(() => contract.verifyPathCandidateCapabilityBuildBinding({ ...binding,
        sourceHashes: [...built.hostSourceHashes, built.hostSourceHashes[0]] }));
    let touched = false;
    const active = structuredClone(built.hostSourceHashes);
    Object.defineProperty(active[0], 'sha256', { enumerable: true, get() { touched = true; throw new Error('active'); } });
    assert.throws(() => contract.verifyPathCandidateCapabilityBuildBinding({ ...binding, sourceHashes: active }));
    assert.equal(touched, false);
    const originalRead = fs.readFileSync;
    try {
        for (const source of reference.sources) {
            fs.readFileSync = function(file, ...args) {
                const value = originalRead.call(this, file, ...args);
                if (path.resolve(String(file)) !== path.resolve(__dirname, '../../..', source.path)) return value;
                return typeof value === 'string' ? value + '\n/* checker drift */' : Buffer.concat([value, Buffer.from('\n/* checker drift */')]);
            };
            assert.throws(() => contract.recheckPathCandidateCapabilities({ expectation }));
        }
    } finally { fs.readFileSync = originalRead; }
    contract.recheckPathCandidateCapabilities({ expectation });
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    require('../../../src/next/provenance/pathSemanticReference').sealPathQualificationReference({ candidate });
    let capture, changedReads = 0;
    fs.readFileSync = function(file, ...args) {
        const value = originalRead.call(this, file, ...args);
        if (path.resolve(String(file)) !== path.resolve(__dirname, '../../../src/next/provenance/graphStructure.js')) return value;
        changedReads++;
        return typeof value === 'string' ? value + '\n/* captured checker drift */'
            : Buffer.concat([value, Buffer.from('\n/* captured checker drift */')]);
    };
    try { capture = compiler.capturePathQualificationCompiler(); } finally { fs.readFileSync = originalRead; }
    assert.ok(changedReads > 0);
    let failure;
    try { compiler.compilePathQualificationProgramCandidate({ capture, candidate, expectation }); }
    catch (error) { failure = error; }
    assert.match(failure?.message ?? '', /admission_checker_BUILD_binding/);
    const retained = compiler.readPathQualificationCompilerEvidence(failure);
    assert.equal(retained.capability_conformance_failed, true);
    assert.equal(retained.stage, 'before_first_normal_compile');
    assert.equal(retained.handle_attempts, 0);
    assert.equal(retained.semantic_mutation_credit, 0);
    assert.throws(() => compiler.compilePathQualificationProgramCandidate({ capture, candidate, expectation }), /poisoned/);
    assert.equal(expectation.qualified, false);
    assert.equal(expectation.semantic_mutation_credit, 0);
    assert.equal(reference.independent_checker_semantics, false);
});

test('N02G:PATH-V3-068 relational rule dependency frames distinguish unchanged queries from argument sensitive bindings before M', async () => {
    const { preparePathQualificationInventory, preparePathQualificationAdmissionDomain } = require('../../../src/next/provenance/pathQualificationV3');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const input = await fixture(), preparation = preparePathQualificationInventory(input);
    const graphs = new Map(admittedDocuments(input.packageReceipt).find(entry => entry.path.endsWith('/graphs-v2.json'))
        .value.graphs.map(graph => [graph.fact_key, graph]));
    const expectedPasses = ['static_evidence', 'graph_dependencies', 'operand_bindings', 'schema_registry_projection', 'template_references',
        'obligation_bindings', 'claim_requirements', 'collection_requirements', 'selection_bindings'];
    const targets = [];
    for (let rowIndex = 0; rowIndex < preparation.rows.length; rowIndex++) {
        const row = preparation.rows[rowIndex], graph = graphs.get(row.target.fact_key);
        const predicate = graph.predicates.find(predicate => predicate.id === row.target.predicate_id);
        if (!row.sites.every(site => site.domain_complete) || !row.sites.some(site => site.domain.locators.length)) continue;
        const sensitive = predicate.obligation === 'node_identity' || predicate.obligation === 'semantic_integrity'
            || ['kind_is', 'fingerprint_is', 'ref_targets_node'].includes(predicate.op);
        if ((!sensitive && !targets.some(target => !target.sensitive)) || (sensitive && !targets.some(target => target.sensitive)))
            targets.push({ rowIndex, sensitive });
        if (targets.length === 2) break;
    }
    assert.equal(targets.length, 2);
    for (const target of targets) {
        const foundation = preparePathQualificationAdmissionDomain({ preparation, rowIndex: target.rowIndex }).admission_foundation;
        let frames = 0;
        for (const site of foundation.sites) for (const frame of site.frames) {
            frames++;
            assert.ok(frame.rule_dependency_frames, 'missing relational rule dependency frames');
            assert.deepEqual(frame.rule_dependency_frames.map(rule => rule.pass_id), expectedPasses);
            for (const rule of frame.rule_dependency_frames) {
                assert.equal(rule.dependency_frame_verified, rule.baseline_projection_sha256 === rule.mutant_projection_sha256);
                assert.equal(rule.normal_checker_read_coverage_verified, false);
                assert.equal(rule.discharged, false);
            }
            for (const id of expectedPasses.slice(0, 3)) {
                const rule = frame.rule_dependency_frames.find(rule => rule.pass_id === id);
                assert.equal(rule.dependency_frame_verified, true);
                assert.equal(rule.basis, 'unchanged_graph_and_documents_no_predicate_argument_reads');
            }
            const obligation = frame.rule_dependency_frames.find(rule => rule.pass_id === 'obligation_bindings');
            assert.equal(obligation.dependency_frame_verified, !target.sensitive);
            if (target.sensitive) assert.notEqual(obligation.baseline_projection_sha256, obligation.mutant_projection_sha256);
        }
        assert.ok(frames > 0);
        assert.equal(foundation.rule_discharge_complete, false);
        assert.equal(foundation.compiler_result_used, false);
    }
});

test('N02G:PATH-V3-067 admission foundation seals normal pass obligations and exact single site frames before M without claiming complete A', async () => {
    const { preparePathQualificationInventory, preparePathQualificationAdmissionDomain,
        verifyPathQualificationAdmissionDomain } = require('../../../src/next/provenance/pathQualificationV3');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const hash = value => 'sha256:' + require('node:crypto').createHash('sha256').update(canonicalValue(value)).digest('hex');
    const input = await fixture(), preparation = preparePathQualificationInventory(input);
    const rowIndex = preparation.rows.findIndex(row => row.sites.every(site => site.domain_complete)
        && row.sites.some(site => site.domain.locators.length > 1));
    assert.ok(rowIndex >= 0);
    const row = preparation.rows[rowIndex];
    const graph = admittedDocuments(input.packageReceipt).find(entry => entry.path.endsWith('/graphs-v2.json'))
        .value.graphs.find(graph => graph.fact_key === row.target.fact_key);
    const predicateIndex = graph.predicates.findIndex(predicate => predicate.id === row.target.predicate_id);
    const domain = preparePathQualificationAdmissionDomain({ preparation, rowIndex });
    const foundation = domain.admission_foundation;
    assert.ok(foundation, 'missing pre-M declarative admission foundation');
    assert.equal(foundation.graph_sha256, hash(graph));
    assert.equal(foundation.rule_discharge_complete, false);
    assert.equal(foundation.normal_pipeline_binding_verified, false);
    assert.equal(foundation.compiler_result_used, false);
    assert.deepEqual(foundation.passes.map(pass => pass.id), ['package_schemas', 'schema_registry_projection',
        'static_evidence', 'graph_dependencies', 'operand_bindings', 'graph_structure', 'template_references',
        'predicate_types', 'obligation_bindings', 'claim_requirements', 'selection_bindings', 'collection_requirements']);
    assert.equal(foundation.documents.length, admittedDocuments(input.packageReceipt).length);
    for (const pass of foundation.passes) {
        assert.equal(pass.status, 'pending_normative_rule_discharge');
        assert.equal(pass.instance.fact_key, row.target.fact_key);
        assert.equal(pass.instance.predicate_id, row.target.predicate_id);
        assert.deepEqual(pass.instance.predicate, graph.predicates[predicateIndex]);
        assert.equal(pass.discharged, false);
        assert.ok(pass.checker_sources.length > 0);
    }
    for (const site of foundation.sites) {
        const source = row.sites[site.site_index];
        assert.deepEqual(site.graph_location, ['predicates', predicateIndex, ...source.domain.location]);
        assert.equal(site.frames.length, source.domain.locators.length);
        const erase = value => {
            const result = structuredClone(value); let container = result;
            for (const token of site.graph_location.slice(0, -1)) container = container[token];
            container[site.graph_location.at(-1)] = null;
            return hash(result);
        };
        assert.equal(site.unchanged_authorship_sha256, erase(graph));
        for (const frame of site.frames) {
            const mutant = structuredClone(graph); let container = mutant;
            for (const token of site.graph_location.slice(0, -1)) container = container[token];
            container[site.graph_location.at(-1)] = structuredClone(source.domain.locators[frame.locator_index]);
            assert.equal(frame.original_locator_sha256, hash(source.domain.original));
            assert.equal(frame.alternative_locator_sha256, hash(source.domain.locators[frame.locator_index]));
            assert.equal(frame.mutant_authorship_sha256, hash(mutant));
            assert.equal(frame.unchanged_authorship_sha256, erase(mutant));
            assert.equal(frame.single_site_frame_verified, true);
            assert.equal(frame.normal_rule_frame_proved, false);
        }
    }
    assert.equal(verifyPathQualificationAdmissionDomain({ domain, candidate: structuredClone(domain) }).foundation_integrity, true);
    for (const mutate of [x => x.admission_foundation.passes.pop(),
        x => x.admission_foundation.passes[0].discharged = true,
        x => x.admission_foundation.passes[1].instance.predicate.args.reverse(),
        x => x.admission_foundation.documents.pop(),
        x => x.admission_foundation.sites[0].graph_location.reverse(),
        x => x.admission_foundation.sites.find(site => site.frames.length).frames.pop(),
        x => x.admission_foundation.rule_discharge_complete = true]) {
        const candidate = structuredClone(domain); mutate(candidate);
        assert.throws(() => verifyPathQualificationAdmissionDomain({ domain, candidate }));
    }
    for (let index = 0; index < foundation.passes.length; index++) {
        const candidate = structuredClone(domain);
        candidate.admission_foundation.passes[index].checker_sources = ['caller_checker.js'];
        assert.throws(() => verifyPathQualificationAdmissionDomain({ domain, candidate }));
    }
    let effects = 0;
    const active = structuredClone(domain);
    Object.defineProperty(active.admission_foundation.passes[0], 'instance', {
        enumerable: true, get() { effects++; return foundation.passes[0].instance; } });
    assert.throws(() => verifyPathQualificationAdmissionDomain({ domain, candidate: active }));
    const proxy = structuredClone(domain);
    proxy.admission_foundation.sites[0] = new Proxy(proxy.admission_foundation.sites[0], {
        ownKeys() { effects++; return []; } });
    assert.throws(() => verifyPathQualificationAdmissionDomain({ domain, candidate: proxy }));
    assert.throws(() => verifyPathQualificationAdmissionDomain({ domain: structuredClone(domain), candidate: domain }));
    assert.equal(effects, 0);
    assert.equal(domain.qualified, false);
    assert.equal(domain.semantic_mutation_credit, 0);
});

test('N02G:PATH-V3-066 captured INTERNAL witness entry binds external pins and blocks incomplete prerequisites before handles', async () => {
    const { buildCapturedValidationTools } = await import('../../../scripts/agent/buildNextValidationTcb.mjs');
    const built = buildCapturedValidationTools();
    let handles = 0;
    const tools = require('node:vm').runInThisContext(`(function(require){return ${built.source}\n})`)(name => {
        if (name === 'node:fs') return Object.freeze({ readFileSync() { handles++; throw new Error('no handles'); } });
        if (name === 'node:child_process') return { spawn() { handles++; throw new Error('no child'); },
            fork() { handles++; throw new Error('no child'); } };
        return require(name);
    });
    assert.equal(typeof tools.initializePathQualification, 'function');
    const { canonicalValue, digest } = require('../../../src/next/kernel/canonicalValue');
    const hash = value => 'sha256:' + require('node:crypto').createHash('sha256').update(value).digest('hex');
    const commitment = source => 'sha256:' + digest({ source });
    // Synthetic blocked transport construction, NOT an audited/executable ticket.
    const normalAdmissionBasis = {
        stage: 'path_v3_captured_normal_admission_basis_not_independent_review',
        conditional_partition: null, normal_rule_reference: null, premise_evidence: null,
        native_controls: null, normal_worlds: [],
        independent_reviewed_rule_basis_verified: false, qualified: false, semantic_mutation_credit: 0 };
    const payloadSource = canonicalValue({ worlds: [], normal_admission_basis: normalAdmissionBasis });
    const ticket = { stage: 'path_v3_execution_ticket_not_financial_authority', method_commit: '72fc5a5b707909687da9b5cec892be2dcc892a62',
        candidate_id: 'candidate/blocked', invocation_id: 'invocation/blocked', target_fact_key: 'S-01#1#1',
        reference: { candidate_id: 'candidate/blocked', invocation_id: 'invocation/blocked', discriminating: true },
        reference_commitment: 'sha256:' + digest({ candidate_id: 'candidate/blocked', invocation_id: 'invocation/blocked', discriminating: true }),
        preselection_commitments: { entries_sha256: hash('entries'), domain_sha256: hash('domain') },
        normal_admission_basis_commitment: commitment(canonicalValue(normalAdmissionBasis)),
        prerequisites: { admitted_domain_complete: false, witness_domain_complete: false, first_witness_proved: false,
            normal_admission_verified: false, reference_preselected: true, normal_compilation_complete: false },
        payload_commitment: commitment(payloadSource), worlds: ['C', 'M', 'S'].map(variant =>
            ({ variant, execution_id: 'execution/' + variant, package_root: hash(variant) })) };
    const ticketSource = canonicalValue(ticket), expectedTicketCommitment = commitment(ticketSource);
    const freezeBytes = Buffer.from(canonicalValue({ schema_version: 1, freeze_id: 'provenance_execution', freeze_version: 1,
        stage: 'execution', metric_registry_hash: hash('registry'), validation_tcb_root: built.artifact_root,
        child_capsule_root: built.child.artifact_root, native_runtime: { platform: process.platform, arch: process.arch,
            node_version: process.version, node_binary_sha256: 'sha256:' + '0'.repeat(64) },
        package_authority: [{ path: 'docs/sample.json', sha256: hash('{}') }],
        proof_programs: [{ program_id: hash('program'), proof_engine_artifact_root: hash('proof') }] }));
    const bootstrap = { freezeBytes, expectedFreezeHash: hash(freezeBytes), tcbArtifact: { manifestBytes: Buffer.from(built.manifest),
        entries: built.entries.map(row => ({ path: row.path, bytes: Buffer.from(row.source) })) } };
    const input = { ticketSource, payloadSource, expectedTicketCommitment };
    let effects = 0;
    const active = { payloadSource, expectedTicketCommitment };
    Object.defineProperty(active, 'ticketSource', { enumerable: true, get() { effects++; return ticketSource; } });
    for (const bad of [active, new Proxy(input, { ownKeys() { effects++; return []; } }),
        { ...input, extra: true }, { ...input, payloadSource: payloadSource + ' ' },
        { ...input, ticketSource: canonicalValue({ ...ticket, invocation_id: 'caller' }) }])
        assert.throws(() => tools.initializePathQualification(bad, bootstrap));
    assert.equal(effects, 0); assert.equal(handles, 0);
    const host = tools.initializePathQualification(input, bootstrap);
    assert.equal(host.candidate_id, ticket.candidate_id); assert.equal(host.invocation_id, ticket.invocation_id);
    assert.equal(host.execution_permitted, false); assert.equal(host.qualified, false);
    assert.equal(host.financial_acceptance, false); assert.equal(host.semantic_mutation_credit, 0);
    assert.equal(Object.isFrozen(host), true);
    assert.equal(host.runAdmittedGraph, undefined);
    await assert.rejects(host.run.call({ ...host }), /origin/);
    await assert.rejects(host.run(), /prerequisites/);
    await assert.rejects(host.run(), /replay/);
    assert.equal(handles, 0);
    const launcherSource = built.entries.find(row => row.path === 'launcher-bootstrap.js').source;
    const launch = require('node:vm').runInThisContext(`(function(require){return ${launcherSource}\n})`)(name => {
        if (name === 'node:fs') return Object.freeze({ readFileSync() { handles++; throw new Error('no handles'); } });
        if (name === 'node:child_process') return { spawn() { handles++; throw new Error('no child'); },
            fork() { handles++; throw new Error('no child'); } };
        return require(name);
    });
    assert.throws(() => launch({ ...bootstrap, qualification: { ...input, expectedTicketCommitment: hash('caller') } }), /pin/);
    const qualification = { ...input }, loaded = launch({ ...bootstrap, qualification });
    qualification.ticketSource = 'caller mutation'; qualification.payloadSource = '{}';
    assert.deepEqual(Object.keys(loaded).sort(), ['financial_acceptance', 'initializePathQualification', 'stage']);
    assert.throws(() => loaded.initializePathQualification.call({ ...loaded }), /origin/);
    assert.throws(() => loaded.initializePathQualification({ invocation_id: 'caller' }), /origin/);
    const capturedHost = loaded.initializePathQualification();
    assert.equal(capturedHost.invocation_id, ticket.invocation_id);
    assert.throws(() => loaded.initializePathQualification(), /already_initialized/);
    await assert.rejects(capturedHost.run(), /prerequisites/);
    assert.equal(handles, 0);
    // Synthetic malformed provisioning exercises source-shape rejection only.
    // Locally computed pins/true flags are NOT audited admission or permission;
    // these payloads must fail before registry admission, runtime or D/P.
    const world = variant => ({ variant, package_root: hash(variant), proof_program_id: hash('program'),
        evaluator_ref: { evaluator_id: 'synthetic', evaluator_version: 1 }, registry_source: '{}', contract_source: '{}',
        metric_artifact: { manifest: '{}', entries: [] }, proof_artifact: { manifest: '{}', entries: [] },
        derivation: {}, proof: {}, timeout_ms: 5000 });
    const absentBasisPayload = canonicalValue({ worlds: ['C', 'M', 'S'].map(world),
        normal_admission_basis: normalAdmissionBasis });
    const absentBasisTicket = canonicalValue({ ...ticket,
        prerequisites: Object.fromEntries(Object.keys(ticket.prerequisites).map(key => [key, true])),
        payload_commitment: commitment(absentBasisPayload) });
    const absentBasisHost = tools.initializePathQualification({ ticketSource: absentBasisTicket,
        payloadSource: absentBasisPayload, expectedTicketCommitment: commitment(absentBasisTicket) }, bootstrap);
    await assert.rejects(absentBasisHost.run(), /captured_path_normal_admission_basis_relation/);
    await assert.rejects(absentBasisHost.run(), /replay/);
    assert.equal(handles, 0);
    for (const variant of ['C', 'M', 'S']) for (const field of ['registry_source', 'contract_source',
        'metric_artifact.manifest', 'proof_artifact.manifest']) for (const bad of [null, true, 7, [], {}]) {
        const worlds = ['C', 'M', 'S'].map(world);
        const row = worlds.find(item => item.variant === variant), parts = field.split('.');
        if (parts.length === 1) row[field] = bad; else row[parts[0]][parts[1]] = bad;
        const malformedPayload = canonicalValue({ worlds, normal_admission_basis: normalAdmissionBasis });
        const malformedTicket = canonicalValue({ ...ticket,
            prerequisites: Object.fromEntries(Object.keys(ticket.prerequisites).map(key => [key, true])),
            payload_commitment: commitment(malformedPayload) });
        const malformed = tools.initializePathQualification({ ticketSource: malformedTicket,
            payloadSource: malformedPayload, expectedTicketCommitment: commitment(malformedTicket) }, bootstrap);
        await assert.rejects(malformed.run(), /captured_path_source_type/, `${variant}/${field}/${JSON.stringify(bad)}`);
        await assert.rejects(malformed.run(), /replay/);
    }
    // The BUILD transport carries the normal closed id/version reference.
    // Bad references must fail before even the deliberately invalid registry
    // source below, without running any admitted graph or acquiring handles.
    for (const variant of ['C', 'M', 'S']) for (const bad of ['synthetic', null, [], {},
        { evaluator_id: 'synthetic' }, { evaluator_id: 'synthetic', evaluator_version: 0 },
        { evaluator_id: 'synthetic', evaluator_version: '1' },
        { evaluator_id: 7, evaluator_version: 1 },
        { evaluator_id: 'synthetic', evaluator_version: 1, extra: true }]) {
        const worlds = ['C', 'M', 'S'].map(world), row = worlds.find(item => item.variant === variant);
        row.evaluator_ref = bad; row.registry_source = null;
        const malformedPayload = canonicalValue({ worlds, normal_admission_basis: normalAdmissionBasis });
        const malformedTicket = canonicalValue({ ...ticket,
            prerequisites: Object.fromEntries(Object.keys(ticket.prerequisites).map(key => [key, true])),
            payload_commitment: commitment(malformedPayload) });
        const malformed = tools.initializePathQualification({ ticketSource: malformedTicket,
            payloadSource: malformedPayload, expectedTicketCommitment: commitment(malformedTicket) }, bootstrap);
        await assert.rejects(malformed.run(), /captured_path_evaluator_ref/, `${variant}/${JSON.stringify(bad)}`);
        await assert.rejects(malformed.run(), /replay/);
    }
    assert.equal(handles, 0);
});

test('N02G:PATH-V3-065 invalid phase authority poisons the witness bridge before compile and keeps genuine failure evidence', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const preparation = api.preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
        && row.target.predicate_id === 'link_2_refund_sign');
    const plan = api.preparePathQualificationWitnessPreselection({ preparation, rowIndex });
    const capture = compiler.capturePathQualificationCompiler(), phaseProfile = await phaseFixture();
    let effects = 0;
    const activeProfile = new Proxy(phaseProfile, { get() { effects++; throw new Error('active'); } });
    let failure;
    try { compiler.compilePathQualificationWitnessPreselection({ capture, plan, phaseProfile: activeProfile }); }
    catch (error) { failure = error; }
    assert.ok(failure);
    assert.equal(effects, 0);
    const evidence = compiler.readPathQualificationCompilerEvidence(failure);
    assert.ok(evidence);
    assert.equal(evidence.normal_compile_path_entered, false);
    assert.equal(evidence.stage, 'path_v3_witness_program_preparation_failed_before_compile');
    assert.equal(evidence.invocation_id, plan.selected.invocation_id);
    assert.deepEqual(evidence.witness_preselection.selected, plan.selected);
    assert.equal(evidence.handle_attempts, 0);
    assert.equal(evidence.qualified, false);
    assert.equal(evidence.dp_execution, false);
    assert.equal(evidence.semantic_mutation_credit, 0);
    assert.equal(compiler.readPathQualificationCompilerEvidence(new Error(failure.message)), null);
    assert.throws(() => api.takePathQualificationWitnessPreselection({ plan }));
    assert.throws(() => compiler.compilePathQualificationWitnessPreselection({ capture, plan: null, phaseProfile }),
        /capture_authority_or_poisoned/);
    assert.throws(() => compiler.readPathQualificationProgramsEvidence({ result: failure, variant: 'C' }));
});

test('N02G:PATH-V3-064 preselected reference is bound to whole real normal C M S programs without caller choice or qualification', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    assert.equal(typeof compiler.compilePathQualificationWitnessPreselection, 'function');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
        && row.target.predicate_id === 'link_2_refund_sign');
    const plan = api.preparePathQualificationWitnessPreselection({ preparation, rowIndex });
    const capture = compiler.capturePathQualificationCompiler(), phaseProfile = await phaseFixture();
    assert.throws(() => compiler.compilePathQualificationWitnessPreselection({ capture, plan: structuredClone(plan), phaseProfile }));
    assert.throws(() => compiler.compilePathQualificationWitnessPreselection({ capture: structuredClone(capture), plan, phaseProfile }));
    assert.throws(() => compiler.compilePathQualificationWitnessPreselection({ capture, plan, phaseProfile, expected: false }));
    let effects = 0;
    const active = { capture, phaseProfile };
    Object.defineProperty(active, 'plan', { enumerable: true, get() { effects++; return plan; } });
    assert.throws(() => compiler.compilePathQualificationWitnessPreselection(active));
    const proxy = new Proxy(plan, { get() { effects++; throw new Error('active'); } });
    assert.throws(() => compiler.compilePathQualificationWitnessPreselection({ capture, plan: proxy, phaseProfile }));
    assert.equal(effects, 0);
    const result = compiler.compilePathQualificationWitnessPreselection({ capture, plan, phaseProfile });
    assert.equal(typeof compiler.preparePathQualificationExecutionTransport, 'function');
    assert.throws(() => compiler.preparePathQualificationExecutionTransport({ result: structuredClone(result) }));
    assert.throws(() => compiler.preparePathQualificationExecutionTransport({ result, expected: true }));
    const transport = compiler.preparePathQualificationExecutionTransport({ result });
    const ticket = JSON.parse(transport.ticketSource), payload = JSON.parse(transport.payloadSource);
    assert.ok(payload.normal_admission_basis, 'missing full genuine normal admission basis in INTERNAL transport');
    assert.deepEqual(payload.normal_admission_basis.conditional_partition, plan.conditional_domain_partition);
    assert.deepEqual(payload.normal_admission_basis.normal_rule_reference,
        result.program_expectation.normal_admission_checker_reference);
    assert.deepEqual(payload.normal_admission_basis.premise_evidence,
        result.witness_site_admission_controls.normal_admission_premise_evidence);
    assert.deepEqual(payload.normal_admission_basis.native_controls, result.witness_site_admission_controls);
    assert.deepEqual(payload.normal_admission_basis.native_controls.unknown_path_control_plan, plan.site_admission_control_plan);
    assert.deepEqual(payload.normal_admission_basis.native_controls.selection_control_plan, plan.selection_admission_control_plan);
    assert.deepEqual(payload.normal_admission_basis.normal_worlds, result.worlds);
    const basisSource = require('../../../src/next/kernel/canonicalValue').canonicalValue(payload.normal_admission_basis);
    assert.equal(ticket.normal_admission_basis_commitment,
        'sha256:' + require('../../../src/next/kernel/canonicalValue').digest({ source: basisSource }));
    assert.equal(payload.normal_admission_basis.independent_reviewed_rule_basis_verified, false);
    assert.equal(payload.normal_admission_basis.qualified, false);
    assert.equal(payload.normal_admission_basis.semantic_mutation_credit, 0);
    assert.equal(ticket.candidate_id, plan.selected.candidate_id);
    assert.equal(ticket.invocation_id, plan.selected.invocation_id);
    assert.equal(ticket.target_fact_key, 'S-01#1#1');
    assert.deepEqual(ticket.reference, result.reference);
    assert.equal(ticket.reference_commitment, plan.selected.reference_sha256);
    assert.deepEqual(ticket.worlds.map(world => world.variant), ['C', 'M', 'S']);
    assert.equal(new Set(ticket.worlds.map(world => world.execution_id)).size, 3);
    assert.equal(ticket.prerequisites.admitted_domain_complete, false);
    assert.equal(ticket.prerequisites.first_witness_proved, false);
    assert.equal(transport.qualified, false);
    assert.equal(transport.semantic_mutation_credit, 0);
    assert.equal(Object.isFrozen(transport), true);
    for (const world of payload.worlds) {
        const actual = compiler.readPathQualificationProgramsEvidence({ result, variant: world.variant })
            .find(row => row.fact_key === ticket.target_fact_key).candidate;
        assert.equal(world.proof_artifact.entries[0].source, actual.source);
        assert.equal(world.proof_artifact.manifest, actual.manifest);
    }
    assert.throws(() => compiler.preparePathQualificationExecutionTransport({ result }), /replay/);
    // End-to-end construction from the genuine BUILD result, without changing
    // its incomplete A/W flags. These measured TEST pins are not independent
    // review, and the impossible runtime pin ensures no runtime read is needed
    // to reject the captured request before handles.
    const { buildCapturedValidationTools } = await import('../../../scripts/agent/buildNextValidationTcb.mjs');
    const tcb = buildCapturedValidationTools();
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const hash = bytes => 'sha256:' + require('node:crypto').createHash('sha256').update(bytes).digest('hex');
    const proofRoots = new Map();
    for (const world of payload.worlds) {
        const root = hash(world.proof_artifact.manifest);
        if (proofRoots.has(world.proof_program_id)) assert.equal(proofRoots.get(world.proof_program_id), root);
        proofRoots.set(world.proof_program_id, root);
    }
    const freezeBytes = Buffer.from(canonicalValue({ schema_version: 1, freeze_id: 'provenance_execution', freeze_version: 1,
        stage: 'execution', metric_registry_hash: hash(payload.worlds[0].registry_source),
        validation_tcb_root: tcb.artifact_root, child_capsule_root: tcb.child.artifact_root,
        native_runtime: { platform: process.platform, arch: process.arch, node_version: process.version,
            node_binary_sha256: 'sha256:' + '0'.repeat(64) }, package_authority: plan.baseline_package,
        proof_programs: [...proofRoots].sort(([a], [b]) => a.localeCompare(b))
            .map(([program_id, proof_engine_artifact_root]) => ({ program_id, proof_engine_artifact_root })) }));
    let capturedHandles = 0;
    const launcherSource = tcb.entries.find(row => row.path === 'launcher-bootstrap.js').source;
    const launch = require('node:vm').runInThisContext(`(function(require){return ${launcherSource}\n})`)(name => {
        if (name === 'node:fs') return Object.freeze({ readFileSync() { capturedHandles++; throw new Error('no handles'); } });
        if (name === 'node:child_process') return { spawn() { capturedHandles++; throw new Error('no child'); },
            fork() { capturedHandles++; throw new Error('no child'); } };
        return require(name);
    });
    const loaded = launch({ freezeBytes, expectedFreezeHash: hash(freezeBytes),
        tcbArtifact: { manifestBytes: Buffer.from(tcb.manifest),
            entries: tcb.entries.map(row => ({ path: row.path, bytes: Buffer.from(row.source) })) },
        qualification: { ticketSource: transport.ticketSource, payloadSource: transport.payloadSource,
            expectedTicketCommitment: transport.measured_ticket_commitment } });
    const capturedHost = loaded.initializePathQualification();
    assert.equal(capturedHost.candidate_id, result.candidate_id);
    assert.equal(capturedHost.invocation_id, result.invocation_id);
    assert.equal(capturedHost.reference_commitment, plan.selected.reference_sha256);
    assert.equal(capturedHost.execution_permitted, false);
    await assert.rejects(capturedHost.run(), /captured_path_prerequisites/);
    await assert.rejects(capturedHost.run(), /captured_path_replay/);
    assert.throws(() => loaded.initializePathQualification(), /already_initialized/);
    assert.equal(capturedHandles, 0);
    // Recomputed TEST pins exercise internal lineage, not authentication of a
    // provisioning caller or independent approval of the rewritten request.
    const commitSource = source => hash(canonicalValue({ source }));
    const basisMutations = [
        ['domain', basis => { basis.conditional_partition.domain_sha256 = hash('foreign-domain'); }],
        ['rule-composition', basis => { basis.normal_rule_reference.normal_rule_composition_sha256 = hash('foreign-rules'); }],
        ['partition-premise', basis => { basis.premise_evidence.conditional_partition_sha256 = hash('foreign-partition'); }],
        ['rule-premise', basis => { basis.premise_evidence.normal_rule_composition_sha256 = hash('foreign-premise'); }],
        ['native-controls', basis => { basis.native_controls.native_barriers_verified = false; }],
        ['positive-root', basis => { basis.normal_worlds[0].package_root = hash('foreign-package'); }],
        ['compiler-root', basis => { basis.premise_evidence.compiler_artifact_root = hash('foreign-compiler'); }],
        ['checker-source', basis => { const row = basis.normal_rule_reference.sources[0];
            row.source += '\n// foreign body'; row.sha256 = hash(row.source); }]
    ];
    // Rebind all transport/premise hashes after corrupting each observed
    // control. A checksum mismatch must not hide missing predicate checks.
    for (const key of ['unknown_path_controls', 'selection_controls']) {
        for (let index = 0; index < payload.normal_admission_basis.native_controls[key].length; index++) {
            for (const [label, mutate] of [
                ['native-match', control => { control.native_control_matched = false; }],
                ['handle-attempt', control => { control.handle_attempts = 1; }],
                ['negative-M', control => { control.worlds[1].admitted = true; }],
                ['site-coordinate', control => { control.site_index = -1; }],
                ['control-order', control => { control.control_index = -1; }],
                ['control-mode', control => { control.mode = 'foreign'; }],
                ['selected-candidate', control => { control.candidate_id = ticket.candidate_id; }],
                ['selected-invocation', control => { control.invocation_id = ticket.invocation_id; }],
                ['forged-native-authority', control => { control.worlds[1].diagnostic.forged_same_text_has_authority = true; }],
                ['qualified-control', control => { control.qualified = true; }],
                ['control-credit', control => { control.semantic_mutation_credit = 1; }],
                ['control-DP', control => { control.dp_execution = true; }],
                ['negative-coordinate', control => { control.worlds[1].diagnostic.native_coordinate = { checker: 'foreign' }; }]
            ]) basisMutations.push([`${key}/${index}/${label}`, basis => mutate(basis.native_controls[key][index]), true]);
        }
        if (payload.normal_admission_basis.native_controls[key].length) {
            basisMutations.push([`${key}/omission`, basis => { basis.native_controls[key].pop(); }, true]);
            basisMutations.push([`${key}/duplicate`, basis => {
                basis.native_controls[key].push(structuredClone(basis.native_controls[key][0]));
            }, true]);
        }
    }
    for (const [label, mutate, rebindControls] of basisMutations) {
        const changedPayload = structuredClone(payload);
        mutate(changedPayload.normal_admission_basis);
        if (rebindControls) {
            const basis = changedPayload.normal_admission_basis, controls = basis.native_controls;
            basis.premise_evidence.native_controls_sha256 = hash(canonicalValue({
                unknownControls: controls.unknown_path_controls, selectionControls: controls.selection_controls }));
            controls.normal_admission_premise_evidence = structuredClone(basis.premise_evidence);
        }
        const changedPayloadSource = canonicalValue(changedPayload);
        const changedTicketSource = canonicalValue({ ...ticket,
            payload_commitment: commitSource(changedPayloadSource),
            normal_admission_basis_commitment: commitSource(canonicalValue(changedPayload.normal_admission_basis)) });
        const changedLoaded = launch({ freezeBytes, expectedFreezeHash: hash(freezeBytes),
            tcbArtifact: { manifestBytes: Buffer.from(tcb.manifest),
                entries: tcb.entries.map(row => ({ path: row.path, bytes: Buffer.from(row.source) })) },
            qualification: { ticketSource: changedTicketSource, payloadSource: changedPayloadSource,
                expectedTicketCommitment: commitSource(changedTicketSource) } });
        assert.throws(() => changedLoaded.initializePathQualification(), /captured_path_normal_admission_basis_relation/,
            `rehashed normal admission basis ${label}`);
        assert.equal(capturedHandles, 0);
    }
    assert.equal(compiler.readPathQualificationCompilerEvidence(result), result);
    assert.equal(result.invocation_id, plan.selected.invocation_id);
    assert.equal(result.candidate_id, plan.selected.candidate_id);
    assert.deepEqual(result.reference, plan.entries[plan.selected.entry_index].reference);
    assert.equal(result.witness_preselection.entries_sha256, plan.entries_sha256);
    assert.equal(result.witness_preselection.domain_sha256, plan.domain_sha256);
    assert.deepEqual(result.witness_preselection.selected, plan.selected);
    assert.equal(result.witness_preselection.disposition, 'blocked');
    assert.equal(result.witness_preselection.admitted_domain_complete, false);
    assert.equal(result.witness_preselection.witness_domain_complete, false);
    // A captured normal compile must not masquerade as permission to run a
    // witness. This finite report is tied to this genuine capture, not caller
    // flags or a promotion of the whole A/W domains after observing M.
    const readiness = result.witness_execution_prerequisites;
    assert.ok(readiness);
    assert.equal(readiness.stage, 'path_v3_witness_execution_prerequisites_not_authority');
    assert.equal(readiness.candidate_id, result.candidate_id);
    assert.equal(readiness.invocation_id, result.invocation_id);
    assert.equal(readiness.reference_preselected, true);
    assert.equal(readiness.selected_candidate_normal_compilation_complete,
        result.worlds.length === 3 && result.worlds.every(world => world.admitted
            && world.whole_ir_conformance && world.whole_phase_program_conformance));
    assert.equal(readiness.execution_permitted, false);
    assert.equal(readiness.qualified, false);
    assert.equal(readiness.semantic_mutation_credit, 0);
    for (const blocker of ['admitted_domain_incomplete', 'first_witness_not_proved',
        'normal_site_admission_controls_incomplete', 'reviewed_tcb_and_execution_ticket_missing'])
        assert.ok(readiness.blockers.includes(blocker));
    assert.equal(readiness.blockers.includes('selected_candidate_normal_compile_rejected'),
        result.worlds.some(world => world.admitted === false));
    assert.ok(Object.isFrozen(readiness));
    assert.ok(Object.isFrozen(readiness.blockers));
    assert.equal(compiler.readPathQualificationCompilerEvidence(structuredClone(result)), null);
    for (const world of result.worlds.filter(world => world.admitted)) {
        assert.equal(world.whole_phase_program_conformance, true);
        assert.equal(world.program_count, input.ir.graphs.length);
        const programs = compiler.readPathQualificationProgramsEvidence({ result, variant: world.variant });
        assert.equal(programs.length, input.ir.graphs.length);
        assert.ok(programs.every(row => typeof row.candidate.source === 'string' && row.candidate.source.length > 0));
        assert.equal(world.effect_closure_complete, false);
    }
    assert.equal(result.worlds[0].admitted, true);
    assert.equal(result.worlds[2].admitted, true);
    for (const field of ['qualified', 'dp_execution', 'validation_tcb_complete', 'executable_consumer_absence_proved'])
        assert.equal(result[field], false);
    assert.equal(result.semantic_mutation_credit, 0);
    assert.equal(result.handle_attempts, 0);
    assert.throws(() => compiler.compilePathQualificationWitnessPreselection({ capture, plan, phaseProfile }));
});

test('N02G:PATH-V3-062 witness preselection seals independent references over authored L before compile without promoting unknown admission', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const semantic = require('../../../src/next/provenance/pathSemanticReference');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const preparation = api.preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
        && row.target.predicate_id === 'link_2_refund_sign');
    const row = preparation.rows[rowIndex];
    const plan = api.preparePathQualificationWitnessPreselection({ preparation, rowIndex });
    assert.equal(plan.entries.length, row.sites.reduce((n, site) => n + site.domain.locators.length, 0));
    assert.equal(plan.locator_domain_complete, true);
    assert.equal(plan.admitted_domain_complete, false);
    assert.equal(plan.witness_domain_complete, false);
    assert.equal(plan.normal_admission_verified, false);
    assert.equal(plan.disposition, 'blocked');
    assert.equal(plan.status, 'preselected_discriminating_reference_not_qualified');
    const first = plan.entries.findIndex(entry => entry.admission === 'unclassified'
        && entry.reference?.discriminating === true);
    assert.ok(first >= 0);
    assert.equal(plan.selected.entry_index, first);
    assert.ok(plan.entries.every(entry => entry.admission !== 'admitted'));
    assert.equal(plan.expected_violations.length, 1);
    const candidate = api.takePathQualificationWitnessPreselection({ plan });
    assert.equal(candidate.candidate_id, plan.selected.candidate_id);
    assert.equal(candidate.invocation_id, plan.selected.invocation_id);
    assert.throws(() => semantic.sealPathQualificationReference({ candidate }));
    const result = compiler.compilePathQualificationCandidate({ capture: compiler.capturePathQualificationCompiler(), candidate });
    assert.equal(semantic.readPathSemanticReference(result.reference), result.reference);
    assert.deepEqual(result.reference, plan.entries[first].reference);
    assert.deepEqual(result.worlds.map(world => world.variant), ['C', 'M', 'S']);
    assert.equal(result.worlds[0].admitted, true);
    assert.equal(result.worlds[2].admitted, true);
    assert.equal(result.qualified, false);
    assert.equal(result.semantic_mutation_credit, 0);
    assert.throws(() => api.takePathQualificationWitnessPreselection({ plan }));
    assert.throws(() => api.preparePathQualificationWitnessPreselection({ preparation, rowIndex }));
});

test('N02G:PATH-V3-063 empty or forged witness preselection cannot supply execution authority or fallback candidates', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const preparation = api.preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.sites.every(site => site.domain_complete && site.domain.locators.length === 0));
    assert.ok(rowIndex >= 0);
    assert.throws(() => api.preparePathQualificationWitnessPreselection({ preparation: structuredClone(preparation), rowIndex }));
    assert.throws(() => api.preparePathQualificationWitnessPreselection({ preparation, rowIndex, expected: false }));
    let effects = 0;
    const active = { preparation };
    Object.defineProperty(active, 'rowIndex', { enumerable: true, get() { effects++; return rowIndex; } });
    assert.throws(() => api.preparePathQualificationWitnessPreselection(active));
    const proxy = new Proxy(preparation, { get() { effects++; throw new Error('active'); } });
    assert.throws(() => api.preparePathQualificationWitnessPreselection({ preparation: proxy, rowIndex }));
    const plan = api.preparePathQualificationWitnessPreselection({ preparation, rowIndex });
    assert.deepEqual(plan.entries, []);
    assert.equal(plan.selected, null);
    assert.equal(plan.expected_violations, null);
    assert.equal(plan.disposition, 'blocked');
    assert.equal(plan.witness_domain_complete, false);
    for (const field of ['qualified', 'dp_execution', 'effect_closure_complete', 'validation_tcb_complete', 'global_g11'])
        assert.equal(plan[field], false);
    assert.equal(plan.semantic_mutation_credit, 0);
    assert.throws(() => api.takePathQualificationWitnessPreselection({ plan }));
    assert.throws(() => api.takePathQualificationWitnessPreselection({ plan: structuredClone(plan) }));
    assert.throws(() => api.takePathQualificationWitnessPreselection({ plan, selected: 0 }));
    const activePlan = new Proxy(plan, { get() { effects++; throw new Error('active'); } });
    assert.throws(() => api.takePathQualificationWitnessPreselection({ plan: activePlan }));
    assert.equal(effects, 0);
    assert.throws(() => api.preparePathQualificationWitnessPreselection({ preparation, rowIndex }));
});

test('N02G:PATH-V3-058 composition retains indirect effect sites even without recognized capability calls', async () => {
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const cases = [
        ['property_read', 'const result=value.hidden;return result;'],
        ['mutation', 'value.hidden=1;return true;'],
        ['mutation', 'delete value.hidden;return true;'],
        ['coercion', 'return value+1;'],
        ['iteration', 'for(const item of value){return item;}return null;'],
        ['accessor_definition', 'return {get hidden(){return value;}};'],
        ['spread', 'return {...value};']
    ];
    for (const [kind, body] of cases) {
        const built = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source:
            `function run(value){${body}}module.exports={run};` }], entry: 'program.js', exportName: 'run' });
        const inspected = inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' });
        const module = inspected.inventories[0].modules.find(row => row.path === 'program.js');
        assert.ok(Array.isArray(module.effect_sites), 'effect inventory is distinct from call inventory');
        assert.ok(module.effect_sites.some(row => row.kind === kind && row.enclosing_function !== null), kind);
        assert.equal(inspected.effect_site_inventory_complete, true);
        assert.equal(inspected.executable_consumer_absence_proved, false);
        assert.equal(inspected.qualified, false);
    }
});

test('N02G:PATH-V3-059 effect inventory is whole syntax not observed branches and changes with real helper bytes', async () => {
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const analyze = body => {
        const built = buildCommonJsGuestBundle({ sources: [
            { path: 'program.js', source: 'const helper=require("./helper");function run(value){return helper.read(value);}module.exports={run};' },
            { path: 'helper.js', source: `function read(value){${body}}module.exports={read};` }
        ], entry: 'program.js', exportName: 'run' });
        return inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' });
    };
    const before = analyze('return value.hidden;');
    const after = analyze('if(false){value.hidden=1;}return value.hidden;');
    const helper = after.inventories[0].modules.find(row => row.path === 'helper.js');
    assert.ok(Array.isArray(helper.effect_sites));
    assert.ok(helper.effect_sites.some(row => row.kind === 'mutation'));
    assert.notEqual(before.analysis_sha256, after.analysis_sha256);
    assert.equal(after.value_flow_proof_complete, false);
    assert.equal(after.semantic_mutation_credit, 0);
});

test('N02G:PATH-V3-060 finite composition preserves indirect obligations and cannot promote conditional links or caller clones', async () => {
    const origins = await import('../../../scripts/agent/pathReceiverOriginContract.mjs');
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const built = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source:
        'function helper(value){if(false){value.hidden=1;}return value.hidden;}function run(value){return helper(value);}module.exports={run};' }],
        entry: 'program.js', exportName: 'run' });
    const bundle = inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' }).inventories[0];
    const projected = origins.projectPathReceiverOrigins(bundle, 'metric_operands', { fact_key: 'synthetic', operands: [] },
        { surfaces: [] }, { surfaces: [], normal_factory_reference_sha256: 'synthetic-not-authority', source: { sha256: 'synthetic' } });
    const composition = origins.composePathReceiverEffects(projected);
    assert.equal(composition.status, 'blocked_missing_effect_discharge');
    assert.equal(composition.obligations.length, bundle.modules.reduce((n, module) => n + module.effect_sites.length, 0));
    assert.ok(composition.obligations.some(row => row.kind === 'mutation'));
    assert.ok(composition.obligations.some(row => row.kind === 'property_read'));
    assert.ok(composition.obligations.every(row => row.discharged === false));
    assert.ok(composition.dependencies.some(row => row.target_origin.kind === 'callable'));
    for (const field of ['effect_closure_complete', 'guest_call_provenance_complete', 'executable_consumer_absence_proved', 'qualified'])
        assert.equal(composition[field], false);
    assert.equal(composition.semantic_mutation_credit, 0);
    assert.throws(() => origins.composePathReceiverEffects(structuredClone(projected)));
    let effects = 0;
    const active = new Proxy(projected, { get() { effects++; throw new Error('active'); } });
    assert.throws(() => origins.composePathReceiverEffects(active));
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-061 genuine pre M family binds whole effect compositions but missing premises remain blocked', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation);
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship:
        api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile: await phaseFixture() }) });
    for (const variant of ['C', 'M', 'S']) {
        const rows = contract.readPathCandidateEffectComposition({ expectation, variant });
        const origins = contract.readPathCandidateReceiverOrigins({ expectation, variant });
        assert.equal(rows.length, origins.length);
        assert.ok(rows.every(row => row.phases.length === 2 && row.functional));
        for (const row of rows) for (const composition of [...row.phases, row.functional]) {
            assert.ok(composition.obligations.length > 0);
            assert.equal(composition.status, 'blocked_missing_effect_discharge');
            assert.equal(composition.effect_closure_complete, false);
            assert.equal(composition.qualified, false);
        }
    }
    assert.throws(() => contract.readPathCandidateEffectComposition({ expectation: structuredClone(expectation), variant: 'C' }));
    let effects = 0;
    const active = { expectation };
    Object.defineProperty(active, 'variant', { enumerable: true, get() { effects++; return 'C'; } });
    assert.throws(() => contract.readPathCandidateEffectComposition(active));
    assert.equal(effects, 0);
    assert.equal(expectation.effect_closure_complete, false);
    assert.equal(expectation.semantic_mutation_credit, 0);
});

let fixturePromise;
function historicalSource() {
    return require('node:fs').readFileSync(require('node:path').resolve(__dirname,
        '../../../docs/audit-evidence/n02g-causal-authoring-profile/path-v3-history-20261008/historical-v2-report.json'), 'utf8');
}
function fixture() {
    return fixturePromise ||= (async () => {
        const { loadLocalAuthoringPackage } = await import('../../../scripts/agent/executeNextDomainInvariantMatrix.mjs');
        const { buildAdmittedSchemaValidators } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
        const { compileAuthoringIR } = require('../../../src/next/provenance/graphCompiler');
        const packageReceipt = loadLocalAuthoringPackage();
        return { packageReceipt, ir: compileAuthoringIR(packageReceipt,
            buildAdmittedSchemaValidators(packageReceipt).validators) };
    })();
}

let selectionControlPromise;
let phaseFixturePromise;
function phaseFixture() {
    return phaseFixturePromise ||= (async () => {
        const input = await fixture();
        const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
        const { admitPhaseCompositionProfile, PROFILE_PATH } = require('../../../src/next/provenance/phaseCompositionProfile');
        const registry = admittedDocuments(input.packageReceipt).find(row => row.value?.registry_id === 'metric_evaluator_registry').value;
        return admitPhaseCompositionProfile({ source: require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../../..', PROFILE_PATH), 'utf8'), registry });
    })();
}
function admittedCandidate(api, preparation) {
    const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
        && row.target.predicate_id === 'link_2_refund_sign');
    const siteIndex = preparation.rows[rowIndex].sites.findIndex(site => site.authored_site.site_path[1] === 0);
    const domain = preparation.rows[rowIndex].sites[siteIndex].domain;
    const locatorIndex = domain.locators.findIndex(locator => locator.node !== domain.original.node
        && JSON.stringify(locator.segments) === JSON.stringify(domain.original.segments));
    assert.ok(locatorIndex >= 0);
    return api.materializePathQualificationLocator({ preparation, rowIndex, siteIndex, locatorIndex });
}
test('N02G:PATH-V3-032 whole admitted C M S normal programs match prelowering authorial seals with hash-bound common reuse', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation), phaseProfile = await phaseFixture();
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile });
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship });
    assert.equal(expectation.sealed_before_captured_compile, true);
    assert.equal(expectation.programs_per_positive_world, input.ir.graphs.length);
    assert.equal(expectation.shared_programs, input.ir.graphs.length - 1);
    const foreign = admittedCandidate(api, preparation);
    assert.throws(() => compiler.compilePathQualificationProgramCandidate({
        capture: compiler.capturePathQualificationCompiler(), candidate: foreign, expectation }));
    assert.throws(() => compiler.compilePathQualificationProgramCandidate({
        capture: compiler.capturePathQualificationCompiler(), candidate, expectation: structuredClone(expectation) }));
    assert.throws(() => compiler.compilePathQualificationProgramCandidate({ candidate, expectation,
        capture: null, expected: input.ir }));
    require('../../../src/next/provenance/pathSemanticReference').sealPathQualificationReference({ candidate });
    const result = compiler.compilePathQualificationProgramCandidate({ capture: compiler.capturePathQualificationCompiler(), candidate, expectation });
    assert.equal(result.program_expectation, expectation);
    assert.equal(result.normal_admission_checker_source_conformance, true);
    assert.equal(result.normal_admission_rule_discharge_complete, false);
    assert.deepEqual(result.worlds.map(row => row.admitted), [true, true, true]);
    assert.deepEqual(result.worlds.map(row => row.whole_phase_program_conformance), [true, true, true]);
    assert.deepEqual(result.worlds.map(row => row.program_count), [input.ir.graphs.length, input.ir.graphs.length, input.ir.graphs.length]);
    assert.equal(result.worlds[0].programs_sha256, result.worlds[2].programs_sha256);
    assert.notEqual(result.worlds[0].programs_sha256, result.worlds[1].programs_sha256);
    for (const variant of ['C', 'M', 'S']) {
        const actual = compiler.readPathQualificationProgramsEvidence({ result, variant });
        const reference = contract.readPathCandidateProgramReference({ expectation, variant });
        assert.notEqual(actual, reference);
        assert.ok(Object.isFrozen(actual) && Object.isFrozen(actual[0].candidate));
        assert.deepEqual(actual, reference);
        assert.equal(contract.verifyPathCandidatePrograms({ expectation, variant, programs: actual }).programs_sha256,
            result.worlds.find(row => row.variant === variant).programs_sha256);
    }
    assert.throws(() => compiler.readPathQualificationProgramsEvidence({ result: structuredClone(result), variant: 'C' }));
    assert.equal(result.handle_attempts, 0); assert.equal(result.dp_execution, false);
    assert.equal(result.validation_tcb_complete, false); assert.equal(result.semantic_mutation_credit, 0);
    assert.throws(() => api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile }));
});
test('N02G:PATH-V3-033 whole program family rejects missing reordered duplicated graphs cached C and active or cloned authority', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation), phaseProfile = await phaseFixture();
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile });
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship });
    const programs = contract.readPathCandidateProgramReference({ expectation, variant: 'C' });
    assert.equal(contract.verifyPathCandidatePrograms({ expectation, variant: 'C', programs }).whole_phase_program_conformance, true);
    assert.throws(() => contract.verifyPathCandidatePrograms({ expectation, variant: 'M', programs }));
    for (const mutate of [rows => rows.pop(), rows => rows.reverse(), rows => rows[1] = rows[0],
        rows => rows[0].fact_key = 'redirected', rows => rows[0].candidate.source += '\n',
        rows => rows[0].candidate.sourceHashes[0].sha256 = 'sha256:' + '0'.repeat(64)]) {
        const rows = structuredClone(programs); mutate(rows);
        assert.throws(() => contract.verifyPathCandidatePrograms({ expectation, variant: 'C', programs: rows }));
    }
    assert.throws(() => api.preparePathCandidateProgramAuthorship({ candidate: structuredClone(candidate), phaseProfile }));
    assert.throws(() => api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile, expected: input.ir }));
    assert.throws(() => contract.sealPathCandidateProgramExpectation({ authorship: structuredClone(authorship) }));
    assert.throws(() => contract.readPathCandidateProgramReference({ expectation: structuredClone(expectation), variant: 'C' }));
    let effects = 0;
    const active = { expectation, variant: 'C' };
    Object.defineProperty(active, 'programs', { enumerable: true, get() { effects++; return programs; } });
    assert.throws(() => contract.verifyPathCandidatePrograms(active));
    assert.throws(() => contract.verifyPathCandidatePrograms({ expectation, variant: 'C', programs: new Proxy(programs, { ownKeys() { effects++; return []; } }) }));
    const rows = [...programs], row = { fact_key: rows[0].fact_key };
    Object.defineProperty(row, 'candidate', { enumerable: true, get() { effects++; return rows[0].candidate; } }); rows[0] = row;
    assert.throws(() => contract.verifyPathCandidatePrograms({ expectation, variant: 'C', programs: rows }));
    assert.equal(effects, 0);
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const capture = compiler.capturePathQualificationCompiler();
    require('../../../src/next/provenance/pathSemanticReference').sealPathQualificationReference({ candidate });
    const fs = require('node:fs'), read = fs.readFileSync;
    let helperReads = 0, failure;
    fs.readFileSync = function(file, ...args) {
        const value = read.call(this, file, ...args);
        if (typeof file !== 'string' || !file.replaceAll('\\', '/').endsWith('/src/next/kernel/canonicalJson.js')) return value;
        helperReads++;
        const changed = (typeof value === 'string' ? value : value.toString('utf8')) + '\n// adversarial BUILD byte drift\n';
        return typeof value === 'string' ? changed : Buffer.from(changed);
    };
    try {
        // Reuse is bound to helper bytes, not only the authorial baseline.
        const drifted = contract.sealPathCandidateProgramExpectation({ authorship });
        assert.notEqual(drifted.helper_sources_sha256, expectation.helper_sources_sha256);
        assert.notEqual(drifted.worlds[0].programs_sha256, expectation.worlds[0].programs_sha256);
        try { compiler.compilePathQualificationProgramCandidate({ capture, candidate, expectation }); }
        catch (error) { failure = error; }
    } finally { fs.readFileSync = read; }
    assert.ok(helperReads > 0 && failure);
    const retained = compiler.readPathQualificationCompilerEvidence(failure);
    assert.equal(retained.program_conformance_failed, true);
    assert.equal(retained.variant, 'C');
    assert.equal(retained.program_expectation, expectation);
    assert.equal(retained.contradiction.graph_index, 0);
    assert.equal(retained.contradiction.variant, 'C');
    assert.ok(retained.contradiction.observed.source.includes('// adversarial BUILD byte drift'));
    const sourceHash = 'sha256:' + require('node:crypto').createHash('sha256')
        .update(retained.contradiction.observed.source).digest('hex');
    assert.notEqual(sourceHash, retained.contradiction.expected.expected_source_sha256);
    assert.equal(sourceHash, retained.actual_programs[0].source_sha256);
    assert.equal(retained.actual_programs.length, input.ir.graphs.length);
    assert.ok(retained.actual_programs.every(row => /^sha256:[a-f0-9]{64}$/.test(row.source_sha256)));
    assert.equal(retained.handle_attempts, 0); assert.equal(retained.qualified, false);
    assert.equal(retained.semantic_mutation_credit, 0);
    assert.throws(() => compiler.compilePathQualificationProgramCandidate({ capture, candidate, expectation }),
        /capture_authority_or_poisoned/);
});

test('N02G:PATH-V3-034 complete common functional D assets and every authored evaluator binding seal before C M S compilation', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation), phaseProfile = await phaseFixture();
    const authorship = api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile });
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship });
    const reference = contract.readPathCandidateMetricReference({ expectation });
    const registry = require('../../../src/next/provenance/packageContract').admittedDocuments(input.packageReceipt)
        .find(row => row.value?.registry_id === 'metric_evaluator_registry').value;
    assert.equal(reference.metrics.length, registry.entries.length);
    assert.equal(reference.bindings.length, input.ir.graphs.length);
    assert.equal(expectation.metric_reference_scope, 'shared_normal_functional_BUILD_bytes_not_independent_formula_or_oracle');
    require('../../../src/next/provenance/pathSemanticReference').sealPathQualificationReference({ candidate });
    const result = compiler.compilePathQualificationProgramCandidate({ capture: compiler.capturePathQualificationCompiler(), candidate, expectation });
    const actual = compiler.readPathQualificationMetricEvidence({ result });
    assert.notEqual(actual, reference.metrics);
    assert.deepEqual(actual, reference.metrics);
    assert.equal(contract.verifyPathCandidateMetrics({ expectation, metrics: actual }).functional_metric_conformance, true);
    for (const world of result.worlds) {
        assert.equal(world.metric_count, registry.entries.length);
        assert.equal(world.metric_bindings_count, input.ir.graphs.length);
        assert.equal(world.functional_metric_conformance, true);
        assert.equal(world.metric_bindings_sha256, expectation.metric_bindings_sha256);
    }
    assert.equal(result.handle_attempts, 0); assert.equal(result.dp_execution, false);
    assert.equal(result.independent_compiler_execution, false); assert.equal(result.validation_tcb_complete, false);
    assert.equal(result.semantic_mutation_credit, 0);
    assert.throws(() => compiler.readPathQualificationMetricEvidence({ result: structuredClone(result) }));
});

test('N02G:PATH-V3-035 functional D reference rejects asset binding drift omissions aliases and active or cloned authority', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation);
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship:
        api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile: await phaseFixture() }) });
    const reference = contract.readPathCandidateMetricReference({ expectation });
    for (const mutate of [rows => rows.pop(), rows => rows.reverse(), rows => rows[1] = rows[0],
        rows => rows[0].evaluator_id = 'redirected', rows => rows[0].evaluator_version++,
        rows => rows[0].source += '\n', rows => rows[0].manifest += '\n',
        rows => rows[0].artifact_root = 'sha256:' + '0'.repeat(64),
        rows => rows[0].sourceHashes[0].sha256 = 'sha256:' + '0'.repeat(64)]) {
        const metrics = structuredClone(reference.metrics); mutate(metrics);
        assert.throws(() => contract.verifyPathCandidateMetrics({ expectation, metrics }));
    }
    for (const mutate of [rows => rows.pop(), rows => rows.reverse(), rows => rows[1] = rows[0],
        rows => rows[0].evaluator_ref.evaluator_id = 'redirected',
        rows => rows[0].claim.unit = 'count', rows => rows[0].operands[0].role_ref.role_id = 'redirected',
        rows => rows.find(row => row.derivation_bindings.sets.some(set => set.aliases.length > 1))
            .derivation_bindings.sets.find(set => set.aliases.length > 1).aliases.reverse()]) {
        const bindings = structuredClone(reference.bindings); mutate(bindings);
        assert.throws(() => contract.verifyPathCandidateMetricBindings({ expectation, variant: 'C', bindings }));
    }
    assert.throws(() => contract.readPathCandidateMetricReference({ expectation: structuredClone(expectation) }));
    let effects = 0;
    const active = { expectation };
    Object.defineProperty(active, 'metrics', { enumerable: true, get() { effects++; return reference.metrics; } });
    assert.throws(() => contract.verifyPathCandidateMetrics(active));
    assert.throws(() => contract.verifyPathCandidateMetrics({ expectation, metrics: new Proxy(reference.metrics,
        { ownKeys() { effects++; return []; } }) }));
    assert.throws(() => contract.verifyPathCandidateMetricBindings({ expectation, variant: 'C', bindings:
        new Proxy(reference.bindings, { ownKeys() { effects++; return []; } }) }));
    const activeMetrics = structuredClone(reference.metrics);
    Object.defineProperty(activeMetrics[0], 'source', { enumerable: true, get() { effects++; return ''; } });
    assert.throws(() => contract.verifyPathCandidateMetrics({ expectation, metrics: activeMetrics }));
    assert.equal(effects, 0);
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const capture = compiler.capturePathQualificationCompiler();
    require('../../../src/next/provenance/pathSemanticReference').sealPathQualificationReference({ candidate });
    const fs = require('node:fs'), read = fs.readFileSync;
    let changedReads = 0, failure;
    fs.readFileSync = function(file, ...args) {
        const value = read.call(this, file, ...args);
        if (typeof file !== 'string' || !file.replaceAll('\\', '/').endsWith('/src/next/provenance/metricDirectReads.js')) return value;
        const changed = (typeof value === 'string' ? value : value.toString('utf8')) + '\n// adversarial functional BUILD drift\n';
        changedReads++;
        return typeof value === 'string' ? changed : Buffer.from(changed);
    };
    try { compiler.compilePathQualificationProgramCandidate({ capture, candidate, expectation }); }
    catch (error) { failure = error; }
    finally { fs.readFileSync = read; }
    assert.ok(changedReads > 0 && failure);
    const retained = compiler.readPathQualificationCompilerEvidence(failure);
    assert.equal(retained.metric_conformance_failed, true);
    assert.equal(retained.stage, 'before_first_normal_compile');
    assert.ok(retained.contradiction.observed.source.includes('// adversarial functional BUILD drift'));
    assert.notEqual(retained.contradiction.expected_sha256, retained.contradiction.observed_sha256);
    assert.equal(retained.handle_attempts, 0); assert.equal(retained.semantic_mutation_credit, 0);
    assert.throws(() => compiler.compilePathQualificationProgramCandidate({ capture, candidate, expectation }),
        /capture_authority_or_poisoned/);
});

test('N02G:PATH-V3-036 every actual phase and functional bundle links complete modules imports and lexical consumers without claiming absence', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation);
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship:
        api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile: await phaseFixture() }) });
    const closure = contract.readPathCandidateClosureReference({ expectation, variant: 'C' });
    assert.equal(closure.programs.length, input.ir.graphs.length);
    assert.equal(closure.metrics.length, expectation.metric_count);
    for (const item of [...closure.programs, ...closure.metrics]) {
        assert.equal(item.analysis.import_resolution_complete, true);
        assert.equal(item.analysis.module_sources_complete, true);
        assert.equal(item.analysis.lexical_reference_resolution_complete, true);
        assert.equal(item.analysis.value_flow_proof_complete, false);
        assert.equal(item.analysis.executable_consumer_absence_proved, false);
        assert.ok(item.analysis.call_site_count > 0);
        assert.ok(item.analysis.closed_import_edges > 0);
    }
    require('../../../src/next/provenance/pathSemanticReference').sealPathQualificationReference({ candidate });
    const result = compiler.compilePathQualificationProgramCandidate({ capture: compiler.capturePathQualificationCompiler(), candidate, expectation });
    assert.deepEqual(result.worlds.map(row => row.module_closure_conformance), [true, true, true]);
    assert.equal(result.executable_consumer_absence_proved, false);
    assert.equal(result.qualified, false); assert.equal(result.handle_attempts, 0);
    assert.throws(() => contract.readPathCandidateClosureReference({ expectation: structuredClone(expectation), variant: 'C' }));
});

test('N02G:PATH-V3-037 external module closure rejects loader drift dynamic edges free captures and active inputs even with self consistent hashes', async () => {
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const source = "'use strict'; module.exports={run:operands=>operands.get('id')};";
    const built = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source }], entry: 'program.js', exportName: 'run' });
    const checked = inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' });
    assert.equal(checked.closed_factory_sources, 1);
    assert.equal(checked.executable_consumer_absence_proved, false);
    for (const change of [text => text.replace('const cache = new Map();', 'const cache = new Map(); let escape;'),
        text => text.replace('return load(0)', 'return load(1)'),
        text => text.replace('return load(edge[1]);', 'return load(0);'),
        text => text + ';globalThis.consume(1);']) {
        const changed = change(built.source); assert.notEqual(changed, built.source);
        assert.throws(() => inspectPathExecutableClosure({ source: changed, sourceHashes: built.sourceHashes, kind: 'metric' }));
    }
    for (const entrySource of ["module.exports={run:operands=>hiddenConsumer(operands)};",
        "module.exports={run:operands=>globalThis.consume(operands)};",
        "module.exports={run:(operands=hiddenConsumer())=>operands.get('id')};"] ) {
        const changed = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source: entrySource }], entry: 'program.js', exportName: 'run' });
        assert.throws(() => inspectPathExecutableClosure({ source: changed.source, sourceHashes: changed.sourceHashes, kind: 'metric' }));
    }
    const missingExport = buildCommonJsGuestBundle({ sources: [
        { path: 'program.js', source: "const {missing}=require('./helper');module.exports={run:operands=>missing(operands)};" },
        { path: 'helper.js', source: 'module.exports={present:value=>value};' }], entry: 'program.js', exportName: 'run' });
    assert.throws(() => inspectPathExecutableClosure({ source: missingExport.source,
        sourceHashes: missingExport.sourceHashes, kind: 'metric' }));
    const wrongCatalog = structuredClone(built.sourceHashes); wrongCatalog[0].sha256 = 'sha256:' + '0'.repeat(64);
    assert.throws(() => inspectPathExecutableClosure({ source: built.source, sourceHashes: wrongCatalog, kind: 'metric' }));
    assert.throws(() => inspectPathExecutableClosure({ source: built.source, sourceHashes: [...built.sourceHashes, ...built.sourceHashes], kind: 'metric' }));
    const wrapped = `(function(operands){'use strict'; const evaluate=${built.source};
        globalThis.consume(operands);return {unit:'count',kind:'nonnegative_integer',value:evaluate(operands)};})`;
    assert.throws(() => inspectPathExecutableClosure({ source: wrapped, sourceHashes: built.sourceHashes, kind: 'metric' }));
    let effects = 0;
    const active = { sourceHashes: built.sourceHashes, kind: 'metric' };
    Object.defineProperty(active, 'source', { enumerable: true, get() { effects++; return built.source; } });
    assert.throws(() => inspectPathExecutableClosure(active));
    assert.throws(() => inspectPathExecutableClosure({ source: built.source, kind: 'metric', sourceHashes:
        new Proxy(built.sourceHashes, { ownKeys() { effects++; return []; } }) }));
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-044 finite function boundaries bind formal arguments returns and callback forwarding across real closed modules', async () => {
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const helper = 'function forward(value){const alias=value;return alias;}module.exports={forward};';
    const source = 'const {forward:f}=require("./helper");const read=x=>x.get("id");function run(x){return f(read)(x);}module.exports={run};';
    const built = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source }, { path: 'helper.js', source: helper }],
        entry: 'program.js', exportName: 'run' });
    const analysis = inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' });
    assert.equal(analysis.function_boundary_inventory_complete, true);
    assert.equal(analysis.inventories[0].entry_argument_bindings[0].source.kind, 'ordinary_bundle_operands_forwarding');
    const program = analysis.inventories[0].modules.find(row => row.path === 'program.js');
    const helperRow = analysis.inventories[0].modules.find(row => row.path === 'helper.js');
    assert.ok(helperRow.function_boundaries.some(row => row.parameters.length === 1 && row.returns.length === 1
        && row.transparent_return_grammar === true));
    const returned = program.call_bindings.find(row => row.callee.kind === 'call_result');
    assert.equal(returned.target?.kind, 'local_function');
    assert.equal(returned.target?.module, 'program.js');
    assert.ok(program.call_bindings.some(row => row.target === null && row.reason === 'parameter_dispatch'));
    assert.equal(analysis.guest_call_provenance_complete, false);
    assert.equal(analysis.value_flow_proof_complete, false);
    assert.equal(analysis.executable_consumer_absence_proved, false);
    assert.equal(analysis.semantic_mutation_credit, 0);
    for (let depth = 1; depth <= 5; depth++) {
        const aliases = Array.from({ length: depth }, (_, n) => `const a${n}=${n ? 'a' + (n - 1) : 'f'};`).join('');
        const changed = source.replace('const read=', aliases + 'const read=').replace('return f(read)(x)', `return a${depth - 1}(read)(x)`);
        const bundle = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source: changed }, { path: 'helper.js', source: helper }],
            entry: 'program.js', exportName: 'run' });
        const result = inspectPathExecutableClosure({ source: bundle.source, sourceHashes: bundle.sourceHashes, kind: 'metric' });
        assert.equal(result.inventories[0].modules.find(row => row.path === 'program.js').call_bindings
            .find(row => row.callee.kind === 'call_result').target?.module, 'program.js');
    }
});

test('N02G:PATH-V3-045 return linkage blocks effects branches writes recursion and fake same-name capabilities', async () => {
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const analyze = helper => {
        const source = 'const {forward}=require("./helper");const read=x=>x.get("id");module.exports={run:x=>forward(read)(x)};';
        const built = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source }, { path: 'helper.js', source: helper }],
            entry: 'program.js', exportName: 'run' });
        return inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' });
    };
    for (const body of ['value=()=>0;return value;', 'if(value)return value;return ()=>0;',
        'value.get=()=>0;return value;', 'return forward(value);', 'return value();',
        'const alias=value;alias.get=()=>0;return value;', 'Object.freeze(value);return value;']) {
        const analysis = analyze('function forward(value){' + body + '}module.exports={forward};');
        const call = analysis.inventories[0].modules.find(row => row.path === 'program.js').call_bindings
            .find(row => row.callee.kind === 'call_result');
        assert.equal(call.target, null, body);
        assert.equal(analysis.qualified, false);
    }
    const defaults = analyze('const forward=(value=()=>0)=>value;module.exports={forward};');
    assert.equal(defaults.inventories[0].modules.find(row => row.path === 'program.js').call_bindings
        .find(row => row.callee.kind === 'call_result').target, null);
    const fake = analyze('function forward(value){return {get:()=>0};}module.exports={forward};');
    assert.equal(fake.guest_call_provenance_complete, false);
    assert.equal(fake.necessary_equivalence_proved, false);
    const hazardous = buildCommonJsGuestBundle({ sources: [{ path: 'program.js',
        source: 'const value=()=>0;const effect=()=>value;function ignore(x){return value;}module.exports={run:x=>ignore(effect())(x)};' }],
        entry: 'program.js', exportName: 'run' });
    const blocked = inspectPathExecutableClosure({ source: hazardous.source, sourceHashes: hazardous.sourceHashes, kind: 'metric' });
    assert.ok(blocked.inventories[0].modules[0].call_bindings.some(row => row.callee.kind === 'call_result'
        && row.target === null && row.reason === 'unsupported_return_invocation'));
    for (const body of ['return {same:value,same:()=>0}.same;', 'return {get same(){return value;}}.same;']) {
        const malformed = analyze('function forward(value){' + body + '}module.exports={forward};');
        assert.equal(malformed.inventories[0].modules.find(row => row.path === 'program.js').call_bindings
            .find(row => row.callee.kind === 'call_result').target, null);
    }
});

async function conditionalNodeFixture() {
    const { normal, child, contract, expectation } = await claimShapeFixture();
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const { projectPathReceiverOrigins } = await import('../../../scripts/agent/pathReceiverOriginContract.mjs');
    const aliasesFor = seed => Object.keys(seed.nodes).filter(alias => seed.nodes[alias].binding === 'snapshot'
        && seed.material_descriptors[alias]?.fields.id?.type === 'id');
    const seed = child.seeds.find(row => aliasesFor(row).length >= 2), aliases = aliasesFor(seed).slice(0, 2);
    return { seed, aliases, contract, expectation, inspect(source) {
        const built = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source }], entry: 'program.js', exportName: 'run' });
        const syntax = inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' });
        return projectPathReceiverOrigins(syntax.inventories[0], 'child_proof_operands', seed, normal.data, child.data);
    } };
}

async function materialReferenceFixture() {
    const { normal, child, contract, expectation } = await claimShapeFixture();
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const { projectPathReceiverOrigins } = await import('../../../scripts/agent/pathReceiverOriginContract.mjs');
    const eligible = seed => seed.edges.find(edge => edge.relation === 'material_ref'
        && seed.nodes[edge.source]?.binding === 'snapshot' && seed.nodes[edge.target]?.binding === 'snapshot'
        && seed.material_descriptors[edge.source]?.fields[edge.field]?.type === 'ref'
        && seed.material_descriptors[edge.target]?.fields.id?.type === 'id'
        && seed.edges.filter(other => other.relation === 'material_ref'
            && other.source === edge.source && other.field === edge.field).length === 1);
    const seed = child.seeds.find(seed => eligible(seed)), edge = eligible(seed);
    assert.ok(edge, 'genuine admitted single material-ref fixture');
    return { seed, edge, contract, expectation, inspect(source) {
        const built = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source }], entry: 'program.js', exportName: 'run' });
        const syntax = inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' });
        return projectPathReceiverOrigins(syntax.inventories[0], 'child_proof_operands', seed, normal.data, child.data);
    } };
}

test('N02G:PATH-V3-056 material reference returns retain genuine source edge target and native preconditions without proving runtime ownership', async () => {
    const { seed, edge, inspect } = await materialReferenceFixture(), q = JSON.stringify;
    const projection = inspect(`function run(ops){const source=ops.node(${q(edge.source)});
        ops.resolveReference(${q(edge.source)},${q(edge.field)},${q(seed.nodes[edge.target].ref_id)}).get("id");
        return ops.memberEdge(source,${q(edge.field)}).get("id");}module.exports={run};`);
    for (const name of ['resolveReference', 'memberEdge']) {
        const call = projection.calls.find(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === name);
        assert.equal(call.return_origin.kind, 'capability', name);
        assert.equal(call.return_origin.binding.alias, edge.target);
        assert.equal(call.return_origin.binding.reference_link.edge_id, edge.id);
        assert.equal(call.return_origin.binding.reference_link.source_alias, edge.source);
        assert.equal(call.return_origin.binding.reference_link.field, edge.field);
        assert.equal(call.return_origin.binding.return_conditions.runtime_proved, false);
        assert.ok(call.return_origin.binding.return_conditions.obligations.includes('normal_unique_reference_match_and_string_value'));
    }
    assert.ok(projection.calls.filter(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'get')
        .every(row => row.return_origin.kind === 'scalar'));
    assert.equal(projection.operational_receiver_authority, false);
    assert.equal(projection.effect_closure_complete, false);
    assert.equal(projection.necessary_equivalence_proved, false);
    assert.equal(projection.semantic_mutation_credit, 0);
});

test('N02G:PATH-V3-057 material reference linkage rejects fake ownership nonroot handles invalid references and undeclared edges', async () => {
    const { edge, inspect } = await materialReferenceFixture(), q = JSON.stringify;
    const source = `ops.node(${q(edge.source)})`, field = q(edge.field);
    const linked = inspect(`function run(ops){return ops.resolveReference(${q(edge.source)},${field},${source}.get(${field}));}module.exports={run};`);
    const call = linked.calls.find(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'resolveReference');
    assert.equal(call.return_origin.kind, 'capability', 'known normal scalar reference is conditional, not erased');
    assert.equal(call.return_origin.binding.return_conditions.runtime_proved, false);
    for (const expression of [
        `ops.memberEdge({identity:()=>"fake",get:()=>"fake"},${field})`,
        `ops.memberEdge(${source}.keys(),${field})`,
        `ops.memberEdge(ops.claim(),${field})`,
        `ops.memberEdge(${source},"not_admitted")`,
        `ops.resolveReference(${q(edge.source)},${field},0)`,
        `ops.resolveReference(${q(edge.source)},${field},"not_an_admitted_reference")`,
        `ops.resolveReference("fake",${field},"fake")`,
        `ops.resolveReference(${q(edge.source)},"not_admitted","fake")`
    ]) {
        const rejected = inspect(`function run(ops){return ${expression};}module.exports={run};`);
        const reference = rejected.calls.find(row => row.target_origin.kind === 'capability_method'
            && ['memberEdge', 'resolveReference'].includes(row.target_origin.name));
        assert.equal(reference.return_origin.kind, 'unknown', expression);
        assert.equal(rejected.executable_consumer_absence_proved, false);
        assert.equal(rejected.qualified, false);
    }
});

test('N02G:PATH-V3-054 shared helpers retain every known conditional node origin and only common admitted fields', async () => {
    const { aliases, inspect, contract, expectation } = await conditionalNodeFixture();
    const calls = aliases.map(alias => `read(ops.node(${JSON.stringify(alias)}));`).join('');
    const projection = inspect(`function read(node){return node.get("id");}function run(ops){${calls}return true;}module.exports={run};`);
    const joined = projection.parameter_origins.find(row => row.origin.binding?.kind === 'conditional_incoming_node_origins');
    assert.ok(joined, 'legitimate distinct nodes must retain alternatives instead of erasing origin');
    assert.deepEqual(joined.origin.binding.alternatives.map(binding => binding.alias).sort(), [...aliases].sort());
    const get = projection.calls.find(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'get');
    assert.equal(get.return_origin.kind, 'scalar');
    assert.equal(get.return_origin.origin.alternatives.length, 2);
    assert.equal(joined.origin.binding.return_conditions.runtime_proved, false);
    assert.equal(Object.hasOwn(joined.origin.binding, 'alias'), false);
    assert.equal(Object.hasOwn(joined.origin.binding, 'identity'), false);
    assert.equal(projection.necessary_equivalence_proved, false);
    assert.equal(projection.effect_closure_complete, false);
    assert.equal(projection.operational_receiver_authority, false);
    const reverse = inspect(`function read(node){return node.get("id");}function run(ops){${aliases.slice().reverse()
        .map(alias => `read(ops.node(${JSON.stringify(alias)}));`).join('')}return true;}module.exports={run};`);
    assert.deepEqual(reverse.parameter_origins.find(row => row.origin.binding?.kind === 'conditional_incoming_node_origins')
        .origin.binding.alternatives, joined.origin.binding.alternatives);
    let wholeFamilyUnions = 0;
    for (const variant of ['C', 'M', 'S']) for (const row of contract.readPathCandidateReceiverOrigins({ expectation, variant }))
        for (const projection of [...row.phases, row.functional]) {
            const bindings = [
                ...projection.parameter_origins.map(row => row.origin.binding),
                ...projection.calls.flatMap(call => [call.target_origin.receiver?.binding,
                    call.return_origin.binding, call.return_origin.origin])
            ].filter(binding => binding?.kind === 'conditional_incoming_node_origins');
            for (const binding of bindings) {
                wholeFamilyUnions++;
                for (const alternative of binding.alternatives) {
                    assert.deepEqual(alternative.path, binding.path);
                    assert.equal(alternative.projection, binding.projection);
                    assert.equal(alternative.return_conditions.runtime_proved, false);
                }
                assert.equal(projection.operational_receiver_authority, false);
                assert.equal(projection.semantic_mutation_credit, 0);
            }
        }
    assert.ok(wholeFamilyUnions > 0);
});

test('N02G:PATH-V3-055 conditional node joins reject fake or scalar inputs and do not collapse ownership or unknown shapes', async () => {
    const { aliases, inspect } = await conditionalNodeFixture();
    const calls = aliases.map(alias => `read(ops.node(${JSON.stringify(alias)}));`).join('');
    for (const fake of ['{get:()=>0}', '0', '"node"', '{surface:"node",binding:{alias:"fake"}}']) {
        for (const inputCalls of [calls + `read(${fake});`, `read(${fake});` + calls]) {
            const projection = inspect(`function read(node){return node.get("id");}function run(ops){${inputCalls}return true;}module.exports={run};`);
            assert.ok(projection.parameter_origins.some(row => row.origin.reason === 'conflicting_incoming_origins'));
            assert.ok(!projection.calls.some(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'get'));
        }
    }
    const mixed = inspect(`function read(node){return node.get("id");}function run(ops){${calls}read(ops.claim());return true;}module.exports={run};`);
    assert.ok(mixed.calls.some(row => row.return_origin.reason === 'non_material_or_unknown_field'));
    const traversal = inspect(`function read(node){return node.traverse("not_an_edge");}function run(ops){${calls}return true;}module.exports={run};`);
    assert.ok(traversal.calls.some(row => row.return_origin.reason === 'traversal_requires_single_root'));
    assert.equal(traversal.semantic_mutation_credit, 0);
    assert.equal(traversal.executable_consumer_absence_proved, false);
    const forwarded = inspect(`function next(keys){return keys.at(0);}function read(node){return next(node.keys());}function run(ops){${calls}return true;}module.exports={run};`);
    const at = forwarded.calls.find(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'at');
    assert.equal(at.return_origin.kind, 'scalar');
    assert.equal(at.return_origin.origin.alternatives.length, 2);
    assert.ok(at.return_origin.origin.alternatives.every(binding => binding.projection === 'keys' && binding.path.length === 0));
});

let claimShapeFixturePromise;
function claimShapeFixture() {
    return claimShapeFixturePromise ||= (async () => {
        const api = require('../../../src/next/provenance/pathQualificationV3');
        const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
        const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
        const expectation = contract.sealPathCandidateProgramExpectation({ authorship: api.preparePathCandidateProgramAuthorship({
            candidate: admittedCandidate(api, preparation), phaseProfile: await phaseFixture() }) });
        const normal = contract.readPathCandidateCapabilityReference({ expectation });
        const child = contract.readPathCandidateChildABIReference({ expectation });
        return { input, expectation, contract, normal, child };
    })();
}

test('N02G:PATH-V3-052 claim context shape reuses the admitted normal projection before C M S without copying payload or output', async () => {
    const { input, expectation, contract, normal, child } = await claimShapeFixture();
    const documents = require('../../../src/next/provenance/packageContract').admittedDocuments(input.packageReceipt);
    const schema = documents.find(row => row.path === 'docs/contracts/next/provenance-v2/claim-contract.schema.json');
    const bindings = contract.readPathCandidateMetricReference({ expectation }).bindings;
    const helper = normal.data.sources.find(row => row.path === 'src/next/provenance/claimContext.js');
    assert.ok(helper, 'normal projection bytes must be captured, not inferred by field names');
    for (const seed of child.seeds) {
        const claim = bindings.find(row => row.fact_key === seed.fact_key).claim;
        const projected = require('../../../src/next/provenance/claimContext').projectClaimContext(claim, schema.value);
        assert.deepEqual(seed.claim_context.shape, JSON.parse(JSON.stringify(projected.shape)));
        assert.equal(seed.claim_context.schema_sha256, schema.sha256);
        assert.equal(Object.hasOwn(seed.claim_context, 'value'), false);
        assert.equal(Object.hasOwn(seed.claim_context.shape.fields, 'output'), false);
        assert.equal(Object.hasOwn(seed.claim_context.shape.fields, 'qualification'), false);
    }
    let periodReaders = 0;
    for (const variant of ['C', 'M', 'S']) for (const row of contract.readPathCandidateReceiverOrigins({ expectation, variant }))
        for (const projection of [...row.phases, row.functional]) for (const call of projection.calls)
            if (call.target_origin.kind === 'capability_method' && call.target_origin.name === 'get'
                && call.target_origin.receiver.binding.kind === 'claim_context'
                && call.return_origin.kind === 'capability' && call.return_origin.binding.path.join('/') === 'period') {
                periodReaders++;
                assert.equal(call.return_origin.binding.return_conditions.runtime_proved, false);
                assert.equal(call.return_origin.binding.return_conditions.may_be_absent, true);
            }
    assert.ok(periodReaders > 0);
    assert.equal(expectation.qualified, false);
    assert.equal(expectation.semantic_mutation_credit, 0);
});

test('N02G:PATH-V3-053 claim shape linkage cannot admit output qualification foreign source rehash or fake same name receivers', async () => {
    const { normal, child } = await claimShapeFixture();
    const capability = await import('../../../scripts/agent/pathCapabilityEffectContract.mjs');
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const { projectPathReceiverOrigins } = await import('../../../scripts/agent/pathReceiverOriginContract.mjs');
    const seed = child.seeds.find(row => row.claim_context?.shape.fields.period);
    assert.ok(seed);
    const inspect = source => {
        const built = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source }], entry: 'program.js', exportName: 'run' });
        const syntax = inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' });
        return projectPathReceiverOrigins(syntax.inventories[0], 'child_proof_operands', seed, normal.data, child.data);
    };
    for (const field of ['output', 'qualification', 'expected', 'not_admitted']) {
        const projection = inspect(`function run(ops){return ops.claim().get(${JSON.stringify(field)}).get("value");}module.exports={run};`);
        assert.ok(projection.calls.some(row => row.return_origin.reason === 'non_material_or_unknown_field'));
        assert.equal(projection.effect_closure_complete, false);
        assert.equal(projection.semantic_mutation_credit, 0);
    }
    const fake = inspect('function run(ops){const fake={claim:()=>({get:()=>({get:()=>0})})};return fake.claim().get("period").get("kind");}module.exports={run};');
    assert.ok(!fake.calls.some(row => row.target_origin.kind === 'capability_method'));
    const changed = JSON.parse(JSON.stringify(normal.data.sources));
    const helper = changed.find(row => row.path === 'src/next/provenance/claimContext.js');
    helper.source += '\n// changed';
    helper.sha256 = 'sha256:' + require('node:crypto').createHash('sha256').update(helper.source).digest('hex');
    assert.throws(() => capability.verifyPathNormalCapabilityReference({ reference: normal.reference, sources: changed }));
    assert.throws(() => capability.verifyPathNormalCapabilityReference({ reference: { ...normal.reference }, sources: normal.data.sources }));
});

test('N02G:PATH-V3-050 real common factories bind passive returned methods to exact captured definitions before C M S', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation);
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship:
        api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile: await phaseFixture() }) });
    let exact = 0, conditional = 0;
    for (const variant of ['C', 'M', 'S']) {
        const closure = contract.readPathCandidateClosureReference({ expectation, variant });
        for (const program of closure.programs) for (const bundle of program.analysis.inventories)
            for (const module of bundle.modules) for (const call of module.call_bindings) {
                if (call.callee.kind === 'member' && ['members', 'evaluateScalarProof', 'compareTypedScalars'].includes(call.callee.property)
                    && call.target?.kind === 'local_function' && /(?:collection|scalar)ProofCore\.js$/.test(call.target.module)) exact++;
            }
        for (const row of contract.readPathCandidateReceiverOrigins({ expectation, variant }))
            for (const projection of row.phases) for (const call of projection.calls)
                if (call.target_origin.kind === 'callable' && /(?:collection|scalar)ProofCore\.js$/.test(call.target_origin.module)) {
                    conditional++;
                    assert.equal(call.runtime_dominance_and_effects_proved, false);
                    assert.match(call.target_origin.body_sha256, /^sha256:[a-f0-9]{64}$/);
                }
    }
    assert.ok(exact > 0, 'normal passive factory methods must link to their actual bodies');
    assert.ok(conditional > 0);
    assert.equal(expectation.qualified, false);
    assert.equal(expectation.semantic_mutation_credit, 0);
});

test('N02G:PATH-V3-051 passive factory grammar cannot hide getters prototypes effects branches or mutated intrinsic authority', async () => {
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    function inspect(body, top = '', property = 'read') {
        const built = buildCommonJsGuestBundle({ sources: [
            { path: 'program.js', source: 'const {create}=require("./helper");const api=create();module.exports={run:ops=>api['
                + JSON.stringify(property) + '](ops)};' },
            { path: 'helper.js', source: top + 'function create(){function read(node){return node.get("id");}' + body + '}module.exports={create};' }],
            entry: 'program.js', exportName: 'run' });
        const analysis = inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' });
        return { analysis, call: analysis.inventories[0].modules.find(module => module.path === 'program.js')
            .call_bindings.find(call => call.callee.property === property) };
    }
    const positive = inspect('const metadata=Object.freeze(["fixed",1]);return Object.freeze({read,metadata});');
    assert.equal(positive.call.target?.module, 'helper.js');
    assert.match(positive.call.target.body_sha256, /^sha256:[a-f0-9]{64}$/);
    assert.equal(positive.analysis.necessary_equivalence_proved, false);
    for (const body of ['return Object.freeze({get read(){return read;}});',
        'return Object.freeze({__proto__:{read}});', 'return Object.freeze({read,read:()=>0});',
        'const value={read};return Object.freeze(value);', 'return Object.seal({read});',
        'const metadata=[Object.keys({read})];return Object.freeze({read,metadata});',
        'const Object={freeze:x=>x};return Object.freeze({read});',
        'if(true)return Object.freeze({read});return Object.freeze({read:()=>0});',
        'read=()=>0;return Object.freeze({read});', 'Object.keys({read});return Object.freeze({read});']) {
        assert.equal(inspect(body).call.target, null, body);
    }
    assert.equal(inspect('return Object.freeze({read});', 'Object.freeze=x=>x;').call.target, null);
    assert.equal(inspect('const metadata=Object.freeze([1]);return {read};', 'Object.freeze=x=>x;').call.target, null);
    assert.equal(inspect('const metadata={x:Object.freeze([1])};return {read};', 'Object.freeze=x=>x;').call.target, null);
    assert.equal(inspect('return Object.freeze({1:read,"1":()=>0});', '', '1').call.target, null);
});

async function receiverReturnFixture() {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation);
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship:
        api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile: await phaseFixture() }) });
    const normal = contract.readPathCandidateCapabilityReference({ expectation });
    const child = contract.readPathCandidateChildABIReference({ expectation });
    const seed = child.seeds.find(seed => seed.selected_sets.length && seed.input_sets.length && Object.values(seed.material_descriptors)
        .some(material => Object.values(material.fields).some(field => field.type === 'ref_list')));
    const { projectPathReceiverOrigins } = await import('../../../scripts/agent/pathReceiverOriginContract.mjs');
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    return { seed, inspect(source) {
        const built = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source }], entry: 'program.js', exportName: 'run' });
        const syntax = inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' });
        return projectPathReceiverOrigins(syntax.inventories[0], 'child_proof_operands', seed, normal.data, child.data);
    } };
}

test('N02G:PATH-V3-048 admitted return shapes preserve conditional child handles absence projections and scalar distinctions', async () => {
    const { seed, inspect } = await receiverReturnFixture();
    const [alias, material] = Object.entries(seed.material_descriptors).find(([alias, material]) => seed.nodes[alias]?.binding === 'snapshot'
        && Object.values(material.fields).some(field => field.type === 'ref_list'));
    const field = Object.keys(material.fields).find(name => material.fields[name].type === 'ref_list');
    const projection = inspect(`function run(ops){const root=ops.node(${JSON.stringify(alias)});const list=root.get(${JSON.stringify(field)});list.length();list.at(0);root.keys().length();return root.get("id");}module.exports={run};`);
    const get = projection.calls.find(row => row.target_origin.kind === 'capability_method'
        && row.target_origin.name === 'get' && row.return_origin.kind === 'capability');
    assert.ok(get, 'ref_list is a conditional child handle, not scalar by substring');
    assert.equal(get.return_origin.surface, 'node');
    assert.equal(get.return_origin.binding.shape.type, 'sequence');
    assert.equal(get.return_origin.binding.shape.item.type, 'scalar');
    assert.deepEqual(get.return_origin.binding.path, [field]);
    assert.equal(get.return_origin.binding.projection, 'data');
    assert.equal(get.return_origin.binding.return_conditions.runtime_proved, false);
    const lengths = projection.calls.filter(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'length');
    assert.equal(lengths.length, 2);
    assert.equal(lengths.find(row => row.target_origin.receiver.binding.projection === 'keys').target_origin.receiver.binding.shape.item.type, 'scalar');
    const at = projection.calls.find(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'at');
    assert.equal(at.return_origin.kind, 'scalar');
    assert.equal(at.return_origin.return_conditions.may_be_absent, true);
    assert.ok(projection.calls.some(row => row.target_origin.name === 'get' && row.return_origin.kind === 'scalar'));
    assert.equal(projection.operational_receiver_authority, false);
    assert.equal(projection.necessary_equivalence_proved, false);
});

test('N02G:PATH-V3-049 return shape propagation cannot manufacture payload presence membership edges or same-name authority', async () => {
    const { seed, inspect } = await receiverReturnFixture();
    const alias = Object.keys(seed.material_descriptors).find(alias => seed.nodes[alias]?.binding === 'snapshot'
        && Object.values(seed.material_descriptors[alias].fields).some(field => field.type === 'ref_list'));
    const material = seed.material_descriptors[alias], q = JSON.stringify(alias);
    for (const term of ['ops.node(' + q + ').get("not_admitted")', 'ops.node(' + q + ').get(field)',
        'ops.node(' + q + ').get("id")', '({get:()=>({length:()=>1})}).get("members")']) {
        const p = inspect(`function run(ops){const field="id";return ${term}.length();}module.exports={run};`);
        assert.ok(!p.calls.some(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'length'), term);
        assert.equal(p.semantic_mutation_credit, 0);
    }
    const display = Object.keys(material.fields).find(name => material.fields[name].class === 'non_material');
    if (display) {
        const p = inspect(`function run(ops){return ops.node(${q}).get(${JSON.stringify(display)}).length();}module.exports={run};`);
        assert.ok(p.calls.some(row => row.return_origin.reason === 'non_material_or_unknown_field'));
    }
    const setName = JSON.stringify(seed.input_sets[0].name);
    const p = inspect(`function run(ops){const members=ops.set(${setName}).select(node=>true);return members.at(0).get("id");}module.exports={run};`);
    const selected = p.calls.find(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'select');
    assert.equal(selected.return_origin.kind, 'capability');
    assert.equal(selected.return_origin.binding.membership, 'runtime_selected_not_fixture_output');
    const member = p.calls.find(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'at');
    assert.equal(member.return_origin.binding.return_conditions.may_be_absent, true);
    assert.equal(member.return_origin.binding.return_conditions.runtime_proved, false);
    assert.equal(p.effect_closure_complete, false);
    assert.equal(p.executable_consumer_absence_proved, false);
    const selection = seed.selected_sets[0];
    const selectedCall = inspect(`function read(node){return node.get("id");}function run(ops){return ops.select(${JSON.stringify(selection.candidate_set)},${JSON.stringify(selection.selected_set)},read);}module.exports={run};`);
    assert.ok(selectedCall.callback_bindings.some(row => row.callback_argument_index === 2), 'REAL child select callback is its third argument');
    assert.ok(selectedCall.calls.some(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'get'));
    assert.equal(selectedCall.calls.find(row => row.target_origin.name === 'select').return_origin.binding.membership,
        'runtime_selected_not_fixture_output');
    const invalidSelect = inspect(`function read(node){return node.get("id");}function run(ops){return ops.select(${JSON.stringify(selection.candidate_set)},"unbound_target",read);}module.exports={run};`);
    assert.ok(!invalidSelect.calls.some(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'get'));
    assert.ok(invalidSelect.calls.some(row => row.return_origin.reason === 'selection_target_or_population_not_admitted'));
    const listField = Object.keys(material.fields).find(name => material.fields[name].type === 'ref_list');
    const wrongShape = inspect(`function run(ops){const root=ops.node(${q});root.length();root.get(${JSON.stringify(listField)}).identity("kind");return root.keys().keys();}module.exports={run};`);
    assert.ok(wrongShape.calls.some(row => row.return_origin.reason === 'sequence_shape_not_admitted'));
    assert.ok(wrongShape.calls.some(row => row.return_origin.reason === 'identity_requires_root_data_projection'));
    assert.ok(wrongShape.calls.some(row => row.return_origin.reason === 'keys_requires_data_projection'));
    const dynamic = inspect(`function run(ops){const root=ops.node(${q});const field=root.get("id");return root.get(field).length();}module.exports={run};`);
    assert.ok(dynamic.calls.some(row => row.return_origin.reason === 'non_material_or_unknown_field'));
    assert.ok(!dynamic.calls.some(row => row.target_origin.kind === 'capability_method' && row.target_origin.name === 'length'));
    const edge = seed.edges.find(edge => edge.relation === 'material_ref' && seed.nodes[edge.source]?.binding === 'snapshot'
        && seed.nodes[edge.target]?.binding === 'snapshot');
    assert.ok(edge);
    const traversal = inspect(`function run(ops){return ops.node(${JSON.stringify(edge.source)}).traverse(${JSON.stringify(edge.id)}).identity("ref_id");}module.exports={run};`);
    const target = traversal.calls.find(row => row.target_origin.name === 'traverse').return_origin;
    assert.equal(target.binding.alias, edge.target);
    assert.equal(target.binding.return_conditions.runtime_proved, false);
    const claim = inspect('function run(ops){return ops.claim().get("not_admitted").get("kind");}module.exports={run};');
    assert.ok(claim.calls.some(row => row.return_origin.reason === 'non_material_or_unknown_field'));
});

test('N02G:PATH-V3-046 genuine child roots compose finite receivers and callback origins over every real program before C M S', async t => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation);
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship:
        api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile: await phaseFixture() }) });
    let bound = 0, unresolved = 0, callbacks = 0;
    for (const variant of ['C', 'M', 'S']) {
        const rows = contract.readPathCandidateReceiverOrigins({ expectation, variant });
        assert.equal(rows.length, input.ir.graphs.length);
        for (const row of rows) for (const projection of [...row.phases, row.functional]) {
            assert.equal(projection.fact_key, row.fact_key);
            assert.equal(projection.qualified, false);
            assert.equal(projection.guest_call_provenance_complete, false);
            assert.equal(projection.effect_closure_complete, false);
            assert.equal(projection.necessary_equivalence_proved, false);
            assert.ok(projection.calls.length > 0);
            bound += projection.conditional_capability_calls;
            unresolved += projection.unresolved_potential_calls;
            callbacks += projection.callback_bindings.length;
            assert.ok(projection.calls.filter(call => call.target_origin.kind === 'capability_method')
                .every(call => /^sha256:[a-f0-9]{64}$/.test(call.target_origin.definition_sha256)
                    && call.runtime_dominance_and_effects_proved === false));
        }
    }
    assert.ok(bound > 0 && unresolved > 0 && callbacks > 0);
    assert.equal(expectation.semantic_mutation_credit, 0);
    const causes = Object.create(null), unresolvedReturns = Object.create(null);
    for (const row of contract.readPathCandidateReceiverOrigins({ expectation, variant: 'C' }))
        for (const projection of [...row.phases, row.functional]) for (const call of projection.calls)
            if (call.potential_consumer && call.target_origin.kind === 'unknown') {
                const reason = call.target_origin.reason;
                causes[reason] = (causes[reason] || 0) + 1;
            } else if (call.potential_consumer && call.target_origin.kind === 'capability_method' && call.return_origin.kind === 'unknown') {
                const reason = call.return_origin.reason;
                unresolvedReturns[reason] = (unresolvedReturns[reason] || 0) + 1;
            }
    t.diagnostic(JSON.stringify({ stage: 'C_conditional_projection_not_execution_or_credit', unknown_causes: causes,
        unresolved_capability_returns: unresolvedReturns }));
});

test('N02G:PATH-V3-047 receiver references cannot be replaced by caller roots clones outputs parent receipts or active scopes', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation);
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship:
        api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile: await phaseFixture() }) });
    const rows = contract.readPathCandidateReceiverOrigins({ expectation, variant: 'C' });
    assert.ok(rows.every(row => Object.isFrozen(row) && Object.isFrozen(row.functional.calls)));
    assert.throws(() => contract.readPathCandidateReceiverOrigins({ expectation: structuredClone(expectation), variant: 'C' }));
    for (const key of ['roots', 'expected', 'scope', 'selected_output', 'parent_receipts', 'approval'])
        assert.throws(() => contract.readPathCandidateReceiverOrigins({ expectation, variant: 'C', [key]: rows }));
    let effects = 0;
    const active = { expectation };
    Object.defineProperty(active, 'variant', { enumerable: true, get() { effects++; return 'C'; } });
    assert.throws(() => contract.readPathCandidateReceiverOrigins(active));
    assert.throws(() => contract.readPathCandidateReceiverOrigins(new Proxy({ expectation, variant: 'C' }, { ownKeys() { effects++; return []; } })));
    assert.equal(effects, 0);
    const calls = rows.flatMap(row => [...row.phases, row.functional].flatMap(projection => projection.calls));
    assert.ok(calls.some(call => call.target_origin.kind === 'unknown'));
    assert.ok(calls.every(call => call.runtime_dominance_and_effects_proved === false));
    assert.ok(rows.every(row => row.functional.executable_consumer_absence_proved === false));
    const { projectPathReceiverOrigins } = await import('../../../scripts/agent/pathReceiverOriginContract.mjs');
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const child = contract.readPathCandidateChildABIReference({ expectation });
    const normal = contract.readPathCandidateCapabilityReference({ expectation });
    const seed = child.seeds.find(seed => seed.input_sets.length && Object.values(seed.nodes).some(node => node.binding === 'snapshot'));
    const alias = Object.keys(seed.nodes).find(alias => seed.nodes[alias].binding === 'snapshot');
    const inspect = source => {
        const built = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source }], entry: 'program.js', exportName: 'run' });
        const syntax = inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' });
        // Low-level BUILD projection is NOT an admission API. Genuine product
        // references can only be obtained through the opaque family above.
        return projectPathReceiverOrigins(syntax.inventories[0], 'child_proof_operands', seed, normal.data, child.data);
    };
    const bound = inspect(`function run(ops){const alias=ops;return alias.node(${JSON.stringify(alias)}).get("id");}module.exports={run};`);
    assert.ok(bound.calls.some(call => call.target_origin.kind === 'capability_method' && call.target_origin.name === 'get'));
    for (const prefix of ['const alias={node:()=>({get:()=>0})};',
        'let alias=ops;alias={node:()=>({get:()=>0})};',
        'const alias=ops;alias.node=()=>({get:()=>0});']) {
        const fake = inspect(`function run(ops){${prefix}return alias.node(${JSON.stringify(alias)}).get("id");}module.exports={run};`);
        assert.ok(!fake.calls.some(call => call.target_origin.kind === 'capability_method' && call.target_origin.name === 'get'));
        assert.equal(fake.operational_receiver_authority, false);
    }
    const setName = JSON.stringify(seed.input_sets[0].name);
    const mixed = inspect(`function read(node){return node.get("id");}function run(ops){ops.set(${setName}).select(read);read({get:()=>0});return true;}module.exports={run};`);
    assert.ok(mixed.parameter_origins.some(row => row.origin.reason === 'conflicting_incoming_origins'));
    assert.ok(!mixed.calls.some(call => call.target_origin.kind === 'capability_method' && call.target_origin.name === 'get'));
    assert.ok(mixed.callback_bindings.length > 0);
    assert.equal(mixed.qualified, false);
    assert.equal(mixed.effect_closure_complete, false);
    const linked = buildCommonJsGuestBundle({ sources: [
        { path: 'program.js', source: `const ns=require("./reader");const alias=ns;function run(ops){return ops.set(${setName}).select(alias.read);}module.exports={run};` },
        { path: 'reader.js', source: 'function read(node){return node.get("id");}module.exports={read};' }],
        entry: 'program.js', exportName: 'run' });
    const syntax = inspectPathExecutableClosure({ source: linked.source, sourceHashes: linked.sourceHashes, kind: 'metric' });
    const callback = projectPathReceiverOrigins(syntax.inventories[0], 'child_proof_operands', seed, normal.data, child.data);
    assert.ok(callback.callback_bindings.some(row => row.target.module === 'reader.js'));
    assert.ok(callback.calls.some(call => call.module === 'reader.js' && call.target_origin.kind === 'capability_method'
        && call.target_origin.name === 'get'));
});

test('N02G:PATH-V3-038 whole family call bindings are sealed before M and retain unresolved dispatch without granting value flow proof', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation);
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship:
        api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile: await phaseFixture() }) });
    for (const variant of ['C', 'M', 'S']) {
        const closure = contract.readPathCandidateClosureReference({ expectation, variant });
        const roots = contract.readPathCandidateRootCapabilityBindings({ expectation, variant });
        assert.equal(roots.length, closure.programs.length);
        assert.ok(roots.every(row => row.phase_entries.length === 2 && row.phase_entries.every(entry => entry.function
            && entry.bindings?.[0]?.source.kind === 'ordinary_bundle_operands_forwarding')));
        assert.ok(roots.every(row => row.guest_call_provenance_complete === false));
        assert.ok(roots.every(row => row.functional_entries.length === 1 && row.functional_entries[0].function
            && row.functional_entries[0].bindings?.[0]?.source.kind === 'ordinary_bundle_operands_forwarding'));
        for (const row of [...closure.programs, ...closure.metrics]) {
            assert.equal(row.analysis.call_binding_inventory_complete, true);
            assert.equal(row.analysis.function_boundary_inventory_complete, true);
            assert.equal(row.analysis.value_flow_proof_complete, false);
            assert.ok(row.analysis.unresolved_call_count > 0);
            for (const bundle of row.analysis.inventories) for (const module of bundle.modules)
                assert.equal(module.call_bindings.length, module.call_site_count);
        }
    }
    require('../../../src/next/provenance/pathSemanticReference').sealPathQualificationReference({ candidate });
    const result = compiler.compilePathQualificationProgramCandidate({ capture: compiler.capturePathQualificationCompiler(), candidate, expectation });
    assert.deepEqual(result.worlds.map(row => row.static_call_binding_conformance), [true, true, true]);
    assert.deepEqual(result.worlds.map(row => row.function_boundary_conformance), [true, true, true]);
    assert.deepEqual(result.worlds.map(row => row.conditional_receiver_reference_conformance), [true, true, true]);
    assert.deepEqual(result.worlds.map(row => row.effect_obligation_conformance), [true, true, true]);
    assert.ok(result.worlds.every(row => row.effect_closure_complete === false
        && row.effect_composition_status === 'blocked_missing_effect_discharge'));
    assert.ok(result.worlds.every(row => row.operational_receiver_authority === false));
    assert.throws(() => contract.readPathCandidateRootCapabilityBindings({ expectation: structuredClone(expectation), variant: 'C' }));
    let effects = 0;
    const active = { expectation };
    Object.defineProperty(active, 'variant', { enumerable: true, get() { effects++; return 'C'; } });
    assert.throws(() => contract.readPathCandidateRootCapabilityBindings(active));
    assert.equal(effects, 0);
    assert.equal(result.executable_consumer_absence_proved, false);
    assert.equal(result.qualified, false); assert.equal(result.handle_attempts, 0);
});

test('N02G:PATH-V3-039 callable linkage resolves renamed imports namespace and local aliases but never assumes mutable or dynamic dispatch', async () => {
    const { inspectPathExecutableClosure } = await import('../../../scripts/agent/pathExecutableClosureContract.mjs');
    const { buildCommonJsGuestBundle } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const helper = 'const read=handle=>handle.get("id");module.exports={read};';
    const analyze = source => {
        const built = buildCommonJsGuestBundle({ sources: [{ path: 'program.js', source },
            { path: 'helper.js', source: helper }], entry: 'program.js', exportName: 'run' });
        return inspectPathExecutableClosure({ source: built.source, sourceHashes: built.sourceHashes, kind: 'metric' });
    };
    const checked = analyze('const {read:reader}=require("./helper");const alias=reader;function run(x){return alias(x);}module.exports={run};');
    const calls = checked.inventories[0].modules.find(row => row.path === 'program.js').call_bindings;
    assert.ok(calls.some(row => row.target?.kind === 'local_function' && row.target.module === 'helper.js'));
    assert.equal(checked.call_binding_inventory_complete, true);
    const namespace = analyze('const namespace=require("./helper");const alias=namespace;module.exports={run:x=>alias.read(x)};');
    assert.ok(namespace.inventories[0].modules.find(row => row.path === 'program.js').call_bindings
        .some(row => row.target?.kind === 'local_function' && row.target.module === 'helper.js'));
    for (const source of [
        'const {read}=require("./helper");let alias=read;alias=x=>x;module.exports={run:x=>alias(x)};',
        'const ns=require("./helper");module.exports={run:(x,key)=>ns[key](x)};']) {
        const ambiguous = analyze(source);
        const unresolved = ambiguous.inventories[0].modules.find(row => row.path === 'program.js').call_bindings
            .filter(row => row.target === null);
        assert.ok(unresolved.length > 0);
        assert.equal(ambiguous.value_flow_proof_complete, false);
        assert.equal(ambiguous.executable_consumer_absence_proved, false);
    }
    const shadowed = analyze('const {read}=require("./helper");module.exports={run:read=>read(1)};');
    assert.ok(shadowed.inventories[0].modules.find(row => row.path === 'program.js').call_bindings
        .some(row => row.target === null && row.reason === 'parameter_dispatch'));
    const namespaceWrite = analyze('const ns=require("./helper");const alias=ns;alias.read=x=>x;module.exports={run:x=>ns.read(x)};');
    assert.ok(namespaceWrite.inventories[0].modules.find(row => row.path === 'program.js').call_bindings
        .some(row => row.target === null && ['mutable_binding', 'module_namespace_mutated'].includes(row.reason)));
    const intrinsicWrite = analyze('require("./helper");Object.freeze=x=>x;module.exports={run:x=>Object.freeze(x)};');
    assert.ok(intrinsicWrite.inventories[0].modules.find(row => row.path === 'program.js').call_bindings
        .some(row => row.target === null && row.reason === 'intrinsic_reassigned'));
    const cycle = analyze('require("./helper");const a=b;const b=a;module.exports={run:x=>a(x)};');
    assert.ok(cycle.inventories[0].modules.find(row => row.path === 'program.js').call_bindings
        .some(row => row.target === null && row.reason === 'alias_cycle'));
    for (let depth = 1; depth <= 4; depth++) {
        const aliases = Array.from({ length: depth }, (_, index) =>
            `const a${index}=${index ? 'a' + (index - 1) : 'ns'};`).join('');
        const mutated = analyze(`const ns=require("./helper");${aliases}a${depth - 1}.read=x=>x;module.exports={run:x=>ns.read(x)};`);
        assert.ok(mutated.inventories[0].modules.find(row => row.path === 'program.js').call_bindings
            .some(row => row.target === null && ['mutable_binding', 'module_namespace_mutated'].includes(row.reason)));
        const intrinsicAlias = analyze(`require("./helper");const ns=Object;${aliases}a${depth - 1}.freeze=x=>x;module.exports={run:x=>Object.freeze(x)};`);
        assert.ok(intrinsicAlias.inventories[0].modules.find(row => row.path === 'program.js').call_bindings
            .some(row => row.target === null && row.reason === 'intrinsic_reassigned'));
    }
});

test('N02G:PATH-V3-040 normal capability authority binds every real exposed surface and complete source before C M S', async () => {
    const capability = await import('../../../scripts/agent/pathCapabilityEffectContract.mjs');
    const reference = capability.capturePathNormalCapabilityReference();
    const data = capability.readPathNormalCapabilityReference({ reference });
    assert.equal(data.surfaces.length, 6);
    assert.deepEqual(data.surfaces.map(row => row.kind).sort(),
        ['node', 'node_iterator', 'node_set', 'set_iterator', 'derived_parent', 'proof_operands'].sort());
    assert.equal(data.sources.length, 3);
    for (const surface of data.surfaces) for (const method of surface.methods) {
        assert.ok(method.source.length > 0 && /^sha256:[a-f0-9]{64}$/.test(method.source_sha256));
        assert.ok(method.rule.returns && Array.isArray(method.rule.observation_operations));
        assert.equal(method.rule.effect_scope, 'shared_normal_capability_contract_not_call_provenance');
    }
    const node = data.surfaces.find(row => row.kind === 'node');
    assert.equal(node.methods.find(row => row.name === 'get').rule.returns, 'absent_or_scalar_or_child_handle_by_admitted_shape');
    assert.equal(node.methods.find(row => row.name === 'follow').rule.returns, 'root_node_by_admitted_edge');
    assert.equal(data.surfaces.find(row => row.kind === 'node_set').methods.find(row => row.name === 'select').rule.callback,
        'each_member_node_and_index_boolean_decision_no_raw_payload');
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation);
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship:
        api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile: await phaseFixture() }) });
    const sealed = contract.readPathCandidateCapabilityReference({ expectation });
    assert.equal(sealed.reference.reference_sha256, reference.reference_sha256);
    assert.equal(expectation.normal_capability_reference_sha256, reference.reference_sha256);
    assert.equal(expectation.value_flow_proof_complete, false);
    assert.equal(expectation.executable_consumer_absence_proved, false);
    assert.equal(expectation.semantic_mutation_credit, 0);
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    require('../../../src/next/provenance/pathSemanticReference').sealPathQualificationReference({ candidate });
    const result = compiler.compilePathQualificationProgramCandidate({ capture: compiler.capturePathQualificationCompiler(), candidate, expectation });
    assert.equal(result.normal_capability_source_conformance, true);
    assert.equal(result.normal_capability_reference_sha256, reference.reference_sha256);
    assert.equal(result.executable_consumer_absence_proved, false); assert.equal(result.handle_attempts, 0);
});

test('N02G:PATH-V3-041 capability source or full surface drift and rehash cannot replace private authority and active transports are inert', async () => {
    const capability = await import('../../../scripts/agent/pathCapabilityEffectContract.mjs');
    const reference = capability.capturePathNormalCapabilityReference();
    const data = capability.readPathNormalCapabilityReference({ reference });
    assert.equal(capability.verifyPathNormalCapabilityReference({ reference, sources: data.sources }).source_conformance, true);
    const buildHashes = data.sources.map(row => ({ path: row.path.slice('src/next/'.length), sha256: row.sha256 }));
    assert.equal(capability.verifyPathNormalCapabilityBuildBinding({ reference, sourceHashes: buildHashes }).normal_capability_source_conformance, true);
    for (let index = 0; index < buildHashes.length; index++) {
        const changed = structuredClone(buildHashes); changed[index].sha256 = 'sha256:' + '0'.repeat(64);
        assert.throws(() => capability.verifyPathNormalCapabilityBuildBinding({ reference, sourceHashes: changed }));
    }
    assert.throws(() => capability.verifyPathNormalCapabilityBuildBinding({ reference, sourceHashes: [...buildHashes, buildHashes[0]] }));
    assert.throws(() => capability.verifyPathNormalCapabilityBuildBinding({ reference, sourceHashes: buildHashes.slice(1) }));
    for (let index = 0; index < data.sources.length; index++) {
        const changed = structuredClone(data.sources);
        changed[index].source += '\n// drift with newly calculated raw digest\n';
        changed[index].sha256 = 'sha256:' + require('node:crypto').createHash('sha256').update(changed[index].source).digest('hex');
        assert.throws(() => capability.verifyPathNormalCapabilityReference({ reference, sources: changed }));
    }
    assert.throws(() => capability.readPathNormalCapabilityReference({ reference: structuredClone(reference) }));
    assert.throws(() => capability.capturePathNormalCapabilityReference({ sources: data.sources }));
    assert.throws(() => capability.verifyPathNormalCapabilityReference({ reference, sources: [...data.sources].reverse() }));
    assert.throws(() => capability.verifyPathNormalCapabilityReference({ reference, sources: data.sources.slice(1) }));
    let effects = 0;
    const active = { reference };
    Object.defineProperty(active, 'sources', { enumerable: true, get() { effects++; return data.sources; } });
    assert.throws(() => capability.verifyPathNormalCapabilityReference(active));
    assert.throws(() => capability.verifyPathNormalCapabilityReference({ reference, sources:
        new Proxy(data.sources, { ownKeys() { effects++; return []; } }) }));
    assert.equal(effects, 0);
    const fs = require('node:fs'), read = fs.readFileSync;
    fs.readFileSync = function(file, ...args) {
        const value = read.call(this, file, ...args);
        if (typeof file !== 'string' || !file.replaceAll('\\', '/').endsWith('/src/next/provenance/instrumentedAccess.js')) return value;
        const altered = value.toString().replace("event('has',", "event('get',");
        assert.notEqual(altered, value.toString());
        return typeof value === 'string' ? altered : Buffer.from(altered);
    };
    try { assert.throws(() => capability.recheckPathNormalCapabilityReference({ reference })); }
    finally { fs.readFileSync = read; }
    assert.equal(reference.value_flow_proof_complete, false);
    assert.equal(reference.executable_consumer_absence_proved, false);
    assert.equal(reference.validation_tcb_complete, false);
    // Capture an altered REAL factory in memory, then restore physical reads.
    // Fresh raw/source table digests do not authorize it against the earlier seal.
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation);
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship:
        api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile: await phaseFixture() }) });
    require('../../../src/next/provenance/pathSemanticReference').sealPathQualificationReference({ candidate });
    let capture, changedReads = 0;
    fs.readFileSync = function(file, ...args) {
        const value = read.call(this, file, ...args);
        if (typeof file !== 'string' || !file.replaceAll('\\', '/').endsWith('/src/next/provenance/instrumentedAccess.js')) return value;
        const altered = value.toString().replace("event('has',", "event('get',");
        assert.notEqual(altered, value.toString()); changedReads++;
        return typeof value === 'string' ? altered : Buffer.from(altered);
    };
    try { capture = compiler.capturePathQualificationCompiler(); } finally { fs.readFileSync = read; }
    assert.ok(changedReads > 0);
    let failure;
    try { compiler.compilePathQualificationProgramCandidate({ capture, candidate, expectation }); }
    catch (error) { failure = error; }
    assert.match(failure?.message ?? '', /BUILD_source_binding/);
    const retained = compiler.readPathQualificationCompilerEvidence(failure);
    assert.equal(retained.capability_conformance_failed, true);
    assert.equal(retained.stage, 'before_first_normal_compile');
    assert.equal(retained.compiler_artifact_root, capture.artifact_root);
    assert.equal(retained.handle_attempts, 0); assert.equal(retained.semantic_mutation_credit, 0);
    assert.throws(() => compiler.compilePathQualificationProgramCandidate({ capture, candidate, expectation }), /poisoned/);
});

test('N02G:PATH-V3-042 child ABI and all authorial input capability seeds are sealed before C M S without fixture selected rosters', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation);
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship:
        api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile: await phaseFixture() }) });
    const child = contract.readPathCandidateChildABIReference({ expectation });
    assert.equal(child.reference.reference_sha256, expectation.normal_child_abi_reference_sha256);
    assert.equal(child.data.role_constructions.length, 4);
    assert.deepEqual(child.data.surfaces.find(row => row.kind === 'child_proof_operands').methods.map(row => row.name).sort(),
        ['node', 'claim', 'set', 'select', 'resolveReference', 'memberEdge', 'edge'].sort());
    assert.deepEqual(child.data.surfaces.find(row => row.kind === 'child_derivation_guard').methods.map(row => row.name).sort(),
        ['node', 'claim', 'set', 'edge', 'edgeTargetInSet'].sort());
    assert.equal(child.data.excluded_profile_extensions.length, 2);
    assert.equal(child.reference.profile_extension_authority, false);
    assert.equal(child.seeds.length, input.ir.graphs.length);
    for (let index = 0; index < child.seeds.length; index++) {
        const row = child.seeds[index], graph = input.ir.graphs[index];
        assert.equal(row.fact_key, graph.fact_key);
        assert.deepEqual(row.nodes, graph.nodes);
        assert.deepEqual(row.edges, graph.edges);
        assert.deepEqual(row.operands, graph.operands);
        for (const set of row.selected_sets) {
            assert.equal(set.runtime_membership_not_pinned_to_authored_output, true);
            assert.equal(Object.hasOwn(set, 'aliases'), false);
        }
        assert.equal(row.parent_receipts_admitted, false);
    }
    require('../../../src/next/provenance/pathSemanticReference').sealPathQualificationReference({ candidate });
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const result = compiler.compilePathQualificationProgramCandidate({ capture: compiler.capturePathQualificationCompiler(), candidate, expectation });
    assert.equal(result.normal_child_abi_source_conformance, true);
    assert.equal(result.normal_child_abi_reference_sha256, expectation.normal_child_abi_reference_sha256);
    assert.equal(result.guest_call_provenance_complete, false);
    assert.equal(result.dp_execution, false); assert.equal(result.handle_attempts, 0);
});

test('N02G:PATH-V3-043 child ABI bytes rehash or active transport cannot replace authority and altered capsule is refused before C', async () => {
    const capability = await import('../../../scripts/agent/pathCapabilityEffectContract.mjs');
    const normalReference = capability.capturePathNormalCapabilityReference();
    const reference = capability.capturePathNormalChildABIReference({ normalReference });
    const data = capability.readPathNormalChildABIReference({ reference });
    const hashes = [{ path: 'provenance/executionHostChild.js', sha256: data.source.sha256 },
        ...capability.readPathNormalCapabilityReference({ reference: normalReference }).sources
            .filter(row => row.path.endsWith('/instrumentedAccess.js'))
            .map(row => ({ path: 'provenance/instrumentedAccess.js', sha256: row.sha256 }))];
    assert.equal(capability.verifyPathNormalChildABIBuildBinding({ reference, sourceHashes: hashes }).normal_child_abi_source_conformance, true);
    assert.throws(() => capability.readPathNormalChildABIReference({ reference: structuredClone(reference) }));
    assert.throws(() => capability.capturePathNormalChildABIReference({ normalReference: structuredClone(normalReference) }));
    assert.throws(() => capability.capturePathNormalChildABIReference({ normalReference, profileExtensionAuthority: true }));
    for (let index = 0; index < hashes.length; index++) {
        const changed = structuredClone(hashes); changed[index].sha256 = 'sha256:' + '0'.repeat(64);
        assert.throws(() => capability.verifyPathNormalChildABIBuildBinding({ reference, sourceHashes: changed }));
    }
    let effects = 0;
    const active = { reference };
    Object.defineProperty(active, 'sourceHashes', { enumerable: true, get() { effects++; return hashes; } });
    assert.throws(() => capability.verifyPathNormalChildABIBuildBinding(active));
    assert.throws(() => capability.verifyPathNormalChildABIBuildBinding({ reference, sourceHashes:
        new Proxy(hashes, { ownKeys() { effects++; return []; } }) }));
    assert.equal(effects, 0);
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const contract = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const compiler = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const candidate = admittedCandidate(api, preparation);
    const expectation = contract.sealPathCandidateProgramExpectation({ authorship:
        api.preparePathCandidateProgramAuthorship({ candidate, phaseProfile: await phaseFixture() }) });
    require('../../../src/next/provenance/pathSemanticReference').sealPathQualificationReference({ candidate });
    const fs = require('node:fs'), read = fs.readFileSync;
    let capture, reads = 0;
    for (const [before, after] of [
        ["phase: { enumerable: true, value: 'proof' },", "phase: { enumerable: true, value: 'proof' }, forged: { enumerable: true, value: () => 0 },"],
        ['Object.defineProperty(operands, operand.role,', 'Object.defineProperty(operands, operand.foreign,'],
        ['Object.create(control.handle, { select:', 'Object.create(control.foreign, { select:'],
        ['const view = Object.freeze({ length:', 'const view = Object.freeze({ foreign:']
    ]) {
        fs.readFileSync = function(file, ...args) {
            const value = read.call(this, file, ...args);
            if (typeof file !== 'string' || !file.replaceAll('\\', '/').endsWith('/src/next/provenance/executionHostChild.cjs')) return value;
            const changed = value.toString().replace(before, after);
            assert.notEqual(changed, value.toString());
            return typeof value === 'string' ? changed : Buffer.from(changed);
        };
        try { assert.throws(() => capability.capturePathNormalChildABIReference({ normalReference })); }
        finally { fs.readFileSync = read; }
    }
    fs.readFileSync = function(file, ...args) {
        const value = read.call(this, file, ...args);
        if (typeof file !== 'string' || !file.replaceAll('\\', '/').endsWith('/src/next/provenance/executionHostChild.cjs')) return value;
        const changed = value.toString().replace('node: { enumerable: true, value: alias => access.handle(alias) }',
            'node: { enumerable: true, value: alias => access.handle("claim/context") }');
        assert.notEqual(changed, value.toString()); reads++;
        return typeof value === 'string' ? changed : Buffer.from(changed);
    };
    try { capture = compiler.capturePathQualificationCompiler(); } finally { fs.readFileSync = read; }
    assert.ok(reads > 0);
    let failure;
    try { compiler.compilePathQualificationProgramCandidate({ capture, candidate, expectation }); }
    catch (error) { failure = error; }
    assert.match(failure?.message ?? '', /child_BUILD_source_binding/);
    const retained = compiler.readPathQualificationCompilerEvidence(failure);
    assert.equal(retained.capability_conformance_failed, true);
    assert.equal(retained.stage, 'before_first_normal_compile');
    assert.equal(retained.handle_attempts, 0); assert.equal(retained.semantic_mutation_credit, 0);
    assert.throws(() => compiler.compilePathQualificationProgramCandidate({ capture, candidate, expectation }), /poisoned/);
});

test('N02G:PATH-V3-030 single-site whole C M S references bind authored package bytes before captured compilation', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const { sealPathQualificationReference } = require('../../../src/next/provenance/pathSemanticReference');
    const { capturePathQualificationCompiler, compilePathQualificationCandidate } = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    // A same-nominal material anchor not consumed by a selection. Test target,
    // not a production exemption: the implementation has no target-ID cases.
    const rowIndex = preparation.rows.findIndex(row => row.target.fact_key === 'S-01#1#1'
        && row.target.predicate_id === 'link_2_refund_sign');
    assert.ok(rowIndex >= 0);
    const siteIndex = preparation.rows[rowIndex].sites.findIndex(site => site.authored_site.site_path[1] === 0);
    const domain = preparation.rows[rowIndex].sites[siteIndex].domain;
    const locatorIndex = domain.locators.findIndex(locator => locator.node !== domain.original.node
        && JSON.stringify(locator.segments) === JSON.stringify(domain.original.segments));
    assert.ok(locatorIndex >= 0);
    const candidate = api.materializePathQualificationLocator({ preparation, rowIndex, siteIndex, locatorIndex });
    const reference = api.preparePathCandidateWholeIRReference({ candidate });
    assert.equal(reference.sealed_before_captured_compile, true);
    assert.deepEqual(reference.worlds.map(world => world.variant), ['C', 'M', 'S']);
    assert.deepEqual(reference.worlds[0].authority_refs, candidate.baseline_package);
    assert.deepEqual(reference.worlds[1].authority_refs, candidate.candidate_package);
    assert.equal(reference.worlds[0].ir_sha256, reference.worlds[2].ir_sha256);
    assert.notEqual(reference.worlds[0].ir_sha256, reference.worlds[1].ir_sha256);
    assert.equal(api.verifyPathCandidateWholeIRReference({ reference, variant: 'C', ir: input.ir }).whole_ir_conformance, true);
    assert.throws(() => api.verifyPathCandidateWholeIRReference({ reference, variant: 'M', ir: input.ir }));
    sealPathQualificationReference({ candidate });
    const result = compilePathQualificationCandidate({ capture: capturePathQualificationCompiler(), candidate });
    assert.equal(result.whole_ir_reference, reference);
    assert.equal(result.worlds[1].admitted, true);
    for (const world of result.worlds.filter(world => world.admitted)) {
        assert.equal(world.whole_ir_conformance, true);
        assert.equal(world.ir_sha256, reference.worlds.find(row => row.variant === world.variant).ir_sha256);
    }
    assert.equal(result.qualified, false); assert.equal(result.semantic_mutation_credit, 0);
});

test('N02G:PATH-V3-031 whole C M S seals reject cached baseline active transports clones and compiler metadata corruption', async () => {
    const api = require('../../../src/next/provenance/pathQualificationV3');
    const input = await fixture(), preparation = api.preparePathQualificationInventory(input);
    const rowIndex = preparation.rows.findIndex(row => row.sites.some(site => site.domain?.locators.length));
    const siteIndex = preparation.rows[rowIndex].sites.findIndex(site => site.domain?.locators.length);
    const candidate = api.materializePathQualificationLocator({ preparation, rowIndex, siteIndex, locatorIndex: 0 });
    const reference = api.preparePathCandidateWholeIRReference({ candidate });
    assert.throws(() => api.preparePathCandidateWholeIRReference({ candidate: structuredClone(candidate) }));
    assert.throws(() => api.preparePathCandidateWholeIRReference({ candidate, expected: input.ir }));
    assert.throws(() => api.verifyPathCandidateWholeIRReference({ reference: structuredClone(reference), variant: 'C', ir: input.ir }));
    assert.throws(() => api.verifyPathCandidateWholeIRReference({ reference, variant: { toString() { throw new Error('coercion'); } }, ir: input.ir }));
    let effects = 0;
    const active = { reference, variant: 'C' };
    Object.defineProperty(active, 'ir', { enumerable: true, get() { effects++; return input.ir; } });
    assert.throws(() => api.verifyPathCandidateWholeIRReference(active));
    assert.throws(() => api.verifyPathCandidateWholeIRReference({ reference, variant: 'C', ir: new Proxy(input.ir, { ownKeys() { effects++; return []; } }) }));
    assert.equal(effects, 0);
    const fs = require('node:fs'), read = fs.readFileSync;
    const { capturePathQualificationCompiler, compilePathQualificationCandidate, readPathQualificationCompilerEvidence } = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    let capture, reads = 0;
    fs.readFileSync = function(file, ...args) {
        const value = read.call(this, file, ...args);
        if (typeof file !== 'string' || !file.replaceAll('\\', '/').endsWith('/src/next/provenance/validationTcbEntry.js')) return value;
        const source = typeof value === 'string' ? value : value.toString('utf8');
        const changed = source.replace('compileAuthoringIR: receipt => compileAuthoringIR(receipt, validators)',
            "compileAuthoringIR: receipt => { const ir = JSON.parse(JSON.stringify(compileAuthoringIR(receipt, validators))); ir.graphs[0].claim.metric += '_corrupt'; return ir; }");
        assert.notEqual(changed, source); reads++;
        return typeof value === 'string' ? changed : Buffer.from(changed);
    };
    try { capture = capturePathQualificationCompiler(); } finally { fs.readFileSync = read; }
    assert.ok(reads > 0);
    require('../../../src/next/provenance/pathSemanticReference').sealPathQualificationReference({ candidate });
    let failure;
    try { compilePathQualificationCandidate({ capture, candidate }); } catch (error) { failure = error; }
    assert.ok(failure);
    const retained = readPathQualificationCompilerEvidence(failure);
    assert.equal(retained.conformance_failed, true);
    assert.equal(retained.variant, 'C');
    assert.equal(retained.contradiction.graph_index, 0);
    assert.notEqual(retained.contradiction.expected_sha256, retained.contradiction.observed_sha256);
    assert.ok(JSON.parse(retained.contradiction.observed_canonical_json).claim.metric.endsWith('_corrupt'));
    assert.equal(retained.handle_attempts, 0);
    assert.equal(retained.qualified, false);
    assert.throws(() => compilePathQualificationCandidate({ capture, candidate }));
});

function selectionControlPlans() {
    return selectionControlPromise ||= (async () => {
    const { preparePathQualificationInventory, preparePathSelectionAdmissionControls } = require('../../../src/next/provenance/pathQualificationV3');
    const preparation = preparePathQualificationInventory(await fixture());
    const plans = [];
    for (let rowIndex = 0; rowIndex < preparation.rows.length; rowIndex++) {
        const plan = preparePathSelectionAdmissionControls({ preparation, rowIndex });
        if (plan.controls.length) plans.push(plan);
    }
        return { preparation, plans };
    })();
}

test('N02G:PATH-V3-028 whole authoring IR is sealed from authored documents including topology roles trace and state requirements', async () => {
    const { preparePathQualificationInventory, preparePathWholeIRReference, verifyPathWholeIRReference,
        readPathWholeIRReference } = require('../../../src/next/provenance/pathQualificationV3');
    const input = await fixture(), preparation = preparePathQualificationInventory(input);
    const reference = preparePathWholeIRReference({ preparation });
    const checked = verifyPathWholeIRReference({ reference, ir: input.ir });
    assert.equal(checked.whole_ir_conformance, true);
    assert.equal(checked.graphs, input.ir.order.length);
    assert.equal(checked.qualified, false); assert.equal(checked.semantic_mutation_credit, 0);
    assert.equal(reference.source_basis, 'authored_documents_shared_declared_nominal_types_not_observed_IR');
    assert.deepEqual(readPathWholeIRReference({ reference }), input.ir);
    assert.equal(reference.independent_compiler, false);
    assert.equal(preparation.whole_ir_conformance.whole_ir_conformance, true);
});

test('N02G:PATH-V3-029 whole IR rejects every graph metadata class order forged flags and active transports before mutant preparation', async () => {
    const { preparePathQualificationInventory, preparePathWholeIRReference, verifyPathWholeIRReference,
        readPathWholeIRReference } = require('../../../src/next/provenance/pathQualificationV3');
    const input = await fixture(), preparation = preparePathQualificationInventory(input);
    const reference = preparePathWholeIRReference({ preparation });
    const candidate = graph => ({ ...input.ir, graphs: [graph, ...input.ir.graphs.slice(1)] });
    const first = input.ir.graphs[0];
    for (const key of Object.keys(first)) {
        const graph = structuredClone(first); delete graph[key];
        assert.throws(() => verifyPathWholeIRReference({ reference, ir: candidate(graph) }));
    }
    for (let index = 0; index < input.ir.graphs.length; index++) {
        const graphs = [...input.ir.graphs], graph = structuredClone(graphs[index]);
        graph.claim.evidence_state = graph.claim.evidence_state === 'confirmed' ? 'projected' : 'confirmed';
        graphs[index] = graph;
        assert.throws(() => verifyPathWholeIRReference({ reference, ir: { ...input.ir, graphs } }));
    }
    for (const mutate of [x => x.order.reverse(), x => x.graphs.reverse(), x => x.graphs.pop(),
        x => x.graphs[1] = structuredClone(x.graphs[0]), x => x.executable = true,
        x => x.authority_refs[0].sha256 = 'sha256:' + '0'.repeat(64)]) {
        const ir = structuredClone(input.ir); mutate(ir);
        assert.throws(() => verifyPathWholeIRReference({ reference, ir }));
    }
    const corrupted = structuredClone(input.ir); corrupted.graphs[0].claim.metric += '_changed';
    assert.throws(() => preparePathQualificationInventory({ packageReceipt: input.packageReceipt, ir: corrupted }));
    assert.throws(() => preparePathWholeIRReference({ preparation: structuredClone(preparation) }));
    assert.throws(() => verifyPathWholeIRReference({ reference: structuredClone(reference), ir: input.ir }));
    assert.throws(() => readPathWholeIRReference({ reference: structuredClone(reference) }));
    assert.throws(() => preparePathWholeIRReference({ preparation, expected: input.ir }));
    let effects = 0;
    const active = { reference };
    Object.defineProperty(active, 'ir', { enumerable: true, get() { effects++; return input.ir; } });
    assert.throws(() => verifyPathWholeIRReference(active));
    const nested = candidate(structuredClone(first));
    Object.defineProperty(nested.graphs[0].claim, 'metric', { enumerable: true, get() { effects++; return first.claim.metric; } });
    assert.throws(() => verifyPathWholeIRReference({ reference, ir: nested }));
    assert.throws(() => verifyPathWholeIRReference({ reference, ir: new Proxy(input.ir, { ownKeys() { effects++; return []; } }) }));
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-026 whole normal phase program seals authored role associations and reviewed mode before lowering all baseline graphs', async () => {
    const { preparePathQualificationInventory, preparePathPhaseAuthorship } = require('../../../src/next/provenance/pathQualificationV3');
    const { sealPathPhaseProgramExpectation, verifyPathPhaseProgram } = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const { compileSnapshotAccess } = require('../../../src/next/provenance/graphCompiler');
    const { buildAdmittedSchemaValidators } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const { buildPhaseProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const { admitPhaseCompositionProfile, PROFILE_PATH } = require('../../../src/next/provenance/phaseCompositionProfile');
    const input = await fixture(), preparation = preparePathQualificationInventory(input);
    const registry = admittedDocuments(input.packageReceipt).find(row => row.value?.registry_id === 'metric_evaluator_registry').value;
    const phaseProfile = admitPhaseCompositionProfile({ source: require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../../..', PROFILE_PATH), 'utf8'), registry });
    const expectations = input.ir.order.map(fact => ({ fact, expectation: sealPathPhaseProgramExpectation({
        authorship: preparePathPhaseAuthorship({ preparation, factKey: fact, phaseProfile }) }) }));
    const access = compileSnapshotAccess(input.packageReceipt, buildAdmittedSchemaValidators(input.packageReceipt).validators);
    const modes = new Set(); let guarded = 0;
    for (const { fact, expectation } of expectations) {
        modes.add(expectation.derivation_mode);
        const actual = buildPhaseProofProgram({ derivation: access.projectDerivationProgram({ fact_key: fact }, phaseProfile).input,
            proof: access.projectProofProgram({ fact_key: fact }).input }, phaseProfile);
        const checked = verifyPathPhaseProgram({ expectation, candidate: actual });
        assert.equal(checked.whole_phase_program_conformance, true);
        assert.equal(checked.derivation_conformance, true);
        assert.equal(checked.whole_proof_program_conformance, true);
        assert.equal(checked.helper_closure_complete, true);
        assert.equal(checked.qualified, false); assert.equal(checked.semantic_mutation_credit, 0);
        assert.equal(checked.handles_opened, 0); assert.equal(checked.fact_key, fact);
        if (expectation.derivation_mode === 'formula_only') assert.equal(actual.derivationPredicateCount, 0);
        else guarded += Number(actual.derivationPredicateCount > 0);
    }
    assert.deepEqual([...modes].sort(), ['formula_only', 'formula_plus_selection_guards']);
    assert.ok(guarded > 0); assert.equal(expectations.length, input.ir.order.length);
});

test('N02G:PATH-V3-027 phase conformance rejects phase bypass guards profile manifest source table and active caller authority', async () => {
    const { preparePathQualificationInventory, preparePathPhaseAuthorship } = require('../../../src/next/provenance/pathQualificationV3');
    const { sealPathPhaseProgramExpectation, verifyPathPhaseProgram, readPathPhaseProgramReference } = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const { compileSnapshotAccess } = require('../../../src/next/provenance/graphCompiler');
    const { buildAdmittedSchemaValidators } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const { buildPhaseProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const { admitPhaseCompositionProfile, PROFILE_PATH } = require('../../../src/next/provenance/phaseCompositionProfile');
    const input = await fixture(), preparation = preparePathQualificationInventory(input);
    const registry = admittedDocuments(input.packageReceipt).find(row => row.value?.registry_id === 'metric_evaluator_registry').value;
    const phaseProfile = admitPhaseCompositionProfile({ source: require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../../..', PROFILE_PATH), 'utf8'), registry });
    const authorships = input.ir.order.map(fact => preparePathPhaseAuthorship({ preparation, factKey: fact, phaseProfile }));
    const authorship = authorships.find(row => row.derivation_predicate_ids.length);
    assert.ok(authorship);
    const expectation = sealPathPhaseProgramExpectation({ authorship });
    const access = compileSnapshotAccess(input.packageReceipt, buildAdmittedSchemaValidators(input.packageReceipt).validators);
    const actual = buildPhaseProofProgram({ derivation: access.projectDerivationProgram({ fact_key: authorship.fact_key }, phaseProfile).input,
        proof: access.projectProofProgram({ fact_key: authorship.fact_key }).input }, phaseProfile);
    assert.equal(verifyPathPhaseProgram({ expectation, candidate: actual }).whole_phase_program_conformance, true);
    const reference = readPathPhaseProgramReference({ expectation });
    assert.equal(reference.source, actual.source); assert.equal(reference.manifest, actual.manifest);
    assert.throws(() => readPathPhaseProgramReference({ expectation: structuredClone(expectation) }));
    assert.throws(() => readPathPhaseProgramReference({ expectation, source: actual.source }));
    const hash = source => 'sha256:' + require('node:crypto').createHash('sha256').update(source).digest('hex');
    for (const alter of [s => s.replace('operands.phase==="derivation"', 'false'),
        s => s.replace('derivation_guard_', 'wrong_guard_'), s => s.replace('proof_program_phase', 'wrong_phase'),
        s => s.replace('.get("period"),false)', '.get("period"),true)'),
        s => s.replace('let all = true;', 'let all = false;')]) {
        const changed = structuredClone(actual); changed.source = alter(changed.source);
        assert.notEqual(changed.source, actual.source);
        const manifest = JSON.parse(changed.manifest); manifest.files[0].sha256 = hash(changed.source);
        changed.manifest = require('../../../src/next/kernel/canonicalValue').canonicalValue(manifest);
        changed.artifact_root = hash(changed.manifest);
        assert.throws(() => verifyPathPhaseProgram({ expectation, candidate: changed }));
    }
    for (const mutate of [x => x.sourceHashes.pop(), x => x.sourceHashes.reverse(),
        x => x.sourceHashes[0].sha256 = 'sha256:' + '0'.repeat(64),
        x => x.profileInput.registry_sha256 = 'sha256:' + '0'.repeat(64),
        x => x.profileInput.source += '\n', x => x.assertionSites.pop(),
        x => x.derivationPredicateCount = 0, x => x.negative_witness_only = true,
        x => x.manifest += '\n']) {
        const changed = structuredClone(actual); mutate(changed);
        assert.throws(() => verifyPathPhaseProgram({ expectation, candidate: changed }));
    }
    assert.throws(() => preparePathPhaseAuthorship({ preparation, factKey: authorship.fact_key, phaseProfile: structuredClone(phaseProfile) }));
    assert.throws(() => preparePathPhaseAuthorship({ preparation, factKey: authorship.fact_key, phaseProfile, ir: input.ir }));
    assert.throws(() => sealPathPhaseProgramExpectation({ authorship: structuredClone(authorship) }));
    assert.throws(() => verifyPathPhaseProgram({ expectation: structuredClone(expectation), candidate: actual }));
    let effects = 0;
    const active = { expectation };
    Object.defineProperty(active, 'candidate', { enumerable: true, get() { effects++; return actual; } });
    assert.throws(() => verifyPathPhaseProgram(active));
    const nested = structuredClone(actual);
    Object.defineProperty(nested.profileInput, 'source', { enumerable: true, get() { effects++; return actual.profileInput.source; } });
    assert.throws(() => verifyPathPhaseProgram({ expectation, candidate: nested }));
    assert.throws(() => verifyPathPhaseProgram({ expectation, candidate: new Proxy(actual, { ownKeys() { effects++; return []; } }) }));
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-024 proof program expectations precede normal lowering and cover the whole authored baseline without caller IR', async () => {
    const { preparePathQualificationInventory, preparePathProofAuthorship } = require('../../../src/next/provenance/pathQualificationV3');
    const { sealPathProofProgramExpectation, verifyPathProofProgram } = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const { compileSnapshotAccess } = require('../../../src/next/provenance/graphCompiler');
    const { buildAdmittedSchemaValidators } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const { buildScalarProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const input = await fixture(), preparation = preparePathQualificationInventory(input);
    const expectations = input.ir.order.map(fact => ({ fact,
        expectation: sealPathProofProgramExpectation({ authorship: preparePathProofAuthorship({ preparation, factKey: fact }) }) }));
    const access = compileSnapshotAccess(input.packageReceipt, buildAdmittedSchemaValidators(input.packageReceipt).validators);
    for (const { fact, expectation } of expectations) {
        const actual = buildScalarProofProgram(access.projectProofProgram({ fact_key: fact }).input);
        const checked = verifyPathProofProgram({ expectation, source: actual.source });
        assert.equal(checked.whole_proof_program_conformance, true);
        assert.equal(checked.helper_closure_complete, true);
        assert.equal(checked.derivation_conformance, false);
        assert.equal(checked.qualified, false);
        assert.equal(checked.semantic_mutation_credit, 0);
        assert.equal(checked.handles_opened, 0);
        assert.equal(checked.fact_key, fact);
    }
    assert.equal(expectations.length, input.ir.order.length);
});

test('N02G:PATH-V3-025 program conformance refuses changed paths selection returns helper bytes caller expectations and active boundaries', async () => {
    const { preparePathQualificationInventory, preparePathProofAuthorship } = require('../../../src/next/provenance/pathQualificationV3');
    const { sealPathProofProgramExpectation, verifyPathProofProgram } = await import('../../../scripts/agent/pathProofProgramContract.mjs');
    const { compileSnapshotAccess } = require('../../../src/next/provenance/graphCompiler');
    const { buildAdmittedSchemaValidators } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const { buildScalarProofProgram, buildScalarAssertionFaultProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const input = await fixture(), preparation = preparePathQualificationInventory(input);
    const authorship = preparePathProofAuthorship({ preparation, factKey: input.ir.order[0] });
    const expectation = sealPathProofProgramExpectation({ authorship });
    const access = compileSnapshotAccess(input.packageReceipt, buildAdmittedSchemaValidators(input.packageReceipt).validators);
    const projected = access.projectProofProgram({ fact_key: input.ir.order[0] }).input;
    const source = buildScalarProofProgram(projected).source;
    for (const alter of [s => s.replace('proof_assertion_', 'wrong_assertion_'),
        s => s.replace('.get(', '.has('), s => s.replace('return !all;', 'return all;'),
        s => s.replace('const rootOperands=operands;', 'const rootOperands=null;'),
        s => s.replace('const cache = new Map();', 'const cache = new Map();throw new Error("extra");')]) {
        const changed = alter(source); assert.notEqual(changed, source);
        assert.throws(() => verifyPathProofProgram({ expectation, source: changed }));
    }
    const eq = projected.predicates.find(predicate => predicate.operator.id === 'eq');
    assert.ok(eq);
    assert.throws(() => verifyPathProofProgram({ expectation, source: buildScalarAssertionFaultProgram(projected, eq.id).source }));
    assert.throws(() => sealPathProofProgramExpectation({ authorship: structuredClone(authorship) }));
    assert.throws(() => preparePathProofAuthorship({ preparation, factKey: input.ir.order[0], input: projected }));
    assert.throws(() => verifyPathProofProgram({ expectation: structuredClone(expectation), source }));
    assert.throws(() => verifyPathProofProgram({ expectation, source, expectedHash: expectation.expected_source_sha256 }));
    let effects = 0;
    const active = { expectation };
    Object.defineProperty(active, 'source', { enumerable: true, get() { effects++; return source; } });
    assert.throws(() => verifyPathProofProgram(active));
    assert.throws(() => verifyPathProofProgram(new Proxy({ expectation, source }, { ownKeys() { effects++; return []; } })));
    assert.throws(() => verifyPathProofProgram({ expectation, source: { toString() { effects++; return source; } } }));
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-021 every selection exclusion precommits its native instance and remains unqualified after a captured barrier', async () => {
    const { materializePathSelectionAdmissionControl } = require('../../../src/next/provenance/pathQualificationV3');
    const { capturePathQualificationCompiler, compilePathQualificationCandidate } = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const { preparation, plans } = await selectionControlPlans();
    assert.ok(plans.length > 0);
    const modes = new Set();
    for (const plan of plans) {
        assert.equal(plan.qualified, false);
        assert.equal(plan.semantic_mutation_credit, 0);
        const keys = new Set();
        for (const control of plan.controls) {
            keys.add(JSON.stringify([control.site_index, control.locator_index]));
            assert.deepEqual(control.authored_site, preparation.rows[plan.row_index].sites[control.site_index].authored_site);
            assert.equal(control.expected_diagnostic.checker, 'selection_bindings');
            assert.equal(control.expected_diagnostic.fact_key, preparation.rows[plan.row_index].target.fact_key);
            assert.equal(control.expected_diagnostic.predicate_id,
                control.expected_diagnostic.mode === 'selected_member_retains_authored_reason' ? null
                    : preparation.rows[plan.row_index].target.predicate_id);
            assert.equal(control.coordinate_scope, 'native_selection_instance_single_authored_patch_not_operand_reader');
            assert.equal(control.compiler_barrier_verified, false);
            modes.add(control.expected_diagnostic.mode);
        }
        assert.equal(keys.size, plan.controls.length);
    }
    assert.ok(modes.has('excluded_reason_concerns_own_candidate'));
    const plan = plans[0], candidate = materializePathSelectionAdmissionControl({ plan, controlIndex: 0 });
    const capture = capturePathQualificationCompiler();
    const result = compilePathQualificationCandidate({ capture, candidate });
    assert.deepEqual(result.worlds.map(world => world.admitted), [true, false, true]);
    assert.equal(result.native_control_matched, true);
    assert.deepEqual(result.worlds[1].diagnostic.native_coordinate, candidate.expected_diagnostic);
    assert.equal(result.worlds[1].diagnostic.forged_same_text_has_authority, false);
    assert.equal(result.handle_attempts, 0);
    assert.equal(result.qualified, false);
    assert.equal(result.semantic_mutation_credit, 0);
    assert.equal(result.dp_execution, false);
    assert.equal(result.normal_compiler_source_bindings_sha256, capture.normal_compiler_source_bindings_sha256);
    assert.equal(result.selection_binding_source_sha256, 'sha256:' + require('node:crypto').createHash('sha256')
        .update(require('node:fs').readFileSync(require('node:path').resolve(__dirname,
            '../../../src/next/provenance/selectionBindings.js'))).digest('hex'));
    assert.match(result.selection_binding_source_sha256, /^sha256:[0-9a-f]{64}$/);
});

test('N02G:PATH-V3-022 selection controls reject caller coordinates source authority clones replay getters and proxies', async () => {
    const { preparePathSelectionAdmissionControls, materializePathSelectionAdmissionControl,
        takePathQualificationCandidatePackage } = require('../../../src/next/provenance/pathQualificationV3');
    const { readSelectionBindingDiagnostic } = require('../../../src/next/provenance/selectionBindings');
    const { preparation, plans } = await selectionControlPlans(), plan = plans[0];
    assert.throws(() => preparePathSelectionAdmissionControls({ preparation, rowIndex: plan.row_index, expected: {} }));
    assert.throws(() => materializePathSelectionAdmissionControl({ plan: structuredClone(plan), controlIndex: 0 }));
    assert.throws(() => materializePathSelectionAdmissionControl({ plan, controlIndex: 0, coordinate: {} }));
    let effects = 0;
    const active = { plan };
    Object.defineProperty(active, 'controlIndex', { enumerable: true, get() { effects++; return 0; } });
    assert.throws(() => materializePathSelectionAdmissionControl(active));
    assert.throws(() => materializePathSelectionAdmissionControl(new Proxy({ plan, controlIndex: 0 }, { ownKeys() { effects++; return []; } })));
    assert.throws(() => materializePathSelectionAdmissionControl({ plan, controlIndex: { valueOf() { effects++; return 0; } } }));
    const candidate = materializePathSelectionAdmissionControl({ plan, controlIndex: 0 });
    assert.throws(() => takePathQualificationCandidatePackage({ candidate: structuredClone(candidate) }));
    assert.equal(takePathQualificationCandidatePackage({ candidate }).reference.qualified, false);
    assert.throws(() => takePathQualificationCandidatePackage({ candidate }));
    assert.equal(readSelectionBindingDiagnostic(new Error('selection_binding_selected')), null);
    assert.equal(readSelectionBindingDiagnostic(new Proxy({}, { get() { effects++; return true; } })), null);
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-023 selection barrier controls detect removed inverted redirected guards and cached positive admission', async () => {
    const fs = require('node:fs');
    const { materializePathSelectionAdmissionControl } = require('../../../src/next/provenance/pathQualificationV3');
    const { capturePathQualificationCompiler, compilePathQualificationCandidate } = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const { plans } = await selectionControlPlans();
    const plan = plans.find(plan => plan.controls.some(control => control.expected_diagnostic.mode === 'excluded_reason_concerns_own_candidate'));
    const controlIndex = plan.controls.findIndex(control => control.expected_diagnostic.mode === 'excluded_reason_concerns_own_candidate');
    const positiveRoot = capturePathQualificationCompiler().artifact_root;
    const guard = 'if (!concerns(predicate, excluded.node)) {';
    const changes = [
        { file: 'selectionBindings.js', change: source => source.replace(guard, 'if (false) {'), poisoned: false },
        { file: 'selectionBindings.js', change: source => source.replace(guard, 'if (concerns(predicate, excluded.node)) {'), poisoned: true },
        { file: 'selectionBindings.js', change: source => source.replace(
            "mode: 'excluded_reason_concerns_own_candidate'", "mode: 'redirected_native_selection_instance'"), poisoned: false },
        { file: 'validationTcbEntry.js', change: source => source
            .replace('function capturedValidationTools() {', 'function capturedValidationTools() { let cachedIR, cachedAccess;')
            .replace('compileAuthoringIR: receipt => compileAuthoringIR(receipt, validators)',
                'compileAuthoringIR: receipt => (cachedIR ||= compileAuthoringIR(receipt, validators))')
            .replace('compileSnapshotAccess: receipt => compileSnapshotAccess(receipt, validators)',
                'compileSnapshotAccess: receipt => (cachedAccess ||= compileSnapshotAccess(receipt, validators))'), poisoned: true }
    ];
    for (const item of changes) {
        const read = fs.readFileSync;
        let reads = 0, capture;
        fs.readFileSync = function(file, ...args) {
            const value = read.call(this, file, ...args);
            if (typeof file !== 'string' || !file.replaceAll('\\', '/').endsWith('/src/next/provenance/' + item.file)) return value;
            const source = typeof value === 'string' ? value : value.toString('utf8'), changed = item.change(source);
            assert.notEqual(changed, source); reads++;
            return typeof value === 'string' ? changed : Buffer.from(changed);
        };
        try { capture = capturePathQualificationCompiler(); } finally { fs.readFileSync = read; }
        assert.ok(reads > 0);
        assert.notEqual(capture.artifact_root, positiveRoot);
        const candidate = materializePathSelectionAdmissionControl({ plan, controlIndex });
        if (item.poisoned) {
            assert.throws(() => compilePathQualificationCandidate({ capture, candidate }));
            assert.throws(() => compilePathQualificationCandidate({ capture,
                candidate: materializePathSelectionAdmissionControl({ plan, controlIndex }) }));
        } else {
            const result = compilePathQualificationCandidate({ capture, candidate });
            assert.equal(result.native_control_matched, false);
            assert.equal(result.qualified, false);
            assert.equal(result.semantic_mutation_credit, 0);
            assert.equal(result.handle_attempts, 0);
            assert.throws(() => compilePathQualificationCandidate({ capture,
                candidate: materializePathSelectionAdmissionControl({ plan, controlIndex }) }));
        }
    }
});

test('N02G:PATH-V3-016 historical migration preserves every old target, state and evidence without importing credit', async () => {
    const { preparePathQualificationInventory, preparePathQualificationHistoricalMigration,
        verifyPathQualificationHistoricalMigration } = require('../../../src/next/provenance/pathQualificationV3');
    const preparation = preparePathQualificationInventory(await fixture());
    const source = historicalSource(), old = JSON.parse(source);
    const migration = preparePathQualificationHistoricalMigration({ preparation, historicalSource: source });
    assert.equal(migration.rows.length, preparation.rows.length);
    assert.equal(migration.exact_old_membership, true);
    assert.equal(migration.historical_report_flags.valid, old.valid);
    assert.equal(migration.historical_report_flags.predicate_atom_credit, old.predicate_atom_credit);
    const byId = new Map(old.rows.map(row => [row.mutation_id, row]));
    for (const row of migration.rows) {
        assert.deepEqual(JSON.parse(JSON.stringify(row.historical_record)), byId.get(row.target_id));
        assert.equal(row.new_disposition, 'blocked');
        assert.equal(row.semantic_mutation_credit, 0);
        assert.equal(row.historical_state_changed, false);
        assert.equal(row.evidence_reused_for_v3, false);
        assert.equal(row.method_authority.commit, '72fc5a5b707909687da9b5cec892be2dcc892a62');
    }
    assert.equal(new Set(migration.rows.map(row => row.target_id)).size, migration.rows.length);
    const checked = verifyPathQualificationHistoricalMigration({ migration, candidate: structuredClone(migration) });
    assert.equal(checked.migration_integrity, true);
    assert.equal(checked.qualified, false);
    assert.equal(checked.semantic_mutation_credit, 0);
    assert.equal(checked.activated, false);
});

test('N02G:PATH-V3-017 historical migration refuses changed source, same-count redirection, forged state and active boundaries', async () => {
    const { preparePathQualificationInventory, preparePathQualificationHistoricalMigration,
        verifyPathQualificationHistoricalMigration } = require('../../../src/next/provenance/pathQualificationV3');
    const preparation = preparePathQualificationInventory(await fixture()), source = historicalSource();
    let effects = 0;
    const input = { preparation, historicalSource: source };
    for (const altered of [{ ...input, historicalSource: source + '\n' },
        { ...input, preparation: structuredClone(preparation) },
        { ...input, expectedHash: 'caller authority' },
        { ...input, historicalSource: { toString() { effects++; return source; } } },
        new Proxy(input, { ownKeys() { effects++; return []; } })]) {
        assert.throws(() => preparePathQualificationHistoricalMigration(altered));
    }
    const active = { preparation };
    Object.defineProperty(active, 'historicalSource', { enumerable: true, get() { effects++; return source; } });
    assert.throws(() => preparePathQualificationHistoricalMigration(active));
    const migration = preparePathQualificationHistoricalMigration(input);
    for (const mutate of [x => x.rows.pop(), x => x.rows[1] = structuredClone(x.rows[0]),
        x => x.rows[0].target_id = x.rows[1].target_id,
        x => x.rows[0].historical_record.matched = !x.rows[0].historical_record.matched,
        x => x.rows[0].new_disposition = 'semantic_witness',
        x => x.rows[0].semantic_mutation_credit = 1,
        x => x.historical_report_flags.valid = true,
        x => x.rows[0].evidence_reused_for_v3 = true]) {
        const candidate = structuredClone(migration); mutate(candidate);
        assert.throws(() => verifyPathQualificationHistoricalMigration({ migration, candidate }));
    }
    assert.throws(() => verifyPathQualificationHistoricalMigration({ migration: structuredClone(migration), candidate: migration }));
    const candidate = structuredClone(migration);
    Object.defineProperty(candidate.rows[0], 'historical_record', { enumerable: true, get() { effects++; return {}; } });
    assert.throws(() => verifyPathQualificationHistoricalMigration({ migration, candidate }));
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-007 candidate bytes change exactly one sealed locator and preserve the entire baseline package', async () => {
    const { preparePathQualificationInventory, materializePathQualificationLocator,
        takePathQualificationCandidatePackage } = require('../../../src/next/provenance/pathQualificationV3');
    const { admittedPackageEntries, admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const input = await fixture();
    const preparation = preparePathQualificationInventory(input);
    const rowIndex = preparation.rows.findIndex(row => row.sites.some(site => site.domain?.locators.length));
    const siteIndex = preparation.rows[rowIndex].sites.findIndex(site => site.domain?.locators.length);
    const candidate = materializePathQualificationLocator({ preparation, rowIndex, siteIndex, locatorIndex: 0 });
    const { sealPathQualificationReference } = require('../../../src/next/provenance/pathSemanticReference');
    sealPathQualificationReference({ candidate });
    const packageResult = takePathQualificationCandidatePackage({ candidate });
    assert.equal(candidate.semantic_mutation_credit, 0);
    assert.equal(candidate.qualified, false);
    assert.equal(packageResult.restorationReceipt, input.packageReceipt);
    const path = 'docs/contracts/next/provenance-v2/graphs-v2.json';
    const original = admittedDocuments(input.packageReceipt).find(row => row.path === path).value;
    const mutated = structuredClone(admittedDocuments(packageResult.packageReceipt).find(row => row.path === path).value);
    const graph = mutated.graphs.find(graph => graph.fact_key === candidate.target.fact_key);
    const predicate = graph.predicates.find(predicate => predicate.id === candidate.target.predicate_id);
    let container = predicate;
    for (const token of candidate.patch.location.slice(0, -1)) container = container[token];
    const leaf = candidate.patch.location.at(-1);
    assert.deepEqual(container[leaf], candidate.patch.after);
    container[leaf] = structuredClone(candidate.patch.before);
    assert.deepEqual(mutated, original);
    const baselineEntries = new Map(admittedPackageEntries(input.packageReceipt).map(row => [row.path, row.bytes]));
    for (const entry of admittedPackageEntries(packageResult.packageReceipt)) {
        if (entry.path !== path) assert.ok(entry.bytes.equals(baselineEntries.get(entry.path)));
    }
    assert.throws(() => takePathQualificationCandidatePackage({ candidate }));
    const next = materializePathQualificationLocator({ preparation, rowIndex, siteIndex, locatorIndex: 0 });
    assert.notEqual(next.invocation_id, candidate.invocation_id);
});

test('N02G:PATH-V3-008 candidate construction and consumption reject caller payloads, clones, replay and active indices', async () => {
    const { preparePathQualificationInventory, materializePathQualificationLocator,
        takePathQualificationCandidatePackage } = require('../../../src/next/provenance/pathQualificationV3');
    const preparation = preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.sites.some(site => site.domain?.locators.length));
    const siteIndex = preparation.rows[rowIndex].sites.findIndex(site => site.domain?.locators.length);
    const input = { preparation, rowIndex, siteIndex, locatorIndex: 0 };
    let effects = 0;
    for (const altered of [{ ...input, preparation: structuredClone(preparation) },
        { ...input, rowIndex: -1 }, { ...input, siteIndex: Infinity }, { ...input, locatorIndex: '0' },
        { ...input, locatorIndex: { valueOf() { effects++; return 0; } } },
        { ...input, after: { segments: ['forged'] } },
        new Proxy(input, { ownKeys() { effects++; return []; } })]) {
        assert.throws(() => materializePathQualificationLocator(altered));
    }
    const active = { ...input };
    Object.defineProperty(active, 'locatorIndex', { enumerable: true, get() { effects++; return 0; } });
    assert.throws(() => materializePathQualificationLocator(active));
    const candidate = materializePathQualificationLocator(input);
    assert.throws(() => takePathQualificationCandidatePackage({ candidate: structuredClone(candidate) }));
    const baselineReceipt = (await fixture()).packageReceipt;
    assert.throws(() => takePathQualificationCandidatePackage({ candidate,
        packageReceipt: baselineReceipt }));
    const copied = { ...candidate };
    Object.defineProperty(copied, 'invocation_id', { enumerable: true, get() { effects++; return candidate.invocation_id; } });
    assert.throws(() => takePathQualificationCandidatePackage({ candidate: copied }));
    const { sealPathQualificationReference } = require('../../../src/next/provenance/pathSemanticReference');
    sealPathQualificationReference({ candidate });
    assert.equal(takePathQualificationCandidatePackage({ candidate }).qualified, false);
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-009 independent reference is sealed before M bytes are released and unavailable is never a witness', async () => {
    const { preparePathQualificationInventory, materializePathQualificationLocator,
        takePathQualificationCandidatePackage } = require('../../../src/next/provenance/pathQualificationV3');
    const { sealPathQualificationReference, readPathSemanticReference } = require('../../../src/next/provenance/pathSemanticReference');
    const preparation = preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.sites.some(site => site.domain?.locators.length));
    const siteIndex = preparation.rows[rowIndex].sites.findIndex(site => site.domain?.locators.length);
    const candidate = materializePathQualificationLocator({ preparation, rowIndex, siteIndex, locatorIndex: 0 });
    assert.throws(() => takePathQualificationCandidatePackage({ candidate }));
    assert.throws(() => sealPathQualificationReference({ candidate: structuredClone(candidate) }));
    const sealed = sealPathQualificationReference({ candidate });
    assert.equal(readPathSemanticReference(sealed), sealed);
    assert.equal(sealed.method_version, 3);
    assert.equal(sealed.mutation_id, candidate.target_id);
    assert.equal(sealed.candidate_id, candidate.candidate_id);
    assert.equal(sealed.semantic_mutation_credit, 0);
    assert.equal(sealed.discriminating, sealed.available && sealed.baseline_satisfied === true && sealed.mutant_satisfied === false);
    assert.throws(() => sealPathQualificationReference({ candidate }));
    assert.equal(takePathQualificationCandidatePackage({ candidate }).reference, sealed);
    assert.throws(() => sealPathQualificationReference({ candidate }));
});

test('N02G:PATH-V3-010 captured normal compiler controls whole C/M/S without caller validators or operational credit', async () => {
    const { preparePathQualificationInventory, materializePathQualificationLocator } = require('../../../src/next/provenance/pathQualificationV3');
    const { sealPathQualificationReference } = require('../../../src/next/provenance/pathSemanticReference');
    const { capturePathQualificationCompiler, compilePathQualificationCandidate,
        readPathQualificationCompilerEvidence } = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const preparation = preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.sites.some(site => site.domain?.locators.length));
    const siteIndex = preparation.rows[rowIndex].sites.findIndex(site => site.domain?.locators.length);
    const candidate = materializePathQualificationLocator({ preparation, rowIndex, siteIndex, locatorIndex: 0 });
    sealPathQualificationReference({ candidate });
    const capture = capturePathQualificationCompiler();
    const result = compilePathQualificationCandidate({ capture, candidate });
    assert.equal(readPathQualificationCompilerEvidence(result), result);
    assert.deepEqual(result.worlds.map(world => world.variant), ['C', 'M', 'S']);
    assert.equal(result.worlds[0].admitted, true);
    assert.equal(result.worlds[2].admitted, true);
    assert.equal(result.worlds[0].ir_sha256, result.worlds[2].ir_sha256);
    assert.equal(result.worlds[0].access_descriptor_sha256, result.worlds[2].access_descriptor_sha256);
    assert.equal(result.worlds[0].graph_count, preparation.authority_refs.length > 0 ? (await fixture()).ir.graphs.length : -1);
    assert.equal(result.semantic_mutation_credit, 0);
    assert.equal(result.qualified, false);
    assert.equal(result.dp_execution, false);
    assert.equal(result.handle_attempts, 0);
    assert.equal(result.validation_tcb_complete, false);
    assert.throws(() => compilePathQualificationCandidate({ capture, candidate }));
});

test('N02G:PATH-V3-011 captured compiler ignores ambient replacement and refuses forged capabilities or extra APIs', async () => {
    const { preparePathQualificationInventory, materializePathQualificationLocator } = require('../../../src/next/provenance/pathQualificationV3');
    const { sealPathQualificationReference } = require('../../../src/next/provenance/pathSemanticReference');
    const { capturePathQualificationCompiler, compilePathQualificationCandidate } = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const preparation = preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.sites.some(site => site.domain?.locators.length));
    const siteIndex = preparation.rows[rowIndex].sites.findIndex(site => site.domain?.locators.length);
    const candidate = materializePathQualificationLocator({ preparation, rowIndex, siteIndex, locatorIndex: 0 });
    sealPathQualificationReference({ candidate });
    const capture = capturePathQualificationCompiler();
    assert.throws(() => compilePathQualificationCandidate({ capture: structuredClone(capture), candidate }));
    assert.throws(() => compilePathQualificationCandidate({ capture, candidate: structuredClone(candidate) }));
    let effects = 0;
    const active = { capture };
    Object.defineProperty(active, 'candidate', { enumerable: true, get() { effects++; return candidate; } });
    assert.throws(() => compilePathQualificationCandidate(active));
    assert.throws(() => compilePathQualificationCandidate(new Proxy({ capture, candidate }, { ownKeys() { effects++; return []; } })));
    assert.throws(() => compilePathQualificationCandidate({ capture, candidate, validators: {} }));
    const compiler = require('../../../src/next/provenance/graphCompiler');
    const previous = compiler.compileAuthoringIR;
    compiler.compileAuthoringIR = () => { effects++; throw new Error('ambient compiler must not run'); };
    try {
        const result = compilePathQualificationCandidate({ capture, candidate });
        assert.equal(result.worlds[0].admitted, true);
        assert.equal(result.worlds[2].admitted, true);
        assert.equal(result.handle_attempts, 0);
    } finally { compiler.compileAuthoringIR = previous; }
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-012 a disjoint declared reference nominal cannot make a scalar locator domain incomplete', async () => {
    const { preparePathQualificationInventory } = require('../../../src/next/provenance/pathQualificationV3');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const input = await fixture();
    const docs = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = docs.get('docs/contracts/next/provenance-v2/graphs-v2.json');
    const registry = docs.get(corpus.material_registry.path);
    const prepared = preparePathQualificationInventory(input);
    let checked = 0;
    for (const row of prepared.rows) for (const site of row.sites) {
        if (site.authored_site.definition !== 'fieldPath') continue;
        const graph = corpus.graphs.find(graph => graph.fact_key === row.target.fact_key);
        let original = graph.predicates.find(predicate => predicate.id === row.target.predicate_id);
        for (const token of site.authored_site.site_path.slice(0, -1)) original = original[token];
        const fields = registry.kinds[graph.nodes[original.node].kind].fields;
        const descriptor = fields[original.segments[0]];
        if (!['month', 'enum'].includes(descriptor.type)
            || !Object.values(fields).some(field => field.type === 'ref' && field.targets.length > 1)) continue;
        assert.equal(site.domain_complete, true);
        assert.equal(site.domain_reason, null);
        assert.equal(site.admitted_domain_complete, false);
        checked++;
    }
    assert.ok(checked > 0);
});

test('N02G:PATH-V3-013 empty L uses a genuine v2 unknown-path control and full native rejection without static credit', async () => {
    const { preparePathQualificationInventory, preparePathStaticDomainControls,
        materializePathStaticDomainControl } = require('../../../src/next/provenance/pathQualificationV3');
    const { capturePathQualificationCompiler, compilePathQualificationCandidate } = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const preparation = preparePathQualificationInventory(await fixture());
    const samples = new Map();
    preparation.rows.forEach((row, rowIndex) => {
        if (!row.sites.every(site => site.domain_complete && site.domain.locators.length === 0)) return;
        row.sites.forEach((site, siteIndex) => {
            if (!samples.has(site.domain.namespace)) samples.set(site.domain.namespace, { rowIndex, siteIndex });
        });
    });
    const capture = capturePathQualificationCompiler();
    for (const { rowIndex, siteIndex } of samples.values()) {
        const plan = preparePathStaticDomainControls({ preparation, rowIndex });
        const candidate = materializePathStaticDomainControl({ plan, siteIndex });
        assert.equal(candidate.candidate_kind, 'unknown_path_control_for_empty_L');
        assert.equal(candidate.locator_index, null);
        assert.equal(candidate.semantic_mutation_credit, 0);
        const result = compilePathQualificationCandidate({ capture, candidate });
        assert.equal(result.worlds[0].admitted, true);
        assert.equal(result.worlds[1].admitted, false);
        assert.equal(result.worlds[2].admitted, true);
        assert.deepEqual(result.worlds[1].diagnostic.native_coordinate, candidate.expected_diagnostic,
            JSON.stringify(result.worlds[1].diagnostic));
        assert.equal(result.native_control_matched, true);
        assert.equal(result.qualified, false);
        assert.equal(result.dp_execution, false);
        assert.equal(result.semantic_mutation_credit, 0);
        assert.equal(result.handle_attempts, 0);
    }
    assert.ok(samples.size >= 2);
});

test('N02G:PATH-V3-014 empty-domain preparation never absorbs mixed sites or caller claims and rejects cloned controls', async () => {
    const { preparePathQualificationInventory, preparePathStaticDomainControls,
        materializePathStaticDomainControl, takePathQualificationCandidatePackage } = require('../../../src/next/provenance/pathQualificationV3');
    const { sealPathQualificationReference } = require('../../../src/next/provenance/pathSemanticReference');
    const preparation = preparePathQualificationInventory(await fixture());
    const mixed = preparation.rows.findIndex(row => row.sites.some(site => site.domain?.locators.length > 0));
    assert.throws(() => preparePathStaticDomainControls({ preparation, rowIndex: mixed }));
    const rowIndex = preparation.rows.findIndex(row => row.sites.every(site => site.domain_complete && site.domain.locators.length === 0));
    assert.throws(() => preparePathStaticDomainControls({ preparation: structuredClone(preparation), rowIndex }));
    assert.throws(() => preparePathStaticDomainControls({ preparation, rowIndex, disposition: 'static_domain_proof' }));
    const plan = preparePathStaticDomainControls({ preparation, rowIndex });
    assert.equal(plan.qualified, false);
    assert.throws(() => materializePathStaticDomainControl({ plan: structuredClone(plan), siteIndex: 0 }));
    let effects = 0;
    const active = { plan };
    Object.defineProperty(active, 'siteIndex', { enumerable: true, get() { effects++; return 0; } });
    assert.throws(() => materializePathStaticDomainControl(active));
    const candidate = materializePathStaticDomainControl({ plan, siteIndex: 0 });
    assert.throws(() => sealPathQualificationReference({ candidate }));
    assert.throws(() => takePathQualificationCandidatePackage({ candidate: structuredClone(candidate) }));
    assert.equal(takePathQualificationCandidatePackage({ candidate }).reference.qualified, false);
    assert.throws(() => takePathQualificationCandidatePackage({ candidate }));
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-015 structural diagnostics carry the first native authored site and forged same-text errors remain unauthoritative', async () => {
    const { preparePathQualificationInventory, preparePathStaticDomainControls,
        materializePathStaticDomainControl, takePathQualificationCandidatePackage } = require('../../../src/next/provenance/pathQualificationV3');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const { validateGraphStructure, readGraphStructureDiagnostic } = require('../../../src/next/provenance/graphStructure');
    const preparation = preparePathQualificationInventory(await fixture());
    const samples = new Map();
    preparation.rows.forEach((row, rowIndex) => {
        if (!row.sites.every(site => site.domain_complete && site.domain.locators.length === 0)) return;
        row.sites.forEach((site, siteIndex) => {
            const key = site.authored_site.definition + ':' + site.authored_site.site_path.includes('bindings');
            if (!samples.has(key)) samples.set(key, { rowIndex, siteIndex });
        });
    });
    for (const { rowIndex, siteIndex } of samples.values()) {
        const plan = preparePathStaticDomainControls({ preparation, rowIndex });
        const candidate = materializePathStaticDomainControl({ plan, siteIndex });
        const input = takePathQualificationCandidatePackage({ candidate });
        const docs = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
        const corpus = docs.get('docs/contracts/next/provenance-v2/graphs-v2.json');
        let observed;
        try { validateGraphStructure({ graphs: corpus.graphs, claims: docs.get(corpus.claim_contract.path).claims,
            materialRegistry: docs.get(corpus.material_registry.path), operatorRegistry: docs.get(corpus.operator_registry.path) });
        } catch (error) { observed = error; }
        assert.ok(observed);
        assert.deepEqual(readGraphStructureDiagnostic(observed), candidate.expected_diagnostic);
        assert.equal(readGraphStructureDiagnostic(new Error(observed.message)), null);
        assert.equal(readGraphStructureDiagnostic({ message: observed.message, ...candidate.expected_diagnostic }), null);
        const wrong = { ...candidate.expected_diagnostic, operand_index: candidate.expected_diagnostic.operand_index + 1 };
        assert.notDeepEqual(readGraphStructureDiagnostic(observed), wrong);
    }
    assert.ok(samples.size >= 3);
});

test('N02G:PATH-V3-018 captured barrier controls detect removed inverted redirected guards and an excluded member accepted from cached C', async () => {
    const fs = require('node:fs');
    const { preparePathQualificationInventory, preparePathStaticDomainControls,
        materializePathStaticDomainControl } = require('../../../src/next/provenance/pathQualificationV3');
    const { capturePathQualificationCompiler, compilePathQualificationCandidate } = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const preparation = preparePathQualificationInventory(await fixture());
    const rowIndex = preparation.rows.findIndex(row => row.sites.every(site => site.domain_complete
        && site.domain.locators.length === 0) && row.sites.some(site => site.domain.namespace === 'material'));
    const plan = preparePathStaticDomainControls({ preparation, rowIndex });
    const siteIndex = plan.controls.findIndex(control => control.namespace === 'material');
    assert.ok(siteIndex >= 0);
    const positiveRoot = capturePathQualificationCompiler().artifact_root;
    const guard = "if (!own(fields, segments[0])) fail('path_missing');";
    const cases = [
        { file: 'graphStructure.js', change: source => source.replace(guard,
            "if (!own(fields, segments[0])) return { type: 'text' };"), mode: 'unmatched' },
        { file: 'graphStructure.js', change: source => source.replace(guard,
            "if (own(fields, segments[0])) fail('path_missing');"), mode: 'poisoned' },
        { file: 'graphStructure.js', change: source => source.replace(
            'site_path: [...coordinate.site_path, ...path]', "site_path: ['args', 0, 'forged']"), mode: 'unmatched' },
        { file: 'validationTcbEntry.js', change: source => source
            .replace('function capturedValidationTools() {', 'function capturedValidationTools() { let cachedIR, cachedAccess;')
            .replace('compileAuthoringIR: receipt => compileAuthoringIR(receipt, validators)',
                'compileAuthoringIR: receipt => (cachedIR ||= compileAuthoringIR(receipt, validators))')
            .replace('compileSnapshotAccess: receipt => compileSnapshotAccess(receipt, validators)',
                'compileSnapshotAccess: receipt => (cachedAccess ||= compileSnapshotAccess(receipt, validators))'), mode: 'poisoned' }
    ];
    for (const item of cases) {
        const originalRead = fs.readFileSync;
        let modifiedReads = 0, capture;
        // Adversarial BUILD bytes only, no disk edit and no weakened product
        // checker. The whole normal closure is still captured and executed.
        fs.readFileSync = function(file, ...args) {
            const value = originalRead.call(this, file, ...args);
            if (typeof file !== 'string' || !file.replaceAll('\\', '/').endsWith('/src/next/provenance/' + item.file)) return value;
            const source = typeof value === 'string' ? value : value.toString('utf8');
            const changed = item.change(source);
            assert.notEqual(changed, source); modifiedReads++;
            return typeof value === 'string' ? changed : Buffer.from(changed, 'utf8');
        };
        try { capture = capturePathQualificationCompiler(); } finally { fs.readFileSync = originalRead; }
        assert.ok(modifiedReads > 0);
        assert.notEqual(capture.artifact_root, positiveRoot);
        const candidate = materializePathStaticDomainControl({ plan, siteIndex });
        if (item.mode === 'poisoned') {
            assert.throws(() => compilePathQualificationCandidate({ capture, candidate }));
            assert.throws(() => compilePathQualificationCandidate({ capture,
                candidate: materializePathStaticDomainControl({ plan, siteIndex }) }));
        } else {
            const result = compilePathQualificationCandidate({ capture, candidate });
            assert.equal(result.native_control_matched, false);
            if (item.mode === 'accepted_M') assert.equal(result.worlds[1].admitted, true);
            assert.equal(result.qualified, false);
            assert.equal(result.semantic_mutation_credit, 0);
            assert.equal(result.handle_attempts, 0);
        }
    }
});

test('N02G:PATH-V3-019 authored selection constraints seal exclusions before M without calling unclassified members admitted', async () => {
    const { preparePathQualificationInventory, preparePathQualificationAdmissionDomain,
        materializePathQualificationLocator } = require('../../../src/next/provenance/pathQualificationV3');
    const { sealPathQualificationReference } = require('../../../src/next/provenance/pathSemanticReference');
    const { capturePathQualificationCompiler, compilePathQualificationCandidate } = await import('../../../scripts/agent/capturePathQualificationCompiler.mjs');
    const preparation = preparePathQualificationInventory(await fixture());
    let excluded = 0, unresolved = 0, control = null;
    for (let rowIndex = 0; rowIndex < preparation.rows.length; rowIndex++) {
        const domain = preparePathQualificationAdmissionDomain({ preparation, rowIndex });
        assert.equal(domain.qualified, false);
        assert.equal(domain.semantic_mutation_credit, 0);
        for (const site of domain.sites) {
            const original = preparation.rows[rowIndex].sites[site.site_index].domain;
            assert.equal(site.excluded.length + site.unclassified_locator_indices.length, original.locators.length);
            assert.equal(new Set([...site.excluded.map(x => x.locator_index), ...site.unclassified_locator_indices]).size,
                original.locators.length);
            if (site.unclassified_locator_indices.length) {
                assert.equal(site.admitted_locator_indices, null);
                assert.equal(site.admitted_domain_complete, false);
            } else assert.deepEqual(site.admitted_locator_indices, []);
            excluded += site.excluded.length;
            unresolved += site.unclassified_locator_indices.length;
            for (const member of site.excluded) {
                assert.equal(member.rule.id, 'selection_requires_authored_candidate_concern');
                assert.equal(member.rule.method_authority.commit, preparation.method_authority.commit);
                assert.deepEqual(member.site_path, preparation.rows[rowIndex].sites[site.site_index].authored_site.site_path);
                assert.equal(member.compiler_barrier_verified, false);
                assert.equal(member.expected_native_coordinate, null);
                assert.equal(member.basis, 'unchanged_authored_bindings_only_not_compiler_result');
                if (!control) control = { rowIndex, siteIndex: site.site_index, locatorIndex: member.locator_index };
            }
        }
    }
    assert.ok(excluded > 0);
    assert.ok(unresolved > 0);
    const candidate = materializePathQualificationLocator({ preparation, ...control });
    sealPathQualificationReference({ candidate });
    const result = compilePathQualificationCandidate({ capture: capturePathQualificationCompiler(), candidate });
    assert.equal(result.worlds[0].admitted, true);
    assert.equal(result.worlds[1].admitted, false);
    assert.equal(result.worlds[2].admitted, true);
    assert.equal(result.qualified, false);
    assert.equal(result.semantic_mutation_credit, 0);
});

test('N02G:PATH-V3-020 admission foundations reject caller rules clones reclassification omission and active inputs', async () => {
    const { preparePathQualificationInventory, preparePathQualificationAdmissionDomain,
        verifyPathQualificationAdmissionDomain } = require('../../../src/next/provenance/pathQualificationV3');
    const preparation = preparePathQualificationInventory(await fixture());
    let rowIndex = 0, domain;
    for (; rowIndex < preparation.rows.length; rowIndex++) {
        domain = preparePathQualificationAdmissionDomain({ preparation, rowIndex });
        if (domain.sites.some(site => site.excluded.length)) break;
    }
    assert.ok(rowIndex < preparation.rows.length);
    assert.equal(verifyPathQualificationAdmissionDomain({ domain, candidate: structuredClone(domain) }).foundation_integrity, true);
    const siteIndex = domain.sites.findIndex(site => site.excluded.length);
    for (const mutate of [x => x.sites[siteIndex].excluded.pop(),
        x => x.sites[siteIndex].excluded[0].locator_index = -1,
        x => x.sites[siteIndex].excluded[0].compiler_barrier_verified = true,
        x => x.sites[siteIndex].excluded[0].rule.id = 'caller_rule',
        x => x.sites[siteIndex].admitted_locator_indices = [0],
        x => x.qualified = true]) {
        const candidate = structuredClone(domain); mutate(candidate);
        assert.throws(() => verifyPathQualificationAdmissionDomain({ domain, candidate }));
    }
    assert.throws(() => verifyPathQualificationAdmissionDomain({ domain: structuredClone(domain), candidate: domain }));
    assert.throws(() => preparePathQualificationAdmissionDomain({ preparation, rowIndex, rules: [] }));
    let effects = 0;
    const active = { preparation };
    Object.defineProperty(active, 'rowIndex', { enumerable: true, get() { effects++; return rowIndex; } });
    assert.throws(() => preparePathQualificationAdmissionDomain(active));
    assert.throws(() => preparePathQualificationAdmissionDomain({ preparation,
        rowIndex: { valueOf() { effects++; return rowIndex; } } }));
    assert.throws(() => preparePathQualificationAdmissionDomain(new Proxy({ preparation, rowIndex }, { ownKeys() { effects++; return []; } })));
    const candidate = structuredClone(domain);
    Object.defineProperty(candidate.sites[siteIndex].excluded[0], 'rule', { enumerable: true, get() { effects++; return {}; } });
    assert.throws(() => verifyPathQualificationAdmissionDomain({ domain, candidate }));
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-001 preparation preserves every v2 target and authored site without semantic credit', async () => {
    const { preparePathQualificationInventory } = require('../../../src/next/provenance/pathQualificationV3');
    const { enumeratePathInventoryCandidate } = require('../../../src/next/provenance/pathMutationInventory');
    const input = await fixture();
    const previous = enumeratePathInventoryCandidate(input);
    const expected = previous.requirements.filter(row => row.family === 'predicate_path_semantic');
    const result = preparePathQualificationInventory(input);
    assert.deepEqual(result.rows.map(row => row.target_id), expected.map(row => row.mutation_id));
    for (const row of result.rows) {
        const sites = previous.sites.filter(site => site.class === 'path'
            && site.fact_key === row.target.fact_key && site.predicate_id === row.target.predicate_id);
        assert.deepEqual(row.sites.map(site => site.authored_site), sites);
        assert.equal(row.status, 'blocked');
        assert.equal(row.semantic_mutation_credit, 0);
        assert.equal(row.dp_execution, false);
    }
    assert.equal(result.verified, 0);
    assert.equal(result.global_g11, false);
    assert.equal(result.activated, false);
});

test('N02G:PATH-V3-002 exact migration rejects omissions, duplicates, redirected targets and forged proof flags', async () => {
    const { preparePathQualificationInventory, verifyPathQualificationInventory } = require('../../../src/next/provenance/pathQualificationV3');
    const prepared = preparePathQualificationInventory(await fixture());
    assert.equal(verifyPathQualificationInventory({ preparation: prepared, candidate: prepared }).verified, false);
    for (const mutate of [copy => copy.rows.pop(), copy => copy.rows[0] = copy.rows[1],
        copy => copy.rows[0].target.predicate_id += '_forged', copy => copy.rows[0].sites.pop(),
        copy => copy.rows[0].semantic_mutation_credit = 1, copy => copy.rows[0].status = 'verified',
        copy => copy.rows[0].disposition = 'static_domain_proof', copy => copy.verified = copy.rows.length,
        copy => copy.rows.find(row => row.sites.some(site => site.domain?.locators.length))
            .sites.find(site => site.domain?.locators.length).domain.locators.pop()]) {
        const candidate = structuredClone(prepared); mutate(candidate);
        assert.throws(() => verifyPathQualificationInventory({ preparation: prepared, candidate }));
    }
    assert.throws(() => verifyPathQualificationInventory({ preparation: structuredClone(prepared), candidate: prepared }));
});

test('N02G:PATH-V3-003 preparations and reconciliations never execute getters, proxies or caller coercion', async () => {
    const { preparePathQualificationInventory, verifyPathQualificationInventory } = require('../../../src/next/provenance/pathQualificationV3');
    const input = await fixture();
    const preparation = preparePathQualificationInventory(input);
    let effects = 0;
    const active = {};
    Object.defineProperty(active, 'packageReceipt', { enumerable: true, get() { effects++; return input.packageReceipt; } });
    Object.defineProperty(active, 'ir', { enumerable: true, value: input.ir });
    assert.throws(() => preparePathQualificationInventory(active));
    assert.throws(() => preparePathQualificationInventory(new Proxy(input, { ownKeys() { effects++; return []; } })));
    const candidate = structuredClone(preparation);
    Object.defineProperty(candidate.rows[0], 'status', { enumerable: true, get() { effects++; return 'verified'; } });
    assert.throws(() => verifyPathQualificationInventory({ preparation, candidate }));
    assert.throws(() => verifyPathQualificationInventory({ preparation, candidate: new Proxy({}, { ownKeys() { effects++; return []; } }) }));
    assert.equal(effects, 0);
});

test('N02G:PATH-V3-004 locator domains retain equal-value anchors and every same nominal registry field before admission filtering', async () => {
    const { preparePathQualificationInventory } = require('../../../src/next/provenance/pathQualificationV3');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const input = await fixture();
    const docs = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = docs.get('docs/contracts/next/provenance-v2/graphs-v2.json');
    const registry = docs.get(corpus.material_registry.path);
    const prepared = preparePathQualificationInventory(input);
    let checked = 0;
    for (const row of prepared.rows) for (const site of row.sites) {
        assert.equal(site.admitted_domain_complete, false);
        if (!site.domain_complete) {
            assert.equal(site.domain, null);
            assert.equal(typeof site.domain_reason, 'string');
            assert.equal(row.status, 'blocked');
            continue;
        }
        const domain = site.domain;
        assert.equal(new Set(domain.locators.map(locator => JSON.stringify(locator))).size, domain.locators.length);
        if (domain.namespace !== 'material' || domain.original_nominal.type !== 'money_minor'
            || domain.original_nominal.form !== 'scalar' || site.authored_site.definition !== 'fieldPath') continue;
        const graph = corpus.graphs.find(graph => graph.fact_key === row.target.fact_key);
        const kind = graph.nodes[domain.original.node].kind;
        const fields = Object.entries(registry.kinds[kind].fields).filter(([, field]) => field.type === 'money_minor').map(([name]) => name).sort();
        const expected = Object.entries(graph.nodes).filter(([, node]) => node.kind === kind)
            .flatMap(([node]) => fields.map(field => ({ node, segments: [field] })))
            .filter(locator => JSON.stringify(locator) !== JSON.stringify(domain.original));
        const normalized = rows => rows.map(row => JSON.stringify(row)).sort();
        assert.deepEqual(normalized(domain.locators), normalized(expected));
        checked++;
    }
    assert.ok(checked > 0);
});

test('N02G:PATH-V3-005 optional declared claim locators do not disappear merely because absent in current authorship', async () => {
    const { createLocatorDomainEnumeration } = require('../../../src/next/provenance/pathLocatorDomainV3');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const input = await fixture();
    const docs = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = docs.get('docs/contracts/next/provenance-v2/graphs-v2.json');
    const claims = new Map(docs.get(corpus.claim_contract.path).claims.map(row => [row.fact_key, row]));
    const enumeration = createLocatorDomainEnumeration(input.packageReceipt);
    let checked = 0;
    for (const [factKey, claim] of claims) {
        if (Object.hasOwn(claim, 'filters')) continue;
        const locators = enumeration.enumerateClaimLocators(factKey);
        assert.ok(locators.some(locator => JSON.stringify(locator.segments) === '["filters"]'));
        assert.ok(locators.some(locator => JSON.stringify(locator.segments) === '["filters","budget_class"]'));
        checked++;
    }
    assert.ok(checked > 0);
});

test('N02G:PATH-V3-006 the domain boundary rejects active targets and sites without evaluating them', async () => {
    const { createLocatorDomainEnumeration } = require('../../../src/next/provenance/pathLocatorDomainV3');
    const { preparePathQualificationInventory } = require('../../../src/next/provenance/pathQualificationV3');
    const input = await fixture();
    const enumeration = createLocatorDomainEnumeration(input.packageReceipt);
    const row = preparePathQualificationInventory(input).rows[0];
    let effects = 0;
    const target = structuredClone(row.target);
    Object.defineProperty(target, 'fact_key', { enumerable: true, get() { effects++; return row.target.fact_key; } });
    assert.throws(() => enumeration.enumerateSite(target, row.sites[0].authored_site));
    assert.throws(() => enumeration.enumerateSite(row.target, new Proxy({}, { ownKeys() { effects++; return []; } })));
    assert.throws(() => enumeration.enumerateClaimLocators({ toString() { effects++; return row.target.fact_key; } }));
    assert.equal(effects, 0);
});
