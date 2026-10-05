'use strict';
const { runInThisContext } = require('node:vm');
const { types } = require('node:util');
const { canonicalValue } = require('../kernel/canonicalValue');
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
    const { freezeBytes, expectedFreezeHash, tcbArtifact } = own(raw, ['freezeBytes', 'expectedFreezeHash', 'tcbArtifact']);
    const freezeReceipt = admitExecutionFreeze({ bytes: freezeBytes, expectedHash: expectedFreezeHash });
    verifyNativeRuntime(freezeReceipt);
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
    // Reconstruct only the exact canonical manifest already admitted; never
    // derive an expected root from it. Fresh Buffers cross opaque receipt tables
    // between the captured launcher and separately captured host closures.
    const capturedArtifact = packageArtifact(contents);
    const capturedFreeze = Buffer.from(canonicalValue(JSON.parse(JSON.stringify(freezeContents(freezeReceipt)))));
    let used = false;
    return Object.freeze({ stage: 'captured_tcb_loaded_only', financial_acceptance: false,
        initialize(data) {
            if (used) fail('already_initialized'); used = true;
            return tools.initializeFinancialHost(data, { freezeBytes: Buffer.from(capturedFreeze), expectedFreezeHash,
                tcbArtifact: { manifestBytes: Buffer.from(capturedArtifact.manifestBytes),
                    entries: capturedArtifact.entries.map(row => ({ path: row.path, bytes: Buffer.from(row.bytes) })) } });
        } });
}
module.exports = { launchCapturedTcb };
