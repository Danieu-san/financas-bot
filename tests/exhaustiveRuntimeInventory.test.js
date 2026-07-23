const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
    extractImports,
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

test('package file references include operational config and JavaScript entrypoints', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const references = packageFileReferences(packageJson);
    assert.ok(references.some(reference => reference.script === 'start' && reference.file === 'index.js'));
    assert.ok(references.some(reference => reference.script === 'pm2:start' && reference.file === 'ecosystem.config.js'));
});

test('inventory accounts for every source module without silently dropping graph gaps', () => {
    const inventory = runInventory();
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
    for (const module of inventory.modules) {
        assert.ok(['runtime', 'operational_only', 'test_only', 'unreferenced'].includes(module.classification));
        assert.strictEqual(module.test_reachable, module.covering_test_count > 0);
    }
});
