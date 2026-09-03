'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const acorn = require('acorn');

const HERMETIC_REPLAY_CANONICAL_AST_SHA256 =
    '00e18c3734a593b432ac0335af43353a189132513b4c0107aa825abcecbcf0be';

const REQUIRED_PROPERTY_IDS = Object.freeze([
    'N01-PLAN-001',
    'N01-TOOL-001', 'N01-TOOL-002',
    'N01-SESSION-001',
    'N01-EVIDENCE-001',
    'N01-LEDGER-001',
    'N01-TRACE-001', 'N01-TRACE-002',
    'N01-REPLAY-001',
    'N01-REUSE-001',
    'N01-BOUNDARY-001',
    'N01-CONVERSATION-001', 'N01-CONVERSATION-002', 'N01-CONVERSATION-003',
    'N01-CONVERSATION-004', 'N01-CONVERSATION-005', 'N01-CONVERSATION-006',
    'N01-BUDGET-001', 'N01-BUDGET-002', 'N01-BUDGET-003', 'N01-BUDGET-004',
    'N01-VALIDATOR-001', 'N01-VALIDATOR-002', 'N01-VALIDATOR-003', 'N01-VALIDATOR-004'
]);

const EXPECTED_NEXT_SOURCE_PATHS = Object.freeze([
    'contracts/financialQueryPlan.js',
    'contracts/modelDataBoundary.js',
    'contracts/reuseManifest.js',
    'conversation/conversationGateway.js',
    'ledger/emptyLedgerStore.js',
    'observability/sanitizedTraceRecorder.js',
    'policy/toolBudget.js',
    'policy/typedEvidenceVerifier.js',
    'replay/hermeticReplayRunner.js',
    'session/memorySessionStore.js',
    'tools/readOnlyToolGateway.js'
]);

const ALLOWED_EXTERNAL_IMPORTS = new Map([
    ['policy/toolBudget.js', new Set(['node:crypto'])],
    ['replay/hermeticReplayRunner.js', new Set(['node:module'])]
]);

function normalizedRelative(root, file) {
    return path.relative(root, file).replaceAll('\\', '/');
}

function uniqueSorted(values) {
    return [...new Set(values.map(value => String(value).replaceAll('\\', '/')))].sort();
}

function validateSourceInventory({
    expectedPaths = [],
    discoveredPaths = [],
    discoveredEntries = null
} = {}) {
    const expected = uniqueSorted(expectedPaths);
    const entries = Array.isArray(discoveredEntries)
        ? discoveredEntries.map(entry => ({
            path: String(entry.path || '').replaceAll('\\', '/'),
            type: String(entry.type || '')
        }))
        : discoveredPaths.map(entryPath => ({
            path: String(entryPath).replaceAll('\\', '/'),
            type: 'file'
        }));
    const discovered = uniqueSorted(entries.map(entry => entry.path));
    const expectedSet = new Set(expected);
    const discoveredSet = new Set(discovered);
    const errors = [];
    for (const file of expected) {
        if (!discoveredSet.has(file)) errors.push(`missing_executable_source:${file}`);
    }
    for (const file of discovered) {
        if (!expectedSet.has(file)) errors.push(`unexpected_executable_source:${file}`);
    }
    for (const entry of entries) {
        if (entry.type !== 'file') {
            errors.push(`unexpected_source_entry_type:${entry.path}:${entry.type || 'unknown'}`);
        }
    }
    return { errors, expectedPaths: expected, discoveredPaths: discovered };
}

function resolveRelativeImport(file, specifier) {
    const target = path.resolve(path.dirname(file), specifier);
    const candidates = [
        target,
        `${target}.js`, `${target}.json`, `${target}.node`,
        path.join(target, 'index.js'), path.join(target, 'index.json'), path.join(target, 'index.node')
    ];
    return candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

function insideRoot(root, target) {
    const relative = path.relative(root, target);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function walkAst(node, parent, visit) {
    if (!node || typeof node !== 'object') return;
    if (typeof node.type === 'string') visit(node, parent);
    for (const [key, value] of Object.entries(node)) {
        if (key === 'loc' || key === 'range') continue;
        if (Array.isArray(value)) {
            for (const child of value) walkAst(child, node, visit);
        } else if (value && typeof value === 'object' && typeof value.type === 'string') {
            walkAst(value, node, visit);
        }
    }
}

function staticString(node) {
    return node?.type === 'Literal' && typeof node.value === 'string' ? node.value : null;
}

function memberName(node) {
    if (node?.type !== 'MemberExpression') return null;
    if (!node.computed && node.property?.type === 'Identifier') return node.property.name;
    return staticString(node.property);
}

const OMITTED_AST_KEYS = new Set(['start', 'end', 'loc', 'range', 'raw']);

function canonicalAstValue(value) {
    if (Array.isArray(value)) return value.map(canonicalAstValue);
    if (!value || typeof value !== 'object') return value;
    const result = {};
    for (const key of Object.keys(value).sort()) {
        if (!OMITTED_AST_KEYS.has(key)) result[key] = canonicalAstValue(value[key]);
    }
    return result;
}

function canonicalAstSha256(ast) {
    return createHash('sha256')
        .update(JSON.stringify(canonicalAstValue(ast)))
        .digest('hex');
}

function inspectHermeticRuntimeLoader(ast) {
    const allowedIdentifiers = new WeakSet();
    const allowedMembers = new WeakSet();
    const allowedRequireCalls = new WeakSet();
    const actualAstSha256 = canonicalAstSha256(ast);
    const valid = actualAstSha256 === HERMETIC_REPLAY_CANONICAL_AST_SHA256;
    if (valid) {
        walkAst(ast, null, node => {
            if (node.type === 'Identifier' && (
                node.name === 'Module' || node.name === 'originalLoad'
            )) allowedIdentifiers.add(node);
            if (node.type === 'MemberExpression' && memberName(node) === '_load') {
                allowedMembers.add(node);
            }
            if (node.type === 'CallExpression' &&
                node.callee?.type === 'Identifier' && node.callee.name === 'require' &&
                node.optional !== true && node.arguments.length === 1 &&
                staticString(node.arguments[0]) === 'node:module') {
                allowedRequireCalls.add(node);
            }
        });
    }
    return {
        valid,
        actualAstSha256,
        allowedIdentifiers,
        allowedMembers,
        allowedRequireCalls
    };
}

function isAllowedHermeticGlobalThis(relative, node, parent) {
    if (relative !== 'replay/hermeticReplayRunner.js') return false;
    if (parent?.type === 'MemberExpression' && parent.object === node && memberName(parent) === 'fetch') {
        return true;
    }
    return parent?.type === 'CallExpression' &&
        parent.arguments[0] === node &&
        parent.callee?.type === 'MemberExpression' &&
        parent.callee.object?.type === 'Identifier' &&
        parent.callee.object.name === 'Object' &&
        memberName(parent.callee) === 'hasOwn' &&
        staticString(parent.arguments[1]) === 'fetch';
}

function hasExactObjectBinding(pattern, expectedName) {
    return pattern?.type === 'ObjectPattern' &&
        pattern.properties.length === 1 &&
        pattern.properties[0]?.type === 'Property' &&
        pattern.properties[0].computed === false &&
        pattern.properties[0].kind === 'init' &&
        pattern.properties[0].key?.type === 'Identifier' &&
        pattern.properties[0].key.name === expectedName &&
        pattern.properties[0].value?.type === 'Identifier' &&
        pattern.properties[0].value.name === expectedName;
}

function isAllowedExternalBinding(relative, specifier, call, parent, parentByNode, hermeticLoader) {
    if (parent?.type !== 'VariableDeclarator' || parent.init !== call) return false;
    if (relative === 'replay/hermeticReplayRunner.js' && specifier === 'node:module') {
        return hermeticLoader.allowedRequireCalls.has(call);
    }
    if (relative === 'policy/toolBudget.js' && specifier === 'node:crypto') {
        return parentByNode.get(parent)?.type === 'VariableDeclaration' &&
            parentByNode.get(parent).kind === 'const' &&
            hasExactObjectBinding(parent.id, 'createHash');
    }
    return false;
}

function analyzeNextSourceFiles({
    nextRoot,
    sourceFiles,
    expectedSourcePaths = EXPECTED_NEXT_SOURCE_PATHS,
    realpath = fs.realpathSync.native
} = {}) {
    const absoluteNextRoot = path.resolve(nextRoot);
    const rootRealPath = path.resolve(realpath(absoluteNextRoot));
    const errors = new Set();
    let forbiddenEffectImports = 0;
    let runtimeV1Imports = 0;
    let unclassifiedModuleLoaders = 0;
    let classifiedStaticModuleLoads = 0;
    let classifiedHermeticRuntimeLoaders = 0;
    let hermeticReplayAstSha256 = null;
    const expectedSourceSet = new Set(uniqueSorted(expectedSourcePaths));

    for (const file of sourceFiles || []) {
        const relative = normalizedRelative(absoluteNextRoot, file);
        const sourceRealPath = path.resolve(realpath(file));
        if (!insideRoot(rootRealPath, sourceRealPath)) {
            errors.add(`source_realpath_outside_next:${relative}`);
            continue;
        }
        const source = fs.readFileSync(file, 'utf8');
        let ast;
        try {
            ast = acorn.parse(source, {
                ecmaVersion: 'latest',
                sourceType: path.extname(file) === '.mjs' ? 'module' : 'script',
                allowHashBang: true
            });
        } catch (_) {
            errors.add(`source_parse_error:${relative}`);
            continue;
        }

        const parentByNode = new WeakMap();
        walkAst(ast, null, (node, parent) => {
            if (parent) parentByNode.set(node, parent);
        });
        const hermeticLoader = relative === 'replay/hermeticReplayRunner.js'
            ? inspectHermeticRuntimeLoader(ast)
            : {
                valid: false,
                allowedIdentifiers: new WeakSet(),
                allowedMembers: new WeakSet(),
                allowedRequireCalls: new WeakSet()
            };
        if (relative === 'replay/hermeticReplayRunner.js') {
            hermeticReplayAstSha256 = hermeticLoader.actualAstSha256;
            if (hermeticLoader.valid) {
                classifiedHermeticRuntimeLoaders += 1;
            } else {
                unclassifiedModuleLoaders += 1;
                errors.add(`invalid_hermetic_loader_contract:${relative}`);
                errors.add(`unclassified_module_loader:${relative}`);
            }
        }

        const acceptedRequireIdentifiers = new WeakSet();
        const classifySpecifier = specifier => {
            classifiedStaticModuleLoads += 1;
            if (specifier.startsWith('.')) {
                const intendedTarget = path.resolve(path.dirname(file), specifier);
                if (!insideRoot(absoluteNextRoot, intendedTarget)) {
                    runtimeV1Imports += 1;
                    errors.add(`relative_import_outside_next:${relative}:${specifier}`);
                    return;
                }
                const resolved = resolveRelativeImport(file, specifier);
                if (!resolved) {
                    errors.add(`unresolved_relative_import:${relative}:${specifier}`);
                    return;
                }
                const targetRealPath = path.resolve(realpath(resolved));
                if (!insideRoot(rootRealPath, targetRealPath)) {
                    runtimeV1Imports += 1;
                    errors.add(`relative_import_realpath_outside_next:${relative}:${specifier}`);
                } else {
                    const targetRelative = normalizedRelative(rootRealPath, targetRealPath);
                    if (!expectedSourceSet.has(targetRelative)) {
                        errors.add(`relative_import_target_not_in_inventory:${relative}:${specifier}`);
                    }
                }
                return;
            }
            const allowed = ALLOWED_EXTERNAL_IMPORTS.get(relative) || new Set();
            if (!allowed.has(specifier)) {
                forbiddenEffectImports += 1;
                errors.add(`forbidden_effect_import:${relative}:${specifier}`);
            }
        };

        walkAst(ast, null, (node, parent) => {
            if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'require') {
                const specifier = node.optional === true || node.arguments.length !== 1
                    ? null
                    : staticString(node.arguments[0]);
                if (specifier === null) {
                    unclassifiedModuleLoaders += 1;
                    errors.add(`unclassified_module_loader:${relative}`);
                } else {
                    acceptedRequireIdentifiers.add(node.callee);
                    classifySpecifier(specifier);
                    if (!specifier.startsWith('.') &&
                        (ALLOWED_EXTERNAL_IMPORTS.get(relative) || new Set()).has(specifier) &&
                        !isAllowedExternalBinding(
                            relative,
                            specifier,
                            node,
                            parent,
                            parentByNode,
                            hermeticLoader
                        )) {
                        unclassifiedModuleLoaders += 1;
                        errors.add(`unclassified_module_loader:${relative}`);
                    }
                }
            }
            if (node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration' || (
                node.type === 'ExportNamedDeclaration' && node.source
            )) {
                const specifier = staticString(node.source);
                if (specifier === null) {
                    unclassifiedModuleLoaders += 1;
                    errors.add(`unclassified_module_loader:${relative}`);
                } else {
                    classifySpecifier(specifier);
                }
            }
            if (node.type === 'ImportExpression') {
                unclassifiedModuleLoaders += 1;
                errors.add(`unclassified_module_loader:${relative}`);
            }
            if (node.type === 'Identifier' && node.name === 'require' && !acceptedRequireIdentifiers.has(node)) {
                const isObjectProperty = parent?.type === 'Property' && parent.key === node && parent.computed === false;
                if (!isObjectProperty) {
                    unclassifiedModuleLoaders += 1;
                    errors.add(`unclassified_module_loader:${relative}`);
                }
            }
            const property = memberName(node);
            if (node.type === 'Identifier' && (
                node.name === 'Function' || node.name === 'eval' ||
                node.name === 'WebAssembly' || node.name === 'global'
            )) {
                forbiddenEffectImports += 1;
                unclassifiedModuleLoaders += 1;
                errors.add(`forbidden_effect_capability:${relative}`);
                errors.add(`unclassified_module_loader:${relative}`);
            }
            if (node.type === 'Identifier' && node.name === 'globalThis' &&
                !isAllowedHermeticGlobalThis(relative, node, parent)) {
                forbiddenEffectImports += 1;
                unclassifiedModuleLoaders += 1;
                errors.add(`forbidden_effect_capability:${relative}`);
                errors.add(`unclassified_module_loader:${relative}`);
            }
            if (node.type === 'Identifier' && node.name === 'process') {
                forbiddenEffectImports += 1;
                unclassifiedModuleLoaders += 1;
                errors.add(`forbidden_effect_capability:${relative}`);
                errors.add(`unclassified_module_loader:${relative}`);
            }
            if (node.type === 'Identifier' && node.name === 'module') {
                const allowedModuleExport = parent?.type === 'MemberExpression' &&
                    parent.object === node && memberName(parent) === 'exports';
                if (!allowedModuleExport) {
                    unclassifiedModuleLoaders += 1;
                    errors.add(`unclassified_module_loader:${relative}`);
                }
            }
            if (node.type === 'Identifier' && (
                node.name === 'Module' || node.name === 'originalLoad'
            )) {
                if (!hermeticLoader.allowedIdentifiers.has(node)) {
                    unclassifiedModuleLoaders += 1;
                    errors.add(`unclassified_module_loader:${relative}`);
                }
            }
            if (property === '_load' && !hermeticLoader.allowedMembers.has(node)) {
                unclassifiedModuleLoaders += 1;
                errors.add(`unclassified_module_loader:${relative}`);
            }
            if (property === 'createRequire' || property === 'getBuiltinModule' || property === 'require') {
                unclassifiedModuleLoaders += 1;
                errors.add(`unclassified_module_loader:${relative}`);
            }
            if (property === 'constructor' || property === '__proto__') {
                forbiddenEffectImports += 1;
                unclassifiedModuleLoaders += 1;
                errors.add(`forbidden_effect_capability:${relative}`);
                errors.add(`unclassified_module_loader:${relative}`);
            }
            if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && (
                node.callee.name === 'fetch' || node.callee.name === 'WebSocket' || node.callee.name === 'eval'
            )) {
                forbiddenEffectImports += 1;
                errors.add(`forbidden_effect_capability:${relative}`);
            }
            if (node.type === 'NewExpression' && node.callee?.type === 'Identifier' && (
                node.callee.name === 'Function' || node.callee.name === 'WebSocket'
            )) {
                forbiddenEffectImports += 1;
                errors.add(`forbidden_effect_capability:${relative}`);
            }
            if (node.type === 'MemberExpression' && (
                property === 'binding' || property === 'dlopen'
            ) && node.object?.type === 'Identifier' && node.object.name === 'process') {
                forbiddenEffectImports += 1;
                errors.add(`forbidden_effect_capability:${relative}`);
            }
        });
    }

    return {
        errors: [...errors].sort(),
        forbiddenEffectImports,
        runtimeV1Imports,
        unclassifiedModuleLoaders,
        classifiedStaticModuleLoads,
        classifiedHermeticRuntimeLoaders,
        hermeticReplayAstSha256
    };
}

function expectedPropertyFile(id) {
    if (id.startsWith('N01-CONVERSATION-')) return 'tests/next/conversationReplayRed.cases.js';
    if (id.startsWith('N01-BUDGET-')) return 'tests/next/toolBudgetRed.cases.js';
    if (id.startsWith('N01-VALIDATOR-')) return 'tests/next/validatorGate.cases.js';
    return 'tests/next/next01SkeletonRed.cases.js';
}

function validateExecutedPropertyEvents(events = []) {
    const required = new Set(REQUIRED_PROPERTY_IDS);
    const occurrences = new Map();
    const approved = new Map();
    const errors = new Set();
    const testEvents = [];
    for (const event of events) {
        if (event?.type !== 'test:pass' && event?.type !== 'test:fail') continue;
        testEvents.push(event);
        const match = String(event.name || '').match(/^NEXT01:(N01-[A-Z]+-\d{3})(?:\s|$)/);
        if (!match) continue;
        const id = match[1];
        occurrences.set(id, (occurrences.get(id) || 0) + 1);
        if (!required.has(id)) {
            errors.add(`unexpected_property_id:${id}`);
            continue;
        }
        let valid = true;
        if (event.type === 'test:fail') {
            errors.add(`failed_property_id:${id}`);
            valid = false;
        }
        if (event.skip) {
            errors.add(`skipped_property_id:${id}`);
            valid = false;
        }
        if (event.todo) {
            errors.add(`todo_property_id:${id}`);
            valid = false;
        }
        if (event.nesting !== 0) {
            errors.add(`nested_property_id:${id}`);
            valid = false;
        }
        if (event.testType !== undefined && event.testType !== null && event.testType !== 'test') {
            errors.add(`invalid_property_test_type:${id}`);
            valid = false;
        }
        const normalizedFile = String(event.file || '').replaceAll('\\', '/');
        if (normalizedFile !== expectedPropertyFile(id)) {
            errors.add(`property_file_mismatch:${id}`);
            valid = false;
        }
        if (valid) approved.set(id, (approved.get(id) || 0) + 1);
    }
    for (const id of REQUIRED_PROPERTY_IDS) {
        const occurrenceCount = occurrences.get(id) || 0;
        const approvedCount = approved.get(id) || 0;
        if (approvedCount === 0) errors.add(`missing_property_id:${id}`);
        if (occurrenceCount > 1) errors.add(`duplicate_property_id:${id}`);
    }
    const evidenceCounts = {
        tests: testEvents.filter(event => event.testType !== 'suite').length,
        failed: testEvents.filter(event => event.type === 'test:fail').length,
        passed: testEvents.filter(event =>
            event.type === 'test:pass' && !event.skip && !event.todo && event.testType !== 'suite'
        ).length,
        skipped: testEvents.filter(event => Boolean(event.skip)).length,
        todo: testEvents.filter(event => Boolean(event.todo)).length,
        topLevel: testEvents.filter(event => event.nesting === 0 && event.testType !== 'suite').length,
        suites: testEvents.filter(event => event.testType === 'suite').length
    };
    const expectedCounts = {
        tests: REQUIRED_PROPERTY_IDS.length,
        failed: 0,
        passed: REQUIRED_PROPERTY_IDS.length,
        skipped: 0,
        todo: 0,
        topLevel: REQUIRED_PROPERTY_IDS.length,
        suites: 0
    };
    for (const [field, expected] of Object.entries(expectedCounts)) {
        if (evidenceCounts[field] !== expected) {
            errors.add(`unexpected_test_evidence:${field}:${evidenceCounts[field]}`);
        }
    }
    return {
        errors: [...errors],
        observedIds: REQUIRED_PROPERTY_IDS.filter(id =>
            (occurrences.get(id) || 0) === 1 && (approved.get(id) || 0) === 1
        ),
        counts: evidenceCounts
    };
}

function validateGitBindingEvidence({
    expectedHead,
    expectedParent,
    actualHead,
    parentLine,
    dirtyStatus,
    requiredFiles = [],
    trackedFiles = new Set(),
    ignoredPaths = []
} = {}) {
    const errors = [];
    if (expectedHead && actualHead !== expectedHead) errors.push('head_mismatch');
    const ancestry = String(parentLine || '').trim().split(/\s+/).filter(Boolean);
    const parents = ancestry.slice(1);
    if (parents.length !== 1) errors.push(`parent_count_invalid:${parents.length}`);
    if (expectedParent && parents.length === 1 && parents[0] !== expectedParent) errors.push('parent_mismatch');
    if (String(dirtyStatus || '').trim()) errors.push('worktree_not_clean');
    for (const file of requiredFiles) {
        if (!trackedFiles.has(file)) errors.push(`required_file_not_tracked:${file}`);
    }
    for (const file of ignoredPaths) errors.push(`ignored_path_in_gate:${file}`);
    return errors;
}

module.exports = {
    EXPECTED_NEXT_SOURCE_PATHS,
    HERMETIC_REPLAY_CANONICAL_AST_SHA256,
    REQUIRED_PROPERTY_IDS,
    analyzeNextSourceFiles,
    validateExecutedPropertyEvents,
    validateGitBindingEvidence,
    validateSourceInventory
};
