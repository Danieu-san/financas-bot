'use strict';
// Documentary projection only. No WIP import, compiler, evaluator or execution.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const base = '0b2fa642bda2737381d74b9e4baa205ea333a5e3';
const prefix = 'docs/contracts/next/provenance-v2/';
const root = path.resolve(__dirname, '../../..');
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
    : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
    : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
const read = name => execFileSync('git', ['show', base + ':' + prefix + name], {
    cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024
}).replace(/\r\n/g, '\n');
const corpusSource = read('graphs-v2.json');
const schemaSource = read('provenance-graph.schema.json');
const corpus = JSON.parse(corpusSource);
const schema = JSON.parse(schemaSource);
const id = (version, family, target) => sha(canonical({
    domain: 'financasbot.mutation-requirement.' + version, family, target
}));
const namespace = name => ({ node: 'nodes', edge: 'edges', set: 'sets',
    period_ref: 'windows', period: 'windows', template: 'predicate_templates' })[name];

// Schema references are semantic tags. Literal/id-valued data never become
// references by matching an observed value. Binding names are locations only.
function sitesOf(arg, operand_index) {
    const result = [];
    const add = (className, at, definition, ns = null) => result.push({
        class: className, site_path: at, definition, namespace: ns
    });
    function walk(value, rule, at) {
        if (rule.$ref) {
            const ref = rule.$ref;
            if (ref === 'urn:financasbot:next:claim-contract:2#/definitions/period') {
                assert.equal(at.at(-1), 'period_literal'); return;
            }
            assert.ok(ref.startsWith('#/definitions/'), 'unsupported_schema_reference');
            const name = ref.slice('#/definitions/'.length);
            assert.ok(Object.hasOwn(schema.definitions, name));
            if (name === 'literal') return;
            if (['fieldPath', 'claimPath', 'selector'].includes(name)) {
                assert.ok(Array.isArray(value.segments) && value.segments.length > 0);
                add('path', [...at, 'segments'], name);
                if (name === 'fieldPath') {
                    assert.equal(typeof value.node, 'string');
                    add('reference', [...at, 'node'], 'id', 'nodes');
                }
                return;
            }
            if (name === 'id' || name === 'reference') {
                const ns = namespace(at.at(-1));
                assert.ok(ns, 'undefined_reference_namespace');
                if (name === 'id') assert.equal(typeof value, 'string');
                else assert.equal(typeof value.id, 'string');
                add('reference', name === 'id' ? at : [...at, 'id'], name, ns);
                return;
            }
            return walk(value, schema.definitions[name], at);
        }
        if (rule.oneOf) {
            const alternatives = rule.oneOf.filter(branch => value && typeof value === 'object'
                && !Array.isArray(value) && (branch.required || []).every(key => Object.hasOwn(value, key))
                && (branch.additionalProperties !== false || Object.keys(value).every(key => Object.hasOwn(branch.properties || {}, key))));
            assert.equal(alternatives.length, 1, 'ambiguous_or_unknown_arg');
            return walk(value, alternatives[0], at);
        }
        assert.equal(Boolean(rule.anyOf || rule.allOf), false, 'unsupported_schema_composition');
        if (rule.type === 'object') {
            assert.ok(value && typeof value === 'object' && !Array.isArray(value));
            for (const key of Object.keys(value).sort()) {
                const child = rule.properties?.[key] || (typeof rule.additionalProperties === 'object' ? rule.additionalProperties : null);
                assert.ok(child, 'unclassified_authored_property');
                walk(value[key], child, [...at, key]);
            }
        } else if (rule.type === 'array') {
            assert.ok(Array.isArray(value) && rule.items);
            value.forEach((item, index) => walk(item, rule.items, [...at, index]));
        } else {
            assert.ok(rule.type || rule.enum, 'unclassified_schema_leaf');
        }
    }
    walk(arg, { $ref: '#/definitions/arg' }, ['args', operand_index]);
    assert.equal(new Set(result.map(row => canonical(row.site_path))).size, result.length);
    return result.sort((a, b) => canonical(a.site_path).localeCompare(canonical(b.site_path)));
}

function verifyMappings(migration, requirements) {
    assert.equal(new Set(migration.map(row => row.old_id)).size, migration.length);
    assert.ok(migration.every(row => row.new_ids.every(key => requirements.has(key))));
    const covered = new Set(migration.flatMap(row => row.new_ids));
    assert.equal(covered.size, requirements.size, 'orphan_new_requirement');
    assert.ok([...requirements.keys()].every(key => covered.has(key)));
}

function project(graphs) {
    assert.equal(new Set(graphs.map(row => row.fact_key)).size, graphs.length);
    const requirements = new Map();
    const migration = [];
    const applicability = [];
    const allSites = [];
    const addRequirement = (family, target) => {
        const mutation_id = id('v2', family, target);
        assert.equal(requirements.has(mutation_id), false);
        requirements.set(mutation_id, { mutation_id, family, target });
        return mutation_id;
    };
    for (const graph of graphs) {
        assert.equal(new Set(graph.predicates.map(row => row.id)).size, graph.predicates.length);
        for (const predicate of graph.predicates) {
            const perArg = predicate.args.map(sitesOf);
            const paths = perArg.flat().filter(row => row.class === 'path');
            const semantic = paths.length ? addRequirement('predicate_path_semantic', {
                fact_key: graph.fact_key, predicate_id: predicate.id, strategy: 'same_type_wrong_path'
            }) : null;
            applicability.push({ fact_key: graph.fact_key, predicate_id: predicate.id,
                path_sites: paths.length, path_semantic_required: semantic !== null });
            const admission = perArg.map(sites => sites.map(site => {
                const target = { fact_key: graph.fact_key, predicate_id: predicate.id,
                    site_path: site.site_path, definition: site.definition, namespace: site.namespace,
                    strategy: site.class === 'path' ? 'unknown_path' : 'unknown_reference' };
                const mutation_id = addRequirement(site.class === 'path' ? 'predicate_path_admission'
                    : 'predicate_reference_admission', target);
                allSites.push({ ...site, fact_key: graph.fact_key, predicate_id: predicate.id, mutation_id });
                return mutation_id;
            }));
            predicate.args.forEach((arg, operand_index) => {
                const sites = perArg[operand_index];
                const form = Object.keys(arg).sort().join('+');
                if (!sites.length) assert.ok(form === 'literal' || form === 'period_literal', 'unclassified_no_locator_arg');
                for (const strategy of ['same_type_wrong_path', 'unknown_path']) {
                    const target = { fact_key: graph.fact_key, predicate_id: predicate.id, operand_index, strategy };
                    const old_id = id('v1', 'predicate_path_strategy', target);
                    const hasPath = sites.some(row => row.class === 'path');
                    const disposition = !sites.length ? 'superseded_literal_outside_path_domain'
                        : strategy === 'unknown_path' ? 'remapped_admission_sites'
                        : hasPath ? 'remapped_semantic_predicate' : 'superseded_unratified_semantic_reference';
                    const new_ids = strategy === 'unknown_path' ? admission[operand_index]
                        : hasPath ? [semantic] : [];
                    migration.push({ old_id, old_target: target, operand_form: form, disposition, new_ids });
                }
            });
        }
    }
    migration.sort((a, b) => a.old_id.localeCompare(b.old_id));
    verifyMappings(migration, requirements);
    return { requirements: [...requirements.values()].sort((a, b) => a.mutation_id.localeCompare(b.mutation_id)),
        migration, applicability, sites: allSites };
}

const result = project(corpus.graphs);
assert.equal(corpus.graphs.length, 76);
assert.equal(result.migration.length, 45988);
const countBy = (rows, key) => Object.fromEntries([...new Set(rows.map(row => row[key]))].sort()
    .map(name => [name, rows.filter(row => row[key] === name).length]));
const examples = {};
for (const row of result.migration) if (!examples[row.disposition]) examples[row.disposition] = row;
const siteExamples = {};
for (const row of result.sites) {
    const key = row.class + ':' + (row.namespace || row.definition);
    if (!siteExamples[key]) siteExamples[key] = row;
}
// Property probes for extraction, not positive/negative runtime witnesses.
assert.equal(sitesOf({ literal: { type: 'id', value: 'not_a_reference' } }, 0).length, 0);
assert.throws(() => sitesOf({ invented: 'unclassified' }, 0));
assert.throws(() => project([corpus.graphs[0], corpus.graphs[0]]));
const nested = { template: { id: 'outer', version: 1, hash: 'sha256:' + '0'.repeat(64) }, bindings: {
    nested: { template: { id: 'inner', version: 1, hash: 'sha256:' + '0'.repeat(64) }, bindings: {
        a: { selector: { kind: 'event', segments: ['date'] } },
        b: { selector: { kind: 'event', segments: ['date'] } }
    } }
} };
assert.equal(sitesOf(nested, 0).filter(row => row.class === 'path').length, 2);
assert.equal(sitesOf(nested, 0).filter(row => row.class === 'reference').length, 2);
assert.throws(() => sitesOf({ partial_policy: { id: 'unresolved', version: 1, hash: 'sha256:' + '0'.repeat(64) } }, 0));
const requirementMap = new Map(result.requirements.map(row => [row.mutation_id, row]));
assert.throws(() => verifyMappings([result.migration[0], result.migration[0]], requirementMap));
assert.throws(() => verifyMappings([{ ...result.migration[0], new_ids: ['sha256:' + 'f'.repeat(64)] }], requirementMap));
assert.throws(() => verifyMappings(result.migration, new Map([...requirementMap,
    ['sha256:' + 'f'.repeat(64), { mutation_id: 'sha256:' + 'f'.repeat(64) }]])));
const sourceCoordinate = result.applicability.find(row => row.path_semantic_required);
const sourceGraph = corpus.graphs.find(row => row.fact_key === sourceCoordinate.fact_key);
const sourcePredicate = sourceGraph.predicates.find(row => row.id === sourceCoordinate.predicate_id);
assert.equal(sourceGraph.predicates.some(row => row.id === 'projection_growth_probe'), false);
const beforeGrowth = project([sourceGraph]);
const extra = { ...sourcePredicate, id: 'projection_growth_probe' };
const afterGrowth = project([{ ...sourceGraph, predicates: [...sourceGraph.predicates, extra] }]);
assert.equal(afterGrowth.migration.length - beforeGrowth.migration.length, sourcePredicate.args.length * 2);
const extraSites = sourcePredicate.args.flatMap(sitesOf);
for (const [family, expectedGrowth] of [['predicate_path_semantic', 1],
    ['predicate_path_admission', extraSites.filter(row => row.class === 'path').length],
    ['predicate_reference_admission', extraSites.filter(row => row.class === 'reference').length]])
    assert.equal(afterGrowth.requirements.filter(row => row.family === family).length
        - beforeGrowth.requirements.filter(row => row.family === family).length, expectedGrowth);
const afterRows = new Map(afterGrowth.migration.map(row => [row.old_id, row]));
assert.ok(beforeGrowth.migration.every(row => canonical(afterRows.get(row.old_id)) === canonical(row)));
assert.equal(canonical(project([sourceGraph])), canonical(beforeGrowth));
const unknownIds = result.migration.filter(row => row.old_target.strategy === 'unknown_path').map(row => row.old_id).sort();
const priorWitness = JSON.parse(execFileSync('git', ['show', base + ':docs/audit-evidence/n02g-causal-authoring-profile/path-inventory-domain-witness.json'], {
    cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024
}));
assert.equal(sha(unknownIds.join('\n')), priorWitness.all_unknown_path_ids_sha256);
const witness = {
    extraction_only: true, normative_approval: false, runtime_tests_executed: false,
    product_inventory_migrated: false, immutable_base: base,
    corpus_lf_sha256: sha(corpusSource), schema_lf_sha256: sha(schemaSource),
    graph_count: corpus.graphs.length, predicate_count: result.applicability.length,
    old_inventory_ids: result.migration.length, old_unknown_path_ids_sha256: sha(unknownIds.join('\n')),
    old_inventory_ids_sha256: sha(result.migration.map(row => row.old_id).join('\n')),
    proposed_requirements: countBy(result.requirements, 'family'),
    proposed_inventory_ids_sha256: sha(result.requirements.map(row => row.mutation_id).join('\n')),
    migration_dispositions: countBy(result.migration, 'disposition'),
    migration_rows_sha256: sha(canonical(result.migration)),
    predicate_applicability_sha256: sha(canonical(result.applicability)),
    predicates_without_path: result.applicability.filter(row => !row.path_semantic_required).length,
    authored_sites: result.sites.length, authored_sites_sha256: sha(canonical(result.sites)),
    all_old_ids_disposed: true, no_orphan_new_requirement: true,
    property_probes_passed: ['literal_id_is_data', 'unknown_arg_rejected', 'duplicate_graph_rejected',
        'recursive_bindings_no_dedup', 'all_v1_unknown_ids_match_prior_witness',
        'unresolved_namespace_rejected', 'migration_duplicate_forgery_orphan_rejected',
        'new_predicate_grows_expected_without_rewriting_history'],
    migration_examples: examples, site_examples: siteExamples
};
const output = path.join(__dirname, 'path-domain-v2-projection.json');
if (process.argv.length === 3 && process.argv[2] === '--write-new')
    fs.writeFileSync(output, JSON.stringify(witness, null, 2) + '\n', { flag: 'wx' });
else {
    assert.equal(process.argv.length, 2);
    assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), witness);
}
console.log(JSON.stringify({ extraction_verified: true, proposed_requirements: witness.proposed_requirements,
    migration_rows: result.migration.length, predicates_without_path: witness.predicates_without_path,
    normative_approval: false, runtime_tests_executed: false }));
