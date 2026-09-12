'use strict';

const { digest } = require('../kernel/canonicalValue');
const { unifyOperatorTypes } = require('./operatorTypes');
const { validateLiteral } = require('./literalTypes');
const fail = code => { throw new Error(`template_reference_${code}`); };
const own = (value, key) => value !== null && typeof value === 'object' && Object.hasOwn(value, key);
function closed(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).length !== keys.length || keys.some(key => !own(value, key))) fail('shape');
}
function identity(id, version) {
    if (typeof id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(id)
        || !Number.isSafeInteger(version) || version < 1) fail('identity');
    return JSON.stringify([id, version]);
}

/** References and bound template signatures only, not graph-wide typed IR. */
function validateTemplateReferences({ graphs, templates, operators, materialRegistry, claims }) {
    closed(templates, ['schema_version', 'registry_id', 'registry_version', 'stage', 'templates']);
    if (templates.schema_version !== 1 || templates.registry_version !== 1
        || templates.registry_id !== 'predicate_templates' || templates.stage !== 'authoring'
        || !Array.isArray(templates.templates)) fail('registry');
    const operatorMap = new Map();
    for (const op of operators) {
        if (operatorMap.has(op.id)) fail('operator_duplicate');
        operatorMap.set(op.id, op);
    }
    const parameterSignatures = new Set(operators.flatMap(op => op.args));
    for (const signature of ['field_selector:K:date', 'field_selector:K:enum', 'boolean', 'enum', 'date', 'text']) {
        parameterSignatures.add(signature);
    }
    const entries = new Map();
    for (const template of templates.templates) {
        closed(template, ['id', 'version', 'parameters', 'body']);
        const key = identity(template.id, template.version);
        if (entries.has(key)) fail('duplicate');
        if (!template.parameters || typeof template.parameters !== 'object' || Array.isArray(template.parameters)) fail('parameters');
        if (!Array.isArray(template.body) || !template.body.length) fail('body');
        const parameters = Object.keys(template.parameters);
        for (const name of parameters) {
            if (!/^[a-z][a-z0-9_]*$/.test(name)) fail('parameter');
            if (!parameterSignatures.has(template.parameters[name])) fail('signature');
        }
        const used = new Set();
        for (const predicate of template.body) {
            closed(predicate, ['op', 'args']);
            const operator = operatorMap.get(predicate.op);
            if (!operator || !Array.isArray(predicate.args) || predicate.args.length !== operator.args.length) fail('operator');
            for (const arg of predicate.args) {
                if (!arg || typeof arg !== 'object' || Array.isArray(arg) || Object.keys(arg).length !== 1) fail('argument');
                const kind = Object.keys(arg)[0];
                if (!['parameter', 'current_member_field_parameter'].includes(kind)) fail('argument');
                const name = arg[kind];
                if (!own(template.parameters, name)) fail('parameter');
                if (kind === 'current_member_field_parameter' && !template.parameters[name].startsWith('field_selector:')) fail('member_selector');
                used.add(name);
            }
        }
        if (used.size !== parameters.length) fail('unused_parameter');
        entries.set(key, { template, hash: `sha256:${digest(template)}` });
    }
    let references = 0;
    const claimMap = new Map((claims || []).map(claim => [claim.fact_key, claim]));
    function fieldType(kind, segments) {
        if (!Array.isArray(segments) || segments.length !== 1) fail('binding_path');
        const descriptor = materialRegistry?.kinds?.[kind]?.fields?.[segments[0]];
        if (!descriptor || descriptor.class === 'non_material') fail('binding_field');
        const value = { form: 'scalar', type: descriptor.type };
        if (descriptor.type === 'id') value.kind = kind;
        if (descriptor.type === 'ref') {
            if (descriptor.targets.length !== 1) fail('binding_nominal_unresolved');
            value.type = 'id';
            value.kind = descriptor.targets[0];
        }
        if (descriptor.type === 'money_minor') value.unit = 'BRL_minor';
        if (descriptor.type === 'enum') {
            value.domain = JSON.stringify([...descriptor.values].sort());
            value.values = descriptor.values;
        }
        return value;
    }
    function scalarBinding(arg, graph, claim) {
        if (arg.field) {
            const node = graph.nodes[arg.field.node];
            if (!node) fail('binding_node');
            return fieldType(node.kind, arg.field.segments);
        }
        if (arg.literal) return { form: 'scalar', type: validateLiteral(arg.literal) };
        if (arg.claim && claim) {
            const path = arg.claim.segments.join('.');
            if (path === 'period.start' || path === 'period.end') {
                if (claim.period.kind !== 'range') fail('binding_period');
                return { form: 'scalar', type: 'date' };
            }
            if (path === 'period.value') {
                const kinds = { date: 'date', as_of: 'date', through: 'date', statement_due: 'date',
                    month: 'month', statement_competence: 'month', budget_cycle: 'month' };
                if (!own(kinds, claim.period.kind)) fail('binding_period');
                return { form: 'scalar', type: kinds[claim.period.kind] };
            }
        }
        fail('binding_unresolved');
    }
    function binding(arg, graph, claim) {
        if (arg.selector) return { form: 'field_selector', kind: arg.selector.kind,
            value: fieldType(arg.selector.kind, arg.selector.segments) };
        if (arg.period_ref) {
            const window = graph.windows?.[arg.period_ref];
            if (!window) fail('binding_period');
            if (window.kind === 'range') {
                if (scalarBinding(window.start, graph, claim).type !== 'date'
                    || scalarBinding(window.end, graph, claim).type !== 'date') fail('binding_period_type');
                return { form: 'range', periodKind: 'range' };
            }
            if (window.kind !== 'month' || scalarBinding(window.value, graph, claim).type !== 'month') fail('binding_period_type');
            return { form: 'period', periodKind: 'month' };
        }
        if (arg.period_literal) return { form: arg.period_literal.kind === 'range' ? 'range' : 'period', periodKind: arg.period_literal.kind };
        if (arg.claim?.segments.length === 1 && arg.claim.segments[0] === 'period') {
            if (!claim) fail('binding_claim');
            return { form: claim.period.kind === 'range' ? 'range' : 'period', periodKind: claim.period.kind };
        }
        return scalarBinding(arg, graph, claim);
    }
    for (const graph of graphs) for (const predicate of graph.predicates) for (const arg of predicate.args) {
        if (!own(arg, 'template')) continue;
        closed(arg, ['template', 'bindings']);
        closed(arg.template, ['id', 'version', 'hash']);
        const entry = entries.get(identity(arg.template.id, arg.template.version));
        if (!entry) fail('missing');
        if (entry.hash !== arg.template.hash) fail('hash');
        const names = Object.keys(entry.template.parameters);
        if (!arg.bindings || typeof arg.bindings !== 'object' || Array.isArray(arg.bindings)
            || Object.keys(arg.bindings).length !== names.length || names.some(name => !own(arg.bindings, name))) fail('bindings');
        const types = new Map(names.map(name => [name, binding(arg.bindings[name], graph, claimMap.get(graph.fact_key))]));
        // Literals carry syntax types; their nominal domain comes from a typed
        // parameter, never from matching a string to a snapshot identifier.
        const typedT = names.filter(name => entry.template.parameters[name].startsWith('field_selector:'))
            .map(name => types.get(name).value);
        for (const name of names) {
            const literal = arg.bindings[name].literal;
            if (!literal) continue;
            const peers = typedT.filter(type => type.type === literal.type);
            if (peers.length === 1 && ['id', 'enum', 'money_minor'].includes(literal.type)) {
                if (peers[0].values && !peers[0].values.includes(literal.value)) fail('binding_enum');
                types.set(name, peers[0]);
            }
        }
        unifyOperatorTypes({ args: names.map(name => entry.template.parameters[name]) }, names.map(name => types.get(name)));
        for (const part of entry.template.body) {
            const operator = operatorMap.get(part.op);
            const bodyTypes = part.args.map((value, index) => {
                let type;
                if (own(value, 'current_member_field_parameter')) type = types.get(value.current_member_field_parameter).value;
                else type = types.get(value.parameter);
                if (operator.args[index] === 'state_path' || operator.args[index] === 'field_path:T') return { form: 'field', value: type };
                if (operator.args[index] === 'state_literal') {
                    if (type.form !== 'scalar' || type.type !== 'enum') fail('binding_state');
                    return { form: 'state_literal' };
                }
                return type;
            });
            unifyOperatorTypes(operator, bodyTypes);
        }
        const memberKinds = names.filter(name => types.get(name).form === 'field_selector').map(name => types.get(name).kind);
        for (const operand of predicate.args) if (operand.set) {
            for (const alias of graph.sets[operand.set]) {
                if (memberKinds.some(kind => graph.nodes[alias]?.kind !== kind)) fail('binding_member_kind');
            }
        }
        references++;
    }
    return Object.freeze({ stage: 'template_references_checked_only', templates: entries.size, references });
}

module.exports = { validateTemplateReferences };
