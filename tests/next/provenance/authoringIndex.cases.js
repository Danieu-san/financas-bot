'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { admitPackage } = require('../../../src/next/provenance/packageContract');
const { compileAuthoringIndex, compileAuthoringIR } = require('../../../src/next/provenance/graphCompiler');
const { lowerAuthoringIR } = require('../../../src/next/provenance/authoringIR');
const root = path.resolve(__dirname, '../../..');
const prefix = 'docs/contracts/next/provenance-v2/';
const graphPath = prefix + 'graphs-v2.json';
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function fixture() {
    const byPath = new Map();
    function add(file) {
        if (byPath.has(file)) return JSON.parse(byPath.get(file).bytes);
        // This test reconstructs the LF-published JSON fixture on Windows.
        // The admission module itself never performs line-ending normalization.
        const bytes = Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n'));
        byPath.set(file, { path: file, bytes });
        return JSON.parse(bytes);
    }
    const graphs = add(graphPath);
    add(prefix + 'predicate-templates-v1.json');
    add(prefix + 'claim-contract.schema.json');
    add(prefix + 'evidence-snapshot.schema.json');
    for (const field of ['claim_contract', 'snapshot_manifest', 'material_registry', 'operator_registry', 'metric_evaluator_registry']) add(graphs[field].path);
    for (const source of add(graphs.snapshot_manifest.path).sources) add(source.path);
    for (const entry of add(graphs.metric_evaluator_registry.path).entries) add(entry.contract_path);
    for (const graph of graphs.graphs) for (const source of graph.authoring_sources) add(source.path);
    const entries = [...byPath.values()];
    return { entries, authority: entries.map(({ path, bytes }) => ({ path, sha256: hash(bytes) })) };
}
async function validators() {
    const builder = await import(pathToFileURL(path.join(root, 'scripts/agent/buildNextProvenanceArtifacts.mjs')));
    return builder.buildSchemaValidators().validators;
}

test('N02G:AUTHORING-001 complete package resolves reviewed links and identities', async () => {
    const result = compileAuthoringIndex(admitPackage(fixture()), await validators());
    assert.equal(result.stage, 'indexed_authoring_only');
    assert.equal(result.graphs.length, 76);
    assert.equal(result.evaluatorCount, 39);
    assert.equal(Object.hasOwn(result, 'proof'), false);
});

test('N02G:AUTHORING-010 IR keeps all graphs, typed predicates, roles and proof expectations', async () => {
    const f = fixture();
    const admitted = admitPackage(f);
    const ir = compileAuthoringIR(admitted, await validators());
    const original = admitted.documents.find(d => d.path === graphPath).value;
    assert.equal(ir.stage, 'typed_authoring_ir_only');
    assert.equal(ir.executable, false);
    assert.equal(ir.graphs.length, 76);
    assert.equal(ir.graphs.reduce((n, g) => n + g.predicates.length, 0), 11456);
    assert.equal(ir.graphs.reduce((n, g) => n + g.operands.length, 0), 277);
    assert.equal(ir.graphs.reduce((n, g) => n + g.selections.length, 0), 73);
    assert.deepEqual(ir.graphs.map(g => g.fact_key), ir.order);
    assert.deepEqual(ir.authority_refs, admitted.documents.map(({ path, sha256 }) => ({ path, sha256 })));
    for (const graph of ir.graphs) {
        const source = original.graphs.find(g => g.fact_key === graph.fact_key);
        for (const key of ['nodes', 'sets', 'edges', 'obligations', 'selections']) assert.deepEqual(graph[key], source[key]);
        assert.deepEqual(graph.expected_trace, source.trace_contract);
        assert.deepEqual(graph.predicates.map(p => p.id), source.predicates.map(p => p.id));
        assert.ok(graph.predicates.every(p => p.operands.every(a => a.type && a.expression.kind)));
        for (const parent of graph.parents) assert.ok(ir.order.indexOf(parent.fact_key) < ir.order.indexOf(graph.fact_key));
        assert.equal(Object.hasOwn(graph.claim, 'operand_bindings'), false);
        assert.equal(Object.hasOwn(graph, 'result'), false);
        assert.equal(Object.hasOwn(graph, 'payload'), false);
    }
    assert.ok(ir.graphs.flatMap(g => g.required_state_checks).length > 0);
});

test('N02G:AUTHORING-011 template expansion is lexical and preserves window boundaries', async () => {
    const admitted = admitPackage(fixture());
    const ir = compileAuthoringIR(admitted, await validators());
    const original = admitted.documents.find(d => d.path === graphPath).value;
    const templates = admitted.documents.find(d => d.path === prefix + 'predicate-templates-v1.json').value.templates;
    let expansions = 0;
    for (const graph of ir.graphs) {
        const source = original.graphs.find(g => g.fact_key === graph.fact_key);
        for (const [id, window] of Object.entries(source.windows || {})) {
            assert.equal(graph.windows[id].kind, window.kind);
            if (window.kind === 'range') {
                assert.equal(graph.windows[id].start_inclusive, window.start_inclusive);
                assert.equal(graph.windows[id].end_inclusive, window.end_inclusive);
            }
        }
        for (const predicate of graph.predicates) for (const operand of predicate.operands) {
            const e = operand.expression;
            if (e.kind !== 'predicate_template') continue;
            expansions++;
            const t = templates.find(t => t.id === e.template_ref.id && t.version === e.template_ref.version);
            const p = source.predicates.find(p => p.id === predicate.id);
            const ref = p.args.find(a => a.template);
            assert.equal(e.combinator, 'all');
            assert.equal(e.member_slot, 'current_member');
            assert.equal(e.template_ref.hash, ref.template.hash);
            assert.deepEqual(e.body.map(p => p.op), t.body.map(p => p.op));
            e.body.forEach((p, i) => p.operands.forEach((arg, j) => {
                const parameter = t.body[i].args[j];
                if (parameter.current_member_field_parameter) {
                    const selector = ref.bindings[parameter.current_member_field_parameter].selector;
                    assert.deepEqual(arg, { kind: 'member_field', slot: 'current_member',
                        node_kind: selector.kind, segments: selector.segments });
                } else assert.deepEqual(arg, e.bindings[parameter.parameter]);
            }));
        }
    }
    assert.equal(expansions, 28);
});

test('N02G:AUTHORING-012 IR remains frozen and cannot bypass package or semantic admission', async () => {
    const validation = await validators();
    const f = fixture();
    const admitted = admitPackage(f);
    const ir = compileAuthoringIR(admitted, validation);
    function frozen(value) {
        if (value && typeof value === 'object') {
            assert.ok(Object.isFrozen(value));
            for (const child of Object.values(value)) frozen(child);
        }
    }
    frozen(ir);
    assert.throws(() => { ir.graphs[0].expected_trace.proof.required_nodes.pop(); }, TypeError);
    assert.throws(() => compileAuthoringIR({ ...admitted }, validation), /package_not_admitted/);
    const entry = f.entries.find(e => e.path === graphPath);
    const graphs = JSON.parse(entry.bytes);
    const graph = graphs.graphs.find(g => g.selections.some(s => s.input_evidence_state));
    delete graph.selections[0].input_evidence_state;
    entry.bytes = Buffer.from(JSON.stringify(graphs));
    f.authority.find(a => a.path === graphPath).sha256 = hash(entry.bytes);
    assert.throws(() => compileAuthoringIR(admitPackage(f), validation), /selection_binding_input_state/);
});

test('N02G:AUTHORING-013 IR is deterministic without copying source payloads or oracle data', async () => {
    const validation = await validators();
    const f = fixture();
    const first = compileAuthoringIR(admitPackage(f), validation);
    f.entries.reverse();
    f.authority.reverse();
    const second = compileAuthoringIR(admitPackage(f), validation);
    assert.deepEqual(second, first);
    assert.deepEqual(Object.keys(first).sort(), ['authority_refs', 'executable', 'format', 'graphs', 'order', 'stage', 'version']);
    for (const graph of first.graphs) {
        assert.deepEqual(Object.keys(graph).sort(), ['claim', 'claim_id', 'edges', 'evaluator_ref', 'expected_trace',
            'fact_key', 'nodes', 'obligations', 'operands', 'parents', 'predicates', 'required_state_checks',
            'selections', 'sets', 'windows']);
        assert.equal(Object.hasOwn(graph.claim, 'value'), false);
        assert.equal(Object.hasOwn(graph.claim, 'expected'), false);
    }
});

test('N02G:AUTHORING-015 internal lowering preserves sort ties and projection multiplicity', () => {
    // Isolated lowering contract, not an admitted graph or an executable proof.
    const sources = [{ sort: { keys: [
        { selector: { kind: 'event', segments: ['date'] }, direction: 'desc' },
        { selector: { kind: 'event', segments: ['amount_minor'] }, direction: 'asc' }
    ], tie_break: 'kind_ref_version' } },
    { projection: { set: 'ordered', selector: { kind: 'event', segments: ['amount_minor'] }, as: 'sequence' } }];
    const graph = { fact_key: 'internal', claim_id: 'claim-internal', nodes: {}, sets: { ordered: ['a', 'b'] },
        predicates: [{ id: 'p' }], edges: [], obligations: [], selections: [], trace_contract: {} };
    const index = { order: ['internal'], graphs: [{ fact_key: 'internal', evaluator_ref: {}, parents: [] }] };
    const input = { documents: [], graphs: [graph], claims: [{ fact_key: 'internal', claim_id: 'claim-internal' }], index,
        operandBindings: { stage: 'operand_bindings_indexed_only', graphs: [{ fact_key: 'internal', operands: [] }] },
        predicateTypes: { stage: 'predicate_types_checked_only', unresolved: 0, typedGraphs: [{ fact_key: 'internal',
            claim_id: 'claim-internal', predicates: [{ id: 'p', op: 'internal_test', obligation: 'evidence_set', atom: 'evidence_set',
                operands: sources.map(source => ({ type: {}, source })) }] }] },
        selectionBindings: { stage: 'selection_bindings_checked_only', stateChecks: [] }, templates: { templates: [] } };
    const [sort, projection] = lowerAuthoringIR(input).graphs[0].predicates[0].operands.map(o => o.expression);
    assert.equal(sort.tie_break, 'kind_ref_version');
    assert.deepEqual(sort.keys.map(k => k.direction), ['desc', 'asc']);
    assert.deepEqual(sort.keys.map(k => k.selector.segments), [['date'], ['amount_minor']]);
    assert.equal(projection.as, 'sequence');
    assert.deepEqual(projection.set, { kind: 'set_ref', name: 'ordered' });
});

test('N02G:AUTHORING-004 schema-valid type substitution fails after package hash is repaired', async () => {
    const validation = await validators();
    const f = fixture();
    const entry = f.entries.find(e => e.path === graphPath);
    const value = JSON.parse(entry.bytes);
    const predicate = value.graphs[0].predicates.find(p => p.op === 'field_eq');
    predicate.args[1] = { field: { node: 'card_blue', segments: ['id'] } };
    assert.equal(validation.graphs(value), true);
    entry.bytes = Buffer.from(JSON.stringify(value));
    f.authority.find(a => a.path === graphPath).sha256 = hash(entry.bytes);
    assert.throws(() => compileAuthoringIndex(admitPackage(f), validation), /operator_types_nominal_mismatch/);
});

test('N02G:AUTHORING-005 registry/schema drift fails independently of current payload values and hashes', async () => {
    const validation = await validators();
    const f = fixture();
    const graphEntry = f.entries.find(e => e.path === graphPath);
    const graphs = JSON.parse(graphEntry.bytes);
    const registryEntry = f.entries.find(e => e.path === graphs.material_registry.path);
    const registry = JSON.parse(registryEntry.bytes);
    // A more permissive registry limit need not invalidate any present payload.
    // Repair both hash layers: only the schema/registry projection can reject it.
    registry.kinds.card.fields.closing_day.maximum = 32;
    registryEntry.bytes = Buffer.from(JSON.stringify(registry));
    graphs.material_registry.hash = hash(registryEntry.bytes);
    graphEntry.bytes = Buffer.from(JSON.stringify(graphs));
    for (const entry of [registryEntry, graphEntry]) f.authority.find(a => a.path === entry.path).sha256 = hash(entry.bytes);
    assert.equal(validation.graphs(graphs), true);
    assert.throws(() => compileAuthoringIndex(admitPackage(f), validation), /schema_registry_projection:payload_card/);
});

test('N02G:AUTHORING-006 type-compatible money comparison cannot discharge node identity', async () => {
    const validation = await validators();
    const f = fixture();
    const entry = f.entries.find(e => e.path === graphPath);
    const graphs = JSON.parse(entry.bytes);
    const predicate = graphs.graphs[0].predicates.find(p => p.op === 'kind_is');
    predicate.op = 'eq';
    predicate.args = [{ field: { node: 'account_a', segments: ['opening_balance_minor'] } },
        { field: { node: 'account_b', segments: ['opening_balance_minor'] } }];
    assert.equal(validation.graphs(graphs), true);
    entry.bytes = Buffer.from(JSON.stringify(graphs));
    f.authority.find(a => a.path === graphPath).sha256 = hash(entry.bytes);
    // Same nominal unit and valid references: rejection must be the obligation
    // association, not package/schema/fingerprint or operand-type mismatch.
    assert.throws(() => compileAuthoringIndex(admitPackage(f), validation), /obligation_binding_semantics/);
});

test('N02G:AUTHORING-007 valid binding shape cannot change a registry role input kind', async () => {
    const validation = await validators();
    const f = fixture();
    const graphEntry = f.entries.find(e => e.path === graphPath);
    const graphs = JSON.parse(graphEntry.bytes);
    const claimEntry = f.entries.find(e => e.path === graphs.claim_contract.path);
    const claims = JSON.parse(claimEntry.bytes);
    claims.claims[0].operand_bindings.context = { kind: 'node', alias: 'person_a' };
    assert.equal(validation.claims(claims), true);
    claimEntry.bytes = Buffer.from(JSON.stringify(claims));
    graphs.claim_contract.hash = hash(claimEntry.bytes);
    graphEntry.bytes = Buffer.from(JSON.stringify(graphs));
    for (const entry of [claimEntry, graphEntry]) f.authority.find(a => a.path === entry.path).sha256 = hash(entry.bytes);
    assert.throws(() => compileAuthoringIndex(admitPackage(f), validation), /operand_binding_kind/);
});

test('N02G:AUTHORING-008 removed estimated-input state fails after package hashes are repaired', async () => {
    const validation = await validators();
    const f = fixture();
    const entry = f.entries.find(e => e.path === graphPath);
    const graphs = JSON.parse(entry.bytes);
    const graph = graphs.graphs.find(g => g.selections.some(s => s.input_evidence_state));
    delete graph.selections[0].input_evidence_state;
    assert.equal(validation.graphs(graphs), true);
    entry.bytes = Buffer.from(JSON.stringify(graphs));
    f.authority.find(a => a.path === graphPath).sha256 = hash(entry.bytes);
    assert.throws(() => compileAuthoringIndex(admitPackage(f), validation), /selection_binding_input_state/);
});

test('N02G:AUTHORING-009 a changed claim literal reaches descriptor binding rejection', async () => {
    const validation = await validators();
    const f = fixture();
    const entry = f.entries.find(e => e.path === graphPath);
    const graphs = JSON.parse(entry.bytes);
    const predicate = graphs.graphs[0].predicates.find(p => p.args.some(a =>
        JSON.stringify(a.claim?.segments) === JSON.stringify(['time_basis'])));
    predicate.args.find(a => a.literal).literal.value = 'due_date';
    assert.equal(validation.graphs(graphs), true);
    entry.bytes = Buffer.from(JSON.stringify(graphs));
    f.authority.find(a => a.path === graphPath).sha256 = hash(entry.bytes);
    assert.throws(() => compileAuthoringIndex(admitPackage(f), validation), /claim_requirements_value/);
});

test('N02G:AUTHORING-014 removing collection anchor cannot be hidden by repaired schema and hashes', async () => {
    const validation = await validators();
    const f = fixture();
    const entry = f.entries.find(e => e.path === graphPath);
    const graphs = JSON.parse(entry.bytes);
    const g = graphs.graphs[0];
    const id = g.predicates.find(p => p.op === 'set_eq' && p.args.some(a => a.ref_set)).id;
    g.predicates = g.predicates.filter(p => p.id !== id);
    for (const o of g.obligations) o.predicates = o.predicates.filter(p => p !== id);
    assert.equal(validation.graphs(graphs), true);
    entry.bytes = Buffer.from(JSON.stringify(graphs));
    f.authority.find(a => a.path === graphPath).sha256 = hash(entry.bytes);
    assert.throws(() => compileAuthoringIR(admitPackage(f), validation), /collection_requirements_membership_anchor/);
});

test('N02G:AUTHORING-002 admitted but altered authority cannot evade cross-document hashes', async () => {
    const validation = await validators();
    const f = fixture();
    const entry = f.entries.find(e => e.path === prefix + 'claims-v2.json');
    entry.bytes = Buffer.from(entry.bytes.toString() + ' ');
    f.authority.find(a => a.path === entry.path).sha256 = hash(entry.bytes);
    assert.throws(() => compileAuthoringIndex(admitPackage(f), validation), /graph_index_authority_hash/);
    assert.throws(() => compileAuthoringIndex({ stage: 'admitted_bytes_only', documents: [] }, validation), /package_not_admitted/);
});

test('N02G:AUTHORING-003 schema-valid duplicate graph fails after package hashes are repaired', async () => {
    const validation = await validators();
    const f = fixture();
    const entry = f.entries.find(e => e.path === graphPath);
    const value = JSON.parse(entry.bytes);
    // Keep the objects different so JSON Schema uniqueItems cannot mask the
    // identity collision this test must reach in the index pass.
    value.graphs[1].fact_key = value.graphs[0].fact_key;
    value.graphs[1].claim_id = value.graphs[0].claim_id;
    entry.bytes = Buffer.from(JSON.stringify(value));
    f.authority.find(a => a.path === graphPath).sha256 = hash(entry.bytes);
    assert.throws(() => compileAuthoringIndex(admitPackage(f), validation), /graph_index_duplicate/);
});
