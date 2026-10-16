'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const Module = require('node:module');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { admitPackage } = require('../../../src/next/provenance/packageContract');

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

test('N02G:SCHEMA-004 admitted validators use measured schema contents without disk fallback or forged callbacks', async () => {
    const builder = await import(pathToFileURL(path.resolve(__dirname, '../../../scripts/agent/buildNextProvenanceArtifacts.mjs')));
    const prefix = 'docs/contracts/next/provenance-v2/';
    const baseline = builder.buildSchemaValidators();
    const entries = baseline.schemaHashes.map(row => ({ path: row.path,
        bytes: fs.readFileSync(path.resolve(__dirname, '../../..', row.path)) }));
    const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    const admit = rows => admitPackage({ entries: rows, authority: rows.map(row => ({ path: row.path, sha256: sha(row.bytes) })) });
    const original = admit(entries);
    const built = builder.buildAdmittedSchemaValidators(original);
    assert.deepEqual(built.schemaHashes, baseline.schemaHashes);
    assert.equal(built.code, baseline.code);
    assert.throws(() => builder.buildAdmittedSchemaValidators({ ...original }), /not_admitted/);
    assert.throws(() => builder.buildAdmittedSchemaValidators(admit(entries.slice(1))), /admitted_schema_missing/);
    const snapshotPath = prefix + 'evidence-snapshot.schema.json';
    const schema = JSON.parse(entries.find(row => row.path === snapshotPath).bytes);
    // Deliberately synthetic schema: proves the compiler consumes the admitted
    // bytes, not the on-disk schema. It is never a financial domain ratification.
    schema.definitions.payload_budget.properties.evidence_state.enum.push('synthetic_alternative');
    const changed = entries.map(row => row.path === snapshotPath
        ? { path: row.path, bytes: Buffer.from(JSON.stringify(schema)) } : row);
    const alternate = builder.buildAdmittedSchemaValidators(admit(changed));
    assert.notEqual(alternate.schemaHashes.find(row => row.path === snapshotPath).sha256,
        baseline.schemaHashes.find(row => row.path === snapshotPath).sha256);
    const source = require('../../../docs/contracts/next/provenance-v2/snapshot-manifest-v1.json').snapshots.find(row => row.kind === 'budget');
    const { ref_id, kind, version, payload } = structuredClone(source);
    payload.evidence_state = 'synthetic_alternative';
    const envelope = { ref_id, kind, version, payload };
    assert.equal(built.validators.snapshot(envelope), false);
    assert.equal(alternate.validators.snapshot(envelope), true);
});

test('N02G:SCHEMA-005 string uniqueness rejects prototype names in normal admitted and standalone validators', async () => {
    const builder = await import(pathToFileURL(path.resolve(__dirname, '../../../scripts/agent/buildNextProvenanceArtifacts.mjs')));
    const baseline = builder.buildSchemaValidators();
    const entries = baseline.schemaHashes.map(row => ({ path: row.path,
        bytes: fs.readFileSync(path.resolve(__dirname, '../../..', row.path)) }));
    const beforeSchemas = entries.map(row => row.bytes.toString('hex'));
    const packageReceipt = admitPackage({ entries, authority: entries.map(row => ({ path: row.path,
        sha256: `sha256:${createHash('sha256').update(row.bytes).digest('hex')}` })) });
    const source = require('../../../docs/contracts/next/provenance-v2/evaluator-contracts/source_coverage.json');
    const cases = [
        { values: ['complete', 'partial', 'unavailable'], valid: true },
        { values: ['__proto__'], valid: true },
        { values: ['__proto__', 'constructor', 'toString', 'hasOwnProperty'], valid: true },
        { values: ['__proto__', '__proto__'], valid: false },
        { values: ['complete', '__proto__', 'partial', '__proto__'], valid: false },
        { values: ['constructor', 'constructor'], valid: false },
        { values: ['toString', 'toString'], valid: false },
        { values: ['complete', 'complete'], valid: false },
        { values: ['\u03a9', '\u03a9'], valid: false },
        { values: ['1', '01'], valid: true },
        { values: ['', ''], valid: false }
    ];
    for (const [origin, built] of [['normal', baseline], ['admitted', builder.buildAdmittedSchemaValidators(packageReceipt)]]) {
        const filename = path.resolve(__dirname, `../../../logs/schema-uniqueness-${origin}-test.cjs`);
        const compiled = new Module(filename, module);
        compiled.filename = filename; compiled.paths = module.paths;
        compiled._compile(built.code, filename); // Trusted BUILD output, in memory only.
        for (const [mode, validate] of [['compiled', built.validators.evaluator], ['standalone', compiled.exports.evaluator]]) {
            for (const row of cases) {
                const value = structuredClone(source);
                value.signature.output.enum_values = row.values.slice();
                const before = JSON.stringify(value);
                const valid = validate(value);
                assert.equal(JSON.stringify(value), before, `${origin}/${mode}: input mutation`);
                assert.equal(valid, row.valid, `${origin}/${mode}: ${JSON.stringify(row.values)}`);
                if (!row.valid) assert.ok(validate.errors.some(error => error.keyword === 'uniqueItems'));
            }
            const wrongType = structuredClone(source);
            wrongType.signature.output.enum_values = [1, 2];
            assert.equal(validate(wrongType), false);
            assert.ok(validate.errors.some(error => error.keyword === 'type'));
        }
    }
    assert.deepEqual(entries.map(row => row.bytes.toString('hex')), beforeSchemas);
});

test('N02G:SCHEMA-006 uniqueness fallback preserves keyword false and other admitted item types', async () => {
    const builder = await import(pathToFileURL(path.resolve(__dirname, '../../../scripts/agent/buildNextProvenanceArtifacts.mjs')));
    const baseline = builder.buildSchemaValidators();
    const entries = baseline.schemaHashes.map(row => ({ path: row.path,
        bytes: fs.readFileSync(path.resolve(__dirname, '../../..', row.path)) }));
    const schemaPath = 'docs/contracts/next/provenance-v2/evaluator-contract.schema.json';
    const source = require('../../../docs/contracts/next/provenance-v2/evaluator-contracts/source_coverage.json');
    // Synthetic admitted schemas exercise existing keyword semantics, not a
    // financial-domain change or authority for guest execution.
    for (const [label, items, uniqueItems, cases] of [
        ['string-array-type', { type: ['string'] }, true, [[['__proto__', '__proto__'], false], [['__proto__', 'other'], true]]],
        ['disabled', { type: 'string' }, false, [[['__proto__', '__proto__'], true], [['same', 'same'], true]]],
        ['mixed', { type: ['string', 'integer'] }, true, [[['1', 1], true], [[1, 1], false], [['__proto__', '__proto__'], false]]],
        ['integer', { type: 'integer' }, true, [[[1, 2], true], [[1, 1], false], [['1', 1], false]]],
        ['object', { type: 'object' }, true, [[[{ a: 1 }, { a: 1 }], false], [[{ a: 1 }, { a: 2 }], true]]]
    ]) {
        const schema = JSON.parse(entries.find(row => row.path === schemaPath).bytes);
        Object.assign(schema.properties.signature.properties.output.properties.enum_values, { items, uniqueItems });
        const schemaBefore = JSON.stringify(schema);
        const changed = entries.map(row => row.path === schemaPath
            ? { path: row.path, bytes: Buffer.from(schemaBefore) } : row);
        const receipt = admitPackage({ entries: changed, authority: changed.map(row => ({ path: row.path,
            sha256: `sha256:${createHash('sha256').update(row.bytes).digest('hex')}` })) });
        const built = builder.buildAdmittedSchemaValidators(receipt);
        const filename = path.resolve(__dirname, '../../../logs/schema-keyword-profile-test.cjs');
        const compiled = new Module(filename, module);
        compiled.filename = filename; compiled.paths = module.paths;
        compiled._compile(built.code, filename);
        for (const [mode, validate] of [['compiled', built.validators.evaluator], ['standalone', compiled.exports.evaluator]]) {
            for (const [values, expected] of cases) {
                const value = structuredClone(source);
                value.signature.output.enum_values = structuredClone(values);
                const before = JSON.stringify(value);
                assert.equal(validate(value), expected, `${label}/${mode}: ${JSON.stringify(values)}`);
                assert.equal(JSON.stringify(value), before);
            }
        }
        assert.equal(JSON.stringify(schema), schemaBefore);
        assert.equal(changed.find(row => row.path === schemaPath).bytes.toString('utf8'), schemaBefore);
    }
});
