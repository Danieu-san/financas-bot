'use strict';
// HARNESS candidate only: this module never activates v2 or grants runtime credit.
const { createHash } = require('node:crypto');
const { types } = require('node:util');
const { canonicalValue, freezeDeep } = require('../kernel/canonicalValue');
const { copyData } = require('./observationContract');
const { admittedDocuments } = require('./packageContract');
const prefix = 'docs/contracts/next/provenance-v2/';
const ADDENDUM = 'f892a35fce88fe21d474bd7ed408fe2697052ce7';
const FROZEN_V1_HASH = 'sha256:2509cb7df02a98a1217a416c70b5f729b40ca331314ce2d925005ec15a779a9d';
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const id = (version, family, target) => sha(canonicalValue({ domain: 'financasbot.mutation-requirement.' + version, family, target }));
const fail = code => { throw new Error('path_inventory_v2_' + code); };
const clone = value => JSON.parse(JSON.stringify(copyData(value)));
const equal = (a, b) => canonicalValue(a) === canonicalValue(b);
const namespaces = Object.freeze({ node: 'nodes', edge: 'edges', set: 'sets',
    period_ref: 'windows', period: 'windows', template: 'predicate_templates' });
const inventoryContexts = new WeakMap();
const admissionContexts = new WeakMap();
const semanticContexts = new WeakMap();
const singleSiteProjections = new WeakMap();
function fields(raw, names) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const descriptors = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(descriptors).length !== names.length || names.some(name =>
        !descriptors[name]?.enumerable || !Object.hasOwn(descriptors[name], 'value'))) fail('input');
    return Object.fromEntries(names.map(name => [name, descriptors[name].value]));
}
// Schema is passive JSON, not observation data: $ref/$schema are legal keys.
function passiveSchema(raw) {
    let count = 0; const active = new Set();
    function read(value, depth) {
        if (++count > 65536 || depth > 64) fail('schema_limit');
        if (value === null || typeof value === 'string' || typeof value === 'boolean'
            || typeof value === 'number' && Number.isSafeInteger(value)) return value;
        if (!value || typeof value !== 'object' || types.isProxy(value) || active.has(value)) fail('schema_data');
        const array = Array.isArray(value);
        if (array ? Object.getPrototypeOf(value) !== Array.prototype
            : ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('schema_data');
        const d = Object.getOwnPropertyDescriptors(value); const keys = Reflect.ownKeys(d);
        if (keys.some(key => typeof key !== 'string')) fail('schema_data');
        active.add(value);
        let result;
        if (array) {
            if (keys.length !== d.length.value + 1) fail('schema_data');
            result = [];
            for (let i = 0; i < d.length.value; i++) {
                if (!d[i]?.enumerable || !Object.hasOwn(d[i], 'value')) fail('schema_data');
                result.push(read(d[i].value, depth + 1));
            }
        } else {
            result = {};
            for (const key of keys) {
                if (!d[key].enumerable || !Object.hasOwn(d[key], 'value')
                    || ['__proto__', 'constructor', 'prototype'].includes(key)) fail('schema_data');
                result[key] = read(d[key].value, depth + 1);
            }
        }
        active.delete(value); return result;
    }
    return read(raw, 0);
}
function sites(schema, arg, operand_index) {
    const result = [];
    function add(className, at, definition, namespace = null) {
        result.push({ class: className, site_path: at, definition, namespace });
    }
    function walk(value, rule, at, depth) {
        if (depth > 64) fail('schema_recursion');
        if (rule.$ref) {
            if (rule.$ref === 'urn:financasbot:next:claim-contract:2#/definitions/period') {
                if (at.at(-1) !== 'period_literal') fail('period_literal'); return;
            }
            if (!rule.$ref.startsWith('#/definitions/')) fail('schema_reference');
            const name = rule.$ref.slice('#/definitions/'.length);
            if (!Object.hasOwn(schema.definitions, name)) fail('schema_reference');
            if (name === 'literal') return;
            if (['fieldPath', 'claimPath', 'selector'].includes(name)) {
                if (!Array.isArray(value.segments) || !value.segments.length
                    || value.segments.some(token => typeof token !== 'string')) fail('path');
                add('path', [...at, 'segments'], name);
                if (name === 'fieldPath') {
                    if (typeof value.node !== 'string') fail('reference');
                    add('reference', [...at, 'node'], 'id', 'nodes');
                }
                return;
            }
            if (name === 'id' || name === 'reference') {
                const namespace = namespaces[at.at(-1)];
                if (!namespace) fail('unresolved_namespace');
                if (typeof (name === 'id' ? value : value.id) !== 'string') fail('reference');
                add('reference', name === 'id' ? at : [...at, 'id'], name, namespace); return;
            }
            return walk(value, schema.definitions[name], at, depth + 1);
        }
        if (rule.oneOf) {
            const matched = rule.oneOf.filter(branch => value && typeof value === 'object' && !Array.isArray(value)
                && (branch.required || []).every(key => Object.hasOwn(value, key))
                && (branch.additionalProperties !== false || Object.keys(value).every(key => Object.hasOwn(branch.properties || {}, key))));
            if (matched.length !== 1) fail('schema_branch');
            return walk(value, matched[0], at, depth + 1);
        }
        if (rule.anyOf || rule.allOf) fail('schema_composition');
        if (rule.type === 'object') {
            if (!value || typeof value !== 'object' || Array.isArray(value)) fail('schema_object');
            if ((rule.required || []).some(key => !Object.hasOwn(value, key))) fail('schema_required');
            for (const key of Object.keys(value).sort()) {
                const child = rule.properties?.[key] || (typeof rule.additionalProperties === 'object' ? rule.additionalProperties : null);
                if (!child) fail('unclassified_property');
                walk(value[key], child, [...at, key], depth + 1);
            }
        } else if (rule.type === 'array') {
            if (!Array.isArray(value) || !rule.items) fail('schema_array');
            value.forEach((child, index) => walk(child, rule.items, [...at, index], depth + 1));
        } else if (!rule.type && !rule.enum) fail('schema_leaf');
    }
    walk(arg, { $ref: '#/definitions/arg' }, ['args', operand_index], 0);
    if (new Set(result.map(row => canonicalValue(row.site_path))).size !== result.length) fail('duplicate_site');
    return result.sort((a, b) => canonicalValue(a.site_path).localeCompare(canonicalValue(b.site_path)));
}
function enumeratePathSites(rawSchema, rawArg, operand_index) {
    if (!Number.isSafeInteger(operand_index) || operand_index < 0) fail('operand_index');
    return freezeDeep(sites(passiveSchema(rawSchema), clone(rawArg), operand_index));
}

// Independent authored->IR conformance. No compiler/lowerer import, no site
// map supplied by the compiler, and no expansion of template body into sites.
function expectedExpression(arg, templates) {
    if (arg.template) {
        const template = templates.get(canonicalValue([arg.template.id, arg.template.version]));
        if (!template) fail('template_authority');
        const bindings = Object.fromEntries(Object.entries(arg.bindings)
            .map(([name, value]) => [name, expectedExpression(value, templates)]));
        const body = template.body.map(predicate => ({ op: predicate.op, operands: predicate.args.map(value => {
            if (Object.hasOwn(value, 'current_member_field_parameter')) {
                const binding = bindings[value.current_member_field_parameter];
                if (binding?.kind !== 'field_selector') fail('member_binding');
                return { kind: 'member_field', slot: 'current_member', node_kind: binding.node_kind, segments: binding.segments };
            }
            if (!Object.hasOwn(value, 'parameter') || !Object.hasOwn(bindings, value.parameter)) fail('template_parameter');
            return bindings[value.parameter];
        }) }));
        return { kind: 'predicate_template', template_ref: arg.template,
            combinator: 'all', member_slot: 'current_member', bindings, body };
    }
    const forms = Object.keys(arg); if (forms.length !== 1) fail('authored_form');
    const value = arg[forms[0]];
    switch (forms[0]) {
    case 'node': return { kind: 'node_ref', alias: value };
    case 'field': return { kind: 'field_ref', alias: value.node, segments: value.segments };
    case 'claim': return { kind: 'claim_ref', segments: value.segments };
    case 'selector': return { kind: 'field_selector', node_kind: value.kind, segments: value.segments };
    case 'presence': return { kind: 'field_presence', field: expectedExpression({ field: value }, templates) };
    case 'ref_set': return { kind: 'reference_set', field: expectedExpression({ field: value.field }, templates) };
    case 'set': return { kind: 'set_ref', name: value };
    case 'edge': return { kind: 'edge_ref', id: value };
    case 'period_ref': return { kind: 'window_ref', name: value };
    case 'period_bound': return { kind: 'window_bound', name: value.period, bound: value.bound };
    case 'literal': return { kind: 'literal', value_type: value.type, value: value.value };
    case 'period_literal': return { kind: 'period_literal', period: value };
    case 'projection': return { kind: 'projection', set: expectedExpression({ set: value.set }, templates),
        selector: expectedExpression({ selector: value.selector }, templates), as: value.as };
    case 'sort': return { kind: 'sort', tie_break: value.tie_break,
        keys: value.keys.map(key => ({ ...key, selector: expectedExpression({ selector: key.selector }, templates) })) };
    default: fail('ir_unclassified_form');
    }
}
function conformExpression(expected, actual) {
    if (!equal(expected, actual)) fail('ir_expression');
}
function enumeratePathInventoryCandidate(raw) {
    const { packageReceipt, ir: rawIr } = fields(raw, ['packageReceipt', 'ir']);
    const docs = admittedDocuments(packageReceipt);
    const documents = new Map(docs.map(row => [row.path, row.value]));
    const corpus = documents.get(prefix + 'graphs-v2.json');
    const schema = passiveSchema(documents.get(prefix + 'provenance-graph.schema.json'));
    const templatesDocument = documents.get(prefix + 'predicate-templates-v1.json');
    const templates = new Map(templatesDocument.templates.map(row => [canonicalValue([row.id, row.version]), row]));
    const context = { graphs: corpus.graphs, claims: documents.get(corpus.claim_contract.path).claims,
        materialRegistry: documents.get(corpus.material_registry.path) };
    const { validateTemplateReferences } = require('./templateReferences');
    validateTemplateReferences({ ...context, templates: templatesDocument,
        operators: documents.get(corpus.operator_registry.path).operators });
    const { compilePredicateTypes } = require('./predicateTypes');
    const typed = compilePredicateTypes({ ...context, snapshots: documents.get(corpus.snapshot_manifest.path).snapshots,
        operatorRegistry: documents.get(corpus.operator_registry.path),
        claimSchema: documents.get(prefix + 'claim-contract.schema.json') });
    const typeMap = new Map(typed.typedGraphs.map(row => [row.fact_key, row.predicates]));
    const ir = fields(rawIr, ['format', 'version', 'stage', 'executable', 'authority_refs', 'order', 'graphs']);
    if (!corpus || ir.format !== 'financasbot.provenance.authoring-ir' || ir.version !== 1
        || ir.stage !== 'typed_authoring_ir_only' || ir.executable !== false
        || !equal(clone(ir.authority_refs), docs.map(({ path, sha256 }) => ({ path, sha256 })))) fail('ir_authority');
    const order = clone(ir.order);
    if (!Array.isArray(ir.graphs) || types.isProxy(ir.graphs) || new Set(order).size !== order.length
        || order.length !== corpus.graphs.length || ir.graphs.length !== order.length) fail('ir_graphs');
    const descriptors = Object.getOwnPropertyDescriptors(ir.graphs);
    if (Reflect.ownKeys(descriptors).length !== order.length + 1) fail('ir_graphs');
    const graphMap = new Map(order.map((key, index) => {
        if (!descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], 'value')) fail('ir_graphs');
        const graph = clone(descriptors[index].value);
        if (graph.fact_key !== key) fail('ir_graphs'); return [key, graph];
    }));
    const requirementMap = new Map(); const allSites = []; const applicability = [];
    const add = (family, target) => {
        const mutation_id = id('v2', family, target);
        if (requirementMap.has(mutation_id)) fail('duplicate_requirement');
        requirementMap.set(mutation_id, { mutation_id, family, target, realization: 'UNSATISFIED_MUTATION_WITNESS' });
        return mutation_id;
    };
    const facts = new Set();
    for (const rawGraph of corpus.graphs) {
        const graph = clone(rawGraph); const compiled = graphMap.get(graph.fact_key);
        if (facts.has(graph.fact_key) || !compiled || compiled.predicates.length !== graph.predicates.length) fail('graph_identity');
        facts.add(graph.fact_key); const predicates = new Set();
        for (let pi = 0; pi < graph.predicates.length; pi++) {
            const predicate = graph.predicates[pi]; const lowered = compiled.predicates[pi];
            if (predicates.has(predicate.id) || ['id', 'op', 'atom', 'obligation'].some(key => predicate[key] !== lowered[key])
                || predicate.args.length !== lowered.operands.length) fail('predicate_identity');
            predicates.add(predicate.id);
            const perArg = predicate.args.map((arg, index) => {
                conformExpression(expectedExpression(arg, templates), lowered.operands[index].expression);
                if (!equal(typeMap.get(graph.fact_key)[pi].operands[index].type, lowered.operands[index].type)) fail('ir_type');
                return sites(schema, arg, index);
            });
            const pathSites = perArg.flat().filter(row => row.class === 'path');
            if (pathSites.length) add('predicate_path_semantic', { fact_key: graph.fact_key,
                predicate_id: predicate.id, strategy: 'same_type_wrong_path' });
            applicability.push({ fact_key: graph.fact_key, predicate_id: predicate.id,
                path_sites: pathSites.length, path_semantic_required: pathSites.length > 0 });
            for (const site of perArg.flat()) {
                const target = { fact_key: graph.fact_key, predicate_id: predicate.id,
                    site_path: site.site_path, definition: site.definition, namespace: site.namespace,
                    strategy: site.class === 'path' ? 'unknown_path' : 'unknown_reference' };
                const mutation_id = add(site.class === 'path' ? 'predicate_path_admission' : 'predicate_reference_admission', target);
                allSites.push({ ...site, fact_key: graph.fact_key, predicate_id: predicate.id, mutation_id });
            }
        }
    }
    if (facts.size !== graphMap.size) fail('extra_graph');
    const requirements = [...requirementMap.values()].sort((a, b) => a.mutation_id.localeCompare(b.mutation_id));
    const result = freezeDeep({ stage: 'path_inventory_v2_candidate_only', version: 2, addendum: ADDENDUM,
        activated: false, mutation_acceptance: false, executed: 0, matched: 0,
        authority_refs: docs.map(({ path, sha256 }) => ({ path, sha256 })),
        requirements, sites: allSites, applicability });
    inventoryContexts.set(result, { graphs: new Map(corpus.graphs.map(row => [row.fact_key, row])), requirements: requirementMap,
        documents, schema, typeMap, native: { ...context,
            snapshots: documents.get(corpus.snapshot_manifest.path).snapshots,
            operatorRegistry: documents.get(corpus.operator_registry.path),
            claimSchema: documents.get(prefix + 'claim-contract.schema.json'), templates: templatesDocument,
            operators: documents.get(corpus.operator_registry.path).operators } });
    return result;
}
function materializePathAdmissionCandidate(raw) {
    const { inventoryCandidate, mutation_id } = fields(raw, ['inventoryCandidate', 'mutation_id']);
    const context = inventoryContexts.get(inventoryCandidate);
    const requirement = context?.requirements.get(mutation_id);
    if (!requirement || !['predicate_path_admission', 'predicate_reference_admission'].includes(requirement.family)) fail('admission_authority');
    const target = requirement.target;
    const original = context.graphs.get(target.fact_key); const graph = clone(original);
    const predicate = graph.predicates.find(row => row.id === target.predicate_id);
    let container = predicate;
    for (const token of target.site_path.slice(0, -1)) {
        if (!container || !Object.hasOwn(container, token)) fail('site_missing'); container = container[token];
    }
    const leaf = target.site_path.at(-1); const before = clone(container[leaf]);
    const unknown = 'unknown_' + mutation_id.slice(7, 23);
    const after = requirement.family === 'predicate_path_admission'
        ? [...before.slice(0, -1), unknown] : unknown;
    container[leaf] = after;
    const result = freezeDeep({ stage: 'generated_path_admission_candidate_only', mutation_id,
        target: clone(target), graph, graph_sha256: sha(JSON.stringify(graph)),
        baseline_graph_sha256: sha(JSON.stringify(original)),
        patch: { location: clone(target.site_path), before, after },
        dp_execution: false, semantic_mutation_credit: 0, financial_receipt: false });
    admissionContexts.set(result, freezeDeep({ mutation_id, target: clone(target),
        graph_sha256: result.graph_sha256, baseline_graph_sha256: result.baseline_graph_sha256 }));
    return result;
}
const readPathAdmissionCandidate = candidate => admissionContexts.get(candidate) ?? null;
// Closed-world alternatives are sealed before observing D/P. This is a
// generator, not a completeness claim or a semantic qualification decision.
function enumeratePathSemanticCandidates(raw) {
    const { inventoryCandidate, mutation_id } = fields(raw, ['inventoryCandidate', 'mutation_id']);
    const context = inventoryContexts.get(inventoryCandidate);
    const requirement = context?.requirements.get(mutation_id);
    if (requirement?.family !== 'predicate_path_semantic') fail('semantic_authority');
    const original = context.graphs.get(requirement.target.fact_key);
    const predicate = original.predicates.find(row => row.id === requirement.target.predicate_id);
    const pathSites = inventoryCandidate.sites.filter(row => row.class === 'path'
        && row.fact_key === requirement.target.fact_key && row.predicate_id === requirement.target.predicate_id);
    const { compilePredicateTypes, readPredicateTypeDiagnostic } = require('./predicateTypes');
    const { validateTemplateReferences, readTemplateReferenceDiagnostic } = require('./templateReferences');
    const { materialFieldType } = require('./materialFieldTypes');
    const typeView = predicates => predicates.map(row => ({ id: row.id, op: row.op, atom: row.atom,
        obligation: row.obligation, operands: row.operands.map(operand => operand.type) }));
    const baselineTypes = typeView(context.typeMap.get(original.fact_key));
    const claim = context.native.claims.find(row => row.fact_key === original.fact_key);
    const claimPaths = [];
    function claimWalk(value, at) {
        if (at.length > 32) fail('claim_depth');
        if (at.length) claimPaths.push(at);
        if (value && typeof value === 'object' && !Array.isArray(value))
            Object.keys(value).sort().forEach(key => claimWalk(value[key], [...at, key]));
    }
    claimWalk(claim, []);
    function nominal(kind, segments) {
        const descriptor = context.native.materialRegistry.kinds[kind]?.fields[segments[0]];
        if (segments.length !== 1 || !descriptor || descriptor.class === 'non_material') return null;
        try { return materialFieldType(kind, segments, descriptor); }
        catch { return { kind, descriptor }; }
    }
    const candidates = []; const seen = new Set();
    for (const site of pathSites) {
        const location = site.site_path.slice(0, -1);
        let before = predicate;
        for (const token of location) before = before[token];
        const options = [];
        if (site.definition === 'claimPath') claimPaths.forEach(segments => options.push({ segments }));
        else {
            const kind = site.definition === 'fieldPath' ? original.nodes[before.node].kind : before.kind;
            const signature = nominal(kind, before.segments);
            if (!signature) fail('semantic_baseline_type');
            for (const name of Object.keys(context.native.materialRegistry.kinds[kind].fields).sort()) {
                const segments = [name]; const alternativeType = nominal(kind, segments);
                if (!alternativeType || !equal(signature, alternativeType)) continue;
                if (site.definition === 'fieldPath') {
                    for (const [node, declaration] of Object.entries(original.nodes).sort(([a], [b]) => a.localeCompare(b)))
                        if (declaration.kind === kind) options.push({ node, segments });
                } else options.push({ kind, segments });
            }
        }
        for (const after of options) {
            if (equal(before, after)) continue;
            const candidate_id = sha(canonicalValue({ domain: 'financasbot.path-semantic-candidate.v2',
                mutation_id, location, before, after }));
            if (seen.has(candidate_id)) fail('semantic_duplicate'); seen.add(candidate_id);
            const graph = clone(original); let container = graph.predicates.find(row => row.id === predicate.id);
            for (const token of location.slice(0, -1)) container = container[token];
            container[location.at(-1)] = clone(after);
            // Both native passes must resolve the locator and preserve all
            // nominal operand types. Full compiler admission is still required.
            let typed;
            try {
                validateTemplateReferences({ ...context.native, graphs: [graph] });
                typed = compilePredicateTypes({ ...context.native, graphs: [graph] });
            } catch (error) {
                if (readPredicateTypeDiagnostic(error) || readTemplateReferenceDiagnostic(error)) continue;
                throw error;
            }
            if (!equal(baselineTypes, typeView(typed.typedGraphs[0].predicates))) continue;
            const result = freezeDeep({ stage: 'generated_path_semantic_candidate_only', mutation_id,
                candidate_id, target: clone(requirement.target), site: clone(site), graph,
                graph_sha256: sha(JSON.stringify(graph)), baseline_graph_sha256: sha(JSON.stringify(original)),
                patch: { location, before: clone(before), after: clone(after) },
                expected_violations: [predicate.atom], operator_preserved: true,
                nominal_type_preserved: true, claim_oracle_preserved: true, material_payload_preserved: true,
                executed: 0, matched: 0, activated: false, financial_receipt: false });
            semanticContexts.set(result, freezeDeep({ mutation_id, candidate_id,
                graph_sha256: result.graph_sha256, baseline_graph_sha256: result.baseline_graph_sha256,
                expected_violations: result.expected_violations, authority_refs: inventoryCandidate.authority_refs }));
            candidates.push(result);
        }
    }
    return freezeDeep({ stage: 'path_semantic_alternatives_sealed_only', mutation_id,
        candidates, candidates_sha256: sha(canonicalValue(candidates.map(row => row.candidate_id))),
        required: true, executed: 0, matched: 0, activated: false,
        no_candidate_disposition: 'UNSATISFIED_MUTATION_WITNESS' });
}
const readPathSemanticCandidate = candidate => semanticContexts.get(candidate) ?? null;
function materializePathMigration(raw) {
    const input = fields(raw, ['packageReceipt', 'ir', 'frozenSource', 'expectedFrozenHash', 'frozenAuthorshipSource']);
    if (typeof input.frozenSource !== 'string' || input.frozenSource.length > 32 * 1024 * 1024
        || input.expectedFrozenHash !== FROZEN_V1_HASH || sha(input.frozenSource) !== FROZEN_V1_HASH) fail('frozen_authority');
    const frozen = JSON.parse(input.frozenSource);
    if (frozen.format !== 'financasbot.path-inventory.v1.frozen' || frozen.version !== 1
        || !Array.isArray(frozen.requirements)) fail('frozen_format');
    const historicalCorpusHash = frozen.authority_refs.find(row => row.path === prefix + 'graphs-v2.json')?.sha256;
    if (typeof input.frozenAuthorshipSource !== 'string' || input.frozenAuthorshipSource.length > 16 * 1024 * 1024
        || sha(input.frozenAuthorshipSource) !== historicalCorpusHash) fail('frozen_authorship');
    const historicalCorpus = JSON.parse(input.frozenAuthorshipSource);
    const candidate = enumeratePathInventoryCandidate({ packageReceipt: input.packageReceipt, ir: input.ir });
    const docs = new Map(admittedDocuments(input.packageReceipt).map(row => [row.path, row.value]));
    const corpus = docs.get(prefix + 'graphs-v2.json');
    const expectedOld = new Map();
    // Independent authored membership check, not the historic v1 enumerator.
    for (const graph of historicalCorpus.graphs) for (const predicate of graph.predicates)
        predicate.args.forEach((_, operand_index) => {
            for (const strategy of ['same_type_wrong_path', 'unknown_path']) {
                const target = { fact_key: graph.fact_key, predicate_id: predicate.id, operand_index, strategy };
                const oldId = id('v1', 'predicate_path_strategy', target);
                if (expectedOld.has(oldId)) fail('old_duplicate'); expectedOld.set(oldId, target);
            }
        });
    const newIds = new Set(candidate.requirements.map(row => row.mutation_id));
    const seen = new Set(); const linked = new Set(); const rows = [];
    const currentPredicates = new Map(corpus.graphs.flatMap(graph => graph.predicates.map(predicate =>
        [canonicalValue([graph.fact_key, predicate.id]), predicate])));
    const historicalPredicates = new Map(historicalCorpus.graphs.flatMap(graph => graph.predicates.map(predicate =>
        [canonicalValue([graph.fact_key, predicate.id]), predicate])));
    const grouped = new Map();
    for (const site of candidate.sites) {
        const key = canonicalValue([site.fact_key, site.predicate_id, site.site_path[1]]);
        if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(site);
    }
    for (const rawOld of frozen.requirements) {
        const old = clone(rawOld); const expected = expectedOld.get(old.mutation_id);
        if (seen.has(old.mutation_id) || old.family !== 'predicate_path_strategy' || !expected
            || !equal(old.target, expected)) fail('frozen_membership');
        seen.add(old.mutation_id);
        const { fact_key, predicate_id, operand_index, strategy } = old.target;
        const predicateKey = canonicalValue([fact_key, predicate_id]);
        const originalPredicate = historicalPredicates.get(predicateKey);
        const currentPredicate = currentPredicates.get(predicateKey);
        if (!currentPredicate || !equal(originalPredicate.args[operand_index], currentPredicate.args[operand_index]))
            fail('historical_target_changed_requires_new_migration_decision');
        const operandSites = grouped.get(canonicalValue([fact_key, predicate_id, operand_index])) || [];
        const hasPath = operandSites.some(site => site.class === 'path');
        const disposition = !operandSites.length ? 'superseded_literal_outside_path_domain'
            : strategy === 'unknown_path' ? 'remapped_admission_sites'
            : hasPath ? 'remapped_semantic_predicate' : 'superseded_unratified_semantic_reference';
        const mapped = strategy === 'unknown_path' ? operandSites.map(site => site.mutation_id)
            : hasPath ? [id('v2', 'predicate_path_semantic', { fact_key, predicate_id, strategy })] : [];
        for (const key of mapped) { if (!newIds.has(key)) fail('new_orphan'); linked.add(key); }
        rows.push({ old_id: old.mutation_id, old_target: old.target, disposition, new_ids: mapped,
            ratified_addendum: ADDENDUM, execution_credit: 0 });
    }
    if (seen.size !== expectedOld.size || [...expectedOld.keys()].some(key => !seen.has(key))) fail('old_missing');
    const introduced_sites = candidate.sites.filter(site => !linked.has(site.mutation_id)).map(site => ({ ...site,
        justification: 'new_authored_site_required_by_ratified_addendum' }));
    const introduced_requirements = candidate.requirements.filter(row => !linked.has(row.mutation_id)).map(row => ({ ...row,
        justification: 'new_authored_requirement_without_historical_v1_coordinate', execution_credit: 0 }));
    const declared = new Set([...linked, ...introduced_requirements.map(row => row.mutation_id)]);
    if (declared.size !== newIds.size || [...newIds].some(key => !declared.has(key))) fail('new_orphan');
    rows.sort((a, b) => a.old_id.localeCompare(b.old_id));
    return freezeDeep({ format: 'financasbot.path-inventory.migration', version: 2,
        stage: 'materialized_candidate_not_activated', addendum: ADDENDUM, frozen_v1_sha256: FROZEN_V1_HASH,
        exact_old_membership: true, activated: false, executed: 0, matched: 0,
        rows, introduced_sites, introduced_requirements, rows_sha256: sha(canonicalValue(rows)),
        new_ids_sha256: sha([...newIds].sort().join('\n')) });
}
function verifyMaterializedPathMigration(raw) {
    const input = fields(raw, ['packageReceipt', 'ir', 'frozenSource', 'expectedFrozenHash', 'frozenAuthorshipSource', 'migrationSource']);
    if (typeof input.migrationSource !== 'string' || input.migrationSource.length > 32 * 1024 * 1024) fail('migration_source');
    const expected = materializePathMigration({ packageReceipt: input.packageReceipt, ir: input.ir,
        frozenSource: input.frozenSource, expectedFrozenHash: input.expectedFrozenHash,
        frozenAuthorshipSource: input.frozenAuthorshipSource });
    if (!equal(expected, JSON.parse(input.migrationSource))) fail('persisted_migration');
    return freezeDeep({ verified: true, activated: false, executed: 0, matched: 0,
        rows: expected.rows.length, rows_sha256: expected.rows_sha256 });
}
// Trusted BUILD projection from the same admitted authored documents and
// declared nominal-type foundation used by the inventory. It does not read
// observed IR, a lowerer source, a trace or a semantic result as expected.
function projectPathInventoryAuthoredProof(raw) {
    const { inventoryCandidate, factKey } = fields(raw, ['inventoryCandidate', 'factKey']);
    const context = inventoryContexts.get(inventoryCandidate);
    if (!context || typeof factKey !== 'string' || !context.graphs.has(factKey)) fail('proof_authorship_authority');
    const graph = context.graphs.get(factKey), documents = context.documents;
    const templates = new Map(context.native.templates.templates.map(row => [canonicalValue([row.id, row.version]), row]));
    const operators = new Map(context.native.operatorRegistry.operators.map(row => [row.id, row]));
    const typed = context.typeMap.get(factKey);
    const predicates = graph.predicates.map((predicate, index) => ({ id: predicate.id,
        operator: clone(operators.get(predicate.op)), operands: predicate.args.map((arg, operandIndex) => ({
            type: clone(typed[index].operands[operandIndex].type), expression: expectedExpression(arg, templates) })) }));
    const windows = Object.fromEntries(Object.entries(graph.windows || {}).map(([name, window]) => [name,
        window.kind === 'month' ? { kind: 'month', value: expectedExpression(window.value, templates) }
            : { kind: 'range', start: expectedExpression(window.start, templates), end: expectedExpression(window.end, templates),
                start_inclusive: window.start_inclusive, end_inclusive: window.end_inclusive }]));
    const materials = Object.fromEntries(Object.entries(graph.nodes).map(([alias, node]) => [alias, {
        registry_version: context.native.materialRegistry.registry_version, kind: node.kind,
        fields: clone(context.native.materialRegistry.kinds[node.kind].fields) }]));
    return freezeDeep({ graph: clone(graph), input: { predicates, windows, materials,
        operators: clone(context.native.operatorRegistry.operators) },
        basis: 'authored_expressions_shared_declared_nominal_projection_not_observed_IR',
        authority_refs: [...documents].map(([path]) => inventoryCandidate.authority_refs.find(row => row.path === path)) });
}
// Whole finite authoring-IR projection. This is a conformance specification,
// not a second admission/compiler implementation or independent type authority.
// No lowerAuthoringIR/observed IR/compiler outputs/trace observations are read.
function projectPathInventoryAuthoredIR(raw) {
    const { inventoryCandidate } = fields(raw, ['inventoryCandidate']);
    const context = inventoryContexts.get(inventoryCandidate);
    if (!context) fail('whole_ir_authorship_origin');
    const corpus = context.documents.get(prefix + 'graphs-v2.json');
    const claims = new Map(context.native.claims.map(row => [row.fact_key, row]));
    const registry = context.documents.get(corpus.metric_evaluator_registry.path);
    const evaluators = new Map(registry.entries.map(row => [canonicalValue([row.evaluator_id, row.evaluator_version]), row]));
    const rows = new Map();
    for (const [factKey, graph] of context.graphs) {
        const claim = claims.get(factKey);
        const evaluator = evaluators.get(canonicalValue([claim.evaluator_ref.evaluator_id, claim.evaluator_ref.evaluator_version]));
        if (!evaluator || claim.claim_id !== graph.claim_id) fail('whole_ir_authority');
        const parents = [], operands = evaluator.roles.map(role => {
            const binding = claim.operand_bindings[role.role_id];
            if (!binding || binding.kind !== role.input_kind) fail('whole_ir_role');
            const resolved = { role_ref: { evaluator_id: evaluator.evaluator_id,
                evaluator_version: evaluator.evaluator_version, role_id: role.role_id }, kind: binding.kind };
            if (binding.kind === 'claim_context') resolved.claim_id = claim.claim_id;
            else if (binding.kind === 'node') resolved.alias = binding.alias;
            else if (binding.kind === 'node_set') resolved.aliases = clone(binding.aliases);
            else if (binding.kind === 'parent_claim') {
                const edges = graph.edges.filter(edge => edge.relation === 'derived_from'
                    && edge.source === 'claim' && edge.field === role.role_id);
                if (edges.length !== 1 || graph.nodes[edges[0].target]?.fact_key !== binding.fact_key
                    || !context.graphs.has(binding.fact_key)) fail('whole_ir_parent');
                resolved.alias = edges[0].target; resolved.fact_key = binding.fact_key;
                parents.push({ role: role.role_id, fact_key: binding.fact_key, alias: resolved.alias });
            } else fail('whole_ir_role_kind');
            return resolved;
        });
        const descriptor = {};
        for (const key of ['claim_id', 'fact_key', 'metric', 'unit', 'subject', 'period', 'time_basis',
            'coverage', 'evidence_state', 'filters', 'evaluator_ref'])
            if (Object.hasOwn(claim, key)) descriptor[key] = clone(claim[key]);
        const projected = projectPathInventoryAuthoredProof({ inventoryCandidate, factKey });
        const predicates = graph.predicates.map((predicate, index) => ({ id: predicate.id, op: predicate.op,
            obligation: predicate.obligation, atom: predicate.atom, operands: projected.input.predicates[index].operands }));
        const requiredStateChecks = graph.selections.flatMap(selection => graph.sets[selection.selected_set].flatMap(node => {
            const fields = context.native.materialRegistry.kinds[graph.nodes[node].kind].fields;
            const field = ['evidence_state', 'state'].find(name => fields[name]?.type === 'enum'
                && fields[name].values.includes('confirmed'));
            return field ? [{ node, field, expected: selection.input_evidence_state ?? claim.evidence_state }] : [];
        }));
        rows.set(factKey, { fact_key: factKey, claim_id: graph.claim_id,
            evaluator_ref: { evaluator_id: evaluator.evaluator_id, evaluator_version: evaluator.evaluator_version },
            claim: descriptor, parents, operands, nodes: clone(graph.nodes), sets: clone(graph.sets),
            windows: projected.input.windows, edges: clone(graph.edges), predicates,
            obligations: clone(graph.obligations), selections: clone(graph.selections),
            expected_trace: clone(graph.trace_contract), required_state_checks: requiredStateChecks });
    }
    // Closed authorial dependency topology, sorted roots and registry role
    // order. This does not grant parent receipts or resolve live parent values.
    const order = [], active = new Set(), seen = new Set();
    function visit(key) {
        if (active.has(key) || !rows.has(key)) fail('whole_ir_topology');
        if (seen.has(key)) return;
        active.add(key); rows.get(key).parents.forEach(parent => visit(parent.fact_key));
        active.delete(key); seen.add(key); order.push(key);
    }
    [...rows.keys()].sort().forEach(visit);
    return freezeDeep({ format: 'financasbot.provenance.authoring-ir', version: 1,
        stage: 'typed_authoring_ir_only', executable: false,
        authority_refs: clone(inventoryCandidate.authority_refs), order, graphs: order.map(key => rows.get(key)) });
}
// Trusted BUILD single-site projection. Reuse the immutable baseline context,
// recomputing only the changed graph's declared nominal types BEFORE normal
// compiler admission. No observed IR or candidate result is an input here.
function projectPathSingleSiteAuthoredIR(raw) {
    const { inventoryCandidate, packageReceipt, factKey } = fields(raw, ['inventoryCandidate', 'packageReceipt', 'factKey']);
    return projectPathInventoryAuthoredIR({ inventoryCandidate: singleSiteProjection(inventoryCandidate, packageReceipt, factKey) });
}
function projectPathSingleSiteAuthoredProof(raw) {
    const { inventoryCandidate, packageReceipt, changedFactKey, factKey } = fields(raw,
        ['inventoryCandidate', 'packageReceipt', 'changedFactKey', 'factKey']);
    return projectPathInventoryAuthoredProof({ inventoryCandidate: singleSiteProjection(inventoryCandidate, packageReceipt, changedFactKey), factKey });
}
function singleSiteProjection(inventoryCandidate, packageReceipt, factKey) {
    const baseline = inventoryContexts.get(inventoryCandidate);
    if (!baseline || typeof factKey !== 'string' || !baseline.graphs.has(factKey)) fail('single_site_origin');
    const cached = singleSiteProjections.get(packageReceipt);
    if (cached) {
        if (cached.inventoryCandidate !== inventoryCandidate || cached.factKey !== factKey) fail('single_site_cache_identity');
        return cached.projection;
    }
    const docs = admittedDocuments(packageReceipt);
    const authority = docs.map(({ path, sha256 }) => ({ path, sha256 }));
    if (authority.length !== inventoryCandidate.authority_refs.length || authority.some((row, index) =>
        row.path !== inventoryCandidate.authority_refs[index].path
        || row.path !== prefix + 'graphs-v2.json' && row.sha256 !== inventoryCandidate.authority_refs[index].sha256))
        fail('single_site_package');
    const documents = new Map(docs.map(row => [row.path, row.value]));
    const corpus = documents.get(prefix + 'graphs-v2.json'), original = baseline.documents.get(prefix + 'graphs-v2.json');
    const { graphs, ...header } = corpus, { graphs: originalGraphs, ...originalHeader } = original;
    if (!equal(header, originalHeader) || graphs.length !== originalGraphs.length
        || graphs.some((graph, index) => graph.fact_key !== originalGraphs[index].fact_key
            || graph.fact_key !== factKey && !equal(graph, originalGraphs[index]))) fail('single_site_graphs');
    const graph = graphs.find(row => row.fact_key === factKey);
    const { compilePredicateTypes } = require('./predicateTypes');
    const typed = compilePredicateTypes({ ...baseline.native, graphs: [graph] });
    const typeMap = new Map(baseline.typeMap);
    typeMap.set(factKey, typed.typedGraphs[0].predicates);
    const projection = freezeDeep({ authority_refs: authority });
    inventoryContexts.set(projection, { ...baseline, documents,
        graphs: new Map(graphs.map(row => [row.fact_key, row])), typeMap,
        native: { ...baseline.native, graphs } });
    singleSiteProjections.set(packageReceipt, { inventoryCandidate, factKey, projection });
    return projection;
}
module.exports = { enumeratePathSites, enumeratePathInventoryCandidate, materializePathMigration,
    verifyMaterializedPathMigration, materializePathAdmissionCandidate, readPathAdmissionCandidate,
    enumeratePathSemanticCandidates, readPathSemanticCandidate, projectPathInventoryAuthoredProof,
    projectPathInventoryAuthoredIR, projectPathSingleSiteAuthoredIR, projectPathSingleSiteAuthoredProof, FROZEN_V1_HASH, ADDENDUM };
