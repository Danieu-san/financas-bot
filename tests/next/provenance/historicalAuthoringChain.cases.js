'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const prefix = 'docs/contracts/next/provenance-v2/';
const modulePath = '../../../scripts/agent/historicalAuthoringChain.cjs';
const currentRead = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');

test('N02G:HISTORICAL-CHAIN-001 approved successor is reconstructed before returning the frozen historical view', () => {
    const { buildHistoricalAuthoringChain, createHistoricalAuthoringReader } = require(modulePath);
    const chain = buildHistoricalAuthoringChain();
    const original = JSON.stringify(chain.historicalCorpus);
    const reader = createHistoricalAuthoringReader(currentRead, chain);
    assert.deepEqual(JSON.parse(reader(prefix + 'graphs-v2.json')), chain.historicalCorpus);
    assert.equal(JSON.stringify(chain.historicalCorpus), original);
    assert.deepEqual(chain.changedFactKeys, ['M-09#1#1', 'N-04#1#1', 'S-13#1#1', 'S-16#1#1']);
    assert.equal(chain.expectedCorpus.graphs.length, 76);
    for (const file of ['claims-v2.json', 'metric-evaluator-registry-v1.json',
        'evaluator-contracts/eligible_event_count.json', 'evaluator-contracts/source_coverage.json']) {
        assert.equal(typeof reader(prefix + file), 'string');
    }
    const originalByKey = new Map(chain.parentCorpus.graphs.map(graph => [graph.fact_key, graph]));
    for (const graph of chain.expectedCorpus.graphs) {
        const before = originalByKey.get(graph.fact_key);
        assert.deepEqual(graph.predicates, before.predicates);
        assert.deepEqual(graph.trace_contract.proof, before.trace_contract.proof);
        if (!chain.changedFactKeys.includes(graph.fact_key)) assert.deepEqual(graph, before);
    }
});

test('N02G:HISTORICAL-CHAIN-002 every graph drift and collateral authority remains rejected', () => {
    const { buildHistoricalAuthoringChain, createHistoricalAuthoringReader } = require(modulePath);
    const chain = buildHistoricalAuthoringChain();
    for (let i = 0; i < chain.expectedCorpus.graphs.length; i++) {
        const changed = structuredClone(chain.expectedCorpus);
        changed.graphs[i].unapproved_property = i;
        assert.throws(() => createHistoricalAuthoringReader(file => file === prefix + 'graphs-v2.json'
            ? JSON.stringify(changed) : currentRead(file), chain), /authoring_chain_graph_mismatch/);
    }
    for (const file of ['claims-v2.json', 'metric-evaluator-registry-v1.json',
        'evaluator-contracts/eligible_event_count.json', 'evaluator-contracts/source_coverage.json']) {
        const locator = prefix + file;
        const changed = JSON.parse(currentRead(locator)); changed.unapproved_property = true;
        assert.throws(() => createHistoricalAuthoringReader(name => name === locator
            ? JSON.stringify(changed) : currentRead(name), chain), /authoring_chain_authority_mismatch/);
    }
    const reader = createHistoricalAuthoringReader(file => file === prefix + 'operator-registry-v2.json'
        ? currentRead(file) + '\nvoid unexpected' : currentRead(file), chain);
    assert.throws(() => reader(prefix + 'operator-registry-v2.json'), /authoring_chain_authority_mismatch/);
    const direct = 'src/next/provenance/metricDirectReads.js';
    assert.throws(() => createHistoricalAuthoringReader(file => file === direct
        ? currentRead(file) + '\nvoid collateral' : currentRead(file), chain), /authoring_chain_authority_mismatch/);
    // Reintroducing a D period guard is not a permitted successor either.
    assert.throws(() => createHistoricalAuthoringReader(file => file === direct
        ? currentRead(file).replace('// Nominal source resolution is functional; its period relation is P.',
            "if (source.get('period') !== '2042-06') throw new Error('period');") : currentRead(file), chain), /authoring_chain_authority_mismatch/);
});
