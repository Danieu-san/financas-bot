'use strict';
// HARNESS-only reference. No metric kernel, guest, observed R or proof is an
// input to sealing. This is never an oracle/operand supplied to the evaluator.
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { admittedDocuments } = require('../../src/next/provenance/packageContract');
const { canonicalValue, freezeDeep } = require('../../src/next/kernel/canonicalValue');
const { copyData } = require('../../src/next/provenance/observationContract');
const receipts = new WeakMap();
const prefix = 'docs/contracts/next/provenance-v2/';
const equal = (a, b) => canonicalValue(a) === canonicalValue(b);
const hash = value => 'sha256:' + createHash('sha256').update(canonicalValue(value)).digest('hex');
const fail = code => { throw new Error('source_state_reference_' + code); };
const oraclePath = path.resolve(__dirname, '../../tests/fixtures/financasbot-next/golden-claim-oracles-v1.json');
const oracleSource = () => fs.readFileSync(oraclePath, 'utf8').replaceAll('\r\n', '\n');
const bytesHash = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const documents = receipt => new Map(admittedDocuments(receipt).map(row => [row.path, row]));
const worldHash = receipt => hash(admittedDocuments(receipt).map(row => [row.path, row.sha256]));
const nominal = value => typeof value === 'string' ? value : value?.ref_id;

function normalizeGraph(candidate, baseline) {
    const value = structuredClone(candidate);
    value.snapshot_manifest.hash = baseline.snapshot_manifest.hash;
    if (value.graphs.length !== baseline.graphs.length) fail('graph_structure');
    value.graphs.forEach((graph, index) => {
        const original = baseline.graphs[index];
        if (graph.fact_key !== original.fact_key || !equal(Object.keys(graph.nodes), Object.keys(original.nodes))) fail('graph_structure');
        for (const [alias, node] of Object.entries(original.nodes)) if (node.binding === 'snapshot') {
            graph.nodes[alias].version = node.version;
            graph.nodes[alias].semantic_fingerprint = node.semantic_fingerprint;
        }
        if (graph.predicates.length !== original.predicates.length) fail('predicate_structure');
        original.predicates.forEach((predicate, position) => {
            if (predicate.op === 'fingerprint_is') {
                const target = graph.predicates[position];
                if (target.id !== predicate.id || !target.args?.[1]?.literal) fail('predicate_structure');
                target.args[1].literal.value = predicate.args[1].literal.value;
            }
        });
    });
    if (!equal(value, baseline)) fail('graph_structure');
}

// Independent reference selection over plain synthetic snapshots. Does not
// call selectConsumption/evaluateDirectMetric or construct expected from R.
function eligibleCount(graph, claim, snapshots) {
    const byIdentity = new Map();
    for (const snapshot of snapshots) {
        const key = snapshot.kind + '/' + snapshot.ref_id;
        if (byIdentity.has(key)) fail('identity');
        byIdentity.set(key, snapshot.payload);
    }
    const payload = alias => {
        const node = graph.nodes[alias];
        const result = byIdentity.get(node.kind + '/' + node.ref_id);
        if (!result || result.id !== node.ref_id) fail('identity');
        return result;
    };
    const family = payload(claim.operand_bindings.family.alias);
    const categories = new Map(claim.operand_bindings.categories.aliases.map(alias => {
        const row = payload(alias); return [row.id, row];
    }));
    const s = claim.subject;
    const category = s.kind === 'category' ? s.ref_id : s.category_id;
    const person = s.kind === 'person_category' ? s.person_id : undefined;
    const expectedFamily = s.kind === 'family_category' ? s.family_id : family.id;
    if (!['category', 'person_category', 'family_category'].includes(s.kind)
        || !categories.has(category) || expectedFamily !== family.id
        || claim.period.kind !== 'month' || claim.time_basis !== 'event_date') fail('functional_scope');
    const members = new Set(family.members.map(nominal));
    const ids = new Set(); let count = 0;
    for (const alias of claim.operand_bindings.events.aliases) {
        const event = payload(alias);
        if (ids.has(event.id)) fail('identity');
        ids.add(event.id);
        const own = categories.get(nominal(event.category_id));
        if (!own) fail('functional_category');
        let effective = own;
        if (own.kind === 'compensation') {
            const original = byIdentity.get('event/' + nominal(event.compensates));
            effective = original && categories.get(nominal(original.category_id));
            if (effective?.kind !== 'expense') fail('functional_compensation');
        }
        if (event.state === 'confirmed' && event.date.slice(0, 7) === claim.period.value
            && (person ? nominal(event.person_id) === person : members.has(nominal(event.person_id)))
            && ['expense', 'compensation'].includes(own.kind) && effective.id === category) count++;
    }
    const source = payload(claim.operand_bindings.source.alias);
    if (!Number.isSafeInteger(source.event_count) || source.event_count < 0
        || Object.is(source.event_count, -0) || source.event_count !== count) fail('functional_count');
    return count;
}

function sealSourceStateReference({ baselineReceipt, mutantReceipt, requirement }) {
    const target = copyData(requirement.target);
    // The positive oracle is fixed project evidence, not a caller's R/expected.
    const sealedOracleSource = oracleSource();
    const oracles = JSON.parse(sealedOracleSource);
    const [conversation, turn, ordinal] = target.fact_key.split('#');
    const oracle = oracles.turns?.[conversation + '#' + turn]?.facts?.[Number(ordinal) - 1];
    if (oracles.synthetic !== true || !oracle) fail('oracle_identity');
    const before = documents(baselineReceipt); const after = documents(mutantReceipt);
    if (!equal([...before.keys()], [...after.keys()])) fail('documents');
    const corpus = before.get(prefix + 'graphs-v2.json').value;
    const mutantCorpus = after.get(prefix + 'graphs-v2.json').value;
    normalizeGraph(mutantCorpus, corpus);
    const graph = corpus.graphs.find(row => row.fact_key === target.fact_key);
    const claims = before.get(corpus.claim_contract.path).value;
    if (!equal(after.get(corpus.claim_contract.path).value, claims)) fail('claim_changed');
    const claim = claims.claims.find(row => row.fact_key === graph.fact_key);
    const predicate = graph.predicates.find(row => row.id === target.predicate_id);
    const field = predicate?.args?.[0]?.field;
    if (requirement.family !== 'predicate_atom' || predicate?.op !== 'eq'
        || target.operator !== 'eq' || !['period', 'coverage'].includes(target.atom)
        || predicate.atom !== target.atom || predicate.obligation !== target.obligation
        || field?.segments.length !== 1 || graph.nodes[field.node]?.kind !== 'source_state') fail('coordinate');
    const name = field.segments[0]; const node = graph.nodes[field.node];
    const manifest = before.get(corpus.snapshot_manifest.path).value;
    const mutantManifest = after.get(corpus.snapshot_manifest.path).value;
    const normalized = structuredClone(mutantManifest);
    if (normalized.snapshots.length !== manifest.snapshots.length || normalized.sources.length !== manifest.sources.length) fail('snapshot_structure');
    let changedSource;
    normalized.snapshots.forEach((snapshot, index) => {
        const original = manifest.snapshots[index];
        snapshot.version = original.version; snapshot.semantic_fingerprint = original.semantic_fingerprint;
        if (original.kind === node.kind && original.ref_id === node.ref_id && original.version === node.version) {
            if (changedSource || snapshot.payload[name] === original.payload[name]) fail('content_mutation');
            changedSource = mutantManifest.snapshots[index];
            snapshot.payload[name] = original.payload[name];
        }
    });
    normalized.sources.forEach((row, index) => { row.sha256 = manifest.sources[index].sha256; });
    if (!changedSource || !equal(normalized, manifest)) fail('secondary_mutation');
    const sourcePath = manifest.sources.find(row => row.sha256 === node.version)?.path;
    if (!sourcePath) fail('source');
    const sourceBefore = before.get(sourcePath).value;
    const sourceAfter = structuredClone(after.get(sourcePath).value);
    const author = changedSource.authorship;
    const records = sourceAfter[author.collection];
    const record = records?.filter(row => row.id === author.record_id);
    if (record?.length !== 1 || record[0][name] !== changedSource.payload[name]) fail('source');
    record[0][name] = manifest.snapshots.find(row => row.kind === node.kind && row.ref_id === node.ref_id).payload[name];
    if (!equal(sourceAfter, sourceBefore)) fail('secondary_source_mutation');
    const mutable = new Set([prefix + 'graphs-v2.json', corpus.snapshot_manifest.path, sourcePath]);
    for (const [file, row] of before) if (!mutable.has(file) && after.get(file).sha256 !== row.sha256) fail('authority_changed');

    let value; let law;
    if (claim.metric === 'source_coverage') {
        const sourceNode = graph.nodes[claim.operand_bindings.source.alias];
        if (sourceNode.ref_id !== claim.subject.ref_id) fail('functional_scope');
        const source = mutantManifest.snapshots.filter(row => row.kind === 'source_state' && row.ref_id === sourceNode.ref_id);
        if (source.length !== 1 || !['complete', 'partial', 'unavailable'].includes(source[0].payload.coverage)) fail('functional_enum');
        value = source[0].payload.coverage; law = 'nominal_source_literal_coverage';
    } else if (claim.metric === 'eligible_event_count') {
        value = eligibleCount(graph, claim, mutantManifest.snapshots); law = 'independent_fixture_eligible_cardinality';
    } else {
        if (graph.trace_contract.derivation.required_reads.some(row => row.node === field.node && row.segments[0] === name)) fail('reference_unavailable');
        value = oracle.value; law = 'unchanged_functional_inputs_frozen_positive_oracle';
    }
    if (oracle.metric !== claim.metric || oracle.unit !== claim.unit) fail('oracle_identity');
    const registry = before.get(corpus.metric_evaluator_registry.path).value;
    const entry = registry.entries.find(row => row.evaluator_id === claim.evaluator_ref.evaluator_id
        && row.evaluator_version === claim.evaluator_ref.evaluator_version);
    if (!entry) fail('functional_contract');
    const kind = before.get(entry.contract_path).value.signature.output.kind;
    const result = freezeDeep({ kind, value, unit: claim.unit });
    const state = { target, targetRead: field, result, oracle: freezeDeep({ kind, value: oracle.value, unit: oracle.unit }), law,
        oracleSourceHash: bytesHash(sealedOracleSource),
        mutantWorldHash: worldHash(mutantReceipt), baselineWorldHash: worldHash(baselineReceipt),
        referenceHash: hash(result), consumed: false };
    const receipt = Object.freeze(Object.create(null)); receipts.set(receipt, state); return receipt;
}

// All admission/compiler/host exceptions remain UNSATISFIED in the caller.
// Successful capture still requires every non-predicate barrier below.
function qualifySourceStateNegative({ referenceReceipt, mutantReceipt, observed, coverage, predicates,
    baselinePredicates, expectedViolations, executionId }) {
    const state = receipts.get(referenceReceipt);
    if (!state || state.consumed || worldHash(mutantReceipt) !== state.mutantWorldHash
        || bytesHash(oracleSource()) !== state.oracleSourceHash) fail('seal');
    state.consumed = true; // one captured execution per inventory coordinate
    const rejected = new Set();
    const falsePredicates = predicates.results.filter(row => !row.satisfied);
    falsePredicates.forEach(row => rejected.add(row.atom));
    const referenceMatched = equal(observed.functional_result, state.result);
    const positiveMatched = equal(observed.functional_result, state.oracle);
    if (!referenceMatched) rejected.add('evaluator');
    for (const phase of Object.values(coverage)) {
        if (!phase.matched) rejected.add('trace');
        if (!phase.components.selection.matched || !phase.components.operand_sets.matched) rejected.add('evidence_set');
        if (!phase.components.measurements.matched) rejected.add('evaluator');
        if (!phase.components.access_metadata.matched) rejected.add('identity');
        if (!phase.components.civil_dates.matched) rejected.add('period');
        if (phase.components.read_edges.mismatches.some(row => row.dimension === 'edges')) rejected.add('edge');
    }
    const targetFalse = falsePredicates.some(row => row.id === state.target.predicate_id && row.atom === state.target.atom);
    const othersPreserved = equal(predicates.results.filter(row => row.atom !== state.target.atom),
        baselinePredicates.results.filter(row => row.atom !== state.target.atom));
    const proofRan = observed.trace?.execution_id === executionId && observed.trace.proof_trace.length > 0;
    const targetReadObserved = proofRan && observed.trace.proof_trace.some(row => row.operation === 'get'
        && row.alias === state.targetRead.node && equal(row.path, state.targetRead.segments));
    const observedAtoms = [...rejected].sort();
    const qualified = equal(expectedViolations, [state.target.atom]) && equal(observedAtoms, [state.target.atom])
        && targetFalse && othersPreserved && targetReadObserved && observed.proof_satisfied === false
        && observed.graph_accepted === false && Object.values(coverage).every(row => row.matched) && referenceMatched;
    return freezeDeep({ positive_oracle_matched: positiveMatched, counterfactual_reference_matched: referenceMatched,
        proof_satisfied: observed.proof_satisfied, negative_witness_qualified: qualified,
        observed_violations: observedAtoms, target_predicate_false: targetFalse,
        target_read_observed: targetReadObserved, other_atoms_preserved: othersPreserved,
        oracle_sha256: state.oracleSourceHash,
        reference_law: state.law, reference_sha256: state.referenceHash,
        sealed_inputs_sha256: state.mutantWorldHash, sealed_baseline_sha256: state.baselineWorldHash,
        execution_id: executionId, graph_accepted: false, financial_receipt: false });
}
module.exports = { sealSourceStateReference, qualifySourceStateNegative };
