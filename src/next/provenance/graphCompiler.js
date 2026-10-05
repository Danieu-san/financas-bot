'use strict';

const { admittedDocuments } = require('./packageContract');
const { digest, canonicalValue } = require('../kernel/canonicalValue');
const { validateGraphStructure, validateQualificationGraphStructure } = require('./graphStructure');
const { validateTemplateReferences } = require('./templateReferences');
const { compilePredicateTypes, compileQualificationPredicateTypes } = require('./predicateTypes');
const { validateSchemaRegistryProjection } = require('./schemaRegistryProjection');
const { validateObligationBindings } = require('./obligationBindings');
const { compileOperandBindings } = require('./operandBindings');
const { validateClaimRequirements, validateQualificationClaimRequirements } = require('./claimRequirements');
const { validateSelectionBindings } = require('./selectionBindings');
const { lowerAuthoringIR } = require('./authoringIR');
const { validateCollectionRequirements } = require('./collectionRequirements');
const { createInstrumentedAccess, createNodeSetAccess, createDerivedParentAccess } = require('./instrumentedAccess');
const { resolveLedgerParent } = require('./claimBinding');
const { resolveExecutionEvaluator } = require('./executionRegistry');
const { copyData, identifier } = require('./observationContract');
const { projectClaimContext } = require('./claimContext');
const { types } = require('node:util');
const { resolvePhaseCompositionMode, phaseCompositionCommitment, validatePhaseArtifactInputs } = require('./phaseCompositionProfile');
const { freezeContents, resolveFrozenProofRoot } = require('./freezeContract');
const { proofProgramIdentity } = require('./phaseProgramIdentity');
const { prepareClaimMonthPathTransport, assertClaimMonthPathTransport } = require('./claimMonthPathProfile');
const monthQualifications = new WeakMap();
const monthCompilations = new WeakMap();
const GRAPH_PATH = 'docs/contracts/next/provenance-v2/graphs-v2.json';

function fail(code) { throw new Error(`graph_index_${code}`); }
function text(value) {
    if (typeof value !== 'string' || !value.length) fail('identity_invalid');
    return value;
}
function list(value) {
    if (!Array.isArray(value)) fail('shape_invalid');
    return value;
}
function object(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('shape_invalid');
    return value;
}
function unique(items, key) {
    const result = new Map();
    for (const item of list(items)) {
        const id = text(key(item));
        if (result.has(id)) fail('duplicate');
        result.set(id, item);
    }
    return result;
}
function equalSet(actual, expected) {
    if (actual.size !== expected.size || [...actual.keys()].some(key => !expected.has(key))) {
        fail('inventory_mismatch');
    }
}
function evaluatorKey(ref) {
    object(ref);
    if (!Number.isSafeInteger(ref.evaluator_version) || ref.evaluator_version < 1) fail('evaluator_invalid');
    return JSON.stringify([text(ref.evaluator_id), ref.evaluator_version]);
}
function freeze(value) {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value)) freeze(child);
        Object.freeze(value);
    }
    return value;
}

/**
 * First compiler pass only: identity index and static parent dependency graph.
 * Input document schemas, operators, snapshots and proof obligations must still
 * be validated by later passes. This result is deliberately not executable IR.
 */
function indexGraphDependencies({ graphs, claims, evaluators, expectedFactKeys }) {
    const expected = unique(expectedFactKeys, key => key);
    if (!expected.size) fail('inventory_mismatch');
    const graphMap = unique(graphs, graph => object(graph).fact_key);
    const claimMap = unique(claims, claim => object(claim).fact_key);
    unique(claims, claim => claim.claim_id);
    unique(graphs, graph => graph.claim_id);
    const evaluatorMap = unique(evaluators, evaluatorKey);
    equalSet(graphMap, expected);
    equalSet(claimMap, expected);

    const rows = [];
    for (const fact_key of [...expected.keys()].sort()) {
        const graph = graphMap.get(fact_key);
        const claim = claimMap.get(fact_key);
        if (graph.claim_id !== claim.claim_id) fail('claim_mismatch');
        const evaluator = evaluatorMap.get(evaluatorKey(claim.evaluator_ref));
        if (!evaluator) fail('evaluator_missing');
        if (claim.metric !== evaluator.metric || claim.unit !== evaluator.unit) fail('evaluator_mismatch');
        const roles = unique(evaluator.roles, role => object(role).role_id);
        const bindings = object(claim.operand_bindings);
        equalSet(new Map(Object.keys(bindings).map(key => [key, true])), roles);
        const nodes = object(graph.nodes);
        if (Object.hasOwn(nodes, 'claim')) fail('reserved_node_alias');
        unique(graph.edges, edge => object(edge).id);
        const parentNodes = Object.entries(nodes).filter(([, node]) => object(node).binding === 'validated_parent');
        for (const [, node] of parentNodes) {
            if (node.kind !== 'derived_claim'
                || node.identity_resolution !== 'same_execution_validated_parent_receipt'
                || !graphMap.has(node.fact_key)) fail('parent_invalid');
        }
        const derivedEdges = graph.edges.filter(edge => edge.relation === 'derived_from');
        const usedEdges = new Set();
        const usedNodes = new Set();
        const parents = [];
        for (const role of roles.keys()) {
            const binding = object(bindings[role]);
            if (binding.kind !== 'parent_claim') continue;
            if (!graphMap.has(binding.fact_key)) fail('parent_missing');
            const candidates = derivedEdges.filter(edge => edge.source === 'claim' && edge.field === role);
            if (candidates.length !== 1) fail('parent_edge_mismatch');
            const edge = candidates[0];
            const node = nodes[edge.target];
            if (!Object.hasOwn(nodes, edge.target) || node.binding !== 'validated_parent'
                || node.fact_key !== binding.fact_key) fail('parent_binding_mismatch');
            usedEdges.add(edge.id);
            usedNodes.add(edge.target);
            parents.push({ role, fact_key: binding.fact_key, alias: edge.target });
        }
        if (usedEdges.size !== derivedEdges.length || usedNodes.size !== parentNodes.length) fail('parent_extra');
        rows.push({ fact_key, claim_id: claim.claim_id,
            evaluator_ref: { evaluator_id: evaluator.evaluator_id, evaluator_version: evaluator.evaluator_version }, parents });
    }

    // DFS follows registry role order; independent of input document ordering.
    const byKey = new Map(rows.map(row => [row.fact_key, row]));
    const active = new Set();
    const visited = new Set();
    const order = [];
    function visit(key) {
        if (active.has(key)) fail('cycle');
        if (visited.has(key)) return;
        active.add(key);
        for (const parent of byKey.get(key).parents) visit(parent.fact_key);
        active.delete(key);
        visited.add(key);
        order.push(key);
    }
    for (const key of byKey.keys()) visit(key);
    return freeze({ stage: 'indexed_authoring_only', evaluatorCount: evaluatorMap.size, graphs: rows, order });
}

/** Shared admission/compile pipeline. Neither public view is proof approval. */
function compileAuthoring(admitted, validators, qualification = null) {
    const documents = new Map(admittedDocuments(admitted).map(document => [document.path, document]));
    function document(path, expectedHash) {
        const value = documents.get(path);
        if (!value) fail('authority_missing');
        if (expectedHash !== undefined && value.sha256 !== expectedHash) fail('authority_hash');
        return value.value;
    }
    function validate(name, value) {
        if (typeof validators?.[name] !== 'function' || validators[name](value) !== true) fail(`schema_${name}`);
    }
    const graphs = document('docs/contracts/next/provenance-v2/graphs-v2.json');
    validate('graphs', graphs);
    if (graphs.stage !== 'authoring') fail('stage_invalid');
    const resolved = {};
    for (const key of ['claim_contract', 'snapshot_manifest', 'material_registry', 'operator_registry', 'metric_evaluator_registry']) {
        resolved[key] = document(graphs[key].path, graphs[key].hash);
    }
    const claims = resolved.claim_contract;
    const registry = resolved.metric_evaluator_registry;
    const claimSchema = document('docs/contracts/next/provenance-v2/claim-contract.schema.json');
    validateSchemaRegistryProjection({ registry: resolved.material_registry, claimSchema,
        snapshotSchema: document('docs/contracts/next/provenance-v2/evidence-snapshot.schema.json') });
    validate('claims', claims);
    validate('registry', registry);
    if (registry.stage !== 'authoring') fail('stage_invalid');
    const contracts = registry.entries.map(entry => {
        const value = document(entry.contract_path, entry.evaluator_contract_hash);
        validate('evaluator', value);
        return { path: entry.contract_path, value };
    });
    const snapshots = resolved.snapshot_manifest;
    if (snapshots.stage !== 'authoring') fail('stage_invalid');
    for (const source of list(snapshots.sources)) document(source.path, source.sha256);
    unique(snapshots.snapshots, snapshot => JSON.stringify([text(snapshot.kind), text(snapshot.ref_id), text(snapshot.version)]));
    for (const snapshot of snapshots.snapshots) {
        const { ref_id, kind, version, payload } = snapshot;
        validate('snapshot', { ref_id, kind, version, payload });
        if (payload.id !== ref_id) fail('snapshot_identity');
    }
    validateStaticEvidence(graphs.graphs, snapshots.snapshots, resolved.material_registry);
    for (const graph of graphs.graphs) for (const source of graph.authoring_sources) document(source.path);
    const original = document('tests/fixtures/financasbot-next/golden-fact-contracts-v1.json');
    const expectedFactKeys = Object.values(object(original.turns)).flatMap(turn => list(turn).map(fact => fact.fact_key));
    const index = indexGraphDependencies({ graphs: graphs.graphs, claims: claims.claims,
        evaluators: registry.entries, expectedFactKeys });
    const operandBindings = compileOperandBindings({ graphs: graphs.graphs, claims: claims.claims, evaluators: registry.entries, contracts });
    const structureInput = { graphs: graphs.graphs, claims: claims.claims,
        materialRegistry: resolved.material_registry, operatorRegistry: resolved.operator_registry };
    if (qualification) validateQualificationGraphStructure(structureInput, qualification.transport, qualification.variant);
    else validateGraphStructure(structureInput);
    const templates = document('docs/contracts/next/provenance-v2/predicate-templates-v1.json');
    validateTemplateReferences({ graphs: graphs.graphs, operators: resolved.operator_registry.operators,
        templates,
        materialRegistry: resolved.material_registry, claims: claims.claims });
    const typeInput = { graphs: graphs.graphs, claims: claims.claims, snapshots: snapshots.snapshots,
        materialRegistry: resolved.material_registry, operatorRegistry: resolved.operator_registry,
        claimSchema };
    const predicateTypes = qualification
        ? compileQualificationPredicateTypes(typeInput, qualification.transport, qualification.variant)
        : compilePredicateTypes(typeInput);
    validateObligationBindings({ graphs: graphs.graphs, snapshots: snapshots.snapshots,
        materialRegistry: resolved.material_registry });
    if (qualification) validateQualificationClaimRequirements({ graphs: graphs.graphs, claims: claims.claims,
        transport: qualification.transport, variant: qualification.variant });
    else validateClaimRequirements({ graphs: graphs.graphs, claims: claims.claims });
    const selectionBindings = validateSelectionBindings({ graphs: graphs.graphs, claims: claims.claims,
        materialRegistry: resolved.material_registry });
    validateCollectionRequirements({ graphs: graphs.graphs, snapshots: snapshots.snapshots,
        materialRegistry: resolved.material_registry });
    return { documents: [...documents.values()], graphs: graphs.graphs, claims: claims.claims,
        index, operandBindings, predicateTypes, selectionBindings, templates,
        snapshots: snapshots.snapshots, materialRegistry: resolved.material_registry, claimSchema };
}

function compileAuthoringIndex(admitted, validators) {
    return compileAuthoring(admitted, validators).index;
}

function compileAuthoringIR(admitted, validators) {
    return lowerAuthoringIR(compileAuthoring(admitted, validators));
}

// Host-only preparation. Full normal C compilation precedes any certificate;
// expected target lowering is derived from authorship + fixed profile grammar,
// before the compiler observes M. No runtime or financial authority is issued.
function prepareClaimMonthQualification(admitted, validators, target) {
    const selected = copyData(target);
    if (Object.keys(selected).sort().join(',') !== 'fact_key,predicate_id') fail('month_qualification_target');
    const baseline = compileAuthoring(admitted, validators);
    if (Object.hasOwn(baseline.claimSchema.definitions.claim.properties, 'qualification')) fail('month_qualification_reserved');
    const transport = prepareClaimMonthPathTransport({ graphs: baseline.graphs, claims: baseline.claims,
        fact_key: selected.fact_key, predicate_id: selected.predicate_id });
    const graph = baseline.graphs.find(g => g.fact_key === selected.fact_key);
    const predicate = graph.predicates.find(p => p.id === selected.predicate_id);
    function expectedSite(segments) {
        return { id: predicate.id, op: predicate.op, atom: predicate.atom, obligation: predicate.obligation,
            operands: [ { type: { form: 'period', periodKind: 'month' }, expression: { kind: 'claim_ref', segments } },
                { type: { form: 'period', periodKind: 'month' }, expression: { kind: 'period_literal', period: structuredClone(predicate.args[1].period_literal) } } ] };
    }
    const expected = freeze({ C: expectedSite(['period']), M: expectedSite(['qualification', 'alternative_period']) });
    const baselineIR = lowerAuthoringIR(baseline);
    const receipt = freeze({ stage: 'claim_month_qualification_prepared_only', profile: transport.profile,
        target: { ...selected }, transport, expected_conformance: expected,
        expected_conformance_hash: digest(expected), profile_witness_qualified: false,
        financial_release_eligible: false });
    const documents = new Map(baseline.documents.map(row => [row.path, row]));
    monthQualifications.set(receipt, { baseline, baselineIR, documents, transport, expected, target: receipt.target });
    verifyClaimMonthQualificationConformance(receipt, baselineIR, 'C');
    return receipt;
}

function verifyClaimMonthQualificationConformance(preparation, ir, variant = 'M') {
    const authority = monthQualifications.get(preparation);
    if (!authority) fail('month_qualification_authority');
    if (!['C', 'M', 'S'].includes(variant)) fail('month_qualification_variant');
    // Passive per-graph projection avoids accepting guest accessors or an IR
    // self-declared site map; inventory comes from the original authored graph.
    if (!ir || typeof ir !== 'object' || types.isProxy(ir)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(ir))) fail('month_qualification_conformance');
    const graphProperty = Object.getOwnPropertyDescriptor(ir, 'graphs');
    if (!graphProperty?.enumerable || !Object.hasOwn(graphProperty, 'value')) fail('month_qualification_conformance');
    const sourceGraphs = graphProperty.value;
    if (!Array.isArray(sourceGraphs) || types.isProxy(sourceGraphs)) fail('month_qualification_conformance');
    const descriptors = Object.getOwnPropertyDescriptors(sourceGraphs);
    const count = descriptors.length.value;
    if (count !== authority.baseline.graphs.length || Reflect.ownKeys(descriptors).length !== count + 1) fail('month_qualification_conformance');
    const graphs = [];
    for (let index = 0; index < count; index++) {
        const item = descriptors[index];
        if (!item?.enumerable || !Object.hasOwn(item, 'value')) fail('month_qualification_conformance');
        graphs.push(structuredClone(copyData(item.value)));
    }
    if (graphs.length !== authority.baseline.graphs.length || new Set(graphs.map(g => g.fact_key)).size !== graphs.length) fail('month_qualification_conformance');
    const byKey = new Map(graphs.map(g => [g.fact_key, g]));
    for (const authored of authority.baseline.graphs) {
        const observed = byKey.get(authored.fact_key);
        if (!observed || observed.predicates.length !== authored.predicates.length
            || new Set(observed.predicates.map(p => p.id)).size !== authored.predicates.length
            || observed.predicates.some((p, i) => p.id !== authored.predicates[i].id)) fail('month_qualification_conformance');
    }
    const observed = byKey.get(authority.target.fact_key).predicates.find(p => p.id === authority.target.predicate_id);
    if (canonicalValue(observed) !== canonicalValue(authority.expected[variant === 'M' ? 'M' : 'C'])) fail('month_qualification_conformance');
    // The target expectation above does not use actual IR. Baseline comparison
    // additionally detects every collateral lowering change outside that site.
    const restored = graphs.map(g => g.fact_key === authority.target.fact_key ? { ...g,
        predicates: g.predicates.map(p => p.id === authority.target.predicate_id ? authority.expected.C : p) } : g);
    if (canonicalValue(restored) !== canonicalValue(authority.baselineIR.graphs)) fail('month_qualification_conformance');
    return freeze({ authorship_ir_conformance: true, expected_conformance_hash: preparation.expected_conformance_hash,
        qualification_only: true, profile_witness_qualified: false });
}

function compileClaimMonthQualificationIR(admitted, validators, preparation, variant = 'M') {
    const authority = monthQualifications.get(preparation);
    if (!authority) fail('month_qualification_authority');
    const documents = admittedDocuments(admitted);
    if (documents.length !== authority.documents.size) fail('month_qualification_package');
    for (const row of documents) {
        const original = authority.documents.get(row.path);
        if (!original || row.path !== GRAPH_PATH && row.sha256 !== original.sha256) fail('month_qualification_package');
        if (row.path === GRAPH_PATH) {
            const { graphs, ...envelope } = row.value;
            const { graphs: _originalGraphs, ...originalEnvelope } = original.value;
            if (canonicalValue(envelope) !== canonicalValue(originalEnvelope)) fail('month_qualification_package');
            assertClaimMonthPathTransport({ graphs, claims: authority.baseline.claims, transport: authority.transport, variant });
        }
    }
    // Every compiler pass runs over admitted M, not an injected baseline IR.
    const context = compileAuthoring(admitted, validators, { transport: authority.transport, variant });
    const ir = lowerAuthoringIR(context);
    verifyClaimMonthQualificationConformance(preparation, ir, variant);
    const result = freeze({ stage: 'claim_month_qualification_compiled_only', ir, profile: preparation.profile,
        variant, expected_conformance_hash: preparation.expected_conformance_hash,
        full_mutated_authorship_compiled: variant === 'M', static_target_binding_transported: variant === 'M',
        authorship_ir_conformance: true, profile_witness_qualified: false,
        financial_release_eligible: false, receipt_created: false });
    monthCompilations.set(result, { context, authority, variant });
    return result;
}

const monthIsolatedPlans = new WeakMap();
function prepareClaimMonthIsolatedPlan(compilation) {
    const compiled = monthCompilations.get(compilation);
    if (!compiled) fail('month_qualification_authority');
    const access = compileClaimMonthQualificationAccess(compilation);
    const { target, transport } = compiled.authority;
    const graph = compilation.ir.graphs.find(row => row.fact_key === target.fact_key);
    const core = access.projectProofTransport({ fact_key: target.fact_key }).config.bindings.find(row => row.alias === 'claim/context');
    const data = freeze({ schema_version: 1, profile_id: transport.profile,
        normative_commit: transport.normative_commit, quarantine_origin: 'negative_qualification',
        variant: compiled.variant, fact_key: target.fact_key, predicate_id: target.predicate_id,
        core_context_hash: 'sha256:' + digest(structuredClone(core.value)), proof_ir_hash: 'sha256:' + digest(graph),
        sidecar_hash: 'sha256:' + digest(transport.sidecar), sidecar: structuredClone(transport.sidecar),
        original_period: structuredClone(transport.semantic_reference.original_period),
        predicate_ids: graph.predicates.map(row => row.id) });
    const source = canonicalValue(data);
    const claim = compiled.authority.baseline.claims.find(row => row.fact_key === target.fact_key);
    const registry = compiled.authority.baseline.documents.find(row => row.value?.registry_id === 'metric_evaluator_registry').value;
    const evaluator = registry.entries.find(row => row.evaluator_id === claim.evaluator_ref.evaluator_id
        && row.evaluator_version === claim.evaluator_ref.evaluator_version);
    const receipt = freeze({ stage: 'claim_month_isolated_plan_only', profile: transport.profile,
        descriptor: data, descriptor_hash: 'sha256:' + digest(data),
        profile_witness_qualified: false, financial_release_eligible: false, receipt_created: false });
    monthIsolatedPlans.set(receipt, Object.freeze({ data, source, access, baselineAccess: buildSnapshotAccess(compiled.authority.baseline),
        evaluatorRef: freeze(structuredClone(claim.evaluator_ref)), contractHash: evaluator.evaluator_contract_hash,
        packageAuthority: freeze(compiled.authority.baseline.documents.map(row => ({ path: row.path, sha256: row.sha256 }))
            .sort((a, b) => a.path < b.path ? -1 : 1)) }));
    return receipt;
}

function resolveClaimMonthIsolatedPlan(receipt) {
    const row = monthIsolatedPlans.get(receipt);
    if (!row) fail('month_qualification_authority');
    return row;
}

function assertClaimMonthIsolatedProgram(receipt, raw, phaseProfileReceipt) {
    const row = resolveClaimMonthIsolatedPlan(receipt);
    let input;
    try { input = structuredClone(copyData(raw)); } catch { fail('month_isolation_program'); }
    const selector = { fact_key: row.data.fact_key };
    const expected = { derivation: row.access.projectDerivationProgram(selector, phaseProfileReceipt).input,
        proof: row.access.projectProofProgram(selector).input };
    if (canonicalValue(input) !== canonicalValue(structuredClone(expected))) fail('month_isolation_program');
    return row;
}

const monthLowerings = new WeakMap(); const monthProofRoots = new WeakMap(); const monthFrozenBaselines = new WeakMap();
function admitClaimMonthFrozenBaseline(plan, raw) {
    const row = resolveClaimMonthIsolatedPlan(plan);
    const names = ['phaseProfileReceipt', 'freezeReceipt', 'registryReceipt', 'artifactReceipt'];
    if (!raw || types.isProxy(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('month_frozen_input');
    const fields = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(fields).length !== names.length || names.some(name => !fields[name]?.enumerable
        || !Object.hasOwn(fields[name], 'value'))) fail('month_frozen_input');
    const args = Object.fromEntries(names.map(name => [name, fields[name].value]));
    const authority = freezeContents(args.freezeReceipt);
    const evaluator = resolveExecutionEvaluator(args.registryReceipt, row.evaluatorRef);
    if (canonicalValue(structuredClone(authority.package_authority)) !== canonicalValue(row.packageAuthority)
        || args.registryReceipt.observed_hash !== authority.metric_registry_hash) fail('month_frozen_world');
    if (evaluator.evaluator_contract_hash !== row.contractHash) fail('month_frozen_contract');
    const selector = { fact_key: row.data.fact_key }; const profile = phaseCompositionCommitment(args.phaseProfileReceipt);
    const programId = proofProgramIdentity(row.baselineAccess.projectProofProgram(selector).input,
        row.baselineAccess.projectDerivationProgram(selector, args.phaseProfileReceipt).input, profile.sha256);
    const expectedRoot = resolveFrozenProofRoot(args.freezeReceipt, programId);
    const { artifactContents } = require('./artifactLoader'); const contents = artifactContents(args.artifactReceipt);
    validatePhaseArtifactInputs(contents);
    if (contents.kind !== 'proof' || args.artifactReceipt.observed_root !== expectedRoot
        || contents.files[1].source !== profile.source) fail('month_frozen_root');
    const receipt = freeze({ stage: 'claim_month_frozen_baseline_bytes_only', baseline_root: expectedRoot,
        freeze_hash: args.freezeReceipt.observed_hash, profile_witness_qualified: false,
        financial_release_eligible: false, receipt_created: false });
    monthFrozenBaselines.set(receipt, Object.freeze({ plan, source: contents.files[0].source, freeze: authority,
        freezeHash: args.freezeReceipt.observed_hash, evaluatorRoot: evaluator.evaluator_artifact_root,
        contractHash: evaluator.evaluator_contract_hash }));
    return receipt;
}
function sealClaimMonthIsolatedLowering(plan, baselineSource, baselineReceipt = null) {
    const row = resolveClaimMonthIsolatedPlan(plan);
    const baseline = baselineReceipt === null ? null : monthFrozenBaselines.get(baselineReceipt);
    if (baselineReceipt !== null && (!baseline || baseline.plan !== plan || baseline.source !== baselineSource)) fail('month_frozen_authority');
    const { sealClaimMonthProofExpectation } = require('./claimMonthProofConformance');
    const receipt = sealClaimMonthProofExpectation({ baselineSource, predicateId: row.data.predicate_id,
        predicateIds: row.data.predicate_ids, originalPeriod: row.data.original_period, variant: row.data.variant });
    monthLowerings.set(receipt, { plan, baseline }); return receipt;
}
function admitClaimMonthIsolatedProof(plan, lowering, artifactReceipt) {
    const row = resolveClaimMonthIsolatedPlan(plan);
    const loweringAuthority = monthLowerings.get(lowering);
    if (loweringAuthority?.plan !== plan) fail('month_qualification_authority');
    const { artifactContents } = require('./artifactLoader');
    const { validateClaimMonthArtifact } = require('./claimMonthIsolatedProfile');
    const { verifyClaimMonthProofSource } = require('./claimMonthProofConformance');
    const contents = artifactContents(artifactReceipt);
    validateClaimMonthArtifact(contents, row.source);
    verifyClaimMonthProofSource(lowering, contents.files[0].source);
    const receipt = freeze({ stage: 'claim_month_isolated_artifact_only', observed_root: artifactReceipt.observed_root,
        positive_baseline_frozen: loweringAuthority.baseline !== null,
        profile_witness_qualified: false, financial_release_eligible: false, receipt_created: false });
    monthProofRoots.set(receipt, Object.freeze({ ...row, artifactReceipt, frozenBaseline: loweringAuthority.baseline })); return receipt;
}
function resolveClaimMonthIsolatedProof(receipt) {
    const row = monthProofRoots.get(receipt); if (!row) fail('month_qualification_authority'); return row;
}

function compileClaimMonthQualificationAccess(compilation) {
    const compiled = monthCompilations.get(compilation);
    if (!compiled) fail('month_qualification_authority');
    return buildSnapshotAccess(compiled.context, { transport: compiled.authority.transport,
        target: compiled.authority.target, variant: compiled.variant });
}

// Host/TCB factory only; never endow this controller into a guest compartment.
// No caller-supplied payload, shape, role declaration or identity override.
// openSet admits the initial ordered roster; its handle.select computes new
// views, but neither is approval of graph selection obligations. These methods
// do not authorize validated-parent receipts or claim-context access.
function compileSnapshotAccess(admitted, validators) {
    return buildSnapshotAccess(compileAuthoring(admitted, validators));
}

function buildSnapshotAccess(context, qualification = null) {
    const reject = code => { throw new Error(`snapshot_access_${code}`); };
    const identity = node => JSON.stringify([node.kind, node.ref_id, node.version]);
    const scalarTypes = new Set(['id', 'text', 'date', 'month', 'datetime', 'integer',
        'positive_integer', 'nonnegative_integer', 'money_minor', 'boolean', 'enum', 'digest', 'ref']);
    // Projection follows the already schema-checked finite registry grammar.
    // Nominal validation remains in the shared admission pass, not this layer.
    function project(descriptor) {
        if (descriptor.class === 'non_material') return { type: 'non_material' };
        if (scalarTypes.has(descriptor.type)) return { type: 'scalar' };
        if (descriptor.type === 'ref_list') return { type: 'sequence', item: { type: 'scalar' } };
        if (descriptor.type === 'role_ref_list') return { type: 'sequence', item: {
            type: 'record', fields: { role_id: { type: 'scalar' }, parent_ref: { type: 'scalar' } }
        } };
        // typed_result/typed_period require a separately admitted validated-
        // parent/claim projection. Do not guess shape from caller data.
        reject('unsupported_field_type');
    }
    const snapshots = new Map(context.snapshots.map(snapshot => {
        const descriptors = context.materialRegistry.kinds[snapshot.kind].fields;
        const shape = { type: 'record', fields: Object.fromEntries(Object.entries(descriptors)
            .map(([name, descriptor]) => [name, project(descriptor)])) };
        return [identity(snapshot), { value: snapshot.payload, shape: freeze(shape),
            identity: freeze({ kind: snapshot.kind, ref_id: snapshot.ref_id, version: snapshot.version }) }];
    }));
    const graphs = new Map(context.graphs.map(g => [g.fact_key, g]));
    const indexed = new Map(context.index.graphs.map(row => [row.fact_key, row]));
    const claims = new Map(context.claims.map(claim => [claim.fact_key, claim]));
    const proofIR = new Map(lowerAuthoringIR(context).graphs.map(graph => [graph.fact_key, graph]));
    const contexts = new Map(context.claims.map(claim => [claim.fact_key, projectClaimContext(claim, context.claimSchema)]));
    const bindings = new Map(context.operandBindings.graphs.map(g => [g.fact_key,
        new Map(g.operands.map(b => [b.role_ref.role_id, b]))]));
    function select(selector, emit, set) {
        let selected;
        try { selected = copyData(selector); } catch { reject('selector'); }
        if (!selected || typeof selected !== 'object' || Array.isArray(selected)
            || Object.keys(selected).sort().join(',') !== (set ? 'fact_key,role_id' : 'alias,fact_key,role_id')
            || !Object.values(selected).every(identifier) || typeof emit !== 'function') reject('selector');
        const binding = bindings.get(selected.fact_key)?.get(selected.role_id);
        if (!binding) reject('binding');
        return { ...selected, binding };
    }
    function sourceBinding(fact_key, role, alias) {
        const node = graphs.get(fact_key).nodes[alias];
        const snapshot = snapshots.get(identity(node));
        if (node.binding !== 'snapshot' || !snapshot) reject('snapshot');
        return { alias, role, value: snapshot.value, shape: snapshot.shape, identity: snapshot.identity };
    }
    function reachable(fact_key, role, aliases) {
        const graph = graphs.get(fact_key); const visited = new Set(aliases); const queue = [...aliases]; const links = [];
        for (let i = 0; i < queue.length; i++) {
            for (const edge of graph.edges) {
                if (edge.relation !== 'material_ref' || edge.source !== queue[i]) continue;
                const source = graph.nodes[edge.source]; const target = graph.nodes[edge.target];
                if (source.binding !== 'snapshot' || target.binding !== 'snapshot') reject('traversal_parent_pending');
                const descriptor = context.materialRegistry.kinds[source.kind].fields[edge.field];
                if (descriptor.class !== 'edge') reject('traversal_field');
                links.push({ id: edge.id, source: edge.source, field: edge.field, target: edge.target, type: descriptor.type });
                if (!visited.has(edge.target)) { visited.add(edge.target); queue.push(edge.target); }
            }
        }
        return { bindings: queue.map(node => sourceBinding(fact_key, role, node)), links };
    }
    function capabilityFields(raw, names) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
            || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) reject('parent_transport');
        const descriptors = Object.getOwnPropertyDescriptors(raw);
        if (Reflect.ownKeys(descriptors).length !== names.length || names.some(name =>
            !descriptors[name]?.enumerable || !Object.hasOwn(descriptors[name], 'value'))) reject('parent_transport');
        return Object.fromEntries(names.map(name => [name, descriptors[name].value]));
    }
    const plan = Object.freeze({ stage: qualification ? 'qualification_snapshot_access_plan_only' : 'snapshot_access_plan_only', executable: false,
        ...(qualification ? { financial_release_eligible: false, profile_witness_qualified: false } : {}),
        snapshot_count: snapshots.size,
        projectProofTransport(raw, parentContext) {
            let selector;
            try { selector = copyData(raw); } catch { reject('proof_transport_selector'); }
            if (!selector || Object.keys(selector).join(',') !== 'fact_key' || !identifier(selector.fact_key)) reject('proof_transport_selector');
            const graph = graphs.get(selector.fact_key);
            if (!graph) reject('proof_transport_graph');
            const metricTransport = plan.projectMetricTransport(selector, parentContext);
            const material = reachable(selector.fact_key, 'proof/snapshot', Object.keys(graph.nodes)
                .filter(alias => graph.nodes[alias].binding === 'snapshot'));
            const parentBindings = metricTransport.parentGroups.flatMap(group => group.bindings.map(binding => ({ ...binding, role: 'proof/snapshot' })));
            const targets = new Set(graph.selections.map(selection => selection.selected_set));
            // Selected rosters NEVER enter transport. They can only arise from
            // the guest's observed guards through the admitted selection pair.
            return copyData({ stage: 'isolated_proof_transport_only', graph_accepted: false, config: {
                bindings: [...material.bindings, ...parentBindings,
                    { alias: 'claim/context', role: 'proof/context', ...contexts.get(selector.fact_key) }],
                directLinks: material.links,
                proofParentEdges: metricTransport.parentGroups.flatMap(group => group.edges),
                proofParentMaterials: metricTransport.parentGroups.map(group => {
                    const binding = group.bindings[0];
                    return { edge_id: group.edgeId, descriptor: { registry_version: context.materialRegistry.registry_version,
                        kind: 'derived_claim', fields: context.materialRegistry.kinds.derived_claim.fields },
                        expected_fingerprint: 'sha256:' + digest({ registry_version: context.materialRegistry.registry_version,
                            ...structuredClone(binding.identity), payload: structuredClone(binding.value) }) };
                }),
                proofSets: Object.entries(graph.sets).filter(([name]) => !targets.has(name)).map(([name, roster]) => ({ name, roster })),
                proofSelections: graph.selections.map(({ candidate_set, selected_set }) => ({ candidate_set, selected_set }))
            } });
        },
        // Private BUILD projection after package/schema/IR admission. These
        // are instructions, literals and registry descriptors for lowering,
        // not runtime evidence, raw snapshots, expected trace or acceptance.
        projectProofProgram(raw) {
            let selector;
            try { selector = copyData(raw); } catch { reject('proof_build_selector'); }
            if (!selector || Object.keys(selector).join(',') !== 'fact_key' || !identifier(selector.fact_key)) reject('proof_build_selector');
            const graph = graphs.get(selector.fact_key); const ir = proofIR.get(selector.fact_key);
            if (!graph || !ir) reject('proof_build_graph');
            const registry = context.documents.find(document => document.value?.registry_id === 'operator_registry')?.value;
            if (!registry || !Array.isArray(registry.operators)) reject('proof_build_operator');
            const catalog = new Map(registry.operators.map(operator => [operator.id, operator]));
            const predicates = ir.predicates.map(predicate => {
                const operator = catalog.get(predicate.op);
                if (!operator) reject('proof_build_operator');
                return { id: predicate.id, operator, operands: predicate.operands };
            });
            const materials = Object.fromEntries(Object.entries(graph.nodes).map(([alias, node]) => {
                const descriptor = context.materialRegistry.kinds[node.kind];
                if (!descriptor) reject('proof_build_material');
                return [alias, { registry_version: context.materialRegistry.registry_version, kind: node.kind, fields: descriptor.fields }];
            }));
            const selections = context.selectionBindings.programs.filter(program => program.fact_key === graph.fact_key)
                .map(program => ({ candidate_set: program.candidate_set, selected_set: program.selected_set,
                    cases: program.cases.map(item => ({ ...item, identity: {
                        kind: graph.nodes[item.node].kind, ref_id: graph.nodes[item.node].ref_id,
                        version: graph.nodes[item.node].version } })) }));
            return copyData({ stage: 'proof_build_input_only', graph_accepted: false,
                input: { predicates, windows: ir.windows, materials, operators: registry.operators, selections } });
        },
        // Private host preparation, not graph approval. All inputs come from
        // admitted bindings/snapshots, never the expected trace or oracle.
        projectMetricTransport(raw, parentContext) {
            let selector;
            try { selector = copyData(raw); } catch { reject('transport_selector'); }
            if (!selector || Object.keys(selector).join(',') !== 'fact_key' || !identifier(selector.fact_key)) reject('transport_selector');
            const graph = graphs.get(selector.fact_key); const roles = bindings.get(selector.fact_key);
            if (!graph || !roles) reject('transport_graph');
            const parentRoles = [...roles].filter(([, binding]) => binding.kind === 'parent_claim').map(([role]) => role);
            let parents;
            if (parentRoles.length) {
                parents = capabilityFields(parentContext, ['receiptScope', 'registryReceipt', 'receipts']);
                parents.receipts = capabilityFields(parents.receipts, parentRoles);
            } else if (parentContext !== undefined) reject('parent_transport');
            const directGroups = []; const nodeSets = []; const parentGroups = [];
            for (const [role, binding] of roles) {
                if (binding.kind === 'claim_context') directGroups.push({ role, alias: 'claim/context',
                    bindings: [{ alias: 'claim/context', role, ...contexts.get(selector.fact_key) }], links: [] });
                else if (binding.kind === 'node') {
                    const group = reachable(selector.fact_key, role, [binding.alias]);
                    directGroups.push({ role, alias: binding.alias, bindings: group.bindings, links: group.links });
                } else if (binding.kind === 'node_set') {
                    const group = reachable(selector.fact_key, role, binding.aliases);
                    nodeSets.push({ role, bindings: group.bindings, roster: binding.aliases, links: group.links });
                } else if (binding.kind === 'parent_claim') {
                    const opened = plan.openDerivedRole({ fact_key: selector.fact_key, role_id: role, phase: 'derivation' },
                        parents.receiptScope, parents.receipts[role], parents.registryReceipt, () => {});
                    parentGroups.push(opened.transport);
                    opened.control.revoke();
                } else reject('transport_binding');
            }
            return copyData({ stage: 'snapshot_metric_transport_only', graph_accepted: false,
                fact_key: selector.fact_key, directGroups, nodeSets, parentGroups });
        },
        projectDerivationProgram(raw, phaseProfileReceipt) {
            const projected = plan.projectProofProgram(raw);
            const selector = copyData(raw); const graph = graphs.get(selector.fact_key);
            const claim = claims.get(selector.fact_key);
            const registry = context.documents.find(document => document.value?.registry_id === 'metric_evaluator_registry').value;
            const mode = resolvePhaseCompositionMode(phaseProfileReceipt, registry, claim.evaluator_ref, claim.metric);
            const associations = plan.projectDerivationBindings(raw).selections;
            const ids = new Set((mode === 'formula_plus_selection_guards' ? graph.selections : []).filter(selection => associations.some(row =>
                row.candidate_set === selection.candidate_set && row.selected_set === selection.selected_set)).flatMap(selection =>
                [...selection.selected_predicates, ...selection.excluded.flatMap(row => row.predicates)]));
            const input = copyData({ ...projected.input, selections: [],
                predicates: projected.input.predicates.filter(predicate => ids.has(predicate.id)) });
            if (input.predicates.length !== ids.size) reject('derivation_build_predicate');
            return copyData({ stage: 'derivation_build_input_only', graph_accepted: false, input });
        },
        projectDerivationBindings(raw) {
            // Authored INPUT populations and role associations only. Selected
            // populations are computed by the actual metric handle.select.
            plan.projectProofProgram(raw);
            const graph = graphs.get(copyData(raw).fact_key); const roles = bindings.get(graph.fact_key);
            const targets = new Set(graph.selections.map(selection => selection.selected_set));
            const selections = graph.selections.flatMap(selection => {
                const candidates = graph.sets[selection.candidate_set];
                const matches = [...roles].filter(([, row]) => row.kind === 'node_set'
                    && JSON.stringify(row.aliases) === JSON.stringify(candidates));
                if (matches.length > 1) reject('derivation_selection_binding');
                // A proof-only population need not be a functional operand.
                // Exactly the same role/roster association as the native path.
                if (!matches.length) return [];
                return [{ role: matches[0][0], candidate_set: selection.candidate_set, selected_set: selection.selected_set }];
            });
            return copyData({ sets: Object.entries(graph.sets).filter(([name]) => !targets.has(name))
                .map(([name, aliases]) => ({ name, aliases })), selections });
        },
        // Before handle exposure bind the opaque prior-invocation receipt to
        // this package's full documents and an admitted execution registry.
        // A TCB transport receipt is still NOT a host's completed acceptance.
        openDerivedRole(selector, receiptScope, receipt, registryReceipt, emit) {
            let input;
            try { input = copyData(selector); } catch { reject('parent_selector'); }
            if (!input || Object.keys(input).sort().join(',') !== 'fact_key,phase,role_id'
                || !identifier(input.fact_key) || !identifier(input.role_id)
                || !['derivation', 'proof'].includes(input.phase) || typeof emit !== 'function') reject('parent_selector');
            const graph = graphs.get(input.fact_key); const row = indexed.get(input.fact_key);
            const parent = row?.parents.find(p => p.role === input.role_id);
            if (!graph || !parent) reject('parent_role');
            const parentGraph = graphs.get(parent.fact_key); const parentClaim = claims.get(parent.fact_key);
            if (!parentGraph || !parentClaim || Object.values(parentGraph.nodes).some(n => n.binding !== 'snapshot')
                || parentGraph.edges.some(e => e.relation === 'derived_from')
                || Object.values(parentClaim.operand_bindings).some(b => b.kind === 'parent_claim')) reject('parent_profile');
            const entry = resolveExecutionEvaluator(registryReceipt, parentClaim.evaluator_ref);
            const authoringEntry = context.documents.find(d => d.value?.registry_id === 'metric_evaluator_registry')
                .value.entries.find(e => evaluatorKey(e) === evaluatorKey(parentClaim.evaluator_ref));
            if (!authoringEntry || entry.evaluator_contract_hash !== authoringEntry.evaluator_contract_hash
                || entry.metric !== authoringEntry.metric || entry.unit !== parentClaim.unit
                || digest(entry.roles.map(role => ({ ...role }))) !== digest(authoringEntry.roles)) reject('parent_registry');
            const graphDocument = context.documents.find(d => d.path === 'docs/contracts/next/provenance-v2/graphs-v2.json');
            const projected = resolveLedgerParent(receiptScope, { receipt, fact_key: parent.fact_key,
                claim_id: parentClaim.claim_id, evaluator_version: parentClaim.evaluator_ref.evaluator_version,
                claim_contract_hash: graphDocument.value.claim_contract.hash, graph_contract_hash: graphDocument.sha256,
                metric_registry_hash: registryReceipt.observed_hash });
            const snapshot = projected.snapshot;
            if (snapshot.payload.parents.length !== 0 || snapshot.payload.result.unit !== 'BRL_minor'
                || snapshot.payload.result.kind !== 'money_minor') reject('parent_profile');
            const measured = `sha256:${digest({ registry_version: context.materialRegistry.registry_version,
                kind: snapshot.kind, ref_id: snapshot.ref_id, version: snapshot.version, payload: snapshot.payload })}`;
            if (measured !== projected.semantic_fingerprint) reject('parent_fingerprint');
            const scalar = { type: 'scalar' }; const shape = { type: 'record', fields: {
                id: scalar, fact_key: scalar, evaluator_version: scalar, result_hash: scalar,
                result: { type: 'record', fields: { unit: scalar, kind: scalar, value: scalar } },
                parents: { type: 'sequence', item: { type: 'record', fields: { role_id: scalar, parent_ref: scalar } } } } };
            const role = input.phase === 'derivation' ? input.role_id : 'proof/snapshot';
            const identity = { kind: snapshot.kind, ref_id: snapshot.ref_id, version: snapshot.version };
            const edges = graph.edges.filter(e => e.relation === 'derived_from' && e.source === 'claim'
                && e.field === input.role_id && e.target === parent.alias);
            if (edges.length !== 1) reject('parent_binding');
            const transport = copyData({ role, alias: parent.alias, edgeId: edges[0].id,
                bindings: [{ alias: parent.alias, role, value: snapshot.payload, shape, identity }],
                edges: edges.map(({ id, source, field, target, relation }) => ({ id, source, field, target, relation })) });
            const control = createDerivedParentAccess({ phase: input.phase, emit,
                bindings: transport.bindings, edges: transport.edges });
            return Object.freeze({ control, resultHash: projected.result_hash,
                expectedFingerprint: projected.semantic_fingerprint,
                accessBinding: freeze({ alias: parent.alias, role, identity, records: [[], ['result']] }), transport });
        },
        // TCB-only local composition of functional operands and the authored
        // derivation selection. Never endow the controller/scope into a guest.
        // This does not admit execution artifacts, proof or a financial graph.
        openMetricInvocation(raw, emit) {
            let input;
            try { input = copyData(raw); } catch { reject('metric_selector'); }
            if (!input || Object.keys(input).join(',') !== 'fact_key'
                || !identifier(input.fact_key) || typeof emit !== 'function') reject('metric_selector');
            const graph = graphs.get(input.fact_key); const roles = bindings.get(input.fact_key);
            if (!graph || !roles) reject('metric_graph');
            const ir = proofIR.get(input.fact_key);
            const operators = context.documents.find(doc => doc.value?.registry_id === 'operator_registry').value.operators;
            const { evaluateObservedSelectionOperator } = require('./proofOperators');
            const controls = []; const operands = {}; const nodes = new Map(); const sets = new Map();
            const selected = new Map(); const selections = [];
            let failed = false; let revoked = false; let verified = false;
            const invalid = code => { failed = true; reject(code); };
            const healthy = () => {
                if (failed || revoked) reject('metric_closed');
                for (const control of controls) control.assertHealthy();
            };
            const observe = event => { healthy(); emit(event); healthy(); };
            let claimHandle;
            try {
                for (const [role, binding] of roles) {
                    if (binding.kind === 'claim_context') {
                        const control = createInstrumentedAccess({ bindings: [{ alias: 'claim/context', role,
                            ...contexts.get(input.fact_key) }], emit: observe });
                        controls.push(control); claimHandle = control.handle('claim/context'); operands[role] = claimHandle;
                    } else if (['node', 'node_set'].includes(binding.kind)) {
                        const aliases = binding.kind === 'node' ? [binding.alias] : binding.aliases;
                        const group = reachable(input.fact_key, role, aliases);
                        const access = createInstrumentedAccess({ ...group, emit: observe }); controls.push(access);
                        for (const node of group.bindings) if (!nodes.has(node.alias)) nodes.set(node.alias, access.handle(node.alias));
                        if (binding.kind === 'node') operands[role] = access.handle(binding.alias);
                        else {
                            const control = createNodeSetAccess({ ...group, role, roster: aliases, emit: observe }); controls.push(control);
                            const matches = graph.selections.filter(selection =>
                                JSON.stringify(graph.sets[selection.candidate_set]) === JSON.stringify(aliases));
                            // No selected set is supplied from expected or authored membership.
                            // It becomes accessible only from a real handle.select computation.
                            operands[role] = Object.freeze(Object.create(control.handle, { select: { value: predicate => {
                                healthy();
                                if (matches.some(selection => selected.has(selection.selected_set))) invalid('metric_selection_replay');
                                const result = control.handle.select(predicate); healthy();
                                for (const selection of matches) selected.set(selection.selected_set, result);
                                return result;
                            } } }));
                            for (const selection of matches) {
                                sets.set(selection.candidate_set, control.handle);
                                selections.push(selection);
                            }
                        }
                    } else invalid('metric_parent_pending');
                }
                if (new Set(selections.map(selection => selection.selected_set)).size !== selections.length)
                    invalid('metric_selection_binding');
            } catch (error) { failed = true; for (const control of controls) control.revoke(); throw error; }
            const scope = Object.freeze({
                node(alias) { healthy(); if (!nodes.has(alias)) invalid('metric_predicate_node'); return nodes.get(alias); },
                claim() { healthy(); if (!claimHandle) invalid('metric_predicate_claim'); return claimHandle; },
                set(name) {
                    healthy();
                    if (selected.has(name)) return selected.get(name);
                    if (selections.some(selection => selection.selected_set === name)) invalid('metric_selection_pending');
                    if (sets.has(name)) return sets.get(name);
                    // Non-selected authored sets are static input populations,
                    // not an expected result. Only already reachable handles.
                    if (!Object.hasOwn(graph.sets, name)) invalid('metric_predicate_set');
                    const members = graph.sets[name].map(alias => {
                        if (!nodes.has(alias)) invalid('metric_predicate_set'); return nodes.get(alias);
                    });
                    return Object.freeze({ length: () => { healthy(); return members.length; }, at: index => {
                        healthy();
                        if (!Number.isSafeInteger(index) || index < 0 || index >= members.length) invalid('metric_predicate_index');
                        return members[index];
                    }, [Symbol.iterator]() {
                        healthy(); let index = 0; let closed = false;
                        return Object.freeze({ next() {
                            healthy();
                            if (closed || index === members.length) {
                                closed = true; return { value: undefined, done: true };
                            }
                            return { value: members[index++], done: false };
                        }, return() {
                            healthy(); closed = true; return { value: undefined, done: true };
                        }, [Symbol.iterator]() { healthy(); return this; } });
                    } });
                },
                window(name) { healthy(); if (!Object.hasOwn(ir.windows, name)) invalid('metric_predicate_window'); return ir.windows[name]; },
                operator(id) { healthy(); const op = operators.find(row => row.id === id); if (!op) invalid('metric_predicate_operator'); return op; },
                fieldDescriptor(kind, segments) {
                    healthy(); const fields = context.materialRegistry.kinds[kind]?.fields;
                    if (!Array.isArray(segments) || segments.length !== 1 || !fields
                        || !Object.hasOwn(fields, segments[0]) || fields[segments[0]].class === 'non_material') invalid('metric_predicate_field');
                    return fields[segments[0]];
                },
                edge(id) {
                    healthy(); const edge = graph.edges.find(row => row.id === id && row.relation === 'material_ref');
                    if (!edge || !nodes.has(edge.source)) invalid('metric_predicate_edge');
                    return nodes.get(edge.source).traverse(id);
                },
                edgeTargetInSet(id, name) {
                    healthy();
                    const edge = graph.edges.find(row => row.id === id && row.relation === 'material_ref');
                    if (!edge || !nodes.has(edge.source) || !Object.hasOwn(graph.sets, name)
                        || graph.selections.some(selection => selection.selected_set === name)) invalid('metric_nominal_membership');
                    // Admission binds this exact edge to its versioned target;
                    // static input-set aliases have unique admitted identities.
                    // Merely resolving a relation does not consume its target.
                    nodes.get(edge.source).traverse(id); healthy();
                    return graph.sets[name].includes(edge.target);
                }
            });
            return Object.freeze({ operands: Object.freeze(operands),
                observeSelectionPredicates() {
                    healthy(); if (verified) invalid('metric_selection_replay');
                    try {
                        for (const selection of selections) {
                            if (!selected.has(selection.selected_set)) invalid('metric_selection_pending');
                            const ids = [...selection.selected_predicates, ...selection.excluded.flatMap(row => row.predicates)];
                            // Do not short-circuit: each authored predicate has a causal observation obligation.
                            for (const id of new Set(ids)) {
                                const predicate = ir.predicates.find(row => row.id === id);
                                if (!predicate || !evaluateObservedSelectionOperator(scope.operator(predicate.op), predicate.operands, scope))
                                    invalid('metric_selection_predicate');
                            }
                        }
                        verified = true;
                        return Object.freeze({ stage: 'observed_derivation_selection_only', graph_accepted: false });
                    } catch (error) { failed = true; throw error; }
                },
                assertHealthy: healthy,
                revoke() { revoked = true; for (const control of controls) control.revoke(); }
            });
        },
        observationMetadata(selector, parentContext) {
            let input;
            try { input = copyData(selector); } catch { reject('metadata_selector'); }
            if (!input || Object.keys(input).sort().join(',') !== 'fact_key,phase' || !identifier(input.fact_key)
                || !['derivation', 'proof'].includes(input.phase)) reject('metadata_selector');
            const graph = graphs.get(input.fact_key);
            if (!graph) reject('metadata_graph');
            const sources = [];
            if (input.phase === 'derivation') {
                const transport = plan.projectMetricTransport({ fact_key: input.fact_key }, parentContext);
                sources.push(...[...transport.directGroups, ...transport.nodeSets, ...transport.parentGroups]
                    .flatMap(group => group.bindings));
            } else {
                const transport = plan.projectMetricTransport({ fact_key: input.fact_key }, parentContext);
                const primary = Object.keys(graph.nodes).filter(alias => graph.nodes[alias].binding === 'snapshot');
                const nodes = [...reachable(input.fact_key, 'proof/snapshot', primary).bindings,
                    ...transport.parentGroups.flatMap(group => group.bindings.map(binding => ({ ...binding, role: 'proof/snapshot' })))];
                sources.push(...nodes, { alias: 'claim/context', role: 'proof/context', ...contexts.get(input.fact_key) });
                const selected = new Set(graph.selections.map(selection => selection.selected_set));
                for (const name of Object.keys(graph.sets).filter(name => !selected.has(name))) {
                    sources.push(...nodes.map(binding => ({ ...binding, role: `proof/set/${name}` })));
                }
            }
            // Metadata follows the SAME admitted shapes, presence and reachability
            // used by the access factories. Never infer it from a trace or expose
            // payload values. Record elements inside sequences remain unsupported.
            return copyData(sources.map(binding => {
                const records = [];
                const claimRecords = []; const claimSequences = [];
                function visit(shape, value, path) {
                    if (binding.alias === 'claim/context' && shape.type === 'sequence' && value !== undefined) {
                        if (shape.item.type !== 'scalar') reject('metadata_claim_sequence');
                        claimSequences.push({ path, item_hashes: value.map(item => 'sha256:' + digest(item)) });
                        return;
                    }
                    if (shape.type !== 'record' || value === undefined) return;
                    records.push(path);
                    if (binding.alias === 'claim/context') claimRecords.push({ path, keys: Object.keys(value) });
                    for (const [name, child] of Object.entries(shape.fields)) {
                        if (Object.hasOwn(value, name)) visit(child, value[name], [...path, name]);
                    }
                }
                visit(binding.shape, binding.value, []);
                return { alias: binding.alias, role: binding.role, identity: binding.identity || null, records,
                    ...(binding.alias === 'claim/context' ? { claim_structure: {
                        records: claimRecords, sequences: claimSequences } } : {}) };
            }));
        },
        runProofPredicates(selector, emit, parentContext) {
            const observed = plan.inspectProofPredicates(selector, emit, parentContext);
            if (!observed.satisfied) reject('proof_program_unsatisfied');
            return Object.freeze({ stage: 'observed_proof_predicates_only', graph_accepted: false,
                predicates: observed.results.length, selections: observed.selections });
        },
        inspectProofPredicates(selector, emit, parentContext) {
            // TCB development execution, not the isolated/measured proof root
            // and never graph acceptance. Neither R nor expected_trace is used.
            // A false predicate is diagnostic data; an execution/admission/sink
            // error is still an error, never an inferred semantic violation.
            const access = plan.openProof(selector, emit, parentContext);
            const graph = proofIR.get(selector.fact_key);
            const predicates = new Map(graph.predicates.map(predicate => [predicate.id, predicate]));
            const { evaluateObservedOperator } = require('./proofOperators');
            const programs = context.selectionBindings.programs.filter(program => program.fact_key === graph.fact_key);
            const qualificationObservations = [];
            let activeSite = null;
            let qualificationAccess = null;
            if (qualification?.variant === 'M' && graph.fact_key === qualification.target.fact_key) {
                const core = contexts.get(graph.fact_key);
                const sidecar = qualification.transport.sidecar;
                const view = { value: { ...core.value, qualification: sidecar.qualification }, shape: {
                    type: 'record', fields: { ...core.shape.fields, qualification: { type: 'record', fields: {
                        alternative_period: { type: 'record', fields: { kind: { type: 'scalar' }, value: { type: 'scalar' } } }
                    } } }
                } };
                const role = `proof/qualification/${qualification.target.predicate_id}`;
                qualificationAccess = createInstrumentedAccess({ bindings: [{ alias: 'qualification/context', role, ...view }], emit: tuple => {
                    // Origin/phase/site belong to this native controller and
                    // its active authored dispatch, not a guest-provided map.
                    if (activeSite !== qualification.target.predicate_id || tuple[2] !== 'qualification/context'
                        || tuple[3] !== role || tuple[4][0] !== 'qualification') reject('qualification_observation');
                    qualificationObservations.push(copyData({ origin: 'qualification', phase: 'proof',
                        site: activeSite, role, operation: tuple }));
                    emit(tuple);
                } });
            }
            const evaluate = (id, scope) => {
                const predicate = predicates.get(id);
                if (!predicate) reject('proof_program_predicate');
                activeSite = id;
                try {
                    const targetScope = qualificationAccess && id === qualification.target.predicate_id
                        ? { ...scope, claim: () => qualificationAccess.handle('qualification/context') } : scope;
                    const result = evaluateObservedOperator(access.operator(predicate.op), predicate.operands, targetScope);
                    if (typeof result !== 'boolean') reject('proof_program_result');
                    return result;
                } finally { activeSite = null; }
            };
            try {
                // Full descriptor binding follows the schema-admitted context,
                // not the list of expected reads. No functional R is present.
                const { bindObservedContext } = require('./proofContextBinding');
                bindObservedContext(contexts.get(graph.fact_key).value, access.claim());
                if (Object.values(graph.nodes).some(node => node.binding === 'validated_parent')) {
                    const { bindObservedParents } = require('./proofParentBinding');
                    bindObservedParents(plan.projectProofTransport(selector, parentContext).config.proofParentMaterials,
                        id => access.edge(id));
                }
                for (const program of programs) {
                    access.select(program.candidate_set, program.selected_set, (member, index) => {
                        const item = program.cases[index];
                        if (!item) reject('proof_program_candidate');
                        const node = graph.nodes[item.node];
                        if (member.identity('kind') !== node.kind || member.identity('ref_id') !== node.ref_id
                            || member.identity('version') !== node.version) reject('proof_program_identity');
                        // Guards concerning the current candidate read its live
                        // member handle; referenced targets keep normal access.
                        const scope = { ...access, node: alias => alias === item.node ? member : access.node(alias) };
                        let all = true;
                        for (const id of item.predicates) if (!evaluate(id, scope)) all = false;
                        return item.mode === 'include_if_all' ? all : !all;
                    });
                }
                // No short-circuit: each authored predicate is independently
                // executed even if it already participated in a selection.
                const results = graph.predicates.map(predicate => Object.freeze({
                    id: predicate.id, obligation: predicate.obligation, atom: predicate.atom,
                    satisfied: evaluate(predicate.id, access)
                }));
                access.assertHealthy();
                return Object.freeze({ stage: 'proof_predicate_diagnostics_only', graph_accepted: false,
                    satisfied: results.every(row => row.satisfied), results: Object.freeze(results),
                    selections: programs.length,
                    ...(qualification ? { qualification_observations: Object.freeze(qualificationObservations) } : {}) });
            } finally { qualificationAccess?.revoke(); access.revoke(); }
        },
        openProof(selector, emit, parentContext) {
            let input;
            try { input = copyData(selector); } catch { reject('proof_selector'); }
            if (!input || Object.keys(input).join(',') !== 'fact_key'
                || !identifier(input.fact_key) || typeof emit !== 'function') reject('proof_selector');
            const graph = graphs.get(input.fact_key);
            if (!graph) reject('proof_graph');
            const transport = plan.projectProofTransport({ fact_key: input.fact_key }, parentContext).config;
            const parentBindings = transport.bindings.filter(binding => binding.identity?.kind === 'derived_claim');
            const parentEdges = transport.proofParentEdges;
            // This tag names the proof transport scope, NOT a metric operand
            // role. The execution host must bind this factory to phase proof.
            // No required_reads/expected_trace is used to manufacture events.
            const reachableNodes = { bindings: transport.bindings.filter(binding => binding.alias !== 'claim/context'), links: transport.directLinks };
            let failed = false; let revoked = false;
            let selectionBusy = false;
            const controllers = []; const sets = new Map(); const selected = new Map();
            const selectionNames = new Set(graph.selections.map(s => s.selected_set));
            const check = () => {
                if (failed) reject('proof_failed');
                for (const controller of controllers) controller.assertHealthy();
                if (revoked) { failed = true; reject('proof_revoked'); }
            };
            const invalid = code => { failed = true; reject(code); };
            const observe = event => { check(); emit(event); check(); };
            const access = createInstrumentedAccess({ bindings: transport.bindings,
                links: reachableNodes.links, emit: observe });
            controllers.push(access);
            const parentAccess = parentBindings.length ? createDerivedParentAccess({ phase: 'proof', emit: observe,
                bindings: parentBindings, edges: parentEdges }) : undefined;
            if (parentAccess) controllers.push(parentAccess);
            function set(name) {
                check();
                if (typeof name !== 'string' || !Object.hasOwn(graph.sets, name)) invalid('proof_set');
                if (selected.has(name)) return selected.get(name);
                if (selectionNames.has(name)) invalid('proof_selection_pending');
                if (!sets.has(name)) {
                    const role = `proof/set/${name}`;
                    const controller = createNodeSetAccess({ role,
                        bindings: reachableNodes.bindings.map(binding => ({ ...binding, role })),
                        links: reachableNodes.links, roster: graph.sets[name], emit: observe });
                    controllers.push(controller); sets.set(name, controller.handle);
                }
                return sets.get(name);
            }
            function resolveReference(alias, field, ref) {
                check();
                if (typeof alias !== 'string' || typeof field !== 'string' || typeof ref !== 'string') invalid('proof_reference');
                const matches = graph.edges.filter(e => e.relation === 'material_ref' && e.source === alias
                    && e.field === field && graph.nodes[e.target].ref_id === ref);
                if (matches.length !== 1) invalid('proof_reference');
                return access.handle(alias).traverse(matches[0].id);
            }
            return Object.freeze({
                node(alias) { check(); return access.handle(alias); },
                claim() { check(); return access.handle('claim/context'); },
                set,
                select(candidate, target, predicate) {
                    check();
                    if (selectionBusy || selected.has(target) || !graph.selections.some(s =>
                        s.candidate_set === candidate && s.selected_set === target)) invalid('proof_selection');
                    selectionBusy = true;
                    try {
                        const view = set(candidate).select(predicate);
                        check(); selected.set(target, view); return view;
                    } finally { selectionBusy = false; }
                },
                edge(id) {
                    check();
                    if (parentEdges.some(edge => edge.id === id)) return parentAccess.traverse(id);
                    const edge = graph.edges.find(e => e.id === id && e.relation === 'material_ref');
                    if (!edge) invalid('proof_edge');
                    return access.handle(edge.source).traverse(id);
                },
                resolveReference,
                memberEdge(member, field) {
                    check();
                    const tuple = ['kind', 'ref_id', 'version'].map(key => member.identity(key));
                    const aliases = Object.entries(graph.nodes).filter(([, n]) => identity(n) === JSON.stringify(tuple));
                    if (aliases.length !== 1) invalid('proof_reference');
                    return resolveReference(aliases[0][0], field, member.get(field));
                },
                fieldDescriptor(kind, segments) {
                    check();
                    if (typeof kind !== 'string' || !Object.hasOwn(context.materialRegistry.kinds, kind)
                        || !Array.isArray(segments) || segments.length !== 1) invalid('proof_field');
                    const fields = context.materialRegistry.kinds[kind].fields;
                    if (typeof segments[0] !== 'string' || !Object.hasOwn(fields, segments[0])
                        || fields[segments[0]].class === 'non_material') invalid('proof_field');
                    return fields[segments[0]];
                },
                operator(id) {
                    check();
                    const registry = context.documents.find(d => d.value?.registry_id === 'operator_registry');
                    const result = registry?.value.operators.find(o => o.id === id);
                    if (!result) invalid('proof_operator'); return result;
                },
                material(alias) {
                    check();
                    if (typeof alias !== 'string' || !Object.hasOwn(graph.nodes, alias)) invalid('proof_alias');
                    const kind = graph.nodes[alias].kind;
                    return freeze({ registry_version: context.materialRegistry.registry_version, kind,
                        fields: context.materialRegistry.kinds[kind].fields });
                },
                window(name) {
                    check();
                    const windows = proofIR.get(input.fact_key).windows;
                    if (typeof name !== 'string' || !Object.hasOwn(windows, name)) invalid('proof_window');
                    return windows[name];
                },
                revoke() { revoked = true; for (const controller of controllers) controller.revoke(); },
                assertHealthy() { if (failed) reject('proof_failed'); for (const controller of controllers) controller.assertHealthy(); }
            });
        },
        openContext(selector, emit) {
            const { fact_key, role_id, binding } = select(selector, emit, true);
            if (binding.kind !== 'claim_context') reject('binding_kind');
            const access = createInstrumentedAccess({ bindings: [{ alias: 'claim/context', role: role_id,
                ...contexts.get(fact_key) }], emit });
            return Object.freeze({ handle: access.handle('claim/context'),
                revoke: access.revoke, assertHealthy: access.assertHealthy });
        },
        open(selector, emit) {
            const { fact_key, role_id, alias, binding } = select(selector, emit, false);
            if (!['node', 'node_set'].includes(binding.kind)) reject('binding_kind');
            const aliases = binding.kind === 'node' ? [binding.alias] : binding.aliases;
            if (!aliases.includes(alias)) reject('alias');
            const access = createInstrumentedAccess({ ...reachable(fact_key, role_id, [alias]), emit });
            return Object.freeze({ handle: access.handle(alias),
                revoke: access.revoke, assertHealthy: access.assertHealthy });
        },
        openSet(selector, emit) {
            const { fact_key, role_id, binding } = select(selector, emit, true);
            if (binding.kind !== 'node_set') reject('binding_kind');
            return createNodeSetAccess({ role: role_id,
                ...reachable(fact_key, role_id, binding.aliases), roster: binding.aliases, emit });
        }
    });
    return plan;
}

// Compile-time consistency only. The proof phase must independently observe
// these reads and remeasure the fingerprints during execution.
function validateStaticEvidence(graphs, snapshots, registry) {
    const kinds = object(registry.kinds);
    const tuple = node => JSON.stringify([node.kind, node.ref_id, node.version]);
    const byIdentity = unique(snapshots, tuple);
    const refs = new Map();
    for (const snapshot of snapshots) {
        const key = JSON.stringify([snapshot.kind, snapshot.ref_id]);
        if (!refs.has(key)) refs.set(key, []);
        refs.get(key).push(snapshot);
        const fields = kinds[snapshot.kind]?.fields;
        if (!fields) fail('snapshot_kind');
        const payload = {};
        for (const key of Object.keys(snapshot.payload)) {
            if (!Object.hasOwn(fields, key)) fail('snapshot_field');
            const classification = fields[key].class;
            if (!['identity', 'dimension', 'edge', 'non_material'].includes(classification)) fail('field_class');
            if (classification !== 'non_material') payload[key] = snapshot.payload[key];
        }
        for (const [key, field] of Object.entries(fields)) {
            if (field.required && !Object.hasOwn(snapshot.payload, key)) fail('snapshot_required');
        }
        const measured = `sha256:${digest({ registry_version: registry.registry_version,
            kind: snapshot.kind, ref_id: snapshot.ref_id, version: snapshot.version, payload })}`;
        if (measured !== snapshot.semantic_fingerprint) fail('snapshot_fingerprint');
    }
    function target(ref, field) {
        const targets = list(field.targets).flatMap(kind => refs.get(JSON.stringify([kind, ref])) || []);
        if (targets.length !== 1) fail('snapshot_reference');
        return tuple(targets[0]);
    }
    for (const graph of graphs) {
        const aliases = new Map();
        for (const [alias, node] of Object.entries(graph.nodes)) {
            if (node.binding !== 'snapshot') continue;
            const identity = tuple(node);
            const snapshot = byIdentity.get(identity);
            // Identity resolution precedes fingerprint comparison. A missing
            // target does not establish a measured fingerprint violation.
            // These are admission diagnostics, not D/P mutation acceptance.
            if (!snapshot) fail('node_snapshot_mismatch_identity');
            if (node.semantic_fingerprint !== snapshot.semantic_fingerprint) fail('node_snapshot_mismatch_fingerprint');
            if (aliases.has(identity)) fail('node_snapshot_duplicate');
            aliases.set(identity, alias);
        }
        const actual = new Set();
        for (const [identity, alias] of aliases) {
            const snapshot = byIdentity.get(identity);
            for (const [name, field] of Object.entries(kinds[snapshot.kind].fields)) {
                if (field.class !== 'edge' || !Object.hasOwn(snapshot.payload, name)) continue;
                const value = snapshot.payload[name];
                let values;
                if (field.type === 'ref') values = [value];
                else if (field.type === 'ref_list') values = list(value);
                else if (field.type === 'role_ref_list') values = list(value).map(item => item.parent_ref);
                else fail('edge_type');
                if (new Set(values).size !== values.length) fail('edge_duplicate');
                for (const ref of values) {
                    const targetAlias = aliases.get(target(ref, field));
                    if (!targetAlias) fail('edge_target_missing');
                    actual.add(JSON.stringify([alias, name, targetAlias]));
                }
            }
        }
        const declared = unique(graph.edges.filter(edge => edge.relation === 'material_ref'),
            edge => JSON.stringify([edge.source, edge.field, edge.target]));
        equalSet(declared, actual);
        for (const phase of [graph.trace_contract.derivation, graph.trace_contract.proof]) {
            for (const read of phase.required_reads) {
                const node = graph.nodes[read.node];
                if (!node) fail('read_node_missing');
                if (node.binding === 'snapshot') {
                    const field = kinds[node.kind].fields[read.segments[0]];
                    if (!field || field.class === 'non_material') fail('read_non_material');
                }
            }
        }
    }
    return Object.freeze({ snapshots: byIdentity.size, graphs: graphs.length });
}

module.exports = { indexGraphDependencies, compileAuthoringIndex, compileAuthoringIR, compileSnapshotAccess, validateStaticEvidence,
    prepareClaimMonthQualification, compileClaimMonthQualificationIR, verifyClaimMonthQualificationConformance,
    compileClaimMonthQualificationAccess, prepareClaimMonthIsolatedPlan,
    resolveClaimMonthIsolatedPlan, assertClaimMonthIsolatedProgram, sealClaimMonthIsolatedLowering,
    admitClaimMonthIsolatedProof, resolveClaimMonthIsolatedProof, admitClaimMonthFrozenBaseline };
