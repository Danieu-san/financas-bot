'use strict';
const { field } = require('./observationScalars');
const { readObservedIdentity, observedKeys, materialValue } = require('./proofObservedValues');

// Same fingerprint implementation for the native TCB wrapper and the pure
// measured proof closure. Both dependencies are lexical to their own closure,
// never callbacks endowed by the host to the guest.
function createMaterialFingerprint(copyData, digest) {
    const fail = () => { throw new Error('proof_material_invalid'); };
    return function measureMaterialFingerprint(handle, rawDescriptor, presenceMode = 'explicit_presence') {
        if (!['explicit_presence', 'enumerated_presence'].includes(presenceMode)) fail();
        const descriptor = copyData(rawDescriptor);
        if (!descriptor || Object.keys(descriptor).sort().join(',') !== 'fields,kind,registry_version'
            || !Number.isSafeInteger(descriptor.registry_version) || descriptor.registry_version < 1
            || !descriptor.fields || Array.isArray(descriptor.fields) || typeof descriptor.fields !== 'object') fail();
        const identity = readObservedIdentity(handle);
        if (identity.kind !== descriptor.kind) fail();
        const present = observedKeys(handle);
        for (const name of present) {
            if (!Object.hasOwn(descriptor.fields, name) || descriptor.fields[name].class === 'non_material') fail();
        }
        const pairs = [];
        for (const [name, spec] of Object.entries(descriptor.fields)) {
            if (!field(name) || !spec || !['identity', 'dimension', 'edge', 'non_material'].includes(spec.class)
                || typeof spec.required !== 'boolean') fail();
            if (spec.class === 'non_material') continue;
            // Snapshot proof observes the complete key enumeration; the
            // primary-parent transport retains explicit presence checks.
            // Neither profile depends on expected trace or changes the preimage.
            const exists = presenceMode === 'explicit_presence' ? handle.has(name) : present.includes(name);
            if (exists !== present.includes(name) || spec.required && !exists) fail();
            if (exists) pairs.push([name, materialValue(handle.get(name), spec)]);
        }
        const payload = Object.fromEntries(pairs);
        if (payload.id !== identity.ref_id) fail();
        return `sha256:${digest({ registry_version: descriptor.registry_version, ...identity, payload })}`;
    };
}
module.exports = { createMaterialFingerprint };
