'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const Module = require('node:module');

test('N02G:SCHEMA-001 all authored documents validate without mutation', async () => {
    const builder = await import(pathToFileURL(path.resolve(__dirname, '../../../scripts/agent/buildNextProvenanceArtifacts.mjs')));
    const built = builder.buildSchemaValidators();
    const docs = require('../../../docs/contracts/next/provenance-v2/graphs-v2.json');
    const before = JSON.stringify(docs);
    assert.equal(built.validators.graphs(docs), true, JSON.stringify(built.validators.graphs.errors));
    assert.equal(JSON.stringify(docs), before);
    for (const [name, file] of [
        ['claims', 'claims-v2.json'], ['registry', 'metric-evaluator-registry-v1.json'],
        ['witnesses', 'evaluator-witness-contracts-v1.json']
    ]) assert.equal(built.validators[name](require('../../../docs/contracts/next/provenance-v2/' + file)), true, name);
    const registry = require('../../../docs/contracts/next/provenance-v2/metric-evaluator-registry-v1.json');
    for (const entry of registry.entries) {
        const value = require(path.resolve(__dirname, '../../..', entry.contract_path));
        assert.equal(built.validators.evaluator(value), true, entry.evaluator_id);
    }
    const manifest = require('../../../docs/contracts/next/provenance-v2/snapshot-manifest-v1.json');
    for (const snapshot of manifest.snapshots) {
        // The schema describes this envelope; manifest authorship/fingerprint
        // fields are separate compile checks, not fields of the evidence API.
        const { ref_id, kind, version, payload } = snapshot;
        const envelope = { ref_id, kind, version, payload };
        assert.equal(built.validators.snapshot(envelope), true,
            `${snapshot.ref_id}: ${JSON.stringify(built.validators.snapshot.errors?.slice(0, 2))}`);
    }
    assert.equal(built.code, builder.buildSchemaValidators().code);
    assert.equal(built.schemaHashes.length, 6);
});

test('N02G:SCHEMA-002 closed shape, types and trace restrictions fail', async () => {
    const { buildSchemaValidators } = await import(pathToFileURL(path.resolve(__dirname, '../../../scripts/agent/buildNextProvenanceArtifacts.mjs')));
    const { validators } = buildSchemaValidators();
    const source = require('../../../docs/contracts/next/provenance-v2/graphs-v2.json');
    for (const mutate of [
        g => { g.unknown = true; },
        g => { g.graphs[0].trace_contract.result = 1200; },
        g => { g.graphs[0].predicates[0].op = 'eval'; },
        g => { g.graphs[0].trace_contract.derivation.required_reads = 'all'; }
    ]) {
        const copy = structuredClone(source); mutate(copy);
        assert.equal(validators.graphs(copy), false);
    }
    const original = require('../../../docs/contracts/next/provenance-v2/snapshot-manifest-v1.json').snapshots.find(s => s.kind === 'card');
    for (const value of [32, '15', 0]) {
        const { ref_id, kind, version, payload } = structuredClone(original);
        const envelope = { ref_id, kind, version, payload };
        envelope.payload.closing_day = value;
        assert.equal(validators.snapshot(envelope), false, `closing_day=${value}`);
    }
    const witness = structuredClone(require('../../../docs/contracts/next/provenance-v2/evaluator-witness-contracts-v1.json'));
    for (const w of witness.witnesses) {
        delete w.expected; delete w.mutated_result; delete w.expected_violation;
    }
    assert.equal(validators.witnesses(witness), false);
});

test('N02G:SCHEMA-003 emitted static validators execute with the same restrictions', async () => {
    const { buildSchemaValidators } = await import(pathToFileURL(path.resolve(__dirname, '../../../scripts/agent/buildNextProvenanceArtifacts.mjs')));
    const { code } = buildSchemaValidators();
    // Trusted build output, not evaluator isolation. This does not claim a sandbox.
    const filename = path.resolve(__dirname, '../../../logs/schema-build-test.cjs');
    const compiled = new Module(filename, module);
    compiled.filename = filename;
    compiled.paths = module.paths;
    compiled._compile(code, filename);
    const validators = compiled.exports;
    assert.deepEqual(Object.keys(validators).sort(), ['claims', 'evaluator', 'graphs', 'registry', 'snapshot', 'witnesses']);
    const graphs = structuredClone(require('../../../docs/contracts/next/provenance-v2/graphs-v2.json'));
    assert.equal(validators.graphs(graphs), true);
    graphs.graphs[0].trace_contract.result = 1;
    assert.equal(validators.graphs(graphs), false);
    const claims = structuredClone(require('../../../docs/contracts/next/provenance-v2/claims-v2.json'));
    assert.equal(validators.claims(claims), true);
    claims.claims[0].period = { kind: 'date', value: '2042-02-30' };
    assert.equal(validators.claims(claims), false);
});
