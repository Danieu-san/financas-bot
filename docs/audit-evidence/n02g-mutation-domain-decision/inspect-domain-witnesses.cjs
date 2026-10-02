'use strict';
// Read-only evidence inspector. It does not change any normative document,
// generate a financial receipt, qualify a mutation, or decide the G11 gate.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const BASE = 'ecc57203bbd5b50087f2cd7fa9af8c96ee03ae1d';
const ROOT = path.resolve(__dirname, '../../..');
const REPORT = path.join(__dirname, 'domain-witness-report.json');
const PATHS = {
    design: 'docs/plans/workstreams/financasbot-next-00-provenance-graph-design-v1.md',
    registry: 'docs/contracts/next/provenance-v2/material-field-registry-v1.json',
    schema: 'docs/contracts/next/provenance-v2/evidence-snapshot.schema.json',
    graphs: 'docs/contracts/next/provenance-v2/graphs-v2.json'
};
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
function readImmutable() {
    return Object.fromEntries(Object.entries(PATHS).map(([name, file]) => {
        const bytes = execFileSync('git', ['show', `${BASE}:${file}`], { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 });
        return [name, { path: file, sha256: sha256(bytes), bytes }];
    }));
}
function inspect(registry, schema, corpus) {
    assert.equal(corpus.graphs.length, 76, 'closed_world_graph_count');
    assert.equal(new Set(corpus.graphs.map(graph => graph.fact_key)).size, corpus.graphs.length, 'duplicate_fact_key');
    const fields = [];
    for (const [kind, specification] of Object.entries(registry.kinds)) {
        for (const [field, descriptor] of Object.entries(specification.fields)) {
            if (descriptor.class === 'non_material' || descriptor.type !== 'enum') continue;
            assert.ok(Array.isArray(descriptor.values) && descriptor.values.length > 0, 'enum_domain_missing');
            assert.equal(new Set(descriptor.values).size, descriptor.values.length, 'enum_domain_duplicate');
            const projected = schema.definitions[`payload_${kind}`]?.properties?.[field];
            assert.ok(projected, 'schema_projection_missing');
            assert.deepEqual(projected.enum, descriptor.values, 'schema_registry_domain_divergence');
            if (descriptor.values.length !== 1) continue;
            fields.push({ kind, field, domain: [...descriptor.values], required: descriptor.required });
        }
    }
    fields.sort((a, b) => `${a.kind}.${a.field}`.localeCompare(`${b.kind}.${b.field}`, 'en'));
    const targets = [];
    for (const graph of corpus.graphs) for (const [alias, node] of Object.entries(graph.nodes)) {
        assert.ok(Object.hasOwn(registry.kinds, node.kind), 'material_kind_missing');
        for (const field of fields.filter(row => row.kind === node.kind)) {
            targets.push({ fact_key: graph.fact_key, alias, kind: node.kind, field: field.field });
        }
    }
    targets.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
    assert.equal(new Set(targets.map(row => JSON.stringify(row))).size, targets.length, 'duplicate_target');
    return {
        graph_count: corpus.graphs.length,
        singleton_fields: fields.map(field => {
            const matches = targets.filter(row => row.kind === field.kind && row.field === field.field);
            return { ...field, target_count: matches.length, affected_graph_count: new Set(matches.map(row => row.fact_key)).size };
        }),
        singleton_target_count: targets.length,
        affected_graph_count: new Set(targets.map(row => row.fact_key)).size,
        target_index_sha256: sha256(JSON.stringify(targets))
    };
}
function report() {
    const source = readImmutable();
    const design = source.design.bytes.toString('utf8');
    assert.ok(design.includes('alterar cada campo material por outro valor válido do mesmo tipo.'), 'material_mutation_requirement_missing');
    assert.ok(design.includes('Cada mutação enumerada precisa produzir um witness schema-valid e'), 'schema_valid_requirement_missing');
    assert.ok(design.includes('Nunca há `skip`, redução da'), 'no_skip_requirement_missing');
    const result = inspect(JSON.parse(source.registry.bytes), JSON.parse(source.schema.bytes), JSON.parse(source.graphs.bytes));
    return {
        format: 'financasbot.mutation-domain-evidence', version: 1, source_base_sha: BASE,
        stage: 'normative_domain_conflict_evidence_only', gate_approval: false,
        source_hash_mode: 'immutable_git_blob_bytes',
        sources: Object.fromEntries(Object.entries(source).map(([key, value]) => [key, { path: value.path, sha256: value.sha256 }])),
        ...result,
        conclusion: 'NO_DISTINCT_SCHEMA_VALID_VALUE_IN_SINGLETON_DOMAINS',
        semantic_witnesses_qualified: 0,
        normative_change_applied: false
    };
}
function selfTest() {
    const source = readImmutable();
    const registry = JSON.parse(source.registry.bytes), schema = JSON.parse(source.schema.bytes), corpus = JSON.parse(source.graphs.bytes);
    const baseline = inspect(registry, schema, corpus);
    const budgetCount = baseline.singleton_fields.find(row => row.kind === 'budget' && row.field === 'evidence_state').target_count;
    const r = structuredClone(registry), s = structuredClone(schema);
    r.kinds.budget.fields.evidence_state.values.push('projected');
    assert.throws(() => inspect(r, schema, corpus), /schema_registry_domain_divergence/);
    s.definitions.payload_budget.properties.evidence_state.enum.push('projected');
    const alternative = inspect(r, s, corpus);
    assert.equal(alternative.singleton_target_count, baseline.singleton_target_count - budgetCount);
    assert.ok(!alternative.singleton_fields.some(row => row.kind === 'budget' && row.field === 'evidence_state'));
    const duplicate = structuredClone(corpus); duplicate.graphs[1].fact_key = duplicate.graphs[0].fact_key;
    assert.throws(() => inspect(registry, schema, duplicate), /duplicate_fact_key/);
    const unknown = structuredClone(corpus); Object.values(unknown.graphs[0].nodes)[0].kind = 'unknown_kind';
    assert.throws(() => inspect(registry, schema, unknown), /material_kind_missing/);
    const extra = structuredClone(registry); extra.kinds.fixture.fields.currency.values.push('BRL');
    assert.throws(() => inspect(extra, schema, corpus), /enum_domain_duplicate/);
    return { self_tests: 5, pass: 5, fail: 0, gate_approval: false };
}
if (require.main === module) {
    const args = process.argv.slice(2);
    assert.equal(args.length, 1, 'one_mode_required');
    if (args[0] === '--print') process.stdout.write(`${JSON.stringify(report(), null, 2)}\n`);
    else if (args[0] === '--check') {
        assert.deepEqual(JSON.parse(fs.readFileSync(REPORT, 'utf8')), report(), 'published_report_mismatch');
        process.stdout.write('domain-evidence: EXACT MATCH; gate_approval=false\n');
    } else if (args[0] === '--self-test') process.stdout.write(`${JSON.stringify(selfTest())}\n`);
    else throw new Error('unsupported_mode');
}
module.exports = { inspect, report, selfTest };
