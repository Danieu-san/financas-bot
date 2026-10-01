'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const BASE = '6baf88dc8b33326f8e05245e38f9682cc722c0be';
const PREFIX = 'docs/contracts/next/provenance-v2/';
const SOURCES = Object.freeze(['graphs-v2.json', 'claims-v2.json',
    'claim-contract.schema.json', 'material-field-registry-v1.json', 'graph-binding-contract-v1.md']);
const FACTS = Object.freeze(['M-01#1#3', 'M-01#1#4', 'M-14#1#3']);
const PRIMARY_FACTS = Object.freeze(['M-01#1#1', 'M-01#1#2', 'M-14#1#1', 'M-14#1#2']);
const ROOT_FIELDS = Object.freeze(['id', 'fact_key', 'evaluator_version', 'result_hash', 'result', 'parents']);
const RESULT_FIELDS = Object.freeze(['unit', 'kind', 'value']);
const ROOT = path.resolve(__dirname, '../../..');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const key = value => JSON.stringify(value);
const copy = value => JSON.parse(JSON.stringify(value));
const fail = code => { throw new Error(`parent_observation_${code}`); };

function unique(items, selector, label) {
    if (!Array.isArray(items)) fail(`${label}_array`);
    const map = new Map();
    for (const item of items) {
        const id = selector(item);
        if (map.has(id)) fail(`${label}_duplicate`);
        map.set(id, item);
    }
    return map;
}

function dereference(schema, rootSchema) {
    if (!schema.$ref) return schema;
    if (!schema.$ref.startsWith('#/definitions/')) fail('schema_reference');
    const name = schema.$ref.slice('#/definitions/'.length);
    if (!Object.hasOwn(rootSchema.definitions, name)) fail('schema_reference');
    return rootSchema.definitions[name];
}

// Only paths already authored in the phase are consumed. Record ancestors
// come from the admitted claim schema and the matching concrete subject/period,
// never from a runtime observation, expected result or golden oracle.
function claimAncestors(reads, claim, schema) {
    const seen = unique(reads, read => key(read.segments), 'claim_reads');
    const additions = new Map();
    for (const read of reads) {
        if (!Array.isArray(read.segments) || !read.segments.length) fail('claim_path');
        let descriptor = schema.definitions.claim;
        let value = claim;
        for (let index = 0; index < read.segments.length; index++) {
            descriptor = dereference(descriptor, schema);
            if (descriptor.oneOf) {
                const branches = descriptor.oneOf.filter(branch => {
                    const kind = branch.properties?.kind;
                    return kind && (kind.const === value?.kind || kind.enum?.includes(value?.kind));
                });
                if (branches.length !== 1) fail('claim_union');
                descriptor = branches[0];
            }
            const segment = read.segments[index];
            if (descriptor.type !== 'object' || !descriptor.properties
                || !Object.hasOwn(descriptor.properties, segment) || !value
                || Array.isArray(value) || !Object.hasOwn(value, segment)) fail('claim_path');
            descriptor = descriptor.properties[segment];
            value = value[segment];
            if (index + 1 < read.segments.length) {
                const next = dereference(descriptor, schema);
                if (next.type !== 'object' && !next.oneOf) fail('claim_scalar_traversal');
                const prefix = read.segments.slice(0, index + 1);
                if (!seen.has(key(prefix))) additions.set(key(prefix), { segments: prefix });
            }
        }
    }
    return [...additions].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, value]) => value);
}

function verifyDescriptor(registry) {
    const fields = registry.kinds?.derived_claim?.fields;
    if (!fields) fail('descriptor');
    assert.deepEqual(Object.keys(fields).sort(), [...ROOT_FIELDS].sort(), 'derived_claim material inventory');
    const expected = { id: ['identity', 'id'], fact_key: ['identity', 'id'],
        evaluator_version: ['identity', 'positive_integer'], result_hash: ['identity', 'digest'],
        result: ['dimension', 'typed_result'], parents: ['edge', 'role_ref_list'] };
    for (const [name, [fieldClass, type]] of Object.entries(expected)) {
        const field = fields[name];
        if (field.class !== fieldClass || field.type !== type || field.required !== true) fail('descriptor');
    }
    assert.deepEqual(fields.parents.targets, ['derived_claim']);
}

function propose(documents) {
    const original = documents['graphs-v2.json'];
    const claims = unique(documents['claims-v2.json'].claims, claim => claim.fact_key, 'claims');
    const graphMap = unique(original.graphs, graph => graph.fact_key, 'graphs');
    if (graphMap.size !== 76 || claims.size !== 76) fail('inventory');
    const schema = documents['claim-contract.schema.json'];
    verifyDescriptor(documents['material-field-registry-v1.json']);
    const parentGraphs = original.graphs.filter(graph => Object.values(graph.nodes)
        .some(node => node.binding === 'validated_parent'));
    assert.deepEqual(parentGraphs.map(graph => graph.fact_key).sort(), FACTS);
    const parentTargets = new Set();
    for (const graph of parentGraphs) {
        const nodes = Object.values(graph.nodes).filter(node => node.binding === 'validated_parent');
        if (nodes.length !== 2) fail('parent_count');
        for (const node of nodes) parentTargets.add(node.fact_key);
    }
    assert.deepEqual([...parentTargets].sort(), PRIMARY_FACTS);
    for (const fact of PRIMARY_FACTS) {
        const graph = graphMap.get(fact); const claim = claims.get(fact);
        if (!graph || !claim || Object.values(graph.nodes).some(node => node.binding === 'validated_parent')
            || Object.values(claim.operand_bindings).some(binding => binding.kind === 'parent_claim')) fail('parent_not_primary');
    }
    const candidate = copy(original);
    const changes = [];
    const counts = { parent_derivation_reads: 0, parent_proof_reads: 0,
        parent_proof_structural: 0, claim_record_derivation: 0, claim_record_proof: 0 };
    for (const graph of candidate.graphs) {
        const claim = claims.get(graph.fact_key);
        if (!claim || claim.claim_id !== graph.claim_id) fail('claim_identity');
        const delta = { fact_key: graph.fact_key, parent_aliases: [], derivation: {}, proof: {} };
        for (const phase of ['derivation', 'proof']) {
            const trace = graph.trace_contract[phase];
            const additions = claimAncestors(trace.required_claim_reads, claim, schema);
            if (additions.length) {
                delta[phase].added_claim_reads = additions;
                trace.required_claim_reads = [...additions, ...trace.required_claim_reads];
                counts[`claim_record_${phase}`] += additions.length;
            }
        }
        if (FACTS.includes(graph.fact_key)) {
            const aliases = Object.entries(graph.nodes).filter(([, node]) => node.binding === 'validated_parent').map(([alias]) => alias);
            delta.parent_aliases = aliases;
            const originalFields = ['fact_key', 'evaluator_version', 'result_hash', 'result'];
            for (const phase of ['derivation', 'proof']) {
                const trace = graph.trace_contract[phase];
                const existing = trace.required_reads.filter(read => aliases.includes(read.node));
                assert.deepEqual(existing, aliases.flatMap(node => originalFields.map(field => ({ node, segments: [field] }))));
                const added = aliases.flatMap(node => phase === 'derivation'
                    ? [{ node, segments: ['result', 'value'] }]
                    : [{ node, segments: ['id'] }, ...RESULT_FIELDS.map(field => ({ node, segments: ['result', field] })),
                        { node, segments: ['parents'] }]);
                trace.required_reads.push(...added);
                delta[phase].added_reads = added;
                counts[`parent_${phase}_reads`] += added.length;
                if (phase === 'proof') {
                    if (trace.required_structural.some(entry => aliases.includes(entry.node))) fail('parent_structural_baseline');
                    const structural = aliases.flatMap(node => [
                        { node, operation: 'keys', segments: [] },
                        ...ROOT_FIELDS.map(field => ({ node, operation: 'has', segments: [field] })),
                        { node, operation: 'keys', segments: ['result'] },
                        { node, operation: 'cardinality', segments: ['parents'] }
                    ]);
                    trace.required_structural.push(...structural);
                    delta.proof.added_structural = structural;
                    counts.parent_proof_structural += structural.length;
                }
            }
        }
        if (Object.keys(delta.derivation).length || Object.keys(delta.proof).length) changes.push(delta);
    }
    // The output is a proposal only. R, runtime, proofs' predicates, edges,
    // selections, nodes and every unrelated field retain the frozen baseline.
    const reconstructed = copy(original);
    const byKey = new Map(reconstructed.graphs.map(graph => [graph.fact_key, graph]));
    for (const delta of changes) for (const phase of ['derivation', 'proof']) {
        const trace = byKey.get(delta.fact_key).trace_contract[phase];
        if (delta[phase].added_claim_reads) trace.required_claim_reads.unshift(...delta[phase].added_claim_reads);
        if (delta[phase].added_reads) trace.required_reads.push(...delta[phase].added_reads);
        if (delta[phase].added_structural) trace.required_structural.push(...delta[phase].added_structural);
    }
    assert.deepEqual(candidate, reconstructed);
    return { candidate, proposal: { schema: 'n02g_parent_observation_proposal_v1', base: BASE,
        status: 'normative_proposal_not_applied', graph_count: 76, parent_graphs: FACTS,
        primary_parent_facts: PRIMARY_FACTS, parent_roster_profile: 'empty_only', counts,
        proposed_semantic_sha256: digest(JSON.stringify(candidate)), changes } };
}

function loadImmutableDocuments() {
    const documents = {}; const sources = [];
    const env = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' };
    for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE',
        'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete env[name];
    for (const name of SOURCES) {
        const relative = PREFIX + name;
        const bytes = execFileSync('git', ['-c', `safe.directory=${ROOT}`, '-C', ROOT,
            'show', `${BASE}:${relative}`], { env, maxBuffer: 16 * 1024 * 1024 });
        const source = bytes.toString('utf8');
        if (!Buffer.from(source).equals(bytes)) fail('utf8');
        sources.push({ path: relative, sha256: digest(bytes), bytes: bytes.length });
        if (name.endsWith('.json')) documents[name] = JSON.parse(source);
    }
    return { documents, sources };
}

if (require.main === module) {
    const mode = process.argv[2];
    if (!['--write-new', '--check'].includes(mode) || process.argv.length !== 3) fail('mode');
    const { documents, sources } = loadImmutableDocuments();
    const { proposal } = propose(documents);
    const output = { ...proposal, sources };
    const file = path.join(__dirname, 'parent-observation-proposal.json');
    if (mode === '--write-new') {
        if (fs.existsSync(file)) fail('proposal_exists');
        fs.writeFileSync(file, `${JSON.stringify(output, null, 2)}\n`, { flag: 'wx' });
    } else assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), output);
    console.log(JSON.stringify({ valid: true, mode, base: BASE, graphs: proposal.graph_count,
        changed_graphs: proposal.changes.length, ...proposal.counts, applied: false, global_go: false }));
}

module.exports = { propose, claimAncestors, loadImmutableDocuments, BASE };
