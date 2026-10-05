'use strict';

const { createHash } = require('node:crypto');
const { types } = require('node:util');
const { canonicalValue } = require('../kernel/canonicalValue');
const { copyData, identifier } = require('./observationContract');

const admitted = new WeakMap();
const admittedContracts = new WeakMap();
const fail = code => { throw new Error(`execution_registry_${code}`); };
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const namePattern = /^[a-z][a-z0-9_]{0,63}$/;
const semanticRoles = new Set(['population', 'scope', 'period', 'policy', 'coverage',
    'source', 'target', 'left', 'right', 'numerator', 'denominator', 'sort_key',
    'sort_direction', 'opening_balance', 'limit', 'clock', 'evidence']);
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const entryKeys = ['artifact_status', 'contract_path', 'evaluator_artifact_root',
    'evaluator_contract_hash', 'evaluator_id', 'evaluator_version', 'metric',
    'roles', 'unit', 'witness_contract_ids'].sort().join(',');

function validRole(role) {
    if (!role || Object.keys(role).sort().join(',') !== 'cardinality,input_kind,ordered,role_id,semantic_role'
        || !namePattern.test(role.role_id) || !semanticRoles.has(role.semantic_role)
        || !['node', 'node_set', 'parent_claim', 'claim_context'].includes(role.input_kind)
        || typeof role.ordered !== 'boolean') return false;
    return role.input_kind === 'node_set'
        ? role.cardinality === 'many'
        : role.cardinality === 'one' && role.ordered === false;
}

function bytesOf(raw) {
    if (!raw || types.isProxy(raw) || !Buffer.isBuffer(raw)
        || Object.getPrototypeOf(raw) !== Buffer.prototype) fail('bytes');
    const length = Reflect.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')
        .get.call(raw);
    if (length < 1 || length > 1024 * 1024) fail('size');
    const result = Buffer.alloc(length);
    Uint8Array.prototype.set.call(result, raw);
    return result;
}

// TCB-only admission. expectedHash must originate from the independently
// reviewed freeze. Passing a self-computed hash only proves local consistency,
// not authority, and this receipt does not approve any graph or result.
function admitExecutionRegistry(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== 2 || !d.bytes || !d.expectedHash
        || !Object.hasOwn(d.bytes, 'value') || !Object.hasOwn(d.expectedHash, 'value')
        || !d.bytes.enumerable || !d.expectedHash.enumerable
        || typeof d.expectedHash.value !== 'string' || !digestPattern.test(d.expectedHash.value)) fail('input');
    const bytes = bytesOf(d.bytes.value);
    const observed = digest(bytes);
    if (observed !== d.expectedHash.value) fail('hash');
    const source = bytes.toString('utf8');
    if (!Buffer.from(source, 'utf8').equals(bytes)) fail('utf8');
    let parsed;
    try { parsed = JSON.parse(source); } catch { fail('json'); }
    try { if (canonicalValue(parsed) !== source) fail('canonical'); }
    catch { fail('canonical'); }
    let registry;
    try { registry = copyData(parsed); } catch { fail('shape'); }
    if (Object.keys(registry).sort().join(',') !== 'entries,registry_id,registry_version,schema_version,stage'
        || registry.schema_version !== 1 || registry.registry_id !== 'metric_evaluator_registry'
        || registry.registry_version !== 1 || registry.stage !== 'execution'
        || !Array.isArray(registry.entries) || registry.entries.length !== 39) fail('stage');
    const entries = new Map();
    for (const entry of registry.entries) {
        if (!entry || Object.keys(entry).sort().join(',') !== entryKeys
            || !namePattern.test(entry.evaluator_id) || entry.evaluator_id !== entry.metric
            || !Number.isSafeInteger(entry.evaluator_version) || entry.evaluator_version < 1
            || !digestPattern.test(entry.evaluator_artifact_root)
            || !digestPattern.test(entry.evaluator_contract_hash)
            || entry.contract_path !== `docs/contracts/next/provenance-v2/evaluator-contracts/${entry.evaluator_id}.json`
            || entry.artifact_status !== 'bound' || !Array.isArray(entry.roles) || !entry.roles.length
            || entry.roles.some(role => !validRole(role))
            || new Set(entry.roles.map(role => role.role_id)).size !== entry.roles.length
            || !Array.isArray(entry.witness_contract_ids) || !entry.witness_contract_ids.length
            || entry.witness_contract_ids.some(id => !namePattern.test(id))
            || new Set(entry.witness_contract_ids).size !== entry.witness_contract_ids.length
            || !['BRL_minor', 'count', 'entity_ids', 'state'].includes(entry.unit)) fail('entry');
        const key = JSON.stringify([entry.evaluator_id, entry.evaluator_version]);
        if (entries.has(key)) fail('duplicate');
        entries.set(key, entry);
    }
    const receipt = Object.freeze({ stage: 'admitted_execution_registry_bytes_only',
        observed_hash: observed, evaluatorCount: entries.size });
    admitted.set(receipt, entries);
    return receipt;
}

function resolveExecutionEvaluator(receipt, rawRef) {
    const entries = admitted.get(receipt);
    if (!entries) fail('not_admitted');
    let ref;
    try { ref = copyData(rawRef); } catch { fail('ref'); }
    if (Object.keys(ref).sort().join(',') !== 'evaluator_id,evaluator_version'
        || !identifier(ref.evaluator_id) || !Number.isSafeInteger(ref.evaluator_version)
        || ref.evaluator_version < 1) fail('ref');
    const entry = entries.get(JSON.stringify([ref.evaluator_id, ref.evaluator_version]));
    if (!entry) fail('missing');
    return entry;
}

// Exact published contract bytes, never canonicalized or normalized. The
// registry's contract hash is the sole expected value. This receipt conveys
// an output signature, not proof that the metric or graph has been accepted.
function admitExecutionContract(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('contract_input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== 3 || ['registryReceipt', 'evaluatorRef', 'bytes'].some(key =>
        !d[key] || !Object.hasOwn(d[key], 'value') || !d[key].enumerable)) fail('contract_input');
    const entry = resolveExecutionEvaluator(d.registryReceipt.value, d.evaluatorRef.value);
    const bytes = bytesOf(d.bytes.value);
    if (digest(bytes) !== entry.evaluator_contract_hash) fail('contract_hash');
    const source = bytes.toString('utf8');
    if (!Buffer.from(source, 'utf8').equals(bytes)) fail('contract_utf8');
    let contract;
    try { contract = copyData(JSON.parse(source)); } catch { fail('contract_json'); }
    const output = contract.signature?.output;
    const kinds = { BRL_minor: ['money_minor'], count: ['nonnegative_integer'],
        entity_ids: ['id', 'id_set'], state: ['enum'] };
    if (contract.schema_version !== 1 || contract.stage !== 'authoring'
        || contract.metric !== entry.metric || contract.unit !== entry.unit
        || contract.signature?.context !== 'explicit_versioned_instrumented_claim'
        || contract.signature?.operands !== 'resolve_roles_from_metric_evaluator_registry'
        || !output || !kinds[entry.unit].includes(output.kind)
        || Object.hasOwn(output, 'enum_values') && output.kind !== 'enum'
        || Object.keys(output).some(key => !['kind', 'enum_values'].includes(key))) fail('contract_signature');
    if (Object.hasOwn(output, 'enum_values') && (!Array.isArray(output.enum_values)
        || !output.enum_values.length || output.enum_values.some(value => !identifier(value))
        || new Set(output.enum_values).size !== output.enum_values.length)) fail('contract_signature');
    const receipt = Object.freeze({ stage: 'admitted_evaluator_contract_bytes_only',
        observed_hash: entry.evaluator_contract_hash });
    admittedContracts.set(receipt, Object.freeze({ registryReceipt: d.registryReceipt.value,
        evaluatorKey: JSON.stringify([entry.evaluator_id, entry.evaluator_version]),
        kind: output.kind, enumValues: Object.freeze([...(output.enum_values || [])]) }));
    return receipt;
}

function resolveExecutionOutput(registryReceipt, rawRef, contractReceipt) {
    const entry = resolveExecutionEvaluator(registryReceipt, rawRef);
    const record = admittedContracts.get(contractReceipt);
    if (!record || record.registryReceipt !== registryReceipt
        || record.evaluatorKey !== JSON.stringify([entry.evaluator_id, entry.evaluator_version])) fail('contract_not_admitted');
    return Object.freeze({ unit: entry.unit, kind: record.kind, enumValues: record.enumValues });
}

function executionContractHash(receipt) {
    if (!admittedContracts.has(receipt)) fail('contract_not_admitted');
    return receipt.observed_hash;
}

module.exports = { admitExecutionRegistry, resolveExecutionEvaluator,
    admitExecutionContract, resolveExecutionOutput, executionContractHash, isExecutionRole: validRole };
