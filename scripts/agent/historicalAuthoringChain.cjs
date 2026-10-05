'use strict';
// Test-only forward replay of ratified authorship. No evaluator/trace/actual
// contributes to expected, and this is not admission or release authority.
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { readImmutableBlob } = require('./immutableGitBlob.cjs');
const { checkedCandidate } = require('./applyN02gParentObservation.cjs');
const BASE = '6baf88dc8b33326f8e05245e38f9682cc722c0be';
const SOURCE_STATE_AUTHORITY = '98e3d6a929541e3238362400504c884c34031f22';
const PREFIX = 'docs/contracts/next/provenance-v2/';
const METRICS = ['eligible_event_count', 'source_coverage'];
const FACT_KEYS = ['M-09#1#1', 'N-04#1#1', 'S-13#1#1', 'S-16#1#1'];
const chains = new WeakSet();
const historicalSources = new Map();
let cached;
const hash = source => 'sha256:' + createHash('sha256').update(source).digest('hex');
const formatted = value => JSON.stringify(value, null, 2) + '\n';
const fail = code => { throw new Error('authoring_chain_' + code); };
function freeze(value) {
    if (value && typeof value === 'object') {
        for (const item of Object.values(value)) freeze(item);
        Object.freeze(value);
    }
    return value;
}
function historicalSource(file) {
    if (!historicalSources.has(file)) historicalSources.set(file,
        readImmutableBlob(BASE, file).toString('utf8').replaceAll('\r\n', '\n'));
    return historicalSources.get(file);
}

function buildHistoricalAuthoringChain() {
    if (cached) return cached;
    const { documents, candidate } = checkedCandidate();
    const historicalCorpus = structuredClone(documents['graphs-v2.json']);
    const claims = documents['claims-v2.json'].claims;
    const parentCorpus = structuredClone(candidate);
    const expectedCorpus = structuredClone(candidate);
    const registrySource = historicalSource(PREFIX + 'metric-evaluator-registry-v1.json');
    if (hash(registrySource) !== parentCorpus.metric_evaluator_registry.hash) fail('registry_baseline');
    const registry = JSON.parse(registrySource);
    const expectedSources = {};
    // These are the exact phase addenda from the ratified source_state proposal,
    // not text extracted from the mutable successor contracts.
    const addenda = {
        eligible_event_count: [
            'Retornar após provar refere-se ao resultado aceito pelo pipeline completo. D produz somente R tipado provisório sobre inputs admitidos; P comprova período e completude da fonte antes de aceitação, materialização, validated_parent ou resposta financeira.',
            'D preserva seleção funcional por sujeito, categoria, estado e período do contexto e compara event_count com sua cardinalidade. R provisório não é zero aceito nem receipt; P, identidade, fingerprints, seleção, traces e oracle positivo original continuam obrigatórios.'
        ],
        source_coverage: [
            'Retornar após provar refere-se ao resultado aceito pelo pipeline completo. D produz somente R tipado provisório sobre inputs admitidos; P comprova período e coverage exigida antes de aceitação, materialização, validated_parent ou resposta financeira.',
            'D preserva resolução nominal, identidade, escopo e enum literal. R provisório partial/unavailable nunca vira complete ou receipt; P, identidade, fingerprints, seleção, traces e oracle positivo original continuam obrigatórios.'
        ]
    };
    for (const metric of METRICS) {
        const file = PREFIX + 'evaluator-contracts/' + metric + '.json';
        const oldSource = historicalSource(file);
        const contract = JSON.parse(oldSource);
        if (contract.metric !== metric || contract.contract_id !== metric + '_v1') fail('contract_baseline');
        const entries = registry.entries.filter(row => row.evaluator_id === metric);
        if (entries.length !== 1 || entries[0].contract_path !== file ||
            entries[0].evaluator_contract_hash !== hash(oldSource)) fail('contract_baseline');
        contract.semantics.push(...addenda[metric]);
        expectedSources[file] = formatted(contract);
        entries[0].evaluator_contract_hash = hash(expectedSources[file]);
    }
    expectedSources[PREFIX + 'metric-evaluator-registry-v1.json'] = formatted(registry);
    expectedSources[PREFIX + 'claims-v2.json'] = historicalSource(PREFIX + 'claims-v2.json');
    // Forward-replay the ratified D/P split from immutable source bytes. No
    // caller/current source contributes to expected; all other bytes persist.
    const directFile = 'src/next/provenance/metricDirectReads.js';
    let directSource = historicalSource(directFile);
    const transitions = [
        ["        const month = period(context, 'month', 'event_date');\n        const actual = source.get('period'); parseMonth(actual);\n        if (actual !== month) fail('period');\n        if (source.get('coverage') !== 'complete') fail('coverage');",
            '        // D computes a provisional count. Source period/completeness are P\n        // obligations; selection below still uses the claim\'s functional month.'],
        ["        const month = period(context, 'month', 'source_period');\n        const actual = source.get('period'); parseMonth(actual);\n        if (month !== actual) fail('period');",
            '        // Nominal source resolution is functional; its period relation is P.']
    ];
    for (const [before, after] of transitions) {
        if (directSource.split(before).length !== 2) fail('runtime_baseline');
        directSource = directSource.replace(before, after);
    }
    expectedSources[directFile] = directSource;
    expectedCorpus.metric_evaluator_registry.hash = hash(expectedSources[PREFIX + 'metric-evaluator-registry-v1.json']);
    const changedFactKeys = [];
    for (const graph of expectedCorpus.graphs) {
        const matchingClaims = claims.filter(claim => claim.fact_key === graph.fact_key);
        if (matchingClaims.length !== 1) fail('claim_baseline');
        const claim = matchingClaims[0];
        if (!METRICS.includes(claim.metric)) continue;
        const alias = claim.operand_bindings.source.alias;
        if (graph.nodes[alias]?.kind !== 'source_state') fail('source_binding');
        const unused = claim.metric === 'source_coverage' ? ['period'] : ['period', 'coverage'];
        const derivation = graph.trace_contract.derivation;
        derivation.required_reads = derivation.required_reads.filter(row =>
            !(row.node === alias && row.segments.length === 1 && unused.includes(row.segments[0])));
        if (claim.metric === 'source_coverage') {
            if (graph.fact_key !== 'S-16#1#1' ||
                !isDeepStrictEqual(graph.selections[0].selected_predicates, ['r0004_include_coverage']) ||
                !isDeepStrictEqual(graph.predicates.find(row => row.id === 'binding_7')?.args,
                    [{ field: { node: alias, segments: ['id'] } }, { claim: { segments: ['subject', 'ref_id'] } }])) fail('nominal_selection');
            derivation.required_claim_reads = derivation.required_claim_reads.filter(row =>
                !['period', 'time_basis'].includes(row.segments[0]));
            graph.selections[0].selected_predicates = ['binding_7'];
        }
        changedFactKeys.push(graph.fact_key);
    }
    changedFactKeys.sort();
    if (!isDeepStrictEqual(changedFactKeys, FACT_KEYS)) fail('source_domain');
    cached = freeze({ base: BASE, sourceStateAuthority: SOURCE_STATE_AUTHORITY,
        historicalCorpus, parentCorpus, expectedCorpus, expectedSources, changedFactKeys,
        financial_authority: false, implementation_approved: false });
    chains.add(cached);
    return cached;
}

function createHistoricalAuthoringReader(readCurrent, chain = buildHistoricalAuthoringChain()) {
    if (typeof readCurrent !== 'function' || !chains.has(chain)) fail('authority');
    let currentCorpus;
    try { currentCorpus = JSON.parse(readCurrent(PREFIX + 'graphs-v2.json')); }
    catch { fail('graph_mismatch'); }
    if (!isDeepStrictEqual(currentCorpus, chain.expectedCorpus)) fail('graph_mismatch');
    for (const [file, expected] of Object.entries(chain.expectedSources)) {
        if (readCurrent(file) !== expected) fail('authority_mismatch');
    }
    // Capture the verified successor once. The historical view is immutable
    // input for historical assertions, never an edited/current runtime graph.
    return file => {
        if (file === PREFIX + 'graphs-v2.json') return JSON.stringify(chain.historicalCorpus);
        const historical = historicalSource(file);
        const expected = chain.expectedSources[file] || historical;
        if (readCurrent(file) !== expected) fail('authority_mismatch');
        return historical;
    };
}

module.exports = { buildHistoricalAuthoringChain, createHistoricalAuthoringReader };
