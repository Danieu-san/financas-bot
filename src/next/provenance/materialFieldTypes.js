'use strict';
// Existing scalar projection for material selectors, shared at build time and
// by the trusted development dispatcher. Registry admission remains separate.
function materialFieldType(kind, segments, descriptor) {
    if (!Array.isArray(segments) || segments.length !== 1 || !descriptor
        || descriptor.class === 'non_material') throw new Error('proof_expression_scalar');
    if (['ref', 'id'].includes(descriptor.type)) {
        const nominal = descriptor.type === 'id' ? (segments[0] === 'id' ? kind : `${kind}.${segments[0]}`)
            : descriptor.targets?.length === 1 ? descriptor.targets[0] : null;
        if (!nominal) throw new Error('proof_expression_nominal');
        return { form: 'scalar', type: 'id', kind: nominal };
    }
    if (descriptor.type === 'enum') return { form: 'scalar', type: 'enum', domain: JSON.stringify([...descriptor.values].sort()) };
    if (descriptor.type === 'money_minor') return { form: 'scalar', type: 'money_minor', unit: 'BRL_minor' };
    if (['ref_list', 'role_ref_list', 'typed_period', 'typed_result'].includes(descriptor.type)) throw new Error('proof_expression_scalar');
    return { form: 'scalar', type: descriptor.type };
}
module.exports = { materialFieldType };
