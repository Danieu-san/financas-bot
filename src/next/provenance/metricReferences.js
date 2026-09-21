'use strict';

const { validateLiteral } = require('./literalTypes');
const fail = code => { throw new Error(`metric_reference_${code}`); };
const id = value => { validateLiteral({ type: 'id', value }); return value; };

function readNodeIdentity(node, kind) {
    if (node.identity('kind') !== kind) fail('kind');
    const ref = id(node.get('id'));
    const version = node.identity('version');
    validateLiteral({ type: 'digest', value: version });
    return Object.freeze({ ref, version });
}

// A financial candidate population is unique by material ID, not by handle
// alias or version. Fresh per invocation, including financially excluded rows.
function createUniqueNodeReader(kind) {
    const seen = new Set();
    return Object.freeze({
        read(node) {
            const identity = readNodeIdentity(node, kind);
            if (seen.has(identity.ref)) fail('duplicate');
            seen.add(identity.ref);
            return identity;
        },
        has: ref => seen.has(ref)
    });
}

// Internal evaluator composition. Admission resolves the allowed relation;
// these distinct observations bind its source scalar to the consumed target.
// Population membership and the expected version remain the caller's concern.
function resolveReference(source, field) {
    const reference = id(source.get(field));
    const node = source.follow(field);
    return { reference, node };
}

// The admitted relation already binds the scalar to a nominally typed target.
// Consumers of the reference alone must still resolve it, but do not consume
// the target's payload/identity. This is not admission for arbitrary handles.
function readReferenceId(source, field) {
    return resolveReference(source, field).reference;
}

function readReference(source, field, kind) {
    const { reference, node } = resolveReference(source, field);
    const { ref, version } = readNodeIdentity(node, kind);
    if (reference !== ref) fail('identity');
    return Object.freeze({ node, ref, version });
}

// A reference population has causal cardinality, order and link resolution,
// not just membership of the few IDs queried by financial candidates. Target
// kinds/reachability are admitted by the registry; don't add target payload
// reads when the population contract requires only the reference edges.
function readReferenceIds(source, field) {
    const values = source.get(field); const count = values.length();
    if (!Number.isSafeInteger(count) || count < 0 || Object.is(count, -0)) fail('cardinality');
    const members = new Set();
    for (const value of values) {
        const ref = id(value);
        if (members.has(ref)) fail('duplicate');
        source.followMember(field, ref);
        members.add(ref);
    }
    if (members.size !== count) fail('cardinality');
    return Object.freeze({ size: members.size, includes: ref => members.has(ref) });
}

module.exports = { readNodeIdentity, createUniqueNodeReader, readReference, readReferenceId, readReferenceIds };
