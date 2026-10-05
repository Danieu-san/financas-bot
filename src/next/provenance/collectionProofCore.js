'use strict';
const { readObservedIdentity, sequence } = require('./proofObservedValues');

// Relations over values already obtained by observed reads. These do not read
// backing data, decide selection or accept a financial graph.
function createCollectionProofPrimitives(compareTypedScalars) {
    function members(handle, type) {
        if (!['set', 'sequence'].includes(type.form) || type.item?.form !== 'node') throw new Error('proof_expression_set');
        const seen = new Set();
        return sequence(handle, member => {
            const id = readObservedIdentity(member); const key = JSON.stringify([id.kind, id.ref_id, id.version]);
            if (id.kind !== type.item.kind || type.form === 'set' && seen.has(key)) throw new Error('proof_expression_member');
            seen.add(key); return member;
        });
    }
    function sameField(values, type) {
        return values.length > 0 && values.every(value => compareTypedScalars(type, value, values[0]) === 0);
    }
    function join(left, right, type) {
        for (const side of [left, right]) for (let index = 0; index < side.length; index++) for (let previous = 0; previous < index; previous++) {
            if (compareTypedScalars(type, side[index], side[previous]) === 0) throw new Error('proof_expression_join_duplicate');
        }
        return left.length === right.length && left.every(value => right.some(other => compareTypedScalars(type, value, other) === 0));
    }
    function ordered(rows, keys) {
        let ordered = true;
        for (let index = 1; index < rows.length; index++) {
            let comparison = 0;
            for (let key = 0; key < keys.length && comparison === 0; key++) comparison = compareTypedScalars(keys[key].type,
                rows[index - 1].values[key], rows[index].values[key]) * (keys[key].direction === 'asc' ? 1 : -1);
            for (const key of ['kind', 'ref_id', 'version']) {
                if (comparison) break;
                const a = rows[index - 1].identity[key]; const b = rows[index].identity[key];
                comparison = a === b ? 0 : a < b ? -1 : 1;
            }
            if (comparison === 0) throw new Error('proof_expression_sort_unresolved_tie');
            if (comparison > 0) ordered = false;
        }
        return ordered;
    }
    function quantify(nodes, predicate) {
        let all = true; let any = false;
        for (const member of nodes) {
            const conjunction = predicate(member);
            if (typeof conjunction !== 'boolean') throw new Error('proof_expression_template_result');
            if (!conjunction) all = false;
            if (conjunction) any = true;
        }
        return { all, any };
    }
    return Object.freeze({ members, sameField, join, ordered, quantify });
}
module.exports = { createCollectionProofPrimitives };
