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
