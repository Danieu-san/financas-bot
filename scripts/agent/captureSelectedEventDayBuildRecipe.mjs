import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire, isBuiltin } from 'node:module';
import { createHash } from 'node:crypto';
import { parse } from 'acorn';
import { canonicalValue, freezeDeep } from '../../src/next/kernel/canonicalValue.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const fail = code => { throw new Error('selected_day_build_' + code); };
const receipts = new WeakSet();
const entrypoints = Object.freeze(['scripts/agent/buildSelectedEventDayProofExecution.mjs',
    'scripts/agent/executeSelectedEventDayCandidate.mjs',
    'scripts/agent/prepareSelectedEventDayAdmission.mjs', 'scripts/agent/captureSelectedEventDayCompiler.mjs',
    'scripts/agent/prepareSelectedEventDayPacket.mjs', 'scripts/agent/buildSelectedEventDayDispatchCapsule.mjs',
    'scripts/agent/selectedEventDayProgramContract.mjs', 'scripts/agent/sealSelectedEventDayOracle.mjs',
    'scripts/agent/captureSelectedEventDayBuildRecipe.mjs', 'scripts/agent/lowerNextProofProgram.mjs',
    'src/next/provenance/selectedEventDayProfile.js'].sort());

// Dependency analysis only: no source evaluation or caller resolver. Generated
// executable bundles are separately admitted by the unchanged closed bundler.
// A static module graph is not semantic safety or an independent BUILD replay.
export function analyzeSelectedEventDayBuildModule(source) {
    if (typeof source !== 'string' || Buffer.byteLength(source) > 8 * 1024 * 1024) fail('source');
    let ast; try { ast = parse(source, { ecmaVersion: 2022, sourceType: 'module' }); } catch { fail('syntax'); }
    const specifiers = new Set();
    function walk(node, parent) {
        if (node.type === 'ImportExpression') fail('loader');
        if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source) {
            if (typeof node.source.value !== 'string') fail('loader');
            specifiers.add(node.source.value);
        }
        if (node.type === 'Identifier' && node.name === 'require') {
            const declaration = parent?.type === 'VariableDeclarator' && parent.id === node
                && parent.init?.type === 'CallExpression' && parent.init.callee.type === 'Identifier'
                && parent.init.callee.name === 'createRequire';
            const call = parent?.type === 'CallExpression' && parent.callee === node && !parent.optional
                && parent.arguments.length === 1 && parent.arguments[0].type === 'Literal'
                && typeof parent.arguments[0].value === 'string';
            if (!declaration && !call) fail('loader');
            if (call) specifiers.add(parent.arguments[0].value);
        }
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(child => { if (child?.type) walk(child, node); });
            else if (value?.type) walk(value, node);
        }
    }
    walk(ast); return Object.freeze([...specifiers].sort());
}

export function captureSelectedEventDayBuildRecipe() {
    if (arguments.length) fail('input');
    const vendorRoot = fs.realpathSync(path.join(root, 'node_modules'));
    const sources = new Map(), imports = [], queue = [...entrypoints];
    let totalBytes = 0;
    const within = (base, file) => { const rel = path.relative(base, file); return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel); };
    function logical(file) {
        const absolute = fs.realpathSync(file);
        if (within(vendorRoot, absolute)) return 'node_modules/' + path.relative(vendorRoot, absolute).replaceAll('\\', '/');
        if (within(root, absolute)) return path.relative(root, absolute).replaceAll('\\', '/');
        fail('outside_recipe');
    }
    while (queue.length) {
        const file = queue.shift(); if (sources.has(file)) continue;
        if (sources.size >= 512 || typeof file !== 'string' || !/^(scripts\/agent|src\/next|node_modules)\//.test(file)) fail('inventory');
        const physical = file.startsWith('node_modules/') ? path.join(vendorRoot, file.slice(13)) : path.join(root, file);
        if (logical(physical) !== file) fail('source_identity');
        const bytes = fs.readFileSync(physical), source = bytes.toString('utf8');
        if (!Buffer.from(source).equals(bytes) || (totalBytes += bytes.length) > 16 * 1024 * 1024) fail('source');
        sources.set(file, { path: file, sha256: sha(bytes) });
        // JSON dependencies are pinned data, not executable imports.
        const specifiers = file.endsWith('.json') ? (JSON.parse(source), []) : analyzeSelectedEventDayBuildModule(source);
        const resolver = createRequire(physical);
        for (const specifier of specifiers) {
            let target;
            if (isBuiltin(specifier)) target = specifier.startsWith('node:') ? specifier : 'node:' + specifier;
            else {
                try { target = logical(resolver.resolve(specifier)); } catch (error) {
                    throw new Error('selected_day_build_import:' + file + ':' + specifier, { cause: error });
                }
                if (!sources.has(target)) queue.push(target);
            }
            imports.push({ source: file, specifier, target });
        }
    }
    // Package resolution and generator dependencies are identified alongside
    // source closure. The declared portable node_modules junction is read-only;
    // logical paths contain no machine paths or private authentication.
    for (const file of ['package.json', 'package-lock.json']) sources.set(file, { path: file, sha256: sha(fs.readFileSync(path.join(root, file))) });
    const rows = [...sources.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    imports.sort((a, b) => canonicalValue(a) < canonicalValue(b) ? -1 : canonicalValue(a) > canonicalValue(b) ? 1 : 0);
    const receipt = freezeDeep({ schema_version: 1, boundary: 'trusted_BUILD_platform_current_sources_not_independent_execution',
        entrypoints: [...entrypoints], sources: rows, imports, module_inventory_complete: true,
        independent_BUILD_execution: false });
    receipts.add(receipt); return receipt;
}

export function assertCurrentSelectedEventDayBuildRecipe(receipt) {
    if (!receipts.has(receipt)) fail('authority');
    const current = captureSelectedEventDayBuildRecipe();
    if (canonicalValue(receipt) !== canonicalValue(current)) fail('source_changed');
    return receipt;
}
