'use strict';

const fs = require('node:fs');
const path = require('node:path');

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

const ALLOWED_BUILTINS = new Set(['node:crypto', 'node:module']);
const LITERAL_REQUIRE = /\brequire\s*\(\s*(['"])([^'"\r\n]+)\1\s*\)/g;

function normalizedRelative(root, file) {
    return path.relative(root, file).replaceAll('\\', '/');
}

function resolveRelativeImport(file, specifier) {
    const target = path.resolve(path.dirname(file), specifier);
    const candidates = [target, `${target}.js`, `${target}.mjs`, path.join(target, 'index.js')];
    return candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

function analyzeNextSourceFiles({ nextRoot, sourceFiles } = {}) {
    const absoluteNextRoot = path.resolve(nextRoot);
    const errors = [];
    let forbiddenEffectImports = 0;
    let runtimeV1Imports = 0;
    let dynamicModuleLoads = 0;

    for (const file of sourceFiles || []) {
        const relative = normalizedRelative(absoluteNextRoot, file);
        const source = fs.readFileSync(file, 'utf8');
        const literalRanges = [];
        for (const match of source.matchAll(LITERAL_REQUIRE)) {
            literalRanges.push([match.index, match.index + match[0].length]);
            const specifier = match[2];
            if (specifier.startsWith('.')) {
                const intendedTarget = path.resolve(path.dirname(file), specifier);
                const intendedRelative = path.relative(absoluteNextRoot, intendedTarget);
                if (intendedRelative.startsWith('..') || path.isAbsolute(intendedRelative)) {
                    runtimeV1Imports += 1;
                    errors.push(`relative_import_outside_next:${relative}:${specifier}`);
                    continue;
                }
                const resolved = resolveRelativeImport(file, specifier);
                if (!resolved) {
                    errors.push(`unresolved_relative_import:${relative}:${specifier}`);
                    continue;
                }
                continue;
            }
            if (!ALLOWED_BUILTINS.has(specifier)) {
                forbiddenEffectImports += 1;
                errors.push(`forbidden_effect_import:${relative}:${specifier}`);
            }
        }

        const withoutLiteralRequires = Array.from(source, (character, index) => (
            literalRanges.some(([start, end]) => index >= start && index < end) ? ' ' : character
        )).join('');
        if (/\brequire\s*\(/.test(withoutLiteralRequires) || /\bimport\s*\(/.test(source) || /^\s*import\s/m.test(source)) {
            dynamicModuleLoads += 1;
            errors.push(`dynamic_module_load:${relative}`);
        }
        if (/\b(?:fetch|WebSocket|eval)\s*\(|\bnew\s+Function\s*\(|\bprocess\s*\.\s*(?:binding|dlopen)\s*\(/.test(source)) {
            forbiddenEffectImports += 1;
            errors.push(`forbidden_effect_capability:${relative}`);
        }
    }

    return { errors, forbiddenEffectImports, runtimeV1Imports, dynamicModuleLoads };
}

function validatePropertyIds(sources = []) {
    const counts = new Map();
    for (const source of sources) {
        for (const match of source.matchAll(/NEXT01:(N01-[A-Z]+-\d{3})/g)) {
            counts.set(match[1], (counts.get(match[1]) || 0) + 1);
        }
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
    REQUIRED_PROPERTY_IDS,
    analyzeNextSourceFiles,
    validateGitBindingEvidence,
    validatePropertyIds
};
