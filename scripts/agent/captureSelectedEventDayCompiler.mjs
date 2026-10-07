import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonicalValue, freezeDeep } from '../../src/next/kernel/canonicalValue.js';
import { admittedDocuments, admittedPackageEntries } from '../../src/next/provenance/packageContract.js';
import { admitArtifact, artifactContents } from '../../src/next/provenance/artifactLoader.js';
import { selectedEventDayProgramFamily, resolveSelectedEventDayCompilationInput,
    compareSelectedEventDayIr } from '../../src/next/provenance/selectedEventDayProfile.js';
import { buildCapturedValidationTools } from './buildNextValidationTcb.mjs';
const require = createRequire(import.meta.url), captures = new WeakMap();
const hash = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const fail = code => { throw new Error('selected_day_compiler_' + code); };
function fields(raw, names) {
    if (!raw || types.isProxy(raw) || Array.isArray(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== names.length || names.some(k => !d[k]?.enumerable || !Object.hasOwn(d[k], 'value'))) fail('input');
    return Object.fromEntries(names.map(k => [k, d[k].value]));
}
// Reuse the existing NORMAL captured compiler unchanged. Its broad native tool
// table remains private: no financial/monthly API, handle or validator escapes.
// All author-derived expectations and all package/schema bytes are checked
// before the first compile. This is byte binding, not independent execution or
// a reviewed complete qualification ticket.
export function captureSelectedEventDayCompiler(raw) {
    const { expectations } = fields(raw, ['expectations']);
    const family = selectedEventDayProgramFamily(expectations);
    const built = buildCapturedValidationTools();
    const recipe = built.entries.find(row => row.path === 'recipe.json').source;
    const schemas = JSON.parse(recipe).schema_sources;
    const worlds = new Map();
    for (const variant of ['C', 'M', 'S']) {
        const expectation = expectations[variant];
        const input = resolveSelectedEventDayCompilationInput(expectation);
        const documents = admittedDocuments(input.packageReceipt);
        if (schemas.some(schema => documents.find(row => row.path === schema.path)?.sha256 !== schema.sha256)) fail('schema_identity');
        const authority = documents.map(({ path, sha256 }) => ({ path, sha256 }));
        const entries = admittedPackageEntries(input.packageReceipt);
        if (entries.length !== authority.length || entries.some(row => hash(row.bytes) !== authority.find(a => a.path === row.path)?.sha256)) fail('package_identity');
        worlds.set(expectation, { variant, entries, authority, used: false });
    }
    const allowed = ['node:crypto', 'node:util', 'node:process', 'node:path', 'node:fs', 'node:child_process'];
    if (built.nativeExternals.some(name => !allowed.includes(name))) fail('native_import');
    const deny = () => fail('handle_forbidden');
    const source = '(function(require){const tools=' + built.source
        + ';return Object.freeze({admitPackage:tools.admitPackage,compileAuthoringIR:tools.compileAuthoringIR,'
        + 'compileSnapshotAccess:tools.compileSnapshotAccess});})';
    const entry = 'selected-day-compiler.js';
    const entries = [{ path: entry, source },
        { path: 'selected-day-compiler-recipe.json', source: recipe }]
        .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    const manifest = canonicalValue({ format: 'financasbot.provenance.artifact', version: 1, kind: 'tcb',
        entry, files: entries.map(row => ({ path: row.path,
            media_type: row.path.endsWith('.json') ? 'application/json' : 'text/javascript', sha256: hash(row.source) })) });
    // Compose the existing strict artifact primitive BEFORE evaluating code.
    // Identity is a named executable entry, independent of inventory ordering.
    const artifact = admitArtifact({ manifestBytes: Buffer.from(manifest), expectedRoot: hash(manifest),
        entries: entries.map(row => ({ path: row.path, bytes: Buffer.from(row.source) })) });
    const contents = artifactContents(artifact);
    const tools = runInThisContext(contents.files.find(row => row.path === contents.entry).source)(name => {
        if (!built.nativeExternals.includes(name)) fail('native_import');
        if (name === 'node:fs') return Object.freeze({ readFileSync: deny });
        if (name === 'node:child_process') return Object.freeze({ fork: deny, spawn: deny });
        return Object.freeze({ 'node:crypto': require('node:crypto'), 'node:util': require('node:util'),
            'node:process': require('node:process'), 'node:path': require('node:path') })[name];
    });
    const receipt = freezeDeep({ stage: 'selected_day_captured_normal_compiler_only', observed_root: artifact.observed_root,
        precommit_hash: family.C.precommit_hash, financial_acceptance: false });
    captures.set(receipt, { tools, worlds, entries, manifest, sourceHashes: built.hostSourceHashes,
        imports: built.hostImportBindings, schemas, completed: [] });
    return receipt;
}
export function compileSelectedEventDayCapturedWorld(raw) {
    const { capture, expectation } = fields(raw, ['capture', 'expectation']);
    const stored = captures.get(capture); if (!stored) fail('authority');
    if (stored.failed) fail('poisoned');
    const world = stored.worlds.get(expectation); if (!world || world.used) fail('world');
    world.used = true;
    try {
        const receipt = stored.tools.admitPackage({ entries: world.entries, authority: world.authority });
        const ir = stored.tools.compileAuthoringIR(receipt);
        compareSelectedEventDayIr({ expectation, ir });
        const access = stored.tools.compileSnapshotAccess(receipt);
        stored.completed.push(freezeDeep({ variant: world.variant, package_root: hash(canonicalValue(world.authority)),
            ir_sha256: hash(canonicalValue(structuredClone(ir))), compiler_artifact_root: capture.observed_root }));
        return Object.freeze({ ir, access });
    } catch (error) { stored.failed = true; throw error; }
}
export function selectedEventDayCompilerBinding(capture) {
    const stored = captures.get(capture); if (!stored) fail('authority');
    if (stored.failed) fail('poisoned');
    if (stored.completed.map(row => row.variant).join(',') !== 'C,M,S') fail('incomplete');
    return freezeDeep({ compiler_artifact_root: capture.observed_root, compiler_manifest: stored.manifest,
        entries: stored.entries.map(row => ({ ...row })), source_hashes: stored.sourceHashes.map(row => ({ ...row })),
        imports: stored.imports.map(row => ({ ...row })), schemas: stored.schemas.map(row => ({ ...row })),
        worlds: stored.completed.map(row => ({ ...row })), precommit_hash: capture.precommit_hash,
        normal_compile_worlds: 3, independent_compiler_execution: false, executable_ticket_complete: false });
}
