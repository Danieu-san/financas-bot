import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { parse } from 'acorn';
import { validateGuestBundle } from './nextProvenanceGuestProfile.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schemaDirectory = 'docs/contracts/next/provenance-v2';
const schemaNames = Object.freeze({
    claims: 'claim-contract',
    evaluator: 'evaluator-contract',
    witnesses: 'evaluator-witness-contracts',
    snapshot: 'evidence-snapshot',
    registry: 'metric-evaluator-registry',
    graphs: 'provenance-graph'
});

// Build-time closed bundle. The generated require is a guest-local finite map,
// never Node's loader. This proves closure inventory, not semantic safety;
// execution still requires measured artifact admission and the SES boundary.
export function buildCommonJsGuestBundle({ sources, entry, exportName, constants = [] }) {
    const fail = code => { throw new Error(`guest_bundle_${code}`); };
    const validPath = value => typeof value === 'string' && value.length <= 512
        && value.endsWith('.js') && value.split('/').every(p => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(p) && !p.endsWith('.'));
    if (!Array.isArray(sources) || !sources.length || sources.length > 128 || !validPath(entry)
        || typeof exportName !== 'string' || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(exportName)
        || ['constructor', '__proto__', 'prototype'].includes(exportName)
        || !Array.isArray(constants) || constants.length > 16 || constants.some(v =>
            v !== null && !['string', 'boolean'].includes(typeof v) && !(typeof v === 'number' && Number.isFinite(v) && !Object.is(v, -0)))) fail('input');
    const files = new Map(); let bytes = 0;
    for (const item of sources) {
        if (!item || Object.keys(item).sort().join(',') !== 'path,source' || !validPath(item.path)
            || typeof item.source !== 'string' || files.has(item.path)) fail('source');
        bytes += Buffer.byteLength(item.source, 'utf8');
        if (bytes > 8 * 1024 * 1024 || [...files.keys()].some(p => p.toLowerCase() === item.path.toLowerCase())) fail('inventory');
        files.set(item.path, item.source);
    }
    if (!files.has(entry)) fail('entry');
    const imports = []; const links = new Map();
    for (const [file, source] of [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
        let ast;
        try { ast = parse(source, { ecmaVersion: 2022, sourceType: 'script' }); } catch { fail('syntax'); }
        const outgoing = new Map(); links.set(file, outgoing);
        function visit(node, parent) {
            if (node.type === 'ImportExpression' || node.type === 'ImportDeclaration') fail('dynamic_import');
            if (node.type === 'Identifier' && node.name === 'require') {
                if (parent?.type !== 'CallExpression' || parent.callee !== node || parent.optional
                    || parent.arguments.length !== 1 || parent.arguments[0].type !== 'Literal'
                    || typeof parent.arguments[0].value !== 'string') fail('loader');
                const specifier = parent.arguments[0].value;
                if (!specifier.startsWith('./') && !specifier.startsWith('../')) fail('external_import');
                if (specifier.includes('\\') || specifier.includes('\0')) fail('import_path');
                const normalized = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
                if (normalized.startsWith('../') || path.posix.isAbsolute(normalized)) fail('import_escape');
                const candidates = [normalized, `${normalized}.js`, `${normalized}/index.js`].filter(p => files.has(p));
                if (candidates.length !== 1) fail('import_target');
                if (!outgoing.has(specifier)) {
                    outgoing.set(specifier, candidates[0]); imports.push({ source: file, specifier, target: candidates[0] });
                }
            }
            for (const child of Object.values(node)) {
                if (Array.isArray(child)) for (const value of child) { if (value && typeof value.type === 'string') visit(value, node); }
                else if (child && typeof child.type === 'string') visit(child, node);
            }
        }
        visit(ast);
    }
    const active = new Set(); const seen = new Set();
    function visit(file) {
        if (active.has(file)) fail('cycle');
        if (seen.has(file)) return;
        active.add(file); for (const target of links.get(file).values()) visit(target);
        active.delete(file); seen.add(file);
    }
    visit(entry); if (seen.size !== files.size) fail('unreachable_source');
    const ordered = [...files.keys()].sort(); const index = new Map(ordered.map((name, i) => [name, i]));
    const factories = ordered.map(name => `function(require, module, exports) {\n${files.get(name)}\n}`).join(',\n');
    const mapping = ordered.map(name => [...links.get(name)].map(([specifier, target]) => [specifier, index.get(target)]));
    const source = `(function(operands) {\n'use strict';\n// closed-commonjs-bundle-v1\nconst factories = [${factories}];\n`
        + `const edges = ${JSON.stringify(mapping)};\nconst cache = new Map();\n`
        + `function load(index) {\nif (cache.has(index)) return cache.get(index);\n`
        + `const module = { exports: Object.create(null) };\n`
        + `const localRequire = name => { const edge = edges[index].find(pair => pair[0] === name); if (!edge) throw new Error('guest_bundle_unresolved'); return load(edge[1]); };\n`
        + `factories[index](localRequire, module, module.exports);\ncache.set(index, module.exports); return module.exports;\n}\n`
        + `return load(${index.get(entry)})[${JSON.stringify(exportName)}](operands${constants.map(v => `, ${JSON.stringify(v)}`).join('')});\n})`;
    validateGuestBundle(source);
    return { stage: 'bundled_source_only', source, imports,
        sourceHashes: ordered.map(name => ({ path: name, sha256: `sha256:${createHash('sha256').update(files.get(name), 'utf8').digest('hex')}` })) };
}

// Build-time only. No loadSchema hook, external resolution, coercion, removal
// of unknown fields or insertion of defaults. Schema semantics remain draft-07.
export function buildSchemaValidators() {
    const ajv = new Ajv({
        // Ratified schemas use composition across allOf/oneOf/$ref. Optional
        // authoring lints are not draft-07 semantics. Keep unknown keywords and
        // non-finite numbers forbidden; required/type/bounds still validate.
        strict: false,
        strictSchema: true,
        strictNumbers: true,
        allowUnionTypes: true,
        allErrors: true,
        ownProperties: true,
        coerceTypes: false,
        useDefaults: false,
        removeAdditional: false,
        code: { source: true, lines: true }
    });
    addFormats(ajv);
    const schemaHashes = [];
    const exports = {};
    for (const [name, stem] of Object.entries(schemaNames)) {
        const relative = `${schemaDirectory}/${stem}.schema.json`;
        const bytes = fs.readFileSync(path.join(root, relative));
        const schema = JSON.parse(bytes.toString('utf8'));
        const sha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
        schemaHashes.push({ path: relative, sha256 });
        if (schema.$schema !== 'http://json-schema.org/draft-07/schema#') throw new Error('schema_dialect_mismatch');
        ajv.addSchema(schema);
        exports[name] = schema.$id;
    }
    const validators = Object.fromEntries(Object.entries(exports).map(([name, id]) => [name, ajv.getSchema(id)]));
    const code = standaloneCode(ajv, exports);
    return { validators, code, schemaHashes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv.length !== 3 || process.argv[2] !== '--check') {
        throw new Error('usage: buildNextProvenanceArtifacts.mjs --check');
    }
    const built = buildSchemaValidators();
    // Development check only. No execution registry/root/freeze is emitted yet.
    console.log(JSON.stringify({ stage: 'schema_build_only', schemas: built.schemaHashes.length,
        generatedBytes: Buffer.byteLength(built.code),
        generatedSha256: createHash('sha256').update(built.code).digest('hex') }));
}
