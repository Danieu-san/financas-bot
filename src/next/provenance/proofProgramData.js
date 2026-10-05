'use strict';
const { field, scalar } = require('./observationScalars');

// Guest-local program values only. NOT transport/output admission: the TCB
// wrappers retain node:util.types.isProxy before inspecting untrusted data.
// The measured program constructs these values from constants and observed
// scalars. No host predicate, native API or raw evidence is endowed here.
function copyProgramData(input) {
    let count = 0; let characters = 0; const ancestors = new Set();
    const fail = () => { throw new Error('proof_program_data_invalid'); };
    function copy(value, depth) {
        if (++count > 65536 || depth > 32) fail();
        if (scalar(value)) {
            if (typeof value === 'string' && (characters += value.length) > 1048576) fail();
            return value;
        }
        if (!value || typeof value !== 'object' || ancestors.has(value)) fail();
        const array = Array.isArray(value);
        if (array ? Object.getPrototypeOf(value) !== Array.prototype
            : ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail();
        const descriptors = Object.getOwnPropertyDescriptors(value);
        const keys = Reflect.ownKeys(descriptors);
        if (keys.some(key => typeof key !== 'string') || keys.length > 65536) fail();
        ancestors.add(value);
        let result;
        if (array) {
            const length = descriptors.length.value;
            if (keys.length !== length + 1) fail();
            result = [];
            for (let index = 0; index < length; index++) {
                const item = descriptors[index];
                if (!item || !item.enumerable || !Object.hasOwn(item, 'value')) fail();
                result.push(copy(item.value, depth + 1));
            }
        } else {
            result = Object.create(null);
            for (const key of keys) {
                const item = descriptors[key];
                if (!field(key)
                    || !item.enumerable || !Object.hasOwn(item, 'value')) fail();
                result[key] = copy(item.value, depth + 1);
            }
        }
        ancestors.delete(value); return Object.freeze(result);
    }
    return copy(input, 0);
}
module.exports = { copyProgramData };
