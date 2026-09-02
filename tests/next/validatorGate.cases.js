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

function hermeticReplaySource(forwarding = 'return originalLoad.call(this, request, parent, isMain);') {
    return `'use strict';
const Module = require('node:module');
const BLOCKED_MODULES = new Set(['node:fs']);
function networkError() { return new Error('blocked'); }
async function runHermeticReplay(execution) {
    const originalLoad = Module._load;
    Module._load = function hermeticLoad(request, parent, isMain) {
        if (BLOCKED_MODULES.has(String(request || ''))) throw networkError();
        ${forwarding}
    };
    try {
        return await execution();
    } finally {
        Module._load = originalLoad;
    }
}
module.exports = { runHermeticReplay };
`;
}

function propertyFile(id) {
    if (id.startsWith('N01-CONVERSATION-')) return 'tests/next/conversationReplayRed.cases.js';
    if (id.startsWith('N01-BUDGET-')) return 'tests/next/toolBudgetRed.cases.js';
    if (id.startsWith('N01-VALIDATOR-')) return 'tests/next/validatorGate.cases.js';
    return 'tests/next/next01SkeletonRed.cases.js';
}

function propertyPass(id, overrides = {}) {
    return {
        type: 'test:pass',
        name: `NEXT01:${id} property`,
        nesting: 0,
        skip: false,
        todo: false,
        testType: 'test',
        file: propertyFile(id),
        ...overrides
    };
}

function summaryEvent(counts = {}) {
    return {
        type: 'test:summary',
        counts: {
            tests: 25,
            failed: 0,
            passed: 25,
            cancelled: 0,
            skipped: 0,
            todo: 0,
            topLevel: 25,
            suites: 0,
            ...counts
        }
    };
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
    const validHermeticLoader = sourceFixture(
        hermeticReplaySource(),
        'replay/hermeticReplayRunner.js'
    );
    const invalidHermeticLoaders = [
        hermeticReplaySource().replace(
            "const originalLoad = Module._load;",
            "const originalLoad = Module._load;\n    Module._load('node:fs');"
        ),
        hermeticReplaySource().replace(
            "const originalLoad = Module._load;",
            "const originalLoad = Module._load;\n    Module['_load']('node:fs');"
        ),
        hermeticReplaySource("return originalLoad('node:fs');"),
        hermeticReplaySource("return originalLoad.apply(this, [request, parent, isMain]);"),
        hermeticReplaySource("return Reflect.apply(originalLoad, null, ['node:fs']);"),
        hermeticReplaySource("return originalLoad.call(this, 'node:fs', parent, isMain);"),
        hermeticReplaySource(
            "originalLoad.call(this, request, parent, isMain);\n        return originalLoad.call(this, request, parent, isMain);"
        ),
        hermeticReplaySource(
            "request = 'node:fs';\n        return originalLoad.call(this, request, parent, isMain);"
        ),
        hermeticReplaySource(
            "arguments[0] = 'node:fs';\n        return originalLoad.call(this, request, parent, isMain);"
        ),
        hermeticReplaySource().replace(
            "const originalLoad = Module._load;",
            "const originalLoad = Module._load;\n    const loader = originalLoad;"
        )
    ].map(source => sourceFixture(source, 'replay/hermeticReplayRunner.js'));
    try {
        assert.deepStrictEqual(policy.validateSourceInventory({
            expectedPaths: ['allowed.js'],
            discoveredPaths: [
                'allowed.js', 'escape.mjs', 'escape.cjs', 'escape.node',
                'escape.json', 'escape', 'escape.jsx'
            ]
        }).errors, [
            'unexpected_executable_source:escape',
            'unexpected_executable_source:escape.cjs',
            'unexpected_executable_source:escape.json',
            'unexpected_executable_source:escape.jsx',
            'unexpected_executable_source:escape.mjs',
            'unexpected_executable_source:escape.node'
        ]);
        assert.deepStrictEqual(policy.validateSourceInventory({
            expectedPaths: ['allowed.js'],
            discoveredEntries: [{ path: 'allowed.js', type: 'symlink' }]
        }).errors, ['unexpected_source_entry_type:allowed.js:symlink']);
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
        const validHermeticResult = policy.analyzeNextSourceFiles({
            nextRoot: validHermeticLoader.nextRoot,
            sourceFiles: [validHermeticLoader.file]
        });
        assert.deepStrictEqual(validHermeticResult.errors, []);
        assert.strictEqual(validHermeticResult.classifiedHermeticRuntimeLoaders, 1);
        for (const fixture of invalidHermeticLoaders) {
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
            expectedSourcePaths: ['probe.js'],
            realpath: value => value.endsWith('dependency.js')
                ? path.join(realpathEscape.root, 'outside.js')
                : path.resolve(value)
        }).errors.includes('relative_import_realpath_outside_next:probe.js:./dependency'));
        fs.rmSync(realpathEscape.root, { recursive: true, force: true });

        const targetOutsideInventory = sourceFixture("require('./dependency');\n");
        fs.writeFileSync(path.join(targetOutsideInventory.nextRoot, 'dependency.js'), 'module.exports = {};\n');
        assert.ok(policy.analyzeNextSourceFiles({
            nextRoot: targetOutsideInventory.nextRoot,
            sourceFiles: [targetOutsideInventory.file],
            expectedSourcePaths: ['probe.js']
        }).errors.includes('relative_import_target_not_in_inventory:probe.js:./dependency'));
        fs.rmSync(targetOutsideInventory.root, { recursive: true, force: true });

        const nonSourceTargets = sourceFixture(
            "require('./payload.node'); require('./payload.json'); require('./payload');\n"
        );
        for (const target of ['payload.node', 'payload.json', 'payload']) {
            fs.writeFileSync(path.join(nonSourceTargets.nextRoot, target), '{}');
        }
        const nonSourceErrors = policy.analyzeNextSourceFiles({
            nextRoot: nonSourceTargets.nextRoot,
            sourceFiles: [nonSourceTargets.file],
            expectedSourcePaths: ['probe.js']
        }).errors;
        for (const specifier of ['./payload.node', './payload.json', './payload']) {
            assert.ok(nonSourceErrors.includes(
                `relative_import_target_not_in_inventory:probe.js:${specifier}`
            ));
        }
        fs.rmSync(nonSourceTargets.root, { recursive: true, force: true });
    } finally {
        fs.rmSync(legacy.root, { recursive: true, force: true });
        fs.rmSync(dynamic.root, { recursive: true, force: true });
        for (const fixture of alternateLoaders) {
            fs.rmSync(fixture.root, { recursive: true, force: true });
        }
        for (const fixture of allowedImportBindingEscapes) {
            fs.rmSync(fixture.root, { recursive: true, force: true });
        }
        fs.rmSync(validHermeticLoader.root, { recursive: true, force: true });
        for (const fixture of invalidHermeticLoaders) {
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
    const validEvents = [
        ...policy.REQUIRED_PROPERTY_IDS.map(id => propertyPass(id)),
        summaryEvent()
    ];
    assert.deepStrictEqual(policy.validateExecutedPropertyEvents(validEvents), {
        errors: [],
        observedIds: policy.REQUIRED_PROPERTY_IDS,
        counts: {
            tests: 25,
            failed: 0,
            passed: 25,
            skipped: 0,
            todo: 0,
            topLevel: 25,
            suites: 0
        }
    });
    const unexpectedId = 'N01-DUMMY-999';
    const invalidEvents = validEvents.map(event => ({ ...event }));
    invalidEvents[0] = propertyPass(unexpectedId);
    invalidEvents.push(propertyPass(policy.REQUIRED_PROPERTY_IDS[1]));
    const invalid = policy.validateExecutedPropertyEvents(invalidEvents);
    assert.ok(invalid.errors.includes(`missing_property_id:${policy.REQUIRED_PROPERTY_IDS[0]}`));
    assert.ok(invalid.errors.includes(`duplicate_property_id:${policy.REQUIRED_PROPERTY_IDS[1]}`));
    assert.ok(invalid.errors.includes(`unexpected_property_id:${unexpectedId}`));

    const skipped = validEvents.map(event => ({ ...event }));
    skipped[0] = propertyPass(policy.REQUIRED_PROPERTY_IDS[0], { skip: true });
    skipped[skipped.length - 1] = summaryEvent({ passed: 24, skipped: 1 });
    assert.ok(policy.validateExecutedPropertyEvents(skipped).errors.includes(
        `skipped_property_id:${policy.REQUIRED_PROPERTY_IDS[0]}`
    ));

    const todo = validEvents.map(event => ({ ...event }));
    todo[0] = propertyPass(policy.REQUIRED_PROPERTY_IDS[0], { todo: true });
    todo[todo.length - 1] = summaryEvent({ passed: 24, todo: 1 });
    assert.ok(policy.validateExecutedPropertyEvents(todo).errors.includes(
        `todo_property_id:${policy.REQUIRED_PROPERTY_IDS[0]}`
    ));

    const failed = validEvents.map(event => ({ ...event }));
    failed[0] = propertyPass(policy.REQUIRED_PROPERTY_IDS[0], { type: 'test:fail' });
    failed[failed.length - 1] = summaryEvent({ passed: 24, failed: 1 });
    assert.ok(policy.validateExecutedPropertyEvents(failed).errors.includes(
        `failed_property_id:${policy.REQUIRED_PROPERTY_IDS[0]}`
    ));

    const compensated = validEvents
        .map(event => ({ ...event }))
        .concat({
            type: 'test:pass', name: 'ordinary compensating test', nesting: 0,
            skip: false, todo: false, testType: 'test', file: 'tests/next/validatorGate.cases.js'
        });
    compensated[0] = propertyPass(policy.REQUIRED_PROPERTY_IDS[0], { skip: true });
    compensated[compensated.length - 2] = summaryEvent({ tests: 26, passed: 25, skipped: 1, topLevel: 26 });
    const compensatedResult = policy.validateExecutedPropertyEvents(compensated);
    assert.strictEqual(compensatedResult.observedIds.length, 24);
    assert.ok(compensatedResult.errors.includes(`skipped_property_id:${policy.REQUIRED_PROPERTY_IDS[0]}`));

    const nested = validEvents.map(event => ({ ...event }));
    nested[0] = propertyPass(policy.REQUIRED_PROPERTY_IDS[0], { nesting: 1 });
    assert.ok(policy.validateExecutedPropertyEvents(nested).errors.includes(
        `nested_property_id:${policy.REQUIRED_PROPERTY_IDS[0]}`
    ));

    const wrongFile = validEvents.map(event => ({ ...event }));
    wrongFile[0] = propertyPass(policy.REQUIRED_PROPERTY_IDS[0], {
        file: 'tests/next/toolBudgetRed.cases.js'
    });
    assert.ok(policy.validateExecutedPropertyEvents(wrongFile).errors.includes(
        `property_file_mismatch:${policy.REQUIRED_PROPERTY_IDS[0]}`
    ));

    const suite = validEvents.map(event => ({ ...event }));
    suite[0] = propertyPass(policy.REQUIRED_PROPERTY_IDS[0], { testType: 'suite' });
    assert.ok(policy.validateExecutedPropertyEvents(suite).errors.includes(
        `invalid_property_test_type:${policy.REQUIRED_PROPERTY_IDS[0]}`
    ));

    const stdoutSpoof = [
        {
            type: 'test:stdout',
            message: `ok 999 - NEXT01:${policy.REQUIRED_PROPERTY_IDS[0]}`
        },
        summaryEvent({ tests: 0, passed: 0, topLevel: 0 })
    ];
    assert.strictEqual(policy.validateExecutedPropertyEvents(stdoutSpoof).observedIds.length, 0);
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
