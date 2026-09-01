'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const policy = require('../../scripts/agent/financasBotNext01ValidationPolicy');

function sourceFixture(contents, relativePath = 'probe.js') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'next01-validator-'));
    const nextRoot = path.join(root, 'src', 'next');
    const file = path.join(nextRoot, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
    return { root, nextRoot, file };
}

test('NEXT01:N01-VALIDATOR-001 validator rejects legacy and dynamic module loading', () => {
    const legacy = sourceFixture("require('../openFinance/openFinanceAlertOutbox');\n");
    const dynamic = sourceFixture("const name = '../contracts/reuseManifest'; require(name);\n");
    const alternateLoaders = [
        "require?.('node:fs');\n",
        "Reflect.apply(require, null, ['node:fs']);\n",
        "process.getBuiltinModule('node:fs');\n",
        "process['get' + 'BuiltinModule']('node:fs');\n",
        "require('node:module').createRequire(__filename)('node:fs');\n",
        "Function('return require')()('node:fs');\n",
        "globalThis.process.getBuiltinModule('node:fs');\n",
        "({}).constructor.constructor('return require')()('node:fs');\n"
    ].map(source => sourceFixture(source));
    const allowedImportBindingEscapes = [
        "const X = require('node:module'); X._load('node:fs');\n",
        "const { _load } = require('node:module'); _load('node:fs');\n"
    ].map(source => sourceFixture(source, 'replay/hermeticReplayRunner.js'));
    try {
        assert.deepStrictEqual(policy.validateSourceInventory({
            expectedPaths: ['allowed.js'],
            discoveredPaths: ['allowed.js', 'escape.mjs', 'escape.cjs']
        }).errors, [
            'unexpected_executable_source:escape.cjs',
            'unexpected_executable_source:escape.mjs'
        ]);
        assert.ok(policy.analyzeNextSourceFiles({
            nextRoot: legacy.nextRoot,
            sourceFiles: [legacy.file]
        }).errors.includes('relative_import_outside_next:probe.js:../openFinance/openFinanceAlertOutbox'));
        assert.ok(policy.analyzeNextSourceFiles({
            nextRoot: dynamic.nextRoot,
            sourceFiles: [dynamic.file]
        }).errors.includes('unclassified_module_loader:probe.js'));
        for (const fixture of alternateLoaders) {
            assert.ok(policy.analyzeNextSourceFiles({
                nextRoot: fixture.nextRoot,
                sourceFiles: [fixture.file]
            }).errors.includes('unclassified_module_loader:probe.js'));
        }
        for (const fixture of allowedImportBindingEscapes) {
            assert.ok(policy.analyzeNextSourceFiles({
                nextRoot: fixture.nextRoot,
                sourceFiles: [fixture.file]
            }).errors.includes('unclassified_module_loader:replay/hermeticReplayRunner.js'));
        }

        const realpathEscape = sourceFixture("require('./dependency');\n");
        fs.writeFileSync(path.join(realpathEscape.nextRoot, 'dependency.js'), 'module.exports = {};\n');
        assert.ok(policy.analyzeNextSourceFiles({
            nextRoot: realpathEscape.nextRoot,
            sourceFiles: [realpathEscape.file],
            realpath: value => value.endsWith('dependency.js')
                ? path.join(realpathEscape.root, 'outside.js')
                : path.resolve(value)
        }).errors.includes('relative_import_realpath_outside_next:probe.js:./dependency'));
        fs.rmSync(realpathEscape.root, { recursive: true, force: true });
    } finally {
        fs.rmSync(legacy.root, { recursive: true, force: true });
        fs.rmSync(dynamic.root, { recursive: true, force: true });
        for (const fixture of alternateLoaders) {
            fs.rmSync(fixture.root, { recursive: true, force: true });
        }
        for (const fixture of allowedImportBindingEscapes) {
            fs.rmSync(fixture.root, { recursive: true, force: true });
        }
    }
});

test('NEXT01:N01-VALIDATOR-002 validator rejects direct effect capabilities', () => {
    const fixture = sourceFixture(
        "const fs = require('node:fs'); fs.writeFileSync('/tmp/next01', 'x');\n"
    );
    try {
        const result = policy.analyzeNextSourceFiles({
            nextRoot: fixture.nextRoot,
            sourceFiles: [fixture.file]
        });
        assert.ok(result.errors.includes('forbidden_effect_import:probe.js:node:fs'));
        assert.strictEqual(result.forbiddenEffectImports, 1);
    } finally {
        fs.rmSync(fixture.root, { recursive: true, force: true });
    }
});

test('NEXT01:N01-VALIDATOR-003 validator requires every stable property ID exactly once', () => {
    const validTap = policy.REQUIRED_PROPERTY_IDS.map((id, index) =>
        `ok ${index + 1} - NEXT01:${id} property`).join('\n');
    assert.deepStrictEqual(policy.validateExecutedPropertyIds(validTap), {
        errors: [],
        observedIds: policy.REQUIRED_PROPERTY_IDS
    });
    const unexpectedId = 'N01-DUMMY-999';
    const replaced = validTap
        .replace(`NEXT01:${policy.REQUIRED_PROPERTY_IDS[0]}`, `NEXT01:${unexpectedId}`)
        .concat(`\nok 99 - NEXT01:${policy.REQUIRED_PROPERTY_IDS[1]} duplicate`);
    const invalid = policy.validateExecutedPropertyIds(replaced);
    assert.ok(invalid.errors.includes(`missing_property_id:${policy.REQUIRED_PROPERTY_IDS[0]}`));
    assert.ok(invalid.errors.includes(`duplicate_property_id:${policy.REQUIRED_PROPERTY_IDS[1]}`));
    assert.ok(invalid.errors.includes(`unexpected_property_id:${unexpectedId}`));
    const sourceOnlyTokens = policy.REQUIRED_PROPERTY_IDS.map(id => `// NEXT01:${id}`).join('\n');
    assert.strictEqual(policy.validateExecutedPropertyIds(sourceOnlyTokens).observedIds.length, 0);
});

test('NEXT01:N01-VALIDATOR-004 validator binds HEAD, parent and tracked files', () => {
    const expectedHead = 'a'.repeat(40);
    const expectedParent = 'b'.repeat(40);
    assert.deepStrictEqual(policy.validateGitBindingEvidence({
        expectedHead,
        expectedParent,
        actualHead: expectedHead,
        parentLine: `${expectedHead} ${expectedParent}`,
        dirtyStatus: '',
        requiredFiles: ['tracked.js'],
        trackedFiles: new Set(['tracked.js']),
        ignoredPaths: []
    }), []);
    const errors = policy.validateGitBindingEvidence({
        expectedHead,
        expectedParent,
        actualHead: 'c'.repeat(40),
        parentLine: `${'c'.repeat(40)} ${expectedParent} ${'d'.repeat(40)}`,
        dirtyStatus: '?? ignored.js',
        requiredFiles: ['tracked.js', 'missing.js'],
        trackedFiles: new Set(['tracked.js']),
        ignoredPaths: ['src/next/ignored.js']
    });
    assert.ok(errors.includes('head_mismatch'));
    assert.ok(errors.includes('parent_count_invalid:2'));
    assert.ok(errors.includes('worktree_not_clean'));
    assert.ok(errors.includes('required_file_not_tracked:missing.js'));
    assert.ok(errors.includes('ignored_path_in_gate:src/next/ignored.js'));
});
