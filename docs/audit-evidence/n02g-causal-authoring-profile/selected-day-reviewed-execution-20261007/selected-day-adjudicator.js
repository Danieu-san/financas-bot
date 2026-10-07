(function(nativeRequire) {
'use strict';
// closed-commonjs-bundle-v1
const factories = [function(require, module, exports, __dirname, __filename) {
'use strict';

const { createHash } = require('node:crypto');

// Adapted from the v1 projector's stableStringify. Unlike its input path,
// this accepts only plain JSON and safe integers; it never coerces money.
function canonicalValue(value, ancestors = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0)) return String(value);
    if (!value || typeof value !== 'object' || ancestors.has(value)) throw new Error('canonical_json_invalid');
    const array = Array.isArray(value);
    if (!array && Object.getPrototypeOf(value) !== Object.prototype) throw new Error('canonical_json_invalid');
    if (Object.getOwnPropertySymbols(value).length) throw new Error('canonical_json_invalid');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const [key, descriptor] of Object.entries(descriptors)) {
        if (array && key === 'length') continue;
        if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value') ||
            ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('canonical_json_invalid');
    }
    ancestors.add(value);
    let output;
    if (array) {
        if (Object.keys(value).length !== value.length ||
            Object.keys(value).some((key, index) => key !== String(index))) throw new Error('canonical_json_invalid');
        output = '[' + value.map(item => canonicalValue(item, ancestors)).join(',') + ']';
    } else {
        output = '{' + Object.keys(value).sort().map(key =>
            JSON.stringify(key) + ':' + canonicalValue(value[key], ancestors)).join(',') + '}';
    }
    ancestors.delete(value);
    return output;
}

function digest(value) {
    return createHash('sha256').update(canonicalValue(value)).digest('hex');
}

function freezeDeep(value) {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value)) freezeDeep(child);
        Object.freeze(value);
    }
    return value;
}

module.exports = { canonicalValue, digest, freezeDeep };

},
function(require, module, exports, __dirname, __filename) {
'use strict';

// Proleptic Gregorian civil arithmetic. No Date, timezone, clock or millisecond
// arithmetic. Instant-to-zone conversion is deliberately a separate boundary.
const fail = code => { throw new Error(`civil_${code}`); };
const integer = value => {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail('integer');
    return value;
};
const leap = year => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
const daysBeforeYear = year => 365 * (year - 1) + Math.floor((year - 1) / 4)
    - Math.floor((year - 1) / 100) + Math.floor((year - 1) / 400);
function daysInMonth(year, month) {
    if (month === 2) return leap(year) ? 29 : 28;
    return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
function parseMonth(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) fail('month');
    const [year, month] = value.split('-').map(Number);
    if (year < 1 || year > 9999 || month < 1 || month > 12) fail('month');
    return { year, month };
}
function parseDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('date');
    const { year, month } = parseMonth(value.slice(0, 7));
    const day = Number(value.slice(8));
    if (day < 1 || day > daysInMonth(year, month)) fail('date');
    return { year, month, day };
}
function format(year, month, day) {
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function dayOrdinal(value) {
    const { year, month, day } = parseDate(value);
    let ordinal = daysBeforeYear(year) + day;
    for (let m = 1; m < month; m++) ordinal += daysInMonth(year, m);
    return ordinal;
}
function dateFromOrdinal(value) {
    integer(value);
    if (value < 1 || value > daysBeforeYear(10000)) fail('overflow');
    let low = 1;
    let high = 9999;
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (daysBeforeYear(middle) < value) low = middle;
        else high = middle - 1;
    }
    let day = value - daysBeforeYear(low);
    let month = 1;
    while (day > daysInMonth(low, month)) day -= daysInMonth(low, month++);
    return format(low, month, day);
}
function offsetDate(value, amount, unit) {
    const { year, month, day } = parseDate(value);
    integer(amount);
    if (unit === 'day') return dateFromOrdinal(integer(dayOrdinal(value) + amount));
    if (unit !== 'month') fail('unit');
    const index = integer((year - 1) * 12 + month - 1 + amount);
    if (index < 0 || index >= 9999 * 12) fail('overflow');
    const targetYear = Math.floor(index / 12) + 1;
    const targetMonth = index % 12 + 1;
    if (day > daysInMonth(targetYear, targetMonth)) fail('nonexistent_target');
    return format(targetYear, targetMonth, day);
}
function monthBounds(value) {
    const { year, month } = parseMonth(value);
    return { start: format(year, month, 1), end: format(year, month, daysInMonth(year, month)) };
}
function inclusiveDayCount(range) {
    if (!range || range.start_inclusive !== true || range.end_inclusive !== true) fail('inclusive_range');
    const count = dayOrdinal(range.end) - dayOrdinal(range.start) + 1;
    if (count < 1) fail('range_order');
    return count;
}

module.exports = { parseDate, parseMonth, dayOrdinal, dateFromOrdinal, offsetDate, monthBounds, inclusiveDayCount };

},
function(require, module, exports, __dirname, __filename) {
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

},
function(require, module, exports, __dirname, __filename) {
'use strict';

const { freezeDeep } = require('../kernel/canonicalValue');

// Configuration to be measured in the execution closure. Exporting this object
// does not enforce confinement: the disposable TCB must apply and verify it.
const EXECUTION_PROFILE = freezeDeep({
    format: 'financasbot.provenance.execution-profile',
    version: 1,
    ses_version: '2.3.0',
    node_version: '22.17.0',
    native_timezone: { icu: '77.1', tz: '2025b', cldr: '47.0', unicode: '16.0' },
    guest: { ecma_version: 2022, source_type: 'script', parameter: 'operands' },
    lockdown: {
        errorTaming: 'safe', errorTrapping: 'none', reporting: 'none',
        unhandledRejectionTrapping: 'none', regExpTaming: 'safe', localeTaming: 'safe',
        consoleTaming: 'safe', overrideTaming: 'severe', stackFiltering: 'concise',
        domainTaming: 'safe', evalTaming: 'safe-eval', overrideDebug: [],
        legacyRegeneratorRuntimeTaming: 'safe', __hardenTaming__: 'safe'
    },
    evaluate: { transforms: [], __evadeHtmlCommentTest__: false,
        __evadeImportExpressionTest__: false, __rejectSomeDirectEvalExpressions__: true },
    denied_globals: [
        'process', 'require', 'module', 'exports', 'Buffer', '__dirname', '__filename',
        'fetch', 'WebSocket', 'XMLHttpRequest', 'console', 'Date', 'Intl', 'Promise',
        'setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval',
        'clearImmediate', 'queueMicrotask', 'performance', 'crypto',
        'eval', 'Function', 'Compartment', 'lockdown', 'harden',
        'WeakRef', 'FinalizationRegistry', 'SharedArrayBuffer', 'Atomics', 'WebAssembly'
    ]
});

module.exports = { EXECUTION_PROFILE };

},
function(require, module, exports, __dirname, __filename) {
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

},
function(require, module, exports, __dirname, __filename) {
'use strict';
const { parseDate, parseMonth } = require('./civilCalendar');
const fail = () => { throw new Error('literal_type_value'); };
function validateLiteral(literal) {
    if (!literal || typeof literal !== 'object' || Array.isArray(literal)
        || Object.keys(literal).length !== 2 || !Object.hasOwn(literal, 'type') || !Object.hasOwn(literal, 'value')) fail();
    const { type, value } = literal;
    if (type === 'integer' || type === 'money_minor') {
        if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail();
    } else if (type === 'boolean') {
        if (typeof value !== 'boolean') fail();
    } else {
        if (typeof value !== 'string') fail();
        if (type === 'date') parseDate(value);
        else if (type === 'month') parseMonth(value);
        else if (type === 'datetime') {
            const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
            if (!match) fail();
            parseDate(match[1]);
            if (+match[2] > 23 || +match[3] > 59 || +match[4] > 59
                || (match[5] !== undefined && (+match[5] > 23 || +match[6] > 59))) fail();
        } else if (type === 'digest') {
            if (!/^sha256:[a-f0-9]{64}$/.test(value)) fail();
        } else if (type === 'id') {
            if (!/^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$/.test(value)) fail();
        } else if (type === 'kind') {
            if (!/^[a-z][a-z0-9_]*$/.test(value)) fail();
        } else if (type === 'enum') {
            if (!value.length) fail();
        } else if (type !== 'text') fail();
    }
    return type;
}
module.exports = { validateLiteral };

},
function(require, module, exports, __dirname, __filename) {
'use strict';
const { digest } = require('../kernel/canonicalValue');
const { types } = require('node:util');
const fail = () => { throw new Error('observation_shape_invalid'); };
const { identifier, field, scalar } = require('./observationScalars');

// Copy only bounded data descriptors, never getters, proxies or coercions.
// This is transport/shape admission, not a financial schema validator.
function copyData(input) {
    let nodes = 0; let characters = 0; const ancestors = new Set();
    function copy(value, depth) {
        if (++nodes > 65536 || depth > 32) fail();
        if (scalar(value)) {
            if (typeof value === 'string' && (characters += value.length) > 1048576) fail();
            return value;
        }
        if (!value || typeof value !== 'object' || types.isProxy(value) || ancestors.has(value)) fail();
        const array = Array.isArray(value);
        if (array ? Object.getPrototypeOf(value) !== Array.prototype
            : ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail();
        const descriptors = Object.getOwnPropertyDescriptors(value);
        const keys = Reflect.ownKeys(descriptors);
        if (keys.length > 65536 || keys.some(k => typeof k !== 'string')) fail();
        ancestors.add(value);
        let result;
        if (array) {
            const length = descriptors.length.value;
            if (keys.length !== length + 1) fail();
            result = [];
            for (let i = 0; i < length; i++) {
                const d = descriptors[String(i)];
                if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) fail();
                result.push(copy(d.value, depth + 1));
            }
        } else {
            result = Object.create(null);
            for (const key of keys) {
                const d = descriptors[key];
                if (!field(key) || !d.enumerable || !Object.hasOwn(d, 'value')) fail();
                result[key] = copy(d.value, depth + 1);
            }
        }
        ancestors.delete(value);
        return Object.freeze(result);
    }
    return copy(input, 0);
}

function decodeObservation(raw) {
    const e = copyData(raw);
    if (!Array.isArray(e) || e.length !== 7 || e[0] !== 'I' || !identifier(e[2]) || !identifier(e[3])
        || !Array.isArray(e[4]) || e[4].length > 32
        || e[4].some(p => !field(p) && !(Number.isSafeInteger(p) && p >= 0))
        || !['data', 'keys', 'operand_set', 'operand_selection', 'node_identity'].includes(e[5]) || !Array.isArray(e[6])) fail();
    const o = e[6]; const tag = o[0];
    if (e[5] === 'node_identity' && e[1] !== 'identity') fail();
    const selectedView = e[5] === 'operand_selection';
    const nodeSet = e[5] === 'operand_set' || selectedView;
    const viewId = value => typeof value === 'string' && /^view_[a-f0-9]{64}$/.test(value);
    if (selectedView && !viewId(e[4][0])) fail();
    const setPath = selectedView ? e[4].slice(1) : e[4];
    if (nodeSet && (e[2] !== `operand/${e[3]}`
        || !['length', 'includes', 'at', 'iterate', 'next', 'return', 'reuse_iterator',
            'select_start', 'select_member', 'select_return'].includes(e[1])
        || (['at', 'next', 'select_member'].includes(e[1])
            ? setPath.length !== 1 || !Number.isSafeInteger(setPath[0]) || setPath[0] < 0 || Object.is(setPath[0], -0)
            : setPath.length !== 0))) fail();
    const valueOutcome = tag === 'scalar' && o.length === 2 && scalar(o[1])
        || tag === 'container' && o.length === 2 && ['record', 'sequence'].includes(o[1]);
    const accessOutcome = nodeSet ? tag === 'node' && o.length === 2 && identifier(o[1]) : valueOutcome;
    let valid = false;
    switch (e[1]) {
    case 'civil_date': valid = e[5] === 'data' && e[4].length >= 1
        && tag === 'civil' && o.length === 5 && o.slice(1).every(v => typeof v === 'string')
        && o[2] === 'America/Sao_Paulo' && o[3] === 'proleptic_gregorian'
        && /^\d{4}-\d{2}-\d{2}$/.test(o[4]); break;
    case 'identity': {
        const key = e[4][0];
        valid = e[5] === 'node_identity' && e[4].length === 1 && tag === 'scalar' && o.length === 2 && typeof o[1] === 'string'
            && (key === 'kind' ? /^[a-z][a-z0-9_]*$/.test(o[1]) : key === 'version' ? /^sha256:[a-f0-9]{64}$/.test(o[1])
                : key === 'ref_id' && /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$/.test(o[1]));
        break;
    }
    case 'traverse': valid = e[5] === 'data' && e[4].length === 1 && field(e[4][0])
        && tag === 'edge' && o.length === 3 && identifier(o[1]) && identifier(o[2]); break;
    case 'get': case 'at': valid = accessOutcome || tag === 'absent' && o.length === 1; break;
    case 'next': valid = accessOutcome || tag === 'done' && o.length === 1; break;
    case 'has': valid = tag === 'boolean' && o.length === 2 && typeof o[1] === 'boolean'; break;
    case 'keys': valid = tag === 'keys' && o.slice(1).every(k => typeof k === 'string'); break;
    case 'length': valid = tag === 'count' && o.length === 2 && Number.isSafeInteger(o[1]) && o[1] >= 0; break;
    case 'includes': valid = tag === 'membership' && o.length === 3
        && (nodeSet ? identifier(o[1]) : scalar(o[1])) && typeof o[2] === 'boolean'; break;
    case 'iterate': valid = tag === 'opened' && o.length === 1; break;
    case 'return': valid = tag === 'closed' && o.length === 2 && Number.isSafeInteger(o[1]) && o[1] >= 0; break;
    case 'reuse_iterator': valid = tag === 'cursor' && o.length === 3 && Number.isSafeInteger(o[1])
        && o[1] >= 0 && typeof o[2] === 'boolean'; break;
    case 'select_start': valid = nodeSet && tag === 'selection_opened' && o.length === 1; break;
    case 'select_member': valid = nodeSet && tag === 'decision' && o.length === 3
        && identifier(o[1]) && typeof o[2] === 'boolean'; break;
    case 'select_return': valid = nodeSet && tag === 'selected' && o.length >= 2 && o.length <= 514 && viewId(o[1])
        && o.slice(2).every(identifier) && new Set(o.slice(2)).size === o.length - 2
        && o[1] === `view_${digest({ role: e[3], aliases: o.slice(2) })}`; break;
    default: fail();
    }
    if (!valid) fail();
    // Remain in channel I. Only the recorder chooses field names in L/T.
    return e;
}

function decodeMeasurement(raw) {
    const e = copyData(raw);
    if (!Array.isArray(e) || e.length !== 3 || e[0] !== 'M'
        || !['evaluator_artifact_root', 'evaluator_contract_hash', 'validation_tcb_root', 'proof_engine_artifact_root'].includes(e[1])
        || typeof e[2] !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(e[2])) fail();
    return e;
}

module.exports = { copyData, identifier, field, scalar, decodeObservation, decodeMeasurement };

},
function(require, module, exports, __dirname, __filename) {
'use strict';
// Shared pure scalar grammar; no native APIs or transport authority.
const identifier = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:#/-]{0,127}$/.test(v);
const field = v => typeof v === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(v)
    && !['__proto__', 'constructor', 'prototype'].includes(v);
const scalar = v => v === null || typeof v === 'boolean' || typeof v === 'string' && v.length <= 65536
    || typeof v === 'number' && Number.isSafeInteger(v) && !Object.is(v, -0);
module.exports = { identifier, field, scalar };

},
function(require, module, exports, __dirname, __filename) {
'use strict';
const process = require('node:process');
const { dayOrdinal, parseDate } = require('./civilCalendar');
const { validateLiteral } = require('./literalTypes');
const { copyData } = require('./observationContract');
const { EXECUTION_PROFILE } = require('./executionProfile');
const PIN = Object.freeze({ node: EXECUTION_PROFILE.node_version, ...EXECUTION_PROFILE.native_timezone });
const fail = () => { throw new Error('timezone_runtime_invalid'); };
const DateTimeFormat = Intl.DateTimeFormat;
const formatToParts = Intl.DateTimeFormat.prototype.formatToParts;

// TCB-only adapter. Native ICU is part of the explicitly pinned runtime, not
// an ambient guest capability. The final launcher must ALSO verify runtime
// binary identity; version labels alone do not authenticate a modified binary.
function checkTimezoneRuntime(versions, config, environment, argv) {
    for (const [key, expected] of Object.entries(PIN)) if (versions[key] !== expected) fail();
    if (config.icu_small !== false || config.icu_gyp_path !== 'tools/icu/icu-generic.gyp') fail();
    for (const key of ['NODE_ICU_DATA', 'ICU_TIMEZONE_FILES_DIR', 'NODE_OPTIONS']) if (environment[key]) fail();
    if (!Array.isArray(argv) || argv.some(arg => typeof arg !== 'string' || arg.startsWith('--icu-data-dir'))) fail();
    return true;
}
function civilDateInPinnedTimezone(rawInstant, rawZone, rawCalendar) {
    const [instant, zone, calendar] = copyData([rawInstant, rawZone, rawCalendar]);
    validateLiteral({ type: 'datetime', value: instant });
    if (zone !== 'America/Sao_Paulo' || calendar !== 'proleptic_gregorian') fail();
    checkTimezoneRuntime(process.versions, process.config.variables, process.env, process.execArgv);
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(instant);
    const offset = match[6] === 'Z' ? 0 : (match[7] === '+' ? 1 : -1) * (Number(match[8]) * 60 + Number(match[9]));
    // Floor fractions to the containing millisecond, including before epoch.
    // Civil boundaries and tzdb transitions occur on integral seconds; this
    // preserves the side of every boundary without Date.parse/coercion/clock.
    const seconds = (dayOrdinal(match[1]) - dayOrdinal('1970-01-01')) * 86400
        + Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4]) - offset * 60;
    const millis = seconds * 1000 + Number((match[5] || '').padEnd(3, '0').slice(0, 3));
    if (!Number.isSafeInteger(millis)) fail();
    const formatter = new DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
        timeZone: zone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit', era: 'short'
    });
    const fields = {};
    for (const part of formatToParts.call(formatter, millis)) {
        if (!['year', 'month', 'day', 'era'].includes(part.type)) continue;
        if (Object.hasOwn(fields, part.type)) fail(); fields[part.type] = part.value;
    }
    if (fields.era !== 'AD' || !/^\d{1,4}$/.test(fields.year) || !/^\d{2}$/.test(fields.month) || !/^\d{2}$/.test(fields.day)) fail();
    const result = `${fields.year.padStart(4, '0')}-${fields.month}-${fields.day}`;
    parseDate(result); return result;
}

module.exports = { civilDateInPinnedTimezone, checkTimezoneRuntime };

},
function(require, module, exports, __dirname, __filename) {
'use strict';
const { copyData, identifier, field, decodeObservation, decodeMeasurement } = require('./observationContract');
const { civilDateInPinnedTimezone } = require('./pinnedCivilTimezone');
const { digest } = require('../kernel/canonicalValue');

const fail = code => { throw new Error(`trace_coverage_${code}`); };
function exactKeys(value, names) {
    return value && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value).sort().join(',') === [...names].sort().join(',');
}
function expectedSet(values, convert) {
    if (!Array.isArray(values)) fail('expected');
    const result = new Map();
    for (const value of values) {
        const converted = convert(value); const key = JSON.stringify(converted);
        if (result.has(key)) fail('expected_duplicate');
        result.set(key, converted);
    }
    return result;
}
function expectedId(value) { if (!identifier(value)) fail('expected'); return value; }
function expectedPath(value) {
    if (!Array.isArray(value) || !value.length || !value.every(field)) fail('expected');
    return value;
}

function scopedTrace(trace, executionId, invocationId) {
    if (!exactKeys(trace, ['stage', 'execution_id', 'derivation_trace', 'proof_trace'])
        || trace.stage !== 'observations_only' || trace.execution_id !== executionId) fail('identity');
    const all = [];
    for (const phase of ['derivation', 'proof']) {
        const entries = trace[`${phase}_trace`];
        if (!Array.isArray(entries)) fail('entries');
        let previous = -1;
        for (const entry of entries) {
            if (!entry || entry.phase !== phase || entry.invocation_id !== invocationId
                || !Number.isSafeInteger(entry.sequence) || entry.sequence <= previous) fail('scope');
            previous = entry.sequence;
            const observation = exactKeys(entry, ['sequence', 'invocation_id', 'phase', 'operation', 'alias', 'role', 'path', 'projection', 'outcome']);
            const measurement = exactKeys(entry, ['sequence', 'invocation_id', 'phase', 'measurement', 'observed']);
            try {
                if (observation) decodeObservation(['I', entry.operation, entry.alias, entry.role, entry.path, entry.projection, entry.outcome]);
                else if (measurement) decodeMeasurement(['M', entry.measurement, entry.observed]);
                else fail('entry');
            } catch { fail('entry'); }
            all.push(entry);
        }
    }
    all.sort((a, b) => a.sequence - b.sequence);
    if (all.some((entry, i) => entry.sequence !== i)) fail('sequence');
    return all;
}

// Host-side validator of a single invocation's recorder output. This component
// does not authenticate the host/TCB, issue parent receipts or accept graphs.
// Unclassified identity/operand-set/measurement events prevent even its local
// match; subsequent integration must classify them explicitly, never drop them.
function compareReadEdgeCoverage(input) {
    let args;
    try { args = copyData(input); } catch { fail('input'); }
    if (!exactKeys(args, ['trace', 'expected', 'executionId', 'invocationId', 'phase'])
        || !identifier(args.executionId) || !identifier(args.invocationId)
        || !['derivation', 'proof'].includes(args.phase)) fail('input');
    const { trace, expected } = args;
    if (!exactKeys(expected, ['required_nodes', 'required_reads', 'required_claim_reads', 'required_edges', 'required_structural'])) fail('expected');
    const expectations = {
        nodes: expectedSet(expected.required_nodes, expectedId),
        reads: expectedSet(expected.required_reads, r => {
            if (!exactKeys(r, ['node', 'segments'])) fail('expected');
            return [expectedId(r.node), expectedPath(r.segments)];
        }),
        claim_reads: expectedSet(expected.required_claim_reads, r => {
            if (!exactKeys(r, ['segments'])) fail('expected');
            return expectedPath(r.segments);
        }),
        edges: expectedSet(expected.required_edges, expectedId),
        structural: expectedSet(expected.required_structural, r => {
            if (!exactKeys(r, ['node', 'operation', 'segments'])
                || !['has', 'keys', 'iterator', 'index', 'order', 'membership', 'cardinality', 'length', 'selection', 'traversal', 'early_termination'].includes(r.operation)
                || !Array.isArray(r.segments) || !r.segments.every(field)) fail('expected');
            return [expectedId(r.node), r.operation, r.segments];
        })
    };
    const all = scopedTrace(trace, args.executionId, args.invocationId);
    const observed = Object.fromEntries(Object.keys(expectations).map(k => [k, new Map()]));
    const add = (dimension, value) => observed[dimension].set(JSON.stringify(value), value);
    const unclassified = []; const covered = [];
    const containers = new Set(); const iterators = new Map(); const keyViews = new Map();
    const containerKey = (e, path = e.path) => JSON.stringify([e.alias, e.role, e.projection, path]);
    function structural(e, operation, path = e.path) {
        add('nodes', e.alias); add('structural', [e.alias, operation, path]);
    }
    function consumeSequence(e) {
        const indexed = ['next', 'at'].includes(e.operation);
        const path = indexed ? e.path.slice(0, -1) : e.path;
        if (!path.every(field) || indexed && !Number.isSafeInteger(e.path.at(-1))) return false;
        const key = containerKey(e, path); const keys = e.projection === 'keys';
        if (!containers.has(key)) return false;
        if (keys) structural(e, 'keys', path);
        switch (e.operation) {
        case 'iterate':
            if (iterators.has(key) && !iterators.get(key).closed) return false;
            iterators.set(key, { cursor: 0, closed: false, exhausted: false });
            if (!keys) structural(e, 'iterator', path);
            return true;
        case 'next': {
            const iterator = iterators.get(key);
            if (!iterator || e.path.at(-1) !== iterator.cursor) return false;
            if (e.outcome[0] === 'done') {
                // After return(), next() reports done without consulting the
                // remaining members. Only natural exhaustion proves coverage.
                if (!iterator.closed) iterator.exhausted = true;
                if (keys && iterator.exhausted && iterator.cursor !== keyViews.get(key).length) return false;
                iterator.closed = true;
                if (!keys && iterator.exhausted) { structural(e, 'order', path); structural(e, 'cardinality', path); }
            } else {
                if (iterator.closed || e.outcome[0] !== 'scalar') return false;
                if (keys && e.outcome[1] !== keyViews.get(key)[iterator.cursor]) return false;
                iterator.cursor++;
            }
            return true;
        }
        case 'return': {
            const iterator = iterators.get(key);
            if (!iterator || e.outcome[1] !== iterator.cursor) return false;
            if (!iterator.closed && !keys) structural(e, 'early_termination', path);
            iterator.closed = true; return true;
        }
        case 'reuse_iterator': {
            const iterator = iterators.get(key);
            return !!iterator && e.outcome[1] === iterator.cursor && e.outcome[2] === iterator.closed;
        }
        case 'length':
            if (keys && e.outcome[1] !== keyViews.get(key).length) return false;
            if (!keys) structural(e, 'cardinality', path);
            return true;
        case 'includes':
            if (keys && e.outcome[2] !== keyViews.get(key).includes(e.outcome[1])) return false;
            if (!keys) structural(e, 'membership', path);
            return true;
        case 'at':
            if (keys) {
                const list = keyViews.get(key); const index = e.path.at(-1);
                if (index < list.length ? e.outcome[0] !== 'scalar' || e.outcome[1] !== list[index] : e.outcome[0] !== 'absent') return false;
            } else structural(e, 'index', path);
            return true;
        default: return false;
        }
    }
    for (const entry of all.filter(e => e.phase === args.phase)) {
        if (entry.operation === 'traverse') {
            add('edges', entry.outcome[1]);
        } else if (entry.operation === 'get' && entry.projection === 'data'
            && entry.path.length && entry.path.every(field)
            && (['scalar', 'absent'].includes(entry.outcome[0]) || entry.outcome[0] === 'container' && ['record', 'sequence'].includes(entry.outcome[1]))) {
            if (entry.alias === 'claim/context') add('claim_reads', entry.path);
            else { add('nodes', entry.alias); add('reads', [entry.alias, entry.path]); }
            // Count the real record read in the exact set, but do not own its
            // sequence here. Only access_metadata can validate its admitted
            // shape/binding and the observed ancestor navigation.
            if (entry.outcome[0] === 'container' && entry.outcome[1] === 'record') {
                unclassified.push({ sequence: entry.sequence, operation: entry.operation });
                continue;
            }
            if (entry.outcome[0] === 'container') containers.add(containerKey(entry));
        } else if (entry.alias !== 'claim/context' && entry.projection === 'data' && entry.path.every(field)
            && ['has', 'keys'].includes(entry.operation)) {
            structural(entry, entry.operation);
            if (entry.operation === 'keys') {
                const key = containerKey({ ...entry, projection: 'keys' });
                containers.add(key); keyViews.set(key, entry.outcome.slice(1));
            }
        } else if (entry.alias !== 'claim/context' && ['data', 'keys'].includes(entry.projection) && consumeSequence(entry)) {
            // Structural coverage is computed from actual iterator lifecycle.
        } else {
            unclassified.push({ sequence: entry.sequence, operation: entry.operation || entry.measurement });
            continue;
        }
        covered.push(entry.sequence);
    }
    const mismatches = [];
    for (const dimension of Object.keys(expectations)) {
        const wanted = expectations[dimension]; const actual = observed[dimension];
        const missing = [...wanted.keys()].filter(k => !actual.has(k)).sort().map(k => wanted.get(k));
        const extra = [...actual.keys()].filter(k => !wanted.has(k)).sort().map(k => actual.get(k));
        if (missing.length || extra.length) mismatches.push({ dimension, missing, extra });
    }
    return copyData({ stage: 'read_edge_coverage_only', graph_accepted: false,
        matched: mismatches.length === 0 && unclassified.length === 0, mismatches, unclassified, covered_sequences: covered });
}

// Selection-only projection. `bindings` is a host-side association resolved
// before execution from the admitted operand/graph identities, never guessed
// from the selected outcome. This does not validate reads, predicates or R.
function compareSelectionCoverage(input) {
    let args;
    try { args = copyData(input); } catch { fail('input'); }
    if (!exactKeys(args, ['trace', 'expected', 'executionId', 'invocationId', 'phase', 'bindings', 'sets'])
        || !identifier(args.executionId) || !identifier(args.invocationId)
        || !['derivation', 'proof'].includes(args.phase) || !Array.isArray(args.bindings)
        || !args.sets || typeof args.sets !== 'object' || Array.isArray(args.sets)
        || !exactKeys(args.expected, ['required_selections', 'selected_nodes'])) fail('selection_input');
    const all = scopedTrace(args.trace, args.executionId, args.invocationId);
    const pair = value => {
        if (!exactKeys(value, ['candidate_set', 'selected_set'])) fail('selection_expected');
        return [expectedId(value.candidate_set), expectedId(value.selected_set)];
    };
    const required = expectedSet(args.expected.required_selections, pair);
    const selectedExpected = expectedSet(args.expected.selected_nodes, expectedId);
    const sets = new Map(Object.entries(args.sets).map(([name, members]) =>
        [expectedId(name), [...expectedSet(members, expectedId).values()]]));
    const bound = new Map(); const boundPairs = new Set();
    for (const b of args.bindings) {
        if (!exactKeys(b, ['role', 'candidate_set', 'selected_set']) || !identifier(b.role)
            || !identifier(b.candidate_set) || !identifier(b.selected_set)
            || !sets.has(b.candidate_set) || !sets.has(b.selected_set)) fail('selection_binding');
        const key = JSON.stringify([b.candidate_set, b.selected_set]);
        if (bound.has(b.role) || boundPairs.has(key)) fail('selection_binding_duplicate');
        if (!required.has(key)) fail('selection_binding_unexpected');
        boundPairs.add(key);
        bound.set(b.role, { binding: b, key, candidates: sets.get(b.candidate_set),
            state: 'pending', cursor: 0, awaitingDecision: false, selected: [], completed: false });
    }
    if (boundPairs.size !== required.size) fail('selection_binding_missing');
    const authoredUnion = new Set();
    for (const [candidate, selected] of required.values()) {
        if (!sets.has(candidate) || !sets.has(selected)
            || sets.get(selected).some(alias => !sets.get(candidate).includes(alias))) fail('selection_expected');
        for (const alias of sets.get(selected)) authoredUnion.add(JSON.stringify(alias));
    }
    if (authoredUnion.size !== selectedExpected.size || [...authoredUnion].some(key => !selectedExpected.has(key))) fail('selection_union');
    const errors = []; const completed = new Map(); const observedUnion = new Set(); const covered = [];
    const error = (entry, code) => errors.push({ sequence: entry.sequence, code });
    for (const entry of all.filter(e => e.phase === args.phase)) {
        if (!['operand_set', 'operand_selection'].includes(entry.projection)) continue;
        const selectionOperation = entry.operation.startsWith('select_');
        const state = bound.get(entry.role);
        if (!state) { if (selectionOperation) error(entry, 'unbound_selection'); continue; }
        if (entry.projection === 'operand_selection') {
            if (selectionOperation || !state.completed || entry.path[0] !== state.viewId) error(entry, 'unknown_selected_view');
            continue;
        }
        switch (entry.operation) {
        case 'select_start':
            if (state.state !== 'pending') { error(entry, 'repeated_selection'); break; }
            state.state = 'running'; covered.push(entry.sequence); break;
        case 'at':
            if (state.state !== 'running') break;
            if (state.awaitingDecision || entry.path[0] !== state.cursor
                || state.cursor >= state.candidates.length || entry.outcome[0] !== 'node'
                || entry.outcome[1] !== state.candidates[state.cursor]) { error(entry, 'candidate_access'); break; }
            state.awaitingDecision = true; covered.push(entry.sequence); break;
        case 'select_member':
            if (state.state !== 'running' || !state.awaitingDecision || entry.path[0] !== state.cursor
                || entry.outcome[1] !== state.candidates[state.cursor]) { error(entry, 'candidate_decision'); break; }
            if (entry.outcome[2]) state.selected.push(entry.outcome[1]);
            state.cursor++; state.awaitingDecision = false; covered.push(entry.sequence); break;
        case 'select_return': {
            if (state.state !== 'running' || state.awaitingDecision || state.cursor !== state.candidates.length
                || JSON.stringify(entry.outcome.slice(2)) !== JSON.stringify(state.selected)) { error(entry, 'selection_return'); break; }
            state.state = 'complete'; state.completed = true; state.viewId = entry.outcome[1];
            completed.set(state.key, state.selected);
            for (const alias of state.selected) observedUnion.add(alias);
            covered.push(entry.sequence);
            break;
        }
        default:
            if (state.state === 'running') error(entry, 'unexpected_selection_operation');
        }
    }
    const mismatches = [];
    for (const [key, [candidate_set, selected_set]] of required) {
        const actual = completed.get(key);
        if (!actual) { mismatches.push({ candidate_set, selected_set, reason: 'selection_missing' }); continue; }
        const expected = new Set(sets.get(selected_set)); const members = new Set(actual);
        const missing = [...expected].filter(alias => !members.has(alias)).sort();
        const extra = [...members].filter(alias => !expected.has(alias)).sort();
        if (missing.length || extra.length) mismatches.push({ candidate_set, selected_set, reason: 'selection_members', missing, extra });
    }
    const actualIds = [...observedUnion].sort();
    const expectedIds = [...selectedExpected.values()].sort();
    if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) mismatches.push({ reason: 'selected_nodes', actual: actualIds, expected: expectedIds });
    return copyData({ stage: 'selection_coverage_only', graph_accepted: false,
        matched: errors.length === 0 && mismatches.length === 0, errors, mismatches, selected_nodes: actualIds,
        covered_sequences: covered });
}

// Internal component: receives only the selection verdict recomputed below,
// never a caller's certificate. Rosters are admitted role bindings supplied
// BEFORE execution, not inferred from observations or selected members.
function compareOperandConsumption(args, selection) {
    if (!Array.isArray(args.operandSets)) fail('operand_bindings');
    const rosters = new Map(); const views = new Map();
    const key = (role, view = null) => JSON.stringify([role, view]);
    for (const binding of args.operandSets) {
        if (!exactKeys(binding, ['role', 'aliases']) || !identifier(binding.role)
            || !identifier(`operand/${binding.role}`) || !Array.isArray(binding.aliases)
            || binding.aliases.length > 512 || rosters.has(binding.role)) fail('operand_bindings');
        const aliases = [...expectedSet(binding.aliases, expectedId).values()];
        rosters.set(binding.role, aliases);
        views.set(key(binding.role), { aliases, iterator: null });
    }
    for (const binding of args.bindings) {
        if (JSON.stringify(rosters.get(binding.role)) !== JSON.stringify(args.sets[binding.candidate_set])) fail('operand_binding');
    }
    const selectionEvents = new Set(selection.covered_sequences);
    const covered = []; const errors = [];
    const error = (entry, code) => errors.push({ sequence: entry.sequence, code });
    const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
    for (const entry of args.trace[`${args.phase}_trace`]) {
        if (!['operand_set', 'operand_selection'].includes(entry.projection)) continue;
        if (selectionEvents.has(entry.sequence)) {
            if (entry.operation === 'select_return' && selection.matched) {
                views.set(key(entry.role, entry.outcome[1]), { aliases: entry.outcome.slice(2), iterator: null });
            }
            continue; // Selection owns its lifecycle, including candidate at().
        }
        if (entry.operation.startsWith('select_')) continue; // Invalid lifecycle remains an error of selection.
        const selected = entry.projection === 'operand_selection';
        const view = views.get(key(entry.role, selected ? entry.path[0] : null));
        if (!view) { error(entry, selected ? 'unknown_selected_view' : 'unknown_operand_role'); continue; }
        const { aliases } = view; const path = selected ? entry.path.slice(1) : entry.path;
        let valid = false;
        switch (entry.operation) {
        case 'length': valid = same(entry.outcome, ['count', aliases.length]); break;
        case 'includes': valid = same(entry.outcome, ['membership', entry.outcome[1], aliases.includes(entry.outcome[1])]); break;
        case 'at': valid = same(entry.outcome, path[0] < aliases.length ? ['node', aliases[path[0]]] : ['absent']); break;
        case 'iterate':
            // The wire format has no iterator IDs. Never guess the origin of
            // events from concurrent iterators on the same role/view.
            if (view.iterator && !view.iterator.closed) { error(entry, 'ambiguous_iterator'); continue; }
            view.iterator = { cursor: 0, closed: false }; valid = true; break;
        case 'next': {
            const iterator = view.iterator;
            if (!iterator || path[0] !== iterator.cursor) break;
            const done = iterator.closed || iterator.cursor === aliases.length;
            valid = same(entry.outcome, done ? ['done'] : ['node', aliases[iterator.cursor]]);
            if (valid) { if (done) iterator.closed = true; else iterator.cursor++; }
            break;
        }
        case 'return':
            valid = !!view.iterator && same(entry.outcome, ['closed', view.iterator.cursor]);
            if (valid) view.iterator.closed = true;
            break;
        case 'reuse_iterator':
            valid = !!view.iterator && same(entry.outcome, ['cursor', view.iterator.cursor, view.iterator.closed]); break;
        default: break;
        }
        if (valid) covered.push(entry.sequence); else error(entry, 'operand_operation');
    }
    return copyData({ stage: 'operand_consumption_only', graph_accepted: false,
        matched: errors.length === 0, errors, covered_sequences: covered });
}

// Authority here is host-supplied admitted metadata, not the observed values.
// This checks consistency only; it does not authenticate that host/TCB.
function compareAccessMetadata(args) {
    if (!Array.isArray(args.accessBindings)) fail('access_bindings');
    const bindings = new Map();
    const key = (alias, role) => JSON.stringify([alias, role]);
    for (const binding of args.accessBindings) {
        const hasClaimStructure = Object.hasOwn(binding, 'claim_structure');
        if (!exactKeys(binding, ['alias', 'role', 'identity', 'records', ...(hasClaimStructure ? ['claim_structure'] : [])]) || !identifier(binding.alias)
            || !identifier(binding.role) || bindings.has(key(binding.alias, binding.role))) fail('access_bindings');
        if (binding.identity !== null) {
            if (!exactKeys(binding.identity, ['kind', 'ref_id', 'version'])) fail('access_identity');
            for (const name of ['kind', 'ref_id', 'version']) {
                try { decodeObservation(['I', 'identity', binding.alias, binding.role, [name], 'node_identity', ['scalar', binding.identity[name]]]); }
                catch { fail('access_identity'); }
            }
        }
        const records = expectedSet(binding.records, path => {
            if (!Array.isArray(path) || !path.every(field)) fail('access_records');
            return path;
        });
        if (!records.has('[]') || [...records.values()].some(path => path.length && !records.has(JSON.stringify(path.slice(0, -1))))) fail('access_records');
        let claim;
        if (hasClaimStructure) {
            if (binding.alias !== 'claim/context' || binding.identity !== null
                || !exactKeys(binding.claim_structure, ['records', 'sequences'])) fail('claim_structure');
            const recordRows = expectedSet(binding.claim_structure.records, row => {
                if (!exactKeys(row, ['path', 'keys']) || !Array.isArray(row.path) || !row.path.every(field)
                    || !Array.isArray(row.keys) || !row.keys.every(field) || new Set(row.keys).size !== row.keys.length) fail('claim_structure');
                return [row.path, row.keys];
            });
            const recordKeys = new Map();
            for (const [path, keys] of recordRows.values()) {
                const id = JSON.stringify(path);
                if (!records.has(id) || recordKeys.has(id)) fail('claim_structure');
                recordKeys.set(id, keys);
            }
            if (recordKeys.size !== records.size) fail('claim_structure');
            for (const path of records.values()) {
                if (path.length && !recordKeys.get(JSON.stringify(path.slice(0, -1))).includes(path.at(-1))) fail('claim_structure');
            }
            const sequenceRows = expectedSet(binding.claim_structure.sequences, row => {
                if (!exactKeys(row, ['path', 'item_hashes']) || !Array.isArray(row.path) || !row.path.length || !row.path.every(field)
                    || !Array.isArray(row.item_hashes) || row.item_hashes.length > 65536
                    || row.item_hashes.some(hash => typeof hash !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(hash))) fail('claim_structure');
                return [row.path, row.item_hashes];
            });
            const sequences = new Map();
            for (const [path, hashes] of sequenceRows.values()) {
                const id = JSON.stringify(path);
                const parent = JSON.stringify(path.slice(0, -1));
                if (records.has(id) || !records.has(parent) || !recordKeys.get(parent).includes(path.at(-1))
                    || sequences.has(id)) fail('claim_structure');
                sequences.set(id, hashes);
            }
            claim = { recordKeys, sequences, openedSequences: new Set(), keyViews: new Map(), iterators: new Map() };
        }
        bindings.set(key(binding.alias, binding.role), { ...binding, records, claim, opened: new Set(['[]']) });
    }
    const errors = []; const covered = [];
    const error = (entry, code) => errors.push({ sequence: entry.sequence, code });
    function claimStructure(binding, entry) {
        const state = binding.claim; const pathId = JSON.stringify(entry.path);
        if (entry.operation === 'keys' && entry.projection === 'data') {
            if (!binding.opened.has(pathId) || !state.recordKeys.has(pathId)) return false;
            const names = state.recordKeys.get(pathId);
            if (JSON.stringify(entry.outcome) !== JSON.stringify(['keys', ...names])) return false;
            state.keyViews.set(pathId, names.map(name => 'sha256:' + digest(name)));
            return true;
        }
        if (!['data', 'keys'].includes(entry.projection)) return false;
        const indexed = ['at', 'next'].includes(entry.operation);
        const path = indexed ? entry.path.slice(0, -1) : entry.path;
        const id = JSON.stringify(path); const viewId = JSON.stringify([entry.projection, path]);
        const hashes = entry.projection === 'keys' ? state.keyViews.get(id)
            : state.openedSequences.has(id) ? state.sequences.get(id) : undefined;
        if (!hashes) return false;
        const same = value => JSON.stringify(entry.outcome) === JSON.stringify(value);
        const scalarAt = index => index < hashes.length
            ? entry.outcome[0] === 'scalar' && 'sha256:' + digest(entry.outcome[1]) === hashes[index]
            : same(['absent']);
        switch (entry.operation) {
        case 'length': return same(['count', hashes.length]);
        case 'at': return Number.isSafeInteger(entry.path.at(-1)) && entry.path.at(-1) >= 0 && scalarAt(entry.path.at(-1));
        case 'includes': return same(['membership', entry.outcome[1], hashes.includes('sha256:' + digest(entry.outcome[1]))]);
        case 'iterate': {
            const old = state.iterators.get(viewId);
            if (old && !old.closed || !same(['opened'])) return false;
            state.iterators.set(viewId, { cursor: 0, closed: false }); return true;
        }
        case 'next': {
            const iterator = state.iterators.get(viewId);
            if (!iterator || entry.path.at(-1) !== iterator.cursor) return false;
            if (iterator.closed || iterator.cursor === hashes.length) {
                if (!same(['done'])) return false;
                iterator.closed = true; return true;
            }
            if (!scalarAt(iterator.cursor)) return false;
            iterator.cursor++; return true;
        }
        case 'return': {
            const iterator = state.iterators.get(viewId);
            if (!iterator || !same(['closed', iterator.cursor])) return false;
            iterator.closed = true; return true;
        }
        case 'reuse_iterator': {
            const iterator = state.iterators.get(viewId);
            return !!iterator && same(['cursor', iterator.cursor, iterator.closed]);
        }
        default: return false;
        }
    }
    for (const entry of args.trace[`${args.phase}_trace`]) {
        const isIdentity = entry.projection === 'node_identity';
        const isRecordAccess = entry.projection === 'data' && ['get', 'has', 'keys'].includes(entry.operation) && entry.path.every(field);
        const isClaimStructure = entry.alias === 'claim/context'
            && ['keys', 'length', 'at', 'includes', 'iterate', 'next', 'return', 'reuse_iterator'].includes(entry.operation);
        if (!isIdentity && !isRecordAccess && !isClaimStructure) continue;
        const binding = bindings.get(key(entry.alias, entry.role));
        if (!binding) { error(entry, 'unknown_access_binding'); continue; }
        if (isIdentity) {
            if (!binding.identity || binding.identity[entry.path[0]] !== entry.outcome[1]) error(entry, 'identity_mismatch');
            else if (!args.expected.required_nodes.includes(entry.alias)) error(entry, 'identity_node_not_required');
            else covered.push(entry.sequence);
            continue;
        }
        if (isClaimStructure) {
            if (!binding.claim || !claimStructure(binding, entry)) error(entry, 'claim_structure_mismatch');
            else covered.push(entry.sequence);
            continue;
        }
        const parent = entry.operation === 'keys' ? entry.path : entry.path.slice(0, -1);
        if (entry.operation !== 'keys' && !entry.path.length || !binding.opened.has(JSON.stringify(parent))) {
            error(entry, 'record_parent_missing'); continue;
        }
        if (entry.operation !== 'get') continue; // Structural coverage remains with reads/edges.
        const pathKey = JSON.stringify(entry.path);
        const isRecord = entry.outcome[0] === 'container' && entry.outcome[1] === 'record';
        if (isRecord !== binding.records.has(pathKey)) { error(entry, 'record_shape'); continue; }
        if (!isRecord) {
            if (binding.claim && entry.outcome[0] === 'container' && entry.outcome[1] === 'sequence') {
                if (!binding.claim.sequences.has(pathKey)) error(entry, 'claim_sequence_unknown');
                else binding.claim.openedSequences.add(pathKey);
            }
            continue; // The read/edge component owns the leaf/sequence event.
        }
        const required = entry.alias === 'claim/context' ? args.expected.required_claim_reads
            : args.expected.required_reads.filter(read => read.node === entry.alias);
        if (!required.some(read => JSON.stringify(read.segments) === pathKey)) {
            error(entry, 'record_not_required'); continue;
        }
        binding.opened.add(pathKey); covered.push(entry.sequence);
    }
    return copyData({ stage: 'access_metadata_only', graph_accepted: false,
        matched: errors.length === 0, errors, covered_sequences: covered });
}

function compareCivilDates(args) {
    const entries = args.trace[`${args.phase}_trace`]; const covered = []; const errors = [];
    const error = (entry, code) => errors.push({ sequence: entry.sequence, code });
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (entry.operation !== 'civil_date') continue;
        const source = entries[i - 1];
        // The instrumented primitive emits get immediately before civil_date.
        // Do not reuse an older read, normalize its instant string or borrow a
        // read from a different role, path, invocation, phase or global position.
        if (!source || source.sequence + 1 !== entry.sequence || source.operation !== 'get'
            || source.projection !== 'data' || source.alias !== entry.alias || source.role !== entry.role
            || JSON.stringify(source.path) !== JSON.stringify(entry.path)
            || source.outcome[0] !== 'scalar' || source.outcome[1] !== entry.outcome[1]) {
            error(entry, 'civil_source'); continue;
        }
        let date;
        try { date = civilDateInPinnedTimezone(source.outcome[1], entry.outcome[2], entry.outcome[3]); }
        catch { error(entry, 'civil_conversion'); continue; }
        if (date !== entry.outcome[4]) { error(entry, 'civil_result'); continue; }
        covered.push(entry.sequence);
    }
    return copyData({ stage: 'civil_conversion_only', graph_accepted: false,
        matched: errors.length === 0, errors, covered_sequences: covered });
}

// Roots are pre-bound by the host's admission, never copied from the actual
// measurement. This checks observations only; caller-provided root expectations
// cannot authenticate a freeze or mint financial/parent acceptance.
function compareMeasurements(args) {
    const expectations = expectedSet(args.measurements === undefined ? [] : args.measurements, value => {
        if (!exactKeys(value, ['measurement', 'observed'])) fail('measurement_expected');
        try { decodeMeasurement(['M', value.measurement, value.observed]); } catch { fail('measurement_expected'); }
        return [value.measurement, value.observed];
    });
    const names = new Map();
    for (const pair of expectations.values()) {
        if (names.has(pair[0])) fail('measurement_duplicate');
        names.set(pair[0], pair[1]);
    }
    const seen = new Set(); const errors = []; const covered = []; const unclassified = [];
    for (const entry of scopedTrace(args.trace, args.executionId, args.invocationId).filter(row => row.phase === args.phase && row.measurement)) {
        if (!names.has(entry.measurement)) { unclassified.push(entry.sequence); continue; }
        if (seen.has(entry.measurement)) { errors.push({ sequence: entry.sequence, code: 'measurement_repeated' }); continue; }
        seen.add(entry.measurement);
        if (names.get(entry.measurement) !== entry.observed) errors.push({ sequence: entry.sequence, code: 'measurement_root' });
        else covered.push(entry.sequence);
    }
    const missing = [...names.keys()].filter(name => !seen.has(name));
    return copyData({ matched: !errors.length && !missing.length && !unclassified.length,
        errors, missing, unclassified_sequences: unclassified, covered_sequences: covered });
}

// Compose only events actually checked by the components, never their ignored
// projections or caller-supplied verdicts. A local phase match is NOT graph
// acceptance: predicates, host identity, freeze authority and receipts remain out
// of scope. Civil conversion checks the pinned runtime, not its binary root.
// Roster consumption and metadata consistency are distinct from
// payload structural coverage: it cannot discharge a snapshot's required reads.
function comparePhaseCoverage(input) {
    let args;
    try { args = copyData(input); } catch { fail('input'); }
    const keys = ['trace', 'expected', 'executionId', 'invocationId', 'phase', 'sets', 'bindings', 'operandSets', 'accessBindings'];
    if (!exactKeys(args, [...keys, ...(Object.hasOwn(args, 'measurements') ? ['measurements'] : [])])) fail('input');
    const readKeys = ['required_nodes', 'required_reads', 'required_claim_reads', 'required_edges', 'required_structural'];
    const selectionKeys = ['required_selections', 'selected_nodes'];
    if (!exactKeys(args.expected, [...readKeys, ...selectionKeys])) fail('expected');
    const scope = { trace: args.trace, executionId: args.executionId, invocationId: args.invocationId, phase: args.phase };
    const project = keys => Object.fromEntries(keys.map(key => [key, args.expected[key]]));
    const readEdges = compareReadEdgeCoverage({ ...scope, expected: project(readKeys) });
    const selection = compareSelectionCoverage({ ...scope, expected: project(selectionKeys), sets: args.sets, bindings: args.bindings });
    const operandSets = compareOperandConsumption(args, selection);
    const accessMetadata = compareAccessMetadata(args);
    const civilDates = compareCivilDates(args);
    const measurements = compareMeasurements(args);
    const components = { read_edges: readEdges, selection, operand_sets: operandSets, access_metadata: accessMetadata, civil_dates: civilDates, measurements };
    const owners = Object.entries(components).map(([name, component]) => ({ name,
        covered: new Set(component.covered_sequences), invalid: new Set((component.errors || []).map(e => e.sequence)) }));
    // Both components have already admitted the complete, identical trace and
    // execution/invocation/phase scope. Preserve every event's original index.
    const eventCoverage = args.trace[`${args.phase}_trace`].map(entry => {
        const sequence = entry.sequence;
        const covering = owners.filter(owner => owner.covered.has(sequence));
        if (covering.length > 1) fail('projection_overlap');
        const invalid = owners.find(owner => owner.invalid.has(sequence));
        if (invalid) return { sequence, status: 'invalid', component: invalid.name };
        if (covering.length) return { sequence, status: 'covered', component: covering[0].name };
        return { sequence, status: 'unsupported', component: 'none' };
    });
    // readEdges.matched also requires standalone classification of every event;
    // composition discharges those events only via an explicit second owner.
    // Its missing/extra requirements and selection errors remain binding.
    return copyData({ stage: 'phase_coverage_only', graph_accepted: false,
        matched: readEdges.mismatches.length === 0 && selection.matched && operandSets.matched && accessMetadata.matched && civilDates.matched && measurements.matched
            && eventCoverage.every(e => e.status === 'covered'),
        components, event_coverage: eventCoverage });
}

module.exports = { compareReadEdgeCoverage, compareSelectionCoverage, comparePhaseCoverage };

},
function(require, module, exports, __dirname, __filename) {
module.exports={"negative_qualification":true,"profile_witness_qualified":false,"financial_release_eligible":false,"plans":{"C":{"expected_ir_hash":"sha256:65d3ad9303a2f61fdd322a260f8d11aa07e75a0c30c473a3a72ab7eec6cdb102","plan":{"candidate_set":"candidates","expected_ir_hash":"sha256:65d3ad9303a2f61fdd322a260f8d11aa07e75a0c30c473a3a72ab7eec6cdb102","fringe":[{"operand":0,"site":"selection/0/candidate/0/guard/p0055_selected_period","tuple":["I","get","evt_refund_b","proof/set/candidates",["date"],"data",["scalar","2042-06-09"]]},{"operand":null,"site":"selection/0/member/0","tuple":["I","select_member","operand/proof/set/candidates","proof/set/candidates",[0],"operand_set",["decision","evt_refund_b",true]]},{"operand":null,"site":"selection/0/return","tuple":["I","select_return","operand/proof/set/candidates","proof/set/candidates",[],"operand_set",["selected","view_105b2f8bf740cb90755eb7fb0cf0f050456ee336affb477cb995f505c1a45472","evt_refund_b"]]},{"operand":0,"site":"assertion/p0055_selected_period","tuple":["I","get","evt_refund_b","proof/snapshot",["date"],"data",["scalar","2042-06-09"]]}],"guard_count":2,"precommit_hash":"sha256:4617a03d6f53c26df9e281c7aef2883b1e29704d60fe6b41b9a765e37aacec64","profile":"selected-event-day-path/v1","queue":[{"predicate_id":"p0055_selected_period","selection_guard":true,"site":"selection/0/candidate/0/guard/p0055_selected_period","target":true,"truth":true},{"predicate_id":"p0056_selected_state","selection_guard":true,"site":"selection/0/candidate/0/guard/p0056_selected_state","target":false,"truth":true},{"predicate_id":"p0001_kind","selection_guard":false,"site":"assertion/p0001_kind","target":false,"truth":true},{"predicate_id":"p0002_fingerprint","selection_guard":false,"site":"assertion/p0002_fingerprint","target":false,"truth":true},{"predicate_id":"p0008_kind","selection_guard":false,"site":"assertion/p0008_kind","target":false,"truth":true},{"predicate_id":"p0009_fingerprint","selection_guard":false,"site":"assertion/p0009_fingerprint","target":false,"truth":true},{"predicate_id":"p0011_target","selection_guard":false,"site":"assertion/p0011_target","target":false,"truth":true},{"predicate_id":"p0014_kind","selection_guard":false,"site":"assertion/p0014_kind","target":false,"truth":true},{"predicate_id":"p0015_fingerprint","selection_guard":false,"site":"assertion/p0015_fingerprint","target":false,"truth":true},{"predicate_id":"p0018_target","selection_guard":false,"site":"assertion/p0018_target","target":false,"truth":true},{"predicate_id":"p0019_target","selection_guard":false,"site":"assertion/p0019_target","target":false,"truth":true},{"predicate_id":"p0020_target","selection_guard":false,"site":"assertion/p0020_target","target":false,"truth":true},{"predicate_id":"p0023_target","selection_guard":false,"site":"assertion/p0023_target","target":false,"truth":true},{"predicate_id":"p0024_kind","selection_guard":false,"site":"assertion/p0024_kind","target":false,"truth":true},{"predicate_id":"p0025_fingerprint","selection_guard":false,"site":"assertion/p0025_fingerprint","target":false,"truth":true},{"predicate_id":"p0028_target","selection_guard":false,"site":"assertion/p0028_target","target":false,"truth":true},{"predicate_id":"p0029_target","selection_guard":false,"site":"assertion/p0029_target","target":false,"truth":true},{"predicate_id":"p0030_target","selection_guard":false,"site":"assertion/p0030_target","target":false,"truth":true},{"predicate_id":"p0033_kind","selection_guard":false,"site":"assertion/p0033_kind","target":false,"truth":true},{"predicate_id":"p0034_fingerprint","selection_guard":false,"site":"assertion/p0034_fingerprint","target":false,"truth":true},{"predicate_id":"p0036_target","selection_guard":false,"site":"assertion/p0036_target","target":false,"truth":true},{"predicate_id":"p0037_target","selection_guard":false,"site":"assertion/p0037_target","target":false,"truth":true},{"predicate_id":"p0038_kind","selection_guard":false,"site":"assertion/p0038_kind","target":false,"truth":true},{"predicate_id":"p0039_fingerprint","selection_guard":false,"site":"assertion/p0039_fingerprint","target":false,"truth":true},{"predicate_id":"p0043_kind","selection_guard":false,"site":"assertion/p0043_kind","target":false,"truth":true},{"predicate_id":"p0044_fingerprint","selection_guard":false,"site":"assertion/p0044_fingerprint","target":false,"truth":true},{"predicate_id":"p0047_kind","selection_guard":false,"site":"assertion/p0047_kind","target":false,"truth":true},{"predicate_id":"p0048_fingerprint","selection_guard":false,"site":"assertion/p0048_fingerprint","target":false,"truth":true},{"predicate_id":"p0050_target","selection_guard":false,"site":"assertion/p0050_target","target":false,"truth":true},{"predicate_id":"p0051_kind","selection_guard":false,"site":"assertion/p0051_kind","target":false,"truth":true},{"predicate_id":"p0052_fingerprint","selection_guard":false,"site":"assertion/p0052_fingerprint","target":false,"truth":true},{"predicate_id":"p0054_target","selection_guard":false,"site":"assertion/p0054_target","target":false,"truth":true},{"predicate_id":"p0055_selected_period","selection_guard":false,"site":"assertion/p0055_selected_period","target":true,"truth":true},{"predicate_id":"p0056_selected_state","selection_guard":false,"site":"assertion/p0056_selected_state","target":false,"truth":true},{"predicate_id":"link_1_refund_sign","selection_guard":false,"site":"assertion/link_1_refund_sign","target":false,"truth":true},{"predicate_id":"link_2_refund_person","selection_guard":false,"site":"assertion/link_2_refund_person","target":false,"truth":true},{"predicate_id":"link_3_refund_card","selection_guard":false,"site":"assertion/link_3_refund_card","target":false,"truth":true},{"predicate_id":"binding_1","selection_guard":false,"site":"assertion/binding_1","target":false,"truth":true},{"predicate_id":"binding_2","selection_guard":false,"site":"assertion/binding_2","target":false,"truth":true},{"predicate_id":"binding_3","selection_guard":false,"site":"assertion/binding_3","target":false,"truth":true},{"predicate_id":"binding_4","selection_guard":false,"site":"assertion/binding_4","target":false,"truth":true},{"predicate_id":"binding_5","selection_guard":false,"site":"assertion/binding_5","target":false,"truth":true},{"predicate_id":"binding_6","selection_guard":false,"site":"assertion/binding_6","target":false,"truth":true},{"predicate_id":"binding_7","selection_guard":false,"site":"assertion/binding_7","target":false,"truth":true},{"predicate_id":"binding_8","selection_guard":false,"site":"assertion/binding_8","target":false,"truth":true},{"predicate_id":"binding_9","selection_guard":false,"site":"assertion/binding_9","target":false,"truth":true}],"selected_set":"selected","variant":"C"},"plan_hash":"sha256:de0bf84e13041368f4f9112c152cd8e38d3c1b54fd716936df118a029a251f6b"},"M":{"expected_ir_hash":"sha256:8d0803e86f13aea695192e0f62c92cf1e0933740b28cb3e7deb7c8127f31d4ce","plan":{"candidate_set":"candidates","expected_ir_hash":"sha256:8d0803e86f13aea695192e0f62c92cf1e0933740b28cb3e7deb7c8127f31d4ce","fringe":[{"operand":0,"site":"selection/0/candidate/0/guard/p0055_selected_period","tuple":["I","get","evt_restaurant_b","proof/snapshot",["date"],"data",["scalar","2042-06-07"]]},{"operand":null,"site":"selection/0/member/0","tuple":["I","select_member","operand/proof/set/candidates","proof/set/candidates",[0],"operand_set",["decision","evt_refund_b",false]]},{"operand":null,"site":"selection/0/return","tuple":["I","select_return","operand/proof/set/candidates","proof/set/candidates",[],"operand_set",["selected","view_f2f91cc8d8caaeab9aed103e35eadbfc3085b0a69492a29ef7861ae45424b06b"]]},{"operand":0,"site":"assertion/p0055_selected_period","tuple":["I","get","evt_restaurant_b","proof/snapshot",["date"],"data",["scalar","2042-06-07"]]}],"guard_count":2,"precommit_hash":"sha256:4617a03d6f53c26df9e281c7aef2883b1e29704d60fe6b41b9a765e37aacec64","profile":"selected-event-day-path/v1","queue":[{"predicate_id":"p0055_selected_period","selection_guard":true,"site":"selection/0/candidate/0/guard/p0055_selected_period","target":true,"truth":false},{"predicate_id":"p0056_selected_state","selection_guard":true,"site":"selection/0/candidate/0/guard/p0056_selected_state","target":false,"truth":true},{"predicate_id":"p0001_kind","selection_guard":false,"site":"assertion/p0001_kind","target":false,"truth":true},{"predicate_id":"p0002_fingerprint","selection_guard":false,"site":"assertion/p0002_fingerprint","target":false,"truth":true},{"predicate_id":"p0008_kind","selection_guard":false,"site":"assertion/p0008_kind","target":false,"truth":true},{"predicate_id":"p0009_fingerprint","selection_guard":false,"site":"assertion/p0009_fingerprint","target":false,"truth":true},{"predicate_id":"p0011_target","selection_guard":false,"site":"assertion/p0011_target","target":false,"truth":true},{"predicate_id":"p0014_kind","selection_guard":false,"site":"assertion/p0014_kind","target":false,"truth":true},{"predicate_id":"p0015_fingerprint","selection_guard":false,"site":"assertion/p0015_fingerprint","target":false,"truth":true},{"predicate_id":"p0018_target","selection_guard":false,"site":"assertion/p0018_target","target":false,"truth":true},{"predicate_id":"p0019_target","selection_guard":false,"site":"assertion/p0019_target","target":false,"truth":true},{"predicate_id":"p0020_target","selection_guard":false,"site":"assertion/p0020_target","target":false,"truth":true},{"predicate_id":"p0023_target","selection_guard":false,"site":"assertion/p0023_target","target":false,"truth":true},{"predicate_id":"p0024_kind","selection_guard":false,"site":"assertion/p0024_kind","target":false,"truth":true},{"predicate_id":"p0025_fingerprint","selection_guard":false,"site":"assertion/p0025_fingerprint","target":false,"truth":true},{"predicate_id":"p0028_target","selection_guard":false,"site":"assertion/p0028_target","target":false,"truth":true},{"predicate_id":"p0029_target","selection_guard":false,"site":"assertion/p0029_target","target":false,"truth":true},{"predicate_id":"p0030_target","selection_guard":false,"site":"assertion/p0030_target","target":false,"truth":true},{"predicate_id":"p0033_kind","selection_guard":false,"site":"assertion/p0033_kind","target":false,"truth":true},{"predicate_id":"p0034_fingerprint","selection_guard":false,"site":"assertion/p0034_fingerprint","target":false,"truth":true},{"predicate_id":"p0036_target","selection_guard":false,"site":"assertion/p0036_target","target":false,"truth":true},{"predicate_id":"p0037_target","selection_guard":false,"site":"assertion/p0037_target","target":false,"truth":true},{"predicate_id":"p0038_kind","selection_guard":false,"site":"assertion/p0038_kind","target":false,"truth":true},{"predicate_id":"p0039_fingerprint","selection_guard":false,"site":"assertion/p0039_fingerprint","target":false,"truth":true},{"predicate_id":"p0043_kind","selection_guard":false,"site":"assertion/p0043_kind","target":false,"truth":true},{"predicate_id":"p0044_fingerprint","selection_guard":false,"site":"assertion/p0044_fingerprint","target":false,"truth":true},{"predicate_id":"p0047_kind","selection_guard":false,"site":"assertion/p0047_kind","target":false,"truth":true},{"predicate_id":"p0048_fingerprint","selection_guard":false,"site":"assertion/p0048_fingerprint","target":false,"truth":true},{"predicate_id":"p0050_target","selection_guard":false,"site":"assertion/p0050_target","target":false,"truth":true},{"predicate_id":"p0051_kind","selection_guard":false,"site":"assertion/p0051_kind","target":false,"truth":true},{"predicate_id":"p0052_fingerprint","selection_guard":false,"site":"assertion/p0052_fingerprint","target":false,"truth":true},{"predicate_id":"p0054_target","selection_guard":false,"site":"assertion/p0054_target","target":false,"truth":true},{"predicate_id":"p0055_selected_period","selection_guard":false,"site":"assertion/p0055_selected_period","target":true,"truth":false},{"predicate_id":"p0056_selected_state","selection_guard":false,"site":"assertion/p0056_selected_state","target":false,"truth":true},{"predicate_id":"link_1_refund_sign","selection_guard":false,"site":"assertion/link_1_refund_sign","target":false,"truth":true},{"predicate_id":"link_2_refund_person","selection_guard":false,"site":"assertion/link_2_refund_person","target":false,"truth":true},{"predicate_id":"link_3_refund_card","selection_guard":false,"site":"assertion/link_3_refund_card","target":false,"truth":true},{"predicate_id":"binding_1","selection_guard":false,"site":"assertion/binding_1","target":false,"truth":true},{"predicate_id":"binding_2","selection_guard":false,"site":"assertion/binding_2","target":false,"truth":true},{"predicate_id":"binding_3","selection_guard":false,"site":"assertion/binding_3","target":false,"truth":true},{"predicate_id":"binding_4","selection_guard":false,"site":"assertion/binding_4","target":false,"truth":true},{"predicate_id":"binding_5","selection_guard":false,"site":"assertion/binding_5","target":false,"truth":true},{"predicate_id":"binding_6","selection_guard":false,"site":"assertion/binding_6","target":false,"truth":true},{"predicate_id":"binding_7","selection_guard":false,"site":"assertion/binding_7","target":false,"truth":true},{"predicate_id":"binding_8","selection_guard":false,"site":"assertion/binding_8","target":false,"truth":true},{"predicate_id":"binding_9","selection_guard":false,"site":"assertion/binding_9","target":false,"truth":true}],"selected_set":"selected","variant":"M"},"plan_hash":"sha256:9ec6ea0c2b1de4f28961308e45972ed5c89afbb8a1a3ce7f0e5031e58610510c"},"S":{"expected_ir_hash":"sha256:65d3ad9303a2f61fdd322a260f8d11aa07e75a0c30c473a3a72ab7eec6cdb102","plan":{"candidate_set":"candidates","expected_ir_hash":"sha256:65d3ad9303a2f61fdd322a260f8d11aa07e75a0c30c473a3a72ab7eec6cdb102","fringe":[{"operand":0,"site":"selection/0/candidate/0/guard/p0055_selected_period","tuple":["I","get","evt_refund_b","proof/set/candidates",["date"],"data",["scalar","2042-06-09"]]},{"operand":null,"site":"selection/0/member/0","tuple":["I","select_member","operand/proof/set/candidates","proof/set/candidates",[0],"operand_set",["decision","evt_refund_b",true]]},{"operand":null,"site":"selection/0/return","tuple":["I","select_return","operand/proof/set/candidates","proof/set/candidates",[],"operand_set",["selected","view_105b2f8bf740cb90755eb7fb0cf0f050456ee336affb477cb995f505c1a45472","evt_refund_b"]]},{"operand":0,"site":"assertion/p0055_selected_period","tuple":["I","get","evt_refund_b","proof/snapshot",["date"],"data",["scalar","2042-06-09"]]}],"guard_count":2,"precommit_hash":"sha256:4617a03d6f53c26df9e281c7aef2883b1e29704d60fe6b41b9a765e37aacec64","profile":"selected-event-day-path/v1","queue":[{"predicate_id":"p0055_selected_period","selection_guard":true,"site":"selection/0/candidate/0/guard/p0055_selected_period","target":true,"truth":true},{"predicate_id":"p0056_selected_state","selection_guard":true,"site":"selection/0/candidate/0/guard/p0056_selected_state","target":false,"truth":true},{"predicate_id":"p0001_kind","selection_guard":false,"site":"assertion/p0001_kind","target":false,"truth":true},{"predicate_id":"p0002_fingerprint","selection_guard":false,"site":"assertion/p0002_fingerprint","target":false,"truth":true},{"predicate_id":"p0008_kind","selection_guard":false,"site":"assertion/p0008_kind","target":false,"truth":true},{"predicate_id":"p0009_fingerprint","selection_guard":false,"site":"assertion/p0009_fingerprint","target":false,"truth":true},{"predicate_id":"p0011_target","selection_guard":false,"site":"assertion/p0011_target","target":false,"truth":true},{"predicate_id":"p0014_kind","selection_guard":false,"site":"assertion/p0014_kind","target":false,"truth":true},{"predicate_id":"p0015_fingerprint","selection_guard":false,"site":"assertion/p0015_fingerprint","target":false,"truth":true},{"predicate_id":"p0018_target","selection_guard":false,"site":"assertion/p0018_target","target":false,"truth":true},{"predicate_id":"p0019_target","selection_guard":false,"site":"assertion/p0019_target","target":false,"truth":true},{"predicate_id":"p0020_target","selection_guard":false,"site":"assertion/p0020_target","target":false,"truth":true},{"predicate_id":"p0023_target","selection_guard":false,"site":"assertion/p0023_target","target":false,"truth":true},{"predicate_id":"p0024_kind","selection_guard":false,"site":"assertion/p0024_kind","target":false,"truth":true},{"predicate_id":"p0025_fingerprint","selection_guard":false,"site":"assertion/p0025_fingerprint","target":false,"truth":true},{"predicate_id":"p0028_target","selection_guard":false,"site":"assertion/p0028_target","target":false,"truth":true},{"predicate_id":"p0029_target","selection_guard":false,"site":"assertion/p0029_target","target":false,"truth":true},{"predicate_id":"p0030_target","selection_guard":false,"site":"assertion/p0030_target","target":false,"truth":true},{"predicate_id":"p0033_kind","selection_guard":false,"site":"assertion/p0033_kind","target":false,"truth":true},{"predicate_id":"p0034_fingerprint","selection_guard":false,"site":"assertion/p0034_fingerprint","target":false,"truth":true},{"predicate_id":"p0036_target","selection_guard":false,"site":"assertion/p0036_target","target":false,"truth":true},{"predicate_id":"p0037_target","selection_guard":false,"site":"assertion/p0037_target","target":false,"truth":true},{"predicate_id":"p0038_kind","selection_guard":false,"site":"assertion/p0038_kind","target":false,"truth":true},{"predicate_id":"p0039_fingerprint","selection_guard":false,"site":"assertion/p0039_fingerprint","target":false,"truth":true},{"predicate_id":"p0043_kind","selection_guard":false,"site":"assertion/p0043_kind","target":false,"truth":true},{"predicate_id":"p0044_fingerprint","selection_guard":false,"site":"assertion/p0044_fingerprint","target":false,"truth":true},{"predicate_id":"p0047_kind","selection_guard":false,"site":"assertion/p0047_kind","target":false,"truth":true},{"predicate_id":"p0048_fingerprint","selection_guard":false,"site":"assertion/p0048_fingerprint","target":false,"truth":true},{"predicate_id":"p0050_target","selection_guard":false,"site":"assertion/p0050_target","target":false,"truth":true},{"predicate_id":"p0051_kind","selection_guard":false,"site":"assertion/p0051_kind","target":false,"truth":true},{"predicate_id":"p0052_fingerprint","selection_guard":false,"site":"assertion/p0052_fingerprint","target":false,"truth":true},{"predicate_id":"p0054_target","selection_guard":false,"site":"assertion/p0054_target","target":false,"truth":true},{"predicate_id":"p0055_selected_period","selection_guard":false,"site":"assertion/p0055_selected_period","target":true,"truth":true},{"predicate_id":"p0056_selected_state","selection_guard":false,"site":"assertion/p0056_selected_state","target":false,"truth":true},{"predicate_id":"link_1_refund_sign","selection_guard":false,"site":"assertion/link_1_refund_sign","target":false,"truth":true},{"predicate_id":"link_2_refund_person","selection_guard":false,"site":"assertion/link_2_refund_person","target":false,"truth":true},{"predicate_id":"link_3_refund_card","selection_guard":false,"site":"assertion/link_3_refund_card","target":false,"truth":true},{"predicate_id":"binding_1","selection_guard":false,"site":"assertion/binding_1","target":false,"truth":true},{"predicate_id":"binding_2","selection_guard":false,"site":"assertion/binding_2","target":false,"truth":true},{"predicate_id":"binding_3","selection_guard":false,"site":"assertion/binding_3","target":false,"truth":true},{"predicate_id":"binding_4","selection_guard":false,"site":"assertion/binding_4","target":false,"truth":true},{"predicate_id":"binding_5","selection_guard":false,"site":"assertion/binding_5","target":false,"truth":true},{"predicate_id":"binding_6","selection_guard":false,"site":"assertion/binding_6","target":false,"truth":true},{"predicate_id":"binding_7","selection_guard":false,"site":"assertion/binding_7","target":false,"truth":true},{"predicate_id":"binding_8","selection_guard":false,"site":"assertion/binding_8","target":false,"truth":true},{"predicate_id":"binding_9","selection_guard":false,"site":"assertion/binding_9","target":false,"truth":true}],"selected_set":"selected","variant":"S"},"plan_hash":"sha256:7c9046f8b9a490572b19987049017d38977f04afc5ad26815ad2bcfcd9114c08"}},"oracle":{"core_claim":{"claim_id":"claim-F-06#2#1","fact_key":"F-06#2#1","metric":"refund_amount","unit":"BRL_minor","subject":{"kind":"event","ref_id":"evt-refund-b"},"period":{"kind":"date","value":"2042-06-09"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"refund_amount","evaluator_version":1}},"core_claim_shape":{"type":"record","fields":{"claim_id":{"type":"scalar"},"fact_key":{"type":"scalar"},"metric":{"type":"scalar"},"unit":{"type":"scalar"},"subject":{"type":"record","fields":{"kind":{"type":"scalar"},"ref_id":{"type":"scalar"}}},"period":{"type":"record","fields":{"kind":{"type":"scalar"},"value":{"type":"scalar"}}},"time_basis":{"type":"scalar"},"coverage":{"type":"scalar"},"evidence_state":{"type":"scalar"},"filters":{"type":"record","fields":{"budget_class":{"type":"scalar"}}},"evaluator_ref":{"type":"record","fields":{"evaluator_id":{"type":"scalar"},"evaluator_version":{"type":"scalar"}}}}},"core_claim_hash":"sha256:ab02d9f8e1526129f06f7c03e6d04fd22be6bbf654f748d816d400116847df44","claim_document_sha256":"sha256:4810612761ea7f232e4445c0d192ae53ebf0761f0ba8752da758efb826b30494","claim_schema_sha256":"sha256:b69ef61b562061f057a9bf08f47623ae432c723f565e8775f3dbe6eb942ea998","registry_sha256":"sha256:a1fde4b01b9f68bdd2550305305ca2ffe8f750af0351b29b12bf3bb5afdb3c88","evaluator_contract_sha256":"sha256:2dafc200e53dfa069e3b7e12d42c0ead14db1f2b020768ec5fd2a6fcda4c515c","operand_bindings_hash":"sha256:8291e73b201117c00f86df7ac3e642449a6ccfc550047ca0f9a422ea1ef0c85f","result_signature":{"unit":"BRL_minor","kind":"money_minor"},"fact_key":"F-06#2#1","source_path":"tests/fixtures/financasbot-next/golden-claim-oracles-v1.json","source_sha256":"sha256:0e68ed70b10fdde5c90dc14aa3caf2ef72a4842bbbc6db8779287900567994d8","expected_result":{"kind":"money_minor","unit":"BRL_minor","value":4500},"expected_result_sha256":"sha256:568bcbe13682dd5942aafe9ef55bd73a9ec5292a73796e4f3b7538770f007488","stage":"selected_day_original_oracle_sealed_only","profile_witness_qualified":false,"semantic_mutation_credit":0},"coverage":{"C":{"derivation":{"expected":{"required_nodes":["evt_refund_b","evt_restaurant_b","food_restaurant","neutral_refund","person_b"],"required_reads":[{"node":"evt_refund_b","segments":["id"]},{"node":"evt_refund_b","segments":["date"]},{"node":"evt_refund_b","segments":["state"]},{"node":"evt_refund_b","segments":["person_id"]},{"node":"evt_refund_b","segments":["category_id"]},{"node":"person_b","segments":["id"]},{"node":"neutral_refund","segments":["id"]},{"node":"neutral_refund","segments":["kind"]},{"node":"evt_refund_b","segments":["compensates"]},{"node":"evt_restaurant_b","segments":["id"]},{"node":"evt_restaurant_b","segments":["state"]},{"node":"evt_restaurant_b","segments":["person_id"]},{"node":"evt_restaurant_b","segments":["category_id"]},{"node":"food_restaurant","segments":["id"]},{"node":"food_restaurant","segments":["kind"]},{"node":"evt_refund_b","segments":["amount_minor"]}],"required_claim_reads":[{"segments":["period"]},{"segments":["subject"]},{"segments":["subject","kind"]},{"segments":["subject","ref_id"]},{"segments":["period","kind"]},{"segments":["period","value"]},{"segments":["time_basis"]}],"required_edges":["e0002","e0004","e0005","e0008"],"required_structural":[],"selected_nodes":["evt_refund_b"],"required_selections":[{"candidate_set":"candidates","selected_set":"selected"}]},"sets":{"candidates":["evt_refund_b"],"selected":["evt_refund_b"]},"bindings":[{"role":"events","candidate_set":"candidates","selected_set":"selected"}],"operandSets":[{"role":"events","aliases":["evt_refund_b"]}],"accessBindings":[{"alias":"claim/context","role":"context","identity":null,"records":[[],["subject"],["period"],["evaluator_ref"]],"claim_structure":{"records":[{"path":[],"keys":["claim_id","fact_key","metric","unit","subject","period","time_basis","coverage","evidence_state","evaluator_ref"]},{"path":["subject"],"keys":["kind","ref_id"]},{"path":["period"],"keys":["kind","value"]},{"path":["evaluator_ref"],"keys":["evaluator_id","evaluator_version"]}],"sequences":[]}},{"alias":"evt_refund_b","role":"events","identity":{"kind":"event","ref_id":"evt-refund-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_b","role":"events","identity":{"kind":"person","ref_id":"person-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"card_green","role":"events","identity":{"kind":"card","ref_id":"card-green","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"neutral_refund","role":"events","identity":{"kind":"category","ref_id":"neutral.refund","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_restaurant_b","role":"events","identity":{"kind":"event","ref_id":"evt-restaurant-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"family_example","role":"events","identity":{"kind":"family","ref_id":"family-example","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"food_restaurant","role":"events","identity":{"kind":"category","ref_id":"food.restaurant","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_a","role":"events","identity":{"kind":"person","ref_id":"person-a","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]}]},"proof":{"expected":{"required_nodes":["next_golden_financial_v1","card_green","evt_refund_b","evt_restaurant_b","family_example","food_restaurant","neutral_refund","person_a","person_b"],"required_reads":[{"node":"next_golden_financial_v1","segments":["id"]},{"node":"next_golden_financial_v1","segments":["synthetic"]},{"node":"next_golden_financial_v1","segments":["closed_world"]},{"node":"next_golden_financial_v1","segments":["currency"]},{"node":"next_golden_financial_v1","segments":["fixed_clock"]},{"node":"card_green","segments":["id"]},{"node":"card_green","segments":["owner_id"]},{"node":"card_green","segments":["closing_day"]},{"node":"card_green","segments":["due_day"]},{"node":"evt_refund_b","segments":["id"]},{"node":"evt_refund_b","segments":["date"]},{"node":"evt_refund_b","segments":["person_id"]},{"node":"evt_refund_b","segments":["card_id"]},{"node":"evt_refund_b","segments":["category_id"]},{"node":"evt_refund_b","segments":["amount_minor"]},{"node":"evt_refund_b","segments":["state"]},{"node":"evt_refund_b","segments":["compensates"]},{"node":"evt_restaurant_b","segments":["id"]},{"node":"evt_restaurant_b","segments":["date"]},{"node":"evt_restaurant_b","segments":["person_id"]},{"node":"evt_restaurant_b","segments":["card_id"]},{"node":"evt_restaurant_b","segments":["category_id"]},{"node":"evt_restaurant_b","segments":["amount_minor"]},{"node":"evt_restaurant_b","segments":["state"]},{"node":"family_example","segments":["id"]},{"node":"family_example","segments":["members"]},{"node":"food_restaurant","segments":["id"]},{"node":"food_restaurant","segments":["kind"]},{"node":"food_restaurant","segments":["budget_class"]},{"node":"neutral_refund","segments":["id"]},{"node":"neutral_refund","segments":["kind"]},{"node":"person_a","segments":["id"]},{"node":"person_a","segments":["family_id"]},{"node":"person_b","segments":["id"]},{"node":"person_b","segments":["family_id"]}],"required_claim_reads":[{"segments":["evaluator_ref"]},{"segments":["period"]},{"segments":["subject"]},{"segments":["claim_id"]},{"segments":["fact_key"]},{"segments":["metric"]},{"segments":["unit"]},{"segments":["subject","kind"]},{"segments":["subject","ref_id"]},{"segments":["period","kind"]},{"segments":["period","value"]},{"segments":["time_basis"]},{"segments":["coverage"]},{"segments":["evidence_state"]},{"segments":["evaluator_ref","evaluator_id"]},{"segments":["evaluator_ref","evaluator_version"]}],"required_edges":["e0001","e0002","e0003","e0004","e0005","e0006","e0007","e0008","e0009","e0010","e0011","e0012"],"required_structural":[{"node":"next_golden_financial_v1","operation":"keys","segments":[]},{"node":"card_green","operation":"keys","segments":[]},{"node":"evt_refund_b","operation":"keys","segments":[]},{"node":"evt_restaurant_b","operation":"keys","segments":[]},{"node":"family_example","operation":"iterator","segments":["members"]},{"node":"family_example","operation":"cardinality","segments":["members"]},{"node":"family_example","operation":"order","segments":["members"]},{"node":"family_example","operation":"keys","segments":[]},{"node":"food_restaurant","operation":"keys","segments":[]},{"node":"neutral_refund","operation":"keys","segments":[]},{"node":"person_a","operation":"keys","segments":[]},{"node":"person_b","operation":"keys","segments":[]}],"selected_nodes":["evt_refund_b"],"required_selections":[{"candidate_set":"candidates","selected_set":"selected"}]},"sets":{"candidates":["evt_refund_b"],"selected":["evt_refund_b"]},"bindings":[{"role":"proof/set/candidates","candidate_set":"candidates","selected_set":"selected"}],"operandSets":[{"role":"proof/set/candidates","aliases":["evt_refund_b"]}],"accessBindings":[{"alias":"next_golden_financial_v1","role":"proof/snapshot","identity":{"kind":"fixture","ref_id":"NEXT-GOLDEN-FINANCIAL-V1","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"card_green","role":"proof/snapshot","identity":{"kind":"card","ref_id":"card-green","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_refund_b","role":"proof/snapshot","identity":{"kind":"event","ref_id":"evt-refund-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_restaurant_b","role":"proof/snapshot","identity":{"kind":"event","ref_id":"evt-restaurant-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"family_example","role":"proof/snapshot","identity":{"kind":"family","ref_id":"family-example","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"food_restaurant","role":"proof/snapshot","identity":{"kind":"category","ref_id":"food.restaurant","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"neutral_refund","role":"proof/snapshot","identity":{"kind":"category","ref_id":"neutral.refund","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_a","role":"proof/snapshot","identity":{"kind":"person","ref_id":"person-a","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_b","role":"proof/snapshot","identity":{"kind":"person","ref_id":"person-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"claim/context","role":"proof/context","identity":null,"records":[[],["subject"],["period"],["evaluator_ref"]],"claim_structure":{"records":[{"path":[],"keys":["claim_id","fact_key","metric","unit","subject","period","time_basis","coverage","evidence_state","evaluator_ref"]},{"path":["subject"],"keys":["kind","ref_id"]},{"path":["period"],"keys":["kind","value"]},{"path":["evaluator_ref"],"keys":["evaluator_id","evaluator_version"]}],"sequences":[]}},{"alias":"next_golden_financial_v1","role":"proof/set/candidates","identity":{"kind":"fixture","ref_id":"NEXT-GOLDEN-FINANCIAL-V1","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"card_green","role":"proof/set/candidates","identity":{"kind":"card","ref_id":"card-green","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_refund_b","role":"proof/set/candidates","identity":{"kind":"event","ref_id":"evt-refund-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_restaurant_b","role":"proof/set/candidates","identity":{"kind":"event","ref_id":"evt-restaurant-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"family_example","role":"proof/set/candidates","identity":{"kind":"family","ref_id":"family-example","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"food_restaurant","role":"proof/set/candidates","identity":{"kind":"category","ref_id":"food.restaurant","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"neutral_refund","role":"proof/set/candidates","identity":{"kind":"category","ref_id":"neutral.refund","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_a","role":"proof/set/candidates","identity":{"kind":"person","ref_id":"person-a","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_b","role":"proof/set/candidates","identity":{"kind":"person","ref_id":"person-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]}]}},"M":{"derivation":{"expected":{"required_nodes":["evt_refund_b","evt_restaurant_b","food_restaurant","neutral_refund","person_b"],"required_reads":[{"node":"evt_refund_b","segments":["id"]},{"node":"evt_refund_b","segments":["date"]},{"node":"evt_refund_b","segments":["state"]},{"node":"evt_refund_b","segments":["person_id"]},{"node":"evt_refund_b","segments":["category_id"]},{"node":"person_b","segments":["id"]},{"node":"neutral_refund","segments":["id"]},{"node":"neutral_refund","segments":["kind"]},{"node":"evt_refund_b","segments":["compensates"]},{"node":"evt_restaurant_b","segments":["id"]},{"node":"evt_restaurant_b","segments":["state"]},{"node":"evt_restaurant_b","segments":["person_id"]},{"node":"evt_restaurant_b","segments":["category_id"]},{"node":"food_restaurant","segments":["id"]},{"node":"food_restaurant","segments":["kind"]},{"node":"evt_refund_b","segments":["amount_minor"]}],"required_claim_reads":[{"segments":["period"]},{"segments":["subject"]},{"segments":["subject","kind"]},{"segments":["subject","ref_id"]},{"segments":["period","kind"]},{"segments":["period","value"]},{"segments":["time_basis"]}],"required_edges":["e0002","e0004","e0005","e0008"],"required_structural":[],"selected_nodes":["evt_refund_b"],"required_selections":[{"candidate_set":"candidates","selected_set":"selected"}]},"sets":{"candidates":["evt_refund_b"],"selected":["evt_refund_b"]},"bindings":[{"role":"events","candidate_set":"candidates","selected_set":"selected"}],"operandSets":[{"role":"events","aliases":["evt_refund_b"]}],"accessBindings":[{"alias":"claim/context","role":"context","identity":null,"records":[[],["subject"],["period"],["evaluator_ref"]],"claim_structure":{"records":[{"path":[],"keys":["claim_id","fact_key","metric","unit","subject","period","time_basis","coverage","evidence_state","evaluator_ref"]},{"path":["subject"],"keys":["kind","ref_id"]},{"path":["period"],"keys":["kind","value"]},{"path":["evaluator_ref"],"keys":["evaluator_id","evaluator_version"]}],"sequences":[]}},{"alias":"evt_refund_b","role":"events","identity":{"kind":"event","ref_id":"evt-refund-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_b","role":"events","identity":{"kind":"person","ref_id":"person-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"card_green","role":"events","identity":{"kind":"card","ref_id":"card-green","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"neutral_refund","role":"events","identity":{"kind":"category","ref_id":"neutral.refund","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_restaurant_b","role":"events","identity":{"kind":"event","ref_id":"evt-restaurant-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"family_example","role":"events","identity":{"kind":"family","ref_id":"family-example","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"food_restaurant","role":"events","identity":{"kind":"category","ref_id":"food.restaurant","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_a","role":"events","identity":{"kind":"person","ref_id":"person-a","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]}]},"proof":{"expected":{"required_nodes":["next_golden_financial_v1","card_green","evt_refund_b","evt_restaurant_b","family_example","food_restaurant","neutral_refund","person_a","person_b"],"required_reads":[{"node":"next_golden_financial_v1","segments":["id"]},{"node":"next_golden_financial_v1","segments":["synthetic"]},{"node":"next_golden_financial_v1","segments":["closed_world"]},{"node":"next_golden_financial_v1","segments":["currency"]},{"node":"next_golden_financial_v1","segments":["fixed_clock"]},{"node":"card_green","segments":["id"]},{"node":"card_green","segments":["owner_id"]},{"node":"card_green","segments":["closing_day"]},{"node":"card_green","segments":["due_day"]},{"node":"evt_refund_b","segments":["id"]},{"node":"evt_refund_b","segments":["date"]},{"node":"evt_refund_b","segments":["person_id"]},{"node":"evt_refund_b","segments":["card_id"]},{"node":"evt_refund_b","segments":["category_id"]},{"node":"evt_refund_b","segments":["amount_minor"]},{"node":"evt_refund_b","segments":["state"]},{"node":"evt_refund_b","segments":["compensates"]},{"node":"evt_restaurant_b","segments":["id"]},{"node":"evt_restaurant_b","segments":["date"]},{"node":"evt_restaurant_b","segments":["person_id"]},{"node":"evt_restaurant_b","segments":["card_id"]},{"node":"evt_restaurant_b","segments":["category_id"]},{"node":"evt_restaurant_b","segments":["amount_minor"]},{"node":"evt_restaurant_b","segments":["state"]},{"node":"family_example","segments":["id"]},{"node":"family_example","segments":["members"]},{"node":"food_restaurant","segments":["id"]},{"node":"food_restaurant","segments":["kind"]},{"node":"food_restaurant","segments":["budget_class"]},{"node":"neutral_refund","segments":["id"]},{"node":"neutral_refund","segments":["kind"]},{"node":"person_a","segments":["id"]},{"node":"person_a","segments":["family_id"]},{"node":"person_b","segments":["id"]},{"node":"person_b","segments":["family_id"]}],"required_claim_reads":[{"segments":["evaluator_ref"]},{"segments":["period"]},{"segments":["subject"]},{"segments":["claim_id"]},{"segments":["fact_key"]},{"segments":["metric"]},{"segments":["unit"]},{"segments":["subject","kind"]},{"segments":["subject","ref_id"]},{"segments":["period","kind"]},{"segments":["period","value"]},{"segments":["time_basis"]},{"segments":["coverage"]},{"segments":["evidence_state"]},{"segments":["evaluator_ref","evaluator_id"]},{"segments":["evaluator_ref","evaluator_version"]}],"required_edges":["e0001","e0002","e0003","e0004","e0005","e0006","e0007","e0008","e0009","e0010","e0011","e0012"],"required_structural":[{"node":"next_golden_financial_v1","operation":"keys","segments":[]},{"node":"card_green","operation":"keys","segments":[]},{"node":"evt_refund_b","operation":"keys","segments":[]},{"node":"evt_restaurant_b","operation":"keys","segments":[]},{"node":"family_example","operation":"iterator","segments":["members"]},{"node":"family_example","operation":"cardinality","segments":["members"]},{"node":"family_example","operation":"order","segments":["members"]},{"node":"family_example","operation":"keys","segments":[]},{"node":"food_restaurant","operation":"keys","segments":[]},{"node":"neutral_refund","operation":"keys","segments":[]},{"node":"person_a","operation":"keys","segments":[]},{"node":"person_b","operation":"keys","segments":[]}],"selected_nodes":[],"required_selections":[{"candidate_set":"candidates","selected_set":"selected"}]},"sets":{"candidates":["evt_refund_b"],"selected":[]},"bindings":[{"role":"proof/set/candidates","candidate_set":"candidates","selected_set":"selected"}],"operandSets":[{"role":"proof/set/candidates","aliases":["evt_refund_b"]}],"accessBindings":[{"alias":"next_golden_financial_v1","role":"proof/snapshot","identity":{"kind":"fixture","ref_id":"NEXT-GOLDEN-FINANCIAL-V1","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"card_green","role":"proof/snapshot","identity":{"kind":"card","ref_id":"card-green","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_refund_b","role":"proof/snapshot","identity":{"kind":"event","ref_id":"evt-refund-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_restaurant_b","role":"proof/snapshot","identity":{"kind":"event","ref_id":"evt-restaurant-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"family_example","role":"proof/snapshot","identity":{"kind":"family","ref_id":"family-example","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"food_restaurant","role":"proof/snapshot","identity":{"kind":"category","ref_id":"food.restaurant","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"neutral_refund","role":"proof/snapshot","identity":{"kind":"category","ref_id":"neutral.refund","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_a","role":"proof/snapshot","identity":{"kind":"person","ref_id":"person-a","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_b","role":"proof/snapshot","identity":{"kind":"person","ref_id":"person-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"claim/context","role":"proof/context","identity":null,"records":[[],["subject"],["period"],["evaluator_ref"]],"claim_structure":{"records":[{"path":[],"keys":["claim_id","fact_key","metric","unit","subject","period","time_basis","coverage","evidence_state","evaluator_ref"]},{"path":["subject"],"keys":["kind","ref_id"]},{"path":["period"],"keys":["kind","value"]},{"path":["evaluator_ref"],"keys":["evaluator_id","evaluator_version"]}],"sequences":[]}},{"alias":"next_golden_financial_v1","role":"proof/set/candidates","identity":{"kind":"fixture","ref_id":"NEXT-GOLDEN-FINANCIAL-V1","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"card_green","role":"proof/set/candidates","identity":{"kind":"card","ref_id":"card-green","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_refund_b","role":"proof/set/candidates","identity":{"kind":"event","ref_id":"evt-refund-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_restaurant_b","role":"proof/set/candidates","identity":{"kind":"event","ref_id":"evt-restaurant-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"family_example","role":"proof/set/candidates","identity":{"kind":"family","ref_id":"family-example","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"food_restaurant","role":"proof/set/candidates","identity":{"kind":"category","ref_id":"food.restaurant","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"neutral_refund","role":"proof/set/candidates","identity":{"kind":"category","ref_id":"neutral.refund","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_a","role":"proof/set/candidates","identity":{"kind":"person","ref_id":"person-a","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_b","role":"proof/set/candidates","identity":{"kind":"person","ref_id":"person-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]}]}},"S":{"derivation":{"expected":{"required_nodes":["evt_refund_b","evt_restaurant_b","food_restaurant","neutral_refund","person_b"],"required_reads":[{"node":"evt_refund_b","segments":["id"]},{"node":"evt_refund_b","segments":["date"]},{"node":"evt_refund_b","segments":["state"]},{"node":"evt_refund_b","segments":["person_id"]},{"node":"evt_refund_b","segments":["category_id"]},{"node":"person_b","segments":["id"]},{"node":"neutral_refund","segments":["id"]},{"node":"neutral_refund","segments":["kind"]},{"node":"evt_refund_b","segments":["compensates"]},{"node":"evt_restaurant_b","segments":["id"]},{"node":"evt_restaurant_b","segments":["state"]},{"node":"evt_restaurant_b","segments":["person_id"]},{"node":"evt_restaurant_b","segments":["category_id"]},{"node":"food_restaurant","segments":["id"]},{"node":"food_restaurant","segments":["kind"]},{"node":"evt_refund_b","segments":["amount_minor"]}],"required_claim_reads":[{"segments":["period"]},{"segments":["subject"]},{"segments":["subject","kind"]},{"segments":["subject","ref_id"]},{"segments":["period","kind"]},{"segments":["period","value"]},{"segments":["time_basis"]}],"required_edges":["e0002","e0004","e0005","e0008"],"required_structural":[],"selected_nodes":["evt_refund_b"],"required_selections":[{"candidate_set":"candidates","selected_set":"selected"}]},"sets":{"candidates":["evt_refund_b"],"selected":["evt_refund_b"]},"bindings":[{"role":"events","candidate_set":"candidates","selected_set":"selected"}],"operandSets":[{"role":"events","aliases":["evt_refund_b"]}],"accessBindings":[{"alias":"claim/context","role":"context","identity":null,"records":[[],["subject"],["period"],["evaluator_ref"]],"claim_structure":{"records":[{"path":[],"keys":["claim_id","fact_key","metric","unit","subject","period","time_basis","coverage","evidence_state","evaluator_ref"]},{"path":["subject"],"keys":["kind","ref_id"]},{"path":["period"],"keys":["kind","value"]},{"path":["evaluator_ref"],"keys":["evaluator_id","evaluator_version"]}],"sequences":[]}},{"alias":"evt_refund_b","role":"events","identity":{"kind":"event","ref_id":"evt-refund-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_b","role":"events","identity":{"kind":"person","ref_id":"person-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"card_green","role":"events","identity":{"kind":"card","ref_id":"card-green","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"neutral_refund","role":"events","identity":{"kind":"category","ref_id":"neutral.refund","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_restaurant_b","role":"events","identity":{"kind":"event","ref_id":"evt-restaurant-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"family_example","role":"events","identity":{"kind":"family","ref_id":"family-example","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"food_restaurant","role":"events","identity":{"kind":"category","ref_id":"food.restaurant","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_a","role":"events","identity":{"kind":"person","ref_id":"person-a","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]}]},"proof":{"expected":{"required_nodes":["next_golden_financial_v1","card_green","evt_refund_b","evt_restaurant_b","family_example","food_restaurant","neutral_refund","person_a","person_b"],"required_reads":[{"node":"next_golden_financial_v1","segments":["id"]},{"node":"next_golden_financial_v1","segments":["synthetic"]},{"node":"next_golden_financial_v1","segments":["closed_world"]},{"node":"next_golden_financial_v1","segments":["currency"]},{"node":"next_golden_financial_v1","segments":["fixed_clock"]},{"node":"card_green","segments":["id"]},{"node":"card_green","segments":["owner_id"]},{"node":"card_green","segments":["closing_day"]},{"node":"card_green","segments":["due_day"]},{"node":"evt_refund_b","segments":["id"]},{"node":"evt_refund_b","segments":["date"]},{"node":"evt_refund_b","segments":["person_id"]},{"node":"evt_refund_b","segments":["card_id"]},{"node":"evt_refund_b","segments":["category_id"]},{"node":"evt_refund_b","segments":["amount_minor"]},{"node":"evt_refund_b","segments":["state"]},{"node":"evt_refund_b","segments":["compensates"]},{"node":"evt_restaurant_b","segments":["id"]},{"node":"evt_restaurant_b","segments":["date"]},{"node":"evt_restaurant_b","segments":["person_id"]},{"node":"evt_restaurant_b","segments":["card_id"]},{"node":"evt_restaurant_b","segments":["category_id"]},{"node":"evt_restaurant_b","segments":["amount_minor"]},{"node":"evt_restaurant_b","segments":["state"]},{"node":"family_example","segments":["id"]},{"node":"family_example","segments":["members"]},{"node":"food_restaurant","segments":["id"]},{"node":"food_restaurant","segments":["kind"]},{"node":"food_restaurant","segments":["budget_class"]},{"node":"neutral_refund","segments":["id"]},{"node":"neutral_refund","segments":["kind"]},{"node":"person_a","segments":["id"]},{"node":"person_a","segments":["family_id"]},{"node":"person_b","segments":["id"]},{"node":"person_b","segments":["family_id"]}],"required_claim_reads":[{"segments":["evaluator_ref"]},{"segments":["period"]},{"segments":["subject"]},{"segments":["claim_id"]},{"segments":["fact_key"]},{"segments":["metric"]},{"segments":["unit"]},{"segments":["subject","kind"]},{"segments":["subject","ref_id"]},{"segments":["period","kind"]},{"segments":["period","value"]},{"segments":["time_basis"]},{"segments":["coverage"]},{"segments":["evidence_state"]},{"segments":["evaluator_ref","evaluator_id"]},{"segments":["evaluator_ref","evaluator_version"]}],"required_edges":["e0001","e0002","e0003","e0004","e0005","e0006","e0007","e0008","e0009","e0010","e0011","e0012"],"required_structural":[{"node":"next_golden_financial_v1","operation":"keys","segments":[]},{"node":"card_green","operation":"keys","segments":[]},{"node":"evt_refund_b","operation":"keys","segments":[]},{"node":"evt_restaurant_b","operation":"keys","segments":[]},{"node":"family_example","operation":"iterator","segments":["members"]},{"node":"family_example","operation":"cardinality","segments":["members"]},{"node":"family_example","operation":"order","segments":["members"]},{"node":"family_example","operation":"keys","segments":[]},{"node":"food_restaurant","operation":"keys","segments":[]},{"node":"neutral_refund","operation":"keys","segments":[]},{"node":"person_a","operation":"keys","segments":[]},{"node":"person_b","operation":"keys","segments":[]}],"selected_nodes":["evt_refund_b"],"required_selections":[{"candidate_set":"candidates","selected_set":"selected"}]},"sets":{"candidates":["evt_refund_b"],"selected":["evt_refund_b"]},"bindings":[{"role":"proof/set/candidates","candidate_set":"candidates","selected_set":"selected"}],"operandSets":[{"role":"proof/set/candidates","aliases":["evt_refund_b"]}],"accessBindings":[{"alias":"next_golden_financial_v1","role":"proof/snapshot","identity":{"kind":"fixture","ref_id":"NEXT-GOLDEN-FINANCIAL-V1","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"card_green","role":"proof/snapshot","identity":{"kind":"card","ref_id":"card-green","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_refund_b","role":"proof/snapshot","identity":{"kind":"event","ref_id":"evt-refund-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_restaurant_b","role":"proof/snapshot","identity":{"kind":"event","ref_id":"evt-restaurant-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"family_example","role":"proof/snapshot","identity":{"kind":"family","ref_id":"family-example","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"food_restaurant","role":"proof/snapshot","identity":{"kind":"category","ref_id":"food.restaurant","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"neutral_refund","role":"proof/snapshot","identity":{"kind":"category","ref_id":"neutral.refund","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_a","role":"proof/snapshot","identity":{"kind":"person","ref_id":"person-a","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_b","role":"proof/snapshot","identity":{"kind":"person","ref_id":"person-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"claim/context","role":"proof/context","identity":null,"records":[[],["subject"],["period"],["evaluator_ref"]],"claim_structure":{"records":[{"path":[],"keys":["claim_id","fact_key","metric","unit","subject","period","time_basis","coverage","evidence_state","evaluator_ref"]},{"path":["subject"],"keys":["kind","ref_id"]},{"path":["period"],"keys":["kind","value"]},{"path":["evaluator_ref"],"keys":["evaluator_id","evaluator_version"]}],"sequences":[]}},{"alias":"next_golden_financial_v1","role":"proof/set/candidates","identity":{"kind":"fixture","ref_id":"NEXT-GOLDEN-FINANCIAL-V1","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"card_green","role":"proof/set/candidates","identity":{"kind":"card","ref_id":"card-green","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_refund_b","role":"proof/set/candidates","identity":{"kind":"event","ref_id":"evt-refund-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_restaurant_b","role":"proof/set/candidates","identity":{"kind":"event","ref_id":"evt-restaurant-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"family_example","role":"proof/set/candidates","identity":{"kind":"family","ref_id":"family-example","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"food_restaurant","role":"proof/set/candidates","identity":{"kind":"category","ref_id":"food.restaurant","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"neutral_refund","role":"proof/set/candidates","identity":{"kind":"category","ref_id":"neutral.refund","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_a","role":"proof/set/candidates","identity":{"kind":"person","ref_id":"person-a","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_b","role":"proof/set/candidates","identity":{"kind":"person","ref_id":"person-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]}]}}},"normalCoverage":{"C":{"derivation":{"expected":{"required_nodes":["evt_refund_b","evt_restaurant_b","food_restaurant","neutral_refund","person_b"],"required_reads":[{"node":"evt_refund_b","segments":["id"]},{"node":"evt_refund_b","segments":["date"]},{"node":"evt_refund_b","segments":["state"]},{"node":"evt_refund_b","segments":["person_id"]},{"node":"evt_refund_b","segments":["category_id"]},{"node":"person_b","segments":["id"]},{"node":"neutral_refund","segments":["id"]},{"node":"neutral_refund","segments":["kind"]},{"node":"evt_refund_b","segments":["compensates"]},{"node":"evt_restaurant_b","segments":["id"]},{"node":"evt_restaurant_b","segments":["state"]},{"node":"evt_restaurant_b","segments":["person_id"]},{"node":"evt_restaurant_b","segments":["category_id"]},{"node":"food_restaurant","segments":["id"]},{"node":"food_restaurant","segments":["kind"]},{"node":"evt_refund_b","segments":["amount_minor"]}],"required_claim_reads":[{"segments":["period"]},{"segments":["subject"]},{"segments":["subject","kind"]},{"segments":["subject","ref_id"]},{"segments":["period","kind"]},{"segments":["period","value"]},{"segments":["time_basis"]}],"required_edges":["e0002","e0004","e0005","e0008"],"required_structural":[],"selected_nodes":["evt_refund_b"],"required_selections":[{"candidate_set":"candidates","selected_set":"selected"}]},"sets":{"candidates":["evt_refund_b"],"selected":["evt_refund_b"]},"bindings":[{"role":"events","candidate_set":"candidates","selected_set":"selected"}],"operandSets":[{"role":"events","aliases":["evt_refund_b"]}],"accessBindings":[{"alias":"claim/context","role":"context","identity":null,"records":[[],["subject"],["period"],["evaluator_ref"]],"claim_structure":{"records":[{"path":[],"keys":["claim_id","fact_key","metric","unit","subject","period","time_basis","coverage","evidence_state","evaluator_ref"]},{"path":["subject"],"keys":["kind","ref_id"]},{"path":["period"],"keys":["kind","value"]},{"path":["evaluator_ref"],"keys":["evaluator_id","evaluator_version"]}],"sequences":[]}},{"alias":"evt_refund_b","role":"events","identity":{"kind":"event","ref_id":"evt-refund-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_b","role":"events","identity":{"kind":"person","ref_id":"person-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"card_green","role":"events","identity":{"kind":"card","ref_id":"card-green","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"neutral_refund","role":"events","identity":{"kind":"category","ref_id":"neutral.refund","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_restaurant_b","role":"events","identity":{"kind":"event","ref_id":"evt-restaurant-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"family_example","role":"events","identity":{"kind":"family","ref_id":"family-example","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"food_restaurant","role":"events","identity":{"kind":"category","ref_id":"food.restaurant","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_a","role":"events","identity":{"kind":"person","ref_id":"person-a","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]}]},"proof":{"expected":{"required_nodes":["next_golden_financial_v1","card_green","evt_refund_b","evt_restaurant_b","family_example","food_restaurant","neutral_refund","person_a","person_b"],"required_reads":[{"node":"next_golden_financial_v1","segments":["id"]},{"node":"next_golden_financial_v1","segments":["synthetic"]},{"node":"next_golden_financial_v1","segments":["closed_world"]},{"node":"next_golden_financial_v1","segments":["currency"]},{"node":"next_golden_financial_v1","segments":["fixed_clock"]},{"node":"card_green","segments":["id"]},{"node":"card_green","segments":["owner_id"]},{"node":"card_green","segments":["closing_day"]},{"node":"card_green","segments":["due_day"]},{"node":"evt_refund_b","segments":["id"]},{"node":"evt_refund_b","segments":["date"]},{"node":"evt_refund_b","segments":["person_id"]},{"node":"evt_refund_b","segments":["card_id"]},{"node":"evt_refund_b","segments":["category_id"]},{"node":"evt_refund_b","segments":["amount_minor"]},{"node":"evt_refund_b","segments":["state"]},{"node":"evt_refund_b","segments":["compensates"]},{"node":"evt_restaurant_b","segments":["id"]},{"node":"evt_restaurant_b","segments":["date"]},{"node":"evt_restaurant_b","segments":["person_id"]},{"node":"evt_restaurant_b","segments":["card_id"]},{"node":"evt_restaurant_b","segments":["category_id"]},{"node":"evt_restaurant_b","segments":["amount_minor"]},{"node":"evt_restaurant_b","segments":["state"]},{"node":"family_example","segments":["id"]},{"node":"family_example","segments":["members"]},{"node":"food_restaurant","segments":["id"]},{"node":"food_restaurant","segments":["kind"]},{"node":"food_restaurant","segments":["budget_class"]},{"node":"neutral_refund","segments":["id"]},{"node":"neutral_refund","segments":["kind"]},{"node":"person_a","segments":["id"]},{"node":"person_a","segments":["family_id"]},{"node":"person_b","segments":["id"]},{"node":"person_b","segments":["family_id"]}],"required_claim_reads":[{"segments":["evaluator_ref"]},{"segments":["period"]},{"segments":["subject"]},{"segments":["claim_id"]},{"segments":["fact_key"]},{"segments":["metric"]},{"segments":["unit"]},{"segments":["subject","kind"]},{"segments":["subject","ref_id"]},{"segments":["period","kind"]},{"segments":["period","value"]},{"segments":["time_basis"]},{"segments":["coverage"]},{"segments":["evidence_state"]},{"segments":["evaluator_ref","evaluator_id"]},{"segments":["evaluator_ref","evaluator_version"]}],"required_edges":["e0001","e0002","e0003","e0004","e0005","e0006","e0007","e0008","e0009","e0010","e0011","e0012"],"required_structural":[{"node":"next_golden_financial_v1","operation":"keys","segments":[]},{"node":"card_green","operation":"keys","segments":[]},{"node":"evt_refund_b","operation":"keys","segments":[]},{"node":"evt_restaurant_b","operation":"keys","segments":[]},{"node":"family_example","operation":"iterator","segments":["members"]},{"node":"family_example","operation":"cardinality","segments":["members"]},{"node":"family_example","operation":"order","segments":["members"]},{"node":"family_example","operation":"keys","segments":[]},{"node":"food_restaurant","operation":"keys","segments":[]},{"node":"neutral_refund","operation":"keys","segments":[]},{"node":"person_a","operation":"keys","segments":[]},{"node":"person_b","operation":"keys","segments":[]}],"selected_nodes":["evt_refund_b"],"required_selections":[{"candidate_set":"candidates","selected_set":"selected"}]},"sets":{"candidates":["evt_refund_b"],"selected":["evt_refund_b"]},"bindings":[{"role":"proof/set/candidates","candidate_set":"candidates","selected_set":"selected"}],"operandSets":[{"role":"proof/set/candidates","aliases":["evt_refund_b"]}],"accessBindings":[{"alias":"next_golden_financial_v1","role":"proof/snapshot","identity":{"kind":"fixture","ref_id":"NEXT-GOLDEN-FINANCIAL-V1","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"card_green","role":"proof/snapshot","identity":{"kind":"card","ref_id":"card-green","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_refund_b","role":"proof/snapshot","identity":{"kind":"event","ref_id":"evt-refund-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_restaurant_b","role":"proof/snapshot","identity":{"kind":"event","ref_id":"evt-restaurant-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"family_example","role":"proof/snapshot","identity":{"kind":"family","ref_id":"family-example","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"food_restaurant","role":"proof/snapshot","identity":{"kind":"category","ref_id":"food.restaurant","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"neutral_refund","role":"proof/snapshot","identity":{"kind":"category","ref_id":"neutral.refund","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_a","role":"proof/snapshot","identity":{"kind":"person","ref_id":"person-a","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_b","role":"proof/snapshot","identity":{"kind":"person","ref_id":"person-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"claim/context","role":"proof/context","identity":null,"records":[[],["subject"],["period"],["evaluator_ref"]],"claim_structure":{"records":[{"path":[],"keys":["claim_id","fact_key","metric","unit","subject","period","time_basis","coverage","evidence_state","evaluator_ref"]},{"path":["subject"],"keys":["kind","ref_id"]},{"path":["period"],"keys":["kind","value"]},{"path":["evaluator_ref"],"keys":["evaluator_id","evaluator_version"]}],"sequences":[]}},{"alias":"next_golden_financial_v1","role":"proof/set/candidates","identity":{"kind":"fixture","ref_id":"NEXT-GOLDEN-FINANCIAL-V1","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"card_green","role":"proof/set/candidates","identity":{"kind":"card","ref_id":"card-green","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_refund_b","role":"proof/set/candidates","identity":{"kind":"event","ref_id":"evt-refund-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_restaurant_b","role":"proof/set/candidates","identity":{"kind":"event","ref_id":"evt-restaurant-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"family_example","role":"proof/set/candidates","identity":{"kind":"family","ref_id":"family-example","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"food_restaurant","role":"proof/set/candidates","identity":{"kind":"category","ref_id":"food.restaurant","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"neutral_refund","role":"proof/set/candidates","identity":{"kind":"category","ref_id":"neutral.refund","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_a","role":"proof/set/candidates","identity":{"kind":"person","ref_id":"person-a","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_b","role":"proof/set/candidates","identity":{"kind":"person","ref_id":"person-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]}]}},"M":{"derivation":{"expected":{"required_nodes":["evt_refund_b","evt_restaurant_b","food_restaurant","neutral_refund","person_b"],"required_reads":[{"node":"evt_refund_b","segments":["id"]},{"node":"evt_refund_b","segments":["date"]},{"node":"evt_refund_b","segments":["state"]},{"node":"evt_refund_b","segments":["person_id"]},{"node":"evt_refund_b","segments":["category_id"]},{"node":"person_b","segments":["id"]},{"node":"neutral_refund","segments":["id"]},{"node":"neutral_refund","segments":["kind"]},{"node":"evt_refund_b","segments":["compensates"]},{"node":"evt_restaurant_b","segments":["id"]},{"node":"evt_restaurant_b","segments":["state"]},{"node":"evt_restaurant_b","segments":["person_id"]},{"node":"evt_restaurant_b","segments":["category_id"]},{"node":"food_restaurant","segments":["id"]},{"node":"food_restaurant","segments":["kind"]},{"node":"evt_refund_b","segments":["amount_minor"]}],"required_claim_reads":[{"segments":["period"]},{"segments":["subject"]},{"segments":["subject","kind"]},{"segments":["subject","ref_id"]},{"segments":["period","kind"]},{"segments":["period","value"]},{"segments":["time_basis"]}],"required_edges":["e0002","e0004","e0005","e0008"],"required_structural":[],"selected_nodes":["evt_refund_b"],"required_selections":[{"candidate_set":"candidates","selected_set":"selected"}]},"sets":{"candidates":["evt_refund_b"],"selected":["evt_refund_b"]},"bindings":[{"role":"events","candidate_set":"candidates","selected_set":"selected"}],"operandSets":[{"role":"events","aliases":["evt_refund_b"]}],"accessBindings":[{"alias":"claim/context","role":"context","identity":null,"records":[[],["subject"],["period"],["evaluator_ref"]],"claim_structure":{"records":[{"path":[],"keys":["claim_id","fact_key","metric","unit","subject","period","time_basis","coverage","evidence_state","evaluator_ref"]},{"path":["subject"],"keys":["kind","ref_id"]},{"path":["period"],"keys":["kind","value"]},{"path":["evaluator_ref"],"keys":["evaluator_id","evaluator_version"]}],"sequences":[]}},{"alias":"evt_refund_b","role":"events","identity":{"kind":"event","ref_id":"evt-refund-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_b","role":"events","identity":{"kind":"person","ref_id":"person-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"card_green","role":"events","identity":{"kind":"card","ref_id":"card-green","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"neutral_refund","role":"events","identity":{"kind":"category","ref_id":"neutral.refund","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_restaurant_b","role":"events","identity":{"kind":"event","ref_id":"evt-restaurant-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"family_example","role":"events","identity":{"kind":"family","ref_id":"family-example","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"food_restaurant","role":"events","identity":{"kind":"category","ref_id":"food.restaurant","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_a","role":"events","identity":{"kind":"person","ref_id":"person-a","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]}]},"proof":{"expected":{"required_nodes":["next_golden_financial_v1","card_green","evt_refund_b","evt_restaurant_b","family_example","food_restaurant","neutral_refund","person_a","person_b"],"required_reads":[{"node":"next_golden_financial_v1","segments":["id"]},{"node":"next_golden_financial_v1","segments":["synthetic"]},{"node":"next_golden_financial_v1","segments":["closed_world"]},{"node":"next_golden_financial_v1","segments":["currency"]},{"node":"next_golden_financial_v1","segments":["fixed_clock"]},{"node":"card_green","segments":["id"]},{"node":"card_green","segments":["owner_id"]},{"node":"card_green","segments":["closing_day"]},{"node":"card_green","segments":["due_day"]},{"node":"evt_refund_b","segments":["id"]},{"node":"evt_refund_b","segments":["date"]},{"node":"evt_refund_b","segments":["person_id"]},{"node":"evt_refund_b","segments":["card_id"]},{"node":"evt_refund_b","segments":["category_id"]},{"node":"evt_refund_b","segments":["amount_minor"]},{"node":"evt_refund_b","segments":["state"]},{"node":"evt_refund_b","segments":["compensates"]},{"node":"evt_restaurant_b","segments":["id"]},{"node":"evt_restaurant_b","segments":["date"]},{"node":"evt_restaurant_b","segments":["person_id"]},{"node":"evt_restaurant_b","segments":["card_id"]},{"node":"evt_restaurant_b","segments":["category_id"]},{"node":"evt_restaurant_b","segments":["amount_minor"]},{"node":"evt_restaurant_b","segments":["state"]},{"node":"family_example","segments":["id"]},{"node":"family_example","segments":["members"]},{"node":"food_restaurant","segments":["id"]},{"node":"food_restaurant","segments":["kind"]},{"node":"food_restaurant","segments":["budget_class"]},{"node":"neutral_refund","segments":["id"]},{"node":"neutral_refund","segments":["kind"]},{"node":"person_a","segments":["id"]},{"node":"person_a","segments":["family_id"]},{"node":"person_b","segments":["id"]},{"node":"person_b","segments":["family_id"]}],"required_claim_reads":[{"segments":["evaluator_ref"]},{"segments":["period"]},{"segments":["subject"]},{"segments":["claim_id"]},{"segments":["fact_key"]},{"segments":["metric"]},{"segments":["unit"]},{"segments":["subject","kind"]},{"segments":["subject","ref_id"]},{"segments":["period","kind"]},{"segments":["period","value"]},{"segments":["time_basis"]},{"segments":["coverage"]},{"segments":["evidence_state"]},{"segments":["evaluator_ref","evaluator_id"]},{"segments":["evaluator_ref","evaluator_version"]}],"required_edges":["e0001","e0002","e0003","e0004","e0005","e0006","e0007","e0008","e0009","e0010","e0011","e0012"],"required_structural":[{"node":"next_golden_financial_v1","operation":"keys","segments":[]},{"node":"card_green","operation":"keys","segments":[]},{"node":"evt_refund_b","operation":"keys","segments":[]},{"node":"evt_restaurant_b","operation":"keys","segments":[]},{"node":"family_example","operation":"iterator","segments":["members"]},{"node":"family_example","operation":"cardinality","segments":["members"]},{"node":"family_example","operation":"order","segments":["members"]},{"node":"family_example","operation":"keys","segments":[]},{"node":"food_restaurant","operation":"keys","segments":[]},{"node":"neutral_refund","operation":"keys","segments":[]},{"node":"person_a","operation":"keys","segments":[]},{"node":"person_b","operation":"keys","segments":[]}],"selected_nodes":["evt_refund_b"],"required_selections":[{"candidate_set":"candidates","selected_set":"selected"}]},"sets":{"candidates":["evt_refund_b"],"selected":["evt_refund_b"]},"bindings":[{"role":"proof/set/candidates","candidate_set":"candidates","selected_set":"selected"}],"operandSets":[{"role":"proof/set/candidates","aliases":["evt_refund_b"]}],"accessBindings":[{"alias":"next_golden_financial_v1","role":"proof/snapshot","identity":{"kind":"fixture","ref_id":"NEXT-GOLDEN-FINANCIAL-V1","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"card_green","role":"proof/snapshot","identity":{"kind":"card","ref_id":"card-green","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_refund_b","role":"proof/snapshot","identity":{"kind":"event","ref_id":"evt-refund-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_restaurant_b","role":"proof/snapshot","identity":{"kind":"event","ref_id":"evt-restaurant-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"family_example","role":"proof/snapshot","identity":{"kind":"family","ref_id":"family-example","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"food_restaurant","role":"proof/snapshot","identity":{"kind":"category","ref_id":"food.restaurant","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"neutral_refund","role":"proof/snapshot","identity":{"kind":"category","ref_id":"neutral.refund","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_a","role":"proof/snapshot","identity":{"kind":"person","ref_id":"person-a","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_b","role":"proof/snapshot","identity":{"kind":"person","ref_id":"person-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"claim/context","role":"proof/context","identity":null,"records":[[],["subject"],["period"],["evaluator_ref"]],"claim_structure":{"records":[{"path":[],"keys":["claim_id","fact_key","metric","unit","subject","period","time_basis","coverage","evidence_state","evaluator_ref"]},{"path":["subject"],"keys":["kind","ref_id"]},{"path":["period"],"keys":["kind","value"]},{"path":["evaluator_ref"],"keys":["evaluator_id","evaluator_version"]}],"sequences":[]}},{"alias":"next_golden_financial_v1","role":"proof/set/candidates","identity":{"kind":"fixture","ref_id":"NEXT-GOLDEN-FINANCIAL-V1","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"card_green","role":"proof/set/candidates","identity":{"kind":"card","ref_id":"card-green","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_refund_b","role":"proof/set/candidates","identity":{"kind":"event","ref_id":"evt-refund-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_restaurant_b","role":"proof/set/candidates","identity":{"kind":"event","ref_id":"evt-restaurant-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"family_example","role":"proof/set/candidates","identity":{"kind":"family","ref_id":"family-example","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"food_restaurant","role":"proof/set/candidates","identity":{"kind":"category","ref_id":"food.restaurant","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"neutral_refund","role":"proof/set/candidates","identity":{"kind":"category","ref_id":"neutral.refund","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_a","role":"proof/set/candidates","identity":{"kind":"person","ref_id":"person-a","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_b","role":"proof/set/candidates","identity":{"kind":"person","ref_id":"person-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]}]}},"S":{"derivation":{"expected":{"required_nodes":["evt_refund_b","evt_restaurant_b","food_restaurant","neutral_refund","person_b"],"required_reads":[{"node":"evt_refund_b","segments":["id"]},{"node":"evt_refund_b","segments":["date"]},{"node":"evt_refund_b","segments":["state"]},{"node":"evt_refund_b","segments":["person_id"]},{"node":"evt_refund_b","segments":["category_id"]},{"node":"person_b","segments":["id"]},{"node":"neutral_refund","segments":["id"]},{"node":"neutral_refund","segments":["kind"]},{"node":"evt_refund_b","segments":["compensates"]},{"node":"evt_restaurant_b","segments":["id"]},{"node":"evt_restaurant_b","segments":["state"]},{"node":"evt_restaurant_b","segments":["person_id"]},{"node":"evt_restaurant_b","segments":["category_id"]},{"node":"food_restaurant","segments":["id"]},{"node":"food_restaurant","segments":["kind"]},{"node":"evt_refund_b","segments":["amount_minor"]}],"required_claim_reads":[{"segments":["period"]},{"segments":["subject"]},{"segments":["subject","kind"]},{"segments":["subject","ref_id"]},{"segments":["period","kind"]},{"segments":["period","value"]},{"segments":["time_basis"]}],"required_edges":["e0002","e0004","e0005","e0008"],"required_structural":[],"selected_nodes":["evt_refund_b"],"required_selections":[{"candidate_set":"candidates","selected_set":"selected"}]},"sets":{"candidates":["evt_refund_b"],"selected":["evt_refund_b"]},"bindings":[{"role":"events","candidate_set":"candidates","selected_set":"selected"}],"operandSets":[{"role":"events","aliases":["evt_refund_b"]}],"accessBindings":[{"alias":"claim/context","role":"context","identity":null,"records":[[],["subject"],["period"],["evaluator_ref"]],"claim_structure":{"records":[{"path":[],"keys":["claim_id","fact_key","metric","unit","subject","period","time_basis","coverage","evidence_state","evaluator_ref"]},{"path":["subject"],"keys":["kind","ref_id"]},{"path":["period"],"keys":["kind","value"]},{"path":["evaluator_ref"],"keys":["evaluator_id","evaluator_version"]}],"sequences":[]}},{"alias":"evt_refund_b","role":"events","identity":{"kind":"event","ref_id":"evt-refund-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_b","role":"events","identity":{"kind":"person","ref_id":"person-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"card_green","role":"events","identity":{"kind":"card","ref_id":"card-green","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"neutral_refund","role":"events","identity":{"kind":"category","ref_id":"neutral.refund","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_restaurant_b","role":"events","identity":{"kind":"event","ref_id":"evt-restaurant-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"family_example","role":"events","identity":{"kind":"family","ref_id":"family-example","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"food_restaurant","role":"events","identity":{"kind":"category","ref_id":"food.restaurant","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_a","role":"events","identity":{"kind":"person","ref_id":"person-a","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]}]},"proof":{"expected":{"required_nodes":["next_golden_financial_v1","card_green","evt_refund_b","evt_restaurant_b","family_example","food_restaurant","neutral_refund","person_a","person_b"],"required_reads":[{"node":"next_golden_financial_v1","segments":["id"]},{"node":"next_golden_financial_v1","segments":["synthetic"]},{"node":"next_golden_financial_v1","segments":["closed_world"]},{"node":"next_golden_financial_v1","segments":["currency"]},{"node":"next_golden_financial_v1","segments":["fixed_clock"]},{"node":"card_green","segments":["id"]},{"node":"card_green","segments":["owner_id"]},{"node":"card_green","segments":["closing_day"]},{"node":"card_green","segments":["due_day"]},{"node":"evt_refund_b","segments":["id"]},{"node":"evt_refund_b","segments":["date"]},{"node":"evt_refund_b","segments":["person_id"]},{"node":"evt_refund_b","segments":["card_id"]},{"node":"evt_refund_b","segments":["category_id"]},{"node":"evt_refund_b","segments":["amount_minor"]},{"node":"evt_refund_b","segments":["state"]},{"node":"evt_refund_b","segments":["compensates"]},{"node":"evt_restaurant_b","segments":["id"]},{"node":"evt_restaurant_b","segments":["date"]},{"node":"evt_restaurant_b","segments":["person_id"]},{"node":"evt_restaurant_b","segments":["card_id"]},{"node":"evt_restaurant_b","segments":["category_id"]},{"node":"evt_restaurant_b","segments":["amount_minor"]},{"node":"evt_restaurant_b","segments":["state"]},{"node":"family_example","segments":["id"]},{"node":"family_example","segments":["members"]},{"node":"food_restaurant","segments":["id"]},{"node":"food_restaurant","segments":["kind"]},{"node":"food_restaurant","segments":["budget_class"]},{"node":"neutral_refund","segments":["id"]},{"node":"neutral_refund","segments":["kind"]},{"node":"person_a","segments":["id"]},{"node":"person_a","segments":["family_id"]},{"node":"person_b","segments":["id"]},{"node":"person_b","segments":["family_id"]}],"required_claim_reads":[{"segments":["evaluator_ref"]},{"segments":["period"]},{"segments":["subject"]},{"segments":["claim_id"]},{"segments":["fact_key"]},{"segments":["metric"]},{"segments":["unit"]},{"segments":["subject","kind"]},{"segments":["subject","ref_id"]},{"segments":["period","kind"]},{"segments":["period","value"]},{"segments":["time_basis"]},{"segments":["coverage"]},{"segments":["evidence_state"]},{"segments":["evaluator_ref","evaluator_id"]},{"segments":["evaluator_ref","evaluator_version"]}],"required_edges":["e0001","e0002","e0003","e0004","e0005","e0006","e0007","e0008","e0009","e0010","e0011","e0012"],"required_structural":[{"node":"next_golden_financial_v1","operation":"keys","segments":[]},{"node":"card_green","operation":"keys","segments":[]},{"node":"evt_refund_b","operation":"keys","segments":[]},{"node":"evt_restaurant_b","operation":"keys","segments":[]},{"node":"family_example","operation":"iterator","segments":["members"]},{"node":"family_example","operation":"cardinality","segments":["members"]},{"node":"family_example","operation":"order","segments":["members"]},{"node":"family_example","operation":"keys","segments":[]},{"node":"food_restaurant","operation":"keys","segments":[]},{"node":"neutral_refund","operation":"keys","segments":[]},{"node":"person_a","operation":"keys","segments":[]},{"node":"person_b","operation":"keys","segments":[]}],"selected_nodes":["evt_refund_b"],"required_selections":[{"candidate_set":"candidates","selected_set":"selected"}]},"sets":{"candidates":["evt_refund_b"],"selected":["evt_refund_b"]},"bindings":[{"role":"proof/set/candidates","candidate_set":"candidates","selected_set":"selected"}],"operandSets":[{"role":"proof/set/candidates","aliases":["evt_refund_b"]}],"accessBindings":[{"alias":"next_golden_financial_v1","role":"proof/snapshot","identity":{"kind":"fixture","ref_id":"NEXT-GOLDEN-FINANCIAL-V1","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"card_green","role":"proof/snapshot","identity":{"kind":"card","ref_id":"card-green","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_refund_b","role":"proof/snapshot","identity":{"kind":"event","ref_id":"evt-refund-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_restaurant_b","role":"proof/snapshot","identity":{"kind":"event","ref_id":"evt-restaurant-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"family_example","role":"proof/snapshot","identity":{"kind":"family","ref_id":"family-example","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"food_restaurant","role":"proof/snapshot","identity":{"kind":"category","ref_id":"food.restaurant","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"neutral_refund","role":"proof/snapshot","identity":{"kind":"category","ref_id":"neutral.refund","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_a","role":"proof/snapshot","identity":{"kind":"person","ref_id":"person-a","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_b","role":"proof/snapshot","identity":{"kind":"person","ref_id":"person-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"claim/context","role":"proof/context","identity":null,"records":[[],["subject"],["period"],["evaluator_ref"]],"claim_structure":{"records":[{"path":[],"keys":["claim_id","fact_key","metric","unit","subject","period","time_basis","coverage","evidence_state","evaluator_ref"]},{"path":["subject"],"keys":["kind","ref_id"]},{"path":["period"],"keys":["kind","value"]},{"path":["evaluator_ref"],"keys":["evaluator_id","evaluator_version"]}],"sequences":[]}},{"alias":"next_golden_financial_v1","role":"proof/set/candidates","identity":{"kind":"fixture","ref_id":"NEXT-GOLDEN-FINANCIAL-V1","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"card_green","role":"proof/set/candidates","identity":{"kind":"card","ref_id":"card-green","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_refund_b","role":"proof/set/candidates","identity":{"kind":"event","ref_id":"evt-refund-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"evt_restaurant_b","role":"proof/set/candidates","identity":{"kind":"event","ref_id":"evt-restaurant-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"family_example","role":"proof/set/candidates","identity":{"kind":"family","ref_id":"family-example","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"food_restaurant","role":"proof/set/candidates","identity":{"kind":"category","ref_id":"food.restaurant","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"neutral_refund","role":"proof/set/candidates","identity":{"kind":"category","ref_id":"neutral.refund","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_a","role":"proof/set/candidates","identity":{"kind":"person","ref_id":"person-a","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]},{"alias":"person_b","role":"proof/set/candidates","identity":{"kind":"person","ref_id":"person-b","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},"records":[[]]}]}}},"normalPredicates":[{"id":"p0001_kind","atom":"identity"},{"id":"p0002_fingerprint","atom":"fingerprint"},{"id":"p0008_kind","atom":"identity"},{"id":"p0009_fingerprint","atom":"fingerprint"},{"id":"p0011_target","atom":"edge"},{"id":"p0014_kind","atom":"identity"},{"id":"p0015_fingerprint","atom":"fingerprint"},{"id":"p0018_target","atom":"edge"},{"id":"p0019_target","atom":"edge"},{"id":"p0020_target","atom":"edge"},{"id":"p0023_target","atom":"edge"},{"id":"p0024_kind","atom":"identity"},{"id":"p0025_fingerprint","atom":"fingerprint"},{"id":"p0028_target","atom":"edge"},{"id":"p0029_target","atom":"edge"},{"id":"p0030_target","atom":"edge"},{"id":"p0033_kind","atom":"identity"},{"id":"p0034_fingerprint","atom":"fingerprint"},{"id":"p0036_target","atom":"edge"},{"id":"p0037_target","atom":"edge"},{"id":"p0038_kind","atom":"identity"},{"id":"p0039_fingerprint","atom":"fingerprint"},{"id":"p0043_kind","atom":"identity"},{"id":"p0044_fingerprint","atom":"fingerprint"},{"id":"p0047_kind","atom":"identity"},{"id":"p0048_fingerprint","atom":"fingerprint"},{"id":"p0050_target","atom":"edge"},{"id":"p0051_kind","atom":"identity"},{"id":"p0052_fingerprint","atom":"fingerprint"},{"id":"p0054_target","atom":"edge"},{"id":"p0055_selected_period","atom":"period"},{"id":"p0056_selected_state","atom":"evidence_state"},{"id":"link_1_refund_sign","atom":"edge"},{"id":"link_2_refund_person","atom":"edge"},{"id":"link_3_refund_card","atom":"edge"},{"id":"binding_1","atom":"period"},{"id":"binding_2","atom":"time_basis"},{"id":"binding_3","atom":"coverage"},{"id":"binding_4","atom":"evidence_state"},{"id":"binding_5","atom":"subject"},{"id":"binding_6","atom":"subject"},{"id":"binding_7","atom":"subject"},{"id":"binding_8","atom":"coverage"},{"id":"binding_9","atom":"coverage"}],"measurements":{"derivation":[{"measurement":"evaluator_artifact_root","observed":"sha256:6a01f2ccef278feee0ac303ed0b3dcfb9d1b43f36d339057e1b317200045b549"},{"measurement":"proof_engine_artifact_root","observed":"sha256:458db2dc15ac63070ad5a66afa29632b8668b888fa6508f23a784df3ac0593ac"},{"measurement":"evaluator_contract_hash","observed":"sha256:2dafc200e53dfa069e3b7e12d42c0ead14db1f2b020768ec5fd2a6fcda4c515c"}],"proof":[{"measurement":"proof_engine_artifact_root","observed":"sha256:458db2dc15ac63070ad5a66afa29632b8668b888fa6508f23a784df3ac0593ac"}]}};

},
function(require, module, exports, __dirname, __filename) {
'use strict';
const { copyData } = require('./observationContract');
const { freezeDeep } = require('../kernel/canonicalValue');
const { compareSelectedEventDayCoverage } = require('./selectedEventDayCoverage');
const { compareSelectedEventDayOracle } = require('./selectedEventDayOracle');
const { comparePhaseCoverage } = require('./proofAcceptance');
const recipe = freezeDeep(require('./selectedDayCapturedAdjudicationRecipe'));
// A closed negative-component comparison, not reviewed-source admission or a
// financial launcher. Expectations exist only in the captured BUILD recipe.
// The private outer binding must supply genuine results from this execution.
function run(raw) {
    let data; try { data = structuredClone(copyData(raw)); } catch { throw new Error('selected_day_adjudicator_input'); }
    if (!data || Object.keys(data).join(',') !== 'results' || recipe.negative_qualification !== true
        || recipe.profile_witness_qualified !== false || recipe.financial_release_eligible !== false)
        throw new Error('selected_day_adjudicator_input');
    const coverage = compareSelectedEventDayCoverage({ results: data.results, plans: recipe.plans,
        coverage: recipe.coverage, measurements: recipe.measurements });
    const oracle = compareSelectedEventDayOracle({ results: data.results, expectation: recipe.oracle });
    // Preserve BOTH authorities using the same complete captured observations.
    // This is ordinary checker diagnosis, not a second normal-program run or
    // a normal-v2 witness. Original trace expectations were sealed pre-M.
    const normal = {};
    for (const variant of ['C', 'M', 'S']) {
        const result = data.results[variant], phases = {}, rejected = [];
        for (const phase of ['derivation', 'proof']) {
            const compared = comparePhaseCoverage({ trace: result.trace, executionId: result.trace.execution_id,
                invocationId: result.trace.derivation_trace[0].invocation_id, phase,
                ...recipe.normalCoverage[variant][phase], measurements: recipe.measurements[phase] });
            phases[phase] = compared.matched;
            if (!compared.matched) rejected.push({ phase, components: Object.entries(compared.components)
                .filter(([, c]) => c.matched === false || c.mismatches?.length > 0).map(([name]) => name) });
        }
        const falsePredicates = recipe.normalPredicates.filter(p => result.site_results.some((site, index) =>
            recipe.plans[variant].plan.queue[index].predicate_id === p.id && site.satisfied === false));
        const phasesCovered = Object.values(phases).every(Boolean);
        normal[variant] = { proof_satisfied: result.proof_satisfied, false_predicates: falsePredicates,
            phases_covered: phasesCovered, phases, rejected_coverage_components: rejected,
            observed_violations: [...new Set(falsePredicates.map(p => p.atom).concat(phasesCovered ? [] : ['trace']))].sort(),
            normal_graph_accepted: false, ordinary_v2_witness_qualified: false };
    }
    return freezeDeep({ stage: 'selected_day_captured_negative_adjudication_only',
        exact_core_matched: true, profile_coverage_complete: coverage.profile_coverage_complete,
        oracle_verified: oracle.oracle_verified, core_claim_verified: oracle.core_claim_verified,
        oracle_sha256: oracle.oracle_sha256, core_claim_hash: oracle.core_claim_hash,
        original_result_sha256: oracle.original_result_sha256, adjudicator_captured: true,
        normal_diagnosis: normal,
        negative_qualification: true, executable_ticket_complete: false, validation_tcb_complete: false,
        measured_tcb_admission: false, profile_witness_qualified: false, semantic_mutation_credit: 0,
        financial_release_eligible: false, receipt_created: false });
}
module.exports = { run };

},
function(require, module, exports, __dirname, __filename) {
'use strict';
const { copyData, decodeObservation, decodeMeasurement, identifier } = require('./observationContract');
const { canonicalValue, freezeDeep } = require('../kernel/canonicalValue');
const fail = code => { throw new Error('selected_day_core_' + code); };
const same = (a, b) => canonicalValue(a) === canonicalValue(b);
const keys = (v, expected) => {
    if (!v || Array.isArray(v) || Object.keys(v).sort().join(',') !== expected) fail('shape');
};
// This compares captured evidence only. The BUILD wrapper requires genuine
// execution results. Neither a matching copy nor this function issues authority,
// profile coverage, oracle acceptance, a witness or a financial receipt.
function compareSelectedEventDayCore(raw) {
    // Only after bounded descriptor admission; canonical JSON expects plain
    // objects while copyData deliberately returns inert null-prototype records.
    // This changes representation, never tuple values/order or scope bindings.
    let data; try { data = structuredClone(copyData(raw)); } catch { fail('shape'); }
    keys(data, 'plans,results'); keys(data.results, 'C,M,S'); keys(data.plans, 'C,M,S');
    const cores = {}, identities = new Set(); let executionId;
    for (const variant of ['C', 'M', 'S']) {
        const r = data.results[variant], plan = data.plans[variant].plan;
        if (!r || !plan || plan.variant !== variant || r.derivation_satisfied !== true
            || r.proof_satisfied !== (variant !== 'M') || r.fringe_count !== 4
            || r.profile_witness_qualified !== false || r.financial_release_eligible !== false
            || r.receipt_created !== false || r.negative_qualification !== true
            || !Array.isArray(r.raw_rows) || !r.raw_rows.length || r.raw_rows.length > 20000
            || r.raw_event_count !== r.raw_rows.length || !r.trace) fail('result');
        keys(r.trace, 'derivation_trace,execution_id,proof_trace,stage');
        const trace = [...r.trace.derivation_trace, ...r.trace.proof_trace];
        if (!r.trace.derivation_trace.length || !r.trace.proof_trace.length || trace.length !== r.raw_rows.length) fail('trace');
        const invocationId = trace[0].invocation_id;
        if (!identifier(invocationId) || identities.has(invocationId) || !identifier(r.trace.execution_id)) fail('scope');
        identities.add(invocationId);
        if (executionId !== undefined && executionId !== r.trace.execution_id) fail('scope');
        executionId = r.trace.execution_id;
        let fringe = 0, proof = false; const core = [];
        r.raw_rows.forEach((row, index) => {
            keys(row, 'event,execution_id,invocation_id,owner,phase,sequence');
            keys(row.owner, 'kind,occurrence,operand,site');
            if (row.sequence !== index || row.execution_id !== executionId || row.invocation_id !== invocationId
                || !['derivation', 'proof'].includes(row.phase)) fail('scope');
            if (row.phase === 'proof') proof = true; else if (proof) fail('phase');
            let event;
            try { event = row.event[0] === 'I' ? decodeObservation(row.event) : decodeMeasurement(row.event); } catch { fail('event'); }
            const expectedTrace = event[0] === 'I'
                ? { operation: event[1], alias: event[2], role: event[3], path: event[4], projection: event[5], outcome: event[6] }
                : { measurement: event[1], observed: event[2] };
            if (!same(trace[index], { sequence: index, invocation_id: invocationId, phase: row.phase, ...expectedTrace })) fail('trace');
            if (row.owner.kind === 'fringe') {
                const expected = plan.fringe[fringe];
                if (row.phase !== 'proof' || !expected || row.owner.occurrence !== fringe
                    || row.owner.site !== expected.site || row.owner.operand !== expected.operand
                    || !same(event, expected.tuple)) fail('fringe');
                fringe++;
            } else if (row.owner.kind === 'core') core.push({ phase: row.phase, event, owner: row.owner });
            else fail('owner');
        });
        if (fringe !== 4 || !same(r.site_results, plan.queue.map(site => ({ site: site.site, satisfied: site.truth })))) fail('sites');
        cores[variant] = core;
    }
    if (!same(cores.C, cores.M) || !same(cores.C, cores.S)) fail('mismatch');
    if (!same(data.results.C.result, data.results.M.result) || !same(data.results.C.result, data.results.S.result)) fail('functional');
    return freezeDeep({ stage: 'selected_day_core_comparison_only', exact_core_matched: true,
        core_event_count_per_variant: cores.C.length, fringe_count_per_variant: 4,
        profile_coverage_complete: false, oracle_verified: false, measured_tcb_admission: false,
        profile_witness_qualified: false, semantic_mutation_credit: 0, financial_release_eligible: false });
}
module.exports = { compareSelectedEventDayCore };

},
function(require, module, exports, __dirname, __filename) {
'use strict';
const { copyData } = require('./observationContract');
const { freezeDeep } = require('../kernel/canonicalValue');
const { comparePhaseCoverage } = require('./proofAcceptance');
const { compareSelectedEventDayCore } = require('./selectedEventDayCoreComparison');
const fail = code => { throw new Error('selected_day_coverage_' + code); };
const keys = (v, names) => {
    if (!v || Array.isArray(v) || Object.keys(v).sort().join(',') !== names) fail('shape');
};
// Evidence-only, separate profile coverage. Every raw position participates in
// unchanged native phase coverage AND the exact core/four-fringe comparison.
// A caller's matching copy cannot become runtime authority or a witness.
function compareSelectedEventDayCoverage(raw) {
    let data; try { data = structuredClone(copyData(raw)); } catch { fail('shape'); }
    keys(data, 'coverage,measurements,plans,results');
    for (const name of ['coverage', 'plans', 'results']) keys(data[name], 'C,M,S');
    keys(data.measurements, 'derivation,proof');
    compareSelectedEventDayCore({ results: data.results, plans: data.plans });
    const variants = {};
    for (const variant of ['C', 'M', 'S']) {
        const r = data.results[variant]; keys(data.coverage[variant], 'derivation,proof');
        const executionId = r.trace.execution_id, invocationId = r.trace.derivation_trace[0].invocation_id;
        const phases = {}, positions = [];
        for (const phase of ['derivation', 'proof']) {
            const config = data.coverage[variant][phase];
            keys(config, 'accessBindings,bindings,expected,operandSets,sets');
            const compared = comparePhaseCoverage({ trace: r.trace, executionId, invocationId, phase,
                ...config, measurements: data.measurements[phase] });
            if (!compared.matched) {
                // Dimension names only, never snapshot values in diagnostics.
                const dimensions = compared.components.read_edges.mismatches.map(m => m.dimension);
                const components = Object.entries(compared.components).filter(([, c]) => c.matched === false).map(([name]) => name);
                fail(variant + '_' + phase + '_' + [...dimensions, ...components].join('_'));
            }
            phases[phase] = { matched: true, event_count: compared.event_coverage.length };
            for (const p of compared.event_coverage) {
                const row = r.raw_rows[p.sequence];
                if (!row || row.phase !== phase || p.status !== 'covered') fail('position');
                positions.push({ sequence: p.sequence, phase, status: 'covered',
                    owner: row.owner.kind, component: p.component });
            }
        }
        if (positions.length !== r.raw_rows.length || positions.some((p, i) => p.sequence !== i)
            || positions.filter(p => p.owner === 'fringe').length !== 4) fail('position');
        variants[variant] = { phases, positions };
    }
    return freezeDeep({ stage: 'selected_day_profile_coverage_only', variants,
        profile_coverage_complete: true, normal_checker_modified: false, oracle_verified: false,
        measured_tcb_admission: false, profile_witness_qualified: false, semantic_mutation_credit: 0,
        financial_release_eligible: false });
}
module.exports = { compareSelectedEventDayCoverage };

},
function(require, module, exports, __dirname, __filename) {
'use strict';
const { copyData } = require('./observationContract');
const { copyTypedFunctionalResult } = require('./claimBinding');
const { canonicalValue, digest, freezeDeep } = require('../kernel/canonicalValue');
const fail = code => { throw new Error('selected_day_oracle_' + code); };
const same = (a, b) => canonicalValue(a) === canonicalValue(b);
const hash = v => 'sha256:' + digest(v);
// Pure comparison only. The private wrapper binds these expectations to the
// genuine pre-M admission/results, and requires complete profile coverage.
// No actual/baseline supplies an expectation. No financial receipt is emitted.
function compareSelectedEventDayOracle(raw) {
    let data; try { data = structuredClone(copyData(raw)); } catch { fail('shape'); }
    if (!data || Object.keys(data).sort().join(',') !== 'expectation,results'
        || !data.results || Object.keys(data.results).sort().join(',') !== 'C,M,S') fail('shape');
    const expected = data.expectation;
    if (!expected || expected.stage !== 'selected_day_original_oracle_sealed_only'
        || expected.profile_witness_qualified !== false || expected.semantic_mutation_credit !== 0
        || hash(expected.core_claim) !== expected.core_claim_hash
        || hash(expected.expected_result) !== expected.expected_result_sha256) fail('expectation');
    const wanted = copyTypedFunctionalResult(expected.expected_result);
    if (wanted.kind !== expected.result_signature.kind || wanted.unit !== expected.result_signature.unit) fail('signature');
    function at(segments) {
        let value = expected.core_claim;
        for (const key of segments) {
            if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return { missing: true };
            value = value[key];
        }
        return { value };
    }
    const variants = {};
    for (const variant of ['C', 'M', 'S']) {
        const r = data.results[variant];
        if (!r || r.negative_qualification !== true || r.derivation_satisfied !== true
            || r.proof_satisfied !== (variant !== 'M') || r.profile_witness_qualified !== false
            || r.financial_release_eligible !== false || r.receipt_created !== false
            || !Array.isArray(r.raw_rows) || !same(copyTypedFunctionalResult(r.result), wanted)) fail('functional_result');
        let count = 0;
        for (const row of r.raw_rows) {
            const event = row.event;
            if (event[0] !== 'I' || event[1] !== 'get' || event[2] !== 'claim/context' || event[5] !== 'data') continue;
            const projected = at(event[4]);
            const outcome = projected.missing ? ['absent'] : projected.value && typeof projected.value === 'object'
                ? ['container', Array.isArray(projected.value) ? 'sequence' : 'record'] : ['scalar', projected.value];
            if (!same(event[6], outcome)) fail('core_claim_read');
            count++;
        }
        if (!count) fail('core_claim_missing');
        variants[variant] = { original_oracle_matched: true, core_claim_reads_checked: count };
    }
    return freezeDeep({ stage: 'selected_day_oracle_comparison_only', variants,
        oracle_sha256: expected.source_sha256, original_result_sha256: expected.expected_result_sha256,
        core_claim_hash: expected.core_claim_hash, oracle_verified: true, core_claim_verified: true,
        profile_witness_qualified: false, semantic_mutation_credit: 0, financial_release_eligible: false });
}
module.exports = { compareSelectedEventDayOracle };

}];
const edges = [[["node:crypto","node:crypto"]],[],[["../kernel/canonicalValue",0],["node:util","node:util"],["./observationContract",6],["./executionRegistry",4]],[["../kernel/canonicalValue",0]],[["node:crypto","node:crypto"],["node:util","node:util"],["../kernel/canonicalValue",0],["./observationContract",6]],[["./civilCalendar",1]],[["../kernel/canonicalValue",0],["node:util","node:util"],["./observationScalars",7]],[],[["node:process","node:process"],["./civilCalendar",1],["./literalTypes",5],["./observationContract",6],["./executionProfile",3]],[["./observationContract",6],["./pinnedCivilTimezone",8],["../kernel/canonicalValue",0]],[],[["./observationContract",6],["../kernel/canonicalValue",0],["./selectedEventDayCoverage",13],["./selectedEventDayOracle",14],["./proofAcceptance",9],["./selectedDayCapturedAdjudicationRecipe",10]],[["./observationContract",6],["../kernel/canonicalValue",0]],[["./observationContract",6],["../kernel/canonicalValue",0],["./proofAcceptance",9],["./selectedEventDayCoreComparison",12]],[["./observationContract",6],["./claimBinding",2],["../kernel/canonicalValue",0]]];
const cache = new Map();
function load(index) {
if (cache.has(index)) return cache.get(index);
const module = { exports: Object.create(null) };
const localRequire = name => { const edge = edges[index].find(pair => pair[0] === name); if (!edge) throw new Error('guest_bundle_unresolved'); return typeof edge[1] === 'string' ? nativeRequire(edge[1]) : load(edge[1]); };
factories[index](localRequire, module, module.exports, ["kernel","provenance","provenance","provenance","provenance","provenance","provenance","provenance","provenance","provenance","provenance","provenance","provenance","provenance","provenance"][index], ["kernel/canonicalValue.js","provenance/civilCalendar.js","provenance/claimBinding.js","provenance/executionProfile.js","provenance/executionRegistry.js","provenance/literalTypes.js","provenance/observationContract.js","provenance/observationScalars.js","provenance/pinnedCivilTimezone.js","provenance/proofAcceptance.js","provenance/selectedDayCapturedAdjudicationRecipe.js","provenance/selectedEventDayAdjudicator.js","provenance/selectedEventDayCoreComparison.js","provenance/selectedEventDayCoverage.js","provenance/selectedEventDayOracle.js"][index]);
cache.set(index, module.exports); return module.exports;
}
return load(11)["run"];
})