'use strict';
// Finite authored/schema enumeration for L only. No compiler probe, execution,
// observed IR, reference result, static exclusion or equivalence authority.
const { admittedDocuments } = require('./packageContract');
const { claimReferenceKind } = require('./claimNominalTypes');
const { copyData } = require('./observationContract');
const { canonicalValue, freezeDeep } = require('../kernel/canonicalValue');
const prefix = 'docs/contracts/next/provenance-v2/';
const diagnostics = new WeakMap();
function fail(code) {
    const error = new Error('path_locator_domain_v3_' + code);
    diagnostics.set(error, code); throw error;
}
const equal = (a, b) => canonicalValue(a) === canonicalValue(b);
const scalar = (type, extra = {}) => ({ form: 'scalar', type, ...extra });
const enumType = values => scalar('enum', { domain: JSON.stringify([...values].sort()) });
const copy = value => JSON.parse(JSON.stringify(value));
function createLocatorDomainEnumeration(packageReceipt) {
    const docs = new Map(admittedDocuments(packageReceipt).map(row => [row.path, row.value]));
    const corpus = docs.get(prefix + 'graphs-v2.json');
    const registry = docs.get(corpus.material_registry.path);
    const claimSchema = docs.get(prefix + 'claim-contract.schema.json');
    const claims = new Map(docs.get(corpus.claim_contract.path).claims.map(row => [row.fact_key, row]));
    const snapshots = docs.get(corpus.snapshot_manifest.path).snapshots;
    const graphs = new Map(corpus.graphs.map(row => [row.fact_key, row]));
    if (registry.closed_world !== true) fail('open_registry');
    const payload = node => {
        const matches = snapshots.filter(snapshot => snapshot.kind === node.kind
            && snapshot.ref_id === node.ref_id && snapshot.version === node.version);
        if (matches.length !== 1) fail('snapshot_identity');
        return matches[0].payload;
    };
    function materialNominal(kind, name, descriptor, node) {
        if (descriptor.class === 'non_material') return null;
        const type = descriptor.type;
        if (type === 'id') return scalar('id', { kind: name === 'id' ? kind : `${kind}.${name}` });
        if (type === 'enum') return enumType(descriptor.values);
        if (type === 'money_minor') return scalar(type, { unit: 'BRL_minor' });
        if (['ref', 'ref_list'].includes(type)) {
            let target;
            if (descriptor.targets.length === 1) target = descriptor.targets[0];
            else if (node && kind === 'collection' && name === 'members') {
                const origin = payload(node).collection_name;
                const matches = Object.entries(registry.kinds).filter(([, entry]) => entry.origin === origin);
                if (matches.length !== 1 || !descriptor.targets.includes(matches[0][0])) fail('collection_nominal');
                target = matches[0][0];
            } else if (node) {
                const value = payload(node)[name];
                const matches = snapshots.filter(snapshot => descriptor.targets.includes(snapshot.kind) && snapshot.ref_id === value);
                if (matches.length !== 1) fail('reference_nominal');
                target = matches[0].kind;
            } else fail('selector_nominal');
            const item = scalar('id', { kind: target });
            return type === 'ref' ? item : { form: 'sequence', item };
        }
        if (['typed_period', 'typed_result', 'role_ref_list'].includes(type)) return { form: 'record', type };
        if (!registry.types.includes(type)) fail('unknown_material_type');
        return scalar(type);
    }
    function resolve(schema, value, depth = 0) {
        if (depth > 32 || !schema || schema.anyOf || schema.allOf || schema.if || schema.not) fail('claim_grammar');
        if (schema.$ref) {
            const name = /^#\/definitions\/([A-Za-z0-9_]+)$/.exec(schema.$ref)?.[1];
            if (!name || !Object.hasOwn(claimSchema.definitions, name)) fail('claim_reference');
            return { ...resolve(claimSchema.definitions[name], value, depth + 1), ref: name };
        }
        if (schema.oneOf) {
            const branches = schema.oneOf.filter(branch => value && typeof value === 'object' && !Array.isArray(value)
                && (branch.required || []).every(name => Object.hasOwn(value, name))
                && Object.entries(branch.properties || {}).every(([name, property]) =>
                    (!Object.hasOwn(property, 'const') || value[name] === property.const)
                    && (!property.enum || property.enum.includes(value[name]))));
            if (branches.length !== 1) fail('claim_branch');
            return resolve(branches[0], value, depth + 1);
        }
        return { schema };
    }
    function claimPaths(claim) {
        const result = [];
        function walk(schema, value, segments, depth) {
            if (depth > 32) fail('claim_depth');
            const resolved = resolve(schema, value);
            if (segments.length) result.push({ segments, ...resolved });
            if (resolved.schema.type !== 'object') return;
            if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) fail('claim_shape');
            // L is schema-declared, not the subset present in this fixture.
            // Missing optional fields remain locators; their admission belongs
            // to A and must be justified separately, never silently filtered.
            const declared = Object.keys(resolved.schema.properties || {});
            const present = value === undefined ? [] : Object.keys(value);
            for (const name of [...new Set([...declared, ...present])].sort()) {
                const child = resolved.schema.properties?.[name]
                    || (resolved.schema.additionalProperties && typeof resolved.schema.additionalProperties === 'object'
                        ? resolved.schema.additionalProperties : null);
                if (!child) fail('claim_unclassified_property');
                walk(child, value?.[name], [...segments, name], depth + 1);
            }
        }
        walk(claimSchema.definitions.claim, claim, [], 0);
        return result;
    }
    function claimNominal(claim, entry) {
        const { schema, ref, segments } = entry;
        if (segments.length === 1 && segments[0] === 'period') return {
            form: claim.period.kind === 'range' ? 'range' : 'period', periodKind: claim.period.kind };
        if (ref === 'date' || ref === 'month') return scalar(ref);
        if (schema.enum || Object.hasOwn(schema, 'const')) return enumType(schema.enum || [schema.const]);
        if (ref === 'id') return scalar('id', { kind: segments[0] === 'subject'
            ? claimReferenceKind(claim, segments) : `claim.${segments.join('.')}` });
        if (schema.type === 'integer') return scalar(schema.minimum >= 1 ? 'positive_integer' : 'integer');
        if (schema.type === 'boolean') return scalar('boolean');
        if (schema.type === 'object') return { form: 'record' };
        if (schema.type === 'array') return { form: 'sequence', item: scalar('id', { kind: claimReferenceKind(claim, segments) }) };
        if (schema.type === 'string') return scalar('text');
        fail('claim_type');
    }
    const cachedClaims = new Map();
    function domain(target, site) {
        target = JSON.parse(JSON.stringify(copyData(target)));
        site = JSON.parse(JSON.stringify(copyData(site)));
        const graph = graphs.get(target.fact_key);
        const predicate = graph?.predicates.find(row => row.id === target.predicate_id);
        if (!predicate || site.class !== 'path') fail('site_identity');
        const location = site.site_path.slice(0, -1);
        let original = predicate;
        for (const token of location) {
            if (!Object.hasOwn(original, token)) fail('site_identity');
            original = original[token];
        }
        let namespace, originalNominal, options;
        if (site.definition === 'claimPath') {
            namespace = 'claim';
            const claim = claims.get(graph.fact_key);
            if (!claim) fail('claim_identity');
            if (!cachedClaims.has(graph.fact_key)) cachedClaims.set(graph.fact_key, claimPaths(claim));
            const entries = cachedClaims.get(graph.fact_key);
            const entry = entries.find(row => equal(row.segments, original.segments));
            if (!entry) fail('claim_path');
            originalNominal = claimNominal(claim, entry);
            options = entries.filter(row => equal(claimNominal(claim, row), originalNominal))
                .map(row => ({ segments: row.segments }));
        } else if (['fieldPath', 'selector'].includes(site.definition)) {
            namespace = 'material';
            const anchored = site.definition === 'fieldPath';
            const kind = anchored ? graph.nodes[original.node]?.kind : original.kind;
            const fields = registry.kinds[kind]?.fields;
            if (!fields || original.segments.length !== 1 || !fields[original.segments[0]]) fail('material_path');
            originalNominal = materialNominal(kind, original.segments[0], fields[original.segments[0]],
                anchored ? graph.nodes[original.node] : null);
            if (!originalNominal) fail('nonmaterial_baseline');
            const anchors = anchored ? Object.entries(graph.nodes).filter(([, node]) => node.kind === kind)
                .sort(([a], [b]) => a.localeCompare(b)) : [[null, null]];
            options = [];
            for (const [anchor, node] of anchors) for (const name of Object.keys(fields).sort()) {
                // Resolve a polymorphic reference only if its declared finite
                // target domain can share this nominal. A disjoint id domain
                // cannot hide a month/enum locator. This is L type projection,
                // not an admission/semantic exclusion based on fixture values.
                const descriptor = fields[name];
                if (['ref', 'ref_list'].includes(descriptor.type)) {
                    const possible = descriptor.targets.map(kind => descriptor.type === 'ref'
                        ? scalar('id', { kind }) : { form: 'sequence', item: scalar('id', { kind }) });
                    if (!possible.some(nominal => equal(nominal, originalNominal))) continue;
                }
                const nominal = materialNominal(kind, name, fields[name], node);
                if (nominal && equal(nominal, originalNominal)) options.push(anchored
                    ? { node: anchor, segments: [name] } : { kind, segments: [name] });
            }
        } else fail('namespace');
        const locators = options.filter(option => !equal(option, original));
        if (new Set(locators.map(locator => canonicalValue(locator))).size !== locators.length) fail('duplicate_locator');
        return freezeDeep({ namespace, location: copy(location), original: copy(original),
            original_nominal: originalNominal, locators,
            complete: true, scope: 'finite_authored_closed_world_L_only',
            admitted_domain_complete: false, discriminating_domain_complete: false });
    }
    return Object.freeze({ enumerateSite: domain, enumerateClaimLocators(factKey) {
        if (typeof factKey !== 'string') fail('claim_identity');
        const claim = claims.get(factKey);
        if (!claim) fail('claim_identity');
        if (!cachedClaims.has(factKey)) cachedClaims.set(factKey, claimPaths(claim));
        return freezeDeep(cachedClaims.get(factKey).map(entry => ({ segments: copy(entry.segments),
            nominal: claimNominal(claim, entry) })));
    } });
}
module.exports = { createLocatorDomainEnumeration,
    readLocatorDomainDiagnostic: error => diagnostics.get(error) ?? null };
