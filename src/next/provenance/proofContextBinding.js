'use strict';
const { copyData } = require('./observationContract');

// Internal TCB binding of an already schema-admitted claim projection.
// The guest receives neither this expected data nor a binding callback.
// Reads are performed on live handles; no trace or acceptance is fabricated.
function bindObservedContext(rawExpected, handle) {
    const expected = copyData(rawExpected);
    const invalid = () => { throw new Error('proof_context_binding'); };
    function bind(value, actual) {
        if (Array.isArray(value)) {
            if (actual.length() !== value.length) invalid();
            for (let index = 0; index < value.length; index++) bind(value[index], actual.at(index));
        } else if (value !== null && typeof value === 'object') {
            for (const [name, item] of Object.entries(value)) bind(item, actual.get(name));
        } else if (actual !== value) invalid();
    }
    bind(expected, handle);
}
module.exports = { bindObservedContext };
