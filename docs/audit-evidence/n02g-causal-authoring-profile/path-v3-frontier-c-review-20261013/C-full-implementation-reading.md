# Fronteira C — implementation integrais

CODE cf6e43cbaa7c378f2b64590c50d0818700a3bdd0. Nenhum veredito ou autoridade por esta entrega.

## scripts/agent/buildNextMetricArtifacts.mjs

SHA-256 5ce85a2c284946b37b33820fbc1722140515a196a7f93544e4a5fd2e478a906c; Git blob cbd21563e381c6e974701415c461863e45070a54; bytes 9866.

```javascript
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { canonicalValue, freezeDeep } from '../../src/next/kernel/canonicalValue.js';
import { buildTypedMetricGuestBundle, buildSchemaValidators, buildTrustedCommonJsBundle } from './buildNextProvenanceArtifacts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = 'docs/contracts/next/provenance-v2';
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const lfText = file => fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
const fail = code => { throw new Error(`metric_artifact_build_${code}`); };

// Explicit build recipe for the disposable CHILD only. This does not pretend
// to include the parent host/recorder/acceptance validators in its TCB root.
// The CJS entry and packaged SES distribution have explicit logical .js paths;
// source bytes are preserved exactly, not normalized or re-read at execution.
export function buildMetricChildCapsule() {
    const project = ['executionProfile', 'artifactLoader', 'instrumentedAccess',
        'claimBinding', 'executionRegistry', 'observationContract',
        'observationScalars', 'proofContextBinding', 'proofParentBinding', 'materialFingerprintCore', 'proofObservedValues',
        'pinnedCivilTimezone', 'civilCalendar', 'literalTypes', 'phaseCompositionProfile', 'claimMonthIsolatedProfile'];
    const recipe = [
        ['provenance/executionHostChild.js', 'src/next/provenance/executionHostChild.cjs'],
        ...project.map(name => [`provenance/${name}.js`, `src/next/provenance/${name}.js`]),
        ['kernel/canonicalValue.js', 'src/next/kernel/canonicalValue.js'],
        ['vendor/ses.js', 'node_modules/ses/dist/ses.cjs']
    ];
    const sources = recipe.map(([logical, physical]) => {
        const bytes = fs.readFileSync(path.join(root, physical));
        const source = bytes.toString('utf8');
        if (!Buffer.from(source, 'utf8').equals(bytes)) fail('capsule_utf8');
        return { path: logical, source };
    });
    const built = buildTrustedCommonJsBundle({ sources,
        entry: 'provenance/executionHostChild.js', exportName: 'run' });
    const source = `${built.source}(require);\n`;
    const manifest = canonicalValue({ format: 'financasbot.provenance.artifact', version: 1,
        kind: 'tcb', entry: 'bootstrap.js', files: [{ path: 'bootstrap.js',
            media_type: 'text/javascript', sha256: sha256(Buffer.from(source, 'utf8')) }] });
    return Object.freeze({ stage: 'child_capsule_candidate_only', validation_tcb_complete: false,
        source, manifest, artifact_root: sha256(manifest),
        sourceHashes: Object.freeze(built.sourceHashes), nativeExternals: Object.freeze(built.nativeExternals) });
}
const groups = Object.freeze({
    metricSelection: Object.freeze({
        exportName: 'evaluateEconomicMetric',
        modes: Object.freeze({
            consumption_total: 'total', category_consumption: 'category', category_spent: 'spent',
            income_realized: 'income', consumption_by_instrument: 'instrument',
            budget_class_consumption: 'budget_class', category_budget_remaining: 'budget_remaining',
            statement_total: 'statement', safe_daily_pace: 'safe_pace'
        }),
        closure: Object.freeze(['metricSelection', 'civilCalendar', 'literalTypes', 'metricReferences'])
    }),
    metricEffects: Object.freeze({
        exportName: 'evaluateEffects',
        modes: Object.freeze(Object.fromEntries([
            'consumption_effect', 'net_consumption', 'invoice_payment_consumption_effect',
            'gross_consumption', 'refund_amount'
        ].map(id => [id, id]))),
        closure: Object.freeze(['metricEffects', 'metricSelection', 'civilCalendar', 'literalTypes', 'metricReferences'])
    }),
    metricInstallments: Object.freeze({
        exportName: 'evaluateInstallments',
        modes: Object.freeze(Object.fromEntries([
            'installments_projected', 'installments_projected_amount',
            'installments_realized', 'installments_realized_amount', 'projected_installments'
        ].map(id => [id, id]))),
        closure: Object.freeze(['metricInstallments', 'civilCalendar', 'literalTypes', 'metricReferences'])
    }),
    metricDirectReads: Object.freeze({
        exportName: 'evaluateDirectMetric',
        modes: Object.freeze(Object.fromEntries([
            'account_balance', 'balance_delta', 'bills_open', 'calendar_event_count',
            'due_bill_ids', 'due_bills_total', 'eligible_event_count',
            'invoice_payment_amount', 'invoice_payment_target_card', 'merchant_rule_ids',
            'movement_ids', 'owned_cards', 'reminder_count', 'side_effect_count',
            'similar_event_ids', 'source_coverage', 'statement_payment_correspondence'
        ].map(id => [id, id]))),
        closure: Object.freeze(['metricDirectReads', 'metricSelection', 'civilCalendar', 'literalTypes', 'metricReferences'])
    }),
    metricParents: Object.freeze({
        exportName: 'evaluateParentMetric',
        modes: Object.freeze(Object.fromEntries([
            'consumption_difference', 'income_minus_open_bills', 'ranking_winner'
        ].map(id => [id, id]))),
        closure: Object.freeze(['metricParents', 'civilCalendar', 'literalTypes'])
    })
});

// Development build evidence only. The authoring registry cannot be promoted
// to execution by these computed values; review and freeze must bind all 39.
export function buildAvailableMetricArtifacts() {
    const registryPath = path.join(root, base, 'metric-evaluator-registry-v1.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    if (registry.stage !== 'authoring' || registry.entries.length !== 39
        || registry.entries.some(entry => entry.artifact_status !== 'not_built'
            || Object.hasOwn(entry, 'evaluator_artifact_root'))) fail('stage');
    const known = new Map();
    for (const [kernel, group] of Object.entries(groups)) {
        for (const [metric, mode] of Object.entries(group.modes)) {
            if (known.has(metric)) fail('duplicate');
            known.set(metric, { kernel, group, mode });
        }
    }
    const identities = new Set(registry.entries.map(entry => entry.evaluator_id));
    if (identities.size !== 39 || identities.size !== known.size
        || [...known.keys()].some(id => !identities.has(id))) fail('inventory');
    const entries = [];
    for (const entry of registry.entries) {
        const plan = known.get(entry.evaluator_id);
        if (!plan || entry.metric !== entry.evaluator_id || entry.evaluator_version !== 1
            || entry.contract_path !== `${base}/evaluator-contracts/${entry.evaluator_id}.json`) fail('identity');
        // Authoring hashes are over repository LF bytes; the Windows working
        // copy can use CRLF. Execute the exact LF-normalized source we hash.
        const contractBytes = Buffer.from(lfText(path.join(root, entry.contract_path)), 'utf8');
        if (sha256(contractBytes) !== entry.evaluator_contract_hash) fail('contract_hash');
        const contract = JSON.parse(contractBytes.toString('utf8'));
        if (contract.stage !== 'authoring' || contract.metric !== entry.metric || contract.unit !== entry.unit
            || contract.signature?.operands !== 'resolve_roles_from_metric_evaluator_registry') fail('contract');
        const sources = plan.group.closure.map(name => ({ path: `${name}.js`,
            source: lfText(path.join(root, 'src/next/provenance', `${name}.js`)) }));
        const built = buildTypedMetricGuestBundle({ sources, entry: `${plan.kernel}.js`,
            exportName: plan.group.exportName, constants: [plan.mode],
            unit: entry.unit, kind: contract.signature.output.kind });
        const bytes = Buffer.from(built.source, 'utf8');
        const manifest = canonicalValue({ format: 'financasbot.provenance.artifact', version: 1,
            kind: 'metric', entry: 'bundle.js',
            files: [{ path: 'bundle.js', media_type: 'text/javascript', sha256: sha256(bytes) }] });
        entries.push(Object.freeze({ evaluator_id: entry.evaluator_id,
            evaluator_version: 1, artifact_root: sha256(manifest),
            manifest, source: built.source, sourceHashes: built.sourceHashes }));
    }
    return Object.freeze({ stage: 'metric_build_evidence_only',
        built: Object.freeze(entries) });
}

// Candidate bytes only. Publishing this as authority requires independent
// review, freeze linkage and host admission; a computed root is not a GO.
export function buildExecutionRegistryCandidate() {
    const built = buildAvailableMetricArtifacts();
    const registry = JSON.parse(lfText(path.join(root, base, 'metric-evaluator-registry-v1.json')));
    const roots = new Map(built.built.map(item => [item.evaluator_id, item.artifact_root]));
    registry.stage = 'execution';
    for (const entry of registry.entries) {
        const root = roots.get(entry.evaluator_id);
        if (!root) fail('missing_artifact');
        entry.artifact_status = 'bound';
        entry.evaluator_artifact_root = root;
    }
    const validators = buildSchemaValidators().validators;
    if (validators.registry(registry) !== true) fail('execution_schema');
    const bytes = canonicalValue(registry);
    return Object.freeze({ stage: 'execution_registry_candidate_only',
        registry: freezeDeep(registry), bytes, registry_hash: sha256(bytes) });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv.length !== 3 || process.argv[2] !== '--check') fail('usage');
    const result = buildAvailableMetricArtifacts();
    console.log(JSON.stringify({ stage: result.stage, built: result.built.length }));
}
```

## scripts/agent/buildNextProvenanceArtifacts.mjs

SHA-256 a563450252a995a0a35d83dc921c8af931bcb330c642e6de7a92857cd3a2fb2b; Git blob e6019ce7b832ff2b37311ad6562aea4a79296f1b; bytes 13450.

```javascript
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
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
function buildClosedCommonJsBundle({ sources, entry, exportName, constants = [], nativeImports = [] }, trusted = false) {
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
    if (!Array.isArray(nativeImports) || nativeImports.length > 16 || !trusted && nativeImports.length) fail('native_imports');
    const declaredNative = new Set(); const usedNative = new Set();
    for (const row of nativeImports) {
        if (!row || Object.keys(row).sort().join(',') !== 'source,specifier' || !files.has(row.source)
            || !(['node:child_process', 'node:path'].includes(row.specifier)
                || row.source === 'provenance/nativeRuntime.js' && row.specifier === 'node:fs'
                || ['provenance/capturedTcbLauncher.js', 'provenance/selectedEventDayLauncher.js'].includes(row.source)
                    && row.specifier === 'node:vm')) fail('native_imports');
        const key = JSON.stringify([row.source, row.specifier]);
        if (declaredNative.has(key)) fail('native_imports'); declaredNative.add(key);
    }
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
                // Only the trusted project capsule can link the declared Node
                // runtime primitives. These are never evaluator endowments.
                const nativeKey = JSON.stringify([file, specifier]);
                if (trusted && (['node:crypto', 'node:util', 'node:process'].includes(specifier) || declaredNative.has(nativeKey))) {
                    if (declaredNative.has(nativeKey)) usedNative.add(nativeKey);
                    if (!outgoing.has(specifier)) {
                        outgoing.set(specifier, specifier);
                        imports.push({ source: file, specifier, target: specifier });
                    }
                    return;
                }
                if (trusted && specifier === 'ses') {
                    if (!files.has('vendor/ses.js')) fail('import_target');
                    if (!outgoing.has(specifier)) {
                        outgoing.set(specifier, 'vendor/ses.js');
                        imports.push({ source: file, specifier, target: 'vendor/ses.js' });
                    }
                    return;
                }
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
    if (usedNative.size !== declaredNative.size) fail('unused_native_import');
    const active = new Set(); const seen = new Set();
    function visit(file) {
        if (active.has(file)) fail('cycle');
        if (seen.has(file)) return;
        active.add(file); for (const target of links.get(file).values()) if (!target.startsWith('node:')) visit(target);
        active.delete(file); seen.add(file);
    }
    visit(entry); if (seen.size !== files.size) fail('unreachable_source');
    const ordered = [...files.keys()].sort(); const index = new Map(ordered.map((name, i) => [name, i]));
    const factories = ordered.map(name => `function(require, module, exports${trusted ? ', __dirname, __filename' : ''}) {\n${files.get(name)}\n}`).join(',\n');
    const mapping = ordered.map(name => [...links.get(name)].map(([specifier, target]) =>
        [specifier, target.startsWith('node:') ? target : index.get(target)]));
    const source = `(function(${trusted ? 'nativeRequire' : 'operands'}) {\n'use strict';\n// closed-commonjs-bundle-v1\nconst factories = [${factories}];\n`
        + `const edges = ${JSON.stringify(mapping)};\nconst cache = new Map();\n`
        + `function load(index) {\nif (cache.has(index)) return cache.get(index);\n`
        + `const module = { exports: Object.create(null) };\n`
        + `const localRequire = name => { const edge = edges[index].find(pair => pair[0] === name); if (!edge) throw new Error('guest_bundle_unresolved'); return ${trusted ? "typeof edge[1] === 'string' ? nativeRequire(edge[1]) : " : ''}load(edge[1]); };\n`
        + `factories[index](localRequire, module, module.exports${trusted ? `, ${JSON.stringify(ordered.map(name => path.posix.dirname(name)))}[index], ${JSON.stringify(ordered)}[index]` : ''});\ncache.set(index, module.exports); return module.exports;\n}\n`
        + `return load(${index.get(entry)})[${JSON.stringify(exportName)}]${trusted ? '' : `(operands${constants.map(v => `, ${JSON.stringify(v)}`).join('')})`};\n})`;
    if (!trusted) validateGuestBundle(source);
    return { stage: 'bundled_source_only', source, imports,
        sourceHashes: ordered.map(name => ({ path: name, sha256: `sha256:${createHash('sha256').update(files.get(name), 'utf8').digest('hex')}` })) };
}

// Build-time only. No loadSchema hook, external resolution, coercion, removal
// of unknown fields or insertion of defaults. Schema semantics remain draft-07.
// Output type comes from the registry/contract; this adapter shapes only R.
export function buildTypedMetricGuestBundle({ sources, entry, exportName, constants = [], unit, kind }) {
    const allowed = { BRL_minor: ['money_minor'], count: ['nonnegative_integer'],
        entity_ids: ['id', 'id_set'], state: ['enum'] };
    if (!Object.hasOwn(allowed, unit) || !allowed[unit].includes(kind)) throw new Error('guest_bundle_output_invalid');
    const built = buildCommonJsGuestBundle({ sources, entry, exportName, constants });
    const source = `(function(operands) {\n'use strict';\nconst evaluate = ${built.source};\n`
        + `return { unit: ${JSON.stringify(unit)}, kind: ${JSON.stringify(kind)}, value: evaluate(operands) };\n})`;
    validateGuestBundle(source);
    return { ...built, source };
}

export function buildCommonJsGuestBundle(input) {
    return buildClosedCommonJsBundle(input);
}

// Build product, not runtime admission. The launcher must still capture and
// admit this complete output against an independently reviewed expected root.
// In particular this does not let the bootstrap authenticate its own bytes.
export function buildTrustedCommonJsBundle(input) {
    if (input.constants?.length) throw new Error('guest_bundle_input');
    const built = buildClosedCommonJsBundle(input, true);
    return { ...built, stage: 'trusted_bundle_candidate_only', executable: false,
        nativeExternals: [...new Set(built.imports.map(row => row.target)
            .filter(target => target.startsWith('node:')))].sort() };
}

function compileSchemaDocuments(documents) {
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
        const document = documents.get(relative);
        if (!document) throw new Error(`admitted_schema_missing:${relative}`);
        const { value: schema, sha256 } = document;
        schemaHashes.push({ path: relative, sha256 });
        if (schema.$schema !== 'http://json-schema.org/draft-07/schema#') throw new Error('schema_dialect_mismatch');
        ajv.addSchema(schema);
        exports[name] = schema.$id;
    }
    const validators = Object.fromEntries(Object.entries(exports).map(([name, id]) => [name, ajv.getSchema(id)]));
    const code = standaloneCode(ajv, exports);
    return { validators, code, schemaHashes };
}

export function buildSchemaValidators() {
    const documents = new Map(Object.values(schemaNames).map(stem => {
        const relative = `${schemaDirectory}/${stem}.schema.json`;
        const bytes = fs.readFileSync(path.join(root, relative));
        return [relative, { value: JSON.parse(bytes.toString('utf8')),
            sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}` }];
    }));
    return compileSchemaDocuments(documents);
}

// HARNESS only: validators are built from the same opaque admitted package
// used by the compiler. No disk fallback or caller-supplied validation callback.
export function buildAdmittedSchemaValidators(packageReceipt) {
    const { admittedDocuments } = createRequire(import.meta.url)('../../src/next/provenance/packageContract');
    return compileSchemaDocuments(new Map(admittedDocuments(packageReceipt).map(row => [row.path, row])));
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
```

## scripts/agent/buildNextValidationTcb.mjs

SHA-256 05fc2d65d7c44f42ea889720e992a95a57b2a24d270c36485ac0de9b3f9464b7; Git blob 23eaa5244bb0dfe10d1443214b00c8480eba2a20; bytes 7279.

```javascript
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { canonicalValue } from '../../src/next/kernel/canonicalValue.js';
import { buildSchemaValidators, buildTrustedCommonJsBundle } from './buildNextProvenanceArtifacts.mjs';
import { buildMetricChildCapsule } from './buildNextMetricArtifacts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = source => `sha256:${createHash('sha256').update(source, 'utf8').digest('hex')}`;
const project = Object.freeze(['validationTcbEntry', 'artifactLoader', 'authoringIR', 'causalRecorder', 'claimBinding',
    'claimContext', 'claimNominalTypes', 'claimRequirementCore', 'claimRequirements', 'claimMonthPathProfile',
    'claimMonthIsolatedProfile', 'claimMonthProofConformance', 'claimMonthTraceContract',
    'collectionRequirements', 'executionHost', 'executionProfile', 'executionRegistry',
    'financialHost', 'freezeContract', 'graphCompiler', 'graphStructure', 'instrumentedAccess', 'literalTypes', 'nativeRuntime', 'obligationBindings', 'observationContract',
    'observationScalars', 'operandBindings', 'operatorTypes', 'packageContract', 'phaseCompositionProfile', 'pinnedCivilTimezone',
    'predicateTypes', 'proofAcceptance', 'proofContextBinding', 'proofParentBinding', 'scalarProofOperators',
    'schemaRegistryProjection', 'selectionBindings', 'templateReferences', 'proofOperators', 'proofOperatorContracts', 'phaseProgramIdentity',
    'scalarProofCore', 'proofObservedValues', 'materialFieldTypes', 'collectionProofCore', 'materialFingerprintCore', 'civilCalendar']);
function captured(file) {
    const bytes = fs.readFileSync(path.join(root, file)); const source = bytes.toString('utf8');
    if (!Buffer.from(source, 'utf8').equals(bytes)) throw new Error('validation_tcb_utf8');
    return source;
}
function rewrite(source, from, to) {
    const token = `require(${JSON.stringify(from)})`;
    if (!source.includes(token)) throw new Error('validation_tcb_schema_import');
    return source.replaceAll(token, `require(${JSON.stringify(to)})`);
}
export function buildCapturedValidationTools() {
    const schema = buildSchemaValidators();
    let code = schema.code;
    for (const [from, to] of [['ajv/dist/runtime/equal', './ajvEqual'], ['ajv/dist/runtime/ucs2length', './ucs2length'],
        ['ajv-formats/dist/formats', './formats']]) code = rewrite(code, from, to);
    const sources = project.map(name => ({ path: `provenance/${name}.js`,
        source: name === 'claimMonthProofConformance' ? rewrite(captured(`src/next/provenance/${name}.js`), 'acorn', '../vendor/acorn')
            : captured(`src/next/provenance/${name}.js`) }));
    sources.push({ path: 'vendor/acorn.js', source: captured('node_modules/acorn/dist/acorn.js') });
    sources.push({ path: 'kernel/canonicalValue.js', source: captured('src/next/kernel/canonicalValue.js') },
        { path: 'vendor/schemaValidators.js', source: code },
        { path: 'vendor/ajvEqual.js', source: rewrite(captured('node_modules/ajv/dist/runtime/equal.js'), 'fast-deep-equal', './fastDeepEqual') },
        { path: 'vendor/ucs2length.js', source: captured('node_modules/ajv/dist/runtime/ucs2length.js') },
        { path: 'vendor/formats.js', source: captured('node_modules/ajv-formats/dist/formats.js') },
        { path: 'vendor/fastDeepEqual.js', source: captured('node_modules/fast-deep-equal/index.js') });
    const built = buildTrustedCommonJsBundle({ sources, entry: 'provenance/validationTcbEntry.js', exportName: 'capturedValidationTools',
        nativeImports: [...['node:path', 'node:child_process'].map(specifier => ({ source: 'provenance/executionHost.js', specifier })),
            { source: 'provenance/nativeRuntime.js', specifier: 'node:fs' }] });
    const child = buildMetricChildCapsule();
    const launcherSources = ['capturedTcbLauncher', 'artifactLoader', 'freezeContract', 'nativeRuntime', 'observationContract', 'observationScalars']
        .map(name => ({ path: `provenance/${name}.js`, source: captured(`src/next/provenance/${name}.js`) }));
    launcherSources.push({ path: 'kernel/canonicalValue.js', source: captured('src/next/kernel/canonicalValue.js') });
    const launcher = buildTrustedCommonJsBundle({ sources: launcherSources, entry: 'provenance/capturedTcbLauncher.js', exportName: 'launchCapturedTcb',
        nativeImports: [{ source: 'provenance/nativeRuntime.js', specifier: 'node:fs' },
            ...['node:vm', 'node:path', 'node:child_process'].map(specifier => ({ source: 'provenance/capturedTcbLauncher.js', specifier }))] });
    const childHashes = new Map(child.sourceHashes.map(row => [row.path, row.sha256]));
    for (const row of built.sourceHashes) if (childHashes.has(row.path) && childHashes.get(row.path) !== row.sha256) {
        throw new Error('validation_tcb_shared_source_mismatch');
    }
    const hostHashes = new Map(built.sourceHashes.map(row => [row.path, row.sha256]));
    for (const row of launcher.sourceHashes) if (hostHashes.has(row.path) && hostHashes.get(row.path) !== row.sha256)
        throw new Error('validation_tcb_shared_source_mismatch');
    // This root commits launcher/host/schema bytes plus the actual child.
    // Building it does not confer independently reviewed freeze authority or GO.
    const recipeFiles = ['scripts/agent/buildNextValidationTcb.mjs', 'scripts/agent/buildNextProvenanceArtifacts.mjs',
        'scripts/agent/buildNextMetricArtifacts.mjs', 'scripts/agent/lowerNextProofProgram.mjs',
        'scripts/agent/nextProvenanceGuestProfile.js', 'package.json', 'package-lock.json'];
    const recipe = canonicalValue({ version: 1, native_globals: ['Buffer', 'clearTimeout', 'process', 'setTimeout'],
        native_externals: built.nativeExternals, launcher_native_externals: launcher.nativeExternals, schema_sources: schema.schemaHashes,
        recipes: recipeFiles.map(file => ({ path: file, source: captured(file) })) });
    const source = `${built.source}(require)();\n`;
    const launcherSource = `${launcher.source}(require);\n`;
    const entries = [{ path: 'child-bootstrap.js', source: child.source }, { path: 'host-bootstrap.js', source },
        { path: 'launcher-bootstrap.js', source: launcherSource },
        { path: 'recipe.json', source: recipe }];
    const manifest = canonicalValue({ format: 'financasbot.provenance.artifact', version: 1, kind: 'tcb', entry: 'launcher-bootstrap.js',
        files: entries.map(row => ({ path: row.path, media_type: row.path.endsWith('.json') ? 'application/json' : 'text/javascript', sha256: hash(row.source) })) });
    return Object.freeze({ stage: 'captured_validation_tcb_build_only', validation_tcb_complete: false, financial_acceptance: false,
        source, manifest, artifact_root: hash(manifest), entries: Object.freeze(entries.map(Object.freeze)),
        hostSourceHashes: Object.freeze(built.sourceHashes), child, nativeExternals: Object.freeze(built.nativeExternals),
        hostImportBindings: Object.freeze(built.imports.map(row => Object.freeze({ ...row }))),
        launcherSource, launcherSourceHashes: Object.freeze(launcher.sourceHashes), launcherNativeExternals: Object.freeze(launcher.nativeExternals) });
}
```

## scripts/agent/capturePathQualificationCompiler.mjs

SHA-256 486f0154003e71c0284887a3c9735c1f2896fd84134a3667d99edc8586085611; Git blob 37f8bbfef08ed5f960b5c61b4e21d489401bd418; bytes 52261.

```javascript
// Trusted BUILD controls only. Capturing/compiling the normal pipeline is not
// a static exclusion certificate, proof execution, independent replay or GO.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import { types } from 'node:util';
import { readFileSync } from 'node:fs';
import { buildCapturedValidationTools } from './buildNextValidationTcb.mjs';
import { canonicalValue, freezeDeep } from '../../src/next/kernel/canonicalValue.js';
import { admitArtifact, artifactContents } from '../../src/next/provenance/artifactLoader.js';
import { admittedDocuments, admittedPackageEntries } from '../../src/next/provenance/packageContract.js';
import { takePathQualificationCandidatePackage, verifyPathCandidateWholeIRReference,
    readPathWholeIRFailure, takePathQualificationWitnessPreselection,
    preparePathCandidateProgramAuthorship, materializePathStaticDomainControl,
    materializePathSelectionAdmissionControl } from '../../src/next/provenance/pathQualificationV3.js';
import { resolvePathCandidateProgramExpectation, verifyPathCandidatePrograms,
    readPathCandidateProgramFailure, verifyPathCandidateMetrics,
    verifyPathCandidateMetricBindings, verifyPathCandidateClosure,
    recheckPathCandidateCapabilities, verifyPathCandidateCapabilityBuildBinding,
    sealPathCandidateProgramExpectation } from './pathProofProgramContract.mjs';
import { buildPhaseProofProgram } from './lowerNextProofProgram.mjs';
import { buildAvailableMetricArtifacts, buildExecutionRegistryCandidate } from './buildNextMetricArtifacts.mjs';
import { copyData } from '../../src/next/provenance/observationContract.js';

const require = createRequire(import.meta.url);
const captures = new WeakMap(), evidence = new WeakMap();
const programArtifacts = new WeakMap();
const metricArtifacts = new WeakMap();
const executionPayloads = new WeakMap(), issuedExecutionTransports = new WeakSet();
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw new Error('path_qualification_compiler_' + code); };
function fields(raw, names) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== names.length || names.some(name => !d[name]?.enumerable
        || !Object.hasOwn(d[name], 'value'))) fail('input');
    return Object.fromEntries(names.map(name => [name, d[name].value]));
}
export function capturePathQualificationCompiler(...args) {
    if (args.length) fail('capture_input');
    const built = buildCapturedValidationTools();
    const recipe = built.entries.find(entry => entry.path === 'recipe.json')?.source;
    if (!recipe) fail('recipe');
    const recipeData = JSON.parse(recipe), schemas = recipeData.schema_sources;
    const allowed = ['node:crypto', 'node:util', 'node:process', 'node:path', 'node:fs', 'node:child_process'];
    if (built.nativeExternals.some(name => !allowed.includes(name))) fail('native_import');
    const source = '(function(require){const tools=' + built.source
        + ';return Object.freeze({admitPackage:tools.admitPackage,compileAuthoringIR:tools.compileAuthoringIR,'
        + 'compileSnapshotAccess:tools.compileSnapshotAccess,readNativePathDiagnostic:tools.readNativePathDiagnostic,'
        + 'admitPhaseCompositionProfile:tools.admitPhaseCompositionProfile});})';
    const entry = 'path-qualification-compiler.js';
    const entries = [{ path: entry, source }, { path: 'path-qualification-compiler-recipe.json', source: recipe }]
        .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    const manifest = canonicalValue({ format: 'financasbot.provenance.artifact', version: 1, kind: 'tcb', entry,
        files: entries.map(row => ({ path: row.path, media_type: row.path.endsWith('.json')
            ? 'application/json' : 'text/javascript', sha256: hash(row.source) })) });
    const artifact = admitArtifact({ manifestBytes: Buffer.from(manifest), expectedRoot: hash(manifest),
        entries: entries.map(row => ({ path: row.path, bytes: Buffer.from(row.source) })) });
    const contents = artifactContents(artifact);
    const state = { failed: false, handleAttempts: 0, schemas,
        schemaBuildSource: recipeData.recipes.find(row => row.path === 'scripts/agent/buildNextProvenanceArtifacts.mjs')?.source,
        entries, manifest, sourceHashes: built.hostSourceHashes,
        childSourceHashes: built.child.sourceHashes,
        imports: built.hostImportBindings, nativeExternals: built.nativeExternals };
    const deny = () => { state.handleAttempts++; state.failed = true; fail('handle_forbidden'); };
    state.tools = runInThisContext(contents.files.find(file => file.path === contents.entry).source)(name => {
        if (!built.nativeExternals.includes(name)) fail('native_import');
        if (name === 'node:fs') return Object.freeze({ readFileSync: deny });
        if (name === 'node:child_process') return Object.freeze({ fork: deny, spawn: deny });
        return require(name);
    });
    const receipt = freezeDeep({ stage: 'path_v3_captured_normal_compiler_build_only',
        artifact_root: artifact.observed_root,
        normal_compiler_source_bindings_sha256: hash(canonicalValue(built.hostSourceHashes)),
        normal_child_source_bindings_sha256: hash(canonicalValue(built.child.sourceHashes)),
        selection_binding_source_sha256: built.hostSourceHashes.find(row => row.path === 'provenance/selectionBindings.js')?.sha256,
        validation_tcb_complete: false, financial_acceptance: false });
    captures.set(receipt, state);
    return receipt;
}
export function compilePathQualificationCandidate(raw) {
    const { capture, candidate } = fields(raw, ['capture', 'candidate']);
    return compileCapturedCandidate(capture, candidate, null, null);
}
export function compilePathQualificationProgramCandidate(raw) {
    const { capture, candidate, expectation } = fields(raw, ['capture', 'candidate', 'expectation']);
    const plan = resolvePathCandidateProgramExpectation({ expectation, candidate });
    return compileCapturedCandidate(capture, candidate, expectation, plan);
}
// Trusted BUILD integration only: selection/reference precede the independent
// authorial program seal and the captured NORMAL lowering. No guest D/P is run,
// and unknown admission/effect premises remain blocked, not W qualification.
export function compilePathQualificationWitnessPreselection(raw) {
    if (!raw || typeof raw !== 'object' || types.isProxy(raw)) fail('input');
    const hasReview = Object.hasOwn(Object.getOwnPropertyDescriptors(raw), 'normalRuleReview');
    const { capture, plan, phaseProfile, normalRuleReview } = fields(raw, hasReview
        ? ['capture', 'plan', 'phaseProfile', 'normalRuleReview'] : ['capture', 'plan', 'phaseProfile']);
    const state = captures.get(capture);
    if (!state || state.failed) fail('capture_authority_or_poisoned');
    const candidate = takePathQualificationWitnessPreselection({ plan });
    let preselection = freezeDeep({ stage: plan.stage, qualification_id: plan.qualification_id,
        target_id: plan.target_id, method_authority: plan.method_authority,
        domain_sha256: plan.domain_sha256, entries_sha256: plan.entries_sha256,
        conditional_domain_partition: plan.conditional_domain_partition,
        conditional_domain_partition_sha256: plan.conditional_domain_partition_sha256,
        selected: plan.selected, expected_violations: plan.expected_violations,
        site_admission_control_plan_sha256: plan.site_admission_control_plan_sha256,
        selection_admission_control_plan_sha256: plan.selection_admission_control_plan_sha256,
        selection_rule: plan.selection_rule, locator_domain_complete: plan.locator_domain_complete,
        admitted_domain_complete: plan.admitted_domain_complete,
        witness_domain_complete: false, first_witness_proved: false, normal_admission_verified: false,
        disposition: 'blocked', qualified: false, semantic_mutation_credit: 0 });
    let normalCompilePathEntered = false;
    try {
        // Trusted BUILD provisioning, never guest approval or authentication
        // of this caller/receipt. Operational use requires the external pin
        // already confronted with independent code+reference review.
        let reviewPacket = null, reviewSnapshot = null;
        if (hasReview) {
            try { reviewPacket = fields(normalRuleReview, ['snapshotSource', 'expectedReviewHash']); }
            catch { fail('rule_review_packet'); }
            if (typeof reviewPacket.snapshotSource !== 'string' || !reviewPacket.snapshotSource.length
                || reviewPacket.snapshotSource.length > 1048576
                || typeof reviewPacket.expectedReviewHash !== 'string'
                || !/^sha256:[a-f0-9]{64}$/.test(reviewPacket.expectedReviewHash)
                || hash(reviewPacket.snapshotSource) !== reviewPacket.expectedReviewHash) fail('rule_review_pin');
            try {
                reviewSnapshot = JSON.parse(JSON.stringify(copyData(JSON.parse(reviewPacket.snapshotSource))));
                fields(reviewSnapshot, ['format', 'version', 'stage', 'core']);
                if (canonicalValue(reviewSnapshot) !== reviewPacket.snapshotSource
                    || reviewSnapshot.format !== 'financasbot.path-normal-rule-review-snapshot'
                    || reviewSnapshot.version !== 1 || reviewSnapshot.stage !== 'path_v3_normal_rule_review_snapshot_only'
                    || reviewSnapshot.core.target_id !== plan.target_id
                    || canonicalValue(reviewSnapshot.core.method_authority) !== canonicalValue(plan.method_authority)
                    || reviewSnapshot.core.conditional_partition.domain_sha256 !== plan.domain_sha256)
                    fail('rule_review_snapshot');
            } catch { fail('rule_review_snapshot'); }
        }
        const authorship = preparePathCandidateProgramAuthorship({ candidate, phaseProfile });
        const expectation = sealPathCandidateProgramExpectation({ authorship });
        const programPlan = resolvePathCandidateProgramExpectation({ expectation, candidate });
        // Bind the real compiler/checker/recipe bytes BEFORE the first native
        // control C. A control observation can contradict its precommitment,
        // never choose the domain, coordinate or semantic candidate afterwards.
        recheckPathCandidateCapabilities({ expectation });
        const precompileBuildBinding = verifyPathCandidateCapabilityBuildBinding({ expectation, sourceHashes: state.sourceHashes,
            childSourceHashes: state.childSourceHashes, schemaSources: state.schemas, schemaBuildSource: state.schemaBuildSource });
        let reviewDomainSeal = null;
        if (reviewPacket) {
            // Only the invocation identifier is ephemeral. Keep locators,
            // candidate identities, reference values and every other field.
            // This is a content-scoped expectation, not reuse of execution.
            const stableEntries = plan.entries.map(entry => {
                const { invocation_id, ...stable } = entry;
                if (stable.reference !== null) {
                    const { invocation_id: ignored, ...reference } = stable.reference;
                    stable.reference = reference;
                }
                return stable;
            });
            const stablePartition = { ...plan.conditional_domain_partition,
                entries: plan.conditional_domain_partition.entries.map(member => ({ ...member,
                    reference_sha256: stableEntries[member.entry_index].reference === null ? null
                        : hash(canonicalValue(stableEntries[member.entry_index].reference)) })) };
            const siteDomains = plan.admission_foundation.sites.map(site => {
                const members = stablePartition.entries.filter(member => member.site_index === site.site_index);
                return { site_index: site.site_index, L: members.map(member => member.locator_index),
                    A: members.filter(member => ['conditional_witness', 'conditional_non_witness'].includes(member.classification))
                        .map(member => member.locator_index),
                    W: members.filter(member => member.classification === 'conditional_witness').map(member => member.locator_index),
                    excluded: members.filter(member => member.classification === 'necessary_exclusion_pending_native_barrier')
                        .map(member => member.locator_index) };
            });
            // Pertinent rule/reference producer bindings, not a claim that
            // this list alone closes BUILD/TCB. Execution keeps normal freeze
            // admission and an independently reviewed external TCB pin.
            const producerPaths = ['src/next/provenance/pathQualificationV3.js',
                'src/next/provenance/pathLocatorDomainV3.js', 'src/next/provenance/pathMutationInventory.js',
                'src/next/provenance/pathSemanticReference.js', 'scripts/agent/capturePathQualificationCompiler.mjs',
                'scripts/agent/pathProofProgramContract.mjs', 'scripts/agent/pathExecutableClosureContract.mjs',
                'scripts/agent/pathCapabilityEffectContract.mjs', 'scripts/agent/pathReceiverOriginContract.mjs'];
            // Code bytes are not observation scalars. Preserve the entire raw
            // source in bounded scalar chunks so the existing 65536-character
            // scalar and 1MiB aggregate copy quotas remain unchanged.
            const referenceData = expectation.normal_admission_checker_reference;
            const snapshotReference = { ...referenceData };
            for (const key of ['sources', 'schema_reference_sources']) snapshotReference[key] = referenceData[key].map(row => {
                const { source, ...metadata } = row;
                return { ...metadata, source_chunks: Array.from({ length: Math.ceil(source.length / 65536) },
                    (_, index) => source.slice(index * 65536, (index + 1) * 65536)) };
            });
            const core = { method_authority: plan.method_authority, target_id: plan.target_id, target: candidate.target,
                baseline_package: plan.baseline_package, phase_profile_sha256: expectation.profile_sha256,
                compiler: { artifact_root: capture.artifact_root,
                    host_sources_sha256: capture.normal_compiler_source_bindings_sha256,
                    child_sources_sha256: capture.normal_child_source_bindings_sha256 },
                authority_builder_sources: producerPaths.map(path => ({ path,
                    sha256: hash(readFileSync(new URL('../../' + path, import.meta.url))) })),
                normal_rule_reference: snapshotReference,
                entries: stableEntries, conditional_partition: stablePartition, per_site_domains: siteDomains,
                native_control_plans: { unknown: plan.site_admission_control_plan,
                    selection: plan.selection_admission_control_plan },
                scope: 'finite_target_normal_admission_and_independent_witness_not_equivalence',
                qualified: false, semantic_mutation_credit: 0, dp_execution: false, financial_acceptance: false };
            if (canonicalValue(reviewSnapshot.core) !== canonicalValue(core)) fail('rule_review_reference_binding');
            const partition = plan.conditional_domain_partition;
            const first = partition.entries.find(member => member.classification === 'conditional_witness');
            if (!partition.conditional_admission_partition_complete || !partition.conditional_witness_partition_complete
                || partition.entries.some(member => !['necessary_exclusion_pending_native_barrier',
                    'conditional_witness', 'conditional_non_witness'].includes(member.classification))
                || !first || first.entry_index !== plan.selected.entry_index
                || plan.selected.candidate_id !== candidate.candidate_id
                || plan.selected.invocation_id !== candidate.invocation_id) fail('rule_review_domain_incomplete');
            reviewDomainSeal = freezeDeep({ stage: 'path_v3_external_review_bound_domain_seal_before_compile',
                method_authority: plan.method_authority, target_id: plan.target_id,
                candidate_id: candidate.candidate_id, invocation_id: candidate.invocation_id,
                domain_sha256: plan.domain_sha256, entries_sha256: plan.entries_sha256,
                conditional_partition_sha256: plan.conditional_domain_partition_sha256,
                entries: plan.entries, selected: plan.selected, snapshot_core: core,
                per_site_domains: siteDomains,
                snapshot_sha256: reviewPacket.expectedReviewHash,
                admitted_domain_complete: true, witness_domain_complete: true, first_witness_proved: true,
                sealed_before_any_captured_compile: true, constructor_authenticates_review: false,
                qualified: false, semantic_mutation_credit: 0, dp_execution: false });
            // Classifications and first candidate are fixed before ANY native
            // compile. Later C/M/S can only contradict this expectation.
            preselection = freezeDeep({ ...preselection, admitted_domain_complete: true,
                witness_domain_complete: true, first_witness_proved: true,
                review_bound_domain_seal: reviewDomainSeal });
        }
        const unknownControls = [], selectionControls = [];
        const declarations = [
            ...plan.site_admission_control_plan.controls.map((control, index) => ({ mode: 'unknown_path', index, control })),
            ...plan.selection_admission_control_plan.controls.map((control, index) => ({ mode: 'necessary_selection_exclusion', index, control }))
        ];
        for (const declaration of declarations) {
            const nativeCandidate = declaration.mode === 'unknown_path'
                ? materializePathStaticDomainControl({ plan: plan.site_admission_control_plan, siteIndex: declaration.index })
                : materializePathSelectionAdmissionControl({ plan: plan.selection_admission_control_plan, controlIndex: declaration.index });
            normalCompilePathEntered = true;
            const observed = compileCapturedCandidate(capture, nativeCandidate);
            const valid = observed.native_control_matched === true && observed.handle_attempts === 0
                && canonicalValue(observed.worlds.map(world => ({ variant: world.variant, admitted: world.admitted })))
                    === canonicalValue([{ variant: 'C', admitted: true }, { variant: 'M', admitted: false }, { variant: 'S', admitted: true }])
                && canonicalValue(observed.worlds[1].diagnostic.native_coordinate)
                    === canonicalValue(declaration.control.expected_diagnostic)
                && observed.worlds[0].ir_sha256 === observed.worlds[2].ir_sha256;
            const entry = freezeDeep({ control_index: declaration.index, mode: declaration.mode,
                site_index: declaration.mode === 'unknown_path' ? declaration.index : declaration.control.site_index,
                candidate_id: observed.candidate_id, invocation_id: observed.invocation_id,
                compiler_artifact_root: observed.compiler_artifact_root, worlds: observed.worlds,
                native_control_matched: observed.native_control_matched, handle_attempts: observed.handle_attempts,
                qualified: false, semantic_mutation_credit: 0, dp_execution: false });
            if (!valid) {
                state.failed = true;
                const error = new Error('path_qualification_compiler_witness_native_control_contradiction');
                evidence.set(error, freezeDeep({ stage: 'path_v3_witness_native_control_contradiction_before_selected_compile',
                    invocation_id: candidate.invocation_id, candidate_id: candidate.candidate_id,
                    compiler_artifact_root: capture.artifact_root, preselection,
                    expected_control: declaration.control, observed_control: entry,
                    handle_attempts: state.handleAttempts, qualified: false, semantic_mutation_credit: 0 }));
                throw error;
            }
            (declaration.mode === 'unknown_path' ? unknownControls : selectionControls).push(entry);
        }
        // Discharge only facts observed through these genuine native controls.
        // The partition/rule basis already existed before every control M;
        // neither a successful selected M nor a checksum supplies its review.
        const normalReference = expectation.normal_admission_checker_reference;
        const partition = preselection.conditional_domain_partition;
        if (hash(canonicalValue(normalReference.normal_rule_composition)) !== partition.normal_rule_composition_sha256
            || hash(canonicalValue(partition)) !== preselection.conditional_domain_partition_sha256
            || hash(canonicalValue(normalReference)) !== precompileBuildBinding.normal_admission_checker_reference_sha256
            || precompileBuildBinding.normal_admission_checker_source_conformance !== true
            || precompileBuildBinding.normal_package_schema_source_conformance !== true)
            fail('witness_normal_rule_partition_binding');
        const positiveRoots = Object.fromEntries(expectation.whole_ir_reference.worlds
            .filter(world => world.variant !== 'M').map(world => [world.variant, world.package_root]));
        const normalBaselineVerified = unknownControls.length === plan.site_admission_control_plan.controls.length
            && unknownControls.length > 0 && [...unknownControls, ...selectionControls].every(control =>
                control.worlds[0].variant === 'C' && control.worlds[0].admitted === true
                && control.worlds[0].whole_ir_conformance === true
                && control.worlds[0].package_root === positiveRoots.C);
        const restorationVerified = [...unknownControls, ...selectionControls].every(control =>
            control.worlds[2].variant === 'S' && control.worlds[2].admitted === true
            && control.worlds[2].whole_ir_conformance === true
            && control.worlds[2].package_root === positiveRoots.S
            && control.worlds[0].ir_sha256 === control.worlds[2].ir_sha256);
        if (!normalBaselineVerified || !restorationVerified
            || selectionControls.length !== plan.selection_admission_control_plan.controls.length)
            fail('witness_normal_baseline_premise_binding');
        const premiseEvidence = freezeDeep({
            stage: 'path_v3_genuine_normal_admission_premises_before_selected_compile',
            conditional_partition_sha256: preselection.conditional_domain_partition_sha256,
            normal_rule_composition_sha256: partition.normal_rule_composition_sha256,
            normal_admission_checker_reference_sha256: precompileBuildBinding.normal_admission_checker_reference_sha256,
            compiler_artifact_root: capture.artifact_root,
            native_controls_sha256: hash(canonicalValue({ unknownControls, selectionControls })),
            positive_package_roots: positiveRoots,
            normal_baseline_admission_verified: normalBaselineVerified,
            normal_checker_binding_verified: true, site_admission_controls_verified: true,
            normal_positive_restoration_verified: restorationVerified,
            sealed_before_selected_normal_compile: true,
            independent_reviewed_rule_basis_verified: false,
            external_rule_review_scope_byte_binding_verified: reviewDomainSeal !== null,
            whole_selected_actual_program_conformance_verified: false,
            admitted_domain_complete: false, witness_domain_complete: false, first_witness_proved: false,
            execution_permitted: false, qualified: false, semantic_mutation_credit: 0 });
        const nativeControls = freezeDeep({ stage: 'path_v3_genuine_native_site_controls_before_selected_compile',
            unknown_path_control_plan_sha256: plan.site_admission_control_plan_sha256,
            selection_control_plan_sha256: plan.selection_admission_control_plan_sha256,
            // Retain the complete genuine pre-M declarations, not only their
            // hashes. The captured initializer must check every observation
            // against this fixed roster; observed M cannot choose its sites.
            unknown_path_control_plan: plan.site_admission_control_plan,
            selection_control_plan: plan.selection_admission_control_plan,
            normal_rule_review: reviewPacket === null ? null : freezeDeep(reviewPacket),
            review_bound_domain_seal: reviewDomainSeal,
            unknown_path_controls: unknownControls, selection_controls: selectionControls,
            normal_admission_premise_evidence: premiseEvidence,
            native_barriers_verified: true, normal_checker_source_conformance_verified: true,
            selected_normal_compile_started_after_controls: true, compiler_result_used_to_define_domain: false,
            qualified: false, semantic_mutation_credit: 0, dp_execution: false });
        if (reviewDomainSeal) preselection = freezeDeep({ ...preselection, normal_admission_verified: true });
        normalCompilePathEntered = true;
        return compileCapturedCandidate(capture, candidate, expectation, programPlan, preselection, nativeControls);
    } catch (error) {
        state.failed = true;
        // Preserve a deeper compiler/byte contradiction rather than overwriting
        // it with this bridge's bookkeeping. Never release another candidate.
        if (!evidence.has(error)) evidence.set(error, freezeDeep({
            stage: normalCompilePathEntered ? 'path_v3_witness_captured_normal_compile_path_failed'
                : 'path_v3_witness_program_preparation_failed_before_compile',
            normal_compile_path_entered: normalCompilePathEntered,
            invocation_id: candidate.invocation_id, candidate_id: candidate.candidate_id,
            witness_preselection: preselection, compiler_artifact_root: capture.artifact_root,
            handle_attempts: state.handleAttempts, qualified: false, semantic_mutation_credit: 0,
            dp_execution: false, validation_tcb_complete: false }));
        throw error;
    }
}
function compileCapturedCandidate(capture, candidate, expectation, programPlan, witnessPreselection = null, nativeControls = null) {
    const state = captures.get(capture);
    if (!state || state.failed) fail('capture_authority_or_poisoned');
    const input = takePathQualificationCandidatePackage({ candidate });
    const worlds = [], retainedPrograms = new Map(), retainedRuntimeWorlds = [];
    let functionalMetrics = null, metricConformance = null, capabilityConformance = null;
    try {
        if (programPlan && programPlan.wholeIRReference !== input.wholeIRReference) fail('program_whole_ir_binding');
        if (programPlan) {
            try {
                recheckPathCandidateCapabilities({ expectation });
                capabilityConformance = verifyPathCandidateCapabilityBuildBinding({ expectation, sourceHashes: state.sourceHashes,
                    childSourceHashes: state.childSourceHashes, schemaSources: state.schemas, schemaBuildSource: state.schemaBuildSource });
            } catch (error) {
                state.failed = true;
                evidence.set(error, freezeDeep({ capability_conformance_failed: true, stage: 'before_first_normal_compile',
                    invocation_id: candidate.invocation_id, candidate_id: candidate.candidate_id,
                    compiler_artifact_root: capture.artifact_root,
                    normal_compiler_source_bindings_sha256: capture.normal_compiler_source_bindings_sha256,
                    normal_child_source_bindings_sha256: capture.normal_child_source_bindings_sha256,
                    program_expectation: expectation, handle_attempts: state.handleAttempts,
                    qualified: false, semantic_mutation_credit: 0 }));
                throw error;
            }
            try {
                functionalMetrics = buildAvailableMetricArtifacts().built;
                metricConformance = verifyPathCandidateMetrics({ expectation, metrics: functionalMetrics });
            } catch (error) {
                state.failed = true;
                evidence.set(error, freezeDeep({ metric_conformance_failed: true, stage: 'before_first_normal_compile',
                    invocation_id: candidate.invocation_id, candidate_id: candidate.candidate_id,
                    program_expectation: expectation, contradiction: readPathCandidateProgramFailure(error),
                    handle_attempts: state.handleAttempts, qualified: false, semantic_mutation_credit: 0 }));
                throw error;
            }
        }
        const phaseProfile = programPlan ? state.tools.admitPhaseCompositionProfile({ source: programPlan.profile.source,
            registry: admittedDocuments(input.restorationReceipt).find(row => row.value?.registry_id === 'metric_evaluator_registry').value }) : null;
        const inputs = ['C', 'M', 'S'].map(variant => {
            const receipt = variant === 'M' ? input.packageReceipt : input.restorationReceipt;
            const documents = admittedDocuments(receipt);
            if (state.schemas.some(schema => documents.find(row => row.path === schema.path)?.sha256 !== schema.sha256))
                fail('schema_identity');
            const authority = documents.map(({ path, sha256 }) => ({ path, sha256 }));
            const entries = admittedPackageEntries(receipt);
            if (entries.length !== authority.length || entries.some(row => hash(row.bytes)
                !== authority.find(expected => expected.path === row.path)?.sha256)) fail('package_identity');
            const expected = input.wholeIRReference.worlds.find(world => world.variant === variant);
            if (canonicalValue(authority) !== canonicalValue(expected.authority_refs)
                || hash(canonicalValue(authority)) !== expected.package_root) fail('whole_ir_package_binding');
            return { variant, authority, entries };
        });
        // All three exact byte tables are admitted before the first compile.
        for (const world of inputs) world.receipt = state.tools.admitPackage({ entries: world.entries, authority: world.authority });
        for (const world of inputs) {
            const base = { variant: world.variant, package_root: hash(canonicalValue(world.authority)) };
            let ir;
            try {
                ir = state.tools.compileAuthoringIR(world.receipt);
            } catch (error) {
                if (state.failed || world.variant !== 'M') throw error;
                const message = typeof error?.message === 'string' && error.message.length <= 512 ? error.message : null;
                const coordinate = state.tools.readNativePathDiagnostic(error);
                worlds.push({ ...base, admitted: false, graph_count: null, ir_sha256: null,
                    whole_ir_conformance: false, access_descriptor_sha256: null,
                    diagnostic: { message, attributed_rule: null,
                        native_coordinate: coordinate, coordinate_authority: coordinate !== null,
                        forged_same_text_has_authority: state.tools.readNativePathDiagnostic(new Error(message || '')) !== null,
                        static_exclusion_verified: false } });
                continue;
            }
            // Conformance exceptions MUST NOT be recast as a native M rejection.
            // Keep immutable causal bindings and the contradiction, then poison.
            let conformance;
            try {
                conformance = verifyPathCandidateWholeIRReference({ reference: input.wholeIRReference,
                    variant: world.variant, ir });
            } catch (error) {
                state.failed = true;
                evidence.set(error, freezeDeep({ ...base, conformance_failed: true,
                    invocation_id: candidate.invocation_id, candidate_id: candidate.candidate_id,
                    compiler_artifact_root: capture.artifact_root, whole_ir_reference: input.wholeIRReference,
                    normal_compiler_source_bindings_sha256: capture.normal_compiler_source_bindings_sha256,
                    contradiction: readPathWholeIRFailure(error),
                    handle_attempts: state.handleAttempts, qualified: false, semantic_mutation_credit: 0 }));
                throw error;
            }
            let access;
            try {
                access = state.tools.compileSnapshotAccess(world.receipt);
            } catch (error) {
                if (state.failed || world.variant !== 'M') throw error;
                // Captured native rejection is retained, but text has neither
                // ratified rule/coordinate authority nor static proof credit.
                const message = typeof error?.message === 'string' && error.message.length <= 512 ? error.message : null;
                const coordinate = state.tools.readNativePathDiagnostic(error);
                worlds.push({ ...base, admitted: false, graph_count: null, ir_sha256: null,
                    whole_ir_conformance: true, access_descriptor_sha256: null, diagnostic: { message, attributed_rule: null,
                        native_coordinate: coordinate, coordinate_authority: coordinate !== null,
                        forged_same_text_has_authority: state.tools.readNativePathDiagnostic(new Error(message || '')) !== null,
                        static_exclusion_verified: false } });
                continue;
            }
            let programs = null, metricBindings = null, closure = null;
            if (programPlan) {
                const actual = [];
                try {
                    metricBindings = verifyPathCandidateMetricBindings({ expectation, variant: world.variant,
                        bindings: ir.order.map(factKey => {
                            const graph = ir.graphs.find(graph => graph.fact_key === factKey);
                            return { fact_key: factKey, evaluator_ref: graph.evaluator_ref,
                                claim: graph.claim, operands: graph.operands,
                                derivation_bindings: access.projectDerivationBindings({ fact_key: factKey }) };
                        }) });
                    for (const factKey of ir.order) actual.push({ fact_key: factKey, candidate: buildPhaseProofProgram({
                        derivation: access.projectDerivationProgram({ fact_key: factKey }, phaseProfile).input,
                        proof: access.projectProofProgram({ fact_key: factKey }).input }, programPlan.phaseProfile) });
                    programs = verifyPathCandidatePrograms({ expectation, variant: world.variant, programs: actual });
                    closure = verifyPathCandidateClosure({ expectation, variant: world.variant,
                        programs: actual, metrics: functionalMetrics });
                    // Retain actual NORMAL builder bytes after passive conformance,
                    // never substitute the expected program as the observed artifact.
                    retainedPrograms.set(world.variant, freezeDeep(actual.map(row => {
                        const { source, manifest, ...metadata } = fields(row.candidate, Object.keys(row.candidate));
                        return { fact_key: row.fact_key, candidate: { source, manifest,
                            ...JSON.parse(JSON.stringify(copyData(metadata))) } };
                    })));
                    if (witnessPreselection) {
                        const factKey = candidate.target.fact_key, selector = { fact_key: factKey };
                        const graph = ir.graphs.find(row => row.fact_key === factKey);
                        const program = actual.find(row => row.fact_key === factKey).candidate;
                        const metric = functionalMetrics.find(row => row.evaluator_id === graph.evaluator_ref.evaluator_id);
                        const documents = admittedDocuments(world.variant === 'M' ? input.packageReceipt : input.restorationReceipt);
                        const registry = documents.find(row => row.value?.registry_id === 'metric_evaluator_registry').value;
                        const entry = registry.entries.find(row => row.evaluator_id === graph.evaluator_ref.evaluator_id);
                        const contract = documents.find(row => row.path === entry.contract_path);
                        const dProgram = access.projectDerivationProgram(selector, phaseProfile).input;
                        const pProgram = access.projectProofProgram(selector).input;
                        const { proofProgramIdentity } = require('../../src/next/provenance/phaseProgramIdentity');
                        const { phaseCompositionCommitment } = require('../../src/next/provenance/phaseCompositionProfile');
                        const metricTransport = access.projectMetricTransport(selector);
                        const proofTransport = access.projectProofTransport(selector);
                        retainedRuntimeWorlds.push({ variant: world.variant, package_root: base.package_root,
                            proof_program_id: proofProgramIdentity(pProgram, dProgram, phaseCompositionCommitment(programPlan.phaseProfile).sha256),
                            evaluator_ref: JSON.parse(JSON.stringify(copyData(graph.evaluator_ref))),
                            registry_source: buildExecutionRegistryCandidate().bytes,
                            contract_source: admittedPackageEntries(world.variant === 'M' ? input.packageReceipt : input.restorationReceipt)
                                .find(row => row.path === contract.path).bytes.toString('utf8'),
                            metric_artifact: { manifest: metric.manifest, entries: [{ path: 'bundle.js', source: metric.source }] },
                            proof_artifact: { manifest: program.manifest, entries: [{ path: 'bundle.js', source: program.source },
                                ...(program.profileInput ? [{ path: program.profileInput.path, source: program.profileInput.source }] : [])] },
                            derivation: JSON.parse(JSON.stringify(copyData({ bindings: [], directGroups: metricTransport.directGroups,
                                nodeSets: metricTransport.nodeSets, parentGroups: metricTransport.parentGroups,
                                derivationBindings: access.projectDerivationBindings(selector) }))),
                            proof: JSON.parse(JSON.stringify(copyData(proofTransport.config))), timeout_ms: 5000 });
                    }
                } catch (error) {
                    state.failed = true;
                    evidence.set(error, freezeDeep({ ...base, program_conformance_failed: true,
                        invocation_id: candidate.invocation_id, candidate_id: candidate.candidate_id,
                        compiler_artifact_root: capture.artifact_root, program_expectation: expectation,
                        contradiction: readPathCandidateProgramFailure(error),
                        actual_programs: actual.map(row => {
                            const source = types.isProxy(row.candidate) ? null : Object.getOwnPropertyDescriptor(row.candidate, 'source');
                            return { fact_key: row.fact_key, source_sha256: typeof source?.value === 'string' ? hash(source.value) : null };
                        }), handle_attempts: state.handleAttempts, qualified: false, semantic_mutation_credit: 0 }));
                    throw error;
                }
            }
            worlds.push({ ...base, admitted: true, graph_count: ir.graphs.length,
                ir_sha256: conformance.ir_sha256, whole_ir_conformance: true,
                ...(programs ? { program_count: programs.program_count, programs_sha256: programs.programs_sha256,
                    whole_phase_program_conformance: programs.whole_phase_program_conformance,
                    module_closure_conformance: closure.module_closure_conformance,
                    static_call_binding_conformance: closure.static_call_binding_conformance,
                    function_boundary_conformance: closure.function_boundary_conformance,
                    conditional_receiver_reference_conformance: closure.conditional_receiver_reference_conformance,
                    conditional_receiver_reference_sha256: closure.conditional_receiver_reference_sha256,
                    effect_obligation_conformance: closure.effect_obligation_conformance,
                    effect_composition_reference_sha256: closure.effect_composition_reference_sha256,
                    effect_composition_status: closure.effect_composition_status,
                    effect_closure_complete: false,
                    operational_receiver_authority: false,
                    module_closure_sha256: closure.module_closure_sha256,
                    metric_count: metricConformance.metric_count, functional_metric_conformance: true,
                    metric_artifacts_sha256: metricConformance.metric_artifacts_sha256,
                    metric_bindings_count: metricBindings.metric_bindings_count,
                    metric_bindings_sha256: metricBindings.metric_bindings_sha256 } : {}),
                access_descriptor_sha256: hash(canonicalValue({ stage: access.stage,
                    executable: access.executable, snapshot_count: access.snapshot_count })), diagnostic: null });
        }
        if (worlds[0].ir_sha256 !== worlds[2].ir_sha256
            || worlds[0].access_descriptor_sha256 !== worlds[2].access_descriptor_sha256) fail('restoration');
        // Readonly diagnosis on this genuine captured result, not a new
        // admission rule, semantic proof or execution authority. Observed
        // compilation cannot retroactively complete the pre-M A/W domains.
        let witnessPrerequisites = null;
        if (witnessPreselection) {
            const referencePreselected = witnessPreselection.selected?.candidate_id === candidate.candidate_id
                && witnessPreselection.selected?.invocation_id === candidate.invocation_id
                && witnessPreselection.selected?.reference_sha256 === hash(canonicalValue(input.reference))
                && input.reference.discriminating === true;
            const selectedCompilationComplete = worlds.length === 3
                && worlds.every((world, index) => world.variant === ['C', 'M', 'S'][index]
                    && world.admitted === true && world.whole_ir_conformance === true
                    && world.whole_phase_program_conformance === true);
            const blockers = [];
            if (!referencePreselected) blockers.push('preselected_reference_binding_incomplete');
            if (!witnessPreselection.admitted_domain_complete) blockers.push('admitted_domain_incomplete');
            if (!witnessPreselection.first_witness_proved) blockers.push('first_witness_not_proved');
            if (!witnessPreselection.normal_admission_verified) blockers.push('normal_site_admission_controls_incomplete');
            if (worlds.some(world => world.admitted === false)) blockers.push('selected_candidate_normal_compile_rejected');
            else if (!selectedCompilationComplete) blockers.push('selected_candidate_program_conformance_incomplete');
            // This BUILD capture has no reviewed execution TCB or ticket.
            // In particular, consumer-absence/equivalence is not imposed as
            // an extra semantic-witness requirement by this diagnostic.
            blockers.push('reviewed_tcb_and_execution_ticket_missing');
            witnessPrerequisites = {
                stage: 'path_v3_witness_execution_prerequisites_not_authority',
                candidate_id: candidate.candidate_id, invocation_id: candidate.invocation_id,
                reference_preselected: referencePreselected,
                selected_candidate_normal_compilation_complete: selectedCompilationComplete,
                blockers, execution_permitted: false, qualified: false, semantic_mutation_credit: 0
            };
        }
        const result = freezeDeep({ stage: 'path_v3_captured_normal_compile_controls_only',
            invocation_id: candidate.invocation_id, target_id: candidate.target_id, candidate_id: candidate.candidate_id,
            compiler_artifact_root: capture.artifact_root, reference: input.reference, worlds,
            whole_ir_reference: input.wholeIRReference,
            ...(witnessPreselection ? { witness_preselection: witnessPreselection,
                witness_execution_prerequisites: witnessPrerequisites,
                witness_site_admission_controls: nativeControls } : {}),
            executable_consumer_absence_proved: false,
            ...(programPlan ? { program_expectation: expectation,
                normal_admission_checker_source_conformance: capabilityConformance.normal_admission_checker_source_conformance,
                normal_package_schema_source_conformance: capabilityConformance.normal_package_schema_source_conformance,
                normal_admission_checker_reference_sha256: capabilityConformance.normal_admission_checker_reference_sha256,
                normal_admission_rule_discharge_complete: capabilityConformance.normal_admission_rule_discharge_complete,
                normal_capability_source_conformance: capabilityConformance.normal_capability_source_conformance,
                normal_capability_reference_sha256: capabilityConformance.normal_capability_reference_sha256,
                normal_child_abi_source_conformance: capabilityConformance.normal_child_abi_source_conformance,
                normal_child_abi_reference_sha256: capabilityConformance.normal_child_abi_reference_sha256,
                guest_call_provenance_complete: false,
                lowerer_capture_scope: 'normal_host_BUILD_output_conformance_only_not_hermetic_TCB' } : {}),
            normal_compiler_source_bindings_sha256: capture.normal_compiler_source_bindings_sha256,
            selection_binding_source_sha256: capture.selection_binding_source_sha256,
            handle_attempts: state.handleAttempts, access_descriptor_scope: 'stage_executable_snapshot_count_only',
            native_control_matched: ['unknown_path_control_for_empty_L', 'unknown_path_control_for_witness_site', 'typed_locator_exclusion_control'].includes(candidate.candidate_kind)
                && worlds[1].admitted === false && worlds[1].diagnostic.native_coordinate !== null
                && worlds[1].diagnostic.forged_same_text_has_authority === false
                && canonicalValue(worlds[1].diagnostic.native_coordinate) === canonicalValue(candidate.expected_diagnostic),
            qualified: false, semantic_mutation_credit: 0, dp_execution: false, validation_tcb_complete: false,
            independent_compiler_execution: false, financial_acceptance: false });
        // Keep the contradictory evidence, but do not permit another M under
        // this capture to search for a matching rejection after the sealed
        // control failed. A new candidate/capture cannot rewrite this result.
        if (['unknown_path_control_for_empty_L', 'unknown_path_control_for_witness_site', 'typed_locator_exclusion_control'].includes(candidate.candidate_kind)
            && !result.native_control_matched) state.failed = true;
        evidence.set(result, result);
        if (programPlan) programArtifacts.set(result, retainedPrograms);
        if (programPlan) metricArtifacts.set(result, freezeDeep(functionalMetrics.map(row =>
            JSON.parse(JSON.stringify(copyData(row))))));
        if (witnessPreselection) executionPayloads.set(result, freezeDeep({ target_fact_key: candidate.target.fact_key,
            payload: { worlds: retainedRuntimeWorlds, normal_admission_basis: {
                stage: 'path_v3_captured_normal_admission_basis_not_independent_review',
                conditional_partition: witnessPreselection.conditional_domain_partition,
                normal_rule_reference: expectation.normal_admission_checker_reference,
                premise_evidence: nativeControls.normal_admission_premise_evidence,
                native_controls: nativeControls, normal_worlds: worlds,
                independent_reviewed_rule_basis_verified: false, qualified: false, semantic_mutation_credit: 0
            } } }));
        return result;
    } catch (error) { state.failed = true; throw error; }
}
export function readPathQualificationCompilerEvidence(raw) { return evidence.get(raw) ?? null; }
// BUILD transport only. The caller cannot supply roots, IDs, references or
// readiness flags. One issue per genuine result; a clone/error has no brand.
// An external independently reviewed provisioning pin is still mandatory at
// the captured bootstrap. This computed commitment is NOT that review.
export function preparePathQualificationExecutionTransport(raw) {
    const { result } = fields(raw, ['result']);
    const payload = executionPayloads.get(result);
    if (!payload || evidence.get(result) !== result || !result.witness_preselection
        || issuedExecutionTransports.has(result)) fail('execution_transport_origin_or_replay');
    issuedExecutionTransports.add(result);
    const preselection = result.witness_preselection, readiness = result.witness_execution_prerequisites;
    const payloadSource = canonicalValue(payload.payload);
    const commitment = source => hash(canonicalValue({ source }));
    const ticket = { stage: 'path_v3_execution_ticket_not_financial_authority',
        method_commit: preselection.method_authority.commit, candidate_id: result.candidate_id,
        invocation_id: result.invocation_id, target_fact_key: payload.target_fact_key,
        reference: result.reference, reference_commitment: hash(canonicalValue(result.reference)),
        preselection_commitments: { entries_sha256: preselection.entries_sha256, domain_sha256: preselection.domain_sha256 },
        normal_admission_basis_commitment: commitment(canonicalValue(payload.payload.normal_admission_basis)),
        prerequisites: { admitted_domain_complete: preselection.admitted_domain_complete,
            witness_domain_complete: preselection.witness_domain_complete, first_witness_proved: preselection.first_witness_proved,
            normal_admission_verified: preselection.normal_admission_verified,
            reference_preselected: readiness.reference_preselected,
            normal_compilation_complete: readiness.selected_candidate_normal_compilation_complete && payload.payload.worlds.length === 3 },
        payload_commitment: commitment(payloadSource), worlds: result.worlds.map(world => ({ variant: world.variant,
            execution_id: `path-v3/${result.invocation_id}/${world.variant}`, package_root: world.package_root })) };
    const ticketSource = canonicalValue(ticket);
    return freezeDeep({ stage: 'path_v3_build_execution_transport_not_reviewed_pin', ticketSource, payloadSource,
        measured_ticket_commitment: commitment(ticketSource), qualified: false, semantic_mutation_credit: 0 });
}
export function readPathQualificationProgramsEvidence(raw) {
    const { result, variant } = fields(raw, ['result', 'variant']);
    const programs = programArtifacts.get(result);
    if (!programs || typeof variant !== 'string' || !['C', 'M', 'S'].includes(variant)
        || !programs.has(variant)) fail('program_evidence_origin_or_no_program');
    return programs.get(variant);
}
export function readPathQualificationMetricEvidence(raw) {
    const { result } = fields(raw, ['result']);
    const metrics = metricArtifacts.get(result);
    if (!metrics) fail('metric_evidence_origin');
    return metrics;
}
```

## src/next/provenance/artifactLoader.js

SHA-256 24d108c16a30e03d96e826da64e94c1ada9a9ef8d4a9edef8e20411dd9a0099f; Git blob 3f1c9fe8fde55f294ef4e0d1b872fe07676c8fcb; bytes 6689.

```javascript
'use strict';

const { createHash } = require('node:crypto');
const { types } = require('node:util');
const { canonicalValue, freezeDeep } = require('../kernel/canonicalValue');
const admitted = new WeakMap();
const FORMAT = 'financasbot.provenance.artifact';
const MANIFEST_LIMIT = 256 * 1024;
const FILE_LIMIT = 8 * 1024 * 1024;
const TOTAL_LIMIT = 32 * 1024 * 1024;
const FILE_COUNT_LIMIT = 512;
const fail = code => { throw new Error(`artifact_${code}`); };
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function fields(value, keys) {
    if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('shape_invalid');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== keys.length || keys.some(key =>
        !Object.hasOwn(descriptors, key) || !Object.hasOwn(descriptors[key], 'value')
        || !descriptors[key].enumerable)) fail('shape_invalid');
    return keys.map(key => descriptors[key].value);
}

function list(value) {
    if (!value || typeof value !== 'object' || types.isProxy(value) || !Array.isArray(value)
        || Object.getPrototypeOf(value) !== Array.prototype) fail('shape_invalid');
    if (!value.length || value.length > FILE_COUNT_LIMIT) fail('inventory_mismatch');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== value.length + 1) fail('shape_invalid');
    const items = [];
    for (let i = 0; i < value.length; i++) {
        const item = descriptors[String(i)];
        if (!item || !Object.hasOwn(item, 'value') || !item.enumerable) fail('shape_invalid');
        items.push(item.value);
    }
    return items;
}

function pathKey(path) {
    if (typeof path !== 'string' || path.length > 512 || !path.split('/').every(part =>
        /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part) && !part.endsWith('.')
        && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) fail('path_invalid');
    return path.toLowerCase();
}

function checkedDigest(value) {
    if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) fail('digest_invalid');
    return value;
}

function captured(source, limit) {
    if (!source || typeof source !== 'object' || types.isProxy(source) || !Buffer.isBuffer(source)
        || Object.getPrototypeOf(source) !== Buffer.prototype) fail('bytes_invalid');
    // Never call a method obtained from the input Buffer itself.
    const length = Reflect.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')
        .get.call(source);
    if (length > limit) fail('size_limit');
    const copy = Buffer.alloc(length);
    // TypedArray-to-TypedArray set reads internal slots; Buffer.copy consults
    // shadowable metadata such as byteLength on the source Buffer.
    Uint8Array.prototype.set.call(copy, source);
    return copy;
}

function utf8(bytes) {
    const source = bytes.toString('utf8');
    if (!Buffer.from(source, 'utf8').equals(bytes)) fail('utf8_invalid');
    return source;
}

/**
 * Pure byte admission for a flat Merkle manifest, NOT a loader that executes JS.
 * expectedRoot must come from the reviewed registry/freeze through the trusted
 * host. Equality proves identity, not completeness/safety of the declared closure.
 * No filesystem, resolution, eval, guest callbacks or recorder writes occur here.
 */
function admitArtifact(input) {
    const [rawManifest, rawEntries, expectedRoot] = fields(input, ['manifestBytes', 'entries', 'expectedRoot']);
    checkedDigest(expectedRoot);
    const manifestBytes = captured(rawManifest, MANIFEST_LIMIT);
    const observedRoot = digest(manifestBytes);
    if (observedRoot !== expectedRoot) fail('root_mismatch');
    const source = utf8(manifestBytes);
    let manifest;
    try { manifest = JSON.parse(source); } catch { fail('manifest_invalid'); }
    const [format, version, kind, entry, rawFiles] = fields(manifest, ['format', 'version', 'kind', 'entry', 'files']);
    if (format !== FORMAT || version !== 1 || !['metric', 'proof', 'tcb'].includes(kind)) fail('manifest_invalid');
    pathKey(entry);
    const files = list(rawFiles);
    const expected = new Map(); const folded = new Set();
    let previous;
    for (const file of files) {
        const [path, mediaType, sha256] = fields(file, ['path', 'media_type', 'sha256']);
        const key = pathKey(path);
        if (folded.has(key)) fail('inventory_duplicate');
        folded.add(key);
        if (previous !== undefined && previous >= path) fail('manifest_noncanonical');
        previous = path;
        if (!((mediaType === 'text/javascript' && /\.js$/.test(path))
            || (mediaType === 'application/json' && /\.json$/.test(path)))) fail('media_type_invalid');
        expected.set(path, { path, media_type: mediaType, sha256: checkedDigest(sha256) });
    }
    if (expected.get(entry)?.media_type !== 'text/javascript') fail('entry_invalid');
    if (canonicalValue(manifest) !== source) fail('manifest_noncanonical');
    const entries = list(rawEntries);
    if (entries.length !== files.length) fail('inventory_mismatch');
    const capturedFiles = new Map(); let totalBytes = 0;
    for (const item of entries) {
        const [path, rawBytes] = fields(item, ['path', 'bytes']);
        pathKey(path);
        if (!expected.has(path)) fail('inventory_mismatch');
        if (capturedFiles.has(path)) fail('inventory_duplicate');
        const bytes = captured(rawBytes, FILE_LIMIT);
        totalBytes += bytes.length;
        if (totalBytes > TOTAL_LIMIT) fail('size_limit');
        const observedHash = digest(bytes);
        if (observedHash !== expected.get(path).sha256) fail('digest_mismatch');
        capturedFiles.set(path, { path, media_type: expected.get(path).media_type,
            source: utf8(bytes), observed_sha256: observedHash });
    }
    const ordered = files.map(file => capturedFiles.get(file.path));
    const contents = freezeDeep({ kind, entry, files: ordered });
    const result = freezeDeep({ stage: 'admitted_artifact_bytes_only', executable: false,
        observed_root: observedRoot,
        measurements: ordered.map(file => ({ path: file.path, observed_sha256: file.observed_sha256 })) });
    admitted.set(result, contents);
    return result;
}

// TCB-only retrieval: a serialized or look-alike receipt is not admission.
function artifactContents(receipt) {
    if (!admitted.has(receipt)) fail('not_admitted');
    return admitted.get(receipt);
}

module.exports = { admitArtifact, artifactContents };
```

## src/next/provenance/capturedTcbLauncher.js

SHA-256 bab76b97d53a368f08dfd24d74041d3a760819a229dd1bf432fb5d9a8f758141; Git blob 95a5e62588d02b129e77e32d4d8ccff4183b395b; bytes 6744.

```javascript
'use strict';
const { runInThisContext } = require('node:vm');
const { types } = require('node:util');
const { canonicalValue, digest } = require('../kernel/canonicalValue');
const { admitExecutionFreeze, admitFrozenArtifact, freezeContents } = require('./freezeContract');
const { artifactContents } = require('./artifactLoader');
const { verifyNativeRuntime, nativeRuntimeFileCapability } = require('./nativeRuntime');
const nativeModules = Object.freeze({ 'node:crypto': require('node:crypto'), 'node:util': require('node:util'),
    'node:process': require('node:process'), 'node:child_process': require('node:child_process'),
    'node:path': require('node:path'), 'node:fs': nativeRuntimeFileCapability() });
const fail = code => { throw new Error(`captured_tcb_${code}`); };
function own(raw, names) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== names.length || names.some(name =>
        !d[name]?.enumerable || !Object.hasOwn(d[name], 'value'))) fail('input');
    return Object.fromEntries(names.map(name => [name, d[name].value]));
}
function packageArtifact(contents) {
    const entries = contents.files.map(row => ({ path: row.path, bytes: Buffer.from(row.source, 'utf8') }));
    const manifestBytes = Buffer.from(canonicalValue({ format: 'financasbot.provenance.artifact', version: 1,
        kind: contents.kind, entry: contents.entry, files: contents.files.map(row => ({ path: row.path,
            media_type: row.media_type, sha256: row.observed_sha256 })) }));
    return { manifestBytes, entries };
}

// EXTERNAL PRECONDITION: the native launching platform identifies the exact
// launcher-bootstrap.js leaf against the independently reviewed TCB manifest
// BEFORE evaluating it. This module is bundled into that measured leaf, never
// loaded through ambient project require-cache. It cannot authenticate itself
// or invent expectedFreezeHash; that value belongs to trusted provisioning.
// The VM operation below evaluates TRUSTED captured host code, not guest code
// and not an isolation claim. Guest isolation remains SES + disposable process.
function launchCapturedTcb(raw) {
    const hasQualification = raw && typeof raw === 'object' && !types.isProxy(raw)
        && Object.hasOwn(raw, 'qualification');
    const { freezeBytes, expectedFreezeHash, tcbArtifact, qualification } = own(raw,
        ['freezeBytes', 'expectedFreezeHash', 'tcbArtifact', ...(hasQualification ? ['qualification'] : [])]);
    let capturedQualification;
    if (hasQualification) {
        const value = own(qualification, ['ticketSource', 'payloadSource', 'expectedTicketCommitment']);
        if (typeof value.ticketSource !== 'string' || !value.ticketSource.length || value.ticketSource.length > 1048576
            || typeof value.payloadSource !== 'string' || !value.payloadSource.length || value.payloadSource.length > 16 * 1024 * 1024
            || typeof value.expectedTicketCommitment !== 'string'
            || !/^sha256:[a-f0-9]{64}$/.test(value.expectedTicketCommitment)
            || `sha256:${digest({ source: value.ticketSource })}` !== value.expectedTicketCommitment) fail('qualification_pin');
        // Exact immutable UTF8 strings. No caller Buffer.from hooks or receipt
        // brands are transported, and no root is learned from guest input.
        capturedQualification = Object.freeze(value);
    }
    const freezeReceipt = admitExecutionFreeze({ bytes: freezeBytes, expectedHash: expectedFreezeHash });
    if (!hasQualification) verifyNativeRuntime(freezeReceipt);
    const artifact = own(tcbArtifact, ['manifestBytes', 'entries']);
    const receipt = admitFrozenArtifact({ freezeReceipt, kind: 'tcb', programId: null, ...artifact });
    const contents = artifactContents(receipt);
    if (contents.entry !== 'launcher-bootstrap.js' || contents.files.map(row => row.path).join(',')
        !== 'child-bootstrap.js,host-bootstrap.js,launcher-bootstrap.js,recipe.json'
        || contents.files.some(row => row.media_type !== (row.path === 'recipe.json' ? 'application/json' : 'text/javascript'))) fail('inventory');
    const host = contents.files.find(row => row.path === 'host-bootstrap.js');
    const requireNative = specifier => {
        if (!Object.hasOwn(nativeModules, specifier)) fail('native_import'); return nativeModules[specifier];
    };
    let tools;
    try { tools = runInThisContext(`(function(require){ return ${host.source}\n})`, { filename: 'captured-host-bootstrap.js' })(requireNative); }
    catch { fail('host_loading'); }
    if (!tools || tools.stage !== 'captured_validation_tools_only' || typeof tools.initializeFinancialHost !== 'function') fail('host_entry');
    if (hasQualification && typeof tools.initializePathQualification !== 'function') fail('qualification_host_entry');
    // Reconstruct only the exact canonical manifest already admitted; never
    // derive an expected root from it. Fresh Buffers cross opaque receipt tables
    // between the captured launcher and separately captured host closures.
    const capturedArtifact = packageArtifact(contents);
    const capturedFreeze = Buffer.from(canonicalValue(JSON.parse(JSON.stringify(freezeContents(freezeReceipt)))));
    let used = false;
    if (hasQualification) {
        const result = Object.freeze({ stage: 'captured_tcb_path_qualification_loaded_only', financial_acceptance: false,
            initializePathQualification() {
                if (this !== result || arguments.length) fail('qualification_origin');
                if (used) fail('already_initialized'); used = true;
                return tools.initializePathQualification(capturedQualification, { freezeBytes: Buffer.from(capturedFreeze), expectedFreezeHash,
                    tcbArtifact: { manifestBytes: Buffer.from(capturedArtifact.manifestBytes),
                        entries: capturedArtifact.entries.map(row => ({ path: row.path, bytes: Buffer.from(row.bytes) })) } });
            } });
        return result;
    }
    return Object.freeze({ stage: 'captured_tcb_loaded_only', financial_acceptance: false,
        initialize(data) {
            if (used) fail('already_initialized'); used = true;
            return tools.initializeFinancialHost(data, { freezeBytes: Buffer.from(capturedFreeze), expectedFreezeHash,
                tcbArtifact: { manifestBytes: Buffer.from(capturedArtifact.manifestBytes),
                    entries: capturedArtifact.entries.map(row => ({ path: row.path, bytes: Buffer.from(row.bytes) })) } });
        } });
}
module.exports = { launchCapturedTcb };
```

## src/next/provenance/executionHost.js

SHA-256 2e43e4568233e658bdb1e9ec4ca9360b9d3234b42d7811dbfd4907be73c0589f; Git blob ab2a51a6c297f420fbd4e26a5337174170eebfeb; bytes 39012.

```javascript
'use strict';

const { fork, spawn } = require('node:child_process');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { types } = require('node:util');
const { canonicalValue, freezeDeep } = require('../kernel/canonicalValue');
const { copyData, identifier } = require('./observationContract');
const { artifactContents } = require('./artifactLoader');
const { resolveExecutionEvaluator, resolveExecutionOutput, executionContractHash } = require('./executionRegistry');
const { createCausalRecorder } = require('./causalRecorder');
const { copyTypedFunctionalResult } = require('./claimBinding');
const { validatePhaseArtifactInputs } = require('./phaseCompositionProfile');
const { verifiedNodeExecutable, verifiedNativeRuntimeHash } = require('./nativeRuntime');
const { validateClaimMonthArtifact } = require('./claimMonthIsolatedProfile');

const childPath = path.join(__dirname, 'executionHostChild.cjs');
const fail = code => new Error(`host_${code}`);
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

// Executes one admitted, self-contained metric bundle in a disposable
// process. This returns R and external observations only. It cannot issue a
// validated-parent receipt or claim acceptance: registry resolution,
// provenance/proof comparison and TCB/freeze roots are not supplied here.
function prepareAdmittedInvocation(raw, phase, qualification = null) {
    const proof = phase === 'proof';
    const artifactKind = proof ? 'proof' : 'metric';
    const measurementKind = proof ? 'proof_engine_artifact_root' : 'evaluator_artifact_root';
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) throw fail('config_invalid');
    const fields = Object.getOwnPropertyDescriptors(raw);
    const names = ['artifactReceipt', 'executionId', 'invocationId', 'bindings', 'timeoutMs'];
    const optional = ['nodeSets', 'operandAliases', 'directLinks', 'directGroups', 'parentGroups', 'childCapsuleReceipt', 'proofSets', 'proofSelections', 'proofParentEdges', 'proofParentMaterials', 'derivationBindings'];
    if (Reflect.ownKeys(fields).length !== names.length + optional.filter(name => Object.hasOwn(fields, name)).length
        || names.some(name =>
        !fields[name] || !Object.hasOwn(fields[name], 'value') || !fields[name].enumerable)) throw fail('config_invalid');
    if (optional.some(name => Object.hasOwn(fields, name)
        && (!Object.hasOwn(fields[name], 'value') || !fields[name].enumerable))) throw fail('config_invalid');
    const receipt = fields.artifactReceipt.value;
    let contents;
    try { contents = artifactContents(receipt); } catch { throw fail('artifact_invalid'); }
    if (contents.kind !== artifactKind) throw fail('artifact_unsupported');
    try {
        if (proof && qualification) validateClaimMonthArtifact(contents, qualification.source);
        else validatePhaseArtifactInputs(contents);
    } catch { throw fail('artifact_unsupported'); }
    let childCapsule;
    if (fields.childCapsuleReceipt) {
        try { childCapsule = artifactContents(fields.childCapsuleReceipt.value); }
        catch { throw fail('child_capsule_invalid'); }
        if (childCapsule.kind !== 'tcb' || childCapsule.entry !== 'bootstrap.js' || childCapsule.files.length !== 1
            || childCapsule.files[0].path !== 'bootstrap.js') throw fail('child_capsule_invalid');
    }
    let input;
    try { input = copyData({ executionId: fields.executionId.value, invocationId: fields.invocationId.value,
        bindings: fields.bindings.value, nodeSets: fields.nodeSets ? fields.nodeSets.value : [],
        operandAliases: fields.operandAliases ? fields.operandAliases.value : [],
        directLinks: fields.directLinks ? fields.directLinks.value : [],
        directGroups: fields.directGroups ? fields.directGroups.value : [],
        parentGroups: fields.parentGroups ? fields.parentGroups.value : [],
        proofSets: fields.proofSets ? fields.proofSets.value : [],
        proofSelections: fields.proofSelections ? fields.proofSelections.value : [],
        proofParentEdges: fields.proofParentEdges ? fields.proofParentEdges.value : [],
        proofParentMaterials: fields.proofParentMaterials ? fields.proofParentMaterials.value : [],
        derivationBindings: fields.derivationBindings ? fields.derivationBindings.value : null,
        timeoutMs: fields.timeoutMs.value }); }
    catch { throw fail('config_invalid'); }
    if (!identifier(input.executionId) || !identifier(input.invocationId)
        || !Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 100 || input.timeoutMs > 5000
        || !Array.isArray(input.bindings) || input.bindings.length > (proof ? 512 : 16)
        || input.bindings.some(binding => !binding || typeof binding !== 'object' || Array.isArray(binding)
            || !identifier(binding.role) || !identifier(binding.alias))
        || !Array.isArray(input.nodeSets) || input.nodeSets.length > 16
        || !Array.isArray(input.operandAliases) || input.operandAliases.length > 16
        || !Array.isArray(input.directLinks) || input.directLinks.length > (proof ? 8192 : 128)
        || !Array.isArray(input.directGroups) || input.directGroups.length > 16
        || !Array.isArray(input.parentGroups) || input.parentGroups.length > 16
        || !Array.isArray(input.proofSets) || input.proofSets.length > 512
        || !Array.isArray(input.proofSelections) || input.proofSelections.length > 512
        || !Array.isArray(input.proofParentEdges) || input.proofParentEdges.length > 16
        || !Array.isArray(input.proofParentMaterials) || input.proofParentMaterials.length !== input.proofParentEdges.length
        || !proof && (input.proofSets.length || input.proofSelections.length || input.proofParentEdges.length || input.proofParentMaterials.length)
        || !input.bindings.length && !input.directGroups.length) throw fail('config_invalid');
    // Derive the legacy one-binding-per-role projection only from admitted
    // data. Never call map/getters on caller-supplied bindings before copyData.
    const operandAliases = fields.operandAliases
        ? input.operandAliases : proof ? [] : input.bindings.map(binding => ({ role: binding.role, alias: binding.alias }));
    if (proof && (input.directGroups.length || input.nodeSets.length || input.parentGroups.length || operandAliases.length
        || input.derivationBindings !== null
        || input.bindings.some(binding => binding.role !== (binding.alias === 'claim/context' ? 'proof/context' : 'proof/snapshot'))))
        throw fail('proof_config_invalid');
    if (input.derivationBindings !== null) {
        const bindings = input.derivationBindings;
        if (proof || !bindings || Object.keys(bindings).sort().join(',') !== 'selections,sets'
            || !Array.isArray(bindings.sets) || bindings.sets.length > 512
            || !Array.isArray(bindings.selections) || bindings.selections.length > 512) throw fail('derivation_bindings_invalid');
        const sets = new Set(); const targets = new Set();
        for (const set of bindings.sets) {
            if (!set || Object.keys(set).sort().join(',') !== 'aliases,name'
                || typeof set.name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(set.name) || sets.has(set.name)
                || !Array.isArray(set.aliases) || set.aliases.length > 512 || new Set(set.aliases).size !== set.aliases.length
                || set.aliases.some(alias => !identifier(alias))) throw fail('derivation_bindings_invalid');
            sets.add(set.name);
        }
        for (const row of bindings.selections) {
            if (!row || Object.keys(row).sort().join(',') !== 'candidate_set,role,selected_set'
                || !identifier(row.role) || !sets.has(row.candidate_set)
                || typeof row.selected_set !== 'string' || !/^[a-z][a-z0-9_]*$/.test(row.selected_set)
                || sets.has(row.selected_set) || targets.has(row.selected_set)
                || input.nodeSets.filter(set => set.role === row.role
                    && JSON.stringify(set.roster) === JSON.stringify(bindings.sets.find(set => set.name === row.candidate_set).aliases)).length !== 1)
                throw fail('derivation_bindings_invalid');
            targets.add(row.selected_set);
        }
    }
    const proofSetNames = new Set();
    for (const set of input.proofSets) {
        if (!set || Object.keys(set).sort().join(',') !== 'name,roster'
            || typeof set.name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(set.name)
            || !identifier(`operand/proof/set/${set.name}`) || proofSetNames.has(set.name)
            || !Array.isArray(set.roster) || set.roster.length > 512 || new Set(set.roster).size !== set.roster.length
            || set.roster.some(alias => alias === 'claim/context' || !identifier(alias)
                || input.bindings.filter(binding => binding.alias === alias && binding.identity).length !== 1))
            throw fail('proof_set_invalid');
        proofSetNames.add(set.name);
    }
    const selectionTargets = new Set();
    for (const selection of input.proofSelections) {
        if (!selection || Object.keys(selection).sort().join(',') !== 'candidate_set,selected_set'
            || [selection.candidate_set, selection.selected_set].some(name => typeof name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(name))
            || !proofSetNames.has(selection.candidate_set) || proofSetNames.has(selection.selected_set)
            || selectionTargets.has(selection.selected_set)) throw fail('proof_selection_invalid');
        selectionTargets.add(selection.selected_set);
    }
    const parentTargets = new Set(); const parentEdges = new Set(); const parentRoles = new Set();
    for (const edge of input.proofParentEdges) {
        if (!edge || Object.keys(edge).sort().join(',') !== 'field,id,relation,source,target'
            || edge.source !== 'claim' || edge.relation !== 'derived_from'
            || !identifier(edge.id) || !identifier(edge.target) || typeof edge.field !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(edge.field)
            || parentTargets.has(edge.target) || parentEdges.has(edge.id) || parentRoles.has(edge.field)
            || input.bindings.filter(binding => binding.alias === edge.target && binding.identity?.kind === 'derived_claim').length !== 1)
            throw fail('proof_parent_invalid');
        parentTargets.add(edge.target); parentEdges.add(edge.id); parentRoles.add(edge.field);
    }
    const materialEdges = new Set();
    for (const row of input.proofParentMaterials) {
        if (!row || Object.keys(row).sort().join(',') !== 'descriptor,edge_id,expected_fingerprint'
            || !parentEdges.has(row.edge_id) || materialEdges.has(row.edge_id)
            || typeof row.expected_fingerprint !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(row.expected_fingerprint)
            || !row.descriptor || Object.keys(row.descriptor).sort().join(',') !== 'fields,kind,registry_version'
            || row.descriptor.kind !== 'derived_claim' || !Number.isSafeInteger(row.descriptor.registry_version)
            || row.descriptor.registry_version < 1) throw fail('proof_parent_invalid');
        materialEdges.add(row.edge_id);
    }
    if (input.directGroups.length && (input.bindings.length || operandAliases.length
        || input.directLinks.length)) throw fail('config_invalid');
    const roles = new Set();
    for (const operand of operandAliases) {
        if (!operand || Object.keys(operand).sort().join(',') !== 'alias,role'
            || !identifier(operand.alias) || !identifier(operand.role) || roles.has(operand.role)
            || input.bindings.filter(binding => binding.alias === operand.alias && binding.role === operand.role).length !== 1)
            throw fail('config_invalid');
        roles.add(operand.role);
    }
    for (const group of input.directGroups) {
        if (!group || Object.keys(group).sort().join(',') !== 'alias,bindings,links,role'
            || !identifier(group.role) || !identifier(group.alias) || roles.has(group.role)
            || !Array.isArray(group.bindings) || !group.bindings.length || group.bindings.length > 512
            || !Array.isArray(group.links) || group.links.length > 8192
            || group.bindings.filter(binding => binding?.alias === group.alias
                && binding.role === group.role).length !== 1
            || group.bindings.some(binding => binding?.role !== group.role)) throw fail('config_invalid');
        roles.add(group.role);
    }
    for (const set of input.nodeSets) {
        if (!set || Object.keys(set).sort().join(',') !== 'bindings,links,role,roster'
            || !identifier(set.role) || roles.has(set.role)
            || !Array.isArray(set.bindings) || !Array.isArray(set.links) || !Array.isArray(set.roster)) throw fail('config_invalid');
        roles.add(set.role);
    }
    for (const group of input.parentGroups) {
        if (!group || Object.keys(group).sort().join(',') !== 'alias,bindings,edgeId,edges,role'
            || !identifier(group.role) || !identifier(group.alias) || !identifier(group.edgeId)
            || roles.has(group.role) || !Array.isArray(group.bindings) || group.bindings.length !== 1
            || !Array.isArray(group.edges) || group.edges.length !== 1
            || group.edges[0]?.id !== group.edgeId || group.edges[0]?.field !== group.role
            || group.edges[0]?.target !== group.alias || group.bindings[0]?.alias !== group.alias
            || group.bindings[0]?.role !== group.role) throw fail('config_invalid');
        roles.add(group.role);
    }
    const manifest = canonicalValue({ format: 'financasbot.provenance.artifact', version: 1,
        kind: contents.kind, entry: contents.entry,
        files: contents.files.map(file => ({ path: file.path, media_type: file.media_type,
            sha256: file.observed_sha256 })) });
    if (digest(manifest) !== receipt.observed_root) throw fail('artifact_mismatch');
    return { input, receipt, contents, manifest, childCapsule, fields, operandAliases, measurementKind, proof,
        qualificationSource: proof && qualification ? qualification.source : null };
}

function invocationMessage(prepared, phase) {
    const { input, receipt, manifest, contents, operandAliases } = prepared;
    return { kind: 'run', phase, expectedRoot: receipt.observed_root, manifest,
        source: contents.files[0].source, profileSource: contents.files.length >= 2 ? contents.files[1].source : null,
        bindings: input.bindings, operandAliases,
        directLinks: input.directLinks, directGroups: input.directGroups,
        parentGroups: input.parentGroups, proofSets: input.proofSets,
        proofSelections: input.proofSelections, proofParentEdges: input.proofParentEdges,
        proofParentMaterials: input.proofParentMaterials, nodeSets: input.nodeSets,
        derivationBindings: input.derivationBindings, qualificationSource: prepared.qualificationSource };
}

async function runAdmittedInvocation(raw, phase) {
    const prepared = prepareAdmittedInvocation(raw, phase);
    const { input, receipt, childCapsule, fields, measurementKind, proof } = prepared;
    if (input.derivationBindings !== null) throw fail('derivation_requires_graph');
    const recorder = createCausalRecorder({ executionId: input.executionId, maxEvents: 10000 });
    const scope = recorder.open({ invocationId: input.invocationId, phase });
    return new Promise((resolve, reject) => {
        // Node parses the already captured capsule from stdin; no project or
        // SES pathname is opened again. Native runtime remains external. This
        // child-only root is NOT the complete validation_tcb_root or a freeze.
        const child = childCapsule ? spawn(process.execPath,
            ['--max-old-space-size=64', '-', '--run-admitted-invocation'], {
                env: {}, windowsHide: true,
                stdio: ['pipe', 'pipe', 'pipe', 'ipc']
            }) : fork(childPath, ['--run-admitted-invocation'], {
            env: {}, cwd: __dirname, execArgv: ['--max-old-space-size=64'],
            windowsHide: true, silent: true
        });
        let ready = false; let measured = false; let result; let error; let deadline;
        const startup = setTimeout(() => stop('startup_timeout'), 15000);
        function stop(code) {
            if (error) return;
            error = fail(code);
            child.kill();
        }
        for (const stream of [child.stdout, child.stderr]) stream.on('data', () => stop('output_forbidden'));
        child.on('error', () => stop('process_error'));
        if (childCapsule) {
            child.stdin.on('error', () => stop('send_failed'));
            child.stdin.end(childCapsule.files[0].source, 'utf8');
        }
        child.on('message', message => {
            if (error) return;
            if (!message || typeof message !== 'object' || Array.isArray(message)) { stop('protocol'); return; }
            const keys = Object.keys(message).sort().join(',');
            if (ready && result === undefined && message.kind === 'failure' && keys === 'kind,stage'
                && ['admission', 'operands', 'compartment', 'evaluation', 'result'].includes(message.stage)) {
                stop('child_' + message.stage); return;
            }
            if (message.kind === 'ready' && keys === 'kind' && !ready) {
                ready = true; clearTimeout(startup);
                deadline = setTimeout(() => stop('timeout'), input.timeoutMs);
                child.send(invocationMessage(prepared, phase), sendError => {
                    if (sendError) stop('send_failed');
                });
                return;
            }
            if (!ready || result !== undefined) { stop('protocol'); return; }
            if (message.kind === 'measurement' && keys === 'event,kind' && !measured) {
                if (JSON.stringify(message.event) !== JSON.stringify(['M', measurementKind,
                    receipt.observed_root])) { stop('measurement_invalid'); return; }
                try { scope.measure(message.event); measured = true; } catch { stop('measurement_invalid'); }
                return;
            }
            if (message.kind === 'observation' && keys === 'event,kind' && measured) {
                try { scope.observe(message.event); } catch { stop('observation_invalid'); }
                return;
            }
            if (message.kind === 'result' && keys === 'kind,value' && measured) {
                try {
                    if (proof) {
                        if (typeof message.value !== 'boolean') throw fail('proof_result_invalid');
                        result = message.value;
                    } else result = copyTypedFunctionalResult(message.value);
                }
                catch { stop('functional_result_invalid'); }
                return;
            }
            stop('protocol');
        });
        child.on('close', code => {
            clearTimeout(startup); clearTimeout(deadline);
            if (error) { reject(error); return; }
            if (code !== 0 || !ready || !measured || result === undefined) {
                reject(fail('incomplete_exit')); return;
            }
            try {
                scope.seal();
                const trace = recorder.finish();
                resolve(Object.freeze({ stage: proof ? 'isolated_proof_observation_only' : 'isolated_metric_observation_only', graph_accepted: false,
                    ...(childCapsule ? { observed_child_capsule_root: fields.childCapsuleReceipt.value.observed_root } : {}),
                    observed_artifact_root: receipt.observed_root,
                    ...(proof ? { proof_satisfied: result } : { functional_result: result }), trace }));
            } catch { reject(fail('recorder_invalid')); }
        });
    });
}

function runAdmittedMetric(raw) { return runAdmittedInvocation(raw, 'derivation'); }
function runAdmittedProof(raw) { return runAdmittedInvocation(raw, 'proof'); }

// One disposable process, two fresh guest compartments and one external
// recorder. Neither phase result becomes an observation receipt until both
// phases and the child have completed cleanly. This is still not financial
// acceptance or a complete validation-TCB/freeze attestation.
async function runAdmittedGraph(raw) { return runAdmittedGraphInternal(raw); }
const usedQualificationRoots = new WeakSet();
async function runClaimMonthQualifiedGraph(raw, receipt) {
    const { resolveClaimMonthIsolatedProof } = require('./graphCompiler');
    const qualification = resolveClaimMonthIsolatedProof(receipt);
    if (usedQualificationRoots.has(receipt)) throw fail('qualification_reused');
    usedQualificationRoots.add(receipt);
    return runAdmittedGraphInternal(raw, qualification);
}
async function runAdmittedGraphInternal(raw, qualification = null) {
    const required = ['executionId', 'invocationId', 'timeoutMs', 'childCapsuleReceipt', 'derivation', 'proof'];
    const plain = value => value && typeof value === 'object' && !Array.isArray(value)
        && !types.isProxy(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
    if (!plain(raw)) throw fail('graph_config_invalid');
    const fields = Object.getOwnPropertyDescriptors(raw);
    const optional = ['nativeRuntimeReceipt', 'tcbArtifactReceipt', 'evaluatorContractReceipt'];
    if (Reflect.ownKeys(fields).length !== required.length + optional.filter(name => Object.hasOwn(fields, name)).length
        || required.some(name => !fields[name]?.enumerable || !Object.hasOwn(fields[name], 'value'))
        || optional.some(name => Object.hasOwn(fields, name)
            && (!fields[name].enumerable || !Object.hasOwn(fields[name], 'value')))) throw fail('graph_config_invalid');
    const phases = ['derivation', 'proof'];
    const phaseNames = ['artifactReceipt', 'bindings', 'nodeSets', 'operandAliases', 'directLinks',
        'directGroups', 'parentGroups', 'proofSets', 'proofSelections', 'proofParentEdges', 'proofParentMaterials', 'derivationBindings'];
    const prepared = phases.map(phase => {
        const value = fields[phase].value;
        if (!plain(value)) throw fail('graph_config_invalid');
        const d = Object.getOwnPropertyDescriptors(value);
        if (Reflect.ownKeys(d).some(name => typeof name !== 'string' || !phaseNames.includes(name)
            || !d[name].enumerable || !Object.hasOwn(d[name], 'value'))
            || !Object.hasOwn(d, 'artifactReceipt') || !Object.hasOwn(d, 'bindings')) throw fail('graph_config_invalid');
        return prepareAdmittedInvocation({ ...Object.fromEntries(Object.keys(d).map(name => [name, d[name].value])),
            ...Object.fromEntries(required.slice(0, 4).map(name => [name, fields[name].value])) }, phase, qualification);
    });
    if (qualification) {
        if (prepared[1].receipt !== qualification.artifactReceipt) throw fail('qualification_artifact');
        if (qualification.frozenBaseline) {
            const baseline = qualification.frozenBaseline;
            if (!fields.tcbArtifactReceipt || !fields.nativeRuntimeReceipt || !fields.evaluatorContractReceipt)
                throw fail('qualification_frozen_authority');
            artifactContents(fields.tcbArtifactReceipt.value);
            if (fields.tcbArtifactReceipt.value.observed_root !== baseline.freeze.validation_tcb_root
                || fields.childCapsuleReceipt.value.observed_root !== baseline.freeze.child_capsule_root
                || verifiedNativeRuntimeHash(fields.nativeRuntimeReceipt.value) !== baseline.freeze.native_runtime.node_binary_sha256
                || prepared[0].receipt.observed_root !== baseline.evaluatorRoot
                || executionContractHash(fields.evaluatorContractReceipt.value) !== baseline.contractHash)
                throw fail('qualification_frozen_root');
        }
        const selector = { fact_key: qualification.data.fact_key };
        const expectedP = qualification.access.projectProofTransport(selector).config;
        const expectedD = qualification.access.projectMetricTransport(selector);
        for (const [name, value] of Object.entries(expectedP)) if (canonicalValue(JSON.parse(JSON.stringify(prepared[1].input[name])))
            !== canonicalValue(JSON.parse(JSON.stringify(value)))) throw fail('qualification_inputs');
        for (const name of ['directGroups', 'nodeSets', 'parentGroups']) if (canonicalValue(JSON.parse(JSON.stringify(prepared[0].input[name])))
            !== canonicalValue(JSON.parse(JSON.stringify(expectedD[name])))) throw fail('qualification_inputs');
        if (canonicalValue(JSON.parse(JSON.stringify(prepared[0].input.derivationBindings)))
            !== canonicalValue(JSON.parse(JSON.stringify(qualification.access.projectDerivationBindings(selector))))) throw fail('qualification_inputs');
    }
    const { input, childCapsule } = prepared[0];
    if (!childCapsule) throw fail('child_capsule_invalid');
    let measuredTcbRoot; let measuredContractHash;
    if (fields.tcbArtifactReceipt || fields.evaluatorContractReceipt) {
        if (!fields.tcbArtifactReceipt || !fields.evaluatorContractReceipt || !fields.nativeRuntimeReceipt)
            throw fail('measured_authority_incomplete');
        const tcb = artifactContents(fields.tcbArtifactReceipt.value);
        if (tcb.kind !== 'tcb' || tcb.entry !== 'launcher-bootstrap.js'
            || tcb.files.map(row => row.path).join(',') !== 'child-bootstrap.js,host-bootstrap.js,launcher-bootstrap.js,recipe.json')
            throw fail('tcb_invalid');
        measuredTcbRoot = fields.tcbArtifactReceipt.value.observed_root;
        measuredContractHash = executionContractHash(fields.evaluatorContractReceipt.value);
    }
    // Diagnostic calls may omit this receipt. The future private accepting
    // host must require it; omission never grants financial acceptance.
    const executable = Object.hasOwn(fields, 'nativeRuntimeReceipt')
        ? verifiedNodeExecutable(fields.nativeRuntimeReceipt.value) : process.execPath;
    const recorder = createCausalRecorder({ executionId: input.executionId, maxEvents: 20000 });
    return new Promise((resolve, reject) => {
        const child = spawn(executable, ['--max-old-space-size=64', '-', qualification ? '--run-qualified-graph' : '--run-admitted-graph'], {
            env: {}, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe', 'ipc']
        });
        let ready = false; let index = 0; let scope; let measured = false;
        let complete = false; let error; let deadline;
        const measurementEvents = prepared.map((row, phase) => [
            ['M', row.measurementKind, row.receipt.observed_root],
            ...(phase === 0 && row.input.derivationBindings !== null
                ? [['M', 'proof_engine_artifact_root', prepared[1].receipt.observed_root]] : [])
        ]);
        const results = [];
        const proofSites = []; const proofReads = []; const fringe = [];
        let activeSite = null;
        const startup = setTimeout(() => stop('startup_timeout'), 15000);
        function stop(code) { if (!error) {
            error = fail(code);
            if (code === 'timeout') error.diagnostic = Object.freeze({ phase: phases[index] ?? 'completed',
                completed_phases: results.length, proof_sites_completed: proofSites.length });
            child.kill();
        } }
        for (const stream of [child.stdout, child.stderr]) stream.on('data', () => stop('output_forbidden'));
        child.on('error', () => stop('process_error'));
        child.stdin.on('error', () => stop('send_failed'));
        child.stdin.end(childCapsule.files[0].source, 'utf8');
        child.on('message', message => {
            if (error) return;
            if (!message || typeof message !== 'object' || Array.isArray(message)) { stop('protocol'); return; }
            const keys = Object.keys(message).sort().join(',');
            if (ready && !complete && message.kind === 'failure' && keys === 'kind,stage'
                && ['admission', 'operands', 'compartment', 'evaluation', 'result'].includes(message.stage)) {
                stop('child_' + message.stage); return;
            }
            if (!ready && message.kind === 'ready' && keys === 'kind') {
                ready = true; clearTimeout(startup);
                deadline = setTimeout(() => stop('timeout'), input.timeoutMs);
                child.send({ kind: 'run_graph', derivation: invocationMessage(prepared[0], 'derivation'),
                    proof: invocationMessage(prepared[1], 'proof') }, e => { if (e) stop('send_failed'); });
                return;
            }
            if (!ready || complete) { stop('protocol'); return; }
            if (message.kind === 'phase_start' && keys === 'kind,phase' && !scope && index < 2
                && message.phase === phases[index]) {
                try {
                    scope = recorder.open({ invocationId: input.invocationId, phase: phases[index] }); measured = 0;
                    if (measuredTcbRoot) scope.measure(['M', 'validation_tcb_root', measuredTcbRoot]);
                    if (index === 0 && measuredContractHash) scope.measure(['M', 'evaluator_contract_hash', measuredContractHash]);
                }
                catch { stop('recorder_invalid'); }
                return;
            }
            if (message.kind === 'measurement' && keys === 'event,kind' && scope && measured < measurementEvents[index].length) {
                if (JSON.stringify(message.event) !== JSON.stringify(measurementEvents[index][measured])) { stop('measurement_invalid'); return; }
                try { scope.measure(message.event); measured++; } catch { stop('measurement_invalid'); }
                return;
            }
            if (message.kind === 'observation' && keys === 'event,kind' && scope && measured === measurementEvents[index].length) {
                try {
                    scope.observe(message.event);
                    if (qualification && index === 1) proofReads.push({ origin: 'original', phase: 'proof', site: activeSite,
                        event: structuredClone(copyData(message.event)) });
                } catch { stop('observation_invalid'); }
                return;
            }
            if (qualification && index === 1 && scope && measured === measurementEvents[index].length) {
                if (message.kind === 'proof_site_start' && keys === 'kind,site' && activeSite === null
                    && message.site === qualification.data.predicate_ids[proofSites.length]) { activeSite = message.site; return; }
                if (message.kind === 'proof_site_result' && keys === 'kind,satisfied,site' && activeSite !== null
                    && message.site === activeSite && typeof message.satisfied === 'boolean') {
                    proofSites.push({ site: activeSite, satisfied: message.satisfied }); activeSite = null; return;
                }
                if (message.kind === 'qualification_observation' && keys === 'event,kind' && qualification.data.variant === 'M'
                    && activeSite === qualification.data.predicate_id) {
                    try {
                        const event = structuredClone(copyData(message.event));
                        if (event[2] !== 'qualification/context' || event[3] !== `proof/qualification/${activeSite}`
                            || event[4][0] !== 'qualification') throw fail('qualification_observation');
                        scope.observe(event);
                        const row = { origin: 'qualification', phase: 'proof', site: activeSite, event };
                        fringe.push(row); proofReads.push(row);
                    } catch { stop('qualification_observation'); }
                    return;
                }
            }
            if (message.kind === 'phase_result' && keys === 'kind,phase,value' && scope && measured === measurementEvents[index].length
                && message.phase === phases[index]) {
                try {
                    if (index === 1 && typeof message.value !== 'boolean') throw fail('proof_result_invalid');
                    if (qualification && index === 1 && (activeSite !== null
                        || proofSites.length !== qualification.data.predicate_ids.length
                        || message.value !== proofSites.every(row => row.satisfied))) throw fail('qualification_sites');
                    results.push(index === 0 ? copyTypedFunctionalResult(message.value) : message.value);
                    scope.seal(); scope = undefined; index++;
                } catch { stop('functional_result_invalid'); }
                return;
            }
            if (message.kind === 'graph_done' && keys === 'kind' && index === 2 && !scope) {
                complete = true; return;
            }
            stop('protocol');
        });
        child.on('close', code => {
            clearTimeout(startup); clearTimeout(deadline);
            if (error) { reject(error); return; }
            if (code !== 0 || !complete || results.length !== 2) { reject(fail('incomplete_exit')); return; }
            try {
                resolve(Object.freeze({ stage: qualification ? 'isolated_claim_month_observations_only' : 'isolated_graph_observations_only', graph_accepted: false,
                    functional_result: results[0], proof_satisfied: results[1],
                    observed_child_capsule_root: fields.childCapsuleReceipt.value.observed_root,
                    observed_evaluator_artifact_root: prepared[0].receipt.observed_root,
                    observed_proof_engine_artifact_root: prepared[1].receipt.observed_root,
                    ...(measuredTcbRoot ? { observed_validation_tcb_root: measuredTcbRoot,
                        observed_evaluator_contract_hash: measuredContractHash } : {}),
                    ...(qualification ? { proof_site_results: freezeDeep(proofSites), proof_site_reads: freezeDeep(proofReads),
                        qualification_observations: freezeDeep(fringe), qualification_profile_hash: 'sha256:' + require('../kernel/canonicalValue').digest(qualification.data),
                        positive_baseline_frozen: qualification.frozenBaseline !== null,
                        ...(qualification.frozenBaseline ? { positive_freeze_hash: qualification.frozenBaseline.freezeHash } : {}),
                        profile_witness_qualified: false, financial_release_eligible: false, receipt_created: false } : {}),
                    trace: recorder.finish() }));
            } catch { reject(fail('recorder_invalid')); }
        });
    });
}

// Registry-root bound transport only. The registry receipt must itself have
// been admitted against a reviewed freeze hash by the trusted caller; this
// function cannot manufacture that authority or accept a claim.
async function runRegisteredMetric(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) throw fail('config_invalid');
    const d = Object.getOwnPropertyDescriptors(raw);
    const required = ['artifactReceipt', 'executionId', 'invocationId', 'bindings',
        'timeoutMs', 'registryReceipt', 'evaluatorRef', 'contractReceipt'];
    const optional = ['nodeSets', 'operandAliases', 'directLinks', 'directGroups', 'parentGroups', 'childCapsuleReceipt'];
    if (Reflect.ownKeys(d).length !== required.length + optional.filter(key => Object.hasOwn(d, key)).length
        || required.some(key => !d[key] || !Object.hasOwn(d[key], 'value') || !d[key].enumerable)
        || optional.some(key => Object.hasOwn(d, key)
            && (!Object.hasOwn(d[key], 'value') || !d[key].enumerable))) throw fail('config_invalid');
    let entry; let contents; let output;
    try {
        entry = resolveExecutionEvaluator(d.registryReceipt.value, d.evaluatorRef.value);
        output = resolveExecutionOutput(d.registryReceipt.value, d.evaluatorRef.value,
            d.contractReceipt.value);
        contents = artifactContents(d.artifactReceipt.value);
    } catch { throw fail('registry_invalid'); }
    if (d.artifactReceipt.value.observed_root !== entry.evaluator_artifact_root
        || contents.kind !== 'metric') throw fail('registry_root_mismatch');
    let direct; let groups; let sets; let parents;
    try {
        direct = copyData(d.operandAliases?.value ?? []);
        groups = copyData(d.directGroups?.value ?? []);
        sets = copyData(d.nodeSets?.value ?? []);
        parents = copyData(d.parentGroups?.value ?? []);
    } catch { throw fail('registry_roles_invalid'); }
    if (!Array.isArray(direct) || !Array.isArray(groups) || !Array.isArray(sets) || !Array.isArray(parents)) throw fail('registry_roles_invalid');
    const actual = new Map();
    for (const operand of direct) {
        if (!operand || Object.keys(operand).sort().join(',') !== 'alias,role'
            || !identifier(operand.role) || !identifier(operand.alias)
            || actual.has(operand.role)) throw fail('registry_roles_invalid');
        actual.set(operand.role, 'direct');
    }
    for (const group of groups) {
        if (!group || !identifier(group.role) || actual.has(group.role)) throw fail('registry_roles_invalid');
        actual.set(group.role, 'direct');
    }
    for (const set of sets) {
        if (!set || !identifier(set.role) || actual.has(set.role)) throw fail('registry_roles_invalid');
        actual.set(set.role, 'node_set');
    }
    for (const parent of parents) {
        if (!parent || !identifier(parent.role) || actual.has(parent.role)) throw fail('registry_roles_invalid');
        actual.set(parent.role, 'parent_claim');
    }
    if (actual.size !== entry.roles.length || entry.roles.some(role =>
        actual.get(role.role_id) !== (['node_set', 'parent_claim'].includes(role.input_kind) ? role.input_kind : 'direct')))
        throw fail('registry_roles_invalid');
    const config = Object.fromEntries([...required.filter(key =>
        !['registryReceipt', 'evaluatorRef', 'contractReceipt'].includes(key)), ...optional.filter(key => Object.hasOwn(d, key))]
        .map(key => [key, d[key].value]));
    const result = await runAdmittedMetric(config);
    if (result.functional_result.unit !== output.unit || result.functional_result.kind !== output.kind
        || output.enumValues.length && !output.enumValues.includes(result.functional_result.value))
        throw fail('registry_output_mismatch');
    return Object.freeze({ ...result, stage: 'registry_root_bound_observation_only',
        evaluator_ref: Object.freeze({ evaluator_id: entry.evaluator_id,
            evaluator_version: entry.evaluator_version }) });
}

module.exports = { runAdmittedMetric, runRegisteredMetric, runAdmittedProof, runAdmittedGraph, runClaimMonthQualifiedGraph };
```

## src/next/provenance/executionHostChild.cjs

SHA-256 4d6d6efc6933e68874fafb34b30b1f6ff9b910a779c90ef0194d88a679a8f900; Git blob dcac05f5f1b5e708de3a119fea449912f3e79759; bytes 24098.

```javascript
'use strict';

// Disposable trusted child. This module, SES and the proxy are TCB bytes that
// must be measured by the future validation_tcb_root. No guest source is
// accepted from argv, a path or a Node loader.
const { EXECUTION_PROFILE } = require('./executionProfile');
const { admitArtifact, artifactContents } = require('./artifactLoader');
const { createInstrumentedAccess, createNodeSetAccess, createDerivedParentAccess } = require('./instrumentedAccess');
const { copyTypedFunctionalResult } = require('./claimBinding');
const { bindObservedContext } = require('./proofContextBinding');
const { bindObservedParents } = require('./proofParentBinding');
const { validatePhaseArtifactInputs, PROFILE_PATH } = require('./phaseCompositionProfile');
const { validateClaimMonthArtifact, QUALIFICATION_PATH } = require('./claimMonthIsolatedProfile');
const { digest } = require('../kernel/canonicalValue');
const { types } = require('node:util');
require('ses');

const pinned = EXECUTION_PROFILE.native_timezone;
const qualifiedMode = process.argv[2] === '--run-qualified-graph';
if (!['--run-admitted-invocation', '--run-admitted-graph', '--run-qualified-graph'].includes(process.argv[2]) || typeof process.send !== 'function'
    || process.versions.node !== EXECUTION_PROFILE.node_version
    || process.versions.icu !== pinned.icu || process.versions.tz !== pinned.tz
    || process.versions.cldr !== pinned.cldr || process.versions.unicode !== pinned.unicode) {
    throw new Error('host_child_runtime_mismatch');
}
lockdown(EXECUTION_PROFILE.lockdown);

function compartment(operands) {
    const guest = new Compartment({ globals: { operands }, __options__: true });
    for (const name of EXECUTION_PROFILE.denied_globals) {
        Object.defineProperty(guest.globalThis, name,
            { value: undefined, writable: false, configurable: false });
    }
    Object.freeze(guest.globalThis);
    return guest;
}

// Inspect data descriptors before any clone/coercion. The allowed prototypes
// are captured from this very compartment before executing admitted guest code.
function copyGuestResult(raw, objectPrototype, arrayPrototype) {
    const invalid = () => { throw new Error('host_child_result'); };
    if (!raw || typeof raw !== 'object' || types.isProxy(raw)
        || ![null, objectPrototype].includes(Object.getPrototypeOf(raw))) invalid();
    const fields = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(fields).length !== 3 || ['unit', 'kind', 'value'].some(key =>
        !fields[key] || !fields[key].enumerable || !Object.hasOwn(fields[key], 'value'))) invalid();
    let value = fields.value.value;
    if (Array.isArray(value)) {
        if (types.isProxy(value) || Object.getPrototypeOf(value) !== arrayPrototype) invalid();
        const items = Object.getOwnPropertyDescriptors(value);
        const length = items.length?.value;
        if (!Number.isSafeInteger(length) || length < 0 || length > 512
            || Reflect.ownKeys(items).length !== length + 1) invalid();
        value = Array.from({ length }, (_, index) => {
            const item = items[String(index)];
            if (!item || !item.enumerable || !Object.hasOwn(item, 'value')
                || typeof item.value !== 'string') invalid();
            return item.value;
        });
    }
    return copyTypedFunctionalResult({ unit: fields.unit.value,
        kind: fields.kind.value, value });
}

let failureStage = 'admission';
function inputEntries(message) {
    if (message.profileSource !== null && (typeof message.profileSource !== 'string'
        || Buffer.byteLength(message.profileSource, 'utf8') > 65536)) throw new Error('host_child_protocol');
    if (message.qualificationSource !== null && (!qualifiedMode || message.phase !== 'proof'
        || typeof message.qualificationSource !== 'string' || Buffer.byteLength(message.qualificationSource) > 65536)) throw new Error('host_child_protocol');
    return [{ path: 'bundle.js', bytes: Buffer.from(message.source, 'utf8') },
        ...(message.profileSource === null ? [] : [{ path: PROFILE_PATH, bytes: Buffer.from(message.profileSource, 'utf8') }]),
        ...(message.qualificationSource === null ? [] : [{ path: QUALIFICATION_PATH, bytes: Buffer.from(message.qualificationSource, 'utf8') }])];
}
function validateInvocationArtifact(contents) {
    if (contents.files.length === 3) {
        if (!qualifiedMode) throw new Error('host_child_artifact');
        return validateClaimMonthArtifact(contents);
    }
    validatePhaseArtifactInputs(contents); return null;
}
function run(message, guardMessage) {
    failureStage = 'admission';
    if (!message || Object.keys(message).sort().join(',') !== 'bindings,derivationBindings,directGroups,directLinks,expectedRoot,kind,manifest,nodeSets,operandAliases,parentGroups,phase,profileSource,proofParentEdges,proofParentMaterials,proofSelections,proofSets,qualificationSource,source'
        || message.kind !== 'run' || typeof message.manifest !== 'string'
        || !['derivation', 'proof'].includes(message.phase)
        || typeof message.source !== 'string'
        || Buffer.byteLength(message.source, 'utf8') > 8 * 1024 * 1024) {
        throw new Error('host_child_protocol');
    }
    const receipt = admitArtifact({ manifestBytes: Buffer.from(message.manifest, 'utf8'),
        expectedRoot: message.expectedRoot,
        entries: inputEntries(message) });
    const contents = artifactContents(receipt);
    const proof = message.phase === 'proof';
    const qualification = validateInvocationArtifact(contents);
    const qualificationState = qualification ? { active: null, index: 0, results: [] } : null;
    if (contents.kind !== (proof ? 'proof' : 'metric')) {
        throw new Error('host_child_artifact');
    }
    process.send({ kind: 'measurement', event: ['M', proof ? 'proof_engine_artifact_root' : 'evaluator_artifact_root', receipt.observed_root] });
    let guardContents;
    if (!proof && message.derivationBindings !== null) {
        if (!guardMessage || guardMessage.phase !== 'proof' || typeof guardMessage.source !== 'string'
            || typeof guardMessage.manifest !== 'string') throw new Error('host_child_guard');
        const guardReceipt = admitArtifact({ manifestBytes: Buffer.from(guardMessage.manifest, 'utf8'),
            expectedRoot: guardMessage.expectedRoot,
            entries: inputEntries(guardMessage) });
        guardContents = artifactContents(guardReceipt);
        validateInvocationArtifact(guardContents);
        if (guardContents.kind !== 'proof')
            throw new Error('host_child_guard');
        process.send({ kind: 'measurement', event: ['M', 'proof_engine_artifact_root', guardReceipt.observed_root] });
    }
    failureStage = 'operands';
    const emit = event => process.send({ kind: 'observation', event });
    const controls = [];
    const operands = Object.create(null);
    const derivationNodes = new Map(); const selected = new Map();
    let derivationFailed = false;
    const invalidDerivation = () => { derivationFailed = true; throw new Error('host_child_derivation_guard'); };
    const derivationLinks = [...message.directLinks, ...message.directGroups.flatMap(group => group.links),
        ...message.nodeSets.flatMap(set => set.links)];
    function remember(access, bindings) {
        if (message.derivationBindings !== null) for (const binding of bindings)
            if (!derivationNodes.has(binding.alias)) derivationNodes.set(binding.alias, access.handle(binding.alias));
    }
    let proofFailed = false;
    if (proof) {
        if (message.directGroups.length || message.nodeSets.length || message.parentGroups.length || message.operandAliases.length
            || message.bindings.some(binding => binding.role !== (binding.alias === 'claim/context' ? 'proof/context' : 'proof/snapshot')))
            throw new Error('host_child_proof_config');
        const access = createInstrumentedAccess({ bindings: message.bindings, links: message.directLinks, emit });
        controls.push(access);
        const context = message.bindings.find(binding => binding.alias === 'claim/context');
        if (context) bindObservedContext(context.value, access.handle('claim/context'));
        let auxiliary;
        if (qualification) {
            if (!context || 'sha256:' + digest(context.value) !== qualification.core_context_hash) throw new Error('host_child_qualification_context');
            const role = `proof/qualification/${qualification.predicate_id}`;
            auxiliary = createInstrumentedAccess({ bindings: [{ alias: 'qualification/context', role,
                value: qualification.sidecar, shape: { type: 'record', fields: { qualification: { type: 'record', fields: {
                    alternative_period: { type: 'record', fields: { kind: { type: 'scalar' }, value: { type: 'scalar' } } }
                } } } } }], emit: event => {
                if (qualificationState.active !== qualification.predicate_id || qualification.variant !== 'M') throw new Error('host_child_qualification_scope');
                process.send({ kind: 'qualification_observation', event });
            } });
            controls.push(auxiliary);
        }
        if (!Array.isArray(message.proofParentEdges)) throw new Error('host_child_proof_parent');
        const parentAccess = message.proofParentEdges.length ? createDerivedParentAccess({ phase: 'proof', emit,
            bindings: message.proofParentEdges.map(edge => {
                const matches = message.bindings.filter(binding => binding.alias === edge.target);
                if (matches.length !== 1) throw new Error('host_child_proof_parent');
                return matches[0];
            }), edges: message.proofParentEdges }) : undefined;
        if (parentAccess) controls.push(parentAccess);
        bindObservedParents(message.proofParentMaterials, id => parentAccess.traverse(id));
        const invalid = () => { proofFailed = true; throw new Error('host_child_proof_access'); };
        function resolveReference(alias, field, ref) {
            if (typeof alias !== 'string' || typeof field !== 'string' || typeof ref !== 'string') invalid();
            const matches = message.directLinks.filter(link => link.source === alias && link.field === field
                && message.bindings.some(binding => binding.alias === link.target && binding.identity?.ref_id === ref));
            if (matches.length !== 1) invalid();
            return access.handle(alias).traverse(matches[0].id);
        }
        const proofSets = new Map();
        const materialBindings = message.bindings.filter(binding => binding.alias !== 'claim/context');
        for (const set of message.proofSets) {
            if (!set || Object.keys(set).sort().join(',') !== 'name,roster'
                || typeof set.name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(set.name)
                || proofSets.has(set.name) || !Array.isArray(set.roster)
                || set.roster.some(alias => !materialBindings.some(binding => binding.alias === alias && binding.identity))) invalid();
            const role = `proof/set/${set.name}`;
            const control = createNodeSetAccess({ role, roster: set.roster,
                bindings: materialBindings.map(binding => ({ ...binding, role })), links: message.directLinks, emit });
            controls.push(control); proofSets.set(set.name, control.handle);
        }
        const selections = new Map(); const selected = new Map(); let selectionBusy = false;
        if (!Array.isArray(message.proofSelections)) invalid();
        for (const selection of message.proofSelections) {
            if (!selection || Object.keys(selection).sort().join(',') !== 'candidate_set,selected_set'
                || typeof selection.selected_set !== 'string' || !/^[a-z][a-z0-9_]*$/.test(selection.selected_set)
                || !proofSets.has(selection.candidate_set) || proofSets.has(selection.selected_set)
                || selections.has(selection.selected_set)) invalid();
            selections.set(selection.selected_set, selection.candidate_set);
        }
        Object.defineProperties(operands, {
            phase: { enumerable: true, value: 'proof' },
            node: { enumerable: true, value: alias => access.handle(alias) },
            claim: { enumerable: true, value: () => access.handle('claim/context') },
            set: { enumerable: true, value: name => {
                if (selected.has(name)) return selected.get(name);
                if (typeof name !== 'string' || !proofSets.has(name)) invalid();
                return proofSets.get(name);
            } },
            select: { enumerable: true, value: (candidate, target, predicate) => {
                if (selectionBusy || typeof predicate !== 'function' || selected.has(target)
                    || selections.get(target) !== candidate || !proofSets.has(candidate)) invalid();
                selectionBusy = true;
                try {
                    const view = proofSets.get(candidate).select(predicate);
                    for (const control of controls) control.assertHealthy();
                    if (proofFailed) invalid();
                    selected.set(target, view); return view;
                } finally { selectionBusy = false; }
            } },
            resolveReference: { enumerable: true, value: resolveReference },
            memberEdge: { enumerable: true, value: (member, field) => {
                if (typeof field !== 'string') invalid();
                const owners = controls.filter(control => typeof control.rootAliasIfOwned === 'function')
                    .map(control => control.rootAliasIfOwned(member)).filter(alias => alias !== undefined);
                if (owners.length !== 1) invalid();
                const tuple = ['kind', 'ref_id', 'version'].map(key => member.identity(key));
                const aliases = message.bindings.filter(binding => binding.identity
                    && JSON.stringify(['kind', 'ref_id', 'version'].map(key => binding.identity[key])) === JSON.stringify(tuple));
                if (aliases.length !== 1 || aliases[0].alias !== owners[0]) invalid();
                return resolveReference(owners[0], field, member.get(field));
            } },
            edge: { enumerable: true, value: id => {
                if (message.proofParentEdges.some(edge => edge.id === id)) return parentAccess.traverse(id);
                const matches = message.directLinks.filter(link => link.id === id);
                if (matches.length !== 1) invalid();
                return access.handle(matches[0].source).traverse(id);
            } }
        });
        if (qualification) Object.defineProperties(operands, {
            qualification: { enumerable: true, value: () => {
                if (qualification.variant !== 'M' || qualificationState.active !== qualification.predicate_id) invalid();
                return auxiliary.handle('qualification/context');
            } },
            assertion: { enumerable: true, value: (id, callback) => {
                if (qualificationState.active !== null || typeof callback !== 'function'
                    || id !== qualification.predicate_ids[qualificationState.index]) invalid();
                qualificationState.active = id;
                process.send({ kind: 'proof_site_start', site: id });
                try {
                    const satisfied = callback();
                    if (typeof satisfied !== 'boolean') invalid();
                    qualificationState.results.push(satisfied); qualificationState.index++;
                    process.send({ kind: 'proof_site_result', site: id, satisfied }); return satisfied;
                } finally { qualificationState.active = null; }
            } }
        });
    } else if (message.directGroups.length) {
        for (const group of message.directGroups) {
            if (Object.hasOwn(operands, group.role)) throw new Error('host_child_role');
            const access = createInstrumentedAccess({ bindings: group.bindings, links: group.links, emit });
            controls.push(access);
            remember(access, group.bindings);
            Object.defineProperty(operands, group.role,
                { value: access.handle(group.alias), enumerable: true });
        }
    } else {
        const access = createInstrumentedAccess({ bindings: message.bindings,
            links: message.directLinks, emit });
        controls.push(access);
        remember(access, message.bindings);
        for (const operand of message.operandAliases) {
            if (Object.hasOwn(operands, operand.role)) throw new Error('host_child_role');
            Object.defineProperty(operands, operand.role,
                { value: access.handle(operand.alias), enumerable: true });
        }
    }
    for (const set of message.nodeSets) {
        if (Object.hasOwn(operands, set.role)) throw new Error('host_child_role');
        if (message.derivationBindings !== null && set.bindings.length) {
            const access = createInstrumentedAccess({ bindings: set.bindings, links: set.links, emit });
            controls.push(access); remember(access, set.bindings);
        }
        const control = createNodeSetAccess({ role: set.role, bindings: set.bindings,
            roster: set.roster, links: set.links, emit });
        controls.push(control);
        let handle = control.handle;
        if (message.derivationBindings !== null) {
            const selections = message.derivationBindings.selections.filter(row => row.role === set.role);
            handle = Object.freeze(Object.create(control.handle, { select: { value: predicate => {
                if (selections.some(row => selected.has(row.selected_set))) invalidDerivation();
                const view = control.handle.select(predicate);
                for (const row of selections) selected.set(row.selected_set, view);
                return view;
            } } }));
        }
        Object.defineProperty(operands, set.role, { value: handle, enumerable: true });
    }
    for (const group of message.parentGroups) {
        if (Object.hasOwn(operands, group.role)) throw new Error('host_child_role');
        const control = createDerivedParentAccess({ phase: 'derivation', emit,
            bindings: group.bindings, edges: group.edges });
        controls.push(control);
        Object.defineProperty(operands, group.role,
            { value: control.traverse(group.edgeId), enumerable: true });
    }
    harden(operands);
    failureStage = 'compartment';
    const guest = compartment(operands);
    const objectPrototype = guest.evaluate('Object.prototype');
    const arrayPrototype = guest.evaluate('Array.prototype');
    const evaluator = guest.evaluate(contents.files[0].source, EXECUTION_PROFILE.evaluate);
    if (typeof evaluator !== 'function') throw new Error('host_child_entry');
    failureStage = 'evaluation';
    const rawResult = evaluator(operands);
    if (qualificationState && (qualificationState.active !== null || qualificationState.index !== qualification.predicate_ids.length
        || rawResult !== qualificationState.results.every(Boolean))) throw new Error('host_child_qualification_sites');
    if (guardContents) {
        failureStage = 'evaluation';
        if (derivationFailed) invalidDerivation();
        const invalid = invalidDerivation;
        const inputSets = new Map();
        function inputSet(set) {
            if (set.aliases.some(alias => !derivationNodes.has(alias))) invalid();
            const members = set.aliases.map(alias => derivationNodes.get(alias));
            // Same admitted, non-selected input-population facade as the
            // compiler's native selection-observation path. No expected roster.
            const view = Object.freeze({ length: () => members.length, at: index => {
                if (!Number.isSafeInteger(index) || index < 0 || index >= members.length) invalid(); return members[index];
            }, [Symbol.iterator]() {
                let index = 0; let closed = false;
                return Object.freeze({ next() {
                    if (closed || index === members.length) { closed = true; return { value: undefined, done: true }; }
                    return { value: members[index++], done: false };
                }, return() { closed = true; return { value: undefined, done: true }; }, [Symbol.iterator]() { return this; } });
            } });
            inputSets.set(set.name, view); return view;
        }
        for (const row of message.derivationBindings.selections) if (!selected.has(row.selected_set)) invalid();
        const node = alias => { if (!derivationNodes.has(alias)) invalid(); return derivationNodes.get(alias); };
        const edge = id => {
            const matches = derivationLinks.filter(row => row.id === id);
            // A link can occur in several admitted role projections. Its
            // structural identity must remain identical, then use the first
            // reachable source handle, as the compiler does.
            if (!matches.length || matches.some(row => JSON.stringify(row) !== JSON.stringify(matches[0]))) invalid();
            return { relation: matches[0], handle: node(matches[0].source).traverse(id) };
        };
        const guardOperands = harden({ phase: 'derivation', node,
            claim: () => node('claim/context'), set: name => {
                if (selected.has(name)) return selected.get(name);
                if (inputSets.has(name)) return inputSets.get(name);
                const declared = message.derivationBindings.sets.find(set => set.name === name);
                if (!declared) invalid(); return inputSet(declared);
            }, edge: id => edge(id).handle, edgeTargetInSet: (id, name) => {
                const relation = edge(id).relation;
                const set = message.derivationBindings.sets.find(row => row.name === name);
                if (!set) invalid(); return set.aliases.includes(relation.target);
            } });
        const guard = guest.evaluate(guardContents.files[0].source, EXECUTION_PROFILE.evaluate);
        if (typeof guard !== 'function' || guard(guardOperands) !== true) invalid();
    }
    for (const control of controls) { control.revoke(); control.assertHealthy(); }
    if (proofFailed) throw new Error('host_child_proof_failed');
    failureStage = 'result';
    if (proof && typeof rawResult !== 'boolean') throw new Error('host_child_proof_result');
    const result = proof ? rawResult : copyGuestResult(rawResult, objectPrototype, arrayPrototype);
    return result;
}

process.once('message', message => {
    try {
        if (['--run-admitted-graph', '--run-qualified-graph'].includes(process.argv[2])) {
            if (!message || Object.keys(message).sort().join(',') !== 'derivation,kind,proof'
                || message.kind !== 'run_graph' || message.derivation?.phase !== 'derivation'
                || message.proof?.phase !== 'proof') throw new Error('host_child_protocol');
            for (const phase of ['derivation', 'proof']) {
                process.send({ kind: 'phase_start', phase });
                const value = run(message[phase], phase === 'derivation' ? message.proof : undefined);
                process.send({ kind: 'phase_result', phase, value });
            }
            process.send({ kind: 'graph_done' }, error => {
                if (error) process.exitCode = 1;
                process.disconnect();
            });
        } else {
            const value = run(message);
            process.send({ kind: 'result', value }, error => {
                if (error) process.exitCode = 1;
                process.disconnect();
            });
        }
    }
    catch {
        process.exitCode = 1;
        // Closed TCB stage codes only: never transport a guest's error text,
        // stack, payload or private identifier as diagnostic information.
        process.send({ kind: 'failure', stage: failureStage }, () => process.disconnect());
    }
});
process.send({ kind: 'ready' });
```

## src/next/provenance/executionProfile.js

SHA-256 8030b1f4a120ba37e6713057e9c5aa5b7d413183df4c26e3e8833814ad323abd; Git blob 45bcf48c400ab121dbbbfe9f43081c36ec07f4da; bytes 1688.

```javascript
'use strict';

const { freezeDeep } = require('../kernel/canonicalValue');

// Configuration to be measured in the execution closure. Exporting this object
// does not enforce confinement: the disposable TCB must apply and verify it.
const EXECUTION_PROFILE = freezeDeep({
    format: 'financasbot.provenance.execution-profile',
    version: 1,
    ses_version: '2.3.0',
    node_version: '22.17.0',
    native_timezone: { icu: '77.1', tz: '2025b', cldr: '47.0', unicode: '16.0' },
    guest: { ecma_version: 2022, source_type: 'script', parameter: 'operands' },
    lockdown: {
        errorTaming: 'safe', errorTrapping: 'none', reporting: 'none',
        unhandledRejectionTrapping: 'none', regExpTaming: 'safe', localeTaming: 'safe',
        consoleTaming: 'safe', overrideTaming: 'severe', stackFiltering: 'concise',
        domainTaming: 'safe', evalTaming: 'safe-eval', overrideDebug: [],
        legacyRegeneratorRuntimeTaming: 'safe', __hardenTaming__: 'safe'
    },
    evaluate: { transforms: [], __evadeHtmlCommentTest__: false,
        __evadeImportExpressionTest__: false, __rejectSomeDirectEvalExpressions__: true },
    denied_globals: [
        'process', 'require', 'module', 'exports', 'Buffer', '__dirname', '__filename',
        'fetch', 'WebSocket', 'XMLHttpRequest', 'console', 'Date', 'Intl', 'Promise',
        'setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval',
        'clearImmediate', 'queueMicrotask', 'performance', 'crypto',
        'eval', 'Function', 'Compartment', 'lockdown', 'harden',
        'WeakRef', 'FinalizationRegistry', 'SharedArrayBuffer', 'Atomics', 'WebAssembly'
    ]
});

module.exports = { EXECUTION_PROFILE };
```

## src/next/provenance/executionRegistry.js

SHA-256 951038a898e979ac25f79d9f5ca944cff8a83f2863074100eaced7e32fa56b29; Git blob ada1f81e8de7e4367bbc4ffe57a439b489a9242d; bytes 9312.

```javascript
'use strict';

const { createHash } = require('node:crypto');
const { types } = require('node:util');
const { canonicalValue } = require('../kernel/canonicalValue');
const { copyData, identifier } = require('./observationContract');

const admitted = new WeakMap();
const admittedContracts = new WeakMap();
const fail = code => { throw new Error(`execution_registry_${code}`); };
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const namePattern = /^[a-z][a-z0-9_]{0,63}$/;
const semanticRoles = new Set(['population', 'scope', 'period', 'policy', 'coverage',
    'source', 'target', 'left', 'right', 'numerator', 'denominator', 'sort_key',
    'sort_direction', 'opening_balance', 'limit', 'clock', 'evidence']);
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const entryKeys = ['artifact_status', 'contract_path', 'evaluator_artifact_root',
    'evaluator_contract_hash', 'evaluator_id', 'evaluator_version', 'metric',
    'roles', 'unit', 'witness_contract_ids'].sort().join(',');

function validRole(role) {
    if (!role || Object.keys(role).sort().join(',') !== 'cardinality,input_kind,ordered,role_id,semantic_role'
        || !namePattern.test(role.role_id) || !semanticRoles.has(role.semantic_role)
        || !['node', 'node_set', 'parent_claim', 'claim_context'].includes(role.input_kind)
        || typeof role.ordered !== 'boolean') return false;
    return role.input_kind === 'node_set'
        ? role.cardinality === 'many'
        : role.cardinality === 'one' && role.ordered === false;
}

function bytesOf(raw) {
    if (!raw || types.isProxy(raw) || !Buffer.isBuffer(raw)
        || Object.getPrototypeOf(raw) !== Buffer.prototype) fail('bytes');
    const length = Reflect.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')
        .get.call(raw);
    if (length < 1 || length > 1024 * 1024) fail('size');
    const result = Buffer.alloc(length);
    Uint8Array.prototype.set.call(result, raw);
    return result;
}

// TCB-only admission. expectedHash must originate from the independently
// reviewed freeze. Passing a self-computed hash only proves local consistency,
// not authority, and this receipt does not approve any graph or result.
function admitExecutionRegistry(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== 2 || !d.bytes || !d.expectedHash
        || !Object.hasOwn(d.bytes, 'value') || !Object.hasOwn(d.expectedHash, 'value')
        || !d.bytes.enumerable || !d.expectedHash.enumerable
        || typeof d.expectedHash.value !== 'string' || !digestPattern.test(d.expectedHash.value)) fail('input');
    const bytes = bytesOf(d.bytes.value);
    const observed = digest(bytes);
    if (observed !== d.expectedHash.value) fail('hash');
    const source = bytes.toString('utf8');
    if (!Buffer.from(source, 'utf8').equals(bytes)) fail('utf8');
    let parsed;
    try { parsed = JSON.parse(source); } catch { fail('json'); }
    try { if (canonicalValue(parsed) !== source) fail('canonical'); }
    catch { fail('canonical'); }
    let registry;
    try { registry = copyData(parsed); } catch { fail('shape'); }
    if (Object.keys(registry).sort().join(',') !== 'entries,registry_id,registry_version,schema_version,stage'
        || registry.schema_version !== 1 || registry.registry_id !== 'metric_evaluator_registry'
        || registry.registry_version !== 1 || registry.stage !== 'execution'
        || !Array.isArray(registry.entries) || registry.entries.length !== 39) fail('stage');
    const entries = new Map();
    for (const entry of registry.entries) {
        if (!entry || Object.keys(entry).sort().join(',') !== entryKeys
            || !namePattern.test(entry.evaluator_id) || entry.evaluator_id !== entry.metric
            || !Number.isSafeInteger(entry.evaluator_version) || entry.evaluator_version < 1
            || !digestPattern.test(entry.evaluator_artifact_root)
            || !digestPattern.test(entry.evaluator_contract_hash)
            || entry.contract_path !== `docs/contracts/next/provenance-v2/evaluator-contracts/${entry.evaluator_id}.json`
            || entry.artifact_status !== 'bound' || !Array.isArray(entry.roles) || !entry.roles.length
            || entry.roles.some(role => !validRole(role))
            || new Set(entry.roles.map(role => role.role_id)).size !== entry.roles.length
            || !Array.isArray(entry.witness_contract_ids) || !entry.witness_contract_ids.length
            || entry.witness_contract_ids.some(id => !namePattern.test(id))
            || new Set(entry.witness_contract_ids).size !== entry.witness_contract_ids.length
            || !['BRL_minor', 'count', 'entity_ids', 'state'].includes(entry.unit)) fail('entry');
        const key = JSON.stringify([entry.evaluator_id, entry.evaluator_version]);
        if (entries.has(key)) fail('duplicate');
        entries.set(key, entry);
    }
    const receipt = Object.freeze({ stage: 'admitted_execution_registry_bytes_only',
        observed_hash: observed, evaluatorCount: entries.size });
    admitted.set(receipt, entries);
    return receipt;
}

function resolveExecutionEvaluator(receipt, rawRef) {
    const entries = admitted.get(receipt);
    if (!entries) fail('not_admitted');
    let ref;
    try { ref = copyData(rawRef); } catch { fail('ref'); }
    if (Object.keys(ref).sort().join(',') !== 'evaluator_id,evaluator_version'
        || !identifier(ref.evaluator_id) || !Number.isSafeInteger(ref.evaluator_version)
        || ref.evaluator_version < 1) fail('ref');
    const entry = entries.get(JSON.stringify([ref.evaluator_id, ref.evaluator_version]));
    if (!entry) fail('missing');
    return entry;
}

// Exact published contract bytes, never canonicalized or normalized. The
// registry's contract hash is the sole expected value. This receipt conveys
// an output signature, not proof that the metric or graph has been accepted.
function admitExecutionContract(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('contract_input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== 3 || ['registryReceipt', 'evaluatorRef', 'bytes'].some(key =>
        !d[key] || !Object.hasOwn(d[key], 'value') || !d[key].enumerable)) fail('contract_input');
    const entry = resolveExecutionEvaluator(d.registryReceipt.value, d.evaluatorRef.value);
    const bytes = bytesOf(d.bytes.value);
    if (digest(bytes) !== entry.evaluator_contract_hash) fail('contract_hash');
    const source = bytes.toString('utf8');
    if (!Buffer.from(source, 'utf8').equals(bytes)) fail('contract_utf8');
    let contract;
    try { contract = copyData(JSON.parse(source)); } catch { fail('contract_json'); }
    const output = contract.signature?.output;
    const kinds = { BRL_minor: ['money_minor'], count: ['nonnegative_integer'],
        entity_ids: ['id', 'id_set'], state: ['enum'] };
    if (contract.schema_version !== 1 || contract.stage !== 'authoring'
        || contract.metric !== entry.metric || contract.unit !== entry.unit
        || contract.signature?.context !== 'explicit_versioned_instrumented_claim'
        || contract.signature?.operands !== 'resolve_roles_from_metric_evaluator_registry'
        || !output || !kinds[entry.unit].includes(output.kind)
        || Object.hasOwn(output, 'enum_values') && output.kind !== 'enum'
        || Object.keys(output).some(key => !['kind', 'enum_values'].includes(key))) fail('contract_signature');
    if (Object.hasOwn(output, 'enum_values') && (!Array.isArray(output.enum_values)
        || !output.enum_values.length || output.enum_values.some(value => !identifier(value))
        || new Set(output.enum_values).size !== output.enum_values.length)) fail('contract_signature');
    const receipt = Object.freeze({ stage: 'admitted_evaluator_contract_bytes_only',
        observed_hash: entry.evaluator_contract_hash });
    admittedContracts.set(receipt, Object.freeze({ registryReceipt: d.registryReceipt.value,
        evaluatorKey: JSON.stringify([entry.evaluator_id, entry.evaluator_version]),
        kind: output.kind, enumValues: Object.freeze([...(output.enum_values || [])]) }));
    return receipt;
}

function resolveExecutionOutput(registryReceipt, rawRef, contractReceipt) {
    const entry = resolveExecutionEvaluator(registryReceipt, rawRef);
    const record = admittedContracts.get(contractReceipt);
    if (!record || record.registryReceipt !== registryReceipt
        || record.evaluatorKey !== JSON.stringify([entry.evaluator_id, entry.evaluator_version])) fail('contract_not_admitted');
    return Object.freeze({ unit: entry.unit, kind: record.kind, enumValues: record.enumValues });
}

function executionContractHash(receipt) {
    if (!admittedContracts.has(receipt)) fail('contract_not_admitted');
    return receipt.observed_hash;
}

module.exports = { admitExecutionRegistry, resolveExecutionEvaluator,
    admitExecutionContract, resolveExecutionOutput, executionContractHash, isExecutionRole: validRole };
```

## src/next/provenance/financialHost.js

SHA-256 6fb0c1f874d23e333c3eb0bfaf4f66f5f89ca27b6ad410008cb121f72326b0a1; Git blob f9acb440ffe354637a3d53f9061b6fb2748e728c; bytes 16627.

```javascript
'use strict';
const { randomUUID, createHash } = require('node:crypto');
const { types } = require('node:util');
const { canonicalValue } = require('../kernel/canonicalValue');
const { copyData } = require('./observationContract');
const { admitPackage, admittedDocuments } = require('./packageContract');
const { compileAuthoringIR, compileSnapshotAccess } = require('./graphCompiler');
const { admitExecutionFreeze, freezeContents, admitFrozenArtifact, resolveFrozenProofRoot } = require('./freezeContract');
const { admitExecutionRegistry, resolveExecutionEvaluator, admitExecutionContract, resolveExecutionOutput } = require('./executionRegistry');
const { admitArtifact, artifactContents } = require('./artifactLoader');
const { admitPhaseCompositionProfile, phaseCompositionCommitment } = require('./phaseCompositionProfile');
const { verifyNativeRuntime } = require('./nativeRuntime');
const { runAdmittedGraph } = require('./executionHost');
const { comparePhaseCoverage } = require('./proofAcceptance');
const { createSameExecutionParentLedger, calculateDerivedResultHash } = require('./claimBinding');
const { proofProgramIdentity } = require('./phaseProgramIdentity');
const GRAPH_PATH = 'docs/contracts/next/provenance-v2/graphs-v2.json';
const fail = code => { throw new Error(`financial_host_${code}`); };
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
function own(raw, names) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== names.length || names.some(name => !d[name]?.enumerable
        || !Object.hasOwn(d[name], 'value'))) fail('input');
    return Object.fromEntries(names.map(name => [name, d[name].value]));
}
function list(raw, maximum) {
    if (types.isProxy(raw) || !Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype
        || !raw.length || raw.length > maximum) fail('inventory');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== raw.length + 1) fail('inventory');
    return Array.from({ length: raw.length }, (_, i) => {
        if (!d[i]?.enumerable || !Object.hasOwn(d[i], 'value')) fail('inventory'); return d[i].value;
    });
}
function capture(raw, max = 16 * 1024 * 1024) {
    if (types.isProxy(raw) || !Buffer.isBuffer(raw) || Object.getPrototypeOf(raw) !== Buffer.prototype) fail('bytes');
    const size = Reflect.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength').get.call(raw);
    if (!size || size > max) fail('bytes'); const result = Buffer.alloc(size); Uint8Array.prototype.set.call(result, raw); return result;
}
const plain = value => JSON.parse(JSON.stringify(copyData(value)));
function artifactMap(raw, identity, expectedIds) {
    const rows = new Map();
    for (const item of list(raw, 76)) {
        const row = own(item, [identity, 'manifestBytes', 'entries']);
        const id = row[identity];
        if (typeof id !== 'string' || rows.has(id) || !expectedIds.has(id)) fail('artifact_inventory'); rows.set(id, row);
    }
    if (rows.size !== expectedIds.size) fail('artifact_inventory'); return rows;
}
function expectedPhase(graph, phase) { const { evidence_set_mode, ...expected } = graph.trace_contract[phase]; return expected; }

// TCB INTERNAL factory. The captured launcher supplies bootstrap authority;
// model/request data cannot select a freeze, root, validator or callback.
// The exported runtime object contains no emitReceipt/acceptPrimary/ledger API.
function createPrivateFinancialHost(rawData, rawBootstrap, validators) {
    const data = own(rawData, ['packageEntries', 'registryBytes', 'metricArtifacts', 'proofArtifacts', 'profileSource', 'timeoutMs']);
    const bootstrap = own(rawBootstrap, ['freezeBytes', 'expectedFreezeHash', 'tcbArtifact']);
    if (!Number.isSafeInteger(data.timeoutMs) || data.timeoutMs < 100 || data.timeoutMs > 5000) fail('timeout');
    const freezeReceipt = admitExecutionFreeze({ bytes: bootstrap.freezeBytes, expectedHash: bootstrap.expectedFreezeHash });
    const freeze = freezeContents(freezeReceipt);
    const tcbInput = own(bootstrap.tcbArtifact, ['manifestBytes', 'entries']);
    const tcbArtifactReceipt = admitFrozenArtifact({ freezeReceipt, kind: 'tcb', programId: null, ...tcbInput });
    const tcb = artifactContents(tcbArtifactReceipt);
    if (tcb.entry !== 'launcher-bootstrap.js' || tcb.files.map(row => row.path).join(',')
        !== 'child-bootstrap.js,host-bootstrap.js,launcher-bootstrap.js,recipe.json') fail('tcb_inventory');
    const nativeRuntimeReceipt = verifyNativeRuntime(freezeReceipt);
    const childBytes = Buffer.from(tcb.files[0].source);
    const childManifest = Buffer.from(canonicalValue({ format: 'financasbot.provenance.artifact', version: 1, kind: 'tcb',
        entry: 'bootstrap.js', files: [{ path: 'bootstrap.js', media_type: 'text/javascript', sha256: hash(childBytes) }] }));
    const childCapsuleReceipt = admitFrozenArtifact({ freezeReceipt, kind: 'child', programId: null,
        manifestBytes: childManifest, entries: [{ path: 'bootstrap.js', bytes: childBytes }] });
    const packageEntries = list(data.packageEntries, 128).map(item => {
        const row = own(item, ['path', 'bytes']); return { path: row.path, bytes: capture(row.bytes) };
    });
    const packageReceipt = admitPackage({ entries: packageEntries, authority: plain(freeze.package_authority) });
    const documents = new Map(admittedDocuments(packageReceipt).map(row => [row.path, row]));
    const graphDocument = documents.get(GRAPH_PATH); if (!graphDocument) fail('graph_document');
    const corpus = graphDocument.value;
    const claims = new Map(documents.get(corpus.claim_contract.path).value.claims.map(row => [row.fact_key, row]));
    const graphs = new Map(corpus.graphs.map(row => [row.fact_key, row]));
    const authorRegistry = documents.get(corpus.metric_evaluator_registry.path).value;
    const materialRegistry = documents.get(corpus.material_registry.path).value;
    const plan = compileSnapshotAccess(packageReceipt, validators);
    const ir = compileAuthoringIR(packageReceipt, validators);
    if (ir.order.length !== 76 || graphs.size !== 76 || claims.size !== 76) fail('graph_inventory');
    const registryReceipt = admitExecutionRegistry({ bytes: data.registryBytes, expectedHash: freeze.metric_registry_hash });
    const metricIds = new Set(authorRegistry.entries.map(row => row.evaluator_id));
    const metricRows = artifactMap(data.metricArtifacts, 'evaluator_id', metricIds);
    const metrics = new Map(); const contracts = new Map();
    for (const authored of authorRegistry.entries) {
        const ref = { evaluator_id: authored.evaluator_id, evaluator_version: authored.evaluator_version };
        const entry = resolveExecutionEvaluator(registryReceipt, ref);
        for (const field of ['evaluator_id', 'evaluator_version', 'metric', 'unit', 'contract_path', 'evaluator_contract_hash', 'roles', 'witness_contract_ids']) {
            if (canonicalValue(plain(entry[field])) !== canonicalValue(plain(authored[field]))) fail('registry_identity');
        }
        const row = metricRows.get(entry.evaluator_id);
        const artifact = admitArtifact({ manifestBytes: row.manifestBytes, entries: row.entries, expectedRoot: entry.evaluator_artifact_root });
        if (artifactContents(artifact).kind !== 'metric') fail('metric_kind'); metrics.set(entry.evaluator_id, artifact);
        const contractBytes = packageEntries.find(row => row.path === entry.contract_path)?.bytes;
        contracts.set(entry.evaluator_id, admitExecutionContract({ registryReceipt, evaluatorRef: ref, bytes: contractBytes }));
    }
    const profile = admitPhaseCompositionProfile({ source: data.profileSource, registry: authorRegistry });
    const profileRoot = phaseCompositionCommitment(profile).sha256;
    const programIds = new Map();
    for (const factKey of ir.order) {
        const selector = { fact_key: factKey };
        programIds.set(factKey, proofProgramIdentity(plan.projectProofProgram(selector).input,
            plan.projectDerivationProgram(selector, profile).input, profileRoot));
    }
    const expectedProgramIds = new Set(programIds.values());
    if (freeze.proof_programs.length !== expectedProgramIds.size
        || freeze.proof_programs.some(row => !expectedProgramIds.has(row.program_id))) fail('proof_inventory');
    const proofRows = artifactMap(data.proofArtifacts, 'program_id', expectedProgramIds); const proofs = new Map();
    for (const programId of expectedProgramIds) {
        const row = proofRows.get(programId);
        proofs.set(programId, admitFrozenArtifact({ freezeReceipt, kind: 'proof', programId,
            manifestBytes: row.manifestBytes, entries: row.entries }));
    }
    const executionId = randomUUID();
    const ledger = createSameExecutionParentLedger({ executionId });
    const accepted = new Map(); const publicResults = new Map(); let state = 'idle';
    const descriptor = { registry_version: materialRegistry.registry_version, kind: 'derived_claim', fields: materialRegistry.kinds.derived_claim.fields };
    async function run() {
        if (arguments.length || state !== 'idle') fail('lifecycle'); state = 'running';
        try {
            for (const factKey of ir.order) {
                const graph = graphs.get(factKey); const claim = claims.get(factKey);
                const entry = resolveExecutionEvaluator(registryReceipt, claim.evaluator_ref);
                const invocationId = randomUUID(); const scope = ledger.openInvocation({ invocationId });
                try {
                    const parentRoles = entry.roles.filter(row => row.input_kind === 'parent_claim');
                    const parentContext = parentRoles.length ? { receiptScope: scope, registryReceipt,
                        receipts: Object.fromEntries(parentRoles.map(role => {
                            const parent = accepted.get(claim.operand_bindings[role.role_id].fact_key);
                            if (!parent?.receipt) fail('parent_missing'); return [role.role_id, parent.receipt];
                        })) } : undefined;
                    const selector = { fact_key: factKey };
                    const metric = plan.projectMetricTransport(selector, parentContext);
                    const proof = plan.projectProofTransport(selector, parentContext);
                    const programId = programIds.get(factKey); const proofArtifact = proofs.get(programId);
                    const result = await runAdmittedGraph({ executionId, invocationId, timeoutMs: data.timeoutMs,
                        nativeRuntimeReceipt, tcbArtifactReceipt, evaluatorContractReceipt: contracts.get(entry.evaluator_id), childCapsuleReceipt,
                        derivation: { artifactReceipt: metrics.get(entry.evaluator_id), bindings: [], directGroups: metric.directGroups,
                            nodeSets: metric.nodeSets, parentGroups: metric.parentGroups, derivationBindings: plan.projectDerivationBindings(selector) },
                        proof: { ...proof.config, artifactReceipt: proofArtifact } });
                    const output = resolveExecutionOutput(registryReceipt, claim.evaluator_ref, contracts.get(entry.evaluator_id));
                    if (result.functional_result.unit !== output.unit || result.functional_result.kind !== output.kind
                        || output.enumValues.length && !output.enumValues.includes(result.functional_result.value)) fail('result_signature');
                    if (result.proof_satisfied !== true || result.observed_child_capsule_root !== freeze.child_capsule_root
                        || result.observed_validation_tcb_root !== freeze.validation_tcb_root
                        || result.observed_evaluator_contract_hash !== entry.evaluator_contract_hash
                        || result.observed_evaluator_artifact_root !== entry.evaluator_artifact_root
                        || result.observed_proof_engine_artifact_root !== resolveFrozenProofRoot(freezeReceipt, programId)) fail('proof_or_roots');
                    for (const phase of ['derivation', 'proof']) {
                        const bindings = phase === 'proof' ? proof.config.proofSelections.map(row => ({ role: `proof/set/${row.candidate_set}`, ...row }))
                            : graph.trace_contract.derivation.required_selections.map(selection => {
                                const roles = Object.entries(claim.operand_bindings).filter(([, row]) => row.kind === 'node_set'
                                    && canonicalValue(row.aliases) === canonicalValue(graph.sets[selection.candidate_set]));
                                if (roles.length !== 1) fail('selection_binding');
                                return { role: roles[0][0], candidate_set: selection.candidate_set, selected_set: selection.selected_set };
                            });
                        const operandSets = phase === 'proof' ? proof.config.proofSets.map(row => ({ role: `proof/set/${row.name}`, aliases: row.roster }))
                            : Object.entries(claim.operand_bindings).filter(([, row]) => row.kind === 'node_set').map(([role, row]) => ({ role, aliases: row.aliases }));
                        const measurements = [{ measurement: 'validation_tcb_root', observed: freeze.validation_tcb_root },
                            { measurement: 'proof_engine_artifact_root', observed: resolveFrozenProofRoot(freezeReceipt, programId) },
                            ...(phase === 'derivation' ? [{ measurement: 'evaluator_artifact_root', observed: entry.evaluator_artifact_root },
                                { measurement: 'evaluator_contract_hash', observed: entry.evaluator_contract_hash }] : [])];
                        const coverage = comparePhaseCoverage({ trace: result.trace, executionId, invocationId, phase,
                            expected: expectedPhase(graph, phase), sets: graph.sets, bindings, operandSets,
                            accessBindings: plan.observationMetadata({ fact_key: factKey, phase }, parentContext), measurements });
                        if (!coverage.matched) fail('trace_mismatch');
                    }
                    const preimage = { claim_contract_hash: corpus.claim_contract.hash, graph_contract_hash: graphDocument.sha256,
                        metric_registry_hash: registryReceipt.observed_hash, claim_id: claim.claim_id, fact_key: factKey,
                        evaluator_ref: claim.evaluator_ref, result: result.functional_result, operand_bindings: claim.operand_bindings,
                        registry_roles: plain(entry.roles), primary_inputs: Object.entries(graph.nodes).filter(([, node]) => node.binding === 'snapshot')
                            .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([alias, node]) => ({ alias, kind: node.kind,
                                ref_id: node.ref_id, version: node.version, semantic_fingerprint: node.semantic_fingerprint })),
                        parents: parentRoles.map(role => { const parent = accepted.get(claim.operand_bindings[role.role_id].fact_key);
                            return { role_id: role.role_id, fact_key: parent.factKey, evaluator_version: parent.version, result_hash: parent.resultHash }; }) };
                    const resultHash = calculateDerivedResultHash(preimage);
                    const receipt = parentRoles.length ? null : scope.acceptPrimary({ preimage, descriptor });
                    accepted.set(factKey, { factKey, version: entry.evaluator_version, resultHash, receipt });
                    const publicRef = randomUUID(); publicResults.set(publicRef, result.functional_result);
                } finally { scope.seal(); }
            }
            ledger.finish(); state = 'complete';
            return Object.freeze({ stage: 'validated_dag_results', graph_count: accepted.size,
                evidence_refs: Object.freeze([...publicResults.keys()]) });
        } catch { state = 'failed'; accepted.clear(); publicResults.clear(); fail('execution_rejected'); }
    }
    return Object.freeze({ run, read(reference) {
        if (arguments.length !== 1 || state !== 'complete' || typeof reference !== 'string' || !publicResults.has(reference)) fail('reference');
        return publicResults.get(reference);
    } });
}
module.exports = { createPrivateFinancialHost, proofProgramIdentity };
```

## src/next/provenance/freezeContract.js

SHA-256 b452ce4ffb2688dc578ae0901eabd07c1d48b1d00e8e375a53f82bae63326305; Git blob 5a77cff9b3af7d7135a59ddc308005de071c70bd; bytes 6536.

```javascript
'use strict';

const { createHash } = require('node:crypto');
const { types } = require('node:util');
const { canonicalValue } = require('../kernel/canonicalValue');
const { copyData } = require('./observationContract');
const { admitArtifact, artifactContents } = require('./artifactLoader');
const admitted = new WeakMap();
const fail = code => { throw new Error(`execution_freeze_${code}`); };
const sha = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...expected].sort().join(',');
function own(raw, names) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== names.length || names.some(name =>
        !d[name]?.enumerable || !Object.hasOwn(d[name], 'value'))) fail('input');
    return Object.fromEntries(names.map(name => [name, d[name].value]));
}
function capture(bytes) {
    if (!bytes || types.isProxy(bytes) || !Buffer.isBuffer(bytes)
        || Object.getPrototypeOf(bytes) !== Buffer.prototype) fail('bytes');
    const size = Reflect.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength').get.call(bytes);
    if (!size || size > 256 * 1024) fail('size');
    const result = Buffer.alloc(size); Uint8Array.prototype.set.call(result, bytes); return result;
}
function plain(value) {
    if (Array.isArray(value)) return value.map(plain);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
    return value;
}
function pathValid(path) {
    return typeof path === 'string' && path.length <= 512 && path.split('/').every(part =>
        /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part) && !part.endsWith('.')
        && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part));
}

// Trusted bootstrap supplies expectedHash from an independently reviewed
// immutable freeze. There is deliberately no API to calculate that expectation
// from the artifacts being admitted. This receipt is byte authority only: it
// does not authenticate its caller, certify closure completeness or accept R.
function admitExecutionFreeze(raw) {
    const { bytes: rawBytes, expectedHash } = own(raw, ['bytes', 'expectedHash']);
    if (!sha(expectedHash)) fail('expected_hash');
    const bytes = capture(rawBytes);
    if (hash(bytes) !== expectedHash) fail('hash');
    const source = bytes.toString('utf8');
    if (!Buffer.from(source, 'utf8').equals(bytes)) fail('utf8');
    let value;
    try { value = plain(copyData(JSON.parse(source))); } catch { fail('json'); }
    if (canonicalValue(value) !== source) fail('canonical');
    if (!keys(value, ['schema_version', 'freeze_id', 'freeze_version', 'stage', 'metric_registry_hash',
        'validation_tcb_root', 'child_capsule_root', 'native_runtime', 'package_authority', 'proof_programs'])
        || value.schema_version !== 1 || value.freeze_id !== 'provenance_execution'
        || !Number.isSafeInteger(value.freeze_version) || value.freeze_version < 1
        || value.stage !== 'execution' || !sha(value.metric_registry_hash)
        || !sha(value.validation_tcb_root) || !sha(value.child_capsule_root)) fail('shape');
    const native = value.native_runtime;
    if (!keys(native, ['platform', 'arch', 'node_version', 'node_binary_sha256'])
        || !['win32', 'linux', 'darwin'].includes(native.platform)
        || !['x64', 'arm64'].includes(native.arch) || !/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(native.node_version)
        || !sha(native.node_binary_sha256)) fail('native_runtime');
    if (!Array.isArray(value.package_authority) || !value.package_authority.length
        || value.package_authority.length > 128) fail('package_inventory');
    let previous = ''; const folded = new Set();
    for (const row of value.package_authority) {
        if (!keys(row, ['path', 'sha256']) || !pathValid(row.path) || !sha(row.sha256)
            || row.path <= previous || folded.has(row.path.toLowerCase())) fail('package_inventory');
        previous = row.path; folded.add(row.path.toLowerCase());
    }
    if (!Array.isArray(value.proof_programs) || !value.proof_programs.length || value.proof_programs.length > 76) fail('proof_inventory');
    previous = ''; const programs = new Map();
    for (const row of value.proof_programs) {
        if (!keys(row, ['program_id', 'proof_engine_artifact_root']) || !sha(row.program_id)
            || !sha(row.proof_engine_artifact_root) || row.program_id <= previous) fail('proof_inventory');
        previous = row.program_id; programs.set(row.program_id, row.proof_engine_artifact_root);
    }
    const immutable = copyData(value);
    const receipt = Object.freeze({ stage: 'admitted_execution_freeze_bytes_only', observed_hash: expectedHash,
        financial_acceptance: false });
    admitted.set(receipt, { value: immutable, programs }); return receipt;
}
function freezeContents(receipt) {
    const record = admitted.get(receipt); if (!record) fail('not_admitted'); return record.value;
}
function resolveFrozenProofRoot(receipt, programId) {
    const record = admitted.get(receipt); if (!record) fail('not_admitted');
    if (!sha(programId) || !record.programs.has(programId)) fail('proof_missing');
    return record.programs.get(programId);
}
function admitFrozenArtifact(raw) {
    const { freezeReceipt, kind, programId, manifestBytes, entries } = own(raw,
        ['freezeReceipt', 'kind', 'programId', 'manifestBytes', 'entries']);
    const authority = freezeContents(freezeReceipt);
    let expectedRoot;
    if (kind === 'proof') expectedRoot = resolveFrozenProofRoot(freezeReceipt, programId);
    else if (programId === null && kind === 'tcb') expectedRoot = authority.validation_tcb_root;
    else if (programId === null && kind === 'child') expectedRoot = authority.child_capsule_root;
    else fail('artifact_selector');
    const receipt = admitArtifact({ manifestBytes, entries, expectedRoot });
    if (artifactContents(receipt).kind !== (kind === 'child' ? 'tcb' : kind)) fail('artifact_kind');
    return receipt;
}
module.exports = { admitExecutionFreeze, freezeContents, resolveFrozenProofRoot, admitFrozenArtifact };
```

## src/next/provenance/nativeRuntime.js

SHA-256 7d04d107c24a350ba9a3ccd25a7e899629c4d965301e9063f8c7dbe534d7e64b; Git blob 74333361858d841aa2beb9b0873c904e1ede5c4b; bytes 2370.

```javascript
'use strict';
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { execPath, platform, arch, version } = require('node:process');
const { freezeContents } = require('./freezeContract');
const admitted = new WeakMap();
const fail = code => { throw new Error(`native_runtime_${code}`); };
function measure(expected) {
    if (expected.platform !== platform || expected.arch !== arch || expected.node_version !== version) fail('identity');
    let bytes;
    try { bytes = readFileSync(execPath); } catch { fail('unavailable'); }
    if (!bytes.length || bytes.length > 256 * 1024 * 1024) fail('size');
    const observed = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    if (observed !== expected.node_binary_sha256) fail('binary_mismatch');
    return observed;
}
// Only the current executable can be selected. No filesystem path, expected
// hash or environment hooks come from model/request data. Native Node/V8/OS
// remain the declared external trust boundary, not an OS sandbox or a defense
// against replacement by a compromised platform between measurement and launch.
function verifyNativeRuntime(freezeReceipt) {
    const expected = freezeContents(freezeReceipt).native_runtime;
    const observed = measure(expected);
    const receipt = Object.freeze({ stage: 'verified_native_runtime_only', observed_sha256: observed,
        financial_acceptance: false });
    admitted.set(receipt, expected); return receipt;
}
function verifiedNodeExecutable(receipt) {
    const expected = admitted.get(receipt); if (!expected) fail('not_admitted');
    measure(expected); return execPath;
}
function verifiedNativeRuntimeHash(receipt) {
    const expected = admitted.get(receipt); if (!expected) fail('not_admitted');
    return expected.node_binary_sha256;
}
// Launcher-to-captured-host capability, not the complete filesystem module.
// Only rereading the current native executable is allowed; no caller path,
// encoding option, directory, write or metadata API is exposed.
function nativeRuntimeFileCapability() {
    return Object.freeze({ readFileSync(path) {
        if (arguments.length !== 1 || path !== execPath) fail('path'); return readFileSync(execPath);
    } });
}
module.exports = { verifyNativeRuntime, verifiedNodeExecutable, verifiedNativeRuntimeHash, nativeRuntimeFileCapability };
```

## src/next/provenance/validationTcbEntry.js

SHA-256 35366bec38beda91299f97d4448872e56efbf5a406389aed1c9ac9e40e54293f; Git blob fb2995939e30f98ce3a075d26a3757d0f2445761; bytes 32235.

```javascript
'use strict';

// Captured DEVELOPMENT tools, not the product API or financial authority.
// All require edges are fulfilled by the closed byte table, never ambient
// project/node_modules resolution. The launcher exposes only the private
// initializer; diagnostic methods below are not the guest/product API.
const { admitPackage } = require('./packageContract');
const { compileSnapshotAccess, compileAuthoringIR, prepareClaimMonthQualification, compileClaimMonthQualificationIR,
    compileClaimMonthQualificationAccess, prepareClaimMonthIsolatedPlan, assertClaimMonthIsolatedProgram,
    sealClaimMonthIsolatedLowering, admitClaimMonthIsolatedProof, admitClaimMonthFrozenBaseline } = require('./graphCompiler');
const { admitArtifact } = require('./artifactLoader');
const { admitPhaseCompositionProfile, phaseCompositionCommitment } = require('./phaseCompositionProfile');
const { runAdmittedGraph, runClaimMonthQualifiedGraph } = require('./executionHost');
const { comparePhaseCoverage } = require('./proofAcceptance');
const { sealClaimMonthTargetTrace, compareClaimMonthTargetTrace, sealClaimMonthCoreTrace, compareClaimMonthCoreTrace } = require('./claimMonthTraceContract');
const { admitExecutionRegistry, admitExecutionContract } = require('./executionRegistry');
const { admitExecutionFreeze, admitFrozenArtifact } = require('./freezeContract');
const { verifyNativeRuntime } = require('./nativeRuntime');
const { createPrivateFinancialHost } = require('./financialHost');
const { EXECUTION_PROFILE } = require('./executionProfile');
const validators = require('../vendor/schemaValidators');
const { readPredicateTypeDiagnostic } = require('./predicateTypes');
const { readTemplateReferenceDiagnostic } = require('./templateReferences');
const { readGraphStructureDiagnostic } = require('./graphStructure');
const { readSelectionBindingDiagnostic } = require('./selectionBindings');
const { types } = require('node:util');
const { createHash } = require('node:crypto');
const { canonicalValue, digest, freezeDeep } = require('../kernel/canonicalValue');
const { copyData, identifier } = require('./observationContract');
const { artifactContents } = require('./artifactLoader');
const { freezeContents } = require('./freezeContract');
const { resolveExecutionEvaluator } = require('./executionRegistry');

// Trusted INTERNAL provisioning only. An independently reviewed external pin
// binds the exact serialized BUILD request; serialization does NOT transfer a
// WeakMap brand between the compiler and captured host. This factory cannot
// authenticate a human, authenticate its own caller/pin or qualify a row.
function initializePathQualification(raw, bootstrap) {
    const fail = code => { throw new Error(`captured_path_${code}`); };
    const own = (value, names) => {
        if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value)
            || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('input');
        const d = Object.getOwnPropertyDescriptors(value);
        if (Reflect.ownKeys(d).length !== names.length || names.some(name => !d[name]?.enumerable
            || !Object.hasOwn(d[name], 'value'))) fail('input');
        return Object.fromEntries(names.map(name => [name, d[name].value]));
    };
    const commitment = source => `sha256:${digest({ source })}`;
    const data = own(raw, ['ticketSource', 'payloadSource', 'expectedTicketCommitment']);
    if (typeof data.ticketSource !== 'string' || !data.ticketSource.length || data.ticketSource.length > 1048576
        || typeof data.payloadSource !== 'string' || !data.payloadSource.length || data.payloadSource.length > 16 * 1024 * 1024
        || typeof data.expectedTicketCommitment !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(data.expectedTicketCommitment)
        || commitment(data.ticketSource) !== data.expectedTicketCommitment) fail('ticket_pin');
    let ticket, payload;
    try {
        ticket = JSON.parse(data.ticketSource); payload = JSON.parse(data.payloadSource);
        if (canonicalValue(ticket) !== data.ticketSource || canonicalValue(payload) !== data.payloadSource) fail('canonical');
        ticket = JSON.parse(JSON.stringify(copyData(ticket)));
    } catch { fail('transport'); }
    own(ticket, ['stage', 'method_commit', 'candidate_id', 'invocation_id', 'target_fact_key', 'reference',
        'reference_commitment', 'preselection_commitments', 'normal_admission_basis_commitment',
        'prerequisites', 'payload_commitment', 'worlds']);
    if (ticket.stage !== 'path_v3_execution_ticket_not_financial_authority'
        || ticket.method_commit !== '72fc5a5b707909687da9b5cec892be2dcc892a62'
        || !identifier(ticket.candidate_id) || !identifier(ticket.invocation_id) || !identifier(ticket.target_fact_key)
        || commitment(data.payloadSource) !== ticket.payload_commitment
        || `sha256:${digest(ticket.reference)}` !== ticket.reference_commitment
        || ticket.reference.candidate_id !== ticket.candidate_id || ticket.reference.invocation_id !== ticket.invocation_id
        || ticket.reference.discriminating !== true) fail('binding');
    own(ticket.preselection_commitments, ['entries_sha256', 'domain_sha256']);
    if (Object.values(ticket.preselection_commitments).some(value => typeof value !== 'string'
        || !/^sha256:[a-f0-9]{64}$/.test(value))) fail('preselection');
    const prerequisites = own(ticket.prerequisites, ['admitted_domain_complete', 'witness_domain_complete',
        'first_witness_proved', 'normal_admission_verified', 'reference_preselected', 'normal_compilation_complete']);
    if (Object.values(prerequisites).some(value => typeof value !== 'boolean')) fail('prerequisites_shape');
    if (!Array.isArray(ticket.worlds) || ticket.worlds.length !== 3
        || ticket.worlds.map(world => world.variant).join(',') !== 'C,M,S') fail('worlds');
    const ids = new Set();
    for (const world of ticket.worlds) {
        own(world, ['variant', 'execution_id', 'package_root']);
        if (!identifier(world.execution_id) || ids.has(world.execution_id)
            || !/^sha256:[a-f0-9]{64}$/.test(world.package_root)) fail('world_identity');
        ids.add(world.execution_id);
    }
    own(payload, ['worlds', 'normal_admission_basis']);
    const normalBasis = own(payload.normal_admission_basis, ['stage', 'conditional_partition', 'normal_rule_reference',
        'premise_evidence', 'native_controls', 'normal_worlds', 'independent_reviewed_rule_basis_verified',
        'qualified', 'semantic_mutation_credit']);
    if (normalBasis.stage !== 'path_v3_captured_normal_admission_basis_not_independent_review'
        || normalBasis.independent_reviewed_rule_basis_verified !== false || normalBasis.qualified !== false
        || normalBasis.semantic_mutation_credit !== 0
        || commitment(canonicalValue(payload.normal_admission_basis)) !== ticket.normal_admission_basis_commitment)
        fail('normal_admission_basis_binding');
    // Hashes bind transport bytes, not the relations between those bytes.
    // Recheck the finite pre-M basis against its separately retained premises,
    // controls and ticket identities. This is not caller authentication or
    // independent review of the normal rules.
    const emptyBasis = ['conditional_partition', 'normal_rule_reference', 'premise_evidence', 'native_controls']
        .every(name => normalBasis[name] === null) && Array.isArray(normalBasis.normal_worlds)
        && normalBasis.normal_worlds.length === 0;
    if (!emptyBasis) {
        try {
            const partition = normalBasis.conditional_partition, reference = normalBasis.normal_rule_reference;
            const premise = normalBasis.premise_evidence, controls = normalBasis.native_controls;
            const composition = reference.normal_rule_composition;
            const allControls = [...controls.unknown_path_controls, ...controls.selection_controls];
            const ruleReview = controls.normal_rule_review, domainSeal = controls.review_bound_domain_seal;
            if (ruleReview === null && domainSeal === null) {
                if (premise.external_rule_review_scope_byte_binding_verified !== false
                    || ['admitted_domain_complete', 'witness_domain_complete', 'first_witness_proved',
                        'normal_admission_verified'].some(name => prerequisites[name] !== false))
                    fail('normal_admission_basis_relation');
            } else {
                // Imported trusted-bootstrap scope, not authentication of a
                // human/receipt or an audit performed by this initializer.
                const packet = own(ruleReview, ['snapshotSource', 'expectedReviewHash']);
                if (typeof packet.snapshotSource !== 'string' || !packet.snapshotSource.length
                    || packet.snapshotSource.length > 1048576 || typeof packet.expectedReviewHash !== 'string'
                    || packet.expectedReviewHash !== 'sha256:' + createHash('sha256').update(packet.snapshotSource).digest('hex'))
                    fail('normal_admission_basis_relation');
                const snapshot = JSON.parse(packet.snapshotSource);
                own(snapshot, ['format', 'version', 'stage', 'core']);
                const stableEntries = domainSeal.entries.map(entry => {
                    const { invocation_id, ...stable } = entry;
                    if (stable.reference !== null) {
                        const { invocation_id: ignored, ...semantic } = stable.reference;
                        stable.reference = semantic;
                    }
                    return stable;
                });
                const stablePartition = { ...partition, entries: partition.entries.map(member => ({ ...member,
                    reference_sha256: stableEntries[member.entry_index].reference === null ? null
                        : `sha256:${digest(stableEntries[member.entry_index].reference)}` })) };
                const core = snapshot.core, selected = domainSeal.selected;
                const decodedReference = { ...core.normal_rule_reference };
                for (const key of ['sources', 'schema_reference_sources']) decodedReference[key] = core.normal_rule_reference[key].map(row => {
                    own(row, ['path', 'sha256', 'source_chunks']);
                    if (!Array.isArray(row.source_chunks) || !row.source_chunks.length
                        || row.source_chunks.some((source, index) => typeof source !== 'string' || !source.length
                            || source.length > 65536 || index < row.source_chunks.length - 1 && source.length !== 65536))
                        fail('normal_admission_basis_relation');
                    const source = row.source_chunks.join('');
                    if (row.sha256 !== 'sha256:' + createHash('sha256').update(source).digest('hex'))
                        fail('normal_admission_basis_relation');
                    return { path: row.path, sha256: row.sha256, source };
                });
                const first = partition.entries.find(member => member.classification === 'conditional_witness');
                const siteDomains = composition.sites.map(site => {
                    const members = stablePartition.entries.filter(member => member.site_index === site.site_index);
                    return { site_index: site.site_index, L: members.map(member => member.locator_index),
                        A: members.filter(member => ['conditional_witness', 'conditional_non_witness'].includes(member.classification))
                            .map(member => member.locator_index),
                        W: members.filter(member => member.classification === 'conditional_witness').map(member => member.locator_index),
                        excluded: members.filter(member => member.classification === 'necessary_exclusion_pending_native_barrier')
                            .map(member => member.locator_index) };
                });
                if (canonicalValue(snapshot) !== packet.snapshotSource
                    || snapshot.format !== 'financasbot.path-normal-rule-review-snapshot' || snapshot.version !== 1
                    || snapshot.stage !== 'path_v3_normal_rule_review_snapshot_only'
                    || canonicalValue(domainSeal.snapshot_core) !== canonicalValue(core)
                    || canonicalValue(core.entries) !== canonicalValue(stableEntries)
                    || canonicalValue(core.per_site_domains) !== canonicalValue(siteDomains)
                    || canonicalValue(domainSeal.per_site_domains) !== canonicalValue(siteDomains)
                    || canonicalValue(core.conditional_partition) !== canonicalValue(stablePartition)
                    || canonicalValue(decodedReference) !== canonicalValue(reference)
                    || canonicalValue(core.method_authority) !== canonicalValue(reference.method_authority)
                    || canonicalValue(core.native_control_plans.unknown) !== canonicalValue(controls.unknown_path_control_plan)
                    || canonicalValue(core.native_control_plans.selection) !== canonicalValue(controls.selection_control_plan)
                    || core.compiler.artifact_root !== premise.compiler_artifact_root
                    || core.target_id !== partition.target_id || core.target.fact_key !== ticket.target_fact_key
                    || core.scope !== 'finite_target_normal_admission_and_independent_witness_not_equivalence'
                    || core.qualified !== false || core.semantic_mutation_credit !== 0 || core.dp_execution !== false
                    || core.financial_acceptance !== false
                    || domainSeal.stage !== 'path_v3_external_review_bound_domain_seal_before_compile'
                    || domainSeal.snapshot_sha256 !== packet.expectedReviewHash
                    || domainSeal.candidate_id !== ticket.candidate_id || domainSeal.invocation_id !== ticket.invocation_id
                    || domainSeal.target_id !== partition.target_id || domainSeal.domain_sha256 !== partition.domain_sha256
                    || domainSeal.entries_sha256 !== ticket.preselection_commitments.entries_sha256
                    || domainSeal.entries_sha256 !== `sha256:${digest(domainSeal.entries)}`
                    || domainSeal.conditional_partition_sha256 !== `sha256:${digest(partition)}`
                    || ['admitted_domain_complete', 'witness_domain_complete', 'first_witness_proved',
                        'sealed_before_any_captured_compile'].some(name => domainSeal[name] !== true)
                    || domainSeal.constructor_authenticates_review !== false || domainSeal.qualified !== false
                    || domainSeal.semantic_mutation_credit !== 0 || domainSeal.dp_execution !== false
                    || premise.external_rule_review_scope_byte_binding_verified !== true
                    || ['admitted_domain_complete', 'witness_domain_complete', 'first_witness_proved',
                        'normal_admission_verified'].some(name => prerequisites[name] !== true)
                    || !partition.conditional_admission_partition_complete || !partition.conditional_witness_partition_complete
                    || partition.entries.some(member => !['necessary_exclusion_pending_native_barrier',
                        'conditional_witness', 'conditional_non_witness'].includes(member.classification))
                    || !first || first.entry_index !== selected.entry_index
                    || selected.candidate_id !== ticket.candidate_id || selected.invocation_id !== ticket.invocation_id
                    || domainSeal.entries[selected.entry_index].candidate_id !== ticket.candidate_id
                    || domainSeal.entries[selected.entry_index].invocation_id !== ticket.invocation_id
                    || canonicalValue(domainSeal.entries[selected.entry_index].reference) !== canonicalValue(ticket.reference))
                    fail('normal_admission_basis_relation');
            }
            const controlCandidates = new Set([ticket.candidate_id]), controlInvocations = new Set([ticket.invocation_id]);
            const groups = [
                { mode: 'unknown_path', plan: controls.unknown_path_control_plan,
                    sha256: controls.unknown_path_control_plan_sha256, observations: controls.unknown_path_controls },
                { mode: 'necessary_selection_exclusion', plan: controls.selection_control_plan,
                    sha256: controls.selection_control_plan_sha256, observations: controls.selection_controls }
            ];
            // One finite relational check for both normal control families.
            // Transport hashes and duplicated true flags are not discharge.
            // The declarations were sealed before C/M/S; no observed rejection
            // may supply a new roster, coordinate, mode or execution identity.
            for (const group of groups) {
                if (`sha256:${digest(group.plan)}` !== group.sha256
                    || group.plan.domain_sha256 !== partition.domain_sha256
                    || group.plan.target_id !== partition.target_id
                    || canonicalValue(group.plan.method_authority) !== canonicalValue(reference.method_authority)
                    || !Array.isArray(group.plan.controls) || !Array.isArray(group.observations)
                    || group.plan.controls.length !== group.observations.length
                    || (group.mode === 'unknown_path' && group.plan.controls.length !== composition.sites.length))
                    fail('normal_admission_basis_relation');
                group.observations.forEach((control, index) => {
                    const declared = group.plan.controls[index];
                    const siteIndex = group.mode === 'unknown_path' ? index : declared.site_index;
                    if (control.mode !== group.mode || control.control_index !== index || control.site_index !== siteIndex
                        || !Number.isSafeInteger(siteIndex) || siteIndex < 0
                        || composition.sites[siteIndex]?.site_index !== siteIndex
                        || declared.expected_diagnostic.fact_key !== ticket.target_fact_key
                        || control.native_control_matched !== true || control.handle_attempts !== 0
                        || !identifier(control.candidate_id) || !identifier(control.invocation_id)
                        || controlCandidates.has(control.candidate_id) || controlInvocations.has(control.invocation_id)
                        || control.qualified !== false || control.semantic_mutation_credit !== 0 || control.dp_execution !== false
                        || control.worlds[1].variant !== 'M' || control.worlds[1].admitted !== false
                        || control.worlds[1].diagnostic.forged_same_text_has_authority !== false
                        || canonicalValue(control.worlds[1].diagnostic.native_coordinate)
                            !== canonicalValue(declared.expected_diagnostic)) fail('normal_admission_basis_relation');
                    controlCandidates.add(control.candidate_id); controlInvocations.add(control.invocation_id);
                });
            }
            if (partition.domain_sha256 !== ticket.preselection_commitments.domain_sha256
                || composition.domain_sha256 !== partition.domain_sha256
                || canonicalValue(partition.method_authority) !== canonicalValue(reference.method_authority)
                || canonicalValue(composition.method_authority) !== canonicalValue(reference.method_authority)
                || partition.normal_rule_composition_sha256 !== `sha256:${digest(composition)}`
                || reference.normal_rule_composition_sha256 !== partition.normal_rule_composition_sha256
                || premise.normal_rule_composition_sha256 !== partition.normal_rule_composition_sha256
                || premise.conditional_partition_sha256 !== `sha256:${digest(partition)}`
                || premise.normal_admission_checker_reference_sha256 !== `sha256:${digest(reference)}`
                || canonicalValue(controls.normal_admission_premise_evidence) !== canonicalValue(premise)
                || controls.native_barriers_verified !== true || controls.normal_checker_source_conformance_verified !== true
                || controls.selected_normal_compile_started_after_controls !== true
                || controls.compiler_result_used_to_define_domain !== false
                || premise.native_controls_sha256 !== `sha256:${digest({ unknownControls: controls.unknown_path_controls,
                    selectionControls: controls.selection_controls })}`
                || ['normal_baseline_admission_verified', 'normal_checker_binding_verified',
                    'site_admission_controls_verified', 'normal_positive_restoration_verified',
                    'sealed_before_selected_normal_compile'].some(name => premise[name] !== true)
                || controls.unknown_path_controls.length === 0 || allControls.some(control =>
                    control.compiler_artifact_root !== premise.compiler_artifact_root
                    || control.worlds.length !== 3 || control.worlds.map(world => world.variant).join(',') !== 'C,M,S'
                    || [0, 2].some(index => control.worlds[index].admitted !== true
                        || control.worlds[index].whole_ir_conformance !== true
                        || control.worlds[index].package_root !== premise.positive_package_roots[control.worlds[index].variant])
                    || control.worlds[0].ir_sha256 !== control.worlds[2].ir_sha256)
                || !Array.isArray(normalBasis.normal_worlds) || normalBasis.normal_worlds.length !== 3
                || normalBasis.normal_worlds.some((world, index) => world.variant !== ticket.worlds[index].variant
                    || world.package_root !== ticket.worlds[index].package_root)
                || premise.positive_package_roots.C !== ticket.worlds[0].package_root
                || premise.positive_package_roots.S !== ticket.worlds[2].package_root)
                fail('normal_admission_basis_relation');
        } catch { fail('normal_admission_basis_relation'); }
    }
    const boot = own(bootstrap, ['freezeBytes', 'expectedFreezeHash', 'tcbArtifact']);
    // Pure byte admission before runtime/child handles. Runtime is remeasured
    // only inside run, after all prerequisite and artifact bindings pass.
    const freezeReceipt = admitExecutionFreeze({ bytes: boot.freezeBytes, expectedHash: boot.expectedFreezeHash });
    const tcbArtifactReceipt = admitFrozenArtifact({ freezeReceipt, kind: 'tcb', programId: null,
        ...own(boot.tcbArtifact, ['manifestBytes', 'entries']) });
    const tcb = artifactContents(tcbArtifactReceipt), freeze = freezeContents(freezeReceipt);
    if (tcb.entry !== 'launcher-bootstrap.js' || tcb.files.map(row => row.path).join(',')
        !== 'child-bootstrap.js,host-bootstrap.js,launcher-bootstrap.js,recipe.json') fail('tcb_inventory');
    const frozenTicket = freezeDeep(ticket);
    let used = false;
    const host = Object.freeze({ stage: 'captured_path_qualification_prepared_only',
        candidate_id: ticket.candidate_id, invocation_id: ticket.invocation_id,
        ticket_commitment: data.expectedTicketCommitment, reference_commitment: ticket.reference_commitment,
        execution_permitted: false, qualified: false, semantic_mutation_credit: 0, financial_acceptance: false,
        async run() {
            if (this !== host || arguments.length) fail('origin');
            if (used) fail('replay'); used = true;
            if (Object.values(prerequisites).some(value => value !== true)) fail('prerequisites');
            if (!Array.isArray(payload.worlds) || payload.worlds.length !== 3) fail('payload_worlds');
            // Validate the entire closed transport before converting any caller
            // JSON value to bytes. Buffer.from also accepts array-like objects;
            // those are not UTF8 sources in this provisioning contract.
            const rows = payload.worlds.map((value, index) => {
                const row = own(value, ['variant', 'package_root', 'proof_program_id', 'evaluator_ref', 'registry_source',
                    'contract_source', 'metric_artifact', 'proof_artifact', 'derivation', 'proof', 'timeout_ms']);
                const expected = frozenTicket.worlds[index];
                if (row.variant !== expected.variant || row.package_root !== expected.package_root
                    || typeof row.proof_program_id !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(row.proof_program_id)
                    || !Number.isSafeInteger(row.timeout_ms) || row.timeout_ms < 100 || row.timeout_ms > 5000) fail('payload_binding');
                // Preserve the NORMAL registry ABI: an exact id/version ref,
                // not a string or an evaluator selected by this initializer.
                let evaluatorRef;
                try { evaluatorRef = own(row.evaluator_ref, ['evaluator_id', 'evaluator_version']); }
                catch { fail('evaluator_ref'); }
                if (!identifier(evaluatorRef.evaluator_id) || !Number.isSafeInteger(evaluatorRef.evaluator_version)
                    || evaluatorRef.evaluator_version < 1) fail('evaluator_ref');
                if (typeof row.registry_source !== 'string' || typeof row.contract_source !== 'string') fail('source_type');
                for (const input of [row.metric_artifact, row.proof_artifact]) {
                    const packet = own(input, ['manifest', 'entries']);
                    if (typeof packet.manifest !== 'string') fail('source_type');
                    if (!Array.isArray(packet.entries) || packet.entries.length > 128) fail('artifact_entries');
                    for (const item of packet.entries) {
                        const file = own(item, ['path', 'source']);
                        if (typeof file.path !== 'string' || typeof file.source !== 'string') fail('artifact_source');
                    }
                }
                return row;
            });
            // A null synthetic basis permits blocked constructor tests only.
            // Even forged positive prerequisite flags cannot execute it.
            if (emptyBasis) fail('normal_admission_basis_relation');
            const childSource = tcb.files[0].source;
            const childManifest = canonicalValue({ format: 'financasbot.provenance.artifact', version: 1, kind: 'tcb',
                entry: 'bootstrap.js', files: [{ path: 'bootstrap.js', media_type: 'text/javascript',
                    sha256: tcb.files[0].observed_sha256 }] });
            const childCapsuleReceipt = admitFrozenArtifact({ freezeReceipt, kind: 'child', programId: null,
                manifestBytes: Buffer.from(childManifest), entries: [{ path: 'bootstrap.js', bytes: Buffer.from(childSource) }] });
            const configs = rows.map((row, index) => {
                const expected = frozenTicket.worlds[index];
                const registryReceipt = admitExecutionRegistry({ bytes: Buffer.from(row.registry_source),
                    expectedHash: freeze.metric_registry_hash });
                const entry = resolveExecutionEvaluator(registryReceipt, row.evaluator_ref);
                const evaluatorContractReceipt = admitExecutionContract({ registryReceipt, evaluatorRef: row.evaluator_ref,
                    bytes: Buffer.from(row.contract_source) });
                const artifact = (input, kind, programId, root) => {
                    const packet = own(input, ['manifest', 'entries']);
                    if (!Array.isArray(packet.entries) || packet.entries.length > 128) fail('artifact_entries');
                    const bytes = { manifestBytes: Buffer.from(packet.manifest), entries: packet.entries.map(item => {
                            const file = own(item, ['path', 'source']);
                            if (typeof file.path !== 'string' || typeof file.source !== 'string') fail('artifact_source');
                            return { path: file.path, bytes: Buffer.from(file.source, 'utf8') };
                        }) };
                    const admitted = kind === 'metric' ? admitArtifact({ ...bytes, expectedRoot: root })
                        : admitFrozenArtifact({ freezeReceipt, kind, programId, ...bytes });
                    if (artifactContents(admitted).kind !== kind) fail('artifact_kind');
                    if (root && admitted.observed_root !== root) fail('artifact_root'); return admitted;
                };
                const metricReceipt = artifact(row.metric_artifact, 'metric', null, entry.evaluator_artifact_root);
                const proofReceipt = artifact(row.proof_artifact, 'proof', row.proof_program_id, null);
                const derivation = JSON.parse(JSON.stringify(copyData(row.derivation)));
                const proof = JSON.parse(JSON.stringify(copyData(row.proof)));
                if (Object.hasOwn(derivation, 'artifactReceipt') || Object.hasOwn(proof, 'artifactReceipt')) fail('caller_receipt');
                return { executionId: expected.execution_id, invocationId: frozenTicket.invocation_id, timeoutMs: row.timeout_ms,
                    childCapsuleReceipt, tcbArtifactReceipt, evaluatorContractReceipt,
                    derivation: { ...derivation, artifactReceipt: metricReceipt }, proof: { ...proof, artifactReceipt: proofReceipt } };
            });
            const nativeRuntimeReceipt = verifyNativeRuntime(freezeReceipt);
            const observations = [];
            for (let i = 0; i < configs.length; i++) observations.push({ variant: frozenTicket.worlds[i].variant,
                execution_id: configs[i].executionId, result: await runAdmittedGraph({ ...configs[i], nativeRuntimeReceipt }) });
            // Observations are NOT oracle/coverage comparison or acceptance.
            return freezeDeep({ stage: 'captured_path_normal_observations_not_qualification', candidate_id: frozenTicket.candidate_id,
                invocation_id: frozenTicket.invocation_id, reference_commitment: frozenTicket.reference_commitment,
                observations, qualified: false, semantic_mutation_credit: 0, financial_acceptance: false });
        } });
    return host;
}

function capturedValidationTools() {
    return Object.freeze({ stage: 'captured_validation_tools_only', graph_accepted: false,
        financial_acceptance: false, admitPackage, admitArtifact, admitPhaseCompositionProfile, phaseCompositionCommitment,
        admitExecutionRegistry, admitExecutionContract, admitExecutionFreeze, admitFrozenArtifact, verifyNativeRuntime,
        runAdmittedGraph, runClaimMonthQualifiedGraph, comparePhaseCoverage, sealClaimMonthTargetTrace, compareClaimMonthTargetTrace,
        sealClaimMonthCoreTrace, compareClaimMonthCoreTrace,
        prepareClaimMonthQualification: (receipt, target) => prepareClaimMonthQualification(receipt, validators, target),
        compileClaimMonthQualificationIR: (receipt, preparation, variant) => compileClaimMonthQualificationIR(receipt, validators, preparation, variant),
        compileClaimMonthQualificationAccess, prepareClaimMonthIsolatedPlan, assertClaimMonthIsolatedProgram,
        sealClaimMonthIsolatedLowering, admitClaimMonthIsolatedProof, admitClaimMonthFrozenBaseline,
        initializeFinancialHost: (data, bootstrap) => createPrivateFinancialHost(data, bootstrap, validators),
        initializePathQualification,
        compileSnapshotAccess: receipt => compileSnapshotAccess(receipt, validators),
        compileAuthoringIR: receipt => compileAuthoringIR(receipt, validators),
        // Trusted DEVELOPMENT diagnostic bridge. Foreign/forged errors cannot
        // acquire the private checker origin; this is not guest authority.
        readNativePathDiagnostic: error => readGraphStructureDiagnostic(error)
            ?? readTemplateReferenceDiagnostic(error) ?? readPredicateTypeDiagnostic(error)
            ?? readSelectionBindingDiagnostic(error),
        nativeProfile: EXECUTION_PROFILE });
}
module.exports = { capturedValidationTools };
```
