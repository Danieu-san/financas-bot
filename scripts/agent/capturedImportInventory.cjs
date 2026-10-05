'use strict';
// Accounting only: a generated module is not an ambient import, and this
// certificate grants neither reviewed-source admission nor financial credit.
const { createHash } = require('node:crypto');
const path = require('node:path');
const certificates = new WeakSet();
const sha256 = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw new Error('captured_import_inventory_' + code); };

async function captureImportCertificate() {
    const { buildCapturedValidationTools } = await import('./buildNextValidationTcb.mjs');
    const built = buildCapturedValidationTools();
    if (built.validation_tcb_complete !== false || built.financial_acceptance !== false ||
        sha256(built.manifest) !== built.artifact_root) fail('root');
    const files = new Map(built.hostSourceHashes.map(row => [row.path, row.sha256]));
    if (files.size !== built.hostSourceHashes.length) fail('duplicate');
    const bindings = [];
    for (const row of built.hostImportBindings) {
        if (!row.specifier.startsWith('.')) continue;
        if (!files.has(row.source) || !files.has(row.target)) fail('binding');
        const normalized = path.posix.normalize(path.posix.join(path.posix.dirname(row.source), row.specifier));
        const candidates = [normalized, normalized + '.js', normalized + '/index.js'].filter(file => files.has(file));
        if (candidates.length !== 1 || candidates[0] !== row.target) fail('binding');
        bindings.push(Object.freeze({ source: row.source, specifier: row.specifier, target: row.target,
            source_sha256: files.get(row.source), target_sha256: files.get(row.target) }));
    }
    const certificate = Object.freeze({ artifact_root: built.artifact_root,
        bindings: Object.freeze(bindings), financial_acceptance: false, reviewed_source_admission: false });
    certificates.add(certificate);
    return certificate;
}

function accountCapturedImports({ unresolved, certificate, readSource, ambientReachable }) {
    if (!certificates.has(certificate) || typeof readSource !== 'function' || typeof ambientReachable !== 'function') fail('certificate');
    const captured = [], remaining = [];
    for (const edge of unresolved) {
        const logical = edge.from.startsWith('src/next/') ? edge.from.slice('src/next/'.length) : null;
        const matches = certificate.bindings.filter(row => row.source === logical && row.specifier === edge.specifier);
        if (matches.length !== 1 || ambientReachable(edge.from)) { remaining.push(edge); continue; }
        const binding = matches[0];
        if (sha256(readSource(edge.from)) !== binding.source_sha256) { remaining.push(edge); continue; }
        captured.push({ ...edge, target: binding.target, source_sha256: binding.source_sha256,
            target_sha256: binding.target_sha256, artifact_root: certificate.artifact_root,
            resolution: 'closed-byte-table-only', ambient_module_available: false,
            financial_acceptance: false, reviewed_source_admission: false });
    }
    return { captured, remaining };
}
module.exports = { captureImportCertificate, accountCapturedImports };
