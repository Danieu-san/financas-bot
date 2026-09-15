'use strict';
const { digest } = require('../kernel/canonicalValue');
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
