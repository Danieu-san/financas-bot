'use strict';
const { copyData, identifier, decodeObservation, decodeMeasurement } = require('./observationContract');

// Trusted host interface. No method of this controller is endowed to guest.
// I/M tuples are decoded into L here; expectations and functional R have no API.
function createCausalRecorder(options) {
    const config = copyData(options);
    if (!['executionId,maxEvents', 'executionId,maxBytes,maxEvents'].includes(Object.keys(config).sort().join(',')) || !identifier(config.executionId)
        || !Number.isSafeInteger(config.maxEvents) || config.maxEvents < 1 || config.maxEvents > 1000000) {
        throw new Error('recorder_config_invalid');
    }
    const maxBytes = config.maxBytes === undefined ? 8 * 1024 * 1024 : config.maxBytes;
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 128 * 1024 * 1024) throw new Error('recorder_config_invalid');
    const log = []; const scopes = new Set();
    let active; let failed = false; let finished = false; let totalBytes = 0;
    function fail(code) { failed = true; throw new Error(`recorder_${code}`); }
    function healthy() { if (failed) fail('failed'); if (finished) fail('finished'); }
    function open(input) {
        healthy();
        if (active) fail('active');
        let scope;
        try { scope = copyData(input); } catch { fail('scope_invalid'); }
        if (Object.keys(scope).sort().join(',') !== 'invocationId,phase' || !identifier(scope.invocationId)
            || !['derivation', 'proof'].includes(scope.phase)) fail('scope_invalid');
        const key = JSON.stringify([scope.invocationId, scope.phase]);
        if (scopes.has(key)) fail('scope_repeated');
        scopes.add(key); const token = {}; active = token;
        function write(raw, decode) {
            healthy(); if (active !== token) fail('scope_closed');
            if (log.length >= config.maxEvents) fail('limit');
            let tuple;
            try { tuple = decode(raw); } catch { fail('event_invalid'); }
            const value = tuple[0] === 'I' ? { operation: tuple[1], alias: tuple[2], role: tuple[3],
                path: tuple[4], projection: tuple[5], outcome: tuple[6] }
                : { measurement: tuple[1], observed: tuple[2] };
            const entry = Object.freeze({ sequence: log.length, invocation_id: scope.invocationId,
                phase: scope.phase, ...value });
            const bytes = Buffer.byteLength(JSON.stringify(entry), 'utf8');
            if (totalBytes + bytes > maxBytes) fail('byte_limit');
            totalBytes += bytes; log.push(entry);
        }
        return Object.freeze({ observe: raw => write(raw, decodeObservation),
            measure: raw => write(raw, decodeMeasurement),
            seal: () => { healthy(); if (active !== token) fail('scope_closed'); active = undefined; } });
    }
    function finish() {
        healthy(); if (active) fail('active'); finished = true;
        return Object.freeze({ stage: 'observations_only', execution_id: config.executionId,
            derivation_trace: Object.freeze(log.filter(e => e.phase === 'derivation')),
            proof_trace: Object.freeze(log.filter(e => e.phase === 'proof')) });
    }
    return Object.freeze({ open, finish });
}

module.exports = { createCausalRecorder };
