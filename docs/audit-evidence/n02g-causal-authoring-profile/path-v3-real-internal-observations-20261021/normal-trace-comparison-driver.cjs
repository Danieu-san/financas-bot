'use strict';
// Mechanical post-processing of the ONE completed invocation. No guest run,
// new semantic engine, altered observation, inferred authority or credit.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const output = path.join(__dirname, 'b4-02-internal-coverage-normal-20261021.json');
assert.equal(fs.existsSync(output), false, 'comparison_already_recorded');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
// Same null-prototype data -> plain JSON serialization used by the existing
// captured transport. The first reader rejection remains separately recorded.
const plain = value => JSON.parse(JSON.stringify(value));
const read = relative => fs.readFileSync(path.join(root, relative));
const fixed = (relative, expected) => {
    const bytes = read(relative); assert.equal(sha(bytes), expected, relative); return bytes;
};
const report = { format: 'financasbot.path-v3.existing-normal-coverage-local', version: 1,
    started_at: new Date().toISOString(), candidate: 'e4af6912c83d04c1d827c03b24aa90ab80043f39',
    guest_reexecuted: false, qualified: false, semantic_mutation_credit: 0,
    financial_acceptance: false, globalGO: false, NEXT03: false, phases: [] };
let measured;
function sources() {
    const mismatches = measured.files.filter(row => sha(read(row.path)) !== row.sha256).map(row => row.path);
    assert.deepEqual(mismatches, [], 'reviewed_source_drift');
    return { count: measured.files.length, sha256: measured.sha256, mismatches };
}
(async () => {
    assert.equal(process.version, 'v22.17.0');
    const observations = JSON.parse(fixed('.codex-temp/b4-02-internal-observations-20261021.json',
        '762d1859a4702a584ae068ca59a7cf07f8f9173dc80d830b04054b9d10b18119'));
    const build = JSON.parse(fixed('.codex-temp/b4-02-reviewed-normal-build-20261021.json',
        '4b118acd391cf9407ef8510d29cdd113a43ec64eaa964b36a2d2f7650559db8e'));
    const base = '.codex-temp/b4-02-operational-provisioning-20261021/';
    const payload = JSON.parse(fixed(base + 'execution-payload.json',
        'b9132fb2bd1099194a1e3b8827c9c804075d92e2b280af7fceca5ba11f7022b3'));
    const freeze = JSON.parse(fixed(base + 'proposed-execution-freeze.json',
        '5c6647ba3d13403790ff19aacf006549bf1dc742987bee87b2420d7710ccaec6'));
    const wide = JSON.parse(fixed('.codex-temp/b4-02-path-v3-final-wide-20261019.json',
        '42e6126d4c3f321534d72b7584951d9d4aa6a6c794e889618d9934589f35a866'));
    measured = wide.measured_sources_after;
    assert.equal(measured.files.length, 895);
    assert.equal(sha(JSON.stringify(measured.files)), '183ba87724616c2226e7b1893fb8c3b5fa978631b116d99d23307ec9e782a6d7');
    report.sources_before = sources();
    const { loadLocalAuthoringPackage } = await import(pathToFileURL(path.join(root,
        'scripts/agent/executeNextDomainInvariantMatrix.mjs')).href);
    const { buildAdmittedSchemaValidators } = await import(pathToFileURL(path.join(root,
        'scripts/agent/buildNextProvenanceArtifacts.mjs')).href);
    const { admittedDocuments } = require('../src/next/provenance/packageContract');
    const { compileSnapshotAccess } = require('../src/next/provenance/graphCompiler');
    const { comparePhaseCoverage } = require('../src/next/provenance/proofAcceptance');
    const { canonicalValue } = require('../src/next/kernel/canonicalValue');
    // Existing normal projection API, only metadata/transport methods. No
    // openProof/openDerivation/inspectProofPredicates or execution API is called.
    const receipt = loadLocalAuthoringPackage();
    const documents = admittedDocuments(receipt);
    const authority = documents.map(({ path, sha256 }) => ({ path, sha256 }));
    assert.equal(canonicalValue(authority), canonicalValue(freeze.package_authority), 'preexisting_authored_bytes');
    const plan = compileSnapshotAccess(receipt, buildAdmittedSchemaValidators(receipt).validators);
    const corpus = documents.find(row => row.path.endsWith('/graphs-v2.json')).value;
    const graph = corpus.graphs.find(row => row.fact_key === 'S-01#1#1');
    const claim = documents.find(row => row.path === corpus.claim_contract.path).value.claims
        .find(row => row.fact_key === graph.fact_key);
    assert.ok(graph && claim);
    const selector = { fact_key: graph.fact_key };
    const metric = plan.projectMetricTransport(selector);
    const proof = plan.projectProofTransport(selector).config;
    const derivation = { bindings: [], derivationBindings: plan.projectDerivationBindings(selector),
        directGroups: metric.directGroups, nodeSets: metric.nodeSets, parentGroups: metric.parentGroups };
    const oracleSource = read('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json');
    const oracle = JSON.parse(oracleSource).turns['S-01#1'].facts[0];
    report.oracle_source_sha256 = sha(oracleSource);
    report.expected = { origin: 'unchanged_preexecution_authored_package_and_reviewed_freeze_payload',
        graph: graph.fact_key, reference: build.result.reference,
        phase_contract_sha256: sha(canonicalValue(graph.trace_contract)),
        package_authority_sha256: sha(canonicalValue(authority)) };
    report.worlds = [];
    for (const world of payload.worlds) {
        assert.equal(canonicalValue(world.derivation), canonicalValue(plain(derivation)), 'normal_derivation_projection');
        assert.equal(canonicalValue(world.proof), canonicalValue(plain(proof)), 'normal_proof_projection');
        const actual = observations.observations.observations.find(row => row.variant === world.variant);
        assert.ok(actual);
        const proofRoot = freeze.proof_programs.find(row => row.program_id === world.proof_program_id).proof_engine_artifact_root;
        const metricRoot = 'sha256:' + sha(world.metric_artifact.manifest);
        const contractHash = 'sha256:' + sha(world.contract_source);
        const result = actual.result;
        assert.equal(result.observed_validation_tcb_root, freeze.validation_tcb_root);
        assert.equal(result.observed_child_capsule_root, freeze.child_capsule_root);
        assert.equal(result.observed_evaluator_artifact_root, metricRoot);
        assert.equal(result.observed_evaluator_contract_hash, contractHash);
        assert.equal(result.observed_proof_engine_artifact_root, proofRoot);
        report.worlds.push({ variant: world.variant, execution_id: actual.execution_id,
            proof_satisfied: result.proof_satisfied,
            independent_reference_boolean_matched: result.proof_satisfied === (world.variant === 'M'
                ? build.result.reference.mutant_satisfied : build.result.reference.baseline_satisfied),
            oracle_matched: oracle.metric === claim.metric && oracle.unit === result.functional_result.unit
                && canonicalValue(oracle.value) === canonicalValue(result.functional_result.value),
            functional_result: result.functional_result, roots_matched: true });
        for (const phase of ['derivation', 'proof']) {
            const { evidence_set_mode, ...expected } = graph.trace_contract[phase];
            const isProof = phase === 'proof';
            const bindings = isProof ? proof.proofSelections.map(row => ({ role: `proof/set/${row.candidate_set}`, ...row }))
                : expected.required_selections.map(selection => {
                    const roles = Object.entries(claim.operand_bindings).filter(([, row]) => row.kind === 'node_set'
                        && canonicalValue(row.aliases) === canonicalValue(graph.sets[selection.candidate_set]));
                    assert.equal(roles.length, 1); return { role: roles[0][0], ...selection };
                });
            const operandSets = isProof ? proof.proofSets.map(row => ({ role: `proof/set/${row.name}`, aliases: row.roster }))
                : Object.entries(claim.operand_bindings).filter(([, row]) => row.kind === 'node_set')
                    .map(([role, row]) => ({ role, aliases: row.aliases }));
            const measurements = [{ measurement: 'validation_tcb_root', observed: freeze.validation_tcb_root },
                { measurement: 'proof_engine_artifact_root', observed: proofRoot },
                ...(!isProof ? [{ measurement: 'evaluator_artifact_root', observed: metricRoot },
                    { measurement: 'evaluator_contract_hash', observed: contractHash }] : [])];
            const row = { variant: world.variant, phase, original_trace_events: result.trace[`${phase}_trace`].length };
            try {
                row.coverage = comparePhaseCoverage({ trace: result.trace, executionId: actual.execution_id,
                    invocationId: build.result.invocation_id, phase, expected, sets: graph.sets, bindings, operandSets,
                    accessBindings: plan.observationMetadata({ fact_key: graph.fact_key, phase }), measurements });
            } catch (error) { row.error = { name: error.name, message: error.message }; }
            report.phases.push(row);
        }
    }
    report.stage = report.phases.every(row => row.coverage?.matched === true)
        ? 'existing_phase_comparison_complete_not_qualification' : 'existing_phase_comparison_not_closed';
    if (report.stage === 'existing_phase_comparison_not_closed') process.exitCode = 1;
})().catch(error => { report.stage = 'comparison_failed_without_guest_retry';
    report.error = { name: error.name, message: error.message }; process.exitCode = 1;
}).finally(() => {
    if (measured) { try { report.sources_after = sources(); } catch (error) {
        report.source_error = error.message; process.exitCode = 1; } }
    report.completed_at = new Date().toISOString();
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ stage: report.stage, error: report.error,
        worlds: report.worlds, phases: report.phases.map(row => ({ variant: row.variant, phase: row.phase,
            events: row.original_trace_events, matched: row.coverage?.matched, error: row.error })),
        guest_reexecuted: false, qualified: false, semantic_mutation_credit: 0 }));
});
