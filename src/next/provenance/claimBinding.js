'use strict';

const { digest } = require('../kernel/canonicalValue');
const { types } = require('node:util');
const { copyData } = require('./observationContract');
const { isExecutionRole } = require('./executionRegistry');

const fail = () => { throw new Error('derived_result_hash_invalid'); };
const keysAre = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:#/-]{0,127}$/.test(value);
const sha256 = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
const version = value => Number.isSafeInteger(value) && value > 0;
const invocationScopes = new WeakMap();

// copyData rejects accessors, proxies and unsafe JSON before conversion to the
// plain-object grammar required by canonicalValue. This is a hash primitive;
// no caller can obtain a validation receipt or graph approval from it.
function plain(value) {
    if (Array.isArray(value)) return value.map(plain);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
    return value;
}
function freezeDeep(value) {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value)) freezeDeep(child);
        Object.freeze(value);
    }
    return value;
}

function checkResult(result) {
    if (!keysAre(result, ['unit', 'kind', 'value'])) fail();
    if (result.unit === 'BRL_minor' && result.kind === 'money_minor') {
        if (!Number.isSafeInteger(result.value) || Object.is(result.value, -0)) fail();
    } else if (result.unit === 'count' && result.kind === 'nonnegative_integer') {
        if (!Number.isSafeInteger(result.value) || result.value < 0) fail();
    } else if (result.unit === 'entity_ids' && result.kind === 'id') {
        if (!identifier(result.value)) fail();
    } else if (result.unit === 'entity_ids' && result.kind === 'id_set') {
        if (!Array.isArray(result.value) || result.value.some(item => !identifier(item))
            || new Set(result.value).size !== result.value.length) fail();
    } else if (result.unit === 'state' && result.kind === 'enum') {
        if (!identifier(result.value)) fail();
    } else fail();
}

// Transport type check only. The host must still bind unit/kind to the
// reviewed evaluator registry and validate the calculation and proof.
function copyTypedFunctionalResult(raw) {
    let result;
    try { result = plain(copyData(raw)); checkResult(result); } catch {
        throw new Error('functional_result_invalid');
    }
    return freezeDeep(result);
}

function checkBindings(bindings, roles, parents) {
    if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings)
        || Object.keys(bindings).length !== roles.length || !Array.isArray(parents)) fail();
    const expectedParents = [];
    const seen = new Set();
    for (const role of roles) {
        if (!isExecutionRole(role)
            || seen.has(role.role_id) || !Object.hasOwn(bindings, role.role_id)) fail();
        seen.add(role.role_id);
        const binding = bindings[role.role_id];
        if (role.input_kind === 'claim_context' && !keysAre(binding, ['kind'])) fail();
        else if (role.input_kind === 'node' && (!keysAre(binding, ['kind', 'alias']) || !identifier(binding.alias))) fail();
        else if (role.input_kind === 'node_set' && (!keysAre(binding, ['kind', 'aliases'])
            || !Array.isArray(binding.aliases) || binding.aliases.some(item => !identifier(item)))) fail();
        else if (role.input_kind === 'parent_claim' && (!keysAre(binding, ['kind', 'fact_key'])
            || !identifier(binding.fact_key))) fail();
        if (binding.kind !== role.input_kind) fail();
        if (role.input_kind === 'parent_claim') expectedParents.push([role.role_id, binding.fact_key]);
    }
    if (parents.length !== expectedParents.length) fail();
    for (let i = 0; i < parents.length; i++) {
        const parent = parents[i]; const [roleId, factKey] = expectedParents[i];
        if (!keysAre(parent, ['role_id', 'fact_key', 'evaluator_version', 'result_hash'])
            || parent.role_id !== roleId || parent.fact_key !== factKey
            || !version(parent.evaluator_version) || !sha256(parent.result_hash)) fail();
    }
}

function checkPrimaryInputs(inputs) {
    if (!Array.isArray(inputs)) fail();
    let previous = '';
    for (const item of inputs) {
        if (!keysAre(item, ['alias', 'kind', 'ref_id', 'version', 'semantic_fingerprint'])
            || !identifier(item.alias) || item.alias <= previous || !identifier(item.kind)
            || !identifier(item.ref_id) || !sha256(item.version) || !sha256(item.semantic_fingerprint)) fail();
        previous = item.alias;
    }
}

function calculateDerivedResultHash(raw) {
    let input;
    try { input = plain(copyData(raw)); } catch { fail(); }
    if (!keysAre(input, ['claim_contract_hash', 'graph_contract_hash', 'metric_registry_hash',
        'claim_id', 'fact_key', 'evaluator_ref', 'result', 'operand_bindings', 'primary_inputs', 'parents', 'registry_roles'])
        || !sha256(input.claim_contract_hash) || !sha256(input.graph_contract_hash)
        || !sha256(input.metric_registry_hash) || !identifier(input.claim_id) || !identifier(input.fact_key)
        || !keysAre(input.evaluator_ref, ['evaluator_id', 'evaluator_version'])
        || !identifier(input.evaluator_ref.evaluator_id) || !version(input.evaluator_ref.evaluator_version)
        || !Array.isArray(input.registry_roles)) fail();
    checkResult(input.result);
    checkBindings(input.operand_bindings, input.registry_roles, input.parents);
    checkPrimaryInputs(input.primary_inputs);
    const { registry_roles, ...fields } = input;
    try { return `sha256:${digest({ domain: 'financasbot.validated-derived-result.v1', ...fields })}`; }
    catch { fail(); }
}

// Pure primary-parent material projection. This is NOT a validated receipt,
// fingerprint certificate or permission to expose a handle. The host must
// first validate the invocation and proof, then bind this material to its
// private same-execution receipt before using it in a later invocation.
function projectPrimaryDerivedClaimPayload(raw) {
    let input;
    try { input = plain(copyData(raw)); } catch { fail(); }
    const result_hash = calculateDerivedResultHash(input);
    if (input.parents.length !== 0 || input.registry_roles.some(role => role.input_kind === 'parent_claim')) fail();
    const payload = freezeDeep({ id: input.claim_id, fact_key: input.fact_key,
        evaluator_version: input.evaluator_ref.evaluator_version, result_hash,
        result: input.result, parents: [] });
    return Object.freeze({ result_hash, payload });
}

// The descriptor must come from the admitted material registry in the host.
// This helper prepares an expected value; it never certifies the live handle.
// The proof phase must independently measure every material field through I.
function projectPrimaryDerivedClaimSnapshot(raw, rawDescriptor) {
    let descriptor;
    try { descriptor = plain(copyData(rawDescriptor)); } catch { fail(); }
    const expected = { id: ['identity', 'id'], fact_key: ['identity', 'id'],
        evaluator_version: ['identity', 'positive_integer'], result_hash: ['identity', 'digest'],
        result: ['dimension', 'typed_result'], parents: ['edge', 'role_ref_list'] };
    if (!keysAre(descriptor, ['registry_version', 'kind', 'fields'])
        || !version(descriptor.registry_version) || descriptor.kind !== 'derived_claim'
        || !keysAre(descriptor.fields, Object.keys(expected))) fail();
    for (const [name, [fieldClass, type]] of Object.entries(expected)) {
        const spec = descriptor.fields[name];
        if (!keysAre(spec, name === 'parents' ? ['class', 'type', 'required', 'targets'] : ['class', 'type', 'required'])
            || spec.class !== fieldClass || spec.type !== type || spec.required !== true
            || name === 'parents' && JSON.stringify(spec.targets) !== '["derived_claim"]') fail();
    }
    const { result_hash, payload } = projectPrimaryDerivedClaimPayload(raw);
    // No circular preimage: result_hash does not include the snapshot's version
    // or semantic fingerprint. This content-addressed version remains internal.
    const snapshot = freezeDeep({ ref_id: payload.id, kind: 'derived_claim', version: result_hash, payload });
    const semantic_fingerprint = `sha256:${digest({ registry_version: descriptor.registry_version,
        kind: snapshot.kind, ref_id: snapshot.ref_id, version: snapshot.version, payload: snapshot.payload })}`;
    return Object.freeze({ result_hash, snapshot, semantic_fingerprint });
}

// TCB-only transport for already accepted primary results. The host must call
// acceptPrimary only AFTER its own metric, proof and trace validation; this
// ledger cannot perform those validations and its token is not graph approval.
// No receipt, descriptor or raw parent value is endowed to guest code.
function createSameExecutionParentLedger(rawConfig) {
    const invalid = () => { throw new Error('parent_ledger_invalid'); };
    let config;
    try { config = plain(copyData(rawConfig)); } catch { invalid(); }
    if (!keysAre(config, ['executionId']) || !identifier(config.executionId)) invalid();
    const receipts = new WeakMap();
    const issuedFacts = new Set(); const invocationIds = new Set();
    let active; let ordinal = 0; let finished = false;
    function ownValues(raw, names) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
            || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) invalid();
        const descriptors = Object.getOwnPropertyDescriptors(raw);
        if (Reflect.ownKeys(descriptors).length !== names.length || names.some(name =>
            !Object.hasOwn(descriptors, name) || !Object.hasOwn(descriptors[name], 'value')
            || !descriptors[name].enumerable)) invalid();
        return Object.fromEntries(names.map(name => [name, descriptors[name].value]));
    }
    function openInvocation(rawScope) {
        if (finished || active) invalid();
        let scope;
        try { scope = plain(copyData(rawScope)); } catch { invalid(); }
        if (!keysAre(scope, ['invocationId']) || !identifier(scope.invocationId)
            || invocationIds.has(scope.invocationId)) invalid();
        invocationIds.add(scope.invocationId);
        const token = Object.freeze(Object.create(null));
        const number = ++ordinal;
        let issuedInScope = false;
        active = token;
        const check = () => { if (finished || active !== token) invalid(); };
        const api = Object.freeze({
            acceptPrimary(raw) {
                check();
                if (issuedInScope) invalid();
                const { preimage, descriptor } = ownValues(raw, ['preimage', 'descriptor']);
                const projected = projectPrimaryDerivedClaimSnapshot(preimage, descriptor);
                const factKey = projected.snapshot.payload.fact_key;
                if (issuedFacts.has(factKey)) invalid();
                issuedFacts.add(factKey);
                issuedInScope = true;
                const receipt = Object.freeze(Object.create(null));
                const preimageCopy = plain(copyData(preimage));
                const hashes = freezeDeep({ claim_contract_hash: preimageCopy.claim_contract_hash,
                    graph_contract_hash: preimageCopy.graph_contract_hash, metric_registry_hash: preimageCopy.metric_registry_hash });
                receipts.set(receipt, Object.freeze({ projected, hashes, number, invocationId: scope.invocationId }));
                return receipt;
            },
            resolveParent(raw) {
                check();
                const selector = ownValues(raw, ['receipt', 'fact_key', 'claim_id', 'evaluator_version', 'result_hash']);
                const record = receipts.get(selector.receipt);
                if (!record || record.number >= number || record.invocationId === scope.invocationId) invalid();
                const { projected } = record;
                const payload = projected.snapshot.payload;
                if (selector.fact_key !== payload.fact_key || selector.claim_id !== payload.id
                    || selector.evaluator_version !== payload.evaluator_version
                    || selector.result_hash !== projected.result_hash) invalid();
                return projected;
            },
            seal() { check(); active = undefined; }
        });
        invocationScopes.set(api, raw => {
            check();
            const selector = ownValues(raw, ['receipt', 'fact_key', 'claim_id', 'evaluator_version',
                'claim_contract_hash', 'graph_contract_hash', 'metric_registry_hash']);
            const record = receipts.get(selector.receipt);
            if (!record || record.number >= number || record.invocationId === scope.invocationId) invalid();
            const { projected } = record;
            const payload = projected.snapshot.payload;
            if (selector.fact_key !== payload.fact_key || selector.claim_id !== payload.id
                || selector.evaluator_version !== payload.evaluator_version) invalid();
            for (const key of ['claim_contract_hash', 'graph_contract_hash', 'metric_registry_hash']) {
                if (selector[key] !== record.hashes[key]) invalid();
            }
            return projected;
        });
        return api;
    }
    return Object.freeze({ openInvocation,
        finish() { if (finished || active) invalid(); finished = true; }
    });
}

// Compiler/host-only lookup: never dispatch through a caller-provided method.
// The scope must be the actual opaque object minted by this module.
function resolveLedgerParent(scope, selector) {
    const resolve = invocationScopes.get(scope);
    if (!resolve) throw new Error('parent_ledger_invalid');
    return resolve(selector);
}

module.exports = { copyTypedFunctionalResult, calculateDerivedResultHash, projectPrimaryDerivedClaimPayload,
    projectPrimaryDerivedClaimSnapshot, createSameExecutionParentLedger, resolveLedgerParent };
