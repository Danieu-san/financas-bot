'use strict';
// Mechanical application of the ratified 98e3d6a proposal to the preserved WIP.
// Never derives expected reads from runtime observations.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const base = 'docs/contracts/next/provenance-v2/';
const files = ['graphs-v2.json', 'metric-evaluator-registry-v1.json', 'phase-composition-profile-v1.json'];
const saved = path.join(root, '.codex-temp/source-state-phase-authoring-before-20261002.json');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
const hash = value => 'sha256:' + crypto.createHash('sha256').update(value).digest('hex');
const mode = process.argv[2];
assert.equal(process.argv.length, 3);
if (mode === '--snapshot') {
    assert.equal(fs.existsSync(saved), false, 'preserve existing snapshot');
    const sources = Object.fromEntries(files.map(file => [file, read(base + file)]));
    fs.writeFileSync(saved, JSON.stringify({ scope: 'preserved_pre_application_WIP',
        proposal: '98e3d6a929541e3238362400504c884c34031f22', sources }, null, 2) + '\n');
    console.log(JSON.stringify({ preserved: files, hashes: Object.fromEntries(files.map(file => [file, hash(sources[file])])) }));
} else {
    assert.ok(['--apply', '--check'].includes(mode));
    const before = JSON.parse(fs.readFileSync(saved, 'utf8')).sources;
    const corpus = JSON.parse(before['graphs-v2.json']);
    const registry = JSON.parse(before['metric-evaluator-registry-v1.json']);
    const profile = JSON.parse(before['phase-composition-profile-v1.json']);
    const contractHashes = new Map(['eligible_event_count', 'source_coverage'].map(metric =>
        [metric, hash(read(base + 'evaluator-contracts/' + metric + '.json'))]));
    const refresh = value => {
        if (Array.isArray(value)) value.forEach(refresh);
        else if (value && typeof value === 'object') {
            if (contractHashes.has(value.evaluator_id) && Object.hasOwn(value, 'evaluator_contract_hash'))
                value.evaluator_contract_hash = contractHashes.get(value.evaluator_id);
            Object.values(value).forEach(refresh);
        }
    };
    refresh(registry); refresh(profile);
    const outputs = { 'metric-evaluator-registry-v1.json': JSON.stringify(registry, null, 2) + '\n',
        'phase-composition-profile-v1.json': JSON.stringify(profile, null, 2) + '\n' };
    const oldRegistryHash = corpus.metric_evaluator_registry.hash;
    corpus.metric_evaluator_registry.hash = hash(outputs['metric-evaluator-registry-v1.json']);
    let graphSource = before['graphs-v2.json'].replace(oldRegistryHash, corpus.metric_evaluator_registry.hash);
    const changed = [];
    const claims = JSON.parse(read(base + 'claims-v2.json')).claims;
    for (const graph of corpus.graphs) {
        const claim = claims.find(c => c.fact_key === graph.fact_key);
        if (!contractHashes.has(claim.metric)) continue;
        const oldGraph = JSON.stringify(graph);
        const alias = claim.operand_bindings.source.alias;
        assert.equal(graph.nodes[alias].kind, 'source_state');
        const unused = claim.metric === 'source_coverage' ? ['period'] : ['period', 'coverage'];
        graph.trace_contract.derivation.required_reads = graph.trace_contract.derivation.required_reads
            .filter(r => !(r.node === alias && r.segments.length === 1 && unused.includes(r.segments[0])));
        if (claim.metric === 'source_coverage') {
            graph.trace_contract.derivation.required_claim_reads = graph.trace_contract.derivation.required_claim_reads
                .filter(r => r.segments[0] !== 'period' && r.segments[0] !== 'time_basis');
            assert.equal(graph.fact_key, 'S-16#1#1', 'only ratified nominal selection');
            assert.deepEqual(graph.selections[0].selected_predicates, ['r0004_include_coverage']);
            assert.deepEqual(graph.predicates.find(p => p.id === 'binding_7').args,
                [{ field: { node: alias, segments: ['id'] } }, { claim: { segments: ['subject', 'ref_id'] } }]);
            graph.selections[0].selected_predicates = ['binding_7'];
        }
        assert.equal(graphSource.split(oldGraph).length, 2, 'one exact authored graph');
        graphSource = graphSource.replace(oldGraph, JSON.stringify(graph));
        changed.push(graph.fact_key);
    }
    assert.deepEqual(changed.slice().sort(), ['M-09#1#1', 'N-04#1#1', 'S-13#1#1', 'S-16#1#1']);
    outputs['graphs-v2.json'] = graphSource;
    for (const file of files) {
        if (mode === '--apply') {
            assert.equal(read(base + file), before[file], 'do not overwrite new/unrelated WIP');
            fs.writeFileSync(path.join(root, base + file), outputs[file]);
        } else assert.equal(read(base + file), outputs[file], 'exact ratified authoring delta');
    }
    console.log(JSON.stringify({ mode, changed_fact_keys: changed, contract_hashes: Object.fromEntries(contractHashes),
        preservation: 'exact_original_WIP_plus_declared_transform', observations_used: false }));
}
