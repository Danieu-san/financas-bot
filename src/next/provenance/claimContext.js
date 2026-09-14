'use strict';
const { copyData } = require('./observationContract');
const fail = () => { throw new Error('claim_context_projection'); };
const FIELDS = Object.freeze(['claim_id', 'fact_key', 'metric', 'unit', 'subject', 'period',
    'time_basis', 'coverage', 'evidence_state', 'filters', 'evaluator_ref']);

// Internal projection AFTER claim/schema admission. This is not a schema
// validator. Branches follow explicit schema discriminants, never a guessed
// shape inferred from the JavaScript value. The schema is a trusted, admitted
// authority; it is not supplied by an evaluator. No R or binding table enters.
function projectClaimContext(rawClaim, admittedSchema) {
    const claim = copyData(rawClaim);
    if (!claim || typeof claim !== 'object' || Array.isArray(claim)) fail();
    function project(schema, value, depth = 0, refs = []) {
        if (depth > 32 || !schema || typeof schema !== 'object') fail();
        if (schema.$ref) {
            const match = /^#\/definitions\/([A-Za-z0-9_]+)$/.exec(schema.$ref);
            if (!match || refs.includes(match[1]) || !Object.hasOwn(admittedSchema.definitions, match[1])) fail();
            return project(admittedSchema.definitions[match[1]], value, depth + 1, [...refs, match[1]]);
        }
        if (schema.oneOf) {
            if (!value || typeof value !== 'object') fail();
            const branches = schema.oneOf.filter(branch => (branch.required || []).every(key => Object.hasOwn(value, key))
                && Object.entries(branch.properties || {}).every(([key, item]) =>
                    (!Object.hasOwn(item, 'const') || value[key] === item.const)
                    && (!item.enum || item.enum.includes(value[key]))));
            if (branches.length !== 1) fail();
            return project(branches[0], value, depth + 1, refs);
        }
        if (schema.type === 'object') {
            if (schema.additionalProperties !== false || !schema.properties) fail();
            return { type: 'record', fields: Object.fromEntries(Object.entries(schema.properties).map(([key, child]) =>
                [key, project(child, value?.[key], depth + 1, refs)])) };
        }
        if (schema.type === 'array') {
            if (!schema.items || Array.isArray(schema.items)) fail();
            return { type: 'sequence', item: project(schema.items, undefined, depth + 1, refs) };
        }
        if (['string', 'integer', 'boolean'].includes(schema.type)
            || Array.isArray(schema.enum) && schema.enum.every(v => ['string', 'boolean', 'number'].includes(typeof v))
            || Object.hasOwn(schema, 'const') && ['string', 'boolean', 'number'].includes(typeof schema.const)) return { type: 'scalar' };
        fail();
    }
    const properties = admittedSchema?.definitions?.claim?.properties;
    if (!properties) fail();
    const fields = Object.fromEntries(FIELDS.map(name => {
        if (!Object.hasOwn(properties, name)) fail();
        return [name, project(properties[name], claim[name])];
    }));
    return copyData({ shape: { type: 'record', fields },
        value: Object.fromEntries(FIELDS.filter(name => Object.hasOwn(claim, name)).map(name => [name, claim[name]])) });
}

module.exports = { projectClaimContext };
