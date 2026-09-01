'use strict';

const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');

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

function validateSourceInventory({ expectedPaths = [], discoveredPaths = [] } = {}) {
    const expected = uniqueSorted(expectedPaths);
    const discovered = uniqueSorted(discoveredPaths);
    const expectedSet = new Set(expected);
    const discoveredSet = new Set(discovered);
    const errors = [];
    for (const file of expected) {
        if (!discoveredSet.has(file)) errors.push(`missing_executable_source:${file}`);
    }
    for (const file of discovered) {
        if (!expectedSet.has(file)) errors.push(`unexpected_executable_source:${file}`);
    }
    return { errors, expectedPaths: expected, discoveredPaths: discovered };
}

function resolveRelativeImport(file, specifier) {
    const target = path.resolve(path.dirname(file), specifier);
    const candidates = [target, `${target}.js`, `${target}.mjs`, `${target}.cjs`, path.join(target, 'index.js')];
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

function isAllowedExternalBinding(relative, specifier, call, parent) {
    if (parent?.type !== 'VariableDeclarator' || parent.init !== call) return false;
    if (relative === 'replay/hermeticReplayRunner.js' && specifier === 'node:module') {
        return parent.id?.type === 'Identifier' && parent.id.name === 'Module';
    }
    if (relative === 'policy/toolBudget.js' && specifier === 'node:crypto') {
        return hasExactObjectBinding(parent.id, 'createHash');
    }
    return false;
}

function analyzeNextSourceFiles({ nextRoot, sourceFiles, realpath = fs.realpathSync.native } = {}) {
    const absoluteNextRoot = path.resolve(nextRoot);
    const rootRealPath = path.resolve(realpath(absoluteNextRoot));
    const errors = new Set();
    let forbiddenEffectImports = 0;
    let runtimeV1Imports = 0;
    let unclassifiedModuleLoaders = 0;
    let classifiedModuleLoads = 0;

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

        const acceptedRequireIdentifiers = new WeakSet();
        const classifySpecifier = specifier => {
            classifiedModuleLoads += 1;
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
                        !isAllowedExternalBinding(relative, specifier, node, parent)) {
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
            if (node.type === 'Identifier' && node.name === 'Module') {
                const allowedDeclaration = relative === 'replay/hermeticReplayRunner.js' &&
                    parent?.type === 'VariableDeclarator' && parent.id === node;
                const allowedLoadHook = relative === 'replay/hermeticReplayRunner.js' &&
                    parent?.type === 'MemberExpression' && parent.object === node && memberName(parent) === '_load';
                if (!allowedDeclaration && !allowedLoadHook) {
                    unclassifiedModuleLoaders += 1;
                    errors.add(`unclassified_module_loader:${relative}`);
                }
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
        classifiedModuleLoads
    };
}

function validateExecutedPropertyIds(tapOutput = '') {
    const counts = new Map();
    for (const match of String(tapOutput).matchAll(/^ok\s+\d+\s+-\s+NEXT01:(N01-[A-Z]+-\d{3})\b/gm)) {
        counts.set(match[1], (counts.get(match[1]) || 0) + 1);
    }
    const required = new Set(REQUIRED_PROPERTY_IDS);
    const errors = [];
    for (const id of REQUIRED_PROPERTY_IDS) {
        const count = counts.get(id) || 0;
        if (count === 0) errors.push(`missing_property_id:${id}`);
        if (count > 1) errors.push(`duplicate_property_id:${id}`);
    }
    for (const id of counts.keys()) {
        if (!required.has(id)) errors.push(`unexpected_property_id:${id}`);
    }
    return {
        errors,
        observedIds: REQUIRED_PROPERTY_IDS.filter(id => counts.get(id) === 1)
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
    REQUIRED_PROPERTY_IDS,
    analyzeNextSourceFiles,
    validateExecutedPropertyIds,
    validateGitBindingEvidence,
    validateSourceInventory
};
