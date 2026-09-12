'use strict';

const { canonicalValue } = require('../kernel/canonicalValue');

const TYPES = Object.freeze(['id', 'text', 'date', 'month', 'datetime', 'integer',
    'positive_integer', 'nonnegative_integer', 'money_minor', 'boolean', 'enum',
    'digest', 'ref', 'ref_list', 'typed_period', 'typed_result', 'role_ref_list']);
const CLASSES = Object.freeze(['identity', 'dimension', 'edge', 'non_material']);
const ref = name => ({ $ref: `#/definitions/${name}` });
const fail = code => { throw new Error(`schema_registry_${code}`); };
function object(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('shape');
    return value;
}
function keys(value, required, optional = []) {
    object(value);
    if (required.some(key => !Object.hasOwn(value, key))
        || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) fail('keys');
}
function same(actual, expected, code) {
    let actualText;
    let expectedText;
    try { actualText = canonicalValue(actual); expectedText = canonicalValue(expected); }
    catch { fail(code); }
    if (actualText !== expectedText) fail(code);
}
function stringSet(value) {
    if (!Array.isArray(value) || !value.length || value.some(v => typeof v !== 'string' || !v.length)
        || new Set(value).size !== value.length) fail('set');
    return value;
}
function sameSet(actual, expected, code) {
    same([...stringSet(actual)].sort(), [...stringSet(expected)].sort(), code);
}
function closedRecord(properties) {
    return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}

// A projection of the finite, reviewed registry grammar, not a JSON Schema
// interpreter or semantic-equivalence solver. Unexpected schema forms fail;
// even an equivalent rewrite needs review before changing this format.
function validateSchemaRegistryProjection({ registry, snapshotSchema, claimSchema }) {
    keys(registry, ['registry_id', 'registry_version', 'stage', 'closed_world', 'semantics',
        'field_classes', 'types', 'envelope_fields', 'kinds']);
    if (registry.registry_id !== 'material_field_registry' || registry.registry_version !== 1
        || registry.stage !== 'authoring' || registry.closed_world !== true
        || registry.semantics !== 'registry-semantics-v1.md') fail('version');
    sameSet(registry.types, TYPES, 'types');
    sameSet(registry.field_classes, CLASSES, 'classes');
    const envelope = { ref_id: { class: 'identity', type: 'id', required: true },
        kind: { class: 'identity', type: 'id', required: true },
        version: { class: 'identity', type: 'digest', required: true } };
    same(registry.envelope_fields, envelope, 'envelope');
    const kinds = object(registry.kinds);
    stringSet(Object.keys(kinds));
    let fields = 0;
    for (const [kind, entry] of Object.entries(kinds)) {
        if (!/^[a-z][a-z0-9_]*$/.test(kind)) fail('kind');
        keys(entry, ['origin', 'fields']);
        if (typeof entry.origin !== 'string' || !entry.origin.length) fail('origin');
        object(entry.fields);
        stringSet(Object.keys(entry.fields));
        for (const [name, field] of Object.entries(entry.fields)) {
            if (!/^[a-z][a-z0-9_]*$/.test(name)) fail('field');
            keys(field, ['class', 'type', 'required'], ['values', 'targets', 'maximum', 'reason']);
            if (!CLASSES.includes(field.class) || !TYPES.includes(field.type)
                || typeof field.required !== 'boolean') fail('descriptor');
            if (field.class === 'edge') {
                if (!['ref', 'ref_list', 'role_ref_list'].includes(field.type)
                    || stringSet(field.targets).some(target => !Object.hasOwn(kinds, target))) fail('targets');
            } else if (Object.hasOwn(field, 'targets') || ['ref', 'ref_list', 'role_ref_list'].includes(field.type)) fail('targets');
            if (field.type === 'enum') stringSet(field.values);
            else if (Object.hasOwn(field, 'values')) fail('enum');
            if (Object.hasOwn(field, 'maximum') && (field.type !== 'positive_integer'
                || !Number.isSafeInteger(field.maximum) || field.maximum < 1)) fail('maximum');
            if (field.class === 'non_material') {
                if (name !== 'label' || field.type !== 'text' || field.reason !== 'display_only') fail('non_material');
            } else if (Object.hasOwn(field, 'reason')) fail('reason');
            fields++;
        }
        same(entry.fields.id, envelope.ref_id, 'payload_identity');
    }

    keys(snapshotSchema, ['$schema', '$id', 'definitions', 'oneOf'], ['title', '$comment', 'description']);
    if (snapshotSchema.$schema !== 'http://json-schema.org/draft-07/schema#'
        || snapshotSchema.$id !== 'urn:financasbot:next:evidence-snapshot:2'
        || claimSchema?.$id !== 'urn:financasbot:next:claim-contract:2') fail('schema_identity');
    // These types have the claim schema as their existing shared authority.
    for (const name of ['id', 'date', 'month']) object(claimSchema.definitions?.[name]);
    object(claimSchema.definitions?.period);
    const definitions = {
        id: claimSchema.definitions.id,
        digest: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
        text: { type: 'string' },
        date: claimSchema.definitions.date,
        month: claimSchema.definitions.month,
        datetime: { type: 'string', format: 'date-time',
            pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$' },
        integer: { type: 'integer', minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER },
        positive_integer: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
        nonnegative_integer: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        money_minor: { type: 'integer', minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER },
        boolean: { type: 'boolean' },
        ref: ref('id'),
        ref_list: { type: 'array', uniqueItems: true, items: ref('ref') },
        typed_period: { $ref: `${claimSchema.$id}#/definitions/period` },
        typed_result: { oneOf: [
            ['BRL_minor', 'money_minor', ref('money_minor')],
            ['count', 'nonnegative_integer', ref('nonnegative_integer')],
            ['entity_ids', 'id', ref('ref')],
            ['entity_ids', 'id_set', ref('ref_list')],
            ['state', 'enum', { type: 'string', minLength: 1 }]
        ].map(([unit, kind, value]) => closedRecord({ unit: { const: unit }, kind: { const: kind }, value })) },
        role_ref_list: { type: 'array', uniqueItems: true, items: closedRecord({
            role_id: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,63}$' }, parent_ref: ref('ref') }) }
    };
    const branches = new Map();
    if (!Array.isArray(snapshotSchema.oneOf)) fail('branches');
    for (const branch of snapshotSchema.oneOf) {
        const kind = branch?.properties?.kind?.const;
        if (!Object.hasOwn(kinds, kind) || branches.has(kind)) fail('branches');
        branches.set(kind, branch);
    }
    sameSet([...branches.keys()], Object.keys(kinds), 'kinds');
    for (const [kind, entry] of Object.entries(kinds)) {
        const payload = closedRecord({});
        payload.required = [];
        for (const [name, field] of Object.entries(entry.fields)) {
            if (field.required) payload.required.push(name);
            let property = field.type === 'enum' ? { enum: [...field.values] } : ref(field.type);
            if (Object.hasOwn(field, 'maximum')) property = { allOf: [property, { maximum: field.maximum }] };
            payload.properties[name] = property;
        }
        definitions[`payload_${kind}`] = payload;
        same(branches.get(kind), closedRecord({ ref_id: ref('id'), kind: { const: kind },
            version: ref('digest'), payload: ref(`payload_${kind}`) }), 'branch');
    }
    sameSet(Object.keys(object(snapshotSchema.definitions)), Object.keys(definitions), 'definitions');
    for (const [name, definition] of Object.entries(definitions)) {
        same(snapshotSchema.definitions[name], definition, `projection:${name}`);
    }
    return Object.freeze({ kinds: branches.size, fields, stage: 'schema_registry_checked_only' });
}

module.exports = { validateSchemaRegistryProjection };
