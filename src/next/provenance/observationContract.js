'use strict';
const { types } = require('node:util');
const fail = () => { throw new Error('observation_shape_invalid'); };
const identifier = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:#/-]{0,127}$/.test(v);
const field = v => typeof v === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(v)
    && !['__proto__', 'constructor', 'prototype'].includes(v);
const scalar = v => v === null || typeof v === 'boolean' || typeof v === 'string' && v.length <= 65536
    || typeof v === 'number' && Number.isSafeInteger(v) && !Object.is(v, -0);

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
        || !['data', 'keys', 'operand_set'].includes(e[5]) || !Array.isArray(e[6])) fail();
    const o = e[6]; const tag = o[0];
    const nodeSet = e[5] === 'operand_set';
    if (nodeSet && (e[2] !== `operand/${e[3]}`
        || !['length', 'includes', 'at', 'iterate', 'next', 'return', 'reuse_iterator'].includes(e[1])
        || (['at', 'next'].includes(e[1])
            ? e[4].length !== 1 || !Number.isSafeInteger(e[4][0]) || e[4][0] < 0 || Object.is(e[4][0], -0)
            : e[4].length !== 0))) fail();
    const valueOutcome = tag === 'scalar' && o.length === 2 && scalar(o[1])
        || tag === 'container' && o.length === 2 && ['record', 'sequence'].includes(o[1]);
    const accessOutcome = nodeSet ? tag === 'node' && o.length === 2 && identifier(o[1]) : valueOutcome;
    let valid = false;
    switch (e[1]) {
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
