'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { admitPackage } = require('../../../src/next/provenance/packageContract');
const { compileAuthoringIndex } = require('../../../src/next/provenance/graphCompiler');
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
