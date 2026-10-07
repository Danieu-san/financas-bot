const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
    extractImports,
    scanImports,
    resolveImport,
    expandPackageScripts,
    packageFileReferences,
    runInventory
} = require('../scripts/runExhaustiveRuntimeInventory');

const ROOT = path.resolve(__dirname, '..');

test('extractImports classifies CommonJS, ESM and literal dynamic imports', () => {
    assert.deepStrictEqual(extractImports(`
        const one = require('./one');
        import two from './two.js';
        const three = import('./three.mjs');
    `), ['./one', './two.js', './three.mjs']);
});

test('AST import inventory separates emitted code text from executed template expressions', () => {
    const source = [
        "// require('./comment-only');",
        "const literal = \"require('./quoted-only')\";",
        "const generated = `const c = require('./generated-only'); ${require('./expression.cjs')}`;",
        "export { item } from './exported.mjs';",
        "const loaded = import('./loaded.js');",
        "const dynamic = require(variable);"
    ].join('\n');
    assert.deepStrictEqual(extractImports(source), ['./expression.cjs', './exported.mjs', './loaded.js']);
    assert.strictEqual(scanImports(source).dynamic, true);
    assert.strictEqual(scanImports('const text = `require(variable)`;').dynamic, false);
    assert.throws(() => extractImports('const broken = ;'), /Unexpected token/);
});

test('relative CJS modules resolve without dropping the executable extension', () => {
    const fs = require('node:fs'); const os = require('node:os');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-import-inventory-'));
    const entry = path.join(temp, 'entry.js'); const child = path.join(temp, 'child.cjs');
    fs.writeFileSync(child, 'module.exports = {};');
    assert.strictEqual(resolveImport(entry, './child'), null);
    assert.strictEqual(resolveImport(entry, './child.cjs'), child);
    assert.strictEqual(resolveImport(entry, './missing.cjs'), null);
});

test('default test script expansion follows npm run dependencies', () => {
    const expanded = expandPackageScripts({
        scripts: {
            pretest: 'npm run phase:a && npm run phase:b',
            test: 'node --test tests/main.test.js',
            'phase:a': 'node --test tests/a.test.js',
            'phase:b': 'npm run phase:c',
            'phase:c': 'node --test tests/c.test.js'
        }
    }, ['pretest', 'test']);
    assert.deepStrictEqual(expanded, ['phase:a', 'phase:b', 'phase:c', 'pretest', 'test']);
});

test('package file references include JavaScript entrypoints and all references exist', async () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const references = packageFileReferences(packageJson);
    assert.ok(references.some(reference => reference.script === 'start' && reference.file === 'index.js'));
    assert.deepStrictEqual((await runInventory()).missing_package_references, []);
});

test('inventory accounts for every source module without silently dropping graph gaps', async () => {
    const inventory = await runInventory();
    assert.strictEqual(inventory.scope.runtime_root, 'index.js');
    assert.ok(inventory.scope.source_files > 0);
    assert.strictEqual(inventory.modules.length, inventory.scope.source_files);
    assert.strictEqual(new Set(inventory.modules.map(module => module.file)).size, inventory.scope.source_files);
    assert.ok(inventory.scope.test_entry_files >= inventory.scope.default_test_files);
    assert.ok(inventory.scope.test_entry_files >= inventory.scope.registered_test_files);
    assert.strictEqual(inventory.exhaustive_local_runner_is_default, true);
    assert.deepStrictEqual(inventory.outside_default_test_files, ['tests/whatsapp-real-e2e.test.js']);
    assert.strictEqual(
        Object.values(inventory.classification_counts).reduce((sum, count) => sum + count, 0),
        inventory.scope.source_files
    );
    assert.deepStrictEqual(inventory.unresolved_product_imports, []);
    assert.strictEqual(inventory.captured_only_relative_imports.length, 3);
    const captured = inventory.captured_only_relative_imports.find(row => row.from === 'src/next/provenance/validationTcbEntry.js');
    assert.strictEqual(captured.from, 'src/next/provenance/validationTcbEntry.js');
    assert.strictEqual(captured.specifier, '../vendor/schemaValidators');
    assert.strictEqual(captured.target, 'vendor/schemaValidators.js');
    assert.strictEqual(captured.resolution, 'closed-byte-table-only');
    assert.strictEqual(captured.ambient_module_available, false);
    assert.strictEqual(captured.financial_acceptance, false);
    assert.strictEqual(captured.reviewed_source_admission, false);
    for (const key of ['source_sha256', 'target_sha256', 'artifact_root']) assert.match(captured[key], /^sha256:[a-f0-9]{64}$/);
    for (const [from, specifier] of [
        ['src/next/provenance/selectedEventDayProofHost.js', './selectedDayCapturedProofRecipe'],
        ['src/next/provenance/selectedEventDayAdjudicator.js', './selectedDayCapturedAdjudicationRecipe']
    ]) {
        const row = inventory.captured_only_relative_imports.find(edge => edge.from === from && edge.specifier === specifier);
        assert.ok(row); assert.equal(resolveImport(path.join(ROOT, from), specifier), null);
        assert.equal(row.financial_acceptance, false); assert.equal(row.reviewed_source_admission, false);
        for (const key of ['source_sha256', 'target_sha256', 'artifact_root']) assert.match(row[key], /^sha256:[a-f0-9]{64}$/);
    }
    for (const module of inventory.modules) {
        assert.ok(['runtime', 'operational_only', 'test_only', 'unreferenced'].includes(module.classification));
        assert.strictEqual(module.test_reachable, module.covering_test_count > 0);
    }
});

test('captured-only import accounting refuses forged roots, drift, ambient reachability and unmatched edges', async () => {
    const { captureImportCertificate, accountCapturedImports } = require('../scripts/agent/capturedImportInventory.cjs');
    const certificate = await captureImportCertificate();
    const edge = { from: 'src/next/provenance/validationTcbEntry.js', specifier: '../vendor/schemaValidators' };
    const input = { unresolved: [edge], certificate, readSource: file => fs.readFileSync(path.join(ROOT, file)), ambientReachable: () => false };
    assert.strictEqual(accountCapturedImports(input).captured.length, 1);
    for (const fake of [{}, { ...certificate }, structuredClone(certificate)])
        assert.throws(() => accountCapturedImports({ ...input, certificate: fake }), /captured_import_inventory_certificate/);
    for (const change of [{ readSource: () => Buffer.from('module.exports = {};') },
        { ambientReachable: () => true }, { unresolved: [{ ...edge, specifier: '../vendor/unknown' }] },
        { unresolved: [{ ...edge, from: 'src/other.js' }] }]) {
        const result = accountCapturedImports({ ...input, ...change });
        assert.strictEqual(result.captured.length, 0); assert.strictEqual(result.remaining.length, 1);
    }
});

test('captured-only certificate composes genuine bundle recipes and fails closed for every resolved edge', async () => {
    const { captureImportCertificate, accountCapturedImports } = require('../scripts/agent/capturedImportInventory.cjs');
    const cp = require('node:child_process');
    const originals = { spawn: cp.spawn, spawnSync: cp.spawnSync }; let spawns = 0, certificate;
    try {
        for (const key of Object.keys(originals)) cp[key] = () => { spawns++; throw new Error('inventory_must_not_spawn'); };
        certificate = await captureImportCertificate();
    } finally { for (const [key, value] of Object.entries(originals)) cp[key] = value; }
    assert.equal(spawns, 0); assert.equal(certificate.artifact_roots.length, 3);
    const edges = [
        { from: 'src/next/provenance/validationTcbEntry.js', specifier: '../vendor/schemaValidators' },
        { from: 'src/next/provenance/selectedEventDayProofHost.js', specifier: './selectedDayCapturedProofRecipe' },
        { from: 'src/next/provenance/selectedEventDayAdjudicator.js', specifier: './selectedDayCapturedAdjudicationRecipe' }
    ];
    const input = { unresolved: edges, certificate, readSource: file => fs.readFileSync(path.join(ROOT, file)), ambientReachable: () => false };
    const result = accountCapturedImports(input);
    assert.equal(result.captured.length, edges.length); assert.deepEqual(result.remaining, []);
    assert.equal(new Set(result.captured.map(row => row.artifact_root)).size, 3);
    for (const edge of edges) {
        const scoped = { ...input, unresolved: [edge] };
        for (const change of [{ readSource: () => Buffer.from('module.exports={};') },
            { ambientReachable: () => true }, { unresolved: [{ ...edge, specifier: edge.specifier + '-unknown' }] },
            { unresolved: [{ ...edge, from: 'src/unknown.js' }] }]) {
            const rejected = accountCapturedImports({ ...scoped, ...change });
            assert.equal(rejected.captured.length, 0); assert.equal(rejected.remaining.length, 1);
        }
    }
    for (const clone of [{ ...certificate }, structuredClone(certificate)])
        assert.throws(() => accountCapturedImports({ ...input, certificate: clone }), /captured_import_inventory_certificate/);
});
