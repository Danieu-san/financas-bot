'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const prefix = 'docs/contracts/next/provenance-v2/';
let cache;
async function fixture() {
    if (cache) return cache;
    const { loadLocalAuthoringPackage } = await import('../../../scripts/agent/executeNextDomainInvariantMatrix.mjs');
    const { buildAdmittedSchemaValidators } = await import('../../../scripts/agent/buildNextProvenanceArtifacts.mjs');
    const { compileAuthoringIR } = require('../../../src/next/provenance/graphCompiler');
    const { admittedDocuments } = require('../../../src/next/provenance/packageContract');
    const packageReceipt = loadLocalAuthoringPackage();
    const documents = new Map(admittedDocuments(packageReceipt).map(row => [row.path, row.value]));
    const ir = compileAuthoringIR(packageReceipt, buildAdmittedSchemaValidators(packageReceipt).validators);
    const corpus = documents.get(prefix + 'graphs-v2.json');
    cache = { packageReceipt, ir, documents, corpus };
    return cache;
}

test('N02G:PATH-V2-001 schema sites preserve recursive locations and literals never become references', () => {
    const { enumeratePathSites } = require('../../../src/next/provenance/pathMutationInventory');
    const schema = JSON.parse(fs.readFileSync(path.join(root, prefix + 'provenance-graph.schema.json'), 'utf8'));
    assert.deepEqual(enumeratePathSites(schema, { literal: { type: 'id', value: 'source' } }, 0), []);
    const value = { template: { id: 'outer', version: 1, hash: 'sha256:' + '0'.repeat(64) }, bindings: {
        nested: { template: { id: 'inner', version: 1, hash: 'sha256:' + '0'.repeat(64) }, bindings: {
            a: { selector: { kind: 'event', segments: ['date'] } },
            b: { selector: { kind: 'event', segments: ['date'] } }
        } }
    } };
    const sites = enumeratePathSites(schema, value, 1);
    assert.equal(sites.filter(row => row.class === 'path').length, 2);
    assert.equal(sites.filter(row => row.class === 'reference').length, 2);
    assert.equal(new Set(sites.map(row => JSON.stringify(row.site_path))).size, 4);
    assert.throws(() => enumeratePathSites(schema, { invented: 'value' }, 0));
    assert.throws(() => enumeratePathSites(schema, { partial_policy: value.template }, 0), /namespace/);
    let effects = 0;
    const active = {}; Object.defineProperty(active, 'literal', { enumerable: true, get() { effects++; } });
    assert.throws(() => enumeratePathSites(schema, active, 0));
    assert.throws(() => enumeratePathSites(schema, new Proxy({}, { ownKeys() { effects++; return []; } }), 0));
    assert.equal(effects, 0);
});

test('N02G:PATH-V2-002 candidate inventory agrees with all authored/IR sites without activating or granting credit', async () => {
    const { enumeratePathInventoryCandidate } = require('../../../src/next/provenance/pathMutationInventory');
    const { packageReceipt, ir } = await fixture();
    const result = enumeratePathInventoryCandidate({ packageReceipt, ir });
    assert.equal(result.activated, false);
    assert.equal(result.mutation_acceptance, false);
    assert.equal(result.executed, 0);
    assert.equal(result.matched, 0);
    assert.equal(result.requirements.length, result.sites.length + result.applicability.filter(row => row.path_semantic_required).length);
    assert.equal(new Set(result.requirements.map(row => row.mutation_id)).size, result.requirements.length);
    assert.ok(result.applicability.some(row => row.path_sites === 0));
    assert.ok(result.requirements.every(row => row.realization === 'UNSATISFIED_MUTATION_WITNESS'));
    for (const mutate of [copy => copy.graphs[0].predicates.pop(),
        copy => copy.graphs[0].predicates[0].op = 'not_eq',
        copy => copy.graphs[0].predicates[0].operands[0].expression = { kind: 'node_ref', alias: 'forged' },
        copy => copy.graphs[0].predicates[0].operands[0].type = { form: 'scalar', type: 'forged' },
        copy => copy.authority_refs.pop()]) {
        const broken = structuredClone(ir); mutate(broken);
        assert.throws(() => enumeratePathInventoryCandidate({ packageReceipt, ir: broken }));
    }
});

test('N02G:PATH-V2-003 migration is equal to the frozen v1 set and rejects same-count replacement, forged targets and orphans', async () => {
    const { enumeratePathInventoryCandidate, materializePathMigration } = require('../../../src/next/provenance/pathMutationInventory');
    const { packageReceipt, ir } = await fixture();
    const candidate = enumeratePathInventoryCandidate({ packageReceipt, ir });
    const file = path.join(root, 'docs/audit-evidence/n02g-causal-authoring-profile/path-inventory-v1-frozen.json');
    const bytes = fs.readFileSync(file);
    const authority = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
    const frozen = JSON.parse(bytes);
    const input = { packageReceipt, ir, frozenSource: bytes.toString('utf8'), expectedFrozenHash: authority,
        frozenAuthorshipSource: fs.readFileSync(path.join(root, 'docs/audit-evidence/n02g-causal-authoring-profile/path-authorship-v1-frozen.json'), 'utf8') };
    const result = materializePathMigration(input);
    assert.equal(result.rows.length, frozen.requirements.length);
    assert.deepEqual(result.rows.map(row => row.old_id).sort(), frozen.requirements.map(row => row.mutation_id).sort());
    assert.equal(result.activated, false);
    assert.equal(result.executed, 0);
    assert.equal(result.matched, 0);
    assert.equal(result.introduced_sites.length, 0);
    const newIds = new Set(candidate.requirements.map(row => row.mutation_id));
    assert.ok(result.rows.every(row => row.new_ids.every(id => newIds.has(id))));
    for (const mutate of [copy => copy.requirements[0].mutation_id = 'sha256:' + 'f'.repeat(64),
        copy => copy.requirements[0].target.operand_index += 1,
        copy => copy.requirements[0] = copy.requirements[1], copy => copy.requirements.pop()]) {
        const broken = structuredClone(frozen); mutate(broken);
        const source = JSON.stringify(broken);
        assert.throws(() => materializePathMigration({ ...input, frozenSource: source,
            expectedFrozenHash: 'sha256:' + createHash('sha256').update(source).digest('hex') }));
    }
    assert.throws(() => materializePathMigration({ ...input, expectedFrozenHash: 'sha256:' + 'f'.repeat(64) }));
});

test('N02G:PATH-V2-004 persisted migration cannot forge credit, drop rows or redirect mapped IDs', async () => {
    const { materializePathMigration, verifyMaterializedPathMigration, FROZEN_V1_HASH } = require('../../../src/next/provenance/pathMutationInventory');
    const { packageReceipt, ir } = await fixture();
    const input = { packageReceipt, ir, expectedFrozenHash: FROZEN_V1_HASH,
        frozenSource: fs.readFileSync(path.join(root, 'docs/audit-evidence/n02g-causal-authoring-profile/path-inventory-v1-frozen.json'), 'utf8'),
        frozenAuthorshipSource: fs.readFileSync(path.join(root, 'docs/audit-evidence/n02g-causal-authoring-profile/path-authorship-v1-frozen.json'), 'utf8') };
    const table = materializePathMigration(input);
    const check = value => verifyMaterializedPathMigration({ ...input, migrationSource: JSON.stringify(value) });
    assert.equal(check(table).verified, true);
    for (const mutate of [copy => copy.rows.pop(), copy => copy.rows[0].execution_credit = 1,
        copy => copy.rows.find(row => row.new_ids.length).new_ids[0] = 'sha256:' + 'f'.repeat(64)]) {
        const broken = structuredClone(table); mutate(broken); assert.throws(() => check(broken), /persisted_migration/);
    }
});

test('N02G:PATH-V2-005 each admission site changes exactly one authored leaf and cloned receipts have no authority', async () => {
    const { enumeratePathInventoryCandidate, materializePathAdmissionCandidate, readPathAdmissionCandidate } = require('../../../src/next/provenance/pathMutationInventory');
    const { packageReceipt, ir, corpus } = await fixture();
    const inventoryCandidate = enumeratePathInventoryCandidate({ packageReceipt, ir });
    const representatives = new Map();
    for (const row of inventoryCandidate.requirements.filter(row => row.family !== 'predicate_path_semantic')) {
        const key = JSON.stringify([row.family, row.target.definition, row.target.namespace,
            row.target.site_path.slice(2, -1)]);
        if (!representatives.has(key)) representatives.set(key, row);
    }
    assert.ok(representatives.size > 8);
    for (const row of representatives.values()) {
        const generated = materializePathAdmissionCandidate({ inventoryCandidate, mutation_id: row.mutation_id });
        const expected = structuredClone(corpus.graphs.find(graph => graph.fact_key === row.target.fact_key));
        let slot = expected.predicates.find(predicate => predicate.id === row.target.predicate_id);
        for (const token of row.target.site_path.slice(0, -1)) slot = slot[token];
        slot[row.target.site_path.at(-1)] = generated.patch.after;
        assert.deepEqual(generated.graph, expected);
        assert.equal(generated.dp_execution, false); assert.equal(generated.semantic_mutation_credit, 0);
        assert.ok(readPathAdmissionCandidate(generated));
        assert.equal(readPathAdmissionCandidate(structuredClone(generated)), null);
        assert.throws(() => materializePathAdmissionCandidate({ inventoryCandidate: structuredClone(inventoryCandidate), mutation_id: row.mutation_id }));
    }
    const semantic = inventoryCandidate.requirements.find(row => row.family === 'predicate_path_semantic');
    assert.throws(() => materializePathAdmissionCandidate({ inventoryCandidate, mutation_id: semantic.mutation_id }));
});

test('N02G:PATH-V2-006 native controls reject representative namespaces and exact sites without semantic credit', async () => {
    const { enumeratePathInventoryCandidate, materializePathAdmissionCandidate } = require('../../../src/next/provenance/pathMutationInventory');
    const { createPathAdmissionValidation } = await import('../../../scripts/agent/executePathAdmissionV2.mjs');
    const { packageReceipt, ir } = await fixture();
    const inventoryCandidate = enumeratePathInventoryCandidate({ packageReceipt, ir });
    const qualify = createPathAdmissionValidation(packageReceipt);
    const samples = new Map();
    for (const requirement of inventoryCandidate.requirements.filter(row => row.family !== 'predicate_path_semantic')) {
        const key = JSON.stringify([requirement.family, requirement.target.definition, requirement.target.namespace,
            requirement.target.site_path.slice(2, -1)]);
        if (!samples.has(key)) samples.set(key, requirement);
    }
    for (const row of samples.values()) {
        const generated = materializePathAdmissionCandidate({ inventoryCandidate, mutation_id: row.mutation_id });
        const result = qualify(generated);
        assert.equal(result.matched, true, JSON.stringify(result));
        assert.equal(result.restore_admitted, true);
        assert.equal(result.dp_execution, false); assert.equal(result.semantic_mutation_credit, 0);
        assert.notDeepEqual(result.diagnostic, { ...result.expected_diagnostic, operand_index: result.expected_diagnostic.operand_index + 1 });
        assert.throws(() => qualify(structuredClone(generated)), /candidate_authority/);
    }
});

test('N02G:PATH-V2-007 new authored predicate adds v2 requirements and introductions without rewriting frozen v1', async () => {
    const { enumeratePathInventoryCandidate, materializePathMigration, FROZEN_V1_HASH } = require('../../../src/next/provenance/pathMutationInventory');
    const { admittedDocuments, admitPackage } = require('../../../src/next/provenance/packageContract');
    const { packageReceipt, ir, corpus } = await fixture();
    const baseline = enumeratePathInventoryCandidate({ packageReceipt, ir });
    const chosen = baseline.applicability.find(row => row.path_semantic_required);
    const graph = corpus.graphs.find(row => row.fact_key === chosen.fact_key);
    const predicate = graph.predicates.find(row => row.id === chosen.predicate_id);
    const grown = structuredClone(corpus);
    grown.graphs.find(row => row.fact_key === chosen.fact_key).predicates.push({ ...structuredClone(predicate), id: 'v2_growth_probe' });
    const entries = admittedDocuments(packageReceipt).map(row => ({ path: row.path, bytes: Buffer.from(
        row.path === prefix + 'graphs-v2.json' ? JSON.stringify(grown) : fs.readFileSync(path.join(root, row.path), 'utf8').replaceAll('\r\n', '\n')) }));
    const package2 = admitPackage({ entries, authority: entries.map(row => ({ path: row.path,
        sha256: 'sha256:' + createHash('sha256').update(row.bytes).digest('hex') })) });
    const ir2 = structuredClone(ir);
    ir2.authority_refs = admittedDocuments(package2).map(({ path, sha256 }) => ({ path, sha256 }));
    const lowered = ir2.graphs.find(row => row.fact_key === chosen.fact_key);
    lowered.predicates.push({ ...structuredClone(lowered.predicates.find(row => row.id === chosen.predicate_id)), id: 'v2_growth_probe' });
    const candidate = enumeratePathInventoryCandidate({ packageReceipt: package2, ir: ir2 });
    assert.ok(candidate.requirements.length > baseline.requirements.length);
    const evidence = path.join(root, 'docs/audit-evidence/n02g-causal-authoring-profile');
    const table = materializePathMigration({ packageReceipt: package2, ir: ir2, expectedFrozenHash: FROZEN_V1_HASH,
        frozenSource: fs.readFileSync(path.join(evidence, 'path-inventory-v1-frozen.json'), 'utf8'),
        frozenAuthorshipSource: fs.readFileSync(path.join(evidence, 'path-authorship-v1-frozen.json'), 'utf8') });
    assert.equal(table.rows.length, 45988);
    assert.ok(table.introduced_sites.length > 0);
    assert.ok(table.introduced_requirements.some(row => row.family === 'predicate_path_semantic'));
    assert.equal(table.executed, 0); assert.equal(table.matched, 0);
});
