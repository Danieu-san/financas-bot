'use strict';
const { validateLiteral } = require('./literalTypes');
const { field } = require('./observationScalars');
const fail = () => { throw new Error('proof_material_invalid'); };
// Same readers used by the TCB and by compiled proof code. Evidence enters
// exclusively through live observed handles, never through a backing object.
function readObservedIdentity(handle) {
    const kind = handle.identity('kind');
    const ref_id = handle.identity('ref_id');
    const version = handle.identity('version');
    validateLiteral({ type: 'kind', value: kind });
    validateLiteral({ type: 'id', value: ref_id });
    validateLiteral({ type: 'digest', value: version });
    return { kind, ref_id, version };
}
function observedKeys(handle) {
    const result = [];
    for (const key of handle.keys()) { if (!field(key) || result.includes(key)) fail(); result.push(key); }
    return result;
}
function sequence(handle, item) {
    const values = [];
    // Natural exhaustion observes both exact cardinality and order. Indexing
    // instead would introduce a different structural dependency into proof.
    for (const value of handle) {
        if (values.length >= 65536) fail();
        values.push(item(value));
    }
    return values;
}
function scalar(value, descriptor) {
    let type = descriptor.type;
    if (type === 'ref') type = 'id';
    if (['positive_integer', 'nonnegative_integer'].includes(type)) {
        if (!Number.isSafeInteger(value) || value < (type === 'positive_integer' ? 1 : 0)) fail();
        type = 'integer';
    }
    validateLiteral({ type, value });
    if (descriptor.maximum !== undefined && value > descriptor.maximum) fail();
    if (type === 'enum' && (!Array.isArray(descriptor.values) || !descriptor.values.includes(value))) fail();
    return value;
}
function record(handle, fields, enumerate = true) {
    if (enumerate) {
        const names = observedKeys(handle);
        if (names.length !== Object.keys(fields).length || names.some(name => !Object.hasOwn(fields, name))) fail();
    }
    return Object.fromEntries(Object.entries(fields).map(([name, type]) => [name, scalar(handle.get(name), { type })]));
}
function period(handle, enumerate = true) {
    const kind = handle.get('kind');
    if (['date', 'as_of', 'through', 'statement_due'].includes(kind)) return record(handle, { kind: 'text', value: 'date' }, enumerate);
    if (['month', 'statement_competence', 'budget_cycle'].includes(kind)) return record(handle, { kind: 'text', value: 'month' }, enumerate);
    if (kind === 'range') {
        const value = record(handle, { kind: 'text', start: 'date', end: 'date', start_inclusive: 'boolean', end_inclusive: 'boolean' }, enumerate);
        if (value.start > value.end) fail(); return value;
    }
    if (kind === 'registry_snapshot') return record(handle, { kind: 'text', snapshot_version: 'id' }, enumerate);
    if (kind === 'request_execution') return record(handle, { kind: 'text', turn_id: 'id' }, enumerate);
    fail();
}
function typedResult(handle) {
    const names = observedKeys(handle);
    if (names.sort().join(',') !== 'kind,unit,value') fail();
    const unit = handle.get('unit'); const kind = handle.get('kind'); const raw = handle.get('value');
    let value;
    if (unit === 'BRL_minor' && kind === 'money_minor') value = scalar(raw, { type: 'money_minor' });
    else if (unit === 'count' && kind === 'nonnegative_integer') value = scalar(raw, { type: 'nonnegative_integer' });
    else if (unit === 'entity_ids' && kind === 'id') value = scalar(raw, { type: 'id' });
    else if (unit === 'entity_ids' && kind === 'id_set') {
        value = sequence(raw, item => scalar(item, { type: 'id' }));
        if (new Set(value).size !== value.length) fail();
    } else if (unit === 'state' && kind === 'enum') {
        // The parent receipt/contract establishes its enum domain before this
        // fingerprint primitive is invoked. Here preserve the observed literal.
        validateLiteral({ type: 'enum', value: raw }); value = raw;
    } else fail();
    return { unit, kind, value };
}
function materialValue(value, descriptor) {
    if (descriptor.type === 'ref_list') {
        const result = sequence(value, item => scalar(item, { type: 'id' }));
        if (new Set(result).size !== result.length) fail(); return result;
    }
    if (descriptor.type === 'role_ref_list') {
        // The admitted primary-parent profile has parents=[] and explicitly
        // proves zero cardinality, without inventing an iterator obligation.
        if (value.length() === 0) return [];
        const result = sequence(value, item => record(item, { role_id: 'id', parent_ref: 'id' }));
        if (new Set(result.map(item => item.role_id)).size !== result.length) fail(); return result;
    }
    if (descriptor.type === 'typed_period') return period(value);
    if (descriptor.type === 'typed_result') return typedResult(value);
    return scalar(value, descriptor);
}
module.exports = { readObservedIdentity, observedKeys, sequence, scalar, record, period, typedResult, materialValue };
