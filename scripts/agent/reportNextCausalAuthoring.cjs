'use strict';

// Offline adapter only: old authored expectations are compared AFTER candidate
// generation. This file never executes a metric or applies a normative delta.
const { createHash } = require('node:crypto');
const { canonicalValue } = require('../../src/next/kernel/canonicalValue');
const { projectAuthoringInputs, generateAuthoringCandidate } = require('./nextCausalAuthoring.cjs');
const hash = text => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const prefix = 'docs/contracts/next/provenance-v2/';
const profiles = {
    consumption_by_instrument: prefix + 'causal-authoring-candidates/consumption-by-instrument-profile-v1.json',
    statement_total: prefix + 'causal-authoring-candidates/statement-total-profile-v1.json'
};

function buildCandidateReport(read) {
    if (typeof read !== 'function') throw new Error('authoring_report_reader');
    const texts = new Map();
    const load = path => {
        if (typeof path !== 'string' || path.length > 512 || !path.endsWith('.json')
            || path.split('/').some(part => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part) || part.endsWith('.'))) throw new Error('authoring_report_path');
        if (!texts.has(path)) {
            const content = read(path);
            if (typeof content !== 'string' || Buffer.byteLength(content) > 8 * 1024 * 1024) throw new Error('authoring_report_document');
            texts.set(path, content);
        }
        return JSON.parse(texts.get(path));
    };
    const graphPath = prefix + 'graphs-v2.json'; const claimPath = prefix + 'claims-v2.json';
    const corpus = load(graphPath); const claims = load(claimPath).claims;
    const registry = load(prefix + 'metric-evaluator-registry-v1.json');
    const snapshots = load(prefix + 'snapshot-manifest-v1.json');
    if (!Array.isArray(corpus.graphs) || !Array.isArray(claims)) throw new Error('authoring_report_corpus');
    const sourceDigest = hash(canonicalValue(corpus)); const claimsDigest = hash(canonicalValue(claims));
    const graphs = new Map(); const claimIds = new Set();
    for (const graph of corpus.graphs) {
        if (graphs.has(graph.fact_key)) throw new Error('authoring_report_duplicate_graph');
        graphs.set(graph.fact_key, graph);
    }
    for (const claim of claims) {
        if (claimIds.has(claim.fact_key) || !graphs.has(claim.fact_key)) throw new Error('authoring_report_claim_identity');
        claimIds.add(claim.fact_key);
    }
    if (claimIds.size !== graphs.size) throw new Error('authoring_report_claim_inventory');
    const authorityBundles = new Map(); const records = [];
    for (const claim of claims) {
        if (!Object.hasOwn(profiles, claim.metric)) continue;
        if (!authorityBundles.has(claim.metric)) {
            const entries = registry.entries.filter(e => e.metric === claim.metric);
            if (entries.length !== 1) throw new Error('authoring_report_evaluator');
            const paths = { claim_schema: prefix + 'claim-contract.schema.json', snapshot_schema: prefix + 'evidence-snapshot.schema.json',
                material_registry: prefix + 'material-field-registry-v1.json', metric_registry: prefix + 'metric-evaluator-registry-v1.json',
                evaluator_contract: entries[0].contract_path, profile: profiles[claim.metric], snapshot_manifest: prefix + 'snapshot-manifest-v1.json' };
            const documentPaths = [...Object.values(paths), ...snapshots.sources.map(s => s.path)];
            for (const path of documentPaths) load(path);
            const ref = path => ({ path, sha256: hash(texts.get(path)) });
            const manifest = { ...Object.fromEntries(Object.entries(paths).map(([slot, path]) => [slot, ref(path)])),
                snapshot_sources: snapshots.sources.map(s => ref(s.path)) };
            authorityBundles.set(claim.metric, { manifest, documents: documentPaths.map(path => ({ path, content: texts.get(path) })) });
        }
        const graph = graphs.get(claim.fact_key); const bundle = authorityBundles.get(claim.metric);
        // No old expected object crosses this call boundary.
        const projected = projectAuthoringInputs(JSON.stringify(graph), JSON.stringify(claim));
        const candidate = JSON.parse(generateAuthoringCandidate(projected, JSON.stringify(bundle.manifest), JSON.stringify({ documents: bundle.documents })));
        // Only now inspect old obligations. Every removal needs review: absence
        // from a proposed program is NOT authorization to delete an obligation.
        const delta = {};
        for (const [dimension, values] of Object.entries(candidate.obligations)) {
            const old = graph.trace_contract?.derivation?.[dimension];
            if (!Array.isArray(old)) throw new Error('authoring_report_old_dimension');
            const oldKeys = new Set(old.map(value => canonicalValue(value))); const newKeys = new Set(values.map(value => canonicalValue(value)));
            delta[dimension] = {
                added: values.filter(value => !oldKeys.has(canonicalValue(value))).map(value => ({ value,
                    reasons: candidate.justifications.find(j => j.dimension === dimension && canonicalValue(j.obligation) === canonicalValue(value)).reasons })),
                removed: old.filter(value => !newKeys.has(canonicalValue(value))).map(value => ({ value,
                    review_required: true, reason: 'not_emitted_by_proposed_profile_not_authorized_for_removal' }))
            };
        }
        const protectedGraph = structuredClone(graph);
        for (const dimension of Object.keys(candidate.obligations)) delete protectedGraph.trace_contract.derivation[dimension];
        records.push({ fact_key: claim.fact_key, metric: claim.metric, source_graph_sha256: hash(canonicalValue(graph)),
            protected_graph_sha256: hash(canonicalValue(protectedGraph)), candidate, delta });
    }
    if (hash(canonicalValue(corpus)) !== sourceDigest || hash(canonicalValue(claims)) !== claimsDigest) throw new Error('authoring_report_mutated_source');
    const totals = {};
    for (const record of records) for (const [dimension, delta] of Object.entries(record.delta)) {
        if (!totals[dimension]) totals[dimension] = { added: 0, removed: 0 };
        totals[dimension].added += delta.added.length; totals[dimension].removed += delta.removed.length;
    }
    return { stage: 'offline_candidate_diff_not_acceptance', graph_accepted: false, normative_application_allowed: false,
        source_graphs: corpus.graphs.length, candidate_graphs: records.length, outside_profile_unchanged: corpus.graphs.length - records.length,
        entire_input_corpus_unchanged: true, claims_unchanged: true, source_corpus_sha256: sourceDigest, source_claims_sha256: claimsDigest,
        documents: [...texts.entries()].map(([path, bytes]) => ({ path, sha256: hash(bytes) })).sort((a, b) => a.path < b.path ? -1 : 1),
        authority_manifests: Object.fromEntries([...authorityBundles].map(([metric, bundle]) => [metric, bundle.manifest])), totals, records };
}

function main() {
    const fs = require('node:fs'); const path = require('node:path');
    const root = path.resolve(__dirname, '../..'); const argv = process.argv.slice(2);
    const usage = 'Usage: node scripts/agent/reportNextCausalAuthoring.cjs [--output .codex-temp/<new-file>.json]';
    if (argv.length !== 0 && !(argv.length === 2 && argv[0] === '--output')) throw new Error(usage);
    let output;
    if (argv.length) {
        output = path.resolve(root, argv[1]); const temp = path.join(root, '.codex-temp');
        if (path.dirname(output) !== temp || !output.endsWith('.json') || !fs.existsSync(temp)
            || fs.lstatSync(temp).isSymbolicLink() || fs.existsSync(output)) throw new Error(usage);
    }
    // Explicit synthetic-fixture convention, NOT a measurement of raw host
    // bytes. The manifest pins the resulting LF documents given to the kernel.
    const report = buildCandidateReport(file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n'));
    report.transport = 'synthetic_fixture_utf8_lf_not_authenticated_host';
    if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ stage: report.stage, graph_accepted: false, normative_application_allowed: false,
        source_graphs: report.source_graphs, candidate_graphs: report.candidate_graphs, outside_profile_unchanged: report.outside_profile_unchanged,
        entire_input_corpus_unchanged: report.entire_input_corpus_unchanged, totals: report.totals, output: output || null }, null, 2));
}

if (require.main === module) {
    try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { buildCandidateReport };
