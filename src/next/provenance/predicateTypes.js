'use strict';

const { unifyOperatorTypes } = require('./operatorTypes');
const { validateLiteral } = require('./literalTypes');
const { parseDate, parseMonth, dayOrdinal } = require('./civilCalendar');
const { freezeDeep } = require('../kernel/canonicalValue');
const fail = code => { throw new Error(`predicate_types_${code}`); };
const own = (value, key) => value !== null && typeof value === 'object' && Object.hasOwn(value, key);
const scalar = (type, extra = {}) => ({ form: 'scalar', type, ...extra });
const nodeType = kind => ({ form: 'node', kind });
const enumType = values => scalar('enum', { values, domain: JSON.stringify([...values].sort()) });
const subjectKinds = Object.freeze({ source: 'source_state', merchant: 'merchant_identity', transfer_pair: 'transfer_identity' });

// Schemas have already been validated by the admitted, static validator. This
// resolves their local discriminated branches; it is not another JSON Schema
// validator or a fallback to the shape/type of a primitive runtime value.
function claimSchemaPath(root, claim, segments) {
    function resolve(schema, value) {
        if (schema.$ref) {
            const match = /^#\/definitions\/([A-Za-z0-9_]+)$/.exec(schema.$ref);
            if (!match || !own(root.definitions, match[1])) fail('claim_schema_ref');
            return { ...resolve(root.definitions[match[1]], value), ref: match[1] };
        }
        if (schema.oneOf) {
            const candidates = schema.oneOf.filter(branch => value && typeof value === 'object'
                && (branch.required || []).every(key => own(value, key))
                && Object.entries(branch.properties || {}).every(([key, property]) =>
                    (!own(property, 'const') || value[key] === property.const)
                    && (!property.enum || property.enum.includes(value[key]))));
            if (candidates.length !== 1) fail('claim_schema_branch');
            return resolve(candidates[0], value);
        }
        return { schema };
    }
    let current = resolve(root.definitions.claim, claim);
    let value = claim;
    for (const segment of segments) {
        if (!own(current.schema.properties, segment) || !own(value, segment)) fail('claim_path');
        value = value[segment];
        current = resolve(current.schema.properties[segment], value);
    }
    return { ...current, value };
}

// Internal pass after admission, schemas, identity/edge indexing and template
// validation. This function alone does not establish those preconditions.
function compilePredicateTypes({ graphs, claims, snapshots, materialRegistry, operatorRegistry, claimSchema }) {
    const claimMap = new Map(claims.map(claim => [claim.fact_key, claim]));
    const operators = new Map(operatorRegistry.operators.map(operator => [operator.id, operator]));
    const tuple = node => JSON.stringify([node.kind, node.ref_id, node.version]);
    const snapshotMap = new Map(snapshots.map(snapshot => [tuple(snapshot), snapshot]));
    let count = 0;
    const typedGraphs = [];
    function irType(type) {
        const result = {};
        for (const key of ['form', 'type', 'kind', 'unit', 'domain', 'target', 'periodKind']) {
            if (own(type, key)) result[key] = type[key];
        }
        if (type.item) result.item = irType(type.item);
        if (type.value) result.value = irType(type.value);
        return result;
    }
    for (const graph of graphs) {
        const typedPredicates = [];
        const claim = claimMap.get(graph.fact_key);
        if (!claim) fail('claim_missing');
        const node = alias => {
            if (!own(graph.nodes, alias)) fail('node_missing');
            return graph.nodes[alias];
        };
        const payload = alias => snapshotMap.get(tuple(node(alias)))?.payload;
        const fields = kind => {
            if (!own(materialRegistry.kinds, kind)) fail('kind_missing');
            return materialRegistry.kinds[kind].fields;
        };
        function fieldDescriptor(kind, segments) {
            if (!Array.isArray(segments) || segments.length !== 1) fail('field_path');
            const registryFields = fields(kind);
            if (!own(registryFields, segments[0]) || registryFields[segments[0]].class === 'non_material') fail('field_material');
            return registryFields[segments[0]];
        }
        function targetKind(alias, name, descriptor) {
            if (node(alias).kind === 'collection' && name === 'members') {
                const origin = payload(alias)?.collection_name;
                const candidates = Object.entries(materialRegistry.kinds).filter(([, kind]) => kind.origin === origin);
                if (candidates.length !== 1 || !descriptor.targets.includes(candidates[0][0])) fail('collection_origin');
                for (const ref of payload(alias).members) {
                    const targets = snapshots.filter(snapshot => descriptor.targets.includes(snapshot.kind) && snapshot.ref_id === ref);
                    if (targets.length !== 1 || targets[0].kind !== candidates[0][0]) fail('collection_member_kind');
                }
                return candidates[0][0];
            }
            if (descriptor.targets.length === 1) return descriptor.targets[0];
            const ref = payload(alias)?.[name];
            const matches = snapshots.filter(snapshot => descriptor.targets.includes(snapshot.kind) && snapshot.ref_id === ref);
            if (matches.length !== 1) fail('reference_nominal_unresolved');
            return matches[0].kind;
        }
        function fieldValue(kind, name, descriptor, alias) {
            let value;
            if (descriptor.type === 'id') value = scalar('id', { kind: name === 'id' ? kind : `${kind}.${name}` });
            else if (descriptor.type === 'ref') {
                const target = alias ? targetKind(alias, name, descriptor)
                    : descriptor.targets.length === 1 ? descriptor.targets[0] : null;
                if (!target) fail('reference_nominal_unresolved');
                value = scalar('id', { kind: target });
            } else if (descriptor.type === 'enum') value = enumType(descriptor.values);
            else if (descriptor.type === 'money_minor') value = scalar('money_minor', { unit: 'BRL_minor' });
            else if (descriptor.type === 'ref_list') {
                const target = alias ? targetKind(alias, name, descriptor)
                    : descriptor.targets.length === 1 ? descriptor.targets[0] : null;
                if (!target) fail('reference_nominal_unresolved');
                value = { form: 'sequence', item: scalar('id', { kind: target }) };
            } else if (['typed_result', 'typed_period', 'role_ref_list'].includes(descriptor.type)) value = { form: 'record', type: descriptor.type };
            else value = scalar(descriptor.type);
            if (alias && own(payload(alias), name)) value.known = payload(alias)[name];
            return value;
        }
        function field(ref) {
            const kind = node(ref.node).kind;
            return { form: 'field', value: fieldValue(kind, ref.segments[0], fieldDescriptor(kind, ref.segments), ref.node) };
        }
        function claimField(ref) {
            const { schema, ref: schemaRef, value } = claimSchemaPath(claimSchema, claim, ref.segments);
            const path = ref.segments.join('.');
            let type;
            if (path === 'period') type = { form: claim.period.kind === 'range' ? 'range' : 'period', periodKind: claim.period.kind };
            else if (schemaRef === 'date' || schemaRef === 'month') type = scalar(schemaRef);
            else if (schema.enum || own(schema, 'const')) type = enumType(schema.enum || [schema.const]);
            else if (schemaRef === 'id') {
                let kind;
                if (path === 'subject.ref_id') kind = subjectKinds[claim.subject.kind] || claim.subject.kind;
                else if (/^subject\.(family|person|category|budget)_id$/.test(path)) kind = ref.segments[1].slice(0, -3);
                else kind = `claim.${path}`;
                type = scalar('id', { kind });
            } else if (schema.type === 'integer') type = scalar(schema.minimum >= 1 ? 'positive_integer' : 'integer');
            else if (schema.type === 'boolean') type = scalar('boolean');
            else if (schema.type === 'object') type = { form: 'record' };
            else if (schema.type === 'array') type = { form: 'sequence', item: scalar('id', { kind: path === 'subject.person_ids' ? 'person' : `claim.${path}` }) };
            else if (schema.type === 'string') type = scalar('text');
            else fail('claim_type');
            return { ...type, known: value };
        }
        const setKinds = new Map();
        function hint(name, kind) {
            if (!own(graph.sets, name)) fail('set_missing');
            if (!kind) return false;
            if (setKinds.has(name) && setKinds.get(name) !== kind) fail('set_kind');
            const changed = !setKinds.has(name);
            setKinds.set(name, kind);
            return changed;
        }
        for (const [name, members] of Object.entries(graph.sets)) for (const alias of members) hint(name, node(alias).kind);
        function refSetType(ref) {
            const kind = node(ref.field.node).kind;
            const descriptor = fieldDescriptor(kind, ref.field.segments);
            if (descriptor.type !== 'ref_list') fail('ref_set');
            return targetKind(ref.field.node, ref.field.segments[0], descriptor);
        }
        // Empty sets obtain a kind only from explicit typed relations. No kind
        // is guessed from an empty value or a fact/metric name.
        let changed;
        do {
            changed = false;
            for (const selection of graph.selections) {
                changed = hint(selection.selected_set, setKinds.get(selection.candidate_set)) || changed;
                changed = hint(selection.candidate_set, setKinds.get(selection.selected_set)) || changed;
            }
            for (const predicate of graph.predicates) {
                if (predicate.op === 'set_eq' || predicate.op === 'set_subset') {
                    const [left, right] = predicate.args;
                    const type = arg => arg.ref_set ? refSetType(arg.ref_set) : arg.set ? setKinds.get(arg.set) : null;
                    if (left.set) changed = hint(left.set, type(right)) || changed;
                    if (right.set) changed = hint(right.set, type(left)) || changed;
                }
                const setArg = predicate.args.find(arg => arg.set);
                const template = predicate.args.find(arg => arg.template);
                if (setArg && template) for (const binding of Object.values(template.bindings)) {
                    if (binding.selector) changed = hint(setArg.set, binding.selector.kind) || changed;
                }
            }
        } while (changed);
        function set(name) {
            if (!setKinds.has(name)) fail('set_kind_unresolved');
            return { form: 'set', item: nodeType(setKinds.get(name)) };
        }
        function window(id) {
            if (!own(graph.windows, id)) fail('window_missing');
            const value = graph.windows[id];
            if (value.kind === 'month') {
                const month = raw(value.value);
                const type = month.form === 'field' ? month.value : month;
                if (type.type !== 'month') fail('window_type');
                if (own(type, 'known')) parseMonth(type.known);
                return { form: 'period', periodKind: 'month' };
            }
            if (value.kind !== 'range') fail('window_type');
            const limits = [value.start, value.end].map(arg => {
                const result = raw(arg);
                const type = result.form === 'field' ? result.value : result;
                if (type.type !== 'date') fail('window_type');
                if (own(type, 'known')) parseDate(type.known);
                return type;
            });
            if (limits.every(limit => own(limit, 'known')) && dayOrdinal(limits[0].known) > dayOrdinal(limits[1].known)) fail('window_order');
            return { form: 'range', periodKind: 'range', limits };
        }
        function raw(arg) {
            if (arg.node) return nodeType(node(arg.node).kind);
            if (arg.field) return field(arg.field);
            if (arg.claim) return claimField(arg.claim);
            if (arg.literal) {
                const type = validateLiteral(arg.literal);
                return { ...scalar(type, type === 'money_minor' ? { unit: 'BRL_minor' } : {}), literal: true, known: arg.literal.value };
            }
            if (arg.presence) { field(arg.presence); return scalar('boolean'); }
            if (arg.set) return set(arg.set);
            if (arg.ref_set) return { form: 'set', item: nodeType(refSetType(arg.ref_set)) };
            if (arg.edge) {
                const edge = graph.edges.find(edge => edge.id === arg.edge);
                if (!edge) fail('edge_missing');
                return { form: 'edge', target: node(edge.target).kind };
            }
            if (arg.selector) {
                const descriptor = fieldDescriptor(arg.selector.kind, arg.selector.segments);
                return { form: 'field_selector', kind: arg.selector.kind,
                    value: fieldValue(arg.selector.kind, arg.selector.segments[0], descriptor), descriptor };
            }
            if (arg.period_ref) return window(arg.period_ref);
            if (arg.period_bound) {
                const period = window(arg.period_bound.period);
                if (period.form !== 'range' || !['start', 'end'].includes(arg.period_bound.bound)) fail('window_bound');
                return period.limits[arg.period_bound.bound === 'start' ? 0 : 1];
            }
            if (arg.period_literal) return { form: arg.period_literal.kind === 'range' ? 'range' : 'period', periodKind: arg.period_literal.kind };
            if (arg.template) {
                const kinds = [...new Set(Object.values(arg.bindings).filter(binding => binding.selector).map(binding => binding.selector.kind))];
                if (kinds.length !== 1) fail('template_kind');
                return { form: 'predicate_template_ref', kind: kinds[0] };
            }
            if (arg.projection) {
                const member = set(arg.projection.set);
                const selector = raw({ selector: arg.projection.selector });
                if (member.item.kind !== selector.kind) fail('projection_kind');
                return { form: arg.projection.as, item: selector.value };
            }
            if (arg.sort) {
                const kinds = [...new Set(arg.sort.keys.map(key => raw({ selector: key.selector }).kind))];
                if (kinds.length !== 1) fail('sort_kind');
                return { form: 'sort', kind: kinds[0] };
            }
            if (arg.partial_policy) fail('partial_policy_missing');
            fail('argument_unresolved');
        }
        for (const id of Object.keys(graph.windows || {})) window(id);
        for (const predicate of graph.predicates) {
            const operator = operators.get(predicate.op);
            if (!operator || operator.args.length !== predicate.args.length) fail('operator');
            const rawTypes = predicate.args.map(raw);
            const scalarView = type => type.form === 'field' ? type.value : type;
            const peers = rawTypes.filter(type => !type.literal).map(scalarView);
            const types = rawTypes.map((original, index) => {
                const signature = operator.args[index];
                let type = scalarView(original);
                if (original.form === 'field' && (signature === 'field_path:T' || signature === 'state_path')) return original;
                if (signature.startsWith('edge_selector:')) {
                    if (original.form !== 'field_selector' || original.descriptor.type !== 'ref'
                        || original.descriptor.targets.length !== 1) fail('edge_selector');
                    return { form: 'edge_selector', kind: original.kind, target: original.descriptor.targets[0] };
                }
                if (signature === 'kind_literal' || signature === 'digest_literal') {
                    if (!type.literal || type.type !== (signature === 'kind_literal' ? 'kind' : 'digest')) fail('literal_type');
                    if (type.type === 'kind' && !own(materialRegistry.kinds, type.known)) fail('kind_missing');
                    return { form: signature };
                }
                if (signature === 'state_literal') {
                    if (!type.literal || type.type !== 'enum') fail('literal_type');
                    const peer = peers.find(peer => peer.type === 'enum');
                    if (!peer?.values?.includes(type.known)) fail('enum_value');
                    return { form: signature };
                }
                if (signature === 'scalar:T' && type.literal && ['id', 'enum'].includes(type.type)) {
                    const matches = peers.filter(peer => peer.form === 'scalar' && peer.type === type.type);
                    if (matches.length === 1) {
                        if (matches[0].values && !matches[0].values.includes(type.known)) fail('enum_value');
                        type = { ...matches[0], literal: true, known: type.known };
                    }
                }
                if (signature === 'calendar' || signature === 'timezone') {
                    const allowed = materialRegistry.kinds.evaluation_policy?.fields?.[signature]?.values;
                    if (type.type !== 'enum' || !Array.isArray(allowed) || !allowed.length) fail('policy_type');
                    if (type.literal) {
                        if (!allowed.includes(type.known)) fail('policy_value');
                    } else if (!type.values || type.values.length !== allowed.length || type.values.some(value => !allowed.includes(value))) fail('policy_type');
                    if (signature === 'calendar' && (allowed.length !== 1 || allowed[0] !== 'proleptic_gregorian')) fail('calendar');
                    return scalar(signature);
                }
                if (signature === 'civil_unit') {
                    if (!type.literal || type.type !== 'enum' || !['day', 'month'].includes(type.known)) fail('civil_unit');
                    return scalar('civil_unit');
                }
                if (signature === 'number:U' && type.literal && type.type === 'money_minor') return scalar('money_minor', { unit: 'BRL_minor' });
                if (type.literal && type.type === 'integer' && ['positive_integer', 'nonnegative_integer'].includes(signature)) {
                    if (type.known < (signature === 'positive_integer' ? 1 : 0)) fail('integer_refinement');
                    return scalar(signature);
                }
                return type;
            });
            try { unifyOperatorTypes(operator, types); }
            catch (error) {
                // Compiler diagnostics identify declarations, never operand values.
                throw new Error(`${error.message}:${graph.fact_key}:${predicate.id}`, { cause: error });
            }
            typedPredicates.push({ id: predicate.id, op: predicate.op,
                obligation: predicate.obligation, atom: predicate.atom,
                operands: types.map((type, index) => ({ type: irType(type),
                    source: structuredClone(predicate.args[index]) })) });
            count++;
        }
        typedGraphs.push({ fact_key: graph.fact_key, claim_id: graph.claim_id, predicates: typedPredicates });
    }
    // Partial IR: no evaluator, proof result, snapshot values, or execution
    // authority. Full graph lowering and the execution gate remain mandatory.
    return freezeDeep({ stage: 'predicate_types_checked_only', graphs: graphs.length,
        predicates: count, unresolved: 0, typedGraphs });
}

module.exports = { compilePredicateTypes };
