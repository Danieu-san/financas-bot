'use strict';
// Unit tests of negative classification, not independent host execution proof.
// sourceStateMatrix.cases separately exercises the real isolated D/P path.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { admitPackage, admittedDocuments } = require('../../../src/next/provenance/packageContract');
const mutations = require('../../../src/next/provenance/mutationWitnesses');
const { sealSourceStateReference, qualifySourceStateNegative } = require('../../../scripts/agent/sourceStateNegativeReference.cjs');
const root = path.resolve(__dirname, '../../..');
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
let cached;
async function fixture() {
    if (cached) return cached;
    const { loadLocalAuthoringPackage } = await import(pathToFileURL(path.join(root,
        'scripts/agent/executeNextDomainInvariantMatrix.mjs')).href);
    const baselineReceipt = loadLocalAuthoringPackage();
    const entries = admittedDocuments(baselineReceipt).map(row => ({ path: row.path,
        bytes: Buffer.from(fs.readFileSync(path.join(root, row.path), 'utf8').replaceAll('\r\n', '\n')) }));
    const generated = mutations.materializeEnumEqualityMutation({ packageReceipt: baselineReceipt,
        fact_key: 'S-16#1#1', predicate_id: 'binding_11' });
    const changes = new Map(generated.changes.map(row => [row.path, row.source]));
    const mutantEntries = entries.map(row => ({ path: row.path,
        bytes: changes.has(row.path) ? Buffer.from(changes.get(row.path)) : Buffer.from(row.bytes) }));
    const mutantReceipt = admitPackage({ entries: mutantEntries,
        authority: mutantEntries.map(row => ({ path: row.path, sha256: sha(row.bytes) })) });
    const requirement = { family: 'predicate_atom', mutation_id: generated.mutation_id, target: generated.target };
    cached = { baselineReceipt, mutantReceipt, mutantEntries, generated, requirement };
    return cached;
}
function argumentsFor(f) {
    const falseRows = ['binding_11', 'r0004_include_coverage'].map(id => ({ id,
        obligation: 'coverage', atom: 'coverage', satisfied: false }));
    const good = () => ({ matched: true });
    const phase = () => ({ matched: true, components: { selection: good(), operand_sets: good(),
        measurements: good(), access_metadata: good(), civil_dates: good(), read_edges: { mismatches: [] } } });
    return { referenceReceipt: sealSourceStateReference(f), mutantReceipt: f.mutantReceipt,
        observed: { graph_accepted: false, proof_satisfied: false,
            functional_result: { unit: 'state', kind: 'enum', value: f.generated.patch.after },
            trace: { execution_id: 'unit-negative', proof_trace: [{ operation: 'get',
                alias: f.generated.patch.alias, path: ['coverage'] }] } },
        coverage: { derivation: phase(), proof: phase() }, predicates: { results: falseRows },
        baselinePredicates: { results: falseRows.map(row => ({ ...row, satisfied: true })) },
        expectedViolations: ['coverage'], executionId: 'unit-negative' };
}

test('N02G:SOURCE-STATE-REFERENCE-001 frozen counterfactual is separate from positive oracle and single-use', async () => {
    const f = await fixture(); const args = argumentsFor(f);
    const result = qualifySourceStateNegative(args);
    assert.equal(result.negative_witness_qualified, true);
    assert.equal(result.positive_oracle_matched, false);
    assert.equal(result.counterfactual_reference_matched, true);
    assert.equal(result.proof_satisfied, false);
    assert.equal(result.graph_accepted, false); assert.equal(result.financial_receipt, false);
    assert.deepEqual(result.observed_violations, ['coverage']);
    assert.match(result.reference_sha256, /^sha256:[a-f0-9]{64}$/);
    assert.throws(() => qualifySourceStateNegative(args), /reference_seal/);
    assert.throws(() => qualifySourceStateNegative({ ...argumentsFor(f), referenceReceipt: {} }), /reference_seal/);
    assert.throws(() => qualifySourceStateNegative({ ...argumentsFor(f), mutantReceipt: f.baselineReceipt }), /reference_seal/);
});

test('N02G:SOURCE-STATE-REFERENCE-002 every collateral barrier and generic failure prevents qualification', async () => {
    const f = await fixture();
    const corruptions = [
        a => { a.expectedViolations = ['period']; },
        a => { a.observed.functional_result.value = 'complete'; },
        a => { a.observed.functional_result.value = 'unavailable'; },
        a => { a.observed.proof_satisfied = undefined; },
        a => { a.observed.trace.proof_trace = []; },
        a => { a.observed.trace.proof_trace[0].path = ['period']; },
        a => { a.observed.graph_accepted = true; },
        a => { a.predicates.results[0].id = 'wrong-coordinate'; },
        a => { a.predicates.results.push({ id: 'secondary-period', atom: 'period', satisfied: false }); },
        a => { a.predicates.results.push({ id: 'bad-fingerprint', atom: 'fingerprint', satisfied: false }); },
        a => { a.coverage.proof.matched = false; },
        ...['selection', 'operand_sets', 'measurements', 'access_metadata', 'civil_dates'].map(name =>
            a => { a.coverage.proof.components[name].matched = false; a.coverage.proof.matched = false; })
    ];
    for (const corrupt of corruptions) {
        const args = argumentsFor(f); corrupt(args);
        assert.equal(qualifySourceStateNegative(args).negative_witness_qualified, false);
    }
});

test('N02G:SOURCE-STATE-REFERENCE-003 strategy mutation and secondary material changes cannot obtain a reference', async () => {
    const f = await fixture();
    assert.throws(() => sealSourceStateReference({ ...f, requirement: { ...f.requirement,
        family: 'predicate_strategy' } }), /reference_coordinate/);
    for (const kind of ['operator', 'secondary']) {
        const entries = f.mutantEntries.map(row => ({ path: row.path, bytes: Buffer.from(row.bytes) }));
        const graphEntry = entries.find(row => row.path.endsWith('/graphs-v2.json'));
        const corpus = JSON.parse(graphEntry.bytes);
        if (kind === 'operator') {
            corpus.graphs.find(row => row.fact_key === 'S-16#1#1').predicates.find(row => row.id === 'binding_11').op = 'not_eq';
            graphEntry.bytes = Buffer.from(JSON.stringify(corpus));
        } else {
            const manifestEntry = entries.find(row => row.path === corpus.snapshot_manifest.path);
            const manifest = JSON.parse(manifestEntry.bytes);
            manifest.snapshots.find(row => row.ref_id === f.generated.patch.alias.replaceAll('_', '-')).payload.period = '2042-07';
            manifestEntry.bytes = Buffer.from(JSON.stringify(manifest));
        }
        const mutantReceipt = admitPackage({ entries, authority: entries.map(row => ({ path: row.path, sha256: sha(row.bytes) })) });
        assert.throws(() => sealSourceStateReference({ ...f, mutantReceipt }),
            /reference_(graph_structure|secondary_mutation)/);
    }
});
