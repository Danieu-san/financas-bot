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
    const { captureSelectedEventDayCandidateImports } = await import('./executeSelectedEventDayCandidate.mjs');
    const selected = await captureSelectedEventDayCandidateImports();
    const bundles = [{ manifest: built.manifest, artifact_root: built.artifact_root,
        sourceHashes: built.hostSourceHashes, importBindings: built.hostImportBindings,
        financial_acceptance: false, reviewed_source_admission: false }, ...selected];
    const bindings = [];
    for (const bundle of bundles) {
      if (bundle.financial_acceptance !== false || bundle.reviewed_source_admission !== false ||
          sha256(bundle.manifest) !== bundle.artifact_root) fail('root');
      const manifest = JSON.parse(bundle.manifest);
      if (bundle.source !== undefined && (manifest.files.length !== 1 ||
          manifest.files[0].sha256 !== sha256(bundle.source))) fail('source');
      const files = new Map(bundle.sourceHashes.map(row => [row.path, row.sha256]));
      if (files.size !== bundle.sourceHashes.length) fail('duplicate');
      for (const row of bundle.importBindings) {
        if (!row.specifier.startsWith('.')) continue;
        if (!files.has(row.source) || !files.has(row.target)) fail('binding');
        const normalized = path.posix.normalize(path.posix.join(path.posix.dirname(row.source), row.specifier));
        const candidates = [normalized, normalized + '.js', normalized + '/index.js'].filter(file => files.has(file));
        if (candidates.length !== 1 || candidates[0] !== row.target) fail('binding');
        bindings.push(Object.freeze({ source: row.source, specifier: row.specifier, target: row.target,
            source_sha256: files.get(row.source), target_sha256: files.get(row.target), artifact_root: bundle.artifact_root }));
      }
    }
    const certificate = Object.freeze({ artifact_roots: Object.freeze(bundles.map(bundle => bundle.artifact_root)),
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
            target_sha256: binding.target_sha256, artifact_root: binding.artifact_root,
            resolution: 'closed-byte-table-only', ambient_module_available: false,
            financial_acceptance: false, reviewed_source_admission: false });
    }
    return { captured, remaining };
}
module.exports = { captureImportCertificate, accountCapturedImports };
