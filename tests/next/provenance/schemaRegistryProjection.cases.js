'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateSchemaRegistryProjection } = require('../../../src/next/provenance/schemaRegistryProjection');
const prefix = path.resolve(__dirname, '../../../docs/contracts/next/provenance-v2');
const read = name => JSON.parse(fs.readFileSync(path.join(prefix, name), 'utf8'));
const fixture = () => ({ registry: read('material-field-registry-v1.json'),
    snapshotSchema: read('evidence-snapshot.schema.json'), claimSchema: read('claim-contract.schema.json') });
const rejected = f => assert.throws(() => validateSchemaRegistryProjection(f), /schema_registry_/);

test('N02G:PROJECTION-001 all 23 kinds and 113 fields match the reviewed structural projection', () => {
    const f = fixture();
    const before = JSON.stringify(f);
    assert.deepEqual(validateSchemaRegistryProjection(f), { kinds: 23, fields: 113, stage: 'schema_registry_checked_only' });
    assert.equal(JSON.stringify(f), before);
});

test('N02G:PROJECTION-002 every payload field rejects omission, extension and required drift', () => {
    const base = fixture();
    for (const [kind, entry] of Object.entries(base.registry.kinds)) {
        for (const name of Object.keys(entry.fields)) {
            let f = structuredClone(base);
            delete f.snapshotSchema.definitions[`payload_${kind}`].properties[name];
            rejected(f);
            f = structuredClone(base);
            const payload = f.snapshotSchema.definitions[`payload_${kind}`];
            payload.required = payload.required.includes(name) ? payload.required.filter(k => k !== name) : [...payload.required, name];
            rejected(f);
        }
        const f = structuredClone(base);
        f.snapshotSchema.definitions[`payload_${kind}`].properties.unregistered = { type: 'string' };
        rejected(f);
    }
});

test('N02G:PROJECTION-003 type, enum and numeric constraints cannot drift independently', () => {
    const base = fixture();
    const changes = [
        f => { f.registry.kinds.card.fields.closing_day.maximum = 30; },
        f => { f.registry.kinds.account.fields.type.values.push('unknown'); },
        f => { f.snapshotSchema.definitions.payload_event.properties.amount_minor = { $ref: '#/definitions/integer' }; },
        f => { f.snapshotSchema.definitions.integer.maximum += 1; },
        f => { delete f.snapshotSchema.definitions.positive_integer.minimum; },
        f => { f.snapshotSchema.definitions.ref_list.uniqueItems = false; },
        f => { f.snapshotSchema.definitions.id.pattern = '^.*$'; },
        f => { f.snapshotSchema.definitions.datetime.pattern = '.*'; },
        f => { delete f.snapshotSchema.definitions.date.format; },
        f => { f.snapshotSchema.definitions.typed_period.$ref = '#/definitions/text'; },
        f => { f.snapshotSchema.definitions.typed_result.oneOf[0].properties.kind.const = 'integer'; },
        f => { f.snapshotSchema.definitions.role_ref_list.items.additionalProperties = true; }
    ];
    for (const change of changes) { const f = structuredClone(base); change(f); rejected(f); }
});

test('N02G:PROJECTION-004 envelopes, kind inventory and executable schema additions fail closed', () => {
    const base = fixture();
    const changes = [
        f => { f.snapshotSchema.oneOf.pop(); },
        f => { f.snapshotSchema.oneOf.push(structuredClone(f.snapshotSchema.oneOf[0])); },
        f => { f.snapshotSchema.oneOf[0].additionalProperties = true; },
        f => { f.snapshotSchema.oneOf[0].required.pop(); },
        f => { f.snapshotSchema.oneOf[0].properties.version = { type: 'string' }; },
        f => { f.snapshotSchema.definitions.unused = { type: 'string' }; },
        f => { f.snapshotSchema.anyOf = [true]; },
        f => { f.snapshotSchema.definitions.payload_family.additionalProperties = true; },
        f => { f.registry.envelope_fields.version.required = false; }
    ];
    for (const change of changes) { const f = structuredClone(base); change(f); rejected(f); }
});

test('N02G:PROJECTION-005 registry grammar rejects unknown authority, classifications and invalid targets', () => {
    const base = fixture();
    const changes = [
        f => { f.registry.code = 'ignored'; },
        f => { f.registry.kinds.person.fields.id.code = 'ignored'; },
        f => { f.registry.kinds.person.fields.family_id.targets = ['missing']; },
        f => { f.registry.kinds.person.fields.family_id.targets = ['family', 'family']; },
        f => { delete f.registry.kinds.person.fields.family_id.targets; },
        f => { f.registry.kinds.person.fields.id.targets = ['person']; },
        f => { f.registry.kinds.account.fields.type.values = []; },
        f => { f.registry.kinds.account.fields.type.values.push('checking'); },
        f => { f.registry.kinds.person.fields.label.reason = 'private_exception'; },
        f => { f.registry.kinds.event.fields.amount_minor.class = 'non_material'; },
        f => { f.registry.kinds.person.fields.id.required = 'true'; },
        f => { f.registry.kinds.card.fields.closing_day.maximum = 0; },
        f => { f.registry.kinds.person.fields.id.type = 'script'; },
        f => { f.registry.kinds.person.fields.id.optional = true; }
    ];
    for (const change of changes) { const f = structuredClone(base); change(f); rejected(f); }
});
