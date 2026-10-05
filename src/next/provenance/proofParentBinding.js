'use strict';
const { copyData } = require('./observationContract');
const { digest } = require('../kernel/canonicalValue');
const { createMaterialFingerprint } = require('./materialFingerprintCore');
const measure = createMaterialFingerprint(copyData, digest);

// TCB-only: expectations come from the private same-execution transport
// receipt and admitted registry, never from the guest or the observed trace.
// Traversal and every material read still run through instrumented handles.
function bindObservedParents(raw, edge) {
    const rows = copyData(raw); const seen = new Set();
    const invalid = () => { throw new Error('proof_parent_binding'); };
    if (!Array.isArray(rows) || rows.length > 16 || typeof edge !== 'function') invalid();
    for (const row of rows) {
        if (!row || Object.keys(row).sort().join(',') !== 'descriptor,edge_id,expected_fingerprint'
            || typeof row.edge_id !== 'string' || seen.has(row.edge_id)
            || typeof row.expected_fingerprint !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(row.expected_fingerprint)
            || row.descriptor?.kind !== 'derived_claim') invalid();
        seen.add(row.edge_id);
        if (measure(edge(row.edge_id), row.descriptor) !== row.expected_fingerprint) invalid();
    }
}
module.exports = { bindObservedParents };
