'use strict';
// HARNESS inventory, not a guest evaluator or an acceptance authority.
// Targets are derived from compiled IR and admitted normative documents. A
// target is not a realized mutation; collateral violations must still be
// measured before an exact expected_violations set can be assigned.
const { createHash } = require('node:crypto');
const { types } = require('node:util');
const { canonicalValue, digest, freezeDeep } = require('../kernel/canonicalValue');
const { copyData, identifier, field, decodeObservation, decodeMeasurement } = require('./observationContract');
const fail = code => { throw new Error(`mutation_inventory_${code}`); };
const unknownOperatorContexts = new WeakMap();
const unknownPathContexts = new WeakMap();
const plain = value => JSON.parse(JSON.stringify(copyData(value)));
function own(raw, names) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== names.length || names.some(name => !d[name]?.enumerable || !Object.hasOwn(d[name], 'value'))) fail('input');
    return Object.fromEntries(names.map(name => [name, d[name].value]));
}
function enumeration(values) {
    if (!Array.isArray(values) || !values.length || values.some(value => typeof value !== 'string' || !/^[a-z][a-z0-9_]*$/.test(value))
        || new Set(values).size !== values.length) fail('schema_enum');
    return new Set(values);
}
function schemaField(raw, path) {
    let value = raw;
    for (const field of path) {
        if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value)
            || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('schema_projection');
        const descriptor = Object.getOwnPropertyDescriptor(value, field);
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail('schema_projection');
        value = descriptor.value;
    }
    return value;
}
function enumerateMutationRequirements(raw) {
    const input = own(raw, ['packageReceipt', 'ir', 'graphSchema', 'materialRegistry', 'operatorRegistry', 'evaluatorRegistry', 'witnessContracts']);
    const { admittedDocuments } = require('./packageContract');
    const admitted = admittedDocuments(input.packageReceipt);
    const documents = new Map(admitted.map(row => [row.path, row.value]));
    const corpus = documents.get('docs/contracts/next/provenance-v2/graphs-v2.json');
    if (!corpus) fail('authority_missing');
    const ir = own(input.ir, ['format', 'version', 'stage', 'executable', 'authority_refs', 'order', 'graphs']);
    if (ir.format !== 'financasbot.provenance.authoring-ir' || ir.version !== 1
        || ir.stage !== 'typed_authoring_ir_only' || ir.executable !== false) fail('ir');
    const order = plain(ir.order);
    // Copy separately to preserve the per-graph input limits; do not expand the
    // generic copier's quota to accommodate an entire corpus in one operation.
    if (types.isProxy(ir.graphs) || !Array.isArray(ir.graphs) || Object.getPrototypeOf(ir.graphs) !== Array.prototype) fail('ir');
    const descriptors = Object.getOwnPropertyDescriptors(ir.graphs);
    if (!order.length || order.length > 256 || new Set(order).size !== order.length
        || ir.graphs.length !== order.length || Reflect.ownKeys(descriptors).length !== order.length + 1) fail('ir_inventory');
    const graphs = order.map((key, i) => {
        if (!descriptors[i]?.enumerable || !Object.hasOwn(descriptors[i], 'value')) fail('input');
        const graph = plain(descriptors[i].value); if (graph.fact_key !== key) fail('ir_order'); return graph;
    });
    const material = plain(input.materialRegistry);
    if (canonicalValue(plain(ir.authority_refs)) !== canonicalValue(admitted.map(({ path, sha256 }) => ({ path, sha256 })))) fail('authority_identity');
    if (canonicalValue(material) !== canonicalValue(documents.get(corpus.material_registry.path))) fail('registry_identity');
    // Domain resolution uses the exact admitted projection, not examples from
    // snapshots or a second field allowlist. Projection admission fails closed
    // for unknown grammar, missing domains and registry/schema disagreement.
    const { validateSchemaRegistryProjection } = require('./schemaRegistryProjection');
    validateSchemaRegistryProjection({ registry: material,
        snapshotSchema: documents.get('docs/contracts/next/provenance-v2/evidence-snapshot.schema.json'),
        claimSchema: documents.get('docs/contracts/next/provenance-v2/claim-contract.schema.json') });
    const operators = plain(input.operatorRegistry); const evaluators = plain(input.evaluatorRegistry); const witnesses = plain(input.witnessContracts);
    // JSON Schema keywords are not observation-field identifiers. Project the
    // exact relevant descriptors; do not weaken copyData or copy an arbitrary
    // schema through a transport boundary intended for observed data.
    const atoms = enumeration(plain(schemaField(input.graphSchema, ['definitions', 'predicate', 'properties', 'atom', 'enum'])));
    const obligations = enumeration(plain(schemaField(input.graphSchema, ['definitions', 'gateBinding', 'properties', 'obligation', 'enum'])));
    const phaseProperties = schemaField(input.graphSchema, ['definitions', 'phase', 'properties']);
    if (!phaseProperties || typeof phaseProperties !== 'object' || Array.isArray(phaseProperties) || types.isProxy(phaseProperties)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(phaseProperties))) fail('schema_projection');
    const phaseFields = Object.fromEntries(Object.keys(Object.getOwnPropertyDescriptors(phaseProperties)).map(field => {
        const property = schemaField(phaseProperties, [field]);
        if (!property || typeof property !== 'object' || Array.isArray(property) || types.isProxy(property)
            || ![Object.prototype, null].includes(Object.getPrototypeOf(property))) fail('schema_projection');
        const type = Object.getOwnPropertyDescriptor(property, 'type');
        if (type && (!type.enumerable || !Object.hasOwn(type, 'value'))) fail('schema_projection');
        return [field, { type: type ? plain(type.value) : null }];
    }));
    if (!phaseFields || !Array.isArray(operators.operators) || !Array.isArray(evaluators.entries) || !Array.isArray(witnesses.witnesses)) fail('registries');
    const operatorIds = new Set(operators.operators.map(row => row.id));
    if (operatorIds.size !== operators.operators.length) fail('operator_duplicate');
    const evaluatorMap = new Map(evaluators.entries.map(row => [JSON.stringify([row.evaluator_id, row.evaluator_version]), row]));
    if (evaluatorMap.size !== evaluators.entries.length) fail('evaluator_duplicate');
    const requirements = new Map();
    function add(family, target) {
        const preimage = canonicalValue({ domain: 'financasbot.mutation-requirement.v1', family, target });
        const mutation_id = `sha256:${createHash('sha256').update(preimage).digest('hex')}`;
        if (requirements.has(mutation_id)) fail('target_duplicate');
        requirements.set(mutation_id, { mutation_id, family, target, realization: family === 'singleton_domain_invariant'
            ? 'UNSATISFIED_DOMAIN_INVARIANT' : 'UNSATISFIED_MUTATION_WITNESS' });
    }
    for (const graph of graphs) {
        if (!evaluatorMap.has(JSON.stringify([graph.evaluator_ref.evaluator_id, graph.evaluator_ref.evaluator_version]))) fail('evaluator_missing');
        const seen = new Set();
        for (const binding of graph.obligations) {
            if (!obligations.has(binding.obligation) || seen.has(binding.obligation)) fail('obligation'); seen.add(binding.obligation);
            for (const check of binding.checks) add('obligation_check', { fact_key: graph.fact_key, obligation: binding.obligation, check });
        }
        if (seen.size !== obligations.size) fail('obligation_missing');
        const predicates = new Set();
        for (const predicate of graph.predicates) {
            if (predicates.has(predicate.id) || !atoms.has(predicate.atom) || !obligations.has(predicate.obligation)
                || !operatorIds.has(predicate.op)) fail('predicate'); predicates.add(predicate.id);
            add('predicate_atom', { fact_key: graph.fact_key, predicate_id: predicate.id,
                obligation: predicate.obligation, atom: predicate.atom, operator: predicate.op });
            // Keep structural/loader/path strategies separate from a repaired
            // semantic-content witness. One green coordinate cannot cover
            // removal or substitution variants that have never executed.
            for (const strategy of ['remove', 'invert_or_retarget', 'compatible_wrong_operator', 'unknown_operator']) {
                add('predicate_strategy', { fact_key: graph.fact_key, predicate_id: predicate.id,
                    obligation: predicate.obligation, atom: predicate.atom, operator: predicate.op, strategy });
            }
            if (!Array.isArray(predicate.operands)) fail('predicate_operands');
            for (let operand_index = 0; operand_index < predicate.operands.length; operand_index++) {
                for (const strategy of ['same_type_wrong_path', 'unknown_path']) add('predicate_path_strategy', {
                    fact_key: graph.fact_key, predicate_id: predicate.id, operand_index, strategy });
            }
        }
        add('claim_identity', { fact_key: graph.fact_key, claim_id: graph.claim_id });
        add('global_fact_key_uniqueness', { fact_key: graph.fact_key });
        for (const [alias, node] of Object.entries(graph.nodes)) {
            const fields = material.kinds?.[node.kind]?.fields; if (!fields) fail('node_kind');
            add('node_identity', { fact_key: graph.fact_key, alias, binding: node.binding, kind: node.kind });
            for (const strategy of ['version', 'remove', 'duplicate', 'add']) add('node_strategy', {
                fact_key: graph.fact_key, alias, binding: node.binding, kind: node.kind, strategy });
            if (node.binding === 'snapshot') add('expected_fingerprint', {
                fact_key: graph.fact_key, alias, expected: node.semantic_fingerprint });
            for (const [field, descriptor] of Object.entries(fields)) {
                if (descriptor.class === 'non_material') continue;
                const singleton = descriptor.type === 'enum' && descriptor.values.length === 1
                    || descriptor.type === 'positive_integer' && descriptor.maximum === 1;
                add(singleton ? 'singleton_domain_invariant' : 'material_field', {
                    fact_key: graph.fact_key, alias, field, descriptor });
            }
        }
        for (const edge of graph.edges) {
            add('material_edge', { fact_key: graph.fact_key, edge });
            for (const strategy of ['remove', 'break_one_end', 'same_value_new_identity']) add('edge_strategy', {
                fact_key: graph.fact_key, edge, strategy });
        }
        for (const selection of graph.selections) {
            add('selection', { fact_key: graph.fact_key, candidate_set: selection.candidate_set, selected_set: selection.selected_set });
            if (Object.hasOwn(selection, 'input_evidence_state')) add('input_evidence_state_presence', {
                fact_key: graph.fact_key, candidate_set: selection.candidate_set, expected: selection.input_evidence_state });
        }
        for (const phase of ['derivation', 'proof']) {
            for (const [field, values] of Object.entries(graph.expected_trace[phase])) {
                if (!Object.hasOwn(phaseFields, field)) fail('trace_field');
                if (phaseFields[field].type === 'array') {
                    if (!Array.isArray(values)) fail('trace_field');
                    for (const value of values) {
                        add('phase_trace_requirement', { fact_key: graph.fact_key, phase, field, value });
                        if (['required_reads', 'required_edges'].includes(field)) {
                            for (const strategy of ['extra_read', 'same_type_wrong_path', 'selected_set_same_total', 'evaluator_id', 'evaluator_version']) {
                                add('trace_strategy', { fact_key: graph.fact_key, phase, field, value, strategy });
                            }
                        }
                    }
                }
            }
        }
    }
    const witnessIds = new Set(); const expectedWitnessIds = new Set(evaluators.entries.flatMap(row => row.witness_contract_ids));
    for (const witness of witnesses.witnesses) {
        if (witnessIds.has(witness.id) || !expectedWitnessIds.has(witness.id)
            || witness.execution_status !== 'not_executed'
            || !evaluators.entries.some(row => row.evaluator_id === witness.evaluator_id && row.witness_contract_ids.includes(witness.id))) fail('witness');
        witnessIds.add(witness.id); add('evaluator_discriminant', { witness_contract_id: witness.id, evaluator_id: witness.evaluator_id });
    }
    if (witnessIds.size !== expectedWitnessIds.size) fail('witness_missing');
    const rows = [...requirements.values()].sort((a, b) => a.mutation_id < b.mutation_id ? -1 : 1);
    return freezeDeep({ stage: 'unrealized_mutation_requirements_only', mutation_acceptance: false,
        graph_count: graphs.length, requirements: rows, unrealized_count: rows.length,
        domain_partition: {
            material_coordinates: rows.filter(row => ['material_field', 'singleton_domain_invariant'].includes(row.family)).length,
            semantic_material_fields: rows.filter(row => row.family === 'material_field').length,
            singleton_domain_invariants: rows.filter(row => row.family === 'singleton_domain_invariant').length
        } });
}
// HARNESS-only materialization. The receipt proves input identity, not that
// this mutation is isolated or accepted. The caller must execute both cases
// and compare every other atom before giving the inventory any G11 credit.
function materializeSingletonDomainCandidate(raw) {
    const input = own(raw, ['packageReceipt', 'fact_key', 'alias', 'field']);
    if (typeof input.fact_key !== 'string' || !identifier(input.alias) || !field(input.field)) fail('singleton_target');
    const { admittedDocuments } = require('./packageContract');
    const documents = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = documents.get('docs/contracts/next/provenance-v2/graphs-v2.json');
    const matches = corpus?.graphs?.filter(row => row.fact_key === input.fact_key);
    if (matches?.length !== 1) fail('singleton_target');
    if (!Object.hasOwn(matches[0].nodes, input.alias)) fail('singleton_target');
    const node = matches[0].nodes[input.alias];
    if (node?.binding !== 'snapshot') fail('singleton_binding');
    const material = documents.get(corpus.material_registry.path);
    const { validateSchemaRegistryProjection } = require('./schemaRegistryProjection');
    validateSchemaRegistryProjection({ registry: material,
        snapshotSchema: documents.get('docs/contracts/next/provenance-v2/evidence-snapshot.schema.json'),
        claimSchema: documents.get('docs/contracts/next/provenance-v2/claim-contract.schema.json') });
    const descriptor = material.kinds[node.kind]?.fields[input.field];
    const domain = descriptor?.type === 'enum' && descriptor.values.length === 1 ? descriptor.values
        : descriptor?.type === 'positive_integer' && descriptor.maximum === 1 ? [1] : null;
    if (!domain || descriptor.class === 'non_material') fail('singleton_domain');
    const manifest = documents.get(corpus.snapshot_manifest.path);
    const snapshots = manifest?.snapshots?.filter(row => row.kind === node.kind
        && row.ref_id === node.ref_id && row.version === node.version);
    if (snapshots?.length !== 1) fail('singleton_snapshot');
    const snapshot = snapshots[0];
    if (!Object.hasOwn(snapshot.payload, input.field) || snapshot.payload[input.field] !== domain[0]) fail('singleton_baseline');
    const baseline = structuredClone({ ref_id: snapshot.ref_id, kind: snapshot.kind,
        version: snapshot.version, payload: snapshot.payload });
    const candidate = structuredClone(baseline);
    candidate.payload[input.field] = typeof domain[0] === 'string' ? `${domain[0]}_outside_domain` : 2;
    const target = { fact_key: input.fact_key, alias: input.alias, field: input.field, descriptor };
    const mutation_id = `sha256:${createHash('sha256').update(canonicalValue({
        domain: 'financasbot.mutation-requirement.v1', family: 'singleton_domain_invariant', target })).digest('hex')}`;
    // This only materializes a schema-invalid admission candidate. The caller
    // must run the real schema validator on both envelopes. No D/P execution,
    // semantic expected_violations, qualification or financial receipt exists.
    return freezeDeep({ stage: 'generated_domain_admission_candidate_only', mutation_acceptance: false,
        semantic_witness: false, dp_execution: false, mutation_id, target, domain: [...domain], baseline, candidate });
}
function materializeSignedRelationMutation(raw) {
    const input = own(raw, ['packageReceipt', 'fact_key', 'predicate_id', 'operand_index']);
    const { admittedDocuments } = require('./packageContract');
    const documents = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const graphPath = 'docs/contracts/next/provenance-v2/graphs-v2.json';
    const corpus = structuredClone(documents.get(graphPath));
    const graph = corpus?.graphs?.find(row => row.fact_key === input.fact_key);
    const predicate = graph?.predicates.find(row => row.id === input.predicate_id);
    if (!graph || !['opposite_sign', 'abs_eq'].includes(predicate?.op) || ![0, 1].includes(input.operand_index)
        || predicate.args.length !== 2 || predicate.args.some(arg => !arg.field || arg.field.segments.length !== 1)) fail('sign_target');
    const manifest = structuredClone(documents.get(corpus.snapshot_manifest.path));
    const material = documents.get(corpus.material_registry.path);
    const resolve = arg => {
        const node = graph.nodes[arg.field.node];
        if (node?.binding !== 'snapshot') fail('sign_binding');
        const matches = manifest.snapshots.filter(row => row.kind === node.kind && row.ref_id === node.ref_id && row.version === node.version);
        const field = arg.field.segments[0];
        if (matches.length !== 1 || material.kinds[node.kind]?.fields[field]?.type !== 'money_minor') fail('sign_field');
        const before = matches[0].payload[field];
        if (!Number.isSafeInteger(before) || before === 0) fail('sign_operand');
        return { node, snapshot: matches[0], alias: arg.field.node, field, before };
    };
    const values = predicate.args.map(resolve);
    if (predicate.op === 'opposite_sign' ? Math.sign(values[0].before) === Math.sign(values[1].before)
        : Math.abs(values[0].before) !== Math.abs(values[1].before)) fail('sign_baseline');
    const selected = values[input.operand_index];
    let after = predicate.op === 'opposite_sign' ? -selected.before : selected.before + Math.sign(selected.before);
    if (!Number.isSafeInteger(after)) after = selected.before - Math.sign(selected.before);
    if (!Number.isSafeInteger(after) || after === 0 || (predicate.op === 'abs_eq'
        && Math.sign(after) !== Math.sign(selected.before))) fail('sign_alternative');
    return repairedSnapshotFieldMutation({ documents, corpus, graph, predicate, manifest, material, selected, after });
}
function repairedSnapshotFieldMutation({ documents, corpus, graph, predicate, manifest, material, selected, after }) {
    const graphPath = 'docs/contracts/next/provenance-v2/graphs-v2.json';
    const sources = manifest.sources.filter(row => row.sha256 === selected.node.version);
    const authorship = selected.snapshot.authorship;
    if (sources.length !== 1 || authorship?.source !== 'fixture' || authorship.mapping !== 'identity_payload'
        || authorship.record_id !== selected.node.ref_id) fail('semantic_source');
    const source = structuredClone(documents.get(sources[0].path));
    const records = source?.[authorship.collection];
    if (!Array.isArray(records)) fail('semantic_source');
    const matches = records.filter(row => row.id === selected.node.ref_id);
    if (matches.length !== 1 || matches[0][selected.field] !== selected.before) fail('semantic_source');
    matches[0][selected.field] = after;
    const changes = [];
    const write = (path, value) => {
        const source = JSON.stringify(value);
        const sha256 = `sha256:${createHash('sha256').update(source).digest('hex')}`;
        changes.push(Object.freeze({ path, source, sha256 }));
        return sha256;
    };
    const oldVersion = sources[0].sha256;
    const version = write(sources[0].path, source);
    sources[0].sha256 = version;
    const snapshots = new Map();
    for (const snapshot of manifest.snapshots) {
        if (snapshot.version === oldVersion) snapshot.version = version;
        if (snapshot === selected.snapshot) snapshot.payload[selected.field] = after;
        const fields = material.kinds[snapshot.kind].fields;
        const payload = Object.fromEntries(Object.entries(snapshot.payload).filter(([name]) => fields[name].class !== 'non_material'));
        snapshot.semantic_fingerprint = `sha256:${digest({ registry_version: material.registry_version,
            kind: snapshot.kind, ref_id: snapshot.ref_id, version: snapshot.version, payload })}`;
        const key = JSON.stringify([snapshot.kind, snapshot.ref_id, snapshot.version]);
        if (snapshots.has(key)) fail('semantic_snapshot_duplicate');
        snapshots.set(key, snapshot);
    }
    for (const current of corpus.graphs) {
        for (const node of Object.values(current.nodes)) {
            if (node.binding !== 'snapshot') continue;
            if (node.version === oldVersion) node.version = version;
            const snapshot = snapshots.get(JSON.stringify([node.kind, node.ref_id, node.version]));
            if (!snapshot) fail('semantic_snapshot_missing');
            node.semantic_fingerprint = snapshot.semantic_fingerprint;
        }
        for (const p of current.predicates.filter(row => row.op === 'fingerprint_is')) {
            p.args[1].literal.value = current.nodes[p.args[0].node].semantic_fingerprint;
        }
    }
    corpus.snapshot_manifest.hash = write(corpus.snapshot_manifest.path, manifest);
    write(graphPath, corpus);
    const target = { fact_key: graph.fact_key, predicate_id: predicate.id,
        obligation: predicate.obligation, atom: predicate.atom, operator: predicate.op };
    const mutation_id = `sha256:${createHash('sha256').update(canonicalValue({
        domain: 'financasbot.mutation-requirement.v1', family: 'predicate_atom', target })).digest('hex')}`;
    return freezeDeep({ stage: 'generated_semantic_mutation_only', mutation_acceptance: false,
        mutation_id, target, expected_violations: [predicate.atom],
        patch: { alias: selected.alias, field: selected.field, before: selected.before, after }, changes });
}
function materializeMonthRelationMutation(raw) {
    const input = own(raw, ['packageReceipt', 'fact_key', 'predicate_id']);
    const { admittedDocuments } = require('./packageContract');
    const documents = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = structuredClone(documents.get('docs/contracts/next/provenance-v2/graphs-v2.json'));
    const graph = corpus?.graphs?.find(row => row.fact_key === input.fact_key);
    const predicate = graph?.predicates.find(row => row.id === input.predicate_id);
    const operand = predicate?.args?.[0]?.field;
    if (!['month_bounds_match', 'eq'].includes(predicate?.op) || predicate.atom !== 'period'
        || !Array.isArray(operand?.segments) || operand.segments.length !== 1
        || !Object.hasOwn(graph.nodes, operand.node)) fail('month_target');
    const node = graph.nodes[operand.node];
    if (node.binding !== 'snapshot') fail('month_binding');
    const manifest = structuredClone(documents.get(corpus.snapshot_manifest.path));
    const material = documents.get(corpus.material_registry.path);
    const field = operand.segments[0];
    if (material.kinds[node.kind]?.fields[field]?.type !== 'month') fail('month_field');
    const matches = manifest.snapshots.filter(row => row.kind === node.kind && row.ref_id === node.ref_id && row.version === node.version);
    if (matches.length !== 1) fail('month_snapshot');
    const before = matches[0].payload[field];
    if (typeof before !== 'string' || !/^(?!0000)[0-9]{4}-(0[1-9]|1[0-2])$/.test(before)) fail('month_operand');
    const month = Number(before.slice(5));
    const after = `${before.slice(0, 5)}${String(month === 12 ? 11 : month + 1).padStart(2, '0')}`;
    return repairedSnapshotFieldMutation({ documents, corpus, graph, predicate, manifest, material,
        selected: { node, snapshot: matches[0], alias: operand.node, field, before }, after });
}
function materializeEnumEqualityMutation(raw) {
    const input = own(raw, ['packageReceipt', 'fact_key', 'predicate_id']);
    return enumEqualityMutation(input, 0);
}
function materializeEnumEqualityMutationVariant(raw) {
    const input = own(raw, ['packageReceipt', 'fact_key', 'predicate_id', 'variant_index']);
    if (!Number.isSafeInteger(input.variant_index) || input.variant_index < 0) fail('enum_variant');
    return enumEqualityMutation(input, input.variant_index);
}
function enumEqualityMutation(input, variantIndex) {
    const { admittedDocuments } = require('./packageContract');
    const documents = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = structuredClone(documents.get('docs/contracts/next/provenance-v2/graphs-v2.json'));
    const graph = corpus?.graphs?.find(row => row.fact_key === input.fact_key);
    const predicate = graph?.predicates.find(row => row.id === input.predicate_id);
    const operand = predicate?.args?.[0]?.field;
    if (predicate?.op !== 'eq' || predicate.args.length !== 2
        || !Array.isArray(operand?.segments) || operand.segments.length !== 1
        || !Object.hasOwn(graph.nodes, operand.node)) fail('enum_target');
    const node = graph.nodes[operand.node];
    if (node.binding !== 'snapshot') fail('enum_binding');
    const manifest = structuredClone(documents.get(corpus.snapshot_manifest.path));
    const material = documents.get(corpus.material_registry.path);
    const field = operand.segments[0];
    const descriptor = material.kinds[node.kind]?.fields[field];
    if (descriptor?.type !== 'enum' || descriptor.class === 'non_material') fail('enum_field');
    if (predicate.args[1]?.literal?.type !== 'enum') fail('enum_target');
    const domain = enumeration(descriptor.values);
    const matches = manifest.snapshots.filter(row => row.kind === node.kind && row.ref_id === node.ref_id && row.version === node.version);
    if (matches.length !== 1) fail('enum_snapshot');
    const before = matches[0].payload[field];
    if (!domain.has(before) || before !== predicate.args[1].literal.value) fail('enum_baseline');
    const alternatives = [...domain].filter(value => value !== before);
    const after = alternatives[variantIndex % alternatives.length];
    if (after === undefined) fail('enum_alternative');
    return repairedSnapshotFieldMutation({ documents, corpus, graph, predicate, manifest, material,
        selected: { node, snapshot: matches[0], alias: operand.node, field, before }, after });
}
// A predicate strategy, never a semantic-content predicate_atom witness.
// The admitted registry supplies the equal/unequal signatures; no snapshot,
// fingerprint, predicate arguments, selection or trace is repaired.
function materializeScalarEqualityStrategy(raw) {
    const input = own(raw, ['packageReceipt', 'fact_key', 'predicate_id']);
    const { admittedDocuments } = require('./packageContract');
    const documents = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const path = 'docs/contracts/next/provenance-v2/graphs-v2.json';
    const corpus = structuredClone(documents.get(path));
    const graph = corpus?.graphs?.find(row => row.fact_key === input.fact_key);
    const predicate = graph?.predicates.find(row => row.id === input.predicate_id);
    if (predicate?.op !== 'eq') fail('scalar_strategy_target');
    const operators = documents.get(corpus.operator_registry.path)?.operators;
    const equal = operators?.filter(row => row.id === 'eq');
    const unequal = operators?.filter(row => row.id === 'not_eq');
    if (equal?.length !== 1 || unequal?.length !== 1
        || equal[0].semantics !== 'typed_equal' || unequal[0].semantics !== 'typed_unequal'
        || canonicalValue(equal[0].args) !== canonicalValue(unequal[0].args)
        || canonicalValue(equal[0].args) !== canonicalValue(['scalar:T', 'scalar:T'])
        || predicate.args.length !== equal[0].args.length) fail('scalar_strategy_registry');
    const target = { fact_key: graph.fact_key, predicate_id: predicate.id,
        obligation: predicate.obligation, atom: predicate.atom, operator: predicate.op,
        strategy: 'compatible_wrong_operator' };
    const mutation_id = `sha256:${createHash('sha256').update(canonicalValue({
        domain: 'financasbot.mutation-requirement.v1', family: 'predicate_strategy', target })).digest('hex')}`;
    predicate.op = 'not_eq';
    const source = JSON.stringify(corpus);
    const sha256 = `sha256:${createHash('sha256').update(source).digest('hex')}`;
    return freezeDeep({ stage: 'generated_predicate_strategy_only', mutation_acceptance: false,
        mutation_id, target, expected_violations: [target.atom],
        patch: { before: 'eq', after: 'not_eq' }, changes: [{ path, source, sha256 }] });
}
function materializeUnknownPredicateOperator(raw) {
    const input = own(raw, ['packageReceipt', 'fact_key', 'predicate_id']);
    const path = 'docs/contracts/next/provenance-v2/graphs-v2.json';
    let context = unknownOperatorContexts.get(input.packageReceipt);
    if (!context) {
        const { admittedDocuments } = require('./packageContract');
        const documents = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
        const corpus = documents.get(path);
        context = freezeDeep({ corpus,
            schemaOperators: documents.get('docs/contracts/next/provenance-v2/provenance-graph.schema.json')
                ?.definitions?.predicate?.properties?.op?.enum,
            registryOperators: documents.get(corpus?.operator_registry?.path)?.operators?.map(row => row.id) });
        unknownOperatorContexts.set(input.packageReceipt, context);
    }
    const { corpus, schemaOperators, registryOperators } = context;
    const graphs = corpus?.graphs?.filter(row => row.fact_key === input.fact_key);
    const predicates = graphs?.length === 1 ? graphs[0].predicates.filter(row => row.id === input.predicate_id) : [];
    if (predicates.length !== 1) fail('unknown_operator_target');
    const graph = graphs[0]; const predicate = predicates[0];
    if (!Array.isArray(schemaOperators) || !Array.isArray(registryOperators)
        || new Set(schemaOperators).size !== schemaOperators.length
        || new Set(registryOperators).size !== registryOperators.length
        || canonicalValue([...schemaOperators].sort()) !== canonicalValue([...registryOperators].sort())
        || !schemaOperators.includes(predicate.op)) fail('unknown_operator_registry');
    const target = { fact_key: graph.fact_key, predicate_id: predicate.id,
        obligation: predicate.obligation, atom: predicate.atom, operator: predicate.op, strategy: 'unknown_operator' };
    const mutation_id = `sha256:${createHash('sha256').update(canonicalValue({
        domain: 'financasbot.mutation-requirement.v1', family: 'predicate_strategy', target })).digest('hex')}`;
    const unknown = `unknown_${mutation_id.slice(7, 23)}`;
    if (schemaOperators.includes(unknown) || registryOperators.includes(unknown)) fail('unknown_operator_collision');
    const before = predicate.op;
    // Share only private frozen baseline records; never mutate the receipt or
    // clone the complete corpus for each independent one-cell patch.
    const candidate = { ...corpus, graphs: corpus.graphs.map(row => row !== graph ? row : {
        ...graph, predicates: graph.predicates.map(row => row !== predicate ? row : { ...predicate, op: unknown }) }) };
    const source = JSON.stringify(candidate);
    return freezeDeep({ stage: 'generated_unknown_operator_admission_only', mutation_acceptance: false,
        mutation_id, target, dp_execution: false, semantic_mutation_credit: 0,
        patch: { before, after: unknown }, changes: [{ path, source,
            sha256: `sha256:${createHash('sha256').update(source).digest('hex')}` }] });
}
function materializeUnknownPredicatePath(raw) {
    const input = own(raw, ['packageReceipt', 'fact_key', 'predicate_id', 'operand_index']);
    let corpus = unknownPathContexts.get(input.packageReceipt);
    if (!corpus) {
        const { admittedDocuments } = require('./packageContract');
        corpus = admittedDocuments(input.packageReceipt).find(row => row.path ===
            'docs/contracts/next/provenance-v2/graphs-v2.json')?.value;
        if (!corpus) fail('authority_missing');
        freezeDeep(corpus); unknownPathContexts.set(input.packageReceipt, corpus);
    }
    const graphs = corpus.graphs.filter(row => row.fact_key === input.fact_key);
    const predicates = graphs.length === 1 ? graphs[0].predicates.filter(row => row.id === input.predicate_id) : [];
    const predicate = predicates[0];
    if (predicates.length !== 1 || !Number.isSafeInteger(input.operand_index)
        || input.operand_index < 0 || input.operand_index >= predicate.args.length) fail('unknown_path_target');
    const arg = predicate.args[input.operand_index];
    const form = ['field', 'claim', 'presence', 'selector'].find(key => Object.hasOwn(arg, key));
    const reference = ['node', 'edge', 'set', 'period_ref', 'period_bound'].find(key => Object.hasOwn(arg, key));
    const templateBinding = arg.template && Object.keys(arg.bindings).filter(name => arg.bindings[name].selector).sort()[0];
    const location = form ? [form, 'segments'] : arg.ref_set?.field ? ['ref_set', 'field', 'segments']
        : reference === 'period_bound' ? ['period_bound', 'period'] : reference ? [reference]
        : templateBinding ? ['bindings', templateBinding, 'selector', 'segments'] : null;
    if (!location) fail('unknown_path_form');
    let original = arg; for (const key of location) original = original[key];
    if (reference ? typeof original !== 'string' || !original : !Array.isArray(original) || !original.length) fail('unknown_path_form');
    const target = { fact_key: graphs[0].fact_key, predicate_id: predicate.id,
        operand_index: input.operand_index, strategy: 'unknown_path' };
    const mutation_id = `sha256:${createHash('sha256').update(canonicalValue({
        domain: 'financasbot.mutation-requirement.v1', family: 'predicate_path_strategy', target })).digest('hex')}`;
    const unknown = `unknown_${mutation_id.slice(7, 23)}`;
    const after = reference ? unknown : [...original.slice(0, -1), unknown];
    const namespace = reference === 'node' ? Object.keys(graphs[0].nodes)
        : reference === 'edge' ? graphs[0].edges.map(row => row.id)
        : reference === 'set' ? Object.keys(graphs[0].sets)
        : reference ? Object.keys(graphs[0].windows || {}) : [];
    if (namespace.includes(unknown)) fail('unknown_path_collision');
    if (canonicalValue(original) === canonicalValue(after)) fail('unknown_path_collision');
    const graph = structuredClone(graphs[0]);
    let changed = graph.predicates.find(row => row.id === predicate.id).args[input.operand_index];
    for (const key of location.slice(0, -1)) changed = changed[key];
    changed[location.at(-1)] = after;
    return freezeDeep({ stage: 'generated_unknown_path_type_admission_only', mutation_acceptance: false,
        mutation_id, target, graph, patch: { location, before: original, after },
        dp_execution: false, semantic_mutation_credit: 0 });
}
function materializeInputStateOmission(raw) {
    const input = own(raw, ['packageReceipt', 'fact_key', 'candidate_set']);
    const { admittedDocuments } = require('./packageContract');
    const documents = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const path = 'docs/contracts/next/provenance-v2/graphs-v2.json';
    const corpus = structuredClone(documents.get(path));
    const graph = corpus?.graphs?.find(row => row.fact_key === input.fact_key);
    const selections = graph?.selections.filter(row => row.candidate_set === input.candidate_set);
    if (selections?.length !== 1 || !Object.hasOwn(selections[0], 'input_evidence_state')) fail('input_state_target');
    const claims = documents.get(corpus.claim_contract.path)?.claims;
    const claim = claims?.find(row => row.fact_key === graph.fact_key);
    // This strategy requires a discriminating fallback. A coincident default
    // cannot be relabelled as a passing structural witness.
    if (!claim || ['confirmed', 'projected'].includes(claim.evidence_state)
        || !['confirmed', 'projected'].includes(selections[0].input_evidence_state)) fail('input_state_not_discriminant');
    const target = { fact_key: graph.fact_key, candidate_set: selections[0].candidate_set,
        expected: selections[0].input_evidence_state };
    const mutation_id = `sha256:${createHash('sha256').update(canonicalValue({
        domain: 'financasbot.mutation-requirement.v1', family: 'input_evidence_state_presence', target })).digest('hex')}`;
    delete selections[0].input_evidence_state;
    const source = JSON.stringify(corpus);
    const sha256 = `sha256:${createHash('sha256').update(source).digest('hex')}`;
    return freezeDeep({ stage: 'generated_structural_mutation_only', mutation_acceptance: false,
        mutation_id, target, expected_violations: ['evidence_state'], changes: [{ path, source, sha256 }] });
}
function materializeExpectedFingerprintDrift(raw) {
    const input = own(raw, ['packageReceipt', 'fact_key', 'alias']);
    const { admittedDocuments } = require('./packageContract');
    const documents = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const path = 'docs/contracts/next/provenance-v2/graphs-v2.json';
    const corpus = structuredClone(documents.get(path));
    const graph = corpus?.graphs?.find(row => row.fact_key === input.fact_key);
    const node = graph && Object.hasOwn(graph.nodes, input.alias) ? graph.nodes[input.alias] : undefined;
    const before = node?.semantic_fingerprint;
    if (node?.binding !== 'snapshot' || typeof before !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(before)) fail('fingerprint_target');
    const target = { fact_key: graph.fact_key, alias: input.alias, expected: before };
    const mutation_id = `sha256:${createHash('sha256').update(canonicalValue({
        domain: 'financasbot.mutation-requirement.v1', family: 'expected_fingerprint', target })).digest('hex')}`;
    const after = before.slice(0, 7) + (before[7] === '0' ? '1' : '0') + before.slice(8);
    node.semantic_fingerprint = after;
    const source = JSON.stringify(corpus);
    const sha256 = `sha256:${createHash('sha256').update(source).digest('hex')}`;
    return freezeDeep({ stage: 'generated_expected_fingerprint_drift_only', mutation_acceptance: false,
        mutation_id, target, expected_violations: ['fingerprint'], patch: { before, after },
        changes: [{ path, source, sha256 }] });
}
function materializeExpectedVersionDrift(raw) {
    const input = own(raw, ['packageReceipt', 'fact_key', 'alias']);
    const { admittedDocuments } = require('./packageContract');
    const documents = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const path = 'docs/contracts/next/provenance-v2/graphs-v2.json';
    const corpus = structuredClone(documents.get(path));
    const graph = corpus?.graphs?.find(row => row.fact_key === input.fact_key);
    const node = graph && Object.hasOwn(graph.nodes, input.alias) ? graph.nodes[input.alias] : undefined;
    const before = node?.version;
    if (node?.binding !== 'snapshot' || typeof before !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(before)) fail('version_target');
    const manifest = documents.get(corpus.snapshot_manifest.path);
    if (!Array.isArray(manifest?.snapshots)) fail('version_manifest');
    const versions = new Set(manifest.snapshots.map(row => row.version));
    // N+1 distinct, schema-valid identities guarantee one absent from the N
    // admitted versions. This is an expected-pointer defect, not new content:
    // no snapshot, source, predicate or fingerprint is repaired/changed.
    let after;
    for (let ordinal = 0; ordinal <= versions.size; ordinal++) {
        const candidate = `sha256:${ordinal.toString(16).padStart(64, '0')}`;
        if (!versions.has(candidate) && candidate !== before) { after = candidate; break; }
    }
    if (!after) fail('version_no_witness');
    const target = { fact_key: graph.fact_key, alias: input.alias, binding: node.binding, kind: node.kind, strategy: 'version' };
    const mutation_id = `sha256:${createHash('sha256').update(canonicalValue({
        domain: 'financasbot.mutation-requirement.v1', family: 'node_strategy', target })).digest('hex')}`;
    node.version = after;
    const source = JSON.stringify(corpus);
    const sha256 = `sha256:${createHash('sha256').update(source).digest('hex')}`;
    return freezeDeep({ stage: 'generated_expected_version_drift_only', mutation_acceptance: false,
        mutation_id, target, expected_violations: ['identity'], patch: { before, after }, changes: [{ path, source, sha256 }] });
}
// Fault injection into a captured recorder OUTPUT, never a legitimate trace
// receipt. Reindexing models the dropped observations; it grants no execution
// authenticity, TCB identity, parent authority or financial acceptance.
const frozenTraceSources = new WeakMap();
function immutableData(value, seen = new WeakSet()) {
    if (value === null || typeof value !== 'object') return true;
    if (types.isProxy(value) || !Object.isFrozen(value)
        || ![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(value))) return false;
    if (seen.has(value)) return true;
    seen.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return Reflect.ownKeys(descriptors).every(key => typeof key === 'string'
        && Object.hasOwn(descriptors[key], 'value') && immutableData(descriptors[key].value, seen));
}
function copiedTraceSource(source, factKey) {
    const cached = frozenTraceSources.get(source);
    const trace = cached ? structuredClone(cached) : plain(source);
    own(trace, ['stage', 'execution_id', 'derivation_trace', 'proof_trace']);
    if (trace.stage !== 'observations_only' || !identifier(trace.execution_id)) fail('trace_scope');
    const all = [];
    for (const phase of ['derivation', 'proof']) {
        if (!Array.isArray(trace[`${phase}_trace`])) fail('trace_scope');
        let previous = -1;
        for (const row of trace[`${phase}_trace`]) {
            if (row.phase !== phase || row.invocation_id !== factKey
                || !Number.isSafeInteger(row.sequence) || row.sequence <= previous) fail('trace_scope');
            previous = row.sequence;
            if (!cached) {
                const keys = Object.keys(row).sort().join(',');
                if (keys === 'alias,invocation_id,operation,outcome,path,phase,projection,role,sequence') {
                    decodeObservation(['I', row.operation, row.alias, row.role, row.path, row.projection, row.outcome]);
                } else if (keys === 'invocation_id,measurement,observed,phase,sequence') {
                    decodeMeasurement(['M', row.measurement, row.observed]);
                } else fail('trace_event');
            }
            all.push(row);
        }
    }
    all.sort((a, b) => a.sequence - b.sequence);
    if (all.some((row, index) => row.sequence !== index)) fail('trace_sequence');
    // Only fully immutable input identities are cached. A frozen outer shell
    // with mutable rows is insufficient, and no caller gets the stored copy.
    if (!cached && immutableData(source)) frozenTraceSources.set(source, freezeDeep(structuredClone(trace)));
    return { trace, all };
}
function omittedTraceFault(source, target, omitted, requiredAnchor, includeReadDependents = false) {
    const { trace, all } = copiedTraceSource(source, target.fact_key);
    if (requiredAnchor && !all.some(requiredAnchor)) fail('trace_no_witness');
    const removed = new Set(all.filter(omitted).map(row => row.sequence));
    if (includeReadDependents) {
        const containers = all.filter(row => removed.has(row.sequence) && row.operation === 'get'
            && row.projection === 'data' && row.outcome[0] === 'container');
        for (const row of all) {
            // A missing record/sequence opening cannot leave descendant
            // navigation or key views claiming a reachable handle. This is
            // recorder-output fault injection, never filtering runtime reads.
            if (['data', 'keys'].includes(row.projection) && containers.some(anchor => row.sequence > anchor.sequence
                && row.phase === anchor.phase && row.alias === anchor.alias && row.role === anchor.role
                && anchor.path.length <= row.path.length && anchor.path.every((part, index) => row.path[index] === part))) {
                removed.add(row.sequence);
            }
        }
        for (let index = 1; index < all.length; index++) {
            const source = all[index - 1]; const dependent = all[index];
            // The primitive's conversion observation depends on exactly its
            // immediately preceding scalar read. Do not remove another role,
            // path, phase or conversion, nor any actual runtime execution.
            if (removed.has(source.sequence) && source.operation === 'get' && source.projection === 'data'
                && source.outcome[0] === 'scalar' && dependent.operation === 'civil_date'
                && dependent.phase === source.phase && dependent.alias === source.alias && dependent.role === source.role
                && JSON.stringify(dependent.path) === JSON.stringify(source.path)
                && dependent.outcome[1] === source.outcome[1]) removed.add(dependent.sequence);
        }
    }
    const removed_sequences = all.filter(row => removed.has(row.sequence)).map(row => row.sequence);
    if (!removed_sequences.length) fail('trace_no_witness');
    const remaining = all.filter(row => !removed.has(row.sequence));
    remaining.forEach((row, index) => { row.sequence = index; });
    for (const phase of ['derivation', 'proof']) trace[`${phase}_trace`] = remaining.filter(row => row.phase === phase);
    const mutation_id = `sha256:${createHash('sha256').update(canonicalValue({
        domain: 'financasbot.mutation-requirement.v1', family: 'phase_trace_requirement', target })).digest('hex')}`;
    return freezeDeep({ stage: 'generated_trace_fault_only', mutation_acceptance: false, mutation_id, target,
        expected_violations: ['trace'], removed_sequences, trace });
}
function omittedSelectionViews(source, target, roles) {
    // Selected views share the composite selection-completion barrier. Once
    // a required selection is absent, none of that phase's returned views can
    // be treated as admitted by operand coverage. Erase those dependent view
    // observations, not payload reads or the other phase. This remains only
    // fault injection into recorder OUTPUT, never filtering a real execution.
    return omittedTraceFault(source, target, row => row.phase === target.phase
        && (row.projection === 'operand_selection'
            || row.projection === 'operand_set' && roles.has(row.role)
                && (row.operation.startsWith('select_') || row.operation === 'at')));
}
function materializeTraceSelectionOmission(raw) {
    const input = own(raw, ['trace', 'fact_key', 'phase', 'role', 'candidate_set', 'selected_set']);
    if (![input.fact_key, input.role, input.candidate_set, input.selected_set].every(identifier)
        || !['derivation', 'proof'].includes(input.phase)) fail('trace_target');
    const { all } = copiedTraceSource(input.trace, input.fact_key);
    if (!all.some(row => row.phase === input.phase && row.role === input.role
        && row.projection === 'operand_set' && row.operation === 'select_return')) fail('trace_no_witness');
    const target = { fact_key: input.fact_key, phase: input.phase, field: 'required_selections',
        value: { candidate_set: input.candidate_set, selected_set: input.selected_set } };
    // The executor supplies this role from the admitted pair binding; this
    // generator alone does not authenticate the pair or grant matrix credit.
    return omittedSelectionViews(input.trace, target, new Set([input.role]));
}
function materializeTraceSelectedNodeOmission(raw) {
    const input = own(raw, ['trace', 'fact_key', 'phase', 'node']);
    if (!identifier(input.fact_key) || !identifier(input.node)
        || !['derivation', 'proof'].includes(input.phase)) fail('trace_target');
    const { all } = copiedTraceSource(input.trace, input.fact_key);
    const roles = new Set(all.filter(row => row.phase === input.phase && row.projection === 'operand_set'
        && row.operation === 'select_return' && row.outcome.slice(2).includes(input.node)).map(row => row.role));
    if (!roles.size) fail('trace_no_witness');
    return omittedSelectionViews(input.trace,
        { fact_key: input.fact_key, phase: input.phase, field: 'selected_nodes', value: input.node }, roles);
}
function materializeTraceNodeOmission(raw) {
    const input = own(raw, ['trace', 'fact_key', 'phase', 'node']);
    if (!identifier(input.fact_key) || !identifier(input.node) || input.node === 'claim/context'
        || !['derivation', 'proof'].includes(input.phase)) fail('trace_target');
    const target = { fact_key: input.fact_key, phase: input.phase, field: 'required_nodes', value: input.node };
    // Remove the entire phase-local node view so descendant navigation cannot
    // become orphaned. Operand/selection views, sibling nodes and the other
    // phase remain intact; native composite coverage must still qualify this
    // recorder-output fault before any matrix credit is awarded.
    return omittedTraceFault(input.trace, target, row => row.phase === input.phase && row.alias === input.node
        && ['data', 'keys', 'node_identity'].includes(row.projection), row => row.phase === input.phase
        && row.alias === input.node && row.projection === 'data');
}
function materializeTraceReadOmission(raw) {
    const input = own(raw, ['trace', 'fact_key', 'phase', 'node', 'segments']);
    const segments = plain(input.segments);
    if (!identifier(input.fact_key) || !identifier(input.node) || input.node === 'claim/context' || !['derivation', 'proof'].includes(input.phase)
        || !Array.isArray(segments) || !segments.length || !segments.every(field)) fail('trace_target');
    const target = { fact_key: input.fact_key, phase: input.phase, field: 'required_reads',
        value: { node: input.node, segments } };
    return omittedTraceFault(input.trace, target, row => row.phase === input.phase && row.operation === 'get'
        && row.projection === 'data' && row.alias === input.node && JSON.stringify(row.path) === JSON.stringify(segments), undefined, true);
}
function materializeTraceReadSubstitution(raw) {
    const input = own(raw, ['packageReceipt', 'trace', 'fact_key', 'phase', 'node', 'segments']);
    const segments = plain(input.segments);
    if (!identifier(input.fact_key) || !identifier(input.node) || input.node === 'claim/context'
        || !['derivation', 'proof'].includes(input.phase) || !Array.isArray(segments)
        || segments.length !== 1 || !segments.every(field)) fail('trace_path_target');
    const { admittedDocuments } = require('./packageContract');
    const documents = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = documents.get('docs/contracts/next/provenance-v2/graphs-v2.json');
    const graph = corpus.graphs.find(row => row.fact_key === input.fact_key);
    const node = graph?.nodes?.[input.node];
    if (node?.binding !== 'snapshot' || !graph.trace_contract[input.phase].required_reads.some(row => row.node === input.node
        && JSON.stringify(row.segments) === JSON.stringify(segments))) fail('trace_path_target');
    const manifest = documents.get(corpus.snapshot_manifest.path);
    const matches = manifest.snapshots.filter(row => row.kind === node.kind && row.ref_id === node.ref_id && row.version === node.version);
    if (matches.length !== 1) fail('trace_path_target');
    const payload = matches[0].payload;
    const fields = documents.get(corpus.material_registry.path).kinds[node.kind].fields;
    const descriptor = fields[segments[0]];
    if (!descriptor || descriptor.class === 'non_material' || !Object.hasOwn(payload, segments[0])
        || !require('./observationContract').scalar(payload[segments[0]])) fail('trace_path_target');
    // Value-preserving, type-compatible path fault. No new field, schema domain
    // or observation authority is invented to manufacture a discriminant.
    const alternative = Object.entries(fields).find(([name, other]) => name !== segments[0]
        && other.class !== 'non_material' && other.type === descriptor.type
        && Object.hasOwn(payload, name) && payload[name] === payload[segments[0]]);
    if (!alternative) fail('trace_path_alternative');
    const { trace, all } = copiedTraceSource(input.trace, input.fact_key);
    const replaced_sequences = [];
    for (const row of all) {
        if (row.phase !== input.phase || row.operation !== 'get' || row.projection !== 'data'
            || row.alias !== input.node || JSON.stringify(row.path) !== JSON.stringify(segments)) continue;
        if (row.outcome.length !== 2 || row.outcome[0] !== 'scalar' || row.outcome[1] !== payload[segments[0]]) fail('trace_path_outcome');
        replaced_sequences.push(row.sequence);
        row.path = [alternative[0]];
    }
    if (!replaced_sequences.length) fail('trace_no_witness');
    const target = { fact_key: input.fact_key, phase: input.phase, field: 'required_reads',
        value: { node: input.node, segments }, strategy: 'same_type_wrong_path' };
    const mutation_id = `sha256:${createHash('sha256').update(canonicalValue({
        domain: 'financasbot.mutation-requirement.v1', family: 'trace_strategy', target })).digest('hex')}`;
    return freezeDeep({ stage: 'generated_trace_fault_only', mutation_acceptance: false, mutation_id, target,
        expected_violations: ['trace'], replaced_sequences,
        patch: { node: input.node, before: segments, after: [alternative[0]] }, trace });
}
function materializeTraceEdgeOmission(raw) {
    const input = own(raw, ['trace', 'fact_key', 'phase', 'edge']);
    if (!identifier(input.fact_key) || !identifier(input.edge) || !['derivation', 'proof'].includes(input.phase)) fail('trace_target');
    const target = { fact_key: input.fact_key, phase: input.phase, field: 'required_edges', value: input.edge };
    return omittedTraceFault(input.trace, target, row => row.phase === input.phase && row.operation === 'traverse'
        && row.projection === 'data' && row.outcome[1] === input.edge);
}
function materializeTraceClaimReadOmission(raw) {
    const input = own(raw, ['trace', 'fact_key', 'phase', 'segments']);
    const segments = plain(input.segments);
    if (!identifier(input.fact_key) || !['derivation', 'proof'].includes(input.phase)
        || !Array.isArray(segments) || !segments.length || !segments.every(field)) fail('trace_target');
    const target = { fact_key: input.fact_key, phase: input.phase, field: 'required_claim_reads', value: { segments } };
    return omittedTraceFault(input.trace, target, row => row.phase === input.phase && row.operation === 'get'
        && row.projection === 'data' && row.alias === 'claim/context' && JSON.stringify(row.path) === JSON.stringify(segments), undefined, true);
}
function materializeTraceStructuralOmission(raw) {
    const input = own(raw, ['trace', 'fact_key', 'phase', 'node', 'operation', 'segments']);
    const segments = plain(input.segments);
    // Selection/operand-set projections have a different lifecycle contract.
    // Do not reinterpret them as payload operations or silently mark a skip.
    if (!['has', 'keys', 'iterator', 'order', 'cardinality'].includes(input.operation)) fail('trace_structural_strategy');
    if (!identifier(input.fact_key) || !identifier(input.node) || input.node === 'claim/context'
        || !['derivation', 'proof'].includes(input.phase) || !Array.isArray(segments)
        || !segments.every(field) || input.operation === 'has' && !segments.length) fail('trace_target');
    const target = { fact_key: input.fact_key, phase: input.phase, field: 'required_structural',
        value: { node: input.node, operation: input.operation, segments } };
    return omittedTraceFault(input.trace, target, row => {
        if (row.phase !== input.phase || row.alias !== input.node) return false;
        // keys() opens a separately projected sequence. Removing only the
        // opening leaves its at/length/iterator lifecycle orphaned; remove
        // that complete view, never the scalar reads it helped enumerate.
        if (input.operation === 'keys' && row.projection === 'keys') {
            const base = ['next', 'at'].includes(row.operation) ? row.path.slice(0, -1) : row.path;
            return JSON.stringify(base) === JSON.stringify(segments);
        }
        if (row.projection !== 'data') return false;
        const path = row.operation === 'next' ? row.path.slice(0, -1) : row.path;
        if (JSON.stringify(path) !== JSON.stringify(segments)) return false;
        if (['iterator', 'order', 'cardinality'].includes(input.operation)) {
            // Iterator, natural order and exhaustion/cardinality are derived
            // from the complete cursor lifecycle, not one terminal event.
            // Delete whole cycles (including repeated cycles), never leave
            // orphan next/return/reopen events. Cardinality also has an
            // independent length witness which must be removed. Keep at,
            // includes, parent get and every scalar read unchanged. Missing
            // sibling structural coordinates remain within the trace atom.
            return ['iterate', 'next', 'return', 'reuse_iterator'].includes(row.operation)
                || input.operation === 'cardinality' && row.operation === 'length';
        }
        return row.operation === input.operation;
    }, input.operation === 'keys' ? row => row.phase === input.phase && row.alias === input.node
        && row.projection === 'data' && row.operation === 'keys'
        && JSON.stringify(row.path) === JSON.stringify(segments) : undefined);
}
module.exports = { enumerateMutationRequirements, materializeSingletonDomainCandidate, materializeSignedRelationMutation,
    materializeInputStateOmission, materializeScalarEqualityStrategy, materializeUnknownPredicateOperator,
    materializeUnknownPredicatePath,
    materializeExpectedFingerprintDrift, materializeTraceReadOmission, materializeTraceEdgeOmission,
    materializeTraceClaimReadOmission, materializeTraceStructuralOmission, materializeExpectedVersionDrift,
    materializeMonthRelationMutation, materializeEnumEqualityMutation, materializeEnumEqualityMutationVariant, materializeTraceReadSubstitution,
    materializeTraceNodeOmission, materializeTraceSelectionOmission, materializeTraceSelectedNodeOmission };
