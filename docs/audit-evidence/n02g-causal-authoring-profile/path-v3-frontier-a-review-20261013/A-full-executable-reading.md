# Fronteira A — fontes executable integrais

CODE cf6e43cbaa7c378f2b64590c50d0818700a3bdd0. Navegação, sem veredito.

## src/next/provenance/claimRequirementCore.js

SHA-256 1f23d4c8fb117bb5bd6bf992cc1bf4ea0806c01372853395fb2c341b9968de23; Git blob f97afea9916aa7b4914f7e8defbdb8720e9ff246; bytes 7910.

```javascript
'use strict';

const { canonicalValue } = require('../kernel/canonicalValue');
const { claimReferenceKind } = require('./claimNominalTypes');
const failures = new WeakMap();
const fail = (code, dependency) => {
    const error = new Error(`claim_requirements_${code}`);
    if (dependency) failures.set(error, Object.freeze({ checker: 'claim_requirements', code,
        fact_key: dependency.fact_key, predicate_ids: Object.freeze([...dependency.predicate_ids]) }));
    throw error;
};
const pathKey = segments => JSON.stringify(segments);
const claimAt = (arg, segments) => pathKey(arg?.claim?.segments) === pathKey(segments);
const same = (a, b) => canonicalValue(a) === canonicalValue(b);
const ROOT_OBLIGATION = Object.freeze({ subject: 'subject_scope', filters: 'subject_scope',
    period: 'period', time_basis: 'time_basis', coverage: 'coverage', evidence_state: 'evidence_state' });

// Compile-time descriptor binding. Literal agreement is not provenance by
// itself: subject nodes and required reads are independently derived here;
// temporal derivation, source completeness and actual reads remain proof work.
function checkClaimRequirements({ graphs, claims }, transported) {
    const claimMap = new Map(claims.map(claim => [claim.fact_key, claim]));
    if (claimMap.size !== claims.length) fail('duplicate');
    for (const graph of graphs) {
        const claim = claimMap.get(graph.fact_key);
        if (!claim || claim.claim_id !== graph.claim_id) fail('claim');
        const reads = new Set(graph.trace_contract.proof.required_claim_reads.map(read => pathKey(read.segments)));
        function requireRead(value, segments) {
            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                for (const [name, child] of Object.entries(value)) requireRead(child, [...segments, name]);
            } else if (!reads.has(pathKey(segments))) fail('read');
        }
        for (const root of ['claim_id', 'fact_key', 'metric', 'unit', 'subject', 'period', 'time_basis',
            'coverage', 'evidence_state', 'evaluator_ref', 'filters']) {
            if (Object.hasOwn(claim, root)) requireRead(claim[root], [root]);
        }
        // Direct descriptor comparisons cannot borrow the label of another
        // obligation. Type validation has already checked their operand domains.
        for (const predicate of graph.predicates) {
            for (const arg of predicate.args) {
                const root = arg.claim?.segments?.[0];
                if (ROOT_OBLIGATION[root] && predicate.obligation !== ROOT_OBLIGATION[root]) fail('semantics');
            }
        }
        function literalBinding(segments, value, type) {
            const candidates = graph.predicates.filter(predicate => predicate.op === 'eq'
                && predicate.obligation === ROOT_OBLIGATION[segments[0]]
                && predicate.args.some(arg => claimAt(arg, segments))
                && predicate.args.some(arg => arg.literal));
            if (!candidates.length) fail('missing', { fact_key: graph.fact_key,
                predicate_ids: graph.predicates.filter(predicate => predicate.obligation === ROOT_OBLIGATION[segments[0]]
                    && predicate.args.some(arg => claimAt(arg, segments)) && predicate.args.some(arg => arg.literal))
                    .map(predicate => predicate.id) });
            for (const predicate of candidates) {
                const literal = predicate.args.find(arg => arg.literal).literal;
                if (literal.type !== type || !same(literal.value, value)) fail('value');
            }
        }
        for (const name of ['time_basis', 'coverage', 'evidence_state']) literalBinding([name], claim[name], 'enum');
        literalBinding(['subject', 'kind'], claim.subject.kind, 'enum');
        const materialReads = new Set(graph.trace_contract.proof.required_reads.map(read =>
            JSON.stringify([read.node, read.segments])));
        for (const [name, value] of Object.entries(claim.subject)) {
            if (name === 'kind') continue;
            const segments = ['subject', name];
            const kind = claimReferenceKind(claim, segments);
            const values = Array.isArray(value) ? value : [value];
            if (!Array.isArray(value)) literalBinding(segments, value, 'id');
            for (const id of values) {
                const nodes = Object.entries(graph.nodes).filter(([, node]) =>
                    node.binding === 'snapshot' && node.kind === kind && node.ref_id === id);
                if (nodes.length !== 1) fail('subject');
                const [alias] = nodes[0];
                if (!graph.trace_contract.proof.required_nodes.includes(alias)
                    || !materialReads.has(JSON.stringify([alias, ['id']]))) fail('subject');
                if (Array.isArray(value)) continue; // typed_subject_binding checks each nominal member.
                const links = graph.predicates.filter(predicate => predicate.op === 'eq'
                    && predicate.obligation === 'subject_scope' && predicate.args.some(arg => claimAt(arg, segments))
                    && predicate.args.some(arg => arg.field));
                if (!links.length) fail('missing', { fact_key: graph.fact_key,
                    predicate_ids: graph.predicates.filter(predicate => predicate.obligation === 'subject_scope'
                        && predicate.args.some(arg => claimAt(arg, segments)) && predicate.args.some(arg => arg.field))
                        .map(predicate => predicate.id) });
                for (const predicate of links) {
                    const field = predicate.args.find(arg => arg.field).field;
                    if (field.node !== alias || !same(field.segments, ['id'])) fail('subject');
                }
            }
        }
        const isTransportedLocator = (predicate, index) => transported?.variant === 'M'
            && transported.subobligation.name === 'claim.period.binding_locator'
            && transported.subobligation.fact_key === graph.fact_key
            && transported.subobligation.predicate_id === predicate.id
            && transported.subobligation.operand_index === index
            && claimAt(predicate.args[index], transported.locator);
        const isPeriodLocator = (predicate, index) => claimAt(predicate.args[index], ['period'])
            || isTransportedLocator(predicate, index);
        const periods = graph.predicates.filter(predicate => predicate.op === 'period_eq'
            && predicate.obligation === 'period' && predicate.args.some((_arg, index) => isPeriodLocator(predicate, index)));
        if (!periods.length) fail('missing');
        for (const predicate of periods) {
            // Only the locator subobligation may be transported. The anchor
            // value/kind and every other requirement still execute on M.
            const anchors = predicate.args.filter((_arg, index) => !isPeriodLocator(predicate, index));
            if (anchors.length !== 1) fail('period');
            const anchor = anchors[0];
            if (anchor.period_literal) {
                if (!same(anchor.period_literal, claim.period)) fail('period');
            } else if (anchor.period_ref) {
                const window = graph.windows?.[anchor.period_ref];
                if (!window || window.kind !== claim.period.kind) fail('period');
                // Values are derived/observed by the temporal proof, never
                // inferred from the result oracle or copied from the claim.
            } else fail('period');
        }
    }
    return Object.freeze({ stage: 'claim_requirements_checked_only', graphs: graphs.length });
}

function validateClaimRequirements(input) {
    return checkClaimRequirements(input, null);
}

module.exports = { checkClaimRequirements, validateClaimRequirements,
    claimRequirementFailure: error => failures.get(error) ?? null };
```

## src/next/provenance/claimRequirements.js

SHA-256 2a42d47868a57fad697a0caec0ae0678a338f06dca0ebf77064fab6def182468; Git blob 0b2a5234ab88efd6fffbeec13fa79d34a2b41c7e; bytes 802.

```javascript
'use strict';

const { checkClaimRequirements, validateClaimRequirements, claimRequirementFailure } = require('./claimRequirementCore');
const { assertClaimMonthPathTransport } = require('./claimMonthPathProfile');

function validateQualificationClaimRequirements({ graphs, claims, transport, variant = 'M' }) {
    const authorization = assertClaimMonthPathTransport({ graphs, claims, transport, variant });
    checkClaimRequirements({ graphs, claims }, authorization);
    return Object.freeze({ stage: 'claim_requirements_qualification_checked_only', graphs: graphs.length,
        transported_subobligations: Object.freeze(variant === 'M' ? [authorization.subobligation] : []) });
}

module.exports = { validateClaimRequirements, validateQualificationClaimRequirements, claimRequirementFailure };
```

## src/next/provenance/collectionRequirements.js

SHA-256 4d6af2b5d830929910622f504126dfea29c3ba6866ff99e21c90e23f12961de3; Git blob 153605d6aec0e19306934eb0db7a913d9b07acf6; bytes 4597.

```javascript
'use strict';

const failures = new WeakMap();
const fail = (code, dependency) => {
    const error = new Error(`collection_requirements_${code}`);
    if (dependency) failures.set(error, Object.freeze({ checker: 'collection_requirements', code,
        fact_key: dependency.fact_key, predicate_ids: Object.freeze([...dependency.predicate_ids]) }));
    throw error;
};
const tuple = node => JSON.stringify([node.kind, node.ref_id, node.version]);
const sameSet = (a, b) => a.length === new Set(a).size && b.length === new Set(b).size
    && a.length === b.length && a.every(value => b.includes(value));

// Necessary closed-world authoring checks after schemas/material edge checks.
// Candidate coverage is not financial selection truth or observed provenance.
function validateCollectionRequirements({ graphs, snapshots, materialRegistry }) {
    const snapshotMap = new Map(snapshots.map(snapshot => [tuple(snapshot), snapshot]));
    if (snapshotMap.size !== snapshots.length) fail('duplicate');
    let collections = 0;
    for (const graph of graphs) {
        const entries = Object.entries(graph.nodes);
        function payload(node) {
            const snapshot = snapshotMap.get(tuple(node));
            if (!snapshot) fail('snapshot');
            return snapshot.payload;
        }
        function anchors(alias, field, type, value) {
            const predicates = graph.predicates.filter(p => p.op === 'eq' && p.obligation === 'coverage'
                && p.args.some(a => a.field?.node === alias && a.field.segments.length === 1 && a.field.segments[0] === field));
            if (!predicates.length || predicates.some(p => !p.args.some(a => a.literal?.type === type && a.literal.value === value))) {
                fail('fixture_anchor', { fact_key: graph.fact_key,
                    predicate_ids: graph.predicates.filter(p => p.obligation === 'coverage'
                        && p.args.some(a => a.field?.node === alias && a.field.segments.length === 1 && a.field.segments[0] === field))
                        .map(p => p.id) });
            }
        }
        for (const [alias, node] of entries.filter(([, node]) => node.kind === 'fixture')) {
            const source = payload(node);
            for (const field of ['closed_world', 'synthetic']) {
                if (source[field] !== true) fail('fixture_state');
                anchors(alias, field, 'boolean', true);
            }
        }
        for (const [alias, node] of entries.filter(([, node]) => node.kind === 'collection')) {
            collections++;
            const collection = payload(node);
            const fixtures = entries.filter(([, n]) => n.kind === 'fixture' && n.ref_id === collection.fixture_id
                && n.version === node.version);
            if (fixtures.length !== 1) fail('fixture');
            const kinds = Object.entries(materialRegistry.kinds).filter(([, kind]) => kind.origin === collection.collection_name);
            if (kinds.length !== 1) fail('member_kind');
            const kind = kinds[0][0];
            const complete = snapshots.filter(s => s.kind === kind && s.version === node.version).map(s => s.ref_id);
            if (!sameSet(collection.members, complete)) fail('member_kind');
            const links = graph.predicates.filter(p => p.op === 'set_eq' && p.obligation === 'evidence_set'
                && p.args.some(a => a.ref_set?.field.node === alias
                    && a.ref_set.field.segments.length === 1 && a.ref_set.field.segments[0] === 'members'));
            if (!links.length) fail('membership_anchor');
            for (const p of links) {
                const sets = p.args.filter(a => a.set).map(a => a.set);
                if (sets.length !== 1 || !graph.selections.some(s => s.candidate_set === sets[0])) fail('candidate_anchor');
                const candidates = graph.sets[sets[0]];
                if (!Array.isArray(candidates)) fail('members');
                const identities = candidates.map(alias => {
                    const member = graph.nodes[alias];
                    if (member?.binding !== 'snapshot' || member.kind !== kind || member.version !== node.version) fail('member_kind');
                    return member.ref_id;
                });
                if (!sameSet(identities, collection.members)) fail('members');
            }
        }
    }
    return Object.freeze({ stage: 'collection_requirements_checked_only', graphs: graphs.length, collections });
}

module.exports = { validateCollectionRequirements, collectionRequirementFailure: error => failures.get(error) ?? null };
```

## src/next/provenance/graphCompiler.js

SHA-256 fe938a128cfd4dccda0d8ddc1f2e6965b623feecc6d1854ef0306700efda1016; Git blob 7fe96f0937faddb5fddba19771889e9500b93a00; bytes 82211.

```javascript
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
```

## src/next/provenance/graphStructure.js

SHA-256 927a4e76b6a7c9f8ad8656e21a44766a745c2edd3113b82ff7231a1c2bc79e50; Git blob 549473a5b632c3a8544552d1ac88e7dd85047304; bytes 17159.

```javascript
'use strict';

const { validateLiteral } = require('./literalTypes');
const { freezeDeep } = require('../kernel/canonicalValue');

// Closed structural pass after JSON Schema validation. These associations are
// compiler invariants, not claims that the declared predicates have executed.
const OBLIGATIONS = Object.freeze({
    claim_semantics: ['claim', 'claim_registry_binding'],
    node_identity: ['identity', 'snapshot_identity'],
    semantic_integrity: ['fingerprint', 'all_material_fingerprints'],
    subject_scope: ['subject', 'typed_subject_binding'],
    period: ['period', 'typed_period_binding'],
    time_basis: ['time_basis', 'time_field_reads'],
    coverage: ['coverage', 'source_collection_completeness'],
    evidence_state: ['evidence_state', 'typed_evidence_state'],
    evidence_set: ['evidence_set', 'exact_evidence_set'],
    economic_links: ['edge', 'all_material_edges'],
    derivation_trace: ['trace', 'exact_observed_trace'],
});
const diagnostics = new WeakMap();
const fail = code => {
    const error = new Error(`graph_structure_${code}`);
    diagnostics.set(error, freezeDeep({ checker: 'graph_structure', code }));
    throw error;
};
const readGraphStructureDiagnostic = error => diagnostics.get(error) ?? null;
function atPath(coordinate, path, resolve) {
    try { return resolve(); } catch (error) {
        const diagnostic = diagnostics.get(error);
        if (coordinate && diagnostic && !Object.hasOwn(diagnostic, 'site_path')) {
            diagnostics.set(error, freezeDeep({ ...diagnostic, fact_key: coordinate.fact_key,
                predicate_id: coordinate.predicate_id, operand_index: coordinate.operand_index,
                site_path: [...coordinate.site_path, ...path] }));
        }
        throw error;
    }
}
const own = (object, key) => object !== null && typeof object === 'object' && Object.hasOwn(object, key);
function unique(values, key = value => value) {
    if (!Array.isArray(values)) fail('array');
    const result = new Map();
    for (const value of values) {
        const id = key(value);
        if (result.has(id)) fail('duplicate');
        result.set(id, value);
    }
    return result;
}
function same(actual, expected, code) {
    if (actual.size !== expected.size || [...actual.keys()].some(key => !expected.has(key))) fail(code);
}

function validateGraphStructureInternal({ graphs, claims, materialRegistry, operatorRegistry }, qualification) {
    const graphMap = unique(graphs, graph => graph.fact_key);
    const claimMap = unique(claims, claim => claim.fact_key);
    const operators = unique(operatorRegistry.operators, operator => operator.id);
    let phases = 0;
    for (const graph of graphs) {
        const claim = claimMap.get(graph.fact_key);
        if (!claim || claim.claim_id !== graph.claim_id) fail('claim_missing');
        const predicates = unique(graph.predicates, predicate => predicate.id);
        const edges = unique(graph.edges, edge => edge.id);
        const obligations = unique(graph.obligations, obligation => obligation.obligation);
        same(obligations, new Map(Object.keys(OBLIGATIONS).map(key => [key, true])), 'obligation_inventory');
        const node = alias => {
            if (!own(graph.nodes, alias)) fail('node_missing');
            return graph.nodes[alias];
        };
        const set = alias => {
            if (!own(graph.sets, alias)) fail('set_missing');
            const members = unique(graph.sets[alias]);
            for (const member of members.keys()) node(member);
            return members;
        };
        const predicateRefs = refs => {
            const ids = unique(refs);
            for (const id of ids.keys()) if (!predicates.has(id)) fail('predicate_missing');
            return ids;
        };
        const field = (kind, segments, allowRoot = false, parentalRead = false) => {
            if (!own(materialRegistry.kinds, kind)) fail('kind_missing');
            if (!Array.isArray(segments) || (!allowRoot && !segments.length)) fail('path_invalid');
            if (!segments.length) return { type: 'record' };
            const fields = materialRegistry.kinds[kind].fields;
            if (!own(fields, segments[0])) fail('path_missing');
            const descriptor = fields[segments[0]];
            if (descriptor.class === 'non_material') fail('path_non_material');
            if (segments.length !== 1) {
                // This finite profile admits only scalar money results of
                // primary parents, not arbitrary traversal through typed JSON.
                if (parentalRead && kind === 'derived_claim' && descriptor.type === 'typed_result'
                    && segments.length === 2 && ['unit', 'kind', 'value'].includes(segments[1]))
                    return { type: segments[1] === 'value' ? 'money_minor' : 'text' };
                // Structured field traversal needs an explicit typed lowering;
                // never let arbitrary JSON-property traversal reach execution.
                if (['typed_period', 'typed_result', 'role_ref_list'].includes(descriptor.type)) fail('path_structured_unresolved');
                fail('path_scalar_traversal');
            }
            if (parentalRead && allowRoot && descriptor.type === 'typed_result') return { type: 'record' };
            return descriptor;
        };
        const nodeField = (ref, allowRoot = false, phase = null) => {
            const binding = node(ref.node);
            const parentalRead = phase !== null && binding.binding === 'validated_parent';
            if (parentalRead) {
                const parent = graphMap.get(binding.fact_key); const parentClaim = claimMap.get(binding.fact_key);
                if (!parent || !parentClaim || parentClaim.unit !== 'BRL_minor'
                    || Object.values(parent.nodes).some(n => n.binding !== 'snapshot')
                    || parent.edges.some(e => e.relation === 'derived_from')
                    || Object.values(parentClaim.operand_bindings).some(b => b.kind === 'parent_claim')) fail('parent_profile');
            }
            return field(binding.kind, ref.segments, allowRoot, parentalRead);
        };
        const claimPath = ref => {
            if (qualification?.variant === 'M' && graph.fact_key === qualification.subobligation.fact_key
                && JSON.stringify(ref.segments) === JSON.stringify(qualification.locator)) return;
            if (!Array.isArray(ref.segments) || !ref.segments.length) fail('claim_path');
            let value = claim;
            for (const key of ref.segments) {
                if (!own(value, key) || Array.isArray(value)) fail('claim_path');
                value = value[key];
            }
        };
        const windows = graph.windows || {};
        const activeWindows = new Set();
        const checkedWindows = new Set();
        function window(id) {
            if (!own(windows, id)) fail('window_missing');
            if (activeWindows.has(id)) fail('window_cycle');
            if (checkedWindows.has(id)) return;
            activeWindows.add(id);
            if (windows[id].kind === 'range') {
                argument(windows[id].start);
                argument(windows[id].end);
            } else if (windows[id].kind === 'month') argument(windows[id].value);
            else fail('window_kind');
            activeWindows.delete(id);
            checkedWindows.add(id);
        }
        function argument(arg, coordinate = null) {
            if (own(arg, 'node')) { node(arg.node); return; }
            if (own(arg, 'set')) { set(arg.set); return; }
            if (own(arg, 'field')) { atPath(coordinate, ['field', 'segments'], () => nodeField(arg.field)); return; }
            if (own(arg, 'presence')) { atPath(coordinate, ['presence', 'segments'], () => nodeField(arg.presence)); return; }
            if (own(arg, 'claim')) { atPath(coordinate, ['claim', 'segments'], () => claimPath(arg.claim)); return; }
            if (own(arg, 'selector')) { atPath(coordinate, ['selector', 'segments'], () => field(arg.selector.kind, arg.selector.segments)); return; }
            if (own(arg, 'edge')) { if (!edges.has(arg.edge)) fail('edge_missing'); return; }
            if (own(arg, 'ref_set')) {
                if (atPath(coordinate, ['ref_set', 'field', 'segments'], () => nodeField(arg.ref_set.field)).type !== 'ref_list') fail('ref_set_type');
                return;
            }
            if (own(arg, 'projection')) {
                const members = set(arg.projection.set);
                const selector = arg.projection.selector;
                atPath(coordinate, ['projection', 'selector', 'segments'], () => field(selector.kind, selector.segments));
                for (const alias of members.keys()) if (node(alias).kind !== selector.kind) fail('selector_kind');
                return;
            }
            if (own(arg, 'sort')) {
                for (let index = 0; index < arg.sort.keys.length; index++) {
                    const key = arg.sort.keys[index];
                    atPath(coordinate, ['sort', 'keys', index, 'selector', 'segments'], () => field(key.selector.kind, key.selector.segments));
                }
                return;
            }
            if (own(arg, 'template')) {
                for (const [name, binding] of Object.entries(arg.bindings)) argument(binding, coordinate
                    ? { ...coordinate, site_path: [...coordinate.site_path, 'bindings', name] } : null);
                return; // Template identity/body is resolved by the typed pass.
            }
            if (own(arg, 'period_ref')) { window(arg.period_ref); return; }
            if (own(arg, 'period_bound')) {
                window(arg.period_bound.period);
                if (windows[arg.period_bound.period].kind !== 'range') fail('window_bound');
                return;
            }
            if (own(arg, 'literal')) { validateLiteral(arg.literal); return; }
            if (own(arg, 'period_literal') || own(arg, 'partial_policy')) return;
            fail('argument_unresolved');
        }

        for (const alias of Object.keys(graph.sets)) set(alias);
        for (const id of Object.keys(windows)) window(id);
        const hasParents = Object.values(graph.nodes).some(value => value.binding === 'validated_parent');
        for (const [name, obligation] of obligations) {
            const checks = [OBLIGATIONS[name][1]];
            if (name === 'node_identity' && hasParents) checks.push('validated_parent_binding');
            same(unique(obligation.checks), unique(checks), 'obligation_checks');
            const declared = predicateRefs(obligation.predicates);
            const expected = unique(graph.predicates.filter(predicate => predicate.obligation === name), predicate => predicate.id);
            same(declared, expected, 'predicate_membership');
        }
        for (const predicate of predicates.values()) {
            if (!own(OBLIGATIONS, predicate.obligation) || predicate.atom !== OBLIGATIONS[predicate.obligation][0]) fail('predicate_atom');
            const operator = operators.get(predicate.op);
            if (!operator) fail('operator_missing');
            if (predicate.args.length !== operator.args.length) fail('operator_arity');
            for (let operand_index = 0; operand_index < predicate.args.length; operand_index++)
                argument(predicate.args[operand_index], { fact_key: graph.fact_key,
                    predicate_id: predicate.id, operand_index, site_path: ['args', operand_index] });
        }
        for (const edge of edges.values()) {
            if (edge.source !== 'claim') node(edge.source);
            node(edge.target);
            predicateRefs(edge.proof_predicates);
        }
        const selectionKey = selection => JSON.stringify([selection.candidate_set, selection.selected_set]);
        const selections = unique(graph.selections, selectionKey);
        const derivationSelections = new Map();
        const preboundNodes = new Set();
        const bindings = Object.values(claim.operand_bindings);
        for (const selection of selections.values()) {
            const candidates = set(selection.candidate_set);
            const selected = set(selection.selected_set);
            for (const alias of selected.keys()) {
                if (!candidates.has(alias)) fail('selection_subset');
            }
            // Determine the required phase from declared inputs, never actual
            // trace, expected result, metric name or fact_key. A prebound node
            // does not execute the proof's candidate search a second time.
            const candidateBindings = bindings.filter(binding => binding.kind === 'node_set'
                && JSON.stringify(binding.aliases) === JSON.stringify([...candidates.keys()]));
            if (candidateBindings.length > 1) fail('selection_binding_ambiguous');
            if (candidateBindings.length === 1) derivationSelections.set(selectionKey(selection), selection);
            else {
                const direct = new Set(bindings.filter(binding => binding.kind === 'node').map(binding => binding.alias));
                if (!selected.size || [...selected.keys()].some(alias => !direct.has(alias))) fail('selection_binding_unresolved');
                for (const alias of selected.keys()) preboundNodes.add(alias);
            }
            predicateRefs(selection.selected_predicates);
            const excluded = unique(selection.excluded, item => item.node);
            same(excluded, new Map([...candidates].filter(([alias]) => !selected.has(alias))), 'selection_partition');
            for (const item of excluded.values()) predicateRefs(item.predicates);
        }
        for (const phase of ['derivation', 'proof']) {
            phases++;
            const trace = graph.trace_contract[phase];
            const requiredNodes = unique(trace.required_nodes);
            for (const alias of requiredNodes.keys()) node(alias);
            const reads = unique(trace.required_reads, read => JSON.stringify([read.node, read.segments]));
            const readNodes = new Set();
            for (const read of reads.values()) {
                nodeField(read, false, phase);
                if (!requiredNodes.has(read.node)) fail('read_not_required');
                readNodes.add(read.node);
            }
            unique(trace.required_claim_reads, read => JSON.stringify(read.segments));
            for (const read of trace.required_claim_reads) claimPath(read);
            for (const id of unique(trace.required_edges).keys()) if (!edges.has(id)) fail('edge_missing');
            unique(trace.required_structural, entry => JSON.stringify([entry.node, entry.operation, entry.segments]));
            for (const entry of trace.required_structural) {
                const descriptor = nodeField(entry, true, phase);
                if (!requiredNodes.has(entry.node)) fail('structural_not_required');
                if (['iterator', 'cardinality', 'order'].includes(entry.operation)
                    && !['ref_list', 'role_ref_list'].includes(descriptor.type)) fail('structural_type');
                if (entry.operation === 'keys' && descriptor.type !== 'record') fail('structural_type');
                if (entry.operation === 'has' && !entry.segments.length) fail('structural_type');
            }
            const phaseSelections = phase === 'proof' ? selections : derivationSelections;
            same(unique(trace.required_selections, selectionKey), phaseSelections, 'trace_selections');
            const selectedNodes = new Set([...phaseSelections.values()].flatMap(selection => [...set(selection.selected_set).keys()]));
            same(unique(trace.selected_nodes), selectedNodes, 'trace_selected_nodes');
            for (const alias of selectedNodes) if (!requiredNodes.has(alias)) fail('selected_not_required');
            for (const selection of phaseSelections.values()) for (const alias of set(selection.candidate_set).keys()) {
                if (!requiredNodes.has(alias) || !readNodes.has(alias)) fail('candidate_unobserved');
            }
            for (const alias of preboundNodes) {
                if (!requiredNodes.has(alias) || !readNodes.has(alias)) fail('prebound_unobserved');
            }
            for (const [alias, value] of Object.entries(graph.nodes)) {
                if (value.binding === 'validated_parent' && (!requiredNodes.has(alias) || !readNodes.has(alias))) fail('parent_unobserved');
            }
        }
    }
    return Object.freeze({ stage: 'structure_checked_only', graphs: graphs.length, phases });
}

function validateGraphStructure(input) {
    return validateGraphStructureInternal(input, null);
}
function validateQualificationGraphStructure(input, transport, variant) {
    const qualification = require('./claimMonthPathProfile').assertClaimMonthPathTransport({
        graphs: input.graphs, claims: input.claims, transport, variant });
    return validateGraphStructureInternal(input, qualification);
}
module.exports = { validateGraphStructure, validateQualificationGraphStructure, readGraphStructureDiagnostic };
```

## src/next/provenance/obligationBindings.js

SHA-256 580f9b97e6ef216e5598de5c97aa8d96cc7cda713a5547e249a27f24144baf87; Git blob 6d56d64df499075e46f202dc587dfd030decc085; bytes 6925.

```javascript
'use strict';

const failures = new WeakMap();
const fail = (code, dependency) => {
    const error = new Error(`obligation_binding_${code}`);
    if (dependency) failures.set(error, Object.freeze({ checker: 'obligation_binding', code,
        fact_key: dependency.fact_key, predicate_ids: Object.freeze([...dependency.predicate_ids]) }));
    throw error;
};
const tuple = node => JSON.stringify([node.kind, node.ref_id, node.version]);
const pathKey = ref => JSON.stringify([ref.node, ref.segments]);
const fieldAt = (arg, alias, name) => arg?.field?.node === alias
    && arg.field.segments.length === 1 && arg.field.segments[0] === name;

/** Necessary compile-time bindings, after schema, type and reference passes.
 * This is not proof execution or sufficiency of the eleven obligations. In
 * particular, declaring a material read here does not prove it was observed.
 */
function validateObligationBindings({ graphs, snapshots, materialRegistry }) {
    const snapshotMap = new Map(snapshots.map(snapshot => [tuple(snapshot), snapshot]));
    if (snapshotMap.size !== snapshots.length) fail('duplicate_snapshot');
    let snapshotBindings = 0;
    let materialEdgeBindings = 0;
    let parentBindings = 0;
    for (const graph of graphs) {
        const predicates = new Map(graph.predicates.map(predicate => [predicate.id, predicate]));
        const edges = new Map(graph.edges.map(edge => [edge.id, edge]));
        if (predicates.size !== graph.predicates.length || edges.size !== graph.edges.length) fail('duplicate');
        const kinds = new Map();
        const fingerprints = new Map();
        const targets = new Map();
        const add = (map, key, predicate) => {
            if (map.has(key)) fail('duplicate');
            map.set(key, predicate);
        };
        function identityArgument(arg) {
            if (arg.literal) return true; // Its type is unified by the typed pass.
            if (!arg.field || arg.field.segments.length !== 1) return false;
            const node = graph.nodes[arg.field.node];
            return materialRegistry.kinds[node?.kind]?.fields[arg.field.segments[0]]?.class === 'identity';
        }
        for (const predicate of graph.predicates) {
            const [left, right] = predicate.args;
            if (predicate.obligation === 'node_identity') {
                if (predicate.op === 'kind_is') {
                    const node = graph.nodes[left?.node];
                    if (!node || right?.literal?.type !== 'kind' || right.literal.value !== node.kind) fail('kind');
                    add(kinds, left.node, predicate);
                } else if (['eq', 'not_eq', 'field_eq'].includes(predicate.op)) {
                    if (!predicate.args.some(arg => arg.field) || !predicate.args.every(identityArgument)) fail('semantics');
                } else if (predicate.op !== 'same_identity' || !left?.node || !right?.node) fail('semantics');
            }
            if (predicate.obligation === 'semantic_integrity') {
                if (predicate.op !== 'fingerprint_is') fail('semantics');
                const node = graph.nodes[left?.node];
                if (node?.binding !== 'snapshot' || right?.literal?.type !== 'digest'
                    || right.literal.value !== node.semantic_fingerprint) fail('fingerprint');
                add(fingerprints, left.node, predicate);
            }
            // These operators cannot be relabelled to discharge other atoms.
            if (predicate.op === 'kind_is' && predicate.obligation !== 'node_identity') fail('semantics');
            if (predicate.op === 'fingerprint_is' && predicate.obligation !== 'semantic_integrity') fail('semantics');
            if (predicate.op === 'ref_targets_node') {
                const edge = edges.get(left?.edge);
                if (predicate.obligation !== 'economic_links' || edge?.relation !== 'material_ref'
                    || right?.node !== edge.target || !edge.proof_predicates.includes(predicate.id)) fail('edge');
                add(targets, edge.id, predicate);
            }
        }
        const proof = graph.trace_contract.proof;
        const reads = new Set(proof.required_reads.map(pathKey));
        const keys = new Set(proof.required_structural.filter(item => item.operation === 'keys'
            && item.segments.length === 0).map(item => item.node));
        for (const [alias, node] of Object.entries(graph.nodes)) {
            if (node.binding !== 'snapshot') continue;
            if (!kinds.has(alias) || !fingerprints.has(alias)) fail('missing');
            const snapshot = snapshotMap.get(tuple(node));
            if (!snapshot) fail('snapshot');
            if (!keys.has(alias)) fail('material_keys');
            for (const name of Object.keys(snapshot.payload)) {
                const field = materialRegistry.kinds[node.kind]?.fields[name];
                if (!field) fail('field');
                if (field.class !== 'non_material' && !reads.has(pathKey({ node: alias, segments: [name] }))) fail('material_read');
            }
            snapshotBindings++;
        }
        for (const edge of graph.edges) {
            if (edge.relation === 'material_ref') {
                if (!targets.has(edge.id)) fail('missing');
                materialEdgeBindings++;
            } else if (edge.relation === 'derived_from') {
                const parent = graph.nodes[edge.target];
                if (parent?.binding !== 'validated_parent') fail('parent');
                if (!edge.proof_predicates.length) fail('missing');
                const matches = edge.proof_predicates.map(id => predicates.get(id)).filter(predicate => {
                    if (predicate?.op !== 'eq' || predicate.obligation !== 'node_identity') return false;
                    return predicate.args.some((arg, i) => fieldAt(arg, edge.target, 'fact_key')
                        && predicate.args[1 - i]?.literal?.type === 'id'
                        && predicate.args[1 - i].literal.value === parent.fact_key);
                });
                if (matches.length !== 1) fail('parent', { fact_key: graph.fact_key,
                    predicate_ids: edge.proof_predicates.map(id => predicates.get(id)).filter(predicate =>
                        predicate?.obligation === 'node_identity' && predicate.args.some((arg, i) =>
                            fieldAt(arg, edge.target, 'fact_key') && predicate.args[1 - i]?.literal?.type === 'id'
                            && predicate.args[1 - i].literal.value === parent.fact_key)).map(predicate => predicate.id) });
                parentBindings++;
            } else fail('edge');
        }
    }
    return Object.freeze({ stage: 'necessary_bindings_checked_only', graphs: graphs.length,
        snapshotBindings, materialEdgeBindings, parentBindings });
}

module.exports = { validateObligationBindings, obligationBindingFailure: error => failures.get(error) ?? null };
```

## src/next/provenance/operandBindings.js

SHA-256 50cacfb104e9e792d1118428f81fe659b4ae9c07407b979a1c2b122141303e60; Git blob 900c23304e9e4fbc8c053dc9f7703c80d23744f0; bytes 5232.

```javascript
'use strict';

const { freezeDeep } = require('../kernel/canonicalValue');
const fail = code => { throw new Error(`operand_binding_${code}`); };
const evaluatorKey = ref => JSON.stringify([ref.evaluator_id, ref.evaluator_version]);
function index(items, key) {
    const result = new Map();
    for (const item of items) {
        const id = key(item);
        if (result.has(id)) fail('duplicate');
        result.set(id, item);
    }
    return result;
}
function sameSet(actual, expected, code) {
    if (actual.size !== expected.size || [...actual.keys()].some(key => !expected.has(key))) fail(code);
}

// Binding index only. role_ref points to the registry; it does not publish
// another normative copy of semantic_role, order, contract hash or artifact root.
// A resolved operand is not proof that it was read, nor a validated-parent receipt.
function compileOperandBindings({ graphs, claims, evaluators, contracts }) {
    const claimMap = index(claims, claim => claim.fact_key);
    const graphMap = index(graphs, graph => graph.fact_key);
    const registry = index(evaluators, evaluatorKey);
    const contractMap = index(contracts, contract => contract.path);
    sameSet(graphMap, claimMap, 'claim_set');
    const outputKinds = { BRL_minor: ['money_minor'], count: ['nonnegative_integer'],
        entity_ids: ['id', 'id_set'], state: ['enum'] };
    for (const evaluator of evaluators) {
        const contract = contractMap.get(evaluator.contract_path)?.value;
        if (!contract || contract.metric !== evaluator.metric || contract.unit !== evaluator.unit
            || contract.stage !== 'authoring'
            || contract.signature?.operands !== 'resolve_roles_from_metric_evaluator_registry'
            || contract.signature?.context !== 'explicit_versioned_instrumented_claim') fail('contract');
        if (!outputKinds[evaluator.unit]?.includes(contract.signature.output.kind)) fail('output');
        index(evaluator.roles, role => role.role_id);
        for (const role of evaluator.roles) {
            if (!['claim_context', 'node', 'node_set', 'parent_claim'].includes(role.input_kind)) fail('kind');
            if (role.input_kind === 'node_set') {
                if (role.cardinality !== 'many' || typeof role.ordered !== 'boolean') fail('cardinality');
            } else if (role.cardinality !== 'one' || role.ordered !== false) fail('cardinality');
        }
    }
    let bindingCount = 0;
    const rows = [];
    for (const graph of graphs) {
        const claim = claimMap.get(graph.fact_key);
        const evaluator = registry.get(evaluatorKey(claim.evaluator_ref));
        if (!evaluator || graph.claim_id !== claim.claim_id) fail('claim');
        sameSet(new Set(Object.keys(claim.operand_bindings)), new Set(evaluator.roles.map(role => role.role_id)), 'role_set');
        const usedNodes = new Set();
        function node(alias) {
            const value = Object.hasOwn(graph.nodes, alias) ? graph.nodes[alias] : undefined;
            if (value?.binding !== 'snapshot' || !value.roles.includes('value_input')) fail('node');
            usedNodes.add(alias);
        }
        const operands = [];
        for (const role of evaluator.roles) {
            const binding = claim.operand_bindings[role.role_id];
            if (binding.kind !== role.input_kind) fail('kind');
            const resolved = { role_ref: { evaluator_id: evaluator.evaluator_id,
                evaluator_version: evaluator.evaluator_version, role_id: role.role_id }, kind: binding.kind };
            if (binding.kind === 'claim_context') resolved.claim_id = claim.claim_id;
            else if (binding.kind === 'node') { node(binding.alias); resolved.alias = binding.alias; }
            else if (binding.kind === 'node_set') {
                if (!Array.isArray(binding.aliases)) fail('aliases');
                index(binding.aliases, alias => alias);
                for (const alias of binding.aliases) node(alias);
                // Preserve even when ordered=false. No implicit sort/dedup.
                resolved.aliases = [...binding.aliases];
            } else {
                const edges = graph.edges.filter(edge => edge.relation === 'derived_from'
                    && edge.source === 'claim' && edge.field === role.role_id);
                if (edges.length !== 1) fail('parent');
                const parent = graph.nodes[edges[0].target];
                if (parent?.binding !== 'validated_parent' || parent.fact_key !== binding.fact_key
                    || !parent.roles.includes('value_input') || !graphMap.has(binding.fact_key)) fail('parent');
                usedNodes.add(edges[0].target);
                resolved.alias = edges[0].target;
                resolved.fact_key = binding.fact_key;
            }
            operands.push(resolved);
            bindingCount++;
        }
        sameSet(usedNodes, new Set(Object.keys(graph.nodes).filter(alias => graph.nodes[alias].roles.includes('value_input'))), 'value_inventory');
        rows.push({ fact_key: graph.fact_key, claim_id: claim.claim_id, operands });
    }
    return freezeDeep({ stage: 'operand_bindings_indexed_only', bindingCount, graphs: rows });
}

module.exports = { compileOperandBindings };
```

## src/next/provenance/operatorTypes.js

SHA-256 573db750922769a1626fe11c938458271b7cd09fdc5571df5c7b6786fa8d493c; Git blob 9960ac5fe96452f53fd651617c7529f581ae49ad; bytes 6064.

```javascript
'use strict';

// Internal compiler descriptors, never caller-provided evidence. This pass
// checks signature compatibility only; it does not resolve a path or evaluate
// a predicate, and must not be used as an acceptance decision on its own.
const SCALARS = new Set(['id', 'text', 'date', 'month', 'datetime', 'integer',
    'positive_integer', 'nonnegative_integer', 'money_minor', 'boolean', 'enum',
    'digest', 'timezone', 'calendar', 'civil_unit']);
const NUMBERS = new Set(['integer', 'positive_integer', 'nonnegative_integer', 'money_minor']);
const diagnostics = new WeakMap();
// Only failures minted by this checker carry authority; matching text or a
// copied Error never does. Consumers may add their own authored origin.
const fail = code => {
    const error = new Error(`operator_types_${code}`);
    diagnostics.set(error, Object.freeze({ checker: 'operator_types', code }));
    throw error;
};
const readOperatorTypeDiagnostic = error => diagnostics.get(error) ?? null;
function form(value, expected) {
    if (!value || value.form !== expected) fail('shape');
    return value;
}
function nominal(value) {
    if (typeof value !== 'string' || !value.length) fail('nominal_missing');
    return value;
}
function scalar(value) {
    form(value, 'scalar');
    if (!SCALARS.has(value.type)) fail('type');
    return value;
}
function identity(value) {
    if (value?.form === 'node') return JSON.stringify(['node', nominal(value.kind)]);
    scalar(value);
    if (value.type === 'id') return JSON.stringify(['id', nominal(value.kind)]);
    if (value.type === 'enum') return JSON.stringify(['enum', nominal(value.domain)]);
    if (value.type === 'money_minor') return JSON.stringify(['money_minor', nominal(value.unit)]);
    // Positive/nonnegative are validated range refinements of the same
    // dimensionless integer domain, not different units or identity kinds.
    if (NUMBERS.has(value.type)) return JSON.stringify(['scalar', 'integer']);
    return JSON.stringify(['scalar', value.type]);
}

function unifyOperatorTypes(operator, args) {
    if (!Array.isArray(operator?.args) || !Array.isArray(args) || operator.args.length !== args.length) fail('arity');
    const bindings = new Map();
    function bind(variable, value) {
        nominal(value);
        if (bindings.has(variable) && bindings.get(variable) !== value) fail('nominal_mismatch');
        bindings.set(variable, value);
    }
    function kind(variable, value) {
        if (!['K', 'A', 'B', 'J'].includes(variable)) fail('signature_unknown');
        bind(`kind:${variable}`, nominal(value));
    }
    function match(signature, value) {
        if (typeof signature !== 'string') fail('signature_unknown');
        if (signature.startsWith('set:') || signature.startsWith('sequence:')) {
            const colon = signature.indexOf(':');
            form(value, signature.slice(0, colon));
            match(signature.slice(colon + 1), value.item);
            return;
        }
        if (signature === 'T') { bind('type:T', identity(value)); return; }
        if (signature === 'scalar:T') {
            scalar(value);
            bind('type:T', identity(value));
            return;
        }
        if (signature === 'number:U') {
            scalar(value);
            if (!NUMBERS.has(value.type)) fail('type');
            const unit = value.type === 'money_minor' ? nominal(value.unit) : 'dimensionless_integer';
            bind('unit:U', unit);
            return;
        }
        if (/^node:[KABJ]$/.test(signature)) {
            kind(signature.slice(5), form(value, 'node').kind);
            return;
        }
        if (signature === 'field_path:T') {
            bind('type:T', identity(scalar(form(value, 'field').value)));
            return;
        }
        if (/^field_selector:[KABJ]:(T|date|enum)$/.test(signature)) {
            form(value, 'field_selector');
            const [, source, type] = signature.split(':');
            kind(source, value.kind);
            if (type === 'T') bind('type:T', identity(scalar(value.value)));
            else match(type, value.value);
            return;
        }
        if (/^edge_selector:[KABJ]:[KABJ]$/.test(signature)) {
            form(value, 'edge_selector');
            const [, source, target] = signature.split(':');
            kind(source, value.kind);
            kind(target, value.target);
            return;
        }
        if (signature === 'edge_ref:K') { kind('K', form(value, 'edge').target); return; }
        if (signature === 'sort_key_descriptor:K') { kind('K', form(value, 'sort').kind); return; }
        if (signature === 'predicate_template_ref') {
            kind('K', form(value, signature).kind);
            return;
        }
        if (['partial_coverage_policy_ref', 'kind_literal', 'digest_literal', 'state_literal'].includes(signature)) {
            form(value, signature);
            return;
        }
        if (signature === 'state_path') {
            if (scalar(form(value, 'field').value).type !== 'enum') fail('type');
            return;
        }
        if (signature === 'period') {
            if (!['period', 'range'].includes(value?.form)) fail('shape');
            return;
        }
        if (signature === 'range') { form(value, 'range'); return; }
        if (SCALARS.has(signature)) {
            if (scalar(value).type !== signature) fail('type');
            return;
        }
        fail('signature_unknown');
    }
    operator.args.forEach((signature, index) => match(signature, args[index]));
    if (['contains_civil_date', 'every_date_contained'].includes(operator.semantics)) {
        const kind = args[1]?.periodKind;
        if (kind !== undefined && !['date', 'as_of', 'through', 'statement_due',
            'month', 'statement_competence', 'budget_cycle', 'range'].includes(kind)) fail('non_civil_period');
    }
    return Object.freeze({ stage: 'signature_checked_only', bindings: Object.freeze(Object.fromEntries(bindings)) });
}

module.exports = { unifyOperatorTypes, readOperatorTypeDiagnostic };
```

## src/next/provenance/pathLocatorDomainV3.js

SHA-256 5e63d13db01a652d38c1888ac652435eb20e8b3b7c371f5d85c121141f36500f; Git blob ba1f2a371a52dde29dc3b2c5d51e132acc429ba6; bytes 11793.

```javascript
'use strict';
// Finite authored/schema enumeration for L only. No compiler probe, execution,
// observed IR, reference result, static exclusion or equivalence authority.
const { admittedDocuments } = require('./packageContract');
const { claimReferenceKind } = require('./claimNominalTypes');
const { copyData } = require('./observationContract');
const { canonicalValue, freezeDeep } = require('../kernel/canonicalValue');
const prefix = 'docs/contracts/next/provenance-v2/';
const diagnostics = new WeakMap();
function fail(code) {
    const error = new Error('path_locator_domain_v3_' + code);
    diagnostics.set(error, code); throw error;
}
const equal = (a, b) => canonicalValue(a) === canonicalValue(b);
const scalar = (type, extra = {}) => ({ form: 'scalar', type, ...extra });
const enumType = values => scalar('enum', { domain: JSON.stringify([...values].sort()) });
const copy = value => JSON.parse(JSON.stringify(value));
function createLocatorDomainEnumeration(packageReceipt) {
    const docs = new Map(admittedDocuments(packageReceipt).map(row => [row.path, row.value]));
    const corpus = docs.get(prefix + 'graphs-v2.json');
    const registry = docs.get(corpus.material_registry.path);
    const claimSchema = docs.get(prefix + 'claim-contract.schema.json');
    const claims = new Map(docs.get(corpus.claim_contract.path).claims.map(row => [row.fact_key, row]));
    const snapshots = docs.get(corpus.snapshot_manifest.path).snapshots;
    const graphs = new Map(corpus.graphs.map(row => [row.fact_key, row]));
    if (registry.closed_world !== true) fail('open_registry');
    const payload = node => {
        const matches = snapshots.filter(snapshot => snapshot.kind === node.kind
            && snapshot.ref_id === node.ref_id && snapshot.version === node.version);
        if (matches.length !== 1) fail('snapshot_identity');
        return matches[0].payload;
    };
    function materialNominal(kind, name, descriptor, node) {
        if (descriptor.class === 'non_material') return null;
        const type = descriptor.type;
        if (type === 'id') return scalar('id', { kind: name === 'id' ? kind : `${kind}.${name}` });
        if (type === 'enum') return enumType(descriptor.values);
        if (type === 'money_minor') return scalar(type, { unit: 'BRL_minor' });
        if (['ref', 'ref_list'].includes(type)) {
            let target;
            if (descriptor.targets.length === 1) target = descriptor.targets[0];
            else if (node && kind === 'collection' && name === 'members') {
                const origin = payload(node).collection_name;
                const matches = Object.entries(registry.kinds).filter(([, entry]) => entry.origin === origin);
                if (matches.length !== 1 || !descriptor.targets.includes(matches[0][0])) fail('collection_nominal');
                target = matches[0][0];
            } else if (node) {
                const value = payload(node)[name];
                const matches = snapshots.filter(snapshot => descriptor.targets.includes(snapshot.kind) && snapshot.ref_id === value);
                if (matches.length !== 1) fail('reference_nominal');
                target = matches[0].kind;
            } else fail('selector_nominal');
            const item = scalar('id', { kind: target });
            return type === 'ref' ? item : { form: 'sequence', item };
        }
        if (['typed_period', 'typed_result', 'role_ref_list'].includes(type)) return { form: 'record', type };
        if (!registry.types.includes(type)) fail('unknown_material_type');
        return scalar(type);
    }
    function resolve(schema, value, depth = 0) {
        if (depth > 32 || !schema || schema.anyOf || schema.allOf || schema.if || schema.not) fail('claim_grammar');
        if (schema.$ref) {
            const name = /^#\/definitions\/([A-Za-z0-9_]+)$/.exec(schema.$ref)?.[1];
            if (!name || !Object.hasOwn(claimSchema.definitions, name)) fail('claim_reference');
            return { ...resolve(claimSchema.definitions[name], value, depth + 1), ref: name };
        }
        if (schema.oneOf) {
            const branches = schema.oneOf.filter(branch => value && typeof value === 'object' && !Array.isArray(value)
                && (branch.required || []).every(name => Object.hasOwn(value, name))
                && Object.entries(branch.properties || {}).every(([name, property]) =>
                    (!Object.hasOwn(property, 'const') || value[name] === property.const)
                    && (!property.enum || property.enum.includes(value[name]))));
            if (branches.length !== 1) fail('claim_branch');
            return resolve(branches[0], value, depth + 1);
        }
        return { schema };
    }
    function claimPaths(claim) {
        const result = [];
        function walk(schema, value, segments, depth) {
            if (depth > 32) fail('claim_depth');
            const resolved = resolve(schema, value);
            if (segments.length) result.push({ segments, ...resolved });
            if (resolved.schema.type !== 'object') return;
            if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) fail('claim_shape');
            // L is schema-declared, not the subset present in this fixture.
            // Missing optional fields remain locators; their admission belongs
            // to A and must be justified separately, never silently filtered.
            const declared = Object.keys(resolved.schema.properties || {});
            const present = value === undefined ? [] : Object.keys(value);
            for (const name of [...new Set([...declared, ...present])].sort()) {
                const child = resolved.schema.properties?.[name]
                    || (resolved.schema.additionalProperties && typeof resolved.schema.additionalProperties === 'object'
                        ? resolved.schema.additionalProperties : null);
                if (!child) fail('claim_unclassified_property');
                walk(child, value?.[name], [...segments, name], depth + 1);
            }
        }
        walk(claimSchema.definitions.claim, claim, [], 0);
        return result;
    }
    function claimNominal(claim, entry) {
        const { schema, ref, segments } = entry;
        if (segments.length === 1 && segments[0] === 'period') return {
            form: claim.period.kind === 'range' ? 'range' : 'period', periodKind: claim.period.kind };
        if (ref === 'date' || ref === 'month') return scalar(ref);
        if (schema.enum || Object.hasOwn(schema, 'const')) return enumType(schema.enum || [schema.const]);
        if (ref === 'id') return scalar('id', { kind: segments[0] === 'subject'
            ? claimReferenceKind(claim, segments) : `claim.${segments.join('.')}` });
        if (schema.type === 'integer') return scalar(schema.minimum >= 1 ? 'positive_integer' : 'integer');
        if (schema.type === 'boolean') return scalar('boolean');
        if (schema.type === 'object') return { form: 'record' };
        if (schema.type === 'array') return { form: 'sequence', item: scalar('id', { kind: claimReferenceKind(claim, segments) }) };
        if (schema.type === 'string') return scalar('text');
        fail('claim_type');
    }
    const cachedClaims = new Map();
    function domain(target, site) {
        target = JSON.parse(JSON.stringify(copyData(target)));
        site = JSON.parse(JSON.stringify(copyData(site)));
        const graph = graphs.get(target.fact_key);
        const predicate = graph?.predicates.find(row => row.id === target.predicate_id);
        if (!predicate || site.class !== 'path') fail('site_identity');
        const location = site.site_path.slice(0, -1);
        let original = predicate;
        for (const token of location) {
            if (!Object.hasOwn(original, token)) fail('site_identity');
            original = original[token];
        }
        let namespace, originalNominal, options;
        if (site.definition === 'claimPath') {
            namespace = 'claim';
            const claim = claims.get(graph.fact_key);
            if (!claim) fail('claim_identity');
            if (!cachedClaims.has(graph.fact_key)) cachedClaims.set(graph.fact_key, claimPaths(claim));
            const entries = cachedClaims.get(graph.fact_key);
            const entry = entries.find(row => equal(row.segments, original.segments));
            if (!entry) fail('claim_path');
            originalNominal = claimNominal(claim, entry);
            options = entries.filter(row => equal(claimNominal(claim, row), originalNominal))
                .map(row => ({ segments: row.segments }));
        } else if (['fieldPath', 'selector'].includes(site.definition)) {
            namespace = 'material';
            const anchored = site.definition === 'fieldPath';
            const kind = anchored ? graph.nodes[original.node]?.kind : original.kind;
            const fields = registry.kinds[kind]?.fields;
            if (!fields || original.segments.length !== 1 || !fields[original.segments[0]]) fail('material_path');
            originalNominal = materialNominal(kind, original.segments[0], fields[original.segments[0]],
                anchored ? graph.nodes[original.node] : null);
            if (!originalNominal) fail('nonmaterial_baseline');
            const anchors = anchored ? Object.entries(graph.nodes).filter(([, node]) => node.kind === kind)
                .sort(([a], [b]) => a.localeCompare(b)) : [[null, null]];
            options = [];
            for (const [anchor, node] of anchors) for (const name of Object.keys(fields).sort()) {
                // Resolve a polymorphic reference only if its declared finite
                // target domain can share this nominal. A disjoint id domain
                // cannot hide a month/enum locator. This is L type projection,
                // not an admission/semantic exclusion based on fixture values.
                const descriptor = fields[name];
                if (['ref', 'ref_list'].includes(descriptor.type)) {
                    const possible = descriptor.targets.map(kind => descriptor.type === 'ref'
                        ? scalar('id', { kind }) : { form: 'sequence', item: scalar('id', { kind }) });
                    if (!possible.some(nominal => equal(nominal, originalNominal))) continue;
                }
                const nominal = materialNominal(kind, name, fields[name], node);
                if (nominal && equal(nominal, originalNominal)) options.push(anchored
                    ? { node: anchor, segments: [name] } : { kind, segments: [name] });
            }
        } else fail('namespace');
        const locators = options.filter(option => !equal(option, original));
        if (new Set(locators.map(locator => canonicalValue(locator))).size !== locators.length) fail('duplicate_locator');
        return freezeDeep({ namespace, location: copy(location), original: copy(original),
            original_nominal: originalNominal, locators,
            complete: true, scope: 'finite_authored_closed_world_L_only',
            admitted_domain_complete: false, discriminating_domain_complete: false });
    }
    return Object.freeze({ enumerateSite: domain, enumerateClaimLocators(factKey) {
        if (typeof factKey !== 'string') fail('claim_identity');
        const claim = claims.get(factKey);
        if (!claim) fail('claim_identity');
        if (!cachedClaims.has(factKey)) cachedClaims.set(factKey, claimPaths(claim));
        return freezeDeep(cachedClaims.get(factKey).map(entry => ({ segments: copy(entry.segments),
            nominal: claimNominal(claim, entry) })));
    } });
}
module.exports = { createLocatorDomainEnumeration,
    readLocatorDomainDiagnostic: error => diagnostics.get(error) ?? null };
```

## src/next/provenance/pathMutationInventory.js

SHA-256 095d9e6daec7c73ffd8ae940e00a401e899915c4f35477b50c8595e909d72275; Git blob 4bff604d73db4794ff52c814bb5408c7950597ba; bytes 42026.

```javascript
'use strict';
// HARNESS candidate only: this module never activates v2 or grants runtime credit.
const { createHash } = require('node:crypto');
const { types } = require('node:util');
const { canonicalValue, freezeDeep } = require('../kernel/canonicalValue');
const { copyData } = require('./observationContract');
const { admittedDocuments } = require('./packageContract');
const prefix = 'docs/contracts/next/provenance-v2/';
const ADDENDUM = 'f892a35fce88fe21d474bd7ed408fe2697052ce7';
const FROZEN_V1_HASH = 'sha256:2509cb7df02a98a1217a416c70b5f729b40ca331314ce2d925005ec15a779a9d';
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const id = (version, family, target) => sha(canonicalValue({ domain: 'financasbot.mutation-requirement.' + version, family, target }));
const fail = code => { throw new Error('path_inventory_v2_' + code); };
const clone = value => JSON.parse(JSON.stringify(copyData(value)));
const equal = (a, b) => canonicalValue(a) === canonicalValue(b);
const namespaces = Object.freeze({ node: 'nodes', edge: 'edges', set: 'sets',
    period_ref: 'windows', period: 'windows', template: 'predicate_templates' });
const inventoryContexts = new WeakMap();
const admissionContexts = new WeakMap();
const semanticContexts = new WeakMap();
const singleSiteProjections = new WeakMap();
function fields(raw, names) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const descriptors = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(descriptors).length !== names.length || names.some(name =>
        !descriptors[name]?.enumerable || !Object.hasOwn(descriptors[name], 'value'))) fail('input');
    return Object.fromEntries(names.map(name => [name, descriptors[name].value]));
}
// Schema is passive JSON, not observation data: $ref/$schema are legal keys.
function passiveSchema(raw) {
    let count = 0; const active = new Set();
    function read(value, depth) {
        if (++count > 65536 || depth > 64) fail('schema_limit');
        if (value === null || typeof value === 'string' || typeof value === 'boolean'
            || typeof value === 'number' && Number.isSafeInteger(value)) return value;
        if (!value || typeof value !== 'object' || types.isProxy(value) || active.has(value)) fail('schema_data');
        const array = Array.isArray(value);
        if (array ? Object.getPrototypeOf(value) !== Array.prototype
            : ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('schema_data');
        const d = Object.getOwnPropertyDescriptors(value); const keys = Reflect.ownKeys(d);
        if (keys.some(key => typeof key !== 'string')) fail('schema_data');
        active.add(value);
        let result;
        if (array) {
            if (keys.length !== d.length.value + 1) fail('schema_data');
            result = [];
            for (let i = 0; i < d.length.value; i++) {
                if (!d[i]?.enumerable || !Object.hasOwn(d[i], 'value')) fail('schema_data');
                result.push(read(d[i].value, depth + 1));
            }
        } else {
            result = {};
            for (const key of keys) {
                if (!d[key].enumerable || !Object.hasOwn(d[key], 'value')
                    || ['__proto__', 'constructor', 'prototype'].includes(key)) fail('schema_data');
                result[key] = read(d[key].value, depth + 1);
            }
        }
        active.delete(value); return result;
    }
    return read(raw, 0);
}
function sites(schema, arg, operand_index) {
    const result = [];
    function add(className, at, definition, namespace = null) {
        result.push({ class: className, site_path: at, definition, namespace });
    }
    function walk(value, rule, at, depth) {
        if (depth > 64) fail('schema_recursion');
        if (rule.$ref) {
            if (rule.$ref === 'urn:financasbot:next:claim-contract:2#/definitions/period') {
                if (at.at(-1) !== 'period_literal') fail('period_literal'); return;
            }
            if (!rule.$ref.startsWith('#/definitions/')) fail('schema_reference');
            const name = rule.$ref.slice('#/definitions/'.length);
            if (!Object.hasOwn(schema.definitions, name)) fail('schema_reference');
            if (name === 'literal') return;
            if (['fieldPath', 'claimPath', 'selector'].includes(name)) {
                if (!Array.isArray(value.segments) || !value.segments.length
                    || value.segments.some(token => typeof token !== 'string')) fail('path');
                add('path', [...at, 'segments'], name);
                if (name === 'fieldPath') {
                    if (typeof value.node !== 'string') fail('reference');
                    add('reference', [...at, 'node'], 'id', 'nodes');
                }
                return;
            }
            if (name === 'id' || name === 'reference') {
                const namespace = namespaces[at.at(-1)];
                if (!namespace) fail('unresolved_namespace');
                if (typeof (name === 'id' ? value : value.id) !== 'string') fail('reference');
                add('reference', name === 'id' ? at : [...at, 'id'], name, namespace); return;
            }
            return walk(value, schema.definitions[name], at, depth + 1);
        }
        if (rule.oneOf) {
            const matched = rule.oneOf.filter(branch => value && typeof value === 'object' && !Array.isArray(value)
                && (branch.required || []).every(key => Object.hasOwn(value, key))
                && (branch.additionalProperties !== false || Object.keys(value).every(key => Object.hasOwn(branch.properties || {}, key))));
            if (matched.length !== 1) fail('schema_branch');
            return walk(value, matched[0], at, depth + 1);
        }
        if (rule.anyOf || rule.allOf) fail('schema_composition');
        if (rule.type === 'object') {
            if (!value || typeof value !== 'object' || Array.isArray(value)) fail('schema_object');
            if ((rule.required || []).some(key => !Object.hasOwn(value, key))) fail('schema_required');
            for (const key of Object.keys(value).sort()) {
                const child = rule.properties?.[key] || (typeof rule.additionalProperties === 'object' ? rule.additionalProperties : null);
                if (!child) fail('unclassified_property');
                walk(value[key], child, [...at, key], depth + 1);
            }
        } else if (rule.type === 'array') {
            if (!Array.isArray(value) || !rule.items) fail('schema_array');
            value.forEach((child, index) => walk(child, rule.items, [...at, index], depth + 1));
        } else if (!rule.type && !rule.enum) fail('schema_leaf');
    }
    walk(arg, { $ref: '#/definitions/arg' }, ['args', operand_index], 0);
    if (new Set(result.map(row => canonicalValue(row.site_path))).size !== result.length) fail('duplicate_site');
    return result.sort((a, b) => canonicalValue(a.site_path).localeCompare(canonicalValue(b.site_path)));
}
function enumeratePathSites(rawSchema, rawArg, operand_index) {
    if (!Number.isSafeInteger(operand_index) || operand_index < 0) fail('operand_index');
    return freezeDeep(sites(passiveSchema(rawSchema), clone(rawArg), operand_index));
}

// Independent authored->IR conformance. No compiler/lowerer import, no site
// map supplied by the compiler, and no expansion of template body into sites.
function expectedExpression(arg, templates) {
    if (arg.template) {
        const template = templates.get(canonicalValue([arg.template.id, arg.template.version]));
        if (!template) fail('template_authority');
        const bindings = Object.fromEntries(Object.entries(arg.bindings)
            .map(([name, value]) => [name, expectedExpression(value, templates)]));
        const body = template.body.map(predicate => ({ op: predicate.op, operands: predicate.args.map(value => {
            if (Object.hasOwn(value, 'current_member_field_parameter')) {
                const binding = bindings[value.current_member_field_parameter];
                if (binding?.kind !== 'field_selector') fail('member_binding');
                return { kind: 'member_field', slot: 'current_member', node_kind: binding.node_kind, segments: binding.segments };
            }
            if (!Object.hasOwn(value, 'parameter') || !Object.hasOwn(bindings, value.parameter)) fail('template_parameter');
            return bindings[value.parameter];
        }) }));
        return { kind: 'predicate_template', template_ref: arg.template,
            combinator: 'all', member_slot: 'current_member', bindings, body };
    }
    const forms = Object.keys(arg); if (forms.length !== 1) fail('authored_form');
    const value = arg[forms[0]];
    switch (forms[0]) {
    case 'node': return { kind: 'node_ref', alias: value };
    case 'field': return { kind: 'field_ref', alias: value.node, segments: value.segments };
    case 'claim': return { kind: 'claim_ref', segments: value.segments };
    case 'selector': return { kind: 'field_selector', node_kind: value.kind, segments: value.segments };
    case 'presence': return { kind: 'field_presence', field: expectedExpression({ field: value }, templates) };
    case 'ref_set': return { kind: 'reference_set', field: expectedExpression({ field: value.field }, templates) };
    case 'set': return { kind: 'set_ref', name: value };
    case 'edge': return { kind: 'edge_ref', id: value };
    case 'period_ref': return { kind: 'window_ref', name: value };
    case 'period_bound': return { kind: 'window_bound', name: value.period, bound: value.bound };
    case 'literal': return { kind: 'literal', value_type: value.type, value: value.value };
    case 'period_literal': return { kind: 'period_literal', period: value };
    case 'projection': return { kind: 'projection', set: expectedExpression({ set: value.set }, templates),
        selector: expectedExpression({ selector: value.selector }, templates), as: value.as };
    case 'sort': return { kind: 'sort', tie_break: value.tie_break,
        keys: value.keys.map(key => ({ ...key, selector: expectedExpression({ selector: key.selector }, templates) })) };
    default: fail('ir_unclassified_form');
    }
}
function conformExpression(expected, actual) {
    if (!equal(expected, actual)) fail('ir_expression');
}
function enumeratePathInventoryCandidate(raw) {
    const { packageReceipt, ir: rawIr } = fields(raw, ['packageReceipt', 'ir']);
    const docs = admittedDocuments(packageReceipt);
    const documents = new Map(docs.map(row => [row.path, row.value]));
    const corpus = documents.get(prefix + 'graphs-v2.json');
    const schema = passiveSchema(documents.get(prefix + 'provenance-graph.schema.json'));
    const templatesDocument = documents.get(prefix + 'predicate-templates-v1.json');
    const templates = new Map(templatesDocument.templates.map(row => [canonicalValue([row.id, row.version]), row]));
    const context = { graphs: corpus.graphs, claims: documents.get(corpus.claim_contract.path).claims,
        materialRegistry: documents.get(corpus.material_registry.path) };
    const { validateTemplateReferences } = require('./templateReferences');
    validateTemplateReferences({ ...context, templates: templatesDocument,
        operators: documents.get(corpus.operator_registry.path).operators });
    const { compilePredicateTypes } = require('./predicateTypes');
    const typed = compilePredicateTypes({ ...context, snapshots: documents.get(corpus.snapshot_manifest.path).snapshots,
        operatorRegistry: documents.get(corpus.operator_registry.path),
        claimSchema: documents.get(prefix + 'claim-contract.schema.json') });
    const typeMap = new Map(typed.typedGraphs.map(row => [row.fact_key, row.predicates]));
    const ir = fields(rawIr, ['format', 'version', 'stage', 'executable', 'authority_refs', 'order', 'graphs']);
    if (!corpus || ir.format !== 'financasbot.provenance.authoring-ir' || ir.version !== 1
        || ir.stage !== 'typed_authoring_ir_only' || ir.executable !== false
        || !equal(clone(ir.authority_refs), docs.map(({ path, sha256 }) => ({ path, sha256 })))) fail('ir_authority');
    const order = clone(ir.order);
    if (!Array.isArray(ir.graphs) || types.isProxy(ir.graphs) || new Set(order).size !== order.length
        || order.length !== corpus.graphs.length || ir.graphs.length !== order.length) fail('ir_graphs');
    const descriptors = Object.getOwnPropertyDescriptors(ir.graphs);
    if (Reflect.ownKeys(descriptors).length !== order.length + 1) fail('ir_graphs');
    const graphMap = new Map(order.map((key, index) => {
        if (!descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], 'value')) fail('ir_graphs');
        const graph = clone(descriptors[index].value);
        if (graph.fact_key !== key) fail('ir_graphs'); return [key, graph];
    }));
    const requirementMap = new Map(); const allSites = []; const applicability = [];
    const add = (family, target) => {
        const mutation_id = id('v2', family, target);
        if (requirementMap.has(mutation_id)) fail('duplicate_requirement');
        requirementMap.set(mutation_id, { mutation_id, family, target, realization: 'UNSATISFIED_MUTATION_WITNESS' });
        return mutation_id;
    };
    const facts = new Set();
    for (const rawGraph of corpus.graphs) {
        const graph = clone(rawGraph); const compiled = graphMap.get(graph.fact_key);
        if (facts.has(graph.fact_key) || !compiled || compiled.predicates.length !== graph.predicates.length) fail('graph_identity');
        facts.add(graph.fact_key); const predicates = new Set();
        for (let pi = 0; pi < graph.predicates.length; pi++) {
            const predicate = graph.predicates[pi]; const lowered = compiled.predicates[pi];
            if (predicates.has(predicate.id) || ['id', 'op', 'atom', 'obligation'].some(key => predicate[key] !== lowered[key])
                || predicate.args.length !== lowered.operands.length) fail('predicate_identity');
            predicates.add(predicate.id);
            const perArg = predicate.args.map((arg, index) => {
                conformExpression(expectedExpression(arg, templates), lowered.operands[index].expression);
                if (!equal(typeMap.get(graph.fact_key)[pi].operands[index].type, lowered.operands[index].type)) fail('ir_type');
                return sites(schema, arg, index);
            });
            const pathSites = perArg.flat().filter(row => row.class === 'path');
            if (pathSites.length) add('predicate_path_semantic', { fact_key: graph.fact_key,
                predicate_id: predicate.id, strategy: 'same_type_wrong_path' });
            applicability.push({ fact_key: graph.fact_key, predicate_id: predicate.id,
                path_sites: pathSites.length, path_semantic_required: pathSites.length > 0 });
            for (const site of perArg.flat()) {
                const target = { fact_key: graph.fact_key, predicate_id: predicate.id,
                    site_path: site.site_path, definition: site.definition, namespace: site.namespace,
                    strategy: site.class === 'path' ? 'unknown_path' : 'unknown_reference' };
                const mutation_id = add(site.class === 'path' ? 'predicate_path_admission' : 'predicate_reference_admission', target);
                allSites.push({ ...site, fact_key: graph.fact_key, predicate_id: predicate.id, mutation_id });
            }
        }
    }
    if (facts.size !== graphMap.size) fail('extra_graph');
    const requirements = [...requirementMap.values()].sort((a, b) => a.mutation_id.localeCompare(b.mutation_id));
    const result = freezeDeep({ stage: 'path_inventory_v2_candidate_only', version: 2, addendum: ADDENDUM,
        activated: false, mutation_acceptance: false, executed: 0, matched: 0,
        authority_refs: docs.map(({ path, sha256 }) => ({ path, sha256 })),
        requirements, sites: allSites, applicability });
    inventoryContexts.set(result, { graphs: new Map(corpus.graphs.map(row => [row.fact_key, row])), requirements: requirementMap,
        documents, schema, typeMap, native: { ...context,
            snapshots: documents.get(corpus.snapshot_manifest.path).snapshots,
            operatorRegistry: documents.get(corpus.operator_registry.path),
            claimSchema: documents.get(prefix + 'claim-contract.schema.json'), templates: templatesDocument,
            operators: documents.get(corpus.operator_registry.path).operators } });
    return result;
}
function materializePathAdmissionCandidate(raw) {
    const { inventoryCandidate, mutation_id } = fields(raw, ['inventoryCandidate', 'mutation_id']);
    const context = inventoryContexts.get(inventoryCandidate);
    const requirement = context?.requirements.get(mutation_id);
    if (!requirement || !['predicate_path_admission', 'predicate_reference_admission'].includes(requirement.family)) fail('admission_authority');
    const target = requirement.target;
    const original = context.graphs.get(target.fact_key); const graph = clone(original);
    const predicate = graph.predicates.find(row => row.id === target.predicate_id);
    let container = predicate;
    for (const token of target.site_path.slice(0, -1)) {
        if (!container || !Object.hasOwn(container, token)) fail('site_missing'); container = container[token];
    }
    const leaf = target.site_path.at(-1); const before = clone(container[leaf]);
    const unknown = 'unknown_' + mutation_id.slice(7, 23);
    const after = requirement.family === 'predicate_path_admission'
        ? [...before.slice(0, -1), unknown] : unknown;
    container[leaf] = after;
    const result = freezeDeep({ stage: 'generated_path_admission_candidate_only', mutation_id,
        target: clone(target), graph, graph_sha256: sha(JSON.stringify(graph)),
        baseline_graph_sha256: sha(JSON.stringify(original)),
        patch: { location: clone(target.site_path), before, after },
        dp_execution: false, semantic_mutation_credit: 0, financial_receipt: false });
    admissionContexts.set(result, freezeDeep({ mutation_id, target: clone(target),
        graph_sha256: result.graph_sha256, baseline_graph_sha256: result.baseline_graph_sha256 }));
    return result;
}
const readPathAdmissionCandidate = candidate => admissionContexts.get(candidate) ?? null;
// Closed-world alternatives are sealed before observing D/P. This is a
// generator, not a completeness claim or a semantic qualification decision.
function enumeratePathSemanticCandidates(raw) {
    const { inventoryCandidate, mutation_id } = fields(raw, ['inventoryCandidate', 'mutation_id']);
    const context = inventoryContexts.get(inventoryCandidate);
    const requirement = context?.requirements.get(mutation_id);
    if (requirement?.family !== 'predicate_path_semantic') fail('semantic_authority');
    const original = context.graphs.get(requirement.target.fact_key);
    const predicate = original.predicates.find(row => row.id === requirement.target.predicate_id);
    const pathSites = inventoryCandidate.sites.filter(row => row.class === 'path'
        && row.fact_key === requirement.target.fact_key && row.predicate_id === requirement.target.predicate_id);
    const { compilePredicateTypes, readPredicateTypeDiagnostic } = require('./predicateTypes');
    const { validateTemplateReferences, readTemplateReferenceDiagnostic } = require('./templateReferences');
    const { materialFieldType } = require('./materialFieldTypes');
    const typeView = predicates => predicates.map(row => ({ id: row.id, op: row.op, atom: row.atom,
        obligation: row.obligation, operands: row.operands.map(operand => operand.type) }));
    const baselineTypes = typeView(context.typeMap.get(original.fact_key));
    const claim = context.native.claims.find(row => row.fact_key === original.fact_key);
    const claimPaths = [];
    function claimWalk(value, at) {
        if (at.length > 32) fail('claim_depth');
        if (at.length) claimPaths.push(at);
        if (value && typeof value === 'object' && !Array.isArray(value))
            Object.keys(value).sort().forEach(key => claimWalk(value[key], [...at, key]));
    }
    claimWalk(claim, []);
    function nominal(kind, segments) {
        const descriptor = context.native.materialRegistry.kinds[kind]?.fields[segments[0]];
        if (segments.length !== 1 || !descriptor || descriptor.class === 'non_material') return null;
        try { return materialFieldType(kind, segments, descriptor); }
        catch { return { kind, descriptor }; }
    }
    const candidates = []; const seen = new Set();
    for (const site of pathSites) {
        const location = site.site_path.slice(0, -1);
        let before = predicate;
        for (const token of location) before = before[token];
        const options = [];
        if (site.definition === 'claimPath') claimPaths.forEach(segments => options.push({ segments }));
        else {
            const kind = site.definition === 'fieldPath' ? original.nodes[before.node].kind : before.kind;
            const signature = nominal(kind, before.segments);
            if (!signature) fail('semantic_baseline_type');
            for (const name of Object.keys(context.native.materialRegistry.kinds[kind].fields).sort()) {
                const segments = [name]; const alternativeType = nominal(kind, segments);
                if (!alternativeType || !equal(signature, alternativeType)) continue;
                if (site.definition === 'fieldPath') {
                    for (const [node, declaration] of Object.entries(original.nodes).sort(([a], [b]) => a.localeCompare(b)))
                        if (declaration.kind === kind) options.push({ node, segments });
                } else options.push({ kind, segments });
            }
        }
        for (const after of options) {
            if (equal(before, after)) continue;
            const candidate_id = sha(canonicalValue({ domain: 'financasbot.path-semantic-candidate.v2',
                mutation_id, location, before, after }));
            if (seen.has(candidate_id)) fail('semantic_duplicate'); seen.add(candidate_id);
            const graph = clone(original); let container = graph.predicates.find(row => row.id === predicate.id);
            for (const token of location.slice(0, -1)) container = container[token];
            container[location.at(-1)] = clone(after);
            // Both native passes must resolve the locator and preserve all
            // nominal operand types. Full compiler admission is still required.
            let typed;
            try {
                validateTemplateReferences({ ...context.native, graphs: [graph] });
                typed = compilePredicateTypes({ ...context.native, graphs: [graph] });
            } catch (error) {
                if (readPredicateTypeDiagnostic(error) || readTemplateReferenceDiagnostic(error)) continue;
                throw error;
            }
            if (!equal(baselineTypes, typeView(typed.typedGraphs[0].predicates))) continue;
            const result = freezeDeep({ stage: 'generated_path_semantic_candidate_only', mutation_id,
                candidate_id, target: clone(requirement.target), site: clone(site), graph,
                graph_sha256: sha(JSON.stringify(graph)), baseline_graph_sha256: sha(JSON.stringify(original)),
                patch: { location, before: clone(before), after: clone(after) },
                expected_violations: [predicate.atom], operator_preserved: true,
                nominal_type_preserved: true, claim_oracle_preserved: true, material_payload_preserved: true,
                executed: 0, matched: 0, activated: false, financial_receipt: false });
            semanticContexts.set(result, freezeDeep({ mutation_id, candidate_id,
                graph_sha256: result.graph_sha256, baseline_graph_sha256: result.baseline_graph_sha256,
                expected_violations: result.expected_violations, authority_refs: inventoryCandidate.authority_refs }));
            candidates.push(result);
        }
    }
    return freezeDeep({ stage: 'path_semantic_alternatives_sealed_only', mutation_id,
        candidates, candidates_sha256: sha(canonicalValue(candidates.map(row => row.candidate_id))),
        required: true, executed: 0, matched: 0, activated: false,
        no_candidate_disposition: 'UNSATISFIED_MUTATION_WITNESS' });
}
const readPathSemanticCandidate = candidate => semanticContexts.get(candidate) ?? null;
function materializePathMigration(raw) {
    const input = fields(raw, ['packageReceipt', 'ir', 'frozenSource', 'expectedFrozenHash', 'frozenAuthorshipSource']);
    if (typeof input.frozenSource !== 'string' || input.frozenSource.length > 32 * 1024 * 1024
        || input.expectedFrozenHash !== FROZEN_V1_HASH || sha(input.frozenSource) !== FROZEN_V1_HASH) fail('frozen_authority');
    const frozen = JSON.parse(input.frozenSource);
    if (frozen.format !== 'financasbot.path-inventory.v1.frozen' || frozen.version !== 1
        || !Array.isArray(frozen.requirements)) fail('frozen_format');
    const historicalCorpusHash = frozen.authority_refs.find(row => row.path === prefix + 'graphs-v2.json')?.sha256;
    if (typeof input.frozenAuthorshipSource !== 'string' || input.frozenAuthorshipSource.length > 16 * 1024 * 1024
        || sha(input.frozenAuthorshipSource) !== historicalCorpusHash) fail('frozen_authorship');
    const historicalCorpus = JSON.parse(input.frozenAuthorshipSource);
    const candidate = enumeratePathInventoryCandidate({ packageReceipt: input.packageReceipt, ir: input.ir });
    const docs = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = docs.get(prefix + 'graphs-v2.json');
    const expectedOld = new Map();
    // Independent authored membership check, not the historic v1 enumerator.
    for (const graph of historicalCorpus.graphs) for (const predicate of graph.predicates)
        predicate.args.forEach((_, operand_index) => {
            for (const strategy of ['same_type_wrong_path', 'unknown_path']) {
                const target = { fact_key: graph.fact_key, predicate_id: predicate.id, operand_index, strategy };
                const oldId = id('v1', 'predicate_path_strategy', target);
                if (expectedOld.has(oldId)) fail('old_duplicate'); expectedOld.set(oldId, target);
            }
        });
    const newIds = new Set(candidate.requirements.map(row => row.mutation_id));
    const seen = new Set(); const linked = new Set(); const rows = [];
    const currentPredicates = new Map(corpus.graphs.flatMap(graph => graph.predicates.map(predicate =>
        [canonicalValue([graph.fact_key, predicate.id]), predicate])));
    const historicalPredicates = new Map(historicalCorpus.graphs.flatMap(graph => graph.predicates.map(predicate =>
        [canonicalValue([graph.fact_key, predicate.id]), predicate])));
    const grouped = new Map();
    for (const site of candidate.sites) {
        const key = canonicalValue([site.fact_key, site.predicate_id, site.site_path[1]]);
        if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(site);
    }
    for (const rawOld of frozen.requirements) {
        const old = clone(rawOld); const expected = expectedOld.get(old.mutation_id);
        if (seen.has(old.mutation_id) || old.family !== 'predicate_path_strategy' || !expected
            || !equal(old.target, expected)) fail('frozen_membership');
        seen.add(old.mutation_id);
        const { fact_key, predicate_id, operand_index, strategy } = old.target;
        const predicateKey = canonicalValue([fact_key, predicate_id]);
        const originalPredicate = historicalPredicates.get(predicateKey);
        const currentPredicate = currentPredicates.get(predicateKey);
        if (!currentPredicate || !equal(originalPredicate.args[operand_index], currentPredicate.args[operand_index]))
            fail('historical_target_changed_requires_new_migration_decision');
        const operandSites = grouped.get(canonicalValue([fact_key, predicate_id, operand_index])) || [];
        const hasPath = operandSites.some(site => site.class === 'path');
        const disposition = !operandSites.length ? 'superseded_literal_outside_path_domain'
            : strategy === 'unknown_path' ? 'remapped_admission_sites'
            : hasPath ? 'remapped_semantic_predicate' : 'superseded_unratified_semantic_reference';
        const mapped = strategy === 'unknown_path' ? operandSites.map(site => site.mutation_id)
            : hasPath ? [id('v2', 'predicate_path_semantic', { fact_key, predicate_id, strategy })] : [];
        for (const key of mapped) { if (!newIds.has(key)) fail('new_orphan'); linked.add(key); }
        rows.push({ old_id: old.mutation_id, old_target: old.target, disposition, new_ids: mapped,
            ratified_addendum: ADDENDUM, execution_credit: 0 });
    }
    if (seen.size !== expectedOld.size || [...expectedOld.keys()].some(key => !seen.has(key))) fail('old_missing');
    const introduced_sites = candidate.sites.filter(site => !linked.has(site.mutation_id)).map(site => ({ ...site,
        justification: 'new_authored_site_required_by_ratified_addendum' }));
    const introduced_requirements = candidate.requirements.filter(row => !linked.has(row.mutation_id)).map(row => ({ ...row,
        justification: 'new_authored_requirement_without_historical_v1_coordinate', execution_credit: 0 }));
    const declared = new Set([...linked, ...introduced_requirements.map(row => row.mutation_id)]);
    if (declared.size !== newIds.size || [...newIds].some(key => !declared.has(key))) fail('new_orphan');
    rows.sort((a, b) => a.old_id.localeCompare(b.old_id));
    return freezeDeep({ format: 'financasbot.path-inventory.migration', version: 2,
        stage: 'materialized_candidate_not_activated', addendum: ADDENDUM, frozen_v1_sha256: FROZEN_V1_HASH,
        exact_old_membership: true, activated: false, executed: 0, matched: 0,
        rows, introduced_sites, introduced_requirements, rows_sha256: sha(canonicalValue(rows)),
        new_ids_sha256: sha([...newIds].sort().join('\n')) });
}
function verifyMaterializedPathMigration(raw) {
    const input = fields(raw, ['packageReceipt', 'ir', 'frozenSource', 'expectedFrozenHash', 'frozenAuthorshipSource', 'migrationSource']);
    if (typeof input.migrationSource !== 'string' || input.migrationSource.length > 32 * 1024 * 1024) fail('migration_source');
    const expected = materializePathMigration({ packageReceipt: input.packageReceipt, ir: input.ir,
        frozenSource: input.frozenSource, expectedFrozenHash: input.expectedFrozenHash,
        frozenAuthorshipSource: input.frozenAuthorshipSource });
    if (!equal(expected, JSON.parse(input.migrationSource))) fail('persisted_migration');
    return freezeDeep({ verified: true, activated: false, executed: 0, matched: 0,
        rows: expected.rows.length, rows_sha256: expected.rows_sha256 });
}
// Trusted BUILD projection from the same admitted authored documents and
// declared nominal-type foundation used by the inventory. It does not read
// observed IR, a lowerer source, a trace or a semantic result as expected.
function projectPathInventoryAuthoredProof(raw) {
    const { inventoryCandidate, factKey } = fields(raw, ['inventoryCandidate', 'factKey']);
    const context = inventoryContexts.get(inventoryCandidate);
    if (!context || typeof factKey !== 'string' || !context.graphs.has(factKey)) fail('proof_authorship_authority');
    const graph = context.graphs.get(factKey), documents = context.documents;
    const templates = new Map(context.native.templates.templates.map(row => [canonicalValue([row.id, row.version]), row]));
    const operators = new Map(context.native.operatorRegistry.operators.map(row => [row.id, row]));
    const typed = context.typeMap.get(factKey);
    const predicates = graph.predicates.map((predicate, index) => ({ id: predicate.id,
        operator: clone(operators.get(predicate.op)), operands: predicate.args.map((arg, operandIndex) => ({
            type: clone(typed[index].operands[operandIndex].type), expression: expectedExpression(arg, templates) })) }));
    const windows = Object.fromEntries(Object.entries(graph.windows || {}).map(([name, window]) => [name,
        window.kind === 'month' ? { kind: 'month', value: expectedExpression(window.value, templates) }
            : { kind: 'range', start: expectedExpression(window.start, templates), end: expectedExpression(window.end, templates),
                start_inclusive: window.start_inclusive, end_inclusive: window.end_inclusive }]));
    const materials = Object.fromEntries(Object.entries(graph.nodes).map(([alias, node]) => [alias, {
        registry_version: context.native.materialRegistry.registry_version, kind: node.kind,
        fields: clone(context.native.materialRegistry.kinds[node.kind].fields) }]));
    return freezeDeep({ graph: clone(graph), input: { predicates, windows, materials,
        operators: clone(context.native.operatorRegistry.operators) },
        basis: 'authored_expressions_shared_declared_nominal_projection_not_observed_IR',
        authority_refs: [...documents].map(([path]) => inventoryCandidate.authority_refs.find(row => row.path === path)) });
}
// Whole finite authoring-IR projection. This is a conformance specification,
// not a second admission/compiler implementation or independent type authority.
// No lowerAuthoringIR/observed IR/compiler outputs/trace observations are read.
function projectPathInventoryAuthoredIR(raw) {
    const { inventoryCandidate } = fields(raw, ['inventoryCandidate']);
    const context = inventoryContexts.get(inventoryCandidate);
    if (!context) fail('whole_ir_authorship_origin');
    const corpus = context.documents.get(prefix + 'graphs-v2.json');
    const claims = new Map(context.native.claims.map(row => [row.fact_key, row]));
    const registry = context.documents.get(corpus.metric_evaluator_registry.path);
    const evaluators = new Map(registry.entries.map(row => [canonicalValue([row.evaluator_id, row.evaluator_version]), row]));
    const rows = new Map();
    for (const [factKey, graph] of context.graphs) {
        const claim = claims.get(factKey);
        const evaluator = evaluators.get(canonicalValue([claim.evaluator_ref.evaluator_id, claim.evaluator_ref.evaluator_version]));
        if (!evaluator || claim.claim_id !== graph.claim_id) fail('whole_ir_authority');
        const parents = [], operands = evaluator.roles.map(role => {
            const binding = claim.operand_bindings[role.role_id];
            if (!binding || binding.kind !== role.input_kind) fail('whole_ir_role');
            const resolved = { role_ref: { evaluator_id: evaluator.evaluator_id,
                evaluator_version: evaluator.evaluator_version, role_id: role.role_id }, kind: binding.kind };
            if (binding.kind === 'claim_context') resolved.claim_id = claim.claim_id;
            else if (binding.kind === 'node') resolved.alias = binding.alias;
            else if (binding.kind === 'node_set') resolved.aliases = clone(binding.aliases);
            else if (binding.kind === 'parent_claim') {
                const edges = graph.edges.filter(edge => edge.relation === 'derived_from'
                    && edge.source === 'claim' && edge.field === role.role_id);
                if (edges.length !== 1 || graph.nodes[edges[0].target]?.fact_key !== binding.fact_key
                    || !context.graphs.has(binding.fact_key)) fail('whole_ir_parent');
                resolved.alias = edges[0].target; resolved.fact_key = binding.fact_key;
                parents.push({ role: role.role_id, fact_key: binding.fact_key, alias: resolved.alias });
            } else fail('whole_ir_role_kind');
            return resolved;
        });
        const descriptor = {};
        for (const key of ['claim_id', 'fact_key', 'metric', 'unit', 'subject', 'period', 'time_basis',
            'coverage', 'evidence_state', 'filters', 'evaluator_ref'])
            if (Object.hasOwn(claim, key)) descriptor[key] = clone(claim[key]);
        const projected = projectPathInventoryAuthoredProof({ inventoryCandidate, factKey });
        const predicates = graph.predicates.map((predicate, index) => ({ id: predicate.id, op: predicate.op,
            obligation: predicate.obligation, atom: predicate.atom, operands: projected.input.predicates[index].operands }));
        const requiredStateChecks = graph.selections.flatMap(selection => graph.sets[selection.selected_set].flatMap(node => {
            const fields = context.native.materialRegistry.kinds[graph.nodes[node].kind].fields;
            const field = ['evidence_state', 'state'].find(name => fields[name]?.type === 'enum'
                && fields[name].values.includes('confirmed'));
            return field ? [{ node, field, expected: selection.input_evidence_state ?? claim.evidence_state }] : [];
        }));
        rows.set(factKey, { fact_key: factKey, claim_id: graph.claim_id,
            evaluator_ref: { evaluator_id: evaluator.evaluator_id, evaluator_version: evaluator.evaluator_version },
            claim: descriptor, parents, operands, nodes: clone(graph.nodes), sets: clone(graph.sets),
            windows: projected.input.windows, edges: clone(graph.edges), predicates,
            obligations: clone(graph.obligations), selections: clone(graph.selections),
            expected_trace: clone(graph.trace_contract), required_state_checks: requiredStateChecks });
    }
    // Closed authorial dependency topology, sorted roots and registry role
    // order. This does not grant parent receipts or resolve live parent values.
    const order = [], active = new Set(), seen = new Set();
    function visit(key) {
        if (active.has(key) || !rows.has(key)) fail('whole_ir_topology');
        if (seen.has(key)) return;
        active.add(key); rows.get(key).parents.forEach(parent => visit(parent.fact_key));
        active.delete(key); seen.add(key); order.push(key);
    }
    [...rows.keys()].sort().forEach(visit);
    return freezeDeep({ format: 'financasbot.provenance.authoring-ir', version: 1,
        stage: 'typed_authoring_ir_only', executable: false,
        authority_refs: clone(inventoryCandidate.authority_refs), order, graphs: order.map(key => rows.get(key)) });
}
// Trusted BUILD single-site projection. Reuse the immutable baseline context,
// recomputing only the changed graph's declared nominal types BEFORE normal
// compiler admission. No observed IR or candidate result is an input here.
function projectPathSingleSiteAuthoredIR(raw) {
    const { inventoryCandidate, packageReceipt, factKey } = fields(raw, ['inventoryCandidate', 'packageReceipt', 'factKey']);
    return projectPathInventoryAuthoredIR({ inventoryCandidate: singleSiteProjection(inventoryCandidate, packageReceipt, factKey) });
}
function projectPathSingleSiteAuthoredProof(raw) {
    const { inventoryCandidate, packageReceipt, changedFactKey, factKey } = fields(raw,
        ['inventoryCandidate', 'packageReceipt', 'changedFactKey', 'factKey']);
    return projectPathInventoryAuthoredProof({ inventoryCandidate: singleSiteProjection(inventoryCandidate, packageReceipt, changedFactKey), factKey });
}
function singleSiteProjection(inventoryCandidate, packageReceipt, factKey) {
    const baseline = inventoryContexts.get(inventoryCandidate);
    if (!baseline || typeof factKey !== 'string' || !baseline.graphs.has(factKey)) fail('single_site_origin');
    const cached = singleSiteProjections.get(packageReceipt);
    if (cached) {
        if (cached.inventoryCandidate !== inventoryCandidate || cached.factKey !== factKey) fail('single_site_cache_identity');
        return cached.projection;
    }
    const docs = admittedDocuments(packageReceipt);
    const authority = docs.map(({ path, sha256 }) => ({ path, sha256 }));
    if (authority.length !== inventoryCandidate.authority_refs.length || authority.some((row, index) =>
        row.path !== inventoryCandidate.authority_refs[index].path
        || row.path !== prefix + 'graphs-v2.json' && row.sha256 !== inventoryCandidate.authority_refs[index].sha256))
        fail('single_site_package');
    const documents = new Map(docs.map(row => [row.path, row.value]));
    const corpus = documents.get(prefix + 'graphs-v2.json'), original = baseline.documents.get(prefix + 'graphs-v2.json');
    const { graphs, ...header } = corpus, { graphs: originalGraphs, ...originalHeader } = original;
    if (!equal(header, originalHeader) || graphs.length !== originalGraphs.length
        || graphs.some((graph, index) => graph.fact_key !== originalGraphs[index].fact_key
            || graph.fact_key !== factKey && !equal(graph, originalGraphs[index]))) fail('single_site_graphs');
    const graph = graphs.find(row => row.fact_key === factKey);
    const { compilePredicateTypes } = require('./predicateTypes');
    const typed = compilePredicateTypes({ ...baseline.native, graphs: [graph] });
    const typeMap = new Map(baseline.typeMap);
    typeMap.set(factKey, typed.typedGraphs[0].predicates);
    const projection = freezeDeep({ authority_refs: authority });
    inventoryContexts.set(projection, { ...baseline, documents,
        graphs: new Map(graphs.map(row => [row.fact_key, row])), typeMap,
        native: { ...baseline.native, graphs } });
    singleSiteProjections.set(packageReceipt, { inventoryCandidate, factKey, projection });
    return projection;
}
module.exports = { enumeratePathSites, enumeratePathInventoryCandidate, materializePathMigration,
    verifyMaterializedPathMigration, materializePathAdmissionCandidate, readPathAdmissionCandidate,
    enumeratePathSemanticCandidates, readPathSemanticCandidate, projectPathInventoryAuthoredProof,
    projectPathInventoryAuthoredIR, projectPathSingleSiteAuthoredIR, projectPathSingleSiteAuthoredProof, FROZEN_V1_HASH, ADDENDUM };
```

## src/next/provenance/pathQualificationV3.js

SHA-256 71755d8044006ffae70f80248db87ddaa2aa45f5346fa4ea69b0ec7937683a0d; Git blob 6b2617986c425edea53a3600ac1d1a5835c3123d; bytes 100438.

```javascript
'use strict';
// BUILD preparation only. Inventory integrity is not domain completeness,
// an executed barrier, a semantic witness or an approved qualification row.
const { createHash, randomUUID } = require('node:crypto');
const { types } = require('node:util');
const { canonicalValue, freezeDeep } = require('../kernel/canonicalValue');
const { copyData } = require('./observationContract');
const { projectClaimContext } = require('./claimContext');
const { enumeratePathInventoryCandidate, materializePathAdmissionCandidate, projectPathInventoryAuthoredProof,
    projectPathInventoryAuthoredIR, projectPathSingleSiteAuthoredIR, projectPathSingleSiteAuthoredProof, ADDENDUM } = require('./pathMutationInventory');
const { createLocatorDomainEnumeration, readLocatorDomainDiagnostic } = require('./pathLocatorDomainV3');
const { admitPackage, admittedDocuments, admittedPackageEntries } = require('./packageContract');
const { resolvePhaseCompositionMode, phaseCompositionCommitment } = require('./phaseCompositionProfile');
const METHOD = Object.freeze({
    commit: '72fc5a5b707909687da9b5cec892be2dcc892a62',
    blob: '82112f0c4d6eeed21d4823c8b1dd3d3ca8ce1bf2',
    utf8_lf_sha256: 'sha256:0c831d290c0ae47960d1fc11b9ea530d792a926cb2211a1313d7d070f0d24eba'
});
// Private reuse of the same necessary selection projection. It is not a
// caller option or an admission authority. Public preparation still builds
// the full twelve-pass foundation, and the narrow result is never admitted
// into the full-domain verifier's WeakMap.
const NECESSARY_SELECTION_PROJECTION = Symbol('necessary_selection_projection');
// Finite preservation lemmas for the inspected NORMAL bodies, not general
// JavaScript read/effect analysis. Pins are predeclared, never measured from a
// caller's candidate or silently recaptured to bless a changed checker. These
// First four bodies read only retained roots/unchanged documents. The template
// body additionally reads all template arguments and set peers, retained by
// its separate finite query; a changed named binding is NOT an equal frame.
// The obligation body reads all predicate IDs/metadata, identity/integrity and
// reference-target arguments, nodes/edges/trace roots and immutable snapshot
// documents. Parent anchors are node_identity arguments, not a separate
// unretained input. The entire participating list is retained in original order.
// Ordinary claim and collection checks retain every direct claim root and
// every potential descriptor/period or fixture/membership participant, plus
// the entire graph roots and immutable claim/snapshot/registry documents.
// Qualification-specific transported claim locators are NOT covered here.
// Helpers see those declared inputs or freshly constructed output.
// Whole normal baseline admission and the normal primitive/data contracts are
// explicit premises. Construction/byte binding is not independent code audit.
const NORMAL_READ_SOURCE_PINS = Object.freeze({
    'src/next/provenance/graphCompiler.js': 'sha256:fe938a128cfd4dccda0d8ddc1f2e6965b623feecc6d1854ef0306700efda1016',
    'src/next/provenance/operandBindings.js': 'sha256:50cacfb104e9e792d1118428f81fe659b4ae9c07407b979a1c2b122141303e60',
    'src/next/provenance/schemaRegistryProjection.js': 'sha256:282b949ff0c546b3b20ec7cbe6a3b00a3ab28ed19e8d951d5379f011b2ddd84d',
    'src/next/provenance/templateReferences.js': 'sha256:bd5c186192b41d991f8fc1bf74dce0f372d8ff8ac63a845eaa029640a7d3f34f',
    'src/next/provenance/obligationBindings.js': 'sha256:580f9b97e6ef216e5598de5c97aa8d96cc7cda713a5547e249a27f24144baf87',
    'src/next/provenance/claimRequirements.js': 'sha256:2a42d47868a57fad697a0caec0ae0678a338f06dca0ebf77064fab6def182468',
    'src/next/provenance/claimRequirementCore.js': 'sha256:1f23d4c8fb117bb5bd6bf992cc1bf4ea0806c01372853395fb2c341b9968de23',
    'src/next/provenance/claimNominalTypes.js': 'sha256:f37c4367c027d119caf81afcb1de898a05b5edfd6651c8c3a17d3177cff95096',
    'src/next/provenance/collectionRequirements.js': 'sha256:4d6af2b5d830929910622f504126dfea29c3ba6866ff99e21c90e23f12961de3',
    'src/next/provenance/selectionBindings.js': 'sha256:dafa79661a2474ad05c2390c86adcf136dc8ac395d10a28a6a4d7deeccac9815',
    'src/next/provenance/operatorTypes.js': 'sha256:573db750922769a1626fe11c938458271b7cd09fdc5571df5c7b6786fa8d493c',
    'src/next/provenance/literalTypes.js': 'sha256:c99b3a919c995638702325dcb7c2cb1f8e338388700429b3bc9f1cce7a00b4ec',
    'src/next/provenance/civilCalendar.js': 'sha256:b67c689a7dc7f4227336ffbeeda81793c6202ac62cda557db236022903fce899',
    'src/next/kernel/canonicalValue.js': 'sha256:f6d571ddc1c7917f6a0ec8e25b17368c3e23ba10111ea5aa591c692d6739205b'
});
const NORMAL_READ_RULE_CONTRACTS = freezeDeep([
    ['static_evidence', 'validateStaticEvidence', 'src/next/provenance/graphCompiler.js'],
    ['graph_dependencies', 'indexGraphDependencies', 'src/next/provenance/graphCompiler.js'],
    ['operand_bindings', 'compileOperandBindings', 'src/next/provenance/operandBindings.js'],
    ['schema_registry_projection', 'validateSchemaRegistryProjection', 'src/next/provenance/schemaRegistryProjection.js'],
    ['template_references', 'validateTemplateReferences', 'src/next/provenance/templateReferences.js',
        ['src/next/provenance/operatorTypes.js', 'src/next/provenance/literalTypes.js', 'src/next/provenance/civilCalendar.js'],
        'all_template_arguments_set_peers_and_graph_roots_with_unchanged_documents'],
    ['obligation_bindings', 'validateObligationBindings', 'src/next/provenance/obligationBindings.js', [],
        'all_predicate_metadata_participating_arguments_and_entire_graph_roots_with_unchanged_documents'],
    ['claim_requirements', 'validateClaimRequirements', 'src/next/provenance/claimRequirements.js',
        ['src/next/provenance/claimRequirementCore.js', 'src/next/provenance/claimNominalTypes.js'],
        'ordinary_only_all_direct_claim_roots_descriptor_subject_period_arguments_and_graph_roots_with_unchanged_claims'],
    ['collection_requirements', 'validateCollectionRequirements', 'src/next/provenance/collectionRequirements.js', [],
        'all_fixture_membership_anchor_arguments_and_entire_graph_roots_with_unchanged_snapshot_registry_documents'],
    ['selection_bindings', 'validateSelectionBindings', 'src/next/provenance/selectionBindings.js', [],
        'all_selection_referenced_predicate_arguments_metadata_and_entire_graph_roots_with_unchanged_claim_registry_documents']
].map(([pass_id, entrypoint, source, helpers = [],
    read_projection = 'graph_without_predicates_and_unchanged_non_corpus_documents']) => ({ pass_id, entrypoint,
    source_bindings: [source, ...helpers, 'src/next/kernel/canonicalValue.js'].map(path => ({ path, sha256: NORMAL_READ_SOURCE_PINS[path] })),
    scope: 'finite_pinned_normal_body_under_plain_admitted_data_and_normal_primitives',
    read_projection,
    complete_single_site_authorship_family_required: true,
    admitted_plain_data_required: true, normal_primitives_required: true,
    baseline_admission_required: true, checker_byte_binding_required: true, argument_site_only: true,
    conclusion: 'normal_static_success_preserved_under_explicit_baseline_and_byte_premises',
    normal_baseline_admission_verified: false, independent_code_audit: false })));
// The NORMAL structural pass reads a replacement path through one of three
// already declared locator forms. All other arguments, graph relations and
// documents remain in the single-site frame. This finite rule does NOT replace
// type/template/selection/relational admission or execute a candidate compiler.
const NORMAL_STRUCTURAL_LOCATOR_CONTRACT = freezeDeep({
    checker: 'graph_structure', entrypoint: 'validateGraphStructure',
    source_bindings: [
        ['src/next/provenance/graphStructure.js', '927a4e76b6a7c9f8ad8656e21a44766a745c2edd3113b82ff7231a1c2bc79e50'],
        ['src/next/provenance/literalTypes.js', 'c99b3a919c995638702325dcb7c2cb1f8e338388700429b3bc9f1cce7a00b4ec'],
        ['src/next/provenance/civilCalendar.js', 'b67c689a7dc7f4227336ffbeeda81793c6202ac62cda557db236022903fce899'],
        ['src/next/kernel/canonicalValue.js', NORMAL_READ_SOURCE_PINS['src/next/kernel/canonicalValue.js'].slice(7)]
    ].map(([path, value]) => ({ path, sha256: 'sha256:' + value })),
    definitions: ['claimPath', 'fieldPath', 'selector'],
    scope: 'genuine_complete_L_and_single_site_argument_structural_resolution_only',
    baseline_admission_required: true, checker_byte_binding_required: true,
    plain_admitted_data_required: true, normal_primitives_required: true,
    rule_discharge_complete: false, independent_code_audit: false
});
// Finite draft-07 preservation, not a second validator or a new schema.
// The genuine single-site substitution keeps its locator branch and all
// surrounding keys, predicates/graph identities and non-corpus documents.
// Unique predicate identities prevent a changed argument from making two
// complete predicates equal under uniqueItems. A positive whole NORMAL
// baseline and the NORMAL draft-07 validator/dependencies remain premises.
const NORMAL_PACKAGE_SCHEMA_CONTRACT = freezeDeep({
    checker: 'package_schemas', variant: 'ordinary_single_site_locator_only',
    definitions: ['fieldPath', 'selector', 'claimPath'],
    source_bindings: [
        { path: 'src/next/provenance/graphCompiler.js', sha256: NORMAL_READ_SOURCE_PINS['src/next/provenance/graphCompiler.js'] },
        { path: 'scripts/agent/buildNextProvenanceArtifacts.mjs', sha256: 'sha256:a563450252a995a0a35d83dc921c8af931bcb330c642e6de7a92857cd3a2fb2b' },
        { path: 'src/next/kernel/canonicalValue.js', sha256: NORMAL_READ_SOURCE_PINS['src/next/kernel/canonicalValue.js'] }
    ],
    schema_sources: [
        ['claim-contract', 'b69ef61b562061f057a9bf08f47623ae432c723f565e8775f3dbe6eb942ea998'],
        ['evaluator-contract', '2c3bc0a86bf45da2c4466118bb6ad9506f1824a209c419c3c7180718e294a183'],
        ['evaluator-witness-contracts', 'dd5af1b4ab9d29f67d87b7b979076f8b4695cd917062d63ec34da6c12240adaa'],
        ['evidence-snapshot', '054a48930a5f25760f201e8b401f0f34f5a83672366acad6c9c09bdc0ce0b5ef'],
        ['metric-evaluator-registry', 'de5eb3828b8faaf58eeddc9f90d9342b509f86fd32ea8b66f9174448c536e066'],
        ['provenance-graph', '9e3c148c95d6fecd3d93f019ad5a5967126f8bf1cb9bde9d152c70c057a1740b']
    ].map(([stem, hash]) => ({ path: 'docs/contracts/next/provenance-v2/' + stem + '.schema.json', sha256: 'sha256:' + hash })),
    baseline_admission_required: true, complete_single_site_family_required: true,
    unchanged_non_corpus_documents_required: true, unique_predicate_and_graph_identities_required: true,
    shared_normal_draft07_validator_and_dependencies: true, independent_validator: false,
    normal_baseline_admission_verified: false, discharged: false, independent_code_audit: false
});
// Ordinary type preservation for material PRIMITIVES only. The NORMAL
// fieldValue constructor has no reference-target/member lookup on this
// branch. Its nonliteral known value is ignored by signature refinements;
// windows, literals, set hints and all other operands stay in the frame.
// Enum peer membership is preserved by the complete declared enum domain,
// id nominal and money unit by their exact constructors. References, records
// and claim-schema resolution require separate foundations, not this lemma.
const NORMAL_PRIMITIVE_TYPE_CONTRACT = freezeDeep({
    checker: 'predicate_types', entrypoint: 'compilePredicateTypes', variant: 'ordinary_only',
    source_bindings: [
        { path: 'src/next/provenance/predicateTypes.js', sha256: 'sha256:7ec5e1dc0348599bf42aa642a575233bb3642371fb2a48bea77b2558de6a25b8' },
        { path: 'src/next/provenance/claimNominalTypes.js', sha256: 'sha256:f37c4367c027d119caf81afcb1de898a05b5edfd6651c8c3a17d3177cff95096' },
        ...['operatorTypes', 'literalTypes', 'civilCalendar'].map(name => ({
            path: 'src/next/provenance/' + name + '.js', sha256: NORMAL_READ_SOURCE_PINS['src/next/provenance/' + name + '.js'] })),
        { path: 'src/next/kernel/canonicalValue.js', sha256: NORMAL_READ_SOURCE_PINS['src/next/kernel/canonicalValue.js'] }
    ],
    scope: 'finite_material_primitive_constructors_and_unchanged_operator_peer_inputs',
    primitive_types: ['id', 'text', 'date', 'month', 'datetime', 'integer', 'positive_integer',
        'nonnegative_integer', 'money_minor', 'boolean', 'enum', 'digest', 'timezone', 'calendar', 'civil_unit'],
    baseline_admission_required: true, complete_single_site_family_required: true,
    plain_admitted_data_required: true, normal_primitives_required: true,
    checker_byte_binding_required: true, rule_discharge_complete: false,
    independent_code_audit: false
});
const contexts = new WeakMap();
const candidatePackages = new WeakMap();
const staticPlans = new WeakMap();
const historicalMigrations = new WeakMap();
const admissionDomains = new WeakMap();
const selectionControlPlans = new WeakMap();
const proofAuthorships = new WeakMap();
const phaseAuthorships = new WeakMap();
const wholeIRReferences = new WeakMap();
const candidateIRReferences = new WeakMap();
const wholeIRFailures = new WeakMap();
const programAuthorshipFamilies = new WeakMap();
const witnessPreselections = new WeakMap();
// Existing historical evidence only. This pin identifies immutable bytes; it
// does not approve that report, reuse its execution or supply v3 expected.
const HISTORICAL_REPORT = 'sha256:3187e36259bc11fcd2c9063a6a4ba25987f1e1acca18a81a96aee87834b007d0';
const corpusPath = 'docs/contracts/next/provenance-v2/graphs-v2.json';
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const equal = (a, b) => canonicalValue(a) === canonicalValue(b);
const plain = value => JSON.parse(JSON.stringify(copyData(value)));
const fail = code => { throw new Error('path_qualification_v3_' + code); };
function fields(raw, names) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== names.length || names.some(name => !d[name]?.enumerable
        || !Object.hasOwn(d[name], 'value'))) fail('input');
    return Object.fromEntries(names.map(name => [name, d[name].value]));
}
function passiveRows(raw, count) {
    if (!Array.isArray(raw) || types.isProxy(raw) || Object.getPrototypeOf(raw) !== Array.prototype) fail('rows');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (d.length.value !== count || Reflect.ownKeys(d).length !== count + 1) fail('rows');
    return Array.from({ length: count }, (_, index) => {
        if (!d[index]?.enumerable || !Object.hasOwn(d[index], 'value')) fail('rows');
        // One bounded transport per causal row; no enlarged transport quotas.
        return plain(d[index].value);
    });
}
function preparePathQualificationInventory(raw) {
    const input = fields(raw, ['packageReceipt', 'ir']);
    // Reuse the admitted schema traversal and whole authored/IR conformance.
    // Do NOT reuse the filtered v2 candidate list as a complete L/A/W domain.
    const inventory = enumeratePathInventoryCandidate(input);
    const expectedIR = projectPathInventoryAuthoredIR({ inventoryCandidate: inventory });
    const irSeal = sealWholeIR(expectedIR);
    const wholeIRConformance = assertWholeIR(input.ir, irSeal);
    const enumerateDomain = createLocatorDomainEnumeration(input.packageReceipt);
    const targets = inventory.requirements.filter(row => row.family === 'predicate_path_semantic');
    const grouped = new Map();
    for (const site of inventory.sites.filter(row => row.class === 'path')) {
        const key = canonicalValue([site.fact_key, site.predicate_id]);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(site);
    }
    const rows = targets.map(target => {
        const sites = grouped.get(canonicalValue([target.target.fact_key, target.target.predicate_id]));
        if (!sites?.length) fail('target_without_site');
        return {
            qualification_id: sha(canonicalValue({ domain: 'financasbot.path-qualification.v3',
                target_id: target.mutation_id, authority: METHOD })),
            target_id: target.mutation_id, target: plain(target.target),
            old_authority: ADDENDUM, v2_inventory_realization: target.realization,
            historical_evidence: null,
            sites: sites.map(site => {
                let domain = null, domainReason = null;
                try { domain = enumerateDomain.enumerateSite(target.target, site); }
                catch (error) {
                    domainReason = readLocatorDomainDiagnostic(error);
                    if (!domainReason) throw error;
                }
                return { authored_site: plain(site), domain, domain_complete: domain !== null,
                    domain_reason: domainReason, admitted_domain_complete: false,
                    admission_controls: null, necessary_equivalence: null };
            }),
            disposition: 'blocked', status: 'blocked',
            reasons: ['complete_locator_domain_and_qualification_evidence_pending'],
            dp_execution: false, semantic_mutation_credit: 0,
            historical_state_changed: false
        };
    });
    const targetIds = rows.map(row => row.target_id);
    const siteCount = rows.reduce((n, row) => n + row.sites.length, 0);
    if (new Set(targetIds).size !== rows.length || siteCount !== inventory.sites.filter(row => row.class === 'path').length)
        fail('exact_partition');
    const header = { format: 'financasbot.path-qualification.inventory', version: 3,
        stage: 'prepared_inventory_not_qualified', method_authority: METHOD,
        old_authority: ADDENDUM, authority_refs: inventory.authority_refs,
        expected_predicates: rows.length, enumerated_predicates: rows.length,
        authored_sites: siteCount, target_ids_sha256: sha(canonicalValue(targetIds)),
        rows_sha256: sha(canonicalValue(rows)), whole_ir_conformance: wholeIRConformance,
        verified: 0, blocked: rows.length,
        semantic_mutation_credit: 0, activated: false, global_g11: false,
        financial_receipt: false, validation_tcb_complete: false };
    const result = freezeDeep({ ...header, rows });
    contexts.set(result, { header, rows, inventory, packageReceipt: input.packageReceipt, irSeal });
    return result;
}
function sealWholeIR(expected) {
    const { graphs, ...header } = expected;
    return { expected, header: canonicalValue(header), graphs: graphs.map(row => canonicalValue(row)),
        sha256: sha(canonicalValue(expected)) };
}
function assertWholeIR(raw, seal) {
    const { graphs, ...header } = fields(raw, Object.keys(seal.expected));
    const actualHeader = canonicalValue(plain(header));
    if (actualHeader !== seal.header) wholeIRFailure('whole_ir_header_identity', null, seal.header, actualHeader);
    if (!Array.isArray(graphs) || types.isProxy(graphs) || Object.getPrototypeOf(graphs) !== Array.prototype)
        fail('whole_ir_graphs');
    const descriptors = Object.getOwnPropertyDescriptors(graphs);
    if (descriptors.length.value !== seal.graphs.length || Reflect.ownKeys(descriptors).length !== seal.graphs.length + 1)
        fail('whole_ir_graphs');
    for (let index = 0; index < seal.graphs.length; index++) {
        const descriptor = descriptors[index];
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail('whole_ir_graph_identity');
        const actual = canonicalValue(plain(descriptor.value));
        if (actual !== seal.graphs[index]) wholeIRFailure('whole_ir_graph_identity', index, seal.graphs[index], actual);
    }
    return freezeDeep({ whole_ir_conformance: true, ir_sha256: seal.sha256, graphs: seal.graphs.length,
        independent_compiler: false, qualified: false, semantic_mutation_credit: 0 });
}
function wholeIRFailure(code, graphIndex, expected, actual) {
    const error = new Error('path_qualification_v3_' + code);
    wholeIRFailures.set(error, freezeDeep({ code, graph_index: graphIndex,
        expected_sha256: sha(expected), observed_sha256: sha(actual),
        observed_canonical_json: actual, qualified: false, semantic_mutation_credit: 0 }));
    throw error;
}
function readPathWholeIRFailure(error) { return wholeIRFailures.get(error) ?? null; }
function preparePathWholeIRReference(raw) {
    const { preparation } = fields(raw, ['preparation']);
    const context = contexts.get(preparation);
    if (!context) fail('whole_ir_preparation_origin');
    const receipt = freezeDeep({ stage: 'path_v3_whole_authored_ir_reference_before_mutant', method_authority: METHOD,
        authority_refs: context.inventory.authority_refs, ir_sha256: context.irSeal.sha256,
        graphs: context.irSeal.graphs.length,
        source_basis: 'authored_documents_shared_declared_nominal_types_not_observed_IR',
        independent_compiler: false, qualified: false, semantic_mutation_credit: 0 });
    wholeIRReferences.set(receipt, context.irSeal);
    return receipt;
}
function verifyPathWholeIRReference(raw) {
    const { reference, ir } = fields(raw, ['reference', 'ir']);
    const seal = wholeIRReferences.get(reference);
    if (!seal) fail('whole_ir_reference_origin');
    return assertWholeIR(ir, seal);
}
function readPathWholeIRReference(raw) {
    const { reference } = fields(raw, ['reference']);
    const seal = wholeIRReferences.get(reference);
    if (!seal) fail('whole_ir_reference_origin');
    return seal.expected;
}
function preparePathCandidateWholeIRReference(raw) {
    const { candidate } = fields(raw, ['candidate']);
    const context = candidatePackages.get(candidate);
    if (!context) fail('candidate_whole_ir_origin');
    return context.wholeIRReference;
}
function verifyPathCandidateWholeIRReference(raw) {
    const { reference, variant, ir } = fields(raw, ['reference', 'variant', 'ir']);
    const seals = candidateIRReferences.get(reference);
    if (!seals || typeof variant !== 'string' || !['C', 'M', 'S'].includes(variant)) fail('candidate_whole_ir_origin');
    const seal = seals[variant];
    if (!seal) fail('native_rejection_only_no_mutant_ir');
    return assertWholeIR(ir, seal);
}
function verifyPathQualificationInventory(raw) {
    const input = fields(raw, ['preparation', 'candidate']);
    const context = contexts.get(input.preparation);
    if (!context) fail('preparation_authority');
    const candidate = fields(input.candidate, [...Object.keys(context.header), 'rows']);
    const { rows: rawRows, ...rawHeader } = candidate;
    if (!equal(plain(rawHeader), context.header)) fail('header_identity');
    const rows = passiveRows(rawRows, context.rows.length);
    if (!equal(rows, context.rows)) fail('exact_target_site_identity');
    return freezeDeep({ inventory_integrity: true, verified: false,
        expected_predicates: context.rows.length, blocked: context.rows.length,
        semantic_mutation_credit: 0, global_g11: false, activated: false });
}
function preparePathQualificationHistoricalMigration(raw) {
    const { preparation, historicalSource } = fields(raw, ['preparation', 'historicalSource']);
    const context = contexts.get(preparation);
    if (!context) fail('historical_preparation_authority');
    if (typeof historicalSource !== 'string' || Buffer.byteLength(historicalSource, 'utf8') > 32 * 1024 * 1024
        || sha(historicalSource) !== HISTORICAL_REPORT) fail('historical_source_identity');
    const old = JSON.parse(historicalSource);
    if (!Array.isArray(old.rows)) fail('historical_format');
    const byId = new Map();
    for (const record of old.rows) {
        if (typeof record.mutation_id !== 'string' || byId.has(record.mutation_id)) fail('historical_duplicate');
        byId.set(record.mutation_id, record);
    }
    if (byId.size !== context.rows.length || context.rows.some(row => !byId.has(row.target_id)))
        fail('historical_exact_membership_requires_new_migration_decision');
    const graphs = admittedDocuments(context.packageReceipt).find(entry => entry.path === corpusPath)?.value.graphs;
    const graphMap = new Map(graphs.map(graph => [graph.fact_key, graph]));
    const rows = context.rows.map(row => {
        const record = byId.get(row.target_id);
        const predicate = graphMap.get(row.target.fact_key)?.predicates.find(predicate => predicate.id === row.target.predicate_id);
        if (!equal(row.target, record.target) || !predicate || !equal(record.expected_violations, [predicate.atom]))
            fail('historical_target_or_atom_changed_requires_new_migration_decision');
        // Preserve the COMPLETE old row, including missing/present cause,
        // references, trace/outcome hashes and all diagnostic flags. No rewrite
        // of matched/UNSAT/RED/valid; no evidence promoted across authorities.
        const historicalRecord = plain(record);
        return { target_id: row.target_id, target: row.target, qualification_id: row.qualification_id,
            historical_report_sha256: HISTORICAL_REPORT, historical_record_sha256: sha(canonicalValue(historicalRecord)),
            historical_record: historicalRecord, old_authority: ADDENDUM, method_authority: METHOD,
            new_disposition: 'blocked', new_evidence_ids: [], historical_state_changed: false,
            evidence_reused_for_v3: false, dp_execution: false, semantic_mutation_credit: 0 };
    });
    const flagNames = ['stage', 'global_g11', 'predicate_atom_credit', 'batch_complete', 'graph_accepted',
        'financial_receipt', 'accounting_complete', 'measured_sources_unchanged', 'migration_verified', 'activated', 'valid'];
    const flags = Object.fromEntries(flagNames.map(name => {
        if (!Object.hasOwn(old, name)) fail('historical_flags');
        return [name, old[name]];
    }));
    const header = { format: 'financasbot.path-qualification.historical-migration', version: 3,
        stage: 'total_historical_mapping_not_qualified', method_authority: METHOD, old_authority: ADDENDUM,
        historical_report_sha256: HISTORICAL_REPORT, historical_report_flags: flags,
        expected_predicates: context.rows.length, exact_old_membership: true,
        target_ids_sha256: context.header.target_ids_sha256, rows_sha256: sha(canonicalValue(rows)),
        evidence_reuse_policy: 'none_new_qualification_required_under_v3',
        baseline_raw_identity_reused: false, qualified: false, activated: false,
        semantic_mutation_credit: 0, verified_rows: 0, blocked: context.rows.length, global_g11: false };
    const result = freezeDeep({ ...header, rows });
    historicalMigrations.set(result, { header, rows });
    return result;
}
function verifyPathQualificationHistoricalMigration(raw) {
    const { migration, candidate } = fields(raw, ['migration', 'candidate']);
    const stored = historicalMigrations.get(migration);
    if (!stored) fail('historical_migration_authority');
    const { rows: rawRows, ...rawHeader } = fields(candidate, [...Object.keys(stored.header), 'rows']);
    if (!equal(plain(rawHeader), stored.header)) fail('historical_migration_header');
    if (!equal(passiveRows(rawRows, stored.rows.length), stored.rows)) fail('historical_state_or_evidence_changed');
    return freezeDeep({ migration_integrity: true, exact_old_membership: true, rows: stored.rows.length,
        historical_report_sha256: HISTORICAL_REPORT, rows_sha256: stored.header.rows_sha256,
        qualified: false, activated: false, semantic_mutation_credit: 0, global_g11: false });
}
function authoredSelectionConcern(graph) {
    const edges = new Map(graph.edges.map(edge => [edge.id, edge]));
    // Independently project the authored relationship, not the compiler's
    // selected/candidate error or its observed IR selection program. Same
    // identity is not inferred from equal fixture values. No graph reachability
    // beyond the explicitly declared material and compensation/category links.
    function touches(predicate) {
        const aliases = new Set();
        for (const arg of predicate.args) {
            if (arg.node) aliases.add(arg.node);
            if (arg.field) aliases.add(arg.field.node);
            if (arg.presence) aliases.add(arg.presence.node);
            if (arg.ref_set) aliases.add(arg.ref_set.field.node);
            const setName = arg.set ?? arg.projection?.set;
            if (setName) for (const alias of graph.sets[setName]) aliases.add(alias);
            if (arg.edge) aliases.add(edges.get(arg.edge).source);
        }
        return aliases;
    }
    const allowedAliases = new Map();
    function concernAliases(alias) {
        if (allowedAliases.has(alias)) return allowedAliases.get(alias);
        const allowed = new Set([alias]);
        const direct = graph.edges.filter(edge => edge.relation === 'material_ref' && edge.source === alias);
        for (const edge of direct) allowed.add(edge.target);
        for (const compensation of direct.filter(edge => edge.field === 'compensates'
            && graph.nodes[alias].kind === 'event' && graph.nodes[edge.target].kind === 'event')) {
            for (const category of graph.edges.filter(edge => edge.relation === 'material_ref'
                && edge.source === compensation.target && edge.field === 'category_id'
                && graph.nodes[edge.target].kind === 'category')) allowed.add(category.target);
        }
        allowedAliases.set(alias, allowed);
        return allowed;
    }
    const concerns = (predicate, alias) => [...touches(predicate)].some(node => concernAliases(alias).has(node));
    return { concerns, concernAliases };
}
function preparePathQualificationAdmissionDomain(raw) {
    const privateProjection = arguments[1];
    if (arguments.length > 2 || (privateProjection !== undefined && privateProjection !== NECESSARY_SELECTION_PROJECTION))
        fail('admission_foundation_projection_authority');
    const { preparation, rowIndex } = fields(raw, ['preparation', 'rowIndex']);
    const context = contexts.get(preparation);
    if (!context || !Number.isSafeInteger(rowIndex) || rowIndex < 0 || !context.rows[rowIndex])
        fail('admission_foundation_authority');
    const row = context.rows[rowIndex];
    const corpus = admittedDocuments(context.packageReceipt).find(entry => entry.path === corpusPath).value;
    const graph = corpus.graphs.find(graph => graph.fact_key === row.target.fact_key);
    const original = graph.predicates.find(predicate => predicate.id === row.target.predicate_id);
    const predicates = new Map(graph.predicates.map(predicate => [predicate.id, predicate]));
    const { concerns, concernAliases } = authoredSelectionConcern(graph);
    const requirements = [];
    graph.selections.forEach((selection, selectionIndex) => {
        if (selection.selected_predicates.includes(original.id)) {
            const selected = graph.sets[selection.selected_set];
            requirements.push({ selection_index: selectionIndex, mode: 'included_predicate_concerns_selected_member',
                required_nodes: [...selected] });
            for (const alias of selected) {
                const otherCover = selection.selected_predicates.filter(id => id !== original.id)
                    .some(id => concerns(predicates.get(id), alias));
                if (!otherCover) requirements.push({ selection_index: selectionIndex,
                    mode: 'selected_member_retains_authored_reason', required_nodes: [alias] });
            }
        }
        for (const excluded of selection.excluded) if (excluded.predicates.includes(original.id))
            requirements.push({ selection_index: selectionIndex, mode: 'excluded_reason_concerns_own_candidate',
                required_nodes: [excluded.node] });
    });
    const satisfied = (predicate, requirement) => requirement.required_nodes.some(alias => concerns(predicate, alias));
    if (requirements.some(requirement => !satisfied(original, requirement))) fail('baseline_selection_foundation');
    const graphHash = sha(canonicalValue(graph));
    const sites = row.sites.map((site, siteIndex) => {
        if (!site.domain_complete) return { site_index: siteIndex, domain_complete: false,
            excluded: [], unclassified_locator_indices: null, admitted_locator_indices: null, admitted_domain_complete: false };
        const excluded = [], unclassified = [];
        site.domain.locators.forEach((locator, locatorIndex) => {
            const predicate = JSON.parse(JSON.stringify(original));
            let container = predicate;
            for (const token of site.domain.location.slice(0, -1)) container = container[token];
            container[site.domain.location.at(-1)] = JSON.parse(JSON.stringify(locator));
            const failed = requirements.filter(requirement => !satisfied(predicate, requirement));
            if (!failed.length) { unclassified.push(locatorIndex); return; }
            excluded.push({ locator_index: locatorIndex, locator, site_path: site.authored_site.site_path,
                rule: { id: 'selection_requires_authored_candidate_concern', method_authority: METHOD,
                    existing_constraint: 'normal_selection_binding_selected_and_candidate',
                    constraint_source: 'src/next/provenance/selectionBindings.js',
                    normative_confrontation: 'PATHv3_sections_3_and_5_existing_binding_and_requirement_contracts',
                    compiler_bytes_and_normative_binding_required: true },
                instances: failed.map(requirement => ({ ...requirement, predicate_id: original.id,
                    allowed_aliases: requirement.required_nodes.map(alias => ({ node: alias,
                        allowed: [...concernAliases(alias)].sort() })) })),
                unchanged_authorship_sha256: graphHash,
                basis: 'unchanged_authored_bindings_only_not_compiler_result',
                compiler_barrier_verified: false, expected_native_coordinate: null });
        });
        const complete = unclassified.length === 0;
        return { site_index: siteIndex, domain_complete: true, excluded,
            unclassified_locator_indices: unclassified, admitted_locator_indices: complete ? [] : null,
            admitted_domain_complete: complete };
    });
    // Selection controls consume only the necessary exclusions above. Do not
    // recompute a complete admission proof for every corpus row merely to
    // bind that control. The full public preparation remains unchanged.
    const admissionFoundation = privateProjection === NECESSARY_SELECTION_PROJECTION
        ? null : projectAdmissionFoundation(context, row, graph, original);
    const result = freezeDeep({ stage: 'path_v3_necessary_selection_foundation_not_qualified',
        target_id: row.target_id, qualification_id: row.qualification_id, method_authority: METHOD,
        domain_sha256: sha(canonicalValue(row.sites.map(site => site.domain))), sites,
        admission_foundation: admissionFoundation,
        admitted_domain_complete: sites.every(site => site.admitted_domain_complete),
        scope: 'necessary_authored_selection_constraints_only_unclassified_is_not_admitted',
        qualified: false, semantic_mutation_credit: 0, dp_execution: false });
    if (admissionFoundation !== null) admissionDomains.set(result, result);
    return result;
}
// Declaration of the COMPLETE normal admission frontier, not a replicated
// compiler or success of a check on M. Every pass remains an explicit proof
// obligation until its rules and instances are discharged and its actual
// checker binding has been confronted. A single-site authorship frame proves
// only unchanged bytes outside that site, NOT invariance of relational rules.
function projectAdmissionFoundation(context, row, graph, predicate) {
    const structuralDocuments = new Map(admittedDocuments(context.packageReceipt).map(entry => [entry.path, entry.value]));
    const structuralCorpus = structuralDocuments.get(corpusPath);
    const structuralBasis = { registry: structuralDocuments.get(structuralCorpus.material_registry.path),
        operatorRegistry: structuralDocuments.get(structuralCorpus.operator_registry.path),
        claim: structuralDocuments.get(structuralCorpus.claim_contract.path).claims.find(value => value.fact_key === graph.fact_key) };
    const prefix = 'src/next/provenance/';
    const declarations = [
        ['package_schemas', ['graphCompiler.js'], 'normal_document_schema_and_closed_authority'],
        ['schema_registry_projection', ['schemaRegistryProjection.js'], 'registry_schema_consistency'],
        ['static_evidence', ['graphCompiler.js'], 'snapshot_and_authored_material_identity'],
        ['graph_dependencies', ['graphCompiler.js'], 'claims_evaluators_roles_and_parent_dependencies'],
        ['operand_bindings', ['operandBindings.js'], 'evaluator_roles_and_authored_bindings'],
        ['graph_structure', ['graphStructure.js'], 'all_authored_references_and_relations'],
        ['template_references', ['templateReferences.js'], 'template_parameters_members_and_body'],
        ['predicate_types', ['predicateTypes.js', 'operatorTypes.js'], 'nominal_signatures_refinements_and_peer_relations'],
        ['obligation_bindings', ['obligationBindings.js'], 'identity_material_read_and_reference_bindings'],
        ['claim_requirements', ['claimRequirements.js', 'claimRequirementCore.js'], 'claim_roots_literals_subject_and_period_anchors'],
        ['selection_bindings', ['selectionBindings.js'], 'selection_concern_state_guards_and_coverage'],
        ['collection_requirements', ['collectionRequirements.js'], 'fixture_anchors_membership_and_candidate_bindings']
    ];
    const graphHash = sha(canonicalValue(graph));
    const predicateIndex = graph.predicates.findIndex(value => value.id === predicate.id);
    if (predicateIndex < 0) fail('admission_foundation_target');
    const passes = declarations.map(([id, sources, obligation]) => ({ id,
        checker_sources: [...new Set([...sources.map(source => prefix + source),
            ...(NORMAL_READ_RULE_CONTRACTS.find(contract => contract.pass_id === id)?.source_bindings.map(row => row.path) ?? []),
            ...(id === 'graph_structure' ? NORMAL_STRUCTURAL_LOCATOR_CONTRACT.source_bindings.map(row => row.path) : []),
            ...(id === 'predicate_types' ? NORMAL_PRIMITIVE_TYPE_CONTRACT.source_bindings.map(row => row.path) : [])])], obligation,
        instance: { fact_key: graph.fact_key, predicate_id: predicate.id,
            graph_sha256: graphHash, predicate: plain(predicate) },
        status: 'pending_normative_rule_discharge', discharged: false }));
    const replace = (value, location, expected, replacement) => {
        const output = JSON.parse(JSON.stringify(value)); let container = output;
        for (const token of location.slice(0, -1)) {
            if (!container || !Object.hasOwn(container, token)) fail('admission_frame_coordinate');
            container = container[token];
        }
        const leaf = location.at(-1);
        if (!container || !Object.hasOwn(container, leaf) || !equal(container[leaf], expected))
            fail('admission_frame_locator');
        container[leaf] = replacement;
        return output;
    };
    const sites = row.sites.map((site, siteIndex) => {
        if (!site.domain_complete) return { site_index: siteIndex, graph_location: null,
            unchanged_authorship_sha256: null, frames: null, domain_complete: false };
        const location = ['predicates', predicateIndex, ...site.domain.location];
        const erasedHash = sha(canonicalValue(replace(graph, location, site.domain.original, null)));
        const frames = site.domain.locators.map((locator, locatorIndex) => {
            const mutant = replace(graph, location, site.domain.original, plain(locator));
            const unchanged = sha(canonicalValue(replace(mutant, location, locator, null)));
            if (unchanged !== erasedHash) fail('admission_frame_changed');
            return { locator_index: locatorIndex,
                original_locator_sha256: sha(canonicalValue(site.domain.original)),
                alternative_locator_sha256: sha(canonicalValue(locator)),
                mutant_authorship_sha256: sha(canonicalValue(mutant)),
                unchanged_authorship_sha256: unchanged,
                rule_dependency_frames: projectAdmissionRuleDependencyFrames(graph, mutant, predicateIndex),
                structural_locator_constraint: projectStructuralLocatorConstraint(structuralBasis, graph, predicate, site, locator),
                single_site_frame_verified: true, normal_rule_frame_proved: false };
        });
        return { site_index: siteIndex, domain_complete: true, graph_location: location,
            unchanged_authorship_sha256: erasedHash, frames };
    });
    // Compose the already declared finite lemmas for EVERY genuine L member.
    // Query equality and a matching primitive/schema branch are conditional
    // preservation, not a positive baseline, executed barrier or reviewed
    // checker authority. Missing coverage cannot be hidden by an aggregate
    // count, a duplicated rule or success of a later compile on M.
    const compositionSites = sites.map(site => ({ site_index: site.site_index,
        domain_complete: site.domain_complete,
        unchanged_authorship_sha256: site.unchanged_authorship_sha256,
        locators: site.frames?.map(frame => {
            const reads = frame.rule_dependency_frames, constraint = frame.structural_locator_constraint;
            const readTableComplete = reads.length === NORMAL_READ_RULE_CONTRACTS.length
                && new Set(reads.map(rule => rule.pass_id)).size === reads.length
                && reads.every(rule => NORMAL_READ_RULE_CONTRACTS.some(contract => contract.pass_id === rule.pass_id));
            const passCoverage = passes.map(pass => {
                const contract = NORMAL_READ_RULE_CONTRACTS.find(contract => contract.pass_id === pass.id);
                const query = reads.find(rule => rule.pass_id === pass.id);
                const special = pass.id === 'package_schemas' ? {
                    contract: NORMAL_PACKAGE_SCHEMA_CONTRACT,
                    verified: constraint.schema_locator_constraint.contract_sha256 === sha(canonicalValue(NORMAL_PACKAGE_SCHEMA_CONTRACT))
                        && constraint.schema_locator_constraint.locator_sha256 === frame.alternative_locator_sha256
                        && constraint.schema_locator_constraint.shape_preservation_verified
                        && constraint.schema_locator_constraint.predicate_identity_uniqueness_preserved
                } : pass.id === 'graph_structure' ? {
                    contract: NORMAL_STRUCTURAL_LOCATOR_CONTRACT,
                    verified: constraint.contract_sha256 === sha(canonicalValue(NORMAL_STRUCTURAL_LOCATOR_CONTRACT))
                        && constraint.locator_sha256 === frame.alternative_locator_sha256
                        && constraint.baseline_locator_resolved && constraint.resolution === 'present_authored_locator'
                } : pass.id === 'predicate_types' ? {
                    contract: NORMAL_PRIMITIVE_TYPE_CONTRACT,
                    verified: constraint.primitive_type_constraint.contract_sha256 === sha(canonicalValue(NORMAL_PRIMITIVE_TYPE_CONTRACT))
                        && constraint.primitive_type_constraint.locator_sha256 === frame.alternative_locator_sha256
                        && constraint.primitive_type_constraint.conditional_preservation_verified
                } : null;
                return { pass_id: pass.id,
                    contract_sha256: contract ? sha(canonicalValue(contract)) : special ? sha(canonicalValue(special.contract)) : null,
                    conditional_preservation_verified: frame.single_site_frame_verified && readTableComplete
                        && (contract ? !!query && query.normal_read_rule_contract_sha256 === sha(canonicalValue(contract))
                            && query.dependency_frame_verified && query.conditional_preservation_verified
                            && query.baseline_projection_sha256 === query.mutant_projection_sha256
                            : special?.verified === true),
                    baseline_projection_sha256: query?.baseline_projection_sha256 ?? null,
                    mutant_projection_sha256: query?.mutant_projection_sha256 ?? null,
                    discharged: false };
            });
            const covered = passCoverage.every(pass => pass.conditional_preservation_verified);
            return { locator_index: frame.locator_index,
                alternative_locator_sha256: frame.alternative_locator_sha256,
                mutant_authorship_sha256: frame.mutant_authorship_sha256,
                pass_coverage: passCoverage,
                status: covered ? 'conditionally_preserved_pending_baseline_binding_and_controls'
                    : 'blocked_incomplete_normal_rule_coverage', admitted: false, discharged: false };
        }) ?? null }));
    const normalRuleComposition = {
        format: 'financasbot.path-normal-rule-composition', version: 1,
        method_authority: METHOD, graph_sha256: graphHash,
        domain_sha256: sha(canonicalValue(row.sites.map(site => site.domain))),
        pass_ids: passes.map(pass => pass.id), sites: compositionSites,
        conditional_coverage_complete: compositionSites.every(site => site.domain_complete
            && site.locators.every(member => member.status === 'conditionally_preserved_pending_baseline_binding_and_controls')),
        required_premises: { normal_baseline_admission_verified: false, normal_checker_binding_verified: false,
            independent_reviewed_rule_basis_verified: false, site_admission_controls_verified: false,
            whole_actual_program_conformance_verified: false, normal_positive_restoration_verified: false },
        scope: 'complete_finite_conditional_preservation_only_not_admitted_A_or_executed_W',
        admitted_domain_complete: false, compiler_result_used: false,
        qualified: false, semantic_mutation_credit: 0, dp_execution: false
    };
    return { format: 'financasbot.path-admission-foundation', version: 1,
        stage: 'normal_rule_obligations_and_single_site_frames_before_mutant',
        method_authority: METHOD, graph_sha256: graphHash,
        documents: admittedDocuments(context.packageReceipt).map(entry => ({ path: entry.path, sha256: entry.sha256 })),
        normal_read_rule_contracts: NORMAL_READ_RULE_CONTRACTS,
        normal_structural_locator_contract: NORMAL_STRUCTURAL_LOCATOR_CONTRACT,
        normal_package_schema_contract: NORMAL_PACKAGE_SCHEMA_CONTRACT,
        normal_primitive_type_contract: NORMAL_PRIMITIVE_TYPE_CONTRACT,
        normal_rule_composition: normalRuleComposition,
        passes, sites, normal_pipeline_binding_verified: false,
        rule_discharge_complete: false, compiler_result_used: false,
        qualified: false, semantic_mutation_credit: 0, dp_execution: false };
}
function projectStructuralLocatorConstraint({ registry, claim, operatorRegistry }, graph, predicate, site, locator) {
    const definition = site.authored_site.definition;
    const resolve = path => {
        if (definition === 'claimPath') {
            let value = claim;
            if (!Array.isArray(path.segments) || !path.segments.length) return false;
            for (const key of path.segments) {
                if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, key)) return false;
                value = value[key];
            }
            return true;
        }
        if (!['fieldPath', 'selector'].includes(definition)) fail('structural_locator_definition');
        const anchored = definition === 'fieldPath';
        const kind = anchored ? graph.nodes[path.node]?.kind : path.kind;
        const originalKind = anchored ? graph.nodes[site.domain.original.node]?.kind : site.domain.original.kind;
        const descriptor = registry.kinds[kind]?.fields?.[path.segments?.[0]];
        // Complete L already preserves kind, nominal type, unit and form. The
        // normal argument resolver additionally requires an authored material
        // field. It does not require this field to exist in a snapshot payload.
        if (!kind || kind !== originalKind || !Array.isArray(path.segments) || path.segments.length !== 1
            || !descriptor || descriptor.class === 'non_material') fail('structural_locator_material_L');
        return true;
    };
    if (!resolve(site.domain.original)) fail('structural_locator_baseline');
    const present = resolve(locator);
    const primitiveNominal = path => {
        if (definition === 'claimPath') return null;
        const kind = definition === 'fieldPath' ? graph.nodes[path.node]?.kind : path.kind;
        const name = path.segments[0], descriptor = registry.kinds[kind]?.fields?.[name];
        if (!descriptor || descriptor.class === 'non_material'
            || !NORMAL_PRIMITIVE_TYPE_CONTRACT.primitive_types.includes(descriptor.type)) return null;
        const type = { form: 'scalar', type: descriptor.type };
        if (descriptor.type === 'id') type.kind = name === 'id' ? kind : kind + '.' + name;
        if (descriptor.type === 'money_minor') type.unit = 'BRL_minor';
        if (descriptor.type === 'enum') type.domain = JSON.stringify([...descriptor.values].sort());
        return type;
    };
    const baselineNominal = primitiveNominal(site.domain.original), alternativeNominal = primitiveNominal(locator);
    const operator = operatorRegistry.operators.find(operator => operator.id === predicate.op);
    if (!operator) fail('primitive_type_operator');
    const typePreserved = !!baselineNominal && !!alternativeNominal
        && equal(baselineNominal, site.domain.original_nominal) && equal(baselineNominal, alternativeNominal);
    const primitiveTypeConstraint = {
        checker: 'predicate_types', contract_sha256: sha(canonicalValue(NORMAL_PRIMITIVE_TYPE_CONTRACT)),
        definition, locator_sha256: sha(canonicalValue(locator)),
        baseline_nominal: baselineNominal, alternative_nominal: alternativeNominal,
        operator_instance: plain(operator),
        status: typePreserved ? 'same_normal_material_primitive_type_under_explicit_premises'
            : definition === 'claimPath' ? 'blocked_claim_type_basis' : 'blocked_reference_record_or_nominal_basis',
        conditional_preservation_verified: typePreserved,
        window_and_set_inference_unchanged: true,
        nonliteral_material_known_values_used_for_refinement: false,
        normal_baseline_admission_verified: false, normal_checker_binding_verified: false,
        compiler_result_used: false, discharged: false, qualified: false
    };
    const keys = definition === 'fieldPath' ? ['node', 'segments']
        : definition === 'selector' ? ['kind', 'segments'] : ['segments'];
    const shape = Object.keys(locator).sort().join(',') === [...keys].sort().join(',')
        && Array.isArray(locator.segments) && locator.segments.length > 0
        && locator.segments.every(key => typeof key === 'string' && /^[a-z][a-z0-9_]*$/.test(key))
        && (definition !== 'fieldPath' || typeof locator.node === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(locator.node))
        && (definition !== 'selector' || ['family', 'person', 'account', 'card', 'category', 'event', 'budget', 'bill',
            'source_state', 'proposal', 'reminder', 'calendar_event', 'side_effect', 'merchant_rule', 'fixture', 'collection',
            'source_origin', 'merchant_identity', 'transfer_identity', 'installment_plan', 'turn', 'derived_claim',
            'evaluation_policy'].includes(locator.kind));
    const schemaLocatorConstraint = {
        checker: 'package_schemas', contract_sha256: sha(canonicalValue(NORMAL_PACKAGE_SCHEMA_CONTRACT)),
        definition, locator_sha256: sha(canonicalValue(locator)),
        shape_preservation_verified: shape,
        predicate_identity_uniqueness_preserved: new Set(graph.predicates.map(row => row.id)).size === graph.predicates.length,
        basis: 'same_schema_locator_branch_and_whole_single_site_frame_under_positive_normal_baseline',
        normal_baseline_admission_verified: false, normal_checker_binding_verified: false,
        compiler_result_used: false, discharged: false, qualified: false
    };
    return { checker: 'graph_structure', contract_sha256: sha(canonicalValue(NORMAL_STRUCTURAL_LOCATOR_CONTRACT)),
        definition, locator_sha256: sha(canonicalValue(locator)),
        baseline_locator_resolved: true,
        resolution: present ? 'present_authored_locator' : 'absent_authored_claim_path',
        expected_native_coordinate: present ? null : { checker: 'graph_structure', code: 'claim_path',
            fact_key: graph.fact_key, predicate_id: predicate.id, operand_index: site.authored_site.site_path[1],
            site_path: plain(site.authored_site.site_path) },
        basis: 'whole_authored_claim_or_material_registry_and_genuine_L_not_compiler_result',
        primitive_type_constraint: primitiveTypeConstraint,
        schema_locator_constraint: schemaLocatorConstraint,
        normal_baseline_admission_verified: false, normal_checker_binding_verified: false,
        compiler_result_used: false, qualified: false };
}
// Closed declarative read queries of the existing relational rules. They
// retain every potentially participating predicate BEFORE matching its args:
// selecting only currently matching anchors would miss membership changes.
// Query equality is a dependency frame, not an admission result. Its claimed
// read coverage still requires binding/confrontation with the real checker.
function projectAdmissionRuleDependencyFrames(baseline, mutant, predicateIndex) {
    const metadata = predicate => ({ id: predicate.id, op: predicate.op,
        obligation: predicate.obligation, atom: predicate.atom });
    const withoutPredicates = graph => {
        const { predicates, ...unchanged } = graph;
        return unchanged;
    };
    const relations = [
        { id: 'static_evidence', basis: 'unchanged_graph_and_documents_no_predicate_argument_reads',
            project: withoutPredicates },
        { id: 'graph_dependencies', basis: 'unchanged_graph_and_documents_no_predicate_argument_reads',
            project: withoutPredicates },
        { id: 'operand_bindings', basis: 'unchanged_graph_and_documents_no_predicate_argument_reads',
            project: withoutPredicates },
        { id: 'schema_registry_projection', basis: 'unchanged_non_corpus_schema_registry_documents_no_graph_argument_reads',
            project: withoutPredicates },
        { id: 'template_references', basis: 'all_template_arguments_and_set_peer_operands_with_nodes_sets_windows_and_unchanged_documents',
            project: graph => ({ fact_key: graph.fact_key, nodes: graph.nodes, sets: graph.sets, windows: graph.windows,
                predicates: graph.predicates.map(predicate => ({ id: predicate.id,
                    // Only genuine locator leaves change. Top-level template
                    // or set membership cannot be created/erased by that
                    // replacement. Retain ALL templates and set peers, not
                    // merely the template currently matching this target.
                    args: predicate.args.map(arg => Object.hasOwn(arg, 'template') || Object.hasOwn(arg, 'set') ? arg : null) })) }) },
        { id: 'obligation_bindings', basis: 'all_predicate_metadata_participating_arguments_and_entire_graph_roots_with_unchanged_documents',
            project: graph => ({ ...withoutPredicates(graph),
                predicates: graph.predicates.map(predicate => {
                    const sensitive = ['node_identity', 'semantic_integrity'].includes(predicate.obligation)
                        || ['kind_is', 'fingerprint_is', 'ref_targets_node'].includes(predicate.op);
                    return { ...metadata(predicate), participating_arguments: sensitive ? predicate.args : null };
                }) }) },
        { id: 'claim_requirements', basis: 'ordinary_all_direct_claim_roots_descriptor_subject_period_arguments_and_graph_roots_with_unchanged_claims',
            project: graph => ({ ...withoutPredicates(graph),
                predicates: graph.predicates.map(predicate => ({ ...metadata(predicate),
                    direct_claim_roots: predicate.args.map(arg => arg.claim?.segments?.[0] ?? null),
                    // Conservative full arguments for all potential anchors,
                    // including failure attribution; never just the target.
                    participating_arguments: ['subject_scope', 'period', 'time_basis', 'coverage', 'evidence_state']
                        .includes(predicate.obligation) ? predicate.args : null })) }) },
        { id: 'collection_requirements', basis: 'all_fixture_membership_anchor_arguments_and_entire_graph_roots_with_unchanged_snapshot_registry_documents',
            project: graph => ({ ...withoutPredicates(graph),
                predicates: graph.predicates.map(predicate => ({ ...metadata(predicate),
                    participating_arguments: ['coverage', 'evidence_set'].includes(predicate.obligation) ? predicate.args : null })) }) },
        { id: 'selection_bindings', basis: 'all_selection_referenced_predicate_arguments_metadata_and_entire_graph_roots_with_unchanged_claim_registry_documents',
            project: graph => {
                // The normal pass resolves IDs from the entire ordered map,
                // but reads argument bodies only for included/excluded IDs.
                // Retain ALL such predicates and all roots, not merely the
                // currently selected target or a sampled selection.
                const referenced = new Set(graph.selections.flatMap(selection => [
                    ...selection.selected_predicates, ...selection.excluded.flatMap(row => row.predicates)]));
                return { ...withoutPredicates(graph), predicates: graph.predicates.map(predicate => ({ ...metadata(predicate),
                    participating_arguments: referenced.has(predicate.id) ? predicate.args : null })) };
            } }
    ];
    return relations.map(({ id, basis, project }) => {
        const before = sha(canonicalValue(project(baseline))), after = sha(canonicalValue(project(mutant)));
        const contract = NORMAL_READ_RULE_CONTRACTS.find(contract => contract.pass_id === id);
        return { pass_id: id, basis, baseline_projection_sha256: before, mutant_projection_sha256: after,
            dependency_frame_verified: before === after,
            normal_read_rule_contract_sha256: contract ? sha(canonicalValue(contract)) : null,
            conditional_preservation_verified: !!contract && before === after,
            normal_checker_read_coverage_verified: false, discharged: false };
    });
}
function verifyPathQualificationAdmissionDomain(raw) {
    const { domain, candidate } = fields(raw, ['domain', 'candidate']);
    const expected = admissionDomains.get(domain);
    if (!expected) fail('admission_foundation_origin');
    fields(candidate, Object.keys(expected));
    if (!equal(plain(candidate), expected)) fail('admission_foundation_changed');
    return freezeDeep({ foundation_integrity: true, admitted_domain_complete: expected.admitted_domain_complete,
        qualified: false, semantic_mutation_credit: 0, dp_execution: false });
}
// Trusted BUILD preselection, not an admitted W domain or guest execution
// authority. Reuse the existing independent frozen-world reference unchanged.
// In particular, unclassified A members never become admitted by discrimination.
function preparePathQualificationWitnessPreselection(raw) {
    const { preparation, rowIndex } = fields(raw, ['preparation', 'rowIndex']);
    const context = contexts.get(preparation);
    if (!context || !Number.isSafeInteger(rowIndex) || rowIndex < 0 || !context.rows[rowIndex])
        fail('witness_preparation_authority');
    const started = context.witnessPreselectionRows ||= new Set();
    if (started.has(rowIndex)) fail('witness_preselection_replay');
    // Commit before any materialization/reference. Failure cannot be retried
    // on this preparation to pick a different candidate after an observation.
    started.add(rowIndex);
    const row = context.rows[rowIndex];
    if (!row.sites.every(site => site.domain_complete)) fail('witness_locator_domain_incomplete');
    const admission = preparePathQualificationAdmissionDomain({ preparation, rowIndex });
    const ruleComposition = admission.admission_foundation.normal_rule_composition;
    const { sealPathQualificationReference, readPathSemanticReference } = require('./pathSemanticReference');
    const entries = [], partitionEntries = [];
    let selected = null, selectedCandidate = null;
    row.sites.forEach((site, siteIndex) => {
        const exclusions = new Set(admission.sites[siteIndex].excluded.map(entry => entry.locator_index));
        site.domain.locators.forEach((locator, locatorIndex) => {
            const base = { entry_index: entries.length, site_index: siteIndex, locator_index: locatorIndex,
                authored_site: site.authored_site, locator };
            const ruleBasis = ruleComposition.sites[siteIndex]?.locators?.[locatorIndex];
            const conditionalRules = !!ruleBasis
                && ruleBasis.locator_index === locatorIndex
                && ruleBasis.alternative_locator_sha256 === sha(canonicalValue(locator))
                && ruleBasis.status === 'conditionally_preserved_pending_baseline_binding_and_controls'
                && canonicalValue(ruleBasis.pass_coverage.map(pass => pass.pass_id)) === canonicalValue(ruleComposition.pass_ids)
                && ruleBasis.pass_coverage.every(pass => pass.conditional_preservation_verified === true);
            const partitionBase = { entry_index: base.entry_index, site_index: siteIndex, locator_index: locatorIndex,
                locator_sha256: sha(canonicalValue(locator)),
                normal_rule_basis_sha256: ruleBasis ? sha(canonicalValue(ruleBasis)) : null,
                conditional_rule_preservation_verified: conditionalRules };
            if (exclusions.has(locatorIndex)) {
                entries.push({ ...base, admission: 'necessary_exclusion_not_native_control',
                    reference: null, candidate_id: null, invocation_id: null });
                partitionEntries.push({ ...partitionBase, reference_sha256: null,
                    classification: conditionalRules ? 'blocked_contradictory_rule_partition'
                        : 'necessary_exclusion_pending_native_barrier' });
                return;
            }
            const candidate = materializePathQualificationLocator({ preparation, rowIndex, siteIndex, locatorIndex });
            const reference = sealPathQualificationReference({ candidate });
            if (readPathSemanticReference(reference) !== reference || reference.method_version !== 3
                || reference.invocation_id !== candidate.invocation_id || reference.candidate_id !== candidate.candidate_id
                || reference.mutation_id !== row.target_id) fail('witness_reference_identity');
            const entry = { ...base, admission: 'unclassified', reference,
                candidate_id: candidate.candidate_id, invocation_id: candidate.invocation_id };
            entries.push(entry);
            const available = reference.available === true && reference.baseline_satisfied === true
                && typeof reference.mutant_satisfied === 'boolean';
            const classification = !conditionalRules ? 'blocked_normal_rule_coverage'
                : !available ? 'blocked_semantic_reference'
                    : reference.discriminating === true && reference.mutant_satisfied === false ? 'conditional_witness'
                        : reference.discriminating === false && reference.mutant_satisfied === true ? 'conditional_non_witness'
                            : 'blocked_semantic_reference_relation';
            partitionEntries.push({ ...partitionBase, reference_sha256: sha(canonicalValue(reference)), classification });
            // A known discriminant with missing normal-rule coverage cannot
            // be selected. This is still conditional, not a proved A/W or a
            // fallback after observing M; every entry precedes compilation.
            if (selected === null && classification === 'conditional_witness') {
                selected = { entry_index: entry.entry_index, site_index: siteIndex, locator_index: locatorIndex,
                    candidate_id: candidate.candidate_id, invocation_id: candidate.invocation_id,
                    reference_sha256: sha(canonicalValue(reference)) };
                selectedCandidate = candidate;
            }
        });
    });
    const conditionalAdmissionComplete = partitionEntries.every(entry =>
        entry.classification === 'necessary_exclusion_pending_native_barrier'
        || (entry.conditional_rule_preservation_verified && entry.classification !== 'blocked_contradictory_rule_partition'));
    const conditionalPartition = freezeDeep({ stage: 'path_v3_conditional_admission_witness_partition_sealed_before_compile',
        method_authority: METHOD, target_id: row.target_id, domain_sha256: admission.domain_sha256,
        normal_rule_composition_sha256: sha(canonicalValue(ruleComposition)), entries: partitionEntries,
        conditional_admission_partition_complete: conditionalAdmissionComplete,
        conditional_witness_partition_complete: conditionalAdmissionComplete
            && partitionEntries.every(entry => !entry.classification.startsWith('blocked_')),
        first_conditional_witness_entry_index: selected?.entry_index ?? null,
        required_premises: ruleComposition.required_premises,
        scope: 'finite_conditional_partition_only_not_admitted_A_proved_W_or_execution_authority',
        admitted_domain_complete: false, witness_domain_complete: false, first_witness_proved: false,
        compiler_result_used: false, qualified: false, semantic_mutation_credit: 0, dp_execution: false });
    // Reuse the existing v2 unknown_path materializer and native-control
    // transport for EVERY authored site, including a row with typed L. These
    // are admission negatives, never typed L members or semantic witnesses.
    // Coordinates and the namespace are committed before any normal compile.
    const siteAdmissionControlPlan = freezeDeep({ stage: 'path_v3_witness_site_native_controls_prepared_not_qualified',
        target_id: row.target_id, qualification_id: row.qualification_id,
        domain_sha256: admission.domain_sha256, method_authority: METHOD, admission_authority: ADDENDUM,
        locator_domain_empty: row.sites.every(site => site.domain.locators.length === 0),
        controls: row.sites.map(site => ({ admission_id: site.authored_site.mutation_id,
            namespace: site.domain.namespace, authored_site: site.authored_site,
            expected_diagnostic: { checker: 'graph_structure',
                code: site.authored_site.definition === 'claimPath' ? 'claim_path' : 'path_missing',
                fact_key: row.target.fact_key, predicate_id: row.target.predicate_id,
                operand_index: site.authored_site.site_path[1], site_path: site.authored_site.site_path } })),
        scope: 'per_site_normal_native_admission_controls_not_empty_A_or_semantic_W',
        qualified: false, semantic_mutation_credit: 0, dp_execution: false });
    staticPlans.set(siteAdmissionControlPlan, { context, row, rowIndex,
        controls: siteAdmissionControlPlan.controls, purpose: 'witness_site_admission', usedSites: new Set() });
    const selectionAdmissionControlPlan = preparePathSelectionAdmissionControls({ preparation, rowIndex });
    selectionControlPlans.get(selectionAdmissionControlPlan).usedControls = new Set();
    const result = freezeDeep({ stage: 'path_v3_independent_reference_preselection_before_compile',
        method_authority: METHOD, qualification_id: row.qualification_id, target_id: row.target_id,
        baseline_package: preparation.authority_refs, row_index: rowIndex,
        domain_sha256: admission.domain_sha256, admission_foundation: admission,
        entries, entries_sha256: sha(canonicalValue(entries)), selected,
        conditional_domain_partition: conditionalPartition,
        conditional_domain_partition_sha256: sha(canonicalValue(conditionalPartition)),
        site_admission_control_plan: siteAdmissionControlPlan,
        site_admission_control_plan_sha256: sha(canonicalValue(siteAdmissionControlPlan)),
        selection_admission_control_plan: selectionAdmissionControlPlan,
        selection_admission_control_plan_sha256: sha(canonicalValue(selectionAdmissionControlPlan)),
        selection_rule: 'first_conditionally_preserved_known_discriminating_reference_in_authored_site_locator_order_not_first_proved_W',
        expected_violations: selected ? entries[selected.entry_index].reference.expected_violations : null,
        locator_domain_complete: true, admitted_domain_complete: admission.admitted_domain_complete,
        witness_domain_complete: false, first_witness_proved: false, normal_admission_verified: false,
        disposition: 'blocked', status: selected ? 'preselected_discriminating_reference_not_qualified'
            : entries.some(entry => entry.reference?.discriminating === true)
                ? 'blocked_known_discriminant_without_normal_rule_coverage_not_equivalence'
                : 'blocked_no_known_discriminating_reference_not_equivalence',
        qualified: false, semantic_mutation_credit: 0, dp_execution: false,
        effect_closure_complete: false, validation_tcb_complete: false, global_g11: false });
    witnessPreselections.set(result, { candidate: selectedCandidate, consumed: false });
    return result;
}
function takePathQualificationWitnessPreselection(raw) {
    const { plan } = fields(raw, ['plan']);
    const stored = witnessPreselections.get(plan);
    if (!stored || stored.consumed) fail('witness_preselection_origin_or_replay');
    stored.consumed = true;
    if (!stored.candidate) fail('witness_preselection_missing_candidate');
    // Only the preselected genuine candidate is released. No observed result,
    // selected index or caller reference is accepted; no fallback iterator.
    return stored.candidate;
}
function preparePathProofAuthorship(raw) {
    const { preparation, factKey } = fields(raw, ['preparation', 'factKey']);
    const context = contexts.get(preparation);
    if (!context) fail('proof_authorship_preparation');
    const projected = projectPathInventoryAuthoredProof({ inventoryCandidate: context.inventory, factKey });
    return proofAuthorship(projected);
}
function proofAuthorship(projected) {
    const { graph } = projected, { concerns } = authoredSelectionConcern(graph);
    const predicates = new Map(graph.predicates.map(predicate => [predicate.id, predicate]));
    const selections = graph.selections.map(selection => {
        const excluded = new Map(selection.excluded.map(row => [row.node, row]));
        return { candidate_set: selection.candidate_set, selected_set: selection.selected_set,
            cases: graph.sets[selection.candidate_set].map(node => ({ node,
                identity: { kind: graph.nodes[node].kind, ref_id: graph.nodes[node].ref_id, version: graph.nodes[node].version },
                mode: excluded.has(node) ? 'exclude_if_all' : 'include_if_all',
                predicates: excluded.has(node) ? [...excluded.get(node).predicates]
                    : selection.selected_predicates.filter(id => concerns(predicates.get(id), node)) })) };
    });
    const input = freezeDeep({ ...projected.input, selections });
    const receipt = freezeDeep({ stage: 'path_v3_proof_authorship_projection_not_qualified', fact_key: graph.fact_key,
        method_authority: METHOD, authority_refs: projected.authority_refs,
        authored_graph_sha256: sha(canonicalValue(graph)), input_sha256: sha(canonicalValue(input)),
        typed_foundation: projected.basis, independent_compiler: false, qualified: false, semantic_mutation_credit: 0 });
    proofAuthorships.set(receipt, input);
    return receipt;
}
function readPathProofAuthorship(raw) {
    const { authorship } = fields(raw, ['authorship']);
    const input = proofAuthorships.get(authorship);
    if (!input) fail('proof_authorship_origin');
    return input;
}
function preparePathPhaseAuthorship(raw) {
    const { preparation, factKey, phaseProfile } = fields(raw, ['preparation', 'factKey', 'phaseProfile']);
    const context = contexts.get(preparation);
    if (!context) fail('phase_authorship_preparation');
    return phaseAuthorship(context, factKey, phaseProfile,
        projectPathInventoryAuthoredProof({ inventoryCandidate: context.inventory, factKey }));
}
function phaseAuthorship(context, factKey, phaseProfile, projected) {
    const proof = proofAuthorship(projected);
    const input = readPathProofAuthorship({ authorship: proof });
    const documents = new Map(admittedDocuments(context.packageReceipt).map(row => [row.path, row.value]));
    const corpus = documents.get(corpusPath), graph = corpus.graphs.find(row => row.fact_key === factKey);
    const claim = documents.get(corpus.claim_contract.path).claims.find(row => row.fact_key === factKey);
    const registry = [...documents.values()].find(row => row.registry_id === 'metric_evaluator_registry');
    if (!graph || !claim || !registry) fail('phase_authorship_inventory');
    // The existing pinned profile is an explicit shared normative foundation.
    // This does not infer a mode from compiled IR or from the observed program.
    const mode = resolvePhaseCompositionMode(phaseProfile, registry, claim.evaluator_ref, claim.metric);
    const profile = phaseCompositionCommitment(phaseProfile);
    const associations = graph.selections.flatMap(selection => {
        const candidates = graph.sets[selection.candidate_set];
        const roles = Object.entries(claim.operand_bindings).filter(([, row]) => row.kind === 'node_set'
            && equal(row.aliases, candidates));
        if (roles.length > 1) fail('phase_authorship_role_ambiguity');
        return roles.length ? [{ role: roles[0][0], candidate_set: selection.candidate_set,
            selected_set: selection.selected_set }] : [];
    });
    const predicateIds = new Set((mode === 'formula_plus_selection_guards' ? graph.selections : [])
        .filter(selection => associations.some(row => row.candidate_set === selection.candidate_set
            && row.selected_set === selection.selected_set))
        .flatMap(selection => [...selection.selected_predicates, ...selection.excluded.flatMap(row => row.predicates)]));
    const predicates = input.predicates.filter(row => predicateIds.has(row.id));
    if (predicates.length !== predicateIds.size) fail('phase_authorship_predicate_inventory');
    const derivation = freezeDeep({ ...input, predicates, selections: [] });
    const receipt = freezeDeep({ stage: 'path_v3_phase_authorship_projection_not_qualified', fact_key: factKey,
        method_authority: METHOD, authority_refs: proof.authority_refs,
        authored_graph_sha256: proof.authored_graph_sha256,
        input_sha256: sha(canonicalValue({ derivation, proof: input })),
        derivation_mode: mode, derivation_predicate_ids: predicates.map(row => row.id),
        authored_role_associations: associations,
        profile_sha256: profile.sha256, registry_sha256: profile.registry_sha256,
        shared_reviewed_phase_profile: true, independent_compiler: false, qualified: false, semantic_mutation_credit: 0 });
    phaseAuthorships.set(receipt, freezeDeep({ derivation, proof: input, profile }));
    return receipt;
}
function readPathPhaseAuthorship(raw) {
    const { authorship } = fields(raw, ['authorship']);
    const input = phaseAuthorships.get(authorship);
    if (!input) fail('phase_authorship_origin');
    return input;
}
function preparePathCandidateProgramAuthorship(raw) {
    const { candidate, phaseProfile } = fields(raw, ['candidate', 'phaseProfile']);
    const stored = candidatePackages.get(candidate);
    if (!stored || stored.consumed) fail('program_family_candidate_origin_or_late');
    const context = stored.sourceContext, profile = phaseCompositionCommitment(phaseProfile);
    const admissionRow = context.rows.find(row => row.target_id === candidate.target_id);
    const admissionGraph = admittedDocuments(context.packageReceipt).find(entry => entry.path === corpusPath)
        .value.graphs.find(graph => graph.fact_key === candidate.target.fact_key);
    const admissionPredicate = admissionGraph?.predicates.find(predicate => predicate.id === candidate.target.predicate_id);
    if (!admissionRow || !admissionGraph || !admissionPredicate) fail('program_family_admission_target');
    const admissionFoundation = freezeDeep(projectAdmissionFoundation(context, admissionRow, admissionGraph, admissionPredicate));
    const bases = context.programBases ||= new Map();
    let baseline = bases.get(phaseProfile);
    if (!baseline) {
        const rows = context.irSeal.expected.order.map(factKey => ({ fact_key: factKey,
            authorship: phaseAuthorship(context, factKey, phaseProfile,
                projectPathInventoryAuthoredProof({ inventoryCandidate: context.inventory, factKey })) }));
        const basis = freezeDeep({ authority_refs: context.inventory.authority_refs,
            profile_sha256: profile.sha256, registry_sha256: profile.registry_sha256,
            inputs: rows.map(row => ({ fact_key: row.fact_key, authored_input_sha256: row.authorship.input_sha256,
                authored_graph_sha256: row.authorship.authored_graph_sha256 })) });
        const documents = admittedDocuments(context.packageReceipt);
        const claimSchema = documents.find(row => row.path === 'docs/contracts/next/provenance-v2/claim-contract.schema.json');
        if (!claimSchema) fail('claim_shape_authorial_schema');
        const registry = documents.find(row => row.value?.registry_id === 'metric_evaluator_registry');
        if (!registry) fail('metric_authorial_registry');
        const contracts = registry.value.entries.map(entry => {
            const document = documents.find(row => row.path === entry.contract_path);
            if (!document) fail('metric_authorial_contract');
            return { path: document.path, sha256: document.sha256, value: document.value };
        });
        const metricBindings = rows.map(row => {
            // irSeal.expected is the independent AUTHORIAL projection, never
            // the observed compiler IR. The single-site patch changes neither
            // claim roles nor populations/evaluator identity.
            const graph = context.irSeal.expected.graphs.find(graph => graph.fact_key === row.fact_key);
            const selected = new Set(graph.selections.map(selection => selection.selected_set));
            return { fact_key: row.fact_key, evaluator_ref: graph.evaluator_ref,
                claim: graph.claim, operands: graph.operands, derivation_bindings: {
                    sets: Object.entries(graph.sets).filter(([name]) => !selected.has(name))
                        .map(([name, aliases]) => ({ name, aliases })),
                    selections: row.authorship.authored_role_associations } };
        });
        const capabilitySeeds = rows.map(row => {
            const graph = context.irSeal.expected.graphs.find(graph => graph.fact_key === row.fact_key);
            const selected = new Set(graph.selections.map(selection => selection.selected_set));
            return { fact_key: graph.fact_key, nodes: graph.nodes, edges: graph.edges, operands: graph.operands,
                input_sets: Object.entries(graph.sets).filter(([name]) => !selected.has(name))
                    .map(([name, aliases]) => ({ name, aliases })),
                selected_sets: graph.selections.map(selection => ({ candidate_set: selection.candidate_set,
                    selected_set: selection.selected_set, runtime_membership_not_pinned_to_authored_output: true })),
                material_descriptors: readPathPhaseAuthorship({ authorship: row.authorship }).proof.materials,
                // Reuse the NORMAL admitted projection, not a new schema
                // interpreter. Retain shape only, never the backing value or R.
                claim_context: { shape: plain(projectClaimContext(graph.claim, claimSchema.value).shape),
                    schema_path: claimSchema.path, schema_sha256: claimSchema.sha256,
                    authored_claim_sha256: sha(canonicalValue(graph.claim)),
                    scope: 'shared_normal_admitted_shape_not_presence_effects_or_financial_result' },
                claim_context_origin: 'admitted_claim_context_not_guest_backing_object',
                parent_receipts_admitted: false };
        });
        baseline = freezeDeep({ basis, rows, metricBindings, capabilitySeeds, metricAuthority: {
            registry: { path: registry.path, sha256: registry.sha256, value: registry.value }, contracts } });
        bases.set(phaseProfile, baseline);
    }
    const mutant = ['unknown_path_control_for_empty_L', 'unknown_path_control_for_witness_site'].includes(candidate.candidate_kind) ? null : {
        fact_key: candidate.target.fact_key,
        authorship: phaseAuthorship({ ...context, packageReceipt: stored.packageReceipt }, candidate.target.fact_key,
            phaseProfile, projectPathSingleSiteAuthoredProof({ inventoryCandidate: context.inventory,
                packageReceipt: stored.packageReceipt, changedFactKey: candidate.target.fact_key,
                factKey: candidate.target.fact_key })) };
    const receipt = freezeDeep({ stage: 'path_v3_whole_program_authorship_family_before_compile',
        invocation_id: candidate.invocation_id, candidate_id: candidate.candidate_id,
        whole_ir_reference: stored.wholeIRReference, baseline_basis_sha256: sha(canonicalValue(baseline.basis)),
        mutant_authored_input_sha256: mutant?.authorship.input_sha256 ?? null,
        changed_fact_key: candidate.target.fact_key, profile_sha256: profile.sha256,
        program_order: baseline.rows.map(row => row.fact_key),
        shared_scope: 'all_unchanged_authored_graphs_and_same_declared_foundations',
        qualified: false, semantic_mutation_credit: 0 });
    programAuthorshipFamilies.set(receipt, freezeDeep({ candidate, baseline, mutant, phaseProfile, profile, admissionFoundation }));
    return receipt;
}
function readPathCandidateProgramAuthorship(raw) {
    const { authorship } = fields(raw, ['authorship']);
    const family = programAuthorshipFamilies.get(authorship);
    if (!family || candidatePackages.get(family.candidate)?.consumed) fail('program_family_origin_or_late');
    return family;
}
function preparePathSelectionAdmissionControls(raw) {
    const { preparation, rowIndex } = fields(raw, ['preparation', 'rowIndex']);
    const domain = preparePathQualificationAdmissionDomain({ preparation, rowIndex }, NECESSARY_SELECTION_PROJECTION);
    const context = contexts.get(preparation), row = context.rows[rowIndex];
    const controls = domain.sites.flatMap(site => site.excluded.map(exclusion => {
        // The first failed authored requirement is sealed without invoking M.
        // Other normal passes can contradict this expectation; they do not
        // rewrite it or turn an unrelated rejection into a valid barrier.
        const instance = exclusion.instances[0];
        const mode = instance.mode;
        const expected = { checker: 'selection_bindings', fact_key: row.target.fact_key,
            predicate_id: mode === 'selected_member_retains_authored_reason' ? null : row.target.predicate_id,
            selection_index: instance.selection_index, mode,
            node: mode === 'included_predicate_concerns_selected_member' ? null : instance.required_nodes[0] };
        return { site_index: site.site_index, locator_index: exclusion.locator_index,
            authored_site: row.sites[site.site_index].authored_site,
            rule: exclusion.rule, instances: exclusion.instances,
            unchanged_authorship_sha256: exclusion.unchanged_authorship_sha256,
            expected_diagnostic: expected,
            coordinate_scope: 'native_selection_instance_single_authored_patch_not_operand_reader',
            compiler_barrier_verified: false };
    }));
    const result = freezeDeep({ stage: 'path_v3_selection_barrier_controls_prepared_not_qualified',
        row_index: rowIndex, target_id: row.target_id, qualification_id: row.qualification_id,
        method_authority: METHOD, domain_sha256: domain.domain_sha256,
        foundation_sha256: sha(canonicalValue(domain)), controls,
        admitted_domain_complete: domain.admitted_domain_complete,
        qualified: false, semantic_mutation_credit: 0, dp_execution: false });
    selectionControlPlans.set(result, { context, row, rowIndex, controls });
    return result;
}
function materializePathSelectionAdmissionControl(raw) {
    const { plan, controlIndex } = fields(raw, ['plan', 'controlIndex']);
    const stored = selectionControlPlans.get(plan);
    if (!stored || !Number.isSafeInteger(controlIndex) || controlIndex < 0 || !stored.controls[controlIndex])
        fail('selection_control_authority');
    if (stored.usedControls) {
        if (stored.usedControls.has(controlIndex)) fail('selection_control_replay');
        stored.usedControls.add(controlIndex);
    }
    const control = stored.controls[controlIndex];
    const domain = stored.row.sites[control.site_index].domain;
    const original = admittedDocuments(stored.context.packageReceipt).find(entry => entry.path === corpusPath).value;
    const graph = JSON.parse(JSON.stringify(original.graphs.find(graph => graph.fact_key === stored.row.target.fact_key)));
    const predicate = graph.predicates.find(predicate => predicate.id === stored.row.target.predicate_id);
    const after = domain.locators[control.locator_index];
    let container = predicate;
    for (const token of domain.location.slice(0, -1)) container = container[token];
    container[domain.location.at(-1)] = JSON.parse(JSON.stringify(after));
    const candidate = constructCandidate(stored.context, stored.row,
        { rowIndex: stored.rowIndex, siteIndex: control.site_index, locatorIndex: control.locator_index }, graph,
        { location: domain.location, before: domain.original, after },
        'typed_locator_exclusion_control', control.expected_diagnostic);
    const context = candidatePackages.get(candidate);
    context.referenceStarted = true;
    // Exclusion is derived from the authored necessary relationship, not from
    // reference fixture equality or observed M. This is still a BUILD control,
    // not a complete A/W/static proof, reviewed rule or execution authority.
    context.reference = freezeDeep({ stage: 'path_v3_authored_exclusion_sealed_before_native_control',
        invocation_id: candidate.invocation_id, mutation_id: candidate.target_id, candidate_id: candidate.candidate_id,
        domain_sha256: plan.domain_sha256, foundation_sha256: plan.foundation_sha256,
        control_sha256: sha(canonicalValue(control)), method_version: 3,
        exclusion_basis: 'necessary_authored_selection_relationship_not_observed_M',
        independent_semantic_reference: false, qualified: false, semantic_mutation_credit: 0 });
    return candidate;
}
function materializePathQualificationLocator(raw) {
    const input = fields(raw, ['preparation', 'rowIndex', 'siteIndex', 'locatorIndex']);
    const context = contexts.get(input.preparation);
    if (!context) fail('preparation_authority');
    for (const name of ['rowIndex', 'siteIndex', 'locatorIndex']) {
        if (!Number.isSafeInteger(input[name]) || input[name] < 0) fail('candidate_index');
    }
    const row = context.rows[input.rowIndex];
    const site = row?.sites[input.siteIndex];
    const domain = site?.domain;
    if (!domain || !domain.complete || !Object.hasOwn(domain.locators, input.locatorIndex)) fail('candidate_domain');
    // All sources come from the genuine admission; no caller graph, patch,
    // expected result, alternate namespace or filesystem reconstruction.
    const original = admittedDocuments(context.packageReceipt).find(entry => entry.path === corpusPath)?.value;
    if (!original) fail('corpus_identity');
    const corpus = JSON.parse(JSON.stringify(original));
    const graph = corpus.graphs.find(graph => graph.fact_key === row.target.fact_key);
    const predicate = graph?.predicates.find(predicate => predicate.id === row.target.predicate_id);
    if (!predicate || !domain.location.length) fail('candidate_site');
    let container = predicate;
    for (const token of domain.location.slice(0, -1)) {
        if (!Object.hasOwn(container, token)) fail('candidate_site');
        container = container[token];
    }
    const leaf = domain.location.at(-1);
    if (!Object.hasOwn(container, leaf) || !equal(container[leaf], domain.original)) fail('candidate_baseline');
    const after = JSON.parse(JSON.stringify(domain.locators[input.locatorIndex]));
    container[leaf] = after;
    return constructCandidate(context, row, input, graph,
        { location: domain.location, before: domain.original, after }, 'typed_locator_alternative');
}
function constructCandidate(context, row, input, graph, patch, kind, expectedDiagnostic = null) {
    const original = admittedDocuments(context.packageReceipt).find(entry => entry.path === corpusPath)?.value;
    const corpus = { ...original, graphs: original.graphs.map(baseline => baseline.fact_key === row.target.fact_key ? graph : baseline) };
    const bytes = Buffer.from(JSON.stringify(corpus) + '\n', 'utf8');
    const entries = admittedPackageEntries(context.packageReceipt)
        .map(entry => entry.path === corpusPath ? { path: entry.path, bytes } : entry);
    // This table admits a constructed BUILD candidate, not independent review
    // or the expected semantic outcome. Normal schemas/compiler still run next.
    const authority = entries.map(entry => ({ path: entry.path, sha256: sha(entry.bytes) }))
        .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    const packageReceipt = admitPackage({ entries, authority });
    const baselinePackage = admittedDocuments(context.packageReceipt).map(entry => ({ path: entry.path, sha256: entry.sha256 }));
    const candidateId = sha(canonicalValue({ domain: 'financasbot.path-qualification.locator.v3', kind,
        method: METHOD, target_id: row.target_id, patch,
        baseline_package: baselinePackage }));
    const result = freezeDeep({ format: 'financasbot.path-qualification.locator-candidate', version: 3,
        invocation_id: randomUUID(), candidate_id: candidateId, qualification_id: row.qualification_id, target_id: row.target_id,
        target: row.target, row_index: input.rowIndex, site_index: input.siteIndex, locator_index: input.locatorIndex,
        patch, candidate_kind: kind, expected_diagnostic: expectedDiagnostic,
        baseline_package: baselinePackage,
        candidate_package: authority, method_authority: METHOD,
        stage: 'constructed_single_site_candidate_not_compiled',
        qualified: false, semantic_mutation_credit: 0, dp_execution: false, global_g11: false });
    // Invalid-path controls have no normal typed M IR. This is committed from
    // the control's authored kind, never inferred from an observed rejection.
    // Other candidates must have a complete authorial projection or stay blocked.
    const mutantSeal = ['unknown_path_control_for_empty_L', 'unknown_path_control_for_witness_site'].includes(kind) ? null : sealWholeIR(
        projectPathSingleSiteAuthoredIR({ inventoryCandidate: context.inventory, packageReceipt,
            factKey: row.target.fact_key }));
    const seals = { C: context.irSeal, M: mutantSeal, S: context.irSeal };
    const wholeIRReference = freezeDeep({ stage: 'path_v3_single_site_whole_ir_sealed_before_compile',
        invocation_id: result.invocation_id, candidate_id: candidateId, target_id: row.target_id,
        method_authority: METHOD, sealed_before_captured_compile: true,
        worlds: ['C', 'M', 'S'].map(variant => ({ variant,
            authority_refs: variant === 'M' ? authority : baselinePackage,
            package_root: sha(canonicalValue(variant === 'M' ? authority : baselinePackage)),
            ir_sha256: seals[variant]?.sha256 ?? null,
            expectation: seals[variant] ? 'whole_authored_ir' : 'native_rejection_only_no_typed_ir' })),
        independent_compiler: false, qualified: false, semantic_mutation_credit: 0 });
    candidateIRReferences.set(wholeIRReference, seals);
    candidatePackages.set(result, { packageReceipt, restorationReceipt: context.packageReceipt, consumed: false,
        graph, baselineGraph: original.graphs.find(graph => graph.fact_key === row.target.fact_key),
        wholeIRReference, sourceContext: context, referenceStarted: false, reference: null });
    return result;
}
function preparePathStaticDomainControls(raw) {
    const { preparation, rowIndex } = fields(raw, ['preparation', 'rowIndex']);
    const context = contexts.get(preparation);
    if (!context || !Number.isSafeInteger(rowIndex) || rowIndex < 0) fail('static_preparation');
    const row = context.rows[rowIndex];
    if (!row || !row.sites.every(site => site.domain_complete && site.domain.locators.length === 0))
        fail('static_L_not_empty_or_incomplete');
    const controls = row.sites.map(site => {
        const target = site.authored_site;
        // The exact v2 unknown_path namespace/coordinate is committed before
        // M. A native observed error can contradict it, never rewrite it.
        return { admission_id: target.mutation_id, namespace: site.domain.namespace,
            authored_site: target, expected_diagnostic: {
                checker: 'graph_structure', code: target.definition === 'claimPath' ? 'claim_path' : 'path_missing',
                fact_key: row.target.fact_key, predicate_id: row.target.predicate_id,
                operand_index: target.site_path[1], site_path: target.site_path } };
    });
    const plan = freezeDeep({ stage: 'path_v3_empty_L_controls_prepared_not_qualified',
        target_id: row.target_id, qualification_id: row.qualification_id,
        domain_sha256: sha(canonicalValue(row.sites.map(site => site.domain))), controls,
        method_authority: METHOD, admission_authority: ADDENDUM,
        predicted_domain_reason: 'all_L_empty_before_M',
        qualified: false, semantic_mutation_credit: 0, dp_execution: false });
    staticPlans.set(plan, { context, row, rowIndex, controls });
    return plan;
}
function materializePathStaticDomainControl(raw) {
    const { plan, siteIndex } = fields(raw, ['plan', 'siteIndex']);
    const stored = staticPlans.get(plan);
    if (!stored || !Number.isSafeInteger(siteIndex) || siteIndex < 0 || !stored.controls[siteIndex]) fail('static_plan_authority');
    if (stored.purpose === 'witness_site_admission') {
        if (stored.usedSites.has(siteIndex)) fail('site_native_control_replay');
        stored.usedSites.add(siteIndex);
    }
    const control = stored.controls[siteIndex];
    const generated = materializePathAdmissionCandidate({ inventoryCandidate: stored.context.inventory,
        mutation_id: control.admission_id });
    const candidate = constructCandidate(stored.context, stored.row,
        { rowIndex: stored.rowIndex, siteIndex, locatorIndex: null }, generated.graph, generated.patch,
        stored.purpose === 'witness_site_admission' ? 'unknown_path_control_for_witness_site'
            : 'unknown_path_control_for_empty_L', control.expected_diagnostic);
    const context = candidatePackages.get(candidate);
    context.referenceStarted = true;
    // Empty-L controls retain their historical scope. For witness-site
    // controls this is NOT an empty-L/W claim or a semantic reference.
    context.reference = freezeDeep({ stage: stored.purpose === 'witness_site_admission'
        ? 'path_v3_witness_site_native_control_sealed_before_compile' : 'path_v3_empty_L_sealed_before_native_control',
        invocation_id: candidate.invocation_id, mutation_id: candidate.target_id, candidate_id: candidate.candidate_id,
        domain_sha256: plan.domain_sha256, method_version: 3, discriminating: false,
        ...(stored.purpose === 'witness_site_admission' ? { locator_domain_empty: plan.locator_domain_empty } : {}),
        qualified: false, semantic_mutation_credit: 0 });
    return candidate;
}
// Trusted BUILD bridge only. A genuine one-use package does not establish A,
// W, a native barrier, restored positive compilation or execution authority.
function takePathQualificationCandidatePackage(raw) {
    const input = fields(raw, ['candidate']);
    const context = candidatePackages.get(input.candidate);
    if (!context || context.consumed) fail('candidate_authority_or_replay');
    if (!context.reference) fail('reference_not_sealed_before_m');
    context.consumed = true;
    return Object.freeze({ packageReceipt: context.packageReceipt,
        restorationReceipt: context.restorationReceipt, reference: context.reference,
        wholeIRReference: context.wholeIRReference,
        qualified: false, semantic_mutation_credit: 0 });
}
// Closed reference bridge, not a caller-authored semantic candidate. Once a
// reference starts, failure is monotone: no retry or M package release follows.
function beginPathQualificationReference(raw) {
    const input = fields(raw, ['candidate']);
    const candidate = input.candidate, context = candidatePackages.get(candidate);
    if (!context || context.consumed || context.referenceStarted) fail('reference_authority_or_replay');
    context.referenceStarted = true;
    const view = freezeDeep({ target: candidate.target, graph: context.graph, patch: candidate.patch });
    const capability = freezeDeep({ mutation_id: candidate.target_id, candidate_id: candidate.candidate_id,
        graph_sha256: sha(JSON.stringify(context.graph)), baseline_graph_sha256: sha(JSON.stringify(context.baselineGraph)),
        authority_refs: candidate.baseline_package });
    return Object.freeze({ packageReceipt: context.restorationReceipt, candidate: view, capability,
        invocation_id: candidate.invocation_id, complete(reference) {
            const { readPathSemanticReference } = require('./pathSemanticReference');
            if (context.reference || context.consumed || readPathSemanticReference(reference) !== reference
                || reference.method_version !== 3 || reference.invocation_id !== candidate.invocation_id
                || reference.candidate_id !== candidate.candidate_id || reference.mutation_id !== candidate.target_id)
                fail('reference_identity');
            context.reference = reference;
            return reference;
        } });
}
module.exports = { preparePathQualificationInventory, verifyPathQualificationInventory,
    materializePathQualificationLocator, takePathQualificationCandidatePackage, beginPathQualificationReference,
    preparePathStaticDomainControls, materializePathStaticDomainControl,
    preparePathQualificationHistoricalMigration, verifyPathQualificationHistoricalMigration,
    preparePathQualificationAdmissionDomain, verifyPathQualificationAdmissionDomain,
    preparePathQualificationWitnessPreselection, takePathQualificationWitnessPreselection,
    preparePathSelectionAdmissionControls, materializePathSelectionAdmissionControl,
    preparePathProofAuthorship, readPathProofAuthorship, preparePathPhaseAuthorship, readPathPhaseAuthorship,
    preparePathWholeIRReference, verifyPathWholeIRReference, readPathWholeIRReference,
    preparePathCandidateWholeIRReference, verifyPathCandidateWholeIRReference, readPathWholeIRFailure,
    preparePathCandidateProgramAuthorship, readPathCandidateProgramAuthorship, METHOD };
```

## src/next/provenance/pathSemanticReference.js

SHA-256 6880b8cf205fbb337be18c8f607aecb6a28d6d6255de5a36399de955629e812d; Git blob b9338bc70e3e440eae276aaa51b6ae0d04b5f877; bytes 18997.

```javascript
'use strict';
// HARNESS reference only. No compiler, evaluator, proof runtime or actual input.
const { createHash } = require('node:crypto');
const { types } = require('node:util');
const { admittedDocuments } = require('./packageContract');
const { canonicalValue, freezeDeep } = require('../kernel/canonicalValue');
const prefix = 'docs/contracts/next/provenance-v2/';
const references = new WeakMap();
const unavailable = Symbol('unavailable');
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const equal = (a, b) => canonicalValue(a) === canonicalValue(b);
const fail = code => { throw new Error('path_semantic_reference_' + code); };
const integerPair = (left, right) => Number.isSafeInteger(left) && Number.isSafeInteger(right);
// Independent Gregorian civil reference: string ordering is chronological only
// after validating the exact YYYY-MM-DD domain. No Date/timezone or guest helper.
function civilParts(value, monthOnly = false) {
    if (typeof value !== 'string') return null;
    const match = (monthOnly ? /^(\d{4})-(\d{2})$/ : /^(\d{4})-(\d{2})-(\d{2})$/).exec(value);
    if (!match) return null;
    const year = Number(match[1]), month = Number(match[2]);
    if (year < 1 || month < 1 || month > 12) return null;
    if (monthOnly) return { year, month };
    const day = Number(match[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day >= 1 && day <= days[month - 1] ? { year, month, day } : null;
}
// Independent 400-year civil table, not the guest civilCalendar algorithm.
// Values below are reference relations only and mint no execution authority.
const yearLengths = Array.from({ length: 400 }, (_, index) => {
    const year = index + 1;
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365;
});
const yearPrefix = [0];
yearLengths.forEach(length => yearPrefix.push(yearPrefix.at(-1) + length));
const monthDays = ({ year, month }) => month === 2
    ? year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28
    : [4, 6, 9, 11].includes(month) ? 30 : 31;
function civilOrdinal(parts) {
    const previousYears = parts.year - 1;
    let value = Math.floor(previousYears / 400) * yearPrefix[400]
        + yearPrefix[previousYears % 400] + parts.day;
    for (let month = 1; month < parts.month; month++) value += monthDays({ year: parts.year, month });
    return value;
}
const maximumOrdinal = civilOrdinal({ year: 9999, month: 12, day: 31 });
const safeInteger = value => Number.isSafeInteger(value) && !Object.is(value, -0);
// HARNESS-only bounded timezone reference, derived from an external immutable
// IANA 2025b source, not native ICU or a financial example. All 57 Brazil rules
// are finite, end by 2019 and leave SAVE=0; Sao Paulo's final era is -03:00.
// Domains before 2020 and after AD 9999 remain unavailable, never guessed.
const timezoneReferenceDomain = Object.freeze({
    version: '2025b', zone: 'America/Sao_Paulo', calendar: 'proleptic_gregorian',
    utc_start: '2020-01-01T00:00:00Z', utc_end_exclusive: '10000-01-01T00:00:00Z',
    offset_seconds: -10800,
    source_commit: '7e1145bfdb9630c127841dc8ce808a937a300938',
    source_blob: '06fee598baf41851c073cdfb0fd582b9ac645342',
    source_sha256: '57cc4ee3dc4bd575f126ba76f284a9ee67330c6fbb7576792eda27f41451ff22'
});
const utcReferenceStart = (civilOrdinal({ year: 2020, month: 1, day: 1 }) - 1) * 86400;
const utcReferenceEnd = maximumOrdinal * 86400;
function civilInstantMatches(instant, date, zone, calendar) {
    if (typeof instant !== 'string' || zone !== timezoneReferenceDomain.zone
        || calendar !== timezoneReferenceDomain.calendar) return null;
    const target = civilParts(date);
    const parts = /^(?<date>\d{4}-\d{2}-\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.\d+)?(?<zone>Z|(?<sign>[+-])(?<offsetHour>\d{2}):(?<offsetMinute>\d{2}))$/.exec(instant)?.groups;
    const origin = parts && civilParts(parts.date);
    if (!target || !origin) return null;
    const hour = Number(parts.hour), minute = Number(parts.minute), second = Number(parts.second);
    const offsetHour = parts.zone === 'Z' ? 0 : Number(parts.offsetHour);
    const offsetMinute = parts.zone === 'Z' ? 0 : Number(parts.offsetMinute);
    if (hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) return null;
    const spellingOffset = parts.zone === 'Z' ? 0
        : (parts.sign === '+' ? 1 : -1) * (offsetHour * 3600 + offsetMinute * 60);
    const utcSeconds = (civilOrdinal(origin) - 1) * 86400
        + hour * 3600 + minute * 60 + second - spellingOffset;
    if (!safeInteger(utcSeconds) || utcSeconds < utcReferenceStart || utcSeconds >= utcReferenceEnd) return null;
    // Fractions are nonnegative and below one second. Civil boundaries here
    // are integral seconds, so discarding them preserves the containing day.
    const localOrdinal = Math.floor((utcSeconds + timezoneReferenceDomain.offset_seconds) / 86400) + 1;
    return localOrdinal === civilOrdinal(target);
}
function ownRecord(value, names) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return null;
    const d = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(d).length !== names.length || names.some(name => !d[name]?.enumerable
        || !Object.hasOwn(d[name], 'value'))) return null;
    return Object.fromEntries(names.map(name => [name, d[name].value]));
}
const civilRelations = Object.freeze({
    civil_date_matches: { arity: 4, evaluate: ([instant, date, zone, calendar]) =>
        civilInstantMatches(instant, date, zone, calendar) },
    day_of_month_matches: { arity: 3, evaluate: ([date, day]) => {
        const parts = civilParts(date);
        return parts && safeInteger(day) && day >= 1 && day <= 31 ? parts.day === day : null;
    } },
    month_bounds_match: { arity: 4, evaluate: ([month, start, end]) => {
        const parts = civilParts(month, true), first = civilParts(start), last = civilParts(end);
        return parts && first && last ? start === `${month}-01`
            && end === `${month}-${String(monthDays(parts)).padStart(2, '0')}` : null;
    } },
    civil_offset_matches: { arity: 5, evaluate: ([origin, amount, unit, target]) => {
        const from = civilParts(origin), to = civilParts(target);
        if (!from || !to || !safeInteger(amount)) return null;
        if (unit === 'day') {
            const expected = civilOrdinal(from) + amount;
            return safeInteger(expected) && expected >= 1 && expected <= maximumOrdinal
                ? expected === civilOrdinal(to) : null;
        }
        if (unit !== 'month') return null;
        const index = (from.year - 1) * 12 + from.month - 1 + amount;
        if (!safeInteger(index) || index < 0 || index >= 9999 * 12) return null;
        const year = Math.floor(index / 12) + 1, month = index % 12 + 1;
        if (from.day > monthDays({ year, month })) return null;
        return to.year === year && to.month === month && to.day === from.day;
    } },
    inclusive_day_count_matches: { arity: 3, evaluate: ([value, count]) => {
        const range = ownRecord(value, ['kind', 'start', 'end', 'start_inclusive', 'end_inclusive']);
        if (!range || range.kind !== 'range' || range.start_inclusive !== true || range.end_inclusive !== true
            || !safeInteger(count) || count < 1) return null;
        const start = civilParts(range.start), end = civilParts(range.end);
        return start && end && range.start <= range.end
            ? civilOrdinal(end) - civilOrdinal(start) + 1 === count : null;
    } }
});
function referenceCivilRelation(operator, args) {
    if (typeof operator !== 'string' || !Object.hasOwn(civilRelations, operator)
        || !Array.isArray(args) || types.isProxy(args) || Object.getPrototypeOf(args) !== Array.prototype) return null;
    const spec = civilRelations[operator], d = Object.getOwnPropertyDescriptors(args);
    if (d.length?.value !== spec.arity || Reflect.ownKeys(d).length !== spec.arity + 1
        || Array.from({ length: spec.arity }, (_, index) => index).some(index => !d[index]?.enumerable
            || !Object.hasOwn(d[index], 'value'))) return null;
    const values = Array.from({ length: spec.arity }, (_, index) => d[index].value);
    if (values.at(-1) !== 'proleptic_gregorian') return null;
    return spec.evaluate(values);
}
function referenceCivilDateContained(date, period) {
    if (!civilParts(date) || !period || typeof period !== 'object' || Array.isArray(period)
        || types.isProxy(period) || ![Object.prototype, null].includes(Object.getPrototypeOf(period))) return null;
    const descriptors = Object.getOwnPropertyDescriptors(period);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some(key => typeof key !== 'string' || !descriptors[key].enumerable
        || !Object.hasOwn(descriptors[key], 'value'))) return null;
    const p = Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
    const exact = names => keys.length === names.length && names.every(name => Object.hasOwn(p, name));
    if (p.kind === 'range') {
        if (!exact(['kind', 'start', 'end', 'start_inclusive', 'end_inclusive'])
            || !civilParts(p.start) || !civilParts(p.end) || p.start > p.end
            || typeof p.start_inclusive !== 'boolean' || typeof p.end_inclusive !== 'boolean') return null;
        return (date > p.start || date === p.start && p.start_inclusive)
            && (date < p.end || date === p.end && p.end_inclusive);
    }
    if (!exact(['kind', 'value'])) return null;
    if (['month', 'statement_competence', 'budget_cycle'].includes(p.kind))
        return civilParts(p.value, true) ? date.slice(0, 7) === p.value : null;
    if (!['date', 'statement_due', 'through'].includes(p.kind) || !civilParts(p.value)) return null;
    return p.kind === 'through' ? date <= p.value : date === p.value;
}
// A declared semantic reference domain, not a list of target IDs. Unsupported
// operator classes stay pending; no guest/proof implementation is a fallback.
const operators = Object.freeze({
    eq: { arity: 2, evaluate: equal }, not_eq: { arity: 2, evaluate: (left, right) => !equal(left, right) },
    field_eq: { arity: 2, evaluate: equal }, period_eq: { arity: 2, evaluate: equal },
    state_is: { arity: 2, evaluate: equal },
    date_in_period: { arity: 2, evaluate: (date, period) => referenceCivilDateContained(date, period) ?? unavailable },
    abs_eq: { arity: 2, evaluate: (left, right) => integerPair(left, right) ? Math.abs(left) === Math.abs(right) : unavailable },
    opposite_sign: { arity: 2, evaluate: (left, right) => integerPair(left, right) ? left !== 0 && right !== 0
        && (left < 0) !== (right < 0) : unavailable },
    ...Object.fromEntries(Object.entries(civilRelations).map(([operator, spec]) => [operator,
        { arity: spec.arity, evaluate: (...args) => referenceCivilRelation(operator, args) ?? unavailable }]))
});
function sealPathSemanticReference(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw); const names = ['packageReceipt', 'candidate'];
    if (Reflect.ownKeys(d).length !== names.length || names.some(name => !d[name]?.enumerable
        || !Object.hasOwn(d[name], 'value'))) fail('input');
    const candidate = d.candidate.value;
    const { readPathSemanticCandidate } = require('./pathMutationInventory');
    const capability = readPathSemanticCandidate(candidate);
    if (!capability) fail('candidate_authority');
    return sealCandidateReference(d.packageReceipt.value, candidate, capability);
}
function sealCandidateReference(packageReceipt, candidate, capability, v3 = null) {
    const docs = admittedDocuments(packageReceipt);
    if (!equal(docs.map(({ path, sha256 }) => ({ path, sha256 })), capability.authority_refs)) fail('package_authority');
    const byPath = new Map(docs.map(row => [row.path, row.value]));
    const corpus = byPath.get(prefix + 'graphs-v2.json');
    const original = corpus.graphs.find(row => row.fact_key === candidate.target.fact_key);
    if (sha(JSON.stringify(original)) !== capability.baseline_graph_sha256
        || sha(JSON.stringify(candidate.graph)) !== capability.graph_sha256) fail('graph_authority');
    const restored = JSON.parse(JSON.stringify(candidate.graph));
    let container = restored.predicates.find(row => row.id === candidate.target.predicate_id);
    for (const token of candidate.patch.location.slice(0, -1)) container = container[token];
    container[candidate.patch.location.at(-1)] = candidate.patch.before;
    if (!equal(restored, original)) fail('secondary_mutation');
    const claim = byPath.get(corpus.claim_contract.path).claims.find(row => row.fact_key === original.fact_key);
    const snapshots = byPath.get(corpus.snapshot_manifest.path).snapshots;
    const snapshotMap = new Map(snapshots.map(row => [canonicalValue([row.kind, row.ref_id, row.version]), row.payload]));
    function at(value, segments) {
        for (const segment of segments) {
            if (!value || typeof value !== 'object' || !Object.hasOwn(value, segment)) return unavailable;
            value = value[segment];
        }
        return value;
    }
    function field(graph, locator) {
        const node = graph.nodes[locator.node];
        if (node?.binding !== 'snapshot') return unavailable;
        return at(snapshotMap.get(canonicalValue([node.kind, node.ref_id, node.version])), locator.segments);
    }
    // Resolve only the admitted authored window grammar, independently of IR,
    // guest window normalization and baseline actual. Scalar bindings cannot
    // recurse into windows or use parent/derived material as a fallback.
    function window(graph, id) {
        if (typeof id !== 'string' || !Object.hasOwn(graph.windows, id)) return unavailable;
        const value = graph.windows[id];
        const scalar = arg => {
            for (const key of ['field', 'claim', 'literal']) {
                const entry = ownRecord(arg, [key]);
                if (entry) return operand(graph, entry);
            }
            return unavailable;
        };
        const month = ownRecord(value, ['kind', 'value']);
        if (month?.kind === 'month') {
            const resolved = scalar(month.value);
            return civilParts(resolved, true) ? { kind: 'month', value: resolved } : unavailable;
        }
        const range = ownRecord(value, ['kind', 'start', 'end', 'start_inclusive', 'end_inclusive']);
        if (!range || range.kind !== 'range' || typeof range.start_inclusive !== 'boolean'
            || typeof range.end_inclusive !== 'boolean') return unavailable;
        const start = scalar(range.start), end = scalar(range.end);
        if (!civilParts(start) || !civilParts(end) || start > end) return unavailable;
        return { kind: 'range', start, end, start_inclusive: range.start_inclusive,
            end_inclusive: range.end_inclusive };
    }
    function operand(graph, arg) {
        if (arg.field) return field(graph, arg.field);
        if (arg.claim) return at(claim, arg.claim.segments);
        if (arg.literal) return arg.literal.value;
        if (arg.period_literal) return arg.period_literal;
        if (arg.period_ref) return window(graph, arg.period_ref);
        if (arg.period_bound) {
            const bound = ownRecord(arg.period_bound, ['period', 'bound']);
            if (!bound || !['start', 'end'].includes(bound.bound)) return unavailable;
            const resolved = window(graph, bound.period);
            return resolved !== unavailable && resolved.kind === 'range' ? resolved[bound.bound] : unavailable;
        }
        if (arg.presence) {
            const node = graph.nodes[arg.presence.node];
            if (node?.binding !== 'snapshot') return unavailable;
            const payload = snapshotMap.get(canonicalValue([node.kind, node.ref_id, node.version]));
            if (!payload) return unavailable;
            return at(payload, arg.presence.segments) !== unavailable;
        }
        return unavailable;
    }
    const baseline = original.predicates.find(row => row.id === candidate.target.predicate_id);
    const mutant = candidate.graph.predicates.find(row => row.id === baseline.id);
    const operation = Object.hasOwn(operators, baseline.op) ? operators[baseline.op] : null;
    const before = baseline.args.map(arg => operand(original, arg));
    const after = mutant.args.map(arg => operand(candidate.graph, arg));
    const supported = operation && before.length === operation.arity && after.length === operation.arity
        && [...before, ...after].every(value => value !== unavailable);
    const baselineSatisfied = supported ? operation.evaluate(...before) : unavailable;
    const mutantSatisfied = supported ? operation.evaluate(...after) : unavailable;
    const available = typeof baselineSatisfied === 'boolean' && typeof mutantSatisfied === 'boolean';
    const result = freezeDeep({ stage: 'path_semantic_reference_sealed_before_dp',
        mutation_id: capability.mutation_id, candidate_id: capability.candidate_id,
        predicate_id: baseline.id, operator: baseline.op, available,
        baseline_satisfied: available ? baselineSatisfied : null,
        mutant_satisfied: available ? mutantSatisfied : null,
        expected_violations: [baseline.atom], financial_receipt: false,
        source: 'admitted_frozen_claim_and_primary_snapshot_only',
        world_sha256: sha(canonicalValue(docs.map(({ path, sha256 }) => ({ path, sha256 })))),
        operands_sha256: available ? sha(canonicalValue({ before, after })) : null,
        ...(v3 ? { method_version: 3, invocation_id: v3.invocation_id,
            discriminating: available && baselineSatisfied === true && mutantSatisfied === false,
            semantic_mutation_credit: 0, qualified: false } : {}),
        ...(baseline.op === 'civil_date_matches' ? { timezone_reference_domain: timezoneReferenceDomain } : {}) });
    references.set(result, result);
    return result;
}
function sealPathQualificationReference(raw) {
    const { beginPathQualificationReference } = require('./pathQualificationV3');
    const input = beginPathQualificationReference(raw);
    return input.complete(sealCandidateReference(input.packageReceipt, input.candidate, input.capability, input));
}
const readPathSemanticReference = raw => references.get(raw) ?? null;
// The pure reference export carries no candidate capability or execution credit.
module.exports = { sealPathSemanticReference, sealPathQualificationReference, readPathSemanticReference,
    referenceCivilDateContained, referenceCivilRelation };
```

## src/next/provenance/predicateTypes.js

SHA-256 7ec5e1dc0348599bf42aa642a575233bb3642371fb2a48bea77b2558de6a25b8; Git blob 7730da8de30a550ec9602af6fbf6b75e71a76cbf; bytes 22140.

```javascript
'use strict';

const { unifyOperatorTypes } = require('./operatorTypes');
const { validateLiteral } = require('./literalTypes');
const { parseDate, parseMonth, dayOrdinal } = require('./civilCalendar');
const { freezeDeep } = require('../kernel/canonicalValue');
const { claimReferenceKind } = require('./claimNominalTypes');
const diagnostics = new WeakMap();
const fail = code => {
    const error = new Error(`predicate_types_${code}`);
    diagnostics.set(error, freezeDeep({ checker: 'predicate_types', code }));
    throw error;
};
// Error messages are not authority. Only a native failure can carry the
// coordinate assigned by this pass; foreign/forged errors return null.
const readPredicateTypeDiagnostic = error => diagnostics.get(error) ?? null;
const own = (value, key) => value !== null && typeof value === 'object' && Object.hasOwn(value, key);
const scalar = (type, extra = {}) => ({ form: 'scalar', type, ...extra });
const nodeType = kind => ({ form: 'node', kind });
const enumType = values => scalar('enum', { values, domain: JSON.stringify([...values].sort()) });
// Schemas have already been validated by the admitted, static validator. This
// resolves their local discriminated branches; it is not another JSON Schema
// validator or a fallback to the shape/type of a primitive runtime value.
function claimSchemaPath(root, claim, segments) {
    function resolve(schema, value) {
        if (schema.$ref) {
            const match = /^#\/definitions\/([A-Za-z0-9_]+)$/.exec(schema.$ref);
            if (!match || !own(root.definitions, match[1])) fail('claim_schema_ref');
            return { ...resolve(root.definitions[match[1]], value), ref: match[1] };
        }
        if (schema.oneOf) {
            const candidates = schema.oneOf.filter(branch => value && typeof value === 'object'
                && (branch.required || []).every(key => own(value, key))
                && Object.entries(branch.properties || {}).every(([key, property]) =>
                    (!own(property, 'const') || value[key] === property.const)
                    && (!property.enum || property.enum.includes(value[key]))));
            if (candidates.length !== 1) fail('claim_schema_branch');
            return resolve(candidates[0], value);
        }
        return { schema };
    }
    let current = resolve(root.definitions.claim, claim);
    let value = claim;
    for (const segment of segments) {
        if (!own(current.schema.properties, segment) || !own(value, segment)) fail('claim_path');
        value = value[segment];
        current = resolve(current.schema.properties[segment], value);
    }
    return { ...current, value };
}

// Internal pass after admission, schemas, identity/edge indexing and template
// validation. This function alone does not establish those preconditions.
function compilePredicateTypesInternal({ graphs, claims, snapshots, materialRegistry, operatorRegistry, claimSchema }, qualification) {
    const claimMap = new Map(claims.map(claim => [claim.fact_key, claim]));
    const operators = new Map(operatorRegistry.operators.map(operator => [operator.id, operator]));
    const tuple = node => JSON.stringify([node.kind, node.ref_id, node.version]);
    const snapshotMap = new Map(snapshots.map(snapshot => [tuple(snapshot), snapshot]));
    let count = 0;
    const typedGraphs = [];
    function irType(type) {
        const result = {};
        for (const key of ['form', 'type', 'kind', 'unit', 'domain', 'target', 'periodKind']) {
            if (own(type, key)) result[key] = type[key];
        }
        if (type.item) result.item = irType(type.item);
        if (type.value) result.value = irType(type.value);
        return result;
    }
    for (const graph of graphs) {
        const typedPredicates = [];
        function atOperand(predicate, operand_index, resolve) {
            try { return resolve(); }
            catch (error) {
                const diagnostic = diagnostics.get(error);
                if (diagnostic && !Object.hasOwn(diagnostic, 'predicate_id')) diagnostics.set(error, freezeDeep({ ...diagnostic,
                    fact_key: graph.fact_key, predicate_id: predicate.id, operand_index }));
                throw error;
            }
        }
        const claim = claimMap.get(graph.fact_key);
        if (!claim) fail('claim_missing');
        const node = alias => {
            if (!own(graph.nodes, alias)) fail('node_missing');
            return graph.nodes[alias];
        };
        const payload = alias => snapshotMap.get(tuple(node(alias)))?.payload;
        const fields = kind => {
            if (!own(materialRegistry.kinds, kind)) fail('kind_missing');
            return materialRegistry.kinds[kind].fields;
        };
        function fieldDescriptor(kind, segments) {
            if (!Array.isArray(segments) || segments.length !== 1) fail('field_path');
            const registryFields = fields(kind);
            if (!own(registryFields, segments[0]) || registryFields[segments[0]].class === 'non_material') fail('field_material');
            return registryFields[segments[0]];
        }
        function targetKind(alias, name, descriptor) {
            if (node(alias).kind === 'collection' && name === 'members') {
                const origin = payload(alias)?.collection_name;
                const candidates = Object.entries(materialRegistry.kinds).filter(([, kind]) => kind.origin === origin);
                if (candidates.length !== 1 || !descriptor.targets.includes(candidates[0][0])) fail('collection_origin');
                for (const ref of payload(alias).members) {
                    const targets = snapshots.filter(snapshot => descriptor.targets.includes(snapshot.kind) && snapshot.ref_id === ref);
                    if (targets.length !== 1 || targets[0].kind !== candidates[0][0]) fail('collection_member_kind');
                }
                return candidates[0][0];
            }
            if (descriptor.targets.length === 1) return descriptor.targets[0];
            const ref = payload(alias)?.[name];
            const matches = snapshots.filter(snapshot => descriptor.targets.includes(snapshot.kind) && snapshot.ref_id === ref);
            if (matches.length !== 1) fail('reference_nominal_unresolved');
            return matches[0].kind;
        }
        function fieldValue(kind, name, descriptor, alias) {
            let value;
            if (descriptor.type === 'id') value = scalar('id', { kind: name === 'id' ? kind : `${kind}.${name}` });
            else if (descriptor.type === 'ref') {
                const target = alias ? targetKind(alias, name, descriptor)
                    : descriptor.targets.length === 1 ? descriptor.targets[0] : null;
                if (!target) fail('reference_nominal_unresolved');
                value = scalar('id', { kind: target });
            } else if (descriptor.type === 'enum') value = enumType(descriptor.values);
            else if (descriptor.type === 'money_minor') value = scalar('money_minor', { unit: 'BRL_minor' });
            else if (descriptor.type === 'ref_list') {
                const target = alias ? targetKind(alias, name, descriptor)
                    : descriptor.targets.length === 1 ? descriptor.targets[0] : null;
                if (!target) fail('reference_nominal_unresolved');
                value = { form: 'sequence', item: scalar('id', { kind: target }) };
            } else if (['typed_result', 'typed_period', 'role_ref_list'].includes(descriptor.type)) value = { form: 'record', type: descriptor.type };
            else value = scalar(descriptor.type);
            if (alias && own(payload(alias), name)) value.known = payload(alias)[name];
            return value;
        }
        function field(ref) {
            const kind = node(ref.node).kind;
            return { form: 'field', value: fieldValue(kind, ref.segments[0], fieldDescriptor(kind, ref.segments), ref.node) };
        }
        function claimField(ref) {
            if (qualification?.variant === 'M' && graph.fact_key === qualification.subobligation.fact_key
                && JSON.stringify(ref.segments) === JSON.stringify(qualification.locator)) {
                // Nominal type is the admitted profile's exact descriptor,
                // not inferred from a value or a caller-provided schema.
                return { ...qualification.type };
            }
            const { schema, ref: schemaRef, value } = claimSchemaPath(claimSchema, claim, ref.segments);
            const path = ref.segments.join('.');
            let type;
            if (path === 'period') type = { form: claim.period.kind === 'range' ? 'range' : 'period', periodKind: claim.period.kind };
            else if (schemaRef === 'date' || schemaRef === 'month') type = scalar(schemaRef);
            else if (schema.enum || own(schema, 'const')) type = enumType(schema.enum || [schema.const]);
            else if (schemaRef === 'id') {
                let kind;
                if (path.startsWith('subject.')) kind = claimReferenceKind(claim, ref.segments);
                else kind = `claim.${path}`;
                type = scalar('id', { kind });
            } else if (schema.type === 'integer') type = scalar(schema.minimum >= 1 ? 'positive_integer' : 'integer');
            else if (schema.type === 'boolean') type = scalar('boolean');
            else if (schema.type === 'object') type = { form: 'record' };
            else if (schema.type === 'array') type = { form: 'sequence', item: scalar('id', { kind: claimReferenceKind(claim, ref.segments) }) };
            else if (schema.type === 'string') type = scalar('text');
            else fail('claim_type');
            return { ...type, known: value };
        }
        const setKinds = new Map();
        function hint(name, kind) {
            if (!own(graph.sets, name)) fail('set_missing');
            if (!kind) return false;
            if (setKinds.has(name) && setKinds.get(name) !== kind) fail('set_kind');
            const changed = !setKinds.has(name);
            setKinds.set(name, kind);
            return changed;
        }
        for (const [name, members] of Object.entries(graph.sets)) for (const alias of members) hint(name, node(alias).kind);
        function refSetType(ref) {
            const kind = node(ref.field.node).kind;
            const descriptor = fieldDescriptor(kind, ref.field.segments);
            if (descriptor.type !== 'ref_list') fail('ref_set');
            return targetKind(ref.field.node, ref.field.segments[0], descriptor);
        }
        // Empty sets obtain a kind only from explicit typed relations. No kind
        // is guessed from an empty value or a fact/metric name.
        let changed;
        do {
            changed = false;
            for (const selection of graph.selections) {
                changed = hint(selection.selected_set, setKinds.get(selection.candidate_set)) || changed;
                changed = hint(selection.candidate_set, setKinds.get(selection.selected_set)) || changed;
            }
            for (const predicate of graph.predicates) {
                if (predicate.op === 'set_eq' || predicate.op === 'set_subset') {
                    const [left, right] = predicate.args;
                    const type = arg => atOperand(predicate, predicate.args.indexOf(arg), () =>
                        arg.ref_set ? refSetType(arg.ref_set) : arg.set ? setKinds.get(arg.set) : null);
                    if (left.set) changed = atOperand(predicate, 0, () => hint(left.set, type(right))) || changed;
                    if (right.set) changed = atOperand(predicate, 1, () => hint(right.set, type(left))) || changed;
                }
                const setArg = predicate.args.find(arg => arg.set);
                const template = predicate.args.find(arg => arg.template);
                if (setArg && template) for (const binding of Object.values(template.bindings)) {
                    if (binding.selector) changed = atOperand(predicate, predicate.args.indexOf(setArg),
                        () => hint(setArg.set, binding.selector.kind)) || changed;
                }
            }
        } while (changed);
        function set(name) {
            if (!setKinds.has(name)) fail('set_kind_unresolved');
            return { form: 'set', item: nodeType(setKinds.get(name)) };
        }
        function window(id) {
            if (!own(graph.windows, id)) fail('window_missing');
            const value = graph.windows[id];
            if (value.kind === 'month') {
                const month = raw(value.value);
                const type = month.form === 'field' ? month.value : month;
                if (type.type !== 'month') fail('window_type');
                if (own(type, 'known')) parseMonth(type.known);
                return { form: 'period', periodKind: 'month' };
            }
            if (value.kind !== 'range') fail('window_type');
            const limits = [value.start, value.end].map(arg => {
                const result = raw(arg);
                const type = result.form === 'field' ? result.value : result;
                if (type.type !== 'date') fail('window_type');
                if (own(type, 'known')) parseDate(type.known);
                return type;
            });
            if (limits.every(limit => own(limit, 'known')) && dayOrdinal(limits[0].known) > dayOrdinal(limits[1].known)) fail('window_order');
            return { form: 'range', periodKind: 'range', limits };
        }
        function raw(arg) {
            if (arg.node) return nodeType(node(arg.node).kind);
            if (arg.field) return field(arg.field);
            if (arg.claim) return claimField(arg.claim);
            if (arg.literal) {
                const type = validateLiteral(arg.literal);
                return { ...scalar(type, type === 'money_minor' ? { unit: 'BRL_minor' } : {}), literal: true, known: arg.literal.value };
            }
            if (arg.presence) { field(arg.presence); return scalar('boolean'); }
            if (arg.set) return set(arg.set);
            if (arg.ref_set) return { form: 'set', item: nodeType(refSetType(arg.ref_set)) };
            if (arg.edge) {
                const edge = graph.edges.find(edge => edge.id === arg.edge);
                if (!edge) fail('edge_missing');
                return { form: 'edge', target: node(edge.target).kind };
            }
            if (arg.selector) {
                const descriptor = fieldDescriptor(arg.selector.kind, arg.selector.segments);
                return { form: 'field_selector', kind: arg.selector.kind,
                    value: fieldValue(arg.selector.kind, arg.selector.segments[0], descriptor), descriptor };
            }
            if (arg.period_ref) return window(arg.period_ref);
            if (arg.period_bound) {
                const period = window(arg.period_bound.period);
                if (period.form !== 'range' || !['start', 'end'].includes(arg.period_bound.bound)) fail('window_bound');
                return period.limits[arg.period_bound.bound === 'start' ? 0 : 1];
            }
            if (arg.period_literal) return { form: arg.period_literal.kind === 'range' ? 'range' : 'period', periodKind: arg.period_literal.kind };
            if (arg.template) {
                const kinds = [...new Set(Object.values(arg.bindings).filter(binding => binding.selector).map(binding => binding.selector.kind))];
                if (kinds.length !== 1) fail('template_kind');
                return { form: 'predicate_template_ref', kind: kinds[0] };
            }
            if (arg.projection) {
                const member = set(arg.projection.set);
                const selector = raw({ selector: arg.projection.selector });
                if (member.item.kind !== selector.kind) fail('projection_kind');
                return { form: arg.projection.as, item: selector.value };
            }
            if (arg.sort) {
                const kinds = [...new Set(arg.sort.keys.map(key => raw({ selector: key.selector }).kind))];
                if (kinds.length !== 1) fail('sort_kind');
                return { form: 'sort', kind: kinds[0] };
            }
            if (arg.partial_policy) fail('partial_policy_missing');
            fail('argument_unresolved');
        }
        for (const id of Object.keys(graph.windows || {})) window(id);
        for (const predicate of graph.predicates) {
            const operator = operators.get(predicate.op);
            if (!operator || operator.args.length !== predicate.args.length) fail('operator');
            const rawTypes = predicate.args.map((arg, operand_index) =>
                atOperand(predicate, operand_index, () => raw(arg)));
            const scalarView = type => type.form === 'field' ? type.value : type;
            const peers = rawTypes.filter(type => !type.literal).map(scalarView);
            const types = rawTypes.map((original, index) => {
                const signature = operator.args[index];
                let type = scalarView(original);
                if (original.form === 'field' && (signature === 'field_path:T' || signature === 'state_path')) return original;
                if (signature.startsWith('edge_selector:')) {
                    if (original.form !== 'field_selector' || original.descriptor.type !== 'ref'
                        || original.descriptor.targets.length !== 1) fail('edge_selector');
                    return { form: 'edge_selector', kind: original.kind, target: original.descriptor.targets[0] };
                }
                if (signature === 'kind_literal' || signature === 'digest_literal') {
                    if (!type.literal || type.type !== (signature === 'kind_literal' ? 'kind' : 'digest')) fail('literal_type');
                    if (type.type === 'kind' && !own(materialRegistry.kinds, type.known)) fail('kind_missing');
                    return { form: signature };
                }
                if (signature === 'state_literal') {
                    if (!type.literal || type.type !== 'enum') fail('literal_type');
                    const peer = peers.find(peer => peer.type === 'enum');
                    if (!peer?.values?.includes(type.known)) fail('enum_value');
                    return { form: signature };
                }
                if (signature === 'scalar:T' && type.literal && ['id', 'enum'].includes(type.type)) {
                    const matches = peers.filter(peer => peer.form === 'scalar' && peer.type === type.type);
                    if (matches.length === 1) {
                        if (matches[0].values && !matches[0].values.includes(type.known)) fail('enum_value');
                        type = { ...matches[0], literal: true, known: type.known };
                    }
                }
                if (signature === 'calendar' || signature === 'timezone') {
                    const allowed = materialRegistry.kinds.evaluation_policy?.fields?.[signature]?.values;
                    if (type.type !== 'enum' || !Array.isArray(allowed) || !allowed.length) fail('policy_type');
                    if (type.literal) {
                        if (!allowed.includes(type.known)) fail('policy_value');
                    } else if (!type.values || type.values.length !== allowed.length || type.values.some(value => !allowed.includes(value))) fail('policy_type');
                    if (signature === 'calendar' && (allowed.length !== 1 || allowed[0] !== 'proleptic_gregorian')) fail('calendar');
                    return scalar(signature);
                }
                if (signature === 'civil_unit') {
                    if (!type.literal || type.type !== 'enum' || !['day', 'month'].includes(type.known)) fail('civil_unit');
                    return scalar('civil_unit');
                }
                if (signature === 'number:U' && type.literal && type.type === 'money_minor') return scalar('money_minor', { unit: 'BRL_minor' });
                if (type.literal && type.type === 'integer' && ['positive_integer', 'nonnegative_integer'].includes(signature)) {
                    if (type.known < (signature === 'positive_integer' ? 1 : 0)) fail('integer_refinement');
                    return scalar(signature);
                }
                return type;
            });
            try { unifyOperatorTypes(operator, types); }
            catch (error) {
                // Compiler diagnostics identify declarations, never operand values.
                const failure = new Error(`${error.message}:${graph.fact_key}:${predicate.id}`, { cause: error });
                diagnostics.set(failure, freezeDeep({ checker: 'predicate_types', code: 'operator_types',
                    fact_key: graph.fact_key, predicate_id: predicate.id }));
                throw failure;
            }
            typedPredicates.push({ id: predicate.id, op: predicate.op,
                obligation: predicate.obligation, atom: predicate.atom,
                operands: types.map((type, index) => ({ type: irType(type),
                    source: structuredClone(predicate.args[index]) })) });
            count++;
        }
        typedGraphs.push({ fact_key: graph.fact_key, claim_id: graph.claim_id, predicates: typedPredicates });
    }
    // Partial IR: no evaluator, proof result, snapshot values, or execution
    // authority. Full graph lowering and the execution gate remain mandatory.
    return freezeDeep({ stage: 'predicate_types_checked_only', graphs: graphs.length,
        predicates: count, unresolved: 0, typedGraphs });
}

function compilePredicateTypes(input) {
    return compilePredicateTypesInternal(input, null);
}

function compileQualificationPredicateTypes(input, transport, variant) {
    const qualification = require('./claimMonthPathProfile').assertClaimMonthPathTransport({
        graphs: input.graphs, claims: input.claims, transport, variant });
    return compilePredicateTypesInternal(input, qualification);
}

module.exports = { compilePredicateTypes, compileQualificationPredicateTypes, claimReferenceKind, readPredicateTypeDiagnostic };
```

## src/next/provenance/schemaRegistryProjection.js

SHA-256 282b949ff0c546b3b20ec7cbe6a3b00a3ab28ed19e8d951d5379f011b2ddd84d; Git blob c047bdde5ebd222f06b803fd9bce08f876c9ba77; bytes 8687.

```javascript
'use strict';

const { canonicalValue } = require('../kernel/canonicalValue');

const TYPES = Object.freeze(['id', 'text', 'date', 'month', 'datetime', 'integer',
    'positive_integer', 'nonnegative_integer', 'money_minor', 'boolean', 'enum',
    'digest', 'ref', 'ref_list', 'typed_period', 'typed_result', 'role_ref_list']);
const CLASSES = Object.freeze(['identity', 'dimension', 'edge', 'non_material']);
const ref = name => ({ $ref: `#/definitions/${name}` });
const fail = code => { throw new Error(`schema_registry_${code}`); };
function object(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('shape');
    return value;
}
function keys(value, required, optional = []) {
    object(value);
    if (required.some(key => !Object.hasOwn(value, key))
        || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) fail('keys');
}
function same(actual, expected, code) {
    let actualText;
    let expectedText;
    try { actualText = canonicalValue(actual); expectedText = canonicalValue(expected); }
    catch { fail(code); }
    if (actualText !== expectedText) fail(code);
}
function stringSet(value) {
    if (!Array.isArray(value) || !value.length || value.some(v => typeof v !== 'string' || !v.length)
        || new Set(value).size !== value.length) fail('set');
    return value;
}
function sameSet(actual, expected, code) {
    same([...stringSet(actual)].sort(), [...stringSet(expected)].sort(), code);
}
function closedRecord(properties) {
    return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}

// Shared descriptor grammar. Target membership remains a caller-owned check:
// full registry admission supplies the actual closed-world kinds below.
function validateMaterialFields(fields, isTargetKind) {
    object(fields); stringSet(Object.keys(fields));
    if (typeof isTargetKind !== 'function') fail('targets');
    let count = 0;
    for (const [name, field] of Object.entries(fields)) {
        if (!/^[a-z][a-z0-9_]*$/.test(name)) fail('field');
        keys(field, ['class', 'type', 'required'], ['values', 'targets', 'maximum', 'reason']);
        if (!CLASSES.includes(field.class) || !TYPES.includes(field.type)
            || typeof field.required !== 'boolean') fail('descriptor');
        if (field.class === 'edge') {
            if (!['ref', 'ref_list', 'role_ref_list'].includes(field.type)
                || stringSet(field.targets).some(target => !isTargetKind(target))) fail('targets');
        } else if (Object.hasOwn(field, 'targets') || ['ref', 'ref_list', 'role_ref_list'].includes(field.type)) fail('targets');
        if (field.type === 'enum') stringSet(field.values);
        else if (Object.hasOwn(field, 'values')) fail('enum');
        if (Object.hasOwn(field, 'maximum') && (field.type !== 'positive_integer'
            || !Number.isSafeInteger(field.maximum) || field.maximum < 1)) fail('maximum');
        if (field.class === 'non_material') {
            if (name !== 'label' || field.type !== 'text' || field.reason !== 'display_only') fail('non_material');
        } else if (Object.hasOwn(field, 'reason')) fail('reason');
        count++;
    }
    return count;
}

// A projection of the finite, reviewed registry grammar, not a JSON Schema
// interpreter or semantic-equivalence solver. Unexpected schema forms fail;
// even an equivalent rewrite needs review before changing this format.
function validateSchemaRegistryProjection({ registry, snapshotSchema, claimSchema }) {
    keys(registry, ['registry_id', 'registry_version', 'stage', 'closed_world', 'semantics',
        'field_classes', 'types', 'envelope_fields', 'kinds']);
    if (registry.registry_id !== 'material_field_registry' || registry.registry_version !== 1
        || registry.stage !== 'authoring' || registry.closed_world !== true
        || registry.semantics !== 'registry-semantics-v1.md') fail('version');
    sameSet(registry.types, TYPES, 'types');
    sameSet(registry.field_classes, CLASSES, 'classes');
    const envelope = { ref_id: { class: 'identity', type: 'id', required: true },
        kind: { class: 'identity', type: 'id', required: true },
        version: { class: 'identity', type: 'digest', required: true } };
    same(registry.envelope_fields, envelope, 'envelope');
    const kinds = object(registry.kinds);
    stringSet(Object.keys(kinds));
    let fields = 0;
    for (const [kind, entry] of Object.entries(kinds)) {
        if (!/^[a-z][a-z0-9_]*$/.test(kind)) fail('kind');
        keys(entry, ['origin', 'fields']);
        if (typeof entry.origin !== 'string' || !entry.origin.length) fail('origin');
        fields += validateMaterialFields(entry.fields, target => Object.hasOwn(kinds, target));
        same(entry.fields.id, envelope.ref_id, 'payload_identity');
    }

    keys(snapshotSchema, ['$schema', '$id', 'definitions', 'oneOf'], ['title', '$comment', 'description']);
    if (snapshotSchema.$schema !== 'http://json-schema.org/draft-07/schema#'
        || snapshotSchema.$id !== 'urn:financasbot:next:evidence-snapshot:2'
        || claimSchema?.$id !== 'urn:financasbot:next:claim-contract:2') fail('schema_identity');
    // These types have the claim schema as their existing shared authority.
    for (const name of ['id', 'date', 'month']) object(claimSchema.definitions?.[name]);
    object(claimSchema.definitions?.period);
    const definitions = {
        id: claimSchema.definitions.id,
        digest: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
        text: { type: 'string' },
        date: claimSchema.definitions.date,
        month: claimSchema.definitions.month,
        datetime: { type: 'string', format: 'date-time',
            pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$' },
        integer: { type: 'integer', minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER },
        positive_integer: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
        nonnegative_integer: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        money_minor: { type: 'integer', minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER },
        boolean: { type: 'boolean' },
        ref: ref('id'),
        ref_list: { type: 'array', uniqueItems: true, items: ref('ref') },
        typed_period: { $ref: `${claimSchema.$id}#/definitions/period` },
        typed_result: { oneOf: [
            ['BRL_minor', 'money_minor', ref('money_minor')],
            ['count', 'nonnegative_integer', ref('nonnegative_integer')],
            ['entity_ids', 'id', ref('ref')],
            ['entity_ids', 'id_set', ref('ref_list')],
            ['state', 'enum', { type: 'string', minLength: 1 }]
        ].map(([unit, kind, value]) => closedRecord({ unit: { const: unit }, kind: { const: kind }, value })) },
        role_ref_list: { type: 'array', uniqueItems: true, items: closedRecord({
            role_id: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,63}$' }, parent_ref: ref('ref') }) }
    };
    const branches = new Map();
    if (!Array.isArray(snapshotSchema.oneOf)) fail('branches');
    for (const branch of snapshotSchema.oneOf) {
        const kind = branch?.properties?.kind?.const;
        if (!Object.hasOwn(kinds, kind) || branches.has(kind)) fail('branches');
        branches.set(kind, branch);
    }
    sameSet([...branches.keys()], Object.keys(kinds), 'kinds');
    for (const [kind, entry] of Object.entries(kinds)) {
        const payload = closedRecord({});
        payload.required = [];
        for (const [name, field] of Object.entries(entry.fields)) {
            if (field.required) payload.required.push(name);
            let property = field.type === 'enum' ? { enum: [...field.values] } : ref(field.type);
            if (Object.hasOwn(field, 'maximum')) property = { allOf: [property, { maximum: field.maximum }] };
            payload.properties[name] = property;
        }
        definitions[`payload_${kind}`] = payload;
        same(branches.get(kind), closedRecord({ ref_id: ref('id'), kind: { const: kind },
            version: ref('digest'), payload: ref(`payload_${kind}`) }), 'branch');
    }
    sameSet(Object.keys(object(snapshotSchema.definitions)), Object.keys(definitions), 'definitions');
    for (const [name, definition] of Object.entries(definitions)) {
        same(snapshotSchema.definitions[name], definition, `projection:${name}`);
    }
    return Object.freeze({ kinds: branches.size, fields, stage: 'schema_registry_checked_only' });
}

module.exports = { validateSchemaRegistryProjection, validateMaterialFields };
```

## src/next/provenance/templateReferences.js

SHA-256 bd5c186192b41d991f8fc1bf74dce0f372d8ff8ac63a845eaa029640a7d3f34f; Git blob 554bb512d28974bdb53f3c5b02bb3631d1b36334; bytes 11620.

```javascript
'use strict';

const { digest } = require('../kernel/canonicalValue');
const { unifyOperatorTypes, readOperatorTypeDiagnostic } = require('./operatorTypes');
const { validateLiteral } = require('./literalTypes');
const { freezeDeep } = require('../kernel/canonicalValue');
const diagnostics = new WeakMap();
const fail = code => {
    const error = new Error(`template_reference_${code}`);
    diagnostics.set(error, freezeDeep({ checker: 'template_references', code }));
    throw error;
};
const readTemplateReferenceDiagnostic = error => diagnostics.get(error) ?? null;
// Internal attribution preserves the first native origin; external errors and
// their text never acquire authority. This wrapper does not alter rejection.
function atBinding(coordinate, resolve) {
    try { return resolve(); } catch (error) {
        const signatureFailure = readOperatorTypeDiagnostic(error);
        const diagnostic = diagnostics.get(error) ?? (signatureFailure
            ? { checker: 'template_references', code: 'operator_types', cause: signatureFailure }
            : null);
        if (diagnostic && !Object.hasOwn(diagnostic, 'predicate_id'))
            diagnostics.set(error, freezeDeep({ ...diagnostic, ...coordinate }));
        throw error;
    }
}
const own = (value, key) => value !== null && typeof value === 'object' && Object.hasOwn(value, key);
function closed(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).length !== keys.length || keys.some(key => !own(value, key))) fail('shape');
}
function identity(id, version) {
    if (typeof id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(id)
        || !Number.isSafeInteger(version) || version < 1) fail('identity');
    return JSON.stringify([id, version]);
}

/** References and bound template signatures only, not graph-wide typed IR. */
function validateTemplateReferences({ graphs, templates, operators, materialRegistry, claims }) {
    closed(templates, ['schema_version', 'registry_id', 'registry_version', 'stage', 'templates']);
    if (templates.schema_version !== 1 || templates.registry_version !== 1
        || templates.registry_id !== 'predicate_templates' || templates.stage !== 'authoring'
        || !Array.isArray(templates.templates)) fail('registry');
    const operatorMap = new Map();
    for (const op of operators) {
        if (operatorMap.has(op.id)) fail('operator_duplicate');
        operatorMap.set(op.id, op);
    }
    const parameterSignatures = new Set(operators.flatMap(op => op.args));
    for (const signature of ['field_selector:K:date', 'field_selector:K:enum', 'boolean', 'enum', 'date', 'text']) {
        parameterSignatures.add(signature);
    }
    const entries = new Map();
    for (const template of templates.templates) {
        closed(template, ['id', 'version', 'parameters', 'body']);
        const key = identity(template.id, template.version);
        if (entries.has(key)) fail('duplicate');
        if (!template.parameters || typeof template.parameters !== 'object' || Array.isArray(template.parameters)) fail('parameters');
        if (!Array.isArray(template.body) || !template.body.length) fail('body');
        const parameters = Object.keys(template.parameters);
        for (const name of parameters) {
            if (!/^[a-z][a-z0-9_]*$/.test(name)) fail('parameter');
            if (!parameterSignatures.has(template.parameters[name])) fail('signature');
        }
        const used = new Set();
        for (const predicate of template.body) {
            closed(predicate, ['op', 'args']);
            const operator = operatorMap.get(predicate.op);
            if (!operator || !Array.isArray(predicate.args) || predicate.args.length !== operator.args.length) fail('operator');
            for (const arg of predicate.args) {
                if (!arg || typeof arg !== 'object' || Array.isArray(arg) || Object.keys(arg).length !== 1) fail('argument');
                const kind = Object.keys(arg)[0];
                if (!['parameter', 'current_member_field_parameter'].includes(kind)) fail('argument');
                const name = arg[kind];
                if (!own(template.parameters, name)) fail('parameter');
                if (kind === 'current_member_field_parameter' && !template.parameters[name].startsWith('field_selector:')) fail('member_selector');
                used.add(name);
            }
        }
        if (used.size !== parameters.length) fail('unused_parameter');
        entries.set(key, { template, hash: `sha256:${digest(template)}` });
    }
    let references = 0;
    const claimMap = new Map((claims || []).map(claim => [claim.fact_key, claim]));
    function fieldType(kind, segments) {
        if (!Array.isArray(segments) || segments.length !== 1) fail('binding_path');
        const descriptor = materialRegistry?.kinds?.[kind]?.fields?.[segments[0]];
        if (!descriptor || descriptor.class === 'non_material') fail('binding_field');
        const value = { form: 'scalar', type: descriptor.type };
        if (descriptor.type === 'id') value.kind = kind;
        if (descriptor.type === 'ref') {
            if (descriptor.targets.length !== 1) fail('binding_nominal_unresolved');
            value.type = 'id';
            value.kind = descriptor.targets[0];
        }
        if (descriptor.type === 'money_minor') value.unit = 'BRL_minor';
        if (descriptor.type === 'enum') {
            value.domain = JSON.stringify([...descriptor.values].sort());
            value.values = descriptor.values;
        }
        return value;
    }
    function scalarBinding(arg, graph, claim) {
        if (arg.field) {
            const node = graph.nodes[arg.field.node];
            if (!node) fail('binding_node');
            return fieldType(node.kind, arg.field.segments);
        }
        if (arg.literal) return { form: 'scalar', type: validateLiteral(arg.literal) };
        if (arg.claim && claim) {
            const path = arg.claim.segments.join('.');
            if (path === 'period.start' || path === 'period.end') {
                if (claim.period.kind !== 'range') fail('binding_period');
                return { form: 'scalar', type: 'date' };
            }
            if (path === 'period.value') {
                const kinds = { date: 'date', as_of: 'date', through: 'date', statement_due: 'date',
                    month: 'month', statement_competence: 'month', budget_cycle: 'month' };
                if (!own(kinds, claim.period.kind)) fail('binding_period');
                return { form: 'scalar', type: kinds[claim.period.kind] };
            }
        }
        fail('binding_unresolved');
    }
    function binding(arg, graph, claim) {
        if (arg.selector) return { form: 'field_selector', kind: arg.selector.kind,
            value: fieldType(arg.selector.kind, arg.selector.segments) };
        if (arg.period_ref) {
            const window = graph.windows?.[arg.period_ref];
            if (!window) fail('binding_period');
            if (window.kind === 'range') {
                if (scalarBinding(window.start, graph, claim).type !== 'date'
                    || scalarBinding(window.end, graph, claim).type !== 'date') fail('binding_period_type');
                return { form: 'range', periodKind: 'range' };
            }
            if (window.kind !== 'month' || scalarBinding(window.value, graph, claim).type !== 'month') fail('binding_period_type');
            return { form: 'period', periodKind: 'month' };
        }
        if (arg.period_literal) return { form: arg.period_literal.kind === 'range' ? 'range' : 'period', periodKind: arg.period_literal.kind };
        if (arg.claim?.segments.length === 1 && arg.claim.segments[0] === 'period') {
            if (!claim) fail('binding_claim');
            return { form: claim.period.kind === 'range' ? 'range' : 'period', periodKind: claim.period.kind };
        }
        return scalarBinding(arg, graph, claim);
    }
    for (const graph of graphs) for (const predicate of graph.predicates) for (const [operand_index, arg] of predicate.args.entries()) {
        if (!own(arg, 'template')) continue;
        // Preserve the native first origin also for template identity/hash,
        // before named-binding resolution starts. Acceptance is unchanged.
        atBinding({ fact_key: graph.fact_key, predicate_id: predicate.id, operand_index }, () => {
        closed(arg, ['template', 'bindings']);
        closed(arg.template, ['id', 'version', 'hash']);
        const entry = entries.get(identity(arg.template.id, arg.template.version));
        if (!entry) fail('missing');
        if (entry.hash !== arg.template.hash) fail('hash');
        const names = Object.keys(entry.template.parameters);
        if (!arg.bindings || typeof arg.bindings !== 'object' || Array.isArray(arg.bindings)
            || Object.keys(arg.bindings).length !== names.length || names.some(name => !own(arg.bindings, name))) fail('bindings');
        const types = new Map(names.map(name => [name, atBinding({ fact_key: graph.fact_key,
            predicate_id: predicate.id, operand_index, binding_name: name },
        () => binding(arg.bindings[name], graph, claimMap.get(graph.fact_key)))]));
        // Literals carry syntax types; their nominal domain comes from a typed
        // parameter, never from matching a string to a snapshot identifier.
        const typedT = names.filter(name => entry.template.parameters[name].startsWith('field_selector:'))
            .map(name => types.get(name).value);
        for (const name of names) {
            const literal = arg.bindings[name].literal;
            if (!literal) continue;
            const peers = typedT.filter(type => type.type === literal.type);
            if (peers.length === 1 && ['id', 'enum', 'money_minor'].includes(literal.type)) {
                if (peers[0].values && !peers[0].values.includes(literal.value)) fail('binding_enum');
                types.set(name, peers[0]);
            }
        }
        unifyOperatorTypes({ args: names.map(name => entry.template.parameters[name]) }, names.map(name => types.get(name)));
        for (const part of entry.template.body) {
            const operator = operatorMap.get(part.op);
            const bodyTypes = part.args.map((value, index) => {
                let type;
                if (own(value, 'current_member_field_parameter')) type = types.get(value.current_member_field_parameter).value;
                else type = types.get(value.parameter);
                if (operator.args[index] === 'state_path' || operator.args[index] === 'field_path:T') return { form: 'field', value: type };
                if (operator.args[index] === 'state_literal') {
                    if (type.form !== 'scalar' || type.type !== 'enum') fail('binding_state');
                    return { form: 'state_literal' };
                }
                return type;
            });
            unifyOperatorTypes(operator, bodyTypes);
        }
        const memberKinds = names.filter(name => types.get(name).form === 'field_selector').map(name => types.get(name).kind);
        for (const operand of predicate.args) if (operand.set) {
            for (const alias of graph.sets[operand.set]) {
                if (memberKinds.some(kind => graph.nodes[alias]?.kind !== kind)) fail('binding_member_kind');
            }
        }
        references++;
        });
    }
    return Object.freeze({ stage: 'template_references_checked_only', templates: entries.size, references });
}

module.exports = { validateTemplateReferences, readTemplateReferenceDiagnostic };
```
